// Orientation des écrans pendant la session (packages/core/src/sessionorientation.ts) : Windows
// garde la sienne, Cyber Pinball ne tourne l'écran du playfield que le temps d'être ouvert et la
// rend à chaque sortie. Importé par main.ts avant la borne dédiée : sa fermeture (will-quit) passe
// ici d'abord, avant que dedicated-session.ts ne sorte avec son code.
//
// Les sorties :
// - quitter, fermer la dernière fenêtre, mise à jour, borne dédiée (code 77) : will-quit, puis
//   process 'exit' en dernier recours (app.exit) ;
// - relance (menu ↔ assistant, langue, configuration, Shell Launcher) : handOver, le processus
//   suivant reprend le fichier sans rien rendre entre les deux ;
// - plantage, arrêt forcé : le fichier reste, le démarrage suivant le reprend ; extinction et
//   redémarrage de Windows : rien n'ayant été écrit dans son réglage, l'écran repart dans le sien ;
// - mode bureau : suspend, puis resume au retour ;
// - veille, écran rebranché : Windows peut remettre son réglage, la session reprend l'orientation de jeu.

import { app, powerMonitor, screen } from 'electron';
import {
  legacyOrientation,
  loadCabinet,
  ORIENTATION_FILE,
  rotateSimulated,
  saveCabinet,
  SessionOrientation,
  sessionScreens,
  wantedOrientations,
  fingerprintOf,
  type Cabinet,
  type LegacyOrientation,
  type ObservedDisplay,
  type OrientationReport,
  type Rotation,
} from '@cyberpinball/core';
import { setDisplayOrientation } from '@cyberpinball/win-displays';
import * as path from 'node:path';
import { observedDisplays, orientationSimulated, simulatedOrientationFile } from './displays';
import { locations } from './paths';

/** Le temps que Windows envoie ses notifications d'un changement d'écrans, avant de vérifier. */
const SETTLE_MS = 1500;

const loc = locations();
const simulated = orientationSimulated();

export const orientation = new SessionOrientation({
  file: path.join(loc.dataDir, ORIENTATION_FILE),
  screens: () => sessionScreens(observedDisplays(), loadCabinet(loc.dataDir)),
  rotate: (gdiName, rotation, persist) => {
    if (simulated) rotateSimulated(simulatedOrientationFile(), gdiName, rotation, persist);
    else setDisplayOrientation(gdiName, rotation, { persist });
  },
});

/** Constats à montrer au prochain écran du menu (bandeau) : ce qui n'a pas pu être rendu ou tourné. */
let pending: string[] = [];

function log(what: string, report: OrientationReport): void {
  for (const turn of report.turned) console.log(`Orientation : ${what}, ${turn.label} ${turn.from}° → ${turn.to}°${simulated ? ' (simulée)' : ''}.`); // i18n-ignore : journal
  for (const problem of report.problems) console.warn(`Orientation : ${problem}`); // i18n-ignore : journal
}

/**
 * Démarrage (menu ou assistant), avant d'ouvrir les fenêtres : reprend une session précédente,
 * puis donne à l'écran du playfield l'orientation de jeu du modèle. Une borne configurée avant le
 * 27/10/2026 dont Windows a perdu l'orientation (redémarrage) la retrouve ici, sans question.
 * Résolu une fois qu'Electron a vu le changement.
 */
export async function startOrientation(): Promise<void> {
  let cabinet = loadCabinet(loc.dataDir);
  const legacy = legacyOf(cabinet);
  if (cabinet && legacy && !legacy.desktopTurned) cabinet = rememberPlaying(cabinet, legacy.playing);
  const changed = displayChange();
  const report = orientation.start(wantedOrientations(cabinet));
  log('démarrage', report); // i18n-ignore : journal
  pending.push(...report.problems);
  await (report.turned.length && !simulated ? changed : Promise.resolve());
  watchDisplays();
}

/** Ce que le démarrage ou une vérification n'a pas pu faire, une fois. */
export function takeOrientationProblems(): string[] {
  const out = pending;
  pending = [];
  return out;
}

/**
 * Borne configurée avant le 27/10/2026 dont Windows garde encore l'orientation de jeu : le bureau
 * est à l'envers hors de Cyber Pinball. undefined sinon (déjà réparée, ou rien ne l'indique).
 */
export function legacyDesktopTurned(): LegacyOrientation | undefined {
  const legacy = legacyOf(loadCabinet(loc.dataDir));
  return legacy?.desktopTurned ? legacy : undefined;
}

/**
 * Réponse à la proposition de réparation. `giveBack` : Windows reprend l'orientation d'origine
 * (son réglage), la session garde celle de jeu ; sinon Windows garde la sienne. Dans les deux
 * cas, le modèle dit désormais l'orientation de jeu : la question ne revient pas.
 */
export function answerLegacy(legacy: LegacyOrientation, giveBack: boolean): OrientationReport {
  const cabinet = loadCabinet(loc.dataDir);
  const fp = cabinet?.roles.playfield;
  if (!cabinet || !fp) return { turned: [], problems: [] };
  rememberPlaying(cabinet, legacy.playing);
  const report = giveBack ? orientation.giveBack(fp, legacy.origin) : { turned: [], problems: [] };
  if (!giveBack) orientation.want(fp, legacy.playing);
  log(giveBack ? 'orientation rendue à Windows' : 'orientation de Windows gardée', report); // i18n-ignore : journal
  return report;
}

/** Mode bureau : l'écran retrouve l'orientation de Windows. */
export function orientationForDesktop(): void {
  log('mode bureau', orientation.suspend());
}

/** Retour du bureau ; vrai si un écran a pris ou perdu un quart de tour (les fenêtres sont à replacer). */
export function orientationFromDesktop(): boolean {
  const report = orientation.resume();
  log('retour du bureau', report); // i18n-ignore : journal
  return report.turned.some((turn) => (turn.to - turn.from) % 180 !== 0);
}

/** Relance : le processus suivant reprend l'orientation telle quelle. */
export function handOverOrientation(): void {
  orientation.handOver();
}

/** Sortie : l'orientation d'origine revient ; ce qui n'a pas pu revenir est noté pour le démarrage suivant. */
function endOrientation(): void {
  const report = orientation.end();
  log('sortie', report);
}

app.on('will-quit', endOrientation);
// app.exit (borne dédiée, essai arrêté) ne passe pas par will-quit ; une relance a passé la main avant.
process.on('exit', endOrientation);

let watching = false;
let timer: NodeJS.Timeout | undefined;

/** Veille, écran rebranché, pilote : un écran remis par Windows à son réglage reprend l'orientation de jeu. */
function watchDisplays(): void {
  if (watching) return;
  watching = true;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const report = orientation.check();
      if (report.turned.length || report.problems.length) log('écrans changés', report); // i18n-ignore : journal
      pending.push(...report.problems);
    }, SETTLE_MS);
  };
  screen.on('display-added', later);
  screen.on('display-metrics-changed', later);
  powerMonitor.on('resume', later);
}

/** Attend qu'Electron ait vu un changement d'écrans, 2 s au plus. */
function displayChange(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      screen.off('display-metrics-changed', done);
      setTimeout(resolve, 300); // Windows envoie plusieurs notifications d'affilée
    };
    const timeout = setTimeout(done, 2000);
    screen.on('display-metrics-changed', done);
  });
}

function playfieldDisplay(cabinet: Cabinet | undefined): ObservedDisplay | undefined {
  const fp = cabinet?.roles.playfield;
  return fp ? observedDisplays().find((d) => fingerprintOf(d).key === fp) : undefined;
}

function legacyOf(cabinet: Cabinet | undefined): LegacyOrientation | undefined {
  return legacyOrientation(cabinet, playfieldDisplay(cabinet));
}

/** Le modèle dit désormais l'orientation de jeu du playfield. */
function rememberPlaying<C extends Cabinet>(cabinet: C, rotation: Rotation): C {
  const updated = { ...cabinet, playfield: { ...cabinet.playfield!, windowsRotation: rotation } };
  saveCabinet(loc.dataDir, updated);
  console.log(`Orientation : borne configurée avant le 27/10/2026, orientation de jeu du playfield notée (${rotation}°).`); // i18n-ignore : journal
  return updated;
}
