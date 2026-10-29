// Réseau des bornes, partie sans réseau : le profil du joueur, l'annuaire, les amis, la présence
// et les évènements partagés (docs/recherche/partage-medias.md, § 4 et § 12). Le transport
// (Hyperswarm sur Internet, multidiffusion et TCP sur le réseau local) est dans
// app/src/social-net.ts ; ici, seulement ce qui se décide sur des données : chaque message reçu
// passe par parseSocialMessage, chaque changement d'état par une fonction pure de ce module.
//
// Confiance : la connexion elle-même est authentifiée (Noise, clé Ed25519 de chaque borne), donc
// un message direct vient bien de la clé du pair. Seuls les profils relayés par l'annuaire, qui
// passent de borne en borne, portent leur propre signature, vérifiée avant d'entrer.
//
// Tenu dans <données>\social.json : la clé privée du joueur y est, ce fichier ne se partage pas.

import { createPrivateKey } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dmdScore } from './highscores';
import { t } from './i18n';
import { createPlayerKey, isPlayerPublicKey, playerFingerprint, signText, tableIdentity, verifyText, type PlayerKey } from './sharing';
import type { TableEntry } from './tables';

export const SOCIAL_FILE = 'social.json';
/** Canal Protomux des échanges entre bornes ; une autre application (chat, soirées) aura le sien. */
export const SOCIAL_PROTOCOL = 'cyberpinball/social/1';
/** Sujet de l'annuaire : toutes les bornes dont le partage est activé s'y retrouvent. */
export const DIRECTORY_TOPIC = 'cyberpinball/annuaire/1';

export const NAME_MIN = 2;
export const NAME_MAX = 24;
/** Profils gardés dans l'annuaire local ; au-delà, les moins récemment vus sortent. */
export const DIRECTORY_MAX = 2000;
/** Un profil non revu depuis ce délai sort de l'annuaire. */
export const DIRECTORY_TTL_DAYS = 60;
/** Profils envoyés au plus dans un message d'annuaire. */
export const DIRECTORY_BATCH = 200;
/** Demandes reçues gardées au plus (au-delà, les plus anciennes sortent). */
export const INCOMING_MAX = 50;
/** Évènements gardés par ami, et pour soi. */
export const EVENTS_MAX = 30;

// ---------------------------------------------------------------------------
// Types

/** Profil public d'un joueur, signé par sa clé : ce que l'annuaire relaie. */
export interface Profile {
  key: string;
  name: string;
  /** Date du profil (ISO) : le plus récent l'emporte. */
  at: string;
  sig: string;
}

export interface PresenceTable {
  title: string;
  manufacturer?: string;
  year?: number;
  vpsId?: string;
}

export type PresenceStatus = 'menu' | 'playing';
export interface Presence {
  status: PresenceStatus;
  /** Table en cours (status « playing »). */
  table?: PresenceTable;
  /** Depuis quand (ISO). */
  since: string;
}

export type SocialEventKind = 'record' | 'badge' | 'played';
export interface SocialEvent {
  /** Identifiant unique (clé du joueur + horodatage + numéro), pour ne pas compter deux fois. */
  id: string;
  kind: SocialEventKind;
  at: string;
  table?: PresenceTable;
  /** record : score, place au tableau (1 : meilleur score), initiales. */
  score?: number;
  rank?: number;
  initials?: string;
  /** badge : identifiant (badges.ts). */
  badge?: string;
  /** played : durée de la partie. */
  seconds?: number;
}

export interface Friend {
  key: string;
  name: string;
  /** Date du profil qui a donné ce nom : seul un profil plus récent le change (renamePeer). */
  nameAt?: string;
  /** Amis depuis (ISO). */
  since: string;
  /** Dernière connexion vue (ISO). */
  lastSeen?: string;
  /** Du plus récent au plus ancien. */
  events: SocialEvent[];
}

export interface FriendRequest {
  key: string;
  name: string;
  /** Date du profil qui a donné ce nom. */
  nameAt?: string;
  at: string;
  /** Vue sur le réseau local. */
  lan?: boolean;
}

export interface DirectoryEntry {
  profile: Profile;
  /** Dernière fois que ce profil a été vu, directement ou relayé (ISO). */
  seen: string;
  /** Dernière balise reçue du réseau local (ISO) : « à proximité » tant qu'elle est récente. */
  lanSeen?: string;
}

/** Une borne est « à proximité » tant que sa balise du réseau local date de moins que ce délai. */
export const NEARBY_MS = 60_000;

export interface EarnedBadge {
  id: string;
  at: string;
}

export interface SocialState {
  version: 1;
  /** Partage activé : présence, annuaire, demandes d'amis. Activé par défaut (décidé le 28/10/2026). */
  enabled: boolean;
  /** Recherche des bornes du réseau local. */
  lan: boolean;
  /**
   * Bibliothèque partagée avec mes amis : la liste de mes tables, leurs médias et leurs parties
   * (friendlibrary.ts). Activée par défaut entre amis (décidé le 29/10/2026).
   */
  shareLibrary: boolean;
  /** Le joueur a lui-même choisi de partager ou non : seul ce choix l'emporte sur le partage par défaut. */
  shareLibraryChosen?: boolean;
  name: string;
  /** Date du nom actuel : le profil signé la porte. */
  nameAt: string;
  key: PlayerKey;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: string[];
  /** Demandes refusées, pour répondre « non » sans les reposer à l'écran si le joueur la renvoie. */
  declined: { key: string; at: string }[];
  directory: DirectoryEntry[];
  /** Évènements de ce joueur, du plus récent au plus ancien. */
  events: SocialEvent[];
  badges: EarnedBadge[];
  /** Badges déjà évalués une fois : ceux mérités ensuite deviennent des évènements (badges.ts). */
  badgesChecked: boolean;
}

// ---------------------------------------------------------------------------
// Noms

/** Nom affichable, nettoyé ; undefined s'il est refusé (trop court, trop long, caractères de contrôle). */
export function normalizeName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return undefined;
  // Lettres, chiffres, espaces et un peu de ponctuation : ni contrôle, ni symbole qui imite une interface.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u.test(name)) return undefined;
  return name;
}

/** Clé de recherche d'un nom : sans accents ni casse, espaces simples. */
export function playerNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Quatre caractères tirés de la clé (« A1B2 ») : deux joueurs du même nom se distinguent. */
export function shortTag(key: string): string {
  return playerFingerprint(key).slice(0, 4).toUpperCase();
}

/** « Alexis #A1B2 » */
export function displayName(name: string, key: string): string {
  return `${name} #${shortTag(key)}`;
}

// ---------------------------------------------------------------------------
// Profil et clés

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Texte signé d'un profil : l'application, la clé, le nom et la date, dans cet ordre. */
function profileText(key: string, name: string, at: string): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'profile', key, name, at });
}

export function signProfile(state: Pick<SocialState, 'key' | 'name' | 'nameAt'>): Profile {
  return { key: state.key.publicKey, name: state.name, at: state.nameAt, sig: signText(profileText(state.key.publicKey, state.name, state.nameAt), state.key) };
}

/** Profil reçu, vérifié (clé, nom, date, signature) ; undefined sinon. */
export function verifyProfile(raw: unknown, now = new Date()): Profile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const key = p.key, sig = p.sig, at = p.at;
  const name = normalizeName(p.name);
  if (typeof key !== 'string' || !isPlayerPublicKey(key) || !name || name !== p.name || !isIso(at) || typeof sig !== 'string' || sig.length > 200) return undefined;
  // Une date dans le futur gagnerait toujours contre les profils suivants.
  if (Date.parse(at) > now.getTime() + 10 * 60_000) return undefined;
  return verifyText(profileText(key, name, at), sig, key) ? { key, name, at, sig } : undefined;
}

/** Graine Ed25519 (32 octets) de la clé du joueur : HyperDHT en refait la même paire (DHT.keyPair(seed)). */
export function playerSeed(key: PlayerKey): Buffer {
  const jwk = createPrivateKey(key.privateKey).export({ format: 'jwk' });
  return Buffer.from(jwk.d!, 'base64url');
}

// ---------------------------------------------------------------------------
// Fichier

function defaultName(key: string): string {
  return t('Joueur {tag}', { tag: shortTag(key) });
}

export function newSocialState(now = new Date()): SocialState {
  const key = createPlayerKey();
  return { version: 1, enabled: true, lan: true, shareLibrary: true, name: defaultName(key.publicKey), nameAt: now.toISOString(), key, friends: [], incoming: [], outgoing: [], blocked: [], declined: [], directory: [], events: [], badges: [], badgesChecked: false };
}

const array = <T>(v: unknown, keep: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(keep) : []);
const isRequest = (v: unknown): v is FriendRequest => !!v && typeof v === 'object' && isPlayerPublicKey((v as FriendRequest).key) && !!normalizeName((v as FriendRequest).name) && isIso((v as FriendRequest).at);
const isFriend = (v: unknown): v is Friend => !!v && typeof v === 'object' && isPlayerPublicKey((v as Friend).key) && !!normalizeName((v as Friend).name) && isIso((v as Friend).since);
/** Date du nom relue : gardée si elle est lisible, retirée sinon (le prochain profil la remet). */
const withNameAt = <T extends { nameAt?: string }>(x: T): T => {
  const { nameAt, ...rest } = x;
  return (isIso(nameAt) ? { ...rest, nameAt } : rest) as T;
};

/** État relu d'un fichier, réparé champ par champ ; undefined si la clé du joueur manque (fichier inutilisable). */
export function parseSocialState(raw: unknown): SocialState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const key = s.key as PlayerKey | undefined;
  if (!key || !isPlayerPublicKey(key.publicKey) || typeof key.privateKey !== 'string') return undefined;
  try {
    createPrivateKey(key.privateKey);
  } catch {
    return undefined;
  }
  return {
    version: 1,
    enabled: s.enabled !== false,
    lan: s.lan !== false,
    // Un fichier écrit avant le partage par défaut porte « false » sans que le joueur l'ait choisi.
    shareLibrary: s.shareLibraryChosen === true ? s.shareLibrary === true : true,
    ...(s.shareLibraryChosen === true ? { shareLibraryChosen: true } : {}),
    name: normalizeName(s.name) ?? defaultName(key.publicKey),
    nameAt: isIso(s.nameAt) ? s.nameAt : new Date(0).toISOString(),
    key: { publicKey: key.publicKey, privateKey: key.privateKey },
    friends: array(s.friends, isFriend).map((f) => withNameAt({ ...f, events: array(f.events, (e): e is SocialEvent => !!parseEvent(e)) })),
    incoming: array(s.incoming, isRequest).map(withNameAt),
    outgoing: array(s.outgoing, isRequest).map(withNameAt),
    blocked: array(s.blocked, (k): k is string => typeof k === 'string' && isPlayerPublicKey(k)),
    declined: array(s.declined, (d): d is { key: string; at: string } => !!d && typeof d === 'object' && isPlayerPublicKey((d as { key: string }).key) && isIso((d as { at: string }).at)),
    directory: array(s.directory, (d): d is DirectoryEntry => !!d && typeof d === 'object' && !!verifyProfile((d as DirectoryEntry).profile, new Date(8.64e15)) && isIso((d as DirectoryEntry).seen)),
    events: array(s.events, (e): e is SocialEvent => !!parseEvent(e)),
    badges: array(s.badges, (b): b is EarnedBadge => !!b && typeof b === 'object' && typeof (b as EarnedBadge).id === 'string' && isIso((b as EarnedBadge).at)),
    badgesChecked: s.badgesChecked === true,
  };
}

export function socialFile(dataDir: string): string {
  return path.join(dataDir, SOCIAL_FILE);
}

/**
 * État du réseau des bornes ; créé (clé neuve, partage activé) s'il n'existe pas. Un fichier
 * illisible est mis de côté sous un autre nom, jamais écrasé : il garde la clé et les amis.
 */
export function loadSocial(dataDir: string, now = new Date()): SocialState {
  const file = socialFile(dataDir);
  let text: string | undefined;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    // absent : créé ci-dessous
  }
  if (text !== undefined) {
    let parsed: SocialState | undefined;
    try {
      parsed = parseSocialState(JSON.parse(text));
    } catch {
      parsed = undefined;
    }
    if (parsed) return parsed;
    fs.renameSync(file, `${file}.illisible-${now.toISOString().replace(/[:.]/g, '-')}`);
  }
  const state = newSocialState(now);
  saveSocial(dataDir, state);
  return state;
}

export function saveSocial(dataDir: string, state: SocialState): void {
  const file = socialFile(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Messages entre bornes

export type SocialMessage =
  /** Premier message d'une connexion : qui je suis, et une part de mon annuaire. */
  | { t: 'hello'; profile: Profile; dir: Profile[] }
  | { t: 'dir'; dir: Profile[] }
  | { t: 'request' }
  | { t: 'accept' }
  | { t: 'decline' }
  | { t: 'unfriend' }
  | { t: 'presence'; presence: Presence }
  | { t: 'events'; events: SocialEvent[] };

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

function parseTable(raw: unknown): PresenceTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 120);
  if (!title) return undefined;
  const manufacturer = str(r.manufacturer, 60);
  const year = typeof r.year === 'number' && Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2200 ? r.year : undefined;
  const vpsId = typeof r.vpsId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.vpsId) ? r.vpsId : undefined;
  return { title, ...(manufacturer ? { manufacturer } : {}), ...(year ? { year } : {}), ...(vpsId ? { vpsId } : {}) };
}

/** Table telle que les amis la voient : titre, fabricant, année, identifiant VPS ; jamais de chemin. */
export function presenceTable(table: TableEntry): PresenceTable {
  const id = tableIdentity(table);
  return parseTable({ title: (id.title || table.title).slice(0, 120), manufacturer: id.manufacturer?.slice(0, 60), year: id.year, vpsId: id.vpsId }) ?? { title: table.title.slice(0, 120) || '?' };
}

const count = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : undefined);

export function parseEvent(raw: unknown): SocialEvent | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 120);
  if (!id || !isIso(r.at) || (r.kind !== 'record' && r.kind !== 'badge' && r.kind !== 'played')) return undefined;
  const table = parseTable(r.table);
  const base = { id, kind: r.kind, at: r.at, ...(table ? { table } : {}) } as SocialEvent;
  if (r.kind === 'record') {
    const score = count(r.score, Number.MAX_SAFE_INTEGER), rank = count(r.rank, 99);
    if (score === undefined || !rank || !table) return undefined;
    const initials = typeof r.initials === 'string' && /^[A-Z0-9 .!?-]{1,8}$/.test(r.initials) ? r.initials : undefined;
    return { ...base, score, rank, ...(initials ? { initials } : {}) };
  }
  if (r.kind === 'badge') {
    const badge = typeof r.badge === 'string' && /^[a-z0-9-]{1,40}$/.test(r.badge) ? r.badge : undefined;
    return badge ? { ...base, badge } : undefined;
  }
  const seconds = count(r.seconds, 7 * 24 * 3600);
  return table && seconds !== undefined ? { ...base, seconds } : undefined;
}

function parsePresence(raw: unknown): Presence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isIso(r.since) || (r.status !== 'menu' && r.status !== 'playing')) return undefined;
  const table = r.status === 'playing' ? parseTable(r.table) : undefined;
  if (r.status === 'playing' && !table) return undefined;
  return { status: r.status, since: r.since, ...(table ? { table } : {}) };
}

/** Message reçu d'un pair, vérifié champ par champ ; undefined : ignoré. Les profils faux sont retirés, pas le message. */
export function parseSocialMessage(raw: unknown, now = new Date()): SocialMessage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const dir = () => (Array.isArray(m.dir) ? m.dir.slice(0, DIRECTORY_BATCH).map((p) => verifyProfile(p, now)).filter((p): p is Profile => !!p) : []);
  switch (m.t) {
    case 'hello': {
      const profile = verifyProfile(m.profile, now);
      return profile ? { t: 'hello', profile, dir: dir() } : undefined;
    }
    case 'dir':
      return { t: 'dir', dir: dir() };
    case 'request':
    case 'accept':
    case 'decline':
    case 'unfriend':
      return { t: m.t };
    case 'presence': {
      const presence = parsePresence(m.presence);
      return presence ? { t: 'presence', presence } : undefined;
    }
    case 'events':
      return Array.isArray(m.events) ? { t: 'events', events: m.events.slice(0, EVENTS_MAX).map(parseEvent).filter((e): e is SocialEvent => !!e) } : undefined;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Annuaire

/** Ajoute ou rafraîchit des profils ; le plus récent l'emporte, sa propre clé n'y entre pas. */
export function mergeDirectory(directory: readonly DirectoryEntry[], profiles: readonly Profile[], opts: { self: string; now: Date; lan?: boolean }): DirectoryEntry[] {
  const byKey = new Map(directory.map((d) => [d.profile.key, d]));
  const seen = opts.now.toISOString();
  for (const profile of profiles) {
    if (profile.key === opts.self) continue;
    const old = byKey.get(profile.key);
    const newer = !old || Date.parse(profile.at) >= Date.parse(old.profile.at);
    const lanSeen = opts.lan ? seen : old?.lanSeen;
    byKey.set(profile.key, { profile: newer ? profile : old!.profile, seen, ...(lanSeen ? { lanSeen } : {}) });
  }
  const limit = opts.now.getTime() - DIRECTORY_TTL_DAYS * 24 * 3600_000;
  return [...byKey.values()]
    .filter((d) => Date.parse(d.seen) >= limit)
    .sort((a, b) => Date.parse(b.seen) - Date.parse(a.seen))
    .slice(0, DIRECTORY_MAX);
}

/**
 * Profils reçus (bonjour d'un pair, annuaire relayé, balise du réseau local) : dans l'annuaire,
 * et le nom des amis et des demandes suit le plus récent. Toute source de profils passe par
 * ici : un nom vu ailleurs que dans l'annuaire ne resterait pas à l'ancien.
 */
export function learnProfiles(state: SocialState, profiles: readonly Profile[], opts: { now: Date; lan?: boolean }): SocialState {
  let next: SocialState = { ...state, directory: mergeDirectory(state.directory, profiles, { self: state.key.publicKey, now: opts.now, ...(opts.lan ? { lan: true } : {}) }) };
  for (const profile of profiles) next = renamePeer(next, profile);
  return next;
}

/** Joueur tel qu'un écran ou un message le donne : sa clé, son nom, et la date du profil qui porte ce nom. */
export type PeerName = Pick<Profile, 'key' | 'name'> & { at?: string };

/** Profil le plus récent qu'on connaît d'un joueur : l'annuaire, sinon le nom gardé dans les amis et les demandes. */
export function peerProfile(state: SocialState, key: string): PeerName | undefined {
  const dir = state.directory.find((d) => d.profile.key === key)?.profile;
  const kept = state.friends.find((f) => f.key === key) ?? state.incoming.find((r) => r.key === key) ?? state.outgoing.find((r) => r.key === key);
  if (dir && (!kept?.nameAt || Date.parse(dir.at) >= Date.parse(kept.nameAt))) return { key, name: dir.name, at: dir.at };
  return kept ? { key, name: kept.name, ...(kept.nameAt ? { at: kept.nameAt } : {}) } : undefined;
}

/** Profils à envoyer à un pair : les plus récemment vus, le mien en tête. */
export function directorySample(state: SocialState): Profile[] {
  return [signProfile(state), ...state.directory.filter((d) => !state.blocked.includes(d.profile.key)).map((d) => d.profile)].slice(0, DIRECTORY_BATCH);
}

/**
 * Joueurs de l'annuaire dont le nom contient la recherche (sans accents ni casse) : nom exact
 * d'abord, puis commençant par la recherche, puis le reste ; les plus récemment vus d'abord.
 * Une recherche « #A1B2 » ou « nom #A1B2 » filtre aussi sur l'étiquette.
 */
export function searchDirectory(state: SocialState, query: string): DirectoryEntry[] {
  const tag = /#\s*([0-9a-f]{1,4})\s*$/i.exec(query)?.[1]?.toUpperCase();
  const q = playerNameKey(query.replace(/#\s*[0-9a-f]{1,4}\s*$/i, ''));
  if (!q && !tag) return [];
  const rank = (d: DirectoryEntry) => {
    const k = playerNameKey(d.profile.name);
    return k === q ? 0 : k.startsWith(q) ? 1 : 2;
  };
  return state.directory
    .filter((d) => !state.blocked.includes(d.profile.key))
    .filter((d) => (!q || playerNameKey(d.profile.name).includes(q)) && (!tag || shortTag(d.profile.key).startsWith(tag)))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.seen) - Date.parse(a.seen));
}

/** Bornes du réseau local dont la balise est récente. */
export function nearbyPlayers(state: SocialState, now = new Date()): DirectoryEntry[] {
  return state.directory.filter((d) => d.lanSeen && now.getTime() - Date.parse(d.lanSeen) < NEARBY_MS && !state.blocked.includes(d.profile.key));
}

// ---------------------------------------------------------------------------
// Amis : chaque fonction rend le nouvel état et ce qu'il faut envoyer au pair.

export type Reply = 'request' | 'accept' | 'decline' | 'unfriend';
export interface Step {
  state: SocialState;
  /** Message à envoyer au pair concerné (dès qu'il est joignable). */
  send?: Reply;
}

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'blocked' | 'none';
export function relationOf(state: SocialState, key: string): Relation {
  if (key === state.key.publicKey) return 'self';
  if (state.blocked.includes(key)) return 'blocked';
  if (state.friends.some((f) => f.key === key)) return 'friend';
  if (state.incoming.some((r) => r.key === key)) return 'incoming';
  if (state.outgoing.some((r) => r.key === key)) return 'outgoing';
  return 'none';
}

const without = <T extends { key: string }>(list: readonly T[], key: string) => list.filter((x) => x.key !== key);

function befriend(state: SocialState, peer: PeerName, now: Date): SocialState {
  const key = peer.key;
  const friend: Friend = { key, name: peer.name, ...(peer.at ? { nameAt: peer.at } : {}), since: now.toISOString(), lastSeen: now.toISOString(), events: [] };
  return { ...state, friends: [...without(state.friends, key), friend], incoming: without(state.incoming, key), outgoing: without(state.outgoing, key) };
}

/** Nom connu d'un joueur : ami, demande, annuaire. */
export function knownName(state: SocialState, key: string): string | undefined {
  return (
    state.friends.find((f) => f.key === key)?.name ??
    state.incoming.find((r) => r.key === key)?.name ??
    state.outgoing.find((r) => r.key === key)?.name ??
    state.directory.find((d) => d.profile.key === key)?.profile.name
  );
}

/** Demande d'ami envoyée depuis l'écran ; s'il m'avait déjà demandé, nous voilà amis. */
export function requestFriend(state: SocialState, profile: PeerName, now = new Date()): Step {
  switch (relationOf(state, profile.key)) {
    case 'self':
    case 'friend':
    case 'blocked':
      return { state };
    case 'incoming':
      return { state: befriend(state, peerProfile(state, profile.key) ?? profile, now), send: 'accept' };
    case 'outgoing':
      return { state, send: 'request' };
    default: {
      const lan = nearbyPlayers(state, now).some((d) => d.profile.key === profile.key);
      return { state: { ...state, outgoing: [...state.outgoing, { key: profile.key, name: profile.name, ...(profile.at ? { nameAt: profile.at } : {}), at: now.toISOString(), ...(lan ? { lan } : {}) }] }, send: 'request' };
    }
  }
}

export function cancelRequest(state: SocialState, key: string): Step {
  return relationOf(state, key) === 'outgoing' ? { state: { ...state, outgoing: without(state.outgoing, key) }, send: 'unfriend' } : { state };
}

export function acceptRequest(state: SocialState, key: string, now = new Date()): Step {
  const request = state.incoming.find((r) => r.key === key);
  return request ? { state: befriend(state, peerProfile(state, key) ?? request, now), send: 'accept' } : { state };
}

/** Un refus vaut ce délai : passé, une nouvelle demande du même joueur se montre de nouveau. */
export const DECLINE_DAYS = 30;

export function declineRequest(state: SocialState, key: string, now = new Date()): Step {
  if (relationOf(state, key) !== 'incoming') return { state };
  return { state: { ...state, incoming: without(state.incoming, key), declined: [...without(state.declined, key), { key, at: now.toISOString() }] }, send: 'decline' };
}

function recentlyDeclined(state: SocialState, key: string, now: Date): boolean {
  const d = state.declined.find((x) => x.key === key);
  return !!d && now.getTime() - Date.parse(d.at) < DECLINE_DAYS * 24 * 3600_000;
}

export function removeFriend(state: SocialState, key: string): Step {
  return relationOf(state, key) === 'friend' ? { state: { ...state, friends: without(state.friends, key) }, send: 'unfriend' } : { state };
}

/** Bloqué : plus de demande, plus d'annuaire, plus de connexion avec lui. */
export function blockPlayer(state: SocialState, key: string): Step {
  if (key === state.key.publicKey) return { state };
  const wasLinked = ['friend', 'outgoing', 'incoming'].includes(relationOf(state, key));
  return {
    state: {
      ...state,
      blocked: [...new Set([...state.blocked, key])],
      friends: without(state.friends, key),
      incoming: without(state.incoming, key),
      outgoing: without(state.outgoing, key),
      directory: state.directory.filter((d) => d.profile.key !== key),
    },
    ...(wasLinked ? { send: 'unfriend' as const } : {}),
  };
}

export function unblockPlayer(state: SocialState, key: string): SocialState {
  return { ...state, blocked: state.blocked.filter((k) => k !== key) };
}

/**
 * Message d'amitié reçu d'un pair (clé authentifiée par la connexion). `name` : son nom, tel
 * que son profil le donne. Ce que l'autre borne a fait : demande, acceptation, refus, retrait.
 */
export function receiveReply(state: SocialState, from: PeerName & { lan?: boolean }, reply: Reply, now = new Date()): Step {
  const relation = relationOf(state, from.key);
  if (relation === 'blocked' || relation === 'self') return { state };
  switch (reply) {
    case 'request':
      if (relation === 'friend') return { state, send: 'accept' };
      // Demandé des deux côtés : amis tout de suite.
      if (relation === 'outgoing') return { state: befriend(state, from, now), send: 'accept' };
      if (relation === 'incoming') return { state };
      if (recentlyDeclined(state, from.key, now)) return { state, send: 'decline' };
      return {
        state: { ...state, incoming: [{ key: from.key, name: from.name, ...(from.at ? { nameAt: from.at } : {}), at: now.toISOString(), ...(from.lan ? { lan: true } : {}) }, ...state.incoming].slice(0, INCOMING_MAX) },
      };
    case 'accept':
      if (relation === 'outgoing') return { state: befriend(state, from, now) };
      // Il nous croit amis, nous ne le sommes plus (retiré pendant qu'il était hors ligne) : le lui dire.
      if (relation === 'none') return { state, send: 'unfriend' };
      return { state };
    case 'decline':
      return relation === 'outgoing' ? { state: { ...state, outgoing: without(state.outgoing, from.key) } } : { state };
    case 'unfriend':
      if (relation === 'friend') return { state: { ...state, friends: without(state.friends, from.key) } };
      if (relation === 'incoming') return { state: { ...state, incoming: without(state.incoming, from.key) } };
      if (relation === 'outgoing') return { state: { ...state, outgoing: without(state.outgoing, from.key) } };
      return { state };
  }
}

/**
 * Ce qu'on dit à un pair dès la connexion, pour que les deux bornes s'accordent même si l'une
 * était éteinte au moment d'une demande, d'une acceptation ou d'un retrait : ami, on le
 * confirme ; demande en cours, on la renvoie ; rien sinon.
 */
export function syncReply(state: SocialState, key: string): Reply | undefined {
  const relation = relationOf(state, key);
  return relation === 'friend' ? 'accept' : relation === 'outgoing' ? 'request' : undefined;
}

/** Nom d'un pair revu (profil plus récent) : tenu à jour dans les amis et les demandes. */
export function renamePeer(state: SocialState, profile: Pick<Profile, 'key' | 'name' | 'at'>): SocialState {
  const at = Date.parse(profile.at);
  // Un profil relayé plus ancien que celui de l'annuaire ne ramène jamais l'ancien nom.
  const dir = state.directory.find((d) => d.profile.key === profile.key);
  if (dir && Date.parse(dir.profile.at) > at) return state;
  let changed = false;
  const rename = <T extends { key: string; name: string; nameAt?: string }>(list: T[]) =>
    list.map((x) => {
      if (x.key !== profile.key || (x.nameAt && Date.parse(x.nameAt) > at) || (x.name === profile.name && x.nameAt === profile.at)) return x;
      changed = true;
      return { ...x, name: profile.name, nameAt: profile.at };
    });
  const next = { ...state, friends: rename(state.friends), incoming: rename(state.incoming), outgoing: rename(state.outgoing) };
  return changed ? next : state;
}

export function friendSeen(state: SocialState, key: string, now = new Date()): SocialState {
  return { ...state, friends: state.friends.map((f) => (f.key === key ? { ...f, lastSeen: now.toISOString() } : f)) };
}

/** Évènements reçus d'un ami : ajoutés une fois chacun, du plus récent au plus ancien. */
export function receiveEvents(state: SocialState, key: string, events: readonly SocialEvent[]): SocialState {
  if (relationOf(state, key) !== 'friend') return state;
  return { ...state, friends: state.friends.map((f) => (f.key === key ? { ...f, events: mergeEvents(f.events, events) } : f)) };
}

export function mergeEvents(list: readonly SocialEvent[], more: readonly SocialEvent[]): SocialEvent[] {
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const e of more) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, EVENTS_MAX);
}

let eventCounter = 0;
/** Nouvel évènement de ce joueur ; rend l'état et l'évènement à envoyer aux amis. */
export function addEvent(state: SocialState, event: Omit<SocialEvent, 'id' | 'at'>, now = new Date()): { state: SocialState; event: SocialEvent } {
  const full = { ...event, id: `${state.key.publicKey.slice(0, 16)}-${now.getTime().toString(36)}-${(eventCounter++).toString(36)}`, at: now.toISOString() } as SocialEvent;
  return { state: { ...state, events: mergeEvents(state.events, [full]) }, event: full };
}

export function setName(state: SocialState, name: string, now = new Date()): SocialState | undefined {
  const clean = normalizeName(name);
  if (!clean) return undefined;
  return clean === state.name ? state : { ...state, name: clean, nameAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Textes

export function presenceTableLabel(table: PresenceTable): string {
  return table.manufacturer && table.year ? `${table.title} (${table.manufacturer} ${table.year})` : table.title;
}

/** « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j » */
export function socialAgo(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t('à l’instant');
  if (minutes < 60) return t('il y a {n} min', { n: minutes });
  if (minutes < 48 * 60) return t('il y a {n} h', { n: Math.floor(minutes / 60) });
  return t('il y a {n} j', { n: Math.floor(minutes / (24 * 60)) });
}

export function playDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? t('{n} min', { n: minutes }) : t('{h} h {m} min', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/** Phrase d'un évènement ; `badgeLabel` donne le nom d'un badge (badges.ts). */
export function eventText(e: SocialEvent, badgeLabel: (id: string) => string): string {
  switch (e.kind) {
    case 'record':
      return e.rank === 1
        ? t('Nouveau meilleur score sur {table} : {score}', { table: e.table!.title, score: dmdScore(e.score!) })
        : t('Entré au tableau d’honneur de {table} : {score}, place {rank}', { table: e.table!.title, score: dmdScore(e.score!), rank: e.rank! });
    case 'badge':
      return t('Badge reçu : {badge}', { badge: badgeLabel(e.badge!) });
    case 'played':
      return t('A joué à {table} ({duration})', { table: e.table!.title, duration: playDuration(e.seconds!) });
  }
}

// ---------------------------------------------------------------------------
// Mode du réseau

/**
 * Réseau à utiliser dans cet environnement :
 * - « public » : usage normal, Hyperswarm et ses nœuds d'amorçage, réseau local réel ;
 * - « simulated » : CYBERPINBALL_RESEAU=simule, un réseau d'essai dans le processus, sur 127.0.0.1
 *   seulement (aucune invite du pare-feu, aucune borne réelle) ;
 * - « off » : CYBERPINBALL_RESEAU=non, ou tout essai sans opérateur (autopilote, captures,
 *   bac à sable, écrans simulés) qui ne demande pas le réseau simulé : jamais de vrai réseau pendant un essai.
 */
export type SocialNetMode = 'public' | 'simulated' | 'off';
export function socialNetMode(env: NodeJS.ProcessEnv): SocialNetMode {
  const asked = env.CYBERPINBALL_RESEAU?.toLowerCase();
  if (asked === 'simule' || asked === 'simulé') return 'simulated'; // i18n-ignore : valeur de la variable
  if (asked === 'non' || asked === 'off') return 'off';
  const unattended = ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS', 'CYBERPINBALL_HOME', 'CYBERPINBALL_DISPLAYS'].some((name) => env[name]);
  return unattended ? 'off' : 'public';
}
