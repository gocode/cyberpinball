// LED d'une partie : une table n'est « à ROM » (port des LED rendu à DOF de VPX) que si PinMAME la joue
// vraiment (app/src/led-rom.ts). Retour d'essai du 26/11/2026 : depuis 0.2.4-essai.42, une table originale
// dont le script recopie du code de contrôleur VPinMAME sans ROM passait « à ROM » et restait muette.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { scriptFacts } from '../index';

interface LedRomModule {
  romZipPresent(roms: readonly string[], dirs: readonly (string | undefined)[]): boolean;
  ledsHaveRom(roms: readonly string[], dirs: readonly (string | undefined)[], remembered?: boolean): boolean;
  rememberedPinmame(dataDir: string, table: string): boolean | undefined;
  rememberPinmame(dataDir: string, table: string, pinmame: boolean): void;
  scanVpxLog(text: string): { pinmame: boolean; startup: boolean };
  watchPinmame(o: { logFile: string; fromOffset: number; onVerdict(p: boolean): void; graceMs?: number; maxMs?: number; pollMs?: number }): { stop(): void };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rom = require(path.resolve(__dirname, '../../../../app/dist/led-rom.js')) as LedRomModule;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Extraits écrits pour l'essai, sur le modèle des scripts réels.
const SCRIPTS = {
  // Table originale qui recopie le chargement du contrôleur PinMAME, sans nom de ROM (Stranger Things).
  embeddedController: [
    'Sub LoadVPM(VPMver, VBSfile, VBSver)',
    '  On Error Resume Next',
    '  Set Controller = CreateObject("VPinMAME.Controller")',
    'End Sub',
    'Sub DOF(dofevent, dofstate)',
    'End Sub',
  ].join('\r\n'),
  // Tables originales en B2S.Server (Space Cadet, The Matrix, City Hunter, Goonies).
  original: (name: string) => [`Const cGameName = "${name}"`, 'Set Controller = CreateObject("B2S.Server")', 'Controller.B2SName = cGameName', 'Controller.Run'].join('\r\n'),
  // Tables à ROM (Addams Family, Medieval Madness, Indiana Jones).
  pinmame: (name: string) => [`Const cGameName = "${name}"`, 'LoadVPM "01560000", "WPC.VBS", 3.26', 'Sub Table1_Init', '  With Controller', '    .GameName = cGameName', '    .Run', '  End With', 'End Sub'].join('\r\n'),
};

function folders(): { dir: string; table: string; tableRoms: string; library: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-led-rom-'));
  const table = path.join(dir, 'Table');
  const tableRoms = path.join(table, 'pinmame', 'roms');
  const library = path.join(dir, 'pinmame', 'roms');
  fs.mkdirSync(tableRoms, { recursive: true });
  fs.mkdirSync(library, { recursive: true });
  return { dir, table, tableRoms, library };
}

const decide = (script: string, dirs: string[], remembered?: boolean) => {
  const facts = scriptFacts(script);
  return rom.ledsHaveRom(facts.roms, dirs, remembered);
};

test('LED « à ROM » : un nom de ROM ET son zip là où PinMAME le cherche ; le seul appel de VPinMAME ne suffit plus', () => {
  const { dir, tableRoms, library } = folders();
  const dirs = [tableRoms, library];
  // Sans ROM : jamais « à ROM », contrôleur recopié ou non.
  assert.equal(scriptFacts(SCRIPTS.embeddedController).usesPinmame, true, 'le script appelle bien VPinMAME');
  assert.equal(decide(SCRIPTS.embeddedController, dirs), false, 'contrôleur recopié sans ROM : effets sans ROM');
  for (const name of ['jpspacecadetGE', 'TheMatrix', 'City_Hunter', 'goonies']) assert.equal(decide(SCRIPTS.original(name), dirs), false, name);
  // À ROM : seulement avec le zip, dans le dossier de la table ou dans la bibliothèque.
  assert.equal(decide(SCRIPTS.pinmame('taf_l7'), dirs), false, 'ROM nommée mais absente : PinMAME ne démarrera pas');
  fs.writeFileSync(path.join(tableRoms, 'taf_l7.zip'), '');
  fs.writeFileSync(path.join(library, 'mm_109c.zip'), '');
  fs.writeFileSync(path.join(library, 'ij_l7.zip'), '');
  assert.equal(decide(SCRIPTS.pinmame('taf_l7'), dirs), true, 'Addams : zip dans le dossier de la table');
  assert.equal(decide(SCRIPTS.pinmame('mm_109c'), dirs), true, 'Medieval Madness : zip dans la bibliothèque');
  assert.equal(decide(SCRIPTS.pinmame('ij_l7'), [undefined, ...dirs] as string[]), true, 'Indiana Jones ; dossier inconnu ignoré');
  // Ce qu'une partie a montré passe avant le zip, dans les deux sens.
  assert.equal(decide(SCRIPTS.pinmame('taf_l7'), dirs, false), false);
  assert.equal(decide(SCRIPTS.embeddedController, dirs, true), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('LED « à ROM » : le constat d’une partie est gardé par table, oublié dès que le fichier de la table change', () => {
  const { dir, table } = folders();
  const vpx = path.join(table, 'Table.vpx');
  fs.writeFileSync(vpx, 'v1');
  const data = path.join(dir, 'data');
  assert.equal(rom.rememberedPinmame(data, vpx), undefined);
  rom.rememberPinmame(data, vpx, false);
  assert.equal(rom.rememberedPinmame(data, vpx), false);
  assert.equal(rom.rememberedPinmame(data, vpx.toUpperCase()), false, 'chemin sans casse (Windows)');
  assert.ok(fs.existsSync(path.join(data, 'led-roms.json')));
  fs.writeFileSync(vpx, 'version 2, plus longue');
  assert.equal(rom.rememberedPinmame(data, vpx), undefined, 'table changée : constat à refaire');
  rom.rememberPinmame(data, vpx, true);
  assert.equal(rom.rememberedPinmame(data, vpx), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('LED « à ROM » : vpinball.log dit si PinMAME a démarré ; un journal muet ne change rien', async () => {
  assert.deepEqual(rom.scanVpxLog('2026-11-26 09:01:02.123 INFO [plugin] New PinMAME game started: taf_l7\r\n'), { pinmame: true, startup: false });
  assert.deepEqual(rom.scanVpxLog('2026-11-26 09:01:05.000 INFO Startup done\r\n'), { pinmame: false, startup: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpxlog-'));
  const log = path.join(dir, 'vpinball.log');
  // La partie d'avant avait PinMAME : ignorée, seul ce qui suit le lancement compte.
  fs.writeFileSync(log, 'New PinMAME game started: mm_109c\r\nStartup done\r\n');
  const run = async (append: string[], o: { graceMs?: number; maxMs?: number } = {}) => {
    const verdicts: boolean[] = [];
    const w = rom.watchPinmame({ logFile: log, fromOffset: fs.statSync(log).size, onVerdict: (p) => verdicts.push(p), pollMs: 10, graceMs: o.graceMs ?? 60, maxMs: o.maxMs ?? 2000 });
    for (const line of append) {
      fs.appendFileSync(log, line);
      await wait(30);
    }
    await wait(150);
    w.stop();
    return verdicts;
  };
  assert.deepEqual(await run(['Loading table from C:\\Tables\\Stranger.vpx\r\n', 'Startup done\r\n']), [false], 'table démarrée sans PinMAME');
  assert.deepEqual(await run(['Loading table\r\n', 'New PinMAME ', 'game started: taf_l7\r\n', 'Startup done\r\n']), [true], 'PinMAME, même sur une ligne coupée entre deux lectures');
  assert.deepEqual(await run(['Startup done\r\n', 'New PinMAME game started: taf_l7\r\n'], { graceMs: 500 }), [true], 'PinMAME écrit juste après « Startup done »');
  assert.deepEqual(await run(['Loading table\r\n'], { maxMs: 50 }), [], 'jamais démarrée : aucun verdict');
  // Journal recommencé par VPX : relu du début.
  fs.writeFileSync(log, 'x'.repeat(10_000));
  const verdicts: boolean[] = [];
  const w = rom.watchPinmame({ logFile: log, fromOffset: fs.statSync(log).size, onVerdict: (p) => verdicts.push(p), pollMs: 10, graceMs: 30 });
  fs.writeFileSync(log, 'Startup done\r\n');
  await wait(150);
  w.stop();
  assert.deepEqual(verdicts, [false]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('LED « à ROM » : les scripts réels des tables de la borne d’essai (tmp/vbs-led, s’ils sont là) sont tous sans ROM', { skip: !fs.existsSync(path.resolve(__dirname, '../../../../tmp/vbs-led')) && 'scripts absents' }, () => {
  const dir = path.resolve(__dirname, '../../../../tmp/vbs-led');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.vbs'))) {
    const facts = scriptFacts(fs.readFileSync(path.join(dir, f), 'latin1'));
    assert.equal(rom.ledsHaveRom(facts.roms, []), false, f);
  }
});
