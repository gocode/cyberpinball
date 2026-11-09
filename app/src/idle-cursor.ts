// Pointeur de la souris masqué quand on ne s'en sert plus (règles : packages/core/src/idlecursor.ts).
// Chaque page reçoit à son chargement la feuille qui masque le pointeur quand sa racine porte
// l'attribut ; le processus principal relève la position du pointeur et, à chaque bascule, pose
// l'attribut sur toutes les pages (immobile) ou le retire (au premier mouvement). Une page
// chargée pendant qu'il est masqué le reçoit aussitôt.

import { app, screen, webContents, type WebContents } from 'electron';
import { CURSOR_POLL_MS, HIDDEN_CURSOR_CSS, HIDDEN_CURSOR_WORLD, hiddenCursorScript, idleCursorStart, idleCursorStep, type IdleCursor } from '@cyberpinball/core';
import { OFFSCREEN } from './offscreen';

let state: IdleCursor | undefined;

/**
 * Démarre le masquage du pointeur inactif. Hors écran, rien : le pointeur du poste n'est pas
 * celui des pages rendues en mémoire.
 */
export function startIdleCursor(): void {
  if (OFFSCREEN || state) return;
  state = idleCursorStart(Date.now());
  const watch = (contents: WebContents) => contents.on('dom-ready', () => void dress(contents));
  app.on('web-contents-created', (_e, contents) => watch(contents));
  // Pages déjà ouvertes (voiles des écrans) : une feuille en double ne change rien.
  for (const contents of webContents.getAllWebContents()) {
    watch(contents);
    void dress(contents);
  }
  setInterval(() => {
    const before = state!;
    state = idleCursorStep(before, screen.getCursorScreenPoint(), Date.now());
    if (state.hidden === before.hidden) return;
    for (const contents of webContents.getAllWebContents()) mark(contents, state.hidden);
  }, CURSOR_POLL_MS);
}

/** La feuille sur la page qui vient de se charger, et l'attribut si le pointeur est masqué. */
async function dress(contents: WebContents): Promise<void> {
  if (skipped(contents)) return;
  try {
    await contents.insertCSS(HIDDEN_CURSOR_CSS, { cssOrigin: 'user' });
  } catch {
    return;
  }
  if (state?.hidden) mark(contents, true);
}

/** Pose ou retire l'attribut de la racine de la page. */
function mark(contents: WebContents, hidden: boolean): void {
  if (skipped(contents)) return;
  void contents.executeJavaScriptInIsolatedWorld(HIDDEN_CURSOR_WORLD, [{ code: hiddenCursorScript(hidden) }]).catch(() => undefined);
}

/** Pages détruites, et outils de développement : jamais touchés. */
function skipped(contents: WebContents): boolean {
  return contents.isDestroyed() || contents.getURL().startsWith('devtools:');
}
