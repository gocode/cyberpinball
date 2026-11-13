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
import { nativeImage, session, webFrameMain, WebContentsView, type BrowserWindow, type Input, type Rectangle, type Session } from 'electron';
import {
  audioSinkScript,
  JUKEBOX_EMBED_REFERRER,
  youtubeEmbedUrl,
  embedErrorReason,
  embedErrorText,
  formatNumber,
  idleSpectrum,
  initialPlayer,
  jukeboxInput,
  menuButton,
  isJukeboxAction,
  JUKEBOX_SEEK_EVERY_MS,
  seekPressStep,
  seekTarget,
  type SeekPress,
  playlistAt,
  playlistRows,
  rememberPlayModes,
  rowKey,
  trackRows,
  startPressStep,
  type StartPress,
  JUKEBOX_MANAGE_HOLD_MS,
  jukeboxPlayerView,
  jukeboxPoster,
  jukeboxSelectionDots,
  coverPalette,
  createJukeboxVisualizer,
  jukeboxEntranceFrame,
  jukeboxSummary,
  keyLabel,
  listTop,
  mediaUrl,
  playerStep,
  playModeOf,
  followTransfer,
  rememberPlayed,
  t,
  unavailableText,
  JUKEBOX_ELEMENT_VOLUME,
  JUKEBOX_ENTRANCE,
  JUKEBOX_LIST_ROWS,
  JUKEBOX_SPECTRUM_BANDS,
  type DmdAnimation,
  type InterfaceKeys,
  type JukeboxNowView,
  type JukeboxPlayerView,
  type JukeboxPlaylistInput,
  type JukeboxPosterView,
  type JukeboxVisualizerMode,
  type JukeboxAudioRoute,
  type Rgb,
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
  /**
   * Sorties du son du Juke-box (Réglages du Juke-box, jukeboxRoutes) : une route par sortie active ;
   * absent, la sortie du fronton, son intact.
   */
  routes?(): JukeboxAudioRoute[];
  /** Rend un fichier lisible par le protocole des médias (media-protocol.ts). */
  allow(file: string): void;
  /** Exit : retour à la roue (la musique est déjà arrêtée). */
  leave(): void;
  redraw(): void;
  /** DMD du menu vivant : une animation par-dessus l'alternance (live-dmd.ts). */
  dmd(name: string, animation: DmdAnimation): { stop(): void };
  /** Le DMD montre les points (écran du DMD, ni partie ni bureau Windows). */
  dmdOn(): boolean;
  /** Visualiseur du DMD (réglage « Visualiseur du Juke-box ») et couleur réglée des points (Classique). */
  visualizer?(): { mode: JukeboxVisualizerMode; color: string };
  banner(text: string): void;
  log(line: string): void;
  /**
   * Les boutons du menu, tels que la roue les résout (menuButton) : ceux de l'interface, les touches des
   * collections (MagnaSave), et tous les codes relevés de la borne (une flèche relevée reste son bouton).
   */
  keys(): { keys: InterfaceKeys; collections: { previous: string[]; next: string[] }; cabinet: string[]; magnaRecorded: boolean };
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
  /** Sorties du son, relues à chaque état : un réglage changé s'entend sans relancer le morceau. */
  routes?: JukeboxAudioRoute[];
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
  /** Flipper tenu : la position où recaler le morceau (un nouveau numéro à chaque pas). */
  seek?: { id: number; to: number };
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
  /**
   * Entrée dans le Juke-box depuis la roue (jukebox-entrance.ts) : chaque fenêtre en déduit où en
   * est l'animation (Date.now() - startedAt), et les trois écrans restent d'accord. Absente : rien à
   * jouer (finie, interrompue par un bouton, ou retour de la gestion).
   */
  entrance?: { id: number; startedAt: number; poster: JukeboxPosterView };
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
  | { type: 'clip'; rect?: { x: number; y: number; width: number; height: number } }
  /** Contrôle de débordement de la page (une fois par ouverture) : ce qui dépasse de la fenêtre. */
  | { type: 'overflow'; text: string }
  /** Sortie sur laquelle le morceau joue vraiment (une fois par morceau) : le journal la note. */
  | { type: 'sink'; id: number; label?: string; problem?: string; routed: boolean };

const isAbsolute = (p: string | undefined): p is string => Boolean(p && path.isAbsolute(p));

/** Défilement du niveau des playlists (tops : sinon, celui de chaque playlist). */
const PLAYLISTS_TOP = '@playlists';

export function createJukeboxPlayer(host: JukeboxPlayerHost) {
  let player: PlayerState | undefined;
  /** Dernière playlist ouverte : le curseur y revient à l'entrée suivante dans le Juke-box. */
  let opened: string | undefined;
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
  /**
   * Flipper (ou flèche du bureau) appuyé pendant qu'un morceau est en cours : court, la ligne voisine au
   * relâchement ; tenu, l'avance dans le morceau (seekPressStep). `code` : la touche à relâcher ;
   * `short` : ce que fait l'appui court.
   */
  let seek: { press: SeekPress; code: string; short: () => void; timer?: NodeJS.Timeout } | undefined;
  /** Position visée pendant l'avance (les pas s'ajoutent sans attendre le temps lu), et le dernier ordre de recalage. */
  let seekPos: number | undefined;
  let seekOrder: { id: number; to: number } | undefined;
  let seekSeq = 0;
  /** La position reste en grand sur la carte un instant après le relâchement. */
  let seekShownUntil = 0;
  let pressTimer: NodeJS.Timeout | undefined;
  /** Titre et artiste du morceau en cours, pour le DMD (25 images par seconde). */
  let playingInfo: { title: string; artist?: string } | undefined;
  /** Couleurs de la pochette du morceau en cours (visualiseur « Pochette »), lues une fois par morceau. */
  let coverColors: { key: string; palette?: Rgb[] } | undefined;
  /** Entrée depuis la roue en cours (animation des trois écrans), interrompue par le premier bouton. */
  let entrance: { id: number; startedAt: number } | undefined;
  let entranceSeq = 0;
  /** Le cadre du clip dans sa fenêtre (pixels de la page), dit par la fenêtre du clip. */
  let clipRect: Rectangle | undefined;
  let online: { id: number; view: WebContentsView; win: BrowserWindow; timer: NodeJS.Timeout; started: number; ended?: boolean; lastTime?: number; routed?: boolean } | undefined;
  let dmd: { kind: 'wheel' | 'player'; stop(): void } | undefined;
  let wheelStats = { tracks: 0, playlists: 0 };

  // Un morceau déplacé vers une autre playlist pendant qu'il joue (gestion du Juke-box) : la lecture
  // continue sans coupure, puis reprend dans l'origine (followTransfer). Abonné une fois par bibliothèque.
  let watched: unknown;
  const lib = () => {
    const l = host.library();
    if (l && l !== watched) {
      watched = l;
      l.onTransfer((tr) => {
        if (!player) return;
        player = followTransfer(player, tr);
        inputCache = undefined;
        host.redraw();
      });
    }
    return l;
  };
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
      host.log('Juke-box : de nouveau à l’écran.'); // i18n-ignore : journal
      syncDmd();
      return;
    }
    // Retour de la gestion (la musique s'y est arrêtée) : exactement où l'on était, niveau et playlist.
    if (parked) {
      player = { ...parked, playing: undefined, paused: false };
      parked = undefined;
      tops.clear();
      host.log('Juke-box : de retour de la gestion.'); // i18n-ignore : journal
      syncDmd();
      return;
    }
    player = initialPlayer(lists(input), l.store().last, opened, l.store().modes);
    entrance = { id: ++entranceSeq, startedAt: Date.now() };
    // Fin de l'entrée : un état sans elle, pour que chaque fenêtre retire son décor (rien d'autre n'attend ce minuteur).
    const id = entrance.id;
    setTimeout(() => {
      if (entrance?.id !== id) return;
      entrance = undefined;
      host.redraw();
    }, JUKEBOX_ENTRANCE.end + 100).unref?.();
    // Retour d'un téléchargement : ses morceaux, directement.
    if (playlist && input.some((p) => p.id === playlist)) player = { ...player, level: 'tracks', at: playlist, shown: playlist };
    tops.clear();
    failures = 0;
    host.log(`Juke-box : ouvert (${input.length} playlist(s)).`); // i18n-ignore : journal
    // Les boutons tels que la roue les résout : une borne où un bouton ne fait pas ce qu'on attend s'explique.
    const k = host.keys();
    const name = (codes: readonly string[]) => (codes.length ? codes.map(keyLabel).join(', ') : 'aucune'); // i18n-ignore : journal
    host.log(`Juke-box : boutons, choisir ${name(k.keys.previous)} / ${name(k.keys.next)}, Start ${name(k.keys.confirm)}, Exit ${name(k.keys.exit)}, playlist voisine ${name(k.collections.previous)} / ${name(k.collections.next)}${k.magnaRecorded ? '' : ' (MagnaSave non relevés)'}.`); // i18n-ignore : journal
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
    entrance = undefined;
    background = false;
    host.log('Juke-box : fermé, musique arrêtée.'); // i18n-ignore : journal
    syncDmd();
  }

  // ---------- Boutons ----------

  function step(input: PlayerInput): void {
    if (!player) return;
    const input2 = playlistsInput();
    const before = player.modes;
    const r = playerStep(player, input, lists(input2));
    player = r.state;
    if (player.level === 'tracks') opened = player.shown;
    // Un mode de lecture changé (aléatoire, répétition) est retenu pour la playlist, d'une fois sur l'autre.
    const l = lib();
    if (l && player.modes !== before) l.commit(rememberPlayModes(l.store(), player.modes));
    if (r.effect) apply(r.effect);
    // Liste qui ne bouge que si le choix sort de sa fenêtre.
    keepSelectionVisible(input2);
  }

  function keepSelectionVisible(input = playlistsInput()): void {
    if (!player) return;
    const ls = lists(input);
    if (player.level === 'playlists') {
      // La ligne « Gestion du Juke-box » en tête, puis les playlists.
      const all = playlistRows(ls);
      tops.set(PLAYLISTS_TOP, listTop(tops.get(PLAYLISTS_TOP), Math.max(0, all.indexOf(playlistAt(player, ls))), rows(), all.length));
      return;
    }
    const list = ls.find((x) => x.id === player!.shown);
    if (!list) return;
    // Les lignes fixes (gestion, Tout lire, Lecture aléatoire, Répétition), puis les morceaux.
    const all = trackRows(list);
    tops.set(list.id, listTop(tops.get(list.id), Math.max(0, all.indexOf(rowKey(player, ls) ?? '')), rows(), all.length));
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
      // Start maintenu : la lecture aléatoire d'une playlist choisie au niveau 1, sinon la gestion
      // (qui prend la main : le relâchement n'arrivera pas ici).
      press = undefined;
      step('hold');
    }
    host.redraw();
  }

  /** Un geste de flipper : appui, répétition, échéance, relâchement (seekPressStep). */
  function flipperGesture(event: 'down' | 'repeat' | 'tick' | 'up', dir: -1 | 1, code: string, short: () => void): void {
    const r = seekPressStep(seek?.press, event, Date.now(), dir, Boolean(player?.playing));
    if (r.press) {
      seek = { ...(seek ?? {}), press: r.press, code, short };
      if (!seek.timer) seek.timer = setInterval(() => seek && flipperGesture('tick', seek.press!.dir, seek.code, seek.short), JUKEBOX_SEEK_EVERY_MS);
    } else {
      if (seek?.timer) clearInterval(seek.timer);
      if (seek?.press?.seeking) {
        host.log(`Juke-box : morceau recalé à ${Math.round(seekPos ?? 0)} s (flipper tenu).`); // i18n-ignore : journal
        // La position reste lisible un instant, puis la carte reprend son allure.
        seekShownUntil = Date.now() + 900;
        setTimeout(() => host.redraw(), 950);
      }
      seek = undefined;
      seekPos = undefined;
    }
    if (r.action && 'move' in r.action) short();
    else if (r.action && 'seek' in r.action) seekBy(r.action.seek);
    host.redraw();
  }

  /** Avance (ou recule) de `delta` secondes dans le morceau en cours, quelle que soit sa source. */
  function seekBy(delta: number): void {
    if (!player?.playing) return;
    const duration = time?.duration ?? durationOf(player.playing);
    seekTo(seekTarget(seekPos ?? time?.position ?? 0, delta, duration));
  }

  function seekTo(to: number): void {
    seekPos = to;
    seekOrder = { id: ++seekSeq, to };
    // En ligne : le lecteur YouTube, dans sa vue ; sinon la fenêtre du clip (son et vidéo, ou fichier).
    if (online) void onlineScript(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${to}; })()`);
    if (time) {
      time = { ...time, position: to };
      sendTime();
    }
  }

  /** Durée connue du morceau en cours (index), tant que le lecteur ne l'a pas encore dite. */
  function durationOf(playing: { playlist: string; key: string }): number | undefined {
    return playlistsInput().find((x) => x.id === playing.playlist)?.rows.find((r) => r.key === playing.key)?.duration;
  }

  function handleKey(input: Input): boolean {
    if (!player) return false;
    if (input.type === 'keyUp' && host.keys().keys.confirm.includes(input.code)) {
      startPress('up');
      return true;
    }
    if (input.type === 'keyUp' && seek && input.code === seek.code) {
      flipperGesture('up', seek.press!.dir, seek.code, seek.short);
      return true;
    }
    if (input.type !== 'keyDown') return true;
    // Un bouton pendant l'entrée l'arrête net (chaque écran passe à son état final) et fait son office.
    if (entrance && !input.isAutoRepeat) {
      entrance = undefined;
      host.redraw();
    }
    const k = host.keys();
    const event = input.isAutoRepeat ? 'repeat' : 'down';
    // Au clavier du bureau, dans une playlist : ←→ passent à la playlist voisine (comme les MagnaSave),
    // sauf si la borne a relevé ces flèches comme boutons : elles gardent alors leur rôle. Tenues pendant
    // un morceau, elles avancent ou reculent dedans, comme les flippers.
    const arrow = !k.cabinet.includes(input.code) && (input.code === 'ArrowLeft' || input.code === 'ArrowRight');
    if (arrow) {
      const dir = input.code === 'ArrowLeft' ? -1 : 1;
      const short = () => {
        if (player?.level === 'tracks') step(dir < 0 ? 'playlist-previous' : 'playlist-next');
      };
      if (player.playing) flipperGesture(event, dir, input.code, short);
      else {
        if (!input.isAutoRepeat) short();
        host.redraw();
      }
      return true;
    }
    // Le rôle du bouton, résolu comme sur la roue (menuButton) : un bouton qui y fait Exit fait Exit ici.
    const button = menuButton(input.code, k.keys, k.collections);
    // Start : au relâchement s'il est court (ouvrir, jouer, pause) ; maintenu, la gestion (startPress).
    if (button === 'confirm') return (startPress(input.isAutoRepeat ? 'repeat' : 'down'), true);
    const move = jukeboxInput(button, player.level);
    if (!move) return button !== undefined;
    // Flippers : appui court, la ligne voisine ; tenus pendant un morceau, l'avance dans le morceau.
    if (move === 'previous' || move === 'next') {
      flipperGesture(event, move === 'previous' ? -1 : 1, input.code, () => step(move));
      return true;
    }
    // Un MagnaSave ou Exit tenu ne répète pas son effet (une playlist à la fois, un niveau à la fois).
    if (input.isAutoRepeat) return true;
    step(move);
    host.redraw();
    return true;
  }

  /** Clic dans une fenêtre : une ligne de la liste (la choisir ; déjà choisie : Start), une commande, une playlist voisine. */
  function click(action: { op?: unknown; key?: unknown; dir?: unknown; fraction?: unknown }): void {
    if (!player) return;
    // Clic dans la barre de progression (bureau) : cet endroit du morceau.
    if (action.op === 'seek-to' && typeof action.fraction === 'number' && player.playing) {
      const duration = time?.duration ?? durationOf(player.playing);
      if (duration) seekTo(seekTarget(0, Math.min(1, Math.max(0, action.fraction)) * duration, duration));
      seekPos = undefined;
      host.redraw();
      return;
    }
    if (action.op === 'row' && typeof action.key === 'string' && player.level === 'playlists') {
      // Une playlist (ou la gestion) cliquée : elle s'ouvre.
      player = { ...player, at: action.key };
      step('start');
    } else if (action.op === 'up') {
      if (player.level === 'tracks') step('exit');
    } else if (action.op === 'row' && typeof action.key === 'string' && isJukeboxAction(action.key)) {
      // Une ligne fixe cliquée (gestion, Tout lire, Lecture aléatoire, Répétition) : elle agit.
      player = { ...player, selected: { ...player.selected, [player.shown]: action.key } };
      step('start');
    } else if (action.op === 'pause') {
      // Bouton Pause de la carte (bureau) : le morceau en cours, quel que soit le niveau.
      if (player.playing) {
        const paused = !player.paused;
        player = { ...player, paused };
        apply({ kind: paused ? 'pause' : 'resume' });
      }
    // Molette (bureau) : la ligne voisine ; le pied « ↑ avant · après ↓ » cliqué : une fenêtre de lignes.
    } else if (action.op === 'wheel' || action.op === 'page') {
      for (let i = 0; i < (action.op === 'page' ? rows() : 1); i++) step(action.dir === -1 ? 'previous' : 'next');
      host.log(`Juke-box : ${action.op === 'page' ? 'page' : 'molette'} ${action.dir === -1 ? 'vers le haut' : 'vers le bas'}, ${player.level === 'tracks' ? (player.selected[player.shown] ?? '?') : player.at} choisi.`); // i18n-ignore : journal
    }
    else if (action.op === 'shuffle') step('shuffle-toggle');
    else if (action.op === 'repeat') step('repeat-cycle');
    else if (action.op === 'row' && typeof action.key === 'string') {
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
      case 'open':
        host.log(`Juke-box : playlist ${effect.playlist} ouverte.`); // i18n-ignore : journal
        return;
      case 'up':
        host.log('Juke-box : retour aux playlists, la musique continue.'); // i18n-ignore : journal
        return;
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
    readCoverColors(key, (pb.kind !== 'online' ? pb.image : undefined) ?? v?.image);
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
    if (msg.type === 'overflow') {
      if (typeof msg.text === 'string') host.log(`Juke-box : la page déborde de la fenêtre : ${msg.text.slice(0, 400)}`); // i18n-ignore : journal
      return;
    }
    if (msg.type === 'clip') {
      const r = msg.rect;
      const next = r && r.width > 0 && r.height > 0 ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : undefined;
      if (JSON.stringify(next) !== JSON.stringify(clipRect)) host.log(`Juke-box : cadre du clip ${next ? `${next.width} × ${next.height} en ${next.x}, ${next.y}` : 'absent'}.`); // i18n-ignore : journal
      clipRect = next;
      if (online && !online.win.isDestroyed()) placeView(online.view, clipRect);
      return;
    }
    if (!order || msg.id !== order.id) return;
    if (msg.type === 'sink') {
      const wanted = host.output();
      const where = msg.routed ? `« ${String(msg.label ?? '').slice(0, 120)} »` : 'la sortie par défaut de Windows'; // i18n-ignore : journal
      const warn = wanted && !msg.routed ? ` [avertissement] sortie voulue « ${wanted} »${msg.problem ? ` (${String(msg.problem).slice(0, 160)})` : ''}` : ''; // i18n-ignore : journal
      host.log(`Juke-box : ${order.key} joue sur ${where}.${warn}`); // i18n-ignore : journal
      return;
    }
    if (msg.type === 'time') {
      failures = 0;
      time = { key: order.key, position: msg.position, ...(msg.duration ? { duration: msg.duration } : time?.duration !== undefined ? { duration: time.duration } : {}), paused: msg.paused ?? order.paused };
      sendTime();
    } else if (msg.type === 'levels') {
      levels = { at: Date.now(), values: msg.levels.slice(0, JUKEBOX_SPECTRUM_BANDS).map((v) => (Number.isFinite(v) ? v : 0)) };
      sendPulse(levels.values);
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

  /**
   * Pouls du son pour l'ambiance des écrans (jukebox-pulse) : graves, médiums, aigus, moyennés sur
   * les bandes du spectre ; à toutes les fenêtres (la fenêtre du clip mesure, les autres suivent).
   */
  function sendPulse(values: readonly number[]): void {
    const avg = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += values[i] ?? 0;
      return Math.round((sum / (to - from)) * 100) / 100;
    };
    const pulse = { bass: avg(0, 6), mid: avg(6, 16), high: avg(16, JUKEBOX_SPECTRUM_BANDS) };
    for (const win of host.windows().values()) if (!win.isDestroyed()) win.webContents.send('jukebox-pulse', pulse);
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
    void routeOnline();
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

  /**
   * Sorties du son dans la page du lecteur YouTube : le graphe de audio-routes.js posé sur sa vidéo,
   * refait si YouTube change d'élément ou si les réglages changent. Son intact sur la sortie du
   * fronton (cas d'usine) : rien, audioSinkScript suffit.
   */
  let onlineRoutesKey: string | undefined;
  async function routeOnline(): Promise<void> {
    const o = online;
    if (!o || !host.routes) return;
    const routes = host.routes();
    const menuOnly = routes.length === 1 && routes[0]!.gain === 1 && !routes[0]!.filters.length && !routes[0]!.delay && routes[0]!.output === (host.output() ?? '');
    const key = `${o.id}:${JSON.stringify(routes)}`;
    if (menuOnly && !o.routed) return;
    const result = (await onlineScript(onlineRoutesScript(routes))) as string | undefined;
    if (online !== o) return;
    if (result === 'attached' || result === 'updated') o.routed = true;
    if (result && result !== 'same' && result !== 'no-video' && key !== onlineRoutesKey) {
      onlineRoutesKey = key;
      host.log(`Juke-box : son du lecteur YouTube sur ${routes.map((r) => r.output || 'la sortie par défaut').join(', ')} (${result}).`); // i18n-ignore : journal
    }
  }

  // ---------- Pré-écoute (choix des morceaux à l'import, playlists du compte) ----------

  /**
   * Un morceau en ligne écouté avant de l'ajouter : le lecteur YouTube intégré, comme la lecture en
   * ligne (Referer, sortie du fronton, titres masqués), sur tout le fronton en borne ; au bureau, le
   * son seul (la gestion garde l'écran). La musique du Juke-box se met en pause pendant l'écoute,
   * puis reprend.
   */
  let preview: { youtube: string; view: WebContentsView; win: BrowserWindow; timer: NodeJS.Timeout; position?: number; duration?: number; paused: boolean; error?: string } | undefined;
  let resumeAfterPreview = false;

  function previewScript(code: string): Promise<unknown> {
    const p = preview;
    if (!p || p.view.webContents.isDestroyed()) return Promise.resolve(undefined);
    return p.view.webContents.executeJavaScript(code).catch(() => undefined);
  }

  function startPreview(youtube: string): void {
    stopPreview(false);
    const win = host.windows().get(clipRole());
    if (!win || win.isDestroyed()) return;
    // La musique du Juke-box se tait le temps de l'écoute.
    if (player?.playing && !player.paused && order && !order.paused) {
      player = { ...player, paused: true };
      apply({ kind: 'pause' });
      resumeAfterPreview = true;
    }
    const view = new WebContentsView({
      webPreferences: { session: youtubeSession(), contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: OFFSCREEN, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.contentView.addChildView(view);
    const [width, height] = win.getContentSize();
    // En borne, tout le fronton ; au bureau, ou sans fronton (la gestion est sur le même écran) : le son seul.
    placeView(view, host.desk() || clipRole() === 'playfield' ? undefined : { x: 0, y: 0, width: width ?? 0, height: height ?? 0 });
    view.setBackgroundColor('#030807');
    if (OFFSCREEN) view.webContents.setAudioMuted(true);
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(url) && !url.startsWith('file:')) event.preventDefault();
    });
    contents.on('dom-ready', () => {
      void contents.insertCSS(YOUTUBE_CSS).catch(() => undefined);
      void contents.executeJavaScript(UNMUTE_SCRIPT).catch(() => undefined);
    });
    contents.on('did-frame-finish-load', (_e, _main, processId, routingId) => {
      const output = host.output();
      const frame = output ? webFrameMain.fromId(processId, routingId) : undefined;
      if (frame) void frame.executeJavaScript(audioSinkScript(output!)).catch(() => undefined);
    });
    win.once('closed', () => preview?.view === view && stopPreview());
    const mine = { youtube, view, win, paused: false, timer: setInterval(() => void probePreview(), ONLINE_PROBE_MS) };
    preview = mine;
    if (host.fakeOnline) void contents.loadFile(host.fakeOnline, { query: { v: youtube } }).catch(() => undefined);
    else void contents.loadURL(youtubeEmbedUrl(youtube), { httpReferrer: JUKEBOX_EMBED_REFERRER }).catch(() => undefined);
    host.log(`Juke-box : pré-écoute de ${youtube}.`); // i18n-ignore : journal
  }

  async function probePreview(): Promise<void> {
    const p = preview;
    if (!p) return;
    const r = (await previewScript(PROBE_SCRIPT)) as { time?: number; duration?: number; paused?: boolean; code?: number; error?: string } | undefined;
    if (!r || preview !== p) return;
    const error = typeof r.code === 'number' ? embedErrorText(r.code) : r.error;
    const next = { position: typeof r.time === 'number' ? r.time : p.position, duration: typeof r.duration === 'number' && r.duration > 0 ? r.duration : p.duration, error };
    if (next.position === p.position && next.duration === p.duration && next.error === p.error) return;
    Object.assign(p, next);
    host.redraw();
  }

  /** Arrête la pré-écoute ; la musique du Juke-box reprend si elle jouait (`resume`). */
  function stopPreview(resume = true): void {
    const p = preview;
    if (p) {
      preview = undefined;
      clearInterval(p.timer);
      try {
        if (!p.win.isDestroyed()) p.win.contentView.removeChildView(p.view);
      } catch {
        // Fenêtre déjà fermée.
      }
      if (!p.view.webContents.isDestroyed()) p.view.webContents.close();
    }
    if (resume && resumeAfterPreview) {
      resumeAfterPreview = false;
      if (player?.playing && player.paused) {
        player = { ...player, paused: false };
        apply({ kind: 'resume' });
      }
    }
  }

  function seekPreview(delta: number): void {
    const p = preview;
    if (!p) return;
    const to = Math.max(0, Math.min((p.duration ?? Infinity) - 1, (p.position ?? 0) + delta));
    p.position = to;
    void previewScript(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${to}; })()`);
    host.redraw();
  }

  // ---------- DMD ----------

  /** « JUKE-BOX » et les chiffres de la bibliothèque, comme sur la roue, d'où part l'entrée. */
  let entranceFrom: { id: number; dots: Uint8Array } | undefined;
  function entranceDots(id: number): Uint8Array {
    if (entranceFrom?.id !== id) {
      const store = lib()?.store();
      entranceFrom = { id, dots: jukeboxSelectionDots({ tracks: store?.playlists.reduce((n, p) => n + p.tracks.length, 0) ?? 0, playlists: store?.playlists.length ?? 0 }) };
    }
    return entranceFrom.dots;
  }

  function hexColor(hex: string): [number, number, number] {
    const n = /^#?[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.replace('#', ''), 16) : 0x8be23a;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * Couleurs de la pochette (visualiseur « Pochette ») : l'image réduite à 32 points de large par
   * nativeImage (BGRA sous Windows), puis coverPalette. Une pochette illisible (format que nativeImage
   * ne connaît pas, fichier absent) ou sans couleur : rien, le visualiseur passe en Multicolore.
   */
  function readCoverColors(key: string, file: string | undefined): void {
    if (coverColors?.key === key) return;
    coverColors = { key };
    if (!file || !isAbsolute(file) || !fs.existsSync(file)) return;
    try {
      const image = nativeImage.createFromPath(file);
      if (image.isEmpty()) return;
      const small = image.resize({ width: 32, quality: 'good' });
      const palette = coverPalette(small.toBitmap(), process.platform === 'win32' || process.platform === 'linux' ? 'bgra' : 'rgba');
      if (palette) coverColors = { key, palette };
    } catch (error) {
      host.log(`Juke-box : pochette illisible pour le DMD (${String(error)}).`); // i18n-ignore : journal
    }
  }

  /** Le DMD du Juke-box : JUKE-BOX et ses chiffres sur la roue, le spectre en lecture ; rien ailleurs. */
  function syncDmd(onWheel = false): void {
    const want: 'wheel' | 'player' | undefined = !host.dmdOn() ? undefined : player ? 'player' : onWheel ? 'wheel' : undefined;
    if (want === 'wheel') {
      const store = lib()?.store();
      const stats = { tracks: store?.playlists.reduce((n, p) => n + p.tracks.length, 0) ?? 0, playlists: store?.playlists.length ?? 0 };
      if (dmd?.kind === 'wheel' && stats.tracks === wheelStats.tracks && stats.playlists === wheelStats.playlists) return;
      wheelStats = stats;
      dmd?.stop();
      const handle = host.dmd('juke-box', { dots: (elapsed) => jukeboxSelectionDots(stats, elapsed) });
      dmd = { kind: 'wheel', stop: () => handle.stop() };
      return;
    }
    if (want === 'player') {
      if (dmd?.kind === 'player') return;
      dmd?.stop();
      const visualizer = createJukeboxVisualizer();
      let rgb: Uint8Array | undefined;
      const handle = host.dmd('juke-box', {
        dots: (elapsed) => {
          const now = order ? playingInfo : undefined;
          const fresh = levels && Date.now() - levels.at < 400 ? levels.values : undefined;
          const playing = Boolean(order && !order.paused && !ad);
          const settings = host.visualizer?.() ?? { mode: 'classique' as const, color: '#8be23a' };
          const palette = order && coverColors?.key === order.key ? coverColors.palette : undefined;
          const frame = visualizer.frame({
            ...(now?.artist ? { artist: now.artist } : {}),
            ...(now?.title ? { title: now.title } : {}),
            levels: playing ? (fresh ?? idleSpectrum(elapsed, true)) : idleSpectrum(elapsed, false),
            elapsed,
            mode: settings.mode,
            ...(palette ? { palette } : {}),
            color: settings.color,
          });
          // Entrée depuis la roue : « JUKE-BOX » et ses chiffres, chassés par une tache de lumière.
          const since = entrance ? Date.now() - entrance.startedAt : Infinity;
          if (since < JUKEBOX_ENTRANCE.dmdPassEnd) {
            const shown = jukeboxEntranceFrame({ dots: entranceDots(entrance!.id) }, frame, since, hexColor(settings.color));
            rgb = shown.rgb;
            return shown.dots;
          }
          rgb = frame.rgb;
          return frame.dots;
        },
        colors: () => rgb,
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

  /** La vue du lecteur ; `whole` (téléphone) : toute la liste du niveau affiché, pas seulement la fenêtre de la borne. */
  function playerView(whole?: number): JukeboxPlayerView {
    const input = playlistsInput();
    const shown = player?.shown ?? '';
    const topKey = player?.level === 'tracks' ? shown : PLAYLISTS_TOP;
    if (!tops.has(topKey)) keepSelectionVisible(input);
    const k = host.keys();
    return jukeboxPlayerView({
      playlists: input,
      state: player ?? { level: 'playlists', at: '', shown: '', selected: {}, paused: false },
      top: whole ? 0 : (tops.get(topKey) ?? 0),
      // Les MagnaSave ne sont rappelés que si la borne en a pour changer de playlist : en borne, relevés comme
      // MagnaSave (des Ctrl de secours ne disent rien des boutons de la borne) ; au bureau, les flèches ←→.
      magnaSave: Boolean(k.collections.previous.length || k.collections.next.length) && (host.desk() || k.magnaRecorded),
      rows: whole ?? rows(),
      ad,
      audioOnly: order?.audioOnly ?? false,
      ...(press && !press.done ? { holdSince: press.since } : {}),
      ...(seek?.press?.seeking || Date.now() < seekShownUntil ? { seeking: true } : {}),
    });
  }

  /**
   * Morceau suivant ou précédent de la playlist en cours (téléphone, qui n'a pas d'autre moyen de
   * sauter un morceau) : suivant, comme la fin du morceau (l'aléatoire tire le suivant), sans répéter
   * le même ; précédent, le morceau lisible d'avant dans la playlist. Le niveau affiché ne bouge pas.
   */
  function skip(dir: 1 | -1): void {
    if (!player?.playing) return;
    const input = playlistsInput();
    const ls = lists(input);
    const id = player.playing.playlist;
    const keep = { level: player.level, at: player.at, shown: player.shown, modes: player.modes };
    let r;
    if (dir === 1) {
      const mode = playModeOf(player, id);
      r = playerStep(mode.repeat === 'track' ? { ...player, modes: { ...player.modes, [id]: { ...mode, repeat: 'playlist' } } } : player, 'ended', ls);
    } else {
      const playable = ls.find((l) => l.id === id)?.tracks.filter((tr) => tr.playable).map((tr) => tr.key) ?? [];
      if (!playable.length) return;
      const key = playable[(playable.indexOf(player.playing.key) - 1 + playable.length) % playable.length]!;
      r = playerStep({ ...player, level: 'tracks', shown: id, selected: { ...player.selected, [id]: key } }, 'start', ls);
    }
    player = { ...r.state, ...keep };
    if (r.effect) apply(r.effect);
    keepSelectionVisible(input);
    host.redraw();
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
    if (entrance && Date.now() - entrance.startedAt < JUKEBOX_ENTRANCE.end) out.entrance = { ...entrance, poster: poster() };
    if (role === 'playfield' && !background) out.player = pv;
    if (role === clipRole()) {
      const now = pv.now;
      out.clip = {
        place: background ? 'hidden' : roles.includes('backglass') && !host.desk() ? 'zone' : host.desk() ? 'desk' : 'thumb',
        ...(order ? { order: { id: order.id, kind: order.kind, ...(order.audio ? { audio: order.audio } : {}), ...(order.video ? { video: order.video } : {}), ...(order.image ? { image: order.image } : {}), paused: order.paused, ...(order.output ? { output: order.output } : {}), ...(host.routes ? { routes: host.routes() } : {}), volume: order.volume } } : {}),
        ...(now ? { now } : {}),
        ...(card && now && order?.kind !== 'online' ? { card: { id: card.id, eyebrow: cardEyebrow(now), until: card.until } } : {}),
        ...(seekOrder && order?.kind !== 'online' ? { seek: seekOrder } : {}),
        poster: poster(),
      };
      // En borne, pendant la gestion : le morceau en pause et l'affiche sur le fronton, jamais vide.
      if (background && !host.desk()) out.cover = { ...(pv.now ? { now: pv.now } : {}), poster: poster() };
    } else if (roles.includes('backglass')) out.cover = { ...(pv.now ? { now: pv.now } : {}), poster: poster() };
    return out;
  }

  return {
    active: () => Boolean(player),
    /** Niveau affiché : les playlists, ou les morceaux de la playlist ouverte. */
    level: () => player?.level,
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
    /** Pré-écoute d'un morceau en ligne (identifiant YouTube) ; undefined l'arrête. */
    preview: (youtube: string | undefined): void => (youtube ? startPreview(youtube) : stopPreview()),
    previewSeek: seekPreview,
    /** La pré-écoute en cours : son morceau, sa position, sa durée, une erreur de YouTube. */
    previewState: () => (preview ? { youtube: preview.youtube, ...(preview.position !== undefined ? { position: preview.position } : {}), ...(preview.duration !== undefined ? { duration: preview.duration } : {}), ...(preview.error ? { error: preview.error } : {}) } : undefined),
    handleKey,
    click,
    /** Le lecteur pour le téléphone (phone-remote.ts) : toute la liste du niveau affiché ; undefined : fermé. */
    remoteView: (max: number): JukeboxPlayerView | undefined => (player ? playerView(max) : undefined),
    skip,
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
      niveau: player?.level,
      curseur: player?.at,
      choix: player ? player.selected[player.shown] : undefined,
      lecture: order ? { morceau: order.key, source: order.kind, pause: order.paused, publicite: ad, temps: time ? formatNumber(Math.round(time.position)) : undefined } : undefined,
      enLigne: online ? { vue: true, cadre: clipRect, bornes: online.view.getBounds() } : undefined,
    }),
    /** Capture de la vue du lecteur YouTube (elle n'est pas dans celle de sa fenêtre). */
    onlineCapture: async (): Promise<Buffer | undefined> => {
      if (!online || online.view.webContents.isDestroyed()) return undefined;
      const view = online.view;
      const b = view.getBounds();
      // Clip masqué (vue réduite à rien, placeView) : rien à l'écran, rien à capturer ; le compositeur
      // refusait l'image (« UnknownVizError ») et l'essai s'arrêtait (12/11/2026).
      if (!b.width || !b.height) return undefined;
      let image: Awaited<ReturnType<typeof view.webContents.capturePage>> | undefined;
      for (let attempt = 1; !image; attempt++) {
        try {
          image = await view.webContents.capturePage();
        } catch (error) {
          if (attempt >= 3 || view.webContents.isDestroyed()) {
            host.log(`Juke-box : vue en ligne pas capturée (${(error as Error).message}).`); // i18n-ignore : journal
            return undefined;
          }
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        }
      }
      const size = image.getSize();
      host.log(`Juke-box : vue en ligne ${b.width} × ${b.height} en ${b.x}, ${b.y} (image ${size.width} × ${size.height}).`); // i18n-ignore : journal
      return image.toPNG();
    },
    dispose(): void {
      stopPreview(false);
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
/** Le moteur des sorties du son (app/renderer/audio-routes.js), lu une fois, pour la page YouTube. */
let routesSource: string | undefined;
function audioRoutesSource(): string {
  if (routesSource !== undefined) return routesSource;
  try {
    routesSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'audio-routes.js'), 'utf8');
  } catch {
    routesSource = '';
  }
  return routesSource;
}

/**
 * Pose le graphe des sorties sur la vidéo de la page YouTube : « attached » la première fois (ou
 * pour une nouvelle vidéo), « updated » quand le plan change, « same » sinon, « no-video » tant que
 * la page n'a pas de vidéo, « failed » si Web Audio la refuse (le son reste sur la sortie du fronton).
 */
// Une seule vidéo dans la page YouTube : les autres sorties reçoivent son flux (mode flux), chacune sur sa carte.
export function onlineRoutesScript(routes: readonly JukeboxAudioRoute[]): string {
  return `(() => {
${audioRoutesSource()}
  const routes = ${JSON.stringify(routes)};
  const v = document.querySelector('video');
  if (!v || !window.CyberAudioRoutes) return 'no-video';
  const key = JSON.stringify(routes);
  const s = window.__cyberpinballRoutes;
  if (s && s.media === v) {
    if (s.key === key) return 'same';
    s.key = key;
    s.handle.update(routes);
    return 'updated';
  }
  try {
    const handle = window.CyberAudioRoutes.attach(v, routes, { flux: true });
    window.__cyberpinballRoutes = { media: v, key, handle };
    return 'attached';
  } catch (e) {
    return 'failed';
  }
})()`;
}

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
