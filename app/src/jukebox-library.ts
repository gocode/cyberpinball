// Juke-box sur la borne : le disque et le réseau du socle (packages/core/src/jukebox*.ts). Aucun écran
// ici ; le lecteur (étape 3), la gestion et l'import (étape 4) et l'habillage du DMD (étape 5)
// appellent ce service.
// - L'index des playlists : <données>\juke-box.json, relu au premier usage, écrit à chaque changement
//   (écriture atomique).
// - La bibliothèque : <racine>\Musique\<identifiant YouTube>\ (son, vidéo muette, miniature,
//   infos.json), relue sur le disque et gardée en mémoire jusqu'au prochain changement.
// - YouTube par yt-dlp (ytdlp-tool.ts) : lecture d'une playlist sans rien télécharger, puis des
//   vidéos retenues (champs musicaux, indisponibilités) ; téléchargement des morceaux par la file
//   des téléchargements, dont ce service fournit le transport (source « youtube »).
// - Fichiers locaux : relevé des dossiers (sous-dossiers compris), pochettes intégrées gardées en
//   cache dans <données>\juke-box\pochettes (nommées par l'empreinte du fichier et sa date).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  detailArgs,
  downloadAll,
  emptyJukebox,
  findPlaylist,
  freePlaylist,
  importAnalysis,
  isYoutubeId,
  jukeboxDownloadSpec,
  jukeboxUsage,
  loadJukebox,
  localCover,
  localTracks,
  mergeDetails,
  normalizeSkins,
  parseDetailLines,
  parseJukeboxLink,
  parsePlaylistJson,
  parsePlaylistLink,
  playlistArgs,
  queuedSongs,
  readJukeboxLibrary,
  readLibrarySong,
  readMediaTags,
  resyncPlaylist,
  saveJukebox,
  scanLocalMedia,
  setPlaylistQuality,
  songDir,
  songDownloads,
  songRequests,
  SONG_VIDEO_STEM,
  t,
  trackInfo,
  trackStatus,
  unavailableFromMessage,
  unavailableText,
  videoAnalysis,
  wantedHeight,
  writeFileAtomic,
  writeSongInfos,
  youtubeEmbedUrl,
  JUKEBOX_EMBED_REFERRER,
  qualityHeight,
  addTracks,
  type DownloadJob,
  type DownloadTransport,
  type ImportRequest,
  type JukeboxPlaylist,
  type JukeboxQuality,
  type JukeboxStore,
  type JukeboxTrack,
  type JukeboxUsage,
  type LibrarySong,
  type LocalScan,
  type PlayerList,
  type PlaylistAnalysis,
  type SongInfos,
  type StoreChange,
  type TrackInfo,
  type TrackStatus,
  type TransportResult,
  type UnavailableReason,
} from '@cyberpinball/core';
import type { RunResult as YtDlpRun, YtDlp } from './ytdlp-tool';

export interface JukeboxLibraryOptions {
  /** Racine de Cyber Pinball ; undefined avant l'installation. */
  root(): string | undefined;
  dataDir: string;
  ytdlp: Pick<YtDlp, 'grab' | 'run'>;
  /** La file des téléchargements. */
  downloads?: { add(spec: NonNullable<ReturnType<typeof jukeboxDownloadSpec>>): DownloadJob; jobs(): readonly DownloadJob[]; cancel(id: string): void };
  /** Moteur JavaScript de yt-dlp : l'exécutable de Cyber Pinball, en mode Node. */
  node?: string;
  /**
   * Compte YouTube (youtube-account.ts) : la lecture d'une playlist passe ses cookies à yt-dlp quand il
   * est connecté (playlists privées et personnelles du compte, leur resynchronisation). La seconde
   * lecture, vidéo par vidéo, et les téléchargements s'en passent.
   */
  account?: { withCookies(work: (file: string | undefined) => Promise<YtDlpRun>): Promise<YtDlpRun> };
  /** Le réseau est là (true par défaut). */
  online?(): boolean;
  /** Quelque chose a changé : les écrans se redessinent. */
  changed?(): void;
  log?(line: string): void;
  now?(): Date;
}

/** Un morceau tel que les écrans le montrent. */
export interface TrackView {
  track: JukeboxTrack;
  info: TrackInfo;
  status: TrackStatus;
  /** Image à montrer : miniature sur la borne, pochette d'un fichier local, sinon la miniature en ligne. */
  image?: string;
}

/** Ce que le lecteur doit jouer pour un morceau. */
export type JukeboxPlayback =
  /** Sur la borne : le son, et la vidéo muette lue en même temps (absente : pochette ou visualiseur). */
  | { kind: 'local'; audio: string; video?: string; image?: string }
  /** En ligne : le lecteur intégré de YouTube, ouvert seul avec ce Referer. */
  | { kind: 'online'; id: string; url: string; referrer: string }
  /** Fichier local, à son emplacement : une vidéo (avec son son), ou un son seul (pochette, sinon visualiseur). */
  | { kind: 'file'; path: string; media: 'video' | 'audio'; image?: string };

export type AnalyzeResult = { ok: true; analysis: PlaylistAnalysis } | { ok: false; reason: string; cancelled?: boolean };

export function createJukeboxLibrary(opts: JukeboxLibraryOptions) {
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  const changed = () => opts.changed?.();
  let store: JukeboxStore | undefined;
  let library: Map<string, LibrarySong> | undefined;

  const current = (): JukeboxStore => (store ??= loadJukebox(opts.dataDir, normalizeSkins));

  /** Change l'index et l'écrit ; un échec d'écriture est noté au journal (l'état en mémoire reste juste). */
  function commit(next: JukeboxStore): JukeboxStore {
    store = next;
    try {
      saveJukebox(opts.dataDir, next);
    } catch (error) {
      log(`Juke-box : index pas écrit (${(error as Error).message}).`); // i18n-ignore : journal
    }
    changed();
    return next;
  }

  function apply<T extends object>(change: StoreChange<T>): StoreChange<T> {
    if (change.ok) commit(change.store);
    return change;
  }

  function songs(): Map<string, LibrarySong> {
    const root = opts.root();
    if (!root) return new Map();
    return (library ??= readJukeboxLibrary(root));
  }

  /** Relit un morceau (ou toute la bibliothèque) après un changement sur le disque. */
  function refresh(id?: string): void {
    const root = opts.root();
    if (!root || !library || !id) {
      library = undefined;
      return;
    }
    const song = isYoutubeId(id) ? readLibrarySong(songDir(root, id)) : undefined;
    if (song) library.set(id, song);
    else library.delete(id);
  }

  // ---------- Téléchargements ----------

  /** Demande à la file les morceaux qui manquent (jamais deux fois le même). */
  function enqueue(playlist: Pick<JukeboxPlaylist, 'id' | 'name'>, ids: readonly string[]): DownloadJob | undefined {
    const root = opts.root();
    if (!root || !opts.downloads || !ids.length) return undefined;
    const busy = queuedSongs(opts.downloads.jobs());
    const spec = jukeboxDownloadSpec(root, playlist, songRequests(current(), ids.filter((id) => !busy.has(id)), songs()));
    if (!spec) return undefined;
    const job = opts.downloads.add(spec);
    log(`Juke-box : ${spec.files.length} fichier(s) demandés pour « ${playlist.name} ».`); // i18n-ignore : journal
    return job;
  }

  /** Marque un morceau indisponible dans toutes ses playlists (vidéo devenue privée, supprimée…). */
  function markUnavailable(id: string, message: string): void {
    const reason = unavailableFromMessage(message);
    if (reason) markReason(id, reason);
  }

  function markReason(id: string, reason: UnavailableReason): void {
    const at = now().toISOString();
    const s = current();
    commit({
      ...s,
      playlists: s.playlists.map((p) => ({ ...p, tracks: p.tracks.map((tr) => (tr.youtube === id && tr.source !== 'file' ? { ...tr, unavailable: { reason, detail: unavailableText(reason), since: tr.unavailable?.since ?? at } } : tr)) })),
    });
  }

  /** Infos du morceau, complétées par ce que yt-dlp a imprimé (titre, champs musicaux, hauteur). */
  function saveInfos(dir: string, id: string, info: Record<string, unknown>): void {
    const old = readLibrarySong(dir)?.infos;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') || undefined : str(v));
    const infos: SongInfos = {
      id,
      title: str(info.title) ?? old?.title ?? id,
      url: `https://www.youtube.com/watch?v=${id}`,
      fetched: now().toISOString(),
    };
    const artist = list(info.artist) ?? list(info.artists) ?? list(info.creator) ?? old?.artist;
    const album = str(info.album) ?? old?.album;
    const track = str(info.track) ?? old?.track;
    const channel = str(info.channel) ?? str(info.uploader) ?? old?.channel;
    const duration = typeof info.duration === 'number' ? info.duration : old?.duration;
    const height = typeof info.height === 'number' ? info.height : old?.height;
    Object.assign(infos, { ...(artist ? { artist } : {}), ...(album ? { album } : {}), ...(track ? { track } : {}), ...(channel ? { channel } : {}), ...(duration !== undefined ? { duration } : {}), ...(height ? { height } : {}) });
    writeSongInfos(dir, infos);
  }

  /** Transport de la file pour la source « youtube » : un fichier de morceau par yt-dlp, repris d'une session à l'autre. */
  const transport: DownloadTransport = {
    available: () => opts.online?.() ?? true,
    async fetch({ file, signal, progress }): Promise<TransportResult> {
      const root = opts.root();
      const id = file.meta?.song;
      const want = file.meta?.want === 'video' ? 'video' : 'audio';
      if (!root) return { ok: false, reason: 'refused', detail: t('Cyber Pinball n’est pas installé') };
      if (typeof id !== 'string' || !isYoutubeId(id)) return { ok: false, reason: 'refused', detail: t('morceau inconnu') };
      // Plus voulu sur la borne (playlist libérée, passée au son seul) : sauté, rien n'est téléchargé.
      const height = wantedHeight(current(), id);
      const wanted = current().playlists.some((p) => p.tracks.some((tr) => tr.youtube === id && tr.source === 'download'));
      if (!wanted || (want === 'video' && height === 0)) return { ok: false, reason: 'refused', detail: t('plus demandé sur la borne') };
      const dir = songDir(root, id);
      const format = want === 'video' && typeof file.meta?.format === 'string' ? file.meta.format : undefined;
      const r = await opts.ytdlp.grab({
        url: file.ref,
        want,
        out: dir,
        name: want === 'audio' ? 'son' : SONG_VIDEO_STEM,
        ...(format ? { format } : {}),
        thumbnail: want === 'audio',
        info: true,
        keep: true,
        signal,
        progress: (p) => {
          if (p.phase === 'download') progress(p.received, p.total);
        },
      });
      if (r.ok) {
        try {
          if (r.info) saveInfos(dir, id, r.info);
        } catch (error) {
          log(`Juke-box : infos.json de ${id} pas écrit (${(error as Error).message}).`); // i18n-ignore : journal
        }
        refresh(id);
        changed();
        let bytes: number | undefined;
        try {
          bytes = fs.statSync(r.file).size;
        } catch {
          bytes = undefined;
        }
        return { ok: true, file: r.file, ...(bytes !== undefined ? { bytes } : {}) };
      }
      if (r.cancelled) return { ok: false, reason: 'network', detail: r.reason };
      // yt-dlp arrêté sans message (installation impossible, processus tué) : on réessaiera plus tard.
      if (!r.message) return { ok: false, reason: 'network', detail: r.reason };
      const unavailable = unavailableFromMessage(r.message);
      if (unavailable) {
        markUnavailable(id, r.message);
        return { ok: false, reason: 'refused', detail: unavailableText(unavailable) };
      }
      // Coupure, YouTube qui demande de prouver qu'on n'est pas un robot, serveur saturé : en attente, repris seul.
      if (/not a bot|getaddrinfo|timed out|connection|network|unable to download|HTTP Error (5\d\d|429)/i.test(r.message)) return { ok: false, reason: 'network', detail: r.reason };
      return { ok: false, reason: 'refused', detail: r.reason };
    },
  };

  // ---------- YouTube ----------

  /** Lit une playlist YouTube sans rien télécharger (yt-dlp --flat-playlist -J). */
  async function analyze(link: string, signal?: AbortSignal): Promise<AnalyzeResult> {
    const parsed = parsePlaylistLink(link);
    if ('refused' in parsed) return { ok: false, reason: parsed.refused };
    // J'aime, À regarder plus tard : lisibles avec les cookies du compte seulement (relus dans la session à chaque appel).
    const personal: YtDlpRun = { ok: false, reason: t('Playlist personnelle de votre compte YouTube : connectez le compte (Gestion du Juke-box, Compte YouTube)') };
    const read = (cookies: string | undefined) => (parsed.personal && !cookies ? Promise.resolve(personal) : opts.ytdlp.run(playlistArgs(parsed, opts.node, cookies), signal));
    const r = opts.account ? await opts.account.withCookies(read) : await read(undefined);
    if (!r.ok) return r;
    let json: unknown;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      const error = r.lines.find((l) => /^ERROR:/.test(l));
      return { ok: false, reason: error ? playlistError(error) : t('Réponse de yt-dlp illisible') };
    }
    const analysis = parsePlaylistJson(json, parsed);
    return analysis ? { ok: true, analysis } : { ok: false, reason: t('Ce lien ne mène pas à une playlist lisible') };
  }

  /** Seconde lecture des vidéos retenues : champs musicaux et indisponibilités que la liste ne dit pas. */
  async function details(analysis: PlaylistAnalysis, ids?: readonly string[], signal?: AbortSignal): Promise<PlaylistAnalysis> {
    const wanted = (ids ?? analysis.entries.filter((e) => !e.unavailable).map((e) => e.id)).filter(isYoutubeId);
    if (!wanted.length) return analysis;
    // Par paquets de 50 : une ligne de commande raisonnable, une progression possible.
    let out = analysis;
    for (let i = 0; i < wanted.length; i += 50) {
      const r = await opts.ytdlp.run(detailArgs(wanted.slice(i, i + 50), opts.node), signal);
      if (!r.ok) break;
      out = mergeDetails(out, parseDetailLines(r.lines));
    }
    return out;
  }

  /**
   * Lit le lien collé (téléphone, Ctrl+V, « Récupérer ») : une playlist (analyze), ou une vidéo
   * seule, lue par la seconde lecture de yt-dlp et présentée comme une playlist d'un morceau.
   */
  async function analyzeLink(link: string, signal?: AbortSignal): Promise<AnalyzeResult> {
    const parsed = parseJukeboxLink(link);
    if ('refused' in parsed) return { ok: false, reason: parsed.refused };
    if (parsed.kind === 'playlist') return analyze(parsed.link.url, signal);
    const r = await opts.ytdlp.run(detailArgs([parsed.id], opts.node), signal);
    if (!r.ok) return r;
    const detail = parseDetailLines(r.lines).get(parsed.id);
    if (!detail) {
      const error = r.lines.find((l) => /^ERROR:/.test(l));
      return { ok: false, reason: error ? playlistError(error) : t('Vidéo illisible sur YouTube') };
    }
    return { ok: true, analysis: videoAnalysis(parsed.id, detail) };
  }

  /** Écrans de gestion ouverts (la borne y coupe la musique, le bureau la garde) : le lecteur écoute. */
  const manageListeners = new Set<(cabinet: boolean) => void>();

  function importPlaylist(req: Omit<ImportRequest, 'library' | 'now'>) {
    const change = apply(importAnalysis(current(), { ...req, library: songs(), now: now() }));
    if (change.ok && change.enqueue.length) enqueue(change.playlist, change.enqueue);
    return change;
  }

  async function resync(id: string, signal?: AbortSignal) {
    const p = findPlaylist(current(), id);
    if (!p?.youtube) return { ok: false as const, reason: t('Cette playlist ne vient pas de YouTube') };
    const read = await analyze(p.youtube.url, signal);
    if (!read.ok) return read;
    const fresh = new Set(read.analysis.entries.map((e) => e.id).filter((x) => !p.tracks.some((tr) => tr.youtube === x)));
    const analysis = await details(read.analysis, [...fresh], signal);
    const change = apply(resyncPlaylist(current(), id, analysis, songs(), now()));
    if (change.ok && change.enqueue.length) enqueue(findPlaylist(change.store, id)!, change.enqueue);
    return change;
  }

  // ---------- Place sur le disque ----------

  /** Efface des dossiers de la bibliothèque (hors téléchargement en cours). */
  function removeSongs(ids: readonly string[]): number {
    const root = opts.root();
    if (!root) return 0;
    const busy = opts.downloads ? queuedSongs(opts.downloads.jobs()) : new Set<string>();
    let freed = 0;
    for (const id of ids) {
      if (!isYoutubeId(id) || busy.has(id)) continue;
      const song = songs().get(id);
      try {
        fs.rmSync(songDir(root, id), { recursive: true, force: true });
        freed += song?.bytes ?? 0;
      } catch (error) {
        log(`Juke-box : ${id} pas effacé (${(error as Error).message}).`); // i18n-ignore : journal
      }
      refresh(id);
    }
    changed();
    return freed;
  }

  /** Efface les vidéos de ces morceaux (passage au son seul accepté) ; le son reste. */
  function removeVideos(ids: readonly string[]): number {
    let freed = 0;
    for (const id of ids) {
      const song = songs().get(id);
      if (!song?.video || wantedHeight(current(), id) > 0) continue;
      try {
        fs.rmSync(song.video, { force: true });
        freed += song.videoBytes;
      } catch (error) {
        log(`Juke-box : vidéo de ${id} pas effacée (${(error as Error).message}).`); // i18n-ignore : journal
      }
      refresh(id);
    }
    changed();
    return freed;
  }

  function freeSpace(): number | undefined {
    const root = opts.root();
    if (!root) return undefined;
    try {
      const st = fs.statfsSync(root);
      return st.bavail * st.bsize;
    } catch {
      return undefined;
    }
  }

  // ---------- Miniatures des morceaux en ligne (choix de l'import) ----------

  /**
   * Les écrans ne montrent que des fichiers de la borne : la miniature d'un morceau YouTube
   * (i.ytimg.com, 320 × 180) est donc gardée dans <données>\juke-box\miniatures, prise quatre à la
   * fois, et l'écran se redessine quand elle arrive. Hors ligne, rien n'est demandé.
   */
  const thumbDir = () => path.join(opts.dataDir, 'juke-box', 'miniatures');
  const thumbQueue: string[] = [];
  const thumbFailed = new Set<string>();
  let thumbRunning = 0;

  function onlineThumb(id: string): string | undefined {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return undefined;
    const file = path.join(thumbDir(), `${id}.jpg`);
    if (fs.existsSync(file)) return file;
    if (!thumbFailed.has(id) && !thumbQueue.includes(id) && (opts.online?.() ?? true)) {
      thumbQueue.push(id);
      pumpThumbs();
    }
    return undefined;
  }

  function pumpThumbs(): void {
    while (thumbRunning < 4 && thumbQueue.length) {
      const id = thumbQueue.shift()!;
      thumbRunning++;
      void fetchThumb(id).finally(() => {
        thumbRunning--;
        pumpThumbs();
      });
    }
  }

  async function fetchThumb(id: string): Promise<void> {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length < 200 || data.length > 2_000_000) throw new Error('image inattendue'); // i18n-ignore : interne
      fs.mkdirSync(thumbDir(), { recursive: true });
      writeFileAtomic(path.join(thumbDir(), `${id}.jpg`), data);
      changedSoon();
    } catch {
      thumbFailed.add(id);
    }
  }

  /** Une seule remise à jour des écrans pour une rafale de miniatures. */
  let changeTimer: NodeJS.Timeout | undefined;
  function changedSoon(): void {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = undefined;
      opts.changed?.();
    }, 250);
  }

  // ---------- Fichiers locaux ----------

  const coverDir = () => path.join(opts.dataDir, 'juke-box', 'pochettes');

  /** Pochette d'un fichier local : l'image intégrée (gardée en cache), puis celle du dossier. */
  function fileCover(file: string): string | undefined {
    let stamp: string;
    try {
      const st = fs.statSync(file);
      stamp = `${file.toLowerCase()}|${st.size}|${st.mtimeMs}`;
    } catch {
      return undefined;
    }
    const hash = crypto.createHash('sha1').update(stamp).digest('hex').slice(0, 20);
    for (const ext of ['jpg', 'png', 'webp']) {
      const cached = path.join(coverDir(), `${hash}.${ext}`);
      if (fs.existsSync(cached)) return cached;
    }
    const cover = localCover(file);
    if (!cover) return undefined;
    if (cover.kind === 'folder') return cover.path;
    const ext = cover.cover.mime === 'image/png' ? 'png' : cover.cover.mime === 'image/webp' ? 'webp' : 'jpg';
    const out = path.join(coverDir(), `${hash}.${ext}`);
    try {
      writeFileAtomic(out, cover.cover.data);
      return out;
    } catch {
      return undefined;
    }
  }

  /** Ajoute des fichiers relevés (scanLocalMedia) à une playlist : lus sur place, étiquettes comprises. */
  function addFiles(id: string, scan: Pick<LocalScan, 'files'>) {
    const tracks = localTracks(scan.files, now(), (file) => {
      const tags = readMediaTags(file);
      if (!tags) return undefined;
      const { cover: _cover, ...rest } = tags;
      return rest;
    });
    return apply(addTracks(current(), id, tracks, now()));
  }

  // ---------- Pour les écrans ----------

  const fileExists = (file: string) => fs.existsSync(file);
  const driveExists = (file: string) => fs.existsSync(path.parse(file).root);

  function views(id: string): TrackView[] {
    const p = findPlaylist(current(), id);
    if (!p) return [];
    const downloads = opts.downloads ? songDownloads(opts.downloads.jobs()) : new Map();
    const ctx = { library: songs(), downloads, online: opts.online?.() ?? true, fileExists, driveExists };
    return p.tracks.map((track) => {
      // Complet pour cette playlist : la vidéo n'est attendue que si elle n'est pas en son seul.
      const status = trackStatus(track, ctx, qualityHeight(p.quality));
      const song = track.youtube ? ctx.library.get(track.youtube) : undefined;
      const image = track.source === 'file' ? (track.media === 'audio' && status.playable ? fileCover(track.path!) : undefined) : (song?.thumbnail ?? track.thumbnail);
      return { track, info: trackInfo(track, current().corrections), status, ...(image ? { image } : {}) };
    });
  }

  /** Les playlists pour les règles de lecture (jukebox-play.ts). */
  function playerLists(): PlayerList[] {
    return current().playlists.map((p) => ({
      id: p.id,
      tracks: views(p.id).map((v) => ({ key: v.track.key, playable: v.status.playable, ...(v.status.reason ? { reason: v.status.reason } : {}), ...(v.status.percent !== undefined ? { percent: v.status.percent } : {}) })),
    }));
  }

  /** Ce que le lecteur joue pour ce morceau ; undefined s'il ne se lit pas. */
  function playback(playlistId: string, key: string): JukeboxPlayback | undefined {
    const p = findPlaylist(current(), playlistId);
    const view = views(playlistId).find((v) => v.track.key === key);
    if (!p || !view?.status.playable) return undefined;
    const tr = view.track;
    if (view.status.play === 'file') return { kind: 'file', path: tr.path!, media: tr.media ?? 'video', ...(view.image ? { image: view.image } : {}) };
    if (view.status.play === 'local') {
      const song = songs().get(tr.youtube!)!;
      const height = qualityHeight(p.quality);
      return { kind: 'local', audio: song.audio!, ...(height && song.video ? { video: song.video } : {}), ...(song.thumbnail ? { image: song.thumbnail } : {}) };
    }
    return { kind: 'online', id: tr.youtube!, url: youtubeEmbedUrl(tr.youtube!), referrer: JUKEBOX_EMBED_REFERRER };
  }

  return {
    onlineThumb,
    /** L'index (playlists, corrections, habillages) tel qu'il est. */
    store: current,
    /** Change l'index et l'écrit (opérations de jukebox.ts, jukebox-dmd.ts). */
    commit,
    apply,
    /** Bibliothèque des morceaux téléchargés. */
    songs,
    refresh,
    /** Transport de la file des téléchargements (source « youtube »). */
    transport,
    /** Un téléchargement de la file est fini : la bibliothèque est relue. */
    finished(job: DownloadJob): void {
      for (const f of job.files) if (typeof f.meta?.song === 'string') refresh(f.meta.song);
      changed();
    },
    /** Le lecteur intégré de YouTube refuse la vidéo pour de bon (erreurs 100, 101, 150 : embedErrorReason) : indisponible partout. */
    markEmbedError: markReason,
    analyze,
    analyzeLink,
    /** Ce que désigne un lien collé : une playlist, une vidéo, ou rien d'importable. */
    linkKind(link: string): 'playlist' | 'video' | undefined {
      const parsed = parseJukeboxLink(link);
      return 'refused' in parsed ? undefined : parsed.kind;
    },
    details,
    importPlaylist,
    /**
     * La gestion ou l'import s'ouvre. `cabinet` : en borne, où la musique s'arrête ; au bureau, elle
     * continue (décision du 09/11/2026). Le lecteur (étape 3) s'abonne par onManage.
     */
    manageOpened(cabinet: boolean): void {
      for (const listener of manageListeners) listener(cabinet);
    },
    onManage(listener: (cabinet: boolean) => void): () => void {
      manageListeners.add(listener);
      return () => manageListeners.delete(listener);
    },
    resync,
    downloadAll(id: string) {
      const change = apply(downloadAll(current(), id, songs(), now()));
      if (change.ok && change.enqueue.length) enqueue(findPlaylist(change.store, id)!, change.enqueue);
      return change;
    },
    /** « Libérer la place » : la playlist repasse en ligne ; les morceaux qu'aucune autre ne veut sont effacés. */
    freePlace(id: string) {
      const change = apply(freePlaylist(current(), id, songs(), now()));
      if (!change.ok) return change;
      return { ...change, freed: removeSongs(change.remove) };
    },
    /** Change la qualité ; `savings` proposé au passage au son seul (removeVideos l'accepte). */
    setQuality(id: string, quality: JukeboxQuality) {
      const change = apply(setPlaylistQuality(current(), id, quality, songs(), now()));
      if (change.ok && change.download.length) enqueue(findPlaylist(change.store, id)!, change.download);
      return change;
    },
    removeVideos,
    removeSongs,
    usage(): JukeboxUsage & { free?: number } {
      const free = freeSpace();
      return { ...jukeboxUsage(current(), songs()), ...(free !== undefined ? { free } : {}) };
    },
    /** Relève les médias de fichiers ou de dossiers, sous-dossiers compris (annoncé avant l'ajout). */
    scanFiles: (paths: readonly string[]) => scanLocalMedia(paths),
    addFiles,
    views,
    playerLists,
    playback,
    fileCover,
  };
}

/** Raison d'un échec de lecture d'une playlist (yt-dlp, en anglais). */
function playlistError(line: string): string {
  if (/does not exist|not found|404/i.test(line)) return t('Playlist introuvable sur YouTube');
  if (/private/i.test(line)) return t('Playlist privée : connectez le compte YouTube qui la possède, ou rendez-la publique ou non répertoriée');
  if (/not a bot|sign in to confirm/i.test(line)) return t('YouTube demande de prouver qu’on n’est pas un robot : réessayez plus tard');
  if (/getaddrinfo|timed out|connection|network|unable to download/i.test(line)) return t('réseau injoignable');
  return line.replace(/^ERROR:\s*/, '').slice(0, 200);
}

export type JukeboxLibrary = ReturnType<typeof createJukeboxLibrary>;

/** Pour les essais et les écrans vides : un index neuf. */
export const emptyJukeboxStore = emptyJukebox;
