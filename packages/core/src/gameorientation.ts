// Sens des tables en partie sur le playfield branché, pour « Santé de la borne ». VPX ne tourne
// ses tables que d'après la forme de la fenêtre (vpxFlipperEdge) ; le menu, lui, suit
// l'orientation actuelle de l'écran (currentFlipperEdge). Quand Windows n'a pas l'orientation
// de jeu (sessionorientation.ts : refus de Windows, borne d'avant le 27/10/2026 non reconnue,
// assistant qui n'a pas pu retourner), le menu reste droit et la partie se retourne : la ligne
// le dit, avec l'orientation de Windows et celle de jeu.

import { currentFlipperEdge, EDGE_LABELS } from './layout';
import { t } from './i18n';
import { matchScreens } from './match';
import type { Cabinet, FlipperEdge, ObservedDisplay, Rotation } from './model';
import { vpxFlipperEdge } from './vpx';
import { cabinetZones, zoneDisplay } from './zones';

/** Ce que « Santé de la borne » retient du sens de la partie. */
export interface OrientationFacts {
  /** Orientation de Windows de l'écran du playfield. */
  current: Rotation;
  /** Orientation de jeu : celle que Cyber Pinball donne à l'écran pour la session, ou celle de l'assistant. */
  playing?: Rotation;
  /** Bord du joueur dans l'image actuelle. */
  player: FlipperEdge;
  /** Bord où VPX dessinera les flippers dans l'image actuelle. */
  played: FlipperEdge;
}

/** Sens de la partie sur le playfield branché ; undefined sans playfield reconnu ni bord du joueur. */
export function orientationFacts(cabinet: Cabinet, observed: ObservedDisplay[]): OrientationFacts | undefined {
  const fp = cabinet.roles.playfield;
  const display = fp ? matchScreens(cabinet.screens, observed).matched.get(fp) : undefined;
  if (!display || !cabinet.playfield?.flipperEdge) return undefined;
  const player = currentFlipperEdge(cabinet, display)!;
  const played = vpxFlipperEdge(zoneDisplay(display, cabinetZones(cabinet).playfield), player);
  const playing = cabinet.playfield.windowsRotation ?? cabinet.screens.find((s) => s.fingerprint === fp)?.lastSeen?.rotation;
  return { current: display.rotation, ...(playing !== undefined && { playing }), player, played };
}

export interface OrientationVerdict {
  state: 'ok' | 'blocking';
  title: string;
  detail: string;
}

/** Ligne « Sens des tables » : à l'envers (bloquant) quand VPX dessinera les flippers ailleurs que du côté du joueur. */
export function orientationVerdict(facts: OrientationFacts): OrientationVerdict {
  const windows = t('Windows en {rotation}°', { rotation: facts.current });
  if (facts.played === facts.player) {
    return { state: 'ok', title: t('Tables dans votre sens, flippers {player}', { player: EDGE_LABELS[facts.player] }), detail: windows };
  }
  const why =
    facts.playing !== undefined && facts.playing !== facts.current
      ? t('orientation de jeu : {playing}°, que Windows n’a pas reprise', { playing: facts.playing })
      : t('relancez « Orientation et taille du playfield »');
  return {
    state: 'blocking',
    title: t('Tables à l’envers : VPX les dessinera flippers {played}, vous êtes {player}', { played: EDGE_LABELS[facts.played], player: EDGE_LABELS[facts.player] }),
    detail: t('{windows} ; {why}', { windows, why }),
  };
}
