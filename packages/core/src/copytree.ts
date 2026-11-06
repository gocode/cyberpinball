// Copie d'un fichier ou d'un dossier entier : la seule du dépôt (copie-sure.test.ts refuse tout
// fs.cpSync dans les sources).
//
// Défaut constaté le 06/11/2026 : sous Windows, fs.cpSync récursif de Node 22 (22.23.2) passe ses
// chemins à la bibliothèque C++ dans la page de code ANSI (cp1252). Une destination accentuée
// devient un dossier fantôme (« pupvideos (désactivés) » écrit « pupvideos (dÃ©sactivÃ©s) »,
// même quand le bon dossier existe déjà), et une source ou un dossier parent accentué arrête net
// le processus (code 0xC0000409 : aucun try ne le rattrape, la chaîne de dossiers fantômes reste
// derrière). Electron 44 (Node 24.21) n'a pas ce défaut, mais les essais, les scripts de
// fabrication et les outils en ligne de commande tournent sous Node 22. Ici, rien que des appels
// élémentaires (mkdirSync, copyFileSync), sains sur toutes les versions.
//
// Ce que le défaut a déjà écrit se reconnaît à son nom (unmangledName) : le médecin des tables
// propose de ranger un tel dossier sous son vrai nom (règle folderMangled, doctor.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CopyOptions {
  /**
   * Faux : un fichier déjà présent à destination est une erreur (EEXIST) au lieu d'être
   * remplacé. Vrai par défaut, comme fs.cpSync.
   */
  overwrite?: boolean;
  /**
   * Comme pour fs.cpSync : faux écarte l'élément, et tout son contenu si c'est un dossier.
   * Appelé aussi pour la source elle-même.
   */
  filter?: (src: string, dest: string) => boolean;
}

/**
 * Copie `from` (fichier ou dossier) vers `to`. Un dossier qui arrive sur un dossier existant y
 * est fusionné ; les dossiers parents manquants sont créés. Un lien (jonction) est recopié comme
 * lien, vers la même cible, comme le fait fs.cpSync.
 */
export function copyTree(from: string, to: string, opts: CopyOptions = {}): void {
  const src = path.resolve(from);
  const dest = path.resolve(to);
  const rel = path.relative(src.toLowerCase(), dest.toLowerCase());
  if (fs.statSync(src).isDirectory() && (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))) {
    throw Object.assign(new Error(`Copie de ${src} dans lui-même (${dest})`), { code: 'EINVAL' }); // i18n-ignore : erreur de programmation
  }
  copyEntry(src, dest, opts);
}

function copyEntry(src: string, dest: string, opts: CopyOptions): void {
  if (opts.filter && !opts.filter(src, dest)) return;
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    copyLink(src, dest, opts);
  } else if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyEntry(path.join(src, name), path.join(dest, name), opts);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest, opts.overwrite === false ? fs.constants.COPYFILE_EXCL : 0);
  }
}

function copyLink(src: string, dest: string, opts: CopyOptions): void {
  const target = path.resolve(path.dirname(src), fs.readlinkSync(src));
  let toDir = false;
  try {
    toDir = fs.statSync(src).isDirectory();
  } catch {
    // Lien cassé : recopié tel quel, comme un lien vers un fichier.
  }
  const existing = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (existing) {
    if (opts.overwrite === false || (existing.isDirectory() && !existing.isSymbolicLink())) {
      throw Object.assign(new Error(`EEXIST: ${dest}`), { code: 'EEXIST' }); // i18n-ignore : erreur système
    }
    fs.unlinkSync(dest);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Une jonction, pas un lien symbolique de dossier : elle ne demande aucun droit particulier.
  fs.symlinkSync(target, dest, toDir ? 'junction' : 'file');
}

// ---------- Noms abîmés par l'ancien fs.cpSync ----------

/** Caractères de cp1252 entre 0x80 et 0x9f (les autres octets donnent le caractère de même code). */
const CP1252_HIGH = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
  [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/**
 * Vrai nom d'un dossier écrit par le défaut de l'ancienne copie (« dÃ©sactivÃ©s » -> « désactivés ») :
 * l'UTF-8 du nom lu comme du cp1252. undefined pour un nom sain : un nom français ordinaire
 * (« Été », « Âge ») ne forme pas de l'UTF-8 valide une fois relu ainsi.
 */
export function unmangledName(name: string): string | undefined {
  // Un caractère accentué en UTF-8 commence par un octet de 0xc2 à 0xf4 : « Â » à « ô ».
  if (!/[Â-ô]/.test(name)) return undefined;
  const bytes: number[] = [];
  for (const ch of name) {
    const code = ch.codePointAt(0)!;
    const byte = code < 0x100 ? code : CP1252_HIGH.get(code);
    if (byte === undefined) return undefined;
    bytes.push(byte);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return undefined;
  }
  return text !== name ? text : undefined;
}

/** Dossier fantôme et dossier où son contenu devait aller. */
export interface MangledDir {
  path: string;
  repaired: string;
}

/**
 * Dossiers fantômes sous `dir` (lui compris), jusqu'à `depth` niveaux. On ne descend pas dans un
 * dossier fantôme : son contenu porte de bons noms et le suit quand on le range.
 */
export function findMangledDirs(dir: string, depth: number): MangledDir[] {
  const found: MangledDir[] = [];
  const visit = (current: string, left: number) => {
    const fixed = unmangledName(path.basename(current));
    if (fixed) {
      found.push({ path: current, repaired: path.join(path.dirname(current), fixed) });
      return;
    }
    if (left <= 0) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) if (e.isDirectory()) visit(path.join(current, e.name), left - 1);
  };
  visit(dir, depth);
  return found;
}
