// Frise des étapes de l'assistant, dans la barre du haut de chaque écran : une pastille numérotée
// par étape, celle en cours en vert avec son nom (et, au relevé, « Bouton 1 sur 4 »). Demande du
// 19/11/2026 : suivre les étapes d'un coup d'œil, sans alourdir des écrans déjà pleins ;
// la barre du haut était vide entre la marque et « Quitter sans enregistrer ».

import { t, type WizardPhase } from '@cyberpinball/core';

interface ProgressStep {
  label: () => string;
  phases: readonly WizardPhase[];
}

/** Étapes de l'assistant complet, dans l'ordre où il les enchaîne. */
const STEPS: readonly ProgressStep[] = [
  { label: () => t('Boutons de l’interface'), phases: ['buttonsChoice', 'navigation', 'navigationSummary'] },
  { label: () => t('Boutons du jeu'), phases: ['buttons', 'buttonsSummary'] },
  { label: () => t('Lanceur'), phases: ['plunger'] },
  { label: () => 'Tilt', phases: ['tilt'] },
  { label: () => t('Écrans'), phases: ['assign', 'orient', 'flip', 'size'] },
  { label: () => t('Disposition'), phases: ['arrange'] },
  { label: () => t('Son'), phases: ['setups', 'sound', 'channels'] },
  { label: () => t('Récapitulatif'), phases: ['summary'] },
];

export interface ProgressItem {
  /** Numéro de l'étape ; absent pour une étape refaite seule. */
  number?: number;
  /** Nom, seulement pour l'étape en cours (les autres ne montrent que leur numéro). */
  label?: string;
  state: 'done' | 'current' | 'todo';
}

/**
 * La frise : `stepLabel` pour une étape refaite seule (une seule pastille, son nom), sinon les
 * étapes de l'assistant complet ; `count` complète le nom de l'étape en cours (« Bouton 1 sur 4 »).
 * Rien une fois l'assistant fini : l'écran du résultat dit déjà que tout est enregistré.
 */
export function progressView(phase: WizardPhase, stepLabel: string | undefined, count?: string): ProgressItem[] | undefined {
  if (phase === 'done') return undefined;
  const name = (label: string) => (count ? `${label} · ${count}` : label);
  if (stepLabel) return [{ label: name(stepLabel), state: 'current' }];
  const at = STEPS.findIndex((s) => s.phases.includes(phase));
  return STEPS.map((s, i) => ({
    number: i + 1,
    ...(i === at && { label: name(s.label()) }),
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}

/** Toutes les phases (sauf la fin) ont leur étape dans la frise. */
export function progressPhases(): WizardPhase[] {
  return STEPS.flatMap((s) => s.phases);
}
