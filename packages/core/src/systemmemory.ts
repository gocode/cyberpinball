// Le Menu système s'ouvre sur la dernière entrée de sa racine qu'on a choisie (20/11/2026) : l'ordre
// reste fixe, pour garder ses repères, mais le curseur suit les habitudes de chaque borne. Celui qui
// ouvre le menu surtout pour éteindre retrouve son curseur sur « Quitter ou éteindre ». Gardée sur le
// disque : elle doit survivre à l'extinction, justement.

import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { readJsonFile } from './store';
import { SYSTEM_ROOT_ENTRIES, type SystemEntryId } from './systemmenu';

export const SYSTEM_MEMORY_FILE = 'menu-systeme.json';

/** La dernière entrée de la racine choisie ; undefined si rien n'est gardé, ou si elle n'est plus à la racine. */
export function loadSystemMemory(dataDir: string): SystemEntryId | undefined {
  try {
    const raw = readJsonFile(path.join(dataDir, SYSTEM_MEMORY_FILE)) as { last?: unknown };
    return typeof raw.last === 'string' && (SYSTEM_ROOT_ENTRIES as readonly string[]).includes(raw.last) ? (raw.last as SystemEntryId) : undefined;
  } catch {
    return undefined;
  }
}

/** Retient l'entrée de la racine choisie. Une écriture ratée n'empêche rien : le menu s'ouvrira en haut. */
export function saveSystemMemory(dataDir: string, last: SystemEntryId): void {
  try {
    writeFileAtomic(path.join(dataDir, SYSTEM_MEMORY_FILE), JSON.stringify({ last }) + '\n');
  } catch {
    // Disque plein ou en lecture seule : le curseur partira de la première ligne.
  }
}
