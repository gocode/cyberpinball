// Étape « Essai et noms des boutons » (app/src/button-test.ts) : chaque entrée de la carte est une case
// qui s'allume et compte les appuis, puis un bouton se nomme (nom prêt, ou repère et place), aux
// boutons de la borne comme à la souris. Demande du 28/11/2026.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { afterEach, test } from 'node:test';
import { setButtonNames } from '../button-names';
import { REPO_ROOT } from './i18n-scan';

interface Pin {
  id: string;
  group: string;
  title: string;
  sub: string;
  roles: string;
  count: number;
  state: string;
  target: boolean;
}
interface Step {
  names: Record<string, string>;
  mode: string;
  stage: string;
  target?: string;
  selected: string;
  option: number;
  done?: string;
  counts: Map<string, number>;
  down: Set<string>;
  pins: { code: string; group: string; short: string }[];
}
type Keys = { previous: boolean; next: boolean; confirm: boolean; back: boolean };
const test_ = require(path.join(REPO_ROOT, 'app', 'dist', 'button-test.js')) as {
  LISTEN_MS: number;
  startButtonTest(names: Record<string, string> | undefined, devices: unknown[], buttons: Record<string, string> | undefined, navigation: Record<string, string> | undefined): Step;
  buttonTestKey(step: Step, keys: Keys, code: string, repeat: boolean, now: number): 'stay' | 'save';
  buttonTestUp(step: Step, code: string): void;
  buttonTestClick(step: Step, what: { row: number } | { action: string }, now: number): 'stay' | 'save';
  buttonTestTick(step: Step, now: number): boolean;
  testedCount(step: Step): { tested: number; total: number };
  namesToSave(step: Step): Record<string, string>;
  buttonTestView(step: Step, save: string, keys: { previous: string; next: string; confirm: string }, now?: number): { pins: Pin[]; buttons?: { label: string; selected: boolean }[]; actions: { id: string; selected: boolean }[]; step: string; hint: string };
};

const DEVICE = { id: 'SDLJoy_03000000fa190000ed00000000000000_1', name: 'Pinscape Controller', buttons: 3, axes: 2, hats: 1 };
const code = (n: number) => `${DEVICE.id};${n}`;
const NONE: Keys = { previous: false, next: false, confirm: false, back: false };
const view = (step: Step, now = 0) => test_.buttonTestView(step, 'Enregistrer', { previous: 'Maj gauche', next: 'Maj droite', confirm: '1' }, now);

afterEach(() => setButtonNames({}));

test('essai : une case par bouton et par direction de croix de la carte, muettes au départ', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  assert.equal(step.pins.length, 3 + 4);
  assert.ok(step.pins.every((p) => p.group === 'Pinscape Controller'));
  assert.deepEqual(test_.testedCount(step), { tested: 0, total: 7 });
  assert.ok(view(step).pins.every((p) => p.state === 'idle' && p.count === 0));
});

test('essai : un appui allume la case et la compte, le relâchement l’éteint, une touche tenue ne recompte pas', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  test_.buttonTestKey(step, NONE, code(1), false, 0);
  assert.equal(view(step).pins.find((p) => p.id === code(1))!.state, 'lit');
  test_.buttonTestKey(step, NONE, code(1), true, 0);
  assert.equal(step.counts.get(code(1)), 1);
  test_.buttonTestUp(step, code(1));
  test_.buttonTestKey(step, NONE, code(1), false, 0);
  assert.equal(step.counts.get(code(1)), 2);
  test_.buttonTestUp(step, code(1));
  assert.equal(view(step).pins.find((p) => p.id === code(1))!.state, 'last');
  test_.buttonTestKey(step, NONE, code(2), false, 0);
  test_.buttonTestUp(step, code(2));
  assert.equal(view(step).pins.find((p) => p.id === code(1))!.state, 'tested');
  assert.deepEqual(test_.testedCount(step), { tested: 2, total: 7 });
});

test('essai : une touche du clavier inconnue de la carte reçoit sa case, les boutons déjà nommés ou réglés aussi', () => {
  const step = test_.startButtonTest({ KeyN: 'Bouton vert dessous' }, [], { leftFlipper: 'ShiftLeft' }, undefined);
  assert.deepEqual(step.pins.map((p) => p.code).sort(), ['KeyN', 'ShiftLeft']);
  assert.ok(step.pins.every((p) => p.group === 'Clavier'));
  assert.match(view(step).step, /0 sur 2/);
  test_.buttonTestKey(step, NONE, 'KeyQ', false, 0);
  assert.ok(step.pins.some((p) => p.code === 'KeyQ'));
  const shift = view(step).pins.find((p) => p.id === 'ShiftLeft')!;
  assert.match(shift.roles, /Jeu : /);
  assert.equal(view(step).pins.find((p) => p.id === 'KeyN')!.title, 'Bouton vert dessous');
});

test('noms : « Nommer un bouton » attend l’appui, puis un nom prêt, aux boutons de la borne', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  assert.deepEqual(view(step).actions.map((a) => a.id), ['name', 'save']);
  test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 100);
  assert.equal(step.mode, 'listen');
  assert.deepEqual(view(step, 100).actions.map((a) => a.id), ['cancel']);
  test_.buttonTestKey(step, NONE, code(2), false, 200);
  assert.equal(step.mode, 'choose');
  assert.equal(step.target, code(2));
  assert.equal(view(step).pins.length, 0, 'les choix prennent la place des cases');
  // Départ : nom prêt, repère et place, (retrait), annuler.
  assert.equal(view(step).buttons!.length, 3);
  test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 300);
  assert.equal(step.stage, 'ready');
  // Flipper droit : deux crans plus loin que « Flipper gauche ».
  test_.buttonTestKey(step, { ...NONE, next: true }, 'ShiftRight', false, 400);
  assert.equal(view(step).buttons![1]!.selected, true);
  test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 500);
  assert.equal(step.mode, 'test');
  assert.equal(step.names[code(2)], 'Flipper droit');
  assert.match(step.done!, /Flipper droit/);
  assert.equal(view(step).pins.find((p) => p.id === code(2))!.title, 'Flipper droit');
  assert.match(view(step).pins.find((p) => p.id === code(2))!.sub, /3/, 'le numéro d’origine reste dessous');
});

test('noms : un repère puis une place composent « Bouton rouge devant » ; un nom pris passe à l’autre bouton', () => {
  const step = test_.startButtonTest({ [code(0)]: 'Bouton rouge devant' }, [DEVICE], undefined, undefined);
  test_.buttonTestClick(step, { action: 'name' }, 0);
  test_.buttonTestKey(step, NONE, code(1), false, 10);
  test_.buttonTestClick(step, { row: 1 }, 20);
  assert.equal(step.stage, 'marker');
  test_.buttonTestClick(step, { row: 0 }, 30);
  assert.equal(step.stage, 'position');
  test_.buttonTestClick(step, { row: 0 }, 40);
  assert.equal(step.names[code(1)], 'Bouton rouge devant');
  assert.equal(step.names[code(0)], undefined, 'le premier bouton perd ce nom');
  assert.deepEqual(test_.namesToSave(step), { [code(1)]: 'Bouton rouge devant' });
});

test('noms : retirer un nom, revenir en arrière, annuler, et l’attente qui s’arrête seule', () => {
  const step = test_.startButtonTest({ [code(0)]: 'Flipper gauche' }, [DEVICE], undefined, undefined);
  test_.buttonTestClick(step, { action: 'name' }, 0);
  test_.buttonTestKey(step, NONE, code(0), false, 1);
  // Un bouton nommé propose de retirer son nom.
  assert.equal(view(step).buttons!.length, 4);
  test_.buttonTestClick(step, { row: 2 }, 2);
  assert.deepEqual(test_.namesToSave(step), {});
  assert.match(step.done!, /plus de nom/);
  // Revenir : du niveau des places au repère, puis au départ ; Exit remonte aussi.
  test_.buttonTestClick(step, { action: 'name' }, 3);
  test_.buttonTestKey(step, NONE, code(1), false, 4);
  test_.buttonTestClick(step, { row: 1 }, 5);
  test_.buttonTestKey(step, { ...NONE, back: true }, 'Escape', false, 6);
  assert.equal(step.stage, 'root');
  test_.buttonTestKey(step, { ...NONE, back: true }, 'Escape', false, 7);
  assert.equal(step.mode, 'test');
  assert.deepEqual(test_.namesToSave(step), {}, 'rien n’a été nommé');
  // Sans appui, l'attente s'arrête d'elle-même.
  test_.buttonTestClick(step, { action: 'name' }, 1000);
  assert.equal(test_.buttonTestTick(step, 1000 + test_.LISTEN_MS - 1), false);
  assert.equal(test_.buttonTestTick(step, 1000 + test_.LISTEN_MS), true);
  assert.equal(step.mode, 'test');
  // Annuler pendant l'attente.
  test_.buttonTestClick(step, { action: 'name' }, 2000);
  test_.buttonTestClick(step, { action: 'cancel' }, 2001);
  assert.equal(step.mode, 'test');
});

test('enregistrer : à la souris ou à Start sur la deuxième action, jamais en passant par un appui d’essai', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  // Un flipper puis Exit : essayés, rien d'enregistré.
  assert.equal(test_.buttonTestKey(step, { ...NONE, next: true }, 'ShiftRight', false, 0), 'stay');
  assert.equal(step.selected, 'save');
  assert.equal(test_.buttonTestKey(step, { ...NONE, back: true }, 'Escape', false, 1), 'stay');
  assert.equal(test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 2), 'save');
  assert.equal(test_.buttonTestClick(step, { action: 'save' }, 3), 'save');
});

test('écran : le fil conducteur dit quoi faire, et les noms prêts tiennent dans l’aide-mémoire', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  const v = view(step);
  assert.match(v.hint, /Maj gauche/);
  assert.match(v.step, /0 sur 7|7/);
  test_.buttonTestKey(step, NONE, code(0), false, 0);
  assert.match(view(step).step, /1 sur 7/);
});
