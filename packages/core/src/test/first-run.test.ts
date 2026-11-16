// Premier lancement d'une borne à Pinscape (12/11/2026) : l'assistant s'ouvrait avant l'installation
// de VPX, dont la bibliothèque SDL lit les boutons et le lanceur d'un joystick ; sur un Windows neuf,
// cette bibliothèque ne se chargeait pas non plus sans le runtime Visual C++. Une borne qui n'avait
// que ces boutons ne pouvait ni relever ses boutons, ni son lanceur, ni avancer dans l'assistant.
// Les règles (first-run.ts) et leur branchement dans l'assistant, le menu et l'installeur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { JOYSTICK_RETURN_PHASES, joystickButtonsUnrecorded, joystickReturnsToButtons, JOYSTICK_STEPS, menuWaitsForVpx, wizardInstallsVpx, type WizardVpx } from '../first-run';
import { WIZARD_PHASES } from '../wizardsteps';
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

test('pendant l’installation de VPX, le menu attend sa fin', () => {
  const states: WizardVpx[] = [{ state: 'none' }, { state: 'installing', percent: 40, offline: false }, { state: 'ready', version: '10.8.1-5436' }, { state: 'failed', reason: 'pas de réseau' }];
  assert.deepEqual(states.map(menuWaitsForVpx), [false, true, false, false]);
});

test('un bouton de joystick ramène au relevé tant qu’aucun bouton de la borne n’en est un, aux étapes où il n’a pas de rôle', () => {
  const joy = 'SDLJoy_0300f1c2fa2a0000eaf7000000010000_1;3';
  const clavier = { buttons: { leftFlipper: 'ShiftLeft', start: 'Digit1' } };
  for (const phase of WIZARD_PHASES) assert.equal(joystickReturnsToButtons(phase, joy, clavier), JOYSTICK_RETURN_PHASES.includes(phase), phase);
  // Le lanceur et le tilt lisent le joystick ; le relevé le relève ; « flip » attend sa confirmation.
  for (const phase of ['plunger', 'tilt', 'buttons', 'buttonsSummary', 'navigation', 'navigationSummary', 'flip', 'done'] as const) assert.ok(!JOYSTICK_RETURN_PHASES.includes(phase), phase);
  assert.equal(joystickReturnsToButtons('assign', joy, undefined), true, 'borne neuve, touches par défaut gardées');
  assert.equal(joystickReturnsToButtons('assign', 'KeyA', clavier), false, 'une touche du clavier');
  // Un bouton du jeu ou de l'interface déjà au joystick : ses boutons ont un rôle.
  assert.equal(joystickReturnsToButtons('assign', joy, { buttons: { leftFlipper: joy } }), false);
  assert.equal(joystickReturnsToButtons('assign', joy, { ...clavier, navigation: { confirm: 'SDLJoy_x_1;8' } }), false);
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
  // Le délai du premier écran court pendant l'installation (16/11/2026 : suspendu, il figeait l'écran
  // quand le téléchargement n'aboutissait pas) ; le retour au relevé par le joystick prend le relais.
  assert.doesNotMatch(body(wizard, 'startButtonsCountdown'), /vpxPrep|buttonsWaitForVpx/, 'le délai ne dépend pas de VPX');
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

// Invariant (16/11/2026, retour d'un testeur) : le premier écran des boutons d'une borne neuve se
// quitte toujours, sans relever ni attendre VPX. Le parcours réel est essayé au clavier par
// clavier-reel.test.ts ; ici, ce qui le garantit dans le code.
test('premier écran des boutons : un choix, jamais un relevé, et toujours une sortie', () => {
  const wizard = read('app', 'src', 'wizard.ts');
  // Borne neuve, assistant complet : le choix d'abord, jamais le relevé d'emblée, et sur les boutons
  // de l'interface, qui pilotent les menus et toute la suite (16/11/2026 : il portait sur ceux du jeu).
  assert.match(body(wizard, 'startButtons'), /if \(wizard\.buttons === undefined\) return startChoice\(\);/);
  assert.match(body(wizard, 'startChoice'), /wizard\.phase = 'buttonsChoice';\s*wizard\.capture = \{ set: INTERFACE_KEYS,/);
  assert.match(body(wizard, 'startChoice'), /deadline: Date\.now\(\) \+ BUTTONS_TIMEOUT_MS/);
  // Les appuis de ce premier écran choisissent au relâchement, avant tout relevé.
  const key = body(wizard, 'handleKey');
  const choiceAt = key.indexOf("if (wizard.phase === 'buttonsChoice') {");
  assert.ok(choiceAt >= 0 && choiceAt < key.indexOf('if (CAPTURE_PHASES.includes(wizard.phase))'), 'le choix passe avant le relevé');
  const up = body(wizard, 'handleKeyUp');
  assert.ok(up.indexOf('handleChoiceKey(') >= 0 && up.indexOf('handleChoiceKey(') < up.indexOf('handleButtonKey('), 'aucun appui du premier écran n’est relevé');
  // Comme tout menu : flippers et flèches choisissent sans changer d'écran (16/11/2026 : une flèche
  // gardait les touches et passait aux boutons de l'interface) ; Start ou Entrée valident ; Exit : modifier.
  const choice = body(wizard, 'handleChoiceKey');
  assert.match(choice, /if \(is\(KEYS\.previous\) \|\| is\(KEYS\.next\)\) \{\s*touched\(capture\);\s*capture\.action = [^;]+;\s*\}/);
  assert.doesNotMatch(choice.slice(0, choice.indexOf('is(KEYS.confirm)')), /runButtonsAction/, 'un flipper ou une flèche ne lance rien');
  assert.match(choice, /is\(KEYS\.confirm\)\) runButtonsAction\(CHOICE_ACTIONS\[capture\.action\]/);
  assert.match(choice, /is\(KEYS\.exit\)[^\n]*runButtonsAction\('modify'\)/);
  // Garder : l'assistant continue ; modifier : les boutons de l'interface d'abord (16/11/2026).
  assert.match(body(wizard, 'runButtonsAction'), /case 'keep':[\s\S]*?return reviewSet\(GAME_KEYS, gameFromNavigation\(wizard\.navigation\), FROM_INTERFACE_LAST\);\s*case 'modify':[\s\S]*?return startCapture\(INTERFACE_KEYS\);/);
  // Après l'interface, les boutons du jeu proposés sur les mêmes boutons.
  assert.match(body(wizard, 'acceptButtons'), /capture\.set === INTERFACE_KEYS\)[\s\S]*?gameFromNavigation\(wizard\.navigation\)/);
  // « ◀ Précédent » au récapitulatif ou au premier bouton : l'étape d'avant, jamais un tour sur place.
  assert.match(body(wizard, 'previousButton'), /if \(summary \|\| capture\.index === 0\) return previousStep\(\);/);
  assert.match(body(wizard, 'previousStepOf'), /if \(set === GAME_KEYS\) return 'interface';/);
  // Le délai court pendant ce premier écran, et dit ce qui se passera à la fin.
  assert.match(body(wizard, 'startButtonsCountdown'), /wizard\.phase === 'buttonsChoice' \|\| CAPTURE_PHASES\.includes/);
  assert.match(body(wizard, 'choiceView'), /Sans réponse dans \{n\} s : ces touches sont gardées/);
  // Pendant l'installation de VPX, l'écran dit que le clavier marche tout de suite.
  assert.match(body(wizard, 'joystickLine'), /le clavier marche tout de suite/);
});

test('récapitulatif des boutons : « Valider » grisé avec sa raison dès l’arrivée', () => {
  const wizard = read('app', 'src', 'wizard.ts');
  const view = body(wizard, 'buttonsView');
  assert.match(view, /Faire : \{buttons\}/);
  // Dit une seule fois : ni la ligne d'étape ni l'aide ne répètent les boutons à presser.
  assert.doesNotMatch(view, /Essai des touches relevées|à essayer aussi/);
  assert.match(view, /id === 'save' && saveReason && \{ disabled: true, reason: saveReason \}/);
  const screen = read('app', 'renderer', 'screen.js');
  assert.match(screen, /a\.disabled && 'disabled'/);
  assert.match(screen, /reason\.className = 'action-reason'/);
});
