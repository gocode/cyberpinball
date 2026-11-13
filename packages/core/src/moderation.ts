// Modération des salons, sans serveur (décidée le 12/11/2026).
//
// - La charte : la liste des clés de modérateurs, numérotée et signée par la clé du projet (la même
//   que celle des mises à jour, update-key.ts). Une charte est livrée avec Cyber Pinball
//   (moderation-charter.ts) ; une plus récente (numéro plus grand) voyage de borne en borne et
//   remplace l'ancienne. Personne d'autre ne peut se dire modérateur.
// - Les décisions : masquer une ligne, mettre un joueur en sourdine (1 h, 24 h, 7 jours), l'exclure
//   des salons, lever une décision, poser le sujet d'un salon. Chacune est signée par la clé d'un
//   modérateur de la charte et voyage comme les lignes ; chaque borne l'applique : une ligne masquée
//   ne s'affiche plus, celles d'un joueur en sourdine ou exclu ne sont plus gardées ni relayées.
// - Les signalements : un joueur signale une ligne avec une raison ; le signalement, signé par lui,
//   joint la ligne signée (on ne peut pas l'inventer) et n'est lisible que des modérateurs (chiffré
//   pour chacun, social-net.ts). Le joueur signalé ne sait pas qui l'a signalé.
//
// Ici, rien du réseau ni du chiffrement : les formes, les signatures, les effets, le fichier
// <données>\amis\moderation.json (charte reçue, décisions, signalements reçus d'un modérateur).

import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { BUNDLED_CHARTER } from './moderation-charter';
import { cleanRoomText, isRoomId, verifyRoomLine, type RoomId, type RoomLine } from './rooms';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName } from './social';
import { UPDATE_PUBLIC_KEY } from './update-key';

/** Raisons d'un signalement ou d'une décision. */
export const MOD_REASONS = ['insults', 'spam', 'shocking', 'personal', 'other'] as const;
export type ModReason = (typeof MOD_REASONS)[number];
/** Durées de sourdine proposées : 1 h, 24 h, 7 jours. */
export const MUTE_HOURS = [1, 24, 168] as const;
/** Sujet d'un salon : une ligne, 120 caractères au plus. */
export const TOPIC_MAX = 120;
/** Décisions gardées (les plus récentes), et signalements gardés par un modérateur. */
export const MOD_ACTS_MAX = 2000;
export const REPORTS_MAX = 500;
/** Un signalement s'oublie après 30 jours. */
export const REPORT_KEEP_DAYS = 30;
const FUTURE_MS = 60_000;
const DAY = 86_400_000;

export interface Charter {
  /** Numéro de la charte : la plus grande l'emporte. */
  version: number;
  /** Clés publiques des modérateurs. */
  moderators: string[];
  at: string;
  /** Signature de la clé du projet (base64). */
  sig: string;
}

export type ModActKind = 'hide' | 'mute' | 'ban' | 'lift' | 'topic';

export interface ModAct {
  id: string;
  /** Le modérateur qui décide (sa clé, dans la charte). */
  by: string;
  kind: ModActKind;
  /** hide : l'identifiant de la ligne ; mute, ban : la clé du joueur ; lift : l'identifiant de la décision levée. */
  target?: string;
  /** Le nom du joueur visé (mute, ban), pour le dire à l'écran. */
  name?: string;
  /** topic : le salon et son sujet (vide : plus de sujet). */
  room?: RoomId;
  text?: string;
  /** mute : jusqu'à quand. */
  until?: string;
  reason?: ModReason;
  at: string;
  sig: string;
}

export interface ModReport {
  id: string;
  /** Le joueur qui signale, et son nom. */
  by: string;
  name: string;
  /** La ligne signalée, telle qu'elle a été signée par son auteur. */
  line: RoomLine;
  reason: ModReason;
  at: string;
  sig: string;
}

const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isReason = (v: unknown): v is ModReason => typeof v === 'string' && (MOD_REASONS as readonly string[]).includes(v);
const newId = () => randomBytes(8).toString('hex');

// ---------------------------------------------------------------------------
// Charte

function charterText(c: Omit<Charter, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'moderation-charter', version: c.version, moderators: c.moderators, at: c.at });
}

/** Signe une charte avec la clé privée du projet (PEM) : scripts/charte-moderation.mjs, jamais l'application. */
export function signCharter(base: Omit<Charter, 'sig'>, projectPrivateKeyPem: string): Charter {
  return { ...base, sig: sign(null, Buffer.from(charterText(base), 'utf8'), createPrivateKey(projectPrivateKeyPem)).toString('base64') };
}

/** Charte reçue : forme et signature de la clé du projet vérifiées ; undefined sinon. */
export function verifyCharter(raw: unknown, projectPublicKeyPem = UPDATE_PUBLIC_KEY): Charter | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || !Number.isSafeInteger(r.version) || r.version < 1 || !Array.isArray(r.moderators) || r.moderators.length > 100 || !r.moderators.every(isPlayerPublicKey) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  const base = { version: r.version, moderators: r.moderators as string[], at: r.at };
  try {
    return verify(null, Buffer.from(charterText(base), 'utf8'), createPublicKey(projectPublicKeyPem), Buffer.from(r.sig, 'base64')) ? { ...base, sig: r.sig } : undefined;
  } catch {
    return undefined;
  }
}

export const isModerator = (charter: Charter, key: string) => charter.moderators.includes(key);

// ---------------------------------------------------------------------------
// Décisions

function actText(a: Omit<ModAct, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'moderation', id: a.id, by: a.by, act: a.kind, target: a.target ?? null, name: a.name ?? null, room: a.room ?? null, text: a.text ?? null, until: a.until ?? null, reason: a.reason ?? null, at: a.at });
}

/** Ma décision de modérateur, signée maintenant. */
export function signModAct(me: PlayerKey, act: Omit<ModAct, 'id' | 'by' | 'at' | 'sig'>, now = new Date()): ModAct {
  const base: Omit<ModAct, 'sig'> = { id: newId(), by: me.publicKey, ...act, at: now.toISOString() };
  return { ...base, sig: signText(actText(base), me) };
}

/** Décision reçue : forme, signature, et son auteur dans la charte ; undefined sinon. */
export function verifyModAct(raw: unknown, charter: Charter, now = new Date()): ModAct | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kinds: readonly unknown[] = ['hide', 'mute', 'ban', 'lift', 'topic'];
  if (!isId(r.id) || !isPlayerPublicKey(r.by) || !kinds.includes(r.kind) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (!isModerator(charter, r.by) || Date.parse(r.at) > now.getTime() + FUTURE_MS) return undefined;
  const kind = r.kind as ModActKind;
  if ((kind === 'hide' || kind === 'lift') && !isId(r.target)) return undefined;
  if ((kind === 'mute' || kind === 'ban') && !isPlayerPublicKey(r.target)) return undefined;
  if (kind === 'mute' && !isIso(r.until)) return undefined;
  if (kind === 'topic' && (!isRoomId(r.room) || typeof r.text !== 'string' || (r.text !== '' && cleanRoomText(r.text) !== r.text) || [...r.text].length > TOPIC_MAX)) return undefined;
  if (r.reason !== undefined && !isReason(r.reason)) return undefined;
  const name = r.name === undefined ? undefined : normalizeName(r.name);
  if (r.name !== undefined && name !== r.name) return undefined;
  const act: ModAct = {
    id: r.id,
    by: r.by,
    kind,
    ...(typeof r.target === 'string' ? { target: r.target } : {}),
    ...(name ? { name } : {}),
    ...(typeof r.room === 'string' ? { room: r.room } : {}),
    ...(typeof r.text === 'string' ? { text: r.text } : {}),
    ...(typeof r.until === 'string' ? { until: r.until } : {}),
    ...(r.reason ? { reason: r.reason as ModReason } : {}),
    at: r.at,
    sig: r.sig,
  };
  const { sig, ...base } = act;
  return verifyText(actText(base), sig, act.by) ? act : undefined;
}

/** Les décisions encore en vigueur : ni levées, ni (sourdine) arrivées à leur fin. */
export function activeActs(acts: readonly ModAct[], now = new Date()): ModAct[] {
  const lifted = new Set(acts.filter((a) => a.kind === 'lift').map((a) => a.target));
  return acts.filter((a) => a.kind !== 'lift' && !lifted.has(a.id) && !(a.kind === 'mute' && Date.parse(a.until!) <= now.getTime()));
}

/** Cette ligne est-elle masquée par la modération ? */
export const lineHidden = (acts: readonly ModAct[], lineId: string, now = new Date()) => activeActs(acts, now).some((a) => a.kind === 'hide' && a.target === lineId);

/** La sanction qui empêche ce joueur d'écrire maintenant (exclusion, ou sourdine en cours) ; undefined : aucune. */
export function sanctionOf(acts: readonly ModAct[], key: string, now = new Date()): ModAct | undefined {
  const active = activeActs(acts, now).filter((a) => a.target === key && (a.kind === 'ban' || a.kind === 'mute'));
  return active.find((a) => a.kind === 'ban') ?? active.sort((a, b) => Date.parse(b.until!) - Date.parse(a.until!))[0];
}

/**
 * Une ligne est-elle refusée par la modération ? Son auteur exclu, ou en sourdine au moment où elle
 * a été écrite (la décision la précède et court encore à cette heure-là). Les lignes d'avant restent.
 */
export function lineRefused(acts: readonly ModAct[], line: Pick<RoomLine, 'key' | 'at'>): boolean {
  const at = Date.parse(line.at);
  const lifted = new Set(acts.filter((a) => a.kind === 'lift').map((a) => a.target));
  return acts.some((a) => !lifted.has(a.id) && a.target === line.key && ((a.kind === 'ban' && Date.parse(a.at) <= at) || (a.kind === 'mute' && Date.parse(a.at) <= at && at < Date.parse(a.until!))));
}

/** Le sujet d'un salon : le dernier posé, s'il n'est ni vide ni levé. */
export function roomTopic(acts: readonly ModAct[], room: RoomId, now = new Date()): ModAct | undefined {
  const last = activeActs(acts, now)
    .filter((a) => a.kind === 'topic' && a.room === room)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return last?.text ? last : undefined;
}

// ---------------------------------------------------------------------------
// Signalements

function reportText(r: Omit<ModReport, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'report', id: r.id, by: r.by, name: r.name, line: r.line.id, lineSig: r.line.sig, reason: r.reason, at: r.at });
}

export function signReport(me: { key: PlayerKey; name: string }, line: RoomLine, reason: ModReason, now = new Date()): ModReport {
  const base: Omit<ModReport, 'sig'> = { id: newId(), by: me.key.publicKey, name: me.name, line, reason, at: now.toISOString() };
  return { ...base, sig: signText(reportText(base), me.key) };
}

/** Signalement reçu (déchiffré) : sa signature, et celle de la ligne jointe ; undefined sinon. */
export function verifyReport(raw: unknown, now = new Date()): ModReport | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  if (!isId(r.id) || !isPlayerPublicKey(r.by) || !name || name !== r.name || !isReason(r.reason) || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (Date.parse(r.at) > now.getTime() + FUTURE_MS || now.getTime() - Date.parse(r.at) > REPORT_KEEP_DAYS * DAY) return undefined;
  // La ligne jointe : vérifiée sans limite d'âge propre (celle du signalement suffit).
  const line = verifyRoomLine(r.line, new Date(Date.parse((r.line as { at?: string })?.at ?? '') + 1000));
  if (!line) return undefined;
  const report: ModReport = { id: r.id, by: r.by, name, line, reason: r.reason, at: r.at, sig: r.sig };
  const { sig, ...base } = report;
  return verifyText(reportText(base), sig, report.by) ? report : undefined;
}

// ---------------------------------------------------------------------------
// État de la borne

export interface ModerationState {
  version: 1;
  /** La charte la plus récente connue (la livrée, ou une reçue plus récente). */
  charter: Charter;
  acts: ModAct[];
  /** Signalements reçus (modérateur seulement) ; `handled` : traité (décision prise, ou classé sans suite). */
  reports: (ModReport & { handled?: string })[];
}

export const moderationFile = (dataDir: string) => path.join(dataDir, 'amis', 'moderation.json');

export function bundledCharter(): Charter {
  return verifyCharter(BUNDLED_CHARTER) ?? { version: 0, moderators: [], at: new Date(0).toISOString(), sig: '' };
}

export function newModerationState(): ModerationState {
  return { version: 1, charter: bundledCharter(), acts: [], reports: [] };
}

export function loadModeration(dataDir: string, now = new Date()): ModerationState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(moderationFile(dataDir), 'utf8'));
  } catch {
    return newModerationState();
  }
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bundled = bundledCharter();
  const kept = verifyCharter(s.charter);
  const charter = kept && kept.version > bundled.version ? kept : bundled;
  const acts = (Array.isArray(s.acts) ? s.acts : []).map((a) => verifyModAct(a, charter, now)).filter((a): a is ModAct => !!a);
  const reports = (Array.isArray(s.reports) ? s.reports : [])
    .map((r) => {
      const v = verifyReport(r, now);
      const handled = (r as { handled?: unknown })?.handled;
      return v ? { ...v, ...(isIso(handled) ? { handled } : {}) } : undefined;
    })
    .filter((r): r is ModReport & { handled?: string } => !!r);
  return tidyModeration({ version: 1, charter, acts, reports }, now);
}

export function saveModeration(dataDir: string, s: ModerationState): void {
  writeFileAtomic(moderationFile(dataDir), JSON.stringify(s));
}

/** Ménage : les décisions qui ne servent plus (sourdines finies depuis 7 jours), au plus 2 000 ; les signalements de plus de 30 jours. */
export function tidyModeration(s: ModerationState, now = new Date()): ModerationState {
  const old = now.getTime() - 7 * DAY;
  const acts = s.acts.filter((a) => !(a.kind === 'mute' && Date.parse(a.until!) < old)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-MOD_ACTS_MAX);
  const reports = s.reports.filter((r) => now.getTime() - Date.parse(r.at) <= REPORT_KEEP_DAYS * DAY).slice(-REPORTS_MAX);
  return acts.length === s.acts.length && reports.length === s.reports.length ? s : { ...s, acts, reports };
}

/** Une charte reçue : gardée si elle est plus récente ; les décisions d'anciens modérateurs restent valables. */
export function mergeCharter(s: ModerationState, charter: Charter): ModerationState | undefined {
  return charter.version > s.charter.version ? { ...s, charter } : undefined;
}

/** Décisions reçues, déjà vérifiées : rend les nouvelles, à relayer. */
export function mergeModActs(s: ModerationState, acts: readonly ModAct[], now = new Date()): { state: ModerationState; fresh: ModAct[] } {
  const known = new Set(s.acts.map((a) => a.id));
  const fresh = acts.filter((a) => !known.has(a.id) && (known.add(a.id), true));
  return fresh.length ? { state: tidyModeration({ ...s, acts: [...s.acts, ...fresh] }, now), fresh } : { state: s, fresh };
}

/** Signalements reçus (modérateur) : rend les nouveaux. */
export function mergeReports(s: ModerationState, reports: readonly ModReport[], now = new Date()): { state: ModerationState; fresh: ModReport[] } {
  const known = new Set(s.reports.map((r) => r.id));
  const fresh = reports.filter((r) => !known.has(r.id) && (known.add(r.id), true));
  return fresh.length ? { state: tidyModeration({ ...s, reports: [...s.reports, ...fresh] }, now), fresh } : { state: s, fresh };
}

/** Les décisions à donner au bonjour : celles en vigueur, et les levées (pour qu'une borne en retard les apprenne). */
export function actsSample(s: ModerationState, now = new Date()): ModAct[] {
  const active = activeActs(s.acts, now);
  const lifts = s.acts.filter((a) => a.kind === 'lift');
  return [...active, ...lifts].slice(-200);
}

/**
 * Signalements à traiter, regroupés par ligne : le premier signalement de chaque ligne, le nombre
 * de joueurs qui l'ont signalée, les plus signalées d'abord, puis les plus récentes.
 */
export function pendingReports(s: ModerationState): { line: RoomLine; reports: ModReport[] }[] {
  const by = new Map<string, ModReport[]>();
  for (const r of s.reports) if (!r.handled) by.set(r.line.id, [...(by.get(r.line.id) ?? []), r]);
  return [...by.values()]
    .map((list) => ({ line: list[0]!.line, reports: list }))
    .sort((a, b) => b.reports.length - a.reports.length || Date.parse(b.reports.at(-1)!.at) - Date.parse(a.reports.at(-1)!.at));
}

/** Les signalements de cette ligne sont traités. */
export function handleReports(s: ModerationState, lineId: string, now = new Date()): ModerationState {
  return { ...s, reports: s.reports.map((r) => (r.line.id === lineId && !r.handled ? { ...r, handled: now.toISOString() } : r)) };
}
