// Règles de lecture du Juke-box en borne (questions des maquettes tranchées le 09/11/2026), en logique
// pure : l'écran (étape 3) donne les gestes et l'état des morceaux, ce module dit quoi faire.
// Deux niveaux (demande du 10/11/2026 : la ligne des playlists voisines et les MagnaSave seuls ne se
// comprenaient pas sur la borne) :
// - Niveau 1, « Playlists », à l'entrée : la ligne « Gestion du Juke-box » en tête, puis une ligne par
//   playlist. Le curseur arrive sur la playlist qui joue, sinon la dernière ouverte. Flippers : choisir ;
//   Start : ouvrir la playlist (ou la gestion) ; Exit : la roue, la musique s'arrête. Les MagnaSave n'y
//   font rien.
// - Niveau 2, « Morceaux » : en tête, quatre lignes fixes qui ne sont pas des morceaux (le compteur et
//   l'enchaînement les ignorent) : « Gestion du Juke-box », « Tout lire », « Lecture aléatoire » et
//   « Répétition : playlist / morceau / aucune », que Start fait tourner. Puis les morceaux. Flippers :
//   ligne précédente ou suivante (sans boucler : la liste ne saute pas) ; Start : joue le morceau choisi,
//   sur le morceau en cours pause ou reprise ; indisponible sur un morceau qui ne se lit pas (en
//   téléchargement : la raison et le pourcentage), jamais « jouer dès qu'il sera prêt ». Exit remonte
//   aux playlists, la musique continue. MagnaSave : playlist précédente ou suivante (en boucle), en
//   raccourci ; rien ne démarre seul.
// - Start maintenu : sur une playlist du niveau 1, sa lecture aléatoire, directement ; partout ailleurs,
//   la gestion.
// - Flipper maintenu, quand un morceau est en cours (lecture ou pause), aux deux niveaux : le droit avance
//   dans le morceau, le gauche recule, par pas qui s'accélèrent (5 s, puis 10 s, puis 30 s). L'appui court
//   garde son rôle (la ligne précédente ou suivante, au relâchement) ; tenir un flipper ne fait alors plus
//   défiler la liste. Sans morceau en cours, rien ne change : l'appui agit aussitôt et se répète.
// - Pause : Start sur le morceau en cours ; au niveau des playlists, Start sur la playlist qui joue l'ouvre
//   sur ce morceau, et Start encore le met en pause.
// - Modes de lecture, retenus par playlist (demande du 10/11/2026, qui remplace « pas de lecture
//   aléatoire » des maquettes) : dans l'ordre ou aléatoire (tiré sans répétition jusqu'à ce que toute la
//   playlist soit passée), et la répétition : la playlist (en boucle), le morceau, ou aucune. L'aléatoire
//   et la boucle se combinent : un nouveau tirage à chaque tour.
// - Fin d'un morceau : le suivant disponible de la playlist qui joue (pas forcément celle montrée),
//   selon son mode ; plus rien à lire : arrêt.
// - Le volume est celui de la borne (boutons Volume, cabinetvolume.ts) : le Juke-box n'a pas de
//   réglage à lui, ses éléments audio et vidéo jouent à plein (JUKEBOX_ELEMENT_VOLUME).

import { MUTE_HOLD_MS } from './cabinetvolume';
import { formatNumber, t } from './i18n';

/** Volume des éléments audio et vidéo du Juke-box : plein, le son de la borne fait le reste. */
export const JUKEBOX_ELEMENT_VOLUME = 1;
/** Clé de la ligne « Gestion du Juke-box » en tête de la liste : jamais celle d'un morceau (« t12 »). */
export const JUKEBOX_MANAGE_KEY = '@gestion';

/**
 * Start maintenu ouvre la gestion du Juke-box, depuis n'importe quel morceau : le même seuil que
 * Volume − maintenu (couper le son), une seconde (demande du 09/11/2026).
 */
export const JUKEBOX_MANAGE_HOLD_MS = MUTE_HOLD_MS;

/**
 * Flipper tenu au-delà de ce seuil, un morceau en cours : il avance (ou recule) dans le morceau. 400 ms :
 * nettement plus long qu'un appui franc (100 à 200 ms), plus court que la répétition d'une touche tenue
 * (500 ms) et que Start maintenu (une seconde) : l'appui court reste un appui court, l'avance part vite.
 */
export const JUKEBOX_SEEK_HOLD_MS = 400;
/** Cadence des pas pendant que le flipper est tenu. */
export const JUKEBOX_SEEK_EVERY_MS = 250;

/** Pas de l'avance selon la durée de l'appui : 5 s, puis 10 s après 1,5 s tenue, puis 30 s après 3,5 s. */
export function seekStepSeconds(heldMs: number): number {
  return heldMs < 1500 ? 5 : heldMs < 3500 ? 10 : 30;
}

/** Nouvelle position après un pas : jamais avant le début, ni à moins d'une seconde de la fin (qui enchaînerait). */
export function seekTarget(position: number, delta: number, duration?: number): number {
  const to = Math.max(0, position + delta);
  return duration && duration > 1 ? Math.min(to, duration - 1) : to;
}

/** Appui de flipper en cours, un morceau en cours : depuis quand, dans quel sens, et s'il avance déjà. */
export type SeekPress = { since: number; dir: -1 | 1; seeking: boolean } | undefined;

/**
 * Un geste de flipper dans le Juke-box. `playing` : un morceau est en cours (lecture ou pause). Sans
 * morceau, l'appui agit aussitôt (`move`) et sa répétition aussi : la liste défile, comme avant. Avec un
 * morceau, l'appui attend : relâché avant JUKEBOX_SEEK_HOLD_MS, la ligne voisine (`move`) ; tenu, des pas
 * (`seek`, en secondes, signés) à chaque échéance (`tick`), jamais de `move`.
 */
export function seekPressStep(press: SeekPress, event: 'down' | 'repeat' | 'tick' | 'up', now: number, dir: -1 | 1, playing: boolean): { press: SeekPress; action?: { move: -1 | 1 } | { seek: number } } {
  if (!playing && !press) return event === 'down' || event === 'repeat' ? { press: undefined, action: { move: dir } } : { press: undefined };
  if (event === 'down') return { press: press ?? { since: now, dir, seeking: false } };
  if (!press) return { press: undefined };
  const held = now - press.since;
  if (event === 'up') return press.seeking ? { press: undefined } : { press: undefined, action: { move: press.dir } };
  if (event === 'tick' && held >= JUKEBOX_SEEK_HOLD_MS) return { press: { ...press, seeking: true }, action: { seek: press.dir * seekStepSeconds(held) } };
  return { press };
}

/** Appui de Start en cours : depuis quand, et si la gestion est déjà partie (le relâchement n'y fait plus rien). */
export type StartPress = { since: number; done: boolean } | undefined;

/**
 * Start dans le lecteur : un appui court joue (ou met en pause) au relâchement, un appui maintenu
 * JUKEBOX_MANAGE_HOLD_MS ouvre la gestion, sans jamais jouer. `tick` : l'échéance du seuil (minuterie
 * ou répétition du clavier) ; `repeat` : répétition automatique d'une touche tenue.
 */
export function startPressStep(press: StartPress, event: 'down' | 'repeat' | 'tick' | 'up', now: number): { press: StartPress; action?: 'start' | 'manage' } {
  if (event === 'down') return { press: press ?? { since: now, done: false } };
  if (!press) return { press: undefined };
  const held = now - press.since >= JUKEBOX_MANAGE_HOLD_MS;
  if (event === 'up') return press.done ? { press: undefined } : { press: undefined, action: held ? 'manage' : 'start' };
  if (!press.done && held) return { press: { ...press, done: true }, action: 'manage' };
  return { press };
}

/** Lignes fixes du niveau des morceaux, en tête, sous la gestion : jamais la clé d'un morceau (« t12 »). */
export const JUKEBOX_PLAY_ALL_KEY = '@tout-lire';
export const JUKEBOX_SHUFFLE_KEY = '@aleatoire';
export const JUKEBOX_REPEAT_KEY = '@repetition';
/** Les quatre lignes fixes du niveau des morceaux, dans l'ordre. */
export const JUKEBOX_TRACK_ACTIONS = [JUKEBOX_MANAGE_KEY, JUKEBOX_PLAY_ALL_KEY, JUKEBOX_SHUFFLE_KEY, JUKEBOX_REPEAT_KEY] as const;
export const isJukeboxAction = (key: string | undefined): boolean => (JUKEBOX_TRACK_ACTIONS as readonly string[]).includes(key ?? '');

/** Répétition : la playlist en boucle, le morceau, ou aucune (arrêt à la fin). */
export type RepeatMode = 'playlist' | 'track' | 'none';
/** Ordre des répétitions quand Start fait tourner la ligne « Répétition ». */
export const REPEAT_MODES: readonly RepeatMode[] = ['playlist', 'track', 'none'];

/** Mode de lecture d'une playlist : l'ordre (ou l'aléatoire) et la répétition. */
export interface PlayMode {
  shuffle: boolean;
  repeat: RepeatMode;
}

/** Par défaut : dans l'ordre, la playlist en boucle (le comportement d'avant les modes). */
export const DEFAULT_PLAY_MODE: Readonly<PlayMode> = { shuffle: false, repeat: 'playlist' };

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

/** Niveau du Juke-box : la liste des playlists, ou les morceaux de la playlist ouverte. */
export type PlayerLevel = 'playlists' | 'tracks';

export interface PlayerState {
  level: PlayerLevel;
  /** Niveau 1 : la ligne choisie, une playlist ou la gestion (JUKEBOX_MANAGE_KEY). */
  at: string;
  /** Playlist ouverte (niveau 2), ou la dernière ouverte. */
  shown: string;
  /** Morceau choisi (focus) dans chaque playlist déjà montrée. */
  selected: Record<string, string>;
  /** Morceau en cours, et sa playlist. */
  playing?: { playlist: string; key: string };
  paused: boolean;
  /** Mode de lecture de chaque playlist (retenu : le lecteur l'écrit dans juke-box.json). */
  modes?: Record<string, PlayMode>;
  /** Lecture aléatoire : les morceaux pas encore tirés de ce tour, dans l'ordre du tirage. */
  queue?: { playlist: string; left: string[] };
}

/** Mode de lecture d'une playlist (celui par défaut tant qu'il n'a pas été changé). */
export function playModeOf(state: Pick<PlayerState, 'modes'>, playlist: string): PlayMode {
  return state.modes?.[playlist] ?? DEFAULT_PLAY_MODE;
}

/** Tirage sans remise (Fisher-Yates) ; `random` : un nombre de [0, 1), Math.random par défaut. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Gestes du lecteur. `hold` : Start maintenu (la lecture aléatoire d'une playlist au niveau 1, sinon la
 * gestion) ; `shuffle-toggle` et `repeat-cycle` : les boutons ⤮ et ⟳ de la carte du morceau (bureau).
 */
export type PlayerInput = 'previous' | 'next' | 'start' | 'hold' | 'playlist-previous' | 'playlist-next' | 'exit' | 'ended' | 'shuffle-toggle' | 'repeat-cycle';

/**
 * Un bouton du menu (menuButton, buttons.ts : la même résolution que la roue) dans le Juke-box, au niveau
 * où l'on est. Start passe à part (appui court ou maintenu, startPressStep). Les MagnaSave (touches des
 * collections de la roue) ne changent de playlist qu'au niveau 2.
 */
export function jukeboxInput(button: string | undefined, level: PlayerLevel): PlayerInput | undefined {
  switch (button) {
    case 'previous':
      return 'previous';
    case 'next':
      return 'next';
    case 'exit':
      return 'exit';
    case 'collection-previous':
      return level === 'tracks' ? 'playlist-previous' : undefined;
    case 'collection-next':
      return level === 'tracks' ? 'playlist-next' : undefined;
    default:
      return undefined;
  }
}

export type PlayerEffect =
  | { kind: 'play'; playlist: string; key: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  /** Plus rien à jouer (fin de morceau sans suivant disponible). */
  | { kind: 'stop' }
  /** Exit aux playlists : retour à la roue, la musique s'arrête. */
  | { kind: 'exit' }
  /** Start sur une playlist : ses morceaux. */
  | { kind: 'open'; playlist: string }
  /** Exit dans une playlist : retour aux playlists, la musique continue. */
  | { kind: 'up' }
  /** Start refusé, avec sa raison. */
  | { kind: 'refused'; reason: string; percent?: number }
  /** Start sur la ligne « Gestion du Juke-box » : la gestion s'ouvre. */
  | { kind: 'manage' };

export interface PlayerStep {
  state: PlayerState;
  effect?: PlayerEffect;
}

/**
 * État de départ, au niveau des playlists : le curseur sur la dernière ouverte (`opened`), sinon celle du
 * dernier morceau joué (son morceau choisi), sinon la première ; la gestion s'il n'y en a aucune. Rien ne joue.
 */
export function initialPlayer(lists: readonly PlayerList[], last?: { playlist: string; key: string }, opened?: string, modes?: Record<string, PlayMode>): PlayerState {
  const list = lists.find((l) => l.id === opened) ?? lists.find((l) => l.id === last?.playlist) ?? lists[0];
  const selected: Record<string, string> = {};
  if (list) {
    const key = list.id === last?.playlist && list.tracks.some((tr) => tr.key === last?.key) ? last!.key : list.tracks[0]?.key;
    if (key) selected[list.id] = key;
  }
  return { level: 'playlists', at: list?.id ?? JUKEBOX_MANAGE_KEY, shown: list?.id ?? '', selected, paused: false, ...(modes ? { modes } : {}) };
}

/** Lignes du niveau des morceaux : les quatre lignes fixes, puis les morceaux. */
export function trackRows(list: PlayerList): string[] {
  return [...JUKEBOX_TRACK_ACTIONS, ...list.tracks.map((tr) => tr.key)];
}

/** Lignes du niveau des playlists : la gestion, puis les playlists. */
export function playlistRows(lists: readonly PlayerList[]): string[] {
  return [JUKEBOX_MANAGE_KEY, ...lists.map((l) => l.id)];
}

/** Ligne choisie au niveau des playlists : celle retenue si elle existe encore, sinon la playlist ouverte, sinon la première. */
export function playlistAt(state: PlayerState, lists: readonly PlayerList[]): string {
  if (state.at === JUKEBOX_MANAGE_KEY || lists.some((l) => l.id === state.at)) return state.at;
  return lists.some((l) => l.id === state.shown) ? state.shown : (lists[0]?.id ?? JUKEBOX_MANAGE_KEY);
}

const listOf = (lists: readonly PlayerList[], id: string) => lists.find((l) => l.id === id);

/**
 * Ligne choisie dans la playlist ouverte : celle retenue (une ligne fixe comprise), sinon le morceau qui
 * joue, sinon le premier ; « Gestion du Juke-box » pour une playlist vide (on y ajoute des morceaux).
 */
export function rowKey(state: PlayerState, lists: readonly PlayerList[]): string | undefined {
  const list = listOf(lists, state.shown);
  if (!list) return undefined;
  const k = state.selected[list.id];
  if (k && (isJukeboxAction(k) || list.tracks.some((tr) => tr.key === k))) return k;
  if (state.playing?.playlist === list.id && list.tracks.some((tr) => tr.key === state.playing!.key)) return state.playing.key;
  return list.tracks[0]?.key ?? JUKEBOX_MANAGE_KEY;
}

/** Morceau choisi dans la playlist ouverte (pas une ligne fixe) ; aucun pour une playlist vide. */
export function selectedKey(state: PlayerState, lists: readonly PlayerList[]): string | undefined {
  const k = rowKey(state, lists);
  return k && !isJukeboxAction(k) ? k : undefined;
}

const playableKeys = (list: PlayerList) => list.tracks.filter((tr) => tr.playable).map((tr) => tr.key);

/** Joue `key` de `list`, avec le tirage restant si la playlist est en aléatoire. */
function playIn(state: PlayerState, list: PlayerList, key: string, random: () => number, left?: string[]): PlayerStep {
  const mode = playModeOf(state, list.id);
  const queue = mode.shuffle ? { playlist: list.id, left: left ?? shuffled(playableKeys(list).filter((k) => k !== key), random) } : undefined;
  const { queue: _old, ...rest } = state;
  return {
    state: { ...rest, playing: { playlist: list.id, key }, paused: false, ...(queue ? { queue } : {}) },
    effect: { kind: 'play', playlist: list.id, key },
  };
}

const withMode = (state: PlayerState, playlist: string, mode: PlayMode): PlayerState => ({ ...state, modes: { ...state.modes, [playlist]: mode } });

/** Morceau qui suit `key` dans `list` selon son mode ; undefined : plus rien à lire (arrêt). */
function following(state: PlayerState, list: PlayerList, key: string, random: () => number): { key: string; left?: string[] } | undefined {
  const mode = playModeOf(state, list.id);
  const playable = playableKeys(list);
  if (!playable.length) return undefined;
  if (mode.repeat === 'track' && playable.includes(key)) return { key };
  if (mode.shuffle) {
    const left = (state.queue?.playlist === list.id ? state.queue.left : shuffled(playable.filter((k) => k !== key), random)).filter((k) => playable.includes(k));
    if (left.length) return { key: left[0]!, left: left.slice(1) };
    if (mode.repeat !== 'playlist') return undefined;
    // Un nouveau tour : un nouveau tirage, qui ne recommence pas par le morceau qui vient de finir.
    const fresh = shuffled(playable, random);
    if (fresh.length > 1 && fresh[0] === key) fresh.push(fresh.shift()!);
    return { key: fresh[0]!, left: fresh.slice(1) };
  }
  const i = list.tracks.findIndex((tr) => tr.key === key);
  const after = list.tracks.slice(i + 1).find((tr) => tr.playable);
  if (after) return { key: after.key };
  return mode.repeat === 'playlist' ? { key: playable[0]! } : undefined;
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

export function playerStep(state: PlayerState, input: PlayerInput, lists: readonly PlayerList[], random: () => number = Math.random): PlayerStep {
  if (input === 'shuffle-toggle' || input === 'repeat-cycle') return modeStep(state, input, lists, random);
  if (state.level === 'playlists' && input !== 'ended') return playlistsStep(state, input, lists, random);
  const list = listOf(lists, state.shown);
  switch (input) {
    case 'previous':
    case 'next': {
      const k = rowKey(state, lists);
      if (!list || !k) return { state };
      // Les lignes fixes, puis les morceaux ; sans boucler : la liste ne saute pas.
      const rows = trackRows(list);
      const j = Math.min(rows.length - 1, Math.max(0, rows.indexOf(k) + (input === 'next' ? 1 : -1)));
      return { state: { ...state, selected: { ...state.selected, [list.id]: rows[j]! } } };
    }
    case 'hold':
      return { state, effect: { kind: 'manage' } };
    case 'playlist-previous':
    case 'playlist-next': {
      if (lists.length < 2) return { state };
      const i = Math.max(0, lists.findIndex((l) => l.id === state.shown));
      const next = lists[(i + (input === 'playlist-next' ? 1 : -1) + lists.length) % lists.length]!;
      // Rien ne démarre : on montre l'autre playlist, la lecture en cours continue.
      return { state: { ...state, shown: next.id, at: next.id } };
    }
    case 'start': {
      const k = rowKey(state, lists);
      if (!list || !k) return { state, effect: { kind: 'refused', reason: t('Playlist vide') } };
      if (k === JUKEBOX_MANAGE_KEY) return { state, effect: { kind: 'manage' } };
      if (k === JUKEBOX_REPEAT_KEY) {
        const mode = playModeOf(state, list.id);
        const repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(mode.repeat) + 1) % REPEAT_MODES.length]!;
        return { state: withMode(state, list.id, { ...mode, repeat }) };
      }
      if (k === JUKEBOX_PLAY_ALL_KEY || k === JUKEBOX_SHUFFLE_KEY) {
        // Tout lire : dans l'ordre, du premier morceau qui se lit ; lecture aléatoire : un nouveau tirage.
        const shuffle = k === JUKEBOX_SHUFFLE_KEY;
        const moded = withMode(state, list.id, { ...playModeOf(state, list.id), shuffle });
        const order = shuffle ? shuffled(playableKeys(list), random) : playableKeys(list);
        if (!order.length) return { state: moded, effect: { kind: 'refused', reason: list.tracks.length ? t('Aucun morceau ne se lit') : t('Playlist vide') } };
        return playIn(moded, list, order[0]!, random, shuffle ? order.slice(1) : undefined);
      }
      if (state.playing?.playlist === list.id && state.playing.key === k) {
        return state.paused ? { state: { ...state, paused: false }, effect: { kind: 'resume' } } : { state: { ...state, paused: true }, effect: { kind: 'pause' } };
      }
      const tr = list.tracks.find((x) => x.key === k)!;
      if (!tr.playable) return { state, effect: { kind: 'refused', reason: tr.reason ?? t('Indisponible'), ...(tr.percent !== undefined ? { percent: tr.percent } : {}) } };
      const played = playIn(state, list, k, random);
      return { ...played, state: { ...played.state, selected: { ...state.selected, [list.id]: k } } };
    }
    case 'ended': {
      if (!state.playing) return { state };
      const playing = listOf(lists, state.playing.playlist);
      const next = playing ? following(state, playing, state.playing.key, random) : undefined;
      if (!playing || !next) {
        const { queue: _q, ...rest } = state;
        return { state: { ...rest, playing: undefined, paused: false }, effect: { kind: 'stop' } };
      }
      // La sélection suit le morceau joué seulement si elle était dessus.
      const followed = state.selected[playing.id] === state.playing.key || (state.shown === playing.id && rowKey(state, lists) === state.playing.key);
      const played = playIn(state, playing, next.key, random, next.left);
      return { ...played, state: { ...played.state, selected: followed ? { ...state.selected, [playing.id]: next.key } : state.selected } };
    }
    case 'exit':
      // Exit remonte aux playlists, le curseur sur celle qu'on quitte ; la musique continue.
      return { state: { ...state, level: 'playlists', at: list ? list.id : playlistAt(state, lists) }, effect: { kind: 'up' } };
  }
}

/**
 * Boutons ⤮ et ⟳ de la carte du morceau (bureau) : le mode de la playlist qui joue (sinon de celle
 * ouverte). L'aléatoire activé en cours de lecture tire le reste de la playlist.
 */
function modeStep(state: PlayerState, input: 'shuffle-toggle' | 'repeat-cycle', lists: readonly PlayerList[], random: () => number): PlayerStep {
  const id = state.playing?.playlist ?? state.shown;
  const list = listOf(lists, id);
  if (!list) return { state };
  const mode = playModeOf(state, id);
  if (input === 'repeat-cycle') return { state: withMode(state, id, { ...mode, repeat: REPEAT_MODES[(REPEAT_MODES.indexOf(mode.repeat) + 1) % REPEAT_MODES.length]! }) };
  const next = withMode(state, id, { ...mode, shuffle: !mode.shuffle });
  const { queue: _q, ...rest } = next;
  if (mode.shuffle || state.playing?.playlist !== id) return { state: rest };
  return { state: { ...rest, queue: { playlist: id, left: shuffled(playableKeys(list).filter((k) => k !== state.playing!.key), random) } } };
}

/** Niveau des playlists : choisir une ligne, l'ouvrir (ou la lire en aléatoire), ou revenir à la roue. */
function playlistsStep(state: PlayerState, input: Exclude<PlayerInput, 'ended' | 'shuffle-toggle' | 'repeat-cycle'>, lists: readonly PlayerList[], random: () => number): PlayerStep {
  const rows = playlistRows(lists);
  const at = playlistAt(state, lists);
  switch (input) {
    case 'previous':
    case 'next': {
      const i = rows.indexOf(at);
      const j = Math.min(rows.length - 1, Math.max(0, i + (input === 'next' ? 1 : -1)));
      return { state: { ...state, at: rows[j]! } };
    }
    case 'playlist-previous':
    case 'playlist-next':
      // Les MagnaSave ne changent de playlist que dans une playlist ouverte.
      return { state: { ...state, at } };
    case 'start':
      if (at === JUKEBOX_MANAGE_KEY) return { state: { ...state, at }, effect: { kind: 'manage' } };
      // La playlist qui joue s'ouvre sur le morceau en cours : Start encore, et il se met en pause.
      if (state.playing?.playlist === at) return { state: { ...state, level: 'tracks', at, shown: at, selected: { ...state.selected, [at]: state.playing.key } }, effect: { kind: 'open', playlist: at } };
      return { state: { ...state, level: 'tracks', at, shown: at }, effect: { kind: 'open', playlist: at } };
    case 'hold': {
      // Start maintenu sur une playlist : elle s'ouvre et joue en aléatoire ; sur la gestion, la gestion.
      if (at === JUKEBOX_MANAGE_KEY) return { state: { ...state, at }, effect: { kind: 'manage' } };
      const opened: PlayerState = { ...state, level: 'tracks', at, shown: at, selected: { ...state.selected, [at]: JUKEBOX_SHUFFLE_KEY } };
      const r = playerStep(opened, 'start', lists, random);
      return r.effect?.kind === 'refused' ? { state: r.state, effect: { kind: 'open', playlist: at } } : r;
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
  if (state.level === 'playlists') {
    const at = playlistAt(state, lists);
    if (at === JUKEBOX_MANAGE_KEY) return { enabled: true, label: t('Ouvrir la gestion') };
    return { enabled: true, label: state.playing?.playlist === at ? t('Ouvrir · morceau en cours') : t('Ouvrir la playlist') };
  }
  const list = listOf(lists, state.shown);
  const k = rowKey(state, lists);
  if (k === JUKEBOX_MANAGE_KEY) return { enabled: true, label: t('Ouvrir la gestion') };
  if (k === JUKEBOX_REPEAT_KEY) return { enabled: true, label: t('Changer la répétition') };
  if (list && (k === JUKEBOX_PLAY_ALL_KEY || k === JUKEBOX_SHUFFLE_KEY)) {
    const label = k === JUKEBOX_PLAY_ALL_KEY ? t('Tout lire') : t('Lecture aléatoire');
    if (playableKeys(list).length) return { enabled: true, label };
    return { enabled: false, label: list.tracks.length ? t('Aucun morceau ne se lit') : t('Liste vide'), reason: list.tracks.length ? t('Aucun morceau ne se lit') : t('Playlist vide') };
  }
  if (!list || !k) return { enabled: false, label: t('Liste vide'), reason: t('Playlist vide') };
  if (state.playing?.playlist === list.id && state.playing.key === k) return { enabled: true, label: state.paused ? t('Reprendre') : t('Pause') };
  const tr = list.tracks.find((x) => x.key === k)!;
  if (tr.playable) return { enabled: true, label: t('Jouer') };
  const label = tr.percent !== undefined ? t('Indisponible · {pct} %', { pct: formatNumber(tr.percent) }) : t('Indisponible');
  return { enabled: false, label, ...(tr.reason ? { reason: tr.reason } : {}) };
}

/** Ce que fera Start maintenu : la lecture aléatoire d'une playlist choisie au niveau 1, sinon la gestion. */
export function holdHint(state: PlayerState, lists: readonly PlayerList[]): 'shuffle' | 'manage' {
  return state.level === 'playlists' && playlistAt(state, lists) !== JUKEBOX_MANAGE_KEY ? 'shuffle' : 'manage';
}

/** Position de la playlist montrée : « 2 / 4 ». */
export function playlistPosition(state: PlayerState, lists: readonly PlayerList[]): { index: number; count: number } {
  return { index: Math.max(0, lists.findIndex((l) => l.id === state.shown)) + 1, count: lists.length };
}
