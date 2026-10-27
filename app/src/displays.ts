// Seule source des écrans de l'application (assistant, menu, réglages, sync) : les
// écrans branchés, ou ceux d'un fichier JSON pour les essais sans opérateur.

import * as path from 'node:path';
import {
  offscreenMode,
  parseSimulatedDisplays,
  readJsonFile,
  readSimulatedOrientations,
  SIMULATED_ORIENTATION_FILE,
  withSimulatedOrientations,
  type ObservedDisplay,
} from '@cyberpinball/core';
import { probeDisplays } from '@cyberpinball/win-displays';
import { locations } from './paths';

/**
 * Écrans de la borne. CYBERPINBALL_DISPLAYS (fichier JSON, même forme que probeDisplays,
 * EDID compris ; jeux versionnés dans docs\ecrans) les remplace : un essai rejoue ainsi
 * une borne qui n'est pas celle du poste, quels que soient ses écrans du moment. Quand
 * l'orientation est simulée, chaque écran prend celle que la session lui a donnée.
 */
export function observedDisplays(): ObservedDisplay[] {
  const fixture = process.env.CYBERPINBALL_DISPLAYS;
  const displays = fixture ? parseSimulatedDisplays(readJsonFile(fixture), fixture) : probeDisplays();
  return orientationSimulated() ? withSimulatedOrientations(displays, readSimulatedOrientations(simulatedOrientationFile())) : displays;
}

/** Vrai quand les écrans viennent d'un fichier : aucun vrai écran ne doit alors être touché. */
export function simulatedDisplays(): boolean {
  return Boolean(process.env.CYBERPINBALL_DISPLAYS);
}

/**
 * Sans opérateur, hors écran ou sur des écrans simulés, l'orientation est simulée : on ne
 * tourne jamais un vrai écran (display-orientation.ts).
 */
export function orientationSimulated(): boolean {
  return Boolean(process.env.CYBERPINBALL_AUTOPILOT) || offscreenMode(process.env) || simulatedDisplays();
}

/** Orientations des écrans simulés (SIMULATED_ORIENTATION_FILE), dans le dossier des données. */
export function simulatedOrientationFile(): string {
  return path.join(locations().dataDir, SIMULATED_ORIENTATION_FILE);
}
