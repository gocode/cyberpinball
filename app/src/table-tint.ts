// Couleur de chaque table au menu (packages/core/src/tabletint.ts) : la teinte de la table montrée,
// tirée de ses médias dans l'ordre fronton (l'image allumée du .directb2s comprise), logo, plateau ;
// le premier qui a assez de couleur la donne. La couleur des points du DMD (« Couleur de la table »)
// se mesure d'abord sur le média de l'écran du DMD (FullDMD, ou capture du DMD de la machine) : plus
// proche du vrai DMD que le fronton (demande du 12/11/2026) ; sans teinte là, celle du fronton.
// Calculée une fois par fichier, gardée dans
// <données>\cache\teintes-tables.json, refaite quand le média change (chemin, taille, date).
//
// Rien n'est calculé pendant le défilement : la teinte montrée ne change que lorsque la table
// choisie est restée en place SETTLE_MS ; d'ici là, l'ambiance garde la teinte d'avant (pas de
// clignotement à chaque cran), puis passe à la nouvelle en fondu (theme.css, 280 ms). Une seule
// mesure à la fois, par le convertisseur hors écran (media-convert.ts) : quelques dizaines de
// points de large, une image, ou quatre moments d'une vidéo.

import * as path from 'node:path';
import { cachedTint, mediaKind, storeTint, tableTint, tintCacheFile, tintCacheKey, VIDEO_FRAME_TIMES, type TableTint, type TintRecord } from '@cyberpinball/core';
import type { Converter } from './media-convert';

/** Attente après le dernier changement de table avant de chercher sa teinte. */
export const SETTLE_MS = 260;
/** Largeur des images mesurées : assez pour la teinte dominante, rien pour le processeur. */
const SAMPLE_WIDTH = 64;

export interface TableTintsOptions {
  dataDir: string;
  converter: () => Pick<Converter, 'mediaFrames'>;
  /** La table montrée a une nouvelle teinte (ou plus de teinte) : l'état est à renvoyer. */
  onChange: () => void;
  settleMs?: number;
}

/** Sujet des écrans : une clé (la table et ses médias), et les fichiers à lire dans l'ordre. */
export interface TintSubject {
  key: string;
  files: readonly string[];
  /** Pour les points du DMD, lus avant `files` : le média de l'écran du DMD. */
  dmdFiles?: readonly string[];
}

/** Teinte montrée : celle de l'ambiance (color absente : la sarcelle de la marque), et les points du DMD. */
export type ShownTint = Partial<TableTint>;

export class TableTints {
  private readonly cacheFile: string;
  private readonly memo = new Map<string, TintRecord>();
  private shown?: ShownTint;
  private pendingKey?: string;
  private timer?: NodeJS.Timeout;
  private run = 0;

  constructor(private readonly opts: TableTintsOptions) {
    this.cacheFile = tintCacheFile(opts.dataDir);
  }

  /** Teinte à montrer (undefined : la sarcelle de la marque). */
  current(): ShownTint | undefined {
    return this.shown;
  }

  /**
   * Table montrée par les écrans (undefined : aucune, ou couleur coupée) : à chaque état envoyé.
   * Rapide : ne fait qu'armer une attente quand le sujet change.
   */
  follow(subject: TintSubject | undefined): void {
    const key = subject?.key ?? '';
    if (key === this.pendingKey) return;
    this.pendingKey = key;
    clearTimeout(this.timer);
    this.timer = undefined;
    const run = ++this.run;
    if (!subject) {
      // Plus de table (menu système, réglages, couleur coupée) : la sarcelle, sans attendre.
      return this.settle(undefined);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.resolveSubject(subject).then((tint) => {
        if (run === this.run) this.settle(tint);
      });
    }, this.opts.settleMs ?? SETTLE_MS);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.run++;
  }

  /** Ambiance d'après `files` ; points du DMD d'après `dmdFiles`, sinon ceux de l'ambiance. */
  private async resolveSubject(subject: TintSubject): Promise<ShownTint | undefined> {
    const ambient = await this.resolve(subject.files);
    const dmd = (subject.dmdFiles?.length ? await this.resolve(subject.dmdFiles) : undefined)?.dmd ?? ambient?.dmd;
    if (!ambient && !dmd) return undefined;
    return { ...ambient, ...(dmd && { dmd }) };
  }

  private settle(tint: ShownTint | undefined): void {
    const changed = this.shown?.color !== tint?.color || this.shown?.dmd !== tint?.dmd;
    this.shown = tint;
    if (changed) this.opts.onChange();
  }

  /** Teinte du premier fichier qui en a une. */
  private async resolve(files: readonly string[]): Promise<TableTint | undefined> {
    for (const file of files) {
      const record = await this.measure(file);
      if (record && 'tint' in record) return record.tint;
    }
    return undefined;
  }

  /** Mesure d'un fichier : en mémoire, dans le cache, sinon par le convertisseur (gardée). */
  private async measure(file: string): Promise<TintRecord | undefined> {
    // En mémoire par la même clé que le cache (chemin, taille, date) : un média remplacé est relu.
    const id = tintCacheKey(file);
    if (!id) return undefined;
    const known = this.memo.get(id) ?? cachedTint(this.cacheFile, file);
    if (known) {
      this.memo.set(id, known);
      return known;
    }
    const kind = mediaKind(file);
    if (kind !== 'image' && kind !== 'video') return undefined;
    try {
      const got = await this.opts.converter().mediaFrames(file, kind === 'video' ? VIDEO_FRAME_TIMES : [0], SAMPLE_WIDTH);
      const result = tableTint(got.images);
      const record: TintRecord = typeof result === 'string' ? { refused: result } : { tint: result };
      this.memo.set(id, record);
      storeTint(this.cacheFile, file, record);
      return record;
    } catch (error) {
      // Média illisible : pas de teinte pour lui, sans rien garder (il sera relu s'il change).
      console.log(`Couleur de la table : ${path.basename(file)} illisible (${(error as Error).message}).`);
      return undefined;
    }
  }
}
