// Bibliothèque de ROM : une ROM stockée une fois dans <racine>\pinmame\roms, un
// lien physique dans le pinmame\roms de chaque table qui la joue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyOps, linkFile, sameFile } from '../fileops';
import { layoutOf } from '../locations';
import { missingRoms, planRomMigration, romSpace, scanRomLibrary, unusedRoms, type RomTable } from '../romlibrary';
import { applyImport, applyRomImport, planImport, type KnownTable } from '../tableimport';

function write(file: string, content = '', mtime?: Date): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

function link(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.linkSync(from, to);
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-roms-'));
  const layout = layoutOf(root);
  fs.mkdirSync(layout.tables, { recursive: true });
  const trashDir = path.join(layout.trash, 'essai');
  return { root, layout, trashDir, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const OLD = new Date('2024-01-01T12:00:00Z');
const NEW = new Date('2026-06-01T12:00:00Z');
const T2 = 'ROM t2_l8 '.repeat(1000);
const T2_PATCHED = 'ROM t2_l8 corrigee '.repeat(1000);

/** Table installée avec, éventuellement, une ROM dans pinmame\roms. */
function table(tablesDir: string, name: string, roms: string[] | undefined, files: Record<string, string> = {}, mtime = OLD): RomTable {
  const folder = path.join(tablesDir, name);
  write(path.join(folder, `${name}.vpx`), 'vpx');
  for (const [file, content] of Object.entries(files)) write(path.join(folder, 'pinmame', 'roms', file), content, mtime);
  return { folder, title: name, roms };
}

const romOf = (t: RomTable, name: string) => path.join(t.folder, 'pinmame', 'roms', name);

test('lien physique : même fichier ; copie identique supprimée, autre contenu à la corbeille', () => {
  const s = sandbox();
  const from = write(path.join(s.layout.roms, 't2_l8.zip'), T2);
  const fresh = path.join(s.layout.tables, 'A', 'pinmame', 'roms', 't2_l8.zip');
  assert.equal(linkFile(from, fresh, { trashDir: s.trashDir }), 'linked');
  assert.ok(sameFile(from, fresh));
  assert.equal(linkFile(from, fresh, { trashDir: s.trashDir }), 'unchanged');
  const copy = write(path.join(s.layout.tables, 'B', 'pinmame', 'roms', 't2_l8.zip'), T2);
  applyOps([{ op: 'link', from, to: copy }], { trashDir: s.trashDir });
  assert.ok(sameFile(from, copy));
  assert.ok(!fs.existsSync(s.trashDir), 'une copie identique ne va pas à la corbeille');
  const other = write(path.join(s.layout.tables, 'C', 'pinmame', 'roms', 't2_l8.zip'), T2_PATCHED);
  applyOps([{ op: 'link', from, to: other }], { trashDir: s.trashDir });
  assert.ok(sameFile(from, other));
  assert.equal(fs.readFileSync(path.join(s.trashDir, 't2_l8.zip'), 'utf8'), T2_PATCHED);
  s.done();
});

test('vue globale : tables de chaque ROM, inutilisées, absentes, place sur le disque', () => {
  const s = sandbox();
  write(path.join(s.layout.roms, 't2_l8.zip'), T2);
  write(path.join(s.layout.roms, 'oubliee.zip'), 'vieille ROM');
  const tables = [
    table(s.layout.tables, 'Terminator 2', ['t2_l8']),
    table(s.layout.tables, 'Terminator 2 mod', ['t2_l8'], { 't2_l8.zip': T2 }),
    table(s.layout.tables, 'Attack from Mars', ['afm_113b']),
    // Script pas encore lu : sa ROM n'est connue que parce qu'elle est dans son dossier.
    table(s.layout.tables, 'Medieval Madness', undefined, { 'mm_109c.zip': 'ROM mm' }),
    // Deux ROM au choix : celle qu'elle a suffit.
    table(s.layout.tables, 'Funhouse', ['fh_l9', 'fh_l9b'], { 'fh_l9b.zip': 'ROM fh' }),
  ];
  link(path.join(s.layout.roms, 't2_l8.zip'), romOf(tables[0]!, 't2_l8.zip'));
  const scan = scanRomLibrary(s.layout.roms, tables);
  const t2 = scan.entries.find((e) => e.key === 't2_l8')!;
  assert.deepEqual(
    t2.uses.map((u) => [u.table.title, u.state]),
    [
      ['Terminator 2', 'linked'],
      ['Terminator 2 mod', 'copy'],
    ],
  );
  assert.deepEqual(unusedRoms(scan).map((e) => e.name), ['oubliee']);
  assert.deepEqual(missingRoms(scan).map((e) => [e.name, e.uses.map((u) => u.table.title)]), [['afm_113b', ['Attack from Mars']]]);
  assert.ok(!scan.entries.some((e) => e.key === 'fh_l9'), 'une ROM au choix déjà présente n’est pas « absente »');
  assert.deepEqual(scan.unread.map((t) => t.title), ['Medieval Madness']);
  assert.deepEqual(scan.entries.find((e) => e.key === 'mm_109c')!.uses.map((u) => u.state), ['outside']);
  // t2 compté une fois pour la bibliothèque et son lien, une fois pour la copie.
  const space = romSpace(scan);
  assert.equal(space.files, 6);
  assert.equal(space.logical - space.physical, T2.length);
  s.done();
});

test('migration : une ROM par nom dans la bibliothèque, des liens à la place des copies', () => {
  const s = sandbox();
  const t2 = table(s.layout.tables, 'Terminator 2', ['t2_l8'], { 't2_l8.zip': T2 });
  const t2mod = table(s.layout.tables, 'Terminator 2 mod', ['t2_l8'], { 't2_l8.zip': T2 });
  const t2fr = table(s.layout.tables, 'Terminator 2 FR', ['t2_l8'], { 't2_l8.zip': T2 });
  // Une autre version plus ancienne, et une table qui attend la ROM sans l'avoir.
  const t2old = table(s.layout.tables, 'Terminator 2 ancien', ['t2_l8'], { 't2_l8.zip': T2_PATCHED }, OLD);
  const t2new = table(s.layout.tables, 'Terminator 2 nouvelle', ['t2_l8']);
  for (const t of [t2, t2mod, t2fr]) fs.utimesSync(romOf(t, 't2_l8.zip'), NEW, NEW);
  const afm = table(s.layout.tables, 'Attack from Mars', ['afm_113b'], { 'afm_113b.zip': 'ROM afm' });
  const tables = [t2, t2mod, t2fr, t2old, t2new, afm];

  const before = romSpace(scanRomLibrary(s.layout.roms, tables));
  const plan = planRomMigration(scanRomLibrary(s.layout.roms, tables));
  const item = plan.items.find((i) => i.key === 't2_l8')!;
  assert.equal(item.versions.length, 2);
  assert.equal(item.versions[item.keep]!.hash, item.versions[0]!.hash, 'la plus récente est gardée');
  assert.ok(item.stores, 'la version gardée entre dans la bibliothèque');
  assert.equal(item.links.length, 5);
  assert.equal(item.freed, 2 * T2.length, 'deux copies identiques libérées');
  assert.equal(item.trashed, T2_PATCHED.length);
  assert.equal(plan.crossVolume.length, 0);

  for (const i of plan.items) applyOps(i.ops, { trashDir: s.trashDir });
  const stored = path.join(s.layout.roms, 't2_l8.zip');
  for (const t of [t2, t2mod, t2fr, t2old, t2new]) assert.ok(sameFile(stored, romOf(t, 't2_l8.zip')), t.title);
  assert.ok(sameFile(path.join(s.layout.roms, 'afm_113b.zip'), romOf(afm, 'afm_113b.zip')));
  assert.equal(fs.readFileSync(path.join(s.trashDir, 't2_l8.zip'), 'utf8'), T2_PATCHED);
  const after = romSpace(scanRomLibrary(s.layout.roms, tables));
  assert.equal(before.physical - after.physical, 2 * T2.length + T2_PATCHED.length);
  // Une fois rangé, plus rien à faire.
  assert.deepEqual(planRomMigration(scanRomLibrary(s.layout.roms, tables)).items, []);
  s.done();
});

test('migration : la version choisie l’emporte, même plus ancienne, et remplace celle de la bibliothèque', () => {
  const s = sandbox();
  write(path.join(s.layout.roms, 't2_l8.zip'), T2, NEW);
  const t2 = table(s.layout.tables, 'Terminator 2', ['t2_l8']);
  link(path.join(s.layout.roms, 't2_l8.zip'), romOf(t2, 't2_l8.zip'));
  const t2old = table(s.layout.tables, 'Terminator 2 ancien', ['t2_l8'], { 't2_l8.zip': T2_PATCHED }, OLD);
  const scan = scanRomLibrary(s.layout.roms, [t2, t2old]);
  const first = planRomMigration(scan).items[0]!;
  assert.equal(first.versions[first.keep]!.inLibrary, true);
  const older = first.versions.find((v) => !v.inLibrary)!;
  const plan = planRomMigration(scan, new Map([['t2_l8', older.hash]]));
  const item = plan.items[0]!;
  assert.ok(item.decided);
  // Le lien de Terminator 2 pointait sur l'ancienne version de la bibliothèque : il est refait.
  assert.equal(item.links.length, 2);
  applyOps(item.ops, { trashDir: s.trashDir });
  const stored = path.join(s.layout.roms, 't2_l8.zip');
  assert.equal(fs.readFileSync(stored, 'utf8'), T2_PATCHED);
  assert.ok(sameFile(stored, romOf(t2, 't2_l8.zip')));
  assert.ok(sameFile(stored, romOf(t2old, 't2_l8.zip')));
  assert.equal(fs.readFileSync(path.join(s.trashDir, 't2_l8.zip'), 'utf8'), T2);
  s.done();
});

test('import : la ROM va à la bibliothèque et se lie dans toutes les tables qui la jouent', () => {
  const s = sandbox();
  const t2 = table(s.layout.tables, 'Terminator 2 (Williams 1991)', ['t2_l8']);
  const t2copy = table(s.layout.tables, 'Terminator 2 mod', ['t2_l8'], { 't2_l8.zip': T2 });
  const afm = table(s.layout.tables, 'Attack from Mars (Bally 1995)', ['afm_113b']);
  const existing: KnownTable[] = [t2, t2copy, afm].map((t) => ({ folder: t.folder, title: t.title, roms: t.roms! }));
  // Nouvelle table qui joue la même ROM, et la ROM elle-même, dans le dossier d'import.
  write(path.join(s.layout.import, 'Terminator 2 VPW', 'Terminator 2 VPW.vpx'), 'vpx');
  const rom = write(path.join(s.layout.import, 't2_l8.zip'), T2, NEW);
  const vpx = path.join(s.layout.import, 'Terminator 2 VPW', 'Terminator 2 VPW.vpx');
  const scripts = new Map([[vpx.toLowerCase(), { usesPinmame: true, roms: ['t2_l8'] }]]);
  const sources = [
    { path: path.join(s.layout.import, 'Terminator 2 VPW'), mode: 'move' as const },
    { path: rom, mode: 'move' as const },
  ];
  const plan = planImport(sources, { tablesDir: s.layout.tables, existing, scripts, romLibrary: s.layout.roms });
  assert.equal(plan.roms.length, 1);
  const r = plan.roms[0]!;
  assert.equal(r.to, path.join(s.layout.roms, 't2_l8.zip'));
  assert.deepEqual(
    r.links.map((l) => [path.basename(l.folder), l.state]).sort(),
    [
      ['Terminator 2 (Williams 1991)', 'new'],
      ['Terminator 2 VPW', 'new'],
      ['Terminator 2 mod', 'copy'],
    ],
  );
  // La nouvelle table ne signale pas de ROM manquante : elle la reçoit de la bibliothèque.
  const fresh = plan.tables.find((t) => t.isNew)!;
  assert.deepEqual(fresh.warnings, []);
  assert.ok(!fresh.steps.some((st) => st.kind === 'rom'));

  const ctx = { trashDir: s.trashDir, cleanupRoots: [s.layout.import] };
  for (const t of plan.tables) applyImport(t, ctx);
  for (const x of plan.roms) applyRomImport(x, ctx);
  const stored = path.join(s.layout.roms, 't2_l8.zip');
  for (const l of r.links) assert.ok(sameFile(stored, l.to), l.title);
  assert.ok(!fs.existsSync(rom));
  assert.ok(!fs.existsSync(path.join(afm.folder, 'pinmame')), 'une table qui joue une autre ROM n’est pas touchée');
  s.done();
});

test('import : ROM différente de celle de la bibliothèque, la plus récente gagne, ou celle choisie', () => {
  const s = sandbox();
  write(path.join(s.layout.roms, 't2_l8.zip'), T2, OLD);
  const t2 = table(s.layout.tables, 'Terminator 2', ['t2_l8']);
  link(path.join(s.layout.roms, 't2_l8.zip'), romOf(t2, 't2_l8.zip'));
  const existing: KnownTable[] = [{ folder: t2.folder, title: t2.title, roms: ['t2_l8'] }];
  const rom = write(path.join(s.layout.import, 't2_l8.zip'), T2_PATCHED, NEW);
  const sources = [{ path: rom, mode: 'move' as const }];
  const opts = { tablesDir: s.layout.tables, existing, romLibrary: s.layout.roms };

  const plan = planImport(sources, opts);
  const r = plan.roms[0]!;
  assert.equal(r.versions.length, 2);
  assert.equal(r.versions[r.keep]!.inLibrary, false, 'l’importée, plus récente, gagne');
  assert.deepEqual(r.links.map((l) => l.state), ['different']);

  // Choix inverse : la bibliothèque garde la sienne, l'importée va à la corbeille.
  const stored = r.versions.find((v) => v.inLibrary)!;
  const kept = planImport(sources, { ...opts, romChoices: new Map([['t2_l8', stored.hash]]) });
  const k = kept.roms[0]!;
  assert.equal(k.versions[k.keep]!.inLibrary, true);
  assert.deepEqual(k.links.map((l) => l.state), ['linked']);
  assert.deepEqual(k.unused.map((u) => u.from), [rom]);

  const ctx = { trashDir: s.trashDir, cleanupRoots: [s.layout.import] };
  applyRomImport(r, ctx);
  const file = path.join(s.layout.roms, 't2_l8.zip');
  assert.equal(fs.readFileSync(file, 'utf8'), T2_PATCHED);
  assert.ok(sameFile(file, romOf(t2, 't2_l8.zip')));
  assert.equal(fs.readFileSync(path.join(s.trashDir, 't2_l8.zip'), 'utf8'), T2);
  s.done();
});

test('import : une ROM déjà dans la bibliothèque est liée dans la nouvelle table, une ROM orpheline y est rangée', () => {
  const s = sandbox();
  write(path.join(s.layout.roms, 'afm_113b.zip'), 'ROM afm');
  const vpx = write(path.join(s.layout.import, 'Attack from Mars (Bally 1995).vpx'), 'vpx');
  const scripts = new Map([[vpx.toLowerCase(), { usesPinmame: true, roms: ['afm_113b'] }]]);
  const plan = planImport([{ path: vpx, mode: 'copy' }], { tablesDir: s.layout.tables, scripts, romLibrary: s.layout.roms });
  assert.deepEqual(plan.roms.map((r) => [r.name, r.versions.length, r.links.map((l) => l.state)]), [['afm_113b.zip', 1, ['new']]]);
  assert.deepEqual(plan.tables[0]!.warnings, []);

  // Sans table qui l'attende, la ROM entre quand même dans la bibliothèque.
  const lone = write(path.join(s.layout.import, 'mm_109c.zip'), 'ROM mm');
  const alone = planImport([{ path: lone, mode: 'copy' }], { tablesDir: s.layout.tables, romLibrary: s.layout.roms });
  assert.deepEqual(alone.leftovers, []);
  assert.deepEqual(alone.roms.map((r) => [r.name, r.links.length, r.ops.map((o) => o.op)]), [['mm_109c.zip', 0, ['copy']]]);
  s.done();
});
