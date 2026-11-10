// Le menu dans le casque (casque-scene.ts) : les écrans là où sont ceux de la vraie borne, sans
// caisson ; rien sur l'image du playfield, la teinte seulement en halo, un sol neutre, et pendant le
// calage les repères des coins de la barre avant.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { headsetPanels, rotateVector, type HeadsetSource, type Quaternion } from '../casque';
import { lockbarMarks } from '../calage';
import { HALO_ALPHA, headsetScene, rgba, SCENE_COLORS, sceneProtocol, seen, type ScenePrimitive, type Vec3 } from '../casque-scene';
import { edgeRotation } from '../model';

const sources: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 }, screenCm: { width: 95, height: 53.5 }, screenPx: { width: 3840, height: 2160 } },
  { role: 'backglass', rect: { x: 3840, y: 0, width: 1920, height: 1080 }, screenCm: { width: 70.8, height: 39.8 }, screenPx: { width: 1920, height: 1080 } },
  { role: 'dmd', rect: { x: 5760, y: 0, width: 1920, height: 1080 }, screenCm: { width: 34.5, height: 19.4 }, screenPx: { width: 1920, height: 1080 } },
];
const panels = headsetPanels(sources, edgeRotation('left'));
const pf = panels.find((p) => p.role === 'playfield')!;

/** Coordonnées d'un point de la borne dans le repère local du playfield (x, y dans son plan, z vers le haut). */
function inPlayfield(v: Vec3): Vec3 {
  const inverse: Quaternion = { x: -pf.orientation.x, y: -pf.orientation.y, z: -pf.orientation.z, w: pf.orientation.w };
  return rotateVector(inverse, { x: v.x - pf.position.x, y: v.y - pf.position.y, z: v.z - pf.position.z });
}

/** Coins d'une forme, dans l'espace de la borne. */
function corners(s: ScenePrimitive): Vec3[] {
  if (s.kind === 'disque') return [s.center];
  const half = s.kind === 'boite' ? { x: s.size.x / 2, y: s.size.y / 2, z: s.size.z / 2 } : { x: s.width / 2, y: s.height / 2, z: 0 };
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const r = rotateVector(s.orientation, { x: sx * half.x, y: sy * half.y, z: sz * half.z });
    out.push({ x: s.center.x + r.x, y: s.center.y + r.y, z: s.center.z + r.z });
  }
  return out;
}

test('rien ne recouvre l’image du playfield : la scène reste hors d’elle ou sous son plan', () => {
  const scene = headsetScene(panels);
  for (const s of scene) {
    if (s.kind === 'disque') continue;
    const pts = corners(s).map(inPlayfield);
    const above = pts.some((p) => p.z > 0.001);
    const inside = pts.some((p) => Math.abs(p.x) < pf.width / 2 - 1e-6 && Math.abs(p.y) < pf.height / 2 - 1e-6);
    assert.ok(!(above && inside), `${s.kind} au-dessus de l’image : ${JSON.stringify(s)}`);
  }
});

test('sans caisson : ni boîte, ni cadre, ni mur ; en volume, seulement les repères du calage', () => {
  const scene = headsetScene(panels);
  assert.equal(scene.filter((s) => s.kind === 'boite').length, 0);
  // Le sol seul : plus de halo ni d'ombre autour des écrans (essai du 10 novembre 2026, en retard sur eux).
  assert.equal(scene.filter((s) => s.kind === 'disque').length, 2);
  assert.equal(scene.filter((s) => s.kind === 'quad').length, 0);
  const marks = lockbarMarks(0.7);
  const calibrating = headsetScene(panels, undefined, marks).filter((s): s is Extract<ScenePrimitive, { kind: 'boite' }> => s.kind === 'boite');
  assert.equal(calibrating.length, 2);
  for (const [k, box] of calibrating.entries()) {
    assert.equal(box.color, rgba(SCENE_COLORS.signal));
    // Posé sur le coin : sa base au niveau de la barre avant.
    assert.ok(Math.abs(box.center.y - box.size.y / 2 - marks[k]!.y) < 1e-9 && box.center.x === marks[k]!.x && box.center.z === marks[k]!.z);
  }
});

test('aucune ombre ni halo autour des écrans : la teinte de la table ne change rien à la scène', () => {
  // Essai du 10 novembre 2026 : les ombrages autour des écrans, dans la couche de projection, se
  // décalaient des écrans (couches « quad ») quand la tête bougeait ; retirés.
  assert.deepEqual(headsetScene(panels, '#c0392b'), headsetScene(panels));
  const colors = (s: ScenePrimitive) => (s.kind === 'boite' ? [s.color, s.bottom ?? s.color] : s.kind === 'quad' ? [s.top, s.bottom] : [s.inner, s.outer]);
  assert.equal(headsetScene(panels, '#c0392b').filter((s) => colors(s).some((c) => c.startsWith('#c0392b') || c.startsWith(SCENE_COLORS.halo))).length, 0);
  assert.ok(HALO_ALPHA > 0 && seen('#c0392b', HALO_ALPHA, SCENE_COLORS.surface).startsWith('#') && rgba('#c0392b', 0).startsWith('#'));
});

test('sol neutre à 0 m ; rien derrière la tête', () => {
  const scene = headsetScene(panels);
  const discs = scene.filter((s) => s.kind === 'disque');
  assert.ok(discs.every((d) => d.center.y >= 0 && d.center.y < 0.01));
  const head = panels.filter((p) => p.role !== 'playfield');
  const headBack = Math.min(...head.map((p) => p.position.z));
  assert.equal(scene.filter((s) => s.kind === 'quad' && s.center.z < headBack - 0.1).length, 0);
});

test('opacités vues comme dans les maquettes : le mélange linéaire du casque rend le mélange sRGB', () => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
  const halo = seen('#c8742a', 0.1, SCENE_COLORS.surface);
  const a = parseInt(halo.slice(7, 9), 16) / 255;
  // Bien plus faible qu'à 10 % : sur fond sombre, le casque l'aurait montré huit fois plus fort.
  assert.ok(a > 0.005 && a < 0.03, String(a));
  // Rouge : mélange linéaire avec cette opacité ≈ mélange sRGB à 10 %.
  const sRgb = lin(ch(SCENE_COLORS.surface, 0) + 0.1 * (ch('#c8742a', 0) - ch(SCENE_COLORS.surface, 0)));
  const linear = lin(ch(SCENE_COLORS.surface, 0)) + a * (lin(ch('#c8742a', 0)) - lin(ch(SCENE_COLORS.surface, 0)));
  assert.ok(Math.abs(sRgb - linear) < 0.003, `${sRgb} ≠ ${linear}`);
  assert.equal(seen('#24504a', 1, SCENE_COLORS.surface), rgba('#24504a'));
  assert.equal(seen('#24504a', 0, SCENE_COLORS.surface), rgba('#24504a', 0));
});

test('protocole : « scene », une ligne par forme, « scene-fin »', () => {
  const lines = sceneProtocol(headsetScene(panels, undefined, lockbarMarks(0.7)));
  assert.equal(lines[0], 'scene');
  assert.equal(lines.at(-1), 'scene-fin');
  const box = lines.find((l) => l.startsWith('boite '))!.split(' ');
  assert.equal(box.length, 13);
  assert.match(box[11]!, /^#[0-9a-f]{8}$/);
  const quad = sceneProtocol([{ kind: 'quad', center: { x: 0, y: 1, z: -1 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, width: 0.5, height: 0.1, top: '#ffffffff', bottom: '#000000ff' }]).find((l) => l.startsWith('quad '))!.split(' ');
  assert.equal(quad.length, 12);
  const disc = lines.find((l) => l.startsWith('disque '))!.split(' ');
  assert.equal(disc.length, 7);
});

test('compagnon : les écrans en couches « quad » hors calage, dans la couche de projection avec la profondeur pendant le calage', () => {
  const src = path.join(__dirname, '..', '..', '..', '..', 'packages', 'casque-vr', 'src');
  const cpp = fs.readFileSync(path.join(src, 'casque.cpp'), 'utf8');
  assert.match(cpp, /imageRenderer\.draw\(context\.Get\(\), mvp, corners, uv, image, colorScale \? 1\.f : fade\);/);
  assert.match(cpp, /if \(fs\.shouldRender && worn && \(!projection \|\| quadScreens\)\)/);
  // Chaque image d'écran garde ses mipmaps, refaites à chaque nouvelle image.
  assert.match(cpp, /scene::makeImage\(device\.Get\(\), td\.Width, td\.Height, td\.Format, surf\.copy, surf\.view\)/);
  assert.match(cpp, /context->GenerateMips\(surf\.view\.Get\(\)\);/);
  const scene = fs.readFileSync(path.join(src, 'scene.cpp'), 'utf8');
  // Octets de l'écran (sRGB) ramenés en lumière linéaire ; « linear » est un mot réservé de HLSL.
  assert.match(scene, /float3 toLinear\(float3 c\)/);
  assert.match(scene, /D3D11_FILTER_ANISOTROPIC/);
  assert.match(scene, /DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ALL/);
});
