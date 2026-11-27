// Propositions de médias (app/src/media-proposals.ts, media-search.ts) : l'écran s'ouvre sans attendre
// les sites ni les aperçus, qui arrivent en arrière-plan. Sur une connexion lente (PinCab du 27/11/2026 :
// 547 ms jusqu'à la box, 26 à 44 s pour l'index de 1,7 Mo) tout lire à la suite avant d'ouvrir l'écran
// additionnait les attentes ; l'attente imposée par VPUniverse bloquait en plus le choix du fronton.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const src = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');
const body = (text: string, start: string) => {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `introuvable : ${start}`);
  const next = text.indexOf('\n  function ', at + start.length);
  const nextAsync = text.indexOf('\n  async function ', at + start.length);
  const end = [next, nextAsync].filter((n) => n > 0).reduce((a, b) => Math.min(a, b), text.length);
  return text.slice(at, end);
};

test('propositions de médias : l’écran s’ouvre sans attendre la préparation (sites, aperçus, poids)', () => {
  const proposals = src('media-proposals.ts');
  assert.doesNotMatch(proposals, /await prepareType\(/, 'prepareType ne s’attend plus : elle travaille en arrière-plan');
  for (const start of ['function open(', 'function reopen(', 'function searchTitle(']) {
    const fn = body(proposals, start);
    assert.match(fn, /prepareType\(/, `${start} lance la préparation`);
    assert.ok(fn.indexOf('prepareType(') < fn.indexOf('ctx.show('), `${start} : préparation lancée, puis l’écran tout de suite`);
  }
});

test('propositions de médias : la préparation en arrière-plan n’occupe pas l’écran et se redessine à l’arrivée', () => {
  const prepare = body(src('media-proposals.ts'), 'function prepareType(');
  // Hors d'une opération, un message d'attente resterait affiché et bloquerait les touches.
  assert.doesNotMatch(prepare, /ctx\.progress\(/, 'aucun message d’attente en arrière-plan');
  assert.match(prepare, /quiet: true/, 'aperçus sans message d’attente');
  assert.match(prepare, /sizes\([^)]*quiet: true/, 'poids sans message d’attente');
  assert.match(prepare, /ctx\.changed\?\.\(\)/, 'l’écran se redessine à l’arrivée');
  // Une préparation plus récente (autre média, autre titre) arrête la précédente.
  assert.match(prepare, /st\.run === mine/);
  assert.match(prepare, /stop: \(\) => !live\(\)/);
  // Sites et GitHub se lisent en même temps, pas l'un après l'autre.
  assert.match(prepare, /for \(const work of \[fromSites, fromMediaDb\]\)/);
});

test('propositions de médias : une carte sans aperçu le dit tant qu’il est attendu', () => {
  const thumb = body(src('media-proposals.ts'), 'function remoteThumb(');
  assert.match(thumb, /st\.loading\.has\(offer\.preview\.url\)[^\n]*pending: true/);
});

test('aperçus de VPinMediaDB : plusieurs à la fois, jamais deux fois le même, arrêtables', () => {
  const stage = body(src('media-search.ts'), 'async function stagePreviews(');
  assert.match(stage, /opts\.atOnce \?\? 4/, 'plusieurs à la fois par défaut');
  assert.match(stage, /previewJobs\.get\(file\.url\)/, 'un même aperçu demandé deux fois : un seul téléchargement (même .part)');
  assert.match(stage, /opts\.stop\?\.\(\)/, 'arrêtable avant chaque fichier');
  assert.match(stage, /opts\.onEach\?\.\(file\.url\)/, 'chaque fichier reçu ou non est signalé');
});
