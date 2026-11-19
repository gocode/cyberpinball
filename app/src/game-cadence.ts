// Cadence des images de la partie, relue dans vpinball.log après chaque partie (vpxcadence.ts) : une ligne dans le
// journal de la borne, et le relevé de la table (<données>\logs\cadence-parties.json) que la Santé lit pour dire
// qu'une table rame sur cette borne. Le plugin « CyberPinballDmd » écrit le bilan (cadence.h), dans toutes les parties.

import * as fs from 'node:fs';
import { cadenceJournal, readVpxCadence, readVpxTargetFps, recordGameCadence, scriptErrorsJournal, stallPlaceJournal } from '@cyberpinball/core';

/** Taille du journal de VPX avant la partie : ce qu'il écrira de cette partie commence là. */
export function vpxLogSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** Les lignes écrites depuis `from` (tout le fichier s'il a été recommencé entre-temps). */
function linesSince(file: string, from: number): string[] {
  try {
    const size = fs.statSync(file).size;
    const start = size >= from ? from : 0;
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString('utf8').split(/\r?\n/);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

/** Après la partie : la cadence au journal, et dans le relevé de la table. */
export function noteGameCadence(opts: { logsDir: string; tableFile: string; tableId: string; vpxLog: string; from: number; vr: boolean; others?: string[] }): void {
  const lines = linesSince(opts.vpxLog, opts.from);
  // Erreurs du script pendant la partie, regroupées : une erreur répétée à chaque tour d'une minuterie tient en une ligne.
  const errors = scriptErrorsJournal(opts.tableId, lines);
  if (errors) console.log(errors);
  const cadence = readVpxCadence(lines);
  if (!cadence) {
    console.log(`Cadence de la partie (${opts.tableId}) : aucun bilan dans vpinball.log (plugin du DMD absent ou partie trop courte).`); // i18n-ignore : journal
    return;
  }
  const target = readVpxTargetFps(lines);
  console.log(cadenceJournal(opts.tableId, cadence, target, opts.others));
  // Où VPX attendait pendant les à-coups (relevé du plugin du DMD) : la cause, lisible dans le rapport de la borne.
  const place = stallPlaceJournal(opts.tableId, lines);
  if (place) console.log(place);
  try {
    recordGameCadence(opts.logsDir, opts.tableFile, cadence, target, new Date(), opts.vr, opts.others);
  } catch (error) {
    console.warn(`Cadence de la partie (${opts.tableId}) : relevé pas enregistré (${(error as Error).message}).`); // i18n-ignore : journal
  }
}
