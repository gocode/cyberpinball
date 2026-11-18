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
import type { VpxSetting } from './vpx';
import { vpxDmdServerSettings } from './dmdserver';

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
    // libusb n'ouvre libusb0 (libusb-win32, le pilote des anciens outils du PIN2DMD) et libusbK que par
    // libusbK.dll ; sans elle, seul WinUSB marche (libusb, windows_winusb.c, winusbx_init).
    if (service !== 'winusb' && device.libusbKDll === false) {
      return t(
        'PIN2DMD : son pilote {service} ne s’ouvre que par libusbK.dll, absente de Windows. VPX ne pourra pas l’ouvrir et le DMD restera noir. Remplacez ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».',
        { service: device.service! },
      );
    }
    return pin2dmdProbeProblem(device.libusbProbe, device.service);
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
  if (probe.stage === 'list') return t('PIN2DMD : Windows le voit, mais la libusb de VPX ne le trouve pas. Débranchez-le, rebranchez-le, puis « Vérifier de nouveau ».');
  if (probe.stage === 'name') {
    // Lu, mais refusé : rien ne se règle sur la borne, libdmdutil compare le nom à sa liste.
    if (probe.code >= 0 && probe.product) {
      return t(
        'PIN2DMD : la carte se présente sous le nom « {product} », que le module DMD de VPX (libdmdutil) ne connaît pas : il n’accepte que {known}. VPX ne la pilotera pas et le DMD restera noir. Cyber Pinball ne peut pas le contourner : envoyez un rapport (Menu système > Cyber Pinball > Retours et propositions) pour que ce nom soit signalé aux auteurs de VPX.',
        { product: probe.product, known: formatList(PIN2DMD_PRODUCTS.map((p) => `« ${p} »`)) },
      );
    }
    return t(
      'PIN2DMD : la carte s’ouvre, mais ne donne pas son nom à la libusb de VPX ({why}). Le module DMD de VPX (libdmdutil) ne la pilote qu’après l’avoir lu : le DMD restera noir. Débranchez-la, rebranchez-la, puis « Vérifier de nouveau » ; si rien ne change, envoyez un rapport (Menu système > Cyber Pinball > Retours et propositions).',
      { why: probe.code < 0 ? t('erreur {code}', { code: probe.code }) : t('nom vide') },
    );
  }
  if (probe.code === LIBUSB_ERROR_ACCESS || probe.code === LIBUSB_ERROR_BUSY) {
    const holders = probe.holders ?? [];
    return holders.length
      ? t('PIN2DMD : déjà ouvert par un autre programme ({programs}). VPX ne pourra pas l’allumer et le DMD restera noir. Fermez-le, ou retirez-le du démarrage de Windows, puis « Vérifier de nouveau ».', { programs: formatList(holders) })
      : t('PIN2DMD : déjà ouvert par un autre programme (dmdext, un autre front-end, l’éditeur du PIN2DMD…). VPX ne pourra pas l’allumer et le DMD restera noir. Fermez-le, ou retirez-le du démarrage de Windows, puis « Vérifier de nouveau ».');
  }
  if (probe.code === LIBUSB_ERROR_NOT_SUPPORTED) {
    return t('PIN2DMD : la libusb de VPX ne sait pas l’ouvrir avec son pilote actuel ({service}). Le DMD restera noir. Remplacez ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».', {
      service: service ?? t('inconnu'),
    });
  }
  return t('PIN2DMD : la libusb de VPX n’arrive pas à l’ouvrir (erreur {code}, étape {stage}). Le DMD restera sans doute noir. Débranchez-le, rebranchez-le, puis « Vérifier de nouveau » ; si rien ne change, envoyez un rapport (Menu système > Cyber Pinball > Retours et propositions).', {
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
export function vpxDmdSettings(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup, server = false, holders: string[] = []): VpxDmdPlan {
  const detected = detectHardwareDmds(devices);
  const findings: SyncFinding[] = [];
  // Un programme ouvert qui garde souvent le DMD réel (dmdext, PinUP Popper…) : DMDUtil ne pourra pas
  // l'ouvrir, et libdmdutil n'en dit rien. Dit avant la partie, pour tous les modèles.
  const lit = detected.some((d) => hardwareDmdChoice(setup, d.model) !== 'off') || Boolean(setup?.zedmdWifi?.enabled);
  if (lit && holders.length) {
    findings.push({
      severity: 'warning',
      message: tn(holders.length, 'DMD réel : {programs} est ouvert et garde peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Fermez-le avant de jouer.', 'DMD réel : {programs} sont ouverts et gardent peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Fermez-les avant de jouer.', {
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
  // Image du menu réglée (oui ou non) mais serveur absent : VPX ouvre lui-même le DMD.
  if (setup?.menu !== undefined) values.push({ section: DMDUTIL, key: 'DMDServer', value: '0' });
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
  /** « Image du front-end : oui » : le DMD réel montre aussi le front-end entre les parties. */
  menu?: boolean;
  /** Dernière sonde du PIN2DMD allumé (étape, code, nom lu) : le rapport d'une borne la montre telle quelle. */
  pin2dmdProbe?: LibusbProbe;
}

/** serverProblem : pourquoi le serveur du DMD ne peut pas tourner (app/src/dmd-server.ts), lu si « Image du menu » est demandée. */
export function hardwareDmdFacts(devices: ObservedUsbDevice[], setup?: HardwareDmdSetup, serverProblem?: string): HardwareDmdFacts {
  const on = detectHardwareDmds(devices).filter((d) => hardwareDmdChoice(setup, d.model) !== 'off');
  const names = on.map((d) => hardwareDmdName(d));
  if (setup?.zedmdWifi?.enabled) names.push(t('ZeDMD en wifi ({address})', { address: setup.zedmdWifi.address }));
  const problems = on.map((d) => hardwareDmdDriverProblem(d)).filter((p): p is string => Boolean(p));
  if (setup?.menu && names.length && serverProblem) problems.push(t('Image du front-end sur le DMD réel : {problem}', { problem: serverProblem }));
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
