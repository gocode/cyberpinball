// Étape « Essai et noms des boutons » de l'assistant (étape seule, jamais dans l'assistant complet).
//
// 1. Essai : chaque bouton que la carte expose (tous les boutons des joysticks branchés, plus les
//    touches du clavier d'un encodeur dès qu'on les appuie ou qu'un rôle les tient) est une case ;
//    elle s'allume quand on appuie, compte les appuis et dit « jamais appuyé » tant que rien n'est
//    venu : un bouton muet est un fil, un contact ou une entrée de la carte à vérifier.
// 2. Noms : « Nommer un bouton » attend l'appui sur le bouton à nommer, puis propose un nom prêt
//    (« Flipper gauche »…) ou un repère et une place (« Bouton rouge devant »). Le nom suit le bouton
//    partout où l'interface le cite (button-names.ts, keyLabel).
//
// Tout se fait aux boutons de la borne (flippers : choisir, Start : valider) ou à la souris. Ce module
// ne connaît ni la fenêtre ni le disque : wizard.ts le branche, button-test.test.ts l'essaie.

import {
  BUTTONS,
  NAVIGATION,
  composedButtonName,
  defaultKeyLabel,
  hatButton,
  joystickButton,
  joystickCode,
  markerChoices,
  positionChoices,
  readyNames,
  t,
  withButtonName,
  MAX_BUTTON_NAME,
  type ButtonNames,
  type CabinetButtons,
  type NavigationButtons,
} from '@cyberpinball/core';
import type { JoystickDevice } from '@cyberpinball/win-displays';

/** Sans appui, l'attente du bouton à nommer s'arrête d'elle-même. */
export const LISTEN_MS = 15_000;
/** Lignes du choix du nom montrées à la fois (la liste des noms prêts en a une quinzaine). */
export const CHOICE_ROWS = 7;

export type TestAction = 'name' | 'save' | 'cancel';

/** Écran d'attente : « Appuie sur le bouton à nommer ». */
type Mode = 'test' | 'listen' | 'choose';

/** Niveau du choix du nom : le départ, les noms prêts, ou le repère puis la place. */
type Stage = 'root' | 'ready' | 'marker' | 'position' | 'text';

/** Touches de la saisie libre : lettres, accents du français, chiffres, tiret et apostrophe. */
const TYPED_KEYS = [..."abcdefghijklmnopqrstuvwxyzéèêàçù0123456789-'"]; // i18n-ignore : touches du clavier, pas du texte

interface Option {
  label: string;
  /** Nom à donner (noms prêts, place choisie), ou l'action de la ligne. */
  pick?: string;
  go?: Stage | 'clear' | 'back' | 'cancel';
  /** Ligne « Revenir » : celle que prend Exit. */
  isBack?: boolean;
  /** Saisie libre : le caractère de la touche, ou l'action de la touche (valider, effacer, majuscule). */
  char?: string;
  type?: 'done' | 'delete' | 'shift';
}

export interface Pin {
  code: string;
  /** Joystick de la carte (nom SDL), ou « Clavier ». */
  group: string;
  /** Nom sans celui du joueur : « Bouton 7 », « Maj gauche ». */
  short: string;
}

export interface ButtonTestStep {
  /** Noms en cours d'édition, enregistrés à « Enregistrer ». */
  names: ButtonNames;
  pins: Pin[];
  /** Rôles que tient chaque bouton (réglés aux étapes des boutons) : « Jeu : Flipper gauche ». */
  roles: Map<string, string[]>;
  down: Set<string>;
  counts: Map<string, number>;
  last?: string;
  mode: Mode;
  selected: TestAction;
  listenUntil: number;
  /** Bouton en train d'être nommé. */
  target?: string;
  stage: Stage;
  /** Repère choisi, en attendant la place. */
  marker?: string;
  option: number;
  /** Saisie libre : le nom en cours d'écriture, et la prochaine lettre en majuscule. */
  text: string;
  shift: boolean;
  /** Nom donné au dernier choix, rappelé sous la liste. */
  done?: string;
}

/** Cases d'un joystick : ses boutons, puis les quatre directions de chaque croix (VPX les lit comme des boutons). */
export function joystickPins(device: JoystickDevice): Pin[] {
  const group = device.name || t('Joystick');
  const pins: Pin[] = [];
  for (let n = 0; n < device.buttons; n++) pins.push({ code: joystickCode(device.id, n), group, short: defaultKeyLabel(joystickCode(device.id, n)) });
  for (let h = 0; h < device.hats; h++) {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      const code = joystickCode(device.id, hatButton(h, direction));
      pins.push({ code, group, short: defaultKeyLabel(code) });
    }
  }
  return pins;
}

/** Rôles tenus par chaque bouton : « Jeu : Flipper gauche », « Interface : Précédent ». */
export function rolesOf(buttons: CabinetButtons | undefined, navigation: NavigationButtons | undefined): Map<string, string[]> {
  const roles = new Map<string, string[]>();
  const add = (code: string | undefined, text: string) => {
    if (code) roles.set(code, [...(roles.get(code) ?? []), text]);
  };
  for (const b of BUTTONS) add(buttons?.[b.id], t('Jeu : {role}', { role: b.label }));
  for (const n of NAVIGATION) add(navigation?.[n.id], t('Interface : {role}', { role: n.label }));
  return roles;
}

export function startButtonTest(names: ButtonNames | undefined, devices: readonly JoystickDevice[], buttons: CabinetButtons | undefined, navigation: NavigationButtons | undefined): ButtonTestStep {
  const step: ButtonTestStep = {
    names: { ...names },
    pins: devices.flatMap(joystickPins),
    roles: rolesOf(buttons, navigation),
    down: new Set(),
    counts: new Map(),
    mode: 'test',
    selected: 'name',
    listenUntil: 0,
    stage: 'root',
    option: 0,
    text: '',
    shift: false,
  };
  // Boutons d'un encodeur en mode clavier, et ceux déjà nommés : une case chacun, même muets.
  for (const code of [...step.roles.keys(), ...Object.keys(step.names)]) addPin(step, code);
  return step;
}

function addPin(step: ButtonTestStep, code: string): void {
  if (step.pins.some((p) => p.code === code)) return;
  const joy = joystickButton(code);
  step.pins.push({ code, group: joy ? t('Joystick') : t('Clavier'), short: defaultKeyLabel(code) });
}

/** Nombre de boutons qui ont répondu au moins une fois, et nombre de cases. */
export function testedCount(step: ButtonTestStep): { tested: number; total: number } {
  return { tested: step.pins.filter((p) => step.counts.has(p.code)).length, total: step.pins.length };
}

function actions(step: ButtonTestStep): TestAction[] {
  return step.mode === 'listen' ? ['cancel'] : step.mode === 'test' ? ['name', 'save'] : [];
}

function options(step: ButtonTestStep): Option[] {
  const back: Option = { label: t('← Revenir'), go: step.stage === 'position' ? 'marker' : 'root', isBack: true };
  switch (step.stage) {
    case 'root':
      return [
        { label: t('Un nom prêt : « Flipper gauche »…'), go: 'ready' },
        { label: t('Un repère et une place : « Bouton rouge devant »…'), go: 'marker' },
        { label: t('Écrire un nom à toi…'), go: 'text' },
        ...(step.target && step.names[step.target] ? [{ label: t('Retirer son nom'), go: 'clear' as const }] : []),
        { label: t('Annuler'), go: 'cancel' },
      ];
    case 'ready':
      return [...readyNames().map((label) => ({ label, pick: label })), back];
    case 'marker':
      return [...markerChoices().map((label) => ({ label, pick: label })), back];
    case 'position':
      return [...positionChoices().map((label) => ({ label, pick: label })), back];
    case 'text':
      return typingOptions(step);
  }
}

/**
 * Le clavier de la saisie libre. Les touches d'écriture d'abord, puis espace, majuscule, effacer, annuler et valider :
 * depuis la première touche, le flipper gauche arrive tout de suite sur « Valider ».
 */
function typingOptions(step: ButtonTestStep): Option[] {
  const letters = TYPED_KEYS.map((key) => {
    const char = step.shift ? key.toUpperCase() : key;
    return { label: char, char };
  });
  return [
    ...letters,
    { label: t('espace'), char: ' ' },
    { label: step.shift ? 'abc' : 'ABC', type: 'shift' as const },
    { label: '⌫', type: 'delete' as const },
    { label: t('Annuler'), go: 'cancel' as const },
    { label: t('✔ Valider'), type: 'done' as const },
  ];
}

/** Ajoute un caractère au nom en cours (jamais au-delà de la longueur permise). */
function typeChar(step: ButtonTestStep, char: string): void {
  if ([...step.text].length < MAX_BUTTON_NAME) step.text += char;
  step.shift = false;
}

function deleteChar(step: ButtonTestStep): void {
  step.text = [...step.text].slice(0, -1).join('');
}

/** « Valider » : un nom vide ne change rien et revient au départ. */
function finishText(step: ButtonTestStep): void {
  const value = step.text.replace(/\s+/g, ' ').trim();
  if (value) return name(step, value);
  step.stage = 'root';
  step.option = 0;
}

/** Un appui (ou sa répétition) : la case s'allume, puis l'étape en fait ce qu'elle doit. */
export interface TestKeys {
  previous: boolean;
  next: boolean;
  confirm: boolean;
  /** Exit ou Retour : remonte d'un niveau dans le choix du nom. */
  back: boolean;
}

export type TestOutcome = 'stay' | 'save';

/**
 * Une touche pendant l'étape. Chaque appui allume sa case ; ensuite, selon l'écran : l'attente du bouton
 * à nommer le prend, le choix du nom le déplace, l'essai déplace son choix d'action. `repeat` : touche tenue.
 */
export function buttonTestKey(step: ButtonTestStep, keys: TestKeys, code: string, repeat: boolean, now: number, typed?: string): TestOutcome {
  // Saisie libre au clavier : la lettre tapée s'écrit, Retour arrière efface, Entrée valide. Ce ne sont pas des appuis d'essai.
  if (step.mode === 'choose' && step.stage === 'text') {
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!repeat) finishText(step);
      return 'stay';
    }
    if (code === 'Backspace') {
      deleteChar(step);
      return 'stay';
    }
    if (typed && [...typed].length === 1 && typed >= ' ' && !keys.previous && !keys.next && !keys.confirm && !keys.back) {
      typeChar(step, typed);
      return 'stay';
    }
  }
  if (!repeat) {
    step.down.add(code);
    step.counts.set(code, (step.counts.get(code) ?? 0) + 1);
    step.last = code;
    addPin(step, code);
  }
  if (step.mode === 'listen') {
    if (repeat) return 'stay';
    step.target = code;
    step.mode = 'choose';
    step.stage = 'root';
    step.option = 0;
    return 'stay';
  }
  if (step.mode === 'choose') {
    const list = options(step);
    if (keys.previous) step.option = (step.option - 1 + list.length) % list.length;
    else if (keys.next) step.option = (step.option + 1) % list.length;
    else if (keys.confirm && !repeat) chooseOption(step, list[step.option]!);
    // Exit : remonte d'un niveau ; dans la saisie libre, laisse le nom en cours et revient au départ.
    else if (keys.back && !repeat) chooseOption(step, step.stage === 'text' ? { label: '', go: 'root' } : (list.find((o) => o.isBack || o.go === 'cancel') ?? list[0]!));
    return 'stay';
  }
  if (repeat) return 'stay';
  // Exit se teste comme les autres : on sort par Exit maintenu 2 s ou Ctrl+Q (wizard.ts, watchHold).
  const list = actions(step);
  const at = Math.max(0, list.indexOf(step.selected));
  if (keys.previous) step.selected = list[(at - 1 + list.length) % list.length]!;
  else if (keys.next) step.selected = list[(at + 1) % list.length]!;
  else if (keys.confirm) return chooseAction(step, list[at]!, now);
  return 'stay';
}

/** Un bouton relâché : sa case s'éteint (le compte reste). */
export function buttonTestUp(step: ButtonTestStep, code: string): void {
  step.down.delete(code);
}

/** Clic sur une ligne du choix du nom (indice) ou sur une action. */
export function buttonTestClick(step: ButtonTestStep, what: { row: number } | { action: TestAction }, now: number): TestOutcome {
  if ('action' in what) return chooseAction(step, what.action, now);
  if (step.mode !== 'choose') return 'stay';
  const option = options(step)[what.row];
  if (option) {
    step.option = what.row;
    chooseOption(step, option);
  }
  return 'stay';
}

function chooseAction(step: ButtonTestStep, action: TestAction, now: number): TestOutcome {
  step.selected = action === 'cancel' ? 'name' : action;
  switch (action) {
    case 'save':
      return 'save';
    case 'name':
      step.mode = 'listen';
      step.listenUntil = now + LISTEN_MS;
      step.done = undefined;
      return 'stay';
    case 'cancel':
      step.mode = 'test';
      return 'stay';
  }
}

function chooseOption(step: ButtonTestStep, option: Option): void {
  if (option.go === 'cancel') {
    step.mode = 'test';
    step.target = undefined;
    return;
  }
  if (option.go === 'clear') return name(step, undefined);
  if (option.go === 'text') {
    step.stage = 'text';
    step.text = (step.target && step.names[step.target]) || '';
    step.shift = !step.text;
    step.option = 0;
    return;
  }
  if (step.stage === 'text' && option.go !== 'root') {
    if (option.type === 'done') return finishText(step);
    if (option.type === 'delete') return deleteChar(step);
    if (option.type === 'shift') {
      step.shift = !step.shift;
      return;
    }
    if (option.char !== undefined) typeChar(step, option.char);
    return;
  }
  if (option.go === 'back' || option.go === 'ready' || option.go === 'marker' || option.go === 'root') {
    step.stage = option.go === 'back' ? 'root' : option.go;
    step.option = 0;
    return;
  }
  if (option.pick === undefined) return;
  if (step.stage === 'ready') return name(step, option.pick);
  if (step.stage === 'marker') {
    step.marker = option.pick;
    step.stage = 'position';
    step.option = 0;
    return;
  }
  name(step, composedButtonName(step.marker ?? '', option.pick));
}

function name(step: ButtonTestStep, value: string | undefined): void {
  const code = step.target;
  if (!code) return;
  step.names = withButtonName(step.names, code, value);
  step.done = value ? t('{button} s’appelle maintenant « {name} ».', { button: defaultKeyLabel(code), name: step.names[code] ?? value }) : t('{button} n’a plus de nom.', { button: defaultKeyLabel(code) });
  step.mode = 'test';
  step.target = undefined;
  step.stage = 'root';
  step.marker = undefined;
  step.text = '';
  step.shift = false;
  step.option = 0;
}

/** Remet l'attente à zéro quand elle a trop duré ; vrai si l'écran a changé. */
export function buttonTestTick(step: ButtonTestStep, now: number): boolean {
  if (step.mode !== 'listen' || now < step.listenUntil) return false;
  step.mode = 'test';
  return true;
}

/**
 * Noms à enregistrer. Jamais undefined, même sans aucun nom : un modèle refait sans la clé garde les
 * anciens noms (saveCabinet), et il faut pouvoir les retirer tous.
 */
export function namesToSave(step: ButtonTestStep): ButtonNames {
  return { ...step.names };
}

export interface TestViewKeys {
  previous: string;
  next: string;
  confirm: string;
}

/** Ce que screen.js affiche : la carte et ses cases, le choix du nom, les actions, l'aide. */
export function buttonTestView(step: ButtonTestStep, saveLabel: string, keys: TestViewKeys, now = Date.now()) {
  const { tested, total } = testedCount(step);
  const silent = step.pins.filter((p) => !step.counts.has(p.code) && joystickButton(p.code)).length;
  const label = (code: string) => (step.names[code] ? `${step.names[code]} (${defaultKeyLabel(code)})` : defaultKeyLabel(code));
  let line: string;
  if (step.mode === 'listen') line = t('Appuie sur le bouton à nommer… ({s} s)', { s: Math.max(0, Math.ceil((step.listenUntil - now) / 1000)) });
  else if (step.mode === 'choose') line = t('Nom de {button}', { button: label(step.target!) });
  else if (total === 0) line = t('Aucun joystick branché : appuie sur les boutons du clavier pour les essayer.');
  else line = silent && tested ? t('Boutons essayés : {tested} sur {total} · sans réponse sur la carte : {silent}', { tested, total, silent }) : t('Boutons essayés : {tested} sur {total}', { tested, total });
  const selected = step.mode === 'test' ? step.selected : undefined;
  const list = step.mode === 'choose' ? options(step) : [];
  // Une liste longue (les noms prêts) ne montre que CHOICE_ROWS lignes autour du choix : elle ne déborde jamais de l'écran.
  const first = Math.max(0, Math.min(step.option - Math.floor(CHOICE_ROWS / 2), list.length - CHOICE_ROWS));
  const typing = step.mode === 'choose' && step.stage === 'text';
  // Le clavier de la saisie libre se montre en entier, en grille.
  const window_ = typing ? list.map((_, i) => i) : list.map((_, i) => i).slice(first, first + CHOICE_ROWS);
  const title = (text: string) => (!typing && list.length > CHOICE_ROWS ? t('{title} ({n} sur {total})', { title: text, n: step.option + 1, total: list.length }) : text);
  return {
    prompt: t('Essai et noms des boutons'),
    measure: undefined,
    name:
      step.mode === 'choose'
        ? typing
          ? t('Nom : « {text} »', { text: `${step.text}_` })
          : step.stage === 'marker'
          ? title(t('Quel repère a-t-il ? (couleur ou numéro)'))
          : step.stage === 'position'
            ? title(t('Où est-il sur la borne ?'))
            : title(t('Comment l’appeler ?'))
        : t('Appuie sur chaque bouton : sa case s’allume et compte les appuis.'),
    details: step.mode === 'test' ? t('Une case qui reste muette : fil, contact ou entrée de la carte à vérifier. Les noms que tu donnes remplacent « Bouton 7 » partout : aide-mémoire, relevé, indications.') : '',
    notice: step.done,
    step: line,
    // Pendant le choix du nom, la liste des choix prend la place des cases.
    pins: (step.mode === 'choose' ? [] : step.pins).map((p) => ({
      id: p.code,
      group: p.group,
      title: step.names[p.code] ?? p.short,
      sub: step.names[p.code] ? p.short : '',
      roles: (step.roles.get(p.code) ?? []).join(' · '),
      count: step.counts.get(p.code) ?? 0,
      state: step.down.has(p.code) ? 'lit' : step.last === p.code ? 'last' : step.counts.has(p.code) ? 'tested' : 'idle',
      target: step.target === p.code,
    })),
    keyboard: typing,
    buttons: step.mode === 'choose' ? window_.map((i) => ({ label: list[i]!.label, key: '', state: 'done', selected: step.option === i, act: { type: 'button', index: i } })) : undefined,
    actions: actions(step).map((id) => ({ id, label: id === 'save' ? saveLabel : id === 'name' ? t('Nommer un bouton') : t('Annuler'), selected: selected === id })),
    hint:
      typing
        ? t('Flippers ({left} / {right}) : choisir une touche · Start ({start}) : l’écrire · « ✔ Valider » pour finir · au clavier : tape, Entrée valide', { left: keys.previous, right: keys.next, start: keys.confirm })
        : step.mode === 'choose'
        ? t('Flippers ({left} / {right}) : choisir · Start ({start}) : valider · Clic sur une ligne : la choisir', { left: keys.previous, right: keys.next, start: keys.confirm })
        : step.mode === 'listen'
          ? t('Appuie sur le bouton à nommer · ou clique sur « Annuler »')
          : t('Flippers ({left} / {right}) : choisir une action · Start ({start}) : la lancer', { left: keys.previous, right: keys.next, start: keys.confirm }),
  };
}
