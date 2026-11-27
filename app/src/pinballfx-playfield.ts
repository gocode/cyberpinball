// Pinball FX : fenêtre du jeu posée sur l'écran du playfield après son lancement.
//
// Essai du 27/11/2026 (PC à quatre écrans) : le jeu ignore WindowPosX/Y et la résolution de
// GameUserSettings.ini et de LocalSettings.cfg en plein écran fenêtré (FullscreenMode=1) : il s'ouvre en
// (0, 0), 1920 × 1080, sur l'écran principal, puis réécrit ces fichiers à sa sortie en gardant les
// valeurs écrites. Écrire ces réglages ne sert donc à rien. Repli, comme pour le DMD virtuel de VPX et de
// dmdext (futurepinball-play.ts, placeVirtualDmd) : l'API Windows déplace et redimensionne la fenêtre du
// jeu sur l'écran du playfield, appelée régulièrement pendant la partie.

import type { Rect } from '@cyberpinball/core';
import type { WindowInfo } from '@cyberpinball/win-displays';
import { ZEN_LAUNCH_GAMES } from './pinballfx-launcher';

/** Écart toléré (pixels) entre la fenêtre et l'écran : en deçà, elle est déjà posée. */
const TOLERANCE = 2;

/** Place de la fenêtre du jeu sur `screen` ; undefined si elle y est déjà. */
export function pinballFxPlayfieldPlacement(window: Rect, screen: Rect): Rect | undefined {
  const same = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;
  if (same(window.x, screen.x) && same(window.y, screen.y) && same(window.width, screen.width) && same(window.height, screen.height)) return undefined;
  return { x: screen.x, y: screen.y, width: screen.width, height: screen.height };
}

/**
 * Fenêtre de Pinball FX (la plus grande de ses fenêtres visibles : pas le DMD virtuel de dmdext) posée sur
 * l'écran du playfield tel qu'il est maintenant. Rend la place donnée, ou undefined (pas d'écran
 * playfield, pas de fenêtre, déjà posée, déplacement refusé).
 */
export function placePinballFxPlayfield(
  screen: Rect | undefined,
  windows: () => WindowInfo[],
  setBounds: (w: WindowInfo, r: Rect) => boolean,
  /** Fenêtre du jeu : Pinball FX par défaut, Midnight (même moteur, 27/11/2026) en le passant. */
  isGame: (w: WindowInfo) => boolean = ZEN_LAUNCH_GAMES.pinballfx.isWindow,
): Rect | undefined {
  if (!screen) return undefined;
  const game = windows()
    .filter((w) => w.visible && !w.minimized && w.rect.width > 0 && w.rect.height > 0 && isGame(w))
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
  if (!game) return undefined;
  const to = pinballFxPlayfieldPlacement(game.rect, screen);
  if (!to) return undefined;
  return setBounds(game, to) ? to : undefined;
}
