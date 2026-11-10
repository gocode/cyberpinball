// Classements d'une table au tableau des scores (packages/core/src/rankings.ts) : les amis, le pays,
// le monde, sur la version exacte de ma table (empreintes du .vpx et du script, live-game.ts) et son
// nombre de billes. L'empreinte se calcule une fois, en arrière-plan ; l'écran se redessine à son
// arrivée. Un classement indisponible le dit, avec sa raison, jamais caché.
//
// Chaque joueur classé montre son avatar (celui d'un ami tel qu'on l'a reçu, sinon celui que porte
// son dernier score, demandé au réseau) et son statut : « En partie » ou « En ligne » quand sa borne
// est reliée à la mienne, « Hors ligne » pour un ami qui ne l'est pas, et pour un autre joueur sa
// dernière apparition sur le réseau (décidé le 10/11/2026 : sans liaison, on ne sait pas s'il joue).
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import { avatarView, boardKey, rankingBoard, relationOf, socialAgo, t, type AvatarView, type Presence, type RankingLine, type RankingPosition, type RankingScope, type RankingStore, type ScorePeriod, type SocialState, type TableEntry } from '@cyberpinball/core';

export interface TableRankingsOptions {
  net: {
    state(): SocialState;
    rankings(): RankingStore;
    country(): string | undefined;
    status(): { running: boolean };
    /** Borne du joueur reliée à la mienne en ce moment. */
    online?(key: string): boolean;
    /** Présence d'un ami (en partie ou au menu). */
    presenceOf?(key: string): Presence | undefined;
    /** Avatar d'un ami, d'une demande en cours ou le mien, tel qu'on l'a (fichier). */
    avatarFile?(key: string): string | undefined;
    /** Avatar d'un joueur classé d'après l'empreinte de son score : le fichier, sinon demandé. */
    rankingAvatar?(key: string, hash: string): string | undefined;
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

/** Statut d'un joueur classé : ce que la borne en sait. */
export interface PlayerStatus {
  state: 'playing' | 'online' | 'offline' | 'seen';
  label: string;
}

export interface RankingViewLine extends RankingLine {
  /** Sa pastille : son image, sinon ses initiales sur sa teinte. */
  face: AvatarView;
  /** Son statut ; absent : le mien, ou un joueur jamais vu sur le réseau. */
  status?: PlayerStatus;
}

export interface RankingView {
  lines: RankingViewLine[];
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

  /** Pastille et statut de chaque joueur classé. */
  function dressed(line: RankingLine, state: SocialState, now: Date): RankingViewLine {
    const net = opts.net;
    const file = net.avatarFile?.(line.key) ?? (line.avatar ? net.rankingAvatar?.(line.key, line.avatar) : undefined);
    const face = avatarView(line.key, line.name, file);
    if (line.mine) return { ...line, face };
    const online = net.online?.(line.key) ?? false;
    const friend = relationOf(state, line.key) === 'friend';
    let status: PlayerStatus | undefined;
    if (online) status = friend && net.presenceOf?.(line.key)?.status === 'playing' ? { state: 'playing', label: t('En partie') } : { state: 'online', label: t('En ligne') };
    else if (friend) status = { state: 'offline', label: t('Hors ligne') };
    else {
      const seen = state.directory.find((d) => d.profile.key === line.key)?.seen;
      if (seen) status = { state: 'seen', label: t('Vu {ago}', { ago: socialAgo(seen, now) }) };
    }
    return { ...line, face, ...(status ? { status } : {}) };
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
      const now = opts.now?.() ?? new Date();
      const board = rankingBoard(
        opts.net.rankings(),
        { board: version.board, ...(version.balls ? { balls: version.balls } : {}), period, scope, ...(country ? { country } : {}), friends: new Set(state.friends.map((f) => f.key)), me: state.key.publicKey },
        now,
      );
      const same = version.balls ? t('Même version de la table que la vôtre, {n} billes par partie', { n: version.balls }) : t('Même version de la table que la vôtre');
      const shared = state.shareScores === false ? t('vos scores ne sont pas publiés') : undefined;
      const offline = opts.net.status().running ? undefined : t('hors ligne : d’après les scores déjà reçus');
      return { ...board, lines: board.lines.map((l) => dressed(l, state, now)), note: [same, shared, offline].filter(Boolean).join(' · ') };
    },
  };
}
