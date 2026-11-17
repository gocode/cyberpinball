// Lecture du script d'une table avec VPinballX -ExtractVBS, pour connaître le
// nom de sa ROM. Attention : la commande écrit un .vbs à côté de la table, et un
// .vbs nommé comme une table REMPLACE son script quand VPX la charge. On ne la
// lance donc jamais sur la table elle-même : on travaille sur un lien physique
// (ou une copie) dans un dossier temporaire, supprimé aussitôt après.
// Comportement observé sur VPX 10.8.1-5436 : environ 1 s, code 0, la table
// n'est pas modifiée ; VPX écrit aussi un fichier de réglages complet là où -Ini
// le désigne, d'où un -Ini temporaire pour ne pas toucher au vrai.
// Le script dit aussi quel PuP-Pack la table charge (B2SInit, Init).
// Une table d'un autre émulateur (fiche .pinballfx) n'a pas de script : ses faits
// sont vides (ni ROM ni PuP-Pack), sans lancer VPX ni la compter comme illisible.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readVpxScript, saveOrWarn, scriptFacts, t, writeFileAtomic, type ScriptFacts } from '@cyberpinball/core';

export type ScriptResult = ScriptFacts | { error: string };

interface CacheEntry {
  size: number;
  mtimeMs: number;
  facts: ScriptFacts;
  /** Version de la lecture : une entrée plus ancienne est relue (2 : dossier DMD, 3 : appels PuP, 4 : interrupteur du PuP, 5 : DMD dessiné par la table, 6 : interrupteur relayé par une autre variable et PuP-DMD, 7 : nom du jeu pour B2S et déclencheurs D envoyés par le script, 8 : ce que le core.vbs actuel refuse, 9 : musique jouée par PlayMusic). */
  v?: number;
}

const FACTS_VERSION = 9;

function fresh(entry: CacheEntry | undefined, stat: fs.Stats): entry is CacheEntry {
  return Boolean(entry && entry.v === FACTS_VERSION && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs);
}

const TIMEOUT_MS = 60_000;

/** Faits d'une table sans script VPX : rien à charger. */
const NO_SCRIPT: ScriptFacts = scriptFacts('');

function isVpxFile(table: string): boolean {
  return /\.vpx$/i.test(table);
}

/** Lit (ou reprend du cache) ce que le script d'une table dit de sa ROM. */
export async function readScript(exe: string, table: string, dataDir: string): Promise<ScriptResult> {
  if (!isVpxFile(table)) return NO_SCRIPT;
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
    if (!fs.existsSync(vbs)) return fromTable(t('VPX n’a pas extrait le script de la table.'));
    return remember(scriptFacts(fs.readFileSync(vbs, 'latin1')));
  } catch (error) {
    return fromTable((error as Error).message);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  function remember(facts: ScriptFacts): ScriptFacts {
    cache[key] = { size: stat.size, mtimeMs: stat.mtimeMs, facts, v: FACTS_VERSION };
    saveCache(cacheFile, cache);
    return facts;
  }

  // VPX n'a pas rendu le script (lancement impossible, plantage, rien d'extrait) : celui écrit
  // dans le .vpx, relu sans VPX (même texte que -ExtractVBS). Un script protégé reste illisible.
  function fromTable(error: string): ScriptResult {
    const text = readVpxScript(table);
    return text === undefined ? { error } : remember(scriptFacts(text));
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

/**
 * scripts.json déjà lu, par fichier, avec sa taille et sa date : relu seulement s'il a changé sur le
 * disque. `cachedScript` est appelé pour chaque table, en boucle (santé, musique des ROM, médecin) :
 * relire et analyser tout le fichier à chaque appel faisait croître le coût comme le carré du nombre
 * de tables (17/11/2026). Le même objet sert à tous les appels : deux lectures de scripts en cours en
 * même temps ne s'effacent plus l'une l'autre en l'enregistrant.
 */
const loaded = new Map<string, { size: number; mtimeMs: number; cache: Record<string, CacheEntry> }>();

function loadCache(file: string): Record<string, CacheEntry> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    // Pas encore de fichier : un objet gardé, que le premier enregistrement écrira.
    const known = loaded.get(file);
    if (known && known.size === -1) return known.cache;
    const cache: Record<string, CacheEntry> = {};
    loaded.set(file, { size: -1, mtimeMs: -1, cache });
    return cache;
  }
  const known = loaded.get(file);
  if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.cache;
  let cache: Record<string, CacheEntry>;
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CacheEntry>;
  } catch {
    cache = {};
  }
  loaded.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, cache });
  return cache;
}

/** Un cache refusé (fichier tenu un instant, disque plein) ne fait jamais échouer la lecture du script. */
function saveCache(file: string, cache: Record<string, CacheEntry>): void {
  saveOrWarn(file, () => writeFileAtomic(file, JSON.stringify(cache, null, 2) + '\n'));
  try {
    const stat = fs.statSync(file);
    loaded.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, cache });
  } catch {
    loaded.delete(file);
  }
}

/** Oublie les scripts.json déjà lus (essais). */
export function forgetScriptCache(): void {
  loaded.clear();
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
  if (!isVpxFile(table)) return NO_SCRIPT;
  const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
  const cache = loadCache(cacheFile);
  const entry: CacheEntry | undefined = cache[table.toLowerCase()];
  try {
    const stat = fs.statSync(table);
    const old = entry !== undefined && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs ? entry : undefined;
    if (fresh(entry, stat)) return entry.facts;
    // Lecture d'une version précédente pour la même table : relue dans le .vpx, sans lancer
    // VPX (même texte que -ExtractVBS). Sans elle, la santé de la borne et la préparation des
    // parties ne verraient pas ce qu'on sait lire depuis (interrupteur relayé des Goonies).
    if (old) {
      const text = readVpxScript(table);
      // Script protégé : l'ancienne lecture sert encore (la ROM y est).
      if (text === undefined) return old.facts;
      const facts = scriptFacts(text);
      cache[table.toLowerCase()] = { size: stat.size, mtimeMs: stat.mtimeMs, facts, v: FACTS_VERSION };
      saveCache(cacheFile, cache);
      return facts;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
