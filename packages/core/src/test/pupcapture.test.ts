// Déclencheurs « D » d'un PuP-Pack sur une table FlexDMD sans ROM (prototype, 28 octobre 2026).
// Game of Thrones LE (VPW) : 183 des 185 déclencheurs actifs du pack attendent une image du DMD
// (PupCapture\<n>.bmp), que le plugin PUP de VPX 10.8.1 ne reçoit que de PinMAME. Le .vbs de
// Cyber Pinball peut refaire la reconnaissance sur FlexDMD.DmdPixels.
// Invariants : une capture est lue comme la lit libpupdmd (niveaux par le rouge, cadre de masque) ;
// le VBScript généré, exécuté pour de vrai (cscript, avec un FlexDMD et un PinDisplay simulés),
// envoie exactement les déclencheurs que donnerait libpupdmd (première capture par numéro, jamais
// deux fois de suite la même) ; les numéros de ligne du script de la table ne bougent pas.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addCaptureWatch,
  captureWatchLines,
  findFlexDmdObject,
  findFrameTimer,
  flexRenderDepth,
  matchCapture,
  readCaptureBmp,
  readCaptures,
  regionHash,
  type CaptureImage,
  type PupCapture,
  type CaptureRegion,
} from '../pupcapture';
import { scriptCode } from '../vbscript';

const W = 128;
const H = 32;

/** BMP 24 bits de 128 × 32 comme ceux des packs : niveaux en orange (rouge = 17 × niveau), cadre de masque éventuel. */
function bmp(levels: Uint8Array, mask?: CaptureRegion): Buffer {
  const out = Buffer.alloc(54 + W * H * 3);
  out.write('BM', 0, 'latin1');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(W, 18);
  out.writeInt32LE(H, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = 54 + ((H - 1 - y) * W + x) * 3;
      const onFrame = mask && ((x === mask.x - 1 || x === mask.x + mask.w) && y >= mask.y - 1 && y <= mask.y + mask.h || (y === mask.y - 1 || y === mask.y + mask.h) && x >= mask.x - 1 && x <= mask.x + mask.w);
      const v = levels[y * W + x]!;
      if (onFrame) [out[o], out[o + 1], out[o + 2]] = [253, 0, 253];
      else [out[o], out[o + 1], out[o + 2]] = [0, Math.round(v * 4.06), v * 17];
    }
  }
  return out;
}

/** Image de niveaux 0-15 tirée d'une graine (motif reproductible). */
function pattern(seed: number): Uint8Array {
  const a = new Uint8Array(W * H);
  let s = seed;
  for (let i = 0; i < a.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    a[i] = (s >> 16) % 3 === 0 ? (s >> 8) & 15 : 0;
  }
  return a;
}

/** Ce que rend FlexDMD.DmdPixels pour une image de niveaux. */
const dmd = (levels: Uint8Array) => Uint8Array.from(levels, (v) => v * 17);

const A = pattern(1);
const B = pattern(2);
const C = pattern(3);
const ZONE: CaptureRegion = { x: 70, y: 1, w: 55, h: 30 };
const WATCH: PupCapture = { pack: 'gameofthrones', flex: 'FlexDMD', pup: 'CyberPinball_PuP', timer: 'FrameTimer', depth: 4, sig: '0' };

function pack(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupcapture-'));
  const dir = path.join(root, 'PUPCAPTURE');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '3.bmp'), bmp(A));
  fs.writeFileSync(path.join(dir, '5.bmp'), bmp(A)); // même image que 3 : le plugin prend 3
  fs.writeFileSync(path.join(dir, '7.bmp'), bmp(B, ZONE));
  fs.writeFileSync(path.join(dir, 'D12.bmp'), bmp(C)); // numéro cherché dans le nom, comme libpupdmd
  fs.writeFileSync(path.join(dir, '13.bmp'), bmp(C).subarray(0, 600)); // tronqué : ignoré
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  return root;
}

test('Capture lue comme libpupdmd : niveaux par le rouge, cadre de masque, numéro dans le nom', () => {
  const captures = readCaptures(pack(), 4);
  assert.deepEqual(captures.map((c) => c.id), [3, 5, 7, 12]);
  const masked = captures.find((c) => c.id === 7)!;
  assert.deepEqual(masked.region, ZONE);
  // Le cadre lui-même compte pour 0 ; dans la zone, la valeur que donnerait FlexDMD.DmdPixels.
  assert.equal(masked.pixels[(ZONE.y - 1) * W + ZONE.x], 0);
  for (let y = ZONE.y; y < ZONE.y + ZONE.h; y++) for (let x = ZONE.x; x < ZONE.x + ZONE.w; x++) assert.equal(masked.pixels[y * W + x], B[y * W + x]! * 17);
  assert.deepEqual(captures[0]!.region, { x: 0, y: 0, w: W, h: H });
  assert.deepEqual(captures[0]!.pixels, dmd(A));
  // En 2 bits, les seuils de libpupdmd : < 48 → 1, < 128 → 2, sinon 3 ; rendus en 85, 170, 255.
  const two = readCaptureBmp(bmp(Uint8Array.from({ length: W * H }, (_, i) => [0, 2, 5, 9][i % 4]!)), 2)!;
  assert.deepEqual([...two.pixels.subarray(0, 4)], [0, 85, 170, 255]);
});

test('Référence : la première capture par numéro, jamais deux fois de suite, zone masquée seulement', () => {
  const captures = readCaptures(pack(), 4);
  let last = 0;
  const run = (frame: Uint8Array) => {
    const r = matchCapture(captures, frame, last);
    last = r.last;
    return r.trigger;
  };
  const outside = dmd(C);
  for (let y = ZONE.y; y < ZONE.y + ZONE.h; y++) for (let x = ZONE.x; x < ZONE.x + ZONE.w; x++) outside[y * W + x] = B[y * W + x]! * 17;
  assert.deepEqual([dmd(A), dmd(A), dmd(C), outside, dmd(pattern(9)), dmd(A)].map(run), [3, 0, 12, 7, 0, 3]);
});

/** Trace du VBScript généré, exécuté par cscript sur une suite d'images de FlexDMD. */
function runVbs(captures: CaptureImage[], frames: Uint8Array[], step = 300): string[] {
  const table = ['Sub FrameTimer_Timer() \' frame timer', 'End Sub', ''].join('\r\n');
  const watched = addCaptureWatch(table, 'FrameTimer', captureWatchLines(captures, WATCH))!;
  const harness = [
    'Dim GameTime : GameTime = 0',
    'Class FakeFlex : Public DmdPixels : End Class',
    'Class FakePup : Public Sub B2SData(n, v) : WScript.Echo n & "=" & v : End Sub : End Class',
    'Dim FlexDMD : Set FlexDMD = New FakeFlex',
    'Dim CyberPinball_PuP : Set CyberPinball_PuP = New FakePup',
    'Function Frame(s) : Dim a(4095), i : For i = 0 To 4095 : a(i) = CInt("&H" & Mid(s, i + 1, 1)) * 17 : Next : Frame = a : End Function',
    watched,
    ...frames.map((f) => `FlexDMD.DmdPixels = Frame("${Array.from(f, (v) => (v / 17).toString(16)).join('')}") : GameTime = GameTime + ${step} : FrameTimer_Timer : WScript.Echo "-"`),
  ].join('\r\n');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-vbs-')), 'watch.vbs');
  fs.writeFileSync(file, harness, 'latin1');
  const run = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  // Une entrée par image : les déclencheurs envoyés pendant cette image.
  return run.stdout.split(/\r?\n/).filter(Boolean).join(' ').split('-').slice(0, frames.length).map((s) => s.trim());
}

test('VBScript généré : mêmes déclencheurs que libpupdmd, exécuté par cscript', { skip: process.platform !== 'win32' }, () => {
  const captures = readCaptures(pack(), 4);
  const zoneOnC = dmd(C);
  for (let y = ZONE.y; y < ZONE.y + ZONE.h; y++) for (let x = ZONE.x; x < ZONE.x + ZONE.w; x++) zoneOnC[y * W + x] = B[y * W + x]! * 17;
  const nearA = dmd(A);
  nearA[W * H - 1] = nearA[W * H - 1] === 0 ? 17 : 0; // un seul point de différence
  const frames = [new Uint8Array(W * H), dmd(A), dmd(A), nearA, dmd(C), zoneOnC, dmd(pattern(9)), dmd(A), dmd(C)];
  let last = 0;
  const expected = frames.map((f) => {
    const r = matchCapture(captures, f, last);
    last = r.last;
    return r.trigger ? `D${r.trigger}=1 D${r.trigger}=0` : '';
  });
  assert.deepEqual(expected, ['', 'D3=1 D3=0', '', '', 'D12=1 D12=0', 'D7=1 D7=0', '', 'D3=1 D3=0', 'D12=1 D12=0']);
  assert.deepEqual(runVbs(captures, frames), expected);
  // Lectures trop rapprochées (moins de 20 ms de GameTime) : une image sur deux seulement est lue.
  assert.deepEqual(runVbs(captures, [dmd(A), dmd(C), dmd(C), dmd(A)], 10), ['D3=1 D3=0', '', 'D12=1 D12=0', '']);
});

test('Script de la table : appel au début du minuteur d\'images, numéros de ligne inchangés', () => {
  const captures = readCaptures(pack(), 4);
  const got = [
    'Option Explicit',
    "FrameTimer.Interval = -1",
    "Sub FrameTimer_Timer() 'The frame timer interval should be -1, so executes at the display frame rate",
    '    RollingUpdate',
    'End Sub',
    'CorTimer.Interval = 10',
    'Sub CorTimer_Timer(): Cor.Update: End Sub',
    'Sub LoadFlexDMD',
    '    Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
    '    With FlexDMD',
    '        .RenderMode = FlexDMD_RenderMode_DMD_GRAY_4',
    '    End With',
    'End Sub',
    '',
  ].join('\r\n');
  const code = scriptCode(got);
  assert.equal(findFrameTimer(code), 'FrameTimer');
  assert.equal(findFlexDmdObject(code), 'FlexDMD');
  assert.equal(flexRenderDepth(code), 4);
  assert.equal(flexRenderDepth('FlexDMD.RenderMode = 0'), 2);
  assert.equal(flexRenderDepth('.RenderMode = FlexDMD_RenderMode_DMD_RGB'), undefined);
  const out = addCaptureWatch(got, 'FrameTimer', captureWatchLines(captures, WATCH))!;
  const before = got.split('\r\n');
  const after = out.split('\r\n');
  assert.equal(after[2], "Sub FrameTimer_Timer() : CyberPinball_PuPCapture 'The frame timer interval should be -1, so executes at the display frame rate");
  for (let i = 0; i < before.length - 1; i++) if (i !== 2) assert.equal(after[i], before[i]);
  assert.ok(after.slice(before.length - 1).every((l) => l === '' || !/^\s*Sub FrameTimer_Timer/i.test(l)));
  // Sans minuteur d'images (ou sans capture), rien à brancher.
  assert.equal(findFrameTimer(scriptCode('Sub FrameTimer_Timer\r\nEnd Sub\r\n')), undefined);
  assert.equal(addCaptureWatch(got, 'GameTimer', captureWatchLines(captures, WATCH)), undefined);
  assert.equal(addCaptureWatch(got, 'FrameTimer', []), undefined);
});

test('Empreinte : identique sur la zone seulement, et dans les bornes du calcul exact en VBScript', () => {
  const r: CaptureRegion = { x: 10, y: 2, w: 20, h: 5 };
  const a = dmd(A);
  const b = Uint8Array.from(a);
  b[0] = b[0] ? 0 : 255; // hors zone
  assert.equal(regionHash(a, r), regionHash(b, r));
  b[2 * W + 10] = b[2 * W + 10] ? 0 : 255;
  assert.notEqual(regionHash(a, r), regionHash(b, r));
  const all = new Uint8Array(W * H).fill(255);
  const h = regionHash(all, { x: 0, y: 0, w: W, h: H });
  assert.ok(h >= 0 && h < 1000000007 && Number.isInteger(h));
  // Le code généré garde ses données sur une ligne par capture.
  const lines = captureWatchLines(readCaptures(pack(), 4), WATCH);
  assert.equal(lines.filter((l) => /^ {2}CyberPinball_PuPCap(Full\.Item\("[0-9A-F]+"\)|Masked\(\d+\)) =/.test(l)).length, 4);
});
