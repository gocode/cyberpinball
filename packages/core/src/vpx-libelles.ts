// Libellés distincts pour les réglages de VPX qui portent le même nom dans une
// section. VPX déclare par exemple sept profils DMD (Profile1DotTint … Profile7DotTint)
// avec le même libellé « Dot Tint » : seule la clé les distingue, et la liste de
// l'onglet Avancé paraissait répéter sept fois les mêmes lignes. Même cas pour les
// dix jeux de réglages d'anaglyphe, les vues Desktop / FSS / Cab, les tailles
// fenêtrées et plein écran.
//
// La différence est tirée des clés elles-mêmes (préfixe et suffixe communs retirés),
// sans liste écrite à la main : un nouveau profil ou une nouvelle version de VPX est
// couvert sans rien changer.

import type { VpxSettingDef } from './vpx-settings-parser';

export interface LabelQualifier {
  /** Mot qui précède le numéro (« Profile », « Anaglyph »), vide s'il n'y en a pas. */
  word: string;
  /** Ce qui distingue ce réglage de ses homonymes : « 3 », « FS », « Desktop »… ; vide pour le réglage de base. */
  part: string;
  /** Le qualificatif est un numéro. */
  numeric: boolean;
}

function lastWord(text: string): string {
  const words = text.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g);
  return words?.length ? words[words.length - 1]! : '';
}

function commonPrefix(keys: string[]): string {
  let p = keys[0]!;
  for (const k of keys) {
    let i = 0;
    while (i < p.length && i < k.length && p[i] === k[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

function commonSuffix(keys: string[], reserved: number): string {
  let s = keys[0]!;
  for (const k of keys) {
    let i = 0;
    while (i < s.length && i < k.length && s[s.length - 1 - i] === k[k.length - 1 - i]) i++;
    s = s.slice(s.length - i);
  }
  // Le suffixe ne mord pas sur le préfixe d'une clé courte (PlayfieldWidth / PlayfieldFSWidth).
  const shortest = Math.min(...keys.map((k) => k.length));
  const room = Math.max(0, shortest - reserved);
  return s.length > room ? s.slice(s.length - room) : s;
}

/** Retire du préfixe un mot coupé en deux (« Profile1 » commun à 1 et 10 : le préfixe garde « Profile »). */
function trimPrefixDigits(prefix: string): string {
  return prefix.replace(/\d+$/, '');
}

/**
 * Pour chaque réglage dont le libellé est partagé avec un autre de la même section,
 * ce qui le distingue. Les réglages au libellé unique, ou dont les clés ne permettent
 * pas de tirer une différence nette, n'apparaissent pas dans le résultat.
 */
export function labelQualifiers(defs: readonly VpxSettingDef[]): Map<VpxSettingDef, LabelQualifier> {
  const groups = new Map<string, VpxSettingDef[]>();
  for (const def of defs) {
    const id = `${def.section}\n${def.label}`;
    const group = groups.get(id);
    if (group) group.push(def);
    else groups.set(id, [def]);
  }
  const out = new Map<VpxSettingDef, LabelQualifier>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keys = group.map((d) => d.key);
    if (new Set(keys).size !== keys.length) continue;
    const prefix = trimPrefixDigits(commonPrefix(keys));
    const suffix = commonSuffix(keys, prefix.length);
    const parts = keys.map((k) => k.slice(prefix.length, k.length - suffix.length));
    // Deux réglages au même qualificatif : on ne devine pas, la clé reste affichée à côté.
    if (new Set(parts).size !== parts.length) continue;
    const numeric = parts.every((p) => /^\d+$/.test(p));
    const word = numeric ? lastWord(prefix) : '';
    group.forEach((def, i) => out.set(def, { word, part: parts[i]!, numeric }));
  }
  return out;
}
