// Le train de fusion dans un vrai dépôt git d'essai : avance rapide, commit de fusion, conflit ;
// arbre déjà certifié (pas de tests rapides), fusion et vérification pendant l'envoi, et jamais de
// publication d'un commit non vérifié (vérification et publication simulées).
// Test lent (il lance git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { certifiedBy, enqueueMerge, mergeQueued, publishGrouped, readMergeQueue, unverifiedProblem } from './publication-groupee.mjs';
import { mainBusy, readJson, writeJson } from './coordination.mjs';

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
  return { root, main, git, branch, commit };
}

const isAncestor = (main, sha) => spawnSync('git', ['merge-base', '--is-ancestor', sha, 'proto/ecrans'], { cwd: main, windowsHide: true }).status === 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un dépôt d'essai prêt pour le train (dernière préversion publiée), une fausse vérification qui note
 * le commit vérifié et ses tests rapides, et une fausse publication qui fait comme publier.mjs :
 * commit « Version … » (CHANGELOG seul), accord du train sur ce commit, puis envoi.
 * `envoi(n)` : ce que l'envoi de la n-ième publication attend avant de finir.
 */
function trainBench({ verdict = () => true, envoi = async () => true, duringVerify = () => {} } = {}) {
  const repo = makeRepo();
  const { main, git, commit } = repo;
  commit('CHANGELOG.md', '## 0.0.1-essai.1\n', 'Version 0.0.1-essai.1');
  const dir = path.join(main, '.git', 'coordination');
  fs.mkdirSync(path.join(dir, 'certificats'), { recursive: true });
  // Ce que lit la recherche des branches suspectes d'une suite rouge (scripts/verifier.mjs).
  fs.mkdirSync(path.join(main, 'packages', 'core', 'dist', 'test'), { recursive: true });
  fs.mkdirSync(path.join(main, 'scripts'), { recursive: true });
  const events = [];
  const verifies = [];
  const publishes = [];
  const verify = async (options) => {
    const sha = git('rev-parse', 'HEAD');
    verifies.push({ sha, testsRapides: options.testsRapides });
    events.push(`verification ${verifies.length}`);
    duringVerify(verifies.length);
    const ok = verdict(verifies.length);
    return ok ? { ok: true, failures: [], flaky: [] } : { ok: false, failures: ['rouge.test.mjs'], flaky: [] };
  };
  const publish = (_main, args, { validate }) => {
    const n = publishes.length + 1;
    const head = git('rev-parse', 'HEAD');
    const version = `0.0.1-essai.${n + 1}`;
    fs.appendFileSync(path.join(main, 'CHANGELOG.md'), `## ${version}\n`);
    git('add', 'CHANGELOG.md');
    git('commit', '-q', '-m', `Version ${version}`);
    const frozen = git('rev-parse', 'HEAD');
    const problem = validate(frozen);
    publishes.push({ head, frozen, args, problem });
    events.push(`publication ${n}`);
    if (problem) return { freed: Promise.resolve(undefined), done: Promise.resolve({ code: 1, out: problem }) };
    const done = (async () => {
      const ok = await envoi(n);
      events.push(`fin de l'envoi ${n}`);
      return { code: ok ? 0 : 1, out: '' };
    })();
    return { freed: Promise.resolve({ frozen, version }), done };
  };
  const said = [];
  const runTrain = () => publishGrouped({ cwd: main, say: (t) => said.push(t), write: () => {}, deps: { verify, publish, pause: async () => {} } });
  return { ...repo, dir, events, verifies, publishes, said, runTrain };
}

test('train : arbre déjà certifié, pas de tests rapides ; une branche en file est fusionnée et vérifiée pendant l’envoi', async () => {
  let bench;
  bench = trainBench({
    // L'envoi de la première préversion ne finit qu'une fois la branche arrivée entre-temps fusionnée
    // et sa vérification lancée : le train n'attend pas la fin de l'envoi pour fusionner.
    envoi: async (n) => {
      if (n !== 1) return true;
      enqueueMerge({ branche: 'pendant', head: bench.pendant }, bench.dir);
      for (let i = 0; i < 400; i++) {
        if (isAncestor(bench.main, bench.pendant) && bench.verifies.length >= 2) return true;
        await wait(25);
      }
      return false;
    },
  });
  const { root, main, git, branch, dir, events, verifies, publishes, runTrain } = bench;
  try {
    const certifiee = branch('certifiee', [['b.txt', 'b\n']]);
    bench.pendant = branch('pendant', [['c.txt', 'c\n']]);
    // Certificat de la branche (avant-fusion.mjs : tous les tests rapides passés sur ce commit).
    writeJson(path.join(dir, 'certificats', 'certifiee.json'), { empreinte: 'x', head: certifiee, base: certifiee, niveau: 'branche', date: new Date().toISOString() });
    assert.deepEqual(certifiedBy(main, dir, certifiee), { branche: 'certifiee', head: certifiee, date: readJson(path.join(dir, 'certificats', 'certifiee.json')).date });
    enqueueMerge({ branche: 'certifiee', head: certifiee }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    // Lot 1 : avance rapide, arbre certifié : sans tests rapides. Lot 2 : commit de fusion, arbre nouveau : suite complète.
    assert.deepEqual(verifies.map((v) => v.testsRapides), [false, true]);
    assert.equal(verifies[0].sha, certifiee);
    assert.equal(certifiedBy(main, dir, verifies[1].sha), undefined);
    // Chaque publication porte le commit vérifié, plus son seul commit « Version … ».
    assert.deepEqual(publishes.map((p) => p.head), verifies.map((v) => v.sha));
    assert.ok(publishes.every((p) => !p.problem));
    // La deuxième branche fusionnée et vérifiée pendant l'envoi de la première préversion ; publications en série.
    assert.deepEqual(events, ['verification 1', 'publication 1', 'verification 2', "fin de l'envoi 1", 'publication 2', "fin de l'envoi 2"]);
    assert.match(git('log', '-1', '--format=%s'), /^Version 0\.0\.1-essai\.3$/);
    assert.deepEqual(readJson(path.join(dir, 'train-etat.json')).etat, 'vert');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('train : jamais de publication d’un commit non vérifié (suite rouge, proto/ecrans qui bouge pendant la vérification)', async () => {
  // Suite rouge : aucune publication.
  {
    const bench = trainBench({ verdict: () => false });
    const { root, branch, dir, publishes, verifies, runTrain } = bench;
    try {
      enqueueMerge({ branche: 'rouge', head: branch('rouge', [['b.txt', 'b\n']]) }, dir);
      assert.equal(await runTrain(), 1);
      assert.equal(verifies.length, 1);
      assert.equal(publishes.length, 0, 'suite rouge : rien ne part');
      assert.equal(readJson(path.join(dir, 'train-etat.json')).etat, 'rouge');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // Un commit arrive sur proto/ecrans pendant la vérification : nouvelle vérification avant de publier.
  {
    let bench;
    bench = trainBench({ duringVerify: (n) => n === 1 && bench.commit('d.txt', 'd\n', 'commit à la main') });
    const { root, branch, dir, publishes, verifies, runTrain } = bench;
    try {
      enqueueMerge({ branche: 'bouge', head: branch('bouge', [['b.txt', 'b\n']]) }, dir);
      assert.equal(await runTrain(), 0, bench.said.join('\n'));
      assert.equal(verifies.length, 2, 'revérifié après le commit');
      assert.deepEqual(publishes.map((p) => p.head), [verifies[1].sha]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('train : le commit envoyé doit être le commit vérifié ou son seul commit de version', () => {
  const { root, main, git, commit } = makeRepo();
  try {
    commit('package.json', '{\n  "name": "essai",\n  "version": "0.0.1",\n  "description": "a"\n}\n', 'paquet');
    const verified = git('rev-parse', 'HEAD');
    assert.equal(unverifiedProblem(main, verified, verified), undefined, 'reprise : le commit vérifié lui-même');
    commit('package.json', '{\n  "name": "essai",\n  "version": "0.0.2",\n  "description": "a"\n}\n', 'Version 0.0.2');
    const version = commit('CHANGELOG.md', '## 0.0.2\n', 'notes');
    // Deux commits au-dessus : pas l'enfant direct.
    assert.match(unverifiedProblem(main, verified, version), /n'est pas le commit vérifié/);
    git('reset', '-q', '--hard', verified);
    fs.writeFileSync(path.join(main, 'package.json'), '{\n  "name": "essai",\n  "version": "0.0.2",\n  "description": "a"\n}\n');
    fs.writeFileSync(path.join(main, 'CHANGELOG.md'), '## 0.0.2\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'Version 0.0.2');
    assert.equal(unverifiedProblem(main, verified, git('rev-parse', 'HEAD')), undefined, 'numéro et CHANGELOG seulement');
    git('reset', '-q', '--hard', verified);
    fs.writeFileSync(path.join(main, 'package.json'), '{\n  "name": "essai",\n  "version": "0.0.2",\n  "description": "b"\n}\n');
    git('commit', '-q', '-am', 'Version 0.0.2');
    assert.match(unverifiedProblem(main, verified, git('rev-parse', 'HEAD')), /n'est pas le commit vérifié/, 'autre chose que le numéro');
    git('reset', '-q', '--hard', verified);
    assert.match(unverifiedProblem(main, verified, commit('a.txt', 'source changée\n', 'Version 0.0.2')), /n'est pas le commit vérifié/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
