// Dossier du DMD (UltraDMD, FlexDMD) d'une table rangée dans son propre dossier (18/11/2026, signalé par un
// utilisateur : « les tables qui ont un dossier UltraDMD ne fonctionnent pas, le dossier reste dans le dossier
// Tables »). VPX 10.8 fait du dossier de la table le dossier courant avant de compiler le script (PinTable::Play) :
// un script en curDir y trouve son dossier. Invariants : ranger une table en vrac emporte son dossier du DMD ; un
// dossier resté à la racine du dossier des tables, ou chez une autre version de la table, est retrouvé et rangé ;
// un script qui le cherche dans TablesDirectory (le dossier Tables de VPX, jamais celui de la table) le cherche,
// dans le .vbs de Cyber Pinball, dans le dossier de la table, lignes à leur place, table jamais modifiée.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { applyCompatFixes, compatFixesApplied, compatFixesFound } from '../scriptcompat';
import { readScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

const CURDIR_SCRIPT = String.raw`Dim curDir : curDir = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".")` + '\r\n' + String.raw`UltraDMD.SetProjectFolder curDir & "\Addams.UltraDMD"` + '\r\n';
const TABLESDIR_SCRIPT = String.raw`Set UltraDMD = CreateObject("UltraDMD.DMDObject")` + '\r\n' + String.raw`UltraDMD.SetProjectFolder TablesDirectory & "\Addams.UltraDMD"` + '\r\n';

function tmp(): { root: string; tablesDir: string; trash: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ultradmd-'));
  const tablesDir = path.join(root, 'Tables');
  fs.mkdirSync(tablesDir);
  return { root, tablesDir, trash: path.join(root, 'corbeille') };
}

function write(file: string, content: string | Buffer = ''): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('ranger une table en vrac emporte son dossier du DMD, même nommé autrement que la table', () => {
  const { root, tablesDir, trash } = tmp();
  write(path.join(tablesDir, 'Addams Family (Bally 1992).vpx'));
  write(path.join(tablesDir, 'Addams.UltraDMD', 'intro.gif'));
  write(path.join(tablesDir, 'Addams Family (Bally 1992).FlexDMD', 'logo.png'));
  // Dossier d'une autre table, à laisser en place.
  write(path.join(tablesDir, 'Autre.UltraDMD', 'x.gif'));
  const [entry] = scanTables(tablesDir);
  const finding = diagnose(entry!, { tablesDir, script: scriptFacts(CURDIR_SCRIPT) }).find((f) => f.code === 'outsideFolder');
  assert.ok(finding?.fix);
  applyOps(finding.fix.ops, { trashDir: trash });
  const folder = path.join(tablesDir, 'Addams Family (Bally 1992)');
  assert.deepEqual(fs.readdirSync(folder).sort(), ['Addams Family (Bally 1992).FlexDMD', 'Addams Family (Bally 1992).vpx', 'Addams.UltraDMD']);
  assert.ok(fs.existsSync(path.join(folder, 'Addams.UltraDMD', 'intro.gif')));
  assert.ok(fs.existsSync(path.join(tablesDir, 'Autre.UltraDMD', 'x.gif')));
  // Rangée avec son dossier : plus rien à dire du DMD.
  const after = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(CURDIR_SCRIPT) });
  assert.equal(after.some((f) => f.code === 'dmdFolderMissing'), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('dossier du DMD resté à la racine du dossier des tables : retrouvé et rangé avec la table', () => {
  const { root, tablesDir, trash } = tmp();
  const folder = path.join(tablesDir, 'Addams Family (Bally 1992)');
  write(path.join(folder, 'Addams Family (Bally 1992).vpx'));
  write(path.join(tablesDir, 'Addams.UltraDMD', 'intro.gif'));
  const script = scriptFacts(CURDIR_SCRIPT);
  const finding = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script }).find((f) => f.code === 'dmdFolderMissing');
  assert.ok(finding?.fix, 'une correction est proposée');
  assert.match(finding.detail, /racine du dossier des tables/);
  assert.deepEqual(finding.fix.ops.map((o) => o.op), ['move']);
  applyOps(finding.fix.ops, { trashDir: trash });
  assert.ok(fs.existsSync(path.join(folder, 'Addams.UltraDMD', 'intro.gif')));
  assert.equal(fs.existsSync(path.join(tablesDir, 'Addams.UltraDMD')), false);
  assert.equal(diagnose(scanTables(tablesDir)[0]!, { tablesDir, script }).some((f) => f.code === 'dmdFolderMissing'), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('dossier du DMD chez une autre version de la table : copié, l’autre le garde', () => {
  const { root, tablesDir, trash } = tmp();
  const v1 = path.join(tablesDir, 'Addams Family (Bally 1992)');
  const v2 = path.join(tablesDir, 'Addams Family (Bally 1992) VR');
  write(path.join(v1, 'Addams Family (Bally 1992).vpx'));
  write(path.join(v1, 'Addams.UltraDMD', 'intro.gif'));
  write(path.join(v2, 'Addams Family VR.vpx'));
  const script = scriptFacts(CURDIR_SCRIPT);
  const entry = scanTables(tablesDir).find((e) => e.folder === v2)!;
  const finding = diagnose(entry, { tablesDir, script }).find((f) => f.code === 'dmdFolderMissing');
  assert.ok(finding?.fix);
  assert.deepEqual(finding.fix.ops.map((o) => o.op), ['copy']);
  applyOps(finding.fix.ops, { trashDir: trash });
  assert.ok(fs.existsSync(path.join(v2, 'Addams.UltraDMD', 'intro.gif')));
  assert.ok(fs.existsSync(path.join(v1, 'Addams.UltraDMD', 'intro.gif')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('dossier du DMD introuvable : constat sans réparation, comme avant', () => {
  const { root, tablesDir } = tmp();
  write(path.join(tablesDir, 'Addams Family (Bally 1992)', 'Addams Family (Bally 1992).vpx'));
  const finding = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(CURDIR_SCRIPT) }).find((f) => f.code === 'dmdFolderMissing');
  assert.ok(finding);
  assert.equal(finding.fix, undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test('TablesDirectory : repéré quand il mène au dossier du DMD, seulement là', () => {
  assert.deepEqual(compatFixesFound(scriptCode(TABLESDIR_SCRIPT)), ['tablesDirectoryDmd']);
  assert.deepEqual(scriptFacts(TABLESDIR_SCRIPT).coreCompat, ['tablesDirectoryDmd']);
  assert.equal(scriptFacts(TABLESDIR_SCRIPT).dmdFolder, 'Addams.UltraDMD');
  // Par une variable.
  const variable = 'Dim dmdDir\r\ndmdDir = TablesDirectory & "Addams.UltraDMD"\r\nWith FlexDMD\r\n  .ProjectFolder = dmdDir\r\nEnd With\r\n';
  assert.deepEqual(compatFixesFound(scriptCode(variable)), ['tablesDirectoryDmd']);
  // Le dossier courant : rien à corriger.
  assert.deepEqual(compatFixesFound(scriptCode(CURDIR_SCRIPT)), []);
  // TablesDirectory pour autre chose que le DMD, en commentaire ou dans une chaîne : rien.
  assert.deepEqual(compatFixesFound(scriptCode('x = TablesDirectory & "scores.txt"\r\nUltraDMD.SetProjectFolder curDir & "\\A.UltraDMD"\r\n')), []);
  assert.deepEqual(compatFixesFound(scriptCode('UltraDMD.SetProjectFolder curDir & "\\A.UltraDMD" \' TablesDirectory\r\n')), []);
  assert.deepEqual(compatFixesFound(scriptCode('UltraDMD.SetProjectFolder curDir & "\\TablesDirectory.UltraDMD"\r\n')), []);
});

test('TablesDirectory : corrigé ligne pour ligne, une seule fois', () => {
  const fixed = applyCompatFixes(TABLESDIR_SCRIPT, ['tablesDirectoryDmd'])!;
  const before = TABLESDIR_SCRIPT.split('\r\n');
  const after = fixed.split('\r\n');
  assert.equal(after[0], before[0]);
  assert.equal(after[1], String.raw`UltraDMD.SetProjectFolder CyberPinball_TableDir() & "\Addams.UltraDMD"`);
  assert.deepEqual(compatFixesApplied(fixed), ['tablesDirectoryDmd']);
  assert.equal(applyCompatFixes(fixed, ['tablesDirectoryDmd']), fixed, 'déjà là : rien de plus');
});

test('TablesDirectory : exécuté, le chemin devient le dossier courant, celui de la table', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ultradmd-run-'));
  const table = [
    'Dim TablesDirectory : TablesDirectory = "C:\\VPX\\Tables\\"',
    'Class FakeDmd : Public Folder : Public Sub SetProjectFolder(f) : Folder = f : End Sub : End Class',
    'Dim UltraDMD : Set UltraDMD = New FakeDmd',
    'Dim p',
    'p = TablesDirectory & "Addams.UltraDMD"',
    'UltraDMD.SetProjectFolder p',
    '',
  ].join('\r\n');
  const run = (script: string) => {
    const file = path.join(dir, 'table.vbs');
    fs.writeFileSync(file, `${script}\r\nWScript.Echo UltraDMD.Folder\r\n`, 'latin1');
    const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { cwd: dir, encoding: 'latin1', windowsHide: true, timeout: 60_000 });
    assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
    return result.stdout.trim();
  };
  assert.equal(run(table), 'C:\\VPX\\Tables\\Addams.UltraDMD');
  assert.equal(run(applyCompatFixes(table, ['tablesDirectoryDmd'])!).toLowerCase(), path.join(dir, 'Addams.UltraDMD').toLowerCase());
  fs.rmSync(dir, { recursive: true, force: true });
});

test('médecin : DMD cherché dans TablesDirectory, réparé avant la partie, table jamais modifiée', () => {
  const { root, tablesDir, trash } = tmp();
  const name = 'Addams Family (Bally 1992)';
  const folder = path.join(tablesDir, name);
  write(path.join(folder, 'Addams.UltraDMD', 'intro.gif'));
  const vpx = path.join(folder, `${name}.vpx`);
  const table = vpxWithScript(TABLESDIR_SCRIPT);
  write(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(TABLESDIR_SCRIPT) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat avec réparation attendu');
  assert.equal(finding.title, 'DMD cherché hors du dossier de la table');
  assert.match(finding.detail, /Addams\.UltraDMD/);
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: trash });
  const vbs = fs.readFileSync(path.join(folder, `${name}.vbs`), 'latin1');
  assert.match(vbs, /SetProjectFolder CyberPinball_TableDir\(\) & "\\Addams\.UltraDMD"/);
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['tablesDirectoryDmd']);
  assert.ok(fs.readFileSync(vpx).equals(table));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
  fs.rmSync(root, { recursive: true, force: true });
});
