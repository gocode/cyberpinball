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
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as net from 'node:net';
import * as os from 'node:os';
import {
  acceptRequest,
  addEvent,
  countryOfLocale,
  isCountry,
  loadRankings,
  mergeRankings,
  rankedId,
  rankingsFile,
  rankingAvatars,
  rankingsSample,
  RANKINGS_BATCH,
  saveRankings,
  signScore,
  verifyScore,
  type RankedScore,
  type RankingStore,
  avatarFileOf,
  avatarHashOf,
  avatarPath,
  avatarPeers,
  decodeAvatarData,
  keepAvatars,
  pruneAvatarFiles,
  readAvatarFile,
  setOwnAvatar,
  setPeerAvatar,
  writeAvatarFile,
  type AvatarImage,
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
  type ByteRate,
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
 * Démarrage raté (Internet), ou réseau local qui n'a pas pu s'ouvrir : nouvel essai après ce délai,
 * doublé à chaque échec jusqu'au plafond. Sans lui, une borne démarrée avant son réseau restait
 * « Réseau indisponible » jusqu'au prochain lancement.
 */
const RETRY_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
/** Balise sans aucune carte réseau à laquelle s'abonner (machine hors réseau, câble débranché). */
export const NO_INTERFACE = 'no-interface';
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
/**
 * Deux bornes qui s'appellent au même instant : Hyperswarm garde chez la plus grande clé son propre
 * appel encore en cours et coupe celui de l'autre, même si cet appel va échouer (entrant bloqué
 * chez l'autre). Chaque relance est donc tirée au hasard autour de son rythme, pour que les deux
 * bornes ne retombent pas ensemble ; et un appel coupé avant le bonjour est relancé vite, sans
 * attendre les 1 s, 5 s puis 15 s de Hyperswarm.
 */
const REDIAL_SOON_MS = [300, 1_500] as const;
/** Au plus tant de relances avancées par ami et par minute : un ami qui coupe toujours avant le bonjour ne fait pas boucler. */
const REDIAL_SOON_MAX = 6;
const jittered = (delay: number) => Math.round(delay * (0.5 + Math.random()));
/** Balise d'un ami reçue sans liaison locale : la borne qui n'appelle pas d'habitude appelle passé ce délai. */
const LAN_FALLBACK_MS = 2 * BEACON_MS;
/** Un avatar demandé sans réponse : redemandé au plus à ce rythme (liaison tombée, autre borne occupée). */
const AVATAR_ASK_MS = 30_000;

export interface NetStatus {
  mode: SocialNetMode;
  running: boolean;
  /** Connecté au réseau Internet (DHT rejointe). */
  internet: boolean;
  /** Balise du réseau local active. */
  lan: boolean;
  /** Bornes reliées en ce moment. */
  peers: number;
  /** Le réseau des bornes ne tourne pas (Internet) : bloquant, réessayé tout seul. */
  error?: string;
  /**
   * Le réseau local ne passe pas (abonnement à la multidiffusion refusé, aucune carte réseau :
   * NO_INTERFACE, port pris) : Internet continue sans lui, réessayé tout seul. Jamais bloquant.
   */
  lanError?: string;
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
  /** Ce qui empêche la balise de recevoir en ce moment (aucune carte abonnée) ; undefined : elle reçoit. */
  problem?(): string | undefined;
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
  /** Essais : premier délai avant un nouvel essai après un échec (RETRY_MS). */
  retryMs?: number;
  /** Langue du système (« fr-FR ») : le pays par défaut des classements, tant que le joueur n'en a pas choisi. */
  systemLocale?: () => string | undefined;
}

/** Scores des classements national et mondial (rankings.ts) : entre toutes les bornes, pas seulement entre amis. */
type ScoresMessage = { t: 'scores'; scores: RankedScore[] };
/** Un score à publier : le reste (clé, nom, pays, signature) vient de la borne. */
/** Ce que la partie donne ; le nom, le pays et l'avatar sont ceux de la borne au moment de signer. */
export type ScoreToPublish = Omit<RankedScore, 'key' | 'name' | 'country' | 'avatar' | 'sig'>;

/** Messages des services posés sur le réseau des amis : bibliothèque partagée, partie en direct. */
export type FriendMessage = LibraryMessage | LiveMessage;

interface Link {
  stream: Duplex;
  send(message: SocialMessage | FriendMessage | ScoresMessage): void;
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
  /** Empreinte de l'avatar qu'il annonce (bonjour, message « avatar ») ; null : aucun ; absente : pas encore dit. */
  avatar?: string | null;
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
  /** Débit des téléchargements depuis les amis, en octets par seconde (ratelimit.ts) ; 0 : sans limite. */
  setDownloadRate(rate: ByteRate): void;
  /**
   * Message d'un service (bibliothèque, partie en direct) à un ami relié ; false : pas relié,
   * ou pas un ami. Rien de ces services ne part vers un joueur qui n'est pas un ami.
   */
  send(key: string, message: FriendMessage): boolean;
  /** Morceau de fichier à un ami, en respectant le débit du flux ; false : plus relié. */
  sendChunk(key: string, frame: Buffer): Promise<boolean>;
  /**
   * Mon avatar (image contrôlée par readAvatarImage), ou undefined pour le retirer : enregistré,
   * annoncé aux bornes reliées ; mes amis et les joueurs d'une demande en cours le redemandent.
   */
  setAvatar(image: AvatarImage | undefined): void;
  /** Fichier de l'avatar d'un joueur (soi compris) ; undefined : pas d'avatar connu, ses initiales. */
  avatarFile(key: string): string | undefined;
  /**
   * Avatar d'un joueur classé, d'après l'empreinte jointe à ses scores : le fichier s'il est là ;
   * sinon demandé à sa borne, ou aux bornes reliées, et l'écran se redessine à son arrivée.
   */
  rankingAvatar(key: string, hash: string): string | undefined;
  /**
   * Mon score aux classements national et mondial : signé, gardé, envoyé à toutes les bornes reliées.
   * Rien si le partage ou la publication des scores est coupé ; rend le score publié.
   */
  publishScore(score: ScoreToPublish): RankedScore | undefined;
  /** Les classements connus de cette borne (rankings.ts). */
  rankings(): RankingStore;
  /** Masquer sur cette borne un score (son identifiant, rankedId) ou tous ceux d'un joueur. */
  hideScore(id: string): void;
  hidePlayer(key: string): void;
  /** Publier ou non mes scores aux classements (activé par défaut). */
  setShareScores(on: boolean): void;
  /** Pays déclaré ; undefined : revenir à celui de Windows. */
  setCountry(code: string | undefined): void;
  /** L'écran « Votre profil de joueur » a été proposé : il ne revient plus (profileWelcomeDue). */
  markProfileOffered(): void;
  /** Mon pays pour les classements : celui choisi, sinon celui de Windows ; undefined : inconnu. */
  country(): string | undefined;
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
  // Classements national et mondial : relus une fois, écrits peu après chaque arrivée (les relais vont par rafales).
  const rankingsPath = rankingsFile(opts.dataDir);
  const rankingsRead = loadRankings(rankingsPath, now());
  if (rankingsRead.setAside) opts.log?.(`Classements : ${rankingsPath} illisible, mis de côté (${rankingsRead.setAside}).`); // i18n-ignore : journal
  const rankings = rankingsRead.store;
  const rankingsReadOnly = Boolean(rankingsRead.newer);
  let rankingsTimer: NodeJS.Timeout | undefined;
  function saveRankingsSoon(): void {
    if (rankingsReadOnly || rankingsTimer) return;
    rankingsTimer = setTimeout(() => {
      rankingsTimer = undefined;
      saveOrWarn(rankingsPath, () => saveRankings(rankingsPath, rankings));
    }, 2000);
    rankingsTimer.unref?.();
  }
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
  /** Nouvel essai du démarrage (Internet) ou du réseau local, et le nombre d'échecs de suite. */
  let retryTimer: NodeJS.Timeout | undefined;
  let retries = 0;
  let lanRetryTimer: NodeJS.Timeout | undefined;
  let lanRetries = 0;
  const retryDelay = (n: number) => Math.min(RETRY_MAX_MS, (opts.retryMs ?? RETRY_MS) * 2 ** n);
  let redialAt = 0;
  const redialsSoon = new Map<string, number[]>();
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
    // Ami ou demande : son avatar, s'il en a un ; plus rien des deux : le sien sort.
    if (before !== after) {
      tidyAvatars();
      syncAvatar(key);
    }
  }

  // ---------- Avatars ----------

  /** Empreinte de mon avatar, telle que l'annonce le bonjour. */
  const ownAvatarHash = () => (state.avatar ? avatarHashOf(state.avatar) : undefined);
  /** Demandes d'avatar en vol : clé -> empreinte et heure, pour ne pas redemander à chaque message. */
  const avatarAsked = new Map<string, { hash: string; at: number }>();

  /** Avatars de ceux qui ne sont plus ni amis ni en demande : hors de l'état, et leurs fichiers rangés. */
  function tidyAvatars(): void {
    const kept = keepAvatars(state);
    commitQuietly(kept.state);
    try {
      // Les avatars des classements restent tant qu'un score gardé les porte.
      const ranked = [...publicAvatars()].map(heldAvatar).filter((f): f is string => !!f);
      pruneAvatarFiles(opts.dataDir, [...kept.files, ...ranked]);
    } catch (error) {
      log(`Réseau des bornes : rangement des avatars impossible (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  /**
   * L'avatar qu'un ami (ou un joueur d'une demande en cours) annonce : demandé s'il manque ou a
   * changé, retiré s'il n'en a plus. Des autres joueurs, seul l'avatar joint à leurs scores se
   * demande (askRankingAvatar).
   */
  function syncAvatar(key: string): void {
    const peer = peers.get(key);
    if (!peer || peer.avatar === undefined || !avatarPeers(state).has(key)) return;
    const held = state.peerAvatars?.[key];
    if (peer.avatar === null) {
      if (held) tidyAfter(setPeerAvatar(state, key, undefined));
      return;
    }
    if (held && avatarHashOf(held) === peer.avatar && readAvatarFile(opts.dataDir, held)) return;
    const asked = avatarAsked.get(key);
    if (asked && asked.hash === peer.avatar && ms() - asked.at < AVATAR_ASK_MS) return;
    if (sendTo(key, { t: 'avatar-get', avatar: peer.avatar })) avatarAsked.set(key, { hash: peer.avatar, at: ms() });
  }

  function tidyAfter(next: SocialState): void {
    commitQuietly(next);
    tidyAvatars();
  }

  /**
   * Un avatar, à qui le demande : le mien à un ami ou un joueur d'une demande en cours ; et, à toute
   * borne, celui que des scores publiés aux classements portent (le mien ou celui d'un autre joueur,
   * s'il est ici) : ces avatars-là sont publics, l'empreinte jointe au score signé les contrôle.
   */
  function sendAvatar(key: string, hash: string): void {
    const own = ownAvatarHash() === hash && avatarPeers(state).has(key);
    if (!own && !publicAvatars().has(hash)) return;
    const file = own ? state.avatar! : heldAvatar(hash);
    const image = file ? readAvatarFile(opts.dataDir, file) : undefined;
    if (!image) {
      if (own) log('Réseau des bornes : fichier de mon avatar illisible, pas envoyé.'); // i18n-ignore : journal
      return;
    }
    sendTo(key, { t: 'avatar-data', avatar: hash, data: image.bytes.toString('base64') });
  }

  // ---------- Avatars des classements ----------

  /** Empreintes des avatars que portent les scores des classements : publiques. */
  function publicAvatars(): Set<string> {
    return new Set([...rankingAvatars(rankings).values()].filter((h): h is string => !!h));
  }

  /** Fichier d'avatar de cette empreinte, s'il est dans <données>\avatars. */
  function heldAvatar(hash: string): string | undefined {
    return ['jpg', 'png', 'webp'].map((ext) => `${hash}.${ext}`).find((name) => fs.existsSync(avatarPath(opts.dataDir, name)));
  }

  /** Avatars des classements demandés : empreinte -> heure de la demande. */
  const rankingAsked = new Map<string, number>();
  /** Bornes interrogées au plus pour un avatar de classement dont la borne du joueur n'est pas reliée. */
  const RANKING_ASK_PEERS = 3;

  function askRankingAvatar(key: string, hash: string): void {
    const asked = rankingAsked.get(hash);
    if (asked !== undefined && ms() - asked < AVATAR_ASK_MS) return;
    if (!publicAvatars().has(hash)) return;
    // Sa borne d'abord ; sinon quelques bornes reliées, qui l'ont peut-être déjà.
    const greeted = (k: string) => [...(peers.get(k)?.links ?? [])].some((l) => l.greeted);
    const to = greeted(key) ? [key] : [...peers.keys()].filter(greeted).slice(0, RANKING_ASK_PEERS);
    let sent = false;
    for (const k of to) sent = sendTo(k, { t: 'avatar-get', avatar: hash }) || sent;
    if (sent) rankingAsked.set(hash, ms());
  }

  /** Image d'un avatar de classement demandé : contrôlée par son empreinte, gardée. */
  function receiveRankingAvatar(hash: string, data: string): boolean {
    if (!rankingAsked.has(hash) || !publicAvatars().has(hash)) return false;
    rankingAsked.delete(hash);
    const image = decodeAvatarData(data, hash);
    if (!image) return false;
    try {
      writeAvatarFile(opts.dataDir, image);
    } catch (error) {
      log(`Réseau des bornes : avatar d'un classement pas enregistré (${(error as Error).message}).`); // i18n-ignore : journal
      return false;
    }
    changed();
    return true;
  }

  /**
   * Image reçue (parseSocialMessage l'a déjà contrôlée) : un avatar de classement demandé, et celle
   * qu'un ami ou un joueur d'une demande en cours annonce, gardées.
   */
  function receiveAvatar(key: string, hash: string, data: string): void {
    receiveRankingAvatar(hash, data);
    const peer = peers.get(key);
    if (!peer || peer.avatar !== hash || !avatarPeers(state).has(key)) return;
    avatarAsked.delete(key);
    const image = decodeAvatarData(data, hash);
    if (!image) return;
    let file: string;
    try {
      file = writeAvatarFile(opts.dataDir, image);
    } catch (error) {
      return log(`Réseau des bornes : avatar de ${nameOf(key)} pas enregistré (${(error as Error).message}).`); // i18n-ignore : journal
    }
    tidyAfter(setPeerAvatar(state, key, file));
    if (traced(key)) log(`Réseau des bornes : avatar de ${nameOf(key)} reçu (${Math.round(image.bytes.length / 1024)} Ko).`); // i18n-ignore : journal
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
    scheduleRedial(jittered(REDIAL_FAST_MS));
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
    scheduleRedial(jittered(startedAt !== undefined && ms() - startedAt < REDIAL_FAST_FOR_MS ? REDIAL_FAST_MS : REDIAL_SLOW_MS));
  }

  function scheduleRedial(delay: number): void {
    if (redialTimer) clearTimeout(redialTimer);
    redialAt = Date.now() + delay;
    redialTimer = setTimeout(redial, delay);
    redialTimer.unref?.();
  }

  /** Appel coupé avant le bonjour, plus aucune liaison : relance avancée, à un instant tiré au hasard. */
  function redialSoon(key: string): void {
    const recent = (redialsSoon.get(key) ?? []).filter((at) => Date.now() - at < 60_000);
    if (recent.length >= REDIAL_SOON_MAX) return;
    redialsSoon.set(key, [...recent, Date.now()]);
    const [min, max] = REDIAL_SOON_MS;
    const delay = min + Math.round(Math.random() * (max - min));
    if (swarm && (!redialTimer || redialAt > Date.now() + delay)) scheduleRedial(delay);
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
        // Scores des classements : de toute borne reliée, chacun vérifié par sa signature.
        if (raw && typeof raw === 'object' && (raw as { t?: unknown }).t === 'scores') return receiveScores(key, (raw as { scores?: unknown }).scores);
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
      if (via === 'internet' && !link.greeted && !peer.links.size && followed.has(key)) redialSoon(key);
      scheduleGrace();
      changed();
    };
    stream.on('close', detach);
    stream.on('error', (error: Error) => {
      link.error ??= error?.message ?? String(error);
      detach();
    });
    channel.open();
    const avatar = ownAvatarHash();
    link.send({ t: 'hello', profile: signProfile(state), dir: directorySample(state), ...(avatar ? { avatar } : {}) });
    // Une part des classements connus ; une borne d'avant les classements ignore ce message.
    const sample = rankingsSample(rankings, state.key.publicKey);
    if (sample.length) link.send({ t: 'scores', scores: sample });
    changed();
  }

  /**
   * Scores reçus : vérifiés (forme et signature), ceux d'un joueur bloqué laissés ; les nouveaux
   * gardés, puis relayés aux autres bornes reliées. Ce qui est déjà connu s'arrête là.
   */
  function receiveScores(from: string, raw: unknown): void {
    if (!Array.isArray(raw) || state.blocked.includes(from)) return;
    const scores = raw.slice(0, RANKINGS_BATCH).map((s) => verifyScore(s, now())).filter((s): s is RankedScore => !!s && !state.blocked.includes(s.key));
    const fresh = mergeRankings(rankings, scores, state.key.publicKey, now());
    if (!fresh.length) return;
    saveRankingsSoon();
    relayScores(fresh, from);
    changed();
  }

  /** Scores à toutes les bornes reliées et saluées, sauf celle d'où ils viennent. */
  function relayScores(scores: RankedScore[], except?: string): void {
    for (const peer of peers.values()) {
      if (peer.key === except) continue;
      const link = bestLink(peer.key);
      if (link?.greeted) link.send({ t: 'scores', scores });
    }
  }

  const myCountry = () => state.country ?? countryOfLocale(opts.systemLocale?.());

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
        // Une borne d'avant les avatars n'en annonce pas : comme aucun.
        peer.avatar = message.avatar ?? null;
        syncAvatar(key);
        if (first) {
          // Bonjour reçu sur cette liaison : elle compte pour la présence.
          const appeared = book.up(key, link, ms());
          if (traced(key)) {
            // Trouvé pendant la recherche : le délai depuis son début, au journal (découverte lente).
            const found = appeared && startedAt !== undefined && ms() - startedAt < REDIAL_FAST_FOR_MS ? `, ${((ms() - startedAt) / 1000).toFixed(1)} s après le début de la recherche` : ''; // i18n-ignore : journal
            log(`Réseau des bornes : liaison ${viaText(link.via)} ${link.stream.isInitiator ? 'sortante' : 'entrante'} avec ${nameOf(key)} ouverte (${book.links(key)} liaison(s))${appeared ? ` : en ligne${found}` : ''}.`); // i18n-ignore : journal
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
      case 'avatar':
        peer.avatar = message.avatar ?? null;
        syncAvatar(key);
        return;
      case 'avatar-get':
        sendAvatar(key, message.avatar);
        return;
      case 'avatar-data':
        receiveAvatar(key, message.avatar, message.data);
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

  /**
   * Réseau local : une panne ici (multidiffusion refusée, carte sans réseau, port pris) ne touche
   * jamais Internet. Tout ce qui s'était ouvert se referme, l'erreur se montre dans « Partage et
   * réseau », et un nouvel essai part tout seul. Ne lève jamais.
   */
  async function startLan(): Promise<void> {
    if (!state.lan || opts.mode === 'off') return;
    if (lanRetryTimer) clearTimeout(lanRetryTimer);
    lanRetryTimer = undefined;
    try {
      await openLan();
      lanRetries = 0;
    } catch (error) {
      const message = (error as Error).message;
      await stopLan();
      const delay = retryDelay(lanRetries++);
      status = { ...status, lanError: message };
      log(`Réseau des bornes : réseau local indisponible (${message}), Internet seul ; nouvel essai dans ${Math.round(delay / 1000)} s.`); // i18n-ignore : journal
      lanRetryTimer = setTimeout(() => {
        lanRetryTimer = undefined;
        if (status.running && state.lan) void startLan().then(changed);
      }, delay);
      lanRetryTimer.unref?.();
    }
  }

  /** La balise reçoit-elle ? Suivi à chaque annonce : une carte qui arrive ou repart change l'état. */
  function followBeacons(): void {
    const problem = beacons?.problem?.();
    if (problem === status.lanError) return;
    if (problem) log(`Réseau des bornes : balise locale sans réseau (${problem}), nouvel essai à chaque annonce.`); // i18n-ignore : journal
    else log('Réseau des bornes : balise locale de nouveau à l’écoute.'); // i18n-ignore : journal
    const { lanError: _, ...rest } = status;
    status = problem ? { ...rest, lanError: problem } : rest;
    changed();
  }

  async function openLan(): Promise<void> {
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
    const announce = () => {
      beacons?.announce({ profile: signProfile(state), port: tcpPort });
      followBeacons();
    };
    const { lanError: _, ...rest } = status;
    status = { ...rest, lan: true };
    announce();
    beaconTimer = setInterval(announce, BEACON_MS);
    beaconTimer.unref?.();
  }

  async function stopLan(): Promise<void> {
    lanActive = false;
    if (lanRetryTimer) clearTimeout(lanRetryTimer);
    lanRetryTimer = undefined;
    if (beaconTimer) clearInterval(beaconTimer);
    beaconTimer = undefined;
    await beacons?.stop();
    beacons = undefined;
    for (const peer of peers.values()) for (const link of peer.links) if (link.via === 'lan') link.stream.destroy();
    await new Promise<void>((resolve) => (tcp ? tcp.close(() => resolve()) : resolve()));
    tcp = undefined;
    const { lanError: _, ...rest } = status;
    status = { ...rest, lan: false };
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
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    starting ??= (async () => {
      try {
        await startInternet();
        // Le réseau local ne lève jamais : sa panne laisse Internet tourner (lanError).
        await startLan();
        status = { ...status, running: true, error: undefined };
        retries = 0;
        tidyAvatars();
        beginSearch();
        log(`Réseau des bornes : démarré (${opts.mode}, borne ${signProfile(state).name}, ${state.friends.length} ami(s) à chercher).`); // i18n-ignore : journal
      } catch (error) {
        const message = (error as Error).message;
        // Ce qui s'était ouvert se referme : le nouvel essai repart de rien, sans DHT en double.
        await teardown();
        const delay = retryDelay(retries++);
        status = { ...status, error: message };
        log(`Réseau des bornes : démarrage impossible (${message}) ; nouvel essai dans ${Math.round(delay / 1000)} s.`); // i18n-ignore : journal
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void start();
        }, delay);
        retryTimer.unref?.();
      } finally {
        starting = undefined;
        changed();
      }
    })();
    return starting;
  }

  async function stop(): Promise<void> {
    await starting;
    // Après le démarrage en cours : son échec a pu programmer un nouvel essai.
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    retries = 0;
    lanRetries = 0;
    await teardown();
    changed();
  }

  /** Tout ce que start a pu ouvrir, refermé (arrêt, ou démarrage raté à mi-chemin). */
  async function teardown(): Promise<void> {
    await stopLan();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
    for (const timer of [graceTimer, searchTimer, redialTimer]) if (timer) clearTimeout(timer);
    graceTimer = searchTimer = redialTimer = undefined;
    redialsSoon.clear();
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
    publishScore(score) {
      if (!state.enabled || state.shareScores === false) return undefined;
      const country = myCountry();
      const avatar = ownAvatarHash();
      const signed = signScore(state.key, { ...score, name: state.name, ...(country ? { country } : {}), ...(avatar ? { avatar } : {}) });
      const kept = mergeRankings(rankings, [signed], state.key.publicKey, now());
      if (!kept.length) return undefined;
      saveRankingsSoon();
      relayScores(kept);
      changed();
      return signed;
    },
    rankings: () => rankings,
    hideScore(id) {
      if (rankings.hidden.includes(`s:${id}`)) return;
      rankings.hidden.push(`s:${id}`);
      saveRankingsSoon();
      changed();
    },
    hidePlayer(key) {
      if (key === state.key.publicKey || rankings.hidden.includes(`k:${key}`)) return;
      rankings.hidden.push(`k:${key}`);
      saveRankingsSoon();
      changed();
    },
    setShareScores(on) {
      const { shareScores: _, ...rest } = state;
      commit(on ? rest : { ...rest, shareScores: false });
    },
    markProfileOffered() {
      if (!state.profileOffered) commit({ ...state, profileOffered: now().toISOString() });
    },
    setCountry(code) {
      const { country: _, ...rest } = state;
      commit(code && isCountry(code) ? { ...rest, country: code } : rest);
    },
    country: () => myCountry(),
    setAvatar(image) {
      const file = image ? writeAvatarFile(opts.dataDir, image) : undefined;
      tidyAfter(setOwnAvatar(state, file));
      // Toutes les bornes reliées l'apprennent ; seuls mes amis et les demandes en cours le redemandent.
      const notice: SocialMessage = { t: 'avatar', ...(image ? { avatar: image.hash } : {}) };
      for (const peer of peers.values()) for (const link of peer.links) if (link.greeted) link.send(notice);
    },
    avatarFile(key) {
      const file = avatarFileOf(state, key);
      return file ? avatarPath(opts.dataDir, file) : undefined;
    },
    rankingAvatar(key, hash) {
      const held = heldAvatar(hash);
      if (held) return avatarPath(opts.dataDir, held);
      askRankingAvatar(key, hash);
      return undefined;
    },
    setDownloadRate: (rate) => {
      const { downloadRate: _, ...rest } = state;
      commit(rate > 0 ? { ...rest, downloadRate: rate } : rest);
    },
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

/** Adresses IPv4 des cartes réseau de la machine (hors bouclage) : celles où la balise s'abonne. */
function lanInterfaces(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfoIPv4 => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

/**
 * Vraie balise : multidiffusion UDP sur le réseau local, TTL 1 (ne sort pas du réseau).
 *
 * Le groupe se rejoint carte par carte, et de nouveau à chaque annonce. `addMembership` sans carte
 * prend celle de la route par défaut, et lève (EHOSTUNREACH, ENODEV) quand il n'y en a pas : borne
 * démarrée avant son réseau, câble débranché, VPN qui prend la route. Ici une carte refusée n'empêche
 * pas les autres, aucune n'empêche le démarrage, et une carte qui arrive plus tard est prise à
 * l'annonce suivante. `problem()` dit ce qui empêche de recevoir tant qu'aucune n'est abonnée.
 * `options` : les essais donnent leurs cartes, leur adresse d'écoute (127.0.0.1, sans pare-feu) et leur port.
 */
export function multicastBeacons(options: { interfaces?: () => string[]; host?: string; port?: number } = {}): LanBeacons {
  const interfaces = options.interfaces ?? lanInterfaces;
  const port = options.port ?? LAN_PORT;
  let socket: dgram.Socket | undefined;
  const joined = new Set<string>();
  let problem: string | undefined;

  function join(): void {
    if (!socket) return;
    const present = new Set(interfaces());
    for (const address of joined) {
      if (present.has(address)) continue;
      joined.delete(address);
      try {
        socket.dropMembership(LAN_GROUP, address);
      } catch {
        // carte déjà partie : rien à quitter
      }
    }
    let failure: string | undefined;
    for (const address of present) {
      if (joined.has(address)) continue;
      try {
        socket.addMembership(LAN_GROUP, address);
        joined.add(address);
      } catch (error) {
        failure ??= `${(error as Error).message} (${address})`;
      }
    }
    problem = joined.size ? undefined : (failure ?? NO_INTERFACE);
  }

  return {
    async start(onBeacon) {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.on('message', (data, rinfo) => {
        if (data.length > 4096) return;
        try {
          const raw = JSON.parse(data.toString('utf8')) as { app?: string; v?: number; profile?: Profile; port?: number };
          if (raw.app !== 'cyberpinball' || raw.v !== 1 || typeof raw.port !== 'number' || !raw.profile) return;
          onBeacon({ profile: raw.profile, port: raw.port }, rinfo.address);
        } catch {
          // balise illisible : ignorée
        }
      });
      // Port pris, adresse refusée : levé ici, jamais une attente sans fin.
      await new Promise<void>((resolve, reject) => {
        s.once('error', reject);
        s.bind(port, options.host, () => {
          s.removeListener('error', reject);
          resolve();
        });
      }).catch((error: unknown) => {
        s.close();
        throw error;
      });
      s.on('error', () => undefined);
      s.setMulticastTTL(1);
      socket = s;
      joined.clear();
      join();
    },
    announce(beacon) {
      join();
      // Sans carte abonnée, l'envoi échouerait de même : rien ne part, l'annonce suivante réessaie.
      if (!joined.size) return;
      socket?.send(JSON.stringify({ app: 'cyberpinball', v: 1, ...beacon }), port, LAN_GROUP);
    },
    async stop() {
      const s = socket;
      socket = undefined;
      joined.clear();
      problem = undefined;
      await new Promise<void>((resolve) => (s ? s.close(() => resolve()) : resolve()));
    },
    problem: () => problem,
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
