// Premier lancement d'une borne à Pinscape (12/11/2026) : l'assistant s'ouvrait avant l'installation
// de VPX, dont la bibliothèque SDL lit les boutons et le lanceur d'un joystick ; sur un Windows neuf,
// cette bibliothèque ne se chargeait pas non plus sans le runtime Visual C++. Une borne qui n'avait
// que ces boutons ne pouvait ni relever ses boutons, ni son lanceur, ni avancer dans l'assistant.
// Les règles (first-run.ts) et leur branchement dans l'assistant, le menu et l'installeur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { buttonsWaitForVpx, joystickButtonsUnrecorded, JOYSTICK_STEPS, menuWaitsForVpx, wizardInstallsVpx, type WizardVpx } from '../first-run';
import { REPO_ROOT } from './i18n-scan';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
/** Le corps d'une fonction de `source`, de sa déclaration à la suivante. */
function body(source: string, name: string): string {
  const start = source.search(new RegExp(`\\n(export )?function ${name}\\(`));
  assert.ok(start >= 0, `fonction ${name} introuvable`);
  const next = source.slice(start + 1).search(/\n(export )?(async )?function \w+\(/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test('l’assistant installe VPX dès son ouverture, quand il manque et que l’étape lit les joysticks', () => {
  const borne = { root: 'D:\\CyberPinball', vpxInstalled: false, env: {} };
  // Assistant complet (premier lancement) et chaque étape qui lit un joystick.
  for (const step of JOYSTICK_STEPS) assert.equal(wizardInstallsVpx({ ...borne, step }), true, String(step));
  // Les étapes sans joystick n'ont pas à attendre VPX.
  for (const step of ['ecrans', 'playfield', 'disposition', 'son']) assert.equal(wizardInstallsVpx({ ...borne, step }), false, step);
  // VPX déjà là, ou pas d'installation (lancé depuis les sources) : rien à faire.
  assert.equal(wizardInstallsVpx({ ...borne, step: undefined, vpxInstalled: true }), false);
  assert.equal(wizardInstallsVpx({ ...borne, step: undefined, root: undefined }), false);
  // Jamais de téléchargement pendant un essai sans opérateur, sauf demandé.
  for (const env of [{ CYBERPINBALL_AUTOPILOT: 'wait:1' }, { CYBERPINBALL_HOME: 'tmp\\home' }, { CYBERPINBALL_HORS_ECRAN: '1' }, { NODE_TEST_CONTEXT: 'child' }]) {
    assert.equal(wizardInstallsVpx({ ...borne, step: undefined, env }), false, JSON.stringify(env));
    assert.equal(wizardInstallsVpx({ ...borne, step: undefined, env: { ...env, CYBERPINBALL_VPX_ASSISTANT: '1' } }), true, JSON.stringify(env));
  }
});

test('pendant l’installation de VPX, le relevé des boutons attend et le menu aussi', () => {
  const states: WizardVpx[] = [{ state: 'none' }, { state: 'installing', percent: 40, offline: false }, { state: 'ready', version: '10.8.1-5436' }, { state: 'failed', reason: 'pas de réseau' }];
  assert.deepEqual(states.map(buttonsWaitForVpx), [false, true, false, false]);
  assert.deepEqual(states.map(menuWaitsForVpx), [false, true, false, false]);
});

test('un joystick lu pour la première fois au menu fait proposer le relevé de ses boutons', () => {
  const clavier = { leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight', start: 'Digit1' };
  const pinscape = { ...clavier, leftFlipper: 'SDLJoy_0300f1c2fa2a0000eaf7000000010000_1;3' };
  assert.equal(joystickButtonsUnrecorded(clavier, 1), true);
  assert.equal(joystickButtonsUnrecorded(undefined, 1), true);
  assert.equal(joystickButtonsUnrecorded(pinscape, 1), false);
  assert.equal(joystickButtonsUnrecorded(clavier, 0), false);
});

test('l’assistant installe VPX avant le relevé, suspend son délai et retient le menu', () => {
  const wizard = read('app', 'src', 'wizard.ts');
  const start = body(wizard, 'startWizard');
  assert.ok(start.indexOf('prepareVpx()') >= 0 && start.indexOf('prepareVpx()') < start.indexOf('startMode()'), 'VPX avant la première étape');
  const prepare = body(wizard, 'prepareVpx');
  assert.match(prepare, /wizardInstallsVpx\(/);
  assert.match(prepare, /installVpx\(/);
  assert.match(prepare, /retryJoysticks\(\)/, 'joysticks relus dès VPX installé');
  assert.match(body(wizard, 'startCapture'), /buttonsWaitForVpx\(vpxPrep\)/, 'le délai de 20 s attend VPX');
  assert.match(body(wizard, 'continueToTables'), /menuWaitsForVpx\(vpxPrep\)/, 'la relance du menu attend VPX');
  // Aucune demande de Windows dans l'assistant : personne ne pourrait y répondre aux boutons.
  assert.doesNotMatch(wizard, /ensureVcRuntime|startElevated|askElevation/);
});

test('VPX ou son runtime installé au menu : les joysticks se relisent aussitôt', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  const ready = body(frontend, 'vpxReady');
  assert.match(ready, /retryJoysticks\(\)/);
  assert.match(ready, /joystickButtonsUnrecorded\(/);
  // Une bibliothèque qui n'avait pas pu se charger (runtime absent) se recharge.
  const joystick = read('app', 'src', 'joystick-input.ts');
  assert.match(body(joystick, 'retryJoysticks').replace(/^export /m, ''), /status = \{ state: 'off' \}/);
});

test('l’installeur pose le runtime Visual C++ avant le premier lancement, jamais sans quelqu’un devant l’écran', () => {
  const nsi = read('scripts', 'installeur', 'cyberpinball.nsi');
  const section = nsi.slice(nsi.indexOf('SEC_RUNTIME'), nsi.indexOf('SectionEnd', nsi.indexOf('SEC_RUNTIME')));
  assert.ok(section.length > 0, 'section du runtime');
  // Après l'application (son exécutable fait le travail) et l'archive de la version complète.
  assert.ok(nsi.indexOf('SEC_APP') < nsi.indexOf('SEC_RUNTIME'));
  assert.ok(nsi.indexOf('SEC_VPX') < nsi.indexOf('SEC_RUNTIME'));
  assert.match(section, /\$BacASable != ""/);
  assert.match(section, /\$Maj == "1"/);
  assert.match(section, /\$\{Silent\}/);
  assert.match(section, /runtime-vc\.js/);
  // Le mode Node n'est jamais hérité par « Lancer Cyber Pinball ».
  assert.ok(section.indexOf('"ELECTRON_RUN_AS_NODE", t "1"') < section.indexOf('"ELECTRON_RUN_AS_NODE", p 0'));
  // Le script est regroupé dans l'application et passe par la même installation vérifiée que le menu.
  assert.match(read('scripts', 'fabriquer.mjs'), /'runtime-vc\.js'/);
  assert.match(read('app', 'src', 'runtime-vc.ts'), /ensureVcRuntime\(/);
});
