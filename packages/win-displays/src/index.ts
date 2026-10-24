// Détection des écrans sous Windows, par l'API DisplayConfig (celle que SDL, donc
// VPX, utilise pour nommer les écrans) et l'EDID stocké dans le registre.
//
// Les structures Win32 sont lues octet par octet dans des Buffer plutôt que
// déclarées à koffi : leurs tailles sont figées par l'ABI Windows et c'est plus
// facile à vérifier contre la documentation.

import { execFileSync } from 'node:child_process';
import * as koffi from 'koffi';
import { edidFromHex, parseEdid, t, type EdidInfo, type ObservedDisplay, type Rotation } from '@cyberpinball/core';
import { monitorContainerId } from './audio';

const QDC_ONLY_ACTIVE_PATHS = 0x2;
const ERROR_INSUFFICIENT_BUFFER = 122;
const DEVICE_INFO_GET_SOURCE_NAME = 1;
const DEVICE_INFO_GET_TARGET_NAME = 2;
const MODE_INFO_TYPE_SOURCE = 1;
const INVALID_INDEX = 0xffffffff;
const MONITOR_DEFAULTTONEAREST = 2;
const MDT_EFFECTIVE_DPI = 0;
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;

// Tailles des structures (wingdi.h).
const PATH_INFO_SIZE = 72;
const MODE_INFO_SIZE = 64;
const SOURCE_NAME_SIZE = 84;
const TARGET_NAME_SIZE = 420;
const DISPLAY_DEVICE_SIZE = 840;

const ROTATIONS: Record<number, Rotation> = { 1: 0, 2: 90, 3: 180, 4: 270 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

interface Api {
  GetDisplayConfigBufferSizes: NativeFn;
  QueryDisplayConfig: NativeFn;
  DisplayConfigGetDeviceInfo: NativeFn;
  MonitorFromPoint: NativeFn;
  GetDpiForMonitor: NativeFn;
  EnumDisplayDevicesW: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const shcore = koffi.load('shcore.dll');
  koffi.struct('CP_POINT', { x: 'int32_t', y: 'int32_t' });

  // Sans cela, Windows renvoie des coordonnées et des DPI virtualisés pour un
  // processus non conscient du DPI. Échoue sans conséquence si déjà réglé (Electron).
  user32.func('bool __stdcall SetProcessDpiAwarenessContext(intptr_t value)')(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  api = {
    GetDisplayConfigBufferSizes: user32.func(
      'long __stdcall GetDisplayConfigBufferSizes(uint32_t flags, _Out_ uint32_t *numPath, _Out_ uint32_t *numMode)',
    ),
    QueryDisplayConfig: user32.func(
      'long __stdcall QueryDisplayConfig(uint32_t flags, _Inout_ uint32_t *numPath, void *paths, _Inout_ uint32_t *numMode, void *modes, void *topology)',
    ),
    DisplayConfigGetDeviceInfo: user32.func('long __stdcall DisplayConfigGetDeviceInfo(void *packet)'),
    MonitorFromPoint: user32.func('void * __stdcall MonitorFromPoint(CP_POINT pt, uint32_t flags)'),
    GetDpiForMonitor: shcore.func(
      'long __stdcall GetDpiForMonitor(void *monitor, int type, _Out_ uint32_t *dpiX, _Out_ uint32_t *dpiY)',
    ),
    EnumDisplayDevicesW: user32.func(
      'bool __stdcall EnumDisplayDevicesW(const char16_t *device, uint32_t index, void *displayDevice, uint32_t flags)',
    ),
  };
  return api;
}

interface Luid {
  low: number;
  high: number;
}

/** Liste les écrans actifs, triés de gauche à droite puis de haut en bas. */
export function probeDisplays(): ObservedDisplay[] {
  if (process.platform !== 'win32') throw new Error(t('La détection des écrans ne fonctionne que sous Windows pour le moment.'));
  const w = loadApi();
  const { paths, modes, pathCount } = queryActivePaths(w);
  const displays: ObservedDisplay[] = [];

  for (let i = 0; i < pathCount; i++) {
    const p = i * PATH_INFO_SIZE;
    const sourceAdapter: Luid = { low: paths.readUInt32LE(p), high: paths.readInt32LE(p + 4) };
    const sourceId = paths.readUInt32LE(p + 8);
    const sourceModeIdx = paths.readUInt32LE(p + 12);
    const t = p + 20;
    const targetAdapter: Luid = { low: paths.readUInt32LE(t), high: paths.readInt32LE(t + 4) };
    const targetId = paths.readUInt32LE(t + 8);
    const rotation = ROTATIONS[paths.readUInt32LE(t + 20)] ?? 0;

    if (sourceModeIdx === INVALID_INDEX) continue;
    const m = sourceModeIdx * MODE_INFO_SIZE;
    if (modes.readUInt32LE(m) !== MODE_INFO_TYPE_SOURCE) continue;
    const bounds = {
      width: modes.readUInt32LE(m + 16),
      height: modes.readUInt32LE(m + 20),
      x: modes.readInt32LE(m + 28),
      y: modes.readInt32LE(m + 32),
    };

    const gdiName = getSourceName(w, sourceAdapter, sourceId);
    const target = getTargetName(w, targetAdapter, targetId);
    displays.push({
      gdiName,
      friendlyName: target.friendlyName,
      monitorDescription: getMonitorDescription(w, gdiName),
      devicePath: target.devicePath,
      bounds,
      rotation,
      primary: bounds.x === 0 && bounds.y === 0,
      scale: readScale(w, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      edid: readEdid(target.devicePath),
      containerId: monitorContainerId(target.devicePath),
    });
  }

  return displays.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

function queryActivePaths(w: Api) {
  // La topologie peut changer entre les deux appels : on recommence si le tampon est trop petit.
  for (let attempt = 0; attempt < 5; attempt++) {
    const numPath = [0];
    const numMode = [0];
    check(w.GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, numPath, numMode), 'GetDisplayConfigBufferSizes');
    const paths = Buffer.alloc(numPath[0]! * PATH_INFO_SIZE);
    const modes = Buffer.alloc(numMode[0]! * MODE_INFO_SIZE);
    const rc = w.QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, numPath, paths, numMode, modes, null);
    if (rc === ERROR_INSUFFICIENT_BUFFER) continue;
    check(rc, 'QueryDisplayConfig');
    return { paths, modes, pathCount: numPath[0]! };
  }
  throw new Error(t('QueryDisplayConfig : la configuration des écrans change en continu.'));
}

function header(type: number, size: number, adapter: Luid, id: number): Buffer {
  const buf = Buffer.alloc(size);
  buf.writeUInt32LE(type, 0);
  buf.writeUInt32LE(size, 4);
  buf.writeUInt32LE(adapter.low, 8);
  buf.writeInt32LE(adapter.high, 12);
  buf.writeUInt32LE(id, 16);
  return buf;
}

function getSourceName(w: Api, adapter: Luid, id: number): string {
  const buf = header(DEVICE_INFO_GET_SOURCE_NAME, SOURCE_NAME_SIZE, adapter, id);
  check(w.DisplayConfigGetDeviceInfo(buf), 'DisplayConfigGetDeviceInfo(source)');
  return wideString(buf, 20, 64);
}

function getTargetName(w: Api, adapter: Luid, id: number) {
  const buf = header(DEVICE_INFO_GET_TARGET_NAME, TARGET_NAME_SIZE, adapter, id);
  check(w.DisplayConfigGetDeviceInfo(buf), 'DisplayConfigGetDeviceInfo(target)');
  return {
    friendlyName: wideString(buf, 36, 128),
    devicePath: wideString(buf, 164, 256),
  };
}

/** Même appel que SDL quand le nom convivial est vide : le premier moniteur rattaché à la source. */
function getMonitorDescription(w: Api, gdiName: string): string | undefined {
  const buf = Buffer.alloc(DISPLAY_DEVICE_SIZE);
  buf.writeUInt32LE(DISPLAY_DEVICE_SIZE, 0);
  if (!w.EnumDisplayDevicesW(gdiName, 0, buf, 0)) return undefined;
  return wideString(buf, 68, 256) || undefined;
}

function readScale(w: Api, cx: number, cy: number): number | undefined {
  const monitor = w.MonitorFromPoint({ x: Math.round(cx), y: Math.round(cy) }, MONITOR_DEFAULTTONEAREST);
  if (!monitor) return undefined;
  const dpiX = [0];
  const dpiY = [0];
  if (w.GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, dpiX, dpiY) !== 0) return undefined;
  const dpi = dpiX[0]!;
  return dpi / 96;
}

/**
 * L'EDID est dans HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY\<modèle>\<instance>\Device Parameters,
 * où modèle et instance sont les 2e et 3e segments du chemin de périphérique.
 */
function readEdid(devicePath: string): EdidInfo | undefined {
  const parts = devicePath.split('#');
  if (parts.length < 3) return undefined;
  const key = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\${parts[1]}\\${parts[2]}\\Device Parameters`;
  try {
    const out = execFileSync('reg', ['query', key, '/v', 'EDID'], { encoding: 'utf8', windowsHide: true });
    const hex = /EDID\s+REG_BINARY\s+([0-9A-Fa-f]+)/.exec(out)?.[1];
    return hex ? parseEdid(edidFromHex(hex)) : undefined;
  } catch {
    return undefined;
  }
}

function wideString(buf: Buffer, offset: number, length: number): string {
  const s = buf.toString('utf16le', offset, offset + length);
  const end = s.indexOf('\0');
  return end === -1 ? s : s.slice(0, end);
}

function check(rc: number, what: string): void {
  if (rc !== 0) throw new Error(`${what} a échoué (code Win32 ${rc}).`); // i18n-ignore : erreur technique d'un appel Win32
}
export * from './windows';
export * from './orientation';
export * from './audio';
export * from './usb';
export * from './desktop';
export * from './processes';
export * from './joystick';
