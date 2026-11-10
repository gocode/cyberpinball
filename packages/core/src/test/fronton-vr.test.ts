// Partie visible du fronton de VPX en VR (essai du 10 novembre 2026, The Matrix : fronton coupé à la moitié
// de sa hauteur, caché en bas par la caisse de la pièce VR de la table) ; mesures et captures du plugin.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
import { imageMayBeTransparent, implicitBackglass, largestFreeRectangle, lastVrMeasuresBlock, parseVrMeasures, primitiveVertex, vrBackglassView, zoneSetting } from '../fronton-vr';
import { biff, cfb, u32 } from './fixtures';

const repo = path.join(__dirname, '..', '..', '..', '..');
const f32 = (...values: number[]) => {
  const b = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => b.writeFloatLE(v, i * 4));
  return b;
};
const wide = (s: string) => Buffer.concat([u32(Buffer.byteLength(s, 'utf16le')), Buffer.from(s, 'utf16le')]);
const latin = (s: string) => Buffer.concat([u32(s.length), Buffer.from(s, 'latin1')]);

/** Une primitive faite d'un rectangle vertical dans le plan y, de x0 à x1 et de z0 à z1. */
function quad(name: string, y: number, x0: number, x1: number, z0: number, z1: number, opts: { visible?: boolean; image?: string; layer?: string } = {}): Buffer {
  const verts = Buffer.concat(
    [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ].map(([x, yy, z]) => f32(x!, yy!, z!, 0, -1, 0, 0, 0)),
  );
  const idx = Buffer.alloc(12);
  [0, 1, 2, 0, 2, 3].forEach((v, i) => idx.writeUInt16LE(v, i * 2));
  return Buffer.concat([
    u32(19),
    biff('VPOS', f32(0, 0, 0)),
    biff('VSIZ', f32(1, 1, 1)),
    biff('NAME', wide(name)),
    biff('TVIS', u32(opts.visible === false ? 0 : 1)),
    ...(opts.image ? [biff('IMAG', latin(opts.image))] : []),
    ...(opts.layer ? [biff('LANR', latin(opts.layer))] : []),
    biff('M3VN', u32(4)),
    biff('M3FN', u32(6)),
    biff('M3CX', zlib.deflateSync(verts)),
    biff('M3CI', zlib.deflateSync(idx)),
    biff('ENDB'),
  ]);
}

/** Une image de la table : son nom et ses octets (DATA dans le bloc JPEG, PinBinary). */
function image(name: string, data: Buffer): Buffer {
  return Buffer.concat([biff('NAME', latin(name)), biff('JPEG'), biff('NAME', latin(name)), biff('PATH', latin(`${name}.png`)), biff('SIZE', u32(data.length)), biff('DATA', data), biff('ENDB'), biff('ENDB')]);
}

/** En-tête d'un PNG (signature, IHDR) : type de couleur 6 (RGBA) ou 2 (RGB). */
function pngHead(colorType: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(8, 16);
  b.writeUInt32BE(8, 20);
  b[24] = 8;
  b[25] = colorType;
  return b;
}

function table(dir: string, items: Buffer[], images: Buffer[], script = ''): string {
  const code = Buffer.from(script, 'latin1');
  const gameData = Buffer.concat([biff('NAME', wide('Table1')), biff('CODE'), u32(code.length), code, biff('LEFT', f32(0)), biff('RGHT', f32(1000)), biff('BOTM', f32(2000)), biff('GLAS', f32(400)), biff('ENDB')]);
  const game: Record<string, Buffer> = { GameData: gameData };
  items.forEach((b, i) => (game[`GameItem${i}`] = b));
  images.forEach((b, i) => (game[`Image${i}`] = b));
  const file = path.join(dir, 'Table.vpx');
  fs.writeFileSync(file, cfb({ TableName: 'Table' }, game));
  return file;
}

test('fronton de VPX en VR : 4:3, 1,2 × la largeur de la table, centré, bas au haut de la vitre (player.cpp)', () => {
  assert.deepEqual(implicitBackglass({ left: 0, right: 1000, glassTop: 400 }), { x: -100, z: 400, width: 1200, height: 900 });
  // Primitive : échelle, translation, rotations, position (Primitive::RecalculateMatrices).
  const v = primitiveVertex([1, 0, 0], { size: [10, 1, 1], rot: [0, 0, 90, 0, 0, 0, 0, 0, 0], pos: [5, 0, 0] });
  assert.ok(Math.abs(v[0] - 5) < 1e-6 && Math.abs(v[1] - 10) < 1e-6);
});

test('fronton de VPX en VR : la caisse de la pièce VR en cache le bas, la zone visible est le haut ; une vitre transparente ne cache rien', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fronton-vr-'));
  // Caisse de la pièce VR (cachée dans le fichier, montrée en VR par le script : son calque « VRCab »), devant le
  // plan du fronton, sur sa moitié basse ; vitre transparente devant sa moitié haute.
  const file = table(dir, [quad('PinCab_Backbox', 40, -300, 1300, 300, 850, { visible: false, layer: 'VRCab' }), quad('VR_PupBackglass', 30, -300, 1300, 850, 1400, { image: 'glass' })], [image('glass', pngHead(6))]);
  const view = vrBackglassView(file)!;
  assert.ok(view.hidden > 0.4 && view.hidden < 0.6, `caché ${view.hidden}`);
  assert.deepEqual(
    view.occluders.map((o) => o.name),
    ['PinCab_Backbox'],
  );
  assert.equal(view.zone.left, 0);
  assert.equal(view.zone.top, 0);
  assert.equal(view.zone.right, 1);
  assert.ok(view.zone.bottom > 0.4 && view.zone.bottom < 0.55, `bas ${view.zone.bottom}`);
  assert.match(zoneSetting(view.zone), /^0\.0000,0\.0000,1\.0000,0\.\d{4}$/);
});

test('fronton de VPX en VR : un objet que le script montre ou cache selon le mode n’est pas compté, il est dit incertain', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fronton-vr-'));
  // Terminator 2 : Cab_FS ou Cab_DT selon Table1.ShowDT ; on ne sait pas lequel s'affiche en VR.
  const file = table(dir, [quad('Cab_FS', 40, -300, 1300, 300, 1000, { visible: false }), quad('Cab_DT', 40, -300, 1300, 300, 700)], [], 'If DesktopMode Then\nCab_FS.visible=0\nCab_DT.visible=1\nElse\nCab_FS.visible=1\nCab_DT.visible=0\nEnd If');
  const view = vrBackglassView(file)!;
  assert.equal(view.hidden, 0);
  assert.deepEqual(view.zone, { left: 0, top: 0, right: 1, bottom: 1 });
  assert.deepEqual(view.uncertain.map((o) => o.name).sort(), ['Cab_DT', 'Cab_FS']);
});

test('fronton de VPX en VR : images transparentes reconnues (PNG RGBA, WebP à alpha), plus grand rectangle libre', () => {
  assert.equal(imageMayBeTransparent(pngHead(6)), true);
  assert.equal(imageMayBeTransparent(pngHead(2)), false);
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'latin1');
  webp.write('WEBP', 8, 'latin1');
  webp.write('VP8X', 12, 'latin1');
  webp[20] = 0x10;
  assert.equal(imageMayBeTransparent(webp), true);
  webp[20] = 0x28; // ICC et EXIF, sans alpha (la caisse de The Matrix)
  assert.equal(imageMayBeTransparent(webp), false);
  assert.equal(imageMayBeTransparent(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40)])), false);
  // Grille 4 × 3, la ligne du bas occupée : le rectangle libre est les deux lignes du haut.
  const g = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(largestFreeRectangle(g, 4, 3), { x: 0, z: 0, w: 4, h: 2 });
});

test('mesures du plugin : relevés de 5 s et captures lus pour le journal', () => {
  const m = parseVrMeasures(
    [
      'debut zone=0,0,1,0.53 ordre=PUP,B2S',
      'mesure t=5 vpx=36.0 ecart_ms=80 fronton=72.0 pup=72.0 video=12.0 jeu=1.00 pompees=1.0 zone=0,0,1,0.53',
      'mesure t=10 vpx=30.0 ecart_ms=250 fronton=60.0 pup=60.0 video=18.0 jeu=0.98 pompees=1.0 zone=0,0,1,0.53',
      'capture nom=debut source=fenetre luminosite=41 taille=960x540 resultat=ok',
    ].join('\n'),
  )!;
  assert.equal(m.samples, 2);
  assert.deepEqual(m.vpx, { mean: 33, min: 30, max: 36 });
  assert.equal(m.worstGapMs, 250);
  assert.deepEqual(m.video, { mean: 15, min: 12, max: 18 });
  assert.deepEqual(m.captures, [{ name: 'debut', source: 'fenetre', brightness: 41, ok: true }]);
  assert.equal(parseVrMeasures(''), undefined);
});

test('mesures du plugin : jamais effacées ; le dernier bloc (une partie) lu, reporté une seule fois', () => {
  const text = ['debut zone=0,0,1,1 ordre=PUP', 'mesure t=5 vpx=40 ecart_ms=30 fronton=80 pup=80 video=30 jeu=1 pompees=0', 'rapporte 2026-11-10', 'debut zone=0,0,1,0.53 ordre=PUP', 'mesure t=5 vpx=20 ecart_ms=300 fronton=40 pup=40 video=9 jeu=1 pompees=1'].join('\n');
  const block = lastVrMeasuresBlock(text)!;
  assert.equal(block.reported, false);
  assert.equal(parseVrMeasures(block.text)!.vpx.mean, 20);
  assert.equal(lastVrMeasuresBlock(`${text}\nrapporte 2026-11-11`)!.reported, true);
  assert.equal(lastVrMeasuresBlock(''), undefined);
  // Le fichier n'est plus vidé avant une partie : la précédente est d'abord reportée.
  const frontend = read('app', 'src', 'frontend.ts');
  assert.doesNotMatch(frontend, /fs\.writeFileSync\(vrMeasuresFile\(\), ''\)/);
  assert.match(frontend, /function prepareVrMeasures\(\): void \{[\s\S]{0,400}noteVrMeasures\(true\);/);
});

test('partie dans le casque : la zone, les mesures et les captures réglées pour le plugin, et reportées au journal à la fin', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /const view = vr\.addBackglass \? cachedVrBackglassView\(tableFile, vrZonesFile\(\)\) : undefined;/);
  for (const key of ['Zone', 'LogFile', 'CaptureDir']) assert.ok(frontend.includes(`key: '${key}'`), key);
  assert.match(frontend, /if \(playedVr && vrGame\) noteVrMeasures\(\);/);
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  // Le fronton (cadré) et la pause dessinés dans la partie visible.
  assert.match(cpp, /cadre\.zone = zoneVisible\(ctx\);/);
  assert.match(cpp, /const Rect zone = zoneVisible\(ctx\);\s*const Rect r = cadrer\(L, H, zone\.l, zone\.h/);
  // Deux captures par partie, et les mesures toutes les 5 s.
  assert.match(cpp, /capturer\("debut"\);/);
  assert.match(cpp, /capturer\("pause"\);/);
  assert.match(cpp, /if \(duree < 5\.0\)\s*return;/);
});

function read(...p: string[]): string {
  return fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');
}
