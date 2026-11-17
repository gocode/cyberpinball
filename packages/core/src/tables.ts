// Inventaire des tables. Une table = un fichier .vpx, en principe dans son
// propre dossier (organisation officielle de VPX 10.8.1, docs/FileLayout.md),
// ou une fiche .pinballfx : table de Pinball FX (contenu de Steam ou d'Epic, sans
// fichier à elle), rangée de la même façon pour garder son .info et ses médias.
// Les métadonnées et statistiques vivent dans le fichier .info partagé entre
// frontends, nommé comme la table ou comme son dossier.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { pinballFxTable } from './pinballfx';
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

export type TableEmulator = 'vpx' | 'pinballfx';

/**
 * Le logiciel qui joue la table, tel que la roue et les collections le nomment (17/11/2026) :
 * `short` pour la puce de la plaque du titre (« VPX », « Pinball FX »), `long` pour la liste des
 * collections (« Visual Pinball X »). Des noms propres : pareils dans toutes les langues.
 */
export const TABLE_ENGINES: Record<TableEmulator, { short: string; long: string; icon: string }> = {
  vpx: { short: 'VPX', long: 'Visual Pinball X', icon: 'playfield' },
  pinballfx: { short: 'Pinball FX', long: 'Pinball FX', icon: 'pinball-app' },
};

/** Extension d'une fiche de table de Pinball FX (JSON : { "PinballFX": { "Table": 156 } }). */
export const PINBALLFX_EXT = '.pinballfx';

const TABLE_FILE = /\.(vpx|pinballfx)$/i;

/** Nom d'un fichier de table sans son extension (.vpx ou .pinballfx). */
export function tableBaseName(file: string): string {
  return path.basename(file).replace(TABLE_FILE, '');
}

/** Fichier de table reconnu par l'inventaire, et son émulateur. */
export function tableFileEmulator(name: string): TableEmulator | undefined {
  const m = TABLE_FILE.exec(name);
  return m ? (m[1]!.toLowerCase() as TableEmulator) : undefined;
}

export interface TableEntry {
  /** Chemin relatif au dossier des tables, séparateurs « / » : identifiant stable. */
  id: string;
  emulator: TableEmulator;
  /** Numéro de la table dans Pinball FX (fiche .pinballfx lisible) ; absent pour VPX. */
  pinballFxTable?: number;
  /** Fichier .vpx, ou fiche .pinballfx. */
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
        if (tableFileEmulator(f)) entries.push(describeTable(tablesDir, folder, f));
      }
    } else if (dirent.name.toLowerCase().endsWith('.vpx')) {
      // Ancienne organisation : tables en vrac à la racine. Une fiche .pinballfx vit
      // toujours dans son dossier : à la racine, elle est ignorée.
      entries.push(describeTable(tablesDir, tablesDir, dirent.name));
    }
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title, 'fr') || (a.version ?? '').localeCompare(b.version ?? '', 'fr'));
}

function describeTable(tablesDir: string, folder: string, fileName: string): TableEntry {
  const file = path.join(folder, fileName);
  const base = fileName.replace(TABLE_FILE, '');
  const emulator = tableFileEmulator(fileName) ?? 'vpx';
  const inOwnFolder = path.resolve(folder) !== path.resolve(tablesDir);
  const folderName = path.basename(folder);

  const byFile = path.join(folder, `${base}.info`);
  const byFolder = path.join(folder, `${folderName}.info`);
  const infoFile = fs.existsSync(byFile) ? byFile : inOwnFolder && fs.existsSync(byFolder) ? byFolder : byFile;
  const info = readInfo(infoFile);

  const fromFile = parseTableName(base);
  const fromFolder = inOwnFolder ? parseTableName(folderName) : undefined;
  const fx = emulator === 'pinballfx' ? readPinballFxFile(file) : undefined;
  const known = fx === undefined ? undefined : pinballFxTable(fx);
  // Table de Pinball FX : son jeu VPS vient du catalogue tant que le .info n'en donne pas d'autre
  // (en mémoire seulement) ; les médias (VPinMediaDB, « Médias manquants ») la reconnaissent ainsi,
  // y compris les tables ajoutées avant que le catalogue ne le connaisse.
  if (known?.vps && !info.Info?.VPSId) info.Info = { ...info.Info, VPSId: known.vps };
  return {
    id: path.relative(tablesDir, file).split(path.sep).join('/'),
    emulator,
    ...(fx === undefined ? {} : { pinballFxTable: fx }),
    file,
    folder,
    // Le dossier porte le nom lisible (c'est Cyber Pinball qui le crée à l'import).
    // Table de Pinball FX : le catalogue de Zen passe avant le nom du dossier.
    title: info.Info?.Title ?? known?.title ?? fromFolder?.title ?? fromFile.title,
    manufacturer: info.Info?.Manufacturer ?? known?.manufacturer ?? fromFolder?.manufacturer ?? fromFile.manufacturer,
    year: info.Info?.Year ?? (known ? known.year : (fromFolder?.year ?? fromFile.year)),
    version: emulator === 'pinballfx' ? undefined : fromFile.rest ?? (fromFolder && fromFile.title !== fromFolder.title ? base.replace(/^\d{6,}_/, '') : undefined),
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
  writeFileAtomic(entry.infoFile, JSON.stringify(info, null, 2) + '\n');
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
  writeFileAtomic(file, JSON.stringify(info, null, 2) + '\n');
  return info;
}

/**
 * Ce que « Supprimer » met à la corbeille : tout le dossier si c'est la seule
 * version de la table, sinon ce fichier et ceux qui portent son nom.
 */
export function removalTargets(entry: TableEntry, tablesDir: string): { whole: boolean; paths: string[] } {
  const ownFolder = path.resolve(entry.folder).toLowerCase() !== path.resolve(tablesDir).toLowerCase();
  const versions = fs.readdirSync(entry.folder).filter((f) => tableFileEmulator(f));
  if (ownFolder && versions.length <= 1) return { whole: true, paths: [entry.folder] };
  const base = path.basename(entry.file).replace(TABLE_FILE, '').toLowerCase();
  const paths = fs
    .readdirSync(entry.folder)
    .filter((f) => f.toLowerCase().startsWith(`${base}.`))
    .map((f) => path.join(entry.folder, f));
  const cache = path.join(entry.folder, 'cache', path.basename(entry.file).replace(TABLE_FILE, ''));
  if (fs.existsSync(cache)) paths.push(cache);
  return { whole: false, paths };
}

// ---------------------------------------------------------------------------
// Fiches de Pinball FX
// ---------------------------------------------------------------------------

/** Numéro de table d'une fiche .pinballfx, ou undefined si elle est illisible. */
export function readPinballFxFile(file: string): number | undefined {
  try {
    const data = readJsonFile(file) as { PinballFX?: { Table?: unknown } };
    const n = data.PinballFX?.Table;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Nom de dossier lisible et valable sous Windows : « Titre (Fabricant Année) ». */
export function pinballFxFolderName(tableId: number): string {
  const t = pinballFxTable(tableId);
  const label = t ? `${t.title} (${t.manufacturer}${t.year ? ` ${t.year}` : ''})` : `Pinball FX ${tableId}`;
  return label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim();
}

/**
 * Ajoute une table de Pinball FX à l'inventaire : dossier « Titre (Fabricant Année) »
 * et sa fiche. Une table déjà présente (même numéro, n'importe quel dossier) est
 * rendue telle quelle.
 */
export function addPinballFxTable(tablesDir: string, tableId: number): TableEntry {
  const existing = scanTables(tablesDir).find((e) => e.pinballFxTable === tableId);
  if (existing) return existing;
  const name = pinballFxFolderName(tableId);
  let folder = path.join(tablesDir, name);
  // Un dossier VPX du même nom (même machine) reste à part : la fiche prend un nom distinct.
  if (fs.existsSync(folder) && fs.readdirSync(folder).some((f) => tableFileEmulator(f) === 'vpx')) folder = path.join(tablesDir, `${name} Pinball FX`);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${path.basename(folder)}${PINBALLFX_EXT}`);
  writeFileAtomic(file, JSON.stringify({ PinballFX: { Table: tableId } }, null, 2) + '\n');
  return describeTable(tablesDir, folder, path.basename(file));
}
