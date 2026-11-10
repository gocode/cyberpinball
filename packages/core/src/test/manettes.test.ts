// Manettes du casque : une seule règle au menu et en partie (manettes.ts), figée ici.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import { HEADSET_BUTTONS, headsetControls, VPX_HEADSET_MAPPINGS, VPX_OPENXR, vpxHeadsetInput } from '../manettes';
import { applyVpxSettings } from '../vpx';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('manettes : la table des correspondances, au menu et en partie', () => {
  assert.deepEqual(
    headsetControls().map((c) => [c.id, c.label, c.menu ?? '—', c.game ?? '—']),
    [
      ['a', 'A', 'Valider', 'Start ; valider dans le menu de VPX'],
      ['b', 'B', 'Retour, annuler', 'Menu de VPX ; retour dans ce menu'],
      ['joysticks', 'Joysticks', 'Déplacer la sélection', 'Déplacer la sélection du menu de VPX ; le gauche secoue la table, le droit tiré vers soi arme le lanceur'],
      ['gachettes', 'Gâchettes', 'Précédent, suivant (comme les flippers de la borne)', 'Flippers'],
      ['menu', '≡ (manette gauche)', 'Menu du casque : caler, recentrer la borne', 'Menu de VPX'],
      ['poignees', 'Poignées', '—', 'MagnaSave'],
      ['x', 'X', 'Collection suivante (roue)', 'Crédit'],
      ['y', 'Y', '—', 'Quitter la partie'],
      ['clic-droit', 'Clic du joystick droit', '—', 'Lancer la bille'],
      ['clic-gauche', 'Clic du joystick gauche', '—', 'Rien : la table ne bouge jamais d’elle-même'],
    ],
  );
  // Au menu : A valide, B revient, et rien d'autre ne valide ni ne revient.
  assert.deepEqual(
    Object.entries(HEADSET_BUTTONS).filter(([, a]) => a === 'confirm' || a === 'exit'),
    [
      ['start', 'confirm'],
      ['exit', 'exit'],
    ],
  );
});

test('manettes : les éléments OpenXR de VPX 10.8.1 (XRInputHandler.h, rang dans la liste des chemins)', () => {
  // L'ordre des chemins qu'écoute VPX : leur rang est le numéro écrit dans l'INI (« OpenXR;<rang> »).
  const paths = [
    'left/input/select/click', 'right/input/select/click', 'left/input/menu/click', 'right/input/menu/click',
    'left/input/squeeze/click', 'right/input/squeeze/click', 'left/input/trigger/click', 'right/input/trigger/click',
    'left/input/x/click', 'left/input/y/click', 'right/input/a/click', 'right/input/b/click',
    'left/input/thumbstick/click', 'right/input/thumbstick/click', 'left/input/trackpad/click', 'right/input/trackpad/click',
    'left/input/trigger/value', 'right/input/trigger/value', 'left/input/squeeze/value', 'right/input/squeeze/value',
    'left/input/thumbstick/x', 'left/input/thumbstick/y', 'right/input/thumbstick/x', 'right/input/thumbstick/y',
  ];
  const at = (p: string) => paths.indexOf(p);
  assert.deepEqual(VPX_OPENXR, {
    leftMenu: at('left/input/menu/click'),
    leftSqueeze: at('left/input/squeeze/click'),
    rightSqueeze: at('right/input/squeeze/click'),
    x: at('left/input/x/click'),
    y: at('left/input/y/click'),
    a: at('right/input/a/click'),
    b: at('right/input/b/click'),
    leftStickClick: at('left/input/thumbstick/click'),
    rightStickClick: at('right/input/thumbstick/click'),
    leftTrigger: at('left/input/trigger/value'),
    rightTrigger: at('right/input/trigger/value'),
    leftStickX: at('left/input/thumbstick/x'),
    leftStickY: at('left/input/thumbstick/y'),
    rightStickX: at('right/input/thumbstick/x'),
    rightStickY: at('right/input/thumbstick/y'),
  });
});

test('manettes : liaisons de VPX en partie, la même règle qu’au menu', () => {
  assert.deepEqual(VPX_HEADSET_MAPPINGS, {
    LeftFlipper: ['OpenXR;16;o;0.300000'],
    RightFlipper: ['OpenXR;17;o;0.300000'],
    LeftStagedFlipper: ['OpenXR;16;o;0.600000'],
    RightStagedFlipper: ['OpenXR;17;o;0.600000'],
    LeftMagna: ['OpenXR;4'],
    RightMagna: ['OpenXR;5'],
    Start: ['OpenXR;10'],
    UIRight: ['OpenXR;22;o;0.600000', 'OpenXR;20;o;0.600000', 'OpenXR;10'],
    UILeft: ['OpenXR;22;x;-0.600000', 'OpenXR;20;x;-0.600000'],
    UIUp: ['OpenXR;21;o;0.600000', 'OpenXR;23;o;0.600000'],
    UIDown: ['OpenXR;21;x;-0.600000', 'OpenXR;23;x;-0.600000'],
    InGameUI: ['OpenXR;11', 'OpenXR;2'],
    Credit1: ['OpenXR;8'],
    ExitGame: ['OpenXR;9'],
    LaunchBall: ['OpenXR;13'],
    VRControllerCalibration: [],
  });
  // A valide partout (Start, et « augmenter / valider » du menu de VPX) ; B et ≡ ouvrent le menu de VPX
  // et y reviennent en arrière ; B n'est plus le crédit ; aucune liaison n'aligne la table sur les manettes.
  const users = (element: string) => Object.entries(VPX_HEADSET_MAPPINGS).filter(([, m]) => m.includes(element)).map(([a]) => a);
  assert.deepEqual(users('OpenXR;10'), ['Start', 'UIRight']);
  assert.deepEqual(users('OpenXR;11'), ['InGameUI']);
  assert.deepEqual(users('OpenXR;2'), ['InGameUI']);
  assert.deepEqual(users('OpenXR;12'), []);
});

// La section [Input] que VPX a écrite dans l'INI de la VR du PC de développement (10 novembre 2026).
const VPX_DEFAULT_INPUT = `[Input]
NudgeSensorCount = 1
PlungerSensorCount = 1
Devices = Key
Mapping.LeftFlipper = Key;225 | OpenXR;16;o;0.300000
Mapping.RightFlipper = Key;229 | OpenXR;17;o;0.300000
Mapping.LeftStagedFlipper = Key;225 | OpenXR;16;o;0.600000
Mapping.RightStagedFlipper = Key;229 | OpenXR;17;o;0.600000
Mapping.LeftMagna = Key;224 | OpenXR;4
Mapping.RightMagna = Key;228 | OpenXR;5
Mapping.UIUp = Key;224 | OpenXR;21;o;0.900000
Mapping.UIDown = Key;228 | OpenXR;21;x;-0.900000
Mapping.UILeft = Key;225 | OpenXR;22;x;-0.900000
Mapping.UIRight = Key;229 | OpenXR;22;o;0.900000
Mapping.LaunchBall = Key;40 | OpenXR;13
Mapping.Credit1 = Key;34 | OpenXR;11
Mapping.Start = Key;30 | OpenXR;10
Mapping.ExitGame = Key;41 | OpenXR;9
Mapping.InGameUI = Key;69 | OpenXR;8
Mapping.VRCenter = Key;93
Mapping.VRControllerCalibration = OpenXR;12
Mapping.Plunger0.Position = OpenXR;23;P;0.000000;-1.000000;1.000000
Mapping.Nudge0.Type = 0
Mapping.Nudge0.Strength = 1.0
Mapping.Nudge0.X = OpenXR;20;P;0.000000;1.000000;1.000000
Mapping.Nudge0.Y = OpenXR;21;P;0.000000;1.000000;1.000000
`;

const after = (text: string) => {
  const doc = IniDocument.parse(text);
  applyVpxSettings(doc, vpxHeadsetInput(text));
  return doc;
};

test('manettes : l’INI d’une partie dans le casque, à partir des liaisons par défaut de VPX', () => {
  const doc = after(VPX_DEFAULT_INPUT);
  const get = (key: string) => doc.get('Input', key);
  // Sa disposition automatique coupée : sans quoi VPX remettrait ses liaisons, dont le clic du joystick gauche.
  assert.equal(get('Device.OpenXR.NoAutoLayout'), '1');
  assert.equal(get('Mapping.Credit1'), 'Key;34 | OpenXR;8');
  assert.equal(get('Mapping.InGameUI'), 'Key;69 | OpenXR;11 | OpenXR;2');
  assert.equal(get('Mapping.UIRight'), 'Key;229 | OpenXR;22;o;0.600000 | OpenXR;20;o;0.600000 | OpenXR;10');
  assert.equal(get('Mapping.UIDown'), 'Key;228 | OpenXR;21;x;-0.600000 | OpenXR;23;x;-0.600000');
  assert.equal(get('Mapping.VRControllerCalibration'), '');
  // Touches du clavier et recentrage (5 du pavé) gardés ; lanceur et secousses déjà aux joysticks : pas en double.
  assert.equal(get('Mapping.VRCenter'), 'Key;93');
  assert.equal(get('PlungerSensorCount'), '1');
  assert.equal(get('NudgeSensorCount'), '1');
  // Une seconde fois : plus rien à changer.
  assert.deepEqual(vpxHeadsetInput(doc.toString()), []);
});

test('manettes : un INI sans liaison des manettes (borne neuve, lanceur de la borne) les reçoit toutes', () => {
  const text = `[Input]
PlungerSensorCount = 1
Mapping.Plunger0.Position = Joy1;2;P;0.000000;1.000000;1.000000
Mapping.Start = Key;30 | Joy1;3
`;
  const doc = after(text);
  const get = (key: string) => doc.get('Input', key);
  // Le bouton Start de la borne reste, A s'ajoute ; une action jamais écrite part de sa touche par défaut.
  assert.equal(get('Mapping.Start'), 'Key;30 | Joy1;3 | OpenXR;10');
  assert.equal(get('Mapping.ExitGame'), 'Key;41 | OpenXR;9');
  // Le lanceur de la borne garde sa place ; celui du joystick droit vient après, de même pour les secousses.
  assert.equal(get('Mapping.Plunger0.Position'), 'Joy1;2;P;0.000000;1.000000;1.000000');
  assert.equal(get('Mapping.Plunger1.Position'), 'OpenXR;23;P;0.000000;-1.000000;1.000000');
  assert.equal(get('PlungerSensorCount'), '2');
  assert.equal(get('Mapping.Nudge0.X'), 'OpenXR;20;P;0.000000;1.000000;1.000000');
  assert.equal(get('NudgeSensorCount'), '1');
  assert.deepEqual(vpxHeadsetInput(doc.toString()), []);
});

test('manettes : branchements du compagnon et du menu', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  // L'INI de chaque partie dans le casque reçoit les liaisons des manettes.
  assert.match(frontend, /const input = vpxHeadsetInput\(readTextIfExists\(vr\.ini\)\);\s*if \(input\.length\) \{\s*writeIniSettings\(vr\.ini, input\);/);
  // Gâchettes et joysticks se répètent tant qu'on les tient, comme les flippers de la borne.
  assert.match(frontend, /if \(b !== 'previous' && b !== 'next'\) return void headsetHolds\.set\(name, undefined\);/);
  // La légende du menu du casque vient de la table.
  assert.match(frontend, /headsetControls\(\)\.filter\(\(c\) => c\.menu\)/);
  assert.match(frontend, /headsetControls\(\)\.filter\(\(c\) => c\.game\)/);
});
