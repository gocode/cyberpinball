// Une saisie vidée puis validée est une réponse, pas une annulation (21/11/2026).
//
// Rapport d'un joueur : dans « Ajouter une table > Trouver une table », une recherche par titre ne
// s'effaçait plus ; seul moyen, relancer Cyber Pinball. La saisie du clavier à l'écran rendait
// undefined (annulée) pour un champ validé vide : le catalogue gardait l'ancien texte malgré « vide
// pour tout revoir », et « Effacer les filtres » ne touchait pas au titre cherché. Même défaut sur
// toutes les saisies où « vide » veut dire quelque chose (sujet d'un salon, ZeDMD en wifi, adresse
// Art-Net, corrections du Juke-box, recherche des Classements).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { promptAnswer } from '../textedit';
import { REPO_ROOT } from './i18n-scan';

const source = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');

test('saisie validée : son texte, même vide ; annulée : undefined', () => {
  assert.equal(promptAnswer(true, 'Batman'), 'Batman');
  assert.equal(promptAnswer(true, ''), '', 'un champ vidé puis validé est une réponse');
  assert.equal(promptAnswer(false, 'Batman'), undefined);
  assert.equal(promptAnswer(false, ''), undefined);
});

test('la bibliothèque ferme une saisie par promptAnswer, jamais « validée et non vide »', () => {
  const lib = source('library.ts');
  const close = /function closeEditor\([\s\S]*?\r?\n {2}\}\r?\n/.exec(lib)?.[0];
  assert.ok(close, 'closeEditor introuvable dans library.ts');
  assert.match(close, /s\.done\(promptAnswer\(save, value\)\)/, 'la saisie rend promptAnswer(save, value)');
  // La forme fautive, nulle part dans le processus principal.
  for (const file of fs.readdirSync(path.join(REPO_ROOT, 'app', 'src')).filter((f) => f.endsWith('.ts'))) {
    assert.doesNotMatch(source(file), /\.done\(\s*save\s*&&/, `${file} : un champ validé vide vaudrait une annulation`);
  }
});

test('catalogue : « Effacer les filtres » retire aussi le titre cherché', () => {
  const catalog = source('catalog.ts');
  assert.match(catalog, /const isDefault = \(\) => !filter\.text && /, 'un titre cherché : les filtres ne sont pas ceux d’origine');
  assert.match(catalog, /Object\.assign\(filter, DEFAULT_FILTER, \{[^}]*text: undefined/, '« Effacer les filtres » vide le titre cherché');
  // Un champ validé vide efface la recherche (« vide pour tout revoir ») : la réponse vide n'est pas filtrée.
  assert.match(catalog, /filter\.text = text\.trim\(\) \|\| undefined;/);
});
