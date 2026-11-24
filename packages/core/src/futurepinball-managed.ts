// Future Pinball installé par Cyber Pinball (24/11/2026), dans son dossier géré
// <racine>\emulators\futurepinball, comme VPX l'est dans <racine>\emulators\vpx.
//
// Cyber Pinball ne livre pas Future Pinball et ne l'héberge pas : le site de son auteur le dit gratuit à
// télécharger et à utiliser, sans rien dire de sa redistribution, et BAM (« Freeware » chez son auteur)
// pas davantage. Le jeu est donc téléchargé à la demande du joueur, chez l'auteur de BAM (installateur
// « 2-en-1 » : Future Pinball et BAM), puis ses fichiers en sont extraits sans modification dans le dossier
// géré (composants « future-pinball » et « innoextract » du manifeste de l'installateur,
// app/src/futurepinball-install.ts). L'installateur n'est pas exécuté : son mode silencieux ne passe pas sa
// page de licence ; ses deux contrats (futurepinball-licenses.ts) sont montrés en entier au joueur, qui les
// accepte avant l'extraction, et son accord est gardé à côté du jeu.
//
// Ici, ce qui ne touche ni au réseau ni à l'écran : l'emplacement, la ligne de commande de l'extraction,
// la pose des fichiers extraits, le contrôle du résultat, l'accord gardé, et le plan de reprise des tables
// d'une installation existante (copie, jamais un déplacement : l'ancienne installation n'est pas modifiée).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetryAsync } from './atomicwrite';
import { layoutOf } from './locations';

/** Dossier du jeu dans <racine>\emulators. */
export const FUTURE_PINBALL_MANAGED_FOLDER = 'futurepinball';

/**
 * Place à avoir sur le disque de Cyber Pinball avant de télécharger (24/11/2026) : l'installateur (47 Mo),
 * innoextract (moins d'1 Mo), le jeu et BAM extraits (113 Mo, déplacés sur le même disque) et de la marge
 * pour les tables et les médias qui suivent. Mesuré sur la borne : 118 Mo de fichiers posés.
 */
export const FUTURE_PINBALL_NEEDED_BYTES = 300 * 1024 * 1024;

/** Octets libres du disque qui porte `dir` (ou son plus proche dossier existant) ; undefined si Windows ne le dit pas. */
export function freeBytesAt(dir: string, statfs: (p: string) => { bavail: number | bigint; bsize: number | bigint } = (p) => fs.statfsSync(p)): number | undefined {
  let at = path.resolve(dir);
  for (let i = 0; i < 64; i++) {
    try {
      const stat = statfs(at);
      return Number(stat.bavail) * Number(stat.bsize);
    } catch {
      const parent = path.dirname(at);
      if (parent === at) return undefined;
      at = parent;
    }
  }
  return undefined;
}

export type FuturePinballSpaceCheck = { ok: true; free: number | undefined } | { ok: false; free: number; needed: number };

/** La place libre suffit-elle ? Une mesure impossible ne bloque pas : l'installation s'essaie, son échec est expliqué. */
export function checkFuturePinballSpace(dir: string, free: (dir: string) => number | undefined = freeBytesAt, needed = FUTURE_PINBALL_NEEDED_BYTES): FuturePinballSpaceCheck {
  const bytes = free(dir);
  if (bytes === undefined || bytes >= needed) return { ok: true, free: bytes };
  return { ok: false, free: bytes, needed };
}

/** Dossier géré par Cyber Pinball (le jeu y est installé, ou le sera). */
export function managedFuturePinballDir(root: string): string {
  return path.join(layoutOf(root).emulators, FUTURE_PINBALL_MANAGED_FOLDER);
}

/**
 * Ligne de commande d'innoextract (composant « innoextract ») : extrait tout l'installateur dans
 * `staging` (le jeu sous app\, deux images de l'assistant sous tmp\), sans avertissement sur les
 * fichiers inutilisés, sans barre de progression. Le mode silencieux de l'installateur lui-même
 * ne passe pas sa page de licence (une page Pascal Script dont « Suivant » reste grisé tant que la
 * case n'est pas cochée) : on n'exécute donc pas l'installateur, on en lit les fichiers.
 */
export function futurePinballExtractArgs(installer: string, staging: string): string[] {
  return ['--extract', '--silent', '--no-warn-unused', '--output-dir', staging, installer];
}

/** Dossier du jeu dans ce que l'extraction écrit : <extraction>\app. */
export const FUTURE_PINBALL_EXTRACTED_APP = 'app';

/**
 * Préférences que l'installateur de l'auteur écrit dans le registre (HKCU), relevées sur la borne le
 * 24/11/2026 en l'observant : ce sont les valeurs d'une installation neuve. Écrites seulement si
 * elles sont absentes, jamais par-dessus un réglage du joueur (futurepinball-registry.ts, app).
 */
export const FUTURE_PINBALL_DEFAULT_PREFERENCES: readonly { key: string; name: string; value: number }[] = [
  { key: 'Software\\Future Pinball\\Editor', name: 'LoadImagesIntoEditor', value: 0 },
  { key: 'Software\\Future Pinball\\Editor', name: 'NumberShapePoints', value: 0 },
  { key: 'Software\\Future Pinball\\Editor', name: 'PolygonInfo', value: 0 },
  { key: 'Software\\Future Pinball\\GamePlayer', name: 'BallDirt', value: 1 },
  { key: 'Software\\Future Pinball\\GamePlayer', name: 'CpuAffinity', value: 0 },
  { key: 'Software\\Future Pinball\\GamePlayer', name: 'ModelRenderQuality', value: 2 },
];

/**
 * Dossiers de l'installation où un fichier déjà là est celui du joueur (ses tables, ses musiques, les
 * réglages de BAM par table, la mémoire des tables) : l'extraction n'y écrase rien. Tout le reste est du
 * programme, remplacé par la version de l'installateur (une réparation remet les fichiers d'origine).
 */
export const FUTURE_PINBALL_KEPT_FOLDERS: readonly string[] = ['Tables', 'Libraries', 'Music', 'Scripts', 'BAM/cfg', 'fpRAM'];

export interface MovedFuturePinball {
  /** Fichiers posés dans le dossier géré (nouveaux ou remplacés). */
  placed: number;
  /** Fichiers du joueur laissés tels quels (déjà là, dans un dossier à lui). */
  kept: number;
}

function isKept(relative: string): boolean {
  const normal = relative.split(path.sep).join('/').toLowerCase();
  return FUTURE_PINBALL_KEPT_FOLDERS.some((folder) => normal.startsWith(`${folder.toLowerCase()}/`));
}

/**
 * Pose le contenu extrait (`from`, le dossier app\ de l'extraction) dans le dossier géré (`to`) : un
 * déplacement quand c'est possible (même volume), sinon une copie. Les fichiers du joueur ne sont pas
 * écrasés (FUTURE_PINBALL_KEPT_FOLDERS). Lève une erreur au premier fichier impossible à poser (un
 * exécutable que le jeu tient ouvert) : l'installation est alors à refaire, jamais à moitié annoncée réussie.
 */
export async function moveExtractedFuturePinball(from: string, to: string): Promise<MovedFuturePinball> {
  const result: MovedFuturePinball = { placed: 0, kept: 0 };
  for (const file of walk(from)) {
    const relative = path.relative(from, file);
    const target = path.join(to, relative);
    if (isKept(relative) && fs.existsSync(target)) {
      result.kept++;
      continue;
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.promises.rm(target, { force: true });
      await renameWithRetryAsync(file, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.promises.copyFile(file, target);
      await fs.promises.rm(file, { force: true });
    }
    result.placed++;
  }
  return result;
}

/**
 * Pages d'un contrat pour l'écran : les paragraphes dans l'ordre, jamais coupés, regroupés tant que la
 * page ne dépasse pas `maxChars` (un paragraphe plus long que la limite a sa page à lui).
 */
export function licensePages(paragraphs: readonly string[], maxChars = 1500): string[][] {
  const pages: string[][] = [];
  let page: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    if (page.length && size + paragraph.length > maxChars) {
      pages.push(page);
      page = [];
      size = 0;
    }
    page.push(paragraph);
    size += paragraph.length;
  }
  if (page.length) pages.push(page);
  return pages;
}

/** Fichier où l'accord du joueur est gardé, à côté du jeu. */
export const FUTURE_PINBALL_LICENSE_RECORD = 'cyberpinball-licences.json';

export interface FuturePinballLicenseAcceptance {
  version: 1;
  /** ISO 8601 : quand le joueur a dit oui. */
  acceptedAt: string;
  /** Installateur dont les contrats ont été montrés (SHA-256 et version du composant). */
  installer: { sha256: string; version: string };
  /** Les contrats montrés en entier et acceptés, avec l'empreinte de leur texte. */
  licenses: { id: string; author: string; sha256: string }[];
}

/** Empreinte du texte d'un contrat (ses paragraphes joints par des sauts de ligne). */
export function licenseTextHash(paragraphs: readonly string[]): string {
  return crypto.createHash('sha256').update(paragraphs.join('\n'), 'utf8').digest('hex');
}

/** Garde l'accord du joueur dans le dossier géré (créé au besoin). Rend ce qui a été écrit. */
export function recordFuturePinballLicensesAccepted(
  dir: string,
  installer: { sha256: string; version: string },
  licenses: readonly { id: string; author: string; paragraphs: readonly string[] }[],
  now: Date = new Date(),
): FuturePinballLicenseAcceptance {
  const record: FuturePinballLicenseAcceptance = {
    version: 1,
    acceptedAt: now.toISOString(),
    installer,
    licenses: licenses.map((l) => ({ id: l.id, author: l.author, sha256: licenseTextHash(l.paragraphs) })),
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FUTURE_PINBALL_LICENSE_RECORD), JSON.stringify(record, null, 2) + '\n');
  return record;
}

/** L'accord gardé, ou rien (absent, illisible). */
export function readFuturePinballLicenseAcceptance(dir: string): FuturePinballLicenseAcceptance | undefined {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(dir, FUTURE_PINBALL_LICENSE_RECORD), 'utf8').replace(/^﻿/, '')) as FuturePinballLicenseAcceptance;
    return record?.version === 1 && typeof record.acceptedAt === 'string' ? record : undefined;
  } catch {
    return undefined;
  }
}

export interface ManagedFuturePinballCheck {
  /** « Future Pinball.exe » est là : le jeu se lance. */
  ok: boolean;
  /** BAM (BAM\FPLoader.exe) est là : les tables récentes se jouent. */
  bam: boolean;
  /** Fichiers attendus qui manquent (chemins relatifs). */
  missing: string[];
}

/** Ce que l'installateur a laissé dans le dossier géré. Un dossier absent : rien. */
export function checkManagedFuturePinball(dir: string, exists: (p: string) => boolean = fs.existsSync): ManagedFuturePinballCheck {
  const expected = ['Future Pinball.exe', path.join('BAM', 'FPLoader.exe')];
  const missing = expected.filter((f) => !exists(path.join(dir, f)));
  return { ok: !missing.includes(expected[0]!), bam: !missing.includes(expected[1]!), missing };
}

/** Dossiers d'une installation existante qui portent le contenu du joueur (BAM et le jeu sont réinstallés, pas copiés). */
export const FUTURE_PINBALL_MIGRATED_FOLDERS = ['Tables', 'Libraries', 'Music', 'Scripts'] as const;

export interface FuturePinballMigrationFolder {
  folder: (typeof FUTURE_PINBALL_MIGRATED_FOLDERS)[number];
  /** Fichiers à copier (absents de la destination). */
  files: string[];
  /** Leur taille totale, en octets. */
  bytes: number;
  /** Fichiers déjà à la destination, laissés tels quels. */
  present: number;
}

export interface FuturePinballMigrationPlan {
  from: string;
  to: string;
  folders: FuturePinballMigrationFolder[];
  files: number;
  bytes: number;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Ce que reprendre une installation existante copierait dans le dossier géré : les tables, bibliothèques,
 * musiques et scripts qui n'y sont pas déjà. Rien n'est écrit ; l'écran montre ce plan (fichiers, taille,
 * destination) avant que le joueur dise oui.
 */
export function planFuturePinballMigration(from: string, to: string): FuturePinballMigrationPlan {
  const src = path.resolve(from);
  const dest = path.resolve(to);
  const folders: FuturePinballMigrationFolder[] = [];
  if (src.toLowerCase() !== dest.toLowerCase()) {
    for (const folder of FUTURE_PINBALL_MIGRATED_FOLDERS) {
      const base = path.join(src, folder);
      const files: string[] = [];
      let bytes = 0;
      let present = 0;
      for (const file of walk(base)) {
        if (fs.existsSync(path.join(dest, folder, path.relative(base, file)))) {
          present++;
          continue;
        }
        try {
          bytes += fs.statSync(file).size;
        } catch {
          continue;
        }
        files.push(file);
      }
      if (files.length || present) folders.push({ folder, files, bytes, present });
    }
  }
  return { from: src, to: dest, folders, files: folders.reduce((n, f) => n + f.files.length, 0), bytes: folders.reduce((n, f) => n + f.bytes, 0) };
}

/** Copie le plan : jamais d'écrasement, jamais de suppression ni de déplacement à la source. Rend le nombre de fichiers copiés. */
export async function migrateFuturePinball(plan: FuturePinballMigrationPlan, onFile?: (done: number, total: number) => void): Promise<number> {
  let done = 0;
  for (const f of plan.folders) {
    const base = path.join(plan.from, f.folder);
    for (const file of f.files) {
      const target = path.join(plan.to, f.folder, path.relative(base, file));
      done++;
      onFile?.(done, plan.files);
      if (fs.existsSync(target)) continue;
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(file, target, fs.constants.COPYFILE_EXCL);
    }
  }
  return done;
}
