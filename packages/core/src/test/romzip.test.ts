// ROM dans un sous-dossier de son zip, déballée, renommée : reconnue d'après son
// contenu, refaite à plat (PinMAME ne lit que les puces à la racine du zip), rangée
// dans la bibliothèque et liée ; jamais éparpillée dans le dossier d'une table.
// Cas réel : Terminator 2, t2_l8.zip › t2_l8 › t2_l8.rom, t2_u14.l3, t2_u15.l3, t2_u18.l3.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
import { diagnose, scriptFacts } from '../doctor';
import { applyOps, sameFile } from '../fileops';
import { layoutOf } from '../locations';
import { buildZip, classifyArchive, readZipEntries, recognizeRomName, romContent } from '../index';
import { applyImport, applyRomImport, planImport, type KnownTable } from '../tableimport';
import { scanTables } from '../tables';

const T2_SCRIPT = 'Const cGameName="t2_l8"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';
const T2_CHIPS: Record<string, string> = {
  't2_l8.rom': 'programme t2 '.repeat(400),
  't2_u14.l3': 'son u14 '.repeat(300),
  't2_u15.l3': 'son u15 '.repeat(300),
  't2_u18.l3': 'son u18 '.repeat(300),
};
const OLD = new Date('1996-12-24T23:32:00Z');

function write(file: string, content: string | Buffer = '', mtime?: Date): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

/** Vrai zip : chaque clé est le chemin dans l'archive (« t2_l8/t2_l8.rom »). */
function zipOf(file: string, files: Record<string, string>, mtime = OLD): string {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-puces-'));
  const members = Object.entries(files).map(([name, content], i) => ({ from: write(path.join(work, String(i)), content, mtime), name }));
  write(file, buildZip(members), mtime);
  fs.rmSync(work, { recursive: true });
  return file;
}

/** Contenu d'un zip, décompressé : chemin dans l'archive → texte. */
function unzip(file: string): Record<string, string> {
  const data = fs.readFileSync(file);
  const out: Record<string, string> = {};
  for (const e of readZipEntries(file) ?? []) {
    const start = e.offset + 30 + data.readUInt16LE(e.offset + 26) + data.readUInt16LE(e.offset + 28);
    const body = data.subarray(start, start + e.compressedSize);
    out[e.name] = (e.method === 8 ? zlib.inflateRawSync(body) : body).toString('utf8');
  }
  return out;
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-romzip-'));
  const layout = layoutOf(root);
  fs.mkdirSync(layout.tables, { recursive: true });
  return { root, layout, trashDir: path.join(layout.trash, 'essai'), done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Terminator 2 installée, sans ROM, comme sur une vraie borne. */
function t2Table(tablesDir: string): KnownTable {
  const folder = path.join(tablesDir, 'Terminator 2 - Judgment Day (Williams 1991)');
  write(path.join(folder, '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'), 'vpx');
  return { folder, title: 'Terminator 2 - Judgment Day', roms: ['t2_l8'] };
}

test('contenu d’une ROM : des puces dans un même dossier, à la racine ou dans un sous-dossier', () => {
  assert.deepEqual(romContent(['t2_l8.rom', 't2_u14.l3']), { dir: '', chips: ['t2_l8.rom', 't2_u14.l3'] });
  assert.deepEqual(romContent(['t2_l8/', 't2_l8/t2_l8.rom', 't2_l8/t2_u14.l3']), { dir: 't2_l8', chips: ['t2_l8/t2_l8.rom', 't2_l8/t2_u14.l3'] });
  assert.equal(romContent(['roms/t2_l8/t2_l8.rom', 'roms/t2_l8/readme.txt', '__MACOSX/roms/._t2_l8.rom'])?.dir, 'roms/t2_l8');
  assert.equal(romContent(['a/t2_l8.rom', 'b/t2_u14.l3']), undefined, 'puces dans deux dossiers : pas une ROM');
  assert.equal(romContent(['T2/T2.vpx', 'T2/t2_l8.rom']), undefined, 'une table : un paquet');
  assert.equal(romContent(['readme.txt']), undefined, 'aucune puce');

  // Archive de ROM : à plat ou dans un sous-dossier ; un paquet de table reste un paquet.
  assert.equal(classifyArchive('t2_l8.zip', ['t2_l8/', 't2_l8/t2_l8.rom', 't2_l8/t2_u14.l3', 't2_l8/t2_u15.l3', 't2_l8/t2_u18.l3']), 'rom');
  assert.equal(classifyArchive('T2_L8.ZIP', ['T2_L8.ROM', 'T2_U14.L3']), 'rom');
  assert.equal(classifyArchive('T2.zip', ['Terminator 2/', 'Terminator 2/T2.vpx', 'Terminator 2/t2_l8.zip']), 'pack');
  assert.equal(classifyArchive('t2_l8.7z', ['t2_l8.rom']), 'pack', 'un 7z est déballé, la ROM refaite en zip à l’import');
});

test('nom d’une ROM : demandé par une table, connu, d’après ses puces ou son archive', () => {
  const hints = { wanted: ['t2_l8', 'afm_113b'], known: new Set(['t2_l6', 'mm_109c']) };
  assert.equal(recognizeRomName({ names: ['t2_l8.zip', 't2_l8'], chips: [] }, hints), 't2_l8');
  assert.equal(recognizeRomName({ names: ['T2_L8.ZIP'], chips: [] }, hints), 't2_l8', 'casse de la table');
  assert.equal(recognizeRomName({ names: ['Terminator 2 ROM.zip', 'rom'], chips: ['t2_l8.rom', 't2_u14.l3'] }, hints), 't2_l8', 'puce nommée comme la ROM');
  assert.equal(recognizeRomName({ names: ['T2 sons.zip'], chips: ['t2_u14.l3', 't2_u15.l3'] }, hints), 't2_l8', 'seule ROM demandée de la famille t2');
  assert.equal(recognizeRomName({ names: ['t2_l6.zip'], chips: ['t2_u14.l3'] }, hints), 't2_l6', 'une autre révision connue garde son nom');
  assert.equal(recognizeRomName({ names: ['Divers'], chips: ['x.bin'] }, hints), undefined);
  assert.equal(recognizeRomName({ names: ['Mes ROM', 'tz_92'], chips: ['x.bin'] }, hints, true), 'tz_92', 'deviné : ressemble à un nom de ROM');
});

test('zip refait : puces à la racine, contenu intact, mêmes octets pour le même contenu', () => {
  const s = sandbox();
  const nested = zipOf(path.join(s.root, 'in', 't2_l8.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`t2_l8/${n}`, c])));
  const members = Object.keys(T2_CHIPS).map((n) => ({ from: nested, entry: `t2_l8/${n}`, name: n }));
  const a = buildZip(members);
  const b = buildZip([...members].reverse());
  assert.ok(a.equals(b), 'déterministe');
  const flat = write(path.join(s.root, 'out', 't2_l8.zip'), a);
  assert.deepEqual(unzip(flat), T2_CHIPS);
  s.done();
});

test('import (cas réel) : t2_l8.zip à sous-dossier rangé à plat dans la bibliothèque, lié, rien d’éparpillé', () => {
  const s = sandbox();
  const t2 = t2Table(s.layout.tables);
  const rom = zipOf(path.join(s.layout.import, 't2_l8.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`t2_l8/${n}`, c])));
  const plan = planImport([{ path: rom, mode: 'move' }], { tablesDir: s.layout.tables, existing: [t2], romLibrary: s.layout.roms });

  assert.deepEqual(plan.leftovers, []);
  assert.equal(plan.roms.length, 1);
  const r = plan.roms[0]!;
  assert.equal(r.name, 't2_l8.zip');
  assert.equal(r.versions[r.keep]!.folder, 't2_l8', 'le plan dit que la ROM était dans un sous-dossier');
  assert.deepEqual(r.recognized.map((x) => x.folder), ['t2_l8']);
  assert.deepEqual(r.links.map((l) => [l.folder, l.state]), [[t2.folder, 'new']]);
  assert.deepEqual(r.ops.map((o) => o.op), ['zip', 'trash', 'link']);
  // Aucune puce n'est rangée dans la table comme « Autre fichier », aucune ROM n'est dite absente.
  for (const tp of plan.tables) {
    assert.deepEqual(tp.steps.filter((st) => st.kind !== 'info'), []);
    assert.deepEqual(tp.warnings.filter((w) => /ROM|racine/.test(w)), []);
  }

  const ctx = { trashDir: s.trashDir, cleanupRoots: [s.layout.import] };
  for (const tp of plan.tables) applyImport(tp, ctx);
  for (const x of plan.roms) applyRomImport(x, ctx);
  const stored = path.join(s.layout.roms, 't2_l8.zip');
  assert.deepEqual(unzip(stored), T2_CHIPS, 'puces à la racine du zip');
  assert.equal(fs.statSync(stored).mtimeMs, OLD.getTime(), 'datée comme l’archive d’origine');
  assert.ok(sameFile(stored, path.join(t2.folder, 'pinmame', 'roms', 't2_l8.zip')));
  assert.deepEqual(fs.readdirSync(t2.folder).sort(), ['1431544526_Terminator2(Williams1991)g5kv1.1d.vpx', 'pinmame'].sort());
  assert.ok(!fs.existsSync(rom), 'le dossier d’import est vidé');
  assert.ok(fs.existsSync(path.join(s.trashDir, 't2_l8.zip')), 'l’archive d’origine est à la corbeille');

  // Le médecin trouve la ROM.
  const entry = scanTables(s.layout.tables)[0]!;
  const codes = diagnose(entry, { tablesDir: s.layout.tables, script: scriptFacts(T2_SCRIPT), romLibrary: s.layout.roms }).map((f) => f.code);
  assert.ok(!codes.some((c) => c.startsWith('rom')), codes.join(', '));

  // La même ROM, zippée autrement (autres dates, autre dossier) : la même version, pas un doublon à trancher.
  const again = zipOf(path.join(s.layout.import, 't2_l8.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`T2_L8/${n}`, c])), new Date('2025-07-02T21:12:00Z'));
  const vr = { ...t2Table(path.join(s.root, 'autres')), folder: path.join(s.layout.tables, 'Terminator 2 VR') };
  write(path.join(vr.folder, 'Terminator 2 VR.vpx'), 'vpx');
  const replan = planImport([{ path: again, mode: 'move' }], { tablesDir: s.layout.tables, existing: [t2, vr], romLibrary: s.layout.roms });
  const same = replan.roms[0]!;
  assert.equal(same.versions.length, 1);
  assert.ok(same.versions[same.keep]!.inLibrary);
  assert.deepEqual(same.recognized.map((x) => [x.folder, x.hash === same.versions[0]!.hash]), [['T2_L8', true]]);
  assert.deepEqual(same.links.map((l) => [path.basename(l.folder), l.state]).sort(), [['Terminator 2 - Judgment Day (Williams 1991)', 'linked'], ['Terminator 2 VR', 'new']]);
  s.done();
});

test('import : ROM renommée, en majuscules, dans un sous-dossier d’un autre nom, zip dans un paquet déballé', () => {
  const s = sandbox();
  const t2 = t2Table(s.layout.tables);
  const opts = { tablesDir: s.layout.tables, existing: [t2], romLibrary: s.layout.roms };
  const plain = (file: string) => planImport([{ path: file, mode: 'copy' }], opts).roms;

  // « Terminator 2 ROM.zip », puces à la racine : le nom vient de la puce t2_l8.rom.
  const renamed = plain(zipOf(path.join(s.root, 'a', 'Terminator 2 ROM.zip'), T2_CHIPS));
  assert.deepEqual(renamed.map((r) => [r.name, r.versions[0]!.renamedFrom, r.ops.map((o) => o.op)]), [['t2_l8.zip', 'Terminator 2 ROM', ['copy', 'link']]]);
  // Majuscules : le nom que demande la table.
  assert.deepEqual(plain(zipOf(path.join(s.root, 'b', 'T2_L8.ZIP'), T2_CHIPS)).map((r) => r.name), ['t2_l8.zip']);
  // Sous-dossier « ROM Terminator 2\files » : refaite à plat sous le nom demandé.
  const deep = plain(zipOf(path.join(s.root, 'c', 'T2.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`ROM Terminator 2/files/${n}`, c]))));
  assert.deepEqual(deep.map((r) => [r.name, r.versions[0]!.folder]), [['t2_l8.zip', 'ROM Terminator 2/files']]);

  // Paquet de table déballé (.7z, .rar) : la ROM zippée à sous-dossier qu'il contient, et ses puces libres.
  const pack = path.join(s.root, 'staging', '0');
  write(path.join(pack, 'Terminator 2 VPW', 'Terminator 2 VPW.vpx'), 'vpx');
  zipOf(path.join(pack, 'Terminator 2 VPW', 't2_l8.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`t2_l8/${n}`, c])));
  const vpx = path.join(pack, 'Terminator 2 VPW', 'Terminator 2 VPW.vpx');
  const scripts = new Map([[vpx.toLowerCase(), scriptFacts(T2_SCRIPT)]]);
  const inPack = planImport([{ path: pack, label: 'T2 VPW.7z', mode: 'move', unpacked: true }], { ...opts, scripts });
  assert.deepEqual(inPack.roms.map((r) => [r.name, r.versions[0]!.folder, r.links.length]), [['t2_l8.zip', 't2_l8', 2]]);
  // Le dossier de travail est effacé après l'import : rien à mettre à la corbeille.
  assert.deepEqual(inPack.roms[0]!.ops.map((o) => o.op), ['zip', 'link', 'link']);
  assert.ok(!inPack.tables.some((tp) => tp.steps.some((st) => st.kind === 'other')));
  s.done();
});

test('import : ROM déballée (dossier de puces, 7z de ROM) refaite en zip ; sans bibliothèque, dans pinmame\\roms', () => {
  const s = sandbox();
  const t2 = t2Table(s.layout.tables);
  // t2_l8.7z déballé : ses puces dans « t2_l8 ».
  const unpacked = path.join(s.root, 'staging', '1');
  for (const [n, c] of Object.entries(T2_CHIPS)) write(path.join(unpacked, 't2_l8', n), c, OLD);
  const plan = planImport([{ path: unpacked, label: 't2_l8.7z', mode: 'move', unpacked: true }], { tablesDir: s.layout.tables, existing: [t2], romLibrary: s.layout.roms });
  assert.deepEqual(plan.roms.map((r) => [r.name, r.versions[0]!.folder, r.ops.map((o) => o.op)]), [['t2_l8.zip', 't2_l8', ['zip', 'link']]]);
  const ctx = { trashDir: s.trashDir, cleanupRoots: [path.join(s.root, 'staging')] };
  for (const x of plan.roms) applyRomImport(x, ctx);
  assert.deepEqual(unzip(path.join(s.layout.roms, 't2_l8.zip')), T2_CHIPS);

  // Dossier de puces dans un paquet, sans bibliothèque : le zip à plat va dans la table.
  const pack = path.join(s.root, 'pack');
  write(path.join(pack, 'Terminator 2.vpx'), 'vpx');
  for (const [n, c] of Object.entries(T2_CHIPS)) write(path.join(pack, 'roms', 't2_l8', n), c, OLD);
  const scripts = new Map([[path.join(pack, 'Terminator 2.vpx').toLowerCase(), scriptFacts(T2_SCRIPT)]]);
  const alone = planImport([{ path: pack, mode: 'copy' }], { tablesDir: path.join(s.root, 'autres'), scripts });
  const tp = alone.tables[0]!;
  const step = tp.steps.find((st) => st.kind === 'rom')!;
  assert.equal(step.target, path.join('pinmame', 'roms', 't2_l8.zip'));
  assert.ok(step.zip && !step.zip.trashSource, 'copie : l’original reste où il est');
  assert.ok(!tp.steps.some((st) => st.kind === 'other'));
  applyImport(tp, { trashDir: s.trashDir, cleanupRoots: [] });
  assert.deepEqual(unzip(step.to), T2_CHIPS);
  s.done();
});

test('médecin : puces éparpillées à la racine de la table (cas réel), réparées en un geste', () => {
  const s = sandbox();
  const t2 = t2Table(s.layout.tables);
  for (const [n, c] of Object.entries(T2_CHIPS)) write(path.join(t2.folder, n), c, OLD);
  // Ce qui ne fait pas partie de la ROM reste en place.
  for (const other of ['t2_l8_0.vgm', 'altsound.log', '1431544526_Terminator2(Williams1991)g5kv1.1d.ini']) write(path.join(t2.folder, other), 'autre');
  fs.mkdirSync(s.layout.roms, { recursive: true });
  const ctx = () => ({ tablesDir: s.layout.tables, script: scriptFacts(T2_SCRIPT), romLibrary: s.layout.roms });

  const findings = diagnose(scanTables(s.layout.tables)[0]!, ctx());
  const scattered = findings.find((f) => f.code === 'romScattered')!;
  assert.equal(scattered.severity, 'error');
  assert.ok(!findings.some((f) => f.code === 'romMissing'), 'pas « absente » : elle est là, éparpillée');
  assert.match(scattered.detail, /t2_u14\.l3/);
  assert.ok(scattered.fix);
  applyOps(scattered.fix.ops, { trashDir: s.trashDir });

  const stored = path.join(s.layout.roms, 't2_l8.zip');
  assert.deepEqual(unzip(stored), T2_CHIPS);
  assert.ok(sameFile(stored, path.join(t2.folder, 'pinmame', 'roms', 't2_l8.zip')));
  for (const n of Object.keys(T2_CHIPS)) {
    assert.ok(!fs.existsSync(path.join(t2.folder, n)), `${n} retiré de la table`);
    assert.ok(fs.existsSync(path.join(s.trashDir, n)), `${n} à la corbeille`);
  }
  for (const other of ['t2_l8_0.vgm', 'altsound.log']) assert.ok(fs.existsSync(path.join(t2.folder, other)), other);
  const after = diagnose(scanTables(s.layout.tables)[0]!, ctx()).map((f) => f.code);
  assert.ok(!after.some((c) => c.startsWith('rom')), after.join(', '));
  s.done();
});

test('médecin : dossier de puces dans la table, puces restées alors que la ROM est là, zip à sous-dossier', () => {
  const s = sandbox();
  const t2 = t2Table(s.layout.tables);
  const ctx = () => ({ tablesDir: s.layout.tables, script: scriptFacts(T2_SCRIPT), romLibrary: s.layout.roms });
  const codes = () => diagnose(scanTables(s.layout.tables)[0]!, ctx());
  const fix = (code: string) => {
    const f = codes().find((x) => x.code === code);
    assert.ok(f?.fix, `${code} attendu`);
    applyOps(f.fix.ops, { trashDir: s.trashDir });
  };

  // Dossier « t2_l8 » (ancien import qui gardait le sous-dossier) : refait en zip, dossier à la corbeille.
  for (const [n, c] of Object.entries(T2_CHIPS)) write(path.join(t2.folder, 't2_l8', n), c, OLD);
  fix('romScattered');
  assert.ok(!fs.existsSync(path.join(t2.folder, 't2_l8')));
  assert.deepEqual(unzip(path.join(s.layout.roms, 't2_l8.zip')), T2_CHIPS);

  // La ROM est là, des puces traînent encore : simple nettoyage.
  write(path.join(t2.folder, 't2_u14.l3'), 'reste');
  const leftover = codes().find((f) => f.code === 'romScattered')!;
  assert.equal(leftover.severity, 'info');
  assert.deepEqual(leftover.fix!.ops.map((o) => o.op), ['trash']);

  // Zip à sous-dossier posé à la main dans pinmame\roms : PinMAME ne le lit pas.
  fs.rmSync(path.join(t2.folder, 't2_u14.l3'));
  fs.rmSync(path.join(s.layout.roms, 't2_l8.zip'));
  const own = path.join(t2.folder, 'pinmame', 'roms', 't2_l8.zip');
  fs.rmSync(own);
  zipOf(own, Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`t2_l8/${n}`, c])));
  fix('romNested');
  assert.deepEqual(unzip(own), T2_CHIPS);
  assert.ok(sameFile(own, path.join(s.layout.roms, 't2_l8.zip')), 'rangée dans la bibliothèque et liée');
  assert.ok(!codes().some((f) => f.code.startsWith('rom')));

  // Zip à sous-dossier mal rangé à la racine de la table : refait à plat, pas déplacé tel quel.
  fs.rmSync(path.join(t2.folder, 'pinmame'), { recursive: true });
  fs.rmSync(path.join(s.layout.roms, 't2_l8.zip'));
  zipOf(path.join(t2.folder, 't2_l8.zip'), Object.fromEntries(Object.entries(T2_CHIPS).map(([n, c]) => [`t2_l8/${n}`, c])));
  fix('romMisplaced');
  assert.deepEqual(unzip(path.join(t2.folder, 'pinmame', 'roms', 't2_l8.zip')), T2_CHIPS);
  assert.ok(!fs.existsSync(path.join(t2.folder, 't2_l8.zip')));
  assert.ok(!codes().some((f) => f.code.startsWith('rom')));
  s.done();
});
