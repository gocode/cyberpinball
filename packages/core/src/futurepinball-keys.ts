// Boutons de la borne rendus à Future Pinball (20/11/2026). Le jeu ne lit que le clavier (DirectInput),
// avec les touches de ses préférences (Préférences > Touches), gardées dans le registre en codes de
// balayage DirectInput (HKCU\Software\Future Pinball\GamePlayer : LeftFlipperKey = 42, Maj gauche…).
// Une borne dont les boutons sont des boutons de joystick (Pinscape, encodeur en mode manette) ne
// pouvait donc rien faire en partie : premier essai réel, PinCab du 20/11/2026, « aucun bouton ne
// fonctionne ». Ici : la touche de chaque rôle d'après ces préférences, pour le relais des boutons de
// joystick (app/src/zen-keys.ts), comme pour les jeux de Zen.

import type { ButtonsSource } from './buttons';
import type { ButtonId } from './model';
import { joystickKeysFor } from './pinballfx-cabinet';

/** Clé du registre des préférences du jeu (sous HKEY_CURRENT_USER). */
export const FUTURE_PINBALL_PLAYER_KEY = 'Software\\Future Pinball\\GamePlayer';

/**
 * Valeur du registre de chaque rôle, et la touche du jeu quand elle manque (ses réglages d'origine,
 * en codes DirectInput). Les MagnaSave sont les « Special » du jeu. Exit : Échap, qui quitte la table
 * (et le jeu, lancé avec /exit) ; ce n'est pas un réglage du jeu.
 */
export const FUTURE_PINBALL_KEY_VALUES: Readonly<Partial<Record<ButtonId, { value: string; default: number }>>> = {
  leftFlipper: { value: 'LeftFlipperKey', default: 42 },
  rightFlipper: { value: 'RightFlipperKey', default: 54 },
  plunger: { value: 'PlungerKey', default: 28 },
  start: { value: 'StartGameKey', default: 2 },
  credit: { value: 'InsertCoinKey', default: 6 },
  nudgeLeft: { value: 'NudgeLeftKey', default: 44 },
  nudgeRight: { value: 'NudgeRightKey', default: 53 },
  nudgeCenter: { value: 'NudgeUpKey', default: 57 },
  leftMagna: { value: 'Special1Key', default: 30 },
  rightMagna: { value: 'Special2Key', default: 40 },
};

/**
 * Codes de balayage DirectInput (jeu 1 du clavier PC, DIK_*) vers KeyboardEvent.code, la forme des
 * touches dans Cyber Pinball. Ceux du bloc étendu ont 0x80 de plus (DIK_RCONTROL = 0x9D).
 */
const DIK: Readonly<Record<number, string>> = (() => {
  const map: Record<number, string> = {
    0x01: 'Escape', 0x0c: 'Minus', 0x0d: 'Equal', 0x0e: 'Backspace', 0x0f: 'Tab',
    0x1a: 'BracketLeft', 0x1b: 'BracketRight', 0x1c: 'Enter', 0x1d: 'ControlLeft',
    0x27: 'Semicolon', 0x28: 'Quote', 0x29: 'Backquote', 0x2a: 'ShiftLeft', 0x2b: 'Backslash',
    0x33: 'Comma', 0x34: 'Period', 0x35: 'Slash', 0x36: 'ShiftRight', 0x37: 'NumpadMultiply',
    0x38: 'AltLeft', 0x39: 'Space', 0x3a: 'CapsLock',
    0x45: 'NumLock', 0x46: 'ScrollLock', 0x4a: 'NumpadSubtract', 0x4e: 'NumpadAdd', 0x53: 'NumpadDecimal', 0x56: 'IntlBackslash',
    0x9c: 'NumpadEnter', 0x9d: 'ControlRight', 0xb5: 'NumpadDivide', 0xb8: 'AltRight',
    0xc7: 'Home', 0xc8: 'ArrowUp', 0xc9: 'PageUp', 0xcb: 'ArrowLeft', 0xcd: 'ArrowRight', 0xcf: 'End',
    0xd0: 'ArrowDown', 0xd1: 'PageDown', 0xd2: 'Insert', 0xd3: 'Delete',
  };
  // Chiffres 1 à 9 puis 0 (0x02 à 0x0B).
  '1234567890'.split('').forEach((d, i) => (map[0x02 + i] = `Digit${d}`));
  // Lettres, rangée par rangée.
  const rows: [number, string][] = [[0x10, 'QWERTYUIOP'], [0x1e, 'ASDFGHJKL'], [0x2c, 'ZXCVBNM']];
  for (const [start, letters] of rows) letters.split('').forEach((l, i) => (map[start + i] = `Key${l}`));
  // F1 à F10 (0x3B à 0x44), F11 et F12.
  for (let i = 0; i < 10; i++) map[0x3b + i] = `F${i + 1}`;
  map[0x57] = 'F11';
  map[0x58] = 'F12';
  // Pavé numérique.
  const pad: [number, string][] = [[0x47, '7'], [0x48, '8'], [0x49, '9'], [0x4b, '4'], [0x4c, '5'], [0x4d, '6'], [0x4f, '1'], [0x50, '2'], [0x51, '3'], [0x52, '0']];
  for (const [code, d] of pad) map[code] = `Numpad${d}`;
  return map;
})();

/** Touche (KeyboardEvent.code) d'un code de balayage DirectInput ; undefined pour un code inconnu. */
export function dikToCode(dik: number): string | undefined {
  return DIK[dik];
}

/**
 * Touches de chaque rôle dans Future Pinball, d'après ses préférences (`read` : la valeur du registre,
 * undefined si elle manque, ses réglages d'origine prennent alors sa place). Un code inconnu laisse le
 * rôle sans touche, plutôt qu'une touche fausse.
 */
export function futurePinballGameKeys(read: (value: string) => unknown): Partial<Record<ButtonId, string[]>> {
  const out: Partial<Record<ButtonId, string[]>> = { exit: ['Escape'] };
  for (const [id, spec] of Object.entries(FUTURE_PINBALL_KEY_VALUES) as [ButtonId, { value: string; default: number }][]) {
    const raw = read(spec.value);
    const dik = typeof raw === 'number' && Number.isInteger(raw) ? raw : spec.default;
    const code = dikToCode(dik);
    if (code) out[id] = [code];
  }
  return out;
}

/** Pour chaque bouton de joystick de la borne, les touches à appuyer dans Future Pinball. */
export function futurePinballJoystickKeys(source: ButtonsSource, read: (value: string) => unknown): Map<string, string[]> {
  return joystickKeysFor(source, futurePinballGameKeys(read));
}
