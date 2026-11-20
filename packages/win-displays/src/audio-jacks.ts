// Prises des sorties audio, telles que leur pilote les décrit (IKsJackDescription), par la topologie
// Core Audio : IMMDevice → IDeviceTopology → connecteur 0 → connecteur de l'adaptateur (IPart) →
// IKsJackDescription. Lecture seule. La description vaut même quand Windows règle la carte en stéréo :
// c'est ce qui permet de proposer le SSF sur une carte dont les prises arrière et latérales sont
// branchées. Beaucoup de cartes USB et les sorties HDMI n'en donnent aucune : la sortie est alors
// passée, sans erreur.
//
// Appels par la table de méthodes (koffi.call), indices de mmdeviceapi.h, devicetopology.h.

import * as koffi from 'koffi';
import type { ObservedAudioJack } from '@cyberpinball/core';

const CLSCTX_ALL = 0x17;
const CLSCTX_INPROC_SERVER = 0x1;
const COINIT_APARTMENTTHREADED = 0x2;
const CLSID_MMDEVICE_ENUMERATOR = 'BCDE0395-E52F-467C-8E3D-C4579291692E';
const IID_IMMDEVICE_ENUMERATOR = 'A95664D2-9614-4F35-A746-DE8DB63617E6';
const IID_IDEVICE_TOPOLOGY = '2A07407E-6497-4A18-9787-32F79BD0D98F';
const IID_IPART = 'AE2DE0E4-5BCA-4F2D-AA46-5D13F8FDB3A9';
const IID_IKS_JACK_DESCRIPTION = '4509F757-2D46-4637-8E62-CE7DB944F57B';

// Indices (IUnknown : 0 QueryInterface, 1 AddRef, 2 Release).
const QUERY_INTERFACE = 0;
const RELEASE = 2;
const ENUM_GET_DEVICE = 5;
const DEVICE_ACTIVATE = 3;
const TOPOLOGY_GET_CONNECTOR = 4;
const CONNECTOR_GET_CONNECTED_TO = 8;
const PART_ACTIVATE = 13;
const JACK_GET_COUNT = 3;
const JACK_GET_DESCRIPTION = 4;

interface Api {
  CoInitializeEx: (reserved: null, flags: number) => number;
  CoCreateInstance: (clsid: unknown, outer: null, ctx: number, iid: unknown, out: unknown[]) => number;
  proto: Record<'release' | 'queryInterface' | 'getDevice' | 'activate' | 'getConnector' | 'getConnectedTo' | 'partActivate' | 'jackCount' | 'jackDescription', koffi.TypeObject>;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const ole32 = koffi.load('ole32.dll');
  koffi.struct('JK_GUID', { d1: 'uint32_t', d2: 'uint16_t', d3: 'uint16_t', d4: koffi.array('uint8_t', 8) });
  koffi.struct('JK_DESCRIPTION', {
    ChannelMapping: 'uint32_t',
    Color: 'uint32_t',
    ConnectionType: 'int32_t',
    GeoLocation: 'int32_t',
    GenLocation: 'int32_t',
    PortConnection: 'int32_t',
    IsConnected: 'int32_t',
  });
  api = {
    CoInitializeEx: ole32.func('int32_t __stdcall CoInitializeEx(void *reserved, uint32_t flags)'),
    CoCreateInstance: ole32.func('int32_t __stdcall CoCreateInstance(JK_GUID *clsid, void *outer, uint32_t ctx, JK_GUID *iid, _Out_ void **out)'),
    proto: {
      release: koffi.proto('uint32_t __stdcall JK_Release(void *self)'),
      queryInterface: koffi.proto('int32_t __stdcall JK_QueryInterface(void *self, JK_GUID *iid, _Out_ void **out)'),
      getDevice: koffi.proto('int32_t __stdcall JK_GetDevice(void *self, str16 id, _Out_ void **device)'),
      activate: koffi.proto('int32_t __stdcall JK_Activate(void *self, JK_GUID *iid, uint32_t ctx, void *params, _Out_ void **out)'),
      getConnector: koffi.proto('int32_t __stdcall JK_GetConnector(void *self, uint32_t index, _Out_ void **connector)'),
      getConnectedTo: koffi.proto('int32_t __stdcall JK_GetConnectedTo(void *self, _Out_ void **connector)'),
      partActivate: koffi.proto('int32_t __stdcall JK_PartActivate(void *self, uint32_t ctx, JK_GUID *iid, _Out_ void **out)'),
      jackCount: koffi.proto('int32_t __stdcall JK_GetJackCount(void *self, _Out_ uint32_t *count)'),
      jackDescription: koffi.proto('int32_t __stdcall JK_GetJackDescription(void *self, uint32_t index, _Out_ JK_DESCRIPTION *description)'),
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

function call(self: unknown, index: number, proto: koffi.TypeObject, ...args: unknown[]): number {
  const table = koffi.decode(self, 'void *');
  const fn = koffi.decode(table, index * koffi.sizeof('void *'), 'void *');
  return koffi.call(fn, proto, self, ...args) as number;
}

/** Objets COM ouverts pendant une lecture, relâchés dans l'ordre inverse. */
class Held {
  private readonly objects: unknown[] = [];
  constructor(private readonly w: Api) {}
  /** Le pointeur rendu par `get`, gardé pour être relâché ; undefined si l'appel échoue. */
  take(get: (out: unknown[]) => number): unknown {
    const out: unknown[] = [null];
    if (get(out) < 0 || !out[0]) return undefined;
    this.objects.push(out[0]);
    return out[0];
  }
  release(): void {
    for (const o of this.objects.reverse()) call(o, RELEASE, this.w.proto.release);
  }
}

/** COLORREF (0x00BBGGRR) → 0xRRGGBB. */
const rgb = (colorref: number) => ((colorref & 0xff) << 16) | (colorref & 0xff00) | ((colorref >>> 16) & 0xff);

function jacksOf(w: Api, enumerator: unknown, id: string): ObservedAudioJack[] | undefined {
  const held = new Held(w);
  try {
    const device = held.take((out) => call(enumerator, ENUM_GET_DEVICE, w.proto.getDevice, id, out));
    if (!device) return undefined;
    const topology = held.take((out) => call(device, DEVICE_ACTIVATE, w.proto.activate, guid(IID_IDEVICE_TOPOLOGY), CLSCTX_ALL, null, out));
    if (!topology) return undefined;
    const connector = held.take((out) => call(topology, TOPOLOGY_GET_CONNECTOR, w.proto.getConnector, 0, out));
    if (!connector) return undefined;
    const other = held.take((out) => call(connector, CONNECTOR_GET_CONNECTED_TO, w.proto.getConnectedTo, out));
    if (!other) return undefined;
    const part = held.take((out) => call(other, QUERY_INTERFACE, w.proto.queryInterface, guid(IID_IPART), out));
    if (!part) return undefined;
    // Le pilote ne décrit pas ses prises (E_NOINTERFACE) : rien à dire, sans erreur.
    const description = held.take((out) => call(part, PART_ACTIVATE, w.proto.partActivate, CLSCTX_INPROC_SERVER, guid(IID_IKS_JACK_DESCRIPTION), out));
    if (!description) return undefined;
    const count = [0];
    if (call(description, JACK_GET_COUNT, w.proto.jackCount, count) < 0) return undefined;
    const jacks: ObservedAudioJack[] = [];
    for (let i = 0; i < count[0]!; i++) {
      const d: Record<string, number> = {};
      if (call(description, JACK_GET_DESCRIPTION, w.proto.jackDescription, i, d) < 0) continue;
      jacks.push({ channelMapping: d.ChannelMapping! >>> 0, color: rgb(d.Color! >>> 0), geoLocation: d.GeoLocation!, connected: d.IsConnected !== 0 });
    }
    return jacks;
  } finally {
    held.release();
  }
}

/**
 * Prises de chaque sortie (identifiants IMMDevice::GetId) que son pilote décrit ; les autres sont
 * absentes de la table. Jamais d'exception : une lecture impossible rend une table vide.
 */
export function probeAudioJacks(ids: readonly string[]): Map<string, ObservedAudioJack[]> {
  const found = new Map<string, ObservedAudioJack[]>();
  if (process.platform !== 'win32' || ids.length === 0) return found;
  try {
    const w = loadApi();
    const out: unknown[] = [null];
    if (w.CoCreateInstance(guid(CLSID_MMDEVICE_ENUMERATOR), null, CLSCTX_ALL, guid(IID_IMMDEVICE_ENUMERATOR), out) < 0 || !out[0]) return found;
    try {
      for (const id of ids) {
        try {
          const jacks = jacksOf(w, out[0], id);
          if (jacks?.length) found.set(id, jacks);
        } catch {
          // Une sortie qui se lit mal n'empêche pas les autres.
        }
      }
    } finally {
      call(out[0], RELEASE, w.proto.release);
    }
  } catch {
    // ole32 introuvable, COM indisponible : rien de décrit.
  }
  return found;
}
