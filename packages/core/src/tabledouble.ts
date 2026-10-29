// Double d'une table pour une partie entre amis (décision du 29/10/2026 : « ne jamais effacer ni
// réinitialiser la ROM des joueurs, rien écraser »). VPX joue un double de la table, rangé dans un
// dossier propre à la partie, sur le même disque ; le dossier habituel de la table n'est jamais
// ouvert en écriture : sa mémoire de ROM (pinmame\nvram), ses records et réglages (user\VPReg.stg,
// .ini), rien n'y bouge.
//
// - Lié (lien physique : le même fichier sur le disque, sans place en plus) : seulement ce que rien
//   n'écrit pendant une partie, le .vpx, le fronton .directb2s, les ROM (.zip), les images, sons,
//   vidéos et polices (pupvideos, dossiers du DMD, colorisations).
// - Copié : tout le reste, ce que VPX, PinMAME, PuP ou B2S peuvent écrire (nvram, cfg, VPReg.stg,
//   .ini, .xml, .vbs, scripts de PuP). Dans le doute, copié.
// - Laissé : cache\ (VPX le refait) et medias\ (les médias du menu).
// - Une table sans son propre pinmame\roms joue sa ROM depuis le dossier PinMAME commun : le double
//   reçoit son propre pinmame\roms (liens vers la bibliothèque) et une copie de sa mémoire, sinon
//   PinMAME écrirait dans le dossier commun. ROM inconnue : pas de double.
// - Pas de double, plutôt que de jouer le dossier habituel : table rangée avec d'autres, lien ou
//   jonction dans son dossier, autre disque que le dossier des parties.
//
// Le double se supprime sans jamais suivre un lien vers un dossier (leçon de l'incident des
// jonctions du 29/10/2026) ; supprimer un lien physique ne touche pas l'original.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';

/** Ce que rien n'écrit pendant une partie : lié plutôt que copié. */
const LINKED = new Set([
  '.vpx',
  '.directb2s',
  '.zip',
  '.7z',
  // Images, sons, vidéos, polices (PuP-Packs, DMD, médias du fronton).
  ...['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.apng', '.webp', '.tga', '.dds', '.exr', '.hdr'],
  ...['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.wma', '.opus'],
  ...['.mp4', '.m4v', '.avi', '.mkv', '.mov', '.webm', '.f4v', '.wmv', '.mpg', '.mpeg'],
  ...['.ttf', '.otf', '.fnt'],
  // Colorisations (Serum, VNI, PAC).
  ...['.crz', '.crom', '.cromc', '.pal', '.vni', '.pac'],
]);

/** Dossiers de la table que le double laisse : VPX refait son cache, le menu seul lit medias\. */
const LEFT = new Set(['cache', 'medias']);

export interface DoubleStep {
  from: string;
  to: string;
}

export interface TableDoublePlan {
  /** Dossier du double (créé par makeTableDouble). */
  dir: string;
  /** Le .vpx du double, à lancer. */
  file: string;
  dirs: string[];
  links: DoubleStep[];
  copies: DoubleStep[];
}

export interface TableDoubleInput {
  /** Le .vpx et son dossier. */
  file: string;
  folder: string;
  /** Faux : la table partage son dossier avec d'autres. */
  ownFolder: boolean;
  /** ROM que joue le script (pour une table sans son propre pinmame\roms). */
  roms: readonly string[];
  /** Le script appelle PinMAME. */
  usesPinmame: boolean;
  /** Dossier PinMAME commun ([Plugin.PinMAME] PinMAMEPath). */
  pinmameDir?: string;
}

export type DoublePlanResult = { ok: true; plan: TableDoublePlan } | { ok: false; reason: string };

const isLinked = (file: string) => LINKED.has(path.extname(file).toLowerCase());

/** Ce qui fera le double, sans rien toucher ; `parent` : le dossier des parties (même disque). */
export function planTableDouble(table: TableDoubleInput, parent: string): DoublePlanResult {
  if (!table.ownFolder) return { ok: false, reason: t('la table partage son dossier avec d’autres tables') };
  const dir = path.join(parent, path.basename(table.folder));
  const plan: TableDoublePlan = { dir, file: path.join(dir, path.basename(table.file)), dirs: [dir], links: [], copies: [] };
  const walk = (from: string, to: string, top: boolean): string | undefined => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(from, { withFileTypes: true });
    } catch (error) {
      return t('dossier illisible : {error}', { error: (error as Error).message });
    }
    for (const entry of entries) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isSymbolicLink() || isJunction(source)) return t('lien vers un autre dossier : {path}', { path: path.relative(table.folder, source) });
      if (entry.isDirectory()) {
        if (top && LEFT.has(entry.name.toLowerCase())) continue;
        plan.dirs.push(target);
        const problem = walk(source, target, false);
        if (problem) return problem;
      } else if (entry.isFile()) {
        (isLinked(entry.name) ? plan.links : plan.copies).push({ from: source, to: target });
      }
    }
    return undefined;
  };
  const problem = walk(table.folder, dir, true);
  if (problem) return { ok: false, reason: problem };
  // Pas de pinmame\roms à côté de la table : PinMAME jouerait dans le dossier commun. Le double a le sien.
  const ownRoms = path.join(table.folder, 'pinmame', 'roms');
  if (table.usesPinmame && !isDir(ownRoms)) {
    const shared = table.pinmameDir;
    const roms = table.roms.map((r) => r.trim().toLowerCase()).filter((r) => /^[a-z0-9_-]{1,32}$/.test(r));
    const zips = shared ? roms.map((r) => path.join(shared, 'roms', `${r}.zip`)).filter((z) => fs.existsSync(z)) : [];
    if (!shared || !zips.length) return { ok: false, reason: t('ROM introuvable : PinMAME écrirait dans son dossier commun') };
    const pin = path.join(dir, 'pinmame');
    plan.dirs.push(pin, path.join(pin, 'roms'), path.join(pin, 'nvram'), path.join(pin, 'cfg'));
    for (const zip of zips) plan.links.push({ from: zip, to: path.join(pin, 'roms', path.basename(zip)) });
    for (const rom of roms) {
      for (const [sub, ext] of [['nvram', '.nv'], ['cfg', '.cfg']] as const) {
        const own = path.join(shared, sub, `${rom}${ext}`);
        if (fs.existsSync(own)) plan.copies.push({ from: own, to: path.join(pin, sub, `${rom}${ext}`) });
      }
    }
  }
  if (!plan.links.some((l) => l.to === plan.file)) return { ok: false, reason: t('la table n’est pas dans son dossier') };
  return { ok: true, plan };
}

/**
 * Fait le double : dossiers, liens physiques, copies. Un lien impossible (autre disque) défait
 * tout et le dit ; rien n'est jamais écrit hors de `plan.dir`.
 */
export function makeTableDouble(plan: TableDoublePlan, parent: string): { ok: true } | { ok: false; reason: string } {
  if (!inside(plan.dir, parent)) return { ok: false, reason: t('double hors du dossier des parties') };
  if (fs.existsSync(plan.dir)) removeTableDouble(plan.dir, parent);
  try {
    for (const dir of plan.dirs) fs.mkdirSync(dir, { recursive: true });
    for (const step of plan.links) {
      if (!inside(step.to, plan.dir)) throw new Error(t('chemin hors du double'));
      try {
        fs.linkSync(step.from, step.to);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        throw new Error(code === 'EXDEV' ? t('les tables et le dossier des parties ne sont pas sur le même disque') : t('lien impossible ({code}) : {file}', { code: code ?? (error as Error).message, file: path.basename(step.from) }));
      }
    }
    for (const step of plan.copies) {
      if (!inside(step.to, plan.dir)) throw new Error(t('chemin hors du double'));
      fs.copyFileSync(step.from, step.to, fs.constants.COPYFILE_EXCL);
    }
    return { ok: true };
  } catch (error) {
    removeTableDouble(plan.dir, parent);
    return { ok: false, reason: (error as Error).message };
  }
}

/**
 * Supprime un double (ou tout le dossier des parties) : chaque fichier, chaque lien physique, puis
 * les dossiers ; un lien vers un dossier (jonction, lien symbolique) est retiré sans jamais être
 * suivi. Refuse tout chemin hors de `parent`.
 */
export function removeTableDouble(dir: string, parent: string): void {
  if (!inside(dir, parent) && path.resolve(dir) !== path.resolve(parent)) return;
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(dir);
  } catch {
    return;
  }
  if (stat.isSymbolicLink() || isJunction(dir)) {
    // Le lien seul : rmdir sur une jonction ne touche pas sa cible.
    try {
      fs.rmdirSync(dir);
    } catch {
      fs.unlinkSync(dir);
    }
    return;
  }
  if (!stat.isDirectory()) {
    fs.unlinkSync(dir);
    return;
  }
  for (const name of fs.readdirSync(dir)) removeTableDouble(path.join(dir, name), parent);
  if (path.resolve(dir) !== path.resolve(parent)) fs.rmdirSync(dir);
}

// ---------------------------------------------------------------------------
// Empreinte d'un dossier : la preuve que rien n'a bougé

/** Au-dessous, un fichier est lu en entier ; au-dessus (le .vpx, les vidéos), taille et date suffisent. */
const HASHED_MAX = 4 * 2 ** 20;

export type FolderPrint = Map<string, string>;

/**
 * Chaque fichier du dossier (sans suivre les liens vers des dossiers) : taille et date, et
 * l'empreinte SHA-256 du contenu des fichiers de moins de 4 Mio (`full` : de tous ; `contents:
 * false` : d'aucun, pour le journal de la borne, où une écriture change toujours la date).
 */
export function folderPrint(folder: string, opts: { full?: boolean; contents?: boolean } = {}): FolderPrint {
  const out: FolderPrint = new Map();
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      const rel = path.relative(folder, file);
      if (entry.isSymbolicLink() || isJunction(file)) out.set(rel, 'lien');
      else if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const stat = fs.statSync(file);
        const content = opts.full || (opts.contents !== false && stat.size <= HASHED_MAX) ? ` ${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}` : '';
        out.set(rel, `${stat.size} ${Math.round(stat.mtimeMs)}${content}`);
      }
    }
  };
  walk(folder);
  return out;
}

/** Ce qui a changé entre deux empreintes : « modifié : … », « ajouté : … », « supprimé : … ». */
export function folderChanges(before: FolderPrint, after: FolderPrint): string[] {
  const changes: string[] = [];
  for (const [rel, print] of after) {
    if (!before.has(rel)) changes.push(`ajouté : ${rel}`); // i18n-ignore : journal
    else if (before.get(rel) !== print) changes.push(`modifié : ${rel}`); // i18n-ignore : journal
  }
  for (const rel of before.keys()) if (!after.has(rel)) changes.push(`supprimé : ${rel}`); // i18n-ignore : journal
  return changes.sort();
}

// ---------------------------------------------------------------------------

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Une jonction de Windows : un dossier que lstat ne dit pas lien, mais dont readlink rend la cible. */
function isJunction(p: string): boolean {
  try {
    if (!fs.lstatSync(p).isDirectory()) return false;
    fs.readlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

function inside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
