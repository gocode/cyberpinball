// Rendu hors écran des essais sans opérateur (règles : packages/core/src/offscreen.ts).
// Toutes les fenêtres de l'application naissent ici. Hors écran, elles sont rendues en
// mémoire (rendu hors écran d'Electron) à la taille de leur écran, réel ou simulé, au
// facteur d'échelle 1 : jamais montrées, jamais au premier plan, absentes de la barre des
// tâches. Le rendu, les captures (capturePage), les touches rejouées et les clics
// (sendInputEvent) restent ceux d'une vraie fenêtre. Un guet relève toute fenêtre de
// l'application qui deviendrait visible ou prendrait le focus.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle, type Display } from 'electron';
import { offscreenMode, realScreensRefusal, type Rect } from '@cyberpinball/core';
import { currentDesktop, HIDDEN_DESKTOP, startOnHiddenDesktop, visibleWindowsOf } from '@cyberpinball/win-displays';
import { observedDisplays } from './displays';

export const OFFSCREEN = offscreenMode(process.env);

// Avant le démarrage d'Electron : une page de 1920 px fait 1920 pixels, quel que soit le
// facteur d'échelle de l'écran principal du poste.
if (OFFSCREEN) app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Une exception non rattrapée du processus principal ouvre d'ordinaire la boîte modale
// d'Electron (« A JavaScript error occurred in the main process ») : sur le bureau caché,
// personne ne la ferme et tout se fige, minuteries comprises. Hors écran, l'essai s'arrête
// en échec avec l'erreur dans la console.
if (OFFSCREEN) {
  process.on('uncaughtException', (error) => {
    console.error(`Hors écran : exception non rattrapée, essai arrêté.\n${error?.stack ?? String(error)}`); // i18n-ignore : console d'un essai hors écran
    app.exit(1);
  });
}

/**
 * Hors écran, l'application ne tourne que sur le bureau Windows caché (packages/win-displays/
 * src/desktop.ts), quel que soit le lanceur (scripts, npx electron à la main, autre session) :
 * sinon elle s'y relance avec les mêmes arguments, recopie sa sortie ici et en reprend le code
 * de sortie. Renvoie vrai dans le processus qui a passé la main : il ne doit rien démarrer.
 */
export function relaunchOnHiddenDesktop(): boolean {
  if (!OFFSCREEN || process.platform !== 'win32' || currentDesktop() === HIDDEN_DESKTOP) return false;
  const log = path.join(os.tmpdir(), `cyberpinball-bureau-cache-${process.pid}.txt`);
  const run = startOnHiddenDesktop(process.argv.map(quoteArgument).join(' '), process.cwd(), log);
  console.log(`Hors écran : relancé sur le bureau Windows caché « ${HIDDEN_DESKTOP} » (processus ${run.pid}).`);
  let read = 0;
  const copy = () => {
    try {
      const size = fs.statSync(log).size;
      if (size <= read) return;
      const fd = fs.openSync(log, 'r');
      const chunk = Buffer.alloc(size - read);
      fs.readSync(fd, chunk, 0, chunk.length, read);
      fs.closeSync(fd);
      read = size;
      process.stdout.write(chunk);
    } catch {
      // Journal pas encore créé : au tour suivant.
    }
  };
  const stop = () => {
    spawnSync('taskkill.exe', ['/T', '/F', '/PID', String(run.pid)], { windowsHide: true });
    app.exit(130);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timer = setInterval(() => {
    copy();
    if (!run.wait(0)) return;
    clearInterval(timer);
    copy();
    const code = run.finish();
    fs.rmSync(log, { force: true });
    app.exit(code);
  }, 300);
  return true;
}

/** Argument de ligne de commande Windows (règles de CommandLineToArgvW). */
function quoteArgument(arg: string): string {
  if (arg && !/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

/** Fenêtres que l'application tient pour affichées (hors écran, aucune ne l'est vraiment). */
const shown = new WeakSet<BrowserWindow>();

/** Crée une fenêtre de l'application : à l'écran, ou rendue hors écran pendant un essai. */
export function createWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  // Jamais d'écran clair : tant qu'une fenêtre n'a pas encore affiché sa page, Windows 11 lui
  // donne le fond système de son thème (#F3F3F3 en thème clair), malgré backgroundColor et
  // ready-to-show. Au démarrage, les quatre écrans de la borne restaient ainsi gris d'une à trois
  // secondes. Sans fond système, l'écran garde ce qu'il y a dessous (le voile noir) jusqu'à la
  // première image (mesures sur les vrais écrans, 24 octobre 2026). L'autre éclair, bleu pâle,
  // vient du plein écran : voir coverDisplay. Détection : docs\demo-ecrans-couverts.ps1.
  // Une fenêtre montrée reste donc transparente jusqu'à sa première image : paintedOnScreen.
  if (!OFFSCREEN) {
    const win = new BrowserWindow({ ...options, backgroundMaterial: 'none' });
    trackPainting(win);
    return win;
  }
  const win = new BrowserWindow({
    ...options,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { ...options.webPreferences, offscreen: true },
  });
  // Les sons de l'assistant sont joués (leur compte rendu fait foi), mais ne s'entendent pas.
  win.webContents.setAudioMuted(true);
  keepOffscreen(win);
  startWatch();
  return win;
}

/** Fenêtres à l'écran pas encore montrées avec leur page affichée. */
const unpainted = new Set<BrowserWindow>();
let somePainted = false;
let paintedListeners: (() => void)[] = [];
/** Au-delà, une fenêtre montrée compte comme peinte même si sa page n'a rien affiché (page bloquée). */
const PAINT_WAIT_MS = 3000;
/** Le temps que Windows affiche l'image envoyée par la page (quelques rafraîchissements d'écran). */
const PAINT_SETTLE_MS = 150;

function trackPainting(win: BrowserWindow): void {
  unpainted.add(win);
  const done = () => {
    unpainted.delete(win);
    if (unpainted.size > 0 || !somePainted) return;
    const listeners = paintedListeners;
    paintedListeners = [];
    for (const listener of listeners) listener();
  };
  win.once('closed', done);
  win.once('show', () => {
    // Deux images demandées à la page : la seconde n'est préparée qu'une fois la première partie.
    const frames = win.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', true).catch(() => false);
    void Promise.race([frames, new Promise((r) => setTimeout(r, PAINT_WAIT_MS))])
      .then(() => new Promise((r) => setTimeout(r, PAINT_SETTLE_MS)))
      .then(() => {
        if (!win.isDestroyed()) somePainted = true;
        done();
      });
  });
}

/**
 * Appelle `listener` (une fois) dès que toutes les fenêtres créées jusque-là ont été montrées
 * avec leur page à l'écran, au moins une l'ayant été. Avant sa première image, une fenêtre est
 * transparente (createWindow) : une relance (screen-guard.ts) ne laisse partir l'ancien
 * processus qu'à ce moment, sans quoi le bureau se verrait au travers des nouvelles fenêtres.
 */
export function paintedOnScreen(listener: () => void): void {
  if (OFFSCREEN || (somePainted && unpainted.size === 0)) return listener();
  paintedListeners.push(listener);
}

/**
 * Ce qui montrerait la fenêtre ou la mettrait au premier plan devient sans effet :
 * show() la marque seulement comme affichée, pour les captures des autres écrans.
 */
function keepOffscreen(win: BrowserWindow): void {
  const hide = win.hide.bind(win);
  const none = () => undefined;
  Object.assign(win, {
    show: () => void shown.add(win),
    showInactive: () => void shown.add(win),
    hide: () => {
      shown.delete(win);
      hide();
    },
    focus: none,
    moveTop: none,
    setAlwaysOnTop: none,
    setFullScreen: none,
    setKiosk: none,
    maximize: none,
    // Réduire ou rouvrir une fenêtre cachée la montrerait (Windows).
    minimize: none,
    restore: none,
    flashFrame: none,
  });
}

/** Vrai si la fenêtre est affichée : vraiment, ou, hors écran, pour l'application. */
export function isShown(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  return OFFSCREEN ? shown.has(win) : win.isVisible();
}

/** Rectangle de fenêtre (coordonnées Electron) d'un écran donné en pixels physiques. */
export function windowRect(physical: Rect): Rectangle {
  // Hors écran, l'écran peut être simulé, ailleurs que sur le bureau : facteur d'échelle 1.
  return OFFSCREEN ? { ...physical } : screen.screenToDipRect(null, physical);
}

/**
 * Écrans réels du bureau vus par Electron ; aucun hors écran (les écrans y sont simulés et
 * ne sont pas sur le bureau : rien à couvrir ni à surveiller).
 */
export function desktopDisplays(): Display[] {
  return OFFSCREEN ? [] : screen.getAllDisplays();
}

/** Rectangle de l'écran principal, en coordonnées Electron. */
export function primaryRect(): Rectangle {
  if (!OFFSCREEN) return screen.getPrimaryDisplay().bounds;
  const primary = observedDisplays().find((d) => d.primary);
  return primary ? { ...primary.bounds } : { x: 0, y: 0, width: 1920, height: 1080 };
}

/**
 * Hors écran, refuse ce qui a besoin des écrans du poste (une partie de VPX, une boîte de
 * dialogue native) : renvoie le message, aussi écrit dans la console. À l'écran : undefined.
 */
export function refuseOffscreen(what: string): string | undefined {
  if (!OFFSCREEN) return undefined;
  const message = realScreensRefusal(what);
  console.error(message);
  return message;
}

// ---------------------------------------------------------------------------
// Guet : aucune fenêtre visible ni au premier plan pendant un essai hors écran.

/**
 * Indicateur de saisie que Windows ajoute au processus sur un bureau neuf (bureau caché des
 * démonstrations) : fenêtre système vide, pas une fenêtre de l'application.
 */
const SYSTEM_OVERLAYS = new Set(['UAC_InputIndicatorOverlayWnd', 'UAC Input Indicator']);

let watching: NodeJS.Timeout | undefined;
let finished = false;
let checks = 0;
const created = new Set<number>();
const incidents = new Map<string, string>();

function startWatch(): void {
  if (watching) return;
  keepEarlierIncidents();
  watching = setInterval(check, 200);
  report(false);
  app.on('will-quit', () => {
    check();
    clearInterval(watching);
    report(true);
    finished = true;
  });
  // app.exit (relance de l'assistant ou du menu) ne passe pas par will-quit.
  process.on('exit', () => finished || report(false));
}

/** Un essai relancé (assistant → menu) écrit dans le même bilan : les incidents d'avant y restent. */
function keepEarlierIncidents(): void {
  const file = reportFile();
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^ {2}(\S+) (.+)$/.exec(line);
    if (m) incidents.set(m[2]!, m[1]!);
  }
}

function check(): void {
  checks++;
  const note = (what: string) => {
    if (incidents.has(what)) return;
    incidents.set(what, new Date().toISOString());
    console.error(`Hors écran : ${what}`);
    // Tout de suite : un essai interrompu garde la trace de ce qui est apparu.
    report(false);
  };
  for (const win of BrowserWindow.getAllWindows()) {
    created.add(win.id);
    if (win.isVisible()) note(`fenêtre visible « ${win.getTitle()} »`); // i18n-ignore : guet hors écran, console et rapport
    if (win.isFocused()) note(`fenêtre au premier plan « ${win.getTitle()} »`); // i18n-ignore : guet hors écran, console et rapport
  }
  // Fenêtres natives du processus (boîtes de dialogue comprises), vues par Windows.
  try {
    for (const w of visibleWindowsOf(process.pid)) {
      if (SYSTEM_OVERLAYS.has(w.className)) continue;
      note(`fenêtre native visible « ${w.title} » (${w.className})`); // i18n-ignore : guet hors écran, console et rapport
    }
  } catch {
    // Hors de Windows, ou API indisponible : le relevé d'Electron suffit.
  }
}

function reportFile(): string | undefined {
  const dir = process.env.CYBERPINBALL_CAPTURE;
  return dir ? path.join(dir, 'hors-ecran.txt') : undefined;
}

/**
 * Bilan du guet dans hors-ecran.txt (dossier des captures), tenu à jour pendant l'essai ;
 * le bilan final va aussi dans la console.
 */
function report(final: boolean): void {
  const lines = incidents.size
    ? [`Fenêtres apparues sur les écrans du poste (${incidents.size}) :`, ...[...incidents].map(([what, at]) => `  ${at} ${what}`)] // i18n-ignore : guet hors écran, console et rapport
    : [`Aucune fenêtre visible ni au premier plan (${created.size} fenêtre${created.size > 1 ? 's' : ''}, ${checks} contrôles${final ? '' : ', guet en cours'}).`]; // i18n-ignore : guet hors écran, console et rapport
  if (final) console.log(`Hors écran : ${lines.join('\n')}`);
  const file = reportFile();
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
