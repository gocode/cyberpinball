// Communauté > Classements (refait le 17/11/2026, d'après la maquette validée).
//
// Deux portes :
// - « Joueurs » : les joueurs classés par leurs XP (playerranking.ts), entre amis, dans le pays, dans
//   le monde ; de la semaine (ce qui a été gagné depuis lundi : tout le monde a sa chance) ou de tout
//   temps. Le tableau des scores d'une table sert de modèle (scoreboard-menu.ts) : flippers pour la
//   période, MagnaSave pour la portée.
// - « Tables » : toutes les tables, jamais seulement celles qui ont des scores (retour du 17/11/2026 :
//   « ça me montre les classements d'un jeu, et pas des autres »). Les dernières jouées d'abord, puis
//   toutes de A à Z ; une recherche par nom (clavier à l'écran ou du PC). Une table sans classement
//   reste dans la liste, grisée, avec sa raison (aucun score, empreinte en calcul, version
//   illisible). Start sur une table : son tableau des scores, à la même portée et à la même période.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des tables d'essai.

import {
  formatNumber,
  lastRunOf,
  locale,
  NO_COUNTRY_FLAG,
  countryName,
  flagSrc,
  PLAYER_PERIODS,
  PLAYER_SCOPES,
  playerBoard,
  playerFlag,
  RANKING_SCOPES,
  SCORE_PERIODS,
  t,
  tn,
  type AvatarView,
  type PlayerBoard,
  type PlayerPeriod,
  type PlayerScope,
  type RankedPlayer,
  type RankingScope,
  type ScorePeriod,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';
import { periodLabel, presenceOf, scopeLabel, type Presence, type ScoreboardLineView, type ScoreboardView } from './scoreboard-menu';
import type { PlayerStatus, RankingView } from './table-rankings';
import type { TableBoard } from './table-scores';

type NetScope = Exclude<RankingScope, 'cabinet'>;

/** Ce que l'écran « Joueurs » lit du réseau des bornes. */
export interface PlayersSource {
  /** Partage actif, mon pays, mes amis, et moi (mes XP, ceux de ma semaine). */
  state(): { enabled: boolean; country?: string; friends: ReadonlySet<string>; me?: RankedPlayer };
  /** Les cartes publiques reçues des autres joueurs. */
  cards(): readonly RankedPlayer[];
  /** Première fois que la borne a vu la carte d'un joueur (vraisemblance de son niveau). */
  firstSeen?(key: string): string | undefined;
  /** Sa pastille : son avatar s'il est arrivé, sinon ses initiales. */
  face?(player: { key: string; name: string; avatar?: string }): AvatarView;
  /** Son statut (en partie, en ligne, hors ligne, vu il y a…). */
  status?(key: string): PlayerStatus | undefined;
}

export interface RankingsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    /** Le tableau des scores d'une table, à cette portée et cette période ; son « Retour » vers `back`. */
    openScores(table: TableEntry, scope: RankingScope, period: ScorePeriod, back: () => void): void;
    /** Saisie au clavier à l'écran (la recherche d'une table) ; `done` reçoit undefined à l'annulation. */
    openPrompt?(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    /** Lecture d'un écran faite à son ouverture, gardée pour les touches qui suivent (library.ts). */
    kept?<T>(key: string, read: () => T): T;
  };
  tables(): readonly TableEntry[];
  /** Les scores relevés sur cette borne (table-scores.ts). */
  local(table: TableEntry, period: ScorePeriod): TableBoard;
  /** Les classements en réseau (table-rankings.ts). */
  network(table: TableEntry, scope: NetScope, period: ScorePeriod): RankingView;
  /** Le classement des joueurs ; absent : la porte « Joueurs » est grisée. */
  players?: PlayersSource;
  /** Touches MagnaSave relevées (la gauche d'abord) : la portée suivante, ou la précédente. */
  zoneKeys(): readonly string[];
  /** Touches des boutons de la borne : flippers (précédent, suivant) et Start. */
  keys?(): { previous: readonly string[]; next: readonly string[]; confirm: readonly string[] };
  openSharing(back: () => void): void;
  /** L'écran affiché relit ce qu'il montre (library.changed). */
  redraw?(): void;
  now?(): number;
  /** Minuterie (essais) : setTimeout par défaut. */
  later?(ms: number, run: () => void): void;
}

export interface RankingsMenu {
  open(back: () => void): void;
  /** Ce que dit la porte de l'accueil. */
  detail(): string;
  /** Ma place chez les joueurs (affiche du médaillon Communauté) ; absente sans réseau ou partage coupé. */
  standing(): PlayerStanding | undefined;
  /**
   * « Toutes les tables » au téléphone (lot 5) : le même calcul que l'écran « Tables », à cette portée
   * et cette période ; les portées (et pourquoi l'une est grisée), puis les tables, récentes d'abord.
   */
  remoteTables(scope: RankingScope, period: ScorePeriod): RemoteAllTables;
}

/** Une ligne par table pour le téléphone : son fichier (que la borne garde), le premier, ma place, ou pourquoi rien. */
export interface RemoteAllTables {
  scopes: { scope: RankingScope; label: string; count: string; current: boolean; reason?: string }[];
  periods: { period: ScorePeriod; label: string; current: boolean }[];
  unavailable?: string;
  sections: { title: string; rows: { file: string; title: string; lead?: string; flag?: string; count?: string; mine?: string; first?: true; reason?: string; aside?: string }[] }[];
}

/** Ma place dans un classement des joueurs, de tout temps et de la semaine. */
export interface StandingPlace {
  /** Ma place de tout temps ; absente : pas encore d'XP. */
  rank?: number;
  /** Joueurs classés de tout temps. */
  players: number;
  /** Ma place cette semaine ; absente : aucun XP depuis lundi. */
  week?: number;
}

/** Ma place au monde et dans mon pays (absent : pays non choisi). */
export interface PlayerStanding {
  world: StandingPlace;
  country?: StandingPlace & { code: string };
}

/** La place de l'affiche se recalcule au plus toutes les deux secondes : l'affiche se redessine à chaque état. */
const STANDING_TTL_MS = 2000;

/** Ce qu'une table montre à une portée et une période. */
type TableState =
  | { kind: 'ranked'; leader: { name: string; score: number; country?: string }; count: string; mine?: string; first?: boolean }
  | { kind: 'pending' }
  | { kind: 'none'; reason?: string };

interface Board {
  states: Map<string, TableState>;
  /** Tables classées à cette portée et cette période. */
  ranked: number;
  /** Pourquoi la portée ne montre rien (partage désactivé, pays non choisi, aucun ami). */
  unavailable?: string;
}

/** Dernières tables jouées en tête de la liste. */
export const RECENT_TABLES = 5;

/**
 * Un classement se recalcule au plus toutes les deux secondes : chaque table relit ses scores. C'est
 * une limite de cadence, jamais un oubli : un changement arrivé pendant ces deux secondes (empreinte
 * calculée, classements reçus du réseau) est relu à leur fin (retour du 17/11/2026 : « Empreintes de
 * 2 tables en calcul… » restait affiché, les empreintes déjà connues arrivant aussitôt après l'ouverture).
 */
const BOARD_TTL_MS = 2000;

/** Un nom comparé sans accents, sans casse, sans signes : « Comète » se trouve en tapant « comete ». */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** La table répond à la recherche : chaque mot tapé commence un mot de son nom, ou se trouve dans son nom collé. */
export function matchesSearch(title: string, query: string): boolean {
  const words = searchKey(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const key = searchKey(title);
  const glued = key.replace(/ /g, '');
  const parts = key.split(' ');
  return words.every((w) => parts.some((p) => p.startsWith(w)) || glued.includes(w));
}

export function createRankingsMenu(host: RankingsMenuHost): RankingsMenu {
  const now = () => host.now?.() ?? Date.now();
  let back: () => void = () => undefined;
  // Écran « Tables ».
  let scope: RankingScope = 'world';
  let period: ScorePeriod = 'all';
  let query = '';
  // Écran « Joueurs ».
  let playerScope: PlayerScope = 'country';
  let playerPeriod: PlayerPeriod = 'week';
  /**
   * Classements gardés, toutes portées et périodes ensemble : une seule fenêtre de deux secondes,
   * ouverte au premier calcul, et tout se relit à sa fin. Une fenêtre par portée ferait se relancer
   * les relectures l'une l'autre (« Cette borne » gardée depuis l'ouverture, « Mondial » depuis
   * l'arrivée des empreintes), toutes les deux secondes, sans fin.
   */
  const cache = new Map<string, { at: number; board: Board }>();
  let windowAt = 0;
  /** Heure de la relecture prévue (0 : aucune). */
  let trailingAt = 0;

  const place = (rank: number, beyond?: number) => (beyond ? t('au-delà de la {n}ᵉ place', { n: beyond }) : rank === 1 ? t('vous êtes 1ᵉʳ') : t('vous êtes {n}ᵉ', { n: rank }));

  // ---------- Tables ----------

  function compute(sc: RankingScope, p: ScorePeriod): Board {
    const states = new Map<string, TableState>();
    let ranked = 0;
    const reasons = new Map<string, number>();
    const tables = host.tables();
    for (const table of tables) {
      if (sc === 'cabinet') {
        const board = host.local(table, p);
        const top = board.lines[0];
        if (!top) {
          states.set(table.file, { kind: 'none' });
          continue;
        }
        ranked++;
        states.set(table.file, { kind: 'ranked', leader: { name: top.initials ?? (top.player ? t('Joueur {n}', { n: top.player }) : '—'), score: top.score }, count: board.games ? tn(board.games, '{n} partie', '{n} parties') : t('records de la table') });
        continue;
      }
      const view = host.network(table, sc, p);
      if (view.pending) {
        states.set(table.file, { kind: 'pending' });
        continue;
      }
      if (view.unavailable) {
        reasons.set(view.unavailable, (reasons.get(view.unavailable) ?? 0) + 1);
        states.set(table.file, { kind: 'none', reason: view.unavailable });
        continue;
      }
      const top = view.lines[0];
      if (!top) {
        states.set(table.file, { kind: 'none' });
        continue;
      }
      ranked++;
      states.set(table.file, {
        kind: 'ranked',
        leader: { name: top.name, score: top.score, ...(top.country ? { country: top.country } : {}) },
        count: tn(view.players, '{n} joueur', '{n} joueurs'),
        ...(view.me ? { mine: place(view.me.rank, view.me.beyond), ...(view.me.rank === 1 && !view.me.beyond ? { first: true } : {}) } : {}),
      });
    }
    // Une même raison pour toutes les tables (partage désactivé, pays non choisi, aucun ami) : la portée ne montre rien.
    const [reason, n] = [...reasons].sort((a, b) => b[1] - a[1])[0] ?? [];
    const unavailable = reason && n === tables.length ? reason : undefined;
    return { states, ranked, ...(unavailable ? { unavailable } : {}) };
  }

  /**
   * Chaque table relit ses scores (sa mémoire de ROM) : lu à l'ouverture de l'écran, pour les quatre
   * portées (les onglets les comptent), gardé pour les touches qui suivent ; MagnaSave change de portée
   * sans rien relire. Une période choisie (Start) ou des classements arrivés du réseau relisent tout.
   */
  function boardOf(sc: RankingScope, p: ScorePeriod): Board {
    const keep = host.library.kept ?? (<T>(_key: string, read: () => T) => read());
    return keep(`classement:${sc}|${p}`, () => freshBoard(sc, p));
  }

  function freshBoard(sc: RankingScope, p: ScorePeriod): Board {
    const key = `${sc}|${p}`;
    if (now() - windowAt >= BOARD_TTL_MS) {
      cache.clear();
      windowAt = now();
    }
    const known = cache.get(key);
    // Relu pendant la fenêtre : l'écran a reçu un changement (kept relit à l'ouverture et après un
    // changement seulement). Le classement gardé sert encore, et la relecture vient à la fin.
    if (known) {
      // Calculé à l'instant (la même construction, l'onglet après la liste) : rien n'a pu changer depuis.
      if (now() > known.at) redrawAfter(windowAt + BOARD_TTL_MS - now());
      return known.board;
    }
    const board = compute(sc, p);
    // Une empreinte en calcul n'est jamais gardée : son arrivée doit se voir aussitôt.
    if ([...board.states.values()].some((s) => s.kind === 'pending')) cache.delete(key);
    else cache.set(key, { at: now(), board });
    return board;
  }

  /** Relit l'écran à la fin de la fenêtre : une seule relecture prévue à la fois. */
  function redrawAfter(ms: number): void {
    if (!host.redraw) return;
    const at = now() + ms;
    if (at <= trailingAt) return;
    trailingAt = at;
    const run = () => {
      if (trailingAt === at) trailingAt = 0;
      host.redraw?.();
    };
    if (host.later) host.later(ms, run);
    else setTimeout(run, ms).unref?.();
  }

  /** La ligne d'une table : classée (le premier, son score, les joueurs, ma place), ou grisée avec sa raison. */
  function tableRow(table: TableEntry, state: TableState | undefined, action: number, recent: boolean): Row {
    const ago = recent ? lastRunOf(table) : 0;
    const aside = ago ? agoLabel(ago) : undefined;
    const base = { text: table.title, action, pick: true, ...(aside ? { aside } : {}) };
    if (state?.kind === 'ranked') {
      const flag = playerFlag(state.leader.country, locale());
      return {
        ...base,
        detail: [t('1. {name} · {score}', { name: state.leader.name, score: formatNumber(state.leader.score) }), state.count, state.mine].filter(Boolean).join(' · '),
        flag,
        ...(state.first ? { badges: [t('Premier')], tone: 'ok' as const } : {}),
      } satisfies Row;
    }
    const why = state?.kind === 'pending' ? t('Empreinte de la table en calcul…') : (state?.reason ?? t('Aucun score {period}', { period: periodLabel(period).toLowerCase() }));
    return { ...base, detail: why, tone: 'quiet' };
  }

  /** « hier », « il y a 3 j » : la dernière partie d'une table récente. */
  function agoLabel(at: number): string {
    const day = (d: number) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()).getTime();
    const days = Math.round((day(now()) - day(at)) / 86_400_000);
    if (days <= 0) return t('aujourd’hui');
    if (days === 1) return t('hier');
    return t('il y a {n} j', { n: days });
  }

  function openSearch(): void {
    if (!host.library.openPrompt) return;
    host.library.openPrompt(t('Rechercher une table'), t('Nom de la table'), query, (value) => {
      if (value !== undefined) query = value.trim();
      // Le curseur revient sur la recherche, juste après les onglets.
      host.library.openCustom(buildTables, RANKING_SCOPES.length);
    }, t('Quelques lettres suffisent : sans accents ni majuscules, dans n’importe quel mot du nom.'));
  }

  function remoteTables(sc: RankingScope, p: ScorePeriod): RemoteAllTables {
    const tables = host.tables();
    const board = freshBoard(sc, p);
    const scopes = RANKING_SCOPES.map((x) => {
      const b = freshBoard(x, p);
      return { scope: x, label: scopeLabel(x), count: b.unavailable ? '' : t('{n} sur {total}', { n: b.ranked, total: tables.length }), current: x === sc, ...(b.unavailable ? { reason: b.unavailable } : {}) };
    });
    const periods = SCORE_PERIODS.map((x) => ({ period: x, label: periodLabel(x), current: x === p }));
    if (board.unavailable) return { scopes, periods, unavailable: board.unavailable, sections: [] };
    const recent = tables
      .filter((x) => lastRunOf(x) > 0)
      .sort((a, b) => lastRunOf(b) - lastRunOf(a))
      .slice(0, RECENT_TABLES);
    const rest = tables.filter((x) => !recent.includes(x)).sort((a, b) => a.title.localeCompare(b.title, locale()));
    const rowOf = (x: TableEntry, isRecent: boolean) => {
      const state = board.states.get(x.file);
      const ago = isRecent ? lastRunOf(x) : 0;
      const base = { file: x.file, title: x.title, ...(ago ? { aside: agoLabel(ago) } : {}) };
      if (state?.kind === 'ranked') {
        const flag = playerFlag(state.leader.country, locale()).src;
        return { ...base, lead: t('1. {name} · {score}', { name: state.leader.name, score: formatNumber(state.leader.score) }), ...(flag && sc !== 'cabinet' ? { flag } : {}), count: state.count, ...(state.mine ? { mine: state.mine } : {}), ...(state.first ? { first: true as const } : {}) };
      }
      return { ...base, reason: state?.kind === 'pending' ? t('Empreinte de la table en calcul…') : (state?.reason ?? t('Aucun score {period}', { period: periodLabel(p).toLowerCase() })) };
    };
    const sections = [
      ...(recent.length ? [{ title: t('Jouées récemment'), rows: recent.map((x) => rowOf(x, true)) }] : []),
      ...(rest.length ? [{ title: recent.length ? t('Toutes les autres tables · A–Z') : t('Toutes les tables · A–Z'), rows: rest.map((x) => rowOf(x, false)) }] : []),
    ];
    return { scopes, periods, sections };
  }

  function buildTables(): Built {
    const here = () => host.library.openCustom(buildTables);
    const board = boardOf(scope, period);
    const tables = host.tables();
    const actions: Action[] = [];
    const sections: Section[] = [];
    // Les onglets des portées, rendus en tête de la liste : leurs actions d'abord, dans l'ordre de
    // lecture (de haut en bas), puis la recherche, les tables, puis la colonne des actions.
    const tabs = RANKING_SCOPES.map((sc) => {
      const b = boardOf(sc, period);
      const action = actions.push({ label: t('Onglet {period}', { period: scopeLabel(sc) }), key: `scope-${sc}`, run: () => ((scope = sc), here()) }) - 1;
      return { label: scopeLabel(sc), count: b.unavailable ?? t('{n} sur {total}', { n: b.ranked, total: tables.length }), current: sc === scope, disabled: Boolean(b.unavailable), action };
    });
    // La recherche : une ligne à choisir, en tête ; une recherche faite se dit, et s'efface.
    const shown = tables.filter((x) => matchesSearch(x.title, query));
    const search: Row[] = [];
    if (host.library.openPrompt) {
      const action = actions.push({ label: t('Rechercher une table'), key: 'search', icon: 'search', run: openSearch }) - 1;
      search.push(
        query
          ? { text: t('Recherche : « {query} »', { query }), detail: tn(shown.length, '{n} table sur {total} · Start : changer', '{n} tables sur {total} · Start : changer', { total: tables.length }), icon: 'search', action, pick: true }
          : { text: t('Rechercher une table'), detail: t('Clavier de la borne ou du PC · flipper tenu : saut à l’initiale'), icon: 'search', action, pick: true },
      );
      if (query) {
        const clear = actions.push({ label: t('Effacer la recherche'), key: 'search-clear', icon: 'close', run: () => ((query = ''), here()) }) - 1;
        search.push({ text: t('Effacer la recherche'), detail: tn(tables.length, 'Revoir la table', 'Revoir les {n} tables'), icon: 'close', action: clear, pick: true });
      }
      sections.push({ rows: search });
    }
    if (board.unavailable) {
      sections.push({ rows: [{ text: board.unavailable, icon: 'info', tone: 'quiet' }] });
      if (scope !== 'cabinet') actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    } else if (!shown.length) {
      sections.push({ rows: [{ text: tables.length ? t('Aucune table ne répond à « {query} »', { query }) : t('Aucune table installée'), icon: 'info', tone: 'quiet' }] });
    } else {
      // Les dernières jouées d'abord (sans recherche), puis toutes les autres de A à Z.
      const recent = query
        ? []
        : shown
            .filter((x) => lastRunOf(x) > 0)
            .sort((a, b) => lastRunOf(b) - lastRunOf(a))
            .slice(0, RECENT_TABLES);
      const rest = shown.filter((x) => !recent.includes(x)).sort((a, b) => a.title.localeCompare(b.title, locale()));
      const rowOf = (x: TableEntry, isRecent: boolean) => {
        const action = actions.push({ label: x.title, key: `table:${x.file}`, icon: 'trophy', run: () => host.library.openScores(x, scope, period, here) }) - 1;
        return tableRow(x, board.states.get(x.file), action, isRecent);
      };
      if (recent.length) sections.push({ title: t('Jouées récemment'), rows: recent.map((x) => rowOf(x, true)) });
      if (rest.length) sections.push({ title: recent.length ? t('Toutes les autres tables · A–Z') : t('Toutes les tables · A–Z'), rows: rest.map((x) => rowOf(x, false)) });
    }
    actions.push({
      label: t('Période : {period}', { period: periodLabel(period) }),
      detail: t('Start : {next}', { next: periodLabel(SCORE_PERIODS[(SCORE_PERIODS.indexOf(period) + 1) % SCORE_PERIODS.length]!) }),
      icon: 'calendar',
      key: 'period',
      run: () => ((period = SCORE_PERIODS[(SCORE_PERIODS.indexOf(period) + 1) % SCORE_PERIODS.length]!), here()),
    });
    actions.push({ label: t('Retour : Classements'), icon: 'back', run: () => home(1) });
    return {
      heading: t('Tables'),
      icon: 'trophy',
      subheading: `${scopeLabel(scope)} · ${periodLabel(period)}`,
      lead: t('Toutes vos tables, le premier de chacune et votre place. Start sur une table : son tableau des scores.'),
      tabs,
      sections,
      actions,
      back: () => home(1),
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

  function openTables(): void {
    // Le classement mondial d'abord ; sans réseau (partage désactivé), celui de cette borne.
    scope = boardOf('world', period).unavailable ? 'cabinet' : 'world';
    // Le curseur sur la recherche (juste après les onglets), ou sur la première table sans recherche.
    host.library.openCustom(buildTables, RANKING_SCOPES.length);
  }

  // ---------- Joueurs ----------

  const playerScopeLabel = (sc: PlayerScope) => scopeLabel(sc);
  const playerPeriodLabel = (p: PlayerPeriod) => (p === 'week' ? t('Cette semaine') : t('Tout temps'));
  const xpText = (xp: number) => t('{n} XP', { n: formatNumber(xp) });

  /** Pourquoi une portée ne classe personne. */
  function playersUnavailable(sc: PlayerScope): string | undefined {
    const s = host.players?.state();
    if (!s) return t('Réseau des bornes absent');
    if (!s.enabled) return t('Partage désactivé : Communauté > Partage et réseau');
    if (sc === 'country' && !s.country) return t('Pays non choisi : Mon compte > Mon pays');
    return undefined;
  }

  function playersOf(sc: PlayerScope, p: PlayerPeriod): PlayerBoard {
    const src = host.players;
    const s = src?.state();
    if (!src || !s) return { lines: [], players: 0, doubtful: 0 };
    return playerBoard(src.cards(), { scope: sc, period: p, ...(s.country ? { country: s.country } : {}), friends: s.friends, ...(s.me ? { me: s.me } : {}), ...(src.firstSeen ? { firstSeen: (k: string) => src.firstSeen!(k) } : {}) }, new Date(now()));
  }

  function playerLineView(line: PlayerBoard['lines'][number], p: PlayerPeriod, apart: boolean): ScoreboardLineView {
    const src = host.players;
    const face = src?.face?.(line) ?? { initials: line.name.slice(0, 2).toUpperCase(), hue: 0 };
    const status = line.mine ? undefined : src?.status?.(line.key);
    const other = line.other === undefined ? '' : p === 'week' ? t('{xp} au total', { xp: xpText(line.other) }) : t('+{xp} cette semaine', { xp: formatNumber(line.other) });
    const flag = line.country ? flagSrc(line.country) : undefined;
    return {
      rank: String(line.rank),
      ...(apart ? { apart: true } : {}),
      name: line.mine ? t('{name} (vous)', { name: line.name }) : line.name,
      score: xpText(line.xp),
      when: other,
      ...(line.rank === 1 ? { first: true } : {}),
      ...(line.country ? { country: line.country, countryName: countryName(line.country, locale()), ...(flag ? { flag } : {}) } : { countryName: t('Pays non indiqué'), flag: NO_COUNTRY_FLAG }),
      ...(line.mine ? { mine: true } : {}),
      avatar: { ...face, ...(line.level ? { level: line.level } : {}) },
      ...(status ? { status } : {}),
      ...(line.level ? { levelText: String(line.level), level: line.level } : line.levelUnsure ? { levelText: '?' } : {}),
    };
  }

  /** Ma place dans un classement des joueurs, en une ligne (porte « Joueurs », sous le tableau). */
  function playerPosition(board: PlayerBoard, sc: PlayerScope, p: PlayerPeriod): string {
    const where = t('{scope} · {period}', { scope: playerScopeLabel(sc), period: playerPeriodLabel(p) });
    if (!board.me) return p === 'week' ? t('{where} : pas encore d’XP pour vous cette semaine', { where }) : t('{where} : pas encore d’XP pour vous', { where });
    return t('{where} : votre place, {rank} sur {players}', { where, rank: board.me.rank, players: tn(board.players, '{n} joueur', '{n} joueurs') });
  }

  function buildPlayers(): Built {
    const here = () => host.library.openCustom(buildPlayers, PLAYERS_BACK);
    const actions: Action[] = [];
    const scopes = PLAYER_SCOPES.map((sc) => ({ scope: sc as RankingScope, label: playerScopeLabel(sc), current: sc === playerScope, action: actions.push({ label: t('Onglet {period}', { period: playerScopeLabel(sc) }), key: `scope-${sc}`, run: () => ((playerScope = sc), here()) }) - 1 }));
    const boards = new Map(PLAYER_PERIODS.map((p) => [p, playersOf(playerScope, p)] as const));
    const unavailable = playersUnavailable(playerScope);
    const tabs = PLAYER_PERIODS.map((p) => ({
      period: (p === 'week' ? 'week' : 'all') as ScorePeriod,
      label: playerPeriodLabel(p),
      count: unavailable ? '—' : tn(boards.get(p)!.players, '{n} joueur', '{n} joueurs'),
      current: p === playerPeriod,
      action: actions.push({ label: t('Onglet {period}', { period: playerPeriodLabel(p) }), key: `period-${p}`, run: () => ((playerPeriod = p), here()) }) - 1,
    }));
    actions.push({ label: t('Retour : Classements'), icon: 'back', key: 'back', run: () => home(0) });
    const board = boards.get(playerPeriod)!;
    let view: ScoreboardView;
    if (unavailable) view = { scopes, tabs, lines: [], empty: { title: t('Classement indisponible'), detail: unavailable } };
    else {
      const lines = board.lines.map((l, i) => playerLineView(l, playerPeriod, Boolean(l.mine) && i > 0 && board.lines[i - 1]!.rank + 1 < l.rank));
      const notes = [t('Les joueurs que cette borne connaît : leurs cartes arrivent au fil des connexions'), board.doubtful ? tn(board.doubtful, '{n} joueur écarté (XP impossibles)', '{n} joueurs écartés (XP impossibles)') : ''].filter(Boolean).join(' · ');
      const shownPresence = new Set(lines.flatMap((l) => (l.status ? [presenceOf(l.status)] : [])));
      const legend = (['playing', 'online', 'offline'] as Presence[]).filter((pr) => shownPresence.has(pr)).map((presence) => ({ presence, label: presence === 'playing' ? t('En partie') : presence === 'online' ? t('En ligne') : t('Hors ligne') }));
      const empty =
        playerScope === 'friends' && !host.players?.state().friends.size
          ? { title: t('Aucun ami pour l’instant'), detail: t('Communauté > Trouver un joueur') }
          : playerPeriod === 'week'
            ? { title: t('Personne n’a encore gagné d’XP cette semaine'), detail: t('Chaque partie compte : le classement repart à zéro chaque lundi.') }
            : { title: t('Aucun joueur classé pour l’instant'), detail: t('Les cartes des autres joueurs arrivent au fil des connexions.') };
      view = { scopes, tabs, lines, ...(lines.length ? {} : { empty }), position: playerPosition(board, playerScope, playerPeriod), note: notes, ...(legend.length ? { legend } : {}) };
    }
    return {
      heading: t('Joueurs'),
      icon: 'gauge',
      subheading: `${playerScopeLabel(playerScope)} · ${playerPeriodLabel(playerPeriod)}`,
      lead: playerPeriod === 'week' ? t('Les XP gagnés depuis lundi : le classement repart à zéro chaque semaine.') : t('Les XP de toujours : le niveau de chaque joueur.'),
      sections: [],
      scoreboard: view,
      actions,
      back: () => home(0),
      hint: t('Flippers : Cette semaine ou Tout temps · Start ou MagnaSave : portée suivante · Exit : retour aux classements · souris'),
      keys: (input) => {
        const keys = host.keys?.();
        // Start : la portée suivante. Une borne dont les MagnaSave valident et reviennent dans l'OS (étape
        // « Boutons de l'interface ») n'avait aucun moyen de changer de portée (retour du 18/11/2026).
        const magna = host.zoneKeys();
        const start = keys?.confirm.includes(input.code) ?? false;
        if (start || magna.includes(input.code)) {
          const dir = !start && magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
          const at = PLAYER_SCOPES.indexOf(playerScope);
          playerScope = PLAYER_SCOPES[(at + dir + PLAYER_SCOPES.length) % PLAYER_SCOPES.length]!;
          here();
          return true;
        }
        if (keys && (keys.previous.includes(input.code) || keys.next.includes(input.code))) {
          playerPeriod = playerPeriod === 'week' ? 'all' : 'week';
          here();
          return true;
        }
        return false;
      },
    };
  }

  /** Le retour, dans les actions de l'écran « Joueurs » : après les trois portées et les deux périodes. */
  const PLAYERS_BACK = PLAYER_SCOPES.length + PLAYER_PERIODS.length;

  function openPlayers(): void {
    // Mon pays d'abord ; sans pays, le monde ; la semaine d'abord : tout le monde y a sa chance.
    const s = host.players?.state();
    playerScope = s?.country ? 'country' : 'world';
    playerPeriod = 'week';
    host.library.openCustom(buildPlayers, PLAYERS_BACK);
  }

  // ---------- Accueil ----------

  let standingKept: { at: number; value: PlayerStanding | undefined } | undefined;

  function standing(): PlayerStanding | undefined {
    const at = now();
    if (standingKept && at - standingKept.at >= 0 && at - standingKept.at < STANDING_TTL_MS) return standingKept.value;
    let value: PlayerStanding | undefined;
    if (host.players && !playersUnavailable('world')) {
      const placeIn = (sc: PlayerScope): StandingPlace => {
        const all = playersOf(sc, 'all');
        const week = playersOf(sc, 'week');
        return { ...(all.me ? { rank: all.me.rank } : {}), players: all.players, ...(week.me ? { week: week.me.rank } : {}) };
      };
      const country = host.players.state().country;
      value = { world: placeIn('world'), ...(country ? { country: { code: country, ...placeIn('country') } } : {}) };
    }
    standingKept = { at, value };
    return value;
  }

  /** Ma place chez les joueurs : « Vous : niveau 14 · 37ᵉ en France · 412ᵉ au monde ». */
  function playersDetail(): string {
    if (!host.players) return t('Indisponible : réseau des bornes absent');
    const why = playersUnavailable('world');
    if (why) return t('Indisponible : {why}', { why });
    const s = host.players.state();
    const parts: string[] = [];
    const level = playersOf('world', 'all').lines.find((l) => l.mine)?.level;
    if (level) parts.push(t('Vous : niveau {n}', { n: level }));
    const week = playersOf('world', 'week');
    if (week.me) parts.push(week.me.rank === 1 ? t('1ᵉʳ au monde cette semaine') : t('{n}ᵉ au monde cette semaine', { n: week.me.rank }));
    if (s.country) {
      const national = playersOf('country', 'week');
      if (national.me) parts.push(national.me.rank === 1 ? t('1ᵉʳ dans votre pays') : t('{n}ᵉ dans votre pays', { n: national.me.rank }));
    }
    return parts.length ? parts.join(' · ') : t('Classés par XP : amis, national, mondial ; cette semaine ou de tout temps');
  }

  function buildHome(): Built {
    const players = host.players ? playersUnavailable('world') : t('Réseau des bornes absent');
    return {
      heading: t('Classements'),
      icon: 'trophy',
      subheading: t('Joueurs ou tables'),
      lead: t('Les joueurs classés par leurs XP, ou le tableau des scores de chaque table.'),
      sections: [],
      actions: [
        { label: t('Joueurs'), detail: playersDetail(), icon: 'gauge', ...(players ? { tone: 'quiet' as const } : {}), run: openPlayers },
        { label: t('Tables'), detail: t('Le tableau des scores de chaque table : recherche, dernières jouées'), icon: 'trophy', run: openTables },
        { label: t('Retour : Communauté'), icon: 'back', run: () => back() },
      ],
      back: () => back(),
    };
  }

  /** L'accueil des classements, le curseur sur la porte d'où l'on revient (0 : Joueurs, 1 : Tables). */
  function home(at: number): void {
    host.library.openCustom(buildHome, at);
  }

  return {
    remoteTables,
    open(to) {
      back = to;
      period = 'all';
      query = '';
      cache.clear();
      windowAt = 0;
      home(0);
    },
    detail: () => t('Joueurs par XP, et les scores de chaque table'),
    standing,
  };
}
