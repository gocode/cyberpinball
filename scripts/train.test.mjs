// Le train de fusion dans un vrai dépôt git d'essai : le lot est fusionné et vérifié dans un candidat, proto/ecrans
// n'avance que s'il est vert ; la branche fautive est cherchée et écartée (refus.json) sans arrêter les autres ;
// sortie illisible refaite ; conflit ; arbre déjà certifié ; jamais de publication d'un commit non vérifié
// (vérification, recherche et publication simulées).
// Test lent (il lance git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  REPRISES_MAX, certifiedBy, decisionReprise, enqueueMerge, mergeQueued, publishGrouped, readMergeQueue, readRefus, refusBrief, refusStatus, trainStatus, unverifiedProblem,
} from './publication-groupee.mjs';
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
const headOf = (cwd) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true }).trim();

/**
 * Un dépôt d'essai prêt pour le train (dernière préversion publiée), une fausse vérification qui note le commit
 * vérifié (dans le candidat, jamais dans le dossier principal), une fausse recherche et une fausse publication qui fait
 * comme publier.mjs : commit « Version … » (CHANGELOG seul), accord du train sur ce commit, puis envoi.
 * Rouge : le fichier cassee.txt est présent dans l'arbre vérifié (échec « rouge.test.mjs »).
 * `envoi(n)` : ce que l'envoi de la n-ième publication attend avant de finir.
 */
function trainBench({ verdict, envoi = async () => true, duringVerify = () => {}, prepare = () => true } = {}) {
  const repo = makeRepo();
  const { main, git, commit } = repo;
  commit('CHANGELOG.md', '## 0.0.1-essai.1\n', 'Version 0.0.1-essai.1');
  const dir = path.join(main, '.git', 'coordination');
  fs.mkdirSync(path.join(dir, 'certificats'), { recursive: true });
  // Ce que lit la recherche des branches suspectes d'une suite rouge sans file (scripts/verifier.mjs).
  fs.mkdirSync(path.join(main, 'packages', 'core', 'dist', 'test'), { recursive: true });
  fs.mkdirSync(path.join(main, 'scripts'), { recursive: true });
  const events = [];
  const verifies = [];
  const rechecks = [];
  const publishes = [];
  // repare.txt : un commit de proto/ecrans qui répare ce que la branche cassait (réparation venue d'ailleurs).
  const rouge = (cwd) => fs.existsSync(path.join(cwd, 'cassee.txt')) && !fs.existsSync(path.join(cwd, 'repare.txt'));
  const verify = async (options) => {
    const sha = headOf(options.cwd);
    verifies.push({ sha, cwd: options.cwd, testsRapides: options.testsRapides, mainHead: git('rev-parse', 'HEAD') });
    events.push(`verification ${verifies.length}`);
    duringVerify(verifies.length);
    const r = verdict ? verdict(verifies.length, options.cwd) : !rouge(options.cwd);
    if (r === true) return { ok: true, failures: [], flaky: [] };
    if (r === 'illisible') return { ok: false, failures: ['(sortie illisible)'], flaky: [], illisible: true };
    return { ok: false, failures: ['rouge.test.mjs'], flaky: [], details: [{ file: 'rouge.test.mjs', details: [{ name: 'tient', error: 'attendu vert' }] }] };
  };
  const recheck = async ({ cwd, failures }) => {
    rechecks.push({ sha: headOf(cwd), failures });
    return rouge(cwd) ? ['rouge.test.mjs'] : [];
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
  const runTrain = (options = {}) => publishGrouped({ cwd: main, say: (t) => said.push(t), write: () => {}, deps: { verify, recheck, publish, prepare, pause: async () => {} }, ...options });
  return { ...repo, dir, events, verifies, rechecks, publishes, said, runTrain };
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

test('train : lot vérifié dans le candidat, arbre déjà certifié sans tests rapides ; une branche en file est fusionnée et vérifiée pendant l’envoi', async () => {
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
    const avant = git('rev-parse', 'HEAD');
    enqueueMerge({ branche: 'certifiee', head: certifiee }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    // Lot 1 : avance rapide, arbre certifié : sans tests rapides. Lot 2 : commit de fusion, arbre nouveau : suite complète.
    assert.deepEqual(verifies.map((v) => v.testsRapides), [false, true]);
    assert.equal(verifies[0].sha, certifiee);
    assert.equal(certifiedBy(main, dir, verifies[1].sha), undefined);
    // La suite tourne dans le candidat, jamais dans le dossier principal ; celui-ci n'avance qu'après elle.
    assert.ok(verifies.every((v) => v.cwd !== main && v.cwd.includes('train-candidat')));
    assert.equal(verifies[0].mainHead, avant, 'proto/ecrans n\'a pas bougé pendant la suite du premier lot');
    // Chaque publication porte le commit vérifié, plus son seul commit « Version … ».
    assert.deepEqual(publishes.map((p) => p.head), verifies.map((v) => v.sha));
    assert.ok(publishes.every((p) => !p.problem));
    // La deuxième branche fusionnée et vérifiée pendant l'envoi de la première préversion ; publications en série.
    assert.deepEqual(events, ['verification 1', 'publication 1', 'verification 2', "fin de l'envoi 1", 'publication 2', "fin de l'envoi 2"]);
    assert.match(git('log', '-1', '--format=%s'), /^Version 0\.0\.1-essai\.3$/);
    assert.deepEqual(readJson(path.join(dir, 'train-etat.json')).etat, 'vert');
    assert.deepEqual(readMergeQueue(dir), []);
  } finally {
    cleanup(root);
  }
});

test('train : la branche fautive est trouvée sur les préfixes du lot, écartée avec sa cause ; le reste du lot part sans elle', async () => {
  const bench = trainBench();
  const { root, main, git, branch, dir, verifies, rechecks, publishes, runTrain } = bench;
  try {
    const avant = git('rev-parse', 'HEAD');
    const a = branch('a', [['a1.txt', 'a\n']]);
    const b = branch('b', [['cassee.txt', 'x\n']]);
    const c = branch('c', [['c1.txt', 'c\n']]);
    for (const [branche, head] of [['a', a], ['b', b], ['c', c]]) enqueueMerge({ branche, head }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    // Lot entier rouge, puis le lot sans b, vert et revérifié en entier.
    assert.equal(verifies.length, 2, bench.said.join('\n'));
    assert.notEqual(verifies[1].sha, verifies[0].sha);
    assert.equal(verifies[0].mainHead, avant, 'proto/ecrans n\'a pas avancé sur un lot rouge');
    // Recherche : le préfixe 0, puis la dichotomie ; seuls les fichiers en échec sont rejoués.
    assert.ok(rechecks.length >= 2 && rechecks.length <= 3, `${rechecks.length} recherches`);
    assert.ok(rechecks.every((r) => r.failures.length === 1 && r.failures[0] === 'rouge.test.mjs'));
    // b écartée, a et c fusionnées et publiées ; b n'est jamais entrée dans proto/ecrans.
    assert.equal(isAncestor(main, b), false);
    assert.equal(isAncestor(main, a), true);
    assert.equal(isAncestor(main, c), true);
    assert.equal(fs.existsSync(path.join(main, 'cassee.txt')), false);
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].head, verifies[1].sha, 'la publication porte le lot vérifié sans b');
    const refus = readRefus(dir);
    assert.deepEqual(refus.map((r) => [r.branche, r.head, r.fichiers, r.lot]), [['b', b, ['rouge.test.mjs'], ['a', 'b', 'c']]]);
    assert.match(refus[0].message, /attendu vert/);
    assert.equal(readMergeQueue(dir).find((e) => e.branche === 'b')?.etat, 'refusee');
    assert.equal(readMergeQueue(dir).find((e) => e.branche === 'a'), undefined);
    // Visible en tête de npm run fusionner, avec un brief de reprise.
    assert.match(refusStatus(dir), /REFUSÉES par le train[\s\S]*- b \(commit /);
    assert.match(refusBrief(refus[0]), /rouge\.test\.mjs/);
    assert.equal(trainStatus(dir), undefined, 'le train n\'est pas rouge : la branche fautive est écartée');
    assert.equal(readJson(path.join(dir, 'train-etat.json')).etat, 'vert');
    // Reconfiée, la branche n'est plus refusée.
    enqueueMerge({ branche: 'b', head: b }, dir);
    assert.deepEqual(readRefus(dir), []);
  } finally {
    cleanup(root);
  }
});

test('train : une seule branche rouge est écartée, proto/ecrans reste intact et rien ne part', async () => {
  const bench = trainBench();
  const { root, git, branch, dir, publishes, verifies, runTrain } = bench;
  try {
    const avant = git('rev-parse', 'HEAD');
    enqueueMerge({ branche: 'rouge', head: branch('rouge', [['cassee.txt', 'x\n']]) }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(verifies.length, 1);
    assert.equal(git('rev-parse', 'HEAD'), avant, 'proto/ecrans n\'a pas bougé');
    assert.equal(publishes.length, 0, 'rien ne part');
    assert.deepEqual(readRefus(dir).map((r) => r.branche), ['rouge']);
    assert.equal(trainStatus(dir), undefined);
  } finally {
    cleanup(root);
  }
});

test('train : une branche refusée est reprise quand proto/ecrans a changé et que ses échecs passent dessus ; elle part avec le lot', async () => {
  const bench = trainBench();
  const { root, git, branch, commit, dir, rechecks, publishes, runTrain } = bench;
  try {
    const b = branch('b', [['cassee.txt', 'x\n']]);
    enqueueMerge({ branche: 'b', head: b }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.deepEqual(readRefus(dir).map((r) => r.branche), ['b']);
    const apresRefus = rechecks.length;
    // Rien n'a changé sur proto/ecrans : pas de reprise (une préversion seule ne compte pas non plus).
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(rechecks.length, apresRefus, 'pas de contrôle tant que proto/ecrans n\'a pas changé');
    assert.equal(isAncestor(bench.main, b), false);
    // Une réparation arrive sur proto/ecrans : la branche est reprise, vérifiée dans le lot, fusionnée et publiée.
    commit('repare.txt', 'ok\n', 'répare ce que b cassait');
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(rechecks.length, apresRefus + 1, 'un seul contrôle rapide : ses fichiers en échec, sur proto/ecrans + la branche');
    assert.deepEqual(rechecks.at(-1).failures, ['rouge.test.mjs']);
    assert.equal(isAncestor(bench.main, b), true, 'la branche reprise est entrée dans proto/ecrans');
    assert.deepEqual(readRefus(dir), [], 'fusionnée : plus de refus');
    assert.deepEqual(readMergeQueue(dir), []);
    assert.equal(publishes.length, 1);
    assert.match(bench.said.join('\n'), /Reprise de b : ses échecs passent[^\n]*elle repart dans le lot/);
    assert.match(git('log', '-1', '--format=%s'), /^Version /);
  } finally {
    cleanup(root);
  }
});

test('train : une branche refusée est reprise ou signalée, jamais oubliée ; reprises plafonnées, puis refus et brief restent affichés', async () => {
  const bench = trainBench();
  const { root, branch, commit, dir, rechecks, runTrain } = bench;
  try {
    const b = branch('b', [['cassee.txt', 'x\n']]);
    enqueueMerge({ branche: 'b', head: b }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    const r0 = readRefus(dir)[0];
    assert.equal(r0.reprises, 0);
    // Les décisions possibles, toutes tournées vers une reprise ou un signalement.
    assert.equal(decisionReprise(r0, { utile: r0.utile }), 'attendre');
    assert.equal(decisionReprise(r0, { utile: 'autre' }), 'controler');
    assert.equal(decisionReprise(r0, { utile: 'autre', enFile: true }), 'en-file');
    assert.equal(decisionReprise(r0, { utile: 'autre', existe: false }), 'disparue');
    assert.equal(decisionReprise({ ...r0, reprises: REPRISES_MAX }, { utile: 'autre' }), 'epuisee');
    // Toujours rouge : chaque changement de proto/ecrans refait un contrôle (et un seul), jusqu'au plafond.
    for (let i = 1; i <= REPRISES_MAX; i++) {
      const avant = rechecks.length;
      commit(`n${i}.txt`, `${i}\n`, `autre travail ${i}`);
      assert.equal(await runTrain(), 0, bench.said.join('\n'));
      assert.equal(rechecks.length, avant + 1, `contrôle ${i}`);
      assert.equal(readRefus(dir)[0].reprises, i);
      assert.match(refusStatus(dir), new RegExp(`reprise automatique à chaque changement de proto/ecrans \\(${i}/${REPRISES_MAX}\\)|épuisées`));
    }
    // Plafond atteint : plus de contrôle automatique, mais le refus reste là, en tête, avec son brief ; jamais effacé.
    const avant = rechecks.length;
    commit('apres.txt', 'x\n', 'encore du travail');
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(rechecks.length, avant, 'reprises épuisées : le train ne refait plus de contrôle');
    assert.deepEqual(readRefus(dir).map((r) => r.branche), ['b']);
    assert.match(refusStatus(dir), new RegExp(`b \\(commit [0-9a-f]{8}[^)]*reprises automatiques épuisées \\(${REPRISES_MAX}/${REPRISES_MAX}\\) : une session doit la corriger`));
    assert.match(refusBrief(readRefus(dir)[0]), /rouge\.test\.mjs/);
    assert.equal(isAncestor(bench.main, b), false);
  } finally {
    cleanup(root);
  }
});

test('train : un échec déjà présent sur proto/ecrans n\'écarte personne ; le lot avance, la suite reste rouge', async () => {
  const bench = trainBench();
  const { root, git, branch, commit, dir, publishes, runTrain } = bench;
  try {
    commit('cassee.txt', 'déjà rouge\n', 'rouge avant le lot');
    const a = branch('a', [['a1.txt', 'a\n']]);
    enqueueMerge({ branche: 'a', head: a }, dir);
    assert.equal(await runTrain(), 1, bench.said.join('\n'));
    assert.deepEqual(readRefus(dir), []);
    assert.equal(isAncestor(bench.main, a), true, 'le lot avance : il n\'a rien cassé');
    assert.equal(publishes.length, 0);
    assert.equal(readJson(path.join(dir, 'train-etat.json')).etat, 'rouge');
    assert.match(trainStatus(dir), /déjà rouge avant le dernier lot/);
  } finally {
    cleanup(root);
  }
});

test('train : sortie illisible refaite sans rien reprocher à personne ; trois fois de suite, le train s\'arrête et la file reste', async () => {
  // Illisible deux fois, puis vert : le lot passe.
  {
    const bench = trainBench({ verdict: (n) => (n < 3 ? 'illisible' : true) });
    const { root, branch, dir, verifies, publishes, runTrain } = bench;
    try {
      enqueueMerge({ branche: 'a', head: branch('a', [['a1.txt', 'a\n']]) }, dir);
      assert.equal(await runTrain(), 0, bench.said.join('\n'));
      assert.equal(verifies.length, 3);
      assert.equal(publishes.length, 1);
      assert.deepEqual(readRefus(dir), []);
    } finally {
      cleanup(root);
    }
  }
  // Toujours illisible : aucun refus, aucune fusion, la file intacte, un diagnostic.
  {
    const bench = trainBench({ verdict: () => 'illisible' });
    const { root, git, branch, dir, publishes, verifies, rechecks, runTrain } = bench;
    try {
      const avant = git('rev-parse', 'HEAD');
      enqueueMerge({ branche: 'a', head: branch('a', [['a1.txt', 'a\n']]) }, dir);
      assert.equal(await runTrain(), 1);
      assert.equal(verifies.length, 3);
      assert.equal(rechecks.length, 0, 'aucune recherche de coupable sur une sortie illisible');
      assert.equal(publishes.length, 0);
      assert.equal(git('rev-parse', 'HEAD'), avant);
      assert.deepEqual(readRefus(dir), []);
      assert.equal(readMergeQueue(dir)[0].etat, 'en-file');
      assert.match(trainStatus(dir), /sortie des tests/);
    } finally {
      cleanup(root);
    }
  }
});

test('train : proto/ecrans qui bouge pendant la vérification refait le lot sur le nouveau proto/ecrans avant d\'avancer ou de publier', async () => {
  let bench;
  bench = trainBench({ duringVerify: (n) => n === 1 && bench.commit('d.txt', 'd\n', 'commit à la main') });
  const { root, branch, dir, publishes, verifies, runTrain } = bench;
  try {
    const b = branch('bouge', [['b.txt', 'b\n']]);
    enqueueMerge({ branche: 'bouge', head: b }, dir);
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(verifies.length, 2, 'refait après le commit');
    assert.equal(isAncestor(bench.main, b), true);
    assert.deepEqual(publishes.map((p) => p.head), [verifies[1].sha]);
    assert.equal(fs.existsSync(path.join(bench.main, 'd.txt')), true, 'le commit à la main est gardé');
  } finally {
    cleanup(root);
  }
});

test('train : un conflit n\'arrête pas le lot ; candidat non préparé : le train s\'arrête sans rien avancer', async () => {
  {
    const bench = trainBench();
    const { root, branch, dir, publishes, runTrain } = bench;
    try {
      const un = branch('un', [['a.txt', '2\n']]);
      const deux = branch('deux', [['a.txt', '3\n']]);
      enqueueMerge({ branche: 'un', head: un }, dir);
      enqueueMerge({ branche: 'deux', head: deux }, dir);
      assert.equal(await runTrain(), 0, bench.said.join('\n'));
      assert.deepEqual(readMergeQueue(dir).map((e) => [e.branche, e.etat, e.fichiers]), [['deux', 'conflit', ['a.txt']]]);
      assert.equal(publishes.length, 1);
      assert.equal(isAncestor(bench.main, un), true);
    } finally {
      cleanup(root);
    }
  }
  {
    const bench = trainBench({ prepare: () => false });
    const { root, git, branch, dir, publishes, runTrain } = bench;
    try {
      const avant = git('rev-parse', 'HEAD');
      enqueueMerge({ branche: 'a', head: branch('a', [['a1.txt', 'a\n']]) }, dir);
      assert.equal(await runTrain(), 1);
      assert.equal(git('rev-parse', 'HEAD'), avant);
      assert.equal(publishes.length, 0);
      assert.equal(readMergeQueue(dir)[0].etat, 'en-file');
    } finally {
      cleanup(root);
    }
  }
});

test('train : un conflit resté sans lecteur est retenté quand proto/ecrans a changé (27/11/2026)', async () => {
  const bench = trainBench();
  const { root, branch, dir, publishes, runTrain } = bench;
  try {
    const a = branch('a', [['a1.txt', 'a\n']]);
    enqueueMerge({ branche: 'a', head: a }, dir);
    // Marquée en conflit sur une ancienne base, sans que sa session l'ait lu : plus aucun conflit réel.
    writeJson(path.join(dir, 'a-fusionner.json'), readMergeQueue(dir).map((e) => ({ ...e, etat: 'conflit', fichiers: ['a.txt'], surBase: 'ancienne-base' })));
    assert.equal(await runTrain(), 0, bench.said.join('\n'));
    assert.equal(isAncestor(bench.main, a), true, 'retentée puis fusionnée');
    assert.equal(publishes.length, 1);
  } finally {
    cleanup(root);
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
    cleanup(root);
  }
});

test('train : avance rapide, sinon commit de fusion, dans le dossier donné ; un conflit ne fusionne rien et l\'annule', () => {
  const { root, main, git, branch } = makeRepo();
  try {
    const ff = branch('rapide', [['a.txt', '2\n'], ['b.txt', 'b\n']]);
    const autre = branch('autre', [['c.txt', 'c\n']]);
    const conflit = branch('conflit', [['a.txt', '3\n']]);
    const entries = [['rapide', ff], ['autre', autre], ['conflit', conflit]].map(([branche, head]) => ({ branche, head }));
    const said = [];
    const { merged, conflicts } = mergeQueued(main, entries, (t) => said.push(t));
    assert.deepEqual(merged.map((m) => m.entry.branche), ['rapide', 'autre']);
    assert.equal(git('rev-parse', 'HEAD~1'), ff, 'la première en avance rapide');
    assert.equal(merged[0].apres, ff);
    assert.equal(merged[1].avant, ff);
    assert.equal(merged[1].apres, git('rev-parse', 'HEAD'));
    assert.equal(git('log', '-1', '--format=%P').split(' ').length, 2, 'la deuxième par un commit de fusion');
    assert.match(git('log', '-1', '--format=%s'), /Merge branch 'autre' into proto\/ecrans/);
    assert.deepEqual(conflicts.map((c) => [c.entry.branche, c.fichiers]), [['conflit', ['a.txt']]]);
    assert.equal(mainBusy(main), undefined, 'conflit annulé : arbre propre, pas de MERGE_HEAD');
    assert.equal(fs.readFileSync(path.join(main, 'a.txt'), 'utf8'), '2\n');
    assert.ok(said.some((t) => /Conflit en fusionnant conflit : a\.txt/.test(t)));
  } finally {
    cleanup(root);
  }
});
