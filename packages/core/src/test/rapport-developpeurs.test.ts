// « Envoyer un rapport aux développeurs » (app/src/feedback-menu.ts, compilé) : d'une partie échouée
// et du Diagnostic d'une table, un appui envoie le rapport (le problème déjà connu, la fiche technique
// jointe) ; un plantage dont le rapport automatique est parti le dit sur son écran (« les
// développeurs ont été prévenus ») et le flipper n'envoie plus que la description du joueur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { loadFeedbackState, saveFeedbackState, type ReportEnvelope } from '../feedback';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Action {
  label: string;
  detail?: string;
  tone?: string;
  key?: string;
  attention?: boolean;
  run: () => void | Promise<void>;
}
interface Built {
  heading: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string }[] }[];
  actions: Action[];
}
type Build = () => Built;
interface DevReport {
  about: string;
  table?: string;
  signature: string;
  findings?: string[];
  notified?: boolean;
}
type Outcome = 'ask' | 'sent' | 'known' | 'off';

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFeedbackMenu, doctorReport, noteCrashOutcome } = require(path.join(APP_DIST, 'feedback-menu.js')) as {
  createFeedbackMenu(ctx: object): {
    crashed(signature: string, table: string | undefined, about: string): Outcome;
    openSendReport(report: DevReport, back: () => void): void;
    openForm(context: { text?: string }, back: () => void, kind?: string): void;
  };
  doctorReport(table: { id: string; title: string }, findings: { code: string; title: string; detail?: string }[], repaired?: string[]): DevReport;
  noteCrashOutcome(message: { report?: { consent?: boolean; notified?: boolean } }, outcome: Outcome): void;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(consent?: 'yes' | 'no') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rapport-dev-'));
  if (consent) saveFeedbackState(dataDir, { ...loadFeedbackState(dataDir), crashes: consent });
  const sent: { envelope: ReportEnvelope; file?: Uint8Array }[] = [];
  let shown: Build | undefined;
  let typed: string | undefined;
  const menu = createFeedbackMenu({
    dataDir,
    service: {
      refreshIfOld: async () => undefined,
      list: () => [],
      net: () => 'ok',
      canWrite: () => true,
      queuedCount: () => 0,
      sendReport: async (envelope: ReportEnvelope, file?: Uint8Array) => (sent.push({ envelope, ...(file ? { file } : {}) }), 'sent'),
    },
    version: '9.9.9',
    language: () => 'fr',
    openCustom: (build: Build) => (shown = build),
    openSystem: () => undefined,
    prompt: (_h: string, _l: string, _v: string, done: (value: string | undefined) => void) => done(typed),
    showing: (build: Build) => shown === build,
    techReport: (text: string) => Buffer.from(`ZIP ${text}`),
    log: () => undefined,
  });
  return {
    menu,
    sent,
    dataDir,
    screen: () => shown!(),
    type: (value: string) => (typed = value),
    action: (key: string) => shown!().actions.find((a) => a.key === key)!,
    done: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('rapport aux développeurs : un plantage dit ce qu’il a fait (question, envoyé, déjà envoyé, refusé)', () => {
  const ask = setup();
  assert.equal(ask.menu.crashed('vpx:0xC0000005:t', 'Table', 'Table · VPX arrêté'), 'ask');
  assert.equal(ask.sent.length, 0);
  ask.done();

  const yes = setup('yes');
  assert.equal(yes.menu.crashed('vpx:0xC0000005:t', 'Table', 'Table · VPX arrêté'), 'sent');
  assert.equal(yes.sent.length, 1);
  assert.equal(yes.sent[0]!.envelope.kind, 'crash');
  assert.ok(yes.sent[0]!.file, 'le plantage part avec la fiche technique');
  // Le même plantage le même jour : les développeurs l'ont déjà, rien ne repart.
  assert.equal(yes.menu.crashed('vpx:0xC0000005:t', 'Table', 'Table · VPX arrêté'), 'known');
  assert.equal(yes.sent.length, 1);
  yes.done();

  const no = setup('no');
  assert.equal(no.menu.crashed('vpx:0xC0000005:t', 'Table', 'Table · VPX arrêté'), 'off');
  assert.equal(no.sent.length, 0);
  no.done();
});

test('rapport aux développeurs : l’écran de la partie échouée montre l’encart « L’équipe a été prévenue »', () => {
  for (const outcome of ['sent', 'known'] as const) {
    const message = { lines: ['VPX s’est arrêté.'], report: {} as { consent?: boolean; notified?: boolean } };
    noteCrashOutcome(message, outcome);
    // L'encart (frontend.js), pas une ligne de plus dans l'erreur.
    assert.deepEqual(message, { lines: ['VPX s’est arrêté.'], report: { notified: true } });
  }
  const ask = { lines: ['VPX s’est arrêté.'], report: {} as { consent?: boolean; notified?: boolean } };
  noteCrashOutcome(ask, 'ask');
  assert.deepEqual(ask, { lines: ['VPX s’est arrêté.'], report: { consent: true } });
  const off = { lines: ['VPX s’est arrêté.'], report: {} as { consent?: boolean; notified?: boolean } };
  noteCrashOutcome(off, 'off');
  assert.deepEqual(off, { lines: ['VPX s’est arrêté.'], report: {} });
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  // Dans la colonne du message : mêmes bords que le texte de l'erreur.
  assert.match(renderer, /if \(s\.message\.report\?\.notified\) box\.append\(teamNotified\(\)\)/);
  assert.match(renderer, /el\('span', 'team-notified-mark', '👌'\)/);
  assert.match(renderer, /t\('L’équipe a été prévenue'\)/);
});

test('rapport aux développeurs : le Diagnostic d’une table l’envoie d’un appui, constats et fiche technique joints', async () => {
  const s = setup('no');
  let back = 0;
  const report = doctorReport({ id: 'glass-lagoon', title: 'Glass Lagoon' }, [{ code: 'romMissing', title: 'ROM absente', detail: 'gl_l1.zip' }], ['Copier le dossier du DMD']);
  assert.equal(report.signature, 'diagnostic:romMissing:glass-lagoon');
  s.menu.openSendReport(report, () => back++);
  assert.equal(s.screen().heading, 'Envoyer un rapport aux développeurs');
  const send = s.action('devreport:send');
  assert.equal(send.tone, 'ok', 'rien à écrire avant d’envoyer');
  await send.run();
  await settle();
  assert.equal(s.sent.length, 1);
  const { envelope, file } = s.sent[0]!;
  assert.equal(envelope.kind, 'report');
  assert.equal(envelope.table, 'Glass Lagoon');
  assert.match(envelope.text!, /ROM absente : gl_l1\.zip/);
  assert.match(envelope.text!, /Réparé : Copier le dossier du DMD/);
  assert.ok(file && Buffer.from(file).toString().includes('ROM absente'), 'la fiche technique jointe porte les constats');
  const after = s.screen();
  assert.ok(after.sections.some((sec) => sec.rows.some((r) => r.text === 'Rapport envoyé aux développeurs')));
  assert.deepEqual(after.actions.map((a) => a.label), ['Retour']);
  await after.actions[0]!.run();
  assert.equal(back, 1);
  // Envoyé à la main : un « Oui » aux rapports automatiques ne le renverrait pas aujourd'hui.
  assert.ok(loadFeedbackState(s.dataDir).sent[report.signature]);
  s.done();
});

test('rapport aux développeurs : déjà prévenus, seule la description part, sans fiche technique', async () => {
  const s = setup('yes');
  s.menu.openSendReport({ about: 'Glass Lagoon · VPX arrêté', table: 'Glass Lagoon', signature: 'vpx:0xC0000005:glass-lagoon', notified: true }, () => undefined);
  const screen = s.screen();
  assert.equal(screen.heading, 'Ajouter des détails pour les développeurs');
  assert.ok(screen.sections.some((sec) => sec.rows.some((r) => r.text === 'Les développeurs ont été prévenus de ce plantage')));
  // Sans description, rien à envoyer : l'action le dit et n'envoie rien.
  assert.equal(s.action('devreport:send').tone, 'quiet');
  assert.equal(s.action('devreport:text').attention, true);
  await s.action('devreport:send').run();
  await settle();
  assert.equal(s.sent.length, 0);
  s.type('La bille s’est figée au multiball');
  await s.action('devreport:text').run();
  await s.action('devreport:send').run();
  await settle();
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0]!.file, undefined, 'le rapport technique est déjà parti avec le rapport automatique');
  assert.match(s.sent[0]!.envelope.text!, /La bille s’est figée au multiball/);
  s.done();
});

test('rapport aux développeurs : le flipper de la partie échouée le propose, et le Diagnostic a son entrée', () => {
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /Flipper : envoyer un rapport aux développeurs/);
  assert.match(renderer, /Flipper : ajouter des détails pour les développeurs/);
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.match(library, /feedback\.openSendReport\(doctorReport\(/);
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /noteCrashOutcome\(message, library\.feedback\.crashed\(/);
});

test('formulaire des retours : « Envoyer à l’équipe seulement » avant « Publier en public », le privé mis en avant pour un problème', () => {
  for (const kind of ['bug', 'feature']) {
    const s = setup();
    s.type('Le DMD reste noir sur Glass Lagoon');
    s.menu.openForm({ text: 'Depuis la dernière mise à jour.' }, () => undefined, kind);
    s.action('feedback:title').run();
    const keys = s.screen().actions.map((a) => a.key);
    assert.ok(keys.indexOf('feedback:private') >= 0 && keys.indexOf('feedback:private') + 1 === keys.indexOf('feedback:publish'), `${kind} : le privé juste avant le public (${keys.join(', ')})`);
    assert.equal(s.action('feedback:publish').label, 'Publier en public');
    assert.equal(s.action('feedback:private').tone, kind === 'bug' ? 'ok' : undefined);
    assert.equal(s.action('feedback:publish').tone, kind === 'bug' ? undefined : 'ok');
    s.done();
  }
});
