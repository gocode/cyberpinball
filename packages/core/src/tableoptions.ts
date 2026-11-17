// Options de table de VPX (menu F12) qui choisissent où la table dessine son DMD.
//
// Les tables récentes déclarent leurs réglages par Table1.Option(nom, min, max, pas, défaut, unité,
// Array(libellés)) dans Table1_OptionEvent ; VPX 10.8.1 range le choix du joueur dans
// [TableOption] du .ini de la table, sous le nom de l'option dont chaque caractère qui n'est ni
// lettre ni chiffre devient « _ » (PinTable::Option, src/parts/pintable.cpp au commit af26b2d93) :
// « DMD Type » -> DMD_Type. Une liste de libellés donne un entier (min + rang du libellé) ; les
// paires Off/On, Hide/Show et False/True un booléen (0 ou 1) ; une valeur vide compte pour absente
// (LayeredINIPropertyStore).
//
// Le piège (JP's Space Cadet v7.0, JPSalas, 17/11/2026, sur une borne à trois écrans) : l'option
// « DMD Type » vaut par défaut « Desktop DMD », un DMD fait de flashers dans le décor du mode
// bureau, invisible en mode cabinet ; FlexDMD n'est jamais créé et la fenêtre du DMD de VPX reste
// noire. Sur une borne qui a un écran (ou une zone) de DMD, Cyber Pinball règle ces options sur
// FlexDMD (à défaut UltraDMD, que le plugin FlexDMD de VPX fournit aussi) dans le .ini de la table,
// tant que le joueur n'a pas fait son propre choix (clé absente ou vide) : la table n'est pas
// modifiée et le menu F12 de VPX montre et change ce réglage comme n'importe quel autre.

import { IniDocument } from './ini';
import { scriptCode } from './vbscript';

/** Section du .ini de la table où VPX range les options de table. */
export const TABLE_OPTION_SECTION = 'TableOption'; // i18n-ignore : section du .ini de VPX

/** Un appel Table.Option(...) dont tous les arguments sont écrits en toutes lettres. */
export interface TableOptionDecl {
  /** Nom affiché dans le menu F12. */
  name: string;
  /** Clé dans [TableOption] du .ini. */
  key: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Libellés des valeurs, de min à max ; absent pour une option numérique. */
  values?: string[];
}

/** Option de table qui laisse le DMD dans le décor du mode bureau, et la valeur qui l'envoie à la borne. */
export interface CabinetDmdOption {
  name: string;
  key: string;
  /** Libellé de la valeur par défaut (« Desktop DMD »), ou la valeur elle-même. */
  from: string;
  /** Libellé choisi pour la borne (« FlexDMD »). */
  to: string;
  /** Texte à écrire dans [TableOption]. */
  value: string;
}

/** Clé de VPX pour une option : nom sans espaces autour, tout ce qui n'est ni lettre ni chiffre en « _ ». */
export function tableOptionKey(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9]/g, '_');
}

/** Arguments d'un appel, séparés au premier niveau (chaînes et parenthèses respectées). */
function splitArgs(text: string, start: number): { args: string[]; end: number } | undefined {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      current += c;
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      current += c;
    } else if (c === '(') {
      depth++;
      current += c;
    } else if (c === ')') {
      if (depth === 0) {
        args.push(current.trim());
        return { args, end: i };
      }
      depth--;
      current += c;
    } else if (c === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else current += c;
  }
  return undefined;
}

const STRING_RE = /^"((?:[^"]|"")*)"$/;
const unquote = (s: string): string | undefined => {
  const m = STRING_RE.exec(s.trim());
  return m ? m[1]!.replace(/""/g, '"') : undefined;
};
const number = (s: string): number | undefined => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s.trim()) ? Number(s.trim()) : undefined);

/**
 * Options de table que le script déclare en toutes lettres (nom, bornes, défaut et libellés
 * littéraux), une fois chacune ; une option dont un argument est calculé est ignorée.
 */
export function tableOptions(vbs: string): TableOptionDecl[] {
  // Sans commentaires, les lignes continuées par « _ » remises bout à bout.
  const code = scriptCode(vbs).replace(/[ \t]_[ \t]*\r?\n/g, ' ');
  const out: TableOptionDecl[] = [];
  for (const m of code.matchAll(/\b[A-Za-z_]\w*\.Option\s*\(/g)) {
    const call = splitArgs(code, m.index + m[0].length);
    if (!call || call.args.length < 5) continue;
    const name = unquote(call.args[0]!);
    const [min, max, step, def] = call.args.slice(1, 5).map(number);
    if (!name?.trim() || min === undefined || max === undefined || step === undefined || def === undefined) continue;
    let values: string[] | undefined;
    const list = call.args[6];
    if (list !== undefined) {
      const array = /^Array\s*\(([\s\S]*)\)$/i.exec(list.trim());
      if (!array) continue;
      const inner = splitArgs(`${array[1]})`, 0);
      const literals = inner?.args.map(unquote);
      if (!literals || literals.some((l) => l === undefined)) continue;
      values = literals as string[];
    }
    const key = tableOptionKey(name);
    if (out.some((o) => o.key.toLowerCase() === key.toLowerCase())) continue;
    out.push({ name: name.trim(), key, min, max, step, def, ...(values && { values }) });
  }
  return out;
}

/** Libellé d'un DMD que la borne affiche dans la fenêtre du DMD de VPX, par ordre de préférence. */
const CABINET_DMD = [/flex\s*-?\s*dmd/i, /ultra\s*-?\s*dmd/i];
/** Libellé d'un DMD qui ne s'affiche que dans le décor du mode bureau (ou nulle part). */
const DESKTOP_DMD = /desktop|\bdt\b|internal|playfield|backdrop|flashers?|text\s*box|apron|\bnone\b|\boff\b|disabled?/i;
/** Paires que VPX traite en booléen (PinTable::Option) : la seconde vaut 1. */
const TOGGLES = [
  ['off', 'on'],
  ['hide', 'show'],
  ['false', 'true'],
];

function cabinetDmdOption(o: TableOptionDecl): CabinetDmdOption | undefined {
  if (o.step !== 1 || !Number.isInteger(o.min) || !Number.isInteger(o.max) || !Number.isInteger(o.def)) return undefined;
  const values = o.values?.map((v) => v.trim());
  const toggle = values?.length === 2 && TOGGLES.some(([a, b]) => values[0]!.toLowerCase() === a && values[1]!.toLowerCase() === b);
  // Liste de libellés : DMD de bureau par défaut, et un DMD de borne parmi les choix.
  if (values && !toggle) {
    if (values.length !== o.max - o.min + 1) return undefined;
    const from = values[o.def - o.min];
    if (from === undefined || !DESKTOP_DMD.test(from) || CABINET_DMD.some((re) => re.test(from))) return undefined;
    if (!/dmd/i.test(o.name) && !values.some((v) => /dmd/i.test(v))) return undefined;
    for (const re of CABINET_DMD) {
      const index = values.findIndex((v) => re.test(v) && !DESKTOP_DMD.test(v));
      if (index >= 0) return { name: o.name, key: o.key, from, to: values[index]!, value: String(o.min + index) };
    }
    return undefined;
  }
  // Interrupteur « Use FlexDMD » (Off/On, ou 0/1 sans libellés) éteint par défaut.
  if (o.min !== 0 || o.max !== 1 || o.def !== 0) return undefined;
  if (values && !toggle) return undefined;
  if (!CABINET_DMD.some((re) => re.test(o.name)) || /\b(no|disable|hide|off)\b/i.test(o.name)) return undefined;
  return { name: o.name, key: o.key, from: values?.[0] ?? '0', to: values?.[1] ?? '1', value: '1' };
}

/** Options du script qui laissent le DMD dans le décor du mode bureau, avec la valeur pour une borne. */
export function cabinetDmdOptions(vbs: string): CabinetDmdOption[] {
  return tableOptions(vbs).flatMap((o) => cabinetDmdOption(o) ?? []);
}

/**
 * Les options à régler pour la borne dans ce .ini de table : celles que le joueur n'a pas encore
 * choisies (clé absente ou vide). Rend le nouveau texte, ou undefined s'il n'y a rien à écrire.
 */
export function cabinetDmdIni(iniText: string, options: readonly CabinetDmdOption[]): { content: string; applied: CabinetDmdOption[] } | undefined {
  const doc = IniDocument.parse(iniText);
  const applied = options.filter((o) => !doc.get(TABLE_OPTION_SECTION, o.key)?.trim());
  if (!applied.length) return undefined;
  // Fichier neuf : fins de ligne de Windows, comme ceux que VPX écrit.
  if (!iniText.trim()) return { content: [`[${TABLE_OPTION_SECTION}]`, ...applied.map((o) => `${o.key} = ${o.value}`), ''].join('\r\n'), applied };
  for (const o of applied) doc.set(TABLE_OPTION_SECTION, o.key, o.value);
  return { content: doc.toString(), applied };
}
