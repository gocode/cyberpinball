// PuP-Packs en mode plugins de VPX 10.8.1 (docs/recherche/pup-packs.md, § 4) :
// nom de dossier attendu d'après le script, vraie racine d'un pack (imbrications),
// fichiers inutiles, options des .bat lues sans jamais être exécutées, et choix
// de l'option d'après le modèle de borne.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AncillaryRoleId, Cabinet, RoleId } from './model';
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
  return { packNames, playlistAdd: /\.playlistadd\b/i.test(code) };
}

/** Littéral, ou valeurs données à la variable (Const cPuPPack = "…", pGameName = "…"). */
function resolveValue(code: string, token: string): string[] {
  if (token.startsWith('"')) return [token.slice(1, -1).trim()];
  return [...code.matchAll(new RegExp(`\\b${token}\\s*=\\s*"([^"\\r\\n]*)"`, 'gi'))].map((v) => v[1]!.trim());
}

/** Noms de dossier possibles du pack, dans l'ordre où le plugin les essaie. */
export function expectedPackNames(facts: { usesPinmame: boolean; roms: string[]; pup?: PupScriptFacts } | undefined): string[] {
  if (!facts) return [];
  const names: string[] = [];
  for (const name of [...(facts.pup?.packNames ?? []), ...(facts.usesPinmame ? facts.roms : [])]) {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
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

/** Sous-dossiers d'options (« PuP-Pack_Options\Option 1 - … ») qui contiennent des .pup. */
function optionFolders(root: string): string[] {
  const found: string[] = [];
  for (const d of readDirents(root)) {
    if (!d.isDirectory() || !OPTIONS_DIR.test(d.name)) continue;
    for (const sub of readDirents(path.join(root, d.name))) {
      if (sub.isDirectory() && hasPupFile(path.join(root, d.name, sub.name))) found.push(path.join(d.name, sub.name));
    }
  }
  return found;
}

function hasPupFile(dir: string): boolean {
  return readDirents(dir).some((d) => d.isFile() && d.name.toLowerCase().endsWith('.pup'));
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
  // Variantes rangées dans un dossier d'options : celles qu'aucun .bat lisible ne couvre.
  for (const folder of optionFolders(root)) {
    if (variants.some((v) => v.folder && v.folder.toLowerCase() === folder.toLowerCase())) continue;
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
  const deletes: string[] = [];
  const fail = (reason: string) => ({ option, reason });
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^@/, '').trim();
    if (!line || line.startsWith('::') || /^rem(\s|$)/i.test(line)) continue;
    line = line.replace(/\s*\d?>\s*nul(\s+2>&1)?\s*$/i, '').trim();
    const command = line.split(/\s+/)[0]!.toLowerCase();
    if (IGNORED_COMMANDS.has(command) || /^echo[\s.]/i.test(line)) {
      if (command === 'echo' && /[>|]/.test(line)) return fail(`« ${line} » écrit dans un fichier`);
      continue;
    }
    if (/[|&<>]/.test(line.replace(/"[^"]*"/g, ''))) return fail(`« ${line} » enchaîne plusieurs commandes`);
    const args = tokenize(line).slice(1);
    if (['cd', 'chdir', 'pushd'].includes(command)) {
      const target = args.filter((a) => a.toLowerCase() !== '/d');
      if (target.length === 1 && relativeArg(target[0]!) === '') continue;
      return fail(`« ${line} » change de dossier`);
    }
    if (command === 'xcopy' || command === 'copy') {
      const flags = args.filter((a) => a.startsWith('/')).join('').toLowerCase();
      const paths = args.filter((a) => !a.startsWith('/'));
      if (paths.length < 1 || paths.length > 2 || paths.some((p) => p.includes('+'))) return fail(`« ${line} » n’est pas une copie simple`);
      const src = relativeArg(paths[0]!);
      const dest = paths[1] === undefined ? '' : relativeArg(paths[1]);
      if (src === undefined || dest === undefined) return fail(`« ${line} » sort du dossier du pack`);
      const recursive = command === 'xcopy' && /\/[se]/.test(flags);
      const found = expandSource(root, src, recursive);
      if (!found) return fail(`« ${paths[0]} » ne correspond à aucun fichier du pack`);
      const destDir = resolveInside(root, dest) ?? dest;
      for (const rel of found.files) copies.push({ from: path.join(found.dir, rel), to: path.join(destDir, rel) });
      continue;
    }
    if (command === 'del' || command === 'erase') {
      const targets = args.filter((a) => !a.startsWith('/'));
      for (const t of targets) {
        const rel = relativeArg(t);
        if (rel === undefined || rel.includes(path.sep)) return fail(`« ${line} » supprime hors de la racine du pack`);
        deletes.push(...matchNames(readDirents(root).filter((d) => d.isFile()).map((d) => d.name), rel));
      }
      continue;
    }
    return fail(`commande « ${command} » non reconnue`);
  }
  if (!copies.length) return { option: looksLikeOption, reason: option ? 'aucune copie de fichiers trouvée' : undefined };
  // Le dossier commun des fichiers copiés : celui de la variante.
  const dirs = [...new Set(copies.map((c) => c.from.split(path.sep)[0]!))];
  const folder = dirs.length === 1 ? commonDir(copies.map((c) => path.dirname(c.from))) : undefined;
  return { option: true, variant: { label, bat, folder: folder || undefined, copies, deletes } };
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
  if (/(no|without|sans) (real |full ?)?dmd/.test(name)) traits.dmd = 'none';
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
      traits.dmd = !dmd ? 'none' : dmd.parent !== undefined && dmd.parent !== dmd.num && screenRole(dmd.parent) === 'backglass' ? 'backglass' : 'separate';
    }
    if (!traits.desktop && shown(3) && !shown(2) && !shown(6)) traits.desktop = true;
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
    backglassRatio: ratio('backglass'),
    aspects,
  };
}

/** Description courte de la borne, pour dire pourquoi une option est retenue. */
export function describePupCabinet(c: PupCabinet): string {
  const parts = [c.backglass ? 'backglass' : 'sans backglass'];
  if (c.dmd) parts.push(c.dmdRatio && c.dmdRatio >= 3 ? 'DMD 4:1' : 'FullDMD');
  else parts.push('sans DMD');
  parts.push(c.topper ? 'topper' : 'sans topper');
  return parts.join(', ');
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
  if (t.fullDmd !== undefined && c.dmd && c.dmdRatio) s += t.fullDmd === c.dmdRatio < 3 ? 4 : -6;
  if (t.ratios.length && c.backglassRatio) s += t.ratios.some((r) => Math.abs(r - c.backglassRatio!) / r < 0.08) ? 5 : -5;
  return s;
}

export interface VariantChoice {
  chosen?: PupVariant;
  /** Choix évident : retenu sans demander. */
  confident: boolean;
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
  return { chosen: best!.v, confident: !second || best!.score - second.score >= 4, reason: 'cabinet' };
}

/** Variante dont les .pup sont ceux de la racine, ou undefined. */
export function appliedVariant(info: PupPackInfo): PupVariant | undefined {
  return info.variants.find((v) => isApplied(info.root, v));
}

export function isApplied(root: string, variant: PupVariant): boolean {
  const pups = variant.copies.filter((c) => c.to.toLowerCase().endsWith('.pup'));
  if (!pups.length) return false;
  return pups.every((c) => {
    const dest = resolveInside(root, c.to);
    if (dest === undefined) return false;
    try {
      return fs.readFileSync(path.join(root, c.from)).equals(fs.readFileSync(path.join(root, dest)));
    } catch {
      return false;
    }
  });
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
