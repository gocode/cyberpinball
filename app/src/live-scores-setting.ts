// Réglages du joueur pour les scores des amis pendant la partie (Menu système > Amis,
// live-scores-menu.ts) : la place de la bande, et les scores sur le DMD, à part (LiveScoresSettings,
// packages/core/src/gamenotice.ts). Gardés dans <données>\amis\scores-en-partie.json ; illisibles ou
// absents : l'automatique, DMD activé. Le fichier peut porter un réglage par table (`tables`), pas
// encore proposé : il est gardé tel quel à chaque écriture.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseLiveScoresSettings, type LiveScoresSettings } from '@cyberpinball/core';

const file = (dataDir: string) => path.join(dataDir, 'amis', 'scores-en-partie.json');

function readRaw(dataDir: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file(dataDir), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Les réglages, pour toutes les tables, ou pour `tableId` quand elle a les siens. */
export function readLiveScoresSettings(dataDir: string, tableId?: string): LiveScoresSettings {
  return parseLiveScoresSettings(readRaw(dataDir), tableId);
}

export function writeLiveScoresSettings(dataDir: string, settings: LiveScoresSettings): void {
  const raw = readRaw(dataDir);
  const tables = raw && typeof raw === 'object' ? (raw as { tables?: unknown }).tables : undefined;
  fs.mkdirSync(path.dirname(file(dataDir)), { recursive: true });
  fs.writeFileSync(file(dataDir), JSON.stringify({ place: settings.place, dmd: settings.dmd, ...(tables && typeof tables === 'object' ? { tables } : {}) }, null, 2));
}
