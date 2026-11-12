// Relance par Start : ce que partagent le veilleur (veilleur.ts, CyberPinball.exe en mode Node,
// sans Electron) et Cyber Pinball (start-relaunch.ts). Aucun import d'electron ici.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { listWindows } from '@cyberpinball/win-displays';

/** Titre de la fenêtre de jeu de VPX 10.8.1 (Window.cpp), comme in-game-menu.ts. */
const PLAYER_TITLE = 'Visual Pinball Player';

/** Script du veilleur, à côté de ce module (dist\veilleur.js, regroupé à part par la fabrication). */
export function watcherScript(): string {
  return path.join(__dirname, 'veilleur.js');
}

/** Une partie de VPX est à l'écran : Start y est un bouton du jeu. */
export function vpxPlaying(): boolean {
  try {
    return listWindows((w) => w.title === PLAYER_TITLE && w.visible).length > 0;
  } catch {
    return false;
  }
}

/**
 * Le processus `pid` vit et c'est bien l'exécutable de Cyber Pinball (un pid repris par un autre
 * programme ne compte pas). Le veilleur tourne dans le même exécutable, en mode Node.
 */
export function cyberPinballAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const listed = spawnSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true }).stdout ?? '';
  return listed.toLowerCase().includes(`"${path.basename(process.execPath).toLowerCase()}"`);
}
