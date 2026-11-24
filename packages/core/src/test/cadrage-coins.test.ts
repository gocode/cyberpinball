import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeCornersHolds, closeCornersVariant, lowEyeHolds, withLowEye, CLOSE_CORNERS_INCLINATION, CLOSE_CORNERS_EYE, IniDocument, stripCloseCorners, withCloseCorners, withCustomView, withTableFramingStyle } from '../index';

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

test('au plus près des coins : deux variantes, écran incliné ou à plat, relues telles quelles et sans confusion', () => {
  const incline = IniDocument.parse(withCloseCorners(own, 'incline'));
  const plat = IniDocument.parse(withCloseCorners(own, 'plat'));
  assert.equal(closeCornersVariant(incline), 'incline');
  assert.equal(closeCornersVariant(plat), 'plat');
  assert.equal(incline.get('Player', 'ScreenInclination'), CLOSE_CORNERS_INCLINATION.incline);
  assert.equal(plat.get('Player', 'ScreenInclination'), CLOSE_CORNERS_INCLINATION.plat);
  assert.notEqual(CLOSE_CORNERS_INCLINATION.incline, CLOSE_CORNERS_INCLINATION.plat);
  // Même œil, même étirement : seule l'inclinaison les distingue.
  for (const k of ['ScreenPlayerY', 'ScreenPlayerZ', 'CabinetAutofitMaxStretch', 'CabinetAutofitPos']) assert.equal(incline.get('Player', k), plat.get('Player', k));
  // Passer d'une variante à l'autre ne laisse rien de la précédente.
  assert.equal(closeCornersVariant(IniDocument.parse(withCloseCorners(withCloseCorners(own, 'incline'), 'plat'))), 'plat');
});

test('au plus près des coins : l’œil reste dans la plage réglable de VPX (Y -70..30, Z 30..100)', () => {
  assert.ok(Number(CLOSE_CORNERS_EYE.ScreenPlayerZ) <= 100 && Number(CLOSE_CORNERS_EYE.ScreenPlayerZ) >= 30);
  assert.ok(Number(CLOSE_CORNERS_EYE.ScreenPlayerY) <= 30 && Number(CLOSE_CORNERS_EYE.ScreenPlayerY) >= -70);
});

test('au plus près des coins : un style ou une vue reprenant la table retire aussi l’inclinaison de l’essai, jamais celle du joueur', () => {
  for (const variant of ['incline', 'plat'] as const) {
    const back = IniDocument.parse(stripped(withCloseCorners(own, variant)));
    assert.equal(back.get('Player', 'ScreenInclination'), undefined);
    assert.equal(back.get('Player', 'ScreenPlayerZ'), undefined);
  }
  // Une inclinaison propre au joueur, sans l'œil de l'essai : intacte.
  const mine = IniDocument.parse('[Player]\r\nScreenInclination = 6\r\n');
  stripCloseCorners(mine);
  assert.equal(mine.get('Player', 'ScreenInclination'), '6');
  // L'œil de la première version (Y -20 / Z 150) est encore retiré, sans être tenu pour un essai en place.
  const legacy = IniDocument.parse('[Player]\r\nScreenPlayerY = -20\r\nScreenPlayerZ = 150\r\nCabinetAutofitMode = 1\r\nCabinetAutofitKeepTop = 1\r\nCabinetAutofitMaxStretch = 0.5\r\n');
  assert.equal(closeCornersHolds(legacy), false);
  stripCloseCorners(legacy);
  assert.equal(legacy.get('Player', 'ScreenPlayerZ'), undefined);
});

test('œil bas, table élargie : écrit en cadrage manuel, relu tel quel, retiré entier par un autre cadrage, jamais pris pour la vue du joueur', () => {
  const next = withLowEye(own);
  const doc = IniDocument.parse(next);
  assert.equal(lowEyeHolds(doc), true);
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0');
  assert.equal(doc.get('Player', 'ScreenPlayerX'), '3', 'la place du joueur en X est la sienne');
  assert.equal(doc.get('TableOverride', 'ViewCabFOV'), undefined, 'ses autres vues sont retirées');
  assert.equal(lowEyeHolds(IniDocument.parse(own)), false);
  // Rien de la vue ni de l'œil ne reste quand un autre cadrage reprend la table, et ce n'est pas « ma vue personnalisée ».
  const back = IniDocument.parse(stripped(next));
  assert.equal(back.get('Player', 'ScreenPlayerZ'), undefined);
  assert.equal(back.get('TableOverride', 'ViewCabScaleX'), undefined);
  const custom = IniDocument.parse(withCustomView(next, { at: '', values: [{ key: 'ViewCabFOV', value: '30' }] }));
  assert.equal(custom.get('Player', 'ScreenPlayerZ'), undefined);
  assert.equal(custom.get('TableOverride', 'ViewCabScaleX'), undefined);
  assert.equal(custom.get('TableOverride', 'ViewCabFOV'), '30');
  // Passer par les coins ajustés retire aussi le préréglage.
  const corners = IniDocument.parse(withCloseCorners(next, 'plat'));
  assert.equal(corners.get('TableOverride', 'ViewCabScaleX'), undefined);
  assert.equal(corners.get('Player', 'CabinetAutofitMode'), '1');
});

test('œil bas, table élargie : une vue du joueur, même proche, n’est jamais retirée', () => {
  const mine = IniDocument.parse(withLowEye(own));
  mine.set('TableOverride', 'ViewCabScaleX', '1.4');
  assert.equal(lowEyeHolds(mine), false);
  stripCloseCorners(mine);
  assert.equal(mine.get('TableOverride', 'ViewCabScaleX'), '1.4');
  assert.equal(mine.get('Player', 'ScreenPlayerZ'), '99.976471');
});
