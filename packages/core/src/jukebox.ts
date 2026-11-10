// Juke-box : une entrée en tête de la roue des tables qui joue des playlists (maquettes validées le
// 09/11/2026). Ce module en tient le modèle et les règles, sans
// écran, sans réseau, et sans disque hors des fonctions explicites de lecture et d'écriture
// (loadJukebox, saveJukebox, readJukeboxLibrary, readSongInfos, writeSongInfos).
//
// Un morceau a une source parmi trois :
// - `online` : la vidéo YouTube jouée directement, plein écran sur le fronton ; rien sur le disque,
//   le réseau est nécessaire et YouTube peut y passer des publicités ;
// - `download` : téléchargé sur la borne, une seule fois même s'il est dans plusieurs playlists, dans
//   la bibliothèque <racine>\Musique\<identifiant YouTube>\ : son M4A, vidéo muette MP4 (lus ensemble,
//   sans ffmpeg), miniature et infos.json ;
// - `file` : un fichier choisi sur le disque, lu à son emplacement, jamais copié ; introuvable, il
//   reste dans la playlist, grisé avec sa raison (ni relocalisé, ni remplacé).
// Une playlist mélange les trois ; elle a un nom, un ordre, une qualité (1080p, 720p ou son seul) et,
// si elle vient de YouTube, sa source (identifiant, adresse) pour la resynchroniser.
//
// Un morceau en ligne dont une copie est sur la borne (téléchargé pour une autre playlist) se lit
// depuis la copie : ni réseau, ni publicité. Un morceau retiré de YouTube mais déjà sur la borne
// reste jouable, avec le repère « retiré de YouTube » (décision du 09/11/2026).
//
// L'index des playlists est écrit dans <données>\juke-box.json (écriture atomique). Les corrections
// faites à la main (artiste, album, titre) y sont gardées par morceau, et l'emportent toujours sur
// ce que disent YouTube, le fichier ou son nom. Le volume est celui de la borne : le Juke-box n'en a
// pas à lui (jukebox-play.ts).

import * as fs from 'node:fs';
import { DEFAULT_PLAY_MODE, REPEAT_MODES, type PlayMode, type RepeatMode } from './jukebox-play';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { DmdSkin, JukeboxSkins } from './jukebox-dmd';
import { formatNumber, t, tn } from './i18n';
import { readJsonFile } from './store';

export type TrackSource = 'online' | 'download' | 'file';
export const TRACK_SOURCES: readonly TrackSource[] = ['online', 'download', 'file'];

/** Qualité d'une playlist : la hauteur de la vidéo téléchargée, ou le son seul. */
export type JukeboxQuality = '1080p' | '720p' | 'audio';
export const JUKEBOX_QUALITIES: readonly JukeboxQuality[] = ['1080p', '720p', 'audio'];
export const JUKEBOX_DEFAULT_QUALITY: JukeboxQuality = '1080p';

/** Hauteur de vidéo d'une qualité (0 : son seul). */
export function qualityHeight(q: JukeboxQuality): 0 | 720 | 1080 {
  return q === '1080p' ? 1080 : q === '720p' ? 720 : 0;
}

export function qualityLabel(q: JukeboxQuality): string {
  return q === 'audio' ? t('Son seul') : q;
}

export const JUKEBOX_FILE = 'juke-box.json';
/** Bibliothèque des morceaux téléchargés, sous la racine de Cyber Pinball. */
export const JUKEBOX_LIBRARY_DIR = 'Musique'; // i18n-ignore : nom de dossier
export const SONG_INFOS_FILE = 'infos.json';
/** Noms des fichiers d'un morceau téléchargé (l'extension vient de yt-dlp). */
export const SONG_AUDIO_STEM = 'son';
export const SONG_VIDEO_STEM = 'video';
export const SONG_THUMB_STEM = 'miniature';

/** Pourquoi une vidéo YouTube ne se lit pas. */
export type UnavailableReason = 'deleted' | 'private' | 'blocked' | 'members' | 'age' | 'live' | 'login' | 'unavailable';

export function unavailableText(reason: UnavailableReason): string {
  switch (reason) {
    case 'deleted':
      return t('Vidéo supprimée');
    case 'private':
      return t('Vidéo privée');
    case 'blocked':
      return t('Bloquée dans votre pays');
    case 'members':
      return t('Réservée aux abonnés de la chaîne');
    case 'age':
      return t('Soumise à une limite d’âge');
    case 'live':
      return t('Direct ou pas encore diffusée');
    case 'login':
      return t('YouTube demande une connexion');
    default:
      return t('Vidéo indisponible');
  }
}

/** Artiste, album, titre : de yt-dlp, des étiquettes d'un fichier ou d'une correction à la main. */
export interface TrackTags {
  title?: string;
  artist?: string;
  album?: string;
}

export interface JukeboxTrack {
  /** Identifiant dans sa playlist, stable (« t12 ») : la sélection et la lecture s'y accrochent. */
  key: string;
  source: TrackSource;
  /** Identifiant YouTube (sources online et download). */
  youtube?: string;
  /** Fichier local (source file), à son emplacement. */
  path?: string;
  /** Fichier local : une vidéo, ou le son seul. */
  media?: 'video' | 'audio';
  /** Titre tel que donné par YouTube, ou nom du fichier sans extension. */
  title: string;
  /** Champs musicaux de yt-dlp (artist, album, track) ou étiquettes du fichier. */
  tags?: TrackTags;
  /** Compte qui a publié la vidéo sur YouTube (« Artiste - Topic »…), pour deviner l'artiste. */
  channel?: string;
  /** Durée en secondes. */
  duration?: number;
  /** Miniature en ligne (YouTube), montrée tant qu'il n'y en a pas sur la borne. */
  thumbnail?: string;
  /** YouTube ne la lit plus : pourquoi, et depuis quand. */
  unavailable?: { reason: UnavailableReason; detail?: string; since: string };
  /** N'est plus dans la playlist YouTube source (resynchronisation) : depuis quand. */
  removed?: string;
  /** Importé de cette liste YouTube : la resynchronisation ne marque « retiré » que ceux-là. */
  list?: string;
  added: string;
}

/** D'où vient une playlist importée de YouTube. */
export interface PlaylistOrigin {
  /** Identifiant de la liste (PL…, RD… pour un Mix, OLAK… pour un album). */
  list: string;
  url: string;
  title?: string;
  /** Source donnée aux nouveaux morceaux trouvés à la resynchronisation. */
  mode: 'online' | 'download';
  /** Mix YouTube (RD…) : sans fin, plafonné (JUKEBOX_MIX_CAP). */
  mix?: boolean;
  /** Dernière resynchronisation réussie, et ce qu'elle a trouvé. */
  synced?: string;
  found?: { added: number; removed: number };
}

export interface JukeboxPlaylist {
  id: string;
  name: string;
  quality: JukeboxQuality;
  tracks: JukeboxTrack[];
  youtube?: PlaylistOrigin;
  created: string;
  updated: string;
}

export interface JukeboxStore {
  version: 1;
  playlists: JukeboxPlaylist[];
  /** Corrections à la main, par morceau (songKey) : elles l'emportent toujours. */
  corrections: Record<string, TrackTags>;
  /** Habillage du DMD (jukebox-dmd.ts). */
  skins: JukeboxSkins;
  /** Dernier morceau joué : l'affiche du médaillon le montre. */
  last?: { playlist: string; key: string; at: string };
  /** Mode de lecture retenu de chaque playlist (aléatoire, répétition) ; absent : dans l'ordre, en boucle. */
  modes?: Record<string, PlayMode>;
}

/** Piste d'animation par défaut du DMD : le spectre (question 15 des maquettes). */
export const DEFAULT_DMD_SKIN: Extract<DmdSkin, { kind: 'animation' }> = { kind: 'animation', animation: 'spectre' };

export function emptyJukebox(): JukeboxStore {
  return { version: 1, playlists: [], corrections: {}, skins: { default: { ...DEFAULT_DMD_SKIN }, rules: [] } };
}

/** Identifiant YouTube d'une vidéo : 11 signes (lettres, chiffres, - et _). Rien d'autre n'entre dans un chemin. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const isYoutubeId = (id: unknown): id is string => typeof id === 'string' && YOUTUBE_ID.test(id);

/** Identité d'un morceau, d'une playlist à l'autre : « yt:<id> » ou « file:<chemin> ». */
export function songKey(track: Pick<JukeboxTrack, 'source' | 'youtube' | 'path'>): string {
  if (track.source === 'file') return `file:${normalizePath(track.path ?? '')}`;
  return `yt:${track.youtube ?? ''}`;
}

/** Chemin comparable : barres obliques inverses, minuscules (Windows ne distingue pas la casse). */
export function normalizePath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Lecture et écriture de l'index

export function jukeboxFile(dataDir: string): string {
  return path.join(dataDir, JUKEBOX_FILE);
}

const isQuality = (q: unknown): q is JukeboxQuality => JUKEBOX_QUALITIES.includes(q as JukeboxQuality);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

function cleanTags(v: unknown): TrackTags | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const out: TrackTags = {};
  for (const k of ['title', 'artist', 'album'] as const) if (str(r[k])) out[k] = str(r[k])!.trim();
  return Object.keys(out).length ? out : undefined;
}

function cleanTrack(v: unknown): JukeboxTrack | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Partial<JukeboxTrack>;
  if (typeof r.key !== 'string' || !TRACK_SOURCES.includes(r.source as TrackSource) || typeof r.title !== 'string') return undefined;
  if (r.source === 'file' ? !str(r.path) : !isYoutubeId(r.youtube)) return undefined;
  const tags = cleanTags(r.tags);
  const { tags: _drop, ...rest } = r;
  return { ...rest, ...(tags ? { tags } : {}), added: str(r.added) ?? new Date(0).toISOString() } as JukeboxTrack;
}

function cleanPlaylist(v: unknown): JukeboxPlaylist | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Partial<JukeboxPlaylist>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return undefined;
  const seen = new Set<string>();
  const tracks = (Array.isArray(r.tracks) ? r.tracks : []).map(cleanTrack).filter((x): x is JukeboxTrack => !!x && !seen.has(x.key) && !!seen.add(x.key));
  const yt = r.youtube && typeof r.youtube === 'object' && str(r.youtube.list) && str(r.youtube.url) ? { ...r.youtube, mode: r.youtube.mode === 'download' ? 'download' : 'online' } : undefined;
  const at = str(r.created) ?? new Date(0).toISOString();
  return { id: r.id, name: r.name, quality: isQuality(r.quality) ? r.quality : JUKEBOX_DEFAULT_QUALITY, tracks, ...(yt ? { youtube: yt as PlaylistOrigin } : {}), created: at, updated: str(r.updated) ?? at };
}

/** L'index écrit ; vide s'il est absent ou illisible. Une playlist ou un morceau illisible est oublié, jamais une erreur. */
export function loadJukebox(dataDir: string, normalizeSkins?: (raw: unknown) => JukeboxSkins): JukeboxStore {
  const file = jukeboxFile(dataDir);
  const store = emptyJukebox();
  try {
    if (!fs.existsSync(file)) return store;
    const raw = readJsonFile(file) as Partial<JukeboxStore>;
    const ids = new Set<string>();
    store.playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).map(cleanPlaylist).filter((p): p is JukeboxPlaylist => !!p && !ids.has(p.id) && !!ids.add(p.id));
    if (raw.corrections && typeof raw.corrections === 'object') {
      for (const [k, v] of Object.entries(raw.corrections)) {
        const tags = cleanTags(v);
        if (tags) store.corrections[k] = tags;
      }
    }
    if (normalizeSkins) store.skins = normalizeSkins(raw.skins);
    if (raw.last && typeof raw.last === 'object' && str(raw.last.playlist) && str(raw.last.key)) store.last = { playlist: raw.last.playlist, key: raw.last.key, at: str(raw.last.at) ?? '' };
    // Modes de lecture : ceux d'une playlist qui existe, aux valeurs connues.
    if (raw.modes && typeof raw.modes === 'object') {
      const modes: Record<string, PlayMode> = {};
      for (const [id, m] of Object.entries(raw.modes as Record<string, Partial<PlayMode>>)) {
        if (!ids.has(id) || !m || typeof m !== 'object') continue;
        modes[id] = { shuffle: m.shuffle === true, repeat: REPEAT_MODES.includes(m.repeat as RepeatMode) ? (m.repeat as RepeatMode) : DEFAULT_PLAY_MODE.repeat };
      }
      if (Object.keys(modes).length) store.modes = modes;
    }
  } catch {
    return emptyJukebox();
  }
  return store;
}

/** Écrit l'index d'un coup (fichier temporaire puis renommé) : une coupure de courant ne le tronque pas. */
export function saveJukebox(dataDir: string, store: JukeboxStore): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(jukeboxFile(dataDir), `${JSON.stringify(store, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Bibliothèque des morceaux téléchargés

export function libraryDir(root: string): string {
  return path.join(root, JUKEBOX_LIBRARY_DIR);
}

/** Dossier d'un morceau ; refuse tout identifiant qui ne serait pas celui d'une vidéo YouTube. */
export function songDir(root: string, id: string): string {
  if (!isYoutubeId(id)) throw new Error(`identifiant YouTube invalide : ${id}`); // i18n-ignore : erreur de programmation
  return path.join(libraryDir(root), id);
}

/** Ce que infos.json garde d'un morceau téléchargé. */
export interface SongInfos {
  id: string;
  title: string;
  /** Champs musicaux de yt-dlp. */
  artist?: string;
  album?: string;
  track?: string;
  channel?: string;
  duration?: number;
  url: string;
  /** Hauteur de la vidéo téléchargée. */
  height?: number;
  /** Écrit le. */
  fetched: string;
}

/** Un morceau de la bibliothèque, tel qu'il est sur le disque. */
export interface LibrarySong {
  id: string;
  dir: string;
  audio?: string;
  video?: string;
  thumbnail?: string;
  audioBytes: number;
  videoBytes: number;
  /** Tout le dossier (miniature, infos et partiels compris). */
  bytes: number;
  /** Hauteur de la vidéo (infos.json). */
  height?: number;
  infos?: SongInfos;
}

const AUDIO_EXT = /^(m4a|mp4|webm|opus|mp3|ogg|aac)$/i;
const VIDEO_EXT = /^(mp4|webm|mkv)$/i;
const IMAGE_EXT = /^(jpg|jpeg|png|webp)$/i;

/** Rôle d'un nom de fichier du dossier d'un morceau ; les partiels (.part, .ytdl, -Frag) n'en ont pas. */
export function songFileRole(name: string): 'audio' | 'video' | 'thumbnail' | 'infos' | undefined {
  if (/\.(part|ytdl|temp|tmp)$/i.test(name) || /\.part-Frag\d+/i.test(name)) return undefined;
  if (name.toLowerCase() === SONG_INFOS_FILE) return 'infos';
  const m = /^([^.]+)\.([^.]+)$/.exec(name);
  if (!m) return undefined;
  const [, stem, ext] = m as unknown as [string, string, string];
  if (stem.toLowerCase() === SONG_AUDIO_STEM && AUDIO_EXT.test(ext)) return 'audio';
  if (stem.toLowerCase() === SONG_VIDEO_STEM && VIDEO_EXT.test(ext)) return 'video';
  if (stem.toLowerCase() === SONG_THUMB_STEM && IMAGE_EXT.test(ext)) return 'thumbnail';
  return undefined;
}

export function readSongInfos(dir: string): SongInfos | undefined {
  try {
    const raw = readJsonFile(path.join(dir, SONG_INFOS_FILE)) as Partial<SongInfos>;
    if (!isYoutubeId(raw.id) || typeof raw.title !== 'string') return undefined;
    return raw as SongInfos;
  } catch {
    return undefined;
  }
}

export function writeSongInfos(dir: string, infos: SongInfos): void {
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(path.join(dir, SONG_INFOS_FILE), `${JSON.stringify(infos, null, 2)}\n`);
}

/** Un dossier de morceau, relu sur le disque. */
export function readLibrarySong(dir: string): LibrarySong | undefined {
  const id = path.basename(dir);
  if (!isYoutubeId(id)) return undefined;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const song: LibrarySong = { id, dir, audioBytes: 0, videoBytes: 0, bytes: 0 };
  for (const name of names) {
    const file = path.join(dir, name);
    let size = 0;
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) continue;
      size = st.size;
    } catch {
      continue;
    }
    song.bytes += size;
    const role = songFileRole(name);
    if (role === 'audio' && size > 0) [song.audio, song.audioBytes] = [file, size];
    else if (role === 'video' && size > 0) [song.video, song.videoBytes] = [file, size];
    else if (role === 'thumbnail') song.thumbnail = file;
  }
  const infos = readSongInfos(dir);
  if (infos) {
    song.infos = infos;
    if (infos.height) song.height = infos.height;
  }
  return song;
}

/** La bibliothèque entière : un morceau par dossier nommé d'après son identifiant YouTube. */
export function readJukeboxLibrary(root: string): Map<string, LibrarySong> {
  const out = new Map<string, LibrarySong>();
  let names: string[] = [];
  try {
    names = fs.readdirSync(libraryDir(root));
  } catch {
    return out;
  }
  for (const name of names) {
    const song = isYoutubeId(name) ? readLibrarySong(path.join(libraryDir(root), name)) : undefined;
    if (song) out.set(song.id, song);
  }
  return out;
}

/** Un morceau de la bibliothèque est complet pour cette hauteur de vidéo (0 : le son suffit). */
export function songComplete(song: LibrarySong | undefined, height: number): boolean {
  return Boolean(song?.audio && (height === 0 || song.video));
}

// ---------------------------------------------------------------------------
// Artiste, album, titre

/** Mentions retirées d'un titre YouTube : « (Official Video) », « [Clip officiel] », « (Lyrics) »… */
const MENTION_WORDS = /\b(official|officiel|officielle|lyrics?|paroles|visuali[sz]er|clip|music\s+video|video\s+clip|audio|video|vid[ée]o|hd|hq|4k|1080p|720p|mv|m\/v)\b/i;
const BRACKETS = /\s*[([{【]([^()[\]{}【】]*)[)\]}】]/g;
const TRAILING = /\s*[|｜]\s*(official|officiel|clip|lyrics?|audio|video|vid[ée]o)\b.*$/i;
const SEPARATOR = /\s+[-–—~]\s+|\s+[|｜]\s+/;

/** Titre sans mentions de type « (Official Video) » ; ce qui reste d'utile (« (Live) », « (Remix) ») est gardé. */
export function stripMentions(title: string): string {
  let out = title.replace(BRACKETS, (whole, inner: string) => (MENTION_WORDS.test(inner) && !/\b(live|remix|mix|edit|version|acoustic|acoustique|feat|ft)\b/i.test(inner) ? '' : whole));
  out = out.replace(TRAILING, '');
  return out.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, '').trim();
}

/** Artiste tiré du nom de la chaîne : « Artiste - Topic » (chaînes musicales de YouTube), « ArtisteVEVO ». */
export function channelArtist(channel: string | undefined): string | undefined {
  if (!channel) return undefined;
  const topic = /^(.*?)\s+-\s+Topic$/i.exec(channel);
  if (topic) return topic[1]!.trim() || undefined;
  const vevo = /^(.+?)\s*VEVO$/.exec(channel);
  if (vevo) return vevo[1]!.trim() || undefined;
  return undefined;
}

/**
 * Artiste et titre d'après un titre « Artiste - Titre » (tirets, barre verticale), mentions retirées ;
 * sans séparateur, l'artiste vient de la chaîne quand elle est musicale (« Artiste - Topic »).
 */
export function parseMusicTitle(raw: string, channel?: string): { artist?: string; title: string } {
  const clean = stripMentions(raw);
  const parts = clean.split(SEPARATOR);
  if (parts.length >= 2 && parts[0]!.trim() && parts.slice(1).join(' - ').trim()) {
    return { artist: parts[0]!.trim(), title: stripMentions(parts.slice(1).join(' - ')).replace(/^["“«]\s*|\s*["”»]$/g, '') };
  }
  const artist = channelArtist(channel);
  return { ...(artist ? { artist } : {}), title: clean || raw.trim() };
}

/** Titre tiré d'un nom de fichier : extension retirée, « 01 - », « 01. » en tête retirés, soulignés en espaces. */
export function localFileTitle(file: string): string {
  const base = path.basename(file.replace(/\\/g, '/')).replace(/\.[^.]+$/, '');
  return base.replace(/_/g, ' ').replace(/^\s*\d{1,3}\s*[-.)]\s*/, '').replace(/\s{2,}/g, ' ').trim() || base;
}

export interface TrackInfo {
  title: string;
  artist?: string;
  album?: string;
  /** D'où vient chaque champ : correction à la main, champs musicaux, déduction du titre. */
  from: { title: 'manual' | 'tags' | 'title'; artist?: 'manual' | 'tags' | 'title' | 'channel'; album?: 'manual' | 'tags' };
}

/**
 * Artiste, album et titre d'un morceau. Dans l'ordre : la correction à la main (toujours), les champs
 * musicaux de yt-dlp ou les étiquettes du fichier, puis ce que dit le titre (« Artiste - Titre »,
 * mentions retirées) ou le nom du fichier ; l'artiste, à défaut, d'après la chaîne musicale.
 */
export function trackInfo(track: JukeboxTrack, corrections: Readonly<Record<string, TrackTags>> = {}): TrackInfo {
  const manual = corrections[songKey(track)] ?? {};
  const tags = track.tags ?? {};
  const raw = track.source === 'file' ? localFileTitle(track.path ?? track.title) : track.title;
  const guessed = parseMusicTitle(raw, track.source === 'file' ? undefined : track.channel);
  const from: TrackInfo['from'] = { title: manual.title ? 'manual' : tags.title ? 'tags' : 'title' };
  const title = manual.title ?? tags.title ?? guessed.title;
  let artist: string | undefined;
  if (manual.artist) [artist, from.artist] = [manual.artist, 'manual'];
  else if (tags.artist) [artist, from.artist] = [tags.artist, 'tags'];
  else if (guessed.artist) [artist, from.artist] = [guessed.artist, raw.split(SEPARATOR).length >= 2 ? 'title' : 'channel'];
  let album: string | undefined;
  if (manual.album) [album, from.album] = [manual.album, 'manual'];
  else if (tags.album) [album, from.album] = [tags.album, 'tags'];
  return { title, ...(artist ? { artist } : {}), ...(album ? { album } : {}), from };
}

/** Champs musicaux d'une réponse de yt-dlp (artist, album, track, creator…), sans les vides. */
export function musicTags(info: Partial<Record<'artist' | 'artists' | 'creator' | 'album' | 'track', unknown>>): TrackTags | undefined {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).join(', ') : str(v));
  const out: TrackTags = {};
  const artist = list(info.artist) ?? list(info.artists) ?? list(info.creator);
  if (artist) out.artist = artist.trim();
  if (str(info.album)) out.album = String(info.album).trim();
  if (str(info.track)) out.title = String(info.track).trim();
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------
// Temps

/** Durée d'un morceau : « 3:07 », « 1:02:03 ». */
export function formatTrackTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Durée d'une playlist : « 5 h 42 », « 42 min ». */
export function formatTotalTime(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 60) return t('{m} min', { m: formatNumber(minutes) });
  return t('{h} h {m}', { h: formatNumber(Math.floor(minutes / 60)), m: String(minutes % 60).padStart(2, '0') });
}

// ---------------------------------------------------------------------------
// État de chaque morceau, pour les écrans

/** Un téléchargement de morceau, tel que la file le voit (jukebox-youtube.ts, songDownloads). */
export interface SongDownload {
  state: 'running' | 'queued' | 'waiting' | 'paused' | 'failed';
  /** 0 à 99 tant qu'il n'est pas fini. */
  percent?: number;
  /** Pourquoi il attend ou a échoué. */
  reason?: string;
}

export type TrackStatusKind =
  /** Jouable. */
  | 'playable'
  /** En téléchargement, avec le pourcentage. */
  | 'downloading'
  /** Téléchargement en attente (à suivre, en pause, source muette). */
  | 'waiting'
  /** Source « download » : pas encore sur la borne, rien en cours. */
  | 'pending'
  /** Source « online » sans réseau. */
  | 'offline'
  /** Fichier local introuvable. */
  | 'missing'
  /** Indisponible, avec sa raison (vidéo privée, supprimée, téléchargement refusé…). */
  | 'unavailable'
  /** Retiré de YouTube (ou devenu indisponible), mais jouable depuis la borne. */
  | 'removed';

export interface TrackStatus {
  kind: TrackStatusKind;
  playable: boolean;
  /** Ce qui se lit : la copie sur la borne, YouTube en direct, ou le fichier local. */
  play?: 'local' | 'online' | 'file';
  /** Téléchargement en cours. */
  percent?: number;
  /** Libellé court, jamais la couleur seule : « Téléchargement · 42 % », « Vidéo privée ». */
  label: string;
  /** Raison en clair, quand il n'est pas jouable (ou repère quand il l'est malgré tout). */
  reason?: string;
}

export interface StatusContext {
  library: ReadonlyMap<string, LibrarySong>;
  /** Téléchargements en cours ou en échec, par identifiant YouTube. */
  downloads?: ReadonlyMap<string, SongDownload>;
  /** Le réseau est là (YouTube joignable). */
  online: boolean;
  /** Un fichier local existe. */
  fileExists(file: string): boolean;
  /** Le lecteur d'un chemin existe (« E:\ ») : sinon, disque débranché. */
  driveExists?(file: string): boolean;
}

/** Raison d'un fichier local introuvable : disque débranché, ou fichier déplacé ou supprimé. */
export function missingFileReason(file: string, driveExists?: (file: string) => boolean): string {
  return driveExists && !driveExists(file) ? t('Fichier introuvable · disque débranché') : t('Fichier introuvable · déplacé ou supprimé');
}

function downloadStatus(d: SongDownload): TrackStatus {
  if (d.state === 'running' && d.percent !== undefined) return { kind: 'downloading', playable: false, percent: d.percent, label: t('Téléchargement · {pct} %', { pct: formatNumber(d.percent) }), reason: t('En téléchargement · {pct} %', { pct: formatNumber(d.percent) }) };
  if (d.state === 'running') return { kind: 'downloading', playable: false, label: t('Téléchargement'), reason: t('En téléchargement') };
  if (d.state === 'paused') return { kind: 'waiting', playable: false, ...(d.percent !== undefined ? { percent: d.percent } : {}), label: t('En pause'), reason: t('Téléchargement en pause') };
  if (d.state === 'waiting') return { kind: 'waiting', playable: false, ...(d.percent !== undefined ? { percent: d.percent } : {}), label: t('En attente'), reason: d.reason ?? t('Téléchargement en attente') };
  return { kind: 'waiting', playable: false, label: t('En attente'), reason: t('Téléchargement à suivre') };
}

/**
 * État d'un morceau : ce que les écrans montrent (jouable, grisé avec sa raison, progression) et ce
 * que Start peut en faire. `height` : hauteur de vidéo voulue par la playlist (0 : son seul).
 */
export function trackStatus(track: JukeboxTrack, ctx: StatusContext, height = 1080): TrackStatus {
  if (track.source === 'file') {
    if (track.path && ctx.fileExists(track.path)) return { kind: 'playable', playable: true, play: 'file', label: t('Fichier local') };
    const reason = missingFileReason(track.path ?? '', ctx.driveExists);
    return { kind: 'missing', playable: false, label: t('Fichier introuvable'), reason };
  }
  const song = track.youtube ? ctx.library.get(track.youtube) : undefined;
  const local = Boolean(song?.audio);
  const gone = track.removed ? t('Retiré de YouTube') : track.unavailable ? unavailableText(track.unavailable.reason) : undefined;
  const download = track.youtube ? ctx.downloads?.get(track.youtube) : undefined;
  const localStatus = (): TrackStatus => (gone ? { kind: 'removed', playable: true, play: 'local', label: t('Retiré de YouTube · sur la borne'), reason: gone } : { kind: 'playable', playable: true, play: 'local', label: t('Sur la borne') });
  if (track.source === 'download') {
    if (songComplete(song, height)) return localStatus();
    if (download && download.state !== 'failed') return downloadStatus(download);
    // Le son est là, la vidéo manque (qualité relevée depuis) : jouable, avec la pochette.
    if (local) return localStatus();
    if (gone) return { kind: 'unavailable', playable: false, label: gone, reason: gone };
    if (download?.state === 'failed') return { kind: 'unavailable', playable: false, label: t('Téléchargement impossible'), reason: download.reason ?? t('Téléchargement impossible') };
    return { kind: 'pending', playable: false, label: t('Pas encore sur la borne'), reason: t('Pas encore téléchargé : « Tout télécharger » dans la gestion des playlists') };
  }
  // En ligne : une copie sur la borne (téléchargée pour une autre playlist) se lit d'abord.
  if (local) return localStatus();
  if (gone) return { kind: 'unavailable', playable: false, label: gone, reason: gone };
  if (!ctx.online) return { kind: 'offline', playable: false, label: t('Hors ligne'), reason: t('Hors ligne : ce morceau se lit sur YouTube') };
  return { kind: 'playable', playable: true, play: 'online', label: t('En ligne') };
}

// ---------------------------------------------------------------------------
// Place sur le disque

export interface PlaylistUsage {
  /** Morceaux de la playlist (entrées). */
  entries: number;
  /** Morceaux sur la borne qu'elle utilise, et leur place (un morceau partagé compte dans chacune). */
  songs: number;
  bytes: number;
  /** Ce que « Libérer la place » rendrait : les morceaux qu'aucune autre playlist ne veut téléchargés. */
  freeable: number;
  /** Fichiers locaux de la playlist (lus sur place, jamais comptés). */
  files: number;
}

export interface JukeboxUsage {
  /** Entrées de toutes les playlists : ce qu'on affiche (« 86 morceaux »). */
  entries: number;
  /** Morceaux distincts. */
  unique: number;
  /** Durée de toutes les entrées. */
  duration: number;
  /** Place de la bibliothèque : chaque fichier une seule fois. */
  bytes: number;
  playlists: Map<string, PlaylistUsage>;
  /** Morceaux sur la borne qu'aucune playlist n'utilise plus, et leur place. */
  orphans: string[];
  orphanBytes: number;
}

/** Morceaux YouTube voulus téléchargés, par identifiant, avec les playlists qui les veulent ainsi. */
export function downloadWanters(store: Pick<JukeboxStore, 'playlists'>): Map<string, JukeboxPlaylist[]> {
  const out = new Map<string, JukeboxPlaylist[]>();
  for (const p of store.playlists) for (const tr of p.tracks) if (tr.source === 'download' && tr.youtube) out.set(tr.youtube, [...(out.get(tr.youtube) ?? []), p].filter((x, i, a) => a.indexOf(x) === i));
  return out;
}

/**
 * Place prise. On affiche le nombre d'entrées des playlists (question 9 des maquettes), mais le total
 * disque compte chaque fichier une seule fois : les totaux par playlist ne s'additionnent pas.
 */
export function jukeboxUsage(store: Pick<JukeboxStore, 'playlists'>, library: ReadonlyMap<string, LibrarySong>): JukeboxUsage {
  const wanters = downloadWanters(store);
  const used = new Set<string>();
  const keys = new Set<string>();
  const out: JukeboxUsage = { entries: 0, unique: 0, duration: 0, bytes: 0, playlists: new Map(), orphans: [], orphanBytes: 0 };
  for (const p of store.playlists) {
    const u: PlaylistUsage = { entries: p.tracks.length, songs: 0, bytes: 0, freeable: 0, files: 0 };
    const mine = new Set<string>();
    for (const tr of p.tracks) {
      out.entries++;
      out.duration += tr.duration ?? 0;
      keys.add(songKey(tr));
      if (tr.source === 'file') u.files++;
      if (!tr.youtube || mine.has(tr.youtube)) continue;
      mine.add(tr.youtube);
      const song = library.get(tr.youtube);
      if (!song) continue;
      used.add(tr.youtube);
      u.songs++;
      u.bytes += song.bytes;
      const others = (wanters.get(tr.youtube) ?? []).filter((x) => x.id !== p.id);
      if (!others.length) u.freeable += song.bytes;
    }
    out.playlists.set(p.id, u);
  }
  out.unique = keys.size;
  for (const song of library.values()) {
    out.bytes += song.bytes;
    if (!used.has(song.id)) {
      out.orphans.push(song.id);
      out.orphanBytes += song.bytes;
    }
  }
  return out;
}

/** « 4 playlists · 86 morceaux · 5 h 42 », l'affiche du médaillon. */
export function jukeboxSummary(store: Pick<JukeboxStore, 'playlists'>): string {
  const entries = store.playlists.reduce((n, p) => n + p.tracks.length, 0);
  const duration = store.playlists.reduce((n, p) => n + p.tracks.reduce((m, tr) => m + (tr.duration ?? 0), 0), 0);
  if (!store.playlists.length) return t('Aucune playlist');
  return [tn(store.playlists.length, '{n} playlist', '{n} playlists'), tn(entries, '{n} morceau', '{n} morceaux'), ...(duration ? [formatTotalTime(duration)] : [])].join(' · ');
}

// ---------------------------------------------------------------------------
// Les playlists

export const PLAYLIST_NAME_MAX = 60;

export type StoreChange<T = object> = ({ ok: true; store: JukeboxStore } & T) | { ok: false; reason: string };

const touch = (p: JukeboxPlaylist, now: Date): JukeboxPlaylist => ({ ...p, updated: now.toISOString() });

function replacePlaylist(store: JukeboxStore, p: JukeboxPlaylist): JukeboxStore {
  return { ...store, playlists: store.playlists.map((x) => (x.id === p.id ? p : x)) };
}

export function findPlaylist(store: Pick<JukeboxStore, 'playlists'>, id: string): JukeboxPlaylist | undefined {
  return store.playlists.find((p) => p.id === id);
}

/** Nom accepté : 1 à 60 signes, pas déjà pris (sans tenir compte de la casse). */
export function playlistNameProblem(store: Pick<JukeboxStore, 'playlists'>, name: string, except?: string): string | undefined {
  const n = name.trim();
  if (!n) return t('Donnez un nom à la playlist');
  if (n.length > PLAYLIST_NAME_MAX) return t('Nom trop long : {max} signes au plus', { max: PLAYLIST_NAME_MAX });
  if (store.playlists.some((p) => p.id !== except && p.name.trim().toLowerCase() === n.toLowerCase())) return t('Une playlist porte déjà ce nom');
  return undefined;
}

function nextPlaylistId(store: Pick<JukeboxStore, 'playlists'>): string {
  const n = store.playlists.reduce((m, p) => Math.max(m, Number(/^pl(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  return `pl${n + 1}`;
}

/** Clés libres d'une playlist (« t1 », « t2 »…), sans jamais reprendre celle d'un morceau retiré depuis le chargement. */
export function nextTrackKeys(p: Pick<JukeboxPlaylist, 'tracks'>, count: number): string[] {
  let n = p.tracks.reduce((m, tr) => Math.max(m, Number(/^t(\d+)$/.exec(tr.key)?.[1] ?? 0)), 0);
  return Array.from({ length: count }, () => `t${++n}`);
}

export function createPlaylist(store: JukeboxStore, name: string, now: Date, opts: { quality?: JukeboxQuality; youtube?: PlaylistOrigin } = {}): StoreChange<{ playlist: JukeboxPlaylist }> {
  const problem = playlistNameProblem(store, name);
  if (problem) return { ok: false, reason: problem };
  const at = now.toISOString();
  const playlist: JukeboxPlaylist = { id: nextPlaylistId(store), name: name.trim(), quality: opts.quality ?? JUKEBOX_DEFAULT_QUALITY, tracks: [], ...(opts.youtube ? { youtube: opts.youtube } : {}), created: at, updated: at };
  return { ok: true, store: { ...store, playlists: [...store.playlists, playlist] }, playlist };
}

export function renamePlaylist(store: JukeboxStore, id: string, name: string, now: Date): StoreChange {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const problem = playlistNameProblem(store, name, id);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, store: replacePlaylist(store, touch({ ...p, name: name.trim() }, now)) };
}

/**
 * Retire une playlist : ni ses fichiers locaux ni la playlist YouTube ne sont touchés. Rend les
 * morceaux téléchargés qu'aucune autre playlist ne veut plus (leur place peut être rendue, sur demande).
 */
export function deletePlaylist(store: JukeboxStore, id: string): StoreChange<{ orphans: string[] }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const next: JukeboxStore = { ...store, playlists: store.playlists.filter((x) => x.id !== id), ...(store.last?.playlist === id ? { last: undefined } : {}) };
  const still = new Set(next.playlists.flatMap((x) => x.tracks.map((tr) => tr.youtube).filter(Boolean)));
  const orphans = [...new Set(p.tracks.filter((tr) => tr.youtube && !still.has(tr.youtube)).map((tr) => tr.youtube!))];
  return { ok: true, store: next, orphans };
}

/** Déplace une playlist d'un rang (−1 : vers le haut), sans boucler. */
export function movePlaylist(store: JukeboxStore, id: string, delta: number): JukeboxStore {
  const i = store.playlists.findIndex((p) => p.id === id);
  const j = Math.min(store.playlists.length - 1, Math.max(0, i + delta));
  if (i < 0 || i === j) return store;
  const list = [...store.playlists];
  const [p] = list.splice(i, 1);
  list.splice(j, 0, p!);
  return { ...store, playlists: list };
}

/** Morceaux à télécharger (ou à compléter) pour qu'une playlist soit entièrement sur la borne. */
export function missingDownloads(p: JukeboxPlaylist, library: ReadonlyMap<string, LibrarySong>, store?: Pick<JukeboxStore, 'playlists'>): string[] {
  const out: string[] = [];
  for (const tr of p.tracks) {
    if (tr.source !== 'download' || !tr.youtube || out.includes(tr.youtube)) continue;
    if (tr.removed || tr.unavailable) continue;
    const height = store ? wantedHeight(store, tr.youtube) : qualityHeight(p.quality);
    if (!songComplete(library.get(tr.youtube), height)) out.push(tr.youtube);
  }
  return out;
}

/**
 * Hauteur de vidéo à garder pour un morceau : la meilleure des playlists qui le veulent téléchargé
 * (un morceau partagé n'est stocké qu'une fois, dans la meilleure qualité demandée).
 */
export function wantedHeight(store: Pick<JukeboxStore, 'playlists'>, id: string): 0 | 720 | 1080 {
  let h: 0 | 720 | 1080 = 0;
  for (const p of downloadWanters(store).get(id) ?? []) {
    const q = qualityHeight(p.quality);
    if (q > h) h = q;
  }
  return h;
}

/**
 * Change la qualité. En passant au son seul, propose de libérer les vidéos déjà téléchargées
 * (`savings`) : celles qu'aucune autre playlist ne veut, avec la place gagnée ; rien n'est effacé
 * ici. En la relevant, `download` : les morceaux dont la vidéo manque.
 */
export function setPlaylistQuality(
  store: JukeboxStore,
  id: string,
  quality: JukeboxQuality,
  library: ReadonlyMap<string, LibrarySong>,
  now: Date,
): StoreChange<{ savings?: { songs: string[]; bytes: number }; download: string[] }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const next = replacePlaylist(store, touch({ ...p, quality }, now));
  const updated = findPlaylist(next, id)!;
  if (quality === 'audio') {
    const songs: string[] = [];
    let bytes = 0;
    for (const tr of updated.tracks) {
      if (tr.source !== 'download' || !tr.youtube || songs.includes(tr.youtube)) continue;
      const song = library.get(tr.youtube);
      if (!song?.video || wantedHeight(next, tr.youtube) > 0) continue;
      songs.push(tr.youtube);
      bytes += song.videoBytes;
    }
    return { ok: true, store: next, ...(songs.length ? { savings: { songs, bytes } } : {}), download: [] };
  }
  return { ok: true, store: next, download: missingDownloads(updated, library, next) };
}

/**
 * Ajoute des morceaux à une playlist, à la fin, sans doublon (un morceau déjà présent, même d'une
 * autre source, est compté à part).
 */
export function addTracks(store: JukeboxStore, id: string, tracks: readonly Omit<JukeboxTrack, 'key'>[], now: Date): StoreChange<{ added: JukeboxTrack[]; duplicates: number }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const have = new Set(p.tracks.map(songKey));
  const fresh: Omit<JukeboxTrack, 'key'>[] = [];
  for (const tr of tracks) {
    const k = songKey(tr);
    if (have.has(k)) continue;
    have.add(k);
    fresh.push(tr);
  }
  const keys = nextTrackKeys(p, fresh.length);
  const added = fresh.map((tr, i) => ({ ...tr, key: keys[i]! }) as JukeboxTrack);
  return { ok: true, store: replacePlaylist(store, touch({ ...p, tracks: [...p.tracks, ...added] }, now)), added, duplicates: tracks.length - fresh.length };
}

export function removeTrack(store: JukeboxStore, id: string, key: string, now: Date): JukeboxStore {
  const p = findPlaylist(store, id);
  if (!p || !p.tracks.some((tr) => tr.key === key)) return store;
  return replacePlaylist(store, touch({ ...p, tracks: p.tracks.filter((tr) => tr.key !== key) }, now));
}

export function moveTrack(store: JukeboxStore, id: string, key: string, delta: number, now: Date): JukeboxStore {
  const p = findPlaylist(store, id);
  const i = p?.tracks.findIndex((tr) => tr.key === key) ?? -1;
  if (!p || i < 0) return store;
  const j = Math.min(p.tracks.length - 1, Math.max(0, i + delta));
  if (i === j) return store;
  const tracks = [...p.tracks];
  const [tr] = tracks.splice(i, 1);
  tracks.splice(j, 0, tr!);
  return replacePlaylist(store, touch({ ...p, tracks }, now));
}

/** Correction à la main d'un morceau, valable dans toutes ses playlists ; un champ vide la retire. */
export function setCorrection(store: JukeboxStore, key: string, tags: TrackTags): JukeboxStore {
  const merged: TrackTags = { ...store.corrections[key] };
  for (const k of ['title', 'artist', 'album'] as const) {
    if (!(k in tags)) continue;
    const v = tags[k]?.trim();
    if (v) merged[k] = v;
    else delete merged[k];
  }
  const corrections = { ...store.corrections };
  if (Object.keys(merged).length) corrections[key] = merged;
  else delete corrections[key];
  return { ...store, corrections };
}

/**
 * « Tout télécharger » : les morceaux YouTube de la playlist passent sur la borne (les fichiers
 * locaux gardent leur source). `enqueue` : ceux qu'il faut télécharger.
 */
export function downloadAll(store: JukeboxStore, id: string, library: ReadonlyMap<string, LibrarySong>, now: Date): StoreChange<{ enqueue: string[] }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const tracks = p.tracks.map((tr) => (tr.source === 'online' ? { ...tr, source: 'download' as const } : tr));
  const updated = touch({ ...p, tracks, ...(p.youtube ? { youtube: { ...p.youtube, mode: 'download' as const } } : {}) }, now);
  const next = replacePlaylist(store, updated);
  return { ok: true, store: next, enqueue: missingDownloads(updated, library, next) };
}

/**
 * « Libérer la place » : les morceaux téléchargés de la playlist repassent en ligne. `remove` : les
 * dossiers qu'aucune autre playlist ne veut plus sur la borne, et leur place (à effacer par
 * l'application) ; un morceau partagé reste sur le disque.
 */
export function freePlaylist(store: JukeboxStore, id: string, library: ReadonlyMap<string, LibrarySong>, now: Date): StoreChange<{ remove: string[]; bytes: number }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  const tracks = p.tracks.map((tr) => (tr.source === 'download' ? { ...tr, source: 'online' as const } : tr));
  const next = replacePlaylist(store, touch({ ...p, tracks, ...(p.youtube ? { youtube: { ...p.youtube, mode: 'online' as const } } : {}) }, now));
  const wanted = downloadWanters(next);
  const remove = [...new Set(p.tracks.filter((tr) => tr.source === 'download' && tr.youtube && !wanted.has(tr.youtube) && library.has(tr.youtube)).map((tr) => tr.youtube!))];
  return { ok: true, store: next, remove, bytes: remove.reduce((n, id2) => n + (library.get(id2)?.bytes ?? 0), 0) };
}

/** Morceaux de la bibliothèque qu'aucune playlist n'utilise plus (nettoyage proposé, jamais automatique). */
export function orphanSongs(store: Pick<JukeboxStore, 'playlists'>, library: ReadonlyMap<string, LibrarySong>): string[] {
  const used = new Set(store.playlists.flatMap((p) => p.tracks.map((tr) => tr.youtube).filter(Boolean)));
  return [...library.keys()].filter((id) => !used.has(id));
}

/** Retient les modes de lecture des playlists (ceux d'une playlist supprimée sont oubliés). */
export function rememberPlayModes(store: JukeboxStore, modes: Record<string, PlayMode> | undefined): JukeboxStore {
  const kept = Object.fromEntries(Object.entries(modes ?? {}).filter(([id]) => store.playlists.some((p) => p.id === id)));
  const { modes: _old, ...rest } = store;
  return Object.keys(kept).length ? { ...rest, modes: kept } : rest;
}

/** Retient le dernier morceau joué (l'affiche du médaillon). */
export function rememberPlayed(store: JukeboxStore, playlist: string, key: string, now: Date): JukeboxStore {
  return { ...store, last: { playlist, key, at: now.toISOString() } };
}
