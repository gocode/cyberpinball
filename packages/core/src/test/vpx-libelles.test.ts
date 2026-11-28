import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { labelQualifiers } from '../vpx-libelles';
import type { VpxSettingDef, VpxSettingsSchema } from '../vpx-settings';

const DIR = path.join(__dirname, '..', '..', '..', 'installer', 'vpx-settings');
const schemas = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, schema: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as VpxSettingsSchema }));

function def(section: string, key: string, label: string): VpxSettingDef {
  return { section, key, type: 'int', label, description: '', default: 0 };
}

test('profils DMD : sept « Dot Tint » se distinguent par leur numéro', () => {
  const defs = [1, 2, 3, 4, 5, 6, 7].map((n) => def('DMD', `Profile${n}DotTint`, 'Dot Tint'));
  const q = labelQualifiers(defs);
  assert.deepEqual(
    defs.map((d) => q.get(d)),
    [1, 2, 3, 4, 5, 6, 7].map((n) => ({ word: 'Profile', part: String(n), numeric: true })),
  );
});

test('numéros à deux chiffres : le préfixe ne garde pas le « 1 » commun', () => {
  const defs = [1, 2, 10].map((n) => def('Player', `Anaglyph${n}Filter`, 'Anaglyph Filter'));
  const q = labelQualifiers(defs);
  assert.deepEqual(
    defs.map((d) => q.get(d)?.part),
    ['1', '2', '10'],
  );
  assert.equal(q.get(defs[0]!)?.word, 'Anaglyph');
});

test('fenêtré et plein écran, vues Desktop / FSS : le qualificatif vient de la clé', () => {
  const size = [def('Player', 'PlayfieldWidth', 'Width'), def('Player', 'PlayfieldFSWidth', 'Width')];
  const qs = labelQualifiers(size);
  assert.equal(qs.get(size[0]!)?.part, '');
  assert.equal(qs.get(size[1]!)?.part, 'FS');
  const mode = [def('DefaultCamera', 'DesktopMode', 'View mode'), def('DefaultCamera', 'FSSMode', 'View mode')];
  const qm = labelQualifiers(mode);
  assert.deepEqual(
    mode.map((d) => qm.get(d)?.part),
    ['Desktop', 'FSS'],
  );
});

test('libellé unique, ou autre section : aucun qualificatif', () => {
  const defs = [def('DMD', 'Profile1DotSize', 'Dot Size'), def('Player', 'Profile1DotSize', 'Dot Size'), def('Player', 'MusicVolume', 'Music')];
  assert.equal(labelQualifiers(defs).size, 0);
});

// L'invariant : dans chaque schéma livré, deux réglages d'une même section ne s'affichent
// jamais avec le même libellé dans la liste de l'onglet Avancé (c'était le bug : sept profils
// DMD au libellé identique, la liste paraissait répéter les mêmes lignes).
for (const { file, schema } of schemas) {
  test(`schéma ${file} : aucun libellé en double sans qualificatif`, () => {
    const q = labelQualifiers(schema.settings);
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const d of schema.settings) {
      const part = q.get(d);
      const shown = `${d.section}|${part ? `${part.word}~${part.part}~` : ''}${d.label}`;
      const other = seen.get(shown);
      if (other) clashes.push(`[${d.section}] ${other} et ${d.key} : « ${d.label} »`);
      else seen.set(shown, d.key);
    }
    assert.deepEqual(clashes, []);
  });
}

test('les sept profils DMD de VPX 10.8.1 sont bien qualifiés', () => {
  const schema = schemas.find((s) => s.file.startsWith('10.8.1'))!.schema;
  const q = labelQualifiers(schema.settings);
  const legacy = schema.settings.filter((d) => d.section === 'DMD' && /^Profile\dLegacy$/.test(d.key));
  assert.equal(legacy.length, 7);
  assert.ok(legacy.every((d) => q.get(d)?.word === 'Profile'));
});
