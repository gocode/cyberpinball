// Cache des scripts lus (app/src/vbs.ts, <données>\cache\scripts.json), 17/11/2026 : cachedScript,
// appelé pour chaque table en boucle (santé, musique des ROM, médecin), relisait et analysait tout
// scripts.json à chaque appel ; le coût croissait comme le carré du nombre de tables.
// Invariant : le fichier est lu une fois, puis relu seulement s'il a changé sur le disque.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { scriptFacts, type ScriptFacts } from '../doctor';

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');

interface VbsApi {
  cachedScript(table: string, dataDir: string): ScriptFacts | undefined;
  rememberScript(table: string, facts: ScriptFacts, dataDir: string): void;
  forgetScriptCache(): void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vbs = require(path.join(APP_DIST, 'vbs.js')) as VbsApi;
// Le vrai module (l'import ci-dessus n'en est qu'une vue en lecture seule) : vbs.js le lit au moment de l'appel.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFs = require('node:fs') as { readFileSync: typeof fs.readFileSync };

test('scripts.json : lu une seule fois pour cent tables, relu dès qu’il change sur le disque', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scripts-cache-'));
  const realRead = nodeFs.readFileSync;
  try {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
    const tables = Array.from({ length: 100 }, (_, i) => path.join(dir, `Table ${i}.vpx`));
    const facts = scriptFacts('');
    for (const table of tables) {
      fs.writeFileSync(table, 'vpx');
      vbs.rememberScript(table, facts, dataDir);
    }
    vbs.forgetScriptCache();

    const file = path.join(dataDir, 'cache', 'scripts.json');
    let reads = 0;
    nodeFs.readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (typeof p === 'string' && path.resolve(p) === path.resolve(file)) reads++;
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync;

    for (let round = 0; round < 3; round++) for (const table of tables) assert.deepEqual(vbs.cachedScript(table, dataDir), facts);
    assert.equal(reads, 1, '300 appels : scripts.json lu une fois');

    // Changé par un autre processus : relu.
    const cache = JSON.parse(realRead(file, 'utf8')) as Record<string, { facts: ScriptFacts }>;
    const changed: ScriptFacts = { ...facts, roms: ['essai_l1'] };
    cache[tables[0]!.toLowerCase()]!.facts = changed;
    fs.writeFileSync(file, JSON.stringify(cache));
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    assert.deepEqual(vbs.cachedScript(tables[0]!, dataDir), changed);
    assert.equal(reads, 2);
  } finally {
    nodeFs.readFileSync = realRead;
    vbs.forgetScriptCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
