// Journal de l'application (30/10/2026) : tout ce qu'elle écrit dans sa console va aussi dans
// <données>\logs\journal.txt, daté ; un essai sur la borne (une partie entre amis) s'explique après
// coup. Au-delà de sa taille, il devient journal-ancien.txt.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { appendJournal, journalLine } from '../index';

test('ligne : date, niveau hors information, message sur une ligne, objets et erreurs lisibles', () => {
  const at = new Date('2026-10-30T09:12:41.207Z');
  assert.equal(journalLine('info', ['Partie entre amis (got) : double prêt.'], at), '2026-10-30T09:12:41.207Z Partie entre amis (got) : double prêt.\n');
  assert.equal(journalLine('erreur', ['VPX :', { code: 1 }], at), '2026-10-30T09:12:41.207Z [erreur] VPX : {"code":1}\n');
  assert.equal(journalLine('avertissement', ['a\nb'], at), '2026-10-30T09:12:41.207Z [avertissement] a\n    b\n');
  assert.match(journalLine('erreur', [new Error('raté')], at), /\[erreur\] Error: raté\n\s+at /);
});

test('relais : au-delà de la taille, le journal devient journal-ancien.txt et un nouveau commence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-journal-'));
  appendJournal(dir, 'première\n', 20);
  appendJournal(dir, 'deuxième\n', 20);
  appendJournal(dir, 'troisième\n', 20);
  assert.equal(fs.readFileSync(path.join(dir, 'journal-ancien.txt'), 'utf8'), 'première\ndeuxième\n');
  assert.equal(fs.readFileSync(path.join(dir, 'journal.txt'), 'utf8'), 'troisième\n');
});

test('application : le journal est branché au démarrage, avant tout le reste', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'main.ts'), 'utf8');
  assert.ok(main.indexOf('journalConsole(loc.dataDir);') > main.indexOf('const loc = locations();'));
  assert.ok(main.indexOf('journalConsole(loc.dataDir);') < main.indexOf('journalUncaught(loc.dataDir)'));
});
