// Procédures redéfinies par ExecuteGlobal pendant la partie (18/11/2026). Rapport d'une borne : Daredevil s'arrêtait
// 155 fois en trois minutes (100 à 1 000 ms), le fil des images de VPX dans l'antivirus de Windows (MPCLIENT.DLL, sous
// amsi.dll et vbscript.dll : relevé du plugin du DMD, arrets.h). Windows fait analyser chaque texte que VBScript compile
// pendant la partie ; la routine de clignotement que des centaines de tables recopient (FlashForMs, SetFlash) redéfinit
// sa Sub « <lumière>_Timer » à chaque appel. Invariants : le médecin repère ces redéfinitions faites depuis une Sub (pas
// le chargement du core.vbs au premier niveau), VPX joue un .vbs où une procédure n'est recompilée que si son texte
// change (lignes à leur place, table jamais modifiée, réparé avant chaque partie), et le .vbs fait exactement ce que
// faisait le script (exécuté par cscript).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyCompatFixes, compatFixesApplied, compatFixesFound } from '../scriptcompat';
import { buildScriptPatch, readScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { readVpxScript } from '../vpxinfo';
import { vpxWithScript } from './fixtures';

/** La routine de clignotement de gtxjoe, telle que les tables la recopient (Hellraiser, IT, Goonies, TimeLord…). */
const FLASH = [
  'Option Explicit',
  'LoadCoreFiles',
  'Sub LoadCoreFiles',
  '  ExecuteGlobal GetTextFile("core.vbs")',
  'End Sub',
  'Sub FlashForMs(MyLight, TotalPeriod, BlinkPeriod, FinalState) \'thanks gtxjoe for the first version',
  '  Dim steps',
  '  steps = Int(TotalPeriod / BlinkPeriod + .5)',
  '  MyLight.UserValue = steps * 10 + FinalState',
  '  MyLight.TimerInterval = BlinkPeriod',
  '  ExecuteGlobal "Sub " & MyLight.Name & "_Timer:" & "Dim tmp, steps, fstate:tmp=me.UserValue:fstate = tmp MOD 10:steps= tmp\\10 -1:Me.Visible = steps MOD 2:me.UserValue = steps *10 + fstate:If Steps = 0 then Me.Visible = fstate:Me.TimerEnabled=0:End if:End Sub" \' blink',
  'End Sub',
  'Sub SetFlash(MyLamp, nr, TotalPeriod, BlinkPeriod)',
  '  Msg = "ExecuteGlobal ""Sub X"" n\'est pas du code" : ExecuteGlobal("Sub " & MyLamp.Name & "_Timer:SetLamp 1, 0:End Sub")',
  'End Sub',
  '',
].join('\r\n');

test('repérage : ExecuteGlobal "Sub …" depuis une Sub ; pas le core.vbs, ni une définition faite au chargement', () => {
  assert.deepEqual(compatFixesFound(scriptCode(FLASH)), ['executeGlobalOnce']);
  assert.deepEqual(scriptFacts(FLASH).coreCompat, ['executeGlobalOnce']);
  // Seulement le chargement du core.vbs, ou une définition au premier niveau (exécutée une fois) : rien à corriger.
  assert.deepEqual(compatFixesFound(scriptCode('Sub LoadCoreFiles\r\n  ExecuteGlobal GetTextFile("core.vbs")\r\nEnd Sub\r\n')), []);
  assert.deepEqual(compatFixesFound(scriptCode('ExecuteGlobal "Sub Hello:End Sub"\r\n')), []);
  // Dans un commentaire ou une chaîne : rien.
  assert.deepEqual(compatFixesFound(scriptCode('Sub A\r\n  \' ExecuteGlobal "Sub B:End Sub"\r\n  x = "ExecuteGlobal ""Sub B"""\r\nEnd Sub\r\n')), []);
});

test('correction : chaque définition passe par CyberPinball_ExecuteGlobal, ligne pour ligne, commentaires et chaînes intacts', () => {
  const fixed = applyCompatFixes(FLASH, ['executeGlobalOnce'])!;
  const before = FLASH.split('\r\n');
  const after = fixed.split('\r\n');
  assert.equal(after[3], before[3], 'le chargement du core.vbs ne bouge pas');
  assert.equal(after[10], before[10]!.replace('  ExecuteGlobal "Sub "', '  CyberPinball_ExecuteGlobal "Sub "'));
  assert.match(after[10]!, /' blink$/);
  assert.equal(after[13], '  Msg = "ExecuteGlobal ""Sub X"" n\'est pas du code" : CyberPinball_ExecuteGlobal("Sub " & MyLamp.Name & "_Timer:SetLamp 1, 0:End Sub")');
  // La routine s'ajoute après la dernière ligne du script (vide : fin de fichier).
  for (const i of before.keys()) if (i !== 10 && i !== 13 && i < before.length - 1) assert.equal(after[i], before[i], `ligne ${i + 1}`);
  assert.deepEqual(compatFixesApplied(fixed), ['executeGlobalOnce']);
  assert.equal(applyCompatFixes(fixed, ['executeGlobalOnce']), fixed, 'déjà là : rien de plus');
  assert.deepEqual(compatFixesFound(scriptCode(fixed)), [], 'plus rien à corriger');
});

/** Exécute un script avec la routine de Cyber Pinball (cscript) et rend ce qu'il écrit. */
function run(body: string): string {
  const patched = applyCompatFixes(`Sub Rien\r\n  ExecuteGlobal "Sub Rien2:End Sub"\r\nEnd Sub\r\n${body}`, ['executeGlobalOnce'])!;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-execute-global-'));
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, `Option Explicit\r\n${patched}`, 'latin1');
  const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
  return result.stdout.trim().replace(/\r\n/g, ' ');
}

test('exécuté : même effet qu’ExecuteGlobal (redéfinitions, retour à un texte, instructions répétées, casse des noms)', { skip: process.platform !== 'win32' }, () => {
  const out = run(
    [
      'Dim R, said : R = 0 : said = ""',
      'Sub Say(x) : said = said & x & "," : End Sub',
      'CyberPinball_ExecuteGlobal "Sub A:Say 1:End Sub" : A',
      'CyberPinball_ExecuteGlobal "Sub A:Say 1:End Sub" : A',
      'CyberPinball_ExecuteGlobal "Sub A:Say 2:End Sub" : A',
      'CyberPinball_ExecuteGlobal "sub a:Say 1:end sub" : A',
      'CyberPinball_ExecuteGlobal "Function F(x):F = x * 2:End Function" : Say F(21)',
      // Des instructions : exécutées à chaque fois.
      'CyberPinball_ExecuteGlobal "R = R + 1" : CyberPinball_ExecuteGlobal "R = R + 1" : CyberPinball_ExecuteGlobal "R = R + 1"',
      // Deux procédures dans un texte : exécutées à chaque fois, jamais retenues.
      'CyberPinball_ExecuteGlobal "Sub B:Say 3:End Sub" & vbNewLine & "Sub C:Say 4:End Sub" : B : C',
      'WScript.Echo said & " R=" & R & " retenues=" & CyberPinball_ExecuteGlobal_Defined.Count',
    ].join('\r\n'),
  );
  assert.equal(out, '1,1,2,1,42,3,4, R=3 retenues=2');
});

test('exécuté : redéfinir le même texte ne recompile plus (le cas des clignotements)', { skip: process.platform !== 'win32' }, () => {
  // Une définition qui ne se compile pas la seconde fois si elle était recompilée : son texte change d'un appel à
  // l'autre par une variable que la routine relit (n) ; le même texte est retenu, un autre est recompilé.
  const out = run(
    [
      'Dim n, i, t0, said : said = ""',
      'Sub Say(x) : said = said & x & "," : End Sub',
      'For i = 1 To 200 : CyberPinball_ExecuteGlobal "Sub L1_Timer:Say ""x"":End Sub" : Next',
      'L1_Timer',
      'WScript.Echo said & " retenues=" & CyberPinball_ExecuteGlobal_Defined.Count',
    ].join('\r\n'),
  );
  assert.equal(out, 'x, retenues=1');
});

test('médecin : constat « Script qui arrête la partie à chaque clignotement », réparé avant la partie, table jamais modifiée', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-execute-global-'));
  const name = 'Hellraiser (Original 2020)';
  const folder = path.join(tablesDir, name);
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, `${name}.vpx`);
  const table = vpxWithScript(FLASH);
  fs.writeFileSync(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(FLASH) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat avec réparation attendu');
  assert.equal(finding.title, 'Script qui arrête la partie à chaque clignotement');
  assert.match(finding.detail, /antivirus/);
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  const vbs = fs.readFileSync(path.join(folder, `${name}.vbs`), 'latin1');
  assert.match(vbs, /^ {2}CyberPinball_ExecuteGlobal "Sub " & MyLight\.Name/m);
  assert.deepEqual(readScriptPatch(vbs)?.compat, ['executeGlobalOnce']);
  assert.equal(buildScriptPatch(FLASH, [], undefined, undefined, ['executeGlobalOnce']), vbs);
  assert.ok(fs.readFileSync(vpx).equals(table));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
});

test('tables réelles du poste qui recopient FlashForMs : repérées et corrigées sans ligne déplacée', (t) => {
  const tables = [
    'D:\\CyberPinball.sauve\\tables\\The Goonies Never Say Die Pinball (VPW 2021)\\The Goonies Never Say Die Pinball (VPW 2021) 1.5.vpx',
    'D:\\CyberPinball.sauve\\tables\\City Hunter (Original 2025)\\CityHunter (Original 2025 Tombg).vpx',
    'D:\\CyberPinball.sauve\\tables\\The Matrix (Original 2023)\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx',
  ].filter((f) => fs.existsSync(f)); // i18n-ignore : chemins du poste de développement
  if (!tables.length) return t.skip('tables absentes de ce poste');
  for (const file of tables) {
    const script = readVpxScript(file);
    if (script === undefined) continue;
    assert.ok(compatFixesFound(scriptCode(script)).includes('executeGlobalOnce'), path.basename(file));
    const fixed = applyCompatFixes(script, ['executeGlobalOnce'])!;
    const a = script.split(/\r?\n/);
    const b = fixed.split(/\r?\n/);
    const changed = a.filter((line, i) => i < a.length - 1 && line !== b[i]);
    assert.ok(changed.length >= 1 && changed.every((l) => /ExecuteGlobal\s*\(?\s*"Sub /i.test(l)), path.basename(file));
  }
});
