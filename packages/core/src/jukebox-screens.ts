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
import { formatTrackTime, type JukeboxQuality, type TrackSource, type TrackStatus } from './jukebox';
import { JUKEBOX_MANAGE_HOLD_MS, JUKEBOX_MANAGE_KEY, selectedKey, startHint, type PlayerList, type PlayerState } from './jukebox-play';
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
  /** Ligne fixe « Gestion du Juke-box », en tête de la liste : pas un morceau. */
  manage?: boolean;
}

/** Rang d'affichage d'une ligne : la ligne de gestion en 0, le morceau n en n (numéroté « 0n »). */
export function displayIndex(key: string | undefined, rows: readonly { key: string }[]): number {
  if (key === undefined || key === JUKEBOX_MANAGE_KEY) return 0;
  const i = rows.findIndex((r) => r.key === key);
  return i < 0 ? 0 : i + 1;
}

export interface JukeboxCommandView {
  id: 'flippers' | 'start' | 'magnasave' | 'exit' | 'manage';
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
}

export interface JukeboxPlayerView {
  playlist?: {
    id: string;
    name: string;
    /** « Playlist · 24 morceaux ». */
    count: string;
    /** « 2 / 4 ». */
    position: string;
    previous?: string;
    next?: string;
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

/** Ce que Start dira sur le morceau choisi : l'action, ou pourquoi il ne joue pas. */
function startAction(view: JukeboxViewInput, lists: readonly PlayerList[], row: JukeboxRowInput | undefined): { action: string; disabled: boolean } {
  const hint = startHint(view.state, lists);
  if (selectedKey(view.state, lists) === JUKEBOX_MANAGE_KEY) return { action: hint.label, disabled: false };
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

/** Ce que montre le playfield en mode Juke-box (et le cadre du bureau). */
export function jukeboxPlayerView(view: JukeboxViewInput): JukeboxPlayerView {
  const lists = playerListsOf(view.playlists);
  const index = view.playlists.findIndex((p) => p.id === view.state.shown);
  const shown = index >= 0 ? view.playlists[index] : undefined;
  const n = view.playlists.length;
  const neighbor = (d: number) => (n > 1 ? view.playlists[(index + d + n) % n]!.name : undefined);
  const selected = selectedKey(view.state, lists);
  const playing = view.state.playing;
  const rows = shown?.rows ?? [];
  const at = rows.findIndex((r) => r.key === selected);
  // La liste montrée : la ligne « Gestion du Juke-box » en tête, puis les morceaux (rang d'affichage = numéro).
  const shownRows: (JukeboxRowInput | undefined)[] = shown ? [undefined, ...rows] : [];
  const top = Math.min(Math.max(0, view.top), Math.max(0, shownRows.length - view.rows));
  const windowRows = shownRows.slice(top, top + view.rows).map((r, i): JukeboxRowView => {
    if (!r) {
      return {
        key: JUKEBOX_MANAGE_KEY,
        num: '',
        title: t('Gestion du Juke-box'),
        line: t('Playlists, morceaux, ajouts de YouTube ou de fichiers'),
        duration: '',
        source: 'download',
        manage: true,
        ...(selected === JUKEBOX_MANAGE_KEY ? { focus: true } : {}),
      };
    }
    const mark = markOf(r.status);
    const isPlaying = playing?.playlist === shown?.id && playing?.key === r.key;
    const ad = isPlaying && view.ad;
    return {
      key: r.key,
      num: two(top + i),
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
  // Lignes cachées avant la fenêtre (le filet du haut) ; le décompte ne dit que les morceaux.
  const before = top;
  const after = Math.max(0, shownRows.length - top - windowRows.length);

  let now: JukeboxNowView | undefined;
  if (playing) {
    const pl = view.playlists.find((p) => p.id === playing.playlist);
    const i = pl ? pl.rows.findIndex((r) => r.key === playing.key) : -1;
    const r = pl && i >= 0 ? pl.rows[i]! : undefined;
    if (pl && r) {
      const audioOnly = Boolean(view.audioOnly);
      const position = `${two(i + 1)} / ${two(pl.rows.length)}`;
      now = {
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
      };
    }
  }

  const start = startAction(view, lists, at >= 0 ? rows[at] : undefined);
  const commands: JukeboxCommandView[] = [
    { id: 'flippers', cab: t('Flippers'), desk: '↑↓', action: t('Choisir'), ...(shown ? {} : { disabled: true }) },
    { id: 'start', cab: t('Start'), desk: t('Entrée'), action: start.action, ...(start.disabled ? { disabled: true } : {}) },
    { id: 'magnasave', cab: t('MagnaSave'), desk: '←→', action: t('Playlists'), ...(n > 1 ? {} : { disabled: true }) },
    { id: 'exit', cab: t('Exit'), desk: t('Échap'), action: t('Roue · arrêt musique') },
    // Toujours rappelé : Start maintenu une seconde ouvre la gestion, depuis n'importe quel morceau.
    { id: 'manage', cab: t('Start maintenu'), desk: t('Entrée maintenue'), action: t('Gestion des playlists') },
  ];

  return {
    ...(shown
      ? {
          playlist: {
            id: shown.id,
            name: shown.name,
            count: tn(rows.length, 'Playlist · {n} morceau', 'Playlist · {n} morceaux', { n: formatNumber(rows.length) }),
            position: `${index + 1} / ${n}`,
            ...(neighbor(-1) !== undefined ? { previous: neighbor(-1)! } : {}),
            ...(neighbor(1) !== undefined ? { next: neighbor(1)! } : {}),
            quality: shown.quality,
          },
        }
      : {}),
    list: {
      head: !rows.length ? t('Aucun morceau') : at >= 0 ? t('Sélection · {at} / {count}', { at: at + 1, count: rows.length }) : tn(rows.length, 'Gestion du Juke-box · {n} morceau', 'Gestion du Juke-box · {n} morceaux', { n: formatNumber(rows.length) }),
      // Liste déjà défilée : ce qu'il y a avant et après (sinon, la légende des sources).
      ...(before ? { around: t('↑ {before} avant · {after} après ↓', { before: Math.max(0, before - 1), after }) } : {}),
      top,
      total: rows.length,
      rows: windowRows,
      before,
      after,
    },
    ...(now ? { now } : {}),
    commands,
    ...(!shown ? { empty: 'library' as const } : !rows.length ? { empty: 'playlist' as const } : {}),
    ...(view.holdSince !== undefined ? { manageHold: { since: view.holdSince, ms: JUKEBOX_MANAGE_HOLD_MS } } : {}),
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
