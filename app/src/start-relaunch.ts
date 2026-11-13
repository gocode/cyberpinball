// Relance par Start (packages/core/src/start-relaunch.ts) : un appui long sur le bouton Start,
// bouton de joystick de la borne, rouvre Cyber Pinball depuis Windows.
//
// Deux moitiés :
// - le veilleur (veilleur.ts), CyberPinball.exe en mode Node, sans fenêtre : lancé à l'ouverture
//   de session par le raccourci « CyberPinball.exe --veilleur » du dossier Démarrage (ce
//   processus-là ne fait que le lancer, puis sort), et par Cyber Pinball à chaque démarrage s'il
//   ne tourne pas. Il lance Cyber Pinball fermé. Il tient CyberPinball.exe ouvert : toute mise à
//   jour l'arrête d'abord (stopRelaunchWatcher ici, l'installeur, le déploiement) ;
// - dans Cyber Pinball ouvert, au bureau (« Bureau Windows ») : watchStartHold ramène le menu.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HoldDetector, readPidFile, RELAUNCH_SHORTCUT, RELAUNCH_WATCHER_FLAG, relaunchAppPidFile, relaunchWatcherPidFile, writePidFile } from '@cyberpinball/core';
import { app, shell } from 'electron';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';
import { cyberPinballAlive, vpxPlaying, watcherScript } from './start-relaunch-process';

/** Sondage de l'appui long au bureau. */
const HOLD_POLL_MS = 50;

/** Lance le veilleur en mode Node, détaché : il survit à ce processus. */
function startWatcher(): void {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  // Depuis les sources, Cyber Pinball se lance avec le dossier de l'application.
  const launchArgs = app.isPackaged ? [] : [app.getAppPath()];
  spawn(process.execPath, [watcherScript(), ...launchArgs], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(process.execPath), env }).unref();
}

/**
 * CyberPinball.exe --veilleur (raccourci du dossier Démarrage) : lance le veilleur en mode Node
 * et sort aussitôt, sans rien ouvrir. main.ts ne démarre alors rien d'autre.
 */
export function runRelaunchWatcher(): boolean {
  if (!process.argv.includes(RELAUNCH_WATCHER_FLAG)) return false;
  try {
    startWatcher();
  } catch (error) {
    console.warn(`Relance par Start : veilleur non lancé (${(error as Error).message}).`); // i18n-ignore : journal
  }
  app.exit(0);
  return true;
}

/** Cyber Pinball démarre (après son verrou d'instance unique) : le veilleur sait qu'il est ouvert. */
export function noteAppRunning(dataDir: string): void {
  const file = relaunchAppPidFile(dataDir);
  try {
    writePidFile(file, process.pid);
  } catch {
    return;
  }
  // Une relève écrit son propre pid avant que l'ancien processus ne sorte : seul le sien est retiré.
  process.on('exit', () => {
    if (readPidFile(file) === process.pid) fs.rmSync(file, { force: true });
  });
}

/** Arrête le veilleur (avant une mise à jour : il tient CyberPinball.exe ouvert). Vrai s'il tournait. */
export function stopRelaunchWatcher(dataDir: string): boolean {
  const pid = readPidFile(relaunchWatcherPidFile(dataDir));
  if (!cyberPinballAlive(pid)) return false;
  spawnSync('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
  fs.rmSync(relaunchWatcherPidFile(dataDir), { force: true });
  console.log(`Relance par Start : veilleur arrêté (pid ${pid}).`); // i18n-ignore : journal
  return true;
}

/**
 * Met le veilleur dans l'état voulu : raccourci du dossier Démarrage posé (ou remis s'il vise un
 * autre exécutable) et veilleur lancé ; sinon raccourci retiré et veilleur arrêté. Seulement
 * pour l'application installée : depuis les sources, process.execPath est Electron.
 */
export function syncRelaunchWatcher(opts: { dataDir: string; startupDir: string; wanted: boolean }): void {
  if (!app.isPackaged) return;
  const shortcut = path.join(opts.startupDir, RELAUNCH_SHORTCUT);
  try {
    if (!opts.wanted) {
      if (fs.existsSync(shortcut)) {
        fs.rmSync(shortcut, { force: true });
        console.log('Relance par Start : raccourci du dossier Démarrage retiré.'); // i18n-ignore : journal
      }
      stopRelaunchWatcher(opts.dataDir);
      return;
    }
    let current: string | undefined;
    try {
      current = fs.existsSync(shortcut) ? shell.readShortcutLink(shortcut).target : undefined;
    } catch {
      current = undefined;
    }
    if (current?.toLowerCase() !== process.execPath.toLowerCase()) {
      fs.mkdirSync(opts.startupDir, { recursive: true });
      shell.writeShortcutLink(shortcut, fs.existsSync(shortcut) ? 'replace' : 'create', {
        target: process.execPath,
        args: RELAUNCH_WATCHER_FLAG,
        cwd: path.dirname(process.execPath),
        description: 'Cyber Pinball : relance par un appui long sur Start', // i18n-ignore : raccourci
        icon: process.execPath,
        iconIndex: 0,
      });
      console.log(`Relance par Start : raccourci du dossier Démarrage posé (${shortcut}).`); // i18n-ignore : journal
    }
    if (!cyberPinballAlive(readPidFile(relaunchWatcherPidFile(opts.dataDir)))) startWatcher();
  } catch (error) {
    console.warn(`Relance par Start : ${(error as Error).message}`); // i18n-ignore : journal
  }
}

/**
 * Au bureau : un appui sur le bouton « Bureau Windows » de la borne (Boutons de l'interface),
 * bouton de joystick, ramène le menu, sauf pendant une partie de VPX lancée depuis le bureau.
 * Le bouton qui vient d'ouvrir le bureau, encore tenu, doit d'abord être relâché. Une touche du
 * clavier n'y est pas lue (un raccourci global sans Ctrl prendrait la touche à tout Windows) :
 * Ctrl+Maj+D, la barre des tâches ou Start maintenu ramènent alors le menu. Rend de quoi arrêter.
 */
export function watchDesktopButton(code: string, onPress: () => void): () => void {
  const press = new HoldDetector(0);
  press.waitRelease();
  const check = (): void => {
    if (!press.update(joystickButtonsHeld().includes(code), Date.now())) return;
    if (vpxPlaying()) return void console.log('Bureau Windows : bouton appuyé pendant une partie de VPX, ignoré.'); // i18n-ignore : journal
    console.log('Bureau Windows : bouton appuyé au bureau, retour au menu.'); // i18n-ignore : journal
    onPress();
  };
  const stopWatch = watchJoystickButtons(() => check());
  const timer = setInterval(check, HOLD_POLL_MS);
  return () => {
    clearInterval(timer);
    stopWatch();
  };
}

/**
 * Au bureau (« Bureau Windows ») : un appui long sur `code` appelle `onHold`, sauf pendant une
 * partie de VPX lancée depuis le bureau. Un Start déjà tenu en entrant (celui qui a choisi
 * « Bureau Windows ») doit d'abord être relâché. Rend de quoi arrêter.
 */
export function watchStartHold(code: string, onHold: () => void): () => void {
  const hold = new HoldDetector();
  hold.waitRelease();
  const check = (): void => {
    if (!hold.update(joystickButtonsHeld().includes(code), Date.now())) return;
    if (vpxPlaying()) return void console.log('Relance par Start : appui long pendant une partie de VPX, ignoré.'); // i18n-ignore : journal
    console.log('Relance par Start : appui long au bureau, retour au menu.'); // i18n-ignore : journal
    onHold();
  };
  const stopWatch = watchJoystickButtons(() => check());
  const timer = setInterval(check, HOLD_POLL_MS);
  return () => {
    clearInterval(timer);
    stopWatch();
  };
}
