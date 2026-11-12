// Décor de réalité virtuelle (decor.ts, glb.ts) : la caisse et la capsule autour des écrans, sans
// jamais rien poser sur leur image ; pieds au sol, barre avant à sa hauteur ; glTF lisible.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { headsetPanels, LOCKBAR_HEIGHT_M, rotateVector, type HeadsetPanel, type HeadsetSource, type Quaternion } from '../casque';
import { buildDecor, DECOR, DECOR_TEXTURES, type Decor, type DecorPart } from '../decor';
import { readGlb, writeGlb } from '../glb';
import { edgeRotation } from '../model';

const borne: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 }, screenCm: { width: 94, height: 53 }, screenPx: { width: 3840, height: 2160 } },
  { role: 'backglass', rect: { x: 3840, y: 0, width: 2560, height: 1440 }, screenCm: { width: 70.8, height: 39.8 }, screenPx: { width: 2560, height: 1440 } },
  { role: 'dmd', rect: { x: 6400, y: 0, width: 1920, height: 1080 }, screenCm: { width: 34.5, height: 19.4 }, screenPx: { width: 1920, height: 1080 } },
];
const bureau: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 1920, height: 1080 } },
  { role: 'backglass', rect: { x: 1920, y: 0, width: 1920, height: 1080 } },
  { role: 'dmd', rect: { x: 3840, y: 0, width: 1280, height: 390 } },
  { role: 'topper', rect: { x: 5120, y: 0, width: 1280, height: 390 } },
];
const configurations: [string, HeadsetPanel[]][] = [
  ['borne mesurée', headsetPanels(borne, edgeRotation('left'))],
  ['bureau, tête standard', headsetPanels(bureau, 0, { standardHead: true })],
  ['plateau tourné de 270°', headsetPanels(borne, edgeRotation('right'), { standardHead: true })],
];

function vertices(part: DecorPart): { x: number; y: number; z: number }[] {
  const out = [];
  for (let i = 0; i < part.mesh.positions.length; i += 3) out.push({ x: part.mesh.positions[i]!, y: part.mesh.positions[i + 1]!, z: part.mesh.positions[i + 2]! });
  return out;
}
/** Sommets, milieux des arêtes et centres des triangles : une face qui passe sur une image sans y avoir de sommet est vue aussi. */
function samples(part: DecorPart): { x: number; y: number; z: number }[] {
  const v = vertices(part), out = [...v];
  const idx = part.mesh.indices;
  const mid = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, t = 0.5) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  for (let i = 0; i < idx.length; i += 3) {
    const a = v[idx[i]!]!, b = v[idx[i + 1]!]!, c = v[idx[i + 2]!]!;
    out.push(mid(a, b), mid(b, c), mid(c, a), { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 });
  }
  return out;
}
/** Point de la borne dans le repère local d'un panneau (x, y dans son plan, z devant l'image). */
function inPanel(p: HeadsetPanel, v: { x: number; y: number; z: number }) {
  const q = p.orientation, inverse: Quaternion = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  return rotateVector(inverse, { x: v.x - p.position.x, y: v.y - p.position.y, z: v.z - p.position.z });
}
const cabinetParts = (d: Decor) => d.parts.filter((p) => !['ciel', 'verriere', 'nervures', 'sol', 'soubassement', 'lisse', 'ombre'].includes(p.name));

for (const [name, panels] of configurations) {
  test(`décor (${name}) : rien ne se pose sur l'image d'un écran`, () => {
    const decor = buildDecor(panels)!;
    assert.ok(decor);
    for (const panel of panels) {
      for (const part of cabinetParts(decor)) {
        for (const v of samples(part)) {
          const l = inPanel(panel, v);
          const inside = Math.abs(l.x) < panel.width / 2 - 0.001 && Math.abs(l.y) < panel.height / 2 - 0.001;
          // Devant l'image, à moins de 40 cm : ce serait entre le joueur et l'écran.
          assert.ok(!(inside && l.z > 0.0005 && l.z < 0.4), `${part.name} couvre l'écran ${panel.role} (${l.x.toFixed(3)}, ${l.y.toFixed(3)}, ${l.z.toFixed(4)})`);
        }
      }
    }
  });

  test(`décor (${name}) : pieds au sol, barre avant à hauteur, rien sous le sol`, () => {
    const decor = buildDecor(panels)!;
    const patins = decor.parts.filter((p) => p.name === 'patin');
    assert.equal(patins.length, 4);
    for (const p of patins) assert.ok(Math.abs(Math.min(...vertices(p).map((v) => v.y))) < 1e-6);
    const barre = decor.parts.find((p) => p.name === 'barre')!;
    const top = Math.max(...vertices(barre).map((v) => v.y));
    assert.ok(Math.abs(top - LOCKBAR_HEIGHT_M) < 0.012, `barre à ${top.toFixed(3)} m`);
    for (const part of decor.parts) {
      if (part.name === 'ciel') continue;
      assert.ok(Math.min(...vertices(part).map((v) => v.y)) > -1e-6, `${part.name} sous le sol`);
    }
  });

  test(`décor (${name}) : la tête enferme le DMD et le fronton, avec les enceintes de part et d'autre du DMD`, () => {
    const decor = buildDecor(panels)!;
    const tete = decor.parts.find((p) => p.name === 'tete')!;
    const xs = vertices(tete).map((v) => v.x);
    for (const role of ['dmd', 'backglass'] as const) {
      const p = panels.find((x) => x.role === role)!;
      assert.ok(Math.max(...xs) >= p.width / 2 && Math.min(...xs) <= -p.width / 2, `${role} plus large que la tête`);
    }
    const dmd = panels.find((p) => p.role === 'dmd')!;
    for (const e of decor.parts.filter((p) => p.name === 'enceinte')) {
      const ex = vertices(e).map((v) => Math.abs(v.x));
      assert.ok(Math.min(...ex) > dmd.width / 2, 'enceinte sur le DMD');
    }
  });
}

test('décor : calé sur une vraie barre avant, la caisse en prend la largeur, sans rien poser sur les écrans', () => {
  const panels = configurations[0]![1];
  const decor = buildDecor(panels, { lockbarWidth: 0.7 })!;
  const barre = decor.parts.find((p) => p.name === 'barre')!;
  const xs = vertices(barre).map((v) => v.x);
  assert.ok(Math.abs(Math.max(...xs) - 0.35) < 1e-6 && Math.abs(Math.min(...xs) + 0.35) < 1e-6);
  for (const name of ['flanc-gauche', 'flanc-droit']) {
    const fx = vertices(decor.parts.find((p) => p.name === name)!).map((v) => Math.abs(v.x));
    assert.ok(Math.abs(Math.max(...fx) - 0.35) < 1e-6, name);
  }
  // Une barre plus étroite que le plateau et son cadre : la caisse garde la largeur du plateau.
  const narrow = buildDecor(panels, { lockbarWidth: 0.45 })!;
  const nx = vertices(narrow.parts.find((p) => p.name === 'barre')!).map((v) => v.x);
  assert.ok(Math.max(...nx) > 0.29);
  for (const panel of panels)
    for (const part of cabinetParts(decor))
      for (const v of samples(part)) {
        const l = inPanel(panel, v);
        const inside = Math.abs(l.x) < panel.width / 2 - 0.001 && Math.abs(l.y) < panel.height / 2 - 0.001;
        assert.ok(!(inside && l.z > 0.0005 && l.z < 0.4), `${part.name} couvre l'écran ${panel.role}`);
      }
});

test('décor : sans playfield, pas de décor', () => {
  assert.equal(buildDecor(headsetPanels([borne[1]!, borne[2]!], 0)), undefined);
});

test('décor : capsule aux cotes de la maquette, aucune nervure devant le joueur', () => {
  const decor = buildDecor(configurations[0]![1])!;
  const sol = decor.parts.find((p) => p.name === 'sol')!;
  const xs = vertices(sol).map((v) => v.x), zs = vertices(sol).map((v) => v.z);
  assert.ok(Math.abs(Math.max(...xs) - DECOR.capsule.rx) < 1e-6);
  assert.ok(Math.abs((Math.max(...zs) - Math.min(...zs)) / 2 - DECOR.capsule.rz) < 1e-6);
  for (const az of DECOR.capsule.ribs) assert.ok(Math.abs(az) > 35, `nervure à ${az}°`);
});

test('glb : écrit, relu, textures embarquées, réglages des matières', () => {
  const decor = buildDecor(configurations[0]![1])!;
  const textures = new Map(DECOR_TEXTURES.map((n) => [n, new Uint8Array([n.length, 1, 2, 3])]));
  const bytes = writeGlb(decor, textures);
  assert.equal(bytes.byteLength % 4, 0);
  const { json, bin } = readGlb(bytes);
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.meshes.length, decor.parts.length);
  assert.equal(json.nodes.length, decor.parts.length);
  assert.deepEqual(json.extensionsUsed, ['KHR_materials_unlit']);
  for (const view of json.bufferViews) assert.ok(view.byteOffset + view.byteLength <= bin.byteLength);
  for (const m of json.materials) assert.ok(['opaque', 'alpha', 'additive'].includes(m.extras.blend));
  // Chaque texture utilisée une seule fois parmi les images.
  const names = json.images.map((i: { name: string }) => i.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.ok((DECOR_TEXTURES as readonly string[]).includes(n));
  // Les positions ont leurs bornes (exigées par glTF).
  for (const mesh of json.meshes) {
    const pos = json.accessors[mesh.primitives[0].attributes.POSITION];
    assert.equal(pos.min.length, 3);
    assert.equal(pos.max.length, 3);
  }
});

test('textures du décor : présentes et versionnées', () => {
  const dir = path.join(__dirname, '..', '..', '..', 'casque-vr', 'decor');
  for (const n of DECOR_TEXTURES) assert.ok(fs.statSync(path.join(dir, n)).size > 1000, n);
});
