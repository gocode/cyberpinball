// Tables d'une installation existante (PinUP Popper, PinballX, VPX rangé à l'ancienne) : une
// table n'y est pas dans un dossier à elle. Son .vpx et son fronton sont dans le dossier des
// tables, sa ROM, ses couleurs et ses sons dans VPinMAME, son PuP-Pack dans PinUPSystem\PUPVideos,
// ses médias dans POPMedia (ou PinballX\Media), son dossier DMD à côté des tables. Choisir le seul
// .vpx n'emportait donc rien d'autre (une table reprise sans son PuP-Pack, le 05/11/2026).
//
// Ici, d'après l'emplacement du .vpx et ce que dit son script, on retrouve chacune de ces parties :
// elles entrent dans le plan d'ajout avec la table (ImportSource.owner), rien n'est copié avant
// « Installer ». On liste aussi les tables d'une installation, pour en reprendre une seule.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { expectedPackNames, findPackRoot, isJunkName, isPackRoot, type PupLoadFacts } from './puppack';
import { isInside, samePath } from './fileops';
import { t } from './i18n';
import { mediaGameNames, scanInstallation, type IncomingMedia } from './mediaimport';
import { nameKey } from './tablefiles';
import type { ImportSource } from './tableimport';
import { parseTableName } from './tables';

/** Où une installation existante range chaque partie d'une table. */
export interface InstallationLayout {
  /** Dossier qui contient tout (« C:\vPinball »), pour l'affichage des chemins. */
  root: string;
  /** Dossier des tables : les .vpx et leurs frontons. */
  tables: string;
  /** VPinMAME : roms, altcolor, altsound. */
  pinmame?: string;
  /** PuP-Packs (PinUPSystem\PUPVideos). */
  pupVideos?: string;
  /** Médias du menu : POPMedia de Popper, Media de PinballX. */
  mediaRoots: string[];
}

/** Ce qu'il faut savoir du script d'une table pour retrouver ses parties (ScriptFacts, doctor.ts). */
export type CompanionFacts = PupLoadFacts & { dmdFolder?: string };

/** Partie d'une table retrouvée hors de son dossier. */
export interface Companion {
  path: string;
  part: 'backglass' | 'pov' | 'tableIni' | 'script' | 'rom' | 'altcolor' | 'altsound' | 'pup' | 'dmdFolder' | 'media';
}

/** Ce que la reprise a retrouvé (ou non) pour une table : montré dans le plan d'ajout. */
export interface CompanionReport {
  vpx: string;
  root: string;
  found: Companion[];
  /** Ce que le script attend et que l'installation n'a pas (« PuP-Pack « TheMatrix » »). */
  missing: string[];
}

const NAMED_LIKE_TABLE: Record<string, Companion['part']> = { '.directb2s': 'backglass', '.pov': 'pov', '.ini': 'tableIni', '.vbs': 'script' };

/**
 * Disposition de l'installation qui contient `dir` (le dossier d'un .vpx, ou un dossier choisi :
 * la racine, le dossier des tables…), ou undefined si rien n'y ressemble. On remonte de quatre
 * dossiers au plus ; `exclude` : la racine de Cyber Pinball, jamais prise pour une installation.
 */
export function findInstallation(dir: string, exclude: string[] = []): InstallationLayout | undefined {
  const start = path.resolve(dir);
  if (exclude.some((e) => isInside(start, e))) return undefined;
  // Un dossier de Cyber Pinball (sa bibliothèque de ROM, ses émulateurs) n'est jamais repris.
  const own = (p: string | undefined) => (p && !exclude.some((e) => isInside(p, e)) ? p : undefined);
  let pinmame: string | undefined;
  let pupVideos: string | undefined;
  let mediaRoots: string[] = [];
  let at = start;
  for (let up = 0; up <= 4; up++) {
    const inPinup = path.basename(at).toLowerCase() === 'pinupsystem';
    pinmame ??= own(child(at, 'VPinMAME') ?? child(at, 'VisualPinball', 'VPinMAME') ?? child(at, 'Visual Pinball', 'VPinMAME'));
    pupVideos ??= own(child(at, 'PinUPSystem', 'PUPVideos') ?? (inPinup ? child(at, 'PUPVideos') : undefined));
    if (!mediaRoots.length) mediaRoots = [child(at, 'PinUPSystem', 'POPMedia') ?? (inPinup ? child(at, 'POPMedia') : undefined), child(at, 'PinballX', 'Media')].map(own).filter((d): d is string => Boolean(d));
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  if (!pinmame && !pupVideos && !mediaRoots.length) return undefined;
  const tables = tablesDirOf(start, commonDir([start, pinmame, pupVideos, ...mediaRoots]));
  if (!tables) return undefined;
  return { root: commonDir([tables, pinmame, pupVideos, ...mediaRoots]), tables, pinmame, pupVideos, mediaRoots };
}

/** Dossier commun le plus profond : « C:\vPinball » pour VisualPinball\Tables et PinUPSystem\PUPVideos. */
function commonDir(dirs: (string | undefined)[]): string {
  const list = dirs.filter((d): d is string => Boolean(d)).map((d) => path.resolve(d));
  let common = list[0]!;
  for (const d of list.slice(1)) {
    while (!isInside(d, common) && path.dirname(common) !== common) common = path.dirname(common);
  }
  return common;
}

/** Dossier des tables : celui qui a été choisi s'il contient des .vpx, sinon « Tables » sous la racine. */
function tablesDirOf(start: string, root: string): string | undefined {
  if (hasVpx(start)) return start;
  for (const base of [start, root]) {
    const found = child(base, 'Tables') ?? child(base, 'VisualPinball', 'Tables') ?? child(base, 'Visual Pinball', 'Tables') ?? child(base, 'vPinball', 'VisualPinball', 'Tables');
    if (found) return found;
  }
  return undefined;
}

/** Installations connues de ce PC (emplacements par défaut), pour la reprise d'une table. */
export function knownTableInstallations(drives: string[] = ['C:', 'D:', 'E:'], exclude: string[] = []): InstallationLayout[] {
  const found: InstallationLayout[] = [];
  for (const drive of drives) {
    for (const dir of [`${drive}\\vPinball`, `${drive}\\Visual Pinball`, `${drive}\\VisualPinball`, `${drive}\\Games\\vPinball`, `${drive}\\PinUPSystem`]) {
      if (!isDir(dir)) continue;
      const layout = findInstallation(dir, exclude);
      if (layout && !found.some((f) => samePath(f.tables, layout.tables))) found.push(layout);
    }
  }
  return found;
}

/** Une table de l'installation, telle que la liste la montre. */
export interface InstallationTable {
  vpx: string;
  title: string;
  manufacturer?: string;
  year?: number;
  /** Ce que le seul nom du .vpx suffit à retrouver (fronton, médias) ; le reste vient du script, au plan. */
  backglass: boolean;
  medias: number;
}

/** Tables (.vpx) du dossier des tables et de ses sous-dossiers directs, par titre. */
export function listInstallationTables(layout: InstallationLayout, medias = indexInstallationMedias(layout)): InstallationTable[] {
  const files: string[] = [];
  for (const d of dirents(layout.tables)) {
    const p = path.join(layout.tables, d.name);
    if (d.isFile() && /\.vpx$/i.test(d.name)) files.push(p);
    else if (d.isDirectory()) for (const s of dirents(p)) if (s.isFile() && /\.vpx$/i.test(s.name)) files.push(path.join(p, s.name));
  }
  return files
    .map((vpx): InstallationTable => {
      const stem = path.basename(vpx, path.extname(vpx));
      const named = parseTableName(stem);
      return {
        vpx,
        title: named.title,
        ...(named.manufacturer ? { manufacturer: named.manufacturer } : {}),
        ...(named.year ? { year: named.year } : {}),
        backglass: Boolean(sibling(vpx, '.directb2s')),
        medias: (medias.get(stem.toLowerCase()) ?? []).length,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || a.vpx.localeCompare(b.vpx));
}

/** Médias de l'installation (Visual Pinball seulement), par nom de jeu en minuscules : Popper et PinballX les nomment comme le .vpx. */
export function indexInstallationMedias(layout: InstallationLayout): Map<string, IncomingMedia[]> {
  const index = new Map<string, IncomingMedia[]>();
  for (const root of layout.mediaRoots) {
    for (const file of scanInstallation(root).files) {
      for (const name of mediaGameNames(file.media.game)) {
        const key = name.toLowerCase();
        index.set(key, [...(index.get(key) ?? []), file]);
      }
    }
  }
  return index;
}

/**
 * Parties d'une table de l'installation, d'après son nom et son script : fichiers nommés comme
 * elle à côté d'elle (fronton, point de vue, réglages, script), ROM et ses couleurs et sons dans
 * VPinMAME, PuP-Pack dans PUPVideos (les noms que chargera le plugin), dossier DMD du script,
 * médias nommés comme elle. `missing` : ce que le script attend et qui n'y est pas.
 */
export function tableCompanions(vpx: string, layout: InstallationLayout, facts?: CompanionFacts, medias?: Map<string, IncomingMedia[]>): CompanionReport {
  const found: Companion[] = [];
  const missing: string[] = [];
  const add = (p: string | undefined, part: Companion['part']) => {
    if (p && !found.some((c) => samePath(c.path, p))) found.push({ path: p, part });
  };
  for (const [ext, part] of Object.entries(NAMED_LIKE_TABLE)) add(sibling(vpx, ext), part);

  const roms = facts?.usesPinmame ? facts.roms : [];
  if (layout.pinmame) {
    for (const rom of roms) {
      add(fileIn(path.join(layout.pinmame, 'roms'), `${rom}.zip`), 'rom');
      add(child(layout.pinmame, 'altcolor', rom), 'altcolor');
      add(child(layout.pinmame, 'altsound', rom), 'altsound');
    }
  }
  if (roms.length && !found.some((c) => c.part === 'rom')) missing.push(t('ROM « {rom} »', { rom: roms[0]! }));

  // Le pack sous l'un des noms que chargera le plugin ; à défaut, un dossier au titre de la table.
  const stemTitle = nameKey(parseTableName(path.basename(vpx, path.extname(vpx))).title);
  let pack: string | undefined;
  if (layout.pupVideos) {
    pack = expectedPackNames(facts)
      .map((n) => child(layout.pupVideos!, n))
      .find(Boolean);
    const byTitle = stemTitle.length >= 4 ? dirents(layout.pupVideos).find((d) => d.isDirectory() && nameKey(d.name) === stemTitle) : undefined;
    if (!pack && byTitle) pack = path.join(layout.pupVideos, byTitle.name);
  }
  add(pack, 'pup');
  // Le script charge un PuP-Pack (packNames) que l'installation n'a pas : à dire, pas à taire.
  if (!pack && facts?.pup?.packNames?.length) missing.push(t('PuP-Pack « {name} »', { name: facts.pup.packNames[0]! }));

  if (facts?.dmdFolder) {
    const dmd = child(path.dirname(vpx), facts.dmdFolder) ?? child(layout.tables, facts.dmdFolder);
    if (dmd) add(dmd, 'dmdFolder');
    else missing.push(t('dossier DMD « {name} »', { name: facts.dmdFolder }));
  }

  const stem = path.basename(vpx, path.extname(vpx)).toLowerCase();
  for (const m of (medias ?? indexInstallationMedias(layout)).get(stem) ?? []) add(m.from, 'media');
  return { vpx, root: layout.root, found, missing };
}

/**
 * Ce qui accompagne les .vpx choisis dans une installation existante : de nouvelles sources
 * d'import (copiées, rattachées à leur table), et ce qui a été retrouvé pour chaque table. Une
 * archive déballée, le dossier d'import et ce qui est déjà choisi ne reçoivent rien de plus.
 */
export function installationCompanions(
  sources: ImportSource[],
  facts: (vpx: string) => CompanionFacts | undefined,
  exclude: string[] = [],
): { sources: ImportSource[]; reports: CompanionReport[] } {
  const extra: ImportSource[] = [];
  const reports: CompanionReport[] = [];
  const layouts = new Map<string, { layout: InstallationLayout; medias?: Map<string, IncomingMedia[]> } | undefined>();
  const taken = (p: string) => [...sources, ...extra].some((s) => isInside(p, s.path));
  // Une partie que l'import apporte déjà (le PuP-Pack d'un téléchargement) n'est jamais doublée par celle de l'installation.
  const brought = broughtParts(sources);
  for (const src of sources) {
    if (src.unpacked || src.mode !== 'copy') continue;
    for (const vpx of vpxIn(src.path)) {
      const dir = path.dirname(vpx);
      if (!layouts.has(dir.toLowerCase())) {
        const layout = findInstallation(dir, exclude);
        // Seule une table rangée dans le dossier Tables de l'installation (ou un dossier à elle juste dessous) en fait partie :
        // un .vpx téléchargé ailleurs sur un PC qui a aussi une installation n'y prend rien.
        const inTables = layout && /^tables$/i.test(path.basename(layout.tables)) && (samePath(dir, layout.tables) || samePath(path.dirname(dir), layout.tables));
        layouts.set(dir.toLowerCase(), inTables ? { layout } : undefined);
      }
      const entry = layouts.get(dir.toLowerCase());
      if (!entry) continue;
      entry.medias ??= indexInstallationMedias(entry.layout);
      const report = tableCompanions(vpx, entry.layout, facts(vpx), entry.medias);
      report.found = report.found.filter((c) => !taken(c.path) && !brought.has(c.part));
      for (const c of report.found) extra.push({ path: c.path, mode: 'copy', owner: vpx, label: shownPath(c.path, entry.layout.root) });
      if (report.found.length || report.missing.length) reports.push(report);
    }
  }
  return { sources: extra, reports };
}

/**
 * Parties que les sources choisies apportent déjà, hors les .vpx et leurs voisins de même nom :
 * un PuP-Pack, une ROM, un fronton à part. Un dossier n'est regardé que sur deux niveaux.
 */
function broughtParts(sources: ImportSource[]): Set<Companion['part']> {
  const parts = new Set<Companion['part']>();
  const stems = new Set(sources.flatMap((s) => vpxIn(s.path)).map((v) => path.basename(v, path.extname(v)).toLowerCase()));
  const byFile = (name: string) => {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.zip') parts.add('rom');
    else if (ext === '.directb2s' && !stems.has(path.basename(name, ext).toLowerCase())) parts.add('backglass');
  };
  const look = (dir: string, depth: number) => {
    if (findPackRoot(dir, 2)) parts.add('pup');
    for (const d of dirents(dir)) {
      if (d.isFile()) byFile(d.name);
      else if (d.isDirectory() && depth > 0) look(path.join(dir, d.name), depth - 1);
    }
  };
  for (const s of sources) {
    if (isDir(s.path)) look(s.path, s.unpacked ? 2 : 1);
    else byFile(path.basename(s.path));
  }
  return parts;
}

/** « PinUPSystem › PUPVideos › TheMatrix » : le chemin sous la racine de l'installation. */
function shownPath(p: string, root: string): string {
  const rel = path.relative(root, p);
  return (rel && !rel.startsWith('..') ? rel : p).split(/[\\/]+/).join(' › ');
}

/** Libellé d'une partie retrouvée, pour le plan. */
export function companionLabel(part: Companion['part']): string {
  switch (part) {
    case 'backglass':
      return t('Fronton');
    case 'pov':
      return t('Point de vue');
    case 'tableIni':
      return t('Réglages propres');
    case 'script':
      return t('Script');
    case 'rom':
      return t('ROM');
    case 'altcolor':
      return t('Couleurs du DMD');
    case 'altsound':
      return t('Sons alternatifs');
    case 'pup':
      return t('PuP-Pack');
    case 'dmdFolder':
      return t('Dossier DMD');
    case 'media':
      return t('Médias');
  }
}

/** Titre d'une table de l'installation déjà présente dans la borne ? Par le nom du .vpx ou le titre. */
export function alreadyInstalled(table: InstallationTable, installed: { title: string; files: string[] }[]): boolean {
  const key = nameKey(table.title);
  const file = path.basename(table.vpx).toLowerCase();
  return installed.some((i) => nameKey(i.title) === key || i.files.some((f) => path.basename(f).toLowerCase() === file));
}

function vpxIn(p: string): string[] {
  try {
    if (!fs.statSync(p).isDirectory()) return /\.vpx$/i.test(p) ? [p] : [];
    return fs
      .readdirSync(p, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.vpx$/i.test(d.name))
      .map((d) => path.join(d.parentPath, d.name));
  } catch {
    return [];
  }
}

/** Fichier nommé comme le .vpx, avec cette extension, dans le même dossier (casse indifférente). */
function sibling(vpx: string, ext: string): string | undefined {
  return fileIn(path.dirname(vpx), path.basename(vpx, path.extname(vpx)) + ext);
}

/** Fichier `name` de `dir`, casse indifférente. */
function fileIn(dir: string, name: string): string | undefined {
  const d = dirents(dir).find((e) => e.isFile() && e.name.toLowerCase() === name.toLowerCase());
  return d ? path.join(dir, d.name) : undefined;
}

/** Sous-dossier `a\b\…` de `dir`, casse indifférente, ou undefined. */
function child(dir: string, ...names: string[]): string | undefined {
  let at = dir;
  for (const name of names) {
    const d = dirents(at).find((e) => e.isDirectory() && e.name.toLowerCase() === name.toLowerCase());
    if (!d) return undefined;
    at = path.join(at, d.name);
  }
  return at;
}

function hasVpx(dir: string): boolean {
  return dirents(dir).some((d) => d.isFile() && /\.vpx$/i.test(d.name));
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function dirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Ce qu'il faut savoir d'une table pour retrouver sa partie dans un dossier choisi. */
export interface PartWanted {
  /** Noms de PuP-Pack que chargera le plugin (expectedPackNames). */
  packs: string[];
  roms: string[];
  title: string;
}

/**
 * Dossier choisi pour une partie d'une table (« PuP-Pack : chercher sur le disque ») : le dossier
 * lui-même s'il est la partie ; s'il en contient plusieurs (PUPVideos entier, VPinMAME\altsound,
 * VPinMAME\roms), celle de la table d'après ses noms, ou la seule ; sinon la liste à choisir.
 */
export function partFolderPick(dir: string, part: string, wanted: PartWanted): { use: string[] } | { choose: string[] } {
  const subs = dirents(dir).filter((d) => d.isDirectory() && !isJunkName(d.name));
  const title = nameKey(wanted.title);
  const named = (name: string, names: string[]) => names.some((n) => n.toLowerCase() === name.toLowerCase()) || (title.length >= 4 && nameKey(name) === title);
  if (part === 'pup') {
    if (isPackRoot(dir) || findPackRoot(dir, 2)) return { use: [dir] };
    const packs = subs.filter((d) => findPackRoot(path.join(dir, d.name), 2)).map((d) => d.name);
    return pickAmong(dir, packs, (n) => named(n, wanted.packs));
  }
  if (part === 'altsound' || part === 'altcolor') {
    const own = subs.map((d) => d.name).filter((n) => named(n, wanted.roms));
    if (own.length) return { use: own.map((n) => path.join(dir, n)) };
    // VPinMAME choisi en entier : son altsound (ou altcolor), puis le dossier de la ROM.
    const inner = subs.find((d) => d.name.toLowerCase() === part);
    if (inner) return partFolderPick(path.join(dir, inner.name), part, wanted);
    return { use: [dir] };
  }
  if (part === 'rom') {
    const zips = [dir, child(dir, 'roms')].filter((d): d is string => Boolean(d)).flatMap((d) => wanted.roms.map((r) => fileIn(d, `${r}.zip`)));
    const found = zips.filter((z): z is string => Boolean(z));
    return { use: found.length ? [found[0]!] : [dir] };
  }
  return { use: [dir] };
}

/** Parmi des sous-dossiers : ceux de la table, sinon le seul, sinon la liste (les plus probables d'abord). */
function pickAmong(dir: string, names: string[], own: (name: string) => boolean): { use: string[] } | { choose: string[] } {
  const mine = names.filter(own);
  if (mine.length === 1) return { use: [path.join(dir, mine[0]!)] };
  if (names.length === 1) return { use: [path.join(dir, names[0]!)] };
  if (!names.length) return { use: [dir] };
  const sorted = [...mine, ...names.filter((n) => !own(n)).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))];
  return { choose: sorted.map((n) => path.join(dir, n)) };
}
