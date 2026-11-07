// Les tests trouvent leurs dépendances comme Node, et le code du dépôt courant, jamais celui d'un
// autre dossier.
//
// Constaté le 06/11/2026 dans un worktree sans node_modules à lui :
// - trois tests chargeaient path.join(REPO_ROOT, 'node_modules', 'hyperdht', 'testnet.js'), absent
//   du worktree, alors que require('hyperdht/testnet.js') le trouve en remontant ;
// - app\ chargeait @cyberpinball/core par le node_modules du dossier principal, donc le cœur du
//   dossier principal : le setLanguage('en') d'un test ne touchait pas l'i18n de l'app (« Historique
//   des parties » restait en français). scripts/liens-espaces.mjs, lancé par npm run build, pose
//   désormais ces liens dans le dépôt lui-même.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const TEST_DIR = path.join(REPO_ROOT, 'packages', 'core', 'src', 'test');

/** Lire node_modules comme un dossier parmi d'autres (en exclure, y chercher des jonctions) reste permis ici. */
const NODE_MODULES_SCANNERS = new Set(['jonctions.test.ts']);

test('aucun test ne code en dur un chemin vers node_modules (require.resolve ou require du paquet à la place)', () => {
  const pathCall = /path\.(?:join|resolve)\([^)\n]*['"`]node_modules['"`]/;
  const literal = /['"`][^'"`\n]*node_modules[\\/][^'"`\n]*['"`]/;
  const offenders: string[] = [];
  for (const name of fs.readdirSync(TEST_DIR)) {
    if (!name.endsWith('.ts') || name === 'resolution-depot.test.ts' || NODE_MODULES_SCANNERS.has(name)) continue;
    fs.readFileSync(path.join(TEST_DIR, name), 'utf8').split('\n').forEach((line, i) => {
      if (pathCall.test(line) || literal.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], 'Un worktree n’a pas toujours son propre node_modules : chargez le paquet par son nom (require(\'paquet/fichier.js\')).');
});

test('chaque espace de travail (@cyberpinball/*) se résout dans ce dépôt, depuis la racine comme depuis app', () => {
  const { workspaces = [] } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { workspaces?: string[] };
  assert.ok(workspaces.length > 0);
  const wrong: string[] = [];
  for (const dir of workspaces) {
    const expected = fs.realpathSync(path.join(REPO_ROOT, dir)).toLowerCase();
    const { name } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, dir, 'package.json'), 'utf8')) as { name: string };
    for (const from of ['.', 'app']) {
      const manifest = createRequire(path.join(REPO_ROOT, from, 'package.json')).resolve(`${name}/package.json`);
      const found = fs.realpathSync(path.dirname(manifest));
      if (found.toLowerCase() !== expected) wrong.push(`${name} depuis ${from} -> ${found}`);
    }
  }
  assert.deepEqual(wrong, [], 'Lancez npm run build (scripts/liens-espaces.mjs pose les liens dans le dépôt).');
});

test('npm run build pose les liens des espaces de travail avant de compiler', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.match(scripts.build ?? '', /^node scripts\/liens-espaces\.mjs && .*\btsc -b\b/);
  assert.match(scripts.test ?? '', /^npm run build && /);
});
