// Lunettes actives NVIDIA 3D Vision (packages/core/src/nvidia3dvision.ts) : ce que la borne en a.
//
// - Pilote : nvapi64.dll (livrée avec le pilote NVIDIA, dans System32) par koffi. Elle n'exporte que
//   nvapi_QueryInterface, qui rend chaque fonction par son identifiant (nvapi_interface.h du SDK
//   NVAPI R450, MIT) : version du pilote, et la 3D stéréoscopique activée ou non.
// - Émetteur : les périphériques USB déjà relevés (vpx-ini.ts, usbDevices).
// - Écran : [Player] PlayfieldDisplay que la partie lira (fichier de la table, puis VPinballX.ini),
//   comparé à l'écran principal et aux écrans présents.
// - VPX : le mode direct n'est que dans le VPX corrigé en place (10.8.1-5436, série 7, vpx-corrige.ts).
//
// Relevé à l'ouverture de l'écran Lunettes 3D et par Santé de la borne, seulement quand les lunettes
// NVIDIA sont choisies ; gardé 30 s (NvAPI_Initialize prend quelques dizaines de ms).

import * as path from 'node:path';
import { screen } from 'electron';
import * as koffi from 'koffi';
import { IniDocument, isNvidia3dVisionEmitter, playfieldOnPrimary, readJsonFile, readTextIfExists, type Nvidia3dVisionFacts, type ObservedUsbDevice } from '@cyberpinball/core';
import { desktopDisplays } from './offscreen';
import { vpxCorrigeInPlace } from './vpx-corrige';

/** Première série du VPX corrigé qui a le mode direct de 3D Vision (correctif 06). */
const NVIDIA_3DVISION_VPX_PATCH = 7;

/** Identifiants des fonctions de NVAPI (nvapi_interface.h). */
const NVAPI = {
  initialize: 0x0150e828,
  unload: 0xd22bdd7e,
  driverVersion: 0x2926aaad,
  stereoIsEnabled: 0x348ff8e1,
} as const;
const NVAPI_OK = 0;

type DriverFacts = Pick<Nvidia3dVisionFacts, 'nvapi' | 'driver' | 'stereo'>;

let nvapi: { query: (id: number) => unknown } | null | undefined;
const NoArgs = koffi.proto('int NvNoArgs()');
// Les tampons (Buffer) sont passés tels quels : branche du pilote (64 octets), stéréo activée (un octet).
const DriverVersion = koffi.proto('int NvDriverVersion(_Out_ uint32_t *version, uint8_t *branch)');
const StereoIsEnabled = koffi.proto('int NvStereoIsEnabled(uint8_t *enabled)');

function loadNvapi(): typeof nvapi {
  if (nvapi !== undefined) return nvapi;
  try {
    const lib = koffi.load('nvapi64.dll');
    nvapi = { query: lib.func('void *nvapi_QueryInterface(uint32_t id)') as (id: number) => unknown };
  } catch {
    nvapi = null; // pas de pilote NVIDIA
  }
  return nvapi;
}

/** Le pilote NVIDIA : présent, sa version, la stéréo activée. Jamais d'exception. */
function readDriver(): DriverFacts {
  const fixture = process.env.CYBERPINBALL_NVIDIA_3DVISION;
  if (fixture) return readJsonFile(fixture) as DriverFacts;
  if (process.platform !== 'win32') return { nvapi: false };
  const api = loadNvapi();
  if (!api) return { nvapi: false };
  const fn = (id: number) => api.query(id) || undefined;
  try {
    const init = fn(NVAPI.initialize);
    if (!init || koffi.call(init, NoArgs) !== NVAPI_OK) return { nvapi: false };
    const facts: DriverFacts = { nvapi: true };
    const version = fn(NVAPI.driverVersion);
    if (version) {
      const out = [0];
      const branch = Buffer.alloc(64);
      if (koffi.call(version, DriverVersion, out, branch) === NVAPI_OK && out[0]) facts.driver = out[0];
    }
    const enabled = fn(NVAPI.stereoIsEnabled);
    if (enabled) {
      const out = Buffer.alloc(1);
      // Sans le pilote 3D (retiré après la 425.31, remis par 3D Fix Manager), l'appel échoue : stéréo inconnue.
      if (koffi.call(enabled, StereoIsEnabled, out) === NVAPI_OK) facts.stereo = out[0] !== 0;
    }
    const unload = fn(NVAPI.unload);
    if (unload) koffi.call(unload, NoArgs);
    return facts;
  } catch (error) {
    console.log(`NVIDIA 3D Vision : NVAPI illisible (${(error as Error).message}).`); // i18n-ignore : journal
    return { nvapi: false };
  }
}

let kept: { at: number; facts: DriverFacts } | undefined;
const KEEP_MS = 30_000;

export interface Nvidia3dVisionSources {
  /** Périphériques USB (vpx-ini.ts) ; undefined : illisibles. */
  usb(): ObservedUsbDevice[] | undefined;
  /**
   * Les fichiers de réglages que VPX lira pour la partie, du plus fort au plus faible : celui de la
   * table (ses valeurs l'emportent), puis le VPinballX.ini de la partie.
   */
  inis(): string[];
  /** VPX en place ; undefined : pas de VPX. */
  vpx(): { exe: string; version: string } | undefined;
}

/**
 * L'origine des écrans présents, en pixels physiques comme les écrit VPX ; undefined : inconnue
 * (aucun écran relevé, essais hors écran).
 */
function displayOrigins(): { x: number; y: number }[] | undefined {
  const displays = desktopDisplays();
  if (!displays.length) return undefined;
  return displays.map((d) => {
    const r = screen.dipToScreenRect(null, d.bounds);
    return { x: r.x, y: r.y };
  });
}

/** [Player] PlayfieldDisplay tel que VPX le lira : la première valeur posée, table d'abord. */
function playfieldDisplay(inis: string[]): string | undefined {
  for (const file of inis) {
    const value = IniDocument.parse(readTextIfExists(file)).get('Player', 'PlayfieldDisplay');
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Ce que la borne a pour les lunettes NVIDIA ; `fresh` : relit le pilote sans attendre les 30 s. */
export function nvidia3dVisionFacts(src: Nvidia3dVisionSources, fresh = false): Nvidia3dVisionFacts {
  if (fresh || !kept || Date.now() - kept.at > KEEP_MS) kept = { at: Date.now(), facts: readDriver() };
  const usb = src.usb();
  const primary = playfieldOnPrimary(playfieldDisplay(src.inis()), displayOrigins());
  const vpx = src.vpx();
  // Le mode direct n'est que dans le VPX corrigé, série 7 ou plus, réellement en place (pas seulement sa version).
  const patch = vpx ? vpxCorrigeInPlace(path.dirname(vpx.exe), vpx.version, path.join(__dirname, '..')) : undefined;
  return {
    ...kept.facts,
    ...(usb ? { emitter: usb.some(isNvidia3dVisionEmitter) } : {}),
    ...(primary !== undefined ? { playfieldPrimary: primary } : {}),
    ...(vpx ? { vpxSupported: patch !== undefined && patch >= NVIDIA_3DVISION_VPX_PATCH } : {}),
  };
}
