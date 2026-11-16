// Lanceur de Pinball FX (app/src/pinballfx-launcher.ts) sur un système simulé :
// ni Steam, ni jeu, ni fenêtre réelle.
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

interface FakeWindow {
  hwnd: unknown;
  handle: bigint;
  pid: number;
  threadId: number;
  title: string;
  className: string;
  visible: boolean;
  minimized: boolean;
  topmost: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

interface LaunchResultLike {
  ok: boolean;
  failure?: string;
  message?: string;
  seconds: number;
  loadSeconds?: number;
  notices: string[];
}

const launcher = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-launcher.js')) as {
  isPinballFxWindow(w: Pick<FakeWindow, 'title' | 'className' | 'visible'>): boolean;
  launchPinballFx(opts: {
    command: { file: string; args: string[] };
    exitHeld?: () => boolean;
    timeoutMs?: number;
    onPlaying?: () => void;
    onForeground?: () => void;
    system: unknown;
  }): { pid: number | undefined; stop(): void; done: Promise<LaunchResultLike> };
};

function win(pid: number, title: string, className = 'UnrealWindow'): FakeWindow {
  return { hwnd: null, handle: BigInt(pid), pid, threadId: 1, title, className, visible: true, minimized: false, topmost: false, rect: { x: 0, y: 0, width: 10, height: 10 } };
}

/** Système simulé : l'horloge avance à la main, les fenêtres et processus sont posés par l'essai. */
function fakeSystem() {
  let clock = 0;
  const sys = {
    spawned: [] as { file: string; args: string[] }[],
    shown: [] as FakeWindow[],
    living: new Set<number>(),
    killed: [] as number[],
    closed: [] as number[],
    fronted: [] as number[],
    fg: undefined as number | undefined,
    launch(file: string, args: string[]) {
      sys.spawned.push({ file, args });
      return { pid: 1, on: () => undefined };
    },
    windows: () => sys.shown,
    alive: (pid: number) => sys.living.has(pid),
    kill(pid: number) {
      sys.killed.push(pid);
      sys.living.delete(pid);
    },
    close(w: FakeWindow) {
      sys.closed.push(w.pid);
    },
    front(w: FakeWindow) {
      sys.fronted.push(w.pid);
      sys.fg = w.pid;
    },
    foregroundPid: () => sys.fg,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
  };
  return sys;
}

const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));

test('fenêtre de jeu : titre « PinballFX », pas une page de Steam', () => {
  assert.equal(launcher.isPinballFxWindow(win(1, 'PinballFX')), true);
  assert.equal(launcher.isPinballFxWindow(win(1, 'Pinball FX', 'UnrealWindow')), true);
  assert.equal(launcher.isPinballFxWindow(win(1, 'Pinball FX', 'SDL_app')), false);
  assert.equal(launcher.isPinballFxWindow(win(1, 'Pinball FX - Steam', 'SDL_app')), false);
  assert.equal(launcher.isPinballFxWindow({ ...win(1, 'PinballFX'), visible: false }), false);
});

test('partie : le jeu paraît, prend le premier plan, se ferme ; durée comptée', async () => {
  const sys = fakeSystem();
  let playing = 0;
  let foreground = 0;
  const game = launcher.launchPinballFx({
    command: { file: 'steam.exe', args: ['-applaunch', '2328760', '-Table', '156'] },
    system: sys,
    onPlaying: () => playing++,
    onForeground: () => foreground++,
  });
  assert.deepEqual(sys.spawned, [{ file: 'steam.exe', args: ['-applaunch', '2328760', '-Table', '156'] }]);
  await tick();
  assert.equal(playing, 0);
  sys.advance(20_000);
  sys.shown.push(win(4242, 'PinballFX'));
  sys.living.add(4242);
  await tick();
  assert.equal(playing, 1);
  assert.deepEqual(sys.fronted, [4242]);
  assert.equal(game.pid, 4242);
  await tick();
  assert.equal(foreground, 1);
  sys.advance(90_000);
  sys.living.delete(4242);
  const result = await game.done;
  assert.equal(result.ok, true);
  assert.equal(result.seconds, 90);
  assert.equal(result.loadSeconds, 20);
});

test('appui long sur Exit : le jeu est fermé, retour au menu', async () => {
  const sys = fakeSystem();
  let exit = true; // tenu depuis le menu : ne compte pas avant d'être relâché
  const game = launcher.launchPinballFx({ command: { file: 'steam.exe', args: [] }, system: sys, exitHeld: () => exit });
  sys.shown.push(win(7, 'PinballFX'));
  sys.living.add(7);
  await tick();
  sys.advance(5000);
  await tick();
  assert.deepEqual(sys.closed, []);
  exit = false;
  await tick();
  exit = true;
  await tick();
  sys.advance(1000);
  await tick();
  assert.deepEqual(sys.closed, []);
  sys.advance(1500);
  await tick();
  assert.deepEqual(sys.closed, [7]);
  sys.living.delete(7);
  const result = await game.done;
  assert.equal(result.ok, true);
  assert.equal(result.notices.length, 1);
});

test('fenêtre jamais parue : échec « timeout » avec son explication', async () => {
  const sys = fakeSystem();
  const game = launcher.launchPinballFx({ command: { file: 'steam.exe', args: [] }, system: sys, timeoutMs: 1000 });
  await tick();
  sys.advance(2000);
  const result = await game.done;
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'timeout');
  assert.match(result.message ?? '', /Pinball FX/);
});

test('arrêt demandé : fermeture polie, puis processus forcé', async () => {
  const sys = fakeSystem();
  const game = launcher.launchPinballFx({ command: { file: 'steam.exe', args: [] }, system: sys });
  sys.shown.push(win(9, 'PinballFX'));
  sys.living.add(9);
  await tick();
  game.stop();
  assert.deepEqual(sys.closed, [9]);
  // Le jeu ne se ferme pas de lui-même : forcé au bout de 5 s (minuterie réelle).
  const result = await game.done;
  assert.deepEqual(sys.killed, [9]);
  assert.equal(result.ok, true);
});

const install = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-install.js')) as {
  isStoreWindow(w: Pick<FakeWindow, 'title' | 'visible'>): boolean;
  openPinballFxStore(
    getter: { store: 'steam'; file: string; args: string[] } | { store: 'epic'; url: string },
    opts: { system?: unknown; openUrl?: (url: string) => void; log?: (line: string) => void },
  ): boolean;
};

test('installer : Steam reçoit steam://install, sa nouvelle fenêtre passe devant (pas celles déjà ouvertes)', async () => {
  const sys = fakeSystem();
  sys.shown.push(win(1, 'Steam', 'SDL_app'));
  const ok = install.openPinballFxStore({ store: 'steam', file: 'steam.exe', args: ['steam://install/2328760'] }, { system: sys, log: () => undefined });
  assert.equal(ok, true);
  assert.deepEqual(sys.spawned, [{ file: 'steam.exe', args: ['steam://install/2328760'] }]);
  await tick(600);
  assert.deepEqual(sys.fronted, []);
  sys.shown.push(win(2, 'Installer - Pinball FX', 'SDL_app'));
  await tick(600);
  assert.deepEqual(sys.fronted, [2]);
});

test('installer : Epic ouvert sur sa page par son adresse', () => {
  const sys = fakeSystem();
  const opened: string[] = [];
  install.openPinballFxStore({ store: 'epic', url: 'com.epicgames.launcher://store/p/pinball-fx' }, { system: sys, openUrl: (u) => opened.push(u), log: () => undefined });
  assert.deepEqual(opened, ['com.epicgames.launcher://store/p/pinball-fx']);
  assert.deepEqual(sys.spawned, []);
  assert.equal(install.isStoreWindow({ title: 'Epic Games Launcher', visible: true }), true);
  assert.equal(install.isStoreWindow({ title: 'Cyber Pinball', visible: true }), false);
});
