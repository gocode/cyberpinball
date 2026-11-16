// Salons de discussion par pays (décidés le 12/11/2026) : un salon par pays déclaré, plus « Monde » ;
// un journal à l'ancienne, une ligne par message, sans serveur.
//
// Chaque ligne est signée par la clé de son auteur et voyage de borne en borne, comme les scores et
// la présence publique : chaque borne vérifie la signature, écarte un doublon (même identifiant), puis
// applique les limites d'envoi (une ligne toutes les 3 secondes, 20 en 10 minutes par joueur) avant de
// garder et de relayer. Une ligne au-delà des limites s'arrête donc à la première borne. Chaque borne
// garde 7 jours de lignes (300 par salon au plus) et en donne les 100 dernières des 24 dernières heures
// à qui entre dans un salon. Les présents d'un salon s'annoncent par un petit signal signé (`RoomHere`),
// toutes les deux minutes tant qu'ils y sont, frais pendant cinq minutes.
//
// Ici, rien du réseau : les formes, les signatures, la fusion, les limites, le filtre de mots et le
// fichier de la borne (<données>\amis\salons.json : lignes, règles acceptées, joueurs ignorés, réglages).

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { signAvatarClaim, verifyAvatarClaim } from './avatar';
import { writeFileAtomic } from './atomicwrite';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName } from './social';
import { isReaction, type Reaction } from './reactions';

/** Longueur d'une ligne, en caractères. */
export const ROOM_TEXT_MAX = 300;
/** Lignes gardées sur la borne : 7 jours, et 300 par salon au plus. */
export const ROOM_KEEP_DAYS = 7;
export const ROOM_LINES_MAX = 300;
/** Salons gardés au plus (les plus actifs). */
export const ROOMS_MAX = 60;
/** Historique donné à qui entre : les 100 dernières lignes des 24 dernières heures. */
export const ROOM_BACKLOG_MS = 24 * 3600_000;
export const ROOM_BACKLOG_MAX = 100;
/** Limites d'envoi par joueur : une ligne toutes les 3 s, 20 en 10 min. */
export const ROOM_GAP_MS = 3000;
export const ROOM_BURST = 20;
export const ROOM_BURST_MS = 10 * 60_000;
/** Lignes par message (relais, historique). */
export const ROOM_BATCH = 100;
/** Présents : un signal toutes les deux minutes tant qu'on est dans le salon, frais cinq minutes. */
export const ROOM_HERE_MS = 120_000;
export const ROOM_HERE_FRESH_MS = 5 * 60_000;
/**
 * Un salon quitté reste annoncé encore une minute (16/11/2026) : qui passe voit que quelqu'un vient
 * d'y être. Chez les autres bornes, le dernier signal reste ensuite frais ROOM_HERE_FRESH_MS.
 */
export const ROOM_LINGER_MS = 60_000;
/**
 * Un nombre de joueurs connectés (présents d'un salon, joueurs en ligne, ceux de mon pays) ne s'affiche
 * qu'au-delà de cinq (16/11/2026) : un salon ou un réseau presque vide, chiffré, découragerait d'entrer.
 * Les joueurs restent nommés ; le nombre de mes amis en ligne, lui, se dit toujours.
 */
export const CROWD_SHOWN_ABOVE = 5;
/** Le nombre de joueurs connectés à afficher ; undefined : cinq ou moins, on ne le dit pas. */
export const shownCrowd = (n: number): number | undefined => (n > CROWD_SHOWN_ABOVE ? n : undefined);
const FUTURE_MS = 60_000;
const DAY = 86_400_000;

/** « monde », ou « pays-FR » : le salon d'un pays déclaré. */
export type RoomId = string;
export const WORLD_ROOM: RoomId = 'monde';
export const roomOfCountry = (country: string): RoomId => `pays-${country}`;
export const isRoomId = (v: unknown): v is RoomId => v === WORLD_ROOM || (typeof v === 'string' && /^pays-[A-Z]{2}$/.test(v));
/** Le pays d'un salon de pays ; undefined pour Monde. */
export const roomCountry = (room: RoomId): string | undefined => (room.startsWith('pays-') ? room.slice(5) : undefined);

export interface RoomLine {
  id: string;
  room: RoomId;
  key: string;
  name: string;
  country?: string;
  text: string;
  /** Une action (« /me lance Comet Chaser »), écrite en italique après le pseudo. */
  me?: boolean;
  at: string;
  sig: string;
}

/**
 * Retrait d'une ligne par son auteur (novembre 2026) : signé par la même clé que la ligne, relayé
 * comme elle, et gardé aussi longtemps qu'elle (7 jours) pour qu'une borne qui la relaierait encore
 * ne la fasse pas revenir. Personne d'autre ne peut retirer la ligne d'un joueur (la modération la masque).
 */
export interface RoomRetraction {
  /** La ligne retirée. */
  id: string;
  room: RoomId;
  key: string;
  at: string;
  sig: string;
}

/**
 * Réaction d'un joueur à une ligne (16/11/2026, reactions.ts) : signée par sa clé, relayée comme les
 * lignes et gardée 7 jours. Seule la plus récente de chaque joueur sur une ligne compte ; `kind` null :
 * réaction retirée. Une par joueur et par ligne : le nombre de réactions reste borné par les lignes.
 */
export interface RoomReaction {
  /** La ligne visée. */
  id: string;
  room: RoomId;
  key: string;
  name: string;
  kind: Reaction | null;
  at: string;
  sig: string;
}

/** Réactions gardées au plus sur la borne, et données à qui entre dans un salon. */
export const ROOM_REACTIONS_MAX = 5000;
export const ROOM_REACTIONS_BATCH = 300;

export interface RoomHere {
  key: string;
  name: string;
  country?: string;
  room: RoomId;
  at: string;
  sig: string;
  /** Empreinte de son avatar (avatar.ts, avatar public) et sa signature à part ; absentes : ses initiales. */
  avatar?: string;
  asig?: string;
}

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/** Texte d'une ligne : une seule ligne, sans caractère de contrôle, bords nettoyés, 300 caractères au plus. */
export function cleanRoomText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!text || [...text].length > ROOM_TEXT_MAX) return undefined;
  return text;
}

function lineText(l: Omit<RoomLine, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'room', id: l.id, room: l.room, key: l.key, name: l.name, country: l.country ?? null, text: l.text, me: l.me === true, at: l.at });
}

function retractionText(r: Omit<RoomRetraction, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'room-del', id: r.id, room: r.room, key: r.key, at: r.at });
}

/** Le retrait signé de ma ligne `line` ; undefined si elle n'est pas à moi. */
export function signRoomRetraction(me: { key: PlayerKey }, line: Pick<RoomLine, 'id' | 'room' | 'key'>, now = new Date()): RoomRetraction | undefined {
  if (line.key !== me.key.publicKey) return undefined;
  const base: Omit<RoomRetraction, 'sig'> = { id: line.id, room: line.room, key: line.key, at: now.toISOString() };
  return { ...base, sig: signText(retractionText(base), me.key) };
}

/** Retrait reçu : forme, date et signature de l'auteur vérifiées ; plus vieux que 7 jours ou du futur : refusé. */
export function verifyRoomRetraction(raw: unknown, now = new Date()): RoomRetraction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id) || !isRoomId(r.room) || !isPlayerPublicKey(r.key) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > ROOM_KEEP_DAYS * DAY) return undefined;
  const d: RoomRetraction = { id: r.id, room: r.room, key: r.key, at: r.at, sig: r.sig };
  const { sig, ...base } = d;
  return verifyText(retractionText(base), sig, d.key) ? d : undefined;
}

function reactionSignedText(r: Omit<RoomReaction, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'room-react', id: r.id, room: r.room, key: r.key, name: r.name, react: r.kind, at: r.at });
}

/** Ma réaction à la ligne `line` (null : la retirer), signée maintenant. */
export function signRoomReaction(me: { key: PlayerKey; name: string }, line: Pick<RoomLine, 'id' | 'room'>, kind: Reaction | null, now = new Date()): RoomReaction {
  const base: Omit<RoomReaction, 'sig'> = { id: line.id, room: line.room, key: me.key.publicKey, name: me.name, kind, at: now.toISOString() };
  return { ...base, sig: signText(reactionSignedText(base), me.key) };
}

/** Réaction reçue : forme, date et signature vérifiées ; plus vieille que 7 jours ou du futur : refusée. */
export function verifyRoomReaction(raw: unknown, now = new Date()): RoomReaction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isId(r.id) || !isRoomId(r.room) || !isPlayerPublicKey(r.key) || !name || name !== r.name || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.kind !== null && !isReaction(r.kind)) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > ROOM_KEEP_DAYS * DAY) return undefined;
  const d: RoomReaction = { id: r.id, room: r.room, key: r.key, name, kind: r.kind as Reaction | null, at: r.at, sig: r.sig };
  const { sig, ...base } = d;
  return verifyText(reactionSignedText(base), sig, d.key) ? d : undefined;
}

function hereText(h: Omit<RoomHere, 'sig' | 'avatar' | 'asig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'room-here', key: h.key, name: h.name, country: h.country ?? null, room: h.room, at: h.at });
}

/** Ma ligne, signée maintenant ; undefined si le texte est vide ou trop long. */
export function signRoomLine(me: { key: PlayerKey; name: string }, content: { room: RoomId; text: string; me?: boolean; country?: string }, now = new Date()): RoomLine | undefined {
  const text = cleanRoomText(content.text);
  if (!text || !isRoomId(content.room)) return undefined;
  const base: Omit<RoomLine, 'sig'> = { id: randomBytes(8).toString('hex'), room: content.room, key: me.key.publicKey, name: me.name, ...(content.country ? { country: content.country } : {}), text, ...(content.me ? { me: true } : {}), at: now.toISOString() };
  return { ...base, sig: signText(lineText(base), me.key) };
}

/** Ligne reçue : forme, date et signature vérifiées ; undefined sinon. Plus vieille que 7 jours ou du futur : refusée. */
export function verifyRoomLine(raw: unknown, now = new Date()): RoomLine | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  const text = cleanRoomText(r.text);
  if (!isId(r.id) || !isRoomId(r.room) || !isPlayerPublicKey(r.key) || !name || name !== r.name || !text || text !== r.text || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  if (r.me !== undefined && r.me !== true) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > ROOM_KEEP_DAYS * DAY) return undefined;
  const line: RoomLine = { id: r.id, room: r.room, key: r.key, name, ...(r.country ? { country: r.country as string } : {}), text, ...(r.me ? { me: true } : {}), at: r.at, sig: r.sig };
  const { sig, ...base } = line;
  return verifyText(lineText(base), sig, line.key) ? line : undefined;
}

export function signRoomHere(me: { key: PlayerKey; name: string }, room: RoomId, country: string | undefined, now = new Date(), avatar?: string): RoomHere {
  const base: Omit<RoomHere, 'sig' | 'avatar' | 'asig'> = { key: me.key.publicKey, name: me.name, ...(country ? { country } : {}), room, at: now.toISOString() };
  return { ...base, sig: signText(hereText(base), me.key), ...signAvatarClaim('room-here', me.key, base.at, avatar) };
}

export function verifyRoomHere(raw: unknown, now = new Date()): RoomHere | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isPlayerPublicKey(r.key) || !name || name !== r.name || !isRoomId(r.room) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  const at = Date.parse(r.at);
  if (at > now.getTime() + FUTURE_MS || now.getTime() - at > ROOM_HERE_FRESH_MS) return undefined;
  const here: RoomHere = { key: r.key, name, ...(r.country ? { country: r.country as string } : {}), room: r.room, at: r.at, sig: r.sig };
  const { sig, ...base } = here;
  return verifyText(hereText(base), sig, here.key) ? { ...here, ...verifyAvatarClaim('room-here', here.key, here.at, r) } : undefined;
}

// ---------------------------------------------------------------------------
// État de la borne

export interface RoomsState {
  version: 1;
  /** « Salons : activés » (par défaut) ; désactivés, ils restent visibles, grisés avec leur raison. */
  enabled: boolean;
  /** Filtre de mots grossiers, actif par défaut. */
  filter: boolean;
  /** Une mention de mon pseudo pendant une partie : la carte en haut du plateau (par défaut). */
  mentionsInGame: boolean;
  /** Règles des salons acceptées (ISO) : sans elles, on lit sans écrire. */
  rulesAt?: string;
  /** Nouvelles lignes de mes salons notifiées au menu (par défaut) ; false : rien. */
  lineNotices?: false;
  /** Le salon où l'on entre depuis la Communauté ; absent : celui de mon pays, sinon Monde. */
  defaultRoom?: RoomId;
  /** Joueurs ignorés dans les salons (clés) : leurs lignes ne s'affichent plus ici. */
  ignored: string[];
  /** Dernière ligne lue de chaque salon (ISO), pour les mentions non lues. */
  read: Record<RoomId, string>;
  /** Phrases préparées d'« Écrire dans le salon », dans l'ordre ; absent : celles d'origine (DEFAULT_PHRASES). */
  phrases?: string[];
  lines: RoomLine[];
  /** Lignes retirées par leur auteur, 7 jours (RoomRetraction) ; absent : aucune. */
  retracted?: RoomRetraction[];
  /** Réactions aux lignes, la plus récente de chaque joueur par ligne, 7 jours (RoomReaction) ; absent : aucune. */
  reactions?: RoomReaction[];
}

// ---------------------------------------------------------------------------
// Phrases préparées (13/11/2026) : un réglage de la borne, proposé en badges dans « Écrire dans le
// salon » et au téléphone. Chacune suit les règles d'une ligne (cleanRoomText : une ligne, 300
// caractères au plus) ; {table} y devient la table choisie dans la roue, et une phrase qui le porte
// n'est proposée que si une table est choisie. Celles d'origine sont gardées sous leur texte
// français, clé du catalogue : elles suivent la langue de la borne tant qu'on ne les modifie pas.

/** Nombre de phrases au plus. */
export const PHRASES_MAX = 20;
/** Marque de la table choisie dans la roue, dans le texte d'une phrase. */
export const PHRASE_TABLE = '{table}';
/** Les phrases d'origine, dans leur ordre (clés du catalogue, traduites à l'affichage par rooms-menu.ts). */
export const DEFAULT_PHRASES: readonly string[] = ['Qui veut faire une partie ?', 'Quelqu’un sur {table} ?', 'Bien joué !', 'J’arrive dans 5 minutes', 'Merci !', 'Bonne soirée !']; // i18n-ignore : clés du catalogue

/** Les phrases de la borne : les siennes, sinon celles d'origine. */
export function roomPhrases(s: Pick<RoomsState, 'phrases'>): string[] {
  return [...(s.phrases ?? DEFAULT_PHRASES)];
}

/** Une liste de phrases relue ou changée : chacune nettoyée comme une ligne, sans doublon, 20 au plus ; undefined : pas une liste. */
export function cleanPhrases(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const p of raw) {
    const text = cleanRoomText(p);
    if (text && !out.includes(text) && out.length < PHRASES_MAX) out.push(text);
  }
  return out;
}

/** Le réglage à garder pour `list` : undefined quand ce sont exactement celles d'origine (elles suivent alors la langue). */
export function phrasesSetting(list: readonly string[]): string[] | undefined {
  const clean = cleanPhrases(list) ?? [];
  return clean.length === DEFAULT_PHRASES.length && clean.every((p, i) => p === DEFAULT_PHRASES[i]) ? undefined : clean;
}

/** Le texte d'une phrase pour la table choisie : {table} remplacé ; undefined si la phrase en parle et qu'aucune table n'est choisie. */
export function phraseForTable(text: string, table: string | undefined): string | undefined {
  if (!text.includes(PHRASE_TABLE)) return text;
  return table ? text.split(PHRASE_TABLE).join(table) : undefined;
}

export function newRoomsState(): RoomsState {
  return { version: 1, enabled: true, filter: true, mentionsInGame: true, ignored: [], read: {}, lines: [] };
}

export const roomsFile = (dataDir: string) => path.join(dataDir, 'amis', 'salons.json');

export function loadRooms(dataDir: string, now = new Date()): RoomsState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(roomsFile(dataDir), 'utf8'));
  } catch {
    return newRoomsState();
  }
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const read: Record<RoomId, string> = {};
  if (s.read && typeof s.read === 'object') for (const [room, at] of Object.entries(s.read as Record<string, unknown>)) if (isRoomId(room) && isIso(at)) read[room] = at;
  const phrases = cleanPhrases(s.phrases);
  // Relues sans revérifier leur signature (déjà vérifiée à l'arrivée), mais leur forme oui.
  const lines = (Array.isArray(s.lines) ? s.lines : []).filter((l): l is RoomLine => {
    const r = l as Record<string, unknown>;
    return !!r && typeof r === 'object' && isId(r.id) && isRoomId(r.room) && isPlayerPublicKey(r.key) && typeof r.name === 'string' && typeof r.text === 'string' && isIso(r.at) && typeof r.sig === 'string';
  });
  const retracted = (Array.isArray(s.retracted) ? s.retracted : []).filter((d): d is RoomRetraction => {
    const r = d as Record<string, unknown>;
    return !!r && typeof r === 'object' && isId(r.id) && isRoomId(r.room) && isPlayerPublicKey(r.key) && isIso(r.at) && typeof r.sig === 'string';
  });
  const reactions = (Array.isArray(s.reactions) ? s.reactions : []).filter((d): d is RoomReaction => {
    const r = d as Record<string, unknown>;
    return !!r && typeof r === 'object' && isId(r.id) && isRoomId(r.room) && isPlayerPublicKey(r.key) && typeof r.name === 'string' && (r.kind === null || isReaction(r.kind)) && isIso(r.at) && typeof r.sig === 'string';
  });
  return tidyRooms(
    {
      version: 1,
      enabled: s.enabled !== false,
      filter: s.filter !== false,
      mentionsInGame: s.mentionsInGame !== false,
      ...(s.lineNotices === false ? { lineNotices: false as const } : {}),
      ...(isIso(s.rulesAt) ? { rulesAt: s.rulesAt } : {}),
      ...(isRoomId(s.defaultRoom) ? { defaultRoom: s.defaultRoom } : {}),
      ignored: Array.isArray(s.ignored) ? s.ignored.filter(isPlayerPublicKey).slice(0, 1000) : [],
      read,
      // Fichier abîmé ou écrit à la main : chaque phrase relue comme une ligne, la liste bornée.
      ...(phrases ? { phrases } : {}),
      lines,
      ...(retracted.length ? { retracted } : {}),
      ...(reactions.length ? { reactions } : {}),
    },
    now,
  );
}

export function saveRooms(dataDir: string, state: RoomsState): void {
  writeFileAtomic(roomsFile(dataDir), JSON.stringify(state));
}

/** Ménage : 7 jours de lignes, 300 par salon, 60 salons au plus (les plus récemment actifs) ; 7 jours de retraits et de réactions. */
export function tidyRooms(s: RoomsState, now = new Date()): RoomsState {
  const limit = now.getTime() - ROOM_KEEP_DAYS * DAY;
  if (s.reactions && (s.reactions.length > ROOM_REACTIONS_MAX || s.reactions.some((d) => Date.parse(d.at) < limit))) {
    const reactions = s.reactions.filter((d) => Date.parse(d.at) >= limit).slice(-ROOM_REACTIONS_MAX);
    const { reactions: _, ...rest } = s;
    s = reactions.length ? { ...rest, reactions } : rest;
  }
  if (s.retracted?.some((d) => Date.parse(d.at) < limit)) {
    const retracted = s.retracted.filter((d) => Date.parse(d.at) >= limit);
    const { retracted: _, ...rest } = s;
    s = retracted.length ? { ...rest, retracted } : rest;
  }
  const byRoom = new Map<RoomId, RoomLine[]>();
  for (const l of s.lines) {
    if (Date.parse(l.at) < limit) continue;
    const list = byRoom.get(l.room) ?? [];
    list.push(l);
    byRoom.set(l.room, list);
  }
  const rooms = [...byRoom.entries()]
    .map(([room, list]) => [room, list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-ROOM_LINES_MAX)] as const)
    .sort((a, b) => Date.parse(b[1].at(-1)!.at) - Date.parse(a[1].at(-1)!.at))
    .slice(0, ROOMS_MAX);
  const lines = rooms.flatMap(([, list]) => list);
  return lines.length === s.lines.length && lines.every((l, i) => l === s.lines[i]) ? s : { ...s, lines };
}

/**
 * Pourquoi cette ligne dépasse les limites d'envoi de son auteur, d'après les lignes déjà gardées de
 * ce salon : moins de 3 s après une autre, ou une 21e en 10 minutes ; undefined : elle passe.
 */
export function roomLimit(lines: readonly RoomLine[], line: Pick<RoomLine, 'key' | 'room' | 'at'>): 'gap' | 'burst' | undefined {
  const at = Date.parse(line.at);
  const mine = lines.filter((l) => l.key === line.key && l.room === line.room).map((l) => Date.parse(l.at));
  if (mine.some((t) => Math.abs(t - at) < ROOM_GAP_MS)) return 'gap';
  if (mine.filter((t) => t > at - ROOM_BURST_MS && t <= at).length >= ROOM_BURST) return 'burst';
  return undefined;
}

/**
 * Lignes reçues, déjà vérifiées : les nouvelles (identifiant inconnu) qui respectent les limites de
 * leur auteur sont gardées ; rend celles-là, à relayer. Les miennes passent par le même chemin.
 */
export function mergeRoomLines(s: RoomsState, lines: readonly RoomLine[], now = new Date()): { state: RoomsState; fresh: RoomLine[] } {
  // Une ligne retirée par son auteur ne revient pas, même relayée par une borne qui l'ignore encore.
  const known = new Set([...s.lines.map((l) => l.id), ...(s.retracted ?? []).map((d) => d.id)]);
  const kept = [...s.lines];
  const fresh: RoomLine[] = [];
  for (const l of [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (known.has(l.id) || roomLimit(kept, l)) continue;
    known.add(l.id);
    kept.push(l);
    fresh.push(l);
  }
  if (!fresh.length) return { state: s, fresh };
  return { state: tidyRooms({ ...s, lines: kept }, now), fresh };
}

/**
 * Retraits reçus, déjà vérifiés : chacun efface la ligne de son auteur (jamais celle d'un autre) et
 * est gardé ; rend les nouveaux, à relayer, et les lignes effacées (pour redessiner).
 */
export function retractRoomLines(s: RoomsState, dels: readonly RoomRetraction[], now = new Date()): { state: RoomsState; fresh: RoomRetraction[]; removed: RoomLine[] } {
  const known = new Set((s.retracted ?? []).map((d) => d.id));
  const fresh: RoomRetraction[] = [];
  const removed: RoomLine[] = [];
  let lines = s.lines;
  for (const d of dels) {
    if (known.has(d.id)) continue;
    const line = lines.find((l) => l.id === d.id);
    // La ligne d'un autre joueur sous le même identifiant : le retrait n'y peut rien.
    if (line && (line.key !== d.key || line.room !== d.room)) continue;
    known.add(d.id);
    fresh.push(d);
    if (line) {
      removed.push(line);
      lines = lines.filter((l) => l !== line);
    }
  }
  if (!fresh.length) return { state: s, fresh, removed };
  return { state: tidyRooms({ ...s, lines, retracted: [...(s.retracted ?? []), ...fresh] }, now), fresh, removed };
}

/**
 * Les retraits d'un salon (les 100 derniers), joints à l'historique demandé par une borne qui entre :
 * tous, quelle que soit sa dernière ligne, car elle a pu garder une ligne retirée pendant son absence.
 */
export function roomRetractions(s: RoomsState, room: RoomId): RoomRetraction[] {
  return (s.retracted ?? []).filter((d) => d.room === room).slice(-ROOM_BATCH);
}

/**
 * Réactions reçues, déjà vérifiées : pour chaque joueur et chaque ligne, seule la plus récente reste ;
 * rend les nouvelles (plus récentes que celle gardée), à relayer. Les miennes passent par le même chemin.
 */
export function mergeRoomReactions(s: RoomsState, list: readonly RoomReaction[], now = new Date()): { state: RoomsState; fresh: RoomReaction[] } {
  const slot = (r: Pick<RoomReaction, 'id' | 'key'>) => `${r.id}|${r.key}`;
  const kept = new Map((s.reactions ?? []).map((r) => [slot(r), r]));
  const fresh: RoomReaction[] = [];
  for (const r of [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const had = kept.get(slot(r));
    if (had && Date.parse(had.at) >= Date.parse(r.at)) continue;
    kept.set(slot(r), r);
    fresh.push(r);
  }
  if (!fresh.length) return { state: s, fresh };
  const reactions = [...kept.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { state: tidyRooms({ ...s, reactions }, now), fresh };
}

/** Les réactions d'un salon (les 300 dernières), jointes à l'historique demandé par une borne qui entre. */
export function roomReactions(s: RoomsState, room: RoomId): RoomReaction[] {
  return (s.reactions ?? []).filter((r) => r.room === room).slice(-ROOM_REACTIONS_BATCH);
}

/** Les réactions de chaque ligne (son id), la plus récente de chaque joueur ; les retirées (null) comprises. */
export function reactionsByLine(s: RoomsState): Map<string, RoomReaction[]> {
  const out = new Map<string, RoomReaction[]>();
  for (const r of s.reactions ?? []) out.set(r.id, [...(out.get(r.id) ?? []), r]);
  return out;
}

/** Les lignes d'un salon, de la plus ancienne à la plus récente. */
export function roomLines(s: RoomsState, room: RoomId): RoomLine[] {
  return s.lines.filter((l) => l.room === room).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** L'historique donné à qui entre : les 100 dernières lignes des 24 dernières heures, après `since`. */
export function roomBacklog(s: RoomsState, room: RoomId, since: string | undefined, now = new Date()): RoomLine[] {
  const from = Math.max(now.getTime() - ROOM_BACKLOG_MS, since ? Date.parse(since) : 0);
  return roomLines(s, room)
    .filter((l) => Date.parse(l.at) > from)
    .slice(-ROOM_BACKLOG_MAX);
}

/** Les salons qui ont des lignes, avec leur dernière ligne, du plus récent au plus ancien. */
export function activeRooms(s: RoomsState): { room: RoomId; last: RoomLine; count: number }[] {
  const by = new Map<RoomId, RoomLine[]>();
  for (const l of s.lines) by.set(l.room, [...(by.get(l.room) ?? []), l]);
  return [...by.entries()].map(([room, list]) => ({ room, last: list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)!, count: list.length })).sort((a, b) => Date.parse(b.last.at) - Date.parse(a.last.at));
}

// ---------------------------------------------------------------------------
// Mentions, filtre de mots

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** La ligne cite-t-elle ce pseudo (« @Sillage », sans tenir compte de la casse ni des accents) ? */
export function mentions(text: string, name: string): boolean {
  const t = fold(text);
  const n = fold(name);
  for (let i = t.indexOf('@' + n); i >= 0; i = t.indexOf('@' + n, i + 1)) {
    const after = t[i + 1 + n.length];
    if (after === undefined || !/[\p{L}\p{N}_]/u.test(after)) return true;
  }
  return false;
}

/**
 * Mots masqués par le filtre (français, anglais), comparés sans accent ni casse, mot entier. Liste
 * courte et volontairement prudente : elle cache l'insulte franche, la modération fait le reste.
 */
const MASKED = [
  'con', 'cons', 'conne', 'connes', 'connard', 'connards', 'connasse', 'connasses', 'salope', 'salopes', 'salaud', 'salauds', 'pute', 'putes', 'putain', 'encule', 'encules', 'enculer',
  'batard', 'batards', 'merde', 'merdes', 'bite', 'bites', 'couille', 'couilles', 'nique', 'niquer', 'ntm', 'fdp', 'pd', 'tg', 'ta gueule',
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches', 'asshole', 'assholes', 'cunt', 'dick', 'bastard', 'slut', 'whore', 'stfu',
];
const MASK_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${MASKED.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');

/** Le texte avec les mots grossiers remplacés par des étoiles (autant que de lettres). */
export function maskWords(text: string): string {
  // Repérés sur le texte sans accent (mêmes longueurs : une lettre accentuée devient une lettre), remplacés dans l'original.
  const folded = text.normalize('NFC').split('').map((c) => fold(c) || c).join('');
  if (folded.length !== text.length) return text;
  let out = text;
  for (const m of folded.matchAll(MASK_RE)) {
    const start = m.index! + m[1]!.length;
    const word = m[2]!;
    out = out.slice(0, start) + word.replace(/\S/g, '*') + out.slice(start + word.length);
  }
  return out;
}

/** Pourquoi je ne peux pas écrire maintenant dans ce salon ; undefined : je peux. */
export function cannotWrite(s: RoomsState, me: string, room: RoomId, now = new Date()): 'disabled' | 'rules' | 'gap' | 'burst' | undefined {
  if (!s.enabled) return 'disabled';
  if (!s.rulesAt) return 'rules';
  return roomLimit(s.lines, { key: me, room, at: now.toISOString() });
}
