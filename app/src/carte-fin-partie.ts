// La carte de fin de partie, par-dessus VPX (packages/core/src/cartefinpartie.ts : ce qu'elle
// montre, sa place, la lecture des boutons). Elle paraît à la fin d'une partie solo suivie par le
// relevé en direct (solo-score-watch.ts), et seulement alors : une table sans relevé n'en a pas.
//
// Comme les notifications de la partie (game-notice.ts) : une fenêtre transparente, sans focus, que
// les clics traversent, montrée par showInactive() ; VPX garde le clavier et la partie. Les flips se
// lisent sans focus : clavier par Windows (keysDown), joystick par SDL, comme le menu en partie.
// Elle attend que les flippers et Start se taisent (saisie des initiales), puis reste jusqu'à un
// flip : gauche, défier un joueur ; droit, continuer. Une nouvelle partie ou VPX quitté l'emporte.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buttonKeys,
  endCardBounds,
  endCardRows,
  EndCardKeys,
  windowsVk,
  type CabinetButtons,
  type EndCardButtons,
  type EndCardView,
  type Rect,
  type Rotation,
} from '@cyberpinball/core';
import { keysDown } from '@cyberpinball/win-displays';
import { checkLayout } from './layout-check';
import { alive, dispose, overlay, raise, type Overlay } from './game-notice';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';

export interface EndCardOptions {
  /** Zone du plateau à l'écran, en pixels physiques, et le sens de sa mise en page (menuRotation). */
  place(): { zone: Rect; rotation: Rotation } | undefined;
  /** Essais sans opérateur : capture de la carte (CYBERPINBALL_CAPTURE). */
  captureDir?: string;
  log?(line: string): void;
}

export interface EndCard {
  /**
   * Partie solo finie, lue en direct : la carte paraît quand les flippers et Start se sont tus.
   * `view` est relu à ce moment-là (les classements ont pu bouger). `challenge` : flip gauche, défier
   * un joueur (le front-end quitte VPX, puis ouvre le choix).
   */
  gameOver(view: () => EndCardView, buttons: CabinetButtons | undefined, challenge: () => void): void;
  /** Une nouvelle partie commence, ou VPX est quitté : plus de carte. */
  close(): void;
  /** La carte est à l'écran (essais, journal). */
  shown(): boolean;
}

/** Relecture des boutons. */
const POLL_MS = 40;
/** Remise devant (une fenêtre de VPX ou d'un PuP-Pack qui repasse devant) : toutes les 480 ms. */
const RAISE_EVERY = 12;

export function createEndCard(opts: EndCardOptions): EndCard {
  let win: Overlay | undefined;
  let keys: EndCardKeys | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopJoystick: (() => void) | undefined;
  let visible = false;

  function stopPolling(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
    stopJoystick?.();
    stopJoystick = undefined;
  }

  function close(): void {
    stopPolling();
    keys?.close();
    keys = undefined;
    visible = false;
    dispose(win);
    win = undefined;
  }

  /** Les trois boutons, maintenant : clavier par Windows, joystick par SDL. */
  function reader(buttons: CabinetButtons | undefined): () => EndCardButtons {
    const k = buttonKeys(buttons);
    const codes = { left: k.leftFlipper ?? '', right: k.rightFlipper ?? '', start: k.start ?? '' };
    const vks = Object.values(codes)
      .filter((c) => c && !c.startsWith('SDLJoy_'))
      .map(windowsVk)
      .filter((v): v is number => v !== undefined);
    return () => {
      let down: number[] = [];
      try {
        down = vks.length ? keysDown(vks) : [];
      } catch {
        down = []; // API de Windows indisponible
      }
      const joystick = new Set(joystickButtonsHeld());
      const held = (code: string) => !!code && (code.startsWith('SDLJoy_') ? joystick.has(code) : down.includes(windowsVk(code) ?? -1));
      return { left: held(codes.left), right: held(codes.right), start: held(codes.start) };
    };
  }

  function show(view: EndCardView): void {
    const place = opts.place();
    if (!place) {
      opts.log?.('Carte de fin de partie : plateau introuvable, pas de carte.'); // i18n-ignore : journal
      return;
    }
    const bounds = endCardBounds(place.zone, place.rotation, endCardRows(view));
    const state = { view, rotation: place.rotation };
    win = overlay(
      bounds,
      'carte-fin-partie',
      (o) => {
        if (!alive(o)) return;
        o.win.webContents.send('notice:state', state);
        raise(o);
        visible = true;
        opts.log?.(`Carte de fin de partie : ${view.title}, ${view.score}${view.off ? ` (${view.off})` : ''}.`); // i18n-ignore : journal
        if (opts.captureDir) setTimeout(() => void snapshot(o, view.record ? 'record' : view.off ? 'sans-classement' : 'partie-finie'), 300);
      },
      'carte-fin-partie.html',
    );
  }

  async function snapshot(o: Overlay, name: string): Promise<void> {
    if (!alive(o)) return;
    fs.mkdirSync(opts.captureDir!, { recursive: true });
    fs.writeFileSync(path.join(opts.captureDir!, `carte-fin-partie-${name}.png`), (await o.win.webContents.capturePage()).toPNG()); // i18n-ignore : nom de fichier des essais
    const problems = await checkLayout(o.win.webContents);
    opts.log?.(`Carte de fin de partie (${name}) : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`); // i18n-ignore : journal
  }

  return {
    gameOver(view, buttons, challenge) {
      close();
      const k = new EndCardKeys(Date.now());
      keys = k;
      const read = reader(buttons);
      let ticks = 0;
      const poll = () => {
        if (keys !== k) return;
        const event = k.feed(Date.now(), read());
        if (event === 'show') show(view());
        else if (event === 'left') {
          close();
          opts.log?.('Carte de fin de partie : flip gauche, défier un joueur.'); // i18n-ignore : journal
          challenge();
        } else if (event === 'right') {
          opts.log?.('Carte de fin de partie : flip droit, retour au jeu.'); // i18n-ignore : journal
          close();
        } else if (visible && alive(win) && ++ticks % RAISE_EVERY === 0) raise(win);
      };
      stopJoystick = watchJoystickButtons(() => poll());
      timer = setInterval(poll, POLL_MS);
    },
    close,
    shown: () => visible && alive(win),
  };
}
