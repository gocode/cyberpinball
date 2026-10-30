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

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GAME_NOTICE_SIZE,
  LiveBoardFlash,
  gameNoticeBounds,
  gameNoticeView,
  liveBoardDots,
  liveBoardPlacement,
  type GameNoticeView,
  type LiveBoardScreens,
  type LiveBoardView,
  type LiveInvite,
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
  /** Fin de la partie : plus rien par-dessus VPX. */
  close(): void;
}

/** Relecture de l'invitation montrée (temps restant, annulation). */
const TICK_MS = 1000;
/** Relecture de la bande : les scores qui reviennent sur le DMD, et en repartent (LIVE_FLASH). */
const BOARD_TICK_MS = 500;

/** Une fenêtre posée par-dessus VPX, et ce qu'elle montre. */
interface Overlay {
  win: BrowserWindow;
  loaded: boolean;
  /** Dernier état envoyé. */
  last: string;
  /** Place et forme : une autre place, une autre fenêtre (aucune n'est redimensionnée à la main). */
  key: string;
}

/** La fenêtre transparente, sans focus, que les clics traversent, hors des captures, au-dessus de VPX. */
function overlay(bounds: Rect, key: string, onLoad: (o: Overlay) => void): Overlay {
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

const alive = (o: Overlay | undefined): o is Overlay => !!o && !o.win.isDestroyed();

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

  /** Place de la fenêtre pour une carte de `base` (vue du joueur, à 1080 px), dans le coin du plateau. */
  function boundsFor(base: { width: number; height: number }) {
    const place = opts.place();
    if (!place) return undefined;
    const unit = Math.min(place.zone.width, place.zone.height) / 1080;
    const size = { width: Math.round(base.width * unit), height: Math.round(base.height * unit) };
    return { place, bounds: gameNoticeBounds(place.zone, place.rotation, size, Math.round(GAME_NOTICE_SIZE.margin * unit)) };
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
    const name = board ? `bande-partie-entre-amis${state === 'partie-dmd' ? '-dmd' : ''}` : `invitation-en-partie-${state}`; // i18n-ignore : noms de fichier des essais
    fs.writeFileSync(path.join(opts.captureDir!, `${name}.png`), (await o.win.webContents.capturePage()).toPNG());
    const problems = await checkLayout(o.win.webContents);
    opts.log?.(`${board ? `Bande de la partie entre amis${state === 'partie-dmd' ? ' (DMD)' : ''}` : `Invitation pendant la partie (${state})`} : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`); // i18n-ignore : journal
  }

  /** Une couche de la bande à sa place : la même fenêtre si rien n'a bougé, sinon une neuve. */
  function layer(o: Overlay | undefined, bounds: Rect | undefined, key: string): Overlay | undefined {
    if (alive(o) && (!bounds || o.key !== key)) o.win.destroy();
    if (!bounds) return undefined;
    if (alive(o) && o.key === key) return o;
    return overlay(bounds, key, () => showBoard());
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

  /** La bande de la partie : sa place selon les écrans du moment, son contenu, les scores sur le DMD de temps à autre. */
  function showBoard(): void {
    if (!boardView) return;
    const screens = opts.boardScreens();
    const placement = screens ? liveBoardPlacement(screens, boardView.rows.length) : {};
    const where = JSON.stringify([placement.band?.role, placement.band?.bounds, placement.dmd]);
    if (where !== placed) {
      placed = where;
      const b = placement.band;
      const r = (x: Rect) => `${x.width} × ${x.height} en ${x.x}, ${x.y}`; // i18n-ignore : journal
      opts.log?.(`Bande de la partie entre amis, place : ${b ? `${b.role} (${b.layout}, ${r(b.bounds)})` : 'aucune bande permanente'}${placement.dmd ? `, scores sur le DMD de temps à autre (${r(placement.dmd)})` : ''}.`); // i18n-ignore : journal
    }
    const b = placement.band;
    band = layer(band, b?.bounds, JSON.stringify([b?.bounds, b?.layout, b?.rotation]));
    if (alive(band) && b) send(band, { view: { ...boardView, layout: b.layout }, rotation: b.rotation }, 'partie');
    // Les points sur le DMD : une fenêtre le temps d'un passage, fermée ensuite (le DMD de VPX revient).
    if (placement.dmd) flash ??= new LiveBoardFlash(Date.now());
    const onDmd = placement.dmd && flash?.visible(boardView, Date.now()) ? placement.dmd : undefined;
    dmd = layer(dmd, onDmd, JSON.stringify(onDmd));
    if (alive(dmd)) send(dmd, { view: { mode: 'board', layout: 'dmd', dots: Array.from(liveBoardDots(boardView)), color: opts.dmdColor() }, rotation: 0 }, 'partie-dmd');
  }

  function closeNotice(): void {
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    shown = undefined;
    if (alive(notice)) notice.win.destroy();
    notice = undefined;
  }

  function close(): void {
    closeNotice();
    if (boardTicker) clearInterval(boardTicker);
    boardTicker = undefined;
    boardView = undefined;
    flash = undefined;
    placed = '';
    for (const o of [band, dmd]) if (alive(o)) o.win.destroy();
    band = undefined;
    dmd = undefined;
  }

  return {
    show(invite) {
      shown = { id: invite.id, at: new Date() };
      if (!open()) return;
      opts.log?.(`Invitation pendant la partie : ${invite.host.name}, ${invite.title}.`); // i18n-ignore : journal
      refresh();
      if (!ticker) {
        ticker = setInterval(refresh, TICK_MS);
        ticker.unref?.();
      }
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
    close,
  };
}
