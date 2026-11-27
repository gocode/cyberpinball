// Rattrapage du cadrage d'origine (27/11/2026) : les tables reprises d'une autre installation (PinUP Popper, PinballY,
// dossier de VPX) avant que leur cadrage soit figé à l'ajout (0.2.4-essai.9), ou par un chemin d'import qui ne le
// figeait pas, gardaient une vue que Cyber Pinball avait posée à la place de celle de l'origine. Relevé sur une borne :
// cinq tables de PinUP Popper sur six, vue manuelle « Legacy » de leur .ini remplacée par une vue « Window » d'une
// autre taille, sans trace dans l'historique du cadrage.
//
// Une fois par table : l'installation d'origine retrouvée, son cadrage est rendu à la copie, sauf si le joueur en a
// choisi un dans « Point de vue » (historique, vue personnalisée gardée, œil bas, au plus près des coins). Le .ini
// d'avant va dans l'historique du cadrage : « Rétablir le cadrage précédent » le remet. Seules les clés du cadrage
// changent ; le reste du .ini de la copie (fenêtres, son, habillage) est gardé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { hasCloseCornersEye, lowEyeHolds } from './framing-close-corners';
import { savedCustomView } from './framing-custom';
import { framingHistory } from './framing-history';
import { IniDocument } from './ini';
import { VPX_FRAMING_DEFAULTS } from './origin-framing';
import { readJsonFile } from './store';

/** Clés [Player] qui font le cadrage, en plus de la vue ([TableOverride] ViewCab*). */
export const ORIGIN_FRAMING_PLAYER_KEYS: readonly string[] = ['CabinetAutofitMode', 'CabinetAutofitKeepTop', 'CabinetAutofitMaxStretch', ...Object.keys(VPX_FRAMING_DEFAULTS)];

const isViewKey = (section: string, key: string) => section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(key);
const isPlayerFramingKey = (section: string, key: string) => section.toLowerCase() === 'player' && ORIGIN_FRAMING_PLAYER_KEYS.some((k) => k.toLowerCase() === key.toLowerCase());

/**
 * Le .ini de la copie (`current`, undefined sans .ini) avec le cadrage de `origin` (le .ini que l'origine faisait lire
 * à VPX, cadrage figé compris) : la vue et les clés du cadrage remplacées, tout le reste gardé.
 */
export function mergeOriginFraming(current: string | undefined, origin: string): string {
  const doc = IniDocument.parse(current ?? '');
  for (const e of doc.entries()) if (isViewKey(e.section, e.key) || isPlayerFramingKey(e.section, e.key)) doc.remove(e.section, e.key);
  for (const e of IniDocument.parse(origin).entries()) {
    if (isViewKey(e.section, e.key) || isPlayerFramingKey(e.section, e.key)) doc.set(e.section, e.key, e.value);
  }
  return doc.toString();
}

/** Les clés du cadrage d'un .ini (vue et [Player]), pour comparer deux cadrages sans le reste. */
export function framingKeysOf(ini: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of IniDocument.parse(ini ?? '').entries()) {
    if (isViewKey(e.section, e.key) || isPlayerFramingKey(e.section, e.key)) out[`${e.section.toLowerCase()}.${e.key.toLowerCase()}`] = e.value.trim();
  }
  return out;
}

/** Deux .ini cadrent-ils la table pareil (mêmes clés de cadrage, mêmes valeurs à 1e-4 près) ? */
export function sameFraming(a: string | undefined, b: string | undefined): boolean {
  const x = framingKeysOf(a);
  const y = framingKeysOf(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) {
    const u = x[k];
    const v = y[k];
    if (u === undefined || v === undefined) return false;
    const nu = Number(u);
    const nv = Number(v);
    if (Number.isFinite(nu) && Number.isFinite(nv) ? Math.abs(nu - nv) >= 1e-4 : u !== v) return false;
  }
  return true;
}

/**
 * Le cadrage de la copie a-t-il été choisi par le joueur dans Cyber Pinball ? La raison (pour le journal), sinon
 * undefined. Un tel cadrage n'est jamais remplacé par le rattrapage.
 */
export function chosenFramingReason(dataDir: string, tableFile: string, iniText: string | undefined): string | undefined {
  if (framingHistory(dataDir, tableFile).length) return 'cadrage choisi dans Point de vue'; // i18n-ignore : journal
  if (savedCustomView(dataDir, tableFile)) return 'vue personnalisée gardée'; // i18n-ignore : journal
  if (iniText !== undefined) {
    const doc = IniDocument.parse(iniText);
    if (lowEyeHolds(doc)) return 'œil bas choisi'; // i18n-ignore : journal
    if (hasCloseCornersEye(doc)) return 'au plus près des coins choisi'; // i18n-ignore : journal
  }
  return undefined;
}

/** Ce que le rattrapage a fait d'une table, gardé pour ne la traiter qu'une fois. */
export interface OriginCatchUpRecord {
  at: string;
  /** restored : cadrage d'origine rendu ; same : déjà le même ; kept : choisi par le joueur ; refused : ne s'applique pas ; none : pas d'origine. */
  result: 'restored' | 'same' | 'kept' | 'refused' | 'none';
  detail?: string;
}

const CATCHUP_FILE = 'cadrage-origine-rattrapage.json';

const keyOf = (tableFile: string) => path.resolve(tableFile).toLowerCase();

function loadCatchUp(dataDir: string): Record<string, OriginCatchUpRecord> {
  const file = path.join(dataDir, CATCHUP_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const data = readJsonFile(file) as Record<string, OriginCatchUpRecord>;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Le rattrapage déjà fait pour cette table, s'il l'a été. */
export function originCatchUpOf(dataDir: string, tableFile: string): OriginCatchUpRecord | undefined {
  return loadCatchUp(dataDir)[keyOf(tableFile)];
}

/** Note le rattrapage de ces tables (une écriture pour toutes). */
export function rememberOriginCatchUp(dataDir: string, records: { file: string; record: OriginCatchUpRecord }[]): void {
  if (!records.length) return;
  const all = loadCatchUp(dataDir);
  for (const r of records) all[keyOf(r.file)] = r.record;
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, CATCHUP_FILE), JSON.stringify(all, null, 2) + '\n');
}
