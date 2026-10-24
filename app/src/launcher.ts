// Lancement d'une table dans VPX et surveillance jusqu'à la fin de la partie.
// Comportement observé sur VPX 10.8.1-5436 : en -Play, il ouvre directement
// ses fenêtres de jeu (Player, Score View, Backglass ; Topper créée cachée) sans
// l'éditeur ni l'audit de la table, et se termine proprement (code 0) quand on
// ferme la fenêtre Player. Chaque autre fenêtre visible de VPX est classée par
// classifyVpxWindow : fenêtre de l'éditeur masquée ou fermée (la partie continue,
// avec un constat), boîte de dialogue bloquante (la partie s'arrête, son texte
// devient le message), fenêtre inconnue signalée.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyVpxWindow, DIALOG_CLASS, t } from '@cyberpinball/core';
import {
  allowAnyForeground,
  bringToFront,
  closeWindow,
  foregroundWindow,
  hideWindow,
  visibleWindowsOf,
  windowTexts,
  type WindowInfo,
} from '@cyberpinball/win-displays';

const PLAYER_TITLE = 'Visual Pinball Player';
const POLL_MS = 250;

export type LaunchFailure = 'spawn' | 'timeout' | 'dialog' | 'crash';

export interface LaunchResult {
  ok: boolean;
  failure?: LaunchFailure;
  /** Message lisible : texte de la boîte de dialogue de VPX, ou explication. */
  message?: string;
  exitCode: number | null;
  /** Durée de jeu, de l'apparition de la fenêtre Player à la fin. */
  seconds: number;
  /** Secondes entre le lancement et l'apparition de la fenêtre Player. */
  loadSeconds?: number;
  /** Fenêtres de VPX autres que celles du jeu : masquées, fermées ou laissées, une phrase chacune. */
  notices: string[];
  logTail: string[];
}

export interface LaunchOptions {
  exe: string;
  ini: string;
  table: string;
  /**
   * Réglage de l'affichage : -PovEdit au lieu de -Play (VPX 10.8.1, AppCommands.cpp) : la
   * même partie, son menu ouvert d'emblée sur « Point Of View » (cadrage de la table).
   */
  display?: boolean;
  /** Dossier des réglages de cette version de VPX, pour lire son journal (…\VPinballX\10.8). */
  vpxPrefDir: string;
  timeoutMs?: number;
  /** Appelé quand la fenêtre de jeu est à l'écran. */
  onPlaying?: () => void;
}

export interface RunningGame {
  pid: number | undefined;
  /** Arrêt demandé par le frontend : fermeture polie, puis forcée après 5 s. */
  stop: () => void;
  done: Promise<LaunchResult>;
}

export function launchVpx(opts: LaunchOptions): RunningGame {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const t0 = Date.now();
  // VPX doit pouvoir prendre le premier plan même si Windows hésite.
  allowAnyForeground();
  const args = ['-Ini', opts.ini, opts.display ? '-PovEdit' : '-Play', opts.table];
  const child = spawn(opts.exe, args, {
    cwd: path.dirname(opts.exe),
    windowsHide: false,
  });

  let player: WindowInfo | undefined;
  let playingSince: number | undefined;
  let failure: LaunchFailure | undefined;
  let message: string | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  const notices: string[] = [];
  /** Fenêtres déjà traitées (masquées, fermées ou signalées), par HWND. */
  const handled = new Set<bigint>();

  const stop = () => {
    const target = player ?? visibleWindowsOf(child.pid ?? -1).find((w) => w.title === PLAYER_TITLE);
    if (target) closeWindow(target);
    killTimer ??= setTimeout(() => child.kill(), 5000);
  };

  const done = new Promise<LaunchResult>((resolve) => {
    const poll = setInterval(() => {
      if (child.pid === undefined || child.exitCode !== null) return;
      const windows = visibleWindowsOf(child.pid);

      for (const w of windows) {
        if (handled.has(w.handle) || failure) continue;
        const verdict = classifyVpxWindow({
          title: w.title,
          className: w.className,
          texts: w.className.trim() === DIALOG_CLASS ? windowTexts(w) : undefined,
        });
        if (verdict.kind === 'game') continue;
        if (verdict.kind === 'dialog') {
          // Une boîte de dialogue de VPX (question, erreur, ROM introuvable…) bloquerait
          // la borne : on rapporte son texte et on arrête la partie.
          failure = 'dialog';
          message = verdict.message;
          child.kill();
          return;
        }
        handled.add(w.handle);
        if (verdict.kind === 'editor') {
          if (verdict.action === 'close') closeWindow(w);
          else hideWindow(w);
          // Le jeu reprend le premier plan que la fenêtre lui a pris.
          if (player) bringToFront(player);
        }
        notices.push(verdict.notice);
      }

      if (!player) {
        player = windows.find((w) => w.title === PLAYER_TITLE);
        if (player) {
          playingSince = Date.now();
          if (foregroundWindow()?.pid !== child.pid) bringToFront(player);
          opts.onPlaying?.();
        } else if (Date.now() - t0 > timeoutMs && !failure) {
          failure = 'timeout';
          message = t("La fenêtre de jeu n'est pas apparue après {n} s.", { n: Math.round(timeoutMs / 1000) });
          child.kill();
        }
      }
    }, POLL_MS);

    const finish = (exitCode: number | null) => {
      clearInterval(poll);
      if (killTimer) clearTimeout(killTimer);
      const crash = newCrashReport(opts.table, t0);
      if (!failure && crash) {
        failure = 'crash';
        message = t("VPX s'est arrêté brutalement (rapport : {file}).", { file: crash });
      } else if (!failure && exitCode !== 0 && exitCode !== null && !killTimer) {
        failure = 'crash';
        message = t("VPX s'est terminé avec le code {code}.", { code: exitCode });
      }
      resolve({
        ok: !failure,
        failure,
        message,
        exitCode,
        seconds: playingSince ? (Date.now() - playingSince) / 1000 : 0,
        loadSeconds: playingSince ? (playingSince - t0) / 1000 : undefined,
        notices,
        logTail: failure ? readLogTail(opts.vpxPrefDir) : [],
      });
    };
    child.on('exit', (code) => finish(code));
    child.on('error', (error) => {
      failure = 'spawn';
      message = t('Impossible de lancer VPX : {error}', { error: error.message });
      finish(null);
    });
  });

  return { pid: child.pid, stop, done };
}

/**
 * Partie simulée, pour les essais sans opérateur hors écran (CYBERPINBALL_PARTIE_SIMULEE) :
 * VPX n'est jamais lancé ; sa « fenêtre de jeu » apparaît après `loadMs`, la partie dure
 * jusqu'à stop(). Le menu passe ainsi par le chargement, la partie et le retour, comme
 * avec VPX, sans rien ouvrir sur les écrans du poste.
 */
export function simulateVpx(opts: { onPlaying?: () => void; loadMs?: number }): RunningGame {
  const t0 = Date.now();
  let playingSince: number | undefined;
  let finish: (result: LaunchResult) => void = () => undefined;
  const done = new Promise<LaunchResult>((resolve) => (finish = resolve));
  const timer = setTimeout(() => {
    playingSince = Date.now();
    opts.onPlaying?.();
  }, opts.loadMs ?? 1500);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    finish({
      ok: true,
      exitCode: 0,
      seconds: playingSince ? (Date.now() - playingSince) / 1000 : 0,
      loadSeconds: playingSince ? (playingSince - t0) / 1000 : undefined,
      notices: [],
      logTail: [],
    });
  };
  return { pid: undefined, stop, done };
}

/** VPX écrit crash.txt à côté de la table quand il plante. */
function newCrashReport(table: string, since: number): string | undefined {
  const file = path.join(path.dirname(table), 'crash.txt');
  try {
    return fs.statSync(file).mtimeMs >= since ? file : undefined;
  } catch {
    return undefined;
  }
}

/** Dossier des réglages et du journal d'une version de VPX : %APPDATA%\VPinballX\<majeure.mineure>. */
export function vpxPrefDir(version: string): string {
  const minor = version.split('.').slice(0, 2).join('.');
  return path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX', minor);
}

function readLogTail(prefDir: string, lines = 15): string[] {
  try {
    const text = fs.readFileSync(path.join(prefDir, 'vpinball.log'), 'utf8');
    return text
      .split(/\r?\n/)
      .filter((l) => l && !/Script\.Print|was found but is disabled/.test(l))
      .slice(-lines);
  } catch {
    return [];
  }
}
