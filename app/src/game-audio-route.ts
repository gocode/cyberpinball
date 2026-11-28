// Sortie audio des jeux sans choix de sortie (Pinball FX, FX3, Midnight, Future Pinball) : la sortie de
// l'étape « Son » devient la sortie par défaut de Windows le temps de la partie, puis l'ancienne est
// rendue (packages/core/src/game-audio-route.ts décide, ici on touche à Windows). Le témoin
// `audio-defaut-avant-jeu.json` garde l'ancienne sortie : si Cyber Pinball s'arrête en pleine partie,
// le démarrage suivant (ou la partie suivante) la rend. Jamais rendue si le joueur a changé de sortie
// entre-temps : on ne défait que ce qu'on a fait.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { gameAudioRoute, type CabinetAudio, type ObservedAudioOutput } from '@cyberpinball/core';
import { readEndpointVolumes, setDefaultEndpoint } from '@cyberpinball/win-displays';

export interface GameAudioDeps {
  /** Identifiant de la sortie par défaut de Windows ; undefined si Core Audio ne répond pas. */
  readDefault: () => string | undefined;
  /** Pose cette sortie comme sortie par défaut ; faux si Windows refuse. */
  setDefault: (id: string) => boolean;
}

const WITNESS = 'audio-defaut-avant-jeu.json';

const REAL: GameAudioDeps = {
  readDefault: () => readEndpointVolumes([])[0]?.id,
  setDefault: setDefaultEndpoint,
};

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

interface Witness {
  previous: string;
  target: string;
}

function readWitness(file: string): Witness | undefined {
  try {
    const w = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Witness>;
    return typeof w.previous === 'string' && typeof w.target === 'string' ? { previous: w.previous, target: w.target } : undefined;
  } catch {
    return undefined;
  }
}

/** Rend l'ancienne sortie si la sortie par défaut est encore celle qu'on a posée ; efface le témoin. Ne lève jamais. */
function giveBack(file: string, witness: Witness, log: (line: string) => void, label: string, deps: GameAudioDeps): void {
  try {
    const now = deps.readDefault();
    if (!now) log(`${label}Son : sortie par défaut de Windows illisible, l’ancienne n’est pas rendue ; elle reste à régler dans le panneau Son.`); // i18n-ignore : journal
    else if (!same(now, witness.target)) log(`${label}Son : la sortie par défaut de Windows a changé pendant la partie, laissée telle quelle.`); // i18n-ignore : journal
    else if (deps.setDefault(witness.previous)) log(`${label}Son : sortie par défaut de Windows rendue (celle d’avant la partie).`); // i18n-ignore : journal
    else {
      log(`${label}Son : la sortie par défaut de Windows n’a pas pu être rendue ; elle reste à régler dans le panneau Son.`); // i18n-ignore : journal
      return; // Témoin gardé : la prochaine partie, ou le démarrage, réessaie.
    }
  } catch (error) {
    log(`${label}Son : sortie par défaut pas rendue (${(error as Error).message}).`); // i18n-ignore : journal
    return;
  }
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Un témoin resté ne fait que refaire ce constat.
  }
}

/** Démarrage : ce qu'une partie arrêtée en route (plantage, arrêt de Windows) a laissé est rendu. */
export function restoreLeftoverGameAudio(dataDir: string, log: (line: string) => void, deps: GameAudioDeps = REAL): void {
  const file = path.join(dataDir, WITNESS);
  const witness = readWitness(file);
  if (witness) giveBack(file, witness, log, 'Jeu précédent interrompu : ', deps); // i18n-ignore : journal
  else if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

export interface GameAudioFacts {
  dataDir: string;
  /** Jeu et table, en tête des lignes du journal : « Pinball FX (id) : ». */
  label: string;
  audio: CabinetAudio | undefined;
  outputs: readonly ObservedAudioOutput[];
  log: (line: string) => void;
  deps?: GameAudioDeps;
}

/**
 * Avant le lancement du jeu : pose la sortie de l'étape « Son » comme sortie par défaut de Windows si le
 * jeu jouerait ailleurs. Rend la fonction qui remet l'ancienne (à appeler à la fin de la partie, toujours,
 * même quand rien n'a été changé). Ne lève jamais : un échec est dit, la partie se lance quand même.
 */
export function routeGameAudio(facts: GameAudioFacts): () => void {
  const deps = facts.deps ?? REAL;
  const prefix = `${facts.label} : `;
  const file = path.join(facts.dataDir, WITNESS);
  try {
    // Une partie précédente restée en route : sa sortie d'avant est rendue avant de décider d'une nouvelle.
    const left = readWitness(file);
    if (left) giveBack(file, left, facts.log, prefix, deps);
    const before = deps.readDefault();
    const route = gameAudioRoute({ defaultId: before, outputs: facts.outputs, audio: facts.audio });
    facts.log(`${prefix}Son : ${route.line}`); // i18n-ignore : journal
    if (!route.target || !before) {
      if (route.target && !before) facts.log(`${prefix}Son : sortie par défaut de Windows illisible, rien n'est changé.`); // i18n-ignore : journal
      return () => undefined;
    }
    const witness: Witness = { previous: before, target: route.target.id };
    // Témoin écrit avant le changement : un arrêt entre les deux se rattrape au démarrage.
    fs.mkdirSync(facts.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(witness));
    if (!deps.setDefault(route.target.id)) {
      fs.rmSync(file, { force: true });
      facts.log(`${prefix}Son : Windows a refusé de poser « ${route.target.name} » comme sortie par défaut ; le jeu joue sur la sortie actuelle.`); // i18n-ignore : journal
      return () => undefined;
    }
    return () => giveBack(file, witness, facts.log, prefix, deps);
  } catch (error) {
    facts.log(`${prefix}Son : sortie du jeu pas réglée (${(error as Error).message}) ; la partie se lance quand même.`); // i18n-ignore : journal
    return () => undefined;
  }
}
