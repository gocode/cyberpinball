// Réglages en partie (packages/core/src/dmdplace.ts) : pendant une partie, les deux MagnaSave
// ensemble (sans eux, Crédit et Start : inGameMenuButtons) ouvrent le menu de Cyber Pinball,
// « Position du DMD » en tête, puis « Tous les réglages de VPX » et « Reprendre la partie ».
//
// La combinaison est lue ici, VPX au premier plan : touches du clavier par GetAsyncKeyState
// (keysDown), boutons du joystick par le sondage de SDL (watchJoystickButtons). Elle n'est plus
// dans [Input] Mapping.InGameUI : VPX n'ouvre pas son propre menu par-dessus.
//
// Le menu ouvert, une fenêtre transparente couvre chaque écran de la borne, au-dessus de VPX : le
// cadre du DMD sur l'écran qui le porte (tiré à la souris, jusque sur un autre écran), le panneau
// sur l'écran du plateau, tourné vers le joueur. Celle du plateau prend le premier plan : VPX le
// perd et se met en pause (Player::OnFocusChanged), les boutons arrivent au menu. La fenêtre
// « Visual Pinball Score View » de VPX suit chaque réglage (setWindowBounds) : le joueur voit le
// vrai DMD bouger. À la sortie, VPX reprend le premier plan, et la partie.
//
// La place enregistrée vaut pour la table dans cette configuration (positions-dmd.json) ; elle
// est écrite dans le .ini de la table avant chaque partie (prepareDmdPlace), jamais pendant :
// VPX pourrait réécrire ce .ini en quittant.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buttonKeys,
  cabinetRoleLabel,
  dmdIniUpdate,
  dmdMenuAction,
  dmdMenuDirty,
  dmdMenuFrame,
  dmdMenuKey,
  dmdMenuPanel,
  dmdPlaceOf,
  dmdPlaceSettings,
  dmdSpotOfRect,
  dmdSpotRect,
  findTableIni,
  IniDocument,
  inGameMenuButtons,
  dmdMenuKeyNames,
  markDmdGeneral,
  markDmdSaved,
  matchScreens,
  readDmdPlaces,
  readTextIfExists,
  roleZone,
  ROLES,
  saveDmdPlaces,
  startDmdMenu,
  t,
  vpxMenuKeys,
  windowsVk,
  withDmdPlace,
  writtenKey,
  type CabinetConfiguration,
  type DmdMenuAction,
  type DmdMenuHost,
  type DmdMenuOutcome,
  type DmdMenuState,
  type DmdScreen,
  type DmdSpot,
  type ObservedDisplay,
  type Rect,
  type Rotation,
  type TableEntry,
  type VpxDisplayIdFormat,
} from '@cyberpinball/core';
import { bringToFront, hideWindow, keysDown, listWindows, setWindowBounds, showWindowInactive, tapKey, type WindowInfo } from '@cyberpinball/win-displays';
import { app, ipcMain, type BrowserWindow, type Input } from 'electron';
import { keyboardFollows } from './foreground';
import { joystickButtonsHeld, onJoystickInput, watchJoystickButtons } from './joystick-input';
import { createWindow, OFFSCREEN, windowRect } from './offscreen';

/** Titres des fenêtres de VPX 10.8.1 (Window.cpp). */
const PLAYER_TITLE = 'Visual Pinball Player';
const SCORE_VIEW_TITLE = 'Visual Pinball Score View';
/** Sondage de la combinaison pendant la partie. */
const COMBO_POLL_MS = 25;
/** VPX reprend le premier plan avant qu'on lui appuie la touche de son menu. */
const VPX_MENU_DELAY_MS = 200;

/** La partie en cours, telle que le menu en a besoin. */
export interface InGameContext {
  /** Processus de VPX ; undefined : partie simulée (essais hors écran), aucune fenêtre de VPX. */
  pid: number | undefined;
  table: TableEntry;
  /** Configuration de la borne branchée. */
  cabinet: CabinetConfiguration;
  /** Écrans branchés. */
  displays: ObservedDisplay[];
  /** Zone du plateau (pixels physiques) et sens de sa mise en page : où se pose le panneau. */
  place: { zone: Rect; rotation: Rotation } | undefined;
  /** VPinballX.ini de la partie : la touche du menu de VPX. */
  configurationIni: string;
  /**
   * La partie se joue dans le casque (vr.ts) : le menu de Cyber Pinball, sur les écrans, n'y serait
   * pas vu. La combinaison ouvre alors directement le menu de VPX, qui s'affiche dans le casque
   * (sa page « Virtual Reality Settings » cale la table).
   */
  vr?: boolean;
  dataDir: string;
}

export interface InGameMenu {
  /** Partie lancée : la combinaison est guettée. */
  arm(game: InGameContext): void;
  /** Fin de la partie : plus de guet, le menu se ferme. */
  disarm(): void;
  /** Essais sans opérateur : ouvre le menu comme la combinaison. */
  open(): void;
  isOpen(): boolean;
}

/** Écrans de la configuration branchés, l'écran du plateau d'abord, chacun nommé par ce qu'il montre. */
export function menuScreens(cabinet: CabinetConfiguration, displays: ObservedDisplay[]): DmdScreen[] {
  const { matched } = matchScreens(cabinet.screens, displays);
  const order = [...new Set([...ROLES.map((r) => cabinet.roles[r.id]).filter((fp): fp is string => Boolean(fp)), ...cabinet.screens.map((s) => s.fingerprint)])];
  return order
    .filter((fp) => matched.has(fp))
    .map((fp, i) => {
      const d = matched.get(fp)!;
      const roles = ROLES.filter((r) => cabinet.roles[r.id] === fp).map((r) => cabinetRoleLabel(cabinet, r.id, r.label));
      const name = roles.length ? roles.join(' + ') : d.friendlyName || d.monitorDescription || d.gdiName;
      return { fingerprint: fp, label: `${i + 1} · ${name} (${d.bounds.width} × ${d.bounds.height})`, bounds: d.bounds };
    });
}

/** Place générale du DMD dans la configuration (zones de l'assistant) ; undefined sans DMD branché. */
export function generalSpot(cabinet: CabinetConfiguration, screens: DmdScreen[]): DmdSpot | undefined {
  const screen = screens.findIndex((s) => s.fingerprint === cabinet.roles.dmd);
  return screen < 0 ? undefined : { screen, zone: roleZone(cabinet, 'dmd'), hidden: false };
}

/**
 * Avant la partie : la place du DMD de cette table dans la configuration branchée, écrite dans
 * [ScoreView] du .ini de la table ; sans place (ou son écran absent), les clés écrites la dernière
 * fois sont retirées et la table suit la disposition générale. Rend ce qui a été fait, pour le journal.
 */
export function prepareDmdPlace(table: TableEntry, ctx: { cabinet: CabinetConfiguration; displays: ObservedDisplay[]; dataDir: string; format: VpxDisplayIdFormat }): string | undefined {
  const file = readDmdPlaces(ctx.dataDir);
  const place = dmdPlaceOf(file, ctx.cabinet.id, table.id);
  const display = place && matchScreens(ctx.cabinet.screens, ctx.displays).matched.get(place.screen);
  const ini = findTableIni(table.file);
  const key = writtenKey(ini.path);
  const written = file.written?.[key];
  if (!place && !written) return undefined;
  const update = dmdIniUpdate(readTextIfExists(ini.path), display ? dmdPlaceSettings(place, display, ctx.format) : undefined, written);
  if (update.content === '') fs.rmSync(ini.path, { force: true });
  else if (update.content !== undefined) fs.writeFileSync(ini.path, update.content);
  const next = { ...(file.written ?? {}) };
  if (update.written) next[key] = update.written;
  else delete next[key];
  saveDmdPlaces(ctx.dataDir, { ...file, written: next });
  if (place && !display) return `Position du DMD (${table.id}) : écran de la place enregistrée absent, position générale pour cette partie.`; // i18n-ignore : journal
  if (place) return `Position du DMD (${table.id}) : ${place.hidden ? 'masqué' : `place de la table (${update.written?.ScoreViewWidth} × ${update.written?.ScoreViewHeight} en ${update.written?.ScoreViewWndX}, ${update.written?.ScoreViewWndY})`}${update.content === undefined ? ', déjà écrite' : ''}.`; // i18n-ignore : journal
  return update.content !== undefined ? `Position du DMD (${table.id}) : la table suit de nouveau la position générale.` : undefined; // i18n-ignore : journal
}

/** Une fenêtre par écran pendant le menu. */
interface ScreenWindow {
  win: BrowserWindow;
  index: number;
  loaded: boolean;
}

export function createInGameMenu(opts: { log: (line: string) => void; /** La porte game.settings du mode invité est ouverte. */ allowed: () => boolean }): InGameMenu {
  let game: InGameContext | undefined;
  let comboTimer: NodeJS.Timeout | undefined;
  let stopWatch: (() => void) | undefined;
  /** Combinaison vue enfoncée : elle doit être relâchée avant de rouvrir le menu. */
  let latched = false;
  let menu: { host: DmdMenuHost; state: DmdMenuState; windows: ScreenWindow[]; panel: number; vpx?: WindowInfo; applied: string; vpxHidden: boolean } | undefined;

  function comboCodes(cabinet: CabinetConfiguration): string[] {
    const keys = buttonKeys(cabinet.buttons);
    return inGameMenuButtons(keys).map((id) => keys[id]!).filter(Boolean);
  }

  /** La combinaison est-elle tenue, maintenant ? Clavier par Windows, joystick par SDL. */
  function comboDown(codes: string[]): boolean {
    if (!codes.length) return false;
    const joystick = new Set(joystickButtonsHeld());
    const vks = codes.filter((c) => !c.startsWith('SDLJoy_')).map(windowsVk);
    if (vks.some((vk) => vk === undefined)) return false;
    let keyboard: number[] = [];
    try {
      keyboard = vks.length ? keysDown(vks as number[]) : [];
    } catch {
      return false; // API de Windows indisponible
    }
    return codes.every((c) => (c.startsWith('SDLJoy_') ? joystick.has(c) : keyboard.includes(windowsVk(c)!)));
  }

  function poll(): void {
    if (!game || menu) return;
    const down = comboDown(comboCodes(game.cabinet));
    if (down && !latched) {
      latched = true;
      // Mode invité : la porte game.settings est fermée, la partie continue sans menu.
      if (!opts.allowed()) opts.log('Réglages en partie : fermés en mode invité.'); // i18n-ignore : journal
      else if (game.vr) openVpxMenuInHeadset();
      else open();
    } else if (!down) latched = false;
  }

  /** En VR : la touche du menu de VPX, appuyée pour lui (il a le premier plan pendant la partie). */
  function openVpxMenuInHeadset(): void {
    if (!game) return;
    const vk = windowsVk(vpxMenuKeys(IniDocument.parse(readTextIfExists(game.configurationIni))).find((c) => windowsVk(c) !== undefined) ?? '');
    if (vk === undefined) return void opts.log('Réglages en partie (VR) : aucune touche du clavier n’ouvre le menu de VPX, rien d’ouvert.'); // i18n-ignore : journal
    if (game.pid && !OFFSCREEN) tapKey(vk);
    opts.log(`Réglages en partie (${game.table.id}) : partie dans le casque, menu de VPX ouvert.`); // i18n-ignore : journal
  }

  function vpxWindow(title: string): WindowInfo | undefined {
    if (!game?.pid || OFFSCREEN) return undefined;
    try {
      return listWindows((w) => w.pid === game!.pid && w.title === title)[0];
    } catch {
      return undefined;
    }
  }

  function open(): void {
    if (!game || menu) return;
    const g = game;
    const screens = menuScreens(g.cabinet, g.displays);
    if (!screens.length) {
      opts.log('Réglages en partie : aucun écran de la configuration retrouvé, menu pas ouvert.'); // i18n-ignore : journal
      return;
    }
    const places = readDmdPlaces(g.dataDir);
    const own = dmdPlaceOf(places, g.cabinet.id, g.table.id);
    const general = generalSpot(g.cabinet, screens);
    const vpx = vpxWindow(SCORE_VIEW_TITLE);
    // Départ : la fenêtre du DMD telle que VPX l'a ouverte, sinon la place enregistrée, sinon la générale.
    const ownSpot = own && screens.findIndex((s) => s.fingerprint === own.screen) >= 0 ? { screen: screens.findIndex((s) => s.fingerprint === own.screen), zone: own.zone, hidden: Boolean(own.hidden) } : undefined;
    const fromVpx = vpx && dmdSpotOfRect(screens, vpx.rect, !vpx.visible);
    const spot = fromVpx ?? ownSpot ?? general ?? { screen: 0, zone: { x: 0.3, y: 0.4, width: 0.4, height: 0.1, aspect: 4 }, hidden: false };
    const vpxKey = vpxMenuKeys(IniDocument.parse(readTextIfExists(g.configurationIni))).find((c) => windowsVk(c) !== undefined);
    const keys = buttonKeys(g.cabinet.buttons);
    const group = (...codes: (string | undefined)[]) => codes.filter((c): c is string => Boolean(c));
    const host: DmdMenuHost = {
      screens,
      keys: {
        previous: group(keys.leftFlipper),
        next: group(keys.rightFlipper),
        confirm: group(keys.start, 'NumpadEnter'),
        exit: group(keys.exit),
        up: group(keys.leftMagna),
        down: group(keys.rightMagna),
      },
      table: g.table.title || g.table.id,
      configuration: g.cabinet.name,
      ownPlace: Boolean(own),
      ...(general && { general }),
      live: vpx ? true : t('VPX n’a pas ouvert de fenêtre pour le DMD dans cette partie (DMD éteint ou incrusté dans le plateau) : la place choisie se verra à la prochaine partie.'),
      ...(!vpxKey && { vpxMenuBlocked: t('Aucune touche du clavier n’ouvre le menu de VPX : un bouton de la borne a pris F12.') }),
    };
    const playfield = screens.findIndex((s) => s.fingerprint === g.cabinet.roles.playfield);
    const panel = Math.max(0, playfield);
    const windows = screens.map((screen, index) => overlay(screen, index, index === panel));
    menu = { host, state: startDmdMenu(spot), windows, panel, ...(vpx && { vpx }), applied: '', vpxHidden: Boolean(vpx && !vpx.visible) };
    opts.log(`Réglages en partie (${g.table.id}) : menu ouvert, DMD ${vpx ? `de VPX en ${vpx.rect.width} × ${vpx.rect.height} à ${vpx.rect.x}, ${vpx.rect.y}` : 'sans fenêtre dans cette partie'}${own ? ', place de la table' : ''}.`); // i18n-ignore : journal
  }

  /**
   * Une autre fenêtre de l'application prend le focus pendant le réglage (le fond de partie cliqué) :
   * le panneau le reprend et repasse devant, comme « Récupérer » (acquire-window.ts) ; sans lui, les
   * boutons iraient ailleurs, VPX toujours en pause.
   */
  function keepInFront(win: BrowserWindow): void {
    const raise = () => {
      if (win.isDestroyed() || OFFSCREEN) return;
      win.moveTop();
      if (!win.isFocused()) win.focus();
    };
    const otherFocused = (_e: Electron.Event, other: BrowserWindow) => {
      if (other !== win) setImmediate(raise);
    };
    app.on('browser-window-focus', otherFocused);
    win.once('closed', () => app.off('browser-window-focus', otherFocused));
  }

  function overlay(screen: DmdScreen, index: number, panel: boolean): ScreenWindow {
    const win = createWindow({
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: panel,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      ...windowRect(screen.bounds),
      webPreferences: { preload: path.join(__dirname, 'in-game-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    win.setContentProtection(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    const sw: ScreenWindow = { win, index, loaded: false };
    win.webContents.once('did-finish-load', () => {
      sw.loaded = true;
      if (OFFSCREEN) win.showInactive();
      else if (panel) {
        win.show();
        win.focus();
        // Le premier plan de Windows : VPX le perd et se met en pause, le clavier vient ici.
        keyboardFollows(win, 'les réglages en partie s’ouvraient'); // i18n-ignore : console
      } else win.showInactive();
      render();
    });
    if (panel) {
      win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        event.preventDefault();
        key(input);
      });
      onJoystickInput(win, (input) => {
        if (input.type === 'keyDown') key(input);
      });
      keepInFront(win);
    }
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'in-game-menu.html'));
    return sw;
  }

  function key(input: Input): void {
    if (!menu) return;
    outcome(dmdMenuKey(menu.host, menu.state, input));
  }

  function act(action: DmdMenuAction): void {
    if (!menu) return;
    outcome(dmdMenuAction(menu.host, menu.state, action));
  }

  function outcome(out: DmdMenuOutcome): void {
    if (!menu || !game) return;
    if (out === 'unhandled') return;
    if (out === 'general') {
      saveDmdPlaces(game.dataDir, withDmdPlace(readDmdPlaces(game.dataDir), game.cabinet.id, game.table.id, undefined));
      menu.host.ownPlace = false;
      markDmdGeneral(menu.host, menu.state);
      opts.log(`Réglages en partie (${game.table.id}) : la table suit de nouveau la position générale.`); // i18n-ignore : journal
    } else if (typeof out === 'object' && 'save' in out) {
      save();
      if (out.then !== 'stay') return close(out.then === 'vpx');
    } else if (typeof out === 'object' && 'resume' in out) {
      if (out.discard) applyLive(menu.state.saved);
      return close(false);
    } else if (typeof out === 'object' && 'vpx' in out) {
      if (out.discard) applyLive(menu.state.saved);
      return close(true);
    }
    applyLive(menu.state.spot);
    render();
  }

  function save(): void {
    if (!menu || !game) return;
    const s = menu.state;
    const place = { screen: menu.host.screens[s.spot.screen]!.fingerprint, zone: s.spot.zone, ...(s.spot.hidden && { hidden: true }), at: new Date().toISOString() };
    saveDmdPlaces(game.dataDir, withDmdPlace(readDmdPlaces(game.dataDir), game.cabinet.id, game.table.id, place));
    menu.host.ownPlace = true;
    markDmdSaved(s, t('Enregistré pour cette table dans la configuration « {name} » : elle s’ouvrira ainsi à chaque partie.', { name: game.cabinet.name }));
    const r = dmdSpotRect(menu.host, s.spot);
    opts.log(`Réglages en partie (${game.table.id}) : DMD enregistré pour la table, ${s.spot.hidden ? 'masqué' : `${r.width} × ${r.height} à ${r.x}, ${r.y}`} (configuration ${game.cabinet.id}).`); // i18n-ignore : journal
  }

  /** La fenêtre du DMD de VPX suit la place montrée. */
  function applyLive(spot: DmdSpot): void {
    if (!menu?.vpx) return;
    const r = dmdSpotRect(menu.host, spot);
    const applied = `${spot.hidden}:${r.x},${r.y},${r.width},${r.height}`;
    if (applied === menu.applied) return;
    menu.applied = applied;
    try {
      if (spot.hidden) {
        if (!menu.vpxHidden) hideWindow(menu.vpx);
        menu.vpxHidden = true;
        return;
      }
      setWindowBounds(menu.vpx, r);
      if (menu.vpxHidden) showWindowInactive(menu.vpx);
      menu.vpxHidden = false;
    } catch (error) {
      opts.log(`Réglages en partie : fenêtre du DMD de VPX pas déplacée (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  function render(): void {
    if (!menu) return;
    const panel = dmdMenuPanel(menu.host, menu.state, dmdMenuKeyNames(menu.host.keys));
    const place = game?.place;
    for (const sw of menu.windows) {
      if (!sw.loaded || sw.win.isDestroyed()) continue;
      const bounds = menu.host.screens[sw.index]!.bounds;
      const isPanel = sw.index === menu.panel;
      // Le panneau se pose dans la zone du plateau, en fractions de la fenêtre de son écran, tourné vers le joueur.
      const zone = isPanel && place ? { x: (place.zone.x - bounds.x) / bounds.width, y: (place.zone.y - bounds.y) / bounds.height, width: place.zone.width / bounds.width, height: place.zone.height / bounds.height } : { x: 0, y: 0, width: 1, height: 1 };
      sw.win.webContents.send('in-game:state', {
        screen: sw.index,
        frame: dmdMenuFrame(menu.host, menu.state, sw.index),
        dirty: dmdMenuDirty(menu.state),
        ...(isPanel && { panel, zone, rotation: place?.rotation ?? 0 }),
      });
    }
  }

  /** Le menu se ferme, VPX reprend le premier plan (et la partie) ; `vpxMenu` : puis son propre menu. */
  function close(vpxMenu: boolean): void {
    if (!menu) return;
    const closing = menu;
    menu = undefined;
    for (const sw of closing.windows) if (!sw.win.isDestroyed()) sw.win.close();
    const player = vpxWindow(PLAYER_TITLE);
    if (player) {
      try {
        bringToFront(player);
      } catch {
        // VPX quitte peut-être déjà.
      }
    }
    const vk = vpxMenu ? windowsVk(vpxMenuKeys(IniDocument.parse(readTextIfExists(game?.configurationIni ?? ''))).find((c) => windowsVk(c) !== undefined) ?? '') : undefined;
    if (vk !== undefined && player) setTimeout(() => tapKey(vk), VPX_MENU_DELAY_MS);
    opts.log(`Réglages en partie : menu fermé${vpxMenu ? ', menu de VPX ouvert' : ', la partie reprend'}.`); // i18n-ignore : journal
  }

  ipcMain.on('in-game:act', (event, action: DmdMenuAction) => {
    if (!menu?.windows.some((sw) => !sw.win.isDestroyed() && sw.win.webContents === event.sender)) return;
    act(action);
  });

  return {
    arm(next) {
      game = next;
      latched = false;
      stopWatch ??= watchJoystickButtons(() => poll());
      comboTimer ??= setInterval(poll, COMBO_POLL_MS);
    },
    disarm() {
      if (menu) close(false);
      game = undefined;
      if (comboTimer) clearInterval(comboTimer);
      comboTimer = undefined;
      stopWatch?.();
      stopWatch = undefined;
    },
    open,
    isOpen: () => Boolean(menu),
  };
}
