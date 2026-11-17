// Classement des joueurs par XP (Communauté > Classements > Joueurs, 17/11/2026) : entre amis, dans
// le pays, dans le monde ; de tout temps (le total de la carte publique) ou de la semaine (les XP
// gagnés depuis lundi, que la carte porte depuis la même date).
//
// Il compte les joueurs dont cette borne a reçu la carte (publicprofile.ts), et moi. Un total
// impossible pour quiconque (au-delà de ce qui a pu se gagner depuis l'arrivée des niveaux), ou une
// semaine au-delà de ce qu'une semaine permet, ne se classe pas : il est compté à part, jamais caché.
// Un total seulement inattendu pour l'ancienneté du joueur sur cette borne se classe, niveau « ? ».

import { levelOf, levelsXpCeiling, shownLevel, weekKey, WEEK_XP_MAX } from './levels';
import type { CardWeek } from './publicprofile';

export const PLAYER_SCOPES = ['friends', 'country', 'world'] as const;
export type PlayerScope = (typeof PLAYER_SCOPES)[number];
export const PLAYER_PERIODS = ['week', 'all'] as const;
export type PlayerPeriod = (typeof PLAYER_PERIODS)[number];

/** Premières places montrées ; ma ligne s'ajoute au-delà. */
export const PLAYER_BOARD_TOP = 50;

/** Ce que le classement lit d'un joueur : sa carte publique, ou la mienne. */
export interface RankedPlayer {
  key: string;
  name: string;
  country?: string;
  avatar?: string;
  xp?: number;
  week?: CardWeek;
}

export interface PlayerLine {
  rank: number;
  key: string;
  name: string;
  country?: string;
  avatar?: string;
  /** XP de la période (le total, ou ceux de la semaine). */
  xp: number;
  /** Son niveau (d'après son total), s'il est vraisemblable. */
  level?: number;
  /** Un total inattendu pour son ancienneté sur cette borne : niveau montré « ? ». */
  levelUnsure?: true;
  /** Les XP de l'autre période, quand on les connaît : la semaine sous le total, le total sous la semaine. */
  other?: number;
  mine?: true;
}

export interface PlayerBoard {
  lines: PlayerLine[];
  /** Joueurs classés. */
  players: number;
  /** Ma place ; absente : rien à classer (pas d'XP, ou rien cette semaine). */
  me?: { rank: number };
  /** Joueurs écartés : XP impossibles (au-delà de tout ce qui a pu se gagner). */
  doubtful: number;
}

export interface PlayerBoardOptions {
  scope: PlayerScope;
  period: PlayerPeriod;
  /** Mon pays (portée nationale) ; sans lui, la portée nationale est vide. */
  country?: string;
  friends: ReadonlySet<string>;
  /** Moi : classé même si mon profil public est coupé (personne d'autre ne le voit). */
  me?: RankedPlayer;
  /** Première fois que la borne a vu la carte d'un joueur (vraisemblance de son total). */
  firstSeen?(key: string): string | undefined;
  top?: number;
}

/** XP de la semaine d'une carte : ceux de la semaine en cours seulement. */
function weekOf(p: RankedPlayer, now: Date): number | undefined {
  return p.week && p.week.of === weekKey(now) ? p.week.xp : undefined;
}

export function playerBoard(cards: readonly RankedPlayer[], opts: PlayerBoardOptions, now = new Date()): PlayerBoard {
  const me = opts.me;
  const inScope = (p: RankedPlayer) =>
    opts.scope === 'world' ? true : opts.scope === 'country' ? Boolean(opts.country) && p.country === opts.country : p.key === me?.key || opts.friends.has(p.key);
  let doubtful = 0;
  const ceiling = levelsXpCeiling(now);
  const ranked: Omit<PlayerLine, 'rank'>[] = [];
  const seen = new Set<string>();
  for (const p of [...(me ? [me] : []), ...cards]) {
    if (seen.has(p.key) || !inScope(p)) continue;
    seen.add(p.key);
    const mine = p.key === me?.key;
    // Impossible pour quiconque (plus que tout ce qui a pu se gagner depuis l'arrivée des niveaux, ou
    // qu'une semaine permet) : écarté et compté. Seulement inattendu pour une borne qui découvre le
    // joueur : classé, son niveau en « ? » (comme aux tableaux des tables), jamais écarté (une borne
    // neuve écarterait sinon tous les joueurs anciens).
    const week = weekOf(p, now);
    if (!mine && ((p.xp !== undefined && p.xp > ceiling) || (week !== undefined && week > WEEK_XP_MAX))) {
      if (opts.period === 'all' ? (p.xp ?? 0) > 0 : (week ?? 0) > 0) doubtful++;
      continue;
    }
    const level = p.xp === undefined ? undefined : mine ? levelOf(p.xp).level : shownLevel(p.xp, opts.firstSeen?.(p.key), now);
    const unsure = !mine && p.xp !== undefined && level === undefined;
    const common = { key: p.key, name: p.name, ...(p.country ? { country: p.country } : {}), ...(p.avatar ? { avatar: p.avatar } : {}), ...(level ? { level } : {}), ...(unsure ? { levelUnsure: true as const } : {}), ...(mine ? { mine: true as const } : {}) };
    if (opts.period === 'all') {
      if (p.xp === undefined || p.xp <= 0) continue;
      ranked.push({ ...common, xp: p.xp, ...(week !== undefined ? { other: week } : {}) });
    } else {
      if (week === undefined || week <= 0) continue;
      ranked.push({ ...common, xp: week, ...(p.xp !== undefined ? { other: p.xp } : {}) });
    }
  }
  // Les plus d'XP d'abord ; à égalité, le même rang, puis par nom.
  ranked.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const lines: PlayerLine[] = [];
  let rank = 0;
  ranked.forEach((r, i) => {
    if (i === 0 || r.xp !== ranked[i - 1]!.xp) rank = i + 1;
    lines.push({ ...r, rank });
  });
  const top = opts.top ?? PLAYER_BOARD_TOP;
  const mineLine = lines.find((l) => l.mine);
  const shown = lines.slice(0, top);
  if (mineLine && !shown.includes(mineLine)) shown.push(mineLine);
  return { lines: shown, players: lines.length, ...(mineLine ? { me: { rank: mineLine.rank } } : {}), doubtful };
}
