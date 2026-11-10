// Tableau des scores d'une table (demande du 09/11/2026) : quatre grilles de lecture, tout temps
// confondu, cette année, cette semaine, aujourd'hui.
//
// Le tableau d'honneur que la table tient elle-même (highscores.ts, romscores.ts) n'a pas de date :
// il ne dit que les meilleurs scores de toujours. Pour lire une période, chaque partie jouée sur
// la borne laisse donc ses scores, datés, dans <données>\scores.json :
// - table à ROM : les scores de la dernière partie, que la ROM garde dans sa mémoire (game_state de
//   la carte Pinball Memory Maps, un par joueur) ; relus avant et après, ils ne comptent que s'ils
//   ont changé (VPX fermé avant le Start : rien) ; les initiales viennent du tableau de la machine
//   quand le score y est entré ;
// - table originale : son tableau d'honneur (VPReg.stg) ne dit que les scores entrés, avec leurs
//   initiales ; ce sont ceux-là qui sont gardés, faute de mieux ;
// - partie entre amis : le score de cette borne, relevé en direct.
// Rien n'est inventé : une partie dont la table ne dit pas le score n'est pas inscrite.
//
// « Tout temps confondu » réunit le tableau de la table et les scores gardés (un même score n'y
// figure qu'une fois) ; les trois autres ne lisent que les scores gardés, à l'heure de la borne :
// l'année depuis le 1er janvier, la semaine depuis le lundi, le jour depuis minuit.
//
// Un fichier illisible n'est jamais écrasé : il est mis de côté (store.ts, readKeptJson).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { HighScore } from './highscores';
import { readKeptJson } from './store';

/** Version du format de scores.json. */
export const SCORES_VERSION = 1;

/** Les quatre grilles de lecture, dans l'ordre des onglets. */
export const SCORE_PERIODS = ['all', 'year', 'week', 'today'] as const;
export type ScorePeriod = (typeof SCORE_PERIODS)[number];

/** Lignes d'un tableau. */
export const SCOREBOARD_LINES = 10;
/** Scores gardés par table, au plus : au-delà, les plus anciens d'avant l'année en cours qui ne sont pas parmi les meilleurs partent. */
const MAX_PLAYED = 2000;

/** D'où vient un score gardé. */
export type PlayedSource =
  /** Dernière partie, lue dans la mémoire de la ROM. */
  | 'rom'
  /** Entré au tableau d'honneur de la table (VPReg.stg). */
  | 'record'
  /** Partie entre amis, relevé en direct. */
  | 'live';

export interface PlayedScore {
  /** Fin de la partie (ISO). */
  at: string;
  score: number;
  /** Initiales entrées au tableau de la table, s'il y est entré. */
  initials?: string;
  /** Joueur 2, 3 ou 4 d'une partie à plusieurs ; absent : le joueur 1, ou seul. */
  player?: number;
  /** Joueurs de la partie, quand ils étaient plusieurs. */
  of?: number;
  how: PlayedSource;
}

export interface ScoreJournal {
  v: number;
  /** Par table (TableEntry.id), du plus récent au plus ancien. */
  tables: Record<string, PlayedScore[]>;
}

export const emptyScoreJournal = (): ScoreJournal => ({ v: SCORES_VERSION, tables: {} });

/** <données>\scores.json */
export const scoreJournalFile = (dataDir: string) => path.join(dataDir, 'scores.json');

// ---------------------------------------------------------------------------
// Périodes

/** Début de la période, à l'heure de la borne ; undefined : tout temps confondu. La semaine commence le lundi. */
export function periodStart(period: ScorePeriod, now = new Date()): Date | undefined {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'today':
      return day;
    case 'week':
      return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return undefined;
  }
}

/** Le score a été fait pendant la période. */
export function inPeriod(at: string, period: ScorePeriod, now = new Date()): boolean {
  const start = periodStart(period, now);
  if (!start) return true;
  const time = Date.parse(at);
  return Number.isFinite(time) && time >= start.getTime() && time <= now.getTime() + 60_000;
}

// ---------------------------------------------------------------------------
// Le tableau

export interface BoardLine {
  /** Place (1 : le meilleur) ; deux scores égaux partagent la même. */
  rank: number;
  score: number;
  initials?: string;
  player?: number;
  of?: number;
  /** Quand : absent pour un record de la table d'avant que la borne ne garde les scores. */
  at?: string;
  /** Le tableau d'honneur de la table le porte. */
  table?: true;
}

/**
 * Score d'usine : celui qu'une ROM ou le script d'une table met à son tableau d'honneur à la
 * première mise en route (« 50,000,000 », « 2,500,000 », « 75,000 ») pour que le tableau ne soit
 * pas vide. Trois chiffres significatifs au plus, suivis d'au moins trois zéros : un vrai score
 * finit rarement ainsi.
 */
export function factoryScore(score: number): boolean {
  const digits = String(Math.trunc(Math.abs(score)));
  const significant = digits.replace(/0+$/, '');
  return significant.length > 0 && significant.length <= 3 && digits.length - significant.length >= 3;
}

/**
 * Le tableau d'une période : les meilleurs scores, du premier au dernier, `limit` lignes au plus.
 * Tout temps confondu, `records` (le tableau de la table) s'y ajoute ; un score gardé qui y figure
 * déjà (même score, mêmes initiales ou pas d'initiales d'un côté) n'y compte qu'une fois, avec sa date.
 * Un record de la table qu'aucune partie de la borne n'a fait et qui a l'allure d'un score d'usine
 * (factoryScore) n'y paraît pas : il est fictif.
 */
export function scoreBoard(played: readonly PlayedScore[], records: readonly HighScore[] | undefined, period: ScorePeriod, now = new Date(), limit = SCOREBOARD_LINES): BoardLine[] {
  let lines: Omit<BoardLine, 'rank'>[] = [];
  if (period === 'all') for (const r of records ?? []) if (r.score > 0) lines.push({ score: r.score, ...(r.initials ? { initials: r.initials } : {}), table: true });
  const kept = played.filter((p) => p.score > 0 && inPeriod(p.at, period, now)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const p of kept) {
    const same = lines.find((l) => l.table && l.at === undefined && l.score === p.score && (!l.initials || !p.initials || l.initials === p.initials));
    const fields = { at: p.at, ...(p.player ? { player: p.player } : {}), ...(p.of ? { of: p.of } : {}) };
    if (same) Object.assign(same, fields, !same.initials && p.initials ? { initials: p.initials } : {});
    else lines.push({ score: p.score, ...(p.initials ? { initials: p.initials } : {}), ...fields });
  }
  lines = lines.filter((l) => !(l.table && l.at === undefined && factoryScore(l.score)));
  // Du meilleur au moins bon ; à score égal, le plus ancien d'abord (il l'a fait le premier).
  lines.sort((a, b) => b.score - a.score || (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0));
  return lines.slice(0, limit).map((l) => ({ rank: 1 + lines.filter((o) => o.score > l.score).length, ...l }));
}

/** Nombre de parties gardées pendant la période (une partie à plusieurs compte une fois). */
export function gamesInPeriod(played: readonly PlayedScore[], period: ScorePeriod, now = new Date()): number {
  return new Set(played.filter((p) => inPeriod(p.at, period, now)).map((p) => p.at)).size;
}

// ---------------------------------------------------------------------------
// Ajouter une partie

/**
 * Les scores d'une partie entrent au journal de la table, du plus récent au plus ancien. Le journal
 * reste borné : au-delà de MAX_PLAYED, partent les plus anciens d'avant l'année en cours qui ne
 * sont pas parmi les meilleurs de toujours. Vrai si le journal a changé.
 */
export function addPlayed(journal: ScoreJournal, table: string, scores: readonly PlayedScore[], now = new Date()): boolean {
  if (journal.v !== SCORES_VERSION) return false;
  const fresh = scores.filter((s) => Number.isSafeInteger(s.score) && s.score > 0);
  if (!fresh.length) return false;
  let list = [...fresh, ...(journal.tables[table] ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (list.length > MAX_PLAYED) {
    const year = periodStart('year', now)!.getTime();
    const best = new Set([...list].sort((a, b) => b.score - a.score).slice(0, SCOREBOARD_LINES * 5));
    list = list.filter((s, i) => i < MAX_PLAYED || Date.parse(s.at) >= year || best.has(s));
  }
  journal.tables[table] = list;
  return true;
}

/**
 * Scores d'une partie lus dans la mémoire de la ROM : ceux de la dernière partie, s'ils ont changé
 * pendant celle-ci. `entered` : les scores entrés au tableau de la machine pendant la partie, qui
 * donnent leurs initiales. Vide si la mémoire n'a pas bougé (aucune partie commencée).
 */
export function romPlayedScores(before: readonly number[] | undefined, after: readonly number[] | undefined, entered: readonly HighScore[], at: string): PlayedScore[] {
  if (!after?.some((s) => s > 0)) return [];
  if (before && before.length === after.length && before.every((s, i) => s === after[i])) return [];
  const playing = after.filter((s) => s > 0).length;
  const left = [...entered];
  const out: PlayedScore[] = [];
  after.forEach((score, i) => {
    if (score <= 0) return;
    const found = left.findIndex((e) => e.score === score);
    const initials = found >= 0 ? left.splice(found, 1)[0]!.initials : undefined;
    out.push({ at, score, ...(initials ? { initials } : {}), ...(playing > 1 ? { player: i + 1, of: playing } : {}), how: 'rom' });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Le fichier

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const SOURCES: readonly PlayedSource[] = ['rom', 'record', 'live'];

function parsePlayed(raw: unknown): PlayedScore | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isIso(r.at) || typeof r.score !== 'number' || !Number.isSafeInteger(r.score) || r.score <= 0 || !SOURCES.includes(r.how as PlayedSource)) return undefined;
  const small = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8;
  return {
    at: r.at,
    score: r.score,
    ...(typeof r.initials === 'string' && /^[\x20-\x7e]{1,8}$/.test(r.initials) ? { initials: r.initials } : {}),
    ...(small(r.player) ? { player: r.player as number } : {}),
    ...(small(r.of) ? { of: r.of as number } : {}),
    how: r.how as PlayedSource,
  };
}

/**
 * Le journal gardé sur la borne. Les scores illisibles un à un sont laissés de côté ; un fichier
 * illisible est mis de côté (`setAside`) ; un format plus récent est rendu tel quel (`newer`) : on
 * le lit sans y écrire (addPlayed le refuse).
 */
export function loadScoreJournal(file: string, now = new Date()): { journal: ScoreJournal; setAside?: string; newer?: boolean } {
  const { value, setAside } = readKeptJson(file, now);
  if (!value || typeof value !== 'object') return { journal: emptyScoreJournal(), ...(setAside ? { setAside } : {}) };
  const raw = value as Record<string, unknown>;
  const v = typeof raw.v === 'number' ? raw.v : SCORES_VERSION;
  const tables: Record<string, PlayedScore[]> = {};
  if (raw.tables && typeof raw.tables === 'object') {
    for (const [id, list] of Object.entries(raw.tables as Record<string, unknown>)) {
      if (!id || id.length > 400 || !Array.isArray(list)) continue;
      const scores = list.map(parsePlayed).filter((p): p is PlayedScore => !!p);
      if (scores.length) tables[id] = scores.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    }
  }
  return { journal: { v, tables }, ...(v > SCORES_VERSION ? { newer: true } : {}) };
}

export function saveScoreJournal(file: string, journal: ScoreJournal): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(journal) + '\n');
}
