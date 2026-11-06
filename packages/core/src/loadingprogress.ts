// Chargement lisible (app/src/frontend.ts) : quand une table tarde à paraître, l'écran de
// chargement du bureau dit, dans son encart, l'étape réellement observée (Cyber Pinball prépare
// la table, VPX est lancé, VPX a ouvert ses fenêtres), le temps écoulé depuis le Start et comment
// arrêter. Rien n'est estimé : pas de pourcentage, pas de barre qui avancerait au temps ; une
// étape n'est dite qu'une fois vue (le processus lancé, une fenêtre de VPX à l'écran). En borne,
// le playfield ne montre que le média de chargement : rien n'y est écrit (06/11/2026).

import { t } from './i18n';

/** Le cartouche paraît passé ce délai depuis le Start : en deçà, un chargement ordinaire, rien à dire. */
export const LOADING_SLOW_MS = 8000;

/**
 * Étapes observées du lancement : `prepare`, Cyber Pinball prépare la partie (écrans, PuP-Pack,
 * habillage) ; `launched`, le processus de VPX tourne, aucune de ses fenêtres n'est encore
 * visible ; `windows`, VPX a ouvert une fenêtre (fronton, DMD), pas encore celle du jeu.
 */
export const LOADING_STEPS = ['prepare', 'launched', 'windows'] as const;
export type LoadingStep = (typeof LOADING_STEPS)[number];

/** Ce que dit le cartouche de l'étape observée. */
export function loadingStepLabel(step: LoadingStep): string {
  switch (step) {
    case 'prepare':
      return t('Cyber Pinball prépare la partie');
    case 'launched':
      return t('VPX est lancé : il charge la table');
    case 'windows':
      return t('VPX a ouvert ses fenêtres : la table finit de charger');
  }
}

/** Étape suivante seulement : une étape vue ne se défait pas (un retour en arrière serait un faux signal). */
export function advanceLoadingStep(current: LoadingStep, seen: LoadingStep): LoadingStep {
  return LOADING_STEPS.indexOf(seen) > LOADING_STEPS.indexOf(current) ? seen : current;
}
