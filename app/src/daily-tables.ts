// Tables du jour, côté application (packages/core/src/dailytables.ts pour les règles) : mes parties
// par version de table, tenues dans <données>\amis\parties-du-jour.json et jointes à ma carte publique ;
// les tables du jour de chaque portée, le record du jour et l'objectif d'une de mes tables, lus sur ce
// que la borne a reçu du réseau. L'écran « Tables du jour » (daily-tables-menu.ts), la fiche d'une
// table (table-social.ts), le chargement et l'Arène lisent tous ce service.
//
// Rien n'est compté en mode invité, ni pendant un essai sans opérateur : l'appelant ne le signale pas.
//
// Sans electron à l'exécution : les tests chargent ce module avec un réseau d'essai.

import {
  avatarView,
  cardPlays,
  dailyTables,
  dayRecord,
  loadPlays,
  notePlay,
  playsFile,
  prunePlays,
  savePlays,
  t,
  tableObjective,
  type AvatarView,
  type DailyBoard,
  type DailyHolder,
  type DailyInput,
  type DailyPeriod,
  type DailyScope,
  type Objective,
  type PlaysStore,
  type TableEntry,
} from '@cyberpinball/core';
import { searchKey } from './rankings-menu';
import type { SocialNet } from './social-net';
import type { TableVersion } from './table-rankings';

export interface DailyTablesHost {
  dataDir: string;
  net: Pick<SocialNet, 'state' | 'rankings' | 'country' | 'publicCards' | 'cardFirstSeen' | 'setPlays' | 'avatarFile' | 'rankingAvatar'>;
  /** Mes XP (level-tracker.ts) : mon niveau dans les lignes. */
  myXp(): number | undefined;
  tables(): readonly TableEntry[];
  /** Version exacte d'une de mes tables (table-rankings.ts) : calculée en arrière-plan. */
  versionOf(table: TableEntry): TableVersion;
  /** Mon meilleur score relevé sur cette borne pour cette table (scores.json) : la référence de l'objectif sans score publié. */
  myBest?(table: TableEntry): number | undefined;
  log(line: string): void;
  now?(): Date;
}

/** Ce que j'ai de la table d'une ligne : la même version, une autre, rien, ou en calcul. */
export type LocalMatch =
  | { state: 'mine'; table: TableEntry }
  | { state: 'pending' }
  | { state: 'other'; tables: TableEntry[] }
  | { state: 'missing' };

/** L'objectif d'une de mes tables, ou pourquoi il n'y en a pas encore. */
export type TableGoal =
  | { state: 'off'; reason: string }
  | { state: 'pending' }
  | { state: 'none' }
  | { state: 'ok'; board: string; balls?: number; objective?: Objective; record?: DailyHolder; recordScope: DailyScope };

export interface DailyTablesService {
  /** Au démarrage : mes parties de la semaine à ma carte ; puis à chaque changement de jour. */
  start(): void;
  stop(): void;
  /** Une partie jouée sur cette version (au moins une minute, hors invité et essai). */
  gamePlayed(table: TableEntry, version: { board: string; balls?: number }): void;
  /** Pourquoi les tables du jour ne se montrent pas (partage coupé) ; undefined : elles se montrent. */
  unavailable(): string | undefined;
  /** Ce que lisent les calculs (dailytables.ts). */
  input(): DailyInput;
  /** Les tables du jour d'une portée (la semaine sous le seuil, sauf période imposée) ; gardé deux secondes. */
  board(scope: DailyScope, period?: DailyPeriod): DailyBoard;
  /** L'objectif et le record du jour d'une de mes tables (fiche, chargement). */
  goalOf(table: TableEntry): TableGoal;
  /** Le record du jour d'une version dans une portée (l'Arène : « champion du jour »). */
  recordOf(table: { board: string; balls?: number }, scope: DailyScope, period?: DailyPeriod): DailyHolder | undefined;
  /** Sa pastille : son avatar s'il est arrivé, sinon ses initiales, avec l'anneau de son niveau. */
  face(holder: Pick<DailyHolder, 'key' | 'name' | 'avatar' | 'level'>): AvatarView;
  /** Ma table de la même version que cette ligne, une autre version, ou rien. */
  localFor(line: { board: string; balls?: number; title: string }): LocalMatch;
  /** Mon pays (portée « Pays ») ; mes amis. */
  country(): string | undefined;
  friends(): number;
}

/** Les classements se recalculent au plus toutes les deux secondes : l'écran se redessine à chaque état. */
const TTL_MS = 2000;
/** Ma carte relit mes parties : le jour change à minuit, la semaine le lundi. */
const REFRESH_MS = 10 * 60_000;

export function createDailyTables(host: DailyTablesHost): DailyTablesService {
  const now = () => host.now?.() ?? new Date();
  const file = playsFile(host.dataDir);
  const loaded = loadPlays(file, now());
  if (loaded.setAside) host.log(`Tables du jour : fichier illisible, mis de côté (${loaded.setAside}).`); // i18n-ignore : journal
  let store: PlaysStore = loaded.store;
  let timer: NodeJS.Timeout | undefined;
  const cache = new Map<string, { at: number; board: DailyBoard }>();

  function publish(): void {
    store = prunePlays(store, now());
    host.net.setPlays(cardPlays(store, now()));
  }

  function input(): DailyInput {
    const s = host.net.state();
    const me = s.key.publicKey;
    const country = host.net.country();
    const xp = host.myXp();
    const plays = cardPlays(store, now());
    return {
      store: host.net.rankings(),
      cards: host.net.publicCards().map((c) => ({ key: c.key, name: c.name, ...(c.country ? { country: c.country } : {}), ...(c.avatar ? { avatar: c.avatar } : {}), ...(c.xp !== undefined ? { xp: c.xp } : {}), ...(c.plays ? { plays: c.plays } : {}) })),
      me: { key: me, name: s.name, ...(country ? { country } : {}), ...(xp !== undefined ? { xp } : {}), ...(plays ? { plays } : {}) },
      friends: new Set(s.friends.map((f) => f.key)),
      ...(country ? { country } : {}),
      firstSeen: (key) => host.net.cardFirstSeen(key),
    };
  }

  function unavailable(): string | undefined {
    return host.net.state().enabled ? undefined : t('Partage désactivé : Communauté > Partage et réseau');
  }

  /** Mes tables qui portent ce titre (sans accents ni casse), la même version en tête une fois connue. */
  function localFor(line: { board: string; balls?: number; title: string }): LocalMatch {
    const key = searchKey(line.title);
    const named = host.tables().filter((x) => {
      const k = searchKey(x.title);
      return k === key || (k.length > 3 && key.startsWith(k)) || (key.length > 3 && k.startsWith(key));
    });
    if (!named.length) return { state: 'missing' };
    let pending = false;
    for (const table of named) {
      const v = host.versionOf(table);
      if (v.state === 'ok' && v.board === line.board) return { state: 'mine', table };
      if (v.state === 'pending') pending = true;
    }
    return pending ? { state: 'pending' } : { state: 'other', tables: named };
  }

  function goalOf(table: TableEntry): TableGoal {
    const off = unavailable();
    if (off) return { state: 'off', reason: off };
    const v = host.versionOf(table);
    if (v.state === 'pending') return { state: 'pending' };
    if (v.state === 'none') return { state: 'none' };
    const at = now();
    const data = input();
    const version = { board: v.board, ...(v.balls ? { balls: v.balls } : {}) };
    const best = host.myBest?.(table);
    const objective = tableObjective(data, version, { now: at, ...(best ? { myBest: best } : {}) });
    // Le record du jour du pays, sinon du monde.
    const recordScope: DailyScope = data.country && dayRecord(data, version, { scope: 'country', now: at }) ? 'country' : 'world';
    const record = dayRecord(data, version, { scope: recordScope, now: at });
    return { state: 'ok', ...version, ...(objective ? { objective } : {}), ...(record ? { record } : {}), recordScope };
  }

  return {
    start() {
      publish();
      timer = setInterval(publish, REFRESH_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
    gamePlayed(table, version) {
      store = notePlay(store, { ...version, title: table.title }, now());
      try {
        savePlays(file, store);
      } catch (error) {
        host.log(`Tables du jour : parties non enregistrées (${(error as Error).message}).`); // i18n-ignore : journal
      }
      cache.clear();
      publish();
    },
    unavailable,
    input,
    board(scope, period) {
      const key = `${scope}|${period ?? ''}`;
      const known = cache.get(key);
      const at = now().getTime();
      if (known && at - known.at >= 0 && at - known.at < TTL_MS) return known.board;
      const board = dailyTables(input(), { scope, ...(period ? { period } : {}), now: now() });
      cache.set(key, { at, board });
      return board;
    },
    goalOf,
    recordOf: (table, scope, period) => dayRecord(input(), table, { scope, ...(period ? { period } : {}), now: now() }),
    face(holder) {
      const file = host.net.avatarFile(holder.key) ?? (holder.avatar ? host.net.rankingAvatar(holder.key, holder.avatar) : undefined);
      return { ...avatarView(holder.key, holder.name, file), ...(holder.level ? { level: holder.level } : {}) };
    },
    localFor,
    country: () => host.net.country(),
    friends: () => host.net.state().friends.length,
  };
}
