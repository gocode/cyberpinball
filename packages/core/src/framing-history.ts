// Retour arrière du cadrage d'une table (23/11/2026) : chaque choix fait dans « Point de vue » garde le .ini d'avant,
// et « Rétablir le cadrage précédent » le remet. <données>\cadrage-historique.json, dix états par table au plus.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { FileOp } from './fileops';
import type { OriginFramingNote } from './origin-framing';
import { readJsonFile } from './store';

export interface FramingSnapshot {
  /** Date ISO de l'enregistrement. */
  at: string;
  /** Le cadrage qui était en place (« POV « afm.pov » », « Cadrage de la borne »). */
  label: string;
  /** Le .ini de la table ; null : la table n'en avait pas. */
  ini: string | null;
  /** Le cadrage d'origine noté dans le .info (origin-framing.ts) à ce moment-là, s'il y en avait un. */
  note?: OriginFramingNote;
}

const FILE = 'cadrage-historique.json';
const KEPT = 10;

type History = Record<string, FramingSnapshot[]>;

const keyOf = (tableFile: string) => path.resolve(tableFile).toLowerCase();

function load(dataDir: string): History {
  const file = path.join(dataDir, FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const data = readJsonFile(file) as History;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Les états gardés pour cette table, le plus récent en dernier. */
export function framingHistory(dataDir: string, tableFile: string): FramingSnapshot[] {
  return load(dataDir)[keyOf(tableFile)] ?? [];
}

/** Garde le .ini actuel de la table (`ini`, null sans .ini) avant un changement de cadrage. */
export function rememberFraming(dataDir: string, tableFile: string, snapshot: FramingSnapshot): void {
  const all = load(dataDir);
  const list = [...(all[keyOf(tableFile)] ?? []), snapshot].slice(-KEPT);
  all[keyOf(tableFile)] = list;
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, FILE), JSON.stringify(all, null, 2) + '\n');
}

/**
 * Les écritures qui remettent le dernier état gardé (le .ini réécrit, ou mis à la corbeille si la table n'en avait
 * pas), et l'historique sans lui ; undefined : rien à rétablir.
 */
export function restoreFramingOps(dataDir: string, tableFile: string, iniPath: string): { ops: FileOp[]; snapshot: FramingSnapshot; commit(): void } | undefined {
  const list = framingHistory(dataDir, tableFile);
  const snapshot = list.at(-1);
  if (!snapshot) return undefined;
  const ops: FileOp[] = snapshot.ini === null ? (fs.existsSync(iniPath) ? [{ op: 'trash', path: iniPath }] : []) : [{ op: 'write', path: iniPath, content: snapshot.ini }];
  return {
    ops,
    snapshot,
    commit: () => {
      const all = load(dataDir);
      all[keyOf(tableFile)] = list.slice(0, -1);
      if (!all[keyOf(tableFile)]!.length) delete all[keyOf(tableFile)];
      writeFileAtomic(path.join(dataDir, FILE), JSON.stringify(all, null, 2) + '\n');
    },
  };
}
