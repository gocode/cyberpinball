// Activité récente (activity.ts, app/src/activity-menu.ts) : le journal des notifications. Ces
// tests fixent la classe de comportement :
// - toute notification y entre en entier, rien de raccourci, dans la langue du moment ;
// - ce qui se répète dans la journée ne fait qu'une ligne, un même évènement redit ne compte pas
//   deux fois, un autre jour fait une autre ligne ;
// - au plus ACTIVITY_MAX lignes, les plus anciennes déjà lues partent d'abord ;
// - le fichier garde tout d'un démarrage à l'autre ; illisible, il est mis de côté ; une ligne
//   abîmée est laissée de côté, les autres restent ;
// - non lu : ce que la notification n'a pas dit en entier (résumé, retenu) ; les erreurs le restent
//   jusqu'à l'écran ; l'écran ouvert lit tout ;
// - jamais de pastille rouge : ce qui attend a la sienne là où on y répond ; l'entrée en tête du
//   menu système et sous Cyber Pinball, plus dans Amis (retour du 06/11/2026) ;
// - chaque genre de notification a son icône, son texte et son action dans les deux langues.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import {
  ACTIVITY_KEEP_UNREAD,
  ACTIVITY_MAX,
  activityAct,
  activityFacts,
  activityLook,
  activityText,
  activityUnread,
  addActivity,
  emptyActivity,
  loadActivity,
  markActivityRead,
  markActivityShown,
  saveActivity,
  type ActivityEntry,
  type ActivityKind,
} from '../activity';
import { NOTICE_GATHER_MS, NOTICE_RULES, NOTICE_STARTUP_QUIET_MS, createNoticeCenter, noticeText, type NoticeEvent, type NoticeKind } from '../notices';
import { ZONE_SCREENS, noticeZone, type NoticeZone } from '../noticezone';
import { SYSTEM_GROUPS, SYSTEM_ROOT_SHORTCUTS } from '../systemmenu';
import { newSocialState } from '../social';
import { REPO_ROOT } from './i18n-scan';

const KINDS = Object.keys(NOTICE_RULES) as NoticeKind[];
const BRUNO = 'b'.repeat(64);
const DAY = 24 * 3600_000;
/** Un jeudi à 10 h, heure locale : les jours se comptent comme sur la borne. */
const T0 = new Date(2026, 10, 5, 10, 0, 0).getTime();
const ev = (kind: NoticeKind, key: string, at: number, extra: Partial<NoticeEvent> = {}): NoticeEvent => ({ kind, key, at, who: 'Bruno', player: BRUNO, ...extra });
const add = (log: ReturnType<typeof emptyActivity>, e: NoticeEvent, read?: boolean) => addActivity(log, { kind: e.kind, facts: activityFacts(e), at: e.at, ...(read !== undefined ? { read } : {}) });

test('activité : chaque notification entre en entier, sans rien de raccourci', () => {
  setLanguage('fr');
  const log = emptyActivity();
  const long = 'Bartholomé-Alexandre de la Tour';
  const table = 'The Addams Family Special Collectors Edition Gold (Bally 1994)';
  const e = ev('live-invite', '0123456789abcdef|0', T0, { who: long, subject: table });
  add(log, e);
  const text = activityText(log.entries[0]!);
  assert.equal(text.title, `${long} vous invite à rejoindre une partie`);
  assert.equal(text.detail, table);
  // La notification, elle, raccourcit pour tenir sur sa ligne : c'est ce qui se perd.
  assert.notEqual(noticeText('live-invite', [e]).title, text.title);
  assert.match(noticeText('live-invite', [e]).title, /…/);
  // Un téléchargement bloqué garde sa cause, sa table et sa provenance entières.
  add(log, { kind: 'download-failed', key: 'j1', at: T0 + 1, subject: table, extra: 'plus de place sur le disque D: (il manque 2,4 Go)', from: 'Bartholomé-Alexandre' });
  assert.equal(activityText(log.entries[0]!).detail, `Plus de place sur le disque D: (il manque 2,4 Go) · ${table}`);
});

test('activité : ce qui se répète dans la journée ne fait qu’une ligne ; un autre jour, une autre', () => {
  setLanguage('fr');
  const log = emptyActivity();
  add(log, ev('friend-online', BRUNO, T0));
  add(log, ev('friend-online', BRUNO, T0 + 3600_000));
  add(log, ev('friend-online', BRUNO, T0 + 7200_000));
  assert.equal(log.entries.length, 1);
  const line = log.entries[0]!;
  assert.equal(line.count, 3);
  assert.deepEqual(line.times, [T0 + 7200_000, T0 + 3600_000, T0]);
  assert.equal(activityText(line).title, 'Bruno : 3 connexions');
  // Le lendemain : une ligne à part, la plus récente en tête.
  add(log, ev('friend-online', BRUNO, T0 + DAY));
  assert.deepEqual(log.entries.map((e) => e.count), [1, 3]);
  assert.equal(activityText(log.entries[0]!).title, 'Bruno vient de se connecter');
  // Ses parties sur une même table se regroupent ; une autre table fait une autre ligne.
  add(log, ev('friend-playing', `${BRUNO}|1`, T0 + DAY + 10, { subject: 'Medieval Madness' }));
  add(log, ev('friend-playing', `${BRUNO}|2`, T0 + DAY + 20, { subject: 'Medieval Madness' }));
  add(log, ev('friend-playing', `${BRUNO}|3`, T0 + DAY + 30, { subject: 'Twilight Zone' }));
  assert.deepEqual(log.entries.filter((e) => e.kind === 'friend-playing').map((e) => [e.subject, e.count]), [['Twilight Zone', 1], ['Medieval Madness', 2]]);
  assert.equal(activityText(log.entries.find((e) => e.subject === 'Medieval Madness')!).title, 'Bruno : 2 parties lancées');
});

test('activité : un même évènement redit ne compte pas deux fois', () => {
  setLanguage('fr');
  const log = emptyActivity();
  // Un record renvoyé par un ami qui se reconnecte, une invitation relevée deux fois : une ligne, une fois.
  add(log, ev('friend-record', 'rec-1', T0, { subject: 'Medieval Madness', extra: '12 000 000' }));
  add(log, ev('friend-record', 'rec-1', T0 + 60_000, { subject: 'Medieval Madness', extra: '12 000 000' }));
  add(log, ev('live-invite', 'abcdefabcdefabcd|0', T0 + 1));
  add(log, ev('live-invite', 'abcdefabcdefabcd|0', T0 + 2));
  assert.deepEqual(log.entries.map((e) => [e.kind, e.count]), [['friend-record', 1], ['live-invite', 1]], 'redit, il remonte sans compter une fois de plus');
  // Le même téléchargement bloqué, relevé deux fois de suite : une fois ; rebloqué plus tard : deux fois.
  add(log, ev('download-failed', 'j1', T0 + 10, { who: undefined, player: undefined, subject: 'Twilight Zone' }));
  add(log, ev('download-failed', 'j1', T0 + 20, { who: undefined, player: undefined, subject: 'Twilight Zone' }));
  assert.equal(log.entries[0]!.count, 1);
  add(log, ev('download-failed', 'j1', T0 + NOTICE_RULES['download-failed'].quietMs + 30, { who: undefined, player: undefined, subject: 'Twilight Zone' }));
  assert.equal(log.entries[0]!.count, 2);
  assert.equal(activityText(log.entries[0]!).title, 'Téléchargement bloqué 2 fois');
});

test('activité : au plus ACTIVITY_MAX lignes, les plus anciennes déjà lues partent d’abord', () => {
  setLanguage('fr');
  const log = emptyActivity();
  // La plus ancienne : un téléchargement bloqué, pas encore vu.
  add(log, ev('download-failed', 'vieux', T0, { subject: 'Junk Yard' }));
  for (let i = 1; i <= ACTIVITY_MAX + 10; i++) add(log, ev('friend-record', `r${i}`, T0 + i * 1000), true);
  assert.equal(log.entries.length, ACTIVITY_MAX);
  assert.ok(log.entries.some((e) => e.key === 'vieux'), 'l’erreur pas vue reste');
  assert.equal(log.entries.at(-2)!.key, `r${12}`, 'les plus anciennes lues sont parties');
  assert.ok(log.entries.slice(0, -1).every((e, i) => e.at >= log.entries[i + 1]!.at), 'la plus récente en tête');
  // Tout non lu : les plus anciennes partent, quelles qu'elles soient.
  const unread = emptyActivity();
  for (let i = 0; i < ACTIVITY_MAX + 5; i++) add(unread, ev('friend-record', `u${i}`, T0 + i));
  assert.equal(unread.entries.length, ACTIVITY_MAX);
  assert.equal(unread.entries.at(-1)!.key, 'u5');
});

test('activité : le journal est gardé d’un démarrage à l’autre ; illisible, mis de côté', () => {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-activite-'));
  const file = path.join(dir, 'activite.json');
  assert.deepEqual(loadActivity(file).log.entries, []);
  const log = emptyActivity();
  add(log, ev('friend-online', BRUNO, T0));
  add(log, ev('friend-online', BRUNO, T0 + 1000));
  add(log, ev('live-finished', 'abcdefabcdefabcd', T0 + 2000, { who: 'Chloé', place: { rank: 2, of: 3 }, subject: 'Attack from Mars' }));
  addActivity(log, { kind: 'update-available', facts: { key: '0.1.9', version: '0.1.9', previous: '0.1.8' }, at: T0 + 3000 });
  markActivityShown(log, [ev('friend-online', BRUNO, T0 + 1000)]);
  saveActivity(file, log);
  const again = loadActivity(file).log;
  assert.deepEqual(again.entries, log.entries);
  assert.equal(activityUnread(again), 2);
  assert.equal(activityText(again.entries[1]!).detail, 'Vous : place 2 sur 3', 'le chemin du menu système, Start y mène : la ligne ne le redit pas');
  // Une ligne abîmée (genre inconnu, heure absente) est laissée de côté ; les autres restent.
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: unknown[] };
  raw.entries.push({ id: 'x', kind: 'inconnu', key: 'x', at: T0, count: 1 }, { id: 'y', kind: 'friend-online', key: 'y', count: 1 });
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.equal(loadActivity(file).log.entries.length, 3);
  // Un fichier illisible n'est jamais écrasé : mis de côté, le journal repart vide.
  fs.writeFileSync(file, '{"v":1,"entries":[{"id"');
  const loaded = loadActivity(file, new Date('2026-11-06T08:00:00.000Z'));
  assert.deepEqual(loaded.log.entries, []);
  assert.ok(loaded.setAside && fs.readFileSync(loaded.setAside, 'utf8').startsWith('{"v":1'));
});

test('activité : non lu, ce que la notification n’a pas dit en entier ; les erreurs jusqu’à l’écran', () => {
  setLanguage('fr');
  const log = emptyActivity();
  const center = createNoticeCenter();
  const online = ev('friend-online', BRUNO, T0);
  const done = ev('download-done', 'j1', T0, { who: undefined, player: undefined, subject: 'Medieval Madness' });
  const failed = ev('download-failed', 'j0', T0, { who: undefined, player: undefined, subject: 'Junk Yard' });
  for (const e of [online, done, failed]) add(log, e);
  // Dites une à une, en entier : la connexion et la fin de téléchargement sont lues, l'erreur reste à voir.
  center.push([online]);
  const said = center.tick(T0 + 5000, { canShow: true });
  assert.deepEqual(said.entered, { events: [online], digest: false });
  markActivityShown(log, said.entered!.events);
  markActivityShown(log, [done, failed]);
  assert.deepEqual(log.entries.map((e) => [e.kind, e.read]).sort(), [['download-done', true], ['download-failed', false], ['friend-online', true]]);
  assert.equal(activityUnread(log), 1);
  // Une nouvelle connexion du même ami : la ligne remonte, à revoir.
  add(log, ev('friend-online', BRUNO, T0 + 3600_000));
  assert.equal(activityUnread(log), 2);
  // Un résumé (« 3 nouveautés ») ne dit rien en entier : ses évènements restent non lus.
  const c2 = createNoticeCenter();
  const three = [ev('friend-record', 'r1', T0, { subject: 'Twilight Zone', extra: '1' }), ev('friend-request', 'k1', T0), ev('download-failed', 'j2', T0, { subject: 'Junk Yard' })];
  c2.push(three);
  const digest = c2.tick(T0 + 5000, { canShow: true });
  assert.equal(digest.view?.title, '3 nouveautés');
  assert.equal(digest.view?.act?.type, 'activity');
  assert.equal(digest.entered?.digest, true);
  assert.equal(digest.entered?.events.length, 3);
  // L'écran ouvert : tout est lu, les erreurs comprises.
  assert.equal(markActivityRead(log), true);
  assert.equal(activityUnread(log), 0);
  assert.equal(markActivityRead(log), false, 'rien de changé : rien à écrire');
  // Ne restent non lues, dites, que les erreurs.
  for (const kind of ACTIVITY_KEEP_UNREAD) assert.ok(kind === 'update-failed' || NOTICE_RULES[kind as NoticeKind].tone === 'error', kind);
});

test('activité : chaque genre a son icône, son texte entier et son action, en français et en anglais', () => {
  const kinds: ActivityKind[] = [...KINDS, 'update-available', 'update-installed', 'update-failed', 'note'];
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    for (const kind of kinds) {
      const log = emptyActivity();
      const entry: ActivityEntry = addActivity(log, {
        kind,
        facts: { key: kind.startsWith('live-invite') ? 'abcdefabcdefabcd|0' : 'abcdefabcdefabcd|x', who: 'Bruno', player: BRUNO, subject: 'Medieval Madness', extra: 'cause', version: '0.1.9', previous: '0.1.8', text: 'Constat du démarrage', item: 'cabinet' },
        at: T0,
      });
      const text = activityText(entry);
      assert.ok(text.title.length > 0, `${lang} ${kind}`);
      assert.doesNotMatch(text.title + (text.detail ?? ''), /…|\{/, `${lang} ${kind} : rien de raccourci ni d’espace réservé`);
      assert.ok(activityLook(entry).icon, kind);
      const act = activityAct(entry);
      assert.ok(act, `${kind} : Start y fait quelque chose`);
    }
  }
  setLanguage('en');
  const log = emptyActivity();
  for (let i = 0; i < 3; i++) add(log, ev('friend-online', BRUNO, T0 + i * 3600_000));
  assert.equal(activityText(log.entries[0]!).title, 'Bruno: 3 sign-ins');
  setLanguage('fr');
});

// ---------------------------------------------------------------------------
// La vraie file (app/src/menu-notices.ts) et le vrai écran (app/src/activity-menu.ts), compilés.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createMenuNotices } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-notices.js')) as {
  createMenuNotices(host: object): { observe(): void; view(): { notice?: { title: string } }; stop(): void };
};
interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; badges?: string[]; unread?: boolean; note?: { sign: string; text: string } }[] }[];
  actions: { label: string; tone?: string; detail?: string; run: () => void }[];
}
const { createActivityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'activity-menu.js')) as {
  createActivityMenu(host: object): {
    record(events: readonly NoticeEvent[], quiet?: boolean): void;
    shown(events: readonly NoticeEvent[]): void;
    note(add: { kind: ActivityKind; facts: Record<string, unknown> & { key: string } }): void;
    open(back?: () => void): void;
    unread(): number;
    entries(): readonly ActivityEntry[];
    item: { attention?: boolean; detail?: string };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Le vrai écran, sur un dossier de données d'essai, avec des amis, des invitations et des téléchargements d'essai. */
function activityScreen(dataDir: string, world: { friends?: string[]; online?: string[]; invites?: string[]; jobs?: string[]; history?: string[] } = {}) {
  const opened: { build: () => Built; at?: number }[] = [];
  let cursor = 0;
  const did: string[] = [];
  const menu = createActivityMenu({
    dataDir,
    library: {
      openCustom: (build: () => Built, at?: number) => {
        opened.push({ build, at });
        cursor = at ?? 0;
      },
      openSystem: () => did.push('menu système'),
      cursor: () => cursor,
      isShowing: () => true,
      runSystemItem: (id: string) => did.push(`entrée ${id}`),
      hasSystemItem: () => true,
      openDownloads: (focus: string) => did.push(`téléchargements ${focus}`),
    },
    hasDownload: (id: string) => (world.jobs ?? []).includes(id),
    friends: {
      isFriend: (k: string) => (world.friends ?? []).includes(k),
      online: (k: string) => (world.online ?? []).includes(k),
      playing: () => false,
      incoming: () => false,
      openFriend: (k: string) => did.push(`fiche ${k.slice(0, 1)}`),
      openRequests: () => did.push('demandes'),
    },
    live: {
      hasInvite: (id: string) => (world.invites ?? []).includes(id),
      inviteEnd: (id: string) => (id === 'eeeeeeeeeeeeeeee' ? { why: 'expired', name: 'Bruno', title: 'Twilight Zone' } : undefined),
      openInvite: (id: string) => did.push(`invitation ${id}`),
      current: () => undefined,
      open: () => did.push('partie'),
      inHistory: (id: string) => (world.history ?? []).includes(id),
      openHistory: (id: string) => did.push(`historique ${id}`),
    },
    now: () => T0 + 3600_000,
  });
  return { menu, did, last: () => opened.at(-1)!.build(), move: (to: number) => (cursor = to) };
}

test('activité : la vraie file consigne tout, sur chaque écran, partie et notifications masquées comprises', () => {
  setLanguage('fr');
  for (const screen of ZONE_SCREENS) {
    for (const quietInGame of [false, true]) {
      let clock = T0;
      const online = new Set<string>();
      const friends = ['Bruno', 'Léa'].map((name) => ({ key: name.toLowerCase(), name, since: new Date(0).toISOString(), events: [] }));
      const recorded: NoticeEvent[] = [];
      const said: NoticeEvent[] = [];
      const zone: NoticeZone = noticeZone(screen, { quietInGame });
      const notices = createMenuNotices({
        social: { state: () => ({ ...newSocialState(new Date(0)), friends }), online: (k: string) => online.has(k), presenceOf: () => undefined },
        jobs: () => [],
        mode: () => 'all',
        zone: () => zone,
        redraw: () => undefined,
        now: () => clock,
        live: { game: () => undefined, invites: () => [], me: () => 'moi', onScreen: () => false },
        activity: { record: (events: readonly NoticeEvent[]) => recorded.push(...events), shown: (events: readonly NoticeEvent[]) => said.push(...events) },
      });
      try {
        notices.observe();
        clock += NOTICE_STARTUP_QUIET_MS + 1000;
        online.add('bruno');
        notices.observe();
        clock += NOTICE_GATHER_MS + 100;
        const v = notices.view();
        const what = `${screen}${quietInGame ? ' (masquées en partie)' : ''}`;
        // Toujours au journal, qu'elle se montre ou non.
        assert.deepEqual(recorded.map((e) => e.kind), ['friend-online'], `${what} : consignée`);
        // Lue seulement si la notification l'a dite.
        assert.equal(said.length, v.notice ? 1 : 0, `${what} : ${v.notice ? 'dite, donc lue' : 'retenue, donc non lue'}`);
      } finally {
        notices.stop();
      }
    }
  }
});

test('activité : l’écran, par jour, chaque action dite ou grisée avec sa raison ; Start la fait', () => {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-activite-ecran-'));
  const { menu, did, last } = activityScreen(dir, { friends: [BRUNO], online: [BRUNO], invites: ['aaaaaaaaaaaaaaaa'], jobs: ['j1'] });
  menu.record([
    ev('friend-online', BRUNO, T0 - DAY),
    ev('live-invite', 'eeeeeeeeeeeeeeee|0', T0 - DAY + 10, { subject: 'Twilight Zone' }),
    ev('live-invite', 'aaaaaaaaaaaaaaaa|0', T0, { subject: 'Medieval Madness' }),
    ev('download-failed', 'j1', T0 + 10, { who: undefined, player: undefined, subject: 'Junk Yard', extra: 'plus de place' }),
    ev('download-done', 'j9', T0 + 20, { who: undefined, player: undefined, subject: 'Safe Cracker' }),
  ]);
  assert.equal(menu.unread(), 5);
  // Invitation, téléchargements : leur pastille est dans Amis et Téléchargements, pas redoublée ici.
  assert.ok(!menu.item.attention, 'pas de pastille pour ce qui en a une ailleurs');
  assert.match(menu.item.detail!, /^5 non lues · /);
  menu.open();
  const screen = last();
  assert.equal(screen.heading, 'Activité récente');
  assert.equal(screen.subheading, '5 notifications non lues');
  assert.deepEqual(screen.sections.map((s) => s.title), ['Aujourd’hui', 'Hier']);
  const rows = screen.sections.flatMap((s) => s.rows);
  assert.deepEqual(rows.map((r) => r.text), ['Téléchargement fini', 'Téléchargement bloqué', 'Bruno vous invite à rejoindre une partie', 'Bruno vous invite à rejoindre une partie', 'Bruno vient de se connecter']);
  assert.ok(rows.every((r) => r.unread && r.badges!.includes('Non lu')), 'le repère de chaque ligne pas lue');
  // Ce qui ne vaut plus : grisé, la raison dite, Start ne fait rien.
  assert.deepEqual(rows.map((r) => [r.tone === 'quiet', r.note?.sign, r.note?.text]), [
    [true, '✕', 'Retiré de la liste des téléchargements'],
    [false, '↩', 'Start : ouvrir les téléchargements'],
    [false, '↩', 'Start : répondre à l’invitation'],
    [true, '✕', 'Invitation expirée'],
    [false, '↩', 'Start : voir sa fiche'],
  ]);
  assert.ok(rows[4]!.badges!.includes('En ligne'), 'son état à côté de l’heure, séparé de l’action');
  for (const a of screen.actions.slice(0, 5)) a.run();
  assert.deepEqual(did, ['téléchargements j1', 'invitation aaaaaaaaaaaaaaaa', 'fiche b']);
  assert.deepEqual(screen.actions.slice(5).map((a) => a.label), ['Effacer l’activité récente', 'Retour']);
});

test('activité : jamais de pastille rouge, ni une mise à jour installée ni rien ; l’entrée en tête du menu système, plus dans Amis', () => {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-activite-pastille-'));
  const { menu } = activityScreen(dir, { friends: [BRUNO], online: [BRUNO], invites: ['aaaaaaaaaaaaaaaa'], jobs: ['j1'] });
  // Le redémarrage après une mise à jour : son bandeau l'a dite, elle entre lue.
  menu.note({ kind: 'update-installed', facts: { key: '0.1.9', version: '0.1.9', previous: '0.1.8' } });
  menu.note({ kind: 'update-available', facts: { key: '0.2.0', version: '0.2.0', previous: '0.1.9' } });
  menu.note({ kind: 'note', facts: { key: 'sauvegarde', text: 'Sauvegarde faite.', item: 'downloads' } });
  assert.equal(menu.unread(), 0, 'les constats dits au démarrage sont lus');
  // Retenues pendant une partie puis expirées : à relire dans l'écran, sans pastille (Amis et Téléchargements ont la leur).
  menu.record([
    ev('friend-online', BRUNO, T0),
    ev('friend-request', 'k1', T0 + 1),
    ev('live-invite', 'aaaaaaaaaaaaaaaa|0', T0 + 2, { subject: 'Medieval Madness' }),
    ev('download-done', 'j1', T0 + 3, { who: undefined, player: undefined, subject: 'Safe Cracker' }),
    ev('download-failed', 'j1', T0 + 4, { who: undefined, player: undefined, subject: 'Junk Yard', extra: 'plus de place' }),
  ]);
  // Une mise à jour qui n'a pas abouti : sa pastille est sur Mises à jour (updates-menu.ts), pas ici.
  menu.note({ kind: 'update-failed', facts: { key: '0.2.0', version: '0.2.0', previous: '0.1.9' } });
  assert.equal(menu.unread(), 6, 'à relire dans l’écran');
  assert.ok(!menu.item.attention, 'jamais de pastille : chaque chose a la sienne là où on y répond');
  assert.match(menu.item.detail!, /^6 non lues · /);
  // En tête du menu système, rangée sous Cyber Pinball (elle parle de tout, pas que des amis) : plus dans Amis,
  // où elle faisait remonter par la rubrique une pastille de mise à jour.
  assert.ok(SYSTEM_ROOT_SHORTCUTS.includes('activity'));
  assert.ok(SYSTEM_GROUPS.cyberpinball.entries.includes('activity'));
  assert.ok(!SYSTEM_GROUPS.amis.entries.includes('activity'));
});

test('activité : une ligne est vue quand le curseur s’y pose ; son repère reste jusqu’à la sortie de l’écran', () => {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-activite-curseur-'));
  const { menu, last, move } = activityScreen(dir, { jobs: ['j1', 'j2'] });
  menu.record([ev('download-failed', 'j1', T0, { who: undefined, player: undefined, subject: 'Junk Yard' }), ev('download-done', 'j2', T0 + 1, { who: undefined, player: undefined, subject: 'Safe Cracker' })]);
  // Dite par la notification, une erreur reste à voir (la fin de téléchargement, retenue, aussi).
  menu.shown([ev('download-failed', 'j1', T0)]);
  assert.equal(menu.unread(), 2);
  menu.open();
  last();
  assert.equal(menu.unread(), 1, 'la première, sous le curseur, est vue');
  move(1);
  const after = last();
  assert.equal(menu.unread(), 0);
  assert.ok(after.sections[0]!.rows.every((r) => r.unread), 'les repères restent tant que l’écran est ouvert');
  // Gardé d'un démarrage à l'autre, lu compris.
  const again = activityScreen(dir).menu;
  assert.equal(again.entries().length, 2);
  assert.equal(again.unread(), 0);
  // Notifications coupées : une connexion ne demande pas à être revue ; un blocage, si.
  again.record([ev('friend-online', BRUNO, T0 + 5), ev('download-failed', 'j3', T0 + 6, { who: undefined, player: undefined })], true);
  assert.equal(again.unread(), 1);
});
