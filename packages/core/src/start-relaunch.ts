// Relance par Start : un appui long (START_HOLD_MS) sur le bouton Start de la borne, quand ce
// bouton est un bouton de joystick (Pinscape sur KL25Z, encodeur en mode manette), rouvre
// Cyber Pinball depuis Windows.
// - Cyber Pinball ouvert en mode bureau (« Bureau Windows ») : il lit lui-même le bouton et
//   ramène le menu (app/src/frontend.ts).
// - Cyber Pinball fermé : un veilleur sans fenêtre (CyberPinball.exe RELAUNCH_WATCHER_FLAG),
//   lancé à l'ouverture de session par un raccourci du dossier Démarrage, lit le bouton par le
//   SDL de VPX et lance Cyber Pinball (app/src/start-relaunch.ts). Tant que Cyber Pinball est
//   ouvert, le veilleur ne fait rien.
// Un bouton du clavier n'est pas concerné : sur le bureau, la touche irait aussi au programme
// au premier plan.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { CabinetButtons } from './model';

/** Option du veilleur : CyberPinball.exe --veilleur n'ouvre aucune fenêtre. */
export const RELAUNCH_WATCHER_FLAG = '--veilleur';
/** Raccourci du dossier Démarrage qui lance le veilleur. */
export const RELAUNCH_SHORTCUT = 'Cyber Pinball - relance par Start.lnk'; // i18n-ignore : nom de fichier
/** Durée de l'appui sur Start qui relance. */
export const START_HOLD_MS = 2000;

/** Préfixe des jetons de VPX pour un bouton de joystick (« SDLJoy_<GUID>_<rang>;<bouton> »). */
const JOYSTICK_PREFIX = 'SDLJoy_';

/** Le bouton Start de la borne s'il est un bouton de joystick ; undefined pour une touche du clavier ou sans relevé. */
export function joystickStartCode(buttons: CabinetButtons | undefined): string | undefined {
  const code = buttons?.start;
  return code && code.startsWith(JOYSTICK_PREFIX) ? code : undefined;
}

/**
 * Appui long : `update` à chaque sondage, avec l'état du bouton. Vrai une seule fois par appui,
 * quand le bouton est tenu sans interruption depuis `holdMs` ; il faut le relâcher pour recommencer.
 */
export class HoldDetector {
  private since: number | undefined;
  private fired = false;

  constructor(private readonly holdMs = START_HOLD_MS) {}

  update(down: boolean, now: number): boolean {
    if (!down) {
      this.since = undefined;
      this.fired = false;
      return false;
    }
    this.since ??= now;
    if (this.fired || now - this.since < this.holdMs) return false;
    this.fired = true;
    return true;
  }

  /** Oublie l'appui en cours (bouton changé). */
  reset(): void {
    this.since = undefined;
    this.fired = false;
  }

  /** Un bouton déjà tenu ne compte pas : il faut le relâcher, puis le tenir de nouveau. */
  waitRelease(): void {
    this.since = undefined;
    this.fired = true;
  }
}

/** Dossier des fichiers de la relance par Start, dans les données de la borne. */
export function relaunchDir(dataDir: string): string {
  return path.join(dataDir, 'relance-start');
}

/** Processus de Cyber Pinball ouvert (son pid) : le veilleur ne relance pas tant qu'il vit. */
export function relaunchAppPidFile(dataDir: string): string {
  return path.join(relaunchDir(dataDir), 'application.pid');
}

/** Processus du veilleur (son pid) : arrêté avant une mise à jour, qui remplace CyberPinball.exe. */
export function relaunchWatcherPidFile(dataDir: string): string {
  return path.join(relaunchDir(dataDir), 'veilleur.pid');
}

/** Choix de l'utilisateur (menu système > « Ma borne » > « Démarrage et accès » > « Relance par Start »). */
export function relaunchSettingsFile(dataDir: string): string {
  return path.join(relaunchDir(dataDir), 'reglage.json');
}

/** Relance par Start voulue : oui par défaut, non si l'utilisateur l'a coupée. */
export function relaunchEnabled(dataDir: string): boolean {
  try {
    return (JSON.parse(fs.readFileSync(relaunchSettingsFile(dataDir), 'utf8')) as { enabled?: boolean }).enabled !== false;
  } catch {
    return true;
  }
}

export function saveRelaunchEnabled(dataDir: string, enabled: boolean): void {
  fs.mkdirSync(relaunchDir(dataDir), { recursive: true });
  writeFileAtomic(relaunchSettingsFile(dataDir), `${JSON.stringify({ enabled }, null, 2)}\n`);
}

/** Pid écrit dans `file`, ou undefined. */
export function readPidFile(file: string): number | undefined {
  try {
    const pid = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

export function writePidFile(file: string, pid: number): void {
  writeFileAtomic(file, `${pid}\n`);
}

/**
 * Arrête le processus `pid` SEUL, jamais ses descendants (pas de `taskkill /T`).
 *
 * Le veilleur lance Cyber Pinball (appui long sur Start) : l'application est alors son enfant. Une
 * mise à jour qui arrêtait le veilleur avec `/T` tuait donc l'application elle-même, avant qu'elle
 * lance la mise en place et rende les écrans (24/11/2026, essai.17 vers essai.22 sur un PinCab).
 * Le veilleur n'a pas d'enfant à lui : l'arrêter seul suffit. Refuse son propre pid.
 */
export function stopProcessAlone(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill.exe', ['/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    return r.status === 0;
  }
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

/**
 * Arrête le veilleur noté dans veilleur.pid (avant une mise à jour : il tient CyberPinball.exe
 * ouvert) et retire le fichier. `isWatcher(pid)` dit si ce pid est bien le veilleur (un pid repris
 * par un autre programme ne compte pas). Rend le pid arrêté, ou undefined s'il n'y en avait pas.
 * Appelé par l'application, qui peut être l'enfant de ce veilleur : voir stopProcessAlone.
 */
export function stopRelaunchWatcherAt(dataDir: string, isWatcher: (pid: number) => boolean): number | undefined {
  const file = relaunchWatcherPidFile(dataDir);
  const pid = readPidFile(file);
  if (!pid || !isWatcher(pid)) return undefined;
  stopProcessAlone(pid);
  fs.rmSync(file, { force: true });
  return pid;
}

/** Ce que fait le veilleur quand l'appui long est reconnu. */
export type RelaunchDecision = 'launch' | 'app-open' | 'vpx-playing';

/**
 * Cyber Pinball déjà ouvert : rien (en mode bureau, il ramène lui-même le menu). Une partie de
 * VPX lancée hors de Cyber Pinball : rien non plus, Start y est un bouton du jeu.
 */
export function relaunchDecision(facts: { appAlive: boolean; vpxPlaying: boolean }): RelaunchDecision {
  if (facts.appAlive) return 'app-open';
  if (facts.vpxPlaying) return 'vpx-playing';
  return 'launch';
}
