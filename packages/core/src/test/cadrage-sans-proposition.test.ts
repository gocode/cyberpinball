// Cadrage jamais proposé d'office (27/11/2026) : les propositions automatiques ne sont pas encore assez sûres, et une
// table qui a déjà son cadrage (installation d'origine, vue réglée pour elle, POV) n'a rien à gagner à s'en voir proposer
// un autre. Le parcours de la table ne propose que les vrais défauts d'affichage ; le diagnostic mène à « Point de vue »
// au lieu d'une correction d'un appui, et « Tout réparer » ne touche jamais au cadrage (framing-choice.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Finding, FindingSeverity } from '../doctor';
import { FRAMING_CHOICE_CODES, isFramingChoice } from '../framing-choice';
import { journeyChoices, planJourney, type JourneyInput } from '../journey';

const ROOT = path.resolve(__dirname, '../../../..');

const finding = (code: Finding['code'], severity: FindingSeverity): Finding => ({ code, severity, title: `Titre ${code}`, detail: 'Détail.', fix: { label: `Corriger ${code}`, ops: [] } });

function input(findings: Finding[]): JourneyInput {
  return { file: 'C:\\t\\Table.vpx', vpxInstalled: true, cabinetConfigured: true, screens: { backglass: false, dmd: 'none', topper: false }, findings, cabinetView: true };
}

test('parcours : le cadrage que la table a déjà n’est jamais remis en cause, aucun autre n’est proposé', () => {
  const cases: [Finding['code'], FindingSeverity][] = [...FRAMING_CHOICE_CODES.flatMap((c) => [[c, 'info'], [c, 'warning']] as [Finding['code'], FindingSeverity][]), ['tableOrientation', 'info']];
  for (const [code, severity] of cases) {
    const label = `${code} (${severity})`;
    assert.equal(isFramingChoice({ code, severity }), true, label);
    const journey = planJourney(input([finding(code, severity)]));
    const display = journey.extras.find((s) => s.id === 'display');
    assert.equal(display?.state, 'done', `${label} : l’étape est réglée`);
    assert.equal(journey.proposed, 0, `${label} : aucune amélioration proposée`);
    assert.ok(!display!.choices.some((c) => c.action.kind === 'repair' || c.action.kind === 'fetch' || c.action.kind === 'choose'), `${label} : ni correction ni POV à récupérer`);
    assert.ok(!journeyChoices(journey).some(({ step }) => step.id === 'display'), `${label} : aucun geste à l’écran`);
  }
  // Le cadrage que la table suit est dit, sans rien proposer.
  assert.equal(planJourney(input([finding('originFraming', 'info')])).extras.find((s) => s.id === 'display')?.detail, 'Titre originFraming.');
  // « Choisir le cadrage » reste rangé dans l'étape, jamais mis en avant.
  assert.ok(planJourney(input([])).extras.find((s) => s.id === 'display')?.choices.every((c) => c.action.kind === 'framing'));
});

test('parcours : un vrai défaut d’affichage se propose toujours', () => {
  const sideways = planJourney(input([finding('originFraming', 'info'), finding('tableOrientation', 'warning')]));
  const display = sideways.extras.find((s) => s.id === 'display')!;
  assert.equal(display.state, 'todo');
  assert.equal(display.choices[0]?.action.kind, 'repair');
  assert.equal(display.choices[0]?.primary, true);
  assert.equal(isFramingChoice({ code: 'tableOrientation', severity: 'warning' }), false, 'sens vérifié : un défaut, pas un choix');
  for (const code of ['tableWindows', 'fullDmdHidden'] as const) {
    assert.equal(isFramingChoice({ code, severity: 'info' }), false, code);
    assert.equal(planJourney(input([finding(code, 'info')])).extras.find((s) => s.id === 'display')?.state, 'optional', code);
  }
});

test('garde : le parcours ne propose plus de POV de la communauté, le diagnostic ne répare pas un cadrage', () => {
  const journey = fs.readFileSync(path.join(ROOT, 'packages/core/src/journey.ts'), 'utf8');
  assert.doesNotMatch(journey, /(?<!function )gameSources\([^)]*'pov'/,'POV de la communauté : seulement dans « Point de vue » (Chercher un POV en ligne)');
  const library = fs.readFileSync(path.join(ROOT, 'app/src/library.ts'), 'utf8');
  assert.match(library, /const fixable = findings\.filter\(\(f\) => f\.fix && !isFramingChoice\(f\)\);/, '« Tout réparer » sans les cadrages');
  assert.match(library, /if \(f\.fix && isFramingChoice\(f\)\) \{[^}]*tablePov\.open\(/, 'un cadrage mène à « Point de vue »');
});
