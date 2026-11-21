// Tables du jour (engagement, maquettes validées le 21/11/2026) : les tables les plus jouées
// aujourd'hui, le record du jour de chacune, ma place et mon écart ; et l'objectif d'une table, le
// joueur juste au-dessus de moi. Des décisions sur des données, sans réseau ni écran : l'écran
// « Tables du jour » (Classements), la fiche d'une table, le chargement et l'Arène s'en servent.
//
// Ce qui se compte :
// - chaque borne tient ses parties du jour, par version exacte de table (boardKey, groupboard.ts : même
//   .vpx, même script) et nombre de billes, dans <données>\amis\parties-du-jour.json ;
// - ces comptes partent dans la carte publique signée (publicprofile.ts), comme les XP de la semaine :
//   ceux du jour et ceux de la semaine, PLAYS_IN_CARD_DAY et PLAYS_IN_CARD_WEEK tables au plus, chaque
//   total plafonné à ce qu'un joueur peut jouer (PLAYS_DAY_PLAUSIBLE par jour). Un champ facultatif :
//   une carte d'avant se vérifie toujours, sans parties ;
// - une carte qui annonce plus que le plafond est « invraisemblable » : ses parties ne comptent pas, et
//   la table qu'elle touche montre son compte avec « ? » (comme le niveau d'un joueur, levels.ts) ;
// - un joueur d'une borne plus ancienne (sans parties dans sa carte) compte au moins une partie sur une
//   table dont il a publié un score pendant la période (rankings.ts).
//
// Ce qui se compare : la même version exacte et le même nombre de billes, jamais deux versions ensemble.
//
// « Ne pas refroidir » (règle du mainteneur) : sous DAILY_MIN_PLAYERS joueurs du jour dans la portée, c'est
// la semaine qui se montre à la place du jour ; jamais un tableau vide quand la semaine a quelque chose.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isBallCount } from './ballcount';
import { dayKey, levelOf, shownLevel, weekKey } from './levels';
import { isHidden, rankingAvatars, rankingLevels, type RankedScore, type RankingStore } from './rankings';
import { inPeriod } from './scoreboard';
import { readKeptJson } from './store';

/** Fichier des parties de la borne, dans <données>\amis. */
export const PLAYS_FILE = 'parties-du-jour.json';
/** Tables au plus dans la carte : celles du jour, celles de la semaine (les plus jouées d'abord). */
export const PLAYS_IN_CARD_DAY = 12;
export const PLAYS_IN_CARD_WEEK = 20;
/**
 * Parties d'un joueur en un jour, toutes tables confondues, au plus : une partie menée au bout dure
 * rarement moins de cinq minutes. Ma carte ne dépasse jamais ce plafond ; une carte qui le dépasse
 * est invraisemblable.
 */
export const PLAYS_DAY_PLAUSIBLE = 150;
/** Au plus en une semaine. */
export const PLAYS_WEEK_PLAUSIBLE = 7 * PLAYS_DAY_PLAUSIBLE;
/** Au-delà, la carte est mal formée (refusée entière, comme une semaine mal formée). */
const PLAYS_FORMAT_MAX = 100_000;
/** Titre d'une table dans la carte : assez pour la nommer, pas plus. */
const PLAY_TITLE_MAX = 80;
/** Jours gardés sur la borne : la semaine en cours et la précédente. */
const PLAYS_KEEP_DAYS = 14;

/**
 * « Ne pas refroidir » : sous ce nombre de joueurs du jour dans la portée (moi compris), la semaine
 * se montre à la place du jour.
 */
export const DAILY_MIN_PLAYERS = 3;
/** Tables montrées au plus. */
export const DAILY_TABLES_TOP = 20;

export const DAILY_SCOPES = ['world', 'country', 'friends'] as const;
export type DailyScope = (typeof DAILY_SCOPES)[number];
export type DailyPeriod = 'today' | 'week';

/** Les parties d'un joueur sur une version de table. */
export interface PlayCount {
  /** Version exacte (boardKey). */
  board: string;
  /** Billes par partie, quand la borne le sait. */
  balls?: number;
  /** La table, nommée pour qui ne l'a pas. */
  title: string;
  n: number;
}

/** Ce que porte la carte publique : `of`, le jour (AAAA-MM-JJ, à l'heure de la borne) ; ses parties ; celles de sa semaine. */
export interface CardPlays {
  of: string;
  day: PlayCount[];
  week: PlayCount[];
}

/** Les parties de cette borne, par jour local. */
export interface PlaysStore {
  v: 1;
  days: Record<string, PlayCount[]>;
}

export const emptyPlays = (): PlaysStore => ({ v: 1, days: {} });
export const playsFile = (dataDir: string) => path.join(dataDir, 'amis', PLAYS_FILE);

const isBoard = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}:([0-9a-f]{64})?$/.test(v);
const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isTitle = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= PLAY_TITLE_MAX && !/[\x00-\x1f\x7f]/.test(v);
const groupOf = (p: { board: string; balls?: number }) => `${p.board}|${p.balls ?? ''}`;
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Mes parties

/** Une partie de plus sur cette version, ce jour-là. Rend le nouvel état (l'ancien n'est pas touché). */
export function notePlay(store: PlaysStore, table: { board: string; balls?: number; title: string }, at = new Date()): PlaysStore {
  if (!isBoard(table.board)) return store;
  const day = dayKey(at);
  const title = table.title.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, PLAY_TITLE_MAX) || '?';
  const balls = isBallCount(table.balls) ? table.balls : undefined;
  const list = [...(store.days[day] ?? [])];
  const found = list.findIndex((p) => groupOf(p) === groupOf({ board: table.board, ...(balls ? { balls } : {}) }));
  if (found >= 0) list[found] = { ...list[found]!, title, n: list[found]!.n + 1 };
  else list.push({ board: table.board, ...(balls ? { balls } : {}), title, n: 1 });
  return prunePlays({ v: 1, days: { ...store.days, [day]: list } }, at);
}

/** Les jours trop anciens partent. */
export function prunePlays(store: PlaysStore, now = new Date()): PlaysStore {
  const keep = now.getTime() - PLAYS_KEEP_DAYS * DAY;
  const days = Object.fromEntries(Object.entries(store.days).filter(([d]) => isDayKey(d) && new Date(`${d}T23:59:59`).getTime() >= keep));
  return { v: 1, days };
}

/** Additionne des comptes par version, les plus joués d'abord, `max` tables au plus. */
function sumCounts(lists: readonly (readonly PlayCount[])[], max: number): PlayCount[] {
  const out = new Map<string, PlayCount>();
  for (const list of lists)
    for (const p of list) {
      const known = out.get(groupOf(p));
      out.set(groupOf(p), known ? { ...known, title: p.title, n: known.n + p.n } : { ...p });
    }
  return [...out.values()].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title)).slice(0, max);
}

/** Plafonne une liste à `cap` parties en tout : les plus jouées gardent les leurs. */
function capCounts(list: readonly PlayCount[], cap: number): PlayCount[] {
  let left = cap;
  const out: PlayCount[] = [];
  for (const p of list) {
    if (left <= 0) break;
    const n = Math.min(p.n, left);
    left -= n;
    out.push({ ...p, n });
  }
  return out;
}

/** Ce que ma carte publique porte de mes parties ; undefined : aucune cette semaine. */
export function cardPlays(store: PlaysStore, now = new Date()): CardPlays | undefined {
  const today = dayKey(now);
  const week = weekKey(now);
  const weekDays = Object.entries(store.days).filter(([d]) => isDayKey(d) && weekKey(new Date(`${d}T12:00:00`)) === week && d <= today);
  if (!weekDays.length) return undefined;
  const day = capCounts(sumCounts([store.days[today] ?? []], PLAYS_IN_CARD_DAY), PLAYS_DAY_PLAUSIBLE);
  const all = capCounts(sumCounts(weekDays.map(([, list]) => list), PLAYS_IN_CARD_WEEK), PLAYS_WEEK_PLAUSIBLE);
  return { of: today, day, week: all };
}

/** Le texte signé des parties (publicprofile.ts, cardText) : un ordre fixe, compact. */
export function cardPlaysText(p: CardPlays): unknown {
  const rows = (list: readonly PlayCount[]) => list.map((x) => [x.board, x.balls ?? 0, x.title, x.n]);
  return { of: p.of, day: rows(p.day), week: rows(p.week) };
}

function parseCount(raw: unknown): PlayCount | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isBoard(r.board) || !isTitle(r.title) || typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 1 || r.n > PLAYS_FORMAT_MAX) return undefined;
  if (r.balls !== undefined && !isBallCount(r.balls)) return undefined;
  return { board: r.board, ...(r.balls ? { balls: r.balls as number } : {}), title: r.title, n: r.n };
}

/**
 * Les parties lues dans une carte reçue ; undefined : mal formées (la carte entière est alors
 * refusée, comme une semaine mal formée). Des parties seulement invraisemblables passent : le
 * classement les écarte (playsPlausible).
 */
export function parseCardPlays(raw: unknown): CardPlays | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isDayKey(r.of) || !Array.isArray(r.day) || !Array.isArray(r.week) || r.day.length > PLAYS_IN_CARD_DAY || r.week.length > PLAYS_IN_CARD_WEEK) return undefined;
  const day = r.day.map(parseCount);
  const week = r.week.map(parseCount);
  if (day.some((x) => !x) || week.some((x) => !x)) return undefined;
  return { of: r.of, day: day as PlayCount[], week: week as PlayCount[] };
}

/** Des parties qu'un joueur a pu jouer : sous les plafonds du jour et de la semaine. */
export function playsPlausible(p: CardPlays): boolean {
  const total = (list: readonly PlayCount[]) => list.reduce((a, x) => a + x.n, 0);
  return total(p.day) <= PLAYS_DAY_PLAUSIBLE && total(p.week) <= PLAYS_WEEK_PLAUSIBLE;
}

// ---------------------------------------------------------------------------
// Les joueurs

/** Ce que les tables du jour lisent d'un joueur : sa carte publique, ou moi. */
export interface DailyPlayer {
  key: string;
  name: string;
  country?: string;
  avatar?: string;
  xp?: number;
  plays?: CardPlays;
}

export interface DailyInput {
  /** Les scores publiés (rankings.ts). */
  store: Pick<RankingStore, 'scores' | 'hidden'>;
  /** Les cartes publiques reçues des autres joueurs. */
  cards: readonly DailyPlayer[];
  /** Moi, avec mes parties (cardPlays). */
  me?: DailyPlayer;
  friends: ReadonlySet<string>;
  /** Mon pays (portée nationale). */
  country?: string;
  /** Première fois que la borne a vu la carte d'un joueur (vraisemblance de son niveau). */
  firstSeen?(key: string): string | undefined;
}

/** Un joueur classé sur une table : qui, son score, son niveau. */
export interface DailyHolder {
  key: string;
  name: string;
  country?: string;
  /** Empreinte de son avatar (avatar.ts). */
  avatar?: string;
  score: number;
  at: string;
  rank: number;
  /** Son niveau, s'il est vraisemblable ; `levelUnsure` : annoncé mais invraisemblable (« ? »). */
  level?: number;
  levelUnsure?: true;
  mine?: true;
}

/** Une table du jour : sa version, ses parties, son record, ma place. */
export interface DailyLine {
  board: string;
  balls?: number;
  title: string;
  /** Parties de la période dans la portée. */
  plays: number;
  /** Joueurs qui l'ont jouée. */
  players: number;
  /** Une carte invraisemblable a annoncé des parties sur cette table, écartées : le compte se lit « ? ». */
  unsure?: true;
  /** Le record de la période dans la portée ; absent : personne n'y a publié de score. */
  record?: DailyHolder;
  /** Ma place pendant la période ; `above` : le joueur juste au-dessus, et l'écart. */
  me?: { rank: number; score: number; above?: DailyHolder; gap?: number };
}

export interface DailyBoard {
  scope: DailyScope;
  /** La période montrée : le jour, ou la semaine sous le seuil (`calm`). */
  period: DailyPeriod;
  /** Sous le seuil de « ne pas refroidir » : la semaine à la place du jour. */
  calm: boolean;
  lines: DailyLine[];
  /** Parties et joueurs de la période dans la portée, toutes tables confondues. */
  plays: number;
  players: number;
  /** Joueurs du jour dans la portée (le seuil se juge sur eux). */
  dayPlayers: number;
}

const inScope = (input: DailyInput, scope: DailyScope, p: { key: string; country?: string }) =>
  scope === 'world' ? true : scope === 'country' ? Boolean(input.country) && p.country === input.country : p.key === input.me?.key || input.friends.has(p.key);

const better = (a: RankedScore, b: RankedScore) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at);

/** Tout ce qu'un calcul relit une fois : scores par version, niveaux, avatars, cartes. */
interface Prepared {
  groups: Map<string, RankedScore[]>;
  avatars: Map<string, string | undefined>;
  levels: Map<string, { xp?: number; since: string }>;
  cards: Map<string, DailyPlayer>;
}

function prepare(input: DailyInput): Prepared {
  const groups = new Map<string, RankedScore[]>();
  for (const s of input.store.scores) {
    if (isHidden(input.store, s)) continue;
    const g = groupOf(s);
    const list = groups.get(g);
    if (list) list.push(s);
    else groups.set(g, [s]);
  }
  const cards = new Map<string, DailyPlayer>();
  for (const c of input.cards) if (c.key !== input.me?.key) cards.set(c.key, c);
  if (input.me) cards.set(input.me.key, input.me);
  return { groups, avatars: rankingAvatars(input.store), levels: rankingLevels(input.store), cards };
}

/** Le niveau à montrer d'un joueur : le mien tel quel ; un autre, s'il est vraisemblable. */
function levelFor(input: DailyInput, prep: Prepared, key: string, now: Date): { level?: number; levelUnsure?: true } {
  const mine = key === input.me?.key;
  const card = prep.cards.get(key);
  const kept = prep.levels.get(key);
  const xp = card?.xp ?? kept?.xp;
  if (xp === undefined) return {};
  if (mine) return { level: levelOf(xp).level };
  const first = [kept?.since, input.firstSeen?.(key)].filter((x): x is string => !!x).sort()[0];
  const level = shownLevel(xp, first, now);
  return level === undefined ? { levelUnsure: true } : { level };
}

/** Meilleur score de chaque joueur de la portée pendant la période, du meilleur au moins bon, avec son rang. */
function bestOf(input: DailyInput, prep: Prepared, group: string, scope: DailyScope, period: DailyPeriod | 'all', now: Date): DailyHolder[] {
  const best = new Map<string, RankedScore>();
  for (const s of prep.groups.get(group) ?? []) {
    if (!inScope(input, scope, s) || !inPeriod(s.at, period, now)) continue;
    const known = best.get(s.key);
    if (!known || better(s, known) < 0) best.set(s.key, s);
  }
  const sorted = [...best.values()].sort(better);
  return sorted.map((s) => ({
    key: s.key,
    name: s.name,
    ...(s.country ? { country: s.country } : {}),
    ...(prep.avatars.get(s.key) ? { avatar: prep.avatars.get(s.key)! } : {}),
    score: s.score,
    at: s.at,
    rank: 1 + sorted.filter((o) => o.score > s.score).length,
    ...levelFor(input, prep, s.key, now),
    ...(s.key === input.me?.key ? { mine: true as const } : {}),
  }));
}

/** Les parties qu'une carte annonce pour la période en cours ; undefined : rien pour cette période. */
function periodCounts(p: CardPlays | undefined, period: DailyPeriod, now: Date): readonly PlayCount[] | undefined {
  if (!p) return undefined;
  if (period === 'today') return p.of === dayKey(now) ? p.day : undefined;
  return weekKey(new Date(`${p.of}T12:00:00`)) === weekKey(now) && p.of <= dayKey(now) ? p.week : undefined;
}

/** Joueurs du jour dans la portée : ceux dont la carte annonce des parties aujourd'hui, ou qui ont publié un score. */
function dayPlayersOf(input: DailyInput, prep: Prepared, scope: DailyScope, now: Date): number {
  const keys = new Set<string>();
  for (const c of prep.cards.values()) if (inScope(input, scope, c) && periodCounts(c.plays, 'today', now)?.length && (c.key === input.me?.key || playsPlausible(c.plays!))) keys.add(c.key);
  for (const list of prep.groups.values()) for (const s of list) if (inScope(input, scope, s) && inPeriod(s.at, 'today', now)) keys.add(s.key);
  return keys.size;
}

/**
 * Les tables les plus jouées de la période dans la portée, avec le record et ma place. Sans période
 * imposée : le jour, sauf sous le seuil de « ne pas refroidir » (DAILY_MIN_PLAYERS), où c'est la semaine.
 */
export function dailyTables(input: DailyInput, opts: { scope: DailyScope; period?: DailyPeriod; now?: Date; top?: number }): DailyBoard {
  const now = opts.now ?? new Date();
  const prep = prepare(input);
  const dayPlayers = dayPlayersOf(input, prep, opts.scope, now);
  const period: DailyPeriod = opts.period ?? (dayPlayers >= DAILY_MIN_PLAYERS ? 'today' : 'week');
  const counts = new Map<string, { board: string; balls?: number; title: string; plays: number; players: Set<string>; unsure: boolean }>();
  const add = (p: { board: string; balls?: number; title: string }, key: string, n: number, unsure = false) => {
    const g = groupOf(p);
    const known = counts.get(g) ?? { board: p.board, ...(p.balls ? { balls: p.balls } : {}), title: p.title, plays: 0, players: new Set<string>(), unsure: false };
    if (unsure) known.unsure = true;
    else {
      known.plays += n;
      known.players.add(key);
    }
    counts.set(g, known);
  };
  // Les parties annoncées par les cartes : une carte invraisemblable ne compte pas, sa table le dit.
  const counted = new Set<string>();
  for (const c of prep.cards.values()) {
    if (!inScope(input, opts.scope, c)) continue;
    const list = periodCounts(c.plays, period, now);
    if (!list) continue;
    const plausible = c.key === input.me?.key || playsPlausible(c.plays!);
    for (const p of list) {
      add(p, c.key, p.n, !plausible);
      if (plausible) counted.add(`${c.key}|${groupOf(p)}`);
    }
  }
  // Un joueur sans parties dans sa carte (borne plus ancienne) : une partie par table où il a publié un score.
  for (const [g, list] of prep.groups) {
    for (const s of list) {
      if (!inScope(input, opts.scope, s) || !inPeriod(s.at, period, now) || counted.has(`${s.key}|${g}`)) continue;
      counted.add(`${s.key}|${g}`);
      add({ board: s.board, ...(s.balls ? { balls: s.balls } : {}), title: s.table.title }, s.key, 1);
    }
  }
  const all = [...counts.values()].filter((c) => c.plays > 0);
  all.sort((a, b) => b.plays - a.plays || b.players.size - a.players.size || a.title.localeCompare(b.title));
  const lines = all.slice(0, opts.top ?? DAILY_TABLES_TOP).map((c): DailyLine => {
    const g = groupOf(c);
    const best = bestOf(input, prep, g, opts.scope, period, now);
    const mine = best.findIndex((h) => h.mine);
    let me: DailyLine['me'];
    if (mine >= 0) {
      const above = closestAbove(best, best[mine]!.score);
      me = { rank: best[mine]!.rank, score: best[mine]!.score, ...(above ? { above, gap: above.score - best[mine]!.score } : {}) };
    }
    return { board: c.board, ...(c.balls ? { balls: c.balls } : {}), title: c.title, plays: c.plays, players: c.players.size, ...(c.unsure ? { unsure: true as const } : {}), ...(best[0] ? { record: best[0] } : {}), ...(me ? { me } : {}) };
  });
  const players = new Set(all.flatMap((c) => [...c.players]));
  return { scope: opts.scope, period, calm: period === 'week' && !opts.period, lines, plays: all.reduce((a, c) => a + c.plays, 0), players: players.size, dayPlayers };
}

/** Le joueur juste au-dessus d'un score : le moins bon de ceux qui font mieux (un autre que moi). */
function closestAbove(best: readonly DailyHolder[], score: number | undefined): DailyHolder | undefined {
  const above = best.filter((h) => !h.mine && (score === undefined || h.score > score));
  return above.length ? above[above.length - 1] : undefined;
}

// ---------------------------------------------------------------------------
// Le record du jour, l'objectif

/** Le record d'une version pendant la période, dans la portée ; undefined : aucun score. */
export function dayRecord(input: DailyInput, table: { board: string; balls?: number }, opts: { scope: DailyScope; period?: DailyPeriod; now?: Date }): DailyHolder | undefined {
  const now = opts.now ?? new Date();
  const prep = prepare(input);
  return bestOf(input, prep, groupOf(table), opts.scope, opts.period ?? 'today', now)[0];
}

/** Ce qu'il y a à battre sur une version : le joueur juste au-dessus de moi, et l'écart. */
export interface Objective {
  scope: DailyScope;
  /** Le classement d'où vient l'objectif : celui du jour, sinon celui de tout temps. */
  period: 'today' | 'all';
  /** Le joueur à battre ; absent quand je suis déjà premier (`leader`). */
  target?: DailyHolder;
  /** Mon score de référence : mon meilleur du jour, sinon de tout temps (publié, ou relevé sur la borne). */
  mine?: number;
  /** Ce qu'il me manque : son score moins le mien (le sien entier si je n'ai pas de score). */
  gap?: number;
  /** Ma place dans ce classement. */
  myRank?: number;
  /** Je suis premier : personne à battre dans ce classement. */
  leader?: true;
  /** Joueurs de ce classement. */
  players: number;
}

/**
 * L'objectif sur une version : dans le classement du jour, le joueur juste au-dessus de mon score
 * (mon meilleur du jour, sinon de tout temps, sinon `myBest` relevé sur la borne) ; personne au-dessus
 * aujourd'hui, celui de tout temps. Portées essayées dans l'ordre (le pays, puis le monde par défaut) :
 * la première qui a quelqu'un à battre. Undefined : personne n'a de score sur cette version (« votre
 * prochain score sera le premier »).
 */
export function tableObjective(input: DailyInput, table: { board: string; balls?: number }, opts: { scopes?: readonly DailyScope[]; now?: Date; myBest?: number } = {}): Objective | undefined {
  const now = opts.now ?? new Date();
  const prep = prepare(input);
  const g = groupOf(table);
  const scopes = opts.scopes ?? (input.country ? (['country', 'world'] as const) : (['world'] as const));
  let leader: Objective | undefined;
  for (const scope of scopes) {
    const today = bestOf(input, prep, g, scope, 'today', now);
    const ever = bestOf(input, prep, g, scope, 'all', now);
    const mineToday = today.find((h) => h.mine);
    const mineEver = ever.find((h) => h.mine);
    const ref = mineToday?.score ?? Math.max(mineEver?.score ?? 0, opts.myBest ?? 0);
    const reference = ref > 0 ? ref : undefined;
    for (const [period, board] of [['today', today], ['all', ever]] as const) {
      const target = closestAbove(board, reference);
      const myRank = board.find((h) => h.mine)?.rank;
      if (target) return { scope, period, target, ...(reference ? { mine: reference } : {}), gap: target.score - (reference ?? 0), ...(myRank ? { myRank } : {}), players: board.length };
      if (myRank && !leader) leader = { scope, period, ...(reference ? { mine: reference } : {}), myRank, leader: true, players: board.length };
    }
  }
  return leader;
}

// ---------------------------------------------------------------------------
// Le fichier

export function loadPlays(file: string, now = new Date()): { store: PlaysStore; setAside?: string } {
  const { value, setAside } = readKeptJson(file, now);
  if (!value || typeof value !== 'object') return { store: emptyPlays(), ...(setAside ? { setAside } : {}) };
  const raw = (value as Record<string, unknown>).days;
  const days: Record<string, PlayCount[]> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [d, list] of Object.entries(raw as Record<string, unknown>)) {
      if (!isDayKey(d) || !Array.isArray(list)) continue;
      const counts = list.map(parseCount).filter((x): x is PlayCount => !!x);
      if (counts.length) days[d] = counts;
    }
  }
  return { store: prunePlays({ v: 1, days }, now) };
}

export function savePlays(file: string, store: PlaysStore): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(store) + '\n');
}
