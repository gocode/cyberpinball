// Minuteries de vpmTimer décrites par un texte (18/11/2026). « vpmTimer.AddTimer 3000, "PlaySoundVol …'" » : le core.vbs
// fait compiler le texte par Execute à chaque échéance (cvpmTimer.Update), et Windows le fait analyser par son antivirus
// pendant que la partie attend (même mécanisme que code-dynamique.test.ts). Un GetRef à la place ferait tomber la partie
// avec le core.vbs 3.61 de VPX (file recopiée sans Set). Invariants : le médecin repère ces minuteries ; VPX joue un .vbs
// qui corrige l'Execute du core.vbs au chargement (lignes à leur place, table jamais modifiée) ; un texte revu est appelé
// par une Sub compilée une seule fois ; le script fait exactement ce qu'il faisait (même sortie avec et sans correctif,
// exécuté par cscript), y compris les textes qui dépendent de la portée de cvpmTimer.Update, laissés à Execute.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyCompatFixes, compatFixesApplied, compatFixesFound, CORE_TIMER_EXECUTE } from '../scriptcompat';
import { buildScriptPatch, readScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { readVpxScript } from '../vpxinfo';
import { vpxWithScript } from './fixtures';

/** Un core.vbs réduit, de la forme de celui de VPX 10.8.1 (cvpmTimer : file, Update qui fait Execute du texte). */
const CORE = [
  'Const conMaxTimers = 50',
  'Class cvpmTimer',
  '  Private mNow, mTimers, mQue0, mQue1, mQue2, mQue3',
  '  Private Sub Class_Initialize',
  '    mNow = 0 : mTimers = 0',
  '    ReDim mQue0(conMaxTimers) : ReDim mQue1(conMaxTimers) : ReDim mQue2(conMaxTimers) : ReDim mQue3(conMaxTimers)',
  '  End Sub',
  '  Public Sub AddTimer2(aDelay, aCallback, aArg)',
  '    mTimers = mTimers + 1 : mQue0(mTimers) = mNow + aDelay : mQue1(mTimers) = 0 : mQue2(mTimers) = aArg',
  '    If IsObject(aCallback) Then Set mQue3(mTimers) = aCallback Else mQue3(mTimers) = aCallback',
  '  End Sub',
  '  Public Sub AddTimer(aDelay, aCallback) : AddTimer2 aDelay, aCallback, 0 : End Sub',
  '  Public Sub Update',
  '    Dim ii, jj, sw, obj, mQuecopy',
  '    mNow = mNow + 1 : ii = 1',
  '    Do While ii <= mTimers',
  '      If mQue0(ii) <= mNow Then',
  '        If isObject(mQue3(ii)) Then',
  '          Call mQue3(ii)(mQue2(ii))',
  '        ElseIf varType(mQue3(ii)) = vbString Then',
  '          If mQue3(ii) > "" Then Execute mQue3(ii) & " " & mQue2(ii) & " "',
  '        End If',
  '        mTimers = mTimers - 1',
  '        For jj = ii To mTimers : mQue0(jj) = mQue0(jj+1) : mQue2(jj) = mQue2(jj+1) : mQue3(jj) = mQue3(jj+1) : Next',
  '        ii = ii - 1',
  '      End If',
  '      ii = ii + 1',
  '    Loop',
  '  End Sub',
  'End Class',
  'Dim vpmTimer : Set vpmTimer = New cvpmTimer',
  '',
].join('\r\n');

/** Un script de système (s11.vbs…) : il charge le core.vbs à son tour. */
const SYSTEM = 'ExecuteGlobal GetTextFile("core.vbs")\r\n';

/** Une table qui donne à vpmTimer des rappels en texte (relevés dans Guardians of the Galaxy, Game of Thrones). */
const TABLE = [
  'Dim said, i : said = ""',
  'Sub Say(x) : said = said & x & "," : End Sub',
  'Sub Hit(n) : said = said & "hit" & n & "," : End Sub',
  'Dim obj : obj = "global"',
  'LoadVPM',
  'Sub LoadVPM',
  '  On Error Resume Next',
  '  ExecuteGlobal GetTextFile("s11.vbs") : If Err Then said = said & "s11 absent,"',
  '  Err.Clear : ExecuteGlobal GetTextFile("absent.vbs") : If Err Then said = said & "absent,"',
  'End Sub',
  'Sub Fire(n)',
  '  vpmTimer.AddTimer 0, "Say ""a"" \'"',
  '  vpmTimer.AddTimer 0, "Hit"',
  '  vpmTimer.AddTimer2 0, "Hit", 7',
  '  vpmTimer.AddTimer 0, "Say ""n" & n & """ \'" \' texte qui change : compilé à chaque fois, par ExecuteGlobal',
  '  vpmTimer.AddTimer 0, "Say obj \'" \' obj est une variable de cvpmTimer.Update : laissé à Execute',
  'End Sub',
  'For i = 1 To 3 : Fire i : vpmTimer.Update : Next',
  '',
].join('\r\n');

/** Exécute la table (corrigée ou non) par cscript, scripts de VPX à côté ; GetTextFile imite celui de VPX. */
function run(script: string, tail = ''): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-minuteries-'));
  fs.writeFileSync(path.join(dir, 'core.vbs'), CORE, 'latin1');
  fs.writeFileSync(path.join(dir, 's11.vbs'), SYSTEM, 'latin1');
  const vpx = [
    `Function GetTextFile(aFile) : GetTextFile = CreateObject("Scripting.FileSystemObject").OpenTextFile("${dir}\\" & aFile).ReadAll : End Function`,
  ].join('\r\n');
  const file = path.join(dir, 'table.vbs');
  fs.writeFileSync(file, `${script}\r\n${vpx}\r\n${tail}\r\nWScript.Echo said\r\n`, 'latin1');
  const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
  return result.stdout.trim().replace(/\r\n/g, ' ');
}

test('repérage : rappel en texte donné à vpmTimer ; pas un GetRef, ni une chaîne ou un commentaire', () => {
  assert.deepEqual(compatFixesFound(scriptCode(TABLE)), ['timerTextOnce']);
  assert.deepEqual(scriptFacts(TABLE).coreCompat, ['timerTextOnce']);
  const load = 'Sub LoadVPM : ExecuteGlobal GetTextFile("core.vbs") : End Sub\r\n';
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A : vpmTimer.AddTimer 100, GetRef("B") : End Sub\r\n`)), []);
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A : vpmTimer.AddTimer(100, GetRef("B")) : End Sub\r\n`)), []);
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A : x = "vpmTimer.AddTimer 1, ""B""" : End Sub\r\n`)), []);
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A\r\n  ' vpmTimer.AddTimer 1, "B"\r\nEnd Sub\r\n`)), []);
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A : vpmTimer.PulseSwitch 12, 50, "B" : End Sub\r\n`)), ['timerTextOnce']);
  assert.deepEqual(compatFixesFound(scriptCode(`${load}Sub A : vpmtimer.addtimer(100, "B '") : End Sub\r\n`)), ['timerTextOnce']);
  // Rien à corriger sans core.vbs chargé par le script.
  assert.deepEqual(compatFixesFound(scriptCode('Sub A : vpmTimer.AddTimer 100, "B" : End Sub\r\n')), []);
});

test('correction : seuls les GetTextFile changent, ligne pour ligne ; une seule fois', () => {
  const fixed = applyCompatFixes(TABLE, ['timerTextOnce'])!;
  const before = TABLE.split('\r\n');
  const after = fixed.split('\r\n');
  for (const i of before.keys()) {
    if (i === before.length - 1) continue;
    const expected = before[i]!.replace(/\bGetTextFile\(/g, 'CyberPinball_TextFile(');
    assert.equal(after[i], expected, `ligne ${i + 1}`);
  }
  assert.equal(after[7], '  ExecuteGlobal CyberPinball_TextFile("s11.vbs") : If Err Then said = said & "s11 absent,"');
  assert.deepEqual(compatFixesApplied(fixed), ['timerTextOnce']);
  assert.equal(applyCompatFixes(fixed, ['timerTextOnce']), fixed, 'déjà là : rien de plus');
});

test('exécuté : même effet qu’avant ; un texte revu passe par sa Sub compilée', { skip: process.platform !== 'win32' }, () => {
  const original = run(TABLE);
  assert.equal(original, 'absent,a,hit0,hit7,n1,,a,hit0,hit7,n2,,a,hit0,hit7,n3,,');
  const fixed = applyCompatFixes(TABLE, ['timerTextOnce'])!;
  assert.equal(run(fixed), original, 'même sortie avec le correctif');
  // Dès le premier passage, chaque texte a sa Sub : « Say "a" », « Hit » (le même pour AddTimer et AddTimer2), puis
  // « Say "n1" », « Say "n2" », « Say "n3" » ; pas celui qui lit une variable de cvpmTimer.Update.
  assert.equal(run(fixed, 'said = CyberPinball_Compile_Count'), '5');
});

test('exécuté : les textes fixes sont compilés au chargement, en un lot ; un texte fautif reste à Execute', { skip: process.platform !== 'win32' }, () => {
  // Partie jouée après le chargement, comme dans VPX ; un texte fixe qui ne se compile pas, dans une Sub jamais appelée.
  const table = TABLE.replace('For i = 1 To 3 : Fire i : vpmTimer.Update : Next', 'Sub Never : vpmTimer.AddTimer 0, "Say (" : End Sub');
  const game = 'For i = 1 To 3 : Fire i : vpmTimer.Update : Next';
  const count = 'said = said & "c" & CyberPinball_Compile_Count & ","';
  const fixed = applyCompatFixes(table, ['timerTextOnce'])!;
  assert.match(fixed, /^CyberPinball_Compile_Want "Say ""a"" '", "CyberPinball_Arg", CyberPinball_TimerGuard$/m);
  // Chargement : « Say "a" » et « Hit » compilés ; « Say obj » écarté par sa garde (variable de cvpmTimer.Update) ;
  // « Say ( » isolé, sans numéro. Partie : les trois textes qui changent.
  assert.equal(run(fixed, `${count} : ${game} : ${count}`), 'absent,c2,a,hit0,hit7,n1,,a,hit0,hit7,n2,,a,hit0,hit7,n3,,c5,');
  assert.equal(run(table, game), run(TABLE), 'même partie sans le correctif');
});

test('exécuté : une erreur du rappel reste une erreur, comme avec Execute', { skip: process.platform !== 'win32' }, () => {
  const table = TABLE.replace('For i = 1 To 3 : Fire i : vpmTimer.Update : Next', [
    'On Error Resume Next',
    'For i = 1 To 3 : vpmTimer.AddTimer 0, "Inconnue \'" : vpmTimer.Update : said = said & "e" & Err.Number & "," : Err.Clear : Next',
    'On Error Goto 0',
  ].join('\r\n'));
  const original = run(table);
  assert.match(original, /^absent,(e\d+,){3}$/);
  assert.notEqual(original, 'absent,e0,e0,e0,');
  assert.equal(run(applyCompatFixes(table, ['timerTextOnce'])!), original);
});

test('le core.vbs de VPX installé sur ce poste contient bien l’Execute que le correctif remplace', (t) => {
  const root = 'D:\\CyberPinball\\emulators\\vpx'; // i18n-ignore : chemin du poste de développement
  const cores = fs.existsSync(root)
    ? fs.readdirSync(root).map((v) => path.join(root, v, 'scripts', 'core.vbs')).filter((f) => fs.existsSync(f))
    : [];
  if (!cores.length) return t.skip('VPX absent de ce poste');
  for (const core of cores) {
    const text = fs.readFileSync(core, 'latin1').toLowerCase();
    assert.ok(text.includes(CORE_TIMER_EXECUTE.toLowerCase()), core);
    assert.ok(text.includes('gettextfile('), core);
  }
});

test('médecin : constat « Script qui arrête la partie à chaque minuterie », réparé avant la partie, table jamais modifiée', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-minuteries-'));
  const name = 'Guardians (Original 2023)';
  const folder = path.join(tablesDir, name);
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, `${name}.vpx`);
  const table = vpxWithScript(TABLE);
  fs.writeFileSync(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(TABLE) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat avec réparation attendu');
  assert.equal(finding.title, 'Script qui arrête la partie à chaque minuterie');
  assert.match(finding.detail, /antivirus/);
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  const vbs = fs.readFileSync(path.join(folder, `${name}.vbs`), 'latin1');
  assert.match(vbs, /ExecuteGlobal CyberPinball_TextFile\("s11\.vbs"\)/);
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['timerTextOnce']);
  assert.equal(buildScriptPatch(TABLE, [], undefined, undefined, ['timerTextOnce']), vbs);
  assert.ok(fs.readFileSync(vpx).equals(table));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
});

test('tables réelles du poste aux minuteries en texte : repérées et corrigées sans ligne déplacée', (t) => {
  const root = 'D:\\CyberPinball.sauve\\tables'; // i18n-ignore : chemin du poste de développement
  const tables = [
    'Guardians of the Galaxy (Stern 2017)\\GOTG_2.1.1.vpx',
    'Game of Thrones LE (Stern 2015)\\Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx',
  ]
    .map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f));
  if (!tables.length) return t.skip('tables absentes de ce poste');
  for (const file of tables) {
    const script = readVpxScript(file);
    if (script === undefined) continue;
    assert.ok(compatFixesFound(scriptCode(script)).includes('timerTextOnce'), path.basename(file));
    const fixed = applyCompatFixes(script, ['timerTextOnce'])!;
    const a = script.split(/\r?\n/);
    const b = fixed.split(/\r?\n/);
    const changed = a.filter((line, i) => i < a.length - 1 && line !== b[i]);
    assert.ok(changed.length >= 1 && changed.every((l) => /GetTextFile\s*\(/i.test(l)), path.basename(file));
  }
});
