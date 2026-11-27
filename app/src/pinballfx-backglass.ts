// Image de fronton d'une table de Pinball FX (2023), déposée avant la partie. En mode borne, la fenêtre du
// fronton du jeu ne montre qu'une image : « Table_<numéro>.png » du dossier PinballFX\Mods\Cabinet, sinon
// PFX.png (FAQ du mode borne de Zen, pinballfx.com/?page_id=7754 ; PNG seulement). Le jeu n'a pas de fronton
// à lui : sans l'image, il écrit le chemin cherché en blanc sur noir (capture sur le PinCab, 27/11/2026).
// Cyber Pinball dépose donc l'image de fronton qu'il a pour la table (ses médias, récupérés à l'ajout),
// convertie en PNG au besoin. Une image déjà là (celle du joueur, d'un pack) n'est jamais remplacée. Rien
// pour une vidéo de fronton. Sans image, la fenêtre du jeu reste éteinte (frontend.ts, playPinballFx).
import { mediaKind, pinballFxBackglassFile, renameWithRetry, writeFileAtomic, type PinballFxInstall } from '@cyberpinball/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type BackglassPlacement = 'placed' | 'present' | 'no-media' | 'failed';

/** Image PNG d'un fichier image (Electron : nativeImage) ; vide si illisible. */
export function electronPng(file: string): Buffer {
  // Chargé à l'usage : les essais, sans Electron, passent leur propre conversion.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require('electron') as typeof import('electron');
  return nativeImage.createFromPath(file).toPNG();
}

/** Image du fronton de Pinball FX hors d'une table (menus, attente), dans son dossier du mode borne. */
export const PINBALLFX_HOME_BACKGLASS = 'PFX.png';

/** PNG noir 16 × 9 (le jeu l'étire à sa fenêtre) : mieux que le chemin cherché écrit en blanc. */
function blackPng(): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require('electron') as typeof import('electron');
  const bgra = Buffer.alloc(16 * 9 * 4);
  for (let i = 3; i < bgra.length; i += 4) bgra[i] = 255;
  return nativeImage.createFromBitmap(bgra, { width: 16, height: 9 }).toPNG();
}

/**
 * Fronton de Pinball FX dans ses menus (PFX.png ; essai du 20/11/2026 : sans lui, le jeu écrit
 * « ../../../PinballFX/Mods/Cabinet/PFX.png » dans sa fenêtre du fronton) : le fronton par défaut de
 * la borne dans Cyber Pinball (<racine>\media\(Backglass).*), sinon une image noire. Jamais à la place
 * d'une PFX.png déjà là.
 */
export function placePinballFxHomeBackglass(
  install: Pick<PinballFxInstall, 'cabinetDir'>,
  source: string | undefined,
  toPng: (file: string) => Buffer = electronPng,
  blank: () => Buffer = blackPng,
): { result: BackglassPlacement; target: string; reason?: string } {
  const target = path.join(install.cabinetDir, PINBALLFX_HOME_BACKGLASS);
  if (fs.existsSync(target)) return { result: 'present', target };
  if (source && mediaKind(source) === 'image') {
    const placed = placePinballFxBackglassAt(target, source, toPng);
    if (placed.result === 'placed') return placed;
  }
  try {
    writeFileAtomic(target, blank());
    return { result: 'placed', target };
  } catch (error) {
    return { result: 'failed', target, reason: (error as Error).message };
  }
}

/**
 * Dépose `source` (image de fronton de la table dans Cyber Pinball) comme fronton de la table `tableId`
 * de Pinball FX, s'il n'y en a pas déjà un. Rend ce qui a été fait.
 */
export function placePinballFxBackglass(
  install: Pick<PinballFxInstall, 'cabinetDir'>,
  tableId: number,
  source: string | undefined,
  toPng: (file: string) => Buffer = electronPng,
): { result: BackglassPlacement; target: string; reason?: string } {
  const target = pinballFxBackglassFile(install as PinballFxInstall, tableId);
  if (fs.existsSync(target)) return { result: 'present', target };
  if (!source || mediaKind(source) !== 'image') return { result: 'no-media', target };
  return placePinballFxBackglassAt(target, source, toPng);
}

/** `source` déposée en PNG sous `target` : copiée si c'en est un, convertie sinon. */
function placePinballFxBackglassAt(target: string, source: string, toPng: (file: string) => Buffer): { result: BackglassPlacement; target: string; reason?: string } {
  try {
    // Un PNG est copié tel quel, sans le charger en mémoire (une image de fronton pèse plusieurs Mo) ;
    // copie à côté puis renommage : jamais un fichier à moitié écrit sous le nom que le jeu lit.
    if (path.extname(source).toLowerCase() === '.png') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const part = `${target}.part`;
      fs.copyFileSync(source, part);
      renameWithRetry(part, target);
      return { result: 'placed', target };
    }
    const png = toPng(source);
    if (!png.length) return { result: 'failed', target, reason: 'image illisible' }; // i18n-ignore : journal
    writeFileAtomic(target, png);
    return { result: 'placed', target };
  } catch (error) {
    return { result: 'failed', target, reason: (error as Error).message };
  }
}
