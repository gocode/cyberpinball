// Rendu hors écran du compagnon du casque (--rendu-essai) : après plusieurs allers-retours veille
// (partie de VPX) et reprise (retour au menu), le décor libéré puis rechargé donne exactement la même
// image, écrans compris. Le compagnon doit être construit (npm run casque-vr) : sinon l'essai est sauté.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { headsetPanels, headsetProtocol, type HeadsetSource } from '../casque';
import { buildDecor, DECOR_TEXTURES } from '../decor';
import { writeGlb } from '../glb';
import { edgeRotation } from '../model';

const repo = path.join(__dirname, '../../../..');
const exe = path.join(repo, 'build', 'casque-vr', 'Release', 'cyberpinball-casque.exe');
const borne: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 }, screenCm: { width: 94, height: 53 }, screenPx: { width: 3840, height: 2160 } },
  { role: 'backglass', rect: { x: 3840, y: 0, width: 2560, height: 1440 }, screenCm: { width: 70.8, height: 39.8 }, screenPx: { width: 2560, height: 1440 } },
  { role: 'dmd', rect: { x: 6400, y: 0, width: 1920, height: 1080 }, screenCm: { width: 34.5, height: 19.4 }, screenPx: { width: 1920, height: 1080 } },
];

/** Pixels franchement rouges, verts, bleus (coins de l'image témoin des écrans) d'une image BMP. */
function screenPixels(file: string): { red: number; green: number; blue: number } {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = Math.abs(b.readInt32LE(22)), bytes = b.readUInt16LE(28) / 8;
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const count = { red: 0, green: 0, blue: 0 };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = off + y * stride + x * bytes;
      const [bl, g, r] = [b[i]!, b[i + 1]!, b[i + 2]!];
      if (r > 180 && g < 40 && bl < 40) count.red++;
      else if (g > 150 && r < 40 && bl < 40) count.green++;
      else if (bl > 180 && r < 40 && g < 40) count.blue++;
    }
  return count;
}

test('compagnon, rendu hors écran : cinq allers-retours veille/reprise, le décor revient et les écrans restent', { skip: !fs.existsSync(exe) && 'compagnon pas construit (npm run casque-vr)' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casque-rendu-'));
  try {
    const panels = headsetPanels(borne, edgeRotation('left'), { standardHead: true });
    const textures = new Map(DECOR_TEXTURES.map((t) => [t, fs.readFileSync(path.join(repo, 'packages', 'casque-vr', 'decor', t))]));
    const glb = path.join(dir, 'decor.glb');
    fs.writeFileSync(glb, writeGlb(buildDecor(panels)!, textures));
    const render = (cycles: number) => {
      const scene = path.join(dir, `scene-${cycles}.txt`), bmp = path.join(dir, `rendu-${cycles}.bmp`);
      const lines = [...headsetProtocol(panels).filter((l) => l.startsWith('panneau')), `decor ${glb}`, 'vue 0 1.65 0.35 -0.436 0', 'temps 3', `cycles ${cycles}`];
      fs.writeFileSync(scene, lines.join('\n') + '\n');
      const said = execFileSync(exe, ['--rendu-essai', scene, bmp], { encoding: 'utf8', windowsHide: true });
      assert.doesNotMatch(said, /erreur/, said);
      return bmp;
    };
    const first = render(0), after = render(5);
    const seen = screenPixels(first);
    // Les trois écrans portent l'image témoin : ses coins se voient, le décor ne les couvre pas.
    assert.ok(seen.red > 2000 && seen.green > 2000 && seen.blue > 2000, JSON.stringify(seen));
    assert.ok(fs.readFileSync(first).equals(fs.readFileSync(after)), 'image différente après les allers-retours veille/reprise');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Plus forte chute (ou bosse) de luminosité d'une colonne par rapport à ses voisines : médiane verticale, étoiles écartées. */
function columnSeam(file: string): { drop: number; x: number } {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = Math.abs(b.readInt32LE(22)), bytes = b.readUInt16LE(28) / 8;
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const med: number[] = [];
  for (let x = 0; x < w; x++) {
    const v: number[] = [];
    for (let y = 0; y < h; y += 2) {
      const i = off + y * stride + x * bytes;
      v.push(0.0722 * b[i]! + 0.7152 * b[i + 1]! + 0.2126 * b[i + 2]!);
    }
    v.sort((p, q) => p - q);
    med.push(v[v.length >> 1]!);
  }
  let worst = { drop: 0, x: -1 };
  for (let x = 12; x < w - 12; x++) {
    const around = (med[x - 12]! + med[x - 10]! + med[x + 10]! + med[x + 12]!) / 4;
    const drop = around > 2 ? Math.abs(around - med[x]!) / around : 0;
    if (drop > worst.drop) worst = { drop, x };
  }
  return worst;
}

// Retour du 13/11/2026 : une bande foncée du zénith à l'horizon, pile devant le joueur (raccord u = 0 de
// la texture des nébuleuses). Le ciel seul, vu de l'intérieur, sur 360° et jusqu'au zénith : aucune colonne
// nettement différente de ses voisines (la variation naturelle des nébuleuses reste sous 5 %).
test('compagnon, rendu hors écran : le ciel n’a aucune couture, sur 360° et jusqu’au zénith', { skip: !fs.existsSync(exe) && 'compagnon pas construit (npm run casque-vr)' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casque-ciel-'));
  try {
    const panels = headsetPanels(borne, edgeRotation('left'), { standardHead: true });
    const textures = new Map(DECOR_TEXTURES.map((t) => [t, fs.readFileSync(path.join(repo, 'packages', 'casque-vr', 'decor', t))]));
    const glb = path.join(dir, 'decor.glb');
    fs.writeFileSync(glb, writeGlb(buildDecor(panels)!, textures));
    const seams: string[] = [];
    for (const yaw of [0, 90, 180, -90])
      for (const pitch of [0, 45, 80]) {
        const scene = path.join(dir, `ciel-${yaw}-${pitch}.txt`), bmp = path.join(dir, `ciel-${yaw}-${pitch}.bmp`);
        fs.writeFileSync(scene, [`decor ${glb}`, 'ciel-seul', `vue 0 1.65 0 ${(pitch * Math.PI) / 180} ${(yaw * Math.PI) / 180}`, 'temps 3'].join('\n') + '\n');
        const said = execFileSync(exe, ['--rendu-essai', scene, bmp], { encoding: 'utf8', windowsHide: true });
        assert.doesNotMatch(said, /erreur/, said);
        const s = columnSeam(bmp);
        if (s.drop > 0.08) seams.push(`lacet ${yaw}°, tangage ${pitch}° : colonne ${s.x} à ${(s.drop * 100).toFixed(1)} %`);
      }
    assert.deepEqual(seams, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
