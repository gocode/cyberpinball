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
  declineRequest,
  directorySample,
  DIRECTORY_TOPIC,
  FILE_CHUNK,
  friendSeen,
  grantBadges,
  learnProfiles,
  loadSocial,
  parseLibraryMessage,
  parseLiveMessage,
  parseSocialMessage,
  peerProfile,
  playerSeed,
  receiveEvents,
  receiveReply,
  relationOf,
  removeFriend,
  requestFriend,
  saveSocial,
  setName,
  signProfile,
  SOCIAL_PROTOCOL,
  syncReply,
  unblockPlayer,
  verifyProfile,
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
type Duplex = NodeJS.ReadWriteStream & { remotePublicKey: Buffer; isInitiator: boolean; destroy(err?: Error): void; on(event: string, fn: (...args: never[]) => void): Duplex };
interface Swarm {
  keyPair: { publicKey: Buffer };
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
}

interface Peer {
  key: string;
  links: Set<Link>;
  profile?: Profile;
  presence?: Presence;
  lan?: { host: string; port: number };
}

export interface SocialNet {
  state(): SocialState;
  /** Réseau simulé : ses nœuds d'amorçage (127.0.0.1), pour les bornes fictives de la démonstration. */
  simulatedBootstrap(): { host: string; port: number }[] | undefined;
  status(): NetStatus;
  /** Ami relié en ce moment. */
  online(key: string): boolean;
  presenceOf(key: string): Presence | undefined;
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
  let swarm: Swarm | undefined;
  let dht: { destroy(): Promise<void> } | undefined;
  let testnet: { destroy(): Promise<void>; bootstrap: { host: string; port: number }[] } | undefined;
  let tcp: net.Server | undefined;
  let tcpPort = 0;
  let beacons: LanBeacons | undefined;
  let beaconTimer: NodeJS.Timeout | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  let presence: Presence = { status: 'menu', since: now().toISOString() };
  let status: NetStatus = { mode: opts.mode, running: false, internet: false, lan: false, peers: 0 };
  let starting: Promise<void> | undefined;

  const changed = () => {
    status = { ...status, peers: [...peers.values()].filter((p) => p.links.size).length };
    opts.onChange?.();
  };

  function commit(next: SocialState): void {
    if (next === state) return;
    state = next;
    saveSocial(opts.dataDir, state);
    changed();
  }

  function sendTo(key: string, message: SocialMessage): boolean {
    const link = [...(peers.get(key)?.links ?? [])][0];
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
    const link: Link = { stream, via, send: (m) => message.send(JSON.stringify(m)), sendChunk: (frame) => chunk.send(frame) !== false };
    const peer = peers.get(key) ?? { key, links: new Set<Link>() };
    peers.set(key, peer);
    peer.links.add(link);
    let gone = false;
    const detach = () => {
      if (gone) return;
      gone = true;
      peer.links.delete(link);
      if (!peer.links.size) {
        peer.presence = undefined;
        if (relationOf(state, key) === 'friend') commit(friendSeen(state, key, now()));
      }
      changed();
    };
    stream.on('close', detach);
    stream.on('error', () => detach());
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
        if (relationOf(state, key) === 'friend') commit(friendSeen(state, key, now()));
        if (first) {
          const sync = syncReply(state, key);
          if (sync) sendTo(key, { t: sync });
          if (relationOf(state, key) === 'friend') greetFriend(key);
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
  const followed = new Set<string>();
  function followPeers(): void {
    if (!swarm) return;
    const want = new Set([...state.friends.map((f) => f.key), ...state.outgoing.map((r) => r.key), ...state.incoming.map((r) => r.key)]);
    for (const key of want) if (!followed.has(key)) swarm.joinPeer(Buffer.from(key, 'hex'));
    for (const key of followed) if (!want.has(key)) swarm.leavePeer(Buffer.from(key, 'hex'));
    followed.clear();
    for (const key of want) followed.add(key);
    // Réseau local : se relier aux voisins qu'on suit, s'ils ne le sont pas déjà.
    for (const key of want) {
      const peer = peers.get(key);
      if (peer?.lan && !peer.links.size) connectLan(key, peer.lan.host, peer.lan.port);
    }
  }

  // ---------- Réseau local ----------

  function secretStream(isInitiator: boolean, socket: net.Socket, remotePublicKey?: Buffer): Duplex {
    const SecretStream = require('@hyperswarm/secret-stream');
    const DHT = require('hyperdht');
    return new SecretStream(isInitiator, socket, { keyPair: DHT.keyPair(playerSeed(state.key)), ...(remotePublicKey ? { remotePublicKey } : {}) });
  }

  const dialing = new Set<string>();
  function connectLan(key: string, host: string, port: number): void {
    if (dialing.has(key)) return;
    dialing.add(key);
    const socket = net.connect({ host, port });
    const stream = secretStream(true, socket, Buffer.from(key, 'hex'));
    const done = () => dialing.delete(key);
    stream.on('connect', () => {
      done();
      // La borne qui répond doit être celle de la balise.
      if (hex(stream.remotePublicKey) !== key) return stream.destroy();
      attach(stream, 'lan');
    });
    stream.on('error', done);
    stream.on('close', done);
  }

  function onBeacon(beacon: Beacon, host: string): void {
    const profile = verifyProfile(beacon.profile, now());
    if (!profile || profile.key === state.key.publicKey || state.blocked.includes(profile.key)) return;
    const peer = peers.get(profile.key) ?? { key: profile.key, links: new Set<Link>() };
    peers.set(profile.key, peer);
    peer.lan = { host, port: beacon.port };
    learn([profile], true);
    // Une seule des deux bornes appelle : celle qui suit l'autre, sinon la plus petite clé.
    const relation = relationOf(state, profile.key);
    const follows = relation === 'friend' || relation === 'outgoing' || relation === 'incoming';
    if (follows && !peer.links.size && (relation === 'outgoing' || state.key.publicKey < profile.key)) connectLan(profile.key, host, beacon.port);
  }

  async function startLan(): Promise<void> {
    if (!state.lan || opts.mode === 'off') return;
    const host = opts.host ?? '0.0.0.0';
    tcp = net.createServer((socket) => {
      const stream = secretStream(false, socket);
      stream.on('connect', () => attach(stream, 'lan'));
      stream.on('error', () => undefined);
    });
    await new Promise<void>((resolve, reject) => {
      tcp!.once('error', reject);
      tcp!.listen(0, host, () => resolve());
    });
    tcpPort = (tcp.address() as net.AddressInfo).port;
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
    swarm = new Hyperswarm({ keyPair: DHT.keyPair(playerSeed(state.key)), dht: node, maxPeers: 32, firewall: (key: Buffer) => state.blocked.includes(hex(key)) }) as Swarm;
    swarm.on('connection', (conn) => attach(conn, 'internet'));
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
        log(`Réseau des bornes : démarré (${opts.mode}, borne ${signProfile(state).name}).`); // i18n-ignore : journal
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
    for (const peer of peers.values()) for (const link of peer.links) link.stream.destroy();
    peers.clear();
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
  const friendLink = (key: string) => (relationOf(state, key) === 'friend' ? [...(peers.get(key)?.links ?? [])][0] : undefined);

  function broadcastFriends(message: SocialMessage): void {
    for (const f of state.friends) sendTo(f.key, message);
  }

  return {
    state: () => state,
    simulatedBootstrap: () => (opts.mode === 'simulated' ? (testnet?.bootstrap ?? opts.bootstrap) : undefined),
    status: () => status,
    online: (key) => !!peers.get(key)?.links.size,
    presenceOf: (key) => peers.get(key)?.presence,
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
    },
    unblock: (key) => commit(unblockPlayer(state, key)),
    setShareLibrary: (on) => commit({ ...state, shareLibrary: on }),
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
