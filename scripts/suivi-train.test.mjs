// Le train ne laisse plus un blocage sans lecteur (27/11/2026) : une note changements/*.md supprimée par une publication
// et retouchée par la branche se résout seule ; les branches bloquées sont dites ; la commande de fin de branche attend
// le vrai résultat au lieu de rendre « en file ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { nouveauxPoints, resoudreNotesSupprimees } from './conflit-notes.mjs';
import { bloqueesStatus, enqueueMerge, mergeQueued, readMergeQueue } from './publication-groupee.mjs';
import { confier } from './fusionner.mjs';
import { writeJson } from './coordination.mjs';

const NOTE = '## Français\n\n- Point un.\n- Point deux.\n\n## English\n\n- Point one.\n- Point two.\n';

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-suivi-'));
  const main = path.join(root, 'depot');
  fs.mkdirSync(main);
  const git = (...args) => execFileSync('git', args, { cwd: main, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q', '-b', 'proto/ecrans');
  git('config', 'user.name', 'Essai');
  git('config', 'user.email', 'essai@example.com');
  git('config', 'core.hooksPath', path.join(root, 'crochets'));
  git('config', 'core.autocrlf', 'false');
  const commit = (file, text, message) => {
    fs.mkdirSync(path.dirname(path.join(main, file)), { recursive: true });
    fs.writeFileSync(path.join(main, file), text);
    git('add', file);
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { root, main, git, commit };
}

/** Une branche qui retouche sa note, pendant que proto/ecrans la supprime (publication). Rend le dépôt et la tête de la branche. */
function noteRetouchee() {
  const repo = makeRepo();
  const { git, commit, main } = repo;
  commit('a.txt', '1\n', 'départ');
  commit('changements/ma-fonction.md', NOTE, 'note de la fonction');
  git('checkout', '-q', '-b', 'claude/ma-fonction');
  const head = commit('changements/ma-fonction.md', `${NOTE}\n- Point trois, ajouté après.\n`, 'la fonction évolue');
  git('checkout', '-q', 'proto/ecrans');
  git('rm', '-q', 'changements/ma-fonction.md');
  git('commit', '-q', '-m', 'Version 0.0.1 (la note part dans le CHANGELOG)');
  return { ...repo, head, main };
}

test('notes : seuls les points nouveaux de la branche restent, sous leur titre de langue', () => {
  const base = NOTE;
  const modifiee = NOTE.replace('- Point deux.', '- Point deux, corrigé.').concat('- Point trois.\n');
  const texte = nouveauxPoints(base, modifiee);
  assert.match(texte, /## Français\n\n- Point deux, corrigé\./);
  assert.match(texte, /## English\n\n- Point trois\./);
  assert.doesNotMatch(texte, /Point un/);
  assert.equal(nouveauxPoints(base, base), '');
});

test('notes : au train, une note supprimée par une publication et retouchée par la branche ne fait plus de conflit', () => {
  const { root, main, git, head } = noteRetouchee();
  try {
    const said = [];
    const { merged, conflicts } = mergeQueued(main, [{ branche: 'claude/ma-fonction', head }], (t) => said.push(t));
    assert.deepEqual(conflicts, [], said.join('\n'));
    assert.equal(merged.length, 1);
    assert.equal(fs.existsSync(path.join(main, 'changements', 'ma-fonction.md')), false, 'la note déjà publiée n\'est pas rejouée');
    const suite = fs.readFileSync(path.join(main, 'changements', 'ma-fonction-suite.md'), 'utf8');
    assert.match(suite, /Point trois, ajouté après/);
    assert.equal(git('status', '--porcelain'), '', 'fusion terminée, arbre propre');
    assert.ok(said.some((t) => /Conflit résolu seul/.test(t)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('notes : côté session, l\'intégration de proto/ecrans dans la branche se résout de même', () => {
  const { root, main, git } = noteRetouchee();
  try {
    git('checkout', '-q', 'claude/ma-fonction');
    assert.throws(() => git('merge', '--no-edit', 'proto/ecrans'));
    const r = resoudreNotesSupprimees(main);
    assert.equal(r.resolu, true);
    assert.deepEqual(r.notes, ['changements/ma-fonction-suite.md']);
    assert.equal(git('status', '--porcelain'), '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('notes : un conflit sur autre chose qu\'une note n\'est jamais touché', () => {
  const { root, main, git, commit } = makeRepo();
  try {
    commit('a.txt', '1\n', 'départ');
    git('checkout', '-q', '-b', 'b');
    commit('a.txt', '2\n', 'branche');
    git('checkout', '-q', 'proto/ecrans');
    commit('a.txt', '3\n', 'base');
    assert.throws(() => git('merge', '--no-edit', 'b'));
    assert.equal(resoudreNotesSupprimees(main).resolu, false);
    assert.match(git('status', '--porcelain'), /UU a\.txt/, 'le conflit reste entier pour la session');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bloquées : une branche en conflit depuis plus d\'une heure est dite, pas une récente', () => {
  const { root, main } = makeRepo();
  try {
    const dir = path.join(main, '.git', 'coordination');
    fs.mkdirSync(dir, { recursive: true });
    const maintenant = Date.parse('2026-11-27T15:00:00Z');
    writeJson(path.join(dir, 'a-fusionner.json'), [
      { branche: 'vieille', head: 'a'.repeat(40), date: '2026-11-26T23:50:00Z', etat: 'conflit', fichiers: ['changements/x.md'] },
      { branche: 'recente', head: 'b'.repeat(40), date: '2026-11-27T14:40:00Z', etat: 'conflit', fichiers: ['a.txt'] },
      { branche: 'en-file', head: 'c'.repeat(40), date: '2026-11-26T23:50:00Z', etat: 'en-file' },
    ]);
    const texte = bloqueesStatus(dir, { now: maintenant });
    assert.match(texte, /vieille/);
    assert.match(texte, /changements\/x\.md/);
    assert.doesNotMatch(texte, /recente|en-file/);
    assert.equal(bloqueesStatus(dir, { now: Date.parse('2026-11-26T23:55:00Z') }), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('suivi : la commande attend en file puis rend le vrai résultat (conflit lu, branche fusionnée et publiée, publication en échec)', async () => {
  const { root, main, git, commit } = makeRepo();
  try {
    commit('a.txt', '1\n', 'départ');
    const dir = path.join(main, '.git', 'coordination');
    fs.mkdirSync(dir, { recursive: true });
    const queue = path.join(dir, 'a-fusionner.json');
    const lock = path.join(dir, 'chef-publication.lock');
    const head = git('rev-parse', 'HEAD');
    const occupe = () => writeJson(lock, { pid: process.pid, since: new Date().toISOString(), branche: 'train', etat: 'publication', phase: 'verification', finPrevue: new Date(Date.now() + 60_000).toISOString() });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const options = (said) => ({ dir, main, branche: 'x', head, say: (t) => said.push(t), pas: 20, wait: 0, suivi: 5_000 });

    // 1. En file, puis conflit : le résultat arrive à la session, code 1.
    occupe();
    enqueueMerge({ branche: 'x', head }, dir);
    let said = [];
    let fin = confier(options(said));
    await wait(150);
    assert.ok(said.some((t) => /^En file/.test(t)), 'dit qu\'elle est en file et qu\'elle attend');
    writeJson(queue, readMergeQueue(dir).map((e) => ({ ...e, etat: 'conflit', fichiers: ['a.txt'] })));
    assert.equal(await fin, 1);
    assert.ok(said.some((t) => /Conflit avec ce qui vient d'arriver/.test(t)));

    // 2. En file, fusionnée, puis publiée (le train rend son verrou) : code 0, après l'attente de la publication.
    enqueueMerge({ branche: 'x', head }, dir);
    said = [];
    fin = confier(options(said));
    await wait(100);
    writeJson(queue, []);
    await wait(100);
    assert.equal(said.some((t) => /^Fusionnée/.test(t)), true);
    fs.rmSync(lock, { force: true });
    assert.equal(await fin, 0);
    assert.ok(said.some((t) => /est publiée/.test(t)), said.join('\n'));

    // 3. Fusionnée, mais la publication échoue : code 1, dit clairement.
    occupe();
    said = [];
    fin = confier(options(said));
    await wait(100);
    writeJson(path.join(dir, 'train-etat.json'), { etat: 'vert', sha: head, publication: 'echec', date: new Date().toISOString() });
    fs.rmSync(lock, { force: true });
    assert.equal(await fin, 1);
    assert.ok(said.some((t) => /publication de la préversion a ÉCHOUÉ/.test(t)), said.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
