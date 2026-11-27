import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addZenTable, describeTableFile, findSteamPinballFx, pinballFxCommand, pinballFxMidnightCommand,
  pinballFxMidnightSetup, scanTables, zenEntryKey, zenTable,
} from '..';
import { removeTempDir } from './temp-dir';

test('Pinball FX et Midnight : chacun son AppID, même ordre des quatre arguments documentés', () => {
  const steam = { store: 'steam' as const, launcher: 'steam.exe', gameDir: 'steamapps', cabinetDir: 'cabinet' };
  const modes = ['Classic', 'Hotseat_2', 'Hotseat_3', 'Hotseat_4'] as const;
  for (const mode of modes) {
    assert.deepEqual(pinballFxCommand(steam, 108, mode), { file: 'steam.exe', args: ['-applaunch', '2328760', '-Table', '108', '-GameMode', mode] });
    assert.deepEqual(pinballFxMidnightCommand(steam, 171, mode), { file: 'steam.exe', args: ['-applaunch', '2337640', '-Table', '171', '-GameMode', mode] });
  }
  assert.deepEqual(pinballFxCommand({ ...steam, store: 'epic', launcher: 'fx.exe' }, 108, 'Practice'), { file: 'fx.exe', args: ['-Table', '108', '-GameMode', 'Practice'] });
  assert.equal(pinballFxMidnightCommand(steam, 171).args.at(-1), 'Classic');
  assert.throws(() => pinballFxMidnightCommand(steam, -171), RangeError);
  assert.throws(() => pinballFxMidnightCommand(steam, 171, 'Practice' as 'Classic'), RangeError);
});

test('Steam : installeur Midnight distinct, installation complète et exécutable requis, bibliothèque secondaire', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-steam-midnight-'));
  try {
    const steam = path.join(root, 'Steam'), library = path.join(root, 'Other Library');
    const mainApps = path.join(steam, 'steamapps'), otherApps = path.join(library, 'steamapps');
    fs.mkdirSync(mainApps, { recursive: true });
    fs.mkdirSync(otherApps, { recursive: true });
    assert.deepEqual(pinballFxMidnightSetup(steam), { downloading: false });
    const launcher = path.join(steam, 'steam.exe');
    fs.writeFileSync(launcher, '');
    fs.writeFileSync(path.join(mainApps, 'libraryfolders.vdf'), '"libraryfolders" { "1" { "path" ' + JSON.stringify(library) + ' } }');
    fs.writeFileSync(path.join(mainApps, 'appmanifest_2328760.acf'), '"AppState" { "StateFlags" "4" "installdir" "Pinball FX" }');
    fs.mkdirSync(path.join(mainApps, 'common', 'Pinball FX'), { recursive: true });
    assert.ok(findSteamPinballFx(steam));
    assert.deepEqual(pinballFxMidnightSetup(steam), { downloading: false, getter: { store: 'steam', file: launcher, args: ['steam://install/2337640'] } });
    const manifest = path.join(otherApps, 'appmanifest_2337640.acf');
    fs.writeFileSync(manifest, '"AppState" { "StateFlags" "2" "installdir" "Pinball M" }');
    assert.equal(pinballFxMidnightSetup(steam).downloading, true);
    const gameDir = path.join(otherApps, 'common', 'Pinball M');
    const bin = path.join(gameDir, 'PinballM', 'Binaries', 'Win64');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(manifest, '"AppState" { "StateFlags" "4" "installdir" "Pinball M" }');
    assert.equal(pinballFxMidnightSetup(steam).install, undefined);
    fs.writeFileSync(path.join(bin, 'PinballM-Win64-Shipping.exe'), '');
    assert.deepEqual(pinballFxMidnightSetup(steam), { downloading: false, install: { store: 'steam', launcher, gameDir } });
  } finally { removeTempDir(root); }
});

test('fiches : mêmes numéros et titres isolés, ancienne fiche Midnight inchangée, AppID incohérent rejeté', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tables-midnight-'));
  try {
    const old = path.join(root, 'Legacy', 'Legacy.pinballfx');
    fs.mkdirSync(path.dirname(old));
    const json = '{"PinballFXMidnight":{"Table":171,"AppId":"2337640"}}';
    fs.writeFileSync(old, json);
    const legacy = describeTableFile(root, old);
    assert.equal(legacy.emulator, 'pinballfxmidnight');
    assert.equal(legacy.id, 'Legacy/Legacy.pinballfx');
    assert.equal(addZenTable(root, zenTable('pinballfxmidnight', '171')!).file, old);
    assert.equal(fs.readFileSync(old, 'utf8'), json);

    const fx = addZenTable(root, { ...zenTable('pinballfx', '171')!, title: 'Shared', manufacturer: 'Zen Studios' });
    const m1 = addZenTable(root, { ...zenTable('pinballfxmidnight', '180')!, title: 'Shared', manufacturer: 'Zen Studios' });
    const m2 = addZenTable(root, { ...zenTable('pinballfxmidnight', '181')!, title: 'Shared', manufacturer: 'Zen Studios' });
    assert.deepEqual([fx, m1, m2].map(zenEntryKey), ['171', '180', '181']);
    assert.equal(new Set([fx.folder, m1.folder, m2.folder]).size, 3);
    assert.equal(scanTables(root).length, 4);
    assert.ok(m1.file.endsWith('.pinballfxmidnight'));
    const wrong = path.join(root, 'Wrong.pinballfxmidnight');
    fs.writeFileSync(wrong, '{"PinballFXMidnight":{"Table":171,"AppId":"2328760"}}');
    assert.equal(zenEntryKey(describeTableFile(root, wrong)), undefined);
    assert.equal(zenTable('pinballfxmidnight', '1e4'), undefined);
  } finally { removeTempDir(root); }
});
