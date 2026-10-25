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
//
// Un bouton de la borne est une touche du clavier (encodeur en mode clavier : son
// KeyboardEvent.code) ou un bouton de joystick (Pinscape sur KL25Z, encodeur en mode
// manette : le jeton de VPX lui-même, « SDLJoy_<GUID>_<n>;<bouton> », lu par la
// bibliothèque SDL de VPX, packages/win-displays/src/joystick.ts).

import { formatList, t } from './i18n';
import { IniDocument } from './ini';
import type { ButtonId, Cabinet, CabinetButtons, NavigationButtons, NavigationId } from './model';
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
  { id: 'leftFlipper', get label() { return t('Flipper gauche'); }, required: true, default: 'ShiftLeft', vpx: ['LeftFlipper', 'LeftStagedFlipper', 'UILeft'] },
  { id: 'rightFlipper', get label() { return t('Flipper droit'); }, required: true, default: 'ShiftRight', vpx: ['RightFlipper', 'RightStagedFlipper', 'UIRight'] },
  { id: 'start', label: 'Start', required: true, default: 'Digit1', vpx: ['Start'] },
  { id: 'exit', label: 'Exit', required: true, default: 'Escape', vpx: ['ExitGame'] },
  { id: 'credit', get label() { return t('Crédit'); }, required: true, default: 'Digit5', vpx: ['Credit1'] },
  { id: 'plunger', get label() { return t('Lanceur'); }, required: true, default: 'Enter', vpx: ['LaunchBall'] },
  { id: 'leftMagna', get label() { return t('MagnaSave gauche'); }, required: false, default: 'ControlLeft', vpx: ['LeftMagna', 'UIUp'] },
  { id: 'rightMagna', get label() { return t('MagnaSave droit'); }, required: false, default: 'ControlRight', vpx: ['RightMagna', 'UIDown'] },
  { id: 'extraBall', label: 'Extra Ball', required: false, default: 'KeyB', vpx: ['ExtraBall'] },
  { id: 'tilt', get label() { return t('Tilt (balancier)'); }, required: false, default: 'KeyT', vpx: ['Tilt'] },
  { id: 'nudgeLeft', get label() { return t('Tremblement à gauche'); }, required: false, default: 'KeyZ', vpx: ['LeftNudge'] },
  { id: 'nudgeRight', get label() { return t('Tremblement à droite'); }, required: false, default: 'Slash', vpx: ['RightNudge'] },
  { id: 'nudgeCenter', get label() { return t('Tremblement vers l’avant'); }, required: false, default: 'Space', vpx: ['CenterNudge'] },
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
  return keyProblems(GAME_KEYS, buttons);
}

/** Ce que devient le relevé quand le bouton demandé envoie une touche (recordKey). */
export interface ButtonRecord<K = SetKeys> {
  keys: K;
  /** Exit (Retour pour l'interface), déjà relevé, sur un bouton facultatif : la borne n'a pas ce bouton. */
  skipped?: boolean;
  /** Touche refusée et pourquoi ; le relevé est inchangé. */
  refused?: string;
}

/** Le bouton de jeu `id` vient d'envoyer `code` (recordKey sur les boutons du jeu). */
export function recordButton(keys: CabinetButtons, id: ButtonId, code: string): ButtonRecord<CabinetButtons> {
  return recordKey(GAME_KEYS, keys, id, code) as ButtonRecord<CabinetButtons>;
}

/** Boutons de jeu à essayer au récapitulatif de leur relevé : flippers, Start, Exit. */
export const MAIN_GAME_BUTTONS: readonly ButtonId[] = ['leftFlipper', 'rightFlipper', 'start', 'exit'];

/**
 * Boutons de jeu à essayer sur la borne avant de valider ces touches : ceux dont la
 * touche n'est pas celle de référence (les touches en vigueur à l'arrivée sur l'étape, ou
 * celles des encodeurs quand on les a choisies). L'essai ne sert qu'à surprendre un
 * mauvais relevé : une touche qu'on n'a pas relevée n'est pas à essayer.
 */
export function buttonsToTry(keys: CabinetButtons, reference: CabinetButtons): ButtonId[] {
  return keysToTry(GAME_KEYS, keys, reference) as ButtonId[];
}

// ---------------------------------------------------------------------------
// Deux jeux de boutons, relevés de la même façon
//
// Les boutons du jeu (ce que VPX reçoit pendant une partie, [Input] Mapping.*) et ceux de
// l'interface (ce qui pilote Cyber Pinball : menu, fiches, réglages, assistant) se relèvent,
// se récapitulent et s'essaient chacun de leur côté, par les mêmes fonctions.

/** Touches d'un jeu de boutons : identifiant du bouton -> touche ou bouton de joystick. */
export type SetKeys = Partial<Record<string, string>>;

export interface KeySet {
  kind: 'game' | 'interface';
  items: readonly { id: string; label: string; required: boolean }[];
  /** Bouton qui, une fois relevé, passe un bouton facultatif : Exit, ou Retour. */
  skip: string;
  /** Au récapitulatif : choisir (précédent, suivant), lancer le choix, sortir. */
  move: { previous: string; next: string; confirm: string; exit: string };
  /** Boutons à essayer au récapitulatif quand leur touche a changé. */
  tried: readonly string[];
  /** Pourquoi ce bouton ne peut pas avoir cette touche ; undefined : accepté. */
  refused(id: string, code: string): string | undefined;
}

export const GAME_KEYS: KeySet = {
  kind: 'game',
  items: BUTTONS,
  skip: 'exit',
  move: { previous: 'leftFlipper', next: 'rightFlipper', confirm: 'start', exit: 'exit' },
  tried: MAIN_GAME_BUTTONS,
  refused: (_id, code) => refusedKey(code),
};

/**
 * Le bouton `id` vient d'envoyer `code`, touche du clavier ou bouton du joystick : les deux
 * se relèvent de la même façon, et se mélangent librement d'un bouton à l'autre. Refusé si
 * un autre bouton du même jeu l'a déjà, ou si `set.refused` le refuse ; le bouton qui passe
 * (`set.skip`), une fois relevé, passe un bouton facultatif.
 */
export function recordKey(set: KeySet, keys: SetKeys, id: string, code: string): ButtonRecord {
  const item = set.items.find((b) => b.id === id)!;
  const skip = keys[set.skip];
  if (!item.required && skip && code === skip) {
    const next = { ...keys };
    delete next[id];
    return { keys: next, skipped: true };
  }
  const holder = set.items.find((b) => b.id !== id && keys[b.id] === code);
  const refused = holder
    ? t('{key} est déjà la touche du bouton {button} : appuyez sur un autre bouton, ou cliquez sur {button} pour le refaire.', { key: keyLabel(code), button: holder.label })
    : set.refused(id, code);
  if (refused) return { keys, refused };
  return { keys: { ...keys, [id]: code } };
}

/** Ce qui rend un relevé de ce jeu inutilisable (buttonProblems, navigationProblems). Vide : valable. */
export function keyProblems(set: KeySet, keys: SetKeys): string[] {
  const problems: string[] = [];
  const holders = new Map<string, string>();
  for (const b of set.items) {
    const code = keys[b.id];
    if (!code) {
      if (b.required) problems.push(t('{button} : aucune touche', { button: b.label }));
      continue;
    }
    const refused = set.refused(b.id, code);
    if (refused) problems.push(t('{button} : {problem}', { button: b.label, problem: refused }));
    const other = holders.get(code);
    if (other) problems.push(t('{first} et {second} : même touche ({key})', { first: other, second: b.label, key: keyLabel(code) }));
    else holders.set(code, b.label);
  }
  return problems;
}

/** Boutons de ce jeu à essayer avant de valider : ceux de `set.tried` dont la touche a changé. */
export function keysToTry(set: KeySet, keys: SetKeys, reference: SetKeys): string[] {
  return set.tried.filter((id) => !keys[id] || keys[id] !== reference[id]);
}

/** Clé gérée de [Input] (« Input.Mapping.LeftFlipper ») : celles que l'étape « Boutons » reprend en main. */
export function isInputKey(id: string): boolean {
  return id.toLowerCase().startsWith('input.');
}

/**
 * Remise aux touches par défaut des encodeurs, des deux jeux de boutons : le relevé du jeu
 * devient celui des encodeurs, l'interface leurs flippers, Start et Exit
 * (écrit dans [Input] à la synchronisation suivante, qui rend aussi leur touche aux
 * actions de VPX qui l'avaient perdue), et les touches gardées à la main sont reprises.
 */
export function withDefaultButtons(cabinet: Cabinet): Cabinet {
  const vpxManual = cabinet.vpxManual?.filter((id) => !isInputKey(id));
  // Les deux jeux : l'interface revient sur les flippers, Start et Exit des encodeurs.
  const next: Cabinet = { ...cabinet, buttons: { ...DEFAULT_BUTTONS }, navigation: defaultNavigation(DEFAULT_BUTTONS) };
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
  get ShiftLeft() { return t('Maj gauche'); },
  get ShiftRight() { return t('Maj droite'); },
  get ControlLeft() { return t('Ctrl gauche'); },
  get ControlRight() { return t('Ctrl droit'); },
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  get MetaLeft() { return t('Windows gauche'); },
  get MetaRight() { return t('Windows droite'); },
  get Enter() { return t('Entrée'); },
  get NumpadEnter() { return t('Entrée du pavé'); },
  get Escape() { return t('Échap'); },
  get Backspace() { return t('Retour arrière'); },
  Tab: 'Tab',
  get Space() { return t('Espace'); },
  get CapsLock() { return t('Verr. Maj'); },
  get ArrowLeft() { return t('Flèche gauche'); },
  get ArrowRight() { return t('Flèche droite'); },
  get ArrowUp() { return t('Flèche haut'); },
  get ArrowDown() { return t('Flèche bas'); },
  get PageUp() { return t('Page haut'); },
  get PageDown() { return t('Page bas'); },
  get Home() { return t('Origine'); },
  get End() { return t('Fin'); },
  get Insert() { return t('Inser'); },
  get Delete() { return t('Suppr'); },
  get PrintScreen() { return t('Impr écran'); },
  get ScrollLock() { return t('Arrêt défil'); },
  Pause: 'Pause',
  get NumLock() { return t('Verr. Num'); },
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
  get NumpadDivide() { return t('/ du pavé'); },
  get NumpadMultiply() { return t('* du pavé'); },
  get NumpadSubtract() { return t('- du pavé'); },
  get NumpadAdd() { return t('+ du pavé'); },
  get NumpadDecimal() { return t('. du pavé'); },
  get NumpadEqual() { return t('= du pavé'); },
  get NumpadComma() { return t(', du pavé'); },
  get AudioVolumeMute() { return t('Muet'); },
  get AudioVolumeUp() { return t('Volume + (multimédia)'); },
  get AudioVolumeDown() { return t('Volume − (multimédia)'); },
};

/**
 * Nom d'une touche pour l'écran, d'après sa position (celle d'un clavier QWERTY,
 * comme dans VPX) : « Maj gauche », « 1 », « A », « Échap ».
 */
export function keyLabel(code: string | undefined): string {
  if (!code) return t('aucune');
  const joy = joystickButton(code);
  // Numéroté à partir de 1, comme le panneau « Contrôleurs de jeu » de Windows et l'outil de configuration du Pinscape.
  if (joy) return t('Bouton {n} du joystick', { n: joy.button + 1 });
  if (KEY_LABELS[code]) return KEY_LABELS[code]!;
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^(F\d+)$/.exec(code);
  if (m) return m[1]!;
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return t('{n} du pavé', { n: pad[1]! });
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
  if (joystickButton(code)) return undefined;
  if (code === 'MetaLeft' || code === 'MetaRight') return t('La touche Windows ouvre le menu Démarrer : réglez ce bouton de l’encodeur sur une autre touche.');
  if (code === CONFIG_KEY) return t('Tab est réservée à l’accès à la configuration : réglez ce bouton de l’encodeur sur une autre touche.');
  if (code === PREVIOUS_KEY) return t('Retour arrière est réservée pour corriger un relevé : réglez ce bouton de l’encodeur sur une autre touche.');
  if (sdlScancode(code) === undefined) return t('Touche « {code} » inconnue de VPX : réglez ce bouton de l’encodeur sur une autre touche.', { code });
  return undefined;
}

// ---------------------------------------------------------------------------
// Boutons de joystick

/** Jeton de VPX d'un bouton de joystick : « SDLJoy_<GUID SDL en 32 chiffres hexadécimaux>_<rang>;<bouton> ». */
const JOYSTICK_TOKEN = /^(SDLJoy_[0-9a-f]{32}_\d+);(\d+)$/i;

/** Joystick et numéro SDL (à partir de 0) d'un bouton de joystick ; undefined pour une touche du clavier. */
export function joystickButton(code: string): { device: string; button: number } | undefined {
  const m = JOYSTICK_TOKEN.exec(code);
  return m ? { device: m[1]!, button: Number(m[2]) } : undefined;
}

/** Code d'un bouton de joystick, tel que VPX l'écrit dans [Input]. */
export function joystickCode(device: string, button: number): string {
  return `${device};${button}`;
}

/**
 * Identifiants que VPX donne aux joysticks, d'après leurs GUID SDL dans l'ordre de SDL :
 * « SDLJoy_<GUID>_<rang> », le rang distinguant les joysticks de même GUID (deux Pinscape),
 * comme SDLInputHandler::OnJoystickAdded.
 */
export function joystickDeviceIds(guids: string[]): string[] {
  return guids.map((guid, i) => `SDLJoy_${guid}_${1 + guids.slice(0, i).filter((g) => g === guid).length}`);
}

/**
 * Joysticks que VPX a vus à sa dernière partie (vpinball.log, « Joystick connected: <nom>
 * (… VPX UID: <identifiant>) ») : de quoi vérifier que Cyber Pinball les nomme comme lui.
 */
export function joysticksInVpxLog(log: string): { name: string; id: string }[] {
  const found = new Map<string, string>();
  for (const m of log.matchAll(/Joystick connected: (.*?) \(SDL ID:.*?VPX UID: (SDLJoy_[0-9a-f]{32}_\d+)\)/gi)) found.set(m[2]!, m[1]!);
  return [...found].map(([id, name]) => ({ id, name }));
}

/**
 * Joysticks des boutons de la borne que VPX n'a pas vus à sa dernière partie alors qu'il en
 * voyait d'autres : leurs boutons ne répondent pas en jeu (identifiant calculé autrement,
 * ou joystick débranché). Vide : rien à signaler, ou VPX n'a vu aucun joystick.
 */
export function joysticksUnseenByVpx(buttons: CabinetButtons | undefined, seen: { id: string }[]): string[] {
  if (!buttons || seen.length === 0) return [];
  const known = new Set(seen.map((j) => j.id.toLowerCase()));
  const wanted = new Set(Object.values(buttons).flatMap((code) => (code ? [joystickButton(code)?.device] : [])).filter((d): d is string => Boolean(d)));
  return [...wanted].filter((d) => !known.has(d.toLowerCase()));
}

/** Élément de [Input] d'un bouton de la borne : « Key;225 », ou le jeton du joystick. */
function mappingToken(code: string): string {
  return joystickButton(code) ? code : `Key;${sdlScancode(code)}`;
}

// ---------------------------------------------------------------------------
// Navigation dans l'interface

/** Ce que l'interface lit d'une borne : ses deux jeux de boutons (un Cabinet convient). */
export type ButtonsSource = Pick<Cabinet, 'buttons' | 'navigation'> | undefined;

export interface NavigationInfo {
  id: NavigationId;
  label: string;
  /** Obligatoire : l'assistant attend ce bouton. Facultatif : Retour le passe. */
  required: boolean;
  /** Bouton de jeu qui tient ce rôle par défaut (borne d'avant les boutons de l'interface, touches par défaut). */
  game?: ButtonId;
  /** Touches de secours du clavier, toujours actives pour ce rôle et pour lui seul. */
  fallback: readonly string[];
}

/** Boutons de l'interface, dans l'ordre de l'assistant. */
export const NAVIGATION: readonly NavigationInfo[] = [
  { id: 'previous', get label() { return t('Précédent'); }, required: true, game: 'leftFlipper', fallback: ['ArrowLeft', 'ArrowUp'] },
  { id: 'next', get label() { return t('Suivant'); }, required: true, game: 'rightFlipper', fallback: ['ArrowRight', 'ArrowDown'] },
  { id: 'confirm', get label() { return t('Valider'); }, required: true, game: 'start', fallback: ['Enter', 'NumpadEnter'] },
  { id: 'back', get label() { return t('Retour et menu'); }, required: true, game: 'exit', fallback: ['Escape'] },
  { id: 'help', get label() { return t('Aide-mémoire'); }, required: false, fallback: [] },
  { id: 'settings', get label() { return t('Réglages de VPX'); }, required: false, fallback: [] },
];

/**
 * Touches qu'un bouton de l'interface refuse : celles que refuse un bouton de jeu (touche
 * Windows, Tab, Retour arrière…), et les touches de secours d'un autre rôle (flèches, Entrée,
 * Échap), qui gardent toujours le leur.
 */
export function refusedNavigationKey(id: string, code: string): string | undefined {
  const refused = refusedKey(code);
  if (refused) return refused;
  const owner = NAVIGATION.find((n) => n.id !== id && n.fallback.includes(code));
  return owner ? t('{key} reste la touche de secours « {action} » : choisissez un autre bouton.', { key: keyLabel(code), action: owner.label }) : undefined;
}

export const INTERFACE_KEYS: KeySet = {
  kind: 'interface',
  items: NAVIGATION,
  skip: 'back',
  move: { previous: 'previous', next: 'next', confirm: 'confirm', exit: 'back' },
  tried: ['previous', 'next', 'confirm', 'back'],
  refused: refusedNavigationKey,
};

/**
 * Boutons de l'interface par défaut : les mêmes boutons physiques que flippers, Start et
 * Exit du jeu (ceux des encodeurs tant que le jeu n'a pas été relevé).
 */
export function defaultNavigation(buttons: CabinetButtons | undefined): NavigationButtons {
  const keys = buttonKeys(buttons);
  const nav: NavigationButtons = {};
  for (const n of NAVIGATION) if (n.game && keys[n.game]) nav[n.id] = keys[n.game];
  return nav;
}

/** Ce qui rend un relevé des boutons de l'interface inutilisable. Vide : relevé valable. */
export function navigationProblems(navigation: NavigationButtons): string[] {
  return keyProblems(INTERFACE_KEYS, navigation);
}

/**
 * Boutons de l'interface en vigueur : ceux de l'étape « Boutons de l'interface » ; sans
 * elle (borne d'avant, migration douce), ou si leur relevé est incohérent, les flippers,
 * Start et Exit du jeu (defaultNavigation) : l'interface reste toujours pilotable.
 */
export function navigationButtons(source: ButtonsSource): NavigationButtons {
  const nav = source?.navigation;
  return nav && navigationProblems(nav).length === 0 ? { ...nav } : defaultNavigation(source?.buttons);
}

export interface NavigationKeys {
  previous: string[];
  next: string[];
  confirm: string[];
  exit: string[];
}

/**
 * Touches qui pilotent l'interface : ses boutons Précédent / Suivant pour se déplacer,
 * Valider, Retour pour revenir (par défaut flippers, Start, Exit) ; plus les touches de
 * secours d'un clavier branché, flèches, Entrée et Échap, sauf quand l'une d'elles est
 * déjà un autre bouton de l'interface (relevé d'avant les boutons de l'interface, déduit
 * du jeu). Les boutons du jeu n'en prennent aucune. `vertical` ajoute les flèches haut et
 * bas (listes du menu).
 */
export function navigationKeys(source: ButtonsSource, vertical = true): NavigationKeys {
  const nav = navigationButtons(source);
  const fallback = (id: NavigationId) => NAVIGATION.find((n) => n.id === id)!.fallback.filter((k) => vertical || (k !== 'ArrowUp' && k !== 'ArrowDown'));
  const groups: [keyof NavigationKeys, string | undefined, readonly string[]][] = [
    ['previous', nav.previous, fallback('previous')],
    ['next', nav.next, fallback('next')],
    ['confirm', nav.confirm, fallback('confirm')],
    ['exit', nav.back, fallback('back')],
  ];
  const cabinet = new Set(groups.map(([, key]) => key).filter((k): k is string => Boolean(k)));
  const result = {} as NavigationKeys;
  for (const [group, key, keyboard] of groups) {
    result[group] = [...new Set([...(key ? [key] : []), ...keyboard.filter((k) => k === key || !cabinet.has(k))])];
  }
  return result;
}

/** Touches de toute l'interface : navigation, puis aide-mémoire (H, F1) et réglages de VPX (R). */
export interface InterfaceKeys extends NavigationKeys {
  help: string[];
  settings: string[];
}

/**
 * navigationKeys, plus les boutons Aide et Réglages de l'interface s'ils ont été relevés,
 * et les raccourcis H, F1 et R d'un clavier tant qu'aucun bouton de la borne ne les envoie.
 */
export function interfaceKeys(source: ButtonsSource, vertical = true): InterfaceKeys {
  const nav = navigationButtons(source);
  const own = (id: NavigationId, keyboard: string[]) => [...new Set([...(nav[id] ? [nav[id]!] : []), ...withoutButtonKeys(keyboard, source)])];
  return { ...navigationKeys(source, vertical), help: own('help', ['KeyH', 'F1']), settings: own('settings', ['KeyR']) };
}

/** Retire d'une liste de raccourcis (H, R…) les touches prises par un bouton de la borne, du jeu ou de l'interface. */
export function withoutButtonKeys(codes: string[], source: ButtonsSource): string[] {
  const taken = new Set([...Object.values(buttonKeys(source?.buttons)), ...Object.values(navigationButtons(source))]);
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
  // VPX 10.8.1 quitte la partie dès qu'Exit est appuyé (ExitGame, InputManager.cpp) ;
  // son menu (réglages, placement des écrans) s'ouvre par la combinaison de inGameMenuButtons.
  const rows: [string, string][] = [
    ['Flippers', list(['leftFlipper', 'rightFlipper'])],
    [t('Lanceur'), label('plunger')],
    [t('Crédit'), label('credit')],
    ['Start', label('start')],
    [t('Quitter la partie'), label('exit')],
    [t('Menu de VPX'), inGameMenuButtons(keys).map(label).join(' + ')],
  ];
  const optional = (title: string, ids: ButtonId[]) => {
    const present = ids.filter((id) => keys[id]);
    if (present.length) rows.push([title, list(present)]);
  };
  optional('MagnaSave', ['leftMagna', 'rightMagna']);
  optional('Extra Ball', ['extraBall']);
  optional('Tilt', ['tilt']);
  optional(t('Tremblements'), ['nudgeLeft', 'nudgeRight', 'nudgeCenter']);
  optional('Volume', ['volumeDown', 'volumeUp']);
  return rows;
}

/**
 * Aide-mémoire du réglage de l'affichage en partie (fiche > « Régler l'affichage en
 * partie ») : les boutons du menu de VPX, d'après InputManager.cpp (actions UIUp, UIDown,
 * UILeft, UIRight, puis Start, Credit1 et LaunchBall quand le menu est ouvert).
 */
export function displayKeys(buttons: CabinetButtons | undefined): [string, string][] {
  const keys = buttonKeys(buttons);
  const label = (id: ButtonId) => keyLabel(keys[id]);
  return [
    [t('Changer de ligne'), `${label('leftMagna')} / ${label('rightMagna')}`],
    [t('Régler'), `${label('leftFlipper')} / ${label('rightFlipper')}`],
    [t('Enregistrer : cette table ou toutes'), label('start')],
    [t('Annuler les changements'), label('credit')],
    [t('Valeur par défaut'), label('plunger')],
    [t('Page précédente, puis fermer'), label('exit')],
    [t('Rouvrir le menu'), inGameMenuButtons(keys).map(label).join(' + ')],
    [t('Quitter, menu fermé'), label('exit')],
  ];
}

/**
 * Boutons qui, appuyés ensemble, ouvrent le menu de VPX pendant une partie (action
 * InGameUI, F12 au clavier) : les deux MagnaSave, qui y choisissent ensuite la ligne
 * (UIUp, UIDown) ; sans eux, Crédit et Start. Dans ce menu, « Display Settings » place
 * et redimensionne en direct le fronton, le DMD et le topper, puis les enregistre pour
 * toutes les tables ou pour celle-ci seulement (docs/manuel.md, « Régler l'affichage en
 * partie »). Exit seul quitterait la partie : il n'entre dans aucune
 * combinaison.
 */
export function inGameMenuButtons(keys: CabinetButtons): ButtonId[] {
  return keys.leftMagna && keys.rightMagna ? ['leftMagna', 'rightMagna'] : ['credit', 'start'];
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
  get LeftStagedFlipper() { return t('Flipper gauche en deux temps'); },
  get RightStagedFlipper() { return t('Flipper droit en deux temps'); },
  get UIUp() { return t('Menu de VPX : élément suivant'); },
  get UIDown() { return t('Menu de VPX : élément précédent'); },
  get UILeft() { return t('Menu de VPX : diminuer'); },
  get UIRight() { return t('Menu de VPX : augmenter'); },
  get Credit2() { return t('Crédit 2'); },
  get Credit3() { return t('Crédit 3'); },
  get Credit4() { return t('Crédit 4'); },
  get Lockbar() { return t('Bouton de la lockbar'); },
  Pause: 'Pause',
  get PerfOverlay() { return t('Statistiques d’affichage'); },
  get InGameUI() { return t('Menu de VPX'); },
  SlamTilt: 'Slam Tilt',
  get CoinDoor() { return t('Porte du monnayeur'); },
  Reset: 'Reset',
  get VRCenter() { return t('Recentrer la VR'); },
  get VRUp() { return t('Monter la vue VR'); },
  get VRDown() { return t('Descendre la vue VR'); },
  get DebugBalls() { return t('Billes de débogage'); },
  get Debugger() { return t('Débogueur'); },
  get ToggleStereo() { return t('Mode stéréo'); },
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

/**
 * Valeur Mapping.* d'une action d'un bouton de la borne : les touches seules du clavier
 * remplacées par `keys` (withKeyboardKeys), le bouton de joystick `joystick` en tête. Les
 * boutons de joystick écrits la dernière fois (`before`) sont retirés, pour qu'un relevé
 * changé ne laisse pas l'ancien ; ceux ajoutés dans VPX sont gardés.
 */
export function withButtonMapping(current: string, keys: number[], joystick?: string, before?: string): string {
  const stale = new Set(parseMapping(before ?? '').filter((alt) => alt.length === 1 && joystickButton(alt[0]!)).map((alt) => alt[0]!));
  if (joystick) stale.add(joystick);
  const kept = parseMapping(current).filter((alt) => !(alt.length === 1 && stale.has(alt[0]!)));
  if (!joystick) return withKeyboardKeys(formatMapping(kept), keys);
  // Le joystick suffit : pas de « Key;0 » quand aucune touche du clavier ne reste.
  const rest = keys.length ? parseMapping(withKeyboardKeys(formatMapping(kept), keys)) : kept.filter((alt) => singleKey(alt) === undefined);
  return formatMapping([[joystick], ...rest]);
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
  const put = (action: string, keys: number[], joystick?: string) => {
    // Une valeur vide vaut la touche par défaut de VPX : elle est remplacée, rien à garder.
    const key = mappingKey(action);
    const current = doc.get(VPX_INPUT_SECTION, key) ?? '';
    settings.push({ section: VPX_INPUT_SECTION, key, value: withButtonMapping(current, keys, joystick, written[`${VPX_INPUT_SECTION}.${key}`]) });
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
    // Bouton de joystick : la touche du clavier de VPX reste aussi, sauf si un autre bouton l'a prise.
    const joystick = code !== undefined && joystickButton(code) ? code : undefined;
    for (const action of b.vpx) {
      driven.add(action);
      put(action, scancode !== undefined ? [scancode] : free(action, [VPX_INPUT_DEFAULTS[action]!]), joystick);
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
    if (action === IN_GAME_MENU) {
      settings.push(inGameMenuSetting(buttons, doc, written, kept));
      continue;
    }
    if (kept.length < keys.length) put(action, kept);
    // Plus de conflit : la touche de VPX revient.
    else if (ours) released.push({ section: VPX_INPUT_SECTION, key, value: '' });
  }
  return { settings, silenced, released };
}

/** Action de VPX qui ouvre son menu pendant une partie. */
const IN_GAME_MENU = 'InGameUI';

/**
 * Valeur de [Input] Mapping.InGameUI : ses touches seules du clavier (F12, sauf si un
 * bouton l'a prise), puis la combinaison des boutons de inGameMenuButtons. La combinaison
 * écrite la dernière fois (`before`) est retirée, pour qu'un changement de boutons ne
 * laisse pas l'ancienne ; manettes et combinaisons ajoutées dans VPX sont gardées.
 */
function inGameMenuMapping(buttons: CabinetButtons, current: string, before: string | undefined, keys: number[]): string {
  const combo = inGameMenuButtons(buttons).map((id) => mappingToken(buttons[id]!));
  const stale = new Set([formatMapping([combo]), ...parseMapping(before ?? '').filter((alt) => alt.length > 1).map((alt) => formatMapping([alt]))]);
  const others = parseMapping(current).filter((alt) => !stale.has(formatMapping([alt])));
  const base = parseMapping(withKeyboardKeys(formatMapping(others), keys)).filter((alt) => singleKey(alt) !== NO_KEY);
  return formatMapping([...base, combo]);
}

/**
 * [Input] Mapping.InGameUI pour ces boutons. Sans étape « Boutons », c'est la seule clé de
 * [Input] que Cyber Pinball écrit, avec les touches par défaut des encodeurs : régler
 * l'affichage en partie ne doit pas attendre le relevé des boutons (octobre 2026, borne
 * sans relevé : la combinaison n'était jamais écrite). `keys` : touches seules du clavier
 * gardées (F12, sauf si un bouton l'a prise) ; par défaut, celles de la valeur actuelle.
 */
export function inGameMenuSetting(buttons: CabinetButtons, doc: IniDocument, written: Record<string, string> = {}, keys?: number[]): VpxSetting {
  const key = mappingKey(IN_GAME_MENU);
  const current = doc.get(VPX_INPUT_SECTION, key);
  const before = written[`${VPX_INPUT_SECTION}.${key}`];
  const ours = before !== undefined && current === before;
  const kept = keys ?? keyboardKeys(ours ? undefined : current, IN_GAME_MENU);
  return { section: VPX_INPUT_SECTION, key, value: inGameMenuMapping(buttons, current ?? '', before, kept) };
}

/** Clés [Input] que Cyber Pinball écrit pour ces boutons, hors actions privées de leur touche (qui varient avec le fichier). */
export function vpxInputOwnedKeys(): string[] {
  return [...BUTTONS.flatMap((b) => b.vpx.map(mappingKey)), mappingKey(IN_GAME_MENU)];
}

/** Texte d'une valeur Mapping.* pour l'écran : « Maj gauche », « Maj gauche ou bouton de manette ». */
export function describeMapping(value: string | undefined, action: string): string {
  const text = value?.trim() ? value : VPX_INPUT_DEFAULTS[action] !== undefined ? `Key;${VPX_INPUT_DEFAULTS[action]}` : '';
  const parts = parseMapping(text).map((alt) => {
    const key = singleKey(alt);
    if (key === NO_KEY) return t('aucune touche');
    if (key !== undefined) return keyLabel(codeOfScancode(key) ?? `scancode ${key}`);
    if (alt.length === 1 && joystickButton(alt[0]!)) return keyLabel(alt[0]);
    if (alt.every((p) => KEY_TOKEN.test(p))) return alt.map((p) => keyLabel(codeOfScancode(Number(KEY_TOKEN.exec(p)![1])))).join(' + ');
    return alt.some((p) => p.startsWith('SDLJoy_')) ? t('bouton de manette') : alt.join(' + ');
  });
  return parts.length ? formatList(parts, 'or') : t('aucune touche');
}
