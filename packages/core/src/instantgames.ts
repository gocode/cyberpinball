// Parties en direct (demandées le 16/11/2026) : un joueur ouvre une partie
// en direct à tous, choisit le nombre de joueurs (2 à 4), et elle s'affiche dans la Communauté de
// chaque borne. N'importe qui la rejoint, sans être ami ; dès qu'elle est complète, elle part pour
// tout le monde. La partie elle-même est celle des amis (livegame.ts) : même version de la table
// obligatoire, réglages de l'hôte, départ commun, résultats.
//
// L'annonce est un petit message signé par l'hôte, relayé de borne en borne comme la présence
// publique (livepresence.ts) : la table (titre, empreinte du .vpx et du script), le nombre de places,
// qui est déjà là. L'hôte la signe de nouveau toutes les INSTANT_RESIGN_MS et à chaque arrivée ; une
// annonce de plus de INSTANT_FRESH_MS n'est plus montrée (borne éteinte, réseau coupé). Partie
// lancée ou annulée : l'hôte signe une annonce « fermée », qui la retire partout sans attendre.
//
// Rien n'est écrit sur le disque. Ici, seulement ce qui se décide sur des données ; le relais est dans
// app/src/social-net.ts, la partie dans app/src/live-game.ts.

import { LIVE_MAX_PLAYERS, parseLiveTable, type LiveInvite, type LiveTable } from './livegame';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName } from './social';

/** Joueurs au moins dans une partie en direct, l'hôte compris. */
export const INSTANT_MIN_PLAYERS = 2;
/** Joueurs au plus : ceux d'une partie en direct (réseau maillé, § 13.2). */
export const INSTANT_MAX_PLAYERS = LIVE_MAX_PLAYERS;
/** L'hôte signe de nouveau son annonce à ce rythme (et à chaque arrivée ou départ). */
export const INSTANT_RESIGN_MS = 20_000;
/** Une annonce plus vieille n'est plus montrée : la borne de l'hôte ne répond plus. */
export const INSTANT_FRESH_MS = 60_000;
/** Une partie qui ne s'est pas remplie en ce temps se ferme d'elle-même. */
export const INSTANT_OPEN_MS = 30 * 60_000;
/** Annonces par message (bonjour, relais). */
export const INSTANT_BATCH = 100;
/** Annonces gardées au plus. */
const INSTANT_MAX = 500;
/** Tolérance d'horloge : une annonce datée de plus d'une minute dans le futur est refusée. */
const FUTURE_MS = 60_000;

export interface InstantSeat {
  key: string;
  name: string;
}

export interface InstantGame {
  /** Identifiant de la partie (celui de la partie en direct de l'hôte). */
  id: string;
  /** L'hôte : sa clé, son pseudo, son pays déclaré. */
  key: string;
  name: string;
  country?: string;
  title: string;
  table: LiveTable;
  /** Joueurs au plus, l'hôte compris. */
  max: number;
  /** Déjà là, l'hôte en tête. */
  seats: InstantSeat[];
  /** « open » : on peut la rejoindre ; « closed » : partie lancée ou annulée, à retirer partout. */
  state: 'open' | 'closed';
  /** Ouverte le (ISO), et signée le (ISO). */
  opened: string;
  at: string;
  sig: string;
}

/** Les annonces reçues, par identifiant de partie (la plus récente de chacune). */
export type InstantBoard = Map<string, InstantGame>;

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isTitle = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 160 && !/[\x00-\x1f\x7f]/.test(v);

/** Le nombre de joueurs choisi, ramené entre 2 et 4. */
export function instantMax(n: number): number {
  return Math.max(INSTANT_MIN_PLAYERS, Math.min(INSTANT_MAX_PLAYERS, Math.round(n) || INSTANT_MIN_PLAYERS));
}

function instantText(g: Omit<InstantGame, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'instant', id: g.id, key: g.key, name: g.name, country: g.country ?? null, title: g.title, table: g.table, max: g.max, seats: g.seats, state: g.state, opened: g.opened, at: g.at });
}

/** Mon annonce, signée maintenant. */
export function signInstant(me: { key: PlayerKey; name: string }, game: { id: string; title: string; table: LiveTable; max: number; seats: readonly InstantSeat[]; state: InstantGame['state']; opened: string; country?: string }, now = new Date()): InstantGame {
  const base: Omit<InstantGame, 'sig'> = {
    id: game.id,
    key: me.key.publicKey,
    name: me.name,
    ...(game.country ? { country: game.country } : {}),
    title: game.title,
    // La table telle que la relira l'autre borne (parseLiveTable) : un champ de trop casserait la signature.
    table: parseLiveTable(game.table) ?? game.table,
    max: instantMax(game.max),
    seats: game.seats.slice(0, INSTANT_MAX_PLAYERS).map((s) => ({ key: s.key, name: s.name })),
    state: game.state,
    opened: game.opened,
    at: now.toISOString(),
  };
  return { ...base, sig: signText(instantText(base), me.key) };
}

/** Annonce reçue : forme, fraîcheur et signature vérifiées ; undefined sinon. */
export function verifyInstant(raw: unknown, now = new Date()): InstantGame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isId(r.id) || !isPlayerPublicKey(r.key) || !name || name !== r.name || !isTitle(r.title) || !isIso(r.at) || !isIso(r.opened)) return undefined;
  if (typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.state !== 'open' && r.state !== 'closed') return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  if (typeof r.max !== 'number' || !Number.isInteger(r.max) || r.max < INSTANT_MIN_PLAYERS || r.max > INSTANT_MAX_PLAYERS) return undefined;
  const table = parseLiveTable(r.table);
  if (!table || !Array.isArray(r.seats) || r.seats.length < 1 || r.seats.length > r.max) return undefined;
  const seats: InstantSeat[] = [];
  for (const s of r.seats) {
    const x = (s ?? {}) as Record<string, unknown>;
    const n = normalizeName(x.name);
    if (!isPlayerPublicKey(x.key) || !n || n !== x.name || seats.some((y) => y.key === x.key)) return undefined;
    seats.push({ key: x.key, name: n });
  }
  // L'hôte en tête, toujours.
  if (seats[0]!.key !== r.key) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > INSTANT_FRESH_MS) return undefined;
  const game: InstantGame = { id: r.id, key: r.key, name, ...(r.country ? { country: r.country as string } : {}), title: r.title, table, max: r.max, seats, state: r.state, opened: r.opened, at: r.at, sig: r.sig };
  const { sig, ...base } = game;
  return verifyText(instantText(base), sig, game.key) ? game : undefined;
}

/**
 * Annonces reçues, déjà vérifiées : la plus récente de chaque partie l'emporte (les miennes ne
 * s'écrivent jamais ici). Rend celles qui sont nouvelles, à relayer ; retire au passage les vieilles.
 */
export function mergeInstant(board: InstantBoard, games: readonly InstantGame[], me: string, now = new Date()): InstantGame[] {
  const fresh: InstantGame[] = [];
  for (const g of games) {
    if (g.key === me) continue;
    const had = board.get(g.id);
    // Une autre clé sous le même identifiant : laissée (l'identifiant est celui de l'hôte qui l'a tiré).
    if (had && (had.key !== g.key || Date.parse(had.at) >= Date.parse(g.at))) continue;
    // Une fois fermée, elle le reste.
    if (had?.state === 'closed') continue;
    board.set(g.id, g);
    fresh.push(g);
  }
  pruneInstant(board, now);
  return fresh;
}

/** Ménage : les annonces trop vieilles partent ; au-delà d'INSTANT_MAX, les plus anciennes. */
export function pruneInstant(board: InstantBoard, now = new Date()): void {
  const limit = now.getTime() - INSTANT_FRESH_MS;
  for (const [id, g] of board) if (Date.parse(g.at) < limit) board.delete(id);
  if (board.size <= INSTANT_MAX) return;
  const old = [...board.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, board.size - INSTANT_MAX);
  for (const g of old) board.delete(g.id);
}

/**
 * Les parties ouvertes à montrer : fraîches, pas complètes, d'un hôte qui n'est ni moi ni écarté
 * (bloqué, exclu par la modération) ; une seule par hôte (la plus récente) ; la plus récemment ouverte d'abord.
 */
export function openInstant(board: InstantBoard, me: string, refused: (key: string) => boolean, now = new Date()): InstantGame[] {
  const limit = now.getTime() - INSTANT_FRESH_MS;
  const byHost = new Map<string, InstantGame>();
  for (const g of board.values()) {
    if (g.state !== 'open' || g.key === me || refused(g.key) || Date.parse(g.at) < limit || g.seats.length >= g.max) continue;
    const had = byHost.get(g.key);
    if (!had || Date.parse(had.opened) < Date.parse(g.opened)) byHost.set(g.key, g);
  }
  return [...byHost.values()].sort((a, b) => Date.parse(b.opened) - Date.parse(a.opened));
}

/** Ce que j'envoie au bonjour : mon annonce (s'il y en a une), puis les ouvertes que je connais. */
export function instantSample(board: InstantBoard, own: InstantGame | undefined, now = new Date()): InstantGame[] {
  const limit = now.getTime() - INSTANT_FRESH_MS;
  const others = [...board.values()].filter((g) => g.state === 'open' && Date.parse(g.at) >= limit && g.id !== own?.id);
  return [...(own ? [own] : []), ...others].slice(0, INSTANT_BATCH);
}

/**
 * L'annonce vue comme une invitation : ce que le service de partie en direct sait déjà vérifier (la
 * même version de la table chez moi, matchFor) et suivre (guestGame).
 */
export function instantInvite(g: InstantGame, now = new Date()): LiveInvite {
  return { id: g.id, host: { key: g.key, name: g.name }, table: g.table, title: g.title, players: g.seats.filter((s) => s.key !== g.key), receivedAt: now.toISOString() };
}

/** Places restantes. */
export function instantFree(g: Pick<InstantGame, 'max' | 'seats'>): number {
  return Math.max(0, g.max - g.seats.length);
}
