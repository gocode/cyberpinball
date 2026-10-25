// Sélecteur de fichiers de Cyber Pinball, à la place de la boîte de dialogue de Windows :
// emplacements (téléchargements de Cyber Pinball, Téléchargements de Windows, dossier
// d'import, Bureau, clés USB et disques), dossiers parcourus aux boutons de la borne,
// filtrés sur ce que l'écran attend. Ici le cœur : emplacements, filtres, contenu d'un
// dossier, remontée ; l'écran est dans app/src/file-picker.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { downloadKind, type DownloadKind } from './downloads';
import { formatSize } from './fileops';
import { t, tn } from './i18n';
import type { IconName } from './icons';

/** Ce qu'un écran attend : des extensions (sans point, en minuscules), ou un dossier. */
export interface PickFilter {
  /** « Tables, frontons, ROM, archives » */
  label: string;
  /** Extensions acceptées ; vide : tous les fichiers. */
  extensions: string[];
}

/** Fichiers d'une table : ceux que l'ajout sait ranger. */
export const TABLE_EXTENSIONS = ['vpx', 'directb2s', 'zip', '7z', 'rar', 'vbs', 'ini', 'pov', 'info', 'crz', 'cromc', 'vni', 'pal', 'pac', 'mp3', 'ogg', 'wav'];
/** Médias que l'ajout range aussi (logos, vidéos, images). */
export const MEDIA_EXTENSIONS = ['png', 'apng', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'm4v', 'mp3', 'ogg', 'm4a', 'flac', 'wav'];

export function tableFilter(): PickFilter {
  return { label: t('Tables, frontons, ROM, médias, archives'), extensions: [...new Set([...TABLE_EXTENSIONS, ...MEDIA_EXTENSIONS])] };
}

/** Le fichier convient-il au filtre (sans filtre, ou filtre vide : tout convient) ? */
export function matchesFilter(name: string, filter: PickFilter | undefined): boolean {
  if (!filter || !filter.extensions.length) return true;
  const ext = path.extname(name).slice(1).toLowerCase();
  return filter.extensions.includes(ext);
}

/** « .vpx, .directb2s, .zip… » : les premières extensions, pour le dire. */
export function filterExtensions(filter: PickFilter, max = 6): string {
  const shown = filter.extensions.slice(0, max).map((e) => `.${e}`);
  return filter.extensions.length > max ? `${shown.join(', ')}…` : shown.join(', ');
}

/** Lecteur de ce PC (Win32_LogicalDisk). */
export interface DriveInfo {
  /** « E: » */
  letter: string;
  /** Nom du volume : « KINGSTON ». */
  name?: string;
  type: 'usb' | 'fixed' | 'cd' | 'network';
  free?: number;
  size?: number;
  /** Dossier qui le représente (essais : un dossier du bac à sable) ; sinon « E:\ ». */
  path?: string;
}

/**
 * Lecteurs lus dans la sortie JSON de Get-CimInstance Win32_LogicalDisk (un objet seul
 * ou un tableau) : DriveType 2 amovible, 3 disque, 4 réseau, 5 CD. Les lecteurs vides
 * (lecteur de cartes sans carte : taille absente) sont ignorés.
 */
export function parseDrives(raw: unknown): DriveInfo[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: DriveInfo[] = [];
  for (const d of list as Record<string, unknown>[]) {
    const letter = typeof d.DeviceID === 'string' ? d.DeviceID.toUpperCase() : '';
    if (!/^[A-Z]:$/.test(letter)) continue;
    const type = ({ 2: 'usb', 3: 'fixed', 4: 'network', 5: 'cd' } as const)[Number(d.DriveType) as 2 | 3 | 4 | 5];
    if (!type) continue;
    const size = typeof d.Size === 'number' ? d.Size : undefined;
    if ((type === 'usb' || type === 'cd') && !size) continue;
    const name = typeof d.VolumeName === 'string' && d.VolumeName.trim() ? d.VolumeName.trim() : undefined;
    out.push({ letter, name, type, size, free: typeof d.FreeSpace === 'number' ? d.FreeSpace : undefined });
  }
  // Clés USB d'abord (c'est par elles qu'arrivent les fichiers sur une borne), puis par lettre.
  const rank = { usb: 0, fixed: 1, cd: 2, network: 3 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || a.letter.localeCompare(b.letter));
}

export type PlaceKind = 'cp-downloads' | 'windows-downloads' | 'import' | 'desktop' | 'drive';

/** Raccourci du sélecteur. */
export interface PickerPlace {
  id: string;
  kind: PlaceKind;
  label: string;
  detail?: string;
  icon: IconName;
  /** Dossier ouvert ; absent pour les téléchargements de Cyber Pinball (liste de l'inventaire). */
  path?: string;
}

/** « KINGSTON (E:) », « Disque (D:) » */
export function driveLabel(d: DriveInfo): string {
  const name = d.name ?? (d.type === 'usb' ? t('Clé USB') : d.type === 'cd' ? t('CD ou DVD') : d.type === 'network' ? t('Lecteur réseau') : t('Disque'));
  return `${name} (${d.letter})`;
}

export interface PlaceSources {
  /** Zone de téléchargements de Cyber Pinball (absente avant l'installation) et son nombre de fichiers. */
  cpDownloads?: { count: number };
  windowsDownloads?: string;
  importDir?: string;
  desktop?: string;
  drives: DriveInfo[];
}

/** Emplacements, dans l'ordre : téléchargements de Cyber Pinball, de Windows, import, Bureau, lecteurs. */
export function pickerPlaces(src: PlaceSources): PickerPlace[] {
  const places: PickerPlace[] = [];
  // Libellés courts (pastilles de la borne, trois de front) ; l'icône et le détail disent le reste.
  if (src.cpDownloads) places.push({ id: 'cp', kind: 'cp-downloads', label: 'Cyber Pinball', detail: tn(src.cpDownloads.count, 'Téléchargements · {n} fichier', 'Téléchargements · {n} fichiers'), icon: 'download' });
  if (src.windowsDownloads) places.push({ id: 'windows', kind: 'windows-downloads', label: t('Téléchargements'), detail: t('Windows · {dir}', { dir: src.windowsDownloads }), icon: 'folder-download', path: src.windowsDownloads });
  if (src.importDir) places.push({ id: 'import', kind: 'import', label: t('Dossier d’import'), detail: src.importDir, icon: 'inbox', path: src.importDir });
  if (src.desktop) places.push({ id: 'desktop', kind: 'desktop', label: t('Bureau'), detail: src.desktop, icon: 'desktop', path: src.desktop });
  for (const d of src.drives) {
    const kind = d.type === 'usb' ? t('Clé USB') : d.type === 'cd' ? t('CD ou DVD') : d.type === 'network' ? t('Lecteur réseau') : t('Disque');
    const detail = d.free !== undefined ? t('{kind} · {free} libres', { kind, free: formatSize(d.free) }) : kind;
    places.push({ id: `drive:${d.letter}`, kind: 'drive', label: driveLabel(d), detail, icon: d.type === 'usb' ? 'usb' : 'drive', path: d.path ?? `${d.letter}\\` });
  }
  return places;
}

/** Ce que contient un dossier, vu du sélecteur. */
export interface PickerEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  mtimeMs: number;
  /** Convient au filtre (un dossier convient toujours : on y entre). */
  matches: boolean;
  kind: DownloadKind;
}

export type PickerSort = 'name' | 'date';

/** Noms qu'un explorateur cache : fichiers système, corbeille, dossiers techniques. */
export function hiddenName(name: string): boolean {
  return /^(\$recycle\.bin|system volume information|desktop\.ini|thumbs\.db|ntuser\.dat.*|\$windows\.~.*|recovery|config\.msi|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log(\.tmp)?)$/i.test(name) || name.startsWith('.') || name.startsWith('~$');
}

export interface FolderListing {
  entries: PickerEntry[];
  /** Fichiers qui ne conviennent pas, cachés (showAll pour les voir). */
  hidden: number;
  /** Dossier illisible (droits, clé retirée) : le message. */
  error?: string;
}

/**
 * Contenu d'un dossier : les dossiers d'abord, puis les fichiers ; ceux qui ne conviennent
 * pas au filtre sont comptés et cachés, sauf showAll (ils sont alors marqués). Les fichiers
 * système et cachés n'apparaissent jamais.
 */
export function listFolder(dir: string, opts: { filter?: PickFilter; showAll?: boolean; sort?: PickerSort; foldersOnly?: boolean } = {}): FolderListing {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { entries: [], hidden: 0, error: code === 'ENOENT' ? t('Ce dossier n’existe plus (clé retirée ?).') : code === 'EPERM' || code === 'EACCES' ? t('Windows refuse l’accès à ce dossier.') : t('Dossier illisible ({error}).', { error: code ?? String(error) }) };
  }
  const entries: PickerEntry[] = [];
  let hidden = 0;
  for (const d of dirents) {
    if (hiddenName(d.name)) continue;
    const full = path.join(dir, d.name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    const isDir = stat.isDirectory();
    if (!isDir && !stat.isFile()) continue;
    const matches = isDir || (!opts.foldersOnly && matchesFilter(d.name, opts.filter));
    if (!matches && !opts.showAll) {
      hidden++;
      continue;
    }
    entries.push({ name: d.name, path: full, dir: isDir, size: isDir ? 0 : stat.size, mtimeMs: stat.mtimeMs, matches, kind: isDir ? 'other' : downloadKind(d.name) });
  }
  const byName = (a: PickerEntry, b: PickerEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  const sort = opts.sort === 'date' ? (a: PickerEntry, b: PickerEntry) => b.mtimeMs - a.mtimeMs || byName(a, b) : byName;
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || sort(a, b));
  return { entries, hidden };
}

/** Dossier parent ; undefined à la racine d'un lecteur (on revient aux emplacements). */
export function parentFolder(dir: string): string | undefined {
  const resolved = path.resolve(dir);
  const parent = path.dirname(resolved);
  return parent === resolved ? undefined : parent;
}

/**
 * Remonter depuis `dir` sans sortir de l'emplacement d'où l'on est parti, quand il n'est
 * pas un lecteur (Téléchargements, Bureau, import) : à sa racine, on revient aux emplacements.
 */
export function parentWithin(dir: string, placeRoot: string | undefined): string | undefined {
  if (placeRoot && path.resolve(dir).toLowerCase() === path.resolve(placeRoot).toLowerCase()) return undefined;
  return parentFolder(dir);
}

/** « E:\Flippers\Williams » raccourci par le début s'il est trop long : « …\Flippers\Williams ». */
export function shortPath(dir: string, max = 60): string {
  if (dir.length <= max) return dir;
  const parts = dir.split(/[\\/]/);
  let out = parts.at(-1)!;
  for (let i = parts.length - 2; i >= 1; i--) {
    const next = `${parts[i]}\\${out}`;
    if (next.length + 2 > max) break;
    out = next;
  }
  return `…\\${out}`;
}

/** Sélection : bascule un fichier (sélection multiple) ou le prend seul. */
export function toggleSelection(selected: string[], file: string, multiple: boolean): string[] {
  const key = path.resolve(file).toLowerCase();
  const has = selected.some((f) => path.resolve(f).toLowerCase() === key);
  if (!multiple) return has ? [] : [file];
  return has ? selected.filter((f) => path.resolve(f).toLowerCase() !== key) : [...selected, file];
}
