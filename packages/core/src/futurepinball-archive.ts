// Archive d'une table de Future Pinball récupérée au catalogue (20/11/2026) : où va chacun de ses
// fichiers dans le dossier du jeu, puis la copie. Une telle archive apporte le .fpt et souvent ce dont
// il a besoin ailleurs dans le jeu : bibliothèques (.fpl, dossier Libraries), musique (Music), scripts
// (Scripts), réglages de BAM (BAM). Le .fpt va dans le dossier Tables du jeu, comme une table installée
// à la main ; il est ensuite ajouté au front-end par addFuturePinballTable (lié, sans place en plus).
//
// Rien de ce qui est déjà dans le jeu n'est écrasé : une bibliothèque déjà là reste la sienne (d'autres
// tables s'en servent), une table du même nom au contenu différent prend un autre nom à côté.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isFuturePinballTable } from './futurepinball';

/** Dossiers du jeu qu'une archive peut remplir, sous leur nom exact. */
const GAME_FOLDERS = ['Tables', 'Libraries', 'Music', 'Scripts', 'BAM'] as const;
type GameFolder = (typeof GAME_FOLDERS)[number];

/** « table-extra » : fichier qui accompagne une table à côté d'elle (réglages de physique de BAM, .xml). */
export type FuturePinballFileKind = 'table' | 'table-extra' | 'library' | 'music' | 'script' | 'bam';

const KIND_OF: Record<GameFolder, FuturePinballFileKind> = { Tables: 'table', Libraries: 'library', Music: 'music', Scripts: 'script', BAM: 'bam' };

export interface FuturePinballArchiveFile {
  /** Fichier extrait. */
  from: string;
  /** Sa place dans le dossier du jeu. */
  to: string;
  kind: FuturePinballFileKind;
}

export interface FuturePinballArchivePlan {
  files: FuturePinballArchiveFile[];
  /** Fichiers qui ne vont nulle part dans le jeu (lisez-moi, images, vidéos de présentation…). */
  ignored: string[];
}

function walk(dir: string, found: string[], depth = 0): void {
  if (depth > 12) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, found, depth + 1);
    else if (e.isFile()) found.push(p);
  }
}

/** Ce dossier (archive extraite) contient-il une table de Future Pinball (.fpt), à n'importe quelle profondeur ? */
export function containsFuturePinballTable(dir: string): boolean {
  const all: string[] = [];
  walk(dir, all);
  return all.some((f) => isFuturePinballTable(f));
}

/**
 * Place de chaque fichier d'une archive extraite (`root`) dans le dossier du jeu. Un fichier rangé sous
 * un dossier du jeu (« Future Pinball/Libraries/x.fpl », « Music/Titre/a.ogg ») y garde sa place à partir
 * de ce dossier ; sinon, un .fpt va dans Tables et un .fpl dans Libraries ; le reste est ignoré.
 */
export function planFuturePinballArchive(root: string, gameDir: string): FuturePinballArchivePlan {
  const all: string[] = [];
  walk(root, all);
  const plan: FuturePinballArchivePlan = { files: [], ignored: [] };
  const base = path.resolve(gameDir);
  const stem = (f: string) => path.basename(f, path.extname(f)).toLowerCase();
  // Noms des tables de l'archive : un .xml du même nom est leur réglage de physique (BAM).
  const tableStems = new Set(all.filter((f) => isFuturePinballTable(f)).map(stem));
  for (const from of all.sort()) {
    const parts = path.relative(root, from).split(/[\\/]+/);
    const at = parts.findIndex((p, i) => i < parts.length - 1 && GAME_FOLDERS.some((g) => g.toLowerCase() === p.toLowerCase()));
    let to: string | undefined;
    let kind: FuturePinballFileKind | undefined;
    if (at >= 0) {
      const folder = GAME_FOLDERS.find((g) => g.toLowerCase() === parts[at]!.toLowerCase())!;
      to = path.join(base, folder, ...parts.slice(at + 1));
      kind = KIND_OF[folder];
    } else if (isFuturePinballTable(from)) {
      to = path.join(base, 'Tables', path.basename(from));
      kind = 'table';
    } else if (path.extname(from).toLowerCase() === '.fpl') {
      to = path.join(base, 'Libraries', path.basename(from));
      kind = 'library';
    } else if (path.extname(from).toLowerCase() === '.vbs') {
      // Bibliothèque de script (« ZBRrollingballsoundslib.vbs » de Ghostbusters, 20/11/2026) : le script de
      // la table la charge depuis le dossier Scripts du jeu.
      to = path.join(base, 'Scripts', path.basename(from));
      kind = 'script';
    } else if (path.extname(from).toLowerCase() === '.xml' && tableStems.has(stem(from))) {
      // Réglages de physique de BAM d'une table (« ghostbusters.XML ») : à côté de son .fpt.
      to = path.join(base, 'Tables', path.basename(from));
      kind = 'table-extra';
    }
    // Jamais hors du dossier du jeu (nom d'archive piégé).
    if (!to || !kind || path.relative(base, to).startsWith('..') || path.isAbsolute(path.relative(base, to))) {
      plan.ignored.push(from);
      continue;
    }
    // Un .fpt rangé ailleurs que dans Tables (« Music/x.fpt ») reste une table : dans Tables.
    if (kind !== 'table' && isFuturePinballTable(from)) {
      to = path.join(base, 'Tables', path.basename(from));
      kind = 'table';
    }
    plan.files.push({ from, to, kind });
  }
  return plan;
}

export interface InstalledFuturePinballArchive {
  /** Tables du jeu venues de l'archive (copiées, ou déjà là à l'identique), à ajouter au front-end. */
  tables: string[];
  /** Fichiers copiés dans le jeu. */
  copied: string[];
  /** Déjà dans le jeu : à l'identique, ou différents et gardés tels quels (bibliothèque, musique…). */
  kept: string[];
  ignored: string[];
}

function sameContent(a: string, b: string): boolean {
  try {
    const [sa, sb] = [fs.statSync(a), fs.statSync(b)];
    if (sa.size !== sb.size) return false;
    // Un .fpt fait souvent 50 à 150 Mo : comparé par morceaux, sans tout charger.
    const size = 1 << 20;
    const [ba, bb] = [Buffer.alloc(size), Buffer.alloc(size)];
    const [fa, fb] = [fs.openSync(a, 'r'), fs.openSync(b, 'r')];
    try {
      for (let pos = 0; pos < sa.size; pos += size) {
        const na = fs.readSync(fa, ba, 0, size, pos);
        const nb = fs.readSync(fb, bb, 0, size, pos);
        if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      }
      return true;
    } finally {
      fs.closeSync(fa);
      fs.closeSync(fb);
    }
  } catch {
    return false;
  }
}

/** « Titre.fpt » déjà pris par une autre table : « Titre (2).fpt », « Titre (3).fpt »… */
function freeName(file: string): string {
  const ext = path.extname(file);
  const stem = file.slice(0, -ext.length);
  let n = 2;
  while (fs.existsSync(`${stem} (${n})${ext}`)) n++;
  return `${stem} (${n})${ext}`;
}

/**
 * Copie dans le jeu ce que l'archive extraite apporte (planFuturePinballArchive). Rien n'est écrasé :
 * un fichier identique déjà là compte comme présent ; une table du même nom mais différente est copiée
 * sous un autre nom ; tout autre fichier différent déjà là reste celui du jeu.
 */
export async function installFuturePinballArchive(root: string, gameDir: string): Promise<InstalledFuturePinballArchive> {
  const plan = planFuturePinballArchive(root, gameDir);
  const done: InstalledFuturePinballArchive = { tables: [], copied: [], kept: [], ignored: plan.ignored };
  for (const f of plan.files) {
    let to = f.to;
    if (fs.existsSync(to)) {
      if (sameContent(f.from, to)) {
        done.kept.push(to);
        if (f.kind === 'table') done.tables.push(to);
        continue;
      }
      if (f.kind !== 'table') {
        done.kept.push(to);
        continue;
      }
      to = freeName(to);
    }
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.copyFile(f.from, to);
    done.copied.push(to);
    if (f.kind === 'table') done.tables.push(to);
  }
  return done;
}
