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

import { classicVpx, vpxLaunchArguments } from './vpx-launch-compat';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyVpxWindow, DIALOG_CLASS, t, vpxClosingLogged, vpxExitName, vpxMissingLibrary, vpxStuckInPup, VR_PREVIEW_TITLE, VPX_HUNG_EXIT_CODE, watchVpxShutdown, type WindowsFault } from '@cyberpinball/core';
import { readWindowsFault } from './windows-fault';
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
  /** Fin du journal de VPX, seulement s'il l'a écrit pendant ce lancement (jamais celui d'une partie précédente). */
  logTail: string[];
  /**
   * VPX a-t-il écrit son journal pendant ce lancement ? Faux : il s'est arrêté avant d'en écrire une
   * ligne (rapports du 17/11/2026, dossier de VPX modifié). Absent : partie simulée, rien à dire.
   */
  logWritten?: boolean;
  /** Journal du VPX réellement lancé, y compris une installation classique externe. */
  logPath?: string;
  /** Le crash.txt que VPX a écrit à côté de la table en plantant (pile d'appels, modules), pour le rapport. */
  crashReport?: string;
  /**
   * Planté sans crash.txt : ce que Windows a noté de l'arrêt (événement « Application Error »), dont le
   * module fautif (windows-fault.ts). Un arrêt d'urgence (0xC0000409) ne passe pas par le gestionnaire
   * de plantage de VPX : sans cette note, le rapport ne disait pas quel module était en faute.
   */
  fault?: WindowsFault;
}

/** Taille gardée du crash.txt de VPX : sa pile et ses modules tiennent en quelques dizaines de Ko. */
const CRASH_REPORT_MAX = 200_000;

export interface LaunchOptions {
  exe: string;
  /** Version du VPX lancé : les VPX classiques demandent aussi de masquer leur éditeur. */
  version?: string;
  /** Le VPinballX.ini à passer par -Ini ; absent : celui de ce VPX (un autre VPX du PC et ses propres réglages). */
  ini?: string;
  table: string;
  /**
   * Réglage de l'affichage : -PovEdit au lieu de -Play (VPX 10.8.1, AppCommands.cpp) : la
   * même partie, son menu ouvert d'emblée sur « Point Of View » (cadrage de la table).
   */
  display?: boolean;
  /** Dossier des réglages de cette version de VPX, pour lire son journal (…\VPinballX\10.8). */
  vpxPrefDir: string;
  /** Variables d'environnement ajoutées pour VPX (couche OpenXR du repère de la pièce, partie dans le casque). */
  env?: Record<string, string>;
  /** L'INI de la table à passer par -TableIni (copie neutralisée pour une partie dans le casque). */
  tableIni?: string;
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
  const args = vpxLaunchArguments(opts);
  const child = spawn(opts.exe, args, {
    cwd: path.dirname(opts.exe),
    windowsHide: false,
    ...(opts.env && { env: { ...process.env, ...opts.env } }),
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
  /** Depuis quand VPX se ferme sans y arriver, et si Cyber Pinball l'a fermé pour ça. */
  let shutdownSince: number | undefined;
  let shutdownKilled = false;
  /** Fenêtres déjà traitées (masquées, fermées ou signalées), par HWND. */
  const handled = new Set<bigint>();
  /** Formulaires d'options de la table validés (OK pressé), par HWND, et quand. */
  const optionsPressed = new Map<bigint, number>();
  /** Le journal ne note qu'une fois par partie que l'aide de débogage a été fermée. */
  let debugCancelNoted = false;

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
        if (verdict.kind === 'cancel') {
          // Aide de débogage de core.vbs : Annuler, sans effet sur la table ; le joueur n'en est prévenu qu'une fois.
          const pressed = optionsPressed.get(w.handle);
          if (pressed === undefined) {
            const cancel = controls?.find((c) => c.id === verdict.cancelId);
            if (cancel && pressDialogButton(w, cancel)) {
              optionsPressed.set(w.handle, Date.now());
              if (!debugCancelNoted) {
                debugCancelNoted = true;
                notices.push(verdict.notice);
              }
              continue;
            }
          } else if (Date.now() - pressed < OPTIONS_CLOSE_MS) continue;
        }
        if (verdict.kind === 'options' || verdict.kind === 'information') {
          // Options de la table au démarrage, ou simple message du script : validés tels quels (OK), la
          // partie continue. Sans réponse, VPX attendrait toujours ; arrêtée, la table reposerait la question
          // à chaque lancement. Encore là OPTIONS_CLOSE_MS après le clic : arrêtée comme une erreur.
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
        if (verdict.kind === 'dialog' || verdict.kind === 'options' || verdict.kind === 'information' || verdict.kind === 'cancel') {
          // Une boîte de dialogue de VPX (question, erreur, ROM introuvable…) bloquerait
          // la borne : on rapporte son texte et on arrête la partie.
          failure = 'dialog';
          message = verdict.kind === 'dialog' || verdict.kind === 'information' ? verdict.message : [w.title.trim(), ...(controls ?? []).map((c) => c.text).filter(Boolean)].join(' : ');
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
      // parties sur trois, rien après la dernière image). Cause établie le 13 novembre 2026 (journal de
      // performance d'Oculus) : la sortie demandée casque retiré. La session OpenXR arrêtée ne demande
      // plus d'image, et VPX en attend une pour finir sa partie (player.cpp, « Flush any pending
      // frame »), sans plus lire ses messages : il ne repart que si le casque est remis. Sa fenêtre ne
      // répond plus depuis HUNG_KILL_MS, après que la partie a tourné un moment (un chargement long ne
      // compte pas) : Cyber Pinball le ferme, au lieu de laisser Windows proposer « Fermer le
      // programme ». Casque retiré sans sortie demandée, VPX lit toujours ses messages : il n'est pas
      // fermé. Le journal de fin de partie dit le cas (vrQuitWithoutHeadset, vr-cadence.ts).
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

      // Fermeture qui ne se termine pas (PinCab, 28/11/2026, Back to the Future) : VPX écrit « Closing
      // player… », s'arrête dans l'arrêt du PuP-Pack et ne rend plus la main ; l'écran reste figé, le son
      // de la bille boucle et le front-end attend toujours la fin du processus. Une fermeture normale
      // prend moins de deux secondes : passé VPX_SHUTDOWN_KILL_MS, Cyber Pinball ferme VPX (vpxshutdown.ts).
      // Valable avec ou sans casque : la fenêtre de jeu a disparu, ou ne répond plus pendant que le journal
      // dit que la partie se ferme.
      if (player && !failure && !shutdownKilled) {
        let ending = !windows.some((w) => w.handle === player!.handle);
        if (!ending) {
          try {
            ending = isHung(player) && vpxClosingLogged(readLogEnd(opts.vpxPrefDir), t0);
          } catch {
            ending = false;
          }
        }
        const watch = watchVpxShutdown(shutdownSince, ending, Date.now());
        shutdownSince = watch.since;
        if (watch.kill) {
          shutdownKilled = true;
          notices.push(
            vpxStuckInPup(readLogEnd(opts.vpxPrefDir))
              ? t('VPX ne se fermait pas, bloqué à l’arrêt du PuP-Pack : Cyber Pinball l’a fermé. Si cela revient sur cette table, joue-la sans son PuP-Pack.')
              : t('VPX ne se fermait pas après la fin de la partie : Cyber Pinball l’a fermé.'),
          );
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
      const logWritten = logWrittenSince(opts.vpxPrefDir, t0);
      let crashReport: string | undefined;
      try {
        crashReport = crash ? fs.readFileSync(crash, 'utf8').slice(0, CRASH_REPORT_MAX) : undefined;
      } catch {
        crashReport = undefined;
      }
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
      const result: LaunchResult = {
        ok: !failure,
        failure,
        message,
        exitCode,
        seconds: playingSince ? (Date.now() - playingSince) / 1000 : 0,
        loadSeconds: playingSince ? (playingSince - t0) / 1000 : undefined,
        ...(player?.title === VR_PREVIEW_TITLE && { vr: true }),
        notices,
        logTail: failure && logWritten ? readLogTail(opts.vpxPrefDir) : [],
        logWritten,
        logPath: path.join(opts.vpxPrefDir, 'vpinball.log'),
        ...(crashReport && { crashReport }),
      };
      // Planté sur un code de plantage sans crash.txt : le module fautif, d'après Windows (2 s au plus).
      if (failure === 'crash' && !crashReport && vpxExitName(exitCode) && !vpxMissingLibrary(exitCode)) {
        readWindowsFault(opts.exe, t0)
          .catch(() => undefined)
          .then((fault) => resolve(fault ? { ...result, fault } : result));
      } else resolve(result);
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
/**
 * Partie simulée hors écran (essais). `crashCode` : VPX « plante » peu après le début de la partie
 * avec ce code de sortie (démonstration des retours : écran d'échec, question du premier plantage).
 */
export function simulateVpx(opts: { onPlaying?: () => void; onForeground?: () => void; onWindows?: () => void; loadMs?: number; crashCode?: number }): RunningGame {
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
    if (opts.crashCode !== undefined) crashTimer = setTimeout(crash, 1500);
  }, loadMs);
  let crashTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  const crash = () => {
    if (stopped) return;
    stopped = true;
    finish({ ok: false, failure: 'crash', exitCode: opts.crashCode!, message: t("VPX s'est terminé avec le code {code}.", { code: opts.crashCode! }), seconds: 1.5, notices: [], logTail: [] });
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(shown);
    clearTimeout(timer);
    if (crashTimer) clearTimeout(crashTimer);
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

/**
 * VPX a-t-il écrit son journal depuis `since` (le lancement) ? Il l'ouvre dès son démarrage ; un
 * journal plus ancien est celui d'une partie précédente, qui ne dit rien de cet arrêt (rapports du
 * 17/11/2026 : le journal joint datait de la partie d'avant et égarait la lecture).
 */
export function logWrittenSince(prefDir: string, since: number): boolean {
  try {
    // Une seconde de marge : la date d'un fichier n'est pas à la milliseconde sur tous les disques.
    return fs.statSync(path.join(prefDir, 'vpinball.log')).mtimeMs >= since - 1000;
  } catch {
    return false;
  }
}

/** Dossier des réglages et du journal d'une version de VPX : %APPDATA%\VPinballX\<majeure.mineure>. */
export function vpxPrefDir(version: string): string {
  const minor = version.split('.').slice(0, 2).join('.');
  // Jusqu’à la 10.8.0, GetMyPrefPath ne met pas la version dans le chemin.
  const classic = classicVpx(version);
  return path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX', ...(classic ? [] : [minor]));
}

/** Les derniers 64 Ko du journal de VPX (cumulatif, plusieurs Mo : jamais relu en entier à chaque tour). */
function readLogEnd(prefDir: string, bytes = 65_536): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(path.join(prefDir, 'vpinball.log'), 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// 120 lignes : de quoi voir la fin de la partie (« Closing player… ») avant un plantage à la fermeture,
// que les plugins remplissent de dizaines de lignes (vpxShutdownCrash) ; l'erreur du script reste
// cherchée dans les 15 dernières, l'écran n'en montre que 5.
function readLogTail(prefDir: string, lines = 120): string[] {
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
