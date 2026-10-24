// Gardien des écrans : du démarrage de l'application à sa fermeture, aucun écran de la
// borne ne montre le bureau Windows. Une seule règle pour tous les moments (démarrage
// avant que les fenêtres soient prêtes, chargement et partie de VPX, passage du menu à
// l'assistant ou aux réglages, installation de VPX, fermeture d'un écran) :
// 1. un voile noir par écran, ouvert avant toute autre fenêtre ; les fenêtres de Cyber
//    Pinball, puis celles de VPX, s'empilent dessus. Il ne prend jamais le focus.
// 2. Une relance de l'application (menu ↔ assistant) passe le relais sans trou : l'ancien
//    processus garde ses fenêtres jusqu'à ce que le nouveau ait montré les siennes.
// 3. Pendant une partie, les barres des tâches de Windows sont masquées : quand VPX prend le
//    premier plan, Windows les remet un instant devant les écrans qu'il n'occupe pas.
// 4. Deux fois par seconde, la pile des fenêtres de Windows est relue (screenCover) : un
//    écran qui reste découvert, ou sous la barre des tâches, est signalé dans la console.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, screen, type Display, type Rectangle } from 'electron';
import { coverNotice, screenCover } from '@cyberpinball/core';
import { allowAnyForeground, hideWindow, listWindows, showWindowInactive, taskbarWindows, visibleWindowsOf } from '@cyberpinball/win-displays';
import { createWindow, desktopDisplays, OFFSCREEN } from './offscreen';
import { coverDisplay, coverProblem } from './cover-display';
import { locations } from './paths';

export const VEIL_TITLE = 'Cyber Pinball — Fond';
const VEIL_PAGE = 'data:text/html;charset=utf-8,<!doctype html><html style="background:%23000;cursor:none"></html>';
const CHECK_MS = 500;
/** Délai après un changement d'écrans avant de vérifier que chaque voile couvre bien le sien. */
const DISPLAY_SETTLE_MS = 1500;
/** Un écran découvert moins longtemps que cela (une fenêtre qui s'ouvre) n'est pas signalé. */
const REPORT_AFTER_MS = 1000;
/** Au-delà, une relance qui n'a rien montré laisse quand même partir l'ancien processus. */
const RELAUNCH_TIMEOUT_MS = 15_000;

/** Voile de chaque écran, par identifiant d'écran d'Electron. */
const veils = new Map<number, BrowserWindow>();
const veilSet = new WeakSet<BrowserWindow>();
/** Nom des écrans dans les constats (rôle dans la borne), par identifiant d'écran. */
const names = new Map<number, string>();
/** Raison pour laquelle le bureau peut se voir (« Bureau Windows », fermeture) ; undefined : il ne doit pas. */
let desktopAllowed: string | undefined;
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
  if (fs.existsSync(taskbarMarker())) restoreTaskbars();
  process.on('exit', () => taskbarsHidden && restoreTaskbars());
  placeVeils();
  // Un écran rebranché (ou réveillé) n'est pas toujours prêt à l'événement : un voile mis en
  // plein écran trop tôt atterrit sur l'écran principal. Il est replacé un peu plus tard.
  const displaysChanged = () => {
    placeVeils();
    setTimeout(() => placeVeils(true), DISPLAY_SETTLE_MS);
  };
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  // Les voiles ne retiennent pas l'application : elle se ferme avec sa dernière vraie fenêtre.
  app.on('browser-window-created', (_event, win) => {
    if (creatingVeil) return;
    win.on('closed', () => {
      if (!relaunching && BrowserWindow.getAllWindows().every((w) => w.isDestroyed() || veilSet.has(w))) app.quit();
    });
  });
  app.on('before-quit', (event) => {
    // Pendant une relève, l'ancien processus garde ses fenêtres jusqu'à ce que le nouveau
    // montre les siennes (relaunchCovered le ferme alors par app.exit).
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
  // celui du voile (relaunchCovered le reconnaît ainsi).
  win.on('page-title-updated', (e) => e.preventDefault());
  void win.loadURL(VEIL_PAGE);
  // Montrée avant sa première image, une fenêtre reste blanche près d'une seconde : le voile
  // n'apparaît que peint en noir (au démarrage, le bureau se voit un peu plus longtemps ; à une
  // relance, les fenêtres de l'ancien processus couvrent les écrans jusque-là).
  win.once('ready-to-show', () => win.isDestroyed() || win.showInactive());
  return win;
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

let taskbarsHidden = false;

/** Témoin des barres des tâches masquées, pour les rétablir au démarrage suivant si l'application s'arrête en pleine partie. */
function taskbarMarker(): string {
  return path.join(locations().dataDir, 'barres-des-taches-masquees');
}

/**
 * Début d'une partie : les barres des tâches de Windows sont masquées. Sans cela, quand VPX
 * prend le premier plan avant que sa fenêtre de jeu soit en plein écran, Windows remet la
 * barre des tâches devant les écrans qu'il n'occupe pas (vu sur l'écran du DMD).
 */
export function hideTaskbars(): void {
  if (OFFSCREEN) return;
  const shown = taskbarWindows().filter((w) => w.visible);
  if (!shown.length) return;
  try {
    fs.mkdirSync(path.dirname(taskbarMarker()), { recursive: true });
    fs.writeFileSync(taskbarMarker(), shown.map((w) => w.className).join('\n'));
  } catch {
    // Sans témoin, une partie interrompue laisserait les barres masquées : on ne les masque pas.
    return;
  }
  taskbarsHidden = true;
  for (const w of shown) hideWindow(w);
  // Windows réaffiche parfois lui-même une barre masquée quand VPX prend le premier plan
  // (une fois sur onze parties, sur l'écran du DMD) : elle est aussitôt masquée de nouveau.
  taskbarWatch ??= setInterval(() => {
    for (const w of taskbarWindows()) {
      if (!w.visible) continue;
      hideWindow(w);
      console.log(`Barre des tâches (${w.className}) réaffichée par Windows pendant la partie : masquée de nouveau.`);
    }
  }, TASKBAR_WATCH_MS);
}

/** Fin d'une partie (ou démarrage après une partie interrompue) : les barres des tâches reviennent. */
export function restoreTaskbars(): void {
  if (OFFSCREEN) return;
  if (taskbarWatch) clearInterval(taskbarWatch);
  taskbarWatch = undefined;
  for (const w of taskbarWindows()) if (!w.visible) showWindowInactive(w);
  taskbarsHidden = false;
  fs.rmSync(taskbarMarker(), { force: true });
}

const TASKBAR_WATCH_MS = 50;
let taskbarWatch: NodeJS.Timeout | undefined;

/** Nom d'un écran dans les constats : son rôle dans la borne (`bounds` en coordonnées Electron). */
export function nameScreen(bounds: Rectangle, name: string): void {
  names.set(screen.getDisplayMatching(bounds).id, name);
}

/**
 * Le bureau peut se voir (menu système > « Bureau Windows ») : plus de constat jusqu'à
 * l'appel avec undefined.
 */
export function allowDesktop(reason: string | undefined): void {
  desktopAllowed = reason;
  if (!reason) uncoveredSince.clear();
}

/** Constats depuis le dernier appel (écrans restés découverts), pour le bilan d'endurance. */
export function takeCoverIncidents(): string[] {
  const taken = incidents;
  incidents = [];
  return taken;
}

function checkScreens(): void {
  if (desktopAllowed || relaunching) return;
  const stack = listWindows((w) => w.visible);
  const now = Date.now();
  for (const d of desktopDisplays()) {
    const notice = coverNotice(screenCover(screen.dipToScreenRect(null, d.bounds), stack, [process.pid]));
    const name = names.get(d.id) ?? `${d.bounds.width} × ${d.bounds.height} en ${d.bounds.x}, ${d.bounds.y}`;
    if (!notice) {
      uncoveredSince.delete(d.id);
      if (reported.delete(d.id)) console.log(`Écran « ${name} » : de nouveau couvert.`);
      continue;
    }
    const since = uncoveredSince.get(d.id) ?? now;
    uncoveredSince.set(d.id, since);
    if (now - since < REPORT_AFTER_MS || reported.get(d.id) === notice) continue;
    reported.set(d.id, notice);
    const line = `Écran « ${name} » : ${notice}.`;
    incidents.push(line);
    console.warn(line);
  }
}

/**
 * Relance l'application avec ces arguments (comme app.relaunch), sans laisser voir le
 * bureau entre les deux : le nouveau processus ouvre ses voiles puis ses fenêtres
 * par-dessus celles de l'ancien, qui ne se ferme qu'ensuite.
 */
export function relaunchCovered(args: string[]): void {
  if (relaunching) return;
  relaunching = true;
  // Le nouveau processus doit pouvoir prendre le premier plan.
  allowAnyForeground();
  const child = spawn(process.execPath, args, { detached: true, stdio: 'inherit', env: process.env, windowsHide: true });
  child.unref();
  const started = Date.now();
  const timer = setInterval(() => {
    const shown = child.pid !== undefined && visibleWindowsOf(child.pid).some((w) => w.title !== VEIL_TITLE);
    if (!shown && child.exitCode === null && Date.now() - started < RELAUNCH_TIMEOUT_MS) return;
    clearInterval(timer);
    if (!shown) console.warn('Relance : le nouveau processus n’a montré aucune fenêtre, le bureau peut se voir.');
    else console.log(`Relance : fenêtres du nouveau processus visibles après ${Date.now() - started} ms, l’ancien se ferme.`);
    // Le temps que ses fenêtres se peignent.
    setTimeout(() => app.exit(0), shown ? 400 : 0);
  }, 100);
}
