// Menu système > Amis : le réseau des bornes à l'écran (social.ts, social-net.ts). « Mes amis »
// (en ligne, en partie et sur quelle table, dernier évènement), « Historique des parties » (les
// parties entre amis finies sur cette borne : game-history-menu.ts), « Trouver un joueur » (l'annuaire :
// chercher un nom, les bornes à proximité sur le réseau local), « Demandes d'amis » (reçues à
// valider, envoyées en attente), « Mes badges », « Partage et réseau » (activé par défaut, nom,
// réseau local, bibliothèque partagée, pare-feu de Windows, ce que voient les autres, joueurs
// bloqués). La fiche d'un ami mène à sa bibliothèque (friend-library-menu.ts) et à la partie en
// direct (live-game-menu.ts).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  BADGES,
  badgeDefinition,
  badgeLabel,
  displayName,
  eventText,
  nearbyPlayers,
  NAME_MAX,
  NAME_MIN,
  playDuration,
  presenceTableLabel,
  relationOf,
  searchDirectory,
  socialAgo,
  t,
  tn,
  type DirectoryEntry,
  type Friend,
  type FriendRequest,
  type MediaOriginDraft,
  type MediaType,
  type TableContents,
  type TableEntry,
  type TableIdentity,
  type Presence,
  type Relation,
  type SocialEvent,
} from '@cyberpinball/core';
import type { FirewallRule } from './firewall-rule';
import type { FriendContent } from './friend-content';
import { createFriendLibraryMenu, type FriendDownloads } from './friend-library-menu';
import { createGameHistoryMenu } from './game-history-menu';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import type { LiveGames } from './live-game';
import { createLiveMenu, type LiveMenu } from './live-game-menu';
import type { SocialNet } from './social-net';

export interface FriendsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    /** Cet écran décrit est affiché (une réception qui finit sous les yeux de l'utilisateur). */
    isShowing(build: () => Built): boolean;
    openSystem(): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
    openMediasWith(table: TableEntry, files: readonly { type: MediaType; file: string; page?: number }[], origin: MediaOriginDraft, notice: string): void;
    /** Le jeu dans le catalogue (par son identifiant VPS, sinon une recherche de son titre). */
    catalogFor(identity: TableIdentity): void;
    /** Dossier d'une table reçue d'un ami : le plan d'ajout, vers `table` quand on l'a déjà. */
    installReceived(dir: string, table?: TableEntry, back?: () => void): void;
  };
  /** Inventaire du dossier d'une de mes tables (ses parties). */
  contents?(table: TableEntry): TableContents | undefined;
  /** Place libre du lecteur des données, en octets. */
  freeSpace?(): number | undefined;
  net: SocialNet;
  firewall: FirewallRule;
  content: FriendContent;
  /** Gestionnaire de téléchargements : chaque réception d'un ami y passe (friend-library-menu.ts). */
  downloads: FriendDownloads;
  games: LiveGames;
  tables(): readonly TableEntry[];
  romsOf?(table: TableEntry): readonly string[];
  root(): string | undefined;
  /** Une progression a avancé : redessiner l'écran. */
  redraw(): void;
  now?(): Date;
}

export interface FriendsMenu {
  /** Partie en direct : invitations, salon, départ et résultats (le menu les ouvre de lui-même). */
  live: LiveMenu;
  items: {
    friends: ProvidedSystemItem;
    'game-history': ProvidedSystemItem;
    'find-player': ProvidedSystemItem;
    'friend-requests': ProvidedSystemItem;
    badges: ProvidedSystemItem;
    sharing: ProvidedSystemItem;
  };
}

/** Joueurs « vus récemment » montrés sans recherche. */
const RECENT_SHOWN = 8;
/** Résultats montrés pour une recherche. */
const RESULTS_SHOWN = 30;

export function createFriendsMenu(host: FriendsMenuHost): FriendsMenu {
  const now = () => host.now?.() ?? new Date();
  const net = host.net;
  const back = () => host.library.openSystem();
  const backAction = (run = back): Action => ({ label: t('Retour'), icon: 'back', run });
  /** Constat de la dernière action (« Demande envoyée à … »), en tête de l'écran suivant. */
  let flash: Row | undefined;
  const takeFlash = (): Section[] => {
    const row = flash;
    flash = undefined;
    return row ? [{ rows: [row] }] : [];
  };

  const name = (key: string, plain: string) => displayName(plain, key);
  const live = createLiveMenu({
    library: host.library,
    net,
    games: host.games,
    tables: host.tables,
    friendHas: (key, table) => libraryMenu.has(key, table),
    openFriendTable: (key, identity, back, want) => libraryMenu.openMatching(key, identity, back, want),
    redraw: host.redraw,
    ...(host.now ? { now: host.now } : {}),
  });
  const historyMenu = createGameHistoryMenu({ library: host.library, history: () => host.games.history(), back });
  const libraryMenu = createFriendLibraryMenu({
    library: host.library,
    net,
    content: host.content,
    downloads: host.downloads,
    live,
    tables: host.tables,
    ...(host.romsOf ? { romsOf: host.romsOf } : {}),
    root: host.root,
    redraw: host.redraw,
    ...(host.contents ? { contents: host.contents } : {}),
    ...(host.freeSpace ? { freeSpace: host.freeSpace } : {}),
  });

  /** Rien ne passe : partage désactivé, ou réseau coupé pour les essais. */
  function offRows(): Row[] {
    const status = net.status();
    if (!net.state().enabled) return [{ text: t('Partage désactivé : personne ne vous voit, vous ne voyez personne'), detail: t('Partage et réseau : « Activer le partage »'), tone: 'warning', badges: [t('Désactivé')] }];
    if (status.mode === 'off') return [{ text: t('Réseau coupé pendant les essais sans opérateur'), tone: 'info' }];
    if (status.error) return [{ text: t('Réseau indisponible : {error}', { error: status.error }), tone: 'error', badges: [t('Bloquant')] }];
    return [];
  }

  function presenceText(p: Presence | undefined, online: boolean, friend: Friend): string {
    if (!online) return friend.lastSeen ? t('Vu {ago}', { ago: socialAgo(friend.lastSeen, now()) }) : t('Pas encore vu en ligne');
    if (p?.status === 'playing' && p.table) return t('En partie : {table} · depuis {duration}', { table: presenceTableLabel(p.table), duration: playDuration((now().getTime() - Date.parse(p.since)) / 1000) });
    return t('Dans le menu des tables');
  }

  const lastEvent = (events: readonly SocialEvent[]): Row['note'] | undefined => {
    const e = events[0];
    return e ? { text: `${eventText(e, badgeLabel)} · ${socialAgo(e.at, now())}`, sign: e.kind === 'record' ? '★' : e.kind === 'badge' ? '◆' : '•', tone: e.kind === 'played' ? 'quiet' : 'ok' } : undefined;
  };

  // ---------- Mes amis ----------

  function openFriends(at?: number): void {
    host.library.openCustom(buildFriends, at);
  }

  function buildFriends(): Built {
    const s = net.state();
    const actions: Action[] = [];
    const rows = (list: Friend[]): Row[] =>
      list.map((f) => {
        const online = net.online(f.key);
        const p = net.presenceOf(f.key);
        const index = actions.push({ label: name(f.key, f.name), key: `friend:${f.key}`, icon: 'friend-list', run: () => openFriend(f.key) }) - 1;
        return {
          text: name(f.key, f.name),
          detail: presenceText(p, online, f),
          tone: online ? 'ok' : undefined,
          badges: [online ? (p?.status === 'playing' ? t('En partie') : t('En ligne')) : t('Hors ligne')],
          note: lastEvent(f.events),
          action: index,
          pick: true,
        } satisfies Row;
      });
    const sorted = [...s.friends].sort((a, b) => a.name.localeCompare(b.name));
    const online = sorted.filter((f) => net.online(f.key));
    const offline = sorted.filter((f) => !net.online(f.key));
    const sections: Section[] = [...takeFlash(), ...(offRows().length ? [{ rows: offRows() }] : [])];
    // Une partie en direct ou une invitation en attente : en tête.
    const pending = live.pendingAction(() => openFriends());
    if (pending) actions.push(pending);
    if (!s.friends.length) sections.push({ rows: [{ text: t('Pas encore d’ami'), detail: t('« Trouver un joueur » : cherchez un nom dans l’annuaire, ou une borne de votre réseau local'), tone: 'info' }] });
    if (online.length) sections.push({ title: t('En ligne ({n})', { n: online.length }), rows: rows(online) });
    if (offline.length) sections.push({ title: t('Hors ligne ({n})', { n: offline.length }), rows: rows(offline) });
    if (s.incoming.length) actions.push({ label: t('Demandes reçues ({n})', { n: s.incoming.length }), detail: tn(s.incoming.length, '{n} à valider', '{n} à valider'), icon: 'friend-request', attention: true, run: () => openRequests() });
    actions.push({ label: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), icon: 'friend-add', run: () => openFind() });
    actions.push(backAction());
    return { heading: t('Mes amis'), icon: 'friend-list', subheading: sharingSubheading(), sections, actions, back };
  }

  function sharingSubheading(): string {
    const s = net.state();
    return t('{name} · {count}', { name: name(s.key.publicKey, s.name), count: tn(s.friends.length, '{n} ami', '{n} amis') });
  }

  // ---------- Fiche d'un ami ----------

  function openFriend(key: string): void {
    host.library.openCustom(() => buildFriend(key), Number.MAX_SAFE_INTEGER);
  }

  function buildFriend(key: string): Built {
    const f = net.state().friends.find((x) => x.key === key);
    const up = () => openFriends();
    if (!f) return { heading: t('Mes amis'), icon: 'friend-list', sections: [{ rows: [{ text: t('N’est plus dans vos amis'), tone: 'info' }] }], actions: [backAction(up)], back: up };
    const online = net.online(key);
    const p = net.presenceOf(key);
    const libraryState = host.content.library(key).state;
    const events: Row[] = f.events.slice(0, 12).map((e) => ({ text: eventText(e, badgeLabel), detail: socialAgo(e.at, now()), icon: e.kind === 'badge' ? (badgeDefinition(e.badge!)?.icon ?? 'medal') : e.kind === 'record' ? 'star' : 'play', tone: e.kind === 'played' ? 'quiet' : 'ok' }));
    return {
      heading: name(f.key, f.name),
      icon: 'friend-list',
      subheading: presenceText(p, online, f),
      sections: [
        ...takeFlash(),
        { rows: [{ text: online ? (p?.status === 'playing' ? t('En partie') : t('En ligne')) : t('Hors ligne'), detail: t('Amis depuis le {date}', { date: new Date(f.since).toLocaleDateString() }), tone: online ? 'ok' : 'quiet' }, { text: t('Bibliothèque'), detail: libraryMenu.detail(key), icon: 'tables', tone: libraryState === 'ready' ? 'ok' : 'quiet' }] },
        { title: t('Derniers évènements'), rows: events.length ? events : [{ text: t('Rien encore : ses records, badges et parties s’afficheront ici'), tone: 'quiet' }] },
      ],
      actions: [
        // Toujours là : grisée hors ligne ; en partie, l'ami la reçoit en notification sur sa table.
        live.friendAction(key, () => openFriend(key)),
        { label: t('Voir sa bibliothèque'), detail: libraryMenu.detail(key), icon: 'tables', run: () => libraryMenu.open(key, () => openFriend(key)) },
        { label: t('Retirer de mes amis'), detail: t('Il ne verra plus votre présence, vous ne verrez plus la sienne'), icon: 'close', run: () => confirm(t('Retirer {name} de vos amis ?', { name: f.name }), t('Retirer'), () => { net.remove(key); flash = { text: t('{name} retiré de vos amis', { name: f.name }), tone: 'ok' }; openFriends(); }, () => openFriend(key)) },
        { label: t('Bloquer'), detail: t('Plus de demande, plus de connexion avec sa borne'), icon: 'lock', run: () => confirmBlock(key, f.name, () => openFriend(key), () => openFriends()) },
        backAction(up),
      ],
      back: up,
    };
  }

  function confirm(question: string, yes: string, run: () => void, cancel: () => void): void {
    host.library.openCustom(
      () => ({ heading: question, icon: 'alert', sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }),
      1,
    );
  }

  function confirmBlock(key: string, plain: string, cancel: () => void, after: () => void): void {
    confirm(t('Bloquer {name} ?', { name: plain }), t('Bloquer'), () => {
      net.block(key);
      flash = { text: t('{name} bloqué : « Partage et réseau » le débloque', { name: plain }), tone: 'ok' };
      after();
    }, cancel);
  }

  // ---------- Trouver un joueur ----------

  function openFind(): void {
    host.library.openCustom(buildFind);
  }

  function relationBadge(rel: Relation): string[] {
    switch (rel) {
      case 'friend':
        return [t('Ami')];
      case 'outgoing':
        return [t('Demande envoyée')];
      case 'incoming':
        return [t('Demande reçue')];
      default:
        return [];
    }
  }

  function playerRows(list: readonly DirectoryEntry[], actions: Action[], from: () => void, opts: { nearby?: Set<string> } = {}): Row[] {
    const s = net.state();
    return list.map((d) => {
      const rel = relationOf(s, d.profile.key);
      const index = actions.push({ label: name(d.profile.key, d.profile.name), key: `player:${d.profile.key}`, icon: 'friend-add', run: () => openPlayer(d.profile.key, from) }) - 1;
      return {
        text: name(d.profile.key, d.profile.name),
        detail: opts.nearby?.has(d.profile.key) ? t('Sur votre réseau local') : t('Vu {ago}', { ago: socialAgo(d.seen, now()) }),
        badges: relationBadge(rel),
        tone: rel === 'friend' ? 'ok' : undefined,
        action: index,
        pick: true,
      } satisfies Row;
    });
  }

  function buildFind(): Built {
    const s = net.state();
    const status = net.status();
    const actions: Action[] = [{ label: t('Chercher un nom…'), detail: t('Un nom, ou une partie ; « #A1B2 » pour l’étiquette'), icon: 'search', run: () => askSearch() }];
    const near = nearbyPlayers(s, now());
    const nearKeys = new Set(near.map((d) => d.profile.key));
    const recent = s.directory.filter((d) => !nearKeys.has(d.profile.key) && !s.blocked.includes(d.profile.key)).slice(0, RECENT_SHOWN);
    const sections: Section[] = [
      ...takeFlash(),
      ...(offRows().length ? [{ rows: offRows() }] : []),
      {
        rows: [
          {
            text: tn(s.directory.length, 'Annuaire : {n} joueur connu', 'Annuaire : {n} joueurs connus'),
            ...(status.running ? {} : { detail: t('Pas relié au réseau') }),
            icon: 'network',
            tone: status.running ? 'ok' : 'quiet',
          },
        ],
      },
    ];
    if (s.lan) sections.push({ title: t('À proximité (réseau local)'), rows: near.length ? playerRows(near, actions, openFind, { nearby: nearKeys }) : [{ text: t('Aucune autre borne sur ce réseau pour l’instant'), tone: 'quiet' }] });
    if (recent.length) sections.push({ title: t('Vus récemment'), rows: playerRows(recent, actions, openFind) });
    actions.push(backAction());
    return {
      heading: t('Trouver un joueur'),
      icon: 'friend-add',
      lead: t('Cherchez un nom ou une étiquette, par exemple #A1B2. L’annuaire réunit, sans serveur, les bornes dont le partage est activé.'),
      sections,
      actions,
      back,
    };
  }

  function askSearch(value = ''): void {
    host.library.openPrompt(t('Trouver un joueur'), t('Nom du joueur'), value, (query) => (query && query.trim() ? openResults(query.trim()) : openFind()));
  }

  function openResults(query: string): void {
    host.library.openCustom(() => buildResults(query));
  }

  function buildResults(query: string): Built {
    const s = net.state();
    const found = searchDirectory(s, query);
    const actions: Action[] = [];
    const near = new Set(nearbyPlayers(s, now()).map((d) => d.profile.key));
    const from = () => openResults(query);
    const rows = playerRows(found.slice(0, RESULTS_SHOWN), actions, from, { nearby: near });
    actions.push({ label: t('Chercher un autre nom…'), icon: 'search', run: () => askSearch(query) }, backAction(openFind));
    return {
      heading: t('Résultats'),
      icon: 'friend-add',
      subheading: t('« {query} » · {count}', { query, count: tn(found.length, '{n} joueur', '{n} joueurs') }),
      sections: found.length
        ? [{ rows, ...(found.length > RESULTS_SHOWN ? { more: found.length - RESULTS_SHOWN } : {}) }]
        : [{ rows: [{ text: t('Personne de ce nom dans l’annuaire'), detail: t('L’annuaire ne connaît que les bornes vues depuis le démarrage du partage : réessayez quand votre ami a sa borne allumée'), tone: 'info' }] }],
      actions,
      back: openFind,
    };
  }

  // ---------- Un joueur de l'annuaire ----------

  function openPlayer(key: string, from: () => void): void {
    host.library.openCustom(() => buildPlayer(key, from));
  }

  function buildPlayer(key: string, from: () => void): Built {
    const s = net.state();
    const entry = s.directory.find((d) => d.profile.key === key);
    const request = s.incoming.find((r) => r.key === key) ?? s.outgoing.find((r) => r.key === key);
    const plain = entry?.profile.name ?? request?.name ?? s.friends.find((f) => f.key === key)?.name ?? '?';
    const rel = relationOf(s, key);
    const nearby = nearbyPlayers(s, now()).some((d) => d.profile.key === key);
    const rows: Row[] = [];
    if (entry) rows.push({ text: nearby ? t('Sur votre réseau local') : t('Vu {ago}', { ago: socialAgo(entry.seen, now()) }), tone: nearby ? 'ok' : 'quiet', icon: nearby ? 'network' : 'clock' });
    const actions: Action[] = [];
    if (rel === 'none') actions.push({ label: t('Envoyer une demande d’ami'), detail: t('Il la verra dans « Demandes d’amis » et pourra l’accepter'), icon: 'friend-add', tone: 'ok', run: () => { net.request({ key, name: plain }); flash = { text: t('Demande envoyée à {name}', { name: plain }), detail: net.online(key) ? t('Remise à sa borne') : t('Remise dès que sa borne sera en ligne'), tone: 'ok' }; from(); } });
    if (rel === 'outgoing') {
      rows.push({ text: t('Demande envoyée le {date}', { date: new Date(request!.at).toLocaleDateString() }), detail: net.online(key) ? t('Remise à sa borne : il ne l’a pas encore acceptée') : t('Remise dès que sa borne sera en ligne'), tone: 'info' });
      actions.push({ label: t('Annuler la demande'), icon: 'close', run: () => { net.cancel(key); flash = { text: t('Demande à {name} annulée', { name: plain }), tone: 'ok' }; from(); } });
    }
    if (rel === 'incoming') actions.push(...requestActions(key, plain, from));
    if (rel === 'friend') actions.push({ label: t('Voir sa fiche'), icon: 'friend-list', run: () => openFriend(key) });
    if (rel !== 'self') actions.push({ label: t('Bloquer'), detail: t('Plus de demande, plus de connexion avec sa borne'), icon: 'lock', run: () => confirmBlock(key, plain, () => openPlayer(key, from), from) });
    actions.push(backAction(from));
    return { heading: name(key, plain), icon: rel === 'incoming' ? 'friend-request' : 'friend-add', subheading: rel === 'incoming' ? t('Demande d’amitié reçue') : relationBadge(rel)[0], sections: rows.length ? [{ rows }] : [], actions, back: from };
  }

  function requestActions(key: string, plain: string, after: () => void): Action[] {
    return [
      { label: t('Accepter'), detail: t('Partager votre présence avec ce joueur'), icon: 'check', tone: 'ok', run: () => { net.accept(key); flash = { text: t('{name} est maintenant votre ami', { name: plain }), tone: 'ok' }; after(); } },
      { label: t('Refuser'), detail: t('Nouvelle demande impossible pendant 30 jours'), icon: 'close', run: () => { net.decline(key); flash = { text: t('Demande de {name} refusée', { name: plain }), tone: 'ok' }; after(); } },
    ];
  }

  // ---------- Demandes d'amis ----------

  function openRequests(): void {
    host.library.openCustom(buildRequests);
  }

  function buildRequests(): Built {
    const s = net.state();
    const actions: Action[] = [];
    const row = (r: FriendRequest, incoming: boolean): Row => {
      const index = actions.push({ label: name(r.key, r.name), key: `request:${r.key}`, icon: incoming ? 'friend-request' : 'friend-add', run: () => openPlayer(r.key, openRequests) }) - 1;
      return {
        text: name(r.key, r.name),
        detail: incoming
          ? r.lan
            ? t('Reçue {ago} · sur votre réseau local', { ago: socialAgo(r.at, now()) })
            : t('Reçue {ago}', { ago: socialAgo(r.at, now()) })
          : net.online(r.key)
            ? t('Remise à sa borne : en attente de sa réponse')
            : t('En attente : remise dès que sa borne sera en ligne'),
        tone: incoming ? 'ok' : 'quiet',
        badges: [incoming ? t('À valider') : t('Envoyée')],
        action: index,
        pick: true,
      };
    };
    const sections: Section[] = [...takeFlash(), ...(offRows().length ? [{ rows: offRows() }] : [])];
    sections.push({ title: t('Reçues'), rows: s.incoming.length ? s.incoming.map((r) => row(r, true)) : [{ text: t('Aucune demande reçue'), tone: 'quiet' }] });
    if (s.outgoing.length) sections.push({ title: t('Envoyées'), rows: s.outgoing.map((r) => row(r, false)) });
    actions.push({ label: t('Trouver un joueur'), icon: 'search', run: () => openFind() }, backAction());
    return { heading: t('Demandes d’amis'), icon: 'friend-request', sections, actions, back };
  }

  // ---------- Mes badges ----------

  function buildBadges(): Built {
    const s = net.state();
    const held = new Map(s.badges.map((b) => [b.id, b]));
    const got = BADGES.filter((b) => held.has(b.id));
    const todo = BADGES.filter((b) => !held.has(b.id));
    return {
      heading: t('Mes badges'),
      icon: 'medal',
      subheading: t('{n} sur {total}', { n: got.length, total: BADGES.length }),
      lead: t('Gagnés sur cette borne à partir des parties et records enregistrés. Visibles par vos amis.'),
      sections: [
        { title: t('Obtenus'), rows: got.length ? got.map((b) => ({ icon: b.icon, text: b.label, detail: t('{detail} · obtenu le {date}', { detail: b.detail, date: new Date(held.get(b.id)!.at).toLocaleDateString() }), tone: 'ok' as const })) : [{ text: t('Aucun pour l’instant : jouez une partie jusqu’au bout'), tone: 'quiet' }] },
        ...(todo.length ? [{ title: t('À obtenir'), rows: todo.map((b) => ({ icon: b.icon, text: b.label, detail: b.detail })) }] : []),
      ],
      actions: [backAction()],
      back,
    };
  }

  // ---------- Partage et réseau ----------

  function openSharing(): void {
    // La sélection d'office sur « Retour » : un Start par mégarde ne coupe pas le partage.
    host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
  }

  function firewallRow(): Row {
    switch (host.firewall.state()) {
      case 'allowed':
        return { text: t('Pare-feu de Windows : Cyber Pinball autorisé'), tone: 'ok', badges: [t('OK')], icon: 'lock' };
      case 'missing':
      case 'other-program':
        return { text: t('Pare-feu de Windows : pas encore autorisé'), detail: t('Les amis par Internet passent quand même ; le réseau local et les bornes qui vous appellent, moins bien'), tone: 'warning', badges: [t('À autoriser')], icon: 'lock' };
      default:
        return { text: t('Pare-feu de Windows : état illisible'), tone: 'warning', badges: [t('À vérifier')], icon: 'lock' };
    }
  }

  function buildSharing(): Built {
    const s = net.state();
    const status = net.status();
    const near = nearbyPlayers(s, now()).length;
    const rows: Row[] = [
      s.enabled ? { text: t('Partage activé'), detail: status.mode === 'off' ? t('Réseau coupé pendant les essais sans opérateur') : status.running ? tn(status.peers, 'Relié à {n} borne', 'Relié à {n} bornes') : status.error ? t('Réseau indisponible : {error}', { error: status.error }) : t('Connexion au réseau…'), tone: 'ok', badges: [t('Activé')], icon: 'network' } : { text: t('Partage désactivé'), detail: t('Personne ne vous voit ; vos amis vous voient hors ligne'), tone: 'warning', badges: [t('Désactivé')], icon: 'network' },
      { text: t('Votre nom : {name}', { name: name(s.key.publicKey, s.name) }), detail: t('Visible dans l’annuaire ; l’étiquette #{tag} vient de la clé de cette borne', { tag: name(s.key.publicKey, '').split('#')[1]! }), icon: 'friend-list' },
      { text: s.lan ? t('Réseau local : activé') : t('Réseau local : désactivé'), detail: s.lan ? tn(near, '{n} borne à proximité', '{n} bornes à proximité') : t('Les bornes de votre réseau ne vous trouvent pas sans Internet'), tone: s.lan ? 'ok' : 'quiet', icon: 'monitor' },
      s.shareLibrary
        ? { text: t('Bibliothèque partagée avec vos amis'), detail: t('Ils voient vos tables et peuvent les récupérer, avec leurs médias'), tone: 'ok', badges: [t('Partagée')], icon: 'tables' }
        : { text: t('Bibliothèque pas partagée'), detail: t('Vos amis ne voient pas vos tables'), tone: 'quiet', icon: 'tables' },
      firewallRow(),
    ];
    const actions: Action[] = [{ label: t('Changer de nom…'), detail: t('{min} à {max} caractères', { min: NAME_MIN, max: NAME_MAX }), icon: 'edit', run: () => askName() }];
    const fw = host.firewall.state();
    if (fw === 'missing' || fw === 'other-program') actions.push({ label: t('Autoriser dans le pare-feu de Windows'), detail: t('Windows demande votre autorisation, une seule fois'), icon: 'lock', run: () => allowFirewall() });
    if (s.blocked.length) actions.push({ label: tn(s.blocked.length, '{n} joueur bloqué', '{n} joueurs bloqués'), icon: 'eye', run: () => openBlocked() });
    actions.push(
      s.shareLibrary
        ? { label: t('Ne plus partager ma bibliothèque'), detail: t('Vos amis ne voient plus vos tables ni vos médias'), icon: 'tables', run: () => { net.setShareLibrary(false); flash = { text: t('Bibliothèque plus partagée'), tone: 'ok' }; host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }
        : { label: t('Partager ma bibliothèque avec mes amis'), detail: t('Vos tables, leurs parties et leurs médias, entre amis seulement'), icon: 'tables', run: () => { net.setShareLibrary(true); flash = { text: t('Bibliothèque partagée avec vos amis'), tone: 'ok' }; host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } },
    );
    actions.push({ label: s.lan ? t('Désactiver le réseau local') : t('Activer le réseau local'), icon: 'monitor', run: async () => { await net.setLan(!s.lan); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } });
    // La coupure en dernier, juste avant « Retour » (sélection d'office).
    actions.push(
      s.enabled
        ? { label: t('Désactiver le partage'), detail: t('Plus de présence, plus d’annuaire ; vos amis restent dans la liste'), icon: 'close', run: async () => { await net.setEnabled(false); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }
        : { label: t('Activer le partage'), detail: t('Présence, annuaire et demandes d’amis'), icon: 'check', tone: 'ok', run: async () => { await net.setEnabled(true); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } },
    );
    actions.push(backAction());
    return {
      heading: t('Partage et réseau'),
      icon: 'network',
      lead: t('Sans serveur : les bornes se trouvent et se parlent directement, par Internet ou sur votre réseau local.'),
      sections: [
        ...takeFlash(),
        { rows },
        {
          title: t('Ce que voient les autres'),
          rows: [
            { text: t('Réseau : votre nom et son étiquette') },
            { text: t('Amis : présence, table en cours, records, badges et parties') },
            ...(s.shareLibrary
              ? [
                  { text: t('Amis : vos tables, leurs parties (fronton, PuP-Pack, sons…) et leurs médias'), detail: t('Une ROM ou un PuP-Pack seulement si votre ami les coche en attestant en avoir le droit : ils sont décochés d’office') },
                  { text: t('Ne partagez que ce que vous avez le droit de partager'), detail: t('Les captures d’œuvres (photos du fronton, prospectus, musique du jeu), les ROM et les PuP-Packs restent la propriété de leurs ayants droit'), tone: 'warning' as const, icon: 'alert' as const },
                ]
              : [{ text: t('Aucun fichier partagé') }]),
            { text: t('Bornes reliées : son adresse IP'), detail: t('Comme dans tout échange de pair à pair') },
          ],
        },
      ],
      actions,
      back,
    };
  }

  function askName(): void {
    host.library.openPrompt(t('Votre nom'), t('Nom du joueur'), net.state().name, (value) => {
      if (value !== undefined && !net.rename(value)) flash = { text: t('Nom refusé : {min} à {max} lettres, chiffres, espaces, tirets ou points', { min: NAME_MIN, max: NAME_MAX }), tone: 'error' };
      else if (value !== undefined) flash = { text: t('Nom changé : vos amis et l’annuaire le reçoivent'), tone: 'ok' };
      host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
    });
  }

  async function allowFirewall(): Promise<void> {
    const r = await host.firewall.allow();
    flash = 'ok' in r ? { text: t('Pare-feu de Windows : Cyber Pinball autorisé'), tone: 'ok' } : 'cancelled' in r ? { text: t('Autorisation refusée : rien n’a changé'), tone: 'warning' } : { text: t('Pare-feu de Windows : {error}', { error: r.error }), tone: 'error' };
    host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
  }

  function openBlocked(): void {
    host.library.openCustom(() => {
      const s = net.state();
      const up = () => host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
      const actions: Action[] = s.blocked.map((key) => ({ label: t('Débloquer {name}', { name: name(key, knownPlain(key)) }), key: `blocked:${key}`, icon: 'unlock', run: () => { net.unblock(key); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }));
      actions.push(backAction(up));
      return { heading: t('Joueurs bloqués'), icon: 'lock', sections: [], actions, back: up };
    });
  }

  const knownPlain = (key: string) => net.state().friends.find((f) => f.key === key)?.name ?? net.state().directory.find((d) => d.profile.key === key)?.profile.name ?? key.slice(0, 8);

  return {
    live,
    items: {
      friends: {
        get detail() {
          const invite = host.games.invites()[0];
          if (invite) return t('Invitation de {name} : {table}', { name: invite.host.name, table: invite.title });
          const online = net.state().friends.filter((f) => net.online(f.key)).length;
          return net.state().friends.length ? tn(online, '{n} en ligne', '{n} en ligne') : t('En ligne, en partie, derniers records');
        },
        get attention() {
          return live.attention();
        },
        run: () => openFriends(),
      },
      'game-history': {
        get detail() {
          return historyMenu.detail();
        },
        run: () => historyMenu.open(),
      },
      'find-player': {
        get detail() {
          return t('Joueurs connus et à proximité');
        },
        run: () => openFind(),
      },
      'friend-requests': {
        get detail() {
          const n = net.state().incoming.length;
          return n ? tn(n, '{n} en attente', '{n} en attente') : t('Reçues et envoyées');
        },
        get attention() {
          return net.state().incoming.length > 0;
        },
        run: () => openRequests(),
      },
      badges: {
        get detail() {
          return t('{n} sur {total}', { n: net.state().badges.length, total: BADGES.length });
        },
        run: () => host.library.openCustom(buildBadges),
      },
      sharing: {
        get detail() {
          return net.state().enabled ? t('Activé · {name}', { name: name(net.state().key.publicKey, net.state().name) }) : t('Désactivé');
        },
        run: () => openSharing(),
      },
    },
  };
}
