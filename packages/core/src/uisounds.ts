// Sons de l'interface : quelques bruits de flipper qui ponctuent le menu, joués par la
// fenêtre du playfield sur la sortie audio du menu (app/renderer/ui-sounds.js). Ce module
// tient le registre (un identifiant, ce qui le déclenche, sa source et sa licence) et la
// règle qui décide s'il joue ; le rendu tient la recette de chaque son, synthétisée par
// WebAudio : aucun extrait de vrai flipper, aucun fichier.
//
// Ajouter un son (le « coup de bobine » du lancement en cinéma, par exemple) : son
// identifiant dans UI_SOUND_IDS, sa fiche dans UI_SOUNDS, sa recette dans le registre
// RECIPES d'app/renderer/ui-sounds.js, puis l'appel playUiSound(id) dans app/src/frontend.ts.
// uisounds.test.ts vérifie que chaque son du registre a sa recette, sa fiche et sa ligne
// dans le manuel.

import { t } from './i18n';
import type { MenuMediaSettings } from './mediaview';
import type { MenuMoment } from './menumoments';
import { playVolume } from './menumoments';

export const UI_SOUND_IDS = ['solenoid', 'coin', 'knocker'] as const;
export type UiSoundId = (typeof UI_SOUND_IDS)[number];

export interface UiSoundSpec {
  /** Nom du son, dans le manuel et les essais. */
  readonly label: string;
  /** Ce qui le déclenche. */
  readonly when: string;
  /** D'où vient le son : ici, la recette WebAudio écrite pour Cyber Pinball. */
  readonly source: string;
  /** Licence du son ; une recette du dépôt suit la licence du code de Cyber Pinball. */
  readonly license: string;
}

const SYNTH_SOURCE = 'synthèse WebAudio, app/renderer/ui-sounds.js'; // i18n-ignore : provenance, citée telle quelle
const OWN_LICENSE = 'celle du code de Cyber Pinball (écrit pour le projet, aucun enregistrement)'; // i18n-ignore : provenance, citée telle quelle

export const UI_SOUNDS: Readonly<Record<UiSoundId, UiSoundSpec>> = {
  solenoid: {
    get label() {
      return t('Clic de solénoïde');
    },
    get when() {
      return t('Changement de table dans le menu');
    },
    source: SYNTH_SOURCE,
    license: OWN_LICENSE,
  },
  coin: {
    get label() {
      return t('Pièce qui tombe');
    },
    get when() {
      return t('Start : lancement d’une partie');
    },
    source: SYNTH_SOURCE,
    license: OWN_LICENSE,
  },
  knocker: {
    get label() {
      return t('Knocker');
    },
    get when() {
      return t('Record battu, au retour de la partie');
    },
    source: SYNTH_SOURCE,
    license: OWN_LICENSE,
  },
};

/** Son à jouer : identifiant et volume de lecture (0 à 1). */
export interface UiSoundCue {
  id: UiSoundId;
  volume: number;
}

/**
 * Le son `id` joue-t-il maintenant, et à quel volume ? Jamais pendant une partie (VPX a la
 * parole : rien ne doit s'ajouter à sa musique), jamais en mode attente, jamais quand les
 * sons de l'interface sont coupés ou à 0 %. Le chargement est permis : la pièce tombe au
 * Start, avant que VPX ne prenne les écrans.
 */
export function uiSoundCue(id: UiSoundId, settings: Pick<MenuMediaSettings, 'uiSounds' | 'uiSoundsVolume'>, moment: MenuMoment): UiSoundCue | undefined {
  if (!settings.uiSounds || moment === 'game' || moment === 'attract') return undefined;
  const volume = playVolume(settings.uiSoundsVolume);
  return volume > 0 ? { id, volume } : undefined;
}
