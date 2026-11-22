// Profil d'un joueur et « J'aime » à l'écran (publicprofile.ts, social-net.ts) :
// - le seul écran d'un joueur, ami ou non (Mes amis, l'annuaire, la messagerie, les salons, une
//   notification) : pays, badges, records, une seule liste d'activité récente ; Start sur un record
//   ou un badge l'aime, ou ne l'aime plus. Pour un ami, la relation (friends-menu.ts, playerPart)
//   ajoute sa présence, sa bibliothèque, l'invitation, ses parties jouées dans la même liste et
//   « Retirer de mes amis » (17/11/2026 : la fiche d'ami et le profil public faisaient doublon).
//   Pour un autre joueur, ce qui est réservé aux amis est dit, grisé ; « Écrire un message » reste
//   visible, grisé avec sa raison ;
// - « Mon profil public » (Menu système > Communauté > Mon profil > Confidentialité) : ce que voient les autres, et qui a aimé chaque
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
  invitedOf,
  levelOf,
  locale,
  RARITY_XP,
  XP,
  shownLevel,
  tierLabel,
  tierOf,
  socialAgo,
  playerFlag,
  playerRecords,
  t,
  tn,
  type IconName,
  type PlayerRecord,
  type PresenceTable,
  type PublicCard,
  type PublicEvent,
  type SocialEvent,
} from '@cyberpinball/core';
import { onGesture } from './gesture-flash';
import { createHubScreen, type HubButtonSpec, type HubCardSpec, type HubLevel, type HubMedal, type HubPersonSpec, type HubSectionSpec, type HubSpec, type HubTabSpec } from './hub-screen';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { SocialNet } from './social-net';

/** Ce que le profil offre à la relation pour ses actions. */
export interface PlayerContext {
  /** Redessiner le profil, la ligne `at` choisie (sans : la dernière action). */
  here(at?: number): void;
  /** Le constat d'une action, en tête du profil jusqu'au geste suivant. */
  flash(row: Row): void;
}

/** Ce que la relation dit dans l'en-tête du profil (22/11/2026). */
export interface PlayerHead {
  /** Au-dessus du nom : « Amis depuis mars 2026 », « Vous a demandé en ami · il y a 30 min ». */
  eyebrow?: string;
  eyebrowTone?: 'signal' | 'warning';
  /** Sous le nom : ce qu'il fait (« En partie sur… », « En ligne », « Vu il y a 3 h »). */
  status?: { text: string; tone: 'signal' | 'meta' | 'quiet' };
  /** L'anneau de présence autour de sa pastille. */
  ring?: 'online' | 'playing';
  /** « À propos » : depuis quand nous sommes amis. */
  since?: string;
  /** « À propos » : sa bibliothèque (un ami). */
  library?: string;
}

/** Ce que la relation ajoute au profil d'un joueur (friends-menu.ts, playerPart). */
export interface PlayerPart {
  /** L'en-tête du profil (écran à onglets) ; le téléphone garde `rows`. */
  head?: PlayerHead;
  /** En tête : présence et bibliothèque d'un ami ; sinon où on l'a vu, la demande envoyée. */
  rows: Row[];
  /** Son identifiant, après les faits de sa carte. */
  id?: Row;
  /** Ses évènements d'ami, parties jouées comprises : mêlés à son activité publique. */
  events?: readonly SocialEvent[];
  /** Avant « Écrire un message » : l'invitation et la bibliothèque d'un ami, la demande d'ami d'un autre. */
  actions: Action[];
  /** Avant « Bloquer » : « Retirer de mes amis ». */
  tail?: Action[];
}

export interface ProfileMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  net: SocialNet;
  /** Présence, bibliothèque, demandes d'ami : ce que la relation ajoute (friends-menu.ts, playerPart). */
  relation(key: string, name: string, ctx: PlayerContext): PlayerPart;
  /** Blocage (avec sa confirmation) et fil de la messagerie, d'après chat-menu.ts. */
  block(key: string): void;
  openThread?(key: string, back: () => void): void;
  /** Sous « Écrire un message » d'un ami : ce que deviendra le message (chat-menu.ts). */
  writeDetail?(key: string): string;
  /**
   * Groupes publics d'un joueur (group-service.ts, publicGroupsOf) : jamais un groupe privé. `open` : le
   * groupe (j'en suis membre), sinon sa page de l'annuaire, avec « Rejoindre ».
   */
  groups?: {
    of(key: string): { id: string; name: string; members: number; week?: string; mine: boolean }[];
    open(id: string, mine: boolean, back: () => void): void;
  };
  /**
   * « Qui vous a fait découvrir Cyber Pinball ? » (invite-menu.ts) : proposé dans « Mon profil public »
   * tant que la question se pose ou que le choix n'est pas encore confirmé.
   */
  invite?: { asked(): boolean; chosen(): string | undefined; open(back: () => void): void };
  /** MagnaSave (la gauche d'abord) : l'onglet suivant du profil. */
  zoneKeys?(): readonly string[];
  /** Flippers : changer d'onglet dans la barre, contenu affiché immédiatement. */
  navKeys?(): { previous: readonly string[]; next: readonly string[] };
  /** Mon niveau (level-tracker.ts) : l'anneau de ma pastille, même quand mon profil public est coupé. */
  myLevel?(): number;
  /** Mon profil : Modifier mon profil, Confidentialité, Mon compte (les rubriques du Menu système). */
  system?: { open(group: 'modifier-profil' | 'confidentialite' | 'compte', back: () => void): void };
  /** La roue sur une table (onglet Records, ses tables du moment) ; `has` : elle est dans la collection montrée. */
  table?: { has(table: PresenceTable): boolean; go(table: PresenceTable): void };
  /** Nos tables en commun (community-menu.ts), quand elles sont connues. */
  commonTables?(key: string): number | undefined;
  /** Saluer un nouveau venu dans le salon de mon pays : undefined si c'est parti, sinon pourquoi. */
  welcome?(name: string): string | undefined;
  now?(): Date;
}

/** Les onglets du profil : Activité, Records, Badges, À propos. */
export type ProfileTab = 'activity' | 'records' | 'badges' | 'about';

/** Un groupe public d'un joueur, tel que l'hôte le décrit. */
type PublicGroup = ReturnType<NonNullable<ProfileMenuHost['groups']>['of']>[number];

/** Jusqu'à ce niveau, un joueur en ligne est un nouveau venu : on peut lui souhaiter la bienvenue. */
const NEWCOMER_LEVEL = 3;

export interface ProfileMenu {
  /** Le profil public d'un joueur, son « Retour » vers `back`. */
  openProfile(key: string, back: () => void): void;
  /**
   * Le même profil pour le téléphone (phone-community.ts) : l'écran de la borne, sans l'ouvrir ; ses
   * actions qui le redessinent appellent `refresh` au lieu d'ouvrir le profil à la borne.
   */
  remote(key: string, refresh: () => void): Built;
  /** « Mon profil public » (Menu système > Communauté > Mon profil > Confidentialité). */
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
  /** Le dernier nom connu de chaque joueur montré : un ami qu'on retire garde son nom à l'écran. */
  const names = new Map<string, string>();
  const nameOf = (key: string, card?: PublicCard) => {
    const s = net.state();
    const known = card?.name ?? s.friends.find((f) => f.key === key)?.name ?? s.directory.find((d) => d.profile.key === key)?.profile.name ?? [...s.incoming, ...s.outgoing].find((r) => r.key === key)?.name;
    if (known) names.set(key, known);
    return known ?? names.get(key) ?? key.slice(0, 8);
  };
  /** Pastille : l'avatar d'un ami, sinon celui de sa carte (public, contrôlé par son empreinte), sinon ses initiales. */
  /** Son niveau, s'il est vraisemblable depuis le jour où cette borne a vu sa carte ; « ? » sinon. */
  const levelOfCard = (key: string, card?: PublicCard) => (card?.xp === undefined ? undefined : shownLevel(card.xp, net.cardFirstSeen(key), now(), invitedOf(key, card.invited, card.invitedTotal).count) ?? ('?' as const));

  /**
   * Ses personnes invitées (invitations.ts) : le nombre, vérifié sur les attestations de sa carte, et
   * leurs pastilles. Rien tant qu'il n'a invité personne. Jamais « invité par » sur le profil d'un invité.
   */
  function invitedSection(key: string, card: PublicCard, mine: boolean): Section[] {
    const { count, players } = invitedOf(key, card.invited, card.invitedTotal);
    // Ce que rapporte une personne invitée : rappelé à moi seul, pour donner envie d'en inviter.
    const reward = t('+{xp} XP par personne invitée, +{tier} XP à chacun de ses paliers ; badge Ambassadeur dès la première', { xp: XP.invited, tier: XP.inviteeTier });
    if (!count) return mine ? [{ title: t('Personnes invitées'), rows: [{ text: t('Faites découvrir Cyber Pinball à vos amis'), detail: t('À son arrivée, chacun peut dire que c’est vous : {reward}', { reward }), icon: 'friend-add', tone: 'info' }] }] : [];
    const shown = [...players].reverse().slice(0, 8).map((p) => avatarOf(p.me, nameOf(p.me, net.publicCard(p.me)) || p.name, net.publicCard(p.me)));
    const text = mine
      ? tn(count, 'Vous avez fait découvrir Cyber Pinball à {n} joueur', 'Vous avez fait découvrir Cyber Pinball à {n} joueurs')
      : tn(count, 'A fait découvrir Cyber Pinball à {n} joueur', 'A fait découvrir Cyber Pinball à {n} joueurs');
    return [{ title: t('Personnes invitées'), rows: [{ text, icon: 'friend-add', tone: 'ok', avatars: shown, ...(mine ? { detail: reward } : {}), ...(count > shown.length ? { aside: `+${count - shown.length}` } : {}) }] }];
  }
  const levelLine = (level: number | '?' | undefined) => (level === undefined ? undefined : level === '?' ? t('Niveau ?') : t('{tier} · niveau {level}', { tier: tierLabel(tierOf(level)), level }));
  const avatarOf = (key: string, name: string, card?: PublicCard) => {
    const level = levelOfCard(key, card);
    return { ...avatarView(key, name, net.avatarFile(key) ?? (card?.avatar ? net.rankingAvatar(key, card.avatar) : undefined)), ...(typeof level === 'number' ? { level } : {}) };
  };

  const eventIcon = (e: PublicEvent | SocialEvent): IconName => (e.kind === 'badge' ? 'medal' : e.kind === 'played' ? 'play' : 'trophy');

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
      else out.push({ kind: 'profile-level', rows: [{ icon: 'gauge', text: t('{tier} · niveau {level}', { tier: tierLabel(v.tier), level: v.level }), detail: t('{into} / {need} XP', { into: v.into.toLocaleString(), need: v.need.toLocaleString() }), progress: { value: v.progress, tone: 'ok' } }] });
    }
    const rank = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
    const medals = card.badges
      .map((id) => badgeDefinition(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => rank[a.rarity] - rank[b.rarity])
      .slice(0, 12)
      .map((b) => ({ icon: b.icon, rarity: b.rarity, label: b.label, xp: RARITY_XP[b.rarity] }));
    out.push({
      kind: 'profile-badges',
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
    return [{ title: t('Groupes publics'), kind: 'profile-groups', rows }];
  }

  // ---------- Le profil en écran à onglets (22/11/2026) ----------
  // Un réseau social : l'en-tête du joueur (sa pastille, sa relation avec moi, ce qu'il fait, ses
  // chiffres, les actions de la relation), puis quatre onglets : Activité, Records, Badges, À propos.
  // Le même écran pour moi (mon profil : ce que voient les autres). Planche validée le 22/11/2026.

  /**
   * Ouvre le profil d'un joueur, ou le mien (`key` = ma clé) : un écran à onglets à lui, pour que
   * chaque profil ouvert depuis un autre garde son onglet et son retour.
   */
  function openProfile(key: string, back: () => void, tab: ProfileTab = 'activity'): void {
    const screen = createHubScreen({ library: lib, zoneKeys: () => host.zoneKeys?.() ?? [], navKeys: () => host.navKeys?.() ?? { previous: [], next: [] } }, (current, reopen) => describe(key, current as ProfileTab, reopen, (to) => screen.open(back, to), back), { backNotWheel: true, menuFirst: true });
    screen.open(back, tab);
  }

  const fmt = (n: number) => n.toLocaleString(locale());
  const xpText = (n: number) => t('+{n} XP', { n });
  const levelChip = (level: number | '?' | undefined): HubLevel | undefined => (typeof level === 'number' ? { text: t('Niv. {n}', { n: level }), tier: tierOf(level) } : undefined);
  const RANK = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
  /** Ses badges, les plus rares d'abord. */
  const medalsOf = (card: PublicCard): HubMedal[] =>
    card.badges
      .map((id) => badgeDefinition(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => RANK[a.rarity] - RANK[b.rarity])
      .map((b) => ({ icon: b.icon, rarity: b.rarity, label: b.label }));

  function describe(key: string, tab: ProfileTab, reopen: () => void, show: (tab: ProfileTab) => void, back: () => void): HubSpec {
    const mine = key === me();
    const s = net.state();
    const card = net.publicCard(key);
    const name = mine ? s.name : nameOf(key, card);
    const friend = !mine && isFriend(key);
    const part = mine ? undefined : host.relation(key, name, { here: () => reopen(), flash: (row) => (flash = row) });
    const hidden = !mine && net.activityHidden(key);
    const level = mine ? (host.myLevel?.() ?? (card?.xp !== undefined ? levelOf(card.xp).level : undefined)) : levelOfCard(key, card);
    const records = playerRecords(net.rankings(), key, me());
    const groups = host.groups?.of(key) ?? [];
    const head = part?.head;

    // Ses chiffres : amis (jamais la liste), records, badges, groupes, tables en commun.
    const facts: string[] = [];
    if (card?.friends !== undefined) facts.push(tn(card.friends, '{n} ami', '{n} amis'));
    if (card) facts.push(tn(card.records, '{n} record', '{n} records'), tn(card.badges.length, '{n} badge', '{n} badges'));
    if (groups.length) facts.push(tn(groups.length, '{n} groupe', '{n} groupes'));
    const common = mine ? undefined : host.commonTables?.(key);
    if (common) facts.push(tn(common, '{n} table en commun', '{n} tables en commun'));
    if (mine) {
      const invited = card ? invitedOf(key, card.invited, card.invitedTotal).count : 0;
      if (invited) facts.push(tn(invited, '{n} personne invitée', '{n} personnes invitées'));
    }

    // Le constat du dernier geste prend la place de la ligne de relation, jusqu'au geste suivant.
    const eyebrow = flash ? { eyebrow: flash.text, eyebrowTone: (flash.tone === 'warning' ? 'warning' : 'signal') as 'signal' | 'warning' } : mine ? { eyebrow: t('Mon profil · ce que voient les autres joueurs') } : head?.eyebrow ? { eyebrow: head.eyebrow, ...(head.eyebrowTone ? { eyebrowTone: head.eyebrowTone } : {}) } : {};
    const person: HubPersonSpec = {
      avatar: mine ? { ...avatarView(key, name, net.avatarFile(key)), ...(level && typeof level === 'number' ? { level } : {}) } : avatarOf(key, name, card),
      ...(head?.ring ? { ring: head.ring } : {}),
      flag: playerFlag(card?.country ?? (mine ? net.country?.() : undefined), locale()),
      name,
      ...(levelChip(level) ? { level: levelChip(level)! } : {}),
      ...eyebrow,
      ...(mine ? { status: mineStatus(card) } : head?.status ? { status: head.status } : !card && !friend ? { status: { text: t('Profil public pas encore reçu'), tone: 'quiet' as const } } : {}),
      buttons: mine ? mineButtons(reopen) : playerButtons(key, name, friend, part!, reopen, level),
    };

    const tabs: HubTabSpec[] = [
      { id: 'activity', label: t('Activité'), icon: 'history' },
      { id: 'records', label: t('Records'), icon: 'trophy', ...(records.length ? {} : { disabled: t('Aucun encore') }) },
      { id: 'badges', label: t('Badges'), icon: 'medal', ...(card?.badges.length && !hidden ? {} : { disabled: t('Aucun encore') }) },
      { id: 'about', label: t('À propos'), icon: 'info' },
    ];
    // Des onglets en liste (règle du 22/11/2026 : hors de l'accueil, pas de blocs) : chaque publication, record ou option est un arrêt des flippers.
    const spec: HubSpec = { heading: mine ? t('Mon profil') : name, icon: 'friend-list', medallion: 'communaute', title: name, facts, person, tabs, sections: [], list: true, readableCards: true };
    // Partage coupé (mon profil) : personne ne me voit ; rien d'autre à montrer.
    if (mine && !s.enabled) return { ...spec, sections: [], empty: { title: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Partage et réseau : « Activer le partage »') } };
    switch (tab) {
      case 'records':
        return { ...spec, sections: recordsSections(records, mine) };
      case 'badges':
        return { ...spec, sections: badgesSections(card) };
      case 'about':
        return { ...spec, sections: aboutSections(key, name, card, mine, friend, part, groups, reopen, back) };
      default:
        return { ...spec, sections: activitySections(key, card, part, mine, friend, hidden, level, reopen, show), empty: { title: t('Son profil arrive'), detail: t('Ses records, badges et parties s’afficheront ici dès que sa borne les aura partagés') } };
    }
  }

  /** Sous mon nom : mon profil public activé (et les « J'aime » reçus), ou coupé. */
  function mineStatus(card: PublicCard | undefined): HubPersonSpec['status'] {
    if (net.state().publicProfile === false || !card) return { text: t('Profil public désactivé : les autres ne voient que votre pseudo'), tone: 'warning' };
    const likes = Object.values(card.likes).reduce((a, b) => a + b, 0);
    return { text: likes ? tn(likes, 'Profil public activé · {n} « J’aime » reçu', 'Profil public activé · {n} « J’aime » reçus') : t('Profil public activé'), tone: 'signal' };
  }

  /** Mon profil : ce que je peux changer, dans les rubriques du Menu système. */
  function mineButtons(reopen: () => void): HubButtonSpec[] {
    const sys = host.system;
    if (!sys) return [];
    return [
      { label: t('Modifier mon profil'), key: 'edit', icon: 'edit', primary: true, run: () => sys.open('modifier-profil', reopen) },
      { label: t('Confidentialité'), key: 'privacy', icon: 'eye', run: () => sys.open('confidentialite', reopen) },
      { label: t('Mon compte'), key: 'account', icon: 'account', run: () => sys.open('compte', reopen) },
    ];
  }

  /**
   * Les actions de la relation, dans l'en-tête : un ami, Inviter à jouer (grisé hors ligne), Écrire, Sa
   * bibliothèque ; un autre joueur, la demande d'ami (Ajouter, Accepter ou Refuser, Annuler), Écrire grisé
   * avec sa raison, et Lui souhaiter la bienvenue s'il vient d'arriver. Une action indisponible reste
   * visible, grisée, avec sa raison courte (règle de design).
   */
  function playerButtons(key: string, name: string, friend: boolean, part: PlayerPart, reopen: () => void, level: number | '?' | undefined): HubButtonSpec[] {
    const act = (id: string) => part.actions.find((a) => a.key === id);
    const out: HubButtonSpec[] = [];
    const write: HubButtonSpec = friend && host.openThread ? { label: t('Écrire'), key: 'write', icon: 'message', run: () => host.openThread!(key, reopen) } : { label: t('Écrire'), key: 'write', icon: 'message', off: t('Entre amis seulement'), run: () => undefined };
    if (friend) {
      const invite = act('invite');
      const online = invite && invite.tone !== 'quiet';
      out.push(online ? { label: t('Inviter à jouer'), key: 'invite', icon: 'gamepad', primary: true, run: invite.run } : { label: t('Inviter à jouer'), key: 'invite', icon: 'gamepad', off: t('Hors ligne'), run: () => undefined });
      // Sans messagerie (essais), pas de bouton Écrire chez un ami : sa raison serait fausse.
      if (host.openThread) out.push({ ...write, ...(online ? {} : { primary: true }) });
      const library = act('library');
      if (library) out.push({ label: t('Sa bibliothèque'), key: 'library', icon: 'tables', run: library.run });
      return out;
    }
    const request = act('request');
    const accept = act('accept');
    const decline = act('decline');
    const cancel = act('cancel-request');
    if (accept) out.push({ label: t('Accepter'), key: 'accept', icon: 'check', xp: xpText(XP.friend), primary: true, run: accept.run });
    if (decline) out.push({ label: t('Refuser'), key: 'decline', icon: 'close', run: decline.run });
    if (request) out.push({ label: t('Ajouter'), key: 'request', icon: 'friend-add', xp: xpText(XP.friend), primary: true, run: request.run });
    if (cancel) out.push({ label: t('Ajouter'), key: 'request', icon: 'friend-add', off: t('Demande envoyée'), run: () => undefined }, { label: t('Annuler la demande'), key: 'cancel-request', icon: 'close', run: cancel.run });
    // Un nouveau venu en ligne : un mot de bienvenue dans le salon (comme « Saluer » de la Communauté).
    const online = net.livePlayers().some((b) => b.key === key);
    if (host.welcome && online && typeof level === 'number' && level <= NEWCOMER_LEVEL)
      out.push({
        label: t('Lui souhaiter la bienvenue'),
        key: 'welcome',
        icon: 'globe',
        run: () => {
          const why = host.welcome!(name);
          flash = { text: why ?? t('Envoyé dans le salon'), tone: why ? 'warning' : 'ok' };
          reopen();
        },
      });
    out.push(write);
    return out;
  }

  /**
   * Activité : une seule liste, la plus récente en haut (ses records et badges publics, Start les aime ;
   * pour un ami, ses parties jouées) ; puis ses tables de la semaine ; puis « En bref » (niveau, ses
   * trois badges les plus rares). Pour moi, Start sur une publication dit qui l'a aimée.
   */
  function activitySections(key: string, card: PublicCard | undefined, part: PlayerPart | undefined, mine: boolean, friend: boolean, hidden: boolean, level: number | '?' | undefined, reopen: () => void, show: (tab: ProfileTab) => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = [];
    if (hidden) {
      out.push({ title: t('Activité'), layout: 'list', column: 'left', cards: [{ key: 'hidden', icon: 'eye', title: t('Activité masquée sur cette borne'), detail: t('Ses évènements et ses « J’aime » ne s’affichent plus ici : À propos › Afficher son activité'), quiet: true }] });
      return out;
    }
    const since = now().getTime() - 30 * 86_400_000;
    const items: { at: string; event: PublicEvent | SocialEvent; likable: boolean }[] = [
      ...(card?.events ?? []).map((event) => ({ at: event.at, event, likable: true })),
      ...(card ? (part?.events ?? []).filter((e) => e.kind === 'played' && Date.parse(e.at) >= since) : (part?.events ?? [])).map((event) => ({ at: event.at, event, likable: false })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const posts: HubCardSpec[] = items.map(({ event: e, likable }) => {
      const base = { key: `event:${e.id}`, icon: eventIcon(e), title: eventText(e, badgeLabel) };
      if (!likable || !card) return { ...base, detail: socialAgo(e.at, now()) };
      const n = card.likes[e.id] ?? 0;
      if (mine)
        return { ...base, detail: n ? socialAgo(e.at, now()) : t('{ago} · pas encore de « J’aime »', { ago: socialAgo(e.at, now()) }), aside: String(n), asideIcon: n ? 'thumb-up-filled' : 'thumb-up', run: () => openLikers(e as PublicEvent, reopen) };
      const liked = net.likedByMe(key, e.id);
      return { ...base, detail: liked ? t('{ago} · vous aimez', { ago: socialAgo(e.at, now()) }) : socialAgo(e.at, now()), aside: String(n), asideIcon: liked ? 'thumb-up-filled' : 'thumb-up', run: () => { net.like(key, e.id, !liked); reopen(); } };
    });
    if (posts.length) out.push({ title: mine ? t('Mon activité') : t('Activité'), note: mine ? t('Start : qui a aimé') : t('{n} derniers jours', { n: 30 }), layout: 'list', column: 'left', cards: posts });
    else if (card || friend || mine)
      out.push({ title: mine ? t('Mon activité') : t('Activité'), layout: 'list', column: 'left', cards: [{ key: 'none', icon: 'history', title: friend ? t('Rien encore : ses records, badges et parties s’afficheront ici') : t('Ni record ni badge ces derniers jours'), quiet: true }] });
    // Sa carte publique n'est pas encore arrivée : le dire, plutôt qu'un fil vide.
    else out.push({ title: t('Activité'), layout: 'list', column: 'left', cards: [{ key: 'coming', icon: 'clock', title: t('Son profil arrive'), detail: t('Ses records, badges et parties s’afficheront ici dès que sa borne les aura partagés'), quiet: true }] });
    // Ses tables de la semaine (sa carte publique), « Vous l'avez » quand elle est dans ma collection.
    const week = [...(card?.plays?.week ?? [])].sort((a, b) => b.n - a.n).slice(0, 3);
    if (week.length)
      out.push({
        title: mine ? t('Mes tables du moment') : t('Ses tables du moment'),
        note: t('cette semaine'),
        layout: 'list',
        column: 'right',
        cards: week.map((p) => {
          const table = { title: p.title };
          const have = !mine && host.table?.has(table);
          return { key: `week:${p.board}`, icon: 'tables' as const, title: p.title, detail: tn(p.n, '{n} partie', '{n} parties'), ...(have ? { aside: t('Vous l’avez') } : {}), ...(host.table?.has(table) ? { run: () => host.table!.go(table) } : {}) };
        }),
      });
    // Ce qui reste entre amis, dit sans rien inventer.
    if (!mine && !friend) out.push({ title: t('Entre amis'), layout: 'list', column: 'right', cards: [{ key: 'lock', icon: 'lock', title: t('Inviter à jouer, sa bibliothèque, sa table en cours'), detail: t('Une fois amis : envoyez-lui une demande'), quiet: true }] });
    // En bref : son niveau et ses trois badges les plus rares ; Start sur les badges ouvre leur onglet.
    if (card) {
      const brief: HubCardSpec[] = [];
      if (card.xp !== undefined && typeof level === 'number') {
        const v = levelOf(card.xp);
        brief.push({ key: 'level', icon: 'gauge', title: t('{tier} · niveau {level}', { tier: tierLabel(v.tier), level: v.level }), detail: t('{into} / {need} XP', { into: fmt(v.into), need: fmt(v.need) }), progress: v.progress });
      } else if (level === '?') brief.push({ key: 'level', icon: 'gauge', title: t('Niveau ?'), detail: t('Plus haut que ce que permet son ancienneté sur le réseau : pas montré'), quiet: true });
      const medals = medalsOf(card);
      if (medals.length) brief.push({ key: 'badges', icon: 'medal', title: t('{n} badges sur {total}', { n: card.badges.length, total: BADGES.length }), detail: t('Les plus rares'), medals: medals.slice(0, 3), run: () => show('badges') });
      if (brief.length) out.push({ title: t('En bref'), layout: 'list', column: 'right', cards: brief });
    }
    return out;
  }

  /** Records : sur mes tables d'abord (l'écart à rattraper en ambre, « Vous menez », « À essayer »), puis les autres. */
  function recordsSections(records: PlayerRecord[], mine: boolean): HubSectionSpec[] {
    const card = (r: PlayerRecord): HubCardSpec => {
      const go = host.table?.has(r.table) ? () => host.table!.go(r.table) : undefined;
      const place = r.rank === 1 ? t('1ᵉʳ sur {n}', { n: r.players }) : t('{rank}ᵉ sur {n}', { rank: r.rank, n: r.players });
      const detail = mine ? `${fmt(r.score)} · ${place}` : r.mine !== undefined ? t('{score} · {place} · vous : {mine}', { score: fmt(r.score), place, mine: fmt(r.mine) }) : go ? t('{score} · {place} · pas encore joué', { score: fmt(r.score), place }) : `${fmt(r.score)} · ${place}`;
      const aside = mine || (r.mine === undefined && !go) ? {} : r.mine === undefined ? { aside: t('À essayer') } : r.mine >= r.score ? { aside: t('Vous menez') } : { aside: `${fmt(r.score - r.mine)}\n${t('à rattraper')}`, asideTone: 'warning' as const };
      return { key: `record:${r.board}`, icon: 'trophy', title: r.table.title, detail, ...aside, ...(go ? { run: go } : {}) };
    };
    if (mine) return [{ title: t('Mes records'), note: t('Publiés aux classements'), layout: 'list', column: 'left', cards: records.map(card) }];
    const yours = records.filter((r) => r.mine !== undefined || host.table?.has(r.table));
    const others = records.filter((r) => !yours.includes(r));
    const out: HubSectionSpec[] = [];
    if (yours.length) out.push({ title: t('Sur vos tables'), note: t('à battre'), layout: 'list', column: 'left', cards: yours.map(card) });
    if (others.length) out.push({ title: yours.length ? t('Ses autres records') : t('Ses records'), layout: 'list', column: yours.length ? 'right' : 'left', cards: others.map(card) });
    return out;
  }

  /** Badges : tous les siens, rangés par rareté, dessinés comme partout. */
  function badgesSections(card: PublicCard | undefined): HubSectionSpec[] {
    if (!card) return [];
    const medals = medalsOf(card);
    const group = (title: string, rarities: readonly string[]): HubCardSpec[] => {
      const list = medals.filter((m) => rarities.includes(m.rarity));
      return list.length ? [{ key: `rarity:${rarities.join('-')}`, title, medals: list }] : [];
    };
    return [
      {
        title: t('Badges'),
        note: t('{n} sur {total}', { n: card.badges.length, total: BADGES.length }),
        layout: 'list',
        column: 'left',
        cards: [...group(t('Épiques et légendaires'), ['legendary', 'epic']), ...group(t('Rares'), ['rare'])],
      },
      { layout: 'list', column: 'right', cards: group(t('Communs'), ['common']) },
    ].filter((s) => s.cards.length) as HubSectionSpec[];
  }

  /**
   * À propos : ce qu'on sait de lui (pays, amitié, bibliothèque, identifiant, personnes invitées), ses
   * groupes publics, puis les actions rares en lignes de menu (masquer son activité, retirer de mes amis,
   * bloquer). Pour moi : qui m'a fait découvrir Cyber Pinball, et mon profil public à activer ou couper.
   */
  function aboutSections(key: string, name: string, card: PublicCard | undefined, mine: boolean, friend: boolean, part: PlayerPart | undefined, groups: PublicGroup[], reopen: () => void, back: () => void): HubSectionSpec[] {
    const info: HubCardSpec[] = [];
    const country = card?.country ?? (mine ? net.country?.() : undefined);
    info.push({ key: 'country', icon: 'globe', title: country ? countryName(country, locale()) : t('Pays non indiqué') });
    if (part?.head?.since) info.push({ key: 'since', icon: 'friends', title: part.head.since });
    const seen = mine ? undefined : net.cardSeen(key);
    if (seen) info.push({ key: 'seen', icon: 'clock', title: t('Profil actualisé {ago}', { ago: socialAgo(seen, now()) }) });
    if (part?.head?.library) info.push({ key: 'library', icon: 'tables', title: t('Sa bibliothèque'), detail: part.head.library });
    if (part?.id) info.push({ key: 'id', icon: 'search', title: part.id.text, ...(part.id.detail ? { detail: part.id.detail } : {}) });
    if (card) {
      const { count, players } = invitedOf(key, card.invited, card.invitedTotal);
      if (count) {
        const shown = [...players].reverse().slice(0, 8).map((p) => avatarOf(p.me, nameOf(p.me, net.publicCard(p.me)) || p.name, net.publicCard(p.me)));
        info.push({ key: 'invited', icon: 'friend-add', title: mine ? tn(count, 'Vous avez fait découvrir Cyber Pinball à {n} joueur', 'Vous avez fait découvrir Cyber Pinball à {n} joueurs') : tn(count, 'A fait découvrir Cyber Pinball à {n} joueur', 'A fait découvrir Cyber Pinball à {n} joueurs'), seats: shown, ...(mine ? { detail: t('{xp} par personne invitée', { xp: xpText(XP.invited) }) } : {}) });
      }
    }
    const out: HubSectionSpec[] = [{ title: t('À propos'), layout: 'list', column: 'left', cards: info }];
    if (groups.length)
      out.push({
        title: t('Groupes publics'),
        layout: 'list',
        column: 'right',
        cards: groups.map((g) => ({ key: `group:${g.id}`, icon: 'group' as const, title: g.name, detail: [tn(g.members, '{n} membre', '{n} membres'), g.week ? t('table de la semaine : {table}', { table: g.week }) : undefined, g.mine ? t('vous en êtes') : undefined].filter(Boolean).join(' · '), run: () => host.groups!.open(g.id, g.mine, reopen) })),
      });
    const choices: HubCardSpec[] = [];
    if (mine) {
      const s = net.state();
      if (host.invite && (host.invite.asked() || host.invite.chosen())) {
        const chosen = host.invite.chosen();
        choices.push({ key: 'invited-by', icon: 'friend-add', title: chosen ? t('Découvert grâce à {name}', { name: chosen }) : t('Qui vous a fait découvrir Cyber Pinball ?'), detail: t('Il le verra sur son profil ; le vôtre n’en dit rien'), run: () => host.invite!.open(reopen) });
      }
      if (s.enabled)
        choices.push(
          s.publicProfile !== false
            ? { key: 'public', icon: 'eye', title: t('Désactiver mon profil public'), detail: t('Les autres ne verront plus que votre pseudo dans l’annuaire'), run: () => { net.setPublicProfile(false); flash = { text: t('Profil public désactivé'), tone: 'ok' }; reopen(); } }
            : { key: 'public', icon: 'eye', title: t('Activer mon profil public'), detail: t('Pays, badges, records et activité récente, visibles de tous'), run: () => { net.setPublicProfile(true); flash = { text: t('Profil public activé'), tone: 'ok' }; reopen(); } },
        );
    } else {
      choices.push(
        net.activityHidden(key)
          ? { key: 'activity', icon: 'eye', title: t('Afficher son activité'), detail: t('Ses évènements et ses « J’aime » s’affichent de nouveau sur cette borne'), run: () => { net.hideActivity(key, false); reopen(); } }
          : { key: 'activity', icon: 'eye', title: t('Masquer son activité'), detail: t('Ses évènements et ses « J’aime » ne s’affichent plus sur cette borne'), run: () => { net.hideActivity(key, true); reopen(); } },
      );
      for (const a of part?.tail ?? []) choices.push({ key: a.key ?? a.label, icon: a.icon ?? 'close', title: a.label, ...(a.detail ? { detail: a.detail } : {}), run: a.run });
      choices.push({ key: 'block', icon: 'lock', title: t('Bloquer {name}', { name }), detail: t('Plus de demande, plus de connexion avec sa borne'), run: () => confirm(t('Bloquer {name} ?', { name }), t('Plus de demande, plus de connexion avec sa borne. « Partage et réseau » le débloque.'), t('Bloquer'), () => { host.block(key); flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name }), tone: 'ok' }; back(); }, reopen) });
    }
    if (choices.length) out.push({ title: mine ? t('Options') : friend ? t('Options de la relation') : t('Options'), layout: 'list', column: 'right', cards: [], choices });
    return out;
  }

  // ---------- L'ancien écran : le profil du téléphone (phone-community.ts) ----------

  function buildProfile(key: string, back: () => void, refresh?: () => void): Built {
    const card = net.publicCard(key);
    const name = nameOf(key, card);
    const friend = isFriend(key);
    // Au téléphone (`refresh`), le profil se redessine là-bas : rien ne s'ouvre à la borne.
    const here = refresh ? () => refresh() : (_at: number) => openProfile(key, back);
    const part = host.relation(key, name, { here: (at) => here(at ?? Number.MAX_SAFE_INTEGER), flash: (row) => (flash = row) });
    const actions: Action[] = [];
    const sections: Section[] = [...flashSections()];
    const seen = net.cardSeen(key);
    const facts: string[] = [];
    if (card?.country) facts.push(countryName(card.country, locale()));
    if (card?.friends !== undefined) facts.push(tn(card.friends, '{n} ami', '{n} amis'));
    if (card) facts.push(tn(card.records, '{n} record publié', '{n} records publiés'));
    const hidden = net.activityHidden(key);
    // En tête : la relation (présence, bibliothèque ; ou où on l'a vu), les faits de sa carte, son identifiant.
    const head: Row[] = [...part.rows];
    if (card) head.push({ text: facts.join(' · '), detail: seen ? t('Profil actualisé {ago}', { ago: socialAgo(seen, now()) }) : undefined, icon: 'friends' });
    else if (!friend && !hidden) head.push({ text: t('Profil public pas encore reçu'), detail: t('Il arrive quand sa borne, ou une borne qui l’a vu, est reliée à la vôtre'), tone: 'info', icon: 'clock' });
    if (part.id) head.push(part.id);
    if (head.length) sections.push({ kind: 'profile-head', rows: head });
    // Puis son niveau et ses badges, ses groupes, et une seule liste d'activité.
    if (card && !hidden) sections.push(...levelSections(key, card, false), ...invitedSection(key, card, false));
    sections.push(...groupsSection(key, actions, here));
    if (hidden) sections.push({ kind: 'profile-note', rows: [{ text: t('Activité masquée sur cette borne'), detail: t('Ses évènements et ses « J’aime » ne s’affichent plus ici'), tone: 'quiet', icon: 'eye' }] });
    else if (card || part.events?.length || friend) sections.push(activitySection(key, card, part.events ?? [], friend, actions, here));
    if (!friend) sections.push({ kind: 'profile-note', rows: [{ text: t('Table en cours, parties jouées, bibliothèque : réservées à ses amis'), tone: 'quiet', icon: 'lock' }] });
    // Actions : ce qu'offre la relation (inviter, sa bibliothèque ; ou la demande d'ami), écrire (grisé
    // pour un non-ami, avec sa raison), masquer, retirer de mes amis, bloquer.
    actions.push(
      ...part.actions,
      friend && host.openThread
        ? { label: t('Écrire un message'), key: 'write', icon: 'message', ...(host.writeDetail ? { detail: host.writeDetail(key) } : {}), run: () => host.openThread!(key, () => openProfile(key, back)) }
        : { label: t('Écrire un message'), key: 'write', icon: 'message', tone: 'quiet', detail: t('Indisponible : entre amis seulement, envoyez d’abord une demande d’ami'), run: () => undefined },
      net.activityHidden(key)
        ? { label: t('Afficher son activité'), key: 'activity', icon: 'eye', run: () => { net.hideActivity(key, false); here(Number.MAX_SAFE_INTEGER); } }
        : { label: t('Masquer son activité'), key: 'activity', icon: 'eye', detail: t('Ses évènements et ses « J’aime » ne s’affichent plus sur cette borne'), run: () => { net.hideActivity(key, true); here(Number.MAX_SAFE_INTEGER); } },
      ...(part.tail ?? []),
      { label: t('Bloquer {name}', { name }), key: 'block', icon: 'lock', detail: t('Plus de demande, plus de connexion avec sa borne'), run: () => confirm(t('Bloquer {name} ?', { name }), t('Plus de demande, plus de connexion avec sa borne. « Partage et réseau » le débloque.'), t('Bloquer'), () => { host.block(key); flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name }), tone: 'ok' }; back(); }, () => openProfile(key, back)) },
      { label: t('Retour'), key: 'back', icon: 'back', run: back },
    );
    const level = levelLine(levelOfCard(key, card));
    const relationText = friend ? t('Votre ami') : t('Profil public · pas votre ami');
    return { heading: name, icon: 'friend-list', avatar: avatarOf(key, name, card), subheading: level ? `${level} · ${relationText}` : relationText, sections, actions, back, listStart: t('j’aime · ne plus aimer') };
  }

  /**
   * Une seule liste d'activité, la plus récente en haut : ses records et badges publics (Start les
   * aime) et, pour un ami, ses parties jouées. Sans carte publique, ses évènements d'ami seuls.
   */
  function activitySection(key: string, card: PublicCard | undefined, own: readonly SocialEvent[], friend: boolean, actions: Action[], here: (at: number) => void): Section {
    const since = now().getTime() - 30 * 86_400_000;
    const items: { at: string; event: PublicEvent | SocialEvent; likable: boolean }[] = [
      ...(card?.events ?? []).map((event) => ({ at: event.at, event, likable: true })),
      // Ses records et badges sont déjà sur sa carte : seules ses parties jouées s'y ajoutent, sur les mêmes 30 jours.
      ...(card ? own.filter((e) => e.kind === 'played' && Date.parse(e.at) >= since) : own).map((event) => ({ at: event.at, event, likable: false })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const rows: Row[] = items.map(({ event: e, likable }) => {
      if (!likable || !card) return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), tone: e.kind === 'played' ? 'quiet' : 'ok' };
      const liked = net.likedByMe(key, e.id);
      const index = actions.push({ label: eventText(e, badgeLabel), key: `like:${e.id}`, icon: liked ? 'thumb-up-filled' : 'thumb-up', run: () => { net.like(key, e.id, !liked); here(index); } }) - 1;
      return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), aside: `${card.likes[e.id] ?? 0}`, asideIcon: liked ? 'thumb-up-filled' : 'thumb-up', ...(liked ? { badges: [t('Vous aimez')] } : {}), action: index, pick: true };
    });
    const empty = friend ? t('Rien encore : ses records, badges et parties s’afficheront ici') : t('Ni record ni badge ces derniers jours');
    return { kind: 'profile-activity', title: card ? t('Activité récente · {n} derniers jours', { n: 30 }) : t('Activité récente'), rows: rows.length ? rows : [{ text: empty, tone: 'quiet' }] };
  }

  function confirm(question: string, lead: string, yes: string, run: () => void, cancel: () => void): void {
    lib.openCustom(() => ({ heading: question, icon: 'alert', lead, sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }), 1);
  }

  // ---------- Mon profil ----------
  // Le même écran que celui des autres joueurs, sur ma clé : ce que voient les autres, et qui a aimé
  // chaque publication (pour moi seul).

  let mineBack: () => void = () => lib.openSystem();
  function openMine(back?: () => void): void {
    if (back) mineBack = back;
    openProfile(me(), () => mineBack());
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
        icon: 'thumb-up',
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
    remote: (key, refresh) => buildProfile(key, () => undefined, refresh),
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
