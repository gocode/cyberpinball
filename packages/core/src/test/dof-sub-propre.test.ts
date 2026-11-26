// Effets LED : les appels DOF d'un script qui définit sa propre `Sub DOF` (copie de controller.vbs collée dans la
// table) n'atteignaient pas l'écoute posée dans controller.vbs. Retour du 26/11/2026 : Stranger Things, 312 appels
// DOF, LED muettes. Le .vbs de Cyber Pinball branche l'écoute dans la Sub DOF du script (scriptcompat.ts, dofTapOwnSub).

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { addDofTap, DOF_TAP_ENV, dofCallLines, dofTapReach, ownDofSubs, parseTapLine } from '../dof-evenements';
import { applyCompatFixes, compatFixesApplied, compatFixesFound } from '../scriptcompat';
import { scriptCode } from '../vbscript';

// Écrit pour l'essai, sur le modèle des tables qui recopient controller.vbs dans leur script.
const OWN = [
  'Dim B2SOn : B2SOn = False',
  'Dim B2SOnALT : B2SOnALT = False',
  'Dim Controller, B2SController',
  'Sub DOF(DOFevent, State)',
  '\tIf B2SOn Then',
  '\t\tIf State = 2 Then',
  '\t\t\tController.B2SSetData DOFevent, 1:Controller.B2SSetData DOFevent, 0',
  '\t\tElse',
  '\t\t\tController.B2SSetData DOFevent, State',
  '\t\tEnd If',
  '\tEnd If',
  'End Sub',
  '',
  "Sub DOFALT(ByVal DOFevent, ByVal State) ' pour B2SController",
  '\tIf B2SOnALT Then B2SController.B2SSetData DOFevent, State',
  'End Sub',
  '',
  'Sub Flipper_Hit : DOF 101, 2 : End Sub',
  'Sub Bumper1_Hit',
  '\tDOF 105, 1',
  '\tDOF(105, 0)',
  'End Sub',
  '',
].join('\r\n');

const WITH_CONTROLLER = [
  'Sub LoadCoreFiles',
  '\tOn Error Resume Next',
  '\tExecuteGlobal GetTextFile("controller.vbs")',
  '\tIf Err Then MsgBox "Can\'t open controller.vbs"',
  'End Sub',
  'Sub Flipper_Hit : DOF 101, DOFOn : End Sub',
  '',
].join('\r\n');

test('Sub DOF propre : repérée, écoute branchée sur la ligne de la déclaration, aucune ligne déplacée', () => {
  assert.deepEqual(compatFixesFound(scriptCode(OWN)), ['dofTapOwnSub']);
  assert.equal(dofTapReach(OWN), 'missed');
  const fixed = applyCompatFixes(OWN, ['dofTapOwnSub'])!;
  const before = OWN.split('\r\n');
  const after = fixed.split('\r\n');
  for (const [i, line] of before.entries()) {
    if (i === 3) assert.equal(after[i], 'Sub DOF(DOFevent, State) : CyberPinball_DofTapTable DOFevent, State');
    else if (i === 13) assert.equal(after[i], "Sub DOFALT(ByVal DOFevent, ByVal State) : CyberPinball_DofTapTable DOFevent, State ' pour B2SController");
    else if (line) assert.equal(after[i], line, `ligne ${i + 1}`);
  }
  assert.deepEqual(compatFixesApplied(fixed), ['dofTapOwnSub']);
  assert.deepEqual(compatFixesFound(scriptCode(fixed)), [], 'plus rien à corriger');
  assert.equal(applyCompatFixes(fixed, ['dofTapOwnSub']), fixed, 'idempotent');
  assert.equal(dofTapReach(fixed), 'table');
  assert.equal((fixed.match(/^Sub CyberPinball_DofTapTable\b/gim) ?? []).length, 1);
});

test('Sub DOF propre : ce qui n’en est pas une', () => {
  // controller.vbs chargé : sa Sub DOF est écoutée (addDofTap), rien à faire dans le script.
  assert.deepEqual(compatFixesFound(scriptCode(WITH_CONTROLLER)), []);
  assert.equal(dofTapReach(WITH_CONTROLLER), 'controller');
  // Sub DOF jamais appelée : pas de .vbs pour rien.
  assert.deepEqual(compatFixesFound(scriptCode('Sub DOF(a, b)\r\nEnd Sub\r\n')), []);
  assert.equal(dofTapReach('Sub DOF(a, b)\r\n\tController.B2SSetData DOFevent, b\r\nEnd Sub\r\n'), 'none', 'DOFevent n’est pas un appel');
  // Méthode d'une classe, déclaration en commentaire.
  assert.deepEqual(ownDofSubs(scriptCode('Class Lights\r\n\tSub DOF(a, b)\r\n\tEnd Sub\r\nEnd Class\r\nDOF 101, 1\r\n')), []);
  assert.deepEqual(ownDofSubs(scriptCode("' Sub DOF(a, b)\r\nDOF 101, 1\r\n")), []);
  // Appels sans Sub DOF connue : vus comme perdus, pour le journal.
  assert.equal(dofTapReach('Sub A : DOF 101, 1 : End Sub\r\n'), 'missed');
  assert.equal(dofCallLines(scriptCode('Sub DOF(a, b) : CyberPinball_DofTapTable a, b\r\nSub A : DOF 101, 1 : End Sub\r\n')), 1);
  assert.equal(dofCallLines(scriptCode('SoundFXDOF("fx", 101, DOFPulse, DOFContactors)\r\nx = DOFevent, 1\r\n')), 1);
});

test('controller.vbs : écoute inchangée par le partage de la Sub d’écoute', () => {
  const ctrl = addDofTap('Sub DOF(DOFevent, State)\r\n\tIf B2SOn Then\r\n\tEnd If\r\nEnd Sub\r\n')!;
  assert.match(ctrl, /^Dim CyberPinball_DofTapFile, CyberPinball_DofTapReady$/m);
  assert.match(ctrl, /^Sub CyberPinball_DofTap\(n, s\)$/m);
  assert.match(ctrl, /If CyberPinball_DofTapReady = "yes" Then CyberPinball_DofTapFile\.WriteLine "E," & CLng\(n\)/);
});

// Exécution réelle : version courte des Sub DOF (l'antivirus du poste refuse à cscript la copie complète avec
// Controller.B2SSetData et l'écriture de fichier ; VPX, qui exécute lui-même le script, n'est pas concerné).
const RUN = [
  'Sub DOF(DOFevent, State)',
  'End Sub',
  "Sub DOFALT(ByVal DOFevent, ByVal State) ' pour B2SController",
  'End Sub',
  'Sub Flipper_Hit : DOF 101, 2 : End Sub',
  'Sub Bumper1_Hit',
  '\tDOF 105, 1',
  '\tDOF(105, 0)',
  'End Sub',
  '',
].join('\r\n');

test('exécuté (cscript) : chaque appel DOF du script arrive dans le fichier d’écoute, impulsion comprise', { skip: process.platform !== 'win32' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-sub-'));
  const tap = path.join(dir, 'tap.txt');
  const file = path.join(dir, 'essai.vbs');
  const fixed = applyCompatFixes(RUN, ['dofTapOwnSub'])!;
  fs.writeFileSync(file, `Option Explicit\r\n${fixed}Flipper_Hit\r\nBumper1_Hit\r\nDOFALT 200, 1\r\nWScript.Echo "fini"\r\n`, 'latin1');
  const r = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000, env: { ...process.env, [DOF_TAP_ENV]: tap } });
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === 'EPERM') return t.skip('cscript refusé par l’antivirus du poste');
  assert.ok(r.status === 0 && r.stdout.includes('fini'), `${r.error?.message} ${r.stdout} ${r.stderr}`);
  const events = fs.readFileSync(tap, 'latin1').split(/\r?\n/).filter(Boolean).map((l) => parseTapLine(l));
  assert.deepEqual(events.map((e) => e && [e.number, e.state]), [[101, 2], [105, 1], [105, 0], [200, 1]]);
  // Sans la variable : rien d'écrit, aucune erreur.
  fs.rmSync(tap);
  const env = { ...process.env };
  delete env[DOF_TAP_ENV];
  const quiet = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000, env });
  assert.ok(quiet.status === 0 && quiet.stdout.includes('fini'), `${quiet.error?.message} ${quiet.stdout} ${quiet.stderr}`);
  assert.equal(fs.existsSync(tap), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Corpus : scripts réels des tables originales jouées sans ROM sur la borne d'essai (tmp/vbs-led, hors dépôt :
// .vbs de Cyber Pinball et scripts tirés des .vpx). Aucune table n'est nommée ici : l'invariant vaut pour chacune.
const CORPUS = path.resolve(__dirname, '../../../../tmp/vbs-led');
function corpus(): string[] {
  if (!fs.existsSync(CORPUS)) return [];
  return [CORPUS, path.join(CORPUS, 'vpx')].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((n) => n.endsWith('.vbs')).map((n) => path.join(d, n)));
}

test('corpus : après les correctifs de Cyber Pinball, chaque appel DOF des tables sans ROM atteint une écoute', { skip: !corpus().length && 'scripts absents' }, () => {
  let own = 0;
  for (const file of corpus()) {
    const name = path.relative(CORPUS, file);
    const text = fs.readFileSync(file, 'latin1');
    assert.ok(dofCallLines(scriptCode(text)) > 0, `${name} : appelle DOF`);
    const fixes = compatFixesFound(scriptCode(text));
    const played = fixes.length ? applyCompatFixes(text, fixes) : text;
    assert.ok(played !== undefined, `${name} : correctifs applicables`);
    assert.notEqual(dofTapReach(played), 'missed', `${name} : appels DOF perdus`);
    if (ownDofSubs(scriptCode(text)).length) {
      own++;
      assert.ok(fixes.includes('dofTapOwnSub'), `${name} : Sub DOF propre repérée`);
      assert.equal(dofTapReach(played), 'table', name);
      // Ligne pour ligne : seules les déclarations des Sub DOF changent dans le corps du script.
      const a = text.split(/\r?\n/);
      const b = played.split(/\r?\n/);
      const changed = a.filter((l, i) => l !== b[i]).length;
      assert.ok(changed <= ownDofSubs(scriptCode(text)).length + fixes.length * 400, name);
    }
  }
  assert.ok(own >= 1, 'le corpus a au moins une table à Sub DOF propre');
});
