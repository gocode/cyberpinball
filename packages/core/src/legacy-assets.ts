// Musique et dossier UltraDMD/FlexDMD d'une table qui joue sans eux : on les retrouve ailleurs sur ce PC (ancienne
// installation de Visual Pinball, de PinballX/PinballY, de PinUP/Popper, tables rangées ailleurs, téléchargements, autres
// tables de Cyber Pinball) et le Diagnostic propose de les copier chez la table.
// Retour d'une joueuse (23/11/2026) : Champions League - Season 2023 muette, « Failed to stream music:
// ChampionsLeague\bgout_UEFACL - Intro.mp3 » ; le dossier ChampionsLeague était dans le dossier Music de son ancien
// Visual Pinball. Invariants : la recherche ne regarde qu'une liste bornée d'emplacements et leurs sous-dossiers directs
// (jamais tout le disque), dans un délai court, sans tenir compte de la casse ; la copie ne remplace jamais un fichier
// déjà là (op « copy », fileops.ts) ; ce qui est proposé contient bien ce que VPX réclame.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FileOp } from './fileops';
import { knownInstallations } from './mediaimport';

/** Noms qu'une installation de Visual Pinball (ou d'un front-end) porte, posée à la racine d'un disque ou d'un dossier de programmes. */
const INSTALL_NAMES = [
  'Visual Pinball', 'VisualPinball', 'vPinball', 'VPinball', 'VPX', 'VPinballX', 'Visual Pinball X', 'VisualPinballX',
  'vPinball\\VisualPinball', 'Visual Pinball\\VisualPinball', 'Pinball\\VisualPinball', 'Pinball\\Visual Pinball', 'VPinStudio',
  'PinballX', 'PinballY', 'PinUPSystem', 'Pinball', 'Pinball Games', 'Tables', 'VPX Tables', 'Visual Pinball Tables',
];
/** Dossiers qui contiennent des installations. */
const INSTALL_PARENTS = ['', 'Games', 'Program Files', 'Program Files (x86)', 'Pinball'];
/** Dossiers de la joueuse où l'on dépose des téléchargements ou des tables : leurs sous-dossiers directs sont regardés. */
const HOME_FOLDERS = ['Downloads', 'Téléchargements', 'Desktop', 'Bureau', 'Documents', 'OneDrive\\Documents', 'OneDrive\\Desktop', 'OneDrive\\Bureau', 'Documents\\Visual Pinball', 'Documents\\VPinball', '.vpinball']; // i18n-ignore : noms de dossiers Windows
/** Disques regardés : fixes habituels (un lecteur réseau déconnecté ferait attendre). */
const DRIVES = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:'];
/** Plafond de sous-dossiers lus par racine, et durée maximale d'une recherche. */
const MAX_CHILDREN = 300;
const BUDGET_MS = 2500;

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function dirNames(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Le chemin `segments` sous `parent`, en ignorant la casse à chaque niveau ; undefined s'il n'existe pas. */
function resolveCI(parent: string, segments: readonly string[]): string | undefined {
  let cur = parent;
  for (const seg of segments) {
    let next: string | undefined;
    try {
      next = fs.readdirSync(cur).find((n) => n.toLowerCase() === seg.toLowerCase());
    } catch {
      return undefined;
    }
    if (!next) return undefined;
    cur = path.join(cur, next);
  }
  return cur;
}

/**
 * Racines où chercher : les installations possibles de Visual Pinball et des front-ends sur les disques, les dossiers
 * de la joueuse (téléchargements, bureau, documents), et ce que les installations PinUP / PinballX détectées ont à
 * côté d'elles. Liste bornée : jamais de parcours du disque.
 */
export function legacyBaseDirs(drives: string[] = DRIVES, exists: (dir: string) => boolean = isDir, home: string | undefined = os.homedir()): string[] {
  const out: string[] = [];
  const add = (dir: string) => {
    if (!out.some((o) => o.toLowerCase() === dir.toLowerCase()) && exists(dir)) out.push(dir);
  };
  for (const drive of drives) {
    for (const parent of INSTALL_PARENTS) for (const name of INSTALL_NAMES) add(path.join(`${drive}\\`, parent, name));
  }
  if (home) for (const f of HOME_FOLDERS) add(path.join(home, f));
  for (const inst of knownInstallations(drives)) {
    // <base>\PinUPSystem\POPMedia (Popper) ou <base>\Media (PinballX) : Visual Pinball est dans <base> ou à côté.
    const base = inst.frontend === 'popper' ? path.dirname(path.dirname(inst.path)) : path.dirname(inst.path);
    add(base);
    for (const name of INSTALL_NAMES.slice(0, 8)) {
      add(path.join(base, name));
      add(path.join(path.dirname(base), name));
    }
  }
  return out;
}

/**
 * Les dossiers où un dossier de musique ou de DMD peut se trouver pour une racine : elle-même, ses « Music » et
 * « Tables », leurs sous-dossiers directs (une table rangée dans son propre dossier) et leur « music ».
 */
function parentsOf(root: string): string[] {
  const out: string[] = [];
  const add = (d: string | undefined) => {
    if (d && !out.some((o) => o.toLowerCase() === d.toLowerCase())) out.push(d);
  };
  add(root);
  for (const n of ['Music', 'Tables']) add(resolveCI(root, [n]));
  add(resolveCI(root, ['Tables', 'Music']));
  for (const top of [root, resolveCI(root, ['Tables'])]) {
    if (!top) continue;
    for (const c of dirNames(top).slice(0, MAX_CHILDREN)) {
      add(path.join(top, c));
      add(resolveCI(path.join(top, c), ['Music']));
    }
  }
  return out;
}

export interface FindOptions {
  /** Un dossier à ne pas proposer (le dossier de la table, qui est la destination). */
  exclude?: string;
  /** Le dossier trouvé doit contenir au moins un de ces fichiers (chemins relatifs, sans tenir compte de la casse). */
  contains?: readonly string[];
}

function inside(file: string, dir: string | undefined): boolean {
  if (!dir) return false;
  const rel = path.relative(dir.toLowerCase(), file.toLowerCase());
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Le premier dossier qui porte un des noms voulus (comparés sans la casse) dans les emplacements des racines. Avec
 * `contains`, il doit aussi avoir un de ces fichiers : on ne propose pas un dossier de même nom qui ne servirait à rien.
 */
export function findLegacyFolder(names: readonly string[], bases: readonly string[], opts: FindOptions = {}): string | undefined {
  const deadline = Date.now() + BUDGET_MS;
  for (const base of bases) {
    if (Date.now() > deadline) return undefined;
    for (const parent of parentsOf(base)) {
      for (const name of names) {
        const found = resolveCI(parent, [name]);
        if (!found || !isDir(found) || inside(found, opts.exclude)) continue;
        if (opts.contains?.length && !opts.contains.some((f) => resolveCI(found, f.split(/[\\/]+/).filter(Boolean)))) continue;
        return found;
      }
    }
  }
  return undefined;
}

/** Un fichier de musique que le script nomme sans dossier : à la racine de Music, ou d'un emplacement voisin. */
export function findLegacyMusicFile(file: string, bases: readonly string[], opts: FindOptions = {}): string | undefined {
  const deadline = Date.now() + BUDGET_MS;
  for (const base of bases) {
    if (Date.now() > deadline) return undefined;
    for (const parent of parentsOf(base)) {
      const found = resolveCI(parent, [file]);
      if (found && !isDir(found) && !inside(found, opts.exclude)) return found;
    }
  }
  return undefined;
}

/** Les deux écritures d'un dossier DMD : « X.UltraDMD » et « X.FlexDMD » (l'ancienne installation a pu garder l'autre). */
export function dmdFolderNames(name: string): string[] {
  const m = /^(.*)\.(ultradmd|flexdmd)$/i.exec(name);
  if (!m) return [name];
  return [name, `${m[1]}.${/^ultra/i.test(m[2]!) ? 'FlexDMD' : 'UltraDMD'}`];
}

export interface LegacyMusicPlan {
  /** Ce qui a été retrouvé, et où. */
  found: { name: string; from: string; to: string; isFolder: boolean }[];
  /** Ce qui reste introuvable : le Diagnostic propose de le choisir à la main. */
  notFound: { name: string; to: string; isFolder: boolean }[];
}

/**
 * Plan de reprise de la musique que VPX n'a pas trouvée : « Dossier\piste.mp3 » demande le dossier « Dossier »
 * (copié en entier, avec ses autres pistes, à condition qu'il ait cette piste) ; « piste.mp3 » seule demande ce fichier.
 */
export function planLegacyMusic(missing: readonly string[], tableFolder: string, bases: readonly string[]): LegacyMusicPlan {
  const plan: LegacyMusicPlan = { found: [], notFound: [] };
  const musicDir = path.join(tableFolder, 'music');
  const seen = new Set<string>();
  for (const raw of missing) {
    const parts = raw.split(/[\\/]+/).filter(Boolean);
    if (!parts.length) continue;
    const isFolder = parts.length > 1;
    const name = parts[0]!;
    const key = `${isFolder}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const to = path.join(musicDir, name);
    // Un dossier se choisit d'après les pistes réclamées (toutes celles que le journal cite pour lui).
    const wanted = missing.map((m) => m.split(/[\\/]+/).filter(Boolean)).filter((p) => p.length > 1 && p[0]!.toLowerCase() === name.toLowerCase()).map((p) => p.slice(1).join('\\'));
    const from = isFolder
      ? findLegacyFolder([name], bases, { exclude: tableFolder, contains: wanted })
      : findLegacyMusicFile(name, bases, { exclude: tableFolder });
    if (from) plan.found.push({ name, from, to, isFolder });
    else plan.notFound.push({ name, to, isFolder });
  }
  return plan;
}

/** Les opérations de copie : jamais de remplacement (copy fusionne les dossiers, sans écraser). */
export function legacyCopyOps(items: readonly { from: string; to: string }[]): FileOp[] {
  return items.map((i) => ({ op: 'copy' as const, from: i.from, to: i.to, keep: true }));
}

export interface LegacyPick {
  name: string;
  dest: string;
  /** Un fichier seul (musique nommée sans dossier) plutôt qu'un dossier. */
  file?: boolean;
}

/**
 * Ce qu'il faut copier quand la joueuse choisit un dossier à la main : le dossier lui-même, ou son sous-dossier du bon
 * nom (elle a pris tout le dossier Music ou Tables de l'ancienne installation). Pour un fichier : celui du bon nom
 * dans le dossier choisi. Aucune opération si le dossier choisi ne contient pas ce qu'on attend.
 */
export function legacyPickOps(chosen: string, pick: LegacyPick): FileOp[] {
  if (pick.file) {
    const f = resolveCI(chosen, [pick.name]);
    return f && !isDir(f) ? legacyCopyOps([{ from: f, to: pick.dest }]) : [];
  }
  const inner = resolveCI(chosen, [pick.name]);
  const from = inner && isDir(inner) ? inner : chosen;
  return legacyCopyOps([{ from, to: pick.dest }]);
}
