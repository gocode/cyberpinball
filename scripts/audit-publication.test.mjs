// Règles du contrôle de publication (scripts/audit-publication.mjs), lancées par npm test :
// ce qui est interne, ce qui est public, et ce qu'un fichier publié n'a pas le droit de citer.
// Le 06/11/2026, des scripts rangés dans docs/ étaient partis sur GitHub sans que rien ne les
// arrête : tout fichier hors des emplacements publics déclarés est désormais refusé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import { internalPlaces, internalReferences, isPrivate, isPublic, unplacedFiles, workTraces } from './audit-publication.mjs';

test('trois dossiers internes, sans exception par nom de fichier ; la communication n\'est pas suivie', () => {
  for (const f of ['interne/demos/demo-x.ps1', 'interne/tests-manuels/tests-manuels.md', 'docs/recherche/medias.md', 'docs/Design/maquette.html']) assert.equal(isPrivate(f), true, f);
  for (const f of ['docs/manuel.md', 'docs/images/fr/launch.webp', 'app/src/frontend.ts', 'README.md', 'docs/design-system/README.md']) assert.equal(isPrivate(f), false, f);
  // hors-depot/ (et l'ancien video/) ne sont jamais suivis : ni internes, ni publics.
  for (const f of ['hors-depot/forum/message.md', 'video/clips/rendu.ps1']) assert.equal(isPrivate(f) || isPublic(f), false, f);
});

test('un fichier hors des emplacements publics et des dossiers internes est refusé', () => {
  const tracked = ['app/src/a.ts', 'packages/core/src/b.ts', 'scripts/c.mjs', 'docs/manual.md', 'docs/images/en/x.webp', 'lanceur.cmd', 'interne/demos/demo-a.ps1', 'video/x.txt', 'hors-depot/forum/a.md',
    'docs/demo-oubli.ps1', 'outils/rendu.mjs', 'docs/notes.md', 'notes.txt', 'app/brief-ecran.md', 'docs/design-system/critique-codex.md'];
  assert.deepEqual(unplacedFiles(tracked), ['video/x.txt', 'hors-depot/forum/a.md', 'docs/demo-oubli.ps1', 'outils/rendu.mjs', 'docs/notes.md', 'notes.txt', 'app/brief-ecran.md', 'docs/design-system/critique-codex.md']);
  assert.equal(isPublic('docs/fonctionnalites.md'), true);
  assert.equal(isPublic('docs/ecrans/pc-dev.json'), false);
});

test('un fichier publié ne cite aucun document interne, quel que soit le séparateur', () => {
  const places = internalPlaces(['interne/demos/demo-x.ps1', 'docs/recherche/medias.md', 'docs/recherche/maquettes/a.cjs', 'interne/motifs-internes.txt']);
  assert.deepEqual(places.sort(), ['docs/recherche', 'interne/demos', 'interne/motifs-internes.txt']);
  const cited = (file, text) => internalReferences(file, text, places).map((f) => f.excerpt);
  assert.deepEqual(cited('app/src/a.ts', '// Démonstration : interne\\demos\\demo-x.ps1'), ['interne\\demos']);
  assert.deepEqual(cited('packages/core/src/b.ts', '// Conception : docs/recherche/medias.md, § 5.'), ['docs/recherche']);
  assert.deepEqual(cited('docs/manual.md', 'Notes in `docs\\recherche`.'), ['docs\\recherche']);
  assert.deepEqual(cited('docs/manuel.md', 'Voir [la démo](../interne/demos/demo-x.ps1).'), ['../interne/demos', '../interne/demos/demo-x.ps1']);
  // Ce qui ressemble sans l'être : un type MIME, un dossier public, un nom plus long.
  assert.deepEqual(cited('app/src/a.ts', "const type = 'video/mp4'; // video/clips-de-rendu, docs/recherche-de-tables"), []);
  // Les tests qui relisent les démonstrations (et s'en passent sans elles) peuvent les nommer.
  assert.deepEqual(cited('packages/core/src/test/a.test.ts', "path.join(REPO, 'interne', 'demos') // interne/demos"), []);
});

test('aucune trace des revues de conception dans un fichier publié', () => {
  assert.equal(workTraces('app/renderer/frontend.css', ' * Douze pixels entre deux pastilles (revue de Codex, 29/10/2026).').length, 1);
  assert.equal(workTraces('docs/manual.md', 'Phone page (mock-up reviewed by Codex on 06/11/2026).').length, 1);
  assert.deepEqual(workTraces('app/src/a.ts', '// Douze pixels entre deux pastilles. Le codec vidéo, les codecs.'), []);
  assert.deepEqual(workTraces('scripts/audit-publication.mjs', 'const WORK_TRACE = /Codex/;'), []);
});

// Un fichier neuf, pas encore ajouté à git, part au prochain commit : l'audit le lit déjà (13/11/2026 : un renvoi
// vers interne/ dans un fichier neuf du rendu n'avait été vu qu'à la publication). Les fichiers ignorés, non.
test('les fichiers neufs non ignorés sont contrôlés avant leur premier commit', () => {
  const source = fs.readFileSync(new URL('./audit-publication.mjs', import.meta.url), 'utf8');
  assert.match(source, /\['ls-files', '-z', '--others', '--exclude-standard'\]/);
  assert.match(source, /const files = \[\.\.\.tracked, \.\.\.untracked\.filter\(\(f\) => !tracked\.includes\(f\)\)\]\.filter\(\(f\) => !isPrivate\(f\)\);/);
});
