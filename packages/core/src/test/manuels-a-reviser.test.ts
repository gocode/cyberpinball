// Révision des manuels une fois par version finale (17/11/2026) : pendant les préversions, les
// branches n'écrivent que leurs nouveautés (changements/) ; scripts/manuels-a-reviser.mjs donne ce qui
// manque aux manuels, et publier.mjs refuse une version finale tant qu'il en reste.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'manuels-a-reviser.mjs');

function fixture(version: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manuels-a-reviser-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'changements'));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Nouveautés\n\n## 0.3.0\n\n- Point publié en préversion.\n\n## 0.2.0\n\n- Point d’une version finale passée.\n');
  return root;
}

const run = (root: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, '--racine', root, ...args], { encoding: 'utf8' });

test('manuels à réviser : nouveautés de la version en cours et en attente, moins celles déjà relues', () => {
  const root = fixture('0.3.0-essai.4');
  try {
    let out = run(root, '--verifier');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /Point publié en préversion/);
    assert.doesNotMatch(out.stderr, /version finale passée/, 'une version finale déjà sortie n’est plus à revoir');

    assert.equal(run(root, '--fait').status, 0);
    assert.equal(run(root, '--verifier').status, 0);

    fs.writeFileSync(path.join(root, 'changements', 'branche.md'), '## Français\n\n- Nouveau point en attente.\n\n## English\n\n- New pending item.\n');
    out = run(root, '--verifier');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /Nouveau point en attente/);
    assert.doesNotMatch(out.stderr, /Point publié en préversion/, 'ce qui est relu le reste');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manuels à réviser : une version finale publiée ne laisse rien à revoir', () => {
  const root = fixture('0.3.0');
  try {
    assert.equal(run(root, '--verifier').status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('publication : une version finale exige des manuels révisés, une préversion jamais', () => {
  const publier = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'publier.mjs'), 'utf8');
  assert.match(publier, /if \(bump && bump !== 'essai' && !argv\.includes\('--manuels-non-revises'\)\) \{\s*const \{ section, remaining \} = toReview\(repo\);/);
  // Le relevé du dépôt est lisible et à jour au moment de la fusion de ce changement.
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'manuels-revises.json')), 'scripts/manuels-revises.json');
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' }));
});
