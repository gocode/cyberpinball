// Réseau des bornes : le transport. Hyperswarm (HyperDHT) relie les bornes par Internet sans
// serveur : l'annuaire est un sujet commun, chaque ami est rejoint par sa clé (joinPeer). Sur le
// réseau local, une balise de multidiffusion annonce la borne et une connexion TCP chiffrée
// (secret-stream, même Noise que Hyperswarm) relie les bornes voisines, même sans Internet.
// Les deux transports donnent la même chose : un flux authentifié par la clé du pair, sur lequel
// passe le canal Protomux SOCIAL_PROTOCOL. Toute décision (qui est ami, ce qu'on garde) est dans
// packages/core/src/social.ts.
//
// Ce module est le seul de l'application à ouvrir des sockets réseau (social-net.test.ts).
// Mode « off » (essais sans opérateur) : rien ne s'ouvre. Mode « simulated » : un réseau d'essai
// dans le processus, sur 127.0.0.1 seulement, et une balise locale simulée.

import * as dgram from 'node:dgram';
import { createHash } from 'node:crypto';
import * as net from 'node:net';
import {
  acceptRequest,
  addEvent,
  blockPlayer,
  cancelRequest,
  createPresenceBook,
  declineRequest,
  directorySample,
  DIRECTORY_TOPIC,
  FILE_CHUNK,
  friendSeen,
  friendsListSync,
  knownName,
  grantBadges,
  learnProfiles,
  loadSocial,
  parseLibraryMessage,
  parseLiveMessage,
  parseSocialMessage,
  peerProfile,
  playerSeed,
  PRESENCE_SEARCH_MS,
  receiveEvents,
  receiveReply,
  relationOf,
  removeFriend,
  requestFriend,
  saveOrWarn,
  saveSocial,
  setName,
  signProfile,
  SOCIAL_PROTOCOL,
  socialFile,
  syncReply,
  unblockPlayer,
  verifyProfile,
  type FriendsListSync,
  type LibraryMessage,
  type LiveMessage,
  type PlayStats,
  type Presence,
  type Profile,
  type Reply,
  type SocialEvent,
  type SocialMessage,
  type SocialNetMode,
  type SocialState,
  type Step,
} from '@cyberpinball/core';

/* eslint-disable @typescript-eslint/no-require-imports -- paquets sans types, chargés seulement quand le réseau démarre */
type Duplex = NodeJS.ReadWriteStream & {
  remotePublicKey: Buffer;
  isInitiator: boolean;
  destroyed?: boolean;
  destroying?: boolean;
  /** NoiseSecretStream : fermé si rien n'est reçu pendant ce délai. */
  setTimeout?(ms: number): void;
  destroy(err?: Error): void;
  on(event: string, fn: (...args: never[]) => void): Duplex;
};
interface Swarm {
  keyPair: { publicKey: Buffer };
  /** Pairs connus de Hyperswarm (clé hex) : `attempts` compte les échecs depuis la dernière liaison durable. */
  peers: Map<string, { attempts: number }>;
  on(event: 'connection', fn: (conn: Duplex) => void): void;
  join(topic: Buffer, opts: { server: boolean; client: boolean }): { flushed(): Promise<void>; refresh(opts: { server: boolean; client: boolean }): Promise<void> };
  leave(topic: Buffer): Promise<void>;
  joinPeer(key: Buffer): void;
  leavePeer(key: Buffer): void;
  listen(): Promise<void>;
  flush(): Promise<void>;
  destroy(): Promise<void>;
  connections: Set<Duplex>;
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** Groupe et port de la balise du réseau local (multidiffusion limitée au site, RFC 2365). */
export const LAN_GROUP = '239.255.42.99';
export const LAN_PORT = 47_999;
const BEACON_MS = 5_000;
/**
 * Nouvelle recherche dans l'annuaire : Hyperswarm ne relance la sienne que toutes les dix
 * minutes, et deux bornes démarrées ensemble se manqueraient jusque-là.
 */
const DIRECTORY_REFRESH_MS = 3 * 60_000;
/** Taille au-delà de laquelle un message reçu est ignoré sans être lu. */
const MESSAGE_MAX = 256 * 1024;
/** Évènements envoyés à un ami à la connexion (les plus récents). */
const EVENTS_ON_CONNECT = 10;
/**
 * Liaison Internet muette au-delà de ce délai : fermée. HyperDHT envoie un signe de vie toutes
 * les 5 s des deux côtés (toutes versions) ; sans ce délai, une borne qui a planté ou changé de
 * réseau resterait « en ligne » chez l'autre, qui ne la voit plus (présence asymétrique).
 */
const LINK_TIMEOUT_MS = 20_000;
/** Liaison du réseau local : sondes TCP (le système ferme la socket si la borne ne répond plus). */
const LAN_KEEPALIVE_MS = 5_000;
/**
 * Ami suivi sans liaison : on relance Hyperswarm à ce rythme. Après quatre échecs (borne éteinte,
 * réseau pas encore prêt au démarrage, connexions brèves), Hyperswarm attend dix minutes avant
 * de réessayer un pair, et ne le reprend même plus quand l'annuaire le retrouve.
 */
const REDIAL_FAST_MS = 5_000;
const REDIAL_SLOW_MS = 30_000;
/** Durée de la relance rapide, depuis le démarrage ou un changement de réseau. */
const REDIAL_FAST_FOR_MS = 2 * 60_000;
/** Balise d'un ami reçue sans liaison locale : la borne qui n'appelle pas d'habitude appelle passé ce délai. */
const LAN_FALLBACK_MS = 2 * BEACON_MS;

export interface NetStatus {
  mode: SocialNetMode;
  running: boolean;
  /** Connecté au réseau Internet (DHT rejointe). */
  internet: boolean;
  /** Balise du réseau local active. */
  lan: boolean;
  /** Bornes reliées en ce moment. */
  peers: number;
  error?: string;
}

export interface Beacon {
  profile: Profile;
  port: number;
}

/** Balise du réseau local : la vraie (multidiffusion UDP), ou une simulée pour les essais. */
export interface LanBeacons {
  start(onBeacon: (beacon: Beacon, host: string) => void): Promise<void>;
  announce(beacon: Beacon): void;
  stop(): Promise<void>;
}

export interface SocialNetOptions {
  dataDir: string;
  mode: SocialNetMode;
  /** Pour les essais : un réseau d'essai déjà créé (nœuds d'amorçage sur 127.0.0.1). */
  bootstrap?: { host: string; port: number }[];
  /** Adresse d'écoute : 127.0.0.1 pour les essais, toutes les interfaces sinon. */
  host?: string;
  /** Balise du réseau local ; par défaut la vraie, en mode public. */
  beacons?: LanBeacons;
  now?: () => Date;
  /** Quelque chose a changé (un ami en ligne, une demande reçue) : redessiner. */
  onChange?: () => void;
  log?: (line: string) => void;
  /** Essais : tolérance avant « hors ligne » et durée de la recherche du démarrage (friendpresence.ts). */
  graceMs?: number;
  searchMs?: number;
  /** Essais : l'entrant refusé, comme derrière un pare-feu qui le bloque (seules les liaisons sortantes passent). */
  refuseIncoming?: boolean;
}

/** Messages des services posés sur le réseau des amis : bibliothèque partagée, partie en direct. */
export type FriendMessage = LibraryMessage | LiveMessage;

interface Link {
  stream: Duplex;
  send(message: SocialMessage | FriendMessage): void;
  /** Morceau de fichier (friendlibrary.ts, chunkFrame) ; false : le flux est plein, attendre « drain ». */
  sendChunk(frame: Buffer): boolean;
  via: 'internet' | 'lan';
  /** Bonjour reçu sur cette connexion : la resynchronisation (syncReply) se fait à chacune. */
  greeted?: boolean;
  /** Ouverture (ms), pour la durée au journal. */
  opened: number;
  /** Dernière erreur du flux : la raison de sa fermeture au journal. */
  error?: string;
}

interface Peer {
  key: string;
  links: Set<Link>;
  profile?: Profile;
  presence?: Presence;
  lan?: { host: string; port: number };
  /** Première balise reçue sans liaison locale (ms) : passé LAN_FALLBACK_MS, cette borne appelle aussi. */
  lanWaiting?: number;
}

export interface SocialNet {
  state(): SocialState;
  /** Réseau simulé : ses nœuds d'amorçage (127.0.0.1), pour les bornes fictives de la démonstration. */
  simulatedBootstrap(): { host: string; port: number }[] | undefined;
  status(): NetStatus;
  /**
   * Ami en ligne : au moins une liaison saluée, quelle qu'elle soit, ou la dernière tombée il y a
   * moins que la tolérance (friendpresence.ts).
   */
  online(key: string): boolean;
  presenceOf(key: string): Presence | undefined;
  /** La liste des amis est-elle sûre, ou encore en train de se faire ? */
  listSync(): FriendsListSync;
  /** Liaisons saluées avec ce pair en ce moment (fiche d'un ami, essais) : par où passe la présence. */
  linksOf(key: string): Link['via'][];
  start(): Promise<void>;
  stop(): Promise<void>;
  setEnabled(on: boolean): Promise<void>;
  setLan(on: boolean): Promise<void>;
  rename(name: string): boolean;
  setPresence(presence: Presence): void;
  /** Évènement de ce joueur (record, partie) : gardé, envoyé aux amis reliés. */
  publish(event: Omit<SocialEvent, 'id' | 'at'>): void;
  /** Badges mérités depuis la dernière fois : ajoutés, et envoyés aux amis s'il y a lieu. */
  checkBadges(play: PlayStats): SocialEvent[];
  request(profile: Pick<Profile, 'key' | 'name'>): void;
  cancel(key: string): void;
  accept(key: string): void;
  decline(key: string): void;
  remove(key: string): void;
  block(key: string): void;
  unblock(key: string): void;
  /** Bibliothèque partagée avec mes amis (désactivée par défaut). */
  setShareLibrary(on: boolean): void;
  /**
   * Message d'un service (bibliothèque, partie en direct) à un ami relié ; false : pas relié,
   * ou pas un ami. Rien de ces services ne part vers un joueur qui n'est pas un ami.
   */
  send(key: string, message: FriendMessage): boolean;
  /** Morceau de fichier à un ami, en respectant le débit du flux ; false : plus relié. */
  sendChunk(key: string, frame: Buffer): Promise<boolean>;
  /** Messages des services reçus d'un ami ; rend de quoi se désabonner. */
  onMessage(listener: (key: string, message: FriendMessage) => void): () => void;
  onChunk(listener: (key: string, frame: Buffer) => void): () => void;
}

const topicOf = (name: string) => createHash('sha256').update(name).digest();
const hex = (b: Buffer) => b.toString('hex');

export function createSocialNet(opts: SocialNetOptions): SocialNet {
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  let state = loadSocial(opts.dataDir, now());
  const peers = new Map<string, Peer>();
  /** Qui est en ligne : liaisons saluées, tolérance après la dernière (friendpresence.ts). */
  const book = createPresenceBook(opts.graceMs);
  let swarm: Swarm | undefined;
  let dht: { destroy(): Promise<void>; on?(event: string, fn: () => void): void } | undefined;
  let testnet: { destroy(): Promise<void>; bootstrap: { host: string; port: number }[] } | undefined;
  let tcp: net.Server | undefined;
  let tcpPort = 0;
  let beacons: LanBeacons | undefined;
  let beaconTimer: NodeJS.Timeout | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  let graceTimer: NodeJS.Timeout | undefined;
  let searchTimer: NodeJS.Timeout | undefined;
  let redialTimer: NodeJS.Timeout | undefined;
  /** Démarrage du réseau, ou dernier changement de réseau (ms) : la recherche des amis part de là. */
  let startedAt: number | undefined;
  let presence: Presence = { status: 'menu', since: now().toISOString() };
  let status: NetStatus = { mode: opts.mode, running: false, internet: false, lan: false, peers: 0 };
  let starting: Promise<void> | undefined;
  const ms = () => now().getTime();

  const changed = () => {
    status = { ...status, peers: [...peers.values()].filter((p) => p.links.size).length };
    opts.onChange?.();
  };

  function commit(next: SocialState): void {
    if (next === state) return;
    state = next;
    // Appelé depuis le réseau (connexion fermée, message reçu) et la fin de partie : un social.json
    // refusé par Windows est noté au journal, jamais levé ; la sauvegarde suivante réécrit tout.
    saveOrWarn(socialFile(opts.dataDir), () => saveSocial(opts.dataDir, state));
    changed();
  }

  /** Depuis un minuteur ou la fermeture d'un flux : un enregistrement impossible se dit au journal, sans tout arrêter. */
  function commitQuietly(next: SocialState): void {
    try {
      commit(next);
    } catch (error) {
      log(`Réseau des bornes : enregistrement impossible (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  // ---------- Journal ----------

  const nameOf = (key: string) => peers.get(key)?.profile?.name ?? knownName(state, key) ?? key.slice(0, 8);
  /** Amis et demandes suivis : leurs liaisons vont au journal ; celles des inconnus de l'annuaire, non. */
  const followed = new Set<string>();
  const traced = (key: string) => followed.has(key) || relationOf(state, key) === 'friend';
  const said = new Map<string, number>();
  /** Une même ligne au plus une fois par période (un appel local qui échoue à chaque balise). */
  function logEvery(id: string, everyMs: number, line: string): void {
    const last = said.get(id);
    if (last !== undefined && ms() - last < everyMs) return;
    said.set(id, ms());
    log(line);
  }
  const viaText = (v: Link['via']) => (v === 'lan' ? 'réseau local' : 'Internet'); // i18n-ignore : journal
  /**
   * Liaisons saluées avec des amis depuis le démarrage, par sens. Une borne dont l'entrant est
   * bloqué (pare-feu de Windows) n'a que des sortantes : la présence tient par elles, mais les
   * appels de l'autre borne échouent ; le journal le dit.
   */
  const opened = { outgoing: 0, incoming: 0 };
  function countDirection(link: Link): void {
    if (link.stream.isInitiator) opened.outgoing++;
    else opened.incoming++;
    if (opened.outgoing >= 3 && opened.incoming === 0) logEvery('only-outgoing', 30 * 60_000, `Réseau des bornes : seules des liaisons sortantes ont abouti (${opened.outgoing}, aucune entrante) ; si l'autre borne note « appel local … impossible », l'entrant de celle-ci est bloqué (pare-feu de Windows).`); // i18n-ignore : journal
  }

  // ---------- Envoi ----------

  /** La liaison où écrire : vivante, saluée de préférence, la plus récente d'abord (l'ancienne d'un doublon se ferme). */
  function bestLink(key: string): Link | undefined {
    const links = [...(peers.get(key)?.links ?? [])].filter((l) => !l.stream.destroyed && !l.stream.destroying).reverse();
    return links.find((l) => l.greeted) ?? links[0];
  }

  function sendTo(key: string, message: SocialMessage): boolean {
    const link = bestLink(key);
    if (!link) return false;
    link.send(message);
    return true;
  }

  /** Change d'état et envoie la réponse qu'il demande au pair, s'il est relié. */
  function apply(key: string, step: Step): void {
    const before = relationOf(state, key);
    commit(step.state);
    if (step.send) sendTo(key, { t: step.send });
    const after = relationOf(state, key);
    // Devenu ami : la présence et les derniers évènements, tout de suite.
    if (before !== 'friend' && after === 'friend') greetFriend(key);
    followPeers();
  }

  function greetFriend(key: string): void {
    sendTo(key, { t: 'presence', presence });
    sendTo(key, { t: 'events', events: state.events.slice(0, EVENTS_ON_CONNECT) });
  }

  // ---------- Présence ----------

  /**
   * Fin de tolérance : l'ami sans nouvelle liaison est hors ligne, vu pour la dernière fois à la
   * chute de sa dernière liaison (pas à l'heure où on s'en aperçoit).
   */
  function expireGrace(): void {
    graceTimer = undefined;
    for (const { key, lastAlive } of book.expire(ms())) {
      const peer = peers.get(key);
      if (peer) peer.presence = undefined;
      if (relationOf(state, key) !== 'friend') continue;
      commitQuietly(friendSeen(state, key, new Date(lastAlive)));
      log(`Réseau des bornes : ${nameOf(key)} hors ligne (dernière liaison fermée il y a ${Math.round((ms() - lastAlive) / 1000)} s).`); // i18n-ignore : journal
    }
    scheduleGrace();
    changed();
  }

  function scheduleGrace(): void {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = undefined;
    const at = book.nextExpiry();
    if (at === undefined) return;
    graceTimer = setTimeout(expireGrace, Math.max(0, at - ms()) + 10);
    graceTimer.unref?.();
  }

  /** Recherche des amis : au démarrage, et après un changement de réseau. */
  function beginSearch(): void {
    startedAt = ms();
    if (searchTimer) clearTimeout(searchTimer);
    // Fin de la recherche : la liste devient sûre, le dire à l'écran.
    searchTimer = setTimeout(changed, (opts.searchMs ?? PRESENCE_SEARCH_MS) + 10);
    searchTimer.unref?.();
    scheduleRedial(REDIAL_FAST_MS);
  }

  /**
   * Amis et demandes suivis sans liaison : on redemande à Hyperswarm de les joindre. Il a pu
   * renoncer pour dix minutes (quatre échecs), et l'annuaire ne les lui rend pas dans cet état.
   */
  function redial(): void {
    redialTimer = undefined;
    if (!swarm) return;
    for (const key of followed) {
      if (peers.get(key)?.links.size) continue;
      const attempts = swarm.peers.get(key)?.attempts ?? 0;
      if (attempts > 3) logEvery(`redial:${key}`, 10 * 60_000, `Réseau des bornes : ${nameOf(key)} injoignable après ${attempts} essais ; Hyperswarm relancé sans attendre ses dix minutes.`); // i18n-ignore : journal
      swarm.joinPeer(Buffer.from(key, 'hex'));
    }
    scheduleRedial(startedAt !== undefined && ms() - startedAt < REDIAL_FAST_FOR_MS ? REDIAL_FAST_MS : REDIAL_SLOW_MS);
  }

  function scheduleRedial(delay: number): void {
    if (redialTimer) clearTimeout(redialTimer);
    redialTimer = setTimeout(redial, delay);
    redialTimer.unref?.();
  }

  // ---------- Connexions ----------

  function attach(stream: Duplex, via: Link['via']): void {
    const key = hex(stream.remotePublicKey);
    if (key === state.key.publicKey || state.blocked.includes(key)) {
      stream.destroy();
      return;
    }
    const Protomux = require('protomux');
    const c = require('compact-encoding');
    const mux = Protomux.from(stream);
    const channel = mux.createChannel({ protocol: SOCIAL_PROTOCOL, onclose: () => detach() });
    if (!channel) return; // canal déjà ouvert sur ce flux
    // Liaison Internet muette (borne plantée, réseau changé) : fermée ; le réseau local a ses sondes TCP.
    if (via === 'internet') stream.setTimeout?.(LINK_TIMEOUT_MS);
    const message = channel.addMessage({
      encoding: c.string,
      onmessage: (text: string) => {
        if (text.length > MESSAGE_MAX) return;
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return;
        }
        const parsed = parseSocialMessage(raw, now());
        if (parsed) return receive(key, parsed, link);
        // Bibliothèque partagée et partie en direct : entre amis seulement.
        if (!raw || typeof raw !== 'object' || relationOf(state, key) !== 'friend') return;
        const extra = parseLibraryMessage(raw as Record<string, unknown>) ?? parseLiveMessage(raw as Record<string, unknown>);
        if (extra) for (const listener of messageListeners) listener(key, extra);
      },
    });
    const chunk = channel.addMessage({
      encoding: c.buffer,
      onmessage: (frame: Buffer) => {
        if (relationOf(state, key) !== 'friend' || frame.length > FILE_CHUNK + 4) return;
        for (const listener of chunkListeners) listener(key, frame);
      },
    });
    const link: Link = { stream, via, opened: ms(), send: (m) => message.send(JSON.stringify(m)), sendChunk: (frame) => chunk.send(frame) !== false };
    const peer = peers.get(key) ?? { key, links: new Set<Link>() };
    peers.set(key, peer);
    peer.links.add(link);
    if (via === 'lan') peer.lanWaiting = undefined;
    let gone = false;
    // Une liaison qui tombe ne retire pas l'ami : il reste en ligne par une autre, ou le temps de la tolérance.
    // Rien ne s'enregistre ici : « vu » se date à la fin de la tolérance.
    const detach = () => {
      if (gone) return;
      gone = true;
      peer.links.delete(link);
      book.down(key, link, ms());
      if (traced(key)) {
        const rest = book.links(key);
        const after = rest ? `${rest} autre(s) liaison(s)` : book.pending(key) ? 'tolérance avant « hors ligne »' : 'plus de liaison'; // i18n-ignore : journal
        log(`Réseau des bornes : liaison ${viaText(via)} avec ${nameOf(key)} fermée (${link.error ?? 'fin normale'}${link.greeted ? '' : ', avant le bonjour'}, après ${Math.round((ms() - link.opened) / 1000)} s ; ${after}).`); // i18n-ignore : journal
      }
      scheduleGrace();
      changed();
    };
    stream.on('close', detach);
    stream.on('error', (error: Error) => {
      link.error ??= error?.message ?? String(error);
      detach();
    });
    channel.open();
    link.send({ t: 'hello', profile: signProfile(state), dir: directorySample(state) });
    changed();
  }

  function receive(key: string, message: SocialMessage, link: Link): void {
    const peer = peers.get(key);
    if (!peer || state.blocked.includes(key)) return;
    switch (message.t) {
      case 'hello': {
        // Le profil doit être celui de la clé de la connexion.
        if (message.profile.key !== key) return;
        const first = !link.greeted;
        link.greeted = true;
        const lan = [...peer.links].some((l) => l.via === 'lan');
        learn([message.profile], lan);
        learn(message.dir, false); // relayés : vus par lui, pas forcément à proximité
        if (first) {
          // Bonjour reçu sur cette liaison : elle compte pour la présence.
          const appeared = book.up(key, link, ms());
          if (traced(key)) {
            log(`Réseau des bornes : liaison ${viaText(link.via)} ${link.stream.isInitiator ? 'sortante' : 'entrante'} avec ${nameOf(key)} ouverte (${book.links(key)} liaison(s))${appeared ? ' : en ligne' : ''}.`); // i18n-ignore : journal
            countDirection(link);
          }
          if (appeared && relationOf(state, key) === 'friend') commitQuietly(friendSeen(state, key, now()));
          scheduleGrace();
          const sync = syncReply(state, key);
          if (sync) sendTo(key, { t: sync });
          if (relationOf(state, key) === 'friend') greetFriend(key);
          changed();
        }
        return;
      }
      case 'dir':
        learn(message.dir, false);
        return;
      case 'request':
      case 'accept':
      case 'decline':
      case 'unfriend': {
        if (!peer.profile) return; // pas de demande sans profil
        const lan = [...peer.links].some((l) => l.via === 'lan');
        apply(key, receiveReply(state, { ...(peerProfile(state, key) ?? peer.profile), ...(lan ? { lan: true } : {}) }, message.t as Reply, now()));
        return;
      }
      case 'presence':
        if (relationOf(state, key) !== 'friend') return;
        peer.presence = message.presence;
        changed();
        return;
      case 'events':
        commit(receiveEvents(state, key, message.events));
        return;
    }
  }

  /**
   * Profils reçus, d'où qu'ils viennent : l'annuaire, le nom des amis et des demandes, et le
   * profil gardé pour chaque pair relié suivent le plus récent (un renommage envoyé par « dir »
   * vaut pour la demande qui le suit).
   */
  function learn(profiles: readonly Profile[], lan: boolean): void {
    commit(learnProfiles(state, profiles, { now: now(), lan }));
    for (const profile of profiles) {
      const peer = peers.get(profile.key);
      if (peer && (!peer.profile || Date.parse(profile.at) >= Date.parse(peer.profile.at))) peer.profile = profile;
    }
  }

  /** Amis et demandes en cours : Hyperswarm les rejoint par leur clé ; les autres sont laissés. */
  function followPeers(): void {
    if (!swarm) return;
    const want = new Set([...state.friends.map((f) => f.key), ...state.outgoing.map((r) => r.key), ...state.incoming.map((r) => r.key)]);
    for (const key of want) if (!followed.has(key)) swarm.joinPeer(Buffer.from(key, 'hex'));
    for (const key of followed) if (!want.has(key)) swarm.leavePeer(Buffer.from(key, 'hex'));
    followed.clear();
    for (const key of want) followed.add(key);
    // Réseau local : se relier aux voisins qu'on suit, s'ils n'y sont pas déjà reliés par lui.
    for (const key of want) {
      const peer = peers.get(key);
      if (peer?.lan && !hasLanLink(peer)) connectLan(key, peer.lan.host, peer.lan.port);
    }
  }

  // ---------- Réseau local ----------

  function secretStream(isInitiator: boolean, socket: net.Socket, remotePublicKey?: Buffer): Duplex {
    const SecretStream = require('@hyperswarm/secret-stream');
    const DHT = require('hyperdht');
    return new SecretStream(isInitiator, socket, { keyPair: DHT.keyPair(playerSeed(state.key)), ...(remotePublicKey ? { remotePublicKey } : {}) });
  }

  const hasLanLink = (peer: Peer) => [...peer.links].some((l) => l.via === 'lan');

  /** Réseau local en marche : un appel encore en vol quand on le coupe ne s'attache pas après. */
  let lanActive = false;
  const dialing = new Set<string>();
  function connectLan(key: string, host: string, port: number): void {
    if (!lanActive || dialing.has(key)) return;
    dialing.add(key);
    const socket = net.connect({ host, port });
    socket.setKeepAlive(true, LAN_KEEPALIVE_MS);
    const stream = secretStream(true, socket, Buffer.from(key, 'hex'));
    const done = () => dialing.delete(key);
    stream.on('connect', () => {
      done();
      // La borne qui répond doit être celle de la balise.
      if (!lanActive || hex(stream.remotePublicKey) !== key) return stream.destroy();
      attach(stream, 'lan');
    });
    stream.on('error', (error: Error) => {
      done();
      // Pare-feu, adresse injoignable : dit une fois, pas à chaque balise.
      if (traced(key)) logEvery(`lan-fail:${key}`, 5 * 60_000, `Réseau des bornes : appel local vers ${nameOf(key)} (${host}:${port}) impossible (${error?.message ?? error}).`); // i18n-ignore : journal
    });
    stream.on('close', done);
  }

  function onBeacon(beacon: Beacon, host: string): void {
    const profile = verifyProfile(beacon.profile, now());
    if (!profile || profile.key === state.key.publicKey || state.blocked.includes(profile.key)) return;
    const peer = peers.get(profile.key) ?? { key: profile.key, links: new Set<Link>() };
    peers.set(profile.key, peer);
    const moved = peer.lan?.host !== host || peer.lan?.port !== beacon.port;
    peer.lan = { host, port: beacon.port };
    learn([profile], true);
    const relation = relationOf(state, profile.key);
    const follows = relation === 'friend' || relation === 'outgoing' || relation === 'incoming';
    if (moved && follows) log(`Réseau des bornes : balise locale de ${nameOf(profile.key)} (${host}:${beacon.port}).`); // i18n-ignore : journal
    if (!follows || hasLanLink(peer)) {
      peer.lanWaiting = undefined;
      return;
    }
    // D'habitude une seule des deux bornes appelle : celle qui suit l'autre, sinon la plus petite clé.
    // Si sa balise ne passe que dans un sens (pare-feu, plusieurs cartes réseau), l'autre appelle
    // à son tour après deux balises sans liaison locale. Une liaison Internet n'y change rien : la
    // locale tient mieux, et l'ami reste en ligne tant que l'une des deux vit.
    peer.lanWaiting ??= ms();
    const caller = relation === 'outgoing' || state.key.publicKey < profile.key;
    if (caller || ms() - peer.lanWaiting >= LAN_FALLBACK_MS) connectLan(profile.key, host, beacon.port);
  }

  async function startLan(): Promise<void> {
    if (!state.lan || opts.mode === 'off') return;
    const host = opts.host ?? '0.0.0.0';
    tcp = net.createServer((socket) => {
      if (opts.refuseIncoming) return socket.destroy();
      socket.setKeepAlive(true, LAN_KEEPALIVE_MS);
      const stream = secretStream(false, socket);
      stream.on('connect', () => (lanActive ? attach(stream, 'lan') : stream.destroy()));
      stream.on('error', () => undefined);
    });
    await new Promise<void>((resolve, reject) => {
      tcp!.once('error', reject);
      tcp!.listen(0, host, () => resolve());
    });
    tcpPort = (tcp.address() as net.AddressInfo).port;
    lanActive = true;
    beacons = opts.beacons ?? (opts.mode === 'public' ? multicastBeacons() : memoryBeacons(SIMULATED_LAN));
    if (!beacons) return;
    await beacons.start(onBeacon);
    const announce = () => beacons?.announce({ profile: signProfile(state), port: tcpPort });
    announce();
    beaconTimer = setInterval(announce, BEACON_MS);
    beaconTimer.unref?.();
    status = { ...status, lan: true };
  }

  async function stopLan(): Promise<void> {
    lanActive = false;
    if (beaconTimer) clearInterval(beaconTimer);
    beaconTimer = undefined;
    await beacons?.stop();
    beacons = undefined;
    for (const peer of peers.values()) for (const link of peer.links) if (link.via === 'lan') link.stream.destroy();
    await new Promise<void>((resolve) => (tcp ? tcp.close(() => resolve()) : resolve()));
    tcp = undefined;
    status = { ...status, lan: false };
  }

  // ---------- Internet ----------

  async function startInternet(): Promise<void> {
    const DHT = require('hyperdht');
    const Hyperswarm = require('hyperswarm');
    let bootstrap = opts.bootstrap;
    const host = opts.host ?? (opts.mode === 'simulated' ? '127.0.0.1' : undefined);
    if (opts.mode === 'simulated' && !bootstrap) {
      const createTestnet = require('hyperdht/testnet');
      testnet = await createTestnet(3, { host: '127.0.0.1' });
      bootstrap = testnet!.bootstrap;
    }
    const node = new DHT({ ...(bootstrap ? { bootstrap } : {}), ...(host ? { host } : {}) });
    dht = node;
    // Réseau changé (câble, Wi-Fi, mise en veille) : les liaisons se refont, la liste redevient incertaine.
    node.on?.('network-change', () => {
      log('Réseau des bornes : changement de réseau, recherche des amis relancée.'); // i18n-ignore : journal
      beginSearch();
      changed();
    });
    swarm = new Hyperswarm({ keyPair: DHT.keyPair(playerSeed(state.key)), dht: node, maxPeers: 32, firewall: (key: Buffer) => state.blocked.includes(hex(key)) }) as Swarm;
    swarm.on('connection', (conn) => (opts.refuseIncoming && !conn.isInitiator ? conn.destroy() : attach(conn, 'internet')));
    const discovery = swarm.join(topicOf(DIRECTORY_TOPIC), { server: true, client: true });
    const refresh = () => discovery.refresh({ server: true, client: true }).catch(() => undefined);
    // Annoncée, la borne cherche une fois de plus : celles qui ont démarré en même temps qu'elle.
    void discovery.flushed().then(refresh, () => undefined);
    refreshTimer = setInterval(refresh, DIRECTORY_REFRESH_MS);
    refreshTimer.unref?.();
    followPeers();
    status = { ...status, internet: true };
  }

  async function start(): Promise<void> {
    if (!state.enabled || opts.mode === 'off' || status.running) return;
    starting ??= (async () => {
      try {
        await startInternet();
        await startLan();
        status = { ...status, running: true, error: undefined };
        beginSearch();
        log(`Réseau des bornes : démarré (${opts.mode}, borne ${signProfile(state).name}, ${state.friends.length} ami(s) à chercher).`); // i18n-ignore : journal
      } catch (error) {
        status = { ...status, error: (error as Error).message };
        log(`Réseau des bornes : démarrage impossible (${(error as Error).message}).`); // i18n-ignore : journal
      } finally {
        starting = undefined;
        changed();
      }
    })();
    return starting;
  }

  async function stop(): Promise<void> {
    await starting;
    await stopLan();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
    for (const timer of [graceTimer, searchTimer, redialTimer]) if (timer) clearTimeout(timer);
    graceTimer = searchTimer = redialTimer = undefined;
    startedAt = undefined;
    for (const peer of peers.values()) for (const link of peer.links) link.stream.destroy();
    peers.clear();
    book.clear();
    followed.clear();
    await swarm?.destroy();
    swarm = undefined;
    await dht?.destroy();
    dht = undefined;
    await testnet?.destroy();
    testnet = undefined;
    status = { ...status, running: false, internet: false, lan: false };
    changed();
  }

  const messageListeners = new Set<(key: string, message: FriendMessage) => void>();
  const chunkListeners = new Set<(key: string, frame: Buffer) => void>();
  const friendLink = (key: string) => (relationOf(state, key) === 'friend' ? bestLink(key) : undefined);

  function broadcastFriends(message: SocialMessage): void {
    for (const f of state.friends) sendTo(f.key, message);
  }

  return {
    state: () => state,
    simulatedBootstrap: () => (opts.mode === 'simulated' ? (testnet?.bootstrap ?? opts.bootstrap) : undefined),
    status: () => status,
    online: (key) => book.online(key),
    presenceOf: (key) => peers.get(key)?.presence,
    linksOf: (key) => [...(peers.get(key)?.links ?? [])].filter((l) => l.greeted).map((l) => l.via),
    listSync: () =>
      friendsListSync({
        enabled: state.enabled,
        running: status.running,
        unavailable: opts.mode === 'off' || !!status.error,
        ...(startedAt !== undefined ? { startedAt } : {}),
        now: ms(),
        friends: state.friends.map((f) => f.key),
        online: (k) => book.online(k),
        pending: (k) => book.pending(k),
        ...(opts.searchMs !== undefined ? { searchMs: opts.searchMs } : {}),
      }),
    start,
    stop,
    async setEnabled(on) {
      commit({ ...state, enabled: on });
      if (on) await start();
      else await stop();
    },
    async setLan(on) {
      commit({ ...state, lan: on });
      if (!status.running) return;
      if (on) await startLan();
      else await stopLan();
      changed();
    },
    rename(name) {
      const next = setName(state, name, now());
      if (!next) return false;
      commit(next);
      const dir: SocialMessage = { t: 'dir', dir: [signProfile(state)] };
      for (const peer of peers.values()) for (const link of peer.links) link.send(dir);
      return true;
    },
    setPresence(next) {
      presence = next;
      broadcastFriends({ t: 'presence', presence });
    },
    publish(event) {
      const added = addEvent(state, event, now());
      commit(added.state);
      broadcastFriends({ t: 'events', events: [added.event] });
    },
    checkBadges(play) {
      const granted = grantBadges(state, play, now());
      commit(granted.state);
      if (granted.events.length) broadcastFriends({ t: 'events', events: granted.events });
      return granted.events;
    },
    request: (profile) => apply(profile.key, requestFriend(state, profile, now())),
    cancel: (key) => apply(key, cancelRequest(state, key)),
    accept: (key) => apply(key, acceptRequest(state, key, now())),
    decline: (key) => apply(key, declineRequest(state, key, now())),
    remove: (key) => apply(key, removeFriend(state, key)),
    block(key) {
      apply(key, blockPlayer(state, key));
      for (const link of peers.get(key)?.links ?? []) link.stream.destroy();
      book.forget(key);
    },
    unblock: (key) => commit(unblockPlayer(state, key)),
    setShareLibrary: (on) => commit({ ...state, shareLibrary: on, shareLibraryChosen: true }),
    send(key, message) {
      const link = friendLink(key);
      if (!link) return false;
      link.send(message);
      return true;
    },
    async sendChunk(key, frame) {
      const link = friendLink(key);
      if (!link) return false;
      if (!link.sendChunk(frame)) {
        // Flux plein : attendre qu'il se vide, ou qu'il se ferme.
        await new Promise<void>((resolve) => {
          const done = () => {
            link.stream.removeListener('drain', done);
            link.stream.removeListener('close', done);
            resolve();
          };
          link.stream.on('drain', done);
          link.stream.on('close', done);
        });
      }
      return !!friendLink(key);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onChunk(listener) {
      chunkListeners.add(listener);
      return () => chunkListeners.delete(listener);
    },
  };
}

/** Vraie balise : multidiffusion UDP sur le réseau local, TTL 1 (ne sort pas du réseau). */
export function multicastBeacons(): LanBeacons {
  let socket: dgram.Socket | undefined;
  return {
    async start(onBeacon) {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('message', (data, rinfo) => {
        if (data.length > 4096) return;
        try {
          const raw = JSON.parse(data.toString('utf8')) as { app?: string; v?: number; profile?: Profile; port?: number };
          if (raw.app !== 'cyberpinball' || raw.v !== 1 || typeof raw.port !== 'number' || !raw.profile) return;
          onBeacon({ profile: raw.profile, port: raw.port }, rinfo.address);
        } catch {
          // balise illisible : ignorée
        }
      });
      socket.on('error', () => undefined);
      await new Promise<void>((resolve) => socket!.bind(LAN_PORT, () => resolve()));
      socket.addMembership(LAN_GROUP);
      socket.setMulticastTTL(1);
    },
    announce(beacon) {
      socket?.send(JSON.stringify({ app: 'cyberpinball', v: 1, ...beacon }), LAN_PORT, LAN_GROUP);
    },
    async stop() {
      await new Promise<void>((resolve) => (socket ? socket.close(() => resolve()) : resolve()));
      socket = undefined;
    },
  };
}

/** Réseau local simulé du processus : celui des bornes en mode « simulated » sans balise donnée. */
const SIMULATED_LAN = new Set<(beacon: Beacon, host: string) => void>();

/** Balise simulée : un bus en mémoire partagé par les bornes d'un même essai (adresse 127.0.0.1). */
export function memoryBeacons(bus: Set<(beacon: Beacon, host: string) => void>): LanBeacons {
  let listener: ((beacon: Beacon, host: string) => void) | undefined;
  return {
    async start(onBeacon) {
      listener = onBeacon;
      bus.add(onBeacon);
    },
    announce(beacon) {
      for (const l of bus) if (l !== listener) l(beacon, '127.0.0.1');
    },
    async stop() {
      if (listener) bus.delete(listener);
      listener = undefined;
    },
  };
}
