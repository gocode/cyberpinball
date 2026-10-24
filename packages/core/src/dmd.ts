// DMD matériels (ZeDMD, PIN2DMD, Pixelcade) en mode plugins de VPX 10.8.1 : le
// plugin DMDUtil les alimente ([Plugin.DMDUtil], DMDUtilPlugin.cpp). On les
// reconnaît à leurs identifiants USB, lus passivement : aucun port série n'est
// ouvert, contrairement aux détecteurs de libdmdutil qui envoient une poignée de
// main. Identifiants relevés au commit de libdmdutil épinglé par VPX af26b2d93
// (platforms/config.sh) et dans ses dépendances.
// Dossiers globaux de colorisation et de ROM : proposés aux plugins Serum, VNI et
// PinMAME quand ils existent, en plus des dossiers de chaque table.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import type { ObservedUsbDevice } from './model';
import type { SyncFinding } from './sync';
import type { VpxSetting } from './vpx';

export type HardwareDmdModel = 'ZeDMD' | 'PIN2DMD' | 'Pixelcade';

interface UsbId {
  vid: number;
  pid: number;
  label: string;
  /** Identifiant d'un convertisseur USB-série courant : le périphérique peut être autre chose. */
  generic?: boolean;
}

/**
 * Identifiants USB de chaque DMD, avec la clé [Plugin.DMDUtil] qui l'active.
 * - ZeDMD : les quatre ponts série que libzedmd accepte en détection automatique
 *   (libzedmd e8466d2, ZeDMDComm.cpp, ZeDMDComm::Connect) ;
 * - PIN2DMD : kVid/kPid de libdmdutil 3485e2e (src/PIN2DMD.cpp), lu par libusb ;
 * - Pixelcade : carte IOIO-OTG de SparkFun (ytai/ioio, firmware/libusb/usb_descriptors.c),
 *   que libdmdutil reconnaît à sa réponse « IOIO » (src/PixelcadeDMD.cpp).
 */
export const HARDWARE_DMD_IDS: Record<HardwareDmdModel, UsbId[]> = {
  ZeDMD: [
    {
      vid: 0x303a,
      pid: 0x1001,
      get label() {
        return t('ESP32-S3, USB natif');
      },
    },
    { vid: 0x1a86, pid: 0x55d3, label: 'QinHeng CH343, ESP32-S3' },
    { vid: 0x1a86, pid: 0x7523, label: 'QinHeng CH340', generic: true },
    { vid: 0x10c4, pid: 0xea60, label: 'Silicon Labs CP210x', generic: true },
  ],
  PIN2DMD: [{ vid: 0x0314, pid: 0xe457, label: 'PIN2DMD' }],
  Pixelcade: [{ vid: 0x1b4f, pid: 0x0008, label: 'SparkFun IOIO-OTG' }],
};

/** Ordre d'affichage et clé [Plugin.DMDUtil] de chaque modèle (même nom). */
export const HARDWARE_DMD_MODELS: readonly HardwareDmdModel[] = ['ZeDMD', 'PIN2DMD', 'Pixelcade'];

export interface DetectedDmd {
  model: HardwareDmdModel;
  device: ObservedUsbDevice;
  usb: string;
  generic: boolean;
}

/** « 1A86:7523 » */
export function usbIdLabel(vid: number, pid: number): string {
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  return `${hex(vid)}:${hex(pid)}`;
}

/**
 * DMD reconnus parmi les périphériques USB présents. Un périphérique composite
 * apparaît une fois par interface (…&MI_00) : on garde le périphérique lui-même,
 * en lui rattachant le port série d'une de ses interfaces.
 */
export function detectHardwareDmds(devices: ObservedUsbDevice[]): DetectedDmd[] {
  const found: DetectedDmd[] = [];
  for (const model of HARDWARE_DMD_MODELS) {
    for (const id of HARDWARE_DMD_IDS[model]) {
      const same = devices.filter((d) => d.vid === id.vid && d.pid === id.pid);
      const parents = same.filter((d) => !/&MI_[0-9A-F]{2}/i.test(d.instanceId));
      const interfaces = same.filter((d) => /&MI_[0-9A-F]{2}/i.test(d.instanceId));
      const chosen = parents.length ? parents : interfaces.slice(0, 1);
      for (const device of chosen) {
        const port = device.port ?? (parents.length === 1 ? interfaces.find((i) => i.port)?.port : undefined);
        found.push({ model, device: { ...device, ...(port ? { port } : {}) }, usb: `${id.label}, ${usbIdLabel(id.vid, id.pid)}`, generic: Boolean(id.generic) });
      }
    }
  }
  return found;
}

export interface VpxDmdPlan {
  detected: DetectedDmd[];
  /** [Plugin.DMDUtil] Enable et la clé de chaque modèle détecté ; vide sans DMD réel. */
  settings: VpxSetting[];
  findings: SyncFinding[];
}

const DMDUTIL = 'Plugin.DMDUtil';

/** Clés de [Plugin.DMDUtil] que Cyber Pinball peut écrire. */
export const VPX_DMD_OWNED_KEYS = ['Enable', ...HARDWARE_DMD_MODELS];

/**
 * Sans DMD réel, rien n'est écrit : DMDUtil reste tel que VPX ou l'utilisateur l'a
 * laissé. Le port n'est pas fixé : DMDUtil le cherche lui-même parmi les ports série.
 */
export function vpxDmdSettings(devices: ObservedUsbDevice[]): VpxDmdPlan {
  const detected = detectHardwareDmds(devices);
  const findings: SyncFinding[] = [];
  if (!detected.length) return { detected, settings: [], findings };
  const models = HARDWARE_DMD_MODELS.filter((m) => detected.some((d) => d.model === m));
  const settings: VpxSetting[] = [
    { section: DMDUTIL, key: 'Enable', value: '1' },
    ...models.map((m) => ({ section: DMDUTIL, key: m, value: '1' })),
  ];
  for (const d of detected) {
    const where = [d.device.name, d.device.port].filter(Boolean).join(', ');
    findings.push({
      severity: 'info',
      message: t("DMD réel : {model} reconnu à son identifiant USB ({usb}). VPX l'alimente par le plugin DMDUtil.", { model: d.model, usb: where ? `${d.usb}${t(' ; ')}${where}` : d.usb }),
    });
    if (d.generic) {
      findings.push({
        severity: 'info',
        message: t(
          "{model} : {usb} est un convertisseur USB-série courant. Si ce n'est pas un {model} (carte Arduino, contrôleur de boutons…), DMDUtil lui enverra quand même sa demande de connexion : passez [Plugin.DMDUtil] {model} à 0 et gardez cette valeur.",
          { model: d.model, usb: usbIdLabel(d.device.vid, d.device.pid) },
        ),
      });
    }
  }
  return { detected, settings, findings };
}

// ---------------------------------------------------------------------------
// Dossiers globaux

export interface GlobalDmdFolders {
  /** Dossier qui contient roms\ (et nvram\, cfg\…) : [Plugin.PinMAME] PinMAMEPath. */
  pinmame?: string;
  /** Dossier qui contient <rom>\<rom>.cRZ ou .cROMc : [Plugin.Serum] SerumPath. */
  serum?: string;
  /** Dossier qui contient <rom>\<rom>.pal : [Plugin.VNI] VniPath. */
  vni?: string;
}

/**
 * Dossiers communs à toutes les tables, sous la racine : <racine>\pinmame (avec
 * roms\) et sa colorisation <racine>\pinmame\altcolor\<rom>\. Chaque plugin cherche
 * d'abord à côté de la table (pinmame\roms, serum\<rom>, vni\<rom>,
 * pinmame\altcolor\<rom>), puis dans ce dossier global (PinMAMEPlugin.cpp, serum.cpp, vni.cpp).
 */
export function findGlobalDmdFolders(root: string): GlobalDmdFolders {
  const folders: GlobalDmdFolders = {};
  const pinmame = path.join(root, 'pinmame');
  if (isDir(path.join(pinmame, 'roms'))) folders.pinmame = pinmame;
  const altcolor = path.join(pinmame, 'altcolor');
  const has = (exts: string[]) =>
    subdirs(altcolor).some((rom) => listSafe(path.join(altcolor, rom)).some((f) => exts.includes(path.extname(f).toLowerCase())));
  if (has(['.crz', '.cromc'])) folders.serum = altcolor;
  if (has(['.pal', '.vni'])) folders.vni = altcolor;
  return folders;
}

/** Chemins proposés, écrits seulement quand la clé est vide : l'utilisateur peut en choisir d'autres. */
export function vpxFolderDefaults(folders: GlobalDmdFolders): VpxSetting[] {
  const defaults: VpxSetting[] = [];
  if (folders.pinmame) defaults.push({ section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: folders.pinmame });
  if (folders.serum) defaults.push({ section: 'Plugin.Serum', key: 'SerumPath', value: folders.serum });
  if (folders.vni) defaults.push({ section: 'Plugin.VNI', key: 'VniPath', value: folders.vni });
  return defaults;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function subdirs(dir: string): string[] {
  return listSafe(dir).filter((f) => isDir(path.join(dir, f)));
}
