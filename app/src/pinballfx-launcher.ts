// Lancement d'une table d'un jeu de Zen (Pinball FX, Pinball FX3) et surveillance jusqu'à la
// fin de la partie. La commande (pinballFxCommand, pinballFx3Command dans packages/core) passe
// par Steam (steam.exe -applaunch) ou par l'exécutable d'Epic : le processus lancé n'est pas
// le jeu. Le jeu est reconnu à sa fenêtre (« PinballFX » ; « Pinball FX Classic » ou
// « Pinball FX3 ») ; la partie dure tant que ce processus vit.
// Quitter la table dans le jeu ramène à son propre menu, pas à Cyber Pinball : un
// appui long sur Exit (bouton de la borne) ferme le jeu et rend la main au menu. Le
// geste est écrit au chargement de la partie.
//
// Sert aussi à Future Pinball (19/11/2026, FUTURE_PINBALL_LAUNCH_GAME) : lancé directement, sans
// boutique, le processus lancé est le jeu ; sa fenêtre est la première fenêtre visible de ce processus.
// Avec BAM (20/11/2026, FUTURE_PINBALL_BAM_LAUNCH_GAME), le processus lancé est FPLoader : le jeu est le
// « Future Pinball.exe » apparu après le lancement, et FPLoader, s'il reste ouvert, est fermé à la fin.

import { spawn } from 'node:child_process';
import { FUTURE_PINBALL_EXE, FUTURE_PINBALL_NAME, HoldDetector, isPinballFx3WindowTitle, PINBALLFX_WINDOW_TITLE, t, ZEN_GAMES, type ZenGameKey } from '@cyberpinball/core';
import { allowAnyForeground, bringToFront, closeWindow, foregroundWindow, listWindows, processIdsByName, type WindowInfo } from '@cyberpinball/win-displays';
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
  launch(file: string, args: string[], cwd?: string): { pid?: number; on(event: 'error', cb: (error: Error) => void): void };
  windows(): WindowInfo[];
  alive(pid: number): boolean;
  kill(pid: number): void;
  close(w: WindowInfo): void;
  front(w: WindowInfo): void;
  foregroundPid(): number | undefined;
  now(): number;
  /** Numéros des processus d'un exécutable (jeu ouvert par un lanceur, ZenLaunchGame.processName). */
  processIds?(exe: string): number[];
}

/** Le jeu de Zen lancé : son nom (messages) et sa fenêtre de jeu. */
export interface ZenLaunchGame {
  name: string;
  isWindow(w: Pick<WindowInfo, 'title' | 'className' | 'visible'>): boolean;
  /**
   * Le processus lancé est le jeu (Future Pinball) : sa première fenêtre visible est la fenêtre de jeu,
   * et s'il s'arrête avant d'en ouvrir une, le lancement a échoué. Sinon (Steam), le jeu est reconnu à sa fenêtre.
   */
  ownProcess?: boolean;
  /**
   * Lancé directement par son exécutable (Pinball FX3 depuis un dossier choisi) : le jeu reste reconnu
   * à sa fenêtre, comme par Steam. Si le processus lancé s'arrête sans qu'aucune fenêtre de jeu ne
   * paraisse dans les DIRECT_GRACE_MS qui suivent, le jeu a refusé de s'ouvrir : échec aussitôt, pas
   * au bout du délai entier.
   */
  direct?: boolean;
  /**
   * Le processus lancé est un lanceur (FPLoader de BAM) qui ouvre le jeu : le jeu est un processus de cet
   * exécutable apparu après le lancement (ceux déjà ouverts avant ne comptent pas), et sa première fenêtre
   * visible fait la partie. Échec aussitôt si le jeu se ferme sans fenêtre, ou si le lanceur s'arrête sans
   * l'avoir ouvert (après DIRECT_GRACE_MS). Le lanceur encore ouvert à la fin de la partie est fermé.
   */
  processName?: string;
}

/** Lancement direct : délai laissé à une fenêtre de jeu après l'arrêt du processus lancé. */
export const DIRECT_GRACE_MS = 10_000;

export interface PinballFxLaunchOptions {
  command: { file: string; args: string[]; cwd?: string };
  /** La fenêtre de jeu vient de paraître (placement sur le playfield). */
  onWindow?: (w: WindowInfo) => void;
  /** Pinball FX par défaut. */
  game?: ZenLaunchGame;
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

/**
 * Fenêtre de jeu de Pinball FX3 : « Pinball FX Classic » depuis avril 2026, « Pinball FX3 » avant ;
 * le titre exact, jamais une page de Steam qui le nommerait (« Pinball FX Classic - Steam »).
 */
export function isPinballFx3Window(w: Pick<WindowInfo, 'title' | 'className' | 'visible'>): boolean {
  return w.visible && isPinballFx3WindowTitle(w.title);
}

export function isPinballFxMidnightWindow(w: Pick<WindowInfo, 'title' | 'className' | 'visible'>): boolean {
  return w.visible && w.className === 'UnrealWindow' && /^(?:Pinball FX Midnight|Pinball ?M)$/i.test(w.title.trim());
}

export const ZEN_LAUNCH_GAMES: Readonly<Record<ZenGameKey, ZenLaunchGame>> = {
  pinballfx: { name: ZEN_GAMES.pinballfx.name, isWindow: isPinballFxWindow },
  pinballfx3: { name: ZEN_GAMES.pinballfx3.name, isWindow: isPinballFx3Window },
  pinballfxmidnight: { name: ZEN_GAMES.pinballfxmidnight.name, isWindow: isPinballFxMidnightWindow },
};

/**
 * Future Pinball : la fenêtre de son propre processus (ownProcess), quel que soit son titre. Le titre
 * seul ne suffirait pas : une page web « Future Pinball - … » le porterait aussi.
 */
export const FUTURE_PINBALL_LAUNCH_GAME: ZenLaunchGame = { name: FUTURE_PINBALL_NAME, isWindow: () => false, ownProcess: true };

/** Future Pinball lancé par FPLoader (BAM) : le jeu reconnu à son exécutable. */
export const FUTURE_PINBALL_BAM_LAUNCH_GAME: ZenLaunchGame = { name: FUTURE_PINBALL_NAME, isWindow: () => false, processName: FUTURE_PINBALL_EXE };

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
  launch: (file, args, cwd) => spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false, ...(cwd ? { cwd } : {}) }), // fenêtre voulue
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
  processIds: processIdsByName,
};

/** Jeu de Zen déjà ouvert (partie précédente mal fermée) : son processus, s'il y en a un. */
export function runningPinballFx(system: PinballFxSystem = realPinballFxSystem, game: ZenLaunchGame = ZEN_LAUNCH_GAMES.pinballfx): number | undefined {
  return system.windows().find(game.isWindow)?.pid;
}

export function launchPinballFx(opts: PinballFxLaunchOptions): RunningGame {
  const sys = opts.system ?? realPinballFxSystem;
  const zen = opts.game ?? ZEN_LAUNCH_GAMES.pinballfx;
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
  /** Lancement direct : le processus lancé s'est arrêté à cet instant, sans fenêtre de jeu. */
  let directGoneAt: number | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  const notices: string[] = [];
  const hold = new HoldDetector(PINBALLFX_EXIT_HOLD_MS);
  // Exit encore tenu depuis le menu (le joueur l'a pressé pour autre chose) : il faut le relâcher d'abord.
  hold.waitRelease();
  // Jeu ouvert par un lanceur (BAM) : ses processus déjà ouverts avant ne sont pas cette partie.
  const before = zen.processName ? new Set(sys.processIds?.(zen.processName) ?? []) : undefined;
  const gameProcs = new Set<number>();
  /** Le lanceur (FPLoader) : fermé à la fin s'il est resté ouvert. */
  let loaderPid: number | undefined;

  let finish: (r: LaunchResult) => void = () => undefined;
  const done = new Promise<LaunchResult>((resolve) => (finish = resolve));
  let finished = false;
  let poll: NodeJS.Timeout | undefined;

  const end = () => {
    if (finished) return;
    finished = true;
    if (poll) clearInterval(poll);
    if (killTimer) clearTimeout(killTimer);
    // FPLoader lancé avec /STAYINRAM peut rester ouvert après le jeu : c'est le processus lancé ici, fermé.
    if (loaderPid !== undefined && sys.alive(loaderPid)) sys.kill(loaderPid);
    // Arrêté pendant le chargement : le jeu que le lanceur a déjà ouvert, sans fenêtre encore, ne reste pas.
    if (stopAsked) for (const pid of gameProcs) if (sys.alive(pid)) sys.kill(pid);
    const now = sys.now();
    finish({
      ok: !failure,
      ...(failure ? { failure, message } : {}),
      exitCode: null,
      // undefined, pas 0 : une horloge à 0 (essais) est un instant comme un autre.
      seconds: playingSince !== undefined ? (now - playingSince) / 1000 : 0,
      ...(playingSince !== undefined ? { loadSeconds: (playingSince - t0) / 1000 } : {}),
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
    child = opts.command.cwd ? sys.launch(opts.command.file, opts.command.args, opts.command.cwd) : sys.launch(opts.command.file, opts.command.args);
  } catch (error) {
    failure = 'spawn';
    message = t('Impossible de lancer {game} : {error}', { game: zen.name, error: (error as Error).message });
    queueMicrotask(end);
    return { pid: undefined, stop, done };
  }
  if (zen.processName) loaderPid = child.pid;
  child.on('error', (error) => {
    failure = 'spawn';
    message = t('Impossible de lancer {game} : {error}', { game: zen.name, error: error.message });
    end();
  });

  poll = setInterval(() => {
    if (finished) return;
    if (gamePid === undefined) {
      const own = zen.ownProcess ? child.pid : undefined;
      if (zen.processName && before) for (const pid of sys.processIds?.(zen.processName) ?? []) if (!before.has(pid)) gameProcs.add(pid);
      const w = sys.windows().find((x) => zen.isWindow(x) || (own !== undefined && x.pid === own && x.visible) || (x.visible && gameProcs.has(x.pid)));
      if (w) {
        gamePid = w.pid;
        gameWindow = w;
        if (stopAsked) {
          sys.close(w);
          return;
        }
        playingSince = sys.now();
        opts.onWindow?.(w);
        if (sys.foregroundPid() !== w.pid) sys.front(w);
        opts.onPlaying?.();
      } else if ((own !== undefined && !sys.alive(own)) || (gameProcs.size > 0 && [...gameProcs].every((pid) => !sys.alive(pid)))) {
        // Le jeu s'est fermé sans ouvrir de fenêtre : table illisible, ou refusée par le jeu.
        failure = 'crash';
        message = t('{game} s’est fermé sans ouvrir la table.', { game: zen.name });
        end();
      } else if (zen.processName && gameProcs.size === 0 && loaderPid !== undefined && !sys.alive(loaderPid) && sys.now() - (directGoneAt ??= sys.now()) > DIRECT_GRACE_MS) {
        // Le lanceur s'est arrêté sans que le jeu paraisse : BAM n'a pas pu l'ouvrir.
        failure = 'crash';
        message = t('{game} ne s’est pas ouvert : son lanceur (BAM) s’est arrêté avant.', { game: zen.name });
        end();
      } else if (zen.direct && child.pid !== undefined && !sys.alive(child.pid) && sys.now() - (directGoneAt ??= sys.now()) > DIRECT_GRACE_MS) {
        failure = 'crash';
        message = t('{game} s’est fermé sans ouvrir la table.', { game: zen.name });
        end();
      } else if (sys.now() - t0 > timeoutMs) {
        failure = 'timeout';
        message = t('{game} n’a pas ouvert sa fenêtre de jeu après {n} s.', { game: zen.name, n: Math.round(timeoutMs / 1000) });
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
      notices.push(t('Appui long sur Exit : {game} fermé, retour au front-end.', { game: zen.name }));
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
