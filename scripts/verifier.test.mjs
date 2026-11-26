// Boucle de test courte (scripts/verifier.mjs) : quels fichiers de test sont lents, lesquels
// suivent un fichier changé. Une erreur ici ferait sauter des tests en silence pendant le travail.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { localImports, slowFiles, testsForChanges } from './verifier.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('verifier : un test est lent par lui-même ou par une aide du dossier des tests qu’il importe', () => {
  // Les mots qui rendent un test lent sont assemblés : écrits tels quels, ils rendraient lent ce test-ci.
  const spawn = 'spawn' + 'Sync';
  const modules = {
    'a.test': 'const x = require("./outils");',
    outils: 'const { run' + 'Electron } = require("./electron-run");',
    'electron-run': `const { ${spawn} } = require("node:child_process"); ${spawn}(electron, args);`,
    'b.test': 'const fixtures = require("./fixtures"); const core = require("../store");',
    fixtures: 'module.exports = {};',
    'c.test': 'const p = require.resolve(' + "'electron'" + ', { paths: [REPO] });',
    'boucle.test': 'require("./boucle-b");',
    'boucle-b': 'require("./boucle.test");',
  };
  const read = (name) => modules[name];
  const slow = slowFiles(['a.test.js', 'b.test.js', 'c.test.js', 'boucle.test.js'], read);
  assert.deepEqual([...slow].sort(), ['a.test.js', 'c.test.js']);
  assert.deepEqual([...slowFiles(['a.test.js'], read, { follow: false })], [], 'sans suivre : seul le texte du test compte');
  assert.deepEqual(localImports('require("./x"); import y from "./y.mjs"; require("../z")'), ['x', 'y']);
});

test('verifier : les tests d’un fichier changé sont ceux qui l’importent, le citent ou portent son nom', () => {
  const sources = {
    'vbs.test.js': "import { cachedScript } from '../../../../app/src/vbs';",
    'puppack.test.js': "import { analysePack } from '../puppack';",
    'manuel.test.js': "const css = read('frontend.css');",
    'autre.test.js': "import { vbsLike } from '../vbsfoo';",
  };
  const tests = Object.keys(sources);
  const of = (name) => sources[name];
  assert.deepEqual(testsForChanges(['app/src/vbs.ts'], tests, of), ['vbs.test.js']);
  assert.deepEqual(testsForChanges(['packages/core/src/puppack.ts'], tests, of), ['puppack.test.js']);
  assert.deepEqual(testsForChanges(['app/renderer/frontend.css'], tests, of), ['manuel.test.js']);
  assert.deepEqual(testsForChanges(['packages/core/src/test/autre.test.ts'], tests, of), ['autre.test.js'], 'un test changé se lance lui-même');
  assert.deepEqual(testsForChanges(['docs/manuel.md'], tests, of), []);
});

test('verifier : une démonstration, un test ou un hôte changés lancent les gardes des doublures', () => {
  const tests = ['demonstrations.test.js', 'doublures.test.js', 'vbs.test.js'];
  const of = () => '';
  assert.deepEqual(testsForChanges(['interne/demos/demo-sante.cjs'], tests, of), ['demonstrations.test.js', 'doublures.test.js']);
  assert.deepEqual(testsForChanges(['packages/core/src/test/vbs.test.ts'], tests, of), ['doublures.test.js', 'vbs.test.js']);
  assert.deepEqual(testsForChanges(['app/src/feedback-service.ts'], tests, of), ['demonstrations.test.js']);
  assert.deepEqual(testsForChanges(['app/src/doublures/feedback.ts'], tests, of), ['demonstrations.test.js', 'doublures.test.js']);
});

test('verifier : la suite rapide et test:electron se partagent tous les tests, les fichiers Electron du dépôt sont lents', () => {
  const dist = path.join(repo, 'packages', 'core', 'dist', 'test');
  if (!fs.existsSync(dist)) return;
  const files = fs.readdirSync(dist).filter((f) => f.endsWith('.test.js'));
  const slow = slowFiles(files, (name) => {
    try {
      return fs.readFileSync(path.join(dist, `${name}.js`), 'utf8');
    } catch {
      return undefined;
    }
  });
  for (const known of ['clavier-reel.test.js', 'clavier-premier-ecran-valider.test.js', 'disposition-ecrans.test.js', 'disposition-ecrans-pages.test.js'])
    if (files.includes(known)) assert.ok(slow.has(known), `${known} : lent`);
  for (const quick of ['coexistence.test.js', 'buttons.test.js']) if (files.includes(quick)) assert.ok(!slow.has(quick), `${quick} : rapide`);
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.verifier, /scripts\/verifier\.mjs/);
  assert.match(pkg.scripts['test:electron'], /scripts\/verifier\.mjs --electron/);
  // L'audit de publication reste avant chaque fusion : avant-fusion et fusionner passent par les contrôles express.
  assert.match(pkg.scripts['avant-fusion'], /scripts\/avant-fusion\.mjs/);
  assert.match(pkg.scripts.fusionner, /scripts\/fusionner\.mjs/);
  const read = (f) => fs.readFileSync(path.join(repo, 'scripts', f), 'utf8');
  assert.match(read('controles.mjs'), /audit-publication\.mjs/, 'l’audit de publication est dans les contrôles express');
  assert.match(read('controles.mjs'), /traductions\.mjs/, 'les traductions aussi');
  assert.match(read('avant-fusion.mjs'), /runControles\(/, 'avant-fusion commence par les contrôles express');
  assert.match(read('fusionner.mjs'), /runControles\(|runAvantFusion\(/, 'fusionner vérifie avant de fusionner');
  // Train de fusion (23/11/2026) : la suite lente complète une fois par préversion, sur proto/ecrans,
  // avant la publication ; jamais une préversion sans elle.
  const train = read('publication-groupee.mjs');
  // Arbre déjà certifié (25/11/2026) : sans tests rapides, mais toujours compilation et tests lents.
  // Le comportement est fixé dans scripts/train.test.mjs (jamais de publication d'un commit non vérifié).
  assert.match(train, /deps\.verify \?\? \(async \(options\) => \(await import\('\.\/avant-fusion\.mjs'\)\)\.runAvantFusion\(options\)\)/, 'la vérification du train est runAvantFusion');
  assert.match(train, /await verify\(\{ cwd: main, say, complete: true, train: true, testsRapides: !certified \}\)[\s\S]*publish\(main, args/, 'la suite complète avant la publication');
  assert.match(train, /if \(!result\.ok\) \{[\s\S]*return 1;/, 'suite rouge : pas de préversion');
  // 26/11/2026 : proto/ecrans n'avance que sur un lot vert, vérifié dans le candidat, jamais l'inverse.
  assert.match(train, /await verify\(\{ cwd: cand, say, complete: true, train: true, testsRapides: !certified \}\)[\s\S]*if \(result\.ok\) \{[\s\S]*await advance\(/, 'la suite complète sur le candidat avant d\'avancer proto/ecrans');
  assert.match(train, /const advance = async[\s\S]*writeTrainState[\s\S]*gitRun\(\['merge', '--ff-only', candSha\], main\)/, 'proto/ecrans n\'avance qu\'en avance rapide sur le candidat vert');
  assert.doesNotMatch(train, /gitRun\(\['merge', '--no-ff'[^\n]*\], main\)/, 'aucune fusion directe dans le dossier principal');
});

test('gardes du dépôt : les tests qui relisent tout le dépôt passent à chaque vérification de branche (marqueur), ou sont gardes lourdes du train', async () => {
  const { collectTests, GARDES_LOURDES, relitLeDepot } = await import('./verifier.mjs');
  const { slowTestsFor } = await import('./avant-fusion.mjs');
  if (!fs.existsSync(path.join(repo, 'packages', 'core', 'dist', 'test'))) return;
  const all = collectTests(repo);
  const byName = new Map(all.map((x) => [x.name, x]));
  // Chaque garde marquée est choisie même quand la branche ne touche rien : où qu'elle soit rangée (lente ou rapide).
  const choisis = new Set(slowTestsFor(all, { complete: false, changed: [] }).map((x) => x.name));
  for (const g of all.filter((x) => x.garde && x.slow)) assert.ok(choisis.has(g.name), `${g.name} : garde marquée, passée à chaque vérification de branche`);
  // Les gardes qui ont fait tomber le train le 26/11/2026 (marquées, jamais retirées sans décision).
  for (const name of ['lecture-bornee', 'offscreen', 'docs-texte', 'power', 'powershell-propre', 'demarrage-bloquant', 'lanceur-tests', 'plancher-textes']) {
    const g = byName.get(`${name}.test.js`);
    assert.ok(g?.garde, `${name}.test.ts : le marqueur « // garde-depot » en tête de fichier`);
  }
  // Une nouvelle garde lente qui relit le dépôt doit choisir : marqueur (légère), ou liste des gardes lourdes (le train).
  for (const x of all.filter((t) => t.slow && !t.garde)) {
    if (relitLeDepot(x.source())) assert.ok(GARDES_LOURDES.includes(x.name), `${x.name} relit les sources du dépôt : ajoute « // garde-depot » en tête (si elle est rapide) ou son nom à GARDES_LOURDES (scripts/verifier.mjs)`);
  }
  for (const lourde of GARDES_LOURDES) assert.ok(byName.has(lourde), `${lourde} : garde lourde qui n'existe plus, à retirer de GARDES_LOURDES`);
});

test('vérification de branche : seulement les tests lents que la branche touche ; la suite complète, tous', async () => {
  const { slowTestsFor } = await import('./avant-fusion.mjs');
  const t = (name, slow, source = '') => ({ name, slow, source: () => source });
  const all = [
    t('roue.test.js', true, "import '../../../app/dist/library.js'"),
    t('assistant.test.js', true, "import { wizard } from './wizard'"),
    t('rapide.test.js', false, "import '../library'"),
  ];
  assert.deepEqual(slowTestsFor(all, { complete: true }).map((x) => x.name), ['roue.test.js', 'assistant.test.js']);
  assert.deepEqual(slowTestsFor(all, { complete: false, changed: ['app/src/library.ts'] }).map((x) => x.name), ['roue.test.js']);
  assert.deepEqual(slowTestsFor(all, { complete: false, changed: ['app/src/nouvelle-fonction.ts'] }), []);
});
