import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import {
  BUTTONS,
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
  refusedKey,
  sdlScancode,
  vpxInputSettings,
  VPX_INPUT_DEFAULTS,
  withKeyboardKeys,
  withoutButtonKeys,
} from '../buttons';
import { IniDocument } from '../ini';
import type { Cabinet, CabinetButtons } from '../model';
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
  assert.deepEqual(navigationKeys({ ...DEFAULT_BUTTONS, exit: 'Tab' }), navigationKeys(undefined));
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
  const keys = navigationKeys({ leftFlipper: 'KeyA', rightFlipper: 'ArrowLeft', start: 'Digit2', exit: 'Enter', credit: 'Digit5', plunger: 'Space' });
  assert.deepEqual(keys.previous, ['KeyA', 'ArrowUp'], 'Flèche gauche est le flipper droit');
  assert.deepEqual(keys.next, ['ArrowLeft', 'ArrowRight', 'ArrowDown']);
  assert.deepEqual(keys.confirm, ['Digit2', 'NumpadEnter'], 'Entrée est Exit');
  assert.deepEqual(keys.exit, ['Enter', 'Escape']);
  // Le 1 n'est plus Start : il ne valide plus rien.
  assert.ok(!Object.values(keys).flat().includes('Digit1'));
});

test('raccourcis du menu retirés quand un bouton les envoie', () => {
  assert.deepEqual(withoutButtonKeys(['KeyH', 'F1'], { ...DEFAULT_BUTTONS, extraBall: 'KeyH' }), ['F1']);
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
  assert.equal(input(plan.nextIni!, 'Pause'), '');
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
  assert.deepEqual(navigationKeys(twice), navigationKeys(undefined));
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
  assert.deepEqual(navigationKeys(buttons).previous, [joy(0), 'ArrowLeft', 'ArrowUp']);
  assert.deepEqual(navigationKeys(buttons).confirm, [joy(2), 'Enter', 'NumpadEnter']);
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
