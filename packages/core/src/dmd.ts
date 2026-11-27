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
import { formatList, t, tn } from './i18n';
import type { LibusbProbe, ObservedUsbDevice } from './model';
import type { SyncFinding } from './sync';
import type { VpxProfile, VpxSetting } from './vpx';
import { dmdServerDrivesPin2dmd, vpxDmdServerSettings } from './dmdserver';

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
// ZeDMD reconnu à un pont USB-série courant (CH340, CP210x) : en est-ce bien un ?
//
// Cas réel (18/11/2026) : un contrôleur de LED adressables sur COM3 (CP210x) pris pour un ZeDMD ;
// [Plugin.DMDUtil] ZeDMD = 1 faisait envoyer à chaque partie la poignée de main du ZeDMD au
// contrôleur de LED (« ZeDMD handshake response error », « Unable to find ZeDMD »), et DMDUtil l'aurait
// pris à DOF une fois Cabinet.xml en place.

/** Ce que la borne sait de ses ports série, pour ne pas prendre un contrôleur de LED pour un ZeDMD. */
export interface DmdPortHints {
  /** Ports où la dernière recherche de DMDUtil (vpinball.log) n'a pas reçu de réponse de ZeDMD. */
  failed?: string[];
  /** Ports où un ZeDMD a répondu. */
  confirmed?: string[];
  /** Ports désignés par le Cabinet.xml que libdof lit (contrôleurs de LED de DOF). */
  dof?: string[];
  /** La configuration DOF a des LED adressables (directoutputconfig30 à 39.ini) qu'aucun Cabinet.xml ne situe. */
  addressable?: boolean;
}

/**
 * Ports essayés par DMDUtil d'après vpinball.log, le dernier essai de chaque port l'emportant :
 * « ZeDMD candidate: device=COM3… » puis « ZeDMD handshake response error » (échec) ou une ligne
 * « … found … » (réponse). Journal de libzedmd relayé par DMDUtilPlugin::OnDMDUtilLog.
 */
export function zedmdLogPorts(log: string): { failed: string[]; confirmed: string[] } {
  const result = new Map<string, 'failed' | 'confirmed'>();
  let current: string | undefined;
  for (const line of log.split(/\r?\n/)) {
    if (!line.includes('ZeDMD')) continue;
    const port = /device=(COM\d+)/i.exec(line)?.[1]?.toUpperCase();
    if (/ZeDMD candidate:/i.test(line)) {
      current = port;
      continue;
    }
    if (/handshake response error/i.test(line) && current) result.set(current, 'failed');
    else if (/\bfound\b/i.test(line) && !/unable/i.test(line) && (port ?? current)) result.set((port ?? current)!, 'confirmed');
  }
  const pick = (v: 'failed' | 'confirmed') => [...result].filter(([, r]) => r === v).map(([p]) => p);
  return { failed: pick('failed'), confirmed: pick('confirmed') };
}

export interface ZedmdDoubt {
  /** failed : il n'a pas répondu ; dof : Cabinet.xml le donne à DOF ; addressable : des LED adressables sans contrôleur déclaré. */
  reason: 'failed' | 'dof' | 'addressable';
  message: string;
}

/**
 * Pourquoi ce ZeDMD reconnu à un pont USB-série courant n'en est sans doute pas un ; undefined : rien
 * ne s'y oppose. Ne vaut qu'en automatique (« ZeDMD : oui » passe outre).
 */
export function zedmdDoubt(d: DetectedDmd, hints: DmdPortHints | undefined, setup?: HardwareDmdSetup): ZedmdDoubt | undefined {
  if (d.model !== 'ZeDMD' || !d.generic || !hints || hardwareDmdChoice(setup, d.model) !== 'auto') return undefined;
  const port = d.device.port?.toUpperCase();
  if (!port) return undefined;
  const has = (list: string[] | undefined) => Boolean(list?.some((p) => p.toUpperCase() === port));
  if (has(hints.confirmed)) return undefined;
  const yes = t('« ZeDMD : oui » si c’en est bien un');
  if (has(hints.dof)) {
    return { reason: 'dof', message: t('{port} est le port d’un contrôleur de DOF (Cabinet.xml) : ZeDMD n’y est pas allumé d’office ({yes}).', { port, yes }) };
  }
  if (has(hints.failed)) {
    return {
      reason: 'failed',
      message:
        t('{port} ne répond pas comme un ZeDMD (dernière partie : « handshake response error ») : c’est peut-être ton contrôleur de LED. ZeDMD n’y est plus allumé d’office ({yes}).', { port, yes }) +
        ' ' +
        t('Si c’est bien ton ZeDMD, son firmware est peut-être trop ancien (4.x) : mets-le à jour, puis choisis « ZeDMD : oui ».'),
    };
  }
  if (hints.addressable) {
    return {
      reason: 'addressable',
      message: t('{port} : pont USB-série courant, et ta configuration DOF a des LED adressables : c’est peut-être leur contrôleur. ZeDMD n’y est pas allumé d’office ({yes}).', { port, yes }),
    };
  }
  return undefined;
}

/**
 * « ZeDMD : oui » est choisi (il passe outre zedmdDoubt), mais la dernière recherche de DMDUtil n'a
 * eu aucune réponse sur ce port : le plus souvent un firmware ancien (4.x) que la bibliothèque de VPX
 * ne comprend plus (rapport du 25/11/2026 : ZeDMD 4.0.2 sur COM8, ancien PinUP Popper), sinon un
 * programme qui garde le port. Sans ce constat, la borne ne disait rien. undefined : rien à dire.
 */
export function zedmdSilentFault(d: DetectedDmd, hints: DmdPortHints | undefined, setup?: HardwareDmdSetup): string | undefined {
  if (d.model !== 'ZeDMD' || !hints || hardwareDmdChoice(setup, d.model) !== 'on') return undefined;
  const port = d.device.port?.toUpperCase();
  if (!port) return undefined;
  const has = (list: string[] | undefined) => Boolean(list?.some((p) => p.toUpperCase() === port));
  if (has(hints.confirmed) || !has(hints.failed)) return undefined;
  return t('{port} : « ZeDMD : oui » est choisi, mais le ZeDMD ne répond pas à VPX (dernière partie : « handshake response error »). Cause fréquente : un firmware ancien (4.x) que VPX ne comprend plus ; mets le firmware du ZeDMD à jour. Sinon, un autre programme garde le port : ferme-le.', { port });
}

// ---------------------------------------------------------------------------
// Choix de l'utilisateur (Menu système > Ma borne > DMD et LED > DMD réel)

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
  /**
   * « Image du menu » (bêta) : le DMD réel montre aussi le DMD du menu, par dmdserver (dmdserver.ts).
   * Absent : jamais réglé, [Plugin.DMDUtil] DMDServer reste tel quel ; false : écrit à 0.
   */
  menu?: boolean;
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
  if (!a) return t('Indique le nom ou l’adresse IP du ZeDMD.');
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
        'PIN2DMD : Windows ne lui a pas donné de pilote USB générique (WinUSB ou libusbK){why}. Cyber Pinball ne pourra pas l’ouvrir et le DMD restera noir. Installe ce pilote avec l’outil fourni avec le PIN2DMD ou avec Zadig, puis « Vérifier de nouveau ».',
        { why: code ? ` (${code})` : service ? t(' (pilote actuel : {service})', { service: device.service! }) : '' },
      );
    }
    // libusb n'ouvre libusb0 (libusb-win32, le pilote des anciens outils du PIN2DMD) et libusbK que par
    // libusbK.dll ; sans elle, seul WinUSB marche (libusb, windows_winusb.c, winusbx_init).
    if (service !== 'winusb' && device.libusbKDll === false) {
      return t(
        'PIN2DMD : son pilote {service} ne s’ouvre que par libusbK.dll, absente de Windows. Cyber Pinball ne pourra pas l’ouvrir et le DMD restera noir. Remplace ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».',
        { service: device.service! },
      );
    }
    return pin2dmdProbeProblem(device.libusbProbe, device.service);
  }
  // ZeDMD et Pixelcade : un port série. Sans port, le pilote du convertisseur manque.
  if (problem || !device.port) {
    const chip = d.usb.includes('CH34') ? t('pilote CH340/CH343 de WCH') : d.usb.includes('CP210x') ? t('pilote CP210x de Silicon Labs') : t('pilote du port série USB');
    return t('{model} : Windows ne lui a pas donné de port COM{why}. VPX ne pourra pas l’ouvrir. Installe le {chip} (souvent proposé par Windows Update), débranche et rebranche, puis « Vérifier de nouveau ».', {
      model: d.model,
      why: code ? ` (${code})` : '',
      chip,
    });
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Sonde du PIN2DMD (app/src/sonde-pin2dmd.ts) et programmes qui gardent un DMD réel

/** Codes d'erreur de libusb (libusb.h, enum libusb_error) qui disent « déjà ouvert ailleurs ». */
const LIBUSB_ERROR_ACCESS = -3;
const LIBUSB_ERROR_BUSY = -6;
/** Pilote que la libusb de VPX ne sait pas utiliser. */
const LIBUSB_ERROR_NOT_SUPPORTED = -12;

/**
 * Programmes qui ouvrent souvent un DMD réel et le gardent : tant qu'ils tournent, DMDUtil ne peut pas
 * l'ouvrir. Un seul programme à la fois tient un PIN2DMD (WinUSB) ou un port série (ZeDMD, Pixelcade).
 */
export const DMD_HOLDER_PROGRAMS: readonly { name: string; processes: RegExp }[] = [
  { name: 'dmdext', processes: /^dmdext\.exe$/i },
  { name: 'PinUP Popper', processes: /^pinup(menu|display|player)\.exe$/i },
  { name: 'PinballX', processes: /^pinballx\.exe$/i },
  { name: 'PinballY', processes: /^pinbally\.exe$/i },
  { name: 'Visual Pinball X', processes: /^vpinballx.*\.exe$/i },
  { name: 'Future Pinball', processes: /^future pinball\.exe$/i },
  { name: 'Freezy DMD', processes: /^(dmddevice|freezy).*\.exe$/i },
];

/** Noms des programmes ouverts qui gardent souvent un DMD réel, d'après les noms des processus. */
export function dmdHolders(processNames: string[]): string[] {
  return DMD_HOLDER_PROGRAMS.filter((p) => processNames.some((n) => p.processes.test(n))).map((p) => p.name);
}

/**
 * Les seuls noms de produit (iProduct) sous lesquels libdmdutil pilote un PIN2DMD : comparaison exacte
 * (strcmp) dans PIN2DMDInit (PIN2DMD.cpp, 3485e2e ; inchangé sur master au 18/11/2026, src/devices).
 */
export const PIN2DMD_PRODUCTS: readonly string[] = ['PIN2DMD', 'PIN2DMD XL', 'PIN2DMD HD'];

/**
 * Ce que la sonde du PIN2DMD dit de ce que verra VPX ; undefined : il s'ouvre (ou pas encore sondé).
 * libdmdutil (PIN2DMD.cpp, PIN2DMDInit) abandonne en silence quand libusb_open ou libusb_claim_interface
 * échoue, ou quand le nom de la carte n'est pas l'un des trois qu'il connaît : sans la sonde, le journal
 * de VPX ne dit rien et le DMD reste noir.
 */
export function pin2dmdProbeProblem(probe: LibusbProbe | undefined, service?: string): string | undefined {
  if (!probe || probe.stage === 'ok') return undefined;
  if (probe.stage === 'list') return t('PIN2DMD : Windows le voit, mais la libusb de VPX ne le trouve pas. Débranche-le, rebranche-le, puis « Vérifier de nouveau ».');
  if (probe.stage === 'name') {
    // Lu, mais refusé : rien ne se règle sur la borne, libdmdutil compare le nom à sa liste.
    if (probe.code >= 0 && probe.product) {
      return t(
        'PIN2DMD : la carte se présente sous le nom « {product} », que le module DMD de VPX (libdmdutil) ne connaît pas : il n’accepte que {known}. VPX ne la pilotera pas et le DMD restera noir. Cyber Pinball ne peut pas le contourner : envoie un rapport (Menu système > Aide et infos > Retours et propositions) pour que ce nom soit signalé aux auteurs de VPX.',
        { product: probe.product, known: formatList(PIN2DMD_PRODUCTS.map((p) => `« ${p} »`)) },
      );
    }
    return t(
      'PIN2DMD : la carte s’ouvre, mais ne donne pas son nom à la libusb de VPX ({why}). Le module DMD de VPX (libdmdutil) ne la pilote qu’après l’avoir lu : le DMD restera noir. Débranche-la, rebranche-la, puis « Vérifier de nouveau » ; si rien ne change, envoie un rapport (Menu système > Aide et infos > Retours et propositions).',
      { why: probe.code < 0 ? t('erreur {code}', { code: probe.code }) : t('nom vide') },
    );
  }
  if (probe.code === LIBUSB_ERROR_ACCESS || probe.code === LIBUSB_ERROR_BUSY) {
    const holders = probe.holders ?? [];
    return holders.length
      ? t('PIN2DMD : déjà ouvert par un autre programme ({programs}). Cyber Pinball ne pourra pas l’allumer et le DMD restera noir. Ferme-le, ou retire-le du démarrage de Windows, puis « Vérifier de nouveau ».', { programs: formatList(holders) })
      : t('PIN2DMD : déjà ouvert par un autre programme (dmdext, un autre front-end, l’éditeur du PIN2DMD…). Cyber Pinball ne pourra pas l’allumer et le DMD restera noir. Ferme-le, ou retire-le du démarrage de Windows, puis « Vérifier de nouveau ».');
  }
  if (probe.code === LIBUSB_ERROR_NOT_SUPPORTED) {
    return t('PIN2DMD : la libusb de VPX ne sait pas l’ouvrir avec son pilote actuel ({service}). Le DMD restera noir. Remplace ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».', {
      service: service ?? t('inconnu'),
    });
  }
  return t('PIN2DMD : la libusb de VPX n’arrive pas à l’ouvrir (erreur {code}, étape {stage}). Le DMD restera sans doute noir. Débranche-le, rebranche-le, puis « Vérifier de nouveau » ; si rien ne change, envoie un rapport (Menu système > Aide et infos > Retours et propositions).', {
    code: probe.code,
    stage: probe.stage,
  });
}

/** Le nom du PIN2DMD : celui que la sonde a lu par libusb, sinon celui que Windows a retenu. */
export function pin2dmdProduct(device: ObservedUsbDevice): string | undefined {
  return device.libusbProbe?.product ?? device.product;
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

/**
 * DMD réel ouvert par VPX lui-même : à la fermeture d'une table dont une source de DMD survit à la
 * partie (FlexDMD, Serum…), DMDUtil relance la recherche du DMD réel juste avant d'être déchargé, et
 * VPX plante en se fermant (0xC0000005, bornes à ZeDMD WiFi, 17/11/2026). Le plugin CyberPinballDmd,
 * déchargé juste avant lui, retient alors la fermeture jusqu'à 3 s après ce dernier changement des
 * sources (dmd-suivi.cpp, ShutdownWait) : une connexion au ZeDMD WiFi répond en quelques dizaines de
 * millisecondes, l'essai des ports série en moins de 2 s. Sans ce cas, aucune attente. Écrit par la
 * synchronisation (sync.ts) quand VPX ouvre lui-même un DMD réel (vpxDmdShutdownWait) ; prouvé au
 * banc scripts/banc-fermeture.mjs (faux ZeDMD WiFi joignable mais lent).
 */
export const DMD_SHUTDOWN_WAIT: VpxSetting = { section: 'Plugin.CyberPinballDmd', key: 'ShutdownWait', value: '3000' };

/** L'attente à la fermeture, quand ces réglages font ouvrir un DMD réel à VPX lui-même ; sinon rien. */
export function vpxDmdShutdownWait(settings: VpxSetting[]): VpxSetting[] {
  const direct = settings.some((s) => s.section === DMDUTIL && s.key === 'Enable' && s.value === '1') && !settings.some((s) => s.section === DMDUTIL && s.key === 'DMDServer' && s.value === '1');
  return direct ? [DMD_SHUTDOWN_WAIT] : [];
}

/** Clés de [Plugin.DMDUtil] que Cyber Pinball peut écrire. */
export const VPX_DMD_OWNED_KEYS = ['Enable', ...HARDWARE_DMD_MODELS, 'ZeDMDWiFiEnabled', 'ZeDMDWiFiAddr', 'DMDServer', 'DMDServerAddr', 'DMDServerPort'];

/**
 * En automatique, sans DMD réel, rien n'est écrit : DMDUtil reste tel que VPX ou l'utilisateur
 * l'a laissé. « Oui » et « Non » s'écrivent toujours. Le port n'est pas fixé : DMDUtil le cherche
 * lui-même parmi les ports série.
 * server : dmdserver tient le DMD et répond (image du menu) ; VPX lui envoie alors ses images au lieu
 * d'ouvrir le matériel. Sinon, VPX ouvre le DMD lui-même, comme sans l'image du menu.
 */
export function vpxDmdSettings(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup, server = false, holders: string[] = [], hints?: DmdPortHints): VpxDmdPlan {
  const all = detectHardwareDmds(devices);
  const findings: SyncFinding[] = [];
  // Un pont USB-série qui n'est sans doute pas un ZeDMD (contrôleur de LED…) : pas allumé d'office.
  for (const d of all) {
    const doubt = zedmdDoubt(d, hints, setup);
    if (doubt) findings.push({ severity: doubt.reason === 'failed' ? 'warning' : 'info', message: doubt.message });
  }
  const detected = all.filter((d) => !zedmdDoubt(d, hints, setup));
  for (const d of detected) {
    const fault = zedmdSilentFault(d, hints, setup);
    if (fault) findings.push({ severity: 'warning', message: fault });
  }
  // Un programme ouvert qui garde souvent le DMD réel (dmdext, PinUP Popper…) : DMDUtil ne pourra pas
  // l'ouvrir, et libdmdutil n'en dit rien. Dit avant la partie, pour tous les modèles.
  const lit = detected.some((d) => hardwareDmdChoice(setup, d.model) !== 'off') || Boolean(setup?.zedmdWifi?.enabled);
  if (lit && holders.length) {
    findings.push({
      severity: 'warning',
      message: tn(holders.length, 'DMD réel : {programs} est ouvert et garde peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Ferme-le avant de jouer.', 'DMD réel : {programs} sont ouverts et gardent peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Ferme-les avant de jouer.', {
        programs: formatList(holders),
      }),
    });
  }
  if (server) {
    findings.push({ severity: 'info', message: t('DMD réel : dmdserver tient l’afficheur (image du front-end, bêta) ; VPX lui envoie ses images pendant les parties.') });
    for (const d of detected.filter((x) => hardwareDmdChoice(setup, x.model) !== 'off')) {
      const driver = hardwareDmdDriverProblem(d);
      if (driver) findings.push({ severity: 'warning', message: driver });
    }
    return { detected, settings: vpxDmdServerSettings(), findings };
  }
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
  // Image du menu réglée (oui ou non), ou PIN2DMD que seul le serveur pilote, mais serveur absent : VPX
  // ouvre lui-même le DMD (un DMDServer = 1 d'une partie précédente le laisserait attendre un serveur arrêté).
  if (setup?.menu !== undefined || dmdServerDrivesPin2dmd(devices, setup)) values.push({ section: DMDUTIL, key: 'DMDServer', value: '0' });
  const anyOn = values.some((s) => s.value === '1') || Boolean(wifi?.enabled);
  const settings: VpxSetting[] = anyOn ? [{ section: DMDUTIL, key: 'Enable', value: '1' }, ...values] : values;

  for (const d of detected) {
    const choice = hardwareDmdChoice(setup, d.model);
    const where = [d.device.name, d.device.port].filter(Boolean).join(', ');
    const usb = where ? `${d.usb}${t(' ; ')}${where}` : d.usb;
    if (choice === 'off') {
      findings.push({ severity: 'info', message: t('{model} reconnu ({usb}), mais éteint : « {model} : non » dans Menu système > Ma borne > DMD et LED > DMD réel.', { model: d.model, usb }) });
      continue;
    }
    findings.push({ severity: 'info', message: t("DMD réel : {model} reconnu à son identifiant USB ({usb}). VPX l'alimente par le plugin DMDUtil.", { model: d.model, usb }) });
    const driver = hardwareDmdDriverProblem(d);
    if (driver) findings.push({ severity: 'warning', message: driver });
    if (d.generic && choice === 'auto') {
      findings.push({
        severity: 'info',
        message: t(
          "{model} : {usb} est un convertisseur USB-série courant. Si ce n'est pas un {model} (carte Arduino, contrôleur de boutons…), DMDUtil lui enverra quand même sa demande de connexion : choisis « {model} : non » dans Menu système > Ma borne > DMD et LED > DMD réel.",
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
  /** « Image du front-end : oui » : le DMD réel montre aussi le front-end entre les parties. */
  menu?: boolean;
  /** Dernière sonde du PIN2DMD allumé (étape, code, nom lu) : le rapport d'une borne la montre telle quelle. */
  pin2dmdProbe?: LibusbProbe;
}

/** serverProblem : pourquoi le serveur du DMD ne peut pas tourner (app/src/dmd-server.ts), lu si « Image du menu » est demandée. */
export function hardwareDmdFacts(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup, serverProblem?: string, hints?: DmdPortHints): HardwareDmdFacts {
  const found = detectHardwareDmds(devices).filter((d) => hardwareDmdChoice(setup, d.model) !== 'off');
  // Un pont USB-série qui n'a pas répondu comme un ZeDMD : jamais montré comme un ZeDMD, et à vérifier
  // tant que rien d'autre ne l'explique (Cabinet.xml de DOF, LED adressables : dit par DOF).
  const doubts = found.map((d) => zedmdDoubt(d, hints, setup));
  const on = found.filter((_, i) => !doubts[i]);
  const names = on.map((d) => hardwareDmdName(d));
  if (setup?.zedmdWifi?.enabled) names.push(t('ZeDMD en wifi ({address})', { address: setup.zedmdWifi.address }));
  const faults = on.map((d) => zedmdSilentFault(d, hints, setup)).filter((p): p is string => Boolean(p));
  const problems = [...doubts.filter((x) => x?.reason === 'failed').map((x) => x!.message), ...faults, ...on.map((d) => hardwareDmdDriverProblem(d)).filter((p): p is string => Boolean(p))];
  if (setup?.menu && names.length && serverProblem) problems.push(t('Image du front-end sur le DMD réel : {problem}', { problem: serverProblem }));
  // PIN2DMD : seul le serveur le pilote, même sans l'image du front-end ; sans lui, la carte reste noire.
  else if (serverProblem && dmdServerDrivesPin2dmd(devices, setup)) problems.push(t('PIN2DMD : {problem}', { problem: serverProblem }));
  const probe = on.find((d) => d.model === 'PIN2DMD' && d.device.libusbProbe)?.device.libusbProbe;
  return { devices: names, problems, ...(setup?.menu ? { menu: true } : {}), ...(probe ? { pin2dmdProbe: probe } : {}) };
}

/** « ZeDMD (COM3) », « PIN2DMD HD » */
export function hardwareDmdName(d: DetectedDmd): string {
  const name = d.model === 'PIN2DMD' ? (pin2dmdSize(pin2dmdProduct(d.device))?.label ?? d.model) : d.model;
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

/**
 * Chemins proposés, écrits seulement quand la clé est vide : l'utilisateur peut en choisir d'autres.
 * Les mises en page vont au plugin d'affichage des scores de la version : ScoreView, renommé Nixie en 10.9.0.
 */
export function vpxFolderDefaults(folders: GlobalDmdFolders, profile?: Pick<VpxProfile, 'enabledPlugins'>): VpxSetting[] {
  const defaults: VpxSetting[] = [];
  if (folders.pinmame) defaults.push({ section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: folders.pinmame });
  if (folders.serum) defaults.push({ section: 'Plugin.Serum', key: 'SerumPath', value: folders.serum });
  if (folders.vni) defaults.push({ section: 'Plugin.VNI', key: 'VniPath', value: folders.vni });
  if (folders.scoreview) defaults.push({ section: `Plugin.${scoreViewPlugin(profile)}`, key: 'LayoutFolder', value: folders.scoreview });
  return defaults;
}

/** Le plugin qui affiche le DMD et les scores dans la fenêtre ScoreView : ScoreView, ou Nixie depuis 10.9.0. */
export function scoreViewPlugin(profile?: Pick<VpxProfile, 'enabledPlugins'>): 'ScoreView' | 'Nixie' {
  return profile?.enabledPlugins.includes('Nixie') ? 'Nixie' : 'ScoreView';
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
