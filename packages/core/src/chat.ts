// Messagerie entre amis (rubrique Amis) : les décisions sur des données, sans réseau ni écran.
// Le transport est app/src/chat-service.ts (messages des services d'amis sur le canal social),
// les écrans app/src/chat-menu.ts.
//
// Choix retenus :
// - conversations à deux, entre amis seulement ; texte (CHAT_TEXT_MAX caractères) ou réaction
//   (six réactions maison) posée sur un message ;
// - un message pour un ami hors ligne attend sur la borne et part dès que les deux bornes sont
//   reliées (renvoyé tant que l'accusé « chat-ok » n'est pas revenu), CHAT_PENDING_DAYS au plus ;
// - « Reçu » quand la borne de l'ami l'a enregistré ; pas de « Lu » ;
// - gardés sur cette borne seulement, 365 jours par défaut (30 jours, 1 an ou toujours) ;
// - chaque message est signé par la clé de son auteur et vérifié à l'arrivée.
//
// Fichier : <données>\amis\messagerie.json (réglages et conversations).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeFileAtomic } from './atomicwrite';
import { signText, verifyText, type PlayerKey } from './sharing';
import { t } from './i18n';

/** Longueur d'un message, en caractères (émojis compris : un émoji compte pour un). */
export const CHAT_TEXT_MAX = 500;
/** Un message qui n'a pas pu partir est abandonné après ce délai : « Non remis ». */
export const CHAT_PENDING_DAYS = 30;
/** Lignes gardées au plus par conversation (les plus anciennes partent d'abord). */
export const CHAT_LINES_MAX = 2000;
/** Lignes envoyées au plus dans un même message du réseau. */
export const CHAT_BATCH = 50;
/** Durées de conservation proposées, en jours ; 0 : toujours. */
export const CHAT_KEEP_CHOICES = [30, 365, 0] as const;
export type ChatKeep = (typeof CHAT_KEEP_CHOICES)[number];

/** Réactions maison : pictogramme du design system et mot (l'étoile est aussi le « J'aime » du profil public). */
export const CHAT_REACTIONS = ['bravo', 'revanche', 'tilt', 'waouh', 'ok', 'like'] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];
export const CHAT_REACTION_ICONS: Readonly<Record<ChatReaction, string>> = { bravo: 'trophy', revanche: 'flipper', tilt: 'tilt', waouh: 'sparkle', ok: 'check', like: 'star' };
export function reactionLabel(r: ChatReaction): string {
  switch (r) {
    case 'bravo':
      return t('Bravo');
    case 'revanche':
      return t('Revanche ?');
    case 'tilt':
      return t('TILT !');
    case 'waouh':
      return t('Waouh');
    case 'ok':
      return t('OK');
    case 'like':
      return t('J’aime');
  }
}

/** Phrases rapides, envoyées d'un appui. */
export function chatPhrases(): string[] {
  return [t('Bien joué !'), t('On fait une partie ?'), t('J’arrive dans 5 minutes'), t('Je finis ma bille et j’arrive'), t('Merci !'), t('Bonne nuit !')];
}

/** État d'un message envoyé : en attente de sa connexion, reçu par sa borne, ou abandonné. */
export type ChatDelivery = 'pending' | 'received' | 'expired';

export interface ChatLine {
  /** Identifiant tiré au hasard par l'auteur : 16 caractères hexadécimaux. */
  id: string;
  /** Date d'écriture (horloge de l'auteur). */
  at: string;
  /** Écrit par moi. */
  out: boolean;
  text?: string;
  /** Réaction posée sur un message (son id) ; `kind` null : réaction retirée. */
  react?: { target: string; kind: ChatReaction | null };
  /** Pour un message à moi : où il en est. */
  delivery?: ChatDelivery;
  /** Signature de l'auteur, gardée telle quelle pour pouvoir renvoyer le message. */
  sig?: string;
}

export interface Conversation {
  lines: ChatLine[];
  /** Messages reçus pas encore vus dans le fil. */
  unread: number;
  /** Ses messages arrivent sans carte ni son. */
  muted?: boolean;
  /**
   * Ce que sa borne a dit de sa messagerie (« chat-hi ») : true, elle l'a et l'accepte ; false, elle
   * l'a coupée ; absent : pas encore entendu (borne d'avant la messagerie, ou jamais reliées depuis).
   */
  accepts?: boolean;
}

export interface ChatState {
  version: 1;
  enabled: boolean;
  /** Durée de conservation, en jours ; 0 : toujours. */
  keep: ChatKeep;
  /** Répondre depuis le téléphone appairé pendant une partie. */
  phoneInGame: boolean;
  /** Le tic discret des messages, au menu et en partie. */
  sound: boolean;
  conversations: Record<string, Conversation>;
}

export function newChatState(): ChatState {
  return { version: 1, enabled: true, keep: 365, phoneInGame: true, sound: true, conversations: {} };
}

export const chatFile = (dataDir: string) => path.join(dataDir, 'amis', 'messagerie.json');

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isKey = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const isChatId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isReaction = (v: unknown): v is ChatReaction => typeof v === 'string' && (CHAT_REACTIONS as readonly string[]).includes(v);

/** Texte accepté : sans caractère de contrôle (sauf le retour à la ligne), bords nettoyés, borné. */
export function cleanChatText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || [...text].length > CHAT_TEXT_MAX) return undefined;
  return text;
}

function parseLine(raw: unknown): ChatLine | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isChatId(r.id) || !isIso(r.at) || typeof r.out !== 'boolean') return undefined;
  const text = r.text === undefined ? undefined : cleanChatText(r.text);
  const re = r.react as Record<string, unknown> | undefined;
  const react = re && typeof re === 'object' && isChatId(re.target) && (re.kind === null || isReaction(re.kind)) ? { target: re.target, kind: re.kind as ChatReaction | null } : undefined;
  if (!text === !react) return undefined;
  const delivery = r.delivery === 'pending' || r.delivery === 'received' || r.delivery === 'expired' ? r.delivery : undefined;
  const sig = typeof r.sig === 'string' && r.sig.length <= 200 ? r.sig : undefined;
  return { id: r.id, at: r.at, out: r.out, ...(text ? { text } : {}), ...(react ? { react } : {}), ...(r.out && delivery ? { delivery } : {}), ...(sig ? { sig } : {}) };
}

export function loadChat(dataDir: string): ChatState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(chatFile(dataDir), 'utf8'));
  } catch {
    return newChatState();
  }
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = newChatState();
  const conversations: Record<string, Conversation> = {};
  const convs = s.conversations && typeof s.conversations === 'object' ? (s.conversations as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(convs)) {
    if (!isKey(key) || !value || typeof value !== 'object') continue;
    const c = value as Record<string, unknown>;
    const lines = (Array.isArray(c.lines) ? c.lines : []).map(parseLine).filter((l): l is ChatLine => !!l).slice(-CHAT_LINES_MAX);
    const unread = typeof c.unread === 'number' && Number.isInteger(c.unread) && c.unread >= 0 ? Math.min(c.unread, lines.length) : 0;
    conversations[key] = { lines, unread, ...(c.muted === true ? { muted: true } : {}), ...(typeof c.accepts === 'boolean' ? { accepts: c.accepts } : {}) };
  }
  return {
    version: 1,
    enabled: s.enabled !== false,
    keep: (CHAT_KEEP_CHOICES as readonly unknown[]).includes(s.keep) ? (s.keep as ChatKeep) : base.keep,
    phoneInGame: s.phoneInGame !== false,
    sound: s.sound !== false,
    conversations,
  };
}

export function saveChat(dataDir: string, state: ChatState): void {
  writeFileAtomic(chatFile(dataDir), JSON.stringify(state, null, 1));
}

// ---------------------------------------------------------------------------
// Signature : l'auteur, le destinataire, l'identifiant, la date et le contenu.

function lineText(from: string, to: string, line: Pick<ChatLine, 'id' | 'at' | 'text' | 'react'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'chat', from, to, id: line.id, at: line.at, text: line.text ?? null, react: line.react ?? null });
}

/** Ce qui voyage : la ligne sans ce qui ne regarde que l'auteur (sens, état). */
export interface ChatWire {
  id: string;
  at: string;
  text?: string;
  react?: { target: string; kind: ChatReaction | null };
  sig: string;
}

/** Messages de la messagerie entre deux bornes amies. */
export type ChatMessage =
  | { t: 'chat'; m: ChatWire[] }
  /** Accusé de réception : ces messages sont enregistrés. */
  | { t: 'chat-ok'; ids: string[] }
  /** Ma borne a la messagerie ; `on` : elle accepte les messages. */
  | { t: 'chat-hi'; on: boolean };

export function parseChatMessage(m: Record<string, unknown>): ChatMessage | undefined {
  switch (m.t) {
    case 'chat': {
      if (!Array.isArray(m.m)) return undefined;
      const lines: ChatWire[] = [];
      for (const raw of m.m.slice(0, CHAT_BATCH)) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (!isChatId(r.id) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) continue;
        const text = r.text === undefined ? undefined : cleanChatText(r.text);
        if (r.text !== undefined && text !== r.text) continue; // déjà nettoyé par l'auteur : sinon, la signature ne vaudrait pas
        const re = r.react as Record<string, unknown> | undefined;
        const react = re && typeof re === 'object' && isChatId(re.target) && (re.kind === null || isReaction(re.kind)) ? { target: re.target, kind: re.kind as ChatReaction | null } : undefined;
        if (!text === !react) continue;
        lines.push({ id: r.id, at: r.at, ...(text ? { text } : {}), ...(react ? { react } : {}), sig: r.sig });
      }
      return lines.length ? { t: 'chat', m: lines } : undefined;
    }
    case 'chat-ok':
      return Array.isArray(m.ids) ? { t: 'chat-ok', ids: m.ids.slice(0, CHAT_BATCH).filter(isChatId) } : undefined;
    case 'chat-hi':
      return typeof m.on === 'boolean' ? { t: 'chat-hi', on: m.on } : undefined;
    default:
      return undefined;
  }
}

/** La ligne prête à partir vers `to`. */
export function toWire(line: ChatLine): ChatWire {
  return { id: line.id, at: line.at, ...(line.text ? { text: line.text } : {}), ...(line.react ? { react: line.react } : {}), sig: line.sig ?? '' };
}

/** Une ligne reçue de `from` (vérifiée par la clé de la connexion) ; undefined : signature fausse. */
export function verifyWire(wire: ChatWire, from: string, me: string, now = new Date()): ChatLine | undefined {
  if (!verifyText(lineText(from, me, wire), wire.sig, from)) return undefined;
  // Une date dans le futur passerait devant tout le fil : ramenée à maintenant.
  const at = Date.parse(wire.at) > now.getTime() + 10 * 60_000 ? now.toISOString() : wire.at;
  return { id: wire.id, at, out: false, ...(wire.text ? { text: wire.text } : {}), ...(wire.react ? { react: wire.react } : {}), sig: wire.sig };
}

// ---------------------------------------------------------------------------
// Changements d'état (purs : chacun rend un nouvel état, ou le même s'il n'y a rien à faire)

const conv = (s: ChatState, key: string): Conversation => s.conversations[key] ?? { lines: [], unread: 0 };
const withConv = (s: ChatState, key: string, c: Conversation): ChatState => ({ ...s, conversations: { ...s.conversations, [key]: c } });
const newId = () => randomBytes(8).toString('hex');

/** J'écris à `to` : la ligne signée, en attente jusqu'à l'accusé de sa borne. */
export function writeLine(s: ChatState, me: PlayerKey, to: string, content: { text: string } | { react: { target: string; kind: ChatReaction | null } }, now = new Date()): { state: ChatState; line?: ChatLine } {
  const text = 'text' in content ? cleanChatText(content.text) : undefined;
  if ('text' in content && !text) return { state: s };
  const base = { id: newId(), at: now.toISOString(), ...(text ? { text } : {}), ...('react' in content ? { react: content.react } : {}) };
  const line: ChatLine = { ...base, out: true, delivery: 'pending', sig: signText(lineText(me.publicKey, to, base), me) };
  const c = conv(s, to);
  return { state: withConv(s, to, { ...c, lines: [...c.lines, line].slice(-CHAT_LINES_MAX) }), line };
}

/**
 * Lignes reçues de `from`, déjà vérifiées : gardées si elles sont nouvelles ; rend aussi les
 * identifiants à accuser (toutes, même déjà connues : l'accusé précédent a pu se perdre) et le
 * nombre de messages nouveaux à annoncer (les réactions ne comptent pas comme non lues).
 */
export function receiveLines(s: ChatState, from: string, lines: readonly ChatLine[]): { state: ChatState; ack: string[]; fresh: ChatLine[] } {
  const c = conv(s, from);
  const known = new Set(c.lines.map((l) => l.id));
  const fresh = lines.filter((l) => !known.has(l.id) && (known.add(l.id), true));
  const ack = lines.map((l) => l.id);
  if (!fresh.length) return { state: s, ack, fresh };
  const all = [...c.lines, ...fresh].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-CHAT_LINES_MAX);
  const unread = c.unread + fresh.filter((l) => l.text).length;
  return { state: withConv(s, from, { ...c, lines: all, unread }), ack, fresh };
}

/** Accusé de la borne de `from` : ces messages à moi sont reçus. */
export function acknowledge(s: ChatState, from: string, ids: readonly string[]): ChatState {
  const c = s.conversations[from];
  if (!c) return s;
  const set = new Set(ids);
  let changed = false;
  const lines = c.lines.map((l) => {
    if (!l.out || !set.has(l.id) || l.delivery === 'received') return l;
    changed = true;
    return { ...l, delivery: 'received' as const };
  });
  return changed ? withConv(s, from, { ...c, lines }) : s;
}

/** Ce que sa borne dit de sa messagerie. */
export function setAccepts(s: ChatState, key: string, on: boolean): ChatState {
  const c = conv(s, key);
  return c.accepts === on ? s : withConv(s, key, { ...c, accepts: on });
}

export function markRead(s: ChatState, key: string): ChatState {
  const c = s.conversations[key];
  return c && c.unread ? withConv(s, key, { ...c, unread: 0 }) : s;
}

export function setMuted(s: ChatState, key: string, muted: boolean): ChatState {
  const c = conv(s, key);
  if (!!c.muted === muted) return s;
  const { muted: _, ...rest } = c;
  return withConv(s, key, muted ? { ...rest, muted: true } : rest);
}

/** Effacer une conversation, sur cette borne seulement. Ce qui attend encore de partir part aussi. */
export function clearConversation(s: ChatState, key: string): ChatState {
  if (!s.conversations[key]) return s;
  const { [key]: _, ...rest } = s.conversations;
  return { ...s, conversations: rest };
}

export function clearAll(s: ChatState): ChatState {
  return Object.keys(s.conversations).length ? { ...s, conversations: {} } : s;
}

/** Messages à moi qui attendent encore de partir vers `key`. */
export function pendingFor(s: ChatState, key: string): ChatLine[] {
  return (s.conversations[key]?.lines ?? []).filter((l) => l.out && l.delivery === 'pending');
}

/**
 * Ménage : un message qui attend depuis CHAT_PENDING_DAYS est abandonné (« Non remis ») ; les
 * lignes plus vieilles que la durée de conservation partent (jamais celles qui attendent encore).
 */
export function tidyChat(s: ChatState, now = new Date()): ChatState {
  const pendingLimit = now.getTime() - CHAT_PENDING_DAYS * 86_400_000;
  const keepLimit = s.keep ? now.getTime() - s.keep * 86_400_000 : -Infinity;
  let changed = false;
  const conversations: Record<string, Conversation> = {};
  for (const [key, c] of Object.entries(s.conversations)) {
    const lines = c.lines
      .map((l) => (l.out && l.delivery === 'pending' && Date.parse(l.at) < pendingLimit ? ((changed = true), { ...l, delivery: 'expired' as const }) : l))
      .filter((l) => l.delivery === 'pending' || Date.parse(l.at) >= keepLimit || ((changed = true), false));
    conversations[key] = lines.length === c.lines.length && lines.every((l, i) => l === c.lines[i]) ? c : { ...c, lines, unread: Math.min(c.unread, lines.length) };
  }
  return changed ? { ...s, conversations } : s;
}

// ---------------------------------------------------------------------------
// Lecture pour les écrans

/** Les réactions sur chaque message : la dernière de chaque auteur vaut, retirée si elle dit null. */
export function reactionsOf(c: Conversation): Map<string, { mine?: ChatReaction; theirs?: ChatReaction }> {
  const out = new Map<string, { mine?: ChatReaction; theirs?: ChatReaction }>();
  for (const l of c.lines) {
    if (!l.react) continue;
    const r = out.get(l.react.target) ?? {};
    if (l.out) r.mine = l.react.kind ?? undefined;
    else r.theirs = l.react.kind ?? undefined;
    out.set(l.react.target, r);
  }
  return out;
}

/** Les messages du fil (les réactions sont portées par le message qu'elles visent). */
export function threadLines(c: Conversation): ChatLine[] {
  return c.lines.filter((l) => l.text);
}

export function unreadTotal(s: ChatState): number {
  return Object.values(s.conversations).reduce((n, c) => n + c.unread, 0);
}

export function lastLine(c: Conversation): ChatLine | undefined {
  return threadLines(c).at(-1);
}
