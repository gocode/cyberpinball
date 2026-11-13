// Présence publique des joueurs (décidée le 12/11/2026) : qui est en ligne en ce
// moment, ami ou non. Chaque borne signe toutes les deux minutes un petit signal (« en ligne » ou « en
// partie », jamais la table), que les bornes reliées se relaient, sur le modèle des cartes publiques
// (publicprofile.ts). Un joueur est « en ligne » tant que son dernier signal a moins de cinq minutes.
//
// Rien n'est écrit sur le disque : la présence ne vaut que pour l'instant. Un signal trop vieux, ou
// daté du futur, est refusé ; un signal déjà connu (même joueur, même date ou plus ancien) n'est pas
// relayé de nouveau, ce qui arrête la diffusion.
//
// La table en cours reste entre amis (friendpresence.ts, message « presence ») : elle n'est jamais ici.

import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName, type PresenceTable } from './social';

/** Un signal toutes les deux minutes. */
export const LIVE_BEACON_MS = 120_000;
/** Au-delà de cinq minutes sans signal, le joueur n'est plus « en ligne ». */
export const LIVE_FRESH_MS = 5 * 60_000;
/** Signaux par message (bonjour, relais). */
export const LIVE_BATCH = 200;
/** Signaux gardés au plus (les plus récents). */
export const LIVE_MAX = 5000;
/** Tolérance d'horloge : un signal daté de plus d'une minute dans le futur est refusé. */
const FUTURE_MS = 60_000;

export type BeaconStatus = 'online' | 'playing';

export interface LiveBeacon {
  key: string;
  name: string;
  /** Pays déclaré (ISO 3166-1 alpha-2), s'il est connu. */
  country?: string;
  status: BeaconStatus;
  at: string;
  sig: string;
}

/** Les signaux reçus, par clé de joueur (le plus récent de chacun). */
export type LiveBoard = Map<string, LiveBeacon>;

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);

function beaconText(b: Omit<LiveBeacon, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'live', key: b.key, name: b.name, country: b.country ?? null, status: b.status, at: b.at });
}

/** Mon signal, signé maintenant. */
export function signBeacon(me: { key: PlayerKey; name: string }, extra: { status: BeaconStatus; country?: string }, now = new Date()): LiveBeacon {
  const base: Omit<LiveBeacon, 'sig'> = { key: me.key.publicKey, name: me.name, ...(extra.country ? { country: extra.country } : {}), status: extra.status, at: now.toISOString() };
  return { ...base, sig: signText(beaconText(base), me.key) };
}

/** Signal reçu : forme, fraîcheur et signature vérifiées ; undefined sinon. */
export function verifyBeacon(raw: unknown, now = new Date()): LiveBeacon | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.key) || !name || name !== r.name || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.status !== 'online' && r.status !== 'playing') return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > LIVE_FRESH_MS) return undefined;
  const beacon: LiveBeacon = { key: r.key, name, ...(r.country ? { country: r.country as string } : {}), status: r.status, at: r.at, sig: r.sig };
  const { sig, ...base } = beacon;
  return verifyText(beaconText(base), sig, beacon.key) ? beacon : undefined;
}

/**
 * Signaux reçus, déjà vérifiés : le plus récent de chaque joueur l'emporte (le mien ne s'écrit jamais
 * ici). Rend ceux qui sont nouveaux, à relayer ; retire au passage ceux qui ont vieilli.
 */
export function mergeBeacons(board: LiveBoard, beacons: readonly LiveBeacon[], me: string, now = new Date()): LiveBeacon[] {
  const fresh: LiveBeacon[] = [];
  for (const b of beacons) {
    if (b.key === me) continue;
    const had = board.get(b.key);
    if (had && Date.parse(had.at) >= Date.parse(b.at)) continue;
    board.set(b.key, b);
    fresh.push(b);
  }
  pruneBeacons(board, now);
  return fresh;
}

/** Ménage : les signaux de plus de cinq minutes partent ; au-delà de LIVE_MAX, les plus anciens. */
export function pruneBeacons(board: LiveBoard, now = new Date()): void {
  const limit = now.getTime() - LIVE_FRESH_MS;
  for (const [key, b] of board) if (Date.parse(b.at) < limit) board.delete(key);
  if (board.size <= LIVE_MAX) return;
  const old = [...board.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, board.size - LIVE_MAX);
  for (const b of old) board.delete(b.key);
}

/** Les joueurs en ligne maintenant (signal de moins de cinq minutes), le plus récent d'abord. */
export function liveNow(board: LiveBoard, now = new Date()): LiveBeacon[] {
  const limit = now.getTime() - LIVE_FRESH_MS;
  return [...board.values()].filter((b) => Date.parse(b.at) >= limit).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Ce que j'envoie au bonjour : mon signal (s'il y en a un), puis les plus récents que je connais. */
export function liveSample(board: LiveBoard, own: LiveBeacon | undefined, now = new Date()): LiveBeacon[] {
  const others = liveNow(board, now).filter((b) => b.key !== own?.key);
  return [...(own ? [own] : []), ...others].slice(0, LIVE_BATCH);
}

// ---------------------------------------------------------------------------
// Liste « Joueurs en ligne » : groupes, ordre et filtres (sans réseau, testés à part)

/** Les filtres de la liste, dans l'ordre où MagnaSave les parcourt. */
export const ONLINE_FILTERS = ['all', 'country', 'nearby', 'tables'] as const;
export type OnlineFilter = (typeof ONLINE_FILTERS)[number];

/** Présence d'un joueur de la liste : en ligne, en partie, ou hors ligne (vu plus tôt). */
export type PlayerPresence = BeaconStatus | 'offline';

export interface OnlinePlayer {
  key: string;
  name: string;
  country?: string;
  status: PlayerPresence;
  /** Hors ligne : la dernière fois qu'il a été vu (ISO), s'il est connu. */
  seen?: string;
  friend: boolean;
  /** Sur le même réseau local que cette borne. */
  nearby?: boolean;
  /** Tables jouées par ce joueur (classements) que j'ai aussi. */
  commonTables?: number;
}

export type OnlineGroupId = 'friends' | 'country' | 'elsewhere' | 'nearby' | 'tables' | 'offline';
export interface OnlineGroup {
  id: OnlineGroupId;
  players: OnlinePlayer[];
}

const PRESENCE_RANK: Record<PlayerPresence, number> = { playing: 0, online: 1, offline: 2 };
const seenAt = (p: OnlinePlayer) => (p.seen ? Date.parse(p.seen) || 0 : 0);
/** En partie, puis en ligne, puis hors ligne (le plus récemment vu d'abord) ; puis par nom. */
const byPresenceThenName = (a: OnlinePlayer, b: OnlinePlayer) =>
  PRESENCE_RANK[a.status] - PRESENCE_RANK[b.status] || (a.status === 'offline' ? seenAt(b) - seenAt(a) : 0) || a.name.localeCompare(b.name);
const isOnline = (p: OnlinePlayer) => p.status !== 'offline';

/** Combien de joueurs chaque filtre montrerait (le nombre sous chaque onglet). */
export function onlineCounts(players: readonly OnlinePlayer[], country: string | undefined): Record<OnlineFilter, number> {
  return {
    all: players.length,
    country: country ? players.filter((p) => p.country === country).length : 0,
    nearby: players.filter((p) => p.nearby).length,
    tables: players.filter((p) => (p.commonTables ?? 0) > 0).length,
  };
}

/**
 * Les groupes de la liste pour un filtre. La liste montre tous les joueurs connus (13/11/2026 : il y
 * a encore peu de monde), ceux en ligne d'abord. Tous : amis en ligne, puis mon pays, puis ailleurs,
 * puis tous ceux hors ligne (amis d'abord, le plus récemment vu ensuite) ; dans chaque groupe en
 * ligne, en partie d'abord, puis par nom. Mon pays : de même, pour les joueurs de mon pays.
 * À proximité : le réseau local. Mêmes tables : en ligne d'abord, puis le plus de tables en commun.
 * Un groupe vide n'est pas rendu.
 */
export function onlineGroups(players: readonly OnlinePlayer[], country: string | undefined, filter: OnlineFilter): OnlineGroup[] {
  const groups: OnlineGroup[] = [];
  const push = (id: OnlineGroupId, list: OnlinePlayer[]) => {
    if (list.length) groups.push({ id, players: list });
  };
  const online = (a: OnlinePlayer, b: OnlinePlayer) => Number(isOnline(b)) - Number(isOnline(a));
  if (filter === 'tables') {
    push('tables', players.filter((p) => (p.commonTables ?? 0) > 0).sort((a, b) => online(a, b) || (b.commonTables ?? 0) - (a.commonTables ?? 0) || byPresenceThenName(a, b)));
    return groups;
  }
  if (filter === 'nearby') {
    push('nearby', players.filter((p) => p.nearby).sort((a, b) => online(a, b) || Number(b.friend) - Number(a.friend) || byPresenceThenName(a, b)));
    return groups;
  }
  const pool = filter === 'country' ? players.filter((p) => country && p.country === country) : players;
  const live = pool.filter(isOnline);
  push('friends', live.filter((p) => p.friend).sort(byPresenceThenName));
  const others = live.filter((p) => !p.friend);
  push('country', others.filter((p) => country && p.country === country).sort(byPresenceThenName));
  if (filter === 'all') push('elsewhere', others.filter((p) => !country || p.country !== country).sort(byPresenceThenName));
  push('offline', pool.filter((p) => !isOnline(p)).sort((a, b) => Number(b.friend) - Number(a.friend) || byPresenceThenName(a, b)));
  return groups;
}

/**
 * Tables en commun avec chaque joueur classé : les tables de ses scores (classements national et
 * mondial) que j'ai aussi, reconnues par leur identifiant VPS, sinon par leur titre. Rend, par clé de
 * joueur, les titres en commun, sans doublon.
 */
export function commonTables(mine: readonly PresenceTable[], scores: readonly { key: string; table: PresenceTable }[]): Map<string, string[]> {
  const vps = new Set(mine.flatMap((t) => (t.vpsId ? [t.vpsId] : [])));
  const titles = new Set(mine.map((t) => t.title.trim().toLowerCase()));
  const out = new Map<string, string[]>();
  for (const s of scores) {
    const title = s.table.title.trim();
    if (!(s.table.vpsId && vps.has(s.table.vpsId)) && !titles.has(title.toLowerCase())) continue;
    const list = out.get(s.key) ?? [];
    if (!list.some((x) => x.toLowerCase() === title.toLowerCase())) list.push(title);
    out.set(s.key, list);
  }
  return out;
}
