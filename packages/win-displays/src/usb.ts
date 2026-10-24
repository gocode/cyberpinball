// Périphériques USB présents, en lecture seule : la liste des instances PnP du
// gestionnaire de configuration (cfgmgr32, énumérateur « USB », filtre « présent »)
// et leurs propriétés dans HKLM\SYSTEM\CurrentControlSet\Enum. Aucun périphérique
// n'est ouvert, aucun port série n'est touché : c'est ce qui permet de reconnaître
// un DMD réel sans déranger le matériel (les détecteurs de libdmdutil, eux,
// ouvrent chaque port et envoient une poignée de main).

import * as koffi from 'koffi';
import type { ObservedUsbDevice } from '@cyberpinball/core';
import { hklmValue } from './registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

// cfgmgr32.h
const CM_GETIDLIST_FILTER_ENUMERATOR = 0x00000001;
const CM_GETIDLIST_FILTER_PRESENT = 0x00000100;
const CR_SUCCESS = 0;
const CR_BUFFER_SMALL = 0x1a;

const ENUM = 'SYSTEM\\CurrentControlSet\\Enum';

interface Api {
  sizeOf: NativeFn;
  list: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const cfgmgr32 = koffi.load('cfgmgr32.dll');
  api = {
    sizeOf: cfgmgr32.func('uint32_t __stdcall CM_Get_Device_ID_List_SizeW(_Out_ uint32_t *length, const char16_t *filter, uint32_t flags)'),
    list: cfgmgr32.func('uint32_t __stdcall CM_Get_Device_ID_ListW(const char16_t *filter, void *buffer, uint32_t length, uint32_t flags)'),
  };
  return api;
}

/** Identifiants d'instance des périphériques présents d'un énumérateur (« USB »). */
export function presentDeviceIds(enumerator = 'USB'): string[] {
  const w = loadApi();
  const flags = CM_GETIDLIST_FILTER_ENUMERATOR | CM_GETIDLIST_FILTER_PRESENT;
  // La liste peut grandir entre les deux appels (branchement) : on recommence alors.
  for (let attempt = 0; attempt < 3; attempt++) {
    const length = [0];
    let rc = w.sizeOf(length, enumerator, flags);
    if (rc !== CR_SUCCESS) throw new Error(`CM_Get_Device_ID_List_SizeW a échoué (CONFIGRET ${rc}).`);
    const buffer = Buffer.alloc((length[0]! + 1) * 2);
    rc = w.list(enumerator, buffer, length[0]! + 1, flags);
    if (rc === CR_BUFFER_SMALL) continue;
    if (rc !== CR_SUCCESS) throw new Error(`CM_Get_Device_ID_ListW a échoué (CONFIGRET ${rc}).`);
    return buffer
      .toString('utf16le')
      .split('\0')
      .filter((id) => id.length > 0);
  }
  throw new Error('La liste des périphériques USB change sans cesse : réessayez.');
}

/**
 * Périphériques USB présents, avec leur nom et leur port série. Chaque interface
 * d'un périphérique composite (…&MI_00) est une instance à part.
 */
export function probeUsbDevices(): ObservedUsbDevice[] {
  if (process.platform !== 'win32') throw new Error('La détection des périphériques USB ne fonctionne que sous Windows pour le moment.');
  const devices: ObservedUsbDevice[] = [];
  for (const instanceId of presentDeviceIds('USB')) {
    const ids = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(instanceId);
    if (!ids) continue; // concentrateurs racine (USB\ROOT_HUB30\…)
    const key = `${ENUM}\\${instanceId}`;
    const text = (k: string, name: string) => {
      const v = hklmValue(k, name);
      return typeof v === 'string' && v ? v : undefined;
    };
    const name = text(key, 'FriendlyName') ?? deviceDescription(text(key, 'DeviceDesc'));
    const port = text(`${key}\\Device Parameters`, 'PortName');
    devices.push({
      instanceId,
      vid: parseInt(ids[1]!, 16),
      pid: parseInt(ids[2]!, 16),
      ...(name ? { name } : {}),
      ...(port ? { port } : {}),
    });
  }
  return devices;
}

/** DeviceDesc est souvent une référence au pilote : « @oem12.inf,%ch340.devicedesc%;USB-SERIAL CH340 » -> le texte après le dernier « ; ». */
function deviceDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.startsWith('@') ? raw.slice(raw.lastIndexOf(';') + 1) || undefined : raw;
}
