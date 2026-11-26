// Root Access (26/11/2026) : le jeu de flipper caché (app/renderer/root-access), dans une fenêtre posée
// sur la zone du plateau, par-dessus la roue. Rien ne l'annonce : la roue l'ouvre par une combinaison
// de flips (FlipperCombo, packages/core/src/root-access.ts).
//
// Les commandes sont celles de la borne, telles qu'elles sont réglées : le processus principal lit les
// touches par Windows (GetAsyncKeyState, comme le relais des applications), les boutons de joystick par
// SDL, et le lanceur analogique sur son axe ; la page ne reçoit que l'état du jeu (MiniGameInput). Exit
// ferme le jeu et rend la roue.

import * as path from 'node:path';
import { app, BrowserWindow, type Rectangle } from 'electron';
import { frontMove, type AxisReading, type CabinetButtons, type FrontMove, type PlungerSensor } from '@cyberpinball/core';
import { keepOverlayOnScreen } from './cover-display';
import { keyboardFollows } from './foreground';
import { createWindow, OFFSCREEN } from './offscreen';
import { relayCabinet } from './root-access-relay';

export interface RootAccessDeps {
  /** Zone du plateau (coordonnées Electron) et sens de la mise en page de la roue ; undefined : pas d'écran. */
  place(): { bounds: Rectangle; rotation: number } | undefined;
  /** Boutons relevés de la borne (buttonKeys en fait la liste, défauts compris). */
  buttons(): CabinetButtons | undefined;
  /** Lanceur analogique réglé ; undefined : lanceur à bouton. */
  plungerSensor(): PlungerSensor | undefined;
  axes(): AxisReading[];
  /** Codes de touche virtuelle enfoncés parmi ceux demandés (GetAsyncKeyState). */
  keysDown(vks: readonly number[]): number[];
  /** Boutons du joystick appuyés ou relâchés ; rend de quoi arrêter. */
  watchJoystick(listener: (code: string, down: boolean) => void): () => void;
  /** La fenêtre du jeu prend les boutons du joystick : la roue ne les reçoit plus. */
  claimJoystick(win: BrowserWindow): void;
  /** Un geste du joueur (le mode attente ne part pas pendant la partie). */
  activity(): void;
  /** Le jeu fermé : la roue reprend la main. */
  closed(): void;
  log(line: string): void;
  pollMs?: number;
}

export interface RootAccess {
  open(): boolean;
  close(): void;
  isOpen(): boolean;
  /** La fenêtre du jeu (essais). */
  window(): BrowserWindow | undefined;
}

/** Lecture des boutons : plus souvent que l'image (60 Hz), un lâcher du lanceur dure 20 à 30 ms. */
const POLL_MS = 8;

export function createRootAccess(deps: RootAccessDeps): RootAccess {
  let win: BrowserWindow | undefined;

  function open(): boolean {
    if (win && !win.isDestroyed()) {
      if (!OFFSCREEN) win.focus();
      return true;
    }
    const place = deps.place();
    if (!place) return false;
    const w = createWindow({
      title: 'Root Access', // i18n-ignore : nom du jeu
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: '#030807',
      ...place.bounds,
      webPreferences: {
        preload: path.join(__dirname, 'root-access-preload.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        // Le son du jeu part sans geste dans la page : les boutons passent par le processus principal.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    win = w;
    w.setAlwaysOnTop(true, 'screen-saver');
    keepInFront(w);
    w.on('page-title-updated', (e) => e.preventDefault());
    deps.claimJoystick(w);
    const stop = relay(w);
    w.webContents.once('did-finish-load', () => {
      if (w.isDestroyed()) return;
      if (OFFSCREEN) w.showInactive();
      else {
        w.show();
        w.focus();
        keyboardFollows(w, 'Root Access s’ouvrait'); // i18n-ignore : console
      }
      const gap = keepOverlayOnScreen(w, place.bounds);
      if (gap) deps.log(`Root Access : fenêtre du plateau : ${gap}.`); // i18n-ignore : journal
    });
    w.webContents.on('render-process-gone', () => close());
    w.on('closed', () => {
      stop();
      if (win === w) win = undefined;
      deps.log('Root Access : fermé.'); // i18n-ignore : journal
      deps.closed();
    });
    void w.loadFile(path.join(__dirname, '..', 'renderer', 'root-access', 'index.html'), { query: { rot: String(place.rotation) } });
    deps.log(`Root Access : ouvert sur le plateau (${place.bounds.width}×${place.bounds.height}, rotation ${place.rotation}°).`); // i18n-ignore : journal
    return true;
  }

  /**
   * Tant que le jeu est ouvert, aucune autre fenêtre de Cyber Pinball ne passe devant (un fronton qui
   * reprend le focus, comme pour « Récupérer », acquire-window.ts) : le jeu le reprend et repasse
   * devant. Une fenêtre de Windows qui prend le premier plan l'a, puis le jeu le reprend (frontMove).
   */
  function keepInFront(w: BrowserWindow): void {
    const raise = () => {
      if (w.isDestroyed() || OFFSCREEN) return;
      w.setAlwaysOnTop(true, 'screen-saver');
      w.moveTop();
      if (!w.isFocused()) w.focus();
    };
    const otherFocused = (_e: Electron.Event, other: BrowserWindow) => {
      if (other !== w) setImmediate(raise);
    };
    app.on('browser-window-focus', otherFocused);
    let yielded = false;
    const apply = (move: FrontMove) => {
      if (w.isDestroyed() || OFFSCREEN || move === 'keep') return;
      if (move === 'raise') return raise();
      yielded = move === 'yield';
      w.setAlwaysOnTop(!yielded, 'screen-saver');
    };
    w.on('blur', () => setImmediate(() => apply(frontMove('blur', Boolean(BrowserWindow.getFocusedWindow()), yielded))));
    w.on('focus', () => apply(frontMove('focus', true, yielded)));
    w.on('always-on-top-changed', (_e, onTop) => onTop || setImmediate(() => apply(frontMove('top-lost', false, yielded))));
    w.once('closed', () => app.off('browser-window-focus', otherFocused));
  }

  /** Relaie les commandes de la borne à la page (root-access-relay.ts) ; Exit ferme. Rend de quoi arrêter. */
  function relay(w: BrowserWindow): () => void {
    const r = relayCabinet({
      buttons: deps.buttons(),
      plungerSensor: deps.plungerSensor(),
      axes: deps.axes,
      keysDown: deps.keysDown,
      watchJoystick: deps.watchJoystick,
      send: (input) => {
        if (!w.isDestroyed()) w.webContents.send('root-access:input', input);
      },
      activity: deps.activity,
      exit: close,
      pollMs: deps.pollMs ?? POLL_MS,
    });
    w.webContents.on('did-finish-load', () => r.resend());
    return () => r.stop();
  }

  function close(): void {
    if (win && !win.isDestroyed()) win.close();
  }

  return {
    open,
    close,
    isOpen: () => Boolean(win && !win.isDestroyed()),
    window: () => (win && !win.isDestroyed() ? win : undefined),
  };
}
