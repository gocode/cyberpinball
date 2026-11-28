// Menus de Pinball FX Midnight aux boutons de la borne.
//
// Mesuré sur la PinCab (28/11/2026) : le menu pause de Midnight est une liste verticale que seules les
// flèches haut et bas parcourent (Entrée valide, Échap ouvre et ferme) ; gauche, droite et Maj n'y font
// rien. En partie, Maj lève les flippers et les flèches changent la vue de la table. Les flippers
// doivent donc être Maj en partie et haut/bas dans le menu. Le jeu ne dit pas dans quel état il est
// (pas de journal, pas de fenêtre en plus) : Cyber Pinball le déduit des boutons Exit/Pause, qui
// ouvrent et ferment le menu, et de Start/lanceur, qui valident (« Reprendre le jeu » en général).
import { buttonKeys, windowsVk, type ButtonsSource } from './buttons';
import type { ButtonId } from './model';
import { joystickKeysFor, zenGameKeys } from './pinballfx-cabinet';
import type { ZenGameKey } from './zen';

/** Touches des flippers dans le menu d'un jeu de Zen : haut et bas, que ses listes parcourent. */
export const ZEN_MENU_FLIPPER_KEYS: Readonly<Partial<Record<ButtonId, string>>> = {
  leftFlipper: 'ArrowUp',
  rightFlipper: 'ArrowDown',
};

/** Jeux de Zen dont le menu se parcourt aux flippers par haut et bas, seulement tant qu'il est ouvert. */
export function hasFlipperMenus(game?: ZenGameKey): boolean {
  return game === 'pinballfxmidnight';
}

/** Boutons qui ouvrent ou ferment le menu pause du jeu (Échap), puis ceux qui y valident (Entrée). */
const TOGGLE_ROLES: readonly ButtonId[] = ['exit', 'pause'];
const CONFIRM_ROLES: readonly ButtonId[] = ['start', 'plunger'];

/** Touches de chaque bouton de joystick tant que le menu est ouvert : celles de la partie, flippers en haut et bas. */
export function zenMenuJoystickKeys(source: ButtonsSource, game?: ZenGameKey): Map<string, string[]> {
  if (!hasFlipperMenus(game)) return new Map();
  const table = zenGameKeys(game);
  for (const [id, key] of Object.entries(ZEN_MENU_FLIPPER_KEYS) as [ButtonId, string][]) table[id] = [key];
  return joystickKeysFor(source, table);
}

/**
 * Flippers au clavier, menu ouvert : pour chacun, la flèche à envoyer en plus de sa touche (qui arrive
 * déjà au jeu et n'y fait rien dans le menu). Une touche sans code de Windows n'y est pas.
 */
export function zenMenuKeyboardEchoes(source: ButtonsSource, game?: ZenGameKey): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!hasFlipperMenus(game)) return map;
  const buttons = buttonKeys(source?.buttons);
  for (const [id, extra] of Object.entries(ZEN_MENU_FLIPPER_KEYS) as [ButtonId, string][]) {
    const code = buttons[id];
    if (!code || code.startsWith('SDLJoy_') || code === extra || windowsVk(code) === undefined) continue;
    map.set(code, [...new Set([...(map.get(code) ?? []), extra])]);
  }
  return map;
}

/** Boutons de Cyber Pinball qui suivent l'état du menu : à ouvrir ou fermer, à valider. Vides hors Midnight. */
export function zenMenuButtons(source: ButtonsSource, game?: ZenGameKey): { toggle: Set<string>; confirm: Set<string> } {
  const out = { toggle: new Set<string>(), confirm: new Set<string>() };
  if (!hasFlipperMenus(game)) return out;
  const buttons = buttonKeys(source?.buttons);
  for (const id of TOGGLE_ROLES) if (buttons[id]) out.toggle.add(buttons[id]!);
  for (const id of CONFIRM_ROLES) if (buttons[id]) out.confirm.add(buttons[id]!);
  return out;
}

/**
 * État du menu pause d'après les boutons : Exit ou Pause l'ouvre puis le ferme ; Start ou le lanceur,
 * menu ouvert, le ferment (« Reprendre le jeu » ; un sous-menu rouvert par Exit se retrouve juste).
 * Un état faux se corrige à l'appui suivant sur Exit.
 */
export class ZenMenuState {
  open = false;

  constructor(
    private readonly toggle: ReadonlySet<string>,
    private readonly confirm: ReadonlySet<string>,
  ) {}

  /** Bouton `code` appuyé ; rend vrai si le menu s'ouvre ou se ferme. */
  press(code: string): boolean {
    if (this.toggle.has(code)) {
      this.open = !this.open;
      return true;
    }
    if (this.open && this.confirm.has(code)) {
      this.open = false;
      return true;
    }
    return false;
  }
}
