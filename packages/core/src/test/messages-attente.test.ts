// Messages en attente (17/11/2026) : la pastille des messages au coin d'état, l'écran qui les réunit
// (app/src/inbox-menu.ts) et Activité récente (activity.ts, app/src/activity-menu.ts), une ligne par
// conversation. Ces tests fixent la classe de comportement :
// - un message (d'un ami, d'un groupe, une mention dans un salon) ne fait jamais une ligne à lui
//   seul : les messages d'une conversation se regroupent sur une ligne du jour, qui dit combien et
//   le dernier ; deux conversations font deux lignes ;
// - la ligne ouvre sa conversation et dit ce qui y attend encore ; elle se lit d'elle-même quand la
//   conversation est lue là où elle se tient ; une conversation qui n'existe plus la grise ;
// - la conversation suit l'évènement : chaque notification de groupe ou de salon la porte (thread) ;
// - la pastille compte les messages non lus hors sourdine, et rien quand rien n'attend ; l'écran
//   liste les conversations, les plus récentes d'abord, la sourdine en dernier, puis les accès de
//   la communauté ;
// - la pastille est au coin d'état et sur la ligne de la roue dentée, son clic ouvre l'écran.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { ACTIVITY_MESSAGE_KINDS, activityAct, activityFacts, activityText, addActivity, emptyActivity, markThreadRead, parseActivityEntry, type ActivityEntry, type ActivityKind } from '../activity';
import type { NoticeEvent, NoticeKind } from '../notices';
import { REPO_ROOT } from './i18n-scan';

const NOVA = 'b'.repeat(64);
const LEA = 'c'.repeat(64);
const GROUP = '0123456789abcdef';
const OTHER_GROUP = 'fedcba9876543210';
const T0 = new Date(2026, 10, 17, 10, 0, 0).getTime();
const MIN = 60_000;
const add = (log: ReturnType<typeof emptyActivity>, e: NoticeEvent) => addActivity(log, { kind: e.kind, facts: activityFacts(e), at: e.at });
const friendMessage = (key: string, who: string, at: number, text: string): NoticeEvent => ({ kind: 'friend-message', key: `m${at}`, at, who, player: key, extra: text });
const groupMessage = (group: string, name: string, who: string, at: number, text: string): NoticeEvent => ({ kind: 'group-message', key: `g${at}`, at, who, player: 'e'.repeat(64), thread: group, subject: name, extra: text });
const mention = (room: string, name: string, who: string, at: number, text: string): NoticeEvent => ({ kind: 'room-mention', key: `r${at}`, at, who, player: 'f'.repeat(64), thread: room, subject: name, extra: text });

test('messages en attente : une ligne par conversation, jamais une par message', () => {
  setLanguage('fr');
  const log = emptyActivity();
  add(log, friendMessage(NOVA, 'Nova', T0, 'Salut'));
  add(log, friendMessage(NOVA, 'Nova', T0 + MIN, 'Tu es là ?'));
  add(log, friendMessage(NOVA, 'Nova', T0 + 2 * MIN, 'Comet Chaser ce soir ?'));
  add(log, friendMessage(LEA, 'Léa', T0 + 3 * MIN, 'Merci !'));
  add(log, groupMessage(GROUP, 'Les Flippeurs du Nord', 'Bruno', T0 + 4 * MIN, 'Qui vient ?'));
  add(log, groupMessage(GROUP, 'Les Flippeurs du Nord', 'Chloé', T0 + 5 * MIN, 'Moi'));
  add(log, groupMessage(OTHER_GROUP, 'Tilt du samedi', 'Orion', T0 + 6 * MIN, 'Samedi 20 h'));
  add(log, mention('fr', 'Salon France', 'Orion', T0 + 7 * MIN, '@Pixel bien joué'));
  add(log, mention('fr', 'Salon France', 'Ada', T0 + 8 * MIN, '@Pixel record ?'));
  assert.equal(log.entries.length, 5, 'Nova, Léa, deux groupes, un salon');
  const of = (kind: ActivityKind, match: (e: ActivityEntry) => boolean) => log.entries.find((e) => e.kind === kind && match(e))!;
  const nova = of('friend-message', (e) => e.player === NOVA);
  assert.equal(nova.count, 3);
  assert.deepEqual(activityText(nova), { title: '3 messages de Nova', detail: 'Comet Chaser ce soir ?' });
  assert.equal(activityText(of('friend-message', (e) => e.player === LEA)).title, 'Message de Léa');
  const group = of('group-message', (e) => e.thread === GROUP);
  assert.deepEqual(activityText(group), { title: '2 messages · Les Flippeurs du Nord', detail: 'Chloé : Moi' });
  assert.deepEqual(activityText(of('room-mention', () => true)), { title: '2 mentions · Salon France', detail: 'Ada : @Pixel record ?' });
  // En anglais aussi, sans espace réservé.
  setLanguage('en');
  assert.equal(activityText(nova).title, '3 messages from Nova');
  assert.equal(activityText(group).detail, 'Chloé: Moi');
  setLanguage('fr');
  // Chaque ligne ouvre sa conversation.
  assert.deepEqual(activityAct(nova), { type: 'chat', key: NOVA });
  assert.deepEqual(activityAct(group), { type: 'group', id: GROUP });
  assert.deepEqual(activityAct(of('room-mention', () => true)), { type: 'room', id: 'fr' });
  // Un autre jour : une autre ligne.
  add(log, friendMessage(NOVA, 'Nova', T0 + 24 * 3600_000, 'Bonjour'));
  assert.equal(log.entries.filter((e) => e.player === NOVA).length, 2);
});

test('messages en attente : la conversation lue lit ses lignes, et elles seules ; le fichier garde la conversation', () => {
  const log = emptyActivity();
  add(log, groupMessage(GROUP, 'Les Flippeurs du Nord', 'Bruno', T0, 'Qui vient ?'));
  add(log, groupMessage(OTHER_GROUP, 'Tilt du samedi', 'Orion', T0 + MIN, 'Samedi'));
  add(log, friendMessage(NOVA, 'Nova', T0 + 2 * MIN, 'Salut'));
  assert.equal(markThreadRead(log, 'group-message', GROUP), true);
  assert.deepEqual(log.entries.map((e) => [e.thread ?? e.player, e.read]), [[NOVA, false], [OTHER_GROUP, false], [GROUP, true]]);
  assert.equal(markThreadRead(log, 'group-message', GROUP), false, 'déjà lue : rien ne change');
  const back = parseActivityEntry(JSON.parse(JSON.stringify(log.entries[1])));
  assert.equal(back?.thread, OTHER_GROUP);
  for (const kind of ['friend-message', 'group-message', 'room-mention'] as NoticeKind[]) assert.ok(ACTIVITY_MESSAGE_KINDS.has(kind));
});

test('messages en attente : chaque notification de groupe et de salon porte sa conversation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  for (const kind of ['group-message', 'room-mention']) {
    const pushes = src.split('\n').filter((l) => l.includes(`kind: '${kind}' as const`));
    assert.ok(pushes.length > 0, kind);
    for (const line of pushes) assert.match(line, /thread: /, `${kind} : la notification dit sa conversation`);
  }
  // La lecture d'une conversation lit ses lignes : à chaque changement du réseau social.
  assert.match(src, /function socialChanged[\s\S]{0,900}activityMenu\.settle\(\)/);
});

// ---------------------------------------------------------------------------
// Les vrais écrans (app/src/activity-menu.ts, app/src/inbox-menu.ts), compilés.

interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; badges?: string[]; unread?: boolean; avatar?: unknown; note?: { sign: string; text: string } }[] }[];
  actions: { label: string; run: () => void }[];
}
interface Thread {
  kind: 'friend-message' | 'group-message' | 'room-mention';
  id: string;
  name: string;
  unread: number;
  muted?: boolean;
  last?: { who?: string; text: string; at: number };
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { createActivityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'activity-menu.js')) as {
  createActivityMenu(host: object): { record(events: readonly NoticeEvent[]): void; settle(): void; open(back?: () => void): void; entries(): readonly ActivityEntry[] };
};
const { createInboxMenu, inboxCount, inboxOrder } = require(path.join(REPO_ROOT, 'app', 'dist', 'inbox-menu.js')) as {
  createInboxMenu(host: object): { open(back: () => void): void; pill(): { count: number; title: string } | undefined };
  inboxCount(threads: readonly Thread[]): number;
  inboxOrder(threads: readonly Thread[]): Thread[];
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('messages en attente : la ligne ouvre sa conversation, dit ce qui y attend, se lit avec elle', () => {
  setLanguage('fr');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-attente-'));
  try {
    const pending: Record<string, number | undefined> = { [`friend-message|${NOVA}`]: 2, [`group-message|${GROUP}`]: 1 };
    const did: string[] = [];
    let build: (() => Built) | undefined;
    const menu = createActivityMenu({
      dataDir,
      library: { openCustom: (b: () => Built) => (build = b), openSystem() {}, cursor: () => 99, isShowing: () => true, runSystemItem() {}, hasSystemItem: () => true, openDownloads() {} },
      hasDownload: () => false,
      friends: { isFriend: () => true, online: () => false, playing: () => false, incoming: () => false, openFriend() {}, openRequests() {}, avatar: (key: string) => ({ initials: key.slice(0, 1) }) },
      live: { hasInvite: () => false, inviteEnd: () => undefined, openInvite() {}, current: () => undefined, open() {}, inHistory: () => false, openHistory() {} },
      threads: { pending: (kind: string, thread: string) => pending[`${kind}|${thread}`], open: (kind: string, thread: string) => did.push(`${kind} ${thread.slice(0, 4)}`) },
      now: () => T0 + 10 * MIN,
    });
    menu.record([friendMessage(NOVA, 'Nova', T0, 'Salut'), friendMessage(NOVA, 'Nova', T0 + MIN, 'Tu es là ?'), groupMessage(GROUP, 'Les Flippeurs du Nord', 'Bruno', T0 + 2 * MIN, 'Qui vient ?'), groupMessage(OTHER_GROUP, 'Tilt du samedi', 'Orion', T0 + 3 * MIN, 'Samedi')]);
    menu.open(() => {});
    const rows = build!().sections.flatMap((s) => s.rows);
    const row = (title: string) => rows.find((r) => r.text === title)!;
    assert.ok(row('2 messages de Nova').badges?.includes('2 en attente'));
    assert.equal(row('2 messages de Nova').note?.text, 'Start : lire la conversation');
    assert.equal(row('Bruno · Les Flippeurs du Nord').note?.text, 'Start : ouvrir la discussion du groupe');
    assert.equal(row('Bruno · Les Flippeurs du Nord').avatar, undefined, 'un groupe : son icône, pas la pastille du dernier auteur');
    // Le groupe quitté : la ligne reste, grisée avec sa raison.
    assert.equal(row('Orion · Tilt du samedi').note?.text, 'Vous n’êtes plus dans ce groupe');
    build!().actions.find((a) => a.label === '2 messages de Nova')!.run();
    assert.deepEqual(did, [`friend-message ${NOVA.slice(0, 4)}`]);
    // La conversation de Nova lue là où elle se tient : sa ligne aussi, et elle seule.
    pending[`friend-message|${NOVA}`] = 0;
    menu.settle();
    const read = Object.fromEntries(menu.entries().map((e) => [e.thread ?? e.player, e.read]));
    assert.equal(read[NOVA], true);
    assert.equal(read[GROUP], false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('messages en attente : la pastille compte hors sourdine, rien quand rien n’attend ; l’écran réunit les conversations', () => {
  setLanguage('fr');
  const threads: Thread[] = [
    { kind: 'room-mention', id: 'fr', name: 'Salon France', unread: 2, last: { who: 'Orion', text: '@Pixel record ?', at: T0 + 3 * MIN } },
    { kind: 'friend-message', id: LEA, name: 'Léa', unread: 1, muted: true, last: { text: 'Merci', at: T0 + 9 * MIN } },
    { kind: 'friend-message', id: NOVA, name: 'Nova', unread: 3, last: { text: 'Comet Chaser ?', at: T0 + 8 * MIN } },
    { kind: 'group-message', id: GROUP, name: 'Les Flippeurs du Nord', unread: 4, last: { who: 'Bruno', text: 'Neon Harbor', at: T0 + 5 * MIN } },
    { kind: 'group-message', id: OTHER_GROUP, name: 'Tilt du samedi', unread: 0 },
  ];
  assert.equal(inboxCount(threads), 9, 'Léa en sourdine ne compte pas');
  assert.deepEqual(inboxOrder(threads).map((x) => x.name), ['Nova', 'Les Flippeurs du Nord', 'Salon France', 'Léa']);
  let list = threads;
  let build: (() => Built) | undefined;
  const opened: string[] = [];
  const menu = createInboxMenu({
    library: { openCustom: (b: () => Built) => (build = b) },
    threads: () => list,
    open: (kind: string, id: string) => opened.push(`${kind} ${id.slice(0, 4)}`),
    links: () => [{ label: 'Messages', icon: 'message', open: () => opened.push('messages') }, { label: 'Activité récente', icon: 'bell', open: () => opened.push('activité') }],
    now: () => T0 + 10 * MIN,
  });
  assert.deepEqual(menu.pill(), { count: 9, title: '9 messages en attente' });
  menu.open(() => opened.push('retour'));
  const built = build!();
  assert.equal(built.heading, 'Messages en attente');
  assert.equal(built.subheading, '9 messages attendent votre lecture');
  const [waiting, community] = built.sections;
  assert.deepEqual(waiting!.rows.map((r) => r.text), ['Nova', 'Les Flippeurs du Nord', 'Salon France', 'Léa']);
  assert.equal(waiting!.rows[1]!.detail, 'Groupe · Bruno : Neon Harbor');
  assert.ok(waiting!.rows[2]!.badges?.includes('2 mentions non lues'));
  assert.ok(waiting!.rows[3]!.badges?.includes('Sourdine'));
  assert.deepEqual(community!.rows.map((r) => r.text), ['Messages', 'Activité récente']);
  built.actions.find((a) => a.label === 'Nova')!.run();
  built.actions.find((a) => a.label === 'Activité récente')!.run();
  built.actions.at(-1)!.run();
  assert.deepEqual(opened, [`friend-message ${NOVA.slice(0, 4)}`, 'activité', 'retour']);
  // Rien n'attend : pas de pastille, et l'écran le dit.
  list = [];
  assert.equal(menu.pill(), undefined);
  assert.equal(build!().sections[0]!.rows[0]!.text, 'Aucun message en attente');
});

test('messages en attente : la pastille au coin d’état et sur la ligne de la roue dentée ; son clic ouvre l’écran', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /function menuCorner\(\)[\s\S]{0,2500}inboxMenu\.pill\(\)/, 'la pastille vient de l’écran des messages');
  assert.match(front, /action\.type === 'inbox'[\s\S]{0,300}inboxMenu\.open\(/);
  const js = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(js, /if \(s\.inbox\) nodes\.push\(inboxPill\(s\.inbox\)\)/);
  assert.match(js, /dataset\.act = JSON\.stringify\(\{ type: 'inbox' \}\)/);
  const css = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.css'), 'utf8');
  assert.match(css, /\.status-corner\.on-head \.inbox-pill/, 'sur la ligne de la roue dentée, à la hauteur des autres pastilles');
});
