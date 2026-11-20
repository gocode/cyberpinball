// Secousses de la borne rendues en touches à Future Pinball (packages/core/src/nudge-keys.ts,
// app/src/nudge-keys.ts) : un à-coup franc de l'accéléromètre devient la touche de secousse de son côté,
// une fois ; le repos, une dérive lente ou le rebond de la caisse ne comptent pas.
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { NudgeDetector, futurePinballGameKeys } from '../index';
import { REPO_ROOT } from './i18n-scan';

const PINSCAPE = { gain: 2 };

test('détecteur : à gauche, à droite, vers l’avant ; le repos et une petite vibration ne comptent pas', () => {
  const d = new NudgeDetector(PINSCAPE);
  assert.equal(d.read(0.01, -0.02, 0), undefined, 'première lecture : le repos');
  assert.equal(d.read(0.05, 0.03, 10), undefined, 'vibration (flipper, haut-parleur)');
  assert.equal(d.read(-0.3, 0, 20), 'left', 'à-coup vers la gauche (0,3 × gain 2)');
  const r = new NudgeDetector(PINSCAPE);
  r.read(0, 0, 0);
  assert.equal(r.read(0.3, 0.05, 10), 'right');
  const u = new NudgeDetector(PINSCAPE);
  u.read(0, 0, 0);
  assert.equal(u.read(0.05, -0.4, 10), 'up', 'poussée vers l’avant (axe Y, un sens ou l’autre)');
});

test('détecteur : le rebond de la caisse ne fait pas une seconde secousse ; une autre, après la pause, oui', () => {
  const d = new NudgeDetector(PINSCAPE);
  d.read(0, 0, 0);
  assert.equal(d.read(-0.4, 0, 10), 'left');
  assert.equal(d.read(0.35, 0, 60), undefined, 'rebond à droite juste après');
  assert.equal(d.read(0, 0, 200), undefined);
  assert.equal(d.read(-0.4, 0, 600), 'left', 'nouvelle secousse après la pause');
});

test('détecteur : un accéléromètre décentré, ou qui dérive doucement, reste au repos', () => {
  const d = new NudgeDetector(PINSCAPE);
  assert.equal(d.read(0.12, 0.1, 0), undefined, 'au repos, décentré');
  let t = 0;
  // Dérive lente vers 0,2 (gain compris : 0,4), sans à-coup.
  for (let x = 0.12; x <= 0.2; x += 0.002) assert.equal(d.read(x, 0.1, (t += 10)), undefined);
  // Un à-coup franc reste vu à partir du nouveau centre.
  assert.equal(d.read(0.2 + 0.3, 0.1, (t += 10)), 'right');
});

test('détecteur : le sens suit le réglage de la borne pour VPX (axe X inversé)', () => {
  const d = new NudgeDetector({ gain: 2, invertX: true });
  d.read(0, 0, 0);
  assert.equal(d.read(-0.3, 0, 10), 'right');
});

const bridge = require(path.join(REPO_ROOT, 'app', 'dist', 'nudge-keys.js')) as {
  bridgeNudgeKeys(
    sensor: { device: string; x: number; y: number; gain?: number },
    keys: Partial<Record<'left' | 'right' | 'up', string>>,
    gamePid: () => number | undefined,
    name: string,
    system: unknown,
  ): () => void;
};

test('relais : la touche de secousse du jeu frappée une fois, seulement quand le jeu a le premier plan', () => {
  let clock = 0;
  let values: number[] = [0, 0, 0];
  let front = 777;
  let tick: () => void = () => undefined;
  const pending: (() => void)[] = [];
  const keys: string[] = [];
  const system = {
    axes: (device: string) => (device === 'SDLJoy_pinscape' ? values : undefined),
    foregroundPid: () => front,
    key: (vk: number, down: boolean) => keys.push(`${vk}${down ? '↓' : '↑'}`),
    every: (_ms: number, run: () => void) => ((tick = run), () => (tick = () => undefined)),
    later: (_ms: number, run: () => void) => pending.push(run),
    now: () => clock,
  };
  const fp = futurePinballGameKeys(() => undefined);
  const stop = bridge.bridgeNudgeKeys({ device: 'SDLJoy_pinscape', x: 0, y: 1, gain: 2 }, { left: fp.nudgeLeft![0]!, right: fp.nudgeRight![0]!, up: fp.nudgeCenter![0]! }, () => 777, 'Future Pinball', system);
  tick();
  values = [-0.4, 0, 0];
  clock += 10;
  tick();
  pending.splice(0).forEach((run) => run());
  // Z (0x5A) : la touche de secousse à gauche de Future Pinball, enfoncée puis relâchée.
  assert.deepEqual(keys, ['90↓', '90↑']);
  // Jeu pas au premier plan : gardée.
  values = [0, 0, 0];
  clock += 1000;
  tick();
  front = 1;
  values = [0.4, 0, 0];
  clock += 10;
  tick();
  assert.equal(keys.length, 2);
  stop();
});
