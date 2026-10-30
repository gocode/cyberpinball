// Records d'une table à ROM (30/10/2026) : le tableau de la machine lu et écrit dans la mémoire de la
// ROM (<rom>.nv), d'après la carte de Pinball Memory Maps, sommes de contrôle et copies en miroir
// comprises (une somme fausse, et la ROM remet ses records d'usine). Seulement dans le double de la
// table (partie en direct) : la mémoire habituelle du joueur ne bouge pas.
//
// Vérifié le 30/10/2026 sur les mémoires de la borne : T2 (134 sommes), Star Trek (73) et The Walking
// Dead (23), toutes justes selon ce calcul ; le tableau écrit, elles le restent.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { cachedRomMemory, folderChanges, folderPrint, newRecords, readRomRecords, romChecksums, writeRomRecords, type GroupRecord, type RomMemory, type TableEntry, type TableRecords } from '../index';

/** WPC (T2, t2_l8.map.json réduite) : GC puis quatre places, scores en BCD sur 5 octets, une somme 16 bits par bloc. */
const WPC: RomMemory = {
  map: {
    _metadata: { platform: 'williams-wpc-8K', validation: { checksum: [{ label: 'High Scores', start: '0x1C61', end: '0x1C82', bits: 16, complement: true }, { label: 'Grand Champion', start: '0x1C83', end: '0x1C8C', bits: 16, complement: true }] } },
    high_scores: [
      { label: 'Grand Champion', initials: { start: 7299, encoding: 'ch', length: 3 }, score: { start: 7302, encoding: 'bcd', length: 5 } },
      { label: 'First Place', initials: { start: 7265, encoding: 'ch', length: 3 }, score: { start: 7268, encoding: 'bcd', length: 5 } },
      { label: 'Second Place', initials: { start: 7273, encoding: 'ch', length: 3 }, score: { start: 7276, encoding: 'bcd', length: 5 } },
      { label: 'Third Place', initials: { start: 7281, encoding: 'ch', length: 3 }, score: { start: 7284, encoding: 'bcd', length: 5 } },
      { label: 'Fourth Place', initials: { start: 7289, encoding: 'ch', length: 3 }, score: { start: 7292, encoding: 'bcd', length: 5 } },
    ],
  } as unknown as RomMemory['map'],
  platform: { endian: 'big', memory_layout: [{ type: 'nvram', address: '0x0000', size: '0x2000' }] },
};

const bcd = (n: number, length: number) => Buffer.from(Array.from({ length }, (_, i) => Math.floor(n / 100 ** (length - 1 - i)) % 100).map((v) => ((Math.floor(v / 10) << 4) | v % 10)));

/** Une somme 16 bits complémentée, comme la ROM l'écrit (indépendante du code testé). */
function seal16(nv: Buffer, start: number, end: number, little: boolean): void {
  let sum = 0;
  for (let i = start; i < end - 1; i++) sum += nv[i]!;
  const value = ~sum & 0xffff;
  if (little) nv.writeUInt16LE(value, end - 1);
  else nv.writeUInt16BE(value, end - 1);
}

function wpcMemory(): Buffer {
  const nv = Buffer.alloc(8238, 0x5a);
  const rows: [number, string, number][] = [[7299, 'AJA', 150_000_000], [7265, 'XAQ', 90_000_000], [7273, 'JUL', 78_320_570], [7281, 'DOC', 70_000_000], [7289, 'JAS', 50_000_000]];
  for (const [at, initials, score] of rows) {
    nv.write(initials, at, 'latin1');
    bcd(score, 5).copy(nv, at + 3);
  }
  seal16(nv, 0x1c61, 0x1c82, false);
  seal16(nv, 0x1c83, 0x1c8c, false);
  return nv;
}

test('WPC : le tableau lu, ses sommes justes ; écrit, les sommes refaites, rien d’autre ne bouge', () => {
  const nv = wpcMemory();
  assert.deepEqual(romChecksums(WPC, nv), [{ label: 'High Scores', ok: true }, { label: 'Grand Champion', ok: true }]);
  assert.deepEqual(readRomRecords(WPC, nv), [
    { rank: 1, score: 150_000_000, initials: 'AJA' },
    { rank: 2, score: 90_000_000, initials: 'XAQ' },
    { rank: 3, score: 78_320_570, initials: 'JUL' },
    { rank: 4, score: 70_000_000, initials: 'DOC' },
    { rank: 5, score: 50_000_000, initials: 'JAS' },
  ]);
  const out = writeRomRecords(WPC, nv, [{ score: 910_000_000, initials: 'ale' }, { score: 2_841_350_120, initials: 'BRU' }])!;
  assert.deepEqual(readRomRecords(WPC, out), [
    { rank: 1, score: 2_841_350_120, initials: 'BRU' },
    { rank: 2, score: 910_000_000, initials: 'ALE' },
    { rank: 3, score: 0 },
    { rank: 4, score: 0 },
    { rank: 5, score: 0 },
  ]);
  assert.ok(romChecksums(WPC, out).every((c) => c.ok));
  for (let i = 0; i < nv.length; i++) if (i < 0x1c61 || i > 0x1c8c) assert.equal(out[i], nv[i], `octet ${i} hors du tableau`);
  assert.equal(nv.readUInt8(7302), bcd(150_000_000, 5)[0], 'la mémoire lue reste telle quelle');
});

test('refus : pas de validation dans la carte, score trop grand pour sa place, mémoire en demi-octets', () => {
  const nv = wpcMemory();
  const noValidation = { ...WPC, map: { ...WPC.map, _metadata: { platform: 'williams-wpc-8K' } } } as RomMemory;
  assert.ok(readRomRecords(noValidation, nv), 'la lecture reste possible');
  assert.equal(writeRomRecords(noValidation, nv, [{ score: 1 }]), undefined);
  assert.equal(writeRomRecords(WPC, nv, [{ score: 10_000_000_000 }]), undefined, '11 chiffres dans 10');
  const nibble = { ...WPC, platform: { memory_layout: [{ type: 'nvram', address: 0, size: '0x2000', nibble: 'low' }] } };
  assert.equal(readRomRecords(nibble, nv), undefined);
  assert.equal(writeRomRecords(nibble, nv, [{ score: 1 }]), undefined);
  const noTable = { ...WPC, map: { ...WPC.map, high_scores: [] } } as RomMemory;
  assert.equal(readRomRecords(noTable, nv), undefined);
});

/** Stern SAM (Star Trek, réduite) : initiales sur 11 octets terminées par un zéro, score sur 4 octets petit-boutiste, une somme par place, et une copie en miroir. */
const SAM: RomMemory = {
  map: {
    _metadata: {
      platform: 'stern-sam',
      validation: {
        checksum: [{ label: 'Champion record {#}', start: '0x02102ED0', repeat: { count: 2, step: 32 }, length: 30, bits: 16, complement: true }],
        mirror: [{ label: 'Copie', start: '0x02102ED0', length: 4, offsets: [0, 64] }],
      },
    },
    high_scores: [
      { label: 'Grand Champion', initials: { encoding: 'ch', null: 'terminate', length: 11, start: '0x2102ED0' }, score: { encoding: 'int', length: 4, start: '0x2102EE8' } },
      { label: 'High Score #1', initials: { encoding: 'ch', null: 'terminate', length: 11, start: '0x2102EF0' }, score: { encoding: 'int', length: 4, start: '0x2102F08' } },
    ],
  } as unknown as RomMemory['map'],
  platform: { endian: 'little', memory_layout: [{ type: 'nvram', address: '0x02100000', size: '0x20000' }] },
};

test('Stern SAM : petit-boutiste, initiales terminées par un zéro, copie en miroir mise à jour avant les sommes', () => {
  const nv = Buffer.alloc(131_118, 0);
  nv.write('SSR', 0x2ed0, 'latin1');
  nv.writeUInt32LE(75_000_000, 0x2ee8);
  nv.write('LON', 0x2ef0, 'latin1');
  nv.writeUInt32LE(55_000_000, 0x2f08);
  seal16(nv, 0x2ed0, 0x2ed0 + 29, true);
  seal16(nv, 0x2ef0, 0x2ef0 + 29, true);
  assert.deepEqual(readRomRecords(SAM, nv), [{ rank: 1, score: 75_000_000, initials: 'SSR' }, { rank: 2, score: 55_000_000, initials: 'LON' }]);
  assert.ok(romChecksums(SAM, nv).every((c) => c.ok));
  const out = writeRomRecords(SAM, nv, [{ score: 2_841_350_120, initials: 'BRU' }])!;
  assert.deepEqual(readRomRecords(SAM, out), [{ rank: 1, score: 2_841_350_120, initials: 'BRU' }, { rank: 2, score: 0 }]);
  assert.deepEqual(romChecksums(SAM, out), [{ label: 'Champion record 1', ok: true }, { label: 'Champion record 2', ok: true }]);
  assert.equal(out.subarray(0x2ed0 + 64, 0x2ed0 + 68).toString('latin1'), 'BRU\0', 'la copie en miroir suit');
});

// ---------------------------------------------------------------------------
// Le double (app/src/table-double.ts) : la carte en cache, la mémoire du double écrite, l'habituelle jamais.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createTableDoubles } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-double.js')) as {
  createTableDoubles(o: object): { start(table: TableEntry, id: string, settings?: unknown, board?: GroupRecord[]): { ok: true; double: { table: TableEntry; records(): TableRecords | undefined; finish(): void } } | { ok: false; reason: string } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Le cache des cartes, comme loadRomMemory le laisse. */
function cache(dir: string): string {
  const at = path.join(dir, 'cartes-memoire');
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'index.json'), JSON.stringify({ t2_l8: 'maps/williams/wpc/t2_l8.map.json' }));
  fs.writeFileSync(path.join(at, 'maps_williams_wpc_t2_l8.map.json'), JSON.stringify(WPC.map));
  fs.writeFileSync(path.join(at, 'platform_williams-wpc-8K.json'), JSON.stringify(WPC.platform));
  return at;
}

test('double : records du groupe dans la mémoire de la ROM du double, score du joueur lu au retour ; la mémoire habituelle ne bouge pas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-records-rom-'));
  const memoryCacheDir = cache(root);
  assert.ok(cachedRomMemory(memoryCacheDir, 'T2_L8'));
  assert.equal(cachedRomMemory(memoryCacheDir, 'autre'), undefined);
  const folder = path.join(root, 'tables', 'Terminator 2');
  fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'pinmame', 'nvram'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2.vpx'), 'table');
  fs.writeFileSync(path.join(folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
  fs.writeFileSync(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv'), wpcMemory());
  const table = { id: 't2', file: path.join(folder, 'Terminator 2.vpx'), folder, title: 'Terminator 2', info: {} } as unknown as TableEntry;
  const before = folderPrint(folder, { full: true });
  const doubles = createTableDoubles({ root: () => root, tablesDir: () => path.join(root, 'tables'), romsOf: () => ['t2_l8'], memoryCacheDir });
  const board: GroupRecord[] = [{ player: 'b', name: 'Bruno', score: 2_841_350_120, initials: 'BRU', at: '', game: 'g' }];
  const started = doubles.start(table, 'partie', undefined, board);
  assert.ok(started.ok);
  const recordsBefore = started.double.records()!;
  assert.deepEqual(recordsBefore.scores.map((s) => s.score), [2_841_350_120, 0, 0, 0, 0]);
  // La partie : la ROM inscrit le score du joueur (dernière place libre) et refait ses sommes.
  const doubleNv = path.join(started.double.table.folder, 'pinmame', 'nvram', 't2_l8.nv');
  fs.writeFileSync(doubleNv, writeRomRecords(WPC, fs.readFileSync(doubleNv), [{ score: 2_841_350_120, initials: 'BRU' }, { score: 312_000_000, initials: 'ALX' }])!);
  assert.deepEqual(newRecords(recordsBefore, started.double.records()), [{ rank: 2, score: 312_000_000, initials: 'ALX' }]);
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), []);
  started.double.finish();
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), []);
  assert.deepEqual(readRomRecords(WPC, fs.readFileSync(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv')))![2], { rank: 3, score: 78_320_570, initials: 'JUL' }, 'le record habituel du joueur est toujours là');
});
