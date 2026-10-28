// Aucun caractère de contrôle dans les sources texte du dépôt. Une barre oblique inverse perdue en
// passant par un shell ou un script (« \b », « \a », « \v » écrits sans être échappés) devient un
// caractère invisible : trouvé le 28/10/2026 dans trois fichiers, dont une expression régulière de
// dedicated-menu.test.ts (« \brunas\b ») qui ne pouvait plus rien trouver. Tabulation, saut de ligne
// et retour chariot seuls sont admis.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const TEXT = /\.(ts|js|cjs|mjs|json|md|ps1|nsi|nsh|css|html|cmd|txt|svg)$/i;
const SKIP = new Set(['node_modules', 'dist', 'build', 'release', 'tmp', '.git', '.claude']);
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function* textFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(full);
    else if (TEXT.test(entry.name)) yield full;
  }
}

test('aucun caractère de contrôle dans les sources texte', () => {
  const found: string[] = [];
  for (const top of ['app', 'packages', 'docs', 'scripts']) {
    for (const file of textFiles(path.join(REPO_ROOT, top))) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = CONTROL.exec(line);
        if (m) found.push(`${path.relative(REPO_ROOT, file)}:${i + 1} : U+${m[0].charCodeAt(0).toString(16).padStart(4, '0')}`);
      });
    }
  }
  for (const name of fs.readdirSync(REPO_ROOT).filter((n) => TEXT.test(n))) {
    if (CONTROL.test(fs.readFileSync(path.join(REPO_ROOT, name), 'utf8'))) found.push(name);
  }
  assert.deepEqual(found, []);
});
