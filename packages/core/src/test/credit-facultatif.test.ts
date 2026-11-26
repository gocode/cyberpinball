import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buttonKeys, buttonProblems, COIN_BUTTONS, DEFAULT_BUTTONS, displayKeys, gameKeys, inGameMenuButtons, recordButton, sdlScancode, vpxInputSettings } from '../buttons';
import { IniDocument } from '../ini';
import type { CabinetButtons } from '../model';

// Crédit 1 est facultatif : une borne peut n'avoir que Crédit 2. Invariant : au moins un monnayeur
// (Crédit 1 à 4), et rien dans le logiciel ne suppose que Crédit 1 existe.

const SANS_CREDIT: CabinetButtons = { leftFlipper: 'KeyA', rightFlipper: 'KeyS', start: 'Digit2', exit: 'KeyQ', plunger: 'KeyW' };
const CREDIT_2_SEUL: CabinetButtons = { ...SANS_CREDIT, credit2: 'Digit3' };

test('monnayeurs : Crédit 2 seul est un relevé valable, sans monnayeur il ne l’est pas', () => {
  assert.deepEqual(buttonProblems(CREDIT_2_SEUL), []);
  assert.deepEqual(buttonProblems({ ...SANS_CREDIT, credit: 'Digit5' }), []);
  for (const id of COIN_BUTTONS) assert.deepEqual(buttonProblems({ ...SANS_CREDIT, [id]: 'Digit3' }), [], id);
  assert.deepEqual(buttonProblems(SANS_CREDIT), ['Aucun monnayeur : relève Crédit 1, ou Crédit 2 à 4 dans les boutons avancés']);
});

test('monnayeurs : un relevé valable n’est pas remplacé par les touches par défaut, un relevé sans monnayeur l’est', () => {
  assert.deepEqual(buttonKeys(CREDIT_2_SEUL), CREDIT_2_SEUL);
  assert.equal(buttonKeys(CREDIT_2_SEUL).credit, undefined, 'Crédit 1 reste sans touche');
  assert.deepEqual(buttonKeys(SANS_CREDIT), { ...DEFAULT_BUTTONS });
});

test('monnayeurs : Crédit 1 non affecté n’est pas actif dans VPX (valeur neutre), Crédit 2 reçoit sa touche', () => {
  const plan = vpxInputSettings(CREDIT_2_SEUL, IniDocument.parse('[Input]\n'), {});
  const value = (action: string) => plan.settings.find((s) => s.key === `Mapping.${action}`)?.value;
  assert.equal(value('Credit1'), 'Key;0', 'une valeur vide rendrait la touche 5 à VPX');
  assert.equal(value('Credit2'), `Key;${sdlScancode('Digit3')}`);
  // Crédit 1 relevé : sa touche, comme avant.
  const avec = vpxInputSettings({ ...CREDIT_2_SEUL, credit: 'Digit5' }, IniDocument.parse('[Input]\n'), {});
  assert.equal(avec.settings.find((s) => s.key === 'Mapping.Credit1')?.value, `Key;${sdlScancode('Digit5')}`);
});

test('monnayeurs : le menu de VPX en partie et l’aide ne dépendent pas de Crédit 1', () => {
  // Sans MagnaSave : le premier monnayeur renseigné et Start.
  assert.deepEqual(inGameMenuButtons(buttonKeys(CREDIT_2_SEUL)), ['credit2', 'start']);
  assert.deepEqual(inGameMenuButtons(buttonKeys({ ...CREDIT_2_SEUL, credit: 'Digit5' })), ['credit', 'start']);
  assert.deepEqual(inGameMenuButtons(buttonKeys({ ...CREDIT_2_SEUL, leftMagna: 'KeyZ', rightMagna: 'KeyX' })), ['leftMagna', 'rightMagna']);
  const rows = gameKeys(CREDIT_2_SEUL);
  assert.ok(rows.some(([title, keys]) => title === 'Crédit' && keys === '3'), 'la ligne Crédit montre Crédit 2');
  assert.ok(displayKeys(CREDIT_2_SEUL).some(([title, keys]) => title === 'Annuler les changements' && keys === '3'));
  assert.ok(rows.every(([, keys]) => keys !== 'aucune' && keys !== 'Aucune'));
});

test('monnayeurs : Crédit 2 seul se relève comme les autres boutons (une touche prise passe au nouveau bouton)', () => {
  const pris = recordButton(CREDIT_2_SEUL, 'credit', 'Digit3');
  assert.equal(pris.taken?.id, 'credit2');
  assert.equal(pris.keys.credit, 'Digit3');
  assert.equal(pris.keys.credit2, undefined);
});
