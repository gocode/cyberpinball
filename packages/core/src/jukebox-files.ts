// Fichiers locaux du Juke-box (jukebox.ts, source `file`) : on ajoute un fichier ou un dossier, sous-
// dossiers compris (décision du 09/11/2026), et le nombre de fichiers trouvés est annoncé avant
// l'ajout. Les fichiers sont lus à leur emplacement, jamais copiés.
//
// Formats acceptés : les vidéos et les sons que Chromium lit (MP4, WebM, MKV… ; MP3, M4A, FLAC, WAV,
// OGG…). Un fichier refusé est listé avec sa raison : format non pris en charge (AVI, WMA…), fichier
// vide, ou illisible (le début du fichier ne dit pas ce que dit son extension). Le reste d'un dossier
// (images, textes, listes) est ignoré sans bruit, compté à part.
//
// Pochette d'un fichier son, dans cet ordre (question 14 des maquettes) : l'image intégrée au fichier
// (ID3 APIC d'un MP3, covr d'un M4A, PICTURE d'un FLAC), puis l'image du dossier (cover, folder,
// front…), sinon aucune : le fronton montrera le visualiseur. Les étiquettes (titre, artiste, album)
// sont lues au même endroit ; une correction à la main l'emporte toujours (trackInfo).
//
// Fonctions de lecture du disque explicites : scanLocalMedia, readMediaTags, localCover. Ni les
// jonctions ni les liens symboliques ne sont suivis (incident du 29/10/2026 : une jonction qui
// ramenait au dossier principal).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t, tn } from './i18n';
import { localFileTitle, type JukeboxTrack, type TrackTags } from './jukebox';

export const JUKEBOX_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mkv', 'mov'] as const;
export const JUKEBOX_AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus'] as const;
/** Médias que Chromium ne lit pas : refusés avec leur raison (les autres fichiers sont ignorés sans bruit). */
export const REFUSED_MEDIA_EXTENSIONS = ['avi', 'wmv', 'wma', 'asf', 'flv', 'mpg', 'mpeg', 'vob', 'ts', 'm2ts', 'mts', '3gp', 'rm', 'rmvb', 'ape', 'wv', 'mka', 'aif', 'aiff', 'ac3', 'dts', 'amr', 'mid', 'midi', 'dsf', 'dff'] as const;
export const COVER_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
/** Noms d'image de dossier, par ordre de préférence. */
export const FOLDER_COVER_NAMES = ['cover', 'folder', 'front', 'album', 'albumart', 'pochette', 'jaquette', 'artwork'] as const;
/** Au plus, fichiers relevés en une fois (un disque entier choisi par erreur ne bloque pas l'écran). */
export const LOCAL_SCAN_LIMIT = 5000;

export type LocalRefusal = 'format' | 'empty' | 'unreadable';

export function localRefusalText(reason: LocalRefusal): string {
  switch (reason) {
    case 'format':
      return t('Format non pris en charge');
    case 'empty':
      return t('Fichier vide');
    default:
      return t('Fichier illisible');
  }
}

/** « Formats acceptés : MP4, M4V, WebM… ; MP3, M4A, FLAC… » */
export function acceptedFormatsText(): string {
  const up = (x: string) => (x === 'webm' ? 'WebM' : x.toUpperCase());
  return t('Vidéos : {video} · Sons : {audio}', { video: JUKEBOX_VIDEO_EXTENSIONS.map(up).join(', '), audio: JUKEBOX_AUDIO_EXTENSIONS.map(up).join(', ') });
}

const ext = (file: string) => path.extname(file).slice(1).toLowerCase();

/** Ce qu'est un fichier d'après son nom : une vidéo, un son, un média refusé ; undefined : pas un média (ignoré). */
export function classifyLocalName(file: string): { media: 'video' | 'audio' } | { refused: 'format' } | undefined {
  const e = ext(file);
  if ((JUKEBOX_VIDEO_EXTENSIONS as readonly string[]).includes(e)) return { media: 'video' };
  if ((JUKEBOX_AUDIO_EXTENSIONS as readonly string[]).includes(e)) return { media: 'audio' };
  if ((REFUSED_MEDIA_EXTENSIONS as readonly string[]).includes(e)) return { refused: 'format' };
  return undefined;
}

/** Le début du fichier dit-il bien ce que dit son extension ? */
export function sniffLocalMedia(head: Buffer, extension: string): boolean {
  const e = extension.toLowerCase();
  const at = (s: string, o = 0) => head.length >= o + s.length && head.toString('latin1', o, o + s.length) === s;
  const ebml = head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3;
  switch (e) {
    case 'mp4':
    case 'm4v':
    case 'm4a':
    case 'mov':
      return at('ftyp', 4) || at('moov', 4) || at('free', 4) || at('mdat', 4) || at('wide', 4) || at('skip', 4);
    case 'webm':
    case 'mkv':
      return ebml;
    case 'mp3':
      return at('ID3') || (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
    case 'aac':
      return at('ID3') || (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xf6) === 0xf0);
    case 'flac':
      return at('fLaC') || at('ID3');
    case 'wav':
      return at('RIFF') && at('WAVE', 8);
    case 'ogg':
    case 'oga':
    case 'opus':
      return at('OggS');
    default:
      return false;
  }
}

export interface LocalFound {
  path: string;
  media: 'video' | 'audio';
  bytes: number;
}

export interface LocalScan {
  /** Acceptés, dans l'ordre des dossiers puis des noms. */
  files: LocalFound[];
  refused: { path: string; reason: LocalRefusal; text: string }[];
  /** Autres fichiers (images, textes…), ignorés. */
  ignored: number;
  /** Dossiers parcourus (le dossier choisi compris). */
  folders: number;
  /** Arrêté à LOCAL_SCAN_LIMIT fichiers. */
  truncated: boolean;
  /** Chemins choisis introuvables. */
  missing: string[];
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function readHead(file: string, n = 16): Buffer | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Relève les médias d'un ou plusieurs chemins (fichiers ou dossiers, sous-dossiers compris), sans
 * suivre jonctions ni liens symboliques ; les dossiers cachés et système sont sautés. Chaque média
 * accepté est vérifié par son début (sniffLocalMedia).
 */
export function scanLocalMedia(paths: readonly string[], opts: { limit?: number } = {}): LocalScan {
  const limit = opts.limit ?? LOCAL_SCAN_LIMIT;
  const out: LocalScan = { files: [], refused: [], ignored: 0, folders: 0, truncated: false, missing: [] };
  const seen = new Set<string>();
  const take = (file: string, size: number) => {
    const key = file.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const kind = classifyLocalName(file);
    if (!kind) return void out.ignored++;
    if (out.files.length + out.refused.length >= limit) return void (out.truncated = true);
    if ('refused' in kind) return void out.refused.push({ path: file, reason: 'format', text: localRefusalText('format') });
    if (size === 0) return void out.refused.push({ path: file, reason: 'empty', text: localRefusalText('empty') });
    const head = readHead(file);
    if (!head || !sniffLocalMedia(head, ext(file))) return void out.refused.push({ path: file, reason: 'unreadable', text: localRefusalText('unreadable') });
    out.files.push({ path: file, media: kind.media, bytes: size });
  };
  const walk = (dir: string, depth: number) => {
    if (out.truncated || depth > 32) return;
    out.folders++;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => collator.compare(a.name, b.name));
    const sub: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name.startsWith('$') || /^system volume information$/i.test(e.name)) continue;
        sub.push(full);
      } else if (e.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        take(full, size);
      }
    }
    for (const d of sub) {
      // Une jonction (dossier relié ailleurs) se lit comme un dossier : lstat la reconnaît.
      try {
        if (fs.lstatSync(d).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      walk(d, depth + 1);
    }
  };
  for (const p of paths) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      out.missing.push(p);
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, 0);
    else if (st.isFile()) take(p, st.size);
  }
  return out;
}

/** « 24 fichiers trouvés dans 3 dossiers · 2 refusés », annoncé avant l'ajout. */
export function localScanSummary(scan: LocalScan): string {
  const parts = [scan.folders > 1 ? t('{files} dans {folders}', { files: tn(scan.files.length, '{n} fichier trouvé', '{n} fichiers trouvés'), folders: tn(scan.folders, '{n} dossier', '{n} dossiers') }) : tn(scan.files.length, '{n} fichier trouvé', '{n} fichiers trouvés')];
  if (scan.refused.length) parts.push(tn(scan.refused.length, '{n} refusé', '{n} refusés'));
  if (scan.truncated) parts.push(t('relevé arrêté à {n} fichiers', { n: LOCAL_SCAN_LIMIT }));
  return parts.join(' · ');
}

/** Morceaux tirés des fichiers acceptés (titre : étiquettes du fichier, sinon son nom). */
export function localTracks(files: readonly LocalFound[], now: Date, tagsOf: (file: string) => TrackTags | undefined = () => undefined): Omit<JukeboxTrack, 'key'>[] {
  return files.map((f) => {
    const tags = tagsOf(f.path);
    return { source: 'file', path: f.path, media: f.media, title: localFileTitle(f.path), ...(tags && Object.keys(tags).length ? { tags } : {}), added: now.toISOString() };
  });
}

// ---------------------------------------------------------------------------
// Étiquettes et pochette intégrée

export interface EmbeddedCover {
  mime: string;
  data: Buffer;
}

export interface MediaTags extends TrackTags {
  cover?: EmbeddedCover;
}

/** Au plus, octets lus pour les étiquettes (une pochette intégrée dépasse rarement quelques Mo). */
const MAX_TAG_BYTES = 32 * 1024 * 1024;

function readAt(fd: number, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let got = 0;
  while (got < length) {
    const n = fs.readSync(fd, buf, got, length - got, offset + got);
    if (n <= 0) break;
    got += n;
  }
  return buf.subarray(0, got);
}

const imageMime = (data: Buffer, declared?: string): string => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data.length >= 8 && data.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (data.length >= 12 && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return declared && /^image\//.test(declared) ? declared : 'image/jpeg';
};

/** Texte d'un cadre ID3 selon son encodage (0 : Latin-1, 1 : UTF-16 avec BOM, 2 : UTF-16BE, 3 : UTF-8). */
function id3Text(enc: number, b: Buffer): string {
  let s: string;
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    let start = 0;
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) [le, start] = [true, 2];
    else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) [le, start] = [false, 2];
    const body = Buffer.from(b.subarray(start, start + ((b.length - start) & ~1)));
    if (!le) body.swap16();
    s = body.toString('utf16le');
  } else s = b.toString(enc === 3 ? 'utf8' : 'latin1');
  return s.replace(/\0+$/, '').split('\0')[0]!.trim();
}

/** Fin d'une chaîne terminée par zéro (un octet, ou deux en UTF-16 alignés). */
function id3Terminator(b: Buffer, from: number, enc: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i;
}

const syncsafe = (b: Buffer, o: number) => ((b[o]! & 0x7f) << 21) | ((b[o + 1]! & 0x7f) << 14) | ((b[o + 2]! & 0x7f) << 7) | (b[o + 3]! & 0x7f);
const unsync = (b: Buffer) => {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]!);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Buffer.from(out);
};

/** Étiquettes ID3v2 (2.2, 2.3, 2.4) : TIT2, TPE1, TALB et la pochette APIC (la couverture d'abord). */
export function parseId3(tag: Buffer): MediaTags | undefined {
  if (tag.length < 10 || tag.toString('latin1', 0, 3) !== 'ID3') return undefined;
  const major = tag[3]!;
  const flags = tag[5]!;
  const size = syncsafe(tag, 6);
  let body = tag.subarray(10, 10 + size);
  if (major < 4 && flags & 0x80) body = unsync(body);
  let pos = 0;
  if (flags & 0x40 && major >= 3) pos = major === 4 ? syncsafe(body, 0) : body.readUInt32BE(0) + 4;
  const out: MediaTags = {};
  let cover: { type: number; c: EmbeddedCover } | undefined;
  const idLen = major === 2 ? 3 : 4;
  const head = major === 2 ? 6 : 10;
  while (pos + head <= body.length) {
    const id = body.toString('latin1', pos, pos + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const len = major === 2 ? (body[pos + 3]! << 16) | (body[pos + 4]! << 8) | body[pos + 5]! : major === 4 ? syncsafe(body, pos + 4) : body.readUInt32BE(pos + 4);
    const fflags = major === 2 ? 0 : body.readUInt16BE(pos + 8);
    let data = body.subarray(pos + head, pos + head + len);
    pos += head + len;
    if (len <= 0) continue;
    if (major === 4) {
      if (fflags & 0x0001) data = data.subarray(4);
      if (fflags & 0x0002) data = unsync(data);
    }
    const enc = data[0] ?? 0;
    if (id === 'TIT2' || id === 'TT2') out.title = id3Text(enc, data.subarray(1)) || out.title;
    else if (id === 'TPE1' || id === 'TP1') out.artist = id3Text(enc, data.subarray(1)) || out.artist;
    else if (id === 'TALB' || id === 'TAL') out.album = id3Text(enc, data.subarray(1)) || out.album;
    else if (id === 'APIC' || id === 'PIC') {
      let p = 1;
      let mime: string;
      if (id === 'PIC') {
        mime = `image/${data.toString('latin1', 1, 4).toLowerCase().replace('jpg', 'jpeg')}`;
        p = 4;
      } else {
        const end = data.indexOf(0, 1);
        if (end < 0) continue;
        mime = data.toString('latin1', 1, end).toLowerCase();
        p = end + 1;
      }
      const type = data[p] ?? 0;
      const descEnd = id3Terminator(data, p + 1, enc);
      const img = data.subarray(descEnd + (enc === 1 || enc === 2 ? 2 : 1));
      if (img.length < 8) continue;
      if (!cover || (type === 3 && cover.type !== 3)) cover = { type, c: { mime: imageMime(img, mime), data: Buffer.from(img) } };
    }
  }
  if (cover) out.cover = cover.c;
  for (const k of ['title', 'artist', 'album'] as const) if (!out[k]) delete out[k];
  return out;
}

/** Commentaires Vorbis (« ARTIST=… ») d'un bloc FLAC ou d'un flux Ogg. */
function vorbisComments(b: Buffer, out: MediaTags): void {
  if (b.length < 8) return;
  let p = 4 + b.readUInt32LE(0);
  if (p + 4 > b.length) return;
  const count = b.readUInt32LE(p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = b.readUInt32LE(p);
    const c = b.toString('utf8', p + 4, p + 4 + len);
    p += 4 + len;
    const eq = c.indexOf('=');
    if (eq < 0) continue;
    const key = c.slice(0, eq).toUpperCase();
    const value = c.slice(eq + 1).trim();
    if (!value) continue;
    if (key === 'TITLE') out.title ??= value;
    else if (key === 'ARTIST') out.artist ??= value;
    else if (key === 'ALBUM') out.album ??= value;
  }
}

/** Bloc PICTURE d'un FLAC. */
function flacPicture(b: Buffer): { type: number; c: EmbeddedCover } | undefined {
  if (b.length < 32) return undefined;
  const type = b.readUInt32BE(0);
  let p = 4;
  const mimeLen = b.readUInt32BE(p);
  const mime = b.toString('latin1', p + 4, p + 4 + mimeLen);
  p += 4 + mimeLen;
  const descLen = b.readUInt32BE(p);
  p += 4 + descLen + 16;
  if (p + 4 > b.length) return undefined;
  const len = b.readUInt32BE(p);
  const data = b.subarray(p + 4, p + 4 + len);
  return data.length >= 8 ? { type, c: { mime: imageMime(data, mime), data: Buffer.from(data) } } : undefined;
}

function readFlac(fd: number, size: number): MediaTags | undefined {
  let pos = 0;
  const first = readAt(fd, 0, 10);
  // Un ID3 posé devant le flux FLAC : sauté.
  if (first.toString('latin1', 0, 3) === 'ID3') pos = 10 + syncsafe(first, 6);
  if (readAt(fd, pos, 4).toString('latin1') !== 'fLaC') return undefined;
  pos += 4;
  const out: MediaTags = {};
  let cover: { type: number; c: EmbeddedCover } | undefined;
  for (let guard = 0; guard < 128 && pos + 4 <= size; guard++) {
    const h = readAt(fd, pos, 4);
    if (h.length < 4) break;
    const last = (h[0]! & 0x80) !== 0;
    const type = h[0]! & 0x7f;
    const len = (h[1]! << 16) | (h[2]! << 8) | h[3]!;
    if ((type === 4 || type === 6) && len <= MAX_TAG_BYTES) {
      const b = readAt(fd, pos + 4, len);
      if (type === 4) vorbisComments(b, out);
      else {
        const pic = flacPicture(b);
        if (pic && (!cover || (pic.type === 3 && cover.type !== 3))) cover = pic;
      }
    }
    pos += 4 + len;
    if (last) break;
  }
  if (cover) out.cover = cover.c;
  return out;
}

/** Boîtes ISO BMFF d'un tampon : [type, début du contenu, fin]. */
function boxes(b: Buffer, from = 0, to = b.length): [string, number, number][] {
  const out: [string, number, number][] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = b.readUInt32BE(p);
    const type = b.toString('latin1', p + 4, p + 8);
    let head = 8;
    if (size === 1 && p + 16 <= to) {
      size = Number(b.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) size = to - p;
    if (size < head || p + size > to) break;
    out.push([type, p + head, p + size]);
    p += size;
  }
  return out;
}

function readMp4(fd: number, size: number): MediaTags | undefined {
  // La boîte moov peut être au début ou à la fin : on parcourt les en-têtes du fichier.
  let pos = 0;
  let moov: Buffer | undefined;
  for (let guard = 0; guard < 256 && pos + 8 <= size; guard++) {
    const h = readAt(fd, pos, 16);
    if (h.length < 8) break;
    let len = h.readUInt32BE(0);
    const type = h.toString('latin1', 4, 8);
    if (len === 1 && h.length >= 16) len = Number(h.readBigUInt64BE(8));
    else if (len === 0) len = size - pos;
    if (len < 8) break;
    if (type === 'moov') {
      if (len > MAX_TAG_BYTES) return undefined;
      moov = readAt(fd, pos, len);
      break;
    }
    pos += len;
  }
  if (!moov) return undefined;
  const find = (b: Buffer, start: number, end: number, type: string) => boxes(b, start, end).find((x) => x[0] === type);
  const udta = find(moov, 8, moov.length, 'udta');
  const meta = udta ? find(moov, udta[1], udta[2], 'meta') : undefined;
  // meta est une boîte « pleine » : 4 octets de version et d'indicateurs avant ses enfants.
  const ilst = meta ? find(moov, meta[1] + 4, meta[2], 'ilst') : undefined;
  if (!ilst) return {};
  const out: MediaTags = {};
  for (const [type, start, end] of boxes(moov, ilst[1], ilst[2])) {
    const data = find(moov, start, end, 'data');
    if (!data || data[2] - data[1] < 8) continue;
    const kind = moov.readUInt32BE(data[1]) & 0xffffff;
    const payload = moov.subarray(data[1] + 8, data[2]);
    if (type === '©nam') out.title = payload.toString('utf8').trim() || undefined;
    else if (type === '©ART') out.artist = payload.toString('utf8').trim() || undefined;
    else if (type === 'aART' && !out.artist) out.artist = payload.toString('utf8').trim() || undefined;
    else if (type === '©alb') out.album = payload.toString('utf8').trim() || undefined;
    else if (type === 'covr' && !out.cover && payload.length >= 8) out.cover = { mime: kind === 14 ? 'image/png' : imageMime(payload), data: Buffer.from(payload) };
  }
  for (const k of ['title', 'artist', 'album'] as const) if (!out[k]) delete out[k];
  return out;
}

/** Étiquettes et pochette intégrée d'un fichier son ou vidéo (MP3, FLAC, M4A, MP4…) ; undefined : rien de lisible. */
export function readMediaTags(file: string): MediaTags | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const e = ext(file);
    if (e === 'flac') return readFlac(fd, size);
    if (e === 'm4a' || e === 'mp4' || e === 'm4v' || e === 'mov') return readMp4(fd, size);
    const head = readAt(fd, 0, 10);
    if (head.toString('latin1', 0, 3) !== 'ID3') return undefined;
    const total = 10 + syncsafe(head, 6) + (head[5]! & 0x10 ? 10 : 0);
    if (total > MAX_TAG_BYTES) return undefined;
    return parseId3(readAt(fd, 0, total));
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Image de dossier : cover, folder, front… dans cet ordre ; sinon la seule image du dossier. */
export function folderCoverName(names: readonly string[]): string | undefined {
  const images = names.filter((n) => (COVER_IMAGE_EXTENSIONS as readonly string[]).includes(ext(n)));
  for (const want of FOLDER_COVER_NAMES) {
    const hit = images.find((n) => path.basename(n, path.extname(n)).toLowerCase() === want);
    if (hit) return hit;
  }
  // Windows Media : AlbumArt_{…}_Large.jpg.
  const wmp = images.filter((n) => /^albumart_.*_large\./i.test(n));
  if (wmp.length) return wmp[0];
  return images.length === 1 ? images[0] : undefined;
}

export type LocalCover = { kind: 'embedded'; cover: EmbeddedCover } | { kind: 'folder'; path: string };

/** Pochette d'un fichier local : l'image intégrée, puis celle du dossier ; undefined : le visualiseur. */
export function localCover(file: string, tags?: MediaTags): LocalCover | undefined {
  const embedded = (tags ?? readMediaTags(file))?.cover;
  if (embedded) return { kind: 'embedded', cover: embedded };
  let names: string[];
  try {
    names = fs.readdirSync(path.dirname(file));
  } catch {
    return undefined;
  }
  const name = folderCoverName(names);
  return name ? { kind: 'folder', path: path.join(path.dirname(file), name) } : undefined;
}
