// Partie de Future Pinball (app/src/futurepinball-play.ts, lanceur app/src/pinballfx-launcher.ts) sur un
// système simulé : ni jeu, ni fenêtre réelle. La commande exacte part au lanceur ; la fenêtre du processus
// lancé fait la partie ; un jeu fermé sans fenêtre est un échec dit, pas une attente de deux minutes.
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
}

const launcher = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-launcher.js')) as {
  FUTURE_PINBALL_LAUNCH_GAME: { name: string; ownProcess?: boolean };
  launchPinballFx(opts: {
    command: { file: string; args: string[]; cwd?: string };
    game?: unknown;
    onPlaying?: () => void;
    onWindow?: (w: FakeWindow) => void;
    timeoutMs?: number;
    system: unknown;
  }): { pid: number | undefined; stop(): void; done: Promise<LaunchResultLike> };
};

const play = require(path.join(REPO_ROOT, 'app', 'dist', 'futurepinball-play.js')) as {
  futurePinballPlan(
    table: { file: string },
    opts: { simulated?: string; mode?: 'display'; install?: { exe: string; gameDir: string; tablesDir: string; source: string }; exists?: (p: string) => boolean },
  ): { name: string; why?: string; command?: { file: string; args: string[]; cwd: string }; failureHint: string };
  placeFuturePinballWindow(w: FakeWindow, playfield: FakeWindow['rect'] | undefined, displays: FakeWindow['rect'][], set: (w: FakeWindow, r: FakeWindow['rect']) => boolean): FakeWindow['rect'] | undefined;
};

const INSTALL = { exe: 'C:\\Games\\Future Pinball\\Future Pinball.exe', gameDir: 'C:\\Games\\Future Pinball', tablesDir: 'C:\\Games\\Future Pinball\\Tables', source: 'found' };
const TABLE = 'D:\\Cyber Pinball\\Tables\\Alien (Original 2008)\\Alien.fpt';

function win(pid: number, title: string, visible = true): FakeWindow {
  return { hwnd: null, handle: BigInt(pid), pid, threadId: 1, title, className: 'FuturePinball', visible, minimized: false, topmost: false, rect: { x: 50, y: 50, width: 800, height: 600 } };
}

function fakeSystem(childPid = 777) {
  let clock = 0;
  const sys = {
    spawned: [] as { file: string; args: string[]; cwd?: string }[],
    shown: [] as FakeWindow[],
    living: new Set<number>([childPid]),
    fronted: [] as number[],
    launch(file: string, args: string[], cwd?: string) {
      sys.spawned.push({ file, args, ...(cwd ? { cwd } : {}) });
      return { pid: childPid, on: () => undefined };
    },
    windows: () => sys.shown,
    alive: (pid: number) => sys.living.has(pid),
    kill: (pid: number) => sys.living.delete(pid),
    close: () => undefined,
    front: (w: FakeWindow) => sys.fronted.push(w.pid),
    foregroundPid: () => undefined,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
  };
  return sys;
}

const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));

test('plan : la commande exacte quand le jeu et la table sont là ; sinon la raison, sans lancer', () => {
  const ok = play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, exists: () => true });
  assert.equal(ok.why, undefined);
  assert.deepEqual(ok.command, { file: INSTALL.exe, args: ['/open', TABLE, '/play', '/exit'], cwd: INSTALL.gameDir });
  assert.equal(ok.name, 'Future Pinball');

  const absent = play.futurePinballPlan({ file: TABLE }, { exists: () => true });
  assert.match(absent.why ?? '', /introuvable sur ce PC/);
  assert.equal(absent.command, undefined);
  assert.match(play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, exists: () => false }).why ?? '', /fichier de la table est introuvable/);
  assert.match(play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, mode: 'display', exists: () => true }).why ?? '', /cadrage/);
  // Hors écran (partie simulée) : ni raison ni commande, la partie simulée joue.
  const simulated = play.futurePinballPlan({ file: TABLE }, { simulated: '', exists: () => false });
  assert.equal(simulated.why, undefined);
  assert.equal(simulated.command, undefined);
});

test('partie : lancé depuis le dossier du jeu, la fenêtre du processus lancé fait la partie, quel que soit son titre', async () => {
  const sys = fakeSystem();
  let playing = 0;
  const seen: number[] = [];
  const command = { file: INSTALL.exe, args: ['/open', TABLE, '/play', '/exit'], cwd: INSTALL.gameDir };
  const game = launcher.launchPinballFx({ command, game: launcher.FUTURE_PINBALL_LAUNCH_GAME, system: sys, onPlaying: () => playing++, onWindow: (w) => seen.push(w.pid) });
  assert.deepEqual(sys.spawned, [command]);
  // Une page web qui porte son nom n'est pas le jeu ; une fenêtre cachée du jeu non plus.
  sys.shown.push(win(55, 'Future Pinball - Wikipédia'), win(777, '', false));
  await tick();
  assert.equal(playing, 0);
  sys.advance(4000);
  sys.shown.push(win(777, 'Future Pinball'));
  await tick();
  assert.equal(playing, 1);
  assert.deepEqual(seen, [777]);
  assert.deepEqual(sys.fronted, [777]);
  sys.advance(60_000);
  sys.living.delete(777);
  const result = await game.done;
  assert.equal(result.ok, true);
  assert.equal(result.seconds, 60);
});

test('jeu fermé sans ouvrir de fenêtre : échec dit aussitôt', async () => {
  const sys = fakeSystem();
  const game = launcher.launchPinballFx({ command: { file: INSTALL.exe, args: ['/open', TABLE, '/play', '/exit'] }, game: launcher.FUTURE_PINBALL_LAUNCH_GAME, system: sys });
  await tick();
  sys.living.delete(777);
  const result = await game.done;
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'crash');
  assert.match(result.message ?? '', /Future Pinball s’est fermé sans ouvrir la table/);
});

test('placement : une fenêtre ouverte ailleurs est posée sur le playfield ; le plein écran n’est pas touché', () => {
  const playfield = { x: 1920, y: 0, width: 1080, height: 1920 };
  const main = { x: 0, y: 0, width: 1920, height: 1080 };
  const moved: FakeWindow['rect'][] = [];
  const set = (_w: FakeWindow, r: FakeWindow['rect']) => (moved.push(r), true);
  assert.deepEqual(play.placeFuturePinballWindow(win(1, 'Future Pinball'), playfield, [main, playfield], set), playfield);
  assert.equal(play.placeFuturePinballWindow({ ...win(1, 'Future Pinball'), rect: { ...main } }, playfield, [main, playfield], set), undefined);
  assert.deepEqual(moved, [playfield]);
});
