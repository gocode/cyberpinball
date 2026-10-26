// Lecture du script d'une table avec VPinballX -ExtractVBS, pour connaître le
// nom de sa ROM. Attention : la commande écrit un .vbs à côté de la table, et un
// .vbs nommé comme une table REMPLACE son script quand VPX la charge. On ne la
// lance donc jamais sur la table elle-même : on travaille sur un lien physique
// (ou une copie) dans un dossier temporaire, supprimé aussitôt après.
// Comportement observé sur VPX 10.8.1-5436 : environ 1 s, code 0, la table
// n'est pas modifiée ; VPX écrit aussi un fichier de réglages complet là où -Ini
// le désigne, d'où un -Ini temporaire pour ne pas toucher au vrai.
// Le script dit aussi quel PuP-Pack la table charge (B2SInit, Init).

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scriptFacts, t, type ScriptFacts } from '@cyberpinball/core';

export type ScriptResult = ScriptFacts | { error: string };

interface CacheEntry {
  size: number;
  mtimeMs: number;
  facts: ScriptFacts;
  /** Version de la lecture : une entrée plus ancienne est relue (2 : dossier DMD, 3 : appels PuP, 4 : interrupteur du PuP, 5 : DMD dessiné par la table). */
  v?: number;
}

const FACTS_VERSION = 5;

function fresh(entry: CacheEntry | undefined, stat: fs.Stats): entry is CacheEntry {
  return Boolean(entry && entry.v === FACTS_VERSION && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs);
}

const TIMEOUT_MS = 60_000;

/** Lit (ou reprend du cache) ce que le script d'une table dit de sa ROM. */
export async function readScript(exe: string, table: string, dataDir: string): Promise<ScriptResult> {
  const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
  const cache = loadCache(cacheFile);
  const stat = fs.statSync(table);
  const key = table.toLowerCase();
  const cached = cache[key];
  if (fresh(cached, stat)) return cached.facts;

  fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
  const work = fs.mkdtempSync(path.join(dataDir, 'cache', 'script-'));
  try {
    const copy = path.join(work, 'table.vpx');
    try {
      fs.linkSync(table, copy);
    } catch {
      // Autre disque (clé USB) : un lien physique est impossible, on copie.
      fs.copyFileSync(table, copy);
    }
    await run(exe, ['-Ini', path.join(work, 'VPinballX.ini'), '-ExtractVBS', copy]);
    const vbs = path.join(work, 'table.vbs');
    if (!fs.existsSync(vbs)) return { error: t('VPX n’a pas extrait le script de la table.') };
    const facts = scriptFacts(fs.readFileSync(vbs, 'latin1'));
    cache[key] = { size: stat.size, mtimeMs: stat.mtimeMs, facts, v: FACTS_VERSION };
    saveCache(cacheFile, cache);
    return facts;
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function run(exe: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(t('VPX ne s’est pas terminé après {n} s.', { n: TIMEOUT_MS / 1000 })));
    }, TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(t('VPX s’est terminé avec le code {code}.', { code: String(code) })));
    });
  });
}

function loadCache(file: string): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function saveCache(file: string, cache: Record<string, CacheEntry>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Reporte la lecture d'un script sur le chemin d'arrivée d'une table importée. */
export function rememberScript(table: string, facts: ScriptFacts, dataDir: string): void {
  const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
  const cache = loadCache(cacheFile);
  const stat = fs.statSync(table);
  cache[table.toLowerCase()] = { size: stat.size, mtimeMs: stat.mtimeMs, facts, v: FACTS_VERSION };
  saveCache(cacheFile, cache);
}

/**
 * Script déjà lu, sans lancer VPX (undefined si inconnu ou si la table a changé).
 * Une lecture d'une version précédente sert encore : la ROM y est, seuls les appels PuP manquent.
 */
export function cachedScript(table: string, dataDir: string): ScriptFacts | undefined {
  const entry = loadCache(path.join(dataDir, 'cache', 'scripts.json'))[table.toLowerCase()];
  try {
    const stat = fs.statSync(table);
    return fresh(entry, stat) ? entry.facts : undefined;
  } catch {
    return undefined;
  }
}
