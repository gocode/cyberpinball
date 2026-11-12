// Veilleur de la relance par Start (packages/core/src/start-relaunch.ts), lancé par
// CyberPinball.exe en mode Node (ELECTRON_RUN_AS_NODE), comme maj-legere.js :
//   CyberPinball.exe <app>\dist\veilleur.js [arguments de lancement de Cyber Pinball]
// Sans Chromium ni fenêtre, il coûte presque rien : un sondage du bouton Start par le SDL de VPX
// (comme joystick-input.ts, mêmes jetons « SDLJoy_<GUID>_<rang>;<bouton> »), dix fois par
// seconde, et rien du tout tant que Cyber Pinball est ouvert. Un appui long lance Cyber Pinball,
// avec les arguments reçus.
//
// Un seul veilleur à la fois : son pid est dans <données>\relance-start\veilleur.pid ; un second,
// voyant le premier vivant, se ferme. Le même fichier sert à l'arrêter avant une mise à jour.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HoldDetector, joystickCode, joystickStartCode, loadCabinet, readPidFile, relaunchAppPidFile, relaunchDecision, relaunchWatcherPidFile, writePidFile } from '@cyberpinball/core';
import { openJoysticks, sdlLibraryIn, type JoystickReader } from '@cyberpinball/win-displays';
import { journalConsole } from './journal';
import { locations, vpxInstall } from './paths';
import { cyberPinballAlive, vpxPlaying } from './start-relaunch-process';

/** Sondage du bouton : assez fin pour un appui de deux secondes, presque rien pour le processeur. */
const POLL_MS = 100;
/** Relecture du relevé des boutons (cabinet.json) : un Start relevé de nouveau est suivi sans relancer le veilleur. */
const CABINET_EVERY_MS = 5000;
/** Cyber Pinball ouvert ou non : relu à ce rythme ; tant qu'il l'est, le joystick n'est pas lu. */
const APP_EVERY_MS = 2000;
/** Cyber Pinball lancé par le veilleur : le temps d'écrire son pid, aucun second lancement. */
const LAUNCH_GRACE_MS = 20_000;
/** Sans VPX ou sans SDL lisible : nouvel essai au bout de ce délai. */
const SDL_RETRY_MS = 30_000;
/** Deux veilleurs lancés ensemble : celui dont le pid reste écrit après ce délai garde la place. */
const CLAIM_CHECK_MS = 300;

function main(): void {
  const loc = locations();
  const dataDir = loc.dataDir;
  journalConsole(dataDir, 'Veilleur de la relance par Start'); // i18n-ignore : journal
  const pidFile = relaunchWatcherPidFile(dataDir);
  const other = readPidFile(pidFile);
  if (other && other !== process.pid && cyberPinballAlive(other)) {
    console.log(`Relance par Start : un veilleur tourne déjà (pid ${other}), celui-ci se ferme.`); // i18n-ignore : journal
    return;
  }
  writePidFile(pidFile, process.pid);
  setTimeout(() => {
    if (readPidFile(pidFile) !== process.pid) {
      console.log('Relance par Start : un autre veilleur a pris la place, celui-ci se ferme.'); // i18n-ignore : journal
      process.exit(0);
    }
    watch(dataDir, pidFile);
  }, CLAIM_CHECK_MS);
}

function watch(dataDir: string, pidFile: string): void {
  process.on('exit', () => {
    if (readPidFile(pidFile) === process.pid) fs.rmSync(pidFile, { force: true });
  });
  // Arguments de lancement de Cyber Pinball (depuis les sources : le dossier de l'application).
  const launchArgs = process.argv.slice(2);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const hold = new HoldDetector();
  let code: string | undefined;
  let codeAt = 0;
  let reader: JoystickReader | undefined;
  let nextTry = 0;
  let appAt = 0;
  let appOpen = false;
  let lastAppPid: number | undefined;
  let launchedUntil = 0;
  let held = false;

  const open = (): void => {
    nextTry = Date.now() + SDL_RETRY_MS;
    const install = vpxInstall(locations());
    const dll = process.env.CYBERPINBALL_SDL ?? (install && sdlLibraryIn(path.dirname(install.exe)));
    if (!dll) return;
    try {
      reader = openJoysticks(dll);
      console.log(`Relance par Start : veilleur prêt (SDL ${reader.version}, ${reader.devices().length} joystick(s)).`); // i18n-ignore : journal
    } catch (error) {
      console.warn(`Relance par Start : joysticks illisibles (${(error as Error).message}).`); // i18n-ignore : journal
    }
  };

  const tick = (): void => {
    const now = Date.now();
    if (now - codeAt >= CABINET_EVERY_MS) {
      codeAt = now;
      const next = joystickStartCode(loadCabinet(dataDir)?.buttons);
      if (next !== code) {
        code = next;
        held = false;
        hold.reset();
        console.log(next ? `Relance par Start : bouton suivi ${next}.` : 'Relance par Start : Start n’est pas un bouton de joystick, rien à suivre.'); // i18n-ignore : journal
      }
    }
    if (now - appAt >= APP_EVERY_MS) {
      appAt = now;
      const pid = readPidFile(relaunchAppPidFile(dataDir));
      // Le nom du processus n'est relu qu'à chaque nouveau pid : tasklist ne tourne pas toutes les deux secondes.
      if (pid !== lastAppPid) {
        lastAppPid = pid;
        appOpen = cyberPinballAlive(pid);
      } else if (appOpen && pid) {
        try {
          process.kill(pid, 0);
        } catch {
          appOpen = false;
        }
      } else appOpen = false;
      if (now < launchedUntil) appOpen = true;
      if (appOpen) {
        held = false;
        // Revenu sur Windows, l'appui qui a peut-être quitté Cyber Pinball ne compte pas : il faut relâcher.
        hold.waitRelease();
      }
    }
    if (!code || appOpen) return;
    if (!reader) {
      if (now < nextTry) return;
      open();
      if (!reader) return;
    }
    for (const e of reader.poll()) if (joystickCode(e.device, e.button) === code) held = e.down;
    if (!hold.update(held, now)) return;
    const decision = relaunchDecision({ appAlive: cyberPinballAlive(readPidFile(relaunchAppPidFile(dataDir))), vpxPlaying: vpxPlaying() });
    if (decision !== 'launch') {
      console.log(`Relance par Start : appui long reconnu, rien à faire (${decision}).`); // i18n-ignore : journal
      return;
    }
    console.log('Relance par Start : appui long reconnu, Cyber Pinball est lancé.'); // i18n-ignore : journal
    try {
      spawn(process.execPath, launchArgs, { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(process.execPath), env }).unref();
      // Le pid de Cyber Pinball arrive dans quelques instants : d'ici là, pas de second lancement.
      appOpen = true;
      launchedUntil = now + LAUNCH_GRACE_MS;
      appAt = now;
    } catch (error) {
      console.warn(`Relance par Start : lancement impossible (${(error as Error).message}).`); // i18n-ignore : journal
    }
  };
  setInterval(tick, POLL_MS);
  console.log(`Relance par Start : veilleur lancé (pid ${process.pid}).`); // i18n-ignore : journal
}

main();
