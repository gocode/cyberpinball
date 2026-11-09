// Lecteur du Juke-box (étape 3) : le mode Juke-box sur les trois écrans, en borne et au bureau.
// Les règles de lecture sont dans packages/core/src/jukebox-play.ts, ce que montrent les écrans dans
// jukebox-screens.ts ; le service des playlists dans jukebox-library.ts. Ici : les boutons, la
// lecture elle-même (ordres envoyés à la fenêtre du clip, lecteur YouTube), le DMD et le cartel.
//
// - Fenêtre du clip : celle qui dessine le fronton en borne ; au bureau (plateau en largeur), celle
//   du plateau, dont le lecteur occupe la droite. Sans fronton, la vignette du morceau en cours.
// - Trois sources (playback de jukebox-library.ts) :
//   local  : le son M4A et la vidéo muette lus ensemble par la fenêtre du clip, le son menant ;
//   online : le lecteur intégré de YouTube ouvert seul dans une vue posée sur le clip (jamais un
//            <iframe>, qui ne verrait qu'une sortie audio), avec son Referer, puis la sortie du
//            fronton retrouvée par son nom (audioSinkScript) ; erreurs 100, 101 et 150 : le morceau
//            devient indisponible ; 152 et 153 : l'application est en cause, rien n'est marqué ;
//            publicité repérée par la classe ad-showing du lecteur ;
//   file   : une vidéo avec son son, ou un son seul (pochette, sinon visualiseur).
// - Volume : celui de la borne ; les éléments jouent à plein (JUKEBOX_ELEMENT_VOLUME).
// - Exit : retour à la roue, la musique s'arrête.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { session, webFrameMain, WebContentsView, type BrowserWindow, type Input, type Rectangle, type Session } from 'electron';
import {
  audioSinkScript,
  embedErrorReason,
  embedErrorText,
  formatNumber,
  idleSpectrum,
  displayIndex,
  initialPlayer,
  startPressStep,
  type StartPress,
  JUKEBOX_MANAGE_HOLD_MS,
  JUKEBOX_MANAGE_KEY,
  selectedKey,
  jukeboxPlayerView,
  jukeboxPoster,
  jukeboxSelectionDots,
  jukeboxSpectrumDots,
  jukeboxSummary,
  listTop,
  mediaUrl,
  playerStep,
  rememberPlayed,
  t,
  unavailableText,
  JUKEBOX_ELEMENT_VOLUME,
  JUKEBOX_LIST_ROWS,
  JUKEBOX_SPECTRUM_BANDS,
  type DmdAnimation,
  type JukeboxNowView,
  type JukeboxPlayerView,
  type JukeboxPlaylistInput,
  type JukeboxPosterView,
  type PlayerEffect,
  type PlayerInput,
  type PlayerState,
  type RoleId,
} from '@cyberpinball/core';
import type { JukeboxLibrary, JukeboxPlayback } from './jukebox-library';
import { OFFSCREEN } from './offscreen';
import { placeView } from './cover-display';

/** Le cartel (titre, artiste) reste ce temps sur le clip à chaque changement de morceau. */
export const JUKEBOX_CARD_MS = 4000;
/** Relevé du lecteur YouTube (temps, fin, erreur, publicité). */
const ONLINE_PROBE_MS = 500;
/** Erreurs de lecture de suite avant d'arrêter : une playlist entière illisible ne boucle pas sans fin. */
const MAX_FAILURES = 3;

export interface JukeboxPlayerHost {
  library(): JukeboxLibrary | undefined;
  windows(): ReadonlyMap<RoleId, BrowserWindow>;
  /** Rôles que dessine chaque fenêtre (le sien et ceux de ses zones). */
  windowRoles(): ReadonlyMap<RoleId, readonly RoleId[]>;
  /** Le plateau est en largeur : mode bureau, la liste dans le cadre 9:16 et le lecteur à droite. */
  desk(): boolean;
  /** Sortie audio du fronton (nom Windows). */
  output(): string | undefined;
  /** Rend un fichier lisible par le protocole des médias (media-protocol.ts). */
  allow(file: string): void;
  /** Exit : retour à la roue (la musique est déjà arrêtée). */
  leave(): void;
  redraw(): void;
  /** DMD du menu vivant : une animation par-dessus l'alternance (live-dmd.ts). */
  dmd(name: string, animation: DmdAnimation): { stop(): void };
  /** Le DMD montre les points (écran du DMD, ni partie ni bureau Windows). */
  dmdOn(): boolean;
  banner(text: string): void;
  log(line: string): void;
  /** Touches : flippers, Start, Exit (boutons de l'interface) et MagnaSave. */
  keys(): { previous: string[]; next: string[]; confirm: string[]; exit: string[]; playlistPrevious: string[]; playlistNext: string[] };
  /** Lecteur YouTube factice (essais hors écran, sans réseau) : une page locale qui en imite le DOM. */
  fakeOnline?: string;
  /** Bouton « Gestion du Juke-box » (bureau) : la gestion des playlists, sur celle montrée. */
  manage?(playlist: string | undefined): void;
}

/** Ordre de lecture envoyé à la fenêtre du clip : un nouveau numéro à chaque morceau lancé. */
export interface JukeboxOrder {
  id: number;
  kind: JukeboxPlayback['kind'];
  /** Son (local), ou fichier lu (file). */
  audio?: string;
  /** Vidéo muette (local) ou vidéo avec son (file). */
  video?: string;
  image?: string;
  paused: boolean;
  output?: string;
  volume: number;
}

/** Ce que reçoit la fenêtre du clip (fronton en borne, plateau au bureau). */
export interface JukeboxClipView {
  /**
   * Où se pose le clip dans sa fenêtre : la zone du fronton, la droite du lecteur au bureau, ou la
   * vignette du morceau en cours (borne sans fronton).
   */
  place: 'zone' | 'desk' | 'thumb' | 'hidden';
  order?: JukeboxOrder;
  now?: JukeboxNowView;
  /** Cartel du changement de morceau : « Néon nocturne · 02 / 24 ». */
  card?: { id: number; eyebrow: string; until: number };
  /** Rien ne joue : l'affiche. */
  poster: JukeboxPosterView;
}

/** La part du Juke-box dans l'état de chaque fenêtre (viewFor). */
export interface JukeboxWindowView {
  /** Médaillon choisi dans la roue : l'affiche (plateau, fronton). */
  wheel?: { poster: JukeboxPosterView };
  /** Mode Juke-box : la liste (plateau), le lecteur (fenêtre du clip). */
  player?: JukeboxPlayerView;
  clip?: JukeboxClipView;
  /** Fronton d'une autre fenêtre que celle du clip (bureau à deux écrans) : l'affiche du morceau en cours. */
  cover?: { now?: JukeboxNowView; poster: JukeboxPosterView };
  layout: 'cab' | 'desk';
}

/** Temps du morceau en cours, envoyé à part (canal jukebox-time) : la liste ne se redessine pas pour lui. */
export interface JukeboxTime {
  key: string;
  position: number;
  duration?: number;
  paused: boolean;
}

/** Messages des fenêtres (canal jukebox). */
export type JukeboxMessage =
  | { type: 'time'; id: number; position: number; duration?: number; paused?: boolean }
  | { type: 'ended'; id: number }
  | { type: 'error'; id: number; message?: string }
  | { type: 'levels'; id: number; levels: number[] }
  | { type: 'clip'; rect?: { x: number; y: number; width: number; height: number } };

const isAbsolute = (p: string | undefined): p is string => Boolean(p && path.isAbsolute(p));

export function createJukeboxPlayer(host: JukeboxPlayerHost) {
  let player: PlayerState | undefined;
  const tops = new Map<string, number>();
  let order: (JukeboxOrder & { playlist: string; key: string; youtube?: string; audioOnly: boolean }) | undefined;
  let orderSeq = 0;
  let card: { id: number; until: number } | undefined;
  let cardTimer: NodeJS.Timeout | undefined;
  let time: JukeboxTime | undefined;
  let levels: { at: number; values: number[] } | undefined;
  let failures = 0;
  let ad = false;
  /**
   * Lecture en fond : au bureau, la gestion des playlists ouverte depuis le lecteur laisse la musique
   * jouer (décision du 09/11/2026) ; le clip n'est plus montré, le son continue, les morceaux s'enchaînent.
   */
  let background = false;
  /** En borne, la gestion met la lecture en pause : elle reprend au retour, là où elle s'était arrêtée. */
  let resumeOnReturn = false;
  /** Start tenu : appui court, jouer ou pause ; maintenu une seconde, la gestion (startPressStep). */
  let press: StartPress;
  let pressTimer: NodeJS.Timeout | undefined;
  /** Titre et artiste du morceau en cours, pour le DMD (25 images par seconde). */
  let playingInfo: { title: string; artist?: string } | undefined;
  /** Le cadre du clip dans sa fenêtre (pixels de la page), dit par la fenêtre du clip. */
  let clipRect: Rectangle | undefined;
  let online: { id: number; view: WebContentsView; win: BrowserWindow; timer: NodeJS.Timeout; started: number; ended?: boolean; lastTime?: number } | undefined;
  let dmd: { kind: 'wheel' | 'player'; stop(): void } | undefined;
  let wheelStats = { tracks: 0, playlists: 0 };

  const lib = () => host.library();
  const layout = (): 'cab' | 'desk' => (host.desk() ? 'desk' : 'cab');
  const rows = () => JUKEBOX_LIST_ROWS[layout()];

  // ---------- Fenêtres ----------

  /** Rôle de la fenêtre qui montre le clip. */
  function clipRole(): RoleId {
    if (host.desk()) return 'playfield';
    for (const [role, roles] of host.windowRoles()) if (roles.includes('backglass')) return role;
    return 'playfield';
  }

  /** Image d'un morceau, servie par le protocole des médias ; une adresse du web n'est pas montrée (la page ne lit que ses médias). */
  function imageUrl(file: string | undefined): string | undefined {
    if (!isAbsolute(file) || !fs.existsSync(file)) return undefined;
    host.allow(file);
    return mediaUrl(file);
  }

  function fileUrl(file: string): string {
    host.allow(file);
    return mediaUrl(file);
  }

  // ---------- Données ----------

  /**
   * Les playlists telles que les écrans les montrent, relues au plus une fois par rendu : toutes les
   * fenêtres d'un même état (broadcast) et les boutons de ce tour les partagent.
   */
  let inputCache: { at: number; value: JukeboxPlaylistInput[] } | undefined;
  function playlistsInput(): JukeboxPlaylistInput[] {
    if (inputCache && Date.now() - inputCache.at < 30) return inputCache.value;
    const value = readPlaylists();
    inputCache = { at: Date.now(), value };
    return value;
  }

  function readPlaylists(): JukeboxPlaylistInput[] {
    const l = lib();
    if (!l) return [];
    return l.store().playlists.map((p) => ({
      id: p.id,
      name: p.name,
      quality: p.quality,
      rows: l.views(p.id).map((v) => ({
        key: v.track.key,
        title: v.info.title,
        ...(v.info.artist ? { artist: v.info.artist } : {}),
        ...(v.info.album ? { album: v.info.album } : {}),
        ...(v.track.duration !== undefined ? { duration: v.track.duration } : {}),
        source: v.track.source,
        status: v.status,
        ...((image) => (image ? { image } : {}))(imageUrl(v.image)),
      })),
    }));
  }

  function lists(input = playlistsInput()) {
    return input.map((p) => ({ id: p.id, tracks: p.rows.map((r) => ({ key: r.key, playable: r.status.playable, ...(r.status.reason ? { reason: r.status.reason } : {}), ...(r.status.percent !== undefined ? { percent: r.status.percent } : {}) })) }));
  }

  /** Affiche du médaillon et du fronton quand rien ne joue. */
  function poster(): JukeboxPosterView {
    const l = lib();
    const store = l?.store();
    const empty = !store?.playlists.length;
    let last: { title: string; artist?: string; album?: string } | undefined;
    if (store?.last && l) {
      const v = l.views(store.last.playlist).find((x) => x.track.key === store.last!.key);
      if (v) last = { title: v.info.title, ...(v.info.artist ? { artist: v.info.artist } : {}), ...(v.info.album ? { album: v.info.album } : {}) };
    }
    return jukeboxPoster({ stats: store ? jukeboxSummary(store) : t('Aucune playlist'), empty, ...(last ? { last } : {}) });
  }

  // ---------- Ouverture, fermeture ----------

  /** Mode Juke-box ouvert : la playlist du dernier morceau joué (ou celle dite), rien ne démarre seul. */
  function open(playlist?: string): void {
    const l = lib();
    if (!l) return;
    const input = playlistsInput();
    if (player) {
      // Retour de la gestion : au bureau, la musique jouait en fond ; en borne, elle reprend où elle s'était arrêtée.
      background = false;
      if (resumeOnReturn) {
        resumeOnReturn = false;
        if (player.playing && player.paused) {
          player = { ...player, paused: false };
          apply({ kind: 'resume' });
        }
      }
      if (playlist && input.some((p) => p.id === playlist)) player = { ...player, shown: playlist };
      player = leaveManageRow(player);
      host.log('Juke-box : de nouveau à l’écran.'); // i18n-ignore : journal
      syncDmd();
      return;
    }
    // Retour de la gestion en borne (la musique s'y est arrêtée) : la playlist et le morceau d'avant.
    if (parked) {
      player = leaveManageRow({ ...parked, playing: undefined, paused: false });
      parked = undefined;
      if (playlist && input.some((p) => p.id === playlist)) player = leaveManageRow({ ...player, shown: playlist });
      tops.clear();
      host.log('Juke-box : de retour de la gestion.'); // i18n-ignore : journal
      syncDmd();
      return;
    }
    player = initialPlayer(lists(input), l.store().last);
    if (playlist && input.some((p) => p.id === playlist)) player = { ...player, shown: playlist };
    tops.clear();
    failures = 0;
    host.log(`Juke-box : ouvert (${input.length} playlist(s)).`); // i18n-ignore : journal
    syncDmd();
  }

  /**
   * La gestion du Juke-box s'ouvre (ligne « Gestion du Juke-box », ou son bouton au bureau) : l'état du
   * lecteur est gardé pour y revenir, sur la même playlist et le même morceau.
   */
  let parked: PlayerState | undefined;
  function manage(): void {
    if (!player) return;
    parked = player;
    host.manage?.(player.shown || undefined);
  }

  /** De retour de la gestion : le choix revient au premier morceau s'il était sur la ligne de gestion. */
  function leaveManageRow(state: PlayerState): PlayerState {
    if (state.selected[state.shown] !== JUKEBOX_MANAGE_KEY) return state;
    const first = playlistsInput().find((p) => p.id === state.shown)?.rows[0]?.key;
    if (!first) return state;
    return { ...state, selected: { ...state.selected, [state.shown]: first } };
  }

  function stopPlayback(): void {
    order = undefined;
    time = undefined;
    levels = undefined;
    ad = false;
    card = undefined;
    clearTimeout(cardTimer);
    closeOnline();
  }

  function close(): void {
    if (!player) return;
    stopPlayback();
    player = undefined;
    background = false;
    host.log('Juke-box : fermé, musique arrêtée.'); // i18n-ignore : journal
    syncDmd();
  }

  // ---------- Boutons ----------

  function step(input: PlayerInput): void {
    if (!player) return;
    const input2 = playlistsInput();
    const r = playerStep(player, input, lists(input2));
    player = r.state;
    if (r.effect) apply(r.effect);
    // Liste qui ne bouge que si le choix sort de sa fenêtre.
    keepSelectionVisible(input2);
  }

  function keepSelectionVisible(input = playlistsInput()): void {
    if (!player) return;
    const p = input.find((x) => x.id === player!.shown);
    if (!p) return;
    const ls = lists(input);
    // Rang d'affichage : la ligne « Gestion du Juke-box » en tête, puis les morceaux.
    const index = displayIndex(selectedKey(player, ls), p.rows);
    tops.set(p.id, listTop(tops.get(p.id), index, rows(), p.rows.length + 1));
  }

  /** Un geste de Start : appui, répétition, échéance du seuil, relâchement. */
  function startPress(event: 'down' | 'repeat' | 'tick' | 'up'): void {
    const r = startPressStep(press, event, Date.now());
    press = r.press;
    clearTimeout(pressTimer);
    pressTimer = undefined;
    if (press && !press.done) pressTimer = setTimeout(() => startPress('tick'), Math.max(0, press.since + JUKEBOX_MANAGE_HOLD_MS - Date.now()) + 5);
    if (r.action === 'start') step('start');
    else if (r.action === 'manage') {
      // La gestion prend la main : le relâchement n'arrivera pas ici.
      press = undefined;
      manage();
    }
    host.redraw();
  }

  function handleKey(input: Input): boolean {
    if (!player) return false;
    if (input.type === 'keyUp' && host.keys().confirm.includes(input.code)) {
      startPress('up');
      return true;
    }
    if (input.type !== 'keyDown') return true;
    const k = host.keys();
    const is = (codes: string[]) => codes.includes(input.code);
    // Au clavier du bureau : ↑↓ choisissent un morceau, ←→ une playlist (les flèches gauche et
    // droite seraient sinon des flippers).
    if (input.code === 'ArrowLeft') step('playlist-previous');
    else if (input.code === 'ArrowRight') step('playlist-next');
    else if (input.code === 'ArrowUp') step('previous');
    else if (input.code === 'ArrowDown') step('next');
    else if (is(k.exit)) step('exit');
    // Start : au relâchement s'il est court (jouer, pause) ; maintenu, la gestion (startPress).
    else if (is(k.confirm)) return (startPress(input.isAutoRepeat ? 'repeat' : 'down'), true);
    else if (is(k.previous)) step('previous');
    else if (is(k.next)) step('next');
    else if (is(k.playlistPrevious)) {
      if (!input.isAutoRepeat) step('playlist-previous');
    } else if (is(k.playlistNext)) {
      if (!input.isAutoRepeat) step('playlist-next');
    } else return false;
    host.redraw();
    return true;
  }

  /** Clic dans une fenêtre : une ligne de la liste (la choisir ; déjà choisie : Start), une commande, une playlist voisine. */
  function click(action: { op?: unknown; key?: unknown; dir?: unknown }): void {
    if (!player) return;
    if (action.op === 'row' && typeof action.key === 'string') {
      const shown = player.shown;
      if (player.selected[shown] === action.key) step('start');
      else {
        player = { ...player, selected: { ...player.selected, [shown]: action.key } };
        keepSelectionVisible();
      }
    } else if (action.op === 'start') step('start');
    else if (action.op === 'manage') return manage();
    else if (action.op === 'playlist') step(action.dir === -1 ? 'playlist-previous' : 'playlist-next');
    else if (action.op === 'exit') step('exit');
    host.redraw();
  }

  function apply(effect: PlayerEffect): void {
    switch (effect.kind) {
      case 'play':
        return startTrack(effect.playlist, effect.key);
      case 'pause':
      case 'resume': {
        const paused = effect.kind === 'pause';
        if (order) order = { ...order, paused };
        if (time) time = { ...time, paused };
        if (online) void onlineScript(paused ? PAUSE_SCRIPT : RESUME_SCRIPT);
        if (online) void onlineScript(badgeScript(paused ? t('En pause') : undefined, 'pause'));
        sendTime();
        return;
      }
      case 'stop':
        stopPlayback();
        host.log('Juke-box : plus aucun morceau jouable, lecture arrêtée.'); // i18n-ignore : journal
        return;
      case 'exit':
        close();
        host.leave();
        return;
      case 'refused':
        // L'aide dit déjà pourquoi (Start grisé avec sa raison) : rien de plus.
        return;
      case 'manage':
        return manage();
    }
  }

  // ---------- Lecture ----------

  function startTrack(playlistId: string, key: string): void {
    const l = lib();
    if (!l) return;
    const pb = l.playback(playlistId, key);
    stopPlayback();
    if (!pb) {
      host.log(`Juke-box : ${key} ne se lit pas.`); // i18n-ignore : journal
      return;
    }
    const id = ++orderSeq;
    const base = { id, paused: false, volume: JUKEBOX_ELEMENT_VOLUME, ...(host.output() ? { output: host.output()! } : {}), playlist: playlistId, key };
    if (pb.kind === 'local') order = { ...base, kind: 'local', audio: fileUrl(pb.audio), ...(pb.video ? { video: fileUrl(pb.video) } : {}), ...(imageUrl(pb.image) ? { image: imageUrl(pb.image)! } : {}), audioOnly: !pb.video };
    else if (pb.kind === 'file')
      order = { ...base, kind: 'file', ...(pb.media === 'video' ? { video: fileUrl(pb.path) } : { audio: fileUrl(pb.path) }), ...(imageUrl(pb.image) ? { image: imageUrl(pb.image)! } : {}), audioOnly: pb.media === 'audio' };
    else order = { ...base, kind: 'online', youtube: pb.id, audioOnly: false };
    const v = l.views(playlistId).find((x) => x.track.key === key);
    playingInfo = { title: v?.info.title ?? key, ...(v?.info.artist ? { artist: v.info.artist } : {}) };
    time = { key, position: 0, ...(v?.track.duration !== undefined ? { duration: v.track.duration } : {}), paused: false };
    // Le cartel du changement de morceau, quelques secondes.
    card = { id, until: Date.now() + JUKEBOX_CARD_MS };
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      card = undefined;
      host.redraw();
    }, JUKEBOX_CARD_MS + 50);
    try {
      l.commit(rememberPlayed(l.store(), playlistId, key, new Date()));
    } catch {
      // L'affiche ne retient pas ce morceau : rien de grave.
    }
    host.log(`Juke-box : lecture de ${key} (${pb.kind}) dans ${playlistId}.`); // i18n-ignore : journal
    if (pb.kind === 'online') openOnline(pb, id);
    sendTime();
  }

  /** Message d'une fenêtre (lecture locale) ou relevé du lecteur YouTube. */
  function message(msg: JukeboxMessage): void {
    if (msg.type === 'clip') {
      const r = msg.rect;
      const next = r && r.width > 0 && r.height > 0 ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : undefined;
      if (JSON.stringify(next) !== JSON.stringify(clipRect)) host.log(`Juke-box : cadre du clip ${next ? `${next.width} × ${next.height} en ${next.x}, ${next.y}` : 'absent'}.`); // i18n-ignore : journal
      clipRect = next;
      if (online && !online.win.isDestroyed()) placeView(online.view, clipRect);
      return;
    }
    if (!order || msg.id !== order.id) return;
    if (msg.type === 'time') {
      failures = 0;
      time = { key: order.key, position: msg.position, ...(msg.duration ? { duration: msg.duration } : time?.duration !== undefined ? { duration: time.duration } : {}), paused: msg.paused ?? order.paused };
      sendTime();
    } else if (msg.type === 'levels') {
      levels = { at: Date.now(), values: msg.levels.slice(0, JUKEBOX_SPECTRUM_BANDS).map((v) => (Number.isFinite(v) ? v : 0)) };
    } else if (msg.type === 'ended') {
      ended();
    } else if (msg.type === 'error') {
      host.log(`Juke-box : lecture impossible de ${order.key} (${msg.message ?? 'erreur'}).`); // i18n-ignore : journal
      host.banner(t('Morceau illisible, le suivant joue : {title}', { title: titleOf(order.playlist, order.key) }));
      failed();
    }
  }

  function titleOf(playlist: string, key: string): string {
    return lib()?.views(playlist).find((v) => v.track.key === key)?.info.title ?? key;
  }

  function ended(): void {
    if (!player) return;
    step('ended');
    host.redraw();
  }

  function failed(): void {
    failures++;
    if (failures >= MAX_FAILURES) {
      stopPlayback();
      if (player) player = { ...player, playing: undefined, paused: false };
      host.banner(t('Plusieurs morceaux de suite ne se lisent pas : lecture arrêtée.'));
      host.redraw();
      return;
    }
    ended();
  }

  function sendTime(): void {
    if (!time) return;
    for (const win of host.windows().values()) if (!win.isDestroyed()) win.webContents.send('jukebox-time', time);
  }

  // ---------- Lecteur YouTube (source en ligne) ----------

  let youtube: Session | undefined;
  function youtubeSession(): Session {
    if (youtube) return youtube;
    youtube = session.fromPartition('persist:juke-box');
    // Les noms des sorties audio (sortie du fronton) et setSinkId ; rien d'autre.
    youtube.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'speaker-selection');
    youtube.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'speaker-selection'));
    return youtube;
  }

  function openOnline(pb: Extract<JukeboxPlayback, { kind: 'online' }>, id: number): void {
    const win = host.windows().get(clipRole());
    if (!win || win.isDestroyed()) return;
    const view = new WebContentsView({
      webPreferences: { session: youtubeSession(), contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: OFFSCREEN, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.contentView.addChildView(view);
    placeView(view, clipRect);
    // Jamais d'écran clair : le fond de la vue est celui du menu tant que la page n'a rien peint.
    view.setBackgroundColor('#030807');
    // Hors écran (essais), rien ne s'entend.
    if (OFFSCREEN) view.webContents.setAudioMuted(true);
    // La fenêtre fermée (relance, sortie) ne détruit pas sa vue (Electron) : la page et son son s'arrêtent avec elle.
    win.on('closed', () => {
      if (online?.view === view) closeOnline();
      // Vue déjà fermée (lecture arrêtée avant la fenêtre) : son webContents n'existe plus.
      else if (view.webContents && !view.webContents.isDestroyed()) view.webContents.close();
    });
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Un clic sur le lecteur (titre, logo) ne quitte pas le lecteur intégré.
    contents.on('will-navigate', (event, url) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(url) && !url.startsWith('file:')) event.preventDefault();
    });
    contents.on('dom-ready', () => {
      void contents.insertCSS(YOUTUBE_CSS).catch(() => undefined);
      void installCard(contents);
    });
    // Son du lecteur sur la sortie du fronton, retrouvée par son nom (comme la musique du menu).
    contents.on('did-frame-finish-load', (_e, _main, processId, routingId) => {
      const output = host.output();
      const frame = output ? webFrameMain.fromId(processId, routingId) : undefined;
      if (frame) void frame.executeJavaScript(audioSinkScript(output!)).catch(() => undefined);
    });
    online = { id, view, win, started: Date.now(), timer: setInterval(() => void probeOnline(), ONLINE_PROBE_MS) };
    if (host.fakeOnline) void contents.loadFile(host.fakeOnline, { query: { v: pb.id } }).catch(() => undefined);
    else void contents.loadURL(pb.url, { httpReferrer: pb.referrer }).catch(() => undefined);
  }

  function closeOnline(): void {
    if (!online) return;
    clearInterval(online.timer);
    const { view, win } = online;
    online = undefined;
    try {
      if (!win.isDestroyed()) win.contentView.removeChildView(view);
    } catch {
      // Fenêtre déjà fermée.
    }
    // La vue retirée ne se détruit pas d'elle-même (Electron) : sa page et son son s'arrêtent ici.
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  async function onlineScript(code: string): Promise<unknown> {
    const o = online;
    if (!o || o.view.webContents.isDestroyed()) return undefined;
    return o.view.webContents.executeJavaScript(code).catch(() => undefined);
  }

  /** Police de l'interface pour le cartel posé dans la page du lecteur (elle n'a pas la sienne). */
  let fontData: string | undefined;
  function fontBase64(): string {
    if (fontData !== undefined) return fontData;
    try {
      fontData = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'polices', 'saira', 'Saira-wdth-wght.ttf')).toString('base64');
    } catch {
      fontData = '';
    }
    return fontData;
  }

  async function installCard(contents: Electron.WebContents): Promise<void> {
    const o = online;
    if (!o || !order || order.kind !== 'online') return;
    const now = nowView();
    const info = {
      font: fontBase64(),
      eyebrow: now ? cardEyebrow(now) : '',
      title: now?.title ?? '',
      artist: now?.artist ?? '',
      album: now?.album ?? '',
      ms: Math.max(0, (card?.until ?? 0) - Date.now()),
    };
    await contents.executeJavaScript(`(${CARD_SCRIPT})(${JSON.stringify(info)})`).catch(() => undefined);
    await contents.executeJavaScript(UNMUTE_SCRIPT).catch(() => undefined);
  }

  async function probeOnline(): Promise<void> {
    const o = online;
    if (!o || !order || order.id !== o.id) return;
    const r = (await onlineScript(PROBE_SCRIPT)) as
      | { state?: number; time?: number; duration?: number; paused?: boolean; ended?: boolean; ad?: boolean; code?: number; error?: string; levels?: number[] }
      | undefined;
    if (!r || online !== o || !order) return;
    if (typeof r.code === 'number' || r.error) {
      const code = typeof r.code === 'number' ? r.code : undefined;
      const reason = code !== undefined ? embedErrorReason(code) : undefined;
      const text = code !== undefined ? embedErrorText(code) : r.error!;
      host.log(`Juke-box : YouTube refuse ${order.youtube} (${code ?? '?'} : ${text}).`); // i18n-ignore : journal
      if (reason && order.youtube) lib()?.markEmbedError?.(order.youtube, reason);
      host.banner(code === 152 || code === 153 ? t('YouTube refuse le lecteur de Cyber Pinball ({text}) : le suivant joue.', { text }) : t('{title} : {text}, le suivant joue.', { title: titleOf(order.playlist, order.key), text: reason ? unavailableText(reason) : text }));
      failed();
      return;
    }
    if (Boolean(r.ad) !== ad) {
      ad = Boolean(r.ad);
      void onlineScript(badgeScript(ad ? t('Publicité YouTube') : undefined, 'ad'));
      host.redraw();
    }
    if (r.ad) return;
    if (typeof r.time === 'number') {
      if (r.time > 0) failures = 0;
      time = { key: order.key, position: r.time, ...(r.duration ? { duration: r.duration } : time?.duration !== undefined ? { duration: time.duration } : {}), paused: order.paused };
      sendTime();
    }
    if (Array.isArray(r.levels)) levels = { at: Date.now(), values: r.levels };
    if ((r.state === 0 || r.ended) && !o.ended && Date.now() - o.started > 2000) {
      o.ended = true;
      ended();
    }
  }

  // ---------- DMD ----------

  /** Le DMD du Juke-box : JUKE-BOX et ses chiffres sur la roue, le spectre en lecture ; rien ailleurs. */
  function syncDmd(onWheel = false): void {
    const want: 'wheel' | 'player' | undefined = !host.dmdOn() ? undefined : player ? 'player' : onWheel ? 'wheel' : undefined;
    if (want === 'wheel') {
      const store = lib()?.store();
      const stats = { tracks: store?.playlists.reduce((n, p) => n + p.tracks.length, 0) ?? 0, playlists: store?.playlists.length ?? 0 };
      if (dmd?.kind === 'wheel' && stats.tracks === wheelStats.tracks && stats.playlists === wheelStats.playlists) return;
      wheelStats = stats;
      dmd?.stop();
      const dots = jukeboxSelectionDots(stats);
      const handle = host.dmd('juke-box', { dots: () => dots });
      dmd = { kind: 'wheel', stop: () => handle.stop() };
      return;
    }
    if (want === 'player') {
      if (dmd?.kind === 'player') return;
      dmd?.stop();
      const handle = host.dmd('juke-box', {
        dots: (elapsed) => {
          const now = order ? playingInfo : undefined;
          const fresh = levels && Date.now() - levels.at < 400 ? levels.values : undefined;
          const playing = Boolean(order && !order.paused && !ad);
          return jukeboxSpectrumDots({ ...(now?.artist ? { artist: now.artist } : {}), ...(now?.title ? { title: now.title } : {}), levels: playing ? (fresh ?? idleSpectrum(elapsed, true)) : idleSpectrum(elapsed, false), elapsed });
        },
      });
      dmd = { kind: 'player', stop: () => handle.stop() };
      return;
    }
    dmd?.stop();
    dmd = undefined;
  }

  // ---------- Vues ----------

  function nowView(): JukeboxNowView | undefined {
    if (!player?.playing) return undefined;
    return playerView().now;
  }

  function cardEyebrow(now: JukeboxNowView): string {
    return `${now.playlist} · ${now.position}`;
  }

  function playerView(): JukeboxPlayerView {
    const input = playlistsInput();
    const shown = player?.shown ?? '';
    const p = input.find((x) => x.id === shown);
    if (p && !tops.has(p.id)) keepSelectionVisible(input);
    return jukeboxPlayerView({ playlists: input, state: player ?? { shown: '', selected: {}, paused: false }, top: tops.get(shown) ?? 0, rows: rows(), ad, audioOnly: order?.audioOnly ?? false, ...(press && !press.done ? { holdSince: press.since } : {}) });
  }

  /** La part du Juke-box dans l'état d'une fenêtre ; onWheel : le médaillon est choisi dans la roue. */
  function view(role: RoleId, onWheel: boolean): JukeboxWindowView | undefined {
    const roles = host.windowRoles().get(role) ?? [role];
    if (!player) {
      if (!onWheel) return undefined;
      return { wheel: { poster: poster() }, layout: layout() };
    }
    const pv = playerView();
    const out: JukeboxWindowView = { layout: layout() };
    if (role === 'playfield' && !background) out.player = pv;
    if (role === clipRole()) {
      const now = pv.now;
      out.clip = {
        place: background ? 'hidden' : roles.includes('backglass') && !host.desk() ? 'zone' : host.desk() ? 'desk' : 'thumb',
        ...(order ? { order: { id: order.id, kind: order.kind, ...(order.audio ? { audio: order.audio } : {}), ...(order.video ? { video: order.video } : {}), ...(order.image ? { image: order.image } : {}), paused: order.paused, ...(order.output ? { output: order.output } : {}), volume: order.volume } } : {}),
        ...(now ? { now } : {}),
        ...(card && now && order?.kind !== 'online' ? { card: { id: card.id, eyebrow: cardEyebrow(now), until: card.until } } : {}),
        poster: poster(),
      };
      // En borne, pendant la gestion : le morceau en pause et l'affiche sur le fronton, jamais vide.
      if (background && !host.desk()) out.cover = { ...(pv.now ? { now: pv.now } : {}), poster: poster() };
    } else if (roles.includes('backglass')) out.cover = { ...(pv.now ? { now: pv.now } : {}), poster: poster() };
    return out;
  }

  return {
    active: () => Boolean(player),
    open,
    close,
    /** Au bureau, la gestion ouverte depuis le lecteur : la musique continue, sans écran. */
    /**
     * La gestion ouverte depuis le lecteur : le clip quitte l'écran. Au bureau la musique continue ;
     * en borne (`pause`), elle se met en pause et reprend au retour, là où elle s'était arrêtée.
     */
    toBackground(pause = false): void {
      if (!player || background) return;
      background = true;
      if (online && !online.win.isDestroyed()) placeView(online.view, undefined);
      if (pause && player.playing && !player.paused) {
        player = { ...player, paused: true };
        apply({ kind: 'pause' });
        resumeOnReturn = true;
      }
      host.log(pause ? 'Juke-box : lecture en pause pendant la gestion.' : 'Juke-box : la musique continue pendant la gestion.'); // i18n-ignore : journal
    },
    inBackground: () => background,
    handleKey,
    click,
    message,
    view,
    syncDmd,
    /** Temps du morceau en cours (fenêtre rechargée). */
    time: () => time,
    /** État des règles de lecture, pour les essais. */
    state: () => player,
    /** Ce que joue le lecteur, pour les essais sans opérateur. */
    status: () => ({
      ouvert: Boolean(player),
      playlist: player?.shown,
      choix: player ? player.selected[player.shown] : undefined,
      lecture: order ? { morceau: order.key, source: order.kind, pause: order.paused, publicite: ad, temps: time ? formatNumber(Math.round(time.position)) : undefined } : undefined,
      enLigne: online ? { vue: true, cadre: clipRect, bornes: online.view.getBounds() } : undefined,
    }),
    /** Capture de la vue du lecteur YouTube (elle n'est pas dans celle de sa fenêtre). */
    onlineCapture: async (): Promise<Buffer | undefined> => {
      if (!online || online.view.webContents.isDestroyed()) return undefined;
      const b = online.view.getBounds();
      const image = await online.view.webContents.capturePage();
      const size = image.getSize();
      host.log(`Juke-box : vue en ligne ${b.width} × ${b.height} en ${b.x}, ${b.y} (image ${size.width} × ${size.height}).`); // i18n-ignore : journal
      return image.toPNG();
    },
    dispose(): void {
      stopPlayback();
      dmd?.stop();
      dmd = undefined;
    },
  };
}

export type JukeboxPlayer = ReturnType<typeof createJukeboxPlayer>;

// ---------- Scripts joués dans la page du lecteur YouTube ----------

/** Ce que le lecteur intégré ne doit pas montrer par-dessus le clip : titre, logo, suggestions à la pause. */
const YOUTUBE_CSS = `
html, body { background: #030807 !important; }
.ytp-chrome-top, .ytp-watermark, .ytp-pause-overlay, .ytp-show-cards-title, .ytp-gradient-top, .ytp-youtube-button, .ytp-impression-link, .ytp-title { display: none !important; }
`;

/**
 * Relevé du lecteur : état (0 : fini), temps, durée, publicité (classe ad-showing), erreur (code
 * de l'API du lecteur, sinon le message affiché). L'écouteur onError du lecteur est posé au premier passage.
 */
const PROBE_SCRIPT = `(() => {
  const p = document.getElementById('movie_player');
  const v = document.querySelector('video');
  const st = window.__cyberJukebox || (window.__cyberJukebox = { errors: [] });
  if (p && !st.hooked && typeof p.addEventListener === 'function') {
    try { p.addEventListener('onError', (e) => st.errors.push(Number(e && typeof e === 'object' && 'data' in e ? e.data : e))); st.hooked = true; } catch (e) {}
  }
  const err = document.querySelector('.ytp-error');
  const shown = err && err.getClientRects().length > 0;
  return {
    state: p && typeof p.getPlayerState === 'function' ? p.getPlayerState() : undefined,
    time: v ? v.currentTime : undefined,
    duration: v && isFinite(v.duration) && v.duration > 0 ? v.duration : (p && typeof p.getDuration === 'function' ? p.getDuration() : undefined),
    paused: v ? v.paused : undefined,
    ended: v ? v.ended : false,
    ad: Boolean(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))),
    code: st.errors.length ? st.errors[st.errors.length - 1] : undefined,
    error: shown ? (err.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160) || undefined : undefined,
  };
})()`;

const PAUSE_SCRIPT = `(() => { const p = document.getElementById('movie_player'); if (p && typeof p.pauseVideo === 'function') p.pauseVideo(); else { const v = document.querySelector('video'); if (v) v.pause(); } })()`;
const RESUME_SCRIPT = `(() => { const p = document.getElementById('movie_player'); if (p && typeof p.playVideo === 'function') p.playVideo(); else { const v = document.querySelector('video'); if (v) v.play(); } })()`;
/** Volume de la borne : le lecteur joue à plein, jamais coupé (il retient sinon le dernier volume choisi sur YouTube). */
const UNMUTE_SCRIPT = `(() => { const p = document.getElementById('movie_player'); if (p && typeof p.unMute === 'function') { p.unMute(); if (typeof p.setVolume === 'function') p.setVolume(100); } const v = document.querySelector('video'); if (v) { v.muted = false; v.volume = ${JUKEBOX_ELEMENT_VOLUME}; } })()`;

/**
 * Cartel du changement de morceau, posé dans la page du lecteur (la vue passe devant la page du
 * menu) : mêmes place, couleurs et police que celui des clips locaux (jukebox.css, .jb-card).
 * Les éléments sont construits un par un (YouTube impose les Trusted Types : pas d'innerHTML).
 */
const CARD_SCRIPT = /* i18n-ignore : script de page, du code ; ses textes arrivent traduits */ `(info) => {
  const css = (el, s) => { el.setAttribute('style', s); return el; };
  if (info.font && !window.__cyberFont) {
    try {
      const bin = atob(info.font); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const face = new FontFace('CyberSaira', buf.buffer, { weight: '100 900', stretch: '50% 125%' }); document.fonts.add(face); face.load(); window.__cyberFont = true;
    } catch (e) {}
  }
  const old = document.getElementById('cyber-card'); if (old) old.remove();
  if (!info.ms || !info.title) return;
  const box = css(document.createElement('div'), 'position:fixed;left:3.34vw;bottom:5.93vh;max-width:62.5vw;padding:2.41vh 1.77vw;border-left:4px solid #5fb4cf;background:rgba(3,8,7,.93);color:#e6f0ec;font-family:CyberSaira,"Segoe UI",sans-serif;z-index:2147483647;transition:opacity .4s;pointer-events:none');
  box.id = 'cyber-card';
  const eyebrow = css(document.createElement('div'), 'font-size:1.85vh;letter-spacing:.16em;text-transform:uppercase;color:#9bada7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  eyebrow.textContent = info.eyebrow;
  const title = css(document.createElement('div'), 'font-size:5.19vh;line-height:1.15;font-weight:600;margin:.74vh 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  title.textContent = info.title;
  const line = css(document.createElement('div'), 'font-size:2.59vh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  line.textContent = info.artist;
  if (info.album) { const album = css(document.createElement('span'), 'color:#9bada7'); album.textContent = ' · ' + info.album; line.appendChild(album); }
  box.append(eyebrow, title, line);
  document.body.appendChild(box);
  clearTimeout(window.__cyberCardTimer);
  window.__cyberCardTimer = setTimeout(() => { box.style.opacity = '0'; setTimeout(() => box.remove(), 450); }, info.ms);
}`;

/** Repère discret en haut à droite du clip (« En pause », « Publicité YouTube »), posé ou retiré. */
function badgeScript(text: string | undefined, kind: 'pause' | 'ad'): string {
  return /* i18n-ignore : script de page, du code ; le texte arrive traduit */ `((text, kind) => {
  const id = 'cyber-badge-' + kind;
  const old = document.getElementById(id); if (old) old.remove();
  if (!text) return;
  const b = document.createElement('div'); b.id = id;
  b.setAttribute('style', 'position:fixed;right:2.5vw;top:' + (kind === 'ad' ? '4.44vh' : '11.5vh') + ';padding:1.11vh 1.04vw;background:rgba(3,8,7,.91);border:1px solid #24504a;border-radius:6px;color:#e6f0ec;font-family:CyberSaira,"Segoe UI",sans-serif;font-size:2.22vh;z-index:2147483647;pointer-events:none');
  b.textContent = text;
  document.body.appendChild(b);
})(${JSON.stringify(text ?? '')}, ${JSON.stringify(kind)})`;
}
