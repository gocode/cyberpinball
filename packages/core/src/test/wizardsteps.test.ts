import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_BUTTONS, isInputKey } from '../buttons';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet } from '../model';
import { planVpxSync } from '../sync';
import { devPcDisplays, emptyCabinet } from './fixtures';
import {
  CAPTURE_PHASES,
  QUIT_HOLD_MS,
  WIZARD_FLAGS,
  WIZARD_PHASES,
  WIZARD_STEPS,
  cabinetChanges,
  isAudioKey,
  isLayoutKey,
  isQuitShortcut,
  quitDestination,
  quitHoldMs,
  stepCabinet,
  wizardStepOf,
} from '../wizardsteps';

// Assistant de la borne : chaque étape, seule ou enchaînée, a une sortie sans écriture,
// et chaque étape seule ne décide que de ses champs du modèle et de ses clés de VPX.
const REPO = path.join(__dirname, '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(REPO, ...parts), 'utf8');

/** Fonctions de premier niveau d'un module : nom -> texte jusqu'à la suivante. */
function topLevelFunctions(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const starts = [...text.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)];
  starts.forEach((m, i) => out.set(m[1]!, text.slice(m.index, starts[i + 1]?.index ?? text.length)));
  return out;
}

const fullCabinet = (): Cabinet => ({
  version: 1,
  screens: [
    { fingerprint: 'A', strength: 'strong', label: 'Écran A', widthPx: 1920, heightPx: 1080, widthCm: 52, heightCm: 29 },
    { fingerprint: 'B', strength: 'strong', label: 'Écran B', widthPx: 1280, heightPx: 1024, widthCm: 34, heightCm: 27 },
  ],
  roles: { playfield: 'A', backglass: 'B' },
  zones: { backglass: { x: 0, y: 0, width: 1, height: 0.75 } },
  playfield: { flipperEdge: 'left', manualSizeCm: { width: 90, height: 50 } },
  vpxManual: ['Input.Mapping.Start', 'Player.SoundDevice', 'Backglass.BackglassDisplay', 'Player.FXAA'],
  audio: { outputs: [], roles: { backglass: 'x' }, playfieldMode: 'stereo' },
  buttons: { ...DEFAULT_BUTTONS, start: 'Digit2' },
  vpx: { iniPath: 'C:\\avant\\VPinballX.ini' },
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const otherCabinet = (): Cabinet => ({
  version: 1,
  screens: [
    { fingerprint: 'A', strength: 'strong', label: 'Écran A (relu)', widthPx: 1080, heightPx: 1920, widthCm: 29, heightCm: 52 },
    { fingerprint: 'C', strength: 'weak', label: 'Écran C', widthPx: 1024, heightPx: 256, widthCm: 30, heightCm: 8 },
  ],
  roles: { playfield: 'A', dmd: 'C' },
  playfield: { flipperEdge: 'bottom' },
  audio: { outputs: [], roles: { playfield: 'y' }, playfieldMode: 'ssf' },
  buttons: { ...DEFAULT_BUTTONS, start: 'Digit3' },
  vpx: { iniPath: 'C:\\active\\VPinballX.ini' },
  updatedAt: '2026-10-21T00:00:00.000Z',
});

test('toute étape a une sortie sans enregistrer : Échap maintenue 2 s, Ctrl+Q, et n’importe quelle touche 3 s pendant le relevé', () => {
  for (const phase of WIZARD_PHASES.filter((p) => p !== 'done')) {
    assert.equal(quitHoldMs(phase, 'Escape', []), QUIT_HOLD_MS.exit, `${phase} : Échap maintenue`);
    assert.equal(quitHoldMs(phase, 'KeyQ', ['KeyQ']), QUIT_HOLD_MS.exit, `${phase} : Exit de la borne maintenu`);
    assert.ok(isQuitShortcut({ code: 'KeyQ', control: true }), `${phase} : Ctrl+Q`);
    // Pendant le relevé on ne sait pas quelle touche est Exit : toutes ouvrent la question.
    assert.equal(quitHoldMs(phase, 'KeyA', ['Escape']), CAPTURE_PHASES.includes(phase) ? QUIT_HOLD_MS.capture : undefined, `${phase} : autre touche maintenue`);
  }
  assert.ok(QUIT_HOLD_MS.capture > QUIT_HOLD_MS.exit && QUIT_HOLD_MS.exit >= 2000, 'un appui ordinaire ne dure jamais aussi longtemps');
  assert.equal(quitHoldMs('done', 'Escape', ['Escape']), undefined, 'enregistré : plus rien à quitter');
  assert.equal(isQuitShortcut({ code: 'KeyQ' }), false);
});

test('quitter sans enregistrer : retour au menu, ou fermeture annoncée au premier démarrage', () => {
  assert.equal(quitDestination(true).action, 'menu');
  assert.equal(quitDestination(false).action, 'close');
  assert.match(quitDestination(false).text, /se ferme.*prochain démarrage/);
});

test('étapes seules : options, phases et entrées du menu', () => {
  const ids = WIZARD_STEPS.map((s) => s.id);
  assert.deepEqual(ids, ['boutons', 'interface', 'lanceur', 'ecrans', 'playfield', 'disposition', 'son']);
  assert.equal(new Set(WIZARD_STEPS.map((s) => s.flag)).size, WIZARD_STEPS.length);
  for (const step of WIZARD_STEPS) {
    assert.ok(step.phases.length > 0 && step.phases.every((p) => WIZARD_PHASES.includes(p) && p !== 'done'), step.id);
    assert.ok(WIZARD_FLAGS.includes(step.flag), `${step.flag} retiré pour revenir au menu`);
    assert.equal(wizardStepOf(['electron', 'app', '--assistant', step.flag])?.id, step.id);
  }
  assert.equal(wizardStepOf(['electron', 'app', '--assistant']), undefined);
});

test('chaque étape seule ne reprend que ses clés de VPinballX.ini', () => {
  const step = (id: string) => WIZARD_STEPS.find((s) => s.id === id)!;
  const keys = ['Input.Mapping.Start', 'Player.SoundDevice', 'Player.SoundDeviceBG', 'Player.Sound3D', 'Player.PlayfieldDisplay', 'Player.BGSet', 'Player.ScreenWidth', 'Backglass.BackglassOutput', 'ScoreView.ScoreViewX', 'Topper.TopperDisplay', 'Player.FXAA', 'Plugin.B2S.Enable'];
  const owners = (key: string) => WIZARD_STEPS.filter((s) => s.owns(key)).map((s) => s.id);
  assert.deepEqual(owners('Input.Mapping.Start'), ['boutons']);
  // Capteurs (lanceur, accéléromètre) : l'étape « Lanceur » seule ; la coupure de la disposition de VPX, les deux.
  assert.deepEqual(owners('Input.Mapping.Plunger0.Position'), ['lanceur']);
  assert.deepEqual(owners('Input.Device.SDLJoy_03000000fa190000ed00000000000000_1.NoAutoLayout'), ['boutons', 'lanceur']);
  for (const k of ['Player.SoundDevice', 'Player.SoundDeviceBG', 'Player.Sound3D']) assert.deepEqual(owners(k), ['son'], k);
  for (const k of ['Player.PlayfieldDisplay', 'Player.BGSet', 'Player.ScreenWidth', 'Backglass.BackglassOutput', 'ScoreView.ScoreViewX', 'Topper.TopperDisplay']) {
    assert.deepEqual(owners(k), ['ecrans', 'playfield', 'disposition'], k);
  }
  // Ni les réglages de jeu ni les plugins : aucune étape seule ne les reprend.
  assert.deepEqual(owners('Player.FXAA'), []);
  assert.deepEqual(owners('Plugin.B2S.Enable'), []);
  assert.ok(keys.every((k) => [isInputKey, isAudioKey, isLayoutKey].filter((f) => f(k)).length <= 1), 'familles de clés disjointes');
  assert.equal(step('boutons').owns, isInputKey);
});

test('étape seule : VPinballX.ini ne change que sur ses clés, la mémoire des autres est gardée', () => {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint };
  cabinet.playfield = { flipperEdge: 'bottom' };
  cabinet.buttons = { ...DEFAULT_BUTTONS, start: 'Digit2' };
  const ini = '[Player]\nBallTrail = 1\n';
  const memory = { 'Player.PlayfieldDisplay': 'Ancien [0, 0]' };
  for (const step of WIZARD_STEPS) {
    const plan = planVpxSync(cabinet, displays, ini, undefined, { memory, overwriteManual: step.owns, only: step.owns });
    assert.ok(plan.changes.every((c) => step.owns(`${c.section}.${c.key}`)), `${step.id} : ${plan.changes.map((c) => `${c.section}.${c.key}`).join(', ')}`);
    if (!step.owns('Player.PlayfieldDisplay')) assert.equal(plan.memory['Player.PlayfieldDisplay'], 'Ancien [0, 0]', step.id);
    assert.equal(IniDocument.parse(plan.nextIni ?? ini).get('Player', 'BallTrail'), '1');
  }
  const buttons = planVpxSync(cabinet, displays, ini, undefined, { only: isInputKey });
  assert.ok(buttons.changes.some((c) => c.section === 'Input'), 'les touches sont écrites');
  const layout = planVpxSync(cabinet, displays, ini, undefined, { only: isLayoutKey });
  assert.ok(layout.changes.some((c) => c.key === 'PlayfieldDisplay') && !layout.changes.some((c) => c.section === 'Input'));
});

test('chaque étape seule garde le reste du modèle tel qu’enregistré', () => {
  for (const step of WIZARD_STEPS) {
    const previous = fullCabinet();
    const built = otherCabinet();
    const next = stepCabinet(previous, built, step);
    for (const field of ['buttons', 'roles', 'zones', 'playfield', 'audio'] as const) {
      const expected = step.fields.includes(field) ? built[field] : previous[field];
      assert.deepEqual(next[field], expected, `${step.id} : ${field}`);
    }
    if (step.fields.includes('screens')) {
      // Écrans relus mis à jour, écran débranché gardé, nouvel écran ajouté.
      assert.deepEqual(next.screens.map((s) => s.label), ['Écran A (relu)', 'Écran B', 'Écran C'], step.id);
    } else assert.deepEqual(next.screens, previous.screens, step.id);
    // Le fichier de la configuration active, et seulement les clés de l'étape sorties de vpxManual.
    assert.equal(next.vpx.iniPath, built.vpx.iniPath);
    assert.deepEqual(next.vpxManual, previous.vpxManual!.filter((id) => !step.owns(id)), step.id);
    assert.ok(next.vpxManual!.includes('Player.FXAA'), step.id);
  }
  // Écrans et rôles avec le playfield sur un autre écran : bord et diagonale en plus.
  const ecrans = WIZARD_STEPS.find((s) => s.id === 'ecrans')!;
  assert.deepEqual(stepCabinet(fullCabinet(), otherCabinet(), ecrans, ['playfield']).playfield, { flipperEdge: 'bottom' });
});

test('ce qui serait perdu en quittant : annoncé en clair, rien quand rien n’a changé', () => {
  const before = fullCabinet();
  assert.deepEqual(cabinetChanges(before, { roles: before.roles, zones: before.zones, playfield: before.playfield, audio: before.audio, buttons: before.buttons, screens: before.screens }), []);
  const lines = cabinetChanges(before, { ...otherCabinet(), zones: undefined });
  assert.ok(lines.some((l) => /^Boutons : Start sur 3$/.test(l)), lines.join(' | '));
  assert.ok(lines.includes('Backglass : aucun écran'), lines.join(' | '));
  assert.ok(lines.includes('DMD : Écran C'), lines.join(' | '));
  assert.ok(lines.includes('Flippers en bas de l’image'), lines.join(' | '));
  assert.ok(lines.includes('Diagonale du playfield'));
  assert.ok(lines.some((l) => l.startsWith('Son')));
  // Borne neuve : les touches des encodeurs gardées ne sont pas un changement.
  assert.deepEqual(cabinetChanges(undefined, { buttons: { ...DEFAULT_BUTTONS } }), []);
});

// ---------------------------------------------------------------------------
// Invariants des sources de l'assistant : la sortie sans enregistrer est commune à
// toutes les étapes, et rien n'est écrit ailleurs que dans les enregistrements.

test('wizard.ts : la question « Quitter sans enregistrer ? » passe avant toute étape', () => {
  const wizard = topLevelFunctions(read('app', 'src', 'wizard.ts'));
  const handleKey = wizard.get('handleKey')!;
  const firstPhase = handleKey.indexOf('wizard.phase');
  for (const call of ['isQuitShortcut(input)', 'watchHold(input.code)', 'handleQuitKey(input)']) {
    const at = handleKey.indexOf(call);
    assert.ok(at > 0 && at < firstPhase, `handleKey : ${call} avant la première étape`);
  }
  // Pendant le relevé, une touche ne compte qu'au relâchement : la touche maintenue n'est pas relevée.
  assert.match(handleKey, /CAPTURE_PHASES\.includes\(wizard\.phase\)\)[\s\S]*?pressed\.add\(input\.code\)/);
  assert.match(wizard.get('handleKeyUp')!, /handleButtonKey\(input\)/);
  assert.match(wizard.get('watchHold')!, /pressed\.delete\(code\)/);
  // La souris : le bouton et les réponses, avant toute autre action.
  const action = wizard.get('handleWizardAction')!;
  assert.ok(action.indexOf("action.type === 'quit'") < action.indexOf("action.type === 'arrange'"));
  // Chaque état envoyé aux écrans porte le bouton et la question.
  assert.match(wizard.get('broadcast')!, /quit: quitView\(\)/);
  // La liste des étapes est celle du cœur, que les tests ci-dessus parcourent.
  assert.match(read('app', 'src', 'wizard.ts'), /^type Phase = WizardPhase;$/m);
});

test('wizard.ts : rien n’est écrit hors des enregistrements, et la sortie n’enregistre rien', () => {
  const wizard = topLevelFunctions(read('app', 'src', 'wizard.ts'));
  const writers = /\b(saveCabinet|syncVpxIni|createConfiguration|writeWithBackup|writeVpxSync|writeFileSync|writeFile)\(/;
  // runAutopilot n'écrit que les captures d'écran de l'essai.
  const allowed = new Set(['save', 'saveStep', 'runAutopilot']);
  const offenders = [...wizard].filter(([name, text]) => !allowed.has(name) && writers.test(text)).map(([name]) => name);
  assert.deepEqual(offenders, [], 'écritures hors de save, saveStep');
  const leave = wizard.get('leaveWithoutSaving')!;
  assert.doesNotMatch(leave, /\bsave(Step)?\(|syncVpxIni|saveCabinet/);
  assert.match(leave, /continueToTables\(\)/);
  assert.match(leave, /app\.quit\(\)/);
  // Aucune sortie abrupte : app.quit seulement en fin d'autopilote et dans la sortie annoncée.
  const quits = [...wizard].filter(([, text]) => /app\.quit\(\)/.test(text)).map(([name]) => name).sort();
  assert.deepEqual(quits, ['leaveWithoutSaving', 'quit']);
  const quitCallers = [...wizard].filter(([name, text]) => name !== 'quit' && /(?<![.\w])quit\(\)/.test(text)).map(([name]) => name);
  assert.deepEqual(quitCallers, ['runAutopilot']);
  // Retour au menu sans question : seulement quand rien n'a été répondu (délai des boutons) ou après l'enregistrement.
  const relaunchers = [...wizard].filter(([name, text]) => name !== 'continueToTables' && /continueToTables\(\)/.test(text)).map(([name]) => name).sort();
  assert.deepEqual(relaunchers, ['buttonsTimeout', 'handleKey', 'leaveWithoutSaving']);
  assert.match(wizard.get('handleKey')!, /wizard\.phase === 'done'\) return continueToTables\(\)/);
});

test('les écrans de l’assistant affichent toujours le bouton « Quitter sans enregistrer »', () => {
  const html = read('app', 'renderer', 'screen.html');
  assert.match(html, /id="quit"[^>]*data-act='\{"type":"quit","op":"ask"\}'/);
  assert.match(html, /id="quit-dialog"/);
  const js = read('app', 'renderer', 'screen.js');
  assert.match(js, /function render\(state\) \{\s+const root = \$\('screen'\);\s+renderQuit\(state\);/);
  // Dans l'éditeur de disposition, la page laisse passer la souris : le bouton reste cliquable.
  assert.match(read('app', 'renderer', 'screen.css'), /body\.arranging #quit,/);
});

test('menu système : chaque étape seule dans « Configuration de la borne »', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /return t\('Configuration de la borne'\)/);
  assert.match(frontend, /WIZARD_STEPS\.map\(\(step\) => \(\{ label: step\.label, detail: step\.detail, icon: step\.icon, run: \(\) => relaunchWizard\(step\.flag\) \}\)\)/);
  // Plus d'entrée d'étape directement dans le menu système.
  assert.doesNotMatch(frontend, /relaunchWizard\('(boutons|disposition)'\)/);
});

test('boutons de l’interface : étape seule sans clé de VPinballX.ini, changements annoncés', () => {
  const step = WIZARD_STEPS.find((s) => s.id === 'interface')!;
  assert.deepEqual(step.fields, ['navigation']);
  assert.deepEqual(step.phases, ['navigation', 'navigationSummary']);
  assert.ok(step.phases.every((p) => CAPTURE_PHASES.includes(p)));
  assert.equal(step.owns('Input.Mapping.Start'), false);
  const before = emptyCabinet();
  before.buttons = { leftFlipper: 'KeyA', rightFlipper: 'KeyS', start: 'Digit2', exit: 'KeyQ', credit: 'Digit5', plunger: 'Enter' };
  // Seule la navigation change ; les boutons du jeu sont gardés.
  const built = { ...before, buttons: { ...before.buttons, leftFlipper: 'KeyZ' }, navigation: { previous: 'KeyJ', next: 'KeyS', confirm: 'Digit2', back: 'KeyQ' } };
  const saved = stepCabinet(before, built, step);
  assert.deepEqual(saved.buttons, before.buttons);
  assert.deepEqual(saved.navigation, built.navigation);
  // Sans navigation enregistrée, celle en vigueur est déduite du jeu : seul Précédent a changé.
  assert.deepEqual(cabinetChanges(before, { navigation: built.navigation }), ['Interface : Précédent sur J']);
});
