// Gardien des écrans : du démarrage de l'application à sa fermeture, aucun écran de la
// borne ne montre le bureau Windows. Une seule règle pour tous les moments (démarrage
// avant que les fenêtres soient prêtes, chargement et partie de VPX, passage du menu à
// l'assistant ou aux réglages, installation de VPX, fermeture d'un écran) :
// 1. un voile noir par écran, ouvert avant toute autre fenêtre ; les fenêtres de Cyber
//    Pinball, puis celles de VPX, s'empilent dessus. Il ne prend jamais le focus.
// 2. Une relance de l'application (menu ↔ assistant) passe le relais sans trou : l'ancien
//    processus garde ses fenêtres jusqu'à ce que le nouveau ait peint les siennes.
// 3. Pendant une partie, les barres des tâches de Windows sont masquées : quand VPX prend le
//    premier plan, Windows les remet un instant devant les écrans qu'il n'occupe pas. À la
//    fin, seules celles que Cyber Pinball a masquées reviennent (coexistence.ts).
// 4. Deux fois par seconde, la pile des fenêtres de Windows est relue (screenCover) : un
//    écran qui reste découvert, ou sous la barre des tâches, est signalé dans la console.
//    Une barre des tâches passée devant une fenêtre du menu est aussitôt remise derrière
//    (gardien des barres, packages/core/src/taskbarguard.ts), à cette relecture comme à chaque
//    bascule (retour de partie, retour du bureau, changement d'écrans ou de zone de travail,
//    premier plan rendu au menu) ; chaque bascule est notée dans <données>\logs\ecrans.txt :
//    premier plan, ce qui est au-dessus de chaque écran, rectangle de chaque barre.
// 5. En mode bureau (desktop-mode.ts), l'inverse : les voiles sont cachés, ceux d'un écran
//    branché entre-temps naissent cachés, et un écran qu'une fenêtre de Cyber Pinball
//    recouvre encore est signalé (desktopBlockers). Au retour, chaque écran retrouve son voile.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app, BrowserWindow, screen, type Display, type Rectangle } from 'electron';
import {
  appendErrorLog,
  coverNotice,
  coveringWindow,
  desktopBlockers,
  displayOf,
  parseTaskbarMarker,
  repairNotice,
  screenCover,
  SCREENS_LOG_FILE,
  stackingReport,
  TaskbarGuard,
  taskbarMarkerText,
  taskbarsToRestore,
  type GuardScreen,
  type HiddenTaskbar,
  type TaskbarFacts,
  type TaskbarMoment,
} from '@cyberpinball/core';
import { allowAnyForeground, foregroundWindow, hideWindow, listWindows, placeWindowBelow, showWindowInactive, taskbarWindows, type WindowInfo } from '@cyberpinball/win-displays';
import { createWindow, desktopDisplays, isShown, OFFSCREEN, paintedOnScreen } from './offscreen';
import { coverDisplay, coverProblem } from './cover-display';
import { locations } from './paths';
import { relaunchThroughShellLauncher } from './dedicated-session';
import { handOverOrientation } from './display-orientation';

export const VEIL_TITLE = 'Cyber Pinball — Fond';
const VEIL_PAGE = 'data:text/html;charset=utf-8,<!doctype html><html style="background:%23000;cursor:none"></html>';
const CHECK_MS = 500;
/** Délai après un changement d'écrans avant de vérifier que chaque voile couvre bien le sien. */
const DISPLAY_SETTLE_MS = 1500;
/** Un écran découvert moins longtemps que cela (une fenêtre qui s'ouvre) n'est pas signalé. */
const REPORT_AFTER_MS = 1000;
/** Au-delà, une relance qui n'a rien montré laisse quand même partir l'ancien processus. */
const RELAUNCH_TIMEOUT_MS = 15_000;
/** Fichier témoin d'une relance : le nouveau processus le crée quand ses fenêtres sont peintes. */
const RELAY_ENV = 'CYBERPINBALL_RELEVE';
/** Marge entre le signal du nouveau processus et la fermeture de l'ancien. */
const RELAY_SETTLE_MS = 400;

/** Voile de chaque écran, par identifiant d'écran d'Electron. */
const veils = new Map<number, BrowserWindow>();
const veilSet = new WeakSet<BrowserWindow>();
/** Nom des écrans dans les constats (rôle dans la borne), par identifiant d'écran. */
const names = new Map<number, string>();
/** Raison pour laquelle le bureau peut se voir (mode bureau, fermeture) ; undefined : il ne doit pas. */
let desktopAllowed: string | undefined;
/** Mode bureau : les voiles restent cachés, aucune fenêtre de Cyber Pinball ne doit couvrir un écran. */
let desktopMode = false;
/** Mode bureau : constat déjà fait, par écran (fenêtres qui le recouvraient). */
const desktopReported = new Map<number, string>();
let relaunching = false;
const uncoveredSince = new Map<number, number>();
const reported = new Map<number, string>();
let incidents: string[] = [];

/**
 * À appeler dans app.whenReady, avant toute autre fenêtre : chaque écran reçoit son voile
 * noir, que les changements d'écrans (ajout, retrait, rotation) suivent.
 */
export function guardScreens(): void {
  // Hors écran (essai sans opérateur) : les écrans sont simulés ; on ne touche ni aux vrais
  // écrans ni aux barres des tâches du poste.
  if (OFFSCREEN) return;
  // Barres des tâches restées masquées par une partie interrompue (plantage, arrêt forcé).
  if (fs.existsSync(taskbarMarker())) restoreTaskbars(parseTaskbarMarker(fs.readFileSync(taskbarMarker(), 'utf8')));
  process.on('exit', () => hiddenTaskbars.length > 0 && restoreTaskbars());
  placeVeils();
  // Relancé par relaunchCovered : l'ancien processus attend que nos fenêtres soient peintes.
  const relay = process.env[RELAY_ENV];
  delete process.env[RELAY_ENV];
  if (relay) paintedOnScreen(() => fs.writeFileSync(relay, ''));
  // Un écran rebranché (ou réveillé) n'est pas toujours prêt à l'événement : un voile mis en
  // plein écran trop tôt atterrit sur l'écran principal. Il est replacé un peu plus tard.
  // L'Explorateur replace aussi ses barres des tâches, devant tout, à un changement d'écrans ou
  // de zone de travail (display-metrics-changed, « workArea ») : elles reviennent derrière.
  const displaysChanged = () => {
    placeVeils();
    settleTaskbars('displays');
    setTimeout(() => {
      placeVeils(true);
      settleScreens('displays');
    }, DISPLAY_SETTLE_MS);
  };
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  // Une fenêtre du menu reprend le premier plan (retour de partie, du bureau, d'Alt+Tab) :
  // l'Explorateur ne range derrière elle que la barre de son écran.
  app.on('browser-window-focus', () => settleTaskbars('focus'));
  // Les voiles ne retiennent pas l'application : elle se ferme avec sa dernière vraie fenêtre.
  app.on('browser-window-created', (_event, win) => {
    if (creatingVeil) return;
    win.on('closed', () => {
      if (!relaunching && BrowserWindow.getAllWindows().every((w) => w.isDestroyed() || veilSet.has(w))) app.quit();
    });
  });
  app.on('before-quit', (event) => {
    // Pendant une relève, l'ancien processus garde ses fenêtres jusqu'à ce que le nouveau
    // peigne les siennes (relaunchCovered le ferme alors par app.exit).
    if (relaunching) return event.preventDefault();
    desktopAllowed = 'fermeture';
  });
  setInterval(checkScreens, CHECK_MS).unref();
}

let creatingVeil = false;

/** `recheck` : replace aussi un voile dont l'écran n'a pas changé mais qu'il ne couvre pas. */
function placeVeils(recheck = false): void {
  const displays = desktopDisplays();
  for (const [id, veil] of veils) {
    if (displays.some((d) => d.id === id)) continue;
    veils.delete(id);
    if (!veil.isDestroyed()) veil.destroy();
  }
  for (const d of displays) {
    const veil = veils.get(d.id);
    if (!veil || veil.isDestroyed()) veils.set(d.id, openVeil(d));
    else if (!sameRect(veil.getBounds(), d.bounds) || (recheck && coverProblem({ fullScreen: veil.isFullScreen(), bounds: veil.getBounds() }, d.bounds))) coverDisplay(veil, d.bounds);
  }
}

function openVeil(d: Display): BrowserWindow {
  creatingVeil = true;
  const win = createWindow({
    title: VEIL_TITLE,
    frame: false,
    show: false,
    skipTaskbar: true,
    // Jamais au premier plan : un clic dessus ne le fait pas passer devant le menu ni VPX.
    focusable: false,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  creatingVeil = false;
  veilSet.add(win);
  coverDisplay(win, d.bounds);
  // Sans page, Chromium peint la fenêtre en blanc malgré backgroundColor. Le titre reste
  // celui du voile (constats du gardien, recherches dans la pile des fenêtres).
  win.on('page-title-updated', (e) => e.preventDefault());
  void win.loadURL(VEIL_PAGE);
  // Le voile n'apparaît que peint en noir ; avant sa première image, il serait transparent
  // (createWindow) : au démarrage, le bureau se voit un peu plus longtemps ; à une relance, les
  // fenêtres de l'ancien processus couvrent les écrans jusque-là.
  // En mode bureau (écran branché entre-temps), il attend caché le retour au menu.
  win.once('ready-to-show', () => win.isDestroyed() || desktopMode || win.showInactive());
  return win;
}

/** Voile noir du gardien des écrans (le mode bureau le cache au lieu de le réduire). */
export function isVeil(win: BrowserWindow): boolean {
  return veilSet.has(win);
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Barres des tâches masquées par Cyber Pinball pendant la partie en cours. Seules celles-là
 * reviennent à la fin : une barre déjà masquée avant (par un autre menu de borne, comme
 * PinUP Popper, ou par un outil) le reste.
 */
let hiddenTaskbars: HiddenTaskbar[] = [];
/** Barres déjà masquées au début de la partie : pas les nôtres, même réaffichées par Windows entre-temps. */
let notOurs = new Set<bigint>();

/** Témoin des barres des tâches masquées, pour les rétablir au démarrage suivant si l'application s'arrête en pleine partie. */
function taskbarMarker(): string {
  return path.join(locations().dataDir, 'barres-des-taches-masquees');
}

function writeTaskbarMarker(): boolean {
  try {
    fs.mkdirSync(path.dirname(taskbarMarker()), { recursive: true });
    fs.writeFileSync(taskbarMarker(), taskbarMarkerText(hiddenTaskbars));
    return true;
  } catch {
    return false;
  }
}

/**
 * Début d'une partie : les barres des tâches de Windows sont masquées. Sans cela, quand VPX
 * prend le premier plan avant que sa fenêtre de jeu soit en plein écran, Windows remet la
 * barre des tâches devant les écrans qu'il n'occupe pas (vu sur l'écran du DMD).
 */
export function hideTaskbars(): void {
  if (OFFSCREEN) return;
  const all = taskbarWindows();
  const shown = all.filter((w) => w.visible);
  // Une barre déjà masquée par le gardien des barres (Windows la remettait devant) reste des nôtres.
  const ours = (w: WindowInfo) => hiddenTaskbars.some((h) => h.handle === w.handle);
  notOurs = new Set(all.filter((w) => !w.visible && !ours(w)).map((w) => w.handle));
  if (shown.length) {
    const before = hiddenTaskbars;
    hiddenTaskbars = [...before, ...shown.map((w) => ({ handle: w.handle, className: w.className }))];
    // Sans témoin, une partie interrompue laisserait les barres masquées : on ne les masque pas.
    if (!writeTaskbarMarker()) {
      hiddenTaskbars = before;
      return;
    }
  }
  if (!hiddenTaskbars.length) return;
  for (const w of shown) hideWindow(w);
  // Windows réaffiche parfois lui-même une barre masquée quand VPX prend le premier plan
  // (une fois sur onze parties, sur l'écran du DMD) : elle est aussitôt masquée de nouveau.
  // Une barre apparue pendant la partie (écran branché) devient l'une des nôtres.
  taskbarWatch ??= setInterval(() => {
    for (const w of taskbarWindows()) {
      if (!w.visible) continue;
      hideWindow(w);
      if (!notOurs.has(w.handle) && !hiddenTaskbars.some((h) => h.handle === w.handle)) {
        hiddenTaskbars.push({ handle: w.handle, className: w.className });
        writeTaskbarMarker();
      }
      console.log(`Barre des tâches (${w.className}) réaffichée par Windows pendant la partie : masquée de nouveau.`);
    }
  }, TASKBAR_WATCH_MS);
}

/**
 * Fin d'une partie (ou démarrage après une partie interrompue, d'après le témoin) : les
 * barres des tâches que Cyber Pinball a masquées reviennent, et seulement elles.
 */
export function restoreTaskbars(hidden: HiddenTaskbar[] = hiddenTaskbars): void {
  if (OFFSCREEN) return;
  if (taskbarWatch) clearInterval(taskbarWatch);
  taskbarWatch = undefined;
  // Réaffichée telle quelle, une barre revient devant tout : l'Explorateur l'a remise au premier
  // plan permanent pendant la partie, et seul le playfield reprend ensuite le premier plan (le
  // DMD et le fronton jamais). Elle est donc d'abord rangée sous la fenêtre du menu de son
  // écran, puis réaffichée (taskbarguard.ts). Pas au bureau ni à la fermeture : elle s'y voit.
  const behind = !desktopMode && !desktopAllowed;
  const stack = behind ? listWindows((w) => w.visible) : [];
  const rects = behind ? guardedScreens().map((s) => s.rect) : [];
  for (const t of taskbarsToRestore(hidden, taskbarWindows())) {
    const w = taskbarWindows().find((x) => x.handle === t.handle);
    if (!w) continue;
    const own = displayOf(w.rect, rects);
    const under = own && coveringWindow(own, stack, guardPids);
    if (under) placeWindowBelow(w, under);
    showWindowInactive(w);
  }
  hiddenTaskbars = [];
  notOurs = new Set();
  fs.rmSync(taskbarMarker(), { force: true });
}

const TASKBAR_WATCH_MS = 50;
let taskbarWatch: NodeJS.Timeout | undefined;

/** Processus dont les fenêtres couvrent les écrans : Cyber Pinball. */
const guardPids = [process.pid];

/**
 * Gardien des barres (packages/core/src/taskbarguard.ts) : une barre des tâches trouvée devant une
 * fenêtre du menu est rangée sous elle, sans rien activer ; jamais quand un autre programme a le
 * premier plan (VPX en partie). Celle que Windows remet devant sans cesse est masquée comme
 * pendant une partie, avec le même témoin, jusqu'au mode bureau ou à la fermeture.
 */
const taskbarGuard = new TaskbarGuard<WindowInfo>(
  {
    stack: () => listWindows((w) => w.visible),
    foreground: () => foregroundWindow(),
    placeBelow: (taskbar, under) => void placeWindowBelow(taskbar, under),
    hide: (taskbar) => hideTaskbar(taskbar),
    now: () => Date.now(),
  },
  guardPids,
);

function hideTaskbar(w: WindowInfo): boolean {
  if (!hiddenTaskbars.some((h) => h.handle === w.handle)) {
    hiddenTaskbars.push({ handle: w.handle, className: w.className });
    // Sans témoin, un arrêt brutal la laisserait masquée : elle reste visible.
    if (!writeTaskbarMarker()) {
      hiddenTaskbars.pop();
      return false;
    }
  }
  hideWindow(w);
  return true;
}

/** Écrans de la borne pour le gardien des barres : leur rôle et leur rectangle en pixels physiques. */
function guardedScreens(): GuardScreen[] {
  return desktopDisplays().map((d) => ({ name: displayName(d), rect: screen.dipToScreenRect(null, d.bounds) }));
}

/**
 * Remet derrière le menu toute barre des tâches passée devant l'un de ses écrans ; rend le
 * nombre de barres remises. Sans effet hors écran, au bureau, à la fermeture et pendant une relève.
 */
export function settleTaskbars(moment: TaskbarMoment): number {
  if (OFFSCREEN || desktopMode || desktopAllowed || relaunching) return 0;
  let repairs;
  try {
    repairs = taskbarGuard.check(guardedScreens(), moment);
  } catch (error) {
    // API de Windows indisponible : le constat du gardien des écrans reste.
    console.warn(`Gardien des barres : ${(error as Error).message}`); // i18n-ignore : console
    return 0;
  }
  for (const r of repairs) console.log(repairNotice(r));
  if (repairs.length) journalScreens(moment);
  return repairs.length;
}

/**
 * Bascule (début et fin de partie, VPX au premier plan, retour du bureau, démarrage) : la pile
 * des fenêtres est notée dans le journal des écrans, puis le gardien des barres passe.
 */
export function settleScreens(moment: TaskbarMoment): void {
  if (OFFSCREEN) return;
  journalScreens(moment);
  settleTaskbars(moment);
}

/** Ce que le gardien des barres a fait depuis le démarrage (« Santé de la borne »). */
export function taskbarFacts(): TaskbarFacts {
  return taskbarGuard.facts();
}

/**
 * Journal des écrans, <données>\logs\ecrans.txt : à chaque bascule, le premier plan de Windows,
 * ce qui est au-dessus de chaque écran de la borne, et le rectangle de chaque barre des tâches.
 */
function journalScreens(moment: TaskbarMoment): void {
  try {
    const entry = stackingReport(moment, guardedScreens(), listWindows((w) => w.visible), foregroundWindow(), taskbarWindows(), guardPids);
    appendErrorLog(path.join(locations().dataDir, 'logs', SCREENS_LOG_FILE), entry);
  } catch {
    // Dossier des données en lecture seule, ou API de Windows indisponible : rien n'est noté.
  }
}

/** Nom d'un écran dans les constats : son rôle dans la borne (`bounds` en coordonnées Electron). */
export function nameScreen(bounds: Rectangle, name: string): void {
  names.set(screen.getDisplayMatching(bounds).id, name);
}

/**
 * Mode bureau (desktop-mode.ts) : le bureau doit se voir sur chaque écran. Les barres des
 * tâches qu'une partie aurait laissées masquées reviennent ; les voiles déjà cachés par
 * le mode bureau le restent, ceux d'un écran branché entre-temps naissent cachés. Au
 * retour (false), chaque écran, même branché pendant le mode bureau, retrouve son voile.
 */
export function setDesktopMode(on: boolean): void {
  if (on === desktopMode) return;
  desktopMode = on;
  desktopAllowed = on ? 'mode bureau' : undefined; // i18n-ignore : raison gardée par le gardien des écrans, jamais affichée
  uncoveredSince.clear();
  desktopReported.clear();
  if (OFFSCREEN) return;
  if (on) {
    journalScreens('desktop');
    taskbarGuard.forget();
    if (hiddenTaskbars.length) restoreTaskbars();
    return;
  }
  placeVeils(true);
  for (const veil of veils.values()) if (!veil.isDestroyed() && !isShown(veil)) veil.showInactive();
}

/** Constats depuis le dernier appel (écrans restés découverts), pour le bilan d'endurance. */
export function takeCoverIncidents(): string[] {
  const taken = incidents;
  incidents = [];
  return taken;
}

function checkScreens(): void {
  if (desktopMode) return checkDesktop();
  if (desktopAllowed || relaunching) return;
  // Une barre des tâches que Windows a fait passer devant un écran hors de toute bascule (rien
  // ne le signale à l'application) est remise derrière ici, à la relecture qui la voit.
  settleTaskbars('watch');
  const stack = listWindows((w) => w.visible);
  const now = Date.now();
  for (const d of desktopDisplays()) {
    const notice = coverNotice(screenCover(screen.dipToScreenRect(null, d.bounds), stack, [process.pid]));
    const name = displayName(d);
    if (!notice) {
      uncoveredSince.delete(d.id);
      if (reported.delete(d.id)) console.log(`Écran « ${name} » : de nouveau couvert.`);
      continue;
    }
    const since = uncoveredSince.get(d.id) ?? now;
    uncoveredSince.set(d.id, since);
    if (now - since < REPORT_AFTER_MS || reported.get(d.id) === notice) continue;
    reported.set(d.id, notice);
    const line = `Écran « ${name} » : ${notice}.`; // i18n-ignore : constat pour la console et le bilan d’endurance
    incidents.push(line);
    console.warn(line);
  }
}

/**
 * Mode bureau : un écran qu'une fenêtre de Cyber Pinball recouvre encore, même en partie,
 * au-delà du temps d'une réduction, est signalé une fois (le mode bureau la range de nouveau).
 */
function checkDesktop(): void {
  const stack = listWindows((w) => w.visible);
  const now = Date.now();
  for (const d of desktopDisplays()) {
    const blockers = desktopBlockers(screen.dipToScreenRect(null, d.bounds), stack, [process.pid]);
    if (!blockers.length) {
      uncoveredSince.delete(d.id);
      if (desktopReported.delete(d.id)) console.log(`Mode bureau : écran ${screenName(d)} de nouveau libre.`);
      continue;
    }
    const since = uncoveredSince.get(d.id) ?? now;
    uncoveredSince.set(d.id, since);
    const titles = formatTitles(blockers.map((w) => w.title));
    if (now - since < REPORT_AFTER_MS || desktopReported.get(d.id) === titles) continue;
    desktopReported.set(d.id, titles);
    const line = `Mode bureau : écran ${screenName(d)} encore couvert par ${titles}.`; // i18n-ignore : constat pour la console et le bilan d’endurance
    incidents.push(line);
    console.warn(line);
  }
}

function screenName(d: Display): string {
  return `« ${displayName(d)} »`;
}

/** Rôle de l'écran dans la borne, ou sa taille et sa place s'il n'en a pas. */
function displayName(d: Display): string {
  return names.get(d.id) ?? `${d.bounds.width} × ${d.bounds.height} en ${d.bounds.x}, ${d.bounds.y}`;
}

function formatTitles(titles: string[]): string {
  return [...new Set(titles)].map((title) => `« ${title || 'fenêtre sans titre'} »`).join(', '); // i18n-ignore : constat pour la console
}

/**
 * Relance l'application avec ces arguments (comme app.relaunch), sans laisser voir le
 * bureau entre les deux : le nouveau processus ouvre ses voiles puis ses fenêtres
 * par-dessus celles de l'ancien, qui ne se ferme qu'ensuite.
 */
export function relaunchCovered(args: string[]): void {
  if (relaunching) return;
  // Borne dédiée : le processus que surveille Shell Launcher ne passe pas le relais à un autre
  // (hors surveillance) ; il se ferme et Shell Launcher le relance avec ces arguments.
  if (relaunchThroughShellLauncher(args)) return;
  relaunching = true;
  // Le nouveau processus reprend l'orientation des écrans telle quelle.
  handOverOrientation();
  // Le nouveau processus doit pouvoir prendre le premier plan.
  allowAnyForeground();
  // Ses fenêtres sont transparentes jusqu'à leur première image (createWindow) : visibles pour
  // Windows ne suffit pas, il signale lui-même qu'elles sont peintes (paintedOnScreen).
  const relay = path.join(os.tmpdir(), `cyberpinball-releve-${process.pid}-${Date.now()}`);
  const child = spawn(process.execPath, args, { detached: true, stdio: 'inherit', env: { ...process.env, [RELAY_ENV]: relay }, windowsHide: true });
  child.unref();
  const started = Date.now();
  const timer = setInterval(() => {
    const shown = fs.existsSync(relay);
    if (!shown && child.exitCode === null && Date.now() - started < RELAUNCH_TIMEOUT_MS) return;
    clearInterval(timer);
    fs.rmSync(relay, { force: true });
    if (!shown) console.warn('Relance : le nouveau processus n’a peint aucune fenêtre, le bureau peut se voir.');
    else console.log(`Relance : fenêtres du nouveau processus peintes après ${Date.now() - started} ms, l’ancien se ferme.`);
    // Le temps que Windows affiche les images que leurs pages ont envoyées.
    setTimeout(() => app.exit(0), shown ? RELAY_SETTLE_MS : 0);
  }, 100);
}
