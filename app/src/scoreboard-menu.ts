// Fiche d'une table > « Tableau des scores » (table-scores.ts) : quatre onglets, tout temps
// confondu, cette année, cette semaine, aujourd'hui ; les flippers passent de l'un à l'autre.
// Chaque ligne : la place, les initiales (ou le joueur d'une partie à plusieurs), le score et quand.
// Ce que la table ne permet pas de relever est dit, jamais caché.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un tableau d'essai.

import { countryName, flagSrc, formatNumber, language, RANKING_SCOPES, SCORE_PERIODS, t, tn, type AvatarView, type BoardLine, type RankingScope, type ScorePeriod } from '@cyberpinball/core';
import type { PlayerStatus, RankingView, RankingViewLine } from './table-rankings';
import type { TableBoard } from './table-scores';

/** Ce que le rendu montre du tableau (app/renderer/library.js, renderScoreboard). */
export interface ScoreboardView {
  /** Les portées (cette borne, amis, pays, monde) ; `action` : l'action qui l'ouvre (clic). */
  scopes?: { scope: RankingScope; label: string; current: boolean; action: number }[];
  /** Les quatre périodes ; `action` : l'action qui l'ouvre (clic). */
  tabs: { period: ScorePeriod; label: string; count: string; current: boolean; action: number }[];
  lines: ScoreboardLineView[];
  /** Pas de score pour cette période : pourquoi, et ce qui viendra. */
  empty?: { title: string; detail: string };
  /** Ce que la table ne permet pas de relever. */
  note?: string;
  /** Sous le tableau : où se trouve le joueur dans ce classement (portée et période). */
  position?: string;
  /** Classements en réseau : ce que dit chaque marque de présence sur les avatars, celles du tableau seulement. */
  legend?: { presence: Presence; label: string }[];
}

/** Ce que montre la marque posée sur l'avatar : en partie (point et anneau), en ligne (point), hors ligne (point creux). */
export type Presence = 'playing' | 'online' | 'offline';
export const presenceOf = (status: PlayerStatus): Presence => (status.state === 'seen' ? 'offline' : status.state);

const PRESENCE_LABELS: Record<Presence, () => string> = {
  playing: () => t('En partie'),
  online: () => t('En ligne'),
  offline: () => t('Hors ligne'),
};

/** La légende des marques présentes dans le tableau, dans l'ordre en partie, en ligne, hors ligne. */
function presenceLegend(lines: ScoreboardLineView[]): ScoreboardView['legend'] {
  const shown = new Set(lines.flatMap((l) => (l.status ? [presenceOf(l.status)] : [])));
  const legend = (['playing', 'online', 'offline'] as const).filter((p) => shown.has(p)).map((presence) => ({ presence, label: PRESENCE_LABELS[presence]() }));
  return legend.length ? legend : undefined;
}

export interface ScoreboardLineView {
  rank: string;
  name: string;
  /** Pas d'initiales : le nom est un repli (« — », « Joueur 2 »), plus discret. */
  anonymous?: boolean;
  score: string;
  when: string;
  /** La première place. */
  first?: boolean;
  /** Pays du joueur (classements en réseau), en deux lettres ; `countryName` le nomme (bulle, lecteur d'écran). */
  country?: string;
  countryName?: string;
  /** Son drapeau (app/renderer/drapeaux) ; absent pour un code inconnu, montré alors dans le même cadre. */
  flag?: string;
  /** Hors des premières lignes : séparée du tableau par un filet. */
  apart?: boolean;
  /** Classements en réseau : la pastille du joueur (avatar ou initiales). */
  avatar?: AvatarView;
  /** Classements en réseau : son statut (en partie, en ligne, hors ligne, vu il y a…), en marque sur l'avatar ; le libellé en bulle. */
  status?: PlayerStatus;
  /** Le joueur de cette borne. */
  mine?: boolean;
}

const locale = () => (language() === 'en' ? 'en-GB' : 'fr-FR');

/** Libellé d'un onglet. */
export function periodLabel(period: ScorePeriod): string {
  switch (period) {
    case 'year':
      return t('Cette année');
    case 'week':
      return t('Cette semaine');
    case 'today':
      return t('Aujourd’hui');
    default:
      return t('Tout temps');
  }
}

/** Quand : « 21:04 » aujourd'hui, « 9 nov., 21:04 » cette année, « 9 nov. 2025 » avant. */
export function whenLabel(line: Pick<BoardLine, 'at' | 'table'>, now = new Date()): string {
  if (!line.at) return t('Record de la table');
  const at = new Date(line.at);
  const time = at.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return t('Aujourd’hui, {time}', { time });
  if (at.getFullYear() === now.getFullYear()) return t('{day}, {time}', { day: at.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }), time });
  return at.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

function lineView(line: BoardLine, now: Date): ScoreboardLineView {
  const name = line.initials ?? (line.player ? t('Joueur {n}', { n: line.player }) : '—');
  return {
    rank: String(line.rank),
    name,
    ...(line.initials ? {} : { anonymous: true }),
    score: formatNumber(line.score),
    when: whenLabel(line, now),
    ...(line.rank === 1 ? { first: true } : {}),
  };
}

/** Ce qui manque pour relever les scores de cette table ; undefined : chaque partie se relève. */
function limits(board: TableBoard): string | undefined {
  if (board.everyGame) return undefined;
  if (board.romWithoutMap) return t('La mémoire de cette ROM n’est pas encore décrite : seuls les scores déjà connus s’affichent.');
  if (board.tableBoard) return t('Cette table ne dit que les scores entrés à son tableau d’honneur : seuls ceux-là sont datés.');
  return t('Cette table ne garde aucun tableau d’honneur lisible : ses scores ne peuvent pas être relevés.');
}

/** Le tableau d'une période, avec ses onglets ; `boards` donne celui de chaque période. */
export function scoreboardView(boards: (period: ScorePeriod) => TableBoard, period: ScorePeriod, now = new Date()): ScoreboardView {
  const board = boards(period);
  const tabs = SCORE_PERIODS.map((p, action) => {
    const b = p === period ? board : boards(p);
    const count = p === 'all' && !b.games && b.lines.length ? t('records de la table') : tn(b.games, '{n} partie', '{n} parties');
    return { period: p, label: periodLabel(p), count, current: p === period, action };
  });
  const note = limits(board);
  if (board.lines.length) return { scopes: scopeTabs('cabinet'), tabs, lines: board.lines.map((l) => lineView(l, now)), ...(note ? { note } : {}) };
  const empty =
    period === 'all'
      ? { title: t('Aucun score pour l’instant'), detail: t('Chaque partie jouée sur cette borne s’inscrit ici, avec sa date.') }
      : { title: t('Aucun score {period}', { period: periodLabel(period).toLowerCase() }), detail: t('Les parties jouées {period} s’inscrivent ici.', { period: periodLabel(period).toLowerCase() }) };
  return { scopes: scopeTabs('cabinet'), tabs, lines: [], empty, ...(note ? { note } : {}) };
}

/** Libellé d'une portée. */
export function scopeLabel(scope: RankingScope): string {
  switch (scope) {
    case 'friends':
      return t('Amis');
    case 'country':
      return t('National');
    case 'world':
      return t('Mondial');
    default:
      return t('Cette borne');
  }
}

/** Les quatre portées en onglets ; leurs actions suivent celles des périodes. */
export function scopeTabs(scope: RankingScope): NonNullable<ScoreboardView['scopes']> {
  return RANKING_SCOPES.map((s, i) => ({ scope: s, label: scopeLabel(s), current: s === scope, action: SCORE_PERIODS.length + i }));
}

/** Le pays d'une ligne : code, nom et drapeau. */
function countryOf(code: string): Pick<ScoreboardLineView, 'country' | 'countryName' | 'flag'> {
  const flag = flagSrc(code);
  return { country: code, countryName: countryName(code, locale()), ...(flag ? { flag } : {}) };
}

function rankingLineView(line: RankingViewLine, now: Date, apart: boolean): ScoreboardLineView {
  return {
    rank: line.beyond ? `${line.beyond}+` : String(line.rank),
    ...(apart ? { apart: true } : {}),
    name: line.mine ? t('{name} (vous)', { name: line.name }) : line.name,
    score: formatNumber(line.score),
    when: whenLabel({ at: line.at }, now),
    ...(line.rank === 1 ? { first: true } : {}),
    ...(line.country ? countryOf(line.country) : {}),
    ...(line.mine ? { mine: true } : {}),
    avatar: line.face,
    ...(line.status ? { status: line.status } : {}),
  };
}

/** Un classement en réseau (amis, pays, monde), avec ses périodes ; `views` donne celui de chaque période. */
export function rankingScoreboardView(views: (period: ScorePeriod) => RankingView, scope: Exclude<RankingScope, 'cabinet'>, period: ScorePeriod, now = new Date()): ScoreboardView {
  const view = views(period);
  const tabs = SCORE_PERIODS.map((p, action) => {
    const v = p === period ? view : views(p);
    return { period: p, label: periodLabel(p), count: v.unavailable ? '—' : tn(v.players, '{n} joueur', '{n} joueurs'), current: p === period, action };
  });
  const base = { scopes: scopeTabs(scope), tabs };
  if (view.unavailable) return { ...base, lines: [], empty: { title: t('Classement indisponible'), detail: view.unavailable } };
  const position = positionText(view, scope, period);
  // Ma ligne en fin de tableau, au-delà des premières places : à part.
  const lines = view.lines.map((l, i) => rankingLineView(l, now, Boolean(l.mine) && i > 0 && view.lines[i - 1]!.rank + 1 < l.rank));
  const legend = presenceLegend(lines);
  if (lines.length) return { ...base, lines, position, ...(legend ? { legend } : {}), ...(view.note ? { note: view.note } : {}) };
  const where = scope === 'world' ? t('dans le monde') : scope === 'country' ? t('dans votre pays') : t('entre amis');
  return {
    ...base,
    lines: [],
    empty: { title: t('Aucun score {where} {period}', { where, period: periodLabel(period).toLowerCase() }), detail: t('Les scores des bornes reliées arrivent au fil des connexions.') },
    position,
    ...(view.note ? { note: view.note } : {}),
  };
}

/**
 * Sous le tableau : la place du joueur de la borne dans ce classement, nommé par sa portée et sa
 * période (« Mondial · Cette semaine : votre place, 12 sur 340 joueurs »). Au-delà de ce que la
 * borne garde, la place n'est pas sûre : « au-delà de la 100ᵉ place ».
 */
export function positionText(view: RankingView, scope: Exclude<RankingScope, 'cabinet'>, period: ScorePeriod): string {
  const where = t('{scope} · {period}', { scope: scopeLabel(scope), period: periodLabel(period) });
  if (!view.me) return t('{where} : pas encore de score pour vous', { where });
  if (view.me.beyond) return t('{where} : votre place, au-delà de la {n}ᵉ', { where, n: view.me.beyond });
  return view.complete
    ? t('{where} : votre place, {rank} sur {players}', { where, rank: view.me.rank, players: tn(view.players, '{n} joueur', '{n} joueurs') })
    : t('{where} : votre place, {rank} sur au moins {players}', { where, rank: view.me.rank, players: tn(view.players, '{n} joueur', '{n} joueurs') });
}

/** Ce que dit l'entrée de la fiche : le record, et les parties du jour. */
export function scoresSummary(all: TableBoard, today: TableBoard): string {
  const best = all.lines[0];
  if (!best) return t('Tout temps, cette année, cette semaine, aujourd’hui');
  const record = best.initials ? t('Record : {score} ({initials})', { score: formatNumber(best.score), initials: best.initials }) : t('Record : {score}', { score: formatNumber(best.score) });
  return today.games ? `${record} · ${tn(today.games, '{n} partie aujourd’hui', '{n} parties aujourd’hui')}` : record;
}
