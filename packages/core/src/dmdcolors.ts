// Couleurs du DMD d'une table (Serum, PIN2DMD) : où et sous quel nom les plugins de VPX les lisent.
//
// Plugins Serum et VNI de VPX 10.8.1 (plugins/serum/serum.cpp, plugins/vni/vni.cpp au commit
// af26b2d93), pour le jeu <rom> que joue PinMAME, à côté de la table :
//   Serum : serum\<rom>\<rom>.cROMc ou .cRZ, puis pinmame\altcolor\<rom>\ (mêmes noms) ;
//   VNI   : vni\<rom>\<rom>.pal ou pin2dmd.pal (avec le .vni du même nom), puis pinmame\altcolor\<rom>\.
// Il n'y a rien à cocher : la case « Colorize DMD » de VPinMAME (touche F1) n'existe pas dans ce
// mode, les deux plugins sont toujours allumés. Un dossier ou un fichier nommé autrement est ignoré
// sans rien dire à l'écran (« No colorization file found » dans vpinball.log) : le 21/11/2026, une
// colorisation PIN2DMD déposée seule avait fini dans vni\pin2dmd\, jamais chargée.
// Les .pac (chiffrés pour le PIN2DMD) et les .cROM (non compressés) ne sont jamais lus.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { romFamilyOf } from './romalias';

export type ColorKind = 'serum' | 'vni';

const SERUM_EXT = ['.crz', '.cromc'];
const VNI_EXT = ['.pal', '.vni'];
/** Fichiers de couleurs que VPX ne lit jamais. */
export const UNREAD_COLOR_EXT = ['.pac', '.crom'];
const PIN2DMD = 'pin2dmd';

/** Dossiers de couleurs à côté de la table, dans l'ordre où les plugins les lisent. */
export const COLOR_PARENTS: readonly string[] = ['serum', 'vni', path.join('pinmame', 'altcolor')];

const ext = (f: string) => path.extname(f).toLowerCase();
const stem = (f: string) => path.basename(f, path.extname(f));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Sorte de couleurs d'après les fichiers d'un dossier ; undefined s'il n'y en a pas. */
export function colorKindOf(files: readonly string[]): ColorKind | undefined {
  const exts = files.map(ext);
  if (exts.some((e) => SERUM_EXT.includes(e) || e === '.crom')) return 'serum';
  if (exts.some((e) => VNI_EXT.includes(e) || e === '.pac')) return 'vni';
  return undefined;
}

/** Un renommage dans un dossier de couleurs (noms de fichiers seuls). */
export interface ColorRename {
  from: string;
  to: string;
}

/**
 * Renommages qui font lire les fichiers de couleurs d'un dossier <rom> : Serum <rom>.cRZ (ou
 * .cROMc) ; PIN2DMD <rom>.pal ou pin2dmd.pal, et le .vni du même nom que le .pal. Vide si les
 * fichiers sont déjà lus, ou si aucun renommage n'est sûr (plusieurs .pal sans nom attendu).
 */
export function colorFileRenames(kind: ColorKind, files: readonly string[], rom: string): ColorRename[] {
  const taken = new Set(files.map((f) => f.toLowerCase()));
  const renames: ColorRename[] = [];
  const rename = (from: string, toStem: string) => {
    const to = `${toStem}${path.extname(from)}`;
    if (same(from, to) || taken.has(to.toLowerCase())) return;
    taken.add(to.toLowerCase());
    renames.push({ from, to });
  };
  if (kind === 'serum') {
    const readable = files.filter((f) => SERUM_EXT.includes(ext(f)));
    if (readable.some((f) => same(stem(f), rom))) return [];
    for (const f of readable) rename(f, rom);
    return renames;
  }
  const pals = files.filter((f) => ext(f) === '.pal');
  const vnis = files.filter((f) => ext(f) === '.vni');
  const good = pals.find((f) => same(stem(f), rom)) ?? pals.find((f) => same(stem(f), PIN2DMD));
  const name = good ? stem(good) : pals.length === 1 ? PIN2DMD : undefined;
  if (!name) return [];
  if (!good) rename(pals[0]!, name);
  if (vnis.length === 1 && !vnis.some((f) => same(stem(f), name))) rename(vnis[0]!, name);
  return renames;
}

/** Ce qui empêche des couleurs de la table d'être lues. */
export interface ColorProblem {
  /** Dossier, relatif à celui de la table : « vni\pin2dmd ». */
  rel: string;
  kind: ColorKind;
  /**
   * misnamed : dossier ou fichiers mal nommés, renommés sans risque (moves) ou à renommer à la main ;
   * otherRom : faites pour une autre révision du même jeu (madeFor) ;
   * unread : rien que des fichiers que VPX ne lit pas (.pac, .cROM).
   */
  reason: 'misnamed' | 'otherRom' | 'unread';
  /** Déplacements (chemins complets, dans l'ordre) qui les font lire ; vide si aucun n'est sûr. */
  moves: { from: string; to: string }[];
  /** Dossier relatif où elles seront lues après les déplacements. */
  target?: string;
  madeFor?: string;
  /** Fichiers jamais lus (.pac, .cROM), relatifs au dossier de la table. */
  unread: string[];
}

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function filesOf(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Couleurs de la table que VPX ne chargera pas. `accepted` : noms sous lesquels elles sont lues
 * (ROM demandées par le script et jeux que PinMAME charge vraiment, alias compris) ; `rom` : le jeu
 * joué, sous le nom duquel ranger un dossier qui n'en porte aucun ; absent (plusieurs ROM
 * possibles, aucune présente), un dossier mal nommé est signalé sans être déplacé.
 */
export function colorProblems(folder: string, accepted: readonly string[], rom?: string): ColorProblem[] {
  const problems: ColorProblem[] = [];
  const known = (n: string) => accepted.some((r) => same(r, n)) || (rom !== undefined && same(rom, n));
  for (const parent of COLOR_PARENTS) {
    const dir = path.join(folder, parent);
    const dirs = subdirs(dir);
    const colored = dirs
      .map((name) => ({ name, files: filesOf(path.join(dir, name)) }))
      .map((d) => ({ ...d, kind: colorKindOf(d.files) }))
      .filter((d): d is { name: string; files: string[]; kind: ColorKind } => d.kind !== undefined);
    const strangers = colored.filter((d) => !known(d.name));
    for (const d of colored) {
      const rel = path.join(parent, d.name);
      const unread = d.files.filter((f) => UNREAD_COLOR_EXT.includes(ext(f))).map((f) => path.join(rel, f));
      const readable = d.files.filter((f) => SERUM_EXT.includes(ext(f)) || ext(f) === '.pal');
      if (!readable.length) {
        problems.push({ rel, kind: d.kind, reason: 'unread', moves: [], unread });
        continue;
      }
      const inside = (name: string) =>
        colorFileRenames(d.kind, d.files, name).map((r) => ({ from: path.join(dir, name, r.from), to: path.join(dir, name, r.to) }));
      if (known(d.name)) {
        const moves = inside(d.name);
        if (moves.length) problems.push({ rel, kind: d.kind, reason: 'misnamed', moves, target: rel, unread });
        continue;
      }
      if (!rom) {
        problems.push({ rel, kind: d.kind, reason: 'misnamed', moves: [], unread });
        continue;
      }
      // Un seul dossier étranger de cette sorte, et la place au nom de la ROM libre : il y va.
      const free = !dirs.some((n) => same(n, rom)) && strangers.filter((s) => s.kind === d.kind).length === 1;
      const moves = free ? [{ from: path.join(dir, d.name), to: path.join(dir, rom) }, ...inside(rom)] : [];
      const target = free ? path.join(parent, rom) : undefined;
      // Nom d'une autre révision du même jeu (st_161h pour st_162h) : faite pour elle, à essayer à la main.
      const otherRom = d.name.includes('_') && romFamilyOf(d.name) === romFamilyOf(rom);
      problems.push({ rel, kind: d.kind, reason: otherRom ? 'otherRom' : 'misnamed', moves, target, madeFor: otherRom ? d.name : undefined, unread });
    }
  }
  return problems;
}

/**
 * Où ranger un dossier ou un fichier de couleurs importé pour une table : sous le nom de la ROM
 * qu'il porte s'il en porte une, sinon sous la ROM jouée (`rom`) ; les fichiers seuls prennent le
 * nom lu par VPX (colorFileRenames). Rend le chemin relatif au dossier de la table.
 */
export function colorImportTarget(kind: ColorKind, name: string, isDir: boolean, accepted: readonly string[], rom?: string): string {
  const own = isDir ? name : stem(name);
  const folder = accepted.find((r) => same(r, own)) ?? rom ?? own;
  if (isDir) return path.join(kind, folder);
  if (!rom && !accepted.some((r) => same(r, own))) return path.join(kind, folder, name);
  // Un .vni seul prend le nom du .pal qu'on lui donne d'office (pin2dmd), à moins de porter celui de la ROM.
  const lone = kind === 'vni' && ext(name) === '.vni' && !same(own, folder) && !same(own, PIN2DMD) ? `${PIN2DMD}${path.extname(name)}` : undefined;
  return path.join(kind, folder, lone ?? colorFileRenames(kind, [name], folder)[0]?.to ?? name);
}
