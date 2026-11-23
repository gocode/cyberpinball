// Le train de fusion dans un vrai dépôt git d'essai : avance rapide, commit de fusion, conflit.
// Test lent (il lance git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { enqueueMerge, mergeQueued, readMergeQueue } from './publication-groupee.mjs';
import { mainBusy, readJson } from './coordination.mjs';

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-train-'));
  const hooks = path.join(root, 'crochets');
  const main = path.join(root, 'depot');
  fs.mkdirSync(hooks);
  fs.mkdirSync(main);
  const git = (...args) => execFileSync('git', args, { cwd: main, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q', '-b', 'proto/ecrans');
  git('config', 'user.name', 'Essai');
  git('config', 'user.email', 'essai@example.com');
  git('config', 'core.hooksPath', hooks);
  git('config', 'core.autocrlf', 'false');
  const commit = (file, text, message) => {
    fs.writeFileSync(path.join(main, file), text);
    git('add', file);
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  commit('a.txt', '1\n', 'départ');
  const branch = (name, steps) => {
    git('checkout', '-q', '-b', name, 'proto/ecrans');
    let head;
    for (const [file, text] of steps) head = commit(file, text, `${name} : ${file}`);
    git('checkout', '-q', 'proto/ecrans');
    return head;
  };
  return { root, main, git, branch };
}

test('train : avance rapide, sinon commit de fusion ; un conflit ne fusionne rien et marque la branche', () => {
  const { root, main, git, branch } = makeRepo();
  try {
    const dir = path.join(main, '.git', 'coordination');
    fs.mkdirSync(dir);
    const ff = branch('rapide', [['a.txt', '2\n'], ['b.txt', 'b\n']]);
    const autre = branch('autre', [['c.txt', 'c\n']]);
    const conflit = branch('conflit', [['a.txt', '3\n']]);
    enqueueMerge({ branche: 'rapide', head: ff }, dir);
    enqueueMerge({ branche: 'autre', head: autre }, dir);
    enqueueMerge({ branche: 'conflit', head: conflit }, dir);
    const said = [];
    assert.deepEqual(mergeQueued(main, dir, (t) => said.push(t)), ['rapide', 'autre']);
    assert.equal(git('rev-parse', 'HEAD~1'), ff, 'la première en avance rapide');
    assert.equal(git('log', '-1', '--format=%P').split(' ').length, 2, 'la deuxième par un commit de fusion');
    assert.match(git('log', '-1', '--format=%s'), /Merge branch 'autre' into proto\/ecrans/);
    assert.deepEqual(readMergeQueue(dir).map((e) => [e.branche, e.etat, e.fichiers]), [['conflit', 'conflit', ['a.txt']]]);
    assert.equal(mainBusy(main), undefined, 'conflit annulé : dossier principal propre, pas de MERGE_HEAD');
    assert.equal(fs.readFileSync(path.join(main, 'a.txt'), 'utf8'), '2\n');
    assert.deepEqual(readJson(path.join(dir, 'fusions.json')).map((f) => f.branche), ['rapide', 'autre']);
    assert.ok(said.some((t) => /Conflit en fusionnant conflit : a\.txt/.test(t)));
    // Dossier principal occupé : rien ne bouge, la branche attend son tour.
    const tard = branch('tard', [['d.txt', 'd\n']]);
    enqueueMerge({ branche: 'tard', head: tard }, dir);
    fs.writeFileSync(path.join(main, 'a.txt'), 'modifié à la main\n');
    assert.deepEqual(mergeQueued(main, dir, () => {}), []);
    assert.equal(readMergeQueue(dir).find((e) => e.branche === 'tard')?.etat, 'en-file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
