// Numéro de la borne pour l'équipe (demande du 18/11/2026) : les rapports portaient un identifiant tiré
// au hasard (ReportEnvelope.borne) que le joueur ne voyait nulle part ; impossible de savoir quel joueur
// avait envoyé quel rapport. Il est montré, discrètement, en dernière ligne du bloc Cyber Pinball de la
// fiche technique, sous une forme facile à dicter, et la gestion des retours le retrouve.
// Invariants : le numéro est enregistré dès sa première lecture (il ne change plus d'un démarrage à
// l'autre) ; le code est stable, lisible (alphabet de Crockford) et se calcule pour les anciens rapports.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { borneCode, FEEDBACK_FILE, loadFeedbackState, techBlocks, type TechFacts } from '../index';
import { REPO_ROOT } from './i18n-scan';

test('le numéro de la borne est enregistré dès sa première lecture, puis ne change plus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-numero-borne-'));
  try {
    const first = loadFeedbackState(dir).borne;
    assert.ok(fs.existsSync(path.join(dir, FEEDBACK_FILE)), 'retours.json écrit dès la première lecture');
    assert.equal(loadFeedbackState(dir).borne, first);
    // Un numéro illisible est remplacé, et le remplaçant est gardé lui aussi.
    fs.writeFileSync(path.join(dir, FEEDBACK_FILE), JSON.stringify({ crashes: 'yes', borne: '!!', sent: {} }));
    const fixed = loadFeedbackState(dir);
    assert.notEqual(fixed.borne, '!!');
    assert.equal(fixed.crashes, 'yes', 'le réglage des rapports est gardé');
    assert.equal(loadFeedbackState(dir).borne, fixed.borne);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('code lisible : stable, 8 caractères de Crockford en deux groupes, distinct d’une borne à l’autre', () => {
  // Les bornes des rapports du 17/11/2026 : leurs codes se calculent après coup.
  const a = borneCode('uVc4m4HjMuZV');
  const b = borneCode('Cxm0DZCQi5M3');
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(borneCode('uVc4m4HjMuZV'), a);
  assert.notEqual(a, b);
  const many = new Set(Array.from({ length: 2000 }, (_, i) => borneCode(`borne-${i}`)));
  assert.equal(many.size, 2000);
});

test('fiche technique : le numéro en dernière ligne du bloc Cyber Pinball, en retrait', () => {
  const facts = { at: new Date().toISOString(), app: { version: '0.1.15', mode: 'cabinet', tables: 4, data: 'D:\\CyberPinball\\data', errors: 0, language: 'Français', borne: '7KQ2-M9XD' } } as unknown as TechFacts;
  const rows = techBlocks(facts).find((b) => b.id === 'app')!.sections.flatMap((s) => s.rows);
  const last = rows.at(-1)!;
  assert.equal(last.label, 'Numéro de la borne');
  assert.equal(last.value, '7KQ2-M9XD');
  assert.equal(last.state, 'quiet');
  // Le relevé de la fiche le prend dans l'état des retours, celui des rapports envoyés.
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.match(library, /borne: borneCode\(loadFeedbackState\(host\.dataDir\)\.borne\)/);
  // La gestion des retours (démonstration interne) le cherche, quand elle est là.
  const gestion = path.join(REPO_ROOT, 'interne', 'gestion-retours', 'main.cjs');
  if (fs.existsSync(gestion)) assert.match(fs.readFileSync(gestion, 'utf8'), /borneCode: core\.borneCode\(envelope\.borne\)/);
});
