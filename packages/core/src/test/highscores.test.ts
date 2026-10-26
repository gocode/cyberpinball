// Records des tables (highscores.ts) : VPReg.stg tel que VPX 10.8.1 l'écrit dans le dossier
// user\ de la table, un stockage par table, une valeur UTF-16LE par flux.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { dmdScore, newRecords, readTableRecords, recordsOf, vpRegFile } from '../highscores';
import { cfb } from './fixtures';

function tableWith(reg: Buffer | undefined, file = 'GOTG_2.1.1.vpx', title = 'Guardians of the Galaxy') {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-records-'));
  if (reg) {
    fs.mkdirSync(path.join(folder, 'user'));
    fs.writeFileSync(vpRegFile({ folder }), reg);
  }
  return { folder, file: path.join(folder, file), title };
}

// Relevé de la borne (Guardians of the Galaxy, VPW) : 5 places, une catégorie à part, les crédits.
const GOTG = {
  Credits: '14',
  HighScore1: '75000000',
  HighScore2: '55000000',
  HighScore3: '40000000',
  HighScore1Name: 'MPT',
  HighScore2Name: 'DAP',
  HighScore3Name: 'hmr',
  HighScoreCB: '25000000',
  HighScoreCBName: 'GCC',
  TotalGamesPlayed: '7',
};

test('records : le tableau HighScoreN / HighScoreNName et les crédits, dans l’ordre des places', () => {
  const table = tableWith(cfb(GOTG, {}, { info: 'gotg_2020' }));
  const records = readTableRecords(table);
  assert.equal(records?.storage, 'gotg_2020');
  assert.equal(records?.credits, 14);
  assert.deepEqual(records?.scores, [
    { rank: 1, score: 75000000, initials: 'MPT' },
    { rank: 2, score: 55000000, initials: 'DAP' },
    { rank: 3, score: 40000000, initials: 'HMR' },
  ]);
});

test('records : rien d’inventé (pas de fichier, valeurs illisibles, place manquante)', () => {
  assert.equal(readTableRecords(tableWith(undefined)), undefined);
  assert.equal(readTableRecords(tableWith(Buffer.from('pas un fichier composé'))), undefined);
  // Une place manquante arrête le tableau : HighScore3 sans HighScore2 n'est pas lu.
  assert.deepEqual(recordsOf(new Map([['HighScore1', '1000'], ['HighScore3', '500'], ['HighScore1Name', '']])).scores, [{ rank: 1, score: 1000 }]);
  assert.deepEqual(recordsOf(new Map([['HighScore1', 'ABC'], ['Credits', '-1']])), { scores: [] });
  // Une table qui n'enregistre que des réglages n'a pas de records.
  assert.equal(readTableRecords(tableWith(cfb({ Lut: '12' }, {}, { info: 'The_Goonies' }))), undefined);
});

test('records : plusieurs tables dans le même VPReg.stg, celle dont le nom est dans le fichier', () => {
  const twoTables = cfb({ HighScore1: '100', HighScore1Name: 'AAA' }, { HighScore1: Buffer.from('200', 'utf16le'), HighScore1Name: Buffer.from('BBB', 'utf16le') }, { info: 'gotg', game: 'goonies' });
  const gotg = readTableRecords(tableWith(twoTables));
  assert.equal(gotg?.storage, 'gotg');
  assert.equal(gotg?.scores[0]?.score, 100);
  // Aucun nom reconnu : on ne devine pas.
  assert.equal(readTableRecords(tableWith(twoTables, 'Medieval Madness.vpx', 'Medieval Madness')), undefined);
});

test('nouveaux records : les scores entrés au tableau entre avant et après la partie', () => {
  const before = { file: 'x', storage: 'gotg', scores: [{ rank: 1, score: 300 }, { rank: 2, score: 200, initials: 'AAA' }, { rank: 3, score: 200, initials: 'AAA' }] };
  assert.deepEqual(newRecords(before, before), []);
  const after = { ...before, scores: [{ rank: 1, score: 300 }, { rank: 2, score: 250, initials: 'JUL' }, { rank: 3, score: 200, initials: 'AAA' }] };
  assert.deepEqual(newRecords(before, after), [{ rank: 2, score: 250, initials: 'JUL' }]);
  // Le même score que l'ancien, une fois de plus : c'est une nouvelle entrée.
  const twice = { ...before, scores: [{ rank: 1, score: 300 }, { rank: 2, score: 300 }, { rank: 3, score: 200, initials: 'AAA' }] };
  assert.deepEqual(newRecords(before, twice), [{ rank: 2, score: 300 }]);
  assert.deepEqual(newRecords(undefined, after), []);
});

test('score à la manière des DMD : chiffres groupés par trois', () => {
  assert.equal(dmdScore(75000000), '75,000,000');
  assert.equal(dmdScore(999), '999');
  assert.equal(dmdScore(1000), '1,000');
});
