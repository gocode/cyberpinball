// Dialogue entre un joueur et l'équipe sur un rapport (21/11/2026) : le cœur, sans réseau ni Electron.
//
// Chaque rapport (écrit par le joueur, plantage automatique, rapport aux développeurs) ouvre un fil :
// la borne tire son identifiant (`fil`, 22 caractères base64url) et une paire X25519 dont la publique
// (`answer`) part dans l'enveloppe scellée du rapport (ReportEnvelope). L'équipe, qui seule lit le
// rapport, répond en scellant sa réponse pour cette clé (sealTeamReply, en-tête CPM1) et la dépose sur
// le service (POST /api/admin/fils/<fil>, worker.mjs). La borne relève ses fils (POST /api/fils, sans
// clé de joueur : connaître l'identifiant suffit, il ne sort que dans un rapport scellé), ouvre les
// réponses avec la clé privée du fil, gardée chez elle, et les montre dans ses Messages en attente. Le
// joueur répond dans le même fil : un message (ReportEnvelope.kind 'message') scellé pour l'équipe,
// comme un rapport. Le service ne lit ni les réponses ni les messages.
//
// Une réponse publique de l'équipe sur une proposition du joueur (le tableau) ouvre aussi un fil, sur
// la borne seulement (noteProposalReplies) : le joueur en est prévenu et peut répondre en privé.
//
// Le pseudo et le pays du joueur partent par défaut avec ses rapports (ReportEnvelope.who) ; il peut
// les envoyer anonymement (FeedbackState.anonymous) : l'équipe peut quand même lui répondre.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { openBox, rawPublic, sealBox, type Proposal } from './feedback';

/** Identifiant d'un fil : 16 octets au hasard, en base64url (le même motif que FIL dans worker.mjs). */
export const THREAD_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** En-tête d'une réponse scellée de l'équipe. */
export const TEAM_REPLY_MAGIC = 'CPM1';
const TEAM_REPLY_LABEL = 'cyberpinball:reponse:v1';
/** Taille d'une réponse scellée acceptée par le service (TEAM_REPLY_MAX dans worker.mjs). */
export const TEAM_REPLY_SEALED_MAX = 16_384;
/** Longueur d'un message, de l'équipe comme du joueur. */
export const THREAD_TEXT_MAX = 2000;
/** Fils gardés sur la borne : au-delà, les plus anciens (sans activité) partent. */
export const THREADS_MAX = 60;
/** Messages gardés par fil. */
export const THREAD_LINES_MAX = 200;
/** Un fil sans activité depuis ce délai n'est plus relevé (le service garde les réponses un an). */
export const THREAD_POLL_AGE_MS = 180 * 86_400_000;
/** Fils relevés en une requête (FILS_MAX dans worker.mjs). */
export const THREAD_POLL_MAX = 64;
export const THREADS_FILE = 'retours-fils.json';

/** D'où vient le fil : un rapport écrit, un plantage, une proposition publique à laquelle l'équipe a répondu. */
export type ThreadOrigin = 'report' | 'crash' | 'proposal';

export interface ThreadLine {
  id: string;
  from: 'me' | 'team';
  text: string;
  at: number;
  /** Message du joueur pas encore parti (borne hors ligne) : il repartira avec la file des rapports. */
  queued?: boolean;
}

export interface FeedbackThread {
  fil: string;
  /** Clé privée X25519 du fil (PEM PKCS #8) : ouvre les réponses de l'équipe. Jamais hors de la borne. */
  key: string;
  origin: ThreadOrigin;
  /** Ce dont il s'agit, en une ligne (« Glass Lagoon · VPX arrêté », le titre du rapport, de la proposition). */
  title: string;
  table?: string;
  /** La proposition publique du fil (origine 'proposal', ou rapport fait en publiant). */
  proposal?: string;
  /** Rapport parti sans le pseudo du joueur. */
  anonymous?: boolean;
  at: number;
  /** Dernier message, d'un côté ou de l'autre. */
  updated: number;
  /** Date du service de la dernière réponse reçue : la prochaine relève demande les suivantes. */
  since: number;
  /** Réponses de l'équipe pas encore lues. */
  unread: number;
  lines: ThreadLine[];
  /** Proposition : empreinte de la réponse publique déjà notée (une réponse changée est redite). */
  seenReply?: string;
}

export interface ThreadStore {
  v: 1;
  threads: FeedbackThread[];
}

/** Une réponse de l'équipe telle que le service la rend : scellée pour la clé du fil. */
export interface TeamReplyBox {
  fil: string;
  id: string;
  /** Date du service (ms). */
  at: number;
  data: Uint8Array;
}

/** Ce que l'équipe écrit, scellé pour la clé du fil. */
export interface TeamReply {
  v: 1;
  text: string;
  /** Date d'écriture (ms). */
  at: number;
  lang?: string;
}

export const emptyThreadStore = (): ThreadStore => ({ v: 1, threads: [] });

/** Un nouveau fil, sa clé privée gardée ; `answer` : la clé publique à glisser dans l'enveloppe du rapport. */
export function newThread(origin: ThreadOrigin, title: string, now: number, extra: Partial<Pick<FeedbackThread, 'table' | 'proposal' | 'anonymous'>> = {}): { thread: FeedbackThread; answer: string } {
  const pair = crypto.generateKeyPairSync('x25519');
  const thread: FeedbackThread = {
    fil: crypto.randomBytes(16).toString('base64url'),
    key: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    origin,
    title: oneLine(title).slice(0, 120),
    ...(extra.table ? { table: extra.table } : {}),
    ...(extra.proposal ? { proposal: extra.proposal } : {}),
    ...(extra.anonymous ? { anonymous: true } : {}),
    at: now,
    updated: now,
    since: 0,
    unread: 0,
    lines: [],
  };
  return { thread, answer: rawPublic(pair.publicKey).toString('hex') };
}

/** La clé publique d'un fil (hexadécimal), tirée de sa clé privée. */
export function threadAnswerKey(thread: Pick<FeedbackThread, 'key'>): string {
  return rawPublic(crypto.createPublicKey(crypto.createPrivateKey(thread.key))).toString('hex');
}

/** Scelle une réponse de l'équipe pour la clé publique d'un fil (`answer` de l'enveloppe du rapport). */
export function sealTeamReply(reply: TeamReply, answer: string): Buffer {
  return sealBox(TEAM_REPLY_MAGIC, TEAM_REPLY_LABEL, Buffer.from(JSON.stringify(reply), 'utf8'), answer);
}

/** Ouvre une réponse de l'équipe avec la clé privée du fil ; undefined si elle n'est pas pour lui ou abîmée. */
export function openTeamReply(data: Uint8Array, privatePem: string): TeamReply | undefined {
  const plain = openBox(TEAM_REPLY_MAGIC, TEAM_REPLY_LABEL, data, privatePem);
  if (!plain) return undefined;
  try {
    const r = JSON.parse(plain.toString('utf8')) as Partial<TeamReply>;
    const text = typeof r.text === 'string' ? cleanThreadText(r.text) : undefined;
    if (r.v !== 1 || !text || typeof r.at !== 'number') return undefined;
    return { v: 1, text, at: r.at, ...(typeof r.lang === 'string' ? { lang: r.lang } : {}) };
  } catch {
    return undefined;
  }
}

/** Texte d'un message : retours à la ligne gardés (trois au plus d'affilée), contrôles ôtés, borné. */
export function cleanThreadText(value: string): string | undefined {
  const s = value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n]/gu, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, THREAD_TEXT_MAX);
  return s || undefined;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Le fichier des fils (<données>\retours-fils.json)

function parseLine(raw: unknown): ThreadLine | undefined {
  const l = raw as Partial<ThreadLine> | undefined;
  if (!l || typeof l.id !== 'string' || (l.from !== 'me' && l.from !== 'team') || typeof l.text !== 'string' || typeof l.at !== 'number') return undefined;
  return { id: l.id, from: l.from, text: l.text, at: l.at, ...(l.queued ? { queued: true } : {}) };
}

function parseThread(raw: unknown): FeedbackThread | undefined {
  const x = raw as Partial<FeedbackThread> | undefined;
  if (!x || typeof x.fil !== 'string' || !THREAD_ID_RE.test(x.fil) || typeof x.key !== 'string' || !x.key.includes('PRIVATE KEY')) return undefined;
  if (x.origin !== 'report' && x.origin !== 'crash' && x.origin !== 'proposal') return undefined;
  const lines = Array.isArray(x.lines) ? x.lines.map(parseLine).filter((l): l is ThreadLine => Boolean(l)) : [];
  const at = typeof x.at === 'number' ? x.at : 0;
  return {
    fil: x.fil,
    key: x.key,
    origin: x.origin,
    title: typeof x.title === 'string' ? x.title : '',
    ...(typeof x.table === 'string' ? { table: x.table } : {}),
    ...(typeof x.proposal === 'string' ? { proposal: x.proposal } : {}),
    ...(x.anonymous ? { anonymous: true } : {}),
    at,
    updated: typeof x.updated === 'number' ? x.updated : at,
    since: typeof x.since === 'number' ? x.since : 0,
    unread: typeof x.unread === 'number' && x.unread > 0 ? Math.floor(x.unread) : 0,
    lines,
    ...(typeof x.seenReply === 'string' ? { seenReply: x.seenReply } : {}),
  };
}

export function loadThreads(dataDir: string): ThreadStore {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, THREADS_FILE), 'utf8')) as { threads?: unknown[] };
    return { v: 1, threads: (raw.threads ?? []).map(parseThread).filter((x): x is FeedbackThread => Boolean(x)) };
  } catch {
    return emptyThreadStore();
  }
}

export function saveThreads(dataDir: string, store: ThreadStore): void {
  writeFileAtomic(path.join(dataDir, THREADS_FILE), JSON.stringify(store, null, 1));
}

/**
 * Garde THREADS_MAX fils au plus : ceux qui attendent une lecture restent, puis les plus récents. Les
 * messages d'un fil : les THREAD_LINES_MAX derniers.
 */
export function pruneThreads(store: ThreadStore): ThreadStore {
  const ordered = [...store.threads].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || b.updated - a.updated);
  const kept = new Set(ordered.slice(0, THREADS_MAX));
  return { v: 1, threads: store.threads.filter((x) => kept.has(x)).map((x) => (x.lines.length > THREAD_LINES_MAX ? { ...x, lines: x.lines.slice(-THREAD_LINES_MAX) } : x)) };
}

export function addThread(store: ThreadStore, thread: FeedbackThread): ThreadStore {
  return pruneThreads({ v: 1, threads: [...store.threads.filter((x) => x.fil !== thread.fil), thread] });
}

/** Ajoute (ou remplace, même identifiant) un message du joueur dans son fil. */
export function addMyLine(store: ThreadStore, fil: string, line: Omit<ThreadLine, 'from'>): ThreadStore {
  return {
    v: 1,
    threads: store.threads.map((x) => (x.fil === fil ? { ...x, updated: Math.max(x.updated, line.at), lines: [...x.lines.filter((l) => l.id !== line.id), { ...line, from: 'me' as const }] } : x)),
  };
}

/** Le message du joueur est parti (il était en attente). */
export function markLineSent(store: ThreadStore, fil: string, id: string): ThreadStore {
  return { v: 1, threads: store.threads.map((x) => (x.fil === fil ? { ...x, lines: x.lines.map((l) => (l.id === id && l.queued ? { id: l.id, from: l.from, text: l.text, at: l.at } : l)) } : x)) };
}

export function markTeamThreadRead(store: ThreadStore, fil: string): ThreadStore {
  return store.threads.some((x) => x.fil === fil && x.unread) ? { v: 1, threads: store.threads.map((x) => (x.fil === fil ? { ...x, unread: 0 } : x)) } : store;
}

/** Les fils à relever : ceux qui ont bougé dans les THREAD_POLL_AGE_MS derniers, les plus récents d'abord. */
export function threadsToPoll(store: ThreadStore, now: number): { fil: string; since: number }[] {
  return store.threads
    .filter((x) => now - x.updated < THREAD_POLL_AGE_MS)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, THREAD_POLL_MAX)
    .map((x) => ({ fil: x.fil, since: x.since }));
}

/**
 * Range les réponses relevées : chacune ouverte avec la clé de son fil, ajoutée une seule fois (son
 * identifiant), comptée non lue. `added` : les réponses nouvelles, à annoncer.
 */
export function mergeTeamReplies(store: ThreadStore, boxes: readonly TeamReplyBox[]): { store: ThreadStore; added: { thread: FeedbackThread; line: ThreadLine }[] } {
  const added: { thread: FeedbackThread; line: ThreadLine }[] = [];
  const threads = store.threads.map((x) => {
    const mine = boxes.filter((b) => b.fil === x.fil).sort((a, b) => a.at - b.at);
    if (!mine.length) return x;
    let next = x;
    for (const b of mine) {
      next = { ...next, since: Math.max(next.since, b.at) };
      if (next.lines.some((l) => l.id === b.id)) continue;
      const reply = openTeamReply(b.data, x.key);
      if (!reply) continue;
      const line: ThreadLine = { id: b.id, from: 'team', text: reply.text, at: b.at };
      next = { ...next, lines: [...next.lines, line], unread: next.unread + 1, updated: Math.max(next.updated, b.at) };
      added.push({ thread: next, line });
    }
    return next;
  });
  return { store: pruneThreads({ v: 1, threads }), added };
}

const replyStamp = (text: string) => crypto.createHash('sha256').update(text).digest('base64url').slice(0, 16);

/**
 * Les réponses publiques de l'équipe sur les propositions du joueur (`mine`) : une réponse nouvelle ou
 * changée entre dans le fil de la proposition (ouvert au besoin), non lue. `added` : à annoncer.
 */
export function noteProposalReplies(store: ThreadStore, proposals: readonly Proposal[], now: number): { store: ThreadStore; added: { thread: FeedbackThread; line: ThreadLine }[] } {
  let next = store;
  const added: { thread: FeedbackThread; line: ThreadLine }[] = [];
  for (const p of proposals) {
    if (!p.mine || !p.reply) continue;
    const stamp = replyStamp(p.reply);
    let thread = next.threads.find((x) => x.origin === 'proposal' && x.proposal === p.id);
    if (thread?.seenReply === stamp) continue;
    if (!thread) thread = newThread('proposal', p.title, now, { proposal: p.id }).thread;
    const line: ThreadLine = { id: `reponse-publique:${p.id}:${stamp}`, from: 'team', text: p.reply, at: p.updated || now };
    const updated: FeedbackThread = { ...thread, seenReply: stamp, lines: [...thread.lines, line], unread: thread.unread + 1, updated: Math.max(thread.updated, now) };
    next = addThread(next, updated);
    added.push({ thread: updated, line });
  }
  return { store: next, added };
}

/**
 * Cadence de la relève (21/11/2026, essai réel : réponse arrivée 16 minutes avant la relève
 * suivante). Un échange qui a bougé dans les THREAD_LIVE_MS dernières (rapport envoyé, réponse de
 * l'équipe, message du joueur) est une conversation en cours : relevé chaque minute. Sinon, toutes
 * les 20 minutes.
 */
export const THREAD_LIVE_MS = 2 * 3_600_000;
export const THREAD_POLL_LIVE_MS = 60_000;
export const THREAD_POLL_IDLE_MS = 20 * 60_000;

export function threadPollDelay(store: ThreadStore, now: number): number {
  return store.threads.some((x) => now - x.updated < THREAD_LIVE_MS) ? THREAD_POLL_LIVE_MS : THREAD_POLL_IDLE_MS;
}

/** Réponses de l'équipe non lues, tous fils confondus. */
export const threadsUnread = (store: ThreadStore): number => store.threads.reduce((n, x) => n + x.unread, 0);

/** Les fils à montrer au joueur : ceux où quelqu'un a écrit (un plantage sans réponse ne dit rien), les plus récents d'abord. */
export function visibleThreads(store: ThreadStore): FeedbackThread[] {
  return store.threads.filter((x) => x.lines.length > 0).sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || b.updated - a.updated);
}
