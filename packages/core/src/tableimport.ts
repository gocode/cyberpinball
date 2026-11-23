// Adding tables: from files, folders or archives already
// unpacked, a plan is drawn up (what goes where, what is renamed or replaced),
// which the user approves before anything moves. Archives are unpacked
// by the application (Windows tar); everything here is independent of Windows.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { bestMatch, pupMemory, setPupMemory, tableFolderName, type ScriptFacts } from './doctor';
import { applyOps, isInside, moveToTrash, pruneEmptyDirs, samePath, sameVolume, type FileOp, type OpContext } from './fileops';
import { t } from './i18n';
import {
  arrangeMedias,
  mediaFolder,
  mediaGameNames,
  mediaSubFolder,
  recognizeMedia,
  type IncomingMedia,
  type MediaFolder,
  type MediaFrontend,
  type RecognizedMedia,
} from './mediaimport';
import type { MediaType } from './medias';
import {
  analysePack,
  chooseVariant,
  expectedPackNames,
  findPackRoot,
  isPackRoot,
  type BatReport,
  describeSwitches,
  packDrawsDmd,
  pupSwitchesToEnable,
  playlistRenames,
  type PupCabinet,
  type PupVariant,
  type VariantChoice,
} from './puppack';
import { listRoms, romFile, romHash, romKey, sameRomFile, tableRomsDir } from './romlibrary';
import { colorImportTarget } from './dmdcolors';
import { buildZip, isRomZip, listRelative, readZipEntries, recognizeRomName, romContent, zipContentHash, type RomHints, type RomZipMember } from './romzip';
import { classifyDir, classifyFile, nameKey, type FileKind } from './tablefiles';
import { parseTableName, readInfo, type TableInfoFile } from './tables';
import { mergeFavorite } from './collections';
import { HISTORIC_ROM_ALIASES } from './vpmalias';
import { IMPORTED_ALIAS_COMMENT, readTableAliases, tableAliasFile, withAlias, type AliasLine } from './romalias';
import type { CompanionReport } from './installation';
import { ipdbIdOf, matchVps, type VpsCandidate, type VpsDb } from './vps';
import { buildScriptPatch, readScriptPatch } from './scriptpatch';
import { compatFixesApplicable, compatFixesFound } from './scriptcompat';
import { scriptCode } from './vbscript';
import { readVpxScript } from './vpxinfo';
import { disabledPacks, PUP_DISABLED_FOLDER, PUP_FOLDER } from './pupdisabled';

export interface ImportSource {
  /** File or folder on the disk (an archive already unpacked is a folder). */
  path: string;
  /** Name shown to the user: the one of the original archive for an unpacked folder. */
  label?: string;
  /** move: the import folder is emptied; copy: the user's files are not touched. */
  mode: 'move' | 'copy';
  /**
   * With copy mode: the big files that do not change (.vpx, backglass, videos, images, sounds, ROM)
   * become hard links on the same volume, taking no extra space (hardlink.ts); the rest
   * is copied. An installation taken over (installation.ts): nothing changes there.
   */
  link?: boolean;
  /** Folder unpacked from an archive: it is a package, even if it contains only one file. */
  unpacked?: boolean;
  /**
   * .vpx this source is part of: found in the installation the table comes from
   * (its PuP-Pack in PUPVideos, its ROM in VPinMAME..., installation.ts). It goes to it.
   */
  owner?: string;
  /** Paths to leave aside in this folder: the other versions of a table, not ticked (installation.ts). */
  exclude?: string[];
}

/** Table already installed, to put an addition into (ROM, PuP videos...). */
export interface KnownTable {
  folder: string;
  title: string;
  roms: string[];
  /** DMD folder loaded by its script (ProjectFolder of FlexDMD or UltraDMD). */
  dmdFolder?: string;
  /** PuP-Pack names expected by its scripts (B2SInit, ROM...). */
  pupNames?: string[];
  /** VPS game of its .info: the folder is found even if VPS gives it another name. */
  vpsId?: string;
  /** Its .vpx whose script turns the PuP-Pack off ("usePUP = False"): turned on if the pack arrives. */
  pupOff?: string[];
}

export interface PlanOptions {
  tablesDir: string;
  /** Script of each .vpx to import (key: path in lower case), read by the application. */
  scripts?: Map<string, ScriptFacts>;
  existing?: KnownTable[];
  /** VPS database: folder name and information from the recognised game. */
  vps?: VpsDb;
  /**
   * User's choice, per table (key TableVps.key): identifier of the VPS game,
   * or null to keep the name deduced from the files.
   */
  vpsChoices?: Map<string, string | null>;
  /** Screens of the cabinet: default choice of the PuP-Packs' option. */
  cabinet?: PupCabinet;
  /** Option chosen by the user, per pack (key PackPlan.key). */
  pupChoices?: Map<string, string>;
  /**
   * ROM library (<root folder>\pinmame\roms): an imported ROM is stored there,
   * then linked into each table that plays it. Absent: the ROM goes into the table.
   */
  romLibrary?: string;
  /** Version kept per ROM (key RomImport.key): hash of the chosen content. */
  romChoices?: Map<string, string>;
  /**
   * VPS game of these files, when known (fetched from the catalogue for this game):
   * what is attached to no table goes to the table of this game, new or already
   * installed (a PuP-Pack fetched after the table, whose archive does not name the game).
   */
  vpsGame?: string;
  /**
   * Folder of an installed table chosen by the user (addition from the game page, or
   * from Downloads to a table): everything the import contains goes to it, the table
   * included, except what goes elsewhere by nature (a ROM enters the library).
   */
  target?: string;
  /**
   * What the takeover from another installation found for each .vpx (installationCompanions):
   * the VPinMAME alias under which its ROM was found, written in pinmame\alias.txt; the search
   * for a ROM not found, kept in the .info so that the game page says where it was looked for.
   */
  companions?: CompanionReport[];
}

/** A version of a ROM: the library's one or an imported ROM. */
export interface RomImportVersion {
  hash: string;
  size: number;
  mtimeMs: number;
  /** "bibliothèque" (library), or where the imported file comes from. */
  label: string;
  inLibrary: boolean;
  /** Imported file that carries this content (zip, or folder of chips). */
  from?: string;
  mode?: 'move' | 'copy';
  /** Linked copy (ImportSource.link). */
  link?: boolean;
  /** Chips to rebuild into a flat zip: they were in a subfolder, or unpacked. */
  build?: RomZipMember[];
  /** Folder where the chips were ("t2_l8"), if the ROM is rebuilt flat. */
  folder?: string;
  /** Original name, when the ROM was recognised under another name ("Terminator 2 ROM"). */
  renamedFrom?: string;
  /** Comes from an unpacked archive: the working folder is erased after the import. */
  unpacked?: boolean;
}

/** What the import does with a ROM, with the library: stored once, linked wherever it is used. */
export interface RomImport {
  key: string;
  /** File name ("t2_l8.zip"). */
  name: string;
  /** Path in the library. */
  to: string;
  /** Contents present, from the most recent to the oldest. */
  versions: RomImportVersion[];
  /** Version kept (index in versions): the most recent, unless the user chose otherwise. */
  keep: number;
  decided: boolean;
  /** Imported files that are of no use (duplicates, discarded version): recycle bin if they are moved. */
  unused: { from: string; source: string; mode: 'move' | 'copy' }[];
  /**
   * Imported ROMs recognised from their content: chips in a subfolder (folder,
   * rebuilt flat), or archive with another name (renamedFrom). hash: their version.
   */
  recognized: { source: string; folder?: string; renamedFrom?: string; hash: string }[];
  /**
   * Tables that will receive a link. state: new (absent from the table), copy (identical copy
   * replaced), different (other version replaced, recycle bin), linked (already linked, nothing to do).
   * copy true: the table is on another volume, it receives a copy.
   */
  links: { folder: string; title: string; to: string; state: 'new' | 'copy' | 'different' | 'linked'; copy: boolean }[];
  ops: FileOp[];
}

/** What the import does with a PuP-Pack. */
export interface PackPlan {
  /** Key of the pack in the plan (destination in lower case), to remember the choice. */
  key: string;
  /** Name of the pack's original folder. */
  origin: string;
  /** Name of the folder in pupvideos: the one the plugin will look for. */
  name: string;
  /** Where the name comes from: the table's script, or the folder for lack of anything better. */
  nameFrom: 'script' | 'folder';
  /** Names the plugin will try, from the scripts. */
  expected: string[];
  /** The pack was in one folder too many ("rom\rom", archive folder). */
  flattened: boolean;
  /** Pack already installed, replaced as a whole (the old one goes to the recycle bin). */
  replaces?: string;
  /**
   * The pack of this name is disabled in the table (pupdisabled.ts): the new one takes its place
   * in pupvideos (off), and the table is still played without it until "Réactiver" (Re-enable).
   */
  disabled?: boolean;
  variants: PupVariant[];
  /** Option .bat files read without success: never run. */
  failedBats: BatReport[];
  choice: VariantChoice;
  /** The user has chosen the option. */
  decided: boolean;
  /** Useless files removed: ._*, .DS_Store, empty MP4s (relative to the pack). */
  junk: string[];
  /** The pack has no .pup and no option: only the script can drive it. */
  noPupFiles: boolean;
  /** Files renamed so that the PUP plugin starts its playlists like PinUP Player (playlistRenames). */
  renames: { from: string; to: string }[];
}

/** What the VPS database says about a new table. */
export interface TableVps {
  /** Key of the table in the plan (first .vpx), to remember the choice. */
  key: string;
  /** Proposals, the most likely first. */
  candidates: VpsCandidate[];
  /** The first game is certain: kept without asking. */
  confident: boolean;
  /** Game kept (certain or chosen); absent: name deduced from the files. */
  chosen?: VpsCandidate;
  /** The user has chosen (a game, or the files' name). */
  decided: boolean;
  /** Name deduced from the files, proposed when the game is absent from the database. */
  fromFiles: { title: string; manufacturer?: string; year?: number; folderName: string };
}

export interface ImportStep {
  kind: FileKind;
  from: string;
  /** Where the element comes from, for display: "Terminator2.zip › t2_l8.zip". */
  source: string;
  to: string;
  /** Destination relative to the table's folder, for display. */
  target: string;
  mode: 'move' | 'copy';
  /** Linked copy (ImportSource.link): the linkable files become hard links on the same volume. */
  link?: boolean;
  isDir: boolean;
  renamed: boolean;
  /** An existing file will be replaced (and moved to the recycle bin), or a folder completed. */
  replaces: boolean;
  /** PuP-Pack: name, option, cleanup. */
  pack?: PackPlan;
  /** ROM rebuilt flat in pinmame\roms (without library); trashSource: the original goes to the recycle bin. */
  zip?: { files: RomZipMember[]; mtimeMs: number; trashSource: boolean };
  /**
   * Recognised presentation media (Popper, PinballX, VPinFE, "(Type)"): stored
   * as "medias\(Type) <folder>.ext". trash: media of the same type already there,
   * moved to the recycle bin first (other extension, other pages).
   */
  media?: { type: MediaType; page: number; frontend: MediaFrontend; trash: string[] };
}

export interface TablePlan {
  title: string;
  manufacturer?: string;
  year?: number;
  folderName: string;
  folder: string;
  /** false: addition for a table already installed. */
  isNew: boolean;
  steps: ImportStep[];
  infoFile: string;
  info: TableInfoFile;
  /** .info files brought by the import, merged into infoFile. */
  infoSources: { from: string; mode: 'move' | 'copy' }[];
  roms: string[];
  warnings: string[];
  /** Absent without a VPS database, and for an addition without a table. */
  vps?: TableVps;
  /** Cyber Pinball .vbs files (PuP-Pack turned on) to write or to remove. */
  scripts: ScriptPatchPlan[];
  /** Alias lines to add to pinmame\alias.txt: the ROM taken over under the name VPinMAME gave it. */
  romAliases?: AliasLine[];
}

/** Cyber Pinball .vbs, next to an installed .vpx: the table's script, PuP-Pack turned on. */
export interface ScriptPatchPlan {
  to: string;
  /** Content, in latin1 (byte for byte); absent: the old Cyber Pinball .vbs goes to the recycle bin. */
  content?: string;
}

export interface ImportPlan {
  tables: TablePlan[];
  /** Elements that cannot be attached to a table: left where they are. */
  leftovers: { source: string; reason: string }[];
  ignored: string[];
  /** ROMs stored in the library and linked into the tables (empty without a library). */
  roms: RomImport[];
}

interface Item {
  path: string;
  isDir: boolean;
  kind: FileKind;
  parents: string[];
  pkg: number;
  source: string;
  mode: 'move' | 'copy';
  link?: boolean;
  /** Original name of an unpacked folder (archive that contains only the pack). */
  name?: string;
  /** Presentation media recognised from its name and its folder. */
  media?: RecognizedMedia;
  /** ROM recognised from its content: its name, and the chips to rebuild flat if needed. */
  rom?: RomItem;
  /** Comes from an unpacked archive (working folder). */
  unpacked: boolean;
  /** .vpx this element belongs to (ImportSource.owner). */
  owner?: string;
}

interface RomItem {
  /** Name of the ROM, without .zip ("t2_l8"). */
  name: string;
  /** Chips to put back at the root of a new zip: subfolder in the zip, or folder of chips. */
  build?: RomZipMember[];
  /** Folder where the chips were. */
  folder?: string;
  mtimeMs: number;
}

interface Game {
  vpx: Item[];
  others: Item[];
  key: string;
  title: string;
  manufacturer?: string;
  year?: number;
  folderName: string;
  folder: string;
  isNew: boolean;
  roms: string[];
  /** DMD folders loaded by the scripts of its versions. */
  dmdFolders: string[];
  /** PuP-Pack names expected from the scripts. */
  pupNames: string[];
  /** Already installed .vpx whose script turns the PuP-Pack off (KnownTable.pupOff). */
  pupOff?: string[];
  vps?: TableVps;
  /** VPS game kept, or the one of the .info of an installed table. */
  vpsId?: string;
}

export function planImport(sources: ImportSource[], opts: PlanOptions): ImportPlan {
  const items: Item[] = [];
  const ignored: string[] = [];
  const dmdFolders = [
    ...[...(opts.scripts?.values() ?? [])].map((f) => f.dmdFolder),
    ...(opts.existing ?? []).map((k) => k.dmdFolder),
  ].filter((d): d is string => Boolean(d));
  const hints: RomHints = {
    wanted: uniqueNames([...[...(opts.scripts?.values() ?? [])].flatMap((f) => f.roms), ...(opts.existing ?? []).flatMap((k) => k.roms)]),
    known: knownRoms(opts.vps),
  };
  sources.forEach((src, pkg) => collect(src, pkg, items, ignored, dmdFolders, hints));

  const packages = sources.map((src) => ({ name: src.label ?? path.basename(src.path), isPack: src.unpacked || isDir(src.path) }));
  let games = groupGames(items.filter((i) => i.kind === 'table'), items, packages, opts);
  const leftovers: ImportPlan['leftovers'] = [];
  // Chosen table: the .vpx files of the import become versions of it, nothing goes into a new table.
  const target = opts.target ? games.find((g) => samePath(g.folder, opts.target!)) : undefined;
  if (target) {
    for (const g of games.filter((g) => g !== target && g.isNew)) {
      target.vpx.push(...g.vpx);
      target.roms = [...new Set([...target.roms, ...g.roms])];
      target.dmdFolders = [...new Set([...target.dmdFolders, ...g.dmdFolders])];
      target.pupNames = uniqueNames([...target.pupNames, ...g.pupNames]);
    }
    games = games.filter((g) => g === target || !g.isNew);
  }

  // With the library, a ROM does not belong to a table: it goes to the library.
  const romItems: { item: Item; owner?: Game }[] = [];
  const ofGame = opts.vpsGame ? games.filter((g) => g.vpsId === opts.vpsGame) : [];
  for (const item of items.filter((i) => i.kind !== 'table')) {
    const owned = item.owner ? games.find((g) => g.vpx.some((v) => samePath(v.path, item.owner!))) : undefined;
    const game = target ?? owned ?? assign(item, games, packages, opts.vps) ?? (ofGame.length === 1 ? ofGame[0] : undefined);
    if (opts.romLibrary && item.kind === 'rom' && (!item.isDir || item.rom)) romItems.push({ item, owner: game });
    else if (game) game.others.push(item);
    else leftovers.push({ source: item.source, reason: t('Je ne sais pas à quelle table il appartient : il reste où il est.') });
  }

  const planned = games.filter((g) => g.vpx.length || g.others.length);
  const roms = opts.romLibrary ? planRoms(romItems, games, planned, opts.romLibrary, opts.romChoices) : [];
  const linked = (g: Game) => roms.filter((r) => r.links.some((l) => samePath(l.folder, g.folder))).map((r) => r.key);
  return { tables: planned.map((g) => buildTablePlan(g, opts, linked(g))), leftovers, ignored, roms };
}

/**
 * ROMs of the import: each one enters the library (the most recent version,
 * or the chosen one, if the library already has another one), then is linked into
 * all the tables that play it: those whose script asks for it and that have
 * none, those that already have a copy of it, and the one the import intends it for.
 * A new table whose ROM is already in the library receives it too.
 */
function planRoms(romItems: { item: Item; owner?: Game }[], games: Game[], planned: Game[], library: string, choices = new Map<string, string>()): RomImport[] {
  const stored = listRoms(library);
  const byKey = new Map<string, { item: Item; owner?: Game }[]>();
  for (const r of romItems) {
    const key = romKey(r.item.rom?.name ?? path.basename(r.item.path));
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  // ROM already in the library that a table of the import asks for, without having or receiving it.
  for (const g of planned) {
    const present = listRoms(tableRomsDir(g.folder));
    if (!g.roms.length || g.roms.some((r) => byKey.has(romKey(r)) || present.has(romKey(r)))) continue;
    const inLibrary = g.roms.find((r) => stored.has(romKey(r)));
    if (inLibrary && !byKey.has(romKey(inLibrary))) byKey.set(romKey(inLibrary), []);
  }

  const result: RomImport[] = [];
  for (const [key, incoming] of byKey) {
    const storedFile = stored.get(key);
    const first = incoming[0]?.item;
    const name = storedFile ? path.basename(storedFile.path) : `${first?.rom?.name ?? path.basename(first!.path).replace(/\.zip$/i, '')}.zip`;
    const to = path.join(library, name);
    const versions: RomImportVersion[] = [];
    if (storedFile) versions.push({ hash: romHash(storedFile), size: storedFile.size, mtimeMs: storedFile.mtimeMs, label: t('bibliothèque'), inLibrary: true });
    const recognized: RomImport['recognized'] = [];
    for (const { item } of incoming) {
      const version = importedVersion(item);
      if (!version) continue;
      if (version.folder || version.renamedFrom) recognized.push({ source: item.source, folder: version.folder, renamedFrom: version.renamedFrom, hash: version.hash });
      if (!versions.some((v) => v.hash === version.hash)) versions.push(version);
    }
    // The most recent first; at equal date, the library's one.
    versions.sort((a, b) => b.mtimeMs - a.mtimeMs || Number(b.inLibrary) - Number(a.inLibrary));
    const chosen = choices.get(key);
    const picked = chosen ? versions.findIndex((v) => v.hash === chosen) : -1;
    const keep = picked >= 0 ? picked : 0;
    const kept = versions[keep]!;

    const ops: FileOp[] = [];
    // The kept version enters the library; the old one there goes to the recycle bin.
    // Chips in a subfolder or unpacked are rebuilt into a flat zip.
    if (!kept.inLibrary && kept.build) {
      ops.push({ op: 'zip', to, files: kept.build, mtimeMs: kept.mtimeMs });
      if (kept.mode === 'move' && !kept.unpacked) ops.push({ op: 'trash', path: kept.from! });
    } else if (!kept.inLibrary) ops.push(transferOp(kept.mode!, kept.from!, to, kept.link));
    const unused = incoming
      .filter(({ item }) => item.path !== kept.from)
      .map(({ item }) => ({ from: item.path, source: item.source, mode: item.mode }));
    for (const u of unused) if (u.mode === 'move') ops.push({ op: 'trash', path: u.from });

    // Tables that play it: already a copy, asked for by the script without having any, or recipient of the import.
    const links: RomImport['links'] = [];
    const owners = new Set(incoming.map((r) => r.owner).filter((g): g is Game => Boolean(g)));
    for (const g of games) {
      const present = listRoms(tableRomsDir(g.folder));
      const own = present.get(key);
      const wants = g.roms.some((r) => romKey(r) === key) && !g.roms.some((r) => present.has(romKey(r)));
      if (!own && !wants && !owners.has(g)) continue;
      const target = own?.path ?? path.join(tableRomsDir(g.folder), name);
      let state: RomImport['links'][number]['state'] = 'new';
      if (own) {
        if (kept.inLibrary && storedFile && sameRomFile(own, storedFile)) state = 'linked';
        else state = romHash(own) === kept.hash ? 'copy' : 'different';
      }
      links.push({ folder: g.folder, title: g.title, to: target, state, copy: !sameVolume(library, g.folder) });
      if (state !== 'linked') ops.push({ op: 'link', from: to, to: target });
    }
    result.push({ key, name, to, versions, keep, decided: picked >= 0, unused, recognized, links, ops });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Version of an imported ROM: the zip as is, or the flat zip to be rebuilt (its hash in advance). */
function importedVersion(item: Item): RomImportVersion | undefined {
  const rom = item.rom;
  const base = { label: item.source, inLibrary: false, from: item.path, mode: item.mode, unpacked: item.unpacked, ...(item.link ? { link: true } : {}) };
  const original = path.basename(item.path).replace(/\.zip$/i, '');
  const renamedFrom = rom && !item.isDir && original.toLowerCase() !== rom.name.toLowerCase() ? original : undefined;
  if (rom?.build) {
    try {
      const data = buildZip(rom.build);
      const hash = zipContentHash(data)!;
      return { ...base, hash, size: data.length, mtimeMs: rom.mtimeMs, build: rom.build, folder: rom.folder, ...(renamedFrom ? { renamedFrom } : {}) };
    } catch {
      // Damaged zip: stored as is rather than lost; a folder has nothing to store.
      if (item.isDir) return undefined;
    }
  }
  const file = romFile(item.path);
  if (!file) return undefined;
  return { ...base, hash: romHash(file), size: file.size, mtimeMs: file.mtimeMs, ...(renamedFrom ? { renamedFrom } : {}) };
}

/** Known ROM names: those of the VPS database, and the old VPinMAME names. */
function knownRoms(vps?: VpsDb): Set<string> {
  const names = new Set<string>();
  for (const [alias, rom] of HISTORIC_ROM_ALIASES) {
    names.add(alias.toLowerCase());
    names.add(rom.toLowerCase());
  }
  for (const g of vps?.games ?? []) for (const r of g.romFiles ?? []) if (r.version?.trim()) names.add(r.version.trim().toLowerCase());
  return names;
}

/**
 * ROM of a .zip: its name from its content (archive "T2 ROM.zip" that contains
 * t2_l8.rom), and its chips to put back at the root if they are in a subfolder.
 * A file that is not a readable zip keeps its name and stays as is.
 */
function describeRomZip(file: string, hints: RomHints): RomItem {
  const stem = path.basename(file).replace(/\.zip$/i, '');
  const mtimeMs = romFile(file)?.mtimeMs ?? 0;
  const entries = readZipEntries(file);
  const content = entries && romContent(entries.map((e) => e.name));
  if (!content) return { name: stem, mtimeMs };
  const folders = content.dir ? content.dir.split('/').reverse() : [];
  const name = recognizeRomName({ names: [path.basename(file), ...folders], chips: content.chips }, hints, true) ?? stem;
  if (!content.dir) return { name, mtimeMs };
  return { name, mtimeMs, folder: content.dir, build: content.chips.map((c) => ({ from: file, entry: c, name: path.basename(c) })) };
}

/**
 * Folder that contains only an unpacked ROM (its chips, in a single folder):
 * its name comes from the folder, from the archive it comes out of or from the chips; without a
 * recognised name (ROM asked for by a table, known ROM), guess accepts a name that looks like a ROM.
 */
function romFolder(dir: string, names: string[], hints: RomHints, guess: boolean): RomItem | undefined {
  const rel = listRelative(dir, 64);
  const content = rel && romContent(rel);
  if (!content) return undefined;
  const folders = content.dir ? content.dir.split('/').reverse() : [];
  const name = recognizeRomName({ names: [...names, ...folders], chips: content.chips }, hints, guess);
  if (!name) return undefined;
  const chips = content.chips.map((c) => path.join(dir, ...c.split('/')));
  return {
    name,
    mtimeMs: Math.max(...chips.map((c) => romFile(c)?.mtimeMs ?? 0)),
    folder: content.dir || path.basename(dir),
    build: chips.map((c) => ({ from: c, name: path.basename(c) })),
  };
}

/** Stores a ROM of the plan in the library and links it into its tables (after applyImport of the tables). */
export function applyRomImport(rom: RomImport, ctx: ImportContext): void {
  applyOps(rom.ops, ctx);
  for (const from of [rom.versions[rom.keep]?.from, ...rom.unused.map((u) => u.from)]) {
    if (!from) continue;
    const root = ctx.cleanupRoots.find((r) => isInside(from, r));
    if (root) pruneEmptyDirs(path.dirname(from), root);
  }
}

function collect(src: ImportSource, pkg: number, items: Item[], ignored: string[], dmdFolders: string[], hints: RomHints): void {
  const label = src.label ?? path.basename(src.path);
  const unpacked = Boolean(src.unpacked);
  const owner = { ...(src.owner ? { owner: src.owner } : {}), ...(src.link && src.mode === 'copy' ? { link: true } : {}) };
  const excluded = (p: string) => src.exclude?.some((x) => samePath(x, p) || isInside(p, x)) ?? false;
  const push = (p: string, dir: boolean, kind: FileKind, parents: string[], source: string, media?: RecognizedMedia) => {
    if (excluded(p)) return;
    // Archive that is not a PinMAME ROM: never stored as a ROM. In a "roms" folder
    // (Spike 2 image of VPinSPA, VPinMame\roms\spagb100.zip), it keeps its place; elsewhere, it is
    // the archive the table comes from, or a spare backglass already unpacked next to it: left alone.
    if (kind === 'rom' && !dir && !isRomZip(p)) kind = parents.some((d) => d.toLowerCase() === 'roms') ? 'other' : 'ignored';
    if (kind === 'ignored') ignored.push(source);
    else {
      const rom = kind === 'rom' && !dir ? describeRomZip(p, hints) : undefined;
      items.push({ path: p, isDir: dir, kind, parents, pkg, source, mode: src.mode, unpacked, ...owner, ...(media ? { media } : {}), ...(rom ? { rom } : {}) });
    }
  };
  const pushRom = (p: string, parents: string[], source: string, rom: RomItem) =>
    items.push({ path: p, isDir: true, kind: 'rom', parents, pkg, source, mode: src.mode, unpacked, ...owner, rom });
  // Folders above a selection ("…\POPMedia\Visual Pinball X\Wheel"): they say how to read the media.
  const above = src.unpacked ? [] : path.resolve(src.path).split(/[\\/]+/).filter(Boolean).slice(0, -1);
  if (!isDir(src.path)) {
    const name = path.basename(src.path);
    const media = src.unpacked ? undefined : recognizeMedia(name, mediaFolder(above.at(-1) ?? '', above.slice(0, -1)));
    // Settings of a ROM taken alone from VPinMAME\cfg (installation.ts): stored in the table's pinmame\cfg, where PinMAME reads them.
    if (!src.unpacked && /\.cfg$/i.test(name) && above.at(-1)?.toLowerCase() === 'cfg') return push(src.path, false, 'pinmame', ['pinmame', 'cfg'], label);
    push(src.path, false, media ? 'media' : classifyFile(name), [], label, media);
    return;
  }
  const isDmdFolder = (name: string) => dmdFolders.some((d) => d.toLowerCase() === name.toLowerCase());
  const start = src.unpacked || isDmdFolder(path.basename(src.path)) ? undefined : mediaFolder(path.basename(src.path), above);
  // The folder above counts: "PUPVideos\TheMatrix", "VPinMAME\altsound\t2_l8" chosen alone.
  const own = src.unpacked || start ? undefined : classifyDir(path.basename(src.path), src.path, above.slice(-1), dmdFolders);
  const context = src.unpacked ? [] : [...above, path.basename(src.path)];
  if (own) {
    push(src.path, true, own, [], label);
    return;
  }
  // Archive that directly contains the pack (screens.pup at its root): it gives the pack its name.
  if (src.unpacked && isPackRoot(src.path) && !fs.readdirSync(src.path).some((f) => f.toLowerCase().endsWith('.vpx'))) {
    items.push({ path: src.path, isDir: true, kind: 'pup', parents: [], pkg, source: label, mode: src.mode, unpacked, ...owner, name: label.replace(/\.(zip|7z|rar)$/i, '') });
    return;
  }
  // Archive (.7z, .rar) or folder that contains only a ROM: its chips will make a flat zip.
  const whole = romFolder(src.path, [src.unpacked ? label : path.basename(src.path)], hints, true);
  if (whole) {
    pushRom(src.path, [], label, whole);
    return;
  }
  // Media stored the Popper way, the PinballX way or in medias\ are read file by file.
  const walk = (dir: string, parents: string[], folder?: MediaFolder) => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const siblings = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    for (const dirent of dirents) {
      const p = path.join(dir, dirent.name);
      const source = [label, ...parents, dirent.name].join(' › ');
      if (excluded(p)) continue;
      if (dirent.isDirectory()) {
        const inner = folder
          ? mediaSubFolder(folder, dirent.name)
          : isDmdFolder(dirent.name)
            ? undefined
            : mediaFolder(dirent.name, [...context, ...parents], siblings);
        if (inner) {
          walk(p, [...parents, dirent.name], inner);
          continue;
        }
        const kind = classifyDir(dirent.name, p, parents, dmdFolders);
        // Folder of chips ("t2_l8", "roms\t2_l8"): a ROM, never scattered in the table.
        const rom = kind ? undefined : romFolder(p, [dirent.name], hints, (parents.at(-1) ?? '').toLowerCase() === 'roms');
        if (kind) push(p, true, kind, parents, source);
        else if (rom) pushRom(p, parents, source, rom);
        else walk(p, [...parents, dirent.name]);
      } else {
        const media = recognizeMedia(dirent.name, folder);
        push(p, false, media ? 'media' : classifyFile(dirent.name, parents), parents, source, media);
      }
    }
  };
  walk(src.path, [], start);
}

/** The .vpx files of a same game (same title, or same package) make up a single table. */
function groupGames(vpx: Item[], items: Item[], packages: { name: string; isPack: boolean }[], opts: PlanOptions): Game[] {
  const groups: Item[][] = [];
  for (const item of vpx) {
    const key = vpxKey(item);
    const group = groups.find((g) => g.some((o) => vpxKey(o) === key || (o.pkg === item.pkg && packages[item.pkg]!.isPack)));
    if (group) group.push(item);
    else groups.push([item]);
  }
  const games = groups.map((group) => describeGame(group, items, packages, opts));
  // Existing tables: an addition (ROM alone, PuP videos...) may be intended for them.
  for (const known of opts.existing ?? []) {
    if (games.some((g) => samePath(g.folder, known.folder))) continue;
    games.push({
      vpx: [],
      others: [],
      key: nameKey(known.title),
      title: known.title,
      folderName: path.basename(known.folder),
      folder: known.folder,
      isNew: false,
      roms: known.roms,
      dmdFolders: known.dmdFolder ? [known.dmdFolder] : [],
      pupNames: known.pupNames ?? [],
      vpsId: known.vpsId,
      pupOff: known.pupOff,
    });
  }
  return games;
}

function vpxKey(item: Item): string {
  return nameKey(parseTableName(path.basename(item.path, path.extname(item.path))).title);
}

function describeGame(vpx: Item[], items: Item[], packages: { name: string; isPack: boolean }[], opts: PlanOptions): Game {
  const candidates = [
    ...vpx.map((v) => path.basename(v.path, path.extname(v.path))),
    ...new Set(vpx.filter((v) => packages[v.pkg]!.isPack).map((v) => packages[v.pkg]!.name.replace(/\.(zip|7z|rar)$/i, ''))),
    ...vpx.flatMap((v) => v.parents),
  ].map(parseTableName);
  // The most complete name (manufacturer and year), then the most readable (with spaces).
  const best = [...candidates].sort((a, b) => score(b) - score(a))[0]!;
  const manufacturer = best.manufacturer ?? candidates.find((c) => c.manufacturer)?.manufacturer;
  const year = best.year ?? candidates.find((c) => c.year)?.year;
  const fromFiles = { title: best.title, manufacturer, year, folderName: tableFolderName(best.title, manufacturer, year) };
  const roms = [...new Set(vpx.flatMap((v) => opts.scripts?.get(v.path.toLowerCase())?.roms ?? []))];
  const dmdFolders = vpx.map((v) => opts.scripts?.get(v.path.toLowerCase())?.dmdFolder).filter((d): d is string => Boolean(d));
  const pupNames = uniqueNames(vpx.flatMap((v) => expectedPackNames(opts.scripts?.get(v.path.toLowerCase()))));
  const vps = opts.vps ? describeVps(vpx, items, packages, roms, fromFiles, opts) : undefined;
  // The VPS game kept gives the name; otherwise, the one deduced from the files.
  const game = vps?.chosen?.game;
  const named = game ? { title: game.name, manufacturer: game.manufacturer, year: game.year } : fromFiles;
  const folderName = tableFolderName(named.title, named.manufacturer, named.year);
  const keys = [nameKey(named.title), nameKey(fromFiles.title)];
  const folders = [folderName, fromFiles.folderName].map((f) => f.toLowerCase());
  const known = (opts.existing ?? []).find(
    (k) => (game && k.vpsId === game.id) || folders.includes(path.basename(k.folder).toLowerCase()) || keys.includes(nameKey(k.title)),
  );
  return {
    vpx,
    others: [],
    key: nameKey(fromFiles.title),
    title: known?.title ?? named.title,
    manufacturer: named.manufacturer,
    year: named.year,
    folderName: known ? path.basename(known.folder) : folderName,
    folder: known?.folder ?? path.join(opts.tablesDir, folderName),
    isNew: !known,
    roms: [...new Set([...roms, ...(known?.roms ?? [])])],
    dmdFolders: [...new Set([...dmdFolders, ...(known?.dmdFolder ? [known.dmdFolder] : [])])],
    pupNames: uniqueNames([...pupNames, ...(known?.pupNames ?? [])]),
    vps,
    vpsId: game?.id ?? known?.vpsId,
    pupOff: known?.pupOff,
  };
}

/** VPS game of a table: recognised from its files and its ROM, or chosen by the user. */
function describeVps(
  vpx: Item[],
  items: Item[],
  packages: { name: string; isPack: boolean }[],
  roms: string[],
  fromFiles: TableVps['fromFiles'],
  opts: PlanOptions,
): TableVps {
  const pkgs = new Set(vpx.map((v) => v.pkg));
  // The backglass of the same package often carries the full name ("Terminator2(Williams1991)").
  const backglasses = items.filter((i) => i.kind === 'backglass' && pkgs.has(i.pkg) && packages[i.pkg]!.isPack);
  const names = [
    ...vpx.map((v) => path.basename(v.path)),
    ...backglasses.map((b) => path.basename(b.path)),
    ...[...pkgs].filter((p) => packages[p]!.isPack).map((p) => packages[p]!.name),
    ...vpx.flatMap((v) => v.parents),
  ];
  const match = matchVps(opts.vps!, { names, roms });
  const key = vpx[0]!.path.toLowerCase();
  const choice = opts.vpsChoices?.get(key);
  let chosen = match.confident ? match.candidates[0] : undefined;
  if (choice === null) chosen = undefined;
  else if (choice) {
    const game = opts.vps!.games.find((g) => g.id === choice);
    chosen = match.candidates.find((c) => c.game.id === choice) ?? (game ? { game, score: 0 } : chosen);
  }
  return { key, candidates: match.candidates, confident: match.confident, chosen, decided: choice !== undefined, fromFiles };
}

function score(p: { title: string; manufacturer?: string; year?: number }): number {
  return (p.manufacturer ? 4 : 0) + (p.year ? 4 : 0) + (p.title.includes(' ') ? 2 : 0) + Math.min(p.title.length, 40) / 100;
}

function assign(item: Item, games: Game[], packages: { name: string; isPack: boolean }[], vps?: VpsDb): Game | undefined {
  // 1. In the same package as a single table.
  const inPackage = games.filter((g) => g.vpx.some((v) => v.pkg === item.pkg));
  if (inPackage.length === 1 && packages[item.pkg]!.isPack) return inPackage[0];
  if (item.media) return assignMedia(item.media, games, vps);
  // 2. Named like the ROM of a table (ROM, colours, alternative sounds, PuP videos),
  // or like the pack its script loads.
  const name = (item.kind === 'pup' ? packOrigin(item) : (item.rom?.name ?? path.basename(item.path).replace(/\.[^.]+$/, ''))).toLowerCase();
  const parent = (item.parents.at(-1) ?? '').toLowerCase();
  const byRom = games.find((g) => g.roms.some((r) => r.toLowerCase() === name || (parent && r.toLowerCase() === parent)));
  if (byRom) return byRom;
  // DMD folder loaded by a table's script, even if named a little differently ("GooniesDMD").
  if (item.kind === 'dmdFolder') {
    const own = dmdStem(path.basename(item.path));
    const close = (d: string) => {
      const wanted = dmdStem(d);
      return wanted === own || (Math.min(wanted.length, own.length) >= 4 && (wanted.includes(own) || own.includes(wanted)));
    };
    const byDmd =
      games.find((g) => g.dmdFolders.some((d) => d.toLowerCase() === path.basename(item.path).toLowerCase())) ??
      games.find((g) => g.dmdFolders.some(close));
    if (byDmd) return byDmd;
  }
  if (item.kind === 'pup') {
    const byPack = games.find((g) => g.pupNames.some((n) => n.toLowerCase() === name));
    if (byPack) return byPack;
  }
  // 3. Named like the table.
  const key = nameKey(parseTableName(name).title);
  if (key.length >= 3) {
    const byName = games.find((g) => g.key.length >= 3 && (key === g.key || key.startsWith(g.key) || g.key.startsWith(key)));
    if (byName) return byName;
  }
  // 4. A single new table in the import: everything goes to it.
  const fresh = games.filter((g) => g.isNew);
  return fresh.length === 1 ? fresh[0] : undefined;
}

/**
 * Game of a media file from the name it carries (game name with Popper and PinballX,
 * "(Type) <name>", table folder for VPinFE): name of a .vpx or of the
 * folder, ROM, title, game recognised by the VPS database. A media file named after a
 * game absent from the import stays where it is; a media file without a game name (bg.png
 * alone) goes to the only new table of the import.
 */
function assignMedia(media: RecognizedMedia, games: Game[], vps?: VpsDb): Game | undefined {
  const names = mediaGameNames(media.game);
  if (!names.length) {
    const fresh = games.filter((g) => g.isNew);
    return fresh.length === 1 ? fresh[0] : undefined;
  }
  const lower = names.map((n) => n.toLowerCase());
  const only = (found: Game[]) => (found.length === 1 ? found[0] : undefined);
  const stem = (v: Item) => path.basename(v.path, path.extname(v.path)).toLowerCase();
  const byName = only(games.filter((g) => lower.includes(g.folderName.toLowerCase()) || g.vpx.some((v) => lower.includes(stem(v)))));
  if (byName) return byName;
  const byRom = only(games.filter((g) => g.roms.some((r) => lower.includes(r.toLowerCase()))));
  if (byRom) return byRom;
  for (const n of names) {
    const key = nameKey(parseTableName(n).title);
    if (key.length < 3) continue;
    const byTitle =
      only(games.filter((g) => key === g.key || key === nameKey(g.title))) ??
      only(games.filter((g) => g.key.length >= 3 && (key.startsWith(g.key) || g.key.startsWith(key))));
    if (byTitle) return byTitle;
  }
  if (vps) {
    for (const n of names) {
      const m = matchVps(vps, { names: [n] });
      const byVps = m.confident ? only(games.filter((g) => g.vpsId === m.candidates[0]!.game.id)) : undefined;
      if (byVps) return byVps;
    }
  }
  return undefined;
}

/** Name of a DMD folder without its suffix: "TheGooniesDMD" → "thegoonies". */
function dmdStem(name: string): string {
  return nameKey(name).replace(/(ultradmd|flexdmd|dmd)$/, '');
}

/** linkedRoms: ROMs (keys) that the library will link into this table. */
function buildTablePlan(game: Game, opts: PlanOptions, linkedRoms: string[] = []): TablePlan {
  const steps: ImportStep[] = [];
  const warnings: string[] = [];
  const infoSources: TablePlan['infoSources'] = [];
  const vpxBases = [
    ...game.vpx.map((v) => path.basename(v.path, path.extname(v.path)).toLowerCase()),
    ...listSafe(game.folder)
      .filter((f) => f.toLowerCase().endsWith('.vpx'))
      .map((f) => f.slice(0, -4).toLowerCase()),
  ];
  const add = (item: Item, target: string, from = item.path): ImportStep | undefined => {
    const to = path.join(game.folder, target);
    if (steps.some((s) => samePath(s.to, to))) {
      warnings.push(t('{source} : un autre fichier va déjà à « {target} », celui-ci reste où il est.', { source: item.source, target }));
      return undefined;
    }
    const base = path.basename(from);
    const step: ImportStep = {
      kind: item.kind,
      from,
      source: item.source,
      to,
      target,
      mode: item.mode,
      ...(item.link ? { link: true } : {}),
      isDir: item.isDir,
      renamed: path.basename(target) !== base,
      replaces: fs.existsSync(to),
    };
    steps.push(step);
    return step;
  };
  // A file without a known place keeps its position relative to the .vpx of its package:
  // a subfolder that the script loads (images, sounds, DMD) is not emptied into the root.
  const keepPlace = (item: Item, name: string): string => {
    const home = game.vpx
      .filter((v) => v.pkg === item.pkg && v.parents.length <= item.parents.length && v.parents.every((p, i) => p.toLowerCase() === item.parents[i]!.toLowerCase()))
      .sort((a, b) => b.parents.length - a.parents.length)[0];
    if (home) return path.join(...item.parents.slice(home.parents.length), name);
    if (item.parents.length) {
      warnings.push(t('« {name} » était dans « {folder} » : il est rangé à la racine de la table. Si la table ne le trouve pas, range-le à la main.', { name, folder: item.parents.join('\\') }));
    }
    return name;
  };

  // The .info is named like the folder: it applies to all the versions.
  const infoFile = path.join(game.folder, `${game.folderName}.info`);
  const info: TableInfoFile = readInfo(infoFile);

  for (const item of game.vpx) add(item, path.basename(item.path));

  // Backglass: the one named like a table stays as is; the best of the
  // others takes the folder's name, shared between all the versions of the table.
  const b2s = game.others.filter((i) => i.kind === 'backglass');
  const named = b2s.filter((i) => vpxBases.includes(path.basename(i.path, path.extname(i.path)).toLowerCase()));
  for (const item of named) add(item, path.basename(item.path));
  const rest = b2s.filter((i) => !named.includes(i));
  if (rest.length) {
    const bestName = bestMatch(
      rest.map((i) => path.basename(i.path)),
      [game.title, ...game.vpx.map((v) => path.basename(v.path))],
    );
    const best = rest.find((i) => path.basename(i.path) === bestName)!;
    if (!named.length) add(best, `${game.folderName}.directb2s`);
    for (const item of rest.filter((i) => named.length || i !== best)) {
      warnings.push(t("Backglass supplémentaire « {name} » : VPX ne l'affichera pas, il est rangé quand même.", { name: path.basename(item.path) }));
      add(item, path.basename(item.path));
    }
  }

  const incomingMedias: IncomingMedia[] = [];
  for (const item of game.others) {
    const name = path.basename(item.path);
    const stem = name.replace(/\.[^.]+$/, '');
    switch (item.kind) {
      case 'backglass':
        break;
      case 'rom': {
        // Without a library, the ROM goes into the table; rebuilt flat if its chips were in a folder.
        const step = add(item, path.join('pinmame', 'roms', item.rom ? `${item.rom.name}.zip` : name));
        if (step && item.rom?.build) {
          step.zip = { files: item.rom.build, mtimeMs: item.rom.mtimeMs, trashSource: item.mode === 'move' && !item.unpacked };
          step.isDir = false;
          warnings.push(t('ROM « {rom} » reconnue dans le dossier « {folder} » : refaite à plat dans pinmame\\roms, comme PinMAME la lit.', { rom: item.rom.name, folder: item.rom.folder ?? '' }));
        }
        break;
      }
      case 'nvram':
        add(item, path.join('pinmame', 'nvram', name));
        break;
      case 'pinmame': {
        const at = item.parents.findIndex((p) => p.toLowerCase() === 'pinmame');
        add(item, path.join('pinmame', ...item.parents.slice(at + 1), name));
        break;
      }
      case 'pup':
        planPack(item, game, opts, info, add);
        break;
      case 'altsound':
        add(item, path.join('altsound', name));
        break;
      case 'serum':
      case 'vni': {
        // Rangées sous le nom de la ROM jouée, avec les noms de fichiers que VPX lit (dmdcolors.ts) :
        // une colorisation PIN2DMD déposée seule finissait dans vni\pin2dmd, jamais chargée.
        const played = game.roms.length === 1 ? game.roms[0] : game.roms.find((r) => linkedRoms.includes(romKey(r)) || game.others.some((o) => o.kind === 'rom' && o.rom?.name.toLowerCase() === r.toLowerCase()));
        add(item, colorImportTarget(item.kind, name, item.isDir, game.roms, played));
        break;
      }
      case 'media':
        // Recognised media: renamed "(Type) <folder>", further down with the others of the same type.
        if (item.media) incomingMedias.push({ from: item.path, source: item.source, media: item.media });
        else add(item, item.isDir ? 'medias' : path.join('medias', name));
        break;
      case 'music':
        // "music" folder: it becomes the table's one; a subfolder (VisualPinball\Music\Akira) keeps its name there,
        // as the script asks for it (PlayMusic "Akira\track.mp3").
        add(item, item.isDir ? (name.toLowerCase() === 'music' ? 'music' : path.join('music', name)) : path.join('music', ...musicParents(item.parents), name));
        break;
      case 'script':
        if (!item.isDir && vpxBases.includes(stem.toLowerCase())) {
          item.kind = 'scriptOverride';
          warnings.push(t("« {name} » remplace le script de la table : garde-le seulement si l'auteur le demande.", { name }));
          add(item, name);
        } else add(item, item.isDir ? 'scripts' : path.join('scripts', name));
        break;
      case 'tableIni':
      case 'pov': {
        // Un POV en .ini (« <table> POV.ini ») garde un nom de POV : il ne prend jamais la place du .ini de la table,
        // dont le médecin reprend seulement la vue (povview.ts).
        if (item.kind === 'pov' && /\.ini$/i.test(name)) add(item, game.vpx.length === 1 ? `${path.basename(game.vpx[0]!.path, '.vpx')} POV.ini` : name);
        else if (vpxBases.includes(stem.toLowerCase())) add(item, name);
        else if (game.vpx.length === 1 && nameKey(parseTableName(stem).title).startsWith(game.key.slice(0, 4))) {
          add(item, `${path.basename(game.vpx[0]!.path, '.vpx')}${path.extname(name)}`);
        } else add(item, name);
        break;
      }
      case 'info':
        infoSources.push({ from: item.path, mode: item.mode });
        break;
      case 'user':
        add(item, 'user');
        break;
      case 'dmdFolder':
        // The script loads a precise name: a folder named otherwise ("GooniesDMD") takes this name.
        add(item, item.isDir && game.dmdFolders.length === 1 ? game.dmdFolders[0]! : keepPlace(item, name));
        break;
      default:
        add(item, keepPlace(item, name));
    }
  }

  // Media: one per type (all the pages of the flyer and of the rules), the old one of the same type to the recycle bin.
  if (incomingMedias.length) {
    const vpxNames = [...new Set([...game.vpx.map((v) => path.basename(v.path, path.extname(v.path))), ...listSafe(game.folder).filter((f) => /\.vpx$/i.test(f)).map((f) => f.slice(0, -4))])];
    const dest = { dir: path.join(game.folder, 'medias'), name: game.folderName, names: [game.folderName, ...vpxNames] };
    const { planned, skipped } = arrangeMedias(dest, incomingMedias);
    for (const m of planned) {
      const item = game.others.find((i) => i.path === m.from)!;
      const step = add(item, path.join('medias', m.target));
      if (!step) continue;
      step.media = { type: m.type, page: m.page, frontend: m.frontend, trash: m.trash };
      step.replaces = m.replaces;
    }
    for (const s of skipped) warnings.push(t('{source} : {reason}', { source: s.source, reason: s.reason }));
  }

  for (const src of infoSources) {
    const extra = readInfo(src.from);
    info.Info = { ...extra.Info, ...info.Info };
    if (extra.User && !info.User) info.User = extra.User;
    // The favourite of an installation taken over applies here, even when the table already has its statistics.
    else info.User = mergeFavorite(info, extra).User;
  }
  info.Info = { ...info.Info };
  info.Info.Title ??= game.title;
  if (game.manufacturer) info.Info.Manufacturer ??= game.manufacturer;
  if (game.year) info.Info.Year ??= game.year;
  if (game.vps?.chosen) {
    const { game: vps, table } = game.vps.chosen;
    info.Info.VPSId ??= vps.id;
    if (table?.authors?.length) info.Info.Authors ??= [...table.authors];
    const ipdb = ipdbIdOf(vps);
    if (ipdb) info.Info.IPDBId ??= ipdb;
  }
  // Option and original name of each pack: the option is applied again when the pack is updated.
  for (const pack of steps.flatMap((s) => (s.pack ? [s.pack] : []))) {
    const memory = { ...(pack.choice.chosen ? { option: pack.choice.chosen.label } : {}), origin: pack.origin };
    info.CyberPinball = setPupMemory(info, pack.name, memory).CyberPinball;
  }

  // Takeover from another installation: what it said about the ROM of these .vpx files.
  const reports = (opts.companions ?? []).filter((r) => game.vpx.some((v) => samePath(v.path, r.vpx)));
  const romsPresent = [...steps.filter((s) => s.kind === 'rom').map((s) => path.basename(s.to, '.zip').toLowerCase()), ...linkedRoms];
  const romsInstalled = listSafe(path.join(game.folder, 'pinmame', 'roms')).map((f) => f.replace(/\.zip$/i, '').toLowerCase());
  const present = (n: string) => romsPresent.includes(n.toLowerCase()) || romsInstalled.includes(n.toLowerCase());
  // An alias is written only if its ROM arrives and the one asked for is not there: it would take precedence over it.
  const romAliases: AliasLine[] = [];
  for (const a of reports.flatMap((r) => r.romAliases ?? [])) {
    if (present(a.rom) && !present(a.alias) && !romAliases.some((x) => x.alias.toLowerCase() === a.alias.toLowerCase())) romAliases.push(a);
  }
  const has = (r: string) => present(r) || romAliases.some((a) => a.alias.toLowerCase() === r.toLowerCase());
  const romOk = !game.roms.length || game.roms.some(has);
  if (!romOk) warnings.push(t("La ROM « {rom} » n'est pas dans l'import : la table ne démarrera pas sans elle.", { rom: game.roms[0]! }));
  // The game page will say where the ROM was looked for at the takeover; a ROM arrived since erases the note.
  const search = reports.find((r) => r.romSearch)?.romSearch;
  const cp = { ...((info.CyberPinball as Record<string, unknown> | undefined) ?? {}) };
  if (search && !romOk) cp.RomSearch = { Roms: search.roms, Dirs: search.dirs, From: search.from };
  else delete cp.RomSearch;
  if (Object.keys(cp).length) info.CyberPinball = cp;
  else delete info.CyberPinball;
  if (!game.isNew && !game.vpx.length && !steps.length) warnings.push(t('Rien à ajouter à cette table.'));
  const scripts = planScriptPatches(game, steps, opts, warnings);

  return {
    title: info.Info.Title ?? game.title,
    manufacturer: game.manufacturer,
    year: game.year,
    folderName: game.folderName,
    folder: game.folder,
    isNew: game.isNew && !fs.existsSync(game.folder),
    steps,
    infoFile,
    info,
    infoSources,
    roms: game.roms,
    warnings,
    vps: game.vps,
    scripts,
    ...(romAliases.length ? { romAliases } : {}),
  };
}

/**
 * PuP-Pack turned off by the script ("usePUP = False"): turned on in a .vbs put next to
 * the table (scriptpatch.ts), without touching the table, as soon as the pack is there. When
 * a table is updated, the Cyber Pinball .vbs is rebuilt from the new script,
 * or removed if it is no longer of use. A .vbs from elsewhere is never replaced.
 */
function planScriptPatches(game: Game, steps: ImportStep[], opts: PlanOptions, warnings: string[]): ScriptPatchPlan[] {
  // A disabled pack (pupdisabled.ts) does not count: nothing is turned on for it.
  const packs = [...steps.flatMap((s) => (s.pack && !s.pack.disabled ? [s.pack.name] : [])), ...listSafe(path.join(game.folder, PUP_FOLDER))].map((n) => n.toLowerCase());
  const incoming = steps.flatMap((s) => (s.pack && !s.pack.disabled ? [s.pack.name.toLowerCase()] : []));
  const disabledNames = disabledPacks(game.folder).map((n) => n.toLowerCase());
  const out: ScriptPatchPlan[] = [];
  /**
   * Does the pack the table will load occupy the DMD window? From the option kept for
   * an arriving pack, otherwise from the pack already stored; then the PuP-DMD is turned on with it.
   */
  const drawsDmd = (names: string[]): boolean => {
    if (opts.cabinet && !opts.cabinet.dmd) return false;
    const same = (n: string) => names.some((m) => m.toLowerCase() === n.toLowerCase());
    const step = steps.find((s) => s.pack && same(s.pack.name));
    if (step?.pack) return step.pack.choice.chosen?.traits.windows?.dmd ?? packDrawsDmd(step.from);
    const there = listSafe(path.join(game.folder, PUP_FOLDER)).find(same);
    return there !== undefined && packDrawsDmd(path.join(game.folder, PUP_FOLDER, there));
  };
  const consider = (source: string, vpx: string, names: string[], off: boolean, packsThere: string[]) => {
    const to = vpx.replace(/.vpx$/i, '.vbs');
    const file = path.basename(to);
    if (steps.some((s) => samePath(s.to, to))) return;
    const existing = readLatin1(to);
    const own = existing !== undefined ? readScriptPatch(existing) : undefined;
    const ours = own !== undefined;
    if (existing !== undefined && !ours) return;
    // The script is read again when the pack is there, even if a kept reading saw nothing turned off.
    const packThere = names.some((n) => packsThere.includes(n.toLowerCase()));
    if (!packThere && !ours) return;
    const script = readVpxScript(source);
    // Disabled pack: the table is played with its script as is, without a switch turned on.
    const disabledHere = !packThere && names.some((n) => disabledNames.includes(n.toLowerCase()));
    const switches = script !== undefined && !disabledHere ? pupSwitchesToEnable(scriptCode(script), drawsDmd(names)) : [];
    const wanted = packThere && (off || switches.length > 0);
    if (!wanted && !ours) return;
    const sw = switches[0];
    // The fixes for core.vbs (scriptcompat.ts) follow the rebuilt .vbs; alone, they keep it.
    const compat = script !== undefined ? [...new Set([...compatFixesFound(scriptCode(script)), ...compatFixesApplicable(own?.compat ?? [], scriptCode(script))])] : [];
    if (!switches.length && compat.length) {
      const kept = buildScriptPatch(script!, [], undefined, undefined, compat);
      if (kept !== undefined && kept !== existing) out.push({ to, content: kept });
      return;
    }
    const content = script !== undefined && switches.length ? buildScriptPatch(script, switches, undefined, undefined, compat) : undefined;
    if (content !== undefined && content === existing) return;
    const params = { table: game.title, file, values: describeSwitches(switches, 'value'), enables: describeSwitches(switches, 'enable') };
    if (content) {
      out.push({ to, content });
      warnings.push(t('Le script de « {table} » coupe le PuP-Pack ({values}) : Cyber Pinball l’allume dans {file}, sans modifier la table.', params));
    } else if (ours) {
      out.push({ to });
      warnings.push(
        disabledHere
          ? t('{file}, écrit par Cyber Pinball pour le PuP-Pack, part à la corbeille : le pack de « {table} » est désactivé.', params)
          : t('{file}, écrit par Cyber Pinball pour l’ancienne version de la table, part à la corbeille : le nouveau script ne coupe plus le PuP-Pack.', params),
      );
    } else if (sw) {
      warnings.push(t('Le script de « {table} » coupe le PuP-Pack ({values}) : mets {enables} dans son script.', params));
    } else if (wanted) {
      warnings.push(t('Le script de « {table} » coupe le PuP-Pack : il faudra l’allumer dans son script.', params));
    }
  };
  for (const step of steps.filter((s) => s.kind === 'table')) {
    const facts = opts.scripts?.get(step.from.toLowerCase());
    consider(step.from, step.to, expectedPackNames(facts), Boolean(facts?.pup?.disabledBy), packs);
  }
  // Table already installed: only if the pack arrives with this import.
  for (const vpx of game.pupOff ?? []) {
    if (steps.some((s) => s.kind === 'table' && samePath(s.to, vpx))) continue;
    consider(vpx, vpx, game.pupNames, true, incoming);
  }
  return out;
}

function readLatin1(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'latin1');
  } catch {
    return undefined;
  }
}

export interface ImportContext extends OpContext {
  /** Source folders to clean up once emptied (import folder, unpacking folder). */
  cleanupRoots: string[];
}

/** Runs the approved plan of a table. */
export function applyImport(plan: TablePlan, ctx: ImportContext): void {
  fs.mkdirSync(plan.folder, { recursive: true });
  const ops: FileOp[] = [];
  for (const s of plan.steps) {
    // A pack is replaced as a whole: never a mix of old and new files.
    if (s.pack?.replaces && fs.existsSync(s.pack.replaces)) ops.push({ op: 'trash', path: s.pack.replaces });
    for (const old of s.media?.trash ?? []) if (fs.existsSync(old)) ops.push({ op: 'trash', path: old });
    if (s.zip) {
      ops.push({ op: 'zip', to: s.to, files: s.zip.files, mtimeMs: s.zip.mtimeMs });
      if (s.zip.trashSource) ops.push({ op: 'trash', path: s.from });
      continue;
    }
    ops.push(transferOp(s.mode, s.from, s.to, s.link));
    if (s.pack) ops.push(...packOps(s.to, s.pack));
  }
  applyOps(ops, ctx);
  applyOps(
    (plan.scripts ?? []).map((s): FileOp => (s.content !== undefined ? { op: 'write', path: s.to, content: s.content, encoding: 'latin1' } : { op: 'trash', path: s.to })),
    ctx,
  );
  // ROM taken over under the name VPinMAME gave it (VPMAlias.txt, old name): the PinMAME plugin
  // of VPX only reads the table's pinmame\alias.txt, next to pinmame\roms.
  if (plan.romAliases?.length) {
    let text = readTableAliases(plan.folder).text;
    for (const a of plan.romAliases) text = withAlias(text, a.alias, a.rom, IMPORTED_ALIAS_COMMENT);
    fs.mkdirSync(path.dirname(tableAliasFile(plan.folder)), { recursive: true });
    writeFileAtomic(tableAliasFile(plan.folder), text);
  }
  writeFileAtomic(plan.infoFile, JSON.stringify(plan.info, null, 2) + '\n');
  for (const src of plan.infoSources) {
    if (src.mode === 'move' && fs.existsSync(src.from) && !samePath(src.from, plan.infoFile)) moveToTrash(src.from, ctx);
  }
  for (const step of [...plan.steps, ...plan.infoSources.map((s) => ({ from: s.from, mode: s.mode }))]) {
    if (step.mode !== 'move') continue;
    const root = ctx.cleanupRoots.find((r) => isInside(step.from, r));
    if (root) pruneEmptyDirs(path.dirname(step.from), root);
  }
}

/** Copy (linked or not) or move of an element of the import. */
function transferOp(mode: 'move' | 'copy', from: string, to: string, link?: boolean): FileOp {
  return mode === 'copy' && link ? { op: 'copy', from, to, link: true } : { op: mode, from, to };
}

/** Once the pack is in place: removal of the useless files, then the option kept, copied as its .bat would do. */
function packOps(dir: string, pack: PackPlan): FileOp[] {
  const v = pack.choice.chosen;
  return [
    ...pack.junk.map((j) => ({ op: 'delete' as const, path: path.join(dir, j) })),
    ...(v?.copies ?? []).map((c) => ({ op: 'copy' as const, from: path.join(dir, c.from), to: path.join(dir, c.to) })),
    ...(v?.deletes ?? []).map((d) => ({ op: 'trash' as const, path: path.join(dir, d) })),
    ...pack.renames.map((r) => ({ op: 'move' as const, from: path.join(dir, r.from), to: path.join(dir, r.to) })),
  ];
}

type AddStep = (item: Item, target: string, from?: string) => ImportStep | undefined;

/** Original name of a pack: the one of its real root, or of the archive that contained only it. */
function packOrigin(item: Item): string {
  const root = findPackRoot(item.path) ?? item.path;
  return item.name && samePath(root, item.path) ? item.name : path.basename(root);
}

/**
 * Stores a PuP-Pack in pupvideos\<expected name>: name read in the script (B2SInit,
 * then the ROM), nesting flattened, useless files removed, option chosen
 * by default from the cabinet or taken over from the previous installation.
 */
function planPack(item: Item, game: Game, opts: PlanOptions, info: TableInfoFile, add: AddStep): void {
  const root = findPackRoot(item.path) ?? item.path;
  const origin = packOrigin(item);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const expected = game.pupNames;
  const name = expected.find((n) => same(n, origin)) ?? expected[0] ?? origin;
  // A disabled pack stays so: its update is stored with it, never in pupvideos.
  const disabled = disabledPacks(game.folder).some((f) => same(f, name));
  const home = disabled ? PUP_DISABLED_FOLDER : PUP_FOLDER;
  const pupvideos = path.join(game.folder, home);
  const existing = listSafe(pupvideos).find((f) => same(f, name));
  const step = add(item, path.join(home, name), root);
  if (!step) return;
  const analysis = analysePack(root);
  const key = step.to.toLowerCase();
  const picked = opts.pupChoices?.get(key);
  const remembered = existing ? pupMemory(info, name)?.option : undefined;
  // An option that leaves the backglass to the .directb2s ("B2S Users") only applies if the table has one.
  const tableBackglass = game.others.some((i) => i.kind === 'backglass') || listSafe(game.folder).some((f) => f.toLowerCase().endsWith('.directb2s'));
  const cabinet = opts.cabinet && { ...opts.cabinet, tableBackglass };
  let choice = chooseVariant(analysis.variants, cabinet, remembered);
  const chosen = picked ? analysis.variants.find((v) => v.label === picked) : undefined;
  if (chosen) choice = { chosen, confident: true, reason: choice.reason };
  step.renamed = path.basename(step.to) !== origin;
  step.replaces = Boolean(existing);
  step.pack = {
    key,
    origin,
    name,
    nameFrom: expected.length ? 'script' : 'folder',
    expected,
    flattened: !samePath(root, item.path),
    replaces: existing ? path.join(pupvideos, existing) : undefined,
    ...(disabled ? { disabled } : {}),
    variants: analysis.variants,
    failedBats: analysis.bats.filter((b) => !b.ok),
    choice,
    decided: Boolean(chosen),
    junk: analysis.junk,
    noPupFiles: !analysis.pupFiles.length && !analysis.variants.length,
    renames: playlistRenames(root).map((r) => ({ from: r.from, to: r.to })),
  };
}

/** Folders of a track under "music" ("music\Akira"): kept, the script names them. */
function musicParents(parents: string[]): string[] {
  const at = parents.findIndex((p) => p.toLowerCase() === 'music');
  return at >= 0 ? parents.slice(at + 1) : [];
}

function uniqueNames(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  return out;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
