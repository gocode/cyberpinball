// Suppression du dossier temporaire d'un essai qui a lancé Electron ou Chromium (21/11/2026). Sous
// la charge de plusieurs suites, la suppression échouait encore après la fin de tous les processus
// de l'essai : EBUSY sur « Network\Trust Tokens » ou un « Network Persistent State….tmp », EPERM sur
// « DawnGraphiteCache\data_0 » ou « Cache_Data\data_0 ». Windows (antivirus, indexation) garde un
// moment la main sur des fichiers fraîchement fermés ; et un processus de l'essai pouvait encore
// tourner (voir electronMarkers dans electron-run.ts). Le test, lui, avait réussi.
//
// Ici : nouvel essai, de plus en plus espacé, tant que le système refuse ; entre deux, tout processus
// encore vivant qui cite ce dossier (propre à l'essai) est tué. Passé le délai, le dossier est laissé
// dans le dossier temporaire du système et l'essai le dit, sans échouer : ce n'est pas ce qu'il vérifie.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { killAll, processesWith } from './electron-run';

/** Codes d'un fichier encore tenu (Windows) : on réessaie. Tout autre code est une vraie erreur. */
export const BUSY_CODES: readonly string[] = ['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES'];
export const REMOVE_WAIT_MS = 30_000;

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Dossier propre à un essai : dans le dossier temporaire du système, jamais lui-même. */
function isTestDir(dir: string): boolean {
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  return path.resolve(dir).toLowerCase().startsWith(tmp + path.sep);
}

export interface RemoveOptions {
  waitMs?: number;
  /** Pour les tests de cette fonction : la suppression elle-même. */
  rm?: (dir: string) => void;
  warn?: (message: string) => void;
}

/** Supprime `dir` (créé par fs.mkdtempSync dans le dossier temporaire) ; rend vrai s'il n'existe plus. */
export function removeTempDir(dir: string, opts: RemoveOptions = {}): boolean {
  if (!isTestDir(dir)) throw new Error(`removeTempDir : ${dir} n’est pas un dossier d’essai du dossier temporaire`);
  const rm = opts.rm ?? ((d: string) => fs.rmSync(d, { recursive: true, force: true }));
  const deadline = Date.now() + (opts.waitMs ?? REMOVE_WAIT_MS);
  for (let delay = 100; ; delay = Math.min(delay * 2, 2000)) {
    try {
      rm(dir);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!BUSY_CODES.includes(code)) throw error;
      if (Date.now() >= deadline) {
        (opts.warn ?? ((m: string) => process.stderr.write(`${m}\n`)))(`Dossier d’essai laissé dans le dossier temporaire (${code}, toujours tenu après ${Math.round((opts.waitMs ?? REMOVE_WAIT_MS) / 1000)} s) : ${dir}`);
        return false;
      }
      killAll(processesWith(dir));
      sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    }
  }
}
