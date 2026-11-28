// Noms que le joueur donne aux boutons de sa borne.
//
// Un bouton de joystick n'a pour l'interface qu'un numéro (« Bouton 7 du joystick »), qui ne dit rien
// de sa place sur la borne. L'étape « Essai et noms des boutons » (app/src/button-test.ts) laisse
// nommer chaque bouton physique : un nom prêt (« Flipper gauche »), ou sa place et son repère
// (« Bouton rouge devant », « Bouton n° 2 sur la lockbar »). Le nom suit le bouton partout où
// l'interface le cite (keyLabel, buttons.ts) : relevé, récapitulatif, aide-mémoire, indications du
// front-end et de la partie.
//
// Les noms sont rangés par touche ou jeton de joystick, dans le modèle de la borne
// (Cabinet.buttonNames) : un même bouton physique garde son nom dans le jeu et dans l'interface. Le
// registre ci-dessous est celui de la configuration chargée (store.ts le remplit à chaque lecture et
// écriture du modèle), pour que tout appelant de keyLabel en profite sans rien lui passer.

import { t } from './i18n';

/** Nom de chaque bouton, par touche du clavier (KeyboardEvent.code) ou jeton de joystick de VPX. */
export type ButtonNames = Record<string, string>;

/** Longueur d'un nom : de quoi tenir sur une ligne de l'aide-mémoire. */
export const MAX_BUTTON_NAME = 40;

/** Noms de la configuration chargée (setButtonNames) : jamais modifié sur place. */
let current: Readonly<ButtonNames> = {};

/** Nom donné à ce bouton, ou undefined. */
export function buttonNameOf(code: string | undefined): string | undefined {
  return code ? current[code] : undefined;
}

/** Les noms de la configuration chargée ; vide sans noms. */
export function loadedButtonNames(): Readonly<ButtonNames> {
  return current;
}

/** Retient les noms de la configuration chargée (nettoyés : cleanButtonNames). */
export function setButtonNames(names: unknown): void {
  current = cleanButtonNames(names);
}

/**
 * Noms lisibles d'un fichier : chaînes rognées et tronquées à MAX_BUTTON_NAME, sans nom vide.
 * Un fichier abîmé ou écrit à la main ne doit jamais empêcher d'afficher les boutons.
 */
export function cleanButtonNames(raw: unknown): ButtonNames {
  const names: ButtonNames = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return names;
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_BUTTON_NAME).trim();
    if (code && name) names[code] = name;
  }
  return names;
}

/** `names` avec ce bouton nommé `name` (rien : sans nom). Un autre bouton qui portait ce nom le perd. */
export function withButtonName(names: ButtonNames | undefined, code: string, name: string | undefined): ButtonNames {
  const next = { ...cleanButtonNames(names) };
  const clean = name === undefined ? undefined : cleanButtonNames({ [code]: name })[code];
  if (!clean) {
    delete next[code];
    return next;
  }
  // Deux boutons de même nom ne se distinguent plus à l'écran : le second reprend le nom, le premier le perd.
  for (const [other, value] of Object.entries(next)) if (other !== code && value === clean) delete next[other];
  next[code] = clean;
  return next;
}

/** Noms prêts : ceux des rôles que tient un bouton d'une borne. */
export function readyNames(): string[] {
  return [
    t('Flipper gauche'),
    t('Flipper droit'),
    t('MagnaSave gauche'),
    t('MagnaSave droit'),
    'Start',
    t('Lanceur'),
    t('Crédit'),
    t('Fire (barre de verrouillage)'),
    'Extra Ball',
    'Exit',
    'Pause',
    t('Tremblement à gauche'),
    t('Tremblement à droite'),
    t('Tremblement vers l’avant'),
    t('Balancier de tilt'),
    t('Porte du monnayeur'),
  ];
}

/** Où se trouve le bouton sur la borne. */
export function positionChoices(): string[] {
  return [t('devant'), t('dessous'), t('à gauche'), t('à droite'), t('dessus'), t('sur la lockbar'), t('sur la porte'), t('sur le joystick')];
}

/** Ce qui le repère : sa couleur ou son numéro. */
export function markerChoices(): string[] {
  return [t('rouge'), t('vert'), t('bleu'), t('jaune'), t('blanc'), t('noir'), t('orange'), t('n° 1'), t('n° 2'), t('n° 3'), t('n° 4'), t('n° 5'), t('n° 6')];
}

/** « Bouton rouge devant » : son repère et sa place, dans l'ordre où la langue les dit. */
export function composedButtonName(marker: string, position: string): string {
  return t('Bouton {marker} {position}', { marker, position });
}
