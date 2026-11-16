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

// ---------------------------------------------------------------------------
// Choix de l'utilisateur (Menu système > Borne > DMD > DMD réel)

/**
 * Pour chaque modèle : « auto », allumé quand il est reconnu à son identifiant USB (et ses clés
 * gardées telles quelles une fois débranché) ; « on », toujours allumé ; « off », jamais (une carte
 * Arduino au CH340 n'est pas un ZeDMD : DMDUtil ne lui enverra plus sa poignée de main).
 */
export type HardwareDmdChoice = 'auto' | 'on' | 'off';
export const HARDWARE_DMD_CHOICES: readonly HardwareDmdChoice[] = ['auto', 'on', 'off'];

/** Adresse que libzedmd prend sans réglage (DMDUtilPlugin.cpp, ZeDMDWiFiAddr). */
export const ZEDMD_WIFI_DEFAULT_ADDR = 'zedmd-wifi.local';

/** Réglages des DMD réels d'une configuration de la borne (cabinet.json) ; absent : tout automatique. */
export interface HardwareDmdSetup {
  models?: Partial<Record<HardwareDmdModel, HardwareDmdChoice>>;
  /**
   * ZeDMD relié par le wifi, que la détection USB ne voit pas. Absent : ses clés ne sont pas
   * touchées ; l'adresse reste gardée quand on l'éteint.
   */
  zedmdWifi?: { enabled: boolean; address: string };
}

export function hardwareDmdChoice(setup: HardwareDmdSetup | undefined, model: HardwareDmdModel): HardwareDmdChoice {
  return setup?.models?.[model] ?? 'auto';
}

/** Le choix suivant au Start : Automatique, Oui, Non. */
export function nextHardwareDmdChoice(choice: HardwareDmdChoice): HardwareDmdChoice {
  return HARDWARE_DMD_CHOICES[(HARDWARE_DMD_CHOICES.indexOf(choice) + 1) % HARDWARE_DMD_CHOICES.length]!;
}

export function withHardwareDmdChoice(setup: HardwareDmdSetup | undefined, model: HardwareDmdModel, choice: HardwareDmdChoice): HardwareDmdSetup {
  const models = { ...setup?.models, [model]: choice };
  if (choice === 'auto') delete models[model];
  const next: HardwareDmdSetup = { ...setup, models };
  if (!Object.keys(models).length) delete next.models;
  return next;
}

/** Adresse du ZeDMD en wifi : nom (zedmd-wifi.local) ou adresse IPv4, sans espace ni schéma. */
export function zedmdWifiAddressProblem(address: string): string | undefined {
  const a = address.trim();
  if (!a) return t('Indiquez le nom ou l’adresse IP du ZeDMD.');
  if (/^[a-z]+:\/\//i.test(a) || a.includes('/')) return t('Le nom ou l’adresse seuls, sans « http:// » ni chemin : par exemple {example} ou 192.168.1.50.', { example: ZEDMD_WIFI_DEFAULT_ADDR });
  if (!/^[A-Za-z0-9.-]+$/.test(a)) return t('Lettres, chiffres, points et tirets seulement : par exemple {example} ou 192.168.1.50.', { example: ZEDMD_WIFI_DEFAULT_ADDR });
  if (/^\d+(\.\d+){3}$/.test(a) && a.split('.').some((n) => Number(n) > 255)) return t('Adresse IP impossible : chaque nombre va de 0 à 255.');
  return undefined;
}

// ---------------------------------------------------------------------------
// Pilotes (lus passivement : nom du service et code du Gestionnaire de périphériques)

/** Pilotes USB génériques que libusb sait ouvrir sous Windows (le PIN2DMD passe par libusb). */
const LIBUSB_SERVICES = ['winusb', 'libusbk', 'libusb0'];

/** Le pilote empêchera-t-il VPX d'ouvrir ce DMD ? undefined : rien à signaler. */
export function hardwareDmdDriverProblem(d: DetectedDmd): string | undefined {
  const { device } = d;
  const problem = device.problem ?? 0;
  const code = problem ? t('code {code} du Gestionnaire de périphériques', { code: problem }) : undefined;
  if (d.model === 'PIN2DMD') {
    const service = device.service?.toLowerCase();
    if (problem || !service || !LIBUSB_SERVICES.includes(service)) {
      return t(
        'PIN2DMD : Windows ne lui a pas donné de pilote USB générique (WinUSB ou libusbK){why}. VPX ne pourra pas l’ouvrir et le DMD restera noir. Installez ce pilote avec l’outil fourni avec le PIN2DMD ou avec Zadig, puis « Vérifier de nouveau ».',
        { why: code ? ` (${code})` : service ? t(' (pilote actuel : {service})', { service: device.service! }) : '' },
      );
    }
    return undefined;
  }
  // ZeDMD et Pixelcade : un port série. Sans port, le pilote du convertisseur manque.
  if (problem || !device.port) {
    const chip = d.usb.includes('CH34') ? t('pilote CH340/CH343 de WCH') : d.usb.includes('CP210x') ? t('pilote CP210x de Silicon Labs') : t('pilote du port série USB');
    return t('{model} : Windows ne lui a pas donné de port COM{why}. VPX ne pourra pas l’ouvrir. Installez le {chip} (souvent proposé par Windows Update), débranchez et rebranchez, puis « Vérifier de nouveau ».', {
      model: d.model,
      why: code ? ` (${code})` : '',
      chip,
    });
  }
  return undefined;
}

/** Taille du PIN2DMD d'après le nom que la carte donne à l'USB (libdmdutil, PIN2DMD.cpp). */
export function pin2dmdSize(product: string | undefined): { width: number; height: number; label: string } | undefined {
  switch (product?.trim()) {
    case 'PIN2DMD':
      return { width: 128, height: 32, label: 'PIN2DMD' };
    case 'PIN2DMD XL':
      return { width: 192, height: 64, label: 'PIN2DMD XL' };
    case 'PIN2DMD HD':
      return { width: 256, height: 64, label: 'PIN2DMD HD' };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// [Plugin.DMDUtil]

export interface VpxDmdPlan {
  detected: DetectedDmd[];
  /** [Plugin.DMDUtil] Enable et la clé de chaque modèle allumé ou éteint ; vide sans DMD réel ni choix. */
  settings: VpxSetting[];
  findings: SyncFinding[];
}

const DMDUTIL = 'Plugin.DMDUtil';

/** Clés de [Plugin.DMDUtil] que Cyber Pinball peut écrire. */
export const VPX_DMD_OWNED_KEYS = ['Enable', ...HARDWARE_DMD_MODELS, 'ZeDMDWiFiEnabled', 'ZeDMDWiFiAddr'];

/**
 * En automatique, sans DMD réel, rien n'est écrit : DMDUtil reste tel que VPX ou l'utilisateur
 * l'a laissé. « Oui » et « Non » s'écrivent toujours. Le port n'est pas fixé : DMDUtil le cherche
 * lui-même parmi les ports série.
 */
export function vpxDmdSettings(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup): VpxDmdPlan {
  const detected = detectHardwareDmds(devices);
  const findings: SyncFinding[] = [];
  const values: VpxSetting[] = [];
  for (const m of HARDWARE_DMD_MODELS) {
    const choice = hardwareDmdChoice(setup, m);
    const on = choice === 'on' || (choice === 'auto' && detected.some((d) => d.model === m));
    if (on) values.push({ section: DMDUTIL, key: m, value: '1' });
    else if (choice === 'off') values.push({ section: DMDUTIL, key: m, value: '0' });
  }
  const wifi = setup?.zedmdWifi;
  if (wifi) {
    values.push({ section: DMDUTIL, key: 'ZeDMDWiFiEnabled', value: wifi.enabled ? '1' : '0' });
    if (wifi.enabled) values.push({ section: DMDUTIL, key: 'ZeDMDWiFiAddr', value: wifi.address.trim() });
  }
  const anyOn = values.some((s) => s.value === '1') || Boolean(wifi?.enabled);
  const settings: VpxSetting[] = anyOn ? [{ section: DMDUTIL, key: 'Enable', value: '1' }, ...values] : values;

  for (const d of detected) {
    const choice = hardwareDmdChoice(setup, d.model);
    const where = [d.device.name, d.device.port].filter(Boolean).join(', ');
    const usb = where ? `${d.usb}${t(' ; ')}${where}` : d.usb;
    if (choice === 'off') {
      findings.push({ severity: 'info', message: t('{model} reconnu ({usb}), mais éteint : « {model} : non » dans Menu système > Borne > DMD > DMD réel.', { model: d.model, usb }) });
      continue;
    }
    findings.push({ severity: 'info', message: t("DMD réel : {model} reconnu à son identifiant USB ({usb}). VPX l'alimente par le plugin DMDUtil.", { model: d.model, usb }) });
    const driver = hardwareDmdDriverProblem(d);
    if (driver) findings.push({ severity: 'warning', message: driver });
    if (d.generic && choice === 'auto') {
      findings.push({
        severity: 'info',
        message: t(
          "{model} : {usb} est un convertisseur USB-série courant. Si ce n'est pas un {model} (carte Arduino, contrôleur de boutons…), DMDUtil lui enverra quand même sa demande de connexion : choisissez « {model} : non » dans Menu système > Borne > DMD > DMD réel.",
          { model: d.model, usb: usbIdLabel(d.device.vid, d.device.pid) },
        ),
      });
    }
  }
  return { detected, settings, findings };
}

// ---------------------------------------------------------------------------
// Santé de la borne

/** Les DMD réels pour la santé de la borne : reconnus, allumés en wifi, et ce qui empêchera VPX de les ouvrir. */
export interface HardwareDmdFacts {
  /** En clair : « ZeDMD (COM3) », « PIN2DMD HD », « ZeDMD en wifi (zedmd-wifi.local) ». */
  devices: string[];
  /** Pilotes manquants ou refusés, tels quels. */
  problems: string[];
}

export function hardwareDmdFacts(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup): HardwareDmdFacts {
  const on = detectHardwareDmds(devices).filter((d) => hardwareDmdChoice(setup, d.model) !== 'off');
  const names = on.map((d) => hardwareDmdName(d));
  if (setup?.zedmdWifi?.enabled) names.push(t('ZeDMD en wifi ({address})', { address: setup.zedmdWifi.address }));
  return { devices: names, problems: on.map((d) => hardwareDmdDriverProblem(d)).filter((p): p is string => Boolean(p)) };
}

/** « ZeDMD (COM3) », « PIN2DMD HD » */
export function hardwareDmdName(d: DetectedDmd): string {
  const name = d.model === 'PIN2DMD' ? (pin2dmdSize(d.device.product)?.label ?? d.model) : d.model;
  return d.device.port ? `${name} (${d.device.port})` : name;
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
  /** Mises en page de ScoreView qui remplissent la fenêtre du DMD (scoreviewlayouts.ts) : [Plugin.ScoreView] LayoutFolder. */
  scoreview?: string;
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
  if (folders.scoreview) defaults.push({ section: 'Plugin.ScoreView', key: 'LayoutFolder', value: folders.scoreview });
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
