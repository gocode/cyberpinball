import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  hatButton,
  hatChanges,
  hatValue,
  joystickButton,
  joystickCode,
  joystickHat,
  keyLabel,
  twinJoysticks,
  twinJoysticksAdvice,
  twinJoysticksInUse,
  withButtonMapping,
} from '../buttons';
import { buttonsHealthFacts, buttonsLines, healthLines, targetReachable } from '../health';
import { setLanguage } from '../i18n';
import { resolveLocations } from '../locations';

// Croix des manettes (chapeaux SDL) relevées comme des boutons, et cartes identiques que VPX
// ne distingue que par leur ordre de branchement (SDLInputHandler.h de VPX 10.8.1).

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);

test('croix : numérotées comme VPX (0x100 + 4 × croix + gauche, droite, haut, bas)', () => {
  assert.equal(hatButton(0, 'left'), 0x100);
  assert.equal(hatButton(0, 'right'), 0x101);
  assert.equal(hatButton(0, 'up'), 0x102);
  assert.equal(hatButton(0, 'down'), 0x103);
  assert.equal(hatButton(1, 'up'), 0x106);
  assert.deepEqual(joystickHat(0x106), { hat: 1, direction: 'up' });
  // Un vrai bouton, ou un axe (0x200 et plus), n'est pas une croix.
  assert.equal(joystickHat(31), undefined);
  assert.equal(joystickHat(0x200), undefined);
});

test('croix : chaque direction est un bouton, une diagonale en tient deux', () => {
  const up = hatValue(['up']);
  const upRight = hatValue(['up', 'right']);
  assert.deepEqual(hatChanges(0, 0, up), [{ button: 0x102, down: true }]);
  assert.deepEqual(hatChanges(0, up, upRight), [{ button: 0x101, down: true }]);
  assert.deepEqual(hatChanges(0, upRight, 0), [
    { button: 0x101, down: false },
    { button: 0x102, down: false },
  ]);
  assert.deepEqual(hatChanges(0, up, up), []);
});

test('croix : relevée, nommée et écrite dans [Input] comme un bouton de joystick', () => {
  setLanguage('fr');
  const device = `SDLJoy_${A}_1`;
  const code = joystickCode(device, hatButton(0, 'up'));
  assert.equal(code, `${device};258`);
  assert.deepEqual(joystickButton(code), { device, button: 258 });
  assert.equal(keyLabel(code), 'Croix ↑ du joystick');
  assert.equal(keyLabel(joystickCode(device, hatButton(1, 'left'))), 'Croix 2 ← du joystick');
  assert.equal(keyLabel(joystickCode(device, 3)), 'Bouton 4 du joystick');
  // [Input] : le jeton de la croix en tête, la touche du clavier de VPX à côté.
  assert.equal(withButtonMapping('', [225], code), `${code} | Key;225`);
  setLanguage('en');
  assert.equal(keyLabel(code), 'Joystick D-pad ↑');
  setLanguage('fr');
});

test('cartes identiques : repérées par leur GUID, signalées seulement si la borne s’en sert', () => {
  setLanguage('fr');
  const devices = [
    { id: `SDLJoy_${A}_1`, name: 'Generic USB Joystick' },
    { id: `SDLJoy_${B}_1`, name: 'mjrnet Pinscape Controller' },
    { id: `SDLJoy_${A}_2`, name: 'Generic USB Joystick' },
  ];
  const twins = twinJoysticks(devices);
  assert.deepEqual(twins, [{ name: 'Generic USB Joystick', devices: [`SDLJoy_${A}_1`, `SDLJoy_${A}_2`] }]);
  assert.deepEqual(twinJoysticks(devices.slice(0, 2)), []);
  assert.match(twinJoysticksAdvice(twins[0]!), /^2 cartes identiques \(Generic USB Joystick\) : VPX les distingue par leur ordre de branchement/);

  // Boutons sur le Pinscape seul : les deux Zero Delay ne servent à rien, rien à dire.
  assert.deepEqual(twinJoysticksInUse(twins, { buttons: { leftFlipper: `SDLJoy_${B}_1;0` } }), []);
  // Un bouton du jeu, de l'interface, ou le lanceur sur l'une d'elles : à signaler.
  assert.equal(twinJoysticksInUse(twins, { buttons: { start: `SDLJoy_${A}_2;1` } }).length, 1);
  assert.equal(twinJoysticksInUse(twins, { navigation: { next: `SDLJoy_${A}_1;258` } }).length, 1);
  assert.equal(twinJoysticksInUse(twins, { analog: { plunger: { device: `SDLJoy_${A}_1`, axis: 2, reversed: false, deadZone: 0.02 } } }).length, 1);
  assert.deepEqual(twinJoysticksInUse(twins, undefined), []);
});

test('Santé : « Boutons de la borne » à vérifier, vers Commandes de la borne', () => {
  setLanguage('fr');
  const devices = [
    { id: `SDLJoy_${A}_1`, name: 'Generic USB Joystick' },
    { id: `SDLJoy_${A}_2`, name: 'Generic USB Joystick' },
  ];
  const facts = buttonsHealthFacts(devices, { buttons: { leftFlipper: `SDLJoy_${A}_1;0` } });
  assert.deepEqual(facts, { joysticks: 2, twins: [{ name: 'Generic USB Joystick', count: 2 }] });
  const lines = buttonsLines(facts);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.check, 'buttons');
  assert.equal(lines[0]!.state, 'check');
  assert.equal(lines[0]!.title, 'Cartes de boutons identiques : Generic USB Joystick');
  assert.match(lines[0]!.detail!, /identifiant USB différent/);
  assert.ok(targetReachable(lines[0]!.target));
  // Rien à signaler : une ligne « prêt » avec les joysticks lus.
  assert.deepEqual(buttonsLines(buttonsHealthFacts(devices, { buttons: {} })).map((l) => [l.state, l.title]), [['ok', '2 joysticks lus']]);
  const all = healthLines({ at: '', disks: [], buttons: facts, vpx: { installed: '10.8.1' } });
  assert.ok(all.some((l) => l.check === 'buttons'));
});

// ---------- Par la bibliothèque SDL de VPX, avec des joysticks virtuels ----------

function sdlLibrary(): string | undefined {
  if (process.env.CYBERPINBALL_SDL) return process.env.CYBERPINBALL_SDL;
  const root = resolveLocations(process.env).root;
  if (!root) return undefined;
  const dir = path.join(root, 'emulators', 'vpx', 'current');
  return ['SDL364.dll', 'SDL3.dll'].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
}

const dll = process.platform === 'win32' ? sdlLibrary() : undefined;

interface Reader {
  devices(): { id: string; name: string; buttons: number; axes: number; hats: number }[];
  poll(): { device: string; button: number; down: boolean }[];
  attachVirtual(name: string, buttons: number, axes?: number, hats?: number): number;
  moveVirtualHat(sdlId: number, hat: number, value: number): void;
  close(): void;
}

test('croix lue par le SDL de VPX : chaque direction arrive comme le bouton que VPX écrit', { skip: dll ? false : 'aucune bibliothèque SDL de VPX sur ce poste' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openJoysticks } = require(path.join(__dirname, '..', '..', '..', 'win-displays', 'dist', 'joystick.js')) as { openJoysticks(dll: string): Reader };
  const reader = openJoysticks(dll!);
  try {
    const before = reader.devices().length;
    // Deux manettes identiques à une croix (deux I-PAC en XInput, deux Zero Delay).
    const first = reader.attachVirtual('Essai croix', 12, 0, 1);
    reader.attachVirtual('Essai croix', 12, 0, 1);
    const devices = reader.devices().slice(before);
    assert.equal(devices.length, 2);
    assert.equal(devices[0]!.hats, 1);
    assert.equal(twinJoysticks(devices).length, 1);

    reader.poll();
    reader.moveVirtualHat(first, 0, hatValue(['up']));
    assert.deepEqual(reader.poll(), [{ device: devices[0]!.id, button: 0x102, down: true }]);
    reader.moveVirtualHat(first, 0, hatValue(['up', 'right']));
    assert.deepEqual(reader.poll(), [{ device: devices[0]!.id, button: 0x101, down: true }]);
    assert.deepEqual(reader.poll(), []);
    reader.moveVirtualHat(first, 0, 0);
    assert.deepEqual(
      reader.poll().sort((a, b) => a.button - b.button),
      [
        { device: devices[0]!.id, button: 0x101, down: false },
        { device: devices[0]!.id, button: 0x102, down: false },
      ],
    );
  } finally {
    reader.close();
  }
});
