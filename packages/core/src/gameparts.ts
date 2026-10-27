// Parties d'un jeu installé, pour l'écran « Parties du jeu » de la fiche : ce que le dossier
// de la table contient déjà, partie par partie (table, fronton, ROM, PuP-Pack, couleurs du
// DMD, sons, musique, point de vue, réglages propres, médias du menu), d'après l'inventaire
// des fichiers (tablecontents.ts). Les parties sont celles de la liste d'attente
// (acquisition.ts, NeedKind), plus les réglages propres de la table (.ini), que VPS ne liste pas.

import { liveLinks, NEED_LABELS, partFiles, tableSourceOf, type NeedKind } from './acquisition';
import { t } from './i18n';
import { deepSearchGames, type GameLead, type TableEvidence } from './mediasearch';
import { hitGameName, siteQuery, siteSearchText, type MediaSiteId, type SiteHit } from './mediasites';
import type { TableContents, TableFileEntry } from './tablecontents';
import type { FileKind } from './tablefiles';
import type { TableEntry, TableInfoFile } from './tables';
import { matchVps, vpsKey, type VpsDb, type VpsGame } from './vps';

export type GamePart = NeedKind | 'ini';

/** Parties montrées pour une table installée, dans l'ordre de l'écran. Le topper, sans dossier à lui, n'y est pas. */
export const GAME_PARTS: readonly GamePart[] = ['table', 'b2s', 'rom', 'pup', 'altcolor', 'altsound', 'music', 'pov', 'ini', 'media'];

/** « PuP-Pack », « Réglages propres (.ini) » */
export function partLabel(part: GamePart): string {
  return part === 'ini' ? t('Réglages propres (.ini)') : NEED_LABELS[part];
}

const FROM_FILE_KIND: Partial<Record<FileKind, GamePart>> = {
  table: 'table',
  backglass: 'b2s',
  rom: 'rom',
  pup: 'pup',
  serum: 'altcolor',
  vni: 'altcolor',
  altsound: 'altsound',
  music: 'music',
  pov: 'pov',
  tableIni: 'ini',
  media: 'media',
};

/** Partie d'un jeu à laquelle appartient un fichier du dossier de la table ; undefined : aucune (script, sauvegarde…). */
export function partOfFileKind(kind: FileKind): GamePart | undefined {
  return FROM_FILE_KIND[kind];
}

export interface InstalledPart {
  part: GamePart;
  /** Fichiers et dossiers de la table qui la font (un PuP-Pack est un dossier). */
  entries: TableFileEntry[];
  size: number;
}

/** Parties présentes dans le dossier d'une table ; les fichiers attendus mais absents n'en font pas. */
export function installedParts(contents: TableContents): Map<GamePart, InstalledPart> {
  const parts = new Map<GamePart, InstalledPart>();
  for (const entry of contents.entries) {
    const part = partOfFileKind(entry.kind);
    if (!part || entry.missing) continue;
    const known = parts.get(part) ?? { part, entries: [], size: 0 };
    known.entries.push(entry);
    known.size += entry.size;
    parts.set(part, known);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Jeu VPS d'une table installée

/**
 * Identifiant VPS déjà connu d'une table, sans rien chercher : sa provenance, celui de son
 * .info, sinon le seul jeu d'où viennent ses médias (choisis dans les propositions).
 */
export function knownVpsId(info: TableInfoFile): string | undefined {
  const own = tableSourceOf(info)?.vpsGameId ?? (typeof info.Info?.VPSId === 'string' ? info.Info.VPSId.trim() : '');
  if (own) return own;
  const ids = mediaVpsIds(info);
  return ids.length === 1 ? ids[0] : undefined;
}

/** Jeux VPS d'où viennent les médias de la table (CyberPinball.medias.sources). */
function mediaVpsIds(info: TableInfoFile): string[] {
  const own = (info.CyberPinball as { medias?: { sources?: Record<string, { vpsId?: unknown }> } } | undefined)?.medias?.sources ?? {};
  return [...new Set(Object.values(own).map((s) => (typeof s?.vpsId === 'string' ? s.vpsId : '')).filter(Boolean))];
}

export interface TableGame {
  /** Jeu retenu ; absent : à choisir parmi les pistes. */
  game?: VpsGame;
  /** D'où il vient : provenance ou .info, médias de la table, recherche d'après la table elle-même. */
  how?: 'known' | 'medias' | 'search';
  /** Jeux possibles, le plus probable d'abord (recherche approfondie). */
  leads: GameLead[];
}

/**
 * Jeu VPS d'une table, même quand son .info ne le dit pas (une table nommée « VPW 2021 »
 * pour un jeu « Original » chez VPS) : l'identifiant connu, sinon la recherche approfondie
 * (nom écrit dans la table, fichier, dossier, ROM, PuP-Pack, auteur), retenue quand elle
 * est sûre (0,8 au moins, loin devant la piste suivante, ou confirmée par les médias).
 */
export function tableGame(vps: VpsDb, table: TableEntry, evidence: TableEvidence = {}): TableGame {
  const known = knownVpsId(table.info);
  const game = known ? vps.games.find((g) => g.id === known) : undefined;
  if (game) return { game, how: 'known', leads: [] };
  const leads = deepSearchGames(vps, table, evidence);
  const [top, second] = leads;
  if (!top || top.score < 0.8) return { leads };
  if (mediaVpsIds(table.info).includes(top.game.id)) return { game: top.game, how: 'medias', leads };
  if (!second || second.siblingOf === top.game.id || top.score - second.score >= 0.1) return { game: top.game, how: 'search', leads };
  return { leads };
}

// ---------------------------------------------------------------------------
// Sources des parties : VPS, ce qui est déjà téléchargé, les sites, le web

/** Où chercher une partie, dans l'ordre où ses propositions passent. */
export type PartSource = 'vps' | 'downloads' | MediaSiteId | 'web';

/** Sources d'une partie : toutes, sauf pour les réglages propres (aucun site ne les range). */
export function partSources(part: GamePart): PartSource[] {
  return part === 'ini' ? ['downloads', 'web'] : ['vps', 'downloads', 'vpforums', 'vpuniverse', 'web'];
}

/**
 * Catégories de VPUniverse où se range chaque partie, relevées sur vpuniverse.com/files/
 * le 27/10/2026 (PuP-Packs, frontons B2S, couleurs Serum et PIN2DMD, sons, ROM, POV…).
 */
export const PART_SITE_NODES: Record<NeedKind, readonly string[]> = {
  table: ['82'], // VPX Pinball Tables
  b2s: ['33', '189'], // B2S Backglass Downloads, B2S Alternate Original
  rom: ['15'], // PinMAME ROMs
  pup: ['120'], // PuP-Packs
  altcolor: ['173', '101', '174'], // Serum DMD Colorizations, PIN2DMD Colorizations (Virtual Pinball), ROM Colorizations
  altsound: ['113'], // AltSound
  music: ['112'], // Audio Files
  pov: ['68'], // VPX POV (Point of View) Physics Sets
  topper: ['160', '93'], // Topper Videos, Topper Images
  media: ['72'], // Frontend Media Files
};

/** Mot ajouté au titre pour chercher une partie sur le web. */
const PART_WORDS: Record<GamePart, string> = {
  table: 'vpx',
  b2s: 'directb2s',
  rom: 'rom',
  pup: 'pup-pack',
  altcolor: 'serum',
  altsound: 'altsound',
  music: 'music',
  pov: 'pov',
  topper: 'topper',
  media: 'media',
  ini: 'ini',
};

/** Texte d'une recherche sur le web pour une partie : « The Goonies Never Say Die Pinball pup-pack vpinball ». */
export function partWebQuery(title: string, part?: GamePart): string {
  const main = title.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+-\s+|:\s*/)[0]!.replace(/\s+/g, ' ').trim();
  return [main, part ? PART_WORDS[part] : undefined, 'vpinball'].filter(Boolean).join(' ');
}

/** Recherche d'un site pour une partie : VPUniverse, dans ses seules catégories ; VPForums, partout. */
export function partSearchUrl(site: MediaSiteId, title: string, part: NeedKind, page = 1): string {
  const q = encodeURIComponent(siteSearchText(site, siteQuery(title)));
  if (site === 'vpuniverse') return `https://vpuniverse.com/search/?q=${q}&type=downloads_file&nodes=${PART_SITE_NODES[part].join(',')}&search_and_or=and&sortby=relevancy${page > 1 ? `&page=${page}` : ''}`;
  return `https://www.vpforums.org/index.php?app=core&module=search&do=search&search_term=${q}&search_app=downloads`;
}

/** Ce que disent d'une partie la catégorie et le titre d'un résultat (VPForums ne filtre pas par catégorie). */
const HIT_PARTS: [RegExp, NeedKind][] = [
  [/pup.?pack|\bpup\b/, 'pup'],
  [/direct.?b2s|\bb2s\b|backglass/, 'b2s'],
  [/serum|colori[sz]|pin2dmd|\bvni\b|altcolor/, 'altcolor'],
  [/alt.?sound/, 'altsound'],
  [/\bpov\b|point of view/, 'pov'],
  [/topper/, 'topper'],
  [/pinmame rom|\brom\b/, 'rom'],
  [/media pack|frontend media|wheel|popper/, 'media'],
  [/\bvpx\b|table/, 'table'],
];

/** Partie que range un résultat : sa catégorie chez VPUniverse, sinon les mots de sa catégorie et de son titre. */
export function hitPart(hit: SiteHit): NeedKind | undefined {
  if (hit.site === 'vpuniverse' && hit.category) {
    const own = (Object.keys(PART_SITE_NODES) as NeedKind[]).find((k) => PART_SITE_NODES[k].includes(hit.category!.id));
    if (own) return own;
  }
  const text = `${hit.category?.label ?? ''} ${hit.title}`.toLowerCase();
  return HIT_PARTS.find(([re]) => re.test(text))?.[1];
}

/** Un résultat d'un site proposé pour une partie. */
export interface PartOffer {
  hit: SiteHit;
  /** Entre 0 et 1 : à quel point le titre désigne le jeu. */
  score: number;
  /** Le titre désigne un autre jeu de la base VPS : proposé en dernier, signalé. */
  other?: boolean;
}

/**
 * Résultats des sites pour une partie d'un jeu : ceux de cette partie dont le titre
 * désigne le jeu (rapproché de la base VPS quand on l'a ; sans elle, le titre doit
 * contenir celui du jeu), les plus sûrs puis les plus téléchargés d'abord.
 */
export function partOffers(hits: SiteHit[], part: NeedKind, title: string, game?: VpsGame, vps?: VpsDb): PartOffer[] {
  const want = vpsKey(title.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s+-\s+|:\s*/)[0]!);
  const out: PartOffer[] = [];
  for (const hit of hits) {
    if (hitPart(hit) !== part) continue;
    const name = hitGameName(hit.title.replace(/direct.?b2s|pup.?pack|serum|alt.?sound|colori[sz]ations?|\bpov\b|\brom\b/gi, ' '));
    let score = name && want.length >= 3 && vpsKey(name).includes(want) ? 0.8 : 0;
    let other = false;
    if (vps && game && name) {
      const candidates = matchVps(vps, { names: [name] }, { deep: true, max: 6 }).candidates;
      const mine = candidates.find((c) => c.game.id === game.id);
      const best = candidates[0];
      if (mine && best && mine.score >= best.score - 0.05) score = Math.max(score, mine.score);
      else if (best && best.score >= 0.8 && score < 0.8) other = true;
    }
    if (score >= 0.6) out.push({ hit, score });
    else if (other) out.push({ hit, score: 0, other });
  }
  return out.sort((a, b) => Number(a.other ?? false) - Number(b.other ?? false) || b.score - a.score || (b.hit.downloads ?? 0) - (a.hit.downloads ?? 0));
}

/** Fichiers de VPS pour une partie, avec un lien vivant (aucun pour les réglages propres). */
export function partWebFiles(game: VpsGame | undefined, part: GamePart) {
  return game && part !== 'ini' ? partFiles(game, part).filter((f) => liveLinks(f).length) : [];
}
