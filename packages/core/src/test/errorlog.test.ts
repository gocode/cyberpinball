// Journal des erreurs non rattrapées du processus principal (errorlog.ts) : à l'écran,
// l'application les note et continue, sans la boîte modale d'Electron.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { appendErrorLog, errorLogEntry, errorLogFile } from '../errorlog';

const AT = new Date('2026-10-24T20:41:07.512Z');

test('entrée : date, nature, pile de l’erreur ; une valeur levée qui n’est pas une Error est écrite telle quelle', () => {
  const error = new TypeError('Object has been destroyed');
  const entry = errorLogEntry('exception', error, AT);
  assert.match(entry, /^2026-10-24T20:41:07\.512Z exception non rattrapée\nTypeError: Object has been destroyed\n {4}at /);
  assert.ok(entry.endsWith('\n\n'));
  assert.equal(errorLogEntry('rejection', 'refusé', AT), '2026-10-24T20:41:07.512Z promesse rejetée sans traitement\nrefusé\n\n');
});

test('journal : <logs>\\erreurs.txt, créé au besoin, entrées ajoutées à la suite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erreurs-'));
  try {
    const file = errorLogFile(path.join(dir, 'logs'));
    assert.equal(path.basename(file), 'erreurs.txt');
    appendErrorLog(file, errorLogEntry('exception', 'un', AT));
    appendErrorLog(file, errorLogEntry('rejection', 'deux', AT));
    assert.equal(fs.readFileSync(file, 'utf8').split('\n\n').filter(Boolean).length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('journal plafonné : les entrées les plus anciennes partent, entières', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erreurs-'));
  try {
    const file = errorLogFile(dir);
    for (let i = 0; i < 100; i++) appendErrorLog(file, errorLogEntry('exception', `erreur ${i} ${'x'.repeat(80)}`, AT), 4000);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(Buffer.byteLength(text) <= 4000);
    assert.match(text, /^2026-10-24T20:41:07\.512Z exception non rattrapée\n/);
    assert.match(text, /erreur 99 /);
    assert.doesNotMatch(text, /erreur 0 /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
