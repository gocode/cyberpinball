// Un test manuel qui en prolonge un autre (« Pendant 549 », « Après 551 », « Comme 554 ») renvoie à
// un test de sa propre section.
//
// Les tests du gestionnaire de téléchargements, renumérotés de 539-546 en 549-556 à la fusion
// (29/10/2026), renvoyaient encore à 539, 540, 541 et 544 : des tests qui existaient, mais dans
// d'autres sections (barre des tâches, longues listes). Une renumérotation qui oublie ses renvois
// est maintenant refusée.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/**
 * Renvois qui prolongent un test, en français puis en anglais : le numéro suivi d'une ponctuation
 * (« Pendant 549, », « Après 551 : »), ce qui écarte les durées (« pendant 15 s », « après 20 secondes »).
 */
const FOLLOW_UP = /(?:\b(?:Pendant|Après|Comme|pendant|après|comme|l'attente de|During|After|As|Like|during|after|waiting in)\s+)(\d{2,4})(?=\s*[,;:)])/g;

function problems(file: string): string[] {
  const lines = fs.readFileSync(path.join(REPO, 'docs', file), 'utf8').split('\n');
  // Sections : chaque titre ouvre la sienne ; les tests d'une section sont ses lignes « | N | ».
  const sections: { rows: { n: string; line: number; text: string }[] }[] = [{ rows: [] }];
  lines.forEach((text, i) => {
    if (/^#{1,6}\s/.test(text)) sections.push({ rows: [] });
    const row = /^\|\s*(\d+[a-z]?)\s*\|/.exec(text);
    if (row) sections.at(-1)!.rows.push({ n: row[1]!, line: i + 1, text });
  });
  const found: string[] = [];
  for (const { rows } of sections) {
    const own = new Set(rows.map((r) => r.n));
    for (const row of rows) {
      for (const m of row.text.matchAll(FOLLOW_UP)) {
        if (!own.has(m[1]!)) found.push(`${file}:${row.line} (test ${row.n}) : « ${m[0].trim()} » ne désigne aucun test de sa section`);
      }
    }
  }
  return found;
}

test('tests manuels : « Pendant N », « Après N », « Comme N » renvoient à un test de la même section', () => {
  assert.deepEqual([...problems('tests-manuels.md'), ...problems('manual-tests.md')], []);
});
