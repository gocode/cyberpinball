// Base VPS (Virtual Pinball Spreadsheet, github.com/VirtualPinballSpreadsheet/vps-db) :
// le catalogue communautaire des jeux de flipper et de leurs recréations. On s'en
// sert pour reconnaître une table importée d'après le nom de ses fichiers et le nom
// de ROM lu dans son script : titre, fabricant, année, auteurs, identifiant VPS.
//
// Le dépôt ne déclare aucune licence : Cyber Pinball ne livre pas la base, elle est
// téléchargée au premier usage depuis son adresse officielle et gardée dans
// <racine>\downloads, comme les composants. Sans réseau, on garde le cache (ou l'on
// déduit les noms des fichiers, comme avant).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { parseTableName } from './tables';

export const VPS_DB_URL = 'https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json';
/** Date de la dernière modification de la base (millisecondes), quelques octets. */
export const VPS_UPDATED_URL = 'https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/lastUpdated.json';
export const VPS_DB_FILE = 'vpsdb.json';
const META_FILE = 'vpsdb.meta.json';

/** Au-delà, on demande à GitHub si la base a changé. */
const CHECK_EVERY_MS = 12 * 3600_000;

/** Score à partir duquel le jeu retenu n'a pas besoin d'être confirmé. */
export const VPS_CONFIDENT = 0.85;
/** Écart minimal avec le deuxième jeu pour ne pas demander. */
const VPS_MARGIN = 0.08;
/** En dessous, un jeu n'est pas proposé. */
const VPS_PROPOSE = 0.45;
/** Recherche approfondie : on montre davantage, l'utilisateur choisit sur les aperçus. */
const VPS_PROPOSE_DEEP = 0.3;
const MAX_CANDIDATES = 5;
const MAX_CANDIDATES_DEEP = 12;

export interface VpsTableFile {
  id: string;
  authors?: string[];
  version?: string;
  tableFormat?: string;
  features?: string[];
  comment?: string;
  edition?: string;
  updatedAt?: number;
  /** Vignette de la table ou du fronton sur GitHub Pages (WebP, de 352 × 626 à 1 000 × 750). */
  imgUrl?: string;
  /** Pages où se télécharge le fichier (forums, presque toujours avec un compte) ; « broken » : signalée morte. */
  urls?: VpsLink[];
  createdAt?: number;
  /** Version modifiée d'une autre version de la base (MOD). */
  parentId?: string;
}

export interface VpsLink {
  url: string;
  broken?: boolean;
}

export interface VpsGame {
  id: string;
  name: string;
  manufacturer?: string;
  year?: number;
  type?: string;
  designers?: string[];
  ipdbUrl?: string;
  tableFiles?: VpsTableFile[];
  /** Fichiers .directb2s : auteurs, version et vignette du fronton. */
  b2sFiles?: VpsTableFile[];
  /** ROM : « version » est le nom de la ROM (t2_l8). */
  romFiles?: (Omit<VpsTableFile, 'id'> & { id?: string })[];
  pupPackFiles?: VpsTableFile[];
  altSoundFiles?: VpsTableFile[];
  altColorFiles?: VpsTableFile[];
  /** Musique pour la table (souvent sur Dropbox). */
  soundFiles?: VpsTableFile[];
  topperFiles?: VpsTableFile[];
  povFiles?: VpsTableFile[];
  /** Vignette du jeu. */
  imgUrl?: string;
  theme?: string[];
  players?: number;
  /** Dernière modification de la fiche (millisecondes). */
  updatedAt?: number;
  lastCreatedAt?: number;
}

interface IndexedGame {
  game: VpsGame;
  /** Clés du nom : complet, sans article, titre principal (avant « - » ou une parenthèse). */
  aliases: { key: string; weight: number }[];
  manufacturer: string;
  roms: Set<string>;
  vpxFiles: VpsTableFile[];
  /** Initiales du titre (« gotg » pour Guardians of the Galaxy), trois caractères au moins. */
  acronyms: Set<string>;
  /** Mots du titre principal, sans les petits mots (recherche approfondie). */
  words: string[];
}

export interface VpsDb {
  games: VpsGame[];
  /** Date de la base selon VPS (lastUpdated.json), si connue. */
  updatedAt?: Date;
  /** Date du téléchargement du cache. */
  downloadedAt?: Date;
  /** Index de recherche, construit au chargement. */
  index: IndexedGame[];
}

interface Meta {
  lastUpdated?: number;
  downloadedAt?: string;
  checkedAt?: string;
}

/** Index d'une liste de jeux VPS (base téléchargée, ou jeux de test). */
export function createVpsDb(games: VpsGame[], dates: { updatedAt?: Date; downloadedAt?: Date } = {}): VpsDb {
  const valid = games.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string');
  return { games: valid, ...dates, index: valid.map(indexGame) };
}

function indexGame(game: VpsGame): IndexedGame {
  const aliases = new Map<string, number>();
  const add = (name: string, weight: number) => {
    const key = vpsKey(name);
    if (key.length >= 2 && (aliases.get(key) ?? 0) < weight) aliases.set(key, weight);
  };
  const name = game.name.trim();
  add(name, 1);
  // « The Addams Family » : les fichiers s'appellent souvent « Addams Family ».
  const noArticle = name.replace(/^(the|a|an)\s+/i, '');
  add(noArticle, 0.98);
  // « Doctor Who » s'écrit souvent « Dr. Who » dans les noms de fichiers.
  const short = name.replace(/\bDoctor\b/gi, 'Dr').replace(/\bMister\b/gi, 'Mr').replace(/\bSaint\b/gi, 'St');
  if (short !== name) add(short, 0.95);
  // « Terminator 2 - Judgment Day », « Aerosmith (Pro) » : le titre principal suffit.
  for (const main of [name.split(/\s+-\s+|:\s+/)[0]!, name.replace(/\s*\([^)]*\)\s*$/, '')]) {
    add(main, 0.97);
    add(main.replace(/^(the|a|an)\s+/i, ''), 0.96);
  }
  const vpxFiles = (game.tableFiles ?? []).filter((f) => f && (f.tableFormat ?? 'VPX').toUpperCase() === 'VPX');
  return {
    game,
    aliases: [...aliases].map(([key, weight]) => ({ key, weight })).sort((a, b) => b.key.length - a.key.length),
    manufacturer: vpsKey(game.manufacturer ?? ''),
    roms: new Set((game.romFiles ?? []).map((r) => (r.version ?? '').trim().toLowerCase()).filter(Boolean)),
    vpxFiles,
    acronyms: acronymsOf(name),
    words: vpsWords(name.replace(/\s*\([^)]*\)\s*$/, '')).filter((w) => !WORD_STOP.has(w)),
  };
}

/** Petits mots, anglais et français, sans valeur pour reconnaître un titre. */
const STOP_WORDS = new Set(['the', 'of', 'a', 'an', 'and', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'un', 'une']);
/** Pour comparer les mots : « Pinball » est dans le titre de beaucoup de jeux et de fichiers. */
const WORD_STOP = new Set([...STOP_WORDS, 'pinball']);
/**
 * Mots des noms de fichiers qui ne disent rien du jeu : auteurs collectifs, formats,
 * éditions, dossiers de PuP-Pack ou de DMD. Ni acronymes, ni mots du titre.
 */
const NOISE_WORDS = new Set([
  'vpw', 'vpx', 'vp', 'vpin', 'vpinmame', 'mod', 'fs', 'dt', 'vr', 'fss', 'pup', 'puppack', 'dmd', 'fulldmd', 'b2s', 'directb2s',
  'ultradmd', 'ultra', 'flexdmd', 'flex', 'hd', 'uvp', 'nude', 'version', 'ver', 'table', 'final', 'beta', 'alpha', 'remaster',
  'remastered', 'edition', 'ed', 'media', 'medias', 'videos', 'video', 'by', 'orig', 'original', 'fix', 'fixed', 'patch', 'rom',
  'roms', 'pack', 'sound', 'mix', 'premium', 'pro', 'le', 'new', 'update', 'updated', 'french', 'fr', 'traduction', 'en', 'english',
]);

/**
 * Mots d'un nom, pour comparer mot à mot : sans accents, casse ni ponctuation,
 * « & » vaut « and », et les noms collés sont coupés aux majuscules
 * (« TheGooniesDMD » : the, goonies, dmd).
 */
export function vpsWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Initiales d'un titre, avec et sans les petits mots : « Guardians of the Galaxy »
 * donne « gotg », « The Addams Family » donne « taf », « Teenage Mutant Ninja
 * Turtles » donne « tmnt ». Un nombre compte en entier (« t2jd »).
 */
function acronymsOf(name: string): Set<string> {
  const main = name.replace(/\s*\([^)]*\)\s*$/, '');
  const out = new Set<string>();
  for (const base of [main, main.split(/\s+-\s+|:\s+/)[0]!]) {
    const words = vpsWords(base);
    for (const list of [words, words.filter((w) => !STOP_WORDS.has(w))]) {
      if (list.length < 2) continue;
      const acronym = list.map((w) => (/^\d+$/.test(w) ? w : w[0]!)).join('');
      // « t2 » pour Terminator 2 : une lettre et un chiffre suffisent, en recherche approfondie.
      if ((acronym.length >= 3 && /[a-z].*[a-z]/.test(acronym)) || /^[a-z]\d$/.test(acronym)) out.add(acronym);
    }
  }
  return out;
}

/** Clé de comparaison : sans accents, casse, espaces ni ponctuation ; « & » vaut « and ». */
export function vpsKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

// ---------- Cache ----------

/** Base en cache dans downloads, ou undefined si elle n'a jamais été téléchargée (ou est illisible). */
export function loadVpsDb(downloadsDir: string): VpsDb | undefined {
  const file = path.join(downloadsDir, VPS_DB_FILE);
  try {
    const games = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(games)) return undefined;
    const meta = readMeta(downloadsDir);
    return createVpsDb(games as VpsGame[], {
      updatedAt: meta.lastUpdated ? new Date(meta.lastUpdated) : undefined,
      downloadedAt: meta.downloadedAt ? new Date(meta.downloadedAt) : fs.statSync(file).mtime,
    });
  } catch {
    return undefined;
  }
}

export interface VpsRefreshOptions {
  /** Pour les tests : fetch de remplacement. */
  fetch?: typeof fetch;
  now?: Date;
  /** Vérifie même si la dernière vérification est récente. */
  force?: boolean;
  /** Délai pour joindre GitHub (la base pèse environ 8 Mo). */
  timeoutMs?: number;
}

export type VpsRefreshStatus = 'fresh' | 'unchanged' | 'updated' | 'offline';

export interface VpsRefresh {
  status: VpsRefreshStatus;
  /** Raison de l'échec (sans réseau, réponse invalide…). */
  message?: string;
}

/**
 * Met à jour le cache si la base a changé. Ne lève jamais d'erreur : sans réseau, ou
 * si la réponse est invalide, le cache existant est conservé tel quel.
 */
export async function refreshVpsDb(downloadsDir: string, opts: VpsRefreshOptions = {}): Promise<VpsRefresh> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? new Date();
  const file = path.join(downloadsDir, VPS_DB_FILE);
  const meta = readMeta(downloadsDir);
  const cached = fs.existsSync(file);
  if (cached && !opts.force && meta.checkedAt && now.getTime() - Date.parse(meta.checkedAt) < CHECK_EVERY_MS) return { status: 'fresh' };
  const get = async (url: string) => {
    const response = await doFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
    if (!response.ok) throw new Error(t('HTTP {status} pour {url}', { status: response.status, url }));
    return response.text();
  };
  try {
    const remote = Number((await get(VPS_UPDATED_URL)).trim());
    const lastUpdated = Number.isFinite(remote) && remote > 0 ? remote : undefined;
    if (cached && lastUpdated && meta.lastUpdated === lastUpdated) {
      writeMeta(downloadsDir, { ...meta, checkedAt: now.toISOString() });
      return { status: 'unchanged' };
    }
    const text = await get(VPS_DB_URL);
    const games = JSON.parse(text) as unknown;
    if (!Array.isArray(games) || !games.length || !games.every((g) => g && typeof g.id === 'string' && typeof g.name === 'string')) {
      throw new Error(t('la base téléchargée n’a pas le format attendu'));
    }
    fs.mkdirSync(downloadsDir, { recursive: true });
    const part = `${file}.part`;
    fs.writeFileSync(part, text, 'utf8');
    fs.renameSync(part, file);
    writeMeta(downloadsDir, { lastUpdated, downloadedAt: now.toISOString(), checkedAt: now.toISOString() });
    return { status: 'updated' };
  } catch (error) {
    const err = error as Error;
    return { status: 'offline', message: err.name === 'TimeoutError' ? t('GitHub ne répond pas') : err.message };
  }
}

function readMeta(downloadsDir: string): Meta {
  try {
    return JSON.parse(fs.readFileSync(path.join(downloadsDir, META_FILE), 'utf8')) as Meta;
  } catch {
    return {};
  }
}

function writeMeta(downloadsDir: string, meta: Meta): void {
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.writeFileSync(path.join(downloadsDir, META_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

// ---------- Rapprochement ----------

export interface VpsMatchInput {
  /** Noms de fichiers et de dossiers de la table : .vpx, .directb2s, archive, dossier parent. */
  names: string[];
  /** Noms de ROM lus dans le script de la table. */
  roms?: string[];
}

export interface VpsCandidate {
  game: VpsGame;
  /** Entre 0 et 1. */
  score: number;
  /** Version de la table (recréation) reconnue d'après l'auteur et le numéro de version. */
  table?: VpsTableFile;
  /** Ce qui a reconnu le jeu : le titre, ses initiales, ses mots approchés, ou la ROM du script. */
  how?: VpsHow;
}

export type VpsHow = 'title' | 'acronym' | 'words' | 'rom';

export interface VpsMatch {
  /** Meilleures propositions, la plus probable d'abord. */
  candidates: VpsCandidate[];
  /** Le premier jeu est sûr : inutile de demander. */
  confident: boolean;
}

export interface VpsMatchOptions {
  /**
   * Recherche approfondie, quand le nom a été changé ou abrégé : initiales de trois
   * lettres (« TAF »), titres approchés mot à mot (« Gardiens de la galaxie »),
   * seuil plus bas et davantage de propositions. Jamais sûre à elle seule.
   */
  deep?: boolean;
  /** Nombre maximal de propositions (5, ou 12 en recherche approfondie). */
  max?: number;
}

interface ParsedName {
  /** Clé du titre (tout le nom quand il n'y a pas de parenthèse « (Fabricant Année) »). */
  title: string;
  /** Clé du nom entier, titre et reste. */
  whole: string;
  /** Ce qui suit le titre : auteur, version, « mod »… (texte brut). */
  rest: string;
  /** Nom d'origine (sans extension ni préfixe numérique). */
  raw: string;
  manufacturer?: string;
  year?: number;
  /** Mots qui peuvent être des initiales (« gotg »), sans ceux qui ne disent rien du jeu. */
  tokens: string[];
  /** Mots du titre, sans versions, années ni petits mots (recherche approfondie). */
  words: string[];
}

/** Rapproche une table importée des jeux de la base VPS. */
export function matchVps(db: VpsDb, input: VpsMatchInput, opts: VpsMatchOptions = {}): VpsMatch {
  const names = [...new Set(input.names.map(cleanName).filter(Boolean))].map(parseName);
  if (!names.length && !input.roms?.length) return { candidates: [], confident: false };
  const roms = (input.roms ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  const manufacturer = names.find((n) => n.manufacturer)?.manufacturer;
  const year = names.find((n) => n.year)?.year ?? names.map((n) => /(?:^|\D)(19[3-9]\d|20[0-4]\d)(?:\D|$)/.exec(n.rest)?.[1]).find(Boolean);
  const wantedYear = year === undefined ? undefined : Number(year);
  const deep = opts.deep === true;

  const scored: { entry: IndexedGame; score: number; table?: VpsTableFile; how: VpsHow }[] = [];
  for (const entry of db.index) {
    let title = 0;
    let how: VpsHow = 'title';
    for (const n of names) {
      const t = titleScore(entry, n);
      if (t > title) [title, how] = [t, 'title'];
      const a = acronymScore(entry, n, deep);
      if (a > title) [title, how] = [a, 'acronym'];
      // Mots approchés : plafonnés sous le seuil de confiance, c'est une piste.
      const w = deep ? 0.8 * wordScore(entry.words, n.words) : 0;
      if (w > title) [title, how] = [w, 'words'];
    }
    let score = title;
    // ROM du script : très parlante, mais certaines sont partagées entre plusieurs jeux.
    const romHit = roms.some((r) => entry.roms.has(r));
    const familyHit = !romHit && roms.some((r) => [...entry.roms].some((g) => romFamily(g) === romFamily(r)));
    if (romHit) score = title ? score + 0.15 : 0.75;
    else if (familyHit) score = title ? score + 0.05 : 0.5;
    if (!title && (romHit || familyHit)) how = 'rom';
    if (!score) continue;
    const wantedMaker = manufacturer ? vpsKey(manufacturer) : undefined;
    if (wantedMaker && entry.manufacturer) {
      score += sameMaker(wantedMaker, entry.manufacturer) ? 0.05 : -0.2;
    } else if (entry.manufacturer.length >= 4 && names.some((n) => n.whole.includes(entry.manufacturer) && !n.title.startsWith(entry.manufacturer))) {
      score += 0.05;
    }
    if (wantedYear && entry.game.year) {
      const gap = Math.abs(wantedYear - entry.game.year);
      score += gap === 0 ? 0.05 : gap === 1 ? 0 : -0.2;
    }
    // On installe des tables VPX : un jeu qui n'existe qu'en Future Pinball ou chez Zen passe après.
    if ((entry.game.tableFiles?.length ?? 0) > 0 && !entry.vpxFiles.length) score -= 0.1;
    // Auteur de la table cité dans le nom (« VPW », « g5k ») : c'est bien ce jeu.
    const table = pickTableFile(entry, names);
    if (table && title) score += 0.05;
    scored.push({ entry, score, table, how });
  }
  scored.sort((a, b) => b.score - a.score || b.entry.vpxFiles.length - a.entry.vpxFiles.length || a.entry.game.name.localeCompare(b.entry.game.name));
  const kept = scored.filter((s) => s.score >= (deep ? VPS_PROPOSE_DEEP : VPS_PROPOSE)).slice(0, opts.max ?? (deep ? MAX_CANDIDATES_DEEP : MAX_CANDIDATES));
  // Les bonus peuvent dépasser 1 : on compare avant de borner.
  const [first, second] = kept;
  const confident = Boolean(first && first.score >= VPS_CONFIDENT && (!second || first.score - second.score >= VPS_MARGIN));
  const candidates = kept.map(({ entry, score, table, how }) => ({ game: entry.game, score: round(Math.min(1, score)), table, how }));
  return { candidates, confident };
}

/**
 * Jeux de la base VPS qui ressemblent à un texte saisi par l'utilisateur : titre,
 * initiales, mots approchés, nom de ROM.
 */
export function searchVps(db: VpsDb, text: string, max = 15): VpsCandidate[] {
  const query = text.trim();
  if (!query) return [];
  const found = matchVps(db, { names: [query], roms: /^[a-z0-9]+_[a-z0-9]+$/i.test(query) ? [query] : undefined }, { deep: true, max }).candidates;
  // Un mot saisi en désigne souvent plusieurs (« medieval ») : à score voisin, le jeu le plus recréé d'abord.
  const weight = (c: VpsCandidate) => c.score + 0.02 * Math.min(5, (c.game.tableFiles ?? []).filter((f) => (f.tableFormat ?? 'VPX').toUpperCase() === 'VPX').length);
  return found.sort((a, b) => weight(b) - weight(a));
}

/**
 * Initiales du titre écrites dans le nom (« GOTG_2.1.1.vpx », « TMNT.vpx »).
 * Quatre lettres et plus : une piste sérieuse ; trois, seulement en recherche
 * approfondie, où beaucoup de jeux se partagent les mêmes.
 */
function acronymScore(entry: IndexedGame, n: ParsedName, deep: boolean): number {
  let best = 0;
  for (const token of n.tokens) {
    if (!entry.acronyms.has(token)) continue;
    if (token.length >= 4) best = Math.max(best, 0.82);
    else if (deep) best = Math.max(best, 0.7);
  }
  return best;
}

/**
 * Titre approché mot à mot : chaque mot du jeu cherche son plus proche dans le nom
 * (« galaxie » pour « galaxy », « gardiens » pour « guardians »). Le score tient
 * compte des mots du jeu retrouvés et des mots du nom employés : « Galaxy » seul ne
 * vaut pas « Guardians of the Galaxy » pour « Gardiens de la galaxie ».
 */
function wordScore(game: string[], name: string[]): number {
  if (!game.length || !name.length) return 0;
  let sum = 0;
  let letters = false;
  const used = new Set<number>();
  for (const g of game) {
    let best = 0;
    let at = -1;
    name.forEach((w, i) => {
      const d = g === w ? 1 : g.length >= 3 && w.length >= 3 ? bigramDice(g, w) : 0;
      if (d > best) [best, at] = [d, i];
    });
    if (best >= 0.5) {
      sum += best;
      used.add(at);
      letters ||= /[a-z]/.test(g);
    }
  }
  // Un numéro seul (« 2 ») ne désigne aucun jeu.
  if (!letters) return 0;
  return (sum / game.length) * (0.5 + (0.5 * used.size) / name.length);
}

/**
 * Autres éditions du même jeu chez VPS : « Guardians of the Galaxy (Pro) » et
 * « (Premium) », « Game of Thrones (Limited Edition) » et « Game of Thrones »,
 * chez le même fabricant ; ou même fiche IPDB.
 */
export function vpsSiblings(db: VpsDb, game: VpsGame): VpsGame[] {
  const key = editionKey(game.name);
  const maker = vpsKey(game.manufacturer ?? '');
  const ipdb = ipdbIdOf(game);
  return db.games.filter((g) => {
    if (g.id === game.id) return false;
    if (ipdb && ipdbIdOf(g) === ipdb) return true;
    if (key.length < 3 || editionKey(g.name) !== key) return false;
    const other = vpsKey(g.manufacturer ?? '');
    return Boolean(maker && other && sameMaker(maker, other));
  });
}

/** Titre sans l'édition : « Game of Thrones (Limited Edition) » donne « gameofthrones ». */
function editionKey(name: string): string {
  return vpsKey(
    name
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s+(pro|premium|le|limited edition|special edition|vault edition|home edition|collector'?s edition|anniversary edition)\s*$/i, ''),
  );
}

function titleScore(entry: IndexedGame, n: ParsedName): number {
  let best = 0;
  for (const { key, weight } of entry.aliases) {
    let s = 0;
    if (n.title === key) s = 1;
    // « Terminator 2 VPW 1.25 » : le titre est au début d'un nom sans parenthèses.
    else if (n.title.startsWith(key) && key.length >= 4) {
      s = key.length >= 8 ? 0.88 : 0.8;
      // « Terminator 2 VPW » n'est pas « The Terminator » : un nombre isolé après le titre en fait partie.
      if (/[a-z]$/.test(key) && numberAfter(n.raw, key)) s *= 0.9;
    }
    // « Terminator » pour « Terminator 2 - Judgment Day » : nom de fichier abrégé.
    else if (key.startsWith(n.title) && n.title.length >= 5) s = 0.6 + (0.3 * n.title.length) / key.length;
    // « JP's Terminator 2 » : préfixe d'auteur.
    else if (key.length >= 8 && n.whole.includes(key)) s = 0.75;
    else if (key.length >= 6 && n.title.length >= 6 && Math.abs(key.length - n.title.length) <= key.length / 2) {
      const dice = bigramDice(n.title, key);
      if (dice >= 0.8) s = 0.85 * dice;
    }
    best = Math.max(best, s * weight);
  }
  return best;
}

/** Version de la table d'après les auteurs et le numéro de version cités dans les noms. */
function pickTableFile(entry: IndexedGame, names: ParsedName[]): VpsTableFile | undefined {
  // Reste des noms, débarrassé du titre, du fabricant et de l'année.
  const rests = names.map((n) => {
    let rest = n.title === n.whole ? n.whole : vpsKey(n.rest);
    if (n.title === n.whole) {
      const alias = entry.aliases.find((a) => rest.startsWith(a.key)) ?? entry.aliases.find((a) => rest.includes(a.key));
      if (alias) rest = rest.replace(alias.key, '');
    }
    return rest.replace(entry.manufacturer || '\u0000', '').replace(String(entry.game.year ?? '\u0000'), '');
  });
  // Version : celle du premier nom qui en donne une (le .vpx passe avant le backglass).
  const versions = new Set(
    names.map((n) => [...n.rest.matchAll(/v?(\d+(?:[._]\d+)+[a-z]?|\d+(?=\D*$))/gi)].map((m) => normVersion(m[1]!))).find((v) => v.length) ?? [],
  );
  const words = new Set(names.flatMap((n) => n.rest.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));
  const mod = words.has('mod') || names.some((n) => /mod\b/i.test(n.rest));
  const sameVersion = (file: VpsTableFile) => Boolean(file.version && versions.has(normVersion(file.version)));
  let best: { file: VpsTableFile; score: number } | undefined;
  for (const file of entry.vpxFiles) {
    let score = 0;
    for (const author of file.authors ?? []) {
      // « Bigus » pour « Bigus1 » : le chiffre final est souvent omis.
      const keys = new Set([vpsKey(author), vpsKey(author).replace(/\d+$/, '')].filter((k) => k.length >= 2));
      if ([...keys].some((k) => words.has(k) || (k.length >= 3 && rests.some((r) => r.includes(k))))) score += 2;
    }
    // Sans auteur cité, seule une version que personne d'autre n'a désigne la table :
    // beaucoup de tables sont en version 1.0.
    if (!score && !(sameVersion(file) && entry.vpxFiles.filter(sameVersion).length === 1)) continue;
    if (sameVersion(file)) score += 1.5;
    const isMod = (file.features ?? []).some((f) => f.toUpperCase() === 'MOD');
    if (isMod) score += mod ? 0.5 : -0.5;
    if (!best || score > best.score || (score === best.score && (file.updatedAt ?? 0) > (best.file.updatedAt ?? 0))) {
      best = { file, score };
    }
  }
  return best?.file;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\.(vpx|directb2s|zip|7z|rar|vbs|ini|pov|info)$/i, '')
    .replace(/^\d{6,}_/, '')
    .trim();
}

function parseName(name: string): ParsedName {
  const parsed = parseTableName(name);
  const spaced = (s: string) => s.replace(/_/g, ' ');
  const tokens = vpsWords(name).filter((w) => ((w.length >= 3 && /[a-z].*[a-z]/.test(w)) || /^[a-z]\d$/.test(w)) && !NOISE_WORDS.has(w) && !STOP_WORDS.has(w));
  // Le titre seul quand le nom donne « (Fabricant Année) » ; sinon le nom sans versions ni années.
  const titleText = parsed.manufacturer ? parsed.title : spaced(name).replace(/\bv?\d+(?:\.\d+)+[a-z]?\b/gi, ' ');
  const words = vpsWords(titleText).filter((w) => !WORD_STOP.has(w) && !NOISE_WORDS.has(w) && !/^(19|20)\d\d$/.test(w));
  if (parsed.manufacturer) {
    return {
      title: vpsKey(spaced(parsed.title)),
      whole: vpsKey(spaced(name)),
      rest: parsed.rest ?? '',
      raw: name,
      manufacturer: parsed.manufacturer,
      year: parsed.year,
      tokens,
      words,
    };
  }
  const key = vpsKey(spaced(name));
  return { title: key, whole: key, rest: name, raw: name, tokens, words };
}

/** Le nom commence par ce titre suivi d'un nombre isolé (« Terminator 2 », pas « Terminator 1.0 »). */
function numberAfter(raw: string, key: string): boolean {
  const letters = key.split('').join('[^a-z0-9]*');
  return new RegExp(`^[^a-z0-9]*${letters}[^a-z0-9]*\\d{1,4}(?![._]?\\d|[a-z])`, 'i').test(
    raw.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and'),
  );
}

function sameMaker(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

/** « t2_l8 » et « t2_l6 » sont deux révisions de la même ROM. */
function romFamily(rom: string): string {
  const i = rom.indexOf('_');
  return i >= 2 ? rom.slice(0, i) : rom;
}

function normVersion(v: string): string {
  return v
    .toLowerCase()
    .replace(/^v/, '')
    .replace(/_/g, '.')
    .replace(/(\.0)+$/, '');
}

function bigramDice(a: string, b: string): number {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  return (2 * common) / Math.max(1, a.length - 1 + b.length - 1);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Identifiant IPDB d'après l'adresse donnée par VPS. */
export function ipdbIdOf(game: VpsGame): string | undefined {
  return /[?&]id=(\d+)/.exec(game.ipdbUrl ?? '')?.[1];
}

/** « Terminator 2 - Judgment Day (Williams 1991) », pour l'affichage. */
export function vpsLabel(game: VpsGame): string {
  const suffix = [game.manufacturer, game.year].filter(Boolean).join(' ');
  return suffix ? `${game.name} (${suffix})` : game.name;
}
