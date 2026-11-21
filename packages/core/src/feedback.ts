// Retours des joueurs (« Retours et propositions », app/src/feedback-menu.ts) : le cœur, sans réseau ni
// Electron. Deux circuits vers le service du projet (packages/service-telephone/worker.mjs, base D1) :
// - public : le tableau des propositions (bug, amélioration, nouvelle fonction), publié tout de suite,
//   où chaque borne vote une fois par proposition ; les requêtes sont signées par la clé du joueur
//   (sharing.ts, PlayerKey), qui ne sert qu'à compter une voix par borne et n'est jamais rendue ; le
//   pseudo et le pays du joueur les accompagnent (`who`, 18/11/2026) : l'auteur est nommé sur le
//   tableau, et ceux qui soutiennent une proposition sur sa fiche ;
// - privé : les rapports (plantage, problème décrit, fiche technique jointe), scellés ici pour la clé
//   « retours » du projet (X25519 + AES-256-GCM) : le service garde des octets qu'il ne peut pas lire.
//
// Le protocole est fixé des deux côtés : ce fichier pour la borne, worker.mjs pour le service ;
// retours-service.test.ts et feedback.test.ts les tiennent ensemble. Rapports automatiques de
// plantage : la question est posée au premier plantage, la réponse retenue
// dans <données>\retours.json ; un même plantage ne part qu'une fois par jour.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isLanguage, LANGUAGES, t, type Language } from './i18n';
import type { IconName } from './icons';
import type { Reaction } from './reactions';
import { signText, type PlayerKey } from './sharing';
import { normalizeName } from './social';

/** Texte signé d'une requête d'une borne : ce préfixe, puis le corps JSON. Le même que RETOURS_PREFIX (worker.mjs). */
export const FEEDBACK_PREFIX = 'cyberpinball:retours:v1\n';
/** Requêtes de gestion (l'équipe) : ce préfixe, la méthode, le chemin, la date, l'empreinte du corps. */
export const FEEDBACK_ADMIN_PREFIX = 'cyberpinball:retours-admin:v1\n';
/**
 * Clés publiques « retours » du projet : `sign` vérifie les requêtes de gestion (Ed25519), `seal`
 * reçoit les rapports (X25519). Les privées sont hors du dépôt, chez l'équipe
 * (~/.cyberpinball/retours-cle.json).
 */
export const FEEDBACK_KEYS = {
  sign: '9039d503e01125f2db79014217d9c044b354b2be1741ff8eb69383ee5af2d1e1',
  seal: '913d012d8e7a468fee4aa7778fcc45e601546e5421a762e7e05a4c3d41910130',
} as const;

export const PROPOSAL_KINDS = ['bug', 'improvement', 'feature'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const PROPOSAL_STATUSES = ['new', 'review', 'planned', 'progress', 'done', 'declined'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_TITLE_MIN = 4;
export const PROPOSAL_TITLE_MAX = 90;
export const PROPOSAL_TEXT_MAX = 2000;
/** Taille d'un rapport scellé accepté par le service. */
export const REPORT_SEALED_MAX = 1_900_000;
/** En-tête d'un rapport scellé. */
export const REPORT_MAGIC = 'CPR1';

/** Un joueur nommé par le service : son pseudo et son pays (code ISO à deux lettres), jamais sa clé. */
export interface FeedbackPerson {
  name: string;
  country?: string;
}

/** Ceux qui soutiennent une proposition, l'auteur à part : les nommés, et le nombre des autres (votes sans pseudo). */
export interface ProposalSupporters {
  people: FeedbackPerson[];
  others: number;
}

/**
 * Une version traduite par le service (Workers AI) : le titre et la description pour une langue autre
 * que celle de l'auteur, la réponse pour une langue autre que celle de l'équipe.
 */
export interface ProposalTranslation {
  title?: string;
  text?: string;
  reply?: string;
}

/** Une proposition telle que le service la rend. */
export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  text: string;
  lang: string;
  votes: number;
  status: ProposalStatus;
  at: number;
  updated: number;
  /** Réponse publique de l'équipe. */
  reply?: string;
  /** Langue de la réponse, quand ce n'est pas celle de la proposition. */
  replyLang?: Language;
  /** Versions traduites par le service, par langue de l'interface (absentes tant qu'il ne les a pas faites). */
  translations?: Partial<Record<Language, ProposalTranslation>>;
  /** Propositions fusionnées dans celle-ci (doublons). */
  merged: number;
  /** Son auteur, s'il a signé son pseudo (propositions d'avant le 18/11/2026 : aucun). */
  author?: FeedbackPerson;
  mine?: boolean;
  voted?: boolean;
}

export const PROPOSAL_KIND_VIEW: Record<ProposalKind, { icon: IconName; readonly label: string; readonly lead: string }> = {
  bug: { icon: 'alert', get label() { return t('Problème'); }, get lead() { return t('Quelque chose ne marche pas comme prévu'); } },
  improvement: { icon: 'sliders', get label() { return t('Amélioration'); }, get lead() { return t('Une fonction qui existe, en mieux'); } },
  feature: { icon: 'star', get label() { return t('Nouvelle fonction'); }, get lead() { return t('Quelque chose que Cyber Pinball ne fait pas encore'); } },
};

/**
 * L'aspect d'un état, pour que chacun se reconnaisse d'un coup d'œil (19/11/2026 : tous écrits pareil,
 * on ne les distinguait pas) : sa propre icône, sa couleur, et un contour tant que l'équipe ne s'est pas
 * engagée, un fond plein dès qu'elle l'est (prévue, en développement, faite) ; « Pas retenue » en
 * pointillés éteints. Deux états n'ont jamais le même aspect (feedback-etats.test.ts).
 */
export interface ProposalStatusView {
  readonly label: string;
  /** Ce que l'état veut dire pour le joueur, sur la fiche de la proposition. */
  readonly meaning: string;
  icon: IconName;
  tone: 'neutral' | 'info' | 'warning' | 'ok' | 'quiet';
  fill: 'outline' | 'solid' | 'dashed';
}

export const PROPOSAL_STATUS_VIEW: Record<ProposalStatus, ProposalStatusView> = {
  new: { get label() { return t('Nouvelle'); }, get meaning() { return t('Pas encore examinée par l’équipe'); }, icon: 'sparkle', tone: 'neutral', fill: 'outline' },
  review: { get label() { return t('À l’étude'); }, get meaning() { return t('L’équipe l’examine'); }, icon: 'eye', tone: 'info', fill: 'outline' },
  planned: { get label() { return t('Prévue'); }, get meaning() { return t('Retenue : elle arrivera dans une prochaine version'); }, icon: 'calendar', tone: 'info', fill: 'solid' },
  progress: { get label() { return t('En développement'); }, get meaning() { return t('L’équipe y travaille en ce moment'); }, icon: 'gear', tone: 'warning', fill: 'solid' },
  done: { get label() { return t('Faite'); }, get meaning() { return t('Disponible dans Cyber Pinball'); }, icon: 'check', tone: 'ok', fill: 'solid' },
  declined: { get label() { return t('Pas retenue'); }, get meaning() { return t('L’équipe ne prévoit pas de la faire'); }, icon: 'close', tone: 'quiet', fill: 'dashed' },
};

// ---------------------------------------------------------------------------
// Textes

/** Titre nettoyé (espaces réduits, aucun caractère de contrôle), ou undefined s'il n'a pas la bonne longueur. */
export function cleanProposalTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= PROPOSAL_TITLE_MIN && s.length <= PROPOSAL_TITLE_MAX ? s : undefined;
}

/** Description nettoyée : retours à la ligne gardés (trois au plus d'affilée), autres contrôles retirés. */
export function cleanProposalText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length <= PROPOSAL_TEXT_MAX ? s : undefined;
}

// ---------------------------------------------------------------------------
// Requêtes signées

export interface SignedBody {
  b: string;
  s: string;
}

export type FeedbackOp =
  | { op: 'propose'; kind: ProposalKind; title: string; text: string; lang: string; who?: FeedbackPerson }
  /** `who` : seulement quand on vote (on = true) ; le service l'ignore pour un vote retiré. */
  | { op: 'vote'; id: string; on: boolean; who?: FeedbackPerson }
  /** Ma réaction à une nouveauté du front-end (news.ts) ; null la retire. */
  | { op: 'news-react'; item: string; kind: Reaction | null }
  /** Compte supprimé (forget.ts, RGPD) : le service efface ses propositions, ses votes et ses réactions. */
  | { op: 'forget' }
  /** Mon pseudo, pour nommer mes propositions et mes votes passés (une fois par jour, si j'en ai). */
  | { op: 'name'; who: FeedbackPerson };

/** Corps signé d'une requête de la borne (POST /api/propositions, /api/votes). */
export function signFeedback(key: PlayerKey, op: FeedbackOp, now = Date.now()): SignedBody {
  const b = JSON.stringify({ v: 1, ...op, pk: key.publicKey, t: now });
  return { b, s: signText(FEEDBACK_PREFIX + b, key) };
}

/** En-têtes d'une requête de gestion, signée par la clé « retours » (privée, PEM PKCS #8). */
export function signFeedbackAdmin(privatePem: string, method: string, pathAndQuery: string, body: string | Uint8Array = '', now = Date.now()): Record<string, string> {
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const text = `${FEEDBACK_ADMIN_PREFIX}${method.toUpperCase()}\n${pathAndQuery}\n${now}\n${digest}`;
  const sig = crypto.sign(null, Buffer.from(text, 'utf8'), crypto.createPrivateKey(privatePem)).toString('base64');
  return { 'X-Retours-Date': String(now), 'X-Retours-Signature': sig };
}

/** Un joueur nommé par le service (ou à envoyer) : pseudo valide (normalizeName) et pays facultatif ; undefined sinon. */
export function parseFeedbackPerson(raw: unknown): FeedbackPerson | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!name) return undefined;
  return typeof r.country === 'string' && /^[A-Z]{2}$/.test(r.country) ? { name, country: r.country } : { name };
}

/** Réponse de GET /api/soutiens, vérifiée : les joueurs nommés (dans l'ordre du service) et le nombre des autres. */
export function parseSupporters(raw: unknown): ProposalSupporters | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.soutiens)) return undefined;
  const people = r.soutiens.map(parseFeedbackPerson).filter((p): p is FeedbackPerson => Boolean(p));
  const others = typeof r.autres === 'number' && Number.isFinite(r.autres) && r.autres > 0 ? Math.floor(r.autres) : 0;
  return { people, others: others + (r.soutiens.length - people.length) };
}

/** Une proposition du service, vérifiée champ par champ (rien d'inattendu n'entre dans les écrans). */
export function parseProposal(raw: unknown): Proposal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const title = cleanProposalTitle(r.title);
  const text = cleanProposalText(r.text ?? '');
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{6,32}$/.test(r.id) || !title || text === undefined) return undefined;
  if (!PROPOSAL_KINDS.includes(r.kind as ProposalKind) || !PROPOSAL_STATUSES.includes(r.status as ProposalStatus)) return undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const reply = typeof r.reply === 'string' && r.reply.trim() ? cleanProposalText(r.reply.slice(0, 1000)) : undefined;
  const author = parseFeedbackPerson(r.author);
  const lang = isLanguage(r.lang) ? r.lang : 'fr';
  const replyLang = reply && isLanguage(r.reply_lang) && r.reply_lang !== lang ? r.reply_lang : undefined;
  const translations = parseTranslations(r.translations);
  return {
    id: r.id,
    kind: r.kind as ProposalKind,
    title,
    text,
    lang,
    votes: num(r.votes),
    status: r.status as ProposalStatus,
    at: num(r.at),
    updated: num(r.updated ?? r.at),
    ...(reply ? { reply } : {}),
    ...(replyLang ? { replyLang } : {}),
    ...(translations ? { translations } : {}),
    merged: num(r.merged),
    ...(author ? { author } : {}),
    ...(r.mine === true ? { mine: true } : {}),
    ...(r.voted === true ? { voted: true } : {}),
  };
}

/** Les versions traduites d'une proposition, vérifiées comme l'originale (langues de l'interface seulement). */
function parseTranslations(raw: unknown): Proposal['translations'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Partial<Record<Language, ProposalTranslation>> = {};
  for (const lang of LANGUAGES) {
    const v = (raw as Record<string, unknown>)[lang];
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const title = cleanProposalTitle(r.title);
    const text = typeof r.text === 'string' ? cleanProposalText(r.text) : undefined;
    const reply = typeof r.reply === 'string' && r.reply.trim() ? cleanProposalText(r.reply.slice(0, 1000)) : undefined;
    // Un titre traduit illisible : la version entière est écartée, sauf la réponse.
    const one: ProposalTranslation = { ...(title ? { title, ...(text !== undefined ? { text } : {}) } : {}), ...(reply ? { reply } : {}) };
    if (Object.keys(one).length) out[lang] = one;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Une proposition telle qu'un joueur la lit : dans sa langue si le service l'a traduite, l'originale gardée à côté. */
export interface ProposalView extends Proposal {
  /** Le titre et la description sont traduits de cette langue. */
  translatedFrom?: Language;
  /** La réponse de l'équipe est traduite de cette langue. */
  replyTranslatedFrom?: Language;
  /** L'original, tel que l'auteur (et l'équipe) l'ont écrit. */
  original: { lang: Language; title: string; text: string; reply?: string; replyLang?: Language };
}

/**
 * La proposition dans la langue `lang` : titre, description et réponse traduits quand le service en a
 * une version, l'original sinon. `original` : la proposition telle qu'écrite (« Voir l'original »).
 */
export function proposalIn(p: Proposal, lang: Language): ProposalView {
  const own = isLanguage(p.lang) ? p.lang : 'fr';
  const replyLang = p.replyLang ?? own;
  const original = { lang: own, title: p.title, text: p.text, ...(p.reply ? { reply: p.reply, replyLang } : {}) };
  const version = p.translations?.[lang];
  const main = lang !== own && version?.title ? version : undefined;
  const reply = p.reply && lang !== replyLang && version?.reply ? version.reply : undefined;
  return {
    ...p,
    ...(main ? { title: main.title!, text: p.text ? (main.text ?? p.text) : '', translatedFrom: own } : {}),
    ...(reply ? { reply, replyTranslatedFrom: replyLang } : {}),
    original,
  };
}

/** La proposition telle qu'écrite, sans traduction : « Voir l'original ». */
export function proposalOriginal(p: ProposalView): ProposalView {
  const { translatedFrom: _a, replyTranslatedFrom: _b, ...rest } = p;
  return { ...rest, title: p.original.title, text: p.original.text, ...(p.original.reply ? { reply: p.original.reply } : {}) };
}

/** « Traduit du français » : la mention discrète d'un texte traduit, selon sa langue d'origine. */
export const TRANSLATED_FROM: Record<Language, () => string> = {
  fr: () => t('Traduit du français'),
  en: () => t('Traduit de l’anglais'),
};

/** Les propositions de la réponse du service, triées par votes puis par date (la plus récente d'abord). */
export function parseProposals(raw: unknown): Proposal[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { propositions?: unknown }).propositions) ? (raw as { propositions: unknown[] }).propositions : [];
  return list
    .map(parseProposal)
    .filter((p): p is Proposal => Boolean(p))
    .sort((a, b) => b.votes - a.votes || b.at - a.at);
}

// ---------------------------------------------------------------------------
// Doublons : les propositions proches de ce qu'on écrit

const STOP = new Set(
  'les des une un le la de du et en au aux pour par sur dans avec sans que qui quoi est sont pas plus tres très quand fait faire peut peux veux voudrais serait avoir être etre cette ces son sa ses mon ma mes notre vos votre leur the and for with that this from into when have not are can could would should was were will its it of to in on an a or as be by'.split( // i18n-ignore
    ' ',
  ),
);

/** Mots porteurs d'un texte : minuscules, sans accents, trois lettres au moins, mots vides retirés, pluriel simple ramené. */
export function proposalWords(text: string): Set<string> {
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
  return new Set(words);
}

/**
 * Propositions proches d'un texte (titre et description) : part des mots porteurs en commun, le
 * titre compte double, deux mots en commun au moins. Les plus proches d'abord, `max` au plus, au-dessus d'un seuil.
 */
export function similarProposals<P extends Proposal>(text: string, list: readonly P[], max = 3, threshold = 0.3): P[] {
  const mine = proposalWords(text);
  if (!mine.size) return [];
  const scored = list.map((p) => {
    const title = proposalWords(p.title);
    const body = proposalWords(p.text);
    let hit = 0;
    let shared = 0;
    for (const w of mine) {
      hit += title.has(w) ? 2 : body.has(w) ? 1 : 0;
      if (title.has(w) || body.has(w)) shared++;
    }
    return { p, shared, score: hit / (2 * Math.min(mine.size, Math.max(title.size, 1) + body.size)) };
  });
  // Un seul mot commun (« tables ») ne fait pas un doublon, sauf pour un texte d'un seul mot.
  const need = Math.min(2, mine.size);
  return scored
    .filter((s) => s.score >= threshold && s.shared >= need)
    .sort((a, b) => b.score - a.score || b.p.votes - a.p.votes)
    .slice(0, max)
    .map((s) => s.p);
}

// ---------------------------------------------------------------------------
// Rapports privés, scellés pour la clé « retours »

/** Ce qui accompagne le fichier d'un rapport, scellé avec lui. */
export interface ReportEnvelope {
  v: 1;
  /**
   * Plantage envoyé seul, rapport fait par le joueur (formulaire, fiche technique), ou message du
   * joueur dans un fil ouvert avec l'équipe (feedback-threads.ts, `fil` obligatoire).
   */
  kind: 'crash' | 'report' | 'message';
  /** Plantage : sa signature (« vpx:0xC0000005:<table> »), pour regrouper. */
  signature?: string;
  /** Ce que le joueur a écrit, s'il a écrit. */
  text?: string;
  /** Proposition publique faite en même temps (son identifiant). */
  proposal?: string;
  table?: string;
  version: string;
  lang: string;
  /** Identifiant tiré au hasard à la première utilisation : regroupe les rapports d'une même borne, sans rien dire d'elle. */
  borne: string;
  at: number;
  /**
   * Le fil de ce rapport (feedback-threads.ts, 21/11/2026) : l'équipe y répond ; le joueur y écrit
   * ensuite (kind 'message'). Tiré au hasard par la borne, il ne dit rien d'elle.
   */
  fil?: string;
  /** Clé publique X25519 (hexadécimal) du fil : les réponses de l'équipe sont scellées pour elle. */
  answer?: string;
  /** Pseudo et pays du joueur ; absent quand il a choisi d'envoyer ses rapports anonymement. */
  who?: FeedbackPerson;
}

export function x25519Public(hex: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(hex, 'hex').toString('base64url') }, format: 'jwk' });
}

export function rawPublic(key: crypto.KeyObject): Buffer {
  return Buffer.from(key.export({ format: 'jwk' }).x!, 'base64url');
}

function boxKey(label: string, shared: Buffer, epk: Buffer, rpk: Buffer): Buffer {
  return crypto.createHash('sha256').update(Buffer.from(label)).update(shared).update(epk).update(rpk).digest();
}

/**
 * Boîte scellée pour une clé X25519 : en-tête (4 octets ASCII) | clé éphémère (32) | nonce (12) |
 * étiquette (16) | chiffré. `label` sépare les usages (rapport, réponse de l'équipe) : une boîte faite
 * pour l'un ne s'ouvre pas pour l'autre.
 */
export function sealBox(magic: string, label: string, plain: Uint8Array, recipient: string): Buffer {
  const rpk = x25519Public(recipient);
  const eph = crypto.generateKeyPairSync('x25519');
  const epk = rawPublic(eph.publicKey);
  const key = boxKey(label, crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: rpk }), epk, Buffer.from(recipient, 'hex'));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from(magic, 'ascii'), epk, iv, cipher.getAuthTag(), body]);
}

/** Ouvre une boîte de sealBox avec la clé privée (PEM PKCS #8, X25519) ; undefined si elle n'est pas pour elle. */
export function openBox(magic: string, label: string, sealed: Uint8Array, privatePem: string): Buffer | undefined {
  const box = Buffer.from(sealed);
  if (box.length < 64 || box.subarray(0, 4).toString('ascii') !== magic) return undefined;
  try {
    const priv = crypto.createPrivateKey(privatePem);
    const rpk = rawPublic(crypto.createPublicKey(priv));
    const epk = box.subarray(4, 36);
    const key = boxKey(label, crypto.diffieHellman({ privateKey: priv, publicKey: x25519Public(epk.toString('hex')) }), epk, rpk);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, box.subarray(36, 48));
    decipher.setAuthTag(box.subarray(48, 64));
    return Buffer.concat([decipher.update(box.subarray(64)), decipher.final()]);
  } catch {
    return undefined;
  }
}

const REPORT_LABEL = 'cyberpinball:rapport:v1';

/**
 * Scelle un rapport : CPR1 | clé éphémère (32) | nonce (12) | étiquette (16) | chiffré. Le clair :
 * longueur de l'enveloppe (4 octets), l'enveloppe JSON, puis le fichier (ZIP), s'il y en a un.
 */
export function sealReport(envelope: ReportEnvelope, file: Uint8Array | undefined, recipient: string = FEEDBACK_KEYS.seal): Buffer {
  const head = Buffer.from(JSON.stringify(envelope), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  return sealBox(REPORT_MAGIC, REPORT_LABEL, Buffer.concat([len, head, file ? Buffer.from(file) : Buffer.alloc(0)]), recipient);
}

/** Ouvre un rapport scellé avec la clé privée « retours » (PEM PKCS #8, X25519) ; undefined s'il n'est pas pour elle. */
export function openSealedReport(sealed: Uint8Array, privatePem: string): { envelope: ReportEnvelope; file?: Buffer } | undefined {
  const plain = openBox(REPORT_MAGIC, REPORT_LABEL, sealed, privatePem);
  if (!plain) return undefined;
  try {
    const n = plain.readUInt32BE(0);
    const envelope = JSON.parse(plain.subarray(4, 4 + n).toString('utf8')) as ReportEnvelope;
    const file = plain.subarray(4 + n);
    return { envelope, ...(file.length ? { file } : {}) };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Réglage et file d'attente (<données>\retours.json)

export type CrashConsent = 'ask' | 'yes' | 'no';

export interface FeedbackState {
  /** Rapports de plantage automatiques : demandé au premier plantage, puis retenu. */
  crashes: CrashConsent;
  /** Identifiant au hasard de cette borne dans les rapports (ReportEnvelope.borne). */
  borne: string;
  /** Dernier envoi de chaque plantage (sa signature) : un même plantage part une fois par jour. */
  sent: Record<string, number>;
  /**
   * Rapports envoyés sans le pseudo du joueur (choix retenu, 21/11/2026). Par défaut, le pseudo et le
   * pays partent avec : l'équipe sait à qui elle répond. Anonymes, l'équipe peut quand même répondre.
   */
  anonymous: boolean;
}

export const FEEDBACK_FILE = 'retours.json';
export const CRASH_RESEND_MS = 24 * 3600_000;

export function newFeedbackState(): FeedbackState {
  return { crashes: 'ask', borne: crypto.randomBytes(9).toString('base64url'), sent: {}, anonymous: false };
}

/**
 * L'état des retours. Un numéro de borne tiré à cette lecture (fichier absent, ou numéro illisible) est
 * enregistré tout de suite : la fiche technique le montre au joueur (borneCode), il ne doit plus changer
 * d'un démarrage à l'autre, ni différer de celui des rapports qui partiront.
 */
export function loadFeedbackState(dataDir: string): FeedbackState {
  let raw: Partial<FeedbackState> = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dataDir, FEEDBACK_FILE), 'utf8')) as Partial<FeedbackState>;
  } catch {
    raw = {};
  }
  const kept = typeof raw.borne === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(raw.borne) ? raw.borne : undefined;
  const state: FeedbackState = {
    crashes: raw.crashes === 'yes' || raw.crashes === 'no' ? raw.crashes : 'ask',
    borne: kept ?? newFeedbackState().borne,
    sent: raw.sent && typeof raw.sent === 'object' ? Object.fromEntries(Object.entries(raw.sent).filter(([, v]) => typeof v === 'number')) : {},
    anonymous: raw.anonymous === true,
  };
  if (!kept) {
    try {
      saveFeedbackState(dataDir, state);
    } catch {
      // Données en lecture seule : le numéro reste celui de cette session.
    }
  }
  return state;
}

/** Alphabet de Crockford : ni I, L, O ni U, que l'on confond avec 1, 0 ou V au téléphone. */
const BORNE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Le numéro de la borne, lisible et facile à dicter : « 7KQ2-M9XD ». Tiré de ReportEnvelope.borne (une
 * empreinte, sans retour possible au numéro), il se calcule aussi pour les rapports déjà reçus : la
 * gestion des retours le retrouve. Montré au joueur dans la fiche technique, pour qu'il le donne à l'équipe.
 */
export function borneCode(borne: string): string {
  const hash = crypto.createHash('sha256').update(`cyberpinball-borne:${borne}`).digest();
  let bits = 0n;
  for (const byte of hash.subarray(0, 5)) bits = (bits << 8n) | BigInt(byte);
  let code = '';
  for (let i = 0; i < 8; i++) code = BORNE_CODE_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)]! + code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function saveFeedbackState(dataDir: string, state: FeedbackState): void {
  writeFileAtomic(path.join(dataDir, FEEDBACK_FILE), JSON.stringify(state, null, 1));
}

/** Signature d'un plantage, pour le regrouper : « vpx:0xC0000005:Glass Lagoon », « app:exception:<empreinte> ». */
export function crashSignature(source: 'vpx' | 'app' | 'diagnostic', code: string, detail = ''): string {
  return `${source}:${code}:${detail}`.slice(0, 200);
}

/** Ce plantage part-il maintenant ? Seulement avec l'accord, et une fois par jour pour une même signature. */
export function crashDue(state: FeedbackState, signature: string, now = Date.now()): boolean {
  if (state.crashes !== 'yes') return false;
  const last = state.sent[signature];
  return last === undefined || now - last >= CRASH_RESEND_MS;
}

/** Note l'envoi d'un plantage ; les traces de plus de 30 jours sont oubliées. */
export function noteCrashSent(state: FeedbackState, signature: string, now = Date.now()): FeedbackState {
  const sent = Object.fromEntries(Object.entries(state.sent).filter(([, at]) => now - at < 30 * 86_400_000));
  return { ...state, sent: { ...sent, [signature]: now } };
}

// ---------------------------------------------------------------------------
// Contributions du joueur (badges « Une voix qui compte », « Force de proposition », « Son idée est
// dans le jeu », 17/11/2026) : <données>\retours\contributions.json
//
// - une proposition publique compte dès qu'elle paraît à la liste comme la mienne ; elle cesse de
//   compter quand elle n'y est plus alors que la liste est complète (masquée ou fusionnée par l'équipe) ;
// - un rapport privé écrit par le joueur (pas un plantage automatique) compte, un par jour au plus ;
// - une proposition passée « fait » compte pour « Son idée est dans le jeu », une seule fois.

/** Propositions rendues au plus par le service (LIST_MAX de worker.mjs) : en dessous, la liste est complète. */
export const PROPOSALS_LIST_MAX = 500;
export const CONTRIBUTIONS_FILE = path.join('retours', 'contributions.json');

export interface Contributions {
  /** Mes propositions publiques vues à la liste (identifiants). */
  proposals: string[];
  /** Jours (AAAA-MM-JJ) où j'ai envoyé un rapport écrit. */
  reports: string[];
  /** Mes propositions passées « fait » (identifiants). */
  shipped: string[];
}

export const emptyContributions = (): Contributions => ({ proposals: [], reports: [], shipped: [] });

export const contributionsCount = (c: Contributions): number => c.proposals.length + c.reports.length;

/** La liste des propositions vient d'être lue : `shipped`, celles de mes propositions qui viennent de passer « fait ». */
export function noteProposals(c: Contributions, list: readonly Proposal[]): { contributions: Contributions; shipped: Proposal[] } {
  const mine = list.filter((p) => p.mine);
  const ids = new Set(mine.map((p) => p.id));
  const complete = list.length < PROPOSALS_LIST_MAX;
  const proposals = [...(complete ? c.proposals.filter((id) => ids.has(id)) : c.proposals), ...mine.map((p) => p.id).filter((id) => !c.proposals.includes(id))];
  const shipped = mine.filter((p) => p.status === 'done' && !c.shipped.includes(p.id));
  return { contributions: { ...c, proposals, shipped: [...c.shipped, ...shipped.map((p) => p.id)] }, shipped };
}

/** Un rapport écrit envoyé : un par jour au plus. */
export function noteReport(c: Contributions, now = new Date()): Contributions {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return c.reports.includes(day) ? c : { ...c, reports: [...c.reports, day].slice(-1000) };
}

export function loadContributions(dataDir: string): Contributions {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, CONTRIBUTIONS_FILE), 'utf8')) as Partial<Record<keyof Contributions, unknown>>;
    const ids = (v: unknown, re: RegExp) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && re.test(x)).slice(-1000) : []);
    return { proposals: ids(raw.proposals, /^[A-Za-z0-9_-]{1,64}$/), reports: ids(raw.reports, /^\d{4}-\d{2}-\d{2}$/), shipped: ids(raw.shipped, /^[A-Za-z0-9_-]{1,64}$/) };
  } catch {
    return emptyContributions();
  }
}

export function saveContributions(dataDir: string, c: Contributions): void {
  fs.mkdirSync(path.join(dataDir, 'retours'), { recursive: true });
  writeFileAtomic(path.join(dataDir, CONTRIBUTIONS_FILE), JSON.stringify(c));
}
