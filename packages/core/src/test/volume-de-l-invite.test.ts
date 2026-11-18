// Volume de l'invité (décision du 16/11/2026) : dans une partie entre amis, chaque borne garde son
// niveau sonore, adapté à son lieu. Les réglages de jeu de l'hôte (billes, sauvetage, tilt, extras)
// voyagent dans la mémoire de la ROM, ses interrupteurs (.cfg) et VPReg.stg ; le volume, qui vit dans
// ces mêmes fichiers, reste celui de l'invité, dans un sens comme dans l'autre. Un joueur l'avait
// signalé : « le son de la table baisse beaucoup lorsque l'on fait une partie entre amis ».
//
// Prouvé au banc libpinmame le 16/11/2026 (The Addams Family, taf_l7, WPC) : le volume est l'octet
// 0x1C9C, sous sa propre somme de contrôle 16 bits (0x1C9D-0x1C9E) ; recopié sans elle, la ROM le
// remet au démarrage ; sans mémoire, PinMAME laisse ce bloc vierge (FF FF FF, somme fausse) et la ROM
// joue son volume d'usine. Les fichiers d'essai suivent ces mesures.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { cfb } from './fixtures';
import { REPO_ROOT } from './i18n-scan';
import { applyHostSettings, folderChanges, folderPrint, mergeRomVolume, readHostSettings, readVpReg, romChecksums, scriptVolumeKeys, type HostSetting, type RomMemory, type TableEntry } from '../index';
import { fakeTableDoublesOptions } from './doublures';

/** WPC (réduite d'après taf_l7) : le volume sous sa propre somme, deux réglages dans le bloc des réglages. */
const WPC: RomMemory = {
  map: {
    _metadata: {
      platform: 'williams-wpc-8K',
      validation: {
        checksum: [
          { label: 'Adjustments', start: '0x1B1D', end: '0x1BFA', bits: 16, complement: true },
          { label: 'Volume', start: '0x1C9C', end: '0x1C9E', bits: 16, complement: true },
        ],
      },
    },
    game_state: { volume: { label: 'Volume', start: 7324, encoding: 'int', min: 0, max: 31, special_values: { '255': 'n/a' } } },
    adjustments: {
      standard: {
        balls: { label: 'Balls Per Game', start: '0x1B20', encoding: 'int', default: 3 },
        minvol: { label: 'Min. Vol. Override', start: '0x1B30', encoding: 'enum', default: 0, values: ['NO', 'YES'] },
      },
    },
    audits: { volume: { label: 'Volume', start: 7400, encoding: 'int' } },
  } as unknown as RomMemory['map'],
  platform: { endian: 'big', memory_layout: [{ type: 'nvram', address: '0x0000', size: '0x2000' }] },
};

/** Stern SAM (réduite d'après im_185ve) : « Master Volume » avec sa valeur d'usine, une somme 8 bits. */
const SAM: RomMemory = {
  map: {
    _metadata: { platform: 'stern-sam', validation: { checksum: [{ label: 'Master Volume', start: '0x2110248', end: '0x2110249', complement: true }] } },
    game_state: { volume: { label: 'Master Volume', encoding: 'int', start: '0x02110248', min: 0, max: 63, default: 40 } },
  } as unknown as RomMemory['map'],
  platform: { endian: 'little', memory_layout: [{ type: 'nvram', address: '0x02100000', size: '0x20000' }] },
};

/** Une somme complémentée qui termine sa région, comme la ROM l'écrit (indépendante du code testé). */
function seal(nv: Buffer, start: number, end: number, bits: 8 | 16): void {
  let sum = 0;
  for (let i = start; i <= end - bits / 8; i++) sum += nv[i]!;
  if (bits === 8) nv[end] = ~sum & 0xff;
  else nv.writeUInt16BE(~sum & 0xffff, end - 1);
}

/** Mémoire WPC : billes, priorité du volume minimum, volume ; sommes justes. */
function wpc(balls: number, volume: number, minVol = 0): Buffer {
  const nv = Buffer.alloc(8238, 0x11);
  nv[0x1b20] = balls;
  nv[0x1b30] = minVol;
  nv[7324] = volume;
  nv[7400] = 99; // un compteur nommé « Volume » : jamais touché
  seal(nv, 0x1b1d, 0x1bfa, 16);
  seal(nv, 0x1c9c, 0x1c9e, 16);
  return nv;
}

function sam(volume: number, balls: number): Buffer {
  const nv = Buffer.alloc(131_118, 0);
  nv[0x10248] = volume;
  nv[0x2108] = balls;
  seal(nv, 0x10248, 0x10249, 8);
  return nv;
}

/** Le .cfg de PinMAME : en-tête, interrupteurs, compteurs, puis 25 niveaux par défaut et 25 niveaux réglés. */
function cfg(dips: string, levels: number[]): Buffer {
  const defaults = Buffer.alloc(25, 0xff);
  Buffer.from([0x10, 0x10, 0x46, 0x64]).copy(defaults);
  const set = Buffer.from(defaults);
  Buffer.from(levels).copy(set);
  return Buffer.concat([Buffer.from('MAMECFG\x09', 'latin1'), Buffer.from(dips, 'latin1'), Buffer.alloc(36), defaults, set]);
}

/** Le menu de service d'une table de VPW : billes (DMDStd_62) et volume de la musique (DMDStd_70), plus un volume nommé par la table. */
const SCRIPT = [
  'Const kDMDStd_BallsPerGame = &H3E',
  'Const kDMDStd_MusicVol = 70 \' volume de la musique',
  'DMDMenu(11).Setup "BALL  PER  GAME", kDMDStd_BallsPerGame, 3, "INT[3:5]", 1',
  'DMDMenu(12).Setup "MUSIC  VOLUME", kDMDStd_MusicVol, 8, "INT[0:15]", 1',
].join('\r\n');

const vpreg = (balls: string, music: string, mech: string) => cfb({ HighScore1: '1000', HighScore1Name: 'AAA', DMDStd_62: balls, DMDStd_70: music, MechVolume: mech }, {}, { info: 'gameofthrones' });

function write(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Les cartes en cache, comme loadRomMemory les range (index.json, la carte, sa plateforme). */
function cacheMaps(dir: string, maps: Record<string, RomMemory>): string {
  const index: Record<string, string> = {};
  for (const [rom, memory] of Object.entries(maps)) {
    index[rom] = `maps/test/${rom}.map.json`;
    write(path.join(dir, `maps_test_${rom}.map.json`), JSON.stringify(memory.map));
    write(path.join(dir, `platform_${memory.map._metadata!.platform as string}.json`), JSON.stringify(memory.platform));
  }
  write(path.join(dir, 'index.json'), JSON.stringify(index));
  return dir;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createTableDoubles } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-double.js')) as {
  createTableDoubles(o: object): { start(table: TableEntry, id: string, settings?: HostSetting[]): { ok: true; double: { table: TableEntry; finish(): void } } | { ok: false; reason: string } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Une borne : sa table (Addams Family, ROM taf_l7), sa mémoire, ses interrupteurs, son VPReg.stg et le script de son menu de service. */
function cabinet(root: string, files: { nv?: Buffer; cfg?: Buffer; reg?: Buffer }): TableEntry {
  const folder = path.join(root, 'tables', 'The Addams Family');
  write(path.join(folder, 'The Addams Family.vpx'), 'table');
  write(path.join(folder, 'The Addams Family.vbs'), SCRIPT);
  write(path.join(folder, 'pinmame', 'roms', 'taf_l7.zip'), 'rom');
  if (files.nv) write(path.join(folder, 'pinmame', 'nvram', 'taf_l7.nv'), files.nv);
  if (files.cfg) write(path.join(folder, 'pinmame', 'cfg', 'taf_l7.cfg'), files.cfg);
  if (files.reg) write(path.join(folder, 'user', 'VPReg.stg'), files.reg);
  return { id: 'taf', file: path.join(folder, 'The Addams Family.vpx'), folder, title: 'The Addams Family', info: {} } as unknown as TableEntry;
}

/** Une partie entre amis : les réglages lus chez l'hôte, posés dans le double de l'invité ; rend ce double et le journal. */
function play(root: string, host: TableEntry, guest: TableEntry, maps: Record<string, RomMemory> = { taf_l7: WPC }) {
  const settings = readHostSettings({ folder: host.folder, roms: ['taf_l7'] })!;
  const log: string[] = [];
  const doubles = createTableDoubles(fakeTableDoublesOptions({ root: () => path.join(root, 'invite'), tablesDir: () => path.join(root, 'invite', 'tables'), romsOf: () => ['taf_l7'], memoryCacheDir: cacheMaps(path.join(root, 'cartes'), maps), log: (l: string) => log.push(l) }));
  const started = doubles.start(guest, 'partie', settings);
  assert.ok(started.ok, started.ok ? '' : started.reason);
  const dir = started.double.table.folder;
  const read = (rel: string) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel)) : undefined);
  return { double: started.double, nv: read('pinmame/nvram/taf_l7.nv'), cfg: read('pinmame/cfg/taf_l7.cfg'), reg: () => readVpReg(path.join(dir, 'user', 'VPReg.stg'))?.get('gameofthrones'), log: log.join('\n') };
}

test('invariant : le volume de l’invité ne change pas, que l’hôte joue plus fort ou moins fort ; les réglages de jeu de l’hôte voyagent', () => {
  for (const [hostVolume, guestVolume] of [
    [31, 6],
    [6, 31],
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-'));
    const host = cabinet(path.join(root, 'hote'), { nv: wpc(3, hostVolume, 1), cfg: cfg('HOTE', [0x10, 0x10, hostVolume, hostVolume]), reg: vpreg('3', String(hostVolume), `0.${hostVolume}`) });
    const guest = cabinet(path.join(root, 'invite'), { nv: wpc(5, guestVolume, 0), cfg: cfg('INVI', [0x10, 0x10, guestVolume, guestVolume]), reg: vpreg('5', String(guestVolume), `0.${guestVolume}`) });
    const hostBefore = folderPrint(host.folder, { full: true });
    const guestBefore = folderPrint(guest.folder, { full: true });
    const got = play(root, host, guest);
    // La mémoire : billes de l'hôte, volume et priorité du volume minimum de l'invité, sommes justes (la ROM ne les remettra pas).
    assert.equal(got.nv![0x1b20], 3, 'billes de l’hôte');
    assert.equal(got.nv![7324], guestVolume, `volume de l’invité (hôte à ${hostVolume})`);
    assert.equal(got.nv![0x1b30], 0, 'Min. Vol. Override de l’invité, dans le bloc des réglages de l’hôte');
    assert.equal(got.nv![7400], 99, 'un compteur n’est pas un réglage');
    assert.deepEqual(romChecksums(WPC, got.nv!), [{ label: 'Adjustments', ok: true }, { label: 'Volume', ok: true }]);
    // Hors du volume, chaque octet est celui de l'hôte.
    const hostNv = wpc(3, hostVolume, 1);
    const differs = [...got.nv!.keys()].filter((i) => got.nv![i] !== hostNv[i]);
    assert.ok(
      differs.every((i) => [7324, 0x1b30, 0x1c9d, 0x1c9e, 0x1bf9, 0x1bfa].includes(i)),
      `octets changés : ${differs.map((i) => i.toString(16)).join(' ')}`,
    );
    // Les interrupteurs de l'hôte, les niveaux de mixage de l'invité.
    assert.deepEqual(got.cfg, Buffer.concat([cfg('HOTE', []).subarray(0, -50), cfg('INVI', [0x10, 0x10, guestVolume, guestVolume]).subarray(-50)]));
    // VPReg.stg : billes et records de l'hôte, volumes de l'invité (nommé par la table, ou par le menu de service).
    const reg = got.reg()!;
    assert.equal(reg.get('DMDStd_62'), '3');
    assert.equal(reg.get('DMDStd_70'), String(guestVolume));
    assert.equal(reg.get('MechVolume'), `0.${guestVolume}`);
    assert.equal(reg.get('HighScore1Name'), 'AAA');
    // Le journal dit ce qui vient de l'hôte et ce qui est gardé.
    assert.match(got.log, /pinmame\/nvram\/taf_l7\.nv : celui de l’hôte, volume de l’invité gardé \(Volume, Min\. Vol\. Override\)/);
    assert.match(got.log, /pinmame\/cfg\/taf_l7\.cfg : interrupteurs de l’hôte, niveaux de son de l’invité gardés/);
    assert.match(got.log, /user\/VPReg\.stg : celui de l’hôte, volume de l’invité gardé \(DMDStd_70, MechVolume\)/);
    // Dans l'autre sens : rien de l'invité ne va chez l'hôte, et aucune des deux tables ne bouge.
    got.double.finish();
    assert.deepEqual(folderChanges(hostBefore, folderPrint(host.folder, { full: true })), []);
    assert.deepEqual(folderChanges(guestBefore, folderPrint(guest.folder, { full: true })), []);
  }
});

test('invité qui n’a jamais joué la table : le volume d’usine, comme chez lui', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-usine-'));
  const host = cabinet(path.join(root, 'hote'), { nv: wpc(3, 31, 1), cfg: cfg('HOTE', [0x10, 0x10, 0x20, 0x20]), reg: vpreg('3', '15', '0.9') });
  const guest = cabinet(path.join(root, 'invite'), {});
  const got = play(root, host, guest);
  assert.equal(got.nv![0x1b20], 3);
  // Bloc du volume vierge, comme PinMAME le crée sans mémoire (mesuré au banc) : la ROM joue son volume d'usine.
  assert.deepEqual([...got.nv!.subarray(7324, 7327)], [0xff, 0xff, 0xff]);
  assert.equal(got.nv![0x1b30], 0, 'Min. Vol. Override d’usine (NO)');
  assert.deepEqual(romChecksums(WPC, got.nv!), [{ label: 'Adjustments', ok: true }, { label: 'Volume', ok: false }]);
  assert.deepEqual(got.cfg!.subarray(-25), got.cfg!.subarray(-50, -25), 'niveaux de mixage d’usine');
  const reg = got.reg()!;
  assert.equal(reg.get('DMDStd_62'), '3');
  assert.equal(reg.get('DMDStd_70'), '', 'vide : la table prend sa valeur par défaut, comme chez l’invité');
  assert.equal(reg.get('MechVolume'), '');
  // Stern SAM : la carte donne le volume d'usine (40).
  const out = mergeRomVolume(SAM, sam(63, 3), undefined);
  assert.ok(out.kind === 'merged');
  assert.equal(out.data[0x10248], 40);
  assert.equal(out.data[0x2108], 3);
  assert.ok(romChecksums(SAM, out.data).every((c) => c.ok));
});

test('hôte sans le fichier : celui de l’invité reste, plutôt que des réglages d’usine qui changeraient son volume', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-hote-vide-'));
  const host = cabinet(path.join(root, 'hote'), {});
  const guest = cabinet(path.join(root, 'invite'), { nv: wpc(5, 6), cfg: cfg('INVI', [0x10, 0x10, 0x08]), reg: vpreg('5', '2', '0.1') });
  const got = play(root, host, guest);
  assert.deepEqual(got.nv, wpc(5, 6));
  assert.deepEqual(got.cfg, cfg('INVI', [0x10, 0x10, 0x08]));
  assert.equal(got.reg()!.get('DMDStd_70'), '2');
  assert.match(got.log, /taf_l7\.nv : celui de l’invité gardé \(l’hôte n’en a pas/);
  // Sans volume réglé chez l'invité (niveaux d'usine, pas de clé de volume) : retiré comme chez l'hôte.
  const plain = cabinet(path.join(root, 'invite2'), { cfg: cfg('INVI', []), reg: cfb({ HighScore1: '1' }, {}, { info: 'gameofthrones' }) });
  const notes = applyHostSettings(plain.folder, [{ rel: 'pinmame/cfg/taf_l7.cfg' }, { rel: 'user/VPReg.stg' }]);
  assert.ok(!fs.existsSync(path.join(plain.folder, 'pinmame', 'cfg', 'taf_l7.cfg')));
  assert.ok(!fs.existsSync(path.join(plain.folder, 'user', 'VPReg.stg')));
  assert.deepEqual(notes, [
    'pinmame/cfg/taf_l7.cfg : retiré, comme chez l’hôte (niveaux de son d’usine chez l’invité aussi)',
    'user/VPReg.stg : retiré, comme chez l’hôte (pas de volume enregistré chez l’invité)',
  ]);
});

test('volume que la carte ne situe pas : la mémoire de l’invité reste, et le journal le dit ; machine sans volume en mémoire : celle de l’hôte', () => {
  const host = Buffer.alloc(8192, 3);
  const guest = Buffer.alloc(8192, 5);
  const whitestar = { map: { _metadata: { platform: 'whitestar' } }, platform: { memory_layout: [{ type: 'nvram', address: 0, size: '0x2000' }] } } as unknown as RomMemory;
  assert.deepEqual(mergeRomVolume(whitestar, host, guest), { kind: 'guest', reason: 'la carte ne situe pas le volume (whitestar)' });
  assert.deepEqual(mergeRomVolume(undefined, host, guest), { kind: 'guest', reason: 'pas de carte mémoire de cette ROM en cache' });
  const bally = { ...whitestar, map: { _metadata: { platform: 'bally-35-8K' } } } as unknown as RomMemory;
  assert.deepEqual(mergeRomVolume(bally, host, guest), { kind: 'host' });
  // Le double : la mémoire de l'invité, et la raison au journal.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-carte-'));
  const got = play(root, cabinet(path.join(root, 'hote'), { nv: wpc(3, 31) }), cabinet(path.join(root, 'invite'), { nv: wpc(5, 6) }), {});
  assert.deepEqual(got.nv, wpc(5, 6));
  assert.match(got.log, /taf_l7\.nv : celui de l’invité gardé \(pas de carte mémoire de cette ROM en cache : réglages de jeu de l’hôte non repris\)/);
});

test('bloc de volume vierge chez l’invité (volume jamais réglé) : recopié tel quel, la ROM joue son volume d’usine comme chez lui', () => {
  const guest = wpc(5, 6);
  guest.fill(0xff, 7324, 7327);
  const out = mergeRomVolume(WPC, wpc(3, 31), guest);
  assert.ok(out.kind === 'merged');
  assert.deepEqual([...out.data.subarray(7324, 7327)], [0xff, 0xff, 0xff]);
  assert.equal(out.data[0x1b20], 3);
  // Le bloc des réglages faux chez l'invité : son volume minimum ne se reprend pas sûrement, sa mémoire reste.
  const broken = wpc(5, 6);
  broken[0x1b21] = broken[0x1b21]! ^ 1;
  assert.deepEqual(mergeRomVolume(WPC, wpc(3, 31), broken), { kind: 'guest', reason: 'somme de contrôle de l’invité fausse (Adjustments)' });
});

test('VPReg.stg : une clé de volume que l’hôte n’a pas ne se crée pas ; celui de l’invité reste', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-vpreg-'));
  const guest = cfb({ HighScore1: '1', MusicVolume: '0.2' }, {}, { info: 'gameofthrones' });
  write(path.join(dir, 'user', 'VPReg.stg'), guest);
  const notes = applyHostSettings(dir, [{ rel: 'user/VPReg.stg', data: cfb({ HighScore1: '9' }, {}, { info: 'gameofthrones' }) }]);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'user', 'VPReg.stg')), guest);
  assert.deepEqual(notes, ['user/VPReg.stg : celui de l’invité gardé (clé de volume absente chez l’hôte : MusicVolume ; valeurs de l’hôte non reprises)']);
});

test('menu de service de VPW : les clés de volume lues dans le script', () => {
  assert.deepEqual(scriptVolumeKeys(SCRIPT), ['DMDStd_70']);
  assert.deepEqual(scriptVolumeKeys('DMDMenu(1).Setup "KNOCKER VOL.", kDMDStd_Knock, 1, "INT", 1 : Const kDMDStd_Knock = &H10'), ['DMDStd_16']);
  assert.deepEqual(scriptVolumeKeys('Const kDMDStd_Tilt = 3\nDMDMenu(1).Setup "TILT WARNINGS", kDMDStd_Tilt, 2'), []);
});
