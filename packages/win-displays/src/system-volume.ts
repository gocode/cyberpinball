// Volume des sorties audio de Windows, par Core Audio (IMMDeviceEnumerator, IAudioEndpointVolume) :
// le réglage que règle la barre des tâches, pour tout ce qui joue sur la sortie (VPX, PinMAME, PuP,
// B2S, le menu). Les boutons de volume de la borne le lisent et l'écrivent (packages/core/src/
// cabinetvolume.ts, app/src/cabinet-volume.ts).
//
// Les interfaces COM sont appelées par leur table de méthodes (koffi.call), indices de
// mmdeviceapi.h et endpointvolume.h. Chaque appel ouvre et relâche ses objets : un appui de bouton
// de temps en temps, rien à garder ouvert.

import * as koffi from 'koffi';

/** Une sortie audio : identifiant de point de terminaison (IMMDevice::GetId), niveau de 0 à 1, coupée ou non. */
export interface EndpointVolume {
  id: string;
  level: number;
  muted: boolean;
}

const CLSCTX_ALL = 0x17;
const COINIT_APARTMENTTHREADED = 0x2;
const E_RENDER = 0;
const E_CONSOLE = 0;
const CLSID_MMDEVICE_ENUMERATOR = 'BCDE0395-E52F-467C-8E3D-C4579291692E';
const IID_IMMDEVICE_ENUMERATOR = 'A95664D2-9614-4F35-A746-DE8DB63617E6';
const IID_IAUDIO_ENDPOINT_VOLUME = '5CDF2C82-841E-4546-9722-0CF74078229A';

// Indices dans la table de méthodes (IUnknown : 0 QueryInterface, 1 AddRef, 2 Release).
const RELEASE = 2;
const ENUM_GET_DEFAULT = 4;
const ENUM_GET_DEVICE = 5;
const DEVICE_ACTIVATE = 3;
const DEVICE_GET_ID = 5;
const VOLUME_SET_SCALAR = 7;
const VOLUME_GET_SCALAR = 9;
const VOLUME_SET_MUTE = 14;
const VOLUME_GET_MUTE = 15;

interface Api {
  CoInitializeEx: (reserved: null, flags: number) => number;
  CoCreateInstance: (clsid: unknown, outer: null, ctx: number, iid: unknown, out: unknown[]) => number;
  CoTaskMemFree: (p: unknown) => void;
  proto: {
    release: koffi.TypeObject;
    getDefault: koffi.TypeObject;
    getDevice: koffi.TypeObject;
    activate: koffi.TypeObject;
    getId: koffi.TypeObject;
    getScalar: koffi.TypeObject;
    setScalar: koffi.TypeObject;
    getMute: koffi.TypeObject;
    setMute: koffi.TypeObject;
  };
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const ole32 = koffi.load('ole32.dll');
  koffi.struct('CP_GUID', { d1: 'uint32_t', d2: 'uint16_t', d3: 'uint16_t', d4: koffi.array('uint8_t', 8) });
  api = {
    CoInitializeEx: ole32.func('int32_t __stdcall CoInitializeEx(void *reserved, uint32_t flags)'),
    CoCreateInstance: ole32.func('int32_t __stdcall CoCreateInstance(CP_GUID *clsid, void *outer, uint32_t ctx, CP_GUID *iid, _Out_ void **out)'),
    CoTaskMemFree: ole32.func('void __stdcall CoTaskMemFree(void *p)'),
    proto: {
      release: koffi.proto('uint32_t __stdcall CP_Release(void *self)'),
      getDefault: koffi.proto('int32_t __stdcall CP_GetDefaultAudioEndpoint(void *self, int flow, int role, _Out_ void **device)'),
      getDevice: koffi.proto('int32_t __stdcall CP_GetDevice(void *self, str16 id, _Out_ void **device)'),
      activate: koffi.proto('int32_t __stdcall CP_Activate(void *self, CP_GUID *iid, uint32_t ctx, void *params, _Out_ void **out)'),
      getId: koffi.proto('int32_t __stdcall CP_GetId(void *self, _Out_ void **id)'),
      getScalar: koffi.proto('int32_t __stdcall CP_GetMasterVolumeLevelScalar(void *self, _Out_ float *level)'),
      setScalar: koffi.proto('int32_t __stdcall CP_SetMasterVolumeLevelScalar(void *self, float level, void *context)'),
      getMute: koffi.proto('int32_t __stdcall CP_GetMute(void *self, _Out_ int *muted)'),
      setMute: koffi.proto('int32_t __stdcall CP_SetMute(void *self, int muted, void *context)'),
    },
  };
  // Déjà initialisé par Electron sur ce fil (S_FALSE, RPC_E_CHANGED_MODE) : rien à refaire.
  api.CoInitializeEx(null, COINIT_APARTMENTTHREADED);
  return api;
}

function guid(text: string) {
  const h = text.replace(/-/g, '');
  return { d1: parseInt(h.slice(0, 8), 16), d2: parseInt(h.slice(8, 12), 16), d3: parseInt(h.slice(12, 16), 16), d4: Array.from({ length: 8 }, (_, i) => parseInt(h.slice(16 + i * 2, 18 + i * 2), 16)) };
}

/** Appelle la méthode `index` de l'objet COM `self`. */
function call(self: unknown, index: number, proto: koffi.TypeObject, ...args: unknown[]): number {
  const table = koffi.decode(self, 'void *');
  const fn = koffi.decode(table, index * koffi.sizeof('void *'), 'void *');
  return koffi.call(fn, proto, self, ...args) as number;
}

function check(hr: number, what: string): void {
  if (hr < 0) throw new Error(`${what} : HRESULT 0x${(hr >>> 0).toString(16)}`); // i18n-ignore : erreur technique
}

/** Ouvre l'énumérateur, et le rend relâché après `use`, même en cas d'erreur. */
function withEnumerator<T>(use: (w: Api, enumerator: unknown) => T): T {
  if (process.platform !== 'win32') throw new Error('Core Audio : Windows seulement'); // i18n-ignore : erreur technique
  const w = loadApi();
  const out: unknown[] = [null];
  check(w.CoCreateInstance(guid(CLSID_MMDEVICE_ENUMERATOR), null, CLSCTX_ALL, guid(IID_IMMDEVICE_ENUMERATOR), out), 'CoCreateInstance(MMDeviceEnumerator)');
  try {
    return use(w, out[0]);
  } finally {
    call(out[0], RELEASE, w.proto.release);
  }
}

/** La sortie `id` (sans identifiant : la sortie par défaut), son identifiant et son réglage ; undefined si elle n'est pas active. */
function withVolume<T>(w: Api, enumerator: unknown, id: string | undefined, use: (volume: unknown, id: string) => T): T | undefined {
  const dev: unknown[] = [null];
  const hr = id ? call(enumerator, ENUM_GET_DEVICE, w.proto.getDevice, id, dev) : call(enumerator, ENUM_GET_DEFAULT, w.proto.getDefault, E_RENDER, E_CONSOLE, dev);
  if (hr < 0 || !dev[0]) return undefined;
  try {
    let endpoint = id;
    if (!endpoint) {
      const text: unknown[] = [null];
      check(call(dev[0], DEVICE_GET_ID, w.proto.getId, text), 'IMMDevice::GetId');
      endpoint = koffi.decode(text[0], 'char16_t', -1) as string;
      w.CoTaskMemFree(text[0]);
    }
    const vol: unknown[] = [null];
    // Sortie débranchée ou désactivée : Activate échoue, elle est passée.
    if (call(dev[0], DEVICE_ACTIVATE, w.proto.activate, guid(IID_IAUDIO_ENDPOINT_VOLUME), CLSCTX_ALL, null, vol) < 0 || !vol[0]) return undefined;
    try {
      return use(vol[0], endpoint);
    } finally {
      call(vol[0], RELEASE, w.proto.release);
    }
  } finally {
    call(dev[0], RELEASE, w.proto.release);
  }
}

/**
 * Réglage des sorties `ids` (identifiants IMMDevice::GetId), dans cet ordre, celles qui sont
 * actives ; sans identifiant (ou aucune active), la sortie par défaut de Windows.
 */
export function readEndpointVolumes(ids: readonly string[] = []): EndpointVolume[] {
  return withEnumerator((w, enumerator) => {
    const read = (id: string | undefined) =>
      withVolume(w, enumerator, id, (vol, endpoint) => {
        const level = [0];
        const muted = [0];
        check(call(vol, VOLUME_GET_SCALAR, w.proto.getScalar, level), 'GetMasterVolumeLevelScalar');
        check(call(vol, VOLUME_GET_MUTE, w.proto.getMute, muted), 'GetMute');
        return { id: endpoint, level: level[0]!, muted: muted[0] !== 0 };
      });
    const found = ids.map(read).filter((v): v is EndpointVolume => Boolean(v));
    if (found.length) return found;
    const fallback = read(undefined);
    return fallback ? [fallback] : [];
  });
}

/** Règle chaque sortie (niveau, son coupé) ; rend celles qui l'ont été. */
export function writeEndpointVolumes(volumes: readonly EndpointVolume[]): EndpointVolume[] {
  return withEnumerator((w, enumerator) =>
    volumes
      .map((v) =>
        withVolume(w, enumerator, v.id, (vol) => {
          check(call(vol, VOLUME_SET_SCALAR, w.proto.setScalar, Math.min(1, Math.max(0, v.level)), null), 'SetMasterVolumeLevelScalar');
          check(call(vol, VOLUME_SET_MUTE, w.proto.setMute, v.muted ? 1 : 0, null), 'SetMute');
          return v;
        }),
      )
      .filter((v): v is EndpointVolume => Boolean(v)),
  );
}
