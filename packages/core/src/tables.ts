// Inventaire des tables. Une table = un fichier .vpx, en principe dans son
// propre dossier (organisation officielle de VPX 10.8.1, docs/FileLayout.md).
// Les métadonnées et statistiques vivent dans le fichier .info partagé entre
// frontends, nommé comme la table ou comme son dossier.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile } from './store';

/** Format .info de VPX : champs connus, les autres sont conservés tels quels. */
export interface TableInfoFile {
  Info?: {
    Title?: string;
    Description?: string;
    Authors?: string[];
    Manufacturer?: string;
    Year?: number;
    VPSId?: string;
    IPDBId?: string;
    [key: string]: unknown;
  };
  User?: {
    Rating?: number;
    Favorite?: number;
    LastRun?: string;
    StartCount?: number;
    RunTime?: number;
    Tags?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TableEntry {
  /** Chemin relatif au dossier des tables, séparateurs « / » : identifiant stable. */
  id: string;
  emulator: 'vpx';
  file: string;
  folder: string;
  title: string;
  manufacturer?: string;
  year?: number;
  /** Ce qui distingue plusieurs fichiers d'une même table (« g5k 1.25 »). */
  version?: string;
  /** Fichier .info existant, ou celui à créer (nommé comme la table). */
  infoFile: string;
  info: TableInfoFile;
}

// Le fabricant ne contient pas de parenthèse : « Yukon (Special) (Williams 1971) ».
const NAME_PATTERN = /^(.*?)\s*\(\s*([^()]+?)\s*(\d{4})\s*\)\s*(.*)$/;

/** « Terminator 2 (Williams 1991) g5k 1.25 » -> titre, fabricant, année, reste. */
export function parseTableName(raw: string): { title: string; manufacturer?: string; year?: number; rest?: string } {
  // Les fichiers téléchargés sur VPUniverse sont préfixés par un identifiant numérique.
  const name = raw.replace(/^\d{6,}_/, '').trim();
  const m = NAME_PATTERN.exec(name);
  if (!m) return { title: name };
  return { title: m[1]!.trim() || name, manufacturer: m[2], year: Number(m[3]), rest: m[4]!.trim() || undefined };
}

export function scanTables(tablesDir: string): TableEntry[] {
  if (!fs.existsSync(tablesDir)) return [];
  const entries: TableEntry[] = [];
  for (const dirent of fs.readdirSync(tablesDir, { withFileTypes: true })) {
    if (dirent.isDirectory()) {
      const folder = path.join(tablesDir, dirent.name);
      for (const f of fs.readdirSync(folder)) {
        if (f.toLowerCase().endsWith('.vpx')) entries.push(describeTable(tablesDir, folder, f));
      }
    } else if (dirent.name.toLowerCase().endsWith('.vpx')) {
      // Ancienne organisation : tables en vrac à la racine.
      entries.push(describeTable(tablesDir, tablesDir, dirent.name));
    }
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title, 'fr') || (a.version ?? '').localeCompare(b.version ?? '', 'fr'));
}

function describeTable(tablesDir: string, folder: string, fileName: string): TableEntry {
  const file = path.join(folder, fileName);
  const base = fileName.replace(/\.vpx$/i, '');
  const inOwnFolder = path.resolve(folder) !== path.resolve(tablesDir);
  const folderName = path.basename(folder);

  const byFile = path.join(folder, `${base}.info`);
  const byFolder = path.join(folder, `${folderName}.info`);
  const infoFile = fs.existsSync(byFile) ? byFile : inOwnFolder && fs.existsSync(byFolder) ? byFolder : byFile;
  const info = readInfo(infoFile);

  const fromFile = parseTableName(base);
  const fromFolder = inOwnFolder ? parseTableName(folderName) : undefined;
  return {
    id: path.relative(tablesDir, file).split(path.sep).join('/'),
    emulator: 'vpx',
    file,
    folder,
    // Le dossier porte le nom lisible (c'est Cyber Pinball qui le crée à l'import).
    title: info.Info?.Title ?? fromFolder?.title ?? fromFile.title,
    manufacturer: info.Info?.Manufacturer ?? fromFolder?.manufacturer ?? fromFile.manufacturer,
    year: info.Info?.Year ?? fromFolder?.year ?? fromFile.year,
    version: fromFile.rest ?? (fromFolder && fromFile.title !== fromFolder.title ? base.replace(/^\d{6,}_/, '') : undefined),
    infoFile,
    info,
  };
}

export function readInfo(file: string): TableInfoFile {
  if (!fs.existsSync(file)) return {};
  try {
    return readJsonFile(file) as TableInfoFile;
  } catch {
    return {};
  }
}

/** Ajoute une partie aux statistiques du .info, en conservant tous les autres champs. */
export function recordPlay(entry: TableEntry, startedAt: Date, seconds: number): TableInfoFile {
  const info = readInfo(entry.infoFile);
  const user = info.User ?? {};
  info.User = {
    ...user,
    StartCount: (user.StartCount ?? 0) + 1,
    LastRun: startedAt.toISOString(),
    RunTime: Math.round((user.RunTime ?? 0) + seconds),
  };
  const tmp = `${entry.infoFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(info, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, entry.infoFile);
  return info;
}

export interface InfoFields {
  Title?: string;
  Manufacturer?: string;
  Year?: number;
}

/**
 * Fichier .info à écrire pour une table : celui qui existe déjà, sinon celui du
 * dossier (partagé par toutes les versions), sinon celui nommé comme la table.
 */
export function infoFileFor(entry: TableEntry, tablesDir: string): string {
  if (fs.existsSync(entry.infoFile)) return entry.infoFile;
  const ownFolder = path.resolve(entry.folder).toLowerCase() !== path.resolve(tablesDir).toLowerCase();
  return ownFolder ? path.join(entry.folder, `${path.basename(entry.folder)}.info`) : entry.infoFile;
}

/** Écrit les champs Info modifiés, en conservant tous les autres champs du fichier. */
export function updateInfo(file: string, fields: InfoFields): TableInfoFile {
  const info = readInfo(file);
  const next: Record<string, unknown> = { ...info.Info };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) delete next[key];
    else next[key] = typeof value === 'string' ? value.trim() : value;
  }
  info.Info = next as TableInfoFile['Info'];
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(info, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  return info;
}

/**
 * Ce que « Supprimer » met à la corbeille : tout le dossier si c'est la seule
 * version de la table, sinon ce fichier et ceux qui portent son nom.
 */
export function removalTargets(entry: TableEntry, tablesDir: string): { whole: boolean; paths: string[] } {
  const ownFolder = path.resolve(entry.folder).toLowerCase() !== path.resolve(tablesDir).toLowerCase();
  const versions = fs.readdirSync(entry.folder).filter((f) => f.toLowerCase().endsWith('.vpx'));
  if (ownFolder && versions.length <= 1) return { whole: true, paths: [entry.folder] };
  const base = path.basename(entry.file).replace(/\.vpx$/i, '').toLowerCase();
  const paths = fs
    .readdirSync(entry.folder)
    .filter((f) => f.toLowerCase().startsWith(`${base}.`))
    .map((f) => path.join(entry.folder, f));
  const cache = path.join(entry.folder, 'cache', path.basename(entry.file).replace(/\.vpx$/i, ''));
  if (fs.existsSync(cache)) paths.push(cache);
  return { whole: false, paths };
}
