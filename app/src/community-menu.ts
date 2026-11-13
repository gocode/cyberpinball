// Communauté (décidée le 12/11/2026) : l'accueil ouvert par le médaillon
// de la roue (quatre portes : Joueurs en ligne, Messages, Salon de mon pays, Classements) et la liste
// « Joueurs en ligne », amis ou non (livepresence.ts).
//
// La liste réunit mes amis en ligne (leur présence entre amis, friendpresence.ts) et les joueurs dont
// le signal public a moins de cinq minutes. Pour un joueur qui n'est pas mon ami, jamais la table en
// cours : « En ligne » ou « En partie », puis ce qui nous rapproche (tables en commun, réseau local).
// MagnaSave passe d'un filtre à l'autre (Tous, Mon pays, À proximité, Mêmes tables) ; Start ouvre son
// profil public, ou la fiche d'un ami.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  avatarView,
  commonTables,
  countryName,
  flagView,
  playerFlag,
  locale,
  nearbyPlayers,
  ONLINE_FILTERS,
  socialAgo,
  onlineCounts,
  onlineGroups,
  presenceTable,
  t,
  tn,
  type OnlineFilter,
  type OnlineGroup,
  type OnlinePlayer,
  type TableEntry,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { RoomGlance } from './rooms-menu';
import type { SocialNet } from './social-net';

export interface CommunityMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  net: SocialNet;
  /** Touches MagnaSave relevées (la gauche d'abord) : le filtre suivant, ou le précédent. */
  zoneKeys(): readonly string[];
  /** Les tables de la borne : « tables en commun » avec les joueurs classés. */
  tables(): readonly TableEntry[];
  openProfile(key: string, back: () => void): void;
  openFriend(key: string, back: () => void): void;
  /** Mes amis (friends-menu.ts) : leur état en une ligne (en ligne, demandes reçues) et la liste, « Retour » vers `back`. */
  friends?: { detail(): string; attention(): boolean; open(back: () => void): void };
  /** La messagerie (chat-menu.ts) : son état en une ligne et sa liste, « Retour » vers `back`. */
  messages: { detail(): string; attention(): boolean; quiet(): boolean; open(back: () => void): void };
  /** Le salon de mon pays (rooms-menu.ts) : ce que dit sa porte, et l'ouvrir. */
  rooms?: { door(): { label: string; detail: string; attention: boolean; quiet: boolean }; glance?(): RoomGlance; open(back: () => void): void };
  /** Les classements de toutes mes tables (rankings-menu.ts) : ce que dit la porte, et les ouvrir. */
  rankings: { detail(): string; open(back: () => void): void };
  /** Partage et réseau (activer le partage, le réseau local, la présence publique). */
  openSharing(back: () => void): void;
  now?(): Date;
}

export interface CommunityMenu {
  /** L'accueil Communauté (médaillon de la roue), son « Retour » vers `back`. */
  openHome(back: () => void): void;
  /** « Joueurs en ligne », son « Retour » vers `back` ; sans lui, le menu système. */
  openPlayers(back?: () => void): void;
  /** Menu système > Amis > Joueurs en ligne. */
  item: ProvidedSystemItem;
  /** Ce que dit le médaillon : joueurs en ligne, ceux de mon pays, mes amis ; quelque chose attend. */
  summary(): { online: number; country: number; friends: number; attention: boolean };
  /** Les joueurs en ligne, amis compris, dans l'ordre de la liste (téléphone). */
  players(): OnlinePlayer[];
  /** L'affiche du médaillon choisi dans la roue (plateau, fronton), comme celle du Juke-box. */
  poster(): CommunityPosterView;
}

/**
 * L'affiche du médaillon Communauté (app/renderer/community.js), textes déjà traduits : la marque,
 * le grand titre, les chiffres, le salon de mon pays et sa dernière ligne, les amis en ligne.
 */
export interface CommunityPosterView {
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

export function createCommunityMenu(host: CommunityMenuHost): CommunityMenu {
  const net = host.net;
  const lib = host.library;
  const now = () => host.now?.() ?? new Date();
  let filter: OnlineFilter = 'all';
  let playersBack: (() => void) | undefined;
  let homeBack: (() => void) | undefined;

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
    return { online: list.length, country: c ? list.filter((p) => p.country === c).length : 0, friends: list.filter((p) => p.friend).length, attention: host.messages.attention() || Boolean(host.rooms?.door().attention) };
  }

  /** « 47 en ligne · 12 en France · 3 amis » */
  function countsLine(list: readonly OnlinePlayer[]): string {
    const c = myCountry();
    const parts = [tn(list.length, '{n} joueur en ligne', '{n} joueurs en ligne')];
    if (c) parts.push(t('{n} en {country}', { n: list.filter((p) => p.country === c).length, country: countryLabel(c)! }));
    const friends = list.filter((p) => p.friend).length;
    parts.push(tn(friends, '{n} ami', '{n} amis'));
    return parts.join(' · ');
  }

  // ---------- Joueurs en ligne ----------

  function filterLabel(f: OnlineFilter): string {
    switch (f) {
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
  function filterProblem(f: OnlineFilter): string | undefined {
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
  function closeness(p: OnlinePlayer, tables: ReadonlyMap<string, readonly string[]>): string | undefined {
    const common = tables.get(p.key) ?? [];
    if (filter === 'tables' && common.length) return tn(common.length, '{n} table : {list}', '{n} tables : {list}', { list: common.slice(0, 3).join(', ') + (common.length > 3 ? '…' : '') });
    if (p.nearby) return t('Sur votre réseau local');
    if (common.length) return tn(common.length, '{n} table en commun', '{n} tables en commun');
    return undefined;
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
    const groups = onlineGroups(list, myCountry(), filter);
    // Les onglets des filtres, rendus en tête de la liste : leurs actions d'abord, dans l'ordre de
    // lecture (de haut en bas), puis les joueurs, puis la colonne des actions.
    const tabs = ONLINE_FILTERS.map((f) => {
      const problem = filterProblem(f);
      const action = actions.push({ label: t('Filtre {name}', { name: filterLabel(f) }), key: `filter-${f}`, run: () => ((filter = f), here()) }) - 1;
      return { label: filterLabel(f), count: problem ?? String(counts[f]), current: f === filter, disabled: Boolean(problem), action, ...(f === 'country' && myCountry() ? { flag: flagView(myCountry()!, locale()) } : {}) };
    });
    for (const g of groups) {
      sections.push({
        title: groupTitle(g),
        kind: 'players',
        rows: g.players.map((p) => {
          const index = actions.push({ label: p.name, key: `player:${p.key}`, icon: p.friend ? 'friend-list' : 'account', run: () => (p.friend ? host.openFriend(p.key, here) : host.openProfile(p.key, here)) }) - 1;
          // Son drapeau devant le nom ; sans pays, le drapeau Cyber Pinball (13/11/2026).
          const flag = playerFlag(p.country, locale());
          // Le nom seul sur sa ligne (13/11/2026 : pas de badges les uns derrière les autres). En ligne :
          // l'anneau vert autour de la pastille (ton « ok », comme dans « Mes amis »). Dessous, ce qu'il
          // fait : en partie (sur quelle table, entre amis), en ligne, ou depuis quand on ne l'a pas vu ;
          // « Ami » seulement hors de la section des amis, et la demande envoyée.
          const table = p.friend && p.status === 'playing' ? net.presenceOf(p.key)?.table?.title : undefined;
          const doing =
            p.status === 'playing' ? (table ? t('En partie sur {table}', { table }) : t('En partie')) : p.status === 'online' ? t('En ligne') : p.seen ? t('Vu {ago}', { ago: socialAgo(p.seen, now()) }) : t('Hors ligne');
          const tie = p.friend ? (g.id === 'friends' ? undefined : t('Ami')) : s.outgoing.some((r) => r.key === p.key) ? t('Demande envoyée') : undefined;
          return {
            text: p.name,
            avatar: avatar(p.key, p.name),
            flag,
            detail: [doing, tie, closeness(p, tables)].filter(Boolean).join(' · '),
            ...(p.status === 'offline' ? {} : { tone: 'ok' as const }),
            action: index,
            pick: true,
          } satisfies Row;
        }),
      });
    }
    if (s.enabled && status.running && !groups.length) {
      const problem = filterProblem(filter);
      sections.push({
        rows: [
          problem
            ? { text: t('{filter} : {reason}', { filter: filterLabel(filter), reason: problem }), detail: filter === 'nearby' ? t('Le réactiver : Partage et réseau') : t('Le choisir : Partage et réseau › Choisir mon pays'), icon: 'info', tone: 'quiet' }
            : list.length
              ? { text: t('Personne pour ce filtre en ce moment'), detail: t('MagnaSave : filtre suivant'), icon: 'info', tone: 'quiet' }
              : { text: t('Aucun joueur connu pour l’instant'), detail: t('La liste se remplit à mesure que les bornes se signalent'), icon: 'info', tone: 'quiet' },
        ],
      });
      if (problem) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    }
    // Partage désactivé : de quoi le réactiver, dans la colonne des actions (après la liste, dans l'ordre de lecture).
    if (!s.enabled) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    if (s.enabled) {
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
      heading: t('Joueurs en ligne'),
      icon: 'friends',
      subheading: countsLine(online),
      lead: t('Tous les joueurs croisés par votre borne, ceux en ligne d’abord. La table en cours n’est montrée qu’entre amis.'),
      tabs,
      sections,
      actions,
      back,
      hint: t('Flippers : choisir · Start : son profil · MagnaSave : filtre suivant · Exit : retour'),
      listHint: t('Flippers : parcourir · Start : son profil · MagnaSave : filtre suivant · Exit : sortir de la liste'),
      keys: (input) => {
        const magna = host.zoneKeys();
        if (!magna.includes(input.code)) return false;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = ONLINE_FILTERS.indexOf(filter);
        filter = ONLINE_FILTERS[(at + dir + ONLINE_FILTERS.length) % ONLINE_FILTERS.length]!;
        here();
        return true;
      },
    };
  }

  function openPlayers(back?: () => void): void {
    playersBack = back;
    filter = 'all';
    // Le curseur sur le premier joueur (juste après les onglets des filtres).
    lib.openCustom(buildPlayers, ONLINE_FILTERS.length);
  }

  // ---------- Accueil Communauté ----------

  function buildHome(): Built {
    const s = net.state();
    const list = players();
    const back = homeBack ?? (() => lib.openSystem());
    const here = () => lib.openCustom(buildHome);
    const c = myCountry();
    const actions: Action[] = [
      {
        label: t('Joueurs en ligne'),
        detail: s.enabled ? countsLine(list) : t('Indisponible : partage désactivé (Partage et réseau)'),
        icon: 'friends',
        ...(s.enabled ? {} : { tone: 'quiet' as const }),
        run: () => openPlayers(here),
      },
      ...(host.friends
        ? [
            {
              label: t('Mes amis'),
              detail: host.friends.detail(),
              icon: 'friend-list' as const,
              ...(host.friends.attention() ? { attention: true } : {}),
              ...(s.enabled ? {} : { tone: 'quiet' as const }),
              run: () => host.friends!.open(here),
            },
          ]
        : []),
      {
        label: t('Messages'),
        detail: host.messages.detail(),
        icon: 'message',
        ...(host.messages.attention() ? { attention: true } : {}),
        ...(host.messages.quiet() ? { tone: 'quiet' as const } : {}),
        run: () => host.messages.open(here),
      },
      (() => {
        const door = host.rooms?.door();
        if (!door) return { label: c ? t('Salon {country}', { country: countryLabel(c)! }) : t('Salons par pays'), detail: t('Les salons de discussion par pays arrivent dans une prochaine version'), icon: 'globe' as const, tone: 'quiet' as const, run: here };
        return { label: door.label, detail: door.detail, icon: 'globe' as const, ...(door.attention ? { attention: true } : {}), ...(door.quiet ? { tone: 'quiet' as const } : {}), run: () => host.rooms!.open(here) };
      })(),
      {
        label: t('Classements'),
        detail: host.rankings.detail(),
        icon: 'trophy',
        run: () => host.rankings.open(here),
      },
      { label: t('Retour'), icon: 'back', run: back },
    ];
    return {
      heading: t('Communauté'),
      icon: 'friends',
      subheading: s.enabled ? countsLine(list) : t('Partage désactivé'),
      lead: t('Ce que voient les autres joueurs : votre pseudo, votre pays, « En ligne » ou « En partie ». Table en cours, bibliothèque et messages : entre amis seulement.'),
      sections: [],
      actions,
      back,
    };
  }

  /** Amis en ligne nommés au plus sur l'affiche ; au-delà, « +2 ». */
  const POSTER_FRIENDS = 3;

  function poster(): CommunityPosterView {
    const frame = { edition: t('Le flipper se joue à plusieurs'), label: t('Votre borne. Vos joueurs.'), title: t('COMMUNAUTÉ'), tagline: t('Joueurs, salons, classements.'), start: t('Start'), open: t('Ouvrir la Communauté') };
    if (!net.state().enabled)
      return { ...frame, stats: t('Le réseau des bornes vous attend.'), empty: true, eyebrow: t('Pour commencer'), heading: t('Activez le partage'), detail: t('Menu système › Amis › Partage et réseau') };
    const list = players();
    const room = host.rooms?.glance?.();
    const friends = list.filter((p) => p.friend);
    const named = friends.slice(0, POSTER_FRIENDS).map((p) => p.name);
    const more = friends.length - named.length;
    const detail = friends.length
      ? t('Amis en ligne : {names}', { names: [...named, ...(more ? [`+${more}`] : [])].join(', ') })
      : host.messages.attention()
        ? host.messages.detail()
        : t('Joueurs en ligne, messages, salon, classements');
    const eyebrow = room ? (room.problem ? room.name : `${room.name} · ${tn(room.present, '{n} présent', '{n} présents')}`) : t('Joueurs en ligne');
    const heading = room?.problem ?? (room?.last ? `<${room.last.name}> ${room.last.text}` : room ? t('Rien de neuf pour l’instant') : t('Start pour ouvrir la Communauté'));
    return { ...frame, stats: countsLine(list), empty: false, eyebrow, heading, detail };
  }

  function openHome(back: () => void): void {
    homeBack = back;
    lib.openCustom(buildHome);
  }

  return {
    openHome,
    openPlayers,
    item: {
      get detail() {
        const s = net.state();
        if (!s.enabled) return t('Indisponible : partage désactivé (Partage et réseau)');
        return countsLine(players());
      },
      get tone() {
        return net.state().enabled ? undefined : ('quiet' as const);
      },
      run: () => openPlayers(),
    },
    summary,
    poster,
    players: () => onlineGroups(players(), myCountry(), 'all').flatMap((g) => g.players),
  };
}
