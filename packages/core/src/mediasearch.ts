// Recherche approfondie du jeu d'une table, pour ses médias : quand le .info n'a pas
// d'identifiant VPS et que le nom a été changé, abrégé ou traduit (« GOTG_2.1.1.vpx »,
// « Gardiens de la galaxie »), on rassemble tous les indices que la table donne
// d'elle-même et on les confronte un par un à la base VPS :
//
// - le titre, le fabricant et l'année du .info ;
// - le nom du .vpx, du dossier et du .directb2s ;
// - les informations écrites dans la table par son auteur (vpxinfo.ts) : nom interne,
//   auteur et version (qui désignent la recréation chez VPS), numéro IPDB cité dans
//   la description ;
// - le nom de la ROM, du PuP-Pack et du dossier FlexDMD ou UltraDMD lus dans le script ;
// - un texte saisi par l'utilisateur.
//
// Chaque piste garde ses raisons, en clair, pour que l'utilisateur juge sur pièces ;
// plusieurs indices qui désignent le même jeu le font monter. Les autres éditions
// d'un jeu retenu (Pro, Premium, LE) suivent : elles ont souvent les mêmes images.

import * as path from 'node:path';
import type { MediaDb, MediaDbCandidate } from './mediadb';
import type { TableEntry } from './tables';
import type { VpxTableInfo } from './vpxinfo';
import { ipdbIdOf, matchVps, searchVps, vpsKey, vpsLabel, vpsSiblings, type VpsDb, type VpsGame, type VpsHow } from './vps';

export type ClueKind = 'info' | 'vpx-file' | 'folder' | 'b2s-file' | 'vpx-info' | 'pup' | 'dmd-folder' | 'query';

/** Un indice sur le jeu : un nom, et d'où il vient. */
export interface TableClue {
  kind: ClueKind;
  text: string;
}

const CLUE_LABELS: Record<ClueKind, string> = {
  info: 'titre de la fiche',
  'vpx-file': 'nom du fichier .vpx',
  folder: 'nom du dossier',
  'b2s-file': 'nom du .directb2s',
  'vpx-info': 'nom écrit dans la table par son auteur',
  pup: 'nom du PuP-Pack',
  'dmd-folder': 'dossier du DMD',
  query: 'recherche saisie',
};

/** Ce que la table dit d'elle-même, au-delà de son nom : lu dans le .vpx et dans son script. */
export interface TableEvidence {
  /** Informations écrites dans la table (readVpxTableInfo). */
  vpxInfo?: VpxTableInfo;
  /** Ce que le script dit de la ROM, du PuP-Pack et du DMD (ScriptFacts). */
  script?: { roms: string[]; dmdFolder?: string; pup?: { packNames: string[] } };
  /** Nom du .directb2s de la table. */
  backglass?: string;
  /** Dossiers de pupvideos à côté de la table. */
  pupDirs?: string[];
}

/** Indices de la table, sans doublons, dans l'ordre de confiance. */
export function tableClues(table: TableEntry, evidence: TableEvidence = {}): TableClue[] {
  const out: TableClue[] = [];
  const add = (kind: ClueKind, text: string | undefined) => {
    const t = text?.trim();
    if (!t || t.length < 2 || out.some((c) => vpsKey(c.text) === vpsKey(t))) return;
    out.push({ kind, text: t });
  };
  add('vpx-info', evidence.vpxInfo?.name);
  add('info', table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title);
  add('vpx-file', path.basename(table.file).replace(/\.vpx$/i, ''));
  if (table.id.includes('/')) add('folder', path.basename(table.folder));
  add('b2s-file', evidence.backglass?.replace(/\.directb2s$/i, ''));
  for (const p of [...(evidence.script?.pup?.packNames ?? []), ...(evidence.pupDirs ?? [])]) add('pup', p);
  add('dmd-folder', evidence.script?.dmdFolder?.replace(/[._ -]?(ultradmd|flexdmd)$/i, '').replace(/dmd$/i, ''));
  return out;
}

/** Un jeu possible pour la table, et pourquoi. */
export interface GameLead {
  game: VpsGame;
  /** Entre 0 et 1 ; plusieurs indices d'accord font monter le score. */
  score: number;
  /** Raisons en clair : « nom écrit dans la table par son auteur : “Guardians Of The Galaxy” ». */
  reasons: string[];
  /** Autre édition d'un jeu trouvé (Pro, Premium, LE) : rien ne le désigne directement. */
  siblingOf?: string;
  /** Recréation de ce jeu chez VPS dont l'auteur (et la version) sont ceux de la table. */
  tableFileId?: string;
  /** La recherche saisie par l'utilisateur désigne ce jeu. */
  matchedQuery?: boolean;
}

export interface DeepSearchOptions {
  /** Identifiant VPS lu dans le .info : le jeu est connu, on cherche ses autres éditions. */
  vpsId?: string;
  /** Texte saisi par l'utilisateur. */
  query?: string;
  max?: number;
}

const HOW_LABELS: Record<VpsHow, string> = {
  title: 'titre',
  acronym: 'initiales',
  words: 'mots proches',
  rom: 'ROM',
};

const MAX_LEADS = 12;
/** Indices qui sont des noms donnés à la main ou recopiés : ils comptent ensemble pour un. */
const NAME_CLUES = new Set<string>(['info', 'vpx-file', 'folder', 'b2s-file', 'query']);

/**
 * Jeux possibles pour une table, le plus probable d'abord, chacun avec ses raisons.
 * Pour chaque indice, la base VPS est interrogée en recherche approfondie ; s'y
 * ajoutent la ROM du script, le numéro IPDB cité par l'auteur, l'auteur et la version
 * de la table (qui désignent une recréation précise chez VPS), puis les autres
 * éditions des meilleurs jeux.
 */
export function deepSearchGames(vps: VpsDb, table: TableEntry, evidence: TableEvidence = {}, opts: DeepSearchOptions = {}): GameLead[] {
  const leads = new Map<string, { game: VpsGame; best: number; hits: Set<string>; reasons: string[]; tableFileId?: string; siblingOf?: string }>();
  const hit = (game: VpsGame, score: number, source: string, reason: string) => {
    let lead = leads.get(game.id);
    if (!lead) leads.set(game.id, (lead = { game, best: 0, hits: new Set(), reasons: [] }));
    lead.best = Math.max(lead.best, score);
    lead.hits.add(source);
    if (!lead.reasons.includes(reason)) lead.reasons.push(reason);
  };

  if (opts.vpsId) {
    const game = vps.games.find((g) => g.id === opts.vpsId);
    if (game) hit(game, 1, 'vps-id', `identifiant VPS du .info (${opts.vpsId})`);
  }
  const query = opts.query?.trim();
  if (query) {
    for (const c of searchVps(vps, query)) hit(c.game, c.score, 'query', `recherche « ${query} » (${HOW_LABELS[c.how ?? 'title']})`);
  }
  for (const clue of tableClues(table, evidence)) {
    for (const c of matchVps(vps, { names: [clue.text] }, { deep: true }).candidates) {
      hit(c.game, c.score, clue.kind, `${HOW_LABELS[c.how ?? 'title']} : ${CLUE_LABELS[clue.kind]}, « ${clue.text} »`);
    }
  }
  const roms = evidence.script?.roms ?? [];
  if (roms.length) {
    for (const c of matchVps(vps, { names: [], roms }, { deep: true }).candidates) hit(c.game, c.score, 'rom', `ROM du script : ${roms.join(', ')}`);
  }
  // L'auteur cite souvent la fiche IPDB dans la description : « IPDB No. 2524 ».
  for (const id of ipdbIdsIn(evidence.vpxInfo)) {
    for (const game of vps.games.filter((g) => ipdbIdOf(g) === id)) hit(game, 0.95, 'ipdb', `fiche IPDB n° ${id} citée par l’auteur de la table`);
  }
  // Auteur et version de la table : la recréation exacte chez VPS, donc son jeu.
  const authors = authorKeys(evidence.vpxInfo?.author);
  if (authors.length) {
    const version = normVersion(evidence.vpxInfo?.version ?? '');
    for (const game of vps.games) {
      for (const file of game.tableFiles ?? []) {
        if (!(file.authors ?? []).some((a) => authors.includes(vpsKey(a)))) continue;
        const sameVersion = Boolean(version && file.version && normVersion(file.version) === version);
        const known = leads.get(game.id);
        // L'auteur seul fait de nombreuses tables : il confirme un jeu déjà trouvé ; avec la version, c'est une piste
        // faible (beaucoup de tables sont en 1.0 ou 2.0).
        if (!known && !sameVersion) continue;
        hit(game, sameVersion ? 0.4 : 0, 'author', `table de ${evidence.vpxInfo!.author}${sameVersion ? `, version ${evidence.vpxInfo!.version}` : ''} chez VPS`);
        const lead = leads.get(game.id)!;
        if (sameVersion || !lead.tableFileId) lead.tableFileId = file.id;
      }
    }
  }

  // Plusieurs indices indépendants d'accord : chacun en plus ajoute un peu. Les noms
  // (fiche, .vpx, dossier, .directb2s) se recopient souvent l'un l'autre : un seul indice.
  const families = (hits: Set<string>) => new Set([...hits].map((h) => (NAME_CLUES.has(h) ? 'names' : h))).size;
  const scored = [...leads.values()].map((l) => ({ ...l, raw: l.best + 0.05 * (families(l.hits) - 1) }));
  scored.sort((a, b) => b.raw - a.raw || b.hits.size - a.hits.size || a.game.name.localeCompare(b.game.name));
  const max = opts.max ?? MAX_LEADS;
  const out: GameLead[] = scored.slice(0, max).map((l) => ({
    game: l.game,
    score: round(Math.min(1, l.raw)),
    reasons: l.reasons,
    tableFileId: l.tableFileId,
    matchedQuery: l.hits.has('query') || undefined,
  }));
  // Autres éditions des jeux sérieux, juste après eux.
  for (const lead of [...out]) {
    if (lead.score < 0.5) continue;
    for (const sibling of vpsSiblings(vps, lead.game)) {
      if (out.some((o) => o.game.id === sibling.id)) continue;
      out.push({ game: sibling, score: round(Math.max(0, lead.score - 0.1)), reasons: [`autre édition de ${vpsLabel(lead.game)}`], siblingOf: lead.game.id });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, max);
}

/** Pistes qui ont des médias sur VPinMediaDB, dans le même ordre. */
export function mediaDbLeads(db: MediaDb, leads: GameLead[]): (MediaDbCandidate & { lead: GameLead })[] {
  return leads.flatMap((lead) => {
    const entry = db.entries.get(lead.game.id);
    return entry ? [{ entry, game: lead.game, lead }] : [];
  });
}

/** Numéros IPDB cités dans les informations de la table : « IPDB No. 2524 », « ipdb.org/machine.cgi?id=2524 ». */
export function ipdbIdsIn(info: VpxTableInfo | undefined): string[] {
  const text = [info?.description, info?.blurb, info?.rules, info?.website].filter(Boolean).join('\n');
  const ids = new Set<string>();
  for (const m of text.matchAll(/IPDB\s*(?:No\.?|n°|#|number|:)?\s*(\d{1,5})\b/gi)) ids.add(m[1]!);
  for (const m of text.matchAll(/ipdb\.org\/machine\.cgi\?id=(\d{1,5})/gi)) ids.add(m[1]!);
  return [...ids];
}

/** « g5k / VPW », « skillman, VPW » : chaque auteur en clé, sans les collectifs trop fréquents. */
function authorKeys(author: string | undefined): string[] {
  if (!author) return [];
  return author
    .split(/[,/&+;]|\band\b|\bet\b/i)
    .map((a) => vpsKey(a))
    .filter((k) => k.length >= 3 && k !== 'vpw');
}

function normVersion(v: string): string {
  return v.toLowerCase().replace(/^v/, '').replace(/_/g, '.').replace(/(\.0)+$/, '').trim();
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
