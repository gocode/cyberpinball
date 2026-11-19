// PuP-Packs in VPX 10.8.1 plugin mode:
// folder name expected from the script, true root of a pack (nesting),
// useless files, options of the .bat files read without ever being run, and choice
// of the option from the cabinet model.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AncillaryRoleId, Cabinet, RoleId } from './model';
import { formatList, t } from './i18n';
import { commentStart, statements } from './vbscript';
import { dmdKindForRatio, dmdKindOf } from './dmdscreen';
import { roleZone, zoneRatio } from './zones';

export const PUP_FILES = ['screens.pup', 'playlists.pup', 'triggers.pup'] as const;

/** What a table's script says about its PuP-Pack. */
export interface PupScriptFacts {
  /**
   * Names passed to B2SInit (explicit loading of the pack), then to Init. With
   * B2SInit, the script's name wins over the ROM (PUPPlugin.cpp l. 211-241:
   * automatic loading by the ROM is skipped if the script has already started PuP).
   */
  packNames: string[];
  /** The script declares its playlists itself (old packs, without .pup). */
  playlistAdd: boolean;
  /**
   * The script writes the score itself on a screen of the pack (PuP-DMD: LabelNew, LabelInit):
   * the pack then draws the table's DMD, it may occupy the DMD window.
   */
  labels?: boolean;
  /**
   * The script never starts the pack: starting it depends on a variable that the
   * script sets otherwise at the start ("usePUP = False"). Absent if nothing prevents it.
   */
  disabledBy?: PupSwitch;
  /**
   * The PuP-DMD (the score that the script writes on the pack's DMD screen, LabelInit) depends on
   * another variable switched off at the start ("enablePupDMD = False"): a pack whose option
   * occupies the DMD window would only show its empty frame there, over the table's DMD.
   */
  dmdDisabledBy?: PupSwitch;
  /**
   * The script itself sends "D" triggers to the pack (PuPlayer.B2SData "D..."): those that the
   * pack expects from a DMD image (PuPCapture) may come from there.
   */
  dmdTriggers?: boolean;
}

/** Script switch that decides whether the PuP-Pack is started. */
export interface PupSwitch {
  /** Variable ("usePUP"). */
  variable: string;
  /** Value that the script gives it, as written ("False"). */
  value: string;
  /** Value that starts the pack ("True"); absent if it cannot be deduced. */
  enable?: string;
  /** Line of the assignment in the script (from 0). */
  line: number;
  /** What it switches on: the pack (absent), or the PuP-DMD. */
  kind?: 'dmd';
}

/**
 * PuP calls of a script whose comments are already removed; undefined if
 * the table does not use PuP.
 */
export function pupScriptFacts(code: string): PupScriptFacts | undefined {
  const objects = new Set(['puplayer']);
  for (const m of code.matchAll(/\bSet\s+(\w+)\s*=\s*CreateObject\s*\(\s*"PinUpPlayer\.PinDisplay"\s*\)/gi)) objects.add(m[1]!.toLowerCase());
  const uses = /PinUpPlayer\.PinDisplay/i.test(code);
  const b2s: string[] = [];
  const init: string[] = [];
  for (const m of code.matchAll(/\b(\w+)\.(B2SInit|Init)\b[ \t]*\(?[ \t]*[^,\r\n]*?,[ \t]*("[^"\r\n]*"|[A-Za-z_]\w*)/gi)) {
    if (!objects.has(m[1]!.toLowerCase())) continue;
    const list = m[2]!.toLowerCase() === 'b2sinit' ? b2s : init;
    for (const name of resolveValue(code, m[3]!)) if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
  }
  if (!uses && !b2s.length && !init.length) return undefined;
  const packNames: string[] = [];
  for (const name of [...b2s, ...init]) if (name && !packNames.some((n) => n.toLowerCase() === name.toLowerCase())) packNames.push(name);
  const facts: PupScriptFacts = { packNames, playlistAdd: /\.playlistadd\b/i.test(code) };
  if (/\.(LabelNew|LabelInit)\b/i.test(code)) facts.labels = true;
  if (/\.B2SData\s*\(?\s*"D/i.test(code)) facts.dmdTriggers = true;
  const disabledBy = pupScriptSwitch(code);
  if (disabledBy) facts.disabledBy = disabledBy;
  const dmdDisabledBy = pupDmdSwitch(code);
  if (dmdDisabledBy) facts.dmdDisabledBy = dmdDisabledBy;
  return facts;
}

/**
 * Switches to turn on for the pack to be seen: the one that starts it, and the one of the
 * PuP-DMD when the option in place draws in the DMD window (`packDrawsDmd`, pupWindows):
 * without it, the pack puts its empty frame ("PuPFrames\default.png") over the table's
 * DMD. The Goonies (VPW 2021) ships both switched off (October 2026). `code`: scriptCode.
 */
export function pupSwitchesToEnable(code: string, packDrawsDmd: boolean): PupSwitch[] {
  const found: PupSwitch[] = [];
  const main = pupScriptSwitch(code);
  if (main) found.push(main);
  const dmd = packDrawsDmd ? pupDmdSwitch(code) : undefined;
  if (dmd && dmd.enable !== undefined) found.push(dmd);
  return found;
}

/** The switches of a list, for a message: "enablePupPack = True, enablePupDMD = True". */
export function describeSwitches(switches: PupSwitch[], state: 'value' | 'enable'): string {
  return switches.map((s) => `${s.variable} = ${state === 'value' ? s.value : (s.enable ?? '?')}`).join(', ');
}

// ---------- Script switch ----------

const ROUTINE_START = /^\s*(?:(?:public|private)\s+)?(?:sub|function)\s+(\w+)/i;
const ROUTINE_END = /^\s*end\s+(?:sub|function)\b/i;
const LITERAL = /^(true|false|-?\d+|"[^"]*")$/i;

type Value = boolean | number | string;

function literalValue(text: string): Value {
  const lower = text.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (text.startsWith('"')) return text.slice(1, -1);
  return Number(text);
}

/** Numeric value in VBScript (True is -1), or the string. */
const numeric = (v: Value) => (v === true ? -1 : v === false ? 0 : v);

interface Assignment {
  /** Name of the variable as written. */
  name: string;
  value: string;
  line: number;
  /** In a Sub or a Function (run later, or never). */
  inRoutine: boolean;
  /** Literal value (otherwise computed: table option, file, other variable). */
  literal: boolean;
}

/**
 * Starting the pack (CreateObject("PinUpPlayer.PinDisplay"), then B2SInit or
 * Init) is only reached if a variable has a certain value, and the script gives it
 * another one at the start: 2001 : A Space Odyssey (Original 2025) ships
 * "usePUP = False", and the PUP plugin never loads its pack, even when properly placed.
 * The conditions around the line are followed in its Sub, then where that
 * Sub is called (three levels). A variable that only copies another one
 * ("HasPup = enablePupPack", The Goonies) refers to that one: it is the one to
 * switch on. undefined if nothing prevents it, or if it cannot be told: computed value
 * (table option, file read), changed in a Sub, Else, Select Case.
 * `code`: the script without comments, one line for one line (scriptCode).
 */
export function pupScriptSwitch(code: string): PupSwitch | undefined {
  return switchFinder(code)(PUP_CREATE);
}

const PUP_CREATE = /CreateObject\s*\(\s*"PinUpPlayer\.PinDisplay"\s*\)/i;

/**
 * Switch of the PuP-DMD: the variable that prevents reaching LabelInit (setting up
 * the PuP-DMD texts), if it is not already the one that cuts the pack. The Goonies:
 * "Const enablePupDMD = False", and PuPInit then makes PinUP Player hide the pack's DMD
 * screen (SendMSG FN 12), which the PUP plugin does not handle.
 */
export function pupDmdSwitch(code: string): PupSwitch | undefined {
  const find = switchFinder(code);
  const dmd = find(/\.LabelInit\b/i);
  if (!dmd) return undefined;
  const main = find(PUP_CREATE);
  if (main && main.variable.toLowerCase() === dmd.variable.toLowerCase()) return undefined;
  return { ...dmd, kind: 'dmd' };
}

/** For a script line (needle), the variable switched off at the start that keeps it from being reached. */
function switchFinder(code: string): (needle: RegExp) => PupSwitch | undefined {
  const lines = code.split(/\r?\n/);
  const routineOf: (string | undefined)[] = [];
  let routine: string | undefined;
  for (const line of lines) {
    const start = ROUTINE_START.exec(line);
    if (start) routine = start[1]!.toLowerCase();
    routineOf.push(routine);
    if (ROUTINE_END.test(line)) routine = undefined;
  }
  const assignments = new Map<string, Assignment[]>();
  lines.forEach((line, i) => {
    const inRoutine = routineOf[i] !== undefined && !ROUTINE_START.test(line);
    for (const statement of statements(line)) {
      // "If x Then usePUP = True": an assignment that may happen, as in a Sub.
      const single = /^if\s+.+?\s+then\s+(.+)$/i.exec(statement);
      const tails = single ? single[1]!.split(/\s+else\s+/i) : [statement];
      for (const s of tails) {
        const m = /^(?:const\s+|set\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/i.exec(s.trim());
        if (!m || /^(if|elseif|for|while|do|select|case)\b/i.test(s.trim())) continue;
        const key = m[1]!.toLowerCase();
        const value = m[2]!.trim();
        const list = assignments.get(key) ?? [];
        list.push({ name: m[1]!, value, line: i, inRoutine: inRoutine || Boolean(single), literal: LITERAL.test(value) });
        assignments.set(key, list);
      }
    }
  });

  /**
   * Starting value of a variable, if it is certain: literal outside any Sub, never
   * switched on again elsewhere. Copied from another variable ("HasPup = enablePupPack"), and never
   * changed in a Sub: the starting value of that other variable, two relays at most.
   */
  const startValue = (name: string, off: (v: Value) => boolean, depth = 0): Assignment | undefined => {
    const list = assignments.get(name.toLowerCase()) ?? [];
    const top = list.filter((a) => !a.inRoutine);
    const alias = top[0]?.value;
    if (
      depth < 2 &&
      alias !== undefined &&
      /^[A-Za-z_]\w*$/.test(alias) &&
      !LITERAL.test(alias) &&
      alias.toLowerCase() !== name.toLowerCase() &&
      top.every((a) => a.value.toLowerCase() === alias.toLowerCase()) &&
      !list.some((a) => a.inRoutine)
    ) {
      return startValue(alias, off, depth + 1);
    }
    if (!top.length || top.some((a) => !a.literal)) return undefined;
    const last = top.at(-1)!;
    if (top.some((a) => numeric(literalValue(a.value)) !== numeric(literalValue(last.value)))) return undefined;
    // A Sub that switches it on again (table option, setting read): nothing can be said.
    if (list.some((a) => a.inRoutine && (!a.literal || !off(literalValue(a.value))))) return undefined;
    return last;
  };

  /** Condition of an If: false at the start? Then the variable and the value that would make it true. */
  const blocking = (cond: string): PupSwitch | undefined => {
    const c = cond.trim().replace(/^\((.*)\)$/, '$1').trim();
    const ors = c.split(/\s+or\s+/i);
    if (ors.length > 1) {
      const all = ors.map(blocking);
      return all.every(Boolean) ? all[0] : undefined;
    }
    for (const part of c.split(/\s+and\s+/i)) {
      const found = blockingPart(part.trim().replace(/^\((.*)\)$/, '$1').trim());
      if (found) return found;
    }
    return undefined;
  };
  const blockingPart = (part: string): PupSwitch | undefined => {
    let variable: string;
    let test: (v: Value) => boolean;
    let enable: (assigned: string) => string | undefined;
    const bool = (assigned: string, on: boolean) => (/^(true|false)$/i.test(assigned) ? (on ? 'True' : 'False') : on ? '1' : '0');
    let m: RegExpExecArray | null;
    if ((m = /^not\s+([A-Za-z_]\w*)$/i.exec(part))) {
      variable = m[1]!;
      test = (v) => !truthy(v);
      enable = (a) => bool(a, false);
    } else if ((m = /^([A-Za-z_]\w*)$/.exec(part))) {
      variable = m[1]!;
      test = truthy;
      enable = (a) => bool(a, true);
    } else if ((m = /^([A-Za-z_]\w*)\s*(=|<>|>=|<=|>|<)\s*(true|false|-?\d+|"[^"]*")$/i.exec(part))) {
      variable = m[1]!;
      const op = m[2]!;
      const raw = m[3]!;
      const want = numeric(literalValue(raw));
      test = (v) => compare(numeric(v), op, want);
      enable = (a) => {
        if (op === '=') return /^(true|false)$/i.test(raw) ? (want === -1 ? 'True' : 'False') : raw;
        if (op === '<>' && typeof want !== 'string') return bool(a, want === 0);
        if (typeof want !== 'number') return undefined;
        if (op === '>=') return String(want);
        if (op === '>') return String(want + 1);
        return undefined;
      };
    } else return undefined;
    const assigned = startValue(variable, (v) => !test(v));
    if (!assigned || test(literalValue(assigned.value))) return undefined;
    const sw: PupSwitch = { variable: assigned.name, value: assigned.value, line: assigned.line };
    const on = enable(assigned.value);
    if (on !== undefined) sw.enable = on;
    return sw;
  };

  /** Conditions of the Ifs around line `i`, up to the start of its Sub; null: Else branch, unknown. */
  const guards = (i: number, needle: RegExp): { conds: string[]; routine?: string } | null => {
    const conds: string[] = [];
    const single = /^\s*if\s+(.+?)\s+then\s+(.+)$/i.exec(lines[i]!);
    if (single && needle.test(single[2]!)) conds.push(single[1]!);
    let depth = 0;
    for (let j = i - 1; j >= 0; j--) {
      const l = lines[j]!.trim();
      const start = ROUTINE_START.exec(l);
      if (start) return { conds, routine: start[1]!.toLowerCase() };
      if (ROUTINE_END.test(l)) return { conds };
      if (/^end\s+if\b/i.test(l)) depth++;
      else if (/^if\b.+\bthen$/i.test(l)) {
        if (depth > 0) depth--;
        else conds.push(/^if\s+(.+)\s+then$/i.exec(l)![1]!);
      } else if (depth === 0 && /^(else|elseif|case)\b/i.test(l)) return null;
    }
    return { conds };
  };

  /** Is the line blocked? The blocking, null if it is reached (or if it is unknown). */
  const blockedAt = (i: number, needle: RegExp, level: number): PupSwitch | null => {
    const g = guards(i, needle);
    if (!g) return null;
    for (const cond of g.conds) {
      const sw = blocking(cond);
      if (sw) return sw;
    }
    if (!g.routine || level >= 3) return null;
    const call = new RegExp(`\\b${g.routine}\\b`, 'i');
    const sites = lines.map((l, k) => k).filter((k) => call.test(lines[k]!) && !ROUTINE_START.test(lines[k]!) && routineOf[k] !== g.routine);
    // Sub never called by the script: a VPX event (Table1_Init...), reached.
    if (!sites.length) return null;
    let first: PupSwitch | null = null;
    for (const k of sites) {
      const sw = blockedAt(k, call, level + 1);
      if (!sw) return null;
      first ??= sw;
    }
    return first;
  };

  return (needle) => {
    const starts = lines.map((l, i) => i).filter((i) => needle.test(lines[i]!));
    if (!starts.length) return undefined;
    let found: PupSwitch | undefined;
    for (const i of starts) {
      const sw = blockedAt(i, needle, 0);
      if (!sw) return undefined;
      found ??= sw;
    }
    return found;
  };
}

function truthy(v: Value): boolean {
  return typeof v === 'string' ? v !== '' : v !== false && v !== 0;
}

function compare(a: number | string, op: string, b: number | string): boolean {
  if (typeof a !== typeof b) return op === '<>';
  switch (op) {
    case '=':
      return a === b;
    case '<>':
      return a !== b;
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    default:
      return a <= b;
  }
}

/**
 * The script with the switch turned on: only the value of the assignment changes, on
 * its line; the rest (line endings, comments, accents) is returned as is.
 * undefined if the line is no longer the expected one.
 */
export function enablePupSwitch(script: string, sw: PupSwitch): string | undefined {
  if (sw.enable === undefined) return undefined;
  const parts = script.split(/(\r?\n)/);
  const index = sw.line * 2;
  const line = parts[index];
  if (line === undefined) return undefined;
  const at = commentStart(line);
  const code = at < 0 ? line : line.slice(0, at);
  const value = sw.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|:)(\\s*(?:const\\s+)?${sw.variable}\\s*=\\s*)${value}(?=\\s*(?::|$))`, 'i');
  if (!re.test(code)) return undefined;
  parts[index] = code.replace(re, (_, sep: string, head: string) => `${sep}${head}${sw.enable}`) + (at < 0 ? '' : line.slice(at));
  return parts.join('');
}

/** Literal, or values given to the variable (Const cPuPPack = "...", pGameName = "..."). */
function resolveValue(code: string, token: string): string[] {
  if (token.startsWith('"')) return [token.slice(1, -1).trim()];
  return [...code.matchAll(new RegExp(`\\b${token}\\s*=\\s*"([^"\\r\\n]*)"`, 'gi'))].map((v) => v[1]!.trim());
}

/**
 * Numbers that the script sends to the PUP plugin as "E" triggers: each DOF n, DOFALT n,
 * SoundFXDOF(..., n, ...) and B2SSetData n goes through B2S Server (Sub DOF of controller.vbs;
 * B2SServer::B2SSetData sends B2SPluginEvent { 'E', n }, B2SServer.cpp l. 441-460 at commit
 * af26b2d93), which the PUP plugin compares with the E triggers of triggers.pup. A number relayed
 * by the parameter of the routine that wraps it (Sub DOF(DOFevent, State)) does not count; a
 * number computed elsewhere returns undefined: what the script sends is unknown. `code`: scriptCode.
 */
export function scriptB2sEvents(code: string): number[] | undefined {
  const sent = new Set<number>();
  let params = new Set<string>();
  const CALL = /\b(?:DOF(?:ALT)?\b\s*\(?\s*|SoundFXDOF\s*\(\s*[^,\r\n]*,\s*|B2SSetData\s*\(?\s*)([^,\r\n)]+?)\s*,/gi;
  for (const line of code.split('\n')) {
    // Routine header: its parameters count for the rest of the line ("Sub X : DOF 1, 1 : End Sub").
    const head = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function)\s+\w+\s*(?:\(([^)]*)\))?/i.exec(line);
    if (head) params = new Set((head[1] ?? '').split(',').map((p) => p.replace(/\b(ByVal|ByRef)\b/gi, '').trim().toLowerCase()).filter(Boolean));
    for (const m of (head ? line.slice(head[0].length) : line).matchAll(CALL)) {
      const arg = m[1]!.trim();
      if (/^\d+$/.test(arg)) sent.add(Number(arg));
      else if (!params.has(arg.toLowerCase())) return undefined;
    }
    if (/\bEnd\s+(Sub|Function)\b/i.test(line)) params = new Set();
  }
  return [...sent].sort((a, b) => a - b);
}

/**
 * What can make a pack play on a table without a ROM: its active "E" triggers, those
 * recognised on DMD images ("D" with their capture, pupcapture.ts), and its visible screens
 * that show an image or a video of their own (default playlist of screens.pup).
 */
export function packDrivers(root: string): { events: number[]; capture: number; defaults: number } {
  const file = readDirents(root).find((d) => d.isFile() && d.name.toLowerCase() === 'triggers.pup');
  const events = new Set<number>();
  if (file) {
    for (const line of readText(path.join(root, file.name)).split(/\r?\n/).slice(1)) {
      const cols = parseCsvLine(line);
      if (cols.length < 4 || cols[1]!.trim() !== '1') continue;
      const e = /^E(\d+)$/i.exec(cols[3]!.trim());
      if (e) events.add(Number(e[1]));
    }
  }
  const folders = new Map(readDirents(root).filter((d) => d.isDirectory()).map((d) => [d.name.toLowerCase(), d.name]));
  const defaults = packScreens(root).filter((s) => {
    if (!isVisible(s) || !s.playlist) return false;
    const dir = folders.get(s.playlist.toLowerCase());
    return Boolean(dir && readDirents(path.join(root, dir)).some((d) => d.isFile() && !isJunkName(d.name)));
  }).length;
  return { events: [...events].sort((a, b) => a - b), capture: captureTriggers(root).capture, defaults };
}

/** The script drives a game through PinMAME (`code`: scriptCode). */
export function usesPinmameCode(code: string): boolean {
  // LoadVPMALT: variant of LoadVPM in some tables (controller of choice), a ROM all the same.
  return /\bLoadVPM(?:ALT)?\b|VPinMAME\.Controller/i.test(code);
}

/** What must be known from the script to tell how the plugin finds the pack. */
export interface PupLoadFacts {
  usesPinmame: boolean;
  roms: string[];
  pup?: PupScriptFacts;
  /** Game name given to B2S Server (cGameName), for a table without a ROM. */
  b2sName?: string;
}

/**
 * Nobody will load the pack: the script never starts PuP, and the table does not play a ROM.
 * The PUP plugin of VPX 10.8.1 only loads a pack by itself for a PinMAME game
 * (PUPPlugin.cpp, OnControllersChanged, at commit af26b2d93: a game published by B2S, "b2s::...",
 * is ignored). These packs are made for PinUP Player connected to B2S Server, which looked for
 * them under the game name given to B2S. *Game of Thrones LE (VPW, Stern 2015)*, 28 October 2026:
 * FlexDMD script, "Dim PuPlayer ' Not currently used", mikeleonheart's pack next to it;
 * vpinball.log said "Plugin PUP loaded", never "PUP path".
 */
export function pupLoaderNeeded(facts: PupLoadFacts): boolean {
  return !facts.usesPinmame && !facts.pup;
}

/** Possible folder names of the pack, in the order the plugin tries them. */
export function expectedPackNames(facts: PupLoadFacts | undefined): string[] {
  if (!facts) return [];
  const names: string[] = [];
  // Without loading by the script or by the ROM, the name PinUP Player gave it: the game's name for B2S.
  const own = pupLoaderNeeded(facts) && facts.b2sName ? [facts.b2sName] : [];
  for (const name of [...(facts.pup?.packNames ?? []), ...(facts.usesPinmame ? facts.roms : []), ...own]) {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

// ---------- Starting the pack by Cyber Pinball ----------

/** Starting of the pack added to the script by Cyber Pinball, when the script does not do it. */
export interface PupLoader {
  /** Folder of the pack in pupvideos. */
  pack: string;
  /** Table object ("Table1"): the pack is started at the beginning of its Sub <table>_Init; absent, at the end of the script. */
  table?: string;
}

const LOADER_SUB = 'CyberPinball_PuPStart';

/**
 * The script that starts the pack as the table would: a PinUpPlayer.PinDisplay object, then
 * B2SInit with the folder name (PUPPinDisplay::B2SInit loads the pack and starts its screens).
 * The plugin asks for this to be done during the table's initialisation: the call is added at
 * the beginning of <table>_Init, on the line of the Sub ("Sub Table1_Init : CyberPinball_PuPStart");
 * the Sub itself, after the last line. The script's line numbers do not move.
 * Without the PUP plugin, the error is ignored (On Error Resume Next, in the Sub only) then
 * cleared: an "If Err Then MsgBox" further down in <table>_Init would not see it.
 */
export function addPupLoader(script: string, loader: PupLoader): string {
  const eol = /\r\n/.test(script) ? '\r\n' : '\n';
  const parts = script.split(/(\r?\n)/);
  let called = false;
  if (loader.table) {
    const name = loader.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const head = new RegExp(`^(\\s*(?:(?:public|private)\\s+)?sub\\s+${name}_init\\b(?:\\s*\\(\\s*\\))?)`, 'i');
    for (let i = 0; i < parts.length && !called; i += 2) {
      const line = parts[i]!;
      const at = commentStart(line);
      const code = at < 0 ? line : line.slice(0, at);
      if (!head.test(code)) continue;
      parts[i] = line.replace(head, `$1 : ${LOADER_SUB}`);
      called = true;
    }
  }
  let text = parts.join('');
  if (text && !/\r?\n$/.test(text)) text += eol;
  const pack = loader.pack.replace(/"/g, '""');
  const lines = [
    `Dim CyberPinball_PuP`,
    `Sub ${LOADER_SUB} : On Error Resume Next : Set CyberPinball_PuP = CreateObject("PinUpPlayer.PinDisplay") : CyberPinball_PuP.B2SInit "", "${pack}" : Err.Clear : End Sub`,
    ...(called ? [] : [LOADER_SUB]),
  ];
  return text + lines.join(eol) + eol;
}

// ---------- Triggers from DMD images ----------

/**
 * Active triggers of the pack (triggers.pup at its root): those that wait for a DMD image
 * ("D<n>" with PupCapture\<n>.bmp), and all of them.
 */
export function captureTriggers(root: string): { capture: number; total: number } {
  const file = readDirents(root).find((d) => d.isFile() && d.name.toLowerCase() === 'triggers.pup');
  if (!file) return { capture: 0, total: 0 };
  const captureDir = readDirents(root).find((d) => d.isDirectory() && d.name.toLowerCase() === 'pupcapture');
  const images = new Set(captureDir ? readDirents(path.join(root, captureDir.name)).filter((d) => d.isFile()).map((d) => d.name.toLowerCase()) : []);
  let capture = 0;
  let total = 0;
  for (const line of readText(path.join(root, file.name)).split(/\r?\n/).slice(1)) {
    const cols = parseCsvLine(line);
    if (cols.length < 4 || cols[1]!.trim() !== '1') continue;
    const trigger = cols[3]!.trim();
    if (!/^[A-Z]\d/i.test(trigger)) continue;
    total++;
    const d = /^D(\d+)$/i.exec(trigger);
    if (d && Number(d[1]) > 0 && images.has(`${Number(d[1])}.bmp`)) capture++;
  }
  return { capture, total };
}

// ---------- screens.pup ----------

/** CSV line as the plugin reads it (quotes, "" for a quote). */
export function parseCsvLine(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') quoted = false;
      else current += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      parts.push(current);
      current = '';
    } else current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim());
}

export interface PupScreen {
  num: number;
  description: string;
  /** Show, ForceON, ForcePoP, ForceBack, ForcePopBack, MusicOnly, Off. */
  mode: string;
  /** Parent screen of a CustomPos ("2,0,0,100,100"): the screen is shown inside it. */
  parent?: number;
  /** Place of the CustomPos, in % of the parent's window (PUPCustomPos::ScaledRect). */
  rect?: { x: number; y: number; w: number; h: number };
  /** Image or video shown by default on this screen: folder (playlist) and file, if given. */
  playlist?: string;
  playFile?: string;
}

/** Screens of screens.pup: the first line is skipped, a valid line has 8 columns (PUPScreen.cpp l. 65-105). */
export function parseScreens(text: string): PupScreen[] {
  const screens: PupScreen[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);
    if (parts.length !== 8) continue;
    const num = Number.parseInt(parts[0]!, 10);
    if (!Number.isFinite(num)) continue;
    const custom = parts[7] ? parseCsvLine(parts[7]) : [];
    const parent = custom.length >= 5 ? Number.parseInt(custom[0]!, 10) : undefined;
    const [x, y, w, h] = custom.slice(1, 5).map((v) => Number.parseFloat(v) || 0);
    screens.push({
      num,
      description: parts[1]!,
      mode: parts[5]!,
      parent: Number.isFinite(parent) ? parent : undefined,
      rect: custom.length >= 5 ? { x: x!, y: y!, w: w!, h: h! } : undefined,
      playlist: parts[2] || undefined,
      playFile: parts[3] || undefined,
    });
  }
  return screens;
}

/** The screen shows images (Off and MusicOnly display nothing). */
export function isVisible(screen: PupScreen): boolean {
  return !/^(off|musiconly)$/i.test(screen.mode);
}

/** VPX windows where the PUP plugin draws something with this screens.pup. */
export interface PupWindows {
  topper: boolean;
  backglass: boolean;
  dmd: boolean;
}

/**
 * What the PUP plugin draws in each window, like PUPManager::Render (commit
 * af26b2d93): a window has a root (Topper: screen 0; Backglass: 2, otherwise 6;
 * ScoreView: 5, otherwise 1), usable if it is not a screen placed inside another without a
 * child, and if a visible screen descends from it. Screens are added in the order of the
 * file; a missing CustomPos parent is created automatically (ForceBack), a screen repeated
 * further down replaces the first one and keeps its children (PUPManager::AddScreen).
 * Example: 2001 - A Space Odyssey, option "B2S Users ... Pup on Fulldmd": screen 2 is
 * placed inside 5 ("5,12.7,13.5,74.8,74.6"): nothing on the backglass, everything on the FullDMD.
 */
export function pupWindows(screens: PupScreen[]): PupWindows {
  const usable = pupRoots(screens);
  return { topper: usable(0), backglass: usable(2) || usable(6), dmd: usable(5) || usable(1) };
}

/**
 * PuP screen that the plugin takes as root of the DMD window: 5 (FullDMD, 16:9) or, failing
 * that, 1 (DMD); undefined when the pack draws nothing there (PUPManager::Render).
 */
export function pupDmdRoot(screens: PupScreen[]): 1 | 5 | undefined {
  const usable = pupRoots(screens);
  return usable(5) ? 5 : usable(1) ? 1 : undefined;
}

/** Usable roots according to screens.pup, like PUPManager::Render (see pupWindows). */
function pupRoots(screens: PupScreen[]): (root: number) => boolean {
  const byNum = new Map<number, PupScreen>();
  const parentOf = new Map<number, number>();
  for (const s of screens) {
    byNum.set(s.num, s);
    parentOf.delete(s.num);
    if (s.parent !== undefined && s.parent !== s.num) {
      if (!byNum.has(s.parent)) byNum.set(s.parent, { num: s.parent, description: '', mode: s.parent === 3 ? 'Off' : s.parent === 4 ? 'MusicOnly' : 'ForceBack' });
      parentOf.set(s.num, s.parent);
    }
  }
  const hasChildren = (num: number) => [...parentOf.values()].includes(num);
  const descends = (num: number, root: number) => {
    const seen = new Set<number>();
    for (let n: number | undefined = num; n !== undefined && !seen.has(n); n = parentOf.get(n)) {
      if (n === root) return true;
      seen.add(n);
    }
    return false;
  };
  return (root: number) => {
    if (!byNum.has(root) || (parentOf.has(root) && !hasChildren(root))) return false;
    return [...byNum.values()].some((s) => isVisible(s) && descends(s.num, root));
  };
}

/** The pack placed in `dir` (root found under the nesting) occupies the DMD window with the option in place. */
export function packDrawsDmd(dir: string): boolean {
  const screens = packScreens(findPackRoot(dir) ?? dir);
  return screens.length > 0 && pupWindows(screens).dmd;
}

/**
 * Screens of a pack's root (screens.pup applied), without the rest of the analysis: neither the
 * .bat files, nor the option folders, nor the walk through the whole pack looking for useless
 * files. The questions "does the pack occupy the DMD window?" only read `.screens` of a full
 * analysePack, redone for each pack at each diagnosis (17/11/2026). Same result
 * as analysePack(root).screens.
 */
export function packScreens(root: string): PupScreen[] {
  const screensFile = readDirents(root).find((d) => d.isFile() && d.name.toLowerCase() === 'screens.pup');
  return screensFile ? parseScreens(readText(path.join(root, screensFile.name))) : [];
}

/** Names that PinUP Player gives its screens (PinUpPlayer.ini), for the screens that screens.pup does not declare. */
const DEFAULT_SCREEN_NAMES: Record<number, string> = { 0: 'Topper', 1: 'DMD', 2: 'Backglass', 3: 'Playfield', 4: 'Music', 5: 'FullDMD' };

/**
 * screens.pup to write in a pack that has none: its playlists (playlists.pup) and its
 * triggers (triggers.pup) target screens that nothing declares. PinUP Player then took
 * its default screens; the PUP plugin of VPX 10.8.1 creates none (PUPManager::LoadConfig,
 * commit af26b2d93: "No screens.pup file found", then nothing), and the whole pack stays off:
 * triggers and playlists attach to screens that do not exist. Found on 17/11/2026 on
 * four tables imported from PinUP Popper (24, Black Knight, Daredevil, World Cup Soccer).
 *
 * Each targeted screen is declared as the plugin itself would (PUPScreen::CreateDefault):
 * Show mode, no background, no separate place, at the default volume (empty column). undefined:
 * the pack already has its screens.pup, has options to apply (pupOptionNotApplied), or targets
 * no screen (pack driven by the script, which creates its screens through PuPlayer.Init).
 */
export function defaultScreensPup(root: string): string | undefined {
  const entries = readDirents(root);
  const file = (name: string) => entries.find((d) => d.isFile() && d.name.toLowerCase() === name)?.name;
  if (file('screens.pup')) return undefined;
  const nums = new Set<number>();
  const collect = (name: string, column: number) => {
    const found = file(name);
    if (!found) return;
    for (const line of readText(path.join(root, found)).split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const num = Number.parseInt(parseCsvLine(line)[column] ?? '', 10);
      if (Number.isInteger(num) && num >= 0 && num < 100) nums.add(num);
    }
  };
  collect('playlists.pup', 0);
  collect('triggers.pup', 4);
  if (!nums.size) return undefined;
  const lines = ['ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos'];
  for (const num of [...nums].sort((a, b) => a - b)) lines.push(`${num},${DEFAULT_SCREEN_NAMES[num] ?? `Screen ${num}`},,,0,Show,,`);
  return lines.join('\r\n') + '\r\n';
}

/**
 * PuP-DMD placed in the backglass: the DMD screen (5, otherwise 1) is placed in the backglass
 * (CustomPos "2,0,0,100,100") and nothing occupies the DMD window. The author composed a single
 * large 16:9 screen, score at the bottom of the backglass; on a cabinet that has a DMD screen,
 * that one stays empty.
 * Example: City Hunter (Original 2025, Tombg), on 6 November 2026: six videos at the top of the
 * backglass, the score (labels of screen 1) in the bottom band.
 *
 * `band`: the band of the backglass, in % of its height, that the other screens placed in the
 * backglass leave free (the taller of the two, at the top or at the bottom): that is where the
 * author put the score. Without a clear band (under 15 %), the whole DMD screen.
 *
 * The band keeps the proportions that the author composed: the PUP plugin places and sizes
 * labels in % of the width and height of their screen (PUPLabel::Render), a place stretched
 * in height enlarges the text without spreading the labels apart, which then overlap
 * (City Hunter on the 16:9 FullDMD of a PC, 6 November 2026, with a band computed for
 * a 4:1 DMD). So it is placed in the DMD window (`windowAspect`, width over
 * height) as large as possible without distortion, centred (dmdBandPlacement).
 */
export interface DmdInBackglass {
  /** DMD screen (1 or 5). */
  screen: number;
  /** Backglass screen where it is placed (2 or 6). */
  parent: number;
  /** Band of the DMD screen to show in the DMD window, in % of its height. */
  band: { top: number; bottom: number };
  /** CustomPos that places this band in the DMD window (relocateScreen). */
  customPos: string;
}

const BACKGLASS_SCREENS = [2, 6];

/** Proportions (width over height) of the backglass screen the pack is composed for: 2 "Backglass 16x9", 6 "Backglass 4x3-5x4" (PUPManager::AddScreen). */
const BACKGLASS_ASPECT: Record<number, number> = { 2: 16 / 9, 6: 4 / 3 };

/** Real DMD, when the cabinet does not tell the shape of the DMD window. */
const DEFAULT_DMD_ASPECT = 4;

export function dmdInBackglass(screens: PupScreen[], windowAspect = DEFAULT_DMD_ASPECT): DmdInBackglass | undefined {
  if (!screens.length || pupWindows(screens).dmd) return undefined;
  // Last definition of each screen: the one the plugin keeps (PUPManager::AddScreen).
  const byNum = new Map(screens.map((s) => [s.num, s]));
  const dmd = [5, 1].map((n) => byNum.get(n)).find((s) => s && isVisible(s) && s.parent !== undefined && BACKGLASS_SCREENS.includes(s.parent));
  if (!dmd?.rect || !dmd.parent) return undefined;
  const parent = dmd.parent;
  // Other visible screens placed in the same backglass, except full-size backgrounds.
  const others = [...byNum.values()].filter(
    (s) => s !== dmd && isVisible(s) && s.parent === parent && s.rect && !(s.rect.w >= 90 && s.rect.h >= 90) && s.rect.h > 0,
  );
  let band = { top: 0, bottom: 100 };
  if (others.length) {
    const top = Math.max(0, Math.min(...others.map((s) => s.rect!.y)));
    const bottom = Math.min(100, Math.max(...others.map((s) => s.rect!.y + s.rect!.h)));
    const below = 100 - bottom;
    if (Math.max(top, below) >= 15) band = below >= top ? { top: bottom, bottom: 100 } : { top: 0, bottom: top };
  }
  // Band of the backglass, brought back into the DMD screen (its place in the backglass: dmd.rect).
  const r = dmd.rect;
  const from = r.h > 0 ? Math.max(0, (band.top - r.y) / r.h) : 0;
  const to = r.h > 0 ? Math.min(1, (band.bottom - r.y) / r.h) : 1;
  const inside = to - from >= 0.15 ? { top: from * 100, bottom: to * 100 } : { top: 0, bottom: 100 };
  // Proportions of the DMD screen as the author composed it: its place in the backglass.
  const canvasAspect = (BACKGLASS_ASPECT[parent] ?? 16 / 9) * (r.w > 0 && r.h > 0 ? r.w / r.h : 1);
  const place = dmdBandPlacement(inside, canvasAspect, windowAspect > 0 ? windowAspect : DEFAULT_DMD_ASPECT);
  return { screen: dmd.num, parent, band: inside, customPos: customPosOf(dmd.num, place) };
}

/**
 * Place of the screen (in % of the window, like a CustomPos) that shows the band `band` (in % of
 * its height) as large as possible in a window of proportions `windowAspect`, without distorting
 * it (`canvasAspect`: width over height of the screen composed by the author), centred. The screen
 * overflows the window where the band does not cover it: what goes beyond is not seen
 * (PUPScreen::SetBounds does not limit the place to the window).
 */
export function dmdBandPlacement(band: { top: number; bottom: number }, canvasAspect: number, windowAspect: number): { x: number; y: number; w: number; h: number } {
  const share = (band.bottom - band.top) / 100;
  // The whole width of the window; if the band then overflows in height, the whole height.
  let w = 100;
  let h = (100 * windowAspect) / canvasAspect;
  if (h * share > 100) {
    h = 100 / share;
    w = (h * canvasAspect) / windowAspect;
  }
  const x = (100 - w) / 2;
  const y = (100 - h * share) / 2 - (h * band.top) / 100;
  return { x, y, w, h };
}

function customPosOf(screen: number, place: { x: number; y: number; w: number; h: number }): string {
  const fmt = (v: number) => String(Math.round(v * 100) / 100);
  return [screen, place.x, place.y, place.w, place.h].map((v, i) => (i === 0 ? String(v) : fmt(v))).join(',');
}

/**
 * CustomPos where the screen designates itself: it stays a root (PUPManager::AddScreen: no
 * parent when the source is the screen itself). This is the form that Cyber Pinball sets
 * (dmdBandPlacement); the .info remembers which one (PupMemory.dmd).
 */
export function isBandCustomPos(screen: PupScreen): boolean {
  return Boolean(screen.rect && screen.parent === screen.num);
}

/**
 * screens.pup where the last line of screen `num` gets the CustomPos `customPos`; the other
 * lines and columns, the line endings and the bytes (read as latin1) stay as they are.
 */
export function relocateScreen(text: string, num: number, customPos: string): string {
  const lines = text.split(/(?<=\n)/);
  let index = -1;
  lines.forEach((line, i) => {
    if (i === 0) return;
    const parts = parseCsvLine(line.replace(/\r?\n$/, ''));
    if (parts.length === 8 && Number.parseInt(parts[0]!, 10) === num) index = i;
  });
  if (index < 0) return text;
  const line = lines[index]!;
  const eol = /\r?\n$/.exec(line)?.[0] ?? '';
  const body = line.slice(0, line.length - eol.length);
  // Start of the 8th column: after the 7th comma outside quotes.
  let commas = 0;
  let quoted = false;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted && ++commas === 7) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return text;
  lines[index] = `${body.slice(0, start)}"${customPos}"${eol}`;
  return lines.join('');
}

/** CustomPos (8th column) of the last line of screen `num`, as written; undefined without a line. */
export function screenCustomPos(text: string, num: number): string | undefined {
  let found: string | undefined;
  for (const line of text.split(/\r?\n/).slice(1)) {
    const parts = parseCsvLine(line);
    if (parts.length === 8 && Number.parseInt(parts[0]!, 10) === num) found = parts[7]!;
  }
  return found;
}

/**
 * Two identical screens.pup files, except for one screen whose place Cyber Pinball changed
 * (isBandCustomPos in `actual`): the pack's option stays recognised after the touch-up.
 */
export function sameScreensIgnoringBand(actual: string, expected: string): boolean {
  const a = actual.split(/\r?\n/).filter((l) => l.trim());
  const b = expected.split(/\r?\n/).filter((l) => l.trim());
  if (a.length !== b.length) return false;
  return a.every((line, i) => {
    if (line === b[i]) return true;
    const pa = parseCsvLine(line);
    const pb = parseCsvLine(b[i]!);
    if (pa.length !== 8 || pb.length !== 8 || pa.slice(0, 7).join('\u0000') !== pb.slice(0, 7).join('\u0000')) return false;
    const [screen] = parseScreens(`h\n${line}`);
    return Boolean(screen && isBandCustomPos(screen));
  });
}

/** Cabinet role where the plugin draws a PuP screen; null: never displayed (Playfield). */
export function screenRole(num: number): RoleId | null | undefined {
  if (num === 0) return 'topper';
  if (num === 2 || num === 6) return 'backglass';
  if (num === 1 || num === 5) return 'dmd';
  if (num === 3) return null;
  return undefined;
}

// ---------- Root of a pack ----------

/** Worthless files left by macOS, and empty videos. */
export function isJunkName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('._') || lower === '.ds_store' || lower === '__macosx';
}

const OPTIONS_DIR = /option/i;

/** Folder that contains screens.pup, playlists.pup or triggers.pup, or options that contain them. */
export function isPackRoot(dir: string): boolean {
  const entries = readDirents(dir);
  if (entries.some((d) => d.isFile() && (PUP_FILES as readonly string[]).includes(d.name.toLowerCase()))) return true;
  return optionFolders(dir).length > 0;
}

/**
 * True root of the pack under `dir`: `dir` itself, or by going down the
 * nesting ("rom\rom", extra archive folder that contains only the pack).
 */
export function findPackRoot(dir: string, depth = 3): string | undefined {
  if (isPackRoot(dir)) return dir;
  if (depth === 0) return undefined;
  const entries = readDirents(dir).filter((d) => !isJunkName(d.name));
  const dirs = entries.filter((d) => d.isDirectory());
  // A readme or an image next to the pack's folder does not prevent going down.
  const files = entries.filter((d) => d.isFile() && !/\.(txt|pdf|md|rtf|url|html?|jpe?g|png|gif)$/i.test(d.name));
  const same = dirs.find((d) => d.name.toLowerCase() === path.basename(dir).toLowerCase());
  const next = same ?? (dirs.length === 1 && files.length === 0 ? dirs[0] : undefined);
  return next ? findPackRoot(path.join(dir, next.name), depth - 1) : undefined;
}

/**
 * Backup copy of a folder ("PuP-Pack_Options - Copy", "_backup", "Topper.orig"):
 * neither an option, nor the state in place. Gardians of the Galaxy (gotg_2020) ships a
 * "PuP-Pack_Options - Copy" next to the real options folder.
 */
export function isBackupName(name: string): boolean {
  return /(^|[^a-z])(copy|copie|backup|sauvegarde|old)([^a-z]|$)|\.(orig|bak|old)$/i.test(name);
}

/** Option subfolders ("PuP-Pack_Options\Option 1 - ...") that contain .pup files. */
function optionFolders(root: string): string[] {
  const found: string[] = [];
  for (const d of readDirents(root)) {
    if (!d.isDirectory() || !OPTIONS_DIR.test(d.name) || isBackupName(d.name)) continue;
    for (const sub of readDirents(path.join(root, d.name))) {
      if (sub.isDirectory() && hasPupFile(path.join(root, d.name, sub.name))) found.push(path.join(d.name, sub.name));
    }
  }
  return found;
}

function hasPupFile(dir: string): boolean {
  return readDirents(dir).some((d) => d.isFile() && d.name.toLowerCase().endsWith('.pup'));
}

// ---------- Order of playlists ----------

/** File of a playlist to rename, paths relative to the pack's root. */
export interface PlaylistRename {
  playlist: string;
  /** First file for the PUP plugin, today. */
  wrong: string;
  from: string;
  to: string;
}

/** Order of Windows and PinUP Player: case-insensitive (names in upper case, like NTFS). */
function folderOrder(a: string, b: string): number {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Order of the PUP plugin: std::ranges::sort on the paths, character by character, case included. */
function pluginOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Files to rename so that the PUP plugin starts each playlist with the same file
 * as PinUP Player. The plugin sorts the files of a playlist case-sensitively
 * (PUPPlaylist.cpp, commit af26b2d93), PinUP Player does not; a screen for which screens.pup gives
 * the playlist without a file plays the first one. *2001 - A Space Odyssey*: screen 14
 * "Callouts" plays PupAlphas, in which the author named "aaclear.png" (transparent) so
 * that it comes before the "Overlay1..." frames; the plugin took "Overlay1 by Dr Nobody
 * TY.png", a whole frame squashed in the middle of the backglass (26 October 2026). The wanted
 * file takes its name in upper case (extension kept): it then comes first in both
 * orders. The plugin finds a file named by a trigger case-insensitively:
 * nothing else changes.
 */
export function playlistRenames(root: string): PlaylistRename[] {
  const renames: PlaylistRename[] = [];
  for (const dir of readDirents(root)) {
    if (!dir.isDirectory() || isJunkName(dir.name) || OPTIONS_DIR.test(dir.name)) continue;
    const files = readDirents(path.join(root, dir.name))
      .filter((d) => d.isFile() && !isJunkName(d.name))
      .map((d) => d.name);
    if (files.length < 2) continue;
    const wrong = [...files].sort(pluginOrder)[0]!;
    const wanted = [...files].sort(folderOrder)[0]!;
    if (wrong === wanted) continue;
    const ext = path.extname(wanted);
    const renamed = wanted.slice(0, wanted.length - ext.length).toUpperCase() + ext;
    const after = files.map((f) => (f === wanted ? renamed : f)).sort(pluginOrder)[0];
    if (after !== renamed || renamed === wanted) continue;
    renames.push({ playlist: dir.name, wrong, from: path.join(dir.name, wanted), to: path.join(dir.name, renamed) });
  }
  return renames;
}

// ---------- Options ----------

export interface VariantTraits {
  /** Variant for a single screen (desktop). */
  desktop: boolean;
  /** Variant that the plugin cannot render (all-in-one cabinet, PuP Stream). */
  unsupported: boolean;
  topper?: boolean;
  /** Where the DMD goes: on its own screen, in the backglass, nowhere. */
  dmd?: 'separate' | 'backglass' | 'none';
  /** FullDMD (16:9 screen) rather than real DMD (4:1). */
  fullDmd?: boolean;
  /** Targeted backglass proportions (16/9, 4/3...). */
  ratios: number[];
  /** Windows that the PUP plugin fills with the variant's screens.pup (pupWindows). */
  windows?: PupWindows;
}

export interface PupVariant {
  /** Name shown: the .bat without extension, or the variant's folder. */
  label: string;
  /** .bat the variant comes from. */
  bat?: string;
  /** Folder the files come from, relative to the pack's root. */
  folder?: string;
  /** Files to copy, relative to the pack's root. */
  copies: { from: string; to: string }[];
  /** Files that the .bat deletes (tools of the classic mode), relative to the root. */
  deletes: string[];
  traits: VariantTraits;
}

export interface BatReport {
  bat: string;
  ok: boolean;
  /** What prevents reading the .bat without running it. */
  reason?: string;
}

export interface PupPackInfo {
  root: string;
  /** .pup files present at the root (real names). */
  pupFiles: string[];
  variants: PupVariant[];
  /** Option .bat files analysed, successfully or not. */
  bats: BatReport[];
  /** Useless files (._*, .DS_Store, empty MP4s), relative to the root. */
  junk: string[];
  hasPupCapture: boolean;
  /** Screens of the root (screens.pup applied). */
  screens: PupScreen[];
}

export function analysePack(root: string): PupPackInfo {
  const entries = readDirents(root);
  const pupFiles = entries.filter((d) => d.isFile() && (PUP_FILES as readonly string[]).includes(d.name.toLowerCase())).map((d) => d.name);
  const screensFile = pupFiles.find((f) => f.toLowerCase() === 'screens.pup');
  const variants: PupVariant[] = [];
  const bats: BatReport[] = [];
  for (const bat of entries.filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.bat')).map((d) => d.name).sort((a, b) => a.localeCompare(b))) {
    const result = parseOptionBat(root, bat);
    if (!result.option) continue;
    bats.push({ bat, ok: Boolean(result.variant), reason: result.reason });
    if (result.variant) variants.push({ ...result.variant, traits: traitsOf(root, result.variant) });
  }
  // Variants placed in an options folder: those that no readable .bat covers (a
  // .bat that copies a file from one covers it), never the same name twice. GOTG (gotg_2020):
  // each option appeared twice, through its .bat and through its folder, and the tied
  // score between the two twins hid the recommendation ("pas de choix net" (no clear choice)).
  const inside = (file: string, folder: string) => file.toLowerCase().startsWith(folder.toLowerCase() + path.sep);
  for (const folder of optionFolders(root)) {
    if (variants.some((v) => (v.folder && v.folder.toLowerCase() === folder.toLowerCase()) || v.copies.some((c) => inside(c.from, folder)))) continue;
    if (variants.some((v) => v.label.toLowerCase() === path.basename(folder).toLowerCase())) continue;
    const copies = listFiles(path.join(root, folder)).map((rel) => ({ from: path.join(folder, rel), to: rel }));
    const variant = { label: path.basename(folder), folder, copies, deletes: [] };
    variants.push({ ...variant, traits: traitsOf(root, variant) });
  }
  return {
    root,
    pupFiles,
    variants,
    bats,
    junk: listJunk(root),
    hasPupCapture: entries.some((d) => d.isDirectory() && d.name.toLowerCase() === 'pupcapture'),
    screens: screensFile ? parseScreens(readText(path.join(root, screensFile))) : [],
  };
}

const IGNORED_COMMANDS = new Set(['rem', 'echo', 'echo.', 'pause', 'cls', 'exit', 'title', 'color', 'timeout', 'setlocal', 'endlocal', 'chcp', 'popd', 'goto :eof']);

/**
 * Reads an option .bat without running it. Recognised: copy and xcopy from a folder
 * of the pack to the root (or one of its folders), del of files of the pack, and
 * commands without effect (echo, rem, pause, cd to the .bat's folder...).
 * Anything else (absolute paths, variables, start, move, if...) makes the
 * analysis fail: what a .bat would do is never guessed.
 */
export function parseOptionBat(root: string, bat: string): { option: boolean; variant?: Omit<PupVariant, 'traits'>; reason?: string } {
  const text = readText(path.join(root, bat));
  const label = bat.replace(/\.bat$/i, '');
  const looksLikeOption = /option|^\s*\d+\s*[-_.)]/i.test(label);
  const mentionsCopy = /^\s*@?\s*(x?copy)\b/im.test(text);
  const option = looksLikeOption || mentionsCopy;
  const copies: { from: string; to: string }[] = [];
  // Each del with the number of copies made before it: a file deleted then copied again
  // ("del Option*.jpg", then "xcopy Option 2.JPG") stays in place.
  const deleted: { name: string; at: number }[] = [];
  const fail = (reason: string) => ({ option, reason });
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^@/, '').trim();
    if (!line || line.startsWith('::') || /^rem(\s|$)/i.test(line)) continue;
    line = line.replace(/\s*\d?>\s*nul(\s+2>&1)?\s*$/i, '').trim();
    const command = line.split(/\s+/)[0]!.toLowerCase();
    if (IGNORED_COMMANDS.has(command) || /^echo[\s.]/i.test(line)) {
      if (command === 'echo' && /[>|]/.test(line)) return fail(t('« {line} » écrit dans un fichier', { line }));
      continue;
    }
    if (/[|&<>]/.test(line.replace(/"[^"]*"/g, ''))) return fail(t('« {line} » enchaîne plusieurs commandes', { line }));
    const args = tokenize(line).slice(1);
    if (['cd', 'chdir', 'pushd'].includes(command)) {
      const target = args.filter((a) => a.toLowerCase() !== '/d');
      if (target.length === 1 && relativeArg(target[0]!) === '') continue;
      return fail(t('« {line} » change de dossier', { line }));
    }
    if (command === 'xcopy' || command === 'copy') {
      const flags = args.filter((a) => a.startsWith('/')).join('').toLowerCase();
      const paths = args.filter((a) => !a.startsWith('/'));
      if (paths.length < 1 || paths.length > 2 || paths.some((p) => p.includes('+'))) return fail(t('« {line} » n’est pas une copie simple', { line }));
      const src = relativeArg(paths[0]!);
      const dest = paths[1] === undefined ? '' : relativeArg(paths[1]);
      if (src === undefined || dest === undefined) return fail(t('« {line} » sort du dossier du pack', { line }));
      const recursive = command === 'xcopy' && /\/[se]/.test(flags);
      const found = expandSource(root, src, recursive);
      if (!found) return fail(t('« {line} » ne correspond à aucun fichier du pack', { line: paths[0]! }));
      const destDir = resolveInside(root, dest) ?? dest;
      for (const rel of found.files) copies.push({ from: path.join(found.dir, rel), to: path.join(destDir, rel) });
      continue;
    }
    if (command === 'del' || command === 'erase') {
      const targets = args.filter((a) => !a.startsWith('/'));
      for (const target of targets) {
        const rel = relativeArg(target);
        if (rel === undefined || rel.includes(path.sep)) return fail(t('« {line} » supprime hors de la racine du pack', { line }));
        for (const name of matchNames(readDirents(root).filter((d) => d.isFile()).map((d) => d.name), rel)) deleted.push({ name, at: copies.length });
      }
      continue;
    }
    return fail(t('commande « {command} » non reconnue', { command }));
  }
  if (!copies.length) return { option: looksLikeOption, reason: option ? t('aucune copie de fichiers trouvée') : undefined };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const deletes = [...new Set(deleted.filter((d) => !copies.slice(d.at).some((c) => same(c.to, d.name))).map((d) => d.name))];
  // Folder of the variant: the one its .pup files come from (the preview "Option 2.JPG" is
  // often taken one level higher), otherwise the common folder of the copied files.
  const pups = copies.filter((c) => c.from.toLowerCase().endsWith('.pup'));
  const sources = (pups.length ? pups : copies).map((c) => path.dirname(c.from));
  const dirs = [...new Set(sources.map((d) => d.split(path.sep)[0]!))];
  const folder = dirs.length === 1 ? commonDir(sources) : undefined;
  return { option: true, variant: { label, bat, folder: folder && folder !== '.' ? folder : undefined, copies, deletes } };
}

/** Splits a command line into arguments, quotes included. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  for (const m of line.matchAll(/"([^"]*)"|(\S+)/g)) {
    const token = m[1] ?? m[2]!;
    // "/y/s": several options stuck together.
    if (m[2] && token.startsWith('/')) tokens.push(...token.split(/(?=\/)/));
    else tokens.push(token);
  }
  return tokens;
}

/** Path relative to the .bat's folder, or undefined if it goes outside it (absolute, variable, ..). */
function relativeArg(arg: string): string | undefined {
  let p = arg.replace(/^%~dp0\\?/i, '').replace(/^%cd%\\?/i, '').replace(/\//g, '\\');
  if (/%|^[a-z]:|^\\/i.test(p)) return undefined;
  p = p.replace(/^(\.\\)+/, '').replace(/\\+$/, '');
  if (p === '.') p = '';
  const parts = p.split('\\').filter(Boolean);
  if (parts.includes('..')) return undefined;
  return parts.join(path.sep);
}

/** Files designated by the source of a copy: a folder, a pattern ("dossier\*.pup") or a file. */
function expandSource(root: string, src: string, recursive: boolean): { dir: string; files: string[] } | undefined {
  const parts = src.split(path.sep).filter(Boolean);
  const last = parts.at(-1) ?? '';
  const wildcard = /[*?]/.test(last);
  const asDir = !wildcard ? resolveInside(root, src) : undefined;
  if (asDir && isDirectory(path.join(root, asDir))) {
    const files = recursive ? listFiles(path.join(root, asDir)) : readDirents(path.join(root, asDir)).filter((d) => d.isFile()).map((d) => d.name);
    return files.length ? { dir: asDir, files } : undefined;
  }
  const dir = resolveInside(root, parts.slice(0, -1).join(path.sep));
  if (dir === undefined) return undefined;
  const pattern = last;
  const pool = recursive ? listFiles(path.join(root, dir)) : readDirents(path.join(root, dir)).filter((d) => d.isFile()).map((d) => d.name);
  const files = pool.filter((rel) => matchNames([path.basename(rel)], pattern).length > 0);
  return files.length ? { dir, files } : undefined;
}

/** Real relative path (case on disk), or undefined if it does not exist. */
function resolveInside(root: string, rel: string): string | undefined {
  let current = '';
  for (const part of rel.split(path.sep).filter(Boolean)) {
    const found = readDirents(path.join(root, current)).find((d) => d.name.toLowerCase() === part.toLowerCase());
    if (!found) return undefined;
    current = path.join(current, found.name);
  }
  return current;
}

/** Names that match a cmd.exe pattern (* and ?), case-insensitively. */
function matchNames(names: string[], pattern: string): string[] {
  const expr = pattern === '*.*' ? '*' : pattern;
  const re = new RegExp(`^${expr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return names.filter((n) => re.test(n));
}

function commonDir(dirs: string[]): string {
  const split = dirs.map((d) => d.split(path.sep));
  const first = split[0] ?? [];
  let n = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < n && i < parts.length && parts[i]!.toLowerCase() === first[i]!.toLowerCase()) i++;
    n = i;
  }
  return first.slice(0, n).join(path.sep);
}

/** What a variant targets, from its name then its screens.pup. */
export function traitsOf(root: string, variant: Omit<PupVariant, 'traits'>): VariantTraits {
  const name = variant.label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const traits: VariantTraits = {
    desktop: /desktop|bureau|single screen|\b1 ?screen|one screen|\b1 ?ecran/.test(name),
    unsupported: /\baio\b|all[ -]?in[ -]?one|stream|speaker panel/.test(name),
    ratios: [],
  };
  if (/(no|without|sans) topper/.test(name)) traits.topper = false;
  else if (/topper/.test(name)) traits.topper = true;
  if (/\b(no|without|sans) ?(real |full ?)?dmd/.test(name)) traits.dmd = 'none';
  else if (/dmd.*\b(on|in|sur|dans)\b.*(backglass|bg)\b/.test(name) || /\b2 ?(screen|ecran)/.test(name)) traits.dmd = 'backglass';
  else if (/dmd|3 ?(screen|ecran)|three screen/.test(name)) traits.dmd = 'separate';
  if (/full ?dmd/.test(name)) traits.fullDmd = true;
  else if (/real ?dmd|4[x:]1|128x32/.test(name)) traits.fullDmd = false;
  for (const [re, ratio] of [
    [/16[x:/]9/, 16 / 9],
    [/21[x:/]9/, 21 / 9],
    [/4[x:/]3/, 4 / 3],
    [/5[x:/]4/, 5 / 4],
    [/1[x:/]1|square|carre/, 1],
  ] as const) {
    if (re.test(name)) traits.ratios.push(ratio);
  }
  // The variant's screens.pup completes what the name does not say.
  const screensCopy = variant.copies.find((c) => c.to.toLowerCase() === 'screens.pup');
  if (screensCopy) {
    const screens = parseScreens(readText(path.join(root, screensCopy.from)));
    const shown = (num: number) => screens.find((s) => s.num === num && isVisible(s));
    if (traits.topper === undefined && screens.some((s) => s.num === 0)) traits.topper = Boolean(shown(0));
    const dmd = shown(5) ?? shown(1);
    if (traits.dmd === undefined && screens.length) {
      if (screens.some((s) => s.num === 1 || s.num === 5)) {
        traits.dmd = !dmd ? 'none' : dmd.parent !== undefined && dmd.parent !== dmd.num && screenRole(dmd.parent) === 'backglass' ? 'backglass' : 'separate';
      } else {
        // No DMD screen (1) nor FullDMD (5): the pack does not occupy the DMD window, which
        // does not say that the cabinet has none. A "DMD" screen placed on the backglass tells
        // where the DMD goes: switched on, the pack puts its own animations there (the real DMD
        // stays on its screen); switched off, the frame stays empty to put the DMD there.
        // Otherwise, nothing to deduce (Star Trek LE, October 2026: the option made for a cabinet
        // with a DMD noted "sans DMD" (without DMD), behind the one that leaves the frame empty).
        const frame = screens.find((s) => s.parent !== undefined && s.parent !== s.num && screenRole(s.parent) === 'backglass' && /dmd/i.test(`${s.description} ${s.playlist ?? ''}`));
        if (frame) traits.dmd = isVisible(frame) ? 'separate' : 'backglass';
      }
    }
    if (!traits.desktop && shown(3) && !shown(2) && !shown(6)) traits.desktop = true;
    if (screens.length) {
      traits.windows = pupWindows(screens);
      // Without a hint in the name: the screen that the plugin puts in the DMD window, 5 (FullDMD
      // 16:9) or 1 (DMD); a FullDMD in a 4:1 band would be shrunk there.
      const root = pupDmdRoot(screens);
      if (traits.fullDmd === undefined && root) traits.fullDmd = root === 5;
      // The topper window, filled or not, wins over the name: "Default Locale Topper
      // Off" (2001) puts the topper in the main screen, the topper window stays empty.
      if (screens.some((s) => s.num === 0 || s.parent === 0)) traits.topper = traits.windows.topper;
    }
  }
  return traits;
}

// ---------- Choice from the cabinet ----------

/** What a pack's option needs to know about the cabinet. */
export interface PupCabinet {
  backglass: boolean;
  dmd: boolean;
  topper: boolean;
  /** Long side over short side: 4 for a real DMD, 1.78 for a 16:9 screen. */
  dmdRatio?: number;
  /**
   * The DMD screen is a FullDMD (dmdKindOf: the user's choice, otherwise the shape of its area).
   * Absent: from dmdRatio.
   */
  fullDmd?: boolean;
  /**
   * The table has its backglass (.directb2s): an option that leaves the backglass window to
   * B2S ("B2S Users") then has something to show there. Absent: unknown.
   */
  tableBackglass?: boolean;
  backglassRatio?: number;
  /**
   * Width over height of each role, in Windows pixels (area included): the
   * table diagnosis compares the media proportions with them. The playfield occupies its whole screen.
   */
  aspects?: Partial<Record<RoleId, number>>;
}

export function pupCabinet(cabinet: Cabinet | undefined): PupCabinet | undefined {
  if (!cabinet) return undefined;
  // Proportions of the window that VPX will open for the role: its area, not the whole screen
  // (backglass and DMD often share the backglass monitor).
  const ratio = (role: AncillaryRoleId) => {
    const screen = cabinet.screens.find((s) => s.fingerprint === cabinet.roles[role]);
    if (!screen || !screen.widthPx || !screen.heightPx) return undefined;
    return zoneRatio(roleZone(cabinet, role), { width: screen.widthPx, height: screen.heightPx });
  };
  const aspects: Partial<Record<RoleId, number>> = {};
  for (const role of ['playfield', 'backglass', 'dmd', 'topper'] as const) {
    const screen = cabinet.screens.find((s) => s.fingerprint === cabinet.roles[role]);
    if (!screen || !screen.widthPx || !screen.heightPx) continue;
    const zone = role === 'playfield' ? { width: 1, height: 1 } : roleZone(cabinet, role);
    aspects[role] = (zone.width * screen.widthPx) / (zone.height * screen.heightPx);
  }
  return {
    backglass: Boolean(cabinet.roles.backglass),
    dmd: Boolean(cabinet.roles.dmd),
    topper: Boolean(cabinet.roles.topper),
    dmdRatio: ratio('dmd'),
    ...(cabinet.roles.dmd && dmdKindOf(cabinet) && { fullDmd: dmdKindOf(cabinet) === 'fulldmd' }),
    backglassRatio: ratio('backglass'),
    aspects,
  };
}

/** "topper · DMD séparé · 16:9" (topper · separate DMD · 16:9): what a PuP-Pack option targets. */
export function variantTraitsLabel(v: PupVariant): string {
  const traits = v.traits;
  const parts: string[] = [];
  if (traits.desktop) parts.push(t('bureau, un seul écran'));
  if (traits.unsupported) parts.push(t('non géré par le plugin PUP'));
  if (traits.topper !== undefined) parts.push(traits.topper ? 'topper' : t('sans topper'));
  if (traits.dmd) parts.push({ separate: t('DMD sur son écran'), backglass: t('DMD dans le backglass'), none: t('sans DMD') }[traits.dmd]);
  if (traits.fullDmd !== undefined) parts.push(traits.fullDmd ? 'FullDMD' : t('DMD réel'));
  if (traits.windows && !traits.windows.backglass) parts.push(t('fronton laissé au .directb2s'));
  const ratios: Record<string, string> = { '1.78': '16:9', '2.33': '21:9', '1.33': '4:3', '1.25': '5:4', '1.00': '1:1' };
  if (traits.ratios.length) parts.push(formatList(traits.ratios.map((r) => ratios[r.toFixed(2)] ?? r.toFixed(2)), 'or'));
  return parts.join(' · ') || t('disposition non décrite');
}

/** Short description of the cabinet, to say why an option is chosen. */
export function describePupCabinet(c: PupCabinet): string {
  const parts = [c.backglass ? 'backglass' : t('sans backglass')];
  if (c.dmd) parts.push(cabinetFullDmd(c) === false ? 'DMD 4:1' : 'FullDMD');
  else parts.push(t('sans DMD'));
  parts.push(c.topper ? 'topper' : t('sans topper'));
  if (c.backglass && c.tableBackglass === false) parts.push(t('table sans .directb2s'));
  return parts.join(', ');
}

/** FullDMD or DMD alone: the type of the screen, otherwise the proportions of the DMD window. */
export function cabinetFullDmd(c: PupCabinet): boolean | undefined {
  if (!c.dmd) return undefined;
  if (c.fullDmd !== undefined) return c.fullDmd;
  return c.dmdRatio ? dmdKindForRatio(c.dmdRatio) === 'fulldmd' : undefined;
}

export function scoreVariant(t: VariantTraits, c: PupCabinet): number {
  let s = 0;
  if (t.unsupported) s -= 40;
  if (t.desktop) s += c.backglass ? -60 : 20;
  if (t.topper === true) s += c.topper ? 6 : -12;
  else if (t.topper === false && c.topper) s -= 3;
  if (t.dmd === 'separate') s += c.dmd ? 10 : -25;
  else if (t.dmd === 'backglass') s += c.dmd ? -8 : 10;
  else if (t.dmd === 'none') s += c.dmd ? -10 : 4;
  const full = cabinetFullDmd(c);
  if (t.fullDmd !== undefined && c.dmd && full !== undefined) s += t.fullDmd === full ? 4 : -6;
  if (t.ratios.length && c.backglassRatio) s += t.ratios.some((r) => Math.abs(r - c.backglassRatio!) / r < 0.08) ? 5 : -5;
  // Backglass left empty by the pack: the table's .directb2s must be there, otherwise
  // the screen stays on a still image (2001 - A Space Odyssey, October 2026).
  if (c.backglass && t.windows && !t.windows.backglass) s += c.tableBackglass === false ? -30 : c.tableBackglass ? -2 : -6;
  return s;
}

export interface VariantChoice {
  chosen?: PupVariant;
  /** Obvious choice: chosen without asking. */
  confident: boolean;
  /** Choice from the cabinet not clear-cut: the option close behind the chosen one. */
  runnerUp?: PupVariant;
  /** remembered: option of the previous installation; cabinet: from the cabinet. */
  reason: 'remembered' | 'only' | 'cabinet' | 'default' | 'none';
}

/** Option chosen automatically: the one of the previous installation, otherwise the closest to the cabinet. */
export function chooseVariant(variants: PupVariant[], cabinet: PupCabinet | undefined, remembered?: string): VariantChoice {
  if (!variants.length) return { confident: true, reason: 'none' };
  const previous = remembered ? variants.find((v) => v.label.toLowerCase() === remembered.toLowerCase()) : undefined;
  if (previous) return { chosen: previous, confident: true, reason: 'remembered' };
  if (variants.length === 1) return { chosen: variants[0], confident: true, reason: 'only' };
  if (!cabinet) {
    const usable = variants.find((v) => !v.traits.desktop && !v.traits.unsupported) ?? variants[0];
    return { chosen: usable, confident: false, reason: 'default' };
  }
  const ranked = variants.map((v) => ({ v, score: scoreVariant(v.traits, cabinet) })).sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  const confident = !second || best!.score - second.score >= 4;
  return { chosen: best!.v, confident, reason: 'cabinet', ...(!confident && { runnerUp: second!.v }) };
}

/** Option in place at the pack's root, as appliedOption recognises it. */
export interface AppliedOption {
  variant: PupVariant;
  /** Everything the option copies and deletes is in place; otherwise, only its .pup files are. */
  complete: boolean;
  /** What an incomplete option lacks (differences). */
  differences: string[];
  /** Other options that the files in place do not distinguish from this one. */
  twins: PupVariant[];
}

/**
 * Option whose files are at the root. The whole option counts, not only its .pup files:
 * GOTG (gotg_2020) has the same screens.pup, playlists.pup and triggers.pup in option 0
 * (desktop, PuPDesktopPunch.exe copied) and option 2 (FullDMD, PuPDesktopPunch.exe
 * deleted, "Option Selected.txt" at 2); the first one that looked alike won, and
 * option 2 once applied was always shown as "Option 0" (26 October 2026). A complete option
 * wins over an option of which only the .pup files are there; between twins, the one
 * remembered in the .info (remembered), then the one that copies the most files.
 */
export function appliedOption(info: PupPackInfo, remembered?: string): AppliedOption | undefined {
  const withPups = info.variants.filter((v) => v.copies.some((c) => c.to.toLowerCase().endsWith('.pup')));
  const diffs = new Map(withPups.map((v) => [v, variantDifferences(info.root, v)]));
  const complete = withPups.filter((v) => !diffs.get(v)!.length);
  const pupsOnly = withPups.filter((v) => !diffs.get(v)!.some((d) => d.pup));
  const pool = complete.length ? complete : pupsOnly;
  if (!pool.length) return undefined;
  const isRemembered = (v: PupVariant) => Boolean(remembered) && v.label.toLowerCase() === remembered!.toLowerCase();
  const variant = pool.find(isRemembered) ?? [...pool].sort((a, b) => b.copies.length - a.copies.length)[0]!;
  return { variant, complete: complete.length > 0, differences: diffs.get(variant)!.map((d) => d.text), twins: pool.filter((v) => v !== variant) };
}

/**
 * After "Appliquer" (Apply): the pack read again, is the option in place? Otherwise, why (what is
 * missing, or the option whose files are there). Success is never announced without this.
 */
export function checkAppliedOption(root: string, label: string): { ok: true } | { ok: false; reasons: string[] } {
  const info = analysePack(root);
  const now = appliedOption(info, label);
  if (now?.variant.label === label && now.complete) return { ok: true };
  const variant = info.variants.find((v) => v.label === label);
  const reasons = variant ? variantDifferences(root, variant).map((d) => d.text) : [t('l’option n’est plus dans le pack')];
  if (!reasons.length && now) reasons.push(t('les fichiers en place sont ceux de « {current} »', { current: now.variant.label }));
  return { ok: false, reasons };
}

/** Files of the option not found in the pack: applying it would stop halfway. */
export function missingSources(root: string, variant: Pick<PupVariant, 'copies'>): string[] {
  return variant.copies.filter((c) => !fs.existsSync(path.join(root, c.from))).map((c) => c.from);
}

/** Variant in place at the root (appliedOption), or undefined. */
export function appliedVariant(info: PupPackInfo, remembered?: string): PupVariant | undefined {
  return appliedOption(info, remembered)?.variant;
}

/** All the files of the option are in place, and those it deletes are absent. */
export function isApplied(root: string, variant: PupVariant): boolean {
  return variant.copies.some((c) => c.to.toLowerCase().endsWith('.pup')) && !variantDifferences(root, variant).length;
}

/** Preview image placed at the root ("Option 2.JPG"): PinUP Popper shows it, the PUP plugin ignores it. */
function isPreviewImage(rel: string): boolean {
  return !rel.includes(path.sep) && /\.(jpe?g|png|gif|bmp)$/i.test(rel);
}

/** Beyond this, two files of the same size are taken as identical (videos of an option). */
const COMPARE_LIMIT = 8 * 1024 * 1024;

/**
 * Differences between the root and an option: copied file absent or different, file
 * deleted by its .bat still there. The root's previews do not count. `pup`: the difference
 * concerns a .pup (the option is not in place at all).
 */
export function variantDifferences(root: string, variant: Pick<PupVariant, 'copies' | 'deletes'>, limit = 4): { text: string; pup: boolean }[] {
  const found: { text: string; pup: boolean }[] = [];
  const copies = [...variant.copies].sort((a, b) => Number(b.to.toLowerCase().endsWith('.pup')) - Number(a.to.toLowerCase().endsWith('.pup')));
  for (const c of copies) {
    if (isPreviewImage(c.to)) continue;
    const pup = c.to.toLowerCase().endsWith('.pup');
    const dest = resolveInside(root, c.to);
    const same = dest !== undefined && (sameFile(path.join(root, c.from), path.join(root, dest)) || sameScreensFile(path.join(root, dest), path.join(root, c.from)));
    if (!same) found.push({ text: dest === undefined ? t('{file} absent', { file: c.to }) : t('{file} différent de celui de l’option', { file: c.to }), pup });
    if (found.length >= limit) return found;
  }
  for (const d of variant.deletes) {
    if (isPreviewImage(d) || resolveInside(root, d) === undefined) continue;
    found.push({ text: t('{file} encore là (l’option le supprime)', { file: d }), pup: false });
    if (found.length >= limit) return found;
  }
  return found;
}

/** screens.pup in place identical to the option's one, except for the place of the PuP-DMD (sameScreensIgnoringBand). */
function sameScreensFile(actual: string, expected: string): boolean {
  if (path.basename(actual).toLowerCase() !== 'screens.pup') return false;
  try {
    return sameScreensIgnoringBand(fs.readFileSync(actual, 'latin1'), fs.readFileSync(expected, 'latin1'));
  } catch {
    return false;
  }
}

/** Up to this size, two files are compared in full (.pup, .txt, small images). */
const FULL_COMPARE = 256 * 1024;
/** Beyond it: three samples of this size, at the start, in the middle and at the end. */
const SAMPLE = 64 * 1024;

/**
 * Comparisons already made, by paths, sizes and dates: the table diagnosis, the game page and
 * "Appliquer" (Apply) compare the same options several times in a row. Cleared beyond COMPARISONS_KEPT.
 */
const comparisons = new Map<string, boolean>();
const COMPARISONS_KEPT = 20_000;

/**
 * Same content? Comparing each file of an option in full read the whole pack (hundreds
 * of videos of a few MB, on both sides) at each diagnosis (17/11/2026). The files of an
 * option are copies (copy, xcopy): same size and same samples are enough beyond
 * FULL_COMPARE; beyond COMPARE_LIMIT, the size alone.
 */
function sameFile(a: string, b: string): boolean {
  try {
    const statA = fs.statSync(a);
    const statB = fs.statSync(b);
    const size = statA.size;
    if (size !== statB.size) return false;
    if (size > COMPARE_LIMIT) return true;
    const key = `${a}\0${statA.mtimeMs}\0${b}\0${statB.mtimeMs}\0${size}`;
    const known = comparisons.get(key);
    if (known !== undefined) return known;
    // lecture entière : size checked on the same line (FULL_COMPARE)
    const same = size <= FULL_COMPARE ? fs.readFileSync(a).equals(fs.readFileSync(b)) : sameSamples(a, b, size);
    if (comparisons.size >= COMPARISONS_KEPT) comparisons.clear();
    comparisons.set(key, same);
    return same;
  } catch {
    return false;
  }
}

/** Same start, middle and end (files of the same size, larger than SAMPLE). */
function sameSamples(a: string, b: string, size: number): boolean {
  const fa = fs.openSync(a, 'r');
  try {
    const fb = fs.openSync(b, 'r');
    try {
      const bufA = Buffer.alloc(SAMPLE);
      const bufB = Buffer.alloc(SAMPLE);
      for (const at of [0, Math.floor((size - SAMPLE) / 2), size - SAMPLE]) {
        const readA = fs.readSync(fa, bufA, 0, SAMPLE, at);
        const readB = fs.readSync(fb, bufB, 0, SAMPLE, at);
        if (readA !== readB || !bufA.subarray(0, readA).equals(bufB.subarray(0, readB))) return false;
      }
      return true;
    } finally {
      fs.closeSync(fb);
    }
  } finally {
    fs.closeSync(fa);
  }
}

/** Forgets the kept comparisons (tests). */
export function forgetFileComparisons(): void {
  comparisons.clear();
}

// ---------- Utilities ----------

function listJunk(root: string): string[] {
  const junk: string[] = [];
  const walk = (rel: string) => {
    for (const d of readDirents(path.join(root, rel))) {
      const p = path.join(rel, d.name);
      if (isJunkName(d.name)) junk.push(p);
      else if (d.isDirectory()) walk(p);
      else if (d.name.toLowerCase().endsWith('.mp4') && sizeOf(path.join(root, p)) === 0) junk.push(p);
    }
  };
  walk('');
  return junk;
}

/** Files of a folder, relative to it, without the useless files. */
function listFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const d of readDirents(path.join(dir, rel))) {
      if (isJunkName(d.name)) continue;
      const p = path.join(rel, d.name);
      if (d.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk('');
  return files;
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'latin1');
  } catch {
    return '';
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sizeOf(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return -1;
  }
}
