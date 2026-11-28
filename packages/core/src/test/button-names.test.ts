// Noms des boutons (button-names.ts) : le joueur nomme ses boutons, et le nom remplace « Bouton 7 »
// partout où l'interface cite un bouton (keyLabel). Demande du 28/11/2026 ; une option à part, jamais
// dans l'assistant complet.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  MAX_BUTTON_NAME,
  buttonNameOf,
  cleanButtonNames,
  composedButtonName,
  loadedButtonNames,
  markerChoices,
  positionChoices,
  readyNames,
  setButtonNames,
  withButtonName,
} from '../button-names';
import { defaultKeyLabel, keyLabel } from '../buttons';
import { FULL_WIZARD_PHASES, STANDALONE_PHASES, WIZARD_STEPS, stepCabinet } from '../wizardsteps';
import { loadCabinet, saveCabinet } from '../store';
import { emptyCabinet } from './fixtures';

const JOY = 'SDLJoy_03000000fa190000ed00000000000000_1;7';

afterEach(() => setButtonNames({}));

test('noms : rognés, tronqués, sans nom vide ni valeur étrangère', () => {
  assert.deepEqual(cleanButtonNames({ KeyA: '  Flipper   gauche ', KeyB: '', KeyC: '   ', KeyD: 4, KeyE: null }), { KeyA: 'Flipper gauche' });
  assert.deepEqual(cleanButtonNames(undefined), {});
  assert.deepEqual(cleanButtonNames(['a']), {});
  assert.deepEqual(cleanButtonNames('texte'), {});
  assert.equal(cleanButtonNames({ KeyA: 'x'.repeat(100) }).KeyA!.length, MAX_BUTTON_NAME);
});

test('nommer : un autre bouton de même nom le perd, un nom vide retire le nom', () => {
  let names = withButtonName({}, JOY, 'Flipper gauche');
  names = withButtonName(names, 'KeyZ', 'Flipper gauche');
  assert.deepEqual(names, { KeyZ: 'Flipper gauche' });
  names = withButtonName(names, 'KeyZ', undefined);
  assert.deepEqual(names, {});
  assert.deepEqual(withButtonName({ KeyA: 'A' }, 'KeyA', '   '), {});
  // Le tableau d'origine n'est jamais modifié.
  const before = { KeyA: 'A' };
  withButtonName(before, 'KeyB', 'B');
  assert.deepEqual(before, { KeyA: 'A' });
});

test('keyLabel : le nom du joueur remplace « Bouton N du joystick » partout, sans nom rien ne change', () => {
  const plain = keyLabel(JOY);
  assert.match(plain, /8/, 'les boutons de joystick se comptent à partir de 1');
  assert.equal(plain, defaultKeyLabel(JOY));
  setButtonNames({ [JOY]: 'Bouton rouge devant' });
  assert.equal(keyLabel(JOY), 'Bouton rouge devant');
  assert.equal(buttonNameOf(JOY), 'Bouton rouge devant');
  // Un bouton de clavier se nomme aussi ; un autre bouton garde son libellé.
  setButtonNames({ ShiftLeft: 'Flipper gauche' });
  assert.equal(keyLabel('ShiftLeft'), 'Flipper gauche');
  assert.equal(keyLabel(JOY), plain);
  assert.equal(keyLabel(undefined), keyLabel(''));
  setButtonNames({});
  assert.equal(keyLabel('ShiftLeft'), defaultKeyLabel('ShiftLeft'));
  assert.deepEqual(loadedButtonNames(), {});
});

test('noms prêts, places et repères : des listes sans doublon, et le composeur « Bouton rouge devant »', () => {
  for (const list of [readyNames(), positionChoices(), markerChoices()]) {
    assert.ok(list.length > 3);
    assert.equal(new Set(list).size, list.length);
  }
  assert.ok(readyNames().includes('Flipper gauche') && readyNames().includes('MagnaSave droit'));
  assert.ok(positionChoices().includes('devant') && positionChoices().includes('dessous') && positionChoices().includes('sur la lockbar'));
  assert.equal(composedButtonName('rouge', 'devant'), 'Bouton rouge devant');
  assert.equal(composedButtonName('n° 2', 'à gauche'), 'Bouton n° 2 à gauche');
  // Chaque nom composé tient sur une ligne de l'aide-mémoire.
  for (const marker of markerChoices()) for (const position of positionChoices()) assert.ok(composedButtonName(marker, position).length <= MAX_BUTTON_NAME, `${marker} ${position}`);
});

test('modèle : les noms sont lus à l’ouverture, gardés quand l’assistant refait le modèle, retirés par l’étape', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-button-names-'));
  const cabinet = emptyCabinet();
  saveCabinet(home, { ...cabinet, buttonNames: { [JOY]: 'Flipper gauche' } });
  assert.equal(keyLabel(JOY), 'Flipper gauche', 'enregistrer les nomme tout de suite');
  setButtonNames({});
  assert.equal(loadCabinet(home)!.buttonNames?.[JOY], 'Flipper gauche');
  assert.equal(keyLabel(JOY), 'Flipper gauche', 'lire le modèle les remet');
  // L'assistant complet enregistre un modèle neuf, sans noms : ils restent.
  saveCabinet(home, { ...cabinet, updatedAt: 'refait' });
  assert.equal(loadCabinet(home)!.buttonNames?.[JOY], 'Flipper gauche');
  // L'étape les retire tous : un objet vide, jamais « sans la clé ».
  saveCabinet(home, { ...cabinet, buttonNames: {} });
  assert.deepEqual(loadCabinet(home)!.buttonNames, {});
  assert.equal(keyLabel(JOY), defaultKeyLabel(JOY));
});

test('étape « essai » : une option à part, qui ne change que les noms et n’entre pas dans l’assistant complet', () => {
  const step = WIZARD_STEPS.find((s) => s.id === 'essai')!;
  assert.deepEqual(step.fields, ['buttonNames']);
  assert.equal(step.flag, '--essai-boutons');
  assert.equal(step.owns('Input.Mapping.Start'), false, 'aucune clé de VPinballX.ini');
  assert.ok(step.phases.every((p) => STANDALONE_PHASES.includes(p)));
  for (const phase of STANDALONE_PHASES) assert.ok(!FULL_WIZARD_PHASES.includes(phase), `${phase} hors de l'assistant complet`);
  const previous = { ...emptyCabinet(), buttonNames: { KeyA: 'Ancien' }, navigation: { next: 'KeyN' } };
  const built = { ...emptyCabinet(), buttonNames: { [JOY]: 'Flipper droit' }, navigation: { next: 'KeyX' }, updatedAt: 'nouveau' };
  const next = stepCabinet(previous, built, step);
  assert.deepEqual(next.buttonNames, { [JOY]: 'Flipper droit' });
  assert.deepEqual(next.navigation, { next: 'KeyN' }, 'le reste du modèle est gardé');
});
