// Documents découpés et nouveautés par branche (17/11/2026) : en deux semaines, le manuel, les tests
// manuels, les deux CHANGELOG et le numéro de version avaient été retouchés par plus de 200 commits
// chacun, d'où un conflit à presque chaque fusion. Ces tests fixent ce qui les évite : une phrase
// par ligne sans changer le rendu, un découpage qui garde liens et ancres, des nouveautés rassemblées
// à la publication, et le report d'une branche partie avant le découpage.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { carryOver, fileSlug, splitAll, splitDocument } from './decoupage.mjs';
import { reflow, sentences } from './phrases.mjs';
import { SPLITS, fragmentProblems, slug } from './traductions.mjs';
import { foldFragments, fragmentText, nextVersion } from './version-suivante.mjs';

test('une phrase par ligne : coupée après la ponctuation finale, jamais dans un code, un lien ou des guillemets', () => {
  assert.deepEqual(sentences('Un. Deux ! Trois ? Quatre…'), ['Un.', 'Deux !', 'Trois ?', 'Quatre…']);
  assert.deepEqual(sentences('Voir `a. B` puis [x. Y](z.md) et « fin. Puis » encore (p. Ex). Fin.'), ['Voir `a. B` puis [x. Y](z.md) et « fin. Puis » encore (p. Ex).', 'Fin.']);
  assert.deepEqual(sentences('version 0.1.14. Le reste, etc. et la suite.'), ['version 0.1.14.', 'Le reste, etc. et la suite.']);
  // La suite d'un point de liste ou d'une citation garde son retrait ; titres, tableaux, code et HTML restent entiers.
  const text = ['- **Écrans** : un. Deux.', '12. Liste. Numérotée.', '> Cite. Encore.', '## Titre. Long.', '| a. B | c |', '```', 'code. Pas coupé.', '```', '<div>html. Entier.</div>'].join('\n');
  assert.equal(reflow(text), ['- **Écrans** : un.', '  Deux.', '12. Liste.', '    Numérotée.', '> Cite.', '> Encore.', '## Titre. Long.', '| a. B | c |', '```', 'code. Pas coupé.', '```', '<div>html. Entier.</div>'].join('\n'));
  assert.equal(reflow(reflow(text)), reflow(text), 'une deuxième fois ne change rien');
  assert.equal(reflow('Un. Deux.\r\nTrois.'), 'Un.\r\nDeux.\r\nTrois.', 'les fins de ligne du fichier sont gardées');
});

const MANUEL = SPLITS.find((s) => s.fr === 'docs/manuel.md');

const FR = [
  '[English](manual.md) · Français',
  '',
  '# Manuel',
  '',
  'Intro. Voir [le son](#son) et [la fin](#structure-1).',
  '',
  '## Démarrer',
  '',
  'Lire [le son](#son), puis [Lisez-moi](../README.fr.md) et ![image](images/a.png).',
  '',
  '### Structure',
  '',
  '## Son',
  '',
  'Deux sorties. Voir [Démarrer](#démarrer) et [en anglais](manual.md#sound).',
  '',
  '### Structure',
  '',
].join('\n');
const EN = FR.replace('[English](manual.md) · Français', '[Français](manuel.md) · English')
  .replace('## Démarrer', '## Getting started')
  .replace('## Son', '## Sound')
  .replace('(#son)', '(#sound)').replace('(#son)', '(#sound)')
  .replace('[Démarrer](#démarrer)', '[Getting started](#getting-started)')
  .replace('[en anglais](manual.md#sound)', '[in French](manuel.md#son)')
  .replace('../README.fr.md', '../README.md');

test('découpage : une rubrique par fichier, liens et ancres réécrits, sommaire qui garde les ancres des rubriques', () => {
  const files = splitDocument(MANUEL, FR, EN);
  assert.deepEqual([...files.keys()].sort(), ['docs/manual.md', 'docs/manual/getting-started.md', 'docs/manual/sound.md', 'docs/manuel.md', 'docs/manuel/demarrer.md', 'docs/manuel/son.md']);
  const sommaire = files.get('docs/manuel.md');
  assert.match(sommaire, /^## \[Démarrer\]\(manuel\/demarrer\.md\)$/m);
  assert.equal(slug('[Démarrer](manuel/demarrer.md)'), 'démarrer', 'l’ancre publique #démarrer du sommaire reste');
  // Intro du sommaire : la seconde « Structure » du document entier (#structure-1) est la première de son fichier.
  assert.match(sommaire, /Intro\.\nVoir \[le son\]\(manuel\/son\.md#son\) et \[la fin\]\(manuel\/son\.md#structure\)\./);
  const demarrer = files.get('docs/manuel/demarrer.md');
  assert.match(demarrer, /^\[English\]\(\.\.\/manual\/getting-started\.md\) · Français · \[Sommaire du manuel\]\(\.\.\/manuel\.md\)\n\n## Démarrer/);
  assert.match(demarrer, /\[le son\]\(son\.md#son\), puis \[Lisez-moi\]\(\.\.\/\.\.\/README\.fr\.md\) et !\[image\]\(\.\.\/images\/a\.png\)/);
  assert.match(files.get('docs/manuel/son.md'), /Deux sorties\.\nVoir \[Démarrer\]\(demarrer\.md#démarrer\) et \[en anglais\]\(\.\.\/manual\/sound\.md#sound\)\./);
  assert.equal(fileSlug("Ajouter une table : l'entonnoir, « Récupérer », cœur"), 'ajouter-une-table-l-entonnoir-recuperer-coeur');
  assert.throws(() => splitDocument(MANUEL, FR, EN.replace('## Sound', '### Sound')), /rubriques/);
});

test('versions : la suivante d’une préversion, d’une finale, mineure et majeure', () => {
  assert.equal(nextVersion('0.1.14-essai.23', 'essai'), '0.1.14-essai.24');
  assert.equal(nextVersion('0.1.14', 'essai'), '0.1.15-essai.1');
  assert.equal(nextVersion('0.1.14-essai.23'), '0.1.14');
  assert.equal(nextVersion('0.1.14', 'mineure'), '0.2.0');
  assert.equal(nextVersion('0.1.14', 'majeure'), '1.0.0');
  assert.throws(() => nextVersion('0.1.14', 'grosse'), /inconnue/);
});

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-decoupage-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'hooks'));
  for (const [k, v] of [['user.name', 'Essai'], ['user.email', 'essai@example.com'], ['core.autocrlf', 'false'], ['core.hooksPath', path.join(dir, 'hooks')], ['commit.gpgsign', 'false']]) git('config', k, v);
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n');
  return { dir, git, write, read, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const CHANGELOG = (lang, points) => `${lang === 'fr' ? '[English](CHANGELOG.en.md) · Français' : '[Français](CHANGELOG.md) · English'}\n\n# Nouveautés\n\n## 0.1.0\n\n${points.map((p) => `- ${p}`).join('\n')}\n`;

test('nouveautés en attente : vérifiées, puis rassemblées en tête de la section de la version et retirées', () => {
  const r = tempRepo();
  try {
    r.write('CHANGELOG.md', CHANGELOG('fr', ['Ancien.']));
    r.write('CHANGELOG.en.md', CHANGELOG('en', ['Old.']));
    r.write('changements/LISEZMOI.md', '# Mode d’emploi\n');
    r.write('changements/a.md', fragmentText(['Neuf A.'], ['New A.']));
    r.write('changements/b.md', fragmentText(['Neuf B.', 'Ancien.'], ['New B.']));
    const problems = fragmentProblems(r.dir);
    assert.ok(problems.some((p) => /b\.md : 2 point\(s\) en français, 1 en anglais/.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => /b\.md : point déjà publié/.test(p)), problems.join('\n'));
    assert.throws(() => foldFragments('0.1.0', r.dir), /à corriger/);
    r.write('changements/b.md', fragmentText(['Neuf B.'], ['New B.']));
    assert.deepEqual(foldFragments('0.1.1', r.dir), { files: ['changements/a.md', 'changements/b.md'], fr: 2, en: 2 });
    assert.match(r.read('CHANGELOG.md'), /## 0\.1\.1\n\n- Neuf A\.\n- Neuf B\.\n\n## 0\.1\.0\n\n- Ancien\./);
    assert.match(r.read('CHANGELOG.en.md'), /## 0\.1\.1\n\n- New A\.\n- New B\.\n\n## 0\.1\.0/);
    assert.deepEqual(fs.readdirSync(path.join(r.dir, 'changements')), ['LISEZMOI.md']);
    // Section déjà là : les nouveaux points vont en tête.
    r.write('changements/c.md', fragmentText(['Neuf C.'], ['New C.']));
    foldFragments('0.1.1', r.dir);
    assert.match(r.read('CHANGELOG.md'), /## 0\.1\.1\n\n- Neuf C\.\n- Neuf A\./);
  } finally {
    r.done();
  }
});

test('report : une branche partie avant le découpage retrouve ses changements dans les rubriques, et ses nouveautés dans changements/', () => {
  const r = tempRepo();
  try {
    r.write('docs/manuel.md', FR);
    r.write('docs/manual.md', EN);
    r.write('CHANGELOG.md', CHANGELOG('fr', ['Ancien.']));
    r.write('CHANGELOG.en.md', CHANGELOG('en', ['Old.']));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'ancêtre');
    // La branche principale découpe, puis change une phrase de « Démarrer ».
    r.git('checkout', '-q', '-b', 'proto');
    splitAll(r.dir);
    r.write('docs/manuel/demarrer.md', r.read('docs/manuel/demarrer.md').replace('### Structure', 'Principal.\n\n### Structure'));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'découpage');
    // La branche, partie avant, change « Son » d'un seul tenant, ajoute une rubrique et des nouveautés.
    r.git('checkout', '-q', 'main');
    r.git('checkout', '-q', '-b', 'claude/ma-branche');
    r.write('docs/manuel.md', `${FR.replace('Deux sorties.', 'Deux sorties, vérifiées.')}\n## Nouvelle\n\nTexte neuf.\n`);
    r.write('docs/manual.md', `${EN.replace('Deux sorties.', 'Two outputs, checked.')}\n## New one\n\nNew text.\n`);
    r.write('CHANGELOG.md', CHANGELOG('fr', ['Neuf.', 'Ancien.']));
    r.write('CHANGELOG.en.md', CHANGELOG('en', ['New.', 'Old.']));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'branche');
    assert.throws(() => r.git('merge', '-q', 'proto'), 'la fusion bute sur les documents d’un seul tenant');
    const report = carryOver(r.dir);
    assert.ok(report.some((l) => /docs\/manuel\/son\.md : changements de la branche reportés/.test(l)), report.join('\n'));
    assert.match(r.read('docs/manuel/son.md'), /Deux sorties, vérifiées\./);
    assert.match(r.read('docs/manual/sound.md'), /Two outputs, checked\./);
    assert.match(r.read('docs/manuel/demarrer.md'), /Principal\./, 'le changement de la branche principale reste');
    assert.match(r.read('docs/manuel/nouvelle.md'), /^\[English\]\(\.\.\/manual\/new-one\.md\)/);
    assert.match(r.read('docs/manuel.md'), /\(manuel\/son\.md\)\n## \[Nouvelle\]\(manuel\/nouvelle\.md\)/);
    assert.match(r.read('docs/manual.md'), /## \[New one\]\(manual\/new-one\.md\)/);
    assert.equal(r.read('changements/ma-branche.md'), fragmentText(['Neuf.'], ['New.']));
    assert.equal(r.read('CHANGELOG.md'), CHANGELOG('fr', ['Ancien.']));
    for (const f of ['docs/manuel.md', 'docs/manuel/son.md', 'docs/manual/sound.md']) assert.doesNotMatch(r.read(f), /<<<<<<<|>>>>>>>/, f);
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'fusion');
  } finally {
    r.done();
  }
});
