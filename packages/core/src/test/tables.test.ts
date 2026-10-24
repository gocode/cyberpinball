import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseTableName, readInfo, recordPlay, scanTables } from '../tables';

function tablesFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-tables-'));
  const t2 = path.join(dir, 'Terminator 2');
  fs.mkdirSync(t2);
  fs.writeFileSync(path.join(t2, 'Terminator 2 (Williams 1991) g5k 1.25.vpx'), '');
  fs.writeFileSync(path.join(t2, '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'), '');
  fs.writeFileSync(path.join(t2, 'Terminator 2.directb2s'), '');
  const af = path.join(dir, 'Attack from Mars (Bally 1995)');
  fs.mkdirSync(af);
  fs.writeFileSync(path.join(af, 'AFM.vpx'), '');
  fs.writeFileSync(path.join(af, 'Attack from Mars (Bally 1995).info'), JSON.stringify({ Info: { Title: 'Attack from Mars' }, Custom: 1 }));
  fs.writeFileSync(path.join(dir, 'Vrac.vpx'), '');
  return dir;
}

test('découpe titre, fabricant, année et version, et retire le préfixe VPUniverse', () => {
  assert.deepEqual(parseTableName('Terminator 2 (Williams 1991) g5k 1.25'), {
    title: 'Terminator 2',
    manufacturer: 'Williams',
    year: 1991,
    rest: 'g5k 1.25',
  });
  assert.deepEqual(parseTableName('1431544526_Terminator2(Williams1991)g5kv1.1d'), {
    title: 'Terminator2',
    manufacturer: 'Williams',
    year: 1991,
    rest: 'g5kv1.1d',
  });
  assert.deepEqual(parseTableName('Table maison'), { title: 'Table maison' });
});

test('inventaire : un fichier .vpx = une entrée, titre lisible pris du dossier ou du .info', () => {
  const dir = tablesFixture();
  const tables = scanTables(dir);
  assert.deepEqual(
    tables.map((t) => [t.title, t.manufacturer, t.year, t.version]),
    [
      ['Attack from Mars', 'Bally', 1995, 'AFM'],
      ['Terminator 2', 'Williams', 1991, 'g5k 1.25'],
      ['Terminator 2', 'Williams', 1991, 'g5kv1.1d'],
      ['Vrac', undefined, undefined, undefined],
    ],
  );
  assert.equal(tables[0]!.id, 'Attack from Mars (Bally 1995)/AFM.vpx');
  assert.ok(tables[0]!.infoFile.endsWith('Attack from Mars (Bally 1995).info'));
  fs.rmSync(dir, { recursive: true });
});

test('statistiques ajoutées au .info sans perdre les autres champs', () => {
  const dir = tablesFixture();
  const afm = scanTables(dir)[0]!;
  recordPlay(afm, new Date('2026-10-20T12:00:00Z'), 95.4);
  recordPlay(afm, new Date('2026-10-20T13:00:00Z'), 60);
  const info = readInfo(afm.infoFile);
  assert.equal(info.User?.StartCount, 2);
  assert.equal(info.User?.RunTime, 155);
  assert.equal(info.User?.LastRun, '2026-10-20T13:00:00.000Z');
  assert.equal(info.Custom, 1);
  assert.equal(info.Info?.Title, 'Attack from Mars');

  const t2 = scanTables(dir)[1]!;
  recordPlay(t2, new Date(), 10);
  assert.ok(fs.existsSync(path.join(dir, 'Terminator 2', 'Terminator 2 (Williams 1991) g5k 1.25.info')));
  fs.rmSync(dir, { recursive: true });
});
