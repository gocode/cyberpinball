// Cyber Pinball se ferme tout entier avec sa fenêtre (packages/core/src/lifetime.ts) : fermer le
// menu ou l'assistant depuis Windows (bouton de la barre des tâches, Alt+F4) ne laisse aucune de
// ses autres fenêtres ni aucun processus derrière lui.

import { app, BrowserWindow } from 'electron';
import { QUIT_WATCHDOG_MS, quitAfterWindowClosed } from '@cyberpinball/core';

/** Fenêtres sans bouton dans la barre des tâches (createWindow le note, hors écran compris). Une
 * fenêtre inconnue (créée hors de createWindow, banc d'essai) compte comme en ayant un : elle garde l'application. */
const withoutTaskbar = new WeakSet<BrowserWindow>();
/** Fenêtres principales : fermées depuis Windows, elles ferment l'application. */
const mainWindows = new WeakMap<BrowserWindow, string>();
let quitting = false;
let installed = false;
/** Relève en cours (screen-guard.ts, donné par main.ts : pas d'import circulaire avec createWindow). */
let isRelaunching: () => boolean = () => false;

export function configureLifetime(opts: { relaunching: () => boolean }): void {
  isRelaunching = opts.relaunching;
}

/** createWindow : la fenêtre aura-t-elle un bouton dans la barre des tâches (skipTaskbar demandé, pas celui du hors écran) ? */
export function noteTaskbarButton(win: BrowserWindow, skipTaskbar: boolean | undefined): void {
  if (skipTaskbar) withoutTaskbar.add(win);
  watchClose(win);
}

/** Fenêtre principale (menu, assistant) : fermée autrement que par Cyber Pinball, toute l'application se ferme. */
export function quitWithWindow(win: BrowserWindow, label: string): void {
  mainWindows.set(win, label);
}

/** Vrai une fois la fermeture de l'application commencée (before-quit hors relève). */
export function isQuitting(): boolean {
  return quitting;
}

function watchClose(win: BrowserWindow): void {
  installQuitWatch();
  const title = win.getTitle();
  win.on('closed', () => {
    const left = BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed() && !withoutTaskbar.has(w)).length;
    const main = mainWindows.get(win);
    const reason = quitAfterWindowClosed({ quitting, relaunching: isRelaunching(), main: main !== undefined, hadTaskbarButton: !withoutTaskbar.has(win), taskbarWindowsLeft: left });
    if (!reason) return;
    console.log(
      reason === 'main'
        ? `Fermeture : fenêtre « ${main} » fermée depuis Windows, Cyber Pinball se ferme entièrement.`
        : `Fermeture : « ${title} » était la dernière fenêtre avec un bouton dans la barre des tâches, Cyber Pinball se ferme entièrement.`,
    );
    app.quit();
  });
}

/**
 * Une fermeture demandée qui n'aboutit pas (une fenêtre la refuse, une sortie bloque) laissait le
 * processus vivre sans fenêtre : notée au journal avec ce qui reste ouvert, puis forcée.
 */
function installQuitWatch(): void {
  if (installed) return;
  installed = true;
  app.on('before-quit', () => {
    // Relève : l'ancien processus garde ses fenêtres jusqu'à ce que le nouveau peigne les siennes.
    if (isRelaunching() || quitting) return;
    quitting = true;
    const asked = Date.now();
    setTimeout(() => {
      const open = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
      const titles = open.map((w) => `« ${w.getTitle()} »`).join(', ');
      console.warn(`Fermeture : Cyber Pinball tourne encore ${Math.round((Date.now() - asked) / 1000)} s après la demande (${open.length} fenêtre(s) ouverte(s)${titles ? ` : ${titles}` : ''}) ; sortie forcée.`);
      app.exit(0);
    }, QUIT_WATCHDOG_MS).unref();
  });
}
