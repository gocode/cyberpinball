import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  HoldDetector,
  joystickStartCode,
  readPidFile,
  relaunchAppPidFile,
  relaunchDecision,
  relaunchEnabled,
  saveRelaunchEnabled,
  START_HOLD_MS,
  writePidFile,
} from '../index';

const START = 'SDLJoy_03000000d8a6000003ea000000000000_1;3';

test('relance par Start : seul un Start sur un bouton de joystick compte', () => {
  assert.equal(joystickStartCode({ start: START }), START);
  assert.equal(joystickStartCode({ start: 'Digit1' }), undefined);
  assert.equal(joystickStartCode({}), undefined);
  assert.equal(joystickStartCode(undefined), undefined);
});

test('relance par Start : l’appui long part une fois, après la durée, sans interruption', () => {
  const hold = new HoldDetector();
  assert.equal(hold.update(true, 0), false);
  assert.equal(hold.update(true, START_HOLD_MS - 1), false);
  assert.equal(hold.update(true, START_HOLD_MS), true);
  // Toujours tenu : pas de seconde relance.
  assert.equal(hold.update(true, START_HOLD_MS * 3), false);
  // Relâché puis repris : le compte repart de zéro.
  assert.equal(hold.update(false, START_HOLD_MS * 3 + 10), false);
  assert.equal(hold.update(true, START_HOLD_MS * 4), false);
  assert.equal(hold.update(true, START_HOLD_MS * 5), true);
});

test('relance par Start : un Start déjà tenu doit être relâché avant de compter', () => {
  const hold = new HoldDetector();
  hold.waitRelease();
  assert.equal(hold.update(true, 0), false);
  assert.equal(hold.update(true, START_HOLD_MS * 2), false);
  assert.equal(hold.update(false, START_HOLD_MS * 2 + 10), false);
  assert.equal(hold.update(true, START_HOLD_MS * 3), false);
  assert.equal(hold.update(true, START_HOLD_MS * 4), true);
});

test('relance par Start : un appui court, même répété, ne relance pas', () => {
  const hold = new HoldDetector();
  let now = 0;
  for (let i = 0; i < 10; i += 1) {
    assert.equal(hold.update(true, now), false);
    now += START_HOLD_MS / 2;
    assert.equal(hold.update(false, now), false);
    now += 50;
  }
});

test('relance par Start : rien quand Cyber Pinball est ouvert ou qu’une partie de VPX tourne', () => {
  assert.equal(relaunchDecision({ appAlive: false, vpxPlaying: false }), 'launch');
  assert.equal(relaunchDecision({ appAlive: true, vpxPlaying: false }), 'app-open');
  assert.equal(relaunchDecision({ appAlive: true, vpxPlaying: true }), 'app-open');
  assert.equal(relaunchDecision({ appAlive: false, vpxPlaying: true }), 'vpx-playing');
});

test('relance par Start : réglage activé par défaut, pid relu tel qu’écrit', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'relance-start-'));
  try {
    assert.equal(relaunchEnabled(data), true);
    saveRelaunchEnabled(data, false);
    assert.equal(relaunchEnabled(data), false);
    saveRelaunchEnabled(data, true);
    assert.equal(relaunchEnabled(data), true);
    assert.equal(readPidFile(relaunchAppPidFile(data)), undefined);
    writePidFile(relaunchAppPidFile(data), 4242);
    assert.equal(readPidFile(relaunchAppPidFile(data)), 4242);
    fs.writeFileSync(relaunchAppPidFile(data), 'pas un nombre');
    assert.equal(readPidFile(relaunchAppPidFile(data)), undefined);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
