// Profil public et « J'aime » (rubrique Amis) : ce que voit un joueur qui n'est pas un ami, et ses
// « J'aime » sur les records et les badges récents. Les décisions sur des données, sans réseau.
//
// Choix retenus :
// - la carte publique d'un joueur : pseudo, pays, empreinte de son avatar, badges, nombre de
//   records publiés, et son activité récente (records et badges, PUBLIC_EVENTS_DAYS jours,
//   PUBLIC_EVENTS_MAX au plus), avec le nombre de « J'aime » de chacun ; signée par sa clé ;
// - elle voyage comme les scores des classements (rankings.ts) : au bonjour, une part de celles
//   que la borne connaît ; quand elle change, à toutes les bornes reliées, qui la relaient si elle
//   leur est nouvelle. Gardée CARD_KEEP_DAYS jours après la dernière vue : lisible hors ligne ;
// - un « J'aime » est un message signé (qui, quel évènement, oui ou non) : direct à la borne de
//   l'auteur quand elle est reliée, sinon relayé une ou deux fois, et réessayé à chaque liaison
//   avec elle pendant LIKE_PENDING_DAYS jours. Un par joueur et par évènement, retirable ;
// - l'auteur compte les « J'aime » reçus et publie les totaux dans sa carte ; lui seul voit qui a
//   aimé. Au plus LIKES_PER_KEY_DAY « J'aime » d'une même clé par jour ; un joueur bloqué ou
//   masqué ne compte pas.
// Présence, parties jouées, bibliothèque et messages restent entre amis (social.ts, chat.ts).
//
// Fichier : <données>\amis\profils.json.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isAvatarHash } from './avatar';
import { cardPlaysText, parseCardPlays, type CardPlays } from './dailytables';
import { INVITES_IN_CARD, INVITES_MAX, isCardInvite, type CardInvite } from './invitations';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName, type PresenceTable, type SocialEvent, type SocialState } from './social';

export const PUBLIC_EVENTS_MAX = 20;
export const PUBLIC_EVENTS_DAYS = 30;
/** Une carte qu'on ne revoit plus part après ce délai. */
export const CARD_KEEP_DAYS = 60;
export const CARDS_MAX = 2000;
/** Cartes envoyées au plus dans un message (au bonjour, ou relayées). */
export const CARDS_BATCH = 50;
export const LIKES_BATCH = 50;
/** Relais d'un « J'aime » dont l'auteur n'est pas relié : deux bornes au plus. */
export const LIKE_TTL = 2;
export const LIKE_PENDING_DAYS = 30;
export const LIKES_PER_KEY_DAY = 100;

export interface PublicEvent {
  id: string;
  kind: 'record' | 'badge';
  at: string;
  table?: PresenceTable;
  score?: number;
  rank?: number;
  badge?: string;
}

export interface PublicCard {
  key: string;
  name: string;
  country?: string;
  /** Empreinte de l'avatar (avatar.ts) ; absente : ses initiales. */
  avatar?: string;
  /** Identifiants des badges reçus (badges.ts). */
  badges: string[];
  /** Records publiés aux classements. */
  records: number;
  /** XP du joueur (levels.ts) : son niveau ; absents d'une carte faite avant les niveaux. */
  xp?: number;
  /**
   * XP gagnés pendant sa semaine (levels.ts, weekXp), et le lundi qui l'ouvre (weekKey) : le
   * classement des joueurs de la semaine (playerranking.ts, 17/11/2026). Absents d'une carte d'avant ;
   * une semaine passée ne compte plus.
   */
  week?: CardWeek;
  /** Nombre de ses amis (jamais la liste). */
  friends?: number;
  /**
   * Les personnes qu'il a invitées (invitations.ts) : les attestations signées par chacune, les
   * INVITES_IN_CARD plus récentes, et le total. Absents d'une carte d'avant ou sans personne invitée.
   */
  invited?: CardInvite[];
  invitedTotal?: number;
  /**
   * Ses parties du jour et de sa semaine, par version de table (dailytables.ts, tables du jour,
   * 21/11/2026) : plafonnées à la fabrication, « ? » si invraisemblables. Absentes d'une carte d'avant.
   */
  plays?: CardPlays;
  events: PublicEvent[];
  /** « J'aime » reçus par évènement (id → nombre). */
  likes: Record<string, number>;
  at: string;
  sig: string;
}

/** Les XP d'une semaine : `of`, le lundi qui l'ouvre (AAAA-MM-JJ, à l'heure de la borne). */
export interface CardWeek {
  of: string;
  xp: number;
}

export interface Like {
  from: string;
  /** Pseudo de celui qui aime, ce jour-là : l'auteur voit qui. */
  name: string;
  to: string;
  event: string;
  on: boolean;
  at: string;
  sig: string;
}

export interface ProfileStore {
  v: 1;
  cards: PublicCard[];
  /** Dernière fois que la carte d'un joueur a été reçue (clé → ISO). */
  seen: Record<string, string>;
  /** Première fois (clé → ISO) : la vraisemblance de son niveau (levels.ts, shownLevel). Absent : rien de noté. */
  first?: Record<string, string>;
  /** Mes « J'aime » (le dernier par évènement) ; `sent` : remis directement à la borne de l'auteur. */
  given: (Like & { sent?: boolean })[];
  /** « J'aime » reçus sur mes évènements (le dernier de chaque joueur pour chaque évènement). */
  received: Like[];
  /** Joueurs dont je masque l'activité (ni leurs évènements, ni leurs « J'aime »). */
  hidden: string[];
}

export const emptyProfiles = (): ProfileStore => ({ v: 1, cards: [], seen: {}, given: [], received: [], hidden: [] });
export const profilesFile = (dataDir: string) => path.join(dataDir, 'amis', 'profils.json');

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isEventId = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 120 && !/[\x00-\x1f]/.test(v);
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Carte : faire, signer, vérifier

function cardText(c: Omit<PublicCard, 'sig'>): string {
  // Niveau, semaine et amis n'entrent au texte que s'ils y sont : les cartes d'avant se vérifient toujours.
  return JSON.stringify({ app: 'cyberpinball', kind: 'card', key: c.key, name: c.name, country: c.country ?? null, avatar: c.avatar ?? null, badges: c.badges, records: c.records, events: c.events, likes: c.likes, at: c.at, ...(c.xp !== undefined ? { xp: c.xp } : {}), ...(c.friends !== undefined ? { friends: c.friends } : {}), ...(c.week ? { week: { of: c.week.of, xp: c.week.xp } } : {}), ...(c.invited ? { invited: c.invited.map((i) => ({ me: i.me, name: i.name, machine: i.machine, at: i.at, sig: i.sig })), invitedTotal: c.invitedTotal ?? c.invited.length } : {}), ...(c.plays ? { plays: cardPlaysText(c.plays) } : {}) });
}

/** Mes évènements publics : records et badges des derniers jours, du plus récent au plus ancien. */
export function publicEvents(events: readonly SocialEvent[], now = new Date()): PublicEvent[] {
  const since = now.getTime() - PUBLIC_EVENTS_DAYS * DAY;
  return events
    .filter((e) => (e.kind === 'record' || e.kind === 'badge') && Date.parse(e.at) >= since)
    .slice(0, PUBLIC_EVENTS_MAX)
    .map((e) => ({ id: e.id, kind: e.kind as 'record' | 'badge', at: e.at, ...(e.table ? { table: e.table } : {}), ...(e.score !== undefined ? { score: e.score } : {}), ...(e.rank !== undefined ? { rank: e.rank } : {}), ...(e.badge ? { badge: e.badge } : {}) }));
}

/** Ma carte, signée : les « J'aime » reçus sur ses évènements comptés à l'instant. */
export function makeCard(state: Pick<SocialState, 'key' | 'name' | 'events' | 'badges'>, store: ProfileStore, extra: { country?: string; avatar?: string; records: number; xp?: number; week?: CardWeek; friends?: number; invited?: { list: CardInvite[]; total: number }; plays?: CardPlays }, now = new Date()): PublicCard {
  const events = publicEvents(state.events, now);
  const likes: Record<string, number> = {};
  for (const e of events) {
    const n = store.received.filter((l) => l.event === e.id && l.on && !store.hidden.includes(l.from)).length;
    if (n) likes[e.id] = n;
  }
  const base: Omit<PublicCard, 'sig'> = { key: state.key.publicKey, name: state.name, ...(extra.country ? { country: extra.country } : {}), ...(extra.avatar ? { avatar: extra.avatar } : {}), badges: state.badges.map((b) => b.id), records: extra.records, events, likes, at: now.toISOString(), ...(extra.xp !== undefined ? { xp: Math.max(0, Math.floor(extra.xp)) } : {}), ...(extra.friends !== undefined ? { friends: extra.friends } : {}), ...(extra.week && isDayKey(extra.week.of) ? { week: { of: extra.week.of, xp: Math.max(0, Math.min(Math.floor(extra.week.xp), extra.xp ?? Infinity)) } } : {}), ...(extra.invited?.list.length ? { invited: extra.invited.list.slice(-INVITES_IN_CARD), invitedTotal: Math.max(extra.invited.list.length, Math.floor(extra.invited.total)) } : {}), ...(extra.plays ? { plays: extra.plays } : {}) };
  return { ...base, sig: signText(cardText(base), state.key) };
}

function parseTable(raw: unknown): PresenceTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || !r.title || r.title.length > 120 || /[\x00-\x1f]/.test(r.title)) return undefined;
  const manufacturer = typeof r.manufacturer === 'string' && r.manufacturer.length <= 60 && !/[\x00-\x1f]/.test(r.manufacturer) ? r.manufacturer : undefined;
  const year = typeof r.year === 'number' && Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2200 ? r.year : undefined;
  const vpsId = typeof r.vpsId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.vpsId) ? r.vpsId : undefined;
  return { title: r.title, ...(manufacturer ? { manufacturer } : {}), ...(year ? { year } : {}), ...(vpsId ? { vpsId } : {}) };
}

function parseEvent(raw: unknown): PublicEvent | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isEventId(r.id) || (r.kind !== 'record' && r.kind !== 'badge') || !isIso(r.at)) return undefined;
  const table = r.table === undefined ? undefined : parseTable(r.table);
  if (r.table !== undefined && !table) return undefined;
  const score = typeof r.score === 'number' && Number.isSafeInteger(r.score) && r.score >= 0 ? r.score : undefined;
  const rank = typeof r.rank === 'number' && Number.isInteger(r.rank) && r.rank >= 1 && r.rank <= 1000 ? r.rank : undefined;
  const badge = typeof r.badge === 'string' && /^[a-z0-9-]{1,40}$/.test(r.badge) ? r.badge : undefined;
  return { id: r.id, kind: r.kind, at: r.at, ...(table ? { table } : {}), ...(score !== undefined ? { score } : {}), ...(rank !== undefined ? { rank } : {}), ...(badge ? { badge } : {}) };
}

/** Carte reçue : forme et signature vérifiées ; undefined sinon. Une carte « du futur » est refusée. */
export function verifyCard(raw: unknown, now = new Date()): PublicCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.key) || !name || name !== r.name || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (Date.parse(r.at) > now.getTime() + 10 * 60_000) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  if (r.avatar !== undefined && !isAvatarHash(r.avatar)) return undefined;
  if (!Array.isArray(r.badges) || r.badges.length > 100 || !r.badges.every((b) => typeof b === 'string' && /^[a-z0-9-]{1,40}$/.test(b))) return undefined;
  if (typeof r.records !== 'number' || !Number.isInteger(r.records) || r.records < 0 || r.records > 1_000_000) return undefined;
  if (!Array.isArray(r.events) || r.events.length > PUBLIC_EVENTS_MAX) return undefined;
  const events = r.events.map(parseEvent);
  if (events.some((e) => !e)) return undefined;
  const likesRaw = r.likes && typeof r.likes === 'object' && !Array.isArray(r.likes) ? (r.likes as Record<string, unknown>) : undefined;
  if (!likesRaw) return undefined;
  const likes: Record<string, number> = {};
  for (const [id, n] of Object.entries(likesRaw)) {
    if (!isEventId(id) || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1_000_000) return undefined;
    likes[id] = n;
  }
  const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);
  if ((r.xp !== undefined && count(r.xp, 100_000_000) === undefined) || (r.friends !== undefined && count(r.friends, 100_000) === undefined)) return undefined;
  // La semaine : un lundi et des XP, jamais plus que le total de la carte.
  let week: CardWeek | undefined;
  if (r.week !== undefined) {
    const w = r.week && typeof r.week === 'object' && !Array.isArray(r.week) ? (r.week as Record<string, unknown>) : undefined;
    const wxp = count(w?.xp, 100_000_000);
    if (!w || !isDayKey(w.of) || wxp === undefined || (r.xp !== undefined && wxp > (r.xp as number))) return undefined;
    week = { of: w.of, xp: wxp };
  }
  // Les personnes invitées : la forme ici, la signature de chacune à l'affichage (invitedOf).
  let invited: CardInvite[] | undefined;
  if (r.invited !== undefined) {
    if (!Array.isArray(r.invited) || r.invited.length > INVITES_IN_CARD || !r.invited.every(isCardInvite) || count(r.invitedTotal, INVITES_MAX) === undefined) return undefined;
    invited = (r.invited as CardInvite[]).map((i) => ({ me: i.me, name: i.name, machine: i.machine, at: i.at, sig: i.sig }));
  }
  // Ses parties (dailytables.ts) : la forme ici ; invraisemblables, elles passent et le classement les écarte.
  let plays: CardPlays | undefined;
  if (r.plays !== undefined) {
    plays = parseCardPlays(r.plays);
    if (!plays) return undefined;
  }
  const card: PublicCard = { key: r.key, name, ...(r.country ? { country: r.country as string } : {}), ...(r.avatar ? { avatar: r.avatar as string } : {}), badges: r.badges as string[], records: r.records, events: events as PublicEvent[], likes, at: r.at, ...(r.xp !== undefined ? { xp: r.xp as number } : {}), ...(r.friends !== undefined ? { friends: r.friends as number } : {}), ...(week ? { week } : {}), ...(invited ? { invited, invitedTotal: r.invitedTotal as number } : {}), ...(plays ? { plays } : {}), sig: r.sig };
  const { sig, ...base } = card;
  return verifyText(cardText(base), sig, card.key) ? card : undefined;
}

/**
 * Cartes reçues, déjà vérifiées : la plus récente de chaque joueur l'emporte (la mienne ne s'écrit
 * jamais ici). Rend celles qui sont nouvelles, à relayer.
 */
export function mergeCards(store: ProfileStore, cards: readonly PublicCard[], me: string, now = new Date()): { store: ProfileStore; fresh: PublicCard[] } {
  const byKey = new Map(store.cards.map((c) => [c.key, c]));
  const seen = { ...store.seen };
  const first = { ...store.first };
  const fresh: PublicCard[] = [];
  for (const c of cards) {
    if (c.key === me) continue;
    seen[c.key] = now.toISOString();
    first[c.key] ??= now.toISOString();
    const had = byKey.get(c.key);
    if (had && Date.parse(had.at) >= Date.parse(c.at)) continue;
    byKey.set(c.key, c);
    fresh.push(c);
  }
  if (!fresh.length && Object.keys(seen).length === Object.keys(store.seen).length) return { store: { ...store, seen, first }, fresh };
  return { store: pruneCards({ ...store, cards: [...byKey.values()], seen, first }, now), fresh };
}

/** Ménage : les cartes plus vues depuis CARD_KEEP_DAYS partent, et au-delà de CARDS_MAX les plus anciennes. */
export function pruneCards(store: ProfileStore, now = new Date()): ProfileStore {
  const limit = now.getTime() - CARD_KEEP_DAYS * DAY;
  const seenAt = (c: PublicCard) => Date.parse(store.seen[c.key] ?? c.at);
  const cards = store.cards.filter((c) => seenAt(c) >= limit).sort((a, b) => seenAt(b) - seenAt(a)).slice(0, CARDS_MAX);
  const keys = new Set(cards.map((c) => c.key));
  const seen = Object.fromEntries(Object.entries(store.seen).filter(([k]) => keys.has(k)));
  const first = Object.fromEntries(Object.entries(store.first ?? {}).filter(([k]) => keys.has(k)));
  const pendingLimit = now.getTime() - LIKE_PENDING_DAYS * DAY;
  const given = store.given.filter((l) => l.sent || Date.parse(l.at) >= pendingLimit || keys.has(l.to));
  return { ...store, cards, seen, first, given };
}

/** Ce qu'une borne envoie au bonjour : ma carte d'abord, puis les plus récemment vues. */
export function cardsSample(store: ProfileStore, mine: PublicCard | undefined): PublicCard[] {
  const recent = [...store.cards].sort((a, b) => Date.parse(store.seen[b.key] ?? b.at) - Date.parse(store.seen[a.key] ?? a.at));
  return withinBytes([...(mine ? [mine] : []), ...recent].slice(0, CARDS_BATCH));
}

/**
 * Taille au plus des cartes d'un même message : sous la limite d'un message du réseau des bornes
 * (256 Ko, social-net.ts), qui refuse le message entier au-delà. Une carte porte jusqu'à vingt
 * attestations de personnes invitées et vingt évènements : cinquante cartes pleines la dépasseraient.
 */
export const CARDS_BYTES = 180 * 1024;

/** Les premières cartes qui tiennent dans CARDS_BYTES (la première toujours). */
export function withinBytes(cards: readonly PublicCard[], budget = CARDS_BYTES): PublicCard[] {
  const out: PublicCard[] = [];
  let used = 0;
  for (const c of cards) {
    const size = Buffer.byteLength(JSON.stringify(c), 'utf8');
    if (out.length && used + size > budget) break;
    out.push(c);
    used += size;
  }
  return out;
}

export function cardOf(store: ProfileStore, key: string): PublicCard | undefined {
  return store.cards.find((c) => c.key === key);
}

// ---------------------------------------------------------------------------
// « J'aime »

function likeText(l: Omit<Like, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'like', from: l.from, name: l.name, to: l.to, event: l.event, on: l.on, at: l.at });
}

export function signLike(key: PlayerKey, name: string, to: string, event: string, on: boolean, now = new Date()): Like {
  const base = { from: key.publicKey, name, to, event, on, at: now.toISOString() };
  return { ...base, sig: signText(likeText(base), key) };
}

export function verifyLike(raw: unknown, now = new Date()): Like | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.from) || !isPlayerPublicKey(r.to) || r.from === r.to || !name || name !== r.name || !isEventId(r.event) || typeof r.on !== 'boolean' || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (Date.parse(r.at) > now.getTime() + 10 * 60_000) return undefined;
  const like: Like = { from: r.from, name, to: r.to, event: r.event, on: r.on, at: r.at, sig: r.sig };
  const { sig, ...base } = like;
  return verifyText(likeText(base), sig, like.from) ? like : undefined;
}

/** J'aime (ou n'aime plus) : remplace mon « J'aime » précédent sur cet évènement, à envoyer. */
export function giveLike(store: ProfileStore, like: Like): ProfileStore {
  return { ...store, given: [...store.given.filter((l) => l.event !== like.event || l.to !== like.to), like] };
}

export function markLikeSent(store: ProfileStore, like: Pick<Like, 'to' | 'event' | 'at'>): ProfileStore {
  return { ...store, given: store.given.map((l) => (l.to === like.to && l.event === like.event && l.at === like.at ? { ...l, sent: true } : l)) };
}

/** Mes « J'aime » pas encore remis directement à la borne de `to`. */
export function pendingLikes(store: ProfileStore, to: string): Like[] {
  return store.given.filter((l) => l.to === to && !l.sent).map(({ sent: _, ...l }) => l);
}

export function likedByMe(store: ProfileStore, to: string, event: string): boolean {
  return store.given.some((l) => l.to === to && l.event === event && l.on);
}

/**
 * « J'aime » reçu sur un de mes évènements : le dernier de ce joueur sur cet évènement l'emporte.
 * Refusé : un joueur masqué, ou plus de LIKES_PER_KEY_DAY de lui aujourd'hui. `news` : un nouveau
 * « J'aime » (pas un retrait, pas un doublon) à annoncer.
 */
export function receiveLike(store: ProfileStore, like: Like, me: string, now = new Date()): { store: ProfileStore; news: boolean } {
  if (like.to !== me || store.hidden.includes(like.from)) return { store, news: false };
  const prev = store.received.find((l) => l.from === like.from && l.event === like.event);
  if (prev && Date.parse(prev.at) >= Date.parse(like.at)) return { store, news: false };
  const today = store.received.filter((l) => l.from === like.from && now.getTime() - Date.parse(l.at) < DAY).length;
  if (!prev && today >= LIKES_PER_KEY_DAY) return { store, news: false };
  const received = [...store.received.filter((l) => l !== prev), like];
  return { store: { ...store, received }, news: like.on && !prev?.on };
}

/** Qui a aimé un de mes évènements, le plus récent d'abord (pour moi seul). */
export function likersOf(store: ProfileStore, event: string): Like[] {
  return store.received.filter((l) => l.event === event && l.on && !store.hidden.includes(l.from)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function setHidden(store: ProfileStore, key: string, hidden: boolean): ProfileStore {
  const has = store.hidden.includes(key);
  if (has === hidden) return store;
  return { ...store, hidden: hidden ? [...store.hidden, key] : store.hidden.filter((k) => k !== key) };
}

// ---------------------------------------------------------------------------
// Fichier

export function loadProfiles(dataDir: string, now = new Date()): ProfileStore {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(profilesFile(dataDir), 'utf8'));
  } catch {
    return emptyProfiles();
  }
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cards = (Array.isArray(s.cards) ? s.cards : []).map((c) => verifyCard(c, now)).filter((c): c is PublicCard => !!c);
  const seen = s.seen && typeof s.seen === 'object' ? Object.fromEntries(Object.entries(s.seen as Record<string, unknown>).filter(([k, v]) => isPlayerPublicKey(k) && isIso(v))) as Record<string, string> : {};
  const first = s.first && typeof s.first === 'object' ? Object.fromEntries(Object.entries(s.first as Record<string, unknown>).filter(([k, v]) => isPlayerPublicKey(k) && isIso(v))) as Record<string, string> : {};
  const likes = (v: unknown) => (Array.isArray(v) ? v : []).map((l) => ({ l: verifyLike(l, now), sent: (l as { sent?: unknown })?.sent === true })).filter((x) => !!x.l);
  const given = likes(s.given).map(({ l, sent }) => ({ ...l!, ...(sent ? { sent: true } : {}) }));
  const received = likes(s.received).map(({ l }) => l!);
  const hidden = (Array.isArray(s.hidden) ? s.hidden : []).filter(isPlayerPublicKey) as string[];
  return pruneCards({ v: 1, cards, seen, first, given, received, hidden }, now);
}

export function saveProfiles(dataDir: string, store: ProfileStore): void {
  writeFileAtomic(profilesFile(dataDir), JSON.stringify(store));
}
