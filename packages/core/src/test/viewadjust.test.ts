import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import {
  applyViewAdjust,
  isViewAdjustChanged,
  stepViewValue,
  trialIniText,
  VIEW_ADJUST,
  viewAdjustInactive,
  viewAdjustItems,
  viewAdjustNotes,
  viewChoices,
  type ViewAdjustItem,
} from '../viewadjust';
import type { VpxSettingsSchema } from '../vpx-settings';

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'installer', 'vpx-settings', '10.8.1-5436.json'), 'utf8'),
) as VpxSettingsSchema;
const lookup = (section: string, key: string) => SCHEMA.settings.find((s) => s.section === section && s.key === key);

/** VPinballX.ini d'une borne configurée par Cyber Pinball : vue borne, cadrage automatique, taille de l'écran. */
const GLOBAL = IniDocument.parse(['[Player]', 'BGSet = 1', 'CabinetAutofitMode = 1', 'CabinetAutofitPos = ', 'ScreenWidth = 95.2', 'ScreenHeight = 53.6', 'ScreenPlayerZ = '].join('\r\n'));

const byId = (items: ViewAdjustItem[], id: string) => items.find((i) => i.spec.id === id)!;

test('les trois réglages existent dans le schéma de VPX installé, avec les bornes relevées dans le code', () => {
  for (const spec of VIEW_ADJUST) assert.ok(lookup(spec.section, spec.key), `[${spec.section}] ${spec.key}`);
  const pos = lookup('Player', 'CabinetAutofitPos')!;
  assert.deepEqual([pos.min, pos.max, pos.default], [0, 0.2, 0.05]);
  const eyes = lookup('Player', 'ScreenPlayerZ')!;
  assert.deepEqual([eyes.min, eyes.max, eyes.default], [30, 100, 70]);
});

test('valeurs lues : générale (sinon défaut de VPX), surcharge de la table', () => {
  const items = viewAdjustItems(lookup, GLOBAL, IniDocument.parse('[Player]\nCabinetAutofitPos = 0.12\n'));
  assert.deepEqual(items.map((i) => i.spec.id), ['height', 'fit', 'eyes']);
  assert.deepEqual(
    items.map((i) => [i.general, i.table, i.value]),
    [
      [0.05, 0.12, 0.12],
      [1, undefined, 1],
      [70, undefined, 70],
    ],
  );
  // Réglage absent du schéma d'une autre version : ignoré.
  assert.deepEqual(viewAdjustItems((s, k) => (k === 'ScreenPlayerZ' ? undefined : lookup(s, k)), GLOBAL, IniDocument.parse('')).length, 2);
});

test('flippers : crans réguliers, sans boucler, valeur hors grille gardée', () => {
  const [height, fit, eyes] = viewAdjustItems(lookup, GLOBAL, IniDocument.parse(''));
  assert.equal(viewChoices(height!).length, 21);
  assert.equal(stepViewValue(height!, 1), 0.06);
  assert.equal(stepViewValue(height!, -1), 0.04);
  height!.value = 0.2;
  assert.equal(stepViewValue(height!, 1), 0.2, 'pas au-delà de la borne de VPX');
  height!.value = 0;
  assert.equal(stepViewValue(height!, -1), 0);
  // Les crans successifs restent des nombres ronds (pas de 0.07000000000000001).
  height!.value = 0.05;
  for (let i = 0; i < 3; i++) height!.value = stepViewValue(height!, 1);
  assert.equal(height!.value, 0.08);
  assert.equal(height!.spec.format(height!.value), '8 %');
  // Une valeur réglée ailleurs (menu de VPX) entre deux crans.
  const odd = viewAdjustItems(lookup, GLOBAL, IniDocument.parse('[Player]\nCabinetAutofitPos = 0.075\n'))[0]!;
  assert.deepEqual([stepViewValue(odd, -1), stepViewValue(odd, 1)], [0.07, 0.08]);
  assert.equal(odd.spec.format(0.075), '7,5 %');

  assert.deepEqual(viewChoices(fit!), [1, 2], 'le cadrage manuel n’est pas proposé quand il n’est pas en vigueur');
  assert.equal(stepViewValue(fit!, 1), 2);
  assert.equal(fit!.spec.format(2), 'Remplir l’écran');
  assert.equal(stepViewValue(eyes!, -1), 65);
  assert.equal(eyes!.spec.format(65), '65 cm');
});

test('cadrage manuel livré avec la table : proposé, pour pouvoir y revenir après l’avoir quitté', () => {
  const fit = byId(viewAdjustItems(lookup, GLOBAL, IniDocument.parse('[Player]\nCabinetAutofitMode = 0\n')), 'fit');
  assert.deepEqual(viewChoices(fit), [0, 1, 2]);
  fit.value = stepViewValue(fit, 1);
  assert.equal(fit.value, 1);
  assert.deepEqual(viewChoices(fit), [0, 1, 2]);
});

test('enregistrement : seules les valeurs différentes du réglage général sont écrites', () => {
  const table = IniDocument.parse('[Player]\r\nSoundVolume = 40\r\nCabinetAutofitPos = 0.12\r\n');
  const items = viewAdjustItems(lookup, GLOBAL, table);
  assert.equal(isViewAdjustChanged(items), false);
  byId(items, 'height').value = 0.05; // retour à la valeur générale (défaut de VPX)
  byId(items, 'fit').value = 2;
  byId(items, 'eyes').value = 60;
  assert.equal(isViewAdjustChanged(items), true);
  assert.equal(applyViewAdjust(table, items), true);
  assert.equal(table.get('Player', 'CabinetAutofitPos'), undefined);
  assert.equal(table.get('Player', 'CabinetAutofitMode'), '2');
  assert.equal(table.get('Player', 'ScreenPlayerZ'), '60');
  assert.equal(table.get('Player', 'SoundVolume'), '40', 'les autres réglages de la table sont gardés');
  assert.equal(applyViewAdjust(table, items), false, 'rien de plus à écrire');
});

test('revenir au réglage général : plus aucune clé de vue, un .ini qui ne contenait qu’elles est vide', () => {
  const table = IniDocument.parse('[Player]\nCabinetAutofitPos = 0.15\nCabinetAutofitMode = 2\nScreenPlayerZ = 55\n');
  const items = viewAdjustItems(lookup, GLOBAL, table);
  for (const item of items) item.value = item.general;
  assert.equal(applyViewAdjust(table, items), true);
  assert.deepEqual(table.entries(), []);
});

test('ScreenPlayerZ (« Dyn » pour VPX) : égale au réglage général, elle n’est pas écrite non plus', () => {
  const global = IniDocument.parse('[Player]\nScreenPlayerZ = 64\n');
  const table = IniDocument.parse('');
  const items = viewAdjustItems(lookup, global, table);
  byId(items, 'eyes').value = 64;
  assert.equal(applyViewAdjust(table, items), false);
  assert.equal(table.get('Player', 'ScreenPlayerZ'), undefined);
});

test('essai : le .ini de la table avec les valeurs à l’écran, sans toucher au document d’origine', () => {
  const table = IniDocument.parse('[TableOverride]\r\nDifficulty = 0.8\r\n');
  const items = viewAdjustItems(lookup, GLOBAL, table);
  byId(items, 'height').value = 0.15;
  const trial = IniDocument.parse(trialIniText(table, items));
  assert.equal(trial.get('Player', 'CabinetAutofitPos'), '0.15');
  assert.equal(trial.get('TableOverride', 'Difficulty'), '0.8');
  assert.equal(table.get('Player', 'CabinetAutofitPos'), undefined);
  assert.equal(trialIniText(IniDocument.parse(''), viewAdjustItems(lookup, GLOBAL, IniDocument.parse(''))), '');
});

test('hauteur sans effet en « Remplir l’écran » et en cadrage manuel', () => {
  const items = viewAdjustItems(lookup, GLOBAL, IniDocument.parse(''));
  assert.equal(viewAdjustInactive(byId(items, 'height'), items), undefined);
  byId(items, 'fit').value = 2;
  assert.match(viewAdjustInactive(byId(items, 'height'), items)!, /Remplir/);
  byId(items, 'fit').value = 0;
  assert.match(viewAdjustInactive(byId(items, 'height'), items)!, /manuel/);
  assert.equal(viewAdjustInactive(byId(items, 'eyes'), items), undefined);
});

test('avertissements : vue autre que borne, vue manuelle ignorée', () => {
  const empty = IniDocument.parse('');
  const items = viewAdjustItems(lookup, GLOBAL, empty);
  assert.deepEqual(viewAdjustNotes(lookup, GLOBAL, empty, items), []);

  const desktop = IniDocument.parse('[Player]\nBGSet = 0\n');
  const notes = viewAdjustNotes(lookup, desktop, empty, viewAdjustItems(lookup, desktop, empty));
  assert.deepEqual(notes.map((n) => n.tone), ['warning']);
  assert.match(notes[0]!.text, /pas affichées en vue borne/);
  // La table peut elle-même imposer une autre vue.
  assert.equal(viewAdjustNotes(lookup, GLOBAL, IniDocument.parse('[Player]\nBGSet = 0\n'), items).length, 1);

  const manual = IniDocument.parse('[TableOverride]\nViewCabVOfs = 12\nViewCabScaleX = 1.1\nViewCabHOfs = \n');
  const manualNotes = viewAdjustNotes(lookup, GLOBAL, manual, viewAdjustItems(lookup, GLOBAL, manual));
  assert.deepEqual(manualNotes.map((n) => n.tone), ['info']);
  assert.match(manualNotes[0]!.text, /2 clés ViewCab/);
  // En cadrage manuel, ces clés servent : rien à signaler.
  const kept = IniDocument.parse('[Player]\nCabinetAutofitMode = 0\n[TableOverride]\nViewCabVOfs = 12\n');
  assert.deepEqual(viewAdjustNotes(lookup, GLOBAL, kept, viewAdjustItems(lookup, GLOBAL, kept)), []);
});
