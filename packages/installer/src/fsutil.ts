import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry, t } from '@cyberpinball/core';

export function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Délai d'une extraction (VPX complet compris, sur un disque lent). */
export const EXTRACT_TIMEOUT_MS = 10 * 60_000;

/**
 * Extrait une archive zip avec le tar de Windows (bsdtar, présent depuis Windows 10 1803).
 * On appelle celui de System32 explicitement : celui de Git pour Windows ne lit pas les zip.
 */
export function extractZip(archive: string, destination: string, members: readonly string[] = []): void {
  fs.mkdirSync(destination, { recursive: true });
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  // Jamais sans fin : une archive illisible ou un disque bloqué arrête l'installation avec une erreur.
  // `members` : seulement ces chemins de l'archive (remise de fichiers d'origine, component-files.ts).
  execFileSync(tar, ['-xf', archive, '-C', destination, ...members], { stdio: 'ignore', windowsHide: true, timeout: EXTRACT_TIMEOUT_MS });
}

/** Si l'archive contient un seul dossier de premier niveau, on remonte son contenu. */
export function flattenSingleFolder(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0]!.isDirectory()) return;
  const inner = path.join(dir, entries[0]!.name);
  for (const name of fs.readdirSync(inner)) renameWithRetry(path.join(inner, name), path.join(dir, name));
  fs.rmdirSync(inner);
}

/**
 * L'exécutable du composant dans `dir` : `preferred` (Component.executable) quand il est là, sinon le
 * premier nom qui répond à `pattern`. Sans cette préférence, un VPX64.exe d'une autre version posé à
 * côté de VPinballX_BGFX64.exe passait devant lui dans l'ordre alphabétique (« 6 » avant « _ »), et
 * Cyber Pinball lançait cet autre VPX.
 */
export function findExecutable(dir: string, pattern: string, preferred?: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const re = new RegExp(pattern, 'i');
  const names = fs.readdirSync(dir);
  const name = (preferred && names.find((f) => f.toLowerCase() === preferred.toLowerCase())) || names.find((f) => re.test(f));
  return name ? path.join(dir, name) : undefined;
}

/**
 * Fait pointer la jonction « current » vers une version. Une jonction ne
 * demande pas de droits administrateur, contrairement à un lien symbolique.
 * On refuse de toucher à « current » s'il s'agit d'un vrai dossier.
 */
export function pointJunction(junction: string, target: string): void {
  if (fs.existsSync(junction) || isLink(junction)) {
    if (!isLink(junction)) throw new Error(t('{path} est un vrai dossier, pas une jonction : je ne le remplace pas.', { path: junction }));
    // Sur une jonction, rmdir supprime le lien sans toucher au dossier cible.
    fs.rmdirSync(junction);
  }
  fs.symlinkSync(target, junction, 'junction');
}

export function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function freeBytes(dir: string): number | undefined {
  try {
    const stats = fs.statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return undefined;
  }
}
