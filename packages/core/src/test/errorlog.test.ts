// Journal des erreurs non rattrapées du processus principal (errorlog.ts) : à l'écran,
// l'application les note et continue, sans la boîte modale d'Electron. Aussi les incidents rattrapés
// et les plantages natifs relevés au démarrage suivant (rapports de Crashpad).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { appendErrorLog, errorLogEntry, errorLogFile, incidentLogEntry, newCrashReports } from '../errorlog';

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

test('incident rattrapé : une ligne (blancs réduits), puis la pile s’il y en a une', () => {
  assert.equal(incidentLogEntry('Télécommande :\n geste   non transmis', undefined, AT), '2026-10-24T20:41:07.512Z incident rattrapé\nTélécommande : geste non transmis\n\n');
  const entry = incidentLogEntry('Page tombée', new Error('Render frame was disposed'), AT);
  assert.match(entry, /^2026-10-24T20:41:07\.512Z incident rattrapé\nPage tombée\nError: Render frame was disposed\n {4}at /);
  assert.match(incidentLogEntry('Plantage natif', undefined, AT, 'crash'), /^2026-10-24T20:41:07\.512Z plantage natif \(rapport de Crashpad\)\nPlantage natif\n\n$/);
});

test('rapports de plantage natif : chacun relevé une seule fois, du plus ancien au plus récent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crashpad-'));
  try {
    const reports = path.join(dir, 'reports');
    const marker = path.join(dir, 'logs', 'plantages-vus.txt');
    assert.deepEqual(newCrashReports(reports, marker), [], 'pas de dossier : rien');
    fs.mkdirSync(reports);
    const dump = (name: string, at: string) => {
      const file = path.join(reports, name);
      fs.writeFileSync(file, 'MDMP');
      fs.utimesSync(file, new Date(at), new Date(at));
      return file;
    };
    const a = dump('a.dmp', '2026-11-10T10:00:00Z');
    const b = dump('b.dmp', '2026-11-10T11:00:00Z');
    fs.writeFileSync(path.join(reports, 'notes.txt'), 'pas un rapport');
    assert.deepEqual(newCrashReports(reports, marker).map((r) => r.file), [a, b]);
    assert.deepEqual(newCrashReports(reports, marker), [], 'déjà relevés');
    const c = dump('c.dmp', '2026-11-10T12:00:00Z');
    assert.deepEqual(newCrashReports(reports, marker).map((r) => r.file), [c]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
