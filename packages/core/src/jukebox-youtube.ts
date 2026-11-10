// Juke-box et YouTube (jukebox.ts) : lire une playlist sans rien télécharger, l'importer, la
// resynchroniser, et télécharger ses morceaux par la file des téléchargements. Ce module ne fait
// rien sur le réseau : app/src/jukebox-library.ts lance yt-dlp (ytdlp-tool.ts) et lui passe ce
// qu'il a lu.
//
// Lecture d'une playlist : `yt-dlp --flat-playlist -J`, une seule requête par page de 100 vidéos,
// sans ouvrir chaque vidéo : titres, durées, chaînes, miniatures, nombre de morceaux. Les vidéos
// privées ou supprimées y figurent sous « [Private video] », « [Deleted video] » : signalées avec
// leur raison. Ce que la liste ne dit pas (bloquée dans votre pays, réservée aux abonnés, champs
// musicaux artist, album, track) vient d'une seconde lecture, vidéo par vidéo, sans téléchargement
// (`--skip-download --print`), faite pour les morceaux retenus. Un Mix YouTube (liste « RD… ») est
// sans fin : il est plafonné à JUKEBOX_MIX_CAP morceaux.
//
// Téléchargement : un téléchargement de la file par playlist (« Juke-box · Néon nocturne :
// 21 morceaux »), deux fichiers par morceau, le son M4A et la vidéo muette MP4 (sans ffmpeg, rien à
// assembler), dans <racine>\Musique\<identifiant>\ sous un nom fixe (son.m4a, video.mp4) : le
// partiel de yt-dlp garde son nom d'une session à l'autre et reprend. Chaque fichier est facultatif :
// une vidéo devenue privée est sautée avec sa raison, les autres morceaux arrivent. Un morceau déjà
// sur la borne, ou déjà dans un téléchargement en cours, n'est jamais demandé deux fois.

import * as path from 'node:path';
import { downloadReasonText, fileReceived, isActive, type DownloadJob, type DownloadReturn } from './downloadqueue';
import type { DownloadSpec } from './downloadmanager';
import { t, tn } from './i18n';
import {
  addTracks,
  createPlaylist,
  findPlaylist,
  isYoutubeId,
  missingDownloads,
  musicTags,
  qualityHeight,
  songComplete,
  songDir,
  SONG_AUDIO_STEM,
  SONG_VIDEO_STEM,
  unavailableText,
  wantedHeight,
  type JukeboxPlaylist,
  type JukeboxQuality,
  type JukeboxStore,
  type JukeboxTrack,
  type LibrarySong,
  type SongDownload,
  type StoreChange,
  type UnavailableReason,
} from './jukebox';
import { YTDLP_INFO_FIELDS, YTDLP_INFO_MARK, YTDLP_VIDEO_FORMATS } from './ytdlp';

/** Plafond d'un Mix YouTube (liste « RD… », sans fin). */
export const JUKEBOX_MIX_CAP = 50;

// ---------------------------------------------------------------------------
// Le lien

export interface PlaylistLink {
  list: string;
  /** Adresse canonique de la playlist. */
  url: string;
  mix: boolean;
  /** Playlist personnelle du compte (J'aime, À regarder plus tard) : lisible avec le compte YouTube seulement. */
  personal?: boolean;
}

/** Playlists personnelles d'un compte : J'aime (LL), À regarder plus tard (WL), Titres aimés de YouTube Music (LM). */
export const PERSONAL_LISTS = ['LL', 'WL', 'LM'] as const;

/**
 * Identifiant de playlist tapé seul : PL… (playlist d'une chaîne), OLAK5uy_… (album de YouTube
 * Music), RD… (Mix), UU… (vidéos d'une chaîne), FL…, OL…, ou une playlist personnelle. Jamais
 * 11 caractères sans l'un de ces débuts : c'est alors une vidéo.
 */
export function isPlaylistId(text: string): boolean {
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(text)) return false;
  if ((PERSONAL_LISTS as readonly string[]).includes(text)) return true;
  return text.length >= 12 && PLAYLIST_START.test(text);
}

/** Débuts des identifiants de playlist (une vidéo a 11 caractères quelconques). */
const PLAYLIST_START = /^(PL|OL|RD|UU|UL|FL|LP)/;

/**
 * Le texte tel qu'on le colle ou le tape : sans espaces (un lien n'en a pas), et, quand une
 * adresse a été collée derrière une autre (préfixe du clavier à l'écran resté devant), la
 * dernière seulement.
 */
export function cleanLinkText(text: string): string {
  const raw = text.replace(/\s+/g, '');
  const at = raw.toLowerCase().lastIndexOf('http');
  return at > 0 && /^https?:\/\//i.test(raw.slice(at)) ? raw.slice(at) : raw;
}

/**
 * Le lien collé (téléphone, Ctrl+V, fenêtre « Récupérer ») : une playlist YouTube, ou une vidéo
 * ouverte dans une playlist (watch?v=…&list=…), youtube.com, music.youtube.com, m.youtube.com,
 * youtu.be, ou l'identifiant seul de la playlist. Rend la raison du refus sinon.
 */
export function parsePlaylistLink(text: string): PlaylistLink | { refused: string } {
  const raw = cleanLinkText(text);
  if (isPlaylistId(raw)) return playlistOf(raw);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { refused: t('Ce n’est pas un lien') };
  }
  if (!raw.includes('.') && !/^https?:/i.test(raw)) return { refused: t('Ce n’est pas un lien') };
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return { refused: t('Ce lien ne mène pas à YouTube') };
  const list = url.searchParams.get('list');
  if (!list) return { refused: t('Ce lien mène à une vidéo, pas à une playlist') };
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(list)) return { refused: t('Identifiant de playlist illisible') };
  // Onze caractères sans début de playlist : une vidéo tapée derrière le préfixe d'une playlist.
  if (list.length === 11 && !PLAYLIST_START.test(list)) return { refused: t('Ce lien mène à une vidéo, pas à une playlist') };
  return playlistOf(list);
}

function playlistOf(list: string): PlaylistLink {
  const personal = (PERSONAL_LISTS as readonly string[]).includes(list);
  return { list, url: `https://www.youtube.com/playlist?list=${list}`, mix: list.startsWith('RD'), ...(personal ? { personal: true } : {}) };
}

/**
 * Arguments de yt-dlp pour lire une playlist sans rien télécharger : liste à plat, un seul JSON,
 * Mix plafonné. `node` : le moteur JavaScript (l'exécutable de Cyber Pinball, en mode Node).
 * `cookies` : fichier des cookies du compte YouTube (playlists privées et personnelles), effacé
 * par l'appelant après l'appel.
 */
export function playlistArgs(link: PlaylistLink, node?: string, cookies?: string): string[] {
  return [
    '--ignore-config',
    '--no-update',
    '--no-colors',
    '--flat-playlist',
    '--yes-playlist',
    '-J',
    ...(link.mix ? ['--playlist-end', String(JUKEBOX_MIX_CAP)] : []),
    ...(node ? ['--no-js-runtimes', '--js-runtimes', `node:${node}`] : []),
    ...(cookies ? ['--cookies', cookies] : []),
    '--',
    link.url,
  ];
}

// ---------------------------------------------------------------------------
// Ce que dit la liste

export interface PlaylistEntry {
  id: string;
  title: string;
  duration?: number;
  channel?: string;
  thumbnail?: string;
  /** Champs musicaux (seconde lecture). */
  artist?: string;
  album?: string;
  track?: string;
  /** Indisponible : pourquoi (la vidéo n'est pas importée, elle est signalée). */
  unavailable?: UnavailableReason;
  detail?: string;
}

export interface PlaylistAnalysis {
  link: PlaylistLink;
  title: string;
  channel?: string;
  entries: PlaylistEntry[];
  /** Mix arrêté au plafond. */
  capped: boolean;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Raison d'une entrée de liste que YouTube ne lit pas, d'après son titre et ses champs ; undefined : lisible. */
export function entryUnavailable(e: Record<string, unknown>): UnavailableReason | undefined {
  const title = text(e.title) ?? '';
  if (/^\[deleted video\]$/i.test(title)) return 'deleted';
  if (/^\[private video\]$/i.test(title)) return 'private';
  if (/^\[unavailable video\]$/i.test(title)) return 'unavailable';
  switch (e.availability) {
    case 'private':
      return 'private';
    case 'premium_only':
    case 'subscriber_only':
      return 'members';
    case 'needs_auth':
      return 'login';
  }
  if (e.live_status === 'is_live' || e.live_status === 'is_upcoming') return 'live';
  return undefined;
}

/** Miniature d'une entrée : la plus proche de 480 px de large, sinon celle de i.ytimg.com. */
export function entryThumbnail(e: Record<string, unknown>, id: string): string {
  const list = Array.isArray(e.thumbnails) ? (e.thumbnails as { url?: unknown; width?: unknown }[]) : [];
  const ok = list.filter((x) => typeof x?.url === 'string' && /^https:\/\//.test(x.url as string));
  const best = ok.sort((a, b) => Math.abs((num(a.width) ?? 9999) - 480) - Math.abs((num(b.width) ?? 9999) - 480))[0];
  return (best?.url as string | undefined) ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/** La réponse de `yt-dlp --flat-playlist -J`, comprise ; undefined si ce n'est pas une playlist. */
export function parsePlaylistJson(json: unknown, link: PlaylistLink): PlaylistAnalysis | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const r = json as Record<string, unknown>;
  if (!Array.isArray(r.entries)) return undefined;
  const seen = new Set<string>();
  const entries: PlaylistEntry[] = [];
  for (const raw of r.entries as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const id = text(e.id);
    if (!isYoutubeId(id) || seen.has(id)) continue;
    seen.add(id);
    const unavailable = entryUnavailable(e);
    const duration = num(e.duration);
    const channel = text(e.channel) ?? text(e.uploader);
    entries.push({
      id,
      title: unavailable && /^\[.*\]$/.test(text(e.title) ?? '') ? unavailableText(unavailable) : (text(e.title) ?? id),
      ...(duration !== undefined ? { duration } : {}),
      ...(channel ? { channel } : {}),
      thumbnail: entryThumbnail(e, id),
      ...(unavailable ? { unavailable } : {}),
    });
  }
  const channel = text(r.channel) ?? text(r.uploader);
  return { link, title: text(r.title) ?? link.list, ...(channel ? { channel } : {}), entries, capped: link.mix && entries.length >= JUKEBOX_MIX_CAP };
}

/** Raison d'une vidéo que yt-dlp ne lit pas, d'après son message (anglais) ; undefined : pas une raison propre à la vidéo. */
export function unavailableFromMessage(message: string): UnavailableReason | undefined {
  const m = message;
  if (/not a bot|confirm you.re not/i.test(m)) return undefined;
  if (/private video/i.test(m)) return 'private';
  if (/(available|blocked it) in your country|geo.?restrict/i.test(m)) return 'blocked';
  if (/members|join this channel|premium/i.test(m)) return 'members';
  if (/age.restricted|confirm your age|inappropriate for some users/i.test(m)) return 'age';
  if (/live event|is live|premieres in|will begin in/i.test(m)) return 'live';
  if (/removed by the uploader|has been removed|account associated .* terminated|does not exist|copyright claim/i.test(m)) return 'deleted';
  if (/video unavailable|not available/i.test(m)) return 'unavailable';
  if (/sign in/i.test(m)) return 'login';
  return undefined;
}

/**
 * Arguments de la seconde lecture, vidéo par vidéo, sans téléchargement : titre, durée, champs
 * musicaux (artist, album, track) et indisponibilités que la liste ne dit pas (pays, abonnés, âge).
 * Une vidéo en échec n'arrête pas les autres (--ignore-errors).
 */
export function detailArgs(ids: readonly string[], node?: string): string[] {
  return [
    '--ignore-config',
    '--no-update',
    '--no-colors',
    '--skip-download',
    '--ignore-errors',
    '--no-playlist',
    '--print',
    `${YTDLP_INFO_MARK}%(.{${YTDLP_INFO_FIELDS}})j`,
    ...(node ? ['--no-js-runtimes', '--js-runtimes', `node:${node}`] : []),
    '--',
    ...ids.filter(isYoutubeId).map((id) => `https://www.youtube.com/watch?v=${id}`),
  ];
}

export type EntryDetail = { tags?: { artist?: string; album?: string; track?: string }; title?: string; duration?: number; channel?: string } | { unavailable: UnavailableReason; detail: string };

/** Sortie de la seconde lecture : par vidéo, ses informations ou sa raison. */
export function parseDetailLines(lines: readonly string[]): Map<string, EntryDetail> {
  const out = new Map<string, EntryDetail>();
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(YTDLP_INFO_MARK)) {
      let info: Record<string, unknown>;
      try {
        info = JSON.parse(line.slice(YTDLP_INFO_MARK.length)) as Record<string, unknown>;
      } catch {
        continue;
      }
      const id = text(info.id);
      if (!isYoutubeId(id)) continue;
      const tags = musicTags(info);
      const unavailable = entryUnavailable(info);
      if (unavailable) {
        out.set(id, { unavailable, detail: unavailableText(unavailable) });
        continue;
      }
      const duration = num(info.duration);
      const channel = text(info.channel) ?? text(info.uploader);
      out.set(id, {
        ...(tags ? { tags: { ...(tags.artist ? { artist: tags.artist } : {}), ...(tags.album ? { album: tags.album } : {}), ...(tags.title ? { track: tags.title } : {}) } } : {}),
        ...(text(info.title) ? { title: text(info.title)! } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(channel ? { channel } : {}),
      });
      continue;
    }
    const err = /^ERROR:\s*\[youtube\]\s*([A-Za-z0-9_-]{11}):\s*(.*)$/.exec(line);
    if (err) {
      const reason = unavailableFromMessage(err[2]!);
      if (reason) out.set(err[1]!, { unavailable: reason, detail: unavailableText(reason) });
    }
  }
  return out;
}

/** Ajoute à l'analyse ce que la seconde lecture a appris (champs musicaux, indisponibilités). */
export function mergeDetails(analysis: PlaylistAnalysis, details: ReadonlyMap<string, EntryDetail>): PlaylistAnalysis {
  return {
    ...analysis,
    entries: analysis.entries.map((e) => {
      const d = details.get(e.id);
      if (!d) return e;
      if ('unavailable' in d) return { ...e, unavailable: d.unavailable, detail: d.detail };
      return {
        ...e,
        ...(d.tags?.artist ? { artist: d.tags.artist } : {}),
        ...(d.tags?.album ? { album: d.tags.album } : {}),
        ...(d.tags?.track ? { track: d.tags.track } : {}),
        ...(e.duration === undefined && d.duration !== undefined ? { duration: d.duration } : {}),
        ...(!e.channel && d.channel ? { channel: d.channel } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Taille estimée

/**
 * Débits moyens relevés sur YouTube, en octets par seconde : son M4A (AAC 128 kbit/s), vidéo
 * MP4 H.264 seule en 720p et en 1080p. Une estimation, dite comme telle à l'écran.
 */
export const JUKEBOX_RATES = { audio: 16_500, 720: 190_000, 1080: 340_000 } as const;
/** Durée prise pour un morceau dont la liste ne dit pas la durée. */
export const UNKNOWN_DURATION_S = 240;

/** Octets estimés d'un morceau : le son, plus la vidéo de la hauteur voulue. */
export function estimateSongBytes(duration: number | undefined, height: 0 | 720 | 1080, have: { audio?: boolean; video?: boolean } = {}): number {
  const d = duration ?? UNKNOWN_DURATION_S;
  return Math.round((have.audio ? 0 : JUKEBOX_RATES.audio * d) + (height && !have.video ? JUKEBOX_RATES[height] * d : 0));
}

export interface ImportSummary {
  /** Entrées de la liste YouTube. */
  count: number;
  available: number;
  /** Sautées, avec leur raison. */
  skipped: { entry: PlaylistEntry; reason: string }[];
  /** Retenues (cochées et disponibles). */
  chosen: number;
  /** Durée des retenues. */
  duration: number;
  /** Données nouvelles à télécharger pour chaque qualité (les morceaux déjà sur la borne sont réutilisés). */
  bytes: Record<JukeboxQuality, number>;
  /** Retenues déjà sur la borne : réutilisées. */
  reused: number;
  /** Retenues déjà dans la playlist visée : ignorées. */
  already: number;
  /** Une durée manque : l'estimation l'a supposée. */
  approx: boolean;
}

/** Ce qu'un import ferait : nombre, durée, taille estimée selon la qualité, sautées avec leur raison. */
export function summarizeImport(analysis: PlaylistAnalysis, opts: { chosen?: ReadonlySet<string>; library?: ReadonlyMap<string, LibrarySong>; target?: JukeboxPlaylist } = {}): ImportSummary {
  const inTarget = new Set(opts.target?.tracks.map((tr) => tr.youtube).filter(Boolean));
  const out: ImportSummary = { count: analysis.entries.length, available: 0, skipped: [], chosen: 0, duration: 0, bytes: { '1080p': 0, '720p': 0, audio: 0 }, reused: 0, already: 0, approx: false };
  for (const e of analysis.entries) {
    if (e.unavailable) {
      out.skipped.push({ entry: e, reason: e.detail ?? unavailableText(e.unavailable) });
      continue;
    }
    out.available++;
    if (opts.chosen && !opts.chosen.has(e.id)) continue;
    if (inTarget.has(e.id)) {
      out.already++;
      continue;
    }
    out.chosen++;
    out.duration += e.duration ?? 0;
    if (e.duration === undefined) out.approx = true;
    const song = opts.library?.get(e.id);
    if (song?.audio) out.reused++;
    const have = { audio: Boolean(song?.audio), video: Boolean(song?.video) };
    out.bytes['1080p'] += estimateSongBytes(e.duration, 1080, have);
    out.bytes['720p'] += estimateSongBytes(e.duration, 720, have);
    out.bytes.audio += estimateSongBytes(e.duration, 0, have);
  }
  return out;
}

/** Morceau de playlist tiré d'une entrée de la liste (sans sa clé). */
export function entryTrack(e: PlaylistEntry, source: 'online' | 'download', now: Date): Omit<JukeboxTrack, 'key'> {
  const tags = { ...(e.artist ? { artist: e.artist } : {}), ...(e.album ? { album: e.album } : {}), ...(e.track ? { title: e.track } : {}) };
  return {
    source,
    youtube: e.id,
    title: e.title,
    ...(Object.keys(tags).length ? { tags } : {}),
    ...(e.channel ? { channel: e.channel } : {}),
    ...(e.duration !== undefined ? { duration: e.duration } : {}),
    ...(e.thumbnail ? { thumbnail: e.thumbnail } : {}),
    added: now.toISOString(),
  };
}

export interface ImportRequest {
  analysis: PlaylistAnalysis;
  /** Nouvelle playlist (son nom), ou une playlist existante (sa qualité ne change pas). */
  target: { name: string } | { playlist: string };
  /** Morceaux cochés ; absent : tout prendre. */
  chosen?: ReadonlySet<string>;
  /** En ligne, ou téléchargé sur la borne (modifiable ensuite). */
  mode: 'online' | 'download';
  /** Qualité d'une nouvelle playlist. */
  quality?: JukeboxQuality;
  library: ReadonlyMap<string, LibrarySong>;
  now: Date;
}

/**
 * Importe une playlist YouTube : les morceaux retenus et disponibles, à la fin, sans doublon ; les
 * sautés ne sont pas ajoutés (l'écran d'import les a signalés). `enqueue` : les morceaux à
 * télécharger quand le mode est « sur la borne ».
 */
export function applyPlaylistImport(store: JukeboxStore, req: ImportRequest): StoreChange<{ playlist: JukeboxPlaylist; added: JukeboxTrack[]; duplicates: number; skipped: number; enqueue: string[] }> {
  let next = store;
  let id: string;
  if ('name' in req.target) {
    const created = createPlaylist(store, req.target.name, req.now, {
      quality: req.quality ?? '1080p',
      youtube: { list: req.analysis.link.list, url: req.analysis.link.url, title: req.analysis.title, mode: req.mode, ...(req.analysis.link.mix ? { mix: true } : {}), synced: req.now.toISOString() },
    });
    if (!created.ok) return created;
    next = created.store;
    id = created.playlist.id;
  } else {
    if (!findPlaylist(store, req.target.playlist)) return { ok: false, reason: t('Playlist introuvable') };
    id = req.target.playlist;
  }
  const entries = req.analysis.entries.filter((e) => !e.unavailable && (!req.chosen || req.chosen.has(e.id)));
  const added = addTracks(next, id, entries.map((e) => ({ ...entryTrack(e, req.mode, req.now), ...(req.analysis.link.list ? { list: req.analysis.link.list } : {}) })), req.now);
  if (!added.ok) return added;
  const playlist = findPlaylist(added.store, id)!;
  const fresh = { ...playlist, tracks: added.added };
  return {
    ok: true,
    store: added.store,
    playlist,
    added: added.added,
    duplicates: added.duplicates,
    skipped: req.analysis.entries.filter((e) => e.unavailable).length,
    enqueue: req.mode === 'download' ? missingDownloads(fresh, req.library, added.store) : [],
  };
}

// ---------------------------------------------------------------------------
// Resynchronisation

/**
 * Resynchronise une playlist avec sa source YouTube. Les nouveaux morceaux sont ajoutés à la fin
 * (source : celle de la playlist, en ligne ou sur la borne). Un morceau importé de cette liste qui
 * n'y est plus est marqué « retiré de YouTube » : jouable s'il est sur la borne, grisé sinon ; jamais
 * effacé. Une vidéo devenue privée ou supprimée est marquée avec sa raison ; revenue, le repère part.
 * Un Mix change à chaque lecture : on y ajoute, on n'y marque rien de retiré.
 */
export function resyncPlaylist(
  store: JukeboxStore,
  id: string,
  analysis: PlaylistAnalysis,
  library: ReadonlyMap<string, LibrarySong>,
  now: Date,
): StoreChange<{ added: JukeboxTrack[]; removed: JukeboxTrack[]; back: JukeboxTrack[]; enqueue: string[] }> {
  const p = findPlaylist(store, id);
  if (!p) return { ok: false, reason: t('Playlist introuvable') };
  if (!p.youtube) return { ok: false, reason: t('Cette playlist ne vient pas de YouTube') };
  const at = now.toISOString();
  const source = new Map(analysis.entries.map((e) => [e.id, e]));
  const removed: JukeboxTrack[] = [];
  const back: JukeboxTrack[] = [];
  const tracks = p.tracks.map((tr): JukeboxTrack => {
    if (!tr.youtube || tr.source === 'file') return tr;
    const e = source.get(tr.youtube);
    if (!e) {
      if (p.youtube!.mix || tr.list !== p.youtube!.list || tr.removed) return tr;
      const out = { ...tr, removed: at };
      removed.push(out);
      return out;
    }
    const wasGone = Boolean(tr.removed || tr.unavailable);
    const { removed: _r, unavailable: _u, ...rest } = tr;
    const out: JukeboxTrack = e.unavailable ? { ...rest, unavailable: { reason: e.unavailable, ...(e.detail ? { detail: e.detail } : {}), since: tr.unavailable?.since ?? at } } : rest;
    if (wasGone && !e.unavailable) back.push(out);
    return out;
  });
  const have = new Set(tracks.map((tr) => tr.youtube).filter(Boolean));
  const fresh = analysis.entries.filter((e) => !e.unavailable && !have.has(e.id)).map((e) => ({ ...entryTrack(e, p.youtube!.mode, now), list: p.youtube!.list }));
  const base: JukeboxStore = { ...store, playlists: store.playlists.map((x) => (x.id === id ? { ...x, tracks } : x)) };
  const added = addTracks(base, id, fresh, now);
  if (!added.ok) return added;
  const after = findPlaylist(added.store, id)!;
  const synced: JukeboxPlaylist = { ...after, youtube: { ...after.youtube!, ...(analysis.title ? { title: analysis.title } : {}), synced: at, found: { added: added.added.length, removed: removed.length } } };
  const next: JukeboxStore = { ...added.store, playlists: added.store.playlists.map((x) => (x.id === id ? synced : x)) };
  const enqueue = p.youtube.mode === 'download' ? missingDownloads({ ...synced, tracks: added.added }, library, next) : [];
  return { ok: true, store: next, added: added.added, removed, back, enqueue };
}

// ---------------------------------------------------------------------------
// Téléchargement par la file

export const JUKEBOX_DOWNLOAD_KIND = 'jukebox' as const;
export const JUKEBOX_DOWNLOAD_SOURCE = { kind: 'youtube' as const, label: 'YouTube' };

export interface SongRequest {
  id: string;
  title: string;
  duration?: number;
  /** Hauteur de vidéo voulue (0 : son seul). */
  height: 0 | 720 | 1080;
  /** Ce qui est déjà sur la borne. */
  have: { audio: boolean; video: boolean };
}

/** Partiel et destination d'un fichier de morceau : son.m4a, video.mp4 (yt-dlp écrit « <nom>.part »). */
export function songFilePaths(root: string, id: string, want: 'audio' | 'video'): { part: string; dest: string } {
  const dest = path.join(songDir(root, id), want === 'audio' ? `${SONG_AUDIO_STEM}.m4a` : `${SONG_VIDEO_STEM}.mp4`);
  return { part: `${dest}.part`, dest };
}

/**
 * Le téléchargement d'une playlist, prêt pour la file (DownloadManager.add) : deux fichiers par
 * morceau (ce qui manque seulement), facultatifs, le format et la taille estimée dans `meta`.
 * undefined : rien à télécharger.
 */
export function jukeboxDownloadSpec(root: string, playlist: Pick<JukeboxPlaylist, 'id' | 'name'>, songs: readonly SongRequest[]): DownloadSpec | undefined {
  const files: DownloadSpec['files'] = [];
  let count = 0;
  for (const s of songs) {
    if (!isYoutubeId(s.id)) continue;
    const before = files.length;
    const url = `https://www.youtube.com/watch?v=${s.id}`;
    if (!s.have.audio) {
      files.push({ ref: url, name: t('{title} · son', { title: s.title }), ...songFilePaths(root, s.id, 'audio'), optional: true, meta: { song: s.id, want: 'audio', estimate: estimateSongBytes(s.duration, 0) } });
    }
    if (s.height && !s.have.video) {
      files.push({
        ref: url,
        name: t('{title} · vidéo {height}p', { title: s.title, height: s.height }),
        ...songFilePaths(root, s.id, 'video'),
        optional: true,
        meta: { song: s.id, want: 'video', height: s.height, format: YTDLP_VIDEO_FORMATS[s.height], estimate: estimateSongBytes(s.duration, s.height, { audio: true }) },
      });
    }
    if (files.length > before) count++;
  }
  if (!files.length) return undefined;
  const back: DownloadReturn = { screen: 'jukebox', playlist: playlist.id };
  return {
    kind: JUKEBOX_DOWNLOAD_KIND,
    title: tn(count, 'Juke-box · {name} : {n} morceau', 'Juke-box · {name} : {n} morceaux', { name: playlist.name }),
    source: { ...JUKEBOX_DOWNLOAD_SOURCE },
    files,
    back,
    data: { playlist: playlist.id },
    resumable: true,
  };
}

/** Ce qu'il faut demander pour ces morceaux : la hauteur voulue par toutes leurs playlists, ce qui est déjà là. */
export function songRequests(store: Pick<JukeboxStore, 'playlists'>, ids: readonly string[], library: ReadonlyMap<string, LibrarySong>): SongRequest[] {
  const out: SongRequest[] = [];
  for (const id of new Set(ids)) {
    const tr = store.playlists.flatMap((p) => p.tracks).find((x) => x.youtube === id);
    if (!tr) continue;
    const song = library.get(id);
    const height = wantedHeight(store, id);
    if (songComplete(song, height)) continue;
    out.push({ id, title: tr.title, ...(tr.duration !== undefined ? { duration: tr.duration } : {}), height, have: { audio: Boolean(song?.audio), video: Boolean(song?.video) } });
  }
  return out;
}

/** Morceaux déjà demandés à la file et pas encore arrivés : jamais demandés deux fois. */
export function queuedSongs(jobs: readonly DownloadJob[]): Set<string> {
  const out = new Set<string>();
  for (const j of jobs) {
    if (j.kind !== JUKEBOX_DOWNLOAD_KIND || !isActive(j)) continue;
    for (const f of j.files) if (!f.done && typeof f.meta?.song === 'string') out.add(f.meta.song);
  }
  return out;
}

/**
 * Téléchargement de chaque morceau, d'après la file : en cours (avec le pourcentage), à suivre, en
 * attente, en pause, ou en échec avec sa raison (fichier sauté : vidéo devenue privée…). Un morceau
 * arrivé n'y est plus : il est sur la borne.
 */
export function songDownloads(jobs: readonly DownloadJob[]): Map<string, SongDownload> {
  const out = new Map<string, SongDownload>();
  for (const j of jobs) {
    if (j.kind !== JUKEBOX_DOWNLOAD_KIND || j.state === 'done' || j.state === 'cancelled') continue;
    const songs = new Map<string, DownloadJob['files']>();
    for (const f of j.files) {
      const id = f.meta?.song;
      if (typeof id === 'string') songs.set(id, [...(songs.get(id) ?? []), f]);
    }
    const current = j.files.find((f) => !f.done);
    for (const [id, files] of songs) {
      const skipped = files.find((f) => f.skipped);
      if (skipped) {
        out.set(id, { state: 'failed', reason: skipped.skipped!.detail ?? downloadReasonText({ reason: skipped.skipped!.reason, source: j.source }) ?? t('Téléchargement impossible') });
        continue;
      }
      if (files.every((f) => f.done)) continue;
      const received = files.reduce((n, f) => n + fileReceived(f), 0);
      const total = files.reduce((n, f) => n + (f.done ? (f.bytes ?? fileReceived(f)) : Math.max(Number(f.meta?.estimate ?? 0), fileReceived(f))), 0);
      const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0;
      let d: SongDownload;
      if (j.state === 'failed') d = { state: 'failed', reason: downloadReasonText(j) ?? t('Téléchargement impossible') };
      else if (j.state === 'running') d = current?.meta?.song === id ? { state: 'running', percent } : { state: 'queued', ...(received ? { percent } : {}) };
      else if (j.state === 'paused') d = { state: 'paused', percent };
      else if (j.state === 'waiting') d = { state: 'waiting', percent, ...(downloadReasonText(j) ? { reason: downloadReasonText(j)! } : {}) };
      else d = { state: 'queued', ...(received ? { percent } : {}) };
      // Un téléchargement actif l'emporte sur un ancien en échec.
      const prev = out.get(id);
      if (!prev || prev.state === 'failed') out.set(id, d);
    }
  }
  return out;
}

/** Hauteur de vidéo voulue par la playlist d'un morceau, pour son état (trackStatus). */
export function playlistHeight(p: Pick<JukeboxPlaylist, 'quality'>): 0 | 720 | 1080 {
  return qualityHeight(p.quality);
}

// ---------------------------------------------------------------------------
// Lecture en ligne (étape 3), d'après une sonde de la lecture en ligne (09/11/2026)

/**
 * Referer envoyé au lecteur intégré de YouTube. Sans lui (page locale file://, protocole de
 * l'application), YouTube refuse l'intégration : erreur 153, « Erreur de configuration du lecteur
 * vidéo ». Avec lui, la lecture part, et le son se règle comme celui de toute page (setSinkId).
 */
export const JUKEBOX_EMBED_REFERRER = 'https://github.com/gocode/cyberpinball';

/** Adresse du lecteur intégré, ouvert seul dans une vue (loadURL avec httpReferrer). */
export function youtubeEmbedUrl(id: string, opts: { start?: number } = {}): string {
  if (!isYoutubeId(id)) throw new Error(`identifiant YouTube invalide : ${id}`); // i18n-ignore : erreur de programmation
  const q = new URLSearchParams({ autoplay: '1', controls: '0', rel: '0', playsinline: '1', iv_load_policy: '3', disablekb: '1', ...(opts.start ? { start: String(Math.floor(opts.start)) } : {}) });
  return `https://www.youtube.com/embed/${id}?${q.toString()}`;
}

/**
 * Codes d'erreur du lecteur intégré (API IFrame), en clair : 2 adresse invalide, 5 lecteur HTML5,
 * 100 vidéo introuvable (supprimée ou privée), 101 et 150 intégration refusée par l'auteur, 152 et
 * 153 lecteur mal configuré (Referer absent ou refusé).
 */
export function embedErrorText(code: number): string {
  switch (code) {
    case 100:
      return t('Vidéo supprimée ou privée');
    case 101:
    case 150:
      return t('Son auteur interdit la lecture hors de YouTube');
    case 152:
    case 153:
      return t('YouTube refuse ce lecteur (Referer)');
    case 2:
      return t('Adresse de vidéo invalide');
    default:
      return t('Le lecteur de YouTube a échoué (code {code})', { code });
  }
}

/** Erreur du lecteur intégré qui rend la vidéo indisponible pour de bon (à marquer sur le morceau). */
export function embedErrorReason(code: number): UnavailableReason | undefined {
  if (code === 100) return 'deleted';
  if (code === 101 || code === 150) return 'unavailable';
  return undefined;
}
