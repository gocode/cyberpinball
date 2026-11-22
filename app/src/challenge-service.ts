// Défis asynchrones (packages/core/src/challenges.ts, 22/11/2026) : le service de la borne.
// - Mon fichier (<données>\amis\defis.json, writeFileAtomic) garde les notes signées de mes défis ; l'état
//   (envoyé, reçu, en cours, gagné, perdu, expiré, refusé) s'en déduit à chaque lecture.
// - Les notes partent par le réseau des bornes (social-net.ts : sendChallenges), qui les relaie et les
//   garde jusqu'à l'échéance ; mes notes des défis ouverts sont redites à chaque bonjour, et la borne de
//   l'autre joueur est rejointe par sa clé (setChallengeSource).
// - Une partie finie sur une version exacte (frontend.ts) : mon meilleur score de la fenêtre part, s'il
//   monte, pour chaque défi ouvert sur cette version. Seuls les scores relevés par Cyber Pinball.
// - Toutes les minutes et à chaque arrivée : les nouvelles (reçu, battu par l'autre, plus que 6 h,
//   résultat, refus) deviennent des notifications « challenge », une ligne d'Activité par défi ; un défi
//   gagné et acquis rapporte ses XP une fois (level-tracker.ts).
// - Jeu local et mode invité : rien ne s'annonce, rien ne se montre, rien ne part.
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  challengeBlocked,
  challengeNews,
  challengesFile,
  challengeToPay,
  declineChallenge,
  laterNumber,
  loadChallenges,
  mergeMyChallenges,
  myChallenges,
  myOpenNotes,
  offerChallenge,
  saveChallenges,
  scoreChallenge,
  t,
  tLater,
  XP,
  type Challenge,
  type ChallengeNews,
  type ChallengeNote,
  type ChallengeOffer,
  type ChallengePlayer,
  type ChallengeStore,
  type ChallengeTable,
  type NoticeEvent,
  type PlayerKey,
} from '@cyberpinball/core';

export interface ChallengeServiceHost {
  dataDir: string;
  net: {
    state(): { enabled: boolean; name: string; key: PlayerKey; blocked: readonly string[] };
    country(): string | undefined;
    sendChallenges(notes: readonly ChallengeNote[]): void;
    setChallengeSource(own: () => readonly ChallengeNote[], peers: () => readonly string[]): void;
    challengePeersChanged(): void;
    onChallenges(listener: (notes: ChallengeNote[]) => void): () => void;
  };
  /** Un joueur écarté : bloqué, ou exclu des salons par la modération. */
  refused(key: string): boolean;
  /** Un défi gagné : ses XP (level-tracker.ts) ; rend ce qui a été versé. */
  won(table: string): number;
  /** La file des notifications (menu-notices.ts), qui les consigne aussi au journal d'Activité. */
  push(events: readonly NoticeEvent[]): void;
  /** Jeu local ou mode invité : rien ne se montre ni ne part. */
  closed(): boolean;
  /** Mes défis ont changé : l'écran se redessine. */
  changed(): void;
  log(line: string): void;
  now?(): Date;
  /** Essais : pas de minuteur. */
  timer?: false;
}

export interface ChallengeService {
  start(): void;
  stop(): void;
  /** Mes défis, le plus pressant d'abord ; rien en jeu local, en mode invité ou partage coupé. */
  list(): Challenge[];
  get(id: string): Challenge | undefined;
  /** Pourquoi ce défi ne peut pas partir (déjà en cours, trop de défis, partage coupé) ; undefined : il peut. */
  blocked(opponent: string, table: Pick<ChallengeTable, 'board' | 'balls'>): string | undefined;
  /** Défier : la note signée part ; rend le défi, ou la raison. */
  offer(to: ChallengePlayer, table: ChallengeTable, score: number, source: ChallengeOffer['source']): { challenge: Challenge } | { reason: string };
  /** Refuser un défi reçu. */
  decline(id: string): boolean;
  /** Une partie finie sur cette version exacte, ses scores relevés : mon meilleur part pour chaque défi ouvert. */
  gamePlayed(version: { board: string; balls?: number }, scores: readonly number[]): void;
  /** Relit les échéances : nouvelles, résultats, XP (toutes les minutes). */
  tick(): void;
  /** Pourquoi les défis ne se montrent pas ; undefined : ils se montrent. */
  unavailable(): string | undefined;
}

/** Les échéances (plus que 6 h, résultat) se relisent à ce rythme. */
const TICK_MS = 60_000;

export function createChallengeService(host: ChallengeServiceHost): ChallengeService {
  const now = () => host.now?.() ?? new Date();
  const file = challengesFile(host.dataDir);
  const loaded = loadChallenges(file, now());
  if (loaded.setAside) host.log(`Défis : fichier illisible, mis de côté (${loaded.setAside}).`); // i18n-ignore : journal
  const store: ChallengeStore = loaded.store;
  const me = () => host.net.state().key.publicKey;
  let timer: NodeJS.Timeout | undefined;
  let unsubscribe: (() => void) | undefined;

  function save(): void {
    try {
      saveChallenges(file, store);
    } catch (error) {
      host.log(`Défis : fichier non enregistré (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  function unavailable(): string | undefined {
    if (host.closed()) return t('Retirés : la borne joue en local');
    if (!host.net.state().enabled) return t('Partage désactivé : Communauté > Partage et réseau');
    return undefined;
  }

  /** Mes défis, sans ceux d'un joueur écarté depuis (bloqué, exclu). */
  function all(): Challenge[] {
    return myChallenges(store, me(), now()).filter((c) => !host.refused(c.opponent.key));
  }

  function list(): Challenge[] {
    return unavailable() ? [] : all();
  }

  /** Les joueurs de mes défis ouverts : leur borne est rejointe par sa clé. */
  function peers(): string[] {
    if (unavailable()) return [];
    return [...new Set(all().filter((c) => c.state === 'sent' || c.state === 'received' || c.state === 'running').map((c) => c.opponent.key))];
  }

  function own(): ChallengeNote[] {
    return unavailable() ? [] : myOpenNotes(store, me(), now());
  }

  /** Une nouvelle en notification : l'autre joueur, la table, les scores ; une ligne d'Activité par défi (thread). */
  function noticeOf(n: ChallengeNews, xp: number): NoticeEvent {
    const c = n.challenge;
    const score = (v: number | undefined) => laterNumber(v ?? 0);
    const extra = (() => {
      switch (n.stage) {
        case 'received':
          return tLater('Score à battre : {score} · 48 h pour jouer', { score: score(c.theirs ?? c.target) });
        case 'beaten':
          return tLater('{their} contre vos {mine}', { their: score(c.theirs), mine: score(c.mine) });
        case 'expiring':
          return c.theirs !== undefined ? tLater('Score à battre : {score}', { score: score(c.theirs) }) : undefined;
        case 'won':
          return xp > 0 ? tLater('{mine} contre {their} · +{xp} XP', { mine: score(c.mine), their: score(c.theirs), xp }) : tLater('{mine} contre {their}', { mine: score(c.mine), their: score(c.theirs) });
        case 'lost':
          return tLater('{their} contre vos {mine}', { their: score(c.theirs), mine: score(c.mine) });
        default:
          return undefined;
      }
    })();
    return { kind: 'challenge', key: n.key, at: now().getTime(), who: c.opponent.name, player: c.opponent.key, thread: c.id, subject: c.table.title, ...(extra ? { extra } : {}), stage: n.stage };
  }

  /** Les nouvelles et les XP : relus à chaque arrivée et toutes les minutes. */
  function tick(): void {
    if (unavailable()) return;
    const at = now();
    // Les XP d'abord : la notification du résultat dit ce qui a été versé.
    const paid = new Map<string, number>();
    for (const c of all()) {
      if (!challengeToPay(store, c)) continue;
      store.paid.push(c.id);
      const xp = host.won(c.table.title);
      paid.set(c.id, xp);
      host.log(`Défis : gagné contre ${c.opponent.name} sur ${c.table.title} (${c.mine} contre ${c.theirs}), +${xp} XP.`); // i18n-ignore : journal
    }
    const news = challengeNews(store, me(), at).filter((n) => !host.refused(n.challenge.opponent.key));
    // Le résultat d'un défi gagné attend son règlement (CHALLENGE_SETTLE_MS) : il dit ses XP.
    const shown = news.filter((n) => !(n.stage === 'won' && !n.challenge.settled));
    const held = news.filter((n) => !shown.includes(n));
    if (held.length) store.said = store.said.filter((k) => !held.some((n) => n.key === k));
    if (shown.length || paid.size) save();
    if (shown.length) {
      host.push(shown.map((n) => noticeOf(n, paid.get(n.challenge.id) ?? (n.stage === 'won' ? XP.challengeWin : 0))));
      for (const n of shown) host.log(`Défis : ${n.stage}, ${n.challenge.opponent.name} sur ${n.challenge.table.title}.`); // i18n-ignore : journal
      host.changed();
    }
  }

  /** Des notes arrivées du réseau : celles qui me concernent entrent au fichier. */
  function received(notes: readonly ChallengeNote[]): void {
    if (unavailable()) return;
    const before = peers().join(',');
    const added = mergeMyChallenges(store, notes, me(), host.refused, now());
    if (!added.length) return;
    save();
    host.log(`Défis : ${added.length} note(s) reçue(s).`); // i18n-ignore : journal
    if (peers().join(',') !== before) host.net.challengePeersChanged();
    tick();
    host.changed();
  }

  function blocked(opponent: string, table: Pick<ChallengeTable, 'board' | 'balls'>): string | undefined {
    const off = unavailable();
    if (off) return off;
    if (host.refused(opponent)) return t('Joueur bloqué');
    return challengeBlocked(all(), opponent, table, me());
  }

  function send(notes: readonly ChallengeNote[]): void {
    mergeMyChallenges(store, notes, me(), host.refused, now());
    save();
    host.net.sendChallenges(notes);
  }

  return {
    start() {
      host.net.setChallengeSource(own, peers);
      unsubscribe = host.net.onChallenges(received);
      tick();
      if (host.timer !== false) {
        timer = setInterval(tick, TICK_MS);
        timer.unref?.();
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      unsubscribe?.();
    },
    list,
    get: (id) => list().find((c) => c.id === id),
    blocked,
    offer(to, table, score, source) {
      const reason = blocked(to.key, table);
      if (reason) return { reason };
      if (!(score > 0)) return { reason: t('Pas encore de score sur cette version : jouez d’abord une partie') };
      const s = host.net.state();
      const country = host.net.country();
      const note = offerChallenge({ key: s.key, name: s.name, ...(country ? { country } : {}) }, to, table, score, source, now());
      send([note]);
      host.net.challengePeersChanged();
      host.log(`Défis : ${to.name} défié sur ${table.title} (${score}, ${source === 'game' ? 'partie' : 'meilleur score'}).`); // i18n-ignore : journal
      host.changed();
      return { challenge: all().find((c) => c.id === note.id)! };
    },
    decline(id) {
      const c = all().find((x) => x.id === id);
      if (!c || c.role !== 'received' || c.state !== 'received' || unavailable()) return false;
      send([declineChallenge({ key: host.net.state().key }, c, now())]);
      host.log(`Défis : défi de ${c.opponent.name} sur ${c.table.title} refusé.`); // i18n-ignore : journal
      host.net.challengePeersChanged();
      host.changed();
      return true;
    },
    gamePlayed(version, scores) {
      if (unavailable()) return;
      const best = Math.max(0, ...scores.filter((s) => Number.isSafeInteger(s)));
      if (!best) return;
      const notes: ChallengeNote[] = [];
      for (const c of all()) {
        if (c.state !== 'sent' && c.state !== 'received' && c.state !== 'running') continue;
        if (c.table.board !== version.board || (c.table.balls ?? 0) !== (version.balls ?? 0)) continue;
        if (c.mine !== undefined && best <= c.mine) continue;
        notes.push(scoreChallenge({ key: host.net.state().key }, c, best, now()));
        host.log(`Défis : ${best} sur ${c.table.title} contre ${c.opponent.name}.`); // i18n-ignore : journal
      }
      if (!notes.length) return;
      send(notes);
      tick();
      host.changed();
    },
    tick,
    unavailable,
  };
}
