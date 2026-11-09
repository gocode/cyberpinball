// Classements national et mondial (décisions du 09/11/2026) : les scores de toutes les bornes, sur
// la même version d'une table, sans serveur. Chaque score part signé par la clé du joueur (Ed25519,
// sharing.ts) et passe de borne en borne comme les profils de l'annuaire (social.ts) : au bonjour,
// une part de ce que la borne connaît ; à chaque partie, le nouveau score à toutes les bornes reliées,
// qui le relaient à leur tour s'il leur était inconnu.
//
// Ce qui se compare : la même version exacte de la table (boardKey, groupboard.ts : même .vpx, même
// script joué) et le même nombre de billes par partie ; sinon, deux classements à part. Ce qui part :
// seulement un score relevé par Cyber Pinball (mémoire de la ROM, tableau de la table, partie en
// direct : `how`), jamais un score saisi ; jamais une partie du mode invité. Une signature prouve
// qui annonce le score, pas qu'il est honnête : un score aberrant se masque sur la borne (`hidden`),
// celui d'un joueur ou tous les siens.
//
// Chaque borne ne garde que de quoi montrer les classements : pour chaque joueur et chaque version,
// son meilleur score de toujours, de l'année, de la semaine et du jour ; puis, par période, les
// meilleurs joueurs du monde et de chaque pays. Tenu dans <données>\classements.json.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isBallCount } from './ballcount';
import { inPeriod, SCORE_PERIODS, type PlayedSource, type ScorePeriod } from './scoreboard';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName, type PresenceTable } from './social';
import { readKeptJson } from './store';

export const RANKINGS_FILE = 'classements.json';
export const RANKINGS_VERSION = 1;
/** Scores envoyés au plus dans un message (au bonjour, ou relayés). */
export const RANKINGS_BATCH = 200;
/** Joueurs gardés par version et par période, dans le monde ; et dans chaque pays. */
const KEEP_WORLD = 100;
const KEEP_COUNTRY = 25;
/** Scores gardés au plus, toutes versions confondues. */
const KEEP_MAX = 20_000;
/**
 * Lignes d'un classement, la mienne comprise quand je suis plus loin : avec les onglets, ma place et
 * la note sous le tableau, tout tient sur un écran 16:9 sans défiler.
 */
export const RANKING_LINES = 9;

/** Portées d'un classement : cette borne (scoreboard.ts), les amis, le pays, le monde. */
export const RANKING_SCOPES = ['cabinet', 'friends', 'country', 'world'] as const;
export type RankingScope = (typeof RANKING_SCOPES)[number];

export interface RankedScore {
  /** Clé publique du joueur : il signe. */
  key: string;
  /** Son nom le jour du score. */
  name: string;
  /** Pays déclaré (ISO 3166-1 alpha-2, « FR ») ; absent : classement mondial seulement. */
  country?: string;
  /** Version exacte de la table (boardKey). */
  board: string;
  /** Billes par partie, quand la borne le sait. */
  balls?: number;
  /** La table, telle qu'on la montre (titre, fabricant, année, VPS). */
  table: PresenceTable;
  score: number;
  /** Fin de la partie (ISO). */
  at: string;
  how: PlayedSource;
  sig: string;
}

export interface RankingStore {
  v: number;
  scores: RankedScore[];
  /** Masqués sur cette borne : un score (`s:<id>`) ou tous ceux d'un joueur (`k:<clé>`). */
  hidden: string[];
}

export const emptyRankings = (): RankingStore => ({ v: RANKINGS_VERSION, scores: [], hidden: [] });
export const rankingsFile = (dataDir: string) => path.join(dataDir, RANKINGS_FILE);

// ---------------------------------------------------------------------------
// Signer, vérifier

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isBoard = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}:([0-9a-f]{64})?$/.test(v);
export const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const SOURCES: readonly PlayedSource[] = ['rom', 'record', 'live'];

/** Ce que couvre la signature : tout le score, dans un ordre fixe. */
function signedText(s: Omit<RankedScore, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'score', key: s.key, name: s.name, country: s.country ?? null, board: s.board, balls: s.balls ?? null, title: s.table.title, score: s.score, at: s.at, how: s.how });
}

/** Identité d'un score : un même score relayé dix fois n'entre qu'une fois. */
export const rankedId = (s: Pick<RankedScore, 'key' | 'board' | 'at' | 'score'>) => `${s.key.slice(0, 16)}:${s.board.slice(0, 16)}:${s.at}:${s.score}`;

export function signScore(key: PlayerKey, fields: Omit<RankedScore, 'key' | 'sig'>): RankedScore {
  const s = { ...fields, key: key.publicKey };
  return { ...s, sig: signText(signedText(s), key) };
}

function parseTable(raw: unknown): PresenceTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || !r.title || r.title.length > 120 || /[\x00-\x1f]/.test(r.title)) return undefined;
  const manufacturer = typeof r.manufacturer === 'string' && r.manufacturer.length <= 60 && !/[\x00-\x1f]/.test(r.manufacturer) ? r.manufacturer : undefined;
  const year = typeof r.year === 'number' && Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2200 ? r.year : undefined;
  const vpsId = typeof r.vpsId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.vpsId) ? r.vpsId : undefined;
  return { title: r.title, ...(manufacturer ? { manufacturer } : {}), ...(year ? { year } : {}), ...(vpsId ? { vpsId } : {}) };
}

/** Un score reçu, vérifié champ par champ puis par sa signature ; undefined : laissé de côté. */
export function verifyScore(raw: unknown, now = new Date()): RankedScore | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  const table = parseTable(r.table);
  if (!isPlayerPublicKey(r.key) || !name || name !== r.name || !table || !isBoard(r.board) || !isIso(r.at) || typeof r.sig !== 'string') return undefined;
  if (typeof r.score !== 'number' || !Number.isSafeInteger(r.score) || r.score <= 0 || !SOURCES.includes(r.how as PlayedSource)) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  if (r.balls !== undefined && !isBallCount(r.balls)) return undefined;
  // Pas de score venu du futur (horloge d'une borne déréglée) ; dix minutes de tolérance.
  if (Date.parse(r.at) > now.getTime() + 10 * 60_000) return undefined;
  const s: Omit<RankedScore, 'sig'> = {
    key: r.key,
    name,
    ...(r.country ? { country: r.country as string } : {}),
    board: r.board,
    ...(r.balls ? { balls: r.balls as number } : {}),
    table,
    score: r.score,
    at: r.at,
    how: r.how as PlayedSource,
  };
  return verifyText(signedText(s), r.sig, r.key) ? { ...s, sig: r.sig } : undefined;
}

// ---------------------------------------------------------------------------
// Garder

const group = (s: Pick<RankedScore, 'board' | 'balls'>) => `${s.board}|${s.balls ?? ''}`;
const better = (a: RankedScore, b: RankedScore) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at);

/** Meilleur score de chaque joueur pendant la période, du meilleur au moins bon. */
function bestPerPlayer(scores: readonly RankedScore[], period: ScorePeriod, now: Date): RankedScore[] {
  const best = new Map<string, RankedScore>();
  for (const s of scores) {
    if (!inPeriod(s.at, period, now)) continue;
    const known = best.get(s.key);
    if (!known || better(s, known) < 0) best.set(s.key, s);
  }
  return [...best.values()].sort(better);
}

/**
 * Ce que la borne garde : pour chaque version et chaque période, le meilleur score de chaque joueur
 * parmi les KEEP_WORLD premiers du monde et les KEEP_COUNTRY premiers de chaque pays ; tous ceux de
 * `me` (les siens). Le reste sort.
 */
export function pruneRankings(scores: readonly RankedScore[], me: string | undefined, now = new Date()): RankedScore[] {
  const groups = new Map<string, RankedScore[]>();
  for (const s of scores) groups.set(group(s), [...(groups.get(group(s)) ?? []), s]);
  const keep = new Set<RankedScore>();
  for (const list of groups.values()) {
    for (const period of SCORE_PERIODS) {
      const best = bestPerPlayer(list, period, now);
      best.slice(0, KEEP_WORLD).forEach((s) => keep.add(s));
      const countries = new Map<string, number>();
      for (const s of best) {
        if (!s.country) continue;
        const n = countries.get(s.country) ?? 0;
        if (n < KEEP_COUNTRY) keep.add(s);
        countries.set(s.country, n + 1);
      }
    }
    for (const s of list) if (s.key === me && inPeriod(s.at, 'year', now)) keep.add(s);
  }
  return [...keep].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, KEEP_MAX);
}

/**
 * Scores reçus (déjà vérifiés) ajoutés au classement, une seule fois chacun ; rend ceux qui sont
 * nouveaux et gardés : ce que la borne relaie à son tour.
 */
export function mergeRankings(store: RankingStore, incoming: readonly RankedScore[], me: string | undefined, now = new Date()): RankedScore[] {
  if (store.v !== RANKINGS_VERSION) return [];
  const known = new Set(store.scores.map(rankedId));
  const fresh = incoming.filter((s) => !known.has(rankedId(s)) && known.add(rankedId(s)));
  if (!fresh.length) return [];
  store.scores = pruneRankings([...store.scores, ...fresh], me, now);
  const kept = new Set(store.scores);
  return fresh.filter((s) => kept.has(s));
}

/** Une part de ce que connaît la borne, pour le bonjour : les siens d'abord, puis les plus récents. */
export function rankingsSample(store: RankingStore, me: string | undefined): RankedScore[] {
  const own = store.scores.filter((s) => s.key === me);
  return [...own, ...store.scores.filter((s) => s.key !== me)].slice(0, RANKINGS_BATCH);
}

export const isHidden = (store: Pick<RankingStore, 'hidden'>, s: RankedScore) => store.hidden.includes(`s:${rankedId(s)}`) || store.hidden.includes(`k:${s.key}`);

// ---------------------------------------------------------------------------
// Lire un classement

export interface RankingLine {
  rank: number;
  key: string;
  name: string;
  country?: string;
  score: number;
  at: string;
  how: PlayedSource;
  id: string;
  /** Le joueur de cette borne. */
  mine?: true;
  /** Sa place exacte n'est pas connue : au-delà de cette place (la borne ne garde que le haut du classement). */
  beyond?: number;
}

/** Où se trouve le joueur de la borne dans un classement. */
export interface RankingPosition {
  /** Sa place parmi les scores connus ; exacte seulement si `beyond` est absent. */
  rank: number;
  /** Au-delà de cette place : la borne ne garde pas assez de scores pour la dire exactement. */
  beyond?: number;
}

export interface RankingQuery {
  board: string;
  balls?: number;
  period: ScorePeriod;
  scope: Exclude<RankingScope, 'cabinet'>;
  /** Pays du classement national. */
  country?: string;
  /** Amis (clés), pour la portée « Amis ». */
  friends?: ReadonlySet<string>;
  me?: string;
  limit?: number;
}

/** Le classement d'une version de table : le meilleur score de chaque joueur pendant la période, masqués exclus. */
export function rankingBoard(store: RankingStore, q: RankingQuery, now = new Date()): { lines: RankingLine[]; players: number; me?: RankingPosition; complete: boolean } {
  const list = store.scores.filter((s) => s.board === q.board && (s.balls ?? undefined) === (q.balls ?? undefined) && !isHidden(store, s));
  const scoped = list.filter((s) => (q.scope === 'country' ? !!q.country && s.country === q.country : q.scope === 'friends' ? s.key === q.me || !!q.friends?.has(s.key) : true));
  const best = bestPerPlayer(scoped, q.period, now);
  const limit = q.limit ?? RANKING_LINES;
  // Plus loin que les premières lignes : la dernière laisse la place à la mienne.
  const far = q.me ? best.findIndex((s) => s.key === q.me) >= limit : false;
  const lines = best.slice(0, far ? Math.max(0, limit - 1) : limit).map((s) => ({
    rank: 1 + best.filter((o) => o.score > s.score).length,
    key: s.key,
    name: s.name,
    ...(s.country ? { country: s.country } : {}),
    score: s.score,
    at: s.at,
    how: s.how,
    id: rankedId(s),
    ...(s.key === q.me ? { mine: true as const } : {}),
  }));
  // La borne garde les KEEP_WORLD premiers du monde et les KEEP_COUNTRY premiers de chaque pays :
  // au-delà, des joueurs mieux placés peuvent lui manquer, une place plus loin n'est pas sûre.
  const depth = q.scope === 'world' ? KEEP_WORLD : q.scope === 'country' ? KEEP_COUNTRY : undefined;
  const mine = q.me ? best.findIndex((s) => s.key === q.me) : -1;
  let me: RankingPosition | undefined;
  if (mine >= 0) {
    const s = best[mine]!;
    const rank = 1 + best.filter((o) => o.score > s.score).length;
    me = depth !== undefined && rank > depth ? { rank, beyond: depth } : { rank };
    // Hors des premières lignes : sa ligne quand même, en fin de tableau.
    if (mine >= lines.length) lines.push({ rank, key: s.key, name: s.name, ...(s.country ? { country: s.country } : {}), score: s.score, at: s.at, how: s.how, id: rankedId(s), mine: true, ...(me.beyond ? { beyond: me.beyond } : {}) });
  }
  return { lines, players: best.length, ...(me ? { me } : {}), complete: depth === undefined || best.length < depth };
}

/** Joueurs classés pendant une période (pour l'onglet). */
export function rankingPlayers(store: RankingStore, q: Omit<RankingQuery, 'limit'>, now = new Date()): number {
  return rankingBoard(store, { ...q, limit: 0 }, now).players;
}

// ---------------------------------------------------------------------------
// Pays

/** Pays tiré d'une langue du système (« fr-FR » → « FR ») ; undefined sans région. */
export function countryOfLocale(locale: string | undefined): string | undefined {
  const region = locale ? /[-_]([A-Za-z]{2})(?:[-_.@]|$)/.exec(locale)?.[1]?.toUpperCase() : undefined;
  return isCountry(region) ? region : undefined;
}

/** Nom du pays dans la langue de l'interface ; le code lui-même si la langue ne le connaît pas. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Drapeau d'un pays (deux lettres en symboles régionaux). */
export const countryFlag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** Codes de pays reconnus, pour le choix du pays : ceux que la langue sait nommer. */
export function countryCodes(locale: string): string[] {
  const out: string[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = countryName(code, locale);
      if (name !== code && !['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ'].includes(code)) out.push(code);
    }
  }
  return out.sort((x, y) => countryName(x, locale).localeCompare(countryName(y, locale), locale));
}

// ---------------------------------------------------------------------------
// Le fichier

export function loadRankings(file: string, now = new Date()): { store: RankingStore; setAside?: string; newer?: boolean } {
  const { value, setAside } = readKeptJson(file, now);
  if (!value || typeof value !== 'object') return { store: emptyRankings(), ...(setAside ? { setAside } : {}) };
  const raw = value as Record<string, unknown>;
  const v = typeof raw.v === 'number' ? raw.v : RANKINGS_VERSION;
  // Relus sans revérifier chaque signature (ils l'ont été à l'arrivée) : seulement leur forme.
  const scores = (Array.isArray(raw.scores) ? raw.scores : []).filter((s): s is RankedScore => {
    const r = s as RankedScore;
    return !!r && typeof r === 'object' && isPlayerPublicKey(r.key) && isBoard(r.board) && isIso(r.at) && Number.isSafeInteger(r.score) && r.score > 0 && typeof r.sig === 'string' && !!r.table?.title && typeof r.name === 'string';
  });
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter((h): h is string => typeof h === 'string' && /^[sk]:.{1,200}$/.test(h));
  return { store: { v, scores, hidden }, ...(v > RANKINGS_VERSION ? { newer: true } : {}) };
}

export function saveRankings(file: string, store: RankingStore): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(store) + '\n');
}
