// Règles de lecture du Juke-box en borne (questions des maquettes tranchées le 09/11/2026), en logique
// pure : l'écran (étape 3) donne les gestes et l'état des morceaux, ce module dit quoi faire.
// - Flippers : morceau précédent ou suivant dans la liste montrée (sans boucler : la liste ne saute pas).
// - Start : joue le morceau choisi ; sur le morceau en cours, pause ou reprise. Indisponible sur un
//   morceau qui ne se lit pas (en téléchargement : la raison et le pourcentage), jamais « jouer dès
//   qu'il sera prêt ».
// - MagnaSave : playlist précédente ou suivante (en boucle). Rien ne démarre seul : la lecture en
//   cours continue jusqu'au prochain Start.
// - Exit : retour à la roue, la musique s'arrête.
// - Fin d'un morceau : le suivant disponible de la playlist qui joue (pas forcément celle montrée),
//   en bouclant à la fin ; aucun disponible : arrêt. Pas de lecture aléatoire dans cette version.
// - Le volume est celui de la borne (boutons Volume, cabinetvolume.ts) : le Juke-box n'a pas de
//   réglage à lui, ses éléments audio et vidéo jouent à plein (JUKEBOX_ELEMENT_VOLUME).

import { formatNumber, t } from './i18n';

/** Volume des éléments audio et vidéo du Juke-box : plein, le son de la borne fait le reste. */
export const JUKEBOX_ELEMENT_VOLUME = 1;
/** Pas de lecture aléatoire dans cette version (question 2 des maquettes). */
export const JUKEBOX_SHUFFLE = false;

/** Ce que le lecteur sait d'un morceau : sa clé et s'il se lit (trackStatus). */
export interface PlayerTrack {
  key: string;
  playable: boolean;
  /** Pourquoi il ne se lit pas. */
  reason?: string;
  /** En téléchargement. */
  percent?: number;
}

export interface PlayerList {
  id: string;
  tracks: readonly PlayerTrack[];
}

export interface PlayerState {
  /** Playlist montrée. */
  shown: string;
  /** Morceau choisi (focus) dans chaque playlist déjà montrée. */
  selected: Record<string, string>;
  /** Morceau en cours, et sa playlist. */
  playing?: { playlist: string; key: string };
  paused: boolean;
}

export type PlayerInput = 'previous' | 'next' | 'start' | 'playlist-previous' | 'playlist-next' | 'exit' | 'ended';

export type PlayerEffect =
  | { kind: 'play'; playlist: string; key: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  /** Plus rien à jouer (fin de morceau sans suivant disponible). */
  | { kind: 'stop' }
  /** Exit : retour à la roue, la musique s'arrête. */
  | { kind: 'exit' }
  /** Start refusé, avec sa raison. */
  | { kind: 'refused'; reason: string; percent?: number };

export interface PlayerStep {
  state: PlayerState;
  effect?: PlayerEffect;
}

/** État de départ : la playlist du dernier morceau joué (son morceau choisi), sinon la première ; rien ne joue. */
export function initialPlayer(lists: readonly PlayerList[], last?: { playlist: string; key: string }): PlayerState {
  const list = lists.find((l) => l.id === last?.playlist) ?? lists[0];
  const selected: Record<string, string> = {};
  if (list) {
    const key = list.tracks.some((tr) => tr.key === last?.key) ? last!.key : list.tracks[0]?.key;
    if (key) selected[list.id] = key;
  }
  return { shown: list?.id ?? '', selected, paused: false };
}

const listOf = (lists: readonly PlayerList[], id: string) => lists.find((l) => l.id === id);

/** Morceau choisi dans la playlist montrée : celui retenu, sinon celui qui joue, sinon le premier. */
export function selectedKey(state: PlayerState, lists: readonly PlayerList[]): string | undefined {
  const list = listOf(lists, state.shown);
  if (!list?.tracks.length) return undefined;
  const k = state.selected[list.id];
  if (k && list.tracks.some((tr) => tr.key === k)) return k;
  if (state.playing?.playlist === list.id && list.tracks.some((tr) => tr.key === state.playing!.key)) return state.playing.key;
  return list.tracks[0]!.key;
}

/** Suivant disponible après `key` (en bouclant) ; lui-même s'il est le seul. undefined : aucun ne se lit. */
export function nextPlayable(list: PlayerList, key: string): string | undefined {
  const n = list.tracks.length;
  const i = list.tracks.findIndex((tr) => tr.key === key);
  for (let step = 1; step <= n; step++) {
    const tr = list.tracks[(((i < 0 ? -1 : i) + step) % n + n) % n]!;
    if (tr.playable) return tr.key;
  }
  return undefined;
}

export function playerStep(state: PlayerState, input: PlayerInput, lists: readonly PlayerList[]): PlayerStep {
  const list = listOf(lists, state.shown);
  switch (input) {
    case 'previous':
    case 'next': {
      if (!list?.tracks.length) return { state };
      const k = selectedKey(state, lists)!;
      const i = list.tracks.findIndex((tr) => tr.key === k);
      const j = Math.min(list.tracks.length - 1, Math.max(0, i + (input === 'next' ? 1 : -1)));
      return { state: { ...state, selected: { ...state.selected, [list.id]: list.tracks[j]!.key } } };
    }
    case 'playlist-previous':
    case 'playlist-next': {
      if (lists.length < 2) return { state };
      const i = Math.max(0, lists.findIndex((l) => l.id === state.shown));
      const next = lists[(i + (input === 'playlist-next' ? 1 : -1) + lists.length) % lists.length]!;
      // Rien ne démarre : on montre l'autre playlist, la lecture en cours continue.
      return { state: { ...state, shown: next.id } };
    }
    case 'start': {
      const k = selectedKey(state, lists);
      if (!list || !k) return { state, effect: { kind: 'refused', reason: t('Playlist vide') } };
      if (state.playing?.playlist === list.id && state.playing.key === k) {
        return state.paused ? { state: { ...state, paused: false }, effect: { kind: 'resume' } } : { state: { ...state, paused: true }, effect: { kind: 'pause' } };
      }
      const tr = list.tracks.find((x) => x.key === k)!;
      if (!tr.playable) return { state, effect: { kind: 'refused', reason: tr.reason ?? t('Indisponible'), ...(tr.percent !== undefined ? { percent: tr.percent } : {}) } };
      return { state: { ...state, playing: { playlist: list.id, key: k }, paused: false, selected: { ...state.selected, [list.id]: k } }, effect: { kind: 'play', playlist: list.id, key: k } };
    }
    case 'ended': {
      if (!state.playing) return { state };
      const playing = listOf(lists, state.playing.playlist);
      const next = playing ? nextPlayable(playing, state.playing.key) : undefined;
      if (!playing || !next) return { state: { ...state, playing: undefined, paused: false }, effect: { kind: 'stop' } };
      // La sélection suit le morceau joué seulement si elle était dessus.
      const followed = state.selected[playing.id] === state.playing.key || (state.shown === playing.id && selectedKey(state, lists) === state.playing.key);
      return {
        state: { ...state, playing: { playlist: playing.id, key: next }, paused: false, selected: followed ? { ...state.selected, [playing.id]: next } : state.selected },
        effect: { kind: 'play', playlist: playing.id, key: next },
      };
    }
    case 'exit':
      return { state: { ...state, playing: undefined, paused: false }, effect: { kind: 'exit' } };
  }
}

export interface StartHint {
  enabled: boolean;
  /** Action de Start dans l'aide : « Jouer », « Pause », « Reprendre », « Indisponible · 42 % ». */
  label: string;
  reason?: string;
}

/** Ce que Start fera sur le morceau choisi, pour l'aide des commandes (toujours visible, grisé avec sa raison). */
export function startHint(state: PlayerState, lists: readonly PlayerList[]): StartHint {
  const list = listOf(lists, state.shown);
  const k = selectedKey(state, lists);
  if (!list || !k) return { enabled: false, label: t('Indisponible'), reason: t('Playlist vide') };
  if (state.playing?.playlist === list.id && state.playing.key === k) return { enabled: true, label: state.paused ? t('Reprendre') : t('Pause') };
  const tr = list.tracks.find((x) => x.key === k)!;
  if (tr.playable) return { enabled: true, label: t('Jouer') };
  const label = tr.percent !== undefined ? t('Indisponible · {pct} %', { pct: formatNumber(tr.percent) }) : t('Indisponible');
  return { enabled: false, label, ...(tr.reason ? { reason: tr.reason } : {}) };
}

/** Position de la playlist montrée : « 2 / 4 ». */
export function playlistPosition(state: PlayerState, lists: readonly PlayerList[]): { index: number; count: number } {
  return { index: Math.max(0, lists.findIndex((l) => l.id === state.shown)) + 1, count: lists.length };
}
