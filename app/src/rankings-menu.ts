// Classements de toutes mes tables (13/11/2026) : la porte « Classements » de l'accueil Communauté.
// Avant, elle ouvrait le tableau des scores de la table restée choisie dans la roue, quelle qu'elle
// soit (« 2001 - A Space Odyssey : tableau des scores… ») ; c'est maintenant un tableau global.
//
// Une portée à la fois en onglets (Cette borne, Amis, National, Mondial ; MagnaSave passe à la
// suivante) et une période (Tout temps, Cette année, Cette semaine, Aujourd'hui ; Start sur
// « Période » passe à la suivante). Une ligne par table qui a des scores : le premier, son score, le
// nombre de joueurs ou de parties, ma place. Start sur une table : son tableau des scores à la même
// portée et à la même période, dont le « Retour » revient ici.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des tables d'essai.

import { flagView, formatNumber, locale, RANKING_SCOPES, SCORE_PERIODS, t, tn, type RankingScope, type ScorePeriod, type TableEntry } from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';
import { periodLabel, scopeLabel } from './scoreboard-menu';
import type { RankingView } from './table-rankings';
import type { TableBoard } from './table-scores';

type NetScope = Exclude<RankingScope, 'cabinet'>;

export interface RankingsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    /** Le tableau des scores d'une table, à cette portée et cette période ; son « Retour » vers `back`. */
    openScores(table: TableEntry, scope: RankingScope, period: ScorePeriod, back: () => void): void;
  };
  tables(): readonly TableEntry[];
  /** Les scores relevés sur cette borne (table-scores.ts). */
  local(table: TableEntry, period: ScorePeriod): TableBoard;
  /** Les classements en réseau (table-rankings.ts). */
  network(table: TableEntry, scope: NetScope, period: ScorePeriod): RankingView;
  /** Touches MagnaSave relevées (la gauche d'abord) : la portée suivante, ou la précédente. */
  zoneKeys(): readonly string[];
  openSharing(back: () => void): void;
  now?(): number;
}

export interface RankingsMenu {
  open(back: () => void): void;
  /** Ce que dit la porte de l'accueil. */
  detail(): string;
}

/** Une table classée : le premier, son score, le nombre de joueurs (ou de parties ici), ma place. */
interface Ranked {
  table: TableEntry;
  leader: { name: string; score: number; country?: string };
  count: string;
  weight: number;
  mine?: string;
  first?: boolean;
}

interface Board {
  ranked: Ranked[];
  /** Tables sans score à cette portée et cette période. */
  without: number;
  /** Tables dont l'empreinte se calcule encore (classements en réseau). */
  pending: number;
  /** Pourquoi la portée ne montre rien (partage désactivé, pays non choisi, aucun ami). */
  unavailable?: string;
}

/** Un classement se recalcule au plus toutes les deux secondes : chaque table relit ses scores. */
const BOARD_TTL_MS = 2000;

export function createRankingsMenu(host: RankingsMenuHost): RankingsMenu {
  const now = () => host.now?.() ?? Date.now();
  let scope: RankingScope = 'world';
  let period: ScorePeriod = 'all';
  let back: () => void = () => undefined;
  const cache = new Map<string, { at: number; board: Board }>();

  const place = (rank: number, beyond?: number) => (beyond ? t('au-delà de la {n}ᵉ place', { n: beyond }) : rank === 1 ? t('vous êtes 1ᵉʳ') : t('vous êtes {n}ᵉ', { n: rank }));

  function compute(sc: RankingScope, p: ScorePeriod): Board {
    const ranked: Ranked[] = [];
    let without = 0;
    let pending = 0;
    const reasons = new Map<string, number>();
    const tables = host.tables();
    for (const table of tables) {
      if (sc === 'cabinet') {
        const board = host.local(table, p);
        const top = board.lines[0];
        if (!top) {
          without++;
          continue;
        }
        ranked.push({ table, leader: { name: top.initials ?? (top.player ? t('Joueur {n}', { n: top.player }) : '—'), score: top.score }, count: board.games ? tn(board.games, '{n} partie', '{n} parties') : t('records de la table'), weight: board.games });
        continue;
      }
      const view = host.network(table, sc, p);
      if (view.pending) {
        pending++;
        continue;
      }
      if (view.unavailable) {
        reasons.set(view.unavailable, (reasons.get(view.unavailable) ?? 0) + 1);
        continue;
      }
      const top = view.lines[0];
      if (!top) {
        without++;
        continue;
      }
      ranked.push({
        table,
        leader: { name: top.name, score: top.score, ...(top.country ? { country: top.country } : {}) },
        count: tn(view.players, '{n} joueur', '{n} joueurs'),
        weight: view.players,
        ...(view.me ? { mine: place(view.me.rank, view.me.beyond), ...(view.me.rank === 1 && !view.me.beyond ? { first: true } : {}) } : {}),
      });
    }
    // Les tables où l'on joue le plus d'abord, puis par nom.
    ranked.sort((a, b) => b.weight - a.weight || a.table.title.localeCompare(b.table.title));
    // Une même raison pour toutes les tables (partage désactivé, pays non choisi, aucun ami) : la portée ne montre rien.
    const [reason, n] = [...reasons].sort((a, b) => b[1] - a[1])[0] ?? [];
    const unavailable = reason && n === tables.length ? reason : undefined;
    // Sinon, une table sans classement possible (version illisible) compte parmi celles sans score.
    const unranked = unavailable ? 0 : [...reasons.values()].reduce((sum, k) => sum + k, 0);
    return { ranked, without: without + unranked, pending, ...(unavailable ? { unavailable } : {}) };
  }

  function boardOf(sc: RankingScope, p: ScorePeriod): Board {
    const key = `${sc}|${p}`;
    const known = cache.get(key);
    if (known && now() - known.at < BOARD_TTL_MS) return known.board;
    const board = compute(sc, p);
    cache.set(key, { at: now(), board });
    return board;
  }

  function build(): Built {
    const here = () => host.library.openCustom(build);
    const board = boardOf(scope, period);
    const actions: Action[] = [];
    const sections: Section[] = [];
    // Les onglets des portées, rendus en tête de la liste : leurs actions d'abord, dans l'ordre de
    // lecture (de haut en bas), puis les tables, puis la colonne des actions.
    const tabs = RANKING_SCOPES.map((sc) => {
      const b = boardOf(sc, period);
      const action = actions.push({ label: t('Onglet {period}', { period: scopeLabel(sc) }), key: `scope-${sc}`, run: () => ((scope = sc), here()) }) - 1;
      return { label: scopeLabel(sc), count: b.unavailable ?? tn(b.ranked.length, '{n} table', '{n} tables'), current: sc === scope, disabled: Boolean(b.unavailable), action };
    });
    const rows: Row[] = board.ranked.map((r) => {
      const action = actions.push({ label: r.table.title, key: `table:${r.table.file}`, icon: 'trophy', run: () => host.library.openScores(r.table, scope, period, here) }) - 1;
      const flag = r.leader.country ? flagView(r.leader.country, locale()) : undefined;
      return {
        text: r.table.title,
        detail: [t('1. {name} · {score}', { name: r.leader.name, score: formatNumber(r.leader.score) }), r.count, r.mine].filter(Boolean).join(' · '),
        ...(flag ? { flag } : {}),
        ...(r.first ? { badges: [t('Premier')], tone: 'ok' as const } : {}),
        action,
        pick: true,
      } satisfies Row;
    });
    if (rows.length) sections.push({ title: tn(rows.length, '{n} table classée', '{n} tables classées'), rows });
    const notes: Row[] = [];
    if (board.unavailable) notes.push({ text: board.unavailable, icon: 'info', tone: 'quiet' });
    else if (!rows.length && !board.pending)
      notes.push({ text: t('Aucun score {period}', { period: periodLabel(period).toLowerCase() }), detail: scope === 'cabinet' ? t('Chaque partie jouée sur cette borne s’inscrit ici.') : t('Les scores des autres bornes arrivent avec le réseau.'), icon: 'info', tone: 'quiet' });
    if (board.pending) notes.push({ text: tn(board.pending, 'Empreinte de {n} table en calcul…', 'Empreintes de {n} tables en calcul…'), icon: 'clock', tone: 'quiet' });
    if (rows.length && board.without) notes.push({ text: tn(board.without, '{n} autre table sans score', '{n} autres tables sans score'), icon: 'info', tone: 'quiet' });
    if (notes.length) sections.push({ rows: notes });
    if (board.unavailable && scope !== 'cabinet') actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    actions.push({
      label: t('Période : {period}', { period: periodLabel(period) }),
      detail: t('Start : {next}', { next: periodLabel(SCORE_PERIODS[(SCORE_PERIODS.indexOf(period) + 1) % SCORE_PERIODS.length]!) }),
      icon: 'calendar',
      key: 'period',
      run: () => ((period = SCORE_PERIODS[(SCORE_PERIODS.indexOf(period) + 1) % SCORE_PERIODS.length]!), here()),
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Classements'),
      icon: 'trophy',
      subheading: `${scopeLabel(scope)} · ${periodLabel(period)}`,
      lead: t('Toutes vos tables : le premier de chacune et votre place. Start sur une table : son tableau des scores.'),
      tabs,
      sections,
      actions,
      back,
      hint: t('Flippers : choisir · Start : le tableau des scores · MagnaSave : portée suivante · Exit : retour'),
      listHint: t('Flippers : parcourir · Start : le tableau des scores · MagnaSave : portée suivante · Exit : sortir de la liste'),
      keys: (input) => {
        const magna = host.zoneKeys();
        if (!magna.includes(input.code)) return false;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = RANKING_SCOPES.indexOf(scope);
        scope = RANKING_SCOPES[(at + dir + RANKING_SCOPES.length) % RANKING_SCOPES.length]!;
        here();
        return true;
      },
    };
  }

  return {
    open(to) {
      back = to;
      period = 'all';
      cache.clear();
      // Le classement mondial d'abord ; sans réseau (partage désactivé), celui de cette borne.
      scope = boardOf('world', period).unavailable ? 'cabinet' : 'world';
      // Le curseur sur la première table (juste après les onglets), ou sur « Période » sans table.
      host.library.openCustom(build, RANKING_SCOPES.length);
    },
    detail: () => t('Toutes vos tables : cette borne, amis, national et mondial'),
  };
}
