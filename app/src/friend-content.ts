// Bibliothèque partagée entre amis (packages/core/src/friendlibrary.ts) sur le réseau des
// bornes (social-net.ts) : ce service sert ma bibliothèque à mes amis quand je la partage, et
// va chercher la leur et leurs médias.
//
// Un fichier reçu va d'abord dans <données>\amis\recus\, jamais dans medias\ : il n'en sort que
// s'il a la taille et l'empreinte SHA-256 annoncées, et des premiers octets qui disent un média de
// son type (checkShareable). Puis il entre dans le brouillon des médias de la table, que
// l'utilisateur voit et enregistre (rien n'est rangé sans lui).
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
  libraryMessages,
  readChunkFrame,
  type FileRefusal,
  type FriendLibrary,
  type LibraryMedia,
  type LibraryMessage,
  type SharedFile,
  type TableEntry,
} from '@cyberpinball/core';
import type { FriendMessage, SocialNet } from './social-net';

export interface FriendContentOptions {
  net: Pick<SocialNet, 'state' | 'online' | 'send' | 'sendChunk' | 'onMessage' | 'onChunk'>;
  dataDir: string;
  tables(): readonly TableEntry[];
  /** Racine de la borne (médias par défaut exclus de la bibliothèque) ; undefined : rien à partager. */
  root(): string | undefined;
  romsOf?(table: TableEntry): readonly string[];
  /** Une bibliothèque est arrivée, un transfert avance : redessiner. */
  onChange?(): void;
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

export interface FetchResult {
  /** Fichiers vérifiés, dans le dossier d'attente, nommés <sha256>.<format>. */
  received: { media: LibraryMedia; file: string }[];
  failed: { media: LibraryMedia; reason: FetchFailure }[];
}

export interface FriendContent {
  /** Bibliothèque d'un ami : demandée à sa borne au premier appel (ou si elle date), gardée ensuite. */
  library(key: string): FriendLibraryState;
  /** Redemande sa bibliothèque. */
  refresh(key: string): void;
  /** Prend ces médias d'une de ses tables, l'un après l'autre ; `signal` : « Annuler » à l'écran. */
  fetch(key: string, tableId: string, medias: readonly LibraryMedia[], progress?: (p: FetchProgress) => void, signal?: AbortSignal): Promise<FetchResult>;
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
/** Fichiers reçus mais jamais enregistrés : effacés du dossier d'attente après ce délai. */
const RECEIVED_KEEP_MS = 7 * 24 * 3600_000;

interface Incoming {
  key: string;
  media: LibraryMedia;
  head?: Extract<LibraryMessage, { t: 'file-head' }>;
  fd?: number;
  part: string;
  bytes: number;
  first: Buffer;
  hash: ReturnType<typeof createHash>;
  timer?: NodeJS.Timeout;
  done(result: { file: string } | { reason: FetchFailure }): void;
}

export function createFriendContent(opts: FriendContentOptions): FriendContent {
  const net = opts.net;
  const log = (line: string) => opts.log?.(line);
  const dir = path.join(opts.dataDir, 'amis', 'recus');
  const libraries = new Map<string, { state: FriendLibraryState; asked: number; parts?: Map<number, Extract<LibraryMessage, { t: 'library' }>> }>();
  let own: { at: number; files: Map<string, SharedFile>; library: FriendLibrary } | undefined;
  const uploads = new Map<string, { req: number; cancelled: boolean }>();
  const incoming = new Map<number, Incoming>();
  let nextReq = 1;
  const changed = () => opts.onChange?.();

  cleanReceived();

  // ---------- Ma bibliothèque, servie à mes amis ----------

  function ownLibrary(): NonNullable<typeof own> {
    if (own && Date.now() - own.at < OWN_LIBRARY_MS) return own;
    const root = opts.root();
    const built = root
      ? buildLibrary(opts.tables(), { root, ...(opts.romsOf ? { romsOf: opts.romsOf } : {}), size: (file) => fileSize(file) })
      : { library: { at: new Date().toISOString(), tables: [] }, files: new Map<string, SharedFile>() };
    own = { at: Date.now(), ...built };
    return own;
  }

  async function serveFile(key: string, req: number, tableId: string, mediaId: string): Promise<void> {
    const refuse = (reason: FileRefusal) => net.send(key, { t: 'file-refused', req, reason });
    if (!net.state().shareLibrary) return void refuse('not-shared');
    // Un fichier à la fois par ami : les autres attendent leur tour chez lui.
    if (uploads.has(key)) return void refuse('busy');
    let shared = ownLibrary().files.get(`${tableId}/${mediaId}`);
    if (!shared) {
      own = undefined;
      shared = ownLibrary().files.get(`${tableId}/${mediaId}`);
    }
    if (!shared) return void refuse('not-found');
    const upload = { req, cancelled: false };
    uploads.set(key, upload);
    try {
      const read = await hashFile(shared.file);
      if (!read) return void refuse('not-found');
      const check = checkShareable(shared.type, shared.file, read.head, read.bytes);
      if (!check.ok) return void refuse('refused');
      if (!net.send(key, { t: 'file-head', req, type: shared.type, format: check.format, bytes: read.bytes, sha256: read.sha256 })) return;
      const fd = fs.openSync(shared.file, 'r');
      try {
        const buf = Buffer.alloc(FILE_CHUNK);
        let sent = 0;
        while (sent < read.bytes && !upload.cancelled) {
          const n = fs.readSync(fd, buf, 0, Math.min(FILE_CHUNK, read.bytes - sent), sent);
          if (n <= 0) break;
          if (!(await net.sendChunk(key, chunkFrame(req, buf.subarray(0, n))))) return;
          sent += n;
        }
      } finally {
        fs.closeSync(fd);
      }
      if (!upload.cancelled) net.send(key, { t: 'file-end', req });
    } finally {
      uploads.delete(key);
    }
  }

  // ---------- Bibliothèques et fichiers de mes amis ----------

  function onLibraryPart(key: string, part: Extract<LibraryMessage, { t: 'library' }>): void {
    const entry = libraries.get(key);
    if (!entry || entry.state.state !== 'loading') return;
    entry.parts ??= new Map();
    entry.parts.set(part.part, part);
    if (entry.parts.size < part.parts) return;
    const parts = [...entry.parts.values()].sort((a, b) => a.part - b.part);
    entry.state = { state: 'ready', library: { at: part.at, tables: parts.flatMap((p) => p.tables) } };
    entry.parts = undefined;
    changed();
  }

  function finish(req: number, result: { file: string } | { reason: FetchFailure }): void {
    const job = incoming.get(req);
    if (!job) return;
    incoming.delete(req);
    if (job.timer) clearTimeout(job.timer);
    if (job.fd !== undefined) fs.closeSync(job.fd);
    if ('reason' in result) fs.rmSync(job.part, { force: true });
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
    if (!job || job.key !== key || job.head) return;
    // Ce que dit l'en-tête doit être ce que la bibliothèque annonçait : le même type de média.
    if (head.type !== job.media.type) {
      net.send(key, { t: 'file-cancel', req: head.req });
      return finish(head.req, { reason: 'check' });
    }
    job.head = head;
    fs.mkdirSync(dir, { recursive: true });
    job.fd = fs.openSync(job.part, 'w');
    arm(job, head.req);
  }

  function onChunk(key: string, frame: Buffer): void {
    const chunk = readChunkFrame(frame);
    const job = chunk && incoming.get(chunk.req);
    if (!chunk || !job || job.key !== key || !job.head || job.fd === undefined) return;
    // Plus que la taille annoncée : arrêté au premier octet de trop.
    if (job.bytes + chunk.data.length > job.head.bytes) {
      net.send(key, { t: 'file-cancel', req: chunk.req });
      return finish(chunk.req, { reason: 'size' });
    }
    fs.writeSync(job.fd, chunk.data);
    job.hash.update(chunk.data);
    if (job.first.length < 512) job.first = Buffer.concat([job.first, chunk.data.subarray(0, 512 - job.first.length)]);
    job.bytes += chunk.data.length;
    arm(job, chunk.req);
  }

  function onEnd(key: string, req: number): void {
    const job = incoming.get(req);
    if (!job || job.key !== key || !job.head) return;
    const head = job.head;
    if (job.bytes !== head.bytes) return finish(req, { reason: 'size' });
    if (job.hash.digest('hex') !== head.sha256) return finish(req, { reason: 'sha' });
    const check = checkShareable(head.type, `x.${head.format}`, job.first, job.bytes);
    if (!check.ok) return finish(req, { reason: 'check' });
    const file = path.join(dir, `${head.sha256}.${check.format}`);
    fs.closeSync(job.fd!);
    job.fd = undefined;
    fs.renameSync(job.part, file);
    finish(req, { file });
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
          if (entry) entry.state = { state: 'off' };
          changed();
          return;
        }
        case 'library':
          return onLibraryPart(key, message);
        case 'file-get':
          void serveFile(key, message.req, message.table, message.media).catch((error: Error) => log(`Bibliothèque partagée : envoi impossible (${error.message}).`)); // i18n-ignore : journal
          return;
        case 'file-cancel': {
          const upload = uploads.get(key);
          if (upload?.req === message.req) upload.cancelled = true;
          return;
        }
        case 'file-head':
          return onHead(key, message);
        case 'file-refused':
          if (incoming.get(message.req)?.key === key) finish(message.req, { reason: message.reason });
          return;
        case 'file-end':
          return onEnd(key, message.req);
        default:
          return;
      }
    }),
    net.onChunk(onChunk),
  ];

  function fetchOne(key: string, tableId: string, media: LibraryMedia, onBytes: (bytes: number) => void, signal?: AbortSignal): Promise<{ file: string } | { reason: FetchFailure }> {
    return new Promise((resolve) => {
      const req = nextReq++;
      const job: Incoming = {
        key,
        media,
        part: path.join(dir, `${req}-${process.pid}.part`),
        bytes: 0,
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
      if (!net.send(key, { t: 'file-get', req, table: tableId, media: media.id })) finish(req, { reason: 'offline' });
    });
  }

  return {
    library(key) {
      if (!net.online(key)) {
        const known = libraries.get(key)?.state;
        return known?.state === 'ready' ? known : { state: 'offline' };
      }
      const entry = libraries.get(key);
      if (!entry || (entry.state.state !== 'loading' && Date.now() - entry.asked > LIBRARY_STALE_MS)) {
        this.refresh(key);
        return entry?.state.state === 'ready' ? entry.state : { state: 'loading' };
      }
      return entry.state;
    },
    refresh(key) {
      libraries.set(key, { state: { state: 'loading' }, asked: Date.now() });
      if (!net.send(key, { t: 'library-get' })) libraries.set(key, { state: { state: 'offline' }, asked: Date.now() });
    },
    async fetch(key, tableId, medias, progress, signal) {
      const result: FetchResult = { received: [], failed: [] };
      const totalBytes = medias.reduce((n, m) => n + m.bytes, 0);
      let before = 0;
      for (const [i, media] of medias.entries()) {
        const report = (bytes: number) => progress?.({ index: i + 1, total: medias.length, bytes: before + bytes, totalBytes });
        report(0);
        const r = signal?.aborted ? { reason: 'cancelled' as const } : await fetchOne(key, tableId, media, report, signal);
        if ('file' in r) result.received.push({ media, file: r.file });
        else result.failed.push({ media, reason: r.reason });
        before += media.bytes;
        // Plus relié, ou annulé : les suivants échoueraient de même.
        if ('reason' in r && (r.reason === 'offline' || r.reason === 'cancelled')) {
          for (const rest of medias.slice(i + 1)) result.failed.push({ media: rest, reason: r.reason });
          break;
        }
      }
      log(`Bibliothèque partagée : ${result.received.length} média(s) reçu(s), ${result.failed.length} refusé(s) ou échoué(s).`); // i18n-ignore : journal
      return result;
    },
    receivedDir: () => dir,
    stop() {
      for (const off of unsubscribe) off();
      for (const req of [...incoming.keys()]) finish(req, { reason: 'offline' });
      for (const upload of uploads.values()) upload.cancelled = true;
    },
  };

  function cleanReceived(): void {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        if (name.endsWith('.part') || Date.now() - fs.statSync(file).mtimeMs > RECEIVED_KEEP_MS) fs.rmSync(file, { force: true });
      } catch {
        // déjà parti
      }
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

/** Empreinte et premiers octets d'un fichier, lus par morceaux sans bloquer le menu. */
async function hashFile(file: string): Promise<{ sha256: string; bytes: number; head: Buffer } | undefined> {
  try {
    const hash = createHash('sha256');
    let head = Buffer.alloc(0);
    let bytes = 0;
    for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
      if (head.length < 512) head = Buffer.concat([head, chunk.subarray(0, 512 - head.length)]);
      hash.update(chunk);
      bytes += chunk.length;
    }
    return { sha256: hash.digest('hex'), bytes, head };
  } catch {
    return undefined;
  }
}
