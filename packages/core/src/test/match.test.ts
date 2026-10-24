import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprintOf, toPhysicalScreen } from '../fingerprint';
import { matchScreens } from '../match';
import { devPcDisplays } from './fixtures';

test('empreinte forte avec série EDID, faible sans', () => {
  const [sam, auo] = devPcDisplays();
  assert.deepEqual(fingerprintOf(sam!), {
    key: 'SAM-0C8D-H4LN301501-48x27cm',
    strength: 'strong',
    modelKey: 'SAM-0C8D-48x27cm',
  });
  assert.equal(fingerprintOf(auo!).strength, 'weak');
  assert.equal(fingerprintOf(auo!).key, 'AUO-139D-38x21cm@5&253a7f23&0&UID4357');
});

test('retrouve les écrans quand Windows les renumérote et les déplace', () => {
  const before = devPcDisplays();
  const saved = before.map(toPhysicalScreen);

  // Après une mise à jour du pilote : numéros et positions permutés.
  const after = devPcDisplays();
  after[0]!.gdiName = '\\\\.\\DISPLAY2';
  after[0]!.bounds = { ...after[0]!.bounds, x: 1920 };
  after[3]!.gdiName = '\\\\.\\DISPLAY3';
  after[3]!.bounds = { ...after[3]!.bounds, x: -1920 };

  const result = matchScreens(saved, after.reverse());
  assert.equal(result.matched.size, 4);
  assert.deepEqual(result.missing, []);
  assert.equal(result.matched.get('SAM-0C8D-H4LN301501-48x27cm')?.gdiName, '\\\\.\\DISPLAY2');
});

test('empreinte faible retrouvée par le modèle si le câble change de port', () => {
  const saved = devPcDisplays().map(toPhysicalScreen);
  const after = devPcDisplays();
  after[1]!.devicePath = after[1]!.devicePath.replace('UID4357', 'UID9999');

  const result = matchScreens(saved, after);
  assert.equal(result.matched.size, 4);
  assert.deepEqual(result.approximate, ['AUO-139D-38x21cm@5&253a7f23&0&UID4357']);
});

test('signale les écrans débranchés et les nouveaux écrans', () => {
  const saved = devPcDisplays().slice(0, 2).map(toPhysicalScreen);
  const after = devPcDisplays().slice(1);

  const result = matchScreens(saved, after);
  assert.deepEqual(result.missing, ['SAM-0C8D-H4LN301501-48x27cm']);
  assert.equal(result.unknown.length, 2);
});
