import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUTTONS, DEFAULT_BUTTONS, buttonInfo, gameKeys, recordButton, vpxVolumeSettings } from '../buttons';
import { MUTE_HOLD_MS, VOLUME_BADGE_SIZE, VolumeButtons, gameNoticeBounds, volumeAfter, volumeOutputIds, volumeView, type OutputVolume, type VolumeButton } from '../index';
import { IniDocument } from '../ini';
import { planVpxSync } from '../sync';
import type { Cabinet, CabinetButtons } from '../model';
import { toPhysicalScreen } from '../fingerprint';
import { devPcDisplays, emptyCabinet } from './fixtures';

const one = (level: number, muted = false): OutputVolume[] => [{ id: 'a', level, muted }];
const levels = (outputs: OutputVolume[]) => outputs.map((o) => o.level);

test('boutons de volume : un pas par appui, sans répétition ; Volume − tenu une seconde, une fois', () => {
  const b = new VolumeButtons();
  const down = (...ids: VolumeButton[]) => new Set(ids);
  assert.deepEqual(b.update(down('volumeUp'), 0), ['up']);
  assert.deepEqual(b.update(down('volumeUp'), 2000), [], 'tenu : pas de répétition');
  assert.deepEqual(b.update(down(), 2100), []);
  assert.deepEqual(b.update(down('volumeUp'), 2200), ['up'], 'relâché puis appuyé : un pas de plus');
  assert.deepEqual(b.update(down('volumeDown'), 3000), ['down']);
  assert.deepEqual(b.update(down('volumeDown'), 3000 + MUTE_HOLD_MS - 1), []);
  assert.deepEqual(b.update(down('volumeDown'), 3000 + MUTE_HOLD_MS), ['hold']);
  assert.deepEqual(b.update(down('volumeDown'), 9000), [], 'maintenu plus longtemps : rien de plus');
  assert.deepEqual(b.update(down('volumeMute'), 9100), ['mute']);
  assert.deepEqual(b.update(down('volumeMute'), 12000), [], 'Muet tenu ne bascule qu’une fois');
});

test('volume : sur la grille des 5 %, borné, le son coupé revient au premier pas', () => {
  assert.deepEqual(levels(volumeAfter(one(0.16), 'up')), [0.2], '16 % : 20 %, la grille');
  assert.deepEqual(levels(volumeAfter(one(0.16), 'down')), [0.15]);
  assert.deepEqual(levels(volumeAfter(one(0.2), 'up')), [0.25]);
  // Un flottant de Windows à peine sous la grille avance d'un pas entier, pas de quelques millièmes.
  assert.deepEqual(levels(volumeAfter(one(0.6499999761581421), 'up')), [0.7]);
  assert.deepEqual(levels(volumeAfter(one(0.6499999761581421), 'down')), [0.6]);
  assert.deepEqual(levels(volumeAfter(one(0.02), 'down')), [0]);
  assert.deepEqual(levels(volumeAfter(one(0), 'down')), [0]);
  assert.deepEqual(levels(volumeAfter(one(1), 'up')), [1]);
  assert.equal(volumeAfter(one(0.4, true), 'up')[0]!.muted, false);
  assert.equal(volumeAfter(one(0.4, true), 'down')[0]!.muted, false, 'comme les touches de Windows');
  assert.deepEqual(volumeAfter([], 'up'), []);
});

test('volume : plusieurs sorties bougent du même pas que la première, leur écart gardé', () => {
  const two: OutputVolume[] = [
    { id: 'fronton', level: 0.5, muted: false },
    { id: 'plateau', level: 0.8, muted: false },
  ];
  assert.deepEqual(levels(volumeAfter(two, 'up')), [0.55, 0.85]);
  assert.deepEqual(levels(volumeAfter(two, 'down')), [0.45, 0.75]);
  assert.deepEqual(levels(volumeAfter([{ ...two[0]!, level: 0.9 }, two[1]!], 'up')), [0.95, 0.85]);
  assert.deepEqual(levels(volumeAfter([{ ...two[0]!, level: 0.95 }, { ...two[1]!, level: 0.98 }], 'up')), [1, 1], 'chacune bornée à 100 %');
  const muted = volumeAfter(two, 'mute');
  assert.deepEqual(muted.map((o) => o.muted), [true, true], 'Muet : toutes les sorties');
  assert.deepEqual(levels(muted), [0.5, 0.8], 'le niveau reste, pour le son rétabli');
});

test('Volume − maintenu : retour au niveau d’avant l’appui, son coupé, ou rétabli s’il l’était', () => {
  const before = one(0.4);
  const afterPress = volumeAfter(before, 'down');
  assert.deepEqual(levels(afterPress), [0.35]);
  const held = volumeAfter(afterPress, 'hold', before);
  assert.deepEqual(held, [{ id: 'a', level: 0.4, muted: true }]);
  // Son déjà coupé : l'appui l'a rétabli (un pas plus bas), le maintien le laisse rétabli au niveau d'avant.
  const mutedBefore = one(0.4, true);
  const again = volumeAfter(volumeAfter(mutedBefore, 'down'), 'hold', mutedBefore);
  assert.deepEqual(again, [{ id: 'a', level: 0.4, muted: false }]);
});

test('pastille du volume : le niveau, ou le son coupé et comment le rétablir', () => {
  assert.deepEqual(volumeView(one(0.45), false), { percent: 45, muted: false, title: 'Volume', detail: '45 %' });
  const muted = volumeView(one(0.45, true), false)!;
  assert.equal(muted.title, 'Son coupé');
  // Les boutons par leur nom, pas leur touche (« = » ne dit rien au joueur).
  assert.equal(muted.detail, 'Volume + pour le rétablir (45 %)');
  assert.equal(volumeView(one(0.45, true), true)!.detail, 'Volume + ou Muet pour le rétablir (45 %)');
  assert.equal(volumeView([], false), undefined);
});

test('pastille du volume : au milieu du haut du plateau pour le joueur, quel que soit le sens de l’écran', () => {
  const zone = { x: 0, y: 0, width: 1080, height: 1920 };
  const size = { width: 520, height: 104 };
  assert.deepEqual(gameNoticeBounds(zone, 0, size, 28, 'top-center'), { x: 280, y: 28, width: 520, height: 104 });
  // La pastille tient dans le plus petit plateau du joueur (1 080 px de côté), marges comprises.
  assert.ok(VOLUME_BADGE_SIZE.width + 2 * VOLUME_BADGE_SIZE.margin <= 1080);
  // Plateau couché (90°) : le haut du joueur est le bord droit de l'écran, la pastille debout.
  const lying = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(gameNoticeBounds(lying, 90, size, 28, 'top-center'), { x: 1920 - 28 - 104, y: 280, width: 104, height: 520 });
  assert.deepEqual(gameNoticeBounds(lying, 270, size, 28, 'top-center'), { x: 28, y: 280, width: 104, height: 520 });
});

test('sorties réglées : celles de l’étape « Son », le fronton d’abord, sinon la sortie par défaut de Windows', () => {
  assert.deepEqual(volumeOutputIds(undefined), []);
  assert.deepEqual(volumeOutputIds({ outputs: [], roles: { playfield: 'p', backglass: 'b' }, playfieldMode: 'ssf' }), ['b', 'p']);
  assert.deepEqual(volumeOutputIds({ outputs: [], roles: { playfield: 'x', backglass: 'x' }, playfieldMode: 'stereo' }), ['x'], 'une seule carte pour les deux rôles');
});

test('bouton Muet : facultatif, sans touche par défaut, relevé comme les autres, dans l’aide-mémoire', () => {
  const mute = buttonInfo('volumeMute');
  assert.equal(mute.required, false);
  assert.equal(mute.default, undefined);
  assert.deepEqual(mute.vpx, []);
  assert.equal('volumeMute' in DEFAULT_BUTTONS, false, 'aucun encodeur ne l’envoie d’office');
  assert.ok(BUTTONS.every((b) => b.id !== 'volumeMute' || b.how), 'son rôle dit pendant le relevé');
  const keys = recordButton({ ...DEFAULT_BUTTONS }, 'volumeMute', 'KeyM').keys;
  assert.equal(keys.volumeMute, 'KeyM');
  assert.ok(gameKeys(keys).some(([title, k]) => title === 'Volume' && k === '- / = / M'));
});

const VPX_FIRST_RUN = ['[Input]', 'Devices = Key', 'Mapping.VolumeDown = ', 'Mapping.VolumeUp = ', 'Mapping.Service7 = ', ''].join('\r\n');

function cabinetWith(buttons?: CabinetButtons): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  if (buttons) cabinet.buttons = buttons;
  return cabinet;
}

test('VPX : ses actions de volume n’ont plus de touche, avec ou sans étape « Boutons »', () => {
  const input = (ini: string, action: string) => IniDocument.parse(ini).get('Input', `Mapping.${action}`);
  for (const cabinet of [cabinetWith(), cabinetWith({ ...DEFAULT_BUTTONS })]) {
    const plan = planVpxSync(cabinet, devPcDisplays(), VPX_FIRST_RUN);
    assert.equal(input(plan.nextIni!, 'VolumeDown'), 'Key;0');
    assert.equal(input(plan.nextIni!, 'VolumeUp'), 'Key;0');
    // Service 7 garde - : il n'a jamais été le volume.
    assert.notEqual(input(plan.nextIni!, 'Service7'), 'Key;0');
    assert.ok('Input.Mapping.VolumeDown' in plan.memory, 'clé écrite par Cyber Pinball, retenue');
    assert.deepEqual(planVpxSync(cabinet, devPcDisplays(), plan.nextIni!, undefined, { memory: plan.memory }).changes, [], 'deuxième passage : rien');
  }
});

test('VPX : un bouton de joystick de volume écrit avant est retiré, une manette ajoutée dans VPX gardée', () => {
  const joy = 'SDLJoy_0300000000000000000000000000c0ff_1;14';
  const mine = 'SDLJoy_0300000000000000000000000000c0ff_1;20';
  const doc = IniDocument.parse(['[Input]', `Mapping.VolumeUp = ${joy} | Key;46`, `Mapping.VolumeDown = ${mine} | Key;45`, ''].join('\r\n'));
  const settings = vpxVolumeSettings(doc, { 'Input.Mapping.VolumeUp': `${joy} | Key;46`, 'Input.Mapping.VolumeDown': 'Key;45' });
  assert.deepEqual(
    settings.map((s) => `${s.key}=${s.value}`),
    ['Mapping.VolumeDown=' + mine, 'Mapping.VolumeUp=Key;0'],
  );
});
