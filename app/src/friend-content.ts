// Bibliothèque partagée entre amis (packages/core/src/friendlibrary.ts) sur le réseau des
// bornes (social-net.ts) : ce service sert ma bibliothèque à mes amis quand je la partage
// (activée par défaut), et va chercher la leur : leurs médias, et leurs tables entières, partie
// par partie (table, fronton, ROM si le joueur la coche, PuP-Pack, sons…).
//
// Rien de reçu n'entre directement dans la borne :
// - un média va dans <données>\amis\recus\, n'en sort que s'il a la taille et l'empreinte
//   SHA-256 annoncées et des premiers octets qui disent un média de son type (checkShareable),
//   puis entre dans le brouillon des médias de la table (rien n'est rangé sans l'utilisateur) ;
// - les fichiers d'une table vont dans <données>\amis\tables\<date>\<dossier de la table>\, sous
//   leur chemin relatif vérifié (jamais « .. », jamais un programme), chacun avec sa taille et
//   son empreinte ; le dossier passe ensuite par le plan d'ajout, comme une table téléchargée.
// L'empreinte est calculée pendant l'envoi et donnée à la fin (file-end) : un fichier de plusieurs
// gigaoctets n'est lu qu'une fois.
//
// Reprise (gestionnaire de téléchargements, fetchFile) : le receveur garde le fichier partiel
// quand l'ami se déconnecte, et redemande le fichier à partir de ce qu'il a (file-get `from`) ;
// l'ami relit et hache le début, puis envoie la suite : l'empreinte de la fin porte toujours sur le
// fichier entier, et le receveur, qui a haché son début, vérifie le fichier repris en entier. Une
// borne d'avant la reprise renvoie tout (en-tête sans `from`) : le partiel repart de zéro.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildLibrary,
  checkShareable,
  chunkFrame,
  FILE_CHUNK,
  fileId,
  isSafeTableRel,
  libraryMessages,
  readChunkFrame,
  shareableTableFiles,
  SHARE_MAX_BYTES,
  tableFilesMessages,
  type FileRefusal,
  type FriendLibrary,
  type GamePart,
  type LibraryMedia,
  type LibraryMessage,
  type SharedFile,
  type TableContents,
  type TableEntry,
  type TableFile,
} from '@cyberpinball/core';
import type { FriendMessage, SocialNet } from './social-net';

export interface FriendContentOptions {
  net: Pick<SocialNet, 'state' | 'online' | 'send' | 'sendChunk' | 'onMessage' | 'onChunk'>;
  dataDir: string;
  tables(): readonly TableEntry[];
  /** Racine de la borne (médias par défaut exclus de la bibliothèque) ; undefined : rien à partager. */
  root(): string | undefined;
  romsOf?(table: TableEntry): readonly string[];
  /** Inventaire du dossier d'une table (tablecontents.ts) : ses parties à transmettre (sans lui, aucune table ne part). */
  contents(table: TableEntry): TableContents | undefined;
  /** Une bibliothèque est arrivée, un transfert avance : redessiner. */
  onChange?(): void;
  /** Ce fichier ou dossier appartient à un téléchargement de la file : le ménage du démarrage l'épargne. */
  keep?(file: string): boolean;
  log?(line: string): void;
}

export type FriendLibraryState =
  | { state: 'loading' }
  | { state: 'ready'; library: FriendLibrary }
  /** Il ne partage pas sa bibliothèque. */
  | { state: 'off' }
  | { state: 'offline' };

export interface FetchProgress {
  /** Fichier en cours (de 1 à total). */
  index: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

export type FetchFailure = FileRefusal | 'offline' | 'check' | 'size' | 'sha' | 'timeout' | 'cancelled';

/** Ce qu'un fichier demandé devient à l'arrivée : un média vérifié, ou un fichier de table à sa place. */
export type FetchTarget = { kind: 'media'; media: LibraryMedia } | { kind: 'file'; dest: string };

/** Un fichier reçu et vérifié (taille et empreinte du fichier entier). */
export interface FetchedFile {
  file: string;
  bytes: number;
  sha256: string;
}

export interface FetchResult {
  /** Fichiers vérifiés, dans le dossier d'attente, nommés <sha256>.<format>. */
  received: { media: LibraryMedia; file: string }[];
  failed: { media: LibraryMedia; reason: FetchFailure }[];
}

export interface TableFetchResult {
  /** Dossier de la table reçue (son nom est celui du dossier chez l'ami). */
  dir: string;
  received: TableFile[];
  failed: { file: TableFile; reason: FetchFailure }[];
}

export interface FriendContent {
  /** Bibliothèque d'un ami : demandée à sa borne au premier appel (ou si elle date), gardée ensuite. */
  library(key: string): FriendLibraryState;
  /** Redemande sa bibliothèque. */
  refresh(key: string): void;
  /** Prend ces médias d'une de ses tables, l'un après l'autre ; `signal` : « Annuler » à l'écran. */
  fetch(key: string, tableId: string, medias: readonly LibraryMedia[], progress?: (p: FetchProgress) => void, signal?: AbortSignal): Promise<FetchResult>;
  /** Les fichiers d'une de ses tables, partie par partie. */
  tableFiles(key: string, tableId: string): Promise<TableFile[] | FetchFailure>;
  /** Prend ces fichiers d'une de ses tables, dans un dossier neuf nommé `folder`, sous leur chemin relatif. */
  fetchTable(key: string, tableId: string, folder: string, files: readonly TableFile[], progress?: (p: FetchProgress) => void, signal?: AbortSignal): Promise<TableFetchResult>;
  /**
   * Un fichier (média ou fichier de table), reçu dans `part`, gardé si l'ami se déconnecte : un
   * nouvel appel avec le même partiel reprend là où il s'était arrêté (gestionnaire de
   * téléchargements). `onBytes` : octets du fichier reçus, partiel compris.
   */
  fetchFile(key: string, tableId: string, id: string, target: FetchTarget, part: string, onBytes?: (bytes: number) => void, signal?: AbortSignal, expect?: number): Promise<FetchedFile | { reason: FetchFailure }>;
  /** Dossier neuf où ranger une table reçue (gestionnaire de téléchargements). */
  tableDir(folder: string): string;
  /** Dossier d'attente des fichiers reçus. */
  receivedDir(): string;
  stop(): void;
}

/** Bibliothèque d'un ami redemandée après ce délai. */
const LIBRARY_STALE_MS = 2 * 60_000;
/** Ma bibliothèque relue au plus une fois par ce délai. */
const OWN_LIBRARY_MS = 30_000;
/** Sans en-tête ou sans morceau pendant ce délai, la demande échoue. */
const FILE_TIMEOUT_MS = 30_000;
/** Fichiers reçus mais jamais enregistrés ni installés : effacés après ce délai. */
const RECEIVED_KEEP_MS = 7 * 24 * 3600_000;

type Target = FetchTarget;

interface Incoming {
  key: string;
  target: Target;
  bytesHead?: number;
  fd?: number;
  part: string;
  /** Octets déjà dans le partiel, demandés en reprise (file-get `from`). */
  from: number;
  /** Partiel gardé par le gestionnaire : une déconnexion ne l'efface pas. */
  keep: boolean;
  /** Taille annoncée par la bibliothèque de l'ami quand le téléchargement a été demandé. */
  expect?: number;
  bytes: number;
  first: Buffer;
  hash: ReturnType<typeof createHash>;
  timer?: NodeJS.Timeout;
  done(result: FetchedFile | { reason: FetchFailure }): void;
}

/** Fichier de ma bibliothèque que désigne un identifiant : un média, ou un fichier d'une table. */
type Served = SharedFile | { file: string; part: GamePart };

export function createFriendContent(opts: FriendContentOptions): FriendContent {
  const net = opts.net;
  const log = (line: string) => opts.log?.(line);
  const dir = path.join(opts.dataDir, 'amis', 'recus');
  const tablesDir = path.join(opts.dataDir, 'amis', 'tables');
  /** `last` : la dernière bibliothèque reçue, montrée pendant qu'on redemande la suivante. */
  const libraries = new Map<string, { state: FriendLibraryState; asked: number; last?: FriendLibrary; parts?: Map<number, Extract<LibraryMessage, { t: 'library' }>> }>();
  let own: { at: number; files: Map<string, SharedFile>; library: FriendLibrary; byId: Map<string, TableEntry> } | undefined;
  /** Fichiers de mes tables déjà décrits à un ami, par table : leurs identifiants le désignent. */
  const ownTableFiles = new Map<string, Map<string, { file: string; part: GamePart }>>();
  const uploads = new Map<string, { req: number; cancelled: boolean }>();
  const incoming = new Map<number, Incoming>();
  const listings = new Map<number, { key: string; chunks: Map<number, TableFile[]>; done(r: TableFile[] | FetchFailure): void; timer: NodeJS.Timeout }>();
  let nextReq = 1;
  const changed = () => opts.onChange?.();

  clean(dir, opts.keep);
  clean(tablesDir, opts.keep);

  // ---------- Ma bibliothèque, servie à mes amis ----------

  function ownLibrary(): NonNullable<typeof own> {
    if (own && Date.now() - own.at < OWN_LIBRARY_MS) return own;
    const root = opts.root();
    const tables = opts.tables();
    const built = root
      ? buildLibrary(tables, { root, ...(opts.romsOf ? { romsOf: opts.romsOf } : {}), size: (file) => fileSize(file) })
      : { library: { at: new Date().toISOString(), tables: [] }, files: new Map<string, SharedFile>() };
    own = { at: Date.now(), ...built, byId: new Map(tables.map((t, i) => [built.library.tables[i]?.id ?? '', t])) };
    return own;
  }

  /** Fichiers d'une de mes tables à transmettre, avec leurs identifiants. */
  function describeTable(tableId: string): TableFile[] | undefined {
    const table = ownLibrary().byId.get(tableId);
    const contents = table && opts.contents(table);
    if (!table || !contents) return undefined;
    const files = shareableTableFiles(contents, table.folder);
    ownTableFiles.set(tableId, new Map(files.map((f) => [fileId(f.file), { file: f.file, part: f.part }])));
    return files.map((f) => ({ id: fileId(f.file), rel: f.rel, bytes: f.bytes, part: f.part }));
  }

  function served(tableId: string, id: string): Served | undefined {
    const media = ownLibrary().files.get(`${tableId}/${id}`);
    if (media) return media;
    if (!ownTableFiles.has(tableId)) describeTable(tableId);
    return ownTableFiles.get(tableId)?.get(id);
  }

  async function serveFile(key: string, req: number, tableId: string, id: string, asked = 0): Promise<void> {
    const refuse = (reason: FileRefusal) => net.send(key, { t: 'file-refused', req, reason });
    if (!net.state().shareLibrary) return void refuse('not-shared');
    // Un fichier à la fois par ami : les autres attendent leur tour chez lui.
    if (uploads.has(key)) return void refuse('busy');
    let what = served(tableId, id);
    if (!what) {
      own = undefined;
      ownTableFiles.delete(tableId);
      what = served(tableId, id);
    }
    if (!what) return void refuse('not-found');
    const upload = { req, cancelled: false };
    uploads.set(key, upload);
    let fd: number | undefined;
    try {
      let bytes: number;
      try {
        fd = fs.openSync(what.file, 'r');
        bytes = fs.fstatSync(fd).size;
      } catch {
        return void refuse('not-found');
      }
      // Un média passe d'abord les contrôles de l'import, comme chez celui qui le reçoit.
      if ('type' in what) {
        const head = Buffer.alloc(512);
        const n = fs.readSync(fd, head, 0, 512, 0);
        if (!checkShareable(what.type, what.file, head.subarray(0, n), bytes).ok) return void refuse('refused');
      }
      // Reprise : le début que l'ami a déjà est relu pour l'empreinte du fichier entier, pas renvoyé.
      const from = asked > 0 && asked <= bytes ? asked : 0;
      if (!net.send(key, { t: 'file-head', req, bytes, ...(from ? { from } : {}) })) return;
      if (from) log(`Bibliothèque partagée : envoi repris à partir de ${from} octets sur ${bytes}.`); // i18n-ignore : journal
      const hash = createHash('sha256');
      const buf = Buffer.alloc(FILE_CHUNK);
      for (let at = 0; at < from && !upload.cancelled; ) {
        const n = fs.readSync(fd, buf, 0, Math.min(FILE_CHUNK, from - at), at);
        if (n <= 0) break;
        hash.update(buf.subarray(0, n));
        at += n;
      }
      let sent = from;
      while (sent < bytes && !upload.cancelled) {
        const n = fs.readSync(fd, buf, 0, Math.min(FILE_CHUNK, bytes - sent), sent);
        if (n <= 0) break;
        hash.update(buf.subarray(0, n));
        if (!(await net.sendChunk(key, chunkFrame(req, buf.subarray(0, n))))) return;
        sent += n;
      }
      if (!upload.cancelled) net.send(key, { t: 'file-end', req, sha256: hash.digest('hex') });
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      uploads.delete(key);
    }
  }

  function serveTableFiles(key: string, req: number, tableId: string): void {
    if (!net.state().shareLibrary) return void net.send(key, { t: 'file-refused', req, reason: 'not-shared' });
    const files = describeTable(tableId);
    if (!files) return void net.send(key, { t: 'file-refused', req, reason: 'not-found' });
    for (const message of tableFilesMessages(req, files)) net.send(key, message);
  }

  // ---------- Bibliothèques et fichiers de mes amis ----------

  function onLibraryPart(key: string, part: Extract<LibraryMessage, { t: 'library' }>): void {
    const entry = libraries.get(key);
    if (!entry || entry.state.state !== 'loading') return;
    entry.parts ??= new Map();
    entry.parts.set(part.part, part);
    if (entry.parts.size < part.parts) return;
    const parts = [...entry.parts.values()].sort((a, b) => a.part - b.part);
    entry.last = { at: part.at, tables: parts.flatMap((p) => p.tables) };
    entry.state = { state: 'ready', library: entry.last };
    entry.parts = undefined;
    changed();
  }

  function onTableFiles(key: string, message: Extract<LibraryMessage, { t: 'table-files' }>): void {
    const listing = listings.get(message.req);
    if (!listing || listing.key !== key) return;
    listing.chunks.set(message.chunk, message.files);
    if (listing.chunks.size < message.chunks) return;
    listings.delete(message.req);
    clearTimeout(listing.timer);
    listing.done([...listing.chunks.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, files]) => files));
  }

  function finish(req: number, result: FetchedFile | { reason: FetchFailure }): void {
    const job = incoming.get(req);
    if (!job) return;
    incoming.delete(req);
    if (job.timer) clearTimeout(job.timer);
    if (job.fd !== undefined) fs.closeSync(job.fd);
    // Un partiel du gestionnaire survit à une coupure (l'ami parti, muet, occupé) ; un fichier faux ou annulé part.
    const resumable = 'reason' in result && job.keep && (result.reason === 'offline' || result.reason === 'timeout' || result.reason === 'busy');
    if ('reason' in result && !resumable) fs.rmSync(job.part, { force: true });
    job.done(result);
  }

  function arm(job: Incoming, req: number): void {
    if (job.timer) clearTimeout(job.timer);
    job.timer = setTimeout(() => {
      net.send(job.key, { t: 'file-cancel', req });
      finish(req, { reason: net.online(job.key) ? 'timeout' : 'offline' });
    }, FILE_TIMEOUT_MS);
    job.timer.unref?.();
  }

  function onHead(key: string, head: Extract<LibraryMessage, { t: 'file-head' }>): void {
    const job = incoming.get(head.req);
    if (!job || job.key !== key || job.bytesHead !== undefined) return;
    // Un média plus gros que ce qu'accepte son type : refusé avant le premier octet.
    if (job.target.kind === 'media' && head.bytes > SHARE_MAX_BYTES[job.target.media.kind]) {
      net.send(key, { t: 'file-cancel', req: head.req });
      return finish(head.req, { reason: 'size' });
    }
    // Reprise d'un fichier qui a changé de taille chez l'ami depuis la demande : le début gardé ne
    // vaut plus rien ; tout part (« size »), le gestionnaire repart de zéro une fois.
    if (job.from > 0 && job.expect !== undefined && head.bytes !== job.expect) {
      net.send(key, { t: 'file-cancel', req: head.req });
      job.keep = false;
      return finish(head.req, { reason: 'size' });
    }
    job.bytesHead = head.bytes;
    fs.mkdirSync(path.dirname(job.part), { recursive: true });
    if (job.from > 0 && head.from === job.from && job.from <= head.bytes) {
      // Reprise acceptée : le début gardé est haché (le fichier repris est vérifié en entier), la suite s'y ajoute.
      job.fd = fs.openSync(job.part, 'r+');
      const buf = Buffer.alloc(FILE_CHUNK);
      for (let at = 0; at < job.from; ) {
        const n = fs.readSync(job.fd, buf, 0, Math.min(FILE_CHUNK, job.from - at), at);
        if (n <= 0) break;
        job.hash.update(buf.subarray(0, n));
        if (job.first.length < 512) job.first = Buffer.concat([job.first, buf.subarray(0, Math.min(n, 512 - job.first.length))]);
        at += n;
      }
      fs.ftruncateSync(job.fd, job.from);
      job.bytes = job.from;
    } else {
      // Pas de reprise (premier essai, ou borne d'avant la reprise qui renvoie tout) : de zéro.
      job.fd = fs.openSync(job.part, 'w');
      job.from = 0;
      job.bytes = 0;
    }
    arm(job, head.req);
  }

  function onChunk(key: string, frame: Buffer): void {
    const chunk = readChunkFrame(frame);
    const job = chunk && incoming.get(chunk.req);
    if (!chunk || !job || job.key !== key || job.bytesHead === undefined || job.fd === undefined) return;
    // Plus que la taille annoncée : arrêté au premier octet de trop.
    if (job.bytes + chunk.data.length > job.bytesHead) {
      net.send(key, { t: 'file-cancel', req: chunk.req });
      return finish(chunk.req, { reason: 'size' });
    }
    fs.writeSync(job.fd, chunk.data, 0, chunk.data.length, job.bytes);
    job.hash.update(chunk.data);
    if (job.first.length < 512) job.first = Buffer.concat([job.first, chunk.data.subarray(0, 512 - job.first.length)]);
    job.bytes += chunk.data.length;
    arm(job, chunk.req);
  }

  function onEnd(key: string, end: Extract<LibraryMessage, { t: 'file-end' }>): void {
    const req = end.req;
    const job = incoming.get(req);
    if (!job || job.key !== key || job.bytesHead === undefined) return;
    if (job.bytes !== job.bytesHead) return finish(req, { reason: 'size' });
    const sha = job.hash.digest('hex');
    if (sha !== end.sha256) return finish(req, { reason: 'sha' });
    let file: string;
    if (job.target.kind === 'media') {
      const check = checkShareable(job.target.media.type, `x.${job.target.media.format}`, job.first, job.bytes);
      if (!check.ok) return finish(req, { reason: 'check' });
      file = path.join(dir, `${sha}.${check.format}`);
    } else file = job.target.dest;
    fs.closeSync(job.fd!);
    job.fd = undefined;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file, { force: true });
    fs.renameSync(job.part, file);
    finish(req, { file, bytes: job.bytes, sha256: sha });
  }

  const unsubscribe = [
    net.onMessage((key: string, message: FriendMessage) => {
      switch (message.t) {
        case 'library-get':
          if (!net.state().shareLibrary) net.send(key, { t: 'library-off' });
          else for (const part of libraryMessages(ownLibrary().library)) net.send(key, part);
          return;
        case 'library-off': {
          const entry = libraries.get(key);
          if (entry) {
            entry.state = { state: 'off' };
            entry.last = undefined;
          }
          changed();
          return;
        }
        case 'library':
          return onLibraryPart(key, message);
        case 'table-files-get':
          return serveTableFiles(key, message.req, message.table);
        case 'table-files':
          return onTableFiles(key, message);
        case 'file-get':
          void serveFile(key, message.req, message.table, message.file, message.from).catch((error: Error) => log(`Bibliothèque partagée : envoi impossible (${error.message}).`)); // i18n-ignore : journal
          return;
        case 'file-cancel': {
          const upload = uploads.get(key);
          if (upload?.req === message.req) upload.cancelled = true;
          return;
        }
        case 'file-head':
          return onHead(key, message);
        case 'file-refused': {
          if (incoming.get(message.req)?.key === key) finish(message.req, { reason: message.reason });
          const listing = listings.get(message.req);
          if (listing?.key === key) {
            listings.delete(message.req);
            clearTimeout(listing.timer);
            listing.done(message.reason);
          }
          return;
        }
        case 'file-end':
          return onEnd(key, message);
        default:
          return;
      }
    }),
    net.onChunk(onChunk),
  ];

  /** `kept` : partiel du gestionnaire, repris s'il a déjà des octets et gardé en cas de coupure. */
  function fetchOne(key: string, tableId: string, id: string, target: Target, onBytes: (bytes: number) => void, signal?: AbortSignal, kept?: string, expect?: number): Promise<FetchedFile | { reason: FetchFailure }> {
    return new Promise((resolve) => {
      const req = nextReq++;
      const part = kept ?? (target.kind === 'file' ? `${target.dest}.${req}.part` : path.join(dir, `${req}-${process.pid}.part`));
      const from = kept ? (fileSize(part) ?? 0) : 0;
      const job: Incoming = {
        key,
        target,
        part,
        from,
        keep: Boolean(kept),
        ...(expect !== undefined ? { expect } : {}),
        bytes: from,
        first: Buffer.alloc(0),
        hash: createHash('sha256'),
        done: resolve,
      };
      incoming.set(req, job);
      const watch = setInterval(() => {
        onBytes(job.bytes);
        if (!net.online(key)) finish(req, { reason: 'offline' });
      }, 200);
      watch.unref?.();
      const abort = () => {
        net.send(key, { t: 'file-cancel', req });
        finish(req, { reason: 'cancelled' });
      };
      signal?.addEventListener('abort', abort);
      const done = job.done;
      job.done = (result) => {
        clearInterval(watch);
        signal?.removeEventListener('abort', abort);
        onBytes(job.bytes);
        done(result);
      };
      arm(job, req);
      if (!net.send(key, { t: 'file-get', req, table: tableId, file: id, ...(from ? { from } : {}) })) finish(req, { reason: 'offline' });
    });
  }

  /** Une suite de fichiers, l'un après l'autre ; arrêtée au premier « plus relié » ou « annulé ». */
  async function fetchAll<T extends { id: string; bytes: number }>(key: string, tableId: string, items: readonly T[], targetOf: (item: T) => Target, progress?: (p: FetchProgress) => void, signal?: AbortSignal) {
    const ok: { item: T; file: string }[] = [];
    const failed: { item: T; reason: FetchFailure }[] = [];
    const totalBytes = items.reduce((n, m) => n + m.bytes, 0);
    let before = 0;
    for (const [i, item] of items.entries()) {
      const report = (bytes: number) => progress?.({ index: i + 1, total: items.length, bytes: before + bytes, totalBytes });
      report(0);
      const r = signal?.aborted ? { reason: 'cancelled' as const } : await fetchOne(key, tableId, item.id, targetOf(item), report, signal);
      if ('file' in r) ok.push({ item, file: r.file });
      else failed.push({ item, reason: r.reason });
      before += item.bytes;
      if ('reason' in r && (r.reason === 'offline' || r.reason === 'cancelled')) {
        for (const rest of items.slice(i + 1)) failed.push({ item: rest, reason: r.reason });
        break;
      }
    }
    return { ok, failed };
  }

  return {
    library(key) {
      const entry = libraries.get(key);
      if (!net.online(key)) return entry?.last ? { state: 'ready', library: entry.last } : { state: 'offline' };
      if (!entry || (entry.state.state !== 'loading' && Date.now() - entry.asked > LIBRARY_STALE_MS)) this.refresh(key);
      const now = libraries.get(key)!;
      // Redemandée : l'ancienne reste montrée jusqu'à l'arrivée de la nouvelle (un écran ouvert ne se vide pas).
      return now.state.state === 'loading' && now.last ? { state: 'ready', library: now.last } : now.state;
    },
    refresh(key) {
      const last = libraries.get(key)?.last;
      libraries.set(key, { state: { state: 'loading' }, asked: Date.now(), ...(last ? { last } : {}) });
      if (!net.send(key, { t: 'library-get' })) libraries.set(key, { state: { state: 'offline' }, asked: Date.now(), ...(last ? { last } : {}) });
    },
    async fetch(key, tableId, medias, progress, signal) {
      const { ok, failed } = await fetchAll(key, tableId, medias, (media) => ({ kind: 'media', media }), progress, signal);
      log(`Bibliothèque partagée : ${ok.length} média(s) reçu(s), ${failed.length} refusé(s) ou échoué(s).`); // i18n-ignore : journal
      return { received: ok.map((r) => ({ media: r.item, file: r.file })), failed: failed.map((f) => ({ media: f.item, reason: f.reason })) };
    },
    tableFiles(key, tableId) {
      return new Promise((resolve) => {
        const req = nextReq++;
        const timer = setTimeout(() => {
          listings.delete(req);
          resolve(net.online(key) ? 'timeout' : 'offline');
        }, FILE_TIMEOUT_MS);
        timer.unref?.();
        listings.set(req, { key, chunks: new Map(), done: resolve, timer });
        if (!net.send(key, { t: 'table-files-get', req, table: tableId })) {
          listings.delete(req);
          clearTimeout(timer);
          resolve('offline');
        }
      });
    },
    async fetchTable(key, tableId, folder, files, progress, signal) {
      const name = safeFolderName(folder);
      const root = path.join(tablesDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${nextReq}`, name);
      // Chaque chemin est revérifié ici : il ne sort jamais du dossier de la table reçue.
      const safe = files.filter((f) => isSafeTableRel(f.rel));
      const { ok, failed } = await fetchAll(key, tableId, safe, (f) => ({ kind: 'file', dest: path.join(root, ...f.rel.split('/')) }), progress, signal);
      log(`Bibliothèque partagée : table « ${name} », ${ok.length} fichier(s) reçu(s), ${failed.length} refusé(s) ou échoué(s).`); // i18n-ignore : journal
      return { dir: root, received: ok.map((r) => r.item), failed: failed.map((f) => ({ file: f.item, reason: f.reason })) };
    },
    fetchFile(key, tableId, id, target, part, onBytes, signal, expect) {
      // Un fichier de table ne sort jamais du dossier des tables reçues.
      if (target.kind === 'file' && path.relative(tablesDir, target.dest).split(path.sep).some((p) => p === '..' || !p)) return Promise.resolve({ reason: 'refused' as const });
      return fetchOne(key, tableId, id, target, (bytes) => onBytes?.(bytes), signal, part, expect);
    },
    tableDir(folder) {
      return path.join(tablesDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${nextReq++}`, safeFolderName(folder));
    },
    receivedDir: () => dir,
    stop() {
      for (const off of unsubscribe) off();
      for (const req of [...incoming.keys()]) finish(req, { reason: 'offline' });
      for (const upload of uploads.values()) upload.cancelled = true;
      for (const [req, listing] of listings) {
        clearTimeout(listing.timer);
        listings.delete(req);
        listing.done('offline');
      }
    },
  };
}

/** Nom de dossier sûr pour la table reçue (celui du dossier chez l'ami, nettoyé). */
function safeFolderName(name: string): string {
  const clean = name.replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 120);
  return clean && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) && clean !== '.' && clean !== '..' ? clean : 'Table';
}

/**
 * Ce qui traîne d'un ancien transfert (morceaux, fichiers jamais repris) : effacé après une semaine,
 * sauf ce qu'un téléchargement de la file garde pour reprendre (`keep`).
 */
function clean(dir: string, keep?: (file: string) => boolean): void {
  let names: fs.Dirent[] = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of names) {
    const file = path.join(dir, d.name);
    if (keep?.(file)) continue;
    try {
      if (d.name.endsWith('.part') || Date.now() - fs.statSync(file).mtimeMs > RECEIVED_KEEP_MS) fs.rmSync(file, { recursive: true, force: true });
    } catch {
      // déjà parti
    }
  }
}

function fileSize(file: string): number | undefined {
  try {
    return fs.statSync(file).size;
  } catch {
    return undefined;
  }
}
