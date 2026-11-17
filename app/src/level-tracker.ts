// Niveau du joueur, côté application (levels.ts pour les règles, badges.ts pour les badges) : le
// fichier <données>\amis\niveau.json, les XP de chaque fin de partie, des parties en ligne, du salon,
// des amis et des « J'aime » ; les classements de la semaine relevés puis versés ; les badges ; le
// moment à montrer au joueur à son retour sur l'écran des tables (badges reçus, niveau qui monte).
//
// Rien n'est compté en mode invité, ni pendant un essai sans opérateur (le hôte le dit par `active`).
//
// Sans electron à l'exécution : les tests chargent ce module avec un réseau d'essai.

import * as path from 'node:path';
import {
  badgeDefinition,
  badgeGains,
  badgeXp,
  celebrate,
  closedWeeks,
  emptyLevels,
  evaluateBadges,
  friendsGains,
  gameGains,
  invitedGains,
  levelOf,
  shownLevel,
  tierOf,
  TIER_IDS,
  liveGains,
  loadLevels,
  longestDay,
  noteStanding,
  periodStart,
  playedSpanDays,
  playStats,
  rankingBoard,
  receivedGains,
  recordStats,
  roomMessageGains,
  saveLevels,
  settleWeeks,
  startLevels,
  startXp,
  weekKey,
  weekXp,
  type BadgeFacts,
  type Celebration,
  type GameFacts,
  type HistoryGame,
  type LevelState,
  type LevelView,
  type Place,
  type RankedScore,
  type TableEntry,
  type XpGain,
} from '@cyberpinball/core';
import type { SocialNet } from './social-net';

export interface LevelTrackerHost {
  dataDir: string;
  net: SocialNet;
  tables(): readonly TableEntry[];
  /** Parties en ligne finies (gamehistory.ts), de la plus récente à la plus ancienne. */
  history(): readonly HistoryGame[];
  /** Groupes dont je suis membre ; tables de la semaine gagnées. */
  groups?(): { count: number; wins: number };
  /** Mes avis, retours et propositions (feedback-service.ts) : envois comptés, propositions passées « fait ». */
  contributions?(): { count: number; shipped: number };
  /** Faux en mode invité ou pendant un essai sans opérateur : rien ne compte. */
  active(): boolean;
  /** Le niveau a changé : l'écran se redessine. */
  changed(): void;
  log(line: string): void;
  now?(): Date;
}

/** La carte du joueur (coin d'état) et le récap. */
export interface PlayerLevel extends LevelView {
  /** XP gagnés au retour de la dernière partie, montrés quelques secondes sur la carte. */
  gain?: { xp: number; from: number; at: number };
}

export interface LevelTracker {
  state(): LevelState;
  view(): PlayerLevel;
  facts(): BadgeFacts;
  /** Au démarrage : niveau de départ (une fois), badges, semaines à verser. */
  start(): void;
  gameEnded(f: GameFacts): void;
  liveFinished(entry: HistoryGame): void;
  /** J'ai écrit dans un salon ou un groupe. */
  roomMessage(): void;
  /** Amis, « J'aime » ou réactions ont pu changer. */
  socialChanged(): void;
  /** Relevé des classements de la semaine (après une partie, et toutes les 30 minutes). */
  noteRankings(): void;
  /** Au moins une partie menée au bout depuis les niveaux (une invitation déclarée ensuite compte tout de suite). */
  played(): boolean;
  /** Le moment qui attend d'être montré, s'il y en a un. */
  pending(): Celebration | undefined;
  /** Le joueur l'a vu. */
  seen(): void;
  stop(): void;
}

/** Combien de temps « +85 XP » reste sur la carte du joueur. */
export const GAIN_SHOWN_MS = 6000;

export function createLevelTracker(host: LevelTrackerHost): LevelTracker {
  const now = () => host.now?.() ?? new Date();
  const dir = path.join(host.dataDir, 'amis');
  const loaded = loadLevels(dir, now());
  if (loaded.setAside) host.log(`Niveau : fichier illisible, mis de côté (${loaded.setAside}) ; niveau recalculé sur l'historique.`); // i18n-ignore : journal
  const frozen = loaded.newer === true;
  if (frozen) host.log('Niveau : fichier d’une version plus récente de Cyber Pinball, montré sans être complété.'); // i18n-ignore : journal
  let state: LevelState = frozen ? emptyLevels() : loaded.state;
  let gain: PlayerLevel['gain'];

  /** Mes XP, et ceux de la semaine en cours, à ma carte publique (classement des joueurs, playerranking.ts). */
  function publishLevel(): void {
    const at = now();
    host.net.setLevel(state.xp, { of: weekKey(at), xp: weekXp(state, at) });
  }
  let timer: NodeJS.Timeout | undefined;

  function save(): void {
    if (frozen) return;
    try {
      saveLevels(dir, state);
    } catch (error) {
      host.log(`Niveau : fichier non enregistré (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  /**
   * Mes personnes invitées confirmées (invitations.ts), avec le palier que leur carte publique montre,
   * s'il est vraisemblable (levels.ts, shownLevel) : un palier passé rapporte à celui qui a invité.
   */
  function invitees(): { key: string; name: string; tier?: number }[] {
    const at = now();
    return host.net.invitations().received.map((i) => {
      const card = host.net.publicCard(i.me);
      const level = card ? shownLevel(card.xp, host.net.cardFirstSeen(i.me), at) : undefined;
      return { key: i.me, name: card?.name ?? i.name, ...(level !== undefined ? { tier: TIER_IDS.indexOf(tierOf(level)) } : {}) };
    });
  }

  function facts(): BadgeFacts {
    const s = host.net.state();
    const play = playStats(host.tables());
    const records = recordStats(s.events);
    let live = 0, liveWins = 0, liveFull = 0;
    for (const g of host.history()) {
      const mine = g.players.find((p) => p.key === g.me);
      if (!mine || mine.state !== 'done') continue;
      live++;
      if (g.players.length >= 4) liveFull++;
      if (mine.rank === 1 && g.players.filter((p) => p.rank !== undefined).length >= 2) liveWins++;
    }
    const groups = host.groups?.() ?? { count: 0, wins: 0 };
    const contributions = host.contributions?.() ?? { count: 0, shipped: 0 };
    return {
      invited: invitees().length,
      contributions: contributions.count,
      ideasShipped: contributions.shipped,
      ...play,
      ...records,
      beaten: state.beaten,
      doubled: state.doubled,
      live,
      liveWins,
      liveFull,
      groups: groups.count,
      groupWins: groups.wins,
      friends: s.friends.length,
      likes: state.likesCounted,
      likesGiven: host.net.likesGiven(),
      roomDays: state.roomDays,
      reactions: state.reactionsCounted,
      countryTop10: state.feats.countryTop10,
      countryPodium: state.feats.countryPodium,
      worldTop10: state.feats.worldTop10,
      worldFirst: state.feats.worldFirst,
      top100Streak: state.feats.top100Streak,
      vr: state.vr,
      vision3d: state.vision3d,
      nightOwl: state.nightOwl,
      longestDay: longestDay(state),
      playedSpanDays: playedSpanDays(state),
    };
  }

  /**
   * Les gains d'un évènement, puis les badges qu'ils valent : tout entre au niveau ; ce qui est
   * nouveau pour le joueur (pas le rattrapage silencieux d'une nouvelle série) devient le moment à montrer.
   */
  function apply(next: LevelState, gains: readonly XpGain[], why: string): void {
    const from = state.xp;
    state = next;
    const granted = host.net.checkBadges(facts());
    const badges = granted.fresh.map((b) => b.id).filter((id) => badgeDefinition(id));
    if (badges.length) state = badgeGains(state, badges.map((id) => ({ id, xp: badgeXp(id) })), now()).state;
    const total = state.xp - from;
    if (!total && !badges.length) return;
    // Le rattrapage d'une nouvelle série de badges arrive avec le niveau de départ, ou sans bruit.
    const shown = granted.silent ? [] : badges;
    if (shown.length || levelOf(state.xp).level > levelOf(from).level) state = celebrate(state, from, shown, now());
    if (total) gain = { xp: total, from, at: Date.now() };
    publishLevel();
    save();
    host.log(`Niveau : +${total} XP (${why}${badges.length ? ` ; badges : ${badges.join(', ')}` : ''}) ; niveau ${levelOf(state.xp).level}, ${state.xp} XP.`); // i18n-ignore : journal
    host.changed();
  }

  // ---------- Classements de la semaine ----------

  function standingsAt(ref: Date): { board: string; title: string; world?: Place; country?: Place; friends?: Place }[] {
    const s = host.net.state();
    const me = s.key.publicKey;
    const store = host.net.rankings();
    const start = periodStart('week', ref)!.getTime();
    const mine = new Map<string, RankedScore>();
    for (const sc of store.scores) {
      if (sc.key !== me) continue;
      const t = Date.parse(sc.at);
      if (t < start || t > ref.getTime() + 60_000) continue;
      mine.set(`${sc.board}|${sc.balls ?? ''}`, sc);
    }
    const country = host.net.publicCard(me)?.country ?? s.country;
    const friends = new Set(s.friends.map((f) => f.key));
    const out: { board: string; title: string; world?: Place; country?: Place; friends?: Place }[] = [];
    for (const [id, sc] of mine) {
      const q = { board: sc.board, ...(sc.balls ? { balls: sc.balls } : {}), period: 'week' as const, me, limit: 0 };
      const place = (r: ReturnType<typeof rankingBoard>): Place | undefined => (r.me && r.me.beyond === undefined ? { rank: r.me.rank, players: r.players } : undefined);
      const world = place(rankingBoard(store, { ...q, scope: 'world' }, ref));
      const nat = country ? place(rankingBoard(store, { ...q, scope: 'country', country }, ref)) : undefined;
      const fr = friends.size ? place(rankingBoard(store, { ...q, scope: 'friends', friends }, ref)) : undefined;
      out.push({ board: id, title: sc.table.title, ...(world ? { world } : {}), ...(nat ? { country: nat } : {}), ...(fr ? { friends: fr } : {}) });
    }
    return out;
  }

  function noteRankings(): void {
    if (frozen || !host.active()) return;
    const at = now();
    let next = state;
    // La semaine en cours : la dernière relève l'emporte.
    const week = weekKey(at);
    for (const s of standingsAt(at)) next = noteStanding(next, week, s.board, { title: s.title, ...pick(s) }, false);
    // Une semaine close mais pas encore versée : une dernière relève, prudente, à sa fin.
    for (const w of closedWeeks(next, at)) {
      const end = new Date(periodStart('week', at)!.getTime() - 1);
      if (weekKey(end) !== w) continue;
      for (const s of standingsAt(end)) next = noteStanding(next, w, s.board, { title: s.title, ...pick(s) }, true);
    }
    const settled = settleWeeks(next, at);
    if (settled.gains.length) apply(settled.state, settled.gains, 'classements de la semaine'); // i18n-ignore : journal
    else if (settled.state !== state) {
      state = settled.state;
      save();
    }
    // Un lundi passé sans partie : ma carte annonce la nouvelle semaine, à zéro (setLevel ne renvoie rien d'inchangé).
    publishLevel();
  }
  const pick = (s: { world?: Place; country?: Place; friends?: Place }) => ({ ...(s.world ? { world: s.world } : {}), ...(s.country ? { country: s.country } : {}), ...(s.friends ? { friends: s.friends } : {}) });

  // ---------- Démarrage ----------

  function start(): void {
    if (frozen) return;
    const at = now();
    const s = host.net.state();
    if (!state.started) {
      // Niveau de départ : l'historique relevé, sans plafond ; les amis et « J'aime » d'avant comptés sans XP.
      const f = facts();
      let next = startLevels(state, startXp(f, f), at);
      next = friendsGains(next, s.friends.map((x) => x.key), at, true).state;
      next = receivedGains(next, host.net.receivedIds(), at, true).state;
      // Les personnes invitées d'avant les niveaux n'existent pas (les deux arrivent ensemble) : versées comme les autres.
      next = invitedGains(next, invitees(), at).state;
      state = next;
      const granted = host.net.checkBadges(facts());
      const badges = granted.fresh.map((b) => b.id).filter((id) => badgeDefinition(id));
      if (badges.length) state = badgeGains(state, badges.map((id) => ({ id, xp: badgeXp(id) })), at).state;
      // Le moment du départ : niveau atteint et badges déjà mérités, en cascade.
      state = { ...state, pending: { badges, from: 0, to: state.xp, at: at.toISOString(), start: true } };
      publishLevel();
      save();
      host.log(`Niveau : niveau de départ ${levelOf(state.xp).level} (${state.xp} XP, ${badges.length} badges).`); // i18n-ignore : journal
    } else {
      publishLevel();
      apply(state, [], 'démarrage'); // i18n-ignore : journal
    }
    noteRankings();
    timer = setInterval(noteRankings, 30 * 60_000);
    timer.unref?.();
  }

  return {
    state: () => state,
    view: () => ({ ...levelOf(state.xp), ...(gain && Date.now() - gain.at < GAIN_SHOWN_MS ? { gain } : {}) }),
    facts,
    start,
    gameEnded(f) {
      if (frozen || !host.active()) return;
      const r = gameGains(state, f);
      const done = r.state.lastPlay !== state.lastPlay;
      apply(r.state, r.gains, `partie sur ${f.table.title}${r.capped ? ', plafond du jour atteint' : ''}`); // i18n-ignore : journal
      // Une partie menée au bout : l'invitation déclarée compte (invitations.ts) ; rien si c'est déjà fait.
      if (done) host.net.confirmInvitation();
      noteRankings();
    },
    liveFinished(entry) {
      if (frozen || !host.active()) return;
      const mine = entry.players.find((p) => p.key === entry.me);
      if (!mine) return;
      const won = mine.rank === 1 && entry.players.filter((p) => p.rank !== undefined).length >= 2;
      const r = liveGains(state, { done: mine.state === 'done', won, table: entry.title, at: now() });
      apply(r.state, r.gains, `partie en ligne sur ${entry.title}`); // i18n-ignore : journal
    },
    roomMessage() {
      if (frozen || !host.active()) return;
      const r = roomMessageGains(state, now());
      if (r.state !== state) apply(r.state, r.gains, 'salon'); // i18n-ignore : journal
    },
    socialChanged() {
      if (frozen || !host.active() || !state.started) return;
      const at = now();
      const a = friendsGains(state, host.net.state().friends.map((x) => x.key), at);
      const b = receivedGains(a.state, host.net.receivedIds(), at);
      const c = invitedGains(b.state, invitees(), at);
      if (c.state !== state) apply(c.state, [...a.gains, ...b.gains, ...c.gains], 'vie sociale'); // i18n-ignore : journal
      // Une contribution comptée (avis, proposition « fait ») : seulement des badges, sans XP à elle.
      else if (evaluateBadges(host.net.state().badges, facts()).length) apply(state, [], 'badges'); // i18n-ignore : journal
    },
    noteRankings,
    played: () => Boolean(state.firstPlay),
    pending: () => state.pending,
    seen() {
      if (!state.pending) return;
      const { pending: _done, ...rest } = state;
      state = rest;
      save();
      host.changed();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
