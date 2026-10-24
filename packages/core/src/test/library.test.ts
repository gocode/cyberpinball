import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts, tableFolderName } from '../doctor';
import { applyOps, formatSize, trashDirFor } from '../fileops';
import { classifyArchive, inventory } from '../tablefiles';
import { applyImport, planImport } from '../tableimport';
import { readInfo, removalTargets, scanTables, updateInfo } from '../tables';

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-library-'));
  fs.mkdirSync(path.join(root, 'tables'));
  return root;
}

function write(file: string, content = ''): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const T2_SCRIPT = [
  'Option Explicit',
  "'Const cGameName=\"t2_l6\" ancienne version",
  'Const cGameName="t2_l8",UseSolenoids=2,UseLamps=0',
  'LoadVPM "01560000", "WPC.VBS", 3.26',
  'Sub Table1_Init',
  '  With Controller',
  '    .GameName = cGameName',
  '  End With',
  'End Sub',
].join('\r\n');

test('nom de ROM lu dans le script, commentaires ignorés', () => {
  assert.deepEqual(scriptFacts(T2_SCRIPT), { usesPinmame: true, roms: ['t2_l8'] });
  assert.deepEqual(scriptFacts('Set Controller = CreateObject("VPinMAME.Controller")\nController.GameName = "afm_113b"'), {
    usesPinmame: true,
    roms: ['afm_113b'],
  });
  // Choix entre deux ROM selon une option du script.
  const choice = 'LoadVPM "1", "S11.VBS", 1\nIf UseFree Then cRom = "fp_a" Else cRom = "fp_b"\n.GameName = cRom';
  assert.deepEqual(scriptFacts(choice).roms, ['fp_a', 'fp_b']);
  // Table électromécanique : un cGameName pour les scores, mais pas de PinMAME.
  assert.deepEqual(scriptFacts('Const cGameName = "bigshot"\nSet Controller = CreateObject("B2S.Server")'), { usesPinmame: false, roms: [] });
});

test('dossier du DMD lu dans le script (FlexDMD, UltraDMD)', () => {
  const flex = 'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nWith FlexDMD\r\n  .ProjectFolder = "./TheGooniesDMD/"\r\nEnd With';
  assert.equal(scriptFacts(flex).dmdFolder, 'TheGooniesDMD');
  assert.equal(scriptFacts(String.raw`UltraDMD.SetProjectFolder curDir & "\BattleStar.UltraDMD"`).dmdFolder, 'BattleStar.UltraDMD');
  assert.equal(scriptFacts(String.raw`FlexDMD.ProjectFolder = ".\got.FlexDMD\"`).dmdFolder, 'got.FlexDMD');
  // Chemin construit avec le nom du jeu (Game of Thrones de VPW).
  const got = String.raw`Const myGameName = "gameofthrones"` + '\r\n' + String.raw`  .ProjectFolder = ".\"&myGameName&".FlexDMD\"`;
  assert.equal(scriptFacts(got).dmdFolder, 'gameofthrones.FlexDMD');
  // Une partie inconnue au milieu du chemin : on ne devine pas.
  assert.equal(scriptFacts(String.raw`.ProjectFolder = ".\" & Dossier() & "\"`).dmdFolder, undefined);
  // Commenté, absolu ou dossier de la table lui-même : rien à vérifier.
  assert.equal(scriptFacts(`'.ProjectFolder = "./Ancien/"`).dmdFolder, undefined);
  assert.equal(scriptFacts(String.raw`.ProjectFolder = "C:\DMD\"`).dmdFolder, undefined);
  assert.equal(scriptFacts('.ProjectFolder = "./"').dmdFolder, undefined);
});

test('import : le dossier DMD d’une table existante est rangé sous le nom que charge son script', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'The Goonies (VPW 2021)');
  write(path.join(folder, 'Goonies FR.vpx'));
  const importDir = path.join(root, 'import');
  // Dossier livré avec un autre nom, et un second reconnu par le script seul.
  write(path.join(importDir, 'GooniesDMD', 'goonieintro.gif'));
  write(path.join(importDir, 'GooniesDMD', 'udmd-f7by13-example1.fnt'));
  write(path.join(importDir, 'Extras', 'logo.png'));
  const existing = [{ folder, title: 'The Goonies', roms: [], dmdFolder: 'TheGooniesDMD' }];
  const plan = planImport([{ path: path.join(importDir, 'GooniesDMD'), mode: 'copy' }], { tablesDir, existing });
  assert.deepEqual(
    plan.tables.map((t) => [t.folderName, t.steps.map((s) => [s.kind, s.target])]),
    [['The Goonies (VPW 2021)', [['dmdFolder', 'TheGooniesDMD']]]],
  );
  for (const t of plan.tables) applyImport(t, { trashDir: path.join(root, 'trash', 'i'), cleanupRoots: [importDir] });
  assert.ok(fs.existsSync(path.join(folder, 'TheGooniesDMD', 'goonieintro.gif')));
  const byScript = planImport([{ path: path.join(importDir, 'Extras'), mode: 'copy' }], {
    tablesDir,
    existing: [{ ...existing[0]!, dmdFolder: 'Extras' }],
  });
  assert.deepEqual(byScript.tables.map((t) => t.steps.map((s) => s.target)), [['Extras']]);
  fs.rmSync(root, { recursive: true });
});

test('une archive est une ROM si elle ne contient que des fichiers de puces', () => {
  assert.equal(classifyArchive('t2_l8.zip', ['t2_u12.l8', 't2_u13.l8', 's2_u14.l3']), 'rom');
  assert.equal(classifyArchive('T2.zip', ['Terminator 2/', 'Terminator 2/T2.vpx']), 'pack');
  assert.equal(classifyArchive('T2.zip', ['T2.vpx', 'T2.directb2s', 't2_l8.zip']), 'pack');
  assert.equal(classifyArchive('pack.7z', ['a.bin']), 'pack');
});

test('nom de dossier et tailles lisibles', () => {
  assert.equal(tableFolderName('Terminator 2', 'Williams', 1991), 'Terminator 2 (Williams 1991)');
  assert.equal(tableFolderName('AC/DC: Premium'), 'AC DC Premium');
  assert.equal(formatSize(1033512766), '986 Mo');
  assert.equal(formatSize(4958), '4,8 ko');
});

function brokenTable(root: string): string {
  const t2 = path.join(root, 'tables', 'Terminator 2');
  write(path.join(t2, 'Terminator 2 (Williams 1991) g5k 1.25.vpx'), 'vpx');
  write(path.join(t2, '1492939964_Terminator2(Williams1991)g5kv1.0.directb2s'), 'b2s');
  write(path.join(t2, 'Terminator 2 (Williams 1991) g5k 1.25.vbs'), 'script extrait');
  write(path.join(t2, 'crash.txt'), 'Crash report VPX\nReason: 0xC0000005 - EXCEPTION_ACCESS_VIOLATION at 0033\n');
  write(path.join(t2, 'crash.dmp'), 'x'.repeat(2048));
  write(path.join(t2, 'roms', 't2_l8.zip'), 'rom');
  return t2;
}

test('médecin : constats et corrections sur une table en mauvais état', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const t2 = brokenTable(root);
  const logsDir = path.join(root, 'data', 'logs');
  const [entry] = scanTables(tablesDir);
  const findings = diagnose(entry!, { tablesDir, script: scriptFacts(T2_SCRIPT), logsDir });
  assert.deepEqual(
    findings.map((f) => [f.severity, f.code]),
    [
      ['error', 'romMisplaced'],
      ['warning', 'scriptOverride'],
      ['warning', 'backglassMisnamed'],
      ['warning', 'crashReport'],
      ['info', 'infoMissing'],
    ],
  );
  const crash = findings.find((f) => f.code === 'crashReport')!;
  assert.match(crash.detail, /EXCEPTION_ACCESS_VIOLATION/);
  assert.match(crash.fix!.label, /libère 2,1 ko/);

  const trashDir = trashDirFor(path.join(root, 'trash'), 'Médecin', new Date('2026-10-20T14:00:00Z'));
  for (const f of findings) if (f.fix) applyOps(f.fix.ops, { trashDir });

  assert.ok(fs.existsSync(path.join(t2, 'pinmame', 'roms', 't2_l8.zip')));
  assert.ok(fs.existsSync(path.join(t2, 'Terminator 2.directb2s')));
  assert.ok(!fs.existsSync(path.join(t2, 'crash.dmp')));
  assert.equal(fs.readdirSync(path.join(logsDir, 'plantages')).length, 1);
  // Le script extrait n'est pas détruit : il est dans la corbeille.
  assert.ok(fs.existsSync(path.join(trashDir, 'Terminator 2 (Williams 1991) g5k 1.25.vbs')));
  assert.equal(readInfo(path.join(t2, 'Terminator 2.info')).Info?.Year, 1991);

  // Plus rien à signaler, sauf le dossier « roms » vide laissé derrière.
  const again = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(T2_SCRIPT), logsDir });
  assert.deepEqual(again, []);
  fs.rmSync(root, { recursive: true });
});

test('médecin : ROM absente, backglass inutilisé, table en vrac', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const t2 = path.join(tablesDir, 'Terminator 2');
  write(path.join(t2, 'T2.vpx'));
  write(path.join(t2, 'Terminator 2.directb2s'));
  write(path.join(t2, 'Vieux T2.directb2s'));
  write(path.join(t2, 'Terminator 2.info'), '{}');
  write(path.join(tablesDir, 'Attack from Mars (Bally 1995).vpx'));
  write(path.join(tablesDir, 'Attack from Mars (Bally 1995).directb2s'));
  const [afm, t2entry] = scanTables(tablesDir);

  const t2findings = diagnose(t2entry!, { tablesDir, script: scriptFacts(T2_SCRIPT) });
  assert.deepEqual(t2findings.map((f) => f.code), ['romMissing', 'backglassStray']);
  assert.match(t2findings[0]!.title, /t2_l8/);
  assert.equal(t2findings[0]!.fix, undefined);

  const afmFindings = diagnose(afm!, { tablesDir });
  assert.deepEqual(afmFindings.map((f) => f.code), ['outsideFolder', 'infoMissing']);
  applyOps(afmFindings[0]!.fix!.ops, { trashDir: path.join(root, 'trash', 'x') });
  assert.deepEqual(fs.readdirSync(path.join(tablesDir, 'Attack from Mars (Bally 1995)')).sort(), [
    'Attack from Mars (Bally 1995).directb2s',
    'Attack from Mars (Bally 1995).vpx',
  ]);
  fs.rmSync(root, { recursive: true });
});

test('import : plan d’une archive déballée, renommage du backglass, ROM rangée', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const staging = path.join(root, 'data', 'staging', 'T2');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'), 'vpx');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', '1492939964_Terminator2(Williams1991)g5kv1.0.directb2s'), 'b2s');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', 'Lisez-moi.txt'), 'doc');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', 'crash.txt'), 'vieux plantage');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', 'pupvideos', 'term2', 'screens.pup'), 'pup');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', 'serum', 't2_l8', 't2_l8.cRZ'), 'serum');
  write(path.join(staging, 'Terminator 2 (Williams 1991)', 'music', 'theme.ogg'), 'ogg');
  const importDir = path.join(root, 'import');
  const rom = write(path.join(importDir, 't2_l8.zip'), 'rom');

  const vpxPath = path.join(staging, 'Terminator 2 (Williams 1991)', '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx');
  const plan = planImport(
    [
      { path: staging, label: 'Terminator2.zip', mode: 'move', unpacked: true },
      { path: rom, mode: 'move' },
    ],
    { tablesDir, scripts: new Map([[vpxPath.toLowerCase(), scriptFacts(T2_SCRIPT)]]) },
  );
  assert.equal(plan.tables.length, 1);
  const t = plan.tables[0]!;
  assert.equal(t.folderName, 'Terminator 2 (Williams 1991)');
  assert.equal(t.title, 'Terminator 2');
  assert.ok(t.isNew);
  const targets = Object.fromEntries(t.steps.map((s) => [s.target.split(path.sep).join('/'), s.renamed]));
  assert.deepEqual(targets, {
    '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx': false,
    'Terminator 2 (Williams 1991).directb2s': true,
    'pinmame/roms/t2_l8.zip': false,
    'Lisez-moi.txt': false,
    // Le pack prend le nom que le plugin PUP cherchera : la ROM.
    'pupvideos/t2_l8': true,
    'serum/t2_l8': false,
    'music': false,
  });
  assert.deepEqual(plan.ignored, ['Terminator2.zip › Terminator 2 (Williams 1991) › crash.txt']);
  assert.deepEqual(t.warnings, []);

  applyImport(t, { trashDir: path.join(root, 'trash', 'import'), cleanupRoots: [importDir, path.join(root, 'data', 'staging')] });
  const [entry] = scanTables(tablesDir);
  assert.equal(entry!.title, 'Terminator 2');
  assert.equal(entry!.infoFile, path.join(t.folder, 'Terminator 2 (Williams 1991).info'));
  const inv = inventory(entry!.file, true);
  assert.equal(inv.backglass, 'Terminator 2 (Williams 1991).directb2s');
  assert.deepEqual(inv.roms, ['t2_l8.zip']);
  assert.deepEqual(inv.pup, ['t2_l8']);
  assert.equal(inv.music, 1);
  // Le dossier d'import est vidé, le crash.txt ignoré reste dans le déballage.
  assert.deepEqual(fs.readdirSync(importDir), []);
  assert.deepEqual(diagnose(entry!, { tablesDir, script: scriptFacts(T2_SCRIPT) }), []);
  fs.rmSync(root, { recursive: true });
});

test('import : deux tables en vrac, ROM attribuée par le script, complément pour une table existante', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  // Table déjà installée, à qui il manque sa ROM.
  write(path.join(tablesDir, 'Medieval Madness (Williams 1997)', 'MM.vpx'));
  const importDir = path.join(root, 'import');
  const files = [
    'Terminator 2 (Williams 1991).vpx',
    'Terminator 2 (Williams 1991).directb2s',
    't2_l8.zip',
    'Attack from Mars (Bally 1995) 2.0.vpx',
    'AttackFromMars.directb2s',
    'afm_113b.zip',
    'mm_109c.zip',
    'inconnu.zip',
  ].map((f) => write(path.join(importDir, f), f));
  const scripts = new Map([
    [files[0]!.toLowerCase(), { usesPinmame: true, roms: ['t2_l8'] }],
    [files[3]!.toLowerCase(), { usesPinmame: true, roms: ['afm_113b'] }],
  ]);
  const plan = planImport(
    files.map((f) => ({ path: f, mode: 'copy' as const })),
    { tablesDir, scripts, existing: [{ folder: path.join(tablesDir, 'Medieval Madness (Williams 1997)'), title: 'Medieval Madness', roms: ['mm_109c'] }] },
  );
  const summary = plan.tables.map((t) => [t.folderName, t.isNew, t.steps.map((s) => s.target.split(path.sep).join('/'))]);
  assert.deepEqual(summary, [
    ['Terminator 2 (Williams 1991)', true, ['Terminator 2 (Williams 1991).vpx', 'Terminator 2 (Williams 1991).directb2s', 'pinmame/roms/t2_l8.zip']],
    ['Attack from Mars (Bally 1995)', true, ['Attack from Mars (Bally 1995) 2.0.vpx', 'Attack from Mars (Bally 1995).directb2s', 'pinmame/roms/afm_113b.zip']],
    ['Medieval Madness (Williams 1997)', false, ['pinmame/roms/mm_109c.zip']],
  ]);
  assert.deepEqual(plan.leftovers.map((l) => l.source), ['inconnu.zip']);

  for (const t of plan.tables) applyImport(t, { trashDir: path.join(root, 'trash', 'i'), cleanupRoots: [importDir] });
  // Copie : les fichiers de l'utilisateur sont intacts.
  assert.equal(fs.readdirSync(importDir).length, files.length);
  assert.equal(scanTables(tablesDir).length, 3);
  assert.ok(fs.existsSync(path.join(tablesDir, 'Medieval Madness (Williams 1997)', 'pinmame', 'roms', 'mm_109c.zip')));
  fs.rmSync(root, { recursive: true });
});

test('import : un fichier existant est signalé et part à la corbeille', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'Terminator 2 (Williams 1991)');
  write(path.join(folder, 'Terminator 2 (Williams 1991).vpx'), 'ancienne');
  write(path.join(folder, 'Terminator 2 (Williams 1991).info'), JSON.stringify({ Info: { Title: 'T2 perso', Rating: 9 }, User: { StartCount: 4 } }));
  const src = write(path.join(root, 'import', 'Terminator 2 (Williams 1991).vpx'), 'nouvelle');
  const plan = planImport([{ path: src, mode: 'move' }], {
    tablesDir,
    existing: [{ folder, title: 'T2 perso', roms: [] }],
  });
  const t = plan.tables[0]!;
  assert.equal(t.isNew, false);
  assert.equal(t.steps[0]!.replaces, true);
  const trashDir = path.join(root, 'trash', 'i');
  applyImport(t, { trashDir, cleanupRoots: [path.join(root, 'import')] });
  assert.equal(fs.readFileSync(path.join(folder, 'Terminator 2 (Williams 1991).vpx'), 'utf8'), 'nouvelle');
  assert.equal(fs.readFileSync(path.join(trashDir, 'Terminator 2 (Williams 1991).vpx'), 'utf8'), 'ancienne');
  const info = readInfo(path.join(folder, 'Terminator 2 (Williams 1991).info'));
  assert.equal(info.Info?.Title, 'T2 perso');
  assert.equal(info.User?.StartCount, 4);
  fs.rmSync(root, { recursive: true });
});

test('modification des informations sans perdre les autres champs, suppression vers la corbeille', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'Terminator 2');
  write(path.join(folder, 'A.vpx'));
  write(path.join(folder, 'B.vpx'));
  write(path.join(folder, 'B.ini'));
  write(path.join(folder, 'cache', 'B', 'used_textures.xml'));
  const info = write(path.join(folder, 'Terminator 2.info'), JSON.stringify({ Info: { Title: 'T2', VPSId: 'abc', Authors: ['g5k'] }, User: { StartCount: 3 }, Autre: true }));
  updateInfo(info, { Title: ' Terminator 2 ', Manufacturer: 'Williams', Year: 1991 });
  updateInfo(info, { Manufacturer: '' });
  const after = readInfo(info);
  assert.deepEqual(after.Info, { Title: 'Terminator 2', VPSId: 'abc', Authors: ['g5k'], Year: 1991 });
  assert.equal(after.User?.StartCount, 3);
  assert.equal(after.Autre, true);

  const [a, b] = scanTables(tablesDir);
  const partial = removalTargets(b!, tablesDir);
  assert.equal(partial.whole, false);
  assert.deepEqual(partial.paths.map((p) => path.relative(folder, p)).sort(), ['B.ini', 'B.vpx', path.join('cache', 'B')]);
  const trashDir = path.join(root, 'trash', 'suppr');
  applyOps(partial.paths.map((p) => ({ op: 'trash' as const, path: p })), { trashDir });
  assert.deepEqual(scanTables(tablesDir).map((t) => t.id), ['Terminator 2/A.vpx']);
  const whole = removalTargets(a!, tablesDir);
  assert.deepEqual(whole, { whole: true, paths: [folder] });
  fs.rmSync(root, { recursive: true });
});

test('import : un sous-dossier inconnu du paquet garde sa place à côté de la table', () => {
  // Une table peut charger des fichiers d'un sous-dossier que Cyber Pinball ne connaît pas :
  // les vider à la racine la casse (Goonies de VPW et son dossier TheGooniesDMD).
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const src = path.join(root, 'staging', 'pack');
  write(path.join(src, 'Pack', 'Goonies (VPW 2021).vpx'));
  write(path.join(src, 'Pack', 'Data', 'sprites', 'logo.png'));
  write(path.join(src, 'Pack', 'Extras', 'police.fnt'));
  write(path.join(src, 'Pack', 'lisez-moi.txt'));
  write(path.join(src, 'Ailleurs', 'carte.png'));
  const plan = planImport([{ path: src, mode: 'move', unpacked: true, label: 'Goonies.zip' }], { tablesDir });
  const [table] = plan.tables;
  assert.deepEqual(table!.steps.map((s) => s.target.split(path.sep).join('/')).sort(), [
    'Data/sprites/logo.png',
    'Extras/police.fnt',
    'Goonies (VPW 2021).vpx',
    'carte.png',
    'lisez-moi.txt',
  ]);
  // Hors du dossier de la table dans le paquet : rangé à la racine, et dit.
  assert.ok(table!.warnings.some((w) => w.includes('carte.png') && w.includes('Ailleurs')));
  fs.rmSync(root, { recursive: true });
});

test('médecin : contenu du DMD vidé à la racine, rangé dans son dossier', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'Goonies (VPW 2021)');
  write(path.join(folder, 'Goonies 1.5.vpx'));
  write(path.join(folder, 'goonieintro.gif'));
  write(path.join(folder, 'udmd-f7by13-example1.fnt'));
  // Image nommée comme la table : celle d'un frontend, pas du DMD.
  write(path.join(folder, 'Goonies 1.5.png'));
  const [entry] = scanTables(tablesDir);
  const script = scriptFacts('With FlexDMD\r\n  .ProjectFolder = "./TheGooniesDMD/"\r\nEnd With');
  const finding = diagnose(entry!, { tablesDir, script }).find((f) => f.code === 'dmdFolderMissing');
  assert.ok(finding?.fix, 'une correction est proposée');
  applyOps(finding.fix.ops, { trashDir: path.join(root, 'trash', 'medecin') });
  assert.deepEqual(fs.readdirSync(path.join(folder, 'TheGooniesDMD')).sort(), ['goonieintro.gif', 'udmd-f7by13-example1.fnt']);
  assert.ok(fs.existsSync(path.join(folder, 'Goonies 1.5.png')));
  assert.equal(diagnose(entry!, { tablesDir, script }).some((f) => f.code === 'dmdFolderMissing'), false);
  fs.rmSync(root, { recursive: true });
});
