// Pinball FX sur une vraie borne : ce que Cyber Pinball règle pour lui avant chaque partie, et
// comment les boutons de la borne lui parviennent (19/11/2026, essai sur un PinCab).
//
// Rotation : le jeu sait tourner son image (Options > Vidéo, « rotation forcée de l'affichage »),
// enregistrée dans %LOCALAPPDATA%\PinballFX\Saved\PersistentDownloadDir\<boutique>\LocalSettings.cfg
// (JSON, section « video » : useForcedDisplayRotation, forcedDisplayRotation « Rot_90 », « Rot_270 »…).
// Sans elle, le jeu dessine en paysage sur un playfield couché et tourné : la table n'est pas face au
// joueur. Cyber Pinball connaît le bord des flippers (layout.ts) : il y écrit la même rotation que
// celle de ses propres fenêtres du playfield, horaire, en degrés.
//
// Boutons : Pinball FX ne lit que le clavier et les manettes XInput, pas un joystick DirectInput
// (Pinscape, encodeur en mode manette). Pendant la partie, chaque bouton de joystick relevé par
// l'assistant est rendu au jeu sous la forme des touches de son clavier par défaut, avec les deux
// rôles qu'il a dans Cyber Pinball : bouton du jeu (flippers sur Maj gauche et droite, lanceur et
// Start sur Entrée, Exit sur Échap) et bouton de l'interface (Précédent et Suivant sur les flèches
// gauche et droite, Valider sur Entrée, Retour sur Échap), pour parcourir les menus du jeu comme
// la roue. Le jeu ne dit pas s'il est dans un menu ou en partie : un bouton aux deux rôles envoie
// les deux touches. Pas de touche de MagnaSave : Pinball FX n'a pas de commande à lui. Ses commandes
// réassignables (KeyMap_* de son exécutable, relevées le 19/11/2026) sont LeftFlipper, RightFlipper,
// BallLaunch, NudgeLeft, NudgeRight, NudgeForward, ChangeCamera, BackglassView, ToggleVisualMode et
// UsePowerup ; le MagnaSave de Black Knight 2000 se déclenche au lanceur. Les touches du clavier
// d'une borne arrivent déjà au jeu : rien n'est rejoué pour elles.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { buttonKeys, navigationButtons, type ButtonsSource } from './buttons';
import type { ButtonId, NavigationId, Rotation } from './model';

/** Valeur de forcedDisplayRotation pour une rotation horaire de l'image ; undefined : image droite, rien à forcer. */
export function pinballFxRotationValue(rotation: Rotation): string | undefined {
  return rotation === 0 ? undefined : `Rot_${rotation}`;
}

/**
 * Texte de LocalSettings.cfg avec la rotation forcée `rotation` ; undefined si rien ne change, si
 * l'image est déjà droite (le réglage du joueur est gardé) ou si le fichier n'est pas du JSON lisible.
 * Le reste du fichier est gardé tel quel, avec ses tabulations et ses fins de ligne.
 */
export function pinballFxSettingsWithRotation(text: string, rotation: Rotation): string | undefined {
  const value = pinballFxRotationValue(rotation);
  if (!value) return undefined;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
  const video = doc['video'] && typeof doc['video'] === 'object' && !Array.isArray(doc['video']) ? (doc['video'] as Record<string, unknown>) : {};
  if (video['useForcedDisplayRotation'] === true && video['forcedDisplayRotation'] === value) return undefined;
  doc['video'] = { ...video, useForcedDisplayRotation: true, forcedDisplayRotation: value };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(doc, null, '\t').replace(/\n/g, eol) + (/\r?\n$/.test(text) ? eol : '');
}

/** Fichiers de réglages de Pinball FX (un par boutique : Steam, Epic) sous %LOCALAPPDATA%. */
export function pinballFxLocalSettingsFiles(localAppData: string): string[] {
  const root = path.join(localAppData, 'PinballFX', 'Saved', 'PersistentDownloadDir');
  let dirs: string[];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  return dirs.map((d) => path.join(root, d, 'LocalSettings.cfg')).filter((f) => fs.existsSync(f));
}

export interface PinballFxRotationChange {
  file: string;
  /** Valeur écrite (« Rot_270 »). */
  value: string;
}

/**
 * Écrit la rotation de la borne dans les réglages de Pinball FX, avant la partie. Rend les fichiers
 * changés ; aucun si l'image est droite, si le jeu n'a encore jamais été ouvert (pas de fichier : il
 * l'écrira à sa première ouverture, la partie suivante le recevra) ou si tout est déjà réglé.
 */
export function applyPinballFxRotation(localAppData: string, rotation: Rotation): PinballFxRotationChange[] {
  const value = pinballFxRotationValue(rotation);
  if (!value) return [];
  const changed: PinballFxRotationChange[] = [];
  for (const file of pinballFxLocalSettingsFiles(localAppData)) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const next = pinballFxSettingsWithRotation(text, rotation);
    if (next === undefined) continue;
    writeFileAtomic(file, next);
    changed.push({ file, value });
  }
  return changed;
}

/** Touches du clavier (KeyboardEvent.code) des boutons du jeu dans les jeux de Zen. Pas de MagnaSave : voir plus haut. */
export const ZEN_GAME_KEYS: Readonly<Partial<Record<ButtonId, readonly string[]>>> = {
  leftFlipper: ['ShiftLeft'],
  rightFlipper: ['ShiftRight'],
  start: ['Enter'],
  plunger: ['Enter'],
  exit: ['Escape'],
  nudgeLeft: ['AltLeft'],
  nudgeRight: ['AltRight'],
  nudgeCenter: ['Space'],
};

/** Touches des boutons de l'interface dans les menus des jeux de Zen : les mêmes rôles que dans la roue. */
export const ZEN_NAVIGATION_KEYS: Readonly<Partial<Record<NavigationId, readonly string[]>>> = {
  previous: ['ArrowLeft'],
  next: ['ArrowRight'],
  confirm: ['Enter'],
  back: ['Escape'],
};

/** Bouton de joystick (jeton de VPX « SDLJoy_… »), pas une touche du clavier. */
function isJoystickCode(code: string | undefined): code is string {
  return typeof code === 'string' && code.startsWith('SDLJoy_');
}

/**
 * Pour chaque bouton de joystick de la borne, les touches à appuyer dans un jeu de Zen : celles de
 * son rôle dans le jeu et de son rôle dans l'interface (boutons de l'interface relevés, sinon
 * flippers, Start et Exit). Deux boutons peuvent donner la même touche (Start et lanceur : Entrée) ;
 * un bouton du clavier n'y est pas (il arrive déjà au jeu).
 */
export function zenJoystickKeys(source: ButtonsSource): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (code: string | undefined, keys: readonly string[]) => {
    if (isJoystickCode(code)) map.set(code, [...new Set([...(map.get(code) ?? []), ...keys])]);
  };
  const game = buttonKeys(source?.buttons);
  for (const [id, keys] of Object.entries(ZEN_GAME_KEYS) as [ButtonId, readonly string[]][]) add(game[id], keys);
  const nav = navigationButtons(source);
  for (const [id, keys] of Object.entries(ZEN_NAVIGATION_KEYS) as [NavigationId, readonly string[]][]) add(nav[id], keys);
  return map;
}

/**
 * Touches tenues d'après les boutons appuyés : compte, par touche, les boutons qui la tiennent. Une
 * touche partagée (Entrée de Start et du lanceur) n'est relâchée qu'au dernier bouton lâché.
 * `press` rend les touches à enfoncer ou à relâcher maintenant.
 */
export class ZenKeyPresser {
  private readonly holders = new Map<string, Set<string>>();

  constructor(private readonly keys: ReadonlyMap<string, readonly string[]>) {}

  press(button: string, down: boolean): { key: string; down: boolean }[] {
    const out: { key: string; down: boolean }[] = [];
    for (const key of this.keys.get(button) ?? []) {
      const set = this.holders.get(key) ?? new Set<string>();
      const before = set.size;
      if (down) set.add(button);
      else set.delete(button);
      this.holders.set(key, set);
      if (before === 0 && set.size > 0) out.push({ key, down: true });
      if (before > 0 && set.size === 0) out.push({ key, down: false });
    }
    return out;
  }

  /** Touches encore tenues, à relâcher à la fin de la partie (un bouton tenu pendant la fermeture). */
  releaseAll(): string[] {
    const held = [...this.holders].filter(([, set]) => set.size > 0).map(([key]) => key);
    this.holders.clear();
    return held;
  }
}
