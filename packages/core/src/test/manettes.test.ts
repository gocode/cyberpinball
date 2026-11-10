// Manettes du casque : une seule règle au menu et en partie (manettes.ts), figée ici.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import {
  CONTROLLER_ELEMENTS,
  controllerProblem,
  controllerSettingFileName,
  defaultControllerSetting,
  headsetControls,
  headsetFunctions,
  HEADSET_PROFILES,
  menuActionOf,
  parseControllerEvent,
  readControllerSetting,
  VPX_HEADSET_MAPPINGS,
  VPX_OPENXR,
  vpxHeadsetInput,
  type HeadsetProfile,
} from '../manettes';
import { applyVpxSettings } from '../vpx';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('manettes : la règle des Touch, au menu et en partie (réglage par défaut)', () => {
  assert.deepEqual(
    headsetControls().map((c) => [c.id, c.label, c.menu ?? '—', c.game]),
    [
      ['flipper-gauche', 'Gâchette gauche', 'Précédent', 'Flipper gauche'],
      ['flipper-droit', 'Gâchette droite', 'Suivant', 'Flipper droit'],
      ['valider', 'A', 'Valider', 'Start ; valider dans le menu de VPX'],
      ['retour', 'B', 'Retour, annuler', 'Pause : appui court, Reprendre ou Quitter ; tenu 1,5 s, quitter'],
      ['menu', '≡ (manette gauche)', 'Menu du casque : caler, recentrer la borne, manettes', 'Menu de VPX ; retour dans ce menu'],
      ['credit', 'X', 'Collection suivante (roue)', 'Crédit'],
      ['magnasave-gauche', 'Poignée gauche', '—', 'MagnaSave gauche'],
      ['magnasave-droit', 'Poignée droite', '—', 'MagnaSave droit'],
      ['lancer', 'Clic du joystick droit', '—', 'Lancer la bille'],
      ['lanceur', 'Joystick droit', 'Déplacer la sélection', 'Lanceur : tirer vers soi, lâcher'],
      ['deplacer', 'Joystick gauche', 'Déplacer la sélection', 'Déplacer la sélection du menu de VPX ; secouer la table'],
    ],
  );
  // Au menu : A valide, B revient, rien d'autre ne valide ni ne revient ; tout joystick déplace la sélection.
  const touch = defaultControllerSetting('touch');
  const actions = Object.fromEntries(['gachette-gauche', 'gachette-droite', 'a', 'b', 'menu-gauche', 'x', 'y', 'poignee-gauche', 'clic-joystick-droit', 'joystick-droit-haut', 'joystick-gauche-bas', 'joystick-gauche-gauche', 'joystick-droit-droite'].map((e) => [e, menuActionOf(touch, e)]));
  assert.deepEqual(actions, {
    'gachette-gauche': 'previous',
    'gachette-droite': 'next',
    a: 'confirm',
    b: 'exit',
    'menu-gauche': 'headset-menu',
    x: 'zone',
    y: undefined,
    'poignee-gauche': undefined,
    'clic-joystick-droit': undefined,
    'joystick-droit-haut': 'previous',
    'joystick-gauche-bas': 'next',
    'joystick-gauche-gauche': 'previous',
    'joystick-droit-droite': 'next',
  });
  assert.equal(parseControllerEvent('toString'), undefined);
  assert.equal(parseControllerEvent('joystick-gauche'), undefined);
});

test('manettes : un réglage par défaut pour chaque profil, chaque fonction sur son propre bouton', () => {
  for (const profile of Object.keys(HEADSET_PROFILES) as HeadsetProfile[]) {
    const setting = defaultControllerSetting(profile);
    assert.equal(controllerProblem(setting), undefined, profile);
    for (const el of Object.values(setting.functions)) assert.ok(CONTROLLER_ELEMENTS[el].profiles.includes(profile), `${profile} : ${el}`);
    // Les fonctions obligatoires sont tenues partout.
    for (const f of headsetFunctions().filter((x) => !x.optional)) assert.ok(setting.functions[f.id], `${profile} : ${f.id}`);
  }
  // Deux fonctions sur un bouton, un bouton absent des manettes, un bouton pour un axe : refusés.
  const touch = defaultControllerSetting('touch');
  assert.match(controllerProblem({ ...touch, functions: { ...touch.functions, credit: 'a' } }) ?? '', /A sert déjà à Valider, Start/);
  assert.match(controllerProblem({ ...touch, functions: { ...touch.functions, credit: 'menu-droit' } }) ?? '', /n’existe pas sur ces manettes/);
  assert.match(controllerProblem({ ...touch, functions: { ...touch.functions, deplacer: 'x' } }) ?? '', /il faut un joystick ou un pavé/);
  assert.match(controllerProblem({ ...touch, functions: { ...touch.functions, valider: undefined } }) ?? '', /Valider, Start : aucun bouton/);
  // Fichier par casque et par configuration ; un fichier illisible ou incohérent redonne le défaut.
  assert.equal(controllerSettingFileName('bureau', 'touch'), 'manettes-bureau-touch.json');
  assert.equal(controllerSettingFileName(undefined, 'index'), 'manettes-index.json');
  assert.deepEqual(readControllerSetting('{"profile":"touch","functions":{"valider":"a","retour":"a"}}', 'touch'), touch);
  assert.deepEqual(readControllerSetting('pas du json', 'vive'), defaultControllerSetting('vive'));
  const swapped = { profile: 'touch', functions: { ...touch.functions, valider: 'b', retour: 'a' } };
  assert.deepEqual(readControllerSetting(JSON.stringify(swapped), 'touch'), swapped);
  assert.equal(menuActionOf(swapped as never, 'b'), 'confirm');
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
    'left/input/trackpad/x', 'left/input/trackpad/y', 'right/input/trackpad/x', 'right/input/trackpad/y',
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
  // Chaque élément du catalogue : son rang dans VPX (poignée : squeeze/click ; axes : x puis y).
  for (const [name, def] of Object.entries(CONTROLLER_ELEMENTS)) {
    const vpxPath = def.path.endsWith('/squeeze') ? `${def.path}/click` : def.path;
    if (def.axis) assert.deepEqual(def.vpx, [at(`${vpxPath}/x`), at(`${vpxPath}/y`)], name);
    else assert.equal(def.vpx, at(vpxPath), name);
  }
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
    UIRight: ['OpenXR;20;o;0.600000', 'OpenXR;22;o;0.600000', 'OpenXR;10'],
    UILeft: ['OpenXR;20;x;-0.600000', 'OpenXR;22;x;-0.600000'],
    UIUp: ['OpenXR;21;o;0.600000', 'OpenXR;23;o;0.600000'],
    UIDown: ['OpenXR;21;x;-0.600000', 'OpenXR;23;x;-0.600000'],
    InGameUI: ['OpenXR;2'],
    Pause: ['OpenXR;11'],
    Credit1: ['OpenXR;8'],
    // Plus de sortie directe : Pause tenu 1,5 s quitte (plugin « CyberPinball »).
    ExitGame: [],
    LaunchBall: ['OpenXR;13'],
    VRControllerCalibration: [],
  });
  // A valide partout (Start, et « augmenter / valider » du menu de VPX) ; B et ≡ ouvrent le menu de VPX
  // et y reviennent en arrière ; B n'est plus le crédit ; aucune liaison n'aligne la table sur les manettes.
  const users = (element: string) => Object.entries(VPX_HEADSET_MAPPINGS).filter(([, m]) => m.includes(element)).map(([a]) => a);
  assert.deepEqual(users('OpenXR;10'), ['Start', 'UIRight']);
  assert.deepEqual(users('OpenXR;11'), ['Pause']);
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
  assert.equal(get('Mapping.InGameUI'), 'Key;69 | OpenXR;2');
  assert.equal(get('Mapping.Pause'), 'Key;19 | OpenXR;11');
  assert.equal(get('Mapping.UIRight'), 'Key;229 | OpenXR;20;o;0.600000 | OpenXR;22;o;0.600000 | OpenXR;10');
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
  // Plus de sortie directe aux manettes : la sortie n'est pas écrite, VPX garde Échap (Pause tenu 1,5 s quitte).
  assert.equal(get('Mapping.ExitGame'), undefined);
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
  assert.match(frontend, /const input = vpxHeadsetInput\(readTextIfExists\(vr\.ini\), controllerSetting\(\)\);\s*if \(input\.length\) \{\s*writeIniSettings\(vr\.ini, input\);/);
  // Gâchettes et joysticks se répètent tant qu'on les tient, comme les flippers de la borne.
  assert.match(frontend, /if \(b !== 'previous' && b !== 'next'\) return void headsetHolds\.set\(name, \{ b \}\);/);
  // La légende du menu du casque vient du réglage des manettes branchées.
  assert.match(frontend, /headsetControls\(controllerSetting\(\)\)\.filter\(\(c\) => c\.menu\)/);
  assert.match(frontend, /headsetControls\(controllerSetting\(\)\)\.map\(\(c\) => \(\{ text: c\.label, detail: c\.game \}\)\)/);
});

test('manettes : l’INI de VPX suit le réglage des manettes (boutons, lanceur et secousses)', () => {
  const vive = defaultControllerSetting('vive');
  const doc = IniDocument.parse(VPX_DEFAULT_INPUT);
  applyVpxSettings(doc, vpxHeadsetInput(VPX_DEFAULT_INPUT, vive));
  const get = (key: string) => doc.get('Input', key);
  // Valider : clic du pavé droit (15) ; retour (Pause) : ≡ droit (3), menu : ≡ gauche (2) ; crédit : clic du pavé gauche (14).
  assert.equal(get('Mapping.Start'), 'Key;30 | OpenXR;15');
  assert.equal(get('Mapping.InGameUI'), 'Key;69 | OpenXR;2');
  assert.equal(get('Mapping.Pause'), 'Key;19 | OpenXR;3');
  assert.equal(get('Mapping.Credit1'), 'Key;34 | OpenXR;14');
  assert.equal(get('Mapping.ExitGame'), 'Key;41');
  // Lanceur sur le pavé droit (y : 27), secousses sur le pavé gauche (24, 25), sans capteur en double.
  assert.equal(get('Mapping.Plunger0.Position'), 'OpenXR;27;P;0.000000;-1.000000;1.000000');
  assert.equal(get('Mapping.Nudge0.X'), 'OpenXR;24;P;0.000000;1.000000;1.000000');
  assert.equal(get('PlungerSensorCount'), '1');
  assert.deepEqual(vpxHeadsetInput(doc.toString(), vive), []);
});

test('manettes : l’assistant, branché sur les manettes et rouvrable', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  // D'office au premier port d'un casque sans réglage pour cette configuration ; par ≡ et par le menu système.
  assert.match(frontend, /if \(controllerOffered \|\| !profile \|\| !headset\?\.worn\) return;\s*if \(fs\.existsSync\(controllerFile\(profile\)\)\) \{/);
  assert.match(frontend, /onProfile: \(\) => offerControllerWizard\(\),/);
  assert.match(frontend, /label: t\('Manettes'\)[\s\S]{0,200}openControllerWizard\(\);/);
  assert.match(frontend, /library\.provideSystemItem\('vr-controllers', \{/);
  // Pendant l'assistant, les manettes ne pilotent que lui ; un bouton déjà pris est refusé.
  assert.match(frontend, /if \(controllerWizard\) \{\s*if \(down\) wizardButton\(name\);\s*return;/);
  assert.match(frontend, /if \(other\) w\.problem = t\('\{bouton\} sert déjà à \{fonction\}'/);
  // Le réglage gardé sert au menu et à l'INI de VPX.
  assert.match(frontend, /const input = vpxHeadsetInput\(readTextIfExists\(vr\.ini\), controllerSetting\(\)\);/);
  assert.match(read('packages', 'core', 'src', 'systemmenu.ts'), /'vr', 'vr-calibrate', 'vr-controllers', 'controls'/);
});
