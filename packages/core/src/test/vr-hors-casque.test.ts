// Pièce VR dessinée hors du casque (17/11/2026) : une borne sans casque jouait « AC-DC LUCI Premium VR ». Une version
// faite pour le casque seul allume sa pièce (meuble, salle, fronton 3D) d'office (« Const VR_Room = 1 »), et un
// interrupteur d'essai laissé à 1 (LiveViewVRSim, VRTest) l'allume aussi dans une table hybride ; VPX la dessine alors
// sur les écrans à chaque image. Invariants : le médecin repère ces interrupteurs (pas ceux d'une table hybride bien
// réglée, ni le choix de la pièce), VPX joue un .vbs où l'interrupteur ne vaut que dans le casque (RenderingMode = 2),
// lignes à leur place, table jamais modifiée, réparé avant chaque partie.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { applyCompatFixes, compatFixesApplied, compatFixesFound, vrRoomFlags } from '../scriptcompat';
import { buildScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { readVpxScript } from '../vpxinfo';
import { vpxWithScript } from './fixtures';

/** Version faite pour le casque seul : la pièce s'allume d'office, rien ne regarde le mode de rendu. */
const VR_ONLY = [
  'Option Explicit',
  'Const VR_Room = 1 \' 1 = VR Room, 0 = desktop',
  'Dim VRThings',
  'If VR_Room = 1 Then',
  '  For Each VRThings in VRStuff: VRThings.visible = 1: Next',
  'End If',
  'Sub Table1_Init',
  '  If VR_Room = 1 Then VRBackglass.visible = True',
  'End Sub',
  '',
].join('\r\n');

/** Table hybride (Addams Family de VPW) dont l'interrupteur d'essai est resté à 1. */
const TEST_ON = [
  'Dim VR_Obj, VRMode',
  'Const LiveViewVRSim = 1\t\t\' 0 = Default, 1 = View table in VR mode in "Live View Editor"',
  'If RenderingMode = 2 or LiveViewVRSim = 1 Then',
  '\tFor Each VR_Obj in VRCab: VR_Obj.visible = 1: Next',
  'End If',
  '',
].join('\r\n');

/** Tables hybrides bien réglées : la pièce n'est choisie qu'en VR (Goonies, Game of Thrones, City Hunter de VPW). */
const HYBRIDS = [
  'Dim VRRoom : VRRoom = 2\r\nVRRoom = Table1.Option("VR Room", 0, 2, 1, 2, 0, Array("Minimal Room", "360 Sphere", "MEGA"))\r\nIf RenderingMode = 2 or VRTest = 1 Then\r\n  If VRRoom = 1 Then VR_Min.visible = 1\r\nEnd If\r\n',
  'Dim VRRoomChoice : VRRoomChoice = 5\r\nSub VRRoomInit\r\n  If RenderingMode = 2 or VRTest = 1 Then VRRoom = VRRoomChoice Else VRRoom = 0\r\n  If VRRoom = 1 Then For Each Stuff in VR_Room: Stuff.visible = true: Next\r\nEnd Sub\r\n',
  TEST_ON.replace('LiveViewVRSim = 1\t', 'LiveViewVRSim = 0\t'),
];

test('repérage : version VR seule et interrupteur d’essai laissé à 1, pas une table hybride bien réglée', () => {
  assert.deepEqual(compatFixesFound(scriptCode(VR_ONLY)), ['vrRoomOnScreens']);
  assert.deepEqual(vrRoomFlags(scriptCode(VR_ONLY)), ['VR_Room']);
  assert.deepEqual(vrRoomFlags(scriptCode(TEST_ON)), ['LiveViewVRSim']);
  for (const [i, s] of HYBRIDS.entries()) assert.deepEqual(compatFixesFound(scriptCode(s)), [], `hybride ${i + 1}`);
  // L'interrupteur à 0, en commentaire, ou dans une Sub : rien.
  assert.deepEqual(compatFixesFound(scriptCode(VR_ONLY.replace('VR_Room = 1 \'', 'VR_Room = 0 \''))), []);
  assert.deepEqual(compatFixesFound(scriptCode(VR_ONLY.replace('Const VR_Room = 1', '\' Const VR_Room = 1'))), []);
});

test('correction : l’interrupteur ne vaut que dans le casque, lignes à leur place, refaite à l’identique', () => {
  const fixed = applyCompatFixes(VR_ONLY, ['vrRoomOnScreens'])!;
  const before = VR_ONLY.split('\r\n');
  const after = fixed.split('\r\n');
  assert.equal(after.length, before.length);
  assert.equal(after[1], 'Dim VR_Room : VR_Room = 1 * Abs(RenderingMode = 2) \' 1 = VR Room, 0 = desktop');
  for (const i of before.keys()) if (i !== 1) assert.equal(after[i], before[i], `ligne ${i + 1}`);
  assert.deepEqual(compatFixesApplied(fixed), ['vrRoomOnScreens']);
  assert.equal(applyCompatFixes(fixed, ['vrRoomOnScreens']), fixed, 'déjà là : rien de plus');
  assert.deepEqual(compatFixesFound(scriptCode(fixed)), []);
  // Variable (pas une Const) : la valeur seule est gardée.
  assert.equal(applyCompatFixes(TEST_ON.replace('Const ', ''), ['vrRoomOnScreens'])!.split('\r\n')[1], 'LiveViewVRSim = 1 * Abs(RenderingMode = 2)\t\t\' 0 = Default, 1 = View table in VR mode in "Live View Editor"');
});

/** Valeur de l'interrupteur après le script corrigé, exécuté par cscript avec ce mode de rendu. */
function flagValue(script: string, renderingMode: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vr-flag-'));
  const file = path.join(dir, 'essai.vbs');
  const body = script.replace('Option Explicit\r\n', '').replace(/^If VR_Room[\s\S]*$/m, '');
  fs.writeFileSync(file, `Option Explicit\r\nDim RenderingMode : RenderingMode = ${renderingMode}\r\n${body}\r\nWScript.Echo "valeur=" & VR_Room\r\n`, 'latin1');
  const result = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(result.status === 0 && !result.stderr.trim(), result.stdout + result.stderr);
  return /valeur=(\S*)/.exec(result.stdout)?.[1] ?? '';
}

test('exécuté : 1 dans le casque (RenderingMode = 2), 0 sur les écrans, Option Explicit tenu', { skip: process.platform !== 'win32' }, () => {
  const patched = buildScriptPatch(VR_ONLY, [], undefined, undefined, ['vrRoomOnScreens'])!;
  assert.equal(flagValue(patched, 2), '1');
  assert.equal(flagValue(patched, 0), '0');
  assert.equal(flagValue(patched, 1), '0', 'stéréo 3D sur les écrans : pas de pièce');
});

test('médecin : constat « Pièce VR dessinée hors du casque », réparé avant la partie, table jamais modifiée', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vr-hors-casque-'));
  const name = 'AC-DC (Stern 2013)';
  const folder = path.join(tablesDir, name);
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, `${name} VR.vpx`);
  const table = vpxWithScript(VR_ONLY);
  fs.writeFileSync(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(VR_ONLY) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat');
  assert.ok(finding?.fix, 'constat avec réparation attendu');
  assert.equal(finding.title, 'Pièce VR dessinée hors du casque');
  assert.match(finding.detail, /VR_Room/);
  // Réparé seul avant chaque partie (PUP_PLAY_REPAIRS) : le .vbs est écrit, la table n'a pas bougé.
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  const vbs = path.join(folder, `${name} VR.vbs`);
  assert.ok(fs.existsSync(vbs));
  assert.match(fs.readFileSync(vbs, 'latin1'), /Dim VR_Room : VR_Room = 1 \* Abs\(RenderingMode = 2\)/);
  assert.ok(fs.readFileSync(vpx).equals(table));
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'scriptCoreCompat'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
});

test('tables hybrides réelles du poste : rien à corriger (Addams Family, Goonies, Game of Thrones, City Hunter, The Matrix)', (t) => {
  const tables = [
    'D:\\CyberPinball\\tables\\The Addams Family (Bally 1992)\\The Addams Family (Bally 1992) 2.4.41.vpx',
    'D:\\CyberPinball.sauve\\tables\\The Goonies Never Say Die Pinball (VPW 2021)\\The Goonies Never Say Die Pinball (VPW 2021) 1.5.vpx',
    'D:\\CyberPinball.sauve\\tables\\Game of Thrones LE (Stern 2015)\\Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx',
    'D:\\CyberPinball.sauve\\tables\\City Hunter (Original 2025)\\CityHunter (Original 2025 Tombg).vpx',
    'D:\\CyberPinball.sauve\\tables\\The Matrix (Original 2023)\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx',
  ].filter((f) => fs.existsSync(f)); // i18n-ignore : chemins du poste de développement
  if (!tables.length) return t.skip('tables absentes de ce poste');
  for (const file of tables) {
    const script = readVpxScript(file);
    if (script === undefined) continue;
    assert.deepEqual(compatFixesFound(scriptCode(script)), [], path.basename(file));
  }
});
