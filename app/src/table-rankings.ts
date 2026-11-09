// Classements d'une table au tableau des scores (packages/core/src/rankings.ts) : les amis, le pays,
// le monde, sur la version exacte de ma table (empreintes du .vpx et du script, live-game.ts) et son
// nombre de billes. L'empreinte se calcule une fois, en arrière-plan ; l'écran se redessine à son
// arrivée. Un classement indisponible le dit, avec sa raison, jamais caché.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import { boardKey, rankingBoard, t, type RankingLine, type RankingPosition, type RankingScope, type RankingStore, type ScorePeriod, type SocialState, type TableEntry } from '@cyberpinball/core';

export interface TableRankingsOptions {
  net: {
    state(): SocialState;
    rankings(): RankingStore;
    country(): string | undefined;
    status(): { running: boolean };
  };
  /** Version stricte d'une de mes tables (live-game.ts, versionOf). */
  versionOf(table: TableEntry): Promise<{ print?: string; script?: string }>;
  /** Billes par partie de ma table (ball-count.ts) ; undefined : inconnu. */
  ballsOf(table: TableEntry): Promise<number | undefined>;
  /** Une empreinte vient d'arriver : l'écran se redessine. */
  changed?(): void;
  /** Horloge (essais) : les périodes se comptent à partir d'elle. */
  now?(): Date;
}

export interface RankingView {
  lines: RankingLine[];
  /** Joueurs classés pendant la période (connus de cette borne). */
  players: number;
  /** Tous les joueurs de la période sont connus (moins que ce que la borne garde) : `players` est le compte exact. */
  complete?: boolean;
  /** Où se trouve le joueur de la borne ; absent : pas de score pendant la période. */
  me?: RankingPosition;
  /** Pourquoi ce classement ne se montre pas ; les lignes sont alors vides. */
  unavailable?: string;
  /** Ce qui se compare (la version, les billes), et l'état du réseau. */
  note?: string;
}

type Version = { state: 'pending' } | { state: 'none' } | { state: 'ok'; board: string; balls?: number };

export interface TableRankings {
  view(table: TableEntry, scope: Exclude<RankingScope, 'cabinet'>, period: ScorePeriod): RankingView;
}

export function createTableRankings(opts: TableRankingsOptions): TableRankings {
  /** Version de chaque table, par fichier : calculée une fois par lancement (le .vpx peut changer, la borne redémarre). */
  const versions = new Map<string, Version>();

  function versionOf(table: TableEntry): Version {
    const known = versions.get(table.file);
    if (known) return known;
    versions.set(table.file, { state: 'pending' });
    void (async () => {
      try {
        const board = boardKey(await opts.versionOf(table));
        const balls = board ? await opts.ballsOf(table) : undefined;
        versions.set(table.file, board ? { state: 'ok', board, ...(balls ? { balls } : {}) } : { state: 'none' });
      } catch {
        versions.set(table.file, { state: 'none' });
      }
      opts.changed?.();
    })();
    return versions.get(table.file)!;
  }

  return {
    view(table, scope, period) {
      const state = opts.net.state();
      if (!state.enabled) return { lines: [], players: 0, unavailable: t('Partage désactivé : Amis > Partage et réseau') };
      const version = versionOf(table);
      if (version.state === 'pending') return { lines: [], players: 0, unavailable: t('Empreinte de la table en calcul…') };
      if (version.state === 'none') return { lines: [], players: 0, unavailable: t('Version de la table illisible : pas de classement') };
      const country = opts.net.country();
      if (scope === 'country' && !country) return { lines: [], players: 0, unavailable: t('Pays non choisi : Amis > Partage et réseau') };
      if (scope === 'friends' && !state.friends.length) return { lines: [], players: 0, unavailable: t('Aucun ami pour l’instant : Amis > Trouver un joueur') };
      const board = rankingBoard(
        opts.net.rankings(),
        { board: version.board, ...(version.balls ? { balls: version.balls } : {}), period, scope, ...(country ? { country } : {}), friends: new Set(state.friends.map((f) => f.key)), me: state.key.publicKey },
        opts.now?.() ?? new Date(),
      );
      const same = version.balls ? t('Même version de la table que la vôtre, {n} billes par partie', { n: version.balls }) : t('Même version de la table que la vôtre');
      const shared = state.shareScores === false ? t('vos scores ne sont pas publiés') : undefined;
      const offline = opts.net.status().running ? undefined : t('hors ligne : d’après les scores déjà reçus');
      return { ...board, note: [same, shared, offline].filter(Boolean).join(' · ') };
    },
  };
}
