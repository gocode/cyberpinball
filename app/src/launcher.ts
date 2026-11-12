// Lancement d'une table dans VPX et surveillance jusqu'à la fin de la partie.
// Comportement observé sur VPX 10.8.1-5436 : en -Play, il ouvre directement
// ses fenêtres de jeu (Player, Score View, Backglass ; Topper créée cachée) sans
// l'éditeur ni l'audit de la table, et se termine proprement (code 0) quand on
// ferme la fenêtre Player. Chaque autre fenêtre visible de VPX est classée par
// classifyVpxWindow : fenêtre de l'éditeur masquée ou fermée (la partie continue,
// avec un constat), formulaire d'options de la table validé tel quel (la partie
// continue), boîte de dialogue bloquante (la partie s'arrête, son texte devient le
// message), fenêtre inconnue signalée.
// En VR (packages/core/src/vr.ts), VPX n'ouvre pas « Visual Pinball Player » mais « Visual Pinball
// VR Preview » (ce qu'un œil voit dans le casque) : elle tient lieu de fenêtre de jeu.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyVpxWindow, DIALOG_CLASS, t, VR_PREVIEW_TITLE, VPX_HUNG_EXIT_CODE } from '@cyberpinball/core';
import {
  allowAnyForeground,
  bringToFront,
  closeWindow,
  foregroundWindow,
  hideWindow,
  isHung,
  pressDialogButton,
  visibleWindowsOf,
  windowControls,
  type DialogControl,
  type WindowInfo,
} from '@cyberpinball/win-displays';

const PLAYER_TITLE = 'Visual Pinball Player';
/** En VR, la fenêtre de jeu est celle de l'aperçu (vr.ts) : la partie est dans le casque. */
const GAME_TITLES = [PLAYER_TITLE, VR_PREVIEW_TITLE];
const POLL_MS = 250;
/** Partie dans le casque : temps de jeu avant de surveiller une fenêtre de VPX figée, puis durée du figement avant de le fermer. */
const HUNG_GRACE_MS = 20_000;
// Windows ne déclare une fenêtre figée (IsHungAppWindow) qu'après 5 s sans lire ses messages :
// VPX part donc 8 s après s'être figé. Avec 8 s de plus (13 s), le joueur forçait au clavier.
const HUNG_KILL_MS = 3_000;
/** Formulaire d'options de la table encore ouvert ce temps après son OK : il ne se fermera pas, la partie est arrêtée. */
const OPTIONS_CLOSE_MS = 3_000;

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
  /** La partie s'est jouée dans le casque (fenêtre « Visual Pinball VR Preview ») ; faux sur les écrans. */
  vr?: boolean;
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
  /** Appelé juste avant onPlaying quand la fenêtre de jeu est l'aperçu de la VR : la partie est dans le casque. */
  onVr?: () => void;
  /**
   * Appelé une fois, quand VPX montre une première fenêtre (fronton, DMD…) avant celle du jeu :
   * le cartouche du chargement le dit (loadingprogress.ts).
   */
  onWindows?: () => void;
  /**
   * Appelé une fois, quand la fenêtre de jeu tient le premier plan (Windows le dit :
   * foregroundWindow appartient à VPX) : VPX a pris la main. Jamais d'après un délai : si
   * Windows ne lui donne jamais le premier plan, il n'est pas appelé.
   */
  onForeground?: () => void;
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
  let foreground = false;
  let windowsSeen = false;
  let failure: LaunchFailure | undefined;
  let message: string | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  const notices: string[] = [];
  /** Partie dans le casque : depuis quand la fenêtre de VPX ne répond plus, et si Cyber Pinball l'a fermé pour ça. */
  let hungSince: number | undefined;
  let hungKilled = false;
  /** Fenêtres déjà traitées (masquées, fermées ou signalées), par HWND. */
  const handled = new Set<bigint>();
  /** Formulaires d'options de la table validés (OK pressé), par HWND, et quand. */
  const optionsPressed = new Map<bigint, number>();

  const stop = () => {
    const target = player ?? visibleWindowsOf(child.pid ?? -1).find((w) => GAME_TITLES.includes(w.title));
    if (target) closeWindow(target);
    killTimer ??= setTimeout(() => child.kill(), 5000);
  };

  const done = new Promise<LaunchResult>((resolve) => {
    const poll = setInterval(() => {
      if (child.pid === undefined || child.exitCode !== null) return;
      const windows = visibleWindowsOf(child.pid);

      for (const w of windows) {
        if (handled.has(w.handle) || failure) continue;
        const controls: DialogControl[] | undefined = w.className.trim() === DIALOG_CLASS ? windowControls(w) : undefined;
        const verdict = classifyVpxWindow({
          title: w.title,
          className: w.className,
          texts: controls?.map((c) => c.text).filter(Boolean),
          controls,
        });
        if (verdict.kind === 'game') continue;
        if (verdict.kind === 'options') {
          // Options de la table au démarrage : validées telles quelles (OK), la partie continue.
          // Sans réponse, VPX attendrait toujours ; arrêtée, la table reposerait la question à
          // chaque lancement. Encore là OPTIONS_CLOSE_MS après le clic : arrêtée comme une erreur.
          const pressed = optionsPressed.get(w.handle);
          if (pressed === undefined) {
            const ok = controls?.find((c) => c.id === verdict.okId);
            if (ok && pressDialogButton(w, ok)) {
              optionsPressed.set(w.handle, Date.now());
              notices.push(verdict.notice);
              continue;
            }
          } else if (Date.now() - pressed < OPTIONS_CLOSE_MS) continue;
        }
        if (verdict.kind === 'dialog' || verdict.kind === 'options') {
          // Une boîte de dialogue de VPX (question, erreur, ROM introuvable…) bloquerait
          // la borne : on rapporte son texte et on arrête la partie.
          failure = 'dialog';
          message = verdict.kind === 'dialog' ? verdict.message : [w.title.trim(), ...(controls ?? []).map((c) => c.text).filter(Boolean)].join(' : ');
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

      if (!player && windows.length && !windowsSeen) {
        windowsSeen = true;
        opts.onWindows?.();
      }
      if (!player) {
        player = windows.find((w) => GAME_TITLES.includes(w.title));
        if (player) {
          playingSince = Date.now();
          if (foregroundWindow()?.pid !== child.pid) bringToFront(player);
          if (player.title === VR_PREVIEW_TITLE) opts.onVr?.();
          opts.onPlaying?.();
        } else if (Date.now() - t0 > timeoutMs && !failure) {
          failure = 'timeout';
          message = t("La fenêtre de jeu n'est pas apparue après {n} s.", { n: Math.round(timeoutMs / 1000) });
          child.kill();
        }
      }

      // Partie dans le casque : VPX 10.8.1 se fige en quittant (journal du 9 novembre 2026, trois
      // parties sur trois, rien après la dernière image). Sa fenêtre ne répond plus depuis
      // HUNG_KILL_MS, après que la partie a tourné un moment (un chargement long ne compte pas) :
      // Cyber Pinball le ferme, au lieu de laisser Windows proposer « Fermer le programme ».
      if (player?.title === VR_PREVIEW_TITLE && playingSince && Date.now() - playingSince > HUNG_GRACE_MS && !hungKilled) {
        let hung = false;
        try {
          hung = isHung(player);
        } catch {
          hung = false;
        }
        if (!hung) hungSince = undefined;
        else if (!hungSince) hungSince = Date.now();
        else if (Date.now() - hungSince > HUNG_KILL_MS) {
          hungKilled = true;
          notices.push(t('VPX ne répondait plus dans le casque : Cyber Pinball l’a fermé.'));
          child.kill();
        }
      }

      // VPX prend la main : sa fenêtre de jeu tient le premier plan (relu à chaque tour, dès qu'elle est là).
      if (player && !foreground && !failure && foregroundWindow()?.pid === child.pid) {
        foreground = true;
        opts.onForeground?.();
      }
    }, POLL_MS);

    const finish = (exitCode: number | null) => {
      clearInterval(poll);
      if (killTimer) clearTimeout(killTimer);
      const crash = newCrashReport(opts.table, t0);
      if (!failure && crash) {
        failure = 'crash';
        message = t("VPX s'est arrêté brutalement (rapport : {file}).", { file: crash });
      } else if (!failure && exitCode === VPX_HUNG_EXIT_CODE) {
        // « Fermer le programme » choisi dans la fenêtre « ne répond pas » de Windows : la partie a eu lieu.
        notices.push(t('VPX ne répondait plus en quittant : Windows l’a fermé.'));
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
        ...(player?.title === VR_PREVIEW_TITLE && { vr: true }),
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
export function simulateVpx(opts: { onPlaying?: () => void; onForeground?: () => void; onWindows?: () => void; loadMs?: number }): RunningGame {
  const t0 = Date.now();
  let playingSince: number | undefined;
  let finish: (result: LaunchResult) => void = () => undefined;
  const done = new Promise<LaunchResult>((resolve) => (finish = resolve));
  const loadMs = opts.loadMs ?? 1500;
  // Ses « fenêtres » (fronton, DMD) paraissent avant la fenêtre de jeu, comme celles de VPX : à mi-chargement, 8 s au plus.
  const shown = setTimeout(() => opts.onWindows?.(), Math.min(loadMs / 2, 8000));
  const timer = setTimeout(() => {
    playingSince = Date.now();
    opts.onPlaying?.();
    // Sans fenêtre de VPX, la « fenêtre de jeu » simulée a le premier plan dès qu'elle paraît.
    opts.onForeground?.();
  }, loadMs);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(shown);
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
