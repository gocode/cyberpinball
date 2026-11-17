// « Mon niveau » et « Mes badges » (décidés le 17/11/2026, maquette « Niveaux et badges ») :
// - Mon niveau : le palier et le niveau, la barre, les XP de la semaine, les derniers gains, les
//   classements de la semaine en cours (XP prévus, versés le mardi), les badges les plus proches ;
//   puis Mes badges, Comment gagner des XP, Mon profil public ;
// - Mes badges : par famille, chacun avec sa rareté ; reçu (et sa date), ou sa progression ; un
//   badge secret pas encore reçu ne montre que son indice ;
// - Comment gagner des XP : le barème, dit au joueur.
//
// Sans electron à l'exécution : les tests chargent ce module.

import {
  avatarView,
  BADGE_FAMILIES,
  BADGES,
  badgeEarned,
  badgeLabel,
  familyLabel,
  gainText,
  levelOf,
  nearestBadges,
  placeText,
  RANKING_XP,
  RARITY_XP,
  rarityLabel,
  standingXp,
  t,
  tierLabel,
  tn,
  weekPreview,
  weekXp,
  XP,
  DAILY_PLAY_CAP,
  DAILY_SOCIAL_CAP,
  type IconName,
  type XpGain,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { LevelTracker } from './level-tracker';
import type { SocialNet } from './social-net';

export interface LevelMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  net: SocialNet;
  levels: LevelTracker;
  /** Mon profil public (profile-menu.ts), « Retour » vers `back`. */
  openProfile(back: () => void): void;
  now?(): Date;
}

export interface LevelMenu {
  /** « Mon niveau », son « Retour » vers `back`. */
  open(back: () => void): void;
  /** « Mes badges », son « Retour » vers `back`. */
  openBadges(back: () => void): void;
  /** Menu système > Amis > Mes badges. */
  badgesItem: ProvidedSystemItem;
  /** Ce que dit l'entrée « Mon niveau » (accueil Communauté) : palier, niveau, XP restants. */
  detail(): string;
}

const GAIN_ICON: Record<XpGain['kind'], IconName> = {
  play: 'play',
  game: 'flipper',
  'first-of-day': 'sun',
  'new-table': 'table-add',
  'personal-best': 'upgrade',
  honor: 'list',
  champion: 'star',
  live: 'friends',
  'live-win': 'trophy',
  ranking: 'trophy',
  badge: 'medal',
  start: 'history',
  'room-day': 'message',
  friend: 'friend-add',
  like: 'star',
  reaction: 'sparkle',
  invited: 'friend-add',
  'invitee-tier': 'upgrade',
};

export function createLevelMenu(host: LevelMenuHost): LevelMenu {
  const now = () => host.now?.() ?? new Date();
  const lib = host.library;
  const me = () => host.net.state().key.publicKey;
  const fmt = (n: number) => n.toLocaleString();

  function detail(): string {
    const v = levelOf(host.levels.state().xp);
    return t('{tier} · niveau {level} · encore {n} XP', { tier: tierLabel(v.tier), level: v.level, n: fmt(v.need - v.into) });
  }

  // ---------- Mon niveau ----------

  function open(back: () => void, at?: number): void {
    lib.openCustom(() => build(back), at);
  }

  function build(back: () => void): Built {
    const state = host.levels.state();
    const v = levelOf(state.xp);
    const s = host.net.state();
    const facts = host.levels.facts();
    const here = () => open(back);
    const sections: Section[] = [
      {
        rows: [
          {
            icon: 'gauge',
            text: t('{into} / {need} XP', { into: fmt(v.into), need: fmt(v.need) }),
            detail: t('Encore {n} XP pour le niveau {next}', { n: fmt(v.need - v.into), next: v.level + 1 }),
            progress: { value: v.progress, tone: 'ok' },
          },
          { icon: 'calendar', text: t('Cette semaine'), aside: `+${fmt(weekXp(state, now()))} XP` },
          { icon: 'medal', text: t('Badges'), aside: t('{n} sur {total}', { n: s.badges.length, total: BADGES.length }) },
          { icon: 'tables', text: t('Tables jouées'), aside: fmt(facts.tables) },
        ],
      },
    ];
    const gains = state.gains.slice(0, 4);
    sections.push({
      title: t('Derniers gains'),
      rows: gains.length
        ? gains.map((g) => {
            const said = gainText(g, badgeLabel);
            return { icon: GAIN_ICON[g.kind], text: said.text, ...(said.detail ? { detail: said.detail } : {}), aside: `+${fmt(g.xp)}`, tone: 'ok' as const };
          })
        : [{ text: t('Rien pour l’instant : jouez une partie jusqu’au bout'), tone: 'quiet' }],
    });
    const week = weekPreview(state, now());
    sections.push({
      title: t('Classements de la semaine · versés mardi'),
      rows: week.length
        ? week.slice(0, 4).map((w) => {
            const best = standingXp(w.standing);
            const where = [w.standing.country ? placeText('country', w.standing.country.rank) : undefined, w.standing.world ? placeText('world', w.standing.world.rank) : undefined].filter(Boolean).join(' · ');
            return { icon: 'trophy' as const, text: w.title, ...(where ? { detail: where } : {}), aside: best.xp ? t('+{n} prévus', { n: best.xp }) : t('pas encore'), ...(best.xp ? {} : { tone: 'quiet' as const }) };
          })
        : [{ text: t('Aucun score publié cette semaine'), detail: t('Un score aux classements de la semaine rapporte des XP le mardi suivant'), tone: 'quiet' }],
    });
    const near = nearestBadges(s.badges, facts);
    if (near.length)
      sections.push({
        title: t('Badges les plus proches'),
        rows: near.map((n) => ({ icon: n.badge.icon, text: n.badge.label, detail: n.badge.detail, aside: `${fmt(n.value)} / ${fmt(n.badge.target)}`, progress: { value: n.progress, tone: 'info' as const }, badges: [rarityLabel(n.badge.rarity)] })),
      });
    const actions: Action[] = [
      { label: t('Mes badges'), icon: 'medal', detail: t('{n} sur {total}', { n: s.badges.length, total: BADGES.length }), run: () => openBadges(here) },
      { label: t('Comment gagner des XP'), icon: 'info', detail: t('Le barème : parties, progrès, classements, badges, vie sociale'), run: () => openRules(here) },
      { label: t('Mon profil public'), icon: 'eye', detail: t('Ce que voient les autres joueurs'), run: () => host.openProfile(here) },
      { label: t('Retour'), icon: 'back', run: back },
    ];
    return {
      heading: t('Mon niveau'),
      icon: 'gauge',
      avatar: { ...avatarView(me(), s.name, host.net.avatarFile(me())), level: v.level },
      subheading: t('{tier} · niveau {level}', { tier: tierLabel(v.tier), level: v.level }),
      sections,
      actions,
      back,
    };
  }

  // ---------- Mes badges ----------

  function openBadges(back: () => void): void {
    lib.openCustom(() => buildBadges(back));
  }

  function buildBadges(back: () => void): Built {
    const s = host.net.state();
    const held = new Map(s.badges.map((b) => [b.id, b]));
    const facts = host.levels.facts();
    const sections: Section[] = BADGE_FAMILIES.map((family) => ({
      title: familyLabel(family),
      rows: BADGES.filter((b) => b.family === family).map((b): Row => {
        const got = held.get(b.id);
        const rarity = rarityLabel(b.rarity);
        if (got) return { icon: b.icon, text: b.label, detail: t('{detail} · reçu le {date}', { detail: b.detail, date: new Date(got.at).toLocaleDateString() }), badges: [rarity], aside: `+${RARITY_XP[b.rarity]} XP`, tone: 'ok' };
        if (b.secret && !badgeEarned(b, facts)) return { icon: 'lock', text: t('Badge secret'), detail: b.hint ?? '', badges: [rarity], tone: 'quiet' };
        const value = Math.min(b.target, Math.floor(b.measure(facts)));
        return { icon: b.icon, text: b.label, detail: b.detail, badges: [rarity], aside: `${value.toLocaleString()} / ${b.target.toLocaleString()}`, ...(value > 0 ? { progress: { value: value / b.target, tone: 'info' as const } } : { tone: 'quiet' as const }) };
      }),
    }));
    return {
      heading: t('Mes badges'),
      icon: 'medal',
      subheading: t('{n} sur {total}', { n: s.badges.length, total: BADGES.length }),
      lead: t('Gagnés sur cette borne à partir des parties, des records, des classements et de la vie entre joueurs. Visibles sur votre profil public.'),
      sections,
      actions: [{ label: t('Retour'), icon: 'back', run: back }],
      back,
    };
  }

  // ---------- Comment gagner des XP ----------

  function openRules(back: () => void): void {
    lib.openCustom(() => {
      const row = (icon: IconName, text: string, xp: string, detail?: string): Row => ({ icon, text, aside: xp, ...(detail ? { detail } : {}) });
      const places = (scope: 'world' | 'country' | 'friends') => RANKING_XP[scope].map(([upTo, xp]) => `${upTo === 1 ? t('1er') : t('top {n}', { n: upTo })} : ${xp}`).join(' · ');
      return {
        heading: t('Comment gagner des XP'),
        icon: 'info',
        lead: t('Le niveau monte avec les XP et ne baisse jamais. Rien ne compte en mode invité.'),
        sections: [
          {
            title: t('Jouer · {n} XP par jour au plus', { n: DAILY_PLAY_CAP }),
            rows: [
              row('play', t('Minute de vraie partie'), `${XP.minute}`, t('Une table laissée ouverte sans jouer ne compte pas')),
              row('flipper', t('Partie menée au bout'), `${XP.game}`),
              row('sun', t('Première partie du jour'), `${XP.firstOfDay}`),
              row('table-add', t('Nouvelle table'), `${XP.newTable}`),
              row('upgrade', t('Record personnel battu'), `${XP.personalBest}`, t('Une fois par table et par jour')),
              row('list', t('Au tableau d’honneur'), `${XP.honor}`),
              row('star', t('Meilleur score de la table'), `${XP.champion}`),
              row('friends', t('Partie en ligne menée au bout'), `${XP.live}`, t('+{n} en cas de victoire', { n: XP.liveWin })),
            ],
          },
          {
            title: t('Classements de la semaine · versés le mardi'),
            rows: [
              row('globe', t('Monde'), places('world'), t('Dix joueurs classés au moins')),
              row('language', t('Votre pays'), places('country'), t('Cinq joueurs classés au moins')),
              row('friend-list', t('Entre amis'), places('friends'), t('Trois joueurs classés au moins')),
            ],
          },
          {
            title: t('Vie sociale · {n} XP par jour au plus', { n: DAILY_SOCIAL_CAP }),
            rows: [
              row('message', t('Premier message du jour au salon'), `${XP.roomDay}`),
              row('friend-add', t('Nouvel ami'), `${XP.friend}`),
              row('star', t('« J’aime » reçu'), `${XP.like}`),
              row('sparkle', t('Réaction reçue'), `${XP.reaction}`),
            ],
          },
          {
            title: t('Badges'),
            rows: (['common', 'rare', 'epic', 'legendary'] as const).map((r) => row('medal', rarityLabel(r), `${RARITY_XP[r]}`, tn(BADGES.filter((b) => b.rarity === r).length, '{n} badge', '{n} badges'))),
          },
        ],
        actions: [{ label: t('Retour'), icon: 'back', run: back }],
        back,
      };
    });
  }

  return {
    open: (back) => open(back),
    openBadges,
    detail,
    badgesItem: {
      get detail() {
        return t('{n} sur {total}', { n: host.net.state().badges.length, total: BADGES.length });
      },
      run: () => openBadges(() => lib.openSystem()),
    },
  };
}
