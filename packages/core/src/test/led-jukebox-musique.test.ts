// LED qui suivent la musique du Juke-box : sans son, rien ; une barre qui monte et descend avec le
// rythme depuis le bas de la bande (quel que soit le câblage), même sur un son saturé ; un dégradé de
// couleurs ; la luminosité réglée n'est jamais dépassée.

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LED_ANIMATIONS, LED_LEVEL_CHOICES, LED_MUSIC_STALE_MS, LedJukeboxMusic, ledLevelGain, ledStripPosition, normalizeLedAnimations, type LedGrid } from '../index';

const BANDS = 24;
const N = 20;
const FRAME = 40;
/** Même bande câblée du haut vers le bas, ou du bas vers le haut : la musique doit y monter pareil. */
const WIRINGS: LedGrid[] = [
  { width: 1, height: N, arrangement: 'LeftRightTopDown' },
  { width: 1, height: N, arrangement: 'LeftRightBottomUp' },
];
const spectrum = (bass: number, mid: number, high: number): number[] => Array.from({ length: BANDS }, (_, i) => (i < 6 ? bass : i < 16 ? mid : high));

/** Joue un signal (niveaux en fonction du temps), une image tous les 40 ms ; rend la hauteur de barre de chaque image. */
function play(music: LedJukeboxMusic, signal: (ms: number) => number[], from: number, ms: number, palette?: string[]): { end: number; heights: number[] } {
  const heights: number[] = [];
  let t = from;
  for (; t <= from + ms; t += FRAME) {
    music.feed(signal(t), t, palette);
    music.step(t);
    heights.push(music.bar.height);
  }
  return { end: t, heights };
}
const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
/** Lumière (somme des canaux) de chaque LED, rangée du bas (0) vers le haut (N - 1) selon ledStripPosition. */
function bottomUp(music: LedJukeboxMusic, grid: LedGrid, brightness = 100): number[] {
  const bytes = music.render(grid, brightness);
  const out = new Array<number>(N).fill(0);
  for (let k = 0; k < N; k++) out[Math.round(ledStripPosition(grid, k) * (N - 1))] = bytes[k * 3]! + bytes[k * 3 + 1]! + bytes[k * 3 + 2]!;
  return out;
}
/** Couleur (3 canaux) de la LED à la position `i` (0 : le pied) d'une bande. */
function rgbAt(music: LedJukeboxMusic, grid: LedGrid, i: number): number[] {
  const bytes = music.render(grid, 100);
  for (let k = 0; k < N; k++) if (Math.round(ledStripPosition(grid, k) * (N - 1)) === i) return [bytes[k * 3]!, bytes[k * 3 + 1]!, bytes[k * 3 + 2]!];
  return [0, 0, 0];
}
/** Coups de grosse caisse : les graves alternent fort et faible toutes les 300 ms, le reste est soutenu. */
const kick = (ms: number): number[] => spectrum(Math.floor(ms / 300) % 2 ? 0.25 : 0.95, 0.5, 0.4);
/** Un son saturé : tout est à fond, avec seulement un petit battement (0,82 à 1) toutes les 250 ms. */
const saturated = (ms: number): number[] => spectrum(...([Math.floor(ms / 250) % 2 ? 0.82 : 1, Math.floor(ms / 250) % 2 ? 0.84 : 1, 0.98] as [number, number, number]));

test('réglage : les LED suivent la musique par défaut, un réglage enregistré est respecté', () => {
  assert.equal(DEFAULT_LED_ANIMATIONS.jukeboxMusic, true);
  assert.equal(normalizeLedAnimations({}).jukeboxMusic, true);
  assert.equal(normalizeLedAnimations({ jukeboxMusic: false }).jukeboxMusic, false);
  assert.equal(normalizeLedAnimations({ jukeboxMusic: 'non' }).jukeboxMusic, true);
});

test('sans son : bandes éteintes, avant toute musique comme sous le bruit de fond', () => {
  for (const grid of WIRINGS) {
    const music = new LedJukeboxMusic();
    assert.ok(music.render(grid, 100).every((b) => b === 0), 'rien avant la première image');
    play(music, () => spectrum(0, 0, 0), 0, 1500);
    assert.ok(music.render(grid, 100).every((b) => b === 0), 'silence');
    play(music, () => spectrum(0.05, 0.04, 0.05), 1500, 1500);
    assert.ok(music.render(grid, 100).every((b) => b === 0), 'bruit sous le seuil');
    assert.equal(music.active(3000), true, 'les niveaux arrivent encore');
  }
});

test('la barre monte et descend avec le rythme, et monte depuis le bas quel que soit le câblage', () => {
  for (const grid of WIRINGS) {
    const music = new LedJukeboxMusic();
    const { end } = play(music, kick, 0, 6000);
    const { heights } = play(music, kick, end, 2400);
    assert.ok(spread(heights) > 0.25, `la barre bouge avec les coups (course ${spread(heights).toFixed(2)})`);
    // Sur un coup (graves à fond) la barre est haute, entre deux coups elle retombe.
    let t = end;
    while (Math.floor(t / 300) % 2 !== 0) t += FRAME; // début d'un coup
    const hit = play(music, kick, t, 240);
    const col = bottomUp(music, grid);
    assert.ok(col[0]! > 0, 'le pied est allumé');
    assert.ok(col[0]! >= col[N - 1]!, 'plus vif au pied qu’en haut');
    const lit = col.filter((v) => v > 0).length;
    const gap = play(music, kick, hit.end, 330);
    const lower = bottomUp(music, grid).filter((v) => v > 0).length;
    assert.ok(Math.max(...hit.heights) > Math.min(...gap.heights) + 0.2, 'haute sur le coup, plus basse après');
    assert.ok(lit >= lower, 'moins de LED allumées une fois retombée');
  }
});

test('un son saturé fait quand même varier la barre avec le rythme', () => {
  const music = new LedJukeboxMusic();
  const { end } = play(music, saturated, 0, 8000);
  const { heights } = play(music, saturated, end, 3000);
  assert.ok(spread(heights) > 0.3, `course de la barre sur un son saturé : ${spread(heights).toFixed(2)}`);
  assert.ok(Math.min(...heights) < 0.85, 'elle ne reste pas collée au plafond');
});

test('un niveau constant et fort ne fait pas clignoter : la barre reste stable, à mi-course', () => {
  const music = new LedJukeboxMusic();
  const { end } = play(music, () => spectrum(1, 1, 1), 0, 8000);
  const { heights } = play(music, () => spectrum(1, 1, 1), end, 2000);
  assert.ok(spread(heights) < 0.05, `stable (course ${spread(heights).toFixed(3)})`);
  assert.ok(Math.max(...heights) < 0.9, 'pas pleine : il reste de la marge pour le rythme');
  assert.ok(Math.min(...heights) > 0.3, 'mais bien allumée');
});

test('les aigus font vivre le haut, même au-dessus de la barre', () => {
  const music = new LedJukeboxMusic();
  const pulse = (ms: number) => spectrum(0.1, 0.1, Math.floor(ms / 200) % 2 ? 0.2 : 0.9);
  play(music, pulse, 0, 4000);
  const tops: number[] = [];
  let t = 4000;
  for (let i = 0; i < 40; i++, t += FRAME) {
    play(music, pulse, t, 0);
    tops.push(bottomUp(music, WIRINGS[0]!)[N - 1]!);
  }
  assert.ok(spread(tops) > 30, `le haut de la bande bouge (course ${spread(tops)})`);
});

test('la crête se détache de la barre quand elle retombe', () => {
  const music = new LedJukeboxMusic();
  const { end } = play(music, kick, 0, 6000);
  let t = end;
  let found = false;
  for (let i = 0; i < 60 && !found; i++, t += FRAME) {
    music.feed(kick(t), t);
    music.step(t);
    if (music.bar.peak - music.bar.height > 0.15) found = true;
  }
  assert.ok(found, 'la crête reste au-dessus de la barre un instant');
});

test('couleurs : un dégradé (arc-en-ciel du DMD sans pochette, ses teintes avec), jamais une seule couleur', () => {
  const grid = WIRINGS[1]!;
  const rainbow = new LedJukeboxMusic();
  play(rainbow, () => spectrum(1, 1, 1), 0, 4000);
  const foot = rgbAt(rainbow, grid, 1);
  const top = rgbAt(rainbow, grid, N - 2);
  const dominant = (c: number[]) => c.indexOf(Math.max(...c));
  assert.notEqual(dominant(foot), dominant(top), 'le pied et le haut n’ont pas la même teinte');
  const cover = new LedJukeboxMusic();
  play(cover, () => spectrum(1, 1, 1), 0, 4000, ['#c01020', '#2040c0', '#20c040']);
  const c0 = rgbAt(cover, grid, 1);
  const c1 = rgbAt(cover, grid, N - 2);
  assert.ok(c0[0]! > c0[2]!, 'le pied prend le rouge de la pochette');
  assert.ok(c1[1]! > c1[0]!, 'le haut prend son vert');
});

test('luminosité : jamais au-delà du cran réglé, à pleine musique comme à chaque cran', () => {
  for (const level of LED_LEVEL_CHOICES) {
    const music = new LedJukeboxMusic();
    play(music, kick, 0, 5000);
    const bytes = music.render(WIRINGS[0]!, level);
    const cap = Math.ceil(255 * ledLevelGain(level));
    assert.ok(Math.max(...bytes) <= cap, `cran ${level} % : ${Math.max(...bytes)} > ${cap}`);
    if (level === 0) assert.ok(bytes.every((b) => b === 0), '0 % : éteintes');
  }
});

test('plus de niveaux : les lumières s’éteignent en douceur, puis la musique rend les bandes à l’ambiance', () => {
  const music = new LedJukeboxMusic();
  const { end } = play(music, kick, 0, 5000);
  assert.equal(music.active(end), true);
  const stopped = end + LED_MUSIC_STALE_MS + 1;
  assert.equal(music.fresh(stopped), false);
  music.step(stopped - FRAME);
  music.step(stopped);
  assert.ok(music.render(WIRINGS[0]!, 100).some((b) => b > 0), 'encore une lueur juste après l’arrêt');
  let u = stopped;
  for (; u < stopped + 4000; u += FRAME) music.step(u);
  assert.equal(music.active(u), false);
  assert.ok(music.render(WIRINGS[0]!, 100).every((b) => b === 0));
});
