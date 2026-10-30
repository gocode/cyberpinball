// PuP-Pack coupé par le script de la table : 2001 : A Space Odyssey (Original 2025)
// livre « usePUP = False ». Le pack est bien rangé dans pupvideos\HAL9000, l'option
// appliquée, le plugin PUP actif, et pourtant rien ne s'affiche : B2SInit n'est jamais
// appelé (vpinball.log : « Plugin PUP loaded », jamais « PUP path »). Ces tests fixent
// l'invariant : un pack installé dont le script coupe le lancement est signalé, allumé
// d'un geste dans un .vbs à côté de la table (la table n'est pas modifiée), et ce .vbs
// est reconnu, refait à la mise à jour de la table, jamais confondu avec un autre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { enablePupSwitch, pupScriptSwitch } from '../puppack';
import { buildScriptPatch, readScriptPatch, scriptPatchState } from '../scriptpatch';
import { inventory } from '../tablefiles';
import { applyImport, planImport } from '../tableimport';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { readVpxScript } from '../vpxinfo';
import { vpxWithScript } from './fixtures';

/** Début du script de 2001, tel que la table le livre (structure et noms d'origine, raccourci). */
const SCRIPT_2001 = [
  'Option Explicit',
  '',
  "'****** PuP Variables ******",
  "Dim usePUP: Dim cPuPPack: Dim PuPlayer: Dim PUPStatus: PUPStatus=false ' dont edit this line!!!",
  "usePUP   = False            ' enable Pinup Player functions for this table",
  'cPuPPack = "HAL9000"    \' name of the PuP-Pack / PuPVideos folder for this table',
  'Sub PuPStart(cPuPPack)',
  '    If PUPStatus=true then Exit Sub',
  '    If usePUP=true then',
  '        Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")',
  '        If PuPlayer is Nothing Then',
  '            usePUP=false',
  '            PUPStatus=false',
  '        Else',
  '            PuPlayer.B2SInit "",cPuPPack \'start the Pup-Pack',
  '            PUPStatus=true',
  '        End If',
  '    End If',
  'End Sub',
  "PuPStart(cPuPPack) 'Check for PuP - ",
  'if usepup = false then',
  'PlaySound "2001_music", -1',
  'end if',
  '',
].join('\r\n');

const sw = (code: string) => pupScriptSwitch(scriptCode(code));

test('2001 : « usePUP = False » coupe le pack, la valeur qui l’allume est True', () => {
  const facts = scriptFacts(SCRIPT_2001);
  assert.deepEqual(facts.pup?.packNames, ['HAL9000']);
  assert.deepEqual(facts.pup?.disabledBy, { variable: 'usePUP', value: 'False', enable: 'True', line: 4 });
  // Allumé, plus rien ne l'empêche.
  assert.equal(sw(SCRIPT_2001.replace('usePUP   = False', 'usePUP   = True')), undefined);
});

test('interrupteur : formes reconnues, et silence quand on ne peut pas savoir', () => {
  const create = 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")';
  // Constante numérique, If d'une ligne.
  assert.deepEqual(sw(`Const UsePUP = 0\nIf UsePUP Then ${create}\n`), { variable: 'UsePUP', value: '0', enable: '1', line: 0 });
  // Négation.
  assert.equal(sw(`NoPuP = True\nIf Not NoPuP Then\n  ${create}\nEnd If\n`)?.enable, 'False');
  // Mode choisi par un nombre.
  assert.equal(sw(`PuPMode = 0\nIf PuPMode = 2 Then\n  ${create}\nEnd If\n`)?.enable, '2');
  // Lancement dans une Sub, appelée sous condition.
  assert.equal(sw(`usePUP = False\nSub StartPuP\n  ${create}\n  PuPlayer.B2SInit "", "pack"\nEnd Sub\nIf usePUP Then StartPuP\n`)?.variable, 'usePUP');
  // Interrupteur allumé : rien.
  assert.equal(sw(`Dim HasPuP : HasPuP = True\nIf HasPuP Then\n  ${create}\nEnd If\n`), undefined);
  // Réglé par une option de la table (Sub appelée par VPX) : on ne sait pas.
  assert.equal(sw(`usePUP = False\nSub Table1_OptionEvent(ByVal e)\n  usePUP = Table1.Option("PuP", 0, 1, 1, 0, 0)\nEnd Sub\nIf usePUP Then\n  ${create}\nEnd If\n`), undefined);
  // Variable posée dans Table1_Init d'après une constante (Guardians of the Galaxy) : on ne sait pas.
  assert.equal(sw(`Const DMDMode = 2\nSub Table1_Init\n  bUsePUPDMD = False\n  If DMDMode = 2 Then bUsePUPDMD = True\n  If bUsePUPDMD Then PuPInit\nEnd Sub\nSub PuPInit\n  ${create}\nEnd Sub\n`), undefined);
  // Rallumé plus bas sous condition : on ne sait pas.
  assert.equal(sw(`usePUP = False\nIf FileExists("pup.txt") Then usePUP = True\nIf usePUP Then\n  ${create}\nEnd If\n`), undefined);
  // Branche Else : on ne sait pas.
  assert.equal(sw(`usePUP = False\nIf usePUP Then\n  x = 1\nElse\n  ${create}\nEnd If\n`), undefined);
  // Deux lancements, l'un sans condition : atteint.
  assert.equal(sw(`usePUP = False\nIf usePUP Then\n  ${create}\nEnd If\n${create}\n`), undefined);
  // Sans PuP : rien.
  assert.equal(sw('usePUP = False\n'), undefined);
});

test('interrupteur allumé : seule la valeur change, octet pour octet (fins de ligne, accents, commentaires)', () => {
  const script = `${SCRIPT_2001}' Réglages : é à ç\r\n`;
  const off = scriptFacts(script).pup!.disabledBy!;
  const on = enablePupSwitch(script, off)!;
  const before = Buffer.from(script, 'latin1');
  const after = Buffer.from(on, 'latin1');
  assert.equal(after.length, before.length - 'False'.length + 'True'.length);
  assert.equal(on.split('\r\n')[4], "usePUP   = True            ' enable Pinup Player functions for this table");
  assert.deepEqual(on.split('\r\n').filter((l, i) => i !== 4), script.split('\r\n').filter((l, i) => i !== 4));
  // La ligne n'est plus celle qu'on attend : rien n'est écrit.
  assert.equal(enablePupSwitch(script.replace('usePUP   = False', 'usePUP = Faux'), off), undefined);
});

test('.vbs de Cyber Pinball : marqué en dernière ligne, reconnu, périmé quand la table change, étranger s’il est retouché', () => {
  const off = scriptFacts(SCRIPT_2001).pup!.disabledBy!;
  const vbs = buildScriptPatch(SCRIPT_2001, [off])!;
  // Les numéros de ligne ne bougent pas : la marque est ajoutée à la fin.
  assert.equal(vbs.split('\r\n')[4]!.startsWith('usePUP   = True'), true);
  assert.deepEqual(readScriptPatch(vbs)?.switches, [off]);
  assert.equal(readScriptPatch(SCRIPT_2001), undefined);
  assert.equal(scriptPatchState(vbs, SCRIPT_2001).kind, 'ours');
  // Table mise à jour, toujours coupée : refait d'après le nouveau script.
  const v2 = SCRIPT_2001.replace('PlaySound "2001_music", -1', 'PlaySound "2001_theme", -1');
  const stale = scriptPatchState(vbs, v2);
  assert.equal(stale.kind, 'stale');
  assert.equal(stale.kind === 'stale' && stale.content, buildScriptPatch(v2, [off]));
  // Table mise à jour qui lance le pack d'elle-même : le .vbs n'a plus lieu d'être.
  const v3 = SCRIPT_2001.replace('usePUP   = False', 'usePUP   = True');
  const gone = scriptPatchState(vbs, v3);
  assert.equal(gone.kind === 'stale' && gone.content, undefined);
  // Retouché à la main : c'est un .vbs comme un autre.
  assert.equal(scriptPatchState(vbs.replace('2001_music', '2001_autre'), SCRIPT_2001).kind, 'foreign');
  assert.equal(scriptPatchState('Option Explicit\r\n', SCRIPT_2001).kind, 'foreign');
});

test('.vpx : script lu dans GameData sans VPX ; protégé ou illisible : rien', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-vpxscript-'));
  const file = path.join(dir, 'table.vpx');
  const script = `${SCRIPT_2001}' é\r\n`;
  fs.writeFileSync(file, vpxWithScript(script));
  assert.equal(readVpxScript(file), script);
  fs.writeFileSync(file, vpxWithScript(script, true));
  assert.equal(readVpxScript(file), undefined);
  fs.writeFileSync(file, 'vpx');
  assert.equal(readVpxScript(file), undefined);
  fs.rmSync(dir, { recursive: true });
});

/** Table 2001 installée : .vpx au vrai script, pack HAL9000 rangé. */
function table2001(tablesDir: string, script = SCRIPT_2001): string {
  const folder = path.join(tablesDir, '2001 - A Space Odyssey (Original 2025)');
  fs.mkdirSync(path.join(folder, 'pupvideos', 'HAL9000'), { recursive: true });
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx'), vpxWithScript(script));
  fs.writeFileSync(path.join(folder, '2001 - A Space Odyssey (Original 2025).directb2s'), 'b2s');
  fs.writeFileSync(path.join(folder, '2001 - A Space Odyssey (Original 2025).info'), '{}');
  fs.writeFileSync(path.join(folder, 'pupvideos', 'HAL9000', 'screens.pup'), 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n2,Backglass,Backglass,bg.mp4,1,ForceBack,,\r\n');
  return folder;
}

/** Session de 2001 telle que VPX 10.8.1 l'écrit dans vpinball.log (lignes réelles, chemins raccourcis). */
function log2001(vpx: string): string {
  return [
    `2026-10-25 19:22:21.561 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${vpx}`,
    '2026-10-25 19:22:23.969 INFO  [Main] [PUP:PUPPluginLoad@293] No global PUP folder configured; per-table \'pupvideos\' used when present',
    '2026-10-25 19:22:23.970 INFO  [Main] [MsgPI::MsgPlugin::Load@520] Plugin PUP loaded (library: D:\\CyberPinball\\emulators\\vpx\\current\\plugins\\pup\\plugin-pup64.dll) [id=13]',
    '2026-10-25 19:22:25.011 INFO  [Main] [Player::Player@727] Starting script',
    '2026-10-25 19:22:25.033 INFO  [Main] [VPXPluginAPIImpl::ApplyScriptCOMObjectOverrides@377] COM script object pinupplayer.pindisplay overriden to be provided by a plugin',
    '2026-10-25 19:22:28.121 INFO  [Main] [Player::Player@832] Startup done',
    '2026-10-25 19:23:21.268 INFO  [Main] [MsgPI::MsgPlugin::Unload@550] Plugin PUP unloaded [id=13]',
  ].join('\r\n');
}

test('médecin, cas 2001 : le constat dit pourquoi, la correction allume le pack sans toucher à la table', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-2001-'));
  const folder = table2001(tablesDir);
  const entry = () => scanTables(tablesDir)[0]!;
  const vpx = path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx');
  const ctx = { tablesDir, script: scriptFacts(SCRIPT_2001), vpxLog: log2001(vpx) };
  const before = fs.readFileSync(vpx);
  const found = diagnose(entry(), ctx);
  // Le journal (aucun pack chargé) ne double pas le constat : la cause est dite.
  assert.deepEqual(found.map((f) => f.code), ['pupDisabledByScript']);
  assert.match(found[0]!.detail, /usePUP = False/);
  assert.equal(found[0]!.severity, 'warning');
  const trashDir = `${tablesDir}-corbeille`;
  applyOps(found[0]!.fix!.ops, { trashDir });
  const vbs = path.join(folder, '2001_SpaceOdyssey_v1.0.2.vbs');
  assert.equal(fs.readFileSync(vbs, 'latin1').split('\r\n')[4], "usePUP   = True            ' enable Pinup Player functions for this table");
  assert.deepEqual(fs.readFileSync(vpx), before, 'la table n’est pas modifiée');
  // Notre .vbs n'est pas un « script remplacé » : plus rien à signaler.
  assert.deepEqual(diagnose(entry(), { tablesDir, script: scriptFacts(SCRIPT_2001) }), []);
  assert.equal(inventory(entry().file, true).scriptOverride, false);
  assert.deepEqual(inventory(entry().file, true).scriptPatched, { pup: true, compat: false });
  // Table mise à jour : le .vbs est refait d'après le nouveau script.
  const v2 = SCRIPT_2001.replace('PlaySound "2001_music", -1', 'PlaySound "2001_theme", -1');
  fs.writeFileSync(vpx, vpxWithScript(v2));
  const stale = diagnose(entry(), { tablesDir, script: scriptFacts(v2) });
  assert.deepEqual(stale.map((f) => f.code), ['scriptPatchStale']);
  applyOps(stale[0]!.fix!.ops, { trashDir });
  assert.ok(fs.readFileSync(vbs, 'latin1').includes('2001_theme'));
  assert.deepEqual(diagnose(entry(), { tablesDir, script: scriptFacts(v2) }), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('médecin : .vbs venu d’ailleurs qui coupe le pack, allumé dans ce fichier ; table protégée, constat sans correction', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-2001-'));
  const folder = table2001(tablesDir);
  const vbs = path.join(folder, '2001_SpaceOdyssey_v1.0.2.vbs');
  fs.writeFileSync(vbs, SCRIPT_2001, 'latin1');
  const entry = () => scanTables(tablesDir)[0]!;
  const ctx = { tablesDir, script: scriptFacts(SCRIPT_2001) };
  const found = diagnose(entry(), ctx);
  assert.deepEqual(found.map((f) => f.code), ['scriptOverride', 'pupDisabledByScript']);
  const trashDir = `${tablesDir}-corbeille`;
  applyOps(found[1]!.fix!.ops, { trashDir });
  assert.equal(fs.readFileSync(vbs, 'latin1'), SCRIPT_2001.replace('usePUP   = False', 'usePUP   = True'));
  assert.deepEqual(diagnose(entry(), ctx).map((f) => f.code), ['scriptOverride']);
  // Table au script protégé : on dit quoi changer, sans rien écrire.
  fs.rmSync(vbs);
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx'), vpxWithScript(SCRIPT_2001, true));
  const locked = diagnose(entry(), ctx);
  assert.deepEqual(locked.map((f) => f.code), ['pupDisabledByScript']);
  assert.equal(locked[0]!.fix, undefined);
  assert.match(locked[0]!.detail, /usePUP = True/);
  // Pas de pack installé : rien à allumer.
  fs.rmSync(path.join(folder, 'pupvideos'), { recursive: true });
  assert.ok(!diagnose(entry(), ctx).some((f) => f.code === 'pupDisabledByScript'));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('import : table et PuP-Pack ensemble, script qui coupe le pack, allumé d’office dans un .vbs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-import2001-'));
  const tablesDir = path.join(root, 'tables');
  fs.mkdirSync(tablesDir);
  const staging = path.join(root, 'staging', '2001');
  const vpx = path.join(staging, '2001_SpaceOdyssey_v1.0.2.vpx');
  fs.mkdirSync(path.join(staging, 'HAL9000'), { recursive: true });
  fs.writeFileSync(vpx, vpxWithScript(SCRIPT_2001));
  fs.writeFileSync(path.join(staging, 'HAL9000', 'screens.pup'), 'ScreenNum\r\n');
  const plan = planImport([{ path: staging, label: '2001.zip', mode: 'copy', unpacked: true }], {
    tablesDir,
    scripts: new Map([[vpx.toLowerCase(), scriptFacts(SCRIPT_2001)]]),
  });
  const t = plan.tables[0]!;
  assert.deepEqual(
    t.steps.map((s) => s.target.split(path.sep).join('/')),
    ['2001_SpaceOdyssey_v1.0.2.vpx', 'pupvideos/HAL9000'],
  );
  assert.equal(t.scripts.length, 1);
  assert.ok(t.warnings.some((w) => /usePUP = False/.test(w)));
  applyImport(t, { trashDir: path.join(root, 'trash'), cleanupRoots: [] });
  const entry = scanTables(tablesDir)[0]!;
  assert.deepEqual(inventory(entry.file, true).scriptPatched, { pup: true, compat: false });
  assert.ok(!diagnose(entry, { tablesDir, script: scriptFacts(SCRIPT_2001) }).some((f) => f.code === 'pupDisabledByScript' || f.code === 'scriptOverride'));

  // Le pack arrive après la table (table déjà installée, script déjà lu) : allumé aussi.
  const root2 = path.join(root, 'tables2');
  fs.mkdirSync(path.join(root2, '2001 - A Space Odyssey (Original 2025)'), { recursive: true });
  const installed = path.join(root2, '2001 - A Space Odyssey (Original 2025)', '2001_SpaceOdyssey_v1.0.2.vpx');
  fs.writeFileSync(installed, vpxWithScript(SCRIPT_2001));
  const pack = path.join(root, 'staging', 'HAL9000');
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(path.join(pack, 'screens.pup'), 'ScreenNum\r\n');
  const later = planImport([{ path: pack, mode: 'copy' }], {
    tablesDir: root2,
    existing: [{ folder: path.dirname(installed), title: '2001 - A Space Odyssey', roms: [], pupNames: ['HAL9000'], pupOff: [installed] }],
  });
  const t2 = later.tables.find((x) => x.steps.length)!;
  assert.deepEqual(t2.scripts.map((s) => path.basename(s.to)), ['2001_SpaceOdyssey_v1.0.2.vbs']);
  fs.rmSync(root, { recursive: true });
});
