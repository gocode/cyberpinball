// Coordination des sessions : file des branches, attente de la publication groupée, verrous,
// lecture des sorties de tests. Sans git ni processus lancé (test rapide).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DUREE_SUITE_DEFAUT_MS, IMMINENT_MS, expectedSuiteMs, imminent, liveEntries, readJson, tryLock, writeJson } from './coordination.mjs';
import { ATTENTE_MAX_MS, publicationPlan, publicationRetry, worthWaiting } from './publication-groupee.mjs';
import { failedFiles, failureDetails, totals } from './sortie-tests.mjs';
import { problemLines } from './controles.mjs';

const T0 = Date.parse('2026-11-21T12:00:00Z');
const at = (min) => new Date(T0 + min * 60_000).toISOString();

test('file : une branche compte tant que son processus vit ; une suite verte, jusqu’à sa fin prévue', () => {
  const entries = [
    { branche: 'a', etape: 'tests', pid: 1, finPrevue: at(5) },
    { branche: 'b', etape: 'tests', pid: 2, finPrevue: at(5) },
    { branche: 'c', etape: 'testee', pid: 3, finPrevue: at(3) },
    { branche: 'd', etape: 'testee', pid: 4, finPrevue: at(-1) },
  ];
  const kept = liveEntries(entries, T0, (pid) => pid === 1);
  assert.deepEqual(kept.map((e) => e.branche), ['a', 'c']);
});

test('publication groupée : elle n’attend que les fusions prévues dans les 2 minutes, jamais plus de 2 minutes', () => {
  assert.equal(IMMINENT_MS, 10 * 60_000);
  assert.equal(ATTENTE_MAX_MS, 2 * 60_000, 'deux minutes d’attente au plus pour grouper');
  const entries = [
    { branche: 'moi', etape: 'integration', finPrevue: at(1) },
    { branche: 'bientot', etape: 'tests', finPrevue: at(1.5) },
    { branche: 'plus-tard', etape: 'tests', finPrevue: at(8) },
    { branche: 'loin', etape: 'attente-suite', finPrevue: at(25) },
    { branche: 'faite', etape: 'fusionnee', finPrevue: at(0) },
    { branche: 'en-retard', etape: 'tests', finPrevue: at(-3) },
    { branche: 'un-peu-en-retard', etape: 'tests', finPrevue: at(-0.5) },
  ];
  assert.deepEqual(imminent(entries, { now: T0, except: 'moi' }).map((e) => e.branche), ['bientot', 'plus-tard', 'en-retard', 'un-peu-en-retard']);
  // Une fusion prévue au-delà du plafond, ou déjà en retard, n'est pas attendue : la publication part.
  assert.deepEqual(worthWaiting(entries, { now: T0, except: 'moi' }).map((e) => e.branche), ['bientot', 'un-peu-en-retard']);
});

test('publication interrompue : la relance reprend le numéro malgré le commit Version, puis garde le mode léger', () => {
  assert.equal(publicationPlan({ pending: 0 }), undefined);
  assert.deepEqual(publicationPlan({ pending: 0, retry: true }), { reprendre: true, args: ['--rapide'] });
  assert.deepEqual(publicationPlan({ pending: 0, retry: true, leger: true }), { reprendre: true, args: ['--leger'] });
  assert.deepEqual(publicationPlan({ pending: 1, retry: true }), { reprendre: false, args: ['--rapide', '--essai'] });
  assert.deepEqual(publicationPlan({ pending: 2, leger: true }), { reprendre: false, args: ['--leger', '--essai'] });
});

test('reprise : seulement une préversion effectivement préparée, jamais une finale ni la version précédente', () => {
  const attempt = { before: 'old', head: 'new', subject: 'Version 0.2.3-essai.46', reprendre: false, leger: true };
  assert.deepEqual(publicationRetry(attempt), { head: 'new', leger: true });
  assert.equal(publicationRetry({ ...attempt, head: 'old' }), undefined, 'échec avant le commit de version');
  assert.equal(publicationRetry({ ...attempt, subject: 'Version 0.2.3' }), undefined, 'aucune finale automatique');
  assert.equal(publicationRetry({ ...attempt, subject: 'Autre correction' }), undefined);
  assert.deepEqual(publicationRetry({ ...attempt, head: 'old', reprendre: true }), { head: 'old', leger: true }, 'une reprise peut échouer avant de refabriquer');
});

test('durée prévue d’une suite : médiane des dernières mesures, sinon la valeur par défaut', () => {
  assert.equal(expectedSuiteMs([]), DUREE_SUITE_DEFAUT_MS);
  assert.equal(expectedSuiteMs([{ ms: 300_000 }, { ms: 900_000 }, { ms: 400_000 }]), 400_000);
});

test('verrou : exclusif tant que son processus vit, repris quand il a disparu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-coordination-'));
  try {
    const file = path.join(dir, 'x.lock');
    const release = tryLock(file, { branche: 'a' });
    assert.ok(release);
    assert.equal(tryLock(file), undefined, 'tenu par ce processus, vivant');
    release();
    assert.equal(fs.existsSync(file), false);
    // Verrou d'un processus disparu (numéro très improbable) : repris.
    writeJson(file, { pid: 2 ** 22 + 12345, since: at(0) });
    const again = tryLock(file);
    assert.ok(again);
    assert.equal(readJson(file).pid, process.pid);
    again();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('places de vérification : trois par défaut ; quand toutes sont prises, la suivante attend', async () => {
  const { suiteSlots, SUITES_SIMULTANEES } = await import('./avant-fusion.mjs');
  assert.equal(SUITES_SIMULTANEES, Math.max(1, Number(process.env.CYBERPINBALL_SUITES) || 3));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-places-'));
  try {
    const slots = suiteSlots(dir, 2);
    const take = () => {
      for (const f of slots) {
        const r = tryLock(f);
        if (r) return r;
      }
      return undefined;
    };
    const a = take();
    const b = take();
    assert.ok(a && b, 'deux places');
    assert.equal(take(), undefined, 'la troisième attend');
    a();
    const c = take();
    assert.ok(c, 'une place libérée est reprise');
    b();
    c();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const TAP = `TAP version 13
# Subtest: packages\\core\\dist\\test\\groupes.test.js
    # Subtest: réseau
        # Subtest: groupes publics sur le réseau
        not ok 1 - groupes publics sur le réseau
          ---
          location: 'D:\\\\x\\\\packages\\\\core\\\\dist\\\\test\\\\groupes.test.js:120:3'
          error: 'attendu : le groupe public chez Eve'
          ...
        1..1
    not ok 1 - réseau
      ---
      location: 'D:\\\\x\\\\packages\\\\core\\\\dist\\\\test\\\\groupes.test.js:100:1'
      error: '1 subtest failed'
      ...
    1..1
not ok 1 - packages\\core\\dist\\test\\groupes.test.js
  ---
  ...
# Subtest: scripts\\verifier.test.mjs
ok 2 - scripts\\verifier.test.mjs
1..2
# tests 40
# pass 39
# fail 1
`;

test('sortie des tests : fichiers en échec, cas le plus profond et son erreur, totaux', () => {
  assert.deepEqual(failedFiles(TAP), ['packages\\core\\dist\\test\\groupes.test.js']);
  const details = failureDetails(TAP);
  assert.equal(details.length, 1, 'le parent « réseau » n’est pas répété');
  assert.equal(details[0].name, 'groupes publics sur le réseau');
  assert.equal(details[0].file, 'groupes.test.js');
  assert.match(details[0].error, /attendu : le groupe public chez Eve/);
  assert.deepEqual(totals(TAP), { tests: 40, pass: 39, fail: 1 });
});

test('sortie des tests à plat (node récent, plusieurs fichiers) : le fichier vient de la location', () => {
  const flat = `TAP version 13
# Subtest: sorties du son, vrai Chromium
not ok 124 - sorties du son, vrai Chromium
  ---
  duration_ms: 289.6
  location: 'D:\\\\x\\\\packages\\\\core\\\\dist\\\\test\\\\jukebox-sorties-chromium.test.js:137:22'
  failureType: 'testCodeFailure'
  error: 'le morceau continue pendant le changement de plan'
  ...
# Subtest: autre
ok 125 - autre
# fail 1
`;
  assert.deepEqual(failedFiles(flat), ['D:\\x\\packages\\core\\dist\\test\\jukebox-sorties-chromium.test.js']);
  const details = failureDetails(flat);
  assert.equal(details.length, 1);
  assert.equal(details[0].file, 'jukebox-sorties-chromium.test.js');
  assert.match(details[0].error, /changement de plan/);
});

test('contrôles : seules les lignes qui disent le problème, sans le bruit de npm', () => {
  const out = '> cyberpinball@0.2.3 build\n> tsc -b\n\napp/src/x.ts(3,1): error TS2304: Cannot find name foo.\nnpm error code 1\n    at foo (node:internal/x)\n';
  assert.deepEqual(problemLines(out), ['  app/src/x.ts(3,1): error TS2304: Cannot find name foo.']);
});
