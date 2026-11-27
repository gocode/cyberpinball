// Sélecteur des joueurs de Pinball FX (app/src/pinballfx-modes.ts) : les boutons Valider et Retour de
// l'interface y servent aussi, pas seulement Start et Exit du jeu. 27/11/2026, sur un PinCab dont Valider
// et Retour sont les MagnaSave : seul Start validait le nombre de joueurs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buttonKeys, DEFAULT_BUTTONS, navigationKeys, playerPickerKeys, type ButtonsSource } from '../buttons';
import { frontendSource } from './frontend-source';

const joy = (n: number) => `SDLJoy_00000000000000000000000000000000_1;${n}`;

/** Disposition de la borne du constat : flippers 5 et 4, Start 12, Exit 8, MagnaSave 7 et 6 ; Valider = MagnaSave droit, Retour = MagnaSave gauche. */
const borne: ButtonsSource = {
  buttons: { ...DEFAULT_BUTTONS, leftFlipper: joy(5), rightFlipper: joy(4), start: joy(12), exit: joy(8), plunger: joy(9), leftMagna: joy(7), rightMagna: joy(6) },
  navigation: { previous: joy(5), next: joy(4), confirm: joy(6), back: joy(7) },
};

test('sélecteur des joueurs : Valider et Retour de l’interface valident et reviennent, Start et Exit aussi', () => {
  assert.equal(buttonKeys(borne!.buttons).start, joy(12), 'relevé de la borne valable (sinon : touches par défaut)');
  const keys = playerPickerKeys(borne);
  assert.ok(keys.confirm.includes(joy(6)), 'Valider (MagnaSave droit) valide le nombre de joueurs');
  assert.ok(keys.confirm.includes(joy(12)), 'Start valide toujours');
  assert.ok(keys.confirm.includes('Enter'), 'Entrée d’un clavier aussi');
  assert.ok(keys.exit.includes(joy(7)) && keys.exit.includes(joy(8)), 'Retour et Exit reviennent à la fiche');
  assert.deepEqual(keys.previous.filter((k) => k.startsWith('SDLJoy_')), [joy(5)]);
  assert.deepEqual(keys.next.filter((k) => k.startsWith('SDLJoy_')), [joy(4)]);
});

test('sélecteur des joueurs : une touche n’a jamais deux rôles, le rôle du jeu l’emporte', () => {
  // Interface qui met Valider sur Exit du jeu : Exit reste Retour dans le sélecteur.
  const source: ButtonsSource = { buttons: borne!.buttons, navigation: { previous: joy(5), next: joy(4), confirm: joy(8), back: joy(7) } };
  const keys = playerPickerKeys(source);
  const all = [...keys.previous, ...keys.next, ...keys.confirm, ...keys.exit];
  assert.equal(new Set(all).size, all.length, 'aucune touche dans deux groupes');
  assert.ok(keys.exit.includes(joy(8)) && !keys.confirm.includes(joy(8)));
  // Sans boutons de l'interface à part : exactement les touches du jeu, comme avant.
  assert.deepEqual(playerPickerKeys({ buttons: borne!.buttons }), navigationKeys({ buttons: borne!.buttons }));
});

test('garde-fou : le front-end donne au sélecteur les boutons de l’interface', () => {
  assert.match(frontendSource(), /playerModeKeys: \(\) => playerPickerKeys\(\{ buttons, navigation \}\)/);
});
