// Chargement d'une page d'application (packages/core/src/page-loading.ts dit pourquoi) : le tube de
// débogage d'Edge (descripteurs 3 et 4, aucun port) relié au suivi de chargement, et le liseré que la
// borne pose sur le bord haut de la fenêtre d'Edge, de la couleur de l'application, tant qu'une page charge.
//
// Sans electron dans watchPageLoading : les essais le chargent avec un faux Edge dont le tube est
// deux flux. Le liseré, lui, est une fenêtre de l'application : hors écran (essais), jamais montrée.

import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { PipeDecoder, createPageLoadTracker, type ScreenRect } from '@cyberpinball/core';

/** Branche le suivi sur le tube d'un Edge lancé avec stdio [..., 'pipe', 'pipe'] et PAGE_LOADING_ARGS. */
export function watchPageLoading(child: ChildProcess, onChange: (loading: boolean) => void): void {
  const commands = child.stdio[3] as Writable | null | undefined;
  const answers = child.stdio[4] as Readable | null | undefined;
  if (!commands || !answers) return;
  const decoder = new PipeDecoder();
  const tracker = createPageLoadTracker({
    send: (line) => {
      if (commands.writable && !commands.destroyed) commands.write(line);
    },
    onChange,
  });
  commands.on('error', () => undefined);
  answers.on('error', () => undefined);
  answers.on('data', (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) tracker.receive(message);
  });
  // Edge parti : plus rien ne charge.
  child.once('exit', () => onChange(false));
  tracker.start();
}

/** Un liseré pour une application ouverte. */
export interface LoadingStrip {
  set(loading: boolean): void;
  close(): void;
}

export type LoadingStripFactory = (color: string, rect: () => ScreenRect | undefined) => LoadingStrip;

/** Épaisseur du liseré, en pixels physiques. */
export const STRIP_HEIGHT = 4;
/** Une page qui charge moins longtemps que cela n'allume rien (pas de clignotement). */
export const STRIP_SHOW_DELAY_MS = 150;
/** Une navigation qui ne finit jamais (téléchargement, réponse vide) : le liseré ne reste pas allumé pour rien. */
export const STRIP_MAX_MS = 60_000;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Couleur du liseré : celle de l'application, jamais autre chose qu'un #rrggbb (elle est écrite dans la page). */
export function stripColor(color: string): string {
  return HEX_COLOR.test(color) ? color : '#ffffff';
}

/**
 * Fabrique de liserés : la fenêtre transparente, sans focus, que les clics traversent, des notifications
 * en partie (overlay de game-notice.ts), au-dessus d'Edge plein écran. Une fenêtre par chargement : elle
 * naît à la couleur de l'application, posée sur le bord haut de la fenêtre d'Edge, et disparaît à la fin.
 */
export function createLoadingStripFactory(): LoadingStripFactory {
  return (color, rect) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notice = require('./game-notice') as typeof import('./game-notice');
    type Shown = ReturnType<typeof notice.overlay>;
    let shown: Shown | undefined;
    let delay: NodeJS.Timeout | undefined;
    let cap: NodeJS.Timeout | undefined;
    const hide = (): void => {
      clearTimeout(delay);
      clearTimeout(cap);
      delay = cap = undefined;
      notice.dispose(shown);
      shown = undefined;
    };
    return {
      set: (loading) => {
        if (!loading) return hide();
        if (shown || delay) return;
        delay = setTimeout(() => {
          delay = undefined;
          const r = rect();
          if (!r) return;
          const css = stripColor(color);
          shown = notice.overlay({ x: r.x, y: r.y, width: r.width, height: STRIP_HEIGHT }, 'strip', (o) => {
            void o.win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--strip', '${css}')`).then(() => notice.raise(o));
          }, 'loading-strip.html');
          cap = setTimeout(hide, STRIP_MAX_MS);
        }, STRIP_SHOW_DELAY_MS);
      },
      close: hide,
    };
  };
}
