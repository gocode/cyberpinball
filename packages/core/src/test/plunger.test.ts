import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BUTTONS, isInputKey, joystickCode } from '../buttons';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, CabinetAnalog, CabinetButtons } from '../model';
import {
  analogFromIni,
  axisLabel,
  detectedAxis,
  feedDetection,
  isAnalogKey,
  liveAxis,
  managedJoysticks,
  parseSensorMapping,
  plungerPosition,
  proposedAnalog,
  restProblem,
  sensorMapping,
  startDetection,
  vpxAnalogSettings,
  watchShot,
  type AxisReading,
  type ShotWatch,
} from '../plunger';
import { planVpxSync } from '../sync';
import { stepCabinet, wizardStepInfo } from '../wizardsteps';
import { devPcDisplays, emptyCabinet } from './fixtures';

const PINSCAPE = 'SDLJoy_03000000fa190000ed00000000000000_1';
const PINSCAPE_NAME = 'mjrnet Pinscape Controller';

function cabinetWith(analog?: CabinetAnalog, buttons?: CabinetButtons): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  if (analog) cabinet.analog = analog;
  if (buttons) cabinet.buttons = buttons;
  return cabinet;
}

const input = (ini: string, key: string) => IniDocument.parse(ini).get('Input', key);

test('valeur d’un capteur : celle que VPX écrit (PhysicsSensor::GetMappingString)', () => {
  // Axe Z (2) : 0x202 = 514 ; nombres en six décimales (std::to_string).
  assert.equal(sensorMapping(PINSCAPE, 2, 'P'), `${PINSCAPE};514;P;0.000000;1.000000;1.000000`);
  assert.equal(sensorMapping(PINSCAPE, 5, 'V', 0, -12.5), `${PINSCAPE};517;V;0.000000;-12.500000;1.000000`);
  assert.deepEqual(parseSensorMapping(`${PINSCAPE};514;P;0.050000;-1.000000;1.000000`), { device: PINSCAPE, axis: 2, type: 'P', deadZone: 0.05, scale: -1, limit: 1 });
  // Vide, incomplet, bouton ou chapeau (0x100) au lieu d'un axe : pas un capteur d'axe.
  for (const bad of ['', `${PINSCAPE};514;P`, `${PINSCAPE};258;P;0;1;1`, `Key;514;P;0;1;1`, `${PINSCAPE};514;Q;0;1;1`]) assert.equal(parseSensorMapping(bad), undefined, bad);
  assert.equal(axisLabel(2), 'Z');
  assert.equal(axisLabel(5), 'RZ');
  assert.equal(axisLabel(7), 'axe 8');
});

test('clés [Input] du lanceur et de l’accéléromètre, et rien sans eux', () => {
  const analog: CabinetAnalog = { plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0.02, speedAxis: 5 }, nudge: { device: PINSCAPE, x: 0, y: 1 } };
  assert.deepEqual(
    vpxAnalogSettings(analog).map((s) => `${s.key}=${s.value}`),
    [
      'PlungerSensorCount=1',
      `Mapping.Plunger0.Position=${PINSCAPE};514;P;0.020000;1.000000;1.000000`,
      `Mapping.Plunger0.Velocity=${PINSCAPE};517;V;0.000000;12.500000;1.000000`,
      'NudgeSensorCount=1',
      'Mapping.Nudge0.Type=0',
      `Mapping.Nudge0.X=${PINSCAPE};512;A;0.000000;1.000000;1.000000`,
      `Mapping.Nudge0.Y=${PINSCAPE};513;A;0.000000;1.000000;1.000000`,
    ],
  );
  // Axe inversé : échelle négative, pour la vitesse aussi.
  const reversed = vpxAnalogSettings({ plunger: { device: PINSCAPE, axis: 2, reversed: true, deadZone: 0, speedAxis: 5 } });
  assert.match(reversed[1]!.value, /;-1\.000000;1\.000000$/);
  assert.match(reversed[2]!.value, /;-12\.500000;1\.000000$/);
  // Sans vitesse : la clé vidée, pour ne pas garder celle d'un ancien réglage.
  assert.equal(vpxAnalogSettings({ plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0 } })[2]!.value, '');
  // La borne n'en a pas : VPX n'en lit aucun.
  assert.deepEqual(vpxAnalogSettings({}).map((s) => `${s.key}=${s.value}`), ['PlungerSensorCount=0', 'NudgeSensorCount=0']);
});

test('clés de l’étape « Lanceur » séparées de celles de l’étape « Boutons »', () => {
  for (const id of ['Input.PlungerSensorCount', 'Input.NudgeSensorCount', 'Input.Mapping.Plunger0.Position', 'Input.Mapping.Nudge0.X', 'Input.Mapping.Plunger1.Velocity']) {
    assert.ok(isAnalogKey(id), id);
    assert.ok(!isInputKey(id), id);
  }
  for (const id of ['Input.Mapping.LeftFlipper', 'Input.Mapping.LaunchBall', 'Input.Mapping.InGameUI']) {
    assert.ok(isInputKey(id), id);
    assert.ok(!isAnalogKey(id), id);
  }
  // Coupure de la disposition par défaut de VPX : écrite pour les boutons comme pour les capteurs.
  const noAuto = `Input.Device.${PINSCAPE}.NoAutoLayout`;
  assert.ok(isAnalogKey(noAuto) && isInputKey(noAuto));
  assert.ok(wizardStepInfo('lanceur').owns('Input.Mapping.Plunger0.Position'));
  assert.ok(!wizardStepInfo('boutons').owns('Input.Mapping.Plunger0.Position'));
  assert.ok(!wizardStepInfo('lanceur').owns('Input.Mapping.LeftFlipper'));
});

test('joysticks gérés : ceux des boutons et des capteurs, sans doublon', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, leftFlipper: joystickCode(PINSCAPE, 0), rightFlipper: joystickCode(PINSCAPE, 1) };
  const other = 'SDLJoy_03000000111100002222000000000000_1';
  assert.deepEqual(managedJoysticks(buttons, { plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0 }, nudge: { device: other, x: 0, y: 1 } }), [PINSCAPE, other]);
  assert.deepEqual(managedJoysticks({ ...DEFAULT_BUTTONS }, undefined), []);
});

test('synchronisation : capteurs écrits, disposition de VPX coupée, puis rien à refaire', () => {
  const analog: CabinetAnalog = { plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0 }, nudge: { device: PINSCAPE, x: 0, y: 1 } };
  const ini = ['[Input]', 'Devices = Key', 'NudgeSensorCount = ', 'PlungerSensorCount = ', ''].join('\r\n');
  const plan = planVpxSync(cabinetWith(analog), devPcDisplays(), ini);
  assert.equal(input(plan.nextIni!, 'PlungerSensorCount'), '1');
  assert.equal(input(plan.nextIni!, 'Mapping.Plunger0.Position'), `${PINSCAPE};514;P;0.000000;1.000000;1.000000`);
  assert.equal(input(plan.nextIni!, `Device.${PINSCAPE}.NoAutoLayout`), '1');
  assert.equal(input(plan.nextIni!, 'Mapping.Nudge0.Y'), `${PINSCAPE};513;A;0.000000;1.000000;1.000000`);
  const again = planVpxSync(cabinetWith(analog), devPcDisplays(), plan.nextIni!, undefined, { memory: plan.memory });
  assert.deepEqual(again.changes, []);
  // Réglé ensuite dans le menu de VPX (zone morte) : signalé, jamais écrasé en silence.
  const edited = plan.nextIni!.replace(`${PINSCAPE};514;P;0.000000`, `${PINSCAPE};514;P;0.040000`);
  const manual = planVpxSync(cabinetWith(analog), devPcDisplays(), edited, undefined, { memory: plan.memory });
  assert.deepEqual(manual.manualEdits.map((e) => e.key), ['Mapping.Plunger0.Position']);
});

test('sans étape « Lanceur » : aucun capteur écrit, mais les joysticks des boutons ne reçoivent plus la disposition de VPX', () => {
  const buttons: CabinetButtons = { ...DEFAULT_BUTTONS, start: joystickCode(PINSCAPE, 3) };
  const plan = planVpxSync(cabinetWith(undefined, buttons), devPcDisplays(), '[Input]\r\nDevices = Key\r\n');
  assert.equal(input(plan.nextIni!, 'PlungerSensorCount'), undefined);
  assert.equal(input(plan.nextIni!, `Device.${PINSCAPE}.NoAutoLayout`), '1');
  // Ni boutons de joystick ni capteur : [Device.*] reste tel quel.
  const keyboard = planVpxSync(cabinetWith(), devPcDisplays(), '[Input]\r\nDevices = Key\r\n');
  assert.ok(!keyboard.changes.some((c) => c.key.endsWith('.NoAutoLayout')));
});

test('étape « Lanceur » refaite seule : seules ses clés et son champ changent', () => {
  const before = cabinetWith(undefined, { ...DEFAULT_BUTTONS });
  const built = cabinetWith({ plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0 } }, { ...DEFAULT_BUTTONS, start: 'Digit2' });
  const next = stepCabinet({ ...before, vpxManual: ['Input.Mapping.Plunger0.Position', 'Input.Mapping.Start'] }, built, wizardStepInfo('lanceur'));
  assert.deepEqual(next.analog, built.analog);
  assert.equal(next.buttons!.start, 'Digit1', 'boutons gardés tels qu’enregistrés');
  assert.deepEqual(next.vpxManual, ['Input.Mapping.Start']);
});

test('réglage déjà fait dans VPX : repris tel quel', () => {
  const ini = [
    '[Input]',
    'PlungerSensorCount = 1',
    `Mapping.Plunger0.Position = ${PINSCAPE};514;P;0.030000;-1.000000;1.000000`,
    `Mapping.Plunger0.Velocity = ${PINSCAPE};517;V;0.000000;-12.500000;1.000000`,
    'NudgeSensorCount = 1',
    'Mapping.Nudge0.Type = 0',
    `Mapping.Nudge0.X = ${PINSCAPE};512;A;0.000000;1.000000;1.000000`,
    `Mapping.Nudge0.Y = ${PINSCAPE};513;A;0.000000;1.000000;1.000000`,
    '',
  ].join('\r\n');
  assert.deepEqual(analogFromIni(ini), {
    plunger: { device: PINSCAPE, axis: 2, reversed: true, deadZone: 0.03, speedAxis: 5 },
    nudge: { device: PINSCAPE, x: 0, y: 1 },
  });
  // Compteurs à zéro (premier lancement de VPX) : rien.
  assert.deepEqual(analogFromIni('[Input]\r\nPlungerSensorCount = \r\nNudgeSensorCount = 0\r\n'), {});
});

/** Lectures d'un Pinscape à six axes : accéléromètre presque immobile, lanceur sur Z. */
function pinscape(z: number, jitter = 0): AxisReading {
  return { device: PINSCAPE, name: PINSCAPE_NAME, values: [0.01 + jitter, -0.01, z, 0, 0, 0] };
}

test('détection : l’axe tiré puis relâché, son sens, et ce que l’étape propose', () => {
  let d = startDetection();
  // Au repos, un peu de bruit sur X et sur le lanceur.
  for (let i = 0; i < 20; i++) d = feedDetection(d, [pinscape(i % 2 ? 0.02 : 0, i % 3 ? 0.03 : 0)]);
  assert.equal(detectedAxis(d), undefined, 'rien n’a assez bougé');
  // Tiré à fond…
  for (const z of [0.2, 0.5, 0.8, 0.95]) d = feedDetection(d, [pinscape(z)]);
  const pulled = detectedAxis(d)!;
  assert.equal(pulled.axis, 2);
  assert.equal(pulled.reversed, false);
  assert.equal(pulled.released, false);
  assert.equal(liveAxis(d)!.axis, 2);
  // … puis relâché.
  d = feedDetection(d, [pinscape(0.01)]);
  const axis = detectedAxis(d)!;
  assert.ok(axis.released);
  assert.ok(Math.abs(axis.pull - 0.95) < 1e-9);
  assert.ok(Math.abs(axis.noise - 0.02) < 1e-9);
  const proposed = proposedAnalog(axis);
  // Bruit de 2 % au repos : 3 % de zone morte ; Pinscape à six axes, lanceur sur Z : vitesse sur RZ.
  assert.deepEqual(proposed, {
    plunger: { device: PINSCAPE, name: PINSCAPE_NAME, axis: 2, reversed: false, deadZone: 0.03, speedAxis: 5 },
    nudge: { device: PINSCAPE, name: PINSCAPE_NAME, x: 0, y: 1 },
  });
});

test('détection : axe qui baisse quand on tire, contrôleur quelconque à trois axes', () => {
  const reading = (y: number): AxisReading => ({ device: PINSCAPE.replace('_1', '_2'), name: 'Encodeur USB', values: [0, y, 0] });
  let d = startDetection();
  for (const y of [0, 0, 0, 0, -0.3, -0.9, 0]) d = feedDetection(d, [reading(y)]);
  const axis = detectedAxis(d)!;
  assert.equal(axis.axis, 1);
  assert.ok(axis.reversed);
  // Ni Pinscape ni six axes : ni vitesse ni accéléromètre proposés.
  assert.deepEqual(proposedAnalog(axis), { plunger: { device: axis.device, name: 'Encodeur USB', axis: 1, reversed: true, deadZone: 0 } });
});

test('position vue par VPX : zone morte, inversion, et tir', () => {
  assert.equal(plungerPosition(0.04, { deadZone: 0.05, reversed: false }), 0);
  assert.ok(Math.abs(plungerPosition(0.525, { deadZone: 0.05, reversed: false }) - 0.5) < 1e-9);
  assert.equal(plungerPosition(-0.8, { deadZone: 0, reversed: true }), 0.8);
  let w: ShotWatch = { recent: [] };
  for (const [at, p] of [[0, 0], [500, 0.4], [600, 0.85], [640, 0.6], [660, 0.02]] as const) w = watchShot(w, p, at);
  assert.equal(w.last?.strength, 0.85);
  // Ramené doucement (0,6 s, une lecture toutes les 30 ms) : pas un tir.
  let slow: ShotWatch = { recent: [] };
  for (let i = 0; i <= 20; i++) slow = watchShot(slow, 0.8 - (0.78 * i) / 20, i * 30);
  assert.equal(slow.last, undefined);
  // Deux lectures espacées de 300 ms (processus occupé) : un lâcher entre les deux reste un tir.
  let busy: ShotWatch = { recent: [] };
  for (const [at, p] of [[0, 0.8], [300, 0]] as const) busy = watchShot(busy, p, at);
  assert.equal(busy.last?.strength, 0.8);
});

test('repos loin de 0 : signalé, VPX n’a pas de décalage', () => {
  assert.equal(restProblem(0.05), undefined);
  assert.match(restProblem(-0.98)!, /-98 %/);
});

test('détection : les premières lectures ne comptent pas, un axe qui ne revient pas cède la place au lanceur', () => {
  // Joystick tout juste ouvert : 0 avant son premier rapport, puis la gâchette à -1 pour de bon.
  const reading = (z: number, trigger: number): AxisReading => ({ device: PINSCAPE, name: 'Manette', values: [0, 0, z, 0, trigger] });
  let d = startDetection();
  d = feedDetection(d, [reading(0, 0)]);
  for (let i = 0; i < 4; i++) d = feedDetection(d, [reading(0, -1)]);
  assert.equal(detectedAxis(d), undefined, 'saut du premier rapport ignoré');
  let late = startDetection();
  late = feedDetection(late, [reading(0, 0)]);
  for (let i = 0; i < 3; i++) late = feedDetection(late, [reading(0, 0)]);
  // La gâchette saute après coup et reste là ; le lanceur est tiré moins loin, puis lâché.
  for (const [z, trig] of [[0, -1], [0.6, -1], [0.8, -1], [0, -1]] as const) late = feedDetection(late, [reading(z, trig)]);
  const axis = detectedAxis(late)!;
  assert.equal(axis.axis, 2);
  assert.ok(axis.released);
});
