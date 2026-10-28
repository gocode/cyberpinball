// PuP-Pack que personne ne lance (28 octobre 2026). Game of Thrones LE (VPW, Stern 2015) : table
// originale en FlexDMD, sans ROM ; son script ne crée jamais PinUpPlayer.PinDisplay
// (« Dim PuPlayer ' Not currently used ») ; le pack de mikeleonheart, rangé dans
// pupvideos\GOT PupPack v1.0, est fait pour PinUP Player branché sur B2S Server, qui le
// cherchait sous le nom du jeu pour B2S (cGameName = "gameofthrones"). Le plugin PUP de
// VPX 10.8.1 ne charge un pack de lui-même que pour un jeu PinMAME : vpinball.log disait
// « Plugin PUP loaded », jamais « PUP path », et le médecin ne disait rien (aucun nom attendu,
// donc aucune règle). Troisième PuP-Pack de suite installé sans vidéo sur le fronton.
// Invariants : tout pack présent est lancé avant la partie (par le script, la ROM ou le .vbs de
// Cyber Pinball), ou un constat dit pourquoi il ne le sera pas ; les déclencheurs que le plugin
// ne recevra jamais (images du DMD sans PinMAME) sont signalés.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts, type DoctorContext, type ScriptFacts } from '../doctor';
import { PUP_HEALTH_FINDINGS } from '../health';
import { addPupLoader, captureTriggers, expectedPackNames, pupLoaderNeeded, type PupCabinet } from '../puppack';
import { readScriptPatch } from '../scriptpatch';
import { scanTables } from '../tables';
import { readVpxScript, readVpxTableName } from '../vpxinfo';
import { vpxWithScript } from './fixtures';

/** Script de Game of Thrones LE réduit à ce qui compte : noms, valeurs et structure d'origine. */
const GOT = [
  'Option Explicit',
  'LoadCoreFiles',
  'Sub LoadCoreFiles',
  '    On Error Resume Next',
  '    ExecuteGlobal GetTextFile("controller.vbs")',
  '    If Err Then MsgBox "Can\'t open controller.vbs"',
  '    On Error Goto 0',
  'End Sub',
  'Const cGameName = "gameofthrones"  \' Used by B2S for DOF',
  'Const myGameName = "gameofthrones" \' Used for FlexDMD, High score storage, etc',
  "Const DMDMode = 1                   ' Use FlexDMD (currently the only option supported)",
  "Dim PuPlayer                ' Not currently used",
  'Sub Table1_Init()',
  '    LoadEM',
  '    if DMDMode = 1 then',
  '        set PuPlayer = New PinupNULL',
  '    End if',
  '    if b2son then Controller.B2SSetData 1,1',
  'End Sub',
  'Sub DMD_Init',
  '    Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
  'End Sub',
  "Class PinupNULL\t' Dummy Pinup class so I dont have to keep adding if cases when people dont choose pinup",
  'End Class',
  '',
].join('\r\n');

const VPX = 'Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx';
const PACK = 'GOT PupPack v1.0';
const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
const SCREENS = [HEADER, '0,Topper,,,0,off,,', '1,DMD,,,0,off,,', '2,Backglass,Backglass,,0,show,,"2,2,4,95,93"', '3,PlayField,,,0,off,,', ''].join('\r\n');
const TRIGGERS = [
  'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults',
  '1,0,STARTUP,*****,******,****,****,****,*****,****,****,****,****,0',
  '3,1,Intro,E140=1,2,AttractMode,"Intro completa.mp4",,6,,,,,0',
  '28,1,Balldrain,D202,2,Balldrain,,,10,,,,,0',
  '4,1,Stark,D11,2,"Choose your House",Stark.mp4,,7,,,,SetBG,0',
  '5,0,Baratheon,D12,2,"Choose your House",Baratheon.mp4,,7,,,,SetBG,0',
  '6,1,Sans image,D99,2,Varios,Tilt.mp4,,10,,,,,0',
  '',
].join('\r\n');

const CABINET: PupCabinet = { backglass: true, dmd: true, topper: false, fullDmd: true, tableBackglass: false };

/** Table installée comme sur la borne : pack sous le nom de son archive, option retenue dans le .info. */
function gameOfThrones(tablesDir: string, script = GOT, pack = PACK): string {
  const folder = path.join(tablesDir, 'Game of Thrones LE (Stern 2015)');
  const root = path.join(folder, 'pupvideos', pack);
  for (const dir of ['Backglass', 'PupCapture', 'Balldrain']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'screens.pup'), SCREENS);
  fs.writeFileSync(path.join(root, 'playlists.pup'), 'ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority\r\n0,Backglass,,0,0,100,0\r\n');
  fs.writeFileSync(path.join(root, 'triggers.pup'), TRIGGERS);
  fs.writeFileSync(path.join(root, 'Backglass', 'Backglass.mp4'), 'mp4');
  for (const n of [11, 12, 202]) fs.writeFileSync(path.join(root, 'PupCapture', `${n}.bmp`), 'bmp');
  fs.writeFileSync(path.join(folder, VPX), vpxWithScript(script));
  fs.writeFileSync(
    path.join(folder, 'Game of Thrones LE (Stern 2015).info'),
    JSON.stringify({ Info: { Title: 'Game of Thrones LE' }, CyberPinball: { pup: { [pack]: { option: 'Option 1 - PUP in BG y DMD Fulldmd', origin: pack } } } }, null, 2),
  );
  return folder;
}

/**
 * Ce que fera le plugin PUP au lancement : le nom passé à B2SInit/Init par le script joué (le .vbs
 * posé à côté, sinon celui de la table), sinon la ROM d'un jeu PinMAME ; le pack est chargé si
 * pupvideos\<nom>\screens.pup existe. undefined : aucun pack chargé.
 */
function loadedPack(folder: string): string | undefined {
  const vpx = fs.readdirSync(folder).find((f) => f.toLowerCase().endsWith('.vpx'))!;
  const vbs = path.join(folder, vpx.replace(/\.vpx$/i, '.vbs'));
  const played = fs.existsSync(vbs) ? fs.readFileSync(vbs, 'latin1') : readVpxScript(path.join(folder, vpx))!;
  const facts = scriptFacts(played);
  const name = facts.pup?.packNames[0] ?? (facts.usesPinmame ? facts.roms[0] : undefined);
  if (!name) return undefined;
  const dir = path.join(folder, 'pupvideos');
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).find((p) => p.toLowerCase() === name.toLowerCase()) : undefined;
  return found && fs.existsSync(path.join(dir, found, 'screens.pup')) ? found : undefined;
}

function tempTables(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-got-'));
}

test('Game of Thrones : ni le script ni une ROM ne lancent le pack ; il prend le nom du jeu pour B2S', () => {
  const facts = scriptFacts(GOT);
  assert.equal(facts.usesPinmame, false);
  assert.equal(facts.pup, undefined);
  assert.equal(facts.b2sName, 'gameofthrones');
  assert.equal(pupLoaderNeeded(facts), true);
  assert.deepEqual(expectedPackNames(facts), ['gameofthrones']);
  // Une table PinMAME est chargée par sa ROM ; un script qui lance PuP, par le nom qu'il donne.
  const rom: ScriptFacts = { usesPinmame: true, roms: ['got_l3'] };
  assert.equal(pupLoaderNeeded(rom), false);
  const pup = scriptFacts(GOT.replace("Dim PuPlayer                ' Not currently used", 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "GoT"'));
  assert.equal(pupLoaderNeeded(pup), false);
  assert.deepEqual(expectedPackNames(pup), ['GoT']);
});

test('lancement ajouté : appel en tête de Table1_Init, Sub à la fin, numéros de ligne inchangés', () => {
  const out = addPupLoader(GOT, { pack: 'gameofthrones', table: 'table1' });
  const before = GOT.split('\r\n');
  const after = out.split('\r\n');
  const changed = before.flatMap((l, i) => (l === after[i] ? [] : [i]));
  // La ligne de la Sub, et la dernière (vide) où commence l'ajout.
  assert.deepEqual(changed, [12, before.length - 1]);
  assert.equal(after[12], 'Sub Table1_Init() : CyberPinball_PuPStart');
  assert.match(out, /Sub CyberPinball_PuPStart : On Error Resume Next : Set CyberPinball_PuP = CreateObject\("PinUpPlayer\.PinDisplay"\) : CyberPinball_PuP\.B2SInit "", "gameofthrones" : Err\.Clear : End Sub\r\n$/);
  // Le script joué lance désormais ce pack, comme le lirait le médecin.
  assert.deepEqual(scriptFacts(out).pup?.packNames, ['gameofthrones']);
  // Sans Sub <table>_Init, le lancement se fait au chargement du script ; un guillemet est doublé.
  const bare = addPupLoader('Dim x\n', { pack: 'a"b' });
  assert.equal(bare, 'Dim x\nDim CyberPinball_PuP\nSub CyberPinball_PuPStart : On Error Resume Next : Set CyberPinball_PuP = CreateObject("PinUpPlayer.PinDisplay") : CyberPinball_PuP.B2SInit "", "a""b" : Err.Clear : End Sub\nCyberPinball_PuPStart\n');
});

test('nom de l’objet table lu dans le .vpx (événements <nom>_Init)', () => {
  const dir = tempTables();
  const file = path.join(dir, 't.vpx');
  fs.writeFileSync(file, vpxWithScript(GOT));
  assert.equal(readVpxTableName(file), 'Table1');
  assert.equal(readVpxTableName(path.join(dir, 'absent.vpx')), undefined);
});

test('avant la partie : pack renommé (option gardée), puis lancé par le .vbs', () => {
  const tablesDir = tempTables();
  const folder = gameOfThrones(tablesDir);
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(GOT), cabinet: CABINET };
  assert.equal(loadedPack(folder), undefined);
  // Le médecin le dit : avant, aucun constat.
  const before = diagnose(scanTables(tablesDir)[0]!, ctx).filter((f) => f.code.startsWith('pup'));
  assert.equal(before[0]?.code, 'pupMissing');
  assert.match(before[0]!.fix!.label, /GOT PupPack v1\.0.*gameofthrones/);
  const done = repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  assert.deepEqual(done.map((f) => f.code), ['pupMissing', 'pupNotLoaded']);
  assert.equal(loadedPack(folder), 'gameofthrones');
  const vbs = fs.readFileSync(path.join(folder, VPX.replace(/\.vpx$/, '.vbs')), 'latin1');
  assert.deepEqual(readScriptPatch(vbs)?.loader, { pack: 'gameofthrones', table: 'Table1' });
  // L'option retenue suit le pack sous son nouveau nom.
  const info = JSON.parse(fs.readFileSync(path.join(folder, 'Game of Thrones LE (Stern 2015).info'), 'utf8'));
  assert.deepEqual(Object.keys(info.CyberPinball.pup), ['gameofthrones']);
  assert.equal(info.CyberPinball.pup.gameofthrones.option, 'Option 1 - PUP in BG y DMD Fulldmd');
  // Plus rien à réparer : le .vbs est reconnu comme celui de Cyber Pinball.
  const after = diagnose(scanTables(tablesDir)[0]!, ctx);
  assert.ok(!after.some((f) => ['pupMissing', 'pupNotLoaded', 'scriptOverride', 'scriptPatchStale'].includes(f.code)), after.map((f) => f.code).join(', '));
  assert.deepEqual(repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` }), []);
});

test('table mise à jour : le .vbs est refait avec le lancement, tant que le nouveau script ne lance pas le pack', () => {
  const tablesDir = tempTables();
  const folder = gameOfThrones(tablesDir, GOT, 'gameofthrones');
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(GOT), cabinet: CABINET };
  repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  const updated = GOT.replace('Const myGameName', "' 1.2.2\r\nConst myGameName");
  fs.writeFileSync(path.join(folder, VPX), vpxWithScript(updated));
  const stale = diagnose(scanTables(tablesDir)[0]!, { ...ctx, script: scriptFacts(updated) }).find((f) => f.code === 'scriptPatchStale');
  assert.ok(stale?.fix);
  const op = stale.fix.ops[0]!;
  assert.equal(op.op, 'write');
  assert.match(op.op === 'write' ? op.content : '', /B2SInit "", "gameofthrones"/);
  repairPupForPlay(scanTables(tablesDir)[0]!, { ...ctx, script: scriptFacts(updated) }, { trashDir: `${tablesDir}-corbeille` });
  assert.equal(loadedPack(folder), 'gameofthrones');
  // Le nouveau script lance lui-même le pack : le .vbs part à la corbeille.
  const own = GOT.replace("Dim PuPlayer                ' Not currently used", 'Dim PuPlayer : Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "gameofthrones"');
  fs.writeFileSync(path.join(folder, VPX), vpxWithScript(own));
  const gone = diagnose(scanTables(tablesDir)[0]!, { ...ctx, script: scriptFacts(own) }).find((f) => f.code === 'scriptPatchStale');
  assert.equal(gone?.fix?.ops[0]?.op, 'trash');
});

test('sans nom de jeu pour B2S : le seul dossier du pack sert de nom ; plusieurs dossiers : constat sans silence', () => {
  // myGameName (FlexDMD, scores) n'est pas le nom donné à B2S.
  const noName = GOT.replace(/Const cGameName = .*\r\n/, '');
  assert.equal(scriptFacts(noName).b2sName, undefined);
  const tablesDir = tempTables();
  const folder = gameOfThrones(tablesDir, noName);
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(noName), cabinet: CABINET };
  const done = repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  assert.deepEqual(done.map((f) => f.code), ['pupNotLoaded']);
  assert.equal(loadedPack(folder), PACK);
  // Deux packs, rien pour choisir : le médecin le dit (avant : aucun constat).
  fs.rmSync(path.join(folder, VPX.replace(/\.vpx$/, '.vbs')));
  fs.cpSync(path.join(folder, 'pupvideos', PACK), path.join(folder, 'pupvideos', 'GOT PupPack v0.9'), { recursive: true });
  const found = diagnose(scanTables(tablesDir)[0]!, ctx).filter((f) => f.code.startsWith('pup'));
  assert.equal(found[0]?.code, 'pupMissing');
  assert.equal(found[0]?.fix, undefined);
  assert.match(found[0]!.detail, /GOT PupPack v0\.9/);
});

test('PuPCapture sans PinMAME : les déclencheurs par images du DMD sont signalés, comptés', () => {
  const tablesDir = tempTables();
  const folder = gameOfThrones(tablesDir, GOT, 'gameofthrones');
  // Actifs : E140=1, D202, D11, D99 ; avec une image : D202 et D11 (D12 est inactif).
  assert.deepEqual(captureTriggers(path.join(folder, 'pupvideos', 'gameofthrones')), { capture: 2, total: 4 });
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(GOT), cabinet: CABINET };
  const unseen = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'pupCaptureUnseen');
  assert.equal(unseen?.severity, 'warning');
  assert.match(unseen!.detail, /2 déclencheurs sur 4/);
  assert.ok((PUP_HEALTH_FINDINGS as readonly string[]).includes('pupCaptureUnseen'));
  assert.ok((PUP_HEALTH_FINDINGS as readonly string[]).includes('pupNotLoaded'));
  // Un script qui envoie lui-même des « D » : on ne peut rien dire.
  const sends = GOT.replace("Dim PuPlayer                ' Not currently used", 'Dim PuPlayer : Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "gameofthrones" : PuPlayer.B2SData "D"&202,1');
  assert.equal(scriptFacts(sends).pup?.dmdTriggers, true);
  assert.equal(diagnose(scanTables(tablesDir)[0]!, { ...ctx, script: scriptFacts(sends) }).find((f) => f.code === 'pupCaptureUnseen'), undefined);
  // Une table PinMAME reçoit les images de sa ROM.
  const rom: ScriptFacts = { usesPinmame: true, roms: ['gameofthrones'] };
  assert.equal(diagnose(scanTables(tablesDir)[0]!, { ...ctx, script: rom }).find((f) => f.code === 'pupCaptureUnseen'), undefined);
});

test('invariant : chaque forme de table voit son pack chargé après les réparations d’avant-partie', () => {
  const shapes: { name: string; script: string; pack: string }[] = [
    { name: 'sans ROM, sans PuP dans le script (Game of Thrones)', script: GOT, pack: PACK },
    { name: 'B2SInit avec le nom du dossier', script: GOT.replace("Dim PuPlayer                ' Not currently used", 'Dim PuPlayer : Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "GOT"'), pack: 'got' },
    { name: 'B2SInit, pack sous un autre nom', script: GOT.replace("Dim PuPlayer                ' Not currently used", 'Dim PuPlayer : Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "GOT"'), pack: PACK },
    { name: 'pack coupé par usePUP = False', script: GOT.replace("Dim PuPlayer                ' Not currently used", 'Const usePUP = False\r\nDim PuPlayer\r\nSub PuPStart\r\nIf usePUP Then\r\nSet PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", "GOT"\r\nEnd If\r\nEnd Sub').replace('    LoadEM', '    LoadEM : PuPStart'), pack: 'GOT' },
    { name: 'jeu PinMAME, chargé par sa ROM', script: GOT.replace('    LoadEM', '    LoadVPM "01560000", "sam.vbs", 3.10').replace('Const cGameName = "gameofthrones"', 'Const cGameName = "got_l3" : Controller.GameName = cGameName'), pack: 'GOT_L3' },
  ];
  for (const shape of shapes) {
    const tablesDir = tempTables();
    const folder = gameOfThrones(tablesDir, shape.script, shape.pack);
    const ctx: DoctorContext = { tablesDir, script: scriptFacts(shape.script), cabinet: CABINET };
    repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
    assert.ok(loadedPack(folder), `${shape.name} : aucun pack chargé (${fs.readdirSync(path.join(folder, 'pupvideos')).join(', ')})`);
  }
});
