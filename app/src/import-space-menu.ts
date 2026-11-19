// Place disque dans le plan d'installation (importspace.ts) : ce que l'import écrira sur chaque
// disque et la place libre, en tête du plan. Un disque trop plein retire « Installer » : la copie
// ne commence pas pour s'arrêter au milieu, disque plein.

import { formatSize, IMPORT_SPACE_MARGIN, t, type ImportSpace } from '@cyberpinball/core';
import type { Row, Section } from './library-types';

/** Section « Place sur le disque » du plan ; rien quand l'import ne copie rien. */
export function importSpaceSection(space: ImportSpace | undefined): Section | undefined {
  if (!space?.disks.length) return undefined;
  const rows: Row[] = space.disks.map((d) =>
    d.short
      ? {
          text: t('Pas assez de place sur {disk} : il faut {need}, {free} libres', { disk: d.root, need: formatSize(d.need + IMPORT_SPACE_MARGIN), free: formatSize(d.free ?? 0) }),
          detail: t('{copied} à copier, et {margin} gardé libre pour Windows. Libérez de la place sur ce disque, ou choisissez moins de tables.', { copied: formatSize(d.need), margin: formatSize(IMPORT_SPACE_MARGIN) }),
          tone: 'error',
        }
      : {
          text: t('{need} à copier sur {disk}', { need: formatSize(d.need), disk: d.root }),
          detail: d.free !== undefined ? t('{free} libres', { free: formatSize(d.free) }) : t('Place libre inconnue'),
          tone: 'quiet',
        },
  );
  return { title: t('Place sur le disque'), rows };
}

/** Vrai si un disque n'a pas la place : « Installer » n'est pas proposé. */
export function importSpaceShort(space: ImportSpace | undefined): boolean {
  return Boolean(space?.disks.some((d) => d.short));
}
