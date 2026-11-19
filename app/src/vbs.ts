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
import { COMPAT_FIXES, readVpxScript, saveOrWarn, scriptFacts, t, writeFileAtomic, type ScriptFacts } from '@cyberpinball/core';

export type ScriptResult = ScriptFacts | { error: string };

interface CacheEntry {
  size: number;
  mtimeMs: number;
  facts: ScriptFacts;
  /** Version de la lecture : une entrée plus ancienne est relue (2 : dossier DMD, 3 : appels PuP, 4 : interrupteur du PuP, 5 : DMD dessiné par la table, 6 : interrupteur relayé par une autre variable et PuP-DMD, 7 : nom du jeu pour B2S et déclencheurs D envoyés par le script, 8 : ce que le core.vbs actuel refuse, 9 : musique jouée par PlayMusic, 10 : options de table du DMD, 11 : pièce VR, 13 : dossier du DMD nommé par une variable, « DirName = curDir & … », 14 : musique nommée par une variable ou jouée par une procédure du script). */
  v?: number;
  /** Correctifs de script que la lecture savait repérer (COMPAT_FIXES) : une lecture d'avant un correctif est refaite. */
  fixes?: string;
}

const FACTS_VERSION = 14;
/** Un correctif de script ajouté rend les lectures plus anciennes périmées, sans numéro à penser à changer. */
const FACTS_FIXES = COMPAT_FIXES.join(',');

function fresh(entry: CacheEntry | undefined, stat: fs.Stats): entry is CacheEntry {
  return Boolean(entry && entry.v === FACTS_VERSION && entry.fixes === FACTS_FIXES && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs);
}

/** Une entrée pour ce fichier tel qu'il est, faite par cette version de la lecture. */
function cacheEntry(stat: fs.Stats, facts: ScriptFacts): CacheEntry {
  return { size: stat.size, mtimeMs: stat.mtimeMs, facts, v: FACTS_VERSION, fixes: FACTS_FIXES };
}

/** Lecture d'une version précédente pour la même table, sans changement du fichier. */
function sameFile(entry: CacheEntry | undefined, stat: fs.Stats): CacheEntry | undefined {
  return entry && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs ? entry : undefined;
}

const TIMEOUT_MS = 60_000;

/** Faits d'une table sans script VPX : rien à charger. */
const NO_SCRIPT: ScriptFacts = scriptFacts('');

function isVpxFile(table: string): boolean {
  return /\.vpx$/i.test(table);
}

/** Lit (ou reprend du cache) ce que le script d'une table dit de sa ROM. */
export async function readScript(exe: string | undefined, table: string, dataDir: string): Promise<ScriptResult> {
  if (!isVpxFile(table)) return NO_SCRIPT;
  const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
  const cache = loadCache(cacheFile);
  const stat = fs.statSync(table);
  const key = table.toLowerCase();
  const cached = cache[key];
  if (fresh(cached, stat)) return withPlayedScript(table, cached.facts);
  // Lecture d'une version précédente, table inchangée : relue dans le .vpx sans lancer VPX (même texte que
  // -ExtractVBS). Sans cela, chaque nouvelle lecture relançait VPX une seconde par table.
  const previous = sameFile(cache[key], stat);
  if (previous) {
    const text = readVpxScript(table);
    if (text === undefined) return withPlayedScript(table, previous.facts);
    return remember(scriptFacts(text));
  }
  // Pas de VPX pour extraire le script (pas encore installé) : celui écrit dans le .vpx, lu sans lui.
  if (!exe) return fromTable(t('VPX n’est pas installé : le script n’a pas pu être lu.'));

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

  /** Le cache garde ce que dit le .vpx ; le .vbs posé à côté s'y ajoute à chaque lecture (withPlayedScript). */
  function remember(facts: ScriptFacts): ScriptFacts {
    cache[key] = cacheEntry(stat, facts);
    saveCache(cacheFile, cache);
    return withPlayedScript(table, facts);
  }

  // VPX n'a pas rendu le script (lancement impossible, plantage, rien d'extrait) : celui écrit
  // dans le .vpx, relu sans VPX (même texte que -ExtractVBS). Un script protégé reste illisible.
  function fromTable(error: string): ScriptResult {
    const text = readVpxScript(table);
    if (text !== undefined) return remember(scriptFacts(text));
    // Script du .vpx protégé, mais un .vbs à côté que VPX joue à sa place : c'est lui qui dit la ROM.
    const played = withPlayedScript(table, NO_SCRIPT);
    return played === NO_SCRIPT ? { error } : played;
  }
}

/** .vbs déjà lus à côté des tables : relus seulement s'ils ont changé (cachedScript est appelé en boucle). */
const playedScripts = new Map<string, { size: number; mtimeMs: number; facts: ScriptFacts }>();

/**
 * VPX joue le .vbs nommé comme la table, posé à côté d'elle, À LA PLACE du script écrit dans le .vpx :
 * correctif de l'auteur, script d'une installation reprise (PinUP Popper en pose souvent), .vbs de
 * Cyber Pinball. C'est donc lui qui dit si la table charge une ROM, et laquelle : lire le .vpx seul
 * cherchait une ROM que la table ne charge pas (17/11/2026, tables reprises « sans ROM »).
 * Le reste (PuP, DMD, musique) vient toujours du .vpx, d'où le .vbs de Cyber Pinball est tiré.
 */
export function withPlayedScript(table: string, facts: ScriptFacts): ScriptFacts {
  if (!isVpxFile(table)) return facts;
  const file = table.replace(/\.vpx$/i, '.vbs');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) return facts;
  } catch {
    return facts;
  }
  const key = file.toLowerCase();
  let known = playedScripts.get(key);
  if (!known || known.size !== stat.size || known.mtimeMs !== stat.mtimeMs) {
    let played: ScriptFacts;
    try {
      played = scriptFacts(fs.readFileSync(file, 'latin1'));
    } catch {
      return facts;
    }
    known = { size: stat.size, mtimeMs: stat.mtimeMs, facts: played };
    playedScripts.set(key, known);
  }
  const played = known.facts;
  // Nom de ROM calculé dans le .vbs, clair dans le .vpx : celui du .vpx, c'est la même table.
  const roms = played.roms.length || !facts.usesPinmame ? played.roms : facts.roms;
  if (played.usesPinmame === facts.usesPinmame && sameNames(roms, facts.roms)) return facts;
  return { ...facts, usesPinmame: played.usesPinmame, roms: played.usesPinmame ? roms : [] };
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((n, i) => n.toLowerCase() === b[i]!.toLowerCase());
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

/** Oublie les scripts.json et les .vbs déjà lus (essais). */
export function forgetScriptCache(): void {
  loaded.clear();
  playedScripts.clear();
}

/**
 * Reporte la lecture d'un script sur le chemin d'arrivée d'une table importée. `facts` peut venir
 * d'un .vbs voisin (withPlayedScript) : il arrive avec la table, les deux disent la même ROM.
 */
export function rememberScript(table: string, facts: ScriptFacts, dataDir: string): void {
  const cacheFile = path.join(dataDir, 'cache', 'scripts.json');
  const cache = loadCache(cacheFile);
  const stat = fs.statSync(table);
  cache[table.toLowerCase()] = cacheEntry(stat, facts);
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
    const old = sameFile(entry, stat);
    if (fresh(entry, stat)) return withPlayedScript(table, entry.facts);
    // Lecture d'une version précédente pour la même table : relue dans le .vpx, sans lancer
    // VPX (même texte que -ExtractVBS). Sans elle, la santé de la borne et la préparation des
    // parties ne verraient pas ce qu'on sait lire depuis (interrupteur relayé des Goonies).
    if (old) {
      const text = readVpxScript(table);
      // Script protégé : l'ancienne lecture sert encore (la ROM y est).
      if (text === undefined) return withPlayedScript(table, old.facts);
      const facts = scriptFacts(text);
      cache[table.toLowerCase()] = cacheEntry(stat, facts);
      saveCache(cacheFile, cache);
      return withPlayedScript(table, facts);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
