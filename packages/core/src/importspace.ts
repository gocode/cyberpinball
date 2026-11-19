// Place que demande un plan d'installation, disque par disque, comparée à la place libre. Elle se
// dit dans le plan, avant « Installer » : la reprise d'une installation existante copie tout (des
// centaines de tables avec leurs PuP-Packs), et un disque plein au milieu de la copie laissait des
// tables à moitié installées après une longue attente (19/11/2026, installation de plus de 600 tables).

import * as path from 'node:path';
import { formatSize, sameVolume, sizeOf } from './fileops';
import { diskSpace } from './health';
import { t } from './i18n';
import type { RomZipMember } from './romzip';
import type { ImportPlan } from './tableimport';

/** Place gardée libre après l'import : Windows, ses mises à jour et ses fichiers temporaires en ont besoin. */
export const IMPORT_SPACE_MARGIN = 1024 ** 3;

export interface DiskNeed {
  /** Racine du disque (« D:\ »). */
  root: string;
  /** Octets que l'import y écrira. */
  need: number;
  /** Octets libres ; absent si le disque ne répond pas. */
  free?: number;
  /** Vrai : need et la marge dépassent la place libre. */
  short: boolean;
}

export interface ImportSpace {
  /** Total écrit, tous disques confondus. */
  bytes: number;
  /** Disques qui reçoivent quelque chose. */
  disks: DiskNeed[];
}

export interface ImportSpaceOptions {
  /** Taille d'un fichier ou d'un dossier, gardée d'un calcul à l'autre (le plan se refait à chaque choix). */
  sizes?: Map<string, number>;
  /** Place libre du disque d'un dossier (essais). */
  free?: (dir: string) => number | undefined;
}

/**
 * Ce que l'import écrira, disque par disque : chaque copie, chaque déplacement d'un disque à
 * l'autre, chaque ROM refaite à plat ou copiée dans une table d'un autre disque. Un déplacement
 * sur le même disque n'est qu'un renommage : il ne compte pas.
 */
export function importSpace(plan: ImportPlan, opts: ImportSpaceOptions = {}): ImportSpace {
  const sizes = opts.sizes ?? new Map<string, number>();
  const size = (p: string) => {
    const key = p.toLowerCase();
    let n = sizes.get(key);
    if (n === undefined) sizes.set(key, (n = sizeOf(p)));
    return n;
  };
  const zipSize = (files: RomZipMember[]) => [...new Set(files.map((f) => f.from))].reduce((n, f) => n + size(f), 0);
  const needs = new Map<string, number>();
  const add = (to: string, bytes: number) => {
    if (!bytes) return;
    const root = path.parse(path.resolve(to)).root.toUpperCase();
    needs.set(root, (needs.get(root) ?? 0) + bytes);
  };
  for (const table of plan.tables) {
    for (const s of table.steps) {
      if (s.zip) add(s.to, zipSize(s.zip.files));
      else if (s.mode === 'copy' || !sameVolume(s.from, s.to)) add(s.to, size(s.from));
    }
  }
  for (const r of plan.roms) {
    const kept = r.versions[r.keep];
    if (!kept) continue;
    if (!kept.inLibrary) {
      if (kept.build) add(r.to, zipSize(kept.build));
      else if (kept.from && (kept.mode === 'copy' || !sameVolume(kept.from, r.to))) add(r.to, kept.size);
    }
    // Une table d'un autre disque que la bibliothèque reçoit une copie, pas un lien.
    for (const l of r.links) if (l.copy && l.state !== 'linked') add(l.to, kept.size);
  }
  const measure = opts.free ?? ((dir: string) => diskSpace(dir)?.free);
  const disks = [...needs].map(([root, need]): DiskNeed => {
    const free = measure(root);
    return { root, need, ...(free !== undefined ? { free } : {}), short: free !== undefined && need + IMPORT_SPACE_MARGIN > free };
  });
  return { bytes: disks.reduce((n, d) => n + d.need, 0), disks };
}

/** « Pas assez de place sur D:\ : il faut 182 Go, 40 Go libres » pour chaque disque trop plein ; vide s'il y a la place. */
export function importSpaceProblems(space: ImportSpace): string[] {
  return space.disks
    .filter((d) => d.short)
    .map((d) => t('Pas assez de place sur {disk} : il faut {need}, {free} libres.', { disk: d.root, need: formatSize(d.need + IMPORT_SPACE_MARGIN), free: formatSize(d.free ?? 0) }));
}
