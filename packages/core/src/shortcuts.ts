// Raccourcis clavier de Cyber Pinball (combinaisons avec Ctrl, Maj, Alt) : une seule
// définition par raccourci, d'où viennent l'accélérateur d'Electron (raccourci global), la
// reconnaissance dans les fenêtres du menu (before-input-event) et ce qu'affichent le menu
// et l'aide-mémoire (« Ctrl+Maj+D »). Changer un raccourci ici change tout cela ensemble.

import { joystickButton, keyLabel } from './buttons';
import { t } from './i18n';

export interface Shortcut {
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Touche, par sa position (KeyboardEvent.code) : « KeyD ». */
  code: string;
}

export const SHORTCUTS = {
  /** Menu système > « Borne » > « Bureau Windows », et retour au menu depuis le bureau. */
  desktop: { control: true, shift: true, code: 'KeyD' },
  /** Arrêter une partie bloquée (pendant une partie seulement). */
  forceStop: { control: true, shift: true, code: 'KeyK' },
} as const satisfies Record<string, Shortcut>;

/** Accélérateur d'Electron (raccourci global de frontend.ts) : « Control+Shift+D ». */
export function accelerator(shortcut: Shortcut): string {
  const key = /^(?:Key|Digit)(.)$/.exec(shortcut.code)?.[1] ?? shortcut.code;
  return [...(shortcut.control ? ['Control'] : []), ...(shortcut.shift ? ['Shift'] : []), ...(shortcut.alt ? ['Alt'] : []), key].join('+');
}

/** Touches à afficher, une par touche cerclée : « Ctrl », « Maj », « D ». */
export function shortcutKeys(shortcut: Shortcut): string[] {
  return [...(shortcut.control ? ['Ctrl'] : []), ...(shortcut.shift ? [t('Maj')] : []), ...(shortcut.alt ? ['Alt'] : []), keyLabel(shortcut.code)];
}

/** Le raccourci en clair, sur une ligne : « Ctrl+Maj+D ». */
export function shortcutLabel(shortcut: Shortcut): string {
  return shortcutKeys(shortcut).join('+');
}

/**
 * Touche à montrer pour un raccourci des touches de l'interface (R, H : interfaceKeys) : la
 * première d'un clavier ; aucune si seul un bouton de joystick l'envoie, son nom (« Bouton 14
 * du joystick ») ne tenant pas dans une touche cerclée.
 */
export function shownKeys(codes: readonly string[]): string[] {
  const code = codes.find((c) => !joystickButton(c));
  return code ? [keyLabel(code)] : [];
}

/** Vrai si la touche appuyée (événement d'Electron ou du clavier) est ce raccourci, sans autre modificateur. */
export function matchesShortcut(input: { code: string; control?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }, shortcut: Shortcut): boolean {
  return (
    input.code === shortcut.code &&
    Boolean(input.control) === Boolean(shortcut.control) &&
    Boolean(input.shift) === Boolean(shortcut.shift) &&
    Boolean(input.alt) === Boolean(shortcut.alt) &&
    !input.meta
  );
}
