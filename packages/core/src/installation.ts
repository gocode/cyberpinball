// Tables d'une installation existante (PinUP Popper, PinballX, PinballY, VPX rangé à l'ancienne
// ou un dossier par table) : une table n'y a pas tout dans un dossier à elle. Son .vpx et son
// fronton sont dans le dossier des tables, souvent dans un sous-dossier à son nom, à n'importe
// quelle profondeur ; sa ROM, ses couleurs et ses sons dans VPinMAME (là où le dit le registre,
// ou Popper) ; son PuP-Pack dans PinUPSystem\PUPVideos ; sa musique dans VisualPinball\Music ;
// ses médias dans POPMedia, PinballX\Media ou PinballY\Media, sous le nom que le menu lui donne.
// Choisir le seul .vpx n'emportait donc rien d'autre (une table reprise sans son PuP-Pack, le
// 05/11/2026 ; puis, le 13/11/2026, toutes les tables rangées chacune dans un sous-dossier de
// Tables, reprises sans rien du tout).
//
// Ici, d'après l'emplacement du .vpx, ce que disent son script et les menus de l'installation,
// on retrouve chacune de ces parties : elles entrent dans le plan d'ajout avec la table
// (ImportSource.owner), rien n'est copié avant « Installer ». On liste aussi les tables d'une
// installation, pour en reprendre une seule.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { expectedPackNames, findPackRoot, isJunkName, isPackRoot, type PupLoadFacts } from './puppack';
import { isInside, samePath } from './fileops';
import { PUP_FOLDER } from './pupdisabled';
import { t } from './i18n';
import { mediaGameNames, scanInstallation, type IncomingMedia } from './mediaimport';
import { isRomZip } from './romzip';
import { nameKey } from './tablefiles';
import type { ImportSource } from './tableimport';
import { parseTableName } from './tables';

/** Où une installation existante range chaque partie d'une table. */
export interface InstallationLayout {
  /** Dossier qui contient tout (« C:\vPinball »), pour l'affichage des chemins. */
  root: string;
  /** Dossier des tables : les .vpx et leurs frontons, à plat ou chacun dans son dossier. */
  tables: string;
  /**
   * Dossiers de tables établis : ceux que disent VPX, Popper, PinballX ou PinballY, ou nommés « Tables ».
   * Seule une table rangée dessous (à toute profondeur) reçoit ses parties de l'installation ; `tables`
   * n'en fait pas partie quand c'est seulement le dossier choisi, qui contient des .vpx.
   */
  tableDirs: string[];
  /** VPinMAME : roms, altcolor, altsound (le premier trouvé, pour l'affichage). */
  pinmame?: string;
  /** Dossiers de VPinMAME : celui de l'installation, celui du registre, celui de Popper. */
  pinmameDirs: string[];
  /** Dossiers des ROM : VPinMAME\roms, le rompath du registre, le DirRoms de Popper. */
  romDirs: string[];
  /** Dossiers des sauvegardes de PinMAME (.nv : scores et réglages du jeu). */
  nvramDirs: string[];
  /** PuP-Packs (PinUPSystem\PUPVideos). */
  pupVideos?: string;
  /** Médias du menu : POPMedia de Popper, Media de PinballX et de PinballY, dossiers de médias de Popper. */
  mediaRoots: string[];
  /** Musique de VPX (<VPX>\Music), que les scripts jouent par PlayMusic. */
  musicDir?: string;
  /** Ce que les menus de l'installation disent de ses tables : nom de leurs médias, leur ROM. */
  catalog: CatalogEntry[];
}

/** Une table vue par un menu (Popper, PinballX, PinballY). */
export interface CatalogEntry {
  /** Chemin du .vpx, quand le menu le donne en entier (Popper). */
  file?: string;
  /** Nom du .vpx sans extension (PinballX et PinballY le donnent seul). */
  stem: string;
  /** Noms sous lesquels le menu range ses médias (GameName de Popper, description de PinballX). */
  names: string[];
  rom?: string;
  /** Listes de lecture du menu qui contiennent la table (Popper : à la main ou automatiques). */
  playlists?: string[];
  /**
   * La table est réellement jouée dans ce menu : dans au moins une liste de lecture de Popper, ou
   * activée dans la base de PinballX et de PinballY. Absent : le menu n'en dit rien.
   */
  active?: boolean;
}

/**
 * Ce que Windows dit de VPinMAME et de VPX (registre, lu par l'application) : là où il les a
 * installés, même loin des tables. Facultatif, jamais une condition pour reconnaître une installation.
 */
export interface InstallationHints {
  /** rompath de VPinMAME. */
  roms?: string;
  /** nvram_directory de VPinMAME. */
  nvram?: string;
  /** vpxpath de VPinMAME : le dossier de VPinballX.exe. */
  vpx?: string;
}

/** Ce qu'il faut savoir du script d'une table pour retrouver ses parties (ScriptFacts, doctor.ts). */
export type CompanionFacts = PupLoadFacts & { dmdFolder?: string; music?: string[] };

/** Partie d'une table retrouvée hors de son dossier. */
export interface Companion {
  path: string;
  part: 'folder' | 'backglass' | 'pov' | 'tableIni' | 'script' | 'rom' | 'nvram' | 'altcolor' | 'altsound' | 'pup' | 'dmdFolder' | 'music' | 'media';
}

/** Ce que la reprise a retrouvé (ou non) pour une table : montré dans le plan d'ajout. */
export interface CompanionReport {
  vpx: string;
  root: string;
  found: Companion[];
  /** Ce que le script attend et que l'installation n'a pas (« PuP-Pack « TheMatrix » »). */
  missing: string[];
}

/** Fichiers nommés comme le .vpx, à côté de lui : fronton, point de vue, réglages, script, résolution du fronton (B2S). */
const NAMED_LIKE_TABLE: Record<string, Companion['part']> = { '.directb2s': 'backglass', '.pov': 'pov', '.ini': 'tableIni', '.vbs': 'script', '.res': 'backglass' };

/** Noms habituels du dossier de VPinMAME, et des dossiers de VPX qui peuvent le contenir. */
const PINMAME_NAMES = ['VPinMAME', 'PinMAME'];
const VPX_NAMES = ['VisualPinball', 'Visual Pinball', 'Visual Pinball X', 'VPinballX', 'VPinball', 'VPX'];

/**
 * Disposition de l'installation qui contient `dir` (le dossier d'un .vpx, ou un dossier choisi :
 * la racine, le dossier des tables, PinUPSystem…), ou undefined si rien n'y ressemble. On remonte
 * jusqu'à la racine du disque ; `exclude` : la racine de Cyber Pinball, jamais prise pour une
 * installation ; `hints` : ce que dit le registre (VPinMAME, VPX), ajouté à ce qu'on trouve.
 */
export function findInstallation(dir: string, exclude: string[] = [], hints: InstallationHints = {}): InstallationLayout | undefined {
  return withDirCache(() => locate(dir, exclude, hints));
}

function locate(dir: string, exclude: string[], hints: InstallationHints): InstallationLayout | undefined {
  const start = path.resolve(dir);
  if (exclude.some((e) => isInside(start, e))) return undefined;
  // Un dossier de Cyber Pinball (sa bibliothèque de ROM, ses émulateurs) n'est jamais repris.
  const own = (p: string | undefined) => (p && !exclude.some((e) => isInside(p, e)) && isDir(p) ? p : undefined);
  // Dossier « Tables » au-dessus d'une table rangée dans son dossier (Tables\Ghostbusters\…).
  let named: string | undefined;
  for (let at = start; ; at = path.dirname(at)) {
    if (/tables/i.test(path.basename(at)) && !exclude.some((e) => isInside(at, e))) {
      named = at;
      break;
    }
    if (path.dirname(at) === at) break;
  }
  // Ce qu'on trouve en remontant depuis le choix. Plus bas que « Tables », c'est le dossier d'une table :
  // son VPinMame (Tables\Ghostbusters\VPinMame) lui appartient, ce n'est pas celui de l'installation.
  let pinmame: string | undefined;
  let pinup: string | undefined;
  let pinballx: string | undefined;
  let pinbally: string | undefined;
  let vpxDir: string | undefined;
  for (let at = start; ; at = path.dirname(at)) {
    if (!(named && isInside(at, named) && !samePath(at, named))) {
      const base = path.basename(at).toLowerCase();
      pinmame ??= own(PINMAME_NAMES.some((n) => n.toLowerCase() === base) ? at : firstChild(at, PINMAME_NAMES) ?? VPX_NAMES.map((v) => firstChild(at, [v], PINMAME_NAMES)).find(Boolean));
      pinup ??= own(base === 'pinupsystem' ? at : child(at, 'PinUPSystem'));
      pinballx ??= own(base === 'pinballx' ? at : child(at, 'PinballX'));
      pinbally ??= own(base === 'pinbally' ? at : child(at, 'PinballY'));
      vpxDir ??= own(hasVpxExe(at) ? at : VPX_NAMES.map((v) => child(at, v)).find((d) => d && hasVpxExe(d)));
    }
    if (path.dirname(at) === at) break;
  }
  vpxDir ??= own(hints.vpx && hasVpxExe(hints.vpx) ? hints.vpx : undefined);
  if (!pinmame && !pinup && !pinballx && !pinbally && !vpxDir) return undefined;

  const popper = pinup ? readPopper(path.join(pinup, 'PUPDatabase.db')) : undefined;
  const frontends = [pinballx, pinbally].filter((d): d is string => Boolean(d));
  const catalog = [...(popper?.games ?? []), ...frontends.flatMap(readHyperpinCatalogs)];

  const romDirs = unique([pinmame && child(pinmame, 'roms'), ...(popper?.romDirs ?? []), hints.roms].map((d) => own(d && resolveDir(d))));
  // VPinMAME du registre ou de Popper : le dossier au-dessus de ses ROM, s'il a des couleurs ou des sons.
  const pinmameDirs = unique([pinmame, ...romDirs.map((r) => path.dirname(r)).filter((d) => child(d, 'altsound') || child(d, 'altcolor') || child(d, 'nvram'))].map(own));
  const nvramDirs = unique([...pinmameDirs.map((d) => child(d, 'nvram')), hints.nvram].map((d) => own(d && resolveDir(d))));
  const pupVideos = own(pinup && child(pinup, PUP_FOLDER));
  const mediaRoots: string[] = [];
  for (const m of [pinup && child(pinup, 'POPMedia'), pinballx && child(pinballx, 'Media'), pinbally && child(pinbally, 'Media'), ...(popper?.mediaDirs ?? [])].map(own)) {
    if (m && !mediaRoots.some((r) => isInside(m, r))) mediaRoots.push(m);
  }
  const musicDir = own(vpxDir && child(vpxDir, 'Music'));

  // Dossiers de tables : ceux que disent les menus, celui de VPX, un « Tables » au-dessus du choix.
  const known = unique(
    [...(popper?.tableDirs ?? []), ...frontends.flatMap(readTablePaths), vpxDir && child(vpxDir, 'Tables'), named, hints.vpx && child(hints.vpx, 'Tables')].map((d) =>
      own(d && resolveDir(d)),
    ),
  );
  const roots = [pinmame, pinup, pinballx, pinbally, vpxDir].filter((d): d is string => Boolean(d));
  const found = tablesDirOf(start, known, commonDir([start, ...roots]));
  if (!found) return undefined;
  const tables = found.dir;
  const tableDirs = unique([...(found.established ? [tables] : []), ...known.filter((k) => !isInside(k, tables) || samePath(k, tables))]);
  return {
    root: commonDir([tables, pinmame, pupVideos, ...mediaRoots]),
    tables,
    tableDirs,
    pinmame: pinmameDirs[0],
    pinmameDirs,
    romDirs,
    nvramDirs,
    pupVideos,
    mediaRoots,
    musicDir,
    catalog,
  };
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

/**
 * Dossier des tables : un dossier de tables connu qui contient le choix (le plus profond), puis
 * le dossier choisi s'il contient des .vpx, puis « Tables » sous le choix ou la racine.
 */
function tablesDirOf(start: string, known: string[], root: string): { dir: string; established: boolean } | undefined {
  const containing = known.filter((k) => isInside(start, k)).sort((a, b) => b.length - a.length)[0];
  if (containing) return { dir: containing, established: true };
  // Dossier choisi qui contient des tables, sans être un dossier de tables connu : listé, jamais pris pour celui de l'installation.
  if (hasVpx(start)) return { dir: start, established: false };
  for (const base of [start, root]) {
    const found = child(base, 'Tables') ?? VPX_NAMES.map((v) => child(base, v, 'Tables')).find(Boolean) ?? child(base, 'vPinball', 'VisualPinball', 'Tables');
    if (found) return { dir: found, established: true };
  }
  const dir = known.find((k) => isInside(k, root)) ?? known[0];
  return dir ? { dir, established: true } : undefined;
}

/** Emplacements habituels d'une installation, par disque. */
const USUAL_PLACES = ['vPinball', 'Visual Pinball', 'VisualPinball', 'Visual Pinball X', 'VPinballX', 'VPX', 'Pinball', 'Games\\vPinball', 'Games\\Visual Pinball', 'PinUPSystem', 'PinballX', 'PinballY', 'Program Files (x86)\\Visual Pinball', 'Program Files\\Visual Pinball', 'Program Files\\PinballY', 'Program Files (x86)\\PinballX'];

/** Installations connues de ce PC (emplacements habituels, et ce que dit le registre), pour la reprise d'une table. */
export function knownTableInstallations(drives: string[] = ['C:', 'D:', 'E:'], exclude: string[] = [], hints: InstallationHints = {}): InstallationLayout[] {
  return withDirCache(() => knownInstallations(drives, exclude, hints));
}

function knownInstallations(drives: string[], exclude: string[], hints: InstallationHints): InstallationLayout[] {
  const found: InstallationLayout[] = [];
  const dirs = [...drives.flatMap((drive) => USUAL_PLACES.map((p) => `${drive}\\${p}`)), hints.vpx, hints.roms && path.dirname(path.dirname(path.resolve(hints.roms)))];
  for (const dir of dirs) {
    if (!dir || !isDir(dir)) continue;
    const layout = findInstallation(dir, exclude, hints);
    if (layout && hasVpxAnywhere(layout) && !found.some((f) => samePath(f.tables, layout.tables))) found.push(layout);
  }
  return found;
}

function hasVpxAnywhere(layout: InstallationLayout): boolean {
  return unique([layout.tables, ...layout.tableDirs]).some((d) => vpxUnder(d, 4, 1).length > 0);
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
  /** Listes de lecture du menu d'origine qui la contiennent (« Home », « Visual Pinball X »…). */
  playlists: string[];
  /**
   * Jouée dans le menu d'origine (dans une liste de lecture de Popper, activée dans PinballX ou
   * PinballY) ; false : présente sur le disque seulement ; absent : l'installation n'en dit rien.
   */
  active?: boolean;
}

/**
 * Tables (.vpx) des dossiers de tables, à toute profondeur raisonnable (un dossier par table, par
 * fabricant…), et celles que Popper connaît ailleurs ; par titre.
 */
export function listInstallationTables(layout: InstallationLayout, medias = indexInstallationMedias(layout)): InstallationTable[] {
  return withDirCache(() => tablesOf(layout, medias));
}

function tablesOf(layout: InstallationLayout, medias: Map<string, IncomingMedia[]>): InstallationTable[] {
  const files: string[] = [];
  const add = (f: string) => {
    if (!files.some((x) => samePath(x, f))) files.push(f);
  };
  for (const dir of unique([layout.tables, ...layout.tableDirs])) for (const f of vpxUnder(dir, 4)) add(f);
  for (const e of layout.catalog) if (e.file && /\.vpx$/i.test(e.file) && isFile(e.file)) add(e.file);
  // Le menu dit quelles tables il joue : une table qu'il ne connaît pas ne l'est pas.
  const knowsActivity = layout.catalog.some((e) => e.active !== undefined);
  return files
    .map((vpx): InstallationTable => {
      const named = parseTableName(path.basename(vpx, path.extname(vpx)));
      const entries = catalogOf(vpx, layout);
      const playlists = unique(entries.flatMap((e) => e.playlists ?? []));
      return {
        vpx,
        title: named.title,
        ...(named.manufacturer ? { manufacturer: named.manufacturer } : {}),
        ...(named.year ? { year: named.year } : {}),
        backglass: Boolean(backglassOf(vpx)),
        medias: mediasOf(vpx, layout, medias).length,
        playlists,
        ...(knowsActivity ? { active: entries.some((e) => e.active) } : {}),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || a.vpx.localeCompare(b.vpx));
}

/** Médias de l'installation (Visual Pinball seulement), par nom de jeu en minuscules : nom du .vpx, ou nom donné par le menu. */
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
 * Noms sous lesquels les menus rangent les médias d'une table : le nom du .vpx, celui que lui
 * donne Popper (GameName) ou PinballX et PinballY (description), et ceux des autres versions
 * rangées dans le même dossier qu'elle (Popper garde souvent le nom de l'ancienne version).
 */
export function tableMediaNames(vpx: string, layout: InstallationLayout): string[] {
  const home = tableHome(vpx, layout);
  const versions = home ? vpxUnder(home.dir, 3) : [vpx];
  const names: string[] = [];
  const add = (n: string | undefined) => {
    if (n?.trim() && !names.some((x) => x.toLowerCase() === n.trim().toLowerCase())) names.push(n.trim());
  };
  for (const v of [vpx, ...versions.filter((v) => !samePath(v, vpx))]) {
    const stem = path.basename(v, path.extname(v));
    add(stem);
    for (const e of catalogOf(v, layout)) e.names.forEach(add);
  }
  return names;
}

/**
 * Fiches des menus pour un .vpx : celle qui donne son chemin ; celle qui ne donne que son nom
 * (PinballX, PinballY) ; celle dont le chemin n'existe plus (table déplacée depuis), par son nom.
 */
function catalogOf(vpx: string, layout: InstallationLayout): CatalogEntry[] {
  const stem = path.basename(vpx, path.extname(vpx)).toLowerCase();
  return layout.catalog.filter((e) => (e.file && samePath(e.file, vpx)) || (e.stem.toLowerCase() === stem && (!e.file || !isFile(e.file))));
}

/** Médias de l'installation pour une table : sous l'un de ses noms, ou sous son titre s'il n'appartient qu'à elle. */
function mediasOf(vpx: string, layout: InstallationLayout, medias: Map<string, IncomingMedia[]>): IncomingMedia[] {
  const names = tableMediaNames(vpx, layout).map((n) => n.toLowerCase());
  const found = names.flatMap((n) => medias.get(n) ?? []);
  if (found.length) return found;
  // Dernier recours : un jeu de médias au même titre (« Terminator 2 (Williams 1991) » pour « Terminator 2.vpx »), le seul à ce titre.
  const title = titleKey(path.basename(vpx, path.extname(vpx)));
  if (title.length < 4) return [];
  const keys = [...medias.keys()].filter((k) => titleKey(k) === title);
  return keys.length === 1 ? medias.get(keys[0]!)! : [];
}

/**
 * Dossier propre à une table : celui de son .vpx quand il est sous un dossier de tables sans en
 * être un, et que ses .vpx (sous-dossiers compris) sont tous des versions du même jeu.
 * `others` : les autres .vpx qu'il contient (autres versions, jamais reprises sans être cochées).
 */
export function tableHome(vpx: string, layout: InstallationLayout): { dir: string; others: string[] } | undefined {
  const dir = path.dirname(path.resolve(vpx));
  if (!layout.tableDirs.some((d) => isInside(dir, d) && !samePath(dir, d))) return undefined;
  if (layout.tableDirs.some((d) => samePath(dir, d) || isInside(d, dir))) return undefined;
  // Un dossier d'installation (PinUPSystem, VPinMAME…) n'est jamais celui d'une table.
  if ([layout.pupVideos, ...layout.pinmameDirs, ...layout.mediaRoots, layout.musicDir].some((p) => p && isInside(p, dir))) return undefined;
  const all = vpxUnder(dir, 3, 50);
  const own = titleKey(path.basename(vpx, path.extname(vpx)));
  if (!all.every((v) => sameGame(titleKey(path.basename(v, path.extname(v))), own))) return undefined;
  return { dir, others: all.filter((v) => !samePath(v, vpx)) };
}

/** Clé du titre d'un nom de table ou de média : « Terminator 2 (Williams 1991) 1.2 » → « terminator212 ». */
function titleKey(name: string): string {
  return nameKey(parseTableName(name).title);
}

/** Deux versions du même jeu : même début de titre, sur au moins 5 lettres et la moitié du plus court. */
function sameGame(a: string, b: string): boolean {
  if (a === b) return true;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 5 && n * 2 >= Math.min(a.length, b.length);
}

/**
 * Parties d'une table de l'installation, d'après son nom, son dossier et son script : le dossier
 * propre à la table s'il y en a un (tout ce qu'il contient), sinon les fichiers nommés comme elle
 * à côté d'elle (fronton, point de vue, réglages, script) ; ROM, sauvegarde, couleurs et sons
 * dans VPinMAME ; PuP-Pack dans PUPVideos ; dossier DMD du script ; musique jouée par le script ;
 * médias sous l'un de ses noms. `missing` : ce que le script attend et qui n'y est pas.
 */
export function tableCompanions(vpx: string, layout: InstallationLayout, facts?: CompanionFacts, medias?: Map<string, IncomingMedia[]>): CompanionReport {
  const found: Companion[] = [];
  const missing: string[] = [];
  const add = (p: string | undefined, part: Companion['part']) => {
    if (p && !found.some((c) => samePath(c.path, p) || (c.part === 'folder' && isInside(p, c.path)))) found.push({ path: p, part });
  };
  const home = tableHome(vpx, layout);
  if (home) add(home.dir, 'folder');
  for (const [ext, part] of Object.entries(NAMED_LIKE_TABLE)) add(sibling(vpx, ext), part);
  if (!home) add(backglassOf(vpx), 'backglass');

  const catalogRoms = catalogOf(vpx, layout).map((e) => e.rom);
  const roms = unique([...(facts?.usesPinmame ? facts.roms : []), ...(facts ? [] : catalogRoms)]);
  for (const rom of roms) {
    add(findRom(layout.romDirs, rom), 'rom');
    add(layout.nvramDirs.map((d) => fileIn(d, `${rom}.nv`)).find(Boolean), 'nvram');
    add(layout.pinmameDirs.map((d) => child(d, 'altcolor', rom)).find(Boolean), 'altcolor');
    add(layout.pinmameDirs.map((d) => child(d, 'altsound', rom)).find(Boolean), 'altsound');
  }
  if (roms.length && !found.some((c) => c.part === 'rom') && !(home && hasRomIn(home.dir, roms))) missing.push(t('ROM « {rom} »', { rom: roms[0]! }));

  const pack = layout.pupVideos ? findPack(layout.pupVideos, [...expectedPackNames(facts), ...roms], packTitles(vpx, home?.dir, layout)) : undefined;
  add(pack, 'pup');
  // Le script charge un PuP-Pack (packNames) que l'installation n'a pas : à dire, pas à taire.
  if (!pack && facts?.pup?.packNames?.length && !(home && findPackRoot(home.dir, 3))) missing.push(t('PuP-Pack « {name} »', { name: facts.pup.packNames[0]! }));

  if (facts?.dmdFolder) {
    const dmd = child(path.dirname(vpx), facts.dmdFolder) ?? layout.tableDirs.map((d) => child(d, facts.dmdFolder!)).find(Boolean);
    if (dmd) add(dmd, 'dmdFolder');
    else missing.push(t('dossier DMD « {name} »', { name: facts.dmdFolder }));
  }

  // Musique que le script joue (PlayMusic "Akira\track.mp3") : rangée par VPX dans son dossier Music.
  if (layout.musicDir) {
    for (const ref of facts?.music ?? []) {
      const parts = ref.split(/[\\/]+/).filter(Boolean);
      if (!parts.length) continue;
      // « Akira\track.mp3 » ou « Akira\ » (suite calculée) : le dossier ; « track.mp3 » : le fichier seul.
      const folder = parts.length > 1 || /[\\/]$/.test(ref);
      add(folder ? child(layout.musicDir, parts[0]!) : fileIn(layout.musicDir, parts[0]!), 'music');
    }
  }

  for (const m of mediasOf(vpx, layout, medias ?? indexInstallationMedias(layout))) add(m.from, 'media');
  return { vpx, root: layout.root, found, missing };
}

/** Le dossier propre à la table contient-il déjà sa ROM (VPinMame\roms, pinmame\roms…) ? */
function hasRomIn(dir: string, roms: string[]): boolean {
  const wanted = new Set(roms.map((r) => `${r.toLowerCase()}.zip`));
  return filesUnder(dir, 4).some((f) => wanted.has(path.basename(f).toLowerCase())) || roms.some((r) => findRom([dir], r, 3));
}

/**
 * ROM dans des dossiers de ROM, sous toutes les formes que VPinMAME lit : « rom.zip », dossier « rom »
 * de puces décompressées, ou l'un des deux un ou plusieurs niveaux plus bas (« roms\_src\rom.zip »,
 * un dossier par fabricant). Le zip d'abord, le plus haut d'abord.
 */
function findRom(dirs: string[], rom: string, depth = 1): string | undefined {
  for (let level = 0; level <= depth; level++) {
    for (const dir of dirs) {
      for (const d of level ? subDirs(dir, level) : [dir]) {
        const zip = fileIn(d, `${rom}.zip`);
        if (zip) return zip;
      }
    }
    for (const dir of dirs) {
      for (const d of level ? subDirs(dir, level) : [dir]) {
        const folder = child(d, rom);
        if (folder && dirents(folder).some((e) => e.isFile())) return folder;
      }
    }
  }
  return undefined;
}

/** Sous-dossiers à exactement `level` niveaux sous `dir`. */
function subDirs(dir: string, level: number): string[] {
  let at = [dir];
  for (let i = 0; i < level; i++) at = at.flatMap((d) => dirents(d).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)));
  return at;
}

/** Noms sous lesquels chercher un PuP-Pack par son titre : le .vpx, son dossier, ses noms chez les menus. */
function packTitles(vpx: string, home: string | undefined, layout: InstallationLayout): string[] {
  return [...tableMediaNames(vpx, layout), ...(home ? [path.basename(home)] : [])];
}

/**
 * PuP-Pack de la table dans PUPVideos : sous l'un des noms que chargera le plugin ; à défaut, un
 * dossier au titre de la table (« xfiles » pour « X-Files (Sega 1997) »), ou dont le nom commence
 * le titre (« STRANGERTHINGS4 » pour « Stranger Things 4 LPE »), s'il est le seul.
 */
function findPack(pupVideos: string, names: string[], titles: string[]): string | undefined {
  const byName = names.map((n) => child(pupVideos, n)).find(Boolean);
  if (byName) return byName;
  const packs = dirents(pupVideos).filter((d) => d.isDirectory() && !isJunkName(d.name));
  const keys = unique(titles.flatMap((n) => [titleKey(n), nameKey(n)])).filter((k) => k.length >= 4);
  const exact = packs.filter((d) => keys.includes(nameKey(d.name)));
  if (exact.length) return path.join(pupVideos, exact[0]!.name);
  const close = packs.filter((d) => {
    const k = nameKey(d.name);
    return k.length >= 6 && keys.some((key) => key.startsWith(k) || (key.length >= 6 && k.startsWith(key)));
  });
  return close.length === 1 ? path.join(pupVideos, close[0]!.name) : undefined;
}

/**
 * Ce qui accompagne les .vpx choisis dans une installation existante : les sources d'import à
 * utiliser (le dossier propre à une table remplace son .vpx ; les parties rangées ailleurs
 * s'ajoutent, copiées et rattachées à leur table), et ce qui a été retrouvé pour chaque table.
 * Une archive déballée, le dossier d'import et un .vpx hors des dossiers de tables d'une
 * installation ne reçoivent rien de plus.
 */
export function installationCompanions(
  sources: ImportSource[],
  facts: (vpx: string) => CompanionFacts | undefined,
  exclude: string[] = [],
  hints: InstallationHints = {},
): { sources: ImportSource[]; reports: CompanionReport[] } {
  return withDirCache(() => companionsOf(sources, facts, exclude, hints));
}

function companionsOf(sources: ImportSource[], facts: (vpx: string) => CompanionFacts | undefined, exclude: string[], hints: InstallationHints): { sources: ImportSource[]; reports: CompanionReport[] } {
  const reports: CompanionReport[] = [];
  const layouts = new Map<string, { layout: InstallationLayout; medias?: Map<string, IncomingMedia[]> } | undefined>();
  const result: ImportSource[] = [...sources];
  const extra: ImportSource[] = [];
  const taken = (p: string) => [...result, ...extra].some((s) => isInside(p, s.path) && !s.exclude?.some((x) => isInside(p, x)));
  // Une partie que l'import apporte déjà (le PuP-Pack d'un téléchargement) n'est jamais doublée par celle de l'installation.
  const brought = broughtParts(sources);
  const chosen = sources.filter((s) => !s.unpacked && s.mode === 'copy').flatMap((s) => vpxIn(s.path));
  for (const src of sources) {
    if (src.unpacked || src.mode !== 'copy') continue;
    for (const vpx of vpxIn(src.path)) {
      const dir = path.dirname(vpx);
      if (!layouts.has(dir.toLowerCase())) {
        const layout = findInstallation(dir, exclude, hints);
        // Seule une table rangée dans un dossier de tables de l'installation (à n'importe quelle profondeur) en fait partie :
        // un .vpx téléchargé ailleurs sur un PC qui a aussi une installation n'y prend rien.
        const inTables = layout && layout.tableDirs.some((d) => isInside(vpx, d));
        layouts.set(dir.toLowerCase(), inTables ? { layout } : undefined);
      }
      const entry = layouts.get(dir.toLowerCase());
      if (!entry) continue;
      entry.medias ??= indexInstallationMedias(entry.layout);
      const report = tableCompanions(vpx, entry.layout, facts(vpx), entry.medias);
      const label = (p: string) => shownPath(p, entry.layout.root);
      const kept: Companion[] = [];
      // Ce que le dossier propre à la table apporte déjà (sa ROM, son PuP-Pack) : pas de doublon venu d'ailleurs.
      let ownBrought = new Set<Companion['part']>();
      for (const c of report.found) {
        if (c.part === 'folder') {
          // Le dossier de la table remplace son .vpx choisi seul ; les autres versions qu'il contient
          // n'en font partie que si elles ont été cochées aussi. Déjà choisi (une autre version
          // cochée, ou un dossier au-dessus) : rien à ajouter.
          if (result.some((s) => isInside(c.path, s.path))) continue;
          const others = tableHome(vpx, entry.layout)!.others.filter((o) => !chosen.some((v) => samePath(v, o)));
          // Son nom seul (« Ghostbusters ») : c'est l'un des noms candidats de la table (describeGame).
          const folder: ImportSource = { path: c.path, mode: 'copy', label: path.basename(c.path), ...(others.length ? { exclude: others.flatMap(withSiblings) } : {}) };
          // Les .vpx cochés de ce dossier y sont : leur source seule laisse la place au dossier.
          const at = result.findIndex((s) => isInside(s.path, c.path));
          for (let i = result.length - 1; i >= 0; i--) if (isInside(result[i]!.path, c.path)) result.splice(i, 1);
          result.splice(at >= 0 ? at : result.length, 0, folder);
          ownBrought = broughtParts([folder]);
          kept.push(c);
          continue;
        }
        if (taken(c.path) || brought.has(c.part) || ownBrought.has(c.part)) continue;
        extra.push({ path: c.path, mode: 'copy', owner: vpx, label: label(c.path) });
        kept.push(c);
      }
      report.found = kept;
      if (report.found.length || report.missing.length) reports.push(report);
    }
  }
  return { sources: [...result, ...extra], reports };
}

/** Un .vpx et les fichiers nommés comme lui à côté de lui (son fronton, ses réglages…). */
function withSiblings(vpx: string): string[] {
  const stem = path.basename(vpx, path.extname(vpx)).toLowerCase();
  return [vpx, ...dirents(path.dirname(vpx)).filter((d) => d.isFile() && path.parse(d.name).name.toLowerCase() === stem && !samePath(path.join(path.dirname(vpx), d.name), vpx)).map((d) => path.join(path.dirname(vpx), d.name))];
}

/**
 * Parties que les sources choisies apportent déjà, hors les .vpx et leurs voisins de même nom :
 * un PuP-Pack, une ROM (une vraie : pas l'archive d'où vient la table), un fronton à part.
 * Un dossier n'est regardé que sur deux niveaux.
 */
function broughtParts(sources: ImportSource[]): Set<Companion['part']> {
  const parts = new Set<Companion['part']>();
  const stems = new Set(sources.flatMap((s) => vpxIn(s.path)).map((v) => path.basename(v, path.extname(v)).toLowerCase()));
  const byFile = (file: string) => {
    const name = path.basename(file);
    const ext = path.extname(name).toLowerCase();
    if (ext === '.zip' && isRomZip(file)) parts.add('rom');
    else if (ext === '.directb2s' && !stems.has(path.basename(name, ext).toLowerCase())) parts.add('backglass');
  };
  const look = (dir: string, depth: number) => {
    if (findPackRoot(dir, 2)) parts.add('pup');
    for (const d of dirents(dir)) {
      if (d.isFile()) byFile(path.join(dir, d.name));
      else if (d.isDirectory() && depth > 0) look(path.join(dir, d.name), depth - 1);
    }
  };
  for (const s of sources) {
    if (isDir(s.path)) look(s.path, s.unpacked ? 2 : 1);
    else byFile(s.path);
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
    case 'folder':
      return t('Dossier de la table');
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
    case 'nvram':
      return t('Sauvegarde PinMAME');
    case 'altcolor':
      return t('Couleurs du DMD');
    case 'altsound':
      return t('Sons alternatifs');
    case 'pup':
      return t('PuP-Pack');
    case 'dmdFolder':
      return t('Dossier DMD');
    case 'music':
      return t('Musique');
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

// ---------------------------------------------------------------------------
// Ce que disent les menus de l'installation

/** Base de PinUP Popper (PUPDatabase.db) : ses émulateurs Visual Pinball, leurs dossiers, leurs tables. */
interface PopperFacts {
  tableDirs: string[];
  mediaDirs: string[];
  romDirs: string[];
  games: CatalogEntry[];
}

/** Lecture seule de la base de Popper ; undefined si elle manque ou ne se lit pas (Popper ouvert, base abîmée). */
export function readPopper(file: string): PopperFacts | undefined {
  if (!isFile(file)) return undefined;
  let db: DatabaseSync | undefined;
  try {
    // node:sqlite est intégré à Node (Electron 44) ; chargé ici seulement, et seulement s'il y a une base.
    const { DatabaseSync: Database } = require('node:sqlite') as typeof import('node:sqlite');
    db = new Database(file, { readOnly: true });
    const columns = (table: string) => new Set((db!.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name.toLowerCase()));
    const emuCols = columns('Emulators');
    const gameCols = columns('Games');
    const col = (cols: Set<string>, name: string) => (cols.has(name.toLowerCase()) ? name : 'NULL');
    const emus = db
      .prepare(`select EMUID as id, EmuName as name, ${col(emuCols, 'DirGames')} as games, ${col(emuCols, 'DirMedia')} as media, ${col(emuCols, 'DirRoms')} as roms, ${col(emuCols, 'GamesExt')} as ext from Emulators`)
      .all() as { id: number; name: string | null; games: string | null; media: string | null; roms: string | null; ext: string | null }[];
    const vp = emus.filter((e) => /vpx/i.test(e.ext ?? '') || /visual\s*pinball|vpinball/i.test(e.name ?? ''));
    if (!vp.length) return { tableDirs: [], mediaDirs: [], romDirs: [], games: [] };
    const ids = vp.map((e) => e.id);
    const rows = db
      .prepare(`select GameID as id, EMUID as emu, GameName as name, GameFileName as file, ${col(gameCols, 'ROM')} as rom from Games where EMUID in (${ids.map(() => '?').join(',')})`)
      .all(...ids) as { id: number; emu: number; name: string | null; file: string | null; rom: string | null }[];
    const lists = popperPlaylists(db);
    const games: CatalogEntry[] = [];
    for (const r of rows) {
      if (!r.file?.trim()) continue;
      const dir = vp.find((e) => e.id === r.emu)?.games ?? '';
      const file = path.isAbsolute(r.file) ? r.file : dir ? path.join(dir, r.file) : undefined;
      const playlists = lists ? lists.filter((l) => l.games.has(r.id)).map((l) => l.name) : undefined;
      games.push({
        ...(file ? { file } : {}),
        stem: path.basename(r.file, path.extname(r.file)),
        names: r.name?.trim() ? [r.name.trim()] : [],
        ...(r.rom?.trim() ? { rom: r.rom.trim() } : {}),
        ...(playlists ? { playlists, active: playlists.length > 0 } : {}),
      });
    }
    const dirs = (key: 'games' | 'media' | 'roms') => unique(vp.map((e) => e[key]?.trim()).filter((d): d is string => Boolean(d) && path.isAbsolute(d!)));
    return { tableDirs: dirs('games'), mediaDirs: dirs('media'), romDirs: dirs('roms'), games };
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {
      // Déjà fermée.
    }
  }
}

/**
 * Listes de lecture visibles de Popper et leurs tables : celles faites à la main (PlayListDetails),
 * et les automatiques (une requête sur Games, lancée sur la base ouverte en lecture seule). Une liste
 * des dernières tables ajoutées (LIMIT) ne dit pas qu'une table est jouée : écartée. undefined si la
 * base n'a pas de listes.
 */
function popperPlaylists(db: DatabaseSync): { name: string; games: Set<number> }[] | undefined {
  try {
    const lists = db.prepare('select PlayListID as id, PlayName as name, PlayDisplay as display, Visible as visible, PlayListType as type, PlayListSQL as query from PlayLists').all() as {
      id: number;
      name: string | null;
      display: string | null;
      visible: number | null;
      type: number | null;
      query: string | null;
    }[];
    const out: { name: string; games: Set<number> }[] = [];
    for (const l of lists) {
      if (l.visible === 0) continue;
      const name = (l.display ?? l.name ?? '').trim();
      if (!name) continue;
      const query = l.query?.trim() ?? '';
      let ids: number[] = [];
      if (query && l.type !== 0) {
        // Une seule requête de lecture sur Games, sans limite de nombre.
        if (!/^select\b[^;]*\bfrom\s+games\b[^;]*;?$/i.test(query) || /\blimit\b/i.test(query)) continue;
        try {
          ids = (db.prepare(query.replace(/;$/, '')).all() as { GameID?: number }[]).map((r) => r.GameID).filter((n): n is number => typeof n === 'number');
        } catch {
          continue;
        }
      } else {
        ids = (db.prepare('select GameID as id from PlayListDetails where PlayListID = ? and (Visible is null or Visible <> 0)').all(l.id) as { id: number }[]).map((r) => r.id);
      }
      if (ids.length) out.push({ name, games: new Set(ids) });
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Bases de PinballX et de PinballY (Databases\<système>\*.xml, au format de HyperPin) : pour chaque
 * table, le nom du .vpx (name), et la description sous laquelle leurs médias sont souvent rangés.
 */
function readHyperpinCatalogs(frontend: string): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const databases = child(frontend, 'Databases');
  if (!databases) return out;
  for (const system of dirents(databases)) {
    if (!system.isDirectory() || !/visual\s*pinball|vpinball|^vpx?\d*$/i.test(system.name)) continue;
    const dir = path.join(databases, system.name);
    for (const f of dirents(dir)) {
      if (!f.isFile() || !/\.xml$/i.test(f.name)) continue;
      let xml: string;
      try {
        xml = fs.readFileSync(path.join(dir, f.name), 'utf8');
      } catch {
        continue;
      }
      for (const m of xml.matchAll(/<game\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/game>/gi)) {
        const stem = xmlText(m[1]!);
        if (!stem) continue;
        const tag = (name: string) => xmlText(new RegExp(`<${name}>([^<]*)</${name}>`, 'i').exec(m[2]!)?.[1] ?? '');
        const description = tag('description');
        const rom = tag('rom');
        // « enabled » à False : la table est connue du menu sans y être jouée.
        const enabled = !/^(false|0|no)$/i.test(tag('enabled'));
        out.push({ stem, names: unique([stem, description]), ...(rom ? { rom } : {}), active: enabled });
      }
    }
  }
  return out;
}

/** Dossiers des tables que disent les réglages de PinballX (Config\PinballX.ini) et de PinballY (Settings.txt). */
function readTablePaths(frontend: string): string[] {
  const out: string[] = [];
  for (const file of [path.join(frontend, 'Config', 'PinballX.ini'), path.join(frontend, 'Settings.txt')]) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/^\s*[\w.]*TablePath\s*=\s*(.+?)\s*$/gim)) {
      const p = m[1]!.replace(/^"|"$/g, '');
      if (path.isAbsolute(p) && hasVpxAnywhereIn(p)) out.push(p);
    }
  }
  return out;
}

function hasVpxAnywhereIn(dir: string): boolean {
  return vpxUnder(dir, 2, 1).length > 0;
}

function xmlText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// ---------------------------------------------------------------------------

/** Dossiers jamais parcourus en cherchant des tables : parties de tables et dossiers de travail. */
const NOT_TABLE_DIRS = /^(pupvideos|pupvideos\.off|medias|cache|altsound|altcolor|music|pinmame|vpinmame|serum|vni|user|scripts|b2s_backup|bkp|backup|__macosx|\.git)$|\.(ultradmd|flexdmd)$/i;

/** .vpx sous un dossier, jusqu'à `depth` niveaux, sans entrer dans les parties de tables. */
function vpxUnder(dir: string, depth: number, max = 5000): string[] {
  const out: string[] = [];
  const walk = (d: string, left: number) => {
    for (const e of dirents(d)) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isFile() && /\.vpx$/i.test(e.name)) out.push(p);
      else if (e.isDirectory() && left > 0 && !NOT_TABLE_DIRS.test(e.name)) walk(p, left - 1);
    }
  };
  walk(dir, depth);
  return out;
}

/** Fichiers sous un dossier, jusqu'à `depth` niveaux. */
function filesUnder(dir: string, depth: number): string[] {
  const out: string[] = [];
  const walk = (d: string, left: number) => {
    for (const e of dirents(d)) {
      const p = path.join(d, e.name);
      if (e.isFile()) out.push(p);
      else if (e.isDirectory() && left > 0) walk(p, left - 1);
    }
  };
  walk(dir, depth);
  return out;
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

/**
 * Fronton d'une table rangée à plat : nommé comme elle, sinon le seul .directb2s de son dossier
 * dont le nom commence comme le sien (« Table_.directb2s », « Table (full dmd).directb2s »).
 */
function backglassOf(vpx: string): string | undefined {
  const exact = sibling(vpx, '.directb2s');
  if (exact) return exact;
  const stem = nameKey(path.basename(vpx, path.extname(vpx)));
  if (stem.length < 4) return undefined;
  const close = dirents(path.dirname(vpx)).filter((d) => d.isFile() && /\.directb2s$/i.test(d.name) && nameKey(path.parse(d.name).name).startsWith(stem));
  return close.length === 1 ? path.join(path.dirname(vpx), close[0]!.name) : undefined;
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

/** Premier sous-dossier trouvé parmi des noms possibles, puis ses sous-dossiers `then` (l'un d'eux). */
function firstChild(dir: string, names: string[], then?: string[]): string | undefined {
  for (const n of names) {
    const c = child(dir, n);
    if (!c) continue;
    if (!then) return c;
    const inner = firstChild(c, then);
    if (inner) return inner;
  }
  return undefined;
}

/** Chemin d'un réglage (registre, base de Popper) : absolu, sans barre finale. */
function resolveDir(d: string): string | undefined {
  const s = d.trim().replace(/^"|"$/g, '');
  return s && path.isAbsolute(s) ? path.resolve(s) : undefined;
}

function hasVpx(dir: string): boolean {
  return dirents(dir).some((d) => d.isFile() && /\.vpx$/i.test(d.name));
}

function hasVpxExe(dir: string): boolean {
  return dirents(dir).some((d) => d.isFile() && /^vpinballx.*\.exe$/i.test(d.name));
}

function unique(list: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of list) if (s && !out.some((o) => samePath(o, s) || o.toLowerCase() === s.toLowerCase())) out.push(s);
  return out;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Dossiers déjà lus pendant une recherche : chaque dossier parent (le dossier temporaire, un disque entier) n'est lu qu'une fois. */
let dirCache: Map<string, fs.Dirent[]> | undefined;

function withDirCache<T>(work: () => T): T {
  if (dirCache) return work();
  dirCache = new Map();
  try {
    return work();
  } finally {
    dirCache = undefined;
  }
}

function dirents(dir: string): fs.Dirent[] {
  const key = dir.toLowerCase();
  const known = dirCache?.get(key);
  if (known) return known;
  let list: fs.Dirent[];
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    list = [];
  }
  dirCache?.set(key, list);
  return list;
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
