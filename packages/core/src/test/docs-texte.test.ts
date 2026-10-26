// Documents publiés (.md suivis par git) : un chemin Windows écrit par un script qui prend
// « \ » pour un échappement y laisse des traces. « \r », « \f », « \b », « \v » deviennent
// des caractères de contrôle (`docs\rendu…` coupé par un retour chariot, `docs\images\fr`
// par un saut de page) ; « \d », « \c » disparaissent et collent les mots (`.docsdemo-…`,
// `tmpcaptures…`). Les deux sont refusés ici.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

function publishedDocs(): string[] {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f && !f.includes('node_modules') && fs.existsSync(path.join(REPO_ROOT, f)));
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

test('documents : aucun caractère de contrôle (sauf tabulation et fin de ligne)', () => {
  const found: string[] = [];
  for (const file of publishedDocs()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    for (const m of text.matchAll(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\r(?!\n)/g)) {
      found.push(`${file}:${lineOf(text, m.index)} ${JSON.stringify(text.slice(Math.max(0, m.index - 25), m.index + 25))}`);
    }
  }
  assert.deepEqual(found, []);
});

test('documents : aucun chemin du dépôt aux antislashs perdus (`.docsdemo…`, `tmpcaptures…`)', () => {
  const found: string[] = [];
  for (const file of publishedDocs()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    // Dans un passage de code, « docs » ou « tmp » collé à un mot en minuscules : un séparateur a sauté.
    for (const m of text.matchAll(/`\.?(docs|tmp)(demo|rendu|captures|ecrans|images|recherche|design|sons|essai|guet|diagnostic|preuve|hors)[^`]*`/g)) {
      found.push(`${file}:${lineOf(text, m.index)} ${m[0]}`);
    }
  }
  assert.deepEqual(found, []);
});
