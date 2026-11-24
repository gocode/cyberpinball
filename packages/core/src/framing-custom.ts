// Vue personnalisée d'une table (24/11/2026) : la vue réglée par le joueur dans le menu de VPX (« Save as Table
// Override » : [TableOverride] ViewCab…) est gardée quand un autre cadrage la remplace (style, POV importé, cadrage
// d'origine), et reste proposée dans « Point de vue » pour y revenir sans la perdre. <données>\cadrage-vue-perso.json,
// une vue par table (la dernière).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { stripCloseCorners } from './framing-close-corners';
import { FRAMING_STYLE_KEYS } from './framing-styles';
import { IniDocument } from './ini';
import { hasOwnCabinetView } from './tableview';
import { readJsonFile } from './store';

export interface CustomView {
  /** Date ISO de l'enregistrement. */
  at: string;
  /** [TableOverride] ViewCab<champ> = valeur, dans l'ordre du .ini. */
  values: { key: string; value: string }[];
}

const FILE = 'cadrage-vue-perso.json';

type Store = Record<string, CustomView>;

const keyOf = (tableFile: string) => path.resolve(tableFile).toLowerCase();
const isViewKey = (section: string, key: string) => section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(key);

function load(dataDir: string): Store {
  const file = path.join(dataDir, FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const data = readJsonFile(file) as Store;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Les réglages de vue borne ([TableOverride] ViewCab…) d'un .ini ; vide si le .ini ne règle pas de vue propre. */
export function customViewOf(iniText: string): { key: string; value: string }[] {
  const doc = IniDocument.parse(iniText);
  if (!hasOwnCabinetView(doc)) return [];
  return doc
    .entries()
    .filter((e) => isViewKey(e.section, e.key) && e.value.trim() !== '')
    .map((e) => ({ key: e.key, value: e.value.trim() }));
}

/** La vue personnalisée gardée pour cette table ; undefined : aucune. */
export function savedCustomView(dataDir: string, tableFile: string): CustomView | undefined {
  const view = load(dataDir)[keyOf(tableFile)];
  return view && Array.isArray(view.values) && view.values.length ? view : undefined;
}

/** Garde la vue de ce .ini avant qu'un autre cadrage la remplace ; sans vue propre dans le .ini, l'ancienne est conservée. */
export function rememberCustomView(dataDir: string, tableFile: string, iniText: string, at = new Date().toISOString()): boolean {
  const values = customViewOf(iniText);
  if (!values.length) return false;
  const all = load(dataDir);
  all[keyOf(tableFile)] = { at, values };
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, FILE), JSON.stringify(all, null, 2) + '\n');
  return true;
}

/**
 * Le .ini de la table avec cette vue, en cadrage manuel : ses autres ViewCab… retirés (comme « Save as Table Override »),
 * les clés des styles automatiques et `extraKeys` (cadrage d'origine figé) retirées de [Player].
 */
export function withCustomView(iniText: string, view: CustomView, extraKeys: readonly string[] = []): string {
  const doc = IniDocument.parse(iniText);
  for (const e of doc.entries()) if (isViewKey(e.section, e.key)) doc.remove(e.section, e.key);
  stripCloseCorners(doc);
  for (const key of [...FRAMING_STYLE_KEYS, ...extraKeys]) doc.remove('Player', key);
  for (const v of view.values) doc.set('TableOverride', v.key, v.value);
  doc.set('Player', 'CabinetAutofitMode', '0');
  return doc.toString();
}

/** Le .ini porte déjà cette vue, en cadrage manuel. */
export function customViewHolds(iniText: string, view: CustomView): boolean {
  const doc = IniDocument.parse(iniText);
  if ((doc.get('Player', 'CabinetAutofitMode')?.trim() ?? '') !== '0') return false;
  return view.values.every((v) => {
    const own = Number(doc.get('TableOverride', v.key));
    return Number.isFinite(own) && Math.abs(own - Number(v.value)) < 1e-3;
  });
}
