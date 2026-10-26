// Étape « Tilt » de l'assistant : ce qui fait tilter la borne (tilt.ts, core).
//
// - balancier de la borne : le bouton « Balancier de tilt » relevé à l'étape « Boutons » (une
//   entrée du Pinscape en bouton de joystick, ou la touche T d'un encodeur) ; le balancier
//   simulé de VPX est alors éteint, sinon un même coup compterait deux fois ;
// - balancier simulé par VPX : il suit les secousses de l'accéléromètre (étape « Lanceur ») et
//   les boutons de tremblement ; l'angle du contact se règle aux flippers ;
// - pas de tilt (aucun balancier relevé).
//
// Essai sur le même écran : le balancier simulé vu de dessus, calculé comme VPX le calculera
// d'après les axes de l'accéléromètre lus par la bibliothèque SDL de VPX, avec chaque contact
// avec l'anneau (un tilt) ; le balancier de la borne s'allume à chaque contact réel. Tout se
// fait aussi à la souris.

import {
  axisLabel,
  clampThreshold,
  formatNumber,
  hasBob,
  keyLabel,
  plumbOptionsFromIni,
  plumbView,
  proposedTilt,
  setPlumbThreshold,
  startPlumb,
  stepPlumb,
  t,
  THRESHOLD_STEP,
  thresholdLabel,
  tiltFromIni,
  tiltModeLabel,
  tiltModes,
  type AxisReading,
  type CabinetAnalog,
  type CabinetButtons,
  type CabinetTilt,
  type PlumbSimulation,
  type TiltMode,
} from '@cyberpinball/core';

/** Lignes du réglage. */
export type TiltRow = 'mode' | 'threshold';
export type TiltAction = 'save';

/** Durée pendant laquelle un contact (simulé ou réel) reste allumé à l'écran. */
const FLASH_MS = 800;

export interface TiltStep {
  /** Réglage proposé, enregistré par « Enregistrer » (« Continuer » dans l'assistant complet). */
  tilt: CabinetTilt;
  modes: TiltMode[];
  /** Ce que VPX fait aujourd'hui, quand l'étape n'a jamais été faite. */
  vpx?: CabinetTilt;
  /** Balancier de la borne : sa touche ou son bouton de joystick. */
  bob?: string;
  /** Accéléromètre de l'étape « Lanceur ». */
  nudge?: CabinetAnalog['nudge'];
  selected: TiltRow | TiltAction;
  /** Angle en cours de réglage aux flippers. */
  editing: boolean;
  sim: PlumbSimulation;
  readings: AxisReading[];
  last?: number;
  /** Dernier contact simulé vu, pour l'allumer un moment. */
  tiltAt?: number;
  seenTilts: number;
  /** Contacts du balancier de la borne pendant l'essai, et le dernier. */
  bobContacts: number;
  bobAt?: number;
}

/** Arrivée sur l'étape : le réglage enregistré, sinon celui proposé d'après VPX et les boutons relevés. */
export function startTiltStep(saved: CabinetTilt | undefined, ini: string, buttons: CabinetButtons | undefined, analog: CabinetAnalog | undefined): TiltStep {
  const modes = tiltModes(buttons);
  const tilt = structuredClone(saved ?? proposedTilt(ini, buttons));
  // Un mode qui n'est plus possible (balancier retiré à l'étape « Boutons », ou ajouté depuis « Pas de tilt »).
  if (!modes.includes(tilt.mode)) tilt.mode = tilt.mode === 'bob' ? 'simulated' : 'bob';
  tilt.threshold = clampThreshold(tilt.threshold);
  return {
    tilt,
    modes,
    ...(!saved && { vpx: tiltFromIni(ini, buttons) }),
    ...(hasBob(buttons) && { bob: buttons!.tilt }),
    ...(analog?.nudge && { nudge: analog.nudge }),
    selected: 'save',
    editing: false,
    sim: startPlumb(plumbOptionsFromIni(ini, tilt.threshold)),
    readings: [],
    seenTilts: 0,
    bobContacts: 0,
  };
}

export function rows(step: TiltStep): TiltRow[] {
  return step.tilt.mode === 'simulated' ? ['mode', 'threshold'] : ['mode'];
}

function choices(step: TiltStep): (TiltRow | TiltAction)[] {
  return [...rows(step), 'save'];
}

export type TiltOutcome = 'stay' | 'save' | 'unhandled';

export interface TiltKeys {
  previous: boolean;
  next: boolean;
  confirm: boolean;
}

/**
 * Une touche pendant l'étape. Le balancier de la borne compte d'abord (un contact), puis les
 * boutons de l'interface s'il en est un : `code` est la touche ou le bouton de joystick reçu.
 */
export function tiltKey(step: TiltStep, keys: TiltKeys, code: string, now: number): TiltOutcome {
  const bob = step.bob !== undefined && code === step.bob;
  if (bob) {
    step.bobContacts++;
    step.bobAt = now;
  }
  if (step.editing) {
    const steps = Math.round(step.tilt.threshold / THRESHOLD_STEP);
    if (keys.previous) setThreshold(step, (steps - 1) * THRESHOLD_STEP);
    else if (keys.next) setThreshold(step, (steps + 1) * THRESHOLD_STEP);
    else if (keys.confirm) step.editing = false;
    else return bob ? 'stay' : 'unhandled';
    return 'stay';
  }
  const list = choices(step);
  const at = Math.max(0, list.indexOf(step.selected));
  if (keys.previous) step.selected = list[(at - 1 + list.length) % list.length]!;
  else if (keys.next) step.selected = list[(at + 1) % list.length]!;
  else if (keys.confirm) return choose(step, list[at]!);
  else return bob ? 'stay' : 'unhandled';
  return 'stay';
}

/** Clic sur une ligne (indice dans rows) ou une action. */
export function tiltClick(step: TiltStep, what: { row: number } | { action: TiltAction }): TiltOutcome {
  step.editing = false;
  const choice = 'row' in what ? rows(step)[what.row] : what.action;
  if (!choice) return 'stay';
  step.selected = choice;
  return choose(step, choice);
}

function choose(step: TiltStep, choice: TiltRow | TiltAction): TiltOutcome {
  switch (choice) {
    case 'save':
      return 'save';
    case 'mode': {
      const i = step.modes.indexOf(step.tilt.mode);
      step.tilt.mode = step.modes[(i + 1) % step.modes.length]!;
      return 'stay';
    }
    case 'threshold':
      step.editing = true;
      return 'stay';
  }
}

function setThreshold(step: TiltStep, value: number): void {
  step.tilt.threshold = clampThreshold(value);
  setPlumbThreshold(step.sim, step.tilt.threshold);
}

/** Accéléromètre tel qu'on le lit maintenant ; undefined s'il n'est pas réglé ou pas branché. */
function nudgeAxes(step: TiltStep): { x: number; y: number } | undefined {
  const n = step.nudge;
  const values = n && step.readings.find((r) => r.device === n.device)?.values;
  const x = values?.[n!.x];
  const y = values?.[n!.y];
  return x === undefined || y === undefined ? undefined : { x, y };
}

/** Lecture des axes : la simulation avance du temps écoulé. Vrai si l'écran change. */
export function tiltTick(step: TiltStep, readings: AxisReading[], now: number): boolean {
  const before = JSON.stringify(plumb(step, now));
  step.readings = readings;
  // Accéléromètre repris de VPX : il n'a que l'identifiant du joystick ; son nom vient de SDL.
  const sensor = step.nudge;
  if (sensor && !sensor.name) {
    const name = readings.find((r) => r.device === sensor.device)?.name;
    if (name) sensor.name = name;
  }
  stepPlumb(step.sim, nudgeAxes(step), step.last === undefined ? 0 : now - step.last);
  step.last = now;
  if (step.sim.tilts !== step.seenTilts) {
    step.seenTilts = step.sim.tilts;
    step.tiltAt = now;
  }
  return JSON.stringify(plumb(step, now)) !== before;
}

/** Ce que dessine screen.js : l'anneau du contact et le balancier vu de dessus. */
export interface PlumbDrawing {
  /** Balancier simulé (point mobile) ; sinon le balancier de la borne, qui ne s'allume qu'au contact. */
  simulated: boolean;
  x: number;
  y: number;
  /** Contact en ce moment, ou il y a moins de FLASH_MS. */
  contact: boolean;
  /** Texte au centre de l'anneau quand il n'y a pas de point à montrer. */
  label: string;
  /** Accéléromètre absent : l'anneau est éteint. */
  missing?: boolean;
}

function plumb(step: TiltStep, now: number): PlumbDrawing {
  const recent = (at: number | undefined) => at !== undefined && now - at < FLASH_MS;
  if (step.tilt.mode === 'simulated') {
    const v = plumbView(step.sim);
    const r = (n: number) => Math.round(n * 100) / 100;
    return { simulated: true, x: r(v.x), y: r(v.y), contact: v.tilted || recent(step.tiltAt), label: '', ...(!nudgeAxes(step) && { missing: true }) };
  }
  if (step.tilt.mode === 'bob') return { simulated: false, x: 0, y: 0, contact: recent(step.bobAt), label: keyLabel(step.bob) };
  return { simulated: false, x: 0, y: 0, contact: false, label: t('Pas de tilt'), missing: true };
}

const ROW_LABELS: Record<TiltRow, () => string> = {
  mode: () => 'Tilt',
  threshold: () => t('Contact du balancier simulé'),
};

function rowValue(step: TiltStep, row: TiltRow): string {
  switch (row) {
    case 'mode':
      return step.tilt.mode === 'bob' ? t('{mode} · {key}', { mode: tiltModeLabel('bob'), key: keyLabel(step.bob) }) : tiltModeLabel(step.tilt.mode);
    case 'threshold': {
      const angle = thresholdLabel(step.tilt.threshold);
      return step.editing ? `◀ ${angle} ▶` : angle;
    }
  }
}

function rowHelp(step: TiltStep, choice: TiltRow | TiltAction | undefined): string {
  switch (choice) {
    case 'mode':
      if (step.tilt.mode === 'bob') return t('Le balancier de la borne fait tilter ; celui que VPX simule est éteint, sinon un même coup compterait deux fois.');
      if (step.tilt.mode === 'simulated') return step.bob ? t('VPX simule un balancier d’après les secousses ; le balancier de la borne compte aussi : un même coup peut compter deux fois.') : t('VPX simule un balancier d’après les secousses de l’accéléromètre et les boutons de tremblement.');
      return t('Ni balancier ni balancier simulé : la borne ne tilte pas (la touche T reste celle du tilt).');
    case 'threshold':
      return step.editing
        ? t('Plus petit : tilt plus facile. VPX va de {min} à {max}, {def} par défaut.', { min: thresholdLabel(0.15), max: thresholdLabel(4), def: thresholdLabel(1) })
        : t('Angle auquel le balancier simulé touche son anneau : plus petit, tilt plus facile.');
    default:
      return '';
  }
}

/** Ce que VPX fait aujourd'hui, pour l'écran. */
function vpxLine(tilt: CabinetTilt): string {
  return tilt.mode === 'simulated' ? t('{mode}, contact à {angle}', { mode: tiltModeLabel('simulated'), angle: thresholdLabel(tilt.threshold) }) : t('balancier simulé éteint');
}

export interface TiltViewKeys {
  previous: string;
  next: string;
  confirm: string;
}

/** Ce que screen.js affiche : question, balancier, lignes et actions (cliquables), aide. */
export function tiltView(step: TiltStep, saveLabel: string, keys: TiltViewKeys, now = Date.now()) {
  const selected = choices(step).includes(step.selected) ? step.selected : undefined;
  const drawing = plumb(step, now);
  const simulated = step.tilt.mode === 'simulated';
  const v = plumbView(step.sim);
  const n = step.nudge;
  const accelerometer = n ? t('Accéléromètre : axes {x} et {y} de {device}', { x: axisLabel(n.x), y: axisLabel(n.y), device: n.name || n.device }) : undefined;
  let line: string;
  if (simulated) {
    line = v.tilts
      ? t('Contacts avec l’anneau : {n} · depuis le dernier, {pct} % du contact, secousse de {g} g', { n: v.tilts, pct: Math.round(v.peak * 100), g: formatNumber(v.accel, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
      : t('Secouez la borne : {pct} % du contact au plus, secousse de {g} g', { pct: Math.round(v.peak * 100), g: formatNumber(v.accel, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  } else if (step.tilt.mode === 'bob') {
    line = step.bobContacts ? t('Contacts du balancier : {n}', { n: step.bobContacts }) : t('Faites toucher l’anneau au balancier pour l’essayer');
  } else line = t('La borne ne tiltera pas.');
  return {
    prompt: 'Tilt',
    measure: undefined,
    name: step.vpx ? t('Réglage actuel de VPX : {what}', { what: vpxLine(step.vpx) }) : t('Essayez : le balancier suit ce que VPX calculera'),
    details: rowHelp(step, selected),
    notice: simulated && !step.nudge ? t('Pas d’accéléromètre réglé (étape « Lanceur ») : seuls les boutons de tremblement feront bouger le balancier simulé, et cet essai ne le montre pas.') : simulated && drawing.missing ? t('Accéléromètre introuvable : est-il branché ?') : undefined,
    plumb: { ...drawing, caption: simulated ? (accelerometer ?? '') : '' },
    step: line,
    buttons: rows(step).map((row) => ({ label: ROW_LABELS[row](), key: rowValue(step, row), state: 'done', selected: selected === row })),
    actions: [{ id: 'save', label: saveLabel, selected: selected === 'save' }],
    hint: step.editing
      ? t('Flippers ({left} / {right}) : moins / plus · Start ({start}) : terminer', { left: keys.previous, right: keys.next, start: keys.confirm })
      : t('Flippers ({left} / {right}) : choisir · Start ({start}) : changer ou valider · Clic sur une ligne : la changer', { left: keys.previous, right: keys.next, start: keys.confirm }),
  };
}
