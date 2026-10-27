// Session de la borne dédiée (dedicated.ts, core) : Cyber Pinball est le shell de Windows pour
// ce compte, lancé par Shell Launcher avec --borne-dediee. Importé tôt par main.ts, avant les
// modules qui lisent les arguments (assistant, étape…).
//
// Shell Launcher surveille le processus qu'il a lancé, et lui seul : à sa sortie, il le relance
// (plantage compris), sauf pour le code HANDOVER_EXIT_CODE. D'où trois règles :
// 1. une relance (menu ↔ assistant, langue…) du processus surveillé passe par Shell Launcher :
//    ses arguments sont notés, il se ferme, Shell Launcher le relance et le nouveau les reprend ;
// 2. une mise à jour sort avec HANDOVER_EXIT_CODE : l'installeur, qui attend la fermeture,
//    relance lui-même Cyber Pinball (hors surveillance jusqu'à la session suivante) ;
// 3. un Cyber Pinball de la session qui n'est pas surveillé (relancé par une mise à jour) se
//    relance lui-même s'il se ferme : sans Explorateur, rien d'autre ne le ferait.

import { spawn } from 'node:child_process';
import { app } from 'electron';
import { DEDICATED_SESSION_ENV, HANDOVER_EXIT_CODE, takeDedicatedFlag, takeShellRelaunch, writeShellRelaunch } from '@cyberpinball/core';
import { handOverOrientation } from './display-orientation';
import { OFFSCREEN } from './offscreen';
import { locations } from './paths';

const start = takeDedicatedFlag(process.argv);
/** Lancé par Shell Launcher : c'est ce processus qu'il surveille. */
const monitored = start.launched;
/** Arguments de la commande de Shell Launcher (hors exécutable et option) : ils ne se répètent pas dans une relance. */
const shellBase = start.argv.slice(1);
let exitCode: number | undefined;

if (monitored) {
  // L'option ne passe à aucune relance ; les arguments d'une relance demandée la remplacent.
  process.argv.splice(0, process.argv.length, ...start.argv, ...takeShellRelaunch(locations().dataDir));
  process.env[DEDICATED_SESSION_ENV] = '1';
}

app.on('will-quit', (event) => {
  if (exitCode !== undefined) {
    event.preventDefault();
    app.exit(exitCode);
    return;
  }
  // Règle 3 : un processus de la session hors surveillance se relance lui-même.
  if (shellSession() && !monitored && !OFFSCREEN) {
    console.log('Borne dédiée : Cyber Pinball se ferme hors de la surveillance de Shell Launcher, il se relance.');
    spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
});

/** Cyber Pinball est le shell de cette session (lancé par Shell Launcher, ou relancé depuis). */
export function shellSession(): boolean {
  return process.env[DEDICATED_SESSION_ENV] === '1';
}

/** Ce processus est celui que Shell Launcher surveille et relance. */
export function monitoredByShellLauncher(): boolean {
  return monitored;
}

/**
 * Règle 1 : relance par Shell Launcher. Rend false si ce processus n'est pas surveillé
 * (relance ordinaire, relaunchCovered).
 */
export function relaunchThroughShellLauncher(args: string[]): boolean {
  if (!monitored) return false;
  const own = shellBase.length && shellBase.every((a, i) => args[i] === a) ? args.slice(shellBase.length) : args;
  writeShellRelaunch(locations().dataDir, own);
  // Le processus relancé reprend l'orientation des écrans telle quelle.
  handOverOrientation();
  console.log(`Borne dédiée : relance par Shell Launcher (${own.join(' ') || 'sans argument'}).`);
  app.exit(0);
  return true;
}

/** Règle 2 : la fermeture qui suit ne doit rien faire relancer à Shell Launcher (mise à jour). */
export function handOverOnQuit(): void {
  if (monitored) exitCode = HANDOVER_EXIT_CODE;
  // Hors surveillance, pas de relance de soi-même non plus : l'installeur s'en charge.
  else if (shellSession()) exitCode = 0;
}
