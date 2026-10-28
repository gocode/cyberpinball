// Paquet de médias : les médias choisis d'une ou de plusieurs tables, dans un .zip ordinaire
// que l'Explorateur ouvre, avec un manifeste signé par la clé du joueur. Il s'échange sans
// réseau (clé USB, forum, Discord) et sera l'unité d'échange entre bornes si un réseau pair à
// pair est retenu. Conception : docs/recherche/partage-medias.md, § 5 et § 10.
//
// Rangement dans le zip : « <Titre (Fabricant Année)>/(Type) <Titre (Fabricant Année)>.ext »,
// le nommage des médias de VPX, et à la racine cyberpinball-medias.json : une enveloppe
// { manifest, signature }, la signature Ed25519 portant sur le texte exact du manifeste,
// comme pour les mises à jour (update.ts).
//
// Les médias sont stockés sans compression (ils le sont déjà), écrits et relus en continu :
// une vidéo 4K de plusieurs centaines de Mo ne passe jamais tout entière en mémoire. Pas de
// Zip64 : un paquet reste sous 4 Gio.
//
// À la lecture, rien n'est cru sur parole : un fichier ne circule que s'il est un média que le
// menu montre, dans un format que son type accepte, dont les premiers octets disent le même
// conteneur, avec la taille et l'empreinte SHA-256 du manifeste. Un nom de chemin piégé, un
// exécutable déguisé, une bombe zip, un fichier hors manifeste sont refusés, avec la raison.
// L'extraction n'écrit que dans le dossier d'attente donné, sous le nom « <sha256>.<ext> ».

import { createHash } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';
import { t } from './i18n';
import { mediaKind, mediaTypeInfo, type MediaKind, type MediaType } from './medias';
import {
  checkShareable,
  isPlayerPublicKey,
  parseTableIdentity,
  shareableType,
  SHARE_MAX_BYTES,
  signText,
  verifyText,
  type PlayerKey,
  type TableIdentity,
} from './sharing';

export const PACK_MANIFEST = 'cyberpinball-medias.json';
export const PACK_FORMAT = 'cyberpinball-medias';
export const PACK_VERSION = 1;
/** Fichiers d'un paquet, au plus. */
export const PACK_MAX_FILES = 1000;
/** Sans Zip64, positions et tailles tiennent sur 32 bits. */
const ZIP_LIMIT = 0xffffffff;
/** Le manifeste ne décrit que des noms et des empreintes. */
const MANIFEST_MAX = 4 * 2 ** 20;

/** D'où vient un média, tel que son auteur le sait (MediaOrigin du .info, sans chemin local). */
export interface PackOrigin {
  /** « VPinMediaDB », « VPForums », « Base VPS »… */
  origin: string;
  url?: string;
}

export interface PackMedia {
  /** Chemin dans le zip. */
  path: string;
  type: MediaType;
  kind: MediaKind;
  format: string;
  bytes: number;
  sha256: string;
  /** Page d'un média qui en a plusieurs (prospectus, règles), à partir de 2. */
  page?: number;
  origin?: PackOrigin;
  /** Mention libre de l'auteur : qui a fait ce média. */
  credit?: string;
}

export interface PackTable {
  table: TableIdentity;
  medias: PackMedia[];
}

export interface PackManifest {
  format: typeof PACK_FORMAT;
  version: number;
  createdAt: string;
  /** « Cyber Pinball 0.1.3 » */
  app?: string;
  author?: { name?: string; publicKey: string };
  note?: string;
  tables: PackTable[];
}

// ---------------------------------------------------------------------------
// Noms

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Morceau de chemin acceptable par Windows, tiré d'un titre. */
function safeSegment(name: string): string {
  const s = name
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  return s && !RESERVED.test(s) ? s : '_';
}

/**
 * Chemin lu dans un paquet : au plus un dossier et un nom, sans « .. », chemin absolu, lettre
 * de lecteur, barre inverse ni caractère interdit par Windows. Jamais utilisé pour écrire, mais
 * un paquet qui en contient un autre est refusé d'emblée pour ce fichier.
 */
export function isSafePackPath(name: string): boolean {
  if (!name || name.length > 255 || /[\x00-\x1f\x7f\\:*?"<>|]/.test(name)) return false;
  const parts = name.split('/');
  return parts.length <= 2 && parts.every((p) => p && p !== '.' && p !== '..' && !/^[ ]|[. ]$/.test(p) && !RESERVED.test(p));
}

function tableFolder(table: TableIdentity): string {
  const maker = [table.manufacturer, table.year].filter(Boolean).join(' ');
  return safeSegment(maker ? `${table.title} (${maker})` : table.title || table.vpsId || table.roms?.[0] || 'Table');
}

const isSha256 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

function cleanText(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);
  return text || undefined;
}

function cleanOrigin(raw: unknown): PackOrigin | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as { origin?: unknown; url?: unknown };
  const origin = cleanText(o.origin, 80);
  if (!origin) return undefined;
  const url = typeof o.url === 'string' && /^https?:\/\/[^\s]+$/i.test(o.url) && o.url.length <= 1000 ? o.url : undefined;
  return url ? { origin, url } : { origin };
}

// ---------------------------------------------------------------------------
// Zip

let crcTable: Uint32Array | undefined;

/** CRC-32 du zip, à la suite d'un CRC déjà calculé. */
function crc32(data: Buffer, crc = 0): number {
  const native = (zlib as { crc32?: (data: Buffer, value?: number) => number }).crc32;
  if (native) return native(data, crc) >>> 0;
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface EntryHeader {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
}

function localHeader(e: EntryHeader, when: { time: number; date: number }): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x800, 6);
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(when.time, 10);
  h.writeUInt16LE(when.date, 12);
  h.writeUInt32LE(e.crc, 14);
  h.writeUInt32LE(e.size, 18);
  h.writeUInt32LE(e.size, 22);
  h.writeUInt16LE(e.name.length, 26);
  return h;
}

function centralHeader(e: EntryHeader, when: { time: number; date: number }): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(0x800, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(when.time, 12);
  h.writeUInt16LE(when.date, 14);
  h.writeUInt32LE(e.crc, 16);
  h.writeUInt32LE(e.size, 20);
  h.writeUInt32LE(e.size, 24);
  h.writeUInt16LE(e.name.length, 28);
  h.writeUInt32LE(e.offset, 42);
  return Buffer.concat([h, e.name]);
}

/** Fichier du zip, d'après son répertoire central. */
export interface PackEntry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  size: number;
  /** Position de l'en-tête local. */
  offset: number;
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = fs.readSync(fd, buf, done, length - done, position + done);
    if (n <= 0) break;
    done += n;
  }
  return buf.subarray(0, done);
}

/** Répertoire central, lu sans charger le zip ; une raison si ce n'est pas un zip simple et entier. */
function readCentralDirectory(fd: number, size: number): PackEntry[] | string {
  if (size < 22) return t('ce fichier n’est pas un zip');
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = readAt(fd, size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return t('ce fichier n’est pas un zip');
  if (tail.readUInt16LE(eocd + 4) !== 0 || tail.readUInt16LE(eocd + 6) !== 0) return t('zip en plusieurs morceaux');
  const count = tail.readUInt16LE(eocd + 10);
  const dirSize = tail.readUInt32LE(eocd + 12);
  const dirOffset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff) return t('zip de plus de 4 Gio (Zip64), non pris en charge');
  if (count > PACK_MAX_FILES + 1) return t('trop de fichiers ({n} au plus)', { n: PACK_MAX_FILES });
  if (dirOffset + dirSize > size - tailLength + eocd) return t('zip abîmé');
  const dir = readAt(fd, dirOffset, dirSize);
  const entries: PackEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > dir.length || dir.readUInt32LE(p) !== 0x02014b50) return t('zip abîmé');
    const flags = dir.readUInt16LE(p + 8);
    const nameLength = dir.readUInt16LE(p + 28);
    const raw = dir.subarray(p + 46, p + 46 + nameLength);
    entries.push({
      // Bit 11 : nom en UTF-8 ; sinon page de code DOS, lue en latin-1. Les barres inverses sont gardées : elles font refuser le nom.
      name: flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1'),
      method: dir.readUInt16LE(p + 10),
      flags,
      crc: dir.readUInt32LE(p + 16),
      compressedSize: dir.readUInt32LE(p + 20),
      size: dir.readUInt32LE(p + 24),
      offset: dir.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + dir.readUInt16LE(p + 30) + dir.readUInt16LE(p + 32);
  }
  return entries;
}

/** Début des données d'un fichier du zip, après son en-tête local ; undefined si l'en-tête est faux. */
function dataStart(fd: number, entry: PackEntry, size: number): number | undefined {
  const h = readAt(fd, entry.offset, 30);
  if (h.length < 30 || h.readUInt32LE(0) !== 0x04034b50) return undefined;
  const start = entry.offset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  return start + entry.compressedSize <= size ? start : undefined;
}

/** Contenu d'un petit fichier du zip (le manifeste), décompressé sans dépasser `max`. */
function readSmallEntry(fd: number, entry: PackEntry, size: number, max: number): Buffer | string {
  if (entry.flags & 1) return t('fichier chiffré');
  if (entry.size > max || entry.compressedSize > max) return t('manifeste trop gros');
  const start = dataStart(fd, entry, size);
  if (start === undefined) return t('zip abîmé');
  const body = readAt(fd, start, entry.compressedSize);
  let data: Buffer;
  if (entry.method === 0) data = body;
  else if (entry.method === 8) {
    try {
      data = zlib.inflateRawSync(body, { maxOutputLength: max });
    } catch {
      return t('zip abîmé');
    }
  } else return t('compression non prise en charge');
  if (data.length !== entry.size || crc32(data) !== entry.crc) return t('zip abîmé');
  return data;
}

// ---------------------------------------------------------------------------
// Écriture

export interface PackMediaInput {
  file: string;
  type: MediaType;
  page?: number;
  origin?: PackOrigin;
  credit?: string;
}

export interface PackTableInput {
  table: TableIdentity;
  medias: PackMediaInput[];
}

export interface PackWriteOptions {
  /** Pseudonyme et clé du joueur : le manifeste est signé. Sans clé, le paquet est « d'auteur inconnu ». */
  author?: { name?: string; key: PlayerKey };
  note?: string;
  app?: string;
  now?: Date;
}

export interface PackWriteResult {
  /** Médias écrits ; 0 : aucun fichier n'a été créé. */
  written: number;
  /** Taille du paquet, en octets. */
  bytes: number;
  refused: { file: string; reason: string }[];
  manifest?: PackManifest;
}

/** Premiers octets et taille d'un fichier de la borne. */
function headOf(file: string): { head: Buffer; bytes: number } | undefined {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      return { head: readAt(fd, 0, 512), bytes: fs.fstatSync(fd).size };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/**
 * Écrit le paquet `to` (fichier temporaire, puis renommage). Chaque média passe les contrôles
 * de l'import avant d'être écrit : un paquet de Cyber Pinball ne contient rien qu'une autre
 * borne refuserait. Un même contenu n'est mis qu'une fois par table.
 */
export async function writeMediaPack(to: string, tables: PackTableInput[], opts: PackWriteOptions = {}): Promise<PackWriteResult> {
  const when = dosDateTime(opts.now ?? new Date());
  const refused: PackWriteResult['refused'] = [];
  const manifestTables: PackTable[] = [];
  const centrals: Buffer[] = [];
  const folders = new Set<string>();
  let offset = 0;
  let count = 0;
  const tmp = `${to}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const out = await fs.promises.open(tmp, 'w');
  try {
    for (const input of tables) {
      let folder = tableFolder(input.table);
      for (let n = 2; folders.has(folder.toLowerCase()); n++) folder = `${tableFolder(input.table)} ${n}`;
      const medias: PackMedia[] = [];
      const names = new Set<string>();
      for (const m of input.medias) {
        const read = headOf(m.file);
        if (!read) {
          refused.push({ file: m.file, reason: t('fichier illisible') });
          continue;
        }
        const check = checkShareable(m.type, m.file, read.head, read.bytes);
        if (!check.ok) {
          refused.push({ file: m.file, reason: check.reason });
          continue;
        }
        const page = Number.isInteger(m.page) && m.page! > 1 && m.page! < 100 ? m.page : undefined;
        const name = `${folder}/(${mediaTypeInfo(m.type).type}) ${folder}${page ? ` ${page}` : ''}.${check.format}`;
        if (names.has(name.toLowerCase())) {
          refused.push({ file: m.file, reason: t('même média en double') });
          continue;
        }
        const nameBytes = Buffer.from(name, 'utf8');
        if (count >= PACK_MAX_FILES || offset + 30 + nameBytes.length + read.bytes + 2 * MANIFEST_MAX > ZIP_LIMIT) {
          refused.push({ file: m.file, reason: t('paquet plein : en faire un second') });
          continue;
        }
        // En-tête provisoire, données, puis CRC réécrit à sa place : une seule lecture du fichier.
        const entry: EntryHeader = { name: nameBytes, crc: 0, size: read.bytes, offset };
        await out.write(Buffer.concat([localHeader(entry, when), nameBytes]), 0, 30 + nameBytes.length, offset);
        const hash = createHash('sha256');
        let crc = 0;
        let pos = offset + 30 + nameBytes.length;
        for await (const chunk of fs.createReadStream(m.file, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
          hash.update(chunk);
          crc = crc32(chunk, crc);
          await out.write(chunk, 0, chunk.length, pos);
          pos += chunk.length;
        }
        const written = pos - (offset + 30 + nameBytes.length);
        if (written !== read.bytes) {
          // Le fichier a changé pendant la copie : la place est reprise par le suivant.
          refused.push({ file: m.file, reason: t('fichier modifié pendant la copie') });
          continue;
        }
        const sha256 = hash.digest('hex');
        if (medias.some((x) => x.sha256 === sha256 && x.type === m.type)) {
          refused.push({ file: m.file, reason: t('même média en double') });
          continue;
        }
        entry.crc = crc;
        const crcBytes = Buffer.alloc(4);
        crcBytes.writeUInt32LE(crc, 0);
        await out.write(crcBytes, 0, 4, offset + 14);
        centrals.push(centralHeader(entry, when));
        names.add(name.toLowerCase());
        offset = pos;
        count++;
        const origin = cleanOrigin(m.origin);
        const credit = cleanText(m.credit);
        medias.push({ path: name, type: m.type, kind: check.kind, format: check.format, bytes: read.bytes, sha256, ...(page ? { page } : {}), ...(origin ? { origin } : {}), ...(credit ? { credit } : {}) });
      }
      if (medias.length) {
        folders.add(folder.toLowerCase());
        manifestTables.push({ table: input.table, medias });
      }
    }
    if (count === 0) {
      await out.close();
      fs.rmSync(tmp, { force: true });
      return { written: 0, bytes: 0, refused };
    }
    const name = cleanText(opts.author?.name, 40);
    const note = cleanText(opts.note, 1000);
    const app = cleanText(opts.app, 80);
    const manifest: PackManifest = {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      createdAt: (opts.now ?? new Date()).toISOString(),
      ...(app ? { app } : {}),
      ...(opts.author ? { author: { ...(name ? { name } : {}), publicKey: opts.author.key.publicKey } } : {}),
      ...(note ? { note } : {}),
      tables: manifestTables,
    };
    const text = JSON.stringify(manifest, null, 2);
    const envelope = JSON.stringify({ manifest: text, ...(opts.author ? { signature: signText(text, opts.author.key) } : {}) }, null, 2) + '\n';
    const body = Buffer.from(envelope, 'utf8');
    const manifestName = Buffer.from(PACK_MANIFEST, 'utf8');
    const manifestEntry: EntryHeader = { name: manifestName, crc: crc32(body), size: body.length, offset };
    await out.write(Buffer.concat([localHeader(manifestEntry, when), manifestName, body]), 0, 30 + manifestName.length + body.length, offset);
    offset += 30 + manifestName.length + body.length;
    centrals.push(centralHeader(manifestEntry, when));
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(centrals.length, 8);
    end.writeUInt16LE(centrals.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    await out.write(Buffer.concat([directory, end]), 0, directory.length + 22, offset);
    const bytes = offset + directory.length + 22;
    await out.truncate(bytes);
    await out.close();
    fs.renameSync(tmp, to);
    return { written: count, bytes, refused, manifest };
  } catch (err) {
    await out.close().catch(() => undefined);
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Lecture

/** « valid » : signé par la clé annoncée ; « none » : auteur inconnu. Une signature fausse fait refuser le paquet. */
export type PackSignature = 'valid' | 'none';

export interface PackItem {
  /** Rang de la table dans le manifeste. */
  table: number;
  media: PackMedia;
  status: 'ok' | 'refused';
  reason?: string;
  /** Fichier du zip (pour un média accepté). */
  entry?: PackEntry;
}

export interface MediaPack {
  file: string;
  manifest: PackManifest;
  signature: PackSignature;
  items: PackItem[];
  /** Fichiers du zip que le manifeste ne décrit pas : jamais extraits. */
  extras: { name: string; reason: string }[];
}

export type PackRead = { ok: true; pack: MediaPack } | { ok: false; reason: string };

/**
 * Lit un paquet sans en extraire les médias : manifeste, signature, et pour chaque média,
 * accepté ou refusé avec la raison. Le contenu des médias n'est contrôlé qu'à l'extraction.
 */
export function readMediaPack(file: string): PackRead {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return { ok: false, reason: t('fichier illisible') };
  }
  try {
    const size = fs.fstatSync(fd).size;
    const entries = readCentralDirectory(fd, size);
    if (typeof entries === 'string') return { ok: false, reason: entries };
    const manifestEntry = entries.find((e) => e.name === PACK_MANIFEST);
    if (!manifestEntry) return { ok: false, reason: t('ce zip n’est pas un paquet de médias de Cyber Pinball') };
    const data = readSmallEntry(fd, manifestEntry, size, MANIFEST_MAX);
    if (typeof data === 'string') return { ok: false, reason: data };
    let envelope: { manifest?: unknown; signature?: unknown };
    let raw: Partial<PackManifest> & Record<string, unknown>;
    try {
      envelope = JSON.parse(data.toString('utf8').replace(/^﻿/, '')) as typeof envelope;
      if (typeof envelope.manifest !== 'string') throw new Error('manifest');
      raw = JSON.parse(envelope.manifest) as typeof raw;
    } catch {
      return { ok: false, reason: t('manifeste illisible') };
    }
    if (!raw || raw.format !== PACK_FORMAT || typeof raw.version !== 'number' || !Array.isArray(raw.tables)) return { ok: false, reason: t('manifeste illisible') };
    if (raw.version > PACK_VERSION) return { ok: false, reason: t('paquet fait par une version plus récente de Cyber Pinball') };

    const publicKey = raw.author && typeof raw.author === 'object' ? (raw.author as { publicKey?: unknown }).publicKey : undefined;
    let signature: PackSignature = 'none';
    if (envelope.signature !== undefined || publicKey !== undefined) {
      if (!isPlayerPublicKey(publicKey) || typeof envelope.signature !== 'string' || !verifyText(envelope.manifest as string, envelope.signature, publicKey)) {
        return { ok: false, reason: t('signature fausse : le paquet a été modifié après avoir été signé') };
      }
      signature = 'valid';
    }

    const byName = new Map(entries.map((e) => [e.name, e]));
    const used = new Set<string>([PACK_MANIFEST]);
    const items: PackItem[] = [];
    const tables: PackTable[] = [];
    let total = 0;
    raw.tables.forEach((rawTable: unknown, index) => {
      const tableObj = (rawTable && typeof rawTable === 'object' ? rawTable : {}) as { table?: unknown; medias?: unknown };
      const identity = parseTableIdentity(tableObj.table);
      const medias: PackMedia[] = [];
      // Un média jugé : accepté, ou refusé avec la raison (« return refuse » passe au suivant).
      const judge = (rawMedia: unknown) => {
        const m = (rawMedia && typeof rawMedia === 'object' ? rawMedia : {}) as Record<string, unknown>;
        const refuse = (reason: string, media?: Partial<PackMedia>) => {
          items.push({ table: index, media: { path: typeof m.path === 'string' ? m.path.slice(0, 255) : '', ...media } as PackMedia, status: 'refused', reason });
        };
        if (++total > PACK_MAX_FILES) return refuse(t('trop de fichiers ({n} au plus)', { n: PACK_MAX_FILES }));
        const type = shareableType(m.type);
        if (!type) return refuse(t('type de média inconnu ou qui ne se partage pas'));
        const mediaPath = typeof m.path === 'string' ? m.path : '';
        if (!isSafePackPath(mediaPath)) return refuse(t('nom de fichier refusé (chemin hors du paquet ou caractère interdit)'), { type });
        if (used.has(mediaPath)) return refuse(t('même fichier décrit deux fois'), { type });
        const format = path.posix.extname(mediaPath).slice(1).toLowerCase();
        const kind = mediaKind(`x.${format}`);
        if (!kind || !mediaTypeInfo(type).formats.includes(format)) return refuse(t('format .{ext} refusé pour {label}', { ext: format, label: mediaTypeInfo(type).label }), { type });
        if (!isSha256(m.sha256)) return refuse(t('empreinte absente du manifeste'), { type });
        const bytes = m.bytes;
        if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || bytes > SHARE_MAX_BYTES[kind]) return refuse(t('taille refusée'), { type });
        const page = typeof m.page === 'number' && Number.isInteger(m.page) && m.page > 1 && m.page < 100 ? m.page : undefined;
        const origin = cleanOrigin(m.origin);
        const credit = cleanText(m.credit);
        const media: PackMedia = { path: mediaPath, type, kind, format, bytes, sha256: m.sha256, ...(page ? { page } : {}), ...(origin ? { origin } : {}), ...(credit ? { credit } : {}) };
        used.add(mediaPath);
        medias.push(media);
        if (!identity) return refuse(t('table sans identité (ni VPS, ni ROM, ni titre)'), media);
        const entry = byName.get(mediaPath);
        if (!entry) return refuse(t('fichier absent du paquet'), media);
        if (entry.flags & 1) return refuse(t('fichier chiffré'), media);
        if (entry.method !== 0 && entry.method !== 8) return refuse(t('compression non prise en charge'), media);
        if (entry.size !== bytes) return refuse(t('taille différente de celle du manifeste'), media);
        items.push({ table: index, media, status: 'ok', entry });
      };
      for (const rawMedia of Array.isArray(tableObj.medias) ? tableObj.medias : []) judge(rawMedia);
      tables.push({ table: identity ?? { title: '' }, medias });
    });
    const extras = entries
      .filter((e) => !used.has(e.name) && !e.name.endsWith('/'))
      .map((e) => ({ name: e.name.slice(0, 255), reason: t('absent du manifeste : ignoré') }));
    const author = raw.author as { name?: unknown } | undefined;
    const authorName = cleanText(author?.name, 40);
    const app = cleanText(raw.app, 80);
    const note = cleanText(raw.note, 1000);
    const manifest: PackManifest = {
      format: PACK_FORMAT,
      version: raw.version,
      createdAt: typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : '',
      ...(app ? { app } : {}),
      ...(signature === 'valid' ? { author: { ...(authorName ? { name: authorName } : {}), publicKey: publicKey as string } } : {}),
      ...(note ? { note } : {}),
      tables,
    };
    return { ok: true, pack: { file, manifest, signature, items, extras } };
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Extraction

export interface ExtractedMedia {
  item: PackItem;
  /** Fichier extrait et vérifié, dans le dossier d'attente. */
  file?: string;
  reason?: string;
}

class PackStreamError extends Error {}

/**
 * Extrait les médias acceptés de `pack` dans `dir` (dossier d'attente, jamais medias\), sous
 * le nom « <sha256>.<ext> » : un même contenu reçu deux fois n'est gardé qu'une fois. Chaque
 * fichier est vérifié pendant la copie (jamais plus d'octets qu'annoncé), puis sur sa taille,
 * son CRC, son SHA-256 et ses premiers octets ; un fichier qui échoue est effacé.
 */
export async function extractMediaPack(pack: MediaPack, dir: string, opts: { only?: (item: PackItem) => boolean } = {}): Promise<ExtractedMedia[]> {
  fs.mkdirSync(dir, { recursive: true });
  const out: ExtractedMedia[] = [];
  const fd = fs.openSync(pack.file, 'r');
  let size: number;
  try {
    size = fs.fstatSync(fd).size;
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
  try {
    for (const item of pack.items) {
      if (item.status !== 'ok' || !item.entry || (opts.only && !opts.only(item))) continue;
      const { entry, media } = item;
      const start = dataStart(fd, entry, size);
      if (start === undefined || entry.compressedSize === 0) {
        out.push({ item, reason: t('zip abîmé') });
        continue;
      }
      const final = path.join(dir, `${media.sha256}.${media.format}`);
      const tmp = path.join(dir, `.${media.sha256}.${process.pid}.part`);
      const hash = createHash('sha256');
      let crc = 0;
      let count = 0;
      const head: Buffer[] = [];
      let headLength = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _enc, done) {
          count += chunk.length;
          // Bombe zip : on s'arrête au premier octet de trop.
          if (count > media.bytes) return done(new PackStreamError(t('plus d’octets que ne le dit le manifeste')));
          hash.update(chunk);
          crc = crc32(chunk, crc);
          if (headLength < 512) {
            head.push(chunk.subarray(0, 512 - headLength));
            headLength += Math.min(chunk.length, 512 - headLength);
          }
          done(null, chunk);
        },
      });
      const source = fs.createReadStream(pack.file, { start, end: start + entry.compressedSize - 1, highWaterMark: 1 << 20 });
      const sink = fs.createWriteStream(tmp);
      let reason: string | undefined;
      try {
        if (entry.method === 8) await pipeline(source, zlib.createInflateRaw(), meter, sink);
        else await pipeline(source, meter, sink);
        if (count !== media.bytes) reason = t('taille différente de celle du manifeste');
        else if (crc !== entry.crc) reason = t('zip abîmé');
        else if (hash.digest('hex') !== media.sha256) reason = t('empreinte différente de celle du manifeste');
        else {
          const check = checkShareable(media.type, media.path, Buffer.concat(head), count);
          if (!check.ok) reason = check.reason;
        }
      } catch (err) {
        reason = err instanceof PackStreamError ? err.message : t('zip abîmé');
      }
      // Windows n'efface pas un fichier encore ouvert : on attend que l'écriture soit fermée.
      if (!sink.closed) await once(sink, 'close').catch(() => undefined);
      if (reason) {
        fs.rmSync(tmp, { force: true });
        out.push({ item, reason });
        continue;
      }
      if (fs.existsSync(final)) fs.rmSync(tmp, { force: true });
      else fs.renameSync(tmp, final);
      out.push({ item, file: final });
    }
  } finally {
    fs.closeSync(fd);
  }
  return out;
}
