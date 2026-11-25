// Ouverture des LED : l'animation des bandes adressables pendant l'ouverture de Cyber Pinball, la partie
// pure (aucune entrée-sortie, l'instant est donné depuis le départ de l'ouverture).
//
// Même déroulé et même minutage que les écrans (INTRO_TIMELINE, intro.ts), aux couleurs de la marque :
// - dmdPower (250 ms) : mise sous tension discrète, une lueur sarcelle et quelques points qui s'éveillent ;
// - 1 200 à 2 400 ms : une bille de lumière vert signal monte en accélérant (l'étincelle du plateau,
//   la bille qui traverse le DMD à dmdPass), et arrive en haut juste à l'ignition ;
// - ignition (2 400 ms) : l'éclair, la bille éclate en gerbe ; les lampes du fronton (backglassPower)
//   s'allument en vacillant, l'ambiance (aurore sarcelle et verte) monte ;
// - topperSweep (2 700 ms) : un trait de lumière traverse les bandes ;
// - sheen (3 900 ms) : un reflet blanc chaud passe, une fois ;
// - à partir de `end` (4 600 ms) : l'ambiance posée, en boucle, jusqu'à la sortie de l'ouverture
//   (LedAmbientEngine.endIntro fait alors un fondu vers l'ambiance des menus, sans passer par le noir).
//
// Invariants (fixés par led-animations.test.ts) : rien avant la mise sous tension ; le pic est à
// l'ignition ; une image ne dépend que de l'instant (aucun hasard) ; l'ambiance posée reste sous
// LED_AMBIENT_CEILING, comme celle des menus.

import type { Rgb } from './jukebox-visualizer';
import { INTRO_TIMELINE } from './intro';
import { LED_AMBIENT_CEILING, ledHash, ledSmooth, ledSoftNoise } from './led-animations';
import { addLedFxLight, ledLightToBytes } from './led-effets';
import { ledXY, type LedGrid } from './led-live';
import { hexToRgb, NEUTRAL_TINT, SIGNAL_COLOR } from './tabletint';

/** Couleurs de l'ouverture : celles de l'ouverture Soie du plateau (app/renderer/intro.js). */
export const LED_INTRO_COLORS = {
  /** Sarcelle de la marque : la lueur de mise sous tension et l'ambiance posée. */
  teal: NEUTRAL_TINT,
  /** Vert signal : la bille qui monte, l'éclair de l'ignition. */
  signal: SIGNAL_COLOR,
  /** Halo sarcelle sombre, troisième voile de l'aurore. */
  halo: '#1c8f80',
  /** Blanc chaud teinté de vert : le cœur du balayage et le reflet. */
  hot: '#e8ffd0',
} as const;

const T = INTRO_TIMELINE;
/** La bille part à 1 200 ms (l'étincelle du plateau) ; la montée de `rise-burst` occupe 45 % de sa durée. */
const RISE_START = 1200;
const RISE_MS = (T.ignition - RISE_START) / 0.45;
/** Vacillement des lampes du fronton après l'ignition. */
const FLICKER_MS = 500;
const AMBIENT_RISE_MS = 700;

const lin = (hex: string): Rgb => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};
const TEAL = lin(LED_INTRO_COLORS.teal);
const SWEEP: Rgb = ((a: Rgb, b: Rgb): Rgb => [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45, a[2] + (b[2] - a[2]) * 0.45])(lin(LED_INTRO_COLORS.signal), lin(LED_INTRO_COLORS.hot));
const HOT = lin(LED_INTRO_COLORS.hot);
const POWER_PALETTE = [LED_INTRO_COLORS.teal, LED_INTRO_COLORS.signal];
const RISE_PALETTE = [LED_INTRO_COLORS.signal, LED_INTRO_COLORS.teal];
const FLASH_PALETTE = [LED_INTRO_COLORS.signal];
const AMBIENT_PALETTE = [LED_INTRO_COLORS.teal, LED_INTRO_COLORS.signal, LED_INTRO_COLORS.halo];

/** Position (0 à 1) de chaque LED le long de la bande ; pour une matrice, selon la colonne (comme LedAmbientEngine). */
const alongCache = new Map<string, Float32Array>();
function along(grid: LedGrid): Float32Array {
  const w = Math.max(0, Math.floor(grid.width) || 0);
  const h = Math.max(0, Math.floor(grid.height) || 0);
  const key = `${w}x${h}:${grid.arrangement}`;
  const hit = alongCache.get(key);
  if (hit) return hit;
  const n = w * h;
  const u = new Float32Array(n);
  const matrix = w > 1 && h > 1;
  for (let k = 0; k < n; k++) u[k] = matrix ? ledXY(grid, k).x / Math.max(1, w - 1) : n > 1 ? k / (n - 1) : 0;
  if (alongCache.size > 32) alongCache.clear();
  alongCache.set(key, u);
  return u;
}

/** Trait de lumière qui traverse de la première LED à la dernière (`e` : 0 à 1 de sa course). */
function bar(L: Float32Array, u: Float32Array, e: number, width: number, color: Rgb, level: number): void {
  if (!(e >= 0 && e < 1)) return;
  const head = -width + (1 + 2 * width) * ledSmooth(e);
  const fade = level * (1 - 0.3 * e);
  for (let k = 0; k < u.length; k++) {
    const d = 1 - Math.abs(u[k]! - head) / width;
    if (d <= 0) continue;
    const lv = ledSmooth(d) * fade;
    L[k * 3]! += color[0] * lv;
    L[k * 3 + 1]! += color[1] * lv;
    L[k * 3 + 2]! += color[2] * lv;
  }
}

/**
 * Lumière de l'ouverture à `ms` millisecondes de son départ, AVANT gamma : 3 réels par LED, de 0 à 1
 * (plafonnés). `out` est réutilisé s'il a la bonne taille. Noire avant la mise sous tension.
 */
export function ledIntroLight(grid: LedGrid, ms: number, out?: Float32Array): Float32Array {
  const u = along(grid);
  const count = u.length * 3;
  const L = out && out.length === count ? out : new Float32Array(count);
  L.fill(0);
  if (!(ms >= T.dmdPower) || !count) return L;
  const A = LED_AMBIENT_CEILING;

  // Mise sous tension : une lueur sarcelle qui s'éveille, quelques points ; elle cède la place à l'ambiance.
  const power = ledSmooth((ms - T.dmdPower) / 1600) * (1 - ledSmooth((ms - T.ignition) / 600));
  if (power > 0) {
    for (let k = 0; k < u.length; k++) {
      const lv = A * 0.3 * power * (0.7 + 0.3 * ledSoftNoise(k + 11, ms / 380));
      L[k * 3]! += TEAL[0] * lv;
      L[k * 3 + 1]! += TEAL[1] * lv;
      L[k * 3 + 2]! += TEAL[2] * lv;
    }
    addLedFxLight('twinkle-stars', grid, ms - T.dmdPower, { palette: POWER_PALETTE, seed: 5 }, L, A * 0.8 * power);
  }

  // La bille monte en accélérant, arrive en haut à l'ignition, puis éclate en gerbe.
  addLedFxLight('rise-burst', grid, ms - RISE_START, { palette: RISE_PALETTE, durationMs: RISE_MS, seed: 3 }, L, 1);
  // L'éclair de l'ignition.
  addLedFxLight('flash', grid, ms - T.ignition, { palette: FLASH_PALETTE }, L, 1);

  // Les lampes du fronton s'allument en vacillant, l'ambiance (aurore) monte et reste.
  if (ms >= T.backglassPower) {
    const e = ms - T.backglassPower;
    let w = A * ledSmooth(e / AMBIENT_RISE_MS);
    if (e < FLICKER_MS && ledHash(Math.floor(e / 45) + 101) < 0.4) w *= 0.25;
    addLedFxLight('aurora-soft', grid, e, { palette: AMBIENT_PALETTE, seed: 9 }, L, w);
  }

  // Le trait du topper, puis le reflet des marques.
  bar(L, u, (ms - T.topperSweep) / T.topperSweepLength, 0.22, SWEEP, 0.75);
  bar(L, u, (ms - T.sheen) / T.sheenLength, 0.1, HOT, 0.5);

  for (let i = 0; i < count; i++) if (L[i]! > 1) L[i] = 1;
  return L;
}

/** Image de l'ouverture à `ms` de son départ : 3 octets par LED, gamma 2, jamais au-delà de `brightness` (0 à 1). */
export function renderLedIntro(grid: LedGrid, ms: number, brightness: number, out?: Uint8Array): Uint8Array {
  return ledLightToBytes(ledIntroLight(grid, ms), brightness, out);
}
