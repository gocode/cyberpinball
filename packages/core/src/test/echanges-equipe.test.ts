// Les échanges avec l'équipe sur la borne (app/src/team-threads.ts et team-threads-menu.ts) : un
// rapport ouvre un fil, la réponse de l'équipe arrive et s'annonce, le joueur répond dans le même fil.
//
// Invariants fixés ici :
// - le rapport qui part porte son fil, la clé de réponse du fil et le pseudo du joueur ; anonyme, sans
//   pseudo, mais toujours avec son fil (l'équipe peut répondre) ;
// - la réponse relevée est annoncée une fois, comptée non lue, lue dès que le fil est ouvert ;
// - le message du joueur part scellé comme un rapport (kind « message »), avec le fil et la même clé ;
//   hors ligne, il est montré « en attente » ;
// - le front-end range ces réponses dans les Messages en attente et leur notification ouvre l'échange.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import type { ReportEnvelope } from '../feedback';
import { sealTeamReply, threadAnswerKey, type FeedbackThread, type TeamReplyBox, type ThreadLine } from '../feedback-threads';
import { NOTICE_RULES } from '../notices';
import { REPO_ROOT } from './i18n-scan';
import { frontendSource } from './frontend-source';
import { fakeFeedbackService } from './doublures';

/* eslint-disable @typescript-eslint/no-require-imports */
interface Row {
  text?: string;
  detail?: string;
  bubble?: string;
}
interface Built {
  heading: string;
  sections: { kind?: string; rows: Row[] }[];
  actions: { label: string; detail?: string; key?: string; run(): void }[];
}
type Threads = {
  stamp(envelope: ReportEnvelope, title: string): ReportEnvelope;
  write(fil: string, text: string): Promise<'sent' | 'queued' | 'failed'>;
  poll(): Promise<void>;
  visible(): FeedbackThread[];
  thread(fil: string): FeedbackThread | undefined;
  unread(): number;
  read(fil: string): void;
  pollIfOld(): Promise<void>;
};
const { createTeamThreads } = require(path.join(REPO_ROOT, 'app', 'dist', 'team-threads.js')) as { createTeamThreads(opts: object): Threads };
const { createTeamThreadsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'team-threads-menu.js')) as {
  createTeamThreadsMenu(host: object): { openThread(fil: string, back: () => void): void; openList(back: () => void): void };
};

const NOW = Date.UTC(2026, 10, 21, 12);

function setup(opts: { anonymous?: boolean; online?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-echanges-'));
  const sent: ReportEnvelope[] = [];
  const pending: TeamReplyBox[] = [];
  const arrived: { thread: FeedbackThread; line: ThreadLine }[][] = [];
  let anonymous = opts.anonymous ?? false;
  const threads = createTeamThreads({
    dataDir: dir,
    service: fakeFeedbackService({
      replies: async (fils: { fil: string; since: number }[]) => pending.filter((b) => fils.some((f) => f.fil === b.fil && b.at > f.since)),
      sendReport: async (e: ReportEnvelope) => (sent.push(e), opts.online === false ? 'queued' : 'sent'),
      queuedCount: () => (opts.online === false ? 1 : 0),
    }),
    version: '0.2.3',
    language: () => 'fr',
    borne: () => 'borneEssai01',
    anonymous: () => anonymous,
    who: () => ({ name: 'Pilote', country: 'FR' }),
    changed: () => undefined,
    arrived: (added: { thread: FeedbackThread; line: ThreadLine }[]) => arrived.push(added),
    log: () => undefined,
    now: () => NOW,
  });
  return { dir, threads, sent, pending, arrived, setAnonymous: (on: boolean) => (anonymous = on), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const report = (over: Partial<ReportEnvelope> = {}): ReportEnvelope => ({ v: 1, kind: 'report', text: 'Le DMD reste noir', table: 'Glass Lagoon', version: '0.2.3', lang: 'fr', borne: 'borneEssai01', at: NOW, ...over });

test('échanges : le rapport porte son fil et le pseudo ; anonyme, le fil seul', () => {
  const s = setup();
  try {
    const env = s.threads.stamp(report(), 'Le DMD reste noir');
    const thread = s.threads.thread(env.fil!)!;
    assert.equal(env.answer, threadAnswerKey(thread));
    assert.deepEqual(env.who, { name: 'Pilote', country: 'FR' });
    assert.deepEqual(s.threads.visible().map((x) => x.lines.map((l) => [l.from, l.text])), [[['me', 'Le DMD reste noir']]]);
    // Déjà estampillé : rien ne change.
    assert.equal(s.threads.stamp(env, 'x'), env);
    s.setAnonymous(true);
    const anon = s.threads.stamp(report({ kind: 'crash', text: 'VPX arrêté' }), 'Glass Lagoon · VPX arrêté');
    assert.ok(anon.fil && anon.answer);
    assert.equal(anon.who, undefined);
    assert.equal(s.threads.thread(anon.fil!)!.anonymous, true);
    // Un plantage sans réponse ne se montre pas.
    assert.equal(s.threads.visible().length, 1);
  } finally {
    s.done();
  }
});

test('échanges : la réponse de l’équipe s’annonce une fois, se lit à l’ouverture, et le joueur répond dans le fil', async () => {
  setLanguage('fr');
  const s = setup();
  try {
    const env = s.threads.stamp(report(), 'Le DMD reste noir');
    s.pending.push({ fil: env.fil!, id: 'rep0000001', at: NOW + 60_000, data: sealTeamReply({ v: 1, text: 'Merci ! Essayez « DMD réel » sur Non.', at: NOW }, env.answer!) });
    await s.threads.poll();
    await s.threads.poll();
    assert.equal(s.arrived.length, 1);
    assert.equal(s.arrived[0]![0]!.line.text, 'Merci ! Essayez « DMD réel » sur Non.');
    assert.equal(s.threads.unread(), 1);
    let build: (() => Built) | undefined;
    let prompted: ((value: string | undefined) => void) | undefined;
    const menu = createTeamThreadsMenu({
      threads: s.threads,
      openCustom: (b: () => Built) => (build = b),
      showing: () => true,
      prompt: (_h: string, _l: string, _v: string, done: (value: string | undefined) => void) => (prompted = done),
      anonymous: () => false,
      setAnonymous: () => undefined,
      now: () => NOW,
    });
    menu.openThread(env.fil!, () => undefined);
    const built = build!();
    const chat = built.sections.find((x) => x.kind === 'chat')!.rows.filter((r) => r.bubble !== 'day');
    assert.deepEqual(chat.map((r) => [r.bubble, r.text]), [['out', 'Le DMD reste noir'], ['in', 'Merci ! Essayez « DMD réel » sur Non.']]);
    assert.equal(s.threads.unread(), 0, 'ouvert sous les yeux : lu');
    built.actions.find((a) => a.key === 'team-thread:write')!.run();
    prompted!('C’est réglé, merci !');
    await new Promise((r) => setTimeout(r, 10));
    const msg = s.sent.at(-1)!;
    assert.equal(msg.kind, 'message');
    assert.equal(msg.fil, env.fil);
    assert.equal(msg.answer, env.answer);
    assert.equal(msg.text, 'C’est réglé, merci !');
    assert.deepEqual(msg.who, { name: 'Pilote', country: 'FR' });
    assert.deepEqual(s.threads.thread(env.fil!)!.lines.map((l) => [l.from, l.queued ?? false]), [['me', false], ['team', false], ['me', false]]);
  } finally {
    s.done();
  }
});

test('échanges : un fil neuf se relève à l’ouverture des échanges, même juste après une relève', async () => {
  const s = setup();
  try {
    await s.threads.poll();
    const env = s.threads.stamp(report(), 'Le DMD reste noir');
    s.pending.push({ fil: env.fil!, id: 'rep0000002', at: NOW + 1, data: sealTeamReply({ v: 1, text: 'Bien reçu', at: NOW }, env.answer!) });
    await s.threads.pollIfOld();
    assert.equal(s.threads.unread(), 1);
    // Sans rien de neuf, une seconde ouverture tout de suite ne relève pas de nouveau.
    s.pending.push({ fil: env.fil!, id: 'rep0000003', at: NOW + 2, data: sealTeamReply({ v: 1, text: 'Autre', at: NOW }, env.answer!) });
    await s.threads.pollIfOld();
    assert.equal(s.threads.unread(), 1);
  } finally {
    s.done();
  }
});

test('échanges : hors ligne, le message du joueur reste « en attente »', async () => {
  const s = setup({ online: false });
  try {
    const env = s.threads.stamp(report(), 'Le DMD reste noir');
    assert.equal(await s.threads.write(env.fil!, 'Toujours noir'), 'queued');
    assert.equal(s.threads.thread(env.fil!)!.lines.at(-1)!.queued, true);
    assert.equal(await s.threads.write(env.fil!, '   '), 'failed');
    assert.equal(await s.threads.write('inconnu', 'x'), 'failed');
  } finally {
    s.done();
  }
});

test('échanges : le front-end range les réponses dans les Messages en attente, la notification ouvre l’échange', () => {
  const src = frontendSource();
  assert.match(src, /kind: 'team-message'/);
  assert.match(src, /kind: 'team-reply' as const/);
  assert.match(src, /action\.type === 'team-threads'/);
  assert.match(src, /teamThreads\.watch\(\)/);
  assert.equal(NOTICE_RULES['team-reply'].act.type, 'team-threads');
  assert.equal(NOTICE_RULES['team-reply'].away, true);
});
