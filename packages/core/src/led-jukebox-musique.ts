// LED hors partie qui suivent la musique du Juke-box.
//
// Entrée : les niveaux du spectre que le lecteur mesure déjà pour son visualiseur (24 bandes, 0 à 1,
// jukebox-player.ts) ; aucune seconde analyse du son. Sortie : une image par bande, comme
// LedAmbientEngine.render.
//
// Règles :
// - Les graves montent depuis le bas de la bande (sens donné par `ledStripPosition`, jamais l'ordre de
//   câblage), les médiums éclairent le milieu, les aigus le haut.
// - Couleurs : celles de la pochette du morceau, à défaut le vert Cyber Pinball.
// - Sans son (ou sous le seuil de bruit) : bandes éteintes. Les niveaux sont lissés (attaque rapide,
//   chute douce) : pas de clignotement perpétuel.
// - Jamais au-delà de la luminosité réglée (`ledLevelGain`, courbe CIE L*), comme l'ambiance.

import { ledDitherByte, ledLevelGain } from './led-luminosite';
import { ledStripPosition, type LedGrid } from './led-live';

/** Vert Cyber Pinball, à défaut de pochette. */
export const LED_MUSIC_FALLBACK_COLOR = '#8be23a';
/** Niveau sous lequel un niveau du spectre est du bruit : rien ne s'allume. */
export const LED_MUSIC_NOISE_FLOOR = 0.08;
/** Sans niveaux depuis ce délai (ms), la musique est considérée arrêtée. */
export const LED_MUSIC_STALE_MS = 1200;
const ATTACK_MS = 40;
const RELEASE_MS = 240;
/** Lumière sous laquelle la musique n'occupe plus les bandes (elle les rend à l'ambiance). */
const IDLE_LIGHT = 0.01;

type Rgb = readonly [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Couleur « #rrggbb » éclaircie jusqu'à son plein (le plafond de luminosité réglée fait le reste). */
function vivid(hex: string): Rgb {
  const m = HEX.exec(hex.trim());
  const n = parseInt((m ? m[1]! : LED_MUSIC_FALLBACK_COLOR.slice(1)), 16);
  const c: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const peak = Math.max(...c);
  return peak < 8 ? vivid(LED_MUSIC_FALLBACK_COLOR) : [(c[0] / peak) * 255, (c[1] / peak) * 255, (c[2] / peak) * 255];
}

/** Niveau du spectre sans son de fond : 0 sous le seuil, puis remis à l'échelle. */
export function ledMusicGate(v: number): number {
  if (!Number.isFinite(v) || v <= LED_MUSIC_NOISE_FLOOR) return 0;
  return clamp01((v - LED_MUSIC_NOISE_FLOOR) / (1 - LED_MUSIC_NOISE_FLOOR));
}

/** Graves, médiums, aigus : moyennes des bandes, comme le « pouls » des écrans (jukebox-player). */
export function ledMusicBands(levels: readonly number[]): { bass: number; mid: number; high: number } {
  const n = levels.length;
  const avg = (from: number, to: number): number => {
    const a = Math.min(n, Math.max(0, Math.round((from / 24) * n)));
    const b = Math.min(n, Math.max(a + 1, Math.round((to / 24) * n)));
    let sum = 0;
    for (let i = a; i < b; i++) sum += ledMusicGate(levels[i] ?? 0);
    return b > a ? sum / (b - a) : 0;
  };
  return { bass: avg(0, 6), mid: avg(6, 16), high: avg(16, 24) };
}

export class LedJukeboxMusic {
  private bass = 0;
  private mid = 0;
  private high = 0;
  private target = { bass: 0, mid: 0, high: 0 };
  private fedAt = -Infinity;
  private stepAt?: number;
  private colors: Rgb[] = [vivid(LED_MUSIC_FALLBACK_COLOR)];

  /** Reçoit les niveaux du spectre (0 à 1, une valeur par bande) et, si on la connaît, la palette de la pochette (#rrggbb). */
  feed(levels: readonly number[], now: number, palette?: readonly string[]): void {
    this.target = ledMusicBands(levels);
    this.fedAt = now;
    const colors = (palette ?? []).filter((c) => HEX.test(c.trim())).slice(0, 3);
    this.colors = (colors.length ? colors : [LED_MUSIC_FALLBACK_COLOR]).map(vivid);
  }

  /** Les niveaux arrivent encore (le morceau joue). */
  fresh(now: number): boolean {
    return now - this.fedAt < LED_MUSIC_STALE_MS;
  }

  /** La musique occupe les bandes : elle joue, ou ses dernières lumières s'éteignent encore. */
  active(now: number): boolean {
    return this.fresh(now) || this.bass + this.mid + this.high > IDLE_LIGHT;
  }

  /** Avance les niveaux lissés jusqu'à `now` (une fois par image, pas une fois par bande). */
  step(now: number): void {
    const dt = this.stepAt === undefined || now < this.stepAt ? 0 : Math.min(250, now - this.stepAt);
    this.stepAt = now;
    const goal = this.fresh(now) ? this.target : { bass: 0, mid: 0, high: 0 };
    const follow = (cur: number, to: number): number => cur + (to - cur) * (1 - Math.exp(-dt / (to >= cur ? ATTACK_MS : RELEASE_MS)));
    this.bass = follow(this.bass, goal.bass);
    this.mid = follow(this.mid, goal.mid);
    this.high = follow(this.high, goal.high);
    if (this.bass + this.mid + this.high < IDLE_LIGHT) this.bass = this.mid = this.high = 0;
  }

  /** Niveaux lissés montrés (essais). */
  get levels(): { bass: number; mid: number; high: number } {
    return { bass: this.bass, mid: this.mid, high: this.high };
  }

  /**
   * Image de la bande : 3 octets par LED, jamais au-delà de la luminosité réglée (`brightness`, % perçu,
   * 0 à 100). Les graves remplissent la bande depuis le bas, les médiums le milieu, les aigus le haut.
   */
  render(grid: LedGrid, brightness: number, out?: Uint8Array): Uint8Array {
    const n = Math.max(0, Math.floor(grid.width)) * Math.max(0, Math.floor(grid.height));
    const bytes = out && out.length === n * 3 ? out.fill(0) : new Uint8Array(n * 3);
    const cap = ledLevelGain(brightness);
    if (!n || cap <= 0 || this.bass + this.mid + this.high <= 0) return bytes;
    const [cBass, cMid, cHigh] = [this.colors[0]!, this.colors[1] ?? this.colors[0]!, this.colors[2] ?? this.colors[1] ?? this.colors[0]!];
    for (let k = 0; k < n; k++) {
      const u = ledStripPosition(grid, k);
      // Graves : la bande se remplit du bas jusqu'à leur niveau, le bord plus doux ; plus lumineuse au pied.
      const bass = smoothstep(0, 1, (this.bass - u) / 0.15) * (1 - 0.35 * u);
      // Médiums : une lueur centrée sur le milieu. Aigus : le haut seulement.
      const mid = this.mid * Math.exp(-(((u - 0.5) / 0.28) ** 2));
      const high = this.high * smoothstep(0.55, 0.95, u);
      const light = [
        bass * cBass[0] + mid * cMid[0] + high * cHigh[0],
        bass * cBass[1] + mid * cMid[1] + high * cHigh[1],
        bass * cBass[2] + mid * cMid[2] + high * cHigh[2],
      ];
      for (let c = 0; c < 3; c++) bytes[k * 3 + c] = ledDitherByte(255 * cap * clamp01(light[c]! / 255) ** 2, k);
    }
    return bytes;
  }
}
