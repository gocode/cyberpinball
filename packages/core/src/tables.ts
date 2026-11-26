// Inventaire des tables. Une table = un fichier .vpx, en principe dans son
// propre dossier (organisation officielle de VPX 10.8.1, docs/FileLayout.md),
// ou une fiche .pinballfx / .pinballfx3 : table de Pinball FX ou de Pinball FX3 (contenu de Steam ou d'Epic, sans
// fichier à elle), rangée de la même façon pour garder son .info et ses médias, ou un fichier .fpt
// (table de Future Pinball, futurepinball.ts).
// Les métadonnées et statistiques vivent dans le fichier .info partagé entre
// frontends, nommé comme la table ou comme son dossier.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { readJsonFile } from './store';
import { isZenEmulator, ZEN_GAMES, zenEntryKey, zenTable, type ZenGameKey, type ZenTable } from './zen';
import { isPinballFxMidnightId, PINBALLFX_MIDNIGHT_APP_ID } from './pinballfx-midnight';

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

export type TableEmulator = 'vpx' | ZenGameKey | 'futurepinball';

/**
 * Le logiciel qui joue la table, tel que la roue et les collections le nomment (17/11/2026) :
 * `short` pour la puce de la plaque du titre (« VPX », « Pinball FX »), `long` pour la liste des
 * collections (« Visual Pinball X »). Des noms propres : pareils dans toutes les langues.
 */
export const TABLE_ENGINES: Record<TableEmulator, { short: string; long: string; icon: string }> = {
  vpx: { short: 'VPX', long: 'Visual Pinball X', icon: 'playfield' },
  pinballfx: { short: 'Pinball FX', long: 'Pinball FX', icon: 'pinball-app' },
  pinballfx3: { short: 'Pinball FX3', long: 'Pinball FX3 (Pinball FX Classic)', icon: 'pinball-app' },
  pinballfxmidnight: { short: 'Pinball FX Midnight', long: 'Pinball FX Midnight', icon: 'pinball-app' },
  futurepinball: { short: 'Future Pinball', long: 'Future Pinball', icon: 'pinball-app' },
};

/** Extension d'une fiche de table de Pinball FX (JSON : { "PinballFX": { "Table": 156 } }). */
export const PINBALLFX_EXT = ZEN_GAMES.pinballfx.ext;
/** Extension d'une fiche de table de Pinball FX3 (JSON : { "PinballFX3": { "Table": "WMS_Fish_Tales" } }). */
export const PINBALLFX3_EXT = ZEN_GAMES.pinballfx3.ext;

const TABLE_FILE = /\.(vpx|pinballfx(?:3|midnight)?|fpt)$/i;

/** Extension d'un fichier de table -> le logiciel qui la joue (.fpt : Future Pinball, 19/11/2026). */
const EMULATOR_OF_EXTENSION: Readonly<Record<string, TableEmulator>> = {
  vpx: 'vpx', pinballfx: 'pinballfx', pinballfx3: 'pinballfx3', pinballfxmidnight: 'pinballfxmidnight', fpt: 'futurepinball',
};

/** Nom d'un fichier de table sans son extension (.vpx, .pinballfx, .pinballfx3 ou .fpt). */
export function tableBaseName(file: string): string {
  return path.basename(file).replace(TABLE_FILE, '');
}

/** Fichier de table reconnu par l'inventaire, et son émulateur. */
export function tableFileEmulator(name: string): TableEmulator | undefined {
  const m = TABLE_FILE.exec(name);
  return m ? EMULATOR_OF_EXTENSION[m[1]!.toLowerCase()] : undefined;
}

/** Table jouée par VPX : la seule qui ait un script, une ROM, un PuP-Pack, un diagnostic. */
export function isVpxTable(entry: Pick<TableEntry, 'emulator'>): boolean {
  return (entry.emulator ?? 'vpx') === 'vpx';
}

export interface TableEntry {
  /** Chemin relatif au dossier des tables, séparateurs « / » : identifiant stable. */
  id: string;
  emulator: TableEmulator;
  /** Numéro de la table dans Pinball FX (fiche .pinballfx lisible) ; absent pour VPX. */
  pinballFxTable?: number;
  /** Numéro dans Pinball FX Midnight, indépendant de la numérotation de Pinball FX. */
  pinballFxMidnightTable?: number;
  /** Fichier de la table dans Pinball FX3, sans .pxp (fiche .pinballfx3 lisible) ; absent ailleurs. */
  pinballFx3Table?: string;
  /** Fichier .vpx, ou fiche .pinballfx / .pinballfx3. */
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
  const extensionEmulator = tableFileEmulator(fileName) ?? 'vpx';
  const numeric = extensionEmulator === 'pinballfx' || extensionEmulator === 'pinballfxmidnight'
    ? readNumericZenFile(file, extensionEmulator)
    : undefined;
  const emulator = numeric?.game ?? extensionEmulator;
  const inOwnFolder = path.resolve(folder) !== path.resolve(tablesDir);
  const folderName = path.basename(folder);

  const byFile = path.join(folder, `${base}.info`);
  const byFolder = path.join(folder, `${folderName}.info`);
  const infoFile = fs.existsSync(byFile) ? byFile : inOwnFolder && fs.existsSync(byFolder) ? byFolder : byFile;
  const info = readInfo(infoFile);

  const fromFile = parseTableName(base);
  const fromFolder = inOwnFolder ? parseTableName(folderName) : undefined;
  const fx3 = emulator === 'pinballfx3' ? readPinballFx3File(file) : undefined;
  // Une table que le catalogue ne connaît pas garde le nom de son dossier.
  const catalog = numeric?.table !== undefined ? zenTable(numeric.game, String(numeric.table)) : fx3 !== undefined ? zenTable('pinballfx3', fx3) : undefined;
  const known = catalog?.unknown ? undefined : catalog;
  // Table de Zen : son jeu VPS vient du catalogue tant que le .info n'en donne pas d'autre
  // (en mémoire seulement) ; les médias (VPinMediaDB, « Médias manquants ») la reconnaissent ainsi,
  // y compris les tables ajoutées avant que le catalogue ne le connaisse.
  if (known?.vps && !info.Info?.VPSId) info.Info = { ...info.Info, VPSId: known.vps };
  const zen = isZenEmulator(emulator);
  return {
    id: path.relative(tablesDir, file).split(path.sep).join('/'),
    emulator,
    ...(numeric?.game === 'pinballfx' && numeric.table !== undefined ? { pinballFxTable: numeric.table } : {}),
    ...(numeric?.game === 'pinballfxmidnight' && numeric.table !== undefined ? { pinballFxMidnightTable: numeric.table } : {}),
    ...(fx3 === undefined ? {} : { pinballFx3Table: fx3 }),
    file,
    folder,
    // Le dossier porte le nom lisible (c'est Cyber Pinball qui le crée à l'import).
    // Table de Pinball FX : le catalogue de Zen passe avant le nom du dossier.
    title: info.Info?.Title ?? known?.title ?? fromFolder?.title ?? fromFile.title,
    manufacturer: info.Info?.Manufacturer ?? known?.manufacturer ?? fromFolder?.manufacturer ?? fromFile.manufacturer,
    year: info.Info?.Year ?? (known ? known.year : (fromFolder?.year ?? fromFile.year)),
    version: zen ? undefined : fromFile.rest ?? (fromFolder && fromFile.title !== fromFolder.title ? base.replace(/^\d{6,}_/, '') : undefined),
    infoFile,
    info,
  };
}

/** Une table de l'inventaire d'après son fichier (dans son dossier, ou à la racine du dossier des tables). */
export function describeTableFile(tablesDir: string, file: string): TableEntry {
  return describeTable(tablesDir, path.dirname(file), path.basename(file));
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
  const entry = readNumericZenFile(file, 'pinballfx');
  return entry.game === 'pinballfx' ? entry.table : undefined;
}

function readNumericZenFile(file: string, extensionGame: 'pinballfx' | 'pinballfxmidnight'): { game: 'pinballfx' | 'pinballfxmidnight'; table?: number } {
  try {
    const data = readJsonFile(file) as { PinballFX?: { Table?: unknown }; PinballFXMidnight?: { Table?: unknown; AppId?: unknown } };
    // Les fiches des premiers essais utilisaient l'extension .pinballfx avec la clé Midnight.
    // Leur chemin reste le même, donc leurs collections et leurs médias sont conservés.
    if (extensionGame === 'pinballfxmidnight' || Object.hasOwn(data, 'PinballFXMidnight')) {
      const { AppId, Table } = data.PinballFXMidnight ?? {};
      return { game: 'pinballfxmidnight', ...(isPinballFxMidnightId(Table) && (AppId === undefined || AppId === PINBALLFX_MIDNIGHT_APP_ID) ? { table: Table } : {}) };
    }
    const n = data.PinballFX?.Table;
    return { game: 'pinballfx', ...(typeof n === 'number' && Number.isInteger(n) && n > 0 ? { table: n } : {}) };
  } catch {
    return { game: extensionGame };
  }
}

/** Nom de fichier de table d'une fiche .pinballfx3, ou undefined si elle est illisible ou le nom invalide. */
export function readPinballFx3File(file: string): string | undefined {
  try {
    const data = readJsonFile(file) as { PinballFX3?: { Table?: unknown } };
    const name = data.PinballFX3?.Table;
    return typeof name === 'string' && zenTable('pinballfx3', name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Nom de dossier d'une table de Pinball FX (numéro). */
export function pinballFxFolderName(tableId: number): string {
  return zenFolderName(zenTable('pinballfx', String(tableId)) ?? { game: 'pinballfx', key: String(tableId), title: '', manufacturer: '', unknown: true });
}

/** Nom de dossier lisible et valable sous Windows : « Titre (Fabricant Année) » ; table inconnue : « Jeu clé ». */
export function zenFolderName(table: ZenTable): string {
  const label = table.unknown ? `${ZEN_GAMES[table.game].name} ${table.key}` : `${table.title} (${table.manufacturer}${table.year ? ` ${table.year}` : ''})`;
  const suffix = table.game === 'pinballfxmidnight' && !table.unknown ? ' Pinball FX Midnight' : '';
  return label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim() + suffix;
}

/**
 * Ajoute une table de Pinball FX à l'inventaire : dossier « Titre (Fabricant Année) »
 * et sa fiche. Une table déjà présente (même numéro, n'importe quel dossier) est
 * rendue telle quelle.
 */
export function addPinballFxTable(tablesDir: string, tableId: number): TableEntry {
  return addZenTable(tablesDir, zenTable('pinballfx', String(tableId)) ?? { game: 'pinballfx', key: String(tableId), title: '', manufacturer: '', unknown: true });
}

/**
 * Ajoute une table d'un jeu de Zen (Pinball FX, Pinball FX3) à l'inventaire : dossier « Titre
 * (Fabricant Année) » et sa fiche. Une table déjà présente (même jeu, même clé, n'importe quel
 * dossier) est rendue telle quelle. Un dossier du même nom qui tient déjà une table d'un autre
 * logiciel (la même machine en VPX, ou dans l'autre jeu de Zen) reste à part : la fiche prend
 * un dossier « … Pinball FX3 », sans quoi les deux partageraient leur .info et leurs médias.
 */
export function addZenTable(tablesDir: string, table: ZenTable): TableEntry {
  const game = ZEN_GAMES[table.game];
  const existing = scanTables(tablesDir).find((e) => e.emulator === table.game && zenEntryKey(e) === table.key);
  if (existing) return existing;
  const name = zenFolderName(table);
  let folder = path.join(tablesDir, name);
  if (fs.existsSync(folder) && fs.readdirSync(folder).some((f) => { const e = tableFileEmulator(f); return e !== undefined && e !== table.game; })) folder = path.join(tablesDir, `${name} ${game.name}`);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${path.basename(folder)}${game.ext}`);
  const value = table.game === 'pinballfx3' ? table.key : Number(table.key);
  writeFileAtomic(file, JSON.stringify({ [game.jsonKey]: { Table: value } }, null, 2) + '\n');
  return describeTable(tablesDir, folder, path.basename(file));
}
