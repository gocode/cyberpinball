// Le menu dans le casque en borne en volume (casque-scene.ts, « M2 ») : rien sur l'image du
// playfield, un caisson posé au sol sur quatre appuis, la tête cadrée, la teinte seulement en halo,
// un sol et un mur neutres derrière la tête.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headsetPanels, rotateVector, type HeadsetSource, type Quaternion } from '../casque';
import { CABINET_DEPTH_M, FRAME_M, HALO_ALPHA, headsetScene, LEG_M, rgba, SCENE_COLORS, sceneProtocol, seen, type ScenePrimitive, type Vec3 } from '../casque-scene';
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

test('le caisson est sous la bordure, profond de 0,24 m, sur quatre appuis qui touchent le sol', () => {
  const scene = headsetScene(panels);
  const boxes = scene.filter((s): s is Extract<ScenePrimitive, { kind: 'boite' }> => s.kind === 'boite');
  const cabinet = boxes.find((b) => Math.abs(b.size.z - CABINET_DEPTH_M) < 1e-9)!;
  assert.ok(cabinet, 'caisson');
  assert.ok(Math.abs(cabinet.size.x - (pf.width + 2 * FRAME_M)) < 1e-9 && Math.abs(cabinet.size.y - (pf.height + 2 * FRAME_M)) < 1e-9);
  assert.equal(cabinet.bottom, rgba(SCENE_COLORS.sunken));
  const legs = boxes.filter((b) => b.size.x === LEG_M && b.size.z === LEG_M);
  assert.equal(legs.length, 4);
  for (const leg of legs) {
    assert.ok(Math.abs(leg.center.y - leg.size.y / 2) < 1e-9, 'du sol');
    assert.ok(leg.size.y > 0.4 && leg.size.y < 0.9, String(leg.size.y));
  }
});

test('la teinte de la table n’est que dans le halo des cadres de la tête, à 10 % ; sans teinte, la sarcelle', () => {
  const tinted = headsetScene(panels, '#c0392b');
  const colors = (s: ScenePrimitive) => (s.kind === 'boite' ? [s.color, s.bottom ?? s.color] : s.kind === 'quad' ? [s.top, s.bottom] : [s.inner, s.outer]);
  const withTint = tinted.filter((s) => colors(s).some((c) => c.startsWith('#c0392b')));
  assert.ok(withTint.length >= 8, 'quatre bandes par cadre de tête');
  for (const s of withTint) {
    assert.equal(s.kind, 'quad');
    assert.ok(colors(s).includes(seen('#c0392b', HALO_ALPHA, SCENE_COLORS.surface)) && colors(s).includes(rgba('#c0392b', 0)));
  }
  // Sans teinte (ou teinte illisible) : la sarcelle de la marque, aux mêmes endroits.
  for (const tint of [undefined, 'pas-une-couleur']) {
    const plain = headsetScene(panels, tint);
    assert.equal(plain.filter((s) => colors(s).some((c) => c.startsWith(SCENE_COLORS.halo))).length, withTint.length);
  }
});

test('sol neutre à 0 m ; mur derrière la tête, sans rien devant elle', () => {
  const scene = headsetScene(panels);
  const discs = scene.filter((s) => s.kind === 'disque');
  assert.ok(discs.every((d) => d.center.y >= 0 && d.center.y < 0.01));
  const head = panels.filter((p) => p.role !== 'playfield');
  const headBack = Math.min(...head.map((p) => p.position.z));
  const wallQuads = scene.filter((s) => s.kind === 'quad' && s.center.z < headBack - 0.1);
  assert.ok(wallQuads.length > 20, 'fond, zone centrale, montants et joints');
  // Aucun filet du mur dans la réserve autour de la tête.
  const bg = head.find((p) => p.role === 'backglass')!;
  for (const q of wallQuads.filter((s) => s.kind === 'quad' && s.width < 0.01)) {
    const inReserve = Math.abs(q.center.x) < bg.width / 2 && q.center.y > bg.position.y - bg.height / 2 && q.center.y < bg.position.y + bg.height / 2;
    assert.ok(!inReserve, JSON.stringify(q));
  }
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
  const lines = sceneProtocol(headsetScene(panels));
  assert.equal(lines[0], 'scene');
  assert.equal(lines.at(-1), 'scene-fin');
  const box = lines.find((l) => l.startsWith('boite '))!.split(' ');
  assert.equal(box.length, 13);
  assert.match(box[11]!, /^#[0-9a-f]{8}$/);
  const quad = lines.find((l) => l.startsWith('quad '))!.split(' ');
  assert.equal(quad.length, 12);
  const disc = lines.find((l) => l.startsWith('disque '))!.split(' ');
  assert.equal(disc.length, 7);
});
