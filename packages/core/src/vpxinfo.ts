// Information that the author wrote in the table itself (File > Table Info in the VPX
// editor): name, author, version, date, description.
// It survives renamings of the file: "GOTG_2.1.1.vpx" is still called
// "Guardians of the Galaxy" there. The in-depth media search uses it.
//
// A .vpx is an OLE compound file (Compound File Binary, [MS-CFB]). VPX stores
// this information in the "TableInfo" storage, one stream per field, in UTF-16LE
// without length or final zero (PinTable::SaveInfo, WriteInfoValue). The streams are
// small: they live in the mini stream. Only the header, the allocation
// table, the directory and those few sectors are read, never the hundreds of MB
// of images and sounds.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface VpxTableInfo {
  name?: string;
  author?: string;
  version?: string;
  releaseDate?: string;
  website?: string;
  blurb?: string;
  description?: string;
  rules?: string;
}

/** Streams of the TableInfo storage, and the field where they are stored. */
const FIELDS: Record<string, keyof VpxTableInfo> = {
  TableName: 'name',
  AuthorName: 'author',
  TableVersion: 'version',
  ReleaseDate: 'releaseDate',
  AuthorWebSite: 'website',
  TableBlurb: 'blurb',
  TableDescription: 'description',
  TableRules: 'rules',
};

const SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const END_OF_CHAIN = 0xfffffffe;
const MAX_SECTOR = 0xfffffffa;
/** Beyond this, a field is truncated: the game rules may be long, they are not needed in full. */
const MAX_FIELD_BYTES = 64 * 1024;

export interface DirEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

/**
 * Minimal compound file reader: header, FAT (with the DIFAT of large
 * files), directory and mini stream. Throws an error if the file is not one.
 * Also used for VPReg.stg, where VPX stores what the tables save (highscores.ts).
 */
export class CompoundFile {
  private readonly sectorSize: number;
  private readonly miniSectorSize: number;
  private readonly miniCutoff: number;
  private readonly fat: Uint32Array;
  private readonly fileSize: number;
  readonly entries: DirEntry[];
  private miniFat?: Uint32Array;
  private miniStream?: Buffer;
  private readonly dirStart: number;

  constructor(private readonly fd: number) {
    this.fileSize = fs.fstatSync(fd).size;
    const header = this.read(0, 512);
    if (!header.subarray(0, 8).equals(SIGNATURE)) throw new Error('ce n’est pas un fichier composé OLE'); // i18n-ignore: internal error, always caught
    this.sectorSize = 1 << header.readUInt16LE(0x1e);
    this.miniSectorSize = 1 << header.readUInt16LE(0x20);
    if (this.sectorSize !== 512 && this.sectorSize !== 4096) throw new Error('taille de secteur inattendue'); // i18n-ignore: internal error, always caught
    const fatCount = header.readUInt32LE(0x2c);
    this.miniCutoff = header.readUInt32LE(0x38);

    // Sectors of the FAT: 109 in the header, the rest in the DIFAT chain.
    const fatSectors: number[] = [];
    for (let i = 0; i < 109 && fatSectors.length < fatCount; i++) fatSectors.push(header.readUInt32LE(0x4c + i * 4));
    let difat = header.readUInt32LE(0x44);
    const perDifat = this.sectorSize / 4 - 1;
    for (let guard = 0; fatSectors.length < fatCount && difat <= MAX_SECTOR && guard < 1 << 20; guard++) {
      const sector = this.sector(difat);
      for (let i = 0; i < perDifat && fatSectors.length < fatCount; i++) fatSectors.push(sector.readUInt32LE(i * 4));
      difat = sector.readUInt32LE(perDifat * 4);
    }
    const fat = this.readSectors(fatSectors);
    this.fat = new Uint32Array(fat.buffer, fat.byteOffset, fat.length / 4);

    this.dirStart = header.readUInt32LE(0x30);
    const dir = this.chain(this.dirStart);
    this.entries = [];
    for (let off = 0; off + 128 <= dir.length; off += 128) {
      const nameLen = Math.min(64, dir.readUInt16LE(off + 0x40));
      this.entries.push({
        name: dir.toString('utf16le', off, off + Math.max(0, nameLen - 2)),
        type: dir[off + 0x42]!,
        left: dir.readUInt32LE(off + 0x44),
        right: dir.readUInt32LE(off + 0x48),
        child: dir.readUInt32LE(off + 0x4c),
        start: dir.readUInt32LE(off + 0x74),
        // Version 3: only the 32 low-order bits count.
        size: dir.readUInt32LE(off + 0x78),
      });
    }
    if (this.entries[0]?.type !== 5) throw new Error('répertoire du fichier composé illisible'); // i18n-ignore: internal error, always caught
    const miniFatStart = header.readUInt32LE(0x3c);
    if (miniFatStart <= MAX_SECTOR) {
      const miniFat = this.chain(miniFatStart);
      this.miniFat = new Uint32Array(miniFat.buffer, miniFat.byteOffset, miniFat.length / 4);
    }
  }

  private read(offset: number, length: number): Buffer {
    const buf = Buffer.alloc(length);
    const got = fs.readSync(this.fd, buf, 0, length, offset);
    return got === length ? buf : buf.subarray(0, got);
  }

  private sector(n: number): Buffer {
    const offset = (n + 1) * this.sectorSize;
    if (n > MAX_SECTOR || offset >= this.fileSize) throw new Error(`secteur ${n} hors du fichier`); // i18n-ignore: internal error, always caught
    return this.read(offset, this.sectorSize);
  }

  /**
   * These sectors, in order, put end to end. Sectors that follow each other in the file are
   * read in a single call: the allocation table of a 200 MB .vpx (1.6 MB) was read in 3,200
   * reads of 512 bytes, at each opening (17/11/2026). Same result as sector() one by one.
   */
  private readSectors(list: number[]): Buffer {
    const parts: Buffer[] = [];
    for (let i = 0; i < list.length; ) {
      let j = i;
      while (j + 1 < list.length && list[j + 1] === list[j]! + 1) j++;
      const first = list[i]!;
      const last = list[j]!;
      for (const n of [first, last]) {
        if (n > MAX_SECTOR || (n + 1) * this.sectorSize >= this.fileSize) throw new Error(`secteur ${n} hors du fichier`); // i18n-ignore: internal error, always caught
      }
      parts.push(this.read((first + 1) * this.sectorSize, (j - i + 1) * this.sectorSize));
      i = j + 1;
    }
    return Buffer.concat(parts);
  }

  /** Chain of sectors from `start`, up to `limit` bytes. */
  private chain(start: number, limit = Infinity): Buffer {
    const list: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s <= MAX_SECTOR && list.length * this.sectorSize < limit; s = this.fat[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de secteurs en boucle'); // i18n-ignore: internal error, always caught
      seen.add(s);
      list.push(s);
    }
    return this.readSectors(list);
  }

  /** Content of a stream, at most `limit` bytes. */
  stream(entry: DirEntry, limit = Infinity): Buffer {
    const size = Math.min(entry.size, limit);
    if (entry.size >= this.miniCutoff) return this.chain(entry.start, size).subarray(0, size);
    // Small stream: 64-byte sectors in the mini stream, carried by the root entry.
    this.miniStream ??= this.chain(this.entries[0]!.start, this.entries[0]!.size).subarray(0, this.entries[0]!.size);
    const parts: Buffer[] = [];
    let total = 0;
    const seen = new Set<number>();
    for (let s = entry.start; s <= MAX_SECTOR && total < size; s = this.miniFat?.[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de mini-secteurs en boucle'); // i18n-ignore: internal error, always caught
      seen.add(s);
      const part = this.miniStream.subarray(s * this.miniSectorSize, (s + 1) * this.miniSectorSize);
      parts.push(part);
      total += part.length;
    }
    return Buffer.concat(parts).subarray(0, size);
  }

  /** The sectors of a chain, in order. */
  private sectors(start: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s <= MAX_SECTOR; s = this.fat[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de secteurs en boucle'); // i18n-ignore: internal error, always caught
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  /**
   * Where the bytes of a stream live in the file: each sector (or 64-byte mini sector,
   * for a small stream) of its chain, with its place. Used to rewrite a value in place
   * (highscores.ts, patchVpRegValues), without touching the structure of the file.
   */
  spans(entry: DirEntry): { offset: number; length: number }[] {
    if (entry.size >= this.miniCutoff) return this.sectors(entry.start).map((s) => ({ offset: (s + 1) * this.sectorSize, length: this.sectorSize }));
    const root = this.sectors(this.entries[0]!.start);
    const out: { offset: number; length: number }[] = [];
    const seen = new Set<number>();
    for (let s = entry.start; s <= MAX_SECTOR; s = this.miniFat?.[s] ?? END_OF_CHAIN) {
      if (seen.has(s)) throw new Error('chaîne de mini-secteurs en boucle'); // i18n-ignore: internal error, always caught
      seen.add(s);
      const at = s * this.miniSectorSize;
      const sector = root[Math.floor(at / this.sectorSize)];
      if (sector === undefined) throw new Error('mini-secteur hors du mini-flux'); // i18n-ignore: internal error, always caught
      out.push({ offset: (sector + 1) * this.sectorSize + (at % this.sectorSize), length: this.miniSectorSize });
    }
    return out;
  }

  /** Position in the file of the directory entry `entry` (128 bytes; its size at +0x78). */
  entryOffset(entry: DirEntry): number {
    const index = this.entries.indexOf(entry);
    if (index < 0) throw new Error('entrée inconnue'); // i18n-ignore: internal error, always caught
    const sector = this.sectors(this.dirStart)[Math.floor((index * 128) / this.sectorSize)];
    if (sector === undefined) throw new Error('entrée hors du répertoire'); // i18n-ignore: internal error, always caught
    return (sector + 1) * this.sectorSize + ((index * 128) % this.sectorSize);
  }

  /** Children of a storage: the red-black tree of its entries, walked in full. */
  children(entry: DirEntry): DirEntry[] {
    const out: DirEntry[] = [];
    const seen = new Set<number>();
    const walk = (id: number) => {
      if (id > MAX_SECTOR || seen.has(id) || !this.entries[id]) return;
      seen.add(id);
      const e = this.entries[id]!;
      walk(e.left);
      out.push(e);
      walk(e.right);
    };
    walk(entry.child);
    return out;
  }
}

/** Text of a TableInfo stream: UTF-16LE, without the zeros or spaces at the ends. */
function decode(buf: Buffer): string {
  const even = buf.length - (buf.length % 2);
  return buf.toString('utf16le', 0, even).replace(/\0+$/g, '').replace(/\r\n/g, '\n').trim();
}

/** Beyond this, the screenshot is not read: it would no longer be a simple image. */
const MAX_SCREENSHOT_BYTES = 40 * 1024 * 1024;

const IMAGE_MAGIC: [string, number[]][] = [
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],
];

/**
 * Screenshot of the table chosen by its author (TableInfo/Screenshot stream): the bytes
 * of the original image file, often the playfield seen in full. Rare; undefined if the
 * table has none, or if it is not an image that the menu can read.
 */
export function readVpxScreenshot(file: string): { data: Buffer; ext: string } | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const storage = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'TableInfo');
    const entry = storage && cfb.children(storage).find((e) => e.type === 2 && e.name === 'Screenshot');
    if (!entry || !entry.size || entry.size > MAX_SCREENSHOT_BYTES) return undefined;
    const data = cfb.stream(entry);
    const ext = imageExt(data);
    return ext ? { data, ext } : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Format of an image from its signature; undefined if the menu cannot read it. */
function imageExt(data: Buffer): string | undefined {
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return IMAGE_MAGIC.find(([, magic]) => magic.every((b, i) => data[i] === b))?.[0];
}

/**
 * VPX BIFF records: [length on 4 bytes][tag of 4 letters][data
 * of length - 4]. Nested records (JPEG of an image) follow flat.
 */
function* biffRecords(data: Buffer): Generator<{ tag: string; body: Buffer }> {
  let pos = 0;
  while (pos + 8 <= data.length) {
    const size = data.readUInt32LE(pos);
    const tag = data.toString('latin1', pos + 4, pos + 8);
    if (size < 4 || pos + 4 + size > data.length) return;
    yield { tag, body: data.subarray(pos + 8, pos + 4 + size) };
    pos += 4 + size;
  }
}

/** BIFF string: [length on 4 bytes][bytes]. */
function biffString(body: Buffer): string {
  if (body.length < 4) return '';
  return body.toString('utf8', 4, 4 + Math.min(body.readUInt32LE(0), body.length - 4));
}

/** An image stored in the table (GameStg/ImageN): its name, its dimensions, its original file. */
export interface VpxImage {
  name: string;
  width: number;
  height: number;
  ext: string;
  data: Buffer;
}

export interface VpxImages {
  /** Image of the playfield (IMAG field of GameData), if it is a real top view. */
  playfield?: VpxImage;
  /** Rules card: the image that the rules Markdown designates, or with a telling name. */
  rules?: VpxImage;
  /** Backglasses of the VR room ("Pincab_BackglassImage", "backglassimage"...). */
  backglass: VpxImage[];
  /** Logos ("VR_Logo", "PinCab_Logo"...). */
  logos: VpxImage[];
}

/**
 * Names of the images stored in the table (GameStg/ImageN), without reading their bytes: only the start of each image is read.
 * For the DMD images that FlexDMD takes from the table (flexprewarm.ts). undefined if the file is not a readable .vpx.
 */
export function readVpxImageNames(file: string): { name: string; width: number; height: number }[] | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return [];
    const names: { name: string; width: number; height: number }[] = [];
    for (const entry of cfb.children(game).filter((e) => e.type === 2 && /^Image\d+$/.test(e.name))) {
      let name = '';
      let width = 0;
      let height = 0;
      for (const { tag, body } of biffRecords(cfb.stream(entry, 4096))) {
        if (tag === 'NAME' && !name) name = biffString(body);
        else if (tag === 'WDTH' && body.length >= 4) width = body.readUInt32LE(0);
        else if (tag === 'HGHT' && body.length >= 4) height = body.readUInt32LE(0);
        else if (tag === 'JPEG' || tag === 'BITS' || tag === 'DATA') break;
      }
      if (name) names.push({ name, width, height });
    }
    return names;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Beyond this, an image is not read (a 4K texture as PNG is already 20 MB). */
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
/** Images of each kind kept, at most. */
const MAX_PER_KIND = 3;

/**
 * Images useful to the menu, stored in the table by its author:
 * - the playfield image designated by IMAG, top view flat, except the atlases of the
 *   Visual Light Mapper ("VLM.", "Nestmap", square image);
 * - the rules card designated by `![…](nom)` in TableRules, otherwise an image with a name
 *   of rules or of instruction card, wider than tall;
 * - the backglasses and logos of the VR room, recognised by their name.
 * Only the start of each image is read for its name; its bytes only if it is used.
 * undefined if the file is not readable as a .vpx.
 */
export function readVpxImages(file: string, rules?: string): VpxImages | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const out: VpxImages = { backglass: [], logos: [] };
    if (!game) return out;
    const streams = cfb.children(game).filter((e) => e.type === 2);
    // Name of the playfield image, in GameData (read up to IMAG, which comes early, before the script).
    const gameData = streams.find((e) => e.name === 'GameData');
    let playfieldName: string | undefined;
    if (gameData) {
      for (const { tag, body } of biffRecords(cfb.stream(gameData, 512 * 1024))) {
        if (tag === 'IMAG') playfieldName = biffString(body);
        if (tag === 'CODE' || tag === 'ENDB') break;
      }
    }
    const rulesName = /!\[[^\]]*\]\(([^)]+)\)/.exec(rules ?? '')?.[1]?.trim().toLowerCase();
    const head = (entry: DirEntry) => {
      let name = '';
      let width = 0;
      let height = 0;
      for (const { tag, body } of biffRecords(cfb.stream(entry, 4096))) {
        if (tag === 'NAME' && !name) name = biffString(body);
        else if (tag === 'WDTH' && body.length >= 4) width = body.readUInt32LE(0);
        else if (tag === 'HGHT' && body.length >= 4) height = body.readUInt32LE(0);
        else if (tag === 'JPEG' || tag === 'BITS') break;
      }
      return { name, width, height };
    };
    const load = (entry: DirEntry, meta: { name: string; width: number; height: number }): VpxImage | undefined => {
      if (entry.size > MAX_IMAGE_BYTES) return undefined;
      let data: Buffer | undefined;
      for (const { tag, body } of biffRecords(cfb.stream(entry))) if (tag === 'DATA') data = body;
      const ext = data && imageExt(data);
      return data && ext ? { ...meta, ext, data } : undefined;
    };
    for (const entry of streams.filter((e) => /^Image\d+$/.test(e.name))) {
      const meta = head(entry);
      const lower = meta.name.toLowerCase();
      if (!lower) continue;
      if (playfieldName && lower === playfieldName.toLowerCase()) {
        // Atlas of the Visual Light Mapper: a mosaic of textures, not a view of the playfield.
        if (!/vlm\.|nestmap/i.test(meta.name) && meta.width !== meta.height) out.playfield = load(entry, meta) ?? out.playfield;
        continue;
      }
      if (rulesName ? lower === rulesName : !out.rules && /rules|instruction|info ?card|^card$|[_ -]card$/.test(lower) && meta.width > meta.height) {
        out.rules = load(entry, meta) ?? out.rules;
        continue;
      }
      if (/backglass/.test(lower) && !/dmd|off$|_off|grill|frame/.test(lower) && out.backglass.length < MAX_PER_KIND) {
        const img = load(entry, meta);
        if (img) out.backglass.push(img);
        continue;
      }
      if (/(^|[_ ])logo$|^vr_?logo|pincab_?logo/.test(lower) && out.logos.length < MAX_PER_KIND) {
        const img = load(entry, meta);
        if (img) out.logos.push(img);
      }
    }
    return out;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Information written in the table by its author; empty object if the table has
 * none, undefined if the file is not readable as a .vpx.
 */
export function readVpxTableInfo(file: string): VpxTableInfo | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const storage = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'TableInfo');
    const info: VpxTableInfo = {};
    if (!storage) return info;
    for (const entry of cfb.children(storage)) {
      const field = FIELDS[entry.name];
      if (!field || entry.type !== 2 || !entry.size) continue;
      const text = decode(cfb.stream(entry, MAX_FIELD_BYTES));
      if (text) info[field] = text;
    }
    return info;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Name of the table object ("Table1"): its events are called <name>_Init, <name>_KeyDown...
 * NAME record of GameStg/GameData (length in bytes, then the text, in UTF-16 in
 * tables saved by VPX). undefined if the table is not readable.
 */
export function readVpxTableName(file: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const gameData = game && cfb.children(game).find((e) => e.type === 2 && e.name === 'GameData');
    if (!gameData) return undefined;
    const data = cfb.stream(gameData);
    let pos = 0;
    while (pos + 8 <= data.length) {
      const size = data.readUInt32LE(pos);
      const tag = data.toString('latin1', pos + 4, pos + 8);
      if (size < 4) return undefined;
      if (tag === 'NAME' && pos + 12 <= data.length) {
        const bytes = data.subarray(pos + 12, Math.min(data.length, pos + 12 + data.readUInt32LE(pos + 8)));
        const wide = bytes.length >= 2 && bytes.length % 2 === 0 && bytes.every((b, i) => i % 2 === 0 || b === 0);
        const name = (wide ? bytes.toString('utf16le') : bytes.toString('latin1')).trim();
        return /^\w+$/.test(name) ? name : undefined;
      }
      // The text of the script follows the CODE record, outside its length.
      if (tag === 'CODE') {
        if (pos + 12 > data.length) return undefined;
        pos += 12 + data.readUInt32LE(pos + 8);
        continue;
      }
      if (tag === 'ENDB') return undefined;
      pos += 4 + size;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Version of the table's format: the 4-byte integer (little-endian) of the GameStg/Version stream, written by
 * PinTable::SaveToStorage with the CURRENT_FILE_FORMAT_VERSION of the VPX that saved it (1080: VPX 10.8.0,
 * 1081: 10.8.1, 1090: 10.9 pre-releases). VPX reads the same stream when loading (PinTable::LoadGameFromStorage) and
 * warns when it is higher than its own (vpx-format.ts). undefined: unreadable file, or not a VPX 10 table.
 */
export function readVpxFileVersion(file: string): number | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const version = game && cfb.children(game).find((e) => e.type === 2 && e.name === 'Version');
    if (!version) return undefined;
    const data = cfb.stream(version, 4);
    return data.length >= 4 ? data.readInt32LE(0) : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Playfield and glass of a table, in VPX units (PinTable: LEFT, RGHT, TOPX, BOTM, GLAS, GLAB of GameData). */
export interface VpxGlass {
  /** Version of the format (GameStg/Version stream): 1080 for VPX 10.8. */
  fileVersion: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Height of the glass above the top and the bottom of the playfield. */
  glassTop: number;
  glassBottom: number;
}

/**
 * Playfield and glass of a table, as VPX loads them: before format 1080, the glass was
 * horizontal and VPX takes its top height for the bottom (PinTable::LoadGameFromFilename). In VR,
 * the playfield is placed at "front rail − bottom glass height × scale" (VRDevice). undefined
 * if the table is not readable.
 */
export function readVpxGlass(file: string): VpxGlass | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const gameData = game && cfb.children(game).find((e) => e.type === 2 && e.name === 'GameData');
    const version = game && cfb.children(game).find((e) => e.type === 2 && e.name === 'Version');
    if (!gameData) return undefined;
    const fileVersion = version ? cfb.stream(version).readInt32LE(0) : 0;
    const f: Record<string, number> = {};
    for (const { tag, body } of layoutRecords(cfb.stream(gameData))) {
      if (['LEFT', 'RGHT', 'TOPX', 'BOTM', 'GLAS', 'GLAB'].includes(tag) && body.length >= 4) f[tag] = body.readFloatLE(0);
      if (tag === 'ENDB') break;
    }
    if (![f.LEFT, f.RGHT, f.TOPX, f.BOTM, f.GLAS].every((v) => v !== undefined && Number.isFinite(v))) return undefined;
    const glassTop = f.GLAS!;
    const glassBottom = fileVersion < 1080 || f.GLAB === undefined ? glassTop : f.GLAB;
    return { fileVersion, left: f.LEFT!, right: f.RGHT!, top: f.TOPX!, bottom: f.BOTM!, glassTop, glassBottom };
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Script protection (SECB, pintable.h): encrypted script, unreadable without VPX. */
const DISABLE_SCRIPT_EDITING = 0x00000002;
const DISABLE_EVERYTHING = 0x80000000;

/**
 * Script written in the table, byte for byte (read as latin1: each character is one
 * byte, the text written back as is gives the same file again). VPX stores it in
 * GameStg/GameData: the CODE record (length 4) is followed by the length of the
 * text and the text (BiffReader::AsScript, at commit af26b2d93). undefined if the table
 * is not readable, has no script, or if its script is protected (encrypted).
 */
export function readVpxScript(file: string): string | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return undefined;
  }
  // One diagnosis reads the table's script up to six times (table diagnosis, PuP, DMD, VR):
  // kept as long as the table does not change (size and date), for the last tables read.
  const key = `${path.resolve(file).toLowerCase()}\0${stat.size}\0${stat.mtimeMs}`;
  if (scriptsRead.has(key)) {
    const text = scriptsRead.get(key);
    scriptsRead.delete(key);
    scriptsRead.set(key, text);
    return text;
  }
  const text = readVpxScriptFromFile(file);
  scriptsRead.set(key, text);
  if (scriptsRead.size > SCRIPTS_KEPT) scriptsRead.delete(scriptsRead.keys().next().value!);
  return text;
}

/** Scripts already read, from oldest to newest (key: path, size, date). */
const scriptsRead = new Map<string, string | undefined>();
const SCRIPTS_KEPT = 16;

/** Forgets the scripts already read (tests). */
export function forgetVpxScripts(): void {
  scriptsRead.clear();
}

function readVpxScriptFromFile(file: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    const gameData = game && cfb.children(game).find((e) => e.type === 2 && e.name === 'GameData');
    if (!gameData) return undefined;
    const data = cfb.stream(gameData);
    let pos = 0;
    while (pos + 8 <= data.length) {
      const size = data.readUInt32LE(pos);
      const tag = data.toString('latin1', pos + 4, pos + 8);
      if (size < 4) return undefined;
      if (tag === 'SECB' && size >= 4 + 36) {
        const flags = data.readUInt32LE(pos + 8 + 32);
        if ((flags & DISABLE_EVERYTHING) >>> 0 === DISABLE_EVERYTHING || (flags & DISABLE_SCRIPT_EDITING) === DISABLE_SCRIPT_EDITING) return undefined;
      }
      if (tag === 'CODE') {
        if (pos + 12 > data.length) return undefined;
        const length = data.readUInt32LE(pos + 8);
        if (pos + 12 + length > data.length) return undefined;
        return data.toString('latin1', pos + 12, pos + 12 + length);
      }
      if (tag === 'ENDB') return undefined;
      pos += 4 + size;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Kinds of placed elements that readVpxPlayfield reads (VPX ItemTypeEnum). */
const LAYOUT_TYPES: Record<number, VpxPlacedType> = { 0: 'wall', 1: 'flipper', 3: 'plunger', 5: 'bumper', 6: 'trigger', 8: 'kicker', 10: 'gate', 11: 'spinner', 12: 'ramp', 22: 'target' };
export type VpxPlacedType = 'wall' | 'flipper' | 'plunger' | 'bumper' | 'trigger' | 'kicker' | 'gate' | 'spinner' | 'ramp' | 'target';

/** Playfield of a table seen from above: its edges (VPX units, y towards the flippers) and its placed elements. */
export interface VpxPlayfield {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Each element: its centre (VCEN), or the points of its outline (walls, ramps). */
  items: { type: VpxPlacedType; name: string; pts: [number, number][] }[];
}

/** Like biffRecords, but CODE (the script, in GameData) is skipped by its own length instead of stopping the reading. */
function layoutRecords(buf: Buffer): { tag: string; body: Buffer }[] {
  const out: { tag: string; body: Buffer }[] = [];
  for (let pos = 0; pos + 8 <= buf.length; ) {
    const size = buf.readUInt32LE(pos);
    const tag = buf.toString('latin1', pos + 4, pos + 8);
    if (tag === 'CODE' && pos + 12 <= buf.length) {
      pos += 12 + buf.readUInt32LE(pos + 8);
      continue;
    }
    if (size < 4 || pos + 4 + size > buf.length) break;
    out.push({ tag, body: buf.subarray(pos + 8, pos + 4 + size) });
    pos += 4 + size;
  }
  return out;
}

/**
 * Playfield of the table for the game guide (tableguide.ts): edges (LEFT, TOPX, RGHT, BOTM of
 * GameData) and placed elements, with their name and their points (VCEN, VPOS of outline points).
 * Neither lamps nor primitives: only what a shot can designate. undefined if unreadable.
 */
export function readVpxPlayfield(file: string): VpxPlayfield | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return undefined;
    const kids = cfb.children(game);
    const data = kids.find((e) => e.name === 'GameData');
    if (!data) return undefined;
    const dims: Record<string, number> = {};
    for (const r of layoutRecords(cfb.stream(data, 256 * 1024))) {
      if (['LEFT', 'TOPX', 'RGHT', 'BOTM'].includes(r.tag) && dims[r.tag] === undefined && r.body.length >= 4) dims[r.tag] = r.body.readFloatLE(0);
    }
    if (![dims.LEFT, dims.TOPX, dims.RGHT, dims.BOTM].every((v) => Number.isFinite(v)) || dims.RGHT! <= dims.LEFT! || dims.BOTM! <= dims.TOPX!) return undefined;
    const items: VpxPlayfield['items'] = [];
    for (const item of kids) {
      if (item.type !== 2 || !/^GameItem\d+$/.test(item.name)) continue;
      const head = cfb.stream(item, 4);
      const type = head.length >= 4 ? LAYOUT_TYPES[head.readUInt32LE(0)] : undefined;
      if (!type) continue;
      // Walls and ramps: their whole outline; the others fit in the start of the stream.
      const buf = cfb.stream(item, type === 'wall' || type === 'ramp' ? 512 * 1024 : 16 * 1024);
      let name = '';
      const pts: [number, number][] = [];
      for (const r of layoutRecords(buf.subarray(4))) {
        if (r.tag === 'NAME' && r.body.length >= 4) name = r.body.toString('utf16le', 4, Math.min(r.body.length, 4 + r.body.readUInt32LE(0))).replace(/\0+$/, '').trim();
        else if ((r.tag === 'VCEN' || r.tag === 'VPOS') && r.body.length >= 8) {
          const x = r.body.readFloatLE(0);
          const y = r.body.readFloatLE(4);
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push([Math.round(x), Math.round(y)]);
        }
      }
      if (name && pts.length) items.push({ type, name, pts });
    }
    return { left: dims.LEFT!, top: dims.TOPX!, right: dims.RGHT!, bottom: dims.BOTM!, items };
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** An element of the table: its type (VPX ItemTypeEnum: 0 wall, 2 timer, 7 light...) and its name. */
export interface VpxElement {
  type: number;
  name: string;
}

/**
 * The elements of the table, from GameStg/GameItemN: the type at the head of the stream, then
 * the NAME record (length in bytes, UTF-16LE text). Reads only the start of each stream,
 * never the meshes. [] if the table is unreadable.
 */
export function readVpxElements(file: string): VpxElement[] {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return [];
    const out: VpxElement[] = [];
    for (const item of cfb.children(game)) {
      if (item.type !== 2 || !/^GameItem\d+$/.test(item.name)) continue;
      const data = cfb.stream(item, 16 * 1024);
      if (data.length < 4) continue;
      const type = data.readUInt32LE(0);
      for (let pos = 4; pos + 12 <= data.length; ) {
        const size = data.readUInt32LE(pos);
        const tag = data.toString('latin1', pos + 4, pos + 8);
        if (size < 4) break;
        if (tag === 'NAME') {
          const length = data.readUInt32LE(pos + 8);
          const name = data.toString('utf16le', pos + 12, Math.min(data.length, pos + 12 + length)).replace(/\0+$/, '').trim();
          if (/^\w+$/.test(name)) out.push({ type, name });
          break;
        }
        pos += 4 + size;
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** "flasher" element type in a GameItem (VPX: ItemTypeEnum, eItemFlasher). */
const ITEM_FLASHER = 20;
/** Flasher with external rendering (FlasherData::EXT_RENDER) of the Backglass window (VPXWINDOW_Backglass). */
const FLASHER_EXT_RENDER = 4;
const WINDOW_BACKGLASS = 1;

/**
 * Flashers of the table that show the backglass (external rendering of the Backglass window: B2S,
 * PuP...) in the VR scene; undefined if the table is unreadable. Without any, a table that has its
 * VR room leaves its backglass empty in VR, unless VPX adds its own ([PlayerVR] AddBackglass).
 */
export function readVpxBackglassDisplays(file: string): number | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return undefined;
    let count = 0;
    for (const entry of cfb.children(game).filter((e) => e.type === 2 && /^GameItem\d+$/.test(e.name))) {
      const data = cfb.stream(entry, 64 * 1024);
      if (data.length < 4 || data.readUInt32LE(0) !== ITEM_FLASHER) continue;
      let mode = 0;
      let style = 0;
      for (const { tag, body } of biffRecords(data.subarray(4))) {
        if (tag === 'RDMD' && body.length >= 4) mode = body.readInt32LE(0);
        else if (tag === 'RSTL' && body.length >= 4) style = body.readInt32LE(0);
      }
      if (mode === FLASHER_EXT_RENDER && style === WINDOW_BACKGLASS) count++;
    }
    return count;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
