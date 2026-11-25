// Garde-fou des durées de tests (scripts/durees-tests.mjs) : la règle « un fichier de tests rapides de plus de
// 60 s est signalé, avec son nom et sa durée » est fixée ici, et le reporter est essayé sur une vraie
// exécution de node:test. Cause : banc-casque.test.mjs, 29 essais en série, 242 s à lui seul (25/11/2026).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { run as runTests, test } from 'node:test';
import { SEUIL_FICHIER_LENT_MS, avertissementsLents, dureesParFichier, fichiersLents, lireDurees, reporterArgs } from './durees-tests.mjs';
import reporterDurees from './durees-tests.mjs';

const cwd = path.resolve('/depot');
const fichier = (rel) => path.join(cwd, rel);
const complet = (rel, name, nesting, ms) => ({ type: 'test:complete', data: { file: fichier(rel), name, nesting, details: { duration_ms: ms } } });

test('durées : un fichier est connu par son propre événement de niveau 0, pas par ses essais', () => {
  const events = [
    complet('scripts/lent.test.mjs', 'premier essai', 0, 30_000),
    complet('scripts/lent.test.mjs', 'sous-essai', 1, 5_000),
    complet('scripts/lent.test.mjs', 'second essai', 0, 30_000),
    complet('scripts/lent.test.mjs', 'scripts/lent.test.mjs', 0, 61_234.4),
    complet('scripts/vif.test.mjs', 'scripts/vif.test.mjs', 0, 800),
    { type: 'test:pass', data: { file: fichier('scripts/vif.test.mjs'), name: 'x', nesting: 0, details: { duration_ms: 99_999 } } },
  ];
  // Du plus long au plus court, chemins relatifs au dossier des contrôles.
  assert.deepEqual(dureesParFichier(events, cwd), { 'scripts/lent.test.mjs': 61_234, 'scripts/vif.test.mjs': 800 });
});

test('durées : sans événement de fichier (autre version de node), la somme des essais de niveau 0', () => {
  const events = [complet('scripts/a.test.mjs', 'un', 0, 10), complet('scripts/a.test.mjs', 'deux', 0, 20), complet('scripts/a.test.mjs', 'sous', 1, 500)];
  assert.deepEqual(dureesParFichier(events, cwd), { 'scripts/a.test.mjs': 30 });
});

test('durées : plus de 60 s est lent, 60 s pile ne l’est pas', () => {
  assert.equal(SEUIL_FICHIER_LENT_MS, 60_000);
  const durees = { 'a.test.mjs': 60_000, 'b.test.mjs': 60_001, 'c.test.mjs': 242_000, 'd.test.mjs': 1_000 };
  assert.deepEqual(fichiersLents(durees), [
    { fichier: 'c.test.mjs', ms: 242_000 },
    { fichier: 'b.test.mjs', ms: 60_001 },
  ]);
  assert.deepEqual(fichiersLents({}), []);
});

test('durées : l’avertissement nomme chaque fichier lent et sa durée ; rien quand tout va bien', () => {
  const lignes = avertissementsLents({ 'scripts/banc-casque.test.mjs': 242_400, 'rapide.test.js': 900 });
  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /^Avertissement : 1 fichier\(s\) de tests rapides de plus de 60 s/);
  assert.equal(lignes[1], '  - scripts/banc-casque.test.mjs : 242 s');
  assert.deepEqual(avertissementsLents({ 'rapide.test.js': 900 }), []);
});

test('durées : lecture du fichier écrit, ou rien s’il manque ou est illisible', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durees-'));
  try {
    assert.equal(lireDurees(dir), undefined);
    fs.mkdirSync(path.join(dir, 'tmp'));
    fs.writeFileSync(path.join(dir, 'tmp', 'durees-tests-rapides.json'), '{ pas du JSON');
    assert.equal(lireDurees(dir), undefined);
    fs.writeFileSync(path.join(dir, 'tmp', 'durees-tests-rapides.json'), JSON.stringify({ fichiers: { 'a.test.mjs': 5 } }));
    assert.deepEqual(lireDurees(dir)?.fichiers, { 'a.test.mjs': 5 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('durées : le reporter, sur une vraie exécution de node:test, rend la durée réelle du fichier', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durees-run-'));
  try {
    const file = path.join(dir, 'attente.test.mjs');
    // Deux essais de 300 ms en parallèle : le fichier dure ~300 ms, pas la somme (600 ms).
    fs.writeFileSync(
      file,
      "import { describe, it } from 'node:test';\nconst attendre = () => new Promise((r) => setTimeout(r, 300));\ndescribe('lot', { concurrency: 2 }, () => { it('a', attendre); it('b', attendre); });\n",
    );
    let json = '';
    // Sous node --test, NODE_TEST_CONTEXT fait de toute exécution imbriquée un simple fils muet : retiré le temps de l'essai.
    const contexte = process.env.NODE_TEST_CONTEXT;
    delete process.env.NODE_TEST_CONTEXT;
    try {
      for await (const chunk of reporterDurees(runTests({ files: [file] }))) json += chunk;
    } finally {
      if (contexte !== undefined) process.env.NODE_TEST_CONTEXT = contexte;
    }
    const { fichiers } = JSON.parse(json);
    const ms = Object.values(fichiers);
    assert.equal(ms.length, 1, json);
    assert.ok(ms[0] >= 250, `durée réelle du fichier : ${ms[0]} ms`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('durées : les contrôles express branchent le reporter et signalent les fichiers lents', () => {
  const args = reporterArgs(cwd);
  assert.deepEqual(args.slice(0, 2), ['--test-reporter=tap', '--test-reporter-destination=stdout']);
  assert.match(args[2], /^--test-reporter=file:.*durees-tests\.mjs$/);
  assert.equal(args[3], `--test-reporter-destination=${path.join(cwd, 'tmp', 'durees-tests-rapides.json')}`);
  const controles = fs.readFileSync(new URL('./controles.mjs', import.meta.url), 'utf8');
  assert.match(controles, /\.\.\.reporterArgs\(cwd\)/, 'les tests rapides passent par le reporter de durées');
  assert.match(controles, /avertissementsLents\(lireDurees\(cwd\)/, 'les contrôles avertissent des fichiers lents');
});
