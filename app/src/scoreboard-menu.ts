// Fiche d'une table > « Tableau des scores » (table-scores.ts) : quatre onglets, tout temps
// confondu, cette année, cette semaine, aujourd'hui ; les flippers passent de l'un à l'autre.
// Chaque ligne : la place, les initiales (ou le joueur d'une partie à plusieurs), le score et quand.
// Ce que la table ne permet pas de relever est dit, jamais caché.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un tableau d'essai.

import { formatNumber, language, SCORE_PERIODS, t, tn, type BoardLine, type ScorePeriod } from '@cyberpinball/core';
import type { TableBoard } from './table-scores';

/** Ce que le rendu montre du tableau (app/renderer/library.js, renderScoreboard). */
export interface ScoreboardView {
  /** Les quatre onglets ; `action` : l'action qui l'ouvre (clic). */
  tabs: { period: ScorePeriod; label: string; count: string; current: boolean; action: number }[];
  lines: ScoreboardLineView[];
  /** Pas de score pour cette période : pourquoi, et ce qui viendra. */
  empty?: { title: string; detail: string };
  /** Ce que la table ne permet pas de relever. */
  note?: string;
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
    const count = p === 'all' && !b.games && b.tableBoard ? t('records de la table') : tn(b.games, '{n} partie', '{n} parties');
    return { period: p, label: periodLabel(p), count, current: p === period, action };
  });
  const note = limits(board);
  if (board.lines.length) return { tabs, lines: board.lines.map((l) => lineView(l, now)), ...(note ? { note } : {}) };
  const empty =
    period === 'all'
      ? { title: t('Aucun score pour l’instant'), detail: t('Chaque partie jouée sur cette borne s’inscrit ici, avec sa date.') }
      : { title: t('Aucun score {period}', { period: periodLabel(period).toLowerCase() }), detail: t('Les parties jouées {period} s’inscrivent ici.', { period: periodLabel(period).toLowerCase() }) };
  return { tabs, lines: [], empty, ...(note ? { note } : {}) };
}

/** Ce que dit l'entrée de la fiche : le record, et les parties du jour. */
export function scoresSummary(all: TableBoard, today: TableBoard): string {
  const best = all.lines[0];
  if (!best) return t('Tout temps, cette année, cette semaine, aujourd’hui');
  const record = best.initials ? t('Record : {score} ({initials})', { score: formatNumber(best.score), initials: best.initials }) : t('Record : {score}', { score: formatNumber(best.score) });
  return today.games ? `${record} · ${tn(today.games, '{n} partie aujourd’hui', '{n} parties aujourd’hui')}` : record;
}
