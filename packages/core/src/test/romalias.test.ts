// Alias de ROM propres à une table (romalias.ts) : révision voisine, anciens noms de
// VPinMAME, écriture et retrait des lignes d'alias.txt.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicAlias, neighbourRom, parseAliases, romFamilyOf, withAlias, withoutAlias } from '../romalias';
import { HISTORIC_ROM_ALIASES } from '../vpmalias';

test('révision voisine : même famille, même sorte de révision d’abord, la plus récente', () => {
  assert.equal(romFamilyOf('t2_l8'), 't2');
  assert.equal(neighbourRom('t2_l8', ['t2_l6.zip', 't2_p2f.zip', 'afm_113b.zip', 't2_l4.zip']), 't2_l6');
  assert.equal(neighbourRom('t2_p2f', ['t2_l6', 't2_p1']), 't2_p1', 'un prototype pour un prototype');
  assert.equal(neighbourRom('t2_l8', ['t2_l8', 'afm_113b']), undefined, 'ni elle-même, ni un autre jeu');
  assert.equal(neighbourRom('bond', ['bond_x']), undefined, 'sans « _ », pas de famille');
});

test('anciens noms de VPinMAME : la liste de PinMAME, sans casse', () => {
  assert.ok(HISTORIC_ROM_ALIASES.length >= 100);
  assert.equal(historicAlias('goldfinger'), 'bond');
  assert.equal(historicAlias('GoldFinger'), 'bond');
  assert.equal(historicAlias('t2_l8'), undefined);
});

test('alias.txt : ligne ajoutée ou remplacée, commentaires gardés, retrait jusqu’au fichier vide', () => {
  const one = withAlias('', 't2_l8', 't2_l6', 'révision voisine');
  assert.deepEqual(parseAliases(one), [{ alias: 't2_l8', rom: 't2_l6' }]);
  assert.match(one, /^# Alias de ROM de cette table/);
  const two = withAlias(one, 'goldfinger', 'bond');
  const replaced = withAlias(two, 'T2_L8', 't2_l4');
  assert.deepEqual(parseAliases(replaced), [{ alias: 'goldfinger', rom: 'bond' }, { alias: 'T2_L8', rom: 't2_l4' }]);
  const less = withoutAlias(two, 't2_l8');
  assert.deepEqual(parseAliases(less), [{ alias: 'goldfinger', rom: 'bond' }]);
  assert.ok(!less.includes('révision voisine'), 'le commentaire de la ligne part avec elle');
  assert.equal(withoutAlias(less, 'goldfinger'), '', 'plus aucun alias');
  // Fichier écrit à la main : ses commentaires restent.
  assert.match(withAlias('# mes alias\r\nabc_1,abc_2\r\n', 't2_l8', 't2_l6'), /^# mes alias\r\nabc_1,abc_2\r\n/);
});
