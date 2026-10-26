import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import {
  BUTTONS,
  buttonInfo,
  buttonKeys,
  buttonProblems,
  buttonsToTry,
  DEFAULT_BUTTONS,
  isInputKey,
  joystickButton,
  joystickCode,
  joystickDeviceIds,
  joysticksInVpxLog,
  joysticksUnseenByVpx,
  withDefaultButtons,
  describeMapping,
  gameKeys,
  displayKeys,
  keyLabel,
  navigationKeys,
  recordButton,
  recordKey,
  refusedKey,
  refusedNavigationKey,
  defaultNavigation,
  interfaceKeys,
  INTERFACE_KEYS,
  keysToTry,
  NAVIGATION,
  navigationButtons,
  navigationProblems,
  type SetKeys,
  sdlScancode,
  vpxInputSettings,
  VPX_INPUT_DEFAULTS,
  withKeyboardKeys,
  withoutButtonKeys,
} from '../buttons';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IniDocument } from '../ini';
import { loadCabinet, saveCabinet } from '../store';
import type { Cabinet, CabinetButtons, NavigationButtons } from '../model';
import { keepManualEdits, planVpxSync } from '../sync';
import { isOwned, vpxOwnedKeys } from '../vpx-settings';
import { devPcDisplays, emptyCabinet } from './fixtures';

/** Extrait de [Input] tel que VPX 10.8.1 l'écrit au premier lancement : toutes les clés vides. */
const VPX_FIRST_RUN = [
  '[Input]',
  'Devices = Key',
  'Device.Key.Type = 1',
  'Mapping.LeftFlipper = ',
  'Mapping.RightFlipper = ',
  'Mapping.Start = ',
  'Mapping.Pause = ',
  'Mapping.Debugger = ',
  '',
].join('\r\n');

function cabinetWith(buttons?: CabinetButtons): Cabinet {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  if (buttons) cabinet.buttons = buttons;
  return cabinet;
}

const input = (ini: string, action: string) => IniDocument.parse(ini).get('Input', `Mapping.${action}`);

test('les touches par défaut des boutons sont celles de VPX', () => {
  for (const b of BUTTONS) {
    for (const action of b.vpx) {
      assert.equal(VPX_INPUT_DEFAULTS[action], sdlScancode(b.default), `${b.label} -> ${action}`);
    }
  }
  // Valeurs de SDL_scancode.h : usages HID du clavier.
  assert.equal(sdlScancode('KeyA'), 4);
  assert.equal(sdlScancode('Digit1'), 30);
  assert.equal(sdlScancode('Digit0'), 39);
  assert.equal(sdlScancode('Enter'), 40);
  assert.equal(sdlScancode('F12'), 69);
  assert.equal(sdlScancode('F13'), 104);
  assert.equal(sdlScancode('Numpad1'), 89);
  assert.equal(sdlScancode('Numpad0'), 98);
  assert.equal(sdlScancode('ShiftRight'), 229);
});

test('boutons à essayer : seulement les touches de navigation relevées qui ont changé', () => {
  const current: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: 'KeyA', start: 'Digit2' };
  // Arrivée sur l'étape, ou un bouton facultatif refait : rien à essayer.
  assert.deepEqual(buttonsToTry(current, current), []);
  assert.deepEqual(buttonsToTry({ ...current, plunger: 'KeyP' }, current), []);
  // Touches par défaut des encodeurs choisies : elles deviennent la référence, rien à essayer.
  assert.deepEqual(buttonsToTry({ ...DEFAULT_BUTTONS }, DEFAULT_BUTTONS), []);
  // Un flipper refait sur une autre touche : lui seul ; refait sur la même touche : rien.
  assert.deepEqual(buttonsToTry({ ...current, rightFlipper: 'KeyS' }, current), ['rightFlipper']);
  assert.deepEqual(buttonsToTry({ ...current, leftFlipper: 'KeyA' }, current), []);
  // Tout relevé depuis zéro : les quatre.
  assert.deepEqual(buttonsToTry(current, {}), ['leftFlipper', 'rightFlipper', 'start', 'exit']);
});

test('touches refusées : inconnues de VPX, la touche Windows, Tab et Retour arrière réservées', () => {
  assert.equal(refusedKey('ShiftLeft'), undefined);
  assert.match(refusedKey('Tab')!, /configuration/);
  assert.match(refusedKey('Backspace')!, /corriger un relevé/);
  // Un relevé enregistré avec Tab ne peut pas priver de la configuration : il est incohérent.
  assert.deepEqual(navigationKeys({ buttons: { ...DEFAULT_BUTTONS, exit: 'Tab' } }), navigationKeys(undefined));
  assert.match(refusedKey('MetaLeft')!, /menu Démarrer/);
  assert.match(refusedKey('MediaPlayPause')!, /inconnue de VPX/);
});

test('noms des touches à l’écran', () => {
  assert.equal(keyLabel('ShiftLeft'), 'Maj gauche');
  assert.equal(keyLabel('Digit5'), '5');
  assert.equal(keyLabel('KeyB'), 'B');
  assert.equal(keyLabel('Escape'), 'Échap');
  assert.equal(keyLabel('Numpad7'), '7 du pavé');
  assert.equal(keyLabel('F11'), 'F11');
  assert.equal(keyLabel(undefined), 'aucune');
});

test('navigation sans étape « Boutons » : les touches d’avant', () => {
  assert.deepEqual(navigationKeys(undefined), {
    previous: ['ShiftLeft', 'ArrowLeft', 'ArrowUp'],
    next: ['ShiftRight', 'ArrowRight', 'ArrowDown'],
    confirm: ['Digit1', 'Enter', 'NumpadEnter'],
    exit: ['Escape'],
  });
  assert.deepEqual(navigationKeys(undefined, false).previous, ['ShiftLeft', 'ArrowLeft']);
});

test('navigation avec les boutons relevés, sans voler la touche d’un autre bouton', () => {
  const keys = navigationKeys({ buttons: { leftFlipper: 'KeyA', rightFlipper: 'ArrowLeft', start: 'Digit2', exit: 'Enter', credit: 'Digit5', plunger: 'Space' } });
  assert.deepEqual(keys.previous, ['KeyA', 'ArrowUp'], 'Flèche gauche est le flipper droit');
  assert.deepEqual(keys.next, ['ArrowLeft', 'ArrowRight', 'ArrowDown']);
  assert.deepEqual(keys.confirm, ['Digit2', 'NumpadEnter'], 'Entrée est Exit');
  assert.deepEqual(keys.exit, ['Enter', 'Escape']);
  // Le 1 n'est plus Start : il ne valide plus rien.
  assert.ok(!Object.values(keys).flat().includes('Digit1'));
});

test('raccourcis du menu retirés quand un bouton les envoie', () => {
  assert.deepEqual(withoutButtonKeys(['KeyH', 'F1'], { buttons: { ...DEFAULT_BUTTONS, extraBall: 'KeyH' } }), ['F1']);
  assert.deepEqual(withoutButtonKeys(['KeyH', 'F1'], undefined), ['KeyH', 'F1']);
});

test('aide-mémoire de la partie : les boutons affectés seulement', () => {
  const rows = gameKeys({ leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight', start: 'Digit1', exit: 'Escape', credit: 'Digit5', plunger: 'Enter', tilt: 'KeyT' });
  assert.deepEqual(rows[0], ['Flippers', 'Maj gauche / Maj droite']);
  assert.deepEqual(rows.at(-1), ['Tilt', 'T']);
  assert.ok(!rows.some(([title]) => title === 'MagnaSave'));
  // VPX 10.8.1 quitte dès l'appui sur Exit ; son menu s'ouvre par deux boutons ensemble.
  assert.ok(rows.some(([title, keys]) => title === 'Quitter la partie' && keys === 'Échap'));
  assert.ok(rows.some(([title, keys]) => title === 'Menu de VPX' && keys === '5 + 1'), 'sans MagnaSave : Crédit et Start');
  assert.ok(gameKeys(undefined).some(([title, keys]) => title === 'Menu de VPX' && keys === 'Ctrl gauche + Ctrl droit'));
  assert.ok(gameKeys(undefined).some(([title, keys]) => title === 'Volume' && keys === '- / ='));
  // Touche « / » (tremblement à droite par défaut) : séparateur « · », sinon « Z / / / Espace ».
  assert.ok(gameKeys(undefined).some(([title, keys]) => title === 'Tremblements' && keys === 'Z · / · Espace'));
});

test('aide-mémoire du réglage de l’affichage : les boutons du menu de VPX', () => {
  const rows = Object.fromEntries(displayKeys(undefined));
  assert.equal(rows['Changer de ligne'], 'Ctrl gauche / Ctrl droit');
  assert.equal(rows['Régler'], 'Maj gauche / Maj droite');
  assert.equal(rows['Enregistrer : cette table ou toutes'], '1');
  assert.equal(rows['Rouvrir le menu'], 'Ctrl gauche + Ctrl droit');
});

test('valeurs Mapping.* : touches du clavier remplacées, manettes gardées', () => {
  assert.equal(withKeyboardKeys('', [225]), 'Key;225');
  assert.equal(withKeyboardKeys('Key;225', [4]), 'Key;4');
  assert.equal(withKeyboardKeys('SDLJoy_03000000_1;3 | Key;225', [4]), 'SDLJoy_03000000_1;3 | Key;4');
  assert.equal(withKeyboardKeys('SDLJoy_03000000_1;3', [4]), 'Key;4 | SDLJoy_03000000_1;3');
  assert.equal(withKeyboardKeys('Key;226 & Key;30 | Key;19', []), 'Key;226 & Key;30', 'combinaison gardée');
  assert.equal(withKeyboardKeys('Key;19', []), 'Key;0', 'vide vaudrait la touche par défaut');
  assert.equal(describeMapping('', 'LeftFlipper'), 'Maj gauche');
  assert.equal(describeMapping('Key;0', 'Pause'), 'aucune touche');
  assert.equal(describeMapping('Key;4 | SDLJoy_03000000_1;3', 'Start'), 'A ou bouton de manette');
  assert.equal(describeMapping('', 'GenTournament'), 'aucune touche');
});

test('sans étape « Boutons », [Input] reste tel quel, sauf le menu de VPX en partie', () => {
  const plan = planVpxSync(cabinetWith(), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(plan.nextIni!, 'LeftFlipper'), '');
  // Touches par défaut des encodeurs : les deux MagnaSave (Ctrl gauche et droit), F12 gardée.
  assert.deepEqual(
    plan.changes.filter((c) => c.section === 'Input').map((c) => `${c.key}=${c.value}`),
    ['Mapping.InGameUI=Key;69 | Key;224 & Key;228'],
  );
  assert.deepEqual(Object.keys(plan.memory).filter((id) => id.startsWith('Input.')), ['Input.Mapping.InGameUI']);
  const again = planVpxSync(cabinetWith(), devPcDisplays(), plan.nextIni!, undefined, { memory: plan.memory });
  assert.deepEqual(again.changes, []);
});

test('touches par défaut des encodeurs : écrites telles que VPX les écrit, rien de retiré', () => {
  const plan = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS }), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(plan.nextIni!, 'LeftFlipper'), 'Key;225');
  assert.equal(input(plan.nextIni!, 'LeftStagedFlipper'), 'Key;225');
  assert.equal(input(plan.nextIni!, 'UIRight'), 'Key;229');
  assert.equal(input(plan.nextIni!, 'Start'), 'Key;30');
  assert.equal(input(plan.nextIni!, 'ExitGame'), 'Key;41');
  assert.equal(input(plan.nextIni!, 'Credit1'), 'Key;34');
  assert.equal(input(plan.nextIni!, 'LaunchBall'), 'Key;40');
  assert.equal(input(plan.nextIni!, 'VolumeDown'), 'Key;45');
  // Volume − et Service 7 partagent - par défaut dans VPX : ce doublon voulu reste.
  assert.deepEqual(plan.silenced, []);
  assert.equal(input(plan.nextIni!, 'Pause'), 'Key;19', 'bouton Pause sur P, la touche de VPX');
  assert.equal(plan.memory['Input.Mapping.Start'], 'Key;30');
  // Menu de VPX : F12 au clavier, les deux MagnaSave sur la borne.
  assert.equal(input(plan.nextIni!, 'InGameUI'), 'Key;69 | Key;224 & Key;228');
  // Deuxième passage : rien à écrire.
  const again = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS }), devPcDisplays(), plan.nextIni!, undefined, { memory: plan.memory });
  assert.deepEqual(again.changes, []);
});

test('encodeur sur d’autres touches : chaque action suit son bouton', () => {
  const buttons: CabinetButtons = { leftFlipper: 'KeyA', rightFlipper: 'KeyS', start: 'Digit2', exit: 'KeyQ', credit: 'Digit3', plunger: 'KeyW' };
  const plan = planVpxSync(cabinetWith(buttons), devPcDisplays(), VPX_FIRST_RUN);
  const ini = plan.nextIni!;
  assert.equal(input(ini, 'LeftFlipper'), 'Key;4');
  assert.equal(input(ini, 'LeftStagedFlipper'), 'Key;4');
  assert.equal(input(ini, 'UILeft'), 'Key;4');
  assert.equal(input(ini, 'RightFlipper'), 'Key;22');
  assert.equal(input(ini, 'Start'), 'Key;31');
  assert.equal(input(ini, 'ExitGame'), 'Key;20');
  assert.equal(input(ini, 'LaunchBall'), 'Key;26');
  // Crédit sur 3 : le crédit n° 3 de VPX (touche 3 par défaut) se tait.
  assert.equal(input(ini, 'Credit1'), 'Key;32');
  assert.equal(input(ini, 'Credit3'), 'Key;0');
  assert.deepEqual(
    plan.silenced.map((s) => `${s.action}:${s.button}`),
    ['Credit3:credit'],
  );
  assert.ok(plan.findings.some((f) => f.severity === 'info' && f.message.includes('Crédit 3 (3, désormais Crédit)')));
  // MagnaSave passés : touches de VPX par défaut.
  assert.equal(input(ini, 'LeftMagna'), 'Key;224');
  assert.equal(input(ini, 'UIUp'), 'Key;224');
});

test('menu de VPX pendant la partie : combinaison de boutons suivie, ajouts de VPX gardés', () => {
  const noMagna: CabinetButtons = { ...DEFAULT_BUTTONS };
  delete noMagna.leftMagna;
  delete noMagna.rightMagna;
  const first = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS }), devPcDisplays(), VPX_FIRST_RUN);
  // MagnaSave retirés de la borne : l'ancienne combinaison part, Crédit + Start la remplace.
  const next = planVpxSync(cabinetWith(noMagna), devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.equal(input(next.nextIni!, 'InGameUI'), 'Key;69 | Key;34 & Key;30');
  // Une manette ajoutée dans VPX reste ; F12 pris par un bouton : la combinaison seule.
  const doc = IniDocument.parse(['[Input]', 'Mapping.InGameUI = Key;69 | Key;34 & Key;30 | SDLJoy_0300_1;9', ''].join('\n'));
  const joy = vpxInputSettings({ ...noMagna, extraBall: 'F12' }, doc, { 'Input.Mapping.InGameUI': 'Key;69 | Key;34 & Key;30' });
  const value = joy.settings.find((x) => x.key === 'Mapping.InGameUI')!.value;
  assert.equal(value, 'SDLJoy_0300_1;9 | Key;34 & Key;30');
  assert.equal(describeMapping(value, 'InGameUI'), 'bouton de manette ou 5 + 1');
});

test('un bouton facultatif sur la touche d’une autre action la fait taire, puis la lui rend', () => {
  const base: CabinetButtons = { ...DEFAULT_BUTTONS };
  const withD = { ...base, extraBall: 'KeyD' };
  const first = planVpxSync(cabinetWith(withD), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(first.nextIni!, 'ExtraBall'), 'Key;7');
  assert.equal(input(first.nextIni!, 'Debugger'), 'Key;0', 'sinon Extra Ball ouvrirait le débogueur');
  assert.equal(first.memory['Input.Mapping.Debugger'], 'Key;0');

  // Toujours en conflit au passage suivant : rien ne bouge.
  const again = planVpxSync(cabinetWith(withD), devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.deepEqual(again.changes, []);
  assert.deepEqual(again.silenced.map((s) => s.action), ['Debugger']);

  // Extra Ball revient sur B : le débogueur retrouve sa touche (valeur vide = défaut de VPX).
  const back = planVpxSync(cabinetWith(base), devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.equal(input(back.nextIni!, 'ExtraBall'), 'Key;5');
  assert.equal(input(back.nextIni!, 'Debugger'), '');
  assert.equal(back.memory['Input.Mapping.Debugger'], undefined);
});

test('un bouton facultatif passé perd sa touche par défaut si un autre bouton la prend', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, plunger: 'KeyB' };
  delete buttons.extraBall;
  const plan = planVpxSync(cabinetWith(buttons), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(plan.nextIni!, 'LaunchBall'), 'Key;5');
  assert.equal(input(plan.nextIni!, 'ExtraBall'), 'Key;0');
});

test('bouton Pause : facultatif, sur P comme dans VPX, et un relevé fait sans lui garde la pause de VPX', () => {
  // Octobre 2026 : aucun bouton de la borne n'arrivait à l'action Pause de VPX (P au clavier, InputManager.cpp).
  const pause = buttonInfo('pause');
  assert.equal(pause.required, false);
  assert.deepEqual(pause.vpx, ['Pause']);
  assert.equal(sdlScancode(pause.default), VPX_INPUT_DEFAULTS.Pause, 'la touche des encodeurs est celle de VPX');
  assert.equal(DEFAULT_BUTTONS.pause, 'KeyP');
  assert.equal(input(planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS }), devPcDisplays(), VPX_FIRST_RUN).nextIni!, 'Pause'), 'Key;19');
  assert.ok(gameKeys(undefined).some(([title, keys]) => title === 'Pause' && keys === 'P'));

  // Relevé d'avant ce bouton (ou Pause passé par Exit) : la touche P de VPX reste, l'aide-mémoire n'en parle pas.
  const before: CabinetButtons = { ...DEFAULT_BUTTONS };
  delete before.pause;
  assert.deepEqual(buttonProblems(before), []);
  const kept = planVpxSync(cabinetWith(before), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(kept.nextIni!, 'Pause'), 'Key;19');
  assert.deepEqual(kept.silenced, []);
  assert.ok(!gameKeys(before).some(([title]) => title === 'Pause'));
  // … sauf si un autre bouton a pris P : la pause se tait, comme avant.
  const taken = planVpxSync(cabinetWith({ ...before, plunger: 'KeyP' }), devPcDisplays(), VPX_FIRST_RUN);
  assert.equal(input(taken.nextIni!, 'Pause'), 'Key;0');
  assert.deepEqual(taken.silenced.map((s) => [s.action, s.button]), [['Pause', 'plunger']]);
  // Relevé avec Pause : P n'est plus libre pour un autre bouton.
  assert.match(recordButton({ ...DEFAULT_BUTTONS }, 'plunger', 'KeyP').refused!, /P est déjà la touche du bouton Pause/);
});

test('boutons de manette affectés dans VPX : gardés à côté de la touche', () => {
  const ini = VPX_FIRST_RUN.replace('Mapping.Start = ', 'Mapping.Start = SDLJoy_030000005e0400008e02000010010000_1;7 | Key;30');
  const plan = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS, start: 'Digit2' }), devPcDisplays(), ini);
  assert.equal(input(plan.nextIni!, 'Start'), 'SDLJoy_030000005e0400008e02000010010000_1;7 | Key;31');
});

test('touche changée à la main dans VPX : signalée, puis gardée ou remise', () => {
  const cabinet = cabinetWith({ ...DEFAULT_BUTTONS });
  const first = planVpxSync(cabinet, devPcDisplays(), VPX_FIRST_RUN);
  const doc = IniDocument.parse(first.nextIni!);
  doc.set('Input', 'Mapping.LeftFlipper', 'Key;4');
  const edited = doc.toString();

  const plan = planVpxSync(cabinet, devPcDisplays(), edited, undefined, { memory: first.memory });
  assert.deepEqual(plan.manualEdits.map((e) => `[${e.section}] ${e.key}=${e.current}`), ['[Input] Mapping.LeftFlipper=Key;4']);
  assert.equal(plan.nextIni, undefined);

  // Une manette ajoutée dans VPX n'est pas une modification : la touche est restée.
  const joy = IniDocument.parse(first.nextIni!);
  joy.set('Input', 'Mapping.RightFlipper', 'Key;229 | SDLJoy_0300_1;5');
  assert.deepEqual(planVpxSync(cabinet, devPcDisplays(), joy.toString(), undefined, { memory: first.memory }).manualEdits, []);

  // Reprise limitée aux touches (étape « Boutons » relancée seule).
  const onlyInput = (id: string) => id.startsWith('Input.');
  const rewrite = planVpxSync(cabinet, devPcDisplays(), edited, undefined, { memory: first.memory, overwriteManual: onlyInput });
  assert.equal(input(rewrite.nextIni!, 'LeftFlipper'), 'Key;225');

  // Garder : la clé passe à l'utilisateur, Cyber Pinball ne l'écrit plus.
  const kept = keepManualEdits(cabinet, plan.manualEdits, edited);
  assert.deepEqual(kept.vpxManual, ['Input.Mapping.LeftFlipper']);
  const after = planVpxSync(kept, devPcDisplays(), edited, undefined, { memory: plan.memory });
  assert.deepEqual(after.manualEdits, []);
  assert.equal(after.memory['Input.Mapping.LeftFlipper'], undefined);
});

test('clés [Input] gérées : celles écrites à la dernière synchronisation', () => {
  const profile = { displayIdFormat: 'name' as const, enabledPlugins: [] };
  const owned = vpxOwnedKeys(profile, ['Input.Mapping.Start'], false, { inputKeys: ['Mapping.LeftFlipper', 'Mapping.Start'] });
  assert.ok(isOwned(owned, 'Input', 'Mapping.LeftFlipper'));
  assert.ok(!isOwned(owned, 'Input', 'Mapping.Start'), 'gardée par l’utilisateur');
  assert.ok(!isOwned(vpxOwnedKeys(profile), 'Input', 'Mapping.LeftFlipper'));
});

test('plan des touches seul : l’ordre des actions est celui des boutons', () => {
  const plan = vpxInputSettings({ ...DEFAULT_BUTTONS }, IniDocument.parse(''));
  assert.deepEqual(
    plan.settings.slice(0, 4).map((s) => `${s.key}=${s.value}`),
    ['Mapping.LeftFlipper=Key;225', 'Mapping.LeftStagedFlipper=Key;225', 'Mapping.UILeft=Key;225', 'Mapping.RightFlipper=Key;229'],
  );
  assert.deepEqual(plan.released, []);
});

test('relevé incohérent : détecté, et l’interface garde les touches par défaut', () => {
  const missingStart: CabinetButtons = { ...DEFAULT_BUTTONS };
  delete missingStart.start;
  assert.deepEqual(buttonProblems(missingStart), ['Start : aucune touche']);
  const twice: CabinetButtons = { ...DEFAULT_BUTTONS, exit: 'ShiftLeft' };
  assert.deepEqual(buttonProblems(twice), ['Flipper gauche et Exit : même touche (Maj gauche)']);
  assert.match(buttonProblems({ ...DEFAULT_BUTTONS, start: 'MetaLeft' })[0]!, /^Start : La touche Windows/);
  assert.deepEqual(buttonProblems({ ...DEFAULT_BUTTONS }), []);
  // Aucun bouton de navigation ne peut manquer : les touches par défaut reprennent.
  assert.deepEqual(navigationKeys({ buttons: twice }), navigationKeys(undefined));
  assert.equal(buttonKeys(missingStart).start, 'Digit1');
});

test('relevé incohérent dans le modèle : [Input] laissé tel quel, signalé, mémoire gardée', () => {
  const first = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS, start: 'Digit2' }), devPcDisplays(), VPX_FIRST_RUN);
  const broken = { ...DEFAULT_BUTTONS, start: 'Digit2', exit: 'Digit2' };
  const plan = planVpxSync(cabinetWith(broken), devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.ok(!plan.changes.some((c) => c.section === 'Input'));
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.includes('Start et Exit : même touche (2)')));
  assert.equal(plan.memory['Input.Mapping.Start'], 'Key;31');
});

test('touches par défaut remises : [Input] réécrit et les actions de VPX retrouvent leur touche', () => {
  const custom = cabinetWith({ ...DEFAULT_BUTTONS, extraBall: 'KeyD' });
  custom.vpxManual = ['Input.Mapping.LeftFlipper', 'Player.BGSet'];
  const first = planVpxSync(custom, devPcDisplays(), VPX_FIRST_RUN);
  const reset = withDefaultButtons(custom);
  assert.deepEqual(reset.buttons, DEFAULT_BUTTONS);
  assert.deepEqual(reset.vpxManual, ['Player.BGSet']);
  const plan = planVpxSync(reset, devPcDisplays(), first.nextIni!, undefined, { memory: first.memory, overwriteManual: isInputKey });
  assert.equal(input(plan.nextIni!, 'ExtraBall'), 'Key;5');
  assert.equal(input(plan.nextIni!, 'Debugger'), '');
  assert.equal(input(plan.nextIni!, 'LeftFlipper'), 'Key;225');
});

// ---------------------------------------------------------------------------
// Boutons de joystick (Pinscape sur KL25Z, encodeur en mode manette)

/** GUID SDL d'un Pinscape (bus USB, VID 0x1209, PID 0xEAEA), tel que SDL_GUIDToString l'écrit. */
const PINSCAPE_GUID = '03007a4f0912000aeaea000001000000';
const PINSCAPE = `SDLJoy_${PINSCAPE_GUID}_1`;
const joy = (button: number) => joystickCode(PINSCAPE, button);

test('joysticks : identifiants de VPX, rang par GUID identique', () => {
  const other = '030000005e0400008e02000010010000';
  assert.deepEqual(joystickDeviceIds([PINSCAPE_GUID, other, PINSCAPE_GUID]), [PINSCAPE, `SDLJoy_${other}_1`, `SDLJoy_${PINSCAPE_GUID}_2`]);
  assert.deepEqual(joystickButton(joy(4)), { device: PINSCAPE, button: 4 });
  assert.equal(joystickButton('ShiftLeft'), undefined);
  // Un axe (seuil) ou un GUID tronqué n'est pas un bouton de la borne.
  assert.equal(joystickButton(`${PINSCAPE};514;o;0.9`), undefined);
  assert.equal(joystickButton('SDLJoy_0300_1;9'), undefined);
});

test('joysticks : un bouton se relève, se nomme et se refuse en double comme une touche', () => {
  assert.equal(keyLabel(joy(0)), 'Bouton 1 du joystick');
  assert.equal(refusedKey(joy(23)), undefined);
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0), rightFlipper: joy(1), start: joy(2), exit: joy(3) };
  assert.deepEqual(buttonProblems(buttons), []);
  assert.deepEqual(buttonKeys(buttons), buttons);
  assert.deepEqual(buttonProblems({ ...buttons, credit: joy(2) }), ['Start et Crédit : même touche (Bouton 3 du joystick)']);
  // Les boutons pilotent l'interface ; les flèches d'un clavier aussi.
  assert.deepEqual(navigationKeys({ buttons: buttons }).previous, [joy(0), 'ArrowLeft', 'ArrowUp']);
  assert.deepEqual(navigationKeys({ buttons: buttons }).confirm, [joy(2), 'Enter', 'NumpadEnter']);
});

test('joysticks : [Input] reçoit le bouton, garde la touche du clavier de VPX, oublie l’ancien relevé', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0), rightFlipper: joy(1), start: joy(2), exit: joy(3), leftMagna: joy(6), rightMagna: joy(7) };
  const first = planVpxSync(cabinetWith(buttons), devPcDisplays(), VPX_FIRST_RUN);
  const ini = first.nextIni!;
  assert.equal(input(ini, 'LeftFlipper'), `${joy(0)} | Key;225`);
  assert.equal(input(ini, 'UILeft'), `${joy(0)} | Key;225`);
  assert.equal(input(ini, 'Start'), `${joy(2)} | Key;30`);
  assert.equal(input(ini, 'ExitGame'), `${joy(3)} | Key;41`);
  // Le menu de VPX en partie : les deux MagnaSave du joystick ensemble.
  assert.equal(input(ini, 'InGameUI'), `Key;69 | ${joy(6)} & ${joy(7)}`);
  assert.equal(describeMapping(input(ini, 'LeftFlipper'), 'LeftFlipper'), 'Bouton 1 du joystick ou Maj gauche');

  // Un bouton ajouté dans VPX : pas une modification à la main, rien à réécrire.
  const edited = ini.replace(`Mapping.LeftFlipper = ${joy(0)} | Key;225`, `Mapping.LeftFlipper = ${joy(0)} | Key;225 | ${joy(12)}`);
  const kept = planVpxSync(cabinetWith(buttons), devPcDisplays(), edited, undefined, { memory: first.memory });
  assert.deepEqual(kept.manualEdits, []);
  assert.deepEqual(kept.changes, []);
  // Relevé refait (étape « Boutons ») : flipper gauche sur un autre bouton. L'ancien part, celui ajouté dans VPX reste.
  const next = planVpxSync(cabinetWith({ ...buttons, leftFlipper: joy(10) }), devPcDisplays(), edited, undefined, { memory: first.memory, overwriteManual: isInputKey });
  assert.equal(input(next.nextIni!, 'LeftFlipper'), `${joy(10)} | Key;225 | ${joy(12)}`);
  assert.equal(input(next.nextIni!, 'LeftStagedFlipper'), `${joy(10)} | Key;225`);

  // Retour aux touches de l'encodeur : plus aucun bouton de joystick relevé.
  const back = planVpxSync(cabinetWith({ ...DEFAULT_BUTTONS }), devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.equal(input(back.nextIni!, 'LeftFlipper'), 'Key;225');
  assert.equal(input(back.nextIni!, 'InGameUI'), 'Key;69 | Key;224 & Key;228');
});

test('joysticks : touche du clavier de VPX prise par un autre bouton, le joystick seul', () => {
  // Lanceur du joystick, et Entrée (touche du lanceur dans VPX) donnée au Start de l'encodeur.
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, plunger: joy(5), start: 'Enter' };
  const ini = planVpxSync(cabinetWith(buttons), devPcDisplays(), VPX_FIRST_RUN).nextIni!;
  assert.equal(input(ini, 'LaunchBall'), joy(5));
  assert.equal(input(ini, 'Start'), 'Key;40');
});

test('joysticks vus par VPX : relus dans vpinball.log, ceux des boutons qu’il n’a pas vus signalés', () => {
  const log = [
    `2026-10-24 21:12:03.120 INFO  [1234] [SDLInputHandler::OnJoystickAdded@287] Joystick connected: mjrnet Pinscape Controller #1 (SDL ID: 3, Axes: 6, Buttons: 32, Hats: 0, VPX UID: ${PINSCAPE})`,
    '2026-10-24 21:12:03.121 INFO  [1234] something else',
  ].join('\n');
  assert.deepEqual(joysticksInVpxLog(log), [{ id: PINSCAPE, name: 'mjrnet Pinscape Controller #1' }]);
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0) };
  assert.deepEqual(joysticksUnseenByVpx(buttons, joysticksInVpxLog(log)), []);
  const elsewhere = joystickCode(`SDLJoy_${'0'.repeat(32)}_1`, 0);
  assert.deepEqual(joysticksUnseenByVpx({ ...buttons, rightFlipper: elsewhere }, joysticksInVpxLog(log)), [`SDLJoy_${'0'.repeat(32)}_1`]);
  // VPX n'a vu aucun joystick (débranché pendant la partie) : rien à conclure.
  assert.deepEqual(joysticksUnseenByVpx(buttons, []), []);
});

test('relevé mixte : touches du clavier et boutons du joystick, librement d’un bouton à l’autre, enregistrés et écrits dans [Input]', () => {
  // Octobre 2026, vraie borne à Pinscape : les boutons du joystick se relevaient, plus les
  // touches du clavier. Les deux se relèvent par le même chemin (recordButton), dans l'ordre de l'assistant.
  const pressed: Record<string, string> = {
    leftFlipper: joy(0),
    rightFlipper: 'ShiftRight',
    start: joy(2),
    exit: 'Escape',
    credit: 'Digit5',
    plunger: joy(5),
    leftMagna: 'ControlLeft',
    rightMagna: joy(7),
    extraBall: 'Escape', // Exit : la borne n'a pas ce bouton
    pause: joy(15),
    tilt: joy(9),
    slamTilt: joy(10),
    nudgeLeft: 'KeyZ',
    nudgeRight: 'Escape',
    nudgeCenter: 'Escape',
    volumeDown: 'Minus',
    volumeUp: joy(14),
  };
  let keys: CabinetButtons = {};
  for (const b of BUTTONS) {
    const record = recordButton(keys, b.id, pressed[b.id]!);
    assert.equal(record.refused, undefined, `${b.id} : ${record.refused}`);
    keys = record.keys;
  }
  assert.deepEqual(keys, Object.fromEntries(Object.entries(pressed).filter(([id, code]) => id === 'exit' || code !== 'Escape')));
  assert.deepEqual(buttonProblems(keys), []);
  assert.deepEqual(buttonKeys(keys), keys, 'un relevé mixte pilote l’interface tel quel');
  assert.deepEqual(navigationKeys({ buttons: keys }).next, ['ShiftRight', 'ArrowRight', 'ArrowDown']);
  assert.deepEqual(navigationKeys({ buttons: keys }).confirm, [joy(2), 'Enter', 'NumpadEnter']);
  // Une touche déjà prise est refusée, qu'elle vienne du clavier ou du joystick.
  assert.match(recordButton(keys, 'credit', 'ShiftRight').refused!, /Maj droite est déjà la touche du bouton Flipper droit/);
  assert.match(recordButton(keys, 'credit', joy(0)).refused!, /Bouton 1 du joystick est déjà la touche du bouton Flipper gauche/);

  // Enregistré dans cabinet.json, relu tel quel.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-mixte-'));
  try {
    saveCabinet(home, cabinetWith(keys));
    assert.deepEqual(loadCabinet(home)!.buttons, keys);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }

  // [Input] : la touche du clavier pour les boutons du clavier, le bouton du joystick (et la touche de VPX) pour les autres.
  const ini = planVpxSync(cabinetWith(keys), devPcDisplays(), VPX_FIRST_RUN).nextIni!;
  assert.equal(input(ini, 'LeftFlipper'), `${joy(0)} | Key;225`);
  assert.equal(input(ini, 'RightFlipper'), 'Key;229');
  assert.equal(input(ini, 'Start'), `${joy(2)} | Key;30`);
  assert.equal(input(ini, 'ExitGame'), 'Key;41');
  assert.equal(input(ini, 'Credit1'), 'Key;34');
  assert.equal(input(ini, 'LaunchBall'), `${joy(5)} | Key;40`);
  assert.equal(input(ini, 'LeftMagna'), 'Key;224');
  assert.equal(input(ini, 'RightMagna'), `${joy(7)} | Key;228`);
  assert.equal(input(ini, 'Tilt'), `${joy(9)} | Key;23`);
  assert.equal(input(ini, 'SlamTilt'), `${joy(10)} | Key;74`);
  assert.equal(input(ini, 'VolumeUp'), `${joy(14)} | Key;46`);
  assert.equal(input(ini, 'Pause'), `${joy(15)} | Key;19`);
  // Le menu de VPX en partie : un MagnaSave au clavier, l'autre au joystick.
  assert.equal(input(ini, 'InGameUI'), `Key;69 | Key;224 & ${joy(7)}`);
});

test('clavier et joystick : le clavier suit les boutons du joystick, et l’assistant ne perd pas une touche en changeant d’écran', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', ...parts), 'utf8');
  // Chaque appui d'un bouton du joystick vérifie que le premier plan de Windows (le clavier) est à Cyber Pinball.
  const joystick = read('app', 'src', 'joystick-input.ts');
  assert.match(joystick, /function send\([\s\S]*?keyboardFollows\(win,[\s\S]*?listeners\.get\(win\)/);
  const foreground = read('app', 'src', 'foreground.ts');
  assert.match(foreground, /foregroundWindow\(\)[\s\S]*?process\.pid[\s\S]*?bringToFront\(/);
  assert.match(foreground, /if \(OFFSCREEN/, 'hors écran, jamais de premier plan');
  const wizard = read('app', 'src', 'wizard.ts');
  // L'assistant prend le clavier une fois ses fenêtres affichées.
  assert.match(wizard, /ready-to-show[\s\S]{0,200}takeKeyboard\(\)/);
  assert.match(wizard, /function takeKeyboard\(\)[\s\S]*?keyboardFollows\(/);
  // Touches du clavier et boutons du joystick arrivent au même traitement.
  assert.match(wizard, /before-input-event[\s\S]{0,400}handleKey\(input\)/);
  assert.match(wizard, /onJoystickInput\(win, \(input\) => void handleKey\(input\)\)/);
  // Le focus qui passe d'un écran de l'assistant à l'autre ne relâche pas les touches enfoncées.
  assert.doesNotMatch(wizard, /win\.on\('blur', \(\) => releaseKeys\(\)\)/);
  assert.match(wizard, /win\.on\('blur', [^\n]*isFocused\(\)[^\n]*releaseKeys\(\)/);
  // Le relevé passe par recordKey, sans distinguer clavier et joystick.
  assert.match(wizard, /function handleButtonKey[\s\S]*?recordKey\(/);
});

// ---------------------------------------------------------------------------
// Deux jeux de boutons : le jeu (VPX, [Input]) et l'interface (Cyber Pinball)

test('interface : sans boutons de l’interface, elle suit les flippers, Start et Exit du jeu (migration douce)', () => {
  assert.deepEqual(navigationButtons(undefined), { previous: 'ShiftLeft', next: 'ShiftRight', confirm: 'Digit1', back: 'Escape' });
  // Borne d'avant les boutons de l'interface : sa navigation reste sur ses boutons de jeu.
  const game: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0), rightFlipper: joy(1), start: joy(2), exit: joy(3) };
  assert.deepEqual(navigationButtons({ buttons: game }), { previous: joy(0), next: joy(1), confirm: joy(2), back: joy(3) });
  assert.deepEqual(defaultNavigation(game), navigationButtons({ buttons: game }));
  assert.deepEqual(navigationKeys({ buttons: game }).previous, [joy(0), 'ArrowLeft', 'ArrowUp']);
});

test('interface : ses boutons sont indépendants de ceux du jeu', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0), rightFlipper: joy(1), start: joy(2), exit: joy(3) };
  const navigation: NavigationButtons = { previous: 'KeyJ', next: 'KeyL', confirm: joy(9), back: 'KeyU', help: 'KeyI' };
  assert.deepEqual(navigationProblems(navigation), []);
  const keys = interfaceKeys({ buttons, navigation });
  assert.deepEqual(keys.previous, ['KeyJ', 'ArrowLeft', 'ArrowUp']);
  assert.deepEqual(keys.next, ['KeyL', 'ArrowRight', 'ArrowDown']);
  assert.deepEqual(keys.confirm, [joy(9), 'Enter', 'NumpadEnter']);
  assert.deepEqual(keys.exit, ['KeyU', 'Escape']);
  assert.deepEqual(keys.help, ['KeyI', 'KeyH', 'F1']);
  assert.deepEqual(keys.settings, ['KeyR']);
  // Les boutons du jeu ne pilotent plus l'interface.
  assert.ok(!Object.values(keys).flat().some((k) => [joy(0), joy(1), joy(2), joy(3)].includes(k)));
  // Relever le jeu autrement ne change pas l'interface.
  assert.deepEqual(navigationButtons({ buttons: { ...buttons, leftFlipper: 'KeyA' }, navigation }), navigation);
  // Un raccourci du clavier pris par un bouton, du jeu ou de l'interface, n'ouvre plus rien.
  assert.deepEqual(withoutButtonKeys(['KeyH', 'F1'], { buttons, navigation: { ...navigation, settings: 'F1' } }), ['KeyH']);
  assert.deepEqual(withoutButtonKeys(['KeyH', 'KeyT'], { buttons, navigation }), ['KeyH'], 'T est le tilt du jeu');
});

test('interface : les touches de secours du clavier gardent toujours leur rôle', () => {
  assert.match(refusedNavigationKey('previous', 'Enter')!, /Entrée reste la touche de secours « Valider »/);
  assert.match(refusedNavigationKey('confirm', 'Escape')!, /Échap reste la touche de secours « Retour et menu »/);
  assert.match(refusedNavigationKey('help', 'ArrowUp')!, /Flèche haut reste la touche de secours « Précédent »/);
  assert.equal(refusedNavigationKey('confirm', 'Enter'), undefined);
  assert.equal(refusedNavigationKey('back', 'Escape'), undefined);
  assert.match(refusedNavigationKey('next', 'Tab')!, /Tab est réservée/);
  assert.equal(refusedNavigationKey('next', joy(4)), undefined);
  // Relevé incohérent : l'interface revient sur les boutons du jeu, jamais impilotable.
  const twice: NavigationButtons = { previous: 'KeyJ', next: 'KeyJ', confirm: 'KeyK', back: 'KeyU' };
  assert.deepEqual(navigationProblems(twice), ['Précédent et Suivant : même touche (J)']);
  assert.deepEqual(navigationButtons({ navigation: twice }), navigationButtons(undefined));
  assert.deepEqual(navigationProblems({ previous: 'KeyJ', next: 'KeyL', confirm: 'KeyK' }), ['Retour et menu : aucune touche']);
});

test('interface : relevé au clavier et au joystick mélangés, Retour passe les facultatifs', () => {
  const pressed = ['KeyJ', joy(1), 'Enter', 'KeyU', 'KeyU', joy(5)];
  let keys: SetKeys = {};
  for (const [i, n] of NAVIGATION.entries()) {
    const record = recordKey(INTERFACE_KEYS, keys, n.id, pressed[i]!);
    assert.equal(record.refused, undefined, n.id);
    keys = record.keys;
  }
  assert.deepEqual(keys, { previous: 'KeyJ', next: joy(1), confirm: 'Enter', back: 'KeyU', settings: joy(5) });
  assert.match(recordKey(INTERFACE_KEYS, keys, 'help', 'KeyJ').refused!, /J est déjà la touche du bouton Précédent/);
  // Le même bouton physique peut servir au jeu et à l'interface : chaque jeu ne refuse que ses propres doublons.
  assert.equal(recordKey(INTERFACE_KEYS, keys, 'help', 'ShiftLeft').refused, undefined);
  assert.deepEqual(keysToTry(INTERFACE_KEYS, keys, navigationButtons(undefined)), ['previous', 'next', 'confirm', 'back']);
  assert.deepEqual(keysToTry(INTERFACE_KEYS, keys, keys), []);
});

test('interface : enregistrée dans cabinet.json, absente de [Input], remise avec les touches par défaut', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joy(0) };
  const navigation: NavigationButtons = { previous: 'KeyJ', next: 'KeyL', confirm: 'KeyK', back: 'KeyU' };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-interface-'));
  try {
    saveCabinet(home, { ...cabinetWith(buttons), navigation });
    assert.deepEqual(loadCabinet(home)!.navigation, navigation);
    assert.deepEqual(loadCabinet(home)!.buttons, buttons);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  // VPX ne lit que les boutons du jeu.
  const without = planVpxSync(cabinetWith(buttons), devPcDisplays(), VPX_FIRST_RUN).nextIni;
  const withNav = planVpxSync({ ...cabinetWith(buttons), navigation }, devPcDisplays(), VPX_FIRST_RUN).nextIni;
  assert.equal(withNav, without);
  assert.ok(!/Key;13\b|Key;15\b/.test(withNav ?? ''), 'ni J ni L dans [Input]');
  // Touches par défaut des encodeurs : les deux jeux.
  const reset = withDefaultButtons({ ...cabinetWith(buttons), navigation });
  assert.deepEqual(reset.buttons, DEFAULT_BUTTONS);
  assert.deepEqual(reset.navigation, { previous: 'ShiftLeft', next: 'ShiftRight', confirm: 'Digit1', back: 'Escape' });
});

test('l’interface lit ses propres boutons partout, jamais ceux du jeu seuls', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', ...parts), 'utf8');
  for (const file of ['frontend.ts', 'frontend-gate.ts', 'settings.ts', 'wizard.ts']) {
    const src = read('app', 'src', file);
    // navigationKeys, interfaceKeys, withoutButtonKeys reçoivent la borne (ses deux jeux), pas ses seuls boutons de jeu.
    assert.doesNotMatch(src, /(navigationKeys|interfaceKeys|withoutButtonKeys)\([^)]*\?\.buttons\b/, file);
    assert.doesNotMatch(src, /(navigationKeys|interfaceKeys)\(buttons\b/, file);
  }
  assert.match(read('app', 'src', 'frontend.ts'), /function menuKeysFor\(cabinet: ButtonsSource\)[\s\S]*?interfaceKeys\(cabinet\)/);
});

test('fenêtre au-dessus du menu (« Récupérer ») : aucune fenêtre de la borne ne repasse devant elle', () => {
  // Vraie borne à Pinscape (0.1.3-essai.2) : au premier clic dans « Récupérer », le fronton
  // reprenait le focus et passait devant. Toute fenêtre mise « toujours au-dessus » doit
  // reprendre le focus quand une autre fenêtre de l'application le prend.
  const dir = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const onTop = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && /\.setAlwaysOnTop\(true/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.ok(onTop.includes('acquire-window.ts'));
  for (const f of onTop) {
    const source = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(source, /app\.on\('browser-window-focus'[\s\S]*?app\.off\('browser-window-focus'/, `${f} : le focus pris par une autre fenêtre doit lui revenir`);
    assert.match(source, /\.moveTop\(\)/, `${f} : la fenêtre doit repasser devant`);
  }
  const acquire = fs.readFileSync(path.join(dir, 'acquire-window.ts'), 'utf8');
  assert.match(acquire, /keepInFront\(win\);[\s\S]{0,40}win\.on\('closed'/);
});
