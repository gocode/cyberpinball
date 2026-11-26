// Ce qui pique et ce qui récompense (engagement, planche validée le 21/11/2026, `homeArene` et
// `homeRetour`) : les dépassements sur une version exacte de table, calculés sur les classements publiés
// (rankings.ts) et les tables du jour (dailytables.ts), sans réseau ni écran.
//
// - Place prise : des scores relayés arrivent ; un joueur passe devant moi au classement du jour, ou
//   de tout temps, sur une version que j'ai jouée (j'y ai publié un score). Son score est récent (moins
//   d'un jour) et postérieur au mien : il ne m'avait pas déjà devancé quand j'ai joué. La notification
//   « Léa vous a dépassé sur Attack from Mars » en vient, une fois par table et par jour au plus
//   (placeTakenKey), et l'Arène en fait son action du moment tant que la place reste prise (stillTaken).
// - Retour de partie : ma partie vient de publier un score ; les joueurs que je passe, la place gagnée
//   et le prochain à battre (gameOvertake) ; sans dépassement, la place de la partie (gameStanding).
//   L'écran de retour s'ouvre après toute partie dont le score est connu (26/11/2026).
//
// On compare toujours la même version exacte et le même nombre de billes (boardKey, groupboard.ts).

import { t } from './i18n';
import { dayKey } from './levels';
import { rankedOn, type DailyHolder, type DailyInput, type DailyScope } from './dailytables';
import type { RankedScore } from './rankings';

/** Une place prise il y a plus d'un jour n'est plus une nouvelle (comme l'action du moment de l'Arène). */
export const PLACE_TAKEN_FRESH_MS = 24 * 3600_000;

export type OvertakePeriod = 'today' | 'all';

/** Un joueur vient de passer devant moi. */
export interface PlaceTaken {
  board: string;
  balls?: number;
  /** La table, nommée comme dans le score reçu. */
  title: string;
  /** Le classement où il me passe devant : celui du jour d'abord, sinon de tout temps. */
  period: OvertakePeriod;
  /** Celui qui me passe devant (son meilleur score de la période). */
  rival: DailyHolder;
  /** Ma place maintenant, et mon meilleur score de la période. */
  mine: DailyHolder;
  /** Joueurs de ce classement. */
  players: number;
}

const groupOf = (s: { board: string; balls?: number }) => `${s.board}|${s.balls ?? ''}`;
const versionOf = (s: { board: string; balls?: number }) => ({ board: s.board, ...(s.balls ? { balls: s.balls } : {}) });
const same = (a: RankedScore, b: RankedScore) => a.key === b.key && groupOf(a) === groupOf(b) && a.score === b.score && a.at === b.at;

/** Les mêmes données, sans certains scores : le classement tel qu'il était avant leur arrivée. */
function without(input: DailyInput, drop: (s: RankedScore) => boolean): DailyInput {
  return { ...input, store: { ...input.store, scores: input.store.scores.filter((s) => !drop(s)) } };
}

/** Identité de la notification : une table, un jour. Le journal d'Activité la garde d'un démarrage à l'autre. */
export function placeTakenKey(table: { board: string; balls?: number }, at: Date): string {
  return `place|${table.board}|${table.balls ?? ''}|${dayKey(at)}`;
}

/** La version d'une clé de notification (placeTakenKey) ; undefined : clé d'une autre forme. */
export function placeTakenTable(key: string): { board: string; balls?: number } | undefined {
  const [kind, board, balls] = key.split('|');
  if (kind !== 'place' || !board) return undefined;
  const n = Number(balls);
  return { board, ...(balls && Number.isInteger(n) && n > 0 ? { balls: n } : {}) };
}

/**
 * Les places qu'on vient de me prendre, à l'arrivée de scores relayés (`fresh`, déjà gardés dans
 * `input.store`) : par version, celui qui me passe devant au classement mondial du jour, sinon de tout
 * temps. Rien sur une version où je n'ai rien publié, rien pour un score de plus d'un jour, rien pour
 * un joueur qui était déjà devant moi.
 */
export function placesTaken(input: DailyInput, fresh: readonly RankedScore[], opts: { now?: Date } = {}): PlaceTaken[] {
  const me = input.me?.key;
  if (!me) return [];
  const now = opts.now ?? new Date();
  const news = fresh.filter((s) => {
    const at = Date.parse(s.at);
    return s.key !== me && Number.isFinite(at) && now.getTime() - at < PLACE_TAKEN_FRESH_MS && at <= now.getTime() + 60_000;
  });
  if (!news.length) return [];
  const byVersion = new Map<string, RankedScore[]>();
  for (const s of news) byVersion.set(groupOf(s), [...(byVersion.get(groupOf(s)) ?? []), s]);
  const before = without(input, (s) => news.some((f) => same(f, s)));
  const out: PlaceTaken[] = [];
  for (const list of byVersion.values()) {
    const table = versionOf(list[0]!);
    const authors = new Set(list.map((s) => s.key));
    for (const period of ['today', 'all'] as const) {
      const after = rankedOn(input, table, 'world', period, now);
      const mine = after.find((h) => h.mine);
      if (!mine) continue;
      const was = new Map(rankedOn(before, table, 'world', period, now).map((h) => [h.key, h.score]));
      const passers = after.filter((h) => !h.mine && authors.has(h.key) && h.score > mine.score && Date.parse(h.at) > Date.parse(mine.at) && !((was.get(h.key) ?? -1) > mine.score));
      if (!passers.length) continue;
      // Le dernier arrivé : c'est lui qu'on annonce.
      const rival = passers.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
      out.push({ ...table, title: list[list.length - 1]!.table.title, period, rival, mine, players: after.length });
      break;
    }
  }
  return out.sort((a, b) => Date.parse(b.rival.at) - Date.parse(a.rival.at));
}

/** Ce qu'on garde d'une place prise (la notification, sa ligne d'Activité) pour la relire plus tard. */
export interface TakenRef {
  board: string;
  balls?: number;
  title: string;
  /** Clé du joueur qui m'a dépassé. */
  rival: string;
  /** Le classement ; absent (relu du journal) : le jour, sinon de tout temps. */
  period?: OvertakePeriod;
}

/**
 * La place est-elle encore prise ? Le rival encore devant moi dans ce classement, avec un score de
 * moins d'un jour. Rend la situation à jour (ma place, nos scores), ou undefined : je l'ai reprise, ou
 * c'est vieux.
 */
export function stillTaken(input: DailyInput, taken: TakenRef, now = new Date()): PlaceTaken | undefined {
  const table = versionOf(taken);
  for (const period of taken.period ? [taken.period] : (['today', 'all'] as const)) {
    const after = rankedOn(input, table, 'world', period, now);
    const mine = after.find((h) => h.mine);
    const rival = after.find((h) => h.key === taken.rival);
    if (!mine || !rival || rival.score <= mine.score || now.getTime() - Date.parse(rival.at) >= PLACE_TAKEN_FRESH_MS || Date.parse(rival.at) <= Date.parse(mine.at)) continue;
    return { ...table, title: taken.title, period, rival, mine, players: after.length };
  }
  return undefined;
}

/** Ce que ma partie vient de changer dans un classement : qui je passe, ma place, le prochain. */
export interface GameOvertake {
  scope: DailyScope;
  period: OvertakePeriod;
  /** Ma place maintenant, et avant la partie (absente : je n'y étais pas). */
  rank: number;
  previous?: number;
  players: number;
  /** Ceux que je passe, du plus proche (juste derrière moi) au plus loin. */
  passed: DailyHolder[];
  /** Le prochain à battre (juste devant moi), et l'écart ; absent : je suis premier. */
  next?: DailyHolder;
  gap?: number;
}

/**
 * Les dépassements de ma partie, finie depuis `since` (mes scores publiés depuis sont les siens) : dans
 * la portée du pays puis du monde, le classement du jour puis de tout temps, le premier où je passe
 * quelqu'un. Undefined : je ne passe personne (ou rien n'est publié).
 */
export function gameOvertake(input: DailyInput, table: { board: string; balls?: number }, since: Date, opts: { now?: Date } = {}): GameOvertake | undefined {
  return placeOfGame(input, table, since, opts.now ?? new Date(), true);
}

/**
 * La place de ma partie au classement, même si elle ne passe personne (retour de partie : l'écran
 * montre toujours le classement, 26/11/2026) : la portée du pays puis du monde, le classement du jour
 * puis de tout temps, le premier où mon meilleur est celui de cette partie ; `passed` peut être vide.
 * Undefined : son score n'est pas (encore) publié.
 */
export function gameStanding(input: DailyInput, table: { board: string; balls?: number }, since: Date, opts: { now?: Date } = {}): GameOvertake | undefined {
  return placeOfGame(input, table, since, opts.now ?? new Date(), false);
}

function placeOfGame(input: DailyInput, table: { board: string; balls?: number }, since: Date, now: Date, mustPass: boolean): GameOvertake | undefined {
  const me = input.me?.key;
  if (!me) return undefined;
  const from = since.getTime() - 1000;
  const version = versionOf(table);
  const before = without(input, (s) => s.key === me && groupOf(s) === groupOf(version) && Date.parse(s.at) >= from);
  const scopes: readonly DailyScope[] = input.country ? ['country', 'world'] : ['world'];
  for (const scope of scopes) {
    for (const period of ['today', 'all'] as const) {
      const after = rankedOn(input, version, scope, period, now);
      const mine = after.find((h) => h.mine);
      // Mon meilleur de la période doit être celui de cette partie.
      if (!mine || Date.parse(mine.at) < from) continue;
      const prior = rankedOn(before, version, scope, period, now);
      const old = prior.find((h) => h.mine);
      const passed = after.filter((h) => !h.mine && h.score < mine.score && h.score > (old?.score ?? -1)).sort((a, b) => b.score - a.score);
      if (mustPass && !passed.length) continue;
      const above = after.filter((h) => !h.mine && h.score > mine.score);
      const next = above[above.length - 1];
      return { scope, period, rank: mine.rank, ...(old ? { previous: old.rank } : {}), players: after.length, passed, ...(next ? { next, gap: next.score - mine.score } : {}) };
    }
  }
  return undefined;
}

/** Ce que ma partie apporte de neuf : un record personnel battu, des joueurs dépassés. */
export interface GameNews {
  record?: { score: number; previous: number };
  overtake?: GameOvertake;
}

/**
 * Ce qu'il y a de neuf : mon record battu (un premier score ne bat rien), ou au moins un joueur dépassé
 * au classement. Undefined : rien de neuf (l'écran s'ouvre quand même, avec le score et la place).
 */
export function gameNews(d: { best?: number; previousBest?: number; overtake?: GameOvertake }): GameNews | undefined {
  const record = d.best !== undefined && d.previousBest !== undefined && d.previousBest > 0 && d.best > d.previousBest ? { score: d.best, previous: d.previousBest } : undefined;
  const overtake = d.overtake?.passed.length ? d.overtake : undefined;
  if (!record && !overtake) return undefined;
  return { ...(record ? { record } : {}), ...(overtake ? { overtake } : {}) };
}

/** « Un mot à Léa » : les phrases préparées du retour de partie, entre amis. */
export function rivalPhrases(): string[] {
  return [t('Belle partie !'), t('À ton tour !'), t('Revanche ?'), t('On fait une partie ?')];
}
