// Secousses de la borne rendues en touches à un jeu qui ne lit pas l'accéléromètre (20/11/2026).
// Future Pinball ne lit un accéléromètre que s'il est déclaré dans ses préférences de manette, dont le
// choix des axes ne marche que sous un Windows en anglais ; sur le PinCab (Windows en français, Pinscape
// au KL25Z), secouer la borne ne faisait rien. Ici : l'accéléromètre relevé par l'étape « Tilt »
// (analog.nudge, lu comme VPX le lit) est suivi, et un à-coup franc devient la touche de secousse de son
// côté, frappée une fois (gauche, droite, ou vers l'avant). Le centre de l'accéléromètre est suivi en
// douceur (un Pinscape se recentre de lui-même, mais pas tout de suite) ; une pause suit chaque secousse,
// pour que le rebond de la caisse ne compte pas comme une seconde secousse.

import type { NudgeSensor } from './model';
import { nudgeScale } from './plunger';

export type NudgeSide = 'left' | 'right' | 'up';

export interface NudgeDetectorOptions {
  /**
   * Écart au centre, en fraction de la pleine échelle de l'axe après le gain de la borne, à partir
   * duquel c'est une secousse. Un Pinscape réglé en « 1G » : 0,35 ≈ 0,35 g, une poussée franche.
   */
  threshold?: number;
  /** Après une secousse, rien pendant ce temps (rebond de la caisse), en millisecondes. */
  refractoryMs?: number;
  /** Vitesse du suivi du centre, par lecture (0 à 1). */
  centerRate?: number;
}

export const NUDGE_KEY_DEFAULTS = { threshold: 0.35, refractoryMs: 450, centerRate: 0.02 } as const;

/**
 * Détecteur de secousses : `read(x, y, now)` avec les valeurs brutes des deux axes (-1 à 1, comme SDL et
 * VPX les donnent) rend le côté d'une secousse qui commence, sinon undefined. Le sens des axes suit le
 * réglage de la borne pour VPX (gain, axes inversés) : une borne dont VPX secoue juste secoue juste ici.
 * X négatif : secousse à gauche ; Y au-delà du seuil (dans un sens ou l'autre) : vers l'avant.
 */
export class NudgeDetector {
  private center: { x: number; y: number } | undefined;
  private quietUntil = 0;
  private readonly threshold: number;
  private readonly refractoryMs: number;
  private readonly centerRate: number;
  private readonly scaleX: number;
  private readonly scaleY: number;

  constructor(sensor: Pick<NudgeSensor, 'gain' | 'invertX' | 'invertY'>, opts: NudgeDetectorOptions = {}) {
    this.threshold = opts.threshold ?? NUDGE_KEY_DEFAULTS.threshold;
    this.refractoryMs = opts.refractoryMs ?? NUDGE_KEY_DEFAULTS.refractoryMs;
    this.centerRate = opts.centerRate ?? NUDGE_KEY_DEFAULTS.centerRate;
    this.scaleX = nudgeScale(sensor, 'x');
    this.scaleY = nudgeScale(sensor, 'y');
  }

  read(rawX: number, rawY: number, now: number): NudgeSide | undefined {
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return undefined;
    const x = rawX * this.scaleX;
    const y = rawY * this.scaleY;
    // Première lecture : c'est le repos.
    if (!this.center) {
      this.center = { x, y };
      return undefined;
    }
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const strong = Math.abs(dx) >= this.threshold || Math.abs(dy) >= this.threshold;
    // Le centre ne suit que le repos : une secousse ne le déplace pas.
    if (!strong) {
      this.center.x += (x - this.center.x) * this.centerRate;
      this.center.y += (y - this.center.y) * this.centerRate;
    }
    if (!strong || now < this.quietUntil) return undefined;
    this.quietUntil = now + this.refractoryMs;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return 'up';
  }
}
