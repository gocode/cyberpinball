// Couleurs du DMD (dmdcolors.ts) : rangées là et sous le nom où les plugins Serum et VNI de VPX
// les cherchent. Cas signalé le 21/11/2026 : une colorisation PIN2DMD déposée seule avait fini dans
// vni\pin2dmd\pin2dmd.pal, jamais chargée, et le joueur cherchait une case à cocher (F1).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { colorFileRenames, colorImportTarget, colorKindOf, colorProblems } from '../dmdcolors';
import { diagnose, scriptFacts } from '../doctor';
import { applyImport, planImport } from '../tableimport';
import { scanTables } from '../tables';
import { tableContents } from '../tablecontents';

const T2_SCRIPT = 'Const cGameName="t2_l8"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';

function write(file: string, content = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const posix = (p: string) => p.split(path.sep).join('/');

test('noms lus par VPX : <rom>.cRZ pour Serum, <rom>.pal ou pin2dmd.pal (et son .vni) pour PIN2DMD', () => {
  assert.equal(colorKindOf(['t2_l8.cRZ']), 'serum');
  assert.equal(colorKindOf(['pin2dmd.pal', 'pin2dmd.vni']), 'vni');
  assert.equal(colorKindOf(['pin2dmd.pac']), 'vni');
  assert.equal(colorKindOf(['lisez-moi.txt']), undefined);
  assert.deepEqual(colorFileRenames('serum', ['t2_l8.cRZ'], 't2_l8'), []);
  assert.deepEqual(colorFileRenames('serum', ['T2 Serum v2.cRZ'], 't2_l8'), [{ from: 'T2 Serum v2.cRZ', to: 't2_l8.cRZ' }]);
  assert.deepEqual(colorFileRenames('vni', ['pin2dmd.pal'], 't2_l8'), []);
  assert.deepEqual(colorFileRenames('vni', ['T2_L8.pal', 'T2_L8.vni'], 't2_l8'), []);
  assert.deepEqual(colorFileRenames('vni', ['t2 colors.pal', 't2 colors.vni'], 't2_l8'), [
    { from: 't2 colors.pal', to: 'pin2dmd.pal' },
    { from: 't2 colors.vni', to: 'pin2dmd.vni' },
  ]);
  assert.deepEqual(colorFileRenames('vni', ['pin2dmd.pal', 'autre.vni'], 't2_l8'), [{ from: 'autre.vni', to: 'pin2dmd.vni' }]);
  // Deux .pal sans nom attendu : on ne devine pas lequel.
  assert.deepEqual(colorFileRenames('vni', ['a.pal', 'b.pal'], 't2_l8'), []);
});

test('import : un fichier de couleurs déposé seul va sous le nom de la ROM jouée', () => {
  const accepted = ['t2_l8'];
  assert.equal(posix(colorImportTarget('vni', 'pin2dmd.pal', false, accepted, 't2_l8')), 'vni/t2_l8/pin2dmd.pal');
  assert.equal(posix(colorImportTarget('vni', 'Terminator 2.vni', false, accepted, 't2_l8')), 'vni/t2_l8/pin2dmd.vni');
  assert.equal(posix(colorImportTarget('serum', 'Terminator 2 v1.cRZ', false, accepted, 't2_l8')), 'serum/t2_l8/t2_l8.cRZ');
  assert.equal(posix(colorImportTarget('serum', 'T2_L8.cRZ', false, accepted, 't2_l8')), 'serum/t2_l8/T2_L8.cRZ');
  // Dossier au nom d'une ROM du script : gardé ; autre nom : celui de la ROM jouée.
  assert.equal(posix(colorImportTarget('vni', 't2_l8', true, accepted, 't2_l8')), 'vni/t2_l8');
  assert.equal(posix(colorImportTarget('vni', 'pin2dmd', true, accepted, 't2_l8')), 'vni/t2_l8');
  // ROM jouée inconnue (plusieurs possibles, aucune dans l'import) : rangé tel quel, le médecin le dira.
  assert.equal(posix(colorImportTarget('serum', 'couleurs.cRZ', false, ['fp_a', 'fp_b'])), 'serum/couleurs/couleurs.cRZ');
});

test('import d’une table avec sa colorisation PIN2DMD en vrac : chargeable telle quelle, rien à signaler', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-couleurs-import-'));
  const tablesDir = path.join(root, 'tables');
  fs.mkdirSync(tablesDir);
  const staging = path.join(root, 'staging', 'T2');
  const vpx = write(path.join(staging, 'Terminator 2 (Williams 1991).vpx'));
  write(path.join(staging, 'pin2dmd.pal'));
  write(path.join(staging, 'pin2dmd.vni'));
  write(path.join(staging, 't2_l8.zip'), 'rom');
  const facts = scriptFacts(T2_SCRIPT);
  const plan = planImport([{ path: staging, label: 'T2.zip', mode: 'move', unpacked: true }], { tablesDir, scripts: new Map([[vpx.toLowerCase(), facts]]) });
  const t = plan.tables[0]!;
  const targets = t.steps.map((s) => posix(s.target)).sort();
  assert.ok(targets.includes('vni/t2_l8/pin2dmd.pal') && targets.includes('vni/t2_l8/pin2dmd.vni'), targets.join(', '));
  applyImport(t, { trashDir: path.join(root, 'trash'), cleanupRoots: [path.join(root, 'staging')] });
  const [entry] = scanTables(tablesDir);
  assert.deepEqual(diagnose(entry!, { tablesDir, script: facts }).filter((f) => f.code.startsWith('dmdColors')), []);
  assert.deepEqual(fs.readdirSync(path.join(t.folder, 'vni', 't2_l8')).sort(), ['pin2dmd.pal', 'pin2dmd.vni']);
  fs.rmSync(root, { recursive: true });
});

test('liste des fichiers de la table : des couleurs mal nommées ne sont plus « ok »', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-couleurs-liste-'));
  const vpx = write(path.join(folder, 'Terminator 2 (Williams 1991).vpx'));
  write(path.join(folder, 'pinmame', 'roms', 't2_l8.zip'));
  write(path.join(folder, 'vni', 'pin2dmd', 'pin2dmd.pal'));
  write(path.join(folder, 'serum', 't2_l8', 't2_l8.cRZ'));
  write(path.join(folder, 'serum', 't2_lx', 'pin2dmd.pac'));
  const contents = tableContents(vpx, { ownFolder: true, script: { usesPinmame: true, roms: ['t2_l8'] } });
  const state = (rel: string) => contents.entries.find((e) => posix(e.rel) === rel)?.state;
  assert.equal(state('vni/pin2dmd'), 'warning');
  assert.equal(state('serum/t2_l8'), 'ok');
  assert.equal(state('serum/t2_lx'), 'warning');
  // Le médecin, lui, sait où les ranger.
  const problems = colorProblems(folder, ['t2_l8'], 't2_l8');
  assert.deepEqual(
    problems.map((p) => [posix(p.rel), p.reason, p.target && posix(p.target)]),
    [
      ['serum/t2_lx', 'unread', undefined],
      ['vni/pin2dmd', 'misnamed', 'vni/t2_l8'],
    ],
  );
  fs.rmSync(folder, { recursive: true });
});
