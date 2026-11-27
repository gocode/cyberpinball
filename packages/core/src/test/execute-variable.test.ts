// Commandes rangées dans un texte puis exécutées par « Execute <variable> » (27/11/2026, rapport d'un joueur sous McAfee :
// Guardians of the Galaxy, « Execute qCmd » dans RunQueue à chaque scène). Execute compile le texte à chaque appel et
// Windows le fait analyser par son antivirus pendant que la partie attend. Invariants : le médecin repère ces Execute ;
// VPX joue un .vbs où chacun passe d'abord par une Sub compilée une fois (lignes à leur place, table jamais modifiée) ;
// le script fait exactement ce qu'il faisait (même sortie avec et sans correctif, exécuté par cscript), y compris un texte
// qui nomme une variable de la procédure (laissé à Execute), un texte qui en exécute un autre, et une erreur sous
// On Error Resume Next (le texte n'est pas refait). Un .vbs écrit par une version précédente des correctifs est refait.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyCompatFixes, COMPAT_VERSION, compatFixesApplied, compatFixesFound } from '../scriptcompat';
import { buildScriptPatch, readScriptPatch, SCRIPT_PATCH_MARK, scriptPatchState } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

/** Une table qui range des commandes dans une file et les exécute (de la forme de RunQueue, Guardians of the Galaxy). */
const TABLE = [
  'Dim said : said = ""',
  'Dim queue(9), n : n = 0',
  'Sub Say(x) : said = said & x & "," : End Sub',
  'Sub Push(c) : queue(n) = c : n = n + 1 : End Sub',
  'Sub RunQueue(bNewItem)',
  '  Dim qCmd, i',
  '  For i = 0 To n - 1',
  '    qCmd = queue(i)',
  '    Execute qCmd',
  '  Next',
  'End Sub',
  'Sub RunLocal(x)',
  '  Dim cmd : cmd = "Say x"',
  '  Execute cmd \' nomme le paramètre x : laissé à Execute',
  'End Sub',
  'Sub RunError',
  '  On Error Resume Next',
  '  Dim c : c = "Say ""e1"" : Inconnue : Say ""e2"""',
  '  Execute c',
  '  said = said & "err" & Err.Number & ","',
  'End Sub',
  'Push "Say ""a""" : Push "Say ""b"" : Say ""c""" : Push "Say n" : Push "RunLocal ""in"""',
  'RunQueue True : RunQueue False : RunLocal "loc" : RunError : RunError',
  '',
].join('\r\n');

/** Exécute le script (corrigé ou non) par cscript. */
function run(script: string, tail = ''): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-execute-'));
  const file = path.join(dir, 'table.vbs');
  fs.writeFileSync(file, `${script}\r\n${tail}\r\nWScript.Echo said\r\n`, 'latin1');
  const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
  return result.stdout.trim().replace(/\r\n/g, ' ');
}

test('repérage : Execute d’une variable dans une procédure ; pas dans une Class, un With, ni d’un texte écrit tel quel', () => {
  assert.deepEqual(compatFixesFound(scriptCode(TABLE)), ['executeOnce']);
  assert.deepEqual(scriptFacts(TABLE).coreCompat, ['executeOnce']);
  const found = (code: string) => compatFixesFound(scriptCode(code));
  assert.deepEqual(found('Class Q\r\n  Sub Run\r\n    Execute mCmd\r\n  End Sub\r\nEnd Class\r\n'), []);
  assert.deepEqual(found('Sub Run\r\n  With Obj\r\n    Execute c\r\n  End With\r\nEnd Sub\r\n'), []);
  assert.deepEqual(found('Sub Run\r\n  Execute "Say 1"\r\nEnd Sub\r\n'), []);
  assert.deepEqual(found('Sub Run\r\n  Execute a & b\r\nEnd Sub\r\n'), []);
  assert.deepEqual(found('Sub Run(c) : Execute c : End Sub\r\n'), []);
  assert.deepEqual(found('Execute c\r\n'), [], 'hors procédure : rien');
  assert.deepEqual(found('Sub Run\r\n  \' Execute c\r\nEnd Sub\r\n'), []);
  assert.deepEqual(found('Private Function Run(ByVal c)\r\n  execute c\r\nEnd Function\r\n'), ['executeOnce']);
});

test('correction : seules les lignes d’Execute changent, ligne pour ligne, avec la garde de leur procédure ; une seule fois', () => {
  const fixed = applyCompatFixes(TABLE, ['executeOnce'])!;
  const before = TABLE.split('\r\n');
  const after = fixed.split('\r\n');
  const changed = before.flatMap((line, i) => (i < before.length - 1 && line !== after[i] ? [i] : []));
  assert.deepEqual(changed, [8, 13, 18]);
  assert.equal(after[8], '    CyberPinball_Execute qCmd, "bnewitem|qcmd|i" : If Not CyberPinball_Compile_Done Then Execute qCmd');
  assert.equal(after[13], '  CyberPinball_Execute cmd, "x|cmd" : If Not CyberPinball_Compile_Done Then Execute cmd \' nomme le paramètre x : laissé à Execute');
  // « said = … » : un nom auquel la procédure donne une valeur est gardé, même global (prudence : Execute pour lui).
  assert.equal(after[18], '  CyberPinball_Execute c, "c|said" : If Not CyberPinball_Compile_Done Then Execute c');
  assert.deepEqual(compatFixesApplied(fixed), ['executeOnce']);
  assert.equal(applyCompatFixes(fixed, ['executeOnce']), fixed, 'déjà là : rien de plus');
  // Avec les minuteries en texte : un seul moteur de compilation.
  const both = applyCompatFixes(`${TABLE}Sub LoadVPM : ExecuteGlobal GetTextFile("core.vbs") : End Sub\r\nSub T : vpmTimer.AddTimer 1, "Say 1" : End Sub\r\n`, ['timerTextOnce', 'executeOnce'])!;
  assert.equal(both.match(/^Function CyberPinball_Compile\(/gm)?.length, 1);
});

test('exécuté : même effet qu’avant ; une erreur n’exécute pas le texte deux fois', { skip: process.platform !== 'win32' }, () => {
  const original = run(TABLE);
  assert.equal(original, 'a,b,c,4,in,a,b,c,4,in,loc,e1,err13,e1,err13,');
  const fixed = applyCompatFixes(TABLE, ['executeOnce'])!;
  assert.equal(run(fixed), original, 'même sortie avec le correctif');
  // Compilés : « Say "a" », « Say "b" : Say "c" », « Say n » (n est global), « RunLocal "in" », le texte de RunError ;
  // pas « Say x » (paramètre de RunLocal).
  assert.equal(run(fixed, 'said = CyberPinball_Compile_Count'), '5');
});

test('exécuté : sans On Error, l’erreur du texte arrête l’appelant comme Execute', { skip: process.platform !== 'win32' }, () => {
  const table = TABLE.replace('  On Error Resume Next\r\n', '').replace(
    'RunQueue True : RunQueue False : RunLocal "loc" : RunError : RunError',
    'On Error Resume Next : RunError : said = said & "top" & Err.Number & "," : Err.Clear : RunError : said = said & "top" & Err.Number & ","',
  );
  const original = run(table);
  assert.equal(original, 'e1,top13,e1,top13,');
  assert.equal(run(applyCompatFixes(table, ['executeOnce'])!), original);
});

test('médecin : constat « Script qui arrête la partie à chaque commande exécutée », réparé avant la partie, table jamais modifiée', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-execute-'));
  const name = 'Guardians (Original 2023)';
  const folder = path.join(tablesDir, name);
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, `${name}.vpx`);
  const table = vpxWithScript(TABLE);
  fs.writeFileSync(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(TABLE) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat avec réparation attendu');
  assert.equal(finding.title, 'Script qui arrête la partie à chaque commande exécutée');
  assert.match(finding.detail, /antivirus/);
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  const vbs = fs.readFileSync(path.join(folder, `${name}.vbs`), 'latin1');
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['executeOnce']);
  assert.equal(readScriptPatch(vbs)?.compatVersion, COMPAT_VERSION);
  assert.equal(buildScriptPatch(TABLE, [], undefined, undefined, ['executeOnce']), vbs);
  assert.ok(fs.readFileSync(vpx).equals(table));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
});

/** Un .vbs tel qu'une version précédente l'écrivait : correctifs donnés, sans compatVersion, texte d'alors. */
function olderPatch(script: string, compat: Parameters<typeof buildScriptPatch>[4]): string {
  const now = buildScriptPatch(script, [], undefined, undefined, compat)!;
  const lines = now.split('\r\n');
  const at = lines.findIndex((l) => l.startsWith(SCRIPT_PATCH_MARK));
  const patch = JSON.parse(lines[at]!.slice(SCRIPT_PATCH_MARK.length)) as Record<string, unknown>;
  delete patch.compatVersion;
  lines[at] = `${SCRIPT_PATCH_MARK}${JSON.stringify(patch)}`;
  // Le texte de jadis : une ligne du moteur qui n'est plus la même.
  return lines.join('\r\n').replace('Function CyberPinball_Compile(aCode', 'Function CyberPinball_Compile(  aCode');
}

test('version des correctifs : un .vbs écrit par une version précédente est refait, avec ceux qu’elle a appris depuis', () => {
  const script = `${TABLE}Sub LoadVPM : ExecuteGlobal GetTextFile("core.vbs") : End Sub\r\nSub T : vpmTimer.AddTimer 1, "Say 1" : End Sub\r\n`;
  assert.deepEqual(compatFixesFound(scriptCode(script)), ['timerTextOnce', 'executeOnce']);
  const old = olderPatch(script, ['timerTextOnce']);
  const state = scriptPatchState(old, script);
  assert.equal(state.kind, 'stale');
  assert.ok(state.kind === 'stale' && state.older);
  assert.equal(state.kind === 'stale' && state.content, buildScriptPatch(script, [], undefined, undefined, ['timerTextOnce', 'executeOnce']));
  // Écrit par la version actuelle puis modifié à la main : venu d'ailleurs, comme avant.
  const now = buildScriptPatch(script, [], undefined, undefined, ['timerTextOnce'])!;
  assert.equal(scriptPatchState(now, script).kind, 'ours');
  assert.equal(scriptPatchState(now.replace('Sub T :', 'Sub T  :'), script).kind, 'foreign');
});

test('médecin : un .vbs écrit par une version précédente est signalé (info) et refait avant la partie', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-execute-'));
  const name = 'Guardians (Original 2023)';
  const folder = path.join(tablesDir, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${name}.vpx`), vpxWithScript(TABLE));
  const file = path.join(folder, `${name}.vbs`);
  fs.writeFileSync(file, olderPatch(TABLE, ['executeOnce']), 'latin1');
  const ctx = { tablesDir, script: scriptFacts(TABLE) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptPatchStale');
  assert.equal(finding?.severity, 'info');
  assert.equal(finding?.title, 'Script adapté par une version précédente de Cyber Pinball');
  assert.ok(finding?.fix);
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  assert.equal(fs.readFileSync(file, 'latin1'), buildScriptPatch(TABLE, [], undefined, undefined, ['executeOnce']));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptPatchStale' || f.code === 'scriptOverride'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
});
