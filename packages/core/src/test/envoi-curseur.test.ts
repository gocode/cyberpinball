// Start n'envoie que ce que le joueur a choisi. Le 21/11/2026, 18 des 29 rapports reçus du Diagnostic
// d'une table disaient « Aucun problème détecté », sans un mot du joueur : sur une table sans constat,
// « Envoyer un rapport aux développeurs » était la première action, sous le curseur à l'arrivée, et
// l'écran d'envoi s'ouvrait sur « Envoyer le rapport ». Deux appuis sur Start pour passer la table
// envoyaient un rapport vide.
//
// Invariants :
// - à l'arrivée sur un écran (écran neuf, ou premier affichage après une opération longue), le curseur
//   n'est jamais sur une action qui envoie (`sends: true`, focus.ts `arrivalCursor`) ; ailleurs, les
//   flippers l'atteignent normalement ;
// - toute action « Envoyer… », « Publier… », « Partager… » de app/src le déclare (`sends`) ;
// - un Diagnostic sans constat pose le curseur sur sa dernière action (table suivante, fiche), et son
//   rapport ne part qu'avec une description ou un fichier joint.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { anchorOf, arrivalCursor } from '../focus';
import type { ReportEnvelope } from '../feedback';
import { fakeFeedbackService } from './doublures';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');

test('envoi et curseur : à l’arrivée, le curseur passe une action qui envoie', () => {
  const screen = {};
  const avoid = [true, false, false];
  // Écran neuf : pas d'ancre, ou l'ancre d'un autre écran.
  assert.equal(arrivalCursor(0, avoid, screen, undefined), 1);
  assert.equal(arrivalCursor(0, avoid, screen, anchorOf({}, 0, ['a', 'b', 'c'], false)), 1);
  // Premier affichage après une opération longue (analyse du Diagnostic) : une arrivée aussi.
  assert.equal(arrivalCursor(0, avoid, screen, anchorOf(screen, 0, ['a', 'b'], true)), 1);
  // Même écran, déjà montré : le joueur y est venu aux flippers, il y reste.
  assert.equal(arrivalCursor(0, avoid, screen, anchorOf(screen, 1, ['a', 'b', 'c'], false)), 0);
  // La suivante qui n'envoie pas, sinon la première ; tout envoie : rien à faire de mieux.
  assert.equal(arrivalCursor(2, [false, true, true], screen, undefined), 0);
  assert.equal(arrivalCursor(1, [true, true], screen, undefined), 1);
  assert.equal(arrivalCursor(1, [false, false], screen, undefined), 1);
});

test('envoi et curseur : la vue applique la règle, chaque action « Envoyer / Publier / Partager » se déclare', () => {
  const library = fs.readFileSync(path.join(APP_SRC, 'library.ts'), 'utf8');
  assert.match(library, /cursor = arrivalCursor\(cursor, built\.actions\.map\(\(a\) => a\.sends === true\), screen, anchor\)/);
  const missing: string[] = [];
  for (const name of fs.readdirSync(APP_SRC).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(APP_SRC, name), 'utf8');
    for (const m of text.matchAll(/label:\s*(?:[^,{}()]*\?\s*)?t\('(?:Envoyer|Publier|Partager)[^']*'\)/g)) {
      const start = m.index!;
      // Menus du téléphone (toRemoteEntry, ouvert plus haut et pas encore refermé par son geste) : une liste sans curseur.
      if (/toRemoteEntry\((?![\s\S]*\b(?:run|pick):)/.test(text.slice(Math.max(0, start - 400), start))) continue;
      const end = text.indexOf('run:', start);
      if (end < 0 || !/\bsends: /.test(text.slice(start, end))) missing.push(`${name}:${text.slice(0, start).split('\n').length} ${m[0]}`);
    }
  }
  assert.deepEqual(missing, [], 'déclarer `sends: true` (ou `\'confirmation\'` pour le bouton de l’écran ouvert pour envoyer)');
});

test('envoi et curseur : le Diagnostic sans constat mène plus loin, son entrée de rapport envoie', () => {
  const library = fs.readFileSync(path.join(APP_SRC, 'library.ts'), 'utf8');
  assert.match(library, /key: 'doctor:report',\s*sends: true,/);
  // Un cadrage à choisir (framing-choice.ts) ne retient pas le curseur non plus.
  assert.match(library, /cursor = findings\.every\(\(f\) => \(f\.note && !f\.fix\) \|\| \(f\.fix && isFramingChoice\(f\)\)\) \? Number\.MAX_SAFE_INTEGER : 0;/);
  // « Table suivante » / « Retour à la fiche » reste la dernière action du Diagnostic.
  const doctor = library.slice(library.indexOf('function buildDoctor('), library.indexOf('function buildDoctor(') + 6000);
  const next = doctor.indexOf("key: 'doctor:next'");
  assert.ok(next > 0);
  assert.equal(doctor.slice(next, doctor.indexOf('const romChecked')).match(/actions\.push\(/g), null, 'aucune action après « doctor:next »');
});

interface Action {
  label: string;
  key?: string;
  tone?: string;
  detail?: string;
  attention?: boolean;
  sends?: true | 'confirmation';
  run: () => void | Promise<void>;
}
type Build = () => { heading: string; actions: Action[] };

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFeedbackMenu, doctorReport } = require(path.join(REPO_ROOT, 'app', 'dist', 'feedback-menu.js')) as {
  createFeedbackMenu(ctx: object): { openSendReport(report: object, back: () => void): void };
  doctorReport(table: { id: string; title: string }, findings: { code: string; title: string }[], repaired?: string[]): { needsText?: boolean };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('envoi et curseur : un rapport du Diagnostic sans constat ne part qu’avec une description', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-envoi-curseur-'));
  const sent: ReportEnvelope[] = [];
  let shown: Build | undefined;
  let typed: string | undefined;
  const menu = createFeedbackMenu({
    dataDir,
    service: fakeFeedbackService({ net: () => 'ok', canWrite: () => true, sendReport: async (envelope: ReportEnvelope) => (sent.push(envelope), 'sent') }),
    version: '9.9.9',
    language: () => 'fr',
    openCustom: (build: Build) => (shown = build),
    openSystem: () => undefined,
    prompt: (_h: string, _l: string, _v: string, done: (value: string | undefined) => void) => done(typed),
    showing: (build: Build) => shown === build,
    techReport: (text: string) => Buffer.from(`ZIP ${text}`),
    log: () => undefined,
  });
  const action = (key: string) => shown!().actions.find((a) => a.key === key)!;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    const report = doctorReport({ id: 'glass-lagoon', title: 'Glass Lagoon' }, []);
    assert.equal(report.needsText, true);
    // Avec un constat, le rapport a de quoi parler : rien à exiger.
    assert.equal(doctorReport({ id: 'glass-lagoon', title: 'Glass Lagoon' }, [{ code: 'romMissing', title: 'ROM absente' }]).needsText, undefined);
    menu.openSendReport(report, () => undefined);
    assert.equal(action('devreport:send').sends, 'confirmation');
    assert.equal(action('devreport:send').tone, 'quiet');
    assert.equal(action('devreport:text').attention, true);
    await action('devreport:send').run();
    await settle();
    assert.equal(sent.length, 0, 'Start, Start : rien ne part');
    typed = 'Le DMD reste noir';
    await action('devreport:text').run();
    await action('devreport:send').run();
    await settle();
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.text!, /Le DMD reste noir/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
