// Boutons de la borne : ce que l'assistant demande d'appuyer, les touches que
// toute l'interface lit, et leur traduction dans la section [Input] de
// VPinballX.ini.
//
// VPX 10.8.1 (commit af26b2d93, src/input/InputManager.cpp et InputAction.cpp)
// n'enregistre plus de codes DirectInput : chaque action a sa clé
// « Mapping.<action> », une liste d'alternatives séparées par « | », chacune une
// combinaison de touches séparées par « & ». Une touche du clavier s'écrit
// « Key;<scancode SDL> » ; une manette « SDLJoy_<GUID SDL>_<n>;<bouton> ». Une
// valeur vide vaut la touche par défaut de VPX.

import { IniDocument } from './ini';
import type { ButtonId, Cabinet, CabinetButtons } from './model';
import type { VpxSetting } from './vpx';

export interface ButtonInfo {
  id: ButtonId;
  label: string;
  /** Obligatoire : l'assistant attend ce bouton. Facultatif : Exit le passe. */
  required: boolean;
  /** Touche émise par défaut par les encodeurs de borne (celle de VPX), en KeyboardEvent.code. */
  default: string;
  /** Actions de VPX que ce bouton déclenche (« Mapping.<action> »). */
  vpx: string[];
}

/** Ordre de l'assistant : les boutons qui pilotent l'interface d'abord, Exit avant les facultatifs. */
export const BUTTONS: readonly ButtonInfo[] = [
  // Les flippers déplacent aussi le curseur du menu de VPX (UILeft, UIRight) et
  // tiennent les flippers « en deux temps » des tables qui en ont.
  { id: 'leftFlipper', label: 'Flipper gauche', required: true, default: 'ShiftLeft', vpx: ['LeftFlipper', 'LeftStagedFlipper', 'UILeft'] },
  { id: 'rightFlipper', label: 'Flipper droit', required: true, default: 'ShiftRight', vpx: ['RightFlipper', 'RightStagedFlipper', 'UIRight'] },
  { id: 'start', label: 'Start', required: true, default: 'Digit1', vpx: ['Start'] },
  { id: 'exit', label: 'Exit', required: true, default: 'Escape', vpx: ['ExitGame'] },
  { id: 'credit', label: 'Crédit', required: true, default: 'Digit5', vpx: ['Credit1'] },
  { id: 'plunger', label: 'Lanceur', required: true, default: 'Enter', vpx: ['LaunchBall'] },
  { id: 'leftMagna', label: 'MagnaSave gauche', required: false, default: 'ControlLeft', vpx: ['LeftMagna', 'UIUp'] },
  { id: 'rightMagna', label: 'MagnaSave droit', required: false, default: 'ControlRight', vpx: ['RightMagna', 'UIDown'] },
  { id: 'extraBall', label: 'Extra Ball', required: false, default: 'KeyB', vpx: ['ExtraBall'] },
  { id: 'tilt', label: 'Tilt (balancier)', required: false, default: 'KeyT', vpx: ['Tilt'] },
  { id: 'nudgeLeft', label: 'Tremblement à gauche', required: false, default: 'KeyZ', vpx: ['LeftNudge'] },
  { id: 'nudgeRight', label: 'Tremblement à droite', required: false, default: 'Slash', vpx: ['RightNudge'] },
  { id: 'nudgeCenter', label: 'Tremblement vers l’avant', required: false, default: 'Space', vpx: ['CenterNudge'] },
  { id: 'volumeDown', label: 'Volume −', required: false, default: 'Minus', vpx: ['VolumeDown'] },
  { id: 'volumeUp', label: 'Volume +', required: false, default: 'Equal', vpx: ['VolumeUp'] },
];

export function buttonInfo(id: ButtonId): ButtonInfo {
  return BUTTONS.find((b) => b.id === id)!;
}

/** Touches par défaut des encodeurs : celles d'une borne dont l'étape « Boutons » n'a pas été faite. */
export const DEFAULT_BUTTONS: Readonly<CabinetButtons> = Object.fromEntries(BUTTONS.map((b) => [b.id, b.default])) as CabinetButtons;

/**
 * Touche de chaque bouton : celles de l'étape « Boutons » ; sans elle, ou si le relevé
 * est incohérent (buttonProblems), les touches par défaut : un mauvais relevé ne doit
 * jamais rendre l'interface impossible à piloter. Un bouton facultatif passé dans
 * l'assistant n'a pas de touche.
 */
export function buttonKeys(buttons: CabinetButtons | undefined): CabinetButtons {
  return { ...(buttons && buttonProblems(buttons).length === 0 ? buttons : DEFAULT_BUTTONS) };
}

/**
 * Ce qui rend un relevé inutilisable : un bouton obligatoire sans touche, une touche
 * que VPX ne sait pas lire, la même touche pour deux boutons. Vide : relevé valable.
 */
export function buttonProblems(buttons: CabinetButtons): string[] {
  const problems: string[] = [];
  const holders = new Map<string, ButtonInfo>();
  for (const b of BUTTONS) {
    const code = buttons[b.id];
    if (!code) {
      if (b.required) problems.push(`${b.label} : aucune touche`);
      continue;
    }
    const refused = refusedKey(code);
    if (refused) problems.push(`${b.label} : ${refused}`);
    const other = holders.get(code);
    if (other) problems.push(`${other.label} et ${b.label} : même touche (${keyLabel(code)})`);
    else holders.set(code, b);
  }
  return problems;
}

/** Boutons qui pilotent toute l'interface : flippers, Start, Exit. */
export const NAVIGATION_BUTTONS: readonly ButtonId[] = ['leftFlipper', 'rightFlipper', 'start', 'exit'];

/**
 * Boutons de navigation à essayer sur la borne avant de valider ces touches : ceux
 * dont la touche n'est pas celle de référence (les touches en vigueur à l'arrivée sur
 * l'étape, ou celles des encodeurs quand on les a choisies). L'essai ne sert qu'à
 * surprendre un mauvais relevé : une touche qu'on n'a pas relevée n'est pas à essayer.
 */
export function buttonsToTry(keys: CabinetButtons, reference: CabinetButtons): ButtonId[] {
  return NAVIGATION_BUTTONS.filter((id) => !keys[id] || keys[id] !== reference[id]);
}

/** Clé gérée de [Input] (« Input.Mapping.LeftFlipper ») : celles que l'étape « Boutons » reprend en main. */
export function isInputKey(id: string): boolean {
  return id.toLowerCase().startsWith('input.');
}

/**
 * Remise aux touches par défaut des encodeurs : le relevé devient celui des encodeurs
 * (écrit dans [Input] à la synchronisation suivante, qui rend aussi leur touche aux
 * actions de VPX qui l'avaient perdue), et les touches gardées à la main sont reprises.
 */
export function withDefaultButtons(cabinet: Cabinet): Cabinet {
  const vpxManual = cabinet.vpxManual?.filter((id) => !isInputKey(id));
  const next: Cabinet = { ...cabinet, buttons: { ...DEFAULT_BUTTONS } };
  if (vpxManual?.length) next.vpxManual = vpxManual;
  else delete next.vpxManual;
  return next;
}

// ---------------------------------------------------------------------------
// Touches du clavier

/**
 * KeyboardEvent.code -> scancode SDL (SDL_scancode.h, valeurs des usages HID USB),
 * celui que VPX écrit après « Key; ». Un code absent de la table n'est pas lisible
 * par VPX : l'assistant le refuse.
 */
export const SDL_SCANCODES: Readonly<Record<string, number>> = {
  ...Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [`Key${c}`, 4 + i])),
  ...Object.fromEntries([...'123456789'].map((c, i) => [`Digit${c}`, 30 + i])),
  Digit0: 39,
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Space: 44,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  // Sous Windows, la touche # des claviers ISO arrive aussi en « Backslash » (même scancode).
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  CapsLock: 57,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 58 + i])),
  PrintScreen: 70,
  ScrollLock: 71,
  Pause: 72,
  Insert: 73,
  Home: 74,
  PageUp: 75,
  Delete: 76,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
  NumLock: 83,
  NumpadDivide: 84,
  NumpadMultiply: 85,
  NumpadSubtract: 86,
  NumpadAdd: 87,
  NumpadEnter: 88,
  ...Object.fromEntries([...'123456789'].map((c, i) => [`Numpad${c}`, 89 + i])),
  Numpad0: 98,
  NumpadDecimal: 99,
  IntlBackslash: 100,
  ContextMenu: 101,
  NumpadEqual: 103,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 13}`, 104 + i])),
  AudioVolumeMute: 127,
  AudioVolumeUp: 128,
  AudioVolumeDown: 129,
  NumpadComma: 133,
  IntlRo: 135,
  KanaMode: 136,
  IntlYen: 137,
  Convert: 138,
  NonConvert: 139,
  Lang1: 144,
  Lang2: 145,
  ControlLeft: 224,
  ShiftLeft: 225,
  AltLeft: 226,
  MetaLeft: 227,
  ControlRight: 228,
  ShiftRight: 229,
  AltRight: 230,
  MetaRight: 231,
};

const CODE_BY_SCANCODE = new Map(Object.entries(SDL_SCANCODES).map(([code, scancode]) => [scancode, code]));

export function sdlScancode(code: string): number | undefined {
  return SDL_SCANCODES[code];
}

export function codeOfScancode(scancode: number): string | undefined {
  return CODE_BY_SCANCODE.get(scancode);
}

const KEY_LABELS: Record<string, string> = {
  ShiftLeft: 'Maj gauche',
  ShiftRight: 'Maj droite',
  ControlLeft: 'Ctrl gauche',
  ControlRight: 'Ctrl droit',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  MetaLeft: 'Windows gauche',
  MetaRight: 'Windows droite',
  Enter: 'Entrée',
  NumpadEnter: 'Entrée du pavé',
  Escape: 'Échap',
  Backspace: 'Retour arrière',
  Tab: 'Tab',
  Space: 'Espace',
  CapsLock: 'Verr. Maj',
  ArrowLeft: 'Flèche gauche',
  ArrowRight: 'Flèche droite',
  ArrowUp: 'Flèche haut',
  ArrowDown: 'Flèche bas',
  PageUp: 'Page haut',
  PageDown: 'Page bas',
  Home: 'Origine',
  End: 'Fin',
  Insert: 'Inser',
  Delete: 'Suppr',
  PrintScreen: 'Impr écran',
  ScrollLock: 'Arrêt défil',
  Pause: 'Pause',
  NumLock: 'Verr. Num',
  ContextMenu: 'Menu',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '< >',
  NumpadDivide: '/ du pavé',
  NumpadMultiply: '* du pavé',
  NumpadSubtract: '- du pavé',
  NumpadAdd: '+ du pavé',
  NumpadDecimal: '. du pavé',
  NumpadEqual: '= du pavé',
  NumpadComma: ', du pavé',
  AudioVolumeMute: 'Muet',
  AudioVolumeUp: 'Volume + (multimédia)',
  AudioVolumeDown: 'Volume − (multimédia)',
};

/**
 * Nom d'une touche pour l'écran, d'après sa position (celle d'un clavier QWERTY,
 * comme dans VPX) : « Maj gauche », « 1 », « A », « Échap ».
 */
export function keyLabel(code: string | undefined): string {
  if (!code) return 'aucune';
  if (KEY_LABELS[code]) return KEY_LABELS[code]!;
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^(F\d+)$/.exec(code);
  if (m) return m[1]!;
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return `${pad[1]} du pavé`;
  return code;
}

/**
 * Touche du clavier qui ouvre toujours le menu et la configuration, et s'y déplace,
 * quels que soient les boutons relevés : un mauvais relevé ne peut pas en priver.
 */
export const CONFIG_KEY = 'Tab';

/** Touche du clavier qui revient au bouton précédent pendant le relevé des boutons. */
export const PREVIOUS_KEY = 'Backspace';

/**
 * Touches que l'assistant refuse pour un bouton : inconnues de VPX, que Windows
 * garde pour lui (la touche Windows ouvre le menu Démarrer), ou réservées par
 * Cyber Pinball (Tab pour la configuration, Retour arrière pour corriger un relevé).
 */
export function refusedKey(code: string): string | undefined {
  if (code === 'MetaLeft' || code === 'MetaRight') return 'La touche Windows ouvre le menu Démarrer : réglez ce bouton de l’encodeur sur une autre touche.';
  if (code === CONFIG_KEY) return 'Tab est réservée à l’accès à la configuration : réglez ce bouton de l’encodeur sur une autre touche.';
  if (code === PREVIOUS_KEY) return 'Retour arrière est réservée pour corriger un relevé : réglez ce bouton de l’encodeur sur une autre touche.';
  if (sdlScancode(code) === undefined) return `Touche « ${code} » inconnue de VPX : réglez ce bouton de l’encodeur sur une autre touche.`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Navigation dans l'interface

export interface NavigationKeys {
  previous: string[];
  next: string[];
  confirm: string[];
  exit: string[];
}

/**
 * Touches qui pilotent l'interface : flipper gauche / droit pour se déplacer,
 * Start pour valider, Exit pour revenir ; plus les flèches, Entrée et Échap d'un
 * clavier branché, sauf quand l'une d'elles est déjà un autre bouton de navigation.
 * Sans étape « Boutons », les touches d'avant : Maj, 1, Échap. `vertical` ajoute
 * les flèches haut et bas (listes du menu).
 */
export function navigationKeys(buttons: CabinetButtons | undefined, vertical = true): NavigationKeys {
  const keys = buttonKeys(buttons);
  const groups: [keyof NavigationKeys, string | undefined, string[]][] = [
    ['previous', keys.leftFlipper, ['ArrowLeft', ...(vertical ? ['ArrowUp'] : [])]],
    ['next', keys.rightFlipper, ['ArrowRight', ...(vertical ? ['ArrowDown'] : [])]],
    ['confirm', keys.start, ['Enter', 'NumpadEnter']],
    ['exit', keys.exit, ['Escape']],
  ];
  const cabinet = new Set(groups.map(([, key]) => key).filter((k): k is string => Boolean(k)));
  const result = {} as NavigationKeys;
  for (const [group, key, keyboard] of groups) {
    result[group] = [...new Set([...(key ? [key] : []), ...keyboard.filter((k) => k === key || !cabinet.has(k))])];
  }
  return result;
}

/** Retire d'une liste de raccourcis (H, R…) les touches prises par un bouton de la borne. */
export function withoutButtonKeys(codes: string[], buttons: CabinetButtons | undefined): string[] {
  const taken = new Set(Object.values(buttonKeys(buttons)));
  return codes.filter((c) => !taken.has(c));
}

/** Aide-mémoire « Pendant une partie » : chaque bouton affecté et sa touche. */
export function gameKeys(buttons: CabinetButtons | undefined): [string, string][] {
  const keys = buttonKeys(buttons);
  const label = (id: ButtonId) => keyLabel(keys[id]);
  // « Z / / / Espace » ne se lit pas : avec la touche « / », les touches sont séparées par « · ».
  const list = (ids: ButtonId[]) => {
    const labels = ids.map(label);
    return labels.join(labels.some((l) => l.includes('/')) ? ' · ' : ' / ');
  };
  const rows: [string, string][] = [
    ['Flippers', list(['leftFlipper', 'rightFlipper'])],
    ['Lanceur', label('plunger')],
    ['Crédit', label('credit')],
    ['Start', label('start')],
    ['Pause et menu de VPX', label('exit')],
    ['Quitter la partie', `maintenir ${label('exit')}`],
  ];
  const optional = (title: string, ids: ButtonId[]) => {
    const present = ids.filter((id) => keys[id]);
    if (present.length) rows.push([title, list(present)]);
  };
  optional('MagnaSave', ['leftMagna', 'rightMagna']);
  optional('Extra Ball', ['extraBall']);
  optional('Tilt', ['tilt']);
  optional('Tremblements', ['nudgeLeft', 'nudgeRight', 'nudgeCenter']);
  optional('Volume', ['volumeDown', 'volumeUp']);
  return rows;
}

// ---------------------------------------------------------------------------
// [Input] de VPinballX.ini

export const VPX_INPUT_SECTION = 'Input';

/**
 * Actions de VPX qui ont une touche par défaut, et cette touche (scancode SDL),
 * relevées dans InputManager::CreateInputActions au commit af26b2d93. Les actions
 * sans touche (ShowRules, Custom1-4…) et les combinaisons (GenTournament = Alt & 1)
 * n'y sont pas : Cyber Pinball n'y touche jamais.
 */
export const VPX_INPUT_DEFAULTS: Readonly<Record<string, number>> = {
  LeftFlipper: 225,
  RightFlipper: 229,
  LeftStagedFlipper: 225,
  RightStagedFlipper: 229,
  LeftMagna: 224,
  RightMagna: 228,
  UIUp: 224,
  UIDown: 228,
  UILeft: 225,
  UIRight: 229,
  LaunchBall: 40,
  LeftNudge: 29,
  RightNudge: 56,
  CenterNudge: 44,
  Tilt: 23,
  Credit1: 34,
  Credit2: 33,
  Credit3: 32,
  Credit4: 35,
  Start: 30,
  ExtraBall: 5,
  Lockbar: 226,
  Pause: 19,
  PerfOverlay: 68,
  ExitGame: 41,
  InGameUI: 69,
  VolumeDown: 45,
  VolumeUp: 46,
  SlamTilt: 74,
  CoinDoor: 77,
  Reset: 60,
  Service1: 36,
  Service2: 37,
  Service3: 38,
  Service4: 39,
  Service5: 35,
  Service6: 75,
  Service7: 45,
  VRCenter: 93,
  VRUp: 96,
  VRDown: 90,
  DebugBalls: 18,
  Debugger: 7,
  ToggleStereo: 67,
};

/** Libellés de VPX des actions qu'une touche de bouton peut faire taire. */
const VPX_ACTION_LABELS: Record<string, string> = {
  LeftStagedFlipper: 'Flipper gauche en deux temps',
  RightStagedFlipper: 'Flipper droit en deux temps',
  UIUp: 'Menu de VPX : élément suivant',
  UIDown: 'Menu de VPX : élément précédent',
  UILeft: 'Menu de VPX : diminuer',
  UIRight: 'Menu de VPX : augmenter',
  Credit2: 'Crédit 2',
  Credit3: 'Crédit 3',
  Credit4: 'Crédit 4',
  Lockbar: 'Bouton de la lockbar',
  Pause: 'Pause',
  PerfOverlay: 'Statistiques d’affichage',
  InGameUI: 'Menu de VPX',
  SlamTilt: 'Slam Tilt',
  CoinDoor: 'Porte du monnayeur',
  Reset: 'Reset',
  VRCenter: 'Recentrer la VR',
  VRUp: 'Monter la vue VR',
  VRDown: 'Descendre la vue VR',
  DebugBalls: 'Billes de débogage',
  Debugger: 'Débogueur',
  ToggleStereo: 'Mode stéréo',
};

export function vpxActionLabel(action: string): string {
  const service = /^Service(\d)$/.exec(action);
  if (service) return `Service ${service[1]}`;
  return VPX_ACTION_LABELS[action] ?? BUTTONS.find((b) => b.vpx[0] === action)?.label ?? action;
}

export function mappingKey(action: string): string {
  return `Mapping.${action}`;
}

/** Une alternative d'une valeur Mapping.* : une ou plusieurs entrées « périphérique;élément[;seuil] ». */
type Alternative = string[];

/** Découpe une valeur Mapping.* comme InputAction::SetMapping : « | » puis « & ». */
export function parseMapping(value: string): Alternative[] {
  return value
    .split('|')
    .map((alt) => alt.split('&').map((part) => part.trim()).filter(Boolean))
    .filter((alt) => alt.length > 0);
}

/** Écrit une valeur comme InputAction::GetMappingString : « a | b », « a & b ». */
export function formatMapping(alternatives: Alternative[]): string {
  return alternatives.map((alt) => alt.join(' & ')).join(' | ');
}

const KEY_TOKEN = /^Key;(\d+)$/;

/** Scancode d'une alternative faite d'une seule touche du clavier ; undefined sinon (manette, combinaison). */
function singleKey(alt: Alternative): number | undefined {
  const m = alt.length === 1 ? KEY_TOKEN.exec(alt[0]!) : null;
  return m ? Number(m[1]) : undefined;
}

/** Touche qui ne correspond à aucune touche réelle : VPX n'a pas d'autre moyen de « ne rien affecter ». */
export const NO_KEY = 0;

/**
 * Remplace les touches seules du clavier d'une valeur Mapping.* par `keys`, à la
 * place de la première, en gardant le reste : boutons de manette et combinaisons
 * affectés dans VPX. Une valeur qui resterait vide reçoit NO_KEY, puisque VPX
 * lirait une valeur vide comme sa touche par défaut.
 */
export function withKeyboardKeys(current: string, keys: number[]): string {
  const alternatives = parseMapping(current);
  const result: Alternative[] = [];
  let placed = false;
  const place = () => {
    if (placed) return;
    placed = true;
    for (const k of keys) result.push([`Key;${k}`]);
  };
  for (const alt of alternatives) {
    if (singleKey(alt) !== undefined) place();
    else result.push(alt);
  }
  if (!placed) {
    const others = result.splice(0);
    place();
    result.push(...others);
  }
  return formatMapping(result.length ? result : [[`Key;${NO_KEY}`]]);
}

/** Touches seules du clavier d'une valeur Mapping.* (la touche par défaut de VPX si la valeur est vide). */
export function keyboardKeys(value: string | undefined, action: string): number[] {
  const text = value?.trim() ? value : VPX_INPUT_DEFAULTS[action] !== undefined ? `Key;${VPX_INPUT_DEFAULTS[action]}` : '';
  return parseMapping(text)
    .map(singleKey)
    .filter((k): k is number => k !== undefined && k !== NO_KEY);
}

/** Une action de VPX dont la touche est désormais celle d'un bouton de la borne. */
export interface SilencedAction {
  action: string;
  label: string;
  scancode: number;
  button: ButtonId;
}

export interface VpxInputPlan {
  /** Clés [Input] gérées et leur valeur. */
  settings: VpxSetting[];
  /** Actions de VPX privées d'une touche reprise par un bouton. */
  silenced: SilencedAction[];
  /**
   * Clés écrites la dernière fois mais qui ne sont plus gérées (une touche rendue
   * à l'action), laissées telles quelles par l'utilisateur : remises à la valeur
   * par défaut de VPX.
   */
  released: VpxSetting[];
}

/**
 * Section [Input] pour les boutons de la borne :
 * - chaque action d'un bouton reçoit sa touche (la touche par défaut de VPX pour
 *   un bouton facultatif passé), à la place des touches du clavier de la valeur
 *   actuelle ; les boutons de manette affectés dans VPX sont gardés ;
 * - une autre action de VPX dont la touche est celle d'un bouton la perd : sinon,
 *   un bouton Extra Ball sur D ouvrirait aussi le débogueur. Les doublons voulus
 *   par VPX restent (Volume − et Service 7 partagent - par défaut) ;
 * - `written` (mémoire des valeurs écrites, « Input.Mapping.X » -> valeur) rend
 *   leur touche par défaut aux actions qui n'ont plus de conflit.
 */
export function vpxInputSettings(buttons: CabinetButtons, doc: IniDocument, written: Record<string, string> = {}): VpxInputPlan {
  const settings: VpxSetting[] = [];
  const silenced: SilencedAction[] = [];
  const released: VpxSetting[] = [];
  const put = (action: string, keys: number[]) => {
    // Une valeur vide vaut la touche par défaut de VPX : elle est remplacée, rien à garder.
    const current = doc.get(VPX_INPUT_SECTION, mappingKey(action)) ?? '';
    settings.push({ section: VPX_INPUT_SECTION, key: mappingKey(action), value: withKeyboardKeys(current, keys) });
  };

  // Scancode -> bouton qui le tient.
  const taken = new Map<number, ButtonInfo>();
  for (const b of BUTTONS) {
    const code = buttons[b.id];
    const scancode = code === undefined ? undefined : sdlScancode(code);
    if (scancode !== undefined) taken.set(scancode, b);
  }
  // Doublon voulu par VPX : la même touche par défaut, laissée par défaut sur le bouton.
  const intended = (action: string, scancode: number) => {
    const holder = taken.get(scancode)!;
    return VPX_INPUT_DEFAULTS[action] === scancode && sdlScancode(holder.default) === scancode;
  };
  const free = (action: string, keys: number[], owner?: ButtonId) => {
    const kept: number[] = [];
    for (const k of keys) {
      const holder = taken.get(k);
      if (!holder || holder.id === owner || intended(action, k)) kept.push(k);
      else silenced.push({ action, label: vpxActionLabel(action), scancode: k, button: holder.id });
    }
    return kept;
  };

  const driven = new Set<string>();
  for (const b of BUTTONS) {
    const code = buttons[b.id];
    const scancode = code === undefined ? undefined : sdlScancode(code);
    for (const action of b.vpx) {
      driven.add(action);
      put(action, scancode !== undefined ? [scancode] : free(action, [VPX_INPUT_DEFAULTS[action]!]));
    }
  }

  for (const action of Object.keys(VPX_INPUT_DEFAULTS)) {
    if (driven.has(action)) continue;
    const key = mappingKey(action);
    const current = doc.get(VPX_INPUT_SECTION, key);
    // Une valeur écrite par Cyber Pinball et restée telle quelle part de la touche de VPX.
    const before = written[`${VPX_INPUT_SECTION}.${key}`];
    const ours = before !== undefined && current === before;
    const keys = keyboardKeys(ours ? undefined : current, action);
    const kept = free(action, keys);
    if (kept.length < keys.length) put(action, kept);
    // Plus de conflit : la touche de VPX revient.
    else if (ours) released.push({ section: VPX_INPUT_SECTION, key, value: '' });
  }
  return { settings, silenced, released };
}

/** Clés [Input] que Cyber Pinball écrit pour ces boutons, hors actions privées de leur touche (qui varient avec le fichier). */
export function vpxInputOwnedKeys(): string[] {
  return BUTTONS.flatMap((b) => b.vpx.map(mappingKey));
}

/** Texte d'une valeur Mapping.* pour l'écran : « Maj gauche », « Maj gauche ou bouton de manette ». */
export function describeMapping(value: string | undefined, action: string): string {
  const text = value?.trim() ? value : VPX_INPUT_DEFAULTS[action] !== undefined ? `Key;${VPX_INPUT_DEFAULTS[action]}` : '';
  const parts = parseMapping(text).map((alt) => {
    const key = singleKey(alt);
    if (key === NO_KEY) return 'aucune touche';
    if (key !== undefined) return keyLabel(codeOfScancode(key) ?? `scancode ${key}`);
    if (alt.every((p) => KEY_TOKEN.test(p))) return alt.map((p) => keyLabel(codeOfScancode(Number(KEY_TOKEN.exec(p)![1])))).join(' + ');
    return alt.some((p) => p.startsWith('SDLJoy_')) ? 'bouton de manette' : alt.join(' + ');
  });
  return parts.length ? parts.join(' ou ') : 'aucune touche';
}
