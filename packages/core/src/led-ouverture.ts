// Ouverture des LED : l'animation des bandes adressables pendant l'ouverture de Cyber Pinball, la partie
// pure (aucune entrée-sortie, l'instant est donné depuis le départ de l'ouverture).
//
// Même déroulé et même minutage que l'ouverture Soie du plateau (soieAt, app/renderer/intro.js ;
// INTRO_TIMELINE, intro.ts), en vert signal de la marque :
// - dmdPower (250 ms) : mise sous tension discrète, une lueur verte et quelques points qui s'éveillent ;
// - 1 200 à 2 400 ms : le faisceau vert part du BAS (côté flippers), monte en accélérant puis en
//   ralentissant (la même courbe que l'étincelle du plateau), sa traînée derrière lui, et s'arrête au
//   MILIEU du plateau juste à l'ignition ;
// - ignition (2 400 ms) : l'explosion au milieu, une onde verte qui s'étend du centre vers le haut et le
//   bas (et les côtés d'une matrice), un cœur blanc-vert et un souffle bref sur toute la bande ; elle
//   s'éteint comme l'éclair du plateau, puis l'ambiance (aurore verte et sarcelle) monte ;
// - topperSweep (2 700 ms) : un trait de lumière remonte les bandes ;
// - sheen (3 900 ms) : un reflet blanc chaud passe, une fois ;
// - à partir de `end` (4 600 ms) : l'ambiance posée, en boucle, jusqu'à la sortie de l'ouverture
//   (LedAmbientEngine.endIntro fait alors un fondu vers l'ambiance des menus, sans passer par le noir).
//
// Le bas et le haut viennent de la disposition déclarée de chaque bande (`ledStripPosition`) : le faisceau
// monte quel que soit le bout câblé en premier (retour d'essai du 26/11/2026 : il descendait).
//
// Invariants (fixés par led-animations.test.ts) : rien avant la mise sous tension ; le front du faisceau
// avance du bas vers le haut et s'arrête au milieu ; l'explosion part du milieu ; le pic est à
// l'ignition ; une image ne dépend que de l'instant (aucun hasard) ; l'ambiance posée reste sous
// LED_AMBIENT_CEILING, comme celle des menus.

import type { Rgb } from './jukebox-visualizer';
import { INTRO_TIMELINE } from './intro';
import { LED_AMBIENT_CEILING, ledHash, ledSmooth, ledSoftNoise } from './led-animations';
import { addLedFxLight, ledLightToBytes } from './led-effets';
import { ledStripPosition, ledXY, type LedGrid } from './led-live';
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
/** Le faisceau part à 1 200 ms (l'étincelle du plateau) et s'arrête au milieu à l'ignition. */
const BEAM_START = 1200;
/** Départ un peu sous la bande (l'étincelle du plateau naît sous l'écran), arrivée au milieu. */
const BEAM_FROM = -0.04;
const BEAM_TO = 0.5;
/** Traînée sous le faisceau (360 unités d'un plateau de 1 920 : 0,19) et demi-largeur de sa tête. */
const BEAM_TRAIL = 0.19;
const BEAM_HEAD = 0.035;
/** Explosion : l'onde atteint les bouts de la bande en 400 ms ; elle s'éteint comme l'éclair du plateau. */
const BLAST_MS = 400;
const BLAST_REACH = 0.56;
const BLAST_DECAY = 1.5;
/** Souffle bref de toute la bande à l'ignition. */
const BLOOM_MS = 250;
/** L'ambiance monte une fois l'onde partie, avec le vacillement des lampes du fronton. */
const AMBIENT_DELAY = 300;
const FLICKER_MS = 500;
const AMBIENT_RISE_MS = 1200;

const lin = (hex: string): Rgb => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};
const SIG = lin(LED_INTRO_COLORS.signal);
const SWEEP: Rgb = ((a: Rgb, b: Rgb): Rgb => [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45, a[2] + (b[2] - a[2]) * 0.45])(SIG, lin(LED_INTRO_COLORS.hot));
const HOT = lin(LED_INTRO_COLORS.hot);
const POWER_PALETTE = [LED_INTRO_COLORS.signal, LED_INTRO_COLORS.halo];
const AMBIENT_PALETTE = [LED_INTRO_COLORS.signal, LED_INTRO_COLORS.halo, LED_INTRO_COLORS.teal];

/** Avancement de 0 à 1 entre a et b. */
const seg = (t: number, a: number, b: number): number => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
/** Accélère puis ralentit (E.io3 de intro.js). */
const io3 = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Départ vif, arrivée douce (E.expo de intro.js). */
const expo = (x: number): number => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));

interface IntroGeo {
  /** Hauteur de chaque LED : 0 en bas (côté flippers), 1 en haut ; bande à plat : de gauche à droite. */
  p: Float32Array;
  /** Distance au milieu du plateau, 0 à 0,5 (matrice : distance au centre, ramenée à la même échelle). */
  d: Float32Array;
  /** Part du faisceau qui touche la LED : 1 sur une bande ; sur une matrice, les colonnes du milieu. */
  lane: Float32Array;
  /** Bande à plat (une ligne) : pas de bas ni de haut, le faisceau s'y voit de face, au milieu. */
  flat: boolean;
}

const geoCache = new Map<string, IntroGeo>();
function geometry(grid: LedGrid): IntroGeo {
  const w = Math.max(0, Math.floor(grid.width) || 0);
  const h = Math.max(0, Math.floor(grid.height) || 0);
  const key = `${w}x${h}:${grid.arrangement}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const n = w * h;
  const matrix = w > 1 && h > 1;
  const g: IntroGeo = { p: new Float32Array(n), d: new Float32Array(n), lane: new Float32Array(n), flat: !matrix && h <= 1 && w > 1 };
  for (let k = 0; k < n; k++) {
    if (matrix) {
      const { x, y } = ledXY(grid, k);
      const xs = x / (w - 1);
      g.p[k] = (h - 1 - y) / (h - 1);
      g.d[k] = Math.hypot(xs - 0.5, g.p[k]! - 0.5) / Math.SQRT2;
      g.lane[k] = Math.exp(-(((x - (w - 1) / 2) / 0.9) ** 2));
    } else {
      g.p[k] = n > 1 ? ledStripPosition(grid, k) : 0.5;
      g.d[k] = Math.abs(g.p[k]! - 0.5);
      g.lane[k] = 1;
    }
  }
  if (geoCache.size > 32) geoCache.clear();
  geoCache.set(key, g);
  return g;
}

const add = (L: Float32Array, k: number, c: Rgb, lv: number): void => {
  L[k * 3]! += c[0] * lv;
  L[k * 3 + 1]! += c[1] * lv;
  L[k * 3 + 2]! += c[2] * lv;
};

/** Position (0 à 1, du bas vers le haut) de la tête du faisceau à `ms`, ou undefined hors de sa course. */
export function ledIntroBeamHead(ms: number): number | undefined {
  if (!(ms > BEAM_START && ms < T.ignition + 50)) return undefined;
  return BEAM_FROM + (BEAM_TO - BEAM_FROM) * io3(seg(ms, BEAM_START, T.ignition));
}

/** Le faisceau vert : du bas jusqu'au milieu, tête claire et traînée dessous. */
function beam(L: Float32Array, g: IntroGeo, ms: number): void {
  const head = ledIntroBeamHead(ms);
  if (head === undefined) return;
  // Il s'efface dans l'explosion, en 50 ms.
  const level = ms < T.ignition ? 1 : 1 - (ms - T.ignition) / 50;
  const a = seg(ms, BEAM_START, T.ignition);
  for (let k = 0; k < g.p.length; k++) {
    if (g.flat) {
      // De face : le faisceau qui approche se voit au milieu, de plus en plus fort.
      add(L, k, SIG, level * (0.15 + 0.6 * a) * Math.exp(-((g.d[k]! / 0.06) ** 2)));
      continue;
    }
    const dp = head - g.p[k]!;
    const trail = dp >= 0 && dp < BEAM_TRAIL ? 0.7 * (1 - dp / BEAM_TRAIL) ** 2 : 0;
    const glow = Math.exp(-((dp / BEAM_HEAD) ** 2));
    const lane = g.lane[k]! * level;
    add(L, k, SIG, (trail + 0.6 * glow) * lane);
    add(L, k, HOT, 0.8 * Math.exp(-((dp / (BEAM_HEAD * 0.45)) ** 2)) * lane);
  }
}

/** L'explosion au milieu : onde qui s'étend vers le haut et le bas, cœur blanc-vert, souffle bref. */
function blast(L: Float32Array, g: IntroGeo, ms: number): void {
  const e = ms - T.ignition;
  if (!(e >= 0)) return;
  // Éteinte à `end` : l'ambiance posée reste seule, sous son plafond.
  const ign = Math.exp((-e / 1000) * BLAST_DECAY) * (1 - seg(ms, T.end - 1000, T.end));
  if (ign < 0.005) return;
  const R = BLAST_REACH * expo(e / BLAST_MS);
  const bloom = e < BLOOM_MS ? 0.35 * (1 - e / BLOOM_MS) : 0;
  for (let k = 0; k < g.d.length; k++) {
    const d = g.d[k]!;
    const ring = Math.exp(-(((d - R) / 0.05) ** 2));
    const inside = d < R ? 0.4 * (1 - d / 0.6) : 0;
    add(L, k, SIG, (ring + inside) * ign + bloom);
    add(L, k, HOT, 0.9 * Math.exp(-((d / 0.07) ** 2)) * ign);
  }
}

/** Trait de lumière qui remonte la bande, du bas vers le haut (`e` : 0 à 1 de sa course). */
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
  const g = geometry(grid);
  const u = g.p;
  const count = u.length * 3;
  const L = out && out.length === count ? out : new Float32Array(count);
  L.fill(0);
  if (!(ms >= T.dmdPower) || !count) return L;
  const A = LED_AMBIENT_CEILING;

  // Mise sous tension : une lueur verte qui s'éveille, quelques points ; elle cède la place à l'explosion.
  const power = ledSmooth((ms - T.dmdPower) / 1600) * (1 - ledSmooth((ms - T.ignition) / 600));
  if (power > 0) {
    for (let k = 0; k < u.length; k++) add(L, k, SIG, A * 0.22 * power * (0.7 + 0.3 * ledSoftNoise(k + 11, ms / 380)));
    addLedFxLight('twinkle-stars', grid, ms - T.dmdPower, { palette: POWER_PALETTE, seed: 5 }, L, A * 0.8 * power);
  }

  // Le faisceau monte du bas jusqu'au milieu, puis l'explosion part du milieu.
  beam(L, g, ms);
  blast(L, g, ms);

  // Les lampes du fronton s'allument en vacillant, l'ambiance (aurore) monte et reste.
  if (ms >= T.backglassPower + AMBIENT_DELAY) {
    const e = ms - T.backglassPower - AMBIENT_DELAY;
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
