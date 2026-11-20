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
// l'assistant envoie la touche que le jeu attend pour son rôle (ZEN_GAME_KEYS). Ses touches ne sont
// pas celles des encodeurs de VPX : son écran Options > Contrôles > Clavier, relevé sur un PinCab le
// 19/11/2026, donne Flipper gauche Maj gauche, Flipper droit Maj droite, Lance-billes Entrée,
// Ut. pouvoir S, Décaler à gauche Alt gauche, Décaler à droite Alt droite, Décaler vers l'avant
// Espace, Modifier caméra C, Activer mode visuel G, Vue fronton Haut, Tir gauche et Tir droit
// (Judge Dredd) Ctrl gauche et Bas ; pas de MagnaSave. Ses menus se parcourent aux flippers (barre
// du haut), aux flèches haut et bas (fenêtres qu'elle ouvre : les MagnaSave de la borne), Entrée pour
// valider, Échap pour revenir. Les boutons de volume restent à Cyber Pinball (son de Windows). Les
// touches du clavier d'une borne arrivent déjà au jeu : rien n'est rejoué pour elles.
//
// Pinball FX3 (« Pinball FX Classic ») reçoit les mêmes touches (essai sur un PinCab le 19/11/2026 :
// en partie, flippers, Start et MagnaSave répondent), mais ses menus se parcourent aux flèches gauche
// et droite, sur lesquelles Maj ne fait rien. Sans elles, impossible d'atteindre l'icône de borne pour
// activer son mode borne. Ses flippers envoient donc aussi la flèche de leur côté (PINBALLFX3_EXTRA_KEYS).
// Sur une borne au clavier (encodeur clavier, clavier), la touche du flipper arrive seule au jeu : bonne
// en partie, sans effet dans les menus (retour d'un joueur, 20/11/2026). Cyber Pinball lit alors ces
// touches pendant la partie et envoie la flèche en plus (zenKeyboardEchoes, app/src/zen-keys.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { buttonKeys, windowsVk, type ButtonsSource } from './buttons';
import type { ButtonId, Rotation } from './model';
import type { ZenGameKey } from './zen';

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

/**
 * Touche (KeyboardEvent.code) que les jeux de Zen reçoivent pour chaque bouton de la borne, d'après
 * leurs commandes par défaut (voir plus haut). Start et lanceur valident (Entrée), Exit et Pause
 * reviennent ou ouvrent la pause (Échap), les MagnaSave montent et descendent dans les fenêtres du
 * jeu (en partie : Vue fronton et Tir droit de Judge Dredd). Crédit, porte du monnayeur, tilt : le jeu
 * n'a pas de commande pour eux. Volume : reste à Cyber Pinball.
 */
export const ZEN_GAME_KEYS: Readonly<Partial<Record<ButtonId, string>>> = {
  leftFlipper: 'ShiftLeft',
  rightFlipper: 'ShiftRight',
  plunger: 'Enter',
  start: 'Enter',
  exit: 'Escape',
  pause: 'Escape',
  leftMagna: 'ArrowUp',
  rightMagna: 'ArrowDown',
  nudgeLeft: 'AltLeft',
  nudgeRight: 'AltRight',
  nudgeCenter: 'Space',
};

/**
 * Touches de plus pour Pinball FX3 : les flèches gauche et droite parcourent ses menus, où Maj ne
 * fait rien ; en partie, Maj lève toujours les flippers.
 */
export const PINBALLFX3_EXTRA_KEYS: Readonly<Partial<Record<ButtonId, string>>> = {
  leftFlipper: 'ArrowLeft',
  rightFlipper: 'ArrowRight',
};

/** Touches d'un rôle dans le jeu de Zen `game` (sans jeu précisé : celles de Pinball FX). */
export function zenGameKeys(game?: ZenGameKey): Partial<Record<ButtonId, string[]>> {
  const out: Partial<Record<ButtonId, string[]>> = {};
  const add = (keys: Readonly<Partial<Record<ButtonId, string>>>) => {
    for (const [id, key] of Object.entries(keys) as [ButtonId, string][]) out[id] = [...(out[id] ?? []), key];
  };
  add(ZEN_GAME_KEYS);
  if (game === 'pinballfx3') add(PINBALLFX3_EXTRA_KEYS);
  return out;
}

/** Bouton de joystick (jeton de VPX « SDLJoy_… »), pas une touche du clavier. */
function isJoystickCode(code: string | undefined): code is string {
  return typeof code === 'string' && code.startsWith('SDLJoy_');
}

/**
 * Pour chaque bouton de joystick de la borne, les touches à appuyer dans le jeu de Zen `zenGame` : celles
 * de son rôle en jeu (zenGameKeys ; relevé de l'étape « Boutons », qui ne donne jamais un bouton à deux rôles ; relevé
 * incohérent : touches par défaut, rien à rejouer). Un bouton du clavier n'y est pas (il arrive déjà au jeu).
 */
export function zenJoystickKeys(source: ButtonsSource, zenGame?: ZenGameKey): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const game = buttonKeys(source?.buttons);
  for (const [id, keys] of Object.entries(zenGameKeys(zenGame)) as [ButtonId, string[]][]) {
    const code = game[id];
    if (isJoystickCode(code)) map.set(code, [...new Set([...(map.get(code) ?? []), ...keys])]);
  }
  return map;
}

/**
 * Borne au clavier dans Pinball FX3 : pour chaque flipper relevé au clavier (KeyboardEvent.code), les
 * touches à envoyer en plus de la sienne, qui arrive déjà au jeu (la flèche de son côté, pour les
 * menus). Vide pour un autre jeu, pour un flipper de joystick (zenJoystickKeys envoie déjà les deux)
 * et pour une touche sans code de Windows ou qui est déjà cette flèche.
 */
export function zenKeyboardEchoes(source: ButtonsSource, zenGame?: ZenGameKey): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (zenGame !== 'pinballfx3') return map;
  const game = buttonKeys(source?.buttons);
  for (const [id, extra] of Object.entries(PINBALLFX3_EXTRA_KEYS) as [ButtonId, string][]) {
    const code = game[id];
    if (!code || isJoystickCode(code) || code === extra || windowsVk(code) === undefined) continue;
    map.set(code, [...new Set([...(map.get(code) ?? []), extra])]);
  }
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
