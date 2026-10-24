// Seule source des écrans de l'application (assistant, menu, réglages, sync) : les
// écrans branchés, ou ceux d'un fichier JSON pour les essais sans opérateur.

import { parseSimulatedDisplays, readJsonFile, type ObservedDisplay } from '@cyberpinball/core';
import { probeDisplays } from '@cyberpinball/win-displays';

/**
 * Écrans de la borne. CYBERPINBALL_DISPLAYS (fichier JSON, même forme que probeDisplays,
 * EDID compris ; jeux versionnés dans docs\ecrans) les remplace : un essai rejoue ainsi
 * une borne qui n'est pas celle du poste, quels que soient ses écrans du moment.
 */
export function observedDisplays(): ObservedDisplay[] {
  const fixture = process.env.CYBERPINBALL_DISPLAYS;
  if (fixture) return parseSimulatedDisplays(readJsonFile(fixture), fixture);
  return probeDisplays();
}

/** Vrai quand les écrans viennent d'un fichier : aucun vrai écran ne doit alors être touché. */
export function simulatedDisplays(): boolean {
  return Boolean(process.env.CYBERPINBALL_DISPLAYS);
}
