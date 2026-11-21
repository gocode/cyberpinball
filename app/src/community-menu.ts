// Communauté (décidée le 12/11/2026) : la rubrique Communauté du Menu système (Mon profil, Joueurs,
// Messages, Groupes et salons, Réglages de la communauté), l'affiche du médaillon de la roue, et
// l'écran « Joueurs » (livepresence.ts). Depuis le 21/11/2026, Start sur le médaillon ouvre l'écran à
// onglets (community-hub.ts) ; la rubrique reste la porte du Menu système, médaillon masqué ou non.
//
// « Joueurs » réunit les anciennes entrées « Mes amis » et « Joueurs en ligne » (21/11/2026) : le
// premier onglet, Amis, montre les demandes reçues en tête puis mes amis, en ligne d'abord ; les
// suivants (Tous, Mon pays, À proximité, Mêmes tables) les joueurs dont le signal public a moins de
// cinq minutes, puis tous ceux que la borne a croisés. Pour un joueur qui n'est pas mon ami, jamais la
// table en cours : « En ligne » ou « En partie », puis ce qui nous rapproche (tables en commun, réseau
// local). MagnaSave passe d'un onglet à l'autre ; Start ouvre son profil, le seul écran d'un joueur.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  shownCrowd,
  avatarView,
  type AvatarView,
  commonTables,
  countryName,
  flagView,
  formatNumber,
  playerFlag,
  locale,
  nearbyPlayers,
  ONLINE_FILTERS,
  roomOfCountry,
  shownLevel,
  tierOf,
  socialAgo,
  onlineCounts,
  onlineGroups,
  presenceTable,
  t,
  tierLabel,
  tn,
  type FlagView,
  type IconName,
  type TierId,
  type LevelView,
  type OnlineFilter,
  type OnlineGroup,
  type OnlinePlayer,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { PlayerStanding } from './rankings-menu';
import { communityPeople, suggestReasonText, type CommunityRoomPeek, type CommunityThread } from './community-hub';
import type { RoomGlance } from './rooms-menu';
import type { SocialNet } from './social-net';
import type { RemotePeople } from './phone-remote';

export interface CommunityMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** La rubrique Communauté ouverte depuis le médaillon (library.ts). */
    openSystemGroupFrom(group: 'amis', back: () => void): void;
    decorateSystemGroup(group: 'amis', decor: () => { subheading?: string; lead?: string }): void;
  };
  net: SocialNet;
  /** Touches MagnaSave relevées (la gauche d'abord) : le filtre suivant, ou le précédent. */
  zoneKeys(): readonly string[];
  /** Les tables de la borne : « tables en commun » avec les joueurs classés. */
  tables(): readonly TableEntry[];
  openProfile(key: string, back: () => void): void;
  /**
   * Mes amis (friends-menu.ts) : leur état en une ligne (en ligne, demandes reçues), « Trouver un
   * joueur », les demandes reçues et envoyées, et la partie en direct qui attend (en tête de l'onglet Amis).
   */
  friends?: { detail(): string; attention(): boolean; find?(): void; requests?(back: () => void): void; pending?(here: () => void): Action | undefined };
  /** L'écran à onglets (community-hub.ts) : ce qu'ouvre le médaillon. */
  hub?: { openHome(back: () => void): void };
  /** La messagerie (chat-menu.ts) : son état en une ligne et sa liste, « Retour » vers `back`. */
  messages: { detail(): string; attention(): boolean; quiet(): boolean; open(back: () => void): void; waiting?(): CommunityThread[] };
  /** Les groupes (groups-menu.ts) : ce que dit leur porte, mes groupes, et les ouvrir. */
  groups?: { door(): { detail: string; attention: boolean; quiet: boolean }; open(back: () => void): void; mine?(): CommunityThread[] };
  /** Le salon de mon pays (rooms-menu.ts) : ce que dit sa porte, ses dernières lignes, et l'ouvrir. */
  rooms?: { door(): { label: string; detail: string; attention: boolean; quiet: boolean }; glance?(): RoomGlance; peek?(): CommunityRoomPeek; problem?(): string | undefined; open(back: () => void): void };
  /** Mon niveau : le rapprochement avec les joueurs suggérés. */
  myLevel?(): number;
  /** Les parties instantanées, ouvertes à tous (instant-menu.ts) : ce que dit la porte, et les ouvrir. */
  instant?: { door(): { label: string; detail: string; quiet: boolean }; open(back: () => void): void };
  /** Les classements de toutes mes tables (rankings-menu.ts) : ce que dit la porte, et les ouvrir. */
  rankings: { detail(): string; open(back: () => void): void; standing?(): PlayerStanding | undefined };
  /** Mon niveau (level-menu.ts) : ce que dit l'entrée, et l'ouvrir. En tête de l'accueil, avec mon avatar. */
  level?: { detail(): string; avatar(): AvatarView; open(back: () => void): void; view?(): LevelView & { week: number } };
  /** Partage et réseau (activer le partage, le réseau local, la présence publique). */
  openSharing(back: () => void): void;
  now?(): Date;
}

export interface CommunityMenu {
  /** L'écran de la Communauté (médaillon de la roue), son « Retour » vers `back`. */
  openHome(back: () => void): void;
  /** « Joueurs », sur l'onglet des amis (sinon `tab`), son « Retour » vers `back` ; sans lui, le menu système. */
  openPlayers(back?: () => void, tab?: PlayersTab): void;
  /** Menu système > Communauté > Joueurs. */
  item: ProvidedSystemItem;
  /** Les autres entrées de l'accueil fournies ici : Mon niveau, Partie instantanée, Groupes, salon du pays, Classements. */
  homeItems: Partial<Record<'my-level' | 'instant' | 'groups' | 'rooms' | 'rankings', ProvidedSystemItem>>;
  /** Ce que dit le médaillon : joueurs en ligne, ceux de mon pays, mes amis ; quelque chose attend. */
  summary(): { online: number; country: number; friends: number; attention: boolean };
  /** Les joueurs en ligne, amis compris, dans l'ordre de la liste (téléphone). */
  players(): OnlinePlayer[];
  /** Tous les joueurs connus de la borne, ceux en ligne d'abord (joueurs suggérés). */
  everyone(): OnlinePlayer[];
  /** « Joueurs » au téléphone : demandes reçues, filtres et groupes de la borne, `max` joueurs au plus par filtre. */
  remotePeople(max: number): RemotePeople;
  /** L'affiche du médaillon choisi dans la roue (plateau, fronton), comme celle du Juke-box. */
  poster(): CommunityPosterView;
}

/**
 * L'affiche du médaillon Communauté (app/renderer/community.js), textes déjà traduits.
 * - Au fronton (mise en page des affiches du Juke-box) : la marque, le grand titre, les chiffres, puis
 *   ce qui attend le plus (le message qu'on m'a écrit, sinon la dernière ligne du salon).
 * - Sur le plateau (planche « Engagement » du 21/11/2026) : le message qui m'attend (qui m'a écrit, sa
 *   bulle), mes amis en ligne avec l'anneau de leur présence et ce qu'ils font (des joueurs suggérés
 *   quand personne n'est là), le salon de mon pays qui défile, l'activité de mes groupes et les demandes
 *   d'ami. Le niveau et les places ne sont plus ici : ils sont sur l'affiche de l'Arène.
 */
/** L'affiche d'un médaillon dans la mise en page de celles du Juke-box (fronton ; plateau des Collections). */
export interface MedallionPosterView {
  edition: string;
  label: string;
  title: string;
  stats: string;
  empty: boolean;
  eyebrow: string;
  heading: string;
  detail?: string;
  tagline: string;
  start: string;
  open: string;
}

export interface CommunityPosterView extends MedallionPosterView {
  /** Le message qui m'attend : qui, quand, sa bulle (« <Bruno> » en tête pour un groupe). */
  said?: { avatar?: AvatarView; icon?: IconName; name: string; when: string; text: string; who?: string; group?: boolean };
  /** Mes amis en ligne (ou des joueurs suggérés) : la pastille et son anneau, le niveau, ce qu'il fait. */
  people: PosterPerson[];
  /** Le salon de mon pays : ses dernières lignes (elles défilent), ou pourquoi il est fermé. */
  room?: { name: string; flag?: FlagView; present?: string; lines: { time: string; nick: string; hue: number; text: string }[]; problem?: string; quiet?: string };
  /** Les groupes et les demandes d'ami, en puces. */
  chips: { icon: IconName; text: string; hot?: boolean }[];
}

export interface PosterPerson {
  avatar: AvatarView;
  name: string;
  level?: { text: string; tier: TierId };
  ring: 'online' | 'playing' | 'suggested';
  status: string;
}

/** Les onglets de « Joueurs » : mes amis d'abord, puis les filtres des joueurs en ligne. */
export type PlayersTab = 'friends' | OnlineFilter;
export const PLAYERS_TABS: readonly PlayersTab[] = ['friends', ...ONLINE_FILTERS];

export function createCommunityMenu(host: CommunityMenuHost): CommunityMenu {
  const net = host.net;
  const lib = host.library;
  const now = () => host.now?.() ?? new Date();
  let filter: PlayersTab = 'friends';
  let playersBack: (() => void) | undefined;

  /** Les joueurs en ligne : mes amis (présence entre amis), puis les signaux publics des autres. */
  function players(): OnlinePlayer[] {
    const s = net.state();
    if (!s.enabled) return [];
    const me = s.key.publicKey;
    const beacons = new Map(net.livePlayers().map((b) => [b.key, b]));
    const near = new Set(nearbyPlayers(s, now()).map((d) => d.profile.key));
    const common = commonTables(host.tables().map(presenceTable), net.rankings().scores);
    const country = (key: string) => beacons.get(key)?.country ?? net.publicCard(key)?.country;
    const out: OnlinePlayer[] = [];
    for (const f of s.friends) {
      const online = net.online(f.key);
      const beacon = beacons.get(f.key);
      if (!online && !beacon) continue;
      const playing = online ? net.presenceOf(f.key)?.status === 'playing' : beacon?.status === 'playing';
      const c = country(f.key);
      out.push({ key: f.key, name: f.name, ...(c ? { country: c } : {}), status: playing ? 'playing' : 'online', friend: true, nearby: near.has(f.key), commonTables: common.get(f.key)?.length ?? 0 });
    }
    const friends = new Set(s.friends.map((f) => f.key));
    for (const b of beacons.values()) {
      if (b.key === me || friends.has(b.key) || s.blocked.includes(b.key)) continue;
      out.push({ key: b.key, name: b.name, ...(b.country ? { country: b.country } : {}), status: b.status, friend: false, nearby: near.has(b.key), commonTables: common.get(b.key)?.length ?? 0 });
    }
    return out;
  }

  /**
   * Tous les joueurs connus de la borne (13/11/2026 : il y a encore peu de monde en ligne) : ceux en
   * ligne (players), puis mes amis hors ligne, l'annuaire du réseau et les joueurs des classements,
   * chacun avec la dernière fois qu'il a été vu. Jamais moi ni un joueur bloqué.
   */
  function everyone(): OnlinePlayer[] {
    const s = net.state();
    if (!s.enabled) return [];
    const online = players();
    const me = s.key.publicKey;
    const out = new Map<string, OnlinePlayer>(online.map((p) => [p.key, p]));
    const near = new Set(nearbyPlayers(s, now()).map((d) => d.profile.key));
    const common = commonTables(host.tables().map(presenceTable), net.rankings().scores);
    // Le pays et la dernière date connus par les classements (le score le plus récent de chacun).
    const ranked = new Map<string, { name: string; country?: string; at: string }>();
    for (const sc of net.rankings().scores) {
      const had = ranked.get(sc.key);
      if (!had || Date.parse(sc.at) > Date.parse(had.at)) ranked.set(sc.key, { name: sc.name, ...(sc.country ? { country: sc.country } : {}), at: sc.at });
    }
    const later = (a: string | undefined, b: string | undefined) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);
    const add = (key: string, name: string, seen: string | undefined, friend: boolean) => {
      if (key === me || s.blocked.includes(key)) return;
      const had = out.get(key);
      if (had) {
        if (had.status === 'offline') {
          const at = later(had.seen, seen);
          if (at) had.seen = at;
        }
        return;
      }
      const country = net.publicCard(key)?.country ?? ranked.get(key)?.country;
      out.set(key, { key, name, ...(country ? { country } : {}), status: 'offline', ...(seen ? { seen } : {}), friend, nearby: near.has(key), commonTables: common.get(key)?.length ?? 0 });
    };
    for (const f of s.friends) add(f.key, f.name, f.lastSeen, true);
    for (const d of s.directory) add(d.profile.key, d.profile.name, d.seen, false);
    for (const [key, r] of ranked) add(key, r.name, r.at, false);
    return [...out.values()];
  }

  const myCountry = () => net.country();
  const avatar = (key: string, name: string) => avatarView(key, name, net.avatarFile(key));
  const countryLabel = (code: string | undefined) => (code ? countryName(code, locale()) : undefined);

  function summary(): ReturnType<CommunityMenu['summary']> {
    const list = players();
    const c = myCountry();
    return { online: list.length, country: c ? list.filter((p) => p.country === c).length : 0, friends: list.filter((p) => p.friend).length, attention: host.messages.attention() || Boolean(host.rooms?.door().attention) || Boolean(host.groups?.door().attention) };
  }

  /**
   * « 47 en ligne · 12 en France · 3 amis ». Les joueurs en ligne et ceux de mon pays ne se comptent
   * qu'au-delà de cinq (shownCrowd, 16/11/2026) ; mes amis en ligne, toujours quand il y en a.
   */
  function countsLine(list: readonly OnlinePlayer[]): string {
    const c = myCountry();
    const parts: string[] = [];
    const all = shownCrowd(list.length);
    if (all) parts.push(tn(all, '{n} joueur en ligne', '{n} joueurs en ligne'));
    const mine = c ? shownCrowd(list.filter((p) => p.country === c).length) : undefined;
    if (mine) parts.push(t('{n} en {country}', { n: mine, country: countryLabel(c)! }));
    const friends = list.filter((p) => p.friend).length;
    if (friends || parts.length) parts.push(tn(friends, '{n} ami', '{n} amis'));
    return parts.length ? parts.join(' · ') : t('Joueurs, amis et salons du réseau des bornes');
  }

  // ---------- Joueurs en ligne ----------

  function filterLabel(f: PlayersTab): string {
    switch (f) {
      case 'friends':
        return t('Amis');
      case 'all':
        return t('Tous');
      case 'country':
        return t('Mon pays');
      case 'nearby':
        return t('À proximité');
      case 'tables':
        return t('Mêmes tables');
    }
  }

  /** Pourquoi un filtre ne peut rien montrer (grisé, avec sa raison) ; undefined : il marche. */
  function filterProblem(f: PlayersTab): string | undefined {
    if (f === 'nearby' && !net.state().lan) return t('Réseau local coupé');
    if (f === 'country' && !myCountry()) return t('Pays non choisi');
    return undefined;
  }

  function groupTitle(g: OnlineGroup): string {
    const n = g.players.length;
    switch (g.id) {
      case 'friends':
        return t('Amis en ligne ({n})', { n });
      case 'country':
        return t('En ligne en {country} ({n})', { country: countryLabel(myCountry()) ?? '?', n });
      case 'elsewhere':
        return t('En ligne ailleurs ({n})', { n });
      case 'nearby':
        return t('Sur votre réseau local ({n})', { n });
      case 'tables':
        return t('Le plus de tables en commun ({n})', { n });
      case 'offline':
        return t('Hors ligne ({n})', { n });
    }
  }

  /** Ce qui rapproche : les tables en commun (nommées dans « Mêmes tables »), le réseau local. */
  function closeness(p: OnlinePlayer, tables: ReadonlyMap<string, readonly string[]>, shown: PlayersTab = filter): string | undefined {
    const common = tables.get(p.key) ?? [];
    if (shown === 'tables' && common.length) return tn(common.length, '{n} table : {list}', '{n} tables : {list}', { list: common.slice(0, 3).join(', ') + (common.length > 3 ? '…' : '') });
    if (p.nearby) return t('Sur votre réseau local');
    if (common.length) return tn(common.length, '{n} table en commun', '{n} tables en commun');
    return undefined;
  }

  /**
   * Ce que fait un joueur, sous son nom (13/11/2026 : le nom seul sur sa ligne, pas de badges les uns
   * derrière les autres) : en partie (sur quelle table, entre amis), en ligne, ou depuis quand on ne
   * l'a pas vu ; « Ami » seulement hors de la section des amis, la demande envoyée, ce qui rapproche.
   * La même ligne à la borne et au téléphone.
   */
  function personDetail(p: OnlinePlayer, group: OnlineGroup['id'], tables: ReadonlyMap<string, readonly string[]>, shown: PlayersTab): string {
    const table = p.friend && p.status === 'playing' ? net.presenceOf(p.key)?.table?.title : undefined;
    const doing =
      p.status === 'playing' ? (table ? t('En partie sur {table}', { table }) : t('En partie')) : p.status === 'online' ? t('En ligne') : p.seen ? t('Vu {ago}', { ago: socialAgo(p.seen, now()) }) : t('Hors ligne');
    const tie = p.friend ? (group === 'friends' ? undefined : t('Ami')) : net.state().outgoing.some((r) => r.key === p.key) ? t('Demande envoyée') : undefined;
    return [doing, tie, closeness(p, tables, shown)].filter(Boolean).join(' · ');
  }

  /**
   * « Joueurs » au téléphone : les demandes d'ami reçues, les filtres de la borne (avec leur nombre, ou
   * pourquoi ils ne montrent rien) et, pour chacun, ses groupes titrés comme ici. Tous les joueurs
   * connus, ceux en ligne d'abord ; au plus `max` par filtre.
   */
  function remotePeople(max: number): RemotePeople {
    const s = net.state();
    const status = net.status();
    const list = everyone();
    const counts = onlineCounts(list, myCountry());
    const tables = commonTables(host.tables().map(presenceTable), net.rankings().scores);
    const flagOf = (code: string | undefined) => playerFlag(code, locale()).src ?? '';
    const card = (key: string) => net.publicCard(key)?.country;
    const groups = Object.fromEntries(
      ONLINE_FILTERS.map((f) => {
        let left = max;
        const shown = onlineGroups(list, myCountry(), f)
          .map((g) => {
            const rows = g.players.slice(0, Math.max(0, left));
            left -= rows.length;
            return {
              title: groupTitle(g),
              rows: rows.map((p) => ({ key: p.key, name: p.name, avatar: avatar(p.key, p.name), flag: flagOf(p.country), detail: personDetail(p, g.id, tables, f), state: p.status })),
            };
          })
          .filter((g) => g.rows.length);
        return [f, shown];
      }),
    );
    const note = !s.enabled ? t('Partage désactivé : personne ne vous voit, vous ne voyez personne') : !status.running ? (status.error ? t('Réseau des bornes indisponible : nouvel essai tout seul') : t('Connexion au réseau des bornes…')) : undefined;
    return {
      requests: s.enabled
        ? s.incoming.map((r) => ({ key: r.key, name: r.name, avatar: avatar(r.key, r.name), flag: flagOf(card(r.key)), detail: t('Demande reçue {ago}', { ago: socialAgo(r.at, now()) }) }))
        : [],
      filters: ONLINE_FILTERS.map((f) => {
        const problem = filterProblem(f);
        const count = shownCrowd(counts[f]);
        return { id: f, label: filterLabel(f), ...(problem ? { count: problem, disabled: true } : count !== undefined ? { count: String(count) } : {}) };
      }),
      groups,
      ...(note ? { note } : {}),
    };
  }

  /**
   * L'onglet Amis de « Joueurs » (21/11/2026 : « Mes amis » et « Joueurs en ligne » réunis) : les
   * demandes reçues en tête, puis mes amis en ligne (en partie d'abord), puis ceux hors ligne. Start
   * ouvre le profil, le seul écran d'un joueur (accepter ou refuser une demande s'y fait).
   */
  function friendSections(list: readonly OnlinePlayer[], actions: Action[], here: () => void, tables: ReadonlyMap<string, readonly string[]>): Section[] {
    const s = net.state();
    const sections: Section[] = [];
    const row = (p: OnlinePlayer, group: OnlineGroup['id']): Row => {
      const index = actions.push({ label: p.name, key: `player:${p.key}`, icon: 'friend-list', run: () => host.openProfile(p.key, here) }) - 1;
      return { text: p.name, avatar: avatar(p.key, p.name), flag: playerFlag(p.country, locale()), detail: personDetail(p, group, tables, 'friends'), ...(p.status === 'offline' ? {} : { tone: 'ok' as const }), action: index, pick: true };
    };
    if (s.incoming.length)
      sections.push({
        title: t('Demandes reçues ({n})', { n: s.incoming.length }),
        kind: 'players',
        rows: s.incoming.map((r) => {
          const index = actions.push({ label: r.name, key: `request:${r.key}`, icon: 'friend-request', attention: true, run: () => host.openProfile(r.key, here) }) - 1;
          const country = net.publicCard(r.key)?.country;
          return { text: r.name, avatar: avatar(r.key, r.name), flag: playerFlag(country, locale()), detail: t('Demande reçue {ago} · Start : accepter ou refuser', { ago: socialAgo(r.at, now()) }), tone: 'ok', action: index, pick: true } satisfies Row;
        }),
      });
    const friends = list.filter((p) => p.friend);
    const on = friends.filter((p) => p.status !== 'offline');
    const off = friends.filter((p) => p.status === 'offline');
    if (on.length) sections.push({ title: t('En ligne ({n})', { n: on.length }), kind: 'players', rows: on.map((p) => row(p, 'friends')) });
    if (off.length) sections.push({ title: t('Hors ligne ({n})', { n: off.length }), kind: 'players', rows: off.map((p) => row(p, 'offline')) });
    if (!friends.length && !s.incoming.length)
      sections.push({ rows: [{ text: t('Pas encore d’ami'), detail: t('« Trouver un joueur » : cherchez un nom dans l’annuaire, ou une borne de votre réseau local'), icon: 'info', tone: 'quiet' }] });
    return sections;
  }

  function buildPlayers(): Built {
    const s = net.state();
    const status = net.status();
    // Tous les joueurs connus, ceux en ligne d'abord ; les chiffres d'en-tête ne comptent que ceux en ligne.
    const list = everyone();
    const online = list.filter((p) => p.status !== 'offline');
    const actions: Action[] = [];
    const sections: Section[] = [];
    const back = playersBack ?? (() => lib.openSystem());
    const here = () => lib.openCustom(buildPlayers);
    const counts = onlineCounts(list, myCountry());
    if (!s.enabled) {
      sections.push({ rows: [{ text: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Le réactiver : Partage et réseau'), icon: 'network', tone: 'quiet' }] });
    } else if (!status.running) {
      sections.push({ rows: [{ text: status.error ? t('Réseau des bornes indisponible : nouvel essai tout seul') : t('Connexion au réseau des bornes…'), icon: 'network', tone: 'quiet' }] });
    }
    const tables = commonTables(host.tables().map(presenceTable), net.rankings().scores);
    // Les onglets, rendus en tête de la liste : leurs actions d'abord, dans l'ordre de lecture (de haut
    // en bas), puis les joueurs, puis la colonne des actions.
    const tabs = PLAYERS_TABS.map((f) => {
      const problem = filterProblem(f);
      const action = actions.push({ label: t('Onglet {name}', { name: filterLabel(f) }), key: `filter-${f}`, run: () => ((filter = f), here()) }) - 1;
      // Mes amis en ligne toujours comptés ; les autres joueurs au-delà de cinq seulement (shownCrowd).
      const count = f === 'friends' ? online.filter((p) => p.friend).length || undefined : shownCrowd(counts[f]);
      return { label: filterLabel(f), count: problem ?? (count === undefined ? '' : String(count)), current: f === filter, disabled: Boolean(problem), action, ...(f === 'country' && myCountry() ? { flag: flagView(myCountry()!, locale()) } : {}) };
    });
    if (filter === 'friends') {
      // Une partie en direct ou une invitation qui attend : en tête, avant les amis.
      const pending = s.enabled ? host.friends?.pending?.(here) : undefined;
      if (pending) actions.push(pending);
      if (s.enabled) sections.push(...friendSections(list, actions, here, tables));
    } else {
      const shownFilter = filter;
      const groups = onlineGroups(list, myCountry(), shownFilter);
      for (const g of groups) {
        sections.push({
          title: groupTitle(g),
          kind: 'players',
          rows: g.players.map((p) => {
            const index = actions.push({ label: p.name, key: `player:${p.key}`, icon: p.friend ? 'friend-list' : 'account', run: () => host.openProfile(p.key, here) }) - 1;
            // Son drapeau devant le nom ; sans pays, le drapeau Cyber Pinball (13/11/2026).
            const flag = playerFlag(p.country, locale());
            return {
              text: p.name,
              avatar: avatar(p.key, p.name),
              flag,
              detail: personDetail(p, g.id, tables, shownFilter),
              ...(p.status === 'offline' ? {} : { tone: 'ok' as const }),
              action: index,
              pick: true,
            } satisfies Row;
          }),
        });
      }
      if (s.enabled && status.running && !groups.length) {
        const problem = filterProblem(shownFilter);
        sections.push({
          rows: [
            problem
              ? { text: t('{filter} : {reason}', { filter: filterLabel(shownFilter), reason: problem }), detail: shownFilter === 'nearby' ? t('Le réactiver : Partage et réseau') : t('Le choisir : Mon profil › Modifier mon profil › Mon pays'), icon: 'info', tone: 'quiet' }
              : list.length
                ? { text: t('Personne pour ce filtre en ce moment'), detail: t('MagnaSave : onglet suivant'), icon: 'info', tone: 'quiet' }
                : { text: t('Aucun joueur connu pour l’instant'), detail: t('La liste se remplit à mesure que les bornes se signalent'), icon: 'info', tone: 'quiet' },
          ],
        });
        if (problem) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
      }
    }
    // Partage désactivé : de quoi le réactiver, dans la colonne des actions (après la liste, dans l'ordre de lecture).
    if (!s.enabled) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    if (s.enabled) {
      if (host.friends?.find) actions.push({ label: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), icon: 'friend-add', run: () => host.friends!.find!() });
      if (host.friends?.requests)
        actions.push({
          label: t('Demandes d’amis'),
          detail: s.incoming.length ? tn(s.incoming.length, '{n} à valider', '{n} à valider') : t('Reçues et envoyées'),
          icon: 'friend-request',
          ...(s.incoming.length ? { attention: true } : {}),
          run: () => host.friends!.requests!(here),
        });
      const shown = s.publicPresence !== false;
      actions.push({
        label: shown ? t('Apparaître en ligne pour tous : oui') : t('Apparaître en ligne pour tous : non'),
        detail: shown ? t('« En ligne » ou « En partie », jamais la table ; vos amis voient toujours votre présence') : t('Les autres vous voient hors ligne ; vos amis voient toujours votre présence'),
        icon: 'pulse',
        run: () => (net.setPublicPresence(!shown), here()),
      });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Joueurs'),
      icon: 'friends',
      subheading: countsLine(online),
      lead: filter === 'friends' ? t('Vos amis, ceux en ligne d’abord, et les demandes reçues en tête. Start ouvre le profil d’un joueur.') : t('Tous les joueurs croisés par votre borne, ceux en ligne d’abord. La table en cours n’est montrée qu’entre amis.'),
      tabs,
      sections,
      actions,
      back,
      hint: t('Flippers : choisir · Start : son profil · MagnaSave : onglet suivant · Exit : retour'),
      listHint: t('Flippers : parcourir · Start : son profil · MagnaSave : onglet suivant · Exit : sortir de la liste'),
      keys: (input) => {
        const magna = host.zoneKeys();
        if (!magna.includes(input.code)) return false;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = PLAYERS_TABS.indexOf(filter);
        filter = PLAYERS_TABS[(at + dir + PLAYERS_TABS.length) % PLAYERS_TABS.length]!;
        here();
        return true;
      },
    };
  }

  function openPlayers(back?: () => void, tab: PlayersTab = 'friends'): void {
    playersBack = back;
    filter = tab;
    // Le curseur sur le premier joueur (juste après les onglets).
    lib.openCustom(buildPlayers, PLAYERS_TABS.length);
  }

  // ---------- Rubrique Communauté du Menu système ----------
  // La porte du Menu système (systemmenu.ts), toujours là même médaillon masqué ; le médaillon ouvre
  // l'écran à onglets (community-hub.ts, 21/11/2026). Ce module fournit les entrées qui sont à lui, et
  // ce que la rubrique dit en tête (le compte des joueurs, ce que voient les autres). Les écrans ouverts
  // de là reviennent à la rubrique par le menu système (openSystem).

  const toHome = () => lib.openSystem();

  function homeDecor(): { subheading: string; lead: string } {
    const s = net.state();
    return {
      subheading: s.enabled ? countsLine(players()) : t('Partage désactivé'),
      lead: t('Ce que voient les autres joueurs : votre pseudo, votre avatar, votre pays, « En ligne » ou « En partie ». Table en cours, bibliothèque et messages : entre amis seulement.'),
    };
  }
  lib.decorateSystemGroup('amis', homeDecor);

  /** Entrées de l'accueil que ce module fournit (les autres viennent des amis, de la messagerie, de Mon compte). */
  const homeItems: Partial<Record<'my-level' | 'instant' | 'groups' | 'rooms' | 'rankings', ProvidedSystemItem>> = {
    rankings: {
      get detail() {
        return host.rankings.detail();
      },
      run: () => host.rankings.open(toHome),
    },
    rooms: {
      get label() {
        const door = host.rooms?.door();
        if (door) return door.label;
        const c = myCountry();
        return c ? t('Salon {country}', { country: countryLabel(c)! }) : t('Salons par pays');
      },
      get detail() {
        return host.rooms?.door().detail ?? t('Les salons de discussion par pays arrivent dans une prochaine version');
      },
      get attention() {
        return Boolean(host.rooms?.door().attention);
      },
      get tone() {
        return !host.rooms || host.rooms.door().quiet ? ('quiet' as const) : undefined;
      },
      run: () => (host.rooms ? host.rooms.open(toHome) : toHome()),
    },
  };
  if (host.level) {
    const level = host.level;
    homeItems['my-level'] = {
      get detail() {
        return level.detail();
      },
      run: () => level.open(toHome),
    };
  }
  if (host.instant) {
    const instant = host.instant;
    homeItems.instant = {
      get label() {
        return instant.door().label;
      },
      get detail() {
        return instant.door().detail;
      },
      get tone() {
        return instant.door().quiet ? ('quiet' as const) : undefined;
      },
      run: () => instant.open(toHome),
    };
  }
  if (host.groups) {
    const groups = host.groups;
    homeItems.groups = {
      get detail() {
        return groups.door().detail;
      },
      get attention() {
        return groups.door().attention;
      },
      get tone() {
        return groups.door().quiet ? ('quiet' as const) : undefined;
      },
      run: () => groups.open(toHome),
    };
  }

  // ---------- L'affiche ----------

  /** Joueurs montrés au plus sur l'affiche ; lignes du salon qui défilent. */
  const POSTER_PEOPLE = 3;
  const POSTER_LINES = 4;

  /** Le niveau d'un joueur : le mien, ou celui que dit sa carte publique (vraisemblable seulement). */
  function levelOf(key: string): number | undefined {
    if (key === net.state().key.publicKey) return host.myLevel?.();
    return shownLevel(net.publicCard(key)?.xp, net.cardFirstSeen(key), now());
  }
  const face = (key: string, name: string): AvatarView => {
    const level = levelOf(key);
    return { ...avatar(key, name), ...(level ? { level } : {}) };
  };
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

  /** Mes amis en ligne, et ce qu'ils font ; personne : des joueurs suggérés (jamais une affiche vide). */
  function posterPeople(): PosterPerson[] {
    return communityPeople({ net, players: { online: players, everyone }, levelOf, myLevel: host.myLevel?.() ?? 1 }, POSTER_PEOPLE).map(({ player: p, reason }) => {
      const level = levelOf(p.key);
      const table = p.friend && p.status === 'playing' ? net.presenceOf(p.key)?.table?.title : undefined;
      const status = reason ? suggestReasonText(reason, p.commonTables ?? 0) : p.status === 'playing' ? (table ? t('Sur {table}', { table }) : t('En partie')) : t('En ligne');
      return { avatar: face(p.key, p.name), name: p.name, ...(level ? { level: { text: t('Niv. {n}', { n: level }), tier: tierOf(level) } } : {}), ring: reason ? 'suggested' : p.status === 'playing' ? 'playing' : 'online', status };
    });
  }

  function poster(): CommunityPosterView {
    const frame = { edition: t('Le flipper se joue à plusieurs'), label: t('Votre borne. Vos joueurs.'), title: t('COMMUNAUTÉ'), tagline: t('Votre borne. Vos joueurs.'), start: t('Start'), open: t('Ouvrir la Communauté') };
    if (!net.state().enabled)
      return { ...frame, stats: t('Le réseau des bornes vous attend.'), empty: true, eyebrow: t('Pour commencer'), heading: t('Activez le partage'), detail: t('Menu système › Communauté › Réglages de la communauté › Partage et réseau'), people: [], chips: [] };
    const s = net.state();
    const list = players();
    // Le message qui m'attend : la conversation la plus récente où quelque chose attend.
    const waiting = host.messages.waiting?.() ?? [];
    const first = [...waiting].sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0))[0];
    const said: CommunityPosterView['said'] = first?.last
      ? {
          ...(first.key ? { avatar: face(first.key, first.name) } : { icon: first.kind === 'group' ? ('group' as const) : ('globe' as const) }),
          name: first.name,
          when: cap(socialAgo(new Date(first.last.at).toISOString(), now())),
          text: first.last.text,
          ...(first.last.who ? { who: first.last.who } : {}),
          ...(first.kind !== 'friend' ? { group: true } : {}),
        }
      : undefined;
    // Le salon de mon pays : ses dernières lignes, qui défilent.
    const problem = host.rooms?.problem?.();
    const peek = problem ? undefined : host.rooms?.peek?.();
    const c = myCountry();
    const room: CommunityPosterView['room'] = problem
      ? { name: host.rooms?.glance?.().name ?? t('Salon'), lines: [], problem }
      : peek
        ? {
            name: peek.name,
            ...(c && peek.id === roomOfCountry(c) ? { flag: flagView(c, locale()) } : {}),
            ...(peek.present ? { present: tn(peek.present, '{n} présent', '{n} présents') } : {}),
            lines: peek.lines.slice(-POSTER_LINES).map((l) => ({ time: l.time, nick: l.nick, hue: l.hue, text: l.text })),
            ...(peek.lines.length ? {} : { quiet: t('Rien de neuf pour l’instant') }),
          }
        : undefined;
    // Les puces : l'activité de mes groupes (table de la semaine, messages), puis les demandes d'ami.
    const chips: CommunityPosterView['chips'] = [];
    const groups = host.groups?.mine?.() ?? [];
    const busy = groups.find((g) => g.unread) ?? groups.find((g) => g.detail);
    if (busy) chips.push({ icon: 'group', text: busy.unread ? tn(busy.unread, '{group} · {n} message', '{group} · {n} messages', { group: busy.name }) : t('{group} · {detail}', { group: busy.name, detail: busy.detail! }), hot: Boolean(busy.unread) });
    if (s.incoming.length) chips.push({ icon: 'friend-add', text: tn(s.incoming.length, '{n} demande d’ami', '{n} demandes d’ami'), hot: true });
    // Au fronton, une phrase : le message qui attend, sinon la dernière ligne du salon.
    const last = peek?.lines.at(-1);
    const eyebrow = said ? t('{name} vous a écrit · {when}', { name: said.name, when: said.when.toLocaleLowerCase() }) : room ? (room.present ? `${room.name} · ${room.present}` : room.name) : t('Joueurs en ligne');
    const heading = said ? (said.who ? `<${said.who}> ${said.text}` : said.text) : (room?.problem ?? (last ? `<${last.nick}> ${last.text}` : t('Rien de neuf pour l’instant')));
    const friends = list.filter((p) => p.friend);
    const detail = friends.length ? t('Amis en ligne : {names}', { names: friends.slice(0, 3).map((p) => p.name).join(', ') + (friends.length > 3 ? ` +${friends.length - 3}` : '') }) : t('Messages, joueurs, groupes et salons');
    return { ...frame, stats: countsLine(list), empty: false, eyebrow, heading, detail, ...(said ? { said } : {}), people: posterPeople(), ...(room ? { room } : {}), chips };
  }

  /** L'écran de la Communauté, ouvert par le médaillon : ses onglets ; sans eux (essais), la rubrique du Menu système. */
  function openHome(back: () => void): void {
    if (host.hub) host.hub.openHome(back);
    else lib.openSystemGroupFrom('amis', back);
  }

  return {
    openHome,
    openPlayers,
    homeItems,
    item: {
      get detail() {
        const s = net.state();
        if (!s.enabled) return t('Indisponible : partage désactivé (Partage et réseau)');
        return [host.friends?.detail(), countsLine(players())].filter(Boolean).join(' · ');
      },
      get attention() {
        return Boolean(host.friends?.attention() || net.state().incoming.length);
      },
      get tone() {
        return net.state().enabled ? undefined : ('quiet' as const);
      },
      run: () => openPlayers(),
    },
    summary,
    poster,
    players: () => onlineGroups(players(), myCountry(), 'all').flatMap((g) => g.players),
    everyone,
    remotePeople,
  };
}
