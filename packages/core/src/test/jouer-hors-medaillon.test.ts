// Jouer une table quitte le médaillon de la roue (17/11/2026). Une table installée depuis la
// Bibliothèque, puis « Jouer », pendant que la roue montrait la Communauté : le chargement
// s'appelait « Communauté » et la roue revenait sur le médaillon après la partie. Le rang de la
// table changeait (state.index), mais le médaillon choisi (state.medallion) restait par-dessus.
// L'invariant : une partie passe toujours la roue sur sa table ; et tout changement de rang qui
// garde le médaillon le dit sur sa ligne, pour qu'un nouveau chemin ne le garde pas par oubli.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { frontendSource } from './frontend-source';

const front = frontendSource();
const lines = front.split(/\r?\n/);

/** Le corps d'une fonction de premier niveau, de sa signature à l'accolade fermante en début de ligne. */
function body(signature: string): string {
  const start = front.indexOf(signature);
  assert.ok(start >= 0, `fonction introuvable : ${signature}`);
  const end = front.indexOf('\n}', start);
  return front.slice(start, end);
}

test('pointAtTable : le rang de la table, et plus aucun médaillon choisi', () => {
  const fn = body('function pointAtTable(');
  assert.match(fn, /medallion: undefined/);
});

test('play() passe la roue sur sa table avant toute autre chose (chargement, refus, retour)', () => {
  const fn = body('async function play(table: TableEntry');
  const first = fn.split(/\r?\n/).slice(1).find((l) => l.trim() && !l.trim().startsWith('//'));
  assert.equal(first?.trim(), 'pointAtTable(table);', 'première instruction de play() : un return plus haut garderait le médaillon');
});

test('un changement de rang de table qui garde le médaillon le dit sur sa ligne', () => {
  const offenders: string[] = [];
  lines.forEach((line, i) => {
    if (!/state = \{ \.\.\.state,[^}]*\bindex\b/.test(line)) return;
    if (/\bmedallion\b/.test(line)) return;
    const said = /garde le médaillon :/.test(line) || /garde le médaillon :/.test(lines[i - 1] ?? '');
    if (!said) offenders.push(`frontend.ts:${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(offenders, [], 'passer par pointAtTable(), ou écrire « // garde le médaillon : <raison> »');
});
