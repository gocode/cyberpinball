// Lancement d'une table de Pinball FX et surveillance jusqu'à la fin de la partie.
// La commande (pinballFxCommand, packages/core/src/pinballfx.ts) passe par Steam
// (steam.exe -applaunch) ou par l'exécutable d'Epic : le processus lancé n'est pas
// le jeu. Le jeu est reconnu à sa fenêtre (titre « PinballFX ») ; la partie dure tant
// que ce processus vit.
// Quitter la table dans le jeu ramène à son propre menu, pas à Cyber Pinball : un
// appui long sur Exit (bouton de la borne) ferme le jeu et rend la main au menu. Le
// geste est écrit au chargement de la partie.

import { spawn } from 'node:child_process';
import { HoldDetector, PINBALLFX_WINDOW_TITLE, t } from '@cyberpinball/core';
import { allowAnyForeground, bringToFront, closeWindow, foregroundWindow, listWindows, type WindowInfo } from '@cyberpinball/win-displays';
import type { LaunchResult, RunningGame } from './launcher';

const POLL_MS = 250;
/** Appui long sur Exit qui ferme le jeu (même durée que la relance par Start). */
export const PINBALLFX_EXIT_HOLD_MS = 2000;
/** Pinball FX met 20 à 25 s à ouvrir une table (Steam compris) ; au-delà, le lancement a échoué. */
const DEFAULT_TIMEOUT_MS = 120_000;
/** Fermeture polie demandée : le processus forcé après ce délai. */
const KILL_AFTER_MS = 5000;

/** Ce que le lanceur demande au système : remplacé dans les essais. */
export interface PinballFxSystem {
  launch(file: string, args: string[]): { pid?: number; on(event: 'error', cb: (error: Error) => void): void };
  windows(): WindowInfo[];
  alive(pid: number): boolean;
  kill(pid: number): void;
  close(w: WindowInfo): void;
  front(w: WindowInfo): void;
  foregroundPid(): number | undefined;
  now(): number;
}

export interface PinballFxLaunchOptions {
  command: { file: string; args: string[] };
  /** Le bouton Exit de la borne est tenu, maintenant (clavier ou joystick). */
  exitHeld?: () => boolean;
  timeoutMs?: number;
  onPlaying?: () => void;
  onForeground?: () => void;
  system?: PinballFxSystem;
}

/** Fenêtre de jeu de Pinball FX (Unreal Engine) : pas une fenêtre de Steam qui le nommerait. */
export function isPinballFxWindow(w: Pick<WindowInfo, 'title' | 'className' | 'visible'>): boolean {
  if (!w.visible) return false;
  const title = w.title.trim();
  return title === PINBALLFX_WINDOW_TITLE || (w.className === 'UnrealWindow' && /^pinball ?fx$/i.test(title));
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM : le processus existe, il appartient à un autre utilisateur.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export const realPinballFxSystem: PinballFxSystem = {
  // Steam (ou le jeu) ouvre ses fenêtres : c'est la partie.
  launch: (file, args) => spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false }), // fenêtre voulue
  windows: () => listWindows(),
  alive: pidAlive,
  kill: (pid) => {
    try {
      process.kill(pid);
    } catch {
      // Déjà parti.
    }
  },
  close: closeWindow,
  front: (w) => void bringToFront(w),
  foregroundPid: () => foregroundWindow()?.pid,
  now: () => Date.now(),
};

/** Pinball FX déjà ouvert (partie précédente mal fermée) : son processus, s'il y en a un. */
export function runningPinballFx(system: PinballFxSystem = realPinballFxSystem): number | undefined {
  return system.windows().find(isPinballFxWindow)?.pid;
}

export function launchPinballFx(opts: PinballFxLaunchOptions): RunningGame {
  const sys = opts.system ?? realPinballFxSystem;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = sys.now();
  if (!opts.system) allowAnyForeground();

  let gamePid: number | undefined;
  let gameWindow: WindowInfo | undefined;
  let playingSince: number | undefined;
  let foreground = false;
  let failure: LaunchResult['failure'];
  let message: string | undefined;
  let stopAsked = false;
  let killTimer: NodeJS.Timeout | undefined;
  const notices: string[] = [];
  const hold = new HoldDetector(PINBALLFX_EXIT_HOLD_MS);
  // Exit encore tenu depuis le menu (le joueur l'a pressé pour autre chose) : il faut le relâcher d'abord.
  hold.waitRelease();

  let finish: (r: LaunchResult) => void = () => undefined;
  const done = new Promise<LaunchResult>((resolve) => (finish = resolve));
  let finished = false;
  let poll: NodeJS.Timeout | undefined;

  const end = () => {
    if (finished) return;
    finished = true;
    if (poll) clearInterval(poll);
    if (killTimer) clearTimeout(killTimer);
    const now = sys.now();
    finish({
      ok: !failure,
      ...(failure ? { failure, message } : {}),
      exitCode: null,
      seconds: playingSince ? (now - playingSince) / 1000 : 0,
      ...(playingSince ? { loadSeconds: (playingSince - t0) / 1000 } : {}),
      notices,
      logTail: [],
    });
  };

  const stop = () => {
    if (finished) return;
    stopAsked = true;
    if (gameWindow) sys.close(gameWindow);
    if (gamePid === undefined) {
      // Pas encore de jeu : arrêté pendant le chargement. Le jeu qui paraîtrait ensuite est fermé aussitôt.
      killTimer ??= setTimeout(end, KILL_AFTER_MS);
      return;
    }
    const pid = gamePid;
    killTimer ??= setTimeout(() => {
      if (sys.alive(pid)) sys.kill(pid);
      end();
    }, KILL_AFTER_MS);
  };

  let child: ReturnType<PinballFxSystem['launch']>;
  try {
    child = sys.launch(opts.command.file, opts.command.args);
  } catch (error) {
    failure = 'spawn';
    message = t('Impossible de lancer Pinball FX : {error}', { error: (error as Error).message });
    queueMicrotask(end);
    return { pid: undefined, stop, done };
  }
  child.on('error', (error) => {
    failure = 'spawn';
    message = t('Impossible de lancer Pinball FX : {error}', { error: error.message });
    end();
  });

  poll = setInterval(() => {
    if (finished) return;
    if (gamePid === undefined) {
      const w = sys.windows().find(isPinballFxWindow);
      if (w) {
        gamePid = w.pid;
        gameWindow = w;
        if (stopAsked) {
          sys.close(w);
          return;
        }
        playingSince = sys.now();
        if (sys.foregroundPid() !== w.pid) sys.front(w);
        opts.onPlaying?.();
      } else if (sys.now() - t0 > timeoutMs) {
        failure = 'timeout';
        message = t('Pinball FX n’a pas ouvert sa fenêtre de jeu après {n} s.', { n: Math.round(timeoutMs / 1000) });
        end();
      }
      return;
    }
    if (!sys.alive(gamePid)) {
      end();
      return;
    }
    if (!foreground && sys.foregroundPid() === gamePid) {
      foreground = true;
      opts.onForeground?.();
    }
    if (opts.exitHeld && hold.update(opts.exitHeld(), sys.now()) && !stopAsked) {
      notices.push(t('Appui long sur Exit : Pinball FX fermé, retour au front-end.'));
      stop();
    }
  }, POLL_MS);

  return {
    get pid() {
      return gamePid ?? child.pid;
    },
    stop,
    done,
  };
}
