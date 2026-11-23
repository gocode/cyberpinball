// Défis asynchrones (engagement, vague 2, décidés le 22/11/2026 : « Go pour les défis asynchrones ») :
// je défie un joueur sur une version exacte d'une table (boardKey, même nombre de billes) avec un score à
// battre (mon meilleur relevé par Cyber Pinball sur cette version, ou celui de la partie que je viens de
// jouer). Il a 48 h, essais illimités ; chacun peut encore monter son score pendant ce temps, le meilleur
// de chacun compte. À l'échéance, le plus haut gagne (+40 XP, levels.ts) ; à égalité, le score à battre
// n'est pas battu. Le défié peut refuser ; personne n'a joué de son côté : le défi expire, sans vainqueur.
//
// Pas de serveur : chaque étape est une petite note signée par son auteur (Ed25519, comme les scores des
// classements et les parties en direct), relayée de borne en borne et gardée par chacune jusqu'à
// l'échéance (CHALLENGE_GRACE_MS en plus). Ainsi le défi arrive même si les deux bornes ne sont jamais
// allumées en même temps : une troisième le garde et le remet. Notes :
// - offer : le défi (qui, à qui, la table, le score à battre, l'échéance) ;
// - score : mon meilleur score de la fenêtre, relevé par Cyber Pinball sur la version exacte (la
//   meilleure note de chaque joueur l'emporte) ;
// - decline : le défié refuse.
// Seuls les scores relevés par Cyber Pinball partent (jamais un score saisi) : c'est la borne qui signe,
// comme pour les classements. Les deux bornes concernées gardent les notes de leurs défis
// (<données>\amis\defis.json, writeFileAtomic) et en tirent l'état : envoyé, reçu, en cours, gagné,
// perdu, expiré, refusé. Ici, seulement ce qui se décide sur des données ; le relais est dans
// app/src/social-net.ts, le service dans app/src/challenge-service.ts.

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t, tn } from './i18n';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName } from './social';
import { readKeptJson } from './store';

/** Le défié a 48 h (règle par défaut du 22/11/2026). */
export const CHALLENGE_MS = 48 * 3600_000;
/** « Expire dans 6 h » : la notification, la page de l'affiche de l'Arène. */
export const CHALLENGE_EXPIRING_MS = 6 * 3600_000;
/** Les notes d'un défi fini restent relayées un peu après l'échéance (un score signé juste avant arrive encore). */
export const CHALLENGE_GRACE_MS = 30 * 60_000;
/** Le résultat est acquis (et les XP versés) passé ce délai après l'échéance : les derniers scores en route sont arrivés. */
export const CHALLENGE_SETTLE_MS = 5 * 60_000;
/** Les résultats restent montrés une semaine (« Résultats récents »), puis le défi sort du fichier. */
export const CHALLENGE_KEEP_MS = 7 * 24 * 3600_000;
/** Notes par message (bonjour, relais). */
export const CHALLENGE_BATCH = 100;
/** Défis en cours que j'envoie au plus (une borne qui enverrait sans fin ne gêne personne longtemps). */
export const CHALLENGE_SENT_MAX = 10;
/** Défis en cours reçus d'un même joueur au plus : au-delà, les suivants sont laissés. */
export const CHALLENGE_FROM_ONE_MAX = 3;
/** Notes relayées gardées au plus (en mémoire), et défis gardés au plus dans le fichier. */
const RELAY_MAX = 500;
const STORE_MAX = 200;
/** Tolérance d'horloge : une note datée de plus d'une minute dans le futur est refusée. */
const FUTURE_MS = 60_000;
export const CHALLENGES_FILE = 'defis.json';
const VERSION = 1;

export interface ChallengePlayer {
  key: string;
  name: string;
  country?: string;
}

/** La version exacte de la table : son empreinte (boardKey), ses billes, son titre et sa référence VPS. */
export interface ChallengeTable {
  board: string;
  balls?: number;
  title: string;
  vpsId?: string;
}

interface NoteBase {
  /** Identifiant du défi (16 hexadécimaux, tiré par celui qui défie). */
  id: string;
  /** L'auteur de la note (sa clé) : c'est lui qui signe. */
  by: string;
  at: string;
  /** L'échéance du défi, reprise de l'offre dans chaque note : un relais sait quand l'oublier. */
  until: string;
  sig: string;
}

export interface ChallengeOffer extends NoteBase {
  kind: 'offer';
  from: ChallengePlayer;
  to: ChallengePlayer;
  table: ChallengeTable;
  /** Le score à battre. */
  score: number;
  /** D'où vient ce score : mon meilleur sur cette version, ou la partie que je viens de jouer. */
  source: 'best' | 'game';
}

export interface ChallengeScore extends NoteBase {
  kind: 'score';
  score: number;
}

export interface ChallengeDecline extends NoteBase {
  kind: 'decline';
}

export type ChallengeNote = ChallengeOffer | ChallengeScore | ChallengeDecline;

export type ChallengeState = 'sent' | 'received' | 'running' | 'won' | 'lost' | 'expired' | 'declined';

/** Un défi tel que je le vois, tiré de ses notes. */
export interface Challenge {
  id: string;
  table: ChallengeTable;
  from: ChallengePlayer;
  to: ChallengePlayer;
  at: string;
  until: string;
  /** Mon rôle : je l'ai lancé, ou je l'ai reçu. */
  role: 'sent' | 'received';
  opponent: ChallengePlayer;
  /** Le score à battre de l'offre. */
  target: number;
  source: ChallengeOffer['source'];
  /** Le meilleur de chacun dans la fenêtre (celui qui défie part du score à battre) ; absent : le défié n'a pas joué. */
  mine?: number;
  theirs?: number;
  state: ChallengeState;
  /** Qui mène en ce moment (ou a gagné) ; absent : le défié n'a pas encore joué. */
  leader?: 'me' | 'them';
  declinedAt?: string;
  /** Le résultat est acquis (échéance passée depuis CHALLENGE_SETTLE_MS) : les XP peuvent être versés. */
  settled: boolean;
}

/** Ce que garde la borne : les notes de mes défis, les défis déjà payés, les notifications déjà dites. */
export interface ChallengeStore {
  v: number;
  notes: ChallengeNote[];
  paid: string[];
  said: string[];
}

export const emptyChallenges = (): ChallengeStore => ({ v: VERSION, notes: [], paid: [], said: [] });

// ---------------------------------------------------------------------------
// Notes signées

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const isTitle = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 160 && !/[\x00-\x1f\x7f]/.test(v);
const isBoard = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 300 && /^[0-9A-Za-z:._-]+$/.test(v);
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < 1e15;

/** Un nouvel identifiant de défi. */
export const newChallengeId = (): string => randomBytes(8).toString('hex');

/** Le texte signé d'une note : ses champs dans un ordre fixe, sans la signature. */
function noteText(n: Omit<ChallengeNote, 'sig'>): string {
  const base = { app: 'cyberpinball', type: 'challenge', kind: n.kind, id: n.id, by: n.by, at: n.at, until: n.until };
  if (n.kind === 'offer') {
    const o = n as Omit<ChallengeOffer, 'sig'>;
    return JSON.stringify({ ...base, from: playerOut(o.from), to: playerOut(o.to), table: tableOut(o.table), score: o.score, source: o.source });
  }
  if (n.kind === 'score') return JSON.stringify({ ...base, score: (n as ChallengeScore).score });
  return JSON.stringify(base);
}
const playerOut = (p: ChallengePlayer) => ({ key: p.key, name: p.name, country: p.country ?? null });
const tableOut = (x: ChallengeTable) => ({ board: x.board, balls: x.balls ?? null, title: x.title, vpsId: x.vpsId ?? null });

function sign<N extends ChallengeNote>(body: Omit<N, 'sig'>, key: PlayerKey): N {
  return { ...body, sig: signText(noteText(body), key) } as N;
}

/** Mon défi : à `to`, sur cette version, avec ce score à battre ; l'échéance dans 48 h. */
export function offerChallenge(me: { key: PlayerKey; name: string; country?: string }, to: ChallengePlayer, table: ChallengeTable, score: number, source: ChallengeOffer['source'], now = new Date(), id = newChallengeId()): ChallengeOffer {
  const from: ChallengePlayer = { key: me.key.publicKey, name: me.name, ...(me.country ? { country: me.country } : {}) };
  const until = new Date(now.getTime() + CHALLENGE_MS).toISOString();
  return sign<ChallengeOffer>(
    {
      kind: 'offer',
      id,
      by: from.key,
      at: now.toISOString(),
      until,
      from,
      to: { key: to.key, name: to.name, ...(to.country ? { country: to.country } : {}) },
      table: { board: table.board, ...(table.balls ? { balls: table.balls } : {}), title: table.title, ...(table.vpsId ? { vpsId: table.vpsId } : {}) },
      score: Math.round(score),
      source,
    },
    me.key,
  );
}

/** Mon meilleur score de la fenêtre d'un défi. */
export function scoreChallenge(me: { key: PlayerKey }, offer: Pick<ChallengeOffer, 'id' | 'until'>, score: number, now = new Date()): ChallengeScore {
  return sign<ChallengeScore>({ kind: 'score', id: offer.id, by: me.key.publicKey, at: now.toISOString(), until: offer.until, score: Math.round(score) }, me.key);
}

/** Je refuse le défi. */
export function declineChallenge(me: { key: PlayerKey }, offer: Pick<ChallengeOffer, 'id' | 'until'>, now = new Date()): ChallengeDecline {
  return sign<ChallengeDecline>({ kind: 'decline', id: offer.id, by: me.key.publicKey, at: now.toISOString(), until: offer.until }, me.key);
}

function parsePlayer(raw: unknown): ChallengePlayer | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.key) || !name || name !== r.name) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  return { key: r.key, name, ...(r.country ? { country: r.country as string } : {}) };
}

function parseTable(raw: unknown): ChallengeTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isBoard(r.board) || !isTitle(r.title)) return undefined;
  if (r.balls !== undefined && (typeof r.balls !== 'number' || !Number.isInteger(r.balls) || r.balls < 1 || r.balls > 10)) return undefined;
  if (r.vpsId !== undefined && (typeof r.vpsId !== 'string' || r.vpsId.length > 40 || !/^[0-9A-Za-z_-]+$/.test(r.vpsId))) return undefined;
  return { board: r.board, ...(r.balls ? { balls: r.balls as number } : {}), title: r.title, ...(r.vpsId ? { vpsId: r.vpsId as string } : {}) };
}

/**
 * Une note reçue : forme et signature vérifiées, datée avant son échéance et pas dans le futur, encore
 * utile (échéance + CHALLENGE_GRACE_MS) ; undefined sinon.
 */
export function verifyChallengeNote(raw: unknown, now = new Date()): ChallengeNote | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id) || !isPlayerPublicKey(r.by) || !isIso(r.at) || !isIso(r.until) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  const at = Date.parse(r.at);
  const until = Date.parse(r.until);
  if (at > now.getTime() + FUTURE_MS || at > until + FUTURE_MS || now.getTime() > until + CHALLENGE_GRACE_MS) return undefined;
  let note: ChallengeNote;
  const base = { id: r.id, by: r.by, at: r.at, until: r.until, sig: r.sig };
  if (r.kind === 'offer') {
    const from = parsePlayer(r.from);
    const to = parsePlayer(r.to);
    const table = parseTable(r.table);
    if (!from || !to || !table || from.key !== r.by || to.key === from.key || !isScore(r.score)) return undefined;
    if (r.source !== 'best' && r.source !== 'game') return undefined;
    // L'échéance est celle de la règle : 48 h après l'offre (une minute de jeu pour l'arrondi).
    if (Math.abs(until - at - CHALLENGE_MS) > FUTURE_MS) return undefined;
    note = { kind: 'offer', ...base, from, to, table, score: r.score, source: r.source };
  } else if (r.kind === 'score') {
    if (!isScore(r.score)) return undefined;
    note = { kind: 'score', ...base, score: r.score };
  } else if (r.kind === 'decline') {
    note = { kind: 'decline', ...base };
  } else return undefined;
  const { sig, ...body } = note;
  return verifyText(noteText(body), sig, note.by) ? note : undefined;
}

/** Ce qui distingue une note d'une autre : un défi, un genre, un auteur (le meilleur score de chacun l'emporte). */
export const challengeNoteKey = (n: Pick<ChallengeNote, 'id' | 'kind' | 'by'>): string => `${n.id}|${n.kind}|${n.by}`;

/** La note à garder entre deux du même genre et du même auteur : le score le plus haut, sinon la première. */
function better(had: ChallengeNote | undefined, next: ChallengeNote): boolean {
  if (!had) return true;
  if (had.kind === 'score' && next.kind === 'score') return next.score > had.score || (next.score === had.score && Date.parse(next.at) < Date.parse(had.at));
  return false;
}

// ---------------------------------------------------------------------------
// Relais (toutes les bornes, en mémoire)

/** Les notes connues de la borne, par challengeNoteKey. */
export type ChallengeRelay = Map<string, ChallengeNote>;

/** Notes reçues, déjà vérifiées : gardées si elles apportent du neuf. Rend celles-là, à relayer. */
export function mergeChallengeRelay(relay: ChallengeRelay, notes: readonly ChallengeNote[], now = new Date()): ChallengeNote[] {
  const fresh: ChallengeNote[] = [];
  for (const n of notes) {
    const k = challengeNoteKey(n);
    if (!better(relay.get(k), n)) continue;
    relay.set(k, n);
    fresh.push(n);
  }
  pruneChallengeRelay(relay, now);
  return fresh;
}

/** Ménage : les notes d'un défi fini depuis CHALLENGE_GRACE_MS partent ; au-delà de RELAY_MAX, les plus proches de leur fin. */
export function pruneChallengeRelay(relay: ChallengeRelay, now = new Date()): void {
  for (const [k, n] of relay) if (now.getTime() > Date.parse(n.until) + CHALLENGE_GRACE_MS) relay.delete(k);
  if (relay.size <= RELAY_MAX) return;
  const old = [...relay.entries()].sort((a, b) => Date.parse(a[1].until) - Date.parse(b[1].until)).slice(0, relay.size - RELAY_MAX);
  for (const [k] of old) relay.delete(k);
}

/** Ce que j'envoie au bonjour : mes notes d'abord, puis celles que je garde pour les autres. */
export function challengeSample(relay: ChallengeRelay, own: readonly ChallengeNote[], now = new Date()): ChallengeNote[] {
  const live = (n: ChallengeNote) => now.getTime() <= Date.parse(n.until) + CHALLENGE_GRACE_MS;
  const mine = own.filter(live);
  const seen = new Set(mine.map(challengeNoteKey));
  const others = [...relay.values()].filter((n) => live(n) && !seen.has(challengeNoteKey(n)));
  return [...mine, ...others].slice(0, CHALLENGE_BATCH);
}

// ---------------------------------------------------------------------------
// Mes défis (le fichier de la borne)

/** Les notes d'un défi qui me concerne : son offre (de moi ou à moi), et les notes de ses deux joueurs. */
function offersOf(notes: readonly ChallengeNote[]): Map<string, ChallengeOffer> {
  const out = new Map<string, ChallengeOffer>();
  for (const n of notes) if (n.kind === 'offer' && !out.has(n.id)) out.set(n.id, n);
  return out;
}

/**
 * Ajoute à mon fichier les notes qui me concernent : une offre de moi ou à moi, une note d'un des deux
 * joueurs d'un défi que je connais (ou la mienne). Les offres d'un joueur écarté (bloqué, exclu), ou
 * au-delà de CHALLENGE_FROM_ONE_MAX défis en cours venus de lui, sont laissées. Rend les notes ajoutées.
 */
export function mergeMyChallenges(store: ChallengeStore, notes: readonly ChallengeNote[], me: string, refused: (key: string) => boolean = () => false, now = new Date()): ChallengeNote[] {
  const added: ChallengeNote[] = [];
  // Les offres d'abord : une note de score arrivée avec son offre y trouve sa place.
  const ordered = [...notes].sort((a, b) => Number(b.kind === 'offer') - Number(a.kind === 'offer'));
  for (const n of ordered) {
    const offers = offersOf(store.notes);
    if (n.kind === 'offer') {
      if (n.from.key !== me && n.to.key !== me) continue;
      if (offers.has(n.id)) continue;
      const other = n.from.key === me ? n.to.key : n.from.key;
      if (other !== me && refused(other)) continue;
      if (n.to.key === me) {
        const running = [...offers.values()].filter((o) => o.from.key === n.from.key && o.to.key === me && Date.parse(o.until) > now.getTime()).length;
        if (running >= CHALLENGE_FROM_ONE_MAX) continue;
      }
    } else {
      const offer = offers.get(n.id);
      if (!offer || (n.by !== offer.from.key && n.by !== offer.to.key)) continue;
      // Seul le défié refuse ; une note signée après l'échéance ne compte pas.
      if (n.kind === 'decline' && n.by !== offer.to.key) continue;
      if (Date.parse(n.at) > Date.parse(offer.until) + FUTURE_MS || n.until !== offer.until) continue;
    }
    const k = challengeNoteKey(n);
    const i = store.notes.findIndex((x) => challengeNoteKey(x) === k);
    if (i >= 0 && !better(store.notes[i], n)) continue;
    if (i >= 0) store.notes.splice(i, 1, n);
    else store.notes.push(n);
    added.push(n);
  }
  if (added.length) pruneMyChallenges(store, now);
  return added;
}

/** Ménage du fichier : un défi fini depuis plus d'une semaine sort, avec ses notes ; au-delà de STORE_MAX défis, les plus anciens. */
export function pruneMyChallenges(store: ChallengeStore, now = new Date()): void {
  const offers = [...offersOf(store.notes).values()];
  const keep = new Set(
    offers
      .filter((o) => now.getTime() - Date.parse(o.until) < CHALLENGE_KEEP_MS)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, STORE_MAX)
      .map((o) => o.id),
  );
  // Une note sans son offre (pas encore arrivée) reste tant que son défi n'est pas fini depuis une semaine.
  store.notes = store.notes.filter((n) => keep.has(n.id) || (!offers.some((o) => o.id === n.id) && now.getTime() - Date.parse(n.until) < CHALLENGE_KEEP_MS));
  store.paid = store.paid.filter((id) => keep.has(id)).slice(-STORE_MAX);
  store.said = store.said.filter((k) => keep.has(k.split('|')[0]!)).slice(-4 * STORE_MAX);
}

/** Mes notes (signées par moi) des défis encore ouverts : redites à chaque bonjour, jusqu'à l'échéance. */
export function myOpenNotes(store: ChallengeStore, me: string, now = new Date()): ChallengeNote[] {
  const offers = offersOf(store.notes);
  return store.notes.filter((n) => {
    const o = offers.get(n.id);
    if (!o || now.getTime() > Date.parse(o.until) + CHALLENGE_GRACE_MS) return false;
    // L'offre d'un autre aussi : la borne du défié la redonne, au cas où celle du défiant reste éteinte.
    return n.by === me || n.kind === 'offer';
  });
}

/** Mes défis, tirés des notes : le plus pressant d'abord (à jouer, puis en attente, puis les résultats, les plus récents d'abord). */
export function myChallenges(store: Pick<ChallengeStore, 'notes'>, me: string, now = new Date()): Challenge[] {
  const out: Challenge[] = [];
  for (const offer of offersOf(store.notes).values()) {
    const role = offer.from.key === me ? 'sent' : offer.to.key === me ? 'received' : undefined;
    if (!role) continue;
    const of = store.notes.filter((n) => n.id === offer.id);
    const best = (key: string) => {
      const scores = of.filter((n): n is ChallengeScore => n.kind === 'score' && n.by === key && Date.parse(n.at) >= Date.parse(offer.at) - FUTURE_MS && Date.parse(n.at) <= Date.parse(offer.until) + FUTURE_MS).map((n) => n.score);
      return scores.length ? Math.max(...scores) : undefined;
    };
    const fromBest = Math.max(offer.score, best(offer.from.key) ?? 0);
    const toBest = best(offer.to.key);
    const declined = of.find((n) => n.kind === 'decline' && n.by === offer.to.key);
    const over = now.getTime() >= Date.parse(offer.until);
    const mine = role === 'sent' ? fromBest : toBest;
    const theirs = role === 'sent' ? toBest : fromBest;
    // Le défié mène s'il a battu le score de l'autre ; à égalité, le score à battre n'est pas battu.
    const toLeads = toBest !== undefined && toBest > fromBest;
    const leader = toBest === undefined ? undefined : (toLeads ? role === 'received' : role === 'sent') ? ('me' as const) : ('them' as const);
    let state: ChallengeState;
    if (declined) state = 'declined';
    else if (!over) state = toBest !== undefined ? 'running' : role;
    else if (toBest === undefined) state = 'expired';
    else state = leader === 'me' ? 'won' : 'lost';
    out.push({
      id: offer.id,
      table: offer.table,
      from: offer.from,
      to: offer.to,
      at: offer.at,
      until: offer.until,
      role,
      opponent: role === 'sent' ? offer.to : offer.from,
      target: offer.score,
      source: offer.source,
      ...(mine !== undefined ? { mine } : {}),
      ...(theirs !== undefined ? { theirs } : {}),
      state,
      ...(leader ? { leader } : {}),
      ...(declined ? { declinedAt: declined.at } : {}),
      settled: !declined && now.getTime() >= Date.parse(offer.until) + CHALLENGE_SETTLE_MS,
    });
  }
  const rank = (c: Challenge) => (challengeToPlay(c) ? 0 : challengeOpen(c) ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || (rank(a) < 2 ? Date.parse(a.until) - Date.parse(b.until) : Date.parse(b.until) - Date.parse(a.until)));
}

/** Défi encore ouvert (ni fini, ni refusé). */
export const challengeOpen = (c: Pick<Challenge, 'state'>): boolean => c.state === 'sent' || c.state === 'received' || c.state === 'running';

/** C'est à moi de jouer : défi ouvert où je ne mène pas (reçu sans avoir joué, ou battu par l'autre). */
export const challengeToPlay = (c: Pick<Challenge, 'state' | 'leader' | 'role'>): boolean => (c.state === 'received' || c.state === 'running') && c.leader !== 'me' && !(c.state === 'running' && c.leader === undefined);

/** Peut-on défier ce joueur sur cette version ? Undefined : oui ; sinon la raison, dite à l'écran. */
export function challengeBlocked(list: readonly Challenge[], opponent: string, table: Pick<ChallengeTable, 'board' | 'balls'>, me: string): string | undefined {
  if (opponent === me) return t('Tu ne peux pas te défier toi-même');
  const same = list.find((c) => challengeOpen(c) && c.opponent.key === opponent && c.table.board === table.board && (c.table.balls ?? 0) === (table.balls ?? 0));
  if (same) return t('Défi déjà en cours sur cette table');
  if (list.filter((c) => c.role === 'sent' && challengeOpen(c)).length >= CHALLENGE_SENT_MAX) return tn(CHALLENGE_SENT_MAX, 'Déjà {n} défi en cours : attends la fin d’un défi', 'Déjà {n} défis en cours : attends la fin d’un défi');
  return undefined;
}

/** Le défi a-t-il un vainqueur à payer : gagné par moi, acquis, pas encore payé. */
export const challengeToPay = (store: Pick<ChallengeStore, 'paid'>, c: Challenge): boolean => c.state === 'won' && c.settled && !store.paid.includes(c.id);

// ---------------------------------------------------------------------------
// Ce qui s'annonce

export type ChallengeStage = 'received' | 'beaten' | 'expiring' | 'won' | 'lost' | 'expired' | 'declined';

export interface ChallengeNews {
  stage: ChallengeStage;
  challenge: Challenge;
  /** Identité de l'annonce (jamais deux fois la même) : le défi, l'étape, le score de l'autre pour « battu ». */
  key: string;
}

/**
 * Les nouvelles de mes défis, pas encore dites (`store.said`) : un défi reçu, l'autre qui passe devant
 * (« Nina a battu votre score : à vous »), plus que 6 h alors que je ne mène pas, le résultat, un refus.
 * Les annonces rendues sont notées dites dans le fichier (à enregistrer).
 */
export function challengeNews(store: ChallengeStore, me: string, now = new Date()): ChallengeNews[] {
  const out: ChallengeNews[] = [];
  const say = (stage: ChallengeStage, c: Challenge, suffix = '') => {
    const key = `${c.id}|${stage}${suffix}`;
    if (store.said.includes(key)) return;
    store.said.push(key);
    out.push({ stage, challenge: c, key });
  };
  for (const c of myChallenges(store, me, now)) {
    if (c.state === 'declined') {
      if (c.role === 'sent') say('declined', c);
      continue;
    }
    if (c.role === 'received' && Date.parse(c.until) > now.getTime()) say('received', c);
    if (challengeOpen(c)) {
      // Le joueur d'en face passe devant moi : une fois par score.
      if (c.leader === 'them' && c.theirs !== undefined && (c.role === 'sent' || c.mine !== undefined)) say('beaten', c, `|${c.theirs}`);
      if (Date.parse(c.until) - now.getTime() <= CHALLENGE_EXPIRING_MS && c.leader !== 'me') say('expiring', c);
      continue;
    }
    // Le résultat : à l'échéance.
    if (c.state === 'won' || c.state === 'lost' || c.state === 'expired') say(c.state, c);
  }
  // Un défi reçu déjà fini avant d'arriver ne s'annonce pas « reçu » : son résultat suffit.
  return out.filter((n) => !(n.stage === 'received' && !challengeOpen(n.challenge)));
}

/** Le temps qui reste : « 31 h », « 45 min », « moins d'une minute ». */
export function challengeTimeLeft(until: string, now = new Date()): string {
  const ms = Math.max(0, Date.parse(until) - now.getTime());
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return t('{n} h', { n: hours });
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 1 ? t('{n} min', { n: minutes }) : t('moins d’une minute');
}

/** La part de la fenêtre déjà écoulée, de 0 à 1 (la barre de la carte). */
export function challengeElapsed(c: Pick<Challenge, 'at' | 'until'>, now = new Date()): number {
  const span = Date.parse(c.until) - Date.parse(c.at);
  return span > 0 ? Math.max(0, Math.min(1, (now.getTime() - Date.parse(c.at)) / span)) : 1;
}

// ---------------------------------------------------------------------------
// Le fichier

const isKeptText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Le fichier relu : chaque note revérifiée par sa signature (sans la fraîcheur : un résultat se garde une semaine). */
export function parseChallenges(raw: unknown, now = new Date()): ChallengeStore | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.v !== VERSION || !Array.isArray(r.notes)) return undefined;
  // La fraîcheur d'un relais ne vaut pas ici : la note est relue comme à son échéance.
  const notes = r.notes
    .map((n) => {
      const until = n && typeof n === 'object' ? Date.parse(String((n as { until?: unknown }).until)) : NaN;
      return Number.isFinite(until) ? verifyChallengeNote(n, new Date(Math.min(now.getTime(), until))) : undefined;
    })
    .filter((n): n is ChallengeNote => !!n);
  return {
    v: VERSION,
    notes,
    paid: Array.isArray(r.paid) ? r.paid.filter(isId) : [],
    said: Array.isArray(r.said) ? r.said.filter((x): x is string => isKeptText(x, 80)) : [],
  };
}

export const challengesFile = (dataDir: string): string => path.join(dataDir, 'amis', CHALLENGES_FILE);

/** Le fichier de mes défis ; illisible : mis de côté (readKeptJson), on repart de rien. */
export function loadChallenges(file: string, now = new Date()): { store: ChallengeStore; setAside?: string } {
  const kept = readKeptJson(file, now);
  const store = kept.value === undefined ? undefined : parseChallenges(kept.value, now);
  return { store: store ?? emptyChallenges(), ...(kept.setAside ? { setAside: kept.setAside } : {}) };
}

export function saveChallenges(file: string, store: ChallengeStore): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, `${JSON.stringify(store, null, 2)}\n`);
}
