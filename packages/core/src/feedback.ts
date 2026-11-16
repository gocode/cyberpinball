// Retours des joueurs (« Avis et propositions », app/src/feedback-menu.ts) : le cœur, sans réseau ni
// Electron. Deux circuits vers le service du projet (packages/service-telephone/worker.mjs, base D1) :
// - public : le tableau des propositions (bug, amélioration, nouvelle fonction), publié tout de suite,
//   où chaque borne vote une fois par proposition ; les requêtes sont signées par la clé du joueur
//   (sharing.ts, PlayerKey), qui ne sert qu'à compter une voix par borne et n'est jamais rendue ;
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
import { t } from './i18n';
import type { IconName } from './icons';
import { signText, type PlayerKey } from './sharing';

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
  /** Propositions fusionnées dans celle-ci (doublons). */
  merged: number;
  mine?: boolean;
  voted?: boolean;
}

export const PROPOSAL_KIND_VIEW: Record<ProposalKind, { icon: IconName; readonly label: string; readonly lead: string }> = {
  bug: { icon: 'alert', get label() { return t('Problème'); }, get lead() { return t('Quelque chose ne marche pas comme prévu'); } },
  improvement: { icon: 'sliders', get label() { return t('Amélioration'); }, get lead() { return t('Une fonction qui existe, en mieux'); } },
  feature: { icon: 'star', get label() { return t('Nouvelle fonction'); }, get lead() { return t('Quelque chose que Cyber Pinball ne fait pas encore'); } },
};

export const PROPOSAL_STATUS_VIEW: Record<ProposalStatus, { readonly label: string; tone?: 'ok' | 'info' | 'quiet' | 'warning' }> = {
  new: { get label() { return t('Nouvelle'); } },
  review: { get label() { return t('À l’étude'); }, tone: 'info' },
  planned: { get label() { return t('Prévue'); }, tone: 'info' },
  progress: { get label() { return t('En développement'); }, tone: 'warning' },
  done: { get label() { return t('Faite'); }, tone: 'ok' },
  declined: { get label() { return t('Pas retenue'); }, tone: 'quiet' },
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
  | { op: 'propose'; kind: ProposalKind; title: string; text: string; lang: string }
  | { op: 'vote'; id: string; on: boolean };

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
  return {
    id: r.id,
    kind: r.kind as ProposalKind,
    title,
    text,
    lang: r.lang === 'en' ? 'en' : 'fr',
    votes: num(r.votes),
    status: r.status as ProposalStatus,
    at: num(r.at),
    updated: num(r.updated ?? r.at),
    ...(reply ? { reply } : {}),
    merged: num(r.merged),
    ...(r.mine === true ? { mine: true } : {}),
    ...(r.voted === true ? { voted: true } : {}),
  };
}

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
export function similarProposals(text: string, list: readonly Proposal[], max = 3, threshold = 0.3): Proposal[] {
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
  /** Plantage envoyé seul, ou rapport fait par le joueur (formulaire, fiche technique). */
  kind: 'crash' | 'report';
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
}

function x25519Public(hex: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(hex, 'hex').toString('base64url') }, format: 'jwk' });
}

function rawPublic(key: crypto.KeyObject): Buffer {
  return Buffer.from(key.export({ format: 'jwk' }).x!, 'base64url');
}

function boxKey(shared: Buffer, epk: Buffer, rpk: Buffer): Buffer {
  return crypto.createHash('sha256').update(Buffer.from('cyberpinball:rapport:v1')).update(shared).update(epk).update(rpk).digest();
}

/**
 * Scelle un rapport : CPR1 | clé éphémère (32) | nonce (12) | étiquette (16) | chiffré. Le clair :
 * longueur de l'enveloppe (4 octets), l'enveloppe JSON, puis le fichier (ZIP), s'il y en a un.
 */
export function sealReport(envelope: ReportEnvelope, file: Uint8Array | undefined, recipient: string = FEEDBACK_KEYS.seal): Buffer {
  const head = Buffer.from(JSON.stringify(envelope), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  const plain = Buffer.concat([len, head, file ? Buffer.from(file) : Buffer.alloc(0)]);
  const rpk = x25519Public(recipient);
  const eph = crypto.generateKeyPairSync('x25519');
  const epk = rawPublic(eph.publicKey);
  const key = boxKey(crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: rpk }), epk, Buffer.from(recipient, 'hex'));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from(REPORT_MAGIC, 'ascii'), epk, iv, cipher.getAuthTag(), body]);
}

/** Ouvre un rapport scellé avec la clé privée « retours » (PEM PKCS #8, X25519) ; undefined s'il n'est pas pour elle. */
export function openSealedReport(sealed: Uint8Array, privatePem: string): { envelope: ReportEnvelope; file?: Buffer } | undefined {
  const box = Buffer.from(sealed);
  if (box.length < 64 || box.subarray(0, 4).toString('ascii') !== REPORT_MAGIC) return undefined;
  try {
    const priv = crypto.createPrivateKey(privatePem);
    const rpk = rawPublic(crypto.createPublicKey(priv));
    const epk = box.subarray(4, 36);
    const key = boxKey(crypto.diffieHellman({ privateKey: priv, publicKey: x25519Public(epk.toString('hex')) }), epk, rpk);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, box.subarray(36, 48));
    decipher.setAuthTag(box.subarray(48, 64));
    const plain = Buffer.concat([decipher.update(box.subarray(64)), decipher.final()]);
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
}

export const FEEDBACK_FILE = 'retours.json';
export const CRASH_RESEND_MS = 24 * 3600_000;

export function newFeedbackState(): FeedbackState {
  return { crashes: 'ask', borne: crypto.randomBytes(9).toString('base64url'), sent: {} };
}

export function loadFeedbackState(dataDir: string): FeedbackState {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, FEEDBACK_FILE), 'utf8')) as Partial<FeedbackState>;
    const base = newFeedbackState();
    return {
      crashes: raw.crashes === 'yes' || raw.crashes === 'no' ? raw.crashes : 'ask',
      borne: typeof raw.borne === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(raw.borne) ? raw.borne : base.borne,
      sent: raw.sent && typeof raw.sent === 'object' ? Object.fromEntries(Object.entries(raw.sent).filter(([, v]) => typeof v === 'number')) : {},
    };
  } catch {
    return newFeedbackState();
  }
}

export function saveFeedbackState(dataDir: string, state: FeedbackState): void {
  writeFileAtomic(path.join(dataDir, FEEDBACK_FILE), JSON.stringify(state, null, 1));
}

/** Signature d'un plantage, pour le regrouper : « vpx:0xC0000005:Glass Lagoon », « app:exception:<empreinte> ». */
export function crashSignature(source: 'vpx' | 'app', code: string, detail = ''): string {
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
