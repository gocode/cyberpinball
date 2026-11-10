// Visualiseur du DMD du Juke-box (jukebox-visualizer.ts) : palette tirée d'une pochette (les gris ne
// votent pas, une pochette terne donne des points vifs), les trois modes, la crête qui tient puis
// retombe, et le réglage lu de medias.json. Pochettes fictives dessinées ici.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeMenuMediaSettings } from '../mediaview';
import { DMD_HEIGHT, DMD_WIDTH } from '../livedmd';
import { coverPalette, createJukeboxVisualizer, rgbToHsv, VISUALIZER_PEAK_HOLD_MS, type Rgb } from '../jukebox-visualizer';

/** Pochette de 16 × 16 points : chaque pixel tiré de fn(x, y) dans [0, 1]. */
function cover(fn: (x: number, y: number) => Rgb, order: 'rgba' | 'bgra' = 'rgba'): number[] {
  const px: number[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const [r, g, b] = fn(x / 15, y / 15);
      px.push(...(order === 'rgba' ? [r, g, b] : [b, g, r]), 255);
    }
  return px;
}

const hue = (c: Rgb) => rgbToHsv(c)[0];
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const levels = (v: number) => Array.from({ length: 24 }, () => v);

test('une pochette grise ou noire n’a pas de palette : le visualiseur passera en Multicolore', () => {
  assert.equal(coverPalette(cover(() => [128, 128, 128])), undefined);
  assert.equal(coverPalette(cover(() => [6, 8, 7])), undefined);
});

test('pochette à deux teintes : la dominante d’abord, l’autre retenue, trois couleurs vives', () => {
  // Trois quarts orange, un quart bleu.
  const p = coverPalette(cover((x) => (x < 0.74 ? [230, 120, 40] : [30, 70, 200])))!;
  assert.equal(p.length, 3);
  assert.ok(gap(hue(p[0]!), 26) < 15, `dominante orange : ${p[0]}`);
  assert.ok(p.some((c) => gap(hue(c), 225) < 20), `le bleu est gardé : ${JSON.stringify(p)}`);
  for (const c of p) assert.equal(Math.max(...c), 255, 'au plein éclat : la nuance du point fait la lumière');
});

test('une pochette terne et sombre donne quand même des points francs, de sa teinte', () => {
  const p = coverPalette(cover(() => [70, 52, 40]))!;
  assert.ok(p);
  const [h, s, v] = rgbToHsv(p[0]!);
  assert.ok(gap(h, 23) < 15, `teinte gardée : ${h}`);
  assert.ok(s >= 0.54 && v === 1, `saturation ${s}, valeur ${v}`);
});

test('ordre des pixels : BGRA (nativeImage sous Windows) donne la même palette que RGBA', () => {
  const fn = (x: number): Rgb => (x < 0.6 ? [200, 40, 160] : [40, 200, 180]);
  assert.deepEqual(coverPalette(cover(fn, 'bgra'), 'bgra'), coverPalette(cover(fn, 'rgba'), 'rgba'));
});

test('Classique : pas de couleur propre (la couleur réglée du DMD) ; Pochette sans pochette : Multicolore', () => {
  const v = createJukeboxVisualizer();
  const classic = v.frame({ levels: levels(0.5), elapsed: 0, mode: 'classique', color: '#8be23a' });
  assert.equal(classic.rgb, undefined);
  assert.equal(classic.mode, 'classique');
  const fallback = createJukeboxVisualizer().frame({ levels: levels(0.5), elapsed: 0, mode: 'pochette', color: '#8be23a' });
  assert.equal(fallback.mode, 'multicolore');
  assert.equal(fallback.rgb?.length, DMD_WIDTH * DMD_HEIGHT * 3);
});

test('Pochette : les colonnes vont de la première couleur (pied) vers la dernière (sommet)', () => {
  const palette: Rgb[] = [
    [255, 60, 60],
    [120, 60, 255],
    [60, 255, 220],
  ];
  const f = createJukeboxVisualizer().frame({ levels: levels(1), elapsed: 0, mode: 'pochette', palette, color: '#8be23a' });
  const at = (x: number, y: number): Rgb => {
    const i = (y * DMD_WIDTH + x) * 3;
    return [f.rgb![i]!, f.rgb![i + 1]!, f.rgb![i + 2]!];
  };
  // Première colonne (x = 5) : pied à la ligne 28, sommet 16 lignes plus haut.
  assert.ok(f.dots[28 * DMD_WIDTH + 5]! > 0 && f.dots[12 * DMD_WIDTH + 5]! > 0);
  assert.ok(at(5, 28)[0] > at(5, 28)[2], `pied rouge : ${at(5, 28)}`);
  assert.ok(at(5, 12)[1] > at(5, 12)[0], `sommet vert d’eau : ${at(5, 12)}`);
  // Le sommet est plus lumineux que le pied, et le reflet sous la base reste faible.
  assert.ok(f.dots[12 * DMD_WIDTH + 5]! > f.dots[28 * DMD_WIDTH + 5]!);
  assert.ok(f.dots[30 * DMD_WIDTH + 5]! > 0 && f.dots[30 * DMD_WIDTH + 5]! <= 4);
});

test('Multicolore : les teintes tournent dans le temps', () => {
  const v = createJukeboxVisualizer();
  const i = (28 * DMD_WIDTH + 5) * 3;
  const a = v.frame({ levels: levels(0.6), elapsed: 0, mode: 'multicolore', color: '#8be23a' }).rgb!.slice(i, i + 3);
  const b = v.frame({ levels: levels(0.6), elapsed: 6000, mode: 'multicolore', color: '#8be23a' }).rgb!.slice(i, i + 3);
  assert.ok(gap(hue([a[0]!, a[1]!, a[2]!]), hue([b[0]!, b[1]!, b[2]!])) > 60);
});

test('crête : elle tient au sommet atteint, puis retombe ; rien ne dépend de l’horloge', () => {
  const v = createJukeboxVisualizer();
  const peakRow = (f: { dots: Uint8Array }) => {
    for (let y = 0; y < DMD_HEIGHT; y++) if (f.dots[y * DMD_WIDTH + 5] === 13) return y;
    return undefined;
  };
  v.frame({ levels: levels(1), elapsed: 0, mode: 'classique', color: '#8be23a' });
  const held = v.frame({ levels: levels(0.2), elapsed: VISUALIZER_PEAK_HOLD_MS - 40, mode: 'classique', color: '#8be23a' });
  assert.equal(peakRow(held), 28 - 17, 'la crête reste en haut pendant la tenue');
  let f = held;
  for (let t = VISUALIZER_PEAK_HOLD_MS; t < VISUALIZER_PEAK_HOLD_MS + 400; t += 40) f = v.frame({ levels: levels(0.2), elapsed: t, mode: 'classique', color: '#8be23a' });
  assert.ok((peakRow(f) ?? 99) > 28 - 17, 'puis elle retombe');
  // Même suite d'entrées, même image.
  const again = createJukeboxVisualizer();
  const x = again.frame({ levels: levels(0.7), elapsed: 120, mode: 'multicolore', color: '#8be23a' });
  const y = createJukeboxVisualizer().frame({ levels: levels(0.7), elapsed: 120, mode: 'multicolore', color: '#8be23a' });
  assert.deepEqual([...x.dots], [...y.dots]);
  assert.deepEqual([...x.rgb!], [...y.rgb!]);
});

test('réglage « Visualiseur du Juke-box » : Pochette par défaut, une valeur inconnue revient au défaut', () => {
  assert.equal(normalizeMenuMediaSettings({}).jukeboxVisualizer, 'pochette');
  assert.equal(normalizeMenuMediaSettings({ jukeboxVisualizer: 'multicolore' }).jukeboxVisualizer, 'multicolore');
  assert.equal(normalizeMenuMediaSettings({ jukeboxVisualizer: 'arc-en-ciel' }).jukeboxVisualizer, 'pochette');
});
