// Future Pinball : constats du lancement (son, vue de BAM) écrits au journal avant que la partie ne démarre.
// Le calcul est dans packages/core/src/futurepinball-diagnostics.ts ; ici, la lecture de la machine.

import * as path from 'node:path';
import {
  archivesLikelyHolding,
  checkFuturePinballLibraries,
  findFuturePinball,
  futurePinballLibraryReport,
  repairFuturePinballLibraries,
  FUTURE_PINBALL_GAMEPLAYER_KEY,
  FUTURE_PINBALL_NAME,
  FUTURE_PINBALL_VIEW_VALUES,
  futurePinballSoundReport,
  futurePinballViewFacts,
  futurePinballViewReport,
  type CabinetAudio,
  type DefaultOutputState,
  type FlipperEdge,
  type FuturePinballInstall,
  type FuturePinballViewValues,
  type ObservedAudioOutput,
  type Rotation,
} from '@cyberpinball/core';
import { hkcuValue, readEndpointVolumes } from '@cyberpinball/win-displays';

export interface FuturePinballLaunchFacts {
  tableId: string;
  tableFile: string;
  install: FuturePinballInstall | undefined;
  audio: CabinetAudio | undefined;
  outputs: readonly ObservedAudioOutput[];
  log: (line: string) => void;
  /** Sortie par défaut de Windows ; Core Audio par défaut (jamais écrit : lecture seule). */
  readDefault?: () => DefaultOutputState | undefined;
  /** Une autre installation de Future Pinball sur ce PC (celle d'avant Cyber Pinball). */
  findOther?: () => { gameDir: string } | undefined;
}

function defaultOutputOfWindows(): DefaultOutputState | undefined {
  const [first] = readEndpointVolumes([]);
  return first ? { id: first.id, level: first.level, muted: first.muted } : undefined;
}

export interface FuturePinballLibraryFacts {
  tableId: string;
  tableFile: string;
  install: FuturePinballInstall | undefined;
  /** Dossier des téléchargements de Cyber Pinball (archives reçues, pas toujours rangées). */
  downloadsDir?: string;
  log: (line: string) => void;
  /** Une autre installation de Future Pinball sur ce PC (celle d'avant Cyber Pinball). */
  findOther?: () => { gameDir: string } | undefined;
}

/**
 * Les bibliothèques (.fpl) que cette table cite et que le jeu lancé n'a pas : remises depuis une autre
 * installation quand elle les a, sinon dites au journal avec ce qu'il faut faire. Ne lève jamais.
 */
export async function logFuturePinballLibraries(facts: FuturePinballLibraryFacts): Promise<void> {
  const prefix = `${FUTURE_PINBALL_NAME} (${facts.tableId}) : `; // i18n-ignore : journal
  try {
    if (!facts.install) return;
    const check = await checkFuturePinballLibraries(facts.install.gameDir, facts.tableFile);
    if (!check.missing.length) return;
    const other = (facts.findOther ?? (() => findFuturePinball({})))();
    const repair = repairFuturePinballLibraries(facts.install.gameDir, check.missing, other ? [other.gameDir] : []);
    const archives = facts.downloadsDir && repair.stillMissing.length ? archivesLikelyHolding(facts.downloadsDir, repair.stillMissing) : [];
    const name = path.basename(facts.tableFile, path.extname(facts.tableFile));
    for (const line of futurePinballLibraryReport({ tableName: name, check, repair, archives })) facts.log(prefix + line);
  } catch (error) {
    facts.log(`${prefix}bibliothèques : constat impossible (${(error as Error).message}).`); // i18n-ignore : journal
  }
}

export interface FuturePinballViewLogFacts {
  tableId: string;
  /** Écran du playfield tel que la session le voit. */
  screen?: { width: number; height: number; rotation: Rotation };
  flipperEdge?: FlipperEdge;
  log: (line: string) => void;
  /** Valeur des préférences du jeu (HKCU\Software\Future Pinball\GamePlayer) ; lecture seule. */
  read?: (name: string) => unknown;
}

/** Cadrage que le jeu va rendre (résolution, mode, rotation, mode arcade, caméra), dit au journal. Ne lève jamais. */
export function logFuturePinballView(facts: FuturePinballViewLogFacts): void {
  const prefix = `${FUTURE_PINBALL_NAME} (${facts.tableId}) : `; // i18n-ignore : journal
  try {
    const read = facts.read ?? ((name: string) => hkcuValue(FUTURE_PINBALL_GAMEPLAYER_KEY, name));
    const prefs: FuturePinballViewValues = {};
    for (const name of FUTURE_PINBALL_VIEW_VALUES) prefs[name] = read(name);
    const lines = futurePinballViewFacts({ prefs, ...(facts.screen ? { screen: facts.screen } : {}), ...(facts.flipperEdge ? { flipperEdge: facts.flipperEdge } : {}) });
    for (const line of lines) facts.log(prefix + line);
  } catch (error) {
    facts.log(`${prefix}cadrage : constat impossible (${(error as Error).message}).`); // i18n-ignore : journal
  }
}

/** Ne lève jamais : un constat qui échoue est dit, la partie se lance quand même. */
export function logFuturePinballLaunch(facts: FuturePinballLaunchFacts): void {
  const prefix = `${FUTURE_PINBALL_NAME} (${facts.tableId}) : `; // i18n-ignore : journal
  try {
    const defaultOutput = (facts.readDefault ?? defaultOutputOfWindows)();
    for (const line of futurePinballSoundReport({ ...(defaultOutput ? { defaultOutput } : {}), outputs: facts.outputs, ...(facts.audio ? { audio: facts.audio } : {}) }).lines) facts.log(prefix + line);
  } catch (error) {
    facts.log(`${prefix}son : sortie par défaut illisible (${(error as Error).message}).`); // i18n-ignore : journal
  }
  try {
    if (!facts.install) return;
    const other = (facts.findOther ?? (() => findFuturePinball({})))();
    for (const line of futurePinballViewReport(facts.install, facts.tableFile, other)) facts.log(prefix + line);
  } catch (error) {
    facts.log(`${prefix}vue : constat impossible (${(error as Error).message}).`); // i18n-ignore : journal
  }
}
