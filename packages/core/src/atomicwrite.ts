// Atomic file write and file rename, the only ones in the repository (test ecritures-atomiques).
//
// Writing a state (social.json, vpx-owned.json, a cache...) means writing it to a temporary file,
// then renaming that file over the old one: a power cut never leaves a truncated file. On
// Windows, this rename fails with EPERM, EBUSY or EACCES when another process holds the file for a
// moment (antivirus, indexing, a concurrent read): on 01/11/2026, social.json refused this way
// crashed the application three times during a game between friends (end of game, closing of a
// network connection), and the friend on the other side saw the cabinet go offline; same thing on
// 26/10/2026 with vpx-owned.json. So the rename is retried a few times, with a short growing delay
// (RENAME_RETRY_DELAYS_MS, under half a second in all), and the temporary file is deleted if
// nothing works.
//
// A state saved from an event handler (network, timer, end of game) also goes through
// saveOrWarn: a final failure is logged, never thrown; the in-memory state stays right and the
// next save, which rewrites everything, catches up.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Codes of a rename refused while another process holds the file. */
export const BUSY_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Wait before each new attempt: 435 ms at most in all, six attempts. */
export const RENAME_RETRY_DELAYS_MS: readonly number[] = [15, 30, 60, 120, 210];

export interface RenameRetryOptions {
  /** Waits between attempts (RENAME_RETRY_DELAYS_MS by default; []: a single attempt). */
  delaysMs?: readonly number[];
  /** For tests: the rename and the wait. */
  rename?: (from: string, to: string) => void;
  sleep?: (ms: number) => void;
}

export interface RenameRetryAsyncOptions {
  delaysMs?: readonly number[];
  rename?: (from: string, to: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export function isBusyRenameError(error: unknown): boolean {
  return BUSY_RENAME_CODES.has(String((error as NodeJS.ErrnoException | undefined)?.code));
}

/** Wait without yielding: the write stays synchronous for its callers. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * fs.renameSync, retried as long as Windows answers EPERM, EBUSY or EACCES. Any other error
 * (EXDEV from one drive to another, ENOENT...) is thrown at once; the last one is thrown as is.
 */
export function renameWithRetry(from: string, to: string, opts: RenameRetryOptions = {}): void {
  const rename = opts.rename ?? ((a: string, b: string) => fs.renameSync(a, b));
  const sleep = opts.sleep ?? sleepSync;
  const delays = opts.delaysMs ?? RENAME_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      if (attempt >= delays.length || !isBusyRenameError(error)) throw error;
      sleep(delays[attempt]!);
    }
  }
}

/** renameWithRetry without blocking: the wait yields between two attempts. */
export async function renameWithRetryAsync(from: string, to: string, opts: RenameRetryAsyncOptions = {}): Promise<void> {
  const rename = opts.rename ?? ((a: string, b: string) => fs.promises.rename(a, b));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delays = opts.delaysMs ?? RENAME_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= delays.length || !isBusyRenameError(error)) throw error;
      await sleep(delays[attempt]!);
    }
  }
}

export interface AtomicWriteOptions extends RenameRetryOptions {
  /** Encoding of a text (utf8 by default). */
  encoding?: BufferEncoding;
}

export interface AtomicWriteAsyncOptions extends RenameRetryAsyncOptions {
  encoding?: BufferEncoding;
}

/** Temporary file of a synchronous write: <file>.tmp-<pid>, next to the file (same drive). */
export function atomicTempPath(file: string): string {
  return `${file}.tmp-${process.pid}`;
}

/**
 * Writes `data` to `file` in one go: temporary file next to it, then a retried rename
 * (renameWithRetry). The folder is created if needed. On failure, the temporary file is deleted,
 * the old file stays whole and the error is thrown.
 */
export function writeFileAtomic(file: string, data: string | NodeJS.ArrayBufferView, opts: AtomicWriteOptions = {}): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = atomicTempPath(file);
  try {
    if (typeof data === 'string') fs.writeFileSync(tmp, data, opts.encoding ?? 'utf8');
    else fs.writeFileSync(tmp, data);
    renameWithRetry(tmp, file, opts);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

/**
 * writeFileAtomic without blocking. The temporary file also carries a random suffix: two writes
 * of the same file may overlap.
 */
export async function writeFileAtomicAsync(file: string, data: string | NodeJS.ArrayBufferView, opts: AtomicWriteAsyncOptions = {}): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${atomicTempPath(file)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    if (typeof data === 'string') await fs.promises.writeFile(tmp, data, opts.encoding ?? 'utf8');
    else await fs.promises.writeFile(tmp, data);
    await renameWithRetryAsync(tmp, file, opts);
  } catch (error) {
    await fs.promises.rm(tmp, { force: true });
    throw error;
  }
}

/**
 * Saving a state from an event handler: a failure must never crash the application. It is
 * logged (warning, with the file) and the function returns false; the in-memory state stays
 * right, and the next save rewrites it in full.
 */
export function saveOrWarn(file: string, save: () => void): boolean {
  try {
    save();
    return true;
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    console.warn(`Sauvegarde de ${file} impossible (${e?.code ?? e?.message ?? String(error)}) : l'état en mémoire est gardé, nouvel essai à la prochaine sauvegarde.`); // i18n-ignore: log
    return false;
  }
}
