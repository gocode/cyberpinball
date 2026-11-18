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
import { COMPAT_FIXES } from '../scriptcompat';
import { vpxWithScript } from './fixtures';

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');

interface VbsApi {
  readScript(exe: string | undefined, table: string, dataDir: string): Promise<ScriptFacts | { error: string }>;
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

// 18/11/2026 : le correctif executeGlobalOnce (clignotements analysés par l'antivirus) a été publié sans changer
// FACTS_VERSION ; sur une borne, les lectures gardées en cache dataient de la veille, ne le réclamaient pas, et le
// médecin, qui s'y fie sans relire le script, ne l'a jamais appliqué (Daredevil, Hellboy). Invariant : une lecture
// faite par une version qui ne connaissait pas tous les correctifs de script d'aujourd'hui est refaite, dans le .vpx,
// sans lancer VPX.
test('scripts.json : une lecture d’avant un correctif de script est refaite, sans lancer VPX', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scripts-cache-'));
  try {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
    const flash = [
      'Sub FlashForMs(MyLight, TotalPeriod, BlinkPeriod, FinalState)',
      '  ExecuteGlobal "Sub " & MyLight.Name & "_Timer:Me.Visible = 0:End Sub"',
      'End Sub',
      '',
    ].join('\r\n');
    const tables = ['Daredevil.vpx', 'Hellboy.vpx'].map((name) => path.join(dir, name));
    for (const table of tables) fs.writeFileSync(table, vpxWithScript(flash));
    const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
    const before = scriptFacts('');
    const stale = (table: string, fixes?: string) => {
      const stat = fs.statSync(table);
      return { size: stat.size, mtimeMs: stat.mtimeMs, facts: before, v: 12, ...(fixes === undefined ? {} : { fixes }) };
    };
    // Une lecture sans la liste (versions d'avant ce test), une autre faite quand executeGlobalOnce n'existait pas.
    const older = COMPAT_FIXES.filter((f) => f !== 'executeGlobalOnce').join(',');
    fs.writeFileSync(cacheFile, JSON.stringify({ [tables[0]!.toLowerCase()]: stale(tables[0]!), [tables[1]!.toLowerCase()]: stale(tables[1]!, older) }));
    vbs.forgetScriptCache();

    assert.ok(vbs.cachedScript(tables[0]!, dataDir)?.coreCompat?.includes('executeGlobalOnce'), 'cachedScript : relue');
    // readScript avec un VPX qui n'existe pas : la lecture refaite ne le lance pas.
    const read = await vbs.readScript(path.join(dir, 'VPinballX64.exe'), tables[1]!, dataDir);
    assert.ok(!('error' in read) && read.coreCompat?.includes('executeGlobalOnce'), 'readScript : relue sans VPX');
    const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Record<string, { fixes?: string }>;
    for (const table of tables) assert.equal(saved[table.toLowerCase()]?.fixes, COMPAT_FIXES.join(','));
    // Ensuite, fraîche : reprise telle quelle.
    vbs.forgetScriptCache();
    assert.ok(vbs.cachedScript(tables[1]!, dataDir)?.coreCompat?.includes('executeGlobalOnce'));
  } finally {
    vbs.forgetScriptCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
