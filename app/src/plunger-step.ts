// Étape « Lanceur » de l'assistant : le plunger à capteur de la borne (potentiomètre ou
// capteur lu par un Pinscape sur KL25Z, ou tout contrôleur en mode joystick) et l'accéléromètre.
//
// Deux temps, sur le même écran :
// - détection : « tirez le lanceur à fond, puis lâchez-le » ; l'axe qui a le plus bougé, de
//   tous les joysticks, devient le lanceur, avec son sens (detectedAxis, core). Une jauge
//   montre l'axe qui bouge en ce moment, pour voir que la borne répond ;
// - réglage : capteur (refaire la détection), sens, zone morte, vitesse mesurée par la carte,
//   accéléromètre ; la jauge montre la position telle que VPX la calculera, et chaque tir
//   (lanceur lâché) sa force. Aux boutons : précédent / suivant pour choisir, valider pour
//   changer (la zone morte se règle alors aux mêmes boutons, valider pour finir).
//
// Une borne déjà réglée (modèle enregistré, ou capteurs trouvés dans VPinballX.ini, réglés
// dans le menu de VPX) s'ouvre sur le réglage. Tout se fait aussi à la souris.

import {
  analogFromIni,
  axisLabel,
  detectedAxis,
  feedDetection,
  liveAxis,
  MAX_DEAD_ZONE,
  PINSCAPE_AXES,
  plungerPosition,
  proposedAnalog,
  restProblem,
  startDetection,
  t,
  watchShot,
  type AxisReading,
  type CabinetAnalog,
  type PlungerDetection,
  type ShotWatch,
} from '@cyberpinball/core';

/** Lignes du réglage, dans l'ordre de l'écran (certaines selon le joystick). */
export type PlungerRow = 'sensor' | 'direction' | 'deadZone' | 'speed' | 'nudge';
/** Actions sous les lignes. */
export type PlungerAction = 'save' | 'keep' | 'none';

export interface PlungerStep {
  mode: 'detect' | 'settings';
  /** Réglage proposé, enregistré par « Enregistrer » (ou « Continuer » dans l'assistant complet). */
  analog: CabinetAnalog;
  /** Réglage d'arrivée (modèle, ou VPinballX.ini) : « Garder le réglage actuel » y revient. */
  initial?: CabinetAnalog;
  /** D'où vient le réglage d'arrivée. */
  origin: 'saved' | 'vpx' | 'new';
  detection: PlungerDetection;
  /**
   * Choix aux boutons : une ligne ou une action, par son nom. Pas par sa place : la liste
   * s'allonge quand le joystick est lu (vitesse, accéléromètre).
   */
  selected: PlungerRow | PlungerAction;
  /** Zone morte en cours de réglage aux boutons. */
  editing: boolean;
  readings: AxisReading[];
  shot: ShotWatch;
  /** Plus grand recul vu depuis le dernier tir, pour la jauge. */
  peak: number;
  /** Repos de l'axe détecté, s'il vient d'une détection. */
  rest?: number;
  notice?: string;
}

/** Arrivée sur l'étape : le réglage enregistré, sinon celui de VPX, sinon la détection. */
export function startPlungerStep(saved: CabinetAnalog | undefined, ini: string): PlungerStep {
  const fromVpx = analogFromIni(ini);
  const initial = saved ?? (fromVpx.plunger || fromVpx.nudge ? fromVpx : undefined);
  const origin = saved ? 'saved' : initial ? 'vpx' : 'new';
  const step: PlungerStep = {
    mode: initial?.plunger ? 'settings' : 'detect',
    analog: structuredClone(initial ?? {}),
    origin,
    detection: startDetection(),
    selected: 'save',
    editing: false,
    readings: [],
    shot: { recent: [] },
    peak: 0,
  };
  if (initial) step.initial = structuredClone(initial);
  step.selected = step.mode === 'settings' ? 'save' : actions(step)[0]!;
  return step;
}

/** Nom d'un joystick pour l'écran : celui du réglage, sinon celui que SDL donne, sinon son identifiant. */
function deviceName(step: PlungerStep, device: string, name?: string): string {
  return name || step.readings.find((r) => r.device === device)?.name || device;
}

/** Joystick du lanceur tel qu'on le lit maintenant ; undefined s'il n'est pas branché. */
function plungerDevice(step: PlungerStep): AxisReading | undefined {
  const device = step.analog.plunger?.device;
  return step.readings.find((r) => r.device === device);
}

/** Lignes du réglage : la vitesse pour un joystick à six axes, l'accéléromètre s'il reste deux axes libres. */
export function rows(step: PlungerStep): PlungerRow[] {
  if (step.mode === 'detect' || !step.analog.plunger) return [];
  const p = step.analog.plunger;
  const axes = plungerDevice(step)?.values.length ?? 0;
  const list: PlungerRow[] = ['sensor', 'direction', 'deadZone'];
  if (p.speedAxis !== undefined || (axes > PINSCAPE_AXES.plungerSpeed && p.axis !== PINSCAPE_AXES.plungerSpeed)) list.push('speed');
  if (step.analog.nudge || (axes > PINSCAPE_AXES.nudgeY && p.axis > PINSCAPE_AXES.nudgeY)) list.push('nudge');
  return list;
}

export function actions(step: PlungerStep): PlungerAction[] {
  if (step.mode === 'settings') return ['save', 'none'];
  return step.initial ? ['keep', 'none'] : ['none'];
}

/** Ce qui se choisit aux boutons : les lignes, puis les actions. */
function choices(step: PlungerStep): (PlungerRow | PlungerAction)[] {
  return [...rows(step), ...actions(step)];
}

export type PlungerOutcome = 'stay' | 'save' | 'none' | 'unhandled';

export interface PlungerKeys {
  previous: boolean;
  next: boolean;
  confirm: boolean;
}

/** Une touche de l'interface pendant l'étape. */
export function plungerKey(step: PlungerStep, keys: PlungerKeys): PlungerOutcome {
  step.notice = undefined;
  if (step.editing) {
    const p = step.analog.plunger!;
    const percent = Math.round(p.deadZone * 100);
    if (keys.previous) p.deadZone = Math.max(0, percent - 1) / 100;
    else if (keys.next) p.deadZone = Math.min(MAX_DEAD_ZONE * 100, percent + 1) / 100;
    else if (keys.confirm) step.editing = false;
    else return 'unhandled';
    return 'stay';
  }
  const list = choices(step);
  const at = Math.max(0, list.indexOf(step.selected));
  if (keys.previous) step.selected = list[(at - 1 + list.length) % list.length]!;
  else if (keys.next) step.selected = list[(at + 1) % list.length]!;
  else if (keys.confirm) return choose(step, list[at]!);
  else return 'unhandled';
  return 'stay';
}

/** Clic sur une ligne (indice dans rows) ou une action. */
export function plungerClick(step: PlungerStep, what: { row: number } | { action: PlungerAction }): PlungerOutcome {
  step.notice = undefined;
  step.editing = false;
  const choice = 'row' in what ? rows(step)[what.row] : what.action;
  if (!choice) return 'stay';
  step.selected = choice;
  return choose(step, choice);
}

function choose(step: PlungerStep, choice: PlungerRow | PlungerAction): PlungerOutcome {
  const p = step.analog.plunger;
  switch (choice) {
    case 'save':
      return 'save';
    case 'none':
      return 'none';
    case 'keep':
      step.analog = structuredClone(step.initial ?? {});
      step.mode = step.analog.plunger ? 'settings' : 'detect';
      step.selected = step.mode === 'settings' ? 'save' : 'keep';
      return 'stay';
    case 'sensor':
      redetect(step);
      return 'stay';
    case 'direction':
      if (p) p.reversed = !p.reversed;
      return 'stay';
    case 'deadZone':
      step.editing = true;
      return 'stay';
    case 'speed':
      if (p) {
        if (p.speedAxis === undefined) p.speedAxis = PINSCAPE_AXES.plungerSpeed;
        else delete p.speedAxis;
      }
      return 'stay';
    case 'nudge':
      if (step.analog.nudge) delete step.analog.nudge;
      else if (p) step.analog.nudge = { device: p.device, ...(p.name && { name: p.name }), x: PINSCAPE_AXES.nudgeX, y: PINSCAPE_AXES.nudgeY };
      return 'stay';
  }
}

/** Nouvelle détection ; « Garder le réglage actuel » ramène celui d'arrivée. */
function redetect(step: PlungerStep): void {
  step.mode = 'detect';
  step.detection = startDetection();
  step.editing = false;
  step.selected = actions(step)[0]!;
  delete step.rest;
}

/**
 * Lecture des axes (une trentaine de fois par seconde). Vrai si l'écran change : jauge,
 * tir, fin de la détection.
 */
export function plungerTick(step: PlungerStep, readings: AxisReading[], now: number): boolean {
  const before = JSON.stringify(gauge(step));
  step.readings = readings;
  // Réglage repris de VPX : il n'a que l'identifiant du joystick ; son nom vient de SDL.
  for (const sensor of [step.analog.plunger, step.analog.nudge, step.initial?.plunger, step.initial?.nudge]) {
    if (sensor && !sensor.name) {
      const name = readings.find((r) => r.device === sensor.device)?.name;
      if (name) sensor.name = name;
    }
  }
  if (step.mode === 'detect') {
    step.detection = feedDetection(step.detection, readings);
    const axis = detectedAxis(step.detection);
    if (axis?.released) {
      // La détection décide du capteur et de son sens ; le reste vient de proposedAnalog.
      step.analog = proposedAnalog(axis);
      step.rest = axis.rest;
      step.mode = 'settings';
      step.shot = { recent: [] };
      step.peak = 0;
      step.selected = 'save';
      return true;
    }
  } else {
    const p = step.analog.plunger;
    const raw = p && plungerDevice(step)?.values[p.axis];
    if (p && raw !== undefined) {
      const position = plungerPosition(raw, p);
      const last = step.shot.last;
      step.shot = watchShot(step.shot, position, now);
      step.peak = step.shot.last !== last ? 0 : Math.max(step.peak, position);
    }
  }
  return JSON.stringify(gauge(step)) !== before;
}

export interface GaugeView {
  /** Position de -1/3 (poussé vers l'avant) à 1 (tiré à fond), 0 au repos. */
  position: number;
  /** Plus grand recul depuis le dernier tir. */
  peak: number;
  /** Force du dernier tir, en pourcentage. */
  shot?: number;
  /** Ce que la jauge montre : l'axe du lanceur, ou celui qui bouge pendant la détection. */
  label: string;
  /** Joystick du lanceur absent. */
  missing?: boolean;
}

const pct = (v: number) => Math.round(v * 100) / 100;

export function gauge(step: PlungerStep): GaugeView | undefined {
  if (step.mode === 'detect') {
    const live = liveAxis(step.detection);
    if (!live) return undefined;
    return { position: pct(Math.min(1, Math.abs(live.offset))), peak: 0, label: Math.abs(live.offset) >= 0.05 ? t('Axe {axis} de {device}', { axis: axisLabel(live.axis), device: live.name || live.device }) : '' };
  }
  const p = step.analog.plunger;
  if (!p) return undefined;
  const raw = plungerDevice(step)?.values[p.axis];
  const label = t('Axe {axis} de {device}', { axis: axisLabel(p.axis), device: deviceName(step, p.device, p.name) });
  if (raw === undefined) return { position: 0, peak: 0, label, missing: true };
  return { position: pct(Math.max(-1 / 3, plungerPosition(raw, p))), peak: pct(step.peak), ...(step.shot.last && { shot: Math.round(step.shot.last.strength * 100) }), label };
}

const ROW_LABELS: Record<PlungerRow, () => string> = {
  sensor: () => t('Capteur'),
  direction: () => t('Sens'),
  deadZone: () => t('Zone morte'),
  speed: () => t('Vitesse mesurée par la carte'),
  nudge: () => t('Accéléromètre (tremblements)'),
};

function rowValue(step: PlungerStep, row: PlungerRow): string {
  const p = step.analog.plunger!;
  switch (row) {
    case 'sensor':
      return t('Axe {axis} · {device}', { axis: axisLabel(p.axis), device: deviceName(step, p.device, p.name) });
    case 'direction':
      return p.reversed ? t('Inversé') : t('Normal');
    case 'deadZone':
      return step.editing ? `◀ ${Math.round(p.deadZone * 100)} % ▶` : `${Math.round(p.deadZone * 100)} %`;
    case 'speed':
      return p.speedAxis === undefined ? t('Non, calculée par VPX') : t('Oui, axe {axis}', { axis: axisLabel(p.speedAxis) });
    case 'nudge':
      return step.analog.nudge ? t('Oui, axes {x} et {y}', { x: axisLabel(step.analog.nudge.x), y: axisLabel(step.analog.nudge.y) }) : t('Non');
  }
}

/** Ligne qui explique la ligne choisie, sous la liste. */
function rowHelp(step: PlungerStep, choice: PlungerRow | PlungerAction | undefined): string {
  switch (choice) {
    case 'sensor':
      return t('Valider : refaire la détection (tirer et lâcher le lanceur).');
    case 'direction':
      return t('La jauge doit monter quand on tire le lanceur.');
    case 'deadZone':
      return step.editing ? t('Juste assez pour que la jauge reste à 0 quand le lanceur est au repos.') : t('Part de la course ignorée au repos, contre le bruit du capteur.');
    case 'speed':
      return t('Pinscape réglé en « X/Y/Z + RX/RY/RZ » : la carte mesure la vitesse du lanceur, plus juste que VPX.');
    case 'nudge':
      return t('L’accéléromètre de la carte fait trembler la table quand on bouscule la borne.');
    case 'none':
      return t('VPX ne lira aucun lanceur analogique : le bouton Lanceur seul.');
    default:
      return '';
  }
}

export interface PlungerViewKeys {
  previous: string;
  next: string;
  confirm: string;
  exit: string;
}

/** Ce que screen.js affiche : question, jauge, lignes et actions (cliquables), aide. */
export function plungerView(step: PlungerStep, saveLabel: string, keys: PlungerViewKeys) {
  const selected = choices(step).includes(step.selected) ? step.selected : undefined;
  const g = gauge(step);
  const actionLabels: Record<PlungerAction, string> = {
    save: saveLabel,
    keep: t('Garder le réglage actuel'),
    none: t('Pas de lanceur analogique'),
  };
  const common = {
    gauge: g ?? { position: 0, peak: 0, label: '' },
    buttons: rows(step).map((row) => ({ label: ROW_LABELS[row](), key: rowValue(step, row), state: 'done', selected: selected === row })),
    actions: actions(step).map((id) => ({ id, label: actionLabels[id], selected: selected === id })),
  };
  if (step.mode === 'detect') {
    const devices = step.readings.length;
    return {
      ...common,
      prompt: t('Tirez le lanceur à fond, puis lâchez-le'),
      measure: t('Lanceur'),
      name: devices ? t('Axes lus : {names}', { names: step.readings.map((r) => r.name || r.device).join(', ') }) : t('Aucun joystick à axes branché'),
      details: step.initial ? t('Réglage actuel : {what}', { what: initialLine(step) }) : t('Plunger à capteur (potentiomètre…) lu par un Pinscape ou un contrôleur en mode joystick.'),
      notice: step.notice ?? (devices ? undefined : t('Branchez le Pinscape, ou choisissez « Pas de lanceur analogique » si le lanceur est un simple bouton.')),
      step: t('L’axe qui bouge le plus devient le lanceur.'),
      hint: t('Flippers ({left} / {right}) : choisir · Start ({start}) : valider · Exit ({exit}) : quitter sans enregistrer ?', { left: keys.previous, right: keys.next, start: keys.confirm, exit: keys.exit }),
    };
  }
  const shot = g?.shot;
  return {
    ...common,
    prompt: t('Lanceur analogique'),
    measure: undefined,
    name: step.origin === 'vpx' && JSON.stringify(step.analog) === JSON.stringify(step.initial) ? t('Réglage trouvé dans VPX') : t('Essayez le lanceur : la jauge suit ce que VPX lira'),
    details: rowHelp(step, selected),
    notice: step.notice ?? (g?.missing ? t('Joystick du lanceur introuvable : est-il branché ?') : step.rest !== undefined ? restProblem(step.rest) : undefined),
    step: shot === undefined ? t('Tirez et lâchez le lanceur pour l’essayer') : t('Dernier tir : force {n} %', { n: shot }),
    hint: step.editing
      ? t('Flippers ({left} / {right}) : moins / plus · Start ({start}) : terminer', { left: keys.previous, right: keys.next, start: keys.confirm })
      : t('Flippers ({left} / {right}) : choisir · Start ({start}) : changer ou valider · Clic sur une ligne : la changer', { left: keys.previous, right: keys.next, start: keys.confirm }),
  };
}

function initialLine(step: PlungerStep): string {
  const p = step.initial?.plunger;
  if (!p) return t('pas de lanceur analogique');
  return t('axe {axis} de {device}', { axis: axisLabel(p.axis), device: deviceName(step, p.device, p.name) });
}
