// Pièces jointes d'un rapport aux développeurs (app/src/report-attachments.ts et feedback-menu.ts,
// compilés) : des fichiers de ce PC choisis dans le sélecteur de Cyber Pinball, dans des limites de
// nombre et de taille, qui partent dans le ZIP chiffré du rapport (pieces-jointes/), jamais dans
// une proposition publique ; seul leur nom part, jamais leur chemin.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { REPORT_SEALED_MAX, type ReportEnvelope } from '../feedback';
import { fakeFeedbackService } from './doublures';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Attachment {
  name: string;
  data: Buffer;
  shrunk?: boolean;
}
interface Refusal {
  file: string;
  why: string;
  size?: number;
}
interface Action {
  label: string;
  detail?: string;
  tone?: string;
  key?: string;
  run: () => void | Promise<void>;
}
interface Built {
  heading: string;
  lead?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number }[] }[];
  actions: Action[];
}
type Build = () => Built;

/* eslint-disable @typescript-eslint/no-require-imports */
const att = require(path.join(APP_DIST, 'report-attachments.js')) as {
  ATTACHMENTS_COUNT_MAX: number;
  ATTACHMENTS_BYTES_MAX: number;
  addAttachments(list: Attachment[], files: string[], shrink?: (file: string) => Buffer | undefined): { list: Attachment[]; refused: Refusal[] };
  refusalText(refused: Refusal[]): { text: string; detail: string } | undefined;
  reportFile(tech: (files: { name: string; data: Buffer }[]) => Buffer | undefined, withTech: boolean, list: Attachment[]): { file?: Buffer; dropped?: boolean };
};
const { createFeedbackMenu } = require(path.join(APP_DIST, 'feedback-menu.js')) as {
  createFeedbackMenu(ctx: object): {
    openSendReport(report: { about: string; signature: string; notified?: boolean }, back: () => void): void;
    openForm(context: { text?: string }, back: () => void, kind?: string): void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pieces-jointes-'));
  const file = (name: string, size: number, fill = 0x41) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.alloc(size, fill));
    return p;
  };
  return { dir, file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('pièces jointes : le nom seul, des noms distincts, dans les limites de nombre et de taille', () => {
  const s = sandbox();
  try {
    const a = s.file('journal.txt', 1000);
    fs.mkdirSync(path.join(s.dir, 'sous'));
    const b = path.join(s.dir, 'sous', 'journal.txt');
    fs.writeFileSync(b, 'deux');
    const r = att.addAttachments([], [a, b, path.join(s.dir, 'sous'), path.join(s.dir, 'absent.ini')]);
    assert.deepEqual(r.list.map((x) => x.name), ['journal.txt', 'journal (2).txt']);
    assert.ok(r.list.every((x) => !x.name.includes(path.sep) && !x.name.includes(s.dir)), 'jamais le chemin');
    assert.deepEqual(r.refused.map((x) => x.why), ['folder', 'read']);

    const big = s.file('video.mp4', att.ATTACHMENTS_BYTES_MAX + 1);
    const tooBig = att.addAttachments([], [big]);
    assert.equal(tooBig.list.length, 0);
    assert.equal(tooBig.refused[0]!.why, 'size');
    assert.match(att.refusalText(tooBig.refused)!.text, /video\.mp4.*trop lourd/);

    // La place se partage : un second fichier qui ne tient plus est refusé, le premier gardé.
    const half = s.file('moitie.bin', Math.ceil(att.ATTACHMENTS_BYTES_MAX * 0.6));
    const half2 = s.file('moitie2.bin', Math.ceil(att.ATTACHMENTS_BYTES_MAX * 0.6));
    const shared = att.addAttachments([], [half, half2]);
    assert.deepEqual(shared.list.map((x) => x.name), ['moitie.bin']);
    assert.equal(shared.refused[0]!.file, 'moitie2.bin');

    const many = Array.from({ length: att.ATTACHMENTS_COUNT_MAX + 2 }, (_, i) => s.file(`f${i}.txt`, 10));
    const counted = att.addAttachments([], many);
    assert.equal(counted.list.length, att.ATTACHMENTS_COUNT_MAX);
    assert.deepEqual(counted.refused.map((x) => x.why), ['count', 'count']);
    assert.match(att.refusalText(counted.refused)!.detail, /1 autre fichier non joint/);
  } finally {
    s.done();
  }
});

test('pièces jointes : une capture trop lourde est réduite en JPEG plutôt que refusée', () => {
  const s = sandbox();
  try {
    const shot = s.file('capture.png', att.ATTACHMENTS_BYTES_MAX * 3);
    const asked: string[] = [];
    const r = att.addAttachments([], [shot], (file) => (asked.push(file), Buffer.alloc(50_000, 1)));
    assert.deepEqual(asked, [shot]);
    assert.equal(r.list[0]!.name, 'capture.jpg');
    assert.equal(r.list[0]!.shrunk, true);
    assert.equal(r.list[0]!.data.length, 50_000);
    // Illisible pour la réduction : refusée pour sa taille, sans planter.
    const broken = att.addAttachments([], [shot], () => undefined);
    assert.equal(broken.refused[0]!.why, 'size');
    // Un petit fichier n'est pas réduit.
    const small = s.file('petite.png', 2000);
    const kept = att.addAttachments([], [small], () => assert.fail('pas de réduction'));
    assert.equal(kept.list[0]!.name, 'petite.png');
  } finally {
    s.done();
  }
});

test('pièces jointes : dans le ZIP du rapport technique (pieces-jointes/), ou seules s’il ne tient plus', () => {
  const list: Attachment[] = [{ name: 'capture.jpg', data: Buffer.from('JPEG') }];
  let seen: string[] = [];
  const withTech = att.reportFile((files) => ((seen = files.map((f) => f.name)), Buffer.from('ZIP')), true, list);
  assert.deepEqual(seen, ['pieces-jointes/capture.jpg']);
  assert.equal(withTech.file!.toString(), 'ZIP');
  assert.equal(withTech.dropped, undefined);

  const heavy = att.reportFile(() => Buffer.alloc(REPORT_SEALED_MAX), true, list);
  assert.equal(heavy.dropped, true);
  assert.ok(heavy.file!.includes('pieces-jointes/capture.jpg'), 'les pièces jointes restent');

  const alone = att.reportFile(() => assert.fail('pas de rapport technique'), false, list);
  assert.ok(alone.file!.includes('pieces-jointes/capture.jpg'));
  assert.deepEqual(att.reportFile(() => undefined, false, []), {});
});

function setup(picked: string[][]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pj-menu-'));
  const sent: { envelope: ReportEnvelope; file?: Uint8Array }[] = [];
  const techFiles: string[][] = [];
  let shown: Build | undefined;
  let typed: string | undefined;
  const menu = createFeedbackMenu({
    dataDir,
    service: fakeFeedbackService({
      net: () => 'ok',
      canWrite: () => true,
      propose: async () => ({ ok: true, id: 'prop0000001' }),
      sendReport: async (envelope: ReportEnvelope, file?: Uint8Array) => (sent.push({ envelope, ...(file ? { file } : {}) }), 'sent'),
    }),
    version: '9.9.9',
    language: () => 'fr',
    openCustom: (build: Build) => (shown = build),
    openSystem: () => undefined,
    prompt: (_h: string, _l: string, _v: string, done: (value: string | undefined) => void) => done(typed),
    showing: (build: Build) => shown === build,
    techReport: (text: string, files?: { name: string }[]) => (techFiles.push((files ?? []).map((f) => f.name)), Buffer.from(`ZIP ${text}`)),
    pick: async () => picked.shift(),
    log: () => undefined,
  });
  return {
    menu,
    sent,
    techFiles,
    screen: () => shown!(),
    type: (value: string) => (typed = value),
    action: (key: string) => shown!().actions.find((a) => a.key === key),
    done: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('formulaire : joindre aux flippers, retirer par Start, envoyer en privé avec le rapport', async () => {
  const s = sandbox();
  const shot = s.file('capture.png', 3000);
  const ini = s.file('Glass Lagoon.ini', 200);
  const f = setup([[shot, ini], [s.file('trop.bin', att.ATTACHMENTS_BYTES_MAX + 10)]]);
  try {
    f.menu.openForm({}, () => undefined);
    assert.match(f.action('attach:pick')!.detail!, /privé, lu par l’équipe seule/);
    assert.match(f.screen().lead!, /fichiers joints restent privés/);
    await f.action('attach:pick')!.run();
    await settle();
    const section = f.screen().sections.find((x) => x.title === 'Fichiers joints · privés')!;
    assert.deepEqual(section.rows.map((r) => r.text), ['capture.png', 'Glass Lagoon.ini']);
    // Un fichier trop lourd : refusé et dit, les autres gardés.
    await f.action('attach:pick')!.run();
    await settle();
    const after = f.screen().sections.find((x) => x.title === 'Fichiers joints · privés')!;
    assert.equal(after.rows.length, 3);
    // Le refus en tête : sous les fichiers, une liste qui défile le cacherait.
    assert.equal(after.rows[0]!.tone, 'warning');
    assert.match(after.rows[0]!.text, /trop\.bin.*trop lourd/);
    assert.match(f.action('attach:pick')!.detail!, /sur 1,2 Mo/);
    // Start sur une ligne : le fichier est retiré.
    f.action('attach:remove:Glass Lagoon.ini')!.run();
    assert.deepEqual(f.screen().sections.find((x) => x.title === 'Fichiers joints · privés')!.rows.map((r) => r.text), ['capture.png']);
    // Envoyer en privé : un fichier suffit, il part dans le ZIP du rapport technique.
    await f.action('feedback:private')!.run();
    await settle();
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.techFiles.at(-1), ['pieces-jointes/capture.png']);
    assert.ok(f.screen().sections[0]!.rows.some((r) => /avec 1 fichier joint/.test(r.detail ?? '')));
  } finally {
    f.done();
    s.done();
  }
});

test('formulaire : publier une idée avec des fichiers les envoie à l’équipe en privé, jamais publiés', async () => {
  const s = sandbox();
  const f = setup([[s.file('maquette.png', 500)]]);
  try {
    f.menu.openForm({}, () => undefined, 'feature');
    f.type('Trier la roue par fabricant');
    f.action('feedback:title')!.run();
    await f.action('attach:pick')!.run();
    await settle();
    await f.action('feedback:publish')!.run();
    await settle();
    assert.equal(f.sent.length, 1, 'le rapport privé part avec les fichiers');
    assert.equal(f.sent[0]!.envelope.proposal, 'prop0000001');
    assert.ok(Buffer.from(f.sent[0]!.file!).includes('pieces-jointes/maquette.png'), 'sans rapport technique demandé : le ZIP des fichiers seuls');
  } finally {
    f.done();
    s.done();
  }
});

test('rapport aux développeurs : déjà prévenus, des fichiers seuls suffisent et partent sans rapport technique', async () => {
  const s = sandbox();
  const f = setup([[s.file('capture.png', 800)]]);
  try {
    f.menu.openSendReport({ about: 'Glass Lagoon · VPX arrêté', signature: 'vpx:0xC0000005:glass', notified: true }, () => undefined);
    assert.equal(f.action('devreport:send')!.tone, 'quiet');
    await f.action('attach:pick')!.run();
    await settle();
    const send = f.action('devreport:send')!;
    assert.equal(send.label, 'Envoyer mes fichiers');
    assert.equal(send.tone, 'ok');
    await send.run();
    await settle();
    assert.equal(f.techFiles.length, 0, 'le rapport technique ne repart pas');
    assert.ok(Buffer.from(f.sent[0]!.file!).includes('pieces-jointes/capture.png'));
    assert.ok(f.screen().sections.some((x) => x.rows.some((r) => /avec 1 fichier joint/.test(r.detail ?? ''))));
  } finally {
    f.done();
    s.done();
  }
});
