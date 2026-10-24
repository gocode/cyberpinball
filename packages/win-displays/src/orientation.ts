// Orientation d'un écran sous Windows (paysage, portrait, retournés), comme dans
// Paramètres > Affichage, par ChangeDisplaySettingsExW. Windows garde le réglage
// au redémarrage (CDS_UPDATEREGISTRY).
//
// DEVMODEW est lu et écrit octet par octet, comme les structures de index.ts.

import * as koffi from 'koffi';
import type { Rotation } from '@cyberpinball/core';

const ENUM_CURRENT_SETTINGS = 0xffffffff;
const CDS_UPDATEREGISTRY = 0x1;
const CDS_TEST = 0x2;
const DM_DISPLAYORIENTATION = 0x00000080;
const DM_PELSWIDTH = 0x00080000;
const DM_PELSHEIGHT = 0x00100000;

// DEVMODEW (wingdi.h), variante affichage de l'union.
const DEVMODE_SIZE = 220;
const OFFSET_SIZE = 68;
const OFFSET_FIELDS = 72;
const OFFSET_ORIENTATION = 84;
const OFFSET_PELS_WIDTH = 172;
const OFFSET_PELS_HEIGHT = 176;

/** DMDO_DEFAULT, DMDO_90, DMDO_180, DMDO_270 : les mêmes quarts de tour que DisplayConfig. */
const DMDO: Record<Rotation, number> = { 0: 0, 90: 1, 180: 2, 270: 3 };

// Codes DISP_CHANGE_* (winuser.h).
const DISP_CHANGE: Record<number, string> = {
  1: 'redémarrage nécessaire',
  [-1]: 'le pilote a refusé',
  [-2]: 'mode non pris en charge',
  [-3]: 'réglage non enregistré',
  [-4]: 'options invalides',
  [-5]: 'paramètre invalide',
  [-6]: 'mode double écran refusé',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

interface Api {
  EnumDisplaySettingsExW: NativeFn;
  ChangeDisplaySettingsExW: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  api = {
    EnumDisplaySettingsExW: user32.func(
      'bool __stdcall EnumDisplaySettingsExW(const char16_t *device, uint32_t mode, void *devMode, uint32_t flags)',
    ),
    ChangeDisplaySettingsExW: user32.func(
      'long __stdcall ChangeDisplaySettingsExW(const char16_t *device, void *devMode, void *hwnd, uint32_t flags, void *param)',
    ),
  };
  return api;
}

function currentMode(w: Api, gdiName: string): Buffer {
  const mode = Buffer.alloc(DEVMODE_SIZE);
  mode.writeUInt16LE(DEVMODE_SIZE, OFFSET_SIZE);
  if (!w.EnumDisplaySettingsExW(gdiName, ENUM_CURRENT_SETTINGS, mode, 0)) {
    throw new Error(`Écran ${gdiName} introuvable : Windows ne donne pas son mode d'affichage.`);
  }
  return mode;
}

function orientationOf(mode: Buffer): Rotation {
  const dmdo = mode.readUInt32LE(OFFSET_ORIENTATION);
  return ((dmdo & 3) * 90) as Rotation;
}

/** Mode à demander : seules l'orientation et la définition changent, Windows garde le reste. */
function modeFor(current: Buffer, rotation: Rotation): Buffer {
  const mode = Buffer.from(current);
  const width = current.readUInt32LE(OFFSET_PELS_WIDTH);
  const height = current.readUInt32LE(OFFSET_PELS_HEIGHT);
  // Au quart de tour, la largeur et la hauteur de l'image s'échangent.
  const swap = (orientationOf(current) - rotation) % 180 !== 0;
  mode.writeUInt32LE(DM_DISPLAYORIENTATION | DM_PELSWIDTH | DM_PELSHEIGHT, OFFSET_FIELDS);
  mode.writeUInt32LE(DMDO[rotation], OFFSET_ORIENTATION);
  mode.writeUInt32LE(swap ? height : width, OFFSET_PELS_WIDTH);
  mode.writeUInt32LE(swap ? width : height, OFFSET_PELS_HEIGHT);
  return mode;
}

function change(w: Api, gdiName: string, mode: Buffer, flags: number): number {
  return w.ChangeDisplaySettingsExW(gdiName, mode, null, flags, null) as number;
}

function describe(code: number): string {
  return `${DISP_CHANGE[code] ?? 'erreur inconnue'}, code ${code}`;
}

/** Orientation actuelle d'un écran, désigné par son nom GDI (« \\.\DISPLAY13 »). */
export function displayOrientation(gdiName: string): Rotation {
  if (process.platform !== 'win32') throw new Error("L'orientation des écrans ne se règle que sous Windows.");
  return orientationOf(currentMode(loadApi(), gdiName));
}

/**
 * Change l'orientation d'un écran et renvoie celle qu'il avait. Windows essaie
 * d'abord le mode à blanc (CDS_TEST) ; après l'application, l'orientation est
 * relue, et si elle n'est pas celle demandée, l'écran revient à son orientation
 * d'origine et une erreur explique pourquoi.
 */
export function setDisplayOrientation(gdiName: string, rotation: Rotation): Rotation {
  if (process.platform !== 'win32') throw new Error("L'orientation des écrans ne se règle que sous Windows.");
  const w = loadApi();
  const original = currentMode(w, gdiName);
  const before = orientationOf(original);
  if (before === rotation) return before;

  const wanted = modeFor(original, rotation);
  const tested = change(w, gdiName, wanted, CDS_TEST);
  if (tested !== 0) throw new Error(`Windows refuse de tourner l'écran ${gdiName} (${describe(tested)}).`);

  const applied = change(w, gdiName, wanted, CDS_UPDATEREGISTRY);
  const after = orientationOf(currentMode(w, gdiName));
  if (applied === 0 && after === rotation) return before;

  // Windows a refusé ou fait autre chose : on remet l'écran comme il était.
  const restored = after === before ? 0 : change(w, gdiName, modeFor(currentMode(w, gdiName), before), CDS_UPDATEREGISTRY);
  const reason = applied !== 0 ? describe(applied) : `orientation relue : ${after}° au lieu de ${rotation}°`;
  const state = restored === 0 ? `orientation d'origine (${before}°) rétablie` : `orientation d'origine non rétablie (${describe(restored)})`;
  throw new Error(`Windows n'a pas tourné l'écran ${gdiName} (${reason}) ; ${state}.`);
}
