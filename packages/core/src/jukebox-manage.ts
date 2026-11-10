// Juke-box, étape 4 : la gestion des playlists et l'import (Menu système > Juke-box). Ce module ne
// dessine rien : il dit ce que les écrans montrent (app/src/jukebox-menu.ts).
// - Le lien collé (téléphone, Ctrl+V, fenêtre « Récupérer ») : une playlist YouTube, ou une vidéo
//   seule, qu'on ajoute comme une playlist d'un morceau.
// - Ce qui empêche une fonction (pas installé, hors ligne, yt-dlp absent sans réseau pour
//   l'installer, disque plein) : la fonction reste visible, grisée avec cette raison.
// - Les textes des cartes de playlist (morceaux, durée, place, sources, dernière synchro) et de
//   l'import (retenus, taille selon la qualité, sautés).
// Maquettes de la gestion et de l'import validées le 09/11/2026.

import { formatSize } from './fileops';
import { formatDateTime, formatList, t, tn } from './i18n';
import {
  createPlaylist,
  findPlaylist,
  formatTotalTime,
  isYoutubeId,
  type JukeboxPlaylist,
  type JukeboxQuality,
  type JukeboxStore,
  type LibrarySong,
  type PlaylistUsage,
  type TrackSource,
} from './jukebox';
import {
  applyPlaylistImport,
  cleanLinkText,
  estimateSongBytes,
  parsePlaylistLink,
  type EntryDetail,
  type ImportRequest,
  type ImportSummary,
  type PlaylistAnalysis,
  type PlaylistLink,
} from './jukebox-youtube';

// ---------------------------------------------------------------------------
// Le lien

/** Ce qu'un lien collé désigne : une playlist, une vidéo seule, ou pourquoi il est refusé. */
export type JukeboxLink = { kind: 'playlist'; link: PlaylistLink } | { kind: 'video'; id: string; url: string } | { refused: string };

/**
 * Le lien d'une playlist (comme parsePlaylistLink : une vidéo ouverte dans une playlist compte pour
 * la playlist), sinon celui d'une vidéo seule : youtube.com/watch?v=…, youtu.be/…, /shorts/…,
 * /embed/…, /live/…, music.youtube.com. Un identifiant tapé seul vaut aussi : celui d'une playlist
 * (PL…, OLAK5uy_…, RD…), ou les 11 caractères d'une vidéo.
 */
export function parseJukeboxLink(text: string): JukeboxLink {
  const playlist = parsePlaylistLink(text);
  if (!('refused' in playlist)) return { kind: 'playlist', link: playlist };
  const raw = cleanLinkText(text);
  if (isYoutubeId(raw)) return { kind: 'video', id: raw, url: `https://www.youtube.com/watch?v=${raw}` };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return playlist;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    // Une vidéo tapée derrière le préfixe d'une playlist (…playlist?list=<vidéo>) : la vidéo.
    id = url.searchParams.get('v') ?? url.searchParams.get('list');
    const parts = url.pathname.split('/').filter(Boolean);
    if (!id && parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0]!)) id = parts[1]!;
  }
  if (!isYoutubeId(id)) return playlist;
  return { kind: 'video', id, url: `https://www.youtube.com/watch?v=${id}` };
}

/**
 * Clavier à l'écran : le champ du lien commence par l'adresse d'une playlist (ou d'une vidéo, par la
 * bascule « Playlist / Vidéo ») ; on ne tape que l'identifiant.
 */
export const JUKEBOX_LINK_PREFIXES = {
  playlist: 'https://www.youtube.com/playlist?list=',
  video: 'https://www.youtube.com/watch?v=',
} as const;

/**
 * Une adresse entière, tapée ou collée : elle a un protocole (https://…) ou commence par un nom de
 * domaine (www.…, youtu.be/…). Un identifiant n'a jamais de point.
 */
export function isFullAddress(text: string): boolean {
  const v = text.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(v);
}

/**
 * Le texte d'un champ à préfixe fixe (clavier à l'écran) : le préfixe suivi de ce qui est tapé ;
 * une adresse entière, tapée ou collée, est prise seule (pas de préfixe en double) ; rien de tapé :
 * rien.
 */
export function prefixedText(prefix: string | undefined, typed: string): string {
  const v = typed.trim();
  if (!v || !prefix || isFullAddress(v)) return v;
  return prefix + v;
}

/** Une vidéo seule, comme une playlist d'un morceau (seconde lecture de yt-dlp : `detail`). */
export function videoAnalysis(id: string, detail: EntryDetail | undefined): PlaylistAnalysis {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const base = { link: { list: '', url, mix: false }, capped: false };
  if (detail && 'unavailable' in detail) return { ...base, title: detail.detail, entries: [{ id, title: detail.detail, unavailable: detail.unavailable, detail: detail.detail, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] };
  const title = detail?.title ?? id;
  return {
    ...base,
    title,
    ...(detail?.channel ? { channel: detail.channel } : {}),
    entries: [
      {
        id,
        title,
        ...(detail?.duration !== undefined ? { duration: detail.duration } : {}),
        ...(detail?.channel ? { channel: detail.channel } : {}),
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        ...(detail?.tags?.artist ? { artist: detail.tags.artist } : {}),
        ...(detail?.tags?.album ? { album: detail.tags.album } : {}),
        ...(detail?.tags?.track ? { track: detail.tags.track } : {}),
      },
    ],
  };
}

/** L'analyse vient d'une vidéo seule (pas de liste à resynchroniser). */
export const isVideoAnalysis = (analysis: Pick<PlaylistAnalysis, 'link'>): boolean => !analysis.link.list;

/**
 * Importe ce que l'écran d'import a retenu. Une vidéo seule versée dans une nouvelle playlist ne la
 * rattache à aucune liste YouTube : rien à resynchroniser.
 */
export function importAnalysis(store: JukeboxStore, req: ImportRequest): ReturnType<typeof applyPlaylistImport> {
  if (!isVideoAnalysis(req.analysis) || !('name' in req.target)) return applyPlaylistImport(store, req);
  const created = createPlaylist(store, req.target.name, req.now, { quality: req.quality ?? '1080p' });
  if (!created.ok) return created;
  return applyPlaylistImport(created.store, { ...req, target: { playlist: created.playlist.id } });
}

// ---------------------------------------------------------------------------
// Ce qui est possible

/** Ce dont dépendent les fonctions de la gestion. */
export interface JukeboxAbility {
  /** Cyber Pinball est installé (une racine, donc une bibliothèque). */
  installed: boolean;
  /** Le réseau répond. */
  online: boolean;
  /** yt-dlp est déjà là (sinon la première demande l'installe, réseau requis). */
  ytdlp: boolean;
  /** Espace libre du disque de la bibliothèque ; undefined : inconnu. */
  free?: number;
}

/** Marge laissée sur le disque après un téléchargement : en dessous, il est refusé. */
export const JUKEBOX_DISK_MARGIN = 2 * 1024 ** 3;

/** Pourquoi YouTube n'est pas joignable (analyser, importer, resynchroniser) ; undefined : il l'est. */
export function youtubeBlocker(a: JukeboxAbility): string | undefined {
  if (!a.installed) return t('Cyber Pinball n’est pas installé');
  if (!a.online) return a.ytdlp ? t('Hors ligne : YouTube injoignable') : t('Hors ligne : yt-dlp n’est pas installé et ne peut pas être téléchargé');
  return undefined;
}

/** Pourquoi on ne peut pas télécharger `bytes` sur la borne ; undefined : on peut. */
export function downloadBlocker(a: JukeboxAbility, bytes: number): string | undefined {
  const youtube = youtubeBlocker(a);
  if (youtube) return youtube;
  if (a.free !== undefined && bytes + JUKEBOX_DISK_MARGIN > a.free) {
    return t('Disque plein : ≈ {need} à télécharger, {free} libres', { need: formatSize(bytes), free: formatSize(a.free) });
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Les playlists

/** Nombre de morceaux de chaque source. */
export function sourceCounts(p: Pick<JukeboxPlaylist, 'tracks'>): Record<TrackSource, number> {
  const out: Record<TrackSource, number> = { online: 0, download: 0, file: 0 };
  for (const tr of p.tracks) out[tr.source]++;
  return out;
}

/** « Mixte · 6 en ligne / 15 téléchargés / 3 fichiers », « En ligne », « Sur la borne », « Fichiers locaux » ; vide : « Vide ». */
export function sourcesText(p: Pick<JukeboxPlaylist, 'tracks'>): string {
  const c = sourceCounts(p);
  const parts: string[] = [];
  if (c.online) parts.push(tn(c.online, '{n} en ligne', '{n} en ligne'));
  if (c.download) parts.push(tn(c.download, '{n} téléchargé', '{n} téléchargés'));
  if (c.file) parts.push(tn(c.file, '{n} fichier', '{n} fichiers'));
  if (!parts.length) return t('Vide');
  if (parts.length > 1) return t('Mixte · {parts}', { parts: parts.join(' / ') });
  return c.online ? t('En ligne') : c.download ? t('Sur la borne') : t('Fichiers locaux');
}

/** Nature de la playlist, en tête de ses actions : « playlist mixte », « en ligne »… */
export function playlistKind(p: Pick<JukeboxPlaylist, 'tracks'>): string {
  const c = sourceCounts(p);
  const kinds = (['online', 'download', 'file'] as const).filter((k) => c[k]).length;
  if (!kinds) return t('playlist vide');
  if (kinds > 1) return t('playlist mixte');
  return c.online ? t('playlist en ligne') : c.download ? t('playlist sur la borne') : t('fichiers locaux');
}

/** Durée des morceaux d'une playlist. */
export const playlistDuration = (p: Pick<JukeboxPlaylist, 'tracks'>): number => p.tracks.reduce((n, tr) => n + (tr.duration ?? 0), 0);

/** « 24 morceaux · 1 h 36 · 5,1 Go » : la première ligne d'une carte de playlist. */
export function playlistFacts(p: Pick<JukeboxPlaylist, 'tracks'>, usage: PlaylistUsage | undefined): string {
  const duration = playlistDuration(p);
  return [tn(p.tracks.length, '{n} morceau', '{n} morceaux'), ...(duration ? [formatTotalTime(duration)] : []), ...(usage?.bytes ? [formatSize(usage.bytes)] : [])].join(' · ');
}

/** « Dernière synchro · 8 nov. 2026, 21:04 · 2 nouveautés » ; undefined : pas une playlist YouTube. */
export function syncText(p: Pick<JukeboxPlaylist, 'youtube'>): string | undefined {
  if (!p.youtube) return undefined;
  if (!p.youtube.synced) return t('Jamais resynchronisée');
  const found = p.youtube.found;
  const news = found ? [found.added ? tn(found.added, '{n} nouveauté', '{n} nouveautés') : undefined, found.removed ? tn(found.removed, '{n} retiré de YouTube', '{n} retirés de YouTube') : undefined].filter(Boolean) : [];
  return [t('Dernière synchro · {date}', { date: formatDateTime(p.youtube.synced, { dateStyle: 'short', timeStyle: 'short' }) }), ...news].join(' · ');
}

/** Seconde ligne d'une carte : les sources si elles se mélangent, sinon la dernière synchro, sinon la source. */
export function playlistSecondLine(p: Pick<JukeboxPlaylist, 'tracks' | 'youtube'>): string {
  const c = sourceCounts(p);
  const kinds = (['online', 'download', 'file'] as const).filter((k) => c[k]).length;
  if (kinds > 1) return sourcesText(p);
  return syncText(p) ?? sourcesText(p);
}

/** Libellé court d'une qualité, dans le cartouche d'une carte et l'écran de la qualité. */
export function qualityBadge(q: JukeboxQuality): string {
  return q === 'audio' ? t('Son seul') : q;
}

/** Taille estimée d'une playlist entièrement sur la borne dans cette qualité (morceaux YouTube seulement). */
export function playlistEstimate(p: Pick<JukeboxPlaylist, 'tracks'>, quality: JukeboxQuality, library: ReadonlyMap<string, LibrarySong>): number {
  const height = quality === 'audio' ? 0 : quality === '720p' ? 720 : 1080;
  const seen = new Set<string>();
  let bytes = 0;
  for (const tr of p.tracks) {
    if (tr.source === 'file' || !tr.youtube || seen.has(tr.youtube) || tr.unavailable || tr.removed) continue;
    seen.add(tr.youtube);
    const song = library.get(tr.youtube);
    bytes += estimateSongBytes(tr.duration, height, { audio: Boolean(song?.audio), video: Boolean(song?.video) });
  }
  return bytes;
}

/** Ce que « Tout télécharger » demanderait : les morceaux en ligne d'une playlist, et la place. */
export function downloadAllPlan(p: JukeboxPlaylist, library: ReadonlyMap<string, LibrarySong>): { songs: number; bytes: number } {
  const online = p.tracks.filter((tr) => tr.source === 'online' && tr.youtube && !tr.unavailable && !tr.removed);
  const pending = p.tracks.filter((tr) => tr.source === 'download' && tr.youtube && !tr.unavailable && !tr.removed);
  const plan = { tracks: [...online, ...pending] };
  return { songs: online.length, bytes: playlistEstimate(plan, p.quality, library) };
}

// ---------------------------------------------------------------------------
// L'import

/** Ce que l'écran d'import a choisi, un seul choix par groupe. */
export interface ImportChoices {
  /** Tout prendre (undefined) ou les morceaux cochés. */
  chosen?: ReadonlySet<string>;
  /** Nouvelle playlist (son nom) ou existante (son identifiant). */
  target: { name: string } | { playlist: string };
  mode: 'online' | 'download';
  quality: JukeboxQuality;
}

/** Choix proposés d'abord : tout prendre, une nouvelle playlist au nom de la liste YouTube, téléchargée en 1080p. Une vidéo seule va à la dernière playlist, s'il y en a. */
export function defaultImportChoices(analysis: PlaylistAnalysis, store: Pick<JukeboxStore, 'playlists'>, preferred?: string): ImportChoices {
  const video = isVideoAnalysis(analysis);
  const existing = (preferred && findPlaylist(store, preferred)) || (video ? store.playlists.at(-1) : undefined);
  return {
    target: existing ? { playlist: existing.id } : { name: freePlaylistName(store, video ? t('Mes morceaux') : analysis.title) },
    mode: 'download',
    quality: existing?.quality ?? '1080p',
  };
}

/** Nom libre pour une nouvelle playlist : celui-ci, sinon « nom (2) », « nom (3) »… */
export function freePlaylistName(store: Pick<JukeboxStore, 'playlists'>, wanted: string): string {
  const base = (wanted.trim() || t('Nouvelle playlist')).slice(0, 56);
  const taken = new Set(store.playlists.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const name = `${base} (${n})`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** « 21 / 24 retenus » */
export function retainedText(s: Pick<ImportSummary, 'chosen' | 'count'>): string {
  return tn(s.count, '{chosen} / {n} retenu', '{chosen} / {n} retenus', { chosen: s.chosen });
}

/** « 21 disponibles · 3 sautés » */
export function availabilityText(s: Pick<ImportSummary, 'available' | 'skipped'>): string {
  return [tn(s.available, '{n} disponible', '{n} disponibles'), ...(s.skipped.length ? [tn(s.skipped.length, '{n} sauté', '{n} sautés')] : [])].join(' · ');
}

/** « À vérifier · 3 vidéos sautées : privée, supprimée, bloquée dans votre pays. » ; undefined : aucune. */
export function skippedText(s: Pick<ImportSummary, 'skipped'>): string | undefined {
  if (!s.skipped.length) return undefined;
  const reasons = [...new Set(s.skipped.map((x) => x.reason.toLocaleLowerCase()))];
  return tn(s.skipped.length, '{n} vidéo sautée : {reasons}.', '{n} vidéos sautées : {reasons}.', { reasons: formatList(reasons) });
}

/** Libellé de l'action d'import : « Importer 21 morceaux », « Ajouter ce morceau ». */
export function importActionLabel(s: Pick<ImportSummary, 'chosen'>, video: boolean): string {
  if (video) return t('Ajouter ce morceau');
  return tn(s.chosen, 'Importer {n} morceau', 'Importer {n} morceaux');
}

/** Ce que l'import changerait, avant de le lancer (ou pourquoi il ne peut pas l'être). */
export function importBlocker(s: Pick<ImportSummary, 'chosen' | 'already' | 'bytes'>, choices: Pick<ImportChoices, 'mode' | 'quality'>, ability: JukeboxAbility): string | undefined {
  if (!s.chosen) return s.already ? t('Tous les morceaux retenus sont déjà dans cette playlist') : t('Aucun morceau retenu');
  if (choices.mode === 'download') return downloadBlocker(ability, s.bytes[choices.quality]);
  return youtubeBlocker(ability);
}

/** Taille estimée, « ≈ 1,6 Go ». */
export function estimateText(bytes: number): string {
  return t('≈ {size}', { size: formatSize(bytes) });
}
