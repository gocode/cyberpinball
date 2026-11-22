// Communauté à onglets (21/11/2026, planche « Engagement » validée : « Super, c'est parti ! ») : l'écran
// qu'ouvre Start sur le médaillon Communauté, le composant à onglets de l'Arène (hub-screen.ts) et sa
// navigation par blocs (liseré, Start pour entrer, Exit pour sortir). Six onglets : Accueil, Messages,
// Joueurs, Groupes, Salons, Profil. Chaque écran mène par ce qui attend (le message qu'on m'a écrit,
// avec trois réponses toutes prêtes), puis ce qui relie (qui est en ligne, joueurs suggérés à ajouter
// d'un appui, le salon et ses phrases), puis ce qui bouge (saluer un nouveau venu, féliciter un exploit).
//
// Règles tenues ici :
// - un joueur n'a qu'un écran, son profil (profile-menu.ts) : Start sur un joueur l'ouvre ;
// - peu de monde en ligne : les joueurs suggérés remplacent les amis, jamais une section vide ;
// - « Regarder » un ami en direct n'existe pas encore : aucun bouton ne le promet ;
// - les réglages de la communauté restent au Menu système (Communauté > Réglages de la communauté) ;
// - l'invitation à faire découvrir Cyber Pinball : dans l'onglet Joueurs ;
// - le menu d'abord (21/11/2026) : l'écran s'ouvre dans la barre d'onglets, les flippers y montrent le
//   contenu de chaque onglet tout de suite ; l'accueil récapitule chaque onglet par sa première bande, et
//   Start sur un récapitulatif ouvre l'onglet sur cette bande (Exit y ramène).
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  avatarView,
  badgeLabel,
  downloadPage,
  eventText,
  mutualFriends,
  language,
  quickReplies,
  shownCrowd,
  shownLevel,
  socialAgo,
  suggestPlayers,
  t,
  tierOf,
  tn,
  welcomeLine,
  XP,
  type AvatarView,
  type IconName,
  type OnlinePlayer,
  type SocialEvent,
  type SuggestReason,
} from '@cyberpinball/core';
import type { Built } from './library';
import { qrRows } from './remote-qr';
import type { SocialNet } from './social-net';
import { createHubScreen, type HubCardSpec, type HubLevel, type HubLogLine, type HubSectionSpec, type HubSpec, type HubTabSpec } from './hub-screen';

/** Une conversation : un ami, un groupe, ou les mentions d'un salon. */
export interface CommunityThread {
  kind: 'friend' | 'group' | 'room';
  id: string;
  name: string;
  /** La clé du joueur d'une conversation à deux (sa pastille, son niveau). */
  key?: string;
  unread: number;
  last?: { who?: string; text: string; at: number };
  /** Le détail sous la bulle (table de la semaine d'un groupe). */
  detail?: string;
  open(back: () => void): void;
  /** Répondre d'une phrase : faux si elle n'est pas partie (messagerie coupée, limite d'envoi). */
  reply?(text: string): boolean;
}

/** Le salon par défaut, d'un coup d'œil : ses dernières lignes, ses phrases, ou pourquoi on n'y écrit pas. */
export interface CommunityRoomPeek {
  id: string;
  name: string;
  present?: number;
  lines: HubLogLine[];
  phrases: string[];
  /** Pourquoi on ne peut pas y écrire d'ici (salons coupés, règles pas encore acceptées). */
  blocked?: string;
  /** Les autres salons à ouvrir (Monde, ceux où l'on parle). */
  others: { id: string; name: string; present?: number }[];
}

export interface CommunityHubHost {
  library: { openCustom(build: () => Built, at?: number): void; openSystemGroupFrom(group: 'modifier-profil' | 'confidentialite' | 'compte', back: () => void): void };
  zoneKeys(): readonly string[];
  net: Pick<SocialNet, 'state' | 'status' | 'publicCard' | 'friendsOf' | 'cardFirstSeen' | 'avatarFile' | 'request' | 'accept' | 'decline' | 'presenceOf' | 'like' | 'likedByMe' | 'country'>;
  /** Mon niveau (level-tracker.ts). */
  myLevel(): number;
  /** Les joueurs en ligne, amis compris (community-menu.ts), et tous les joueurs connus. */
  players: {
    online(): readonly OnlinePlayer[];
    everyone(): readonly OnlinePlayer[];
    /** Les tables en commun avec ce joueur, mes favorites d'abord, avec leur logo de roue. */
    sharedTables(key: string): readonly { title: string; src?: string }[];
    /** L'écran « Joueurs » complet, sur l'onglet des amis ou sur tous les joueurs. */
    open(back: () => void, tab: 'friends' | 'all'): void;
    detail(): string;
  };
  /** Le seul écran d'un joueur, et le mien. */
  profile: { open(key: string, back: () => void): void; openMine(back: () => void): void };
  /** « Trouver un joueur » et les demandes d'amis (friends-menu.ts). */
  friends: { find(): void; requests(back: () => void): void };
  /** Les conversations où quelque chose attend (Messages en attente), et les récentes. */
  messages: { waiting(): CommunityThread[]; recent(max: number): CommunityThread[]; open(back: () => void): void; detail(): string };
  groups: { mine(): CommunityThread[]; open(back: () => void): void; door(): { detail: string; attention: boolean; quiet: boolean } };
  room: { peek(): CommunityRoomPeek; write(text: string): string | undefined; open(back: () => void): void; openRoom(id: string, back: () => void): void; problem(): string | undefined };
  /** Faire découvrir Cyber Pinball : combien de personnes invitées (le QR du téléchargement est ici). */
  invite: { count(): number };
  /** Les flippers (Précédent, Suivant) : dans la barre d'onglets, ils changent d'onglet. */
  navKeys(): { previous: readonly string[]; next: readonly string[] };
  now?(): Date;
}

export interface CommunityHub {
  /** L'écran de la Communauté (Start sur le médaillon), sur l'Accueil ; Exit vers `back` (la roue). */
  openHome(back: () => void): void;
  /** Le même écran, sur un onglet. */
  open(back: () => void, tab: CommunityTab): void;
}

export type CommunityTab = 'home' | 'messages' | 'players' | 'groups' | 'rooms' | 'profile';

/**
 * La liste d'amis d'un joueur : celle de sa carte publique (amis publics), sinon celle qu'il m'a envoyée en
 * ami (amis réservés à ses amis) ; rien s'il les garde privés.
 */
export function theirFriends(net: Pick<SocialNet, 'publicCard' | 'friendsOf'>, key: string): { friendKeys?: readonly string[] } {
  const list = net.publicCard(key)?.friendKeys ?? net.friendsOf(key);
  return list ? { friendKeys: list } : {};
}

/**
 * Qui montrer dans « En ligne » (écran et affiche) : mes amis en ligne, en partie d'abord, puis les
 * joueurs suggérés (suggestPlayers) qui complètent jusqu'à `max` ; `reason` dit pourquoi un joueur est
 * suggéré (absente : un ami). Jamais moi, un ami hors ligne, un joueur bloqué ou dont la demande attend.
 */
export function communityPeople(
  d: { net: Pick<SocialNet, 'state' | 'country' | 'publicCard' | 'friendsOf'>; players: { online(): readonly OnlinePlayer[]; everyone(): readonly OnlinePlayer[] }; levelOf(key: string): number | undefined; myLevel: number },
  max: number,
): { player: OnlinePlayer; reason?: SuggestReason }[] {
  const s = d.net.state();
  const friends = d.players
    .online()
    .filter((p) => p.friend)
    .sort((a, b) => Number(b.status === 'playing') - Number(a.status === 'playing'));
  const out: { player: OnlinePlayer; reason?: SuggestReason }[] = friends.slice(0, max).map((player) => ({ player }));
  const room = max - out.length;
  if (room <= 0) return out;
  const skip = new Set<string>([s.key.publicKey, ...s.friends.map((f) => f.key), ...s.blocked, ...s.incoming.map((r) => r.key)]);
  const list = d.players.everyone();
  const byKey = new Map(list.map((p) => [p.key, p]));
  const country = d.net.country();
  const myFriends = s.friends.map((f) => f.key);
  const picks = suggestPlayers(
    list.map((p) => {
      const level = d.levelOf(p.key);
      const mutual = mutualFriends(myFriends, theirFriends(d.net, p.key)).length;
      return { key: p.key, name: p.name, ...(p.country ? { country: p.country } : {}), ...(level ? { level } : {}), commonTables: p.commonTables ?? 0, online: p.status !== 'offline', ...(p.nearby ? { nearby: true } : {}), ...(mutual ? { mutual } : {}) };
    }),
    { ...(country ? { country } : {}), level: d.myLevel },
    skip,
    room,
  );
  for (const pick of picks) out.push({ player: byKey.get(pick.candidate.key)!, reason: pick.reason });
  return out;
}

/** Ce qu'on dit d'un joueur suggéré, sous son nom. */
export function suggestReasonText(reason: SuggestReason, commonTables: number): string {
  switch (reason) {
    case 'newcomer':
      return t('Nouveau venu');
    case 'mutual':
      return t('Amis en commun');
    case 'nearby':
      return t('Réseau local');
    case 'tables':
      return tn(commonTables, '{n} table en commun', '{n} tables en commun');
    case 'country':
      return t('Même pays');
    case 'level':
      return t('Niveau proche');
    case 'online':
      return t('En ligne');
  }
}

/** Conversations en cartes sur l'accueil (deux côte à côte), et dans l'onglet Messages. */
const HOME_THREADS = 2;
/** Groupes sur l'accueil. */
const HOME_GROUPS = 2;
const TAB_THREADS = 4;
/** Joueurs en cartouches, deux par rangée : cinq et « Tous les joueurs » sur l'accueil, dix dans l'onglet Joueurs. */
const HOME_PEOPLE = 5;
const TAB_PEOPLE = 10;
/** Connectés montrés dans l'onglet Joueurs, en plus de la bande. */
const CONNECTED_SHOWN = 8;
/** Lignes du salon : quatre sur l'accueil, six dans l'onglet Salons. */
const HOME_LINES = 4;
const TAB_LINES = 6;
/** Un exploit d'un ami se félicite pendant trois jours. */
const EXPLOIT_DAYS = 3;

export function createCommunityHub(host: CommunityHubHost): CommunityHub {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const me = () => net.state().key.publicKey;
  const xpText = (n: number) => t('+{n} XP', { n });
  /** Le constat du dernier geste (« Demande envoyée à Inès »), en note du titre de sa section jusqu'au suivant. */
  let said: { section: string; text: string } | undefined;

  // ---------- Joueurs ----------

  function levelOf(key: string): number | undefined {
    if (key === me()) return host.myLevel();
    return shownLevel(net.publicCard(key)?.xp, net.cardFirstSeen(key), now());
  }
  const levelChip = (level: number | undefined): HubLevel | undefined => (level ? { text: t('Niv. {n}', { n: level }), tier: tierOf(level) } : undefined);
  function face(key: string, name: string): AvatarView {
    const level = levelOf(key);
    return { ...avatarView(key, name, net.avatarFile(key)), ...(level ? { level } : {}) };
  }

  /** Ce que fait un ami en ligne, sous son nom : la table entre amis, sinon « En ligne ». */
  function doing(p: OnlinePlayer): string {
    if (p.status !== 'playing') return t('En ligne');
    const table = p.friend ? net.presenceOf(p.key)?.table?.title : undefined;
    return table ? t('Sur {table}', { table }) : t('En partie');
  }

  const reasonText = (reason: SuggestReason, p: OnlinePlayer) => suggestReasonText(reason, p.commonTables ?? 0);

  /** Un ami en ligne en tuile : l'anneau de sa présence, son niveau, ce qu'il fait ; Start ouvre son profil. */
  function friendTile(p: OnlinePlayer, here: () => void): HubCardSpec {
    const lv = levelChip(levelOf(p.key));
    return {
      key: `friend:${p.key}`,
      avatar: face(p.key, p.name),
      ring: p.status === 'playing' ? 'playing' : 'online',
      title: p.name,
      ...(lv ? { level: lv } : {}),
      detail: doing(p),
      ...(p.status === 'playing' ? { tone: 'signal' as const } : {}),
      run: () => host.profile.open(p.key, here),
    };
  }

  /** Tables en médaillons sur une cartouche (22/11/2026). */
  const SHARED_SHOWN = 3;

  /**
   * Les tables en commun d'un joueur, en médaillons : mes favorites d'abord, trois au plus, puis
   * « +2 tables en commun » ; trois ou moins, « en commun ». Aucune : rien.
   */
  function sharedStrip(key: string): { tables?: { title: string; src?: string }[]; tablesNote?: string } {
    const all = host.players.sharedTables(key);
    if (!all.length) return {};
    const shown = all.slice(0, SHARED_SHOWN).map((x) => ({ title: x.title, ...(x.src ? { src: x.src } : {}) }));
    const more = all.length - shown.length;
    return { tables: shown, tablesNote: more ? tn(more, '+{n} table en commun', '+{n} tables en commun') : t('en commun') };
  }
  /** Amis en commun en pastilles sur une cartouche (22/11/2026). */
  const MUTUAL_SHOWN = 3;

  /**
   * Les amis que j'ai en commun avec ce joueur (sa carte publique les cite) : leurs pastilles superposées,
   * trois au plus, et « 4 amis en commun ». Aucun, ou amis cachés par le joueur : rien.
   */
  function mutualStrip(key: string): { mutual?: { avatars: AvatarView[]; note: string } } {
    const s = net.state();
    const keys = mutualFriends(s.friends.map((f) => f.key), theirFriends(net, key));
    if (!keys.length) return {};
    const avatars = keys.slice(0, MUTUAL_SHOWN).map((k) => face(k, s.friends.find((f) => f.key === k)?.name ?? '?'));
    return { mutual: { avatars, note: tn(keys.length, '{n} ami en commun', '{n} amis en commun') } };
  }
  /** Un joueur suggéré en tuile : pourquoi, et « Ajouter » d'un appui (+25 XP à l'amitié acceptée). */
  function suggestedTile(p: OnlinePlayer, reason: SuggestReason, here: () => void, section: string): HubCardSpec {
    const lv = levelChip(levelOf(p.key));
    const sent = net.state().outgoing.some((r) => r.key === p.key);
    const shared = sharedStrip(p.key);
    const friends = mutualStrip(p.key);
    const base = { key: `suggest:${p.key}`, avatar: face(p.key, p.name), ring: 'suggested' as const, title: p.name, ...(lv ? { level: lv } : {}), ...friends, ...shared };
    if (sent) return { ...base, detail: t('Demande envoyée'), run: () => host.profile.open(p.key, here) };
    // Les tables en commun se voient à leurs médaillons : la raison dit autre chose (en ligne, pays…).
    // Les amis en commun aussi se voient à leurs pastilles.
    const shown = (reason === 'tables' && shared.tables) || (reason === 'mutual' && friends.mutual);
    const why = shown ? (p.status === 'offline' ? undefined : t('En ligne')) : reasonText(reason, p);
    return {
      ...base,
      ...(why ? { detail: why } : {}),
      buttons: [
        {
          label: t('Ajouter'),
          key: 'add',
          primary: true,
          run: () => {
            net.request({ key: p.key, name: p.name });
            said = { section, text: t('Demande envoyée à {name}', { name: p.name }) };
            here();
          },
        },
      ],
    };
  }

  /**
   * « En ligne » : mes amis en ligne (en partie d'abord), puis les joueurs suggérés qui complètent la
   * rangée : quand peu de monde est en ligne, ils remplacent les amis, l'écran n'est jamais vide.
   */
  function peopleCards(max: number, here: () => void, section: string): HubCardSpec[] {
    return communityPeople({ net, players: host.players, levelOf, myLevel: host.myLevel() }, max).map((x) => (x.reason ? suggestedTile(x.player, x.reason, here, section) : friendTile(x.player, here)));
  }

  /**
   * « En ligne » : `max` joueurs ; `everyone`, une dernière cartouche « Tous les joueurs » qui ouvre la
   * liste complète (retour du 21/11/2026 : on voyait cinq joueurs sans pouvoir aller voir les autres).
   */
  function peopleSection(max: number, here: () => void, everyone = false): HubSectionSpec | undefined {
    const cards = peopleCards(max, here, 'people');
    if (everyone) {
      const crowd = shownCrowd(host.players.online().length);
      cards.push({
        key: 'everyone',
        icon: 'friends',
        title: t('Tous les joueurs'),
        detail: crowd ? tn(crowd, '{n} joueur en ligne', '{n} joueurs en ligne') : t('La liste complète'),
        run: () => host.players.open(here, 'all'),
      });
    }
    if (!cards.length) return undefined;
    const note = said?.section === 'people' ? said.text : t('{xp} par nouvel ami', { xp: xpText(XP.friend) });
    return { title: t('En ligne'), note, layout: 'people', column: 'left', cards };
  }

  // ---------- Conversations ----------

  /** Une conversation en carte : qui, la bulle du dernier message, trois réponses toutes prêtes, l'ouvrir. */
  function threadCard(x: CommunityThread, here: () => void): HubCardSpec {
    const lv = x.key ? levelChip(levelOf(x.key)) : undefined;
    const icon: IconName = x.kind === 'group' ? 'group' : 'globe';
    const open = { label: x.kind === 'room' ? t('Ouvrir le salon') : t('Ouvrir'), key: 'open', run: () => x.open(here) };
    const replies = x.reply
      ? quickReplies().map((text, i) => ({
          label: text,
          key: `reply:${i}`,
          quick: true,
          run: () => {
            if (x.reply!(text)) {
              said = { section: 'threads', text: t('Envoyé à {name}', { name: x.name }) };
              here();
            } else x.open(here);
          },
        }))
      : [];
    const detail = [x.last ? cap(socialAgo(new Date(x.last.at).toISOString(), now())) : undefined, x.detail].filter(Boolean).join(' · ');
    return {
      key: `thread:${x.kind}:${x.id}`,
      ...(x.key ? { avatar: face(x.key, x.name) } : { icon }),
      title: x.name,
      ...(lv ? { level: lv } : {}),
      ...(x.unread ? { count: x.unread } : {}),
      ...(x.last ? { bubble: { text: x.last.text, ...(x.last.who ? { who: x.last.who } : {}), ...(x.kind !== 'friend' ? { group: true } : {}) } } : {}),
      ...(detail ? { detail } : {}),
      buttons: [...replies, open],
    };
  }
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

  function waitingSection(max: number, here: () => void): HubSectionSpec | undefined {
    const list = host.messages.waiting().slice(0, max);
    if (!list.length) return undefined;
    return { title: t('Ils vous attendent'), ...(said?.section === 'threads' ? { note: said.text } : {}), layout: 'cards', column: 'left', cards: list.map((x) => threadCard(x, here)) };
  }

  // ---------- Salon ----------

  /** Le salon de mon pays, en direct : ses dernières lignes, ses phrases toutes prêtes, l'ouvrir. */
  function roomSection(lines: number, here: () => void): HubSectionSpec {
    const problem = host.room.problem();
    const peek = problem ? undefined : host.room.peek();
    const name = peek?.name ?? t('Salon');
    const open = { label: t('Ouvrir le salon'), key: 'open', run: () => host.room.open(here) };
    if (!peek) return { title: name, layout: 'list', column: 'right', cards: [{ key: 'room:off', icon: 'globe', title: t('Salon de votre pays'), detail: problem!, quiet: true }] };
    const phrases = peek.blocked
      ? []
      : peek.phrases.slice(0, 3).map((text, i) => ({
          label: text,
          key: `phrase:${i}`,
          quick: true,
          run: () => {
            const why = host.room.write(text);
            said = { section: 'room', text: why ?? t('Envoyé dans le salon') };
            here();
          },
        }));
    const shown = peek.lines.slice(-lines);
    const note = said?.section === 'room' ? said.text : peek.present ? tn(peek.present, '{n} présent', '{n} présents') : undefined;
    return {
      title: name,
      ...(note ? { note } : {}),
      layout: 'cards',
      column: 'right',
      cards: [
        {
          key: `room:${peek.id}`,
          title: shown.length ? t('En direct') : t('Rien de neuf pour l’instant'),
          ...(shown.length ? { lines: shown } : {}),
          ...(peek.blocked ? { detail: peek.blocked } : {}),
          buttons: [...phrases, open],
        },
      ],
    };
  }

  // ---------- Ça bouge ----------

  /**
   * Ce qui bouge : un nouveau venu à saluer (une ligne dans le salon), l'exploit récent d'un ami à
   * féliciter (un « J'aime » sur son évènement). Rien d'autre : jamais une ligne pour remplir.
   */
  function newsSection(here: () => void): HubSectionSpec | undefined {
    const s = net.state();
    const cards: HubCardSpec[] = [];
    const since = now().getTime() - EXPLOIT_DAYS * 86_400_000;
    const exploits: { key: string; name: string; e: SocialEvent }[] = [];
    for (const f of s.friends)
      for (const e of f.events) if ((e.kind === 'record' || e.kind === 'badge') && Date.parse(e.at) >= since && !net.likedByMe(f.key, e.id)) exploits.push({ key: f.key, name: f.name, e });
    exploits.sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at));
    for (const x of exploits.slice(0, 2)) {
      const lv = levelChip(levelOf(x.key));
      cards.push({
        key: `cheer:${x.e.id}`,
        avatar: face(x.key, x.name),
        name: x.name,
        title: eventText(x.e, badgeLabel),
        ...(lv ? { level: lv } : {}),
        detail: cap(socialAgo(x.e.at, now())),
        buttons: [
          {
            label: t('Féliciter'),
            key: 'cheer',
            primary: true,
            run: () => {
              net.like(x.key, x.e.id, true);
              said = { section: 'news', text: t('{name} a reçu votre « J’aime »', { name: x.name }) };
              here();
            },
          },
        ],
      });
    }
    // Un nouveau venu en ligne, pas encore mon ami : le saluer dans le salon.
    const friends = new Set(s.friends.map((f) => f.key));
    const newcomer = host.players
      .online()
      .find((p) => !friends.has(p.key) && p.key !== me() && (levelOf(p.key) ?? 99) <= 3 && !s.blocked.includes(p.key));
    if (newcomer && !host.room.problem()) {
      const lv = levelChip(levelOf(newcomer.key));
      const blocked = host.room.peek().blocked;
      cards.push({
        key: `welcome:${newcomer.key}`,
        avatar: face(newcomer.key, newcomer.name),
        name: newcomer.name,
        title: t('vient d’arriver'),
        ...(lv ? { level: lv } : {}),
        detail: t('Un mot dans le salon pour l’accueillir'),
        buttons: [
          {
            label: t('Saluer'),
            key: 'welcome',
            primary: true,
            run: () => {
              if (blocked) return host.room.open(here);
              const why = host.room.write(welcomeLine(newcomer.name));
              said = { section: 'news', text: why ?? t('Envoyé dans le salon') };
              here();
            },
          },
        ],
      });
    }
    if (!cards.length) return undefined;
    return { title: t('Ça bouge'), ...(said?.section === 'news' ? { note: said.text } : {}), layout: 'list', column: 'right', cards };
  }

  // ---------- Invitation ----------

  /**
   * « Inviter quelqu'un » : le QR code de la page de téléchargement, à viser au téléphone de la personne
   * invitée ; à son arrivée, elle dira que c'est vous (invitations.ts) et chacun gagne ses XP.
   */
  function openInvite(back: () => void): void {
    const url = downloadPage(language());
    host.library.openCustom(() => ({
      heading: t('Inviter quelqu’un'),
      icon: 'friend-add',
      subheading: t('Faites découvrir Cyber Pinball'),
      remote: { phase: 'offer' as const, qr: qrRows(url), url, title: '', line: '' },
      remoteWording: {
        offer: t('Cyber Pinball sur son téléphone'),
        offerLines: [t('La personne vise ce code avec son téléphone : la page de téléchargement s’ouvre.'), t('À son arrivée, elle dit que c’est vous : {xp} pour vous à sa première partie.', { xp: xpText(XP.invited) }), url.replace(/^https?:\/\//, '')],
      },
      sections: [],
      actions: [{ label: t('Retour'), icon: 'back', run: back }],
      back,
    }));
  }

  function inviteSection(here: () => void, column: 'left' | 'right'): HubSectionSpec {
    const n = host.invite.count();
    return {
      title: t('Faites découvrir Cyber Pinball'),
      layout: 'list',
      column,
      cards: [
        {
          key: 'invite',
          icon: 'friend-add',
          title: n ? tn(n, '{n} personne invitée', '{n} personnes invitées') : t('Invitez un ami à installer Cyber Pinball'),
          detail: t('{xp} par personne invitée, à sa première partie', { xp: xpText(XP.invited) }),
          buttons: [{ label: t('Inviter quelqu’un'), key: 'open', primary: true, run: () => openInvite(here) }],
        },
      ],
    };
  }

  // ---------- Onglets ----------
  // Chaque onglet commence par sa « bande » ; l'accueil montre la bande de chaque onglet, dans leur ordre,
  // en récapitulatif : Start sur l'une ouvre son onglet, le curseur dans la même bande (l'œil n'est pas
  // perdu), Exit ramène à l'accueil sur ce récapitulatif (demande du mainteneur, 21/11/2026).

  /** Messages : les conversations qui attendent ; sinon les plus récentes ; sinon de quoi écrire. */
  function messagesBand(max: number, here: () => void): HubSectionSpec {
    const waiting = waitingSection(max, here);
    if (waiting) return waiting;
    const recent = host.messages.recent(max);
    if (recent.length) return { title: t('Conversations récentes'), layout: 'list', column: 'left', cards: recent.map((x) => recentCard(x, here)) };
    return { title: t('Messages'), layout: 'list', column: 'left', cards: [{ key: 'messages:none', icon: 'message', title: t('Aucun message en attente'), detail: host.messages.detail(), run: () => host.messages.open(here) }] };
  }

  function recentCard(x: CommunityThread, here: () => void): HubCardSpec {
    const lv = x.key ? levelChip(levelOf(x.key)) : undefined;
    return {
      key: `recent:${x.kind}:${x.id}`,
      ...(x.key ? { avatar: face(x.key, x.name) } : { icon: 'group' as const }),
      title: x.name,
      ...(lv ? { level: lv } : {}),
      ...(x.last ? { detail: `${x.last.who ? `<${x.last.who}> ` : ''}${x.last.text}` } : {}),
      ...(x.last ? { aside: socialAgo(new Date(x.last.at).toISOString(), now()) } : {}),
      run: () => x.open(here),
    };
  }

  /** Groupes : les miens, le dernier message de chacun ; aucun : de quoi en créer ou en rejoindre un. */
  function groupsBand(max: number, here: () => void): HubSectionSpec {
    const mine = host.groups.mine();
    const door = host.groups.door();
    if (!mine.length) return { title: t('Mes groupes'), layout: 'list', column: 'left', cards: [{ key: 'groups:none', icon: 'group', title: t('Aucun groupe pour l’instant'), detail: door.detail, ...(door.quiet ? { quiet: true } : {}), run: () => host.groups.open(here) }] };
    return {
      title: t('Mes groupes'),
      layout: 'cards',
      column: 'left',
      cards: mine.slice(0, max).map((x) => ({
        key: `group:${x.id}`,
        icon: 'group' as const,
        title: x.name,
        ...(x.unread ? { count: x.unread } : {}),
        ...(x.last ? { bubble: { text: x.last.text, ...(x.last.who ? { who: x.last.who } : {}), group: true } } : {}),
        ...(x.detail ? { detail: x.detail } : {}),
        run: () => x.open(here),
      })),
    };
  }

  /** Profil : ma carte, mon niveau ; Start ouvre mon profil public. */
  function profileBand(here: () => void): HubSectionSpec {
    const s = net.state();
    const lv = levelChip(host.myLevel());
    return { title: t('Mon profil'), layout: 'cards', column: 'right', cards: [{ key: 'mine', avatar: face(me(), s.name), title: s.name, ...(lv ? { level: lv } : {}), detail: t('Ce que voient les autres joueurs, et qui a aimé votre activité'), run: () => host.profile.openMine(here) }] };
  }

  /** L'accueil : la bande de chaque onglet en récapitulatif, puis ce qui bouge. */
  function homeSections(here: () => void): HubSectionSpec[] {
    const recap = (s: HubSectionSpec | undefined, opens: CommunityTab, column: 'left' | 'right'): HubSectionSpec[] => (s ? [{ ...s, opens, column }] : []);
    const news = newsSection(here);
    return [
      ...recap(messagesBand(HOME_THREADS, here), 'messages', 'left'),
      ...recap(peopleSection(HOME_PEOPLE, here, true), 'players', 'left'),
      ...recap(groupsBand(HOME_GROUPS, here), 'groups', 'left'),
      ...recap(roomSection(HOME_LINES, here), 'rooms', 'right'),
      ...recap(profileBand(here), 'profile', 'right'),
      ...(news ? [news] : []),
    ];
  }

  function messagesSections(here: () => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = [messagesBand(TAB_THREADS, here)];
    const shown = new Set(out[0]!.cards.map((c) => c.key.replace(/^(thread|recent):/, '')));
    const recent = host.messages.recent(6).filter((x) => !shown.has(`${x.kind}:${x.id}`));
    if (recent.length) out.push({ title: t('Conversations récentes'), layout: 'list', column: 'right', cards: recent.map((x) => recentCard(x, here)) });
    out.push({ title: t('Tout voir'), layout: 'list', column: 'right', cards: [], choices: [{ key: 'all', icon: 'message', title: t('Toutes les conversations'), detail: host.messages.detail(), run: () => host.messages.open(here) }] });
    return out;
  }

  function playersSections(here: () => void): HubSectionSpec[] {
    const s = net.state();
    // La bande d'abord, la même que sur l'accueil (+25 XP par nouvel ami, « Tous les joueurs ») ; puis les demandes reçues.
    const out: HubSectionSpec[] = [];
    const people = peopleSection(TAB_PEOPLE, here, true);
    if (people) out.push(people);
    // Tous les connectés, d'un coup d'œil (22/11/2026) : ceux que la bande ne montre pas déjà.
    const shownKeys = new Set((people?.cards ?? []).map((x) => x.key.replace(/^(friend|suggest):/, '')));
    const online = host.players.online();
    const others = online.filter((p) => !shownKeys.has(p.key));
    const crowd = shownCrowd(online.length);
    out.push({
      title: crowd ? tn(crowd, '{n} connecté en ce moment', '{n} connectés en ce moment') : t('Connectés en ce moment'),
      layout: 'people',
      column: 'left',
      cards: others.slice(0, CONNECTED_SHOWN).map((p) => (p.friend ? friendTile(p, here) : suggestedTile(p, 'online', here, 'people'))),
      choices: [{ key: 'connected', icon: 'globe', title: t('Tous les connectés'), detail: others.length > CONNECTED_SHOWN ? tn(others.length - CONNECTED_SHOWN, 'Et {n} autre', 'Et {n} autres') : t('La liste complète, par pays et par tables en commun'), run: () => host.players.open(here, 'all') }],
    });
    if (s.incoming.length)
      out.push({
        title: t('Demandes d’ami'),
        ...(said?.section === 'requests' ? { note: said.text } : {}),
        layout: 'cards',
        column: 'left',
        cards: s.incoming.slice(0, 4).map((r) => {
          const lv = levelChip(levelOf(r.key));
          return {
            key: `request:${r.key}`,
            avatar: face(r.key, r.name),
            title: r.name,
            ...(lv ? { level: lv } : {}),
            detail: t('Demande reçue {ago}', { ago: socialAgo(r.at, now()) }),
            ...mutualStrip(r.key),
            ...sharedStrip(r.key),
            buttons: [
              { label: t('Accepter'), key: 'accept', xp: xpText(XP.friend), primary: true, run: () => { net.accept(r.key); said = { section: 'requests', text: t('{name} est maintenant votre ami', { name: r.name }) }; here(); } },
              { label: t('Son profil'), key: 'profile', run: () => host.profile.open(r.key, here) },
              { label: t('Refuser'), key: 'decline', run: () => { net.decline(r.key); said = { section: 'requests', text: t('Demande de {name} refusée', { name: r.name }) }; here(); } },
            ],
          };
        }),
      });
    out.push(inviteSection(here, 'right'));
    out.push({
      title: t('Tout voir'),
      layout: 'list',
      column: 'right',
      cards: [],
      choices: [
        { key: 'friends', icon: 'friend-list', title: t('Mes amis'), detail: tn(s.friends.length, '{n} ami', '{n} amis'), run: () => host.players.open(here, 'friends') },
        { key: 'find', icon: 'search', title: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), run: () => host.friends.find() },
        { key: 'requests', icon: 'friend-request', title: t('Demandes d’amis'), detail: t('Reçues et envoyées'), run: () => host.friends.requests(here) },
      ],
    });
    return out;
  }

  function groupsSections(here: () => void): HubSectionSpec[] {
    const door = host.groups.door();
    return [
      groupsBand(6, here),
      { title: t('Tout voir'), layout: 'list', column: 'right', cards: [], choices: [{ key: 'all', icon: 'group', title: t('Groupes'), detail: door.detail, ...(door.quiet ? { quiet: true } : {}), run: () => host.groups.open(here) }] },
    ];
  }

  function roomsSections(here: () => void): HubSectionSpec[] {
    const out: HubSectionSpec[] = [{ ...roomSection(TAB_LINES, here), column: 'left' }];
    const peek = host.room.problem() ? undefined : host.room.peek();
    if (peek?.others.length)
      out.push({
        title: t('Autres salons'),
        layout: 'list',
        column: 'right',
        cards: [],
        choices: peek.others.map((r) => ({ key: `room-other:${r.id}`, icon: 'globe' as const, title: r.name, ...(r.present ? { detail: tn(r.present, '{n} présent', '{n} présents') } : {}), run: () => host.room.openRoom(r.id, here) })),
      });
    return out;
  }

  function profileSections(here: () => void): HubSectionSpec[] {
    return [
      { ...profileBand(here), column: 'left' },
      {
        title: t('Pseudo, confidentialité, compte'),
        layout: 'list',
        column: 'right',
        cards: [],
        choices: [
          { key: 'edit', icon: 'edit', title: t('Modifier mon profil'), detail: t('Pseudo, avatar, pays'), run: () => host.library.openSystemGroupFrom('modifier-profil', here) },
          { key: 'privacy', icon: 'eye', title: t('Confidentialité'), detail: t('Profil public, ce que voient les autres'), run: () => host.library.openSystemGroupFrom('confidentialite', here) },
          { key: 'account', icon: 'account', title: t('Mon compte'), detail: t('Protéger, transférer ou supprimer mon compte'), run: () => host.library.openSystemGroupFrom('compte', here) },
        ],
      },
    ];
  }

  const TABS = (): HubTabSpec[] => {
    const s = net.state();
    const waiting = host.messages.waiting();
    return [
      { id: 'home', label: t('Accueil'), icon: 'star' },
      { id: 'messages', label: t('Messages'), icon: 'message', ...(waiting.some((x) => x.kind !== 'group') ? { attention: true } : {}) },
      { id: 'players', label: t('Joueurs'), icon: 'friends', ...(s.incoming.length ? { attention: true } : {}) },
      { id: 'groups', label: t('Groupes'), icon: 'group', ...(host.groups.door().attention ? { attention: true } : {}) },
      { id: 'rooms', label: t('Salons'), icon: 'globe' },
      { id: 'profile', label: t('Profil'), icon: 'account' },
    ];
  };

  /** Sous le titre : qui est en ligne (au-delà de cinq seulement), mes amis en ligne, ce qui attend. */
  function facts(): string[] {
    const online = host.players.online();
    const out: string[] = [];
    const crowd = shownCrowd(online.length);
    if (crowd) out.push(tn(crowd, '{n} en ligne', '{n} en ligne'));
    const friends = online.filter((p) => p.friend).length;
    out.push(friends ? tn(friends, '{n} ami en ligne', '{n} amis en ligne') : t('Aucun ami en ligne'));
    const unread = host.messages.waiting().reduce((n, x) => n + x.unread, 0);
    if (unread) out.push(tn(unread, '{n} message en attente', '{n} messages en attente'));
    return out;
  }

  let back: () => void = () => undefined;
  let last = '';
  const hub = createHubScreen({ library: host.library, zoneKeys: host.zoneKeys, navKeys: host.navKeys }, (tab, reopen): HubSpec => {
    // Un constat ne survit pas au changement d'onglet.
    if (tab !== last) said = undefined;
    last = tab;
    const spec: HubSpec = { heading: t('Communauté'), icon: 'friends', medallion: 'communaute', title: t('COMMUNAUTÉ'), facts: facts(), tabs: TABS(), sections: [] };
    if (!net.state().enabled)
      return { ...spec, sections: [], empty: { title: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Le réactiver : Menu système › Communauté › Réglages de la communauté › Partage et réseau') } };
    // Hors Accueil, une liste parcourue aux flippers, sans blocs (règle du mainteneur, 22/11/2026) : les blocs
    // restent aux récapitulatifs de l'Accueil.
    switch (tab) {
      case 'messages':
        return { ...spec, list: true, sections: messagesSections(reopen) };
      case 'players':
        return { ...spec, list: true, sections: playersSections(reopen) };
      case 'groups':
        return { ...spec, list: true, sections: groupsSections(reopen) };
      case 'rooms':
        return { ...spec, list: true, sections: roomsSections(reopen) };
      case 'profile':
        return { ...spec, list: true, sections: profileSections(reopen) };
      default:
        return { ...spec, sections: homeSections(reopen) };
    }
  }, { menuFirst: true });

  return {
    openHome(to) {
      back = to;
      said = undefined;
      hub.open(back, 'home');
    },
    open(to, tab) {
      back = to;
      said = undefined;
      hub.open(back, tab);
    },
  };
}
