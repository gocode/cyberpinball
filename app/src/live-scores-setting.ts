// Réglage du joueur « Scores des amis pendant la partie » (Menu système > Amis, friends-menu.ts) :
// où se pose la bande d'une partie entre amis (LiveScoresPlace, packages/core/src/gamenotice.ts).
// Gardé dans <données>\amis\scores-en-partie.json ; illisible ou absent : l'automatique.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseLiveScoresPlace, type LiveScoresPlace } from '@cyberpinball/core';

const file = (dataDir: string) => path.join(dataDir, 'amis', 'scores-en-partie.json');

export function readLiveScoresPlace(dataDir: string): LiveScoresPlace {
  try {
    return parseLiveScoresPlace(JSON.parse(fs.readFileSync(file(dataDir), 'utf8')));
  } catch {
    return 'auto';
  }
}

export function writeLiveScoresPlace(dataDir: string, place: LiveScoresPlace): void {
  fs.mkdirSync(path.dirname(file(dataDir)), { recursive: true });
  fs.writeFileSync(file(dataDir), JSON.stringify({ place }, null, 2));
}
