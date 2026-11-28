// Sortie audio des jeux qui n'ont aucun choix de sortie : Pinball FX, Pinball FX3, Pinball FX Midnight et
// Future Pinball jouent sur la sortie par défaut de Windows, alors que VPX reçoit son périphérique dans
// son INI. 28/11/2026, borne : « le son ne sort pas par les bonnes enceintes » (Pinball FX). Cyber
// Pinball pose donc la sortie de l'étape « Son » comme sortie par défaut le temps de la partie, et la
// remet ensuite (app/src/game-audio-route.ts). Ici, seulement la décision, sans toucher à Windows.
// Lignes de journal : en français seulement, comme celles du reste du journal.

import type { AudioRole, CabinetAudio, ObservedAudioOutput } from './model';

export interface GameAudioRoute {
  /** La sortie à poser comme sortie par défaut ; absente : rien à changer. */
  target?: { id: string; name: string; role: AudioRole };
  /** Pourquoi rien n'est changé (ou ce qui est fait), pour le journal. */
  line: string;
}

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Sortie de l'étape « Son » dont le son compte pour la partie : celle du playfield, à défaut celle du fronton. */
export function wantedGameOutput(audio: CabinetAudio | undefined): { id: string; role: AudioRole } | undefined {
  const playfield = audio?.roles.playfield;
  if (playfield) return { id: playfield, role: 'playfield' };
  const backglass = audio?.roles.backglass;
  return backglass ? { id: backglass, role: 'backglass' } : undefined;
}

/**
 * La sortie par défaut de Windows à poser pour une partie (`defaultId` : celle d'avant, vide si Core Audio
 * ne répond pas ; `outputs` : les sorties actives ; `audio` : l'étape « Son »). Une sortie voulue absente
 * des sorties actives (écran éteint, carte débranchée) n'est jamais posée : Windows garde la sienne.
 */
export function gameAudioRoute(input: { defaultId: string | undefined; outputs: readonly ObservedAudioOutput[]; audio: CabinetAudio | undefined }): GameAudioRoute {
  const wanted = wantedGameOutput(input.audio);
  if (!wanted) return { line: 'aucune sortie à l’étape « Son » : la sortie par défaut de Windows reste celle du jeu.' }; // i18n-ignore : journal
  const seen = input.outputs.find((o) => same(o.endpointId, wanted.id));
  const name = seen?.friendlyName ?? input.audio?.outputs.find((o) => same(o.endpointId, wanted.id))?.lastSeen?.friendlyName ?? wanted.id;
  if (!seen) return { line: `la sortie « ${name} » de l’étape « Son » (${wanted.role}) est introuvable (écran éteint, carte débranchée ?) : la sortie par défaut de Windows reste celle du jeu.` }; // i18n-ignore : journal
  if (same(input.defaultId, wanted.id)) return { line: `le jeu joue déjà sur « ${name} », la sortie de l’étape « Son » (${wanted.role}).` }; // i18n-ignore : journal
  return { target: { id: seen.endpointId, name, role: wanted.role }, line: `le jeu n’a pas de choix de sortie : « ${name} » (étape « Son », ${wanted.role}) est posée comme sortie par défaut de Windows pour la partie.` }; // i18n-ignore : journal
}
