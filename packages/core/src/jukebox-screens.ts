// Le lecteur du Juke-box à l'écran (étape 3), en logique pure : le médaillon en tête de la roue, la
// fenêtre de la liste des morceaux, ce que chaque écran montre (vue du playfield, du fronton, de
// l'affiche du médaillon) et le DMD par défaut (le spectre). Les maquettes validées le 09/11/2026
// fixent les zones ; rien ici ne dépend d’Electron.
//
// - Roue : le médaillon est la première entrée de chaque collection, au rang d'une table ; il compte
//   dans le compteur (« 1 / 8 » pour sept tables). Un réglage le masque (Menu système > Médias).
// - Liste : huit lignes en borne, sept au bureau ; elle ne se déplace que quand le choix quitte sa
//   fenêtre visible (rien ne saute), et s'ouvre le choix vers le milieu.
// - Vue : le morceau choisi (focus vert) et le morceau en cours (filet sarcelle) sont distincts ;
//   chaque morceau qui ne se lit pas est grisé avec sa raison, jamais caché.

import { formatNumber, t, tn } from './i18n';
import { formatTotalTime, formatTrackTime, type JukeboxQuality, type TrackSource, type TrackStatus } from './jukebox';
import {
  holdHint,
  JUKEBOX_MANAGE_HOLD_MS,
  JUKEBOX_MANAGE_KEY,
  JUKEBOX_PLAY_ALL_KEY,
  JUKEBOX_REPEAT_KEY,
  JUKEBOX_SHUFFLE_KEY,
  isJukeboxAction,
  playlistAt,
  playModeOf,
  rowKey,
  selectedKey,
  startHint,
  type PlayerLevel,
  type PlayerList,
  type PlayerState,
  type PlayMode,
} from './jukebox-play';
import { DMD_FONT_LARGE, DMD_FONT_SMALL, dmdText, textWidth } from './dmdfont';
import { DMD_HEIGHT, DMD_LEVEL, DMD_MARGIN, DMD_USABLE, DMD_WIDTH, blankDots, drawCentered, drawText, type DmdDots } from './livedmd';

// ---------------------------------------------------------------------------
// Roue

/** Clé du médaillon dans la roue (les tables y ont leur fichier). */
export const JUKEBOX_WHEEL_KEY = 'juke-box:medaillon';

/** Une place de la roue : l'entrée (son rang dans la roue) et son décalage depuis le centre. */
export interface WheelPlace {
  index: number;
  offset: number;
}

/**
 * Places de la roue autour de l'entrée `center` : neuf (de −4 à +4) dès neuf entrées ; en dessous,
 * chacune une seule fois, réparties de part et d'autre, en boucle comme la liste.
 */
export function wheelPlaces(count: number, center: number): WheelPlace[] {
  if (count <= 0) return [];
  if (count >= 9) return [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => ({ index: (((center + offset) % count) + count) % count, offset }));
  const half = Math.floor((count - 1) / 2);
  return Array.from({ length: count }, (_, i) => ({ index: i, offset: ((i - center + count * 2 + half) % count) - half }));
}

export interface JukeboxWheelInput {
  /** Tables de la collection montrée. */
  tables: number;
  /** Rang de la table choisie dans la collection. */
  at: number;
  /** Le médaillon est dans la roue (réglage « Juke-box dans la roue »). */
  shown: boolean;
  /** Le médaillon est choisi. */
  selected: boolean;
}

/** Une place de la roue : le médaillon, ou une table de la collection (son rang). */
export type WheelEntry = { offset: number; jukebox: true } | { offset: number; table: number };

export interface JukeboxWheel {
  /** Entrées de la roue (médaillon compris). */
  count: number;
  /** Rang du choix, à partir de 1 (« 1 / 8 » : le médaillon). */
  position: number;
  places: WheelEntry[];
}

/** La roue d'une collection, le médaillon en tête : compteur, place du choix, entrées autour de lui. */
export function jukeboxWheel(w: JukeboxWheelInput): JukeboxWheel {
  const lead = w.shown ? 1 : 0;
  const count = w.tables + lead;
  const center = w.shown && w.selected ? 0 : Math.min(Math.max(0, w.at), Math.max(0, w.tables - 1)) + lead;
  const places = wheelPlaces(count, center).map(({ index, offset }): WheelEntry => (lead && index === 0 ? { offset, jukebox: true } : { offset, table: index - lead }));
  return { count, position: count ? center + 1 : 0, places };
}

/** Flippers (ou clic sur une place) : l'entrée à `offset` du choix, en boucle sur la roue. */
export function jukeboxWheelMove(w: JukeboxWheelInput, offset: number): { jukebox: true } | { table: number } | undefined {
  const { count, position } = jukeboxWheel(w);
  if (!count) return undefined;
  const lead = w.shown ? 1 : 0;
  const target = (((position - 1 + offset) % count) + count) % count;
  return lead && target === 0 ? { jukebox: true } : { table: target - lead };
}

// ---------------------------------------------------------------------------
// Liste des morceaux

/** Lignes visibles : huit en borne (132 px chacune à la référence 1080 × 1920), sept au bureau (110 px). */
export const JUKEBOX_LIST_ROWS = { cab: 8, desk: 7 } as const;
export type JukeboxLayout = keyof typeof JUKEBOX_LIST_ROWS;

/**
 * Première ligne visible : inchangée tant que le choix reste dans la fenêtre ; sinon juste ce qu'il
 * faut pour l'y ramener, entier. Sans fenêtre connue (playlist qu'on ouvre), le choix vers le milieu.
 */
export function listTop(top: number | undefined, selected: number, rows: number, count: number): number {
  const last = Math.max(0, count - rows);
  if (selected < 0) return Math.min(Math.max(0, top ?? 0), last);
  if (top === undefined) return Math.min(Math.max(0, selected - Math.floor(rows / 2)), last);
  let next = Math.min(Math.max(0, top), last);
  if (selected < next) next = selected;
  else if (selected >= next + rows) next = selected - rows + 1;
  return Math.min(Math.max(0, next), last);
}

// ---------------------------------------------------------------------------
// Vue du lecteur

/** Un morceau tel que le lecteur le reçoit (TrackView du service, réduit à ce qui se montre). */
export interface JukeboxRowInput {
  key: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  source: TrackSource;
  status: Pick<TrackStatus, 'kind' | 'playable' | 'label' | 'reason' | 'percent'>;
  /** Adresse de l'image (miniature, pochette), déjà servie. */
  image?: string;
}

export interface JukeboxPlaylistInput {
  id: string;
  name: string;
  quality: JukeboxQuality;
  rows: readonly JukeboxRowInput[];
}

/** Signe de la raison d'un morceau grisé : jamais la couleur seule. */
export type JukeboxMark = 'download' | 'waiting' | 'unavailable' | 'offline' | 'ad';

export interface JukeboxRowView {
  key: string;
  /** Numéro dans la playlist, sur deux chiffres. */
  num: string;
  title: string;
  /** Artiste, ou la raison quand le morceau ne se lit pas. */
  line: string;
  mark?: JukeboxMark;
  percent?: number;
  duration: string;
  source: TrackSource;
  image?: string;
  /** Morceau en cours : lecture ou pause. */
  playing?: 'play' | 'pause';
  focus?: boolean;
  disabled?: boolean;
  /** Ligne fixe « Gestion du Juke-box », en tête des playlists : pas une playlist. */
  manage?: boolean;
  /** Niveau des playlists : une playlist (title : son nom ; line : « 24 morceaux · 1 h 36 »). */
  kind?: 'playlist';
  /** Pochettes de ses premiers morceaux (jusqu'à quatre : la mosaïque). */
  mosaic?: string[];
  /** Repères des sources de ses morceaux (en ligne, sur la borne, fichier). */
  sources?: TrackSource[];
  /** Ligne fixe du niveau des morceaux (Tout lire, Lecture aléatoire, Répétition) : son icône. */
  action?: 'play' | 'shuffle' | 'repeat' | 'repeat-one';
  /** Ligne fixe dont le mode est en vigueur pour cette playlist (aléatoire, répétition). */
  on?: boolean;
}

export interface JukeboxCommandView {
  id: 'flippers' | 'start' | 'magnasave' | 'exit' | 'manage' | 'seek';
  /** Bouton de la borne, et touche du clavier au bureau. */
  cab: string;
  desk: string;
  action: string;
  disabled?: boolean;
}

export interface JukeboxNowView {
  key: string;
  playlist: string;
  title: string;
  artist?: string;
  album?: string;
  /** « En lecture · 02 / 24 », « En pause · 02 / 24 », « Publicité · le morceau suit ». */
  label: string;
  /** Place dans sa playlist : « 02 / 24 » (cartel du fronton : « Néon nocturne · 02 / 24 »). */
  position: string;
  paused: boolean;
  ad: boolean;
  /** Durée connue (secondes) : le temps écoulé arrive à part (canal jukebox-time). */
  duration?: number;
  source: TrackSource;
  /** Son seul (pas de vidéo) : pochette ou visualiseur au fronton. */
  audioOnly: boolean;
  image?: string;
  /** Repère de la source, au bureau : « Son et clip locaux », « YouTube en ligne », « Fichier local ». */
  origin: string;
  /** Mode de lecture de sa playlist : les icônes ⤮ et ⟳ de la carte (et ses boutons au bureau). */
  mode: PlayMode;
  /** Flipper tenu : la position s'affiche en grand sur la carte pendant l'avance. */
  seeking?: boolean;
}

export interface JukeboxPlayerView {
  /** Niveau : les playlists (à l'entrée), ou les morceaux de la playlist ouverte. */
  level: PlayerLevel;
  /** En-tête, à la même place aux deux niveaux : seul son contenu change. */
  header: {
    /** « Juke-box · 4 playlists », « Playlist · 24 morceaux ». */
    label: string;
    /** « PLAYLISTS », ou le nom de la playlist ouverte. */
    title: string;
    /** « 2 / 4 » : la playlist ouverte parmi toutes. */
    badge?: string;
    /** Fil d'Ariane d'une playlist ouverte : « Playlists › Néon nocturne » (« Playlists » y remonte). */
    crumb?: string;
  };
  /** Playlist ouverte (niveau des morceaux). */
  playlist?: {
    id: string;
    name: string;
    /** « Playlist · 24 morceaux ». */
    count: string;
    /** « 2 / 4 ». */
    position: string;
    quality: JukeboxQuality;
  };
  list: {
    /** « Sélection · 3 / 24 », « Aucun morceau ». */
    head: string;
    /** « ↑ 32 avant · 20 après ↓ » quand la liste a défilé. */
    around?: string;
    top: number;
    total: number;
    rows: JukeboxRowView[];
    before: number;
    after: number;
  };
  now?: JukeboxNowView;
  commands: JukeboxCommandView[];
  /** Aucune playlist, ou playlist vide : l'invitation, sans focus. */
  empty?: 'library' | 'playlist';
  /** Start tenu : depuis quand, et le seuil ; l'anneau de la ligne « Gestion » et de son rappel se remplit. */
  manageHold?: { since: number; ms: number };
}

export interface JukeboxViewInput {
  playlists: readonly JukeboxPlaylistInput[];
  state: PlayerState;
  /** Première ligne visible de la playlist montrée (listTop). */
  top: number;
  rows: number;
  /** Publicité YouTube en cours sur le morceau joué. */
  ad?: boolean;
  /** Le morceau en cours se lit sans vidéo (son seul, fichier son, vidéo absente). */
  audioOnly?: boolean;
  /** Start tenu depuis cet instant (horloge du processus principal). */
  holdSince?: number;
  /**
   * La borne a des touches pour changer de playlist (les MagnaSave des collections de la roue) : sans
   * elles (MagnaSave relevés comme Valider ou Retour), le bandeau ne les propose pas.
   */
  magnaSave?: boolean;
  /** Un flipper tenu avance ou recule dans le morceau en cours. */
  seeking?: boolean;
}

const two = (n: number) => String(n).padStart(2, '0');

function markOf(status: JukeboxRowInput['status']): JukeboxMark | undefined {
  if (status.playable) return undefined;
  switch (status.kind) {
    case 'downloading':
      return 'download';
    case 'waiting':
    case 'pending':
      return 'waiting';
    case 'offline':
      return 'offline';
    default:
      return 'unavailable';
  }
}

/** Raison d'un morceau grisé : courte pour un état passager, entière pour une indisponibilité. */
function reasonOf(status: JukeboxRowInput['status']): string {
  if (status.kind === 'missing' || status.kind === 'unavailable') return status.reason ?? status.label;
  return status.label;
}

function originOf(source: TrackSource, audioOnly: boolean): string {
  if (source === 'online') return t('YouTube en ligne');
  if (source === 'file') return audioOnly ? t('Fichier local · son seul') : t('Fichier local');
  return audioOnly ? t('Son local · sans clip') : t('Son et clip locaux');
}

/** Ce que Start dira sur la ligne choisie : l'action, ou pourquoi elle ne se lit pas. */
function startAction(view: JukeboxViewInput, lists: readonly PlayerList[], row: JukeboxRowInput | undefined): { action: string; disabled: boolean } {
  const hint = startHint(view.state, lists);
  if (view.state.level === 'playlists') return { action: hint.label, disabled: false };
  if (!row) return { action: t('Liste vide'), disabled: true };
  if (hint.enabled) return { action: hint.label === t('Jouer') ? t('Jouer la sélection') : hint.label, disabled: false };
  switch (row.status.kind) {
    case 'downloading':
      return { action: hint.label, disabled: true };
    case 'offline':
      return { action: t('Hors ligne'), disabled: true };
    case 'missing':
      return { action: t('Fichier absent'), disabled: true };
    case 'unavailable':
      return { action: row.source === 'file' ? t('Fichier absent') : t('Vidéo indisponible'), disabled: true };
    default:
      return { action: hint.label, disabled: true };
  }
}

/** Les playlists pour les règles de lecture (jukebox-play.ts), d'après ce que la vue reçoit. */
export function playerListsOf(playlists: readonly JukeboxPlaylistInput[]): PlayerList[] {
  return playlists.map((p) => ({
    id: p.id,
    tracks: p.rows.map((r) => ({ key: r.key, playable: r.status.playable, ...(r.status.reason ? { reason: r.status.reason } : {}), ...(r.status.percent !== undefined ? { percent: r.status.percent } : {}) })),
  }));
}

/** Ordre des repères de sources : en ligne, sur la borne, fichier (comme la légende). */
const SOURCE_ORDER: readonly TrackSource[] = ['online', 'download', 'file'];

/** « 24 morceaux · 1 h 36 » : le nombre de morceaux et leur durée connue. */
function playlistLine(p: JukeboxPlaylistInput): string {
  const seconds = p.rows.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  return [tn(p.rows.length, '{n} morceau', '{n} morceaux', { n: formatNumber(p.rows.length) }), ...(seconds ? [formatTotalTime(seconds)] : [])].join(' · ');
}

/** Ligne fixe « Gestion du Juke-box », en tête des playlists. */
function manageRow(focus: boolean): JukeboxRowView {
  return {
    key: JUKEBOX_MANAGE_KEY,
    num: '',
    title: t('Gestion du Juke-box'),
    line: t('Playlists, morceaux, ajouts de YouTube ou de fichiers'),
    duration: '',
    source: 'download',
    manage: true,
    ...(focus ? { focus: true } : {}),
  };
}

/** Le morceau en cours, en bas, aux deux niveaux. */
function nowView(view: JukeboxViewInput): JukeboxNowView | undefined {
  const playing = view.state.playing;
  if (!playing) return undefined;
  const pl = view.playlists.find((p) => p.id === playing.playlist);
  const i = pl ? pl.rows.findIndex((r) => r.key === playing.key) : -1;
  const r = pl && i >= 0 ? pl.rows[i]! : undefined;
  if (!pl || !r) return undefined;
  const audioOnly = Boolean(view.audioOnly);
  const position = `${two(i + 1)} / ${two(pl.rows.length)}`;
  return {
    key: r.key,
    playlist: pl.name,
    title: r.title,
    ...(r.artist ? { artist: r.artist } : {}),
    ...(r.album ? { album: r.album } : {}),
    label: view.ad ? t('Publicité · le morceau suit') : view.state.paused ? t('En pause · {position}', { position }) : t('En lecture · {position}', { position }),
    position,
    paused: view.state.paused,
    ad: Boolean(view.ad),
    ...(r.duration !== undefined ? { duration: r.duration } : {}),
    source: r.source,
    audioOnly,
    ...(r.image ? { image: r.image } : {}),
    origin: originOf(r.source, audioOnly),
    mode: playModeOf(view.state, pl.id),
    ...(view.seeking ? { seeking: true } : {}),
  };
}

/**
 * Les commandes du bandeau, telles qu'elles tiennent en deux colonnes (borne) : la dernière seule sur sa
 * rangée prend toute la largeur ; Start maintenu, à côté d'une autre, prend son nom court.
 */
function withSeek(commands: JukeboxCommandView[], now: JukeboxNowView | undefined): JukeboxCommandView[] {
  // Un morceau en cours : flipper tenu, avancer ou reculer dedans (bureau : flèches tenues).
  const all = now ? [...commands.slice(0, -1), { id: 'seek' as const, cab: t('Flipper tenu'), desk: t('Flèches tenues'), action: t('Avancer / reculer') }, commands.at(-1)!] : commands;
  const last = all.at(-1)!;
  return all.length % 2 === 0 && last.id === 'manage' && last.action === t('Gestion des playlists') ? [...all.slice(0, -1), { ...last, action: t('Gestion') }] : all;
}

/** Ce que dit la ligne « Répétition » : le mode en vigueur. */
const REPEAT_TEXT = { playlist: () => t('Répétition : playlist'), track: () => t('Répétition : morceau'), none: () => t('Répétition : aucune') } as const;

/** Les trois lignes fixes d'une playlist ouverte, sous « Gestion du Juke-box » : ce ne sont pas des morceaux. */
function actionRow(key: string, p: JukeboxPlaylistInput, mode: PlayMode, focus: boolean): JukeboxRowView {
  const base = { key, num: '', duration: '', source: 'download' as const, ...(focus ? { focus: true } : {}) };
  const count = tn(p.rows.length, '{n} morceau', '{n} morceaux', { n: formatNumber(p.rows.length) });
  if (key === JUKEBOX_PLAY_ALL_KEY) return { ...base, title: t('Tout lire'), line: t('{count}, dans l’ordre', { count }), action: 'play', ...(!mode.shuffle ? { on: true } : {}) };
  if (key === JUKEBOX_SHUFFLE_KEY) return { ...base, title: t('Lecture aléatoire'), line: t('Chaque morceau une fois, dans le désordre'), action: 'shuffle', ...(mode.shuffle ? { on: true } : {}) };
  return {
    ...base,
    title: REPEAT_TEXT[mode.repeat](),
    line: t('Start : playlist, morceau, aucune'),
    action: mode.repeat === 'track' ? 'repeat-one' : 'repeat',
    ...(mode.repeat !== 'none' ? { on: true } : {}),
  };
}

/**
 * Ce que montre le playfield en mode Juke-box (et le cadre du bureau), au niveau où l'on est : les
 * playlists (la gestion en tête), ou les morceaux de la playlist ouverte. L'en-tête, la liste, la carte
 * du morceau en cours et le bandeau des commandes gardent leur place d'un niveau à l'autre.
 */
export function jukeboxPlayerView(view: JukeboxViewInput): JukeboxPlayerView {
  const lists = playerListsOf(view.playlists);
  const n = view.playlists.length;
  const playing = view.state.playing;
  const now = nowView(view);
  const hold = view.holdSince !== undefined ? { manageHold: { since: view.holdSince, ms: JUKEBOX_MANAGE_HOLD_MS } } : {};
  const start = (row: JukeboxRowInput | undefined) => startAction(view, lists, row);
  const manageCommand: JukeboxCommandView = { id: 'manage', cab: t('Start maintenu'), desk: t('Entrée maintenue'), action: t('Gestion des playlists') };
  const window = <T,>(all: readonly T[]) => {
    const top = Math.min(Math.max(0, view.top), Math.max(0, all.length - view.rows));
    const shownRows = all.slice(top, top + view.rows);
    return { top, shownRows, before: top, after: Math.max(0, all.length - top - shownRows.length) };
  };

  if (view.state.level === 'playlists') {
    const at = playlistAt(view.state, lists);
    const all: (JukeboxPlaylistInput | undefined)[] = [undefined, ...view.playlists];
    const w = window(all);
    const rows = w.shownRows.map((p): JukeboxRowView => {
      if (!p) return manageRow(at === JUKEBOX_MANAGE_KEY);
      const i = view.playlists.indexOf(p);
      const sources = SOURCE_ORDER.filter((src) => p.rows.some((r) => r.source === src));
      const mosaic = p.rows.map((r) => r.image).filter((img): img is string => Boolean(img)).slice(0, 4);
      return {
        key: p.id,
        num: two(i + 1),
        title: p.name,
        line: playlistLine(p),
        duration: '',
        source: sources[0] ?? 'download',
        kind: 'playlist',
        sources,
        ...(mosaic.length ? { mosaic, image: mosaic[0]! } : {}),
        ...(playing?.playlist === p.id ? { playing: view.state.paused ? ('pause' as const) : ('play' as const) } : {}),
        ...(p.id === at ? { focus: true } : {}),
      };
    });
    const atIndex = view.playlists.findIndex((p) => p.id === at);
    const commands: JukeboxCommandView[] = [
      { id: 'flippers', cab: t('Flippers'), desk: '↑↓', action: t('Choisir') },
      { id: 'start', cab: t('Start'), desk: t('Entrée'), action: start(undefined).action },
      { id: 'exit', cab: t('Exit'), desk: t('Échap'), action: t('Roue · arrêt musique') },
      // Start maintenu : sur une playlist, sa lecture aléatoire ; sur la gestion, la gestion.
      holdHint(view.state, lists) === 'shuffle' ? { ...manageCommand, action: t('Lecture aléatoire') } : manageCommand,
    ];
    return {
      level: 'playlists',
      header: { label: tn(n, 'Juke-box · {n} playlist', 'Juke-box · {n} playlists', { n: formatNumber(n) }), title: t('PLAYLISTS') },
      list: {
        head: atIndex >= 0 ? t('Playlist · {at} / {count}', { at: atIndex + 1, count: n }) : tn(n, 'Gestion du Juke-box · {n} playlist', 'Gestion du Juke-box · {n} playlists', { n: formatNumber(n) }),
        ...(w.before ? { around: t('↑ {before} avant · {after} après ↓', { before: Math.max(0, w.before - 1), after: w.after }) } : {}),
        top: w.top,
        total: n,
        rows,
        before: w.before,
        after: w.after,
      },
      ...(now ? { now } : {}),
      commands: withSeek(commands, now),
      ...(n ? {} : { empty: 'library' as const }),
      ...hold,
    };
  }

  const index = view.playlists.findIndex((p) => p.id === view.state.shown);
  const shown = index >= 0 ? view.playlists[index] : undefined;
  const selected = selectedKey(view.state, lists);
  const focusKey = rowKey(view.state, lists);
  const tracks = shown?.rows ?? [];
  const at = tracks.findIndex((r) => r.key === selected);
  const mode = shown ? playModeOf(view.state, shown.id) : undefined;
  // Les quatre lignes fixes (gestion, Tout lire, Lecture aléatoire, Répétition), puis les morceaux.
  const ACTIONS = 4;
  const all: (string | JukeboxRowInput)[] = shown ? [JUKEBOX_MANAGE_KEY, JUKEBOX_PLAY_ALL_KEY, JUKEBOX_SHUFFLE_KEY, JUKEBOX_REPEAT_KEY, ...tracks] : [];
  const w = window(all);
  const rows = w.shownRows.map((r, i): JukeboxRowView => {
    if (typeof r === 'string') return r === JUKEBOX_MANAGE_KEY ? manageRow(focusKey === r) : actionRow(r, shown!, mode!, focusKey === r);
    const mark = markOf(r.status);
    const isPlaying = playing?.playlist === shown?.id && playing?.key === r.key;
    const ad = isPlaying && view.ad;
    return {
      key: r.key,
      num: two(w.top + i + 1 - ACTIONS),
      title: r.title,
      line: ad ? t('Publicité · le morceau suit') : mark ? reasonOf(r.status) : (r.artist ?? ''),
      ...(ad ? { mark: 'ad' as const } : mark ? { mark } : {}),
      ...(mark === 'download' && r.status.percent !== undefined ? { percent: r.status.percent } : {}),
      duration: formatTrackTime(r.duration),
      source: r.source,
      ...(r.image ? { image: r.image } : {}),
      ...(isPlaying ? { playing: view.state.paused ? ('pause' as const) : ('play' as const) } : {}),
      ...(r.key === selected ? { focus: true } : {}),
      ...(mark ? { disabled: true } : {}),
    };
  });
  const startNow = isJukeboxAction(focusKey) ? { action: startHint(view.state, lists).label, disabled: !startHint(view.state, lists).enabled } : start(at >= 0 ? tracks[at] : undefined);
  const commands: JukeboxCommandView[] = [
    { id: 'flippers', cab: t('Flippers'), desk: '↑↓', action: t('Choisir') },
    { id: 'start', cab: t('Start'), desk: t('Entrée'), action: startNow.action, ...(startNow.disabled ? { disabled: true } : {}) },
    // Les MagnaSave, en raccourci, seulement si la borne en a pour cela ; grisés avec leur raison s'il n'y a qu'une playlist.
    ...(view.magnaSave !== false
      ? [{ id: 'magnasave' as const, cab: t('MagnaSave'), desk: '←→', action: n > 1 ? t('Playlist préc. / suiv.') : t('Une seule playlist'), ...(n > 1 ? {} : { disabled: true }) }]
      : []),
    { id: 'exit', cab: t('Exit'), desk: t('Échap'), action: t('Playlists') },
    manageCommand,
  ];
  return {
    level: 'tracks',
    header: {
      label: tn(tracks.length, 'Playlist · {n} morceau', 'Playlist · {n} morceaux', { n: formatNumber(tracks.length) }),
      title: shown?.name ?? t('Aucune playlist'),
      ...(shown ? { badge: `${index + 1} / ${n}`, crumb: shown.name } : {}),
    },
    ...(shown
      ? {
          playlist: {
            id: shown.id,
            name: shown.name,
            count: tn(tracks.length, 'Playlist · {n} morceau', 'Playlist · {n} morceaux', { n: formatNumber(tracks.length) }),
            position: `${index + 1} / ${n}`,
            quality: shown.quality,
          },
        }
      : {}),
    list: {
      head: !tracks.length ? t('Aucun morceau') : at >= 0 ? t('Sélection · {at} / {count}', { at: at + 1, count: tracks.length }) : tn(tracks.length, '{n} morceau', '{n} morceaux', { n: formatNumber(tracks.length) }),
      // Liste déjà défilée : les morceaux avant et après (les lignes fixes ne comptent pas).
      ...(w.before > ACTIONS ? { around: t('↑ {before} avant · {after} après ↓', { before: w.before - ACTIONS, after: w.after }) } : {}),
      top: w.top,
      total: tracks.length,
      rows,
      before: w.before,
      after: w.after,
    },
    ...(now ? { now } : {}),
    commands: withSeek(commands, now),
    ...(!shown ? { empty: 'library' as const } : !tracks.length ? { empty: 'playlist' as const } : {}),
    ...hold,
  };
}

// ---------------------------------------------------------------------------
// Affiche du médaillon (roue) et cartel du fronton

export interface JukeboxPosterView {
  /** « 4 playlists · 86 morceaux · 5 h 42 », ou « Aucune playlist ». */
  stats: string;
  empty: boolean;
  /** « Dernière écoute » ou « Pour commencer ». */
  eyebrow: string;
  heading: string;
  detail: string;
}

/** Affiche du médaillon : la dernière écoute, ou l'invitation à importer une première playlist. */
export function jukeboxPoster(input: { stats: string; empty: boolean; last?: { title: string; artist?: string; album?: string } }): JukeboxPosterView {
  if (input.empty) return { stats: t('Votre première playlist vous attend.'), empty: true, eyebrow: t('Pour commencer'), heading: t('Importez une playlist YouTube'), detail: t('Depuis votre téléphone ou la fenêtre Récupérer.') };
  const detail = [input.last?.artist, input.last?.album ? t('album {album}', { album: input.last.album }) : undefined].filter(Boolean).join(' · ');
  return input.last
    ? { stats: input.stats, empty: false, eyebrow: t('Dernière écoute'), heading: input.last.title, detail }
    : { stats: input.stats, empty: false, eyebrow: t('Prêt à jouer'), heading: t('Start pour ouvrir le Juke-box'), detail: t('Flippers : choisir · Start : jouer') };
}

// ---------------------------------------------------------------------------
// DMD (habillage par défaut : le spectre, en vert signal)

/** Bandes du spectre : 24 colonnes de 3 points, un point d'écart (maquette « Spectre »). */
export const JUKEBOX_SPECTRUM_BANDS = 24;

/** Sélection du médaillon : JUKE-BOX en grand, le nombre de morceaux et de playlists dessous. */
export function jukeboxSelectionDots(input: { tracks: number; playlists: number }): DmdDots {
  const dots = blankDots();
  drawCentered(dots, DMD_FONT_LARGE, 'JUKE-BOX', 3);
  if (!input.playlists) {
    drawCentered(dots, DMD_FONT_SMALL, dmdText(t('Aucune playlist')), 23, DMD_LEVEL.secondary);
    return dots;
  }
  const left = dmdText(tn(input.tracks, '{n} morceau', '{n} morceaux', { n: input.tracks }));
  const right = dmdText(tn(input.playlists, '{n} playlist', '{n} playlists', { n: input.playlists }));
  // Deux groupes sous le titre, de part et d'autre (relecture 1, point 6) ; centrés s'ils ne tiennent pas côte à côte.
  const lw = textWidth(DMD_FONT_SMALL, left);
  const rw = textWidth(DMD_FONT_SMALL, right);
  // Un point de marge de chaque côté et deux au moins entre eux, comme la maquette (x = 1 et x = 66).
  if (lw + rw + 2 <= DMD_WIDTH - 2) {
    drawText(dots, DMD_FONT_SMALL, left, 1, 23, DMD_LEVEL.secondary);
    drawText(dots, DMD_FONT_SMALL, right, DMD_WIDTH - 1 - rw, 23, DMD_LEVEL.secondary);
  } else drawCentered(dots, DMD_FONT_SMALL, left, 23, DMD_LEVEL.secondary);
  return dots;
}

/**
 * Niveaux du spectre (0 à 1, une valeur par bande) quand on ne peut pas écouter le son (lecteur
 * YouTube, pause) : un mouvement doux qui suit le temps, nul en pause.
 */
export function idleSpectrum(elapsed: number, playing: boolean): number[] {
  return Array.from({ length: JUKEBOX_SPECTRUM_BANDS }, (_, i) => {
    if (!playing) return 0.06;
    const s = elapsed / 1000;
    const v = 0.5 + 0.25 * Math.sin(s * 3.1 + i * 0.37) + 0.2 * Math.sin(s * 5.3 + i * 0.11) + 0.05 * Math.sin(s * 11 + i);
    return Math.min(1, Math.max(0.05, v * (1 - i / (JUKEBOX_SPECTRUM_BANDS * 1.6))));
  });
}

/**
 * Spectre (4:1, 128 × 32) : l'artiste en petit en tête (défilant s'il est plus large que l'afficheur),
 * 24 colonnes de niveaux dessous, plus claires vers le haut.
 */
export function jukeboxSpectrumDots(input: { artist?: string; title?: string; levels: readonly number[]; elapsed: number }): DmdDots {
  const dots = blankDots();
  const text = dmdText(input.artist || input.title || 'JUKE-BOX');
  const width = textWidth(DMD_FONT_SMALL, text);
  if (width <= DMD_USABLE) drawText(dots, DMD_FONT_SMALL, text, DMD_MARGIN + 2, 3);
  else {
    // Défilement continu de droite à gauche, 24 points par seconde, avec un blanc entre deux passages.
    const loop = width + 40;
    const x = DMD_WIDTH - Math.floor((input.elapsed / 1000) * 24) % (loop + DMD_WIDTH);
    drawText(dots, DMD_FONT_SMALL, text, x, 3);
  }
  const bottom = DMD_HEIGHT - 3;
  const height = 17;
  for (let b = 0; b < JUKEBOX_SPECTRUM_BANDS; b++) {
    const v = Math.min(1, Math.max(0, input.levels[b] ?? 0));
    const h = Math.max(1, Math.round(v * height));
    const x0 = 5 + b * 5;
    for (let y = 0; y < h; y++) {
      const level = Math.round(6 + 9 * (y / height));
      for (let dx = 0; dx < 3; dx++) {
        const i = (bottom - y) * DMD_WIDTH + x0 + dx;
        dots[i] = Math.max(dots[i]!, level);
      }
    }
  }
  return dots;
}
