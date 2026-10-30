// Script écrit pour un ancien core.vbs (30 octobre 2026). Back to the Future (Data East 1990)
// appelle « vpmInit Me » deux fois dans bttf_Init (l. 205 et 268 de son script) ; le core.vbs de
// VPX 10.8.1-5436 arrête alors la partie (« Table script bug: cvpmFlips2.Init is called twice »),
// à chaque lancement. Invariants : le médecin repère tout script qui appelle vpmInit plus d'une
// fois, VPX joue un .vbs où vpmInit ne s'exécute qu'une fois (lignes à leur place, table jamais
// modifiée), réparé avant chaque partie et gardé par les autres réparations du .vbs ; une partie
// arrêtée par ce message fait corriger le script même quand son texte ne montrait rien.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, repairScriptAfterStop, scriptFacts, type DoctorContext } from '../doctor';
import { applyCompatFixes, compatFixesApplied, compatFixesForStop, compatFixesFound } from '../scriptcompat';
import { buildScriptPatch, readScriptPatch, scriptPatchState } from '../scriptpatch';
import { inventory } from '../tablefiles';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

/** Script de Back to the Future réduit à ce qui compte : ses deux vpmInit, et ceux des commentaires. */
const BTTF = [
  'Option Explicit',
  'LoadVPM "01560000", "DE.VBS", 3.26',
  'Const cGameName = "bttf_a27"',
  'Sub bttf_Init',
  '    vpmInit Me',
  '    With Controller',
  '        .GameName = cGameName',
  '    End With',
  '\tBackdrop_Init',
  '\tvpmInit me',
  'End Sub',
  'Sub Backdrop_Init : End Sub',
  "'Initialize SolModCallbacks: Const UseVPMModSol = 1 at the top of the script, before LoadVPM. vpmInit me in table1_Init()",
  'REM Put this in the table1_Init() section',
  '    REM vpmInit me',
  'Sub ShowHelp : MsgBox "Call vpmInit Me once" : End Sub',
  '',
].join('\r\n');

/** Un seul vpmInit dans le texte, mais dans une Sub que la table appelle deux fois. */
const ONCE_TWICE = ['Option Explicit', 'LoadVPM "01560000", "DE.VBS", 3.26', 'Sub Init_Machine : vpmInit Me : End Sub', 'Sub Table1_Init : Init_Machine : Init_Machine : End Sub', ''].join('\r\n');

const STOP = 'VBScript : Table script bug: cvpmFlips2.Init is called twice.\n\nMaybe \'vpmInit Me\' is duplicated in the code ?';

test('repérage : deux vpmInit dans le code, ni ceux des commentaires, ni ceux des chaînes, ni un vpmInit à soi', () => {
  assert.deepEqual(scriptFacts(BTTF).coreCompat, ['vpmInitOnce']);
  assert.deepEqual(compatFixesFound(scriptCode(ONCE_TWICE)), []);
  assert.equal(scriptFacts(ONCE_TWICE).coreCompat, undefined);
  // Un vpmInit par ligne, l'autre en commentaire, en Rem, dans une chaîne, ou membre d'un objet.
  const decoys = ['vpmInit Me', "' vpmInit Me", 'REM vpmInit Me', 'x = "vpmInit Me"', 'Core.vpmInit Me', 'vpmInitDone = True'].join('\n');
  assert.deepEqual(compatFixesFound(scriptCode(decoys)), []);
  assert.deepEqual(compatFixesFound(scriptCode(`${decoys}\nCall vpmInit(Me)`)), ['vpmInitOnce']);
  // Un vieux script qui embarque son propre vpmInit : rien à toucher.
  assert.deepEqual(compatFixesFound(scriptCode(`Sub vpmInit(t) : End Sub\n${BTTF}`)), []);
});

test('correction : lignes à leur place, commentaires et chaînes intacts, refaite à l’identique', () => {
  const fixed = applyCompatFixes(BTTF, ['vpmInitOnce'])!;
  const before = BTTF.split('\r\n');
  const after = fixed.split('\r\n');
  for (const [i, line] of before.slice(0, -1).entries()) {
    const expected = i === 4 || i === 9 ? line.replace('vpmInit', 'CyberPinball_VpmInit') : line;
    assert.equal(after[i], expected, `ligne ${i + 1}`);
  }
  assert.ok(/\r\nEnd Sub\r\n$/.test(fixed), 'fins de ligne du script gardées');
  assert.deepEqual(compatFixesApplied(fixed), ['vpmInitOnce']);
  assert.equal(applyCompatFixes(fixed, ['vpmInitOnce']), fixed, 'déjà là : rien de plus');
  // Plus aucun vpmInit en double à repérer dans le texte corrigé.
  assert.deepEqual(compatFixesFound(scriptCode(fixed)), []);
});

test('message d’arrêt : le correctif réclamé même quand le texte ne montrait rien', () => {
  assert.deepEqual(compatFixesForStop(STOP, scriptCode(ONCE_TWICE)), ['vpmInitOnce']);
  assert.deepEqual(compatFixesForStop('Can\'t start Game bttf_a27', scriptCode(ONCE_TWICE)), []);
  assert.deepEqual(compatFixesForStop(STOP, scriptCode('Option Explicit\r\n')), [], 'sans vpmInit, rien à corriger');
});

/**
 * Le script exécuté par cscript, après LoadVPM simulé (ExecuteGlobal d'un faux core.vbs dont
 * vpmInit compte ses appels, comme cvpmFlips2.Init) ; `run` : ce qu'on appelle ensuite. Rend le
 * nombre d'appels à vpmInit.
 */
function vpmInitCalls(script: string, run: string): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpminit-'));
  const core = 'Dim CPCalls : CPCalls = 0 : Sub vpmInit(aTable) : CPCalls = CPCalls + 1 : End Sub';
  const body = script
    .replace(/^LoadVPM .*$/m, `ExecuteGlobal "${core}"`)
    .replace(/^\s*With Controller[\s\S]*?End With\r\n/m, '')
    .replace(/MsgBox/g, 'WScript.Echo');
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, `${body}\r\n${run}\r\nWScript.Echo "appels=" & CPCalls\r\n`, 'latin1');
  const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  // Une erreur d'exécution de cscript sort aussi en 0 : elle se lit sur stderr.
  assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
  return Number(/appels=(\d+)/.exec(result.stdout)?.[1]);
}

test('exécuté : vpmInit appelé une seule fois, Option Explicit tenu', { skip: process.platform !== 'win32' }, () => {
  // `Me` hors d'une classe n'a pas de sens pour cscript : la table est une variable.
  const asTable = (s: string) => `Dim Table1 : Set Table1 = New RegExp\r\n${s.replace(/\bMe\b/gi, 'Table1')}`;
  const bttf = asTable(BTTF).replace('Option Explicit\r\n', '');
  assert.equal(vpmInitCalls(`Option Explicit\r\n${bttf}`, 'bttf_Init'), 2, 'le script d’origine appelle bien vpmInit deux fois');
  const patched = buildScriptPatch(`Option Explicit\r\n${bttf}`, [], undefined, undefined, ['vpmInitOnce'])!;
  assert.equal(vpmInitCalls(patched, 'bttf_Init'), 1);
  const once = asTable(ONCE_TWICE).replace('Option Explicit\r\n', '');
  assert.equal(vpmInitCalls(buildScriptPatch(`Option Explicit\r\n${once}`, [], undefined, undefined, ['vpmInitOnce'])!, 'Table1_Init'), 1);
});

// ---------- Le médecin ----------

const TABLE = 'Back to the Future (Data East 1990)';

function table(script: string): { tablesDir: string; folder: string; vpx: string; vbs: string; ctx: DoctorContext } {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-core-compat-'));
  const folder = path.join(tablesDir, TABLE);
  fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'pinmame', 'roms', 'bttf_a27.zip'), 'rom');
  const vpx = path.join(folder, `${TABLE}.vpx`);
  fs.writeFileSync(vpx, vpxWithScript(script));
  fs.writeFileSync(path.join(folder, `${TABLE}.directb2s`), 'b2s');
  return { tablesDir, folder, vpx, vbs: path.join(folder, `${TABLE}.vbs`), ctx: { tablesDir, script: scriptFacts(script) } };
}

const entry = (tablesDir: string) => scanTables(tablesDir)[0]!;
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);
const cleanup = (tablesDir: string) => {
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
};

test('médecin : vpmInit en double réparé avant la partie, table intacte, plus rien ensuite', () => {
  const t = table(BTTF);
  const vpxBefore = fs.readFileSync(t.vpx);
  const finding = diagnose(entry(t.tablesDir), t.ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat et correction attendus');
  assert.equal(finding.severity, 'warning', 'ne retient pas « Jouer » : la correction se fait seule');
  const done = repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` });
  assert.deepEqual(codes(done), ['scriptCoreCompat']);
  const vbs = fs.readFileSync(t.vbs, 'latin1');
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['vpmInitOnce']);
  assert.equal(scriptPatchState(vbs, BTTF).kind, 'ours');
  assert.deepEqual(fs.readFileSync(t.vpx), vpxBefore, 'la table n’est jamais modifiée');
  // La fiche le dit : script adapté, pas remplacé.
  assert.deepEqual(inventory(t.vpx, true).scriptPatched, { pup: false, compat: true });
  assert.equal(inventory(t.vpx, true).scriptOverride, false);
  assert.ok(!codes(diagnose(entry(t.tablesDir), t.ctx)).some((c) => c === 'scriptCoreCompat' || c === 'scriptOverride' || c === 'scriptPatchStale'));
  assert.deepEqual(repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` }), []);
  // Sans lecture en cache (cache périmé) : le script est relu dans le .vpx, même verdict.
  assert.deepEqual(repairPupForPlay(entry(t.tablesDir), { tablesDir: t.tablesDir }, { trashDir: `${t.tablesDir}-corbeille` }), []);
  cleanup(t.tablesDir);
});

test('médecin : table saine, rien à faire et aucun .vbs', () => {
  const t = table(ONCE_TWICE);
  assert.ok(!codes(diagnose(entry(t.tablesDir), t.ctx)).includes('scriptCoreCompat'));
  assert.deepEqual(repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` }), []);
  assert.ok(!fs.existsSync(t.vbs));
  cleanup(t.tablesDir);
});

test('médecin : la correction tient quand le PuP-Pack est allumé ensuite dans le même .vbs', () => {
  const script = BTTF.replace('Sub Backdrop_Init', 'usePUP = False\r\nIf usePUP = True Then\r\n  Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\n  PuPlayer.B2SInit "", cGameName\r\nEnd If\r\nSub Backdrop_Init');
  const t = table(script);
  fs.mkdirSync(path.join(t.folder, 'pupvideos', 'bttf_a27', 'Backglass'), { recursive: true });
  fs.writeFileSync(path.join(t.folder, 'pupvideos', 'bttf_a27', 'screens.pup'), 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n2,Backglass,,,0,ForceON,0,\r\n');
  fs.writeFileSync(path.join(t.folder, 'pupvideos', 'bttf_a27', 'Backglass', 'a.mp4'), 'mp4');
  const done = codes(repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` }));
  assert.ok(done.includes('scriptCoreCompat') && done.includes('pupDisabledByScript'), done.join(', '));
  const patch = readScriptPatch(fs.readFileSync(t.vbs, 'latin1'))!;
  assert.deepEqual(patch.compat, ['vpmInitOnce']);
  assert.ok(patch.switches.length, 'pack allumé aussi');
  assert.deepEqual(repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` }), []);
  cleanup(t.tablesDir);
});

test('médecin : table mise à jour, le .vbs refait garde la correction', () => {
  const t = table(BTTF);
  repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` });
  const updated = BTTF.replace('3.26', '3.27');
  fs.writeFileSync(t.vpx, vpxWithScript(updated));
  const ctx = { tablesDir: t.tablesDir, script: scriptFacts(updated) };
  assert.ok(codes(diagnose(entry(t.tablesDir), ctx)).includes('scriptPatchStale'));
  repairPupForPlay(entry(t.tablesDir), ctx, { trashDir: `${t.tablesDir}-corbeille` });
  const vbs = fs.readFileSync(t.vbs, 'latin1');
  assert.equal(scriptPatchState(vbs, updated).kind, 'ours');
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['vpmInitOnce']);
  cleanup(t.tablesDir);
});

test('médecin : un .vbs venu d’ailleurs est corrigé lui-même, une fois', () => {
  const t = table(BTTF);
  fs.writeFileSync(t.vbs, BTTF, 'latin1');
  const finding = diagnose(entry(t.tablesDir), t.ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix);
  assert.ok(finding.fix.ops.every((op) => op.op === 'write' && op.path === t.vbs));
  repairPupForPlay(entry(t.tablesDir), t.ctx, { trashDir: `${t.tablesDir}-corbeille` });
  const vbs = fs.readFileSync(t.vbs, 'latin1');
  assert.equal(readScriptPatch(vbs), undefined, 'il reste le sien, sans notre marque');
  assert.deepEqual(compatFixesApplied(vbs), ['vpmInitOnce']);
  assert.ok(!codes(diagnose(entry(t.tablesDir), t.ctx)).includes('scriptCoreCompat'));
  cleanup(t.tablesDir);
});

test('partie arrêtée par le message du core.vbs : le script est corrigé pour la suivante', () => {
  const t = table(ONCE_TWICE);
  const ops = { trashDir: `${t.tablesDir}-corbeille` };
  assert.equal(repairScriptAfterStop(entry(t.tablesDir), t.ctx, ops, 'Can\'t start Game'), undefined);
  assert.ok(!fs.existsSync(t.vbs));
  const done = repairScriptAfterStop(entry(t.tablesDir), t.ctx, ops, STOP);
  assert.equal(done?.code, 'scriptCoreCompat');
  assert.deepEqual(readScriptPatch(fs.readFileSync(t.vbs, 'latin1'))?.compat, ['vpmInitOnce']);
  // Le .vbs est le nôtre et à jour : le médecin ne le signale pas, ni ne le défait avant la partie.
  assert.ok(!codes(diagnose(entry(t.tablesDir), t.ctx)).some((c) => c.startsWith('script')));
  assert.deepEqual(repairPupForPlay(entry(t.tablesDir), t.ctx, ops), []);
  assert.ok(fs.existsSync(t.vbs));
  // Déjà corrigé : le même message ne refait rien.
  assert.equal(repairScriptAfterStop(entry(t.tablesDir), t.ctx, ops, STOP), undefined);
  cleanup(t.tablesDir);
});
