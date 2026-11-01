// Notification pendant la partie (packages/core/src/gamenotice.ts) : l'invitation d'un ami à une
// partie en direct, posée par-dessus VPX dans le coin du plateau en haut à gauche pour le joueur.
// Une fenêtre transparente, sans focus, que les clics traversent et qu'aucune capture ne voit
// (un enregistrement de la partie ne la contient pas) : VPX garde la main, le joueur ne fait rien
// pour l'ignorer. Carte entière, puis pastille qui compte le temps de l'invitation ; elle part
// quand l'invitation expire, est annulée ou répondue, et à la fin de la partie.
//
// Pendant une partie entre amis, des fenêtres du même genre montrent la bande de la partie
// (liveBoardView) : chaque joueur, son score et sa bille, lus en direct ; aucune invitation ne peut
// alors arriver. Jamais sur le plateau tant qu'un autre écran la porte (liveBoardPlacement) : sur
// le DMD de temps à autre (LiveBoardFlash), en cartes sur un écran que VPX laisse libre, sinon en
// encart au bas du plateau.
//
// Pendant la partie d'une autre table, une nouvelle de la partie entre amis (un invité accepte ou
// décline, la partie est finie : notices.ts, NoticeRule.live) se pose en une ligne dans le même
// coin, sous l'invitation si elle est là ; la file des notifications du menu décide quand.
// Avant, l'attente du départ commun (packages/core/src/livestart.ts, liveWaitView) : une carte au
// centre du plateau, dans son tiers haut (aucune bille n'est en jeu) : chaque joueur et son statut,
// pourquoi la partie n'a pas encore démarré, puis « Partez ! » quelques secondes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GAME_NOTICE_LINE,
  GAME_NOTICE_SIZE,
  LIVE_GO_SHOW_MS,
  LiveBoardFlash,
  gameNoticeBounds,
  gameNoticeView,
  liveBoardDots,
  liveBoardPlacement,
  liveWaitBounds,
  liveWaitCardEnd,
  type GameNoticeView,
  type LiveBoardScreens,
  type LiveBoardView,
  type LiveScoresPlace,
  type LiveInvite,
  type NoticeView,
  type LiveWaitView,
  type Rect,
  type Rotation,
} from '@cyberpinball/core';
import type { BrowserWindow } from 'electron';
import { checkLayout } from './layout-check';
import { createWindow, isShown, windowRect } from './offscreen';

export interface GameNoticesOptions {
  /** Zone du plateau à l'écran, en pixels physiques, et le sens de sa mise en page (menuRotation). */
  place(): { zone: Rect; rotation: Rotation } | undefined;
  /** Partie entre amis : les écrans que la bande peut prendre (DMD, écrans libres, plateau). */
  boardScreens(): LiveBoardScreens | undefined;
  /** Où le joueur veut voir les scores des amis (Menu système > Amis). */
  scoresPlace?(): LiveScoresPlace;
  /** Le DMD montre son écran de score, maintenant (dmd-watch.ts) : sans réponse, jamais de scores sur le DMD. */
  dmdScoreScreen?(): boolean;
  /**
   * La fenêtre étrangère (VPX, PuP, B2S, FlexDMD, DMD externe…) qui passe devant cette fenêtre de la
   * bande et la recouvre en partie, décrite pour le journal ; undefined : rien devant.
   */
  coveredBy?(win: BrowserWindow): string | undefined;
  /** Couleur des points du DMD (« Couleur du DMD » des médias). */
  dmdColor(): string | undefined;
  /** Invitations encore valables (live-game.ts). */
  invites(): readonly LiveInvite[];
  /** Essais sans opérateur : captures de la notification (CYBERPINBALL_CAPTURE). */
  captureDir?: string;
  log?(line: string): void;
}

export interface GameNotices {
  /** Une invitation arrive pendant la partie : la montrer. */
  show(invite: LiveInvite): void;
  /** Partie entre amis : la bande de la partie, à jour (undefined : plus de bande). */
  board(view: LiveBoardView | undefined): void;
  /** Une nouvelle de la partie entre amis, d'une ligne (undefined : plus rien). */
  line(view: NoticeView | undefined): void;
  /**
   * Partie entre amis : l'attente du départ commun, à jour (undefined : plus d'attente). « Partez ! »
   * reste à l'écran LIVE_GO_SHOW_MS à compter de son apparition réelle, même si la vue s'arrête avant.
   */
  wait(view: LiveWaitView | undefined): void;
  /**
   * Au lancement de VPX : la carte de l'attente, chargée d'avance et cachée, à la place qu'elle aura ;
   * elle paraît dès la première vue, même quand l'attente ne dure qu'un instant.
   */
  prepareWait(view: LiveWaitView | undefined): void;
  /** Fin de la partie : plus rien par-dessus VPX. */
  close(): void;
}

/** Relecture de l'invitation montrée (temps restant, annulation). */
const TICK_MS = 1000;
/** Relecture de la bande : les scores qui reviennent sur le DMD, et en repartent (LIVE_FLASH). */
const BOARD_TICK_MS = 500;

/** Une fenêtre posée par-dessus VPX, et ce qu'elle montre. */
export interface Overlay {
  win: BrowserWindow;
  loaded: boolean;
  /** Dernier état envoyé. */
  last: string;
  /** Place et forme : une autre place, une autre fenêtre (aucune n'est redimensionnée à la main). */
  key: string;
}

/** La fenêtre transparente, sans focus, que les clics traversent, hors des captures, au-dessus de VPX (et du menu). */
export function overlay(bounds: Rect, key: string, onLoad: (o: Overlay) => void): Overlay {
  const created = createWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    ...windowRect(bounds),
    webPreferences: { preload: path.join(__dirname, 'notice-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  created.setIgnoreMouseEvents(true);
  created.setContentProtection(true);
  created.setAlwaysOnTop(true, 'screen-saver');
  const o: Overlay = { win: created, loaded: false, last: '', key };
  created.webContents.once('did-finish-load', () => {
    o.loaded = true;
    onLoad(o);
  });
  void created.loadFile(path.join(__dirname, '..', 'renderer', 'game-notice.html'));
  return o;
}

/** Montre la fenêtre sans lui donner le focus, devant ce qui est passé devant elle depuis (VPX, le menu). */
export function raise(o: Overlay): void {
  if (!isShown(o.win)) o.win.showInactive();
  o.win.setAlwaysOnTop(true, 'screen-saver');
  o.win.moveTop();
}

export const alive = (o: Overlay | undefined): o is Overlay => !!o && !o.win.isDestroyed();

/**
 * Ferme une fenêtre de la bande, de la nouvelle ou de l'attente. Toujours par close(), jamais par
 * destroy() : détruite pendant qu'une autre charge game-notice.html, elle emporte le processus de
 * rendu qu'elles partagent, et l'autre ne se charge pas (démonstration du 31/10/2026 : la carte
 * d'attente du départ commun restait vide quand la bande quittait le topper au même moment).
 */
export function dispose(o: Overlay | undefined): void {
  if (alive(o)) o.win.close();
}

export function createGameNotices(opts: GameNoticesOptions): GameNotices {
  let notice: Overlay | undefined;
  let shown: { id: string; at: Date } | undefined;
  let ticker: NodeJS.Timeout | undefined;
  /** Sens de la mise en page du plateau, pour tourner la carte vers le joueur. */
  let rotation: Rotation = 0;
  /** États déjà capturés (essais). */
  const captured = new Set<string>();
  /** La bande de la partie entre amis : sa vue, sa fenêtre permanente, les points sur le DMD. */
  let boardView: LiveBoardView | undefined;
  let band: Overlay | undefined;
  let dmd: Overlay | undefined;
  let flash: LiveBoardFlash | undefined;
  let boardTicker: NodeJS.Timeout | undefined;
  /** Dernière place annoncée au journal. */
  let placed = '';
  /** Recouvrements déjà signalés au journal (fenêtre de la bande et ce qui la recouvre). */
  const covers = new Map<string, number>();
  /** La nouvelle de la partie entre amis : sa fenêtre et ce qu'elle montre. */
  let line: Overlay | undefined;
  let lineView: NoticeView | undefined;
  /** L'attente du départ commun : sa vue, sa carte sur le plateau. */
  let waitView: LiveWaitView | undefined;
  let waitCard: Overlay | undefined;
  /**
   * Ce que la carte a vraiment montré, et quand (Date.now()) : l'attente, puis « Partez ! » ; `hold` :
   * la vue n'est plus là, la carte garde « Partez ! » jusqu'à son temps de lecture.
   */
  let waitSeen: { attente?: number; partez?: number; hold?: NodeJS.Timeout; since?: number } = {};
  /**
   * La carte part d'elle-même (liveWaitCardEnd : « Partez ! » lu, ou là depuis trop longtemps), sans
   * attendre une vue de plus : essai réel du 01/11/2026, « Partez ! » resté 90 s, faute d'un message
   * qui la redessine. Partie ainsi, aucune vue ne la rouvre avant la fin de l'attente.
   */
  let waitClock: NodeJS.Timeout | undefined;
  let waitEnded = false;
  /** La dernière vue annoncée au journal (titre et raison). */
  let waitTold = '';

  /** Place de la fenêtre pour une carte de `base` (vue du joueur, à 1080 px), dans le coin du plateau. */
  function boundsFor(base: { width: number; height: number }, below = 0) {
    const place = opts.place();
    if (!place) return undefined;
    const unit = Math.min(place.zone.width, place.zone.height) / 1080;
    const size = { width: Math.round(base.width * unit), height: Math.round(base.height * unit) };
    return { place, bounds: gameNoticeBounds(place.zone, place.rotation, size, Math.round(GAME_NOTICE_SIZE.margin * unit), 'top-left', Math.round(below * unit)) };
  }

  function open(): Overlay | undefined {
    if (alive(notice)) return notice;
    const at = boundsFor(GAME_NOTICE_SIZE.full);
    if (!at) {
      opts.log?.('Invitation pendant la partie : pas d’écran du plateau retrouvé, rien n’est montré.'); // i18n-ignore : journal
      return undefined;
    }
    rotation = at.place.rotation;
    notice = overlay(at.bounds, 'invitation', () => refresh());
    return notice;
  }

  /** L'invitation montrée, si elle vaut encore ; sinon la plus récente qui vaut encore. */
  function current(): { invite: LiveInvite; view: GameNoticeView } | undefined {
    const invites = opts.invites();
    const invite = invites.find((i) => i.id === shown?.id) ?? invites[0];
    if (!invite) return undefined;
    if (invite.id !== shown?.id) shown = { id: invite.id, at: new Date() };
    const view = gameNoticeView(invite, shown.at);
    return view ? { invite, view } : undefined;
  }

  function refresh(): void {
    if (boardView) return;
    const now = current();
    if (!now) return closeNotice();
    if (!alive(notice) || !notice.loaded) return;
    const key = JSON.stringify(now.view);
    if (key === notice.last) return;
    notice.last = key;
    notice.win.webContents.send('notice:state', { view: now.view, rotation });
    if (!isShown(notice.win)) notice.win.showInactive();
    capture(notice, now.view.mode);
  }

  /** Essais : une capture de chaque état, et le garde-fou de mise en page. */
  function capture(o: Overlay, state: string): void {
    if (!opts.captureDir || captured.has(state)) return;
    captured.add(state);
    setTimeout(() => void snapshot(o, state), 300);
  }

  async function snapshot(o: Overlay, state: string): Promise<void> {
    if (!alive(o)) return;
    fs.mkdirSync(opts.captureDir!, { recursive: true });
    const board = state.startsWith('partie');
    const news = state.startsWith('nouvelle');
    const wait = state.startsWith('depart');
    const name = board ? `bande-partie-entre-amis${state === 'partie-dmd' ? '-dmd' : ''}` : news ? `notification-en-partie-${state.slice('nouvelle-'.length)}` : wait ? `${state}-commun` : `invitation-en-partie-${state}`; // i18n-ignore : noms de fichier des essais
    fs.writeFileSync(path.join(opts.captureDir!, `${name}.png`), (await o.win.webContents.capturePage()).toPNG());
    const problems = await checkLayout(o.win.webContents);
    opts.log?.(`${board ? `Bande de la partie entre amis${state === 'partie-dmd' ? ' (DMD)' : ''}` : news ? `Notification de la partie entre amis pendant la partie (${state})` : wait ? `Départ commun (${state === 'depart-partez' ? 'partez' : 'attente'})` : `Invitation pendant la partie (${state})`} : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`); // i18n-ignore : journal
  }

  /** Une couche de la bande (ou de l'attente) à sa place : la même fenêtre si rien n'a bougé, sinon une neuve. */
  function layer(o: Overlay | undefined, bounds: Rect | undefined, key: string, onLoad: () => void = showBoard): Overlay | undefined {
    if (alive(o) && (!bounds || o.key !== key)) dispose(o);
    if (!bounds) return undefined;
    if (alive(o) && o.key === key) return o;
    return overlay(bounds, key, () => onLoad());
  }

  function send(o: Overlay, state: object, captureAs: string): void {
    if (!o.loaded) return;
    const key = JSON.stringify(state);
    if (key !== o.last) {
      o.last = key;
      o.win.webContents.send('notice:state', state);
    }
    if (!isShown(o.win)) {
      o.win.showInactive();
      // Une fenêtre de VPX remise au premier plan depuis : la bande repasse devant.
      o.win.moveTop();
    }
    capture(o, captureAs);
  }

  /**
   * La bande reste au-dessus de toute fenêtre de média de VPX (PuP, B2S, FlexDMD, DMD externe), sur
   * tout écran (essai du 31/10/2026 avec un PuP-Pack : « on n'a pas l'affichage des scores ») : une
   * fenêtre étrangère passée devant est signalée au journal, une fois, et la bande repasse devant.
   */
  function keepInFront(o: Overlay, name: string): void {
    if (!opts.coveredBy || !isShown(o.win)) return;
    const by = opts.coveredBy(o.win);
    if (!by) return;
    const key = `${name} ${by}`;
    const seen = (covers.get(key) ?? 0) + 1;
    covers.set(key, seen);
    if (seen === 1) opts.log?.(`Bande de la partie entre amis${name === 'dmd' ? ' (DMD)' : ''} recouverte par ${by} : remise devant.`); // i18n-ignore : journal
    if (seen === 10) opts.log?.(`Bande de la partie entre amis${name === 'dmd' ? ' (DMD)' : ''} : ${by} repasse sans cesse devant.`); // i18n-ignore : journal
    o.win.setAlwaysOnTop(true, 'screen-saver');
    o.win.moveTop();
  }

  /** La bande de la partie : sa place selon les écrans du moment et le choix du joueur, son contenu, les scores sur le DMD quand il montre l'écran de score. */
  function showBoard(): void {
    if (!boardView) return;
    // L'attente du départ commun (sa carte au milieu du plateau) dit déjà où en est chacun : la bande
    // attend le départ, et rien ne se chevauche.
    if (waitView) {
      band = layer(band, undefined, '');
      dmd = layer(dmd, undefined, '');
      return;
    }
    const screens = opts.boardScreens();
    const place = opts.scoresPlace?.() ?? 'auto';
    const placement = screens ? liveBoardPlacement(screens, boardView.rows.length, place) : {};
    const where = JSON.stringify([placement.band?.role, placement.band?.bounds, placement.dmd, placement.fallback]);
    if (where !== placed) {
      placed = where;
      const b = placement.band;
      const r = (x: Rect) => `${x.width} × ${x.height} en ${x.x}, ${x.y}`; // i18n-ignore : journal
      opts.log?.(`Bande de la partie entre amis, place : ${b ? `${b.role} (${b.layout}, ${r(b.bounds)})` : 'aucune bande permanente'}${placement.dmd ? `, scores sur le DMD quand il montre l'écran de score (${r(placement.dmd)})` : ''}${place !== 'auto' ? ` ; choix du joueur : ${place}${placement.fallback ? `, impossible ici (${placement.fallback}) : automatique` : ''}` : ''}.`); // i18n-ignore : journal
    }
    const b = placement.band;
    band = layer(band, b?.bounds, JSON.stringify([b?.bounds, b?.layout, b?.rotation]));
    if (alive(band) && b) {
      send(band, { view: { ...boardView, layout: b.layout }, rotation: b.rotation }, 'partie');
      keepInFront(band, 'bande');
    }
    // Les points sur le DMD : une fenêtre le temps d'un passage, fermée dès que le DMD montre autre chose.
    if (placement.dmd) flash ??= new LiveBoardFlash(Date.now());
    const onDmd = placement.dmd && flash?.visible(boardView, Date.now(), opts.dmdScoreScreen?.() ?? false) ? placement.dmd : undefined;
    dmd = layer(dmd, onDmd, JSON.stringify(onDmd));
    if (alive(dmd)) {
      send(dmd, { view: { mode: 'board', layout: 'dmd', dots: Array.from(liveBoardDots(boardView)), color: opts.dmdColor() }, rotation: 0 }, 'partie-dmd');
      keepInFront(dmd, 'dmd');
    }
  }

  /** La nouvelle de la partie entre amis : dans le coin du joueur, sous l'invitation si elle est là. */
  function showLine(): void {
    if (!lineView) return;
    const below = alive(notice) ? GAME_NOTICE_SIZE.full.height + GAME_NOTICE_LINE.gap : 0;
    const at = boundsFor(GAME_NOTICE_LINE, below);
    if (!at) {
      opts.log?.('Partie entre amis, notification pendant la partie : pas d’écran du plateau retrouvé, rien n’est montré.'); // i18n-ignore : journal
      return;
    }
    rotation = at.place.rotation;
    line = layer(line, at.bounds, JSON.stringify(at.bounds), showLine);
    if (!alive(line)) return;
    if (!line.loaded) return;
    // Une capture de chaque nouvelle, à son entrée (son départ a le même nom : pas de seconde).
    send(line, { view: { ...lineView, mode: 'line' }, rotation }, `nouvelle-${lineView.id}`);
  }

  function closeLine(): void {
    lineView = undefined;
    dispose(line);
    line = undefined;
  }

  /** La carte de l'attente à sa place pour `rows` joueurs (une autre place, une autre fenêtre). */
  function placeWait(rows: number): { place: { zone: Rect; rotation: Rotation }; bounds: Rect } | undefined {
    const place = opts.place();
    if (!place) {
      if (!waitCard) opts.log?.('Départ commun : pas d’écran du plateau retrouvé, l’attente n’est pas montrée sur la table.'); // i18n-ignore : journal
      waitCard = layer(waitCard, undefined, '', showWait);
      return undefined;
    }
    const bounds = liveWaitBounds(place.zone, place.rotation, rows);
    waitCard = layer(waitCard, bounds, JSON.stringify(['attente', bounds, place.rotation]), showWait);
    return { place, bounds };
  }

  /** L'attente du départ commun, sur le plateau : la carte à sa place (une ligne par joueur), à jour. */
  function showWait(): void {
    if (!waitView) return;
    const at = placeWait(waitView.rows.length);
    if (!at || !alive(waitCard) || !waitCard.loaded) return;
    send(waitCard, { view: waitView, rotation: at.place.rotation }, waitView.go ? 'depart-partez' : 'depart-attente');
    // Ce que le joueur a vraiment vu : « Partez ! » se compte de là.
    const now = Date.now();
    if (waitView.go) waitSeen.partez ??= now;
    else waitSeen.attente ??= now;
    if (!waitClock) {
      waitClock = setInterval(() => {
        const end = liveWaitCardEnd(waitSeen, Date.now());
        if (!end) return;
        closeWait(end === 'partez-lu' ? '« Partez ! » lu' : 'restée trop longtemps, fermée d’office'); // i18n-ignore : journal
        waitEnded = true;
      }, 250);
      waitClock.unref?.();
    }
  }

  function closeWait(why = 'plus d’attente'): void { // i18n-ignore : journal
    if (waitSeen.hold) clearTimeout(waitSeen.hold);
    if (waitClock) clearInterval(waitClock);
    waitClock = undefined;
    waitTold = '';
    if (waitSeen.attente !== undefined || waitSeen.partez !== undefined) {
      const end = Date.now();
      const s = (from: number | undefined, to: number) => (from === undefined ? 'pas montrée' : `${((to - from) / 1000).toFixed(1)} s`); // i18n-ignore : journal
      opts.log?.(`Départ commun : carte montrée ${s(waitSeen.attente, waitSeen.partez ?? end)} en attente, « Partez ! » ${s(waitSeen.partez, end)} ; partie : ${why}.`); // i18n-ignore : journal
    }
    waitSeen = {};
    waitView = undefined;
    dispose(waitCard);
    waitCard = undefined;
    // La bande attendait la fin de la carte (showBoard) : elle vient tout de suite.
    if (boardView) showBoard();
  }

  /**
   * Plus de vue d'attente : la carte part, sauf « Partez ! » qui reste lisible LIVE_GO_SHOW_MS après
   * son apparition réelle (une fenêtre lente à charger, une borne chargée : l'heure du signal ne dit
   * pas ce que le joueur a vu). Une carte encore en chargement garde « Partez ! » jusqu'à ce qu'elle
   * paraisse, dix secondes au plus.
   */
  function endWait(): void {
    if (!waitView?.go) return closeWait();
    if (waitSeen.hold) return;
    waitSeen.since ??= Date.now();
    const left = waitSeen.partez !== undefined ? waitSeen.partez + LIVE_GO_SHOW_MS - Date.now() : Math.max(0, waitSeen.since + 10_000 - Date.now());
    if (left <= 0) return closeWait();
    waitSeen.hold = setTimeout(() => {
      waitSeen.hold = undefined;
      endWait();
    }, Math.min(left, 250));
  }

  function closeNotice(): void {
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    shown = undefined;
    dispose(notice);
    notice = undefined;
    // La nouvelle de la partie entre amis remonte à sa place.
    if (lineView) showLine();
  }

  function close(): void {
    // Fin de partie : la bande ne revient pas après la carte de l’attente.
    boardView = undefined;
    closeLine();
    closeNotice();
    closeWait('fin de la partie'); // i18n-ignore : journal
    waitEnded = false;
    if (boardTicker) clearInterval(boardTicker);
    boardTicker = undefined;
    boardView = undefined;
    flash = undefined;
    placed = '';
    covers.clear();
    for (const o of [band, dmd]) dispose(o);
    band = undefined;
    dmd = undefined;
  }

  return {
    show(invite) {
      shown = { id: invite.id, at: new Date() };
      if (!open()) return;
      opts.log?.(`Invitation pendant la partie : ${invite.host.name}, ${invite.title}.`); // i18n-ignore : journal
      refresh();
      // La nouvelle de la partie entre amis passe sous l'invitation.
      if (lineView) showLine();
      if (!ticker) {
        ticker = setInterval(refresh, TICK_MS);
        ticker.unref?.();
      }
    },
    wait(view) {
      if (!view) {
        waitEnded = false;
        if (waitView) endWait();
        else if (waitCard) closeWait();
        return;
      }
      // Partie d'elle-même : elle ne revient pas pour cette attente (live-game.ts finit par dire qu'il n'y en a plus).
      if (waitEnded) return;
      // Ce que la carte montre, et pourquoi, au journal : à chaque changement de titre ou de raison.
      const told = `${view.title} — ${view.lead}`;
      if (told !== waitTold) {
        waitTold = told;
        opts.log?.(`Départ commun, carte : « ${told} ».`); // i18n-ignore : journal
      }
      // La vue revient (une attente qui reprend) : plus de « Partez ! » gardé.
      if (waitSeen.hold) clearTimeout(waitSeen.hold);
      waitSeen.hold = undefined;
      waitSeen.since = undefined;
      if (!waitView) closeNotice();
      waitView = view;
      showWait();
    },
    prepareWait(view) {
      if (!view || alive(waitCard)) return;
      placeWait(view.rows.length);
    },
    board(view) {
      if (!view) {
        if (boardView) close();
        return;
      }
      if (!boardView) closeNotice();
      boardView = view;
      showBoard();
      if (!boardTicker) {
        boardTicker = setInterval(showBoard, BOARD_TICK_MS);
        boardTicker.unref?.();
      }
    },
    line(view) {
      if (!view) return closeLine();
      if (JSON.stringify(view) === JSON.stringify(lineView) && alive(line)) return;
      if (!lineView || view.id !== lineView.id) opts.log?.(`Partie entre amis, notification pendant la partie : « ${view.title} »${view.detail ? ` (${view.detail})` : ''}.`); // i18n-ignore : journal
      lineView = view;
      showLine();
    },
    close,
  };
}
