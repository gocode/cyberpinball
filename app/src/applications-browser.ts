// Applications (26/11/2026) : ouvrir un site dans un vrai Microsoft Edge (packages/core/src/applications.ts
// dit pourquoi), en fenêtre d'application plein écran sur l'écran voulu, avec son profil à lui ; Chrome
// seulement si Edge a été désinstallé. Ici aussi : les boutons de la borne relayés à Edge pendant qu'il a
// la main (flippers ←→, MagnaSave ↑↓, Start Entrée, lanceur Espace, Exit Échap ; Exit tenu une seconde
// ferme l'application).
//
// Sans electron : les essais chargent ce module tel quel, avec de faux gestes de fenêtre et de touches.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  APP_EXIT_HOLD_MS,
  EDGE_APPS_PROFILE_DIR,
  appBrowserArgs,
  appButtonKey,
  chromeExePaths,
  edgeExePaths,
  windowsVk,
  type AppButton,
  type AppEntry,
  type AppKey,
  type CabinetButtons,
  type ScreenRect,
} from '@cyberpinball/core';
import { edgeWindowOps, type EdgeKey, type EdgeWindowOps, type KeyMods } from './edge-login';

const VK: Record<EdgeKey, number> = { Enter: 0x0d, Tab: 0x09, Backspace: 0x08, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28, Space: 0x20, Escape: 0x1b };
const VK_A = 0x41;
const FIND_TIMEOUT_MS = 20_000;
const CLOSE_GRACE_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AppsBrowserOptions {
  dataDir: string;
  /** Navigateur ; d'office Edge, sinon Chrome, au premier emplacement connu qui existe. */
  browser?: () => AppsBrowserExe | undefined;
  windows?: EdgeWindowOps;
  log?: (line: string) => void;
  /** Essais seulement : arguments passés avant ceux du navigateur (le faux Edge est Node et son script). */
  argsPrefix?: string[];
}

export interface AppsBrowserExe {
  exe: string;
  kind: 'edge' | 'chrome';
}

/** Une application ouverte. */
export interface AppSession {
  readonly app: AppEntry;
  readonly browser: AppsBrowserExe['kind'];
  /** Fenêtre trouvée et posée sur l'écran voulu. */
  readonly shown: Promise<boolean>;
  /** Navigateur refermé (par la personne, Exit tenu ou finish). */
  readonly done: Promise<void>;
  rect(): ScreenRect | undefined;
  pointer(x: number, y: number): void;
  click(button: 'left' | 'right', count: number): void;
  wheel(dx: number, dy: number): void;
  type(text: string): void;
  key(key: EdgeKey, mods?: KeyMods): void;
  /** Tout le champ remplacé : Ctrl+A, puis le texte (ou Retour arrière s'il est vide). */
  set(value: string): void;
  /** Ramène le navigateur devant (après un geste sur un autre écran). */
  front(): void;
  /** Ferme le navigateur comme le bouton × : il range ses connexions avant de partir. */
  finish(): void;
}

export function createAppsBrowser(opts: AppsBrowserOptions) {
  const log = opts.log ?? (() => undefined);
  const profile = path.join(opts.dataDir, EDGE_APPS_PROFILE_DIR);
  const ops = () => (opts.windows ??= edgeWindowOps());
  let current: AppSession | undefined;

  function browser(): AppsBrowserExe | undefined {
    if (opts.browser) return opts.browser();
    const edge = edgeExePaths(process.env).find((p) => fs.existsSync(p));
    if (edge) return { exe: edge, kind: 'edge' };
    const chrome = chromeExePaths(process.env).find((p) => fs.existsSync(p));
    return chrome ? { exe: chrome, kind: 'chrome' } : undefined;
  }

  /**
   * Ouvre l'application en plein écran sur `at` (pixels physiques du bureau). undefined : ni Edge ni
   * Chrome. Une application déjà ouverte est refermée d'abord (un seul profil, une seule fenêtre).
   */
  function open(app: AppEntry, at: ScreenRect): AppSession | undefined {
    const found = browser();
    if (!found) return undefined;
    current?.finish();
    fs.mkdirSync(profile, { recursive: true });
    // Edge est l'application elle-même : sa fenêtre doit se voir.
    const child: ChildProcess = spawn(found.exe, [...(opts.argsPrefix ?? []), ...appBrowserArgs(profile, at, app.url)], { stdio: 'ignore' }); // fenêtre voulue
    child.once('error', () => undefined);
    log(`Applications : ${app.name} ouverte dans ${found.kind === 'edge' ? 'Edge' : 'Chrome'} (${Math.round(at.width)} × ${Math.round(at.height)} en ${Math.round(at.x)}, ${Math.round(at.y)})`); // i18n-ignore : journal
    let win: unknown;
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    const shown = (async () => {
      const until = Date.now() + FIND_TIMEOUT_MS;
      while (!win && Date.now() < until && child.exitCode === null) {
        await sleep(150);
        win = ops().find(child.pid ?? -1);
      }
      if (!win) {
        log(`Applications : fenêtre de ${app.name} introuvable`); // i18n-ignore : journal
        return false;
      }
      ops().place(win, at);
      ops().front(win);
      return true;
    })();
    const ready = (): boolean => {
      if (!win) return false;
      ops().front(win);
      return true;
    };
    const session: AppSession = {
      app,
      browser: found.kind,
      shown,
      done: exited.then(() => {
        if (current === session) current = undefined;
        log(`Applications : ${app.name} refermée`); // i18n-ignore : journal
      }),
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
    current = session;
    return session;
  }

  return {
    /** Le navigateur des applications : Edge, Chrome en secours, undefined si aucun. */
    browser,
    open,
    current: () => current,
  };
}

export type AppsBrowser = ReturnType<typeof createAppsBrowser>;

// ---------------------------------------------------------------------------
// Boutons de la borne

export interface AppButtonsInput {
  /** Touches relevées des boutons (buttonKeys). */
  keys: Readonly<CabinetButtons>;
  /** Codes de touche virtuelle enfoncés parmi ceux demandés (GetAsyncKeyState). */
  keysDown(vks: readonly number[]): number[];
  /** Boutons du joystick appuyés ou relâchés ; rend de quoi arrêter. */
  watchJoystick(listener: (code: string, down: boolean) => void): () => void;
  /** Vrai quand le navigateur a la main (aucune fenêtre de Cyber Pinball active). */
  browserHasFocus(): boolean;
  /** Une touche pour le navigateur. */
  key(key: AppKey): void;
  /** Exit tenu : fermer l'application. */
  quit(): void;
  /** Un bouton relâché, avant d'être relayé : vrai s'il est pris ailleurs (un téléphone à accepter). */
  intercept?(button: AppButton): boolean;
  /** Tout geste sur un bouton (l'écran assombri se rallume). */
  activity?(): void;
  pollMs?: number;
}

const APP_BUTTONS: readonly AppButton[] = ['leftFlipper', 'rightFlipper', 'leftMagna', 'rightMagna', 'start', 'plunger', 'exit'];

/**
 * Relaie les boutons de la borne au navigateur tant qu'il a la main. Un bouton agit au relâché, pour
 * qu'un Maj ou un Ctrl d'encodeur encore tenu ne se mêle pas à la touche envoyée ; une touche qu'Edge
 * reçoit déjà d'un encodeur (Entrée, Échap, flèches) n'est pas renvoyée. Exit tenu APP_EXIT_HOLD_MS
 * ferme l'application, même quand Cyber Pinball a repris la main. Rend de quoi arrêter.
 */
export function watchAppButtons(input: AppButtonsInput): () => void {
  const codes = APP_BUTTONS.map((b) => [b, input.keys[b]] as const).filter((e): e is readonly [AppButton, string] => Boolean(e[1]));
  const vks = codes.flatMap(([b, c]) => {
    const vk = c.startsWith('SDLJoy_') ? undefined : windowsVk(c);
    return vk === undefined ? [] : [[b, vk] as const];
  });
  const joy = new Map(codes.filter(([, c]) => c.startsWith('SDLJoy_')).map(([b, c]) => [c, b]));
  const held = new Set<AppButton>();
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let exitFired = false;

  function change(button: AppButton, down: boolean): void {
    if (down === held.has(button)) return;
    input.activity?.();
    if (down) {
      held.add(button);
      if (button === 'exit') {
        exitFired = false;
        exitTimer = setTimeout(() => {
          exitFired = true;
          input.quit();
        }, APP_EXIT_HOLD_MS);
      }
      return;
    }
    held.delete(button);
    if (button === 'exit') {
      clearTimeout(exitTimer);
      if (exitFired) return;
    }
    if (input.intercept?.(button)) return;
    if (!input.browserHasFocus()) return;
    const key = appButtonKey(button, input.keys[button] ?? '');
    if (key) input.key(key);
  }

  const timer = setInterval(() => {
    if (!vks.length) return;
    let down: number[];
    try {
      down = input.keysDown(vks.map(([, v]) => v));
    } catch {
      return; // API de Windows indisponible
    }
    for (const [b, v] of vks) change(b, down.includes(v));
  }, input.pollMs ?? 15);
  const stopJoy = joy.size ? input.watchJoystick((code, down) => joy.has(code) && change(joy.get(code)!, down)) : undefined;
  return () => {
    clearInterval(timer);
    clearTimeout(exitTimer);
    stopJoy?.();
  };
}
