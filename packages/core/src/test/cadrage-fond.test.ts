import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTSIDE_BLACK_MAX, paintOutside, type RgbaImage } from '../index';

function image(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set([...pixel(x, y), 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
const at = (img: RgbaImage, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

test('fond des aperçus : le noir de VPX relié au bord est peint, la table (rails presque noirs compris) jamais', () => {
  // 40 × 20 : bandes noires à gauche et à droite (6 px), rails sombres (valeur 20), puis la table claire ; un trou noir
  // au milieu de la table, non relié au bord, reste noir. Le noir de VPX est bruité (valeurs 0 à 7) : le bruit est peint aussi.
  const img = image(40, 20, (x, y) => {
    if (x < 6 || x >= 34) return (x * 7 + y * 3) % 5 === 0 ? [6, 4, 5] : [0, 1, 0];
    if (x < 9 || x >= 31) return [20, 18, 16];
    if (x === 20 && y === 10) return [0, 0, 0];
    return [120, 90, 60];
  });
  const painted = paintOutside(img);
  assert.equal(painted, 6 * 20 * 2);
  assert.notDeepEqual(at(img, 0, 0), [0, 0, 0]);
  assert.notDeepEqual(at(img, 39, 19), [0, 0, 0]);
  assert.deepEqual(at(img, 7, 5), [20, 18, 16]);
  assert.deepEqual(at(img, 15, 5), [120, 90, 60]);
  assert.deepEqual(at(img, 20, 10), [0, 0, 0]);
  assert.ok(OUTSIDE_BLACK_MAX < 8, 'le bois des rails reste hors du seuil');
});

test('fond des aperçus : une image sans noir au bord n’est pas touchée', () => {
  const img = image(10, 10, () => [90, 90, 90]);
  assert.equal(paintOutside(img), 0);
  assert.deepEqual(at(img, 0, 0), [90, 90, 90]);
});

test('fond des aperçus : le motif rayé a deux tons distincts de la table', () => {
  const img = image(32, 4, () => [0, 0, 0]);
  paintOutside(img);
  const tones = new Set<string>();
  for (let x = 0; x < 32; x++) tones.add(at(img, x, 0).join(','));
  assert.equal(tones.size, 2);
  for (const tone of tones) assert.ok(tone.split(',').every((v) => Number(v) > 30), 'plus clair que le noir et les rails');
});
