// Connexion au compte YouTube dans un vrai Microsoft Edge (packages/core/src/youtube-account.ts dit
// pourquoi). Ici : lancer Edge sur l'écran voulu avec le profil du Juke-box, relayer la
// télécommande comme une souris et un clavier, attendre qu'il se ferme, puis relire ses cookies
// par Edge sans fenêtre. Rien n'est gardé hors du profil d'Edge : les cookies sont relus à chaque
// besoin, et yt-dlp les reçoit dans un fichier temporaire effacé après l'appel.
//
// Sans electron : les essais chargent ce module tel quel, avec de faux gestes de fenêtre.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EDGE_PROFILE_DIR,
  accountCookies,
  edgeExePaths,
  edgeLoginArgs,
  edgeReadArgs,
  parseDevToolsActivePort,
  youtubeCookieState,
  type AccountCookieState,
  type CdpCookie,
  type CookieRecord,
  type ScreenRect,
} from '@cyberpinball/core';

export interface KeyMods {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** Gestes de fenêtre et d'entrée (win-displays), remplaçables pour les essais. */
export interface EdgeWindowOps {
  /** Fenêtre visible principale du processus, s'il en a une. */
  find(pid: number): unknown;
  /** Rectangle actuel de la fenêtre (pixels physiques), undefined si elle n'existe plus. */
  rect(win: unknown): ScreenRect | undefined;
  place(win: unknown, at: ScreenRect): void;
  front(win: unknown): void;
  close(win: unknown): void;
  type(text: string): void;
  key(vk: number, mods?: KeyMods): void;
  pointer(x: number, y: number): void;
  click(button: 'left' | 'right', count: number): void;
  wheel(dx: number, dy: number): void;
}

export interface EdgeLoginOptions {
  dataDir: string;
  /** msedge.exe ; d'office, le premier des emplacements connus qui existe. */
  edgeExe?: () => string | undefined;
  windows?: EdgeWindowOps;
  log?: (line: string) => void;
  /** Essais seulement : autre tri des cookies (le faux site n'est ni YouTube ni Google). */
  cookieFilter?: (all: CdpCookie[]) => CookieRecord[];
  /** Essais seulement : arguments passés avant ceux d'Edge (le faux Edge est Node et son script). */
  argsPrefix?: string[];
}

export type EdgeKey = 'Enter' | 'Tab' | 'Backspace' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Space' | 'Escape';

/** Edge ouvert pour la connexion. */
export interface EdgeSession {
  /** Fenêtre trouvée et posée sur l'écran voulu. */
  readonly shown: Promise<boolean>;
  /** Edge refermé (par la personne ou par finish) et ses cookies relus. */
  readonly done: Promise<AccountCookieState>;
  rect(): ScreenRect | undefined;
  pointer(x: number, y: number): void;
  click(button: 'left' | 'right', count: number): void;
  wheel(dx: number, dy: number): void;
  type(text: string): void;
  key(key: EdgeKey, mods?: KeyMods): void;
  /** Tout le champ remplacé : Ctrl+A, puis le texte (ou Retour arrière s'il est vide). */
  set(value: string): void;
  /** Ramène Edge devant (après un geste sur un autre écran). */
  front(): void;
  /** Ferme Edge comme le bouton × : il range ses cookies avant de partir. */
  finish(): void;
}

const VK: Record<EdgeKey, number> = { Enter: 0x0d, Tab: 0x09, Backspace: 0x08, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28, Space: 0x20, Escape: 0x1b };
const VK_A = 0x41;
const READ_TIMEOUT_MS = 20_000;
const CLOSE_GRACE_MS = 15_000;
const FIND_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gestes réels, par win-displays (chargé à la demande : koffi n'existe que sous Windows). */
function realWindows(): EdgeWindowOps {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const w = require('@cyberpinball/win-displays') as typeof import('@cyberpinball/win-displays');
  type Win = import('@cyberpinball/win-displays').WindowInfo;
  return {
    find: (pid) => w.listWindows((x) => x.pid === pid && x.visible && x.className.startsWith('Chrome_WidgetWin') && x.rect.width > 200)[0],
    rect: (win) => w.windowOfHandle((win as Win).handle)?.rect,
    place: (win, at) => {
      w.setWindowBounds(win as Win, at);
      w.setTopmost(win as Win, true);
    },
    front: (win) => void w.bringToFront(win as Win),
    close: (win) => w.closeWindow(win as Win),
    type: (text) => void w.typeText(text),
    key: (vk, mods) => void w.pressKey(vk, mods),
    pointer: (x, y) => void w.setCursorPosition(x, y),
    click: (button, count) => void w.mouseClick(button, count),
    wheel: (dx, dy) => void w.mouseWheel(dx, dy),
  };
}

export function createEdgeLogin(opts: EdgeLoginOptions) {
  const log = opts.log ?? (() => undefined);
  const profile = path.join(opts.dataDir, EDGE_PROFILE_DIR);
  const ops = () => (opts.windows ??= realWindows());
  let session: { child: ChildProcess } | undefined;
  /** Une seule lecture à la fois (deux Edge sur un profil : le second passe la main au premier). */
  let reading: Promise<CookieRecord[]> | undefined;

  function edgeExe(): string | undefined {
    if (opts.edgeExe) return opts.edgeExe();
    return edgeExePaths(process.env).find((p) => fs.existsSync(p));
  }

  /** Un profil a déjà servi (sinon, inutile de lancer Edge pour savoir qu'on n'est pas connecté). */
  const hasProfile = () => fs.existsSync(path.join(profile, 'Local State'));

  /** Cookies du compte, relus par Edge sans fenêtre (jamais pendant la connexion). */
  function readCookies(): Promise<CookieRecord[]> {
    if (session || !hasProfile()) return Promise.resolve([]);
    reading ??= readOnce().finally(() => (reading = undefined));
    return reading;
  }

  async function readOnce(): Promise<CookieRecord[]> {
    const exe = edgeExe();
    if (!exe) return [];
    const portFile = path.join(profile, 'DevToolsActivePort');
    fs.rmSync(portFile, { force: true });
    const child = spawn(exe, [...(opts.argsPrefix ?? []), ...edgeReadArgs(profile)], { stdio: 'ignore', windowsHide: true });
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    child.once('error', () => undefined);
    const until = Date.now() + READ_TIMEOUT_MS;
    try {
      let at: { port: number; path: string } | undefined;
      while (!at && Date.now() < until && child.exitCode === null) {
        await sleep(100);
        at = fs.existsSync(portFile) ? parseDevToolsActivePort(fs.readFileSync(portFile, 'utf8')) : undefined;
      }
      if (!at) throw new Error('Edge sans fenêtre n’a pas ouvert son port'); // i18n-ignore : journal
      const ws = new WebSocket(`ws://127.0.0.1:${at.port}${at.path}`);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('connexion au port d’Edge refusée')); // i18n-ignore : journal
      });
      const reply = await new Promise<{ result?: { cookies?: CdpCookie[] } }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Edge n’a pas rendu ses cookies')), READ_TIMEOUT_MS); // i18n-ignore : journal
        ws.onmessage = (m) => {
          const d = JSON.parse(String(m.data)) as { id?: number };
          if (d.id !== 1) return;
          clearTimeout(timer);
          resolve(d as { result?: { cookies?: CdpCookie[] } });
        };
        ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }));
      });
      ws.send(JSON.stringify({ id: 2, method: 'Browser.close' }));
      const cookies = (opts.cookieFilter ?? accountCookies)(reply.result?.cookies ?? []);
      // Le nombre seulement : jamais un nom ni une valeur de cookie au journal.
      log(`Compte YouTube : ${cookies.length} cookies de YouTube et de Google relus dans Edge (${youtubeCookieState(cookies).connected ? 'connecté' : 'pas connecté'})`); // i18n-ignore : journal
      return cookies;
    } catch (error) {
      log(`Compte YouTube : lecture des cookies d’Edge impossible (${(error as Error).message})`); // i18n-ignore : journal
      throw error;
    } finally {
      await Promise.race([exited, sleep(5000)]);
      if (child.exitCode === null) child.kill();
      fs.rmSync(portFile, { force: true });
    }
  }

  /**
   * Ouvre Edge pour la connexion, posé sur `at` (pixels physiques du bureau : l'écran choisi pour
   * les navigateurs). undefined : Edge introuvable.
   */
  function open(at: ScreenRect, url?: string): EdgeSession | undefined {
    const exe = edgeExe();
    if (!exe) return undefined;
    if (session) session.child.kill();
    fs.mkdirSync(profile, { recursive: true });
    // Edge de la connexion : sa fenêtre doit se voir, sur l'écran choisi pour les navigateurs.
    const child = spawn(exe, [...(opts.argsPrefix ?? []), ...edgeLoginArgs(profile, at, url)], { stdio: 'ignore' }); // fenêtre voulue
    child.once('error', () => undefined);
    const mine = { child };
    session = mine;
    log(`Compte YouTube : Edge ouvert pour la connexion (${Math.round(at.width)} × ${Math.round(at.height)} en ${Math.round(at.x)}, ${Math.round(at.y)})`); // i18n-ignore : journal
    let win: unknown;
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    const shown = (async () => {
      const until = Date.now() + FIND_TIMEOUT_MS;
      while (!win && Date.now() < until && child.exitCode === null) {
        await sleep(150);
        win = ops().find(child.pid ?? -1);
      }
      if (!win) {
        log('Compte YouTube : fenêtre d’Edge introuvable'); // i18n-ignore : journal
        return false;
      }
      ops().place(win, at);
      ops().front(win);
      return true;
    })();
    const done = (async () => {
      await exited;
      if (session === mine) session = undefined;
      let s: AccountCookieState = { connected: false };
      try {
        s = youtubeCookieState(await readCookies());
      } catch {
        // Lecture impossible : pas connecté, la raison est au journal.
      }
      log(`Compte YouTube : Edge refermé, ${s.connected ? 'compte connecté' : 'pas de connexion'}`); // i18n-ignore : journal
      return s;
    })();
    const ready = (): boolean => {
      if (!win) return false;
      ops().front(win);
      return true;
    };
    return {
      shown,
      done,
      rect: () => (win ? ops().rect(win) : undefined),
      pointer: (x, y) => win && ops().pointer(x, y),
      click: (button, count) => ready() && ops().click(button, count),
      wheel: (dx, dy) => win && ops().wheel(dx, dy),
      type: (text) => ready() && ops().type(text),
      key: (k, mods) => ready() && ops().key(VK[k], mods),
      set: (value) => {
        if (!ready()) return;
        ops().key(VK_A, { ctrl: true });
        if (value) ops().type(value);
        else ops().key(VK.Backspace);
      },
      front: () => void ready(),
      finish: () => {
        if (child.exitCode !== null) return;
        if (win) ops().close(win);
        else child.kill();
        setTimeout(() => child.exitCode === null && child.kill(), CLOSE_GRACE_MS).unref?.();
      },
    };
  }

  /** Oublie la connexion : le profil d'Edge du Juke-box est effacé (Edge refermé d'abord). */
  async function forget(): Promise<void> {
    session?.child.kill();
    session = undefined;
    await reading?.catch(() => undefined);
    for (let i = 0; i < 10; i++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(300);
      }
    }
    log('Compte YouTube : connexion oubliée (profil d’Edge effacé)'); // i18n-ignore : journal
  }

  return {
    available: () => Boolean(edgeExe()),
    open: open,
    signingIn: () => Boolean(session),
    hasProfile,
    readCookies,
    forget,
  };
}

export type EdgeLogin = ReturnType<typeof createEdgeLogin>;
