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
  FUTURE_PINBALL_BAM_LAUNCH_GAME: { name: string; processName?: string };
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
    opts: { simulated?: string; mode?: 'display'; install?: { exe: string; gameDir: string; tablesDir: string; source: string; loader?: string }; exists?: (p: string) => boolean },
  ): { name: string; why?: string; command?: { file: string; args: string[]; cwd: string; bam?: true }; dmdMirror?: { file: string; args: string[]; cwd: string }; launchGame: unknown; failureHint: string };
  startDmdMirror(
    command: { file: string; args: string[]; cwd: string },
    log: (line: string) => void,
    system: { launch(file: string, args: string[], cwd: string): { pid?: number; on(event: 'error', cb: (error: Error) => void): void }; alive(pid: number): boolean; kill(pid: number): void },
  ): { pid(): number | undefined; stop(): void };
  placeDmdMirror(pid: number | undefined, dmdScreen: FakeWindow['rect'] | undefined, windows: () => FakeWindow[], set: (w: FakeWindow, r: FakeWindow['rect']) => boolean): FakeWindow['rect'] | undefined;
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
    killed: [] as number[],
    /** Processus de « Future Pinball.exe » ouverts (jeu lancé par FPLoader). */
    games: [] as number[],
    processIds: (exe: string) => (exe.toLowerCase() === 'future pinball.exe' ? sys.games.filter((p) => sys.living.has(p)) : []),
    launch(file: string, args: string[], cwd?: string) {
      sys.spawned.push({ file, args, ...(cwd ? { cwd } : {}) });
      return { pid: childPid, on: () => undefined };
    },
    windows: () => sys.shown,
    alive: (pid: number) => sys.living.has(pid),
    kill: (pid: number) => {
      sys.killed.push(pid);
      sys.living.delete(pid);
    },
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

const LOADER = 'C:\\Games\\Future Pinball\\BAM\\FPLoader.exe';
const BAM_ARGS = ['/open', TABLE, '/play', '/exit', '/arcaderender', '/STAYINRAM'];

test('plan avec BAM : FPLoader depuis le dossier BAM, le jeu reconnu à son exécutable', () => {
  const plan = play.futurePinballPlan({ file: TABLE }, { install: { ...INSTALL, loader: LOADER } as never, exists: () => true });
  assert.deepEqual(plan.command, { file: LOADER, args: BAM_ARGS, cwd: 'C:\\Games\\Future Pinball\\BAM', bam: true });
  assert.equal(plan.launchGame, launcher.FUTURE_PINBALL_BAM_LAUNCH_GAME);
  assert.match(plan.failureHint, /FPLoader/);
  // Sans BAM : le jeu seul, reconnu à son propre processus.
  assert.equal(play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, exists: () => true }).launchGame, launcher.FUTURE_PINBALL_LAUNCH_GAME);
});

test('partie par BAM : le Future Pinball apparu après le lancement fait la partie, pas celui déjà ouvert ; FPLoader fermé à la fin', async () => {
  const sys = fakeSystem(500);
  // Un Future Pinball déjà ouvert avant (éditeur, partie d'un autre lanceur) : pas cette partie.
  sys.games.push(400);
  sys.living.add(400);
  sys.shown.push(win(400, 'Future Pinball - Editor'));
  let playing = 0;
  const command = { file: LOADER, args: BAM_ARGS, cwd: 'C:\\Games\\Future Pinball\\BAM' };
  const game = launcher.launchPinballFx({ command, game: launcher.FUTURE_PINBALL_BAM_LAUNCH_GAME, system: sys, onPlaying: () => playing++ });
  assert.deepEqual(sys.spawned, [command]);
  await tick();
  assert.equal(playing, 0, 'la fenêtre du Future Pinball déjà ouvert ne compte pas');
  // FPLoader ouvre le jeu : sa fenêtre, cachée puis visible.
  sys.games.push(900);
  sys.living.add(900);
  sys.shown.push(win(900, '', false));
  await tick();
  assert.equal(playing, 0);
  sys.shown.push(win(900, 'Future Pinball'));
  await tick();
  assert.equal(playing, 1);
  assert.equal(game.pid, 900);
  sys.advance(30_000);
  // On quitte la table : le jeu se ferme ; FPLoader (/STAYINRAM) resté ouvert est fermé, l'autre Future Pinball non.
  sys.living.delete(900);
  const result = await game.done;
  assert.equal(result.ok, true);
  assert.equal(result.seconds, 30);
  assert.deepEqual(sys.killed, [500]);
  assert.ok(sys.living.has(400));
});

test('partie par BAM : le jeu fermé sans fenêtre, ou FPLoader arrêté sans ouvrir le jeu, est un échec dit', async () => {
  const closed = fakeSystem(500);
  const first = launcher.launchPinballFx({ command: { file: LOADER, args: BAM_ARGS }, game: launcher.FUTURE_PINBALL_BAM_LAUNCH_GAME, system: closed });
  closed.games.push(901);
  closed.living.add(901);
  await tick();
  closed.living.delete(901);
  const r1 = await first.done;
  assert.equal(r1.failure, 'crash');
  assert.match(r1.message ?? '', /Future Pinball s’est fermé sans ouvrir la table/);
  assert.deepEqual(closed.killed, [500], 'FPLoader fermé aussi');

  const loaderGone = fakeSystem(500);
  const second = launcher.launchPinballFx({ command: { file: LOADER, args: BAM_ARGS }, game: launcher.FUTURE_PINBALL_BAM_LAUNCH_GAME, system: loaderGone });
  loaderGone.living.delete(500);
  await tick();
  loaderGone.advance(5000);
  await tick();
  let settled = false;
  void second.done.then(() => (settled = true));
  await tick();
  assert.equal(settled, false, 'le jeu peut encore paraître juste après l’arrêt de FPLoader');
  loaderGone.advance(11_000);
  const r2 = await second.done;
  assert.equal(r2.failure, 'crash');
  assert.match(r2.message ?? '', /lanceur \(BAM\)/);
});

test('DMD recopié : dans le plan quand dmdext et son .ini sont là ; lancé pour la partie, fermé à la fin par son numéro', () => {
  const has = (p: string) => !/dmdext|DmdDevice/i.test(p) || p.startsWith(INSTALL.gameDir);
  const plan = play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, exists: has });
  assert.equal(plan.dmdMirror?.file, `${INSTALL.gameDir}\\dmdext.exe`);
  assert.deepEqual(plan.dmdMirror?.args.slice(0, 2), ['mirror', '--source=futurepinball']);
  assert.equal(play.futurePinballPlan({ file: TABLE }, { install: INSTALL as never, exists: (p) => !/dmdext|DmdDevice/i.test(p) }).dmdMirror, undefined, 'pas de dmdext : rien');
  assert.equal(play.futurePinballPlan({ file: TABLE }, { simulated: '', exists: () => true }).dmdMirror, undefined, 'partie simulée : rien');

  const living = new Set([321]);
  const killed: number[] = [];
  const lines: string[] = [];
  const sys = { launch: () => ({ pid: 321, on: () => undefined }), alive: (p: number) => living.has(p), kill: (p: number) => (killed.push(p), living.delete(p)) };
  const mirror = play.startDmdMirror(plan.dmdMirror!, (l) => lines.push(l), sys);
  assert.equal(mirror.pid(), 321);
  assert.match(lines.join('\n'), /DMD recopié/);
  mirror.stop();
  mirror.stop();
  assert.deepEqual(killed, [321], 'fermé une seule fois, par le numéro du processus lancé');
  // Lancement impossible : noté, la partie continue.
  const failed = play.startDmdMirror(plan.dmdMirror!, (l) => lines.push(l), { ...sys, launch: () => { throw new Error('ENOENT'); } });
  assert.equal(failed.pid(), undefined);
  assert.match(lines.join('\n'), /dmdext pas lancé \(ENOENT\)/);
});

test('DMD recopié : la plus grande fenêtre de dmdext posée sur l’écran DMD ; celles des autres processus jamais touchées', () => {
  const dmdScreen = { x: 3840, y: -979, width: 1920, height: 1080 };
  const moved: { pid: number; to: FakeWindow['rect'] }[] = [];
  const set = (w: FakeWindow, r: FakeWindow['rect']) => (moved.push({ pid: w.pid, to: r }), true);
  const virtualDmd = { ...win(321, 'Virtual DMD'), rect: { x: 5889, y: 286, width: 1661, height: 415 } };
  const grip = { ...win(321, ''), rect: { x: 5889, y: 286, width: 12, height: 12 } };
  const other = { ...win(55, 'Autre'), rect: { x: 5889, y: 286, width: 1661, height: 415 } };
  assert.deepEqual(play.placeDmdMirror(321, dmdScreen, () => [grip, other, virtualDmd], set), { x: 3840, y: -679, width: 1920, height: 480 });
  assert.deepEqual(moved.map((m) => m.pid), [321]);
  // Déjà sur l'écran DMD, pas de DMD visible, pas d'écran DMD, pas de processus : rien.
  assert.equal(play.placeDmdMirror(321, dmdScreen, () => [{ ...virtualDmd, rect: { x: 3900, y: -700, width: 1600, height: 400 } }], set), undefined);
  assert.equal(play.placeDmdMirror(321, dmdScreen, () => [other], set), undefined);
  assert.equal(play.placeDmdMirror(321, undefined, () => [virtualDmd], set), undefined);
  assert.equal(play.placeDmdMirror(undefined, dmdScreen, () => [virtualDmd], set), undefined);
  assert.equal(moved.length, 1);
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
