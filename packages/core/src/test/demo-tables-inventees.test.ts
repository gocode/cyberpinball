// Les démonstrations dont les captures vont sur la page publique du projet (README, docs\images)
// ne montrent que des tables inventées.
//
// Incident du 29/10/2026 : les bornes fictives du réseau simulé (app\src\social-demo.ts) jouaient,
// partageaient et battaient leurs records sur de vrais jeux (fabricant et titre réels) ; leurs
// noms s'affichaient dans « Mes amis », la fiche de Bruno et sa bibliothèque, que la page
// d'accueil devait illustrer. Le dépôt est public : aucune œuvre de tiers dans ses images.
//
// Ce test lit les fichiers qui fabriquent ces captures et refuse tout fabricant réel (la liste
// du sélecteur de fabricant de l'application, app\src\library.ts) écrit comme celui d'une table :
// « (Williams 1991) » dans un nom de dossier, ou `manufacturer: 'Bally'` / `maker: 'Stern'`.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Fichiers qui fabriquent les captures publiées : tables, bornes fictives, parcours rejoués. */
const SOURCES = ['app/src/social-demo.ts', 'docs/demo-captures.cjs', 'docs/demo-captures.ps1', 'docs/demo-amis.ps1'];

/** Fabricants réels, tels que les propose l'application (« Original » n'en est pas un). */
function realManufacturers(): string[] {
  const text = fs.readFileSync(path.join(REPO, 'app', 'src', 'library.ts'), 'utf8');
  const list = /const MANUFACTURERS = \[([\s\S]*?)\]/.exec(text);
  assert.ok(list, 'liste MANUFACTURERS introuvable dans app/src/library.ts');
  return [...list[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((m) => m !== 'Original');
}

/** Tables d'un fabricant réel nommées dans un texte : [ligne, extrait]. */
function realTables(text: string, makers: readonly string[]): string[] {
  const alt = makers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const res = [new RegExp(`\\((?:${alt}) \\d{4}\\)`), new RegExp(`\\b(?:manufacturer|maker|Manufacturer)\\s*:\\s*['"](?:${alt})['"]`)];
  const found: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const re of res) {
      const m = re.exec(line);
      if (m) found.push(`${i + 1} : ${m[0]}`);
    }
  });
  return found;
}

test('les démonstrations des images publiques ne nomment aucune table d’un vrai fabricant', () => {
  const makers = realManufacturers();
  assert.ok(makers.length > 10, `fabricants lus : ${makers.length}`);
  const problems = SOURCES.flatMap((file) => realTables(fs.readFileSync(path.join(REPO, file), 'utf8'), makers).map((p) => `${file}:${p}`));
  assert.deepEqual(problems, []);
});

test('une table d’un vrai fabricant est relevée (les bornes fictives du 29/10/2026)', () => {
  const text = [
    "const folders = ['Bride of Pin-bot (Williams 1991)'];",
    "const afm = { title: 'Attack from Mars', manufacturer: 'Bally', year: 1995 };",
    "{ title: 'Star Courier', maker: 'Halcyon', year: 1987 }",
    "'Glass Lagoon (Gulfstream 1993)'",
  ].join('\n');
  assert.deepEqual(realTables(text, realManufacturers()), ['1 : (Williams 1991)', "2 : manufacturer: 'Bally'"]);
});
