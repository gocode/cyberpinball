// Profil public et « J'aime » à l'écran (publicprofile.ts, social-net.ts) :
// - le profil public d'un joueur, ami ou non (depuis l'annuaire, sa fiche, une notification) :
//   pays, badges, records, activité récente ; Start sur un évènement l'aime, ou ne l'aime plus.
//   Ce qui est réservé aux amis est dit, grisé ; « Écrire un message » reste visible, grisé avec sa
//   raison, pour qui n'est pas un ami ;
// - « Mon profil public » (Menu système > Amis) : ce que voient les autres, et qui a aimé chaque
//   évènement (pour moi seul).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module.

import {
  avatarView,
  badgeDefinition,
  badgeLabel,
  BADGES,
  countryName,
  eventText,
  levelOf,
  locale,
  shownLevel,
  tierLabel,
  tierOf,
  socialAgo,
  t,
  tn,
  type IconName,
  type PublicCard,
  type PublicEvent,
} from '@cyberpinball/core';
import { onGesture } from './gesture-flash';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { SocialNet } from './social-net';

export interface ProfileMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  net: SocialNet;
  /** Demande d'ami, blocage (avec sa confirmation) et fil de la messagerie, d'après friends-menu.ts et chat-menu.ts. */
  request(key: string, name: string): void;
  block(key: string): void;
  openThread?(key: string, back: () => void): void;
  /**
   * Groupes publics d'un joueur (group-service.ts, publicGroupsOf) : jamais un groupe privé. `open` : le
   * groupe (j'en suis membre), sinon sa page de l'annuaire, avec « Rejoindre ».
   */
  groups?: {
    of(key: string): { id: string; name: string; members: number; week?: string; mine: boolean }[];
    open(id: string, mine: boolean, back: () => void): void;
  };
  now?(): Date;
}

export interface ProfileMenu {
  /** Le profil public d'un joueur, son « Retour » vers `back`. */
  openProfile(key: string, back: () => void): void;
  /** « Mon profil public » (Menu système > Amis). */
  item: ProvidedSystemItem;
  /** Clic sur la notification d'un « J'aime » : « Mon profil public ». */
  openMine(back?: () => void): void;
}

export function createProfileMenu(host: ProfileMenuHost): ProfileMenu {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const lib = host.library;
  let flash: Row | undefined;
  onGesture(() => (flash = undefined));
  const flashSections = (): Section[] => (flash ? [{ rows: [flash] }] : []);

  const me = () => net.state().key.publicKey;
  const isFriend = (key: string) => net.state().friends.some((f) => f.key === key);
  const nameOf = (key: string, card?: PublicCard) => card?.name ?? net.state().friends.find((f) => f.key === key)?.name ?? net.state().directory.find((d) => d.profile.key === key)?.profile.name ?? key.slice(0, 8);
  /** Pastille : l'avatar d'un ami, sinon celui de sa carte (public, contrôlé par son empreinte), sinon ses initiales. */
  /** Son niveau, s'il est vraisemblable depuis le jour où cette borne a vu sa carte ; « ? » sinon. */
  const levelOfCard = (key: string, card?: PublicCard) => (card?.xp === undefined ? undefined : shownLevel(card.xp, net.cardFirstSeen(key), now()) ?? ('?' as const));
  const levelLine = (level: number | '?' | undefined) => (level === undefined ? undefined : level === '?' ? t('Niveau ?') : t('{tier} · niveau {level}', { tier: tierLabel(tierOf(level)), level }));
  const avatarOf = (key: string, name: string, card?: PublicCard) => {
    const level = levelOfCard(key, card);
    return { ...avatarView(key, name, net.avatarFile(key) ?? (card?.avatar ? net.rankingAvatar(key, card.avatar) : undefined)), ...(typeof level === 'number' ? { level } : {}) };
  };

  const eventIcon = (e: PublicEvent): IconName => (e.kind === 'badge' ? 'medal' : 'trophy');

  /**
   * L'en-tête du profil, d'après la maquette « Niveaux et badges » : le niveau avec sa barre (son palier,
   * XP du niveau), puis ses badges en médailles (les plus rares d'abord). Une carte d'avant les niveaux
   * n'a pas de niveau : la ligne le dit, sa borne n'est pas encore à jour.
   */
  function levelSections(key: string, card: PublicCard, trusted: boolean): Section[] {
    const out: Section[] = [];
    if (card.xp === undefined) out.push({ rows: [{ icon: 'gauge', text: t('Niveau pas encore connu'), detail: t('Sa borne n’a pas encore la version qui donne le niveau'), tone: 'quiet' }] });
    else {
      const v = levelOf(card.xp);
      const level = trusted ? v.level : levelOfCard(key, card);
      if (level === '?') out.push({ rows: [{ icon: 'gauge', text: t('Niveau ?'), detail: t('Plus haut que ce que permet son ancienneté sur le réseau : pas montré'), tone: 'quiet' }] });
      else out.push({ rows: [{ icon: 'gauge', text: t('{tier} · niveau {level}', { tier: tierLabel(v.tier), level: v.level }), detail: t('{into} / {need} XP', { into: v.into.toLocaleString(), need: v.need.toLocaleString() }), progress: { value: v.progress, tone: 'ok' } }] });
    }
    const rank = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
    const medals = card.badges
      .map((id) => badgeDefinition(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => rank[a.rarity] - rank[b.rarity])
      .slice(0, 12)
      .map((b) => ({ icon: b.icon, rarity: b.rarity, label: b.label }));
    out.push({
      title: t('Badges'),
      rows: medals.length
        ? [{ text: t('{n} badges sur {total}', { n: card.badges.length, total: BADGES.length }), ...(card.badges.length > medals.length ? { detail: t('Les {n} plus rares', { n: medals.length }) } : {}), medals }]
        : [{ text: t('Aucun badge pour l’instant'), tone: 'quiet' }],
    });
    return out;
  }

  /** Ses groupes publics : une ligne par groupe, Start l'ouvre. Rien quand il n'en a aucun de connu. */
  function groupsSection(key: string, actions: Action[], here: (at: number) => void): Section[] {
    const list = host.groups?.of(key) ?? [];
    if (!list.length) return [];
    const rows: Row[] = list.map((g) => {
      const index = actions.push({ label: g.name, key: `group:${g.id}`, icon: 'group', run: () => host.groups!.open(g.id, g.mine, () => here(index)) }) - 1;
      const detail = [tn(g.members, '{n} membre', '{n} membres'), g.week ? t('table de la semaine : {table}', { table: g.week }) : undefined, g.mine ? t('vous en êtes') : undefined].filter(Boolean).join(' · ');
      return { text: g.name, detail, icon: 'group' as const, action: index, pick: true };
    });
    return [{ title: t('Groupes publics'), rows }];
  }

  // ---------- Profil public d'un joueur ----------

  function openProfile(key: string, back: () => void, at?: number): void {
    lib.openCustom(() => buildProfile(key, back), at);
  }

  function buildProfile(key: string, back: () => void): Built {
    const card = net.publicCard(key);
    const name = nameOf(key, card);
    const friend = isFriend(key);
    const here = (at: number) => openProfile(key, back, at);
    const actions: Action[] = [];
    const sections: Section[] = [...flashSections()];
    const seen = net.cardSeen(key);
    const facts: string[] = [];
    if (card?.country) facts.push(countryName(card.country, locale()));
    if (card?.friends !== undefined) facts.push(tn(card.friends, '{n} ami', '{n} amis'));
    if (card) facts.push(tn(card.records, '{n} record publié', '{n} records publiés'));
    if (net.activityHidden(key)) sections.push({ rows: [{ text: t('Activité masquée sur cette borne'), detail: t('Ses évènements et ses « J’aime » ne s’affichent plus ici'), tone: 'quiet', icon: 'eye' }] });
    else if (!card) sections.push({ rows: [{ text: t('Profil public pas encore reçu'), detail: t('Il arrive quand sa borne, ou une borne qui l’a vu, est reliée à la vôtre'), tone: 'info', icon: 'clock' }] });
    else {
      sections.push(...levelSections(key, card, false));
      sections.push({ rows: [{ text: facts.join(' · '), detail: seen ? t('Profil actualisé {ago}', { ago: socialAgo(seen, now()) }) : undefined, icon: 'friends' }] });
      sections.push(...groupsSection(key, actions, here));
      const rows: Row[] = card.events.map((e) => {
        const liked = net.likedByMe(key, e.id);
        const index = actions.push({ label: eventText(e, badgeLabel), key: `like:${e.id}`, icon: liked ? 'star-filled' : 'star', run: () => { net.like(key, e.id, !liked); here(index); } }) - 1;
        return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), aside: `★ ${card.likes[e.id] ?? 0}`, ...(liked ? { badges: [t('Vous aimez')] } : {}), action: index, pick: true };
      });
      sections.push({ title: t('Activité récente · {n} derniers jours', { n: 30 }), rows: rows.length ? rows : [{ text: t('Ni record ni badge ces derniers jours'), tone: 'quiet' }] });
    }
    if (!friend) sections.push({ rows: [{ text: t('Table en cours, parties jouées, bibliothèque : réservées à ses amis'), tone: 'quiet', icon: 'lock' }] });
    // Actions : devenir ami, écrire (grisé pour un non-ami, avec sa raison), masquer, bloquer.
    const relation = net.state().outgoing.some((r) => r.key === key) ? 'outgoing' : net.state().incoming.some((r) => r.key === key) ? 'incoming' : friend ? 'friend' : 'none';
    if (relation === 'none') actions.push({ label: t('Envoyer une demande d’ami'), detail: t('Il la verra dans « Demandes d’amis » et pourra l’accepter'), icon: 'friend-add', tone: 'ok', run: () => { host.request(key, name); flash = { text: t('Demande envoyée à {name}', { name }), tone: 'ok' }; here(Number.MAX_SAFE_INTEGER); } });
    if (relation === 'outgoing') actions.push({ label: t('Demande envoyée'), detail: t('En attente de sa réponse'), icon: 'friend-request', tone: 'quiet', run: () => undefined });
    actions.push(
      friend && host.openThread
        ? { label: t('Écrire un message'), icon: 'message', run: () => host.openThread!(key, () => openProfile(key, back)) }
        : { label: t('Écrire un message'), icon: 'message', tone: 'quiet', detail: t('Indisponible : entre amis seulement, envoyez d’abord une demande d’ami'), run: () => undefined },
      net.activityHidden(key)
        ? { label: t('Afficher son activité'), icon: 'eye', run: () => { net.hideActivity(key, false); here(Number.MAX_SAFE_INTEGER); } }
        : { label: t('Masquer son activité'), icon: 'eye', detail: t('Ses évènements et ses « J’aime » ne s’affichent plus sur cette borne'), run: () => { net.hideActivity(key, true); here(Number.MAX_SAFE_INTEGER); } },
      { label: t('Bloquer {name}', { name }), icon: 'lock', detail: t('Plus de demande, plus de connexion avec sa borne'), run: () => confirm(t('Bloquer {name} ?', { name }), t('Plus de demande, plus de connexion avec sa borne. « Partage et réseau » le débloque.'), t('Bloquer'), () => { host.block(key); flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name }), tone: 'ok' }; back(); }, () => openProfile(key, back)) },
      { label: t('Retour'), icon: 'back', run: back },
    );
    const level = levelLine(levelOfCard(key, card));
    const relationText = friend ? t('Profil public · votre ami') : t('Profil public · pas votre ami');
    return { heading: name, icon: 'friend-list', avatar: avatarOf(key, name, card), subheading: level ? `${level} · ${relationText}` : relationText, sections, actions, back, listStart: t('j’aime · ne plus aimer') };
  }

  function confirm(question: string, lead: string, yes: string, run: () => void, cancel: () => void): void {
    lib.openCustom(() => ({ heading: question, icon: 'alert', lead, sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }), 1);
  }

  // ---------- Mon profil public ----------

  let mineBack: () => void = () => lib.openSystem();
  function openMine(back?: () => void, at?: number): void {
    if (back) mineBack = back;
    lib.openCustom(buildMine, at);
  }

  function buildMine(): Built {
    const s = net.state();
    const card = net.publicCard(me());
    const actions: Action[] = [];
    const sections: Section[] = [...flashSections()];
    const on = s.publicProfile !== false;
    if (!s.enabled) sections.push({ rows: [{ text: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Partage et réseau : « Activer le partage »'), tone: 'warning', badges: [t('Désactivé')] }] });
    else if (!card) sections.push({ rows: [{ text: t('Profil public désactivé'), detail: t('Les autres joueurs ne voient que votre pseudo dans l’annuaire, et vos scores s’ils sont publiés'), tone: 'warning', badges: [t('Désactivé')] }] });
    else {
      const facts = [card.country ? countryName(card.country, locale()) : undefined, card.friends !== undefined ? tn(card.friends, '{n} ami', '{n} amis') : undefined, tn(card.records, '{n} record publié', '{n} records publiés')].filter(Boolean).join(' · ');
      sections.push({ rows: [{ text: t('Ce que voient les joueurs qui ne sont pas vos amis'), detail: facts, icon: 'eye' }] });
      sections.push(...levelSections(me(), card, true));
      sections.push(...groupsSection(me(), actions, (at) => openMine(undefined, at)));
      const rows: Row[] = card.events.map((e) => {
        const n = card.likes[e.id] ?? 0;
        const index = actions.push({ label: eventText(e, badgeLabel), key: `mine:${e.id}`, icon: eventIcon(e), ...(n ? {} : { tone: 'quiet' as const }), run: () => (n ? openLikers(e, () => openMine(undefined, index)) : undefined) }) - 1;
        return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), aside: `★ ${n}`, ...(n ? {} : { sub: t('Pas encore de « J’aime »') }), action: index, pick: true };
      });
      sections.push({ title: t('Votre activité récente'), rows: rows.length ? rows : [{ text: t('Ni record ni badge ces derniers jours'), tone: 'quiet' }] });
    }
    actions.push(
      on
        ? { label: t('Désactiver mon profil public'), icon: 'eye', detail: t('Les autres ne verront plus que votre pseudo dans l’annuaire'), run: () => { net.setPublicProfile(false); flash = { text: t('Profil public désactivé'), tone: 'ok' }; openMine(undefined, Number.MAX_SAFE_INTEGER); } }
        : { label: t('Activer mon profil public'), icon: 'eye', detail: t('Pays, badges, records et activité récente, visibles de tous'), run: () => { net.setPublicProfile(true); flash = { text: t('Profil public activé'), tone: 'ok' }; openMine(undefined, Number.MAX_SAFE_INTEGER); } },
      { label: t('Retour'), icon: 'back', run: () => mineBack() },
    );
    return { heading: t('Mon profil public'), icon: 'eye', avatar: avatarView(me(), s.name, net.avatarFile(me())), subheading: s.name, sections, actions, back: () => mineBack(), listStart: t('voir qui a aimé') };
  }

  function openLikers(e: PublicEvent, back: () => void): void {
    lib.openCustom(() => {
      const likers = net.likers(e.id);
      const actions: Action[] = [];
      const rows: Row[] = likers.map((l) => {
        const index = actions.push({ label: l.name, key: `liker:${l.from}`, icon: 'friend-list', run: () => openProfile(l.from, () => openLikers(e, back)) }) - 1;
        return { text: l.name, avatar: avatarView(l.from, l.name, net.avatarFile(l.from)), detail: [socialAgo(l.at, now()), isFriend(l.from) ? t('ami') : t('pas votre ami')].join(' · '), action: index, pick: true };
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Ont aimé'),
        icon: 'star',
        subheading: eventText(e, badgeLabel),
        lead: t('Vous seul voyez qui a aimé ; les autres joueurs voient le nombre.'),
        sections: [{ rows: rows.length ? rows : [{ text: t('Personne pour l’instant'), tone: 'quiet' }] }],
        actions,
        back,
        listStart: t('voir le profil'),
      };
    }, 0);
  }

  return {
    openProfile: (key, back) => openProfile(key, back),
    openMine: (back) => openMine(back),
    item: {
      get detail() {
        const s = net.state();
        if (!s.enabled) return t('Indisponible : partage désactivé (Partage et réseau)');
        if (s.publicProfile === false) return t('Désactivé · les autres ne voient que votre pseudo');
        const card = net.publicCard(me());
        const likes = Object.values(card?.likes ?? {}).reduce((a, b) => a + b, 0);
        return likes ? tn(likes, 'Activé · {n} « J’aime » sur votre activité', 'Activé · {n} « J’aime » sur votre activité') : t('Activé · ce que voient les joueurs qui ne sont pas vos amis');
      },
      run: () => openMine(() => lib.openSystem()),
    },
  };
}
