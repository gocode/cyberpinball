// Parties d'un jeu installé, pour l'écran « Parties du jeu » de la fiche : ce que le dossier
// de la table contient déjà, partie par partie (table, fronton, ROM, PuP-Pack, couleurs du
// DMD, sons, musique, point de vue, réglages propres, médias du menu), d'après l'inventaire
// des fichiers (tablecontents.ts). Les parties sont celles de la liste d'attente
// (acquisition.ts, NeedKind), plus les réglages propres de la table (.ini), que VPS ne liste pas.

import { NEED_LABELS, type NeedKind } from './acquisition';
import { t } from './i18n';
import type { TableContents, TableFileEntry } from './tablecontents';
import type { FileKind } from './tablefiles';

export type GamePart = NeedKind | 'ini';

/** Parties montrées pour une table installée, dans l'ordre de l'écran. Le topper, sans dossier à lui, n'y est pas. */
export const GAME_PARTS: readonly GamePart[] = ['table', 'b2s', 'rom', 'pup', 'altcolor', 'altsound', 'music', 'pov', 'ini', 'media'];

/** « PuP-Pack », « Réglages propres (.ini) » */
export function partLabel(part: GamePart): string {
  return part === 'ini' ? t('Réglages propres (.ini)') : NEED_LABELS[part];
}

const FROM_FILE_KIND: Partial<Record<FileKind, GamePart>> = {
  table: 'table',
  backglass: 'b2s',
  rom: 'rom',
  pup: 'pup',
  serum: 'altcolor',
  vni: 'altcolor',
  altsound: 'altsound',
  music: 'music',
  pov: 'pov',
  tableIni: 'ini',
  media: 'media',
};

/** Partie d'un jeu à laquelle appartient un fichier du dossier de la table ; undefined : aucune (script, sauvegarde…). */
export function partOfFileKind(kind: FileKind): GamePart | undefined {
  return FROM_FILE_KIND[kind];
}

export interface InstalledPart {
  part: GamePart;
  /** Fichiers et dossiers de la table qui la font (un PuP-Pack est un dossier). */
  entries: TableFileEntry[];
  size: number;
}

/** Parties présentes dans le dossier d'une table ; les fichiers attendus mais absents n'en font pas. */
export function installedParts(contents: TableContents): Map<GamePart, InstalledPart> {
  const parts = new Map<GamePart, InstalledPart>();
  for (const entry of contents.entries) {
    const part = partOfFileKind(entry.kind);
    if (!part || entry.missing) continue;
    const known = parts.get(part) ?? { part, entries: [], size: 0 };
    known.entries.push(entry);
    known.size += entry.size;
    parts.set(part, known);
  }
  return parts;
}
