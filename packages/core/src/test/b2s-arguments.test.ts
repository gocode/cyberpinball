// Appels au fronton B2S que le plugin de VPX 10.8.1 refuse (19/11/2026, Champions League 2023). Le plugin B2S a des
// paramètres typés (B2SSetData (int, int) ou (string, int)) ; un texte à une place « int » qui n'est pas un nombre échoue
// (« Failed to convert a parameter in call to B2S_Server.B2SSetData »), l'erreur arrête la procédure du script, ici
// l'initialisation de la table, avant UltraDMD : « Objet requis: 'UltraDMD' » 540 fois sur le plateau.
// Invariants : le journal de la dernière partie réclame le correctif ; le .vbs de Cyber Pinball fait passer ces appels
// par une procédure qui convertit un nombre écrit en texte et laisse le script continuer si le fronton refuse encore ;
// lignes à leur place, table jamais modifiée ; rien pour une table dont le journal ne montre pas ce refus.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyCompatFixes, compatFixesFound, compatFixesFromLog } from '../scriptcompat';
import { readScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

/** Les lignes du journal de la borne (rapport du 19/11/2026). */
const REFUSED = [
  '2026-11-18 20:31:44.185 ERROR [Main] [DynamicTypeLibrary::COMToScriptVariant@387] Failed to convert from COM variant type 8',
  '2026-11-18 20:31:44.185 ERROR [Main] [DynamicTypeLibrary::Invoke@979] Failed to convert a parameter in call to B2S_Server.B2SSetData',
  "2026-11-18 20:31:44.185 ERROR [Main] [Player::OnScriptError@1235] Runtime error on line 5165, col 32: Type incompatible: 'Controller.B2SSetData'",
];

const SCRIPT = [
  'Dim said, UltraReady : said = "" : UltraReady = False',
  'Sub Table1_Init',
  '  Controller.B2SSetData 5, "1"',
  '  Controller.B2SSetData "Ball", "on" \' refusé même converti : le script continue',
  '  If True Then Controller.B2SSetData 6, "2" Else Controller.B2SSetData 7, 0',
  '  Call Controller.B2SSetData(8, "3") : Controller.B2SSetScore 1, "1200"',
  '  Controller.B2SStartAnimation "intro"',
  '  UltraReady = True',
  'End Sub',
  '',
].join('\r\n');

test('repérage : seulement par le journal de VPX, jamais d’après le texte seul', () => {
  assert.deepEqual(compatFixesFound(scriptCode(SCRIPT)), []);
  assert.deepEqual(compatFixesFromLog(REFUSED, scriptCode(SCRIPT)), ['b2sArgs']);
  assert.deepEqual(compatFixesFromLog(['INFO rien'], scriptCode(SCRIPT)), []);
  // Aucun appel B2S à une place « int » : rien à corriger.
  assert.deepEqual(compatFixesFromLog(REFUSED, scriptCode('Sub A : Controller.B2SStartAnimation "x" : End Sub\r\n')), []);
});

test('correction ligne pour ligne : chaque appel passe par sa procédure', () => {
  const fixed = applyCompatFixes(SCRIPT, ['b2sArgs'])!;
  const before = SCRIPT.split('\r\n');
  const after = fixed.split('\r\n');
  assert.equal(after[2], '  CyberPinball_B2S_B2SSetData_2 Controller, 5, "1" ');
  assert.equal(after[4], '  If True Then CyberPinball_B2S_B2SSetData_2 Controller, 6, "2" Else CyberPinball_B2S_B2SSetData_2 Controller, 7, 0 ');
  assert.equal(after[5], '  Call CyberPinball_B2S_B2SSetData_2(Controller, 8, "3") : CyberPinball_B2S_B2SSetScore_2 Controller, 1, "1200" ');
  assert.equal(after[6], before[6], 'B2SStartAnimation : texte attendu, inchangé');
  assert.equal(after[7], before[7]);
  assert.equal(applyCompatFixes(fixed, ['b2sArgs']), fixed, 'déjà là : rien de plus');
});

/** Un fronton qui, comme le plugin, refuse un texte à une place « int ». */
const FAKE_B2S = [
  'Class FakeB2S',
  '  Public Sub B2SSetData(a, b)',
  '    If VarType(b) = vbString Then Err.Raise 13, "B2S_Server", "Type incompatible"',
  '    said = said & a & "=" & b & "(" & TypeName(b) & "),"',
  '  End Sub',
  '  Public Sub B2SSetScore(a, b)',
  '    If VarType(a) = vbString Or VarType(b) = vbString Then Err.Raise 13',
  '    said = said & "score" & a & "=" & b & ","',
  '  End Sub',
  '  Public Sub B2SStartAnimation(n) : said = said & "anim:" & n & "," : End Sub',
  'End Class',
  'Dim Controller : Set Controller = New FakeB2S',
].join('\r\n');

function run(script: string): { ok: boolean; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-b2s-'));
  const file = path.join(dir, 'table.vbs');
  fs.writeFileSync(file, `${FAKE_B2S}\r\n${script}\r\nTable1_Init\r\nWScript.Echo said & " pret=" & UltraReady\r\n`, 'latin1');
  const r = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0 && !r.stderr.trim(), out: (r.stdout + r.stderr).trim() };
}

test('exécuté : l’initialisation va au bout, les nombres écrits en texte arrivent en nombres', { skip: process.platform !== 'win32' }, () => {
  assert.equal(run(SCRIPT).ok, false, 'sans le correctif, le fronton arrête l’initialisation');
  const fixed = run(applyCompatFixes(SCRIPT, ['b2sArgs'])!);
  assert.ok(fixed.ok, fixed.out);
  assert.equal(fixed.out, '5=1(Long),6=2(Long),8=3(Long),score1=1200,anim:intro, pret=Vrai'.replace('Vrai', fixed.out.endsWith('True') ? 'True' : 'Vrai'));
});

test('médecin : réclamé par le journal de la dernière partie, réparé avant la suivante, table jamais modifiée', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-b2s-'));
  try {
    const name = 'Champions League - Season 2023 (Original 2023)';
    const folder = path.join(tablesDir, name);
    fs.mkdirSync(folder, { recursive: true });
    const vpx = path.join(folder, 'Champions League 2023.vpx');
    const table = vpxWithScript(SCRIPT);
    fs.writeFileSync(vpx, table);
    const log = [`2026-11-18 20:31:42.460 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${vpx}`, ...REFUSED].join('\r\n');
    const ctx = { tablesDir, script: scriptFacts(SCRIPT), vpxLog: log };
    const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
    assert.equal(finding?.title, 'Script arrêté par le fronton B2S de VPX');
    // Sans ce journal : rien.
    assert.equal(diagnose(scanTables(tablesDir)[0]!, { ...ctx, vpxLog: undefined }).find((f) => f.code === 'scriptCoreCompat'), undefined);
    repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
    const vbs = fs.readFileSync(path.join(folder, 'Champions League 2023.vbs'), 'latin1');
    assert.deepEqual(readScriptPatch(vbs)?.compat, ['b2sArgs']);
    assert.match(vbs, /^ {2}CyberPinball_B2S_B2SSetData_2 Controller, 5, "1" $/m);
    assert.ok(fs.readFileSync(vpx).equals(table));
    // Une fois corrigé, le même journal ne réclame plus rien, et la partie suivante sans erreur ne le retire pas.
    assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
    assert.equal(diagnose(scanTables(tablesDir)[0]!, { ...ctx, vpxLog: undefined }).find((f) => f.code === 'scriptCoreCompat'), undefined);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
    fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
  }
});
