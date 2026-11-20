// Partie d'une table de Future Pinball (19/11/2026 ; par BAM quand il est installé, 20/11/2026). La partie
// elle-même suit celle des jeux de Zen (playPinballFx, frontend.ts) : chargement, barres des tâches, autres
// front-ends, appui long sur Exit, statistiques, retour à la roue. Ici ce qui est propre à Future Pinball :
// où est le jeu, la commande (`/open "<table>.fpt" /play /exit`, par FPLoader de BAM s'il est là ; le jeu
// se ferme quand on quitte la table), ce qui empêche de jouer, et la place de sa fenêtre sur le playfield.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { dmdMirrorPlacement, pupScreenRole, pupWindowPlacement, findFuturePinball, FUTURE_PINBALL_NAME, FUTURE_PINBALL_PLAYER_KEY, futurePinballCommand, futurePinballDmdMirror, futurePinballGameKeys, futurePinballJoystickKeys, type NudgeSide, futurePinballPlacement, t, type ButtonsSource, type FuturePinballCommand, type FuturePinballInstall, type Rect, type TableEntry } from '@cyberpinball/core';
import { hkcuValue, type WindowInfo } from '@cyberpinball/win-displays';
import { FUTURE_PINBALL_BAM_LAUNCH_GAME, FUTURE_PINBALL_LAUNCH_GAME, type ZenLaunchGame } from './pinballfx-launcher';

/** Hors écran, les démonstrations donnent un faux Future Pinball (dossier contenant « Future Pinball.exe »). */
export const FUTURE_PINBALL_SIMULATED_ENV = 'CYBERPINBALL_FUTURE_PINBALL_SIMULE';

/**
 * Future Pinball sur ce PC : le faux des démonstrations, celui choisi à la main (gardé dans le dossier
 * des données), sinon le premier des emplacements habituels. Relu à chaque appel.
 */
export function detectFuturePinball(dataDir: string): FuturePinballInstall | undefined {
  const simulated = process.env[FUTURE_PINBALL_SIMULATED_ENV];
  return findFuturePinball({ dataDir, ...(simulated ? { candidates: [simulated] } : {}) });
}

/** Ce que la partie demande au lanceur, ou pourquoi elle est impossible. */
export interface FuturePinballPlan {
  name: string;
  why?: string;
  command?: FuturePinballCommand;
  /** dmdext, qui recopie le DMD du jeu sur l'écran DMD (installé avec le jeu, et réglé) ; absent : rien. */
  dmdMirror?: FuturePinballCommand;
  launchGame: ZenLaunchGame;
  /** Dernière ligne du message d'échec : ce qu'il faut vérifier. */
  failureHint: string;
}

export interface FuturePinballPlanOptions {
  /** Partie simulée hors écran : ni jeu ni commande. */
  simulated?: string;
  mode?: 'display';
  /** Le jeu trouvé (detectFuturePinball) ; absent : introuvable. */
  install?: FuturePinballInstall;
  exists?: (p: string) => boolean;
}

export function futurePinballPlan(table: Pick<TableEntry, 'file'>, opts: FuturePinballPlanOptions): FuturePinballPlan {
  const name = FUTURE_PINBALL_NAME;
  const exists = opts.exists ?? fs.existsSync;
  const command = opts.install ? futurePinballCommand(opts.install, table.file) : undefined;
  const why =
    opts.mode === 'display'
      ? t('Le cadrage d’une table de {game} se règle dans le jeu (Préférences, Vidéo).', { game: name })
      : opts.simulated !== undefined
        ? undefined
        : !opts.install
          ? t('{game} est introuvable sur ce PC. Menu système > Tables > Ajouter une table > « Tables de {game} » : choisir son dossier.', { game: name })
          : !exists(table.file)
            ? t('Le fichier de la table est introuvable : {file}.', { file: table.file })
            : !command
              ? t('Ce chemin ne peut pas être donné à {game} : {file}.', { game: name, file: table.file })
              : undefined;
  const dmdMirror = command && opts.install && opts.simulated === undefined && !why ? futurePinballDmdMirror(opts.install, table.file, exists) : undefined;
  return {
    name,
    ...(why ? { why } : {}),
    ...(command && opts.simulated === undefined ? { command } : {}),
    ...(dmdMirror ? { dmdMirror } : {}),
    launchGame: command?.bam ? FUTURE_PINBALL_BAM_LAUNCH_GAME : FUTURE_PINBALL_LAUNCH_GAME,
    failureHint: command?.bam
      ? t('Vérifiez que la table s’ouvre en lançant BAM\\FPLoader.exe vous-même : ses bibliothèques (.fpl), sa version de BAM.')
      : t('Vérifiez que la table s’ouvre dans {game} lui-même : ses bibliothèques (.fpl) et sa version du jeu.', { game: name }),
  };
}

/** Ce que le DMD recopié demande au système : remplacé dans les essais. */
export interface DmdMirrorSystem {
  launch(file: string, args: string[], cwd: string): { pid?: number; on(event: 'error', cb: (error: Error) => void): void };
  alive(pid: number): boolean;
  kill(pid: number): void;
}

const realDmdMirrorSystem: DmdMirrorSystem = {
  // Sa console cachée ; son DMD virtuel, une fenêtre à lui, reste visible.
  launch: (file, args, cwd) => spawn(file, args, { cwd, detached: true, stdio: 'ignore', windowsHide: true }),
  alive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
  kill: (pid) => {
    try {
      process.kill(pid);
    } catch {
      // Déjà parti.
    }
  },
};

/**
 * Lance dmdext (futurePinballDmdMirror) pour la partie : son processus compte parmi ceux du jeu (l'écran DMD
 * lui est laissé, game-screens.ts), et `stop` le ferme à la fin, par le numéro du processus lancé ici. Un
 * échec de lancement ne gêne pas la partie : il est seulement noté.
 */
export function startDmdMirror(command: FuturePinballCommand, log: (line: string) => void, system: DmdMirrorSystem = realDmdMirrorSystem): { pid(): number | undefined; stop(): void } {
  let pid: number | undefined;
  try {
    const child = system.launch(command.file, command.args, command.cwd);
    pid = child.pid;
    child.on('error', (error) => {
      log(`${FUTURE_PINBALL_NAME} : dmdext pas lancé (${error.message}) ; la partie continue sans DMD recopié.`); // i18n-ignore : journal
      pid = undefined;
    });
    log(`${FUTURE_PINBALL_NAME} : DMD recopié sur l'écran DMD par ${command.file} (processus ${pid ?? '?'}).`); // i18n-ignore : journal
  } catch (error) {
    log(`${FUTURE_PINBALL_NAME} : dmdext pas lancé (${(error as Error).message}) ; la partie continue sans DMD recopié.`); // i18n-ignore : journal
  }
  return {
    pid: () => pid,
    stop: () => {
      if (pid !== undefined && system.alive(pid)) system.kill(pid);
      pid = undefined;
    },
  };
}

/**
 * DMD recopié par dmdext (processus `pid`) posé sur l'écran DMD tel qu'il est maintenant (dmdMirrorPlacement) :
 * appelé régulièrement pendant la partie, il suit les écrans que Windows déplace. Rend la place donnée.
 */
export function placeDmdMirror(pid: number | undefined, dmdScreen: Rect | undefined, windows: () => WindowInfo[], setBounds: (w: WindowInfo, r: Rect) => boolean): Rect | undefined {
  if (pid === undefined || !dmdScreen) return undefined;
  // Sa plus grande fenêtre visible : le DMD (pas une console ni une infobulle).
  const own = windows().filter((w) => w.pid === pid && w.visible && w.rect.width > 0 && w.rect.height > 0);
  const dmd = own.sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
  if (!dmd) return undefined;
  const to = dmdMirrorPlacement(dmd.rect, dmdScreen);
  if (!to) return undefined;
  return setBounds(dmd, to) ? to : undefined;
}

/** Titre de la fenêtre du DMD virtuel de dmdext (son DmdDevice64.dll, chargé par Pinball FX, VPinMAME…). */
export const DMDEXT_VIRTUAL_TITLE = 'Virtual DMD';

/**
 * DMD virtuel de dmdext chargé par le jeu lui-même (Pinball FX : DmdDevice64.dll de VPinMAME, avec sa
 * colorisation et l'envoi aux PuP-Packs) posé sur l'écran DMD tel qu'il est, comme le DMD recopié de
 * Future Pinball (dmdMirrorPlacement). Essai du 20/11/2026 : DmdDevice.ini le plaçait sur le fronton
 * (5828, 322). Reconnu à son titre (le processus est celui du jeu, dont la plus grande fenêtre est le
 * plateau). Rend la place donnée.
 */
export function placeVirtualDmd(dmdScreen: Rect | undefined, windows: () => WindowInfo[], setBounds: (w: WindowInfo, r: Rect) => boolean): Rect | undefined {
  if (!dmdScreen) return undefined;
  const dmd = windows().find((w) => w.visible && w.title === DMDEXT_VIRTUAL_TITLE && w.rect.width > 0 && w.rect.height > 0);
  if (!dmd) return undefined;
  const to = dmdMirrorPlacement(dmd.rect, dmdScreen);
  if (!to) return undefined;
  return setBounds(dmd, to) ? to : undefined;
}

/**
 * Fenêtres de PinUP Player (processus `pids`) posées chacune sur l'écran de son rôle, tel qu'il est maintenant
 * (pupScreenRole, pupWindowPlacement) : appelé régulièrement pendant une partie de Future Pinball dont la table
 * joue un PuP-Pack. Rend les places données (journal).
 */
export function placePupWindows(pids: readonly number[], roleRect: (role: 'topper' | 'backglass' | 'dmd') => Rect | undefined, windows: () => WindowInfo[], setBounds: (w: WindowInfo, r: Rect) => boolean): { title: string; to: Rect }[] {
  if (!pids.length) return [];
  const placed: { title: string; to: Rect }[] = [];
  for (const w of windows()) {
    if (!pids.includes(w.pid) || !w.visible) continue;
    const role = pupScreenRole(w.title);
    if (!role) continue;
    const to = pupWindowPlacement(w.rect, roleRect(role));
    if (to && setBounds(w, to)) placed.push({ title: w.title, to });
  }
  return placed;
}

/**
 * Boutons de joystick de la borne et les touches que Future Pinball attend pour leur rôle, d'après ses
 * préférences (registre de l'utilisateur ; ses réglages d'origine si elles manquent). Pour le relais
 * des boutons (zen-keys.ts) : sans lui, une borne au Pinscape ne pouvait rien faire en partie.
 */
export function futurePinballButtonKeys(source: ButtonsSource, read: (value: string) => unknown = (value) => hkcuValue(FUTURE_PINBALL_PLAYER_KEY, value)): Map<string, string[]> {
  return futurePinballJoystickKeys(source, read);
}

/** Touches de secousse de Future Pinball (gauche, droite, vers l'avant), d'après ses préférences. */
export function futurePinballNudgeKeys(read: (value: string) => unknown = (value) => hkcuValue(FUTURE_PINBALL_PLAYER_KEY, value)): Partial<Record<NudgeSide, string>> {
  const keys = futurePinballGameKeys(read);
  return { ...(keys.nudgeLeft?.[0] ? { left: keys.nudgeLeft[0] } : {}), ...(keys.nudgeRight?.[0] ? { right: keys.nudgeRight[0] } : {}), ...(keys.nudgeCenter?.[0] ? { up: keys.nudgeCenter[0] } : {}) };
}

/**
 * Fenêtre de Future Pinball ouverte ailleurs que sur le playfield (mode fenêtre) : posée sur lui. Une
 * fenêtre plein écran (elle couvre exactement un écran) reste où le jeu l'a mise. Renvoie la place donnée.
 */
export function placeFuturePinballWindow(w: WindowInfo, playfield: Rect | undefined, displays: readonly Rect[], setBounds: (w: WindowInfo, r: Rect) => boolean): Rect | undefined {
  const to = futurePinballPlacement(w.rect, playfield, displays);
  if (!to) return undefined;
  return setBounds(w, to) ? to : undefined;
}
