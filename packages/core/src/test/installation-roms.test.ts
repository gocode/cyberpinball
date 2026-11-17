// Reprise d'une installation (PinUP Popper, PinballX, VPinMAME) : le 17/11/2026, un joueur a repris
// 100 tables d'un coup ; plusieurs sont arrivées « sans ROM » alors que la ROM était dans son
// VPinMAME et que la table y tournait. Causes établies sur des installations fictives, une par test :
// - le rompath du registre liste plusieurs dossiers (« a;b ») : seul le premier était lu ;
// - VPinMAME installé loin des tables, connu seulement par son inscription dans Windows ;
// - la ROM est sous un autre nom chez VPinMAME (VPMAlias.txt, ancien nom) : le script demande l'alias ;
// - le script ne nomme pas clairement sa ROM : celle de son menu (Popper, PinballX) n'était pas reprise ;
// - le dossier de la table contient une autre ROM (ancienne révision) : celle de VPinMAME était écartée ;
// - le dossier des ROM est VPinMAME lui-même : son altcolor\<rom> était pris pour la ROM ;
// - VPX joue le .vbs posé à côté de la table, pas le script du .vpx : la ROM était lue au mauvais endroit
//   (vbs.ts, testé dans installation-roms-script.test.ts).
// Et quand la ROM manque vraiment, le plan, puis la fiche de la table, disent où elle a été cherchée.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { romBlockers } from '../doctor';
import { findInstallation, installationCompanions, pinmameRegistryHints, registryDefaultValue, type CompanionFacts, type CompanionReport, type InstallationHints } from '../installation';
import { readTableAliases } from '../romalias';
import { buildZip } from '../romzip';
import { applyImport, planImport, type ImportSource } from '../tableimport';
import { readInfo } from '../tables';

function write(file: string, data: string | Buffer = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

function romZip(file: string, chip = 'cpu.rom'): string {
  const raw = write(path.join(path.dirname(file), '.chips', chip), Buffer.alloc(64, 3));
  write(file, buildZip([{ from: raw, name: chip }]));
  fs.rmSync(path.dirname(raw), { recursive: true });
  return file;
}

/** Une installation PinUP ordinaire (C:\vPinball) : tables, VPinMAME et sa ROM, Cyber Pinball à côté. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-roms-'));
  const vp = path.join(root, 'vPinball');
  const tables = path.join(vp, 'VisualPinball', 'Tables');
  const vpm = path.join(vp, 'VisualPinball', 'VPinMAME');
  write(path.join(vp, 'VisualPinball', 'VPinballX64.exe'));
  fs.mkdirSync(path.join(vpm, 'roms'), { recursive: true });
  const own = path.join(root, 'CyberPinball');
  const library = path.join(own, 'pinmame', 'roms');
  fs.mkdirSync(library, { recursive: true });
  return { root, vp, tables, vpm, own, library };
}

type Setup = ReturnType<typeof setup>;

function companions(s: Setup, vpx: string[], facts: (vpx: string) => CompanionFacts | undefined, hints: InstallationHints = {}) {
  return installationCompanions(
    vpx.map((v): ImportSource => ({ path: v, mode: 'copy' })),
    facts,
    [s.own],
    hints,
  );
}

function plan(s: Setup, sources: ImportSource[], reports: CompanionReport[], scripts: Map<string, CompanionFacts>) {
  return planImport(sources, { tablesDir: path.join(s.own, 'tables'), romLibrary: s.library, scripts: scripts as never, companions: reports });
}

const pinmame = (rom: string): CompanionFacts => ({ usesPinmame: true, roms: [rom] });
const rom = (r: CompanionReport) => r.found.filter((c) => c.part === 'rom').map((c) => c.path);

test('ROM : tous les dossiers du rompath de VPinMAME sont lus, pas seulement le premier', () => {
  const s = setup();
  const vpx = write(path.join(s.tables, 'Medieval Madness (Williams 1997).vpx'));
  const first = path.join(s.root, 'Roms A');
  const second = path.join(s.root, 'Roms B');
  fs.mkdirSync(first, { recursive: true });
  const zip = romZip(path.join(second, 'mm_109c.zip'));
  for (const roms of [`${first};${second}`, [first, second]]) {
    const { reports } = companions(s, [vpx], () => pinmame('mm_109c'), { roms });
    assert.deepEqual(rom(reports[0]!), [zip], String(roms));
    assert.deepEqual(reports[0]!.missing, []);
  }
  // Ce que dit le registre, lu comme « reg query » l'écrit, avec un dossier relatif à VPinMAME et une variable.
  const reg = [
    'HKEY_CURRENT_USER\\Software\\Freeware\\Visual PinMame\\globals',
    `    rompath    REG_SZ    ${first};roms;%CP_ESSAI_ROMS%`,
    `    nvram_directory    REG_SZ    ${path.join(s.vpm, 'nvram')}`,
    '',
  ].join('\r\n');
  const hints = pinmameRegistryHints(reg, `"${path.join(s.vpm, 'VPinMAME64.dll')}"`, { CP_ESSAI_ROMS: second });
  assert.deepEqual(hints.roms, [first, path.join(s.vpm, 'roms'), second]);
  assert.equal(hints.pinmame, s.vpm);
  assert.equal(hints.nvram, path.join(s.vpm, 'nvram'));
  const { reports } = companions(s, [vpx], () => pinmame('mm_109c'), hints);
  assert.deepEqual(rom(reports[0]!), [zip]);
  // Valeur par défaut d'une clé, quelle que soit la langue de Windows.
  assert.equal(registryDefaultValue('\r\nHKEY_CLASSES_ROOT\\VPinMAME.Controller\\CLSID\r\n    (par défaut)    REG_SZ    {F389C8B7-144F-4C63-A2E3-246D168F9D39}\r\n'), '{F389C8B7-144F-4C63-A2E3-246D168F9D39}');
  assert.equal(registryDefaultValue('    (Default)    REG_SZ    C:\\VPinMAME\\VPinMAME.dll'), 'C:\\VPinMAME\\VPinMAME.dll');
  assert.equal(registryDefaultValue('    (Default)    REG_SZ    '), undefined);
});

test('ROM : VPinMAME installé loin des tables, connu par son inscription dans Windows', () => {
  const s = setup();
  fs.rmSync(s.vpm, { recursive: true });
  const vpx = write(path.join(s.tables, 'Attack from Mars (Bally 1995).vpx'));
  const far = path.join(s.root, 'Program Files', 'VPinMAME');
  const zip = romZip(path.join(far, 'roms', 'afm_113b.zip'));
  write(path.join(far, 'altsound', 'afm_113b', 'altsound.csv'));
  const layout = findInstallation(s.tables, [s.own], { pinmame: far })!;
  assert.ok(layout.romDirs.includes(path.join(far, 'roms')), layout.romDirs.join('\n'));
  const { reports } = companions(s, [vpx], () => pinmame('afm_113b'), { pinmame: far });
  assert.deepEqual(rom(reports[0]!), [zip]);
  assert.ok(reports[0]!.found.some((c) => c.part === 'altsound'));
});

test('ROM : sous le nom que lui donne VPinMAME (VPMAlias.txt, ancien nom) ; l’alias suit la table', () => {
  const s = setup();
  const custom = write(path.join(s.tables, 'Pinball Magic (Capcom 1995).vpx'));
  const historic = write(path.join(s.tables, 'Goldfinger (Gottlieb 1996).vpx'));
  write(path.join(s.vpm, 'VPMAlias.txt'), '# alias personnels\r\npmv_x,pmv112\r\n');
  const pm = romZip(path.join(s.vpm, 'roms', 'pmv112.zip'));
  const bond = romZip(path.join(s.vpm, 'roms', 'bond.zip'));
  write(path.join(s.vpm, 'nvram', 'pmv112.nv'));
  const scripts = new Map([
    [custom.toLowerCase(), pinmame('pmv_x')],
    [historic.toLowerCase(), pinmame('goldfinger')],
  ]);
  const { sources, reports } = companions(s, [custom, historic], (v) => scripts.get(v.toLowerCase()));
  const of = (vpx: string) => reports.find((r) => r.vpx === vpx)!;
  assert.deepEqual(rom(of(custom)), [pm]);
  assert.deepEqual(of(custom).romAliases, [{ alias: 'pmv_x', rom: 'pmv112' }]);
  assert.ok(of(custom).found.some((c) => c.part === 'nvram'), 'la sauvegarde du jeu chargé');
  assert.deepEqual(rom(of(historic)), [bond]);
  assert.deepEqual(of(historic).romAliases, [{ alias: 'goldfinger', rom: 'bond' }]);
  assert.deepEqual([...of(custom).missing, ...of(historic).missing], []);

  const p = plan(s, sources, reports, scripts);
  assert.deepEqual(p.roms.map((r) => r.name).sort(), ['bond.zip', 'pmv112.zip']);
  for (const tp of p.tables) {
    assert.equal(tp.romAliases?.length, 1, tp.title);
    assert.ok(!tp.warnings.some((w) => w.includes('ROM')), tp.warnings.join('\n'));
    assert.ok(p.roms.some((r) => r.links.some((l) => l.folder === tp.folder)), `ROM liée dans ${tp.title}`);
  }
  // Installé : pinmame\alias.txt fait charger la ROM reprise ; le médecin n'y voit plus rien de bloquant.
  const ctx = { trashDir: path.join(s.root, 'trash'), cleanupRoots: [] };
  for (const tp of p.tables) applyImport(tp, ctx);
  for (const r of p.roms) for (const op of r.ops) if (op.op === 'link' || op.op === 'copy') write(op.to, fs.readFileSync(op.from));
  const pmTable = p.tables.find((tp) => tp.title.startsWith('Pinball Magic'))!;
  assert.deepEqual(readTableAliases(pmTable.folder).lines, [{ alias: 'pmv_x', rom: 'pmv112' }]);
  assert.deepEqual(romBlockers(pmTable.folder, ['pmv_x'], s.library), []);
});

test('ROM : script sans nom de ROM clair, celle que dit le menu (PinballX) ; jamais pour une table sans PinMAME', () => {
  const s = setup();
  const vpx = write(path.join(s.tables, 'Twilight Zone (Bally 1993).vpx'));
  write(path.join(s.vp, 'PinballX', 'Databases', 'Visual Pinball', 'Visual Pinball.xml'), '<menu>\r\n<game name="Twilight Zone (Bally 1993)">\r\n<rom>tz_94h</rom>\r\n</game>\r\n</menu>');
  const zip = romZip(path.join(s.vpm, 'roms', 'tz_94h.zip'));
  const computed: CompanionFacts = { usesPinmame: true, roms: [] };
  assert.deepEqual(rom(companions(s, [vpx], () => computed).reports[0]!), [zip], 'nom calculé dans le script');
  assert.deepEqual(rom(companions(s, [vpx], () => undefined).reports[0]!), [zip], 'script pas lu');
  const original: CompanionFacts = { usesPinmame: false, roms: [] };
  assert.deepEqual(companions(s, [vpx], () => original).reports.flatMap(rom), [], 'table sans ROM');
});

test('ROM : une autre ROM dans le dossier de la table n’écarte pas celle que le script charge', () => {
  const s = setup();
  const dir = path.join(s.tables, 'Terminator 2 (Williams 1991)');
  const vpx = write(path.join(dir, 'Terminator 2 (Williams 1991).vpx'));
  romZip(path.join(dir, 'VPinMAME', 'roms', 't2_l6.zip'));
  const zip = romZip(path.join(s.vpm, 'roms', 't2_l8.zip'));
  const { sources, reports } = companions(s, [vpx], () => pinmame('t2_l8'));
  assert.deepEqual(rom(reports[0]!), [zip]);
  assert.ok(sources.some((src) => src.path === zip), 'la ROM de VPinMAME est reprise');
  // La même ROM déjà dans son dossier : pas de doublon.
  romZip(path.join(dir, 'VPinMAME', 'roms', 't2_l8.zip'));
  assert.ok(!companions(s, [vpx], () => pinmame('t2_l8')).sources.some((src) => src.path === zip));
});

test('ROM : le dossier des ROM est VPinMAME lui-même, son altcolor ou son altsound n’est jamais pris pour la ROM', () => {
  const s = setup();
  const vpx = write(path.join(s.tables, 'Indiana Jones (Williams 1993).vpx'));
  write(path.join(s.vpm, 'altcolor', 'ij_l7', 'pin2dmd.pal'));
  write(path.join(s.vpm, 'altsound', 'ij_l7', 'altsound.csv'));
  const { reports } = companions(s, [vpx], () => pinmame('ij_l7'), { roms: s.vpm });
  assert.deepEqual(rom(reports[0]!), []);
  assert.equal(reports[0]!.romSearch?.roms[0], 'ij_l7');
  // Une fois la ROM là, elle est trouvée par le même chemin.
  const zip = romZip(path.join(s.vpm, 'roms', 'ij_l7.zip'));
  assert.deepEqual(rom(companions(s, [vpx], () => pinmame('ij_l7'), { roms: s.vpm }).reports[0]!), [zip]);
});

test('ROM : cent tables reprises d’un coup arrivent toutes avec leur ROM', () => {
  const s = setup();
  const scripts = new Map<string, CompanionFacts>();
  const vpx: string[] = [];
  for (let n = 1; n <= 100; n++) {
    const id = String(n).padStart(3, '0');
    const file = write(path.join(s.tables, `Table ${id} (Essai ${1980 + (n % 20)}).vpx`));
    romZip(path.join(s.vpm, 'roms', `r${id}_l1.zip`), `r${id}.bin`);
    scripts.set(file.toLowerCase(), pinmame(`r${id}_l1`));
    vpx.push(file);
  }
  const { sources, reports } = companions(s, vpx, (v) => scripts.get(v.toLowerCase()));
  assert.equal(reports.filter((r) => rom(r).length === 1).length, 100);
  const p = plan(s, sources, reports, scripts);
  assert.equal(p.tables.length, 100);
  assert.equal(p.roms.length, 100);
  for (const tp of p.tables) assert.ok(p.roms.some((r) => r.links.some((l) => l.folder === tp.folder)), tp.title);
});

test('ROM introuvable : le plan dit où elle a été cherchée, la fiche de la table aussi', () => {
  const s = setup();
  const vpx = write(path.join(s.tables, 'Scared Stiff (Bally 1996).vpx'));
  const other = path.join(s.root, 'Autres ROM');
  fs.mkdirSync(other);
  const scripts = new Map([[vpx.toLowerCase(), pinmame('ss_15')]]);
  const { sources, reports } = companions(s, [vpx], (v) => scripts.get(v.toLowerCase()), { roms: [other] });
  const text = reports[0]!.missing.join('\n');
  assert.match(text, /ss_15/);
  assert.ok(text.includes(other) && text.includes(path.join(s.vpm, 'roms')), text);

  const p = plan(s, sources, reports, scripts);
  const tp = p.tables[0]!;
  assert.deepEqual((tp.info.CyberPinball as { RomSearch: unknown }).RomSearch, { Roms: ['ss_15'], Dirs: [other, path.join(s.vpm, 'roms')], From: path.join(s.vp, 'VisualPinball') });
  applyImport(tp, { trashDir: path.join(s.root, 'trash'), cleanupRoots: [] });
  const finding = romBlockers(tp.folder, ['ss_15'], s.library).find((f) => f.code === 'romMissing')!;
  assert.ok(finding, 'ROM absente');
  for (const dir of [path.join(tp.folder, 'pinmame', 'roms'), s.library, other, path.join(s.vpm, 'roms'), s.vp]) assert.ok(finding.detail.includes(dir), `${dir}\n${finding.detail}`);

  // La ROM arrive par une nouvelle reprise : la note disparaît du .info.
  romZip(path.join(other, 'ss_15.zip'));
  const again = companions(s, [vpx], (v) => scripts.get(v.toLowerCase()), { roms: [other] });
  const p2 = plan(s, again.sources, again.reports, scripts);
  assert.equal((p2.tables[0]!.info.CyberPinball as { RomSearch?: unknown } | undefined)?.RomSearch, undefined);
  applyImport(p2.tables[0]!, { trashDir: path.join(s.root, 'trash2'), cleanupRoots: [] });
  assert.equal((readInfo(p2.tables[0]!.infoFile).CyberPinball as { RomSearch?: unknown } | undefined)?.RomSearch, undefined);
});
