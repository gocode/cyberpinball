// Volume de la borne : les boutons Volume −, Volume + et Muet (buttons.ts) règlent le son de
// Windows, celui de toute la borne, au menu comme pendant une partie (app/src/cabinet-volume.ts).
//
// VPX 10.8.1 a ses propres actions VolumeDown et VolumeUp (InputManager.cpp) : elles ne bougent
// que son mixage, fronton et plateau, de 1 % par appui, ni PinMAME hors de VPX, ni PuP, ni le menu.
// Un appui ne s'entend pas (01/11/2026 : « les boutons de volume n'ont aucun effet ») : VPX n'a
// plus de touche pour elles (vpxVolumeSettings), Cyber Pinball lit les boutons lui-même.
//
// - Volume + : 5 % de plus ; le son coupé revient d'abord, comme avec les touches de Windows.
// - Volume − : 5 % de moins ; maintenu une seconde, coupe le son (ou le rétablit s'il l'était), le
//   niveau d'avant l'appui restant celui du son rétabli.
// - Muet (bouton facultatif) : coupe ou rétablit le son.
//
// Le son va aux sorties de la configuration (étape « Son » : fronton et plateau, parfois deux cartes,
// SSF) : chacune bouge du même pas que la première, la sortie du fronton, leur écart gardé ; sans
// étape « Son », la sortie par défaut de Windows.

import { t } from './i18n';
import type { ButtonId, CabinetAudio } from './model';

/** Pas d'un appui : 5 % (20 appuis du silence au maximum). */
export const VOLUME_STEP = 0.05;
/** Volume − tenu ce temps coupe ou rétablit le son. */
export const MUTE_HOLD_MS = 1000;
/** La pastille du volume reste ce temps après le dernier appui ; son coupé, plus longtemps. */
export const VOLUME_BADGE_MS = 1600;
export const VOLUME_BADGE_MUTED_MS = 4000;

export type VolumeButton = Extract<ButtonId, 'volumeDown' | 'volumeUp' | 'volumeMute'>;
export const VOLUME_BUTTONS: readonly VolumeButton[] = ['volumeDown', 'volumeUp', 'volumeMute'];

/**
 * Touches multimédia du clavier : Windows règle déjà le son à leur appui (et montre son propre
 * indicateur). Un bouton relevé sur l'une d'elles n'est pas appliqué une seconde fois ; la pastille
 * montre seulement le résultat.
 */
export const WINDOWS_VOLUME_KEYS: readonly string[] = ['AudioVolumeDown', 'AudioVolumeUp', 'AudioVolumeMute'];

/** Une sortie audio et son réglage dans Windows (IAudioEndpointVolume) : niveau de 0 à 1, coupée ou non. */
export interface OutputVolume {
  id: string;
  level: number;
  muted: boolean;
}

/** Ce qu'un appui demande. `hold` : Volume − tenu MUTE_HOLD_MS. */
export type VolumeCommand = 'up' | 'down' | 'mute' | 'hold';

/**
 * Lecture des boutons tenus, sondés à intervalle régulier : un appui donne sa commande une fois,
 * Volume − tenu donne en plus `hold`, une fois. Pas de répétition : un pas par appui.
 */
export class VolumeButtons {
  private held = new Map<VolumeButton, { since: number; holdDone: boolean }>();

  update(down: ReadonlySet<VolumeButton>, now: number): VolumeCommand[] {
    const commands: VolumeCommand[] = [];
    for (const id of VOLUME_BUTTONS) {
      const was = this.held.get(id);
      if (!down.has(id)) {
        this.held.delete(id);
        continue;
      }
      if (!was) {
        this.held.set(id, { since: now, holdDone: false });
        commands.push(id === 'volumeUp' ? 'up' : id === 'volumeDown' ? 'down' : 'mute');
      } else if (id === 'volumeDown' && !was.holdDone && now - was.since >= MUTE_HOLD_MS) {
        was.holdDone = true;
        commands.push('hold');
      }
    }
    return commands;
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Niveaux arrondis au millième : Windows rend des flottants (0.6499999761581421). */
const tidy = (v: number) => Math.round(clamp(v) * 1000) / 1000;

/**
 * Réglage des sorties après `command` (up, down, mute) ; la première sortie mène, sur la grille
 * des 5 % (16 % : 20 %, puis 25 %…), les autres suivent du même écart. `before` : pour `hold`,
 * les sorties telles qu'avant l'appui de Volume −.
 */
export function volumeAfter(outputs: readonly OutputVolume[], command: VolumeCommand, before?: readonly OutputVolume[]): OutputVolume[] {
  const lead = outputs[0];
  if (!lead) return [];
  if (command === 'hold') {
    const was = before?.length ? before : outputs;
    const muted = !was[0]!.muted;
    return was.map((o) => ({ ...o, muted }));
  }
  if (command === 'mute') return outputs.map((o) => ({ ...o, muted: !lead.muted }));
  const steps = lead.level / VOLUME_STEP;
  // Un niveau déjà sur la grille (au flottant près) avance d'un pas entier.
  const near = Math.round(steps);
  const base = Math.abs(steps - near) < 0.02 ? near : command === 'up' ? Math.floor(steps) : Math.ceil(steps);
  const target = clamp((base + (command === 'up' ? 1 : -1)) * VOLUME_STEP);
  const delta = target - lead.level;
  return outputs.map((o) => ({ ...o, level: tidy(o.level + delta), muted: false }));
}

/**
 * Sorties que règlent les boutons : celles des rôles de l'étape « Son » (le fronton d'abord), sans
 * doublon ; vide sans étape « Son » : la sortie par défaut de Windows.
 */
export function volumeOutputIds(audio: CabinetAudio | undefined): string[] {
  if (!audio) return [];
  return [...new Set([audio.roles.backglass, audio.roles.playfield].filter((id): id is string => Boolean(id)))];
}

/** Taille de la pastille vue du joueur, sur un plateau de 1 080 px de petit côté, au milieu du haut du plateau. */
export const VOLUME_BADGE_SIZE = { width: 600, height: 104, margin: 28 } as const;

/** Ce que montre la pastille du volume, textes traduits. */
export interface VolumeView {
  /** 0 à 100. */
  percent: number;
  muted: boolean;
  /** « Volume » ou « Son coupé ». */
  title: string;
  /** « 45 % », ou comment rétablir le son. */
  detail: string;
}

/**
 * `muteButton` : la borne a un bouton Muet. Le son coupé dit comment le rétablir par les noms des
 * boutons, pas leurs touches (« = » ne dit rien au joueur).
 */
export function volumeView(outputs: readonly OutputVolume[], muteButton: boolean): VolumeView | undefined {
  const lead = outputs[0];
  if (!lead) return undefined;
  const percent = Math.round(lead.level * 100);
  if (!lead.muted) return { percent, muted: false, title: t('Volume'), detail: `${percent} %` };
  const back = muteButton
    ? t('{up} ou {mute} pour le rétablir ({percent} %)', { up: 'Volume +', mute: t('Muet'), percent })
    : t('{up} pour le rétablir ({percent} %)', { up: 'Volume +', percent });
  return { percent, muted: true, title: t('Son coupé'), detail: back };
}

/** Ligne du journal : « Volume de la borne : 45 % (2 sorties) ». */
export function volumeLogLine(outputs: readonly OutputVolume[], command: VolumeCommand | 'windows' | 'reminder'): string {
  const lead = outputs[0];
  if (!lead) return 'Volume de la borne : aucune sortie audio active.'; // i18n-ignore : journal
  const what = lead.muted ? 'son coupé' : `${Math.round(lead.level * 100)} %`; // i18n-ignore : journal
  const how = { up: 'Volume +', down: 'Volume −', mute: 'Muet', hold: 'Volume − maintenu', windows: 'touche multimédia (Windows)', reminder: 'rappel' }[command]; // i18n-ignore : journal
  return `Volume de la borne (${how}) : ${what}${outputs.length > 1 ? ` (${outputs.length} sorties, ${outputs.map((o) => `${Math.round(o.level * 100)} %`).join(', ')})` : ''}.`; // i18n-ignore : journal
}
