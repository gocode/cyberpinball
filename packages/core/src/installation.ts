// Tables of an existing installation (PinUP Popper, PinballX, PinballY, VPX laid out the old way
// or one folder per table): a table there does not have everything in a folder of its own. Its .vpx
// and its backglass are in the tables folder, often in a subfolder named after it, at any
// depth; its ROM, its colours and its sounds in VPinMAME (where the registry says,
// or Popper); its PuP-Pack in PinUPSystem\PUPVideos; its music in VisualPinball\Music;
// its media in POPMedia, PinballX\Media or PinballY\Media, under the name the menu gives it.
// Choosing the .vpx alone therefore brought nothing else (a table taken over without its PuP-Pack, on
// 05/11/2026; then, on 13/11/2026, all the tables each stored in a subfolder of
// Tables, taken over with nothing at all).
//
// Here, from the location of the .vpx, what its script and the installation's menus say,
// each of these parts is found: they enter the add plan with the table
// (ImportSource.owner), nothing is copied before "Installer" (Install). The tables of an
// installation are also listed, to take over a single one.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { expectedPackNames, findPackRoot, isJunkName, isPackRoot, type PupLoadFacts } from './puppack';
import { popperGameExe, vpxExesIn } from './autres-vpx';
import { isInside, samePath } from './fileops';
import { PUP_FOLDER } from './pupdisabled';
import { formatList, t } from './i18n';
import { mediaGameNames, scanInstallation, type IncomingMedia } from './mediaimport';
import { historicAlias, parseAliases, type AliasLine } from './romalias';
import { isRomZip } from './romzip';
import { nameKey } from './tablefiles';
import type { ImportSource } from './tableimport';
import { parseTableName } from './tables';
import { extractVpReg, readVpRegStorages, vpRegStorageNames } from './vpreg';
import { readVpxScript } from './vpxinfo';

/** Where an existing installation stores each part of a table. */
export interface InstallationLayout {
  /** Folder that contains everything ("C:\vPinball"), for displaying paths. */
  root: string;
  /** Tables folder: the .vpx files and their backglasses, flat or each in its own folder. */
  tables: string;
  /**
   * Established tables folders: those stated by VPX, Popper, PinballX or PinballY, or named "Tables".
   * Only a table stored under them (at any depth) receives its parts from the installation; `tables`
   * is not one of them when it is only the chosen folder, which contains .vpx files.
   */
  tableDirs: string[];
  /** VPinMAME: roms, altcolor, altsound (the first one found, for display). */
  pinmame?: string;
  /** VPinMAME folders: the installation's one, the registry's one, Popper's one. */
  pinmameDirs: string[];
  /** ROM folders: VPinMAME\roms, the registry's rompath, Popper's DirRoms. */
  romDirs: string[];
  /** PinMAME save folders (.nv: scores and game settings). */
  nvramDirs: string[];
  /** PuP-Packs (PinUPSystem\PUPVideos). */
  pupVideos?: string;
  /** Media of the menu: Popper's POPMedia, Media of PinballX and of PinballY, Popper's media folders. */
  mediaRoots: string[];
  /** VPX music (<VPX>\Music), which the scripts play through PlayMusic. */
  musicDir?: string;
  /**
   * VPReg.stg of VPX 10.7 and 10.8.0 (<VPX>\User\VPReg.stg): what the tables' scripts have
   * saved (options, high scores), one storage per table (vpreg.ts).
   */
  vpRegFiles?: string[];
  /** What the installation's menus say about its tables: name of their media, their ROM. */
  catalog: CatalogEntry[];
  /**
   * VPX executables of the installation: those of its VPX folder, then those of Popper's emulators
   * (one per version: "Visual Pinball X", "VPX 10.7"...). The first one is the one of the tables the menu
   * says nothing about. What is offered for adding in system menu > My cabinet > "VPX" > "Autres versions de VPX"
   * (Other VPX versions).
   */
  vpxExes?: string[];
  /**
   * VPinMAME ROM aliases (VPMAlias.txt of its folders): "name asked for by the script, game
   * loaded". VPinMAME applies them by itself; the table runs there under a name the installation
   * does not have as a zip. The old names it knew by default (vpmalias.ts) are added to them.
   */
  romAliases?: AliasLine[];
}

/** A table seen by a menu (Popper, PinballX, PinballY). */
export interface CatalogEntry {
  /** Path of the .vpx, when the menu gives it in full (Popper). */
  file?: string;
  /** Name of the .vpx without extension (PinballX and PinballY give it alone). */
  stem: string;
  /** Names under which the menu stores its media (Popper's GameName, PinballX's description). */
  names: string[];
  rom?: string;
  /** Playlists of the menu that contain the table (Popper: manual or automatic). */
  playlists?: string[];
  /**
   * The table is actually played in this menu: in at least one Popper playlist, or
   * enabled in the PinballX and PinballY database. Absent: the menu says nothing about it.
   */
  active?: boolean;
  /**
   * The VPX executable with which the menu launches the table (Popper: the folder of its emulator and
   * its ALTEXE, autres-vpx.ts); absent: the menu says nothing about it.
   */
  vpxExe?: string;
}

/**
 * What Windows says about VPinMAME and VPX (registry, read by the application): where it
 * installed them, even far from the tables. Optional, never a condition to recognise an installation.
 */
export interface InstallationHints {
  /**
   * VPinMAME's rompath: one folder, or all those it lists ("C:\roms;D:\roms"), which VPinMAME
   * reads all, in order. Keeping only the first one lost the ROMs stored in the next ones.
   */
  roms?: string | string[];
  /** VPinMAME's nvram_directory. */
  nvram?: string;
  /** VPinMAME's vpxpath: the folder of VPinballX.exe. */
  vpx?: string;
  /**
   * VPinMAME folder from its registration in Windows (VPinMAME.dll of VPinMAME.Controller):
   * where it is really installed, even far from the tables, with its roms, altcolor, altsound, nvram.
   */
  pinmame?: string;
}

/** The rompath folders, one by one. */
function hintRomDirs(hints: InstallationHints): string[] {
  const list = Array.isArray(hints.roms) ? hints.roms : hints.roms ? [hints.roms] : [];
  return list.flatMap((r) => r.split(';')).map((r) => r.trim()).filter(Boolean);
}

/**
 * What the registry says about VPinMAME, from the output of "reg query …\Visual PinMame\globals"
 * and the path of VPinMAME.dll registered for VPinMAME.Controller: all the rompath folders (a
 * relative folder is relative to the VPinMAME folder, as VPinMAME reads it), %VARIABLES% expanded.
 */
export function pinmameRegistryHints(globals: string, controllerDll?: string, env: Record<string, string | undefined> = process.env): InstallationHints {
  const hints: InstallationHints = {};
  const expand = (s: string) => s.replace(/%([^%]+)%/g, (all, name: string) => env[name] ?? env[Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase()) ?? ''] ?? all);
  const value = (name: string) => {
    const v = new RegExp(`^\\s*${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'im').exec(globals)?.[1];
    return v === undefined ? undefined : expand(v.trim().replace(/^"|"$/g, ''));
  };
  const dll = controllerDll?.trim().replace(/^"|"$/g, '');
  const pinmame = dll && path.isAbsolute(expand(dll)) ? path.dirname(expand(dll)) : undefined;
  if (pinmame) hints.pinmame = pinmame;
  const absolute = (d: string) => (path.isAbsolute(d) ? path.resolve(d) : pinmame ? path.resolve(pinmame, d) : undefined);
  const roms = (value('rompath') ?? '').split(';').map((d) => d.trim()).filter(Boolean).map(absolute).filter((d): d is string => Boolean(d));
  if (roms.length) hints.roms = roms;
  const nvram = (value('nvram_directory') ?? '').split(';').map((d) => d.trim()).filter(Boolean).map(absolute).find(Boolean);
  if (nvram) hints.nvram = nvram;
  const vpx = value('vpxpath');
  if (vpx) hints.vpx = vpx;
  return hints;
}

/** Default value of a key in the output of "reg query … /ve" ("(Default)", "(par défaut)"...). */
export function registryDefaultValue(output: string): string | undefined {
  return /^\s*\([^)]*\)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im.exec(output)?.[1]?.trim() || undefined;
}

/** What must be known about a table's script to find its parts (ScriptFacts, doctor.ts). */
export type CompanionFacts = PupLoadFacts & { dmdFolder?: string; music?: string[] };

/** Part of a table found outside its folder. */
export interface Companion {
  path: string;
  part: 'folder' | 'backglass' | 'pov' | 'tableIni' | 'script' | 'rom' | 'nvram' | 'cfg' | 'vpreg' | 'altcolor' | 'altsound' | 'pup' | 'dmdFolder' | 'music' | 'media';
  /**
   * ROM found under another name than the script's one, through a VPinMAME alias (VPMAlias.txt,
   * old name): the line to write in <table>\pinmame\alias.txt so that the plugin loads it.
   */
  alias?: AliasLine;
  /** vpreg: the storages of this VPReg.stg that the table's script uses (vpreg.ts). */
  storages?: string[];
}

/** What the takeover found (or not) for a table: shown in the add plan. */
export interface CompanionReport {
  vpx: string;
  root: string;
  found: Companion[];
  /** What the script expects and the installation does not have (PuP-Pack "TheMatrix"). */
  missing: string[];
  /** ROM not found: the names looked for and the folders where they were looked for, kept in the table's game page. */
  romSearch?: RomSearch;
  /** ROM found through a VPinMAME alias: lines to write in <table>\pinmame\alias.txt (PlanOptions.companions). */
  romAliases?: AliasLine[];
}

/** Search for a ROM in an installation taken over, when it found nothing (.info: CyberPinball.RomSearch). */
export interface RomSearch {
  /** Names looked for: those of the script (or of the menu), then their aliases. */
  roms: string[];
  /** ROM folders of the installation, in the order they were read. */
  dirs: string[];
  /** Root folder of the installation taken over. */
  from: string;
}

/** Files named like the .vpx, next to it: backglass, point of view, settings, script, backglass resolution (B2S). */
const NAMED_LIKE_TABLE: Record<string, Companion['part']> = { '.directb2s': 'backglass', '.pov': 'pov', '.ini': 'tableIni', '.vbs': 'script', '.res': 'backglass' };

/** Usual names of the VPinMAME folder, and of the VPX folders that may contain it. */
const PINMAME_NAMES = ['VPinMAME', 'PinMAME'];
const VPX_NAMES = ['VisualPinball', 'Visual Pinball', 'Visual Pinball X', 'VPinballX', 'VPinball', 'VPX'];

/**
 * Layout of the installation that contains `dir` (the folder of a .vpx, or a chosen folder:
 * the root folder, the tables folder, PinUPSystem...), or undefined if nothing looks like one. The
 * search goes up to the root of the drive; `exclude`: the Cyber Pinball root folder, never taken for an
 * installation; `hints`: what the registry says (VPinMAME, VPX), added to what is found.
 */
export function findInstallation(dir: string, exclude: string[] = [], hints: InstallationHints = {}): InstallationLayout | undefined {
  return withDirCache(() => locate(dir, exclude, hints));
}

function locate(dir: string, exclude: string[], hints: InstallationHints): InstallationLayout | undefined {
  const start = path.resolve(dir);
  if (exclude.some((e) => isInside(start, e))) return undefined;
  // A Cyber Pinball folder (its ROM library, its emulators) is never taken over.
  const own = (p: string | undefined) => (p && !exclude.some((e) => isInside(p, e)) && isDir(p) ? p : undefined);
  // "Tables" folder above a table stored in its own folder (Tables\Ghostbusters\…).
  let named: string | undefined;
  for (let at = start; ; at = path.dirname(at)) {
    if (/tables/i.test(path.basename(at)) && !exclude.some((e) => isInside(at, e))) {
      named = at;
      break;
    }
    if (path.dirname(at) === at) break;
  }
  // What is found going up from the choice. Below "Tables", it is the folder of a table:
  // its VPinMame (Tables\Ghostbusters\VPinMame) belongs to it, it is not the installation's one.
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
  // VPinMAME as Windows registered it: the one the tables really load, wherever it is.
  const registered = own(hints.pinmame && resolveDir(hints.pinmame));
  if (!pinmame && !pinup && !pinballx && !pinbally && !vpxDir) return undefined;

  const popper = pinup ? readPopper(path.join(pinup, 'PUPDatabase.db')) : undefined;
  const frontends = [pinballx, pinbally].filter((d): d is string => Boolean(d));
  const catalog = [...(popper?.games ?? []), ...frontends.flatMap(readHyperpinCatalogs)];

  // All the folders VPinMAME reads: the registry's whole rompath ("a;b"), its roms, the one
  // of the installation, Popper's DirRoms. A relative rompath folder is relative to the VPinMAME folder.
  const relative = (d: string) => (path.isAbsolute(d) ? d : [registered, pinmame].filter((p): p is string => Boolean(p)).map((p) => path.resolve(p, d)).find(isDir));
  const romDirs = unique(
    [...hintRomDirs(hints).map(relative), registered && child(registered, 'roms'), pinmame && child(pinmame, 'roms'), ...(popper?.romDirs ?? [])].map((d) => own(d && resolveDir(d))),
  );
  // VPinMAME of the registry or of Popper: the folder above its ROMs, if it has colours or sounds.
  const pinmameDirs = unique([pinmame, registered, ...romDirs.map((r) => path.dirname(r)).filter((d) => child(d, 'altsound') || child(d, 'altcolor') || child(d, 'nvram') || fileIn(d, ALIAS_FILE))].map(own));
  const romAliases = pinmameDirs.flatMap(readVpmAliases);
  const nvramDirs = unique([...pinmameDirs.map((d) => child(d, 'nvram')), hints.nvram].map((d) => own(d && resolveDir(d))));
  const pupVideos = own(pinup && child(pinup, PUP_FOLDER));
  const mediaRoots: string[] = [];
  for (const m of [pinup && child(pinup, 'POPMedia'), pinballx && child(pinballx, 'Media'), pinbally && child(pinbally, 'Media'), ...(popper?.mediaDirs ?? [])].map(own)) {
    if (m && !mediaRoots.some((r) => isInside(m, r))) mediaRoots.push(m);
  }
  const musicDir = own(vpxDir && child(vpxDir, 'Music'));
  const vpRegFiles = unique([vpxDir, hints.vpx].map((d) => own(d && resolveDir(d))).map((d) => (d && child(d, 'User') ? fileIn(child(d, 'User')!, 'VPReg.stg') : undefined)));

  // Tables folders: those stated by the menus, the VPX one, a "Tables" above the choice.
  const known = unique(
    [...(popper?.tableDirs ?? []), ...frontends.flatMap(readTablePaths), vpxDir && child(vpxDir, 'Tables'), named, hints.vpx && child(hints.vpx, 'Tables')].map((d) =>
      own(d && resolveDir(d)),
    ),
  );
  const vpxExes = unique([vpxDir ? vpxExesIn(vpxDir)[0] : undefined, ...(popper?.vpxExes ?? [])].filter((e) => e && !exclude.some((x) => isInside(e, x)) && isFile(e)));
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
    vpRegFiles,
    catalog,
    ...(vpxExes.length ? { vpxExes } : {}),
    ...(romAliases.length ? { romAliases } : {}),
  };
}

/** VPinMAME alias file, in its folder. */
const ALIAS_FILE = 'VPMAlias.txt';

/** "alias,game" lines of the VPMAlias.txt of a VPinMAME folder (empty if it has none). */
function readVpmAliases(dir: string): AliasLine[] {
  const file = fileIn(dir, ALIAS_FILE);
  if (!file) return [];
  try {
    return parseAliases(fs.readFileSync(file, 'latin1'));
  } catch {
    return [];
  }
}

/** Game VPinMAME loads for this name: its VPMAlias.txt, then the old names it knew by default. */
function romAliasOf(layout: InstallationLayout, rom: string): string | undefined {
  const line = layout.romAliases?.find((l) => l.alias.toLowerCase() === rom.toLowerCase());
  const real = line?.rom ?? historicAlias(rom);
  return real && real.toLowerCase() !== rom.toLowerCase() ? real : undefined;
}

/** Deepest common folder: "C:\vPinball" for VisualPinball\Tables and PinUPSystem\PUPVideos. */
function commonDir(dirs: (string | undefined)[]): string {
  const list = dirs.filter((d): d is string => Boolean(d)).map((d) => path.resolve(d));
  let common = list[0]!;
  for (const d of list.slice(1)) {
    while (!isInside(d, common) && path.dirname(common) !== common) common = path.dirname(common);
  }
  return common;
}

/**
 * Tables folder: a known tables folder that contains the choice (the deepest), then
 * the chosen folder if it contains .vpx files, then "Tables" under the choice or the root folder.
 */
function tablesDirOf(start: string, known: string[], root: string): { dir: string; established: boolean } | undefined {
  const containing = known.filter((k) => isInside(start, k)).sort((a, b) => b.length - a.length)[0];
  if (containing) return { dir: containing, established: true };
  // Chosen folder that contains tables, without being a known tables folder: listed, never taken for the installation's one.
  if (hasVpx(start)) return { dir: start, established: false };
  for (const base of [start, root]) {
    const found = child(base, 'Tables') ?? VPX_NAMES.map((v) => child(base, v, 'Tables')).find(Boolean) ?? child(base, 'vPinball', 'VisualPinball', 'Tables');
    if (found) return { dir: found, established: true };
  }
  const dir = known.find((k) => isInside(k, root)) ?? known[0];
  return dir ? { dir, established: true } : undefined;
}

/** Usual locations of an installation, per drive. */
const USUAL_PLACES = ['vPinball', 'Visual Pinball', 'VisualPinball', 'Visual Pinball X', 'VPinballX', 'VPX', 'Pinball', 'Games\\vPinball', 'Games\\Visual Pinball', 'PinUPSystem', 'PinballX', 'PinballY', 'Program Files (x86)\\Visual Pinball', 'Program Files\\Visual Pinball', 'Program Files\\PinballY', 'Program Files (x86)\\PinballX'];

/** Known installations of this PC (usual locations, and what the registry says), for taking over a table. */
export function knownTableInstallations(drives: string[] = ['C:', 'D:', 'E:'], exclude: string[] = [], hints: InstallationHints = {}): InstallationLayout[] {
  return withDirCache(() => knownInstallations(drives, exclude, hints));
}

function knownInstallations(drives: string[], exclude: string[], hints: InstallationHints): InstallationLayout[] {
  const found: InstallationLayout[] = [];
  const romDir = hintRomDirs(hints).find((d) => path.isAbsolute(d));
  const dirs = [
    ...drives.flatMap((drive) => USUAL_PLACES.map((p) => `${drive}\\${p}`)),
    hints.vpx,
    hints.pinmame && path.dirname(path.resolve(hints.pinmame)),
    romDir && path.dirname(path.dirname(path.resolve(romDir))),
  ];
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

/** A table of the installation, as the list shows it. */
export interface InstallationTable {
  vpx: string;
  title: string;
  manufacturer?: string;
  year?: number;
  /** What the .vpx name alone is enough to find (backglass, media); the rest comes from the script, in the plan. */
  backglass: boolean;
  medias: number;
  /** Playlists of the original menu that contain it ("Home", "Visual Pinball X"...). */
  playlists: string[];
  /**
   * Played in the original menu (in a Popper playlist, enabled in PinballX or
   * PinballY); false: only present on the disk; absent: the installation says nothing about it.
   */
  active?: boolean;
  /**
   * The VPX executable that played the table in this installation: the one its menu states (Popper), otherwise
   * the installation's one. Absent: no known VPX. At installation, it chooses the table's other VPX
   * when it is in system menu > My cabinet > "VPX" > "Autres versions de VPX" (Other VPX versions).
   */
  vpxExe?: string;
}

/**
 * Tables (.vpx) of the tables folders, at any reasonable depth (one folder per table, per
 * manufacturer...), and those Popper knows elsewhere; by title.
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
  // The menu says which tables it plays: a table it does not know is not played.
  const knowsActivity = layout.catalog.some((e) => e.active !== undefined);
  return files
    .map((vpx): InstallationTable => {
      const named = parseTableName(path.basename(vpx, path.extname(vpx)));
      const entries = catalogOf(vpx, layout);
      const playlists = unique(entries.flatMap((e) => e.playlists ?? []));
      // The menu knows the table without stating its VPX (an ALTEXE specific to its launch script): nothing is guessed.
      const vpxExe = entries.length ? entries.find((e) => e.vpxExe)?.vpxExe : layout.vpxExes?.[0];
      return {
        vpx,
        title: named.title,
        ...(named.manufacturer ? { manufacturer: named.manufacturer } : {}),
        ...(named.year ? { year: named.year } : {}),
        backglass: Boolean(backglassOf(vpx)),
        medias: mediasOf(vpx, layout, medias).length,
        playlists,
        ...(knowsActivity ? { active: entries.some((e) => e.active) } : {}),
        ...(vpxExe ? { vpxExe } : {}),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || a.vpx.localeCompare(b.vpx));
}

/** Media of the installation (Visual Pinball only), by game name in lower case: name of the .vpx, or name given by the menu. */
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
 * Names under which the menus store a table's media: the name of the .vpx, the one
 * Popper (GameName) or PinballX and PinballY (description) give it, and those of the other versions
 * stored in the same folder as it (Popper often keeps the name of the old version).
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
 * The installation's .vpx files under each name its menus store media under (tableMediaNames), in
 * lower case: what the media takeover (planInstallationMedias) uses to link "AC-DC Premium" (Popper's
 * GameName) to the table brought in as "AC-DC LUCI Premium (Stern 2013).vpx", and to offer bringing in
 * the table itself when it is not on the cabinet yet.
 */
export function installationGameFiles(layout: InstallationLayout): Map<string, string[]> {
  return withDirCache(() => {
    const map = new Map<string, string[]>();
    const add = (name: string, vpx: string) => {
      const key = name.trim().toLowerCase();
      const list = map.get(key) ?? [];
      if (key && !list.some((v) => samePath(v, vpx))) list.push(vpx);
      map.set(key, list);
    };
    const tables = tablesOf(layout, new Map());
    // The .vpx that bears the name itself first (its own name, its menu entry), then the other versions of its folder.
    for (const { vpx } of tables) {
      add(path.basename(vpx, path.extname(vpx)), vpx);
      for (const e of catalogOf(vpx, layout)) e.names.forEach((n) => add(n, vpx));
    }
    for (const { vpx } of tables) for (const name of tableMediaNames(vpx, layout)) add(name, vpx);
    return map;
  });
}

/**
 * Menu entries for a .vpx: the one that gives its path; the one that gives only its name
 * (PinballX, PinballY); the one whose path no longer exists (table moved since), by its name.
 */
function catalogOf(vpx: string, layout: InstallationLayout): CatalogEntry[] {
  const stem = path.basename(vpx, path.extname(vpx)).toLowerCase();
  return layout.catalog.filter((e) => (e.file && samePath(e.file, vpx)) || (e.stem.toLowerCase() === stem && (!e.file || !isFile(e.file))));
}

/** Media of the installation for a table: under one of its names, or under its title if it belongs only to it. */
function mediasOf(vpx: string, layout: InstallationLayout, medias: Map<string, IncomingMedia[]>): IncomingMedia[] {
  const names = tableMediaNames(vpx, layout).map((n) => n.toLowerCase());
  const found = names.flatMap((n) => medias.get(n) ?? []);
  if (found.length) return found;
  // Last resort: a set of media with the same title ("Terminator 2 (Williams 1991)" for "Terminator 2.vpx"), the only one with this title.
  const title = titleKey(path.basename(vpx, path.extname(vpx)));
  if (title.length < 4) return [];
  const keys = [...medias.keys()].filter((k) => titleKey(k) === title);
  return keys.length === 1 ? medias.get(keys[0]!)! : [];
}

/**
 * Folder of a table's own: the one of its .vpx when it is under a tables folder without
 * being one, and its .vpx files (subfolders included) are all versions of the same game.
 * `others`: the other .vpx files it contains (other versions, never taken over without being ticked).
 */
export function tableHome(vpx: string, layout: InstallationLayout): { dir: string; others: string[] } | undefined {
  const dir = path.dirname(path.resolve(vpx));
  if (!layout.tableDirs.some((d) => isInside(dir, d) && !samePath(dir, d))) return undefined;
  if (layout.tableDirs.some((d) => samePath(dir, d) || isInside(d, dir))) return undefined;
  // An installation folder (PinUPSystem, VPinMAME...) is never a table's one.
  if ([layout.pupVideos, ...layout.pinmameDirs, ...layout.mediaRoots, layout.musicDir].some((p) => p && isInside(p, dir))) return undefined;
  const all = vpxUnder(dir, 3, 50);
  const own = titleKey(path.basename(vpx, path.extname(vpx)));
  if (!all.every((v) => sameGame(titleKey(path.basename(v, path.extname(v))), own))) return undefined;
  return { dir, others: all.filter((v) => !samePath(v, vpx)) };
}

/** Title key of a table or media name: "Terminator 2 (Williams 1991) 1.2" → "terminator212". */
function titleKey(name: string): string {
  return nameKey(parseTableName(name).title);
}

/** Two versions of the same game: same title start, on at least 5 letters and half of the shorter one. */
export function sameGame(a: string, b: string): boolean {
  if (a === b) return true;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 5 && n * 2 >= Math.min(a.length, b.length);
}

/**
 * Parts of an installation table, from its name, its folder and its script: the table's own
 * folder if there is one (everything it contains), otherwise the files named like it
 * next to it (backglass, point of view, settings, script); ROM, save, colours and sounds
 * in VPinMAME; PuP-Pack in PUPVideos; DMD folder of the script; music played by the script;
 * media under one of its names. `missing`: what the script expects and is not there.
 */
export function tableCompanions(vpx: string, layout: InstallationLayout, facts?: CompanionFacts, medias?: Map<string, IncomingMedia[]>): CompanionReport {
  const found: Companion[] = [];
  const missing: string[] = [];
  const add = (p: string | undefined, part: Companion['part'], alias?: AliasLine) => {
    if (p && !found.some((c) => samePath(c.path, p) || (c.part === 'folder' && isInside(p, c.path)))) found.push({ path: p, part, ...(alias ? { alias } : {}) });
  };
  const home = tableHome(vpx, layout);
  if (home) add(home.dir, 'folder');
  for (const [ext, part] of Object.entries(NAMED_LIKE_TABLE)) add(sibling(vpx, ext), part);
  if (!home) add(backglassOf(vpx), 'backglass');

  const roms = tableRoms(vpx, layout, facts);
  // The game VPinMAME really loads for each name: the same one, or its alias (VPMAlias.txt, old name).
  const searched: string[] = [];
  for (const rom of roms) {
    const real = romAliasOf(layout, rom);
    searched.push(rom, ...(real ? [real] : []));
    const own = findRom(layout.romDirs, rom);
    const aliased = !own && real ? findRom(layout.romDirs, real) : undefined;
    const loaded = aliased ? real! : rom;
    add(own ?? aliased, 'rom', aliased ? { alias: rom, rom: real! } : undefined);
    // Save, colours and sounds are stored under the name of the loaded game.
    const names = unique([loaded, rom]);
    add(names.flatMap((n) => layout.nvramDirs.map((d) => fileIn(d, `${n}.nv`))).find(Boolean), 'nvram');
    // ROM settings (DIP switches, mixing): VPinMAME\cfg\<rom>.cfg, stored in the table's pinmame\cfg.
    add(names.flatMap((n) => layout.pinmameDirs.map((d) => child(d, 'cfg')).map((d) => d && fileIn(d, `${n}.cfg`))).find(Boolean), 'cfg');
    add(names.flatMap((n) => layout.pinmameDirs.map((d) => child(d, 'altcolor', n))).find(Boolean), 'altcolor');
    add(names.flatMap((n) => layout.pinmameDirs.map((d) => child(d, 'altsound', n))).find(Boolean), 'altsound');
  }
  let romSearch: RomSearch | undefined;
  if (roms.length && !found.some((c) => c.part === 'rom') && !(home && hasRomIn(home.dir, unique(searched)))) {
    romSearch = { roms: unique(searched), dirs: layout.romDirs, from: layout.root };
    missing.push(romSearchText(romSearch));
  }

  const pack = layout.pupVideos ? findPack(layout.pupVideos, [...expectedPackNames(facts), ...roms], packTitles(vpx, home?.dir, layout)) : undefined;
  add(pack, 'pup');
  // The script loads a PuP-Pack (packNames) the installation does not have: to be said, not kept quiet.
  if (!pack && facts?.pup?.packNames?.length && !(home && findPackRoot(home.dir, 3))) missing.push(t('PuP-Pack « {name} »', { name: facts.pup.packNames[0]! }));

  if (facts?.dmdFolder) {
    const dmd = child(path.dirname(vpx), facts.dmdFolder) ?? layout.tableDirs.map((d) => child(d, facts.dmdFolder!)).find(Boolean);
    if (dmd) add(dmd, 'dmdFolder');
    else missing.push(t('dossier DMD « {name} »', { name: facts.dmdFolder }));
  }
  // DMD folder named like the table ("Foo.UltraDMD", "Foo.FlexDMD"): taken over even when the script does not say
  // readably which one it loads (path computed at run time).
  const base = path.basename(vpx).replace(/\.vpx$/i, '');
  for (const ext of ['UltraDMD', 'FlexDMD']) add(child(path.dirname(vpx), `${base}.${ext}`), 'dmdFolder');

  // Music the script plays (PlayMusic "Akira\track.mp3"): stored by VPX in its Music folder.
  if (layout.musicDir) {
    for (const ref of facts?.music ?? []) {
      const parts = ref.split(/[\\/]+/).filter(Boolean);
      if (!parts.length) continue;
      // "Akira\track.mp3" or "Akira\" (computed rest): the folder; "track.mp3": the file alone.
      const folder = parts.length > 1 || /[\\/]$/.test(ref);
      const music = folder ? child(layout.musicDir, parts[0]!) : fileIn(layout.musicDir, parts[0]!);
      add(music, 'music');
      // Neither in the installation's Music folder, nor in the table's folder: to be said, the table would be silent.
      const own = home && (folder ? child(home.dir, 'music', parts[0]!) : fileIn(child(home.dir, 'music') ?? '', parts[0]!));
      if (!music && !own) missing.push(t('musique « {name} »', { name: ref }));
    }
  } else if (facts?.music?.length && !(home && child(home.dir, 'music'))) {
    missing.push(t('musique « {name} »', { name: facts.music[0]! }));
  }

  // What the script saved (SaveValue): the VPReg.stg of VPX 10.7 and 10.8.0, or the user
  // folder of a table stored flat (VPX 10.8.1). The one of a table that has its own folder comes with it.
  if (!(home && fileIn(child(home.dir, 'user') ?? '', 'VPReg.stg'))) {
    const files = unique([fileIn(child(path.dirname(vpx), 'user') ?? '', 'VPReg.stg'), ...(layout.vpRegFiles ?? [])]);
    const script = files.length ? (readTextSafe(sibling(vpx, '.vbs')) ?? readVpxScript(vpx)) : undefined;
    const names = script ? vpRegStorageNames(script) : [];
    for (const file of files) {
      const storages = (readVpRegStorages(file, names) ?? []).map((s) => s.name);
      if (storages.length) {
        found.push({ path: file, part: 'vpreg', storages });
        break;
      }
    }
  }

  for (const m of mediasOf(vpx, layout, medias ?? indexInstallationMedias(layout))) add(m.from, 'media');
  const romAliases = found.flatMap((c) => (c.alias ? [c.alias] : []));
  return { vpx, root: layout.root, found, missing, ...(romSearch ? { romSearch } : {}), ...(romAliases.length ? { romAliases } : {}) };
}

/**
 * ROMs of an installation table: those its script asks for; if it names none
 * clearly (computed name, script unreadable or not read), the one the menu gives it (ROM column
 * of Popper, <rom> of PinballX and PinballY). A table whose script does not use PinMAME has none.
 */
function tableRoms(vpx: string, layout: InstallationLayout, facts: CompanionFacts | undefined): string[] {
  const fromScript = facts?.usesPinmame ? facts.roms : [];
  if (fromScript.length) return unique(fromScript);
  if (facts && !facts.usesPinmame) return [];
  return unique(catalogOf(vpx, layout).map((e) => e.rom));
}

/** ROM "t2_l8" (or t2_l6), looked for in C:\…\roms and D:\roms: what is missing, and where it was looked for. */
export function romSearchText(search: Pick<RomSearch, 'roms' | 'dirs'>): string {
  const [rom, ...others] = search.roms;
  const name = others.length ? t('ROM « {rom} » (ou {others})', { rom: rom!, others: formatList(others, 'or') }) : t('ROM « {rom} »', { rom: rom! });
  return search.dirs.length
    ? t('{name}, cherchée dans {dirs}', { name, dirs: formatList(search.dirs) })
    : t('{name} : l’installation n’a aucun dossier de ROM connu (ni VPinMAME\\roms, ni rompath de VPinMAME dans le registre, ni dossier des ROM de Popper)', { name });
}

function readTextSafe(file: string | undefined): string | undefined {
  try {
    return file ? fs.readFileSync(file, 'latin1') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * VPReg.stg reduced to the table's storages, written to a temporary folder "…\user" (which
 * the import stores in the table's folder); undefined if there is nothing to take over. The same
 * source file always gives the same folder: a plan made again does not multiply them.
 */
function vpRegSource(c: Companion): string | undefined {
  const data = extractVpReg([c.path], c.storages ?? []);
  if (!data) return undefined;
  let stamp = '';
  try {
    stamp = String(fs.statSync(c.path).mtimeMs);
  } catch {
    return undefined;
  }
  const id = createHash('sha1').update(`${c.path}|${stamp}|${(c.storages ?? []).join('|')}`).digest('hex').slice(0, 16);
  const user = path.join(os.tmpdir(), `cyberpinball-vpreg-${id}`, 'user');
  fs.mkdirSync(user, { recursive: true });
  fs.writeFileSync(path.join(user, 'VPReg.stg'), data);
  return user;
}

/** Does the table's own folder already contain its ROM (VPinMame\roms, pinmame\roms...)? */
function hasRomIn(dir: string, roms: string[]): boolean {
  const wanted = new Set(roms.map((r) => `${r.toLowerCase()}.zip`));
  return filesUnder(dir, 4).some((f) => wanted.has(path.basename(f).toLowerCase())) || roms.some((r) => findRom([dir], r, 3));
}

/**
 * ROM in ROM folders, in all the forms VPinMAME reads: "rom.zip", "rom" folder
 * of uncompressed chips, or one of the two one or more levels lower ("roms\_src\rom.zip",
 * one folder per manufacturer). The zip first, the highest first.
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
        if (folder && isRomFolder(folder)) return folder;
      }
    }
  }
  return undefined;
}

/**
 * VPinMAME folders that are never ROMs: a "t2_l8" subfolder of altcolor (colours),
 * of altsound (sounds) or of nvram is not the t2_l8 ROM, even when the ROM folder given by
 * Popper or the rompath is the VPinMAME folder itself.
 */
const NOT_ROM_DIRS = new Set(['altcolor', 'altsound', 'nvram', 'cfg', 'ini', 'hi', 'snap', 'memcard', 'wave', 'sta', 'inp', 'diff', 'samples', 'sounds', 'music', 'serum', 'vni']);

/** Files of colours, sounds, saves: never ROM chips. */
const NOT_ROM_FILES = /\.(crz|cromc|pal|vni|pac|csv|ogg|wav|mp3|nv|cfg|txt|ini|png|jpg|mp4|db)$/i;

/** Folder of uncompressed chips: at least one file that is neither colour, nor sound, nor save. */
function isRomFolder(dir: string): boolean {
  return dirents(dir).some((e) => e.isFile() && !NOT_ROM_FILES.test(e.name));
}

/** Subfolders exactly `level` levels under `dir`, without the VPinMAME ones that contain no ROM. */
function subDirs(dir: string, level: number): string[] {
  let at = [dir];
  for (let i = 0; i < level; i++) at = at.flatMap((d) => dirents(d).filter((e) => e.isDirectory() && !NOT_ROM_DIRS.has(e.name.toLowerCase())).map((e) => path.join(d, e.name)));
  return at;
}

/** Names under which to look for a PuP-Pack by its title: the .vpx, its folder, its names in the menus. */
function packTitles(vpx: string, home: string | undefined, layout: InstallationLayout): string[] {
  return [...tableMediaNames(vpx, layout), ...(home ? [path.basename(home)] : [])];
}

/**
 * PuP-Pack of the table in PUPVideos: under one of the names the plugin will load; failing that, a
 * folder with the table's title ("xfiles" for "X-Files (Sega 1997)"), or whose name starts
 * the title ("STRANGERTHINGS4" for "Stranger Things 4 LPE"), if it is the only one.
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
 * What comes with the .vpx files chosen in an existing installation: the import sources to
 * use (a table's own folder replaces its .vpx; the parts stored elsewhere
 * are added, copied and attached to their table), and what was found for each table.
 * An unpacked archive, the import folder and a .vpx outside the tables folders of an
 * installation receive nothing more.
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
  // A part the import already brings (the PuP-Pack of a download) is never duplicated by the installation's one.
  // A ROM, by its name: a table folder that contains another ROM (old revision, the one
  // of another version) does not prevent the one the table loads from coming from VPinMAME.
  const brought = broughtParts(sources);
  const broughtRoms = broughtRomNames(sources);
  const chosen = sources.filter((s) => !s.unpacked && s.mode === 'copy').flatMap((s) => vpxIn(s.path));
  // Sources taken from an installation: their big files are linked, not copied (hardlink.ts).
  const fromInstallation = new Set<ImportSource>();
  for (const src of sources) {
    if (src.unpacked || src.mode !== 'copy') continue;
    for (const vpx of vpxIn(src.path)) {
      const dir = path.dirname(vpx);
      if (!layouts.has(dir.toLowerCase())) {
        const layout = findInstallation(dir, exclude, hints);
        // Only a table stored in a tables folder of the installation (at any depth) is part of it:
        // a .vpx downloaded elsewhere on a PC that also has an installation takes nothing from it.
        const inTables = layout && layout.tableDirs.some((d) => isInside(vpx, d));
        layouts.set(dir.toLowerCase(), inTables ? { layout } : undefined);
      }
      const entry = layouts.get(dir.toLowerCase());
      if (!entry) continue;
      fromInstallation.add(src);
      entry.medias ??= indexInstallationMedias(entry.layout);
      const report = tableCompanions(vpx, entry.layout, facts(vpx), entry.medias);
      const label = (p: string) => shownPath(p, entry.layout.root);
      const kept: Companion[] = [];
      // What the table's own folder already brings (its ROM, its PuP-Pack): no duplicate from elsewhere.
      let ownBrought = new Set<Companion['part']>();
      let ownRoms = new Set<string>();
      const already = (c: Companion) => (c.part === 'rom' ? broughtRoms.has(romNameOf(c.path)) || ownRoms.has(romNameOf(c.path)) : brought.has(c.part) || ownBrought.has(c.part));
      for (const c of report.found) {
        if (c.part === 'folder') {
          // The table's folder replaces its .vpx chosen alone; the other versions it contains
          // are only part of it if they were ticked too. Already chosen (another version
          // ticked, or a folder above): nothing to add.
          if (result.some((s) => isInside(c.path, s.path))) continue;
          const others = tableHome(vpx, entry.layout)!.others.filter((o) => !chosen.some((v) => samePath(v, o)));
          // Its name alone ("Ghostbusters"): it is one of the table's candidate names (describeGame).
          const folder: ImportSource = { path: c.path, mode: 'copy', link: true, label: path.basename(c.path), ...(others.length ? { exclude: others.flatMap(withSiblings) } : {}) };
          // The ticked .vpx files of this folder are in it: their source alone gives way to the folder.
          const at = result.findIndex((s) => isInside(s.path, c.path));
          for (let i = result.length - 1; i >= 0; i--) if (isInside(result[i]!.path, c.path)) result.splice(i, 1);
          result.splice(at >= 0 ? at : result.length, 0, folder);
          ownBrought = broughtParts([folder]);
          ownRoms = broughtRomNames([folder]);
          kept.push(c);
          continue;
        }
        // Already brought (another ticked table plays the same ROM): its alias stays in the report (romAliases).
        if (taken(c.path) || already(c)) continue;
        if (c.part === 'vpreg') {
          // The file of the whole installation is never copied: only the table's storages, in a VPReg.stg of its own.
          const user = vpRegSource(c);
          if (!user) continue;
          extra.push({ path: user, mode: 'copy', owner: vpx, label: label(c.path) });
          kept.push(c);
          continue;
        }
        extra.push({ path: c.path, mode: 'copy', link: true, owner: vpx, label: label(c.path) });
        kept.push(c);
      }
      report.found = kept;
      if (report.found.length || report.missing.length) reports.push(report);
    }
  }
  return { sources: [...result.map((s) => (fromInstallation.has(s) ? { ...s, link: true } : s)), ...extra], reports };
}

/** A .vpx and the files named like it next to it (its backglass, its settings...). */
function withSiblings(vpx: string): string[] {
  const stem = path.basename(vpx, path.extname(vpx)).toLowerCase();
  return [vpx, ...dirents(path.dirname(vpx)).filter((d) => d.isFile() && path.parse(d.name).name.toLowerCase() === stem && !samePath(path.join(path.dirname(vpx), d.name), vpx)).map((d) => path.join(path.dirname(vpx), d.name))];
}

/**
 * Parts the chosen sources already bring, apart from the .vpx files and their neighbours of the same name:
 * a PuP-Pack, a ROM (a real one: not the archive the table comes from), a separate backglass.
 * A folder is only looked at on two levels.
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

/**
 * Names of the ROMs (in lower case) the chosen sources already bring: their ROM zips, at four
 * levels ("Ghostbusters\VPinMame\roms\gb_10.zip"). A ROM of the installation is set aside only if
 * the same one is already there: never because another ROM is.
 */
function broughtRomNames(sources: ImportSource[]): Set<string> {
  const names = new Set<string>();
  for (const s of sources) {
    for (const f of isDir(s.path) ? filesUnder(s.path, 4) : [s.path]) if (/\.zip$/i.test(f) && isRomZip(f)) names.add(romNameOf(f));
  }
  return names;
}

/** Name of the ROM of a zip or of a folder of chips: "t2_l8". */
function romNameOf(p: string): string {
  return path.basename(p).replace(/\.zip$/i, '').toLowerCase();
}

/** "PinUPSystem › PUPVideos › TheMatrix": the path under the root folder of the installation. */
function shownPath(p: string, root: string): string {
  const rel = path.relative(root, p);
  return (rel && !rel.startsWith('..') ? rel : p).split(/[\\/]+/).join(' › ');
}

/** Label of a part found, for the plan. */
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
    case 'cfg':
      return t('Réglages de la ROM');
    case 'vpreg':
      return t('Valeurs enregistrées par la table');
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

/** Title of an installation table already present in the cabinet? By the name of the .vpx or the title. */
export function alreadyInstalled(table: InstallationTable, installed: { title: string; files: string[] }[]): boolean {
  const key = nameKey(table.title);
  const file = path.basename(table.vpx).toLowerCase();
  return installed.some((i) => nameKey(i.title) === key || i.files.some((f) => path.basename(f).toLowerCase() === file));
}

// ---------------------------------------------------------------------------
// What the installation's menus say

/** PinUP Popper database (PUPDatabase.db): its Visual Pinball emulators, their folders, their tables. */
interface PopperFacts {
  tableDirs: string[];
  mediaDirs: string[];
  romDirs: string[];
  games: CatalogEntry[];
  /** The executable each Visual Pinball emulator launches (its folder EmuLaunchDir, its launch script). */
  vpxExes: string[];
}

/**
 * Columns of PinUP Popper's tables that are read here, as a real PUPDatabase.db names them. The emulator folder is
 * EmuLaunchDir (the [DIREMU] of its launch script); DirEmulator is only an older or alternative name. A test checks
 * every column the query reads against this list, so a name that no real database has cannot come back.
 */
export const POPPER_EMULATOR_COLUMNS = ['EMUID', 'EmuName', 'DirGames', 'DirMedia', 'DirRoms', 'GamesExt', 'EmuLaunchDir', 'LaunchScript'] as const;
export const POPPER_GAME_COLUMNS = ['GameID', 'EMUID', 'GameName', 'GameFileName', 'ROM', 'ALTEXE'] as const;

/**
 * The executable a Popper launch script starts when the table has no ALTEXE: its `SET VPXEXE=…` (Popper's stock
 * scripts), otherwise the first VPinballX*.exe it names outside comments. A bare file name of the emulator folder;
 * undefined when the script names none (a custom script: the folder's usual executable is taken).
 */
export function popperScriptExe(script: string | null | undefined): string | undefined {
  if (!script) return undefined;
  const lines = script.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(rem\b|::)/i.test(l));
  const bare = (value: string | undefined) => {
    const name = value?.trim().replace(/^"|"$/g, '').trim();
    if (!name || name.includes('[') || name.includes('%') || /[\\/]/.test(name)) return undefined;
    return /\.exe$/i.test(name) ? name : `${name}.exe`;
  };
  for (const line of lines) {
    const set = /^set\s+"?vpxexe\s*=\s*([^"]*?)"?\s*$/i.exec(line);
    if (set) return bare(set[1]);
  }
  for (const line of lines) {
    const named = /\b(vpinballx[\w.-]*\.exe)\b/i.exec(line);
    if (named) return bare(named[1]);
  }
  return undefined;
}

/** Read-only reading of the Popper database; undefined if it is missing or cannot be read (Popper open, damaged database). */
export function readPopper(file: string): PopperFacts | undefined {
  if (!isFile(file)) return undefined;
  let db: DatabaseSync | undefined;
  try {
    // node:sqlite is built into Node (Electron 44); loaded here only, and only if there is a database.
    const { DatabaseSync: Database } = require('node:sqlite') as typeof import('node:sqlite');
    db = new Database(file, { readOnly: true });
    const columns = (table: string) => new Set((db!.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name.toLowerCase()));
    const emuCols = columns('Emulators');
    const gameCols = columns('Games');
    const col = (cols: Set<string>, name: string) => (cols.has(name.toLowerCase()) ? name : 'NULL');
    const emus = db
      .prepare(
        `select EMUID as id, EmuName as name, ${col(emuCols, 'DirGames')} as games, ${col(emuCols, 'DirMedia')} as media, ${col(emuCols, 'DirRoms')} as roms, ${col(emuCols, 'GamesExt')} as ext, ${col(emuCols, 'EmuLaunchDir')} as launchDir, ${col(emuCols, 'DirEmulator')} as emulatorDir, ${col(emuCols, 'LaunchScript')} as script from Emulators`,
      )
      .all() as { id: number; name: string | null; games: string | null; media: string | null; roms: string | null; ext: string | null; launchDir: string | null; emulatorDir: string | null; script: string | null }[];
    // The folder the launch script runs VPX from ([DIREMU]), and the executable it starts without ALTEXE.
    const emulatorOf = (e: (typeof emus)[number] | undefined) => (e?.launchDir?.trim() || e?.emulatorDir?.trim() || undefined);
    const exeOf = (e: (typeof emus)[number] | undefined, alt: string | null | undefined) => popperGameExe(emulatorOf(e), alt, popperScriptExe(e?.script));
    const vp = emus.filter((e) => /vpx/i.test(e.ext ?? '') || /visual\s*pinball|vpinball/i.test(e.name ?? ''));
    if (!vp.length) return { tableDirs: [], mediaDirs: [], romDirs: [], games: [], vpxExes: [] };
    const ids = vp.map((e) => e.id);
    const rows = db
      .prepare(`select GameID as id, EMUID as emu, GameName as name, GameFileName as file, ${col(gameCols, 'ROM')} as rom, ${col(gameCols, 'ALTEXE')} as alt from Games where EMUID in (${ids.map(() => '?').join(',')})`)
      .all(...ids) as { id: number; emu: number; name: string | null; file: string | null; rom: string | null; alt: string | null }[];
    const lists = popperPlaylists(db);
    const games: CatalogEntry[] = [];
    for (const r of rows) {
      if (!r.file?.trim()) continue;
      const emu = vp.find((e) => e.id === r.emu);
      const dir = emu?.games ?? '';
      const file = path.isAbsolute(r.file) ? r.file : dir ? path.join(dir, r.file) : undefined;
      const playlists = lists ? lists.filter((l) => l.games.has(r.id)).map((l) => l.name) : undefined;
      const vpxExe = exeOf(emu, r.alt);
      games.push({
        ...(file ? { file } : {}),
        stem: path.basename(r.file, path.extname(r.file)),
        names: r.name?.trim() ? [r.name.trim()] : [],
        ...(r.rom?.trim() ? { rom: r.rom.trim() } : {}),
        ...(playlists ? { playlists, active: playlists.length > 0 } : {}),
        ...(vpxExe ? { vpxExe } : {}),
      });
    }
    const dirs = (key: 'games' | 'media' | 'roms') => unique(vp.map((e) => e[key]?.trim()).filter((d): d is string => Boolean(d) && path.isAbsolute(d!)));
    // The executables named by an ALTEXE count too: a table played in 10.8.0 under the usual emulator.
    const vpxExes = unique([...vp.map((e) => exeOf(e, undefined)), ...games.map((g) => g.vpxExe)]);
    return { tableDirs: dirs('games'), mediaDirs: dirs('media'), romDirs: dirs('roms'), games, vpxExes };
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {
      // Already closed.
    }
  }
}

/**
 * Visible Popper playlists and their tables: the manual ones (PlayListDetails),
 * and the automatic ones (a query on Games, run on the database opened read-only). A playlist
 * of the latest tables added (LIMIT) does not say that a table is played: set aside. undefined if the
 * database has no playlists.
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
        // A single read query on Games, without a limit on the number.
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
 * PinballX and PinballY databases (Databases\<system>\*.xml, in HyperPin format): for each
 * table, the name of the .vpx (name), and the description under which their media are often stored.
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
        // "enabled" at False: the table is known to the menu without being played in it.
        const enabled = !/^(false|0|no)$/i.test(tag('enabled'));
        out.push({ stem, names: unique([stem, description]), ...(rom ? { rom } : {}), active: enabled });
      }
    }
  }
  return out;
}

/** Tables folders stated by the settings of PinballX (Config\PinballX.ini) and of PinballY (Settings.txt). */
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

/** Folders never walked through when looking for tables: table parts and working folders. */
const NOT_TABLE_DIRS = /^(pupvideos|pupvideos\.off|medias|cache|altsound|altcolor|music|pinmame|vpinmame|serum|vni|user|scripts|b2s_backup|bkp|backup|__macosx|\.git)$|\.(ultradmd|flexdmd)$/i;

/** .vpx files under a folder, down to `depth` levels, without entering table parts. */
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

/** Files under a folder, down to `depth` levels. */
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

/** File named like the .vpx, with this extension, in the same folder (case-insensitive). */
function sibling(vpx: string, ext: string): string | undefined {
  return fileIn(path.dirname(vpx), path.basename(vpx, path.extname(vpx)) + ext);
}

/**
 * Backglass of a table stored flat: named like it, otherwise the only .directb2s of its folder
 * whose name starts like its own ("Table_.directb2s", "Table (full dmd).directb2s").
 */
function backglassOf(vpx: string): string | undefined {
  const exact = sibling(vpx, '.directb2s');
  if (exact) return exact;
  const stem = nameKey(path.basename(vpx, path.extname(vpx)));
  if (stem.length < 4) return undefined;
  const close = dirents(path.dirname(vpx)).filter((d) => d.isFile() && /\.directb2s$/i.test(d.name) && nameKey(path.parse(d.name).name).startsWith(stem));
  return close.length === 1 ? path.join(path.dirname(vpx), close[0]!.name) : undefined;
}

/** File `name` of `dir`, case-insensitive. */
function fileIn(dir: string, name: string): string | undefined {
  const d = dirents(dir).find((e) => e.isFile() && e.name.toLowerCase() === name.toLowerCase());
  return d ? path.join(dir, d.name) : undefined;
}

/** Subfolder `a\b\…` of `dir`, case-insensitive, or undefined. */
function child(dir: string, ...names: string[]): string | undefined {
  let at = dir;
  for (const name of names) {
    const d = dirents(at).find((e) => e.isDirectory() && e.name.toLowerCase() === name.toLowerCase());
    if (!d) return undefined;
    at = path.join(at, d.name);
  }
  return at;
}

/** First subfolder found among possible names, then its `then` subfolders (one of them). */
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

/** Path of a setting (registry, Popper database): absolute, without trailing slash. */
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

/** Folders already read during a search: each parent folder (the temporary folder, a whole drive) is read only once. */
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

/** What must be known about a table to find its part in a chosen folder. */
export interface PartWanted {
  /** PuP-Pack names the plugin will load (expectedPackNames). */
  packs: string[];
  roms: string[];
  title: string;
}

/**
 * Folder chosen for a part of a table ("PuP-Pack : chercher sur le disque" (PuP-Pack: search the
 * disk)): the folder itself if it is the part; if it contains several (whole PUPVideos,
 * VPinMAME\altsound, VPinMAME\roms), the table's one from its names, or the only one; otherwise
 * the list to choose from.
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
    // VPinMAME chosen as a whole: its altsound (or altcolor), then the ROM's folder.
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

/** Among subfolders: those of the table, otherwise the only one, otherwise the list (the most likely first). */
function pickAmong(dir: string, names: string[], own: (name: string) => boolean): { use: string[] } | { choose: string[] } {
  const mine = names.filter(own);
  if (mine.length === 1) return { use: [path.join(dir, mine[0]!)] };
  if (names.length === 1) return { use: [path.join(dir, names[0]!)] };
  if (!names.length) return { use: [dir] };
  const sorted = [...mine, ...names.filter((n) => !own(n)).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))];
  return { choose: sorted.map((n) => path.join(dir, n)) };
}
