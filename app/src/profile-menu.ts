// Profil d'un joueur et « J'aime » à l'écran (publicprofile.ts, social-net.ts) :
// - le seul écran d'un joueur, ami ou non (Mes amis, l'annuaire, la messagerie, les salons, une
//   notification) : pays, badges, records, une seule liste d'activité récente ; Start sur un record
//   ou un badge l'aime, ou ne l'aime plus. Pour un ami, la relation (friends-menu.ts, playerPart)
//   ajoute sa présence, sa bibliothèque, l'invitation, ses parties jouées dans la même liste et
//   « Retirer de mes amis » (17/11/2026 : la fiche d'ami et le profil public faisaient doublon).
//   Pour un autre joueur, ce qui est réservé aux amis est dit, grisé ; « Écrire un message » reste
//   visible, grisé avec sa raison ;
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
  invitedOf,
  levelOf,
  locale,
  RARITY_XP,
  XP,
  shownLevel,
  tierLabel,
  tierOf,
  socialAgo,
  t,
  tn,
  type IconName,
  type PublicCard,
  type PublicEvent,
  type SocialEvent,
} from '@cyberpinball/core';
import { onGesture } from './gesture-flash';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { SocialNet } from './social-net';

/** Ce que le profil offre à la relation pour ses actions. */
export interface PlayerContext {
  /** Redessiner le profil, la ligne `at` choisie (sans : la dernière action). */
  here(at?: number): void;
  /** Le constat d'une action, en tête du profil jusqu'au geste suivant. */
  flash(row: Row): void;
}

/** Ce que la relation ajoute au profil d'un joueur (friends-menu.ts, playerPart). */
export interface PlayerPart {
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
      else out.push({ rows: [{ icon: 'gauge', text: t('{tier} · niveau {level}', { tier: tierLabel(v.tier), level: v.level }), detail: t('{into} / {need} XP', { into: v.into.toLocaleString(), need: v.need.toLocaleString() }), progress: { value: v.progress, tone: 'ok' } }] });
    }
    const rank = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
    const medals = card.badges
      .map((id) => badgeDefinition(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => rank[a.rarity] - rank[b.rarity])
      .slice(0, 12)
      .map((b) => ({ icon: b.icon, rarity: b.rarity, label: b.label, xp: RARITY_XP[b.rarity] }));
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
    if (head.length) sections.push({ rows: head });
    // Puis son niveau et ses badges, ses groupes, et une seule liste d'activité.
    if (card && !hidden) sections.push(...levelSections(key, card, false), ...invitedSection(key, card, false));
    sections.push(...groupsSection(key, actions, here));
    if (hidden) sections.push({ rows: [{ text: t('Activité masquée sur cette borne'), detail: t('Ses évènements et ses « J’aime » ne s’affichent plus ici'), tone: 'quiet', icon: 'eye' }] });
    else if (card || part.events?.length || friend) sections.push(activitySection(key, card, part.events ?? [], friend, actions, here));
    if (!friend) sections.push({ rows: [{ text: t('Table en cours, parties jouées, bibliothèque : réservées à ses amis'), tone: 'quiet', icon: 'lock' }] });
    // Actions : ce qu'offre la relation (inviter, sa bibliothèque ; ou la demande d'ami), écrire (grisé
    // pour un non-ami, avec sa raison), masquer, retirer de mes amis, bloquer.
    actions.push(
      ...part.actions,
      friend && host.openThread
        ? { label: t('Écrire un message'), icon: 'message', ...(host.writeDetail ? { detail: host.writeDetail(key) } : {}), run: () => host.openThread!(key, () => openProfile(key, back)) }
        : { label: t('Écrire un message'), icon: 'message', tone: 'quiet', detail: t('Indisponible : entre amis seulement, envoyez d’abord une demande d’ami'), run: () => undefined },
      net.activityHidden(key)
        ? { label: t('Afficher son activité'), icon: 'eye', run: () => { net.hideActivity(key, false); here(Number.MAX_SAFE_INTEGER); } }
        : { label: t('Masquer son activité'), icon: 'eye', detail: t('Ses évènements et ses « J’aime » ne s’affichent plus sur cette borne'), run: () => { net.hideActivity(key, true); here(Number.MAX_SAFE_INTEGER); } },
      ...(part.tail ?? []),
      { label: t('Bloquer {name}', { name }), icon: 'lock', detail: t('Plus de demande, plus de connexion avec sa borne'), run: () => confirm(t('Bloquer {name} ?', { name }), t('Plus de demande, plus de connexion avec sa borne. « Partage et réseau » le débloque.'), t('Bloquer'), () => { host.block(key); flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name }), tone: 'ok' }; back(); }, () => openProfile(key, back)) },
      { label: t('Retour'), icon: 'back', run: back },
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
      const index = actions.push({ label: eventText(e, badgeLabel), key: `like:${e.id}`, icon: liked ? 'star-filled' : 'star', run: () => { net.like(key, e.id, !liked); here(index); } }) - 1;
      return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), aside: `★ ${card.likes[e.id] ?? 0}`, ...(liked ? { badges: [t('Vous aimez')] } : {}), action: index, pick: true };
    });
    const empty = friend ? t('Rien encore : ses records, badges et parties s’afficheront ici') : t('Ni record ni badge ces derniers jours');
    return { title: card ? t('Activité récente · {n} derniers jours', { n: 30 }) : t('Activité récente'), rows: rows.length ? rows : [{ text: empty, tone: 'quiet' }] };
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
      sections.push(...levelSections(me(), card, true), ...invitedSection(me(), card, true));
      sections.push(...groupsSection(me(), actions, (at) => openMine(undefined, at)));
      const rows: Row[] = card.events.map((e) => {
        const n = card.likes[e.id] ?? 0;
        const index = actions.push({ label: eventText(e, badgeLabel), key: `mine:${e.id}`, icon: eventIcon(e), ...(n ? {} : { tone: 'quiet' as const }), run: () => (n ? openLikers(e, () => openMine(undefined, index)) : undefined) }) - 1;
        return { text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: eventIcon(e), aside: `★ ${n}`, ...(n ? {} : { sub: t('Pas encore de « J’aime »') }), action: index, pick: true };
      });
      sections.push({ title: t('Votre activité récente'), rows: rows.length ? rows : [{ text: t('Ni record ni badge ces derniers jours'), tone: 'quiet' }] });
    }
    if (host.invite && (host.invite.asked() || host.invite.chosen())) {
      const chosen = host.invite.chosen();
      actions.push({ label: chosen ? t('Découvert grâce à {name}', { name: chosen }) : t('Qui vous a fait découvrir Cyber Pinball ?'), detail: t('Il le verra sur son profil ; le vôtre n’en dit rien'), icon: 'friend-add', run: () => host.invite!.open(() => openMine()) });
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
