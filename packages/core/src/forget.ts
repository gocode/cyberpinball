// Suppression du compte (RGPD, droit à l'effacement), novembre 2026.
//
// Le compte d'un joueur, c'est sa clé (social.ts) : il n'y a pas de serveur de comptes, ses données
// vivent sur sa borne et, pour ce qu'il a partagé, sur les bornes des autres (annuaire, amis,
// classements, carte publique, « J'aime », lignes de salon, messages privés). Supprimer son compte :
//  1. un avis d'oubli, signé par sa clé, part vers toutes les bornes reliées, qui l'appliquent et le
//     relaient, et le joignent à leur bonjour pour celles qui étaient éteintes ;
//  2. chaque borne efface alors tout ce qui vient de cette clé et refuse ce qui en arriverait encore
//     (un relais d'une borne qui ne sait pas encore) : l'avis est gardé, sans nom, juste la clé ;
//  3. la borne du joueur efface ses fichiers (app/src/account-delete.ts) et repart avec une clé neuve.
//
// Fichier : <données>\amis\oublis.json (les avis reçus ou émis).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import type { SocialState } from './social';
import type { RankingStore } from './rankings';
import type { ProfileStore } from './publicprofile';
import type { RoomsState } from './rooms';
import type { ChatState } from './chat';

/** Avis gardés au plus : les plus récents (un avis pèse environ 200 octets). */
export const FORGET_MAX = 20_000;
/** Avis joints au bonjour d'une liaison, puis relayés par lots. */
export const FORGET_BATCH = 200;
const FUTURE_MS = 10 * 60_000;

export interface ForgetNotice {
  /** La clé du compte supprimé. */
  key: string;
  at: string;
  sig: string;
}

export interface ForgetStore {
  v: 1;
  notices: ForgetNotice[];
}

export const emptyForgets = (): ForgetStore => ({ v: 1, notices: [] });
export const forgetsFile = (dataDir: string) => path.join(dataDir, 'amis', 'oublis.json');

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function noticeText(n: Omit<ForgetNotice, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'forget', key: n.key, at: n.at });
}

/** L'avis d'oubli de mon compte, signé par sa clé. */
export function signForget(key: PlayerKey, now = new Date()): ForgetNotice {
  const base = { key: key.publicKey, at: now.toISOString() };
  return { ...base, sig: signText(noticeText(base), key) };
}

/** Avis reçu : forme et signature de la clé qu'il efface ; daté du futur : refusé. */
export function verifyForget(raw: unknown, now = new Date()): ForgetNotice | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isPlayerPublicKey(r.key) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (Date.parse(r.at) > now.getTime() + FUTURE_MS) return undefined;
  const n: ForgetNotice = { key: r.key, at: r.at, sig: r.sig };
  return verifyText(noticeText({ key: n.key, at: n.at }), n.sig, n.key) ? n : undefined;
}

export function loadForgets(dataDir: string): ForgetStore {
  try {
    const raw = JSON.parse(fs.readFileSync(forgetsFile(dataDir), 'utf8')) as Record<string, unknown>;
    // Relus sans revérifier les signatures (vérifiées à l'arrivée), mais leur forme oui.
    const notices = (Array.isArray(raw?.notices) ? raw.notices : []).filter((n): n is ForgetNotice => {
      const r = n as Record<string, unknown>;
      return !!r && typeof r === 'object' && isPlayerPublicKey(r.key) && isIso(r.at) && typeof r.sig === 'string';
    });
    return { v: 1, notices: notices.slice(-FORGET_MAX) };
  } catch {
    return emptyForgets();
  }
}

export function saveForgets(dataDir: string, store: ForgetStore): void {
  writeFileAtomic(forgetsFile(dataDir), JSON.stringify(store));
}

/** Avis vérifiés : les nouveaux (clé pas encore oubliée) sont gardés et rendus, à appliquer et relayer. */
export function mergeForgets(store: ForgetStore, notices: readonly ForgetNotice[]): { store: ForgetStore; fresh: ForgetNotice[] } {
  const known = new Set(store.notices.map((n) => n.key));
  const fresh = notices.filter((n) => !known.has(n.key) && (known.add(n.key), true));
  if (!fresh.length) return { store, fresh };
  return { store: { v: 1, notices: [...store.notices, ...fresh].slice(-FORGET_MAX) }, fresh };
}

/** Les clés oubliées, pour refuser d'un coup tout ce qui en viendrait. */
export function forgottenKeys(store: ForgetStore): Set<string> {
  return new Set(store.notices.map((n) => n.key));
}

/** Une part des avis à joindre au bonjour d'une liaison : les plus récents. */
export function forgetsSample(store: ForgetStore): ForgetNotice[] {
  return store.notices.slice(-FORGET_BATCH);
}

// ---------------------------------------------------------------------------
// Effacer un joueur oublié de chaque donnée de la borne (chaque fonction rend le même objet s'il n'y
// a rien à effacer).

/** Annuaire, amis, demandes, refus, avatars des amis. Le blocage reste (il ne dit rien de lui). */
export function forgetInSocial(s: SocialState, keys: ReadonlySet<string>): SocialState {
  const directory = s.directory.filter((e) => !keys.has(e.profile.key));
  const friends = s.friends.filter((f) => !keys.has(f.key));
  const incoming = s.incoming.filter((r) => !keys.has(r.key));
  const outgoing = s.outgoing.filter((r) => !keys.has(r.key));
  const declined = s.declined.filter((d) => !keys.has(d.key));
  const avatars = s.peerAvatars ? Object.entries(s.peerAvatars).filter(([k]) => !keys.has(k)) : undefined;
  const same = directory.length === s.directory.length && friends.length === s.friends.length && incoming.length === s.incoming.length && outgoing.length === s.outgoing.length && declined.length === s.declined.length && (!avatars || avatars.length === Object.keys(s.peerAvatars!).length);
  if (same) return s;
  const { peerAvatars: _, ...rest } = s;
  return { ...rest, directory, friends, incoming, outgoing, declined, ...(avatars?.length ? { peerAvatars: Object.fromEntries(avatars) } : {}) };
}

/** Ses scores des classements (le magasin est modifié sur place, comme mergeRankings) ; vrai si quelque chose est parti. */
export function forgetInRankings(store: RankingStore, keys: ReadonlySet<string>): boolean {
  const scores = store.scores.filter((s) => !keys.has(s.key));
  const hidden = store.hidden.filter((h) => !(h.startsWith('k:') && keys.has(h.slice(2))));
  if (scores.length === store.scores.length && hidden.length === store.hidden.length) return false;
  store.scores = scores;
  store.hidden = hidden;
  return true;
}

/** Sa carte publique, ses « J'aime » donnés ou reçus, son masquage. */
export function forgetInProfiles(p: ProfileStore, keys: ReadonlySet<string>): ProfileStore {
  const cards = p.cards.filter((c) => !keys.has(c.key));
  const seen = Object.entries(p.seen).filter(([k]) => !keys.has(k));
  const given = p.given.filter((l) => !keys.has(l.to));
  const received = p.received.filter((l) => !keys.has(l.from));
  const hidden = p.hidden.filter((k) => !keys.has(k));
  if (cards.length === p.cards.length && seen.length === Object.keys(p.seen).length && given.length === p.given.length && received.length === p.received.length && hidden.length === p.hidden.length) return p;
  return { ...p, cards, seen: Object.fromEntries(seen), given, received, hidden };
}

/** Ses lignes et ses retraits dans les salons, et son nom parmi les joueurs ignorés. */
export function forgetInRooms(s: RoomsState, keys: ReadonlySet<string>): RoomsState {
  const lines = s.lines.filter((l) => !keys.has(l.key));
  const ignored = s.ignored.filter((k) => !keys.has(k));
  const retracted = s.retracted?.filter((d) => !keys.has(d.key));
  if (lines.length === s.lines.length && ignored.length === s.ignored.length && retracted?.length === s.retracted?.length) return s;
  const { retracted: _, ...rest } = s;
  return { ...rest, lines, ignored, ...(retracted?.length ? { retracted } : {}) };
}

/** Sa conversation entière (ses messages et les miens, qui n'ont plus de destinataire). */
export function forgetInChat(s: ChatState, keys: ReadonlySet<string>): ChatState {
  const gone = Object.keys(s.conversations).filter((k) => keys.has(k));
  if (!gone.length) return s;
  return { ...s, conversations: Object.fromEntries(Object.entries(s.conversations).filter(([k]) => !keys.has(k))) };
}
