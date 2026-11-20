// Répondre en citant, mentionner un membre (messagerie entre amis et groupes, demande du 20/11/2026).
// Ici, rien du réseau ni de l'écran : l'extrait cité, l'extension signée qui porte la citation et les
// mentions, la résolution des mentions parmi les membres d'un groupe et leur repérage dans un texte.
//
// Pourquoi une extension signée à part : chaque message est signé sur une forme figée (chat.ts,
// groups.ts). Une borne d'avant reconstruit la ligne avec les seuls champs qu'elle connaît ; si la
// citation entrait dans cette signature, elle rejetterait tout le message. Le message garde donc sa
// signature d'origine, et porte en plus `x` (l'extension) et `xs` (la signature de son auteur sur
// l'extension, liée à l'identifiant du message et à sa conversation). Une borne d'avant ignore `x` et
// affiche le texte ; une borne à jour vérifie `xs` et, s'il est faux ou absent, laisse tomber
// l'extension sans jamais perdre le message.

import { signText, verifyText, isPlayerPublicKey, type PlayerKey } from './sharing';
import { normalizeName } from './social';
import { mentions as textMentions } from './rooms';

/** Extrait d'une citation : ses deux premières lignes, QUOTE_MAX caractères au plus (un émoji compte pour un). */
export const QUOTE_LINES = 2;
export const QUOTE_MAX = 140;
/** Membres mentionnés au plus dans un message (la taille d'un groupe). */
export const MENTIONS_MAX = 20;
/** Un extrait coupé ne recule pas au-delà de ce nombre de caractères pour finir sur un mot entier. */
const WORD_BACK = 24;

/** Le message auquel on répond : son identifiant, son auteur (clé, pseudo au moment de la réponse), son extrait. */
export interface QuoteRef {
  id: string;
  by: string;
  name: string;
  text: string;
}

/** Ce que l'extension ajoute à un message : la citation, et (groupes) les clés des membres mentionnés. */
export interface MessageExtras {
  reply?: QuoteRef;
  mentions?: string[];
}

/** La conversation d'un message, pour lier la signature de l'extension : un fil entre deux amis, ou un groupe. */
export type ExtrasScope = { kind: 'chat'; from: string; to: string } | { kind: 'group'; g: string; by: string };

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const chars = (s: string) => [...s];

/**
 * L'extrait cité d'un message : ses deux premières lignes non vides, espaces resserrés, QUOTE_MAX
 * caractères au plus. Coupé, il finit sur un mot entier quand c'est possible, puis « … » ; s'il restait
 * des lignes, « … » aussi. Idempotent : l'extrait d'un extrait est lui-même (vérifié à l'arrivée).
 */
export function quoteExcerpt(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  let out = lines.slice(0, QUOTE_LINES).join('\n');
  let cut = lines.length > QUOTE_LINES;
  if (chars(out).length > QUOTE_MAX) {
    const all = chars(out);
    let end = QUOTE_MAX - 1;
    // Finir sur un mot entier si un espace est assez proche ; sinon couper net.
    for (let i = end; i > QUOTE_MAX - 1 - WORD_BACK; i--) {
      if (all[i] === ' ' || all[i] === '\n') {
        end = i;
        break;
      }
    }
    out = all.slice(0, end).join('').trimEnd();
    cut = true;
  }
  // Sans ponctuation qui pend avant les points de suspension (« fin, … »), et jamais deux fois « … ».
  if (cut) out = `${out.replace(/[\s,;:…]+$/u, '')}…`;
  return out;
}

/** Citation reçue ou gardée : forme stricte (sinon la signature ne vaudrait pas), undefined sinon. */
function parseQuote(raw: unknown): QuoteRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isId(r.id) || !isPlayerPublicKey(r.by) || !name || name !== r.name || typeof r.text !== 'string') return undefined;
  if (!r.text || quoteExcerpt(r.text) !== r.text) return undefined;
  return { id: r.id, by: r.by, name, text: r.text };
}

/** Extension reçue ou gardée, contrôlée ; undefined si elle est vide ou mal formée. */
export function parseExtras(raw: unknown): MessageExtras | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const reply = r.reply === undefined ? undefined : parseQuote(r.reply);
  if (r.reply !== undefined && !reply) return undefined;
  let mentions: string[] | undefined;
  if (r.mentions !== undefined) {
    if (!Array.isArray(r.mentions) || !r.mentions.length || r.mentions.length > MENTIONS_MAX || !r.mentions.every(isPlayerPublicKey)) return undefined;
    if (new Set(r.mentions).size !== r.mentions.length) return undefined;
    mentions = [...r.mentions] as string[];
  }
  if (!reply && !mentions) return undefined;
  return { ...(reply ? { reply } : {}), ...(mentions ? { mentions } : {}) };
}

/** Le texte signé de l'extension : la conversation, l'identifiant du message, l'extension. */
function extrasText(scope: ExtrasScope, id: string, x: MessageExtras): string {
  const where = scope.kind === 'chat' ? { from: scope.from, to: scope.to } : { g: scope.g, by: scope.by };
  return JSON.stringify({ app: 'cyberpinball', kind: `${scope.kind}-x`, ...where, id, x: { reply: x.reply ?? null, mentions: x.mentions ?? null } });
}

/** Signer l'extension d'un de mes messages. */
export function signExtras(scope: ExtrasScope, id: string, x: MessageExtras, key: PlayerKey): string {
  return signText(extrasText(scope, id, x), key);
}

/**
 * L'extension d'un message reçu, vérifiée par la clé de son auteur ; undefined si elle manque, est mal
 * formée ou mal signée (le message, lui, reste valable).
 */
export function verifyExtras(scope: ExtrasScope, id: string, raw: unknown, sig: unknown): MessageExtras | undefined {
  if (raw === undefined || typeof sig !== 'string' || sig.length > 200) return undefined;
  const x = parseExtras(raw);
  if (!x) return undefined;
  const author = scope.kind === 'chat' ? scope.from : scope.by;
  return verifyText(extrasText(scope, id, x), sig, author) ? x : undefined;
}

/** La citation d'un message, prête à partir : l'extrait de son texte, son auteur. */
export function quoteOf(original: { id: string; by: string; name: string; text: string }): QuoteRef | undefined {
  const text = quoteExcerpt(original.text);
  const name = normalizeName(original.name);
  if (!text || !name || !isId(original.id) || !isPlayerPublicKey(original.by)) return undefined;
  return { id: original.id, by: original.by, name, text };
}

// ---------------------------------------------------------------------------
// Mentions (groupes)

/**
 * Les membres que mon message mentionne : ceux dont le texte dit « @pseudo », qu'il ait été posé par la
 * liste des membres (« Mentionner un membre… ») ou tapé au clavier ou au téléphone. Toujours tirés des
 * membres : une clé qui n'est pas membre n'y entre jamais ; jamais moi ; chacun une fois ; MENTIONS_MAX
 * au plus. Un pseudo choisi puis effacé avant l'envoi ne compte plus.
 */
export function resolveMentions(text: string, members: readonly { key: string; name: string }[], me: string): string[] {
  const out: string[] = [];
  for (const m of members) {
    if (m.key === me || out.includes(m.key)) continue;
    if (textMentions(text, m.name)) out.push(m.key);
  }
  return out.slice(0, MENTIONS_MAX);
}

/** Les mentions d'un message reçu qui valent : des membres du groupe, jamais l'auteur lui-même. */
export function validMentions(x: MessageExtras | undefined, author: string, members: readonly { key: string }[]): string[] {
  if (!x?.mentions) return [];
  const keys = new Set(members.map((m) => m.key));
  return [...new Set(x.mentions)].filter((k) => k !== author && keys.has(k));
}

/** Morceau d'un texte à dessiner : du texte, ou une mention (`me` : c'est moi qu'on cite). */
export interface TextPiece {
  text: string;
  mention?: 'me' | 'other';
}

// Les accents (signes combinants) retirés : la même règle que mentions() des salons.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Le texte découpé en morceaux pour mettre les mentions en évidence : chaque « @pseudo » d'un des
 * `names` (sans tenir compte de la casse ni des accents, mot entier, le plus long d'abord). Sans
 * mention, un seul morceau.
 */
export function mentionPieces(text: string, names: readonly { name: string; me?: boolean }[]): TextPiece[] {
  const source = text.normalize('NFC');
  // Repérées sur le texte sans accent, caractère par caractère (même longueur), coupées dans l'original.
  const folded = source
    .split('')
    .map((c) => fold(c) || c)
    .join('');
  if (folded.length !== source.length || !names.length) return [{ text: source }];
  const sorted = [...names].filter((n) => n.name).sort((a, b) => b.name.length - a.name.length);
  const pieces: TextPiece[] = [];
  let plain = 0;
  let i = 0;
  while (i < folded.length) {
    const at = folded.indexOf('@', i);
    if (at < 0) break;
    const hit = sorted.find((n) => {
      const f = fold(n.name);
      if (!folded.startsWith(f, at + 1)) return false;
      const after = folded[at + 1 + f.length];
      return after === undefined || !/[\p{L}\p{N}_]/u.test(after);
    });
    if (!hit) {
      i = at + 1;
      continue;
    }
    const end = at + 1 + fold(hit.name).length;
    if (at > plain) pieces.push({ text: source.slice(plain, at) });
    pieces.push({ text: source.slice(at, end), mention: hit.me ? 'me' : 'other' });
    plain = i = end;
  }
  if (plain < source.length) pieces.push({ text: source.slice(plain) });
  return pieces.length ? pieces : [{ text: source }];
}

// ---------------------------------------------------------------------------
// Affichage d'une citation

/** Ce que montre la citation : l'auteur et l'extrait ; `missing` dit que l'original n'est plus là. */
export interface QuoteView {
  name: string;
  text: string;
  /** Supprimé par son auteur, ou plus chargé (trop ancien, effacé de cette borne). */
  missing?: 'deleted' | 'gone';
}

/**
 * La citation telle qu'elle s'affiche. L'original encore chargé fait foi (une citation fausse ne se
 * voit pas) ; sinon l'extrait gardé dans la réponse, avec la raison de l'absence.
 */
export function quoteView(reply: QuoteRef, original: { name: string; text: string } | undefined, deleted: boolean): QuoteView {
  if (original) return { name: original.name, text: quoteExcerpt(original.text) || reply.text };
  return { name: reply.name, text: reply.text, missing: deleted ? 'deleted' : 'gone' };
}
