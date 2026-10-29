// Les faux serveurs des tests coupent une connexion seulement après que ce qu'ils ont écrit est parti.
//
// mediadb.test.ts (29/10/2026) écrivait la moitié d'un fichier puis coupait 20 ms plus tard : sous la
// charge de npm test, l'écriture n'était pas encore partie, le client ne recevait rien et le partiel
// attendu manquait (échec une fois sur plusieurs suites, jamais seul). downloads-resume.test.ts avait
// déjà la bonne forme : couper dans le rappel de res.write, avec un délai large.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const TESTS = path.join(__dirname, '..', '..', 'src', 'test');

test('faux serveurs : une coupure minutée part du rappel de res.write, jamais d’un délai seul', () => {
  const problems: string[] = [];
  for (const name of fs.readdirSync(TESTS).filter((f) => f.endsWith('.ts'))) {
    const lines = fs.readFileSync(path.join(TESTS, name), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/setTimeout\([^;]*\.destroy\(\)/.test(line)) return;
      // Le rappel de l'écriture sur la même ligne, ou l'une des trois lignes au-dessus (le bloc qu'il ouvre).
      const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (!/\.write\([^\n]*,\s*\(\)\s*=>/.test(context)) problems.push(`${name}:${i + 1}`);
    });
  }
  assert.deepEqual(problems, [], 'coupez dans le rappel de res.write(chunk, () => setTimeout(() => …destroy(), 200))');
});
