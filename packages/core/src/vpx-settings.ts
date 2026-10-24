// Réglages de VPX tels que l'écran « Réglages » les manipule : lecture d'une
// valeur comme VPX la lit, écriture dans VPinballX.ini ou dans le .ini d'une
// table, clés possédées par Cyber Pinball. Le comportement reproduit celui de
// VPX 10.8.1 (src/core/LayeredINIPropertyStore.cpp, src/parts/pintable.h).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IniDocument } from './ini';
import { VPX_AUDIO_OWNED_KEYS } from './audio';
import type { RoleId } from './model';
import { disabledPlugins, rendererPriorities, VPX_LAYOUT_KEYS, VPX_PLAY_SETTINGS, VPX_WINDOWS, type VpxProfile } from './vpx';
import type { VpxSettingDef } from './vpx-settings-parser';

export * from './vpx-settings-parser';

/** Schéma des réglages d'une version de VPX, produit par `npm run vpx-schema`. */
export interface VpxSettingsSchema {
  vpx: string;
  variant?: string;
  platform?: string;
  sourceCommit: string;
  source: string;
  count: number;
  settings: VpxSettingDef[];
}

export type SettingValue = boolean | number | string;

export function settingId(section: string, key: string): string {
  return `${section}/${key}`;
}

// ---------------------------------------------------------------------------
// Clés possédées par Cyber Pinball

const WINDOW_SUFFIXES = ['Display', 'FullScreen', 'WndX', 'WndY', 'Width', 'Height'];

export interface OwnedKeysOptions {
  /** Rôles affectés : les priorités des moteurs de rendu ne sont écrites que pour leurs fenêtres. Sans eux, toutes. */
  roles?: RoleId[];
  /** Clés de [Plugin.DMDUtil] écrites lors de la dernière synchronisation (DMD réel détecté). */
  dmdKeys?: string[];
  /** Clés de [Input] écrites lors de la dernière synchronisation (étape « Boutons » faite). */
  inputKeys?: string[];
}

/**
 * Clés que Cyber Pinball écrit lui-même (vpx.ts, audio.ts, dmd.ts) : position et taille des
 * fenêtres de VPX, plugins activés ou éteints, priorités des plugins sur les fenêtres
 * affectées, vue et taille réelle du playfield, réglages qui évitent les boîtes de
 * dialogue en partie (VPX_PLAY_SETTINGS), DMD réel détecté, touches des boutons
 * de la borne ([Input], une fois l'étape « Boutons » faite) et, une fois l'étape
 * « Son » faite (`audio`), sorties audio et mixage du plateau. L'écran de réglages les
 * affiche sans permettre de les modifier : c'est l'assistant qui en décide.
 */
export function vpxOwnedKeys(profile: VpxProfile, manual: string[] = [], audio = false, options: OwnedKeysOptions = {}): Set<string> {
  const keys: [string, string][] = [];
  for (const [role, win] of Object.entries(VPX_WINDOWS) as [RoleId, (typeof VPX_WINDOWS)[RoleId]][]) {
    for (const suffix of [...WINDOW_SUFFIXES, ...(win.hasOutput ? ['Output'] : [])]) keys.push([win.section, `${win.prefix}${suffix}`]);
    if (options.roles && !options.roles.includes(role)) continue;
    for (const [renderer] of rendererPriorities(win.section, profile)) keys.push([win.section, `Priority.${renderer}`]);
  }
  for (const plugin of [...profile.enabledPlugins, ...disabledPlugins(profile)]) keys.push([`Plugin.${plugin}`, 'Enable']);
  for (const key of VPX_LAYOUT_KEYS) keys.push(['Player', key]);
  for (const s of VPX_PLAY_SETTINGS) keys.push([s.section, s.key]);
  if (audio) for (const key of VPX_AUDIO_OWNED_KEYS) keys.push(['Player', key]);
  for (const key of options.dmdKeys ?? []) keys.push(['Plugin.DMDUtil', key]);
  for (const key of options.inputKeys ?? []) keys.push(['Input', key]);
  // Clés changées à la main que l'utilisateur a choisi de garder (Cabinet.vpxManual, « Section.Clé ») :
  // section et clé peuvent contenir un point (Plugin.B2S, Priority.PUP), on compare donc le texte entier.
  const kept = new Set(manual.map((id) => id.toLowerCase()));
  return new Set(keys.filter(([section, key]) => !kept.has(`${section}.${key}`.toLowerCase())).map(([section, key]) => ownedId(section, key)));
}

export function isOwned(owned: Set<string>, section: string, key: string): boolean {
  return owned.has(ownedId(section, key));
}

function ownedId(section: string, key: string): string {
  return settingId(section, key).toLowerCase();
}

/**
 * Sections qui ne servent qu'à l'éditeur de tables de VPX : une valeur par
 * table n'y a aucun effet sur une partie.
 */
const EDITOR_SECTIONS = /^(Editor|CVEdit|RecentDir|Version|DefaultProps\\.*)$/i;

export function isEditorSection(section: string): boolean {
  return EDITOR_SECTIONS.test(section);
}

/**
 * [TableOverride] : VPX ne les enregistre que dans le .ini d'une table, et leur
 * valeur par défaut vient de la table elle-même (Settings_properties.inl).
 */
export function isTableOnly(def: Pick<VpxSettingDef, 'section'>): boolean {
  return def.section.toLowerCase() === 'tableoverride';
}

// ---------------------------------------------------------------------------
// Lecture et écriture d'une valeur

/**
 * Valeur d'une ligne du .ini, interprétée comme LayeredINIPropertyStore::LoadFromINI.
 * undefined : clé absente, vide (« non définie », VPX prend alors la valeur par
 * défaut) ou illisible (VPX l'ignore aussi).
 */
export function parseIniValue(def: VpxSettingDef, raw: string | undefined): SettingValue | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (text === '') return undefined;
  switch (def.type) {
    case 'string':
      return raw;
    case 'bool': {
      const n = parseIntStrict(text);
      if (n !== undefined) return n !== 0;
      if (/^(true|on|enable)$/i.test(text)) return true;
      if (/^(false|off|disable)$/i.test(text)) return false;
      return undefined;
    }
    case 'int':
      return parseIntStrict(text);
    case 'float': {
      const n = Number(text.replace(/f$/i, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'enum': {
      // EnumPropertyDef::ParseEnum : un libellé, ou un nombre dans les bornes.
      const index = def.values!.indexOf(text);
      if (index >= 0) return def.min! + index;
      const n = parseIntStrict(text);
      return n !== undefined && n >= def.min! && n <= def.max! ? n : undefined;
    }
  }
}

function parseIntStrict(text: string): number | undefined {
  return /^[-+]?\d+$/.test(text) ? Number(text) | 0 : undefined;
}

/** Texte écrit dans le .ini, au format que VPX écrit lui-même (booléens et énumérations en nombres). */
export function formatIniValue(def: VpxSettingDef, value: SettingValue): string {
  switch (def.type) {
    case 'bool':
      return value ? '1' : '0';
    case 'int':
    case 'enum':
      return String(Math.round(Number(value)));
    case 'float':
      return formatFloat(Number(value));
    case 'string':
      return String(value);
  }
}

/** Nombre sans notation exponentielle, à la précision d'un float 32 bits. */
export function formatFloat(value: number): string {
  const n = Number(Math.fround(value).toPrecision(7));
  if (n === 0) return '0';
  const text = String(n);
  return text.includes('e') ? n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** Ramène la valeur dans les bornes du réglage, et à un entier pour les types entiers. */
export function clampValue(def: VpxSettingDef, value: number): number {
  let v = def.type === 'float' ? value : Math.round(value);
  if (def.min !== undefined && v < def.min) v = def.min;
  if (def.max !== undefined && v > def.max) v = def.max;
  return v;
}

export function sameValue(def: VpxSettingDef, a: SettingValue | undefined, b: SettingValue | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (def.type === 'float') return Math.fround(Number(a)) === Math.fround(Number(b));
  if (def.type === 'bool') return Boolean(a) === Boolean(b);
  return a === b;
}

// ---------------------------------------------------------------------------
// État d'un réglage

export type SettingSource = 'default' | 'global' | 'table';

export interface SettingState {
  def: VpxSettingDef;
  /** Valeur définie dans VPinballX.ini. */
  global?: SettingValue;
  /** Valeur définie dans le .ini de la table (surcharge). */
  table?: SettingValue;
  /** Ce que VPX utilisera. Pour [TableOverride] sans valeur, la valeur vient de la table : undefined. */
  effective?: SettingValue;
  source: SettingSource;
  /** Texte présent dans le fichier mais que VPX ignore (valeur illisible). */
  invalid?: { scope: 'global' | 'table'; raw: string };
}

export function settingState(def: VpxSettingDef, globalIni: IniDocument, tableIni?: IniDocument): SettingState {
  const state: SettingState = { def, source: 'default' };
  const read = (doc: IniDocument, scope: 'global' | 'table') => {
    const raw = doc.get(def.section, def.key);
    const value = parseIniValue(def, raw);
    if (value === undefined && raw !== undefined && raw.trim() !== '') state.invalid = { scope, raw };
    return value;
  };
  state.global = read(globalIni, 'global');
  if (tableIni) state.table = read(tableIni, 'table');
  if (state.table !== undefined) {
    state.effective = state.table;
    state.source = 'table';
  } else if (state.global !== undefined) {
    state.effective = state.global;
    state.source = 'global';
  } else {
    state.effective = isTableOnly(def) && tableIni ? undefined : def.default;
  }
  return state;
}

/**
 * Écrit une valeur, ou la retire quand `value` est undefined.
 * - VPinballX.ini : « Clé = » sans valeur, la convention de VPX pour « valeur par défaut ».
 * - .ini de table : la clé disparaît, VPX reprend alors la valeur générale. Comme VPX,
 *   une valeur égale à la valeur générale n'est pas gardée, sauf réglage « Dyn ».
 * Renvoie true si le document a changé.
 */
export function applySetting(
  doc: IniDocument,
  def: VpxSettingDef,
  value: SettingValue | undefined,
  scope: 'global' | 'table',
  globalIni?: IniDocument,
): boolean {
  const before = doc.get(def.section, def.key);
  if (scope === 'table') {
    const general = globalIni ? (parseIniValue(def, globalIni.get(def.section, def.key)) ?? def.default) : undefined;
    const redundant = value !== undefined && !def.contextual && !isTableOnly(def) && sameValue(def, value, general);
    if (value === undefined || redundant) return doc.remove(def.section, def.key);
  } else if (value === undefined) {
    if (before === undefined || before.trim() === '') return false;
    doc.set(def.section, def.key, '');
    return true;
  }
  const text = formatIniValue(def, value!);
  if (before === text) return false;
  doc.set(def.section, def.key, text);
  return true;
}

// ---------------------------------------------------------------------------
// Choix proposés aux boutons de la borne

/**
 * Valeurs que l'on parcourt aux flippers pour un réglage numérique : une grille
 * régulière entre les bornes (au plus ~200 crans), qui contient toujours la
 * valeur courante et la valeur par défaut.
 */
export function numericChoices(def: VpxSettingDef, current: number | undefined): number[] {
  const values = new Set<number>();
  const add = (v: number) => values.add(def.type === 'float' ? Number(Math.fround(v).toPrecision(7)) : Math.round(v));
  const step = choiceStep(def, current);
  if (def.min !== undefined && def.max !== undefined) {
    const first = Math.ceil(def.min / step - 1e-9) * step;
    for (let v = first; v <= def.max + step * 1e-6; v += step) add(clampValue(def, Number(v.toFixed(10))));
    add(def.min);
    add(def.max);
  } else {
    const center = current ?? Number(def.default);
    const origin = Math.round(center / step) * step;
    for (let i = -100; i <= 100; i++) add(Number((origin + i * step).toFixed(10)));
  }
  if (current !== undefined) add(current);
  if (typeof def.default === 'number') add(def.default);
  return [...values].sort((a, b) => a - b);
}

/** Pas « rond » (1, 2 ou 5 × 10^n) qui découpe l'intervalle en une centaine de crans. */
export function choiceStep(def: VpxSettingDef, current?: number): number {
  if (def.step) return def.step;
  let span: number;
  if (def.min !== undefined && def.max !== undefined) span = def.max - def.min;
  else span = Math.max(Math.abs(current ?? Number(def.default)) * 2, def.type === 'float' ? 1 : 100);
  const raw = span / 100;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw * 0.999) ?? 10 * magnitude;
  return def.type === 'float' ? nice : Math.max(1, Math.round(nice));
}

// ---------------------------------------------------------------------------
// Fichier .ini d'une table

/**
 * Fichier .ini de surcharge d'une table, trouvé comme VPX le fait
 * (PinTable::GetSettingsFileName, VPX 10.8.1) :
 * 1. <table>.ini à côté du .vpx, s'il existe ;
 * 2. sinon <nom du dossier>.ini dans le dossier de la table (casse indifférente), s'il existe ;
 * 3. sinon <table>.ini, celui que VPX créerait.
 * (L'option -TableIni de la ligne de commande passe avant tout, Cyber Pinball ne s'en sert pas.)
 */
export function findTableIni(tableFile: string): { path: string; exists: boolean } {
  const byTable = tableFile.replace(/\.[^.\\/]+$/, '') + '.ini';
  if (fs.existsSync(byTable)) return { path: byTable, exists: true };
  const folder = path.dirname(tableFile);
  const wanted = `${path.basename(folder)}.ini`.toLowerCase();
  const byFolder = fs.existsSync(folder) ? fs.readdirSync(folder).find((f) => f.toLowerCase() === wanted) : undefined;
  if (byFolder) return { path: path.join(folder, byFolder), exists: true };
  return { path: byTable, exists: false };
}
