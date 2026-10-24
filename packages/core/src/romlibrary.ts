// Bibliothèque de ROM. Chaque ROM est stockée une seule fois, dans
// <racine>\pinmame\roms ; chaque table qui la joue en a, dans son propre
// pinmame\roms (organisation « un dossier par table » de VPX 10.8.1), un lien
// physique : le même fichier sur le disque, sans place en plus. Le dossier de la
// bibliothèque est aussi le dossier commun de PinMAME ([Plugin.PinMAME]
// PinMAMEPath = <racine>\pinmame), qui sert de secours à une table sans lien.
// Un lien physique n'existe que sur un même volume : sinon, la table reçoit une copie.
// Deux fichiers de même nom sont la même ROM s'ils ont la même empreinte (SHA-1) ;
// de deux contenus différents, le plus récent (ou celui choisi) est gardé, l'autre
// part à la corbeille.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sameVolume, type FileOp } from './fileops';

/** Un fichier de ROM sur le disque. */
export interface RomFile {
  path: string;
  size: number;
  mtimeMs: number;
  /** Volume et numéro de fichier : deux liens physiques ont les mêmes. */
  dev: bigint;
  ino: bigint;
}

/** Une table installée dans son dossier, vue par la bibliothèque. */
export interface RomTable {
  folder: string;
  title: string;
  /** ROM que demandent les scripts de ses versions (au choix) ; absent si un script n'a pas été lu. */
  roms?: string[];
}

/**
 * Situation d'une ROM dans une table :
 * linked : lien vers la bibliothèque ; copy : fichier à part, identique ;
 * different : fichier à part, autre contenu que la bibliothèque ;
 * outside : présente dans la table, absente de la bibliothèque ;
 * notLinked : attendue, absente de la table mais dans la bibliothèque ;
 * missing : attendue, nulle part.
 */
export type RomState = 'linked' | 'copy' | 'different' | 'outside' | 'notLinked' | 'missing';

export interface RomUse {
  table: RomTable;
  /** Le script de la table la demande (sinon, elle est seulement présente dans son dossier). */
  expected: boolean;
  /** Fichier dans pinmame\roms de la table. */
  file?: RomFile;
  state: RomState;
}

export interface RomEntry {
  /** Nom de la ROM, sans .zip (« t2_l8 »). */
  name: string;
  key: string;
  /** Fichier dans la bibliothèque. */
  stored?: RomFile;
  uses: RomUse[];
}

export interface RomLibraryScan {
  library: string;
  /** Par nom de ROM. */
  entries: RomEntry[];
  /** Tables dont un script n'a pas été lu : leur ROM n'est connue que si elle est dans leur dossier. */
  unread: RomTable[];
}

export const romKey = (name: string): string => name.replace(/\.zip$/i, '').toLowerCase();

/** Dossier pinmame\roms d'une table. */
export const tableRomsDir = (folder: string): string => path.join(folder, 'pinmame', 'roms');

export function romFile(p: string): RomFile | undefined {
  try {
    const stat = fs.statSync(p, { bigint: true });
    if (!stat.isFile()) return undefined;
    return { path: p, size: Number(stat.size), mtimeMs: Number(stat.mtimeMs), dev: stat.dev, ino: stat.ino };
  } catch {
    return undefined;
  }
}

export const sameRomFile = (a: RomFile, b: RomFile): boolean => a.dev === b.dev && a.ino === b.ino;

const hashes = new Map<string, { size: number; mtimeMs: number; hash: string }>();

/** Empreinte SHA-1 du contenu (gardée en mémoire tant que le fichier ne change pas). */
export function romHash(file: RomFile): string {
  const key = `${file.dev}:${file.ino}`;
  const known = hashes.get(key);
  if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) return known.hash;
  const hash = createHash('sha1').update(fs.readFileSync(file.path)).digest('hex');
  hashes.set(key, { size: file.size, mtimeMs: file.mtimeMs, hash });
  return hash;
}

export function sameRomContent(a: RomFile, b: RomFile): boolean {
  return sameRomFile(a, b) || (a.size === b.size && romHash(a) === romHash(b));
}

/** Fichiers .zip d'un dossier de ROM, par nom en minuscules. */
export function listRoms(dir: string): Map<string, RomFile> {
  const out = new Map<string, RomFile>();
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.zip')) continue;
    const file = romFile(path.join(dir, name));
    if (file) out.set(romKey(name), file);
  }
  return out;
}

/** ROM de la bibliothèque, si elle y est. */
export function storedRom(library: string, name: string): RomFile | undefined {
  return listRoms(library).get(romKey(name));
}

/** Où en est chaque ROM : bibliothèque, tables qui l'ont ou qui l'attendent. */
export function scanRomLibrary(library: string, tables: RomTable[]): RomLibraryScan {
  const stored = listRoms(library);
  const entries = new Map<string, RomEntry>();
  const entry = (name: string): RomEntry => {
    const key = romKey(name);
    let e = entries.get(key);
    if (!e) {
      const file = stored.get(key);
      e = { name: file ? path.basename(file.path).replace(/\.zip$/i, '') : name.replace(/\.zip$/i, ''), key, stored: file, uses: [] };
      entries.set(key, e);
    }
    return e;
  };
  for (const file of stored.values()) entry(path.basename(file.path));

  for (const table of tables) {
    const present = listRoms(tableRomsDir(table.folder));
    const wanted = table.roms ?? [];
    // Une table qui laisse le choix entre plusieurs ROM n'en attend qu'une : celle qu'elle a,
    // sinon la première de la bibliothèque, sinon la première de son script.
    const has = wanted.find((r) => present.has(romKey(r)));
    const expectedKey = romKey(has ?? wanted.find((r) => stored.has(romKey(r))) ?? wanted[0] ?? '');
    for (const [key, file] of present) {
      const e = entry(path.basename(file.path));
      e.uses.push({ table, expected: key === expectedKey, file, state: stateOf(file, e.stored) });
    }
    if (expectedKey && !present.has(expectedKey)) {
      const e = entry(wanted.find((r) => romKey(r) === expectedKey)!);
      e.uses.push({ table, expected: true, state: e.stored ? 'notLinked' : 'missing' });
    }
  }
  return {
    library,
    entries: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    unread: tables.filter((t) => !t.roms),
  };
}

function stateOf(file: RomFile, stored: RomFile | undefined): RomState {
  if (!stored) return 'outside';
  if (sameRomFile(file, stored)) return 'linked';
  return sameRomContent(file, stored) ? 'copy' : 'different';
}

/** ROM de la bibliothèque qu'aucune table n'a ni n'attend. */
export const unusedRoms = (scan: RomLibraryScan): RomEntry[] => scan.entries.filter((e) => e.stored && !e.uses.length);

/** ROM attendues par une table et présentes nulle part. */
export const missingRoms = (scan: RomLibraryScan): RomEntry[] => scan.entries.filter((e) => !e.stored && e.uses.length && e.uses.every((u) => u.state === 'missing'));

/**
 * Ce qui reste à faire pour cette table : rien si elle est liée, si la ROM n'existe
 * nulle part, ou si c'est une copie identique sur un autre volume (un lien y est impossible).
 */
function needsWork(use: RomUse, library: string): boolean {
  if (use.state === 'linked' || use.state === 'missing') return false;
  return !(use.state === 'copy' && !sameVolume(library, use.table.folder));
}

/** ROM à ranger : hors de la bibliothèque, copies, autres versions, liens manquants. */
export const romsToTidy = (scan: RomLibraryScan): RomEntry[] =>
  scan.entries.filter((e) => e.uses.some((u) => needsWork(u, scan.library)) && (e.stored || e.uses.some((u) => u.file)));

export interface RomSpace {
  /** Fichiers de ROM (bibliothèque et tables). */
  files: number;
  /** Ce qu'ils occuperaient sans liens. */
  logical: number;
  /** Ce qu'ils occupent vraiment : chaque fichier physique compté une fois. */
  physical: number;
}

/** Place des ROM sur le disque, d'après un inventaire. */
export function romSpace(scan: RomLibraryScan): RomSpace {
  const files = scan.entries.flatMap((e) => [...(e.stored ? [e.stored] : []), ...e.uses.flatMap((u) => (u.file ? [u.file] : []))]);
  const seen = new Map<string, number>();
  for (const f of files) seen.set(`${f.dev}:${f.ino}`, f.size);
  return { files: files.length, logical: files.reduce((sum, f) => sum + f.size, 0), physical: [...seen.values()].reduce((a, b) => a + b, 0) };
}

/** Un contenu d'une ROM, et où il se trouve. */
export interface RomVersion {
  hash: string;
  /** Fichier qui le porte : celui de la bibliothèque s'il y est. */
  file: RomFile;
  inLibrary: boolean;
  /** Tables qui l'ont (titres). */
  tables: string[];
}

/** Ce que la migration fait d'une ROM. */
export interface RomMigration {
  key: string;
  name: string;
  /** Contenus différents trouvés sous ce nom, du plus récent au plus ancien. */
  versions: RomVersion[];
  /** Version gardée (index dans versions). */
  keep: number;
  /** L'utilisateur a choisi la version. */
  decided: boolean;
  /** La version gardée entre dans la bibliothèque (déplacée depuis une table). */
  stores?: string;
  /**
   * Tables qui recevront un lien. content : ce que la table avait, comparé à la version
   * gardée (none : rien, same : même contenu, other : autre version, à la corbeille).
   * copy : la table est sur un autre volume, elle reçoit une copie.
   */
  links: { table: RomTable; to: string; was: RomState; content: 'none' | 'same' | 'other'; copy: boolean }[];
  /** Copies identiques remplacées par un lien (octets libérés). */
  freed: number;
  /** Autres versions mises à la corbeille (octets). */
  trashed: number;
  ops: FileOp[];
}

export interface RomMigrationPlan {
  library: string;
  items: RomMigration[];
  freed: number;
  trashed: number;
  /** Tables sur un autre volume que la bibliothèque : elles reçoivent une copie. */
  crossVolume: RomTable[];
}

/**
 * Plan de rangement : chaque ROM entre dans la bibliothèque (la version la plus
 * récente, ou celle choisie : choices donne l'empreinte gardée par ROM), puis
 * chaque table qui l'a ou l'attend reçoit un lien à la place de sa copie.
 */
export function planRomMigration(scan: RomLibraryScan, choices: Map<string, string> = new Map()): RomMigrationPlan {
  const items: RomMigration[] = [];
  const crossVolume = new Map<string, RomTable>();
  for (const e of romsToTidy(scan)) {
    const versions = romVersions(e);
    const chosen = choices.get(e.key);
    const picked = chosen ? versions.findIndex((v) => v.hash === chosen) : -1;
    const keep = picked >= 0 ? picked : 0;
    const kept = versions[keep]!;
    const target = path.join(scan.library, e.stored ? path.basename(e.stored.path) : `${e.name}.zip`);
    const ops: FileOp[] = [];
    let stores: string | undefined;
    // La version gardée entre dans la bibliothèque ; l'ancienne y est remplacée (corbeille).
    if (!kept.inLibrary) {
      stores = kept.file.path;
      ops.push({ op: 'move', from: kept.file.path, to: target });
    }
    const links: RomMigration['links'] = [];
    let freed = 0;
    let trashed = 0;
    const counted = new Set<string>();
    if (e.stored && !kept.inLibrary) {
      counted.add(`${e.stored.dev}:${e.stored.ino}`);
      trashed += e.stored.size;
    }
    for (const use of e.uses) {
      // Lien vers la version gardée, ou copie identique sur un autre volume : rien à faire.
      if (kept.inLibrary && !needsWork(use, scan.library)) continue;
      const to = use.file?.path ?? path.join(tableRomsDir(use.table.folder), path.basename(target));
      const copy = !sameVolume(scan.library, use.table.folder);
      if (copy) crossVolume.set(use.table.folder.toLowerCase(), use.table);
      const f = use.file;
      const content = !f ? 'none' : sameRomFile(f, kept.file) || romHash(f) === kept.hash ? 'same' : 'other';
      links.push({ table: use.table, to, was: use.state, content, copy });
      ops.push({ op: 'link', from: target, to });
      if (!f || sameRomFile(f, kept.file)) continue;
      const id = `${f.dev}:${f.ino}`;
      if (counted.has(id)) continue;
      counted.add(id);
      if (romHash(f) !== kept.hash) trashed += f.size;
      else if (!copy) freed += f.size;
    }
    items.push({ key: e.key, name: e.name, versions, keep, decided: picked >= 0, stores, links, freed, trashed, ops });
  }
  return {
    library: scan.library,
    items,
    freed: items.reduce((sum, i) => sum + i.freed, 0),
    trashed: items.reduce((sum, i) => sum + i.trashed, 0),
    crossVolume: [...crossVolume.values()],
  };
}

/** Contenus distincts d'une ROM, du plus récent au plus ancien. */
function romVersions(e: RomEntry): RomVersion[] {
  const versions: RomVersion[] = [];
  const add = (file: RomFile, inLibrary: boolean, table?: string) => {
    const hash = romHash(file);
    let v = versions.find((x) => x.hash === hash);
    if (!v) {
      v = { hash, file, inLibrary, tables: [] };
      versions.push(v);
    } else if (inLibrary) {
      v.file = file;
      v.inLibrary = true;
    }
    if (table && !v.tables.includes(table)) v.tables.push(table);
  };
  if (e.stored) add(e.stored, true);
  for (const use of e.uses) if (use.file) add(use.file, false, use.table.title);
  // Le plus récent d'abord ; à date égale, celui de la bibliothèque.
  return versions.sort((a, b) => b.file.mtimeMs - a.file.mtimeMs || Number(b.inLibrary) - Number(a.inLibrary));
}
