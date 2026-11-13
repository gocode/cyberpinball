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
  locale,
  nearbyPlayers,
  ONLINE_FILTERS,
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
  rooms?: { door(): { label: string; detail: string; attention: boolean; quiet: boolean }; open(back: () => void): void };
  /** Le tableau des scores de la table choisie dans la roue ; undefined : aucune table. */
  rankings?(): { detail: string; open(back: () => void): void } | undefined;
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
        return t('En {country} ({n})', { country: countryLabel(myCountry()) ?? '?', n });
      case 'elsewhere':
        return t('Ailleurs ({n})', { n });
      case 'nearby':
        return t('Sur votre réseau local ({n})', { n });
      case 'tables':
        return t('Le plus de tables en commun ({n})', { n });
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
    const list = players();
    const actions: Action[] = [];
    const sections: Section[] = [];
    const back = playersBack ?? (() => lib.openSystem());
    const here = () => lib.openCustom(buildPlayers);
    const counts = onlineCounts(list, myCountry());
    if (!s.enabled) {
      sections.push({ rows: [{ text: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Le réactiver : Partage et réseau'), icon: 'network', tone: 'quiet' }] });
      actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    } else if (!status.running) {
      sections.push({ rows: [{ text: status.error ? t('Réseau des bornes indisponible : nouvel essai tout seul') : t('Connexion au réseau des bornes…'), icon: 'network', tone: 'quiet' }] });
    }
    const tables = commonTables(host.tables().map(presenceTable), net.rankings().scores);
    const groups = onlineGroups(list, myCountry(), filter);
    for (const g of groups) {
      sections.push({
        title: groupTitle(g),
        kind: 'players',
        rows: g.players.map((p) => {
          const index = actions.push({ label: p.name, key: `player:${p.key}`, icon: p.friend ? 'friend-list' : 'account', run: () => (p.friend ? host.openFriend(p.key, here) : host.openProfile(p.key, here)) }) - 1;
          const state = p.status === 'playing' ? t('En partie') : t('En ligne');
          const extra = closeness(p, tables);
          const flag = p.country ? flagView(p.country, locale()) : undefined;
          return {
            text: p.name,
            avatar: avatar(p.key, p.name),
            ...(flag ? { flag } : {}),
            detail: extra ? `${state} · ${extra}` : state,
            badges: p.friend ? [t('Ami')] : s.outgoing.some((r) => r.key === p.key) ? [t('Demande envoyée')] : [],
            tone: p.friend ? ('ok' as const) : undefined,
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
              : { text: t('Personne en ligne pour l’instant'), detail: t('La liste se remplit à mesure que les bornes se signalent'), icon: 'info', tone: 'quiet' },
        ],
      });
      if (problem) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    }
    // Les onglets (rendus en tête de la liste, pas répétés dans les actions) : leurs actions après
    // celles des joueurs, pour que le curseur arrive sur le premier joueur.
    const tabs = ONLINE_FILTERS.map((f) => {
      const problem = filterProblem(f);
      const action = actions.push({ label: t('Filtre {name}', { name: filterLabel(f) }), key: `filter-${f}`, run: () => ((filter = f), here()) }) - 1;
      return { label: filterLabel(f), count: problem ?? String(counts[f]), current: f === filter, disabled: Boolean(problem), action, ...(f === 'country' && myCountry() ? { flag: flagView(myCountry()!, locale()) } : {}) };
    });
    if (s.enabled) {
      const shown = s.publicPresence !== false;
      actions.push({
        label: shown ? t('Apparaître en ligne pour tous : oui') : t('Apparaître en ligne pour tous : non'),
        detail: shown ? t('« En ligne » ou « En partie », jamais la table ; vos amis voient toujours votre présence') : t('Vous n’apparaissez plus dans cette liste ; vos amis voient toujours votre présence'),
        icon: 'pulse',
        run: () => (net.setPublicPresence(!shown), here()),
      });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Joueurs en ligne'),
      icon: 'friends',
      subheading: countsLine(list),
      lead: t('Un joueur reste affiché jusqu’à 5 minutes après son départ. La table en cours n’est montrée qu’entre amis.'),
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
    lib.openCustom(buildPlayers);
  }

  // ---------- Accueil Communauté ----------

  function buildHome(): Built {
    const s = net.state();
    const list = players();
    const back = homeBack ?? (() => lib.openSystem());
    const here = () => lib.openCustom(buildHome);
    const c = myCountry();
    const rankings = host.rankings?.();
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
        detail: rankings?.detail ?? t('Choisissez une table dans la roue : son tableau des scores, amis, pays et monde'),
        icon: 'trophy',
        ...(rankings ? {} : { tone: 'quiet' as const }),
        run: () => (rankings ? rankings.open(here) : here()),
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
    players: () => onlineGroups(players(), myCountry(), 'all').flatMap((g) => g.players),
  };
}
