// Sauvegardes de la borne (Menu système > Cyber Pinball > Sauvegardes) : une copie de la racine sur
// une clé USB, un disque ou un dossier, à trois niveaux, et sa restauration.
//
// Une destination est un dossier (E:\CyberPinball-Sauvegardes, ou <racine>\data\sauvegardes pour
// les sauvegardes automatiques gardées sur la borne) :
//   objets\ab\abcdef…            le contenu de chaque fichier une seule fois, nommé par son SHA-256
//   <borne>\<date> <niveau>\sauvegarde.json   une sauvegarde : la liste de ses fichiers
// Un fichier qui n'a pas changé depuis la sauvegarde précédente n'est donc jamais recopié, quel que
// soit le système de fichiers de la clé (exFAT, FAT32, NTFS, dossier réseau). Chaque objet écrit est
// relu et comparé à son empreinte avant d'être rangé : une sauvegarde « vérifiée » l'a été fichier
// par fichier. Une sauvegarde interrompue garde la liste de ce qui a été copié et vérifié, marquée
// incomplète.
//
// Restaurer se fait en deux temps, pour que Cyber Pinball ne réécrive jamais un fichier restauré avec
// ce qu'il a en mémoire : (1) l'application en marche copie les fichiers de la sauvegarde dans
// <racine>\data\restauration\ (vérifiés), puis redémarre ; (2) au démarrage, avant que quoi que ce
// soit ne lise la racine, applyPendingRestore met chaque fichier actuel à la corbeille et pose le
// fichier restauré à sa place (simple renommage, même disque). Ce qui a été mis à la corbeille est
// noté : « Annuler cette restauration » le remet par le même chemin. Rien n'est jamais supprimé de
// la racine : un fichier qu'une sauvegarde n'a pas (une table ajoutée depuis) reste où il est.

import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { renameWithRetryAsync, writeFileAtomic } from './atomicwrite';
import { movePath, safeName, samePath, trashDirFor } from './fileops';
import { t } from './i18n';
import { readJsonFile } from './store';

// ---------- Ce qu'on sauvegarde ----------

/** Ce que contient une sauvegarde : chaque niveau contient le précédent. */
export type BackupLevel = 'settings' | 'tables' | 'all';
export const BACKUP_LEVELS: readonly BackupLevel[] = ['settings', 'tables', 'all'];

/**
 * Parties d'une sauvegarde, dans l'ordre de la copie : ce qui ne se retrouve nulle part ailleurs
 * d'abord, pour qu'une copie interrompue en ait déjà l'essentiel.
 */
export type BackupPart = 'cabinet' | 'settings' | 'scores' | 'friends' | 'tables' | 'vpx';
export const BACKUP_PARTS: readonly BackupPart[] = ['cabinet', 'settings', 'scores', 'friends', 'tables', 'vpx'];

export const LEVEL_PARTS: Readonly<Record<BackupLevel, readonly BackupPart[]>> = {
  settings: ['cabinet', 'settings', 'scores', 'friends'],
  tables: ['cabinet', 'settings', 'scores', 'friends', 'tables'],
  all: ['cabinet', 'settings', 'scores', 'friends', 'tables', 'vpx'],
};

export function levelLabel(level: BackupLevel): string {
  return level === 'settings' ? t('Réglages et scores') : level === 'tables' ? t('Avec les tables') : t('Toute l’installation');
}

export function backupPartLabel(part: BackupPart): string {
  switch (part) {
    case 'cabinet':
      return t('Écrans, boutons et son de la borne');
    case 'settings':
      return t('Réglages des tables et des médias');
    case 'scores':
      return t('Meilleurs scores des tables');
    case 'friends':
      return t('Amis, historique des parties et identité de la borne');
    case 'tables':
      return t('Tables, ROM, PuP-Packs, sons et médias');
    case 'vpx':
      return t('VPX, outils et archives gardées');
  }
}

/** Dossier d'une destination sur un lecteur : E:\CyberPinball-Sauvegardes. */
export const BACKUP_DIR_NAME = 'CyberPinball-Sauvegardes';
/** Nom du fichier d'une sauvegarde, dans son dossier. */
export const MANIFEST_NAME = 'sauvegarde.json';
const OBJECTS = 'objets';
const MANIFEST_FORMAT = 1;

/** Sauvegardes automatiques gardées sur la borne : <racine>\data\sauvegardes. */
export function localBackupDir(dataDir: string): string {
  return path.join(dataDir, 'sauvegardes');
}

/** Réglages des sauvegardes (destination, sauvegarde automatique) : propres à ce PC, jamais sauvegardés. */
export function backupSettingsFile(dataDir: string): string {
  return path.join(dataDir, 'sauvegardes.json');
}

/** Empreintes déjà calculées (taille, date, SHA-256 de chaque fichier) : refaites au besoin, jamais sauvegardées. */
export function hashCacheFile(dataDir: string): string {
  return path.join(dataDir, 'sauvegardes-empreintes.json');
}

/** Identité de la borne pour les sauvegardes : reconnaître les siennes parmi celles d'une clé. */
export function cabinetIdFile(dataDir: string): string {
  return path.join(dataDir, 'borne.json');
}

/** Restauration préparée, appliquée au démarrage suivant (fichiers copiés et plan). */
export function pendingRestoreDir(dataDir: string): string {
  return path.join(dataDir, 'restauration');
}

/** Dernière restauration appliquée : ce qui a été mis à la corbeille, pour l'annuler. */
export function lastRestoreFile(dataDir: string): string {
  return path.join(dataDir, 'restauration-derniere.json');
}

/**
 * Partie d'un fichier de la racine (chemin relatif, séparateur « / »), ou undefined s'il n'entre
 * jamais dans une sauvegarde : Cyber Pinball lui-même, cache, corbeille, journaux, imports en
 * attente, doubles des parties entre amis, réglages et restaurations des sauvegardes elles-mêmes.
 */
export function partOf(rel: string): BackupPart | undefined {
  const parts = rel.split('/');
  const [top] = parts;
  const lower = rel.toLowerCase();
  const name = (parts[parts.length - 1] ?? '').toLowerCase();
  if (/\.tmp-\d+/.test(name) || name.includes('.cp-restore') || name === 'thumbs.db' || name === 'desktop.ini') return undefined;
  switch (top) {
    case 'config':
      return 'cabinet';
    case 'data': {
      const sub = parts[1]?.toLowerCase() ?? '';
      if (parts.length > 2) {
        // Amis : records, historique, réglages ; ce qu'un ami a envoyé (recus, tables) se redemande.
        if (sub === 'amis') return ['recus', 'tables'].includes(parts[2]?.toLowerCase() ?? '') ? undefined : 'friends';
        if (sub === 'enregistrements') return 'vpx';
        // cache, logs, backups (anciens VPinballX.ini), staging, sauvegardes, restauration, adblock (listes retéléchargées)…
        return undefined;
      }
      if (sub === 'social.json') return 'friends';
      // Tableau des scores daté de chaque table (scoreboard.ts) : avec les records des tables.
      if (sub === 'scores.json') return 'scores';
      if (/^cabinet.*\.json$/.test(sub) || sub === 'vpx-owned.json' || sub === 'borne.json') return 'cabinet';
      // Propres à ce PC : téléchargements en cours, mise à jour en attente, orientation d'origine de ses écrans.
      if (sub.startsWith('sauvegardes') || sub.startsWith('restauration') || ['telechargements.json', 'mise-a-jour.json', 'orientation-ecrans.json'].includes(sub)) return undefined;
      return sub.endsWith('.json') ? 'settings' : undefined;
    }
    case 'tables': {
      if (parts.length < 3) return undefined;
      const inside = parts.slice(2).map((p) => p.toLowerCase());
      if (inside[0] === 'cache') return undefined;
      if (inside.length === 1 && name.endsWith('.ini')) return 'settings';
      if (inside[0] === 'pinmame') return pinmamePart(inside.slice(1));
      if (name === 'vpreg.stg') return 'scores';
      return 'tables';
    }
    case 'pinmame':
      return pinmamePart(parts.slice(1).map((p) => p.toLowerCase()));
    case 'media':
      return 'tables';
    case 'emulators':
      return name === 'vpreg.stg' ? 'scores' : 'vpx';
    case 'downloads':
    case 'tools':
      return 'vpx';
    default:
      return lower === 'vpreg.stg' ? 'scores' : undefined;
  }
}

/** Dossier pinmame (de la racine ou d'une table) : nvram et memcard sont des scores, cfg un réglage. */
function pinmamePart(inside: string[]): BackupPart {
  if (inside.length > 1 && (inside[0] === 'nvram' || inside[0] === 'memcard')) return 'scores';
  if (inside.length > 1 && inside[0] === 'cfg') return 'settings';
  return 'tables';
}

/** Dossiers de la racine parcourus pour chaque partie (le reste n'est jamais lu). */
function topDirsFor(parts: ReadonlySet<BackupPart>): string[] {
  const dirs = new Set<string>(['config', 'data', 'tables', 'pinmame']);
  if (parts.has('tables')) dirs.add('media');
  // VPReg.stg (scores des tables originales) vit à côté de VPX : emulators est lu pour lui seul.
  dirs.add('emulators');
  if (parts.has('vpx')) for (const d of ['downloads', 'tools']) dirs.add(d);
  return [...dirs];
}

export interface ScanEntry {
  /** Chemin relatif à la racine, séparateur « / ». */
  rel: string;
  part: BackupPart;
  size: number;
  mtimeMs: number;
}

/**
 * Fichiers de la racine qui entrent dans ces parties. Les jonctions et liens symboliques ne sont
 * jamais suivis (emulators\vpx\current, jonctions de démonstration) : un même fichier n'est pas
 * compté deux fois et rien hors de la racine n'est lu.
 */
export async function scanRoot(root: string, wanted: Iterable<BackupPart>, dataDir?: string): Promise<ScanEntry[]> {
  const parts = new Set(wanted);
  const out: ScanEntry[] = [];
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    let names: fs.Dirent[];
    try {
      names = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      const abs = path.join(dir, d.name);
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        if (!dirMayHold(childRel, parts, depth + 1)) continue;
        await walk(abs, childRel, depth + 1);
      } else if (d.isFile()) {
        const part = partOf(childRel);
        if (!part || !parts.has(part)) continue;
        let st: fs.Stats;
        try {
          st = await fs.promises.lstat(abs);
        } catch {
          continue;
        }
        out.push({ rel: childRel, part, size: st.size, mtimeMs: Math.floor(st.mtimeMs) });
      }
    }
  };
  for (const top of topDirsFor(parts)) {
    const abs = top === 'data' && dataDir ? dataDir : path.join(root, top);
    try {
      const st = await fs.promises.lstat(abs);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
    } catch {
      continue;
    }
    await walk(abs, top, 1);
  }
  out.sort((a, b) => BACKUP_PARTS.indexOf(a.part) - BACKUP_PARTS.indexOf(b.part) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

/**
 * Chemin d'un fichier de la racine (relatif, « / ») : « data/… » est dans le dossier des données,
 * <racine>\data une fois installé, ailleurs dans un bac à sable (CYBERPINBALL_HOME).
 */
export function rootPath(root: string, dataDir: string, rel: string): string {
  const parts = rel.split('/');
  return parts[0] === 'data' ? path.join(dataDir, ...parts.slice(1)) : path.join(root, ...parts);
}

/** Un dossier peut-il contenir un fichier des parties voulues ? Évite de parcourir 15 Go pour 4 Mo. */
function dirMayHold(rel: string, parts: ReadonlySet<BackupPart>, depth: number): boolean {
  const segs = rel.toLowerCase().split('/');
  const [top] = segs;
  if (top === 'data') {
    if (depth !== 2) return true;
    const sub = segs[1];
    return (sub === 'amis' && parts.has('friends')) || (sub === 'enregistrements' && parts.has('vpx'));
  }
  if (top === 'tables' || top === 'pinmame') {
    if (parts.has('tables')) return !(top === 'tables' && segs[2] === 'cache' && depth === 3);
    // Sans les tables : seuls les dossiers pinmame\nvram, memcard et cfg (et le dossier de chaque table).
    const inside = top === 'tables' ? segs.slice(2) : segs.slice(1);
    if (inside.length === 0) return true;
    // Le dossier user d'une table : VPReg.stg, les scores des tables originales.
    if (top === 'tables' && inside[0] === 'user') return true;
    if (inside[0] !== 'pinmame') return top === 'pinmame' ? ['nvram', 'memcard', 'cfg'].includes(inside[0] ?? '') : false;
    return inside.length === 1 || ['nvram', 'memcard', 'cfg'].includes(inside[1] ?? '');
  }
  if (top === 'emulators') return true;
  return true;
}

// ---------- Empreintes ----------

export interface HashCache {
  [rel: string]: { size: number; mtimeMs: number; sha256: string };
}

export function loadHashCache(dataDir: string): HashCache {
  try {
    const raw = readJsonFile(hashCacheFile(dataDir));
    return raw && typeof raw === 'object' ? (raw as HashCache) : {};
  } catch {
    return {};
  }
}

export function saveHashCache(dataDir: string, cache: HashCache): void {
  try {
    writeFileAtomic(hashCacheFile(dataDir), JSON.stringify(cache));
  } catch {
    // Un cache perdu se refait : rien de grave.
  }
}

function cachedHash(cache: HashCache, e: Pick<ScanEntry, 'rel' | 'size' | 'mtimeMs'>): string | undefined {
  const c = cache[e.rel];
  return c && c.size === e.size && c.mtimeMs === e.mtimeMs ? c.sha256 : undefined;
}

/** SHA-256 d'un fichier, lu en flux. */
export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null); } }));
  return hash.digest('hex');
}

/** Copie `from` vers `to` en calculant l'empreinte de ce qui passe ; rend le SHA-256. */
async function copyHashing(from: string, to: string, onBytes: (n: number) => void): Promise<string> {
  const hash = createHash('sha256');
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await pipeline(
    fs.createReadStream(from),
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        onBytes(chunk.length);
        cb(null, chunk);
      },
    }),
    fs.createWriteStream(to),
  );
  return hash.digest('hex');
}

// ---------- Une sauvegarde ----------

export interface ManifestFile {
  rel: string;
  part: BackupPart;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  format: number;
  /** Version de Cyber Pinball qui l'a faite. */
  version: string;
  createdAt: string;
  level: BackupLevel;
  auto?: boolean;
  cabinet: { id: string; name: string };
  /** Toutes les parties du niveau copiées et vérifiées ; sinon, celles qui le sont (`partsDone`). */
  complete: boolean;
  partsDone: BackupPart[];
  /** Fin de la vérification de la dernière copie. */
  verifiedAt?: string;
  files: ManifestFile[];
}

export interface BackupInfo {
  /** Dossier de destination (celui qui contient objets\). */
  dest: string;
  /** Dossier de cette sauvegarde. */
  dir: string;
  manifest: BackupManifest;
  /** Taille totale des fichiers qu'elle contient. */
  bytes: number;
  /** Objets absents ou d'une autre taille dans la destination : la sauvegarde est endommagée. */
  damaged: number;
}

function objectPath(dest: string, sha: string): string {
  return path.join(dest, OBJECTS, sha.slice(0, 2), sha);
}

/** Identité de la borne (créée à la première sauvegarde), et son nom tel que les écrans le montrent. */
export function cabinetIdentity(dataDir: string, name?: string): { id: string; name: string } {
  const file = cabinetIdFile(dataDir);
  let id: string | undefined;
  try {
    const raw = readJsonFile(file) as { id?: unknown };
    if (typeof raw?.id === 'string') id = raw.id;
  } catch {
    // absente : créée ci-dessous
  }
  if (!id) {
    id = randomBytes(8).toString('hex');
    try {
      writeFileAtomic(file, JSON.stringify({ id, createdAt: new Date().toISOString() }, null, 2));
    } catch {
      // sans écriture possible, l'identité ne durera que cette fois
    }
  }
  return { id, name: name?.trim() || os.hostname() };
}

/** Nom de dossier d'une sauvegarde : « 2026-11-04 21h12 tout ». */
function backupDirName(at: Date, level: BackupLevel, auto: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}h${pad(at.getMinutes())}`;
  const word = level === 'settings' ? 'reglages' : level === 'tables' ? 'tables' : 'tout';
  return `${stamp} ${word}${auto ? ' auto' : ''}`;
}

export interface BackupProgress {
  part: BackupPart;
  /** Fichier en cours (chemin relatif). */
  current?: string;
  /** Octets traités (copiés, ou déjà dans la destination) sur le total, toutes parties. */
  doneBytes: number;
  totalBytes: number;
  /** Par partie : octets traités et total, fichiers traités et total. */
  parts: Partial<Record<BackupPart, { doneBytes: number; totalBytes: number; doneFiles: number; totalFiles: number }>>;
  /** Octets réellement écrits dans la destination. */
  writtenBytes: number;
  phase: 'scan' | 'copy' | 'done';
}

export interface BackupOptions {
  root: string;
  dataDir: string;
  /** Dossier de destination : E:\CyberPinball-Sauvegardes, ou localBackupDir(dataDir). */
  dest: string;
  level: BackupLevel;
  cabinet: { id: string; name: string };
  version: string;
  auto?: boolean;
  now?: () => Date;
  onProgress?: (p: BackupProgress) => void;
  /** Demande d'arrêt : vérifiée entre deux fichiers et pendant la copie d'un gros fichier. */
  shouldStop?: () => boolean;
  /** Taille maximale d'un fichier sur la destination (FAT32 : 4 Gio - 1) ; au-delà, la sauvegarde refuse de commencer. */
  maxFileSize?: number;
}

export type BackupOutcome =
  | { ok: true; info: BackupInfo; written: number; reused: number; files: number }
  | { ok: false; reason: 'stopped' | 'error'; error?: string; info?: BackupInfo; written: number };

export class BackupStopped extends Error {
  constructor() {
    super('stopped');
  }
}

/** Ce qu'une sauvegarde de ce niveau écrirait sur cette destination : place nécessaire et fichiers trop gros. */
export interface BackupEstimate {
  files: number;
  totalBytes: number;
  /** Octets à écrire : ce qui n'est pas déjà dans la destination (d'après les empreintes connues). */
  toWrite: number;
  /** Fichiers plus gros que la limite de la destination (FAT32). */
  tooBig: ScanEntry[];
  byPart: Partial<Record<BackupPart, { files: number; bytes: number }>>;
}

export function estimateBackup(entries: ScanEntry[], dest: string, cache: HashCache, maxFileSize?: number): BackupEstimate {
  const est: BackupEstimate = { files: entries.length, totalBytes: 0, toWrite: 0, tooBig: [], byPart: {} };
  const seen = new Set<string>();
  for (const e of entries) {
    est.totalBytes += e.size;
    const bp = (est.byPart[e.part] ??= { files: 0, bytes: 0 });
    bp.files++;
    bp.bytes += e.size;
    if (maxFileSize !== undefined && e.size > maxFileSize) est.tooBig.push(e);
    const sha = cachedHash(cache, e);
    if (sha) {
      if (seen.has(sha)) continue;
      seen.add(sha);
      if (fs.existsSync(objectPath(dest, sha))) continue;
    }
    est.toWrite += e.size;
  }
  return est;
}

/**
 * Fait une sauvegarde : chaque fichier des parties du niveau, dans l'ordre des parties ; un objet
 * déjà dans la destination n'est pas recopié ; un objet écrit est relu et comparé avant d'être
 * rangé. La liste est écrite après chaque partie (incomplète tant que tout n'est pas copié) : une
 * copie interrompue (arrêt demandé, clé retirée) garde ce qui est vérifié.
 */
export async function runBackup(opts: BackupOptions): Promise<BackupOutcome> {
  const now = opts.now ?? (() => new Date());
  const wanted = LEVEL_PARTS[opts.level];
  const progress: BackupProgress = { part: wanted[0] ?? 'cabinet', doneBytes: 0, totalBytes: 0, parts: {}, writtenBytes: 0, phase: 'scan' };
  const emit = () => opts.onProgress?.({ ...progress, parts: { ...progress.parts } });
  emit();
  const entries = await scanRoot(opts.root, wanted, opts.dataDir);
  const cache = loadHashCache(opts.dataDir);
  for (const e of entries) {
    progress.totalBytes += e.size;
    const p = (progress.parts[e.part] ??= { doneBytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: 0 });
    p.totalBytes += e.size;
    p.totalFiles++;
  }
  if (opts.maxFileSize !== undefined) {
    const big = entries.find((e) => e.size > opts.maxFileSize!);
    if (big) return { ok: false, reason: 'error', error: t('{file} est trop gros pour cette destination', { file: big.rel }), written: 0 };
  }
  progress.phase = 'copy';
  const started = now();
  const manifest: BackupManifest = {
    format: MANIFEST_FORMAT,
    version: opts.version,
    createdAt: started.toISOString(),
    level: opts.level,
    ...(opts.auto ? { auto: true } : {}),
    cabinet: opts.cabinet,
    complete: false,
    partsDone: [],
    files: [],
  };
  const dir = path.join(opts.dest, safeName(opts.cabinet.name) || 'Borne', backupDirName(started, opts.level, Boolean(opts.auto))); // i18n-ignore : nom de dossier
  const manifestFile = path.join(dir, MANIFEST_NAME);
  const tmpDir = path.join(opts.dest, OBJECTS, 'tmp');
  let written = 0;
  let reused = 0;
  let lastSave = Date.now();
  const writeManifest = () => writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 1));
  const info = (): BackupInfo => ({ dest: opts.dest, dir, manifest, bytes: manifest.files.reduce((s, f) => s + f.size, 0), damaged: 0 });
  try {
    fs.mkdirSync(dir, { recursive: true });
    writeManifest();
    for (const part of wanted) {
      progress.part = part;
      const mine = entries.filter((e) => e.part === part);
      const pp = (progress.parts[part] ??= { doneBytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: 0 });
      for (const e of mine) {
        if (opts.shouldStop?.()) throw new BackupStopped();
        progress.current = e.rel;
        emit();
        const abs = rootPath(opts.root, opts.dataDir, e.rel);
        let sha = cachedHash(cache, e);
        const count = (n: number) => {
          progress.doneBytes += n;
          pp.doneBytes += n;
        };
        if (sha && fs.existsSync(objectPath(opts.dest, sha))) {
          reused++;
          count(e.size);
        } else {
          // Copie vers un temporaire de la destination en calculant l'empreinte, relecture, puis rangement.
          const tmp = path.join(tmpDir, `${process.pid}-${randomBytes(6).toString('hex')}`);
          try {
            let copied = 0;
            sha = await copyHashing(abs, tmp, (n) => {
              copied += n;
              count(n);
              progress.writtenBytes += n;
              if (opts.shouldStop?.()) throw new BackupStopped();
            });
            // Fichier modifié pendant la copie (taille différente) : son empreinte ne vaut rien.
            if (copied !== e.size) {
              const st = await fs.promises.stat(abs);
              e.size = st.size;
              e.mtimeMs = Math.floor(st.mtimeMs);
            }
            const target = objectPath(opts.dest, sha);
            if (fs.existsSync(target)) {
              reused++;
            } else {
              const check = await sha256OfFile(tmp);
              if (check !== sha) throw new Error(t('{file} : la copie relue ne correspond pas à l’original', { file: e.rel }));
              await fs.promises.mkdir(path.dirname(target), { recursive: true });
              await renameWithRetryAsync(tmp, target);
              written += e.size;
            }
          } finally {
            await fs.promises.rm(tmp, { force: true });
          }
          cache[e.rel] = { size: e.size, mtimeMs: e.mtimeMs, sha256: sha };
        }
        manifest.files.push({ rel: e.rel, part, size: e.size, sha256: sha });
        pp.doneFiles++;
        if (Date.now() - lastSave > 5000) {
          writeManifest();
          lastSave = Date.now();
        }
      }
      manifest.partsDone.push(part);
      writeManifest();
    }
    manifest.complete = true;
    manifest.verifiedAt = now().toISOString();
    writeManifest();
    progress.phase = 'done';
    progress.current = undefined;
    emit();
    return { ok: true, info: info(), written, reused, files: manifest.files.length };
  } catch (error) {
    try {
      writeManifest();
    } catch {
      // destination disparue (clé retirée) : la liste partielle reste celle du dernier enregistrement
    }
    if (error instanceof BackupStopped) return { ok: false, reason: 'stopped', info: info(), written };
    return { ok: false, reason: 'error', error: (error as Error).message, info: info(), written };
  } finally {
    saveHashCache(opts.dataDir, cache);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------- Les sauvegardes d'une destination ----------

function readManifest(file: string): BackupManifest | undefined {
  try {
    const m = readJsonFile(file) as BackupManifest;
    if (!m || m.format !== MANIFEST_FORMAT || !Array.isArray(m.files) || !m.cabinet?.id) return undefined;
    return m;
  } catch {
    return undefined;
  }
}

/**
 * Sauvegardes d'une destination, la plus récente d'abord. `check` : contrôle que chaque objet est
 * là avec sa taille (une clé abîmée, un objet effacé à la main) ; sans lui, la liste seule.
 */
export function listBackups(dest: string, check = true): BackupInfo[] {
  const out: BackupInfo[] = [];
  let cabinets: fs.Dirent[];
  try {
    cabinets = fs.readdirSync(dest, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const c of cabinets) {
    if (!c.isDirectory() || c.name === OBJECTS) continue;
    let runs: fs.Dirent[];
    try {
      runs = fs.readdirSync(path.join(dest, c.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const r of runs) {
      if (!r.isDirectory()) continue;
      const dir = path.join(dest, c.name, r.name);
      const manifest = readManifest(path.join(dir, MANIFEST_NAME));
      if (!manifest) continue;
      let damaged = 0;
      if (check) {
        for (const f of manifest.files) {
          try {
            if (fs.statSync(objectPath(dest, f.sha256)).size !== f.size) damaged++;
          } catch {
            damaged++;
          }
        }
      }
      out.push({ dest, dir, manifest, bytes: manifest.files.reduce((s, f) => s + f.size, 0), damaged });
    }
  }
  return out.sort((a, b) => (a.manifest.createdAt < b.manifest.createdAt ? 1 : -1));
}

/**
 * Range une destination : les sauvegardes automatiques au-delà des `keepAuto` plus récentes de cette
 * borne, et les sauvegardes incomplètes plus anciennes qu'une complète du même niveau, sont
 * retirées ; puis les objets que plus aucune sauvegarde ne cite. Les sauvegardes faites à la main
 * et celles des autres bornes ne sont jamais touchées.
 */
export function pruneBackups(dest: string, cabinetId: string, keepAuto = 10): { removed: number; freed: number } {
  const all = listBackups(dest, false);
  const mine = all.filter((b) => b.manifest.cabinet.id === cabinetId);
  const drop = new Set<BackupInfo>();
  mine.filter((b) => b.manifest.auto && b.manifest.complete).slice(keepAuto).forEach((b) => drop.add(b));
  for (const b of mine.filter((x) => !x.manifest.complete)) {
    const newer = mine.find((x) => x.manifest.complete && x.manifest.createdAt > b.manifest.createdAt && LEVEL_PARTS[x.manifest.level].length >= LEVEL_PARTS[b.manifest.level].length);
    if (newer) drop.add(b);
  }
  for (const b of drop) fs.rmSync(b.dir, { recursive: true, force: true });
  const keep = new Set(all.filter((b) => !drop.has(b)).flatMap((b) => b.manifest.files.map((f) => f.sha256)));
  let freed = 0;
  const objects = path.join(dest, OBJECTS);
  let prefixes: string[] = [];
  try {
    prefixes = fs.readdirSync(objects);
  } catch {
    // aucun objet
  }
  for (const p of prefixes) {
    if (p === 'tmp') continue;
    const sub = path.join(objects, p);
    let names: string[] = [];
    try {
      names = fs.readdirSync(sub);
    } catch {
      continue;
    }
    for (const n of names) {
      if (keep.has(n)) continue;
      try {
        freed += fs.statSync(path.join(sub, n)).size;
        fs.rmSync(path.join(sub, n), { force: true });
      } catch {
        // objet occupé : il partira la prochaine fois
      }
    }
  }
  return { removed: drop.size, freed };
}

// ---------- Restaurer ----------

/** Une sauvegarde est-elle celle de cette borne ? Une installation neuve (aucun modèle de borne) accueille la sienne comme telle. */
export function isSameCabinet(manifest: BackupManifest, dataDir: string): boolean {
  try {
    const raw = readJsonFile(cabinetIdFile(dataDir)) as { id?: string };
    if (raw?.id) return raw.id === manifest.cabinet.id;
  } catch {
    // sans identité : installation neuve si aucun modèle de borne
  }
  return !fs.existsSync(path.join(dataDir, 'cabinet.json'));
}

export interface PartPlan {
  part: BackupPart;
  /** Fichiers remplacés (différents ici), ajoutés (absents ici), identiques. */
  replace: number;
  add: number;
  same: number;
  /** Fichiers ignorés : ceux d'une table absente ici, quand les tables ne sont pas restaurées. */
  skipped: number;
  /** Octets à copier (remplacés et ajoutés). */
  bytes: number;
  /** Tables concernées (dossier de tables\) : remplacées ou ajoutées. */
  tables: string[];
}

export interface RestorePlan {
  backup: BackupInfo;
  parts: PartPlan[];
  /** Fichiers à copier : rel, objet source, taille, empreinte. */
  files: ManifestFile[];
  bytes: number;
}

/** Dossier de table d'un chemin relatif (« tables/Medieval Madness/… » → « Medieval Madness »). */
function tableOf(rel: string): string | undefined {
  const parts = rel.split('/');
  return parts[0] === 'tables' && parts.length > 2 ? parts[1] : undefined;
}

/**
 * Ce que la restauration de ces parties ferait ici, sans rien écrire : pour chaque fichier, remplacé,
 * ajouté ou identique (même taille et même empreinte). Hors restauration des tables, les fichiers
 * d'une table absente ici sont ignorés (ses réglages, ses scores attendraient une table qui n'existe pas).
 */
export async function planRestore(backup: BackupInfo, root: string, dataDir: string, parts: Iterable<BackupPart>): Promise<RestorePlan> {
  const wanted = new Set(parts);
  const cache = loadHashCache(dataDir);
  const plans = new Map<BackupPart, PartPlan>();
  const files: ManifestFile[] = [];
  for (const part of BACKUP_PARTS) {
    if (wanted.has(part) && backup.manifest.files.some((f) => f.part === part)) plans.set(part, { part, replace: 0, add: 0, same: 0, skipped: 0, bytes: 0, tables: [] });
  }
  const tablesThere = wanted.has('tables');
  for (const f of backup.manifest.files) {
    const plan = plans.get(f.part);
    if (!plan) continue;
    const table = tableOf(f.rel);
    if (table && !tablesThere && !fs.existsSync(path.join(root, 'tables', table))) {
      plan.skipped++;
      continue;
    }
    const abs = rootPath(root, dataDir, f.rel);
    let st: fs.Stats | undefined;
    try {
      st = await fs.promises.stat(abs);
    } catch {
      st = undefined;
    }
    if (!st) {
      plan.add++;
    } else {
      let same = st.size === f.size;
      if (same) {
        const known = cachedHash(cache, { rel: f.rel, size: st.size, mtimeMs: Math.floor(st.mtimeMs) });
        const sha = known ?? (await sha256OfFile(abs));
        if (!known) cache[f.rel] = { size: st.size, mtimeMs: Math.floor(st.mtimeMs), sha256: sha };
        same = sha === f.sha256;
      }
      if (same) {
        plan.same++;
        continue;
      }
      plan.replace++;
    }
    plan.bytes += f.size;
    if (table && !plan.tables.includes(table)) plan.tables.push(table);
    files.push(f);
  }
  saveHashCache(dataDir, cache);
  const list = [...plans.values()];
  return { backup, parts: list, files, bytes: list.reduce((s, p) => s + p.bytes, 0) };
}

/** Restauration préparée : ce que applyPendingRestore posera au démarrage. */
export interface PendingRestore {
  kind: 'restore' | 'undo';
  createdAt: string;
  /** Ce qui est restauré, pour l'écran d'après : sauvegarde (date, niveau, borne) et parties. */
  label: { createdAt: string; level: BackupLevel; cabinet: string; parts: BackupPart[] };
  /** put : poser `source` (dans le dossier de la restauration, ou la corbeille pour une annulation) ; remove : retirer. */
  items: { rel: string; action: 'put' | 'remove'; source?: string; size?: number }[];
  /**
   * Nouvel essai : les fichiers qui n'ont pas pu être posés au démarrage (encore ouverts par
   * l'ancien processus, une vidéo en lecture), avec la corbeille de la première pose et le nombre d'essais.
   */
  retry?: { trashDir: string; attempts: number };
}

/** Essais de pose d'un fichier occupé : au démarrage, puis deux fois une fois l'ancien processus fermé. */
export const RESTORE_ATTEMPTS = 3;

export interface RestoreProgress {
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
  current?: string;
}

/**
 * Premier temps d'une restauration, l'application en marche : chaque fichier du plan est copié
 * depuis la destination dans <racine>\data\restauration\, son empreinte comparée à celle de la
 * sauvegarde. Rien de la racine n'est touché ; arrêtée, la préparation s'efface. Il reste à
 * redémarrer : applyPendingRestore pose les fichiers.
 */
export async function prepareRestore(plan: RestorePlan, dataDir: string, opts: { now?: () => Date; onProgress?: (p: RestoreProgress) => void; shouldStop?: () => boolean } = {}): Promise<{ ok: true } | { ok: false; reason: 'stopped' | 'error'; error?: string }> {
  const now = opts.now ?? (() => new Date());
  const dir = pendingRestoreDir(dataDir);
  fs.rmSync(dir, { recursive: true, force: true });
  const filesDir = path.join(dir, 'fichiers');
  const progress: RestoreProgress = { doneBytes: 0, totalBytes: plan.bytes, doneFiles: 0, totalFiles: plan.files.length };
  const pending: PendingRestore = {
    kind: 'restore',
    createdAt: now().toISOString(),
    label: { createdAt: plan.backup.manifest.createdAt, level: plan.backup.manifest.level, cabinet: plan.backup.manifest.cabinet.name, parts: plan.parts.map((p) => p.part) },
    items: [],
  };
  try {
    fs.mkdirSync(filesDir, { recursive: true });
    const done = new Map<string, string>();
    for (const f of plan.files) {
      if (opts.shouldStop?.()) throw new BackupStopped();
      progress.current = f.rel;
      opts.onProgress?.({ ...progress });
      const staged = path.join(filesDir, String(pending.items.length));
      const again = done.get(f.sha256);
      if (again) {
        // Même contenu qu'un fichier déjà préparé (une ROM liée dans plusieurs tables) : une copie de plus, sans relire la clé.
        await fs.promises.copyFile(again, staged);
        progress.doneBytes += f.size;
      } else {
        const sha = await copyHashing(objectPath(plan.backup.dest, f.sha256), staged, (n) => {
          progress.doneBytes += n;
          if (opts.shouldStop?.()) throw new BackupStopped();
        });
        if (sha !== f.sha256) throw new Error(t('{file} : la sauvegarde est abîmée (empreinte différente)', { file: f.rel }));
        done.set(f.sha256, staged);
      }
      pending.items.push({ rel: f.rel, action: 'put', source: staged, size: f.size });
      progress.doneFiles++;
    }
    progress.current = undefined;
    opts.onProgress?.({ ...progress });
    writeFileAtomic(path.join(dir, 'plan.json'), JSON.stringify(pending, null, 1));
    return { ok: true };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (error instanceof BackupStopped) return { ok: false, reason: 'stopped' };
    return { ok: false, reason: 'error', error: (error as Error).message };
  }
}

/** Restauration préparée, en attente du redémarrage. */
export function loadPendingRestore(dataDir: string): PendingRestore | undefined {
  try {
    const p = readJsonFile(path.join(pendingRestoreDir(dataDir), 'plan.json')) as PendingRestore;
    return p && Array.isArray(p.items) ? p : undefined;
  } catch {
    return undefined;
  }
}

export function cancelPendingRestore(dataDir: string): void {
  fs.rmSync(pendingRestoreDir(dataDir), { recursive: true, force: true });
}

/** Dernière restauration appliquée (ou annulation), pour l'écran d'après et « Annuler cette restauration ». */
export interface AppliedRestore {
  kind: 'restore' | 'undo';
  appliedAt: string;
  /** Préparation d'où vient cette pose (createdAt de la restauration préparée) : un nouvel essai s'y ajoute. */
  planAt?: string;
  label: PendingRestore['label'];
  /** Dossier de la corbeille où l'état d'avant a été mis. */
  trashDir: string;
  /** Fichiers posés (rel), et ceux qui existaient avant (mis à la corbeille, à leur chemin relatif). */
  put: string[];
  setAside: string[];
  /** Fichiers qui n'ont pas pu être posés (occupés, disque plein) : leur ancienne version est restée. */
  failed: { rel: string; error: string }[];
  /** L'écran de fin l'a montré. */
  shown?: boolean;
}

export function loadLastRestore(dataDir: string): AppliedRestore | undefined {
  try {
    const r = readJsonFile(lastRestoreFile(dataDir)) as AppliedRestore;
    return r && Array.isArray(r.put) ? r : undefined;
  } catch {
    return undefined;
  }
}

export function markLastRestoreShown(dataDir: string): void {
  const r = loadLastRestore(dataDir);
  if (r && !r.shown) writeFileAtomic(lastRestoreFile(dataDir), JSON.stringify({ ...r, shown: true }, null, 1));
}

/** « Annuler cette restauration » est possible : l'état d'avant est encore dans la corbeille. */
export function canUndoLastRestore(dataDir: string): boolean {
  const r = loadLastRestore(dataDir);
  return Boolean(r && r.kind === 'restore' && fs.existsSync(r.trashDir));
}

/**
 * Second temps, au démarrage, avant que quoi que ce soit ne lise la racine : chaque fichier actuel
 * part à la corbeille (« <date> Avant restauration »), le fichier préparé prend sa place (renommage,
 * même disque). Un fichier qui ne peut être posé garde son ancienne version et est noté. Rien à
 * faire : undefined. Reprise après une coupure : les fichiers déjà posés ne sont plus dans le
 * dossier de préparation, ils sont sautés.
 */
export function applyPendingRestore(root: string, dataDir: string, trashRoot: string, now = new Date()): AppliedRestore | undefined {
  const pending = loadPendingRestore(dataDir);
  if (!pending) return undefined;
  const trashDir = pending.retry?.trashDir ?? trashDirFor(trashRoot, pending.kind === 'undo' ? t('Avant annulation de la restauration') : t('Avant restauration'), now);
  const previous = pending.retry ? loadLastRestore(dataDir) : undefined;
  const applied: AppliedRestore =
    previous && previous.planAt === pending.createdAt
      ? { ...previous, put: [...previous.put], setAside: [...previous.setAside], failed: [] }
      : { kind: pending.kind, appliedAt: now.toISOString(), planAt: pending.createdAt, label: pending.label, trashDir, put: [], setAside: [], failed: [] };
  const again: PendingRestore['items'] = [];
  for (const item of pending.items) {
    const target = rootPath(root, dataDir, item.rel);
    const aside = path.join(trashDir, ...item.rel.split('/'));
    if (item.action === 'put' && (!item.source || !fs.existsSync(item.source))) continue;
    let movedAside = false;
    try {
      if (fs.existsSync(target)) {
        movePath(target, aside);
        movedAside = true;
      }
      if (item.action === 'put' && item.source) {
        if (pending.kind === 'undo') {
          // La corbeille d'avant reste entière (une seconde annulation la relirait) : copie.
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(item.source, target);
        } else {
          movePath(item.source, target);
        }
        applied.put.push(item.rel);
      }
      if (movedAside) applied.setAside.push(item.rel);
    } catch (error) {
      // Le fichier actuel revient à sa place : rien ne manque, il reste l'ancienne version.
      if (movedAside && !fs.existsSync(target)) {
        try {
          movePath(aside, target);
        } catch {
          // il reste dans la corbeille, à son chemin : « Annuler » le retrouvera
          applied.setAside.push(item.rel);
        }
      }
      applied.failed.push({ rel: item.rel, error: (error as Error).message });
      again.push(item);
    }
  }
  writeFileAtomic(lastRestoreFile(dataDir), JSON.stringify(applied, null, 1));
  const attempts = (pending.retry?.attempts ?? 0) + 1;
  if (again.length && attempts < RESTORE_ATTEMPTS) {
    writeFileAtomic(path.join(pendingRestoreDir(dataDir), 'plan.json'), JSON.stringify({ ...pending, items: again, retry: { trashDir, attempts } }, null, 1));
  } else {
    fs.rmSync(pendingRestoreDir(dataDir), { recursive: true, force: true });
  }
  return applied;
}

/**
 * Prépare l'annulation de la dernière restauration : ce qu'elle a posé est retiré, ce qu'elle a
 * mis à la corbeille revient. Appliquée au démarrage suivant, comme une restauration.
 */
export function prepareUndoLastRestore(dataDir: string, now = new Date()): boolean {
  const last = loadLastRestore(dataDir);
  if (!last || last.kind !== 'restore' || !fs.existsSync(last.trashDir)) return false;
  const back = new Set(last.setAside);
  const items: PendingRestore['items'] = [
    ...last.setAside.map((rel) => ({ rel, action: 'put' as const, source: path.join(last.trashDir, ...rel.split('/')) })),
    ...last.put.filter((rel) => !back.has(rel)).map((rel) => ({ rel, action: 'remove' as const })),
  ];
  const pending: PendingRestore = { kind: 'undo', createdAt: now.toISOString(), label: last.label, items };
  writeFileAtomic(path.join(pendingRestoreDir(dataDir), 'plan.json'), JSON.stringify(pending, null, 1));
  return true;
}

// ---------- Destination et sauvegarde automatique ----------

export type AutoBackup = 'off' | 'daily' | 'weekly';
/**
 * Moment d'une sauvegarde automatique : dès que possible (la première fois que la borne est libre
 * dans la journée ou la semaine : une borne n'est pas allumée toute la journée), ou à heure fixe
 * (une heure manquée, PC éteint, est rattrapée dès que possible).
 */
export type AutoMoment = 'asap' | 'fixed';

export interface BackupSettings {
  /**
   * Dossier de destination choisi (E:\Sauvegardes\CyberPinball-Sauvegardes), et ce qui permet de
   * reconnaître la clé si sa lettre change. `folder` : le dossier choisi sur ce lecteur, depuis sa
   * racine (« Sauvegardes\Borne ») ; absent, la racine du lecteur. Le dossier des sauvegardes est
   * toujours créé dedans.
   */
  destination?: { path: string; label?: string; serial?: string; folder?: string };
  auto: AutoBackup;
  /** Absent : dès que possible. */
  moment?: AutoMoment;
  /** Heure fixe (0 à 23) ; absente : AUTO_BACKUP_HOUR. */
  hour?: number;
  /** Jour de l'heure fixe d'une sauvegarde hebdomadaire (0 : dimanche) ; absent : dimanche. */
  weekday?: number;
  /**
   * Quand la programmation a été choisie : une heure fixe passée avant n'est pas « manquée » (le
   * dimanche 4 h choisi un mercredi attend dimanche). Dès que possible, la première se fait aussitôt.
   */
  autoSince?: string;
  /** Copier aussi la dernière sauvegarde automatique sur la destination quand elle est là. */
  copyToDestination: boolean;
  /** Dernière sauvegarde automatique réussie (sur la borne), dernière copie sur la destination. */
  lastAuto?: string;
  lastCopy?: string;
  /** Dernière sauvegarde réussie, à la main ou automatique : date, niveau, où. */
  last?: { at: string; level: BackupLevel; where: string };
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { auto: 'off', copyToDestination: true };

export function loadBackupSettings(dataDir: string): BackupSettings {
  try {
    const raw = readJsonFile(backupSettingsFile(dataDir)) as Partial<BackupSettings>;
    // « nightly » : nom de la préversion 0.1.7-essai.1, une sauvegarde chaque nuit à 4 h.
    const legacy = (raw?.auto as string | undefined) === 'nightly';
    const auto: AutoBackup = raw?.auto === 'weekly' || raw?.auto === 'daily' ? raw.auto : legacy ? 'daily' : 'off';
    const out: BackupSettings = { ...DEFAULT_BACKUP_SETTINGS, ...raw, auto, copyToDestination: raw?.copyToDestination !== false };
    out.moment = raw?.moment === 'fixed' || raw?.moment === 'asap' ? raw.moment : legacy ? 'fixed' : 'asap';
    if (!(Number.isInteger(raw?.hour) && raw!.hour! >= 0 && raw!.hour! < 24)) delete out.hour;
    if (!(Number.isInteger(raw?.weekday) && raw!.weekday! >= 0 && raw!.weekday! < 7)) delete out.weekday;
    return out;
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS };
  }
}

export function saveBackupSettings(dataDir: string, settings: BackupSettings): void {
  writeFileAtomic(backupSettingsFile(dataDir), JSON.stringify(settings, null, 2));
}

/** Heure fixe proposée d'abord : 4 h du matin, le dimanche pour l'hebdomadaire. */
export const AUTO_BACKUP_HOUR = 4;
/** Jour de l'heure fixe hebdomadaire par défaut : dimanche. */
export const AUTO_BACKUP_WEEKDAY = 0;
/** Une semaine « dès que possible » commence le lundi à 0 h. */
const WEEK_START = 1;

type Schedule = Pick<BackupSettings, 'auto' | 'moment' | 'hour' | 'weekday'>;

export const autoHour = (s: Schedule) => s.hour ?? AUTO_BACKUP_HOUR;
export const autoWeekday = (s: Schedule) => s.weekday ?? AUTO_BACKUP_WEEKDAY;

/**
 * Dernière échéance passée de la sauvegarde automatique, à `now`. Dès que possible : le début du
 * jour (0 h) ou de la semaine (lundi 0 h). À heure fixe : la dernière heure choisie passée (le jour
 * choisi pour l'hebdomadaire). Une sauvegarde est due si la dernière réussie est plus ancienne :
 * pas encore faite dans la période, ou heure manquée (PC éteint), elle se fait dès que la borne est
 * libre.
 */
export function lastAutoSlot(s: Schedule, now: Date): Date | undefined {
  if (s.auto === 'off') return undefined;
  const slot = new Date(now);
  const fixed = s.moment === 'fixed';
  slot.setHours(fixed ? autoHour(s) : 0, 0, 0, 0);
  if (slot > now) slot.setDate(slot.getDate() - 1);
  const day = fixed ? autoWeekday(s) : WEEK_START;
  if (s.auto === 'weekly') while (slot.getDay() !== day) slot.setDate(slot.getDate() - 1);
  return slot;
}

/** Échéance suivante, après `now` (ce que l'écran annonce une fois la sauvegarde de la période faite). */
export function nextAutoSlot(s: Schedule, now: Date): Date | undefined {
  const last = lastAutoSlot(s, now);
  if (!last) return undefined;
  const next = new Date(last);
  next.setDate(next.getDate() + (s.auto === 'weekly' ? 7 : 1));
  return next;
}

export function autoBackupDue(settings: BackupSettings, now: Date): boolean {
  const slot = lastAutoSlot(settings, now);
  if (!slot) return false;
  if (settings.moment === 'fixed' && settings.autoSince && slot < new Date(settings.autoSince)) return false;
  return !settings.lastAuto || new Date(settings.lastAuto) < slot;
}

/** Même dossier (une destination choisie qui serait celle de la borne). */
export function isLocalDestination(dest: string, dataDir: string): boolean {
  return samePath(dest, localBackupDir(dataDir));
}
