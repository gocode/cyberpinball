import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { cpuPercent, gameLoadReport, loadPart, loadSample } from '../game-load';

test('charge pendant la partie : chaque processus d’Electron dans sa part', () => {
  assert.equal(loadPart('Browser'), 'main');
  assert.equal(loadPart('GPU'), 'gpu');
  assert.equal(loadPart('Tab'), 'pages');
  assert.equal(loadPart('Utility'), 'other');
  const s = loadSample([
    { type: 'Browser', cpu: 1 },
    { type: 'GPU', cpu: 2 },
    { type: 'Tab', cpu: 0.5 },
    { type: 'Tab', cpu: 0.5 },
    { type: 'Utility', cpu: -1 },
  ]);
  assert.deepEqual(s, { ours: { main: 1, gpu: 2, pages: 1, other: 0 } });
  assert.deepEqual(loadSample([], 80).vpx, 80);
});

test('charge de VPX : temps de processeur rapporté au temps écoulé, en pourcentage d’un cœur', () => {
  assert.equal(cpuPercent(1000, 5000, 5000), 80);
  // Plusieurs cœurs : au-delà de 100 %.
  assert.equal(cpuPercent(0, 10_000, 5000), 200);
  assert.equal(cpuPercent(1000, 1000, 0), 0);
});

test('charge pendant la partie : moyenne, pointe, détail et VPX dans une ligne du journal', () => {
  const samples = [
    { ours: { main: 1, gpu: 0.5, pages: 0.5, other: 0 }, vpx: 90 },
    { ours: { main: 3, gpu: 1.5, pages: 1.5, other: 0 }, vpx: 110 },
  ];
  assert.equal(
    gameLoadReport(samples, 'casque', 5000),
    'Charge pendant la partie (dans le casque) : Cyber Pinball 4 % d’un cœur en moyenne, 6 % au plus (principal 2 %, GPU de Chromium 1 %, pages des écrans 1 %, autres 0 %) ; VPX 100 % d’un cœur en moyenne, 110 % au plus ; 2 relevés sur 10 s.',
  );
  // VPX pas lu (fermé, ou droits refusés) : Cyber Pinball seul.
  assert.doesNotMatch(gameLoadReport([{ ours: { main: 0.25, gpu: 0, pages: 0, other: 0 } }], 'ecrans', 5000) ?? '', /VPX/);
  assert.match(gameLoadReport([{ ours: { main: 0.25, gpu: 0, pages: 0, other: 0 } }], 'ecrans', 5000) ?? '', /sur les écrans\) : Cyber Pinball 0,3 %/);
  assert.equal(gameLoadReport([], 'casque', 5000), undefined);
});

test('charge pendant la partie : relevée pour chaque vraie partie, notée à sa fin', () => {
  const app = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const frontend = fs.readFileSync(path.join(app, 'frontend.ts'), 'utf8');
  assert.match(frontend, /if \(simulated === undefined && !gameLoad\) gameLoad = watchGameLoad\(game\.pid\);/);
  assert.match(frontend, /inGameMenu\.disarm\(\);\s*const load = gameLoad\?\.stop\(playedVr \? 'casque' : 'ecrans'\);\s*if \(load\) console\.log\(load\);/);
  // Rien n'est lancé pour mesurer : ni programme, ni page réveillée.
  const watch = fs.readFileSync(path.join(app, 'game-load.ts'), 'utf8');
  assert.doesNotMatch(watch, /spawn|exec|executeJavaScript/);
  assert.match(watch, /timer\.unref\(\);/);
});
