// Commandes cliquables des étapes de l'assistant, hors relevé des boutons : chaque bouton de
// la borne qu'une étape lit (précédent, suivant, valider, retour, retour arrière) a son bouton
// à l'écran, avec ce qu'il fait et les touches qui font la même chose. Un clic fait exactement
// ce que ferait l'appui : il passe par le même traitement des touches (wizard.ts, handleKey),
// sous un code à part qu'aucun clavier ni joystick ne peut envoyer.
//
// Demande d'un joueur du 19/11/2026 : la première configuration se fait souvent au clavier et
// à la souris, en bureau à distance ; seuls les vrais boutons de la borne doivent être pressés
// sur la borne, pour être relevés.

import { formatList, keyLabel } from '@cyberpinball/core';

/** Rôles de touche qu'une étape lit, dans l'ordre où leurs boutons s'affichent. */
export const CONTROL_ROLES = ['back', 'previous', 'next', 'confirm', 'exit'] as const;
export type ControlRole = (typeof CONTROL_ROLES)[number];

/** Touches de chaque rôle (KEYS de wizard.ts) : la première est celle de la borne. */
export type ControlKeys = Record<ControlRole, readonly string[]>;

/** Un bouton de l'étape : son rôle et ce qu'il fait ici, en clair. */
export interface ControlSpec {
  role: ControlRole;
  label: string;
  /** L'action qui fait avancer (Valider, Enregistrer) : en évidence. Pas une réponse parmi d'autres. */
  primary?: boolean;
}

/** Ce que screen.js reçoit d'un clic sur une commande. */
export interface ControlAction {
  type: 'control';
  role: ControlRole;
}

const PREFIX = 'Clic:'; // i18n-ignore : code interne, jamais affiché

/** Code de l'appui que simule un clic : jamais celui d'une touche ni d'un bouton de joystick. */
export function controlCode(role: ControlRole): string {
  return `${PREFIX}${role}`;
}

export function isControlRole(value: unknown): value is ControlRole {
  return typeof value === 'string' && (CONTROL_ROLES as readonly string[]).includes(value);
}

/** Rôle d'un appui simulé par un clic ; undefined pour une vraie touche. */
export function controlRole(code: string): ControlRole | undefined {
  const role = code.startsWith(PREFIX) ? code.slice(PREFIX.length) : undefined;
  return isControlRole(role) ? role : undefined;
}

/**
 * Vrai si cet appui est l'une des touches du groupe, ou le clic sur la commande de ce groupe.
 * Le clic vaut même quand le groupe n'a aucune touche (Retour arrière pris par un bouton de la borne).
 */
export function pressedIn(code: string, group: readonly string[], keys: ControlKeys): boolean {
  if (group.includes(code)) return true;
  const role = controlRole(code);
  return role !== undefined && keys[role] === group;
}

/** Les deux premières touches d'un rôle, « Maj gauche ou ← » ; vide s'il n'en a aucune. */
export function keysLabel(codes: readonly string[]): string {
  return formatList([...new Set(codes)].slice(0, 2).map(keyLabel), 'or');
}

/**
 * Boutons d'une étape, dans l'ordre de CONTROL_ROLES (Revenir à gauche, l'action qui avance en évidence) :
 * chacun dit ce qu'il fait et sous quelles touches. Un rôle absent de `specs` n'a pas de bouton.
 */
export function controlActions(specs: readonly ControlSpec[], keys: ControlKeys) {
  return CONTROL_ROLES.flatMap((role) => {
    const spec = specs.find((s) => s.role === role);
    if (!spec) return [];
    const act: ControlAction = { type: 'control', role };
    return [{ id: role, label: spec.label, keys: keysLabel(keys[role]), act, selected: Boolean(spec.primary) }];
  });
}
