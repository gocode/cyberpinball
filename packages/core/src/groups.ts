// Groupes privés (Communauté, novembre 2026) : des cercles sur invitation, avec leur discussion, leur
// table de la semaine et leur classement. Ici, rien du réseau ni de l'écran : les formes, les
// signatures, l'appartenance, la fusion et le fichier de la borne (<données>\amis\groupes.json).
//
// Un groupe n'est qu'une suite de lignes signées chacune par son auteur : la création, les invitations,
// les arrivées, les départs, les messages, les réactions, les retraits et la table de la semaine. Chaque
// borne de membre garde toute la suite et en tire le groupe (groupView) en la rejouant dans l'ordre
// des dates : une ligne d'un joueur qui n'était pas membre à ce moment ne compte pas. Rien ne passe par
// une borne étrangère au groupe : les bornes des membres se relient directement par leur clé et
// s'échangent ce qui leur manque (app/src/group-service.ts), sur la liaison chiffrée du réseau des
// bornes. Un message écrit hors ligne attend sur la borne de son auteur ; celui d'un membre absent lui
// arrive par n'importe quel autre membre, à son retour.
//
// Règles :
// - privé : un groupe n'apparaît nulle part pour qui n'en est pas ; seul un ami peut être invité, par
//   n'importe quel membre ; l'invitation (la suite des lignes d'appartenance, sans les messages) part
//   à la borne de l'invité, qui l'accepte ou la refuse (« refusée », rien de plus) ;
// - le créateur peut retirer un membre ; chacun peut partir quand il veut ;
// - un message se supprime par son auteur, pour tous ; les réactions sont les sept de reactions.ts ;
// - limites d'envoi des salons (une ligne toutes les 3 s, 20 en 10 min) ; GROUP_MEMBERS_MAX membres.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileAtomic } from './atomicwrite';
import { isPlayerPublicKey, signText, verifyText, type PlayerKey } from './sharing';
import { normalizeName, type PresenceTable } from './social';
import { isReaction, type Reaction } from './reactions';

/** Nom d'un groupe, en caractères. */
export const GROUP_NAME_MAX = 32;
/** Longueur d'un message, en caractères (comme la messagerie). */
export const GROUP_TEXT_MAX = 500;
/** Membres au plus, invités en attente compris. */
export const GROUP_MEMBERS_MAX = 20;
/** Groupes gardés au plus sur une borne. */
export const GROUPS_MAX = 30;
/** Messages gardés au plus par groupe (les plus anciens partent d'abord ; jamais les lignes d'appartenance). */
export const GROUP_LINES_MAX = 3000;
/** Messages gardés un an. */
export const GROUP_KEEP_DAYS = 365;
/** Lignes par message du réseau, et identifiants donnés au plus pour dire ce qu'on a. */
export const GROUP_BATCH = 100;
export const GROUP_HAVE_MAX = 500;
/** Limites d'envoi par joueur : celles des salons (rooms.ts). */
export const GROUP_GAP_MS = 3000;
export const GROUP_BURST = 20;
export const GROUP_BURST_MS = 10 * 60_000;
/** Un groupe quitté reste sur la borne ce temps-là (son départ doit encore atteindre un membre), puis s'efface. */
export const GROUP_LEFT_KEEP_DAYS = 14;
/** Une invitation reçue sans réponse s'efface au bout de ce délai. */
export const GROUP_INVITE_DAYS = 30;
/** Table de la semaine : jusqu'au dimanche 23:59 qui vient, au moins deux jours ; au plus 14 jours. */
export const GROUP_WEEK_MAX_DAYS = 14;
const DAY = 86_400_000;
const FUTURE_MS = 10 * 60_000;

export type GroupBody =
  | { k: 'create'; name: string }
  | { k: 'invite'; who: string; whoName: string }
  | { k: 'join' }
  | { k: 'decline' }
  | { k: 'leave' }
  | { k: 'remove'; who: string }
  | { k: 'msg'; text: string }
  | { k: 'react'; target: string; kind: Reaction | null }
  | { k: 'del'; target: string }
  | { k: 'week'; table: PresenceTable; until: string };

export interface GroupLine {
  /** Identifiant tiré au hasard par l'auteur ; celui de la création est l'identifiant du groupe. */
  id: string;
  /** Le groupe. */
  g: string;
  /** Clé de l'auteur : il signe. */
  by: string;
  /** Son pseudo, son pays (drapeau) au moment d'écrire. */
  name: string;
  country?: string;
  at: string;
  body: GroupBody;
  sig: string;
}

export const isGroupId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isCountry = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
const newId = () => randomBytes(8).toString('hex');

/** Nom accepté : une ligne, sans caractère de contrôle, bords nettoyés, GROUP_NAME_MAX caractères au plus. */
export function cleanGroupName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > GROUP_NAME_MAX) return undefined;
  return name;
}

/** Texte accepté : celui de la messagerie (retours à la ligne gardés, deux au plus d'affilée). */
export function cleanGroupText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || [...text].length > GROUP_TEXT_MAX) return undefined;
  return text;
}

function parseTable(raw: unknown): PresenceTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' && r.title.length > 0 && r.title.length <= 120 ? r.title : undefined;
  if (!title) return undefined;
  const manufacturer = typeof r.manufacturer === 'string' && r.manufacturer.length > 0 && r.manufacturer.length <= 60 ? r.manufacturer : undefined;
  const year = typeof r.year === 'number' && Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2200 ? r.year : undefined;
  const vpsId = typeof r.vpsId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.vpsId) ? r.vpsId : undefined;
  return { title, ...(manufacturer ? { manufacturer } : {}), ...(year ? { year } : {}), ...(vpsId ? { vpsId } : {}) };
}

/** Le contenu d'une ligne, contrôlé ; undefined s'il est mal formé (il doit être déjà nettoyé : sinon la signature ne vaudrait pas). */
function parseBody(raw: unknown): GroupBody | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  switch (b.k) {
    case 'create': {
      const name = cleanGroupName(b.name);
      return name && name === b.name ? { k: 'create', name } : undefined;
    }
    case 'invite': {
      const whoName = normalizeName(b.whoName);
      return isPlayerPublicKey(b.who) && whoName && whoName === b.whoName ? { k: 'invite', who: b.who, whoName } : undefined;
    }
    case 'join':
    case 'decline':
    case 'leave':
      return { k: b.k };
    case 'remove':
      return isPlayerPublicKey(b.who) ? { k: 'remove', who: b.who } : undefined;
    case 'msg': {
      const text = cleanGroupText(b.text);
      return text && text === b.text ? { k: 'msg', text } : undefined;
    }
    case 'react':
      return isGroupId(b.target) && (b.kind === null || isReaction(b.kind)) ? { k: 'react', target: b.target, kind: b.kind as Reaction | null } : undefined;
    case 'del':
      return isGroupId(b.target) ? { k: 'del', target: b.target } : undefined;
    case 'week': {
      const table = parseTable(b.table);
      return table && isIso(b.until) ? { k: 'week', table, until: b.until } : undefined;
    }
    default:
      return undefined;
  }
}

function lineText(l: Omit<GroupLine, 'sig'>): string {
  return JSON.stringify({ app: 'cyberpinball', kind: 'group', id: l.id, g: l.g, by: l.by, name: l.name, country: l.country ?? null, at: l.at, body: l.body });
}

/** Ma ligne, signée. Le texte ou le nom est nettoyé d'abord ; undefined s'il est refusé (vide, trop long). */
export function signGroupLine(me: { key: PlayerKey; name: string; country?: string }, g: string, body: GroupBody, now = new Date(), id = newId()): GroupLine | undefined {
  let clean: GroupBody | undefined = body;
  if (body.k === 'msg') {
    const text = cleanGroupText(body.text);
    clean = text ? { k: 'msg', text } : undefined;
  } else if (body.k === 'create') {
    const name = cleanGroupName(body.name);
    clean = name ? { k: 'create', name } : undefined;
  }
  if (!clean) return undefined;
  const base: Omit<GroupLine, 'sig'> = { id, g, by: me.key.publicKey, name: me.name, ...(me.country ? { country: me.country } : {}), at: now.toISOString(), body: clean };
  return { ...base, sig: signText(lineText(base), me.key) };
}

/** Ligne reçue : forme et signature vérifiées ; une date dans le futur est refusée. */
export function verifyGroupLine(raw: unknown, now = new Date()): GroupLine | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const name = normalizeName(r.name);
  const body = parseBody(r.body);
  if (!isGroupId(r.id) || !isGroupId(r.g) || !isPlayerPublicKey(r.by) || !name || name !== r.name || !body || !isIso(r.at) || typeof r.sig !== 'string' || r.sig.length > 200) return undefined;
  if (r.country !== undefined && !isCountry(r.country)) return undefined;
  if (Date.parse(r.at) > now.getTime() + FUTURE_MS) return undefined;
  const line: GroupLine = { id: r.id, g: r.g, by: r.by, name, ...(r.country ? { country: r.country as string } : {}), at: r.at, body, sig: r.sig };
  const { sig, ...base } = line;
  return verifyText(lineText(base), sig, line.by) ? line : undefined;
}

// ---------------------------------------------------------------------------
// Le groupe, tiré de sa suite de lignes

export interface GroupMember {
  key: string;
  name: string;
  country?: string;
  /** Membre depuis (ISO). */
  since: string;
  creator?: true;
}

export interface GroupInvited {
  key: string;
  name: string;
  /** Qui l'a invité, et quand. */
  by: string;
  at: string;
  /** La ligne d'invitation. */
  line: string;
}

export interface GroupWeek {
  table: PresenceTable;
  /** Choisie par, le, jusqu'au. */
  by: string;
  byName: string;
  at: string;
  until: string;
}

export interface GroupView {
  id: string;
  name: string;
  creator: string;
  created: string;
  members: GroupMember[];
  invited: GroupInvited[];
  /** Anciens membres (partis ou retirés) : leurs messages restent, signés de leur nom. */
  former: Map<string, { name: string; how: 'left' | 'removed'; at: string }>;
  /** Refus d'invitation, par clé. */
  declined: Set<string>;
  /** La table de la semaine en cours (la dernière choisie, pas encore finie). */
  week?: GroupWeek;
  /** Les messages, dans l'ordre (retirés exclus). */
  messages: GroupLine[];
  /** Les réactions par message : la dernière de chaque auteur vaut. */
  reactions: Map<string, Map<string, Reaction>>;
  /** Les lignes comptées (valides à leur date) : seules celles-là se relaient. */
  valid: Set<string>;
}

const byDate = (a: GroupLine, b: GroupLine) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Le groupe tel que le disent ses lignes ; undefined sans sa ligne de création. */
export function groupView(lines: readonly GroupLine[], now = new Date()): GroupView | undefined {
  const create = lines.find((l) => l.body.k === 'create' && l.id === l.g);
  if (!create || create.body.k !== 'create') return undefined;
  const g = create.g;
  const members = new Map<string, GroupMember>([[create.by, { key: create.by, name: create.name, ...(create.country ? { country: create.country } : {}), since: create.at, creator: true }]]);
  const invited = new Map<string, GroupInvited>();
  const former = new Map<string, { name: string; how: 'left' | 'removed'; at: string }>();
  const declined = new Set<string>();
  const valid = new Set<string>([create.id]);
  const texts = new Map<string, GroupLine>();
  const reactions = new Map<string, Map<string, Reaction>>();
  let week: GroupWeek | undefined;
  for (const l of [...lines].filter((x) => x.g === g && x !== create).sort(byDate)) {
    const b = l.body;
    const member = members.get(l.by);
    // Le dernier pseudo et le dernier pays connus de chaque membre.
    if (member) {
      member.name = l.name;
      if (l.country) member.country = l.country;
    }
    switch (b.k) {
      case 'create':
        continue;
      case 'invite':
        if (!member || members.has(b.who) || invited.has(b.who) || members.size + invited.size >= GROUP_MEMBERS_MAX) continue;
        invited.set(b.who, { key: b.who, name: b.whoName, by: l.by, at: l.at, line: l.id });
        declined.delete(b.who);
        former.delete(b.who);
        break;
      case 'join': {
        if (!invited.has(l.by)) continue;
        invited.delete(l.by);
        members.set(l.by, { key: l.by, name: l.name, ...(l.country ? { country: l.country } : {}), since: l.at });
        break;
      }
      case 'decline':
        if (!invited.has(l.by)) continue;
        invited.delete(l.by);
        declined.add(l.by);
        break;
      case 'leave':
        if (!member) continue;
        members.delete(l.by);
        former.set(l.by, { name: member.name, how: 'left', at: l.at });
        break;
      case 'remove': {
        if (l.by !== create.by || b.who === create.by) continue;
        const gone = members.get(b.who);
        if (gone) {
          members.delete(b.who);
          former.set(b.who, { name: gone.name, how: 'removed', at: l.at });
        } else if (invited.has(b.who)) invited.delete(b.who);
        else continue;
        break;
      }
      case 'msg':
        if (!member) continue;
        texts.set(l.id, l);
        break;
      case 'react': {
        if (!member || !texts.has(b.target)) continue;
        const on = reactions.get(b.target) ?? new Map<string, Reaction>();
        if (b.kind) on.set(l.by, b.kind);
        else on.delete(l.by);
        reactions.set(b.target, on);
        break;
      }
      case 'del': {
        const target = texts.get(b.target);
        if (!member || !target || target.by !== l.by) continue;
        texts.delete(b.target);
        reactions.delete(b.target);
        break;
      }
      case 'week': {
        const until = Date.parse(b.until);
        const at = Date.parse(l.at);
        if (!member || until <= at || until - at > GROUP_WEEK_MAX_DAYS * DAY) continue;
        week = { table: b.table, by: l.by, byName: l.name, at: l.at, until: b.until };
        break;
      }
    }
    valid.add(l.id);
  }
  return {
    id: g,
    name: create.body.name,
    creator: create.by,
    created: create.at,
    members: [...members.values()],
    invited: [...invited.values()],
    former,
    declined,
    ...(week && Date.parse(week.until) > now.getTime() ? { week } : {}),
    messages: [...texts.values()],
    reactions,
    valid,
  };
}

export const isMember = (v: GroupView, key: string) => v.members.some((m) => m.key === key);
export const isInvited = (v: GroupView, key: string) => v.invited.some((i) => i.key === key);

/**
 * Ce qu'il faut à un invité pour voir le groupe avant d'accepter : les lignes d'appartenance comptées
 * (création, invitations, arrivées, départs, retraits, refus) et la dernière table de la semaine ;
 * jamais les messages.
 */
export function invitationLines(lines: readonly GroupLine[], now = new Date()): GroupLine[] {
  const v = groupView(lines, now);
  if (!v) return [];
  const structural = lines.filter((l) => v.valid.has(l.id) && l.body.k !== 'msg' && l.body.k !== 'react' && l.body.k !== 'del' && l.body.k !== 'week');
  const week = v.week ? lines.filter((l) => l.body.k === 'week' && v.valid.has(l.id)).sort(byDate).at(-1) : undefined;
  return [...structural, ...(week ? [week] : [])].sort(byDate);
}

/** Empreinte d'une liste d'identifiants : deux bornes qui ont les mêmes lignes ont la même. */
export function groupDigest(ids: Iterable<string>): string {
  return createHash('sha256').update([...ids].sort().join(',')).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Messages du réseau (entre les bornes des membres, et vers un ami invité)

export type GroupMessage =
  /** Des lignes d'un groupe. */
  | { t: 'grp'; lines: GroupLine[] }
  /** Ce que j'ai d'un groupe, en une empreinte : différente chez l'autre, il dit ce qu'il a. */
  | { t: 'grp-sum'; g: string; h: string }
  /** Les identifiants que j'ai d'un groupe (les plus récents) : l'autre m'envoie ce qui me manque. */
  | { t: 'grp-have'; g: string; ids: string[] }
  /** Une invitation, à la borne d'un ami : les lignes d'appartenance du groupe. */
  | { t: 'grp-invite'; lines: GroupLine[] }
  /** L'invitation est arrivée (l'identifiant de sa ligne). */
  | { t: 'grp-invite-ok'; ids: string[] };

export function parseGroupMessage(m: Record<string, unknown>): GroupMessage | undefined {
  switch (m.t) {
    case 'grp':
    case 'grp-invite': {
      if (!Array.isArray(m.lines)) return undefined;
      const lines = m.lines.slice(0, GROUP_BATCH).filter((l): l is GroupLine => !!l && typeof l === 'object');
      return lines.length ? { t: m.t, lines } : undefined;
    }
    case 'grp-sum':
      return isGroupId(m.g) && typeof m.h === 'string' && /^[0-9a-f]{16}$/.test(m.h) ? { t: 'grp-sum', g: m.g, h: m.h } : undefined;
    case 'grp-have':
      return isGroupId(m.g) && Array.isArray(m.ids) ? { t: 'grp-have', g: m.g, ids: m.ids.slice(0, GROUP_HAVE_MAX).filter(isGroupId) } : undefined;
    case 'grp-invite-ok':
      return Array.isArray(m.ids) ? { t: 'grp-invite-ok', ids: m.ids.slice(0, GROUP_BATCH).filter(isGroupId) } : undefined;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// L'état de la borne

export interface GroupEntry {
  lines: GroupLine[];
  /** Messages reçus pas encore vus. */
  unread: number;
  /** Ses messages arrivent sans carte ni son. */
  muted?: true;
  /** Je l'ai quitté, ou j'en ai été retiré, le (ISO) : il s'efface passé GROUP_LEFT_KEEP_DAYS. */
  gone?: string;
}

export interface GroupInvitation {
  /** Le groupe, qui m'invite (clé d'un ami), quand l'invitation est arrivée. */
  g: string;
  from: string;
  arrived: string;
  /** Les lignes d'appartenance (invitationLines), mon invitation comprise. */
  lines: GroupLine[];
}

export interface GroupsState {
  version: 1;
  groups: Record<string, GroupEntry>;
  /** Invitations reçues, en attente de ma réponse, par groupe. */
  invitations: Record<string, GroupInvitation>;
  /** Mes invitations déjà remises à la borne de l'invité (identifiants de leur ligne). */
  delivered: string[];
  /** Mes refus : la ligne part vers qui m'a invité, jusqu'à son accusé. */
  outbox: { to: string; line: GroupLine }[];
}

export const newGroupsState = (): GroupsState => ({ version: 1, groups: {}, invitations: {}, delivered: [], outbox: [] });
export const groupsFile = (dataDir: string) => path.join(dataDir, 'amis', 'groupes.json');

export function loadGroups(dataDir: string, now = new Date()): GroupsState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(groupsFile(dataDir), 'utf8'));
  } catch {
    return newGroupsState();
  }
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lines = (list: unknown) => (Array.isArray(list) ? list : []).map((l) => verifyGroupLine(l, now)).filter((l): l is GroupLine => !!l);
  const groups: Record<string, GroupEntry> = {};
  for (const [g, value] of Object.entries(s.groups && typeof s.groups === 'object' ? (s.groups as Record<string, unknown>) : {})) {
    if (!isGroupId(g) || !value || typeof value !== 'object') continue;
    const e = value as Record<string, unknown>;
    const own = lines(e.lines).filter((l) => l.g === g);
    if (!own.length) continue;
    groups[g] = {
      lines: own,
      unread: typeof e.unread === 'number' && Number.isInteger(e.unread) && e.unread >= 0 ? e.unread : 0,
      ...(e.muted === true ? { muted: true as const } : {}),
      ...(isIso(e.gone) ? { gone: e.gone } : {}),
    };
  }
  const invitations: Record<string, GroupInvitation> = {};
  for (const [g, value] of Object.entries(s.invitations && typeof s.invitations === 'object' ? (s.invitations as Record<string, unknown>) : {})) {
    if (!isGroupId(g) || !value || typeof value !== 'object') continue;
    const i = value as Record<string, unknown>;
    if (!isPlayerPublicKey(i.from) || !isIso(i.arrived)) continue;
    const own = lines(i.lines).filter((l) => l.g === g);
    if (own.length) invitations[g] = { g, from: i.from, arrived: i.arrived, lines: own };
  }
  const delivered = (Array.isArray(s.delivered) ? s.delivered : []).filter(isGroupId).slice(-500);
  const outbox = (Array.isArray(s.outbox) ? s.outbox : []).flatMap((o) => {
    const r = o as Record<string, unknown> | undefined;
    const line = r && isPlayerPublicKey(r.to) ? verifyGroupLine(r.line, now) : undefined;
    return line ? [{ to: r!.to as string, line }] : [];
  });
  return { version: 1, groups, invitations, delivered, outbox };
}

export function saveGroups(dataDir: string, s: GroupsState): void {
  writeFileAtomic(groupsFile(dataDir), JSON.stringify(s));
}

// ---------------------------------------------------------------------------
// Changements d'état (purs : chacun rend un nouvel état, ou le même s'il n'y a rien à faire)

const withGroup = (s: GroupsState, g: string, e: GroupEntry): GroupsState => ({ ...s, groups: { ...s.groups, [g]: e } });

/** Garder des lignes d'un groupe connu ; rend les nouvelles. Un message d'un autre, nouveau et compté, est non lu. */
export function mergeGroupLines(s: GroupsState, g: string, incoming: readonly GroupLine[], me: string, now = new Date()): { state: GroupsState; fresh: GroupLine[] } {
  const e = s.groups[g];
  if (!e) return { state: s, fresh: [] };
  const known = new Set(e.lines.map((l) => l.id));
  const fresh = incoming.filter((l) => l.g === g && !known.has(l.id) && (known.add(l.id), true));
  if (!fresh.length) return { state: s, fresh };
  const lines = [...e.lines, ...fresh].sort(byDate);
  const v = groupView(lines, now);
  const counted = v ? fresh.filter((l) => v.valid.has(l.id)) : [];
  const unread = e.unread + counted.filter((l) => l.body.k === 'msg' && l.by !== me).length;
  // Retiré du groupe par son créateur : il reste lisible un temps, puis s'efface.
  const out = v && !isMember(v, me) && !e.gone ? { gone: now.toISOString() } : {};
  return { state: withGroup(s, g, { ...e, lines: capLines(lines), unread, ...out }), fresh: counted };
}

/** Les messages au-delà de GROUP_LINES_MAX partent, les plus anciens d'abord ; les lignes d'appartenance restent toujours. */
function capLines(lines: GroupLine[]): GroupLine[] {
  const talk = lines.filter((l) => l.body.k === 'msg' || l.body.k === 'react' || l.body.k === 'del');
  if (talk.length <= GROUP_LINES_MAX) return lines;
  const drop = new Set(talk.slice(0, talk.length - GROUP_LINES_MAX).map((l) => l.id));
  return lines.filter((l) => !drop.has(l.id));
}

/** Ajouter une ligne à moi (déjà signée) à un groupe connu. */
export function addMine(s: GroupsState, line: GroupLine): GroupsState {
  const e = s.groups[line.g];
  if (!e || e.lines.some((l) => l.id === line.id)) return s;
  return withGroup(s, line.g, { ...e, lines: capLines([...e.lines, line].sort(byDate)) });
}

/** Un groupe tout neuf : ma ligne de création, puis mes invitations. */
export function createGroup(s: GroupsState, lines: readonly GroupLine[]): GroupsState {
  const g = lines[0]?.g;
  if (!g || s.groups[g]) return s;
  return withGroup(s, g, { lines: [...lines].sort(byDate), unread: 0 });
}

/** Une invitation reçue d'un ami : gardée si elle me vise vraiment (il est membre et m'invite). */
export function receiveInvitation(s: GroupsState, from: string, lines: readonly GroupLine[], me: string, now = new Date()): { state: GroupsState; fresh: boolean; ack: string[] } {
  const v = groupView(lines, now);
  const mine = v?.invited.find((i) => i.key === me && i.by === from);
  if (!v || !mine || !isMember(v, from)) return { state: s, fresh: false, ack: [] };
  const ack = [mine.line];
  // Déjà membre (une invitation renvoyée après mon arrivée) : rien de plus.
  const entry = s.groups[v.id];
  if (entry && !entry.gone) return { state: s, fresh: false, ack };
  const had = s.invitations[v.id];
  if (had && had.lines.some((l) => l.id === mine.line)) return { state: s, fresh: false, ack };
  return { state: { ...s, invitations: { ...s.invitations, [v.id]: { g: v.id, from, arrived: now.toISOString(), lines: [...lines].sort(byDate) } } }, fresh: true, ack };
}

/** J'accepte : le groupe entre sur ma borne avec ma ligne d'arrivée. */
export function acceptInvitation(s: GroupsState, g: string, join: GroupLine): GroupsState {
  const inv = s.invitations[g];
  if (!inv) return s;
  const { [g]: _, ...invitations } = s.invitations;
  const had = s.groups[g];
  const lines = [...new Map([...(had?.lines ?? []), ...inv.lines, join].map((l) => [l.id, l])).values()].sort(byDate);
  return { ...s, invitations, groups: { ...s.groups, [g]: { lines, unread: 0 } } };
}

/** Je refuse : l'invitation part, ma ligne de refus attend d'atteindre qui m'a invité. */
export function declineInvitation(s: GroupsState, g: string, decline: GroupLine): GroupsState {
  const inv = s.invitations[g];
  if (!inv) return s;
  const { [g]: _, ...invitations } = s.invitations;
  return { ...s, invitations, outbox: [...s.outbox, { to: inv.from, line: decline }].slice(-100) };
}

export function markDelivered(s: GroupsState, ids: readonly string[]): GroupsState {
  const fresh = ids.filter((id) => !s.delivered.includes(id));
  return fresh.length ? { ...s, delivered: [...s.delivered, ...fresh].slice(-500) } : s;
}

export function dropOutbox(s: GroupsState, ids: readonly string[]): GroupsState {
  const outbox = s.outbox.filter((o) => !ids.includes(o.line.id));
  return outbox.length === s.outbox.length ? s : { ...s, outbox };
}

/** Je pars : ma ligne de départ, et le groupe quitte ma liste (il reste le temps que le départ atteigne un membre). */
export function leaveGroup(s: GroupsState, line: GroupLine, now = new Date()): GroupsState {
  const e = s.groups[line.g];
  if (!e) return s;
  return withGroup(s, line.g, { ...e, lines: [...e.lines, line].sort(byDate), unread: 0, gone: now.toISOString() });
}

export function markGroupRead(s: GroupsState, g: string): GroupsState {
  const e = s.groups[g];
  return e && e.unread ? withGroup(s, g, { ...e, unread: 0 }) : s;
}

export function setGroupMuted(s: GroupsState, g: string, muted: boolean): GroupsState {
  const e = s.groups[g];
  if (!e || !!e.muted === muted) return s;
  const { muted: _, ...rest } = e;
  return withGroup(s, g, muted ? { ...rest, muted: true } : rest);
}

/** Comptes supprimés (forget.ts) : leurs invitations partent ; leurs lignes restent (le groupe en dépend), leur nom aussi. */
export function forgetInGroups(s: GroupsState, keys: ReadonlySet<string>): GroupsState {
  const invitations = Object.fromEntries(Object.entries(s.invitations).filter(([, i]) => !keys.has(i.from)));
  return Object.keys(invitations).length === Object.keys(s.invitations).length ? s : { ...s, invitations };
}

/**
 * Ménage : les messages de plus d'un an partent (jamais les lignes d'appartenance), un groupe quitté
 * s'efface passé GROUP_LEFT_KEEP_DAYS, une invitation sans réponse passé GROUP_INVITE_DAYS.
 */
export function tidyGroups(s: GroupsState, now = new Date()): GroupsState {
  const keep = now.getTime() - GROUP_KEEP_DAYS * DAY;
  let changed = false;
  const groups: Record<string, GroupEntry> = {};
  for (const [g, e] of Object.entries(s.groups)) {
    if (e.gone && now.getTime() - Date.parse(e.gone) > GROUP_LEFT_KEEP_DAYS * DAY) {
      changed = true;
      continue;
    }
    const lines = e.lines.filter((l) => !(l.body.k === 'msg' || l.body.k === 'react' || l.body.k === 'del') || Date.parse(l.at) >= keep);
    if (lines.length !== e.lines.length) changed = true;
    groups[g] = lines.length === e.lines.length ? e : { ...e, lines };
  }
  const invitations = Object.fromEntries(Object.entries(s.invitations).filter(([, i]) => now.getTime() - Date.parse(i.arrived) <= GROUP_INVITE_DAYS * DAY || ((changed = true), false)));
  return changed ? { ...s, groups, invitations } : s;
}

// ---------------------------------------------------------------------------
// Lecture pour les écrans

/** Mes groupes (ceux dont je suis membre), le plus récemment actif d'abord. */
export function myGroups(s: GroupsState, me: string, now = new Date()): { entry: GroupEntry; view: GroupView }[] {
  const out: { entry: GroupEntry; view: GroupView; last: number }[] = [];
  for (const entry of Object.values(s.groups)) {
    if (entry.gone) continue;
    const view = groupView(entry.lines, now);
    if (!view || !isMember(view, me)) continue;
    const last = Math.max(Date.parse(view.created), ...view.messages.map((l) => Date.parse(l.at)));
    out.push({ entry, view, last });
  }
  return out.sort((a, b) => b.last - a.last).map(({ entry, view }) => ({ entry, view }));
}

/** Fin de la table de la semaine choisie maintenant : le dimanche 23:59 qui vient, à au moins deux jours ; heure locale. */
export function weekEnd(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday);
  if (d.getTime() - now.getTime() < 2 * DAY) d.setDate(d.getDate() + 7);
  return d;
}

/** La table de la semaine est-elle celle-ci ? Même identifiant VPS, ou même titre. */
export function sameGroupTable(a: PresenceTable, b: PresenceTable): boolean {
  if (a.vpsId && b.vpsId) return a.vpsId === b.vpsId;
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
}

/** Mes envois récents : trop tôt, ou trop de lignes ? Les limites des salons. */
export function groupSendLimit(sent: readonly number[], now = Date.now()): 'gap' | 'burst' | undefined {
  const last = sent.at(-1);
  if (last !== undefined && now - last < GROUP_GAP_MS) return 'gap';
  if (sent.filter((t) => now - t < GROUP_BURST_MS).length >= GROUP_BURST) return 'burst';
  return undefined;
}
