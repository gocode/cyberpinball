// Périphériques USB présents, en lecture seule : la liste des instances PnP du
// gestionnaire de configuration (cfgmgr32, énumérateur « USB », filtre « présent »)
// et leurs propriétés dans HKLM\SYSTEM\CurrentControlSet\Enum. Aucun périphérique
// n'est ouvert, aucun port série n'est touché : c'est ce qui permet de reconnaître
// un DMD réel sans déranger le matériel (les détecteurs de libdmdutil, eux,
// ouvrent chaque port et envoient une poignée de main).

import * as koffi from 'koffi';
import { t, type ObservedUsbDevice } from '@cyberpinball/core';
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
  locate: NativeFn;
  status: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const cfgmgr32 = koffi.load('cfgmgr32.dll');
  api = {
    sizeOf: cfgmgr32.func('uint32_t __stdcall CM_Get_Device_ID_List_SizeW(_Out_ uint32_t *length, const char16_t *filter, uint32_t flags)'),
    list: cfgmgr32.func('uint32_t __stdcall CM_Get_Device_ID_ListW(const char16_t *filter, void *buffer, uint32_t length, uint32_t flags)'),
    locate: cfgmgr32.func('uint32_t __stdcall CM_Locate_DevNodeW(_Out_ uint32_t *devInst, const char16_t *deviceId, uint32_t flags)'),
    status: cfgmgr32.func('uint32_t __stdcall CM_Get_DevNode_Status(_Out_ uint32_t *status, _Out_ uint32_t *problem, uint32_t devInst, uint32_t flags)'),
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
    if (rc !== CR_SUCCESS) throw new Error(`CM_Get_Device_ID_List_SizeW a échoué (CONFIGRET ${rc}).`); // i18n-ignore : erreur technique d'un appel Win32
    const buffer = Buffer.alloc((length[0]! + 1) * 2);
    rc = w.list(enumerator, buffer, length[0]! + 1, flags);
    if (rc === CR_BUFFER_SMALL) continue;
    if (rc !== CR_SUCCESS) throw new Error(`CM_Get_Device_ID_ListW a échoué (CONFIGRET ${rc}).`); // i18n-ignore : erreur technique d'un appel Win32
    return buffer
      .toString('utf16le')
      .split('\0')
      .filter((id) => id.length > 0);
  }
  throw new Error(t('La liste des périphériques USB change sans cesse : réessayez.'));
}

/**
 * Périphériques USB présents, avec leur nom et leur port série. Chaque interface
 * d'un périphérique composite (…&MI_00) est une instance à part.
 */
export function probeUsbDevices(): ObservedUsbDevice[] {
  if (process.platform !== 'win32') throw new Error(t('La détection des périphériques USB ne fonctionne que sous Windows pour le moment.'));
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
    // Classe du pilote : « Camera » ou « Image » pour une webcam (Vision 3D, vision3d.ts du cœur).
    const deviceClass = text(key, 'Class');
    devices.push({
      instanceId,
      vid: parseInt(ids[1]!, 16),
      pid: parseInt(ids[2]!, 16),
      ...(name ? { name } : {}),
      ...(port ? { port } : {}),
      ...(deviceClass ? { deviceClass } : {}),
    });
  }
  return devices;
}

/** DeviceDesc est souvent une référence au pilote : « @oem12.inf,%ch340.devicedesc%;USB-SERIAL CH340 » -> le texte après le dernier « ; ». */
function deviceDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.startsWith('@') ? raw.slice(raw.lastIndexOf(';') + 1) || undefined : raw;
}

// cfgmgr32.h : état d'un nœud de périphérique.
const DN_STARTED = 0x00000008;
const DN_HAS_PROBLEM = 0x00000400;

/**
 * Le pilote d'un périphérique présent tourne-t-il ? `started` : pilote chargé ; sinon `problem`, le
 * code du Gestionnaire de périphériques (28 : aucun pilote installé ; 39, 52 : pilote refusé ou
 * illisible, par exemple par l'intégrité de la mémoire). undefined : périphérique introuvable.
 */
export function deviceStatus(instanceId: string): { started: boolean; problem: number } | undefined {
  if (process.platform !== 'win32') return undefined;
  const w = loadApi();
  const node = [0];
  if (w.locate(node, instanceId, 0) !== CR_SUCCESS) return undefined;
  const status = [0];
  const problem = [0];
  if (w.status(status, problem, node[0]!, 0) !== CR_SUCCESS) return undefined;
  const has = (status[0]! & DN_HAS_PROBLEM) !== 0;
  return { started: (status[0]! & DN_STARTED) !== 0 && !has, problem: has ? problem[0]! : 0 };
}
