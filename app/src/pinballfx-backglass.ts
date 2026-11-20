// Image de fronton d'une table de Pinball FX (2023), déposée avant la partie (20/11/2026). En mode borne,
// la fenêtre du fronton du jeu montre « Table_<numéro>.png » du dossier PinballFX\Mods\Cabinet, sinon
// PFX.png (FAQ du mode borne de Zen, pinballfx.com/?page_id=7754 ; PNG seulement). Aucun catalogue
// public ne les fournit de façon durable : Cyber Pinball dépose l'image de fronton qu'il a déjà pour la
// table (ses médias : VPS, VPinMediaDB, reprise de PinUP Popper…), convertie en PNG au besoin. Une image
// déjà là (celle du joueur, d'un pack) n'est jamais remplacée. Rien pour une vidéo de fronton.

import { mediaKind, pinballFxBackglassFile, renameWithRetry, writeFileAtomic, type PinballFxInstall } from '@cyberpinball/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type BackglassPlacement = 'placed' | 'present' | 'no-media' | 'failed';

/** Image PNG d'un fichier image (Electron : nativeImage) ; vide si illisible. */
function electronPng(file: string): Buffer {
  // Chargé à l'usage : les essais, sans Electron, passent leur propre conversion.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require('electron') as typeof import('electron');
  return nativeImage.createFromPath(file).toPNG();
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
