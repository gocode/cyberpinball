// Reconnaissance PupCapture posée par le médecin (28 octobre 2026). Game of Thrones LE (VPW) :
// table FlexDMD sans ROM, pack lancé par le .vbs de Cyber Pinball ; 183 de ses 185 déclencheurs
// actifs attendent une image du DMD que le plugin PUP ne reçoit pas. Le .vbs les reconnaît sur
// FlexDMD.DmdPixels (pupcapture.ts).
// Invariants : avant chaque partie, le .vbs joué a la reconnaissance à jour, une seule fois, avec
// ce qu'il avait déjà (lancement du pack, interrupteurs) ; il reste reconnu comme celui de Cyber
// Pinball ; captures ou table changées, il est refait ; quand c'est impossible, le constat dit
// pourquoi au lieu de se taire.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import type { PupCabinet } from '../puppack';
import { CAPTURE_HEAD, addCaptureWatch, captureBlock, captureSettings, captureSignature, captureWatchLines, readCaptures, type PupCapture } from '../pupcapture';
import { readScriptPatch, scriptPatchState } from '../scriptpatch';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

const W = 128;
const H = 32;

/** BMP 24 bits de 128 × 32 en orange, comme ceux des packs. */
function bmp(seed: number): Buffer {
  const out = Buffer.alloc(54 + W * H * 3);
  out.write('BM', 0, 'latin1');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(W, 18);
  out.writeInt32LE(H, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  let s = seed;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[54 + i * 3 + 2] = ((s >> 16) % 3 === 0 ? (s >> 8) & 15 : 0) * 17;
  }
  return out;
}

/** Script de Game of Thrones réduit à ce qui compte ici : FlexDMD en GRAY_4, minuteur d'images, aucun PuP. */
const GOT = [
  'Option Explicit',
  'Const cGameName = "gameofthrones"  \' Used by B2S for DOF',
  "Dim PuPlayer                ' Not currently used",
  'Dim FlexDMD',
  "'The FrameTimer interval should be -1, so executes at the display frame rate",
  'FrameTimer.Interval = -1',
  "Sub FrameTimer_Timer() 'The frame timer interval should be -1, so executes at the display frame rate",
  '    RollingUpdate',
  'End Sub',
  'Sub Table1_Init()',
  '    LoadFlexDMD',
  'End Sub',
  'Sub LoadFlexDMD',
  '    Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
  '    With FlexDMD',
  '        .RenderMode = FlexDMD_RenderMode_DMD_GRAY_4',
  '    End With',
  'End Sub',
  '',
].join('\r\n');

const VPX = 'Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx';
const VBS = VPX.replace(/\.vpx$/, '.vbs');
const SCREENS = ['ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos', '0,Topper,,,0,off,,', '1,DMD,,,0,off,,', '2,Backglass,Backglass,,0,show,,', ''].join('\r\n');
const TRIGGERS = [
  'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults',
  '3,1,Intro,E140=1,2,Backglass,,,6,,,,,0',
  '4,1,Stark,D11,2,Backglass,,,7,,,,,0',
  '28,1,Balldrain,D202,2,Backglass,,,10,,,,,0',
  '',
].join('\r\n');
const CABINET: PupCabinet = { backglass: true, dmd: true, topper: false, fullDmd: false, tableBackglass: false };

function table(script = GOT): { tablesDir: string; folder: string; pack: string; ctx: DoctorContext } {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-capture-'));
  const folder = path.join(tablesDir, 'Game of Thrones LE (Stern 2015)');
  const pack = path.join(folder, 'pupvideos', 'gameofthrones');
  for (const dir of ['Backglass', 'PupCapture']) fs.mkdirSync(path.join(pack, dir), { recursive: true });
  fs.writeFileSync(path.join(pack, 'screens.pup'), SCREENS);
  fs.writeFileSync(path.join(pack, 'playlists.pup'), 'ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority\r\n2,Backglass,,0,0,100,0\r\n');
  fs.writeFileSync(path.join(pack, 'triggers.pup'), TRIGGERS);
  fs.writeFileSync(path.join(pack, 'Backglass', 'Backglass.mp4'), 'mp4');
  fs.writeFileSync(path.join(pack, 'PupCapture', '11.bmp'), bmp(11));
  fs.writeFileSync(path.join(pack, 'PupCapture', '202.bmp'), bmp(202));
  fs.writeFileSync(path.join(folder, VPX), vpxWithScript(script));
  return { tablesDir, folder, pack, ctx: { tablesDir, script: scriptFacts(script), cabinet: CABINET } };
}

const entry = (tablesDir: string) => scanTables(tablesDir)[0]!;
const repair = (t: ReturnType<typeof table>, ctx = t.ctx) => repairPupForPlay(entry(t.tablesDir), ctx, { trashDir: `${t.tablesDir}-corbeille` }).map((f) => f.code);
const vbsOf = (t: ReturnType<typeof table>) => fs.readFileSync(path.join(t.folder, VBS), 'latin1');
const count = (text: string, part: string) => text.split(part).length - 1;

test('avant la partie : pack lancé, puis images du DMD reconnues ; ensuite plus rien à faire', () => {
  const t = table();
  const before = diagnose(entry(t.tablesDir), t.ctx).find((f) => f.code === 'pupCaptureUnseen');
  assert.ok(before?.fix, 'réparable');
  assert.match(before.detail, /2 déclencheurs sur 3/);
  assert.match(before.fix.label, /gameofthrones.*VPW 1\.2\.1\.vbs/);
  assert.deepEqual(repair(t), ['pupNotLoaded', 'pupCaptureUnseen']);
  const vbs = vbsOf(t);
  const patch = readScriptPatch(vbs)!;
  assert.deepEqual(patch.loader, { pack: 'gameofthrones', table: 'Table1' });
  assert.deepEqual({ ...patch.capture, sig: undefined }, { pack: 'gameofthrones', flex: 'FlexDMD', pup: 'CyberPinball_PuP', timer: 'FrameTimer', depth: 4, sig: undefined });
  assert.equal(patch.capture!.sig, captureSignature(t.pack));
  // Numéros de ligne inchangés : l'appel est sur la ligne de la Sub, le reste après la dernière ligne.
  const rows = vbs.split('\r\n');
  assert.equal(rows[6], "Sub FrameTimer_Timer() : CyberPinball_PuPCapture 'The frame timer interval should be -1, so executes at the display frame rate");
  assert.equal(rows[9], 'Sub Table1_Init() : CyberPinball_PuPStart');
  assert.equal(count(vbs, CAPTURE_HEAD), 1);
  assert.equal(scriptPatchState(vbs, GOT).kind, 'ours');
  // Le médecin n'a plus rien à dire du pack ni du .vbs.
  const after = diagnose(entry(t.tablesDir), t.ctx);
  assert.ok(!after.some((f) => ['pupCaptureUnseen', 'pupNotLoaded', 'scriptOverride', 'scriptPatchStale'].includes(f.code)), after.map((f) => f.code).join(', '));
  assert.deepEqual(repair(t), []);
});

test('captures changées dans le pack : la reconnaissance est refaite à sa place, une seule fois', () => {
  const t = table();
  repair(t);
  fs.writeFileSync(path.join(t.pack, 'PupCapture', '202.bmp'), bmp(999));
  const stale = diagnose(entry(t.tablesDir), t.ctx).find((f) => f.code === 'pupCaptureUnseen');
  assert.equal(stale?.title, 'Reconnaissance des images du DMD à refaire');
  assert.deepEqual(repair(t), ['pupCaptureUnseen']);
  const vbs = vbsOf(t);
  assert.equal(count(vbs, CAPTURE_HEAD), 1);
  assert.equal(count(vbs, ': CyberPinball_PuPCapture'), 1);
  assert.equal(readScriptPatch(vbs)!.capture!.sig, captureSignature(t.pack));
  assert.equal(scriptPatchState(vbs, GOT).kind, 'ours');
  assert.deepEqual(repair(t), []);
});

test('table mise à jour : le .vbs est refait avec le lancement et la reconnaissance', () => {
  const t = table();
  repair(t);
  const updated = GOT.replace('Dim FlexDMD', "' 1.2.2\r\nDim FlexDMD");
  fs.writeFileSync(path.join(t.folder, VPX), vpxWithScript(updated));
  const ctx = { ...t.ctx, script: scriptFacts(updated) };
  const stale = diagnose(entry(t.tablesDir), ctx).find((f) => f.code === 'scriptPatchStale');
  const op = stale?.fix?.ops[0];
  assert.equal(op?.op, 'write');
  assert.equal(count(op.op === 'write' ? op.content : '', CAPTURE_HEAD), 1);
  assert.deepEqual(repair(t, ctx), ['scriptPatchStale']);
  const vbs = vbsOf(t);
  assert.equal(scriptPatchState(vbs, updated).kind, 'ours');
  assert.match(vbs, /^Sub FrameTimer_Timer\(\) : CyberPinball_PuPCapture /m);
  assert.deepEqual(repair(t, ctx), []);
});

test('.vbs venu d’ailleurs : la reconnaissance y est ajoutée, puis reconnue à jour', () => {
  const t = table();
  repair(t);
  // Un .vbs retouché à la main garde ce qu'il avait ; Cyber Pinball ne le refait pas d'après la table.
  const foreign = GOT.replace('    RollingUpdate', '    RollingUpdate \' retouche');
  fs.writeFileSync(path.join(t.folder, VBS), foreign, 'latin1');
  const found = diagnose(entry(t.tablesDir), t.ctx).filter((f) => f.code === 'pupCaptureUnseen' || f.code === 'pupNotLoaded');
  assert.deepEqual(found.map((f) => f.code), ['pupNotLoaded', 'pupCaptureUnseen']);
  repair(t);
  const vbs = vbsOf(t);
  assert.match(vbs, /RollingUpdate ' retouche/);
  assert.equal(count(vbs, CAPTURE_HEAD), 1);
  assert.match(vbs, /CyberPinball_PuP\.B2SInit "", "gameofthrones"/);
  assert.equal(captureBlock(vbs)?.settings.pup, 'CyberPinball_PuP');
  assert.deepEqual(repair(t), []);
});

test('pack coupé par usePUP = False : interrupteur allumé et reconnaissance, sur l’objet du script', () => {
  const script = GOT.replace(
    "Dim PuPlayer                ' Not currently used",
    'Const usePUP = False\r\nDim PuPlayer\r\nSub PuPStart\r\nIf usePUP Then\r\nSet PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", "gameofthrones"\r\nEnd If\r\nEnd Sub',
  ).replace('Sub Table1_Init()\r\n    LoadFlexDMD', 'Sub Table1_Init()\r\n    LoadFlexDMD : PuPStart');
  const t = table(script);
  assert.deepEqual(repair(t), ['pupDisabledByScript', 'pupCaptureUnseen']);
  const vbs = vbsOf(t);
  const patch = readScriptPatch(vbs)!;
  assert.equal(patch.switches[0]?.variable, 'usePUP');
  assert.equal(patch.loader, undefined);
  assert.equal(patch.capture?.pup, 'PuPlayer');
  assert.match(vbs, /^Const usePUP = True/m);
  assert.equal(scriptPatchState(vbs, script).kind, 'ours');
  assert.deepEqual(repair(t), []);
});

test('reconnaissance impossible : le constat le dit, sans correction', () => {
  // Sans minuteur appelé à chaque image.
  const noTimer = GOT.replace('FrameTimer.Interval = -1', 'FrameTimer.Interval = 10');
  let t = table(noTimer);
  let f = diagnose(entry(t.tablesDir), t.ctx).find((x) => x.code === 'pupCaptureUnseen');
  assert.equal(f?.fix, undefined);
  assert.match(f!.detail, /minuteur appelé à chaque image/);
  assert.deepEqual(repair(t), ['pupNotLoaded']);
  // DMD en couleurs.
  t = table(GOT.replace('FlexDMD_RenderMode_DMD_GRAY_4', 'FlexDMD_RenderMode_DMD_RGB'));
  f = diagnose(entry(t.tablesDir), t.ctx).find((x) => x.code === 'pupCaptureUnseen');
  assert.equal(f?.fix, undefined);
  assert.match(f!.detail, /niveaux de gris/);
  // Script protégé : rien à lire.
  t = table();
  fs.writeFileSync(path.join(t.folder, VPX), vpxWithScript(GOT, true));
  f = diagnose(entry(t.tablesDir), t.ctx).find((x) => x.code === 'pupCaptureUnseen');
  assert.equal(f?.fix, undefined);
  assert.match(f!.detail, /protégé/);
});

test('bloc de reconnaissance : remplacé à sa place, réglages relus, empreinte des captures', () => {
  const t = table();
  const settings = captureSettings(scriptCode(GOT), 'gameofthrones', t.pack, 'CyberPinball_PuP') as PupCapture;
  assert.equal(settings.timer, 'FrameTimer');
  const lines = captureWatchLines(readCaptures(t.pack, 4), settings);
  const once = addCaptureWatch(GOT, 'FrameTimer', lines)!;
  const twice = addCaptureWatch(once, 'FrameTimer', lines)!;
  assert.equal(twice, once);
  assert.deepEqual(captureBlock(once)?.settings, settings);
  assert.deepEqual(captureBlock(once)?.lines, lines);
  assert.equal(captureBlock(GOT), undefined);
  // Le bloc d'un .vbs suivi d'autres lignes est remplacé sans toucher à la suite.
  const other = captureWatchLines(readCaptures(t.pack, 4), { ...settings, sig: 'autre' });
  const replaced = addCaptureWatch(`${once}' fin\r\n`, 'FrameTimer', other)!;
  assert.equal(captureBlock(replaced)?.settings.sig, 'autre');
  assert.ok(replaced.endsWith("' fin\r\n"));
  // L'empreinte suit le contenu des captures, pas leur date.
  const sig = captureSignature(t.pack);
  fs.writeFileSync(path.join(t.pack, 'PupCapture', '11.bmp'), bmp(11));
  assert.equal(captureSignature(t.pack), sig);
  fs.writeFileSync(path.join(t.pack, 'PupCapture', '11.bmp'), bmp(12));
  assert.notEqual(captureSignature(t.pack), sig);
  // Ce qui empêche de brancher la reconnaissance.
  assert.deepEqual(captureSettings(scriptCode(GOT.replace('FlexDMD.FlexDMD', 'UltraDMD.DMDObject')), 'p', t.pack), { blocker: 'flex' });
  assert.deepEqual(captureSettings(scriptCode(GOT), 'p', t.pack), { blocker: 'pup' });
});
