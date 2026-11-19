// Accéléromètre sans lien avec le lanceur : une borne au lanceur à bouton, ou au lanceur sur une
// autre carte (encodeur de boutons), a les secousses de son KL25Z. Avant, l'accéléromètre ne
// s'allumait qu'avec un lanceur analogique détecté sur la même carte, et « Pas de lanceur
// analogique » l'effaçait jusque dans VPX (NudgeSensorCount = 0) : le balancier de l'essai restait
// immobile et la borne ne tremblait plus en partie.
// Étapes de l'assistant chargées depuis app/dist (compilé) ; joysticks fictifs.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { DEFAULT_BUTTONS } from '../buttons';
import type { CabinetAnalog, CabinetTilt } from '../model';
import { NUDGE_GAIN, nudgeCandidates, proposedNudge, vpxAnalogSettings, type AxisReading } from '../plunger';

const APP_DIST = path.resolve(__dirname, '../../../../app/dist');

const PINSCAPE = 'SDLJoy_03000000fa190000ed00000000000000_1';
const ENCODER = 'SDLJoy_03000000790000000600000000000000_1';
const pinscape = (x = 0, y = 0): AxisReading => ({ device: PINSCAPE, name: 'mjrnet Pinscape Controller', values: [x, y, 0, 0, 0, 0] });
const encoder = (plunger = 0): AxisReading => ({ device: ENCODER, name: 'Generic USB Joystick', values: [0, 0, plunger] });

interface TiltStepLike {
  nudge?: CabinetAnalog['nudge'];
  nudgeOff: boolean;
  gain?: number;
}
interface TiltStepModule {
  startTiltStep(saved: CabinetTilt | undefined, ini: string, buttons: unknown, analog: CabinetAnalog | undefined): TiltStepLike;
  tiltTick(step: TiltStepLike, readings: AxisReading[], now: number): boolean;
  tiltClick(step: TiltStepLike, what: { row: number }): string;
  rows(step: TiltStepLike): string[];
  analogWithGain(step: TiltStepLike, analog: CabinetAnalog | undefined): CabinetAnalog | undefined;
}
interface PlungerStepLike {
  mode: 'detect' | 'settings';
  analog: CabinetAnalog;
}
interface PlungerStepModule {
  startPlungerStep(saved: CabinetAnalog | undefined, ini: string): PlungerStepLike;
  plungerTick(step: PlungerStepLike, readings: AxisReading[], now: number): boolean;
  withoutPlunger(analog: CabinetAnalog): CabinetAnalog;
}
/** Accéléromètre de l'étape, lu sans le rétrécissement de type d'un assert précédent. */
const sensorOf = (step: TiltStepLike): string | undefined => step.nudge?.device;
const tiltStep = (): TiltStepModule => require(path.join(APP_DIST, 'tilt-step.js')) as TiltStepModule;
const plungerStep = (): PlungerStepModule => require(path.join(APP_DIST, 'plunger-step.js')) as PlungerStepModule;

test('accéléromètre proposé : le premier Pinscape lu, quelle que soit la carte du lanceur', () => {
  // Encodeur de boutons (deux axes de stick) branché avant le KL25Z : le Pinscape passe devant.
  assert.deepEqual(
    nudgeCandidates([encoder(), pinscape()]).map((r) => r.device),
    [PINSCAPE, ENCODER],
  );
  assert.deepEqual(proposedNudge([encoder(), pinscape()]), { device: PINSCAPE, name: 'mjrnet Pinscape Controller', x: 0, y: 1, gain: NUDGE_GAIN.pinscape });
  // Sans Pinscape, rien d'office ; un joystick à un seul axe ne peut pas porter d'accéléromètre.
  assert.equal(proposedNudge([encoder()]), undefined);
  assert.deepEqual(nudgeCandidates([{ device: 'SDLJoy_x_1', name: 'Pédale', values: [0] }]), []);
});

test('étape « Tilt », lanceur à bouton : le KL25Z est proposé, le balancier bouge, et c’est enregistré', () => {
  const m = tiltStep();
  // Borne de l'assistant sans lanceur analogique (étape « Lanceur » : « Pas de lanceur analogique »).
  const step = m.startTiltStep(undefined, '', DEFAULT_BUTTONS, {});
  assert.equal(sensorOf(step), undefined);
  m.tiltTick(step, [encoder(), pinscape()], 0);
  assert.equal(sensorOf(step), PINSCAPE);
  assert.equal(step.gain, NUDGE_GAIN.pinscape);
  assert.ok(m.rows(step).includes('sensor'));
  assert.ok(m.rows(step).includes('gain'));
  assert.deepEqual(m.analogWithGain(step, {}), { nudge: { device: PINSCAPE, name: 'mjrnet Pinscape Controller', x: 0, y: 1, gain: NUDGE_GAIN.pinscape } });
});

test('étape « Tilt » : la ligne « Accéléromètre » passe d’une carte à l’autre, puis à « Aucun », qui tient', () => {
  const m = tiltStep();
  const readings = [encoder(), pinscape()];
  const step = m.startTiltStep(undefined, '', DEFAULT_BUTTONS, {});
  m.tiltTick(step, readings, 0);
  const sensorRow = () => ({ row: m.rows(step).indexOf('sensor') });
  m.tiltClick(step, sensorRow());
  assert.equal(sensorOf(step), ENCODER);
  m.tiltClick(step, sensorRow());
  assert.equal(sensorOf(step), undefined);
  assert.ok(!m.rows(step).includes('gain'));
  // Éteint à la main : pas reproposé tant que l'étape est ouverte, ni à la visite suivante.
  m.tiltTick(step, readings, 10);
  assert.equal(sensorOf(step), undefined);
  const saved = m.analogWithGain(step, { nudge: { device: PINSCAPE, x: 0, y: 1, gain: 3 } });
  assert.deepEqual(saved, { nudgeOff: true });
  const again = m.startTiltStep(undefined, '', DEFAULT_BUTTONS, saved);
  m.tiltTick(again, readings, 0);
  assert.equal(sensorOf(again), undefined);
  // Rallumé : retour au Pinscape.
  m.tiltClick(again, { row: m.rows(again).indexOf('sensor') });
  assert.equal(sensorOf(again), PINSCAPE);
  assert.deepEqual(Object.keys(m.analogWithGain(again, saved)!), ['nudge']);
});

test('étape « Tilt » : la carte d’arrivée garde ses axes, sa force et ses sens', () => {
  const m = tiltStep();
  const kept = { device: PINSCAPE, x: 0, y: 1, gain: 3.5, invertY: true };
  const step = m.startTiltStep(undefined, '', DEFAULT_BUTTONS, { nudge: kept });
  m.tiltTick(step, [pinscape(), encoder()], 0);
  const row = () => ({ row: m.rows(step).indexOf('sensor') });
  m.tiltClick(step, row()); // encodeur
  m.tiltClick(step, row()); // aucun
  m.tiltClick(step, row()); // retour au Pinscape d'arrivée
  assert.deepEqual(m.analogWithGain(step, { nudge: kept })?.nudge, kept);
});

test('étape « Tilt » sans carte à axes ni accéléromètre : rien à écrire dans VPX', () => {
  const m = tiltStep();
  const step = m.startTiltStep(undefined, '', DEFAULT_BUTTONS, undefined);
  m.tiltTick(step, [], 0);
  assert.ok(!m.rows(step).includes('sensor'));
  assert.equal(m.analogWithGain(step, undefined), undefined);
});

test('« Pas de lanceur analogique » garde l’accéléromètre, et VPX lit toujours les secousses', () => {
  const m = plungerStep();
  const nudge = { device: PINSCAPE, x: 0, y: 1, gain: 2 };
  const analog = m.withoutPlunger({ plunger: { device: PINSCAPE, axis: 2, reversed: false, deadZone: 0 }, nudge });
  assert.deepEqual(analog, { nudge });
  const settings = Object.fromEntries(vpxAnalogSettings(analog).map((s) => [s.key, s.value]));
  assert.equal(settings.PlungerSensorCount, '0');
  assert.equal(settings.NudgeSensorCount, '1');
  assert.equal(settings['Mapping.Nudge0.X'], `${PINSCAPE};512;A;0.000000;2.000000;1.000000`);
  assert.deepEqual(m.withoutPlunger({ nudgeOff: true }), { nudgeOff: true });
});

test('lanceur sur l’encodeur, accéléromètre sur le KL25Z : la détection les met chacun sur sa carte', () => {
  const m = plungerStep();
  const step = m.startPlungerStep(undefined, '');
  assert.equal(step.mode, 'detect');
  let now = 0;
  const tick = (pull: number) => m.plungerTick(step, [encoder(pull), pinscape()], (now += 30));
  for (let i = 0; i < 25; i++) tick(0);
  for (const pull of [0.3, 0.6, 0.9, 0.9]) tick(pull);
  tick(0);
  assert.equal(step.mode, 'settings');
  assert.equal(step.analog.plunger?.device, ENCODER);
  assert.equal(step.analog.plunger?.axis, 2);
  assert.equal(step.analog.nudge?.device, PINSCAPE);
  assert.equal(step.analog.nudge?.x, 0);
  assert.equal(step.analog.nudge?.y, 1);
});
