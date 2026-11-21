// La console des tests ne se mêle pas aux résultats sérialisés de node --test (21/11/2026) : un
// console.log du code testé, arrivé dans le même morceau qu'un résultat sous charge, faisait échouer
// le fichier entier sur « Unable to deserialize cloned data » (dedicated-menu). Chaque lancement de
// node --test charge scripts/console-sur-stderr.mjs, qui envoie la console sur la sortie d'erreur.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const preload = path.join(REPO_ROOT, 'scripts', 'console-sur-stderr.mjs');

test('lancements de node --test : tous par NODE_TEST_ARGS, qui charge console-sur-stderr.mjs', () => {
  const scripts = path.join(REPO_ROOT, 'scripts');
  const direct: string[] = [];
  for (const f of fs.readdirSync(scripts).filter((n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs'))) {
    const text = fs.readFileSync(path.join(scripts, f), 'utf8');
    if (/\[\s*'--test'/.test(text)) direct.push(f);
  }
  assert.deepEqual(direct, [], 'un lancement de node --test sans NODE_TEST_ARGS');
  assert.match(fs.readFileSync(path.join(scripts, 'tests-node.mjs'), 'utf8'), /'--import', pathToFileURL\(path\.join\(here, 'console-sur-stderr\.mjs'\)\)\.href, '--test'/);
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  for (const [name, line] of Object.entries(pkg.scripts)) {
    if (/node --test\b|node [^&]*--test /.test(line)) assert.match(line, /node --import \.\/scripts\/console-sur-stderr\.mjs --test /, name);
  }
});

test('console-sur-stderr.mjs : console.log, info et debug partent sur la sortie d’erreur, la sortie standard reste aux résultats', () => {
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, '-e', "console.log('un'); console.info('deux'); console.debug('trois é')"], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'un\ndeux\ntrois é\n');
});
