// Operations on table files. Nothing is ever deleted silently:
// what is replaced or removed goes to the root folder's trash
// (<root>\trash\<date> <label>\...), from where it can be recovered.
// Only exception: crash reports, which have no value once read.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicTempPath, renameWithRetry } from './atomicwrite';
import { copyTree } from './copytree';
import { isLinkable, LINK_FALLBACK_CODES } from './hardlink';
import { formatNumber, t } from './i18n';
import type { RomMemory } from './ballcount';
import { writeRomVolume } from './romscores';
import { buildZip, writeZipData, type RomZipMember } from './romzip';

export type FileOp =
  | { op: 'move'; from: string; to: string }
  /**
   * Copy; link: large files that do not change (hardlink.ts) become hard links
   * on the same volume (no extra space, the original intact), copied elsewhere.
   */
  | { op: 'copy'; from: string; to: string; link?: boolean; /** Never replaces a file already there: only what is missing is copied. */ keep?: boolean }
  | { op: 'trash'; path: string }
  | { op: 'delete'; path: string }
  /**
   * Writes a small text file (.info); the old one goes to the trash. latin1: one
   * character per byte (table script written back byte for byte).
   */
  | { op: 'write'; path: string; content: string; encoding?: 'utf8' | 'latin1' }
  /**
   * Hard link: to becomes the same file as from, without extra space (see linkFile).
   * Copy when the two are not on the same volume.
   */
  | { op: 'link'; from: string; to: string }
  /**
   * ROM rebuilt flat: a .zip whose chips are at the root (romzip.ts), from
   * loose files or the files of another zip. A file already there goes to the trash.
   */
  | { op: 'zip'; to: string; files: RomZipMember[]; mtimeMs?: number }
  /**
   * Volume of the ROM (romvolume.ts): the memory read again at write time (high scores may have
   * been written to it since the check), the volume set, checksums redone (writeRomVolume); the
   * previous memory to the trash. A refused write throws the error, with its reason.
   */
  | { op: 'romVolume'; path: string; memory: RomMemory; value: number };

export interface OpContext {
  /** Trash folder of this operation (created on first use). */
  trashDir: string;
}

/** Trash of an operation: <root>\trash\2026-10-20 14-05-12 <label>. */
export function trashDirFor(trashRoot: string, label: string, now = new Date()): string {
  // Local time: it is the one the user will look for in the trash.
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return path.join(trashRoot, `${stamp} ${safeName(label)}`.trim());
}

/** Valid file name on Windows. */
export function safeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

export function applyOps(ops: FileOp[], ctx: OpContext): void {
  for (const op of ops) {
    switch (op.op) {
      case 'move':
        if (samePath(op.from, op.to) && op.from === op.to) break;
        transfer(op.from, op.to, ctx, true, false);
        break;
      case 'copy':
        if (op.keep) copyMissing(op.from, op.to);
        else transfer(op.from, op.to, ctx, false, op.link ?? false);
        break;
      case 'trash':
        moveToTrash(op.path, ctx);
        break;
      case 'delete':
        fs.rmSync(op.path, { recursive: true, force: true });
        break;
      case 'write':
        writeReplacing(op.path, op.content, op.encoding ?? 'utf8', ctx);
        break;
      case 'link':
        linkFile(op.from, op.to, ctx);
        break;
      case 'zip': {
        // Content read before putting the old file in the trash: the ROM may be rebuilt from itself.
        const data = buildZip(op.files);
        if (fs.existsSync(op.to)) moveToTrash(op.to, ctx);
        writeZipData(op.to, data, op.mtimeMs);
        break;
      }
      case 'romVolume': {
        // lecture entière : memory of a ROM (.nv), a few kB
        const out = writeRomVolume(op.memory, fs.readFileSync(op.path), op.value);
        if (!out.ok) throw new Error(t('Volume de la ROM non écrit : {reason}', { reason: out.reason }));
        writeReplacing(op.path, out.data.toString('latin1'), 'latin1', ctx);
        break;
      }
    }
  }
}

/**
 * Writes a table file (.info, .vbs, .ini, screens.pup...) without ever leaving it truncated or
 * missing: the whole new content in a temporary file, a copy of the old one to the trash, then
 * the temporary file renamed in its place. Before 17/11/2026, the old one first went to the trash
 * and the new one was written directly: a power cut between the two (a cabinet is switched off at
 * the switch) left the table without its file, or with a half-written file.
 */
function writeReplacing(file: string, content: string, encoding: BufferEncoding, ctx: OpContext): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = atomicTempPath(file);
  fs.writeFileSync(tmp, content, encoding);
  try {
    if (fs.existsSync(file)) copyToTrash(file, ctx);
    renameWithRetry(tmp, file);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

/** Copy to the trash (the original stays in place); returns the copy. */
function copyToTrash(target: string, ctx: OpContext): string {
  fs.mkdirSync(ctx.trashDir, { recursive: true });
  const dest = path.join(ctx.trashDir, uniqueTrashName(ctx.trashDir, target));
  fs.copyFileSync(target, dest);
  return dest;
}

/**
 * Moves or copies. A folder that arrives on an existing folder is merged
 * file by file; a file already present at the destination goes to the trash.
 */
/** Copies what is missing at `to`; a file already there is left as it is (neither replaced nor sent to the trash). */
function copyMissing(from: string, to: string): void {
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copyMissing(path.join(from, name), path.join(to, name));
    return;
  }
  if (fs.existsSync(to)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  copyTree(from, to, { overwrite: false });
}

function transfer(from: string, to: string, ctx: OpContext, move: boolean, link: boolean): void {
  const fromIsDir = fs.statSync(from).isDirectory();
  if (fs.existsSync(to) && !samePath(from, to)) {
    if (fromIsDir && fs.statSync(to).isDirectory()) {
      for (const name of fs.readdirSync(from)) transfer(path.join(from, name), path.join(to, name), ctx, move, link);
      if (move) fs.rmdirSync(from);
      return;
    }
    moveToTrash(to, ctx);
  }
  if (move) movePath(from, to);
  else {
    copyTree(from, to, { overwrite: false, ...(link ? { link: isLinkable } : {}) });
  }
}

/**
 * Makes to a hard link to from. A file already there is replaced: deleted
 * if it is identical byte for byte (from keeps the same content, nothing is lost),
 * put in the trash otherwise. From one volume to another, a link is impossible: copy, and
 * an identical copy already in place stays as it is.
 */
export function linkFile(from: string, to: string, ctx: OpContext): 'linked' | 'copied' | 'unchanged' {
  if (fs.existsSync(to)) {
    if (sameFile(from, to)) return 'unchanged';
    if (sameBytes(from, to)) {
      if (!sameVolume(from, to)) return 'unchanged';
      fs.rmSync(to);
    } else moveToTrash(to, ctx);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.linkSync(from, to);
    return 'linked';
  } catch (error) {
    // Other volume, or file system without hard links (USB stick in FAT32, exFAT).
    if (!LINK_FALLBACK_CODES.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
    fs.copyFileSync(from, to);
    return 'copied';
  }
}

/** Do two paths designate the same file on disk (hard link)? */
export function sameFile(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a, { bigint: true });
    const sb = fs.statSync(b, { bigint: true });
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

/** Same content, byte for byte. */
export function sameBytes(a: string, b: string): boolean {
  if (sameFile(a, b)) return true;
  if (fs.statSync(a).size !== fs.statSync(b).size) return false;
  const fa = fs.openSync(a, 'r');
  const fb = fs.openSync(b, 'r');
  try {
    const size = 1024 * 1024;
    const ba = Buffer.alloc(size);
    const bb = Buffer.alloc(size);
    for (;;) {
      const na = fs.readSync(fa, ba, 0, size, null);
      const nb = fs.readSync(fb, bb, 0, size, null);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na === 0) return true;
    }
  } finally {
    fs.closeSync(fa);
    fs.closeSync(fb);
  }
}

/**
 * Are the two paths on the same volume (condition for a hard link)?
 * A path that does not exist yet counts as its first existing folder.
 */
export function sameVolume(a: string, b: string): boolean {
  const dev = (p: string) => {
    let current = path.resolve(p);
    for (;;) {
      try {
        return fs.statSync(current, { bigint: true }).dev;
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return undefined;
        current = parent;
      }
    }
  };
  const da = dev(a);
  return da !== undefined && da === dev(b);
}

export function moveToTrash(target: string, ctx: OpContext): string {
  const dest = path.join(ctx.trashDir, uniqueTrashName(ctx.trashDir, target));
  movePath(target, dest);
  return dest;
}

function uniqueTrashName(trashDir: string, target: string): string {
  const base = path.basename(target);
  let name = base;
  for (let i = 2; fs.existsSync(path.join(trashDir, name)); i++) name = `${base} (${i})`;
  return name;
}

/**
 * Moves a file or a folder to a free destination. On the same drive
 * it is a simple rename; from one drive to another (USB stick), copy then deletion of the original.
 */
export function movePath(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  // Change of case only ("t2.vpx" -> "T2.vpx"): Windows sees it as the same file.
  if (samePath(from, to) && from !== to) {
    const tmp = `${to}.renommage-${process.pid}`;
    renameWithRetry(from, tmp);
    renameWithRetry(tmp, to);
    return;
  }
  try {
    renameWithRetry(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    copyTree(from, to, { overwrite: false });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** true if child is inside parent (or is parent), case-insensitively. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Size of a file or a folder, in bytes. A file present under several names in the
 * folder (hard links, hardlink.ts) counts only once: its data is there only once.
 */
export function sizeOf(target: string, seen = new Set<string>()): number {
  try {
    const stat = fs.statSync(target, { bigint: true });
    if (!stat.isDirectory()) {
      if (stat.nlink > 1n) {
        const id = `${stat.dev}:${stat.ino}`;
        if (seen.has(id)) return 0;
        seen.add(id);
      }
      return Number(stat.size);
    }
    return fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name), seen), 0);
  } catch {
    return 0;
  }
}

/**
 * "1,0 Go", "64 Mo", "4,8 ko". `fine`: one fixed decimal up to 100 ("48,2 Mo",
 * "48,0 Mo"), for a volume that moves before the eyes without changing width.
 */
export function formatSize(bytes: number, fine = false): string {
  const units: [number, string][] = [
    [1024 ** 3, t('Go')],
    [1024 ** 2, t('Mo')],
    [1024, t('ko')],
  ];
  for (const [size, unit] of units) {
    // From 1000 of the unit below: "1,0 Mo" rather than "1 021 ko".
    if (bytes >= (size * 1000) / 1024) {
      const value = bytes / size;
      const digits = value < (fine ? 100 : 10) ? 1 : 0;
      return `${formatNumber(value, { maximumFractionDigits: digits, minimumFractionDigits: fine ? digits : 0 })} ${unit}`;
    }
  }
  return t('{n} octets', { n: bytes });
}

const SIZE_UNITS: Record<string, number> = { o: 1, b: 1, octets: 1, bytes: 1, ko: 1024, kb: 1024, kio: 1024, kib: 1024, mo: 1024 ** 2, mb: 1024 ** 2, mio: 1024 ** 2, mib: 1024 ** 2, go: 1024 ** 3, gb: 1024 ** 3, gio: 1024 ** 3, gib: 1024 ** 3, to: 1024 ** 4, tb: 1024 ** 4 };

/**
 * Bytes of a size written by a site ("4.67 MB", "6.5MB", "1,234.5 KB", "381,1 Mo");
 * undefined if the text is not one. Sites count in 1024, like formatSize: a size
 * coming from elsewhere is never displayed as is, it goes back through formatSize (cabinet language).
 */
export function parseSizeText(text: string | undefined): number | undefined {
  const m = text && /^\s*(\d[\d\s.,  ]*)\s*([a-z]+)\s*$/i.exec(text);
  if (!m) return undefined;
  const unit = SIZE_UNITS[m[2]!.toLowerCase()];
  if (!unit) return undefined;
  let digits = m[1]!.replace(/[\s  ]/g, '');
  if (digits.includes('.') && digits.includes(',')) digits = digits.replace(/,/g, '');
  // Comma alone: decimal ("381,1"), unless followed by exactly three digits ("1,234").
  else if (digits.includes(',')) digits = /,\d{3}$/.test(digits) ? digits.replace(/,/g, '') : digits.replace(',', '.');
  const value = Number(digits);
  return Number.isFinite(value) ? Math.round(value * unit) : undefined;
}

/** Deletes the empty folders left behind by a move, up to stop excluded. */
export function pruneEmptyDirs(dir: string, stop: string): void {
  let current = dir;
  while (isInside(current, stop) && !samePath(current, stop) && fs.existsSync(current)) {
    if (fs.readdirSync(current).length > 0) return;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}
