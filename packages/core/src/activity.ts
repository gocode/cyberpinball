// Activité récente (Menu système > Activité récente, app/src/activity-menu.ts) : le journal des
// notifications, pour relire celles qu'on a manquées. Une notification ne reste à l'écran que
// quelques secondes, se raccourcit pour tenir sur sa ligne, attend la fin d'une partie ou se fond
// dans un résumé (« 4 nouveautés ») : ici, chacune est gardée en entier.
//
// - Chaque évènement des notifications (notices.ts : un ami qui se connecte, une invitation, un
//   invité qui décline, une partie entre amis finie, un téléchargement fini ou bloqué) entre au
//   journal dès qu'il arrive, affiché ou retenu (partie en cours, notifications masquées) ; de même
//   une mise à jour disponible ou installée et les constats du démarrage (`note`). On garde ce qui
//   le décrit, pas sa phrase : le texte se refait dans la langue du moment, entier (noticeText,
//   `full`).
// - Ce qui se répète dans la journée ne fait qu'une ligne (« Bruno : 3 connexions ») : les
//   connexions d'un ami, ses parties lancées sur une même table, un téléchargement qui rebloque.
//   Un même évènement redit (un relevé qui revient) ne compte pas deux fois.
// - Au plus ACTIVITY_MAX lignes : les plus anciennes déjà lues partent d'abord, puis les plus
//   anciennes. Le fichier (<données>\activite.json) garde tout d'un démarrage à l'autre ; illisible,
//   il est mis de côté, jamais écrasé (readKeptJson).
// - Non lu : ce que la notification ou le constat n'a pas dit en entier (retenu puis expiré, fondu
//   dans un résumé, notifications coupées). Les erreurs restent non lues jusqu'à ce qu'on les voie
//   à l'écran, même dites (ACTIVITY_KEEP_UNREAD) : une ligne est vue quand le curseur s'y pose
//   (revue de Codex : pas tout d'un coup à l'ouverture). Le non-lu se marque dans l'écran seulement.
// - Jamais de pastille rouge (retour du 06/11/2026 : « une mise à jour installée » au redémarrage,
//   une connexion d'ami, et la pastille qui remontait par la rubrique Amis pour une mise à jour,
//   c'était trop) : ce qui attend une réponse a déjà la sienne là où on y répond (demandes d'ami et
//   invitation dans Amis, téléchargement fini ou bloqué dans Téléchargements, version disponible ou
//   mise à jour qui n'a pas abouti dans Mises à jour) ; la redoubler ici, c'est deux pastilles pour
//   une chose, ou une pastille au mauvais endroit. Le non-lu se marque dans l'écran seulement.
// - L'action de chaque ligne (activityAct) : la fiche de l'ami, l'invitation, l'écran de la partie
//   ou son détail à l'historique, le gestionnaire de téléchargements, une entrée du menu système.
//   L'application dit si elle vaut encore ; sinon la ligne reste, grisée avec sa raison.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t, tn } from './i18n';
import type { IconName } from './icons';
import { NOTICE_RULES, noticeText, type LiveNoticeReason, type NoticeEvent, type NoticeKind, type NoticeTone } from './notices';
import { tagId } from './livenotices';
import type { LiveInviteEnd } from './livegame';
import { readKeptJson } from './store';
import { writeFileAtomic } from './atomicwrite';
import { SYSTEM_ITEM_IDS, type SystemItemId } from './systemmenu';

/** Lignes gardées. */
export const ACTIVITY_MAX = 50;
/** Heures gardées d'une ligne qui se répète (les plus récentes), pour les dire (« à 21:31, 19:02 et 14:10 »). */
export const ACTIVITY_TIMES_MAX = 5;
export const ACTIVITY_VERSION = 1;
export const ACTIVITY_FILE = 'activite.json';

/** Ce qui n'est pas une notification du menu : une version disponible, une mise à jour faite ou manquée, un constat du démarrage. */
export type ActivityNoteKind = 'update-available' | 'update-installed' | 'update-failed' | 'note';
export type ActivityKind = NoticeKind | ActivityNoteKind;

/** Ce que Start fait sur la ligne. */
export type ActivityAct =
  /** La fiche de l'ami. */
  | { type: 'friend'; key: string }
  /** Une demande d'ami : les demandes si elle attend, sa fiche s'il est devenu un ami. */
  | { type: 'friend-request'; key: string }
  /** Une invitation reçue (son écran, tant qu'elle vaut). */
  | { type: 'invite'; id: string }
  /** La partie entre amis : son écran tant qu'elle est en cours, puis son détail à l'historique. */
  | { type: 'live-game'; id: string }
  /** Un téléchargement : le gestionnaire. */
  | { type: 'download'; id: string }
  /** Une entrée du menu système (Mise à jour de Cyber Pinball, Configuration de la borne…). */
  | { type: 'system'; item: SystemItemId };

/** Ce qui décrit une ligne, gardé tel quel : le texte se refait à l'affichage. */
export interface ActivityFacts {
  /** Clé de l'évènement (notices.ts, NoticeEvent.key) : jamais deux fois le même. */
  key: string;
  who?: string;
  player?: string;
  subject?: string;
  extra?: string;
  from?: string;
  reason?: LiveNoticeReason;
  end?: LiveInviteEnd;
  won?: true;
  place?: { rank: number; of: number };
  /** Une version (mise à jour) : celle d'avant, et celle d'après. */
  version?: string;
  previous?: string;
  /** Constat du démarrage (`note`) : son texte, déjà dans la langue du moment où il est dit. */
  text?: string;
  /** Constat : l'entrée du menu système qu'il nomme. */
  item?: SystemItemId;
}

export interface ActivityEntry extends ActivityFacts {
  /** Identité de la ligne : son genre, ce qu'elle regroupe, son jour. */
  id: string;
  kind: ActivityKind;
  /** Dernière fois (ms). */
  at: number;
  /** Fois regroupées sur la ligne (1 : une seule). */
  count: number;
  /** Heures des dernières fois, la plus récente d'abord (au plus ACTIVITY_TIMES_MAX). */
  times: number[];
  /** Vue : dite en entier par la notification, ou l'écran ouvert. */
  read: boolean;
}

export interface ActivityLog {
  v: number;
  /** La plus récente d'abord. */
  entries: ActivityEntry[];
}

export const emptyActivity = (): ActivityLog => ({ v: ACTIVITY_VERSION, entries: [] });

/** Ce qui se répète dans la journée et ne fait qu'une ligne : la clé de ce qui est regroupé. */
function repeatKey(kind: ActivityKind, f: ActivityFacts): string | undefined {
  switch (kind) {
    case 'friend-online':
      return f.player ?? f.key;
    case 'friend-playing':
      // Ses parties sur une même table : la clé de l'évènement porte l'heure du lancement.
      return `${f.player ?? f.key.split('|')[0]}|${f.subject ?? ''}`;
    case 'download-failed':
      return f.key;
    default:
      return undefined;
  }
}

/** Les erreurs : non lues jusqu'à ce qu'on les voie dans l'écran, même dites par la notification ou le constat. */
export const ACTIVITY_KEEP_UNREAD: ReadonlySet<ActivityKind> = new Set<ActivityKind>(['download-failed', 'update-failed']);

/** Le jour local d'un instant : « 2026-11-06 ». */
export function activityDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function identity(kind: ActivityKind, f: ActivityFacts, at: number): string {
  return `${kind}|${repeatKey(kind, f) ?? f.key}|${activityDay(at)}`;
}

/** Les faits d'un évènement des notifications, sans ce qui n'a pas à être gardé. */
export function activityFacts(e: NoticeEvent): ActivityFacts {
  return {
    key: e.key,
    ...(e.who !== undefined ? { who: e.who } : {}),
    ...(e.player ? { player: e.player } : {}),
    ...(e.subject ? { subject: e.subject } : {}),
    ...(e.extra ? { extra: e.extra } : {}),
    ...(e.from ? { from: e.from } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.end ? { end: e.end } : {}),
    ...(e.won ? { won: true as const } : {}),
    ...(e.place ? { place: { ...e.place } } : {}),
  };
}

export interface ActivityAdd {
  kind: ActivityKind;
  facts: ActivityFacts;
  at: number;
  /** Déjà vue en entier (notifications coupées : ce qui ne compte pas reste lu). */
  read?: boolean;
}

/**
 * Consigne un évènement. Il rejoint la ligne de ce qui se répète ce jour-là (une fois de plus), ou
 * celle du même évènement déjà consigné (rien ne compte double), sinon il en fait une nouvelle.
 * La ligne remonte en tête, non lue. Rend la ligne.
 */
export function addActivity(log: ActivityLog, add: ActivityAdd): ActivityEntry {
  const id = identity(add.kind, add.facts, add.at);
  const found = log.entries.find((x) => x.id === id);
  const repeats = repeatKey(add.kind, add.facts) !== undefined;
  let entry: ActivityEntry;
  if (found) {
    // Le même évènement, redit (la même clé, un relevé qui revient) : la ligne ne compte pas une fois de plus.
    const again = repeats && !(found.key === add.facts.key && add.at - found.at < NOTICE_QUIET_MS(add.kind));
    entry = {
      ...found,
      ...add.facts,
      at: Math.max(found.at, add.at),
      count: again ? found.count + 1 : found.count,
      times: again ? [add.at, ...found.times].slice(0, ACTIVITY_TIMES_MAX) : found.times,
      // Une fois de plus : à revoir, sauf déjà vue ; le même évènement redit garde ce qu'on en a vu.
      read: again ? (add.read ?? false) : found.read || (add.read ?? false),
    };
    log.entries = log.entries.filter((x) => x !== found);
  } else {
    entry = { id, kind: add.kind, ...add.facts, at: add.at, count: 1, times: [add.at], read: add.read ?? false };
  }
  log.entries = [entry, ...log.entries].sort((a, b) => b.at - a.at);
  trimActivity(log);
  return entry;
}

/** Délai sous lequel le même évènement redit n'est pas une fois de plus (celui des notifications). */
function NOTICE_QUIET_MS(kind: ActivityKind): number {
  return kind in NOTICE_RULES ? NOTICE_RULES[kind as NoticeKind].quietMs : 0;
}

/** Au plus ACTIVITY_MAX lignes : les plus anciennes déjà lues partent d'abord, puis les plus anciennes. */
export function trimActivity(log: ActivityLog, max = ACTIVITY_MAX): void {
  if (log.entries.length <= max) return;
  let over = log.entries.length - max;
  const drop = new Set<ActivityEntry>();
  for (const pass of [true, false]) {
    for (let i = log.entries.length - 1; i >= 0 && over > 0; i--) {
      const e = log.entries[i]!;
      if (drop.has(e) || (pass && !e.read)) continue;
      drop.add(e);
      over--;
    }
  }
  log.entries = log.entries.filter((e) => !drop.has(e));
}

/**
 * La notification vient de dire ces évènements en entier : lus, sauf les erreurs et les fins de
 * téléchargement (ACTIVITY_KEEP_UNREAD). Ceux d'un résumé (« 4 nouveautés ») restent non lus.
 * Rend vrai si quelque chose a changé.
 */
export function markActivityShown(log: ActivityLog, events: readonly Pick<NoticeEvent, 'kind' | 'key' | 'at' | 'player' | 'subject'>[]): boolean {
  let changed = false;
  for (const e of events) {
    if (ACTIVITY_KEEP_UNREAD.has(e.kind)) continue;
    const id = identity(e.kind, { key: e.key, ...(e.player ? { player: e.player } : {}), ...(e.subject ? { subject: e.subject } : {}) }, e.at);
    const entry = log.entries.find((x) => x.id === id);
    if (entry && !entry.read) {
      entry.read = true;
      changed = true;
    }
  }
  return changed;
}

/** Vues à l'écran (le curseur s'y est posé), ou toutes (`ids` absent). Rend vrai si quelque chose a changé. */
export function markActivityRead(log: ActivityLog, ids?: readonly string[]): boolean {
  let changed = false;
  for (const e of log.entries) {
    if (e.read || (ids && !ids.includes(e.id))) continue;
    e.read = true;
    changed = true;
  }
  return changed;
}

export const activityUnread = (log: ActivityLog): number => log.entries.filter((e) => !e.read).length;

// ---------------------------------------------------------------------------
// Ce que dit une ligne

/** Icône et ton d'une ligne : ceux de sa notification. */
export function activityLook(e: Pick<ActivityEntry, 'kind'>): { icon: IconName; tone: NoticeTone } {
  // Bloqué : la croix rouge et son mot (« Téléchargement bloqué »), comme tout état bloquant du design system (revue de Codex).
  if (e.kind === 'download-failed') return { icon: 'close', tone: 'error' };
  if (e.kind in NOTICE_RULES) {
    const rule = NOTICE_RULES[e.kind as NoticeKind];
    return { icon: rule.icon, tone: rule.tone };
  }
  switch (e.kind as ActivityNoteKind) {
    case 'update-available':
      return { icon: 'upgrade', tone: 'info' };
    case 'update-installed':
      return { icon: 'upgrade', tone: 'ok' };
    case 'update-failed':
      return { icon: 'alert', tone: 'error' };
    default:
      return { icon: 'info', tone: 'info' };
  }
}

/** Le texte entier d'une ligne, dans la langue du moment ; ce qui se répète le dit (« Bruno : 3 connexions »). */
export function activityText(e: ActivityEntry): { title: string; detail?: string } {
  if (e.kind in NOTICE_RULES) {
    const kind = e.kind as NoticeKind;
    const { id: _id, count: _count, times: _times, read: _read, kind: _kind, version: _v, previous: _p, text: _t, item: _i, ...facts } = e;
    const event: NoticeEvent = { ...facts, kind };
    const said = noticeText(kind, [event], { full: true });
    // Le chemin « Menu système > … » que la notification donne pour y aller : ici, Start y mène, la ligne ne le redit pas.
    const path = t('Menu système');
    const rest = said.detail?.split(' · ').filter((part) => !part.includes(path)).join(' · ');
    const text = { title: said.title, ...(rest ? { detail: rest.charAt(0).toLocaleUpperCase() + rest.slice(1) } : {}) };
    if (e.count > 1) {
      const name = e.who ?? '?';
      // « Chloé : 3 connexions » (revue de Codex) : le jour est celui de la section, et rien ne s'accorde au nom.
      if (kind === 'friend-online') return { title: tn(e.count, '{name} : {n} connexion', '{name} : {n} connexions', { name }) };
      if (kind === 'friend-playing') return { title: tn(e.count, '{name} : {n} partie lancée', '{name} : {n} parties lancées', { name }), ...(e.subject ? { detail: e.subject } : {}) };
      if (kind === 'download-failed') return { title: t('Téléchargement bloqué {n} fois', { n: e.count }), ...(text.detail ? { detail: text.detail } : {}) };
    }
    return text;
  }
  switch (e.kind as ActivityNoteKind) {
    case 'update-available':
      return { title: t('Cyber Pinball {version} est disponible', { version: e.version ?? '?' }), ...(e.previous ? { detail: t('Vous avez la version {version}', { version: e.previous }) } : {}) };
    case 'update-installed':
      return { title: t('Cyber Pinball {version} est installé', { version: e.version ?? '?' }), ...(e.previous ? { detail: t('Avant : {version}', { version: e.previous }) } : {}) };
    case 'update-failed':
      return { title: t('La mise à jour vers {version} n’a pas abouti', { version: e.version ?? '?' }), ...(e.previous ? { detail: t('La version {version} est restée en place', { version: e.previous }) } : {}) };
    default:
      return { title: e.text ?? '' };
  }
}

/** Ce que Start fait sur une ligne ; undefined : rien à ouvrir. */
export function activityAct(e: ActivityEntry): ActivityAct | undefined {
  switch (e.kind) {
    case 'live-invite':
      return { type: 'invite', id: tagId(e.key) };
    case 'live-invite-ended':
      return e.player ? { type: 'friend', key: e.player } : undefined;
    case 'live-finished':
    case 'live-cancelled':
    case 'live-accepted':
    case 'live-declined':
    case 'live-left':
      return { type: 'live-game', id: e.key.split('|')[0]! };
    case 'friend-request':
      return { type: 'friend-request', key: e.player ?? e.key };
    case 'friend-accepted':
    case 'friend-online':
    case 'friend-playing':
    case 'friend-record':
    case 'friend-badge':
      return e.player ? { type: 'friend', key: e.player } : undefined;
    case 'download-done':
    case 'download-failed':
      return { type: 'download', id: e.key };
    case 'update-available':
    case 'update-installed':
    case 'update-failed':
      return { type: 'system', item: 'updates' };
    default:
      return e.item ? { type: 'system', item: e.item } : undefined;
  }
}

// ---------------------------------------------------------------------------
// Le fichier

const KINDS = new Set<string>([...Object.keys(NOTICE_RULES), 'update-available', 'update-installed', 'update-failed', 'note']);
const REASONS: readonly LiveNoticeReason[] = ['missing', 'other-version', 'busy', 'expired', 'offline', 'failed'];
const ENDS: readonly LiveInviteEnd[] = ['cancelled', 'started', 'replaced', 'expired', 'offline', 'host-offline'];
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x08\x0b-\x1f\x7f]/.test(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= max;

/** Une ligne lue du fichier, vérifiée ; undefined : laissée de côté. */
export function parseActivityEntry(raw: unknown): ActivityEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isText(r.id, 400) || !isText(r.kind, 40) || !KINDS.has(r.kind) || !isText(r.key, 300) || !isTime(r.at) || !isCount(r.count, 1_000_000)) return undefined;
  const times = (Array.isArray(r.times) ? r.times : []).filter(isTime).slice(0, ACTIVITY_TIMES_MAX);
  const place = r.place as Record<string, unknown> | undefined;
  const text = (k: string, max = 200) => (isText(r[k], max) ? { [k]: r[k] as string } : {});
  return {
    id: r.id,
    kind: r.kind as ActivityKind,
    key: r.key,
    at: r.at,
    count: r.count,
    times: times.length ? times : [r.at],
    read: r.read === true,
    ...text('who', 80),
    ...text('player', 128),
    ...text('subject', 300),
    ...text('extra', 300),
    ...text('from', 120),
    ...text('version', 60),
    ...text('previous', 60),
    ...text('text', 600),
    ...(REASONS.includes(r.reason as LiveNoticeReason) ? { reason: r.reason as LiveNoticeReason } : {}),
    ...(ENDS.includes(r.end as LiveInviteEnd) ? { end: r.end as LiveInviteEnd } : {}),
    ...(r.won === true ? { won: true as const } : {}),
    ...(place && typeof place === 'object' && isCount(place.rank, 99) && isCount(place.of, 99) ? { place: { rank: place.rank, of: place.of } } : {}),
    ...((SYSTEM_ITEM_IDS as readonly string[]).includes(r.item as string) ? { item: r.item as SystemItemId } : {}),
  };
}

/** Le journal gardé sur la borne ; illisible, il est mis de côté (`setAside`), jamais écrasé. */
export function loadActivity(file: string, now = new Date()): { log: ActivityLog; setAside?: string } {
  const { value, setAside } = readKeptJson(file, now);
  if (!value || typeof value !== 'object') return { log: emptyActivity(), ...(setAside ? { setAside } : {}) };
  const raw = value as Record<string, unknown>;
  const seen = new Set<string>();
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .map(parseActivityEntry)
    .filter((e): e is ActivityEntry => !!e && !seen.has(e.id) && !!seen.add(e.id))
    .sort((a, b) => b.at - a.at);
  const log = { v: ACTIVITY_VERSION, entries };
  trimActivity(log);
  return { log };
}

export function saveActivity(file: string, log: ActivityLog): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(log, null, 1) + '\n');
}
