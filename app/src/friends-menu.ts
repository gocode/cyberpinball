// Menu système > Communauté : le réseau des bornes à l'écran (social.ts, social-net.ts). « Mes amis »
// (en ligne, en partie et sur quelle table, dernier évènement), « Historique des parties » (les
// parties entre amis finies sur cette borne : game-history-menu.ts), « Trouver un joueur » (l'annuaire :
// chercher un nom, les bornes à proximité sur le réseau local), « Demandes d'amis » (reçues à
// valider, envoyées en attente), « Mes badges », « Partage et réseau » (activé par défaut, nom,
// réseau local, bibliothèque partagée, pare-feu de Windows, ce que voient les autres, joueurs
// bloqués). Un joueur, ami ou non, s'ouvre sur son profil (profile-menu.ts), auquel `playerPart`
// ajoute la relation : la bibliothèque d'un ami (friend-library-menu.ts), la partie en direct
// (live-game-menu.ts), les demandes d'ami.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import {
  avatarView,
  boardKey,
  countryCodes,
  countryName,
  flagView,
  locale,
  BADGES,
  DOWNLOAD_RATE_CHOICES,
  rateLabel,
  badgeDefinition,
  badgeLabel,
  eventText,
  firewallBlocksNetwork,
  firewallProblems,
  nearbyPlayers,
  NAME_MAX,
  NAME_MIN,
  playDuration,
  playerId,
  presenceTableLabel,
  relationOf,
  searchDirectory,
  friendsListLine,
  offlineText,
  socialAgo,
  t,
  tableIdentity,
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
import type { AvatarMenu } from './avatar-menu';
import type { FirewallRule } from './firewall-rule';
import type { FriendContent } from './friend-content';
import { createFriendLibraryMenu, type FriendDownloads } from './friend-library-menu';
import { createGameHistoryMenu } from './game-history-menu';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';
import { askElevation } from './uac-confirm';
import type { LiveGames } from './live-game';
import type { PlayerContext, PlayerHead, PlayerPart } from './profile-menu';
import { createLiveMenu, type LiveMenu } from './live-game-menu';
import type { SocialNet } from './social-net';
import { onGesture } from './gesture-flash';

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
  /** « Mon avatar » (avatar-menu.ts) : ouvert depuis « Partage et réseau » ; absent : l'entrée n'y est pas. */
  avatarMenu?: AvatarMenu;
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
  /** La messagerie (chat-menu.ts) : « Écrire » sur la fiche d'un ami, ouvre son fil. */
  chat?: { openThread(key: string, back: () => void): void; writeDetail(key: string): string };
  /** Le profil d'un joueur (profile-menu.ts) : le seul écran d'un joueur, ami ou non ; `playerPart` y ajoute la relation. */
  profile: { open(key: string, back: () => void): void };
  /**
   * « Joueurs », onglet des amis (community-menu.ts) : depuis le 21/11/2026, « Mes amis » et « Joueurs
   * en ligne » ne font qu'un écran ; « Mes amis » y mène. Absent (essais) : la liste des amis d'ici.
   */
  players?(back?: () => void): void;
  /** Supprimer mon compte (account-delete.ts) ; absent : l'action n'est pas proposée (essais). */
  account?: {
    /** Le service des retours : mes propositions et mes votes. */
    forgetFeedback(): Promise<{ ok: boolean; why?: string }>;
    /** Avis d'oubli, arrêt du réseau et de la messagerie, fichiers effacés. */
    erase(feedback: boolean): Promise<{ feedback: boolean; reached: number; failed: string[] }>;
    /** Redémarrer Cyber Pinball : une clé neuve naît au démarrage. */
    relaunch(): void;
  };
  now?(): Date;
}

export interface FriendsMenu {
  /** Partie en direct : invitations, salon, départ et résultats (le menu les ouvre de lui-même). */
  live: LiveMenu;
  /** L'écran « Pare-feu de Windows » : ce qui manque, pourquoi, et l'autorisation (ouvert après une mise à jour). */
  openFirewall(back?: () => void): void;
  /** « Ajouter une table > Depuis un ami… » : les amis, puis la bibliothèque de celui qu'on choisit, ses tables absentes d'abord. */
  addFromFriend: { detail(): string; open(back: () => void): void };
  /** Le profil d'un ami, son « Retour » vers `back` (Activité récente) ; sans lui, Mes amis. */
  openFriend(key: string, back?: () => void): void;
  /** Ce que la relation ajoute au profil d'un joueur (profile-menu.ts) : présence, bibliothèque, demandes d'ami. */
  playerPart(key: string, name: string, ctx: PlayerContext): PlayerPart;
  /** Les demandes d'amis, leur « Retour » vers `back` ; sans lui, le menu système. */
  openRequests(back?: () => void): void;
  /** « Trouver un joueur » (l'annuaire). */
  openFind(): void;
  /** « Supprimer mon compte » (Menu système > Communauté > Mon profil > Mon compte) : son « Annuler » vers `back`. */
  openDeleteAccount(back: () => void): void;
  /** Historique des parties : le détail d'une partie, s'il la garde (son « Retour » vers `back`). */
  history: { has(id: string): boolean; openGame(id: string, back: () => void): void };
  /**
   * Tables du jour : les amis dont la bibliothèque partagée a cette version exacte (boardKey), et de
   * quoi la récupérer chez chacun (sa table cochée d'office, comme « Récupérer sa version chez … »).
   */
  versionHolders(board: string): { key: string; name: string; fetch(back: () => void): void }[];
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
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));
  const flashSections = (): Section[] => (flash ? [{ rows: [flash] }] : []);

  /**
   * Identifiant unique du joueur, sur sa fiche seulement : jamais accolé à son nom dans les listes,
   * les scores ou les amis. Deux joueurs du même nom s'y départagent ; il se cherche dans l'annuaire.
   */
  const idRow = (key: string): Row => ({ text: t('Identifiant : {id}', { id: playerId(key) }), detail: t('Unique à sa borne : départage deux joueurs du même nom'), icon: 'info', tone: 'quiet' });
  /** Pastille d'un joueur, ami ou non : son avatar s'il en a un et qu'on l'a reçu, sinon ses initiales. */
  const avatar = (key: string, plain: string) => avatarView(key, plain, net.avatarFile(key));
  const live = createLiveMenu({
    library: host.library,
    net,
    games: host.games,
    tables: host.tables,
    friendTables: (key) => libraryMenu.liveView(key),
    identityOf: (table) => tableIdentity(table, host.romsOf?.(table) ?? []),
    openFriendTable: (key, identity, back, want) => libraryMenu.openMatching(key, identity, back, want),
    redraw: host.redraw,
    avatar,
    ...(host.now ? { now: host.now } : {}),
  });
  const historyMenu = createGameHistoryMenu({ library: host.library, history: () => host.games.history(), back, avatar });
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

  /**
   * Réseau local en panne (multidiffusion refusée, aucune carte réseau) : sa raison. Jamais
   * bloquant, Internet continue ; « no-interface » est NO_INTERFACE de social-net.ts.
   */
  function lanProblem(): string | undefined {
    const error = net.status().lanError;
    if (!error) return undefined;
    return error === 'no-interface' ? t('aucune carte réseau connectée') : error;
  }

  /** Rien ne passe : partage désactivé, ou réseau coupé pour les essais. */
  function offRows(): Row[] {
    const status = net.status();
    if (!net.state().enabled) return [{ text: t('Partage désactivé : personne ne te voit, tu ne vois personne'), detail: t('Partage et réseau : « Activer le partage »'), tone: 'warning', badges: [t('Désactivé')] }];
    if (status.mode === 'off') return [{ text: t('Réseau coupé pendant les essais sans opérateur'), tone: 'info' }];
    if (status.error) return [{ text: t('Réseau indisponible : {error}', { error: status.error }), tone: 'error', badges: [t('Bloquant')] }];
    if (firewallBlocked()) return [firewallBlockedRow()];
    return [];
  }

  /** Le pare-feu de Windows gêne le réseau des bornes : la présence des amis le dit, au lieu de « hors ligne ». */
  // Réseau simulé : son pare-feu l'est aussi, il ne bloque rien.
  const firewallBlocked = () => !host.firewall.simulated && net.state().enabled && net.status().mode !== 'off' && firewallBlocksNetwork(host.firewall.state());

  function firewallBlockedRow(): Row {
    const reason = firewallProblems(host.firewall.state(), undefined)[0]?.reason ?? '';
    return { text: t('Réseau des bornes bloqué par le pare-feu de Windows'), detail: t('{reason} · Partage et réseau : « Autoriser dans le pare-feu de Windows »', { reason }), tone: 'error', badges: [t('Bloquant')], icon: 'lock' };
  }

  function presenceText(p: Presence | undefined, online: boolean, friend: Friend): string {
    // Hors ligne : « vu » date la chute de sa dernière liaison ; pendant une recherche, le libellé le dit.
    if (!online) return offlineText(net.listSync(), friend.lastSeen, now());
    if (p?.status === 'playing' && p.table) return t('En partie : {table} · depuis {duration}', { table: presenceTableLabel(p.table), duration: playDuration((now().getTime() - Date.parse(p.since)) / 1000) });
    return t('Dans l’écran des tables');
  }

  /** Par où passe sa présence : « Relié par Internet et le réseau local », ou la tolérance après une liaison tombée. */
  function linksText(key: string): string {
    const via = new Set(net.linksOf(key));
    if (via.has('internet') && via.has('lan')) return t('Relié par Internet et le réseau local');
    if (via.has('lan')) return t('Relié par le réseau local');
    if (via.has('internet')) return t('Relié par Internet');
    return t('Liaison tombée : reconnexion en cours');
  }

  /** Ligne d'état de la liste des amis (friendpresence.ts) ; rien quand rien ne passe (offRows le dit). */
  function listSyncRow(online: number): Row | undefined {
    const line = friendsListLine(net.listSync(), online);
    if (!line) return undefined;
    return { text: line.text, detail: line.detail, tone: line.tone, icon: 'network', ...(line.busy ? { progress: { tone: 'info', busy: true } } : {}) };
  }

  const lastEvent = (events: readonly SocialEvent[]): Row['note'] | undefined => {
    const e = events[0];
    return e ? { text: `${eventText(e, badgeLabel)} · ${socialAgo(e.at, now())}`, sign: e.kind === 'record' ? '★' : e.kind === 'badge' ? '◆' : '•', tone: e.kind === 'played' ? 'quiet' : 'ok' } : undefined;
  };

  // ---------- Mes amis ----------

  function openFriends(at?: number): void {
    if (host.players) return host.players();
    host.library.openCustom(buildFriends, at);
  }

  /** Retour des demandes d'amis ouvertes d'ailleurs ; sans lui, le menu système. */
  let requestsBack: (() => void) | undefined;

  function buildFriends(): Built {
    const s = net.state();
    const actions: Action[] = [];
    const blocked = firewallBlocked();
    const rows = (list: Friend[]): Row[] =>
      list.map((f) => {
        const online = net.online(f.key);
        const p = net.presenceOf(f.key);
        const index = actions.push({ label: f.name, key: `friend:${f.key}`, icon: 'friend-list', run: () => openFriend(f.key) }) - 1;
        return {
          text: f.name,
          avatar: avatar(f.key, f.name),
          detail: !online && blocked ? t('Sa présence ne te parvient pas : le pare-feu de Windows bloque le réseau des bornes') : presenceText(p, online, f),
          tone: online ? 'ok' : undefined,
          badges: [online ? (p?.status === 'playing' ? t('En partie') : t('En ligne')) : blocked ? t('Bloqué par le pare-feu') : t('Hors ligne')],
          note: lastEvent(f.events),
          action: index,
          pick: true,
        } satisfies Row;
      });
    const sorted = [...s.friends].sort((a, b) => a.name.localeCompare(b.name));
    const online = sorted.filter((f) => net.online(f.key));
    const offline = sorted.filter((f) => !net.online(f.key));
    const sections: Section[] = [...flashSections(), ...(offRows().length ? [{ rows: offRows() }] : [])];
    // La liste est-elle sûre ? « Recherche des amis… », « Mise à jour en cours… » ou « Liste à jour ».
    const sync = s.friends.length ? listSyncRow(online.length) : undefined;
    if (sync) sections.push({ rows: [sync] });
    // Une partie en direct ou une invitation en attente : en tête.
    const pending = live.pendingAction(() => openFriends());
    if (pending) actions.push(pending);
    if (!s.friends.length) sections.push({ rows: [{ text: t('Pas encore d’ami'), detail: t('« Trouver un joueur » : cherche un nom dans l’annuaire, ou une borne de ton réseau local'), tone: 'info' }] });
    if (online.length) sections.push({ title: t('En ligne ({n})', { n: online.length }), rows: rows(online) });
    if (offline.length) sections.push({ title: blocked ? t('Injoignables : pare-feu de Windows ({n})', { n: offline.length }) : t('Hors ligne ({n})', { n: offline.length }), rows: rows(offline) });
    if (s.incoming.length) actions.push({ label: t('Demandes reçues ({n})', { n: s.incoming.length }), detail: tn(s.incoming.length, '{n} à valider', '{n} à valider'), icon: 'friend-request', attention: true, run: () => openRequests() });
    actions.push({ label: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), icon: 'friend-add', run: () => openFind() });
    actions.push(backAction());
    return { heading: t('Mes amis'), icon: 'friend-list', subheading: sharingSubheading(), sections, actions, back };
  }

  function sharingSubheading(): string {
    const s = net.state();
    return t('{name} · {count}', { name: s.name, count: tn(s.friends.length, '{n} ami', '{n} amis') });
  }

  // ---------- Ajouter une table : depuis un ami ----------

  /** Amis qui partagent leur bibliothèque et qui ont des tables absentes de la borne : combien. */
  function addFromFriendDetail(): string {
    const friends = net.state().friends;
    if (!friends.length) return t('Pas encore d’ami : Menu système > Communauté > « Joueurs » > « Trouver un joueur »');
    const online = friends.filter((f) => net.online(f.key)).length;
    return online
      ? tn(online, 'Les tables d’un ami, récupérées de sa borne · {n} ami en ligne', 'Les tables d’un ami, récupérées de sa borne · {n} amis en ligne')
      : t('Les tables d’un ami, récupérées de sa borne · aucun ami en ligne');
  }

  function openAddFromFriend(back: () => void, at?: number): void {
    host.library.openCustom(() => buildAddFromFriend(back), at);
  }

  function buildAddFromFriend(back: () => void): Built {
    const blocked = firewallBlocked();
    const actions: Action[] = [];
    const here = () => openAddFromFriend(back, Number.MAX_SAFE_INTEGER);
    // Ceux dont on peut prendre des tables d'abord (en ligne, bibliothèque partagée, des tables absentes),
    // puis les autres en ligne, puis ceux hors ligne : grisés, avec leur raison.
    const view = net.state().friends.map((f) => ({ f, online: net.online(f.key), lib: libraryMenu.addView(f.key) }));
    const rank = (v: (typeof view)[number]) => (!v.online ? 3 : v.lib.absent ? 0 : v.lib.absent === undefined ? 1 : 2);
    view.sort((a, b) => rank(a) - rank(b) || (b.lib.absent ?? 0) - (a.lib.absent ?? 0) || a.f.name.localeCompare(b.f.name));
    const rows: Row[] = view.map(({ f, online, lib }) => {
      const label = f.name;
      if (!online) {
        // Indisponible : grisé, avec sa raison ; Start ne mène nulle part.
        const reason = blocked ? t('Sa borne ne te parvient pas : le pare-feu de Windows bloque le réseau des bornes') : t('Hors ligne : sa bibliothèque se voit quand sa borne est allumée');
        const index = actions.push({ label, key: `add-friend:${f.key}`, icon: 'friend-list', tone: 'quiet', detail: t('Indisponible : {reason}', { reason }), run: () => undefined }) - 1;
        return { text: label, avatar: avatar(f.key, f.name), detail: reason, tone: 'quiet', badges: [blocked ? t('Bloqué par le pare-feu') : t('Hors ligne')], action: index, pick: true } satisfies Row;
      }
      const index = actions.push({ label, key: `add-friend:${f.key}`, icon: 'friend-list', detail: lib.detail, run: () => libraryMenu.open(f.key, here, true) }) - 1;
      return { text: label, avatar: avatar(f.key, f.name), detail: lib.detail, tone: lib.absent ? 'ok' : undefined, badges: lib.absent ? [tn(lib.absent, '{n} à prendre', '{n} à prendre')] : [t('En ligne')], action: index, pick: true } satisfies Row;
    });
    const sections: Section[] = [...(offRows().length ? [{ rows: offRows() }] : [])];
    if (rows.length) sections.push({ rows });
    else sections.push({ rows: [{ text: t('Pas encore d’ami'), detail: t('« Trouver un joueur » : cherche un nom dans l’annuaire, ou une borne de ton réseau local'), tone: 'info' }] });
    if (!rows.length) actions.push({ label: t('Trouver un joueur'), detail: t('Chercher un nom, voir les bornes à proximité'), icon: 'friend-add', run: () => openFind() });
    actions.push(backAction(back));
    return {
      heading: t('Depuis un ami'),
      icon: 'friend-list',
      lead: t('Les tables de tes amis qui partagent leur bibliothèque : choisis un ami, puis une de ses tables absentes de ta borne. Rien n’est installé avant que tu aies validé le plan.'),
      sections,
      actions,
      back,
    };
  }

  // ---------- Un joueur : ce que la relation ajoute à son profil ----------

  /** Le profil d'un ami (profile-menu.ts), son « Retour » vers `back` ; sans lui, Mes amis. */
  function openFriend(key: string, back?: () => void): void {
    openPlayer(key, back ?? (() => openFriends()));
  }

  /** Le profil d'un joueur, ami ou non (profile-menu.ts) : le seul écran d'un joueur, d'où qu'on vienne. */
  function openPlayer(key: string, back: () => void): void {
    host.profile.open(key, back);
  }

  /**
   * Ce que la relation ajoute au profil d'un joueur (17/11/2026 : la fiche d'ami et le profil public
   * faisaient doublon). Un ami : sa présence, sa bibliothèque, ses évènements (parties jouées
   * comprises), l'invitation, « Retirer de mes amis ». Un autre joueur : où on l'a vu, la demande
   * d'ami (envoyer, annuler, accepter, refuser). Toujours : son identifiant.
   */
  function playerPart(key: string, plain: string, ctx: PlayerContext): PlayerPart {
    const s = net.state();
    const id = idRow(key);
    const f = s.friends.find((x) => x.key === key);
    if (f) {
      const online = net.online(key);
      const p = net.presenceOf(key);
      const state = online ? (p?.status === 'playing' ? t('En partie') : t('En ligne')) : t('Hors ligne');
      const playing = online && p?.status === 'playing';
      const status = playing && p?.table
        ? t('En partie sur {table} · depuis {duration}', { table: p.table.title, duration: playDuration((now().getTime() - Date.parse(p.since)) / 1000) })
        : online
          ? playing
            ? t('En partie')
            : t('En ligne')
          : presenceText(p, false, f);
      return {
        head: {
          eyebrow: t('Amis depuis {date}', { date: new Date(f.since).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }) }),
          status: { text: status, tone: online ? 'signal' : 'quiet' },
          ...(online ? { ring: playing ? ('playing' as const) : ('online' as const) } : {}),
          since: t('Amis depuis le {date}', { date: new Date(f.since).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) }),
          library: libraryMenu.detail(key),
        },
        rows: [
          { text: presenceText(p, online, f), detail: [t('Amis depuis le {date}', { date: new Date(f.since).toLocaleDateString() }), online ? linksText(key) : undefined].filter(Boolean).join(' · '), icon: 'friend-list', tone: online ? 'ok' : 'quiet', badges: [state] },
          { text: t('Bibliothèque'), detail: libraryMenu.detail(key), icon: 'tables', tone: host.content.library(key).state === 'ready' ? 'ok' : 'quiet' },
        ],
        id,
        events: f.events,
        actions: [
          // Toujours là : grisée hors ligne ; en partie, l'ami la reçoit en notification sur sa table.
          { ...live.friendAction(key, () => ctx.here()), key: 'invite' },
          { label: t('Voir sa bibliothèque'), key: 'library', detail: libraryMenu.detail(key), icon: 'tables', run: () => libraryMenu.open(key, () => ctx.here()) },
        ],
        tail: [
          {
            label: t('Retirer de mes amis'),
            key: 'unfriend',
            detail: t('Il ne verra plus ta présence, tu ne verras plus la sienne'),
            icon: 'close',
            run: () => confirm(t('Retirer {name} de tes amis ?', { name: f.name }), t('Retirer'), () => { net.remove(key); ctx.flash({ text: t('{name} retiré de tes amis', { name: f.name }), tone: 'ok' }); ctx.here(); }, () => ctx.here()),
          },
        ],
      };
    }
    const rel = relationOf(s, key);
    const rows: Row[] = [];
    const actions: Action[] = [];
    if (rel === 'self') return { rows, id, actions };
    const entry = s.directory.find((d) => d.profile.key === key);
    const nearby = nearbyPlayers(s, now()).some((d) => d.profile.key === key);
    if (entry) rows.push({ text: nearby ? t('Sur ton réseau local') : t('Vu {ago}', { ago: socialAgo(entry.seen, now()) }), tone: nearby ? 'ok' : 'quiet', icon: nearby ? 'network' : 'clock' });
    if (rel === 'none') actions.push({ label: t('Envoyer une demande d’ami'), key: 'request', sends: true, detail: t('Il la verra dans « Demandes d’amis » et pourra l’accepter'), icon: 'friend-add', tone: 'ok', run: () => { net.request({ key, name: plain }); ctx.flash({ text: t('Demande envoyée à {name}', { name: plain }), detail: net.online(key) ? t('Remise à sa borne') : t('Remise dès que sa borne sera en ligne'), tone: 'ok' }); ctx.here(); } });
    const outgoing = s.outgoing.find((r) => r.key === key);
    if (rel === 'outgoing' && outgoing) {
      rows.push({ text: t('Demande envoyée le {date}', { date: new Date(outgoing.at).toLocaleDateString() }), detail: net.online(key) ? t('Remise à sa borne : il ne l’a pas encore acceptée') : t('Remise dès que sa borne sera en ligne'), tone: 'info', icon: 'friend-add' });
      actions.push({ label: t('Annuler la demande'), key: 'cancel-request', icon: 'close', run: () => { net.cancel(key); ctx.flash({ text: t('Demande à {name} annulée', { name: plain }), tone: 'ok' }); ctx.here(); } });
    }
    if (rel === 'incoming') {
      rows.push({ text: t('Demande d’amitié reçue'), tone: 'ok', icon: 'friend-request' });
      actions.push(...requestActions(key, plain, () => ctx.here(), ctx.flash));
    }
    // L'en-tête : sa présence publique (« En ligne », « En partie » : jamais sa table, réservée aux amis), où on l'a vu, la demande en cours.
    const beacon = net.livePlayers().find((b) => b.key === key);
    const incoming = s.incoming.find((r) => r.key === key);
    const head: PlayerHead = {
      ...(beacon ? { ring: beacon.status === 'playing' ? ('playing' as const) : ('online' as const), status: { text: beacon.status === 'playing' ? t('En partie') : t('En ligne'), tone: 'signal' as const } } : entry ? { status: { text: nearby ? t('Sur ton réseau local') : t('Vu {ago}', { ago: socialAgo(entry.seen, now()) }), tone: 'quiet' as const } } : {}),
      ...(incoming ? { eyebrow: t('T’a demandé en ami · {ago}', { ago: socialAgo(incoming.at, now()) }), eyebrowTone: 'signal' as const } : outgoing ? { eyebrow: t('Demande envoyée {ago} · en attente de réponse', { ago: socialAgo(outgoing.at, now()) }) } : {}),
    };
    return { head, rows, id, actions };
  }

  function requestActions(key: string, plain: string, after: () => void, say: (row: Row) => void): Action[] {
    return [
      { label: t('Accepter'), key: 'accept', detail: t('Partager ta présence avec ce joueur'), icon: 'check', tone: 'ok', run: () => { net.accept(key); say({ text: t('{name} est maintenant ton ami', { name: plain }), tone: 'ok' }); after(); } },
      { label: t('Refuser'), key: 'decline', detail: t('Nouvelle demande impossible pendant 30 jours'), icon: 'close', run: () => { net.decline(key); say({ text: t('Demande de {name} refusée', { name: plain }), tone: 'ok' }); after(); } },
    ];
  }

  function confirm(question: string, yes: string, run: () => void, cancel: () => void): void {
    host.library.openCustom(
      () => ({ heading: question, icon: 'alert', sections: [], actions: [{ label: yes, icon: 'check', tone: 'warning', run }, { label: t('Annuler'), icon: 'back', run: cancel }], back: cancel }),
      1,
    );
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
      const index = actions.push({ label: d.profile.name, key: `player:${d.profile.key}`, icon: 'friend-add', run: () => openPlayer(d.profile.key, from) }) - 1;
      return {
        text: d.profile.name,
        avatar: avatar(d.profile.key, d.profile.name),
        detail: opts.nearby?.has(d.profile.key) ? t('Sur ton réseau local') : t('Vu {ago}', { ago: socialAgo(d.seen, now()) }),
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
    const actions: Action[] = [{ label: t('Chercher un nom…'), detail: t('Un nom, ou une partie ; ou l’identifiant vu sur la fiche d’un joueur'), icon: 'search', run: () => askSearch() }];
    const near = nearbyPlayers(s, now());
    const nearKeys = new Set(near.map((d) => d.profile.key));
    const recent = s.directory.filter((d) => !nearKeys.has(d.profile.key) && !s.blocked.includes(d.profile.key)).slice(0, RECENT_SHOWN);
    const sections: Section[] = [
      ...flashSections(),
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
    const lanDown = lanProblem();
    if (s.lan) sections.push({ title: t('Sur mon réseau local'), rows: near.length ? playerRows(near, actions, openFind, { nearby: nearKeys }) : lanDown ? [{ text: t('Réseau local indisponible : {reason}', { reason: lanDown }), detail: t('Internet continue sans lui ; nouvel essai tout seul'), tone: 'quiet' }] : [{ text: t('Aucune autre borne sur ce réseau pour l’instant'), tone: 'quiet' }] });
    if (recent.length) sections.push({ title: t('Vus récemment'), rows: playerRows(recent, actions, openFind) });
    actions.push(backAction());
    return {
      heading: t('Trouver un joueur'),
      icon: 'friend-add',
      lead: t('Cherche un nom, ou l’identifiant vu sur la fiche d’un joueur. L’annuaire réunit, sans serveur, les bornes dont le partage est activé.'),
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
        : [{ rows: [{ text: t('Personne de ce nom dans l’annuaire'), detail: t('L’annuaire ne connaît que les bornes vues depuis le démarrage du partage : réessaie quand ton ami a sa borne allumée'), tone: 'info' }] }],
      actions,
      back: openFind,
    };
  }

  // ---------- Demandes d'amis ----------

  function openRequests(back?: () => void): void {
    requestsBack = back;
    host.library.openCustom(buildRequests);
  }

  function buildRequests(): Built {
    const s = net.state();
    const actions: Action[] = [];
    const row = (r: FriendRequest, incoming: boolean): Row => {
      const index = actions.push({ label: r.name, key: `request:${r.key}`, icon: incoming ? 'friend-request' : 'friend-add', run: () => openPlayer(r.key, () => openRequests(requestsBack)) }) - 1;
      return {
        text: r.name,
        avatar: avatar(r.key, r.name),
        detail: incoming
          ? r.lan
            ? t('Reçue {ago} · sur ton réseau local', { ago: socialAgo(r.at, now()) })
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
    const sections: Section[] = [...flashSections(), ...(offRows().length ? [{ rows: offRows() }] : [])];
    sections.push({ title: t('Reçues'), rows: s.incoming.length ? s.incoming.map((r) => row(r, true)) : [{ text: t('Aucune demande reçue'), tone: 'quiet' }] });
    if (s.outgoing.length) sections.push({ title: t('Envoyées'), rows: s.outgoing.map((r) => row(r, false)) });
    const up = requestsBack ?? back;
    actions.push({ label: t('Trouver un joueur'), icon: 'search', run: () => openFind() }, backAction(up));
    return { heading: t('Demandes d’amis'), icon: 'friend-request', sections, actions, back: up };
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
      lead: t('Gagnés sur cette borne à partir des parties et records enregistrés. Visibles par tes amis.'),
      sections: [
        { title: t('Obtenus'), rows: got.length ? got.map((b) => ({ icon: b.icon, text: b.label, detail: t('{detail} · obtenu le {date}', { detail: b.detail, date: new Date(held.get(b.id)!.at).toLocaleDateString() }), tone: 'ok' as const })) : [{ text: t('Aucun pour l’instant : joue une partie jusqu’au bout'), tone: 'quiet' }] },
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
    const state = host.firewall.state();
    const reason = firewallProblems(state, undefined)[0]?.reason;
    switch (state) {
      case 'allowed':
        return { text: t('Pare-feu de Windows : Cyber Pinball autorisé'), tone: 'ok', badges: [t('OK')], icon: 'lock' };
      case 'blocked':
        return { text: t('Pare-feu de Windows : Cyber Pinball bloqué'), detail: reason, tone: 'error', badges: [t('À reposer')], icon: 'lock' };
      case 'missing':
      case 'partial':
      case 'other-program':
        return { text: t('Pare-feu de Windows : pas encore autorisé'), detail: reason, tone: 'warning', badges: [t('À autoriser')], icon: 'lock' };
      default:
        return { text: t('Pare-feu de Windows : état illisible'), tone: 'warning', badges: [t('À vérifier')], icon: 'lock' };
    }
  }

  /** La tâche de réparation : les règles reposées d'elles-mêmes, sans invite, dès qu'une manque. */
  function repairRow(): Row | undefined {
    switch (host.firewall.taskState()) {
      case true:
        return { text: t('Réparation automatique du pare-feu : prête'), detail: t('Une règle qui manque après une mise à jour est reposée au démarrage, sans rien à valider'), tone: 'ok', badges: [t('OK')], icon: 'refresh' };
      case false:
        return { text: t('Réparation automatique du pare-feu : pas encore autorisée'), detail: t('« Autoriser dans le pare-feu de Windows » la pose avec les règles, sous la même autorisation'), tone: 'warning', badges: [t('À autoriser')], icon: 'refresh' };
      default:
        return undefined;
    }
  }

  /**
   * L'état en direct des tables Stern SAM (inspector de VPX) : toujours là, grisé avec sa raison tant
   * que la règle qui ferme VPX au réseau n'est pas posée pour sa version active.
   */
  function vpxRow(): Row {
    const text = t('État en direct des tables Stern SAM');
    switch (host.firewall.vpxState()) {
      case 'closed':
        return { text, detail: t('Prêt : VPX est fermé au réseau, Cyber Pinball le lit sur cette borne seulement'), tone: 'ok', badges: [t('OK')], icon: 'gamepad' };
      case 'missing':
        return { text, detail: t('Indisponible : le pare-feu de Windows doit d’abord fermer VPX au réseau (« Autoriser dans le pare-feu de Windows »)'), tone: 'quiet', badges: [t('À autoriser')], icon: 'gamepad' };
      case 'other-version':
        return { text, detail: t('Indisponible : VPX a changé de version, sa règle du pare-feu est à reposer (« Autoriser dans le pare-feu de Windows »)'), tone: 'quiet', badges: [t('À autoriser')], icon: 'gamepad' };
      case 'unknown':
        return { text, detail: t('Indisponible : la règle du pare-feu de VPX est illisible'), tone: 'quiet', badges: [t('À vérifier')], icon: 'gamepad' };
      default:
        return { text, detail: t('Indisponible : VPX n’est pas encore installé'), tone: 'quiet', icon: 'gamepad' };
    }
  }

  /** L'action « Autoriser » : une règle à reposer (absente, bloquée, autre version), ou la réparation automatique pas encore posée. */
  function firewallToAllow(): boolean {
    return firewallProblems(host.firewall.state(), host.firewall.vpxState()).length > 0 || host.firewall.taskState() === false;
  }

  const allowAction = (after: () => void): Action => ({ label: t('Autoriser dans le pare-feu de Windows'), detail: t('Windows demande ton autorisation, une seule fois : Cyber Pinball ouvert aux autres bornes, VPX fermé au réseau'), icon: 'lock', run: () => askElevation((build, at) => host.library.openCustom(build, at), { title: t('Pare-feu de Windows'), what: t('Autoriser Cyber Pinball dans le pare-feu de Windows : ouvert aux autres bornes, VPX fermé au réseau.'), go: () => allowFirewall(after), later: after }) });

  function buildSharing(): Built {
    const s = net.state();
    const status = net.status();
    const near = nearbyPlayers(s, now()).length;
    const lanDown = lanProblem();
    const rows: Row[] = [
      s.enabled ? { text: t('Partage activé'), detail: status.mode === 'off' ? t('Réseau coupé pendant les essais sans opérateur') : status.running ? tn(status.peers, 'Relié à {n} borne', 'Relié à {n} bornes') : status.error ? t('Réseau indisponible : {error}', { error: status.error }) : t('Connexion au réseau…'), tone: 'ok', badges: [t('Activé')], icon: 'network' } : { text: t('Partage désactivé'), detail: t('Personne ne te voit ; tes amis te voient hors ligne'), tone: 'warning', badges: [t('Désactivé')], icon: 'network' },
      s.lan && lanDown
        ? { text: t('Réseau local : indisponible'), detail: t('{reason} · Internet continue sans lui ; nouvel essai tout seul', { reason: lanDown }), tone: 'warning', badges: [t('Indisponible')], icon: 'monitor' }
        : { text: s.lan ? t('Réseau local : activé') : t('Réseau local : désactivé'), detail: s.lan ? tn(near, '{n} borne à proximité', '{n} bornes à proximité') : t('Les bornes de ton réseau ne te trouvent pas sans Internet'), tone: s.lan ? 'ok' : 'quiet', icon: 'monitor' },
      s.shareLibrary
        ? { text: t('Bibliothèque partagée avec tes amis'), detail: t('Ils voient tes tables et peuvent les récupérer, avec leurs médias'), tone: 'ok', badges: [t('Partagée')], icon: 'tables' }
        : { text: t('Bibliothèque pas partagée'), detail: t('Tes amis ne voient pas tes tables'), tone: 'quiet', icon: 'tables' },
      s.downloadRate
        ? { text: t('Débit des téléchargements : {rate}', { rate: rateLabel(s.downloadRate) }), detail: t('Tables et médias reçus de tes amis, tous envois confondus'), tone: 'ok', badges: [t('Limité')], icon: 'gauge' }
        : { text: t('Débit des téléchargements : sans limite'), detail: t('Tables et médias reçus de tes amis, aussi vite que tes connexions le permettent'), tone: 'quiet', icon: 'gauge' },
      firewallRow(),
      vpxRow(),
      ...[repairRow()].filter((r): r is Row => !!r),
    ];
    // Pseudo, avatar, pays, ce que voient les autres et la suppression du compte : Menu système > Communauté > Mon profil > Mon compte (account-menu.ts).
    const actions: Action[] = [];
    if (firewallToAllow()) actions.push(allowAction(() => host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER)));
    if (s.blocked.length) actions.push({ label: tn(s.blocked.length, '{n} joueur bloqué', '{n} joueurs bloqués'), icon: 'eye', run: () => openBlocked() });
    actions.push(
      s.shareLibrary
        ? { label: t('Ne plus partager ma bibliothèque'), detail: t('Tes amis ne voient plus tes tables ni tes médias'), icon: 'tables', run: () => { net.setShareLibrary(false); flash = { text: t('Bibliothèque plus partagée'), tone: 'ok' }; host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }
        : { label: t('Partager ma bibliothèque avec mes amis'), sends: true as const, detail: t('Tes tables, leurs parties et leurs médias, entre amis seulement'), icon: 'tables', run: () => { net.setShareLibrary(true); flash = { text: t('Bibliothèque partagée avec tes amis'), tone: 'ok' }; host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } },
    );
    actions.push({ label: t('Limiter le débit des téléchargements…'), detail: t('Actuellement : {rate}', { rate: rateLabel(s.downloadRate ?? 0) }), icon: 'gauge', run: () => openDownloadRate() });
    actions.push({ label: s.lan ? t('Désactiver le réseau local') : t('Activer le réseau local'), icon: 'monitor', run: async () => { await net.setLan(!s.lan); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } });
    // La coupure en dernier, juste avant « Retour » (sélection d'office).
    actions.push(
      s.enabled
        ? { label: t('Désactiver le partage'), detail: t('Plus de présence, plus d’annuaire ; tes amis restent dans la liste'), icon: 'close', run: async () => { await net.setEnabled(false); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }
        : { label: t('Activer le partage'), detail: t('Présence, annuaire et demandes d’amis'), icon: 'check', tone: 'ok', run: async () => { await net.setEnabled(true); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } },
    );
    actions.push(backAction());
    return {
      heading: t('Partage et réseau'),
      icon: 'network',
      lead: t('Sans serveur : les bornes se trouvent et se parlent directement, par Internet ou sur ton réseau local.'),
      sections: [
        ...flashSections(),
        { rows },
        {
          title: t('Ce que voient les autres'),
          rows: [
            { text: t('Réseau : ton nom') },
            { text: t('Amis : présence, table en cours, records, badges et parties') },
            { text: t('Réseau : ton avatar'), detail: t('Partout où tu apparais : Joueurs en ligne, salons, classements, profil public') },

            ...(s.shareLibrary
              ? [
                  { text: t('Amis : tes tables, leurs parties (fronton, PuP-Pack, sons…) et leurs médias'), detail: t('Une ROM ou un PuP-Pack seulement si ton ami les coche en attestant en avoir le droit : ils sont décochés d’office') },
                  { text: t('Ne partage que ce que tu as le droit de partager'), detail: t('Les captures d’œuvres (photos du fronton, prospectus, musique du jeu), les ROM et les PuP-Packs restent la propriété de leurs ayants droit'), tone: 'warning' as const, icon: 'alert' as const },
                ]
              : [{ text: t('Aucun fichier partagé') }]),
            ...(s.shareScores === false ? [] : [{ text: t('Toutes les bornes : tes scores, avec ton nom et ton pays'), detail: t('Classements national et mondial, seulement les scores relevés par Cyber Pinball ; jamais en mode invité') }]),
            { text: t('Bornes reliées : son adresse IP'), detail: t('Comme dans tout échange de pair à pair') },
          ],
        },
      ],
      actions,
      back,
    };
  }

  // ---------- Supprimer mon compte (account-delete.ts, forget.ts) ----------

  /** Le « Annuler » de la suppression : Menu système > Communauté > Mon profil > Mon compte, d'où elle s'ouvre (account-menu.ts). */
  let toSharing = () => host.library.openSystem();

  /** Ce qui part et ce qui reste, puis la confirmation ; le curseur sur « Annuler ». */
  function openDeleteAccount(back?: () => void): void {
    if (back) toSharing = back;
    const s = net.state();
    host.library.openCustom(
      () => ({
        heading: t('Supprimer mon compte ?'),
        icon: 'alert',
        lead: t('Rien ne pourra le rétablir. Cyber Pinball redémarre ensuite avec un compte neuf, sans nom ni ami.'),
        sections: [
          {
            title: t('Effacé de cette borne'),
            rows: [
              { text: t('Ton compte « {name} » et son identifiant {id}', { name: s.name, id: playerId(s.key.publicKey) }), icon: 'account' },
              { text: t('Tes amis, tes demandes, tes conversations, tes salons, ton avatar'), icon: 'friend-list' },
              { text: t('Tes scores publiés et ton profil public'), icon: 'trophy' },
            ],
          },
          {
            title: t('Effacé chez les autres joueurs'),
            rows: [
              { text: t('Ton nom, ton avatar, tes lignes de salon, tes messages, tes scores et tes « J’aime »'), detail: t('Chez les bornes reliées tout de suite, puis chez les autres à mesure qu’elles se relient'), icon: 'network' },
              { text: t('Tes propositions et tes votes du tableau des retours'), detail: t('Sur le service des retours, qui demande Internet'), icon: 'message' },
            ],
          },
          {
            title: t('Gardé'),
            rows: [
              { text: t('Tes tables, leurs scores et tes réglages'), icon: 'tables' },
              { text: t('Les sauvegardes déjà faites : elles contiennent ton compte'), detail: t('Menu système > Ma borne > Santé et sauvegardes > Sauvegardes, pour les effacer'), tone: 'warning', icon: 'alert' },
            ],
          },
        ],
        actions: [
          { label: t('Supprimer définitivement mon compte'), icon: 'trash', tone: 'warning', run: () => void startDelete() },
          { label: t('Annuler'), icon: 'back', run: toSharing },
        ],
        back: toSharing,
      }),
      1,
    );
  }

  /** Écran d'attente pendant une étape : rien à choisir. */
  function deleting(text: string): void {
    host.library.openCustom(() => ({ heading: t('Suppression du compte…'), icon: 'trash', sections: [{ rows: [{ text, icon: 'clock' }] }], actions: [{ label: t('Patiente…'), tone: 'quiet', run: () => undefined }], back: () => undefined }), 0);
  }

  async function startDelete(): Promise<void> {
    const account = host.account!;
    deleting(t('Effacement de tes propositions et de tes votes sur le service des retours'));
    const r = await account.forgetFeedback();
    if (r.ok) return finishDelete(true);
    // Injoignable : le joueur choisit. Après l'effacement de la clé, plus rien ne pourrait les retirer.
    host.library.openCustom(
      () => ({
        heading: t('Service des retours injoignable'),
        icon: 'alert',
        lead: r.why === 'offline' ? t('Pas de connexion à Internet pour le moment.') : t('Le service a refusé la demande ; réessaie dans un instant.'),
        sections: [{ rows: [{ text: t('Sans lui, tes propositions et tes votes y resteraient, sans plus aucun moyen de les retirer'), tone: 'warning', icon: 'alert' }] }],
        actions: [
          { label: t('Réessayer'), icon: 'refresh', run: () => void startDelete() },
          { label: t('Supprimer quand même'), detail: t('Le reste du compte est effacé'), icon: 'trash', tone: 'warning', run: () => void finishDelete(false) },
          { label: t('Annuler'), icon: 'back', run: toSharing },
        ],
        back: toSharing,
      }),
      0,
    );
  }

  async function finishDelete(feedback: boolean): Promise<void> {
    deleting(t('Avis d’effacement envoyé aux bornes reliées, puis effacement de tes fichiers'));
    const report = await host.account!.erase(feedback);
    const relaunch = () => host.account!.relaunch();
    host.library.openCustom(
      () => ({
        heading: t('Compte supprimé'),
        icon: 'check',
        lead: t('Cyber Pinball redémarre avec un compte neuf.'),
        sections: [
          {
            rows: [
              report.reached
                ? { text: tn(report.reached, 'Avis d’effacement remis à {n} borne reliée', 'Avis d’effacement remis à {n} bornes reliées'), detail: t('Elles le transmettent aux autres à mesure qu’elles se relient'), tone: 'ok', icon: 'network' }
                : { text: t('Aucune borne reliée en ce moment'), detail: t('Tes amis l’apprennent par la fin de ton amitié à leur prochaine connexion avec un joueur qui le sait'), tone: 'quiet', icon: 'network' },
              report.feedback
                ? { text: t('Propositions et votes effacés du service des retours'), tone: 'ok', icon: 'message' }
                : { text: t('Propositions et votes restés sur le service des retours'), tone: 'warning', icon: 'alert' },
              report.failed.length
                ? { text: tn(report.failed.length, '{n} fichier n’a pas pu être effacé', '{n} fichiers n’ont pas pu être effacés'), detail: report.failed.join(' · '), tone: 'warning', icon: 'alert' }
                : { text: t('Fichiers du compte effacés de cette borne'), tone: 'ok', icon: 'check' },
              { text: t('Les sauvegardes déjà faites contiennent encore ton compte'), detail: t('Menu système > Ma borne > Santé et sauvegardes > Sauvegardes, pour les effacer'), tone: 'warning', icon: 'alert' },
            ],
          },
        ],
        actions: [{ label: t('Redémarrer Cyber Pinball'), icon: 'refresh', tone: 'ok', run: relaunch }],
        back: relaunch,
      }),
      0,
    );
  }

  /** Limite du débit des téléchargements depuis les amis (ratelimit.ts), choisie dans une liste. */
  function openDownloadRate(): void {
    const current = () => net.state().downloadRate ?? 0;
    const done = () => host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
    host.library.openCustom(
      () => ({
        heading: t('Débit des téléchargements'),
        icon: 'gauge',
        lead: t('Ce que tes amis t’envoient (tables, parties, médias) ne dépasse pas ce débit, tous envois confondus : la connexion reste libre pour le reste de la maison. Un ami dont la borne n’est pas à jour envoie encore à pleine vitesse.'),
        sections: [],
        actions: [
          ...DOWNLOAD_RATE_CHOICES.map((rate) => ({
            label: rate ? rateLabel(rate) : t('Sans limite'),
            detail: rate === current() ? t('choix actuel') : undefined,
            tone: rate === current() ? ('ok' as const) : undefined,
            run: () => {
              net.setDownloadRate(rate);
              flash = { text: rate ? t('Débit des téléchargements limité à {rate}', { rate: rateLabel(rate) }) : t('Débit des téléchargements sans limite'), tone: 'ok' };
              done();
            },
          })),
          { label: t('Retour'), icon: 'back', run: done },
        ],
        back: done,
      }),
      Math.max(0, DOWNLOAD_RATE_CHOICES.indexOf(current())),
    );
  }

  async function allowFirewall(after: () => void): Promise<void> {
    const r = await host.firewall.allow();
    flash = 'ok' in r ? { text: host.firewall.vpxState() === 'closed' ? t('Pare-feu de Windows : Cyber Pinball autorisé, VPX fermé au réseau') : t('Pare-feu de Windows : Cyber Pinball autorisé'), tone: 'ok' } : 'cancelled' in r ? { text: t('Autorisation refusée : rien n’a changé'), tone: 'warning' } : { text: t('Pare-feu de Windows : {error}', { error: r.error }), tone: 'error' };
    after();
  }

  // ---------- Pare-feu de Windows (après une mise à jour) ----------

  /**
   * Ouvert d'office au démarrage qui suit une mise à jour, quand une règle reste à reposer et que la
   * réparation automatique n'a pas pu le faire : ce qui manque, pourquoi, et l'autorisation de
   * Windows, sélectionnée d'office. Une fois tout en ordre, l'écran le dit et ne propose plus que Retour.
   */
  function openFirewall(up: () => void = back): void {
    const build = (): Built => {
      const problems = firewallProblems(host.firewall.state(), host.firewall.vpxState());
      const rows: Row[] = problems.length
        ? problems.map((p): Row => ({ text: p.rule === 'app' ? t('Réseau des bornes') : t('État en direct des tables Stern SAM'), detail: p.reason, tone: p.rule === 'app' ? 'error' : 'warning', badges: [t('À reposer')], icon: p.rule === 'app' ? 'network' : 'gamepad' }))
        : [{ text: t('Règles du pare-feu en place'), detail: t('Cyber Pinball ouvert aux autres bornes, VPX fermé au réseau'), tone: 'ok', badges: [t('OK')], icon: 'lock' }];
      const repair = repairRow();
      const actions: Action[] = firewallToAllow() ? [allowAction(() => host.library.openCustom(build, 0))] : [];
      actions.push(backAction(up));
      return {
        heading: t('Pare-feu de Windows'),
        icon: 'lock',
        lead: t('Vérifié après la mise à jour : une règle du pare-feu de Windows est à reposer. Windows demande son autorisation une seule fois ; ensuite, Cyber Pinball la repose de lui-même à chaque démarrage.'),
        sections: [...flashSections(), { rows: repair ? [...rows, repair] : rows }],
        actions,
        back: up,
      };
    };
    host.library.openCustom(build, 0);
  }

  function openBlocked(): void {
    host.library.openCustom(() => {
      const s = net.state();
      const up = () => host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER);
      const actions: Action[] = s.blocked.map((key) => ({ label: t('Débloquer {name}', { name: knownPlain(key) }), key: `blocked:${key}`, icon: 'unlock', run: () => { net.unblock(key); host.library.openCustom(buildSharing, Number.MAX_SAFE_INTEGER); } }));
      actions.push(backAction(up));
      return { heading: t('Joueurs bloqués'), icon: 'lock', sections: [], actions, back: up };
    });
  }

  const knownPlain = (key: string) => net.state().friends.find((f) => f.key === key)?.name ?? net.state().directory.find((d) => d.profile.key === key)?.profile.name ?? key.slice(0, 8);

  return {
    live,
    openFirewall,
    addFromFriend: { detail: addFromFriendDetail, open: (back) => openAddFromFriend(back) },
    openFriend,
    playerPart,
    openRequests,
    openFind: () => openFind(),
    openDeleteAccount: (back) => openDeleteAccount(back),
    history: { has: (id) => host.games.history().some((g) => g.id === id), openGame: (id, back) => historyMenu.openGame(id, back) },
    versionHolders(board) {
      const out: { key: string; name: string; fetch(back: () => void): void }[] = [];
      for (const f of net.state().friends) {
        const view = libraryMenu.liveView(f.key);
        if (view.library !== 'ready') continue;
        const found = view.tables.find((x) => boardKey(x) === board);
        if (found) out.push({ key: f.key, name: f.name, fetch: (back) => libraryMenu.openMatching(f.key, found.table, back, ['table']) });
      }
      return out;
    },
    items: {
      friends: {
        get detail() {
          const invite = host.games.invites()[0];
          if (invite) return t('Invitation de {name} : {table}', { name: invite.host.name, table: invite.title });
          const online = net.state().friends.filter((f) => net.online(f.key)).length;
          if (!net.state().friends.length) return t('En ligne, en partie, derniers records');
          const count = tn(online, '{n} en ligne', '{n} en ligne');
          const sync = net.listSync();
          return sync === 'searching' || sync === 'updating' ? t('{seen} · recherche en cours', { seen: count }) : count;
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
          return net.state().enabled ? t('Activé · {name}', { name: net.state().name }) : t('Désactivé');
        },
        run: () => openSharing(),
      },
    },
  };
}
