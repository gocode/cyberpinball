// Archives de ROM. PinMAME (VPinMAME, et le plugin PinMAME de VPX 10.8.1) lit les
// puces d'une ROM à la racine de son .zip : une archive dont les fichiers sont dans
// un sous-dossier (« t2_l8.zip › t2_l8 › t2_l8.rom ») n'est pas lue, et ses fichiers
// déballés ne servent à rien. Une ROM est donc reconnue d'après son contenu (des
// puces, toutes dans un même dossier), où qu'elle soit, puis refaite à plat.
// Lecture et écriture d'un zip simple (stocké ou deflate), sans Zip64 : une ROM pèse
// quelques Mo. L'écriture est déterministe : le même contenu donne les mêmes octets,
// donc la même empreinte dans la bibliothèque.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { romFamilyOf } from './romalias';

/** Un fichier dans un zip, d'après son répertoire central. */
export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  size: number;
  dosTime: number;
  dosDate: number;
  /** Position de l'en-tête local. */
  offset: number;
}

/** Fichier d'une ROM à refaire : fichier libre (from), ou fichier d'un zip (from + entry). */
export interface RomZipMember {
  from: string;
  /** Nom dans le zip refait, à la racine. */
  name: string;
  entry?: string;
}

/** Fichiers d'un zip, ou undefined si ce n'est pas un zip lisible. */
export function readZipEntries(file: string): ZipEntry[] | undefined {
  try {
    return zipEntriesOf(fs.readFileSync(file));
  } catch {
    return undefined;
  }
}

/**
 * Empreinte du contenu d'un zip : chemin, CRC et taille de chaque fichier. Deux zips
 * de la même ROM faits par des outils différents (compression, dates) ont la même ;
 * une ROM à sous-dossier n'a pas celle de sa version à plat. undefined : pas un zip.
 */
export function zipContentHash(data: Buffer): string | undefined {
  const entries = zipEntriesOf(data);
  if (!entries) return undefined;
  const lines = entries
    .filter((e) => !e.name.endsWith('/') && !isJunk(e.name))
    .map((e) => `${e.name.toLowerCase()}:${e.crc.toString(16)}:${e.size}`)
    .sort();
  return createHash('sha1').update(`zip\n${lines.join('\n')}`).digest('hex');
}

function zipEntriesOf(data: Buffer): ZipEntry[] | undefined {
  // Fin du répertoire central : cherchée depuis la fin (un commentaire peut la suivre).
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const count = data.readUInt16LE(eocd + 10);
  let p = data.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > data.length || data.readUInt32LE(p) !== 0x02014b50) return undefined;
    const flags = data.readUInt16LE(p + 8);
    const nameLength = data.readUInt16LE(p + 28);
    const extra = data.readUInt16LE(p + 30);
    const comment = data.readUInt16LE(p + 32);
    const raw = data.subarray(p + 46, p + 46 + nameLength);
    entries.push({
      // Bit 11 : nom en UTF-8 ; sinon page de code DOS, lue en latin-1 (les noms de puces sont en ASCII).
      name: (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1')).replace(/\\/g, '/'),
      method: data.readUInt16LE(p + 10),
      flags,
      dosTime: data.readUInt16LE(p + 12),
      dosDate: data.readUInt16LE(p + 14),
      crc: data.readUInt32LE(p + 16),
      compressedSize: data.readUInt32LE(p + 20),
      size: data.readUInt32LE(p + 24),
      offset: data.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}

/** Fichiers à mettre dans une ROM refaite à plat, triés : le même contenu donne le même zip. */
export function buildZip(members: RomZipMember[]): Buffer {
  const sorted = [...members].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const zips = new Map<string, { data: Buffer; entries: ZipEntry[] }>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const m of sorted) {
    let e: Omit<ZipEntry, 'offset' | 'name'>;
    let body: Buffer;
    if (m.entry !== undefined) {
      // Fichier d'un zip : recopié tel quel, compressé comme il l'était.
      let zip = zips.get(m.from);
      if (!zip) {
        zip = { data: fs.readFileSync(m.from), entries: readZipEntries(m.from) ?? [] };
        zips.set(m.from, zip);
      }
      const src = zip.entries.find((x) => x.name === m.entry || x.name.replace(/^\.\//, '') === m.entry);
      if (!src) throw new Error(`${m.entry}: not in ${path.basename(m.from)}`); // i18n-ignore : erreur interne, zip relu entre-temps
      const start = src.offset + 30 + zip.data.readUInt16LE(src.offset + 26) + zip.data.readUInt16LE(src.offset + 28);
      body = zip.data.subarray(start, start + src.compressedSize);
      // Bit 3 (descripteur après les données) retiré : tailles et CRC sont dans l'en-tête.
      e = { ...src, flags: src.flags & ~0x8 & ~0x800 };
    } else {
      const data = fs.readFileSync(m.from);
      const deflated = zlib.deflateRawSync(data, { level: 9 });
      const stored = deflated.length >= data.length;
      body = stored ? data : deflated;
      const { time, date } = dosDateTime(fs.statSync(m.from).mtime);
      e = { method: stored ? 0 : 8, flags: 0, crc: crc32(data), compressedSize: body.length, size: data.length, dosTime: time, dosDate: date };
    }
    const name = Buffer.from(m.name, 'utf8');
    const utf8 = /[^\x20-\x7e]/.test(m.name) ? 0x800 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags | utf8, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.dosTime, 10);
    local.writeUInt16LE(e.dosDate, 12);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.compressedSize, 18);
    local.writeUInt32LE(e.size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.flags | utf8, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt16LE(e.dosTime, 12);
    central.writeUInt16LE(e.dosDate, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressedSize, 20);
    central.writeUInt32LE(e.size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Écrit une ROM refaite (fichier temporaire, puis renommage), datée comme son original. */
export function writeZipData(to: string, data: Buffer, mtimeMs?: number): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  if (mtimeMs !== undefined) fs.utimesSync(tmp, new Date(mtimeMs), new Date(mtimeMs));
  fs.renameSync(tmp, to);
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

let crcTable: Uint32Array | undefined;

function crc32(data: Buffer): number {
  const native = (zlib as { crc32?: (data: Buffer) => number }).crc32;
  if (native) return native(data) >>> 0;
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Extensions qui ne sont jamais des puces de ROM : fichiers d'une table, d'un pack
 * (vidéos, images, sons, couleurs), sauvegardes et réglages de PinMAME, programmes.
 */
const NOT_CHIP_EXT = new Set([
  '.vpx', '.vpt', '.directb2s', '.vbs', '.ini', '.pov', '.info', '.mp4', '.avi', '.f4v', '.mov', '.mkv', '.wmv', '.webm', '.m4v',
  '.mpg', '.mpeg', '.png', '.jpg', '.jpeg', '.apng', '.gif', '.bmp', '.webp', '.crz', '.crom', '.cromc', '.vni', '.pal', '.pac',
  '.mp3', '.ogg', '.wav', '.flac', '.csv', '.pup', '.pdf', '.zip', '.7z', '.rar', '.nv', '.cfg', '.hi', '.vgm', '.log', '.exe',
  '.dll', '.bat', '.cmd', '.ps1', '.json', '.xml', '.lnk', '.url', '.htm', '.html', '.md', '.rtf', '.doc', '.docx', '.ttf', '.otf',
  '.fnt', '.tmp',
]);
/** Notes livrées avec une ROM : tolérées, jamais reprises dans la ROM refaite. */
const NOTE_EXT = new Set(['.txt', '.nfo', '.diz']);
const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

const isJunk = (p: string) => {
  const parts = p.toLowerCase().split('/');
  const name = parts.at(-1)!;
  return parts.includes('__macosx') || JUNK_NAMES.has(name) || name.startsWith('._');
};

/** Un nom de fichier peut-il être une puce de ROM (t2_u14.l3, t2_l8.rom, sound3.u15) ? */
export function isChipName(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return !NOT_CHIP_EXT.has(ext) && !NOTE_EXT.has(ext) && !JUNK_NAMES.has(name.toLowerCase());
}

/** Contenu d'une ROM : ses puces, toutes dans un même dossier (« » à la racine). */
export interface RomContent {
  /** Dossier des puces, relatif (séparateur /), vide à la racine. */
  dir: string;
  /** Chemins relatifs des puces. */
  chips: string[];
}

/**
 * Ces fichiers (chemins relatifs, dossiers terminés par /) forment-ils une ROM ?
 * Oui s'ils sont tous des puces (notes et fichiers parasites tolérés), dans un même dossier.
 */
export function romContent(paths: string[]): RomContent | undefined {
  const files = paths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')).filter((p) => p && !p.endsWith('/') && !isJunk(p));
  const chips: string[] = [];
  for (const f of files) {
    const name = f.split('/').at(-1)!;
    if (NOTE_EXT.has(path.extname(name).toLowerCase())) continue;
    if (!isChipName(name)) return undefined;
    chips.push(f);
  }
  if (!chips.length) return undefined;
  const dirOf = (f: string) => f.split('/').slice(0, -1).join('/');
  const dir = dirOf(chips[0]!);
  if (chips.some((c) => dirOf(c).toLowerCase() !== dir.toLowerCase())) return undefined;
  return { dir, chips };
}

/** Fichiers d'un dossier, relatifs (séparateur /), sous-dossiers compris ; undefined au-delà de max. */
export function listRelative(dir: string, max = 200): string[] | undefined {
  const out: string[] = [];
  const walk = (d: string, rel: string): boolean => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const e of dirents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!walk(path.join(d, e.name), r)) return false;
      } else {
        out.push(r);
        if (out.length > max) return false;
      }
    }
    return true;
  };
  return walk(dir, '') ? out : undefined;
}

/** Ce que l'on sait des ROM : celles que demandent les tables, et les noms connus (base VPS, alias). */
export interface RomHints {
  /** Noms demandés par les scripts des tables (de l'import et installées). */
  wanted: string[];
  /** Noms de ROM connus, en minuscules. */
  known?: Set<string>;
}

/** Famille d'une puce ou d'une ROM : « t2 » pour t2_u14.l3 comme pour t2_l8. */
const familyOf = (name: string): string => romFamilyOf(name.replace(/\.[^.]+$/, ''));

/** Un nom qui peut être celui d'une ROM de PinMAME : court, sans espace (t2_l8, afm_113b, bond). */
export const looksLikeRomName = (name: string): boolean => /^[a-z0-9][a-z0-9_-]{1,15}$/i.test(name);

/**
 * Nom d'une ROM d'après ce qui l'entoure : le nom de l'archive, les dossiers qui
 * contiennent ses puces (le plus proche d'abord), les puces elles-mêmes.
 * 1. un nom demandé par une table, porté par l'archive ou un dossier ;
 * 2. un nom connu, porté par l'archive ou un dossier ;
 * 3. une puce nommée comme une ROM demandée ou connue (t2_l8.rom) ;
 * 4. la seule ROM demandée de la même famille que les puces (t2_u14.l3 → t2_l8) ;
 * 5. avec guess, le nom de l'archive ou du dossier s'il ressemble à un nom de ROM.
 */
export function recognizeRomName(around: { names: string[]; chips: string[] }, hints: RomHints, guess = false): string | undefined {
  const names = around.names.map((n) => n.replace(/\.(zip|7z|rar)$/i, '').trim()).filter(Boolean);
  const wanted = (n: string) => hints.wanted.find((w) => w.toLowerCase() === n.toLowerCase());
  const known = (n: string) => hints.known?.has(n.toLowerCase());
  for (const n of names) {
    const w = wanted(n);
    if (w) return w;
  }
  for (const n of names) if (known(n)) return n;
  const stems = around.chips.map((c) => path.basename(c).replace(/\.[^.]+$/, ''));
  for (const s of stems) {
    const w = wanted(s);
    if (w) return w;
  }
  for (const s of stems) if (known(s)) return s;
  const families = new Set(around.chips.map((c) => familyOf(path.basename(c))).filter((f) => f.length >= 2));
  const sameFamily = [...new Set(hints.wanted.map((w) => w.toLowerCase()))].filter((w) => families.has(familyOf(w)));
  if (sameFamily.length === 1) return wanted(sameFamily[0]!);
  if (guess) return names.find(looksLikeRomName);
  return undefined;
}
