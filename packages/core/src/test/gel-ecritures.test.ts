// Gel des écritures avant le redémarrage qui pose une restauration (app/src/write-freeze.ts) : plus
// rien ne s'écrit dans la racine ni dans les données, sauf le journal ; ailleurs, tout reste permis.
// Fichier à part : le gel vaut pour tout le processus de ce test (node:test lance un processus par fichier).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

test('après le gel, aucune écriture dans la racine ni les données, sauf le journal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-gel-racine-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-gel-ailleurs-'));
  fs.mkdirSync(path.join(root, 'data', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'social.json'), 'avant');
  const { freezeWrites } = require(path.join(REPO_ROOT, 'app', 'dist', 'write-freeze.js')) as { freezeWrites(dirs: string[], allowed?: string[]): void };
  freezeWrites([root], [path.join(root, 'data', 'logs')]);
  assert.throws(() => fs.writeFileSync(path.join(root, 'data', 'social.json'), 'après'), { code: 'EPERM' });
  assert.throws(() => fs.renameSync(path.join(root, 'data', 'social.json'), path.join(root, 'data', 'x.json')), { code: 'EPERM' });
  assert.throws(() => fs.rmSync(path.join(root, 'data', 'social.json')), { code: 'EPERM' });
  await assert.rejects(fs.promises.writeFile(path.join(root, 'data', 'social.json'), 'après'), { code: 'EPERM' });
  assert.equal(fs.readFileSync(path.join(root, 'data', 'social.json'), 'utf8'), 'avant');
  fs.appendFileSync(path.join(root, 'data', 'logs', 'journal.txt'), 'ligne\n');
  fs.writeFileSync(path.join(outside, 'releve'), 'ok');
  assert.equal(fs.readFileSync(path.join(outside, 'releve'), 'utf8'), 'ok');
});
