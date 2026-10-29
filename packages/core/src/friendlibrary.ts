// Bibliothèque partagée entre amis (docs/recherche/partage-medias.md, § 14 et § 15), activée
// par défaut : la liste de mes tables, les médias que le menu montre pour chacune, et chaque
// table entière, partie par partie (table, fronton, ROM, PuP-Pack, sons…). Mes amis y prennent
// les médias qui leur manquent, une table qu'ils n'ont pas, ou les parties qu'ils veulent d'une
// table qu'ils ont ; la ROM seulement s'ils la cochent (décision du 29/10/2026).
// Jamais les sauvegardes, les records ni les statistiques ; jamais un programme.
//
// Ce qui circule ne contient aucun chemin de la borne : chaque table, chaque média et chaque
// fichier y a un identifiant opaque (empreinte de son chemin), que seule la borne qui partage
// sait relier à un fichier ; un fichier de table porte son chemin relatif au dossier de la table,
// vérifié des deux côtés (isSafeTableRel). Un média reçu est refusé s'il ne passe pas les
// contrôles de l'import (§ 5.1 : type, format, premiers octets, taille, SHA-256).
//
// Ici, seulement ce qui se décide sur des données ; le transport est dans app/src/social-net.ts
// et le service dans app/src/friend-content.ts.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { partOfFileKind, type GamePart } from './gameparts';
import { t } from './i18n';
import { MANAGED_MEDIA_TYPES, ownMediaPages } from './mediaedit';
import { mediaKind, mediaTypeInfo, type MediaKind, type MediaType } from './medias';
import { isJunkName } from './puppack';
import { isShareableType, parseTableIdentity, sameTable, shareableType, SHARE_MAX_BYTES, tableIdentity, type SameTableHow, type TableIdentity } from './sharing';
import type { TableContents } from './tablecontents';
import type { FileKind } from './tablefiles';
import type { TableEntry } from './tables';

/** Tables envoyées par message : une grande bibliothèque part en plusieurs. */
export const LIBRARY_PART_TABLES = 25;
/** Tables lues au plus dans la bibliothèque d'un ami. */
export const LIBRARY_MAX_TABLES = 5000;
/** Médias lus au plus par table (le prospectus et les règles ont des pages). */
export const LIBRARY_MAX_MEDIAS = 60;
/** Taille d'un morceau de fichier envoyé (sans les 4 octets du numéro de demande). */
export const FILE_CHUNK = 64 * 1024;

export interface LibraryMedia {
  /** Identifiant opaque (empreinte du chemin) : la borne qui partage seule sait quel fichier c'est. */
  id: string;
  type: MediaType;
  kind: MediaKind;
  /** Extension, en minuscules. */
  format: string;
  bytes: number;
  /** Page d'un média qui en a plusieurs, à partir de 2. */
  page?: number;
}

export interface LibraryTable {
  id: string;
  table: TableIdentity;
  /** Ce qui distingue cette version (« VPW 1.2 »), d'après le nom du fichier. */
  version?: string;
  medias: LibraryMedia[];
}

export interface FriendLibrary {
  /** Relevée le (ISO). */
  at: string;
  tables: LibraryTable[];
}

/** Fichier que désigne un identifiant de ma bibliothèque. */
export interface SharedFile {
  file: string;
  type: MediaType;
}

const opaque = (text: string) => createHash('sha256').update(text.toLowerCase()).digest('hex').slice(0, 16);
const isOpaque = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/**
 * Ma bibliothèque telle que mes amis la voient : chaque table, ses médias propres (ceux de
 * medias\, pas les défauts de la borne ni l'image tirée du .directb2s), et à part les fichiers
 * que désignent les identifiants (ils ne quittent jamais la borne). `size` : taille d'un fichier,
 * undefined s'il est illisible (il n'est pas proposé).
 */
export function buildLibrary(
  tables: readonly TableEntry[],
  opts: { root: string; romsOf?: (table: TableEntry) => readonly string[]; size: (file: string) => number | undefined; now?: Date },
): { library: FriendLibrary; files: Map<string, SharedFile> } {
  const files = new Map<string, SharedFile>();
  const out: LibraryTable[] = [];
  for (const table of tables.slice(0, LIBRARY_MAX_TABLES)) {
    const tableId = opaque(table.file);
    const medias: LibraryMedia[] = [];
    for (const type of MANAGED_MEDIA_TYPES) {
      if (!isShareableType(type)) continue;
      const pages = ownMediaPages(table, opts.root, type);
      pages.forEach((file, i) => {
        if (medias.length >= LIBRARY_MAX_MEDIAS) return;
        const format = path.extname(file).slice(1).toLowerCase();
        const kind = mediaKind(file);
        const bytes = opts.size(file);
        if (!kind || !mediaTypeInfo(type).formats.includes(format) || bytes === undefined || bytes <= 0 || bytes > SHARE_MAX_BYTES[kind]) return;
        const id = opaque(file);
        files.set(`${tableId}/${id}`, { file, type });
        medias.push({ id, type, kind, format, bytes, ...(i > 0 ? { page: i + 1 } : {}) });
      });
    }
    out.push({ id: tableId, table: tableIdentity(table, opts.romsOf?.(table) ?? []), ...(table.version ? { version: table.version.slice(0, 60) } : {}), medias });
  }
  return { library: { at: (opts.now ?? new Date()).toISOString(), tables: out }, files };
}

/** Une table reçue d'un ami, vérifiée ; undefined : ignorée. Les médias douteux sont retirés, pas la table. */
export function parseLibraryTable(raw: unknown): LibraryTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const table = parseTableIdentity(r.table);
  if (!isOpaque(r.id) || !table || !table.title) return undefined;
  const version = typeof r.version === 'string' && r.version.length <= 60 && !/[\x00-\x1f\x7f]/.test(r.version) ? r.version : undefined;
  const medias = (Array.isArray(r.medias) ? r.medias.slice(0, LIBRARY_MAX_MEDIAS) : []).map(parseLibraryMedia).filter((m): m is LibraryMedia => !!m);
  return { id: r.id, table, ...(version ? { version } : {}), medias };
}

function parseLibraryMedia(raw: unknown): LibraryMedia | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const type = shareableType(r.type);
  const format = typeof r.format === 'string' ? r.format.toLowerCase() : '';
  if (!isOpaque(r.id) || !type || !mediaTypeInfo(type).formats.includes(format)) return undefined;
  const kind = mediaKind(`x.${format}`);
  const bytes = r.bytes;
  if (!kind || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > SHARE_MAX_BYTES[kind]) return undefined;
  const page = typeof r.page === 'number' && Number.isInteger(r.page) && r.page >= 2 && r.page <= 99 ? r.page : undefined;
  return { id: r.id, type, kind, format, bytes, ...(page ? { page } : {}) };
}

/** Une table de l'ami, et la mienne qui est le même jeu (s'il y en a une). */
export interface LibraryMatch {
  entry: LibraryTable;
  mine?: TableEntry;
  how?: SameTableHow;
}

/**
 * Rapproche la bibliothèque d'un ami de mes tables : le même jeu par l'identifiant VPS, une
 * ROM, ou le titre et l'année (sameTable). Triée par titre.
 */
export function matchLibrary(library: FriendLibrary, mine: readonly { table: TableEntry; identity: TableIdentity }[]): LibraryMatch[] {
  return library.tables
    .map((entry) => {
      for (const m of mine) {
        const how = sameTable(entry.table, m.identity);
        if (how) return { entry, mine: m.table, how };
      }
      return { entry };
    })
    .sort((a, b) => a.entry.table.title.localeCompare(b.entry.table.title));
}

/**
 * Médias de l'ami que ma table n'a pas : un type que ma table ne montre pas encore (ses propres
 * fichiers, pas un défaut de la borne). Les pages d'un même type viennent ensemble.
 */
export function missingMedias(entry: LibraryTable, have: (type: MediaType) => boolean): LibraryMedia[] {
  return entry.medias.filter((m) => !have(m.type));
}

/** Poids total de ces médias, en octets. */
export function librarySize(medias: readonly LibraryMedia[]): number {
  return medias.reduce((n, m) => n + m.bytes, 0);
}

// ---------------------------------------------------------------------------
// Messages

/** Pourquoi un fichier n'est pas envoyé. */
export type FileRefusal = 'not-shared' | 'not-found' | 'refused' | 'busy';

// ---------------------------------------------------------------------------
// Une table entière : ses parties, fichier par fichier

/** Plus gros fichier d'une table accepté (une vidéo de PuP-Pack, un .vpx). */
export const TABLE_FILE_MAX = 8 * 2 ** 30;
/** Fichiers d'une table, au plus (un PuP-Pack en compte des milliers). */
export const TABLE_FILES_MAX = 20_000;
/** Fichiers décrits par message. */
export const TABLE_FILES_CHUNK = 400;

/** Parties d'une table qui se transmettent (gameparts.ts) : jamais les sauvegardes, les records ni les statistiques. */
export const SHARED_PARTS: readonly GamePart[] = ['table', 'b2s', 'rom', 'pup', 'altcolor', 'altsound', 'music', 'pov', 'ini', 'media'];

/** Un fichier d'une table, tel que l'ami le décrit : chemin relatif au dossier de la table, jamais absolu. */
export interface TableFile {
  id: string;
  rel: string;
  bytes: number;
  part: GamePart;
}

/** Programmes et raccourcis : jamais reçus, même dans une table (un script de table, lui, est exécuté par VPX). */
const DENIED = /\.(exe|dll|com|bat|cmd|msi|msp|ps1|psm1|scr|pif|lnk|url|reg|hta|cpl|jar|sys|drv|ocx|vbe|jse|wsf|wsh|msc|appx|msix)$/i;
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/**
 * Chemin relatif reçu pour un fichier de table : sous le dossier de la table, sans « .. », sans
 * lecteur ni chemin absolu, sans caractère de contrôle ni nom réservé de Windows, et pas un
 * programme. Séparateur « / ».
 */
export function isSafeTableRel(rel: unknown): rel is string {
  if (typeof rel !== 'string' || !rel || rel.length > 400 || /[\x00-\x1f\x7f\\:*?"<>|]/.test(rel) || DENIED.test(rel)) return false;
  const parts = rel.split('/');
  return parts.length <= 12 && parts.every((p) => p && p !== '.' && p !== '..' && !/^[ ]|[. ]$/.test(p) && !RESERVED_NAME.test(p) && p.length <= 200);
}

function parseTableFile(raw: unknown): TableFile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const bytes = r.bytes;
  if (!isOpaque(r.id) || !isSafeTableRel(r.rel) || !SHARED_PARTS.includes(r.part as GamePart)) return undefined;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > TABLE_FILE_MAX) return undefined;
  return { id: r.id, rel: r.rel, bytes, part: r.part as GamePart };
}

/** Une partie de la table d'un ami : ses fichiers et leur poids. */
export interface FriendPart {
  part: GamePart;
  files: TableFile[];
  bytes: number;
}

/** Fichiers de la table d'un ami rangés par partie, dans l'ordre des parties du jeu. */
export function friendParts(files: readonly TableFile[]): FriendPart[] {
  return SHARED_PARTS.map((part) => {
    const of = files.filter((f) => f.part === part);
    return { part, files: of, bytes: of.reduce((n, f) => n + f.bytes, 0) };
  }).filter((p) => p.files.length);
}

/**
 * Parties sous droits, jamais prises d'office : la ROM (l'œuvre du fabricant) et le PuP-Pack
 * (vidéos et musiques souvent tirées du jeu, assemblées par leurs auteurs) ; décisions du 29/10/2026.
 */
export const RIGHTS_PARTS: readonly GamePart[] = ['rom', 'pup'];

/**
 * Ce qu'on prend d'office de la table d'un ami : chaque partie qu'on n'a pas, sauf celles sous
 * droits (RIGHTS_PARTS), décochées tant que le joueur ne les coche pas, avec la mention des
 * droits. Une partie qu'on a déjà reste la nôtre.
 */
export function defaultPartChoice(part: GamePart, mineHas: boolean): boolean {
  return !RIGHTS_PARTS.includes(part) && !mineHas;
}

/** La mention des droits d'une partie sous droits, montrée à côté de sa case. */
export function partRightsNote(part: GamePart): string | undefined {
  if (part === 'rom') return t('l’œuvre du fabricant : à ne prendre que si vous en avez le droit');
  if (part === 'pup') return t('vidéos et musiques souvent tirées du jeu : à ne prendre que si vous en avez le droit');
  return undefined;
}

/** Ce qu'on atteste avant de prendre une partie sous droits (décision du 29/10/2026). */
export interface RightsAttestation {
  heading: string;
  /** Ce qu'est la partie, et à qui elle appartient. */
  what: string;
  /** D'où elle vient et qui en répond. */
  source: string;
  /** L'engagement que le joueur coche. */
  pledge: string;
  /** L'action qui la prend, une fois l'engagement coché. */
  take: string;
}

/**
 * La mention légale d'une partie sous droits, que le joueur coche avant de la prendre : sans elle,
 * la ROM et le PuP-Pack d'un ami ne se cochent pas. undefined : partie libre.
 */
export function rightsAttestation(part: GamePart, friend: string): RightsAttestation | undefined {
  const source = t('Ce contenu vient directement de la borne de {name} : Cyber Pinball ne le fournit pas et ne vérifie pas vos droits. Vous en êtes seul responsable.', { name: friend });
  const pledge = t('J’atteste avoir le droit de détenir ce contenu (par exemple la machine d’origine ou une licence) et je m’engage à respecter le droit d’auteur et les conditions d’utilisation de ses ayants droit.');
  if (part === 'rom')
    return {
      heading: t('La ROM : vos droits'),
      what: t('Une ROM est le programme d’origine de la machine : elle reste protégée par le droit d’auteur de son fabricant ou de ses ayants droit.'),
      source,
      pledge,
      take: t('Prendre la ROM'),
    };
  if (part === 'pup')
    return {
      heading: t('Le PuP-Pack : vos droits'),
      what: t('Un PuP-Pack rassemble des vidéos, des images et des musiques souvent tirées du jeu, de films ou de séries, et le travail de ses auteurs : chacun garde ses droits et ses conditions d’utilisation.'),
      source,
      pledge,
      take: t('Prendre le PuP-Pack'),
    };
  return undefined;
}

/**
 * Les fichiers qu'une réception peut demander : ceux d'une partie sous droits seulement si le
 * joueur l'a attestée. Dernier rempart, sous l'écran : un fichier de ROM ou de PuP-Pack sans
 * attestation ne part jamais en téléchargement.
 */
export function attestedTableFiles(files: readonly TableFile[], attested: ReadonlySet<GamePart>): TableFile[] {
  return files.filter((f) => !RIGHTS_PARTS.includes(f.part) || attested.has(f.part));
}

// ---------------------------------------------------------------------------
// Messages

export type LibraryMessage =
  | { t: 'library-get' }
  /** Une part de la bibliothèque (`part` de 0 à `parts` - 1). */
  | { t: 'library'; at: string; part: number; parts: number; tables: LibraryTable[] }
  /** Bibliothèque pas partagée (ou demandeur qui n'est pas un ami). */
  | { t: 'library-off' }
  /** Les fichiers d'une table, par paquets de TABLE_FILES_CHUNK. */
  | { t: 'table-files-get'; req: number; table: string }
  | { t: 'table-files'; req: number; chunk: number; chunks: number; files: TableFile[] }
  /**
   * Un fichier : un média, ou un fichier d'une table. `from` : octets déjà reçus d'un envoi
   * coupé, la borne qui partage envoie la suite (une borne d'avant la reprise l'ignore et
   * renvoie tout : son en-tête n'a pas de `from`, le receveur repart de zéro).
   */
  | { t: 'file-get'; req: number; table: string; file: string; from?: number }
  /** `from` : premier octet envoyé (la reprise acceptée). */
  | { t: 'file-head'; req: number; bytes: number; from?: number }
  | { t: 'file-refused'; req: number; reason: FileRefusal }
  /** Fin du fichier : l'empreinte du fichier entier (le début déjà reçu compris), calculée pendant l'envoi. */
  | { t: 'file-end'; req: number; sha256: string }
  | { t: 'file-cancel'; req: number };

const isReq = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

/** Message de bibliothèque ou de fichier, vérifié champ par champ ; undefined : ignoré. */
export function parseLibraryMessage(m: Record<string, unknown>): LibraryMessage | undefined {
  switch (m.t) {
    case 'library-get':
    case 'library-off':
      return { t: m.t };
    case 'library': {
      const parts = m.parts, part = m.part;
      if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 1 || parts > Math.ceil(LIBRARY_MAX_TABLES / LIBRARY_PART_TABLES)) return undefined;
      if (typeof part !== 'number' || !Number.isInteger(part) || part < 0 || part >= parts) return undefined;
      if (typeof m.at !== 'string' || m.at.length > 40 || Number.isNaN(Date.parse(m.at)) || !Array.isArray(m.tables)) return undefined;
      return { t: 'library', at: m.at, part, parts, tables: m.tables.slice(0, LIBRARY_PART_TABLES).map(parseLibraryTable).filter((x): x is LibraryTable => !!x) };
    }
    case 'table-files-get':
      return isReq(m.req) && isOpaque(m.table) ? { t: 'table-files-get', req: m.req, table: m.table } : undefined;
    case 'table-files': {
      const most = Math.ceil(TABLE_FILES_MAX / TABLE_FILES_CHUNK);
      if (!isReq(m.req) || !isCount(m.chunks, most) || !m.chunks || !isCount(m.chunk, (m.chunks as number) - 1) || !Array.isArray(m.files)) return undefined;
      return { t: 'table-files', req: m.req, chunk: m.chunk, chunks: m.chunks, files: m.files.slice(0, TABLE_FILES_CHUNK).map(parseTableFile).filter((f): f is TableFile => !!f) };
    }
    case 'file-get':
      if (!isReq(m.req) || !isOpaque(m.table) || !isOpaque(m.file) || (m.from !== undefined && !isCount(m.from, TABLE_FILE_MAX))) return undefined;
      return { t: 'file-get', req: m.req, table: m.table, file: m.file, ...(m.from ? { from: m.from as number } : {}) };
    case 'file-head':
      if (!isReq(m.req) || !isCount(m.bytes, TABLE_FILE_MAX) || (m.from !== undefined && !isCount(m.from, m.bytes))) return undefined;
      return { t: 'file-head', req: m.req, bytes: m.bytes, ...(m.from ? { from: m.from as number } : {}) };
    case 'file-refused':
      return isReq(m.req) && ['not-shared', 'not-found', 'refused', 'busy'].includes(m.reason as string) ? { t: 'file-refused', req: m.req, reason: m.reason as FileRefusal } : undefined;
    case 'file-end':
      return isReq(m.req) && typeof m.sha256 === 'string' && /^[0-9a-f]{64}$/.test(m.sha256) ? { t: 'file-end', req: m.req, sha256: m.sha256 } : undefined;
    case 'file-cancel':
      return isReq(m.req) ? { t: 'file-cancel', req: m.req } : undefined;
    default:
      return undefined;
  }
}

/** Fichiers d'une table en messages, TABLE_FILES_CHUNK chacun. */
export function tableFilesMessages(req: number, files: readonly TableFile[]): Extract<LibraryMessage, { t: 'table-files' }>[] {
  const chunks = Math.max(1, Math.ceil(files.length / TABLE_FILES_CHUNK));
  return Array.from({ length: chunks }, (_, chunk) => ({ t: 'table-files' as const, req, chunk, chunks, files: files.slice(chunk * TABLE_FILES_CHUNK, (chunk + 1) * TABLE_FILES_CHUNK) }));
}

/** Identifiant opaque d'un fichier (empreinte de son chemin sur la borne). */
export function fileId(file: string): string {
  return opaque(file);
}

/** Ma bibliothèque en messages, `LIBRARY_PART_TABLES` tables chacun (une bibliothèque vide : un message vide). */
export function libraryMessages(library: FriendLibrary): Extract<LibraryMessage, { t: 'library' }>[] {
  const parts = Math.max(1, Math.ceil(library.tables.length / LIBRARY_PART_TABLES));
  return Array.from({ length: parts }, (_, part) => ({ t: 'library' as const, at: library.at, part, parts, tables: library.tables.slice(part * LIBRARY_PART_TABLES, (part + 1) * LIBRARY_PART_TABLES) }));
}

/** Morceau de fichier : le numéro de la demande sur 4 octets, puis les données. */
export function chunkFrame(req: number, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(req);
  return Buffer.concat([head, data]);
}

export function readChunkFrame(frame: Buffer): { req: number; data: Buffer } | undefined {
  if (frame.length < 5) return undefined;
  return { req: frame.readUInt32BE(0), data: frame.subarray(4) };
}

export function fileRefusalLabel(reason: FileRefusal | 'offline' | 'check' | 'size' | 'sha' | 'timeout' | 'cancelled'): string {
  switch (reason) {
    case 'not-shared':
      return t('il ne partage plus sa bibliothèque');
    case 'not-found':
      return t('le fichier n’est plus sur sa borne');
    case 'refused':
      return t('le fichier ne passe pas les contrôles de sa borne');
    case 'busy':
      return t('sa borne envoie déjà un autre fichier ; réessayez dans un instant');
    case 'offline':
      return t('sa borne n’est plus en ligne');
    case 'check':
      return t('le contenu reçu ne correspond pas à un média de ce type');
    case 'size':
      return t('la taille reçue n’est pas celle annoncée');
    case 'sha':
      return t('le fichier reçu a été altéré en route (empreinte différente)');
    case 'timeout':
      return t('sa borne ne répond plus');
    case 'cancelled':
      return t('annulé');
  }
}

// ---------------------------------------------------------------------------
// Fichiers de ma table, à partager

/** Sortes de fichiers rangées avec la table elle-même : ce qu'il faut pour qu'elle joue comme chez l'ami. */
const WITH_TABLE: readonly FileKind[] = ['dmdFolder', 'script', 'doc'];

/** Un fichier de ma table que je peux transmettre. */
export interface ShareableTableFile {
  file: string;
  /** Relatif au dossier de la table, séparateur « / ». */
  rel: string;
  part: GamePart;
  bytes: number;
}

/**
 * Fichiers d'une table à transmettre, d'après son inventaire (tablecontents.ts) : ceux de chaque
 * partie du jeu (table, fronton, ROM, PuP-Pack, couleurs, sons, musique, point de vue, réglages,
 * médias) et ce qui joue avec la table (contenu du DMD, scripts complémentaires). Jamais les
 * sauvegardes, records, réglages de PinMAME ni statistiques ; jamais un programme. Les dossiers
 * rangés d'un bloc sont dépliés fichier par fichier. Une ROM rangée dans la bibliothèque commune
 * (pas dans le dossier) part de là, sous son chemin dans le dossier de la table.
 */
export function shareableTableFiles(contents: TableContents, folder: string): ShareableTableFile[] {
  const out: ShareableTableFile[] = [];
  const add = (file: string, rel: string, part: GamePart) => {
    const posix = rel.split(path.sep).join('/');
    if (out.length >= TABLE_FILES_MAX || !isSafeTableRel(posix)) return;
    let bytes: number;
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) return;
      bytes = st.size;
    } catch {
      return;
    }
    if (bytes > TABLE_FILE_MAX) return;
    out.push({ file, rel: posix, part, bytes });
  };
  const walk = (dir: string, rel: string, part: GamePart) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (isJunkName(d.name)) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full, path.join(rel, d.name), part);
      else if (d.isFile()) add(full, path.join(rel, d.name), part);
    }
  };
  for (const entry of contents.entries) {
    const part = partOfFileKind(entry.kind) ?? (WITH_TABLE.includes(entry.kind) ? 'table' : undefined);
    if (!part || !SHARED_PARTS.includes(part)) continue;
    if (entry.dir) {
      if (!entry.missing) walk(entry.path, entry.rel, part);
      continue;
    }
    const file = !entry.missing && fs.existsSync(entry.path) ? entry.path : entry.kind === 'rom' && entry.library && fs.existsSync(entry.library) ? entry.library : undefined;
    if (file) add(file, entry.rel || path.relative(folder, file), part);
  }
  return out;
}
