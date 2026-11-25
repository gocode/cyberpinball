// Couleur de chaque table au menu (packages/core/src/tabletint.ts) : la teinte de la table montrée,
// tirée de ses médias dans l'ordre fronton (l'image allumée du .directb2s comprise), plateau, logo ;
// le premier qui a assez de couleur la donne. Les couleurs des LED mêlent les dominantes du fronton et
// du plateau (mergeLedPalettes). La couleur des points du DMD (« Couleur de la table »)
// se mesure d'abord sur le média de l'écran du DMD (FullDMD, ou capture du DMD de la machine) : plus
// proche du vrai DMD que le fronton (demande du 12/11/2026) ; sans teinte là, celle du fronton.
// Calculée une fois par fichier, gardée dans
// <données>\cache\teintes-tables.json, refaite quand le média change (chemin, taille, date).
//
// Rien n'est calculé pendant le défilement : en rafale, la teinte montrée ne change que lorsque la
// table choisie est restée en place SETTLE_MS ; d'ici là, l'ambiance garde la teinte d'avant (pas de
// clignotement à chaque cran), puis passe à la nouvelle en fondu (theme.css, 280 ms). Une seule
// mesure à la fois, par le convertisseur hors écran (media-convert.ts) : quelques dizaines de
// points de large, une image, ou quatre moments d'une vidéo.
//
// Appui isolé sur une table dont la teinte est déjà connue (en mémoire ou dans le cache) : elle est
// montrée aussitôt, dans l'état que l'on envoie, et son fondu part avec celui des médias (21/11/2026 :
// attendre SETTLE_MS la décalait en plein atterrissage de la roue, et coûtait un envoi de plus).

import * as path from 'node:path';
import { cachedTint, mediaKind, mergeLedPalettes, recordLeds, storeTint, tintCacheEntries, tintCacheFile, tintCacheKey, tintRecord, VIDEO_FRAME_TIMES, type TableTint, type TintRecord } from '@cyberpinball/core';
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
  /** Horloge des essais. */
  now?: () => number;
}

/** Teinte pas encore connue sans mesure (knownTint). */
const UNKNOWN = Symbol('inconnue');

/** Sujet des écrans : une clé (la table et ses médias), et les fichiers à lire dans l'ordre. */
export interface TintSubject {
  key: string;
  files: readonly string[];
  /** Pour les points du DMD, lus avant `files` : le média de l'écran du DMD. */
  dmdFiles?: readonly string[];
  /**
   * Pour les couleurs des LED : les visuels dont les dominantes se mêlent (fronton, plateau), tous mesurés ;
   * sans couleur là, celles du premier de `files` qui en a.
   */
  ledFiles?: readonly string[];
}

/** Teinte montrée : celle de l'ambiance (color absente : la sarcelle de la marque), les points du DMD, les couleurs des LED. */
export type ShownTint = Partial<TableTint>;

function shownTint(ambient: TableTint | undefined, dmd: string | undefined, leds: string[] | undefined): ShownTint | undefined {
  if (!ambient && !dmd && !leds?.length) return undefined;
  const { leds: _own, ...rest } = ambient ?? ({} as Partial<TableTint>);
  return { ...rest, ...(dmd && { dmd }), ...(leds?.length && { leds }) };
}

export class TableTints {
  private readonly cacheFile: string;
  private readonly memo = new Map<string, TintRecord>();
  private shown?: ShownTint;
  private pendingKey?: string;
  private timer?: NodeJS.Timeout;
  private run = 0;
  private resolving = false;
  private queued?: { subject: TintSubject; run: number };
  /** Un décodeur momentanément indisponible ne doit pas être sollicité à chaque retour dans la roue. */
  private readonly failed = new Map<string, number>();
  /** Dernier changement de table suivi (rafale : moins de SETTLE_MS entre deux). */
  private lastFollow = -Infinity;
  /** Cache sur disque, lu une fois : la teinte d'une table déjà mesurée se trouve sans relire le fichier à chaque appui. */
  private disk?: Record<string, TintRecord>;

  constructor(private readonly opts: TableTintsOptions) {
    this.cacheFile = tintCacheFile(opts.dataDir);
  }

  /** Teinte à montrer (undefined : la sarcelle de la marque). */
  current(): ShownTint | undefined {
    return this.shown;
  }

  /**
   * Table montrée par les écrans (undefined : aucune, ou couleur coupée) : à chaque état envoyé, avant
   * de le composer. Rapide : arme une attente quand le sujet change ; sur un appui isolé dont la teinte
   * est connue, la montre aussitôt, sans onChange (l'état qu'on est en train d'envoyer la porte).
   */
  follow(subject: TintSubject | undefined): void {
    const key = subject?.key ?? '';
    if (key === this.pendingKey) return;
    this.pendingKey = key;
    clearTimeout(this.timer);
    this.timer = undefined;
    const run = ++this.run;
    this.queued = undefined;
    const settleMs = this.opts.settleMs ?? SETTLE_MS;
    const now = (this.opts.now ?? Date.now)();
    const isolated = now - this.lastFollow >= settleMs;
    this.lastFollow = now;
    if (!subject) {
      // Plus de table (menu système, réglages, couleur coupée) : la sarcelle, sans attendre.
      return this.settle(undefined);
    }
    if (isolated) {
      const known = this.knownTint(subject);
      if (known !== UNKNOWN) {
        this.shown = known;
        return;
      }
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.queued = { subject, run };
      void this.drain();
    }, this.opts.settleMs ?? SETTLE_MS);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.run++;
    this.queued = undefined;
  }

  /** Une seule mesure active ; pendant son attente, seule la dernière table reste à traiter. */
  private async drain(): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    try {
      while (this.queued) {
        const { subject, run } = this.queued;
        this.queued = undefined;
        const tint = await this.resolveSubject(subject, run);
        if (run === this.run) this.settle(tint);
      }
    } finally {
      this.resolving = false;
    }
  }

  /** Ambiance d'après `files` ; points du DMD d'après `dmdFiles`, sinon ceux de l'ambiance. */
  private async resolveSubject(subject: TintSubject, run: number): Promise<ShownTint | undefined> {
    const ambient = await this.resolve(subject.files, run);
    const dmd = (subject.dmdFiles?.length ? await this.resolve(subject.dmdFiles, run) : undefined)?.dmd ?? ambient?.dmd;
    for (const file of subject.ledFiles ?? []) {
      if (run !== this.run) return undefined;
      await this.measure(file);
    }
    return shownTint(ambient, dmd, this.ledsFor(subject));
  }

  /** Couleurs des LED : les dominantes mêlées des `ledFiles` (déjà mesurés), sinon celles de `files`. */
  private ledsFor(subject: TintSubject): string[] | undefined {
    const lists = (subject.ledFiles ?? []).map((file) => {
      const id = tintCacheKey(file);
      const record = id ? this.memo.get(id) : undefined;
      return record ? recordLeds(record) : undefined;
    });
    const merged = mergeLedPalettes(lists);
    return merged.length ? merged : this.ledsOf(subject.files);
  }

  /**
   * Couleurs des LED des fichiers d'ambiance, d'après les mesures déjà faites (en mémoire) : celles du
   * premier qui en a, jusqu'à celui qui donne la teinte. Un refus (table toute verte) garde les siennes.
   */
  private ledsOf(files: readonly string[]): string[] | undefined {
    for (const file of files) {
      const id = tintCacheKey(file);
      if (!id) continue;
      const record = this.memo.get(id);
      if (!record) return undefined;
      const leds = recordLeds(record);
      if (leds?.length) return leds;
      if ('tint' in record) return undefined;
    }
    return undefined;
  }

  private settle(tint: ShownTint | undefined): void {
    const changed = this.shown?.color !== tint?.color || this.shown?.dmd !== tint?.dmd || this.shown?.leds?.join() !== tint?.leds?.join();
    this.shown = tint;
    if (changed) this.opts.onChange();
  }

  /**
   * Teinte du sujet sans rien mesurer : le même choix que resolveSubject, d'après les seules mesures déjà
   * faites (en mémoire, ou dans le cache lu une fois). UNKNOWN si un fichier à consulter n'a jamais été mesuré.
   */
  private knownTint(subject: TintSubject): ShownTint | undefined | typeof UNKNOWN {
    const first = (files: readonly string[]): TableTint | undefined | typeof UNKNOWN => {
      for (const file of files) {
        const id = tintCacheKey(file);
        // Fichier absent : pas de teinte pour lui, comme à la mesure.
        if (!id) continue;
        this.disk ??= tintCacheEntries(this.cacheFile);
        const record = this.memo.get(id) ?? this.disk[id];
        if (!record) return UNKNOWN;
        this.memo.set(id, record);
        if ('tint' in record) return record.tint;
      }
      return undefined;
    };
    const ambient = first(subject.files);
    if (ambient === UNKNOWN) return UNKNOWN;
    const dmdOwn = subject.dmdFiles?.length ? first(subject.dmdFiles) : undefined;
    if (dmdOwn === UNKNOWN) return UNKNOWN;
    for (const file of subject.ledFiles ?? []) {
      const id = tintCacheKey(file);
      if (!id) continue;
      this.disk ??= tintCacheEntries(this.cacheFile);
      const record = this.memo.get(id) ?? this.disk[id];
      if (!record) return UNKNOWN;
      this.memo.set(id, record);
    }
    return shownTint(ambient, dmdOwn?.dmd ?? ambient?.dmd, this.ledsFor(subject));
  }

  /** Teinte du premier fichier qui en a une. */
  private async resolve(files: readonly string[], run: number): Promise<TableTint | undefined> {
    for (const file of files) {
      if (run !== this.run) return undefined;
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
    if ((this.failed.get(id) ?? 0) > (this.opts.now ?? Date.now)()) return undefined;
    const known = this.memo.get(id) ?? cachedTint(this.cacheFile, file);
    if (known) {
      this.memo.set(id, known);
      return known;
    }
    const kind = mediaKind(file);
    if (kind !== 'image' && kind !== 'video') return undefined;
    try {
      const got = await this.opts.converter().mediaFrames(file, kind === 'video' ? VIDEO_FRAME_TIMES : [0], SAMPLE_WIDTH);
      const record = tintRecord(got.images);
      this.memo.set(id, record);
      storeTint(this.cacheFile, file, record);
      return record;
    } catch (error) {
      // Une panne du décodeur ne condamne pas le fichier sur disque. Reprise après une minute,
      // ou aussitôt si sa taille/date change ; pas de nouvelle tentative à chaque survol.
      this.failed.set(id, (this.opts.now ?? Date.now)() + 60_000);
      if (this.failed.size > 200) this.failed.delete(this.failed.keys().next().value!);
      console.log(`Couleur de la table : ${path.basename(file)} illisible (${(error as Error).message}).`);
      return undefined;
    }
  }
}
