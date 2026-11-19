// Commandes cliquables des étapes de l'assistant (app/src/wizard-controls.ts) : un clic vaut
// l'appui du bouton de ce rôle, même quand ce rôle n'a aucune touche, et jamais celui d'un autre ;
// aucune vraie touche ne peut passer pour un clic. Demande d'un joueur du 19/11/2026 : toute la
// première configuration au clavier et à la souris, sauf le relevé des vrais boutons.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { WIZARD_PHASES } from '../wizardsteps';

type Role = 'back' | 'previous' | 'next' | 'confirm' | 'exit';
type Keys = Record<Role, readonly string[]>;
const controls = require(path.join(REPO_ROOT, 'app', 'dist', 'wizard-controls.js')) as {
  CONTROL_ROLES: readonly Role[];
  controlCode(role: Role): string;
  controlRole(code: string): Role | undefined;
  pressedIn(code: string, group: readonly string[], keys: Keys): boolean;
  controlActions(specs: { role: Role; label: string; primary?: boolean }[], keys: Keys): { id: string; label: string; keys: string; act: { type: string; role: Role }; selected: boolean }[];
};

// Touches de l'assistant d'une borne aux touches des encodeurs ; Retour arrière pris par un bouton de la borne.
const KEYS: Keys = {
  back: [],
  previous: ['ShiftLeft', 'ArrowLeft'],
  next: ['ShiftRight', 'ArrowRight'],
  confirm: ['Digit1', 'Enter'],
  exit: ['Escape'],
};

test('un clic vaut l’appui du bouton de son rôle, et de lui seul, même sans touche', () => {
  for (const role of controls.CONTROL_ROLES) {
    const code = controls.controlCode(role);
    assert.equal(controls.controlRole(code), role);
    for (const other of controls.CONTROL_ROLES) assert.equal(controls.pressedIn(code, KEYS[other], KEYS), other === role, `${role} dans ${other}`);
  }
  // Retour arrière pris par un bouton de la borne : « Revenir » se clique quand même.
  assert.ok(controls.pressedIn(controls.controlCode('back'), KEYS.back, KEYS));
});

test('aucune vraie touche ni bouton de joystick ne passe pour un clic', () => {
  for (const code of ['Enter', 'Escape', 'Backspace', 'KeyQ', 'SDLJoy_3', 'Clic', 'Clic:', 'Clic:valider', 'clic:confirm']) {
    assert.equal(controls.controlRole(code), undefined, code);
  }
  assert.ok(controls.pressedIn('Enter', KEYS.confirm, KEYS));
  assert.ok(!controls.pressedIn('Enter', KEYS.exit, KEYS));
  // Un groupe égal mais pas celui des touches de l'assistant ne reçoit pas le clic.
  assert.ok(!controls.pressedIn(controls.controlCode('confirm'), [...KEYS.confirm], KEYS));
});

type Item = { number?: number; label?: string; state: string };
const progress = require(path.join(REPO_ROOT, 'app', 'dist', 'wizard-progress.js')) as {
  progressView(phase: string, stepLabel: string | undefined, count?: string): Item[] | undefined;
  progressPhases(): string[];
};

test('frise des étapes : chaque étape de l’assistant y a sa place, une seule en cours, nommée avec où l’on en est', () => {
  // Une phase ajoutée à l'assistant sans place dans la frise la laisserait sans étape en cours.
  assert.deepEqual([...progress.progressPhases()].sort(), WIZARD_PHASES.filter((p) => p !== 'done').sort());
  const items = progress.progressView('assign', undefined, 'Rôle 2 sur 4')!;
  assert.deepEqual(items.map((i) => i.state), ['done', 'done', 'done', 'done', 'current', 'todo', 'todo', 'todo']);
  assert.deepEqual(items.filter((i) => i.label).map((i) => i.label), ['Écrans · Rôle 2 sur 4'], 'seule l’étape en cours est nommée');
  // Étape refaite seule : une pastille, son nom ; rien une fois l'assistant fini.
  assert.deepEqual(progress.progressView('buttons', 'Boutons du jeu', 'Bouton 1 sur 6'), [{ label: 'Boutons du jeu · Bouton 1 sur 6', state: 'current' }]);
  assert.equal(progress.progressView('done', undefined), undefined);
});

test('chaque commande dit ses touches, dans l’ordre Revenir, précédent, suivant, valider, retour', () => {
  const actions = controls.controlActions(
    [
      { role: 'exit', label: 'Aucun écran' },
      { role: 'confirm', label: 'Valider', primary: true },
      { role: 'previous', label: '◀ Écran précédent' },
      { role: 'back', label: 'Revenir' },
    ],
    KEYS,
  );
  assert.deepEqual(
    actions.map((a) => a.id),
    ['back', 'previous', 'confirm', 'exit'],
  );
  assert.deepEqual(actions.find((a) => a.id === 'confirm')!.act, { type: 'control', role: 'confirm' });
  assert.match(actions.find((a) => a.id === 'confirm')!.keys, /1.*Entrée|1.*Enter/);
  assert.equal(actions.find((a) => a.id === 'back')!.keys, '', 'sans touche : pas de légende, le clic reste');
  assert.deepEqual(
    actions.filter((a) => a.selected).map((a) => a.id),
    ['confirm'],
    'seule l’action qui avance est en évidence',
  );
});
