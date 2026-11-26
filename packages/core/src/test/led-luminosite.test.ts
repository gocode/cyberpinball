// Luminosité perçue des LED (led-luminosite.ts) : courbe, crans, reprise des anciens réglages linéaires,
// arrondi tramé, et le moteur des animations qui s'y plie (retour d'essai du 26/11/2026 : « 30 % encore
// aveuglant », « 10 % encore très lumineux »).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  LED_BRIGHTNESS_CHOICES,
  LED_LEVEL_CHOICES,
  LED_LEVEL_SCALE,
  LedAmbientEngine,
  DEFAULT_LED_ANIMATIONS,
  ledAnimationsFile,
  ledDitherByte,
  ledLevelFromLinear,
  ledLevelGain,
  ledLevelOf,
  nearestLedLevel,
  readLedAnimations,
  renderLedFx,
  writeLedAnimations,
  type LedGrid,
} from '../index';

test('luminosité LED : courbe monotone, 0 % éteint, 100 % inchangé, 50 % à moitié perçu', () => {
  assert.equal(ledLevelGain(0), 0);
  assert.equal(ledLevelGain(-5), 0);
  assert.equal(ledLevelGain(Number.NaN), 0);
  assert.equal(ledLevelGain(100), 1);
  assert.equal(ledLevelGain(250), 1);
  let prev = -1;
  for (let p = 0; p <= 100; p += 0.25) {
    const g = ledLevelGain(p);
    assert.ok(g > prev || (p === 0 && g === 0), `strictement croissante à ${p} %`);
    prev = g;
  }
  // Clarté CIE L* : 50 % perçus = 18 % de la lumière ; 10 % très tamisé ; 1 % la quasi-extinction.
  assert.ok(Math.abs(ledLevelGain(50) - 0.184) < 0.002, `50 % : ${ledLevelGain(50)}`);
  assert.ok(ledLevelGain(10) < 0.012, `10 % : ${ledLevelGain(10)}`);
  assert.ok(ledLevelGain(1) > 0 && ledLevelGain(1) * 255 < 0.5, 'à 1 %, moins d’une demi-unité sur un blanc plein');
  // Continue au raccord linéaire/cube (8 %).
  assert.ok(Math.abs(ledLevelGain(8.0001) - ledLevelGain(7.9999)) < 1e-6);
  for (let p = 0; p <= 100; p += 0.5) assert.ok(Math.abs(ledLevelOf(ledLevelGain(p)) - p) < 1e-6, `aller-retour à ${p} %`);
});

test('luminosité LED : crans de 10 en 10, de 0 à 100 %, 10 % à la quasi-extinction', () => {
  assert.deepEqual(LED_LEVEL_CHOICES, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(LED_BRIGHTNESS_CHOICES, LED_LEVEL_CHOICES, 'animations et effets : les mêmes crans');
  // Le premier cran allumé : à peine 3 sur 255 pour un blanc plein.
  assert.ok(255 * ledLevelGain(LED_LEVEL_CHOICES[1]!) < 3.5, `10 % : ${255 * ledLevelGain(10)} sur 255`);
  assert.equal(nearestLedLevel(15), 10, 'à égalité, le plus bas');
  assert.equal(nearestLedLevel(4), 0);
  assert.equal(nearestLedLevel(99), 100);
});

test('luminosité LED : un ancien réglage linéaire devient le cran perçu de même lumière', () => {
  const expected: Record<number, number> = { 0: 0, 5: 30, 10: 40, 20: 50, 30: 60, 40: 70, 50: 80, 60: 80, 70: 90, 80: 90, 100: 100 };
  let prev = -1;
  for (let old = 0; old <= 100; old++) {
    const now = ledLevelFromLinear(old);
    assert.ok(LED_LEVEL_CHOICES.includes(now), `${old} → ${now} : un cran proposé`);
    assert.ok(now >= prev, `croissant à ${old}`);
    prev = now;
    if (expected[old] !== undefined) assert.equal(now, expected[old], `${old} % linéaires`);
    // Même impression à un demi-cran près (les crans du haut sont espacés de 10 points perçus).
    assert.ok(Math.abs(ledLevelOf(old / 100) - now) <= 5 + 1e-9, `${old} % : ${ledLevelOf(old / 100)} perçus, cran ${now}`);
  }
});

test('luminosité LED : fichier des animations, ancien (linéaire) repris, nouveau relu tel quel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-led-lum-'));
  try {
    fs.writeFileSync(ledAnimationsFile(dir), JSON.stringify({ brightness: 30, style: 'wave' }));
    assert.equal(readLedAnimations(dir).brightness, 60, 'ancien 30 % linéaire : 60 % perçus, même lumière');
    assert.equal(readLedAnimations(dir).style, 'wave', 'le reste est gardé');
    writeLedAnimations(dir, { ...DEFAULT_LED_ANIMATIONS, brightness: 10 });
    const raw = JSON.parse(fs.readFileSync(ledAnimationsFile(dir), 'utf8')) as Record<string, unknown>;
    assert.equal(raw.scale, LED_LEVEL_SCALE, 'le fichier dit son échelle');
    assert.equal(readLedAnimations(dir).brightness, 10, 'relu sans reprise');
    assert.equal(readLedAnimations(dir).brightness, 10, 'stable');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('luminosité LED : arrondi tramé exact en moyenne, sans escalier, et la teinte tient', () => {
  // Moyenne sur 1000 LED d'une même valeur : la lumière voulue, même sous une unité.
  for (const v of [0.1, 0.37, 0.5, 1.4, 2.75, 12.2, 254.6]) {
    let sum = 0;
    for (let k = 0; k < 1000; k++) sum += ledDitherByte(v, k);
    assert.ok(Math.abs(sum / 1000 - v) < 0.01, `${v} : moyenne ${sum / 1000}`);
  }
  assert.equal(ledDitherByte(0, 3), 0);
  assert.equal(ledDitherByte(-2, 3), 0);
  assert.equal(ledDitherByte(300, 3), 255);
  assert.equal(ledDitherByte(Number.NaN, 3), 0);
  // Une bande blanche dont on baisse la luminosité cran par cran : la lumière totale descend sans
  // palier ni saut (chaque pas de 0,25 % baisse un peu, jamais d'un coup la moitié).
  const light = new Float32Array(120 * 3).fill(1);
  const total = (p: number) => {
    const out = new Uint8Array(120 * 3);
    for (let i = 0; i < out.length; i++) out[i] = ledDitherByte(255 * ledLevelGain(p) * light[i]!, (i / 3) | 0);
    return out.reduce((s, v) => s + v, 0);
  };
  let prev = total(0);
  assert.equal(prev, 0);
  for (let p = 0.25; p <= 15; p += 0.25) {
    const now = total(p);
    assert.ok(now >= prev, `${p} % : ${now} < ${prev}`);
    // Dès 1 % (en dessous, la courbe est linéaire et part de zéro : les rapports n'y veulent rien dire).
    if (p >= 1) assert.ok(now <= prev * 1.5 + 3, `${p} % : saut de ${prev} à ${now}`);
    prev = now;
  }
  assert.ok(total(3) > 0, 'à 3 %, quelques LED encore allumées : la quasi-extinction, pas le noir');
  // Teinte : un orange (255, 128, 32) atténué garde l'ordre et à peu près les rapports de ses canaux.
  const orange = [1, 128 / 255, 32 / 255];
  for (const p of [20, 40, 70]) {
    const sums = [0, 0, 0];
    for (let k = 0; k < 120; k++) for (let c = 0; c < 3; c++) sums[c]! += ledDitherByte(255 * ledLevelGain(p) * orange[c]!, k);
    assert.ok(sums[0]! > sums[1]! && sums[1]! > sums[2]!, `${p} % : ${sums.join(' / ')}`);
    assert.ok(Math.abs(sums[1]! / sums[0]! - 128 / 255) < 0.03, `${p} % : vert/rouge ${sums[1]! / sums[0]!}`);
  }
});

test('luminosité LED : le moteur des animations suit la courbe, 0 % éteint, et ne dépasse jamais le cran', () => {
  const grid: LedGrid = { width: 1, height: 40, arrangement: 'TopDownLeftRight' };
  const peakAt = (brightness: number) => {
    const engine = new LedAmbientEngine({ ...DEFAULT_LED_ANIMATIONS, style: 'breath', brightness }, { seed: 7 });
    engine.setTint('#ffffff', 0, true);
    let peak = 0;
    let sum = 0;
    for (let t = 0; t < 14_000; t += 250) {
      const out = engine.render(grid, t);
      for (const v of out) {
        peak = Math.max(peak, v);
        sum += v;
      }
    }
    return { peak, sum };
  };
  assert.deepEqual(peakAt(0), { peak: 0, sum: 0 }, '0 % : tout éteint');
  let prev = 0;
  for (const p of LED_LEVEL_CHOICES) {
    const { peak, sum } = peakAt(p);
    assert.ok(peak <= Math.ceil(255 * ledLevelGain(p)), `${p} % : pic ${peak}`);
    assert.ok(sum >= prev, `${p} % : plus de lumière qu'au cran d'avant`);
    prev = sum;
  }
  // 100 % : la pleine puissance de l'ambiance reste (plafond d'ambiance 0,7, gamma 2 : 125).
  assert.ok(peakAt(100).peak >= 110, `100 % : ${peakAt(100).peak}`);
  // Les effets de la bibliothèque : même plafond.
  for (const p of [5, 30, 100]) {
    const out = renderLedFx('comet-single', grid, 600, { palette: ['#ffffff'], brightness: ledLevelGain(p), seed: 3 });
    assert.ok(Math.max(...out) <= Math.ceil(255 * ledLevelGain(p)), `effet à ${p} %`);
  }
});
