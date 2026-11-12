// Premier lancement : Visual Pinball X installé par l'assistant lui-même, avant le relevé des boutons.
//
// Les boutons et le lanceur d'un Pinscape (KL25Z), d'un VirtuaPin ou d'un encodeur en mode manette
// sont des boutons et des axes de joystick, que Cyber Pinball lit par la bibliothèque SDL de VPX
// (SDL364.dll, à côté de VPinballX64.exe). Avant la 0.1.11-essai.27, VPX ne s'installait qu'au menu,
// après l'assistant : une borne neuve qui n'avait que ces boutons ne pouvait ni relever ses boutons
// ni son lanceur au premier lancement (« Joysticks lus une fois VPX installé »), ni même avancer
// dans l'assistant sans clavier. Désormais l'assistant installe VPX dès son ouverture, sans rien
// demander (aucune autorisation de Windows n'est nécessaire, et personne ne pourrait répondre aux
// boutons), et le relevé des boutons attend la fin de l'installation avant de garder les touches
// par défaut. Le runtime Visual C++ de Microsoft, que SDL364.dll importe aussi, est installé par
// l'installeur, où l'utilisateur a forcément une souris pour répondre à Windows
// (scripts/installeur/cyberpinball.nsi, section « Runtime Visual C++ ») ; à défaut, par le menu.

import { offscreenMode } from './offscreen';

/** Variables d'un essai sans opérateur : rien n'y est téléchargé (le bac à sable n'a pas de VPX). */
const TRIAL_VARS = ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS', 'CYBERPINBALL_HOME', 'NODE_TEST_CONTEXT'];

/**
 * Étapes de l'assistant qui lisent les joysticks : l'assistant complet (`undefined`), les boutons du
 * jeu et de l'interface, le lanceur analogique et le tilt (accéléromètre, balancier câblé).
 */
export const JOYSTICK_STEPS: readonly (string | undefined)[] = [undefined, 'boutons', 'interface', 'lanceur', 'tilt'];

export interface FirstRunFacts {
  /** Étape refaite seule (`--boutons`…), ou undefined pour l'assistant complet. */
  step: string | undefined;
  /** Racine de l'installation ; sans elle (lancé depuis les sources sans installation), rien à installer. */
  root: string | undefined;
  /** VPX déjà installé dans la racine. */
  vpxInstalled: boolean;
  env: NodeJS.ProcessEnv;
}

/**
 * L'assistant installe-t-il VPX dès son ouverture ? Oui pour toute étape qui lit les joysticks,
 * quand VPX manque à une installation ; jamais pendant un essai sans opérateur, sauf demandé
 * (`CYBERPINBALL_VPX_ASSISTANT=1`, avec une racine d'essai).
 */
export function wizardInstallsVpx(facts: FirstRunFacts): boolean {
  if (!facts.root || facts.vpxInstalled) return false;
  if (!JOYSTICK_STEPS.includes(facts.step)) return false;
  const trial = offscreenMode(facts.env) || TRIAL_VARS.some((name) => Boolean(facts.env[name]));
  return !trial || facts.env.CYBERPINBALL_VPX_ASSISTANT === '1';
}

/** Où en est l'installation de VPX lancée par l'assistant. */
export type WizardVpx =
  | { state: 'none' }
  | { state: 'installing'; percent: number; offline: boolean }
  | { state: 'ready'; version: string }
  | { state: 'failed'; reason: string };

/**
 * Le délai du relevé des boutons (20 s sans appui : touches par défaut gardées) est-il suspendu ?
 * Oui tant que VPX s'installe : une borne qui n'a que des boutons de joystick ne peut pas encore
 * répondre, et passerait aux écrans sans avoir pu relever un seul bouton.
 */
export function buttonsWaitForVpx(vpx: WizardVpx): boolean {
  return vpx.state === 'installing';
}

/**
 * VPX (ou le runtime Visual C++) vient d'être installé au menu, et un joystick est lu pour la première
 * fois : ses boutons sont-ils encore à relever ? Oui si aucun bouton du jeu n'est un bouton de
 * joystick (`SDLJoy_…`) : l'assistant est passé avant que la borne puisse les lire.
 */
export function joystickButtonsUnrecorded(buttons: Readonly<Record<string, string | undefined>> | undefined, joysticks: number): boolean {
  if (joysticks === 0) return false;
  return !Object.values(buttons ?? {}).some((code) => code?.startsWith('SDLJoy_'));
}

/**
 * Fin de l'assistant pendant que VPX s'installe encore : le menu attend la fin (la relance du menu
 * couperait le téléchargement). Une installation finie ou échouée ne retient rien : le menu propose
 * alors lui-même l'installation, comme avant.
 */
export function menuWaitsForVpx(vpx: WizardVpx): boolean {
  return vpx.state === 'installing';
}
