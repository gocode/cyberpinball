import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeCornersHolds, CLOSE_CORNERS_EYE, IniDocument, stripCloseCorners, withCloseCorners, withCustomView, withTableFramingStyle } from '../index';

const own = '[Player]\r\nScreenPlayerX = 3\r\n[TableOverride]\r\nViewCabFOV = 25\r\n';

test('au plus près des coins : écrit dans le .ini de la table, relu tel quel, autres réglages gardés', () => {
  const next = withCloseCorners(own);
  const doc = IniDocument.parse(next);
  assert.equal(closeCornersHolds(doc), true);
  assert.equal(doc.get('Player', 'CabinetAutofitMaxStretch'), '0.5');
  assert.equal(doc.get('Player', 'ScreenPlayerZ'), CLOSE_CORNERS_EYE.ScreenPlayerZ);
  assert.equal(doc.get('Player', 'ScreenPlayerX'), '3', 'la place du joueur en X est la sienne');
  assert.equal(doc.get('TableOverride', 'ViewCabFOV'), '25');
  assert.equal(closeCornersHolds(IniDocument.parse(own)), false);
});

test('au plus près des coins : un style, une vue personnalisée ou un POV reprennent la table sans laisser l’œil relevé', () => {
  const next = withCloseCorners(own);
  const style = IniDocument.parse(withTableFramingStyle(stripped(next), 'remplir', true));
  assert.equal(style.get('Player', 'ScreenPlayerZ'), undefined);
  assert.equal(style.get('Player', 'ScreenPlayerX'), '3');
  const custom = IniDocument.parse(withCustomView(next, { at: '', values: [{ key: 'ViewCabFOV', value: '30' }] }));
  assert.equal(custom.get('Player', 'ScreenPlayerZ'), undefined);
  assert.equal(custom.get('Player', 'ScreenPlayerY'), undefined);
  assert.equal(custom.get('Player', 'CabinetAutofitMode'), '0');
});

test('au plus près des coins : l’œil du joueur, avec une autre valeur, n’est jamais retiré', () => {
  const mine = IniDocument.parse('[Player]\r\nScreenPlayerY = -10\r\nScreenPlayerZ = 70\r\n');
  stripCloseCorners(mine);
  assert.equal(mine.get('Player', 'ScreenPlayerZ'), '70');
  assert.equal(mine.get('Player', 'ScreenPlayerY'), '-10');
});

/** Ce que « borneIni » (app/src/table-pov.ts) fait avant d'écrire un autre style : retirer l'œil de l'essai. */
function stripped(ini: string): string {
  const doc = IniDocument.parse(ini);
  stripCloseCorners(doc);
  return doc.toString();
}
