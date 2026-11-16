// Touches modificatrices d'un clavier (Ctrl, Maj, Alt, Windows) qui sont aussi des boutons du menu
// (Maj gauche et droite : les flippers ; Ctrl gauche et droit : les MagnaSave), dans un raccourci
// de Cyber Pinball (Ctrl+Maj+D, Ctrl+Maj+K, Ctrl+Q).
//
// 16/11/2026 : Ctrl+Maj+D déplaçait la sélection avant d'ouvrir le bureau. Ctrl gauche, appuyé le
// premier, changeait de collection sur la roue ; Maj gauche reculait d'une table ou d'une ligne.
// L'appui d'une touche modificatrice attend donc un court instant (CHORD_HOLD_MS) : relâchée
// seule, ou tenue au-delà, elle agit comme avant ; suivie d'un raccourci, elle n'agit pas.
//
// Ce qui ne change pas :
// - une touche qui n'est pas modificatrice (Start, Exit, les boutons de joystick, qui ne passent
//   pas par ici) agit dès son appui ;
// - un modificateur suivi d'une autre touche que d'un raccourci (Maj puis une lettre dans une
//   saisie) agit, juste avant elle, dans l'ordre des appuis ;
// - des modificateurs tenus ensemble sans autre touche (la combinaison de déverrouillage du mode
//   invité : les deux flippers et les deux MagnaSave) arrivent tous, dans l'ordre, une fois tenus
//   CHORD_HOLD_MS : ils sont bien vus enfoncés ensemble.

/** Ce que le filtre lit d'un appui (Input d'Electron, ou la même chose pour les essais). */
export interface ChordKey {
  type: string;
  code: string;
  isAutoRepeat?: boolean;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** Délai d'un modificateur appuyé seul avant d'agir s'il reste tenu (un relâchement agit tout de suite). */
export const CHORD_HOLD_MS = 300;

type Flag = 'control' | 'shift' | 'alt' | 'meta';

const MODIFIER_FLAG: Readonly<Record<string, Flag>> = {
  ControlLeft: 'control',
  ControlRight: 'control',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  AltLeft: 'alt',
  AltRight: 'alt',
  MetaLeft: 'meta',
  MetaRight: 'meta',
};

/** Vrai pour une touche modificatrice (Ctrl, Maj, Alt, Windows, à gauche ou à droite). */
export function isModifierCode(code: string): boolean {
  return code in MODIFIER_FLAG;
}

export interface ModifierChordsOptions<E extends ChordKey> {
  /** L'appui, remis au menu ; vrai s'il a été traité. */
  down(input: E): boolean;
  /** Le relâchement, remis au menu. */
  up(input: E): void;
  /** Vrai si cet appui (touche ordinaire, modificateurs tenus) est un raccourci de Cyber Pinball. */
  isShortcut(input: E): boolean;
  holdMs?: number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export interface ModifierChords<E extends ChordKey> {
  /** Un appui du clavier ; vrai s'il a été traité (un modificateur en attente l'est : la page ne le voit pas). */
  down(input: E): boolean;
  /** Un relâchement du clavier. */
  up(input: E): void;
}

interface Held<E> {
  input: E;
  /** waiting : pas encore remis ; passed : remis, ses répétitions et son relâchement suivent ; dropped : partie d'un raccourci, rien ne suit. */
  state: 'waiting' | 'passed' | 'dropped';
}

export function createModifierChords<E extends ChordKey>(options: ModifierChordsOptions<E>): ModifierChords<E> {
  const holdMs = options.holdMs ?? CHORD_HOLD_MS;
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as NodeJS.Timeout));
  /** Modificateurs enfoncés, dans l'ordre de leurs appuis. */
  const held = new Map<string, Held<E>>();
  let timer: unknown;

  const stopTimer = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  };

  /**
   * Remet, dans l'ordre, les modificateurs en attente. `still` : l'appui qui les suit ; un
   * modificateur que ses drapeaux ne disent plus enfoncé (relâchement perdu : fenêtre quittée)
   * est oublié au lieu d'agir.
   */
  const flush = (still?: E) => {
    stopTimer();
    for (const [code, h] of held) {
      if (h.state !== 'waiting') continue;
      if (still && !still[MODIFIER_FLAG[code]!]) {
        held.delete(code);
        continue;
      }
      h.state = 'passed';
      options.down(h.input);
    }
  };

  return {
    down(input) {
      if (isModifierCode(input.code)) {
        const h = held.get(input.code);
        if (input.isAutoRepeat && h) return h.state === 'passed' ? options.down(input) : true;
        // Appui neuf d'une touche déjà notée : son relâchement s'est perdu, l'ancien appui est oublié.
        if (h) held.delete(input.code);
        held.set(input.code, { input, state: 'waiting' });
        // Chaque modificateur de plus repart pour un délai entier : Ctrl, puis Maj, puis D.
        stopTimer();
        timer = setTimer(() => {
          timer = undefined;
          flush();
        }, holdMs);
        return true;
      }
      if (options.isShortcut(input)) {
        // Les modificateurs du raccourci n'agissent pas : ni leur appui, ni leurs répétitions, ni leur relâchement.
        stopTimer();
        for (const h of held.values()) if (h.state === 'waiting') h.state = 'dropped';
        return options.down(input);
      }
      flush(input);
      return options.down(input);
    },
    up(input) {
      const h = held.get(input.code);
      if (!h) return options.up(input);
      // Relâché avant le délai : il agit maintenant, après ceux appuyés avant lui.
      if (h.state === 'waiting') flush();
      held.delete(input.code);
      if (h.state === 'dropped') return;
      options.up(input);
    },
  };
}
