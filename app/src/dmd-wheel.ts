// Wheel de la table en points pour le DMD du menu vivant (packages/core/src/dmdscenes.ts,
// wheelDetail) : lue par le convertisseur hors écran (media-convert.ts), donc dans tout format
// que Chromium sait lire (PNG, APNG, GIF, WebP, JPEG, première image d'une vidéo), réduite à
// 448 pixels de large, puis mise en points dans le cœur. Une seule lecture à la fois, après un
// court repos sur la table : le défilement rapide de la roue ne lit rien. Gardée en mémoire
// (quelques kilo-octets par table), par adresse du média : elle change avec le fichier.

import { wheelDetail, type WheelDetail } from '@cyberpinball/core';
import type { Converter } from './media-convert';

/** Repos sur une table avant de lire sa wheel : bien avant les 800 ms du détail (LIVE_DMD_SCENES.wheelAfter). */
export const WHEEL_SETTLE_MS = 200;
/** Largeur de lecture : quatre pixels par point de la wheel agrandie (112 points). */
const READ_WIDTH = 448;
/** Wheels gardées en mémoire au plus. */
const KEEP = 200;

export interface DmdWheelsOptions {
  converter: () => Pick<Converter, 'mediaFrames'>;
  /** Une wheel vient d'être lue : l'état est à renvoyer. */
  onReady: () => void;
  settleMs?: number;
}

export class DmdWheels {
  /** null : lue, mais rien à montrer (illisible, ou rien de visible). */
  private readonly known = new Map<string, WheelDetail | null>();
  private wanted?: string;
  private timer?: NodeJS.Timeout;
  private reading = false;

  constructor(private readonly opts: DmdWheelsOptions) {}

  /**
   * Wheel de la table montrée (`key` : l'adresse du média, `file` : son fichier). Connue : rendue
   * tout de suite. Sinon undefined, et lue après un court repos ; onReady prévient quand elle l'est.
   */
  get(key: string | undefined, file: string | undefined): WheelDetail | undefined {
    if (!key || !file) return undefined;
    if (this.known.has(key)) {
      const detail = this.known.get(key)!;
      this.known.delete(key);
      this.known.set(key, detail);
      return detail ?? undefined;
    }
    if (this.wanted !== key) {
      this.wanted = key;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.read(key, file);
      }, this.opts.settleMs ?? WHEEL_SETTLE_MS);
    }
    return undefined;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.wanted = undefined;
  }

  private async read(key: string, file: string): Promise<void> {
    if (this.reading) {
      // Une lecture en cours : celle-ci repart à sa fin, si la table est toujours montrée.
      this.timer = setTimeout(() => this.wanted === key && void this.read(key, file), 50);
      return;
    }
    this.reading = true;
    let detail: WheelDetail | undefined;
    try {
      const got = await this.opts.converter().mediaFrames(file, [0], READ_WIDTH);
      const image = got.images[0];
      detail = image ? wheelDetail(image) : undefined;
    } catch {
      // Fichier absent ou illisible : la table n'a pas de détail de wheel, l'alternance reste la même.
    } finally {
      this.reading = false;
    }
    this.known.set(key, detail ?? null);
    while (this.known.size > KEEP) this.known.delete(this.known.keys().next().value!);
    if (this.wanted === key) {
      this.wanted = undefined;
      this.opts.onReady();
    }
  }
}
