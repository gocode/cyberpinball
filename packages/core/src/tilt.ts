// Tilt de la borne : balancier mécanique câblé sur une entrée (bouton « Balancier de tilt » de
// l'étape « Boutons »), balancier que VPX simule à partir des secousses, ou ni l'un ni l'autre ;
// slam tilt en option. Ce que l'étape « Tilt » de l'assistant décide, et sa traduction dans la
// section [Player] de VPinballX.ini.
//
// VPX 10.8.1 (commit af26b2d93) :
// - l'action « Tilt » ([Input] Mapping.Tilt, T par défaut, InputManager.cpp) arrive au script de
//   la table comme la touche MechanicalTilt, que les scripts de PinMAME appellent keyBangBack
//   (scripts/VPMKeys.vbs) : vpmKeyDown appelle vpmNudge.DoMechTilt (WPC.vbs, s11.vbs, sega.vbs…),
//   qui donne une impulsion sur l'interrupteur du balancier de la machine (vpmNudge.TiltSwitch,
//   core.vbs). La ROM compte ses avertissements et tilte comme la vraie machine ;
// - le balancier simulé (physics/cabinet/PlumbHandler.cpp) est un pendule de 10 cm mû par
//   l'accélération de la caisse : celle que VPX déduit des secousses lues par l'accéléromètre
//   (GamepadNudge.cpp : NudgeIntentHandler puis CabinetPhysics) ou des boutons de tremblement.
//   Quand il touche son anneau, il appuie lui-même sur l'action Tilt. Réglages [Player]
//   (core/Settings_properties.inl) : SimulatedPlumb (1 par défaut), PlumbThresholdAngle (angle
//   du contact, en degrés, de 0,15 à 4, 1 par défaut ; plus petit, tilt plus facile) et
//   PlumbDamping (amortissement, 0 à 2, 1). Le .ini d'une table peut les remplacer pour elle
//   (PhysicsEngine.cpp lit les réglages de la table) ;
// - l'action « SlamTilt » (Home) arrive au script comme keySlamDoorHit : l'interrupteur slam tilt
//   de la machine (swSlamTilt, 21 sur une WPC) reste fermé tant que le bouton est appuyé.
//
// Pinscape (mjrnet, Build Guide v2, chapitre « Nudge & Tilt ») : un vrai balancier se câble
// comme un bouton, sur une entrée du KL25Z réglée en bouton de joystick ou en touche T ; avec
// lui, le balancier simulé est en trop (deux balanciers : un même coup compterait deux fois).
// L'accéléromètre du KL25Z arrive en axes X et Y du joystick (étape « Lanceur », plunger.ts).

import { buttonKeys, keyLabel } from './buttons';
import { formatNumber, t } from './i18n';
import { IniDocument } from './ini';
import type { Cabinet, CabinetButtons, CabinetTilt, TiltMode } from './model';
import { gainLabel, MAX_DEAD_ZONE, NUDGE_GAIN, nudgeFloor, parseSensorMapping, type ParsedSensor } from './plunger';
import { iniBool, type VpxSetting } from './vpx';

const PLAYER = 'Player';

/** Bornes et valeurs par défaut de VPX (Settings_properties.inl). */
export const PLUMB = {
  /** Angle du contact avec l'anneau, en degrés. */
  threshold: { min: 0.15, max: 4, default: 1 },
  damping: { min: 0, max: 2, default: 1 },
} as const;

/** Pas du réglage de l'angle aux flippers, en degrés. */
export const THRESHOLD_STEP = 0.05;

/** Angle borné à ce que VPX accepte, arrondi au pas du réglage. */
export function clampThreshold(value: number): number {
  const v = Number.isFinite(value) ? value : PLUMB.threshold.default;
  return Math.round(Math.min(PLUMB.threshold.max, Math.max(PLUMB.threshold.min, v)) * 100) / 100;
}

/** Angle pour l'écran : « 1,00° », au format de la langue. */
export function thresholdLabel(value: number): string {
  return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`;
}

// ---------------------------------------------------------------------------
// [Player] de VPinballX.ini

/**
 * Clés [Player] de l'étape « Tilt » : le balancier simulé allumé (avec son angle) ou éteint.
 * L'amortissement reste celui de VPX : il se règle en partie (F12 > Nudge Settings).
 */
export function vpxTiltSettings(tilt: CabinetTilt): VpxSetting[] {
  const simulated = tilt.mode === 'simulated';
  const settings: VpxSetting[] = [{ section: PLAYER, key: 'SimulatedPlumb', value: simulated ? '1' : '0' }];
  if (simulated) settings.push({ section: PLAYER, key: 'PlumbThresholdAngle', value: String(clampThreshold(tilt.threshold)) });
  return settings;
}

/** Clé de l'étape « Tilt » : « Player.SimulatedPlumb », « Player.PlumbThresholdAngle ». */
export function isTiltKey(id: string): boolean {
  return /^player\.(simulatedplumb|plumbthresholdangle)$/i.test(id);
}

/** Clés [Player] que l'étape « Tilt » peut écrire. */
export const VPX_TILT_OWNED_KEYS = ['SimulatedPlumb', 'PlumbThresholdAngle'] as const;

/** Ce que VPX fait aujourd'hui de son balancier simulé, d'après VPinballX.ini (valeurs par défaut sinon). */
export interface VpxPlumb {
  simulated: boolean;
  threshold: number;
  damping: number;
}

export function plumbFromIni(ini: string): VpxPlumb {
  const doc = IniDocument.parse(ini);
  const num = (key: string, def: number, min: number, max: number) => {
    const raw = doc.get(PLAYER, key);
    const v = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    simulated: iniBool(doc.get(PLAYER, 'SimulatedPlumb')) ?? true,
    threshold: num('PlumbThresholdAngle', PLUMB.threshold.default, PLUMB.threshold.min, PLUMB.threshold.max),
    damping: num('PlumbDamping', PLUMB.damping.default, PLUMB.damping.min, PLUMB.damping.max),
  };
}

/** Le réglage que VPX applique aujourd'hui, en mode de l'étape (bouton de balancier relevé ou non). */
export function tiltFromIni(ini: string, buttons: CabinetButtons | undefined): CabinetTilt {
  const plumb = plumbFromIni(ini);
  return { mode: plumb.simulated ? 'simulated' : hasBob(buttons) ? 'bob' : 'none', threshold: clampThreshold(plumb.threshold) };
}

/**
 * Réglage proposé quand l'étape n'a jamais été faite : un balancier relevé à l'étape « Boutons »
 * l'emporte sur le balancier simulé (le Pinscape conseille d'éteindre ce dernier) ; sinon, ce
 * que VPX fait déjà.
 */
export function proposedTilt(ini: string, buttons: CabinetButtons | undefined): CabinetTilt {
  const current = tiltFromIni(ini, buttons);
  return hasBob(buttons) ? { ...current, mode: 'bob' } : current;
}

/** Un balancier relevé à l'étape « Boutons » (la touche T par défaut des encodeurs ne compte pas). */
export function hasBob(buttons: CabinetButtons | undefined): boolean {
  return Boolean(buttons?.tilt);
}

/** Modes proposés à l'étape : « Balancier de la borne » seulement s'il a été relevé. */
export function tiltModes(buttons: CabinetButtons | undefined): TiltMode[] {
  return hasBob(buttons) ? ['bob', 'simulated'] : ['simulated', 'none'];
}

export function tiltModeLabel(mode: TiltMode): string {
  switch (mode) {
    case 'bob':
      return t('Balancier de la borne');
    case 'simulated':
      return t('Balancier simulé par VPX');
    case 'none':
      return t('Pas de tilt');
  }
}

/** Lignes du récapitulatif et du résultat de l'étape « Tilt ». */
export function tiltLines(tilt: CabinetTilt, buttons: CabinetButtons | undefined): string[] {
  const keys = buttonKeys(buttons);
  const lines: string[] = [];
  switch (tilt.mode) {
    case 'bob':
      lines.push(t('Tilt : balancier de la borne ({key}), balancier simulé de VPX éteint', { key: keyLabel(keys.tilt) }));
      break;
    case 'simulated':
      lines.push(t('Tilt : balancier simulé par VPX, contact à {angle}', { angle: thresholdLabel(clampThreshold(tilt.threshold)) }));
      break;
    case 'none':
      lines.push(t('Tilt : aucun balancier, ni réel ni simulé'));
  }
  if (keys.slamTilt) lines.push(t('Slam tilt : {key}', { key: keyLabel(keys.slamTilt) }));
  return lines;
}

// ---------------------------------------------------------------------------
// Réglages incohérents

export interface TiltFinding {
  severity: 'warning' | 'info';
  message: string;
}

/**
 * Ce qui empêche le tilt de marcher comme la borne le dit, d'après le modèle et ce que VPX
 * lira (`ini`, VPinballX.ini après la synchronisation) :
 * - balancier de la borne choisi, mais aucun bouton de balancier relevé ;
 * - balancier de la borne relevé, étape « Tilt » jamais faite, et balancier simulé de VPX
 *   allumé : deux balanciers, un même coup compte deux fois ;
 * - balancier simulé, mais rien pour le faire bouger (ni accéléromètre ni bouton de tremblement) ;
 * - balancier simulé choisi, éteint dans VPinballX.ini (gardé à la main) ;
 * - accéléromètre lu à l'échelle 1 ou moins (celle de VPX) : VPX ignore presque toutes les
 *   secousses d'un Pinscape (plunger.ts, NUDGE_GAIN).
 */
export function tiltFindings(cabinet: Pick<Cabinet, 'buttons' | 'analog' | 'tilt'>, ini: string): TiltFinding[] {
  const findings: TiltFinding[] = [];
  const plumb = plumbFromIni(ini);
  const tilt = cabinet.tilt;
  const bob = cabinet.buttons?.tilt;
  const where = t('menu système > « Borne » > « Configuration de la borne » > « Tilt »');
  if (tilt?.mode === 'bob' && !bob) {
    findings.push({ severity: 'warning', message: t('Tilt : balancier de la borne choisi, mais aucun bouton « Balancier de tilt » relevé. Relevez-le à l’étape « Boutons du jeu », ou choisissez le balancier simulé ({where}).', { where }) });
  }
  if (!tilt && bob && plumb.simulated) {
    findings.push({
      severity: 'warning',
      message: t('Tilt : le balancier de la borne ({key}) et celui que VPX simule à partir des secousses sont actifs ensemble : un même coup peut compter deux fois. Choisissez l’un des deux ({where}).', { key: keyLabel(bob), where }),
    });
  }
  if (tilt?.mode === 'simulated') {
    const keys = buttonKeys(cabinet.buttons);
    const nudgeButtons = keys.nudgeLeft || keys.nudgeRight || keys.nudgeCenter;
    if (!cabinet.analog?.nudge && !nudgeButtons) {
      findings.push({ severity: 'info', message: t('Tilt : balancier simulé, mais ni accéléromètre ni bouton de tremblement pour le faire bouger : il ne tiltera jamais.') });
    }
    if (!plumb.simulated) findings.push({ severity: 'warning', message: t('Tilt : balancier simulé choisi, mais éteint dans VPinballX.ini ([Player] SimulatedPlumb = 0) : la borne ne tiltera pas aux secousses.') });
  }
  const nudge = cabinet.analog?.nudge;
  if (nudge && (nudge.gain ?? NUDGE_GAIN.default) < NUDGE_GAIN.pinscape) {
    findings.push({
      severity: 'warning',
      message: t('Secousses : accéléromètre lu à la force {gain} ; un Pinscape réglé en « 1G » n’y donne presque aucune secousse (VPX ignore tout ce qui reste sous {floor} % de l’échelle). Réglez la force des secousses à l’essai ({where}).', {
        gain: gainLabel(nudge.gain ?? NUDGE_GAIN.default),
        floor: Math.round(nudgeFloor(nudge.gain ?? NUDGE_GAIN.default) * 100),
        where,
      }),
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Balancier simulé, comme VPX le calcule : l'essai de l'étape
//
// Même chaîne que VPX, pas à pas d'une milliseconde : valeur des axes X et Y de l'accéléromètre
// (SensorMapping::UpdateValue), intention de secousse (NudgeIntentHandler, en mode manette comme
// GamepadNudge), caisse de 113 kg sur ses pieds (CabinetPhysics, DampedHarmonicOscillator), puis
// pendule (PlumbHandler). Entre deux lectures, la valeur des axes reste la dernière lue, comme
// dans VPX entre deux rapports USB.

const G = 9.80665;
const CAB_MASS = 113;
/** Longueur du pendule, en mètres. */
const POLE = 0.1;
const DAMPING_COEF0 = 1.25;
const DAMPING_COEF1 = 0.75;
/** Durée d'une impulsion de secousse, en ms. */
const IMPULSE_LENGTH = 25;
/** Sans secousse pendant ce nombre de ms, VPX ne lit plus l'accélération du capteur (GamepadNudge::IsActive). */
const DEACTIVATION_MS = 10000;
/** Au plus ce nombre de ms simulées d'un coup : après une pause du processus, on ne rattrape pas tout. */
const MAX_CATCH_UP_MS = 200;

type V2 = [number, number];
type V3 = [number, number, number];

interface Oscillator {
  k: number;
  damping: number;
  x: number;
  v: number;
  a: number;
}

function oscillator(freq: number, zeta: number): Oscillator {
  const omega = 2 * Math.PI * freq;
  return { k: CAB_MASS * omega * omega, damping: 2 * zeta * CAB_MASS * omega, x: 0, v: 0, a: 0 };
}

function stepOscillator(o: Oscillator, force: number): void {
  o.a = (force - o.damping * o.v - o.k * o.x) / CAB_MASS;
  o.v += o.a * 0.001;
  o.x += o.v * 0.001;
}

/** Réglage de la simulation : le balancier de VPX et la mise en forme des axes de l'accéléromètre. */
export interface PlumbOptions {
  /** Angle du contact, en degrés. */
  threshold: number;
  damping?: number;
  /** [Input] Mapping.Nudge0.Strength (1 par défaut). */
  strength?: number;
  /** Mise en forme des axes ([Input] Mapping.Nudge0.X et .Y) ; sans elle, la valeur lue telle quelle. */
  x?: Pick<ParsedSensor, 'deadZone' | 'scale' | 'limit'>;
  y?: Pick<ParsedSensor, 'deadZone' | 'scale' | 'limit'>;
}

export interface PlumbSimulation {
  options: Required<Pick<PlumbOptions, 'threshold' | 'damping' | 'strength'>> & Pick<PlumbOptions, 'x' | 'y'>;
  // NudgeIntentHandler
  time: number;
  impulseElapsed: number;
  impulseDelay: number;
  impulse: V2;
  segmentStrength: number;
  segmentEnd: number;
  segmentIsPeak: boolean;
  segmentImpulseSent: boolean;
  // CabinetPhysics
  cabX: Oscillator;
  cabY: Oscillator;
  deactivation: number;
  // PlumbHandler
  pos: V3;
  omega: V3;
  tiltHigh: boolean;
  /** Contacts avec l'anneau depuis le début : autant d'appuis sur l'action Tilt. */
  tilts: number;
  /** Plus grand angle atteint, en part de l'angle du contact, depuis le dernier contact. */
  peak: number;
  /** Plus forte accélération de la caisse vue, en g, depuis le dernier contact. */
  peakAccel: number;
}

export function startPlumb(options: PlumbOptions): PlumbSimulation {
  return {
    options: { threshold: options.threshold, damping: options.damping ?? PLUMB.damping.default, strength: options.strength ?? 1, x: options.x, y: options.y },
    time: 0,
    impulseElapsed: IMPULSE_LENGTH + 1,
    impulseDelay: 0,
    impulse: [0, 0],
    segmentStrength: 0,
    segmentEnd: 0,
    segmentIsPeak: false,
    segmentImpulseSent: false,
    cabX: oscillator(9.3, 0.052),
    cabY: oscillator(5.8, 0.055),
    deactivation: 0,
    pos: [0, 0, -POLE],
    omega: [0, 0, 0],
    tiltHigh: false,
    tilts: 0,
    peak: 0,
    peakAccel: 0,
  };
}

/** Nouvel angle de contact : le pendule continue sa course, seul le seuil change (comme dans le menu de VPX). */
export function setPlumbThreshold(sim: PlumbSimulation, threshold: number): void {
  sim.options.threshold = threshold;
  sim.peak = 0;
}

/** Nouvelle mise en forme des axes (force des secousses changée) : la simulation continue. */
export function setPlumbShape(sim: PlumbSimulation, x: PlumbOptions['x'], y: PlumbOptions['y']): void {
  sim.options.x = x;
  sim.options.y = y;
}

/** Valeur d'un axe comme VPX la calcule (SensorMapping::UpdateValue) : zone morte, limite, échelle. */
export function sensorValue(raw: number, shape?: Pick<ParsedSensor, 'deadZone' | 'scale' | 'limit'>): number {
  if (!shape) return Math.max(-1, Math.min(1, raw));
  const dz = Math.min(MAX_DEAD_ZONE, Math.max(0, shape.deadZone));
  let v = raw;
  if (dz > 0) v = v < -dz ? (v + dz) / (1 - dz) : v > dz ? (v - dz) / (1 - dz) : 0;
  return Math.max(-shape.limit, Math.min(shape.limit, v)) * shape.scale;
}

const inProgress = (s: PlumbSimulation) => s.impulseElapsed <= IMPULSE_LENGTH + s.impulseDelay;

function impulseAcceleration(s: PlumbSimulation): V2 {
  if (!inProgress(s) || s.impulseElapsed < s.impulseDelay) return [0, 0];
  const f = 0.5 * (1 - Math.cos((2 * Math.PI * (s.impulseElapsed - s.impulseDelay)) / IMPULSE_LENGTH));
  return [s.impulse[0] * f, s.impulse[1] * f];
}

/** NudgeIntentHandler::GetImpulseDelay, manette : de 48 ms (secousse douce) à 16 ms (forte). */
function impulseDelay(strength: number): number {
  const firmness = Math.min(1, Math.max(0, strength / 5));
  return Math.trunc(48 + (16 - 48) * firmness);
}

function evaluateImpulse(s: PlumbSimulation, nudge: V2): void {
  // Manette : pas de filtre des oscillations de la caisse ; facteur de force toujours 1.
  if (s.segmentStrength > 1) {
    s.impulse = [nudge[0], nudge[1]];
    s.impulseElapsed = 0;
    s.impulseDelay = impulseDelay(s.segmentStrength);
    s.segmentImpulseSent = true;
  }
}

function stepIntent(s: PlumbSimulation, accel: V2): void {
  s.impulseElapsed++;
  s.time++;
  // Une secousse vers l'avant est toujours négative : le joueur pousse la caisse, il ne la tire pas.
  const nudge: V2 = [accel[0], Math.min(accel[1], 0)];
  const strength = Math.hypot(nudge[0], nudge[1]);
  if (s.segmentIsPeak) {
    if (strength > s.segmentStrength) {
      s.segmentStrength = strength;
      s.segmentEnd = s.time;
      if (!s.segmentImpulseSent) evaluateImpulse(s, nudge);
      else if (inProgress(s) && strength * strength > s.impulse[0] ** 2 + s.impulse[1] ** 2) {
        s.impulse = [nudge[0], nudge[1]];
        if (s.impulseElapsed < s.impulseDelay) s.impulseDelay = Math.max(s.impulseElapsed, impulseDelay(strength));
      }
    } else if (strength < s.segmentStrength * 0.9) {
      s.segmentStrength = strength;
      s.segmentEnd = s.time;
      s.segmentIsPeak = false;
    }
  } else if (strength < s.segmentStrength) {
    s.segmentStrength = strength;
    s.segmentEnd = s.time;
  } else if (strength > Math.max(0.1, s.segmentStrength * 1.1)) {
    s.segmentStrength = strength;
    s.segmentEnd = s.time;
    s.segmentIsPeak = true;
    s.segmentImpulseSent = false;
    evaluateImpulse(s, nudge);
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const length = (a: V3) => Math.sqrt(dot(a, a));

function stepPendulum(s: PlumbSimulation, cab: V2): void {
  const threshold = (s.options.threshold * Math.PI) / 180;
  if (threshold <= 0) return;
  const d0 = DAMPING_COEF0 * s.options.damping;
  const d1 = DAMPING_COEF1 * s.options.damping;
  let axis = scale(s.pos, 1 / POLE);
  const acc: V3 = [-cab[0], -cab[1], -G];
  let alpha = scale(cross(s.pos, acc), 1 / (POLE * POLE));
  alpha = sub(alpha, scale(s.omega, d0 + d1 * length(s.omega)));
  s.omega = add(s.omega, scale(alpha, 0.001));
  s.omega = sub(s.omega, scale(axis, dot(s.omega, axis)));
  s.pos = add(s.pos, scale(cross(s.omega, s.pos), 0.001));
  const len = length(s.pos);
  s.pos = len > 1e-8 ? scale(s.pos, POLE / len) : [0, 0, -POLE];
  axis = scale(s.pos, 1 / POLE);
  s.omega = sub(s.omega, scale(axis, dot(s.omega, axis)));

  const psi = Math.atan2(Math.hypot(s.pos[0], s.pos[1]), -s.pos[2]);
  const ratio = psi / threshold;
  let tilted = false;
  if (ratio > 1) {
    tilted = true;
    // Le pendule reste dans l'anneau et rebondit dessus (vitesse réfléchie, amortie).
    const limit = threshold - 1e-3;
    const theta = Math.atan2(s.pos[0], s.pos[1]);
    const xy = POLE * Math.sin(limit);
    s.pos = [xy * Math.sin(theta), xy * Math.cos(theta), -POLE * Math.cos(limit)];
    const v = cross(s.omega, s.pos);
    const reflected = sub(v, scale(axis, 2 * dot(v, axis)));
    s.omega = scale(cross(s.pos, reflected), 0.8 / (POLE * POLE));
  }
  if (tilted !== s.tiltHigh) {
    s.tiltHigh = tilted;
    if (tilted) {
      s.tilts++;
      s.peak = 0;
      s.peakAccel = 0;
    }
  }
  if (!tilted) s.peak = Math.max(s.peak, ratio);
}

/**
 * Avance la simulation de `ms` millisecondes avec ces valeurs des axes X et Y de l'accéléromètre
 * (de -1 à 1, l'axe SDL divisé par 32768, comme VPX) ; undefined : accéléromètre absent.
 */
export function stepPlumb(s: PlumbSimulation, raw: { x: number; y: number } | undefined, ms: number): void {
  const k = s.options.strength * G * 0.5;
  const accel: V2 = raw ? [sensorValue(raw.x, s.options.x) * k, sensorValue(raw.y, s.options.y) * k] : [0, 0];
  for (let i = 0; i < Math.min(MAX_CATCH_UP_MS, Math.max(0, Math.round(ms))); i++) {
    stepIntent(s, accel);
    if (inProgress(s)) {
      const a = impulseAcceleration(s);
      stepOscillator(s.cabX, CAB_MASS * a[0]);
      stepOscillator(s.cabY, CAB_MASS * a[1]);
      s.deactivation = DEACTIVATION_MS;
    } else {
      stepOscillator(s.cabX, 0);
      stepOscillator(s.cabY, 0);
      if (s.deactivation > 0) s.deactivation--;
    }
    const cab: V2 = s.deactivation > 0 ? [s.cabX.a, s.cabY.a] : [0, 0];
    s.peakAccel = Math.max(s.peakAccel, Math.hypot(cab[0], cab[1]) / G);
    stepPendulum(s, cab);
  }
}

export interface PlumbView {
  /** Position du balancier vu de dessus, l'anneau du contact ayant pour rayon 1 (comme PlumbOverlay.cpp). */
  x: number;
  y: number;
  /** En contact avec l'anneau en ce moment. */
  tilted: boolean;
  tilts: number;
  /** Plus grand angle depuis le dernier contact, en part de l'angle du contact. */
  peak: number;
  /** Plus forte accélération de la caisse depuis le dernier contact, en g. */
  accel: number;
}

export function plumbView(s: PlumbSimulation): PlumbView {
  const radius = POLE * Math.sin((s.options.threshold * Math.PI) / 180);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(s.pos[0] / radius), y: r(s.pos[1] / radius), tilted: s.tiltHigh, tilts: s.tilts, peak: r(s.peak), accel: r(s.peakAccel) };
}

/** Options de la simulation d'après VPinballX.ini : amortissement, force et mise en forme des axes de l'accéléromètre. */
export function plumbOptionsFromIni(ini: string, threshold: number): PlumbOptions {
  const doc = IniDocument.parse(ini);
  const strength = Number(doc.get('Input', 'Mapping.Nudge0.Strength'));
  const shape = (key: string) => {
    const p = parseSensorMapping(doc.get('Input', key));
    return p && { deadZone: p.deadZone, scale: p.scale, limit: p.limit };
  };
  return {
    threshold,
    damping: plumbFromIni(ini).damping,
    strength: Number.isFinite(strength) && doc.get('Input', 'Mapping.Nudge0.Strength')?.trim() ? Math.min(2, Math.max(0, strength)) : 1,
    ...(shape('Mapping.Nudge0.X') && { x: shape('Mapping.Nudge0.X') }),
    ...(shape('Mapping.Nudge0.Y') && { y: shape('Mapping.Nudge0.Y') }),
  };
}
