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
  assert.match(train, /runAvantFusion\(\{ cwd: main, say, complete: true, train: true \}\)[\s\S]*publish\(main, args/, 'la suite complète avant la publication');
  assert.match(train, /if \(!result\.ok\) \{[\s\S]*return 1;/, 'suite rouge : pas de préversion');
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
