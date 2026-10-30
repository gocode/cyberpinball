// Alias de ROM propres à une table (romalias.ts) : révision voisine, anciens noms de
// VPinMAME, écriture et retrait des lignes d'alias.txt.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { historicAlias, loadedRoms, neighbourRom, parseAliases, romFamilyOf, withAlias, withoutAlias } from '../romalias';
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

test('jeu chargé : l’alias de la table remplace le nom demandé (mémoire, carte, réglages), seulement si la table a ses ROM', () => {
  // Star Trek sur la borne (30/10/2026) : le script demande st_162h, alias.txt fait charger st_161h ; sa mémoire est st_161h.nv.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-jeu-charge-'));
  try {
    fs.mkdirSync(path.join(dir, 'pinmame'));
    fs.writeFileSync(path.join(dir, 'pinmame', 'alias.txt'), withAlias('', 'st_162h', 'st_161h', 'révision voisine'));
    assert.deepEqual(loadedRoms(dir, ['st_162h']), ['st_162h'], 'sans pinmame\roms, le plugin ne lit pas alias.txt');
    fs.mkdirSync(path.join(dir, 'pinmame', 'roms'));
    assert.deepEqual(loadedRoms(dir, ['ST_162H', 'twd_160h']), ['st_161h', 'twd_160h']);
    assert.deepEqual(loadedRoms(path.join(dir, 'absent'), ['t2_l8']), ['t2_l8']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Partout où la mémoire d'une ROM est lue, c'est celle du jeu chargé.
  const root = path.resolve(__dirname, '..', '..', '..', '..');
  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('app/src/table-double.ts'), /const roms = loadedRoms\(table\.folder, opts\.romsOf\?\.\(table\) \?\? \[\]\);/);
  assert.match(read('app/src/ball-count.ts'), /const roms = loadedRoms\(table\.folder, opts\.romsOf\?\.\(table\) \?\? \[\]\);/);
  assert.match(read('app/src/frontend.ts'), /readHostSettings\(\{ folder: table\.folder, roms: loadedRoms\(table\.folder, romsOf\(table\)\)/);
});
