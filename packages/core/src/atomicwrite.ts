// Écriture atomique et renommage de fichier, les seuls du dépôt (test ecritures-atomiques).
//
// Écrire un état (social.json, vpx-owned.json, un cache…), c'est l'écrire dans un fichier
// temporaire puis le renommer à la place de l'ancien : une coupure de courant ne laisse jamais un
// fichier tronqué. Sous Windows, ce renommage échoue en EPERM, EBUSY ou EACCES quand un autre
// processus tient le fichier un instant (antivirus, indexation, une lecture concurrente) : le
// 01/11/2026, social.json refusé ainsi a fait tomber l'application trois fois pendant une partie
// entre amis (fin de partie, fermeture d'une connexion du réseau), et l'ami en face la voyait
// passer hors ligne ; même chose le 26/10/2026 avec vpx-owned.json. Le renommage est donc réessayé
// quelques fois, avec un court délai croissant (RENAME_RETRY_DELAYS_MS, moins d'une demi-seconde
// en tout), et le temporaire est effacé si rien n'y fait.
//
// Un état sauvegardé depuis un gestionnaire d'évènement (réseau, minuteur, fin de partie) passe en
// plus par saveOrWarn : un échec final est noté au journal, jamais levé ; l'état en mémoire reste
// juste et la sauvegarde suivante, qui réécrit tout, le rattrape.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Codes d'un renommage refusé tant qu'un autre processus tient le fichier. */
export const BUSY_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Attente avant chaque nouvel essai : 435 ms au plus en tout, six essais. */
export const RENAME_RETRY_DELAYS_MS: readonly number[] = [15, 30, 60, 120, 210];

export interface RenameRetryOptions {
  /** Attentes entre les essais (RENAME_RETRY_DELAYS_MS par défaut ; [] : un seul essai). */
  delaysMs?: readonly number[];
  /** Pour les tests : le renommage et l'attente. */
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

/** Attente sans rendre la main : l'écriture reste synchrone pour ceux qui l'appellent. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * fs.renameSync, réessayé tant que Windows répond EPERM, EBUSY ou EACCES. Toute autre erreur
 * (EXDEV d'un disque à l'autre, ENOENT…) est levée tout de suite ; la dernière l'est telle quelle.
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

/** renameWithRetry sans bloquer : l'attente rend la main entre deux essais. */
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
  /** Encodage d'un texte (utf8 par défaut). */
  encoding?: BufferEncoding;
}

export interface AtomicWriteAsyncOptions extends RenameRetryAsyncOptions {
  encoding?: BufferEncoding;
}

/** Temporaire d'une écriture synchrone : <fichier>.tmp-<pid>, à côté du fichier (même disque). */
export function atomicTempPath(file: string): string {
  return `${file}.tmp-${process.pid}`;
}

/**
 * Écrit `data` dans `file` d'un coup : temporaire à côté, puis renommage réessayé
 * (renameWithRetry). Le dossier est créé au besoin. En cas d'échec, le temporaire est effacé,
 * l'ancien fichier reste entier et l'erreur est levée.
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
 * writeFileAtomic sans bloquer. Le temporaire porte en plus un suffixe au hasard : deux écritures
 * du même fichier peuvent se croiser.
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
 * Sauvegarde d'un état depuis un gestionnaire d'évènement : un échec ne doit jamais faire tomber
 * l'application. Il est noté au journal (avertissement, avec le fichier) et la fonction rend
 * faux ; l'état en mémoire reste juste, la sauvegarde suivante le réécrit en entier.
 */
export function saveOrWarn(file: string, save: () => void): boolean {
  try {
    save();
    return true;
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    console.warn(`Sauvegarde de ${file} impossible (${e?.code ?? e?.message ?? String(error)}) : l'état en mémoire est gardé, nouvel essai à la prochaine sauvegarde.`); // i18n-ignore : journal
    return false;
  }
}
