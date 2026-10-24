// Couleurs de la direction artistique (docs/design-system, 22 octobre 2026) dans ce qui
// est dessiné sans média : replis intégrés (app/renderer/fallback.*) et icône de
// l'application (scripts/icone.mjs). L'ancienne palette cyan, rose, jaune et violet ne
// doit revenir nulle part dans l'interface ; les dessins n'emploient que les teintes
// de la DA : neutres et surfaces noir sarcelle, sarcelle, bleu des métadonnées, vert
// signal, orange des afficheurs, ambre et rouge des états.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const RENDERER = path.join(REPO, 'app', 'renderer');
const DRAWN = [path.join(RENDERER, 'fallback.css'), path.join(RENDERER, 'fallback.js'), path.join(REPO, 'scripts', 'icone.mjs')];

/** Palette d'avant la DA : cyan, rose, jaune, violet, vert menthe, fonds bleu nuit. */
const RETIRED = ['#22d3ee', '#ff3d7f', '#facc15', '#a78bfa', '#34d399', '#05060a', '#161b2a', '#0c1020', '#eef1f8', '#8b93a7', '#5fe1f4'];

/** Teintes de la DA (degrés) : sarcelle du halo et des filets, bleu meta, vert signal, orange dmd, ambre, rouge. */
const HUES = [{ name: 'sarcelle', hue: 172 }, { name: 'meta', hue: 194 }, { name: 'signal', hue: 92 }, { name: 'dmd', hue: 28 }, { name: 'ambre', hue: 39 }, { name: 'rouge', hue: 0 }];

function colorsOf(text: string): { text: string; rgb: [number, number, number] }[] {
  const found: { text: string; rgb: [number, number, number] }[] = [];
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
    found.push({ text: m[0], rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number] });
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) found.push({ text: m[0], rgb: [+m[1]!, +m[2]!, +m[3]!] });
  return found;
}

/** Teinte (degrés) et saturation (0 à 1, au sens HSL) d'une couleur. */
function hueSat([r, g, b]: [number, number, number]): { hue: number; sat: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { hue: 0, sat: 0 };
  const sat = d / (1 - Math.abs(2 * l - 1));
  const hue = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat };
}

test('DA : l’ancienne palette ne revient nulle part dans l’interface ni dans l’icône', () => {
  const files = [...fs.readdirSync(RENDERER).filter((f) => /\.(css|js|html)$/.test(f)).map((f) => path.join(RENDERER, f)), path.join(REPO, 'scripts', 'icone.mjs')];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const color of RETIRED) assert.ok(!text.includes(color), `${path.relative(REPO, file)} : ${color} appartient à l'ancienne palette`);
  }
});

test('DA : replis et icône n’emploient que des neutres et les teintes de la DA', () => {
  for (const file of DRAWN) {
    for (const c of colorsOf(fs.readFileSync(file, 'utf8'))) {
      const { hue, sat } = hueSat(c.rgb);
      // Neutres et surfaces sombres : saturation faible, ou couleur presque noire.
      if (sat < 0.3 || Math.max(...c.rgb) < 40) continue;
      const near = HUES.find((h) => Math.min(Math.abs(hue - h.hue), 360 - Math.abs(hue - h.hue)) <= 14);
      assert.ok(near, `${path.relative(REPO, file)} : ${c.text} (teinte ${Math.round(hue)}°) n'est pas une teinte de la DA`);
    }
  }
});

test('DA : l’orange des afficheurs reste aux afficheurs à points', () => {
  const css = fs.readFileSync(path.join(RENDERER, 'fallback.css'), 'utf8');
  assert.ok(!/#ff8a1f/i.test(css), 'fallback.css : l’orange dmd n’habille aucun composant HTML');
  const icon = fs.readFileSync(path.join(REPO, 'scripts', 'icone.mjs'), 'utf8');
  assert.ok(!/#ff8a1f/i.test(icon), 'icone.mjs : l’icône n’emploie pas l’orange dmd');
});
