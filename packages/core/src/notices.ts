// Notifications du menu des tables : un seul mécanisme pour tout ce qui arrive pendant qu'on
// choisit une table (un ami qui se connecte, une demande d'ami, un téléchargement fini…).
//
// - Les évènements sont nommés (NoticeKind) et viennent de deux relevés comparés d'un instant à
//   l'autre : celui du réseau des amis (socialNotices) et celui de la file des téléchargements
//   (downloadNotices). Une nouvelle source n'ajoute qu'un relevé et une règle (NOTICE_RULES).
// - Une seule notification à l'écran, jamais d'empilement : la file attend, par priorité. Les
//   évènements d'un même genre arrivés ensemble (ou pendant qu'une autre se montre) n'en font
//   qu'une (« 3 amis viennent de se connecter ») ; trois genres ou plus qui attendent ensemble,
//   au retour d'une partie par exemple, font un résumé unique (« 4 nouveautés »).
// - Rien ne se montre quand l'écran ne s'y prête pas (partie, chargement, mode attente, mode
//   invité, écran plein, constat bref déjà affiché) : l'évènement attend, puis expire (ttl) ou
//   n'a plus lieu d'être (l'ami est reparti, la demande a reçu sa réponse : `still`).
// - Le même évènement n'est pas redit avant un délai (connexions qui vont et viennent).
// Le processus principal (app/src/menu-notices.ts) fournit l'horloge et dessine `view`.

import { t, tn, formatNumber } from './i18n';
import type { IconName } from './icons';
import type { DownloadJob } from './downloadqueue';
import type { SocialEvent, SocialState, Presence } from './social';

export type NoticeKind = 'friend-request' | 'friend-accepted' | 'download-failed' | 'download-done' | 'friend-online' | 'friend-playing' | 'friend-record' | 'friend-badge';

/** Bleu méta : une information ; vert : une réussite ; ambre : à voir ; rouge : bloqué (revue de Codex, 29/10/2026). */
export type NoticeTone = 'ok' | 'info' | 'warning' | 'error';

/** Ce qu'un clic sur la notification ouvre (action du menu des tables). */
export type NoticeAct = { type: 'friends' } | { type: 'friend-requests' } | { type: 'downloads' };

export interface NoticeEvent {
  kind: NoticeKind;
  /** Ce qui est annoncé (clé de l'ami, identifiant du téléchargement, de l'évènement) : jamais deux fois le même. */
  key: string;
  /** Moment de l'évènement (ms). */
  at: number;
  /** Nom de l'ami. */
  who?: string;
  /** Titre de la table, nom du téléchargement. */
  subject?: string;
  /** Précision : score, place, raison d'un échec, nom d'un badge. */
  extra?: string;
  /** Provenance d'un téléchargement (l'ami, le site). */
  from?: string;
}

export interface NoticeRule {
  /** Plus petit : plus urgent. */
  priority: number;
  /** Au-delà, un évènement qui n'a pas pu se montrer est oublié. */
  ttlMs: number;
  /** Le même évènement (genre + key) n'est pas redit avant ce délai. */
  quietMs: number;
  icon: IconName;
  tone: NoticeTone;
  act: NoticeAct;
}

const MIN = 60_000;

export const NOTICE_RULES: Readonly<Record<NoticeKind, NoticeRule>> = {
  'friend-request': { priority: 0, ttlMs: 60 * MIN, quietMs: 24 * 60 * MIN, icon: 'friend-request', tone: 'warning', act: { type: 'friend-requests' } },
  'friend-accepted': { priority: 1, ttlMs: 60 * MIN, quietMs: 24 * 60 * MIN, icon: 'friends', tone: 'ok', act: { type: 'friends' } },
  'download-failed': { priority: 2, ttlMs: 60 * MIN, quietMs: 60 * MIN, icon: 'alert', tone: 'error', act: { type: 'downloads' } },
  'download-done': { priority: 3, ttlMs: 30 * MIN, quietMs: 60 * MIN, icon: 'check', tone: 'ok', act: { type: 'downloads' } },
  'friend-online': { priority: 4, ttlMs: 10 * MIN, quietMs: 15 * MIN, icon: 'friends', tone: 'info', act: { type: 'friends' } },
  'friend-record': { priority: 5, ttlMs: 30 * MIN, quietMs: 24 * 60 * MIN, icon: 'star', tone: 'ok', act: { type: 'friends' } },
  'friend-badge': { priority: 6, ttlMs: 30 * MIN, quietMs: 24 * 60 * MIN, icon: 'medal', tone: 'ok', act: { type: 'friends' } },
  'friend-playing': { priority: 7, ttlMs: 5 * MIN, quietMs: 20 * MIN, icon: 'play', tone: 'info', act: { type: 'friends' } },
};

/** Durée à l'écran, départ (fondu de frontend.css, .notice-toast.leaving) et pause avant la suivante. */
export const NOTICE_SHOW_MS = 6_000;
export const NOTICE_LEAVE_MS = 400;
export const NOTICE_GAP_MS = 800;
/** Un évènement attend ce délai avant de se montrer : ceux qui arrivent dans la foulée le rejoignent. */
export const NOTICE_GATHER_MS = 1_200;
/** Trois genres ou plus qui attendent ensemble : un seul résumé. */
export const NOTICE_DIGEST_KINDS = 3;
/** Au plus tant d'évènements en attente (les moins urgents, puis les plus anciens, partent). */
export const NOTICE_PENDING_MAX = 40;
/** Longueur du titre et de la précision : chacun tient sur une ligne (frontend.css, .notice-toast). */
export const NOTICE_TITLE_MAX = 40;
export const NOTICE_DETAIL_MAX = 56;
/** Un nom d'ami ou un titre de table dans une phrase. */
const NAME_MAX = 16;
const SUBJECT_MAX = 34;

/** Ce que le menu des tables dessine (app/renderer/frontend.js, noticeToast). */
export interface NoticeView {
  /** Le même id d'un rendu à l'autre : la notification ne rejoue pas son entrée. */
  id: string;
  icon: IconName;
  tone: NoticeTone;
  title: string;
  detail?: string;
  act?: NoticeAct;
  /** En train de s'estomper. */
  leaving?: boolean;
}

/** Réglage du menu système (mediaview.ts, MenuMediaSettings.notices). */
export type NoticesMode = 'all' | 'count' | 'off';
export const NOTICES_MODES: readonly NoticesMode[] = ['all', 'count', 'off'];

// ---------------------------------------------------------------------------
// Textes

/** Coupe au mot près sans le dépasser, avec « … » ; jamais au milieu d'un caractère composé. */
export function shortened(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…';
}

/** « Bruno, Chloé et David », puis « Bruno, Chloé et 3 autres » dans la longueur permise. */
export function nameList(names: readonly string[], max = NOTICE_DETAIL_MAX): string {
  const all = [...new Set(names.map((n) => shortened(n, NAME_MAX)))];
  const join = (shown: string[], rest: number) => {
    if (!rest) return shown.length > 1 ? t('{list} et {last}', { list: shown.slice(0, -1).join(', '), last: shown[shown.length - 1]! }) : (shown[0] ?? '');
    return tn(rest, '{list} et {n} autre', '{list} et {n} autres', { list: shown.join(', ') });
  };
  for (let shown = all.length; shown >= 1; shown--) {
    const text = join(all.slice(0, shown), all.length - shown);
    if ([...text].length <= max) return text;
  }
  return shortened(join(all.slice(0, 1), all.length - 1), max);
}

/** Les sujets à la suite, « · » entre eux, dans la longueur permise. */
function subjectList(subjects: readonly string[]): string {
  const all = [...new Set(subjects.filter(Boolean))];
  const fits = (s: string) => [...s].length <= NOTICE_DETAIL_MAX;
  // Le plus de sujets entiers possible ; ceux qui ne tiennent pas, « … » à la suite.
  for (let shown = all.length; shown >= 1; shown--) {
    const text = all.slice(0, shown).join(' · ') + (shown < all.length ? ' · …' : '');
    if (fits(text)) return text;
  }
  return all.length ? shortened(all[0]!, NOTICE_DETAIL_MAX) : '';
}

const capitalized = (s: string | undefined) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : '');
const who = (e: NoticeEvent) => shortened(e.who ?? '?', NAME_MAX);
const subject = (e: NoticeEvent) => shortened(e.subject ?? '', SUBJECT_MAX);

/** Titre et précision d'un groupe d'évènements du même genre (le premier est le plus ancien). */
export function noticeText(kind: NoticeKind, events: readonly NoticeEvent[]): { title: string; detail?: string } {
  const one = events.length === 1 ? events[0] : undefined;
  const n = events.length;
  const names = () => nameList(events.map((e) => e.who ?? '?'));
  const fit = (r: { title: string; detail?: string }) => ({ title: shortened(r.title, NOTICE_TITLE_MAX), ...(r.detail ? { detail: shortened(r.detail, NOTICE_DETAIL_MAX) } : {}) });
  switch (kind) {
    case 'friend-online':
      return fit(one ? { title: t('{name} vient de se connecter', { name: who(one) }) } : { title: tn(n, '{n} ami vient de se connecter', '{n} amis viennent de se connecter'), detail: names() });
    case 'friend-request':
      return fit(one ? { title: t('Demande d’ami : {name}', { name: who(one) }), detail: t('Menu système > Amis > Demandes d’amis') } : { title: tn(n, '{n} demande d’ami', '{n} demandes d’ami'), detail: names() });
    case 'friend-accepted':
      return fit(one ? { title: t('{name} a accepté votre demande', { name: who(one) }), detail: t('Vous êtes maintenant amis') } : { title: tn(n, '{n} demande acceptée', '{n} demandes acceptées'), detail: names() });
    case 'friend-playing':
      return fit(one ? { title: t('{name} lance une partie', { name: who(one) }), ...(one.subject ? { detail: subject(one) } : {}) } : { title: tn(n, '{n} ami lance une partie', '{n} amis lancent une partie'), detail: names() });
    case 'friend-record':
      return fit(one ? { title: t('Nouveau record de {name}', { name: who(one) }), detail: [subject(one), one.extra].filter(Boolean).join(' · ') } : { title: tn(n, '{n} record de vos amis', '{n} records de vos amis'), detail: names() });
    case 'friend-badge':
      return fit(one ? { title: t('Badge de {name}', { name: who(one) }), ...(one.extra ? { detail: one.extra } : {}) } : { title: tn(n, '{n} badge pour vos amis', '{n} badges pour vos amis'), detail: names() });
    case 'download-done':
      return fit(one ? { title: t('Téléchargement fini'), detail: [subject(one), one.from ? t('de {name}', { name: shortened(one.from, NAME_MAX) }) : ''].filter(Boolean).join(' · ') } : { title: tn(n, '{n} téléchargement fini', '{n} téléchargements finis'), detail: subjectList(events.map(subject)) });
    case 'download-failed':
      // La cause d'abord : c'est elle qui doit rester lisible quand la place manque.
      return fit(one ? { title: t('Téléchargement bloqué'), detail: [capitalized(one.extra), subject(one)].filter(Boolean).join(' · ') } : { title: tn(n, '{n} téléchargement bloqué', '{n} téléchargements bloqués'), detail: subjectList(events.map(subject)) });
  }
}

/** Une ligne du résumé : « 2 amis connectés », « 1 téléchargement fini »… */
function digestPart(kind: NoticeKind, n: number): string {
  switch (kind) {
    case 'friend-online':
      return tn(n, '{n} ami connecté', '{n} amis connectés');
    case 'friend-request':
      return tn(n, '{n} demande d’ami', '{n} demandes d’ami');
    case 'friend-accepted':
      return tn(n, '{n} nouvel ami', '{n} nouveaux amis');
    case 'friend-playing':
      return tn(n, '{n} partie lancée', '{n} parties lancées');
    case 'friend-record':
      return tn(n, '{n} record', '{n} records');
    case 'friend-badge':
      return tn(n, '{n} badge', '{n} badges');
    case 'download-done':
      return tn(n, '{n} téléchargement fini', '{n} téléchargements finis');
    case 'download-failed':
      return tn(n, '{n} téléchargement bloqué', '{n} téléchargements bloqués');
  }
}

/** Résumé de plusieurs genres, du plus urgent au moins urgent. */
export function digestText(groups: readonly { kind: NoticeKind; events: readonly NoticeEvent[] }[]): { title: string; detail: string } {
  const total = groups.reduce((sum, g) => sum + g.events.length, 0);
  return { title: tn(total, '{n} nouveauté', '{n} nouveautés'), detail: subjectList(groups.map((g) => digestPart(g.kind, g.events.length))) };
}

// ---------------------------------------------------------------------------
// File

export interface NoticeContext {
  /** Le menu des tables est à l'écran, rien ne s'y oppose (partie, attente, invité, écran plein, constat). */
  canShow: boolean;
  /** L'évènement a-t-il encore lieu d'être (l'ami encore en ligne, la demande encore là) ? */
  still?: (e: NoticeEvent) => boolean;
}

export interface NoticeTick {
  view?: NoticeView;
  /** Quand rappeler tick (ms, même horloge) ; undefined : rien n'attend. */
  nextAt?: number;
}

interface Showing {
  id: string;
  view: NoticeView;
  shownAt: number;
}

export interface NoticeCenter {
  push(events: readonly NoticeEvent[]): void;
  /** L'état à l'instant `now` : la notification à dessiner, et quand repasser. */
  tick(now: number, ctx: NoticeContext): NoticeTick;
  /** Dit ailleurs (un bandeau) : pas redit avant son délai, retiré s'il attendait. */
  said(kind: NoticeKind, key: string, at: number): void;
  /** Tout oublier (réglage coupé). */
  clear(): void;
  /** Évènements en attente (essais, journal). */
  pending(): readonly NoticeEvent[];
}

const byUrgency = (a: NoticeEvent, b: NoticeEvent) => NOTICE_RULES[a.kind].priority - NOTICE_RULES[b.kind].priority || a.at - b.at;
const identity = (e: Pick<NoticeEvent, 'kind' | 'key'>) => `${e.kind}|${e.key}`;

export function createNoticeCenter(): NoticeCenter {
  let pending: NoticeEvent[] = [];
  /** Dernière fois qu'un évènement a été annoncé (ou retenu pour l'être), par genre + key. */
  const said = new Map<string, number>();
  let showing: Showing | undefined;
  /** Fin du dernier départ : la suivante attend NOTICE_GAP_MS. */
  let freeAt = 0;
  let serial = 0;

  function push(events: readonly NoticeEvent[]): void {
    for (const e of events) {
      const id = identity(e);
      const last = said.get(id);
      if (last !== undefined && e.at - last < NOTICE_RULES[e.kind].quietMs) continue;
      if (pending.some((p) => identity(p) === id)) continue;
      said.set(id, e.at);
      pending.push(e);
    }
    if (pending.length > NOTICE_PENDING_MAX) pending = [...pending].sort(byUrgency).slice(0, NOTICE_PENDING_MAX);
  }

  function tick(now: number, ctx: NoticeContext): NoticeTick {
    const still = ctx.still ?? (() => true);
    pending = pending.filter((e) => now - e.at <= NOTICE_RULES[e.kind].ttlMs && still(e));
    // Plus le droit de se montrer (partie lancée, écran plein ouvert) : celle à l'écran est vue, elle part tout de suite.
    if (!ctx.canShow) {
      if (showing) freeAt = now;
      showing = undefined;
      return { nextAt: nextExpiry() };
    }
    if (showing) {
      const leaveAt = showing.shownAt + NOTICE_SHOW_MS;
      const goneAt = leaveAt + NOTICE_LEAVE_MS;
      if (now < leaveAt) return { view: showing.view, nextAt: leaveAt };
      if (now < goneAt) return { view: { ...showing.view, leaving: true }, nextAt: goneAt };
      showing = undefined;
      freeAt = goneAt;
    }
    if (!pending.length) return {};
    // Le plus ancien attend d'avoir rassemblé ceux qui arrivent dans la foulée.
    const readyAt = Math.max(freeAt + NOTICE_GAP_MS, Math.min(...pending.map((e) => e.at)) + NOTICE_GATHER_MS);
    if (now < readyAt) return { nextAt: readyAt };
    const groups = groupsOf(pending);
    let view: Omit<NoticeView, 'id'>;
    if (groups.length >= NOTICE_DIGEST_KINDS) {
      // Résumé : tout ce qui attend, en une fois ; un clic mène au plus urgent.
      const text = digestText(groups);
      const first = NOTICE_RULES[groups[0]!.kind];
      view = { icon: 'info', tone: 'info', title: text.title, detail: text.detail, act: first.act };
      pending = [];
    } else {
      const group = groups[0]!;
      const rule = NOTICE_RULES[group.kind];
      view = { icon: rule.icon, tone: rule.tone, ...noticeText(group.kind, group.events), act: rule.act };
      pending = pending.filter((e) => e.kind !== group.kind);
    }
    serial++;
    showing = { id: `n${serial}`, view: { id: `n${serial}`, ...view }, shownAt: now };
    return { view: showing.view, nextAt: now + NOTICE_SHOW_MS };
  }

  function nextExpiry(): number | undefined {
    if (!pending.length) return undefined;
    return Math.min(...pending.map((e) => e.at + NOTICE_RULES[e.kind].ttlMs)) + 1;
  }

  return {
    push,
    tick,
    said: (kind, key, at) => {
      said.set(identity({ kind, key }), at);
      pending = pending.filter((e) => identity(e) !== identity({ kind, key }));
    },
    clear: () => {
      pending = [];
      showing = undefined;
    },
    pending: () => pending,
  };
}

/** Les évènements par genre, du plus urgent au moins urgent ; chaque groupe dans l'ordre d'arrivée. */
function groupsOf(events: readonly NoticeEvent[]): { kind: NoticeKind; events: NoticeEvent[] }[] {
  const map = new Map<NoticeKind, NoticeEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) map.set(e.kind, [...(map.get(e.kind) ?? []), e]);
  return [...map.entries()].map(([kind, list]) => ({ kind, events: list })).sort((a, b) => NOTICE_RULES[a.kind].priority - NOTICE_RULES[b.kind].priority);
}

// ---------------------------------------------------------------------------
// Relevés : ce qui a changé d'un instant à l'autre

/** Relevé du réseau des amis, fait par le processus principal (social-net.ts). */
export interface SocialSnapshot {
  /** Partage activé. */
  enabled: boolean;
  /** Amis : clé → nom. */
  friends: ReadonlyMap<string, string>;
  /** Amis reliés en ce moment : clé → présence (undefined tant qu'elle n'est pas reçue). */
  online: ReadonlyMap<string, Presence | undefined>;
  /** Demandes reçues : clé → nom. */
  incoming: ReadonlyMap<string, string>;
  /** Demandes envoyées : clés. */
  outgoing: ReadonlySet<string>;
  /** Évènements des amis déjà vus : identifiants. */
  events: ReadonlySet<string>;
}

export function socialSnapshot(state: SocialState, online: (key: string) => boolean, presenceOf: (key: string) => Presence | undefined): SocialSnapshot {
  const friends = new Map(state.friends.map((f) => [f.key, f.name]));
  return {
    enabled: state.enabled,
    friends,
    online: new Map(state.friends.filter((f) => online(f.key)).map((f) => [f.key, presenceOf(f.key)])),
    incoming: new Map(state.incoming.map((r) => [r.key, r.name])),
    outgoing: new Set(state.outgoing.map((r) => r.key)),
    events: new Set(state.friends.flatMap((f) => f.events.map((e) => e.id))),
  };
}

/**
 * Juste après le démarrage, les amis déjà en ligne se relient à la borne : c'est elle qui arrive,
 * pas eux. Leurs connexions ne sont pas annoncées (la pastille les compte).
 */
export const NOTICE_STARTUP_QUIET_MS = 10_000;

/** Un record ou un badge plus vieux que ça (renvoyé par un ami qui se reconnecte) n'est pas une nouvelle. */
export const FRIEND_EVENT_FRESH_MS = 15 * MIN;

/**
 * Ce qui a changé dans le réseau des amis entre deux relevés. Le premier relevé (prev
 * undefined) ne dit rien : ce qui était déjà là au démarrage n'est pas une nouvelle.
 */
export function socialNotices(prev: SocialSnapshot | undefined, next: SocialSnapshot, state: Pick<SocialState, 'friends'>, now: number, badgeLabel: (id: string) => string = (id) => id): NoticeEvent[] {
  if (!prev || !next.enabled) return [];
  const out: NoticeEvent[] = [];
  const name = (key: string) => next.friends.get(key) ?? next.incoming.get(key) ?? '?';
  for (const [key, presence] of next.online) {
    // Un ami tout juste accepté est annoncé comme tel (ou pas du tout, si c'est nous qui avons accepté).
    if (!prev.friends.has(key)) continue;
    if (!prev.online.has(key)) out.push({ kind: 'friend-online', key, at: now, who: name(key) });
    // Une partie lancée par un ami déjà en ligne (sa présence passe à « playing »).
    else if (presence?.status === 'playing' && prev.online.get(key)?.status !== 'playing' && prev.online.get(key) !== undefined)
      out.push({ kind: 'friend-playing', key: `${key}|${presence.since}`, at: now, who: name(key), ...(presence.table ? { subject: presence.table.title } : {}) });
  }
  for (const [key, who] of next.incoming) if (!prev.incoming.has(key)) out.push({ kind: 'friend-request', key, at: now, who });
  for (const key of next.friends.keys()) if (prev.outgoing.has(key) && !prev.friends.has(key)) out.push({ kind: 'friend-accepted', key, at: now, who: name(key) });
  for (const f of state.friends) {
    if (!prev.friends.has(f.key)) continue; // un nouvel ami envoie ses derniers évènements : déjà annoncé comme ami
    for (const e of f.events) {
      if (prev.events.has(e.id) || now - Date.parse(e.at) > FRIEND_EVENT_FRESH_MS) continue;
      const ev = friendEventNotice(f.name, e, now, badgeLabel);
      if (ev) out.push(ev);
    }
  }
  return out;
}

function friendEventNotice(who: string, e: SocialEvent, now: number, badgeLabel: (id: string) => string): NoticeEvent | undefined {
  if (e.kind === 'record' && e.table && e.score !== undefined) {
    const extra = e.rank === 1 ? formatNumber(e.score) : t('place {rank}', { rank: e.rank ?? '?' });
    return { kind: 'friend-record', key: e.id, at: now, who, subject: e.table.title, extra };
  }
  if (e.kind === 'badge' && e.badge) return { kind: 'friend-badge', key: e.id, at: now, who, extra: badgeLabel(e.badge) };
  return undefined;
}

/** Relevé de la file des téléchargements : identifiant → état. */
export type DownloadSnapshot = ReadonlyMap<string, DownloadJob['state']>;

export function downloadSnapshot(jobs: readonly DownloadJob[]): DownloadSnapshot {
  return new Map(jobs.map((j) => [j.id, j.state]));
}

/**
 * Téléchargements finis ou bloqués depuis le relevé précédent. Ceux qu'un écran fait tourner
 * sous les yeux de l'utilisateur (attached : VPX, mise à jour, yt-dlp) ne sont pas annoncés :
 * leur écran le dit. Le premier relevé ne dit rien (ce qui était fini au démarrage).
 */
export function downloadNotices(prev: DownloadSnapshot | undefined, jobs: readonly DownloadJob[], now: number, reason: (j: DownloadJob) => string | undefined = () => undefined): NoticeEvent[] {
  if (!prev) return [];
  const out: NoticeEvent[] = [];
  for (const j of jobs) {
    const before = prev.get(j.id);
    if (j.attached || before === j.state) continue;
    const from = j.source.label ? { from: j.source.label } : {};
    if (j.state === 'done' && before !== undefined) out.push({ kind: 'download-done', key: j.id, at: now, subject: j.title, ...from });
    else if (j.state === 'failed') {
      const extra = reason(j);
      out.push({ kind: 'download-failed', key: j.id, at: now, subject: j.title, ...from, ...(extra ? { extra } : {}) });
    }
  }
  return out;
}

/** Pastille des amis en ligne ; undefined quand aucun ami n'est en ligne (ou le partage coupé). */
export function friendsOnlineView(snap: SocialSnapshot): { count: number; title: string } | undefined {
  if (!snap.enabled || !snap.online.size) return undefined;
  const names = [...snap.online.keys()].map((k) => snap.friends.get(k) ?? '?');
  return { count: names.length, title: tn(names.length, '{n} ami en ligne : {names}', '{n} amis en ligne : {names}', { names: nameList(names, 200) }) };
}
