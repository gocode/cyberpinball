// Rattrapage du cadrage d'origine des tables déjà reprises (packages/core/src/origin-framing-catchup.ts) : une fois par
// table, en tâche de fond après le démarrage. L'installation d'origine est seulement lue ; le .ini d'avant de la copie
// va dans l'historique du cadrage (« Rétablir le cadrage précédent » dans « Point de vue »).

import * as fs from 'node:fs';
import {
  chosenFramingReason,
  findTableIni,
  mergeOriginFraming,
  originCatchUpOf,
  originFramingOf,
  readInfo,
  rememberFraming,
  rememberOriginCatchUp,
  sameFraming,
  t,
  withOriginFraming,
  writeFileAtomic,
  type OriginCatchUpRecord,
  type OriginFramingPlan,
  type PlayfieldOrientation,
} from '@cyberpinball/core';

/** Attente après le démarrage : la roue d'abord, puis la lecture des autres installations du PC. */
export const ORIGIN_CATCHUP_DELAY_MS = 20_000;

export interface CatchUpTable {
  file: string;
  infoFile: string;
  id?: string;
}

export interface CatchUpDeps {
  dataDir: string;
  /** Le playfield de la borne ; undefined (borne pas décrite) : rien n'est fait, le rattrapage attend. */
  orientation: PlayfieldOrientation | undefined;
  /** La table d'une autre installation dont celle-ci est la copie, et le VPX qui l'y jouait. */
  findOrigin(tableFile: string): { vpx: string; exe: string } | undefined;
  /** Le cadrage que ce VPX appliquait à la table d'origine (originPlan). */
  plan(originVpx: string, exe: string, orientation: PlayfieldOrientation): OriginFramingPlan;
  log(line: string): void;
  now?: () => string;
}

function readText(file: string): string | undefined {
  try {
    // lecture entière : .ini de table, quelques Ko
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Le rattrapage d'une table ; undefined : rien à noter (borne pas décrite, réessayé plus tard). */
export function catchUpTable(table: CatchUpTable, deps: CatchUpDeps): OriginCatchUpRecord | undefined {
  const at = deps.now?.() ?? new Date().toISOString();
  if (originFramingOf(readInfo(table.infoFile))) return { at, result: 'same', detail: 'déjà figé à l’ajout' }; // i18n-ignore : journal
  if (!deps.orientation) return undefined;
  const origin = deps.findOrigin(table.file);
  if (!origin) return { at, result: 'none' };
  const own = findTableIni(table.file);
  const current = own.exists ? readText(own.path) : undefined;
  const chosen = chosenFramingReason(deps.dataDir, table.file, current);
  if (chosen) return { at, result: 'kept', detail: chosen };
  const plan = deps.plan(origin.vpx, origin.exe, deps.orientation);
  if (!plan.note) return { at, result: 'refused', detail: plan.refused ?? plan.summary };
  // Le .ini que le VPX d'origine lisait, cadrage figé compris (plan.ini : undefined quand il n'y a rien à y changer).
  const originIni = findTableIni(origin.vpx);
  const target = plan.ini ?? (originIni.exists ? readText(originIni.path) : undefined) ?? '';
  const next = mergeOriginFraming(current, target);
  const same = sameFraming(current, next);
  if (!same) {
    rememberFraming(deps.dataDir, table.file, { at, label: t('Cadrage d’avant le retour à celui de l’installation d’origine'), ini: current ?? null });
    writeFileAtomic(own.path, next);
  }
  writeFileAtomic(table.infoFile, JSON.stringify(withOriginFraming(readInfo(table.infoFile), plan.note), null, 2) + '\n');
  return { at, result: same ? 'same' : 'restored', detail: plan.summary };
}

/**
 * Le rattrapage des tables VPX pas encore vues : chacune une fois, notée dans les données. Rend les tables dont le
 * cadrage a changé (.info réécrit : la liste des tables est à relire).
 */
export function catchUpOriginFraming(tables: CatchUpTable[], deps: CatchUpDeps): { restored: string[]; noted: number } {
  const done: { file: string; record: OriginCatchUpRecord }[] = [];
  const restored: string[] = [];
  let noted = 0;
  for (const table of tables) {
    if (!/\.vpx$/i.test(table.file) || originCatchUpOf(deps.dataDir, table.file)) continue;
    let record: OriginCatchUpRecord | undefined;
    try {
      record = catchUpTable(table, deps);
    } catch (error) {
      deps.log(`Cadrage d'origine (${table.id ?? table.file}) : rattrapage impossible (${(error as Error).message}).`); // i18n-ignore : journal
      continue;
    }
    if (!record) continue;
    done.push({ file: table.file, record });
    if (record.result === 'restored') restored.push(table.file);
    if (record.result === 'restored' || record.result === 'same') noted++;
    if (record.result !== 'none') deps.log(`Cadrage d'origine (${table.id ?? table.file}) : rattrapage ${record.result}${record.detail ? ` (${record.detail})` : ''}.`); // i18n-ignore : journal
  }
  rememberOriginCatchUp(deps.dataDir, done);
  return { restored, noted };
}
