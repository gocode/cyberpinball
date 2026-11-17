// Une publication porte un seul état du code (scripts/publication-figee.mjs) : l'instantané envoyé
// sur GitHub est celui du commit de version, et une fusion pendant la fabrication arrête tout avant
// la release. Le 17/11/2026, la 0.1.14 a envoyé HEAD au moment de l'envoi, avec trois fusions
// arrivées pendant la fabrication.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';

interface Figee {
  buildInputs(files: string[]): string[];
  frozenProblem(git: (args: string[]) => string, frozen: string): string | undefined;
}

const load = async () => (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'publication-figee.mjs')).href)) as Figee;

/** Petit dépôt d'essai : un fichier embarqué, un document, un fragment de nouveautés. */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-figee-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.name', 'Essai']);
  git(['config', 'user.email', 'essai@example.com']);
  git(['config', 'core.hooksPath', path.join(dir, 'aucun-hook')]);
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  write('app/src/main.ts', 'export {};\n');
  write('docs/manuel/son.md', 'Son\n');
  write('changements/LISEZMOI.md', 'Nouveautés\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'Version 1.0.0']);
  const frozen = git(['rev-parse', 'HEAD']).trim();
  const commit = (file: string, text: string) => {
    write(file, text);
    git(['add', '-A']);
    git(['commit', '-q', '-m', `fusion ${file}`]);
  };
  return { dir, git, write, commit, frozen, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('fichiers embarqués : le code oui ; les documents, interne, changements et les .md de la racine non', async () => {
  const { buildInputs } = await load();
  assert.deepEqual(buildInputs(['app/renderer/library.css', 'packages/core/src/tableview.ts', 'package.json', 'scripts/fabriquer.mjs']), [
    'app/renderer/library.css',
    'packages/core/src/tableview.ts',
    'package.json',
    'scripts/fabriquer.mjs',
  ]);
  assert.deepEqual(buildInputs(['docs/manuel/son.md', 'interne/tests-manuels/x.md', 'changements/badges.md', 'CHANGELOG.md', 'README.fr.md', 'hors-depot/a.png', '']), []);
});

test('rien n’a bougé, ou seulement des documents : la publication continue', async () => {
  const { frozenProblem } = await load();
  const s = sandbox();
  try {
    assert.equal(frozenProblem(s.git, s.frozen), undefined);
    s.commit('docs/manuel/son.md', 'Son, révisé\n');
    s.commit('changements/badges-dessines.md', '## Français\n');
    assert.equal(frozenProblem(s.git, s.frozen), undefined);
  } finally {
    s.done();
  }
});

test('une fusion sur du code pendant la fabrication : arrêt, avec les fichiers et les deux commits', async () => {
  const { frozenProblem } = await load();
  const s = sandbox();
  try {
    s.commit('app/renderer/library.css', '.medal-earned {}\n');
    const head = s.git(['rev-parse', 'HEAD']).trim();
    const message = frozenProblem(s.git, s.frozen);
    assert.ok(message);
    assert.match(message!, /app\/renderer\/library\.css/);
    assert.ok(message!.includes(s.frozen.slice(0, 7)) && message!.includes(head.slice(0, 7)));
    assert.match(message!, /rien n'est publié/);
  } finally {
    s.done();
  }
});

test('une modification non enregistrée d’un fichier embarqué : arrêt aussi', async () => {
  const { frozenProblem } = await load();
  const s = sandbox();
  try {
    s.write('app/src/main.ts', 'export const x = 1;\n');
    assert.match(frozenProblem(s.git, s.frozen) ?? '', /non enregistrées.*app\/src\/main\.ts/);
  } finally {
    s.done();
  }
});

test('publier.mjs : l’instantané est celui du commit figé, et le contrôle suit la fabrication', () => {
  const code = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'publier.mjs'), 'utf8');
  const calls = code.split('\n').filter((line) => line.includes('snapshotAndPush({'));
  assert.ok(calls.length > 0);
  for (const call of calls) assert.match(call, /source: frozen\b/, `l’instantané doit être pris sur le commit figé, pas sur HEAD : ${call.trim()}`);
  const frozenAt = code.indexOf("const frozen = git(['rev-parse', 'HEAD'])");
  const versionCommit = code.indexOf("git(['commit', '-q', '-m', `Version ${next}`])");
  const fabrication = code.indexOf("'fabriquer.mjs'");
  const check = code.indexOf('frozenProblem(git, frozen)');
  const push = code.indexOf('snapshotAndPush({');
  assert.ok(versionCommit > 0 && frozenAt > versionCommit, 'le commit figé est pris après le commit de version');
  assert.ok(fabrication > frozenAt && check > fabrication && push > check, 'contrôle après la fabrication, avant l’envoi');
});
