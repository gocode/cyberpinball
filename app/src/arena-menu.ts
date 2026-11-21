// Arène (décidée le 21/11/2026, planche « Engagement » validée : « Super, c'est parti ! ») : le
// médaillon de la roue qui rassemble ce qui se joue contre les autres, entre la Communauté et les
// Collections. Deux surfaces :
// - l'affiche au focus (app/renderer/arena.js) : le médaillon, le titre, la jauge du niveau, un
//   tableau des records à points (police du DMD) dont les pages tournent toutes les six secondes, la
//   plus pressante d'abord, puis qui joue en ce moment et quelques puces ;
// - l'écran ouvert par Start (hub-screen.ts) : la bande « Votre niveau », des onglets (Accueil,
//   Parties, Défis, Du jour, Ligue, Classements, Progression) et des cartes choisies aux flippers.
//
// Seulement des données réelles (arena.ts) : ligues, défis, missions, rendez-vous et série n'existent
// pas encore ; leurs sections sont absentes et leurs onglets grisés, avec leur raison.
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  arenaBoardPages,
  arenaLevelBand,
  arenaMoment,
  arenaRecords,
  arenaRivals,
  arenaXpRules,
  avatarView,
  countryName,
  flagView,
  type FlagView,
  dayKey,
  formatNumber,
  badgeLabel,
  levelBandLines,
  locale,
  nearestBadges,
  shownCrowd,
  shownLevel,
  socialAgo,
  t,
  tierOf,
  tn,
  weekXp,
  XP,
  type ArenaBoardPage,
  type ArenaLevelBand,
  type ArenaOpenGame,
  type ArenaRival,
  type AvatarView,
  type IconName,
  type InstantGame,
  type OnlinePlayer,
  type PresenceTable,
  type TierId,
} from '@cyberpinball/core';
import type { Built } from './library';
import type { LevelTracker } from './level-tracker';
import type { PlayerStanding } from './rankings-menu';
import type { SocialNet } from './social-net';
import { createHubScreen, type HubBand, type HubCardSpec, type HubLevel, type HubSectionSpec, type HubSpec, type HubTabSpec } from './hub-screen';

export interface ArenaMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  net: Pick<SocialNet, 'state' | 'rankings' | 'avatarFile' | 'publicCard' | 'cardFirstSeen'>;
  levels: Pick<LevelTracker, 'state' | 'facts'>;
  /** Les parties instantanées (instant-menu.ts). */
  instant: {
    door(): { detail: string; quiet: boolean };
    arena(back: () => void): { mine?: { title: string; seated: number; max: number; open(): void }; open: { game: InstantGame; joinable: boolean; reason?: string; join(): void }[] };
    open(back: () => void): void;
    openNew(back: () => void): void;
  };
  /** Les classements (rankings-menu.ts) : ma place chez les joueurs, et l'écran de toutes les tables. */
  rankings: { standing(): PlayerStanding | undefined; open(back: () => void): void };
  /** Les tables du jour (daily-tables-menu.ts) : ce que dit leur porte, et les ouvrir ; absentes, l'onglet « Du jour » reste grisé. */
  daily?: { detail(): string; open(back: () => void): void };
  /** Mon niveau, Mes badges, le barème (level-menu.ts) ; l'historique des parties. */
  level: { open(back: () => void): void; openBadges(back: () => void): void; openRules(back: () => void): void };
  history: { open(back: () => void): void };
  /** Les joueurs en ligne, amis compris (community-menu.ts) : qui joue en ce moment. */
  players(): readonly OnlinePlayer[];
  /** La roue sur cette table (le rival d'une table, un record), si elle est dans la collection montrée. */
  table?: { has(table: PresenceTable): boolean; go(table: PresenceTable): void };
  zoneKeys(): readonly string[];
  now?(): Date;
}

/**
 * L'affiche du médaillon (app/renderer/arena.js), textes déjà traduits. Dessin retenu par le mainteneur
 * le 21/11/2026 (« Le B, c'est parfait ») : le podium de la table qui pique, puis trois cases (niveau,
 * Monde, pays), puis qui joue en ce moment. Le tableau à points est sur le vrai DMD (boardPages).
 */
export interface ArenaPosterView {
  title: string;
  tagline: string;
  /** « Niv. 12 · Flippeur », la barre (et en hachures ce qu'une partie peut rapporter), « 380 XP avant le niveau 13 ». */
  level: { chip: string; tier: TierId; progress: number; reach: number; after: string };
  /** Le podium autour de moi sur la table du rival le plus pressant ; absent : personne devant moi. */
  podium?: { table: string; eyebrow: string; warn: boolean; rows: PodiumRow[]; climb: { label: string; gap: string } };
  /** Les cases : le niveau (sa barre), puis ma place au monde et dans mon pays, quand elles existent. */
  tiles: { label: string; value: string; detail: string; flag?: FlagView; level?: { tier: TierId; progress: number; reach: number } }[];
  /** Qui joue en ce moment. */
  live?: { avatars: AvatarView[]; text: string };
  /** Les parties ouvertes sur mes tables, en puce ; vide : rien. */
  chips: { icon: IconName; text: string; hot?: boolean }[];
  /** Au fronton, en une phrase : la page la plus pressante (son intitulé, sa phrase), sinon qui joue. */
  headline: { eyebrow: string; heading: string };
  start: string;
  open: string;
}

/** Une ligne du podium : la place, le joueur et son niveau, le score ; le rival en ambre, moi en vert. */
export interface PodiumRow {
  rank: string;
  name: string;
  avatar: AvatarView;
  level?: HubLevel;
  score: string;
  me?: true;
  rival?: true;
}

export interface ArenaMenu {
  /** L'écran de l'Arène (Start sur le médaillon), sur l'Accueil ; Exit vers `back` (la roue). */
  openHome(back: () => void): void;
  poster(): ArenaPosterView;
  /** Les pages du tableau des records, la plus pressante d'abord : sur le DMD quand le médaillon est choisi. */
  boardPages(): ArenaBoardPage[];
  /** Ce que dit le médaillon sous son titre dans la roue. */
  card(): { title: string; subtitle: string };
}

/** Joueurs montrés au plus sur l'affiche (« qui joue en ce moment »). */
const POSTER_PLAYERS = 5;
/** Les calculs sur les classements publiés se refont au plus toutes les deux secondes (l'affiche se redessine à chaque état). */
const KEEP_MS = 2000;

export function createArenaMenu(host: ArenaMenuHost): ArenaMenu {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const me = () => net.state().key.publicKey;
  // L'espace fine insécable des milliers (U+202F, Intl en français) n'a presque pas de largeur dans
  // Saira : « 9450000 » se lisait d'un bloc (captures du 21/11/2026). L'espace insécable ordinaire à sa place.
  const thin = String.fromCharCode(0x202f);
  const nbsp = String.fromCharCode(0xa0);
  const fmt = (n: number) => formatNumber(n).split(thin).join(nbsp);
  const xpText = (n: number) => t('+{n} XP', { n: fmt(n) });

  // ---------- Données ----------

  let kept: { at: number; rivals: ArenaRival[]; records: ReturnType<typeof arenaRecords> } | undefined;
  function published() {
    const at = now().getTime();
    if (kept && at - kept.at >= 0 && at - kept.at < KEEP_MS) return kept;
    const store = net.rankings();
    kept = { at, rivals: arenaRivals(store, me(), 6), records: arenaRecords(store, me(), 5) };
    return kept;
  }

  /**
   * Ce que mesurent les badges (level-tracker.ts) parcourt les tables et l'historique : gardé deux
   * secondes, comme les classements (l'affiche et le titre du médaillon se redessinent à chaque état).
   */
  let factsKept: { at: number; facts: ReturnType<ArenaMenuHost['levels']['facts']> } | undefined;
  function facts() {
    const at = now().getTime();
    if (!factsKept || at - factsKept.at < 0 || at - factsKept.at >= KEEP_MS) factsKept = { at, facts: host.levels.facts() };
    return factsKept.facts;
  }

  function band(): ArenaLevelBand {
    return arenaLevelBand(host.levels.state(), net.state().badges, facts(), now());
  }

  /** Le niveau d'un joueur : le mien, ou celui que dit sa carte publique (vraisemblable seulement). */
  function levelOfPlayer(key: string, xp?: number): number | undefined {
    if (key === me()) return band().level;
    return shownLevel(net.publicCard(key)?.xp ?? xp, net.cardFirstSeen(key), now());
  }
  const levelChip = (level: number | undefined): HubLevel | undefined => (level ? { text: t('Niv. {n}', { n: level }), tier: tierOf(level) } : undefined);
  function face(key: string, name: string, xp?: number): AvatarView {
    const level = levelOfPlayer(key, xp);
    return { ...avatarView(key, name, net.avatarFile(key)), ...(level ? { level } : {}) };
  }

  const ago = (iso: string) => socialAgo(iso, now());
  /** En tête de phrase : « Il y a 20 min ». */
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
  /** De quoi mettre la roue sur cette table ; undefined : elle n'est pas dans la collection montrée. */
  const reachable = (table: PresenceTable): (() => void) | undefined => (host.table?.has(table) ? () => host.table!.go(table) : undefined);
  const playedToday = () => Boolean(host.levels.state().days[dayKey(now())]?.games);
  const toOpenGame = (g: InstantGame, joinable: boolean): ArenaOpenGame => ({ id: g.id, title: g.title, host: { key: g.key, name: g.name }, seats: g.seats.map((s) => ({ key: s.key, name: s.name })), max: g.max, joinable });

  /** Qui joue en ce moment : leurs pastilles, et le nombre au-delà de cinq (shownCrowd), sinon leurs noms. */
  function playing(): { avatars: AvatarView[]; text: string } | undefined {
    const list = host.players().filter((p) => p.status === 'playing');
    if (!list.length) return undefined;
    const avatars = list.slice(0, POSTER_PLAYERS).map((p) => face(p.key, p.name));
    const crowd = shownCrowd(list.length);
    const text = crowd
      ? tn(crowd, '{n} joueur en partie en ce moment', '{n} joueurs en partie en ce moment')
      : tn(list.length, '{names} en partie en ce moment', '{names} en partie en ce moment', { names: list.map((p) => p.name).join(', ') });
    return { avatars, text };
  }

  function standing(): { world?: { rank: number; players: number }; country?: { rank: number; players: number; name: string } } | undefined {
    const st = host.rankings.standing();
    if (!st) return undefined;
    const out: { world?: { rank: number; players: number }; country?: { rank: number; players: number; name: string } } = {};
    if (st.world.rank) out.world = { rank: st.world.rank, players: st.world.players };
    if (st.country?.rank) out.country = { rank: st.country.rank, players: st.country.players, name: countryName(st.country.code, locale()) };
    return out.world || out.country ? out : undefined;
  }

  // ---------- L'affiche ----------

  /** Les pages du tableau des records : ce qui existe vraiment, la plus pressante d'abord (arena.ts). */
  function boardPages(): ArenaBoardPage[] {
    const games = host.instant.arena(() => undefined);
    const { rivals, records } = published();
    return arenaBoardPages({
      open: games.open.map((o) => toOpenGame(o.game, o.joinable)),
      ...(games.mine ? { mine: { title: games.mine.title, seated: games.mine.seated, max: games.mine.max } } : {}),
      rivals,
      records,
      ...(standing() ? { standing: standing()! } : {}),
      ago,
      now: now(),
    });
  }

  function poster(): ArenaPosterView {
    const b = band();
    const games = host.instant.arena(() => undefined);
    const pages = boardPages();
    const chips: ArenaPosterView['chips'] = [];
    const joinable = games.open.filter((o) => o.joinable).length;
    if (joinable) chips.push({ icon: 'rocket', text: tn(joinable, '{n} partie ouverte', '{n} parties ouvertes'), hot: true });
    const live = playing();
    // Le podium : la table du rival le plus pressant, ceux qui m'entourent au classement.
    const rival = published().rivals[0];
    const podium: ArenaPosterView['podium'] = rival
      ? {
          table: rival.table.title,
          eyebrow: rival.passed ? t('Votre place est prise') : t('À battre'),
          warn: rival.passed,
          rows: rival.ladder.map((r) => {
            const level = levelChip(levelOfPlayer(r.key, r.xp));
            return { rank: String(r.rank), name: r.me ? t('Vous') : r.name, avatar: face(r.key, r.name, r.xp), ...(level ? { level } : {}), score: fmt(r.score), ...(r.me ? { me: true as const } : {}), ...(r.rival ? { rival: true as const } : {}) };
          }),
          climb: { label: t('Pour la {n}ᵉ place', { n: rival.mine.rank - 1 }), gap: t('+{n}', { n: fmt(rival.gap) }) },
        }
      : undefined;
    // Les cases : mon niveau, puis mes places quand elles existent.
    const st = standing();
    const tiles: ArenaPosterView['tiles'] = [{ label: t('Niveau'), value: String(b.level), detail: t('{n} XP avant le niveau {next}', { n: fmt(b.missing), next: b.level + 1 }), level: { tier: b.tier, progress: b.progress, reach: b.reachShare } }];
    if (st?.world) tiles.push({ label: t('Monde'), value: t('{n}ᵉ', { n: fmt(st.world.rank) }), detail: tn(st.world.players, 'sur {n} joueur', 'sur {n} joueurs', { n: fmt(st.world.players) }) });
    const code = host.rankings.standing()?.country?.code;
    if (st?.country && code) tiles.push({ label: st.country.name, value: t('{n}ᵉ', { n: fmt(st.country.rank) }), detail: tn(st.country.players, 'sur {n} joueur', 'sur {n} joueurs', { n: fmt(st.country.players) }), flag: flagView(code, locale()) });
    const first = pages[0];
    const headline = first
      ? { eyebrow: first.lines.slice(0, 2).map((l) => l.cells.map((c) => c.text).join(' ')).join(' · '), heading: first.foot }
      : { eyebrow: t('Parties instantanées, classements, progression'), heading: live?.text ?? t('Start pour ouvrir l’Arène') };
    return {
      headline,
      title: t('ARÈNE'),
      tagline: t('Battre les autres, battre son record'),
      level: { chip: t('Niv. {n} · {tier}', { n: b.level, tier: b.tierLabel }), tier: b.tier, progress: b.progress, reach: b.reachShare, after: t('{n} XP avant le niveau {next}', { n: fmt(b.missing), next: b.level + 1 }) },
      ...(podium ? { podium } : {}),
      tiles,
      ...(live ? { live } : {}),
      chips,
      start: t('Start'),
      open: t('Ouvrir l’Arène'),
    };
  }

  function card(): { title: string; subtitle: string } {
    const b = band();
    const open = host.instant.arena(() => undefined).open.filter((o) => o.joinable).length;
    const parts = [t('Niveau {n}', { n: b.level }), ...(open ? [tn(open, '{n} partie ouverte', '{n} parties ouvertes')] : [])];
    return { title: t('Arène'), subtitle: parts.join(' · ') };
  }

  // ---------- L'écran ----------

  const TABS = (): HubTabSpec[] => {
    const games = host.instant.arena(() => undefined);
    return [
      { id: 'home', label: t('Accueil'), icon: 'star' },
      // Les six onglets et les icônes de la planche validée. Les classements (place, rivaux, records) sont
      // dans Progression : un septième onglet ne tenait plus en borne (« Classeme… », 21/11/2026).
      { id: 'games', label: t('Parties'), icon: 'gamepad', ...(games.mine || games.open.some((o) => o.joinable) ? { attention: true } : {}) },
      { id: 'challenges', label: t('Défis'), icon: 'trophy', disabled: t('Bientôt') },
      { id: 'daily', label: t('Du jour'), icon: 'sparkle', ...(host.daily ? {} : { disabled: t('Bientôt') }) },
      { id: 'league', label: t('Ligue'), icon: 'list', disabled: t('Bientôt') },
      { id: 'progress', label: t('Progression'), icon: 'medal' },
    ];
  };

  function hubBand(b: ArenaLevelBand): HubBand {
    return {
      level: b.level,
      short: t('NIV.'),
      tier: b.tier,
      tierLabel: b.tierLabel,
      missing: { strong: t('{n} XP', { n: fmt(b.missing) }), rest: t('avant le niveau {n}', { n: b.level + 1 }) },
      progress: b.progress,
      reach: b.reachShare,
      lines: levelBandLines(b),
    };
  }

  /** Une partie ouverte en carte : la table, les places, qui attend, ce qu'elle rapporte ; Start la rejoint. */
  function gameCard(o: { game: InstantGame; joinable: boolean; reason?: string; join(): void }): HubCardSpec {
    const g = o.game;
    const seats: (AvatarView | null)[] = [...g.seats.map((s) => face(s.key, s.name)), ...Array.from({ length: Math.max(0, g.max - g.seats.length) }, () => null)];
    return {
      key: `game:${g.id}`,
      eyebrow: t('Partie ouverte'),
      tone: 'meta',
      title: g.title,
      seats,
      detail: o.reason ?? t('{name} attend · menée au bout {xp}, victoire {win}', { name: g.name, xp: xpText(XP.live), win: xpText(XP.liveWin) }),
      ...(o.joinable ? { run: o.join } : { quiet: true }),
    };
  }

  /** La carte du moment (arena.ts, arenaMoment) : en grand, ses boutons. */
  function momentCard(back: () => void, here: () => void): HubCardSpec | undefined {
    const games = host.instant.arena(here);
    const { rivals } = published();
    const b = band();
    const open = games.open.map((o) => toOpenGame(o.game, o.joinable));
    const m = arenaMoment({ ...(games.mine ? { mine: { title: games.mine.title, seated: games.mine.seated, max: games.mine.max } } : {}), open, rivals, band: b, playedToday: playedToday(), now: now() });
    if (!m) return undefined;
    const pick = { label: t('Choisir une table'), key: 'wheel', run: back };
    switch (m.kind) {
      case 'my-game':
        return { key: 'moment:my-game', eyebrow: t('Votre partie attend'), tone: 'signal', icon: 'rocket', title: m.game.title, detail: t('{n} sur {max} joueurs · départ dès qu’elle est complète', { n: m.game.seated, max: m.game.max }), buttons: [{ label: t('Voir la partie'), primary: true, key: 'open', run: games.mine!.open }] };
      case 'open-game': {
        const o = games.open.find((x) => x.game.id === m.game.id)!;
        return {
          key: `moment:game:${m.game.id}`,
          eyebrow: t('Partie ouverte sur vos tables'),
          tone: 'signal',
          avatar: face(m.game.host.key, m.game.host.name),
          name: m.game.host.name,
          title: t('vous attend sur {table}', { table: m.game.title }),
          ...(levelChip(levelOfPlayer(m.game.host.key)) ? { level: levelChip(levelOfPlayer(m.game.host.key))! } : {}),
          detail: t('{n} sur {max} joueurs · départ dès qu’elle est complète', { n: m.game.seats.length, max: m.game.max }),
          buttons: [
            { label: t('Rejoindre'), xp: xpText(XP.live), primary: true, key: 'join', run: o.join },
            { label: t('Toutes les parties'), key: 'all', run: () => host.instant.open(here) },
          ],
        };
      }
      case 'rival': {
        const r = m.rival;
        const go = reachable(r.table);
        return {
          key: `moment:rival:${r.board}`,
          eyebrow: r.passed ? t('Votre place est prise') : t('À battre'),
          tone: r.passed ? 'warning' : 'meta',
          avatar: face(r.rival.key, r.rival.name, r.rival.xp),
          name: r.rival.name,
          title: r.passed ? t('vous a dépassé sur {table}', { table: r.table.title }) : t('est juste devant vous sur {table}', { table: r.table.title }),
          ...(levelChip(levelOfPlayer(r.rival.key, r.rival.xp)) ? { level: levelChip(levelOfPlayer(r.rival.key, r.rival.xp))! } : {}),
          detail: t('{ago} · {their} contre vos {mine} · vous êtes {rank}ᵉ sur {n}', { ago: cap(ago(r.rival.at)), their: fmt(r.rival.score), mine: fmt(r.mine.score), rank: r.mine.rank, n: r.players }),
          buttons: [
            ...(go ? [{ label: t('Aller à la table'), xp: xpText(XP.personalBest), primary: true, key: 'table', run: go }] : []),
            { label: t('Classements'), key: 'rankings', run: () => host.rankings.open(here) },
          ],
        };
      }
      case 'level':
        return { key: 'moment:level', eyebrow: t('Niveau {n} à portée', { n: m.band.level + 1 }), tone: 'signal', icon: 'gauge', title: t('Encore {n} XP : une partie peut suffire', { n: fmt(m.band.missing) }), detail: t('Une partie peut rapporter jusqu’à {n} XP aujourd’hui', { n: fmt(m.band.reach) }), buttons: [{ ...pick, primary: true }] };
      case 'first-of-day':
        return { key: 'moment:first', eyebrow: t('Première partie du jour'), tone: 'signal', icon: 'sun', title: t('Votre première partie du jour rapporte {xp}', { xp: xpText(m.xp) }), detail: t('Puis {xp} par partie menée au bout, et {pb} par record personnel battu', { xp: xpText(XP.game), pb: xpText(XP.personalBest) }), buttons: [{ ...pick, primary: true }] };
    }
  }

  function homeSections(back: () => void, here: () => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = [];
    const moment = momentCard(back, here);
    if (moment) out.push({ layout: 'hero', cards: [moment] });
    const games = host.instant.arena(here);
    const shownId = moment?.key.startsWith('moment:game:') ? moment.key.slice('moment:game:'.length) : undefined;
    const open = games.open.filter((o) => o.joinable && o.game.id !== shownId);
    if (open.length) out.push({ title: t('À jouer maintenant'), note: tn(open.length, '{n} partie ouverte sur vos tables', '{n} parties ouvertes sur vos tables'), layout: 'cards', cards: open.slice(0, 4).map(gameCard) });
    out.push({ title: t('Ce que rapportent les XP'), note: t('Le barème du niveau'), layout: 'chips', cards: arenaXpRules().map((r) => ({ key: `rule:${r.text}`, icon: r.icon, title: r.text, aside: xpText(r.xp) })) });
    return out;
  }

  function gamesSections(here: () => void): { sections: HubSectionSpec[]; empty?: { title: string; detail: string } } {
    const door = host.instant.door();
    if (door.quiet) return { sections: [{ layout: 'list', cards: [{ key: 'instant:off', icon: 'network', title: t('Parties instantanées'), detail: door.detail, quiet: true }] }] };
    const games = host.instant.arena(here);
    const sections: HubSectionSpec[] = [];
    if (games.mine) sections.push({ layout: 'hero', cards: [{ key: 'mine', eyebrow: t('Votre partie attend'), tone: 'signal', icon: 'rocket', title: games.mine.title, detail: t('{n} sur {max} joueurs · départ dès qu’elle est complète', { n: games.mine.seated, max: games.mine.max }), buttons: [{ label: t('Voir la partie'), primary: true, key: 'open', run: games.mine.open }] }] });
    if (games.open.length) sections.push({ title: t('Ouvertes sur vos tables'), note: tn(games.open.length, '{n} partie', '{n} parties'), layout: 'cards', cards: games.open.map(gameCard) });
    sections.push({
      title: t('Jouer contre les autres'),
      layout: 'list',
      cards: [
        ...(games.mine ? [] : [{ key: 'new', icon: 'plus' as const, title: t('Ouvrir une partie instantanée'), detail: t('La table et le nombre de joueurs : elle part dès qu’elle est complète'), aside: xpText(XP.live), run: () => host.instant.openNew(here) }]),
        { key: 'all', icon: 'list', title: t('Toutes les parties instantanées'), detail: door.detail, run: () => host.instant.open(here) },
      ],
    });
    return { sections };
  }

  function rankingsSections(here: () => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = [];
    const st = standing();
    if (st) {
      const cards: HubCardSpec[] = [];
      if (st.world) cards.push({ key: 'world', icon: 'globe', eyebrow: t('Monde'), tone: 'meta', title: t('{n}ᵉ', { n: fmt(st.world.rank) }), detail: tn(st.world.players, 'sur {n} joueur', 'sur {n} joueurs', { n: fmt(st.world.players) }), run: () => host.rankings.open(here) });
      if (st.country) cards.push({ key: 'country', icon: 'language', eyebrow: st.country.name, tone: 'meta', title: t('{n}ᵉ', { n: fmt(st.country.rank) }), detail: tn(st.country.players, 'sur {n} joueur', 'sur {n} joueurs', { n: fmt(st.country.players) }), run: () => host.rankings.open(here) });
      out.push({ title: t('Votre place'), note: t('Selon vos XP, de tout temps'), layout: 'cards', cards });
    }
    const { rivals } = published();
    if (rivals.length)
      out.push({
        title: t('À battre'),
        note: t('Le joueur juste devant vous, table par table'),
        layout: 'list',
        cards: rivals.map((r) => ({
          key: `rival:${r.board}`,
          avatar: face(r.rival.key, r.rival.name, r.rival.xp),
          name: r.rival.name,
          title: t('devant vous sur {table}', { table: r.table.title }),
          ...(levelChip(levelOfPlayer(r.rival.key, r.rival.xp)) ? { level: levelChip(levelOfPlayer(r.rival.key, r.rival.xp))! } : {}),
          detail: r.passed ? t('Vous a dépassé {ago} · vous êtes {rank}ᵉ sur {n}', { ago: ago(r.rival.at), rank: r.mine.rank, n: r.players }) : t('Vous êtes {rank}ᵉ sur {n}', { rank: r.mine.rank, n: r.players }),
          aside: t('−{n}', { n: fmt(r.gap) }),
          asideTone: 'warning' as const,
          ...(reachable(r.table) ? { run: reachable(r.table)! } : {}),
        })),
      });
    return out;
  }

  /** Progression : ma place et mes rivaux (les classements), les badges les plus proches, mes records, et les écrans complets. */
  function progressSections(here: () => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = rankingsSections(here);
    const near = nearestBadges(net.state().badges, facts(), 2);
    if (near.length)
      out.push({
        title: t('Badges les plus proches'),
        layout: 'cards',
        cards: near.map((n) => ({ key: `badge:${n.badge.id}`, icon: n.badge.icon, eyebrow: t('Badge'), tone: 'meta', title: n.badge.label, detail: n.badge.detail, aside: `${fmt(n.value)} / ${fmt(n.badge.target)}`, progress: n.progress, run: () => host.level.openBadges(here) })),
      });
    const { records } = published();
    if (records.length)
      out.push({
        title: t('Vos records'),
        note: t('Publiés aux classements'),
        layout: 'list',
        cards: records.slice(0, 4).map((r) => ({ key: `record:${r.table.title}:${r.at}`, icon: 'star', title: r.table.title, detail: t('{rank}ᵉ sur {n} · {ago}', { rank: r.rank, n: r.players, ago: ago(r.at) }), aside: fmt(r.score), ...(reachable(r.table) ? { run: reachable(r.table)! } : {}) })),
      });
    out.push({
      title: t('Tout voir'),
      layout: 'list',
      cards: [
        { key: 'level', icon: 'gauge', title: t('Mon niveau'), detail: t('Barre, gains de la semaine, classements à venir'), run: () => host.level.open(here) },
        { key: 'rankings', icon: 'list', title: t('Tous les classements'), detail: t('Chaque table, par portée et par période'), run: () => host.rankings.open(here) },
        { key: 'badges', icon: 'medal', title: t('Mes badges'), detail: t('{n} reçus', { n: net.state().badges.length }), run: () => host.level.openBadges(here) },
        { key: 'history', icon: 'clock', title: t('Historique des parties'), detail: t('Vos parties en ligne et leurs résultats'), run: () => host.history.open(here) },
        { key: 'rules', icon: 'info', title: t('Comment gagner des XP'), detail: t('Le barème : parties, progrès, classements, badges, vie sociale'), run: () => host.level.openRules(here) },
      ],
    });
    return out;
  }

  let home: () => void = () => undefined;
  const hub = createHubScreen({ library: host.library, zoneKeys: host.zoneKeys }, (tab, reopen): HubSpec => {
    const b = band();
    const live = playing();
    const week = weekXp(host.levels.state(), now());
    const facts = [...(live ? [live.text] : []), week > 0 ? t('Cette semaine : {xp}', { xp: xpText(week) }) : t('Parties instantanées, classements, progression')];
    const spec: HubSpec = { heading: t('Arène'), icon: 'trophy', medallion: 'arene', title: t('ARÈNE'), facts, band: hubBand(b), tabs: TABS(), sections: [] };
    const back = () => home();
    switch (tab) {
      case 'games': {
        const g = gamesSections(reopen);
        return { ...spec, sections: g.sections };
      }
      case 'progress':
        return { ...spec, sections: progressSections(reopen) };
      // Les tables du jour (daily-tables-menu.ts) : leur écran complet, d'une carte.
      case 'daily': {
        const daily = host.daily;
        if (!daily) return spec;
        return {
          ...spec,
          sections: [{ title: t('Les tables du jour'), layout: 'list', cards: [{ key: 'daily', icon: 'sparkle', title: t('Les plus jouées aujourd’hui'), detail: daily.detail(), run: () => daily.open(reopen) }] }],
        };
      }
      default:
        return { ...spec, sections: homeSections(back, reopen) };
    }
  });

  return {
    openHome(back) {
      home = back;
      hub.open(back, 'home');
    },
    poster,
    boardPages,
    card,
  };
}
