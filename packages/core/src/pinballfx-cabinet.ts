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
// (Pinscape, encodeur en mode manette). Il est pensé pour les bornes à encodeur clavier : ses menus
// se parcourent avec les touches qu'un encodeur envoie (flippers sur Maj pour la barre du haut,
// MagnaSave sur Ctrl dans les fenêtres qu'elle ouvre ; essai sur un PinCab, 19/11/2026). Pendant la
// partie, chaque bouton de joystick relevé par l'assistant envoie donc la touche par défaut des
// encodeurs pour son rôle en jeu, celle que VPX lit aussi (BUTTONS de buttons.ts) : la borne se
// comporte comme une borne à encodeur clavier, en partie comme dans les menus du jeu. Les boutons
// de l'interface de Cyber Pinball n'y jouent aucun rôle : leurs touches de la roue (flèches, Entrée)
// ne pilotent pas ces menus. Les boutons de volume restent à Cyber Pinball (son de Windows). Les
// touches du clavier d'une borne arrivent déjà au jeu : rien n'est rejoué pour elles.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { BUTTONS, buttonKeys, type ButtonsSource } from './buttons';
import type { ButtonId, Rotation } from './model';

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

/** Boutons qui restent à Cyber Pinball pendant la partie : le son de toute la borne (cabinetvolume.ts). */
const KEPT_BY_CYBER_PINBALL: ReadonlySet<ButtonId> = new Set<ButtonId>(['volumeDown', 'volumeUp', 'volumeMute']);

/**
 * Touche (KeyboardEvent.code) que les jeux de Zen reçoivent pour chaque bouton du jeu : celle des
 * encodeurs de borne (Maj pour les flippers, Ctrl pour les MagnaSave, 1 pour Start, Entrée pour le
 * lanceur, Échap pour Exit…), la même que VPX.
 */
export const ZEN_GAME_KEYS: Readonly<Partial<Record<ButtonId, string>>> = Object.fromEntries(
  BUTTONS.filter((b) => b.default && !KEPT_BY_CYBER_PINBALL.has(b.id)).map((b) => [b.id, b.default!]),
);

/** Bouton de joystick (jeton de VPX « SDLJoy_… »), pas une touche du clavier. */
function isJoystickCode(code: string | undefined): code is string {
  return typeof code === 'string' && code.startsWith('SDLJoy_');
}

/**
 * Pour chaque bouton de joystick de la borne, les touches à appuyer dans un jeu de Zen : celle de son
 * rôle en jeu (relevé de l'étape « Boutons », qui ne donne jamais un bouton à deux rôles ; relevé
 * incohérent : touches par défaut, rien à rejouer). Un bouton du clavier n'y est pas (il arrive déjà au jeu).
 */
export function zenJoystickKeys(source: ButtonsSource): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const game = buttonKeys(source?.buttons);
  for (const [id, key] of Object.entries(ZEN_GAME_KEYS) as [ButtonId, string][]) {
    const code = game[id];
    if (isJoystickCode(code)) map.set(code, [...new Set([...(map.get(code) ?? []), key])]);
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
