// Écran « Ajuster la vue » d'une table : les réglages que le cadrage automatique de
// VPX 10.8.1 lit encore et qu'un <table>.ini peut changer pour une seule table
// (relevé dans le code de VPX : docs/recherche/vue-par-table.md). Les clés
// [TableOverride] ViewCab* n'y figurent pas : le cadrage automatique les écrase.

import { IniDocument } from './ini';
import { formatIniValue, parseIniValue, sameValue, type VpxSettingDef } from './vpx-settings';

export type ViewAdjustId = 'height' | 'fit' | 'eyes';

export interface ViewAdjustSpec {
  id: ViewAdjustId;
  section: string;
  key: string;
  label: string;
  help: string;
  /** Valeurs parcourues aux flippers, dans l'ordre ; celles de `include` (courante, enregistrée, générale) en font toujours partie. */
  choices(include: number[]): number[];
  format(value: number): string;
}

/** CabinetAutofitMode : 0 manuel, 1 « Fit Table », 2 « Fit Screen ». */
export const AUTOFIT_MANUAL = 0;
export const AUTOFIT_FIT = 1;
export const AUTOFIT_FILL = 2;

const FIT_LABELS = ['Manuel (vue enregistrée)', 'Ajuster la table', 'Remplir l’écran'];

export const VIEW_ADJUST: ViewAdjustSpec[] = [
  {
    id: 'height',
    section: 'Player',
    key: 'CabinetAutofitPos',
    label: 'Hauteur de la table',
    help: 'Position des flippers du bas sur l’écran. Plus haut, le bas de la table (tablier, flippers) remonte dans l’écran, au prix du haut. VPX s’arrête de lui-même quand un bord de la table atteint le bord de l’écran.',
    choices: (include) => grid(0, 0.2, 0.01, include),
    format: (v) => `${decimal(v * 100)} %`,
  },
  {
    id: 'fit',
    section: 'Player',
    key: 'CabinetAutofitMode',
    label: 'Cadrage',
    help: '« Ajuster la table » garde ses proportions : toute la largeur, le haut ou le bas peut dépasser. « Remplir l’écran » montre toute la longueur, en étirant ou en tassant la table.',
    // Le cadrage manuel n'est proposé que s'il est en vigueur (.ini livré avec la table…), pour pouvoir y revenir.
    choices: (include) => (include.includes(AUTOFIT_MANUAL) ? [AUTOFIT_MANUAL, AUTOFIT_FIT, AUTOFIT_FILL] : [AUTOFIT_FIT, AUTOFIT_FILL]),
    format: (v) => FIT_LABELS[v] ?? String(v),
  },
  {
    id: 'eyes',
    section: 'Player',
    key: 'ScreenPlayerZ',
    label: 'Hauteur des yeux',
    help: 'Hauteur des yeux du joueur au-dessus du bas de l’écran. Plus bas, le plateau paraît plus petit et plus profond ; plus haut, plus grand et plus plat. La vitre reste ajustée à l’écran.',
    choices: (include) => grid(30, 100, 5, include),
    format: (v) => `${decimal(v)} cm`,
  },
];

/** Crans réguliers de `min` à `max`, plus les valeurs de `include` qui tombent entre deux. */
function grid(min: number, max: number, step: number, include: number[]): number[] {
  const values = new Set<number>();
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) values.add(round(min + i * step));
  for (const v of include) values.add(round(v));
  return [...values].sort((a, b) => a - b);
}

/** Arrondi qui efface les restes des calculs en virgule flottante (0.07 et non 0.07000000000000001). */
function round(value: number): number {
  return Number(value.toFixed(6));
}

function decimal(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export interface ViewAdjustItem {
  spec: ViewAdjustSpec;
  def: VpxSettingDef;
  /** Valeur générale : VPinballX.ini, sinon défaut de VPX. */
  general: number;
  /** Surcharge trouvée dans le .ini de la table. */
  table?: number;
  /** Valeur à l'écran. */
  value: number;
}

export type SettingLookup = (section: string, key: string) => VpxSettingDef | undefined;

/** Les réglages de l'écran, lus dans les deux fichiers ; un réglage absent du schéma de cette version est ignoré. */
export function viewAdjustItems(lookup: SettingLookup, globalIni: IniDocument, tableIni: IniDocument): ViewAdjustItem[] {
  return VIEW_ADJUST.flatMap((spec) => {
    const def = lookup(spec.section, spec.key);
    if (!def) return [];
    const general = numberOf(def, globalIni) ?? Number(def.default);
    const table = numberOf(def, tableIni);
    return [{ spec, def, general, table, value: table ?? general }];
  });
}

function numberOf(def: VpxSettingDef, doc: IniDocument): number | undefined {
  const value = parseIniValue(def, doc.get(def.section, def.key));
  return value === undefined ? undefined : Number(value);
}

/** Valeur voisine aux flippers (−1 : flipper gauche), sans boucler au bout de la liste. */
export function stepViewValue(item: ViewAdjustItem, direction: 1 | -1): number {
  const choices = viewChoices(item);
  const at = choices.findIndex((v) => sameValue(item.def, v, item.value));
  return choices[Math.min(choices.length - 1, Math.max(0, at + direction))]!;
}

export function viewChoices(item: ViewAdjustItem): number[] {
  return item.spec.choices([item.value, savedValue(item), item.general]);
}

/** Valeur que VPX utiliserait avec les fichiers actuels (sans les changements en cours). */
export function savedValue(item: ViewAdjustItem): number {
  return item.table ?? item.general;
}

export function isViewAdjustChanged(items: ViewAdjustItem[]): boolean {
  return items.some((item) => !sameValue(item.def, item.value, savedValue(item)));
}

/**
 * Écrit les valeurs à l'écran dans le .ini d'une table. Comme pour les autres
 * réglages par table : une valeur égale au réglage général n'est pas gardée (la clé
 * disparaît, VPX reprend la valeur générale). Renvoie true si le document a changé.
 */
export function applyViewAdjust(doc: IniDocument, items: ViewAdjustItem[]): boolean {
  let changed = false;
  for (const item of items) {
    const { section, key } = item.def;
    if (sameValue(item.def, item.value, item.general)) {
      changed = doc.remove(section, key) || changed;
      continue;
    }
    const text = formatIniValue(item.def, item.value);
    if (doc.get(section, key) === text) continue;
    doc.set(section, key, text);
    changed = true;
  }
  return changed;
}

/** Texte du .ini d'essai : celui de la table, avec les valeurs à l'écran. */
export function trialIniText(tableIni: IniDocument, items: ViewAdjustItem[]): string {
  const doc = IniDocument.parse(tableIni.toString());
  applyViewAdjust(doc, items);
  return doc.toString();
}

/** Raison pour laquelle un réglage n'a pas d'effet avec les autres valeurs à l'écran. */
export function viewAdjustInactive(item: ViewAdjustItem, items: ViewAdjustItem[]): string | undefined {
  if (item.spec.id !== 'height') return undefined;
  const fit = items.find((i) => i.spec.id === 'fit')?.value;
  if (fit === AUTOFIT_FILL) return 'Sans effet en « Remplir l’écran » : toute la longueur est déjà à l’écran.';
  if (fit === AUTOFIT_MANUAL) return 'Sans effet en cadrage manuel.';
  return undefined;
}

export interface ViewAdjustNote {
  tone: 'warning' | 'info';
  text: string;
}

/**
 * Ce qui empêche les réglages d'agir, lu dans les deux fichiers : vue autre que borne, et
 * vue manuelle (ViewCab*) devenue inutile. (La taille de l'écran ne manque jamais :
 * VPX 10.8.1 prend 95,89 × 53,94 cm par défaut, au moins 5 cm.)
 */
export function viewAdjustNotes(lookup: SettingLookup, globalIni: IniDocument, tableIni: IniDocument, items: ViewAdjustItem[]): ViewAdjustNote[] {
  const notes: ViewAdjustNote[] = [];
  const effective = (key: string): number | undefined => {
    const def = lookup('Player', key);
    if (!def) return undefined;
    return numberOf(def, tableIni) ?? numberOf(def, globalIni) ?? Number(def.default);
  };
  const view = effective('BGSet');
  if (view !== undefined && view !== 1) {
    notes.push({ tone: 'warning', text: 'Les tables ne sont pas affichées en vue borne (BGSet ≠ 1) : ces réglages ne servent qu’en vue borne. Relancez l’assistant d’écrans si le playfield est bien plus haut que large.' });
  }
  const fit = items.find((i) => i.spec.id === 'fit')?.value;
  const manual = tableIni.entries().filter((e) => e.section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(e.key) && e.value.trim() !== '');
  if (manual.length && fit !== AUTOFIT_MANUAL) {
    notes.push({ tone: 'info', text: `Le .ini de la table contient aussi une vue réglée à la main (${manual.length} clé${manual.length > 1 ? 's' : ''} ViewCab…) : VPX l’ignore tant que le cadrage est automatique.` });
  }
  return notes;
}
