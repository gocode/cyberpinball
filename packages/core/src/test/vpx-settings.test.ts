import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import { writeWithBackup } from '../store';
import { VPX_ESSENTIALS } from '../vpx-essentials';
import {
  applySetting,
  findTableIni,
  formatIniValue,
  isOwned,
  numericChoices,
  parseIniValue,
  settingState,
  vpxOwnedKeys,
  type VpxSettingDef,
  type VpxSettingsSchema,
} from '../vpx-settings';

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'installer', 'vpx-settings', '10.8.1-5436.json'), 'utf8'),
) as VpxSettingsSchema;
const def = (section: string, key: string): VpxSettingDef => {
  const found = SCHEMA.settings.find((s) => s.section === section && s.key === key);
  assert.ok(found, `[${section}] ${key} absent du schéma`);
  return found;
};

const MUSIC = def('Player', 'MusicVolume');
const BGSET = def('Player', 'BGSet');
const AUTOFIT = def('Player', 'CabinetAutofitPos');
const BLOOM = def('Player', 'ForceBloomOff');
const SYNC = def('Player', 'SyncMode');

// Extrait d'un VPinballX.ini écrit par VPX 10.8.1 : clés « non définies » laissées vides, pas de saut de ligne final.
const GLOBAL = ['[Player]', 'PlayfieldDisplay = Generic PnP Monitor', 'MusicVolume = ', 'SoundVolume = 75', 'BGSet = 1', 'ForceBloomOff = ', '', '[DMD]', 'Profile2DotBrightness = '].join('\r\n');

test('lecture comme VPX : vide = valeur par défaut, booléens et énumérations en texte ou en nombre', () => {
  assert.equal(parseIniValue(MUSIC, ''), undefined);
  assert.equal(parseIniValue(MUSIC, '  '), undefined);
  assert.equal(parseIniValue(MUSIC, '80'), 80);
  assert.equal(parseIniValue(MUSIC, 'beaucoup'), undefined);
  assert.equal(parseIniValue(BLOOM, '1'), true);
  assert.equal(parseIniValue(BLOOM, 'off'), false);
  assert.equal(parseIniValue(BGSET, 'Cabinet'), 1);
  assert.equal(parseIniValue(BGSET, '2'), 2);
  assert.equal(parseIniValue(BGSET, '7'), undefined);
  assert.equal(parseIniValue(AUTOFIT, '0.1'), 0.1);
});

test('écriture au format de VPX', () => {
  assert.equal(formatIniValue(BLOOM, true), '1');
  assert.equal(formatIniValue(SYNC, 2), '2');
  assert.equal(formatIniValue(AUTOFIT, 0.07), '0.07');
  assert.equal(formatIniValue(def('Player', 'ScreenWidth'), 95.89), '95.89');
});

test('état : valeur générale, surcharge de table, défaut, valeur illisible', () => {
  const global = IniDocument.parse(GLOBAL);
  assert.deepEqual(
    { ...settingState(MUSIC, global), def: undefined },
    { def: undefined, global: undefined, effective: 100, source: 'default' },
  );
  const table = IniDocument.parse('[Player]\r\nSoundVolume = 40\r\nMusicVolume = fort\r\n');
  const sound = settingState(def('Player', 'SoundVolume'), global, table);
  assert.equal(sound.global, 75);
  assert.equal(sound.table, 40);
  assert.equal(sound.effective, 40);
  assert.equal(sound.source, 'table');
  const music = settingState(MUSIC, global, table);
  assert.equal(music.effective, 100);
  assert.deepEqual(music.invalid, { scope: 'table', raw: 'fort' });
  // [TableOverride] : sans valeur, c'est la table qui décide.
  assert.equal(settingState(def('TableOverride', 'Difficulty'), global, IniDocument.parse('')).effective, undefined);
});

test('VPinballX.ini : on ne touche qu’à la ligne du réglage, retour au défaut = « Clé = »', () => {
  const doc = IniDocument.parse(GLOBAL);
  assert.equal(applySetting(doc, MUSIC, 80, 'global'), true);
  assert.equal(doc.toString(), GLOBAL.replace('MusicVolume = ', 'MusicVolume = 80'));
  assert.equal(applySetting(doc, MUSIC, 80, 'global'), false);
  assert.equal(applySetting(doc, MUSIC, undefined, 'global'), true);
  assert.equal(doc.toString(), GLOBAL);
  // Une clé absente est ajoutée dans sa section.
  applySetting(doc, def('DMD', 'Profile2DotSize'), 0.5, 'global');
  assert.ok(doc.toString().endsWith('Profile2DotBrightness = \r\nProfile2DotSize = 0.5'));
});

test('.ini de table : surcharge, valeur égale au général non gardée (sauf Dyn), retrait', () => {
  const global = IniDocument.parse(GLOBAL);
  const table = IniDocument.parse('');
  assert.equal(applySetting(table, BGSET, 2, 'table', global), true);
  assert.equal(table.get('Player', 'BGSet'), '2');
  // Égale au réglage général (BGSet = 1) : VPX ne la garderait pas, nous non plus.
  assert.equal(applySetting(table, BGSET, 1, 'table', global), true);
  assert.equal(table.get('Player', 'BGSet'), undefined);
  assert.equal(table.toString(), '');
  // Réglage « Dyn » : toujours écrit, comme VPX le fait.
  const exposure = def('TableOverride', 'Exposure');
  assert.equal(applySetting(table, exposure, 1, 'table', global), true);
  assert.equal(table.toString(), '[TableOverride]\nExposure = 1\n');
  assert.equal(applySetting(table, exposure, undefined, 'table', global), true);
  assert.equal(table.toString(), '');
});

test('écriture réelle avec sauvegarde : le reste du fichier est intact, octet pour octet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reglages-'));
  const file = path.join(dir, 'VPinballX.ini');
  fs.writeFileSync(file, GLOBAL);
  const doc = IniDocument.parse(fs.readFileSync(file, 'utf8'));
  applySetting(doc, SYNC, 1, 'global');
  const report = writeWithBackup(file, doc.toString(), path.join(dir, 'backups'));
  assert.equal(fs.readFileSync(report.backup!, 'utf8'), GLOBAL);
  assert.equal(fs.readFileSync(file, 'utf8'), GLOBAL.replace('ForceBloomOff = ', 'ForceBloomOff = \r\nSyncMode = 1'));
});

test('.ini de table trouvé comme VPX : nom de la table, puis nom du dossier, sinon nom de la table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-table-'));
  const folder = path.join(dir, 'Terminator 2 (Williams 1991)');
  fs.mkdirSync(folder);
  const vpx = path.join(folder, 'T2 g5k 1.25.vpx');
  fs.writeFileSync(vpx, '');
  assert.deepEqual(findTableIni(vpx), { path: path.join(folder, 'T2 g5k 1.25.ini'), exists: false });
  const byFolder = path.join(folder, 'terminator 2 (williams 1991).INI');
  fs.writeFileSync(byFolder, '[Player]\n');
  assert.deepEqual(findTableIni(vpx), { path: byFolder, exists: true });
  fs.writeFileSync(path.join(folder, 'T2 g5k 1.25.ini'), '');
  assert.deepEqual(findTableIni(vpx), { path: path.join(folder, 'T2 g5k 1.25.ini'), exists: true });
});

test('clés possédées par Cyber Pinball : fenêtres et plugins du profil', () => {
  const owned = vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: ['PinMAME', 'B2S'] });
  assert.ok(isOwned(owned, 'Player', 'PlayfieldDisplay'));
  assert.ok(isOwned(owned, 'backglass', 'backglassoutput'));
  assert.ok(isOwned(owned, 'Topper', 'TopperHeight'));
  assert.ok(isOwned(owned, 'Plugin.PinMAME', 'Enable'));
  assert.ok(!isOwned(owned, 'Player', 'PlayfieldOutput'), 'Playfield n’a pas de réglage Output');
  assert.ok(!isOwned(owned, 'Player', 'PlayfieldFSWidth'));
  assert.ok(!isOwned(owned, 'Plugin.Serum', 'Enable'));
  // Toutes les clés de fenêtre possédées existent dans le schéma de la version installée.
  const known = new Set(SCHEMA.settings.map((s) => `${s.section}/${s.key}`.toLowerCase()));
  for (const id of owned) if (!id.startsWith('plugin.')) assert.ok(known.has(id), id);
});

test('choix aux flippers : grille régulière qui contient la valeur courante et le défaut', () => {
  const music = numericChoices(MUSIC, 37);
  assert.equal(music.length, 101);
  assert.ok(music.includes(37));
  const autofit = numericChoices(AUTOFIT, 0.05);
  assert.deepEqual([autofit[0], autofit[1], autofit.at(-1)], [0, 0.002, 0.2]);
  assert.ok(autofit.includes(0.05));
  const width = numericChoices(def('Player', 'PlayfieldWndX'), 1234);
  assert.ok(width.length < 300 && width.includes(1234));
  // Sans bornes : autour de la valeur courante.
  const gravity = numericChoices(def('Player', 'TablePhysicsGravityConstant0'), 0.97);
  assert.ok(gravity.includes(0.97) && gravity.length > 100);
});

test('Essentiels : chaque réglage existe dans le schéma, avec un libellé par valeur', () => {
  for (const group of VPX_ESSENTIALS) {
    for (const e of group.settings) {
      const d = def(e.section, e.key);
      if (d.type === 'enum') assert.equal(e.values?.length, d.values!.length, `${e.key} : libellés`);
      if (d.type === 'bool') assert.equal(e.values?.length ?? 2, 2, `${e.key} : non / oui`);
    }
  }
});

test('IniDocument : retrait d’une clé et de sa section devenue vide, énumération des entrées', () => {
  const doc = IniDocument.parse('[Player]\nBGSet = 1\n\n[TableOverride]\nDifficulty = 0.8\n');
  assert.deepEqual(doc.entries(), [
    { section: 'Player', key: 'BGSet', value: '1' },
    { section: 'TableOverride', key: 'Difficulty', value: '0.8' },
  ]);
  assert.equal(doc.remove('player', 'bgset'), true);
  assert.equal(doc.toString(), '[TableOverride]\nDifficulty = 0.8\n');
  assert.equal(doc.remove('Player', 'BGSet'), false);
});
