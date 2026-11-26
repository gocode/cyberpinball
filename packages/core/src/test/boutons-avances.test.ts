import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADVANCED_BUTTONS,
  BUTTONS,
  buttonProblems,
  DEFAULT_BUTTONS,
  joystickCode,
  recordButton,
  sdlScancode,
  vpxInputSettings,
  VPX_ACTIONS_WITHOUT_KEY,
  VPX_INPUT_DEFAULTS,
  VPX_VOLUME_ACTIONS,
} from '../buttons';
import { IniDocument } from '../ini';
import type { CabinetButtons } from '../model';

// Actions de [Input] (Mapping.*) de VPX 10.8.1, relevées d'un VPinballX.ini écrit par VPX. Invariant : chaque
// action est un bouton de la borne, tenue par Cyber Pinball, ou dans la liste de celles qu'on laisse à VPX,
// avec la raison. Une action nouvelle de VPX (liste mise à jour à chaque version) fait échouer le test : on
// décide alors de l'ajouter aux boutons ou de la laisser.
const VPX_ACTIONS = [
  'LeftFlipper', 'LeftStagedFlipper', 'UILeft', 'RightFlipper', 'RightStagedFlipper', 'UIRight', 'Start', 'ExitGame', 'Credit1', 'LaunchBall',
  'LeftMagna', 'UIUp', 'RightMagna', 'UIDown', 'ExtraBall', 'Pause', 'Tilt', 'SlamTilt', 'CoinDoor', 'Service2', 'Service3', 'LeftNudge',
  'RightNudge', 'CenterNudge', 'VolumeDown', 'VolumeUp', 'InGameUI', 'Credit2', 'Credit3', 'Credit4', 'Lockbar', 'PerfOverlay', 'ShowRules',
  'Reset', 'Service1', 'Service4', 'Service5', 'Service6', 'Service7', 'Service8', 'VRCenter', 'VRUp', 'VRDown', 'VRFront', 'VRBack',
  'VRControllerCalibration', 'GenTournament', 'DebugBalls', 'Debugger', 'ToggleStereo', 'Custom1', 'Custom2', 'Custom3', 'Custom4',
];

/** Actions laissées à VPX, sans bouton de la borne (pas encore, ou jamais). */
const LEFT_TO_VPX: Record<string, string> = {
  Reset: 'redémarre la table : pas un geste de joueur',
  Service1: 'menu de service de la ROM (Échap) : lu par VPX, sans bouton propre',
  Service4: 'menu de service de la ROM (Entrée) : lu par VPX, sans bouton propre',
  Service5: 'service, sans usage connu des ROM',
  Service6: 'service, sans usage connu des ROM',
  Service7: 'service, sans usage connu des ROM',
  Service8: 'service, sans usage connu des ROM',
  VRCenter: 'recentrage : tenu par le casque, pas par l’étape Boutons',
  VRUp: 'réglage de la vue en VR : plus tard',
  VRDown: 'réglage de la vue en VR : plus tard',
  VRFront: 'réglage de la vue en VR : plus tard',
  VRBack: 'réglage de la vue en VR : plus tard',
  VRControllerCalibration: 'calibrage des manettes VR : plus tard',
  GenTournament: 'combinaison Alt + 1 des tournois de VPX',
  DebugBalls: 'billes de débogage : outil d’auteur de table',
  Debugger: 'débogueur de VPX : outil d’auteur de table',
  ToggleStereo: 'mode stéréo : réglé par la Vision 3D de Cyber Pinball',
  Custom1: 'actions des scripts de table (Custom1 à 4) : sans sens général',
  Custom2: 'actions des scripts de table (Custom1 à 4) : sans sens général',
  Custom3: 'actions des scripts de table (Custom1 à 4) : sans sens général',
  Custom4: 'actions des scripts de table (Custom1 à 4) : sans sens général',
};

test('chaque action de [Input] de VPX 10.8.1 a un bouton, ou est laissée à VPX en le disant', () => {
  const handled = new Set<string>([...BUTTONS.flatMap((b) => b.vpx), ...VPX_VOLUME_ACTIONS, 'InGameUI']);
  const unhandled = VPX_ACTIONS.filter((a) => !handled.has(a));
  assert.deepEqual([...unhandled].sort(), Object.keys(LEFT_TO_VPX).sort(), 'action de VPX sans bouton et sans raison : l’ajouter aux boutons ou à LEFT_TO_VPX');
  for (const action of handled) assert.ok(VPX_ACTIONS.includes(action), `${action} : action inconnue de VPX 10.8.1`);
  for (const action of Object.keys(VPX_INPUT_DEFAULTS)) assert.ok(VPX_ACTIONS.includes(action), `${action} : touche par défaut d’une action inconnue`);
});

test('boutons avancés : Crédit 2 à 4, Fire, règles et mode debug, facultatifs et sans touche d’office', () => {
  assert.deepEqual(ADVANCED_BUTTONS.map((b) => b.id), ['credit2', 'credit3', 'credit4', 'lockbar', 'showRules', 'debug', 'nightMode']);
  assert.deepEqual(ADVANCED_BUTTONS.flatMap((b) => b.vpx), ['Credit2', 'Credit3', 'Credit4', 'Lockbar', 'ShowRules', 'PerfOverlay']);
  for (const b of ADVANCED_BUTTONS) {
    assert.equal(b.required, false, b.id);
    assert.equal(b.default, undefined, `${b.id} : aucun encodeur ne l’envoie d’office`);
    assert.ok(b.how, `${b.id} : son rôle est dit pendant le relevé`);
    assert.equal(DEFAULT_BUTTONS[b.id], undefined, b.id);
  }
  // Les avancés viennent après tous les autres : le relevé pas à pas s'arrête avant eux.
  const first = BUTTONS.findIndex((b) => b.advanced);
  assert.ok(BUTTONS.slice(first).every((b) => b.advanced));
  assert.deepEqual(VPX_ACTIONS_WITHOUT_KEY, ['ShowRules']);
});

test('boutons avancés : sans touche rien n’est écrit ; avec une touche l’action la reçoit, et la rend en la quittant', () => {
  const empty = vpxInputSettings({ ...DEFAULT_BUTTONS }, IniDocument.parse('[Input]\n'), {});
  for (const action of ['Credit2', 'Credit3', 'Credit4', 'Lockbar', 'ShowRules', 'PerfOverlay']) {
    assert.equal(empty.settings.some((s) => s.key === `Mapping.${action}`), false, `${action} : laissée à VPX`);
  }
  const joy = joystickCode(`SDLJoy_${'0'.repeat(32)}_1`, 5);
  const set: CabinetButtons = { ...DEFAULT_BUTTONS, credit2: 'KeyU', credit3: 'KeyI', credit4: 'KeyO', lockbar: 'KeyL', showRules: 'KeyK', debug: joy };
  const plan = vpxInputSettings(set, IniDocument.parse('[Input]\n'), {});
  const value = (action: string) => plan.settings.find((s) => s.key === `Mapping.${action}`)?.value;
  assert.equal(value('Credit2'), `Key;${sdlScancode('KeyU')}`);
  assert.equal(value('Credit3'), `Key;${sdlScancode('KeyI')}`);
  assert.equal(value('Credit4'), `Key;${sdlScancode('KeyO')}`);
  assert.equal(value('Lockbar'), `Key;${sdlScancode('KeyL')}`);
  assert.equal(value('ShowRules'), `Key;${sdlScancode('KeyK')}`);
  assert.ok(value('PerfOverlay')?.includes(joy), 'le mode debug au joystick');
  assert.deepEqual(buttonProblems(set), []);
  // Boutons vidés plus tard : ce que Cyber Pinball avait écrit est rendu à VPX.
  const written = Object.fromEntries(plan.settings.map((s) => [`Input.${s.key}`, s.value]));
  const ini = IniDocument.parse(`[Input]\n${plan.settings.map((s) => `${s.key} = ${s.value}`).join('\n')}\n`);
  const later = vpxInputSettings({ ...DEFAULT_BUTTONS }, ini, written);
  for (const action of ['Credit2', 'Lockbar', 'ShowRules', 'PerfOverlay']) {
    assert.ok(later.released.some((s) => s.key === `Mapping.${action}` && s.value === ''), `${action} : rendue à VPX`);
  }
});

test('boutons avancés : mêmes refus que les autres boutons, une touche prise change de bouton', () => {
  assert.ok(recordButton({}, 'credit2', 'MetaLeft').refused, 'touche Windows refusée');
  const taken = recordButton({ ...DEFAULT_BUTTONS }, 'showRules', 'Digit5');
  assert.equal(taken.taken?.id, 'credit');
  assert.equal(taken.keys.showRules, 'Digit5');
  const twice = buttonProblems({ ...DEFAULT_BUTTONS, credit2: 'KeyU', credit3: 'KeyU' });
  assert.ok(twice.some((p) => p.includes('KeyU') || p.includes('U')), 'doublon entre deux boutons avancés');
});
