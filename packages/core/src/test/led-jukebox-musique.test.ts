// LED qui suivent la musique du Juke-box : sans son, rien ; les graves montent depuis le bas de la bande
// (quel que soit le câblage) ; les aigus éclairent le haut ; la luminosité réglée n'est jamais dépassée.

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LED_ANIMATIONS, LED_LEVEL_CHOICES, LED_MUSIC_STALE_MS, LedJukeboxMusic, ledLevelGain, ledStripPosition, normalizeLedAnimations, type LedGrid } from '../index';

const BANDS = 24;
const N = 20;
/** Même bande câblée du haut vers le bas, ou du bas vers le haut : la musique doit y monter pareil. */
const WIRINGS: LedGrid[] = [
  { width: 1, height: N, arrangement: 'LeftRightTopDown' },
  { width: 1, height: N, arrangement: 'LeftRightBottomUp' },
];
const levels = (bass: number, mid: number, high: number): number[] => Array.from({ length: BANDS }, (_, i) => (i < 6 ? bass : i < 16 ? mid : high));
/** Lumière (somme des canaux) de chaque LED, rangée du bas (0) vers le haut (N - 1) selon ledStripPosition. */
function bottomUp(music: LedJukeboxMusic, grid: LedGrid, brightness = 100): number[] {
  const bytes = music.render(grid, brightness);
  const out = new Array<number>(N).fill(0);
  for (let k = 0; k < N; k++) out[Math.round(ledStripPosition(grid, k) * (N - 1))] = bytes[k * 3]! + bytes[k * 3 + 1]! + bytes[k * 3 + 2]!;
  return out;
}
/** Joue `ms` de musique constante, une image tous les 40 ms. */
function play(music: LedJukeboxMusic, input: number[], from: number, ms: number): number {
  let t = from;
  for (; t <= from + ms; t += 40) {
    music.feed(input, t);
    music.step(t);
  }
  return t;
}

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
    play(music, levels(0, 0, 0), 0, 1000);
    assert.ok(music.render(grid, 100).every((b) => b === 0), 'silence');
    play(music, levels(0.06, 0.05, 0.07), 1000, 1000);
    assert.ok(music.render(grid, 100).every((b) => b === 0), 'bruit sous le seuil');
    assert.equal(music.active(2000), true, 'les niveaux arrivent encore');
  }
});

test('les graves montent du bas de la bande, quel que soit le câblage', () => {
  for (const grid of WIRINGS) {
    const music = new LedJukeboxMusic();
    play(music, levels(0.5, 0, 0), 0, 1500);
    const col = bottomUp(music, grid);
    assert.ok(col[0]! > 0, 'le pied est allumé');
    assert.ok(col[0]! >= col[Math.floor(N / 2)]!, 'plus fort au pied qu’au milieu');
    assert.equal(col[N - 1], 0, 'le haut reste éteint pour des graves moyens');
    for (let i = 1; i < N; i++) assert.ok(col[i]! <= col[i - 1]!, 'décroît vers le haut');
    // Plus de graves : la lumière monte plus haut.
    const high = (c: number[]) => c.filter((v) => v > 0).length;
    const before = high(col);
    play(music, levels(0.95, 0, 0), 1500, 1500);
    assert.ok(high(bottomUp(music, grid)) > before, 'des graves plus forts montent plus haut');
  }
  // Les deux câblages donnent la même image une fois remise dans le sens du bas vers le haut.
  const a = new LedJukeboxMusic();
  const b = new LedJukeboxMusic();
  play(a, levels(0.7, 0.3, 0.2), 0, 1500);
  play(b, levels(0.7, 0.3, 0.2), 0, 1500);
  // (au tramage près : l'arrondi dépend du rang de la LED, d'où ±3 sur la somme des trois canaux)
  const [ca, cb] = [bottomUp(a, WIRINGS[0]!), bottomUp(b, WIRINGS[1]!)];
  ca.forEach((v, i) => assert.ok(Math.abs(v - cb[i]!) <= 3, `LED ${i} : ${v} contre ${cb[i]}`));
});

test('les aigus éclairent le haut, pas le pied', () => {
  const music = new LedJukeboxMusic();
  play(music, levels(0, 0, 0.9), 0, 1500);
  const col = bottomUp(music, WIRINGS[0]!);
  assert.equal(col[0], 0);
  assert.ok(col[N - 1]! > 0);
});

test('couleurs : la pochette quand on la connaît, le vert Cyber Pinball sinon', () => {
  const grid = WIRINGS[1]!;
  const green = new LedJukeboxMusic();
  play(green, levels(0.8, 0, 0), 0, 1500);
  const g = green.render(grid, 100);
  assert.ok(g[1]! > g[0]! && g[1]! > g[2]!, 'vert par défaut');
  const red = new LedJukeboxMusic();
  let t = 0;
  for (; t <= 1500; t += 40) {
    red.feed(levels(0.8, 0, 0), t, ['#c01020']);
    red.step(t);
  }
  const r = red.render(grid, 100);
  assert.ok(r[0]! > r[1]! && r[0]! > r[2]!, 'rouge de la pochette');
});

test('luminosité : jamais au-delà du cran réglé, à pleine musique comme à chaque cran', () => {
  for (const level of LED_LEVEL_CHOICES) {
    const music = new LedJukeboxMusic();
    play(music, levels(1, 1, 1), 0, 1500);
    const bytes = music.render(WIRINGS[0]!, level);
    const cap = Math.ceil(255 * ledLevelGain(level));
    assert.ok(Math.max(...bytes) <= cap, `cran ${level} % : ${Math.max(...bytes)} > ${cap}`);
    if (level === 0) assert.ok(bytes.every((b) => b === 0), '0 % : éteintes');
  }
});

test('plus de niveaux : la musique rend les bandes à l’ambiance après s’être éteinte en douceur', () => {
  const music = new LedJukeboxMusic();
  const t = play(music, levels(0.9, 0.5, 0.5), 0, 1500);
  assert.equal(music.active(t), true);
  // Le morceau s'arrête : plus de niveaux. Les lumières retombent sans coupure sèche, puis la musique se retire.
  const stopped = t + LED_MUSIC_STALE_MS + 1;
  assert.equal(music.fresh(stopped), false);
  music.step(stopped - 40);
  music.step(stopped);
  assert.ok(music.render(WIRINGS[0]!, 100).some((b) => b > 0), 'encore une lueur juste après l’arrêt');
  let u = stopped;
  for (; u < stopped + 3000; u += 40) music.step(u);
  assert.equal(music.active(u), false);
  assert.ok(music.render(WIRINGS[0]!, 100).every((b) => b === 0));
});

test('pas de clignotement perpétuel : une basse stable donne une image stable', () => {
  const music = new LedJukeboxMusic();
  let t = play(music, levels(0.6, 0.3, 0.2), 0, 1500);
  const first = Array.from(music.render(WIRINGS[0]!, 100));
  for (let i = 0; i < 20; i++) {
    t += 40;
    music.feed(levels(0.6, 0.3, 0.2), t);
    music.step(t);
  }
  const later = Array.from(music.render(WIRINGS[0]!, 100));
  const drift = first.reduce((s, v, i) => s + Math.abs(v - later[i]!), 0);
  assert.ok(drift < 6, `image stable (écart ${drift})`);
});
