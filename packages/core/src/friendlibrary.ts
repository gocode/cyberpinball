// Bibliothèque partagée entre amis (docs/recherche/partage-medias.md, § 14) : un ami qui l'a
// activée laisse voir la liste de ses tables et les médias que le menu montre pour chacune ;
// ses amis y prennent les médias qui leur manquent. Jamais une table, une ROM ni un PuP-Pack :
// une table qu'on n'a pas se récupère par le catalogue, comme toute table (règle du projet).
//
// Ce qui circule ne contient aucun chemin : chaque table et chaque média y a un identifiant
// opaque (empreinte de son chemin sur la borne), que seule la borne qui partage sait relier à
// un fichier. Un fichier reçu est refusé s'il ne passe pas les contrôles de l'import (§ 5.1 :
// type, format, premiers octets, taille, SHA-256 annoncé).
//
// Ici, seulement ce qui se décide sur des données ; le transport est dans app/src/social-net.ts
// et le service dans app/src/friend-content.ts.

import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { t } from './i18n';
import { MANAGED_MEDIA_TYPES, ownMediaPages } from './mediaedit';
import { mediaKind, mediaTypeInfo, type MediaKind, type MediaType } from './medias';
import { isShareableType, parseTableIdentity, sameTable, shareableType, SHARE_MAX_BYTES, tableIdentity, type SameTableHow, type TableIdentity } from './sharing';
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

export type LibraryMessage =
  | { t: 'library-get' }
  /** Une part de la bibliothèque (`part` de 0 à `parts` - 1). */
  | { t: 'library'; at: string; part: number; parts: number; tables: LibraryTable[] }
  /** Bibliothèque pas partagée (ou demandeur qui n'est pas un ami). */
  | { t: 'library-off' }
  | { t: 'file-get'; req: number; table: string; media: string }
  | { t: 'file-head'; req: number; type: MediaType; format: string; bytes: number; sha256: string }
  | { t: 'file-refused'; req: number; reason: FileRefusal }
  | { t: 'file-end'; req: number }
  | { t: 'file-cancel'; req: number };

const isReq = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;

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
    case 'file-get':
      return isReq(m.req) && isOpaque(m.table) && isOpaque(m.media) ? { t: 'file-get', req: m.req, table: m.table, media: m.media } : undefined;
    case 'file-head': {
      const type = shareableType(m.type);
      const format = typeof m.format === 'string' ? m.format.toLowerCase() : '';
      const kind = mediaKind(`x.${format}`);
      const bytes = m.bytes;
      if (!isReq(m.req) || !type || !kind || !mediaTypeInfo(type).formats.includes(format)) return undefined;
      if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > SHARE_MAX_BYTES[kind]) return undefined;
      if (typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(m.sha256)) return undefined;
      return { t: 'file-head', req: m.req, type, format, bytes, sha256: m.sha256 };
    }
    case 'file-refused':
      return isReq(m.req) && ['not-shared', 'not-found', 'refused', 'busy'].includes(m.reason as string) ? { t: 'file-refused', req: m.req, reason: m.reason as FileRefusal } : undefined;
    case 'file-end':
    case 'file-cancel':
      return isReq(m.req) ? { t: m.t, req: m.req } : undefined;
    default:
      return undefined;
  }
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
