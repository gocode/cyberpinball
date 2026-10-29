// Notification pendant la partie (packages/core/src/gamenotice.ts) : l'invitation d'un ami à une
// partie en direct, posée par-dessus VPX dans le coin du plateau en haut à gauche pour le joueur.
// Une fenêtre transparente, sans focus, que les clics traversent et qu'aucune capture ne voit
// (un enregistrement de la partie ne la contient pas) : VPX garde la main, le joueur ne fait rien
// pour l'ignorer. Carte entière, puis pastille qui compte le temps de l'invitation ; elle part
// quand l'invitation expire, est annulée ou répondue, et à la fin de la partie.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GAME_NOTICE_SIZE, gameNoticeBounds, gameNoticeView, type GameNoticeView, type LiveInvite, type Rect, type Rotation } from '@cyberpinball/core';
import type { BrowserWindow } from 'electron';
import { checkLayout } from './layout-check';
import { createWindow, isShown, windowRect } from './offscreen';

export interface GameNoticesOptions {
  /** Zone du plateau à l'écran, en pixels physiques, et le sens de sa mise en page (menuRotation). */
  place(): { zone: Rect; rotation: Rotation } | undefined;
  /** Invitations encore valables (live-game.ts). */
  invites(): readonly LiveInvite[];
  /** Essais sans opérateur : captures de la notification (CYBERPINBALL_CAPTURE). */
  captureDir?: string;
  log?(line: string): void;
}

export interface GameNotices {
  /** Une invitation arrive pendant la partie : la montrer. */
  show(invite: LiveInvite): void;
  /** Fin de la partie : plus rien par-dessus VPX. */
  close(): void;
}

/** Relecture de l'invitation montrée (temps restant, annulation). */
const TICK_MS = 1000;

export function createGameNotices(opts: GameNoticesOptions): GameNotices {
  let win: BrowserWindow | undefined;
  let loaded = false;
  let shown: { id: string; at: Date } | undefined;
  let ticker: NodeJS.Timeout | undefined;
  let last = '';
  /** Sens de la mise en page du plateau, pour tourner la carte vers le joueur. */
  let rotation: Rotation = 0;
  /** États déjà capturés (essais). */
  const captured = new Set<string>();

  function open(): BrowserWindow | undefined {
    if (win && !win.isDestroyed()) return win;
    const place = opts.place();
    if (!place) {
      opts.log?.('Invitation pendant la partie : pas d’écran du plateau retrouvé, rien n’est montré.'); // i18n-ignore : journal
      return undefined;
    }
    const unit = Math.min(place.zone.width, place.zone.height) / 1080;
    const size = { width: Math.round(GAME_NOTICE_SIZE.full.width * unit), height: Math.round(GAME_NOTICE_SIZE.full.height * unit) };
    const bounds = gameNoticeBounds(place.zone, place.rotation, size, Math.round(GAME_NOTICE_SIZE.margin * unit));
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
    loaded = false;
    last = '';
    created.webContents.once('did-finish-load', () => {
      loaded = true;
      refresh();
    });
    void created.loadFile(path.join(__dirname, '..', 'renderer', 'game-notice.html'));
    win = created;
    rotation = place.rotation;
    return created;
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
    const now = current();
    if (!now) return close();
    if (!win || win.isDestroyed() || !loaded) return;
    const key = JSON.stringify(now.view);
    if (key === last) return;
    last = key;
    win.webContents.send('notice:state', { view: now.view, rotation });
    if (!isShown(win)) win.showInactive();
    const state = now.view.mode;
    if (opts.captureDir && !captured.has(state)) {
      captured.add(state);
      setTimeout(() => void snapshot(state), 300);
    }
  }

  async function snapshot(state: string): Promise<void> {
    if (!win || win.isDestroyed()) return;
    fs.mkdirSync(opts.captureDir!, { recursive: true });
    fs.writeFileSync(path.join(opts.captureDir!, `invitation-en-partie-${state}.png`), (await win.webContents.capturePage()).toPNG()); // i18n-ignore : nom de fichier des essais
    const problems = await checkLayout(win.webContents);
    opts.log?.(`Invitation pendant la partie (${state}) : ${problems.length ? problems.join(' ; ') : 'mise en page conforme'}.`); // i18n-ignore : journal
  }

  function close(): void {
    if (ticker) clearInterval(ticker);
    ticker = undefined;
    shown = undefined;
    if (win && !win.isDestroyed()) win.destroy();
    win = undefined;
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
    close,
  };
}
