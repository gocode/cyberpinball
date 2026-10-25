// Joysticks de la borne (Pinscape sur KL25Z, VirtuaPin, encodeurs en mode manette) lus
// par la bibliothèque SDL 3 de VPX lui-même (SDL364.dll ou SDL3.dll, à côté de
// VPinballX64.exe). VPX 10.8.1 nomme chaque bouton « SDLJoy_<GUID SDL>_<rang>;<bouton> »
// (src/input/SDLInputHandler.h, commit af26b2d93) : avec la même bibliothèque, initialisée
// de la même façon (SDL_INIT_JOYSTICK | SDL_INIT_GAMEPAD, aucune indication), Cyber Pinball
// voit les mêmes GUID, dans le même ordre, et les mêmes numéros de boutons. Ce que l'étape
// « Boutons » relève est donc exactement ce que VPX lira.
//
// Lecture par sondage (SDL_UpdateJoysticks, puis l'état de chaque bouton) : ni file
// d'événements ni pompe de messages, qui détournerait celle d'Electron. Les axes (lanceur
// analogique, accéléromètre du Pinscape) se lisent de même, numérotés comme dans VPX.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as koffi from 'koffi';
import { joystickDeviceIds } from '@cyberpinball/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

const SDL_INIT_JOYSTICK = 0x200;
const SDL_INIT_GAMEPAD = 0x2000;
const SDL_JOYSTICK_TYPE_GAMEPAD = 1;
/** Joystick quelconque : un Pinscape n'est pas une manette, ses axes n'ont ni gâchette ni repos imposé. */
const SDL_JOYSTICK_TYPE_UNKNOWN = 0;
/** Laisse lire les boutons quand aucune fenêtre de l'application n'a le focus (celle de VPX l'a). */
const HINT_BACKGROUND = 'SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS';

/** Nom de la bibliothèque SDL 3 livrée avec VPX, selon sa version. */
export const SDL_LIBRARY_NAMES = ['SDL364.dll', 'SDL3.dll'];

/** Bibliothèque SDL 3 du dossier de VPX, s'il en a une. */
export function sdlLibraryIn(dir: string): string | undefined {
  return SDL_LIBRARY_NAMES.map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
}

export interface JoystickDevice {
  /** Identifiant de VPX : « SDLJoy_<GUID>_<rang> ». */
  id: string;
  /** Nom donné par SDL (« mjrnet Pinscape Controller »). */
  name: string;
  buttons: number;
  axes: number;
}

export interface JoystickAxes {
  device: string;
  name: string;
  /** Valeur de chaque axe, de -1 à 1 : la valeur SDL divisée par 32768, comme VPX. */
  values: number[];
}

export interface JoystickButtonEvent {
  device: string;
  /** Numéro SDL du bouton, à partir de 0 (celui que VPX écrit). */
  button: number;
  down: boolean;
}

export interface JoystickReader {
  /** Version de SDL (« 3.4.14 »). */
  version: string;
  /** Joysticks branchés, relus à chaque appel. */
  devices(): JoystickDevice[];
  /** Boutons enfoncés ou relâchés depuis l'appel précédent ; suit les branchements. */
  poll(): JoystickButtonEvent[];
  /** Position des axes de chaque joystick, au dernier sondage (poll). */
  axes(): JoystickAxes[];
  /** Joystick virtuel de SDL (essais sans matériel) : son identifiant SDL. */
  attachVirtual(name: string, buttons: number, axes?: number): number;
  /** Appuie ou relâche un bouton d'un joystick virtuel. */
  pressVirtual(sdlId: number, button: number, down: boolean): void;
  /** Place un axe d'un joystick virtuel, de -1 à 1. */
  moveVirtual(sdlId: number, axis: number, value: number): void;
  close(): void;
}

interface Api {
  SDL_SetHint: NativeFn;
  SDL_InitSubSystem: NativeFn;
  SDL_QuitSubSystem: NativeFn;
  SDL_GetError: NativeFn;
  SDL_GetVersion: NativeFn;
  SDL_GetJoysticks: NativeFn;
  SDL_free: NativeFn;
  SDL_GetJoystickGUIDForID: NativeFn;
  SDL_GUIDToString: NativeFn;
  SDL_GetJoystickNameForID: NativeFn;
  SDL_OpenJoystick: NativeFn;
  SDL_CloseJoystick: NativeFn;
  SDL_GetNumJoystickButtons: NativeFn;
  SDL_GetJoystickButton: NativeFn;
  SDL_GetNumJoystickAxes: NativeFn;
  SDL_GetJoystickAxis: NativeFn;
  SDL_UpdateJoysticks: NativeFn;
  SDL_AttachVirtualJoystick: NativeFn;
  SDL_SetJoystickVirtualButton: NativeFn;
  SDL_SetJoystickVirtualAxis: NativeFn;
}

/** Bibliothèques déjà chargées : SDL ne s'initialise qu'une fois par processus. */
const loaded = new Map<string, Api>();
let structs: { guid: koffi.TypeObject; virtualDesc: koffi.TypeObject } | undefined;

function loadApi(dll: string): Api {
  const known = loaded.get(dll);
  if (known) return known;
  structs ??= {
    guid: koffi.struct('CP_SDL_GUID', { data: koffi.array('uint8', 16) }),
    // SDL_VirtualJoystickDesc (SDL_joystick.h, SDL 3.2 et suivants).
    virtualDesc: koffi.struct('CP_SDL_VirtualJoystickDesc', {
      version: 'uint32',
      type: 'uint16',
      padding: 'uint16',
      vendor_id: 'uint16',
      product_id: 'uint16',
      naxes: 'uint16',
      nbuttons: 'uint16',
      nballs: 'uint16',
      nhats: 'uint16',
      ntouchpads: 'uint16',
      nsensors: 'uint16',
      padding2: koffi.array('uint16', 2),
      button_mask: 'uint32',
      axis_mask: 'uint32',
      name: 'const char *',
      touchpads: 'void *',
      sensors: 'void *',
      userdata: 'void *',
      Update: 'void *',
      SetPlayerIndex: 'void *',
      Rumble: 'void *',
      RumbleTriggers: 'void *',
      SetLED: 'void *',
      SendEffect: 'void *',
      SetSensorsEnabled: 'void *',
      Cleanup: 'void *',
    }),
  };
  const lib = koffi.load(dll);
  const api: Api = {
    SDL_SetHint: lib.func('bool SDL_SetHint(const char *name, const char *value)'),
    SDL_InitSubSystem: lib.func('bool SDL_InitSubSystem(uint32 flags)'),
    SDL_QuitSubSystem: lib.func('void SDL_QuitSubSystem(uint32 flags)'),
    SDL_GetError: lib.func('const char *SDL_GetError()'),
    SDL_GetVersion: lib.func('int SDL_GetVersion()'),
    SDL_GetJoysticks: lib.func('void *SDL_GetJoysticks(_Out_ int *count)'),
    SDL_free: lib.func('void SDL_free(void *mem)'),
    SDL_GetJoystickGUIDForID: lib.func('CP_SDL_GUID SDL_GetJoystickGUIDForID(uint32 id)'),
    SDL_GUIDToString: lib.func('void SDL_GUIDToString(CP_SDL_GUID guid, _Out_ uint8 *text, int size)'),
    SDL_GetJoystickNameForID: lib.func('const char *SDL_GetJoystickNameForID(uint32 id)'),
    SDL_OpenJoystick: lib.func('void *SDL_OpenJoystick(uint32 id)'),
    SDL_CloseJoystick: lib.func('void SDL_CloseJoystick(void *joystick)'),
    SDL_GetNumJoystickButtons: lib.func('int SDL_GetNumJoystickButtons(void *joystick)'),
    SDL_GetJoystickButton: lib.func('bool SDL_GetJoystickButton(void *joystick, int button)'),
    SDL_GetNumJoystickAxes: lib.func('int SDL_GetNumJoystickAxes(void *joystick)'),
    SDL_GetJoystickAxis: lib.func('int16 SDL_GetJoystickAxis(void *joystick, int axis)'),
    SDL_UpdateJoysticks: lib.func('void SDL_UpdateJoysticks()'),
    SDL_AttachVirtualJoystick: lib.func('uint32 SDL_AttachVirtualJoystick(const CP_SDL_VirtualJoystickDesc *desc)'),
    SDL_SetJoystickVirtualButton: lib.func('bool SDL_SetJoystickVirtualButton(void *joystick, int button, bool down)'),
    SDL_SetJoystickVirtualAxis: lib.func('bool SDL_SetJoystickVirtualAxis(void *joystick, int axis, int16 value)'),
  };
  loaded.set(dll, api);
  return api;
}

interface Opened {
  sdlId: number;
  handle: unknown;
  id: string;
  name: string;
  /** État de chaque bouton au sondage précédent. */
  state: boolean[];
  axes: number;
}

/**
 * Ouvre les joysticks par la bibliothèque SDL `dll` (celle de VPX). Lève une erreur si
 * elle ne se charge pas ou que SDL refuse de démarrer.
 */
export function openJoysticks(dll: string): JoystickReader {
  const sdl = loadApi(dll);
  sdl.SDL_SetHint(HINT_BACKGROUND, '1');
  if (!sdl.SDL_InitSubSystem(SDL_INIT_JOYSTICK | SDL_INIT_GAMEPAD)) throw new Error(`SDL : ${sdl.SDL_GetError() as string}`);
  const v = sdl.SDL_GetVersion() as number;
  const version = `${Math.floor(v / 1_000_000)}.${Math.floor(v / 1000) % 1000}.${v % 1000}`;
  const opened = new Map<number, Opened>();
  let closed = false;

  /** Joysticks présents, dans l'ordre de SDL, avec l'identifiant que VPX leur donne. */
  function present(): { sdlId: number; id: string; name: string }[] {
    const count = [0];
    const list = sdl.SDL_GetJoysticks(count);
    if (!list) return [];
    try {
      const ids = count[0] ? [...(koffi.decode(list, koffi.array('uint32', count[0], 'Array')) as number[])] : [];
      const guids = ids.map((id) => {
        const text = Buffer.alloc(33);
        sdl.SDL_GUIDToString(sdl.SDL_GetJoystickGUIDForID(id), text, 33);
        return text.toString('latin1').replace(/\0.*$/s, '');
      });
      const settingIds = joystickDeviceIds(guids);
      return ids.map((sdlId, i) => ({ sdlId, id: settingIds[i]!, name: (sdl.SDL_GetJoystickNameForID(sdlId) as string | null) ?? '' }));
    } finally {
      sdl.SDL_free(list);
    }
  }

  /** Ouvre les joysticks branchés depuis, ferme ceux qui sont partis. */
  function follow(): void {
    const now = present();
    const ids = new Set(now.map((j) => j.sdlId));
    for (const [sdlId, j] of opened) {
      if (ids.has(sdlId)) continue;
      sdl.SDL_CloseJoystick(j.handle);
      opened.delete(sdlId);
    }
    for (const j of now) {
      const known = opened.get(j.sdlId);
      if (known) {
        // Un joystick parti avant celui-ci change de rang : VPX le renomme de même.
        known.id = j.id;
        continue;
      }
      const handle = sdl.SDL_OpenJoystick(j.sdlId);
      if (!handle) continue;
      const buttons = Math.max(0, sdl.SDL_GetNumJoystickButtons(handle) as number);
      const axes = Math.max(0, sdl.SDL_GetNumJoystickAxes(handle) as number);
      opened.set(j.sdlId, { ...j, handle, state: new Array<boolean>(buttons).fill(false), axes });
    }
  }

  let lastFollow = 0;
  /** Branchements relus au plus toutes les 2 s : SDL_GetJoysticks coûte plus qu'un sondage. */
  const FOLLOW_MS = 2000;

  follow();
  lastFollow = Date.now();

  return {
    version,
    devices() {
      if (closed) return [];
      follow();
      return [...opened.values()].map((j) => ({ id: j.id, name: j.name, buttons: j.state.length, axes: j.axes }));
    },
    poll() {
      if (closed) return [];
      sdl.SDL_UpdateJoysticks();
      if (Date.now() - lastFollow >= FOLLOW_MS) {
        follow();
        lastFollow = Date.now();
      }
      const events: JoystickButtonEvent[] = [];
      for (const j of opened.values()) {
        for (let button = 0; button < j.state.length; button++) {
          const down = Boolean(sdl.SDL_GetJoystickButton(j.handle, button));
          if (down === j.state[button]) continue;
          j.state[button] = down;
          events.push({ device: j.id, button, down });
        }
      }
      return events;
    },
    axes() {
      if (closed) return [];
      return [...opened.values()]
        .filter((j) => j.axes > 0)
        .map((j) => ({ device: j.id, name: j.name, values: Array.from({ length: j.axes }, (_, axis) => (sdl.SDL_GetJoystickAxis(j.handle, axis) as number) / 32768) }));
    },
    attachVirtual(name, buttons, axes = 0) {
      const desc = {
        version: koffi.sizeof(structs!.virtualDesc),
        type: axes > 0 ? SDL_JOYSTICK_TYPE_UNKNOWN : SDL_JOYSTICK_TYPE_GAMEPAD,
        padding: 0,
        vendor_id: 0,
        product_id: 0,
        naxes: axes,
        nbuttons: buttons,
        nballs: 0,
        nhats: 0,
        ntouchpads: 0,
        nsensors: 0,
        padding2: [0, 0],
        button_mask: 0,
        axis_mask: 0,
        name,
        touchpads: null,
        sensors: null,
        userdata: null,
        Update: null,
        SetPlayerIndex: null,
        Rumble: null,
        RumbleTriggers: null,
        SetLED: null,
        SendEffect: null,
        SetSensorsEnabled: null,
        Cleanup: null,
      };
      const sdlId = sdl.SDL_AttachVirtualJoystick(desc) as number;
      if (!sdlId) throw new Error(`SDL : ${sdl.SDL_GetError() as string}`);
      follow();
      lastFollow = Date.now();
      return sdlId;
    },
    pressVirtual(sdlId, button, down) {
      const j = opened.get(sdlId);
      if (!j || !sdl.SDL_SetJoystickVirtualButton(j.handle, button, down)) throw new Error(`SDL : ${sdl.SDL_GetError() as string}`);
    },
    moveVirtual(sdlId, axis, value) {
      const j = opened.get(sdlId);
      const raw = Math.max(-32768, Math.min(32767, Math.round(value * 32768)));
      if (!j || !sdl.SDL_SetJoystickVirtualAxis(j.handle, axis, raw)) throw new Error(`SDL : ${sdl.SDL_GetError() as string}`);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const j of opened.values()) sdl.SDL_CloseJoystick(j.handle);
      opened.clear();
      sdl.SDL_QuitSubSystem(SDL_INIT_JOYSTICK | SDL_INIT_GAMEPAD);
    },
  };
}
