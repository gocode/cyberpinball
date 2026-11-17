// Niveau du joueur (décidé le 17/11/2026, maquette « Niveaux et badges ») : des points d'expérience
// (XP) gagnés en jouant, qui font monter un niveau qui ne baisse jamais. Les décisions, sans réseau
// ni fichier ouvert ailleurs que dans loadLevels / saveLevels.
//
// Choix retenus :
// - XP de jeu : 1 par minute de vraie partie (au plus GAME_MINUTES_MAX par partie ; une partie dont
//   les scores relevés sont tous nuls ne compte pas ses minutes), 10 par partie menée au bout (au
//   moins MIN_GAME_SECONDS ou un score non nul), 20 pour la première du jour, 50 pour une table
//   jamais jouée, 25 pour un record personnel battu (une fois par table et par jour), 50 pour une
//   entrée au tableau d'honneur, 100 pour son meilleur score ; 20 par partie en direct menée au
//   bout, 20 de plus pour la victoire. Au plus DAILY_PLAY_CAP XP de jeu par jour ;
// - classements de la semaine (la semaine des tableaux : lundi 0 h, heure de la borne) : versés le
//   mardi, une fois les scores tardifs arrivés ; pour chaque table, la meilleure des trois portées
//   (Monde, Pays, Amis), avec un minimum de joueurs classés ; au plus WEEK_TABLES_MAX tables ;
// - badges : selon leur rareté (badges.ts, RARITY_XP) ;
// - courbe : du niveau n au niveau n + 1, 100 + 50 × (n − 1) XP ; paliers de dix niveaux ;
// - au premier calcul, le niveau de départ vient de l'historique déjà relevé (startXp), au plus
//   START_XP_MAX, sans plafond quotidien ;
// - vraisemblance (plausibleXp) : un niveau qui dépasse ce que les plafonds permettent depuis le
//   jour où la borne a vu le joueur pour la première fois s'affiche « ? ».
//
// Fichier : <données>\amis\niveau.json.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry, writeFileAtomic } from './atomicwrite';
import { t, tn } from './i18n';
import { periodStart } from './scoreboard';
import type { PresenceTable } from './social';

export const LEVELS_VERSION = 1;
export const LEVELS_FILE = 'niveau.json';

/** XP de jeu au plus par jour : parties, progrès, tableau d'honneur, parties en direct. */
export const DAILY_PLAY_CAP = 600;
/** Minutes comptées au plus pour une partie. */
export const GAME_MINUTES_MAX = 60;
/** Une partie menée au bout dure au moins ça (ou fait un score non nul). */
export const MIN_GAME_SECONDS = 120;
/** Tables comptées au plus par semaine de classement. */
export const WEEK_TABLES_MAX = 10;
/** Niveau de départ calculé sur l'historique : au plus ça (niveau 33 environ). */
export const START_XP_MAX = 30_000;
/** Derniers gains gardés (récap « Mon niveau »). */
export const GAINS_MAX = 40;
/** Jours gardés pour le plafond quotidien, Marathon et « Cette semaine ». */
export const DAYS_KEEP = 45;
/** Somme des XP de tous les badges (badges.ts), comptée dans la vraisemblance (vérifié par levels.test.ts). */
export const BADGES_XP_ALL = 13_650;
/** XP de la vie sociale au plus par jour (hors parties en ligne, comptées dans le jeu). */
export const DAILY_SOCIAL_CAP = 100;

export const XP = {
  minute: 1,
  game: 10,
  firstOfDay: 20,
  newTable: 50,
  personalBest: 25,
  honor: 50,
  champion: 100,
  live: 20,
  liveWin: 20,
  roomDay: 10,
  friend: 25,
  like: 2,
  reaction: 1,
} as const;

export type RankingScopeXp = 'world' | 'country' | 'friends';

/** XP d'une place de la semaine : [jusqu'à cette place, XP], du mieux placé au moins bien. */
export const RANKING_XP: Record<RankingScopeXp, readonly (readonly [number, number])[]> = {
  world: [[1, 300], [3, 150], [10, 75], [100, 25]],
  country: [[1, 150], [3, 75], [10, 40]],
  friends: [[1, 30], [3, 15]],
};

/** Joueurs classés au minimum pour que la place rapporte. */
export const RANKING_MIN_PLAYERS: Record<RankingScopeXp, number> = { world: 10, country: 5, friends: 3 };

/** XP au plus en une semaine de classement (vraisemblance). */
const WEEK_RANKING_MAX = WEEK_TABLES_MAX * 300;

// ---------------------------------------------------------------------------
// Courbe et paliers

/** XP pour passer du niveau n au niveau n + 1. */
export const levelNeed = (n: number): number => 100 + 50 * (Math.max(1, n) - 1);

/** XP total qu'il faut pour atteindre le niveau n. */
export const levelStart = (n: number): number => (n <= 1 ? 0 : 100 * (n - 1) + 25 * (n - 1) * (n - 2));

export const TIER_IDS = ['novice', 'flippeur', 'habitue', 'expert', 'maitre', 'sorcier', 'legende'] as const;
export type TierId = (typeof TIER_IDS)[number];

/** Le palier d'un niveau : un tous les dix niveaux, « Légende » à partir du 60. */
export const tierOf = (level: number): TierId => TIER_IDS[Math.min(TIER_IDS.length - 1, Math.floor(Math.max(1, level) / 10))]!;

export function tierLabel(tier: TierId): string {
  switch (tier) {
    case 'novice':
      return t('Novice');
    case 'flippeur':
      return t('Flippeur');
    case 'habitue':
      return t('Habitué');
    case 'expert':
      return t('Expert');
    case 'maitre':
      return t('Maître');
    case 'sorcier':
      return t('Sorcier');
    case 'legende':
      return t('Légende');
  }
}

export interface LevelView {
  level: number;
  /** XP total. */
  xp: number;
  /** XP déjà faits dans le niveau en cours. */
  into: number;
  /** XP du niveau en cours (levelNeed). */
  need: number;
  /** De 0 à 1. */
  progress: number;
  tier: TierId;
}

export function levelOf(xp: number): LevelView {
  const total = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  while (levelStart(level + 1) <= total) level++;
  const into = total - levelStart(level);
  const need = levelNeed(level);
  return { level, xp: total, into, need, progress: into / need, tier: tierOf(level) };
}

// ---------------------------------------------------------------------------
// État

export type XpKind = 'play' | 'game' | 'first-of-day' | 'new-table' | 'personal-best' | 'honor' | 'champion' | 'live' | 'live-win' | 'ranking' | 'badge' | 'start' | 'room-day' | 'friend' | 'like' | 'reaction';

export interface XpGain {
  kind: XpKind;
  xp: number;
  at: string;
  /** La table (partie, record, classement). */
  table?: string;
  /** play : minutes ; personal-best : le score. */
  value?: number;
  /** ranking : la portée et la place. */
  scope?: RankingScopeXp;
  rank?: number;
  /** badge : son identifiant. */
  badge?: string;
}

export interface Place {
  rank: number;
  players: number;
}

/** Où était le joueur dans les classements de la semaine d'une version de table. */
export interface Standing {
  title: string;
  world?: Place;
  country?: Place;
  friends?: Place;
}

/** Ce qui reste à montrer au joueur au retour sur l'écran des tables : badges reçus, XP avant et après. */
export interface Celebration {
  badges: string[];
  from: number;
  to: number;
  at: string;
  /** Le niveau de départ, au premier lancement de la version. */
  start?: true;
}

export interface LevelFeats {
  countryTop10: number;
  countryPodium: number;
  worldTop10: number;
  worldFirst: number;
  /** Semaines de suite dans le top 100 mondial d'une table ; la dernière. */
  top100Streak: number;
  lastTop100Week?: string;
}

export interface LevelState {
  v: number;
  xp: number;
  gains: XpGain[];
  /** Par jour local (AAAA-MM-JJ) : XP de jeu, secondes jouées, parties, XP de la vie sociale. */
  days: Record<string, { xp: number; seconds: number; games: number; social?: number }>;
  /** Jours où le joueur a écrit dans un salon ou un groupe ; le dernier. */
  roomDays: number;
  lastRoomDay?: string;
  /** Amis déjà comptés (une seule fois chacun, même retiré puis revenu). */
  friendKeys: string[];
  /** « J'aime » reçus et réactions reçues, comptés depuis toujours (ils ne font que monter). */
  likesCounted: number;
  reactionsCounted: number;
  /** Leurs identifiants déjà comptés (receivedGains). */
  seenLikes: string[];
  seenReactions: string[];
  /** Meilleur score de chaque table (tableKey) relevé par Cyber Pinball. */
  bests: Record<string, number>;
  /** Dernier jour où un record personnel a rapporté, par table. */
  bestPaid: Record<string, string>;
  beaten: number;
  doubled: number;
  nightOwl: boolean;
  vr: boolean;
  vision3d: boolean;
  firstPlay?: string;
  lastPlay?: string;
  /** Semaines de classement déjà versées (lundi, AAAA-MM-JJ). */
  weeks: string[];
  /** Semaine (lundi) → version de table → places relevées. */
  standings: Record<string, Record<string, Standing>>;
  feats: LevelFeats;
  /** Niveau de départ calculé le (ISO) ; absent : pas encore. */
  started?: string;
  pending?: Celebration;
}

export const emptyLevels = (): LevelState => ({
  v: LEVELS_VERSION,
  xp: 0,
  gains: [],
  days: {},
  roomDays: 0,
  friendKeys: [],
  likesCounted: 0,
  reactionsCounted: 0,
  seenLikes: [],
  seenReactions: [],
  bests: {},
  bestPaid: {},
  beaten: 0,
  doubled: 0,
  nightOwl: false,
  vr: false,
  vision3d: false,
  weeks: [],
  standings: {},
  feats: { countryTop10: 0, countryPodium: 0, worldTop10: 0, worldFirst: 0, top100Streak: 0 },
});

const pad = (n: number) => String(n).padStart(2, '0');
/** Jour local AAAA-MM-JJ. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** La semaine des tableaux (lundi, AAAA-MM-JJ). */
export const weekKey = (d: Date): string => dayKey(periodStart('week', d)!);
const dateOfKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Une table, partout la même : son identifiant VPS, sinon son titre. */
export const tableKey = (table: Pick<PresenceTable, 'title' | 'vpsId'>): string => table.vpsId ?? table.title.toLowerCase();

function addGains(state: LevelState, gains: readonly XpGain[]): LevelState {
  const paid = gains.filter((g) => g.xp > 0);
  if (!paid.length) return state;
  return { ...state, xp: state.xp + paid.reduce((a, g) => a + g.xp, 0), gains: [...[...paid].reverse(), ...state.gains].slice(0, GAINS_MAX) };
}

/** Garde les gains sous le plafond du jour, dans l'ordre : le dernier gain servi est réduit. */
function capGains(gains: readonly XpGain[], room: number): XpGain[] {
  const out: XpGain[] = [];
  let left = Math.max(0, room);
  for (const g of gains) {
    const xp = Math.min(g.xp, left);
    left -= xp;
    if (xp > 0) out.push({ ...g, xp });
  }
  return out;
}

function pruneDays(days: LevelState['days'], now: Date): LevelState['days'] {
  const oldest = dayKey(addDays(now, -DAYS_KEEP));
  return Object.fromEntries(Object.entries(days).filter(([k]) => k >= oldest));
}

// ---------------------------------------------------------------------------
// Une partie

export interface GameFacts {
  table: PresenceTable;
  seconds: number;
  /** Scores du joueur relevés à la fin de la partie ; absent : rien de relevé (Pinball FX, ROM sans lecture). */
  scores?: readonly number[];
  /** Places prises au tableau d'honneur de la table. */
  entered: readonly number[];
  /** Première partie sur cette table (son .info ne comptait aucune partie). */
  newTable: boolean;
  /** Partie en VR (casque) ou en vision 3D. */
  mode?: 'vr' | 'vision3d';
  at: Date;
}

export interface GameOutcome {
  state: LevelState;
  gains: XpGain[];
  /** Le plafond du jour a retenu une part des XP. */
  capped: boolean;
}

export function gameGains(state: LevelState, f: GameFacts): GameOutcome {
  const at = f.at.toISOString();
  const day = dayKey(f.at);
  const today = state.days[day] ?? { xp: 0, seconds: 0, games: 0 };
  const best = Math.max(0, ...(f.scores ?? []));
  const scored = f.scores === undefined ? undefined : best > 0;
  // Une table laissée ouverte sans jouer : ses scores relevés sont nuls, ses minutes ne comptent pas.
  const active = scored !== false || f.entered.length > 0;
  const done = f.seconds >= MIN_GAME_SECONDS || scored === true;
  const title = f.table.title;
  const key = tableKey(f.table);
  const wanted: XpGain[] = [];
  const minutes = active ? Math.min(GAME_MINUTES_MAX, Math.floor(Math.max(0, f.seconds) / 60)) : 0;
  if (minutes) wanted.push({ kind: 'play', xp: minutes * XP.minute, at, table: title, value: minutes });
  if (done) {
    wanted.push({ kind: 'game', xp: XP.game, at, table: title });
    if (!today.games) wanted.push({ kind: 'first-of-day', xp: XP.firstOfDay, at });
    if (f.newTable) wanted.push({ kind: 'new-table', xp: XP.newTable, at, table: title });
  }
  const previous = state.bests[key];
  let next: LevelState = { ...state };
  if (best > 0 && best > (previous ?? 0)) {
    next = { ...next, bests: { ...next.bests, [key]: best } };
    // Le premier score d'une table la pose, il ne bat rien.
    if (previous !== undefined && previous > 0) {
      next = { ...next, beaten: next.beaten + 1, doubled: next.doubled + (best >= 2 * previous ? 1 : 0) };
      if (next.bestPaid[key] !== day) {
        wanted.push({ kind: 'personal-best', xp: XP.personalBest, at, table: title, value: best });
        next = { ...next, bestPaid: { ...next.bestPaid, [key]: day } };
      }
    }
  }
  if (f.entered.some((r) => r === 1)) wanted.push({ kind: 'champion', xp: XP.champion, at, table: title });
  else if (f.entered.length) wanted.push({ kind: 'honor', xp: XP.honor, at, table: title });
  const gains = capGains(wanted, DAILY_PLAY_CAP - today.xp);
  const paid = gains.reduce((a, g) => a + g.xp, 0);
  const hour = f.at.getHours();
  next = {
    ...next,
    days: pruneDays({ ...next.days, [day]: { xp: today.xp + paid, seconds: today.seconds + Math.max(0, Math.round(f.seconds)), games: today.games + (done ? 1 : 0) } }, f.at),
    ...(done && hour >= 2 && hour < 5 ? { nightOwl: true } : {}),
    ...(done && f.mode === 'vr' ? { vr: true } : {}),
    ...(done && f.mode === 'vision3d' ? { vision3d: true } : {}),
    ...(done ? { firstPlay: next.firstPlay ?? at, lastPlay: at } : {}),
  };
  return { state: addGains(next, gains), gains, capped: paid < wanted.reduce((a, g) => a + g.xp, 0) };
}

/** Une partie en direct finie : menée au bout, gagnée (première place, à deux classés au moins). */
export function liveGains(state: LevelState, f: { done: boolean; won: boolean; table: string; at: Date }): GameOutcome {
  const at = f.at.toISOString();
  const wanted: XpGain[] = [];
  if (f.done) wanted.push({ kind: 'live', xp: XP.live, at, table: f.table });
  if (f.done && f.won) wanted.push({ kind: 'live-win', xp: XP.liveWin, at, table: f.table });
  const day = dayKey(f.at);
  const today = state.days[day] ?? { xp: 0, seconds: 0, games: 0 };
  const gains = capGains(wanted, DAILY_PLAY_CAP - today.xp);
  const paid = gains.reduce((a, g) => a + g.xp, 0);
  const next = { ...state, days: pruneDays({ ...state.days, [day]: { ...today, xp: today.xp + paid } }, f.at) };
  return { state: addGains(next, gains), gains, capped: paid < wanted.reduce((a, g) => a + g.xp, 0) };
}

// ---------------------------------------------------------------------------
// Vie sociale (plafond DAILY_SOCIAL_CAP)

function socialGains(state: LevelState, wanted: readonly XpGain[], at: Date): { state: LevelState; gains: XpGain[] } {
  const day = dayKey(at);
  const today = state.days[day] ?? { xp: 0, seconds: 0, games: 0 };
  const gains = capGains(wanted, DAILY_SOCIAL_CAP - (today.social ?? 0));
  const paid = gains.reduce((a, g) => a + g.xp, 0);
  const next = paid ? { ...state, days: pruneDays({ ...state.days, [day]: { ...today, social: (today.social ?? 0) + paid } }, at) } : state;
  return { state: addGains(next, gains), gains };
}

/** Un message écrit dans un salon ou un groupe : le premier du jour rapporte, et compte un jour de présence. */
export function roomMessageGains(state: LevelState, at: Date): { state: LevelState; gains: XpGain[] } {
  const day = dayKey(at);
  if (state.lastRoomDay === day) return { state, gains: [] };
  return socialGains({ ...state, roomDays: state.roomDays + 1, lastRoomDay: day }, [{ kind: 'room-day', xp: XP.roomDay, at: at.toISOString() }], at);
}

/** Mes amis : chacun rapporte une fois, la première fois qu'on le voit parmi eux. */
export function friendsGains(state: LevelState, keys: readonly string[], at: Date, quiet = false): { state: LevelState; gains: XpGain[] } {
  const known = new Set(state.friendKeys);
  const fresh = keys.filter((k) => !known.has(k));
  if (!fresh.length) return { state, gains: [] };
  const next = { ...state, friendKeys: [...state.friendKeys, ...fresh].slice(-2000) };
  // Les amis d'avant les niveaux : comptés sans XP (le niveau de départ ne les paie pas non plus).
  if (quiet) return { state: next, gains: [] };
  return socialGains(next, fresh.map(() => ({ kind: 'friend' as const, xp: XP.friend, at: at.toISOString() })), at);
}

/** Identifiants gardés au plus pour reconnaître un « J'aime » ou une réaction déjà comptés. */
export const SEEN_IDS_MAX = 5000;

/**
 * « J'aime » reçus et réactions reçues, par leur identifiant (« qui|quoi ») : chacun ne compte qu'une
 * fois, même si la borne l'oublie ensuite (7 jours de salon, 30 jours d'activité publique). Les
 * totaux (likesCounted, reactionsCounted) ne font que monter : ce sont ceux des badges.
 */
export function receivedGains(state: LevelState, ids: { likes: readonly string[]; reactions: readonly string[] }, at: Date, quiet = false): { state: LevelState; gains: XpGain[] } {
  const seenLikes = new Set(state.seenLikes), seenReactions = new Set(state.seenReactions);
  const newLikes = [...new Set(ids.likes)].filter((id) => !seenLikes.has(id));
  const newReactions = [...new Set(ids.reactions)].filter((id) => !seenReactions.has(id));
  const likes = newLikes.length, reactions = newReactions.length;
  if (!likes && !reactions) return { state, gains: [] };
  const next = {
    ...state,
    likesCounted: state.likesCounted + likes,
    reactionsCounted: state.reactionsCounted + reactions,
    seenLikes: [...state.seenLikes, ...newLikes].slice(-SEEN_IDS_MAX),
    seenReactions: [...state.seenReactions, ...newReactions].slice(-SEEN_IDS_MAX),
  };
  if (quiet || (!likes && !reactions)) return { state: next, gains: [] };
  const iso = at.toISOString();
  const wanted: XpGain[] = [];
  if (likes) wanted.push({ kind: 'like', xp: likes * XP.like, at: iso, value: likes });
  if (reactions) wanted.push({ kind: 'reaction', xp: reactions * XP.reaction, at: iso, value: reactions });
  return socialGains(next, wanted, at);
}

/** Badges reçus : leurs XP, hors plafond (chaque badge ne se gagne qu'une fois). */
export function badgeGains(state: LevelState, badges: readonly { id: string; xp: number }[], now: Date): { state: LevelState; gains: XpGain[] } {
  const gains = badges.map((b) => ({ kind: 'badge' as const, xp: b.xp, at: now.toISOString(), badge: b.id }));
  return { state: addGains(state, gains), gains };
}

// ---------------------------------------------------------------------------
// Classements de la semaine

/** XP d'une place, ou 0 : place trop loin, ou trop peu de joueurs classés. */
export function placeXp(scope: RankingScopeXp, place: Place | undefined): number {
  if (!place || place.players < RANKING_MIN_PLAYERS[scope]) return 0;
  return RANKING_XP[scope].find(([upTo]) => place.rank <= upTo)?.[1] ?? 0;
}

/** La meilleure des trois portées pour une table. */
export function standingXp(s: Standing): { xp: number; scope?: RankingScopeXp; rank?: number } {
  let out: { xp: number; scope?: RankingScopeXp; rank?: number } = { xp: 0 };
  for (const scope of ['world', 'country', 'friends'] as const) {
    const xp = placeXp(scope, s[scope]);
    if (xp > out.xp) out = { xp, scope, rank: s[scope]!.rank };
  }
  return out;
}

/**
 * Places relevées pour une version de table. Pendant la semaine, la dernière relève l'emporte ;
 * semaine close (`closed`), la borne ne garde plus tous les scores des autres : la place la moins
 * bonne l'emporte, jamais une place gagnée parce qu'un meilleur score est sorti de la mémoire.
 */
export function noteStanding(state: LevelState, week: string, board: string, s: Standing, closed: boolean): LevelState {
  const known = state.standings[week]?.[board];
  let merged = s;
  if (closed && known) {
    const worse = (a?: Place, b?: Place) => (!a ? b : !b ? a : a.rank >= b.rank ? a : b);
    merged = { title: s.title, ...pick('world', worse(known.world, s.world)), ...pick('country', worse(known.country, s.country)), ...pick('friends', worse(known.friends, s.friends)) };
  }
  return { ...state, standings: { ...state.standings, [week]: { ...state.standings[week], [board]: merged } } };
}
const pick = (k: RankingScopeXp, p?: Place) => (p ? { [k]: p } : {});

/** Les semaines à relever une dernière fois (closes, pas encore versées). */
export function closedWeeks(state: LevelState, now: Date): string[] {
  const current = weekKey(now);
  return Object.keys(state.standings).filter((w) => w < current && !state.weeks.includes(w));
}

/**
 * Semaines closes depuis plus d'un jour (le mardi 0 h) et pas encore versées : leurs XP, et les
 * exploits pour les badges de classement. Les relevés de plus de trois semaines partent.
 */
export function settleWeeks(state: LevelState, now: Date): { state: LevelState; gains: XpGain[] } {
  let next = state;
  const gains: XpGain[] = [];
  const due = Object.keys(state.standings)
    .filter((w) => !state.weeks.includes(w) && now.getTime() >= addDays(dateOfKey(w), 8).getTime())
    .sort();
  for (const week of due) {
    const boards = Object.values(next.standings[week] ?? {});
    const paid = boards
      .map((s) => ({ s, ...standingXp(s) }))
      .filter((b) => b.xp > 0)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, WEEK_TABLES_MAX);
    const at = addDays(dateOfKey(week), 7).toISOString();
    for (const b of paid) gains.push({ kind: 'ranking', xp: b.xp, at, table: b.s.title, scope: b.scope!, rank: b.rank! });
    const feats = { ...next.feats };
    const enough = (scope: RankingScopeXp, p?: Place) => !!p && p.players >= RANKING_MIN_PLAYERS[scope];
    for (const s of boards) {
      if (enough('country', s.country) && s.country!.rank <= 10) feats.countryTop10++;
      if (enough('country', s.country) && s.country!.rank <= 3) feats.countryPodium++;
      if (enough('world', s.world) && s.world!.rank <= 10) feats.worldTop10++;
      if (enough('world', s.world) && s.world!.rank === 1) feats.worldFirst++;
    }
    if (boards.some((s) => enough('world', s.world) && s.world!.rank <= 100)) {
      const previous = dayKey(addDays(dateOfKey(week), -7));
      feats.top100Streak = feats.lastTop100Week === previous ? feats.top100Streak + 1 : 1;
      feats.lastTop100Week = week;
    }
    next = { ...next, feats, weeks: [...next.weeks, week].slice(-60) };
  }
  const oldest = dayKey(addDays(now, -21));
  const standings = Object.fromEntries(Object.entries(next.standings).filter(([w]) => w >= oldest && !next.weeks.includes(w)));
  next = addGains({ ...next, standings }, gains);
  return { state: next, gains };
}

/** XP prévus pour la semaine en cours (récap), table par table. */
export function weekPreview(state: LevelState, now: Date): { title: string; standing: Standing; xp: number }[] {
  return Object.values(state.standings[weekKey(now)] ?? {})
    .map((s) => ({ title: s.title, standing: s, xp: standingXp(s).xp }))
    .sort((a, b) => b.xp - a.xp || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Niveau de départ, vraisemblance

/** L'historique relevé avant les niveaux : ce qu'il aurait rapporté, au plus START_XP_MAX. */
export function startXp(play: { games: number; tables: number; seconds: number }, records: { records: number; championTables: number }): number {
  const raw =
    Math.floor(Math.max(0, play.seconds) / 60) * XP.minute +
    Math.max(0, play.games) * XP.game +
    Math.max(0, play.tables) * XP.newTable +
    Math.max(0, records.records - records.championTables) * XP.honor +
    Math.max(0, records.championTables) * XP.champion;
  return Math.min(START_XP_MAX, raw);
}

/** Le niveau de départ, une seule fois : le moment à montrer au joueur. */
export function startLevels(state: LevelState, xp: number, now: Date): LevelState {
  if (state.started) return state;
  const gains: XpGain[] = xp > 0 ? [{ kind: 'start', xp, at: now.toISOString() }] : [];
  const next = addGains({ ...state, started: now.toISOString() }, gains);
  return { ...next, pending: { badges: [], from: 0, to: next.xp, at: now.toISOString(), start: true } };
}

/** Un moment à montrer : badges reçus et XP gagnés s'ajoutent à celui qui attend encore. */
export function celebrate(state: LevelState, from: number, badges: readonly string[], now: Date): LevelState {
  if (state.xp === from && !badges.length) return state;
  const p = state.pending;
  return { ...state, pending: { badges: [...(p?.badges ?? []), ...badges.filter((b) => !p?.badges.includes(b))], from: p?.from ?? from, to: state.xp, at: now.toISOString(), ...(p?.start ? { start: true as const } : {}) } };
}

/** XP qu'un joueur peut avoir au plus, vu pour la première fois il y a `days` jours. */
export function plausibleXp(days: number): number {
  const d = Math.max(0, Math.floor(days)) + 1;
  return START_XP_MAX + BADGES_XP_ALL + d * (DAILY_PLAY_CAP + DAILY_SOCIAL_CAP) + Math.ceil(d / 7) * WEEK_RANKING_MAX;
}

/**
 * XP au plus en une semaine (classement des joueurs de la semaine, playerranking.ts) : sept jours de
 * jeu et de vie sociale au plafond, les classements de la semaine d'avant versés le mardi, et tous les
 * badges d'un coup (la première semaine d'un joueur les reçoit avec son niveau de départ, hors départ).
 */
export const WEEK_XP_MAX = BADGES_XP_ALL + 7 * (DAILY_PLAY_CAP + DAILY_SOCIAL_CAP) + WEEK_RANKING_MAX;

/** Les niveaux sont arrivés ce jour-là (0.1.14-essai.34) : personne n'a pu gagner d'XP avant. */
export const LEVELS_SINCE = '2026-11-17T00:00:00Z';

/** Le total qu'aucun joueur ne peut avoir dépassé à cette date, quelle que soit son ancienneté. */
export const levelsXpCeiling = (now: Date): number => plausibleXp((now.getTime() - Date.parse(LEVELS_SINCE)) / 86_400_000);

/** Le niveau à montrer d'un autre joueur : undefined (« ? ») s'il n'est pas vraisemblable. */
export function shownLevel(xp: number | undefined, firstSeen: string | undefined, now: Date): number | undefined {
  if (xp === undefined) return undefined;
  const since = firstSeen ? Date.parse(firstSeen) : now.getTime();
  const days = Number.isFinite(since) ? (now.getTime() - since) / 86_400_000 : 0;
  return xp <= plausibleXp(days) ? levelOf(xp).level : undefined;
}

/** XP de la semaine en cours (récap). */
export function weekXp(state: LevelState, now: Date): number {
  const start = periodStart('week', now)!.getTime();
  return state.gains.filter((g) => g.kind !== 'start' && Date.parse(g.at) >= start).reduce((a, g) => a + g.xp, 0);
}

/** La plus longue journée de jeu relevée, en secondes (Marathon). */
export const longestDay = (state: LevelState): number => Math.max(0, ...Object.values(state.days).map((d) => d.seconds));

/** Jours entre la première et la dernière partie relevées (Fidèle). */
export function playedSpanDays(state: LevelState): number {
  if (!state.firstPlay || !state.lastPlay) return 0;
  return Math.max(0, Math.floor((Date.parse(state.lastPlay) - Date.parse(state.firstPlay)) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Fichier

const num = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const XP_KINDS = new Set<string>(['play', 'game', 'first-of-day', 'new-table', 'personal-best', 'honor', 'champion', 'live', 'live-win', 'ranking', 'badge', 'start', 'room-day', 'friend', 'like', 'reaction']);
const isKey = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 200;
const SCOPES = new Set<string>(['world', 'country', 'friends']);

function parseGain(raw: unknown): XpGain | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !XP_KINDS.has(r.kind) || !isIso(r.at)) return undefined;
  const xp = num(r.xp, 1_000_000);
  return {
    kind: r.kind as XpKind,
    xp,
    at: r.at,
    ...(typeof r.table === 'string' && r.table.length <= 120 ? { table: r.table } : {}),
    ...(typeof r.value === 'number' ? { value: num(r.value) } : {}),
    ...(typeof r.scope === 'string' && SCOPES.has(r.scope) ? { scope: r.scope as RankingScopeXp } : {}),
    ...(typeof r.rank === 'number' ? { rank: num(r.rank, 100_000) } : {}),
    ...(typeof r.badge === 'string' && /^[a-z0-9-]{1,40}$/.test(r.badge) ? { badge: r.badge } : {}),
  };
}

function parsePlace(raw: unknown): Place | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const rank = num(r.rank, 1_000_000);
  return rank >= 1 ? { rank, players: num(r.players, 1_000_000) } : undefined;
}

export function parseLevels(raw: unknown): LevelState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.v !== LEVELS_VERSION) return undefined;
  const base = emptyLevels();
  const days: LevelState['days'] = {};
  if (r.days && typeof r.days === 'object') for (const [k, v] of Object.entries(r.days as Record<string, unknown>)) {
    if (!isDay(k) || !v || typeof v !== 'object') continue;
    const d = v as Record<string, unknown>;
    days[k] = { xp: num(d.xp), seconds: num(d.seconds), games: num(d.games), ...(d.social !== undefined ? { social: num(d.social) } : {}) };
  }
  const record = (v: unknown, ok: (x: unknown) => boolean) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => k.length <= 160 && ok(x))) : {});
  const standings: LevelState['standings'] = {};
  if (r.standings && typeof r.standings === 'object') for (const [week, boards] of Object.entries(r.standings as Record<string, unknown>)) {
    if (!isDay(week) || !boards || typeof boards !== 'object') continue;
    const out: Record<string, Standing> = {};
    for (const [board, s] of Object.entries(boards as Record<string, unknown>)) {
      if (!s || typeof s !== 'object' || board.length > 300) continue;
      const v = s as Record<string, unknown>;
      if (typeof v.title !== 'string') continue;
      const w = parsePlace(v.world), c = parsePlace(v.country), f = parsePlace(v.friends);
      out[board] = { title: v.title.slice(0, 120), ...(w ? { world: w } : {}), ...(c ? { country: c } : {}), ...(f ? { friends: f } : {}) };
    }
    standings[week] = out;
  }
  const feats = (r.feats && typeof r.feats === 'object' ? r.feats : {}) as Record<string, unknown>;
  const p = r.pending && typeof r.pending === 'object' ? (r.pending as Record<string, unknown>) : undefined;
  const pending: Celebration | undefined =
    p && Array.isArray(p.badges) && isIso(p.at)
      ? { badges: p.badges.filter((b): b is string => typeof b === 'string' && /^[a-z0-9-]{1,40}$/.test(b)).slice(0, 60), from: num(p.from), to: num(p.to), at: p.at, ...(p.start === true ? { start: true as const } : {}) }
      : undefined;
  return {
    ...base,
    xp: num(r.xp),
    gains: Array.isArray(r.gains) ? r.gains.map(parseGain).filter((g): g is XpGain => !!g).slice(0, GAINS_MAX) : [],
    days,
    roomDays: num(r.roomDays),
    ...(isDay(r.lastRoomDay) ? { lastRoomDay: r.lastRoomDay } : {}),
    friendKeys: Array.isArray(r.friendKeys) ? r.friendKeys.filter(isKey).slice(-2000) : [],
    likesCounted: num(r.likesCounted),
    reactionsCounted: num(r.reactionsCounted),
    seenLikes: Array.isArray(r.seenLikes) ? r.seenLikes.filter((x): x is string => typeof x === 'string' && x.length <= 300).slice(-SEEN_IDS_MAX) : [],
    seenReactions: Array.isArray(r.seenReactions) ? r.seenReactions.filter((x): x is string => typeof x === 'string' && x.length <= 300).slice(-SEEN_IDS_MAX) : [],
    bests: record(r.bests, (x) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0) as Record<string, number>,
    bestPaid: record(r.bestPaid, isDay) as Record<string, string>,
    beaten: num(r.beaten),
    doubled: num(r.doubled),
    nightOwl: r.nightOwl === true,
    vr: r.vr === true,
    vision3d: r.vision3d === true,
    ...(isIso(r.firstPlay) ? { firstPlay: r.firstPlay } : {}),
    ...(isIso(r.lastPlay) ? { lastPlay: r.lastPlay } : {}),
    weeks: Array.isArray(r.weeks) ? r.weeks.filter(isDay).slice(-60) : [],
    standings,
    feats: {
      countryTop10: num(feats.countryTop10),
      countryPodium: num(feats.countryPodium),
      worldTop10: num(feats.worldTop10),
      worldFirst: num(feats.worldFirst),
      top100Streak: num(feats.top100Streak),
      ...(isDay(feats.lastTop100Week) ? { lastTop100Week: feats.lastTop100Week } : {}),
    },
    ...(isIso(r.started) ? { started: r.started } : {}),
    ...(pending ? { pending } : {}),
  };
}

/**
 * Le niveau de la borne. Un fichier illisible est mis de côté (niveau.json.illisible-<date>) et la
 * borne repart d'un niveau neuf, recalculé sur l'historique ; un fichier d'une version plus récente
 * n'est pas touché.
 */
export function loadLevels(dir: string, now = new Date()): { state: LevelState; setAside?: string; newer?: boolean } {
  const file = path.join(dir, LEVELS_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { state: emptyLevels() };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  if (raw && typeof raw === 'object' && typeof (raw as { v?: unknown }).v === 'number' && (raw as { v: number }).v > LEVELS_VERSION) return { state: emptyLevels(), newer: true };
  const state = parseLevels(raw);
  if (state) return { state };
  const aside = `${file}.illisible-${now.toISOString().replace(/[:.]/g, '-')}`; // i18n-ignore : nom de fichier
  try {
    renameWithRetry(file, aside);
  } catch {
    return { state: emptyLevels() };
  }
  return { state: emptyLevels(), setAside: aside };
}

export function saveLevels(dir: string, state: LevelState): void {
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(path.join(dir, LEVELS_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Textes

/** Ce qu'a rapporté un gain, en une ligne (récap « Mon niveau »). */
export function gainText(g: XpGain, badgeLabel: (id: string) => string): { text: string; detail?: string } {
  const table = g.table;
  switch (g.kind) {
    case 'play':
      return { text: t('Partie de {n} min', { n: g.value ?? 0 }), ...(table ? { detail: table } : {}) };
    case 'game':
      return { text: t('Partie menée au bout'), ...(table ? { detail: table } : {}) };
    case 'first-of-day':
      return { text: t('Première partie du jour') };
    case 'new-table':
      return { text: t('Nouvelle table'), ...(table ? { detail: t('{table} · première partie', { table }) } : {}) };
    case 'personal-best':
      return { text: t('Record personnel battu'), ...(table ? { detail: g.value ? `${table} · ${g.value.toLocaleString()}` : table } : {}) };
    case 'honor':
      return { text: t('Au tableau d’honneur'), ...(table ? { detail: table } : {}) };
    case 'champion':
      return { text: t('Meilleur score de la table'), ...(table ? { detail: table } : {}) };
    case 'live':
      return { text: t('Partie en direct menée au bout'), ...(table ? { detail: table } : {}) };
    case 'live-win':
      return { text: t('Partie en direct gagnée'), ...(table ? { detail: table } : {}) };
    case 'ranking':
      return { text: t('Classement de la semaine'), ...(table ? { detail: `${table} · ${placeText(g.scope, g.rank)}` } : {}) };
    case 'badge':
      return { text: t('Badge {name}', { name: badgeLabel(g.badge ?? '') }) };
    case 'start':
      return { text: t('Niveau de départ'), detail: t('Vos parties d’avant les niveaux') };
    case 'room-day':
      return { text: t('Présent au salon'), detail: t('Premier message du jour') };
    case 'friend':
      return { text: t('Nouvel ami') };
    case 'like':
      return { text: tn(g.value ?? 1, '{n} « J’aime » reçu', '{n} « J’aime » reçus') };
    case 'reaction':
      return { text: tn(g.value ?? 1, '{n} réaction reçue', '{n} réactions reçues') };
  }
}

/** « 4e en France », « 23e au monde », « 1er entre amis ». */
export function placeText(scope: RankingScopeXp | undefined, rank: number | undefined): string {
  const n = rank ?? 0;
  const place = n === 1 ? t('1er') : t('{n}e', { n });
  if (scope === 'world') return t('{place} au monde', { place });
  if (scope === 'country') return t('{place} dans votre pays', { place });
  return t('{place} entre amis', { place });
}
