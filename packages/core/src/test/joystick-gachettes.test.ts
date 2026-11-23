import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { GAME_KEYS, INTERFACE_KEYS, joystickButton, joystickCode, keyLabel, navigationKeys, recordKey, vpxInputSettings, withButtonMapping, type JoystickAxisButton } from '../buttons';
import { IniDocument } from '../ini';
import { resolveLocations } from '../locations';
import { REPO_ROOT } from './i18n-scan';

const device = `SDLJoy_${'a'.repeat(32)}_1`;
const left = joystickCode(device, 0x204, { threshold: 0, reversed: false });
const right = joystickCode(device, 0x205, { threshold: 0.5, reversed: true });

test('gâchettes : seuil et sens conservés du relevé à la navigation et à VPX', () => {
  assert.equal(left, `${device};516;o;0`);
  assert.deepEqual(joystickButton(right), { device, button: 517, axis: { threshold: 0.5, reversed: true } });
  assert.equal(keyLabel(left), 'Axe 5 du joystick (+)');
  const navigation = { previous: left, next: right, confirm: joystickCode(device, 0), back: joystickCode(device, 1) };
  assert.ok(navigationKeys({ navigation }).previous.includes(left));
  assert.equal(recordKey(INTERFACE_KEYS, {}, 'previous', left).refused, undefined);
  assert.equal(recordKey(GAME_KEYS, {}, 'leftFlipper', left).refused, undefined);
  const plan = vpxInputSettings({ leftFlipper: left, rightFlipper: right }, IniDocument.parse(''));
  assert.ok(plan.settings.find((s) => s.key === 'Mapping.LeftFlipper')!.value.includes(left));
  assert.equal(withButtonMapping(`${left} | Key;225`, [], right, left), right);
  assert.equal(withButtonMapping(`${device};516;o;0.000000 | Key;225`, [], right, left), right);
  assert.equal(withButtonMapping(`${device};516 | Key;225`, [], right, left), right);
  for (const bad of [`${device};4;o;0.5`, `${device};516;o;2`, `${device};516;x;NaN`]) assert.equal(joystickButton(bad), undefined);
});

function sdlLibrary(): string | undefined {
  if (process.env.CYBERPINBALL_SDL) return process.env.CYBERPINBALL_SDL;
  const root = resolveLocations(process.env).root;
  if (!root) return undefined;
  return ['SDL364.dll', 'SDL3.dll'].map((name) => path.join(root, 'emulators', 'vpx', 'current', name)).find((file) => fs.existsSync(file));
}
const dll = process.platform === 'win32' ? sdlLibrary() : undefined;

interface Reader {
  devices(): { id: string }[];
  poll(): { device: string; button: number; down: boolean; axis?: JoystickAxisButton }[];
  attachVirtual(name: string, buttons: number, axes?: number, hats?: number, gamepad?: boolean): number;
  moveVirtual(id: number, axis: number, value: number): void;
  pressVirtual(id: number, button: number, down: boolean): void;
  close(): void;
}

test('SDL : LT et RT indépendantes, LB et RB symétriques, aucun bouton issu des capteurs Pinscape', { skip: dll ? false : 'aucune bibliothèque SDL de VPX sur ce poste' }, () => {
  const { openJoysticks } = require(path.join(REPO_ROOT, 'packages', 'win-displays', 'dist', 'joystick.js')) as { openJoysticks(dll: string): Reader };
  const reader = openJoysticks(dll!);
  try {
    const before = reader.devices().length;
    const pad = reader.attachVirtual('Manette essai', 21, 6, 0, true);
    const id = reader.devices()[before]!.id;
    reader.moveVirtual(pad, 4, -1);
    reader.moveVirtual(pad, 5, -1);
    reader.poll();
    reader.moveVirtual(pad, 4, 1);
    reader.moveVirtual(pad, 5, 1);
    const down = reader.poll().filter((e) => e.device === id);
    assert.equal(down.length, 2);
    assert.deepEqual(down.map((e) => [e.button, e.down]), [[516, true], [517, true]]);
    assert.ok(down.every((e) => e.axis && !e.axis.reversed));
    assert.deepEqual(reader.poll(), []);
    reader.moveVirtual(pad, 4, -1);
    assert.deepEqual(reader.poll().map((e) => [e.button, e.down]), [[516, false]]);
    reader.moveVirtual(pad, 5, -1);
    assert.deepEqual(reader.poll().map((e) => [e.button, e.down]), [[517, false]]);
    // Boutons SDL LEFT_SHOULDER et RIGHT_SHOULDER de la manette virtuelle.
    for (const button of [9, 10]) {
      reader.pressVirtual(pad, button, true);
      assert.deepEqual(reader.poll(), [{ device: id, button, down: true }]);
      reader.pressVirtual(pad, button, false);
      assert.deepEqual(reader.poll(), [{ device: id, button, down: false }]);
    }
    const sensor = reader.attachVirtual('Capteur essai', 32, 6);
    reader.poll();
    reader.moveVirtual(sensor, 4, 1);
    reader.moveVirtual(sensor, 5, 1);
    assert.deepEqual(reader.poll(), []);
  } finally {
    reader.close();
  }
});

