// PuP-Packs en mode plugins de VPX 10.8.1 (docs/recherche/pup-packs.md, § 4) :
// nom de dossier attendu d'après le script, vraie racine d'un pack (imbrications),
// fichiers inutiles, options des .bat lues sans jamais être exécutées, et choix
// de l'option d'après le modèle de borne.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AncillaryRoleId, Cabinet, RoleId } from './model';
import { formatList, t } from './i18n';
import { commentStart, statements } from './vbscript';
import { dmdKindForRatio, dmdKindOf } from './dmdscreen';
import { roleZone, zoneRatio } from './zones';

export const PUP_FILES = ['screens.pup', 'playlists.pup', 'triggers.pup'] as const;

/** Ce que le script d'une table dit de son PuP-Pack. */
export interface PupScriptFacts {
  /**
   * Noms passés à B2SInit (chargement explicite du pack), puis à Init. Avec
   * B2SInit, le nom du script l'emporte sur la ROM (PUPPlugin.cpp l. 211-241 :
   * le chargement automatique par la ROM est sauté si le script a déjà lancé PuP).
   */
  packNames: string[];
  /** Le script déclare lui-même ses playlists (packs anciens, sans .pup). */
  playlistAdd: boolean;
  /**
   * Le script écrit lui-même le score sur un écran du pack (PuP-DMD : LabelNew, LabelInit) :
   * le pack dessine alors le DMD de la table, il peut occuper la fenêtre du DMD.
   */
  labels?: boolean;
  /**
   * Le script ne lance jamais le pack : son lancement dépend d'une variable que le
   * script règle autrement au départ (« usePUP = False »). Absent si rien ne l'en empêche.
   */
  disabledBy?: PupSwitch;
  /**
   * La PuP-DMD (le score que le script écrit sur l'écran DMD du pack, LabelInit) dépend d'une
   * autre variable éteinte au départ (« enablePupDMD = False ») : un pack dont l'option occupe
   * la fenêtre du DMD n'y montrerait que son cadre vide, par-dessus le DMD de la table.
   */
  dmdDisabledBy?: PupSwitch;
  /**
   * Le script envoie lui-même des déclencheurs « D » au pack (PuPlayer.B2SData "D…") : ceux que
   * le pack attend d'une image du DMD (PuPCapture) peuvent venir de là.
   */
  dmdTriggers?: boolean;
}

/** Interrupteur du script qui décide si le PuP-Pack est lancé. */
export interface PupSwitch {
  /** Variable (« usePUP »). */
  variable: string;
  /** Valeur que le script lui donne, telle qu'écrite (« False »). */
  value: string;
  /** Valeur qui lance le pack (« True ») ; absente si on ne sait pas la déduire. */
  enable?: string;
  /** Ligne de l'affectation dans le script (à partir de 0). */
  line: number;
  /** Ce qu'il allume : le pack (absent), ou la PuP-DMD. */
  kind?: 'dmd';
}

/**
 * Appels PuP d'un script dont les commentaires sont déjà retirés ; undefined si
 * la table n'utilise pas PuP.
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
 * Interrupteurs à allumer pour que le pack se voie : celui de son lancement, et celui de la
 * PuP-DMD quand l'option en place dessine dans la fenêtre du DMD (`packDrawsDmd`, pupWindows) :
 * sans elle, le pack y pose son cadre vide (« PuPFrames\default.png ») par-dessus le DMD de la
 * table. The Goonies (VPW 2021) livre les deux éteints (octobre 2026). `code` : scriptCode.
 */
export function pupSwitchesToEnable(code: string, packDrawsDmd: boolean): PupSwitch[] {
  const found: PupSwitch[] = [];
  const main = pupScriptSwitch(code);
  if (main) found.push(main);
  const dmd = packDrawsDmd ? pupDmdSwitch(code) : undefined;
  if (dmd && dmd.enable !== undefined) found.push(dmd);
  return found;
}

/** Les interrupteurs d'une liste, pour un message : « enablePupPack = True, enablePupDMD = True ». */
export function describeSwitches(switches: PupSwitch[], state: 'value' | 'enable'): string {
  return switches.map((s) => `${s.variable} = ${state === 'value' ? s.value : (s.enable ?? '?')}`).join(', ');
}

// ---------- Interrupteur du script ----------

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

/** Valeur numérique de VBScript (True vaut -1), ou la chaîne. */
const numeric = (v: Value) => (v === true ? -1 : v === false ? 0 : v);

interface Assignment {
  /** Nom de la variable tel qu'écrit. */
  name: string;
  value: string;
  line: number;
  /** Dans une Sub ou une Function (exécutée plus tard, ou jamais). */
  inRoutine: boolean;
  /** Valeur littérale (sinon calculée : option de la table, fichier, autre variable). */
  literal: boolean;
}

/**
 * Le lancement du pack (CreateObject("PinUpPlayer.PinDisplay"), puis B2SInit ou
 * Init) n'est atteint que si une variable a une certaine valeur, et le script lui en
 * donne une autre au départ : 2001 : A Space Odyssey (Original 2025) livre
 * « usePUP = False », et le plugin PUP ne charge jamais son pack, même bien rangé.
 * Les conditions qui entourent la ligne sont suivies dans sa Sub, puis là où cette
 * Sub est appelée (trois niveaux). Une variable qui ne fait que recopier une autre
 * (« HasPup = enablePupPack », The Goonies) renvoie à celle-ci : c'est elle qu'il faut
 * allumer. undefined si rien ne l'empêche, ou si on ne peut pas le dire : valeur calculée
 * (option de la table, fichier lu), changée dans une Sub, Else, Select Case.
 * `code` : le script sans commentaires, une ligne pour une ligne (scriptCode).
 */
export function pupScriptSwitch(code: string): PupSwitch | undefined {
  return switchFinder(code)(PUP_CREATE);
}

const PUP_CREATE = /CreateObject\s*\(\s*"PinUpPlayer\.PinDisplay"\s*\)/i;

/**
 * Interrupteur de la PuP-DMD : la variable qui empêche d'atteindre LabelInit (mise en place
 * des textes de la PuP-DMD), si ce n'est pas déjà celle qui coupe le pack. The Goonies :
 * « Const enablePupDMD = False », et PuPInit fait alors cacher l'écran DMD du pack par
 * PinUP Player (SendMSG FN 12), que le plugin PUP ne gère pas.
 */
export function pupDmdSwitch(code: string): PupSwitch | undefined {
  const find = switchFinder(code);
  const dmd = find(/\.LabelInit\b/i);
  if (!dmd) return undefined;
  const main = find(PUP_CREATE);
  if (main && main.variable.toLowerCase() === dmd.variable.toLowerCase()) return undefined;
  return { ...dmd, kind: 'dmd' };
}

/** Pour une ligne du script (needle), la variable éteinte au départ qui l'empêche d'être atteinte. */
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
      // « If x Then usePUP = True » : une affectation qui peut avoir lieu, comme dans une Sub.
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
   * Valeur de départ d'une variable, si elle est sûre : littérale hors de toute Sub, jamais
   * rallumée ailleurs. Recopiée d'une autre variable (« HasPup = enablePupPack »), et jamais
   * changée dans une Sub : la valeur de départ de cette autre variable, deux relais au plus.
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
    // Une Sub qui la rallume (option de la table, réglage lu) : on ne peut rien dire.
    if (list.some((a) => a.inRoutine && (!a.literal || !off(literalValue(a.value))))) return undefined;
    return last;
  };

  /** Condition d'un If : fausse au départ ? Alors la variable et la valeur qui la rendrait vraie. */
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

  /** Conditions des If qui entourent la ligne `i`, jusqu'au début de sa Sub ; null : branche Else, on ne sait pas. */
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

  /** La ligne est-elle bloquée ? Le blocage, null si elle est atteinte (ou si on ne sait pas). */
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
    // Sub jamais appelée par le script : un événement de VPX (Table1_Init…), atteinte.
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
 * Le script avec l'interrupteur allumé : seule la valeur de l'affectation change, sur
 * sa ligne ; le reste (fins de ligne, commentaires, accents) est rendu tel quel.
 * undefined si la ligne n'est plus celle qu'on attend.
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

/** Littéral, ou valeurs données à la variable (Const cPuPPack = "…", pGameName = "…"). */
function resolveValue(code: string, token: string): string[] {
  if (token.startsWith('"')) return [token.slice(1, -1).trim()];
  return [...code.matchAll(new RegExp(`\\b${token}\\s*=\\s*"([^"\\r\\n]*)"`, 'gi'))].map((v) => v[1]!.trim());
}

/** Le script pilote un jeu par PinMAME (`code` : scriptCode). */
export function usesPinmameCode(code: string): boolean {
  return /\bLoadVPM\b|VPinMAME\.Controller/i.test(code);
}

/** Ce qu'il faut savoir du script pour dire comment le plugin trouve le pack. */
export interface PupLoadFacts {
  usesPinmame: boolean;
  roms: string[];
  pup?: PupScriptFacts;
  /** Nom du jeu donné à B2S Server (cGameName), pour une table sans ROM. */
  b2sName?: string;
}

/**
 * Personne ne chargera le pack : le script ne lance jamais PuP, et la table ne joue pas de ROM.
 * Le plugin PUP de VPX 10.8.1 ne charge un pack de lui-même que pour un jeu PinMAME
 * (PUPPlugin.cpp, OnControllersChanged, au commit af26b2d93 : un jeu publié par B2S, « b2s::… »,
 * est ignoré). Ces packs sont faits pour PinUP Player branché sur B2S Server, qui les cherchait
 * sous le nom du jeu donné à B2S. *Game of Thrones LE (VPW, Stern 2015)*, 28 octobre 2026 :
 * script en FlexDMD, « Dim PuPlayer ' Not currently used », pack de mikeleonheart à côté ;
 * vpinball.log disait « Plugin PUP loaded », jamais « PUP path ».
 */
export function pupLoaderNeeded(facts: PupLoadFacts): boolean {
  return !facts.usesPinmame && !facts.pup;
}

/** Noms de dossier possibles du pack, dans l'ordre où le plugin les essaie. */
export function expectedPackNames(facts: PupLoadFacts | undefined): string[] {
  if (!facts) return [];
  const names: string[] = [];
  // Sans chargement par le script ni par la ROM, le nom que lui donnait PinUP Player : celui du jeu pour B2S.
  const own = pupLoaderNeeded(facts) && facts.b2sName ? [facts.b2sName] : [];
  for (const name of [...(facts.pup?.packNames ?? []), ...(facts.usesPinmame ? facts.roms : []), ...own]) {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

// ---------- Lancement du pack par Cyber Pinball ----------

/** Lancement du pack ajouté au script par Cyber Pinball, quand le script ne le fait pas. */
export interface PupLoader {
  /** Dossier du pack dans pupvideos. */
  pack: string;
  /** Objet table (« Table1 ») : le pack est lancé au début de sa Sub <table>_Init ; absent, à la fin du script. */
  table?: string;
}

const LOADER_SUB = 'CyberPinball_PuPStart';

/**
 * Le script qui lance le pack comme le ferait la table : un objet PinUpPlayer.PinDisplay, puis
 * B2SInit avec le nom du dossier (PUPPinDisplay::B2SInit charge le pack et démarre ses écrans).
 * Le plugin demande de le faire pendant l'initialisation de la table : l'appel est ajouté au
 * début de <table>_Init, sur la ligne de la Sub (« Sub Table1_Init : CyberPinball_PuPStart ») ;
 * la Sub elle-même, après la dernière ligne. Les numéros de ligne du script ne bougent pas.
 * Sans plugin PUP, l'erreur est ignorée (On Error Resume Next, dans la Sub seulement) puis
 * effacée : un « If Err Then MsgBox » plus loin dans <table>_Init ne la verrait pas.
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

// ---------- Déclencheurs par images du DMD ----------

/**
 * Déclencheurs actifs du pack (triggers.pup à sa racine) : ceux qui attendent une image du DMD
 * (« D<n> » avec PupCapture\<n>.bmp), et tous.
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

/** Ligne CSV telle que la lit le plugin (guillemets, "" pour un guillemet). */
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
  /** Écran parent d'un CustomPos (« 2,0,0,100,100 ») : l'écran s'affiche dedans. */
  parent?: number;
  /** Image ou vidéo montrée par défaut sur cet écran : dossier (playlist) et fichier, s'ils sont donnés. */
  playlist?: string;
  playFile?: string;
}

/** Écrans de screens.pup : la première ligne est sautée, une ligne valide a 8 colonnes (PUPScreen.cpp l. 65-105). */
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
    screens.push({
      num,
      description: parts[1]!,
      mode: parts[5]!,
      parent: Number.isFinite(parent) ? parent : undefined,
      playlist: parts[2] || undefined,
      playFile: parts[3] || undefined,
    });
  }
  return screens;
}

/** L'écran montre des images (Off et MusicOnly n'affichent rien). */
export function isVisible(screen: PupScreen): boolean {
  return !/^(off|musiconly)$/i.test(screen.mode);
}

/** Fenêtres de VPX où le plugin PUP dessine quelque chose avec ce screens.pup. */
export interface PupWindows {
  topper: boolean;
  backglass: boolean;
  dmd: boolean;
}

/**
 * Ce que le plugin PUP dessine dans chaque fenêtre, comme PUPManager::Render (commit
 * af26b2d93) : une fenêtre a une racine (Topper : écran 0 ; Backglass : 2, sinon 6 ;
 * ScoreView : 5, sinon 1), utilisable si elle n'est pas un écran posé dans un autre sans
 * enfant, et si un écran visible descend d'elle. Les écrans s'ajoutent dans l'ordre du
 * fichier ; un parent de CustomPos absent est créé d'office (ForceBack), un écran repris
 * plus bas remplace le premier et garde ses enfants (PUPManager::AddScreen).
 * Exemple : 2001 - A Space Odyssey, option « B2S Users … Pup on Fulldmd » : l'écran 2 est
 * posé dans le 5 (« 5,12.7,13.5,74.8,74.6 ») : rien sur le fronton, tout sur le FullDMD.
 */
export function pupWindows(screens: PupScreen[]): PupWindows {
  const usable = pupRoots(screens);
  return { topper: usable(0), backglass: usable(2) || usable(6), dmd: usable(5) || usable(1) };
}

/**
 * Écran PuP que le plugin prend comme racine de la fenêtre du DMD : 5 (FullDMD, 16:9) ou, à
 * défaut, 1 (DMD) ; undefined quand le pack n'y dessine rien (PUPManager::Render).
 */
export function pupDmdRoot(screens: PupScreen[]): 1 | 5 | undefined {
  const usable = pupRoots(screens);
  return usable(5) ? 5 : usable(1) ? 1 : undefined;
}

/** Racines utilisables d'après screens.pup, comme PUPManager::Render (voir pupWindows). */
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

/** Le pack rangé dans `dir` (racine retrouvée sous les imbrications) occupe la fenêtre du DMD avec l'option en place. */
export function packDrawsDmd(dir: string): boolean {
  const screens = analysePack(findPackRoot(dir) ?? dir).screens;
  return screens.length > 0 && pupWindows(screens).dmd;
}

/** Rôle de la borne où le plugin dessine un écran PuP ; null : jamais affiché (Playfield). */
export function screenRole(num: number): RoleId | null | undefined {
  if (num === 0) return 'topper';
  if (num === 2 || num === 6) return 'backglass';
  if (num === 1 || num === 5) return 'dmd';
  if (num === 3) return null;
  return undefined;
}

// ---------- Racine d'un pack ----------

/** Fichiers sans valeur laissés par macOS, et vidéos vides. */
export function isJunkName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('._') || lower === '.ds_store' || lower === '__macosx';
}

const OPTIONS_DIR = /option/i;

/** Dossier qui contient screens.pup, playlists.pup ou triggers.pup, ou des options qui en contiennent. */
export function isPackRoot(dir: string): boolean {
  const entries = readDirents(dir);
  if (entries.some((d) => d.isFile() && (PUP_FILES as readonly string[]).includes(d.name.toLowerCase()))) return true;
  return optionFolders(dir).length > 0;
}

/**
 * Vraie racine du pack sous `dir` : `dir` lui-même, ou en descendant les
 * imbrications (« rom\rom », dossier d'archive en trop qui ne contient que le pack).
 */
export function findPackRoot(dir: string, depth = 3): string | undefined {
  if (isPackRoot(dir)) return dir;
  if (depth === 0) return undefined;
  const entries = readDirents(dir).filter((d) => !isJunkName(d.name));
  const dirs = entries.filter((d) => d.isDirectory());
  // Un lisez-moi ou une image à côté du dossier du pack n'empêchent pas de descendre.
  const files = entries.filter((d) => d.isFile() && !/\.(txt|pdf|md|rtf|url|html?|jpe?g|png|gif)$/i.test(d.name));
  const same = dirs.find((d) => d.name.toLowerCase() === path.basename(dir).toLowerCase());
  const next = same ?? (dirs.length === 1 && files.length === 0 ? dirs[0] : undefined);
  return next ? findPackRoot(path.join(dir, next.name), depth - 1) : undefined;
}

/**
 * Copie de sauvegarde d'un dossier (« PuP-Pack_Options - Copy », « _backup », « Topper.orig ») :
 * ni une option, ni l'état en place. Gardians of the Galaxy (gotg_2020) livre un
 * « PuP-Pack_Options - Copy » à côté du vrai dossier d'options.
 */
export function isBackupName(name: string): boolean {
  return /(^|[^a-z])(copy|copie|backup|sauvegarde|old)([^a-z]|$)|\.(orig|bak|old)$/i.test(name);
}

/** Sous-dossiers d'options (« PuP-Pack_Options\Option 1 - … ») qui contiennent des .pup. */
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

// ---------- Ordre des playlists ----------

/** Fichier d'une playlist à renommer, chemins relatifs à la racine du pack. */
export interface PlaylistRename {
  playlist: string;
  /** Premier fichier pour le plugin PUP, aujourd'hui. */
  wrong: string;
  from: string;
  to: string;
}

/** Ordre de Windows et de PinUP Player : sans tenir compte de la casse (noms en majuscules, comme NTFS). */
function folderOrder(a: string, b: string): number {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Ordre du plugin PUP : std::ranges::sort sur les chemins, caractère par caractère, casse comprise. */
function pluginOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fichiers à renommer pour que le plugin PUP commence chaque playlist par le même fichier
 * que PinUP Player. Le plugin trie les fichiers d'une playlist en tenant compte de la casse
 * (PUPPlaylist.cpp, commit af26b2d93), PinUP Player non ; un écran dont screens.pup donne
 * la playlist sans fichier joue le premier. *2001 - A Space Odyssey* : l'écran 14
 * « Callouts » joue PupAlphas, dont l'auteur a nommé « aaclear.png » (transparent) pour
 * qu'il passe devant les cadres « Overlay1… » ; le plugin prenait « Overlay1 by Dr Nobody
 * TY.png », un cadre entier écrasé au milieu du fronton (26 octobre 2026). Le fichier voulu
 * prend son nom en majuscules (extension gardée) : il passe alors premier dans les deux
 * ordres. Le plugin retrouve un fichier nommé par un déclencheur sans tenir compte de la
 * casse : rien d'autre ne change.
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
  /** Variante pour un seul écran (bureau). */
  desktop: boolean;
  /** Variante que le plugin ne sait pas rendre (borne tout-en-un, PuP Stream). */
  unsupported: boolean;
  topper?: boolean;
  /** Où va le DMD : sur son propre écran, dans le backglass, nulle part. */
  dmd?: 'separate' | 'backglass' | 'none';
  /** FullDMD (écran 16:9) plutôt que DMD réel (4:1). */
  fullDmd?: boolean;
  /** Proportions du backglass visées (16/9, 4/3…). */
  ratios: number[];
  /** Fenêtres que le plugin PUP remplit avec le screens.pup de la variante (pupWindows). */
  windows?: PupWindows;
}

export interface PupVariant {
  /** Nom montré : le .bat sans extension, ou le dossier de la variante. */
  label: string;
  /** .bat d'où vient la variante. */
  bat?: string;
  /** Dossier d'où viennent les fichiers, relatif à la racine du pack. */
  folder?: string;
  /** Fichiers à recopier, relatifs à la racine du pack. */
  copies: { from: string; to: string }[];
  /** Fichiers que le .bat supprime (outils du mode classique), relatifs à la racine. */
  deletes: string[];
  traits: VariantTraits;
}

export interface BatReport {
  bat: string;
  ok: boolean;
  /** Ce qui empêche de lire le .bat sans l'exécuter. */
  reason?: string;
}

export interface PupPackInfo {
  root: string;
  /** .pup présents à la racine (noms réels). */
  pupFiles: string[];
  variants: PupVariant[];
  /** .bat d'options analysés, réussis ou non. */
  bats: BatReport[];
  /** Fichiers inutiles (._*, .DS_Store, MP4 vides), relatifs à la racine. */
  junk: string[];
  hasPupCapture: boolean;
  /** Écrans de la racine (screens.pup appliqué). */
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
  // Variantes rangées dans un dossier d'options : celles qu'aucun .bat lisible ne couvre (un
  // .bat qui en recopie un fichier le couvre), jamais deux fois le même nom. GOTG (gotg_2020) :
  // chaque option apparaissait deux fois, par son .bat et par son dossier, et l'égalité de
  // score entre les deux jumelles cachait la recommandation (« pas de choix net »).
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
 * Lit un .bat d'option sans l'exécuter. Reconnu : copy et xcopy d'un dossier
 * du pack vers la racine (ou un de ses dossiers), del de fichiers du pack, et
 * les commandes sans effet (echo, rem, pause, cd vers le dossier du .bat…).
 * Tout le reste (chemins absolus, variables, start, move, if…) fait échouer
 * l'analyse : on ne devine jamais ce que ferait un .bat.
 */
export function parseOptionBat(root: string, bat: string): { option: boolean; variant?: Omit<PupVariant, 'traits'>; reason?: string } {
  const text = readText(path.join(root, bat));
  const label = bat.replace(/\.bat$/i, '');
  const looksLikeOption = /option|^\s*\d+\s*[-_.)]/i.test(label);
  const mentionsCopy = /^\s*@?\s*(x?copy)\b/im.test(text);
  const option = looksLikeOption || mentionsCopy;
  const copies: { from: string; to: string }[] = [];
  // Chaque del avec le nombre de copies faites avant lui : un fichier supprimé puis recopié
  // (« del Option*.jpg », puis « xcopy Option 2.JPG ») reste en place.
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
  // Dossier de la variante : celui d'où viennent ses .pup (l'aperçu « Option 2.JPG » est
  // souvent pris un cran plus haut), sinon le dossier commun des fichiers copiés.
  const pups = copies.filter((c) => c.from.toLowerCase().endsWith('.pup'));
  const sources = (pups.length ? pups : copies).map((c) => path.dirname(c.from));
  const dirs = [...new Set(sources.map((d) => d.split(path.sep)[0]!))];
  const folder = dirs.length === 1 ? commonDir(sources) : undefined;
  return { option: true, variant: { label, bat, folder: folder && folder !== '.' ? folder : undefined, copies, deletes } };
}

/** Découpe une ligne de commande en arguments, guillemets compris. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  for (const m of line.matchAll(/"([^"]*)"|(\S+)/g)) {
    const token = m[1] ?? m[2]!;
    // « /y/s » : plusieurs options collées.
    if (m[2] && token.startsWith('/')) tokens.push(...token.split(/(?=\/)/));
    else tokens.push(token);
  }
  return tokens;
}

/** Chemin relatif au dossier du .bat, ou undefined s'il en sort (absolu, variable, ..). */
function relativeArg(arg: string): string | undefined {
  let p = arg.replace(/^%~dp0\\?/i, '').replace(/^%cd%\\?/i, '').replace(/\//g, '\\');
  if (/%|^[a-z]:|^\\/i.test(p)) return undefined;
  p = p.replace(/^(\.\\)+/, '').replace(/\\+$/, '');
  if (p === '.') p = '';
  const parts = p.split('\\').filter(Boolean);
  if (parts.includes('..')) return undefined;
  return parts.join(path.sep);
}

/** Fichiers désignés par la source d'une copie : un dossier, un motif (« dossier\*.pup ») ou un fichier. */
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

/** Chemin relatif réel (casse du disque), ou undefined s'il n'existe pas. */
function resolveInside(root: string, rel: string): string | undefined {
  let current = '';
  for (const part of rel.split(path.sep).filter(Boolean)) {
    const found = readDirents(path.join(root, current)).find((d) => d.name.toLowerCase() === part.toLowerCase());
    if (!found) return undefined;
    current = path.join(current, found.name);
  }
  return current;
}

/** Noms qui correspondent à un motif de cmd.exe (* et ?), sans tenir compte de la casse. */
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

/** Ce que vise une variante, d'après son nom puis son screens.pup. */
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
  // Le screens.pup de la variante complète ce que le nom ne dit pas.
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
        // Pas d'écran DMD (1) ni FullDMD (5) : le pack n'occupe pas la fenêtre du DMD, ce
        // qui ne dit pas que la borne n'en a pas. Un écran « DMD » posé sur le backglass dit
        // où va le DMD : allumé, le pack y met ses propres animations (le vrai DMD reste sur
        // son écran) ; éteint, le cadre reste vide pour y poser le DMD. Sinon, rien à en
        // déduire (Star Trek LE, octobre 2026 : l'option faite pour une borne à DMD notée
        // « sans DMD », derrière celle qui laisse le cadre vide).
        const frame = screens.find((s) => s.parent !== undefined && s.parent !== s.num && screenRole(s.parent) === 'backglass' && /dmd/i.test(`${s.description} ${s.playlist ?? ''}`));
        if (frame) traits.dmd = isVisible(frame) ? 'separate' : 'backglass';
      }
    }
    if (!traits.desktop && shown(3) && !shown(2) && !shown(6)) traits.desktop = true;
    if (screens.length) {
      traits.windows = pupWindows(screens);
      // Sans indice dans le nom : l'écran que le plugin met dans la fenêtre du DMD, le 5 (FullDMD
      // 16:9) ou le 1 (DMD) ; un FullDMD dans une bande 4:1 y serait réduit.
      const root = pupDmdRoot(screens);
      if (traits.fullDmd === undefined && root) traits.fullDmd = root === 5;
      // La fenêtre du topper, remplie ou non, l'emporte sur le nom : « Default Locale Topper
      // Off » (2001) range le topper dans l'écran principal, la fenêtre du topper reste vide.
      if (screens.some((s) => s.num === 0 || s.parent === 0)) traits.topper = traits.windows.topper;
    }
  }
  return traits;
}

// ---------- Choix d'après la borne ----------

/** Ce que l'option d'un pack doit savoir de la borne. */
export interface PupCabinet {
  backglass: boolean;
  dmd: boolean;
  topper: boolean;
  /** Grand côté sur petit côté : 4 pour un DMD réel, 1,78 pour un écran 16:9. */
  dmdRatio?: number;
  /**
   * L'écran du DMD est un FullDMD (dmdKindOf : choix de l'utilisateur, sinon forme de sa zone).
   * Absent : d'après dmdRatio.
   */
  fullDmd?: boolean;
  /**
   * La table a son fronton (.directb2s) : une option qui laisse la fenêtre du backglass au
   * B2S (« B2S Users ») a alors quelque chose à y montrer. Absent : on ne sait pas.
   */
  tableBackglass?: boolean;
  backglassRatio?: number;
  /**
   * Largeur sur hauteur de chaque rôle, en pixels de Windows (zone comprise) : le
   * médecin y compare les proportions des médias. Le playfield occupe son écran entier.
   */
  aspects?: Partial<Record<RoleId, number>>;
}

export function pupCabinet(cabinet: Cabinet | undefined): PupCabinet | undefined {
  if (!cabinet) return undefined;
  // Proportions de la fenêtre que VPX ouvrira pour le rôle : sa zone, pas tout l'écran
  // (backglass et DMD partagent souvent le moniteur du fronton).
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

/** « topper · DMD séparé · 16:9 » : ce que vise une option de PuP-Pack. */
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

/** Description courte de la borne, pour dire pourquoi une option est retenue. */
export function describePupCabinet(c: PupCabinet): string {
  const parts = [c.backglass ? 'backglass' : t('sans backglass')];
  if (c.dmd) parts.push(cabinetFullDmd(c) === false ? 'DMD 4:1' : 'FullDMD');
  else parts.push(t('sans DMD'));
  parts.push(c.topper ? 'topper' : t('sans topper'));
  if (c.backglass && c.tableBackglass === false) parts.push(t('table sans .directb2s'));
  return parts.join(', ');
}

/** FullDMD ou DMD seul : le type de l'écran, sinon les proportions de la fenêtre du DMD. */
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
  // Fronton laissé vide par le pack : il faut que le .directb2s de la table y soit, sinon
  // l'écran reste sur une image fixe (2001 - A Space Odyssey, octobre 2026).
  if (c.backglass && t.windows && !t.windows.backglass) s += c.tableBackglass === false ? -30 : c.tableBackglass ? -2 : -6;
  return s;
}

export interface VariantChoice {
  chosen?: PupVariant;
  /** Choix évident : retenu sans demander. */
  confident: boolean;
  /** Choix d'après la borne pas net : l'option qui talonne la retenue. */
  runnerUp?: PupVariant;
  /** remembered : option de l'installation précédente ; cabinet : d'après la borne. */
  reason: 'remembered' | 'only' | 'cabinet' | 'default' | 'none';
}

/** Option retenue d'office : celle de l'installation précédente, sinon la plus proche de la borne. */
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

/** Option en place à la racine du pack, telle que appliedOption la reconnaît. */
export interface AppliedOption {
  variant: PupVariant;
  /** Tout ce que l'option recopie et supprime est en place ; sinon, seuls ses .pup le sont. */
  complete: boolean;
  /** Ce qui manque à une option incomplète (differences). */
  differences: string[];
  /** Autres options que les fichiers en place ne distinguent pas de celle-ci. */
  twins: PupVariant[];
}

/**
 * Option dont les fichiers sont à la racine. Toute l'option compte, pas ses seuls .pup :
 * GOTG (gotg_2020) a les mêmes screens.pup, playlists.pup et triggers.pup dans l'option 0
 * (bureau, PuPDesktopPunch.exe recopié) et l'option 2 (FullDMD, PuPDesktopPunch.exe
 * supprimé, « Option Selected.txt » à 2) ; la première qui ressemblait l'emportait, et
 * l'option 2 appliquée s'affichait toujours « Option 0 » (26 octobre 2026). Une option
 * complète l'emporte sur une option dont seuls les .pup sont là ; entre jumelles, celle
 * retenue dans le .info (remembered), puis celle qui recopie le plus de fichiers.
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
 * Après « Appliquer » : le pack relu, l'option est-elle en place ? Sinon, pourquoi (ce qui
 * manque, ou l'option dont les fichiers sont là). La réussite ne s'annonce jamais sans ça.
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

/** Fichiers de l'option introuvables dans le pack : l'appliquer s'arrêterait en chemin. */
export function missingSources(root: string, variant: Pick<PupVariant, 'copies'>): string[] {
  return variant.copies.filter((c) => !fs.existsSync(path.join(root, c.from))).map((c) => c.from);
}

/** Variante en place à la racine (appliedOption), ou undefined. */
export function appliedVariant(info: PupPackInfo, remembered?: string): PupVariant | undefined {
  return appliedOption(info, remembered)?.variant;
}

/** Tous les fichiers de l'option sont en place, et ceux qu'elle supprime absents. */
export function isApplied(root: string, variant: PupVariant): boolean {
  return variant.copies.some((c) => c.to.toLowerCase().endsWith('.pup')) && !variantDifferences(root, variant).length;
}

/** Image d'aperçu posée à la racine (« Option 2.JPG ») : PinUP Popper la montre, le plugin PUP l'ignore. */
function isPreviewImage(rel: string): boolean {
  return !rel.includes(path.sep) && /\.(jpe?g|png|gif|bmp)$/i.test(rel);
}

/** Au-delà, deux fichiers de même taille sont tenus pour identiques (vidéos d'une option). */
const COMPARE_LIMIT = 8 * 1024 * 1024;

/**
 * Écarts entre la racine et une option : fichier recopié absent ou différent, fichier
 * supprimé par son .bat encore là. Les aperçus de la racine ne comptent pas. `pup` : l'écart
 * porte sur un .pup (l'option n'est pas du tout en place).
 */
export function variantDifferences(root: string, variant: Pick<PupVariant, 'copies' | 'deletes'>, limit = 4): { text: string; pup: boolean }[] {
  const found: { text: string; pup: boolean }[] = [];
  const copies = [...variant.copies].sort((a, b) => Number(b.to.toLowerCase().endsWith('.pup')) - Number(a.to.toLowerCase().endsWith('.pup')));
  for (const c of copies) {
    if (isPreviewImage(c.to)) continue;
    const pup = c.to.toLowerCase().endsWith('.pup');
    const dest = resolveInside(root, c.to);
    const same = dest !== undefined && sameFile(path.join(root, c.from), path.join(root, dest));
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

function sameFile(a: string, b: string): boolean {
  try {
    const size = fs.statSync(a).size;
    if (size !== fs.statSync(b).size) return false;
    return size > COMPARE_LIMIT || fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

// ---------- Utilitaires ----------

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

/** Fichiers d'un dossier, relatifs à lui, sans les fichiers inutiles. */
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
