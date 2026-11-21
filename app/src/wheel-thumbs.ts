// Miniatures des logos de la roue (21/11/2026). Un logo de table (Wheel) fait souvent 1 000 à 2 000 px
// de côté ; la roue ne le montre jamais à plus de 550 px (médaillon du centre sur un playfield 4K).
// Le décoder à pleine taille, au moment où il entre dans la roue, faisait des images de 70 à 90 ms
// (au lieu de 17) dans le rendu du plateau, et chaque logo gardé occupait jusqu'à 16 Mo de mémoire
// graphique. Chaque logo fixe plus grand que WHEEL_THUMB_SIDE reçoit donc une copie réduite, WebP avec
// sa transparence, faite par le convertisseur hors écran (media-convert.ts), une à la fois, gardée
// dans <données>\cache\roue, refaite quand le fichier change (chemin, taille, date). La roue la
// prend dès qu'elle existe ; d'ici là, l'original. Un logo animé (APNG, GIF, WebP animés) ou déjà
// petit garde son original : une marque vide (.orig) s'en souvient.
//
// Ordre : d'abord les tables que la roue montre (url), puis le reste de la collection en tâche de
// fond (warm). Jamais pendant une partie (idle) : le convertisseur prendrait du processeur au jeu.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mediaPathFromUrl, mediaUrl, writeFileAtomic } from '@cyberpinball/core';
import type { Converter } from './media-convert';

/** Côté des miniatures : le médaillon du centre fait au plus 550 px (playfield 4K), un peu de marge. */
export const WHEEL_THUMB_SIDE = 640;
/** Attente avant de réessayer quand l'application n'est pas au repos (partie en cours). */
const BUSY_RETRY_MS = 5000;
/** Petite pause entre deux miniatures de la tâche de fond : le convertisseur ne monopolise rien. */
const BACKGROUND_GAP_MS = 150;

export interface WheelThumbsOptions {
  dataDir: string;
  converter: () => Pick<Converter, 'fitWebp'>;
  /** Le convertisseur peut travailler (pas de partie en cours). */
  idle: () => boolean;
  log?: (line: string) => void;
  /** Essais : attente avant de réessayer quand l'application n'est pas au repos (BUSY_RETRY_MS). */
  busyRetryMs?: number;
}

/** Dossier des miniatures : <données>\cache\roue (servi par cyber-media, comme les avatars). */
export function wheelThumbsDir(dataDir: string): string {
  return path.join(dataDir, 'cache', 'roue');
}

export class WheelThumbs {
  readonly dir: string;
  /** Clé du fichier source → miniature (chemin), null : garder l'original. */
  private readonly known = new Map<string, string | null>();
  /** Tables que la roue montre : d'abord. */
  private readonly queue: { file: string; key: string }[] = [];
  private readonly queued = new Set<string>();
  /** Tâche de fond : logos de la collection, dont l'adresse n'est calculée qu'à leur tour (aucune lecture de disque en bloc). */
  private background: (() => string | undefined)[] = [];
  private busy = false;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly opts: WheelThumbsOptions) {
    this.dir = wheelThumbsDir(opts.dataDir);
  }

  /**
   * Adresse à donner à la roue pour ce logo : sa miniature si elle est prête, sinon l'original (et la
   * miniature est demandée en priorité). Rapide : une lecture des dates du fichier, pas de conversion.
   */
  url(original: string | undefined): string | undefined {
    if (!original) return original;
    const file = mediaPathFromUrl(original);
    const key = file && thumbKey(file);
    if (!file || !key) return original;
    const thumb = this.lookup(key);
    if (thumb === undefined) this.enqueue(file, key, true);
    return thumb ? mediaUrl(thumb) : original;
  }

  /**
   * Logos de toute la collection, réduits en tâche de fond, après ceux que la roue montre. Remplace la
   * liste précédente (collection rechargée). Rien n'est lu ici : chaque logo est examiné à son tour.
   */
  warm<T>(items: readonly T[], urlOf: (item: T) => string | undefined): void {
    this.background = items.map((item) => () => urlOf(item));
    this.pump();
  }

  dispose(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Miniature connue (chemin), null (original gardé), undefined (pas encore faite). */
  private lookup(key: string): string | null | undefined {
    const known = this.known.get(key);
    if (known !== undefined) return known;
    const thumb = path.join(this.dir, `${key}.webp`);
    if (fs.existsSync(thumb)) {
      this.known.set(key, thumb);
      return thumb;
    }
    if (fs.existsSync(path.join(this.dir, `${key}.orig`))) {
      this.known.set(key, null);
      return null;
    }
    return undefined;
  }

  private enqueue(file: string, key: string, first: boolean): void {
    if (this.queued.has(key)) {
      if (!first) return;
      // Déjà en file : passe devant.
      const at = this.queue.findIndex((q) => q.key === key);
      if (at > 0) this.queue.unshift(...this.queue.splice(at, 1));
    } else {
      this.queued.add(key);
      if (first) this.queue.unshift({ file, key });
      else this.queue.push({ file, key });
    }
    this.pump();
  }

  private pump(delay = 0): void {
    if (this.busy || this.timer || this.stopped || (!this.queue.length && !this.background.length)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.next();
    }, delay);
  }

  /** Prochain logo de la tâche de fond qui n'a pas encore sa miniature (quelques-uns examinés par tour). */
  private fromBackground(): { file: string; key: string } | undefined {
    // Quelques-uns par tour : une collection déjà réduite se parcourt sans bloquer le processus principal.
    for (let looked = 0; looked < 20 && this.background.length; looked++) {
      const original = this.background.shift()!();
      const file = original && mediaPathFromUrl(original);
      const key = file && thumbKey(file);
      if (file && key && !this.queued.has(key) && this.lookup(key) === undefined) return { file, key };
    }
    return undefined;
  }

  private async next(): Promise<void> {
    if (this.busy || this.stopped) return;
    if (!this.queue.length && !this.background.length) return;
    if (!this.opts.idle()) return this.pump(this.opts.busyRetryMs ?? BUSY_RETRY_MS);
    const item = this.queue.shift() ?? this.fromBackground();
    if (!item) return this.pump(BACKGROUND_GAP_MS);
    this.busy = true;
    const { file, key } = item;
    this.queued.add(key);
    try {
      await this.make(file, key);
    } catch (error) {
      // Logo illisible : la roue garde l'original (elle signalera elle-même un fichier abîmé).
      this.known.set(key, null);
      this.opts.log?.(`Miniatures de la roue : ${path.basename(file)} gardé tel quel (${(error as Error).message}).`); // i18n-ignore : journal
    } finally {
      this.queued.delete(key);
      this.busy = false;
    }
    // Tables montrées : à la suite ; tâche de fond : une courte pause entre deux.
    this.pump(this.queue.length ? 0 : BACKGROUND_GAP_MS);
  }

  private async make(file: string, key: string): Promise<void> {
    if (this.lookup(key) !== undefined) return;
    const thumb = path.join(this.dir, `${key}.webp`);
    // Écrite d'un coup (writeFileAtomic, media-convert.ts) : jamais de miniature tronquée servie à la roue.
    const got = await this.opts.converter().fitWebp(file, thumb, WHEEL_THUMB_SIDE);
    if (got.kept) {
      // Animé ou déjà petit : on s'en souvient, sans le relire à chaque démarrage.
      fs.mkdirSync(this.dir, { recursive: true });
      writeFileAtomic(path.join(this.dir, `${key}.orig`), got.kept);
      this.known.set(key, null);
      return;
    }
    this.known.set(key, thumb);
  }
}

/** Clé d'un logo : chemin, taille, date et côté de la miniature ; un logo remplacé est refait. */
export function thumbKey(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return crypto.createHash('sha1').update(`${path.resolve(file).toLowerCase()}|${stat.size}|${Math.round(stat.mtimeMs)}|${WHEEL_THUMB_SIDE}`).digest('hex').slice(0, 24);
  } catch {
    return undefined;
  }
}
