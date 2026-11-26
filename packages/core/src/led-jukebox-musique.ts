// LED hors partie qui suivent la musique du Juke-box.
//
// Entrée : les niveaux du spectre que le lecteur mesure déjà pour son visualiseur (24 bandes, 0 à 1,
// jukebox-player.ts) ; aucune seconde analyse du son. Sortie : une image par bande, comme
// LedAmbientEngine.render.
//
// Principe : une barre qui monte et descend avec le rythme, depuis le bas de la bande (sens donné par
// `ledStripPosition`, jamais l'ordre de câblage), une crête qui retombe, et des couleurs en dégradé
// comme celles du DMD (pochette du morceau, à défaut l'arc-en-ciel du visualiseur Multicolore).
//
// Dynamique (un son fort et constant ne doit pas figer la barre) : chaque bande du spectre a son niveau
// de référence glissant sur quelques secondes (plancher et plafond suivis, `ledMusicRange`) ; la barre
// suit la position du niveau entre les deux, pas sa valeur brute. Une bande qui ne bouge pas reste à
// mi-hauteur, une bande qui pulse parcourt toute sa course, quelle que soit la force du morceau.
// Attaque rapide, retombée douce. Sans son : éteint. Jamais au-delà de la luminosité réglée.

import { hsvToRgb, rainbowHue } from './jukebox-visualizer';
import { ledDitherByte, ledLevelGain } from './led-luminosite';
import { ledStripPosition, type LedGrid } from './led-live';

/** Niveau sous lequel un niveau du spectre est du bruit : rien ne s'allume. */
export const LED_MUSIC_NOISE_FLOOR = 0.06;
/** Sans niveaux depuis ce délai (ms), la musique est considérée arrêtée. */
export const LED_MUSIC_STALE_MS = 1200;
export const LED_MUSIC_BANDS = 24;
const ATTACK_MS = 35;
const RELEASE_MS = 170;
/** Constante de temps (ms) du plafond qui redescend et du plancher qui remonte : la référence glissante. */
const RANGE_MS = 3500;
/** Course minimale entre plancher et plafond : un signal presque constant n'est pas grossi en bruit. */
const MIN_SPAN = 0.16;
/** Crête : tenue (ms) puis chute (hauteur de bande par seconde). */
const PEAK_HOLD_MS = 220;
const PEAK_FALL = 0.9;
/** Lumière sous laquelle la musique n'occupe plus les bandes (elle les rend à l'ambiance). */
const IDLE_LIGHT = 0.01;

type Rgb = readonly [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Couleur « #rrggbb » éclaircie jusqu'à son plein (le plafond de luminosité réglée fait le reste). */
function vivid(hex: string): Rgb | undefined {
  const m = HEX.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  const c: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const peak = Math.max(...c);
  return peak < 8 ? undefined : [(c[0] / peak) * 255, (c[1] / peak) * 255, (c[2] / peak) * 255];
}

/** Niveau du spectre sans son de fond : 0 sous le seuil, puis remis à l'échelle. */
export function ledMusicGate(v: number): number {
  if (!Number.isFinite(v) || v <= LED_MUSIC_NOISE_FLOOR) return 0;
  return clamp01((v - LED_MUSIC_NOISE_FLOOR) / (1 - LED_MUSIC_NOISE_FLOOR));
}

/**
 * Position d'un niveau dans sa course glissante (0 à 1) : 0,5 quand il ne bouge pas, 0 et 1 aux bouts de
 * ce qu'il a parcouru ces dernières secondes.
 */
export function ledMusicRange(level: number, floor: number, ceil: number): number {
  const span = Math.max(ceil - floor, MIN_SPAN);
  return clamp01(0.5 + (level - (floor + ceil) / 2) / span);
}

export class LedJukeboxMusic {
  private target = new Float64Array(LED_MUSIC_BANDS);
  /** Niveau lissé, plancher et plafond glissants de chaque bande. */
  private level = new Float64Array(LED_MUSIC_BANDS);
  private floor = new Float64Array(LED_MUSIC_BANDS);
  private ceil = new Float64Array(LED_MUSIC_BANDS);
  /** Vigueur de chaque bande (0 à 1) : sa position dans sa course, éteinte quand elle est muette. */
  private drive = new Float64Array(LED_MUSIC_BANDS);
  private height = 0;
  private peak = 0;
  private peakAt = -Infinity;
  private fedAt = -Infinity;
  private stepAt?: number;
  private clock = 0;
  private seeded = false;
  private cover: Rgb[] = [];

  /** Reçoit les niveaux du spectre (0 à 1, une valeur par bande) et, si on la connaît, la palette de la pochette (#rrggbb). */
  feed(levels: readonly number[], now: number, palette?: readonly string[]): void {
    for (let i = 0; i < LED_MUSIC_BANDS; i++) {
      const src = levels.length === LED_MUSIC_BANDS ? i : Math.min(levels.length - 1, Math.floor((i / LED_MUSIC_BANDS) * levels.length));
      this.target[i] = levels.length ? ledMusicGate(levels[src] ?? 0) : 0;
    }
    if (!this.seeded) {
      // Premier son : la référence part du niveau entendu (pas du noir), la barre ne bondit pas.
      this.level.set(this.target);
      this.floor.set(this.target);
      this.ceil.set(this.target);
      this.seeded = true;
    }
    this.fedAt = now;
    this.cover = (palette ?? []).slice(0, 3).map(vivid).filter((c): c is Rgb => Boolean(c));
  }

  /** Les niveaux arrivent encore (le morceau joue). */
  fresh(now: number): boolean {
    return now - this.fedAt < LED_MUSIC_STALE_MS;
  }

  /** La musique occupe les bandes : elle joue, ou ses dernières lumières s'éteignent encore. */
  active(now: number): boolean {
    return this.fresh(now) || this.height + this.peak > IDLE_LIGHT;
  }

  /** Hauteur de la barre (0 à 1) et de sa crête, telles que montrées. */
  get bar(): { height: number; peak: number } {
    return { height: this.height, peak: this.peak };
  }

  /** Avance les niveaux, les références et la barre jusqu'à `now` (une fois par image, pas une fois par bande). */
  step(now: number): void {
    const dt = this.stepAt === undefined || now < this.stepAt ? 0 : Math.min(250, now - this.stepAt);
    this.stepAt = now;
    this.clock = now;
    const live = this.fresh(now);
    const refK = 1 - Math.exp(-dt / RANGE_MS);
    for (let i = 0; i < LED_MUSIC_BANDS; i++) {
      const goal = live ? this.target[i]! : 0;
      const cur = this.level[i]!;
      const lv = cur + (goal - cur) * (1 - Math.exp(-dt / (goal >= cur ? ATTACK_MS : RELEASE_MS)));
      this.level[i] = lv;
      // Plafond : monte aussitôt, redescend lentement. Plancher : descend aussitôt, remonte lentement.
      this.ceil[i] = lv >= this.ceil[i]! ? lv : this.ceil[i]! + (lv - this.ceil[i]!) * refK;
      this.floor[i] = lv <= this.floor[i]! ? lv : this.floor[i]! + (lv - this.floor[i]!) * refK;
      // Vigueur : la place dans la course, mais rien du tout quand la bande est (presque) muette.
      this.drive[i] = smoothstep(0.015, 0.16, lv) * (0.12 + 0.88 * ledMusicRange(lv, this.floor[i]!, this.ceil[i]!));
    }
    const avg = (from: number, to: number): number => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += this.drive[i]!;
      return sum / (to - from);
    };
    // Barre : surtout les graves (le rythme), les médiums et les aigus la relèvent.
    const h = clamp01(1.12 * (0.5 * avg(0, 6) + 0.32 * avg(6, 16) + 0.18 * avg(16, LED_MUSIC_BANDS)));
    this.height = h < 0.004 ? 0 : h;
    // Crête : monte avec la barre, tient un instant, puis retombe.
    if (this.height >= this.peak) {
      this.peak = this.height;
      this.peakAt = now;
    } else if (now - this.peakAt > PEAK_HOLD_MS) this.peak = Math.max(this.height, this.peak - (PEAK_FALL * dt) / 1000);
    if (this.height + this.peak < IDLE_LIGHT) this.height = this.peak = 0;
  }

  /** Couleur du dégradé à la position `u` (0 : le pied, 1 : le haut), comme le DMD : la pochette, sinon l'arc-en-ciel. */
  private color(u: number): Rgb {
    if (this.cover.length) {
      const drift = 0.12 * Math.sin(this.clock / 1400 + u * 5);
      const k = clamp01(u + drift);
      const a = this.cover[0]!;
      const b = this.cover[1] ?? a;
      const c = this.cover[2] ?? b;
      return k < 0.5 ? mix(a, b, k * 2) : mix(b, c, (k - 0.5) * 2);
    }
    return hsvToRgb(rainbowHue(this.clock, u * LED_MUSIC_BANDS, 0), 0.72, 1);
  }

  /**
   * Image de la bande : 3 octets par LED, jamais au-delà de la luminosité réglée (`brightness`, % perçu,
   * 0 à 100). La barre se remplit depuis le bas jusqu'à sa hauteur ; chaque LED y est plus ou moins
   * vive selon la bande du spectre qui lui correspond (le bas : graves, le haut : aigus) ; au-dessus,
   * les aigus font encore vivre le haut ; la crête est un point plus clair.
   */
  render(grid: LedGrid, brightness: number, out?: Uint8Array): Uint8Array {
    const n = Math.max(0, Math.floor(grid.width)) * Math.max(0, Math.floor(grid.height));
    const bytes = out && out.length === n * 3 ? out.fill(0) : new Uint8Array(n * 3);
    const cap = ledLevelGain(brightness);
    if (!n || cap <= 0 || this.height + this.peak <= 0) return bytes;
    const edge = Math.max(0.06, 1.5 / Math.max(1, n - 1));
    const treble = (() => {
      let sum = 0;
      for (let i = 16; i < LED_MUSIC_BANDS; i++) sum += this.drive[i]!;
      return sum / (LED_MUSIC_BANDS - 16);
    })();
    for (let k = 0; k < n; k++) {
      const u = ledStripPosition(grid, k);
      const band = u * (LED_MUSIC_BANDS - 1);
      const lo = Math.floor(band);
      const local = this.drive[lo]! + (this.drive[Math.min(LED_MUSIC_BANDS - 1, lo + 1)]! - this.drive[lo]!) * (band - lo);
      const fill = smoothstep(0, 1, (this.height - u) / edge);
      let light = fill * (0.5 + 0.5 * local);
      // Au-dessus de la barre : une lueur d'aigus, pour que le haut bouge même sur un morceau fort.
      light += (1 - fill) * 0.3 * treble * local * smoothstep(0.45, 0.95, u);
      const c = this.color(u);
      let [r, g, b] = [c[0] * light, c[1] * light, c[2] * light];
      // Crête : un point plus clair, détaché de la barre.
      const gap = this.peak - this.height;
      if (gap > edge * 0.8) {
        const pk = clamp01(1 - Math.abs(u - this.peak) / edge);
        if (pk > 0) {
          const w = mix(c, [255, 255, 255], 0.4);
          r += w[0] * pk;
          g += w[1] * pk;
          b += w[2] * pk;
        }
      }
      bytes[k * 3] = ledDitherByte(255 * cap * clamp01(r / 255) ** 2, k);
      bytes[k * 3 + 1] = ledDitherByte(255 * cap * clamp01(g / 255) ** 2, k);
      bytes[k * 3 + 2] = ledDitherByte(255 * cap * clamp01(b / 255) ** 2, k);
    }
    return bytes;
  }
}
