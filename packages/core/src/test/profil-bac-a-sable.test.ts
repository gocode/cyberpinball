import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

test('bac à sable : un profil de Chromium à lui, posé avant tout le reste (deux démonstrations en même temps ne se gênent plus)', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'main.ts'), 'utf8');
  const imports = [...main.matchAll(/^import [^\n]*?'([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.slice(0, 2), ['./sandbox-guard', './sandbox-profile']);
  const profile = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'sandbox-profile.ts'), 'utf8');
  assert.match(profile, /process\.env\.CYBERPINBALL_HOME\) app\.setPath\('userData', path\.join\(process\.env\.CYBERPINBALL_HOME/);
});
