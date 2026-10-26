// Lanceur analogique (plunger à potentiomètre ou capteur, lu par un Pinscape sur KL25Z ou un
// autre contrôleur en mode joystick) et accéléromètre de la borne : ce que l'étape « Lanceur »
// de l'assistant relève, et sa traduction dans la section [Input] de VPinballX.ini.
//
// VPX 10.8.1 (commit af26b2d93) lit ses capteurs analogiques ainsi (src/input/PlungerHandler.cpp,
// PhysicsSensor.cpp, SensorMapping.h, physics/cabinet/NudgeHandler.cpp, GamepadNudge.cpp) :
// - [Input] PlungerSensorCount : nombre de capteurs de lanceur ; chacun a
//   « Mapping.Plunger<n>.Position » et « Mapping.Plunger<n>.Velocity » ;
// - [Input] NudgeSensorCount : nombre de capteurs de tremblement ; chacun a
//   « Mapping.Nudge<n>.Type » (0 : manette), « Mapping.Nudge<n>.X » et « .Y » ;
// - une valeur de capteur s'écrit « <joystick>;<axe>;<P|V|A>;<zone morte>;<échelle>;<limite> »
//   (PhysicsSensor::GetMappingString) : le joystick par son identifiant de VPX
//   (« SDLJoy_<GUID>_<rang> », celui des boutons), l'axe par son numéro de VPX, 0x200 plus le
//   numéro SDL de l'axe (SDLInputHandler.h), les nombres par std::to_string (six décimales) ;
// - la valeur lue (-1..1, l'axe SDL divisé par 32768) passe la zone morte, est bornée à
//   ±limite puis multipliée par l'échelle : une échelle négative inverse l'axe (« Reversed
//   axis » du menu de VPX). Le lanceur vaut 0 au repos, 1 tiré à fond, négatif poussé vers
//   l'avant ; VPX n'a pas de décalage : le repos se règle sur la carte (calibration du Pinscape).
//
// VPX reconnaît de lui-même un Pinscape réglé en « X/Y/Z + RX/RY/RZ » (nom « mjrnet Pinscape
// Controller », 6 axes au moins) et propose en partie d'appliquer sa disposition : lanceur sur Z,
// accéléromètre sur X et Y. Accepter efface d'abord tout ce qui vient de ce joystick
// (InputManager::ApplyDefaultDeviceMapping, ClearDeviceMappings), boutons compris : ceux que
// Cyber Pinball a écrits. Une borne réglée par Cyber Pinball coupe donc cette proposition
// ([Input] Device.<joystick>.NoAutoLayout = 1) pour chaque joystick qu'elle utilise.

import { formatNumber, t } from './i18n';
import { IniDocument } from './ini';
import type { CabinetAnalog, CabinetButtons, PlungerSensor, NudgeSensor } from './model';
import type { VpxSetting } from './vpx';
import { isSensorKey, joystickButton } from './buttons';

const INPUT = 'Input';

/** Numéro de VPX d'un axe de joystick SDL (SDLInputHandler.h : 0x0200 | axe). */
export const VPX_AXIS_BASE = 0x200;

/** Échelle de VPX pour la vitesse du lanceur mesurée par un Pinscape (SensorSetupPage.cpp : 12,5 p.u./s). */
export const PINSCAPE_PLUNGER_SPEED_SCALE = 12.5;

/** Zone morte la plus large que propose le menu de VPX (SensorSetupPage.cpp : 0 à 30 %). */
export const MAX_DEAD_ZONE = 0.3;

/**
 * Force des secousses : échelle des axes de l'accéléromètre ([Input] Mapping.Nudge0.X et .Y).
 *
 * VPX lit un accéléromètre de manette (Mapping.Nudge0.Type = 0, sa disposition par défaut pour un
 * Pinscape, InputManager / SDLInputHandler.h) comme un stick : une valeur de 1 vaut g/2 m/s²
 * (GamepadNudge::StepOneMillisecond), et une secousse sous 1 m/s² ne compte pas
 * (NudgeIntentHandler::EvaluateImpulse). Or un Pinscape réglé en « 1G » (son réglage par défaut,
 * config.h) envoie l'accélération en g, pleine échelle à 1 g (rawToReport, main.cpp) : à
 * l'échelle 1, VPX ne voit que la moitié de chaque secousse et ignore tout ce qui reste sous
 * 0,2 g, c'est-à-dire presque toutes les secousses d'un joueur (octobre 2026, vraie borne : la
 * bille bougeait à peine et le balancier simulé ne tiltait jamais). À l'échelle 2, 1 g mesuré
 * vaut 1 g dans VPX. Réglé à l'étape « Tilt », essai à l'appui.
 */
export const NUDGE_GAIN = { min: 0.5, max: 6, step: 0.25, default: 1, pinscape: 2 } as const;

/** Force bornée à ce que l'étape propose, arrondie au pas. */
export function clampNudgeGain(value: number): number {
  const v = Number.isFinite(value) ? value : NUDGE_GAIN.default;
  return Math.round(Math.min(NUDGE_GAIN.max, Math.max(NUDGE_GAIN.min, v)) / NUDGE_GAIN.step) * NUDGE_GAIN.step;
}

/** Échelle écrite pour un axe de l'accéléromètre : la force, négative si l'axe est inversé. */
export function nudgeScale(nudge: Pick<NudgeSensor, 'gain' | 'invertX' | 'invertY'>, axis: 'x' | 'y'): number {
  const gain = nudge.gain ?? NUDGE_GAIN.default;
  return (axis === 'x' ? nudge.invertX : nudge.invertY) ? -gain : gain;
}

/**
 * Plus petite valeur d'axe (de 0 à 1) dont VPX fait une secousse : 1 m/s² d'intention, divisé
 * par g/2, par la force et par [Input] Mapping.Nudge0.Strength (1 par défaut).
 */
export function nudgeFloor(gain: number, strength = 1): number {
  return 1 / ((9.80665 / 2) * gain * strength);
}

/** Axes d'un Pinscape (« X/Y/Z + RX/RY/RZ ») : accéléromètre sur X et Y, lanceur sur Z, sa vitesse sur RZ. */
export const PINSCAPE_AXES = { nudgeX: 0, nudgeY: 1, plunger: 2, plungerSpeed: 5 } as const;

/** Nom que SDL donne à un Pinscape (KL25Z ou Pico), celui que VPX reconnaît. */
export function isPinscape(name: string | undefined): boolean {
  return Boolean(name?.startsWith('mjrnet Pinscape Controller'));
}

/** Force des secousses pour l'écran : « ×2,00 ». */
export function gainLabel(gain: number): string {
  return `×${formatNumber(gain, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Clé des axes de l'accéléromètre : « Input.Mapping.Nudge0.X », « .Y ». L'étape « Tilt » y règle la force. */
export function isNudgeAxisKey(id: string): boolean {
  return /^input\.mapping\.nudge0\.[xy]$/i.test(id);
}

/** Nom d'un axe pour l'écran, comme le panneau « Contrôleurs de jeu » de Windows : X, Y, Z, RX, RY, RZ, puis « axe 7 ». */
export function axisLabel(axis: number): string {
  return ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'][axis] ?? t('axe {n}', { n: axis + 1 });
}

// ---------------------------------------------------------------------------
// Valeurs de [Input]

/** Nombre comme VPX l'écrit (std::to_string : six décimales). */
function vpxFloat(value: number): string {
  return value.toFixed(6);
}

/** Valeur « Mapping.* » d'un capteur : « <joystick>;<axe de VPX>;<type>;<zone morte>;<échelle>;<limite> ». */
export function sensorMapping(device: string, axis: number, type: 'P' | 'V' | 'A', deadZone = 0, scale = 1, limit = 1): string {
  return [device, String(VPX_AXIS_BASE + axis), type, vpxFloat(deadZone), vpxFloat(scale), vpxFloat(limit)].join(';');
}

export interface ParsedSensor {
  device: string;
  /** Numéro SDL de l'axe (à partir de 0). */
  axis: number;
  type: 'P' | 'V' | 'A';
  deadZone: number;
  scale: number;
  limit: number;
}

/** Lit une valeur « Mapping.* » de capteur comme PhysicsSensor::SetMapping ; undefined si vide ou invalide, ou si ce n'est pas un axe de joystick. */
export function parseSensorMapping(value: string | undefined): ParsedSensor | undefined {
  const fields = (value ?? '').split(';').map((f) => f.trim());
  if (fields.length < 6 || !/^SDLJoy_[0-9a-f]{32}_\d+$/i.test(fields[0]!)) return undefined;
  const id = Number(fields[1]);
  const [deadZone, scale, limit] = fields.slice(3, 6).map(Number) as [number, number, number];
  if (!Number.isInteger(id) || id < VPX_AXIS_BASE || id >= VPX_AXIS_BASE + 0x100) return undefined;
  if (!['P', 'V', 'A'].includes(fields[2]!) || ![deadZone, scale, limit].every(Number.isFinite)) return undefined;
  return { device: fields[0]!, axis: id - VPX_AXIS_BASE, type: fields[2] as ParsedSensor['type'], deadZone, scale, limit };
}

/**
 * Clés [Input] de l'étape « Lanceur » : un capteur de lanceur (position, et vitesse quand le
 * contrôleur la mesure), un capteur de tremblement par l'accéléromètre, chacun réduit à zéro
 * s'il n'y en a pas. Un seul de chaque : VPX n'en lit qu'un actif à la fois.
 */
export function vpxAnalogSettings(analog: CabinetAnalog): VpxSetting[] {
  const settings: VpxSetting[] = [];
  const put = (key: string, value: string) => settings.push({ section: INPUT, key, value });
  const plunger = analog.plunger;
  put('PlungerSensorCount', plunger ? '1' : '0');
  if (plunger) {
    put('Mapping.Plunger0.Position', sensorMapping(plunger.device, plunger.axis, 'P', plunger.deadZone, plunger.reversed ? -1 : 1));
    put('Mapping.Plunger0.Velocity', plunger.speedAxis === undefined ? '' : sensorMapping(plunger.device, plunger.speedAxis, 'V', 0, plunger.reversed ? -PINSCAPE_PLUNGER_SPEED_SCALE : PINSCAPE_PLUNGER_SPEED_SCALE));
  }
  const nudge = analog.nudge;
  put('NudgeSensorCount', nudge ? '1' : '0');
  if (nudge) {
    put('Mapping.Nudge0.Type', '0');
    put('Mapping.Nudge0.X', sensorMapping(nudge.device, nudge.x, 'A', 0, nudgeScale(nudge, 'x')));
    put('Mapping.Nudge0.Y', sensorMapping(nudge.device, nudge.y, 'A', 0, nudgeScale(nudge, 'y')));
  }
  return settings;
}

/**
 * Joysticks dont Cyber Pinball écrit les boutons ou les capteurs : VPX ne leur propose plus sa
 * disposition par défaut, qui effacerait d'abord ce que Cyber Pinball y a affecté.
 */
export function managedJoysticks(buttons: CabinetButtons | undefined, analog: CabinetAnalog | undefined): string[] {
  const devices = new Set<string>();
  for (const code of Object.values(buttons ?? {})) {
    const joy = code ? joystickButton(code) : undefined;
    if (joy) devices.add(joy.device);
  }
  if (analog?.plunger) devices.add(analog.plunger.device);
  if (analog?.nudge) devices.add(analog.nudge.device);
  return [...devices];
}

/** [Input] Device.<joystick>.NoAutoLayout = 1 pour chacun de ces joysticks. */
export function noAutoLayoutSettings(devices: string[]): VpxSetting[] {
  return devices.map((device) => ({ section: INPUT, key: `Device.${device}.NoAutoLayout`, value: '1' }));
}

/** Clé de l'étape « Lanceur » (« Input.PlungerSensorCount », « Input.Mapping.Nudge0.X »…). */
export function isAnalogKey(id: string): boolean {
  return isSensorKey(id) || isNoAutoLayoutKey(id);
}

/** « Input.Device.<joystick>.NoAutoLayout » : écrite pour les boutons comme pour les capteurs. */
export function isNoAutoLayoutKey(id: string): boolean {
  return /^input\.device\..+\.noautolayout$/i.test(id);
}

/**
 * Capteurs que VPX a déjà (réglés dans son menu, ou disposition du Pinscape acceptée) : le
 * premier lanceur et le premier tremblement par manette, s'ils sont des axes de joystick.
 * L'étape « Lanceur » part de là quand elle n'a jamais été faite.
 */
export function analogFromIni(ini: string): CabinetAnalog {
  const doc = IniDocument.parse(ini);
  const analog: CabinetAnalog = {};
  const count = (key: string) => Number(doc.get(INPUT, key) || '0');
  if (count('PlungerSensorCount') > 0) {
    const position = parseSensorMapping(doc.get(INPUT, 'Mapping.Plunger0.Position'));
    if (position && position.type === 'P') {
      const speed = parseSensorMapping(doc.get(INPUT, 'Mapping.Plunger0.Velocity'));
      analog.plunger = {
        device: position.device,
        axis: position.axis,
        reversed: position.scale < 0,
        deadZone: Math.min(MAX_DEAD_ZONE, Math.max(0, position.deadZone)),
        ...(speed && speed.type === 'V' && speed.device === position.device && { speedAxis: speed.axis }),
      };
    }
  }
  if (count('NudgeSensorCount') > 0 && Number(doc.get(INPUT, 'Mapping.Nudge0.Type') || '0') === 0) {
    const x = parseSensorMapping(doc.get(INPUT, 'Mapping.Nudge0.X'));
    const y = parseSensorMapping(doc.get(INPUT, 'Mapping.Nudge0.Y'));
    if (x && y && x.device === y.device) {
      // Force et sens réglés dans VPX : repris tels quels (la force, celle de l'axe X).
      const gain = Math.abs(x.scale);
      analog.nudge = { device: x.device, x: x.axis, y: y.axis, ...(gain !== 1 && gain > 0 && { gain }), ...(x.scale < 0 && { invertX: true }), ...(y.scale < 0 && { invertY: true }) };
    }
  }
  return analog;
}

// ---------------------------------------------------------------------------
// Ce que VPX fera de l'axe : la jauge de l'étape

/** Position du lanceur telle que VPX la calcule (SensorMapping::UpdateValue) : 0 au repos, 1 tiré à fond. */
export function plungerPosition(raw: number, sensor: Pick<PlungerSensor, 'deadZone' | 'reversed'>): number {
  const dz = sensor.deadZone;
  let value = raw;
  if (dz > 0) {
    if (Math.abs(value) <= dz) value = 0;
    else value = value < 0 ? (value + dz) / (1 - dz) : (value - dz) / (1 - dz);
  }
  return Math.max(-1, Math.min(1, value)) * (sensor.reversed ? -1 : 1);
}

/**
 * Tir : le lanceur relâché après avoir été tiré. Comme VPX (PlungerSensor::GetHitVelocity), la
 * force vient du point le plus reculé atteint dans les 100 dernières millisecondes, une fois le
 * lanceur revenu près du repos.
 */
export interface ShotWatch {
  /** Positions récentes : [instant en ms, position]. */
  recent: [number, number][];
  /** Dernier tir : force de 0 à 1 (le recul au moment du lâcher), et son instant. */
  last?: { strength: number; at: number };
}

export function watchShot(watch: ShotWatch, position: number, now: number): ShotWatch {
  // La lecture précédente compte toujours : un processus occupé peut espacer deux lectures de
  // plus de 100 ms, et un lâcher tient tout entier entre deux lectures.
  const previous = watch.recent.at(-1);
  const recent = [...watch.recent.filter(([at]) => now - at <= 100), [now, position] as [number, number]];
  if (previous && !recent.includes(previous)) recent.unshift(previous);
  const apex = Math.max(...recent.map(([, p]) => p));
  if (apex >= 0.2 && position <= 0.05) return { recent: [], last: { strength: Math.min(1, apex), at: now } };
  return { recent, last: watch.last };
}

// ---------------------------------------------------------------------------
// Détection : quel axe bouge quand on tire le lanceur

export interface AxisReading {
  device: string;
  /** Nom donné par SDL (« mjrnet Pinscape Controller »). */
  name: string;
  /** Valeur de chaque axe, de -1 à 1 (l'axe SDL divisé par 32768, comme VPX). */
  values: number[];
}

interface AxisTrack {
  device: string;
  name: string;
  axis: number;
  axes: number;
  /** Valeur à la première lecture : le repos. */
  rest: number;
  low: number;
  high: number;
  current: number;
  /** Écart des premières lectures autour du repos : le bruit du capteur. */
  noise: number;
  samples: number;
}

export interface PlungerDetection {
  tracks: AxisTrack[];
}

/** Excursion à partir de laquelle un axe passe pour le lanceur (un tremblement de la caisse reste bien en dessous). */
const PULL_MIN = 0.4;
/** Revenu à moins de cet écart du repos : le lanceur a été lâché. */
const RELEASED = 0.15;
/** Lectures qui servent à mesurer le bruit au repos. */
const NOISE_SAMPLES = 20;
/**
 * Premières lectures d'un axe, qui ne comptent pas : un joystick qui vient d'être ouvert
 * répond 0 tant que son premier rapport n'est pas arrivé, puis saute à sa vraie valeur.
 */
const WARMUP_SAMPLES = 3;

export function startDetection(): PlungerDetection {
  return { tracks: [] };
}

/** Ajoute une lecture de tous les axes de tous les joysticks. */
export function feedDetection(detection: PlungerDetection, readings: AxisReading[]): PlungerDetection {
  const known = new Map(detection.tracks.map((tr) => [`${tr.device}#${tr.axis}`, tr]));
  const tracks: AxisTrack[] = [];
  for (const r of readings) {
    r.values.forEach((value, axis) => {
      const before = known.get(`${r.device}#${axis}`);
      if (!before) {
        tracks.push({ device: r.device, name: r.name, axis, axes: r.values.length, rest: value, low: value, high: value, current: value, noise: 0, samples: 1 });
        return;
      }
      const samples = before.samples + 1;
      if (samples <= WARMUP_SAMPLES) {
        tracks.push({ ...before, name: r.name, axes: r.values.length, rest: value, low: value, high: value, current: value, samples });
        return;
      }
      // Bruit : seulement au repos, avant que l'axe ait vraiment bougé (sinon la traction compterait).
      const still = before.high - before.low < 0.1 && Math.abs(value - before.rest) < 0.1;
      const noise = samples <= NOISE_SAMPLES && still ? Math.max(before.noise, Math.abs(value - before.rest)) : before.noise;
      tracks.push({ ...before, name: r.name, axes: r.values.length, low: Math.min(before.low, value), high: Math.max(before.high, value), current: value, noise, samples });
    });
  }
  return { tracks };
}

export interface DetectedAxis {
  device: string;
  name: string;
  axis: number;
  /** Nombre d'axes du joystick (6 pour un Pinscape en « X/Y/Z + RX/RY/RZ »). */
  axes: number;
  /** Tirer fait baisser la valeur : l'axe est à inverser. */
  reversed: boolean;
  rest: number;
  /** Plus grand recul vu, de 0 à 1. */
  pull: number;
  noise: number;
  /** Revenu au repos après avoir été tiré. */
  released: boolean;
}

/**
 * L'axe qui a le plus bougé, s'il a assez bougé pour être le lanceur. Un axe revenu au repos
 * passe devant un axe resté loin du sien : le lanceur, lui, revient toujours quand on le
 * lâche, alors qu'un axe qui a sauté une fois pour toutes (gâchette d'une manette) ne revient pas.
 */
export function detectedAxis(detection: PlungerDetection): DetectedAxis | undefined {
  let best: { track: AxisTrack; pull: number; reversed: boolean; released: boolean } | undefined;
  for (const track of detection.tracks) {
    const up = track.high - track.rest;
    const down = track.rest - track.low;
    const pull = Math.max(up, down);
    const released = Math.abs(track.current - track.rest) <= RELEASED;
    if (pull < PULL_MIN) continue;
    if (!best || (released && !best.released) || (released === best.released && pull > best.pull)) best = { track, pull, reversed: down > up, released };
  }
  if (!best) return undefined;
  const { track, pull, reversed } = best;
  return {
    device: track.device,
    name: track.name,
    axis: track.axis,
    axes: track.axes,
    reversed,
    rest: track.rest,
    pull: Math.min(1, pull),
    noise: track.noise,
    released: best.released,
  };
}

/** Axe qui bouge le plus en ce moment (même sans être le lanceur) : la jauge pendant la détection. */
export function liveAxis(detection: PlungerDetection): { device: string; name: string; axis: number; offset: number } | undefined {
  let best: AxisTrack | undefined;
  for (const track of detection.tracks) if (!best || Math.abs(track.current - track.rest) > Math.abs(best.current - best.rest)) best = track;
  return best && { device: best.device, name: best.name, axis: best.axis, offset: best.current - best.rest };
}

/**
 * Lanceur proposé après détection : son axe et son sens ; une zone morte juste au-dessus du
 * bruit mesuré au repos (VPX tient le lanceur pour immobile sous 0,01) ; sur un Pinscape à six
 * axes dont le lanceur est sur Z, la vitesse mesurée par la carte (RZ) ; l'accéléromètre du
 * même Pinscape (X et Y) pour les tremblements.
 */
export function proposedAnalog(axis: DetectedAxis): CabinetAnalog {
  const deadZone = axis.noise > 0.01 ? Math.min(0.1, Math.ceil((axis.noise + 0.01) * 100) / 100) : 0;
  const pinscape = isPinscape(axis.name) && axis.axes >= 6 && axis.axis === PINSCAPE_AXES.plunger;
  const plunger: PlungerSensor = { device: axis.device, name: axis.name, axis: axis.axis, reversed: axis.reversed, deadZone, ...(pinscape && { speedAxis: PINSCAPE_AXES.plungerSpeed }) };
  const nudge: NudgeSensor | undefined =
    isPinscape(axis.name) && axis.axis !== PINSCAPE_AXES.nudgeX && axis.axis !== PINSCAPE_AXES.nudgeY
      ? { device: axis.device, name: axis.name, x: PINSCAPE_AXES.nudgeX, y: PINSCAPE_AXES.nudgeY, gain: NUDGE_GAIN.pinscape }
      : undefined;
  return { plunger, ...(nudge && { nudge }) };
}

/**
 * Repos de l'axe loin de 0 : VPX n'a pas de décalage, le lanceur lui paraîtrait tiré en
 * permanence. Le repos se règle sur la carte (calibration du Pinscape). Undefined : repos correct.
 */
export function restProblem(rest: number): string | undefined {
  if (Math.abs(rest) <= 0.1) return undefined;
  return t('Au repos, l’axe vaut {value} % au lieu de 0 : VPX croira le lanceur tiré. Calibrez le lanceur sur la carte (bouton de calibration du Pinscape, ou son outil de configuration).', { value: Math.round(rest * 100) });
}

// ---------------------------------------------------------------------------
// Récapitulatif

/** Lignes du récapitulatif et du résultat de l'étape « Lanceur ». */
export function analogLines(analog: CabinetAnalog): string[] {
  const lines: string[] = [];
  const p = analog.plunger;
  if (p) {
    lines.push(
      t('Lanceur : axe {axis} de {device}, sens {direction}, zone morte {dz} %', {
        axis: axisLabel(p.axis),
        device: p.name || p.device,
        direction: p.reversed ? t('inversé') : t('normal'),
        dz: Math.round(p.deadZone * 100),
      }),
    );
    lines.push(p.speedAxis === undefined ? t('Vitesse du lanceur : calculée par VPX') : t('Vitesse du lanceur : mesurée par la carte (axe {axis})', { axis: axisLabel(p.speedAxis) }));
  } else lines.push(t('Pas de lanceur analogique : le bouton Lanceur seul'));
  const n = analog.nudge;
  lines.push(
    n
      ? t('Accéléromètre : axes {x} et {y} de {device}, force des secousses {gain}', { x: axisLabel(n.x), y: axisLabel(n.y), device: n.name || n.device, gain: gainLabel(n.gain ?? NUDGE_GAIN.default) })
      : t('Pas d’accéléromètre : tremblements aux boutons'),
  );
  return lines;
}
