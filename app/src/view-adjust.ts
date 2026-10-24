// Écran « Ajuster la vue » de la fiche d'une table : monter, descendre ou cadrer
// la table à l'écran, aux boutons, sans passer par l'éditeur de VPX. Les valeurs
// et leurs règles sont dans @cyberpinball/core (viewadjust.ts) ; ici, les fichiers :
// le .ini de la table s'écrit comme dans l'écran des réglages (settings.ts), et
// « Essayer » lance la table sur un .ini d'essai (-TableIni) sans toucher au vrai.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyViewAdjust,
  IniDocument,
  readTextIfExists,
  safeName,
  settingId,
  trialIniText,
  viewAdjustItems,
  viewAdjustNotes,
  type SettingLookup,
  type TableEntry,
  type ViewAdjustItem,
  type ViewAdjustNote,
} from '@cyberpinball/core';
import { locations } from './paths';
import { activeVpxIni } from './vpx-ini';
import { currentSchema, tableIniLocation, writeTableIni, type TableIniLocation } from './settings';

export interface ViewAdjust {
  table: TableEntry;
  location: TableIniLocation;
  globalIni: IniDocument;
  tableIni: IniDocument;
  lookup: SettingLookup;
  items: ViewAdjustItem[];
  /** Réglage choisi (Start passe au suivant). */
  index: number;
  notes: ViewAdjustNote[];
}

const loc = locations();

/** Relit VPinballX.ini et le .ini de la table ; garde le réglage choisi. */
export function openViewAdjust(table: TableEntry, index = 0): ViewAdjust | { problem: string } {
  const schema = currentSchema();
  if (!schema) return { problem: 'Aucun schéma de réglages pour cette version de VPX : lancez « npm run vpx-schema ».' };
  const defs = new Map(schema.settings.map((d) => [settingId(d.section, d.key).toLowerCase(), d]));
  const lookup: SettingLookup = (section, key) => defs.get(settingId(section, key).toLowerCase());
  const location = tableIniLocation(table);
  const globalIni = IniDocument.parse(readTextIfExists(activeVpxIni(loc)));
  const tableIni = IniDocument.parse(readTextIfExists(location.file));
  const items = viewAdjustItems(lookup, globalIni, tableIni);
  if (!items.length) return { problem: `VPX ${schema.vpx} ne connaît aucun des réglages de cadrage automatique.` };
  const notes = viewAdjustNotes(lookup, globalIni, tableIni, items);
  return { table, location, globalIni, tableIni, lookup, items, index: Math.min(index, items.length - 1), notes };
}

/** Notes recalculées avec les valeurs à l'écran (passer en cadrage manuel rend les clés ViewCab* utiles). */
export function refreshNotes(v: ViewAdjust): void {
  v.notes = viewAdjustNotes(v.lookup, v.globalIni, v.tableIni, v.items);
}

/**
 * Écrit les valeurs à l'écran dans le .ini de la table, relu juste avant (une autre
 * fenêtre a pu le changer). Renvoie false si rien n'a changé.
 */
export function saveViewAdjust(v: ViewAdjust): boolean {
  const doc = IniDocument.parse(readTextIfExists(v.location.file));
  if (!applyViewAdjust(doc, v.items)) return false;
  writeTableIni(v.location, doc);
  return true;
}

/** .ini d'essai : celui de la table avec les valeurs à l'écran, dans <données>\essais (VPX exige qu'il existe). */
export function writeTrialIni(v: ViewAdjust): string {
  const file = path.join(loc.dataDir, 'essais', `${safeName(path.basename(v.table.file, path.extname(v.table.file)))}.ini`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, trialIniText(IniDocument.parse(readTextIfExists(v.location.file)), v.items), 'utf8');
  return file;
}

/** Fichier écrit, et où VPX le lit quand ce n'est pas le même (bac à sable). */
export function iniTarget(v: ViewAdjust): string {
  const { writePath, vpxPath } = v.location;
  return writePath === vpxPath ? writePath : `${writePath} (bac à sable ; VPX lit ${path.basename(vpxPath)} à côté de la table)`;
}
