// Ce qui compose une table, d'après l'organisation officielle « un dossier par
// table » de VPX 10.8.1 (docs/FileLayout.md) : où chaque sorte de fichier doit
// se trouver dans le dossier de la table, et ce qui est présent dans un dossier.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { findPackRoot, isJunkName } from './puppack';

export type FileKind =
  | 'table'
  | 'backglass'
  | 'rom'
  | 'nvram'
  | 'pinmame'
  | 'pup'
  | 'serum'
  | 'vni'
  | 'altsound'
  | 'music'
  | 'tableIni'
  | 'pov'
  | 'scriptOverride'
  | 'script'
  | 'info'
  | 'media'
  | 'dmdFolder'
  | 'user'
  | 'doc'
  | 'other'
  | 'ignored';

export const KIND_LABELS: Record<FileKind, string> = {
  get table() {
    return t('Table VPX');
  },
  backglass: 'Backglass',
  rom: 'ROM',
  get nvram() {
    return t('Sauvegarde PinMAME');
  },
  get pinmame() {
    return t('Réglages PinMAME');
  },
  get pup() {
    return t('Vidéos PuP');
  },
  get serum() {
    return t('Couleurs DMD (Serum)');
  },
  get vni() {
    return t('Couleurs DMD (VNI)');
  },
  get altsound() {
    return t('Sons alternatifs');
  },
  get music() {
    return t('Musique');
  },
  get tableIni() {
    return t('Réglages de la table');
  },
  get pov() {
    return t('Point de vue');
  },
  get scriptOverride() {
    return t('Script de remplacement');
  },
  get script() {
    return t('Script complémentaire');
  },
  get info() {
    return t('Informations');
  },
  get media() {
    return t('Médias du frontend');
  },
  get dmdFolder() {
    return t('Contenu FlexDMD / UltraDMD');
  },
  get user() {
    return t('Données enregistrées');
  },
  get doc() {
    return t('Documentation');
  },
  get other() {
    return t('Autre fichier');
  },
  get ignored() {
    return t('Ignoré');
  },
};

const DOC_EXT = new Set(['.txt', '.pdf', '.md', '.rtf', '.doc', '.docx', '.htm', '.html', '.url']);
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.flac']);
const SERUM_EXT = new Set(['.crz', '.crom', '.cromc']);
const VNI_EXT = new Set(['.vni', '.pal', '.pac']);
const DMD_ASSET_EXT = new Set(['.fnt', '.png', '.gif', '.apng', '.bmp', '.jpg']);
export const ARCHIVE_EXT = new Set(['.zip', '.7z', '.rar']);
const IGNORED_FILES = new Set(['crash.txt', 'crash.dmp', 'thumbs.db', 'desktop.ini', '.ds_store']);
const IGNORED_DIRS = new Set(['cache', '__macosx', '.git']);

/** Extensions qui montrent qu'une archive est un paquet de table et non une ROM. */
const PACK_EXT = new Set([
  '.vpx', '.directb2s', '.vbs', '.ini', '.pov', '.info', '.mp4', '.avi', '.f4v', '.png', '.jpg', '.apng', '.gif',
  '.crz', '.crom', '.cromc', '.vni', '.pal', '.pac', '.mp3', '.ogg', '.wav', '.csv', '.pup', '.pdf', '.zip', '.7z', '.rar',
]);

/**
 * Une archive .zip est-elle une ROM (à ranger telle quelle dans pinmame\roms) ou
 * un paquet à déballer ? Une ROM ne contient que des fichiers de puces, sans dossier.
 */
export function classifyArchive(name: string, entries: string[]): 'rom' | 'pack' {
  if (path.extname(name).toLowerCase() !== '.zip') return 'pack';
  for (const raw of entries) {
    const entry = raw.replace(/\\/g, '/');
    if (entry.endsWith('/') || entry.slice(0, -1).includes('/')) return 'pack';
    if (PACK_EXT.has(path.extname(entry).toLowerCase())) return 'pack';
  }
  return 'rom';
}

/** Comparaison de noms insensible à la casse, aux espaces et à la ponctuation. */
export function nameKey(name: string): string {
  return name
    .replace(/^\d{6,}_/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Ce qu'il y a dans le dossier d'une table, pour la fiche. */
export interface TableInventory {
  versions: string[];
  /** Backglass que VPX chargera pour ce fichier (nommé comme la table ou comme le dossier). */
  backglass?: string;
  /** Autres .directb2s présents mais que VPX ne chargera pas. */
  strayBackglasses: string[];
  roms: string[];
  pup: string[];
  serum: string[];
  vni: string[];
  altsound: string[];
  music: number;
  tableIni: boolean;
  scriptOverride: boolean;
  medias: number;
  crashReports: string[];
}

export function inventory(tableFile: string, ownFolder: boolean): TableInventory {
  const folder = path.dirname(tableFile);
  const base = path.basename(tableFile).replace(/\.vpx$/i, '');
  const files = listSafe(folder);
  const lower = (f: string) => f.toLowerCase();
  const b2s = files.filter((f) => lower(f).endsWith('.directb2s'));
  const backglass = companion(folder, base, ownFolder, '.directb2s');
  return {
    versions: files.filter((f) => lower(f).endsWith('.vpx')),
    backglass: backglass ? path.basename(backglass) : undefined,
    strayBackglasses: ownFolder ? b2s.filter((f) => !backglass || lower(f) !== lower(path.basename(backglass))) : [],
    roms: ownFolder ? listSafe(path.join(folder, 'pinmame', 'roms')).filter((f) => lower(f).endsWith('.zip')) : [],
    pup: ownFolder ? listDirs(path.join(folder, 'pupvideos')) : [],
    serum: ownFolder ? listDirs(path.join(folder, 'serum')) : [],
    vni: ownFolder ? listDirs(path.join(folder, 'vni')) : [],
    altsound: ownFolder ? listDirs(path.join(folder, 'altsound')) : [],
    music: ownFolder ? countFiles(path.join(folder, 'music')) : 0,
    tableIni: fs.existsSync(path.join(folder, `${base}.ini`)),
    scriptOverride: fs.existsSync(path.join(folder, `${base}.vbs`)),
    medias: ownFolder ? countFiles(path.join(folder, 'medias')) : 0,
    crashReports: ownFolder ? files.filter((f) => ['crash.txt', 'crash.dmp'].includes(lower(f))) : [],
  };
}

/**
 * Fichier compagnon tel que VPX le cherche : d'abord nommé comme la table,
 * puis comme le dossier qui la contient.
 */
export function companion(folder: string, tableBase: string, ownFolder: boolean, ext: string): string | undefined {
  const candidates = [`${tableBase}${ext}`];
  if (ownFolder) candidates.push(`${path.basename(folder)}${ext}`);
  const files = listSafe(folder);
  for (const wanted of candidates) {
    const found = files.find((f) => f.toLowerCase() === wanted.toLowerCase());
    if (found) return path.join(folder, found);
  }
  return undefined;
}

/** Sorte d'un fichier isolé, d'après son nom et le dossier qui le contient. */
export function classifyFile(name: string, parents: string[] = []): FileKind {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);
  const parent = (parents.at(-1) ?? '').toLowerCase();
  const inside = (dir: string) => parents.some((p) => p.toLowerCase() === dir);
  if (IGNORED_FILES.has(lower) || lower.endsWith('.tmp') || isJunkName(lower)) return 'ignored';
  if (ext === '.vpx') return 'table';
  if (ext === '.directb2s') return 'backglass';
  if (ext === '.zip') return 'rom';
  if (ext === '.nv') return 'nvram';
  if (inside('pinmame')) return 'pinmame';
  if (SERUM_EXT.has(ext)) return 'serum';
  if (VNI_EXT.has(ext)) return 'vni';
  if (ext === '.vbs') return 'script';
  if (ext === '.ini') return 'tableIni';
  if (ext === '.pov') return 'pov';
  if (ext === '.info') return 'info';
  if (inside('medias')) return 'media';
  if (AUDIO_EXT.has(ext) || parent === 'music') return 'music';
  if (DOC_EXT.has(ext)) return 'doc';
  return 'other';
}

/**
 * Sorte d'un dossier qu'on range d'un seul bloc, ou undefined s'il faut regarder dedans.
 * dmdFolders : dossiers DMD que les scripts des tables chargent (ProjectFolder).
 */
export function classifyDir(name: string, dir: string, parents: string[] = [], dmdFolders: string[] = []): FileKind | undefined {
  const lower = name.toLowerCase();
  const parent = (parents.at(-1) ?? '').toLowerCase();
  if (IGNORED_DIRS.has(lower)) return 'ignored';
  if (parent === 'pupvideos') return 'pup';
  if (parent === 'altsound') return 'altsound';
  if (parent === 'serum') return 'serum';
  if (parent === 'vni') return 'vni';
  if (lower === 'music') return 'music';
  if (lower === 'medias') return 'media';
  if (lower === 'scripts') return 'script';
  if (lower === 'user') return 'user';
  if (lower.endsWith('.ultradmd') || lower.endsWith('.flexdmd')) return 'dmdFolder';
  if (dmdFolders.some((d) => d.toLowerCase() === lower)) return 'dmdFolder';
  const files = listSafe(dir).map((f) => f.toLowerCase());
  // Dossier FlexDMD sans extension (« TheGooniesDMD ») : images et polices bitmap.
  if (lower.endsWith('dmd') && files.some((f) => DMD_ASSET_EXT.has(path.extname(f)))) return 'dmdFolder';
  // PuP-Pack : .pup à la racine, options seules, ou pack imbriqué (« rom\rom »).
  if (findPackRoot(dir, 2)) return 'pup';
  if (files.some((f) => ['altsound.csv', 'g-sound.csv'].includes(f))) return 'altsound';
  return undefined;
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function countFiles(dir: string): number {
  try {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).length;
  } catch {
    return 0;
  }
}
