// Personnes invitées (décidé le 17/11/2026) : un joueur fait découvrir Cyber Pinball à un autre, et
// le nombre de personnes qu'il a invitées s'affiche sur son profil, avec le badge Ambassadeur dès la
// première. Jamais « parrain » ni « filleul » : on dit « personnes invitées », « a invité ».
//
// Sans serveur ni compte, seul le joueur invité peut dire qui l'a invité :
// - au premier lancement (ou plus tard, Menu système > Communauté), il répond à « Qui t'a fait découvrir
//   Cyber Pinball ? » : un joueur de l'annuaire, ou personne (declareInviter, declineInviter) ;
// - l'invitation ne compte qu'à sa première partie menée au bout (confirmInvitation) : sa borne signe
//   alors une attestation (Invitation) et la remet à la borne de l'inviteur, ou la fait relayer ;
// - l'inviteur garde les attestations reçues (receiveInvited) : une par machine invitée (empreinte
//   non réversible de la machine, machineTag), jamais sa propre machine, jamais lui-même ;
// - il les joint à sa carte publique (cardInvites) : toute borne vérifie le nombre affiché
//   (invitedCount). Le profil de la personne invitée ne dit jamais qui l'a invitée.
//
// Fichier : <données>\amis\invitations.json.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName } from './social';

/** Attestations jointes au plus à une carte publique : de quoi prouver le badge Bâtisseur de communauté. */
export const INVITES_IN_CARD = 20;
/** Attestations gardées au plus par l'inviteur. */
export const INVITES_MAX = 500;
/** Relais d'une attestation dont l'inviteur n'est pas relié : deux bornes au plus. */
export const INVITE_TTL = 2;
/** Après ce délai depuis le premier lancement, la question « Qui t'a fait découvrir… » n'est plus posée. */
export const DECLARE_DAYS = 30;

const DAY = 86_400_000;

/** « J'ai été invité par `by` » : signée par la borne invitée (`me`), à sa première partie menée au bout. */
export interface Invitation {
  by: string;
  me: string;
  /** Pseudo de la personne invitée ce jour-là. */
  name: string;
  /** Empreinte de sa machine (machineTag) : une machine n'est invitée qu'une fois. */
  machine: string;
  at: string;
  sig: string;
}

/** Une attestation dans la carte publique de l'inviteur : `by` est la clé de la carte. */
export type CardInvite = Omit<Invitation, 'by'>;

export interface InvitationStore {
  v: 1;
  /** Celui qui m'a fait découvrir Cyber Pinball, déclaré ; plus modifiable une fois confirmé. */
  declared?: { by: string; name: string; at: string };
  /** « Personne » : la question n'est plus posée. */
  declined?: string;
  /** Mon attestation, signée à ma première partie menée au bout. */
  mine?: Invitation;
  /** Remise directement à la borne de l'inviteur. */
  sent?: boolean;
  /** Les personnes que j'ai invitées : une attestation chacune. */
  received: Invitation[];
}

export const emptyInvitations = (): InvitationStore => ({ v: 1, received: [] });
export const invitationsFile = (dataDir: string) => path.join(dataDir, 'amis', 'invitations.json');

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isMachine = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/** Empreinte d'une machine (MachineGuid de Windows) : rien d'elle ne se lit dans l'empreinte. */
export function machineTag(machineGuid: string): string {
  return crypto.createHash('sha256').update(`cyberpinball:invitation:${machineGuid.trim().toLowerCase()}`).digest('hex').slice(0, 16);
}

function invitationText(i: Omit<Invitation, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'invited', by: i.by, me: i.me, name: i.name, machine: i.machine, at: i.at });
}

export function signInvitation(key: PlayerKey, name: string, by: string, machine: string, now = new Date()): Invitation {
  const base = { by, me: key.publicKey, name, machine, at: now.toISOString() };
  return { ...base, sig: signText(invitationText(base), key) };
}

/** Attestation reçue : forme et signature vérifiées ; undefined sinon. */
export function verifyInvitation(raw: unknown, now = new Date()): Invitation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.by) || !isPlayerPublicKey(r.me) || r.by === r.me || !name || name !== r.name || !isMachine(r.machine) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (Date.parse(r.at) > now.getTime() + 10 * 60_000) return undefined;
  const inv: Invitation = { by: r.by, me: r.me, name, machine: r.machine, at: r.at, sig: r.sig };
  const { sig, ...base } = inv;
  return verifyText(invitationText(base), sig, inv.me) ? inv : undefined;
}

// ---------------------------------------------------------------------------
// Côté personne invitée

/** La question « Qui t'a fait découvrir Cyber Pinball ? » se pose-t-elle encore ? */
export function inviterAsked(store: InvitationStore, firstLaunch: string | undefined, now = new Date()): boolean {
  if (store.mine || store.declined || store.declared) return false;
  const since = firstLaunch ? Date.parse(firstLaunch) : now.getTime();
  return !Number.isFinite(since) || now.getTime() - since < DECLARE_DAYS * DAY;
}

/** Déclarer (ou changer, tant que rien n'est confirmé) celui qui m'a invité. */
export function declareInviter(store: InvitationStore, by: string, name: string, me: string, now = new Date()): InvitationStore {
  if (store.mine || by === me || !isPlayerPublicKey(by)) return store;
  const { declined: _, ...rest } = store;
  return { ...rest, declared: { by, name, at: now.toISOString() } };
}

/** « Personne » : la question ne revient plus ; une déclaration pas encore confirmée est retirée. */
export function declineInviter(store: InvitationStore, now = new Date()): InvitationStore {
  if (store.mine) return store;
  const { declared: _, ...rest } = store;
  return { ...rest, declined: now.toISOString() };
}

/**
 * Ma première partie menée au bout : l'invitation déclarée devient une attestation signée, à remettre
 * à l'inviteur. Rien si rien n'est déclaré ou si c'est déjà fait.
 */
export function confirmInvitation(store: InvitationStore, key: PlayerKey, name: string, machine: string, now = new Date()): { store: InvitationStore; invitation?: Invitation } {
  if (store.mine || !store.declared || !isMachine(machine)) return { store };
  const invitation = signInvitation(key, name, store.declared.by, machine, now);
  return { store: { ...store, mine: invitation, sent: false }, invitation };
}

// ---------------------------------------------------------------------------
// Côté inviteur

/**
 * Attestation reçue (déjà vérifiée). Refusée : pas pour moi, ma propre machine, une machine ou un
 * joueur déjà comptés (la plus ancienne l'emporte). `news` : une personne invitée de plus.
 */
export function receiveInvited(store: InvitationStore, inv: Invitation, me: string, myMachine: string | undefined): { store: InvitationStore; news: boolean } {
  if (inv.by !== me || inv.me === me || (myMachine && inv.machine === myMachine)) return { store, news: false };
  if (store.received.some((r) => r.me === inv.me || r.machine === inv.machine)) return { store, news: false };
  const received = [...store.received, inv].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, INVITES_MAX);
  return { store: { ...store, received }, news: received.includes(inv) };
}

/** Un compte supprimé (forget.ts) : son attestation part, il ne compte plus. */
export function forgetInvited(store: InvitationStore, keys: ReadonlySet<string>): InvitationStore {
  const received = store.received.filter((r) => !keys.has(r.me));
  return received.length === store.received.length ? store : { ...store, received };
}

/** Les attestations à joindre à ma carte : les plus récentes. */
export function cardInvites(store: InvitationStore): CardInvite[] {
  return store.received.slice(-INVITES_IN_CARD).map(({ by: _, ...rest }) => rest);
}

/** Forme d'une attestation jointe à une carte (sa signature se vérifie à l'affichage, invitedCount). */
export function isCardInvite(raw: unknown): raw is CardInvite {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return isPlayerPublicKey(r.me) && typeof r.name === 'string' && r.name.length <= 40 && isMachine(r.machine) && isIso(r.at) && typeof r.sig === 'string' && r.sig.length <= 200;
}

const checked = new Map<string, boolean>();

/**
 * Les personnes invitées d'un joueur, d'après sa carte : seules les attestations dont la signature
 * est celle de la personne invitée comptent, une par machine et par joueur, jamais lui-même.
 * `claimed` : le total annoncé par la carte, cru seulement au-delà des INVITES_IN_CARD jointes.
 */
export function invitedOf(cardKey: string, invites: readonly CardInvite[] | undefined, claimed?: number): { count: number; players: CardInvite[] } {
  const players: CardInvite[] = [];
  const machines = new Set<string>(), keys = new Set<string>();
  for (const i of invites ?? []) {
    if (i.me === cardKey || keys.has(i.me) || machines.has(i.machine)) continue;
    let ok = checked.get(i.sig);
    if (ok === undefined) {
      ok = verifyText(invitationText({ by: cardKey, me: i.me, name: i.name, machine: i.machine, at: i.at }), i.sig, i.me);
      if (checked.size > 5000) checked.clear();
      checked.set(i.sig, ok);
    }
    if (!ok) continue;
    keys.add(i.me);
    machines.add(i.machine);
    players.push(i);
  }
  const full = players.length >= INVITES_IN_CARD;
  const count = full && claimed !== undefined && Number.isInteger(claimed) ? Math.max(players.length, Math.min(claimed, INVITES_MAX)) : players.length;
  return { count, players };
}

// ---------------------------------------------------------------------------
// Fichier

export function loadInvitations(dataDir: string, now = new Date()): InvitationStore {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(invitationsFile(dataDir), 'utf8'));
  } catch {
    return emptyInvitations();
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = r.declared && typeof r.declared === 'object' ? (r.declared as Record<string, unknown>) : undefined;
  const declaredName = d ? normalizeName(d.name) : undefined;
  const declared = d && isPlayerPublicKey(d.by) && declaredName && isIso(d.at) ? { by: d.by, name: declaredName, at: d.at } : undefined;
  const mine = verifyInvitation(r.mine, now);
  const received = (Array.isArray(r.received) ? r.received : []).map((i) => verifyInvitation(i, now)).filter((i): i is Invitation => !!i).slice(0, INVITES_MAX);
  return {
    v: 1,
    ...(declared ? { declared } : {}),
    ...(isIso(r.declined) ? { declined: r.declined } : {}),
    ...(mine ? { mine, sent: r.sent === true } : {}),
    received,
  };
}

export function saveInvitations(dataDir: string, store: InvitationStore): void {
  fs.mkdirSync(path.dirname(invitationsFile(dataDir)), { recursive: true });
  writeFileAtomic(invitationsFile(dataDir), JSON.stringify(store));
}
