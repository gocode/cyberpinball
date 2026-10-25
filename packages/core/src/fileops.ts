// Opérations sur les fichiers des tables. Rien n'est jamais supprimé en silence :
// ce qu'on remplace ou retire part dans la corbeille de la racine
// (<racine>\trash\<date> <libellé>\…), d'où l'on peut le récupérer.
// Seule exception : les rapports de plantage, qui n'ont aucune valeur une fois lus.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatNumber, t } from './i18n';
import { buildZip, writeZipData, type RomZipMember } from './romzip';

export type FileOp =
  | { op: 'move'; from: string; to: string }
  | { op: 'copy'; from: string; to: string }
  | { op: 'trash'; path: string }
  | { op: 'delete'; path: string }
  /** Écrit un petit fichier texte (.info) ; l'ancien part à la corbeille. */
  | { op: 'write'; path: string; content: string }
  /**
   * Lien physique : to devient le même fichier que from, sans place en plus (voir linkFile).
   * Copie quand les deux ne sont pas sur le même volume.
   */
  | { op: 'link'; from: string; to: string }
  /**
   * ROM refaite à plat : un .zip dont les puces sont à la racine (romzip.ts), à partir
   * de fichiers libres ou des fichiers d'un autre zip. Un fichier déjà là part à la corbeille.
   */
  | { op: 'zip'; to: string; files: RomZipMember[]; mtimeMs?: number };

export interface OpContext {
  /** Dossier de la corbeille de cette opération (créé à la première utilisation). */
  trashDir: string;
}

/** Corbeille d'une opération : <racine>\trash\2026-10-20 14-05-12 <libellé>. */
export function trashDirFor(trashRoot: string, label: string, now = new Date()): string {
  // Heure locale : c'est celle que l'utilisateur cherchera dans la corbeille.
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return path.join(trashRoot, `${stamp} ${safeName(label)}`.trim());
}

/** Nom de fichier valide sous Windows. */
export function safeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

export function applyOps(ops: FileOp[], ctx: OpContext): void {
  for (const op of ops) {
    switch (op.op) {
      case 'move':
        if (samePath(op.from, op.to) && op.from === op.to) break;
        transfer(op.from, op.to, ctx, true);
        break;
      case 'copy':
        transfer(op.from, op.to, ctx, false);
        break;
      case 'trash':
        moveToTrash(op.path, ctx);
        break;
      case 'delete':
        fs.rmSync(op.path, { recursive: true, force: true });
        break;
      case 'write':
        if (fs.existsSync(op.path)) moveToTrash(op.path, ctx);
        fs.mkdirSync(path.dirname(op.path), { recursive: true });
        fs.writeFileSync(op.path, op.content, 'utf8');
        break;
      case 'link':
        linkFile(op.from, op.to, ctx);
        break;
      case 'zip': {
        // Contenu lu avant de mettre l'ancien fichier à la corbeille : la ROM peut se refaire d'elle-même.
        const data = buildZip(op.files);
        if (fs.existsSync(op.to)) moveToTrash(op.to, ctx);
        writeZipData(op.to, data, op.mtimeMs);
        break;
      }
    }
  }
}

/**
 * Déplace ou copie. Un dossier qui arrive sur un dossier existant est fusionné
 * fichier par fichier ; un fichier déjà présent à destination part à la corbeille.
 */
function transfer(from: string, to: string, ctx: OpContext, move: boolean): void {
  const fromIsDir = fs.statSync(from).isDirectory();
  if (fs.existsSync(to) && !samePath(from, to)) {
    if (fromIsDir && fs.statSync(to).isDirectory()) {
      for (const name of fs.readdirSync(from)) transfer(path.join(from, name), path.join(to, name), ctx, move);
      if (move) fs.rmdirSync(from);
      return;
    }
    moveToTrash(to, ctx);
  }
  if (move) movePath(from, to);
  else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
  }
}

/**
 * Fait de to un lien physique vers from. Un fichier déjà là est remplacé : supprimé
 * s'il est identique octet pour octet (from garde le même contenu, rien n'est perdu),
 * mis à la corbeille sinon. D'un volume à l'autre, un lien est impossible : copie, et
 * une copie identique déjà en place reste telle quelle.
 */
export function linkFile(from: string, to: string, ctx: OpContext): 'linked' | 'copied' | 'unchanged' {
  if (fs.existsSync(to)) {
    if (sameFile(from, to)) return 'unchanged';
    if (sameBytes(from, to)) {
      if (!sameVolume(from, to)) return 'unchanged';
      fs.rmSync(to);
    } else moveToTrash(to, ctx);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.linkSync(from, to);
    return 'linked';
  } catch (error) {
    // Autre volume, ou système de fichiers sans liens physiques (clé USB en FAT32, exFAT).
    if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EINVAL', 'EMLINK'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    fs.copyFileSync(from, to);
    return 'copied';
  }
}

/** Deux chemins désignent-ils le même fichier sur le disque (lien physique) ? */
export function sameFile(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a, { bigint: true });
    const sb = fs.statSync(b, { bigint: true });
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

/** Même contenu, octet pour octet. */
export function sameBytes(a: string, b: string): boolean {
  if (sameFile(a, b)) return true;
  if (fs.statSync(a).size !== fs.statSync(b).size) return false;
  const fa = fs.openSync(a, 'r');
  const fb = fs.openSync(b, 'r');
  try {
    const size = 1024 * 1024;
    const ba = Buffer.alloc(size);
    const bb = Buffer.alloc(size);
    for (;;) {
      const na = fs.readSync(fa, ba, 0, size, null);
      const nb = fs.readSync(fb, bb, 0, size, null);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na === 0) return true;
    }
  } finally {
    fs.closeSync(fa);
    fs.closeSync(fb);
  }
}

/**
 * Les deux chemins sont-ils sur le même volume (condition d'un lien physique) ?
 * Un chemin qui n'existe pas encore compte pour son premier dossier existant.
 */
export function sameVolume(a: string, b: string): boolean {
  const dev = (p: string) => {
    let current = path.resolve(p);
    for (;;) {
      try {
        return fs.statSync(current, { bigint: true }).dev;
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return undefined;
        current = parent;
      }
    }
  };
  const da = dev(a);
  return da !== undefined && da === dev(b);
}

export function moveToTrash(target: string, ctx: OpContext): string {
  const dest = path.join(ctx.trashDir, uniqueTrashName(ctx.trashDir, target));
  movePath(target, dest);
  return dest;
}

function uniqueTrashName(trashDir: string, target: string): string {
  const base = path.basename(target);
  let name = base;
  for (let i = 2; fs.existsSync(path.join(trashDir, name)); i++) name = `${base} (${i})`;
  return name;
}

/**
 * Déplace un fichier ou un dossier vers une destination libre. Sur le même disque
 * c'est un simple renommage ; d'un disque à l'autre (clé USB), copie puis suppression de l'original.
 */
export function movePath(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  // Changement de casse seule (« t2.vpx » -> « T2.vpx ») : Windows le voit comme le même fichier.
  if (samePath(from, to) && from !== to) {
    const tmp = `${to}.renommage-${process.pid}`;
    fs.renameSync(from, tmp);
    fs.renameSync(tmp, to);
    return;
  }
  try {
    fs.renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** true si child est dans parent (ou est parent), sans tenir compte de la casse. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Taille d'un fichier ou d'un dossier, en octets. */
export function sizeOf(target: string): number {
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0);
  } catch {
    return 0;
  }
}

/**
 * « 1,0 Go », « 64 Mo », « 4,8 ko ». `fine` : une décimale fixe jusqu'à 100 (« 48,2 Mo »,
 * « 48,0 Mo »), pour un volume qui avance sous les yeux sans changer de largeur.
 */
export function formatSize(bytes: number, fine = false): string {
  const units: [number, string][] = [
    [1024 ** 3, t('Go')],
    [1024 ** 2, t('Mo')],
    [1024, t('ko')],
  ];
  for (const [size, unit] of units) {
    // Dès 1000 de l'unité d'en dessous : « 1,0 Mo » plutôt que « 1 021 ko ».
    if (bytes >= (size * 1000) / 1024) {
      const value = bytes / size;
      const digits = value < (fine ? 100 : 10) ? 1 : 0;
      return `${formatNumber(value, { maximumFractionDigits: digits, minimumFractionDigits: fine ? digits : 0 })} ${unit}`;
    }
  }
  return t('{n} octets', { n: bytes });
}

/** Supprime les dossiers vides restés derrière un déplacement, jusqu'à stop exclu. */
export function pruneEmptyDirs(dir: string, stop: string): void {
  let current = dir;
  while (isInside(current, stop) && !samePath(current, stop) && fs.existsSync(current)) {
    if (fs.readdirSync(current).length > 0) return;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}
