// Future Pinball (Black Sheep Studios, 2005), premier niveau (19/11/2026) : ses tables (.fpt) dans la
// roue, lancées en un appui comme celles de Pinball FX. Ici le cœur : où est le jeu sur ce
// PC, ses tables, la commande d'une partie, l'ajout d'une table à l'inventaire, la place de sa fenêtre.
//
// Une table de Future Pinball est un fichier .fpt, comme un .vpx : elle a son dossier « Titre
// (Fabricant Année) » dans le dossier des tables, son .info et ses médias. Le .fpt y est lié (lien
// physique, même disque : aucune place en plus) ou copié ; l'original, dans le dossier Tables de Future
// Pinball, n'est jamais modifié. Rien de ce qui est propre à VPX (script, ROM, PuP-Pack, diagnostic)
// ne s'y applique.
//
// BAM (20/11/2026) : quand le jeu a son dossier BAM avec FPLoader.exe, la partie passe par lui, comme
// chez les autres front-ends ; les tables récentes (physique FizX, objet xBAM de leur script) en ont
// besoin. Sans BAM, le jeu est lancé seul. Les réglages de BAM restent les siens (son menu en jeu).
//
// Hors de ce niveau : les scores du jeu, le téléchargement des tables.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { safeName } from './fileops';
import { t } from './i18n';
import { describeTableFile, parseTableName, readInfo, scanTables, tableFileEmulator, type TableEntry } from './tables';
import { matchVps, type VpsDb } from './vps';
import type { Rect } from './model';

/** Nom du jeu, pareil dans toutes les langues (nom propre). */
export const FUTURE_PINBALL_NAME = 'Future Pinball';
/** Exécutable du jeu. */
export const FUTURE_PINBALL_EXE = 'Future Pinball.exe';
/** Extension d'une table. */
export const FUTURE_PINBALL_EXT = '.fpt';
/** Format des tables de Future Pinball dans la base VPS. */
export const FUTURE_PINBALL_VPS_FORMAT = 'FP';
/** Dossier choisi à la main, dans le dossier des données (Future Pinball pas aux emplacements habituels). */
export const FUTURE_PINBALL_CONFIG_FILE = 'future-pinball.json';
/** BAM (Better Arcade Mode) : son dossier dans celui du jeu, et le lanceur qui l'injecte dans le jeu. */
export const FUTURE_PINBALL_BAM_DIR = 'BAM';
export const FUTURE_PINBALL_LOADER = 'FPLoader.exe';

const EXE_NAME = /^future pinball\.exe$/i;

export interface FuturePinballInstall {
  /** Chemin de « Future Pinball.exe ». */
  exe: string;
  /** Dossier du jeu (celui de l'exécutable). */
  gameDir: string;
  /** Son dossier Tables (peut manquer : le jeu ne le crée qu'à l'installation). */
  tablesDir: string;
  /** Trouvé aux emplacements habituels, ou choisi à la main (configuration). */
  source: 'found' | 'chosen';
  /** BAM installé : chemin de son FPLoader.exe (dossier BAM du jeu). */
  loader?: string;
}

/** Emplacements habituels, sur C:, D: et E: (installateur d'origine, paquets de la communauté, Program Files). */
export function futurePinballCandidates(drives: readonly string[] = ['C:', 'D:', 'E:']): string[] {
  const under = ['Games\\Future Pinball', 'Future Pinball', 'Program Files (x86)\\Future Pinball', 'Program Files\\Future Pinball', 'vPinball\\FuturePinball', 'vPinball\\Future Pinball', 'Visual Pinball\\Future Pinball', 'PinballX\\Future Pinball'];
  return drives.flatMap((d) => under.map((u) => path.win32.join(`${d.replace(/[\\/]+$/, '')}\\`, u)));
}

/**
 * Future Pinball à partir d'un chemin choisi : son exécutable, son dossier, ou son dossier Tables.
 * undefined : rien de Future Pinball à cet endroit.
 */
export function futurePinballAt(chosen: string, exists: (p: string) => boolean = fs.existsSync, source: FuturePinballInstall['source'] = 'chosen'): FuturePinballInstall | undefined {
  const at = path.resolve(chosen);
  const install = (gameDir: string): FuturePinballInstall => {
    const loader = path.join(gameDir, FUTURE_PINBALL_BAM_DIR, FUTURE_PINBALL_LOADER);
    return { exe: path.join(gameDir, FUTURE_PINBALL_EXE), gameDir, tablesDir: path.join(gameDir, 'Tables'), source, ...(exists(loader) ? { loader } : {}) };
  };
  if (EXE_NAME.test(path.basename(at))) return exists(at) ? { ...install(path.dirname(at)), exe: at } : undefined;
  if (exists(path.join(at, FUTURE_PINBALL_EXE))) return install(at);
  // Le dossier Tables choisi : le jeu est juste au-dessus.
  if (/^tables$/i.test(path.basename(at)) && exists(path.join(path.dirname(at), FUTURE_PINBALL_EXE))) return install(path.dirname(at));
  return undefined;
}

export function readFuturePinballConfig(dataDir: string): { exe?: string } {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, FUTURE_PINBALL_CONFIG_FILE), 'utf8')) as { exe?: unknown };
    return typeof parsed.exe === 'string' && parsed.exe ? { exe: parsed.exe } : {};
  } catch {
    return {};
  }
}

/** Garde le jeu choisi à la main ; undefined : l'oublie (retour aux emplacements habituels). */
export function writeFuturePinballConfig(dataDir: string, exe: string | undefined): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, FUTURE_PINBALL_CONFIG_FILE), JSON.stringify(exe ? { exe } : {}, null, 2) + '\n');
}

export interface FindFuturePinballOptions {
  /** Dossier des données : le jeu choisi à la main y est gardé, et passe avant les emplacements habituels. */
  dataDir?: string;
  candidates?: readonly string[];
  exists?: (p: string) => boolean;
}

/**
 * Future Pinball sur ce PC : celui choisi à la main s'il est toujours là, sinon le premier des
 * emplacements habituels. Rien n'est mémorisé de ce qui est trouvé : un jeu installé ensuite est vu aussitôt.
 */
export function findFuturePinball(opts: FindFuturePinballOptions = {}): FuturePinballInstall | undefined {
  const exists = opts.exists ?? fs.existsSync;
  const chosen = opts.dataDir ? readFuturePinballConfig(opts.dataDir).exe : undefined;
  if (chosen) {
    const install = futurePinballAt(chosen, exists, 'chosen');
    if (install) return install;
  }
  for (const dir of opts.candidates ?? futurePinballCandidates()) {
    const install = futurePinballAt(dir, exists, 'found');
    if (install) return install;
  }
  return undefined;
}

/**
 * Tables du dossier Tables de Future Pinball (et de ses sous-dossiers, deux niveaux), triées par nom.
 * Un dossier absent ou illisible : aucune.
 */
export function futurePinballInstalledTables(install: Pick<FuturePinballInstall, 'tablesDir'>, depth = 2): string[] {
  const found: string[] = [];
  const walk = (dir: string, level: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && isFuturePinballTable(e.name)) found.push(p);
      else if (e.isDirectory() && level < depth) walk(p, level + 1);
    }
  };
  walk(install.tablesDir, 0);
  return found.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'fr', { sensitivity: 'base' }));
}

export function isFuturePinballTable(file: string): boolean {
  return path.extname(file).toLowerCase() === FUTURE_PINBALL_EXT;
}

/** Commande d'une partie : le jeu, la table, ouverte en jeu, et le jeu fermé quand on quitte la table. */
export interface FuturePinballCommand {
  file: string;
  args: string[];
  cwd: string;
  /**
   * Lancé par FPLoader (BAM) : le processus lancé n'est pas le jeu, qui est reconnu à son exécutable
   * (« Future Pinball.exe »). Absent : le processus lancé est le jeu.
   */
  bam?: true;
}

/**
 * Sans BAM : `"Future Pinball.exe" /open "<table>.fpt" /play /exit`, depuis le dossier du jeu (ses
 * bibliothèques .fpl). Avec BAM : `"BAM\FPLoader.exe" /open "<table>.fpt" /play /exit /arcaderender
 * /STAYINRAM`, depuis le dossier BAM, la ligne des autres front-ends (PinUP Popper, PinballX) : sans
 * /STAYINRAM, BAM ne charge pas ses réglages. undefined : un chemin que la ligne de commande ne saurait
 * passer (guillemet, retour à la ligne).
 */
export function futurePinballCommand(install: Pick<FuturePinballInstall, 'exe' | 'gameDir' | 'loader'>, table: string): FuturePinballCommand | undefined {
  if (/["\r\n\0]/.test(table) || !isFuturePinballTable(table)) return undefined;
  if (install.loader) return { file: install.loader, args: ['/open', table, '/play', '/exit', '/arcaderender', '/STAYINRAM'], cwd: path.dirname(install.loader), bam: true };
  return { file: install.exe, args: ['/open', table, '/play', '/exit'], cwd: install.gameDir };
}

/** La ligne de commande telle que Windows la reçoit (journal, essais). */
export function futurePinballCommandLine(command: Pick<FuturePinballCommand, 'file' | 'args'>): string {
  const quote = (a: string) => (/[\s"]/.test(a) ? `"${a}"` : a);
  return [command.file, ...command.args].map(quote).join(' ');
}

/** Ce qu'on sait d'une table de Future Pinball d'après son nom de fichier (et la base VPS). */
export interface FuturePinballName {
  title: string;
  manufacturer?: string;
  year?: number;
  /** Jeu de la base VPS, reconnu sans doute possible. */
  vps?: string;
}

/**
 * Nom d'une table d'après la base VPS (jeux qui existent en Future Pinball d'abord), quand elle la
 * reconnaît sans hésiter ; sinon d'après son nom de fichier (« Titre (Fabricant Année) »).
 */
export function futurePinballName(file: string, db?: VpsDb): FuturePinballName {
  const base = path.basename(file, path.extname(file));
  const fromFile = parseTableName(base);
  const parent = path.basename(path.dirname(file));
  const names = /^tables$/i.test(parent) ? [base] : [base, parent];
  const match = db ? matchVps(db, { names, format: FUTURE_PINBALL_VPS_FORMAT }) : undefined;
  const game = match?.confident ? match.candidates[0]?.game : undefined;
  if (game) {
    return {
      title: game.name,
      ...(game.manufacturer ? { manufacturer: game.manufacturer } : fromFile.manufacturer ? { manufacturer: fromFile.manufacturer } : {}),
      ...(game.year ? { year: game.year } : fromFile.year ? { year: fromFile.year } : {}),
      vps: game.id,
    };
  }
  return { title: fromFile.title, ...(fromFile.manufacturer ? { manufacturer: fromFile.manufacturer } : {}), ...(fromFile.year ? { year: fromFile.year } : {}) };
}

/** Nom du dossier d'une table : « Titre (Fabricant Année) », valable sous Windows. */
export function futurePinballFolderName(name: Pick<FuturePinballName, 'title' | 'manufacturer' | 'year'>): string {
  const suffix = [name.manufacturer, name.year].filter(Boolean).join(' ');
  return safeName(suffix ? `${name.title} (${suffix})` : name.title) || FUTURE_PINBALL_NAME;
}

/** La table est-elle déjà dans l'inventaire (même nom de fichier, même taille, n'importe quel dossier) ? */
export function futurePinballTableInMenu(tables: readonly TableEntry[], source: string): TableEntry | undefined {
  const name = path.basename(source).toLowerCase();
  let size: number | undefined;
  try {
    size = fs.statSync(source).size;
  } catch {
    return undefined;
  }
  return tables.find((e) => {
    if (e.emulator !== 'futurepinball' || path.basename(e.file).toLowerCase() !== name) return false;
    try {
      return fs.statSync(e.file).size === size;
    } catch {
      return false;
    }
  });
}

export interface AddFuturePinballOptions {
  db?: VpsDb;
  /** Lien physique quand le disque le permet (par défaut) ; false : toujours une copie. */
  link?: boolean;
}

export interface AddedFuturePinballTable {
  entry: TableEntry;
  /** Déjà dans le front-end : rien n'a été écrit. */
  already: boolean;
  /** Liée (aucune place en plus) plutôt que copiée. */
  linked: boolean;
}

/**
 * Ajoute une table de Future Pinball à l'inventaire : dossier « Titre (Fabricant Année) » (ou « … Future
 * Pinball » s'il tient déjà une table d'un autre logiciel ou une autre table), le .fpt lié ou copié,
 * son .info (titre, fabricant, année, jeu VPS). L'original n'est jamais modifié.
 */
export async function addFuturePinballTable(tablesDir: string, source: string, opts: AddFuturePinballOptions = {}): Promise<AddedFuturePinballTable> {
  if (!isFuturePinballTable(source)) throw new Error(t('« {file} » n’est pas une table de Future Pinball (.fpt).', { file: path.basename(source) }));
  let isFile = false;
  try {
    isFile = fs.statSync(source).isFile();
  } catch {
    // Absent : dit ci-dessous.
  }
  if (!isFile) throw new Error(t('« {file} » est introuvable.', { file: source }));
  const existing = futurePinballTableInMenu(scanTables(tablesDir), source);
  if (existing) return { entry: existing, already: true, linked: false };

  const name = futurePinballName(source, opts.db);
  const base = futurePinballFolderName(name);
  const fileName = path.basename(source);
  let folder = path.join(tablesDir, base);
  // Un dossier qui tient déjà une autre table (la même machine en VPX, ou un autre .fpt) reste à elle :
  // les deux partageraient leur .info et leurs médias.
  const taken = (dir: string) => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => tableFileEmulator(f) !== undefined);
  if (taken(folder)) folder = path.join(tablesDir, `${base} ${FUTURE_PINBALL_NAME}`);
  for (let n = 2; taken(folder); n++) folder = path.join(tablesDir, `${base} ${FUTURE_PINBALL_NAME} ${n}`);
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, fileName);

  let linked = false;
  if (opts.link !== false) {
    try {
      fs.linkSync(source, target);
      linked = true;
    } catch {
      // Autre disque, clé USB, système de fichiers sans liens : copie.
    }
  }
  if (!linked) await fs.promises.copyFile(source, target);

  // Le .info du dossier (partagé par les versions), comme à l'import d'une table VPX.
  const infoFile = path.join(folder, `${path.basename(folder)}.info`);
  const info = readInfo(infoFile);
  info.Info = {
    ...info.Info,
    Title: name.title,
    ...(name.manufacturer ? { Manufacturer: name.manufacturer } : {}),
    ...(name.year ? { Year: name.year } : {}),
    ...(name.vps ? { VPSId: name.vps } : {}),
  };
  writeFileAtomic(infoFile, JSON.stringify(info, null, 2) + '\n');
  return { entry: describeTableFile(tablesDir, target), already: false, linked };
}

/**
 * Où mettre la fenêtre de Future Pinball : sur le playfield quand le jeu s'est ouvert en fenêtre
 * ailleurs. Une fenêtre qui couvre exactement un écran est en plein écran (le jeu a choisi son
 * écran dans ses préférences) : elle n'est pas touchée, la déplacer pourrait le faire tomber.
 * undefined : rien à faire.
 */
export function futurePinballPlacement(window: Rect, playfield: Rect | undefined, displays: readonly Rect[]): Rect | undefined {
  if (!playfield || window.width <= 0 || window.height <= 0) return undefined;
  const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  if (same(window, playfield)) return undefined;
  if (displays.some((d) => same(d, window))) return undefined;
  return { ...playfield };
}
