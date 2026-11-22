// Table diagnosis: spots what prevents a table from working properly and
// proposes a precise fix, which the user triggers themselves.
// The table script (ROM name) is read by the application with
// VPinballX -ExtractVBS; here we only interpret its text.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyOps, formatSize, isInside, safeName, sameVolume, sizeOf, type FileOp, type OpContext } from './fileops';
import { findMangledDirs } from './copytree';
import { formatDate, formatDateTime, formatList, t, tn } from './i18n';
import { IniDocument } from './ini';
import { flexAssets, musicNotFound, mutedAudioSettings } from './vpxgamelog';
import { slowTableFinding } from './slowtable';
import { scriptRuntimeFinding } from './scriptdiagnosis';
import { flexPrewarmFor, type FlexPrewarm } from './flexprewarm';
import { heavyDmdVideosFinding } from './dmdvideos';
import { isCurrentMediaError, mediaErrorsFile, readMediaErrors, type MediaErrorEntry, type MediaErrorKind } from './mediaerrors';
import {
  bestDmdMedia,
  dmdTypeForRatio,
  isAcceptedFormat,
  mediaFileName,
  mediaKind,
  mediaNames,
  mediaTypeFromFolder,
  mediaTypeFromVpinfe,
  mediaTypeInfo,
  MEDIA_TYPES,
  pageOf,
  parseMediaFileName,
  readMediaDimensions,
  tableMediaDir,
  UNREADABLE_FORMATS,
  type MediaDimensions,
  type MediaKind,
  type MediaType,
} from './medias';
import type { Rect, RoleId } from './model';
import { dressRecord, isDressWindow, tableDmdWindow } from './fulldmdframe';
import { dressHiddenFinding, type TableDressing } from './fulldmdtable';
import {
  analysePack,
  defaultScreensPup,
  appliedOption,
  cabinetFullDmd,
  chooseVariant,
  describePupCabinet,
  addPupLoader,
  describeSwitches,
  enablePupSwitch,
  expectedPackNames,
  findPackRoot,
  isVisible,
  packDrawsDmd,
  packScreens,
  captureTriggers,
  packDrivers,
  scriptB2sEvents,
  pupLoaderNeeded,
  pupScriptFacts,
  pupSwitchesToEnable,
  pupWindows,
  usesPinmameCode,
  dmdInBackglass,
  isBandCustomPos,
  parseScreens,
  relocateScreen,
  screenCustomPos,
  type PupPackInfo,
  type PupLoadFacts,
  type PupLoader,
  playlistRenames,
  screenRole,
  scoreVariant,
  variantTraitsLabel,
  type AppliedOption,
  type PupCabinet,
  type PupScriptFacts,
  type PupSwitch,
  type PupVariant,
  type PlaylistRename,
} from './puppack';
import { addCaptureWatch, backgroundTriggers, captureBlock, captureSettings, captureWatchLines, readCaptures, sameCapture, type CaptureBlocker } from './pupcapture';
import { buildScriptPatch, ownCapture, readScriptPatch, scriptPatchState, type ScriptPatchState } from './scriptpatch';
import { applyCompatFixes, compatFixesApplicable, compatFixesApplied, compatFixesForStop, compatFixesFound, compatFixesFromLog, vpmInitCallCount, vrRoomFlags, type CompatFix } from './scriptcompat';
import { aliasComment, aliasFor, historicAlias, IMPORTED_ALIAS_COMMENT, loadedRoms, neighbourRom, neighbourWarning, readTableAliases, romFamilyOf, tableAliasFile, withAlias, withoutAlias } from './romalias';
import { colorProblems } from './dmdcolors';
import { listRoms, romFile, sameRomContent, sameRomFile, storedRom } from './romlibrary';
import { isChipName, listRelative, readZipEntries, romContent, type RomZipMember } from './romzip';
import { companion, nameKey } from './tablefiles';
import { b2sWithoutBackglass } from './b2simage';
import { dofRomNumbers, tableDofIni, tableIniMasksGlobal, type DofSetup } from './dof';
import { playBlockers, playSeverity } from './playable';
import { isVpxTable, parseTableName, readInfo, type TableEntry } from './tables';
import { findTableIni } from './vpx-settings';
import { hasOwnCabinetView, importedViewFinding, touchesCabinetView } from './tableview';
import { povViewFinding } from './povview';
import { EDGE_LABELS } from './layout';
import { orientationFinding, type PlayfieldOrientation } from './sync';
import { vpxPlayedFlipperEdge } from './vpx';
import { scriptCode } from './vbscript';
import { cabinetDmdIni, cabinetDmdOptions, type CabinetDmdOption } from './tableoptions';
import { readVpxFileVersion, readVpxImageNames, readVpxScript, readVpxTableName } from './vpxinfo';
import { tableTooNew, tooNewAdvice, tooNewReason, withVpxChoice, type OtherVpx } from './autres-vpx';
import { describeRenames, emptyPlayedPlaylists, missingPackFiles, packFileFixes, type PackFileFixes } from './pupfiles';
import { activePacks, disabledPacks, isPupFolderName, packsOfTable, PUP_DISABLED_FOLDER, PUP_FOLDER, pupVideosDir } from './pupdisabled';
import { ratioLabel } from './zones';
import { tableHasVrRoom } from './vr';
import { isFactoryRomVolume, isLowRomVolume, romVolumeText, type RomVolumeStatus } from './romvolume';

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface Fix {
  /** What the fix does, told to the user before they trigger it. */
  label: string;
  ops: FileOp[];
}

/** All the rules of the table diagnosis; each has its trap table (doctor-traps.test.ts). */
export const FINDING_CODES = [
  'outsideFolder',
  'folderMangled',
  'scriptOverride',
  'scriptPatchStale',
  'scriptCoreCompat',
  'flexImagesLate',
  'dmdDesktopOption',
  'backglassMissing',
  'backglassMisnamed',
  'backglassStray',
  'backglassEmpty',
  'romMissing',
  'romMisplaced',
  'romUnknown',
  'romNotLinked',
  'romScattered',
  'romNested',
  'romCopy',
  'romAlias',
  'romAliasHistoric',
  'romAliasObsolete',
  'dmdFolderMissing',
  'dmdVideosHeavy',
  'scriptUnreadable',
  'scriptRuntimeError',
  'crashReport',
  'infoMissing',
  'pupMissing',
  'pupNotLoaded',
  'pupNested',
  'pupOrphan',
  'pupOptionNotApplied',
  'pupOptionUnsuited',
  'pupOptionMismatch',
  'pupNoScreens',
  'pupDisabledByScript',
  'pupNotDriven',
  'pupHidesDmd',
  'pupDmdInBackglass',
  'pupDmdBackToBackglass',
  'pupPlaylistOrder',
  'pupFileNames',
  'pupFilesMissing',
  'pupPlaylistsEmpty',
  'pupScreenAbsent',
  'pupPlayfieldScreen',
  'pupScriptDriven',
  'pupCaptureRom',
  'pupCaptureUnseen',
  'pupLog',
  'pupPackDisabled',
  'pupPackDisabledScript',
  'manualView',
  'importedView',
  'povView',
  'povOffered',
  'povWrongWay',
  'tableOrientation',
  'tableWindows',
  'fullDmdHidden',
  'mediaUnreadable',
  'mediaMisnamed',
  'mediaStray',
  'mediaRatio',
  'mediaDmdSwapped',
  'mediaHuge',
  'mediaDuplicate',
  'mediaPlaybackError',
  'dofNoConfig',
  'dofNoPinmame',
  'dofLocalIni',
  'slowTable',
  'screenCap',
  'lowRomVolume',
  'tableAudioMuted',
  'musicMissing',
  'dmdImagesMissing',
  'tableTooNew',
  'dmdColorsMisnamed',
  'dmdColorsOtherRom',
  'dmdColorsUnread',
] as const;

export interface Finding {
  code: (typeof FINDING_CODES)[number];
  severity: FindingSeverity;
  title: string;
  detail: string;
  fix?: Fix;
  /**
   * Low-key information: nothing to do in Cyber Pinball (proportions of a media, no backglass).
   * The Diagnostic view and the check of an added table show it apart, at the bottom ("À savoir"
   * (Good to know)), without "Ignorer" (Ignore): it does not clutter the findings to fix.
   */
  note?: boolean;
  /**
   * ROM findings: the ROM that is missing or must be linked (`rom`), and the neighbouring revision
   * present on the cabinet (`neighbour`), for the "Ce qu'il manque pour jouer" (What is missing to
   * play) journey (journey.ts).
   */
  rom?: string;
  neighbour?: string;
}

/** What we learnt from the table script. */
export interface ScriptFacts {
  /** The table drives a real game through PinMAME: it needs a ROM. */
  usesPinmame: boolean;
  /** Possible ROM names (some tables let you choose between several). */
  roms: string[];
  /**
   * Folder, next to the table, from which FlexDMD or UltraDMD loads the DMD images,
   * videos and fonts (ProjectFolder). Optional to play (playable.ts):
   * without it, that DMD stays empty and some scripts stop ("Type incompatible" (Type mismatch)).
   */
  dmdFolder?: string;
  /**
   * The table draws its own DMD (PinMAME ROM, FlexDMD, UltraDMD): a PuP-Pack that
   * occupies the DMD window hides it, since the PUP plugin never draws the table's DMD.
   */
  drawsDmd?: boolean;
  /** Absent if the table does not use PuP. */
  pup?: PupScriptFacts;
  /**
   * Game name given to B2S Server (cGameName), for a table without a ROM: the one under which
   * PinUP Player looked for the pack when the script does not launch it (pupLoaderNeeded).
   */
  b2sName?: string;
  /**
   * What the current core.vbs refuses in the script and the old ones let through
   * (scriptcompat.ts): fixed in Cyber Pinball's .vbs (scriptCoreCompat).
   */
  coreCompat?: CompatFix[];
  /**
   * Tracks the script plays through PlayMusic, as it names them ("Akira\track.mp3", or only the
   * folder "Akira\" when the rest is computed): VPX looks for them in its Music folder.
   */
  music?: string[];
  /**
   * Table options (VPX F12 menu) that leave the DMD in the desktop mode scenery, with the
   * value that sends it to the cabinet's DMD window (tableoptions.ts, finding dmdDesktopOption).
   */
  dmdOptions?: CabinetDmdOption[];
  /**
   * Numbers the script sends to the PUP plugin as "E" triggers (DOF, B2SSetData: scriptB2sEvents);
   * absent if one of them is computed.
   */
  b2sEvents?: number[];
  /** The table has its VR room (tableHasVrRoom): in VR, its backglass is in the room, without a .directb2s. */
  vrRoom?: boolean;
}

export interface DoctorContext {
  tablesDir: string;
  /** Result of reading the script, or the error met; absent if VPX is not installed. */
  script?: ScriptFacts | { error: string };
  /** Logs folder, where a copy of crash.txt is kept before removing it. */
  logsDir?: string;
  /** Cabinet screens, for PuP-Packs (option, missing screens); absent without a cabinet model. */
  cabinet?: PupCabinet;
  /** Content of vpinball.log, if readable: what VPX said about the pack during the last game. */
  vpxLog?: string;
  /**
   * Pack names expected by the other versions in the folder, which share
   * pupvideos; undefined if the script of one of them is not known.
   */
  otherPackNames?: string[];
  /** ROM library (<root folder>\pinmame\roms); absent, the links are not checked. */
  romLibrary?: string;
  /**
   * Media playback errors recorded by the display; absent, they
   * are read from <logsDir>\medias-erreurs.json (mediaerrors.ts).
   */
  mediaErrors?: MediaErrorEntry[];
  /** Cabinet playfield (playfieldOrientation): the table's .ini can change the direction of the game. */
  orientation?: PlayfieldOrientation;
  /**
   * FullDMD dressing of the table (tableDressing, fulldmdtable.ts): frame found in its FullDMD
   * media and DMD position in its .ini; absent, the dressing is not checked.
   */
  dressing?: TableDressing;
  /**
   * The table's DMD has an in-game position set for the connected configuration (dmdplace.ts,
   * "Position du DMD" (DMD position)): Cyber Pinball rewrites it in [ScoreView] of the .ini before
   * each game. Neither "Écrans placés pour cette table" (Screens placed for this table) for the
   * DMD, nor "Le DMD cacherait l'habillage FullDMD" (The DMD would hide the FullDMD dressing).
   */
  dmdPlaced?: boolean;
  /**
   * DOF configuration of the cabinet (readDofSetup, dof.ts): does the table's ROM have its
   * effects in it? Absent, or without any ini (cabinet without DOF), the DOF rules stay silent.
   */
  dof?: DofSetup;
  /**
   * Volume of the table's ROM (romvolume.ts, romVolumeStatus) and the one the player chose;
   * absent, the rule stays silent.
   */
  romVolume?: { status: RomVolumeStatus; choice?: number };
  /**
   * Version of Cyber Pinball's VPX ("10.8.1-5436") and other VPX installs on the PC (autres-vpx.json): a table saved
   * by a more recent VPX than the one that plays it is reported (tableTooNew, vpx-format.ts). Absent, the rule stays silent.
   */
  vpx?: { own?: string; others: OtherVpx[] };
}

/** Cyber Pinball's memory in the .info: option and original name of each installed pack. */
export interface PupMemory {
  option?: string;
  origin?: string;
  /** The option was chosen in the game page ("PuP-Pack"): the table diagnosis no longer offers to change it. */
  chosen?: 'user';
  /**
   * PuP-DMD brought back from the backglass into the DMD window (pupDmdInBackglass): the screen
   * and its original CustomPos, restored if the cabinet no longer has a DMD screen
   * (pupDmdBackToBackglass).
   */
  dmd?: {
    screen: number;
    customPos: string;
    /** CustomPos that Cyber Pinball set: as long as it is in place, the adjustment is its own. */
    applied?: string;
  };
}

export function pupMemory(info: { [key: string]: unknown }, pack: string): PupMemory | undefined {
  const own = info.CyberPinball as { pup?: Record<string, PupMemory> } | undefined;
  const found = Object.entries(own?.pup ?? {}).find(([name]) => name.toLowerCase() === pack.toLowerCase());
  return found?.[1];
}

/** The .info with this pack's memory replaced, the other fields kept. */
export function setPupMemory<T extends { [key: string]: unknown }>(info: T, pack: string, memory: PupMemory): T {
  const own = { ...(info.CyberPinball as { pup?: Record<string, PupMemory> } | undefined) };
  const pup = Object.fromEntries(Object.entries(own.pup ?? {}).filter(([name]) => name.toLowerCase() !== pack.toLowerCase()));
  pup[pack] = memory;
  return { ...info, CyberPinball: { ...own, pup } };
}

/**
 * Findings the player chose to ignore for this table (Diagnostic > "Ignorer…" (Ignore...)): their
 * codes, in the .info (CyberPinball.doctor.ignored). An ignored finding no longer counts anywhere
 * (cabinet health, "Ce qu'il manque pour jouer" (What is missing to play), badges); the Diagnostic
 * view keeps it in "Ignorés" (Ignored), from which it can be restored. By code: the same kind of
 * problem on this table.
 */
export function ignoredFindingCodes(info: { [key: string]: unknown }): Finding['code'][] {
  const own = info.CyberPinball as { doctor?: { ignored?: unknown } } | undefined;
  const list = own?.doctor?.ignored;
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is Finding['code'] => typeof c === 'string' && (FINDING_CODES as readonly string[]).includes(c));
}

/** The .info with this finding ignored (or restored), the other fields kept. */
export function setFindingIgnored<T extends { [key: string]: unknown }>(info: T, code: Finding['code'], ignored: boolean): T {
  const own = { ...(info.CyberPinball as { doctor?: { ignored?: string[] } } | undefined) };
  const rest = ignoredFindingCodes(info).filter((c) => c !== code);
  const list = ignored ? [...rest, code] : rest;
  const doctor = { ...own.doctor };
  if (list.length) doctor.ignored = list;
  else delete doctor.ignored;
  const next: Record<string, unknown> = { ...own };
  if (Object.keys(doctor).length) next.doctor = doctor;
  else delete next.doctor;
  return { ...info, CyberPinball: next };
}

/** The findings shown and those the player ignored for this table. */
export function splitIgnoredFindings(findings: Finding[], info: { [key: string]: unknown }): { shown: Finding[]; ignored: Finding[] } {
  const codes = new Set<string>(ignoredFindingCodes(info));
  return { shown: findings.filter((f) => !codes.has(f.code)), ignored: findings.filter((f) => codes.has(f.code)) };
}

/** The .info where what we remember of pack `from` moves under its new name `to`. */
export function renamePupMemory<T extends { [key: string]: unknown }>(info: T, from: string, to: string): T {
  const memory = pupMemory(info, from);
  if (!memory) return info;
  const own = { ...(info.CyberPinball as { pup?: Record<string, PupMemory> } | undefined) };
  const pup = Object.fromEntries(Object.entries(own.pup ?? {}).filter(([name]) => name.toLowerCase() !== from.toLowerCase()));
  return setPupMemory({ ...info, CyberPinball: { ...own, pup } }, to, memory);
}

function withPupMemory(info: { [key: string]: unknown }, pack: string, memory: PupMemory): string {
  return JSON.stringify(setPupMemory(info, pack, memory), null, 2) + '\n';
}

/**
 * Operations that apply an option of an installed pack: its files copied to the
 * root of the pack (the replaced .pup files go to the recycle bin with the copy), those its .bat
 * deletes go to the recycle bin, and the option recorded in the .info for updates.
 * Nothing is executed: the .bat has only been read (analysePack).
 */
export function pupOptionOps(entry: TableEntry, root: string, pack: string, variant: PupVariant, memory: PupMemory): FileOp[] {
  return [
    ...variant.copies.map((c) => ({ op: 'copy' as const, from: path.join(root, c.from), to: path.join(root, c.to) })),
    ...variant.deletes.map((d) => ({ op: 'trash' as const, path: path.join(root, d) })),
    ...(fs.existsSync(entry.infoFile) ? [{ op: 'write' as const, path: entry.infoFile, content: withPupMemory(entry.info, pack, { ...memory, option: variant.label }) }] : []),
  ];
}

export interface TablePupPack {
  /** Folder name in pupvideos. */
  pack: string;
  /** Root of the pack (screens.pup). */
  root: string;
  variants: PupVariant[];
  /** Option whose files are at the root (appliedOption). */
  applied?: PupVariant;
  /** Only the .pup files of the applied option are in place: what is missing. */
  incomplete?: string[];
  /** Options that the files in place do not distinguish from the applied one. */
  twins: PupVariant[];
  /** Option closest to the cabinet, if the choice is clear. */
  recommended?: PupVariant;
  /** Choice not clear: the two leading options for the cabinet. */
  candidates?: [PupVariant, PupVariant];
  memory?: PupMemory;
}

/**
 * PuP-Packs of a table that have options (variants read in their .bat files or their
 * option folders), with the applied one and the one that suits the cabinet: the game page
 * offers them ("PuP-Pack"), the table diagnosis compares the two.
 */
export function tablePupPacks(entry: TableEntry, borne?: PupCabinet): TablePupPack[] {
  const cabinet = withTableBackglass(entry, borne);
  const pupvideos = pupVideosDir(entry.folder);
  if (!pupvideos) return [];
  return listDirs(pupvideos).flatMap((pack) => {
    const dir = path.join(pupvideos, pack);
    const info = analysePack(findPackRoot(dir) ?? dir);
    if (!info.variants.length) return [];
    const best = cabinet ? chooseVariant(info.variants, cabinet) : undefined;
    const memory = pupMemory(entry.info, pack);
    const applied = appliedOption(info, memory?.option);
    return [
      {
        pack,
        root: info.root,
        variants: info.variants,
        applied: applied?.variant,
        incomplete: applied && !applied.complete ? applied.differences : undefined,
        twins: applied?.twins ?? [],
        recommended: best?.confident ? best.chosen : undefined,
        candidates: best && !best.confident && best.chosen && best.runnerUp ? [best.chosen, best.runnerUp] : undefined,
        memory,
      },
    ];
  });
}

/**
 * The cabinet, and whether this table has its backglass (.directb2s): a PuP-Pack option that
 * leaves the backglass to B2S otherwise shows only a still image there (pupWindows).
 */
function withTableBackglass(entry: TableEntry, cabinet: PupCabinet | undefined): PupCabinet | undefined {
  if (!cabinet) return undefined;
  const base = path.basename(entry.file).replace(/.vpx$/i, '');
  return { ...cabinet, tableBackglass: Boolean(companion(entry.folder, base, true, '.directb2s')) };
}

/** Name of a table's folder: "Terminator 2 (Williams 1991)". */
export function tableFolderName(title: string, manufacturer?: string, year?: number): string {
  const suffix = [manufacturer, year].filter(Boolean).join(' ');
  return safeName(suffix ? `${title} (${suffix})` : title) || 'Table';
}

/** ROM name(s) according to the table's VBScript script. */
export function scriptFacts(vbs: string): ScriptFacts {
  const code = scriptCode(vbs);
  const usesPinmame = usesPinmameCode(code);
  const roms: string[] = [];
  const add = (name: string) => {
    if (name && !roms.some((r) => r.toLowerCase() === name.toLowerCase())) roms.push(name);
  };
  for (const m of code.matchAll(/\.GameName\s*=\s*("([^"]*)"|[A-Za-z_]\w*)/g)) {
    if (m[2] !== undefined) add(m[2].trim());
    else {
      const variable = m[1]!;
      for (const v of code.matchAll(new RegExp(`\\b${variable}\\s*=\\s*"([^"]*)"`, 'gi'))) add(v[1]!.trim());
    }
  }
  const facts: ScriptFacts = { usesPinmame, roms: usesPinmame ? roms : [] };
  const dmdFolder = dmdProjectFolder(code);
  if (dmdFolder) facts.dmdFolder = dmdFolder;
  if (usesPinmame || dmdFolder || /CreateObject\s*\(\s*"(FlexDMD\.FlexDMD|UltraDMD\.DMDObject)"/i.test(code)) facts.drawsDmd = true;
  const pup = pupScriptFacts(code);
  if (pup) facts.pup = pup;
  if (!usesPinmame) {
    const b2s = /\.B2SName\s*=\s*"([^"\r\n]+)"/i.exec(code)?.[1] ?? /\bcGameName\s*=\s*"([^"\r\n]+)"/i.exec(code)?.[1];
    if (b2s?.trim()) facts.b2sName = b2s.trim();
  }
  const compat = compatFixesFound(code);
  if (compat.length) facts.coreCompat = compat;
  const music = playedMusic(code);
  if (music.length) facts.music = music;
  const dmdOptions = cabinetDmdOptions(vbs);
  if (dmdOptions.length) facts.dmdOptions = dmdOptions;
  // Only where Cyber Pinball launches a pack itself (neither ROM nor PuP in the script): notDrivenFinding.
  const b2sEvents = pupLoaderNeeded(facts) ? scriptB2sEvents(code) : undefined;
  if (b2sEvents) facts.b2sEvents = b2sEvents;
  if (tableHasVrRoom(vbs)) facts.vrRoom = true;
  return facts;
}

/**
 * Tracks played through PlayMusic: the part of the name written out in full (`"Akira\" & n & ".mp3"`
 * gives `Akira\`). A name without folder or extension (a variable alone) tells nothing.
 */
function playedMusic(code: string): string[] {
  const out: string[] = [];
  const keep = (raw: string | undefined) => {
    const name = raw?.trim().replace(/\//g, '\\');
    if (!name || /^[a-z]:|^\\\\/i.test(name)) return;
    if (!name.includes('\\') && !/\.(mp3|ogg|wav|flac)$/i.test(name)) return;
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  for (const m of code.matchAll(/\bPlayMusic\b\s*\(?\s*"([^"\r\n]+)"/gi)) keep(m[1]);
  // Name held by a variable (`PlayMusic MusicDir & "theme.mp3"`, `MusicDir = "Goldorak\"`): followed like the DMD folder.
  const wrappers = musicWrappers(code);
  const params = new Set(wrappers.map((w) => w.paramName.toLowerCase()));
  for (const m of code.matchAll(/\bPlayMusic\b\s*\(?\s*([A-Za-z_][^,:'\r\n)]*)/gi)) {
    const parts = m[1]!.split('&').map((p) => p.trim());
    if (parts.some((p) => params.has(p.toLowerCase()))) continue;
    keep(musicPath(code, parts));
  }
  // Procedure that plays what it is given (`Sub PlaySong(s) : PlayMusic s : End Sub`, then `PlaySong "Goldorak\1.mp3"`):
  // the name is in its calls.
  for (const w of wrappers) {
    const call = new RegExp(`(?:^|[^\\w.])(?:call\\s+)?${w.name}\\b[ \\t]*\\(?([^:'\\r\\n]*)`, 'gim');
    for (const m of code.matchAll(call)) {
      const at = m.index! + m[0].search(new RegExp(`${w.name}\\b`, 'i'));
      const before = code.slice(code.lastIndexOf('\n', at) + 1, at);
      if (/^\s*(?:(?:public|private)\s+)?(?:sub|function)\s+$/i.test(before)) continue;
      const arg = m[1]!.replace(/\)\s*$/, '').split(',').map((a) => a.trim())[w.param];
      const value = arg === undefined ? undefined : musicPath(code, arg.split('&').map((p) => p.trim()));
      if (value === undefined) continue;
      keep(musicPath(code, w.expression, { [w.paramName.toLowerCase()]: value }));
    }
  }
  return out;
}

/** Name of a track made of texts and variables, all readable (otherwise undefined: nothing made up). */
function musicPath(code: string, parts: readonly string[], known: Record<string, string> = {}): string | undefined {
  let value = '';
  for (const part of parts) {
    const literal = /^"([^"]*)"$/.exec(part);
    if (literal) value += literal[1];
    else if (Object.hasOwn(known, part.toLowerCase())) value += known[part.toLowerCase()];
    else if (/^[A-Za-z_]\w*$/.test(part)) {
      const v = variableValue(code, part, 0);
      if (v === undefined) return undefined;
      value += v;
    } else return undefined;
  }
  return value;
}

/** Script procedures that pass one of their parameters to PlayMusic: name, parameter position, expression played. */
function musicWrappers(code: string): { name: string; param: number; paramName: string; expression: string[] }[] {
  const out: { name: string; param: number; paramName: string; expression: string[] }[] = [];
  for (const m of code.matchAll(/^\s*(?:(?:public|private)\s+)?(?:sub|function)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)([\s\S]*?)\bend\s+(?:sub|function)\b/gim)) {
    const params = m[2]!.split(',').map((p) => p.trim().replace(/^(byval|byref)\s+/i, ''));
    const play = /\bPlayMusic\b\s*\(?\s*([^,:'\r\n)]+)/i.exec(m[3]!);
    if (!play) continue;
    const expression = play[1]!.split('&').map((p) => p.trim());
    const param = params.findIndex((p) => expression.some((part) => part.toLowerCase() === p.toLowerCase()));
    if (param >= 0) out.push({ name: m[1]!, param, paramName: params[param]!, expression });
  }
  return out;
}

/**
 * DMD folder according to `.ProjectFolder = "./TheGooniesDMD/"` or
 * `.ProjectFolder = ".\"&myGameName&".FlexDMD\"` (FlexDMD), or
 * `.SetProjectFolder curDir & "\Foo.UltraDMD"` (UltraDMD). The path starts from the
 * table's folder; an absolute path does not concern this folder.
 */
function dmdProjectFolder(code: string): string | undefined {
  for (const m of code.matchAll(/\.(?:ProjectFolder\s*=|SetProjectFolder\b)\s*\(?([^\n:]*)/gi)) {
    const value = (pathExpression(code, m[1]!.replace(/\)\s*$/, ''), 0) ?? '').trim();
    if (!value || /^[a-z]:|^\\\\/i.test(value)) continue;
    const name = value.split(/[\\/]/).filter((part) => part && part !== '.').at(-1);
    if (name && name !== '..') return name;
  }
  return undefined;
}

/**
 * Value of a path written in the script (`curDir & "\" & TableName & ".UltraDMD"`): texts, and variables whose
 * value is a text or such a path. The most copied UltraDMD loading goes through a variable
 * (`DirName = curDir & "\" & TableName & ".UltraDMD"` then `.SetProjectFolder DirName`): without following it, the folder
 * stayed unknown, neither copied when taking over an installation nor reported missing (Goldorak, 19/11/2026). An
 * unresolved leading variable (curDir) is the table's folder; TablesDirectory is not, Cyber Pinball's .vbs
 * replaces it (scriptcompat.ts, tablesDirectoryDmd). undefined: the path cannot be read without running the script.
 */
function pathExpression(code: string, expression: string, depth: number): string | undefined {
  const parts = expression.split('&').map((p) => p.trim());
  let value = '';
  for (const [i, part] of parts.entries()) {
    const literal = /^"([^"]*)"$/.exec(part);
    if (literal) {
      value += literal[1];
      continue;
    }
    if (/^[A-Za-z_]\w*$/.test(part)) {
      const resolved = depth < 3 ? variableValue(code, part, depth) : undefined;
      if (resolved !== undefined) {
        value += resolved;
        continue;
      }
      if (i === 0) continue;
    }
    return undefined;
  }
  return value;
}

/** Value of the first readable assignment of a variable (`Const TableName = "Goldorak"`, `DirName = ...`). */
function variableValue(code: string, name: string, depth: number): string | undefined {
  const assign = new RegExp(`(?:^|:)\\s*(?:(?:const|dim|private|public)\\s+)?${name}\\s*=\\s*([^:\\n]+)`, 'gim');
  for (const m of code.matchAll(assign)) {
    const value = pathExpression(code, m[1]!.trim(), depth + 1);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

export function diagnose(entry: TableEntry, ctx: DoctorContext): Finding[] {
  // The table diagnosis reads VPX tables (script, ROM, PuP-Pack, backglass, VPX settings). A table from another
  // program (Pinball FX, Future Pinball...) has none of that: no finding, never a false
  // alarm ("ROM absente" (Missing ROM) on a .fpt).
  if (!isVpxTable(entry)) return [];
  const findings: Finding[] = [];
  const folder = entry.folder;
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const ownFolder = path.resolve(folder).toLowerCase() !== path.resolve(ctx.tablesDir).toLowerCase();
  const files = fs.readdirSync(folder);
  const has = (name: string) => files.find((f) => f.toLowerCase() === name.toLowerCase());

  // 0. Folder written by the old fs.cpSync of Node 22: "Été" turned into "Ã‰tÃ©" (copytree.ts).
  // The table's own folder (copy of a table on import) or one of its subfolders.
  if (ownFolder) {
    const mangled = findMangledDirs(folder, 3);
    if (mangled.length) {
      const names = (dirs: string[]) => quoteList(dirs.map((d) => path.basename(d)));
      const params = { list: names(mangled.map((m) => m.path)), names: names(mangled.map((m) => m.repaired)) };
      findings.push({
        code: 'folderMangled',
        severity: 'warning',
        title: tn(mangled.length, 'Dossier au nom abîmé par une copie', 'Dossiers aux noms abîmés par une copie'),
        detail: tn(
          mangled.length,
          '{list} devait s’appeler {names} : une copie faite sous Node 22 a écrit ses accents en « Ã© ». Ce qu’il contient n’est pas là où on le cherche. Un fichier déjà présent sous le vrai nom part à la corbeille, remplacé par la copie.',
          '{list} devaient s’appeler {names} : une copie faite sous Node 22 a écrit leurs accents en « Ã© ». Ce qu’ils contiennent n’est pas là où on le cherche. Un fichier déjà présent sous le vrai nom part à la corbeille, remplacé par la copie.',
          params,
        ),
        fix: {
          label: tn(mangled.length, 'Ranger son contenu sous son vrai nom', 'Ranger leur contenu sous leur vrai nom'),
          ops: mangled.map((m) => ({ op: 'move', from: m.path, to: m.repaired })),
        },
      });
    }
  }

  // 1. Table stored loose in the tables folder.
  if (!ownFolder) {
    const target = path.join(ctx.tablesDir, tableFolderName(entry.title, entry.manufacturer, entry.year));
    // Its files, and the DMD folder its script loads ("Foo.UltraDMD", "GooniesDMD"):
    // VPX looks for it in the table's folder (current folder during the game); left behind, it would be missing.
    const dmd = ctx.script && !('error' in ctx.script) ? ctx.script.dmdFolder?.toLowerCase() : undefined;
    const moved = files.filter((f) => {
      const lower = f.toLowerCase();
      if (!fs.statSync(path.join(folder, f)).isDirectory()) return lower.startsWith(`${base.toLowerCase()}.`);
      return lower === dmd || (DMD_FOLDER_NAME.test(f) && lower.startsWith(`${base.toLowerCase()}.`));
    });
    findings.push({
      code: 'outsideFolder',
      severity: 'warning',
      title: t('Table hors de son propre dossier'),
      detail: t('VPX range chaque table dans son dossier, avec sa ROM, son backglass et ses vidéos. Celle-ci est en vrac dans {dir}.', { dir: ctx.tablesDir }),
      fix: {
        label:
          moved.length > 1
            ? t('Déplacer ses {n} fichiers dans « {folder} »', { n: moved.length, folder: path.basename(target) })
            : t('Déplacer la table dans « {folder} »', { folder: path.basename(target) }),
        ops: moved.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(target, f) })),
      },
    });
  }

  // 1 bis. Table saved by a more recent VPX than the one that plays it (vpx-format.ts): the game would fail.
  const tooNew = tooNewFinding(entry, ctx);
  if (tooNew) findings.push(tooNew);

  // 2. A .vbs named like the table replaces its script; Cyber Pinball's own (PuP-Pack
  // switched on, script fixed for the core.vbs, scriptpatch.ts) is welcome as long as it is
  // derived from the table's current script.
  const vbs = has(`${base}.vbs`);
  const override = vbs ? readOverride(entry, path.join(folder, vbs)) : undefined;
  // Disabled pack: the outdated .vbs is rebuilt without PuP (pupPackDisabledScript, in checkPup).
  const pupOff = ownFolder && tableDisabledPacks(entry, ctx.script && !('error' in ctx.script) ? ctx.script : undefined).length > 0;
  if (override?.state.kind === 'stale') {
    if (!pupOff) findings.push(staleFinding(override));
  } else if (vbs && override?.state.kind !== 'ours') {
    findings.push({
      code: 'scriptOverride',
      severity: 'warning',
      title: t('Script de la table remplacé'),
      detail: t("{file} remplace le script contenu dans la table. C'est parfois voulu (correctif), souvent un reste d'extraction qui rend la table injouable après une mise à jour.", { file: vbs }),
      fix: { label: t('Mettre {file} à la corbeille', { file: vbs }), ops: [{ op: 'trash', path: path.join(folder, vbs) }] },
    });
  }
  // Script that the current core.vbs stops (vpmInit called twice): fixed in the .vbs.
  if (ownFolder) {
    // Fixes requested by the log of the table's last game (call refused by VPX's B2S backglass...).
    const session = ctx.vpxLog ? tableLogSession(entry, ctx.vpxLog) : undefined;
    const compat = coreCompatFinding(entry, ctx, override, session ? compatFixesFromLog(session) : []);
    if (compat) findings.push(compat);
    // DMD images that FlexDMD takes from the table, loaded in the middle of the game (flexprewarm.ts): loaded in advance.
    const prewarm = compat ? undefined : flexPrewarmFinding(entry, ctx, override);
    if (prewarm) findings.push(prewarm);
  }
  const desktopDmd = desktopDmdFinding(entry, ctx);
  if (desktopDmd) findings.push(desktopDmd);

  // 3. Backglass.
  const backglass = companion(folder, base, ownFolder, '.directb2s');
  const emptyB2s = emptyBackglassFinding(backglass);
  if (emptyB2s) findings.push(emptyB2s);
  const versionBases = files.filter((f) => f.toLowerCase().endsWith('.vpx')).map((f) => f.slice(0, -4).toLowerCase());
  const strays = files.filter(
    (f) =>
      f.toLowerCase().endsWith('.directb2s') &&
      (!backglass || f.toLowerCase() !== path.basename(backglass).toLowerCase()) &&
      !versionBases.includes(f.slice(0, -'.directb2s'.length).toLowerCase()),
  );
  if (!backglass && strays.length && ownFolder) {
    const best = bestMatch(strays, [entry.title, base, path.basename(folder)]);
    const wanted = `${path.basename(folder)}.directb2s`;
    findings.push({
      code: 'backglassMisnamed',
      severity: 'warning',
      title: t('Backglass mal nommé'),
      detail: t('VPX cherche « {base}.directb2s » ou « {wanted} » : « {best} » ne sera pas affiché.', { base, wanted, best }),
      fix: { label: t('Renommer en « {name} »', { name: wanted }), ops: [{ op: 'move', from: path.join(folder, best), to: path.join(folder, wanted) }] },
    });
  } else if (!backglass) {
    const missing = backglassMissingFinding(entry, ctx, ownFolder);
    if (missing) findings.push(missing);
  } else if (strays.length) {
    const size = strays.reduce((sum, f) => sum + sizeOf(path.join(folder, f)), 0);
    const params = { shown: path.basename(backglass), list: strays.map(quote).join(', '), size: formatSize(size) };
    findings.push({
      code: 'backglassStray',
      severity: 'info',
      title: tn(strays.length, 'Backglass inutilisé', 'Backglass inutilisés'),
      detail: tn(strays.length, 'VPX affiche « {shown} » ; {list} ne sert à rien ({size}).', 'VPX affiche « {shown} » ; {list} ne servent à rien ({size}).', params),
      fix: { label: tn(strays.length, 'Mettre le fichier inutilisé à la corbeille', 'Mettre les fichiers inutilisés à la corbeille'), ops: strays.map((f) => ({ op: 'trash', path: path.join(folder, f) })) },
    });
  }

  // 4. ROM expected by the script.
  if (ownFolder && ctx.script) {
    if ('error' in ctx.script) {
      findings.push({ code: 'scriptUnreadable', severity: 'warning', title: t('Script illisible'), detail: t('La ROM n’a pas pu être vérifiée : {error}', { error: ctx.script.error }) });
    } else if (ctx.script.usesPinmame && ctx.script.roms.length === 0) {
      findings.push({ code: 'romUnknown', severity: 'info', title: t('ROM non vérifiée'), detail: t('La table utilise PinMAME, mais le nom de sa ROM n’apparaît pas clairement dans son script.') });
    } else if (ctx.script.usesPinmame) {
      findings.push(...checkRom(folder, ctx.script.roms, ctx.romLibrary));
      findings.push(...dmdColorFindings(folder, ctx.script, ctx));
    }
    if (!('error' in ctx.script) && ctx.script.dmdFolder) {
      const finding = checkDmdFolder(folder, ctx.script.dmdFolder, ctx.script.usesPinmame, ctx.tablesDir);
      if (finding) findings.push(finding);
      // DMD videos decoded in full at each scene by the FlexDMD plugin (dmdvideos.ts): the game freezes.
      const videos = finding ? undefined : heavyDmdVideosFinding(folder, ctx.script.dmdFolder);
      if (videos) findings.push(videos);
    }
  }

  // 4 bis. DOF: will the cabinet's LEDs and feedback react to this table? Only on a
  // cabinet that has a DOF configuration, and never blocking: the table plays without it.
  if (ownFolder && ctx.dof?.ini.length && ctx.script && !('error' in ctx.script)) {
    findings.push(...dofFindingsFor(folder, ctx.script, ctx.dof));
  }

  // 4 ter. Low ROM volume, set outside Cyber Pinball (a low factory volume is raised
  // automatically before the game, a volume chosen by the player is kept): reported, repairable.
  const volume = romVolumeFinding(ctx.romVolume);
  if (volume) findings.push(volume);

  // 5. Crash reports left by VPX.
  const crashes = ['crash.txt', 'crash.dmp'].map(has).filter((f): f is string => Boolean(f));
  if (crashes.length) {
    const size = crashes.reduce((sum, f) => sum + sizeOf(path.join(folder, f)), 0);
    const txt = has('crash.txt');
    const when = fs.statSync(path.join(folder, crashes[0]!)).mtime;
    const reason = txt ? /^Reason:\s*(.+)$/m.exec(fs.readFileSync(path.join(folder, txt), 'utf8'))?.[1]?.trim() : undefined;
    const ops: FileOp[] = [];
    for (const f of crashes) {
      const p = path.join(folder, f);
      if (f.toLowerCase() === 'crash.txt' && ctx.logsDir) {
        const stamp = when.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
        ops.push({ op: 'move', from: p, to: path.join(ctx.logsDir, 'plantages', `${safeName(path.basename(folder))} ${stamp}.txt`) });
      } else ops.push({ op: 'delete', path: p });
    }
    findings.push({
      code: 'crashReport',
      severity: 'warning',
      title: t('Rapport de plantage de VPX'),
      detail: reason
        ? t('VPX a planté sur cette table le {date} ({reason}). {files} : {size}.', { date: formatDateTime(when), reason, files: formatList(crashes), size: formatSize(size) })
        : t('VPX a planté sur cette table le {date}. {files} : {size}.', { date: formatDateTime(when), files: formatList(crashes), size: formatSize(size) }),
      fix: {
        label:
          tn(crashes.length, 'Supprimer le rapport (libère {size})', 'Supprimer les rapports (libère {size})', { size: formatSize(size) }) +
          (txt && ctx.logsDir ? t(', crash.txt est gardé dans les journaux') : ''),
        ops,
      },
    });
  }

  // 6. .info file shared between frontends.
  if (!fs.existsSync(entry.infoFile) && !(ownFolder && has(`${path.basename(folder)}.info`))) {
    const infoFile = ownFolder ? path.join(folder, `${path.basename(folder)}.info`) : entry.infoFile;
    const info = { Info: { Title: entry.title, Manufacturer: entry.manufacturer, Year: entry.year } };
    findings.push({
      code: 'infoMissing',
      severity: 'info',
      title: t('Pas de fichier d’informations'),
      detail: t('Le titre, le fabricant et l’année sont devinés d’après le nom des fichiers. Le fichier .info les fixe et les partage avec les autres frontends.'),
      fix: { label: t('Créer « {name} »', { name: path.basename(infoFile) }), ops: [{ op: 'write', path: infoFile, content: JSON.stringify(info, null, 2) + '\n' }] },
    });
  }

  // 7. Direction of the game changed by the table's .ini, otherwise the manual framing it imposes (often shipped with it).
  const orientation = ctx.orientation && tableOrientationFinding(entry.file, ctx.orientation);
  const manual = orientation || manualViewFinding(entry.file) || importedViewFinding(entry.file, ctx.orientation);
  if (manual) findings.push(manual);
  // Point de vue fourni avec la table (fichier POV, povview.ts), sauf si son .ini la met déjà de travers.
  const pov = orientation ? undefined : povViewFinding(entry.file, ctx.orientation);
  if (pov) findings.push(pov);

  // 7 bis. Screens placed for this table only (VPX menu, "Save as Table Override"),
  // including the DMD that would cover the FullDMD dressing: that finding keeps the DMD window. The DMD
  // placed in game ("Position du DMD" (DMD position)) is intended and managed by Cyber Pinball: neither one.
  const hidden = !ctx.dmdPlaced && ctx.dressing && dressHiddenFinding(entry, ctx.dressing);
  const windows = tableWindowsFinding(entry.file, dressRecord(entry.info), Boolean(hidden) || Boolean(ctx.dmdPlaced));
  if (windows) findings.push(windows);
  if (hidden) findings.push(hidden);
  // Sound muted by the table's .ini, or music that VPX did not find during the last game (vpxgamelog.ts).
  const muted = tableAudioMutedFinding(entry.file);
  if (muted) findings.push(muted);
  if (ctx.vpxLog) {
    const runtime = scriptRuntimeFinding(entry.file, ctx.vpxLog);
    if (runtime) findings.push(runtime);
    const music = musicNotFoundFinding(entry, ctx.vpxLog);
    if (music) findings.push(music);
    const images = dmdImagesMissingFinding(entry, ctx.vpxLog);
    if (images) findings.push(images);
  }

  // 8. PuP-Pack (VPX 10.8.1 plugin mode).
  if (ownFolder) findings.push(...checkPup(entry, ctx, override));

  // 9. Presentation media (the table's medias\).
  if (ownFolder) findings.push(...checkMedias(entry, ctx));

  // 10. Frame rate of the last games on this cabinet (slowtable.ts): the table lags or stutters.
  const slow = slowTableFinding(ctx.logsDir, entry.file);
  if (slow) findings.push(slow);

  // Only the ROM blocks "Jouer" (Play) (playable.ts): any other finding is at most a warning.
  const order: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.map(playSeverity).sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * `[Player] CabinetAutofitMode = 0` in the table's .ini: VPX no longer frames the
 * table and takes back the view set by hand, often for the author's screen, hence
 * a truncated bottom of the table or a table that overflows. The repair removes the key (the
 * general setting takes over), the old file goes to the recycle bin.
 */
function manualViewFinding(tableFile: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const mode = doc.get('Player', 'CabinetAutofitMode')?.trim();
  if (mode !== '0' && !/^manual$/i.test(mode ?? '')) return undefined;
  const name = path.basename(ini.path);
  // Cabinet view saved for this table (VPX point of view, or taken over from another installation: tableview.ts):
  // a choice made for it, kept. The return to automatic framing is written (1, Ajuster (Fit)), the key is not
  // removed: without it, the taken-over view would be put back to manual framing at the next game (importedView).
  if (hasOwnCabinetView(doc)) {
    doc.set('Player', 'CabinetAutofitMode', '1');
    return {
      code: 'manualView',
      severity: 'info',
      title: t('Cadrage réglé pour cette table'),
      detail: t('{name} règle le cadrage de cette table à la main (cadrage manuel, avec sa propre vue) : VPX la joue telle qu’elle a été enregistrée pour elle. « Régler l’affichage en partie » dans la fiche permet de la retoucher.', { name }),
      fix: { label: t('Passer cette table au cadrage automatique'), ops: [{ op: 'write', path: ini.path, content: doc.toString() }] },
    };
  }
  // Passée en cadrage manuel dans le menu de VPX sans vue réglée (hauteurs de vitre, mode, rotation seuls) : la vue de
  // l'auteur, enregistrée dans le .vpx pour son écran, pas un cadrage fait pour cette borne.
  const fromMenu = touchesCabinetView(doc);
  doc.remove('Player', 'CabinetAutofitMode');
  return {
    code: 'manualView',
    severity: 'warning',
    title: fromMenu ? t('Cadrage manuel sans vue réglée') : t('Cadrage manuel imposé par la table'),
    detail: fromMenu
      ? t(
          '{name} passe cette table en cadrage manuel, sans échelle ni décalage réglés pour elle (ce que le menu de VPX enregistre quand on quitte le cadrage automatique) : VPX reprend la vue enregistrée par l’auteur de la table, pour son écran. Le cadrage de la borne la remet à la bonne taille ; « Régler l’affichage en partie » permet ensuite de la retoucher.',
          { name },
        )
      : t(
          '{name} règle [Player] CabinetAutofitMode = 0 : VPX ne cadre pas cette table et reprend une vue réglée à la main, peut-être pour un autre écran (table tronquée ou qui déborde). Ensuite, « Régler l’affichage en partie » dans la fiche la cadre sur la table lancée.',
          { name },
        ),
    fix: {
      label: t('Rendre le cadrage automatique à la table'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Keys of a table's .ini that decide the direction of the game (vpxPlayedFlipperEdge). */
const ORIENTATION_KEYS = ['BGSet', 'CabinetAutofitMode'];

/**
 * The table's .ini changes the direction of the game on this cabinet: without it, VPX
 * would draw the flippers on the player's side; with it (desktop view, or manual framing
 * that takes back the rotation set by the author), no longer. The repair removes these keys;
 * the old file goes to the recycle bin. If VPinballX.ini itself is at fault, it is
 * the synchronisation that says so.
 */
function tableOrientationFinding(tableFile: string, orientation: PlayfieldOrientation): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const global = IniDocument.parse(orientation.globalIni);
  const read = (section: string, key: string) => {
    const own = doc.get(section, key);
    return own !== undefined && own.trim() !== '' ? own : global.get(section, key);
  };
  if (orientationFinding(orientation.window, orientation.edge, (s, k) => global.get(s, k))) return undefined;
  const played = vpxPlayedFlipperEdge(read, orientation.window);
  if (played.edge === orientation.edge) return undefined;
  const keys = ORIENTATION_KEYS.filter((key) => (doc.get('Player', key)?.trim() ?? '') !== '');
  const set = keys.map((key) => t('[Player] {key} = {value}', { key, value: doc.get('Player', key)!.trim() })).join(t(' ; '));
  for (const key of keys) doc.remove('Player', key);
  const name = path.basename(ini.path);
  return {
    code: 'tableOrientation',
    severity: 'warning',
    title: t('Table de travers sur cette borne'),
    detail: played.edge
      ? t('{name} règle {keys} : VPX dessinera cette table flippers {played}, alors que vous êtes {edge} de l’écran. Sans ces clés, le cadrage automatique de la borne la remet dans votre sens.', {
          name,
          keys: set,
          played: EDGE_LABELS[played.edge],
          edge: EDGE_LABELS[orientation.edge],
        })
      : t('{name} règle {keys} : VPX reprend la vue de l’auteur de la table, avec sa rotation, souvent pour un autre écran : la table peut s’afficher de travers. Sans ces clés, le cadrage automatique de la borne la met dans votre sens.', {
          name,
          keys: set,
        }),
    fix: {
      label: t('Remettre la table dans le sens de la borne'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Secondary VPX windows that a table's .ini can place for that table alone. */
const TABLE_WINDOWS = [
  { section: 'Backglass', prefix: 'Backglass', get label() { return t('Fronton'); } },
  { section: 'ScoreView', prefix: 'ScoreView', label: 'DMD' },
  { section: 'Topper', prefix: 'Topper', label: 'Topper' },
] as const;
const WINDOW_KEY = /^(Output|Display|FullScreen|WndX|WndY|Width|Height)$/i;

/**
 * Backglass, DMD or topper placed for this table only: the VPX menu ("Display
 * Settings", saved by "Save as Table Override") writes their window in the table's .ini,
 * over the cabinet layout. It is intended (the DMD set in the
 * frame drawn by a PuP-Pack); the finding shows it and allows going back to it, for
 * example after a screen change. The repair removes these keys and nothing else.
 */
/**
 * Sound muted for this table only: its .ini sets the backglass (music) or playfield volume to 0 in [Player],
 * often taken over from another installation. The repair removes these keys: the table follows the general setting.
 */
function tableAudioMutedFinding(tableFile: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const muted = mutedAudioSettings(doc);
  if (!muted.length) return undefined;
  for (const e of muted) doc.remove(e.section, e.key);
  const name = path.basename(ini.path);
  return {
    code: 'tableAudioMuted',
    severity: 'warning',
    title: t('Son coupé pour cette table'),
    detail: t('{file} règle {keys} à 0 pour cette table seulement : elle se joue sans ce son.', { file: name, keys: muted.map((e) => e.key).join(', ') }),
    fix: {
      label: t('Rendre le son à cette table'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Lines of the VPX log for the last game of this table (from its loading to the next loading). */
function tableLogSession(entry: TableEntry, log: string): string[] | undefined {
  const lines = log.split(/\r?\n/);
  const loads = lines.map((l, i) => ({ i, file: /LoadGameFromFilename (.+)$/.exec(l)?.[1]?.trim() })).filter((x) => x.file);
  const start = loads.filter((x) => samePathCI(x.file!, entry.file)).at(-1);
  if (!start) return undefined;
  const end = loads.find((x) => x.i > start.i)?.i ?? lines.length;
  return lines.slice(start.i, end);
}

/**
 * Music that VPX did not find during the last game ("Failed to stream music: <name>"): it looks for it in the
 * table's "music" folder, then in VPX's. The table plays without it.
 */
function musicNotFoundFinding(entry: TableEntry, log: string): Finding | undefined {
  const session = tableLogSession(entry, log);
  const names = session ? musicNotFound(session) : [];
  if (!names.length) return undefined;
  const where = path.join(path.dirname(entry.file), 'music');
  return {
    code: 'musicMissing',
    severity: 'warning',
    title: tn(names.length, 'Musique introuvable', 'Musiques introuvables'),
    detail: t('À la dernière partie, VPX n’a pas trouvé {names} : il cherche la musique de la table dans « {where} ». Elle est fournie avec la table d’origine ; mettez-la dans le dossier d’import puis « Ajouter une table ».', {
      names: names.map((n) => `« ${n} »`).join(', '),
      where,
    }),
  };
}

/**
 * DMD images (UltraDMD, FlexDMD) that VPX could not load during the last game: the folder is there, but not these
 * images ("Asset not loaded", "Failed to resolve asset"). The DMD shows only their texts, in its colour.
 * Noted on 19/11/2026: Goldorak, "Goldorak.UltraDMD\black.jpg" missing, orange DMD.
 */
function dmdImagesMissingFinding(entry: TableEntry, log: string): Finding | undefined {
  const session = tableLogSession(entry, log);
  if (!session) return undefined;
  const assets = flexAssets(session);
  const failed = [...assets.notLoaded, ...assets.missing].filter((f) => !/^FlexDMD\.Resources\.|^VPX\./i.test(f));
  if (!failed.length) return undefined;
  // "Asset not loaded" applies to a missing file as well as to a file the plugin could not read (IMG_Load,
  // AssetManager::Open): a file that is present is reported as unreadable, not missing.
  const present = (f: string) => readDirents(path.dirname(f)).some((d) => d.isFile() && d.name.toLowerCase() === path.basename(f).toLowerCase());
  const unreadable = [...new Set(failed.filter(present).map((f) => path.basename(f)))];
  const missing = failed.filter((f) => !present(f));
  if (!missing.length) {
    return {
      code: 'dmdImagesMissing',
      severity: 'warning',
      title: tn(unreadable.length, 'Image du DMD illisible', 'Images du DMD illisibles'),
      detail: t('À la dernière partie, le DMD n’a pas su lire {list} dans « {folder} » : le fichier est là, mais son format ne passe pas (image abîmée, ou enregistrée sous un autre format que son extension).', {
        list: unreadable.slice(0, 3).map((n) => `« ${n} »`).join(', ') + (unreadable.length > 3 ? '…' : ''),
        folder: path.basename(path.dirname(failed[0]!)),
      }),
    };
  }
  const names = [...new Set(missing.map((f) => path.basename(f)))];
  const folder = path.basename(path.dirname(missing[0]!));
  return {
    code: 'dmdImagesMissing',
    severity: 'warning',
    title: tn(names.length, 'Image du DMD absente', 'Images du DMD absentes'),
    detail: tn(names.length, 'À la dernière partie, le DMD n’a pas trouvé {list} dans « {folder} » : il n’en montre que les textes. Ce dossier est fourni avec la table d’origine ; reprenez-le en entier, puis « Ajouter une table ».', 'À la dernière partie, le DMD n’a pas trouvé {n} images dans « {folder} » ({list}) : il n’en montre que les textes. Ce dossier est fourni avec la table d’origine ; reprenez-le en entier, puis « Ajouter une table ».', {
      n: names.length,
      folder,
      list: names.slice(0, 3).map((n) => `« ${n} »`).join(', ') + (names.length > 3 ? '…' : ''),
    }),
  };
}

function tableWindowsFinding(tableFile: string, dress: Rect | undefined, dmdElsewhere = false): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  // The DMD set by Cyber Pinball in the frame of the FullDMD dressing (fulldmdtable.ts) is managed, not a setting
  // to undo; a set position that covers the dressing falls under "Le DMD cacherait l'habillage FullDMD" (dmdElsewhere).
  const dressed = dmdElsewhere || isDressWindow(tableDmdWindow(doc), dress);
  const placed: string[] = [];
  for (const w of TABLE_WINDOWS) {
    if (dressed && w.section === 'ScoreView') continue;
    const keys = doc
      .entries()
      .filter((e) => e.section.toLowerCase() === w.section.toLowerCase() && e.key.toLowerCase().startsWith(w.prefix.toLowerCase()) && WINDOW_KEY.test(e.key.slice(w.prefix.length)) && e.value.trim() !== '');
    if (!keys.length) continue;
    const value = (suffix: string) => keys.find((e) => e.key.toLowerCase() === `${w.prefix}${suffix}`.toLowerCase())?.value.trim();
    const [x, y, width, height] = ['WndX', 'WndY', 'Width', 'Height'].map(value);
    const where = [width && height ? `${width} × ${height}` : undefined, x !== undefined && y !== undefined ? t('en {x}, {y}', { x, y }) : undefined].filter(Boolean).join(' ');
    const output = value('Output');
    const state =
      output === '0'
        ? t('éteint')
        : output === '2'
          ? where
            ? t('incrusté dans le plateau, {where}', { where })
            : t('incrusté dans le plateau')
          : where || keys.map((e) => e.key).join(', ');
    placed.push(t('{window} ({state})', { window: w.label, state }));
    for (const e of keys) doc.remove(e.section, e.key);
  }
  if (!placed.length) return undefined;
  const name = path.basename(ini.path);
  return {
    code: 'tableWindows',
    severity: 'info',
    title: t('Écrans placés pour cette table'),
    detail: t('{file} place {windows} pour cette table seulement, par-dessus la disposition de la borne (menu de VPX, « Display Settings », enregistré pour la table). Après un changement d’écran, revenez à la disposition générale.', { file: name, windows: placed.join(', ') }),
    fix: {
      label: t('Revenir à la disposition générale'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/**
 * The PUP plugin never draws the table's DMD: it reads its images only to
 * recognise scenes (PuPCapture, PUPManager::ProcessDmdFrame). In the DMD window,
 * VPX keeps the first engine that draws, by priority (player.cpp, OnAuxRendererChanged):
 * with Priority.PUP = 100, a pack that has a screen 5 or 1 hides the score of the ROM, of FlexDMD
 * or of UltraDMD (2001 - A Space Odyssey, option "DMD on Fulldmd"). The priority is read from
 * the table's settings: "[ScoreView] Priority.PUP = 0" in its .ini gives the window back
 * to the DMD for that table alone; the pack keeps the backglass and the topper. A value already written
 * for the table (VPX menu in game) is respected.
 */
function pupHidesDmdFinding(tableFile: string, pack: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  const doc = IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : '');
  if (doc.get('ScoreView', 'Priority.PUP') !== undefined) return undefined;
  doc.set('ScoreView', 'Priority.PUP', '0');
  const params = { pack, file: path.basename(ini.path) };
  return {
    code: 'pupHidesDmd',
    severity: 'warning',
    title: t('Le PuP-Pack cacherait le DMD de la table'),
    detail: t('pupvideos\\{pack} occupe la fenêtre du DMD, où le plugin PUP ne dessine jamais le DMD de la table : son score n’apparaîtrait pas. Pour cette table, le DMD passera devant le pack ({file}) ; le pack garde le fronton et le topper.', params),
    fix: { label: t('Garder le DMD de la table devant le PuP-Pack'), ops: [{ op: 'write', path: ini.path, content: doc.toString() }] },
  };
}

/**
 * The score of a PuP-DMD set in the backglass (dmdInBackglass) moves into the cabinet's DMD
 * window: its screen gets a CustomPos that places there the strip of the backglass where the author
 * put it, in the proportions of that window (aspects.dmd: 4:1 on a cabinet, 16:9 on a FullDMD). The
 * script must write the score on the pack (LabelNew), no option of the pack must already put it
 * on the DMD (the option choice takes care of that), and the cabinet must have a DMD screen. The position is
 * recomputed when the DMD window changes shape (another cabinet configuration), and the
 * original CustomPos, recorded in the .info, is restored when the cabinet no longer has a DMD screen.
 */
function pupDmdPlaceFinding(
  entry: TableEntry,
  pack: string,
  info: PupPackInfo,
  memory: PupMemory | undefined,
  cabinet: PupCabinet | undefined,
  facts: ScriptFacts | undefined,
): Finding | undefined {
  const file = info.pupFiles.find((f) => f.toLowerCase() === 'screens.pup');
  if (!cabinet || !file || !fs.existsSync(entry.infoFile)) return undefined;
  const screensPath = path.join(info.root, file);
  let text: string;
  try {
    text = fs.readFileSync(screensPath, 'latin1');
  } catch {
    return undefined;
  }
  // Cyber Pinball's adjustment in place: the CustomPos it set (an older adjustment
  // did not record it: a screen that points to itself).
  const kept = memory?.dmd;
  const current = kept ? screenCustomPos(text, kept.screen) : undefined;
  const keptScreen = kept && parseScreens(text).filter((s) => s.num === kept.screen).pop();
  const ours = Boolean(kept && current !== undefined && (kept.applied !== undefined ? current === kept.applied : keptScreen && isBandCustomPos(keptScreen)));
  const writeOps = (content: string, dmd: PupMemory['dmd']): FileOp[] => {
    const { dmd: _old, ...rest } = memory ?? {};
    return [
      { op: 'write', path: screensPath, content, encoding: 'latin1' },
      { op: 'write', path: entry.infoFile, content: withPupMemory(entry.info, pack, dmd ? { ...rest, dmd } : rest) },
    ];
  };
  if (cabinet.dmd === false) {
    if (!ours) return undefined;
    return {
      code: 'pupDmdBackToBackglass',
      severity: 'warning',
      title: t('Score du PuP-Pack à remettre dans le fronton'),
      detail: t('Le score de pupvideos\\{pack} avait été placé sur l’écran DMD ; la borne n’en a plus : il retourne en bas du fronton, comme l’auteur l’a prévu.', { pack }),
      fix: { label: t('Remettre le score dans le fronton'), ops: writeOps(relocateScreen(text, kept!.screen, kept!.customPos), undefined) },
    };
  }
  if (!cabinet.dmd || !facts?.pup?.labels) return undefined;
  if (info.variants.some((v) => v.traits.windows?.dmd)) return undefined;
  const aspect = cabinet.aspects?.dmd ?? cabinet.dmdRatio;
  // The pack as shipped: the one in place, or the one from before the adjustment.
  const shipped = ours ? relocateScreen(text, kept!.screen, kept!.customPos) : text;
  const found = dmdInBackglass(parseScreens(shipped), aspect);
  const original = found && screenCustomPos(shipped, found.screen);
  if (!found || original === undefined) return undefined;
  if (ours && current === found.customPos) return undefined;
  const params = { pack, screen: found.screen, top: Math.round(found.band.top), bottom: Math.round(found.band.bottom) };
  return {
    code: 'pupDmdInBackglass',
    severity: 'warning',
    title: ours ? t('Score du PuP-Pack à recadrer sur l’écran DMD') : t('Score du PuP-Pack dans le fronton, écran DMD vide'),
    detail: ours
      ? t('La fenêtre du DMD de la borne a changé de forme : le score de pupvideos\\{pack} (bande de {top} à {bottom} % de l’écran {screen}) y est replacé à ses proportions.', params)
      : t(
          'pupvideos\\{pack} pose son écran DMD ({screen}), où le script écrit le score, dans le fronton : il est fait pour un seul grand écran. La fenêtre du DMD de la borne resterait vide. Le score y passe (bande de {top} à {bottom} % de l’écran {screen}) ; le reste du pack garde le fronton.',
          params,
        ),
    fix: {
      label: t('Afficher le score sur l’écran DMD'),
      ops: writeOps(relocateScreen(shipped, found.screen, found.customPos), { screen: found.screen, customPos: original, applied: found.customPos }),
    },
  };
}

/**
 * Backglass without any image (b2sWithoutBackglass): VPX's B2S plugin would crash at the
 * first frame of the game. Moved to the recycle bin before each game and as soon as it is installed
 * (PUP_PLAY_REPAIRS): the table is then played without a B2S backglass, as if it had none.
 */
function emptyBackglassFinding(file: string | undefined): Finding | undefined {
  if (!file || !b2sWithoutBackglass(file)) return undefined;
  const params = { file: path.basename(file) };
  return {
    code: 'backglassEmpty',
    severity: 'warning',
    title: t('Fronton sans image : VPX planterait au lancement'),
    detail: t(
      '« {file} » ne contient aucune image de fronton (un fichier de remplacement, souvent laissé par un autre front-end de borne). Le plugin B2S de VPX s’arrête dessus dès la première image de la partie. Sans lui, la table se joue normalement ; le PuP-Pack et le DMD ne changent pas.',
      params,
    ),
    fix: { label: t('Mettre « {file} » à la corbeille', params), ops: [{ op: 'trash', path: file }] },
  };
}

/**
 * Table without a .directb2s: what the backglass screen really shows during the game. VPX does not
 * occupy it; the frontend leaves the table's Backglass media there (first frame, frozen, by
 * default: renderGame of app/renderer/frontend.js), otherwise the table title or the cabinet's common
 * media. Nothing to say when the cabinet has no backglass screen, nor when a PuP-Pack of the
 * table occupies the backglass (its videos fill it). A VR table whose room has its own
 * backglass (tableHasVrRoom) is not invited to receive a .directb2s. Low-key information.
 */
function backglassMissingFinding(entry: TableEntry, ctx: DoctorContext, ownFolder: boolean): Finding | undefined {
  if (ctx.cabinet && !ctx.cabinet.backglass) return undefined;
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  if (ownFolder && pupShowsBackglass(entry, facts)) return undefined;
  const shown = shownMedia(mediaItems(tableMediaDir(entry)), 'Backglass', mediaNames(entry))[0];
  return {
    code: 'backglassMissing',
    severity: 'info',
    note: true,
    title: t('Pas de backglass'),
    detail: [
      shown
        ? t('Sans fichier .directb2s, VPX n’anime pas l’écran du fronton : pendant la partie, il montre « {name} », le média Backglass de la table.', { name: shown.name })
        : t('Sans fichier .directb2s, VPX n’anime pas l’écran du fronton : pendant la partie, il montre le titre de la table, ou le média de fronton commun à la borne s’il y en a un.'),
      facts?.vrRoom ? t('En VR, la table montre le fronton de sa propre pièce.') : t('Un fichier .directb2s ajouté avec « Ajouter une table » l’anime.'),
    ].join(' '),
  };
}

/** A PuP-Pack of the table (the one its script or its ROM loads) occupies the backglass screen. */
function pupShowsBackglass(entry: TableEntry, facts: ScriptFacts | undefined): boolean {
  const dir = pupVideosDir(entry.folder);
  if (!dir) return false;
  const alone = listSafe(entry.folder).filter((f) => f.toLowerCase().endsWith('.vpx')).length <= 1;
  const packs = packsOfTable(activePacks(entry.folder), facts ? expectedPackNames(facts) : undefined, alone);
  return packs.some((pack) => {
    const root = findPackRoot(path.join(dir, pack)) ?? path.join(dir, pack);
    // Without screens.pup, the one Cyber Pinball writes before the game (pupNoScreens).
    const own = packScreens(root);
    const screens = own.length ? own : parseScreens(defaultScreensPup(root) ?? '');
    return screens.length > 0 && pupWindows(screens).backglass;
  });
}

/**
 * PuP-Pack that the table script cannot drive (packDrivers, scriptB2sEvents): its
 * E triggers wait for numbers this script never sends, and nothing else (recognised DMD
 * image, screen that shows something on its own) animates it. No fix: it is
 * the pack of another version of the game.
 */
function notDrivenFinding(dir: string, pack: string, facts: ScriptFacts): Finding | undefined {
  const drivers = packDrivers(findPackRoot(dir) ?? dir);
  const sent = facts.b2sEvents ?? [];
  if (!drivers.events.length || drivers.events.some((e) => sent.includes(e)) || drivers.defaults || (drivers.capture && facts.drawsDmd)) return undefined;
  const range = (n: number[]) => (n.length === 1 ? `E${n[0]}` : t('E{from} à E{to}', { from: String(n[0]), to: String(n.at(-1)) }));
  return {
    code: 'pupNotDriven',
    severity: 'warning',
    title: t('PuP-Pack fait pour une autre version de la table'),
    detail: [
      t('Le pack « {pack} » n’affiche rien sans les événements que le script de sa table lui envoie ({wanted}).', { pack, wanted: range(drivers.events) }),
      sent.length
        ? t('Le script de cette version n’en envoie aucun : seulement {sent}, pour les effets DOF de la borne.', { sent: range(sent) })
        : t('Le script de cette version n’en envoie aucun.'),
      t('Le fronton et l’écran du pack restent noirs. Installez la version du jeu qui demande ce pack (« incl. PuP » ou note de VPS dans le catalogue), ou retirez le pack.'),
    ].join(' '),
  };
}

/**
 * Table DMD set for desktop mode (tableoptions.ts): on a cabinet that has a DMD screen or
 * area, the table option switches to FlexDMD in the table's .ini, as long as the player has not
 * made their own choice there. Set before each game and as soon as it is installed (PUP_PLAY_REPAIRS).
 */
function desktopDmdFinding(entry: TableEntry, ctx: DoctorContext): Finding | undefined {
  const script = ctx.script;
  if (!ctx.cabinet?.dmd || !script || 'error' in script || !script.dmdOptions?.length) return undefined;
  const ini = findTableIni(entry.file);
  const text = ini.exists ? fs.readFileSync(ini.path, 'latin1') : '';
  const update = cabinetDmdIni(text, script.dmdOptions);
  if (!update) return undefined;
  const params = {
    options: formatList(update.applied.map((o) => `« ${o.name} »`)),
    from: formatList(update.applied.map((o) => `« ${o.from} »`)),
    to: formatList(update.applied.map((o) => `« ${o.to} »`)),
    file: path.basename(ini.path),
  };
  return {
    code: 'dmdDesktopOption',
    severity: 'warning',
    title: t('DMD réglé pour le mode bureau'),
    detail: t(
      'Le script de la table choisit son DMD par {options} dans le menu de VPX (F12), réglé par défaut sur {from} : un DMD dessiné dans le décor du mode bureau, invisible sur une borne, et la fenêtre du DMD reste noire. Sur cette borne, l’option passe sur {to} dans {file} : la table n’est pas modifiée, et le menu de VPX permet d’y revenir.',
      params,
    ),
    fix: { label: t('Régler {options} sur {to} dans {file}', params), ops: [{ op: 'write', path: ini.path, content: update.content, encoding: 'latin1' }] },
  };
}

/** Files of a pack renamed so that the PUP plugin starts its playlists like PinUP Player (playlistRenames). */
function playlistOrderFinding(pack: string, root: string, renames: PlaylistRename[]): Finding {
  const first = renames[0]!;
  const params = {
    pack,
    playlist: first.playlist,
    wrong: first.wrong,
    right: path.basename(first.from),
    to: path.basename(first.to),
    n: renames.length,
  };
  return {
    code: 'pupPlaylistOrder',
    severity: 'warning',
    title: t('Playlist du PuP-Pack lue dans le mauvais ordre'),
    detail: [
      t('Le plugin PUP trie les fichiers en tenant compte des majuscules, PinUP Player non : dans pupvideos\\{pack}\\{playlist}, il commencerait par « {wrong} » au lieu de « {right} », que l’auteur a nommé pour passer en premier (souvent une image transparente). Un écran du pack montrerait ce fichier à la place.', params),
      renames.length > 1 ? tn(renames.length - 1, 'Une autre playlist est dans ce cas.', '{n} autres playlists sont dans ce cas.', { n: renames.length - 1 }) : '',
    ]
      .filter(Boolean)
      .join(' '),
    fix: {
      label: tn(renames.length, 'Renommer « {right} » en « {to} »', 'Renommer {n} fichiers pour rétablir l’ordre', params),
      ops: renames.map((r) => ({ op: 'move' as const, from: path.join(root, r.from), to: path.join(root, r.to) })),
    },
  };
}

/**
 * Pack files that the PUP plugin reads differently from PinUP Player (pupfiles.ts): renamed, and
 * each .pup that names them rewritten (options included), the old .pup files to the recycle bin.
 */
function packFileNamesFinding(pack: string, root: string, media: PackFileFixes): Finding {
  return {
    code: 'pupFileNames',
    severity: 'warning',
    title: t('Fichiers du PuP-Pack que le plugin PUP lirait mal'),
    detail: describeRenames(media.renames),
    fix: {
      label: tn(media.renames.length, 'Renommer le fichier dans pupvideos\\{pack}', 'Renommer {n} fichiers dans pupvideos\\{pack}', { pack, n: media.renames.length }),
      ops: [
        ...media.renames.map((r) => ({ op: 'move' as const, from: path.join(root, r.from), to: path.join(root, r.to) })),
        ...media.writes.map((w) => ({ op: 'write' as const, path: path.join(root, w.file), content: w.content, encoding: 'latin1' as const })),
      ],
    },
  };
}

/** Cyber Pinball's .vbs derived from the script of a previous version of the table. */
function staleFinding(override: Override): Finding {
  const file = path.basename(override.file);
  const content = override.state.kind === 'stale' ? override.state.content : undefined;
  return {
    code: 'scriptPatchStale',
    severity: 'warning',
    title: t('Script adapté pour une ancienne version de la table'),
    detail: t('Cyber Pinball a écrit {file} d’après le script d’une version précédente de la table : VPX joue cet ancien script avec la nouvelle table.', { file }),
    fix: content
      ? { label: t('Refaire {file} d’après le nouveau script', { file }), ops: [{ op: 'write', path: override.file, content, encoding: 'latin1' }] }
      : { label: t('Mettre {file} à la corbeille', { file }), ops: [{ op: 'trash', path: override.file }] },
  };
}

/**
 * Script that the current core.vbs stops and the old ones let through (scriptcompat.ts):
 * VPX plays Cyber Pinball's .vbs, fixed line for line; a .vbs from elsewhere is
 * fixed itself. `forced`: fixes requested by the message of a stopped game, which the
 * text alone did not show (repairScriptAfterStop). undefined when nothing needs fixing.
 */
function coreCompatFinding(entry: TableEntry, ctx: DoctorContext, override: Override | undefined, forced: CompatFix[] = []): Finding | undefined {
  // A .vbs derived from an old version of the table is rebuilt first (scriptPatchStale).
  if (override?.state.kind === 'stale') return undefined;
  const foreign = override?.state.kind === 'foreign' ? override : undefined;
  const own = ownParts(override);
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  // The table script is read again only if needed: the cached reading already says what it requests.
  if (!foreign && facts && [...(facts.coreCompat ?? []), ...forced].every((f) => own.compat.includes(f))) return undefined;
  const source = foreign ? foreign.text : readVpxScript(entry.file);
  const code = source !== undefined ? scriptCode(source) : undefined;
  const asked = code !== undefined ? compatFixesApplicable(forced, code) : forced;
  const wanted = [...new Set([...(code !== undefined ? compatFixesFound(code) : (facts?.coreCompat ?? [])), ...asked])];
  const done = foreign ? compatFixesApplied(foreign.text) : own.compat;
  // A fix requested by the log stays, even if the text alone does not request it (b2sArgs).
  const missing = wanted.filter((f) => !done.includes(f));
  if (!missing.length) return undefined;
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  let content: string | undefined;
  if (foreign) content = applyCompatFixes(foreign.text, missing);
  else if (source !== undefined) {
    const compat = [...new Set([...own.compat, ...missing])];
    content = buildScriptPatch(source, own.switches, own.loader, own.capture, compat, own.prewarm) ?? buildScriptPatch(source, own.switches, own.loader, undefined, compat, own.prewarm);
  }
  // Call to the B2S backglass that VPX's plugin refuses (text instead of a number): the script stopped there.
  if (missing.every((f) => f === 'b2sArgs')) {
    return {
      code: 'scriptCoreCompat',
      severity: 'warning',
      title: t('Script arrêté par le fronton B2S de VPX'),
      detail: [
        t('Le script envoie au fronton B2S de VPX un texte là où il attend un nombre : le fronton refuse l’appel, et la procédure qui l’appelait s’arrête, avec la suite de la table.'),
        !content
          ? t('Le script de la table est protégé : Cyber Pinball ne peut pas le corriger.')
          : foreign
            ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table : un nombre écrit en texte est converti, et un appel encore refusé n’arrête plus le script.', { file })
            : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où un nombre écrit en texte est converti, et où un appel encore refusé n’arrête plus le script.', { file }),
      ].join(' '),
      fix: content ? { label: t('Adapter les appels au fronton B2S (dans {file})', { file }), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
    };
  }
  // DMD folder looked for in TablesDirectory, which is not the table's folder (scriptcompat.ts).
  if (missing.every((f) => f === 'tablesDirectoryDmd')) {
    const folder = facts?.dmdFolder ?? 'UltraDMD';
    return {
      code: 'scriptCoreCompat',
      severity: 'warning',
      title: t('DMD cherché hors du dossier de la table'),
      detail: [
        t('Le script cherche le dossier « {folder} » dans TablesDirectory : VPX y met son propre dossier Tables, pas celui de la table. Ce DMD resterait vide.', { folder }),
        !content
          ? t('Le script de la table est protégé : Cyber Pinball ne peut pas le corriger.')
          : foreign
            ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table : il cherche ce dossier dans celui de la table.', { file })
            : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script qui cherche ce dossier dans celui de la table.', { file }),
      ].join(' '),
      fix: content ? { label: t('Chercher le DMD dans le dossier de la table (dans {file})', { file }), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
    };
  }
  // Procedures redefined during the game (FlashForMs and SetFlash blinking): the only fix missing.
  // vpmTimer timers described by a text: compiled by Execute at each deadline.
  if (missing.filter((f) => f !== 'tablesDirectoryDmd').every((f) => f === 'executeGlobalOnce' || f === 'timerTextOnce')) {
    const blinks = missing.includes('executeGlobalOnce');
    const timers = missing.includes('timerTextOnce');
    const detail = [
      ...(blinks ? [t('Le script de la table redéfinit des procédures pendant la partie (ExecuteGlobal, à chaque clignotement d’une lumière). Windows fait analyser chacune par son antivirus, et la partie s’arrête le temps de l’analyse : de quelques millisecondes à une seconde selon le PC.')] : []),
      ...(timers ? [t('Le script de la table décrit des minuteries par un texte (vpmTimer.AddTimer) : VPX compile ce texte à chaque échéance, Windows le fait analyser par son antivirus, et la partie s’arrête le temps de l’analyse.')] : []),
      !content
        ? t('Le script de la table est protégé : Cyber Pinball ne peut pas le corriger.')
        : !timers
          ? foreign
            ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table : une procédure n’est redéfinie que si son texte change.', { file })
            : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où une procédure n’est redéfinie que si son texte change.', { file })
          : foreign
            ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table : chaque texte n’est compilé qu’une fois.', { file })
            : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où chaque texte n’est compilé qu’une fois.', { file }),
    ];
    const label = timers ? t('Ne compiler chaque texte qu’une fois (dans {file})', { file }) : t('Ne redéfinir une procédure que si elle change (dans {file})', { file });
    return {
      code: 'scriptCoreCompat',
      severity: 'warning',
      title: blinks && timers ? t('Script qui arrête la partie à chaque clignotement et à chaque minuterie') : blinks ? t('Script qui arrête la partie à chaque clignotement') : t('Script qui arrête la partie à chaque minuterie'),
      detail: detail.join(' '),
      fix: content ? { label, ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
    };
  }
  // VR room switched on on the screens (VR version of the table, or test switch left at 1): alone, or with vpmInit.
  if (!missing.includes('vpmInitOnce')) {
    const flags = code !== undefined ? vrRoomFlags(code) : [];
    const detail = [
      t('Version VR de la table : son script allume sa pièce VR (meuble, salle, fronton en 3D) même sans casque ({flags}). Sur les écrans, VPX la dessine à chaque image alors qu’elle ne sert que dans le casque.', { flags: formatList(flags.length ? flags : ['VR_Room']) }),
      !content
        ? t('Le script de la table est protégé : prenez sa version sans VR, ou mettez cet interrupteur à 0 dans l’éditeur de VPX.')
        : foreign
          ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table : la pièce ne s’allume plus que dans le casque.', { file })
          : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où la pièce ne s’allume que dans le casque.', { file }),
    ];
    return {
      code: 'scriptCoreCompat',
      severity: 'warning',
      title: t('Pièce VR dessinée hors du casque'),
      detail: detail.join(' '),
      fix: content ? { label: t('Réserver la pièce VR au casque (dans {file})', { file }), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
    };
  }
  const calls = code !== undefined ? vpmInitCallCount(code) : 0;
  const detail = [
    calls >= 2
      ? t('Le script appelle vpmInit {n} fois. Les anciens core.vbs le laissaient faire ; celui de VPX 10.8 arrête la partie dès son lancement (« cvpmFlips2.Init is called twice »).', { n: calls })
      : t('Le script appelle vpmInit plus d’une fois pendant la partie. Les anciens core.vbs le laissaient faire ; celui de VPX 10.8 arrête la partie (« cvpmFlips2.Init is called twice »).'),
    !content
      ? t('Le script de la table est protégé : retirez l’appel en trop à vpmInit dans l’éditeur de VPX.')
      : foreign
        ? t('Corrigé dans {file}, le script que VPX joue à la place de celui de la table.', { file })
        : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où vpmInit ne s’exécute qu’une fois.', { file }),
  ];
  return {
    code: 'scriptCoreCompat',
    severity: 'warning',
    title: t('Script écrit pour un ancien core.vbs'),
    detail: detail.join(' '),
    fix: content ? { label: t('N’exécuter vpmInit qu’une fois (dans {file})', { file }), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
  };
}


/**
 * DMD images that FlexDMD takes from the table ("VPX.name"): decoded on their first display, on the VPX thread, they
 * stop the game (flexprewarm.ts). VPX plays Cyber Pinball's .vbs, which requests them while the table is
 * loading; the table is not modified. A .vbs from elsewhere or from an old version of the table is not touched here.
 */
function flexPrewarmFinding(entry: TableEntry, ctx: DoctorContext, override: Override | undefined): Finding | undefined {
  if (override && override.state.kind !== 'ours') return undefined;
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  if (facts && !facts.drawsDmd) return undefined;
  const source = readVpxScript(entry.file);
  const names = source !== undefined ? readVpxImageNames(entry.file) : undefined;
  const prewarm = source !== undefined && names ? flexPrewarmFor(source, names) : undefined;
  if (!source || !prewarm) return undefined;
  const own = ownParts(override);
  const same = own.prewarm && own.prewarm.variable === prewarm.variable && own.prewarm.images.join('\n') === prewarm.images.join('\n');
  if (same) return undefined;
  const content = buildScriptPatch(source, own.switches, own.loader, own.capture, own.compat, prewarm) ?? buildScriptPatch(source, own.switches, own.loader, undefined, own.compat, prewarm);
  if (!content) return undefined;
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  // Distinct images: a variant ("&dmd=2") is the same image.
  const shown = prewarm.images.filter((id) => !id.includes('&')).length;
  return {
    code: 'flexImagesLate',
    severity: 'warning',
    title: t('Images du DMD chargées en pleine partie'),
    detail: [
      tn(shown, 'Le DMD de cette table montre {n} image rangée dans la table, par FlexDMD.', 'Le DMD de cette table montre {n} images rangées dans la table, par FlexDMD.', { n: shown }),
      t('VPX 10.8.1 lit et décode chacune à son premier affichage, pendant la partie : la partie s’arrête un instant, flippers compris.'),
      t('La table n’est pas modifiée : VPX joue {file}, une copie de son script qui charge ces images pendant le chargement de la table.', { file }),
    ].join(' '),
    fix: { label: t('Charger les images du DMD d’avance (dans {file})', { file }), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] },
  };
}

/** DOF rules of a table (dof.ts): local ini that hides the cabinet's one, table without PinMAME, ROM without effects. */
function dofFindingsFor(folder: string, script: ScriptFacts, dof: DofSetup): Finding[] {
  if (tableIniMasksGlobal(dof, folder)) {
    const local = tableDofIni(folder);
    return [
      {
        code: 'dofLocalIni',
        severity: 'warning',
        title: t('Configuration DOF propre à la table'),
        detail: t('{files} dans le dossier de la table passe avant la configuration DOF de la borne : pour cette table, DOF ne lit que ce fichier, souvent un reste d’archive.', {
          files: formatList(local.map((f) => path.basename(f))),
        }),
        fix: { label: t('Mettre ce fichier à la corbeille et garder la configuration de la borne'), ops: local.map((f) => ({ op: 'trash', path: f })) },
      },
    ];
  }
  if (!script.usesPinmame) {
    return [
      {
        code: 'dofNoPinmame',
        severity: 'info',
        title: t('Pas de LED ni de retours DOF'),
        detail: t('La table n’utilise pas de ROM PinMAME : le plugin DOF de VPX ne démarre que pour une ROM. Les LED et contacteurs de la borne resteront éteints pendant la partie.'),
      },
    ];
  }
  if (script.roms.length && script.roms.every((rom) => dofRomNumbers(dof.ini, rom).length === 0)) {
    return [
      {
        code: 'dofNoConfig',
        severity: 'info',
        title: t('Aucun effet DOF pour cette ROM'),
        detail: t('La configuration DOF de la borne n’a rien pour « {rom} » : les LED et contacteurs ne réagiront pas. Une table récente manque parfois au configtool : réimportez votre configuration depuis configtool.vpuniverse.com.', {
          rom: script.roms[0]!,
        }),
      },
    ];
  }
  return [];
}

/**
 * Game stopped by a VPX dialog box: if its message is the one of a script that the
 * current core.vbs refuses (scriptcompat.ts), Cyber Pinball's .vbs is fixed at once, for the
 * next game. Covers what the script text does not show (a single vpmInit, in a Sub
 * called twice). Returns the settled finding, or undefined.
 */
export function repairScriptAfterStop(entry: TableEntry, ctx: DoctorContext, ops: OpContext, message: string): Finding | undefined {
  if (path.resolve(entry.folder).toLowerCase() === path.resolve(ctx.tablesDir).toLowerCase()) return undefined;
  const base = path.basename(entry.file).replace(/.vpx$/i, '');
  const vbs = listSafe(entry.folder).find((f) => f.toLowerCase() === `${base.toLowerCase()}.vbs`);
  const override = vbs ? readOverride(entry, path.join(entry.folder, vbs)) : undefined;
  const played = override?.state.kind === 'foreign' ? override.text : readVpxScript(entry.file);
  if (played === undefined) return undefined;
  const forced = compatFixesForStop(message, scriptCode(played));
  if (!forced.length) return undefined;
  const finding = coreCompatFinding(entry, ctx, override, forced);
  if (!finding?.fix) return undefined;
  applyOps(finding.fix.ops, ops);
  return finding;
}

/**
 * Repairs that the menu makes on its own before each game, and as soon as it is installed: script that
 * the current core.vbs stops (scriptCoreCompat), and PuP-Packs. They only touch the pack
 * (renamed, moved up, option copied, the old files to the recycle bin) and Cyber Pinball's
 * .vbs, never the table; an option chosen in the game page is kept. Without them,
 * an installed pack stays off as long as the table diagnosis is not opened (2001 - A Space Odyssey,
 * 25 October 2026: game played without the .vbs that switches the pack on), and a table that the core.vbs
 * stops does not start (Back to the Future, 30 October 2026: vpmInit called twice).
 */
export const PUP_PLAY_REPAIRS: readonly Finding['code'][] = ['backglassEmpty', 'scriptCoreCompat', 'flexImagesLate', 'importedView', 'povView', 'dmdDesktopOption','pupPackDisabledScript', 'pupNested', 'pupMissing', 'scriptPatchStale', 'pupDisabledByScript', 'pupNotLoaded', 'pupCaptureUnseen', 'pupOptionNotApplied', 'pupOptionUnsuited', 'pupOptionMismatch', 'pupNoScreens', 'pupHidesDmd', 'pupDmdInBackglass', 'pupDmdBackToBackglass', 'pupPlaylistOrder', 'pupFileNames', 'dmdColorsMisnamed'];

/**
 * Repairable findings of PUP_PLAY_REPAIRS for this table. Without a known script (outdated
 * cache), the script is read in the .vpx (readVpxScript), without launching VPX.
 */
export function pupPlayRepairs(entry: TableEntry, ctx: DoctorContext): Finding[] {
  if (path.resolve(entry.folder).toLowerCase() === path.resolve(ctx.tablesDir).toLowerCase()) return [];
  const base = path.basename(entry.file).replace(/.vpx$/i, '');
  let script = ctx.script;
  if (!script || 'error' in script) {
    const text = readVpxScript(entry.file);
    if (text !== undefined) script = scriptFacts(text);
  }
  const vbs = listSafe(entry.folder).find((f) => f.toLowerCase() === `${base.toLowerCase()}.vbs`);
  const override = vbs ? readOverride(entry, path.join(entry.folder, vbs)) : undefined;
  const found: Finding[] = [];
  const pupOff = tableDisabledPacks(entry, script && !('error' in script) ? script : undefined).length > 0;
  if (override?.state.kind === 'stale' && !pupOff) found.push(staleFinding(override));
  // Fixes requested by the log of the previous game (call refused by VPX's B2S backglass...).
  const session = ctx.vpxLog ? tableLogSession(entry, ctx.vpxLog) : undefined;
  const compat = coreCompatFinding(entry, { ...ctx, script }, override, session ? compatFixesFromLog(session) : []);
  if (compat) found.push(compat);
  const prewarm = compat ? undefined : flexPrewarmFinding(entry, { ...ctx, script }, override);
  if (prewarm) found.push(prewarm);
  const emptyB2s = emptyBackglassFinding(companion(entry.folder, base, true, '.directb2s'));
  if (emptyB2s) found.push(emptyB2s);
  const desktopDmd = desktopDmdFinding(entry, { ...ctx, script });
  if (desktopDmd) found.push(desktopDmd);
  if (script && !('error' in script)) found.push(...dmdColorFindings(entry.folder, script, ctx));
  found.push(...checkPup(entry, { ...ctx, script, vpxLog: undefined }, override));
  // Framing set for the table in its old installation (tableview.ts): only when the direction of the game is checked.
  const view = ctx.orientation && !manualViewFinding(entry.file) ? importedViewFinding(entry.file, ctx.orientation) : undefined;
  if (view) found.push(view);
  // Point de vue fourni avec la table (povview.ts) : seulement quand rien n'est choisi pour elle et le sens est vérifié.
  const pov = ctx.orientation && !view ? povViewFinding(entry.file, ctx.orientation) : undefined;
  if (pov) found.push(pov);
  return found.filter((f) => f.fix && PUP_PLAY_REPAIRS.includes(f.code));
}

/**
 * Applies the repairs of pupPlayRepairs one by one (one may lead to another:
 * pack moved up, then its option), six at most; the replaced files go to the recycle bin.
 * Returns the settled findings, for the log.
 */
export function repairPupForPlay(entry: TableEntry, ctx: DoctorContext, ops: OpContext): Finding[] {
  const done: Finding[] = [];
  for (let round = 0; round < 10; round++) {
    const next = pupPlayRepairs(entry, ctx).find((f) => !done.some((d) => d.code === f.code && d.fix!.label === f.fix!.label));
    if (!next) break;
    applyOps(next.fix!.ops, ops);
    done.push(next);
    // A repair rewrites the .info (recorded option): the next one starts from that one, otherwise
    // the option it has just recorded would look different from the one in place.
    if (fs.existsSync(entry.infoFile)) entry = { ...entry, info: readInfo(entry.infoFile) };
  }
  return done;
}

/** The .vbs that replaces the table script, and whether it comes from Cyber Pinball. */
interface Override {
  file: string;
  /** Content, read as latin1 (one character per byte). */
  text: string;
  state: ScriptPatchState;
}

function readOverride(entry: TableEntry, file: string): Override | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'latin1');
  } catch {
    return undefined;
  }
  // The table script is read only for a .vbs marked by Cyber Pinball.
  const state: ScriptPatchState = readScriptPatch(text) ? scriptPatchState(text, readVpxScript(entry.file)) : { kind: 'foreign' };
  return { file, text, state };
}

/**
 * PuP-Pack switched off by the script: the fix switches on the switch in a .vbs next to
 * the table (scriptpatch.ts), without touching the table; in the .vbs already there if it comes
 * from elsewhere. Without the script text (protected table), the finding says what to change.
 */
/**
 * The option recorded in the .info is not the one whose files are in place (a .bat
 * run by hand, an interrupted copy, the old recognition by the .pup files alone), or
 * is only partly there. Chosen in the game page or partly in place: it is reapplied.
 * Recorded automatically at installation: it is the memory that follows the files.
 */
function pupMismatchFinding(entry: TableEntry, root: string, pack: string, kept: PupVariant, current: AppliedOption, memory: PupMemory): Finding {
  const partial = current.variant === kept;
  const reapply = partial || memory.chosen === 'user';
  const detail = partial
    ? t('pupvideos\\{pack} : « {option} » n’est qu’en partie en place ({differences}).', { pack, option: kept.label, differences: current.differences.join(', ') })
    : t('pupvideos\\{pack} : « {kept} » est l’option retenue ({why}), mais les fichiers en place sont ceux de « {current} ».', {
        pack,
        kept: kept.label,
        current: current.variant.label,
        why: memory.chosen === 'user' ? t('choisie dans la fiche') : t('choisie à l’installation'),
      });
  return {
    code: 'pupOptionMismatch',
    severity: reapply ? 'warning' : 'info',
    title: partial ? t('Option du PuP-Pack incomplète') : t('Option du PuP-Pack différente de celle retenue'),
    detail,
    fix: reapply
      ? { label: t('Réappliquer « {option} »', { option: kept.label }), ops: pupOptionOps(entry, root, pack, kept, memory) }
      : fs.existsSync(entry.infoFile)
        ? { label: t('Retenir « {option} », l’option en place', { option: current.variant.label }), ops: [{ op: 'write', path: entry.infoFile, content: withPupMemory(entry.info, pack, { ...memory, option: current.variant.label }) }] }
        : undefined,
  };
}

/**
 * Switches turned off in the script that VPX will play (`offs`, pupSwitchesToEnable): the
 * launch of the pack, and the PuP-DMD when the pack option occupies the DMD window.
 */
function pupSwitchFinding(entry: TableEntry, pack: string, offs: PupSwitch[], override: Override | undefined, drawsDmd: boolean): Finding {
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  let content: string | undefined;
  if (override && override.state.kind !== 'ours') {
    // .vbs from elsewhere: switched on in this very file, each value on its line.
    let text: string | undefined = override.text;
    for (const sw of offs) text = text === undefined ? undefined : enablePupSwitch(text, sw);
    content = text;
  } else {
    // Our .vbs, or no .vbs: rebuilt from the table's text, copied line for line,
    // with the launch of the pack and the image recognition it already had.
    const embedded = readVpxScript(entry.file);
    const switches = embedded !== undefined ? pupSwitchesToEnable(scriptCode(embedded), drawsDmd) : [];
    const own = ownParts(override);
    if (embedded !== undefined && switches.length) content = buildScriptPatch(embedded, switches, own.loader, own.capture, own.compat, own.prewarm) ?? buildScriptPatch(embedded, switches, undefined, undefined, own.compat, own.prewarm);
  }
  const main = offs.find((s) => s.kind !== 'dmd');
  const dmd = offs.find((s) => s.kind === 'dmd');
  const params = { pack, file, values: describeSwitches(offs, 'value'), enables: describeSwitches(offs, 'enable') };
  const detail: string[] = [];
  if (main) {
    detail.push(
      t('Le script met {variable} = {value} : il ne lance jamais le PuP-Pack, et la partie n’affiche que le fronton et le DMD habituels, même avec pupvideos\\{pack} bien rangé.', {
        ...params,
        variable: main.variable,
        value: main.value,
      }),
    );
  }
  if (dmd) {
    detail.push(
      t('Le script met {variable} = {value} : la PuP-DMD (le score que le pack écrit sur son écran DMD) reste éteinte, et le DMD ne montrerait que le cadre vide du pack.', {
        variable: dmd.variable,
        value: dmd.value,
      }),
    );
  }
  if (content && !override) detail.push(t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où seules ces valeurs changent.', params));
  else if (!content && offs.every((s) => s.enable)) detail.push(t('Mettez {enables} dans le script de la table (éditeur de VPX).', params));
  return {
    code: 'pupDisabledByScript',
    severity: 'warning',
    title: main ? t('PuP-Pack coupé par le script de la table') : t('PuP-DMD coupée par le script de la table'),
    detail: detail.join(' '),
    fix: content ? { label: t('Allumer le PuP-Pack ({enables}, dans {file})', params), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
  };
}

/**
 * The pack that neither the script nor the ROM launch, launched by Cyber Pinball's .vbs: the table
 * script copied, plus the launch at the start of <table>_Init (addPupLoader). A .vbs from
 * elsewhere gets the launch in this very file.
 */
function pupLoaderFinding(entry: TableEntry, pack: string, override: Override | undefined): Finding {
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  const table = readVpxTableName(entry.file);
  const loader: PupLoader = table ? { pack, table } : { pack };
  let content: string | undefined;
  if (override && override.state.kind !== 'ours') content = addPupLoader(override.text, loader);
  else {
    // Our .vbs is rebuilt (the line that marks it would otherwise stay before the added launch).
    const embedded = readVpxScript(entry.file);
    const own = ownParts(override);
    if (embedded !== undefined) content = buildScriptPatch(embedded, own.switches, loader, own.capture, own.compat, own.prewarm) ?? buildScriptPatch(embedded, own.switches, loader, undefined, own.compat, own.prewarm);
  }
  const params = { pack, file, init: table ? `${table}_Init` : '' };
  return {
    code: 'pupNotLoaded',
    severity: 'warning',
    title: t('PuP-Pack jamais lancé'),
    detail: [
      t('Le script de la table ne lance jamais de PuP-Pack, et la table ne joue pas de ROM : le plugin PUP de VPX 10.8.1 ne charge alors rien de lui-même, même avec pupvideos\\{pack} bien rangé. Ce pack est fait pour PinUP Player, que B2S Server lançait sans rien demander au script.', params),
      content && !override
        ? table
          ? t('La table n’est pas modifiée : VPX joue {file}, une copie de son script qui lance le pack au début de {init}.', params)
          : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script qui lance le pack à son chargement.', params)
        : !content
          ? t('Le script de la table est protégé : Cyber Pinball ne peut pas y ajouter le lancement du pack.')
          : '',
    ]
      .filter(Boolean)
      .join(' '),
    fix: content ? { label: t('Lancer le PuP-Pack ({pack}, dans {file})', params), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
  };
}

/** What a Cyber Pinball .vbs keeps when it is rebuilt: switches, launch of the pack, recognition. */
function ownParts(override: Override | undefined): { switches: PupSwitch[]; loader?: PupLoader; capture?: ReturnType<typeof ownCapture>; compat: CompatFix[]; prewarm?: FlexPrewarm } {
  if (override?.state.kind !== 'ours') return { switches: [], compat: [] };
  const { patch } = override.state;
  return { switches: patch.switches, loader: patch.loader, capture: ownCapture(override.text, patch), compat: patch.compat ?? [], prewarm: patch.prewarm };
}

/** Why Cyber Pinball cannot recognise the DMD images of this table. */
function captureBlockerText(blocker: CaptureBlocker | 'protected' | 'size'): string {
  switch (blocker) {
    case 'protected':
      return t('Le script de la table est protégé : Cyber Pinball ne peut pas y ajouter la reconnaissance des images.');
    case 'flex':
      return t('Cyber Pinball ne sait reconnaître que les images de FlexDMD, et ce script ne crée pas d’objet FlexDMD.FlexDMD.');
    case 'depth':
      return t('Le DMD de FlexDMD n’y est pas en niveaux de gris (RenderMode) : ni le plugin ni Cyber Pinball ne reconnaissent ses images.');
    case 'timer':
      return t('Le script n’a pas de minuteur appelé à chaque image (Interval = -1) où brancher la reconnaissance.');
    case 'pup':
      return t('Le script ne garde pas l’objet du pack dans une variable (Set … = CreateObject("PinUpPlayer.PinDisplay")) : Cyber Pinball ne saurait pas à qui envoyer les déclencheurs.');
    case 'size':
      return t('Les captures du pack ne sont pas des images de 128 × 32 en 24 bits : Cyber Pinball ne sait pas les reconnaître.');
  }
}

/**
 * "D" triggers of a pack using PupCapture on a table without a ROM: the PUP plugin does not receive
 * the FlexDMD images (FlexDMDPlugin.cpp l. 556, at commit af26b2d93). Cyber Pinball's .vbs
 * recognises them itself on FlexDMD.DmdPixels and sends the triggers to the pack (pupcapture.ts):
 * in our .vbs, rebuilt with what it already had, or in a .vbs from elsewhere. undefined
 * when the played .vbs already has up-to-date recognition (same captures, same settings).
 * `loaderNeeded`: the pack is launched by Cyber Pinball's .vbs (pupLoaderNeeded).
 */
function pupCaptureFinding(entry: TableEntry, pack: string, root: string, override: Override | undefined, loaderNeeded: boolean): Finding | undefined {
  const { capture, total } = captureTriggers(root);
  if (!capture) return undefined;
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  const params = { pack, file };
  const count = tn(capture, '{n} déclencheur sur {total} attend une image du DMD (PuPCapture).', '{n} déclencheurs sur {total} attendent une image du DMD (PuPCapture).', { n: capture, total });
  const unseen = (blocker: Parameters<typeof captureBlockerText>[0]): Finding => ({
    code: 'pupCaptureUnseen',
    severity: 'warning',
    title: t('Vidéos du PuP-Pack déclenchées par le DMD : sans effet'),
    detail: [
      count,
      t('Le plugin PUP de VPX 10.8.1 ne reçoit ces images que des ROM de PinMAME ; le DMD de cette table (FlexDMD, UltraDMD) ne les lui donne pas : ces vidéos ne se lanceront pas. Restent les vidéos de fond de chaque écran et les déclencheurs envoyés par la table.'),
      captureBlockerText(blocker),
    ].join(' '),
  });
  const foreign = override?.state.kind === 'foreign' ? override : undefined;
  const own = ownParts(override);
  const source = foreign ? foreign.text : readVpxScript(entry.file);
  if (source === undefined) return unseen('protected');
  const code = scriptCode(source);
  // The triggers go to the object that launched the pack: the one of Cyber Pinball's .vbs (already there,
  // or set with the recognition), otherwise the one the script creates.
  const ours = loaderNeeded || own.loader !== undefined || /\bsub\s+CyberPinball_PuPStart\b/i.test(code);
  const settings = captureSettings(code, pack, root, ours ? 'CyberPinball_PuP' : undefined);
  if ('blocker' in settings) return unseen(settings.blocker);
  const current = override ? captureBlock(override.text) : undefined;
  const upToDate = current && sameCapture(current.settings, settings) && (foreign || (own.capture && sameCapture(own.capture.settings, settings)));
  if (upToDate) return undefined;
  const captures = readCaptures(root, settings.depth);
  if (!captures.length) return unseen('size');
  const block = { settings, lines: captureWatchLines(captures, settings, backgroundTriggers(root)) };
  let content: string | undefined;
  if (foreign) content = addCaptureWatch(foreign.text, settings.timer, block.lines);
  else {
    const table = readVpxTableName(entry.file);
    const loader = own.loader ?? (loaderNeeded ? (table ? { pack, table } : { pack }) : undefined);
    content = buildScriptPatch(source, own.switches, loader, block, own.compat, own.prewarm);
  }
  if (!content) return unseen('timer');
  return {
    code: 'pupCaptureUnseen',
    severity: 'warning',
    title: current ? t('Reconnaissance des images du DMD à refaire') : t('Vidéos du PuP-Pack déclenchées par le DMD : sans effet'),
    detail: [
      count,
      current
        ? t('Les captures de pupvideos\\{pack} ou le script ont changé depuis que Cyber Pinball a écrit la reconnaissance des images dans {file}.', params)
        : t('Le plugin PUP de VPX 10.8.1 ne reçoit ces images que des ROM de PinMAME ; FlexDMD ne les lui donne pas.'),
      foreign
        ? t('Cyber Pinball ajoute à {file} la lecture de l’image de FlexDMD, qui envoie ces déclencheurs au pack.', params)
        : t('La table n’est pas modifiée : VPX joue {file}, une copie de son script qui lit l’image de FlexDMD et envoie ces déclencheurs au pack.', params),
    ].join(' '),
    fix: { label: t('Reconnaître les images du DMD ({pack}, dans {file})', params), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] },
  };
}

/**
 * Disabled PuP-Packs of the table (pupdisabled.ts), when it no longer loads any active one:
 * for the game, it is a table without a pack. [] otherwise (no disabled pack, or an active pack
 * it loads prevails). The table diagnosis, the health, the journey and the preparation of each game
 * go through here: a disabled pack is neither requested, nor switched on again, nor relaunched.
 */
export function tableDisabledPacks(entry: TableEntry, facts: PupLoadFacts | undefined): string[] {
  const off = disabledPacks(entry.folder);
  if (!off.length) return [];
  const expected = facts ? expectedPackNames(facts) : undefined;
  const alone = listSafe(entry.folder).filter((f) => f.toLowerCase().endsWith('.vpx')).length <= 1;
  const mine = packsOfTable(off, expected, alone);
  if (!mine.length) return [];
  const active = activePacks(entry.folder);
  const loadsActive = expected?.length ? active.some((a) => expected.some((e) => e.toLowerCase() === a.toLowerCase())) : active.length > 0;
  return loadsActive ? [] : mine;
}

/** Findings of a table with a disabled pack: the state, and Cyber Pinball's .vbs to restore without PuP. */
function pupOffFindings(entry: TableEntry, packs: string[], override: Override | undefined): Finding[] {
  const findings: Finding[] = [
    {
      code: 'pupPackDisabled',
      severity: 'info',
      title: t('PuP-Pack désactivé'),
      detail: t('{list} : désactivé dans « Parties du jeu ». La table se joue sans ses vidéos, comme si le pack n’était pas installé ; « Réactiver le PuP-Pack » le remet tel quel.', {
        list: formatList(packs.map((p) => `${PUP_DISABLED_FOLDER}\\${p}`)),
      }),
    },
  ];
  const script = pupOffScriptFinding(entry, override);
  if (script) findings.push(script);
  return findings;
}

/**
 * Cyber Pinball's .vbs still adapted for the disabled pack (switches on, launch
 * added, DMD image recognition), or derived from an old version of the table: rebuilt
 * from the table script without anything of PuP (only the core.vbs fixes remain), or moved
 * to the recycle bin if it had only that. Without a pack, a PuP-DMD switched on would leave the DMD without a score, and
 * a script that plays its music only without PuP (2001: "if usepup = false then PlaySound") would go
 * silent. A .vbs from elsewhere is not touched. Repaired before each game (PUP_PLAY_REPAIRS).
 */
function pupOffScriptFinding(entry: TableEntry, override: Override | undefined): Finding | undefined {
  if (!override || override.state.kind === 'foreign') return undefined;
  const { patch } = override.state;
  const pupParts = patch.switches.length > 0 || Boolean(patch.loader) || Boolean(patch.capture);
  if (!pupParts && override.state.kind === 'ours') return undefined;
  const embedded = readVpxScript(entry.file);
  const compat = embedded !== undefined ? compatFixesApplicable(patch.compat ?? [], scriptCode(embedded)) : [];
  const prewarm = override.state.kind === 'ours' ? override.state.patch.prewarm : undefined;
  const content = embedded !== undefined && (compat.length || prewarm) ? buildScriptPatch(embedded, [], undefined, undefined, compat, prewarm) : undefined;
  if (content !== undefined && content === override.text) return undefined;
  const file = path.basename(override.file);
  return {
    code: 'pupPackDisabledScript',
    severity: 'warning',
    // Without anything of PuP, only outdated (table updated): rebuilt, but without switching the pack on again.
    title: pupParts ? t('Script encore adapté pour le PuP-Pack désactivé') : t('Script adapté pour une ancienne version de la table'),
    detail: [
      pupParts
        ? t('Cyber Pinball avait adapté {file} pour le PuP-Pack (interrupteur allumé, lancement du pack ou reconnaissance des images du DMD). Le pack désactivé, VPX doit jouer le script de la table tel quel, comme si le pack n’avait jamais été installé.', { file })
        : t('Cyber Pinball a écrit {file} d’après le script d’une version précédente de la table : VPX joue cet ancien script avec la nouvelle table.', { file }),
      content ? t('Seuls les correctifs pour le core.vbs y restent.') : t('Il n’a plus lieu d’être.'),
      t('Réparé de lui-même avant la prochaine partie.'),
    ].join(' '),
    fix: content
      ? { label: t('Refaire {file} sans le PuP-Pack', { file }), ops: [{ op: 'write', path: override.file, content, encoding: 'latin1' }] }
      : { label: t('Mettre {file} à la corbeille', { file }), ops: [{ op: 'trash', path: override.file }] },
  };
}

/** Rules of § 4.4 of the research on PuP-Packs, without launching VPX. */
function checkPup(entry: TableEntry, context: DoctorContext, override?: Override): Finding[] {
  const ctx = { ...context, cabinet: withTableBackglass(entry, context.cabinet) };
  const folder = entry.folder;
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  // Disabled pack (pupdisabled.ts): the table plays as without a pack; nothing is requested.
  const disabled = tableDisabledPacks(entry, facts);
  if (disabled.length) return pupOffFindings(entry, disabled, override);
  const pupDir = pupVideosDir(folder);
  const packs = pupDir ? listDirs(pupDir) : [];
  if (!facts?.pup && !packs.length) return [];
  const findings: Finding[] = [];
  const othersKnown = ctx.otherPackNames !== undefined || listSafe(folder).filter((f) => f.toLowerCase().endsWith('.vpx')).length <= 1;
  // Neither the script nor the ROM launch the pack: Cyber Pinball will launch it (pupNotLoaded), under the
  // game name for B2S, or failing that under the name of the pack's only folder.
  const loader = facts ? pupLoaderNeeded(facts) : false;
  const expected = expectedPackNames(facts);
  if (loader && !expected.length && othersKnown && packs.length === 1) expected.push(packs[0]!);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const matching = packs.filter((p) => expected.some((e) => same(e, p)));
  // A pack expected by another version in the folder is neither orphaned nor to be renamed.
  const others = packs.filter((p) => !matching.includes(p) && !(ctx.otherPackNames ?? []).some((n) => same(n, p)));
  const pupvideos = pupDir ?? path.join(folder, PUP_FOLDER);

  // Duplicate folder: pupvideos\X\X\screens.pup, or extra archive folder.
  const nested = new Set<string>();
  for (const pack of packs) {
    const dir = path.join(pupvideos, pack);
    const root = findPackRoot(dir);
    if (!root || samePathCI(root, dir)) continue;
    nested.add(pack);
    const tmp = `${dir}.cyberpinball-${process.pid}`;
    findings.push({
      code: 'pupNested',
      severity: 'warning',
      title: t('PuP-Pack rangé un dossier trop bas'),
      detail: t('Le plugin PUP lit screens.pup à la racine de pupvideos\\{pack} ; le pack est dans « {where} ».', { pack, where: path.relative(pupvideos, root) }),
      fix: {
        label: t('Remonter le pack dans pupvideos\\{pack}', { pack }),
        ops: [
          { op: 'move', from: root, to: tmp },
          { op: 'trash', path: dir },
          { op: 'move', from: tmp, to: dir },
        ],
      },
    });
  }

  // Pack not found: nothing bears the name the plugin looks for.
  if (facts && expected.length && !matching.length) {
    const wanted = expected[0]!;
    const candidate = othersKnown && others.length === 1 ? others[0] : undefined;
    // The option recorded for the pack follows it under its new name.
    const memory = candidate ? pupMemory(entry.info, candidate) : undefined;
    const keep: FileOp[] = candidate && memory && fs.existsSync(entry.infoFile) ? [{ op: 'write', path: entry.infoFile, content: JSON.stringify(renamePupMemory(entry.info, candidate, wanted), null, 2) + '\n' }] : [];
    findings.push({
      code: 'pupMissing',
      severity: 'warning',
      title: t('PuP-Pack « {name} » introuvable', { name: wanted }),
      detail: [
        loader
          ? t('Le script ne lance pas ce pack : il est fait pour PinUP Player, qui le cherchait sous le nom du jeu pour B2S Server, pupvideos\\{name}. Cyber Pinball le lance sous ce nom.', { name: wanted })
          : t('Le plugin PUP cherche {paths} à côté de la table.', { paths: formatList(expected.map((e) => `pupvideos\\${e}`), 'or') }),
        candidate
          ? t('« {name} » ne sera pas chargé sous ce nom.', { name: candidate })
          : packs.length
            ? t('Présents : {list}.', { list: packs.join(', ') })
            : t('Ajoutez le pack avec « Ajouter une table » : il sera rangé et nommé comme il faut.'),
        t('La table se joue sans ses vidéos.'),
      ].join(' '),
      fix: candidate ? { label: t('Renommer « {from} » en « {to} »', { from: candidate, to: wanted }), ops: [{ op: 'move', from: path.join(pupvideos, candidate), to: path.join(pupvideos, wanted) }, ...keep] } : undefined,
    });
  } else if (loader && !expected.length && othersKnown && others.length) {
    // Safeguard: a pack present that nobody will ever name to the plugin does not go by silently
    // (Game of Thrones LE, 28 October 2026: no finding, no video).
    findings.push({
      code: 'pupMissing',
      severity: 'warning',
      title: t('PuP-Pack jamais chargé'),
      detail: t('Ni le script ni une ROM ne lancent de PuP-Pack, et rien ne dit lequel de ces dossiers lancer : {list}. La table se joue sans ses vidéos ; gardez un seul pack dans pupvideos.', { list: others.map(quote).join(', ') }),
    });
  } else if (matching.length && othersKnown && others.length) {
    const size = others.reduce((sum, p) => sum + sizeOf(path.join(pupvideos, p)), 0);
    findings.push({
      code: 'pupOrphan',
      severity: 'info',
      title: tn(others.length, 'PuP-Pack inutilisé', 'PuP-Packs inutilisés'),
      detail: tn(
        others.length,
        'Le plugin charge pupvideos\\{pack} ; {list} ne sert à aucune table du dossier ({size}).',
        'Le plugin charge pupvideos\\{pack} ; {list} ne servent à aucune table du dossier ({size}).',
        { pack: matching[0]!, list: others.map(quote).join(', '), size: formatSize(size) },
      ),
      fix: {
        label: tn(others.length, 'Mettre le dossier inutilisé à la corbeille', 'Mettre les dossiers inutilisés à la corbeille'),
        ops: others.map((p) => ({ op: 'trash' as const, path: path.join(pupvideos, p) })),
      },
    });
  }

  // Script that never launches the pack ("usePUP = False"): properly stored, it will not be displayed.
  // What counts is the script VPX plays: the .vbs set next to the table if there is one, otherwise the
  // table's, read again in the .vpx (a cached reading may date from before we knew how to see
  // a switch, like "HasPup = enablePupPack" in the Goonies). The PuP-DMD also counts
  // when the option in place occupies the DMD window of a cabinet that has one.
  const drawsDmd = matching.length > 0 && ctx.cabinet?.dmd !== false && packDrawsDmd(path.join(pupvideos, matching[0]!));
  const played = override ? override.text : matching.length && facts?.pup ? readVpxScript(entry.file) : undefined;
  const offs = played !== undefined ? pupSwitchesToEnable(scriptCode(played), drawsDmd) : facts?.pup?.disabledBy ? [facts.pup.disabledBy] : [];
  const off = offs.find((s) => s.kind !== 'dmd');
  if (offs.length && matching.length) findings.push(pupSwitchFinding(entry, matching[0]!, offs, override, drawsDmd));

  // Script that never launches a pack, table without a ROM: the plugin does not load it on its own.
  // Cyber Pinball's .vbs that already launches it counts; a .vbs to rebuild is already reported.
  if (loader && matching.length && override?.state.kind !== 'stale' && !(override && pupScriptFacts(scriptCode(override.text)))) {
    findings.push(pupLoaderFinding(entry, matching[0]!, override));
  }

  // Pack made for another version of the game: the script does not know PuP (Cyber Pinball launches the
  // pack), and the pack displays nothing except on E triggers that this script never sends
  // (JP's Space Cadet v7.0 by JPSalas and the Galaxy Edition pack, 17/11/2026: black backglass).
  if (loader && matching.length && facts?.b2sEvents) {
    const notDriven = notDrivenFinding(path.join(pupvideos, matching[0]!), matching[0]!, facts);
    if (notDriven) findings.push(notDriven);
  }

  for (const pack of matching) {
    const dir = path.join(pupvideos, pack);
    const info = analysePack(findPackRoot(dir) ?? dir);
    const memory = pupMemory(entry.info, pack);

    // Playlist that the plugin starts with a different file from PinUP Player (case-sensitive sort).
    if (!nested.has(pack)) {
      const renames = playlistRenames(info.root);
      if (renames.length) findings.push(playlistOrderFinding(pack, info.root, renames));
    }

    // Files that the plugin reads differently from PinUP Player (image named like a video, name
    // with accents), then files named by the pack and missing: without them, screens stay black.
    if (!nested.has(pack)) {
      const media = packFileFixes(info.root, facts?.pup ? played : undefined);
      if (media.renames.length) findings.push(packFileNamesFinding(pack, info.root, media));
      else {
        const missing = missingPackFiles(info.root);
        if (missing.length) {
          findings.push({
            code: 'pupFilesMissing',
            severity: 'info',
            title: tn(missing.length, 'Fichier du PuP-Pack absent', 'Fichiers du PuP-Pack absents'),
            detail: tn(missing.length, 'pupvideos\\{pack} nomme {list}, absent du pack : ce qu’il devait montrer ne se verra pas.', 'pupvideos\\{pack} nomme {n} fichiers absents du pack ({list}) : ce qu’ils devaient montrer ne se verra pas.', {
              pack,
              n: missing.length,
              list: missing.slice(0, 3).map(quote).join(', ') + (missing.length > 3 ? '…' : ''),
            }),
          });
        }
      }
      // Empty playlists that the pack really plays (active trigger, screen, script): nothing is shown
      // or heard there. An empty playlist that nothing targets does not count (pupfiles.ts).
      const empty = emptyPlayedPlaylists(info.root, facts?.pup ? played : undefined);
      if (empty.length) {
        // The table's music goes through the pack ("Music" playlist): empty, the table is silent (Goldorak, 19/11/2026).
        const music = empty.filter((p) => /music|musique|audio|sound|song/i.test(p));
        findings.push({
          code: 'pupPlaylistsEmpty',
          severity: music.length ? 'warning' : 'info',
          title: tn(empty.length, 'Playlist du PuP-Pack vide', 'Playlists du PuP-Pack vides'),
          detail: [
            tn(empty.length, 'pupvideos\\{pack} joue la playlist {list}, vide ou absente : rien ne s’y verra ni ne s’y entendra.', 'pupvideos\\{pack} joue {n} playlists vides ou absentes ({list}) : rien ne s’y verra ni ne s’y entendra.', {
              pack,
              n: empty.length,
              list: empty.slice(0, 3).map(quote).join(', ') + (empty.length > 3 ? '…' : ''),
            }),
            ...(music.length ? [t('La musique de la table passe par ce pack ({list}) : sans elle, la table est muette. Ses vidéos et sa musique sont souvent un téléchargement à part du pack ; reprenez-le en entier.', { list: music.map(quote).join(', ') })] : []),
          ].join(' '),
        });
      }
    }

    // Pack in the DMD window of a table that draws its own DMD: the score would disappear.
    if (!nested.has(pack) && !off && facts?.drawsDmd && !facts.pup?.labels && ctx.cabinet?.dmd && info.screens.length && pupWindows(info.screens).dmd) {
      const finding = pupHidesDmdFinding(entry.file, pack);
      if (finding) findings.push(finding);
    }

    // PuP-DMD set in the backglass (pack made for a single 16:9 screen): on a cabinet that has a
    // DMD screen, the score moves into the DMD window; put back in the backglass if it no longer has one.
    if (!nested.has(pack) && !off) {
      const finding = pupDmdPlaceFinding(entry, pack, info, memory, ctx.cabinet, facts);
      if (finding) findings.push(finding);
    }

    // Option not applied: variants, and a root without .pup files or with .pup files of no variant.
    // A nested pack is moved up first: otherwise the fix would target the old location.
    const current = appliedOption(info, memory?.option);
    if (!nested.has(pack) && info.variants.length && (!info.pupFiles.length || !current)) {
      const choice = chooseVariant(info.variants, ctx.cabinet, memory?.option);
      const v = choice.chosen!;
      const failed = info.bats.filter((b) => !b.ok);
      const why =
        choice.reason === 'remembered'
          ? t('option choisie à l’installation')
          : choice.reason === 'cabinet' && ctx.cabinet
            ? t('d’après la borne : {cabinet}', { cabinet: describePupCabinet(ctx.cabinet) })
            : choice.reason === 'only'
              ? t('seule option du pack')
              : t('à vérifier : la borne n’est pas configurée');
      findings.push({
        code: 'pupOptionNotApplied',
        severity: info.pupFiles.length ? 'info' : 'warning',
        title: info.pupFiles.length ? t('Option du PuP-Pack modifiée ou inconnue') : t('Option du PuP-Pack non appliquée'),
        detail: [
          info.pupFiles.length
            ? t('Les fichiers .pup de pupvideos\\{pack} ne sont ceux d’aucune option (modifiés à la main, ou mélange après une mise à jour).', { pack })
            : t('pupvideos\\{pack} n’a pas de screens.pup : il faut y recopier une des {n} options du pack.', { pack, n: info.variants.length }),
          t('Options : {list}.', { list: info.variants.map((x) => x.label).join(', ') }),
          failed.length
            ? tn(failed.length, '{list} : lu sans succès, jamais exécuté.', '{list} : lus sans succès, jamais exécutés.', {
                list: failed.map((b) => t('« {name} » ({reason})', { name: b.bat, reason: b.reason ?? '' })).join(', '),
              })
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        fix: {
          label: t('Appliquer « {option} » ({why})', { option: v.label, why }),
          ops: [
            // The option is recorded for the next update of the pack.
            ...pupOptionOps(entry, info.root, pack, v, memory ?? {}),
          ],
        },
      });
    }

    // Pack without screens.pup or option to apply: PinUP Player took its default screens, the
    // PUP plugin creates none and the pack stays off. The screens the pack targets are declared.
    // A pack with options whose option in place does not bring a screens.pup is in the same case
    // (Hellboy, Daredevil, 24: report from a cabinet on 0.1.16-essai.4, 18/11/2026); only an option
    // still to apply (pupOptionNotApplied) comes first: it may bring its own.
    const optionPending = findings.some((f) => f.code === 'pupOptionNotApplied' && f.detail.includes(`pupvideos\\${pack}`));
    const screensPup = !nested.has(pack) && !optionPending ? defaultScreensPup(info.root) : undefined;
    if (screensPup) {
      findings.push({
        code: 'pupNoScreens',
        severity: 'warning',
        title: t('PuP-Pack sans screens.pup'),
        detail: t('pupvideos\\{pack} n’a pas de screens.pup : PinUP Player prenait ses écrans par défaut, le plugin PUP de VPX n’en crée aucun et le pack reste éteint. Ses écrans y sont déclarés comme PinUP les montrait.', { pack }),
        fix: { label: t('Déclarer les écrans du pack'), ops: [{ op: 'write', path: path.join(info.root, 'screens.pup'), content: screensPup }] },
      });
    }

    // Option recorded in the .info that is not the one in place, or only half in place.
    const kept = memory?.option ? info.variants.find((v) => v.label.toLowerCase() === memory.option!.toLowerCase()) : undefined;
    if (!nested.has(pack) && kept && current && (current.variant !== kept || !current.complete)) {
      findings.push(pupMismatchFinding(entry, info.root, pack, kept, current, memory!));
    }

    // Applied option less suited to the cabinet than another (cabinet changed since
    // installation, or automatic choice from another era): unless it was chosen
    // in the game page, the best one is proposed, only if clearly better.
    const applied = current?.variant;
    if (ctx.cabinet && applied && memory?.chosen !== 'user' && info.variants.length > 1) {
      const best = chooseVariant(info.variants, ctx.cabinet);
      if (best.confident && best.chosen && best.chosen !== applied && scoreVariant(best.chosen.traits, ctx.cabinet) - scoreVariant(applied.traits, ctx.cabinet) >= 4) {
        findings.push({
          code: 'pupOptionUnsuited',
          severity: 'warning',
          title: t('Option du PuP-Pack inadaptée à la borne'),
          detail: t('pupvideos\\{pack} applique « {applied} » ({appliedTraits}) ; pour cette borne ({cabinet}), « {best} » ({bestTraits}) convient mieux. Fiche > « PuP-Pack » pour voir et choisir les options.', {
            pack,
            applied: applied.label,
            appliedTraits: variantTraitsLabel(applied),
            cabinet: describePupCabinet(ctx.cabinet),
            best: best.chosen.label,
            bestTraits: variantTraitsLabel(best.chosen),
          }),
          fix: { label: t('Appliquer « {option} »', { option: best.chosen.label }), ops: pupOptionOps(entry, info.root, pack, best.chosen, { ...(memory ?? {}), chosen: undefined }) },
        });
      }
    }

    // Requested screens that the cabinet does not have, and Playfield screen that the plugin does not render.
    if (ctx.cabinet) {
      const has = { topper: ctx.cabinet.topper, backglass: ctx.cabinet.backglass, dmd: ctx.cabinet.dmd };
      const labels = { topper: t('le topper'), backglass: t('le backglass'), dmd: t('le DMD') };
      const lost = new Set<'topper' | 'backglass' | 'dmd'>();
      for (const s of info.screens.filter(isVisible)) {
        // A screen placed in another one (CustomPos) is displayed where its parent is.
        const role = screenRole(s.parent !== undefined && s.parent !== s.num ? s.parent : s.num);
        if (role && role !== 'playfield' && !has[role]) lost.add(role);
      }
      if (lost.size) {
        findings.push({
          code: 'pupScreenAbsent',
          severity: 'info',
          title: t('Écrans du PuP-Pack absents de la borne'),
          detail: t(
            'Le pack montre des vidéos sur {screens}, que la borne n’a pas : elles ne seront pas vues, le reste du pack n’en dépend pas. Rien à réparer ; une option du pack nettement mieux faite pour la borne serait proposée ici.',
            { screens: formatList([...lost].map((r) => labels[r])) },
          ),
        });
      }
    }
    if (info.screens.some((s) => s.num === 3 && isVisible(s) && (s.parent === undefined || s.parent === 3))) {
      findings.push({
        code: 'pupPlayfieldScreen',
        severity: 'info',
        title: t('Vidéos sur le plateau non affichées'),
        detail: t('Le pack utilise l’écran Playfield (3), que le plugin PUP de VPX 10.8.1 n’affiche pas : ces vidéos par-dessus le plateau ne seront pas vues.'),
      });
    }

    // Old pack: the script declares everything, the pack only has video folders.
    if (facts?.pup?.playlistAdd && !info.pupFiles.length && !info.variants.length) {
      findings.push({
        code: 'pupScriptDriven',
        severity: 'info',
        title: t('PuP-Pack piloté par le script'),
        detail: t(
          'pupvideos\\{pack} n’a aucun fichier .pup : c’est le script de la table qui déclare ses playlists (playlistadd). Le plugin PUP le gère en grande partie ; si des vidéos manquent, le journal de VPX dira quelles fonctions ne sont pas prises en charge.',
          { pack },
        ),
      });
    }

    // PuPCapture without PinMAME: the plugin receives DMD images only from PinMAME ROMs
    // (B2SPluginEventStream, GetIdentifyFrame); FlexDMD does not give them to it (FlexDMDPlugin.cpp,
    // "TODO … pup events", at commit af26b2d93). Cyber Pinball's .vbs recognises them on
    // FlexDMD.DmdPixels and sends the triggers (pupCaptureFinding), unless the script sends
    // them itself (B2SData "D…"). A .vbs to rebuild is already reported (scriptPatchStale).
    if (!nested.has(pack) && info.hasPupCapture && facts && !facts.usesPinmame && !facts.pup?.dmdTriggers && override?.state.kind !== 'stale') {
      const finding = pupCaptureFinding(entry, pack, info.root, override, loader);
      if (finding) findings.push(finding);
    }

    // PuPCapture: the recognised images depend on the exact ROM.
    const rom = facts?.usesPinmame ? facts.roms[0] : undefined;
    if (info.hasPupCapture && rom) {
      const origin = memory?.origin;
      const language = romLanguage(rom);
      if (origin && !same(origin, rom) && !same(origin, pack)) {
        findings.push({
          code: 'pupCaptureRom',
          severity: 'warning',
          title: t('PuP-Pack prévu pour une autre ROM'),
          detail: t('Le pack reconnaît les images du DMD (PuPCapture) de la ROM « {origin} », la table joue « {rom} » : certaines vidéos ne se déclencheront pas.', { origin, rom }),
        });
      } else if (language) {
        findings.push({
          code: 'pupCaptureRom',
          severity: 'info',
          title: t('ROM d’une autre langue'),
          detail: t(
            'La table joue « {rom} », semble-t-il une ROM {language}. Le pack reconnaît les images du DMD (PuPCapture) : s’il a été fait pour la ROM anglaise, certaines vidéos ne se déclencheront pas.',
            { rom, language },
          ),
        });
      }
    }
  }

  if (ctx.vpxLog) findings.push(...checkPupLog(entry, ctx.vpxLog, expected, findings));
  return findings;
}

/** Language of a ROM according to its suffix ("acd_170hf"); assumed, to be confirmed on the cabinet. */
export function romLanguage(rom: string): string | undefined {
  const m = /_\d{2,3}[a-z]([fgis])$/i.exec(rom);
  if (!m) return undefined;
  switch (m[1]!.toLowerCase()) {
    case 'f':
      return t('française');
    case 'g':
      return t('allemande');
    case 'i':
      return t('italienne');
    default:
      return t('espagnole');
  }
}

/** What vpinball.log says about the pack during the last game of this table. */
function checkPupLog(entry: TableEntry, log: string, expected: string[], found: Finding[]): Finding[] {
  const lines = log.split(/\r?\n/);
  const loads = lines.map((l, i) => ({ i, file: /LoadGameFromFilename (.+)$/.exec(l)?.[1]?.trim() })).filter((x) => x.file);
  const start = loads.filter((x) => samePathCI(x.file!, entry.file)).at(-1);
  if (!start) return [];
  const end = loads.find((x) => x.i > start.i)?.i ?? lines.length;
  const session = lines.slice(start.i, end);
  // A real game: VPX 10.8.1 writes "Starting script" then "Startup done" (Player::Player);
  // "Starting Play mode" comes from launching from the editor.
  if (!session.some((l) => /Plugin PUP loaded/.test(l)) || !session.some((l) => /Starting Play mode|Starting script|Startup done/.test(l))) return [];
  const findings: Finding[] = [];
  const pathIndex = session.findLastIndex((l) => /PUP path: /.test(l));
  const pupPath = pathIndex >= 0 ? /PUP path: (.+)$/.exec(session[pathIndex]!)![1]!.trim() : undefined;
  if (pupPath && session.slice(pathIndex).some((l) => /No screens\.pup file found/.test(l))) {
    if (!found.some((f) => f.code === 'pupOptionNotApplied' || f.code === 'pupNoScreens')) {
      findings.push({
        code: 'pupLog',
        severity: 'warning',
        title: t('Journal de VPX : pack sans screens.pup'),
        detail: t('À la dernière partie, VPX a chargé « {path} » mais n’y a pas trouvé de screens.pup : les écrans du pack sont restés éteints.', { path: pupPath }),
      });
    }
  } else if (!pupPath && expected.length && !found.some((f) => f.code === 'pupMissing' || f.code === 'pupDisabledByScript' || f.code === 'pupNotLoaded')) {
    findings.push({
      code: 'pupLog',
      severity: 'warning',
      title: t('Journal de VPX : pack non chargé'),
      detail: t('À la dernière partie, le plugin PUP n’a chargé aucun pack (il cherchait pupvideos\\{pack}). Si le pack a été ajouté ou réparé depuis, relancez une partie.', { pack: expected[0]! }),
    });
  }
  const missing = [
    ...new Set(
      session
        .map((l) => /Not implemented:?\s*(.*)$/.exec(l)?.[1]?.split(/[:(,=]/)[0]?.trim())
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  if (missing.length) {
    findings.push({
      code: 'pupLog',
      severity: 'info',
      title: t('Journal de VPX : fonctions PuP non prises en charge'),
      detail: t('La table a demandé au plugin PUP des fonctions qu’il ne gère pas encore ({list}) : une partie du pack peut manquer.', {
        list: missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : ''),
      }),
    });
  }
  return findings;
}

// ---------- Presentation media ----------

/**
 * Proportion gap tolerated between a media and the screen of its role, measured as a
 * ratio (16:10 on 16:9 passes, 4:3 on 16:9 does not): beyond that, the menu crops
 * the playfield or leaves black bars on the other screens.
 */
export const MEDIA_RATIO_TOLERANCE = 0.15;

/**
 * Thresholds of the "very heavy media" finding, by file kind. A one-minute 1080p
 * video weighs 20 to 60 MB, a 4K one up to 150 MB; a 4K image in
 * PNG 10 to 20 MB; a 5-minute music track 5 to 12 MB in mp3, 50 MB in wav.
 */
export const MEDIA_SIZE_LIMITS: Record<MediaKind, number> = {
  image: 25 * 1024 ** 2,
  video: 300 * 1024 ** 2,
  audio: 50 * 1024 ** 2,
};

/** An image with more pixels than the 8K screen (7680 × 4320) takes more than 130 MB once decoded. */
export const MEDIA_MAX_PIXELS = 7680 * 4320;

/** A file of medias\ and what its name says about it. */
interface MediaItem {
  file: string;
  name: string;
  ext: string;
  /** Absent: neither "(Type)" nor a VPinFE name. */
  type?: MediaType;
  /** Name after "(Type)"; absent for a VPinFE name. */
  stem?: string;
  vpinfe?: boolean;
  /** Format read by the menu for this type. */
  accepted: boolean;
}

function mediaItems(dir: string): MediaItem[] {
  return readDirents(dir)
    .filter((d) => d.isFile())
    .map((d) => {
      const file = path.join(dir, d.name);
      const ext = path.extname(d.name).slice(1).toLowerCase();
      const parsed = parseMediaFileName(d.name);
      if (parsed) return { file, name: d.name, ext, type: parsed.type, stem: parsed.stem, accepted: isAcceptedFormat(parsed.type, d.name) };
      const vpinfe = mediaTypeFromVpinfe(d.name);
      if (vpinfe) return { file, name: d.name, ext, type: vpinfe, vpinfe: true, accepted: true };
      return { file, name: d.name, ext, accepted: false };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
}

/**
 * Files that the menu shows for a type and a list of names (the .vpx, then the
 * folder), like resolveMedia at steps 1 to 3: the first page in the preferred
 * format, or all the pages; otherwise the VPinFE name.
 */
function shownMedia(items: MediaItem[], type: MediaType, names: string[]): MediaItem[] {
  const info = mediaTypeInfo(type);
  for (const name of names) {
    const candidates = items
      .filter((i) => i.type === type && i.stem !== undefined && i.accepted)
      .map((i) => ({ i, page: pageOf(i.stem!, name) }))
      .filter((c) => c.page !== undefined);
    if (!candidates.length) continue;
    if (info.pages) return candidates.sort((a, b) => a.page! - b.page!).map((c) => c.i);
    const first = candidates.filter((c) => c.page === 1).map((c) => c.i);
    if (!first.length) continue;
    return [first.sort((a, b) => info.formats.indexOf(a.ext) - info.formats.indexOf(b.ext))[0]!];
  }
  for (const alias of info.aliases.vpinfe) {
    const found = items.find((i) => i.vpinfe && i.name.toLowerCase() === alias);
    if (found) return [found];
  }
  return [];
}

/** "a", "b" and 3 others. */
function quoteList(names: string[], max = 4): string {
  const shown = names.slice(0, max).map(quote);
  const rest = names.length - shown.length;
  return formatList(rest > 0 ? [...shown, tn(rest, '{n} autre', '{n} autres')] : shown);
}

/** "name" (quotation marks of the language). */
function quote(name: string): string {
  return t('« {name} »', { name });
}

const ROLE_LABELS: Record<RoleId, string> = {
  get playfield() {
    return t('le plateau');
  },
  get backglass() {
    return t('le fronton');
  },
  get dmd() {
    return t('le DMD');
  },
  get topper() {
    return t('le topper');
  },
};

const MEDIA_ERROR_LABELS: Record<MediaErrorKind, string> = {
  get decode() {
    return t('décodage impossible (fichier abîmé, ou codec non pris en charge)');
  },
  get unsupported() {
    return t('format ou codec refusé');
  },
  get image() {
    return t('image illisible');
  },
  get network() {
    return t('fichier illisible sur le disque (verrouillé, ou disque en erreur)');
  },
  get other() {
    return t('erreur de lecture');
  },
};

/** Errors due to the file itself: it will not be read any better the next time. */
const FILE_ERRORS: readonly MediaErrorKind[] = ['decode', 'unsupported', 'image'];

/** Folders of a PuP-Pack, a ROM or a DMD drawn by the script: never menu media. */
function notMediaFolder(name: string, dmdFolder: string | undefined): boolean {
  const n = name.toLowerCase();
  return ['medias', 'pinmame', 'cache'].includes(n) || isPupFolderName(n) || n === dmdFolder?.toLowerCase() || /\.ultradmd$|flexdmd/i.test(n);
}

/** Files of a folder, subfolders included. */
function filesUnder(dir: string): string[] {
  return readDirents(dir).flatMap((d) => (d.isDirectory() ? filesUnder(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

/** Media found outside medias\: stored the Popper or PinballX way, or "(Type) name" in the wrong place. */
interface StrayMedia {
  from: string;
  type: MediaType;
  ext: string;
  page: number;
}

function findStrayMedias(folder: string, likeTable: (stem: string) => number | undefined, dmdFolder: string | undefined): StrayMedia[] {
  const out: StrayMedia[] = [];
  const walk = (dir: string, chain: string[]) => {
    const here = chain.at(-1);
    const folderType = here ? (mediaTypeFromFolder('popper', here) ?? mediaTypeFromFolder('pinballx', here)) : undefined;
    // POPMedia\Visual Pinball X\Wheel, PinUPSystem\POPMedia\…, Media\Visual Pinball\Wheel Images.
    const frontendTree = chain.slice(0, -1).some((c) => /^(popmedia|pinupsystem|media)$/i.test(c) || /^visual ?pinball/i.test(c));
    for (const d of readDirents(dir)) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (chain.length < 4 && !notMediaFolder(d.name, dmdFolder)) walk(p, [...chain, d.name]);
        continue;
      }
      if (!d.isFile() || !mediaKind(d.name)) continue;
      const ext = path.extname(d.name).slice(1).toLowerCase();
      const parsed = parseMediaFileName(d.name);
      if (parsed) {
        out.push({ from: p, type: parsed.type, ext, page: likeTable(parsed.stem) ?? 1 });
        continue;
      }
      const stem = d.name.slice(0, d.name.length - ext.length - 1);
      const page = likeTable(stem);
      if (folderType && (frontendTree || page !== undefined)) out.push({ from: p, type: folderType, ext, page: page ?? 1 });
    }
  };
  walk(folder, []);
  return out;
}

/** Rules of the table diagnosis on the table's media: clear findings, and safe fixes (rename, store, recycle bin). */
function checkMedias(entry: TableEntry, ctx: DoctorContext): Finding[] {
  const findings: Finding[] = [];
  const folder = entry.folder;
  const folderName = path.basename(folder);
  const dir = tableMediaDir(entry);
  const items = mediaItems(dir);
  const own = mediaNames(entry);
  const vpxBases = readDirents(folder)
    .filter((d) => d.isFile() && /\.vpx$/i.test(d.name))
    .map((d) => d.name.slice(0, -4));
  // Each version in the folder looks for its .vpx, then the folder.
  const versionNames = (vpxBases.length ? vpxBases : [own[0]!]).map((b) => (b.toLowerCase() === folderName.toLowerCase() ? [b] : [b, folderName]));
  const allNames = [...new Set(versionNames.flat())];
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  const dims = new Map<string, MediaDimensions | undefined>();
  const dimsOf = (file: string) => {
    if (!dims.has(file)) dims.set(file, readMediaDimensions(file));
    return dims.get(file);
  };
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  const label = (type: MediaType) => mediaTypeInfo(type).label;
  const move = (from: string, to: string): FileOp => ({ op: 'move', from, to });
  // Files already renamed or moved to the recycle bin by a fix further up:
  // "Tout réparer" (Repair all) applies the fixes one after the other.
  const claimed = new Set<string>();
  const claim = (file: string) => claimed.add(file.toLowerCase());
  const free = (file: string) => !claimed.has(file.toLowerCase());

  // Format unreadable by the menu, or not intended for this type.
  const unreadable = items.filter((i) => i.type && !i.accepted);
  if (unreadable.length) {
    const redundant = unreadable.filter((i) =>
      items.some((o) => o !== i && o.type === i.type && o.accepted && (o.stem ?? '').toLowerCase() === (i.stem ?? '').toLowerCase()),
    );
    redundant.forEach((i) => claim(i.file));
    const old = unreadable.filter((i) => UNREADABLE_FORMATS.includes(i.ext));
    const wrong = unreadable.filter((i) => !old.includes(i));
    findings.push({
      code: 'mediaUnreadable',
      severity: 'warning',
      title: tn(unreadable.length, 'Média dans un format que le front-end ne lit pas', 'Médias dans un format que le front-end ne lit pas'),
      detail: [
        old.length
          ? tn(
              new Set(old.map((i) => i.ext)).size,
              '{files} : {exts}, ancien format de PinUP Popper que le front-end (Chromium) ne lit pas. Convertissez en mp4 (H.264) ou en webm, par exemple avec HandBrake.',
              '{files} : {exts}, anciens formats de PinUP Popper que le front-end (Chromium) ne lit pas. Convertissez en mp4 (H.264) ou en webm, par exemple avec HandBrake.',
              { files: quoteList(old.map((i) => i.name)), exts: [...new Set(old.map((i) => i.ext))].join(', ') },
            )
          : '',
        ...wrong.map((i) => t('« {name} » : un média « {type} » se lit en {formats}.', { name: i.name, type: label(i.type!), formats: mediaTypeInfo(i.type!).formats.join(', ') })),
        redundant.length ? t('{files} : une version lisible porte le même nom, c’est elle qui est montrée.', { files: quoteList(redundant.map((i) => i.name)) }) : '',
        redundant.length < unreadable.length ? t('En attendant, le front-end passe au média suivant ou à l’affichage par défaut.') : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: redundant.length
        ? {
            label:
              redundant.length > 1
                ? t('Mettre les {n} fichiers en double à la corbeille (une version lisible existe)', { n: redundant.length })
                : t('Mettre « {name} » à la corbeille (une version lisible existe)', { name: redundant[0]!.name }),
            ops: redundant.map((i) => ({ op: 'trash' as const, path: i.file })),
          }
        : undefined,
    });
  }

  // 4:1 DMD stored as 16:9 FullDMD, or the reverse. The DMD screen already takes, among the table's
  // displays, the one that fills it best, whatever its label (resolveRoleMedia): the
  // label changes nothing in what is shown. The finding only appears if the file can be
  // renamed according to its proportions (it gets its place back in the table's media); when
  // the other label is already taken, there is nothing to do: each screen takes the one that suits it
  // ("(DMD)" in 21:9 and "(FullDMD)" in 16:9 of a table taken over from PinUP Popper, 17/11/2026).
  // A misnamed media is renamed first; its type is checked at the next analysis.
  const named = (i: MediaItem) => i.stem !== undefined && allNames.some((n) => pageOf(i.stem!, n) !== undefined);
  const swapped: { item: MediaItem; actual: MediaType; ratio: number; to: string }[] = [];
  for (const item of items.filter((i) => (i.type === 'DMD' || i.type === 'FullDMD') && named(i) && i.accepted)) {
    const d = dimsOf(item.file);
    if (!d) continue;
    const actual = dmdTypeForRatio(Math.max(d.width, d.height) / Math.min(d.width, d.height));
    if (actual === item.type) continue;
    const target = `(${actual}) ${item.stem}.${item.ext}`;
    const conflict = items.some((o) => o.type === actual && (o.stem ?? '').toLowerCase() === item.stem!.toLowerCase()) || taken.has(target.toLowerCase());
    if (conflict) continue;
    taken.add(target.toLowerCase());
    claim(item.file);
    swapped.push({ item, actual, ratio: d.width / d.height, to: path.join(dir, target) });
  }
  if (swapped.length) {
    findings.push({
      code: 'mediaDmdSwapped',
      severity: 'info',
      title: tn(swapped.length, 'Afficheur rangé sous le mauvais type', 'Afficheurs rangés sous le mauvais type'),
      detail: [
        ...swapped.map((s) =>
          t('« {name} » est en {ratio} : c’est un média « {actual} » ({type}), pas « {wrong} ».', {
            name: s.item.name,
            ratio: ratioLabel(s.ratio),
            actual: label(s.actual),
            type: s.actual,
            wrong: label(s.item.type!),
          }),
        ),
        t('Le front-end le montre déjà sur l’écran du DMD s’il le remplit mieux que l’autre afficheur ; renommé, il retrouve sa place dans les médias de la table.'),
      ].join(' '),
      fix: {
        label: swapped.length > 1 ? t('Renommer les {n} fichiers selon leurs proportions', { n: swapped.length }) : t('Renommer en « {name} »', { name: path.basename(swapped[0]!.to) }),
        ops: swapped.map((s) => move(s.item.file, s.to)),
      },
    });
  }
  // Renamed further up: they do not count among the duplicates of their old type.
  const swappedFiles = new Set(swapped.map((s) => s.item.file));

  // Name that matches neither a .vpx in the folder nor the folder.
  const misnamed = items.filter((i) => i.type && i.stem !== undefined && !named(i));
  const typeless = items.filter((i) => !i.type && mediaKind(i.name));
  if (misnamed.length || typeless.length) {
    const renames: { item: MediaItem; to: string }[] = [];
    const kept: { item: MediaItem; shown: MediaItem }[] = [];
    const blocked: MediaItem[] = [];
    for (const item of misnamed.filter((i) => free(i.file))) {
      const type = item.type!;
      const shown = shownMedia(items, type, own);
      if (!mediaTypeInfo(type).pages && shown.length) {
        kept.push({ item, shown: shown[0]! });
        continue;
      }
      let page = 1;
      let target = mediaFileName(entry, type, item.ext, page);
      if (mediaTypeInfo(type).pages) {
        const used = (n: number) => [...taken].some((t) => parseMediaFileName(t)?.type === type && pageOf(parseMediaFileName(t)!.stem, folderName) === n);
        while (used(page)) page++;
        target = mediaFileName(entry, type, item.ext, page);
      }
      if (taken.has(target.toLowerCase())) {
        blocked.push(item);
        continue;
      }
      taken.add(target.toLowerCase());
      claim(item.file);
      renames.push({ item, to: path.join(dir, target) });
    }
    findings.push({
      code: 'mediaMisnamed',
      severity: misnamed.length ? 'warning' : 'info',
      title: tn(misnamed.length + typeless.length, 'Média mal nommé', 'Médias mal nommés'),
      detail: [
        misnamed.length
          ? own[1]
            ? tn(
                misnamed.length,
                'Le front-end cherche les médias sous le nom du .vpx (« {vpx} ») ou du dossier (« {folder} ») : {files} n’est pas montré.',
                'Le front-end cherche les médias sous le nom du .vpx (« {vpx} ») ou du dossier (« {folder} ») : {files} ne sont pas montrés.',
                { vpx: own[0]!, folder: own[1], files: quoteList(misnamed.map((i) => i.name)) },
              )
            : tn(
                misnamed.length,
                'Le front-end cherche les médias sous le nom du .vpx (« {vpx} ») : {files} n’est pas montré.',
                'Le front-end cherche les médias sous le nom du .vpx (« {vpx} ») : {files} ne sont pas montrés.',
                { vpx: own[0]!, files: quoteList(misnamed.map((i) => i.name)) },
              )
          : '',
        ...kept.map((k) => t('« {name} » : « {shown} » porte déjà le bon nom et c’est lui qui est montré ; gardez l’un des deux.', { name: k.item.name, shown: k.shown.name })),
        blocked.length ? t('{files} : le nom attendu est déjà pris dans medias\\.', { files: quoteList(blocked.map((i) => i.name)) }) : '',
        typeless.length
          ? t('{files} : type inconnu. Le nom doit commencer par le type entre parenthèses, « (Backglass) {folder}.mp4 » par exemple.', {
              files: quoteList(typeless.map((i) => i.name)),
              folder: folderName,
            })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: renames.length
        ? {
            label:
              renames.length > 1
                ? t('Renommer les {n} fichiers « (Type) {folder} »', { n: renames.length, folder: folderName })
                : t('Renommer en « {name} »', { name: path.basename(renames[0]!.to) }),
            ops: renames.map((r) => move(r.item.file, r.to)),
          }
        : undefined,
    });
  }

  // Media stored the Popper or PinballX way in the table's folder, outside medias\.
  const keys = [entry.title, ...vpxBases, folderName].map((r) => nameKey(parseTableName(r).title)).filter(Boolean);
  const likeTable = (stem: string): number | undefined => {
    for (const name of allNames) {
      const page = pageOf(stem, name);
      if (page !== undefined) return page;
    }
    const k = nameKey(parseTableName(stem).title);
    return k && keys.some((r) => k === r || (k.length >= 4 && (k.includes(r) || r.includes(k)))) ? 1 : undefined;
  };
  const strays = findStrayMedias(folder, likeTable, facts?.dmdFolder).sort(
    (a, b) => a.type.localeCompare(b.type) || a.page - b.page || mediaTypeInfo(a.type).formats.indexOf(a.ext) - mediaTypeInfo(b.type).formats.indexOf(b.ext),
  );
  if (strays.length) {
    const ops: FileOp[] = [];
    const moved: string[] = [];
    // Left in place: medias\ already shows this type (shown), or the expected name is taken.
    const left: { s: StrayMedia; shown?: string }[] = [];
    for (const s of strays) {
      const info = mediaTypeInfo(s.type);
      const shown = info.pages ? undefined : shownMedia(items, s.type, own)[0];
      if (shown) {
        left.push({ s, shown: shown.name });
        continue;
      }
      let page = info.pages ? s.page : 1;
      const pageTaken = (n: number) => [...taken].some((t) => parseMediaFileName(t)?.type === s.type && pageOf(parseMediaFileName(t)!.stem, folderName) === n);
      if (info.pages) while (pageTaken(page)) page++;
      const target = mediaFileName(entry, s.type, s.ext, page);
      if (taken.has(target.toLowerCase())) {
        left.push({ s });
        continue;
      }
      taken.add(target.toLowerCase());
      ops.push(move(s.from, path.join(dir, target)));
      moved.push(s.from);
    }
    // Emptied tree (POPMedia\…): its empty folders go to the recycle bin.
    const tops = [...new Set(moved.map((f) => path.relative(folder, f).split(path.sep)).filter((parts) => parts.length > 1).map((parts) => parts[0]!))];
    for (const top of tops) {
      const all = filesUnder(path.join(folder, top));
      if (all.every((f) => moved.some((m) => samePathCI(m, f)))) ops.push({ op: 'trash', path: path.join(folder, top) });
    }
    const rel = (s: StrayMedia) => path.relative(folder, s.from);
    findings.push({
      code: 'mediaStray',
      // Nothing to store: the table already has its media, these are only leftovers.
      severity: moved.length ? 'warning' : 'info',
      title: tn(strays.length, 'Média rangé hors de medias\\', 'Médias rangés hors de medias\\'),
      detail: [
        tn(
          strays.length,
          'Le front-end ne cherche les médias que dans medias\\, sous le nom « (Type) {folder} » : {files} n’est pas montré (rangement de PinUP Popper ou de PinballX, ou fichier posé à côté de la table).',
          'Le front-end ne cherche les médias que dans medias\\, sous le nom « (Type) {folder} » : {files} ne sont pas montrés (rangement de PinUP Popper ou de PinballX, ou fichier posé à côté de la table).',
          { folder: folderName, files: quoteList(strays.map(rel)) },
        ),
        ...left.map((l) =>
          l.shown
            ? t('« {file} » : medias\\ montre déjà « {shown} » ; gardez l’un des deux, rien n’est déplacé.', { file: rel(l.s), shown: l.shown })
            : t('« {file} » : le nom attendu est déjà pris dans medias\\, il n’est pas déplacé.', { file: rel(l.s) }),
        ),
      ]
        .filter(Boolean)
        .join(' '),
      fix: moved.length
        ? {
            label:
              moved.length > 1
                ? t('Ranger les {n} médias dans medias\\ sous le nom « (Type) {folder} »', { n: moved.length, folder: folderName })
                : t('Ranger le média dans medias\\ sous le nom « (Type) {folder} »', { folder: folderName }),
            ops,
          }
        : undefined,
    });
  }

  // Proportions that do not match the screen of the role (area included).
  const aspects = ctx.cabinet?.aspects;
  if (aspects) {
    const lines: string[] = [];
    const tolerance = Math.log(1 + MEDIA_RATIO_TOLERANCE);
    const check = (type: MediaType, role: RoleId, note = '', item = shownMedia(items, type, own)[0]) => {
      const screen = aspects[role];
      if (!screen || !item) return false;
      const d = dimsOf(item.file);
      if (!d) return true;
      const size = `${d.width}×${d.height}`;
      if (mediaTypeInfo(type).orientable) {
        // The menu rotates the playfield media according to the flipper edge: only the aspect ratio counts.
        const rm = Math.max(d.width, d.height) / Math.min(d.width, d.height);
        const rs = Math.max(screen, 1 / screen);
        if (Math.abs(Math.log(rm / rs)) <= tolerance) return true;
        const lost = Math.round((1 - Math.min(rm, rs) / Math.max(rm, rs)) * 100);
        const orientation =
          rm < 1.1
            ? t('Presque carré : le front-end ne peut pas savoir où sont les flippers, il le montre tel quel.')
            : d.width > d.height
              ? t('En paysage, les flippers sont supposés à droite : le front-end le tourne ; s’il apparaît à l’envers, « Demi-tour » dans les médias de la table.')
              : '';
        lines.push(
          [
            t('« {name} » ({size}, {ratio}) sur le plateau ({screen}) : le front-end le recadre, {lost} % de l’image coupés.', {
              name: item.name,
              size,
              ratio: ratioLabel(rm),
              screen: ratioLabel(rs),
              lost,
            }),
            orientation,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return true;
      }
      const am = d.width / d.height;
      if (Math.abs(Math.log(am / screen)) <= tolerance) return true;
      const lost = Math.round((1 - Math.min(am, screen) / Math.max(am, screen)) * 100);
      const turned = am > 1.1 !== screen > 1.1 && Math.abs(Math.log(am)) > 0.1 && Math.abs(Math.log(screen)) > 0.1;
      const facing = am < 1 ? t('en portrait sur un écran en paysage') : t('en paysage sur un écran en portrait');
      if (mediaTypeInfo(type).fit === 'fill') {
        // Étiré à tout son écran (le fronton, comme pendant la partie) : jamais de bandes noires, l'image est déformée.
        lines.push(
          t('« {name} » ({size}, {ratio}) sur {role} ({screen}){note} : {how}étiré à tout l’écran comme pendant la partie, image déformée de {lost} %.', {
            name: item.name,
            size,
            ratio: ratioLabel(am),
            role: ROLE_LABELS[role],
            screen: ratioLabel(screen),
            note,
            how: turned ? `${facing}, ` : '',
            lost,
          }),
        );
        return true;
      }
      const how = turned ? facing : am > screen ? t('bandes noires en haut et en bas') : t('bandes noires sur les côtés');
      lines.push(
        t('« {name} » ({size}, {ratio}) sur {role} ({screen}){note} : {how}, {lost} % de l’écran inutilisé.', {
          name: item.name,
          size,
          ratio: ratioLabel(am),
          role: ROLE_LABELS[role],
          screen: ratioLabel(screen),
          note,
          how,
          lost,
        }),
      );
      return true;
    };
    check('Playfield', 'playfield');
    check('Loading', 'playfield');
    check('Backglass', 'backglass');
    check('Topper', 'topper');
    if (aspects.dmd) {
      // The type of the DMD screen (FullDMD or DMD alone), otherwise the proportions of its window.
      const full = ctx.cabinet && cabinetFullDmd(ctx.cabinet);
      const wanted: MediaType = full === undefined ? dmdTypeForRatio(Math.max(aspects.dmd, 1 / aspects.dmd)) : full ? 'FullDMD' : 'DMD';
      const partner: MediaType = wanted === 'DMD' ? 'FullDMD' : 'DMD';
      // The media the DMD screen really shows: of the two displays, the one that fills it best (resolveRoleMedia).
      const mine = shownMedia(items, wanted, own)[0];
      const theirs = shownMedia(items, partner, own)[0];
      const shown = mine && theirs ? bestDmdMedia([mine, theirs], aspects.dmd, (i) => dimsOf(i.file)) : (mine ?? theirs);
      if (shown === mine) check(wanted, 'dmd', '', mine);
      else if (mine) check(partner, 'dmd', t(', qui le remplit mieux que « {name} »', { name: mine.name }), theirs);
      else check(partner, 'dmd', t(', faute de média « {type} » ({code})', { type: label(wanted), code: wanted }), theirs);
    }
    if (lines.length) {
      // Low-key information: nothing to repair in Cyber Pinball, only another file would change anything.
      findings.push({
        code: 'mediaRatio',
        severity: 'info',
        note: true,
        title: tn(lines.length, 'Proportions du média différentes de son écran', 'Proportions des médias différentes de leurs écrans'),
        detail: t('{lines} Le front-end ne déforme jamais un média ; un fichier aux proportions de l’écran l’occupe en entier.', { lines: lines.join(' ') }),
      });
    }
  }

  // Very heavy files.
  const heavy: string[] = [];
  for (const item of items) {
    const kind = mediaKind(item.name);
    if (!kind) continue;
    const size = sizeOf(item.file);
    const d = kind === 'image' ? dimsOf(item.file) : undefined;
    if (size > MEDIA_SIZE_LIMITS[kind]) {
      const kindLabel = kind === 'image' ? t('image') : kind === 'video' ? t('vidéo') : t('son');
      heavy.push(t('« {name} » : {size} ({kind}, seuil {limit}).', { name: item.name, size: formatSize(size), kind: kindLabel, limit: formatSize(MEDIA_SIZE_LIMITS[kind]) }));
    } else if (d && d.width * d.height > MEDIA_MAX_PIXELS) {
      heavy.push(t('« {name} » : {width} × {height} pixels, {size} une fois décodée en mémoire.', { name: item.name, width: d.width, height: d.height, size: formatSize(d.width * d.height * 4) }));
    }
  }
  if (heavy.length) {
    findings.push({
      code: 'mediaHuge',
      severity: 'info',
      title: tn(heavy.length, 'Média très lourd', 'Médias très lourds'),
      detail: tn(
        heavy.length,
        '{list} Le front-end relit ce fichier à chaque passage sur la table, ce qui ralentit la navigation : une vidéo en 1080p ou en 4K (réencodée avec HandBrake, par exemple), une image en 4K au plus et un son en mp3 ou en ogg suffisent.',
        '{list} Le front-end relit ces fichiers à chaque passage sur la table, ce qui ralentit la navigation : une vidéo en 1080p ou en 4K (réencodée avec HandBrake, par exemple), une image en 4K au plus et un son en mp3 ou en ogg suffisent.',
        { list: heavy.join(' ') },
      ),
    });
  }

  // Duplicates of the same type: only one is shown.
  const duplicateLines: string[] = [];
  const duplicateOps: FileOp[] = [];
  for (const info of MEDIA_TYPES.filter((t) => !t.pages)) {
    const candidates = items.filter(
      (i) => i.type === info.type && i.accepted && !swappedFiles.has(i.file) && (i.vpinfe || allNames.some((n) => pageOf(i.stem!, n) === 1)),
    );
    if (candidates.length < 2) continue;
    const used = new Set(versionNames.flatMap((names) => shownMedia(items, info.type, names)).map((i) => i.file));
    const shown = candidates.filter((c) => used.has(c.file));
    const unused = candidates.filter((c) => !used.has(c.file));
    if (!unused.length || !shown.length) continue;
    const sameKind = unused.filter((u) => shown.some((s) => mediaKind(s.name) === mediaKind(u.name)));
    const other = unused.filter((u) => !sameKind.includes(u));
    duplicateLines.push(
      [
        tn(shown.length, '{type} : {files} est montré', '{type} : {files} sont montrés', { type: info.label, files: quoteList(shown.map((s) => s.name)) }),
        sameKind.length ? tn(sameKind.length, ', {files} ne sert pas', ', {files} ne servent pas', { files: quoteList(sameKind.map((u) => u.name)) }) : '',
        other.length ? t(' ; {files} : le front-end prend la vidéo quand il y en a une', { files: quoteList(other.map((u) => u.name)) }) : '',
        '.',
      ].join(''),
    );
    for (const u of sameKind.filter((x) => free(x.file))) {
      claim(u.file);
      duplicateOps.push({ op: 'trash', path: u.file });
    }
  }
  if (duplicateLines.length) {
    const size = duplicateOps.reduce((sum, op) => sum + (op.op === 'trash' ? sizeOf(op.path) : 0), 0);
    findings.push({
      code: 'mediaDuplicate',
      severity: 'info',
      title: t('Médias en double'),
      detail: duplicateLines.join(' '),
      fix: duplicateOps.length
        ? {
            label:
              duplicateOps.length > 1
                ? t('Mettre les {n} fichiers jamais montrés à la corbeille (libère {size})', { n: duplicateOps.length, size: formatSize(size) })
                : t('Mettre le fichier jamais montré à la corbeille (libère {size})', { size: formatSize(size) }),
            ops: duplicateOps,
          }
        : undefined,
    });
  }

  // Reading errors recorded by the display.
  const errors = (ctx.mediaErrors ?? (ctx.logsDir ? readMediaErrors(mediaErrorsFile(ctx.logsDir)) : [])).filter(
    (e) => isInside(e.file, folder) && isCurrentMediaError(e),
  );
  if (errors.length) {
    const broken = errors.filter((e) => FILE_ERRORS.includes(e.kind) && free(e.file));
    findings.push({
      code: 'mediaPlaybackError',
      severity: 'warning',
      title: tn(errors.length, 'Média que le front-end n’a pas pu lire', 'Médias que le front-end n’a pas pu lire'),
      detail: [
        ...errors.map((e) => {
          const params = { file: path.relative(folder, e.file), error: MEDIA_ERROR_LABELS[e.kind], count: e.count, date: formatDateTime(e.last), message: e.message ? ` (${e.message})` : '' };
          return e.count > 1 ? t('« {file} » : {error}, {count} fois, la dernière le {date}{message}.', params) : t('« {file} » : {error}, le {date}{message}.', params);
        }),
        t('Le front-end passe alors au média suivant, ou à l’affichage par défaut. Remplacez le fichier par un mp4 (H.264) ou un webm, ou réencodez-le.'),
      ].join(' '),
      fix: broken.length
        ? {
            label:
              broken.length > 1
                ? t('Mettre les {n} fichiers illisibles à la corbeille', { n: broken.length })
                : t('Mettre « {name} » à la corbeille', { name: path.basename(broken[0]!.file) }),
            ops: broken.map((e) => ({ op: 'trash' as const, path: e.file })),
          }
        : undefined,
    });
  }

  return findings;
}

function samePathCI(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function listDirs(dir: string): string[] {
  return readDirents(dir)
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * ROM requested by the script. The PinMAME plugin of VPX 10.8.1 looks in
 * <table>\pinmame\roms if this folder exists, and only there; otherwise in its common
 * folder (PinMAMEPath, the ROM library). It also reads <table>\pinmame\alias.txt
 * before anything else: neighbouring revision, or old VPinMAME name (romalias.ts).
 */
/**
 * ROM expected by the script. First its chips scattered in the table (an old
 * import unpacked a ROM stored in a subfolder of its zip): if the ROM is
 * nowhere else, they are rebuilt into a flat zip, stored in the library
 * and linked; otherwise they are of no use and go to the recycle bin.
 */
/**
 * What prevents the ROM requested by the script from being read (playable.ts), without reading the
 * table again: empty when it is there, linked, found by PinMAME's common folder or
 * provided by an alias. For the game page, which does not call the whole table diagnosis.
 */
export function romBlockers(folder: string, roms: string[], library?: string): Finding[] {
  return roms.length ? playBlockers(checkRom(folder, roms, library)) : [];
}

/**
 * Couleurs du DMD (Serum, PIN2DMD) que VPX ne chargera pas (dmdcolors.ts) : dossier ou fichiers qui
 * ne portent pas le nom de la ROM jouée, colorisation d'une autre révision, fichiers jamais lus.
 * Un dossier sans nom de ROM est renommé d'office avant chaque partie (PUP_PLAY_REPAIRS) ; celui
 * d'une autre révision seulement à la demande, ses images peuvent ne pas correspondre.
 */
function dmdColorFindings(folder: string, facts: ScriptFacts, ctx: Pick<DoctorContext, 'romLibrary' | 'tablesDir'>): Finding[] {
  if (!facts.usesPinmame || !facts.roms.length) return [];
  const loaded = loadedRoms(folder, facts.roms);
  const library = ctx.romLibrary ?? path.join(path.dirname(ctx.tablesDir), 'pinmame', 'roms');
  const present = (r: string) => [path.join(folder, 'pinmame', 'roms'), library].some((d) => fs.existsSync(path.join(d, `${r}.zip`)));
  const rom = loaded.find(present) ?? (loaded.length === 1 ? loaded[0] : undefined);
  const findings: Finding[] = [];
  for (const p of colorProblems(folder, [...facts.roms, ...loaded], rom)) {
    const ops: FileOp[] = p.moves.map((m) => ({ op: 'move', from: m.from, to: m.to }));
    const params = { folder: p.rel, target: p.target ?? '', rom: rom ?? facts.roms.join(', '), made: p.madeFor ?? '', list: formatList(p.unread.map((f) => path.basename(f))) };
    if (p.reason === 'unread') {
      findings.push({
        code: 'dmdColorsUnread',
        severity: 'warning',
        title: t('Couleurs du DMD illisibles par VPX'),
        detail: t('{folder} : {list}. VPX ne lit ni les .pac (colorisations chiffrées pour un vrai PIN2DMD) ni les .cROM. Il lui faut un .cRZ ou un .cROMc (Serum), ou un .pal avec son .vni (PIN2DMD).', params),
      });
    } else if (p.reason === 'otherRom') {
      findings.push({
        code: 'dmdColorsOtherRom',
        severity: 'warning',
        title: t('Couleurs du DMD faites pour une autre ROM'),
        detail: t('{folder} : colorisation de la ROM {made}, alors que la table joue {rom}. VPX ne la charge pas. Renommée pour {rom}, elle colore les images que les deux révisions ont en commun.', params),
        ...(ops.length && { fix: { label: t('Essayer avec la ROM {rom}', params), ops } }),
      });
    } else {
      findings.push({
        code: 'dmdColorsMisnamed',
        severity: 'warning',
        title: t('Couleurs du DMD mal nommées : VPX ne les charge pas'),
        detail: p.target
          ? t('{folder} : VPX cherche les couleurs dans {target}, au nom de la ROM que joue la table, avec les noms de fichiers qu’il connaît. Il n’y a rien à cocher : rangées là, le DMD passe en couleur.', params)
          : t('{folder} : VPX ne cherche les couleurs que dans un dossier au nom de la ROM que joue la table ({rom}). Renommez ce dossier.', params),
        ...(ops.length && { fix: { label: t('Ranger dans {target}', params), ops } }),
      });
    }
  }
  return findings;
}

function checkRom(folder: string, roms: string[], library?: string): Finding[] {
  const scattered = scatteredRom(folder, roms);
  const findings = checkRomFiles(folder, roms, library, scattered);
  if (!scattered || findings.some((f) => f.code === 'romScattered')) return findings;
  const list = formatList(scattered.files.map((f) => path.relative(folder, f)));
  return [
    ...findings,
    {
      code: 'romScattered',
      severity: 'info',
      rom: scattered.rom,
      title: t('Fichiers de ROM éparpillés'),
      detail: tn(
        scattered.files.length,
        '{list} : un fichier de la ROM {rom} resté dans le dossier de la table. La table utilise {rom}.zip ; celui-ci ne sert à rien.',
        '{list} : des fichiers de la ROM {rom} restés dans le dossier de la table. La table utilise {rom}.zip ; ceux-ci ne servent à rien.',
        { list, rom: scattered.rom },
      ),
      fix: { label: tn(scattered.files.length, 'Mettre ce fichier à la corbeille', 'Mettre ces fichiers à la corbeille'), ops: scatteredTrash(scattered) },
    },
  ];
}

/** Chips of a ROM outside its zip, in the table's folder. */
interface ScatteredRom {
  rom: string;
  files: string[];
  /** Folder named like the ROM that contains them (otherwise, the table's root folder). */
  dir?: string;
}

/**
 * Chips of the requested ROM left at the root of the table ("t2_l8.rom",
 * "t2_u14.l3": same name or same family as the ROM), or in a folder named
 * like it that contains only them.
 */
function scatteredRom(folder: string, roms: string[]): ScatteredRom | undefined {
  let best: ScatteredRom | undefined;
  for (const rom of roms) {
    const lower = rom.toLowerCase();
    const family = `${romFamilyOf(rom)}_`;
    const files = readDirents(folder)
      .filter((d) => d.isFile() && isChipName(d.name))
      .map((d) => d.name)
      .filter((n) => n.replace(/\.[^.]+$/, '').toLowerCase() === lower || n.toLowerCase().startsWith(family))
      .map((n) => path.join(folder, n));
    const dirName = readDirents(folder).find((d) => d.isDirectory() && d.name.toLowerCase() === lower)?.name;
    const dir = dirName ? path.join(folder, dirName) : undefined;
    const content = dir ? romContent(listRelative(dir, 64) ?? []) : undefined;
    const found: ScatteredRom | undefined = content
      ? { rom, dir, files: [...files, ...content.chips.map((c) => path.join(dir!, ...c.split('/')))] }
      : files.length
        ? { rom, files }
        : undefined;
    if (found && (!best || found.files.length > best.files.length)) best = found;
  }
  return best;
}

/** The scattered chips to the recycle bin (the ROM's folder in one piece). */
function scatteredTrash(s: ScatteredRom): FileOp[] {
  const loose = s.files.filter((f) => !s.dir || !isInside(f, s.dir));
  return [...loose.map((f) => ({ op: 'trash' as const, path: f })), ...(s.dir ? [{ op: 'trash' as const, path: s.dir }] : [])];
}

/**
 * Puts a ROM back in place: its flat .zip, stored in the library and linked in
 * pinmame\roms (copied from one drive to another), or in pinmame\roms without a library.
 */
function rebuildRomOps(name: string, members: RomZipMember[], folder: string, library: string | undefined, mtimeMs: number): FileOp[] {
  const inTable = path.join(folder, 'pinmame', 'roms', name);
  const target = library ? path.join(library, name) : inTable;
  return [{ op: 'zip', to: target, files: members, mtimeMs }, ...(library ? [{ op: 'link' as const, from: target, to: inTable }] : [])];
}

/** Chips of a zip stored in a subfolder: the zip to rebuild flat, otherwise undefined. */
function nestedRom(file: string): { folder: string; members: RomZipMember[] } | undefined {
  const entries = readZipEntries(file);
  const content = entries && romContent(entries.map((e) => e.name));
  if (!content?.dir) return undefined;
  return { folder: content.dir, members: content.chips.map((c) => ({ from: file, entry: c, name: path.basename(c) })) };
}

/** A ROM of pinmame\roms whose chips are in a subfolder: PinMAME does not read it. */
function checkRomNested(folder: string, file: string, library?: string): Finding | undefined {
  const nested = nestedRom(file);
  if (!nested) return undefined;
  const name = path.basename(file);
  const rom = name.replace(/\.zip$/i, '');
  const stored = library ? storedRom(library, name) : undefined;
  // The library's ROM is rebuilt flat if it is the table's one, or if the library does not have it.
  const intoLibrary = library && (!stored || sameRomFile(stored, romFile(file)!));
  return {
    code: 'romNested',
    severity: 'error',
    rom,
    title: t('ROM « {rom} » illisible : ses fichiers sont dans un sous-dossier du zip', { rom }),
    detail: t('{name} contient le dossier « {folder} » : PinMAME ne lit que les fichiers à la racine du zip, la table ne démarre pas.', { name, folder: nested.folder }),
    fix: {
      label: intoLibrary ? t('Refaire {name} à plat dans la bibliothèque', { name }) : t('Refaire {name} à plat', { name }),
      ops: intoLibrary
        ? rebuildRomOps(name, nested.members, folder, library, romFile(file)!.mtimeMs)
        : [{ op: 'zip', to: file, files: nested.members, mtimeMs: romFile(file)!.mtimeMs }],
    },
  };
}

function checkRomFiles(folder: string, roms: string[], library: string | undefined, scattered: ScatteredRom | undefined): Finding[] {
  const romsDir = path.join(folder, 'pinmame', 'roms');
  const files = listSafe(romsDir);
  const dirExists = fs.existsSync(romsDir);
  const { text: aliasText, lines: aliases } = readTableAliases(folder);
  const aliasFile = tableAliasFile(folder);
  const here = (name: string) => files.find((f) => f.toLowerCase() === `${name.toLowerCase()}.zip`);
  const inLibrary = (name: string) => (library ? storedRom(library, name) : undefined);
  /** Link (or copy, from one drive to another) a ROM of the library into pinmame\roms. */
  const linkOp = (name: string): FileOp[] => {
    const stored = inLibrary(name);
    return stored && !here(name) ? [{ op: 'link', from: stored.path, to: path.join(romsDir, path.basename(stored.path)) }] : [];
  };
  const writeAliases = (content: string): FileOp => (content ? { op: 'write', path: aliasFile, content } : { op: 'trash', path: aliasFile });
  const findings: Finding[] = [];

  // Alias that has become useless: the requested ROM is there, but the alias comes before it.
  for (const r of roms) {
    const line = aliasFor(aliases, r);
    if (!line || !here(r) || line.rom.toLowerCase() === r.toLowerCase()) continue;
    findings.push({
      code: 'romAliasObsolete',
      severity: 'warning',
      title: t('Alias inutile : {rom} est là, mais {loaded} est chargée', { rom: r, loaded: line.rom }),
      detail: t('pinmame\\alias.txt fait charger {loaded} quand le script demande {rom} ; PinMAME lit l’alias avant la ROM, si bien que {rom}.zip, maintenant dans pinmame\\roms, ne sert pas.', {
        rom: r,
        loaded: line.rom,
      }),
      fix: { label: t('Revenir à la ROM demandée (retirer la ligne « {line} »)', { line: `${line.alias},${line.rom}` }), ops: [writeAliases(withoutAlias(aliasText, line.alias))] },
    });
  }

  const found = roms.map(here).find(Boolean);
  if (found) {
    const nested = checkRomNested(folder, path.join(romsDir, found), library);
    if (nested) return [...findings, nested];
    return [...findings, ...(library ? checkRomCopy(path.join(romsDir, found), library) : [])];
  }
  const rom = roms[0]!;

  // Chips scattered in the table, and the ROM nowhere else: we rebuild its zip.
  if (scattered && !roms.some((r) => aliasFor(aliases, r) || inLibrary(r))) {
    const name = `${scattered.rom}.zip`;
    const where = scattered.dir ? t('dans le dossier « {folder} » de la table', { folder: path.basename(scattered.dir) }) : t('à la racine du dossier de la table');
    const members = scattered.files.map((f) => ({ from: f, name: path.basename(f) }));
    const mtimeMs = Math.max(...scattered.files.map((f) => romFile(f)?.mtimeMs ?? 0));
    findings.push({
      code: 'romScattered',
      severity: 'error',
      rom: scattered.rom,
      title: t('ROM « {rom} » en fichiers éparpillés dans la table', { rom: scattered.rom }),
      detail: tn(
        scattered.files.length,
        'Le fichier de la ROM {rom} ({list}) est {where} : PinMAME ne lit une ROM que sous la forme {rom}.zip, ses fichiers à la racine du zip, dans pinmame\\roms. La table ne démarre pas. La correction refait le zip ; le fichier éparpillé va à la corbeille.',
        'Les {n} fichiers de la ROM {rom} ({list}) sont {where} : PinMAME ne lit une ROM que sous la forme {rom}.zip, ses fichiers à la racine du zip, dans pinmame\\roms. La table ne démarre pas. La correction refait le zip ; les fichiers éparpillés vont à la corbeille.',
        { rom: scattered.rom, list: formatList(members.map((m) => m.name)), where },
      ),
      fix: {
        label: library ? t('Refaire {name} dans la bibliothèque et le lier', { name }) : t('Refaire {name} dans pinmame\\roms', { name }),
        ops: [...rebuildRomOps(name, members, folder, library, mtimeMs), ...scatteredTrash(scattered)],
      },
    });
    return findings;
  }

  // An alias is already in place: it is its ROM that is needed.
  const alias = roms.map((r) => aliasFor(aliases, r)).find(Boolean);
  if (alias) {
    const historic = historicAlias(alias.alias)?.toLowerCase() === alias.rom.toLowerCase();
    if (here(alias.rom)) {
      // An old VPinMAME name, or the alias that VPinMAME applied in the installation the table
      // comes from (VPMAlias.txt): nothing to say. A neighbouring revision chosen here: we remind it.
      const imported = aliasComment(aliasText, alias.alias) === IMPORTED_ALIAS_COMMENT;
      if (!historic && !imported) {
        findings.push({
          code: 'romAlias',
          severity: 'info',
          rom: alias.alias,
          neighbour: alias.rom,
          title: t('Révision voisine : {rom} au lieu de {asked}', { rom: alias.rom, asked: alias.alias }),
          detail: t('pinmame\\alias.txt fait charger {rom}, la table demande {asked}. {warning} Quand {asked}.zip arrivera, le diagnostic proposera de retirer l’alias.', {
            rom: alias.rom,
            asked: alias.alias,
            warning: neighbourWarning(),
          }),
        });
      }
      return findings;
    }
    const ops = linkOp(alias.rom);
    findings.push(
      ops.length
        ? {
            code: 'romNotLinked',
            severity: 'error',
            rom: alias.rom,
            title: t('ROM « {rom} » pas liée dans la table', { rom: alias.rom }),
            detail: t('pinmame\\alias.txt fait charger {rom} pour {asked} ; elle est dans la bibliothèque, mais pas dans pinmame\\roms.', { rom: alias.rom, asked: alias.alias }),
            fix: { label: t('Lier la ROM de la bibliothèque dans pinmame\\roms'), ops },
          }
        : {
            code: 'romMissing',
            severity: 'error',
            rom: alias.rom,
            title: t('ROM « {rom} » absente', { rom: alias.rom }),
            detail: t(
              'pinmame\\alias.txt fait charger {rom} quand le script demande {asked}, mais {rom}.zip n’est nulle part. Ajoutez-la (dossier d’import, puis « Ajouter une table »), ou retirez l’alias.',
              { rom: alias.rom, asked: alias.alias },
            ),
            fix: { label: t('Retirer l’alias « {line} »', { line: `${alias.alias},${alias.rom}` }), ops: [writeAliases(withoutAlias(aliasText, alias.alias))] },
          },
    );
    return findings;
  }

  // Old VPinMAME name: the plugin no longer knows it, the alias line is needed.
  const historic = roms.map((r) => [r, historicAlias(r)] as const).find(([, real]) => real);
  if (historic) {
    const [asked, real] = historic as readonly [string, string];
    const available = here(real) || inLibrary(real);
    findings.push({
      code: 'romAliasHistoric',
      severity: 'error',
      rom: real,
      title: t('« {asked} » : ancien nom de la ROM {rom}', { asked, rom: real }),
      detail: [
        t('Le script demande {asked}, que VPinMAME traduisait de lui-même en {rom} ; le plugin PinMAME de VPX 10.8.1 ne connaît plus ces anciens noms : sans alias, la table ne démarre pas.', {
          asked,
          rom: real,
        }),
        available ? '' : t('Il faut aussi {rom}.zip : ajoutez-la (dossier d’import, puis « Ajouter une table »).', { rom: real }),
      ]
        .filter(Boolean)
        .join(' '),
      fix: available
        ? {
            label: t('Écrire l’alias « {line} » dans pinmame\\alias.txt', { line: `${asked},${real}` }),
            ops: [...linkOp(real), { op: 'write', path: aliasFile, content: withAlias(aliasText, asked, real, `ancien nom de VPinMAME (release/VPMAlias.txt)`) }], // i18n-ignore: comment written in alias.txt
          }
        : undefined,
    });
    return findings;
  }

  // The ROM is in the library: only the link is missing.
  const stored = roms.map(inLibrary).find(Boolean);
  if (stored) {
    const name = path.basename(stored.path);
    const copy = !sameVolume(stored.path, folder);
    findings.push({
      code: 'romNotLinked',
      // Without pinmame\roms, PinMAME finds it in its common folder; with it, it only looks there.
      severity: dirExists ? 'error' : 'info',
      rom: name.replace(/\.zip$/i, ''),
      title: dirExists
        ? t('ROM « {rom} » absente de pinmame\\roms', { rom: name.replace(/.zip$/i, '') })
        : t('ROM « {rom} » pas liée dans la table', { rom: name.replace(/.zip$/i, '') }),
      detail: dirExists
        ? t(
            'Elle est dans la bibliothèque de ROM ({dir}), mais la table a son propre dossier pinmame\\roms, sans elle : PinMAME ne cherche alors que là, jamais dans son dossier commun. La table ne démarre pas.',
            { dir: path.dirname(stored.path) },
          )
        : t(
            'Elle est dans la bibliothèque de ROM ({dir}) : la table la trouve par le dossier commun de PinMAME. Un lien dans pinmame\\roms la rend autonome (copie de la table, autre configuration).',
            { dir: path.dirname(stored.path) },
          ),
      fix: {
        label: copy
          ? t('Copier la ROM dans pinmame\\roms ({size}, la table est sur un autre disque)', { size: formatSize(stored.size) })
          : t('Lier la ROM de la bibliothèque dans pinmame\\roms (aucune place en plus)'),
        ops: [{ op: 'link', from: stored.path, to: path.join(romsDir, name) }],
      },
    });
    return findings;
  }
  // The ROM may be in the folder, but not in the right place.
  const stray = findFile(folder, roms.map((r) => `${r.toLowerCase()}.zip`), romsDir);
  if (stray) {
    const nested = nestedRom(stray);
    findings.push({
      code: 'romMisplaced',
      severity: 'error',
      rom: path.basename(stray).replace(/\.zip$/i, ''),
      title: t('ROM mal rangée'),
      detail: nested
        ? t('PinMAME cherche la ROM dans pinmame\\roms, ses fichiers à la racine du zip ; « {file} » n’y est pas, et ses fichiers sont dans le dossier « {folder} ».', {
            file: path.relative(folder, stray),
            folder: nested.folder,
          })
        : t('PinMAME cherche la ROM dans pinmame\\roms ; « {file} » n’y est pas.', { file: path.relative(folder, stray) }),
      fix: nested
        ? {
            label: library ? t('Refaire la ROM à plat dans la bibliothèque') : t('Refaire la ROM à plat dans pinmame\\roms'),
            ops: [...rebuildRomOps(path.basename(stray), nested.members, folder, library, romFile(stray)!.mtimeMs), { op: 'trash', path: stray }],
          }
        : { label: t('Ranger la ROM dans pinmame\\roms'), ops: [{ op: 'move', from: stray, to: path.join(romsDir, path.basename(stray)) }] },
    });
    return findings;
  }
  // A neighbouring revision is on the cabinet: on request, an alias makes it load.
  const libraryNames = library ? [...listRoms(library).keys()] : [];
  const neighbour = neighbourRom(rom, [...files, ...libraryNames]);
  if (neighbour) {
    const where = here(neighbour) ? t('dans pinmame\\roms de la table') : t('dans la bibliothèque de ROM');
    findings.push({
      code: 'romAlias',
      severity: 'error',
      rom,
      neighbour,
      title: t('ROM « {rom} » absente, révision voisine {neighbour} sur la borne', { rom, neighbour }),
      detail: t('La table ne démarrera pas sans {rom}.zip. {neighbour}.zip, du même jeu, est {where} : un alias peut la faire charger à sa place. {warning}', {
        rom,
        neighbour,
        where,
        warning: neighbourWarning(),
      }),
      fix: {
        label: t('Jouer avec {neighbour} (alias « {line} » dans pinmame\\alias.txt)', { neighbour, line: `${rom},${neighbour}` }),
        ops: [...linkOp(neighbour), { op: 'write', path: aliasFile, content: withAlias(aliasText, rom, neighbour, `révision voisine choisie le ${new Date().toLocaleDateString('fr-FR')}`) }], // i18n-ignore: comment written in alias.txt
      },
    });
    return findings;
  }
  const others = roms.length > 1 ? ` ${t('(ou {list})', { list: roms.slice(1).map((r) => `${r}.zip`).join(', ') })}` : '';
  findings.push({
    code: 'romMissing',
    severity: 'error',
    rom,
    title: t('ROM « {rom} » absente', { rom }),
    detail: [
      t(
        'La table ne démarrera pas sans {rom}.zip{others}. Mettez le fichier dans le dossier d’import (ou glissez-le sur cette fenêtre) puis « Ajouter une table » : il sera rangé dans la bibliothèque de ROM et lié dans pinmame\\roms. Pour savoir où la trouver, étape par étape : « Ce qu’il manque pour jouer ».',
        { rom, others },
      ),
      dirExists && !files.length ? t('Le dossier pinmame\\roms de la table est vide : tant qu’il existe, PinMAME ne cherche pas ailleurs.') : '',
      romSearchedText(folder, roms, library),
    ]
      .filter(Boolean)
      .join(' '),
  });
  return findings;
}

/**
 * "Cherchée par Cyber Pinball dans : …" (Searched by Cyber Pinball in: ...): the table's pinmame\roms,
 * the ROM library, and, for a table taken over from another installation, that installation's ROM
 * folders (CyberPinball.RomSearch of the .info, written by the add plan). The player thus knows where
 * it is not, and where to put it.
 */
function romSearchedText(folder: string, roms: string[], library: string | undefined): string {
  const places = [path.join(folder, 'pinmame', 'roms'), ...(library ? [library] : [])];
  const text = t('Cyber Pinball l’a cherchée dans {dirs}.', { dirs: formatList(places) });
  const wanted = new Set(roms.map((r) => r.toLowerCase()));
  for (const file of listSafe(folder).filter((f) => f.toLowerCase().endsWith('.info'))) {
    const search = (readInfo(path.join(folder, file)).CyberPinball as { RomSearch?: { Roms?: unknown; Dirs?: unknown; From?: unknown } } | undefined)?.RomSearch;
    const names = Array.isArray(search?.Roms) ? search.Roms.filter((r): r is string => typeof r === 'string') : [];
    const dirs = Array.isArray(search?.Dirs) ? search.Dirs.filter((d): d is string => typeof d === 'string') : [];
    if (!names.some((n) => wanted.has(n.toLowerCase()))) continue;
    const from = typeof search?.From === 'string' ? search.From : '';
    const asked = formatList(names, 'or');
    return [
      text,
      dirs.length
        ? t('À la reprise depuis {from}, {roms} a été cherchée dans {dirs} : elle n’y était pas.', { from, roms: asked, dirs: formatList(dirs) })
        : t('À la reprise depuis {from}, cette installation n’avait aucun dossier de ROM connu (ni VPinMAME\\roms, ni rompath de VPinMAME dans le registre, ni dossier des ROM de Popper).', { from }),
    ].join(' ');
  }
  return text;
}

/** Table ROM next to the library's one: a copy to replace with a link. */
function checkRomCopy(file: string, library: string): Finding[] {
  const own = romFile(file);
  const stored = storedRom(library, path.basename(file));
  if (!own || !stored || sameRomFile(own, stored)) return [];
  const name = path.basename(file);
  const identical = sameRomContent(own, stored);
  // From one drive to another, an identical copy is the only possibility.
  if (identical && !sameVolume(stored.path, file)) return [];
  return [
    identical
      ? {
          code: 'romCopy',
          severity: 'info',
          title: t('Copie de ROM au lieu d’un lien'),
          detail: t('pinmame\\roms\\{name} est une copie de la ROM de la bibliothèque : {size} de trop sur le disque.', { name, size: formatSize(own.size) }),
          fix: { label: t('Remplacer la copie par un lien vers la bibliothèque (libère {size})', { size: formatSize(own.size) }), ops: [{ op: 'link', from: stored.path, to: file }] },
        }
      : {
          code: 'romCopy',
          severity: 'warning',
          title: t('Autre version de la ROM que celle de la bibliothèque'),
          detail: t(
            'pinmame\\roms\\{name} ({size}, {date}) n’a pas le même contenu que celle de la bibliothèque ({librarySize}, {libraryDate}). Pour garder plutôt celle de la table, « Ranger les ROM » dans le front-end laisse choisir.',
            { name, size: formatSize(own.size), date: formatDate(own.mtimeMs), librarySize: formatSize(stored.size), libraryDate: formatDate(stored.mtimeMs) },
          ),
          fix: { label: t('Utiliser la ROM de la bibliothèque (celle de la table va à la corbeille)'), ops: [{ op: 'link', from: stored.path, to: file }] },
        },
  ];
}

/**
 * FlexDMD / UltraDMD folder loaded by the script, missing. Optional (playable.ts): the
 * table starts without it. Without its images, FlexDMD returns Nothing to the script (NewImage,
 * plugins/flexdmd/actors/Image.cpp): that DMD stays empty, and a script that does not expect
 * it stops on "Type incompatible" (Type mismatch) (VPW's Goonies).
 */
function checkDmdFolder(folder: string, dmdFolder: string, usesPinmame: boolean, tablesDir: string): Finding | undefined {
  const dirs = readDirents(folder).filter((d) => d.isDirectory()).map((d) => d.name);
  if (dirs.some((d) => d.toLowerCase() === dmdFolder.toLowerCase())) return undefined;
  const intro = [
    t('Facultatif : le script dessine un DMD avec les images, vidéos et polices du dossier « {folder} », mais la table se lance sans lui.', { folder: dmdFolder }),
    usesPinmame
      ? t('Le DMD de la ROM s’affiche à l’emplacement du DMD ; si le script s’arrête sur « Type incompatible », c’est ce dossier qui manque.')
      : t('Sans lui, ce DMD reste vide ; si le script s’arrête sur « Type incompatible », c’est ce dossier qui manque.'),
  ].join(' ');
  // Content emptied at the root by an import that flattened the subfolders: we store it.
  const own = [path.basename(folder), ...readDirents(folder).filter((d) => d.isFile() && /\.vpx$/i.test(d.name)).map((d) => d.name.slice(0, -4))].map((n) =>
    n.toLowerCase(),
  );
  const loose = readDirents(folder)
    .filter((d) => d.isFile() && DMD_ASSET_EXT.has(path.extname(d.name).toLowerCase()))
    .map((d) => d.name)
    .filter((f) => !own.some((n) => f.toLowerCase().startsWith(n)));
  if (loose.length) {
    return {
      code: 'dmdFolderMissing',
      severity: 'warning',
      title: t('Dossier « {folder} » absent, son contenu est en vrac', { folder: dmdFolder }),
      detail: `${intro} ${tn(loose.length, '{n} image ou police du DMD sont à la racine du dossier de la table.', '{n} images ou polices du DMD sont à la racine du dossier de la table.')}`,
      fix: {
        label: loose.length > 1 ? t('Ranger ces {n} fichiers dans « {folder} »', { n: loose.length, folder: dmdFolder }) : t('Ranger ce fichier dans « {folder} »', { folder: dmdFolder }),
        ops: loose.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(folder, dmdFolder, f) })),
      },
    };
  }
  // Left at the root of the tables folder (table stored without it, or flat installation): it
  // goes back to the table. In the folder of another version of the table: copied, it needs it too.
  const elsewhere = findDmdFolderElsewhere(folder, dmdFolder, tablesDir);
  if (elsewhere) {
    const where = elsewhere.shared ? t('dans le dossier de « {table} »', { table: path.basename(path.dirname(elsewhere.path)) }) : t('à la racine du dossier des tables');
    return {
      code: 'dmdFolderMissing',
      severity: 'warning',
      title: t('Dossier « {folder} » rangé ailleurs', { folder: dmdFolder }),
      detail: elsewhere.host
        ? `${intro} ${t('« {folder} » était dans le dossier de « {table} », qui ne le charge pas : il revient à cette table.', { folder: dmdFolder, table: elsewhere.host })}`
        : `${intro} ${t('Il est {where} : VPX le cherche dans le dossier de la table.', { where })}`,
      fix: {
        label: elsewhere.shared ? t('Copier « {folder} » dans le dossier de la table', { folder: dmdFolder }) : t('Ranger « {folder} » dans le dossier de la table', { folder: dmdFolder }),
        ops: [{ op: elsewhere.shared ? 'copy' : 'move', from: elsewhere.path, to: path.join(folder, dmdFolder) }],
      },
    };
  }
  return {
    code: 'dmdFolderMissing',
    severity: 'warning',
    title: t('Dossier « {folder} » absent', { folder: dmdFolder }),
    detail: `${intro} ${t('Ce dossier est fourni avec la table d’origine ; mettez-le dans le dossier d’import puis « Ajouter une table ».')}`,
  };
}

/**
 * The DMD folder outside the table's one: at the root of the tables folder (shared: false),
 * otherwise in the folder of another table (shared: true, another version that also loads it).
 */
function findDmdFolderElsewhere(folder: string, dmdFolder: string, tablesDir: string): { path: string; shared: boolean; host?: string } | undefined {
  const root = path.resolve(tablesDir);
  if (path.resolve(folder).toLowerCase() === root.toLowerCase()) return undefined;
  const wanted = dmdFolder.toLowerCase();
  const dirs = readDirents(root).filter((d) => d.isDirectory());
  const loose = dirs.find((d) => d.name.toLowerCase() === wanted);
  if (loose) return { path: path.join(root, loose.name), shared: false };
  for (const d of dirs) {
    const other = path.join(root, d.name);
    if (other.toLowerCase() === path.resolve(folder).toLowerCase()) continue;
    const found = readDirents(other).find((e) => e.isDirectory() && e.name.toLowerCase() === wanted);
    if (!found) continue;
    // Another version of the table also loads it: copied, it needs it. A table that does not load it (its
    // script names another folder, or none) was hosting it by mistake: moved (19/11/2026, Goldorak.UltraDMD
    // pasted into the folder of Champions League).
    // Unreadable script (protected, or damaged table): we cannot tell, the folder is copied as before.
    const scripts = readDirents(other)
      .filter((e) => e.isFile() && /\.vpx$/i.test(e.name))
      .map((e) => readVpxScript(path.join(other, e.name)))
      .filter((s): s is string => s !== undefined);
    const loads = !scripts.length || scripts.some((s) => dmdProjectFolder(scriptCode(s))?.toLowerCase() === wanted);
    return { path: path.join(other, found.name), shared: loads, ...(loads ? {} : { host: d.name }) };
  }
  return undefined;
}

/** FlexDMD or UltraDMD content folder, according to its name. */
const DMD_FOLDER_NAME = /\.(ultradmd|flexdmd)$/i;

/** Files that FlexDMD and UltraDMD load from their folder. */
const DMD_ASSET_EXT = new Set(['.fnt', '.png', '.gif', '.apng', '.bmp', '.jpg', '.jpeg']);

/** Looks for a file by name in the table's folder (3 levels), outside the excluded folder. */
function findFile(dir: string, names: string[], exclude: string, depth = 3): string | undefined {
  for (const dirent of readDirents(dir)) {
    const p = path.join(dir, dirent.name);
    if (dirent.isFile() && names.includes(dirent.name.toLowerCase())) return p;
  }
  if (depth === 0) return undefined;
  for (const dirent of readDirents(dir)) {
    const p = path.join(dir, dirent.name);
    if (!dirent.isDirectory() || isInside(p, exclude) || ['cache', 'medias'].includes(dirent.name.toLowerCase()) || isPupFolderName(dirent.name)) continue;
    const found = findFile(p, names, exclude, depth - 1);
    if (found) return found;
  }
  return undefined;
}

/** The name closest to the references (title, file name, folder). */
export function bestMatch(names: string[], references: string[]): string {
  const keys = references.map((r) => nameKey(parseTableName(r).title)).filter(Boolean);
  const score = (name: string) => {
    const k = nameKey(parseTableName(name.replace(/\.[^.]+$/, '')).title);
    return keys.reduce((best, ref) => Math.max(best, k === ref ? 3 : k.includes(ref) || ref.includes(k) ? 2 : 0), 0);
  };
  return [...names].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]!;
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Table saved by a more recent VPX than the one that plays it (a 10.9 pre-release and Cyber Pinball's
 * VPX 10.8.1): the fix makes it play with the first VPX that can open it, like "Jouée avec" (Played with) on the game page.
 */
export function tooNewFinding(entry: TableEntry, ctx: DoctorContext): Finding | undefined {
  if (!ctx.vpx || entry.emulator !== 'vpx') return undefined;
  const tooNew = tableTooNew(readVpxFileVersion(entry.file), entry.info, ctx.vpx.own, ctx.vpx.others);
  if (!tooNew) return undefined;
  const first = tooNew.able[0];
  return {
    code: 'tableTooNew',
    severity: 'warning',
    title: t('Table enregistrée par VPX {table}', { table: tooNew.table }),
    detail: `${tooNewReason(tooNew)} ${tooNewAdvice(tooNew)}`,
    fix:
      first && fs.existsSync(entry.infoFile)
        ? { label: t('La jouer avec {vpx}', { vpx: first.label }), ops: [{ op: 'write', path: entry.infoFile, content: JSON.stringify(withVpxChoice(entry.info, first.id), null, 2) + '\n' }] }
        : undefined,
  };
}

/** "Volume de la ROM bas" (Low ROM volume) finding: low, neither factory (raised before the game) nor chosen by the player. */
export function romVolumeFinding(v: DoctorContext['romVolume']): Finding | undefined {
  const s = v?.status;
  if (!s || s.kind !== 'set' || v.choice !== undefined || !isLowRomVolume(s) || isFactoryRomVolume(s)) return undefined;
  return {
    code: 'lowRomVolume',
    severity: 'warning',
    title: t('Volume de la ROM bas'),
    detail: t('{rom} garde son volume dans sa mémoire : {now}, bien en dessous des bruits de la table. Il se règle aussi dans « Réglages de cette table » > Son.', { rom: s.rom, now: romVolumeText(s.value!, s.spot) }),
    fix: { label: t('Monter le volume de la ROM à {to} sur {max}', { to: s.recommended, max: s.spot.max }), ops: [{ op: 'romVolume', path: s.file, memory: s.memory, value: s.recommended }] },
  };
}
