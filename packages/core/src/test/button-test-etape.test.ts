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
  text: string;
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
  CHOICE_ROWS: number;
  startButtonTest(names: Record<string, string> | undefined, devices: unknown[], buttons: Record<string, string> | undefined, navigation: Record<string, string> | undefined): Step;
  buttonTestKey(step: Step, keys: Keys, code: string, repeat: boolean, now: number, typed?: string): 'stay' | 'save';
  buttonTestUp(step: Step, code: string): void;
  buttonTestClick(step: Step, what: { row: number } | { action: string }, now: number): 'stay' | 'save';
  buttonTestTick(step: Step, now: number): boolean;
  testedCount(step: Step): { tested: number; total: number };
  namesToSave(step: Step): Record<string, string>;
  buttonTestView(step: Step, save: string, keys: { previous: string; next: string; confirm: string }, now?: number): { name: string; keyboard: boolean; pins: Pin[]; buttons?: { label: string; selected: boolean }[]; actions: { id: string; selected: boolean }[]; step: string; hint: string };
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
  assert.equal(view(step).buttons!.length, 4);
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
  assert.equal(view(step).buttons!.length, 5);
  test_.buttonTestClick(step, { row: 3 }, 2);
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

test('noms : la liste des noms prêts ne montre que quelques lignes autour du choix, et un clic vise la bonne', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  test_.buttonTestClick(step, { action: 'name' }, 0);
  test_.buttonTestKey(step, NONE, code(0), false, 1);
  test_.buttonTestClick(step, { row: 0 }, 2);
  assert.equal(step.stage, 'ready');
  const rows = () => view(step).buttons as { label: string; selected: boolean; act: { index: number } }[];
  assert.equal(rows().length, test_.CHOICE_ROWS);
  assert.equal(rows()[0]!.act.index, 0);
  // Le choix descend : la fenêtre le suit, et le choix reste toujours dans ce qui est montré.
  for (let i = 0; i < 12; i++) {
    test_.buttonTestKey(step, { ...NONE, next: true }, 'ShiftRight', false, 10 + i);
    assert.equal(rows().filter((r) => r.selected).length, 1, `choix ${step.option}`);
  }
  assert.match(view(step).name, /sur/, 'où l’on en est dans la liste');
  // Un clic sur une ligne montrée choisit cette ligne, pas celle de même rang dans la liste entière.
  const shown = rows()[1]!;
  test_.buttonTestClick(step, { row: shown.act.index }, 100);
  assert.equal(step.names[code(0)], shown.label);
});

test('noms : un nom à soi s’écrit aux flippers et à Start, ou à la souris, avec « Valider » au bout', () => {
  const step = test_.startButtonTest(undefined, [DEVICE], undefined, undefined);
  test_.buttonTestClick(step, { action: 'name' }, 0);
  test_.buttonTestKey(step, NONE, code(2), false, 1);
  test_.buttonTestClick(step, { row: 2 }, 2);
  assert.equal(step.stage, 'text');
  const keys = () => view(step).buttons as { label: string; selected: boolean }[];
  assert.equal(view(step).keyboard, true);
  assert.equal(keys()[0]!.label, 'A', 'la première lettre est une majuscule');
  assert.match(view(step).name, /Nom/);
  // À la souris : la majuscule, puis la touche suivante en minuscule.
  test_.buttonTestClick(step, { row: 0 }, 3);
  assert.equal(step.text, 'A');
  assert.equal(keys()[0]!.label, 'a');
  // Aux flippers : le droit avance, Start écrit.
  test_.buttonTestKey(step, { ...NONE, next: true }, 'ShiftRight', false, 4);
  test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 5);
  assert.equal(step.text, 'Ab');
  // Le flipper gauche, depuis le début de la liste, arrive sur « Valider » ; il valide.
  test_.buttonTestClick(step, { row: 0 }, 6);
  assert.equal(step.text, 'Aba');
  test_.buttonTestKey(step, { ...NONE, previous: true }, 'ShiftLeft', false, 7);
  assert.equal(keys().filter((k) => k.selected).length, 1);
  assert.equal(keys()[keys().length - 1]!.selected, true);
  assert.match(keys()[keys().length - 1]!.label, /Valider/);
  test_.buttonTestKey(step, { ...NONE, confirm: true }, 'Digit1', false, 8);
  assert.equal(step.mode, 'test');
  assert.equal(step.names[code(2)], 'Aba');
  assert.equal(step.text, '', 'la saisie est remise à zéro');
});

test('noms : au clavier, la lettre tapée s’écrit, Retour arrière efface, Entrée valide, sans compter comme essai', () => {
  const step = test_.startButtonTest({ [code(1)]: 'Flipper gauche' }, [DEVICE], undefined, undefined);
  const pins = step.pins.length;
  test_.buttonTestClick(step, { action: 'name' }, 0);
  test_.buttonTestKey(step, NONE, code(1), false, 1);
  test_.buttonTestClick(step, { row: 2 }, 2);
  assert.equal(step.text, 'Flipper gauche', 'un bouton déjà nommé se corrige : son nom est repris');
  for (const char of ' à') test_.buttonTestKey(step, NONE, char === ' ' ? 'Space' : 'KeyQ', false, 3, char);
  test_.buttonTestKey(step, NONE, 'Backspace', false, 4);
  test_.buttonTestKey(step, NONE, 'Backspace', false, 5, 'Backspace');
  assert.equal(step.text, 'Flipper gauche');
  // Taper n'ajoute aucune case et ne compte pas comme essai.
  assert.equal(step.pins.length, pins, 'taper n’ajoute aucune case');
  assert.equal(step.counts.has('KeyQ'), false);
  // Une touche sans caractère (F5) n'écrit rien : c'est un appui comme un autre.
  test_.buttonTestKey(step, NONE, 'F5', false, 6, 'F5');
  assert.equal(step.text, 'Flipper gauche');
  // Exit abandonne l'écriture sans rien changer.
  test_.buttonTestKey(step, { ...NONE, back: true }, 'Escape', false, 7);
  assert.equal(step.stage, 'root');
  assert.equal(step.names[code(1)], 'Flipper gauche');
  // Un nom neuf, tapé, validé par Entrée ; un nom trop long est coupé à sa limite.
  test_.buttonTestClick(step, { row: 2 }, 8);
  for (let i = 0; i < 60; i++) test_.buttonTestKey(step, NONE, 'KeyX', true, 9, 'x');
  assert.equal([...step.text].length, 14 + 26, 'la longueur permise est tenue');
  test_.buttonTestKey(step, NONE, 'Enter', false, 10);
  assert.equal(step.mode, 'test');
  assert.equal([...step.names[code(1)]!].length, 40);
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
