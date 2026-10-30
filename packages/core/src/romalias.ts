// Alias de ROM propres à une table (docs/recherche/acquisition.md § 7.4 et § 8.2) :
// le plugin PinMAME de VPX 10.8.1 lit alias.txt dans le dossier PinMAME de la table
// (<table>\pinmame, dès que <table>\pinmame\roms existe), une ligne « alias,jeu réel »,
// sans casse, avant même la liste des jeux. Deux usages :
//
// - une révision voisine : le script demande t2_l8, la borne n'a que t2_l6 ; la ligne
//   « t2_l8,t2_l6 » fait charger t2_l6, sur demande de l'utilisateur seulement ;
// - un alias historique : le script demande « goldfinger », ancien nom de « bond » que
//   VPinMAME connaissait d'office et que le plugin ne connaît plus (vpmalias.ts).
//
// Une ligne devenue inutile (la ROM demandée est arrivée) doit partir : l'alias passe
// avant la ROM et la cacherait.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { HISTORIC_ROM_ALIASES } from './vpmalias';
import { t } from './i18n';

export const ALIAS_FILE = 'alias.txt';

/** <table>\pinmame\alias.txt */
export function tableAliasFile(folder: string): string {
  return path.join(folder, 'pinmame', ALIAS_FILE);
}

export interface AliasLine {
  /** Nom demandé par le script. */
  alias: string;
  /** Jeu réellement chargé. */
  rom: string;
}

/** Lignes « alias,jeu » d'un alias.txt ; commentaires (#) et lignes vides ignorés. */
export function parseAliases(text: string): AliasLine[] {
  const out: AliasLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [alias, rom] = line.split(',').map((p) => p.trim());
    if (alias && rom) out.push({ alias, rom });
  }
  return out;
}

export function readTableAliases(folder: string): { text: string; lines: AliasLine[] } {
  try {
    const text = fs.readFileSync(tableAliasFile(folder), 'utf8');
    return { text, lines: parseAliases(text) };
  } catch {
    return { text: '', lines: [] };
  }
}

/** Alias de ce nom dans le fichier, sans casse. */
export function aliasFor(lines: AliasLine[], name: string): AliasLine | undefined {
  return lines.find((l) => l.alias.toLowerCase() === name.toLowerCase());
}

const HEADER = '# Alias de ROM de cette table, écrits par Cyber Pinball : « nom demandé par le script,jeu chargé ».'; // i18n-ignore : écrit dans alias.txt

/** Contenu du fichier avec la ligne `alias,rom` (remplace une ligne du même alias). */
export function withAlias(text: string, alias: string, rom: string, comment?: string): string {
  const kept = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && parseAliases(l)[0]?.alias.toLowerCase() !== alias.toLowerCase());
  const lines = kept.length ? kept : [HEADER];
  if (comment) lines.push(`# ${comment}`);
  lines.push(`${alias},${rom}`);
  return lines.join('\r\n') + '\r\n';
}

/** Contenu du fichier sans la ligne de cet alias (ni son commentaire) ; vide s'il ne reste aucun alias. */
export function withoutAlias(text: string, alias: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (parseAliases(line)[0]?.alias.toLowerCase() === alias.toLowerCase()) {
      // Le commentaire écrit avec la ligne part avec elle.
      if (out.length && out[out.length - 1]!.startsWith('# ') && out[out.length - 1] !== HEADER) out.pop();
      continue;
    }
    if (line.trim()) out.push(line);
  }
  return parseAliases(out.join('\n')).length ? out.join('\r\n') + '\r\n' : '';
}

const HISTORIC = new Map(HISTORIC_ROM_ALIASES.map(([alias, rom]) => [alias.toLowerCase(), rom]));

/**
 * Les jeux que PinMAME charge vraiment pour la table : chaque ROM demandée par le script, remplacée
 * par son alias de <table>\pinmame\alias.txt (le plugin ne le lit que si <table>\pinmame\roms
 * existe). La mémoire (<jeu>.nv), sa carte et ses réglages sont ceux du jeu chargé : Star Trek
 * demande st_162h et charge st_161h, sa mémoire est st_161h.nv (relevé sur la borne le 30/10/2026).
 */
export function loadedRoms(folder: string, roms: readonly string[]): string[] {
  let lines: AliasLine[] = [];
  try {
    if (fs.statSync(path.join(folder, 'pinmame', 'roms')).isDirectory()) lines = readTableAliases(folder).lines;
  } catch {
    // Pas de ROM à côté de la table : le dossier PinMAME commun, sans alias.txt de la table.
  }
  return [...new Set(roms.map((r) => aliasFor(lines, r)?.rom ?? r))];
}

/** Jeu réel d'un ancien nom de VPinMAME (« goldfinger » : « bond ») ; undefined sinon. */
export function historicAlias(name: string): string | undefined {
  return HISTORIC.get(name.toLowerCase());
}

/** « t2_l8 » et « t2_l6 » sont de la même famille : même nom avant le « _ ». */
export function romFamilyOf(rom: string): string {
  const i = rom.indexOf('_');
  return (i >= 2 ? rom.slice(0, i) : rom).toLowerCase();
}

/**
 * Révision voisine de `wanted` parmi les ROM présentes : même famille, de préférence de
 * la même sorte (« l » : production, « p » : prototype, « d » : …) puis la plus récente.
 * undefined si aucune.
 */
export function neighbourRom(wanted: string, available: Iterable<string>): string | undefined {
  const family = romFamilyOf(wanted);
  if (!wanted.includes('_')) return undefined;
  const suffix = (r: string) => r.slice(r.indexOf('_') + 1).toLowerCase();
  const kind = (s: string) => /^[a-z]*/.exec(s)?.[0] ?? '';
  const number = (s: string) => Number(/\d+/.exec(s)?.[0] ?? -1);
  const want = suffix(wanted);
  const candidates = [...new Set([...available].map((r) => r.replace(/\.zip$/i, '')))].filter(
    (r) => r.toLowerCase() !== wanted.toLowerCase() && r.includes('_') && romFamilyOf(r) === family,
  );
  candidates.sort(
    (a, b) =>
      Number(kind(suffix(b)) === kind(want)) - Number(kind(suffix(a)) === kind(want)) ||
      number(suffix(b)) - number(suffix(a)) ||
      a.localeCompare(b),
  );
  return candidates[0];
}

/** Ce qu'il faut savoir avant d'accepter une révision voisine. */
export function neighbourWarning(): string {
  return t(
    'Une autre révision du programme du même jeu : elle joue en général pareil, mais des lampes, des bobines ou des contacts peuvent différer, les réglages et records (NVRAM) ne sont pas repris, et les sons remasterisés ou les couleurs du DMD rangés sous l’autre nom ne seront plus trouvés.',
  );
}
