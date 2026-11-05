// DOF (DirectOutput Framework) en mode plugins de VPX 10.8.1 : le plugin « DOF » de VPX
// embarque libdof (vpinball/libdof eef645d, épinglé par VPX af26b2d93) et pilote les
// contrôleurs de retours de la borne (solénoïdes, LED, LED adressables, vibreur…) d'après les
// directoutputconfig<N>.ini du configtool. Ce module est pur : il reconnaît les contrôleurs à
// leurs identifiants USB, lus passivement (aucun port n'est ouvert, contrairement aux
// détecteurs de libdof), lit le dossier de configuration de DOF, dit ce qui empêche une LED de
// s'allumer, et écrit Cabinet.xml pour les bandes de LED adressables décrites dans Cyber Pinball.
//
// Ce que fait libdof (sources citées par fichier, au commit eef645d) :
// - DOF.cpp : GlobalConfig_B2SServer.xml cherché dans <prefPath>directoutputconfig\, puis
//   .\directoutputconfig\ (dossier de travail de VPX) ; prefPath = %APPDATA%\VPinballX\10.8\.
// - GlobalConfig.cpp (GetIniFilesDictionary) : ini cherchés dans IniFilesPath, le dossier de la
//   table, le dossier du GlobalConfig, le dossier de travail ; directoutputconfig*.ini d'abord
//   dans tous ces dossiers, puis ledcontrol*.ini ; on s'arrête au premier dossier qui en a.
// - Pinball.cpp : Cabinet.xml lu seulement si CabinetConfigFilePattern le désigne ; sinon
//   AutoConfig seule (Cabinet.cpp) : Teensy, Wemos, PinControl et Art-Net n'existent alors pas.
// - LedControlConfigList.cpp : ROM trouvée par égalité sans casse, puis « <rom>_… », puis préfixe.
// - Configurator.cpp : une colonne de l'ini vise la sortie de même numéro du LedWizEquivalent,
//   dont OutputName est le nom du toy (bande LedStrip) ; une matrice occupe 3 numéros.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import type { ObservedUsbDevice } from './model';
import type { DofFacts } from './health';
import type { Severity, SyncFinding } from './sync';
import type { VpxSetting } from './vpx';

// ---------------------------------------------------------------------------
// Catalogue des contrôleurs
// ---------------------------------------------------------------------------

/** Types de contrôleurs que libdof sait charger (OutputControllerList.cpp), sous leur nom de Cabinet.xml. */
export const DOF_CONTROLLER_TYPES = [
  'Pinscape',
  'PinscapePico',
  'LedWiz',
  'DudesCab',
  'UMXController',
  'PacLed64',
  'PacDrive',
  'PacUIO',
  'FT245RBitbangController',
  'PinOne',
  'TeensyStripController',
  'WemosD1MPStripController',
  'PinControl',
  'ArtNet',
] as const;

export type DofControllerType = (typeof DOF_CONTROLLER_TYPES)[number];

export interface DofControllerInfo {
  /** Nom courant du matériel. */
  label: string;
  /** libdof le trouve seul (AutoConfig) ; sinon il doit être déclaré dans Cabinet.xml. */
  auto: boolean;
  /** Pilote des LED adressables (WS2811, WS2812…). */
  addressable: boolean;
  /** Numéros des directoutputconfig<N>.ini qu'il lit, en clair (« 51 à 66 »). */
  numbers: string;
}

/** Ce que chaque type est, et quels ini il lit (autoconfigurateurs de libdof : unitBias, ledWizNumber). */
export const DOF_CONTROLLERS: Record<DofControllerType, DofControllerInfo> = {
  Pinscape: { label: 'Pinscape (KL25Z)', auto: true, addressable: false, numbers: '51–66' },
  PinscapePico: { label: 'Pinscape Pico', auto: true, addressable: true, numbers: '120+' },
  LedWiz: { label: 'LedWiz', auto: true, addressable: false, numbers: '1–16' },
  DudesCab: { label: 'DudesCab', auto: true, addressable: true, numbers: '90–94' },
  UMXController: { label: 'UMX', auto: true, addressable: true, numbers: '' },
  PacLed64: { label: 'PacLed64', auto: true, addressable: false, numbers: '20–23' },
  PacDrive: { label: 'PacDrive', auto: true, addressable: false, numbers: '19' },
  PacUIO: { label: 'Ultimate I/O', auto: true, addressable: false, numbers: '27–28' },
  FT245RBitbangController: { label: 'SainSmart / FT245R', auto: true, addressable: false, numbers: '40–49' },
  PinOne: { label: 'PinOne', auto: true, addressable: false, numbers: '11' },
  TeensyStripController: { label: 'Teensy (TeensyStripController)', auto: false, addressable: true, numbers: '30' },
  WemosD1MPStripController: { label: 'Wemos D1 (WemosD1MPStripController)', auto: false, addressable: true, numbers: '30' },
  PinControl: { label: 'PinControl', auto: false, addressable: false, numbers: '' },
  ArtNet: { label: 'Art-Net (DMX)', auto: false, addressable: true, numbers: '' },
};

export function isDofControllerType(type: string): type is DofControllerType {
  return (DOF_CONTROLLER_TYPES as readonly string[]).includes(type);
}

/** Numéro de l'ini du configtool pour les LED adressables (LedWizEquivalent du Cabinet.xml). */
export const DOF_ADDRESSABLE_NUMBER = 30;

// ---------------------------------------------------------------------------
// Détection passive
// ---------------------------------------------------------------------------

/** Nom HID d'un périphérique, connu par ailleurs (joysticks lus par le SDL de VPX). */
export interface HidName {
  vid: number;
  pid: number;
  name: string;
}

export interface DetectedDofController {
  type: DofControllerType;
  /** « FAFA:00F7 » */
  usb: string;
  device: ObservedUsbDevice;
  /** Numéros d'ini possibles : un seul quand le matériel est sûr. */
  numbers: number[];
  /** false : identifiant partagé avec d'autres matériels (LedWiz ou Pinscape, convertisseur série…). */
  certain: boolean;
  /** Le numéro d'unité est réglé sur la carte et n'est pas lisible sans l'ouvrir : on suppose 1. */
  unitAssumed?: boolean;
  /** Autres types possibles pour ce périphérique. */
  alternatives?: DofControllerType[];
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

/** « FAFA:00F7 » */
export function usbId(vid: number, pid: number): string {
  return `${hex4(vid)}:${hex4(pid)}`;
}

/**
 * Identifiants USB d'un joystick d'après son jeton SDL (« SDLJoy_<GUID>_<rang> ») : le GUID
 * de SDL porte le fabricant aux octets 4-5 et le produit aux octets 8-9, en petit-boutiste
 * (SDL_joystick.c, SDL_CreateJoystickGUID). undefined pour un GUID sans identifiants USB.
 */
export function sdlJoystickUsbIds(token: string): { vid: number; pid: number } | undefined {
  const m = /SDLJoy_([0-9a-f]{32})/i.exec(token);
  if (!m) return undefined;
  const g = m[1]!;
  const word = (byte: number) => parseInt(g.slice(byte * 2 + 2, byte * 2 + 4) + g.slice(byte * 2, byte * 2 + 2), 16);
  const vid = word(4);
  const pid = word(8);
  return vid ? { vid, pid } : undefined;
}

/** Un périphérique composite apparaît une fois par interface (…&MI_00) : on garde le périphérique, avec un port série d'une de ses interfaces. */
function physicalDevices(devices: ObservedUsbDevice[], match: (d: ObservedUsbDevice) => boolean): ObservedUsbDevice[] {
  const same = devices.filter(match);
  const isInterface = (d: ObservedUsbDevice) => /&MI_[0-9A-F]{2}/i.test(d.instanceId);
  const parents = same.filter((d) => !isInterface(d));
  if (!parents.length) return same.filter(isInterface).slice(0, 1);
  return parents.map((p) => {
    if (p.port) return p;
    const iface = same.find((d) => isInterface(d) && d.port && d.vid === p.vid && d.pid === p.pid);
    return iface?.port ? { ...p, port: iface.port } : p;
  });
}

/**
 * Contrôleurs DOF reconnus parmi les périphériques USB présents. Identifiants relevés dans
 * libdof (Pinscape.cpp, LedWiz.cpp, DudesCab.h, PacDriveSingleton.cpp, FTDI.cpp) ; le Teensy
 * est reconnu à l'identifiant série de PJRC (16C0:0483), le seul qu'il présente en
 * TeensyStripController. Les noms HID connus (joysticks) départagent Pinscape et LedWiz.
 */
export function detectDofControllers(devices: ObservedUsbDevice[], hidNames: HidName[] = []): DetectedDofController[] {
  const found: DetectedDofController[] = [];
  const nameOf = (d: ObservedUsbDevice) =>
    [d.name, ...hidNames.filter((h) => h.vid === d.vid && h.pid === d.pid).map((h) => h.name)].filter(Boolean).join(' ').toLowerCase();
  const add = (d: ObservedUsbDevice, c: Omit<DetectedDofController, 'usb' | 'device'>) => found.push({ ...c, usb: usbId(d.vid, d.pid), device: d });

  // LedWiz et Pinscape KL25Z en émulation LedWiz : FAFA:00F0 à 00FF, unité = PID & 0xF + 1.
  for (const d of physicalDevices(devices, (x) => x.vid === 0xfafa && (x.pid & 0xfff0) === 0x00f0)) {
    const unit = (d.pid & 0x0f) + 1;
    const name = nameOf(d);
    if (name.includes('pinscape pico') || name.includes('pinscapepico')) add(d, { type: 'PinscapePico', numbers: [119 + unit], certain: true });
    else if (name.includes('pinscape')) add(d, { type: 'Pinscape', numbers: [50 + unit], certain: true });
    else add(d, { type: 'LedWiz', numbers: [unit, 50 + unit], certain: false, alternatives: ['Pinscape'] });
  }
  // LedWiz de zebsboards (20A0, fabricant « zebsboards » : le nom seul ne se lit pas sans ouvrir).
  for (const d of physicalDevices(devices, (x) => x.vid === 0x20a0 && (x.pid & 0xfff0) === 0x00f0)) {
    add(d, { type: 'LedWiz', numbers: [(d.pid & 0x0f) + 1], certain: false });
  }
  // Pinscape KL25Z en mode natif (pid.codes 1209:EAEA) : l'unité est réglée sur la carte.
  for (const d of physicalDevices(devices, (x) => x.vid === 0x1209 && x.pid === 0xeaea)) {
    add(d, { type: 'Pinscape', numbers: [51], certain: true, unitAssumed: true });
  }
  // Pinscape Pico : reconnu à son nom de produit (libdof n'a pas de filtre d'identifiant).
  for (const d of physicalDevices(devices, (x) => /pinscape ?pico/i.test(nameOf(x)) && !(x.vid === 0xfafa && (x.pid & 0xfff0) === 0x00f0))) {
    add(d, { type: 'PinscapePico', numbers: [120], certain: true, unitAssumed: true });
  }
  for (const d of physicalDevices(devices, (x) => x.vid === 0x2e8a && x.pid === 0x106f)) {
    add(d, { type: 'DudesCab', numbers: [90], certain: true, unitAssumed: true });
  }
  for (const d of physicalDevices(devices, (x) => x.vid === 0xd209 && x.pid >= 0x1401 && x.pid <= 0x1404)) {
    add(d, { type: 'PacLed64', numbers: [19 + (d.pid - 0x1400)], certain: true });
  }
  for (const d of physicalDevices(devices, (x) => x.vid === 0xd209 && x.pid === 0x1500)) {
    add(d, { type: 'PacDrive', numbers: [19], certain: true });
  }
  for (const d of physicalDevices(devices, (x) => x.vid === 0xd209 && (x.pid === 0x0410 || x.pid === 0x0411))) {
    add(d, { type: 'PacUIO', numbers: [27 + (d.pid - 0x0410)], certain: true });
  }
  physicalDevices(devices, (x) => x.vid === 0x0403 && x.pid === 0x6001).forEach((d, i) => {
    add(d, { type: 'FT245RBitbangController', numbers: [40 + i], certain: false });
  });
  for (const d of physicalDevices(devices, (x) => x.vid === 0x16c0 && x.pid === 0x0483)) {
    add(d, { type: 'TeensyStripController', numbers: [DOF_ADDRESSABLE_NUMBER], certain: false });
  }
  return found;
}

/**
 * Convertisseurs USB-série d'une carte Wemos D1 mini (CH340, CP210x) : rien ne les distingue
 * d'un ZeDMD ou d'un Arduino. Proposés comme port d'un WemosD1MPStripController, jamais affirmés.
 */
export function serialPortCandidates(devices: ObservedUsbDevice[]): { port: string; usb: string; name?: string }[] {
  const out: { port: string; usb: string; name?: string }[] = [];
  for (const d of devices) {
    if (!d.port || out.some((o) => o.port === d.port)) continue;
    out.push({ port: d.port, usb: usbId(d.vid, d.pid), ...(d.name ? { name: d.name } : {}) });
  }
  return out.sort((a, b) => comNumber(a.port) - comNumber(b.port));
}

function comNumber(port: string): number {
  const m = /COM(\d+)/i.exec(port);
  return m ? Number(m[1]) : 9999;
}

// ---------------------------------------------------------------------------
// XML minimal (GlobalConfig, Cabinet.xml)
// ---------------------------------------------------------------------------

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Lit un document XML simple (éléments, attributs, texte) ; lève une erreur s'il est mal formé. */
export function parseXml(source: string): XmlElement {
  const text = source.replace(/^﻿/, '');
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) {
      if (top.name !== m[2]) throw new Error(t('XML mal formé : </{close}> ferme <{open}>.', { close: m[2], open: top.name }));
      stack.pop();
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of (m[4] ?? '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
      const el: XmlElement = { name: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
    else if (m[0].startsWith('<') && !m[0].startsWith('<!--') && !m[0].startsWith('<?') && !m[0].startsWith('<!')) {
      throw new Error(t('XML mal formé près de « {text} ».', { text: m[0].slice(0, 40) }));
    }
  }
  if (stack.length > 1) throw new Error(t('XML mal formé : <{open}> jamais fermé.', { open: stack[stack.length - 1]!.name }));
  return root;
}

function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

function childText(el: XmlElement | undefined, name: string): string | undefined {
  const c = child(el, name);
  const v = c?.text.trim();
  return v ? v : undefined;
}

// ---------------------------------------------------------------------------
// Lecture du dossier de configuration
// ---------------------------------------------------------------------------

/** Marque des fichiers écrits par Cyber Pinball : seuls ceux-là sont réécrits. */
export const DOF_OWNED_MARK = 'Cyber Pinball';
const OWNED_COMMENT = /<!--\s*(?:Écrit|Written) (?:par|by) Cyber Pinball/;

export interface DofIniFile {
  number: number;
  file: string;
  /** Noms courts des ROM de [Config DOF] (première colonne), dans l'ordre du fichier. */
  roms: string[];
}

export interface DofGlobalConfig {
  file: string;
  owned: boolean;
  iniFilesPath?: string;
  cabinetPattern?: string;
}

export interface DofCabinetController {
  type: string;
  name: string;
  comPort?: string;
  /** Art-Net : univers DMX et adresse de diffusion. */
  universe?: number;
  address?: string;
  /** NumberOfLedsStrip1..10 des contrôleurs de LED adressables. */
  ledsPerOutput?: number[];
}

export interface DofCabinetStrip {
  name: string;
  width: number;
  height: number;
  firstLed: number;
  controller?: string;
  arrangement?: string;
  colorOrder?: string;
  brightness?: number;
}

export interface DofCabinetEquivalent {
  name: string;
  number: number;
  outputs: { number: number; name: string }[];
}

export interface DofCabinetFile {
  file: string;
  owned: boolean;
  autoConfig: boolean;
  controllers: DofCabinetController[];
  strips: DofCabinetStrip[];
  equivalents: DofCabinetEquivalent[];
  /** Noms de tous les toys déclarés (bandes, LED RGB, lampes, moteurs…). */
  toyNames: string[];
}

export interface DofSetup {
  /** <prefPath>directoutputconfig : là où libdof cherche son GlobalConfig. */
  dir: string;
  globalConfig?: DofGlobalConfig;
  /** Dossier où libdof trouvera les ini hors dossier de table ; undefined s'il n'y en a aucun. */
  iniDir?: string;
  ini: DofIniFile[];
  /** Cabinet.xml que libdof chargera (désigné par CabinetConfigFilePattern). */
  cabinet?: DofCabinetFile;
  /** Cabinet.xml présent dans le dossier mais que libdof ne lira pas (aucun GlobalConfig ne le désigne). */
  ignoredCabinet?: string;
  /** CabinetConfigFilePattern qui ne désigne aucun fichier. */
  cabinetPatternMissing?: string;
  /** IniFilesPath qui ne désigne aucun dossier. */
  iniFilesPathMissing?: string;
  /** Fichiers illisibles, avec la raison. */
  errors: { file: string; message: string }[];
}

const INI_NAMES = ['directoutputconfig', 'ledcontrol'] as const;

/** Numéro d'un ini de DOF d'après son nom ; undefined pour un autre fichier. */
export function dofIniNumber(file: string, prefix?: (typeof INI_NAMES)[number]): number | undefined {
  const lower = path.basename(file).toLowerCase();
  for (const p of prefix ? [prefix] : INI_NAMES) {
    if (!lower.startsWith(p) || !lower.endsWith('.ini')) continue;
    const middle = lower.slice(p.length, -4);
    if (middle === '') return 1;
    if (/^\d+$/.test(middle)) return Number(middle);
  }
  return undefined;
}

function listIni(dir: string, prefix: (typeof INI_NAMES)[number]): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => dofIniNumber(n, prefix) !== undefined).map((n) => path.join(dir, n));
}

/** Premier dossier qui contient des ini, dans l'ordre de libdof (directoutputconfig partout, puis ledcontrol). */
export function dofIniFolder(lookup: string[]): { dir: string; files: string[] } | undefined {
  for (const prefix of INI_NAMES) {
    for (const dir of lookup) {
      const files = listIni(dir, prefix);
      if (files.length) return { dir, files };
    }
  }
  return undefined;
}

/** Noms courts des ROM de la section [Config DOF] (ou [Config outs]) d'un ini du configtool. */
export function dofIniRoms(text: string): string[] {
  const roms: string[] = [];
  let inConfig = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']') && line.length > 2) {
      inConfig = /^\[Config (DOF|outs)\]$/i.test(line);
      continue;
    }
    if (!inConfig || !line || line.startsWith('#') || line.startsWith(';')) continue;
    const rom = line.split(',')[0]!.trim();
    if (rom) roms.push(rom);
  }
  return roms;
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Variables de chemin de libdof que l'on sait remplacer hors partie (GlobalConfig.cpp, GetReplaceValuesDictionary). */
function resolvePattern(pattern: string, globalDir: string): string {
  const replaced = pattern.replace(/\{(GlobalConfigDirectory|GlobalConfigDir)\}/gi, globalDir);
  return path.isAbsolute(replaced) ? replaced : path.resolve(globalDir, replaced);
}

function readGlobalConfig(file: string): DofGlobalConfig {
  const text = fs.readFileSync(file, 'utf8');
  const root = child(parseXml(text), 'GlobalConfig');
  if (!root) throw new Error(t('Ce n’est pas un GlobalConfig de DOF (pas d’élément <GlobalConfig>).'));
  const iniFilesPath = childText(root, 'IniFilesPath');
  const cabinetPattern = childText(root, 'CabinetConfigFilePattern');
  return { file, owned: OWNED_COMMENT.test(text), ...(iniFilesPath ? { iniFilesPath } : {}), ...(cabinetPattern ? { cabinetPattern } : {}) };
}

/** Lit un Cabinet.xml de DOF : contrôleurs, bandes et LedWizEquivalent. */
export function readCabinetXml(file: string, text = fs.readFileSync(file, 'utf8')): DofCabinetFile {
  const root = child(parseXml(text), 'Cabinet');
  if (!root) throw new Error(t('Ce n’est pas un Cabinet.xml de DOF (pas d’élément <Cabinet>).'));
  const controllers: DofCabinetController[] = [];
  for (const c of child(root, 'OutputControllers')?.children ?? []) {
    const leds: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const v = childText(c, `NumberOfLedsStrip${i}`);
      if (v !== undefined) leds[i - 1] = Number(v) || 0;
    }
    const comPort = childText(c, 'ComPortName');
    const universe = childText(c, 'Universe');
    const address = childText(c, 'BroadcastAddress');
    controllers.push({
      type: c.name,
      name: childText(c, 'Name') ?? c.attrs.Name ?? c.name,
      ...(comPort ? { comPort } : {}),
      ...(universe !== undefined ? { universe: Number(universe) } : {}),
      ...(address ? { address } : {}),
      ...(leds.length ? { ledsPerOutput: Array.from(leds, (v) => v ?? 0) } : {}),
    });
  }
  const strips: DofCabinetStrip[] = [];
  const equivalents: DofCabinetEquivalent[] = [];
  const toyNames: string[] = [];
  for (const toy of child(root, 'Toys')?.children ?? []) {
    const toyName = childText(toy, 'Name');
    if (toyName) toyNames.push(toyName);
    if (toy.name === 'LedStrip') {
      const controller = childText(toy, 'OutputControllerName');
      const arrangement = childText(toy, 'LedStripArrangement');
      const colorOrder = childText(toy, 'ColorOrder');
      const brightness = childText(toy, 'Brightness');
      strips.push({
        name: toyName ?? '',
        width: Number(childText(toy, 'Width') ?? 1),
        height: Number(childText(toy, 'Height') ?? 1),
        firstLed: Number(childText(toy, 'FirstLedNumber') ?? 1),
        ...(controller ? { controller } : {}),
        ...(arrangement ? { arrangement } : {}),
        ...(colorOrder ? { colorOrder } : {}),
        ...(brightness !== undefined ? { brightness: Number(brightness) } : {}),
      });
    } else if (toy.name === 'LedWizEquivalent') {
      equivalents.push({
        name: childText(toy, 'Name') ?? '',
        number: Number(childText(toy, 'LedWizNumber') ?? 0),
        outputs: (child(toy, 'Outputs')?.children ?? [])
          .filter((o) => o.name === 'LedWizEquivalentOutput')
          .map((o) => ({ number: Number(childText(o, 'LedWizEquivalentOutputNumber') ?? 0), name: childText(o, 'OutputName') ?? '' })),
      });
    }
  }
  const auto = childText(root, 'AutoConfigEnabled');
  return { file, owned: OWNED_COMMENT.test(text), autoConfig: auto === undefined ? true : auto.toLowerCase() === 'true', controllers, strips, equivalents, toyNames };
}

/**
 * Ce que libdof lira hors du dossier d'une table. `dir` est <prefPath>directoutputconfig ;
 * `workDir`, le dossier de travail de VPX (dossier de son exécutable), dernier recours de libdof.
 */
export function readDofSetup(dir: string, workDir?: string): DofSetup {
  const setup: DofSetup = { dir, ini: [], errors: [] };
  let globalFile = path.join(dir, 'GlobalConfig_B2SServer.xml');
  if (!exists(globalFile) && workDir && exists(path.join(workDir, 'directoutputconfig', 'GlobalConfig_B2SServer.xml'))) {
    globalFile = path.join(workDir, 'directoutputconfig', 'GlobalConfig_B2SServer.xml');
  }
  const globalDir = path.dirname(globalFile);
  if (exists(globalFile)) {
    try {
      setup.globalConfig = readGlobalConfig(globalFile);
    } catch (e) {
      setup.errors.push({ file: globalFile, message: (e as Error).message });
    }
  }
  const lookup: string[] = [];
  const iniFilesPath = setup.globalConfig?.iniFilesPath;
  if (iniFilesPath) {
    const p = resolvePattern(iniFilesPath, globalDir);
    if (exists(p)) lookup.push(p);
    else setup.iniFilesPathMissing = iniFilesPath;
  }
  lookup.push(globalDir);
  if (workDir) lookup.push(workDir);
  const found = dofIniFolder(lookup);
  if (found) {
    setup.iniDir = found.dir;
    for (const file of found.files) {
      const number = dofIniNumber(file)!;
      try {
        setup.ini.push({ number, file, roms: dofIniRoms(fs.readFileSync(file, 'latin1')) });
      } catch (e) {
        setup.errors.push({ file, message: (e as Error).message });
      }
    }
    setup.ini.sort((a, b) => a.number - b.number);
  }
  const pattern = setup.globalConfig?.cabinetPattern;
  if (pattern) {
    const file = resolvePattern(pattern, globalDir);
    if (exists(file)) {
      try {
        setup.cabinet = readCabinetXml(file);
      } catch (e) {
        setup.errors.push({ file, message: (e as Error).message });
      }
    } else setup.cabinetPatternMissing = pattern;
  }
  if (!setup.cabinet && !setup.cabinetPatternMissing) {
    const stray = ['Cabinet.xml', 'cabinet.xml'].map((n) => path.join(dir, n)).find(exists);
    if (stray) setup.ignoredCabinet = stray;
  }
  return setup;
}

// ---------------------------------------------------------------------------
// ROM d'une table
// ---------------------------------------------------------------------------

/**
 * Numéros des ini qui ont une configuration pour cette ROM, avec les trois règles de libdof
 * dans l'ordre (LedControlConfigList::GetTableConfigDictionary) : égalité sans casse ;
 * sinon la ROM commence par « <nom court>_ » (sans casse) ; sinon par le nom court (avec casse).
 */
export function dofRomNumbers(ini: DofIniFile[], rom: string): number[] {
  const upper = rom.toUpperCase();
  const rules: ((short: string) => boolean)[] = [
    (s) => s.toUpperCase() === upper,
    (s) => upper.startsWith(`${s.toUpperCase()}_`),
    (s) => rom.startsWith(s),
  ];
  for (const rule of rules) {
    const numbers = ini.filter((f) => f.roms.some(rule)).map((f) => f.number);
    if (numbers.length) return numbers;
  }
  return [];
}

/** ini de DOF posés dans le dossier d'une table : ils passent avant le dossier global quand IniFilesPath n'est pas réglé. */
export function tableDofIni(folder: string): string[] {
  return [...listIni(folder, 'directoutputconfig'), ...listIni(folder, 'ledcontrol')];
}

/** Les ini du dossier de la table masquent-ils ceux de la borne ? (ordre de libdof : IniFilesPath, table, GlobalConfig). */
export function tableIniMasksGlobal(setup: DofSetup, folder: string): boolean {
  const local = tableDofIni(folder);
  if (!local.length) return false;
  const iniFilesPath = setup.globalConfig?.iniFilesPath;
  if (iniFilesPath && !setup.iniFilesPathMissing && setup.iniDir && path.resolve(setup.iniDir) !== path.resolve(folder)) {
    // IniFilesPath passe avant le dossier de la table : les ini de la table ne servent pas.
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Constats
// ---------------------------------------------------------------------------

export const DOF_FINDING_CODES = [
  'noController',
  'noIni',
  'missingIni',
  'orphanIni',
  'addressableUndeclared',
  'cabinetIgnored',
  'cabinetMissing',
  'cabinetPortMissing',
  'unknownControllerType',
  'stripUnmapped',
  'outputUnknownToy',
  'stripController',
  'equivalentWithoutIni',
  'iniFilesPathMissing',
  'unreadable',
] as const;

export type DofFindingCode = (typeof DOF_FINDING_CODES)[number];

export interface DofFinding extends SyncFinding {
  code: DofFindingCode;
}

/** Ports série présents (COM3…), pour vérifier ceux de Cabinet.xml. */
function presentPorts(devices: ObservedUsbDevice[]): Set<string> {
  return new Set(devices.map((d) => d.port?.toUpperCase()).filter((p): p is string => Boolean(p)));
}

/**
 * Ce qui empêchera DOF d'allumer quelque chose, d'après les contrôleurs branchés et le dossier
 * de configuration. Jamais bloquant : une borne joue sans DOF.
 */
export function dofFindings(setup: DofSetup, detected: DetectedDofController[], devices: ObservedUsbDevice[]): DofFinding[] {
  const out: DofFinding[] = [];
  const push = (code: DofFindingCode, severity: Severity, message: string) => out.push({ code, severity, message });
  const numbers = new Set(setup.ini.map((f) => f.number));
  const declared = setup.cabinet?.controllers ?? [];

  for (const e of setup.errors) push('unreadable', 'warning', t('{file} illisible : {message}', { file: path.basename(e.file), message: e.message }));
  if (setup.iniFilesPathMissing) {
    push('iniFilesPathMissing', 'warning', t('GlobalConfig : IniFilesPath désigne « {path} », qui n’existe pas. DOF cherche alors ses ini ailleurs.', { path: setup.iniFilesPathMissing }));
  }

  if (!detected.length && !declared.length && !setup.ini.length) {
    push('noController', 'info', t('Aucun contrôleur DOF reconnu et aucune configuration : DOF reste éteint.'));
    return out;
  }
  if (!setup.ini.length) {
    push('noIni', 'warning', t('Aucun fichier directoutputconfig.ini : DOF ne sait pas quoi allumer. Importez la configuration de votre borne faite sur configtool.vpuniverse.com.'));
  }
  for (const d of detected) {
    if (d.type === 'TeensyStripController' || !setup.ini.length) continue;
    if (!d.numbers.some((n) => numbers.has(n))) {
      push(
        'missingIni',
        'warning',
        t('{controller} ({usb}) : aucun directoutputconfig{n}.ini. Dans le configtool, déclarez ce contrôleur sous le numéro {n}, puis réimportez la configuration.', {
          controller: DOF_CONTROLLERS[d.type].label,
          usb: d.usb,
          n: d.numbers.join(t(' ou ')),
        }),
      );
    }
  }
  const used = new Set<number>([...detected.flatMap((d) => d.numbers), ...(setup.cabinet?.equivalents.map((e) => e.number) ?? [])]);
  for (const f of setup.ini) {
    if (!used.has(f.number)) {
      push('orphanIni', 'info', t('{file} : aucun contrôleur branché ne lit ce numéro (contrôleur débranché, ou numéro d’unité réglé autrement sur la carte).', { file: path.basename(f.file) }));
    }
  }

  // LED adressables : un Teensy branché, mais rien ne le déclare.
  const teensy = detected.filter((d) => d.type === 'TeensyStripController');
  if (teensy.length && !declared.some((c) => c.type === 'TeensyStripController')) {
    push(
      'addressableUndeclared',
      'warning',
      t('Teensy branché ({port}) mais aucun Cabinet.xml ne le déclare : libdof ne le trouve pas seul. Décrivez vos bandes de LED dans « LED et retours (DOF) ».', {
        port: teensy.map((d) => d.device.port ?? d.usb).join(', '),
      }),
    );
  }
  if (setup.ignoredCabinet) {
    push('cabinetIgnored', 'warning', t('{file} est dans le dossier de DOF mais aucun GlobalConfig ne le désigne (CabinetConfigFilePattern) : libdof ne le lit pas.', { file: setup.ignoredCabinet }));
  }
  if (setup.cabinetPatternMissing) {
    push('cabinetMissing', 'warning', t('GlobalConfig : CabinetConfigFilePattern désigne « {pattern} », introuvable.', { pattern: setup.cabinetPatternMissing }));
  }

  const ports = presentPorts(devices);
  for (const c of declared) {
    if (c.type === 'NullOutputController') continue;
    if (!isDofControllerType(c.type)) {
      push('unknownControllerType', 'warning', t('Cabinet.xml : « {type} » ({name}) n’est pas géré par le plugin DOF de VPX (libdof) : ce contrôleur restera éteint.', { type: c.type, name: c.name }));
      continue;
    }
    if (c.comPort && ports.size && !ports.has(c.comPort.toUpperCase())) {
      push('cabinetPortMissing', 'warning', t('Cabinet.xml : {name} sur {port}, mais aucun périphérique branché n’a ce port.', { name: c.name, port: c.comPort }));
    }
  }
  if (setup.cabinet) {
    const stripNames = new Set(setup.cabinet.strips.map((s) => s.name));
    const toyNames = new Set(setup.cabinet.toyNames);
    const outputNames = new Set(setup.cabinet.equivalents.flatMap((e) => e.outputs.map((o) => o.name)));
    for (const s of setup.cabinet.strips) {
      if (!outputNames.has(s.name)) push('stripUnmapped', 'warning', t('Bande « {name} » : aucune sortie de LedWizEquivalent ne la vise, elle ne s’allumera jamais.', { name: s.name }));
      if (s.controller && !declared.some((c) => c.name === s.controller)) {
        push('stripController', 'warning', t('Bande « {name} » : son contrôleur « {controller} » n’est pas déclaré.', { name: s.name, controller: s.controller }));
      }
    }
    for (const e of setup.cabinet.equivalents) {
      // Un LedWizEquivalent de LED adressables (il vise au moins une bande) ne vise que des toys ;
      // ceux des autres contrôleurs peuvent viser des sorties physiques, qu'on ne vérifie pas.
      if (e.outputs.some((o) => stripNames.has(o.name))) {
        for (const o of e.outputs) {
          if (!toyNames.has(o.name)) push('outputUnknownToy', 'warning', t('{equivalent}, sortie {n} : « {name} » n’est ni une bande ni un toy déclaré.', { equivalent: e.name, n: o.number, name: o.name }));
        }
      }
      if (setup.ini.length && !numbers.has(e.number)) {
        push('equivalentWithoutIni', 'warning', t('{equivalent} : aucun directoutputconfig{n}.ini. Dans le configtool, le contrôleur de vos LED adressables doit porter le numéro {n}.', { equivalent: e.name, n: e.number }));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// VPinballX.ini
// ---------------------------------------------------------------------------

/** Clés de [Plugin.DOF] que Cyber Pinball peut écrire. */
export const VPX_DOF_OWNED_KEYS = ['Enable'];

/**
 * [Plugin.DOF] Enable = 1 dès qu'un contrôleur est branché, déclaré dans Cabinet.xml, ou que des
 * ini existent. Sinon rien n'est écrit : le plugin reste tel que VPX ou l'utilisateur l'a laissé.
 */
export function vpxDofSettings(setup: DofSetup | undefined, detected: DetectedDofController[]): VpxSetting[] {
  const wanted = detected.length > 0 || (setup?.ini.length ?? 0) > 0 || (setup?.cabinet?.controllers.length ?? 0) > 0;
  return wanted ? [{ section: 'Plugin.DOF', key: 'Enable', value: '1' }] : [];
}

// ---------------------------------------------------------------------------
// LED adressables décrites dans Cyber Pinball → Cabinet.xml
// ---------------------------------------------------------------------------

export const LED_ARRANGEMENTS = [
  'LeftRightTopDown',
  'LeftRightBottomUp',
  'RightLeftTopDown',
  'RightLeftBottomUp',
  'TopDownLeftRight',
  'TopDownRightLeft',
  'BottomUpLeftRight',
  'BottomUpRightLeft',
  'LeftRightAlternateTopDown',
  'LeftRightAlternateBottomUp',
  'RightLeftAlternateTopDown',
  'RightLeftAlternateBottomUp',
  'TopDownAlternateLeftRight',
  'TopDownAlternateRightLeft',
  'BottomUpAlternateLeftRight',
  'BottomUpAlternateRightLeft',
] as const;
export type LedArrangement = (typeof LED_ARRANGEMENTS)[number];

export const LED_COLOR_ORDERS = ['GRB', 'RGB', 'RBG', 'GBR', 'BRG', 'BGR'] as const;
export type LedColorOrder = (typeof LED_COLOR_ORDERS)[number];

/**
 * Cartes qui pilotent des LED adressables, en trois familles (libdof eef645d) :
 * - Teensy, Wemos D1 : port série, déclarés dans Cabinet.xml avec leurs bandes (LedStrip) ;
 * - Art-Net (WLED ou un autre nœud ESP32 sur le réseau) : un contrôleur ArtNet par univers DMX de
 *   512 canaux, soit 170 LED au plus par univers (ArtNet.h, DMX_CHANNELS), déclarés dans Cabinet.xml ;
 * - DudesCab (mode MX) et Pinscape Pico : les bandes se décrivent dans l'outil de la carte, que libdof
 *   lit sur la carte (DudesCab : UMXController::UpdateCabinetFromConfig crée lui-même ses LedStrip ;
 *   Pinscape Pico : les LED sont des sorties de la carte). Un Cabinet.xml les doublerait.
 */
export type LedControllerType = 'TeensyStripController' | 'WemosD1MPStripController' | 'ArtNet' | 'DudesCab' | 'PinscapePico';
export const LED_CONTROLLER_TYPES: readonly LedControllerType[] = ['TeensyStripController', 'WemosD1MPStripController', 'ArtNet', 'DudesCab', 'PinscapePico'];

/** Cartes dont les bandes se décrivent dans leur propre outil : Cyber Pinball n'écrit rien pour elles. */
export function ledsOnBoard(controller: LedControllerType): boolean {
  return controller === 'DudesCab' || controller === 'PinscapePico';
}

/** Cartes reliées par un port série (COM). */
export function ledsOnSerial(controller: LedControllerType): boolean {
  return controller === 'TeensyStripController' || controller === 'WemosD1MPStripController';
}

/** LED d'un univers Art-Net : 512 canaux DMX, 3 par LED. */
export const ARTNET_LEDS_PER_UNIVERSE = 170;
/** Univers Art-Net qu'une borne peut raisonnablement employer. */
export const ARTNET_MAX_UNIVERSES = 16;

/** Sorties d'un contrôleur de LED : 8 sur l'OctoWS2811 du Teensy, 10 au plus dans libdof. */
export const LED_MAX_OUTPUTS = 10;

export interface LedStripSpec {
  /** Nom du toy, celui qu'on retrouve dans le configtool (« PF Back Effects MX »…). */
  name: string;
  /** Sortie (canal) du contrôleur, de 1 à 10. */
  output: number;
  /** Colonnes × lignes : une bande simple est width × 1. */
  width: number;
  height: number;
  arrangement: LedArrangement;
  colorOrder: LedColorOrder;
  /** 0 à 100. */
  brightness: number;
  /** Première sortie du LedWizEquivalent visée par le configtool (1, 4, 7…). */
  dofOutput: number;
}

/** LED adressables de la borne, telles que décrites dans « LED et retours (DOF) ». */
export interface CabinetLeds {
  controller: LedControllerType;
  /** Port série du contrôleur (COM5) ; Teensy et Wemos D1 seulement. */
  port: string;
  /**
   * Bandes ; `output` est la sortie du contrôleur (Teensy, Wemos D1) ou l'univers Art-Net compté
   * depuis `universe` (1 : le premier univers).
   */
  strips: LedStripSpec[];
  /** Numéro de l'ini (30 par défaut, celui du configtool). */
  number?: number;
  /** Art-Net : adresse du nœud (192.168.1.50) ou de diffusion ; vide : diffusion sur tout le réseau. */
  address?: string;
  /** Art-Net : numéro du premier univers (0 par défaut, celui de WLED). */
  universe?: number;
}

/** Sorties qu'offre un contrôleur : sorties du Teensy ou du Wemos, univers Art-Net. */
export function ledOutputCount(controller: LedControllerType): number {
  return controller === 'ArtNet' ? ARTNET_MAX_UNIVERSES : LED_MAX_OUTPUTS;
}

/** Univers Art-Net d'une sortie (1 : le premier univers). */
export function artnetUniverse(leds: Pick<CabinetLeds, 'universe'>, output: number): number {
  return (leds.universe ?? 0) + output - 1;
}

export function stripLedCount(s: Pick<LedStripSpec, 'width' | 'height'>): number {
  return Math.max(0, Math.round(s.width)) * Math.max(0, Math.round(s.height));
}

/** LED de chaque sortie du contrôleur : les bandes d'une sortie sont chaînées, dans l'ordre de la liste. */
export function ledsPerOutput(leds: CabinetLeds): number[] {
  const max = Math.max(0, ...leds.strips.map((s) => s.output));
  const counts = Array.from({ length: max }, () => 0);
  for (const s of leds.strips) counts[s.output - 1]! += stripLedCount(s);
  return counts;
}

/**
 * FirstLedNumber de chaque bande : libdof numérote les LED du contrôleur d'un bout à l'autre,
 * sortie 1 d'abord (TeensyStripController : NumberOfLedsStrip1, puis 2…). Art-Net : chaque univers
 * est un contrôleur à part, la numérotation repart de 1.
 */
export function stripFirstLeds(leds: CabinetLeds): number[] {
  const perOutput = ledsPerOutput(leds);
  const used = Array.from({ length: perOutput.length }, () => 0);
  return leds.strips.map((s) => {
    const before = leds.controller === 'ArtNet' ? 0 : perOutput.slice(0, s.output - 1).reduce((a, b) => a + b, 0);
    const first = before + used[s.output - 1]! + 1;
    used[s.output - 1]! += stripLedCount(s);
    return first;
  });
}

/** Une bande telle que WLED la voit : sa première LED (« Start » dans LED Preferences) et sa longueur. */
export interface WledSegment {
  name: string;
  /** Univers Art-Net où DOF envoie ses couleurs. */
  universe: number;
  /** Index de sa première LED dans WLED (0 : la première). */
  start: number;
  length: number;
}

/**
 * Placement des bandes dans WLED pour la réception Art-Net en « Multi RGB » : WLED range 170 LED par
 * univers à la suite (LED k : univers de départ + k ÷ 170, canaux 3 × (k mod 170) + 1 à 3, adresse
 * DMX de départ 1). DOF envoie chaque bande à son univers, à partir de sa FirstLedNumber : la bande
 * commence donc dans WLED à 170 × (univers − premier univers) + FirstLedNumber − 1. D'un univers à
 * l'autre, la numérotation de WLED a des trous (0, 170, 340…) : une bande de DOF ne déborde jamais
 * d'un univers sur le suivant.
 */
export function wledSegments(leds: CabinetLeds): WledSegment[] {
  if (leds.controller !== 'ArtNet') return [];
  const firsts = stripFirstLeds(leds);
  return leds.strips.map((s, i) => ({
    name: s.name.trim(),
    universe: artnetUniverse(leds, s.output),
    start: ARTNET_LEDS_PER_UNIVERSE * (s.output - 1) + firsts[i]! - 1,
    length: stripLedCount(s),
  }));
}

/** Nombre de LED à déclarer dans WLED : jusqu'au bout de la dernière bande, trous compris. */
export function wledLedCount(leds: CabinetLeds): number {
  return Math.max(0, ...wledSegments(leds).map((g) => g.start + g.length));
}

/** Ce qui empêche d'écrire Cabinet.xml (liste vide : on peut). */
export function ledProblems(leds: CabinetLeds): string[] {
  const problems: string[] = [];
  if (ledsOnBoard(leds.controller)) {
    problems.push(t('{controller} : les bandes se décrivent dans l’outil de la carte, DOF les y lit ; Cyber Pinball n’a rien à écrire.', { controller: DOF_CONTROLLERS[leds.controller].label }));
    return problems;
  }
  if (ledsOnSerial(leds.controller) && !/^COM\d+$/i.test(leds.port.trim())) problems.push(t('Port série du contrôleur à choisir (COM3, COM5…).'));
  if (leds.controller === 'ArtNet' && leds.address?.trim() && !/^\d{1,3}(\.\d{1,3}){3}$/.test(leds.address.trim())) {
    problems.push(t('Adresse Art-Net « {address} » : une adresse IP (192.168.1.50), ou rien pour diffuser sur tout le réseau.', { address: leds.address }));
  }
  if (!leds.strips.length) problems.push(t('Aucune bande décrite.'));
  const names = new Set<string>();
  const outputs = new Set<number>();
  const max = ledOutputCount(leds.controller);
  for (const s of leds.strips) {
    if (!s.name.trim()) problems.push(t('Une bande n’a pas de nom.'));
    else if (names.has(s.name.trim())) problems.push(t('Deux bandes s’appellent « {name} ».', { name: s.name }));
    names.add(s.name.trim());
    if (!Number.isInteger(s.output) || s.output < 1 || s.output > max) problems.push(t('« {name} » : sortie {n} hors de 1 à {max}.', { name: s.name, n: s.output, max }));
    if (stripLedCount(s) < 1) problems.push(t('« {name} » : aucune LED.', { name: s.name }));
    if (outputs.has(s.dofOutput)) problems.push(t('Sortie DOF {n} donnée à deux bandes.', { n: s.dofOutput }));
    outputs.add(s.dofOutput);
    if (!Number.isInteger(s.dofOutput) || s.dofOutput < 1) problems.push(t('« {name} » : sortie DOF invalide.', { name: s.name }));
  }
  if (leds.controller === 'ArtNet') {
    ledsPerOutput(leds).forEach((n, i) => {
      if (n > ARTNET_LEDS_PER_UNIVERSE) {
        problems.push(t('Univers Art-Net {u} : {n} LED, {max} au plus (512 canaux DMX). Répartissez les bandes sur plusieurs univers.', { u: artnetUniverse(leds, i + 1), n, max: ARTNET_LEDS_PER_UNIVERSE }));
      }
    });
  }
  return problems;
}

/** Sorties DOF par défaut du configtool pour les toys en matrice : 1, 4, 7… */
export function nextDofOutput(strips: Pick<LedStripSpec, 'dofOutput'>[]): number {
  const used = new Set(strips.map((s) => s.dofOutput));
  let n = 1;
  while (used.has(n)) n += 3;
  return n;
}

function el(name: string, value: string | number, indent: string): string {
  return `${indent}<${name}>${escapeXml(String(value))}</${name}>`;
}

/** Cabinet.xml des LED adressables décrites ; l'auto-configuration des autres contrôleurs reste active. */
export function cabinetXml(leds: CabinetLeds, now = new Date()): string {
  const number = leds.number ?? DOF_ADDRESSABLE_NUMBER;
  const counts = ledsPerOutput(leds);
  const firsts = stripFirstLeds(leds);
  const artnet = leds.controller === 'ArtNet';
  /** Nom du contrôleur qui porte une bande : un par univers Art-Net. */
  const controllerOf = (output: number) => (artnet ? `Art-Net ${artnetUniverse(leds, output)}` : leds.controller === 'TeensyStripController' ? 'Teensy' : 'Wemos');
  const controllers: string[] = [];
  if (artnet) {
    const used = [...new Set(leds.strips.map((s) => s.output))].sort((a, b) => a - b);
    for (const output of used) {
      controllers.push(
        '    <ArtNet>',
        el('Name', controllerOf(output), '      '),
        el('Universe', artnetUniverse(leds, output), '      '),
        ...(leds.address?.trim() ? [el('BroadcastAddress', leds.address.trim(), '      ')] : []),
        '    </ArtNet>',
      );
    }
  } else {
    controllers.push(
      `    <${leds.controller}>`,
      el('Name', controllerOf(1), '      '),
      ...counts.map((n, i) => el(`NumberOfLedsStrip${i + 1}`, n, '      ')),
      el('ComPortName', leds.port.trim().toUpperCase(), '      '),
      `    </${leds.controller}>`,
    );
  }
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<!-- Written by Cyber Pinball (LED et retours (DOF)), ${now.toISOString()}. Cyber Pinball rewrites this file; remove this line to keep your own edits. -->`, // i18n-ignore : fichier lu par DOF
    '<Cabinet>',
    '  <Name>Cyber Pinball</Name>',
    '  <AutoConfigEnabled>true</AutoConfigEnabled>',
    '  <OutputControllers>',
    ...controllers,
    '  </OutputControllers>',
    '  <Toys>',
  ];
  leds.strips.forEach((s, i) => {
    lines.push(
      '    <LedStrip>',
      el('Name', s.name.trim(), '      '),
      el('Width', Math.round(s.width), '      '),
      el('Height', Math.round(s.height), '      '),
      el('LedStripArrangement', s.arrangement, '      '),
      el('ColorOrder', s.colorOrder, '      '),
      el('FirstLedNumber', firsts[i]!, '      '),
      el('FadingCurveName', 'SwissLizardsLedCurve', '      '),
      el('Brightness', Math.max(0, Math.min(100, Math.round(s.brightness))), '      '),
      el('OutputControllerName', controllerOf(s.output), '      '),
      '    </LedStrip>',
    );
  });
  lines.push(
    '    <LedWizEquivalent>',
    el('Name', `LedWizEquivalent ${number}`, '      '),
    '      <Outputs>',
    ...leds.strips.flatMap((s) => [
      '        <LedWizEquivalentOutput>',
      el('OutputName', s.name.trim(), '          '),
      el('LedWizEquivalentOutputNumber', s.dofOutput, '          '),
      '        </LedWizEquivalentOutput>',
    ]),
    '      </Outputs>',
    el('LedWizNumber', number, '      '),
    '    </LedWizEquivalent>',
    '  </Toys>',
    '</Cabinet>',
    '',
  );
  return lines.join('\r\n');
}

/** GlobalConfig_B2SServer.xml minimal : ini et Cabinet.xml dans le dossier du GlobalConfig. */
export function globalConfigXml(now = new Date()): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<!-- Written by Cyber Pinball (LED et retours (DOF)), ${now.toISOString()}. Remove this line to keep your own edits. -->`, // i18n-ignore : fichier lu par DOF
    '<GlobalConfig>',
    '  <IniFilesPath>{GlobalConfigDir}</IniFilesPath>',
    '  <CabinetConfigFilePattern>{GlobalConfigDir}\\Cabinet.xml</CabinetConfigFilePattern>',
    '  <EnableLogging>true</EnableLogging>',
    '</GlobalConfig>',
    '',
  ].join('\r\n');
}

export interface LedWritePlan {
  files: { file: string; content: string }[];
  /** Fichiers écrits à la main, que Cyber Pinball ne remplace pas. */
  refused: { file: string; reason: string }[];
}

/**
 * Fichiers à écrire pour les LED décrites : Cabinet.xml, et le GlobalConfig qui le désigne.
 * Un fichier existant n'est remplacé que s'il porte la marque de Cyber Pinball ; un GlobalConfig
 * écrit à la main qui désigne déjà ce Cabinet.xml est gardé tel quel.
 */
export function planLedWrite(dir: string, leds: CabinetLeds, now = new Date()): LedWritePlan {
  const plan: LedWritePlan = { files: [], refused: [] };
  const cabinetFile = path.join(dir, 'Cabinet.xml');
  const globalFile = path.join(dir, 'GlobalConfig_B2SServer.xml');
  const ownedOrAbsent = (file: string) => !exists(file) || OWNED_COMMENT.test(fs.readFileSync(file, 'utf8'));
  let target = cabinetFile;
  if (exists(globalFile) && !ownedOrAbsent(globalFile)) {
    let global: DofGlobalConfig | undefined;
    try {
      global = readGlobalConfig(globalFile);
    } catch {
      /* illisible : traité comme écrit à la main */
    }
    if (!global?.cabinetPattern) {
      plan.refused.push({ file: globalFile, reason: t('GlobalConfig écrit à la main, sans CabinetConfigFilePattern : ajoutez <CabinetConfigFilePattern>{GlobalConfigDir}\\Cabinet.xml</CabinetConfigFilePattern>.') });
    } else target = resolvePattern(global.cabinetPattern, dir);
  } else {
    plan.files.push({ file: globalFile, content: globalConfigXml(now) });
  }
  if (ownedOrAbsent(target)) plan.files.push({ file: target, content: cabinetXml(leds, now) });
  else plan.refused.push({ file: target, reason: t('Cabinet.xml écrit à la main : Cyber Pinball ne le remplace pas. Retirez-le (ou mettez-le de côté) pour que Cyber Pinball écrive le sien.') });
  return plan;
}

/** Bandes d'un Cabinet.xml relu, pour reprendre la description dans l'éditeur. */
export function ledsFromCabinet(cabinet: DofCabinetFile): CabinetLeds | undefined {
  const dofOutputs = new Map(cabinet.equivalents.flatMap((e) => e.outputs.map((o) => [o.name, o.number] as const)));
  const spec = (s: DofCabinetStrip, output: number): LedStripSpec => ({
    name: s.name,
    output,
    width: s.width,
    height: s.height,
    arrangement: (LED_ARRANGEMENTS as readonly string[]).includes(s.arrangement ?? '') ? (s.arrangement as LedArrangement) : 'LeftRightTopDown',
    colorOrder: (LED_COLOR_ORDERS as readonly string[]).includes(s.colorOrder ?? '') ? (s.colorOrder as LedColorOrder) : 'RGB',
    brightness: s.brightness ?? 100,
    dofOutput: dofOutputs.get(s.name) ?? 1,
  });
  const artnet = cabinet.controllers.filter((x) => x.type === 'ArtNet');
  if (artnet.length && !cabinet.controllers.some((x) => x.type === 'TeensyStripController' || x.type === 'WemosD1MPStripController')) {
    const first = Math.min(...artnet.map((a) => a.universe ?? 0));
    const address = artnet.find((a) => a.address)?.address;
    return {
      controller: 'ArtNet',
      port: '',
      universe: first,
      ...(address ? { address } : {}),
      strips: cabinet.strips.flatMap((s) => {
        const c = artnet.find((a) => a.name === s.controller);
        return c ? [spec(s, (c.universe ?? 0) - first + 1)] : [];
      }),
    };
  }
  const c = cabinet.controllers.find((x) => x.type === 'TeensyStripController' || x.type === 'WemosD1MPStripController');
  if (!c) return undefined;
  const counts = c.ledsPerOutput ?? [];
  const starts = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0) + 1);
  const outputOf = (firstLed: number) => {
    let o = 1;
    for (let i = 0; i < starts.length; i++) if (firstLed >= starts[i]!) o = i + 1;
    return o;
  };
  return {
    controller: c.type as LedControllerType,
    port: c.comPort ?? '',
    strips: cabinet.strips.filter((s) => !s.controller || s.controller === c.name).map((s) => spec(s, outputOf(s.firstLed))),
  };
}

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------

/** « Pinscape (KL25Z) · 51 », « LedWiz ou Pinscape · 1 ou 51 ». */
export function dofControllerLabel(d: DetectedDofController): string {
  const name = d.alternatives?.length ? [d.type, ...d.alternatives].map((x) => DOF_CONTROLLERS[x].label).join(t(' ou ')) : DOF_CONTROLLERS[d.type].label;
  const where = d.device.port ? ` (${d.device.port})` : '';
  return `${name}${where} · ${d.numbers.join(t(' ou '))}`;
}

/** Contrôleurs vus (branchés, puis déclarés dans Cabinet.xml sans être reconnus à l'USB). */
export function dofControllerLabels(setup: DofSetup, detected: DetectedDofController[]): string[] {
  const labels = detected.map(dofControllerLabel);
  for (const c of setup.cabinet?.controllers ?? []) {
    if (detected.some((d) => d.type === c.type)) continue;
    const info = isDofControllerType(c.type) ? DOF_CONTROLLERS[c.type].label : c.type;
    labels.push(c.comPort ? `${info} (${c.comPort}) · Cabinet.xml` : `${info} · Cabinet.xml`);
  }
  return labels;
}

/** Ce que la santé de la borne garde de DOF (health.ts, dofLines). */
export function dofHealthFacts(setup: DofSetup, detected: DetectedDofController[], devices: ObservedUsbDevice[]): DofFacts {
  return {
    controllers: dofControllerLabels(setup, detected),
    ini: setup.ini.length,
    problems: dofFindings(setup, detected, devices)
      .filter((f) => f.severity !== 'info')
      .map((f) => f.message),
  };
}

/**
 * Noms HID déduits des joysticks relevés dans le modèle de borne (boutons, lanceur) : un LedWiz
 * n'est jamais un joystick, un périphérique FAFA:00Fx qui en est un est donc un Pinscape en
 * émulation LedWiz. Les jetons SDL portent les identifiants USB (sdlJoystickUsbIds).
 */
export function cabinetJoystickHids(cabinet: unknown): HidName[] {
  const out: HidName[] = [];
  const text = JSON.stringify(cabinet ?? {});
  for (const m of text.matchAll(/SDLJoy_[0-9a-f]{32}/gi)) {
    const ids = sdlJoystickUsbIds(m[0]);
    if (!ids || out.some((o) => o.vid === ids.vid && o.pid === ids.pid)) continue;
    if (ids.vid === 0xfafa || (ids.vid === 0x1209 && ids.pid === 0xeaea)) out.push({ ...ids, name: 'Pinscape (joystick)' }); // i18n-ignore : clé de reconnaissance, jamais affichée
  }
  return out;
}

// ---------------------------------------------------------------------------
// Import du ZIP du configtool
// ---------------------------------------------------------------------------

export interface DofImportPlan {
  /** Fichiers à copier dans le dossier de DOF. */
  copies: { from: string; to: string }[];
  /** Fichiers actuels mis de côté avant l'import : les ini et tablemappings de l'ancienne configuration. */
  replaced: string[];
  /** Fichiers du ZIP laissés de côté, avec la raison. */
  skipped: { file: string; reason: string }[];
  /** Numéros des ini importés. */
  numbers: number[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Ce que l'import d'un ZIP du configtool (déjà déballé dans `unpacked`) change dans le dossier de
 * DOF : ses directoutputconfig*.ini et tablemappings remplacent tous ceux d'avant (le configtool
 * donne toujours la configuration entière de la borne), mis de côté par l'appelant. Un Cabinet.xml
 * ou un GlobalConfig du ZIP n'écrase jamais un fichier présent. Lève une erreur sans aucun ini.
 */
export function planDofImport(unpacked: string, dir: string): DofImportPlan {
  const plan: DofImportPlan = { copies: [], replaced: [], skipped: [], numbers: [] };
  const files = walk(unpacked);
  const ini = files.filter((f) => dofIniNumber(f, 'directoutputconfig') !== undefined);
  if (!ini.length) throw new Error(t('Ce fichier ne contient aucun directoutputconfig.ini : est-ce bien le ZIP téléchargé depuis configtool.vpuniverse.com (« Generate Config ») ?'));
  const taken = new Set<string>();
  for (const f of ini) {
    const name = path.basename(f).toLowerCase();
    if (taken.has(name)) {
      plan.skipped.push({ file: f, reason: t('en double dans le ZIP') });
      continue;
    }
    taken.add(name);
    plan.copies.push({ from: f, to: path.join(dir, path.basename(f)) });
    plan.numbers.push(dofIniNumber(f)!);
  }
  for (const f of files) {
    const base = path.basename(f).toLowerCase();
    if (ini.includes(f)) continue;
    if (base.startsWith('tablemappings.')) plan.copies.push({ from: f, to: path.join(dir, path.basename(f)) });
    else if (base === 'cabinet.xml' || base === 'globalconfig_b2sserver.xml') {
      const to = path.join(dir, path.basename(f));
      if (exists(to)) plan.skipped.push({ file: f, reason: t('{file} existe déjà dans le dossier de DOF : gardé tel quel', { file: path.basename(f) }) });
      else plan.copies.push({ from: f, to });
    } else plan.skipped.push({ file: f, reason: t('inutile à DOF') });
  }
  if (exists(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const lower = name.toLowerCase();
      if (dofIniNumber(name) !== undefined || lower.startsWith('tablemappings.')) plan.replaced.push(path.join(dir, name));
    }
  }
  plan.numbers.sort((a, b) => a - b);
  return plan;
}
