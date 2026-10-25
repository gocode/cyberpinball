// Chemins de menu cités dans l'interface et la documentation. Le 25/10/2026, « Trouver une
// table », la liste d'attente, les mises à jour des tables et les comptes des sites ont quitté
// le menu système pour l'entonnoir « Ajouter une table » ; un message du médecin disait encore
// « menu système > « Trouver une table » », une entrée qui n'existait plus. Ce test refuse
// toute citation de ces entrées au premier niveau du menu système, dans les textes de
// l'interface comme dans les manuels et les tests manuels.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT, interfaceSources } from './i18n-scan';

/** Entrées regroupées dans « Ajouter une table » : en français et en anglais. */
const MOVED = ['Trouver une table', 'Find a table', 'Liste d’attente', 'Download queue', 'Récupérés et attendus', 'Mises à jour des tables', 'Table updates', 'Comptes des sites', 'Site accounts'];
const DOCS = ['docs/manuel.md', 'docs/manual.md', 'docs/tests-manuels.md', 'docs/manual-tests.md', 'README.md', 'README.fr.md'];

test('menu système : les entrées regroupées dans « Ajouter une table » n’y sont plus citées au premier niveau', () => {
  // Apostrophe droite ou typographique : « Liste d'attente » comme « Liste d’attente ».
  const moved = MOVED.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]")).join('|');
  // « menu système > « Trouver une table » », « System menu > "Site accounts" », « (menu système, ou depuis…) ».
  const pattern = new RegExp(`(menu système|system menu)\\s*>\\s*(\\*\\*)?\\s*[«“"]\\s*(${moved})`, 'gi');
  const found: string[] = [];
  for (const rel of [...interfaceSources(), ...DOCS]) {
    const file = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of line.matchAll(pattern)) found.push(`${rel}:${i + 1} « ${m[0]} »`);
      });
  }
  assert.deepEqual(found, [], `Citer le chemin par l'entonnoir : menu système > « Ajouter une table » > …\n${found.join('\n')}`);
});
