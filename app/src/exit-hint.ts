// Comment revenir à Cyber Pinball : l'indication du chargement (demande du mainteneur, 27/11/2026).
// VPX se ferme dès qu'Exit est appuyé. Pinball FX, Future Pinball et les applications (Edge) ont leur
// propre fenêtre qui prend l'écran : Exit n'y ramène pas, un appui long ferme le jeu ou l'application
// et rend la main. Rien ne le disait : le texte est montré dès le chargement du jeu (écran de
// chargement, app/renderer/frontend.js) et, pour une application, sur la fenêtre ouverte.

import { t, type TableEmulator } from '@cyberpinball/core';

/** Durée d'affichage de l'indication sur une application ouverte (sa fenêtre ne dit rien d'elle-même). */
export const APP_EXIT_HINT_MS = 10_000;

/** « Maintiens Exit 2 s » : 1 s pour une durée d'une seconde, 1,5 s pour une durée fractionnaire. */
function seconds(holdMs: number): string {
  return String(Math.round(holdMs / 100) / 10).replace('.', ',');
}

/** Le texte du chargement d'une table de ce logiciel ; undefined : Exit y ramène déjà tout de suite (VPX). */
export function loadingExitHint(emulator: TableEmulator | undefined, holdMs: number): string | undefined {
  if (!emulator || emulator === 'vpx') return undefined;
  return appExitHint(holdMs);
}

/** Le texte posé sur une application ouverte. */
export function appExitHint(holdMs: number): string {
  return t('Pour revenir à Cyber Pinball : maintiens Exit {seconds} s', { seconds: seconds(holdMs) });
}
