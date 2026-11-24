// Future Pinball installé par Cyber Pinball (24/11/2026), dans son dossier géré
// <racine>\emulators\futurepinball, comme VPX l'est dans <racine>\emulators\vpx.
//
// Cyber Pinball ne livre pas Future Pinball et ne l'héberge pas : le site de son auteur le dit gratuit à
// télécharger et à utiliser, sans rien dire de sa redistribution, et BAM (« Freeware » chez son auteur)
// pas davantage. Le jeu est donc téléchargé à la demande du joueur, chez l'auteur de BAM (installateur
// « 2-en-1 » : Future Pinball et BAM), puis installé sans fenêtre dans le dossier géré (composant
// « future-pinball » du manifeste de l'installateur, app/src/futurepinball-install.ts).
//
// Ici, ce qui ne touche ni au réseau ni à l'écran : l'emplacement, la ligne de commande de l'installateur,
// le contrôle du résultat, et le plan de reprise des tables d'une installation existante (copie, jamais un
// déplacement : l'ancienne installation n'est pas modifiée).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { layoutOf } from './locations';

/** Dossier du jeu dans <racine>\emulators. */
export const FUTURE_PINBALL_MANAGED_FOLDER = 'futurepinball';

/** Dossier géré par Cyber Pinball (le jeu y est installé, ou le sera). */
export function managedFuturePinballDir(root: string): string {
  return path.join(layoutOf(root).emulators, FUTURE_PINBALL_MANAGED_FOLDER);
}

/**
 * Ligne de commande de l'installateur (Inno Setup) : sans fenêtre, sans redémarrage, sans raccourcis,
 * dans le dossier géré, avec un journal à lire si le résultat n'est pas celui attendu.
 */
export function futurePinballInstallerArgs(base: readonly string[], dir: string, log: string): string[] {
  return [...base, `/DIR=${dir}`, `/LOG=${log}`];
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
