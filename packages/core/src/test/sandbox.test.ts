import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWriteAllowed, sandboxPolicy } from '../sandbox';

const cwd = 'D:/projet';

test('pas de garde-fou en usage normal ni sans bac à sable', () => {
  assert.equal(sandboxPolicy({}, cwd), undefined);
  assert.equal(sandboxPolicy({ CYBERPINBALL_AUTOPILOT: 'Digit1' }, cwd), undefined, 'essai volontaire sur la vraie racine');
  assert.equal(sandboxPolicy({ CYBERPINBALL_HOME: 'tmp/home' }, cwd), undefined, 'bac à sable manipulé à la main');
});

test('essai sans opérateur dans un bac à sable : écriture limitée au bac à sable', () => {
  const policy = sandboxPolicy({ CYBERPINBALL_HOME: 'tmp/demo/home', CYBERPINBALL_CAPTURE: 'tmp/cap' }, cwd)!;
  assert.ok(isWriteAllowed(policy, 'tmp/demo/home/cabinet.json', cwd));
  assert.ok(isWriteAllowed(policy, 'D:/projet/tmp/captures/01.png', cwd));
  // Les deux incidents du 20 octobre 2026 : la vraie configuration et la vraie application.
  assert.ok(!isWriteAllowed(policy, 'D:/CyberPinball/config/VPinballX.ini', cwd));
  assert.ok(!isWriteAllowed(policy, 'D:/CyberPinball/app/CyberPinball.exe', cwd));
  assert.ok(!isWriteAllowed(policy, 'D:/projet/packages/core/src/model.ts', cwd));
});

test('une racine de test explicite est permise', () => {
  const policy = sandboxPolicy({ CYBERPINBALL_HOME: 'D:/essai/home', CYBERPINBALL_ROOT: 'D:/essai/racine', CYBERPINBALL_STRESS: '5,10' }, cwd)!;
  assert.ok(isWriteAllowed(policy, 'D:/essai/racine/tables/T2/T2.info', cwd));
  assert.ok(!isWriteAllowed(policy, 'D:/essai/autre/x', cwd));
});
