// Bibliothèque d'effets des LED adressables : la partie pure (aucune entrée-sortie, l'horloge est donnée).
//
// Deux usages : l'ambiance du cabinet hors partie (écrans, roue des tables, repos), et les événements de
// jeu des tables sans configuration DOF (bille perdue, extra-ball, jackpot, multibille…), qui posent un
// effet ponctuel par-dessus l'ambiance.
//
// API (stable) :
// - `LED_FX` : le catalogue. Chaque effet a un `id` court en anglais (`comet-cross`, `beam-up`…), une
//   `family`, un `kind` ('loop' : ambiance en boucle ; 'oneShot' : événement de durée finie, `defaultMs`),
//   un `mood` ('calm' | 'lively') et `rainbow` (vrai arc-en-ciel : ignore la palette). `ledFxInfo(id)`.
//   `LED_FX_FAMILIES` : les familles, dans l'ordre du catalogue.
// - `ledFxPalette(colors)` : palette de 5 couleurs saturées pour la LED, d'après 1 à 5 couleurs (Rgb ou
//   #rrggbb) ; la première est la dominante, les manquantes sont des voisines de teinte des données.
// - `renderLedFx(id, grid, ms, { palette, brightness, seed?, speed?, durationMs? }, out?)` : image d'un
//   effet à l'instant `ms` (pour un ponctuel : depuis son départ ; noir avant 0 et après sa durée).
//   3 octets RVB par LED, comme `renderLedEffect` ; `out` est réutilisé s'il a la bonne taille.
// - `LedFxSequencer` : enchaîne les effets en boucle (fondu enchaîné, tirage déterministe d'après la
//   graine, jamais deux fois la même famille d'affilée, ni l'une des 3 dernières variantes), avec un
//   fondu de palette (`setPalette`), des effets posés par-dessus (`trigger`) et `next(now)` pour passer
//   à l'effet suivant. `render(grid, now, out?)` donne l'image à l'instant `now`.
//
// Géométrie : une bande simple (largeur ou hauteur 1) se lit dans l'ordre des LED, de la première (0) à
// la dernière (1) ; une matrice se lit par `ledXY`, colonne et ligne. « Monter » : vers la fin d'une
// bande, vers le haut d'une matrice. Un même rendu sert aux deux.
//
// Invariants (fixés par led-effets.test.ts) : aucune LED ne dépasse la luminosité maximale donnée (0 à 1) ;
// une image ne dépend que de (effet, instant, graine, palette) ; un ponctuel est noir après sa durée ;
// aucune allocation par LED à chaque image (tampons réutilisés) : 1 000 LED à 30 images/s coûtent
// quelques millisecondes au plus. Les niveaux sont perçus : comme `LedAmbientEngine`, la sortie applique
// un gamma 2 (un quart de la valeur paraît déjà à moitié allumé sur une LED).

import { hsvToRgb, rgbToHsv, type Rgb } from './jukebox-visualizer';
import { LED_AMBIENT_CEILING, ledHash, ledSmooth, ledSoftNoise } from './led-animations';
import { ledXY, parseLedColor, type LedGrid } from './led-live';
import { hexToRgb, NEUTRAL_TINT } from './tabletint';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type LedFxKind = 'loop' | 'oneShot';
export type LedFxMood = 'calm' | 'lively';

// [id, famille, genre, humeur, durée par défaut en ms (ponctuels), vrai arc-en-ciel]
const CATALOG = [
  // Respiration
  ['breath-slow', 'breath', 'loop', 'calm', 0, false],
  ['breath-double', 'breath', 'loop', 'lively', 0, false],
  ['breath-split', 'breath', 'loop', 'calm', 0, false],
  // Vagues
  ['wave-single', 'wave', 'loop', 'calm', 0, false],
  ['wave-multi', 'wave', 'loop', 'calm', 0, false],
  ['wave-bounce', 'wave', 'loop', 'lively', 0, false],
  // Dégradés qui glissent
  ['gradient-drift', 'gradient', 'loop', 'calm', 0, false],
  ['gradient-mirror', 'gradient', 'loop', 'calm', 0, false],
  ['gradient-pingpong', 'gradient', 'loop', 'calm', 0, false],
  // Comètes à traîne
  ['comet-single', 'comet', 'loop', 'lively', 0, false],
  ['comet-multi', 'comet', 'loop', 'lively', 0, false],
  ['comet-bounce', 'comet', 'loop', 'lively', 0, false],
  ['comet-cross', 'comet', 'loop', 'lively', 0, false],
  // Faisceaux
  ['beam-up', 'beam', 'loop', 'lively', 0, false],
  ['beam-down', 'beam', 'loop', 'calm', 0, false],
  ['beam-sweep', 'beam', 'loop', 'calm', 0, false],
  // Paquets de lumière
  ['packet-stream', 'packet', 'loop', 'lively', 0, false],
  ['packet-cross', 'packet', 'loop', 'lively', 0, false],
  // Scintillement
  ['twinkle-soft', 'twinkle', 'loop', 'calm', 0, false],
  ['twinkle-dense', 'twinkle', 'loop', 'lively', 0, false],
  ['twinkle-stars', 'twinkle', 'loop', 'calm', 0, false],
  // Étincelles
  ['sparkle-flash', 'sparkle', 'loop', 'lively', 0, false],
  ['sparkle-burst', 'sparkle', 'loop', 'lively', 0, false],
  // Arc-en-ciel
  ['rainbow-palette', 'rainbow', 'loop', 'calm', 0, false],
  ['rainbow-full', 'rainbow', 'loop', 'calm', 0, true],
  ['rainbow-spin', 'rainbow', 'loop', 'lively', 0, true],
  // Feu
  ['fire-embers', 'fire', 'loop', 'calm', 0, false],
  ['fire-flames', 'fire', 'loop', 'lively', 0, false],
  // Aurore
  ['aurora-soft', 'aurora', 'loop', 'calm', 0, false],
  ['aurora-curtain', 'aurora', 'loop', 'calm', 0, false],
  // Théâtre (chenillard à motifs)
  ['theater-chase', 'theater', 'loop', 'lively', 0, false],
  ['theater-dual', 'theater', 'loop', 'lively', 0, false],
  ['theater-fade', 'theater', 'loop', 'calm', 0, false],
  // Ponctuels
  ['flash', 'flash', 'oneShot', 'lively', 500, false],
  ['ripple-center', 'ripple', 'oneShot', 'lively', 1000, false],
  ['ripple-end', 'ripple', 'oneShot', 'lively', 1000, false],
  ['rise-burst', 'rise', 'oneShot', 'lively', 1600, false],
  ['curtain-open', 'curtain', 'oneShot', 'calm', 1200, false],
  ['curtain-close', 'curtain', 'oneShot', 'calm', 1200, false],
  ['pulse-double', 'pulse', 'oneShot', 'calm', 1000, false],
  ['spark-rain', 'rain', 'oneShot', 'lively', 1800, false],
  ['strobe', 'strobe', 'oneShot', 'lively', 700, false],
  ['rainbow-sweep', 'sweep', 'oneShot', 'lively', 1400, true],
  ['drain', 'drain', 'oneShot', 'calm', 1600, false],
] as const;

export type LedFxId = (typeof CATALOG)[number][0];
export type LedFxFamily = (typeof CATALOG)[number][1];

export interface LedFxInfo {
  readonly id: LedFxId;
  readonly family: LedFxFamily;
  readonly kind: LedFxKind;
  readonly mood: LedFxMood;
  /** Durée par défaut d'un ponctuel, en ms (undefined pour un effet en boucle). */
  readonly defaultMs?: number;
  /** Vrai arc-en-ciel : la palette n'est pas suivie. */
  readonly rainbow: boolean;
}

export const LED_FX: readonly LedFxInfo[] = CATALOG.map(([id, family, kind, mood, ms, rainbow]) =>
  Object.freeze(kind === 'oneShot' ? { id, family, kind, mood, defaultMs: ms, rainbow } : { id, family, kind, mood, rainbow }),
);

export const LED_FX_FAMILIES: readonly LedFxFamily[] = [...new Set(LED_FX.map((f) => f.family))];

const INFO = new Map<string, LedFxInfo>(LED_FX.map((f) => [f.id, f]));

export function ledFxInfo(id: string): LedFxInfo | undefined {
  return INFO.get(id);
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Cinq couleurs vives : la dominante d'abord, puis les autres données, puis des voisines de teinte. */
export type LedFxPalette = readonly [Rgb, Rgb, Rgb, Rgb, Rgb];

const HUE_STEPS = [35, -35, 60, -60];

/** Couleur pour la LED : teinte gardée, saturée (sauf un blanc), à pleine valeur ; undefined si illisible ou noire. */
function ledColor(c: Rgb | string): Rgb | undefined {
  let rgb: Rgb | undefined;
  if (typeof c === 'string') rgb = parseLedColor(c);
  else if (Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    rgb = [Math.max(0, Math.min(255, c[0])), Math.max(0, Math.min(255, c[1])), Math.max(0, Math.min(255, c[2]))];
  }
  if (!rgb) return undefined;
  const [h, s, v] = rgbToHsv(rgb);
  if (v < 0.05) return undefined;
  return hsvToRgb(h, s < 0.12 ? s : Math.max(s, 0.85), 1);
}

/**
 * Palette des effets d'après 1 à 5 couleurs (au-delà, les premières). Les couleurs illisibles ou noires
 * sont ignorées ; sans aucune, la sarcelle de la marque. Comme `ledPalette`, un pastel garde sa teinte et
 * se sature ; les places libres reçoivent des voisines de teinte des couleurs données (±35°, puis ±60°).
 */
export function ledFxPalette(colors: readonly (Rgb | string)[] | undefined): LedFxPalette {
  const given: Rgb[] = [];
  for (const c of colors ?? []) {
    if (given.length >= 5) break;
    const rgb = ledColor(c);
    if (rgb) given.push(rgb);
  }
  if (!given.length) given.push(ledColor(hexToRgb(NEUTRAL_TINT))!);
  const out = given.slice();
  const k = given.length;
  for (let i = k; i < 5; i++) {
    const [h, s, v] = rgbToHsv(given[(i - k) % k]!);
    out.push(hsvToRgb(h + HUE_STEPS[i - k]!, s, v));
  }
  return out as unknown as LedFxPalette;
}

/** Palette en 15 réels de 0 à 1 (R, V, B des 5 couleurs) : la forme lue par les rendus. */
function paletteF32(p: LedFxPalette): Float32Array {
  const f = new Float32Array(15);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) f[i * 3 + j] = p[i]![j]! / 255;
  return f;
}

// ---------------------------------------------------------------------------
// Géométrie : calculée une fois par forme de bande
// ---------------------------------------------------------------------------

interface Geo {
  n: number;
  /** Bande simple (une seule ligne ou colonne). */
  strip: boolean;
  /** Nombre de LED le long de l'axe principal (la bande ; la plus grande dimension d'une matrice). */
  len: number;
  /** Nombre de LED de bas en haut (la bande entière pour une bande simple). */
  upLen: number;
  /** Étendue en colonnes et en lignes (une bande simple : n colonnes, 1 ligne). */
  cols: number;
  rows: number;
  /** Position 0 à 1 le long de l'axe principal. */
  a: Float32Array;
  /** Même position, en LED (0 à len - 1). */
  pos: Float32Array;
  /** Hauteur 0 (bas, ou début de bande) à 1 (haut, ou fin de bande), et la même en LED. */
  up: Float32Array;
  upPos: Float32Array;
  /** Distance au centre, 0 à 1. */
  rad: Float32Array;
  /** Angle autour du centre, 0 à 1 (bande simple : distance au milieu, 0 à 0.5). */
  ang: Float32Array;
  /** Colonne et ligne en LED, le bas en 0 (bande simple : rang, 0). */
  gx: Float32Array;
  gy: Float32Array;
  /** Colonne de la LED, pour les effets verticaux (bande simple : 0). */
  lane: Int32Array;
}

const geoCache = new Map<string, Geo>();

function geometry(grid: LedGrid): Geo {
  const w = Math.max(0, Math.floor(grid.width) || 0);
  const h = Math.max(0, Math.floor(grid.height) || 0);
  const key = `${w}x${h}:${grid.arrangement}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const n = w * h;
  const strip = w <= 1 || h <= 1;
  const g: Geo = {
    n,
    strip,
    len: strip ? n : Math.max(w, h),
    upLen: strip ? n : h,
    cols: strip ? n : w,
    rows: strip ? 1 : h,
    a: new Float32Array(n),
    pos: new Float32Array(n),
    up: new Float32Array(n),
    upPos: new Float32Array(n),
    rad: new Float32Array(n),
    ang: new Float32Array(n),
    gx: new Float32Array(n),
    gy: new Float32Array(n),
    lane: new Int32Array(n),
  };
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxd = Math.max(1e-6, Math.hypot(cx, cy));
  for (let k = 0; k < n; k++) {
    if (strip) {
      const u = n > 1 ? k / (n - 1) : 0.5;
      g.a[k] = u;
      g.pos[k] = k;
      g.up[k] = u;
      g.upPos[k] = k;
      g.rad[k] = Math.abs(u - 0.5) * 2;
      g.ang[k] = Math.abs(u - 0.5);
      g.gx[k] = k;
      g.gy[k] = 0;
      g.lane[k] = 0;
    } else {
      const { x, y } = ledXY(grid, k);
      const yUp = h - 1 - y;
      const along = w >= h ? x : yUp;
      g.pos[k] = along;
      g.a[k] = along / (Math.max(w, h) - 1);
      g.up[k] = yUp / (h - 1);
      g.upPos[k] = yUp;
      g.rad[k] = Math.hypot(x - cx, y - cy) / maxd;
      g.ang[k] = Math.atan2(yUp - cy, x - cx) / (2 * Math.PI) + 0.5;
      g.gx[k] = x;
      g.gy[k] = yUp;
      g.lane[k] = x;
    }
  }
  if (geoCache.size > 16) geoCache.clear();
  geoCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// Aides de rendu (aucune allocation : couleur de travail dans SR, SG, SB)
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
// Les aides de led-animations.ts ne sont lues qu'à l'appel, jamais au chargement du module : si
// led-animations.ts importe un jour ce module (import circulaire), rien ne casse.
const smooth = (v: number) => ledSmooth(v);
const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const frac = (x: number) => x - Math.floor(x);
const mod = (i: number, m: number) => ((i % m) + m) % m;

let SR = 0;
let SG = 0;
let SB = 0;

/** Nombre stable dans [0, 1[ pour (graine, a, b). */
function rnd(seed: number, a: number, b: number): number {
  return ledHash(Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca6b));
}

/** Ajoute la couleur `ci` de la palette, au niveau `lv`. */
function add(B: Float32Array, k: number, P: Float32Array, ci: number, lv: number): void {
  const o = k * 3;
  const p = ci * 3;
  B[o]! += P[p]! * lv;
  B[o + 1]! += P[p + 1]! * lv;
  B[o + 2]! += P[p + 2]! * lv;
}

/** Ajoute le mélange des couleurs `ci` (f = 0) et `cj` (f = 1). */
function addMix(B: Float32Array, k: number, P: Float32Array, ci: number, cj: number, f: number, lv: number): void {
  const o = k * 3;
  const p = ci * 3;
  const q = cj * 3;
  B[o]! += (P[p]! + (P[q]! - P[p]!) * f) * lv;
  B[o + 1]! += (P[p + 1]! + (P[q + 1]! - P[p + 1]!) * f) * lv;
  B[o + 2]! += (P[p + 2]! + (P[q + 2]! - P[p + 2]!) * f) * lv;
}

/** Ajoute la couleur `ci` blanchie d'une part `w` (0 à 1) : le cœur éclatant d'une comète ou d'un éclat. */
function addWhiteMix(B: Float32Array, k: number, P: Float32Array, ci: number, w: number, lv: number): void {
  const o = k * 3;
  const p = ci * 3;
  B[o]! += (P[p]! + (1 - P[p]!) * w) * lv;
  B[o + 1]! += (P[p + 1]! + (1 - P[p + 1]!) * w) * lv;
  B[o + 2]! += (P[p + 2]! + (1 - P[p + 2]!) * w) * lv;
}

function addWhite(B: Float32Array, k: number, lv: number): void {
  const o = k * 3;
  B[o]! += lv;
  B[o + 1]! += lv;
  B[o + 2]! += lv;
}

/** Ajoute la couleur de travail (SR, SG, SB). */
function addS(B: Float32Array, k: number, lv: number): void {
  const o = k * 3;
  B[o]! += SR * lv;
  B[o + 1]! += SG * lv;
  B[o + 2]! += SB * lv;
}

/** Couleur de travail : point `f` (modulo 1) d'un cycle doux à travers les `m` premières couleurs. */
function cycle(P: Float32Array, f: number, m: number): void {
  const x = frac(f) * m;
  const i = Math.min(m - 1, Math.floor(x));
  const j = i + 1 === m ? 0 : i + 1;
  const s = smooth(x - i);
  const p = i * 3;
  const q = j * 3;
  SR = P[p]! + (P[q]! - P[p]!) * s;
  SG = P[p + 1]! + (P[q + 1]! - P[p + 1]!) * s;
  SB = P[p + 2]! + (P[q + 2]! - P[p + 2]!) * s;
}

/** Couleur de travail d'après teinte (degrés), saturation et valeur (0 à 1). */
function hsvS(h: number, s: number, v: number): void {
  const hh = mod(h, 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const i = Math.floor(hh);
  SR = m + (i === 0 || i >= 5 ? c : i === 1 || i === 4 ? x : 0);
  SG = m + (i === 1 || i === 2 ? c : i === 0 || i === 3 ? x : 0);
  SB = m + (i === 3 || i === 4 ? c : i === 2 || i >= 5 ? x : 0);
}

/** Traîne d'une comète : `d` LED derrière la tête (négatif : devant), traîne de `L` LED. */
function trail(d: number, L: number): number {
  if (d < -1 || d >= L) return 0;
  if (d < 0) return 1 + d;
  const f = 1 - d / L;
  return f * f;
}

/** Paquet de `L` LED, bords adoucis sur une LED. */
function packet(d: number, L: number): number {
  if (d < -1 || d > L + 1) return 0;
  return Math.min(1, d + 1, L + 1 - d);
}

/** Tête d'un mobile qui parcourt `len` LED (plus sa traîne) en boucle, en LED. */
function headAt(t: number, speed: number, len: number, L: number, offset: number): number {
  const cyc = len + L + 2;
  return frac((t * speed) / cyc + offset) * cyc - 1;
}

// Petits tampons par image (têtes de comètes, paquets, gerbes) : jamais réalloués.
const H1 = new Float64Array(8);
const H2 = new Float64Array(8);
const H3 = new Float64Array(8);
const H4 = new Float64Array(8);
/** Couleurs des paquets de `packet-cross` : trois dans un sens, trois dans l'autre. */
const CROSS_COLORS = [0, 2, 4, 1, 3, 0];

interface Ctx {
  B: Float32Array;
  g: Geo;
  P: Float32Array;
  /** Secondes depuis le départ (vitesse comprise pour une boucle). */
  t: number;
  /** Avancement d'un ponctuel, 0 à 1. */
  e: number;
  seed: number;
  /** Base des graines de bruit. */
  ns: number;
}

const ctx: Ctx = { B: new Float32Array(0), g: geometry({ width: 0, height: 0, arrangement: 'LeftRightTopDown' }), P: new Float32Array(15), t: 0, e: 0, seed: 0, ns: 0 };

// ---------------------------------------------------------------------------
// Effets : chacun ajoute sa lumière (0 à 1 par canal, avant gamma) dans c.B, déjà à zéro
// ---------------------------------------------------------------------------

function twinkle(c: Ctx, prob: number, pmin: number, pspan: number, sharp: number, base: number, colors: number, white: number, drift: boolean): void {
  const { B, g, P, t, seed } = c;
  for (let k = 0; k < g.n; k++) {
    const x = g.a[k]!;
    if (drift) addMix(B, k, P, 0, 3, 0.5 + 0.5 * Math.sin(TAU * (x * 0.6 - t / 23)), base);
    else add(B, k, P, 0, base * (0.8 + 0.2 * Math.sin(TAU * (t / 11 + x))));
    const period = pmin + pspan * rnd(seed, k, 2);
    const cyc = t / period + rnd(seed, k, 1);
    const ci = Math.floor(cyc);
    if (rnd(seed, k, ci * 2 + 7) >= prob) continue;
    const lit = Math.sin(Math.PI * (cyc - ci)) ** sharp;
    addWhiteMix(B, k, P, Math.floor(rnd(seed, k + 7777, ci) * colors), white, lit);
  }
}

function ripple(c: Ctx, field: Float32Array): void {
  const { B, g, P, e } = c;
  const R = e * 1.3;
  const fade = (1 - e) ** 1.3;
  for (let k = 0; k < g.n; k++) {
    const f = field[k]!;
    const d = f - R;
    const ring = Math.exp(-((d / 0.09) ** 2));
    const inner = d < 0 ? 0.3 * Math.exp(d * 5) : 0;
    addMix(B, k, P, 0, 1, clamp01(f), (ring + inner) * fade);
    if (ring > 0.3) addWhite(B, k, (ring - 0.3) * 0.5 * fade);
  }
}

function curtain(c: Ctx, open: boolean): void {
  const { B, g, P, e } = c;
  const hw = smooth(e / 0.45) * 0.56;
  const fade = e < 0.55 ? 1 : (1 - (e - 0.55) / 0.45) ** 2;
  const edgeFade = fade * (1 - smooth((e - 0.4) / 0.15)) * 0.5;
  for (let k = 0; k < g.n; k++) {
    const x = Math.abs(g.a[k]! - 0.5);
    const inside = open ? clamp01((hw - x) / 0.05) : clamp01((x - (0.5 - hw)) / 0.05);
    const edge = open ? x - hw : 0.5 - hw - x;
    addMix(B, k, P, 0, 1, x * 2, inside * fade);
    addWhite(B, k, Math.exp(-((edge / 0.03) ** 2)) * edgeFade);
  }
}

const RENDER: Record<LedFxId, (c: Ctx) => void> = {
  // --- Respiration -------------------------------------------------------
  // Souffle de 7 s, la fin de la bande un peu en retard ; la couleur glisse entre les deux premières.
  'breath-slow': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const br = 0.5 - 0.5 * Math.cos(TAU * (t / 7 - x * 0.12));
      addMix(B, k, P, 0, 1, 0.5 - 0.5 * Math.cos(TAU * (t / 31 + x * 0.2)), 0.15 + 0.85 * br);
    }
  },
  // Battement de cœur (deux coups rapprochés), parti du centre.
  'breath-double': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const p = frac(t / 2.4 - g.rad[k]! * 0.12);
      const beat = Math.min(1, Math.exp(-(((p - 0.1) / 0.05) ** 2)) + 0.75 * Math.exp(-(((p - 0.32) / 0.07) ** 2)));
      addMix(B, k, P, 0, 2, beat * 0.45, 0.14 + 0.86 * beat);
    }
  },
  // Les deux moitiés respirent à contretemps, chacune de sa couleur.
  'breath-split': ({ B, g, P, t }) => {
    const A = 0.5 - 0.5 * Math.cos((TAU * t) / 6.5);
    for (let k = 0; k < g.n; k++) {
      const w = smooth((g.a[k]! - 0.3) / 0.4);
      add(B, k, P, 0, (0.14 + 0.86 * A) * (1 - w));
      add(B, k, P, 1, (0.14 + 0.86 * (1 - A)) * w);
    }
  },
  // --- Vagues --------------------------------------------------------------
  'wave-single': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const w = 0.5 + 0.5 * Math.sin(TAU * (x * 1.2 - t / 6));
      addMix(B, k, P, 0, 1, 0.5 + 0.5 * Math.sin(TAU * (x * 0.5 + t / 20)), 0.1 + 0.9 * smooth(w));
    }
  },
  // Trois vagues de couleurs, de longueurs et de vitesses différentes, l'une à contresens.
  'wave-multi': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const w1 = 0.5 + 0.5 * Math.sin(TAU * (x * 1.0 - t / 7));
      const w2 = 0.5 + 0.5 * Math.sin(TAU * (x * 1.7 + t / 9));
      const w3 = 0.5 + 0.5 * Math.sin(TAU * (x * 0.6 - t / 13 + g.up[k]! * 0.3));
      add(B, k, P, 0, 0.1 + 0.75 * w1 * w1 * w1);
      add(B, k, P, 1, 0.6 * w2 * w2 * w2);
      add(B, k, P, 2, 0.5 * w3 * w3 * w3);
    }
  },
  // Deux vagues qui vont et viennent en sens contraires.
  'wave-bounce': ({ B, g, P, t }) => {
    const off = 1.2 * Math.sin((TAU * t) / 12);
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const w1 = 0.5 + 0.5 * Math.sin(TAU * (x * 1.3 - off));
      const w2 = 0.5 + 0.5 * Math.sin(TAU * (x * 1.3 + off + 0.5));
      add(B, k, P, 0, 0.08 + 0.85 * w1 * w1);
      add(B, k, P, 3, 0.65 * w2 * w2);
    }
  },
  // --- Dégradés ------------------------------------------------------------
  'gradient-drift': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      cycle(P, g.a[k]! * 0.8 + g.up[k]! * 0.15 - t / 30, 5);
      addS(B, k, 0.8);
    }
  },
  // Symétrique : les couleurs naissent au centre et s'écartent.
  'gradient-mirror': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const r = g.rad[k]!;
      cycle(P, r * 0.7 - t / 25, 3);
      addS(B, k, 0.62 + 0.18 * Math.sin(TAU * (r * 1.5 - t / 8)));
    }
  },
  // Le dégradé glisse d'un côté puis de l'autre, une houle de lumière par-dessus.
  'gradient-pingpong': ({ B, g, P, t }) => {
    const shift = 0.45 * Math.sin((TAU * t) / 36);
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      cycle(P, x * 0.7 + shift, 4);
      addS(B, k, 0.68 + 0.22 * Math.sin(TAU * (x * 2 - t / 10)));
    }
  },
  // --- Comètes -------------------------------------------------------------
  'comet-single': ({ B, g, P, t }) => {
    const L = Math.max(4, g.len * 0.2);
    const head = headAt(t, Math.max(6, g.len / 3.2), g.len, L, 0);
    for (let k = 0; k < g.n; k++) {
      add(B, k, P, 1, 0.12);
      const d = head - g.pos[k]!;
      const lv = trail(d, L);
      if (lv > 0) addWhiteMix(B, k, P, 0, 0.45 * Math.max(0, 1 - Math.abs(d)), lv);
    }
  },
  // Trois comètes de couleurs et de vitesses différentes.
  'comet-multi': ({ B, g, P, t, seed }) => {
    const len = g.len;
    H2[0] = Math.max(3, len * 0.18);
    H2[1] = Math.max(3, len * 0.12);
    H2[2] = Math.max(4, len * 0.25);
    H1[0] = headAt(t, Math.max(5, len / 3), len, H2[0], rnd(seed, 1, 0));
    H1[1] = headAt(t, Math.max(4, len / 4.5), len, H2[1], rnd(seed, 2, 0));
    H1[2] = headAt(t, Math.max(7, len / 2.4), len, H2[2], rnd(seed, 3, 0));
    for (let k = 0; k < g.n; k++) {
      const p = g.pos[k]!;
      add(B, k, P, 0, 0.1);
      add(B, k, P, 0, trail(H1[0]! - p, H2[0]!));
      add(B, k, P, 2, trail(H1[1]! - p, H2[1]!));
      add(B, k, P, 1, trail(H1[2]! - p, H2[2]!));
    }
  },
  // Aller-retour (scanner) : la traîne raccourcit aux demi-tours.
  'comet-bounce': ({ B, g, P, t }) => {
    const ph = (TAU * t) / 3.2;
    const head = (g.len - 1) * (0.5 - 0.5 * Math.cos(ph));
    const vel = Math.sin(ph);
    const dir = vel >= 0 ? 1 : -1;
    const L = Math.max(1.5, Math.max(3, g.len * 0.16) * Math.abs(vel));
    for (let k = 0; k < g.n; k++) {
      add(B, k, P, 2, 0.1);
      const d = (head - g.pos[k]!) * dir;
      const lv = trail(d, L);
      if (lv > 0) addWhiteMix(B, k, P, 0, 0.3 * Math.max(0, 1 - Math.abs(d)), lv);
    }
  },
  // Deux comètes partent des deux bouts et se croisent au milieu dans un éclat.
  'comet-cross': ({ B, g, P, t }) => {
    const len = g.len;
    const L = Math.max(3, len * 0.18);
    const cyc = len + 2 * L;
    const hA = frac((t * Math.max(6, len / 2.8)) / cyc) * cyc - L;
    const hB = len - 1 - hA;
    const meet = (len - 1) / 2;
    const close = Math.exp(-(((hA - meet) / (len * 0.05 + 1)) ** 2));
    const spread = len * 0.12 + 1;
    for (let k = 0; k < g.n; k++) {
      const p = g.pos[k]!;
      add(B, k, P, 2, 0.1);
      add(B, k, P, 0, trail(hA - p, L));
      add(B, k, P, 1, trail(p - hB, L));
      if (close > 0.01) addWhiteMix(B, k, P, 2, 0.5, close * Math.exp(-(((p - meet) / spread) ** 2)));
    }
  },
  // --- Faisceaux -----------------------------------------------------------
  // Deux faisceaux montent l'un après l'autre, chacun d'une couleur.
  'beam-up': ({ B, g, P, t }) => {
    const L = Math.max(3, g.upLen * 0.3);
    for (let i = 0; i < 2; i++) {
      const ph = t / 1.7 + i * 0.5;
      const idx = Math.floor(ph);
      H1[i] = -1 + (g.upLen + L) * (ph - idx);
      H2[i] = mod(idx * 2 + i, 5);
    }
    for (let k = 0; k < g.n; k++) {
      const u = g.upPos[k]!;
      add(B, k, P, 0, 0.1);
      for (let i = 0; i < 2; i++) {
        const lv = trail(H1[i]! - u, L);
        if (lv > 0) add(B, k, P, H2[i]!, lv);
      }
    }
  },
  // Faisceaux qui tombent ; sur une matrice, chaque colonne à son rythme (pluie de lumière).
  'beam-down': ({ B, g, P, t, seed }) => {
    const L = Math.max(3, g.upLen * 0.35);
    for (let k = 0; k < g.n; k++) {
      const lane = g.lane[k]!;
      const u = g.upPos[k]!;
      const off = rnd(seed, lane, 5);
      add(B, k, P, 0, 0.1);
      for (let i = 0; i < 2; i++) {
        const ph = t / 2.3 + off + i * 0.5;
        const idx = Math.floor(ph);
        const head = g.upLen - (g.upLen + L) * (ph - idx);
        const lv = trail(u - head, L);
        if (lv > 0) add(B, k, P, mod(lane + idx, 3), lv);
      }
    }
  },
  // Un large faisceau balaie d'un bout à l'autre, comme un phare.
  'beam-sweep': ({ B, g, P, t }) => {
    const center = 0.5 + 0.62 * Math.sin((TAU * t) / 5.5);
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      addMix(B, k, P, 0, 1, x, 0.12 + 0.88 * Math.exp(-(((x - center) / 0.16) ** 2)));
    }
  },
  // --- Paquets -------------------------------------------------------------
  // Cinq paquets de lumière, un par couleur, à des vitesses différentes ; ils se doublent.
  'packet-stream': ({ B, g, P, t, seed }) => {
    const len = g.len;
    for (let i = 0; i < 5; i++) {
      const L = Math.max(2, len * 0.05) * (0.7 + 0.8 * rnd(seed, i, 2));
      H2[i] = L;
      H1[i] = headAt(t, Math.max(4, len / (2.2 + 3 * rnd(seed, i, 1))), len, L + 2, rnd(seed, i, 3));
    }
    for (let k = 0; k < g.n; k++) {
      const p = g.pos[k]!;
      add(B, k, P, 0, 0.1);
      for (let i = 0; i < 5; i++) {
        const lv = packet(H1[i]! - p, H2[i]!);
        if (lv > 0) add(B, k, P, i, lv * 0.9);
      }
    }
  },
  // Trois paquets dans chaque sens : leurs lumières s'additionnent quand ils se croisent.
  'packet-cross': ({ B, g, P, t, seed }) => {
    const len = g.len;
    for (let i = 0; i < 6; i++) {
      const L = Math.max(2, len * 0.06) * (0.7 + 0.6 * rnd(seed, i, 2));
      H2[i] = L;
      H1[i] = headAt(t, Math.max(4, len / (2.5 + 2.5 * rnd(seed, i, 1))), len, L + 2, rnd(seed, i, 3));
      H3[i] = i < 3 ? 1 : -1;
      H4[i] = CROSS_COLORS[i]!;
    }
    for (let k = 0; k < g.n; k++) {
      const p = g.pos[k]!;
      add(B, k, P, 0, 0.1);
      for (let i = 0; i < 6; i++) {
        const d = H3[i]! > 0 ? H1[i]! - p : p - (len - 1 - H1[i]!);
        const lv = packet(d, H2[i]!);
        if (lv > 0) add(B, k, P, H4[i]!, lv * 0.75);
      }
    }
  },
  // --- Scintillement -------------------------------------------------------
  'twinkle-soft': (c) => twinkle(c, 0.4, 2.5, 3, 4, 0.2, 3, 0.15, false),
  'twinkle-dense': (c) => twinkle(c, 0.75, 1.2, 1.4, 6, 0.12, 5, 0.1, false),
  'twinkle-stars': (c) => twinkle(c, 0.3, 3, 4, 10, 0.16, 5, 0.45, true),
  // --- Étincelles ----------------------------------------------------------
  // Éclats vifs et brefs sur un fond doux qui glisse.
  'sparkle-flash': ({ B, g, P, t, seed }) => {
    for (let k = 0; k < g.n; k++) {
      addMix(B, k, P, 0, 1, 0.5 + 0.5 * Math.sin(TAU * (g.a[k]! * 0.8 - t / 14)), 0.25);
      const s = t / 0.3 + rnd(seed, k, 5);
      const si = Math.floor(s);
      if (rnd(seed, k, si * 3 + 1) >= 0.06) continue;
      const e = s - si;
      const lv = e < 0.05 ? e / 0.05 : Math.exp(-(e - 0.05) * 7);
      addWhiteMix(B, k, P, rnd(seed, k, si * 3 + 2) < 0.5 ? 0 : 2, 0.55, lv);
    }
  },
  // Gerbes : un éclat qui s'ouvre en anneau autour d'un point pris au hasard.
  'sparkle-burst': ({ B, g, P, t, seed }) => {
    const spread = 1.5 + g.len * 0.1;
    for (let j = 0; j < 3; j++) {
      const s = t / (0.9 + 0.5 * rnd(seed, j, 9)) + rnd(seed, j, 8);
      const si = Math.floor(s);
      H1[j] = rnd(seed, j * 977 + si, 11) * (g.cols - 1);
      H2[j] = rnd(seed, j * 977 + si, 12) * (g.rows - 1);
      H3[j] = s - si;
      H4[j] = Math.floor(rnd(seed, j * 977 + si, 13) * 5);
    }
    for (let k = 0; k < g.n; k++) {
      add(B, k, P, 0, 0.15);
      for (let j = 0; j < 3; j++) {
        const e = H3[j]!;
        const dist = Math.hypot(g.gx[k]! - H1[j]!, g.gy[k]! - H2[j]!);
        const f = dist - e * spread;
        const lv = Math.exp(-(f * f)) * (1 - e) ** 2 + (dist < 1.2 ? (1 - e) ** 4 : 0);
        if (lv > 0.002) addWhiteMix(B, k, P, H4[j]!, 0.3 * (1 - e), lv);
      }
    }
  },
  // --- Arc-en-ciel -----------------------------------------------------------
  // La teinte de la table, qui oscille de ±55° le long de la bande : un arc-en-ciel à ses couleurs.
  'rainbow-palette': ({ B, g, P, t }) => {
    const [h0, s0] = rgbToHsv([P[0]! * 255, P[1]! * 255, P[2]! * 255]);
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      hsvS(h0 + 55 * Math.sin(TAU * (x * 0.9 - t / 16)), s0, 1);
      addS(B, k, 0.6 + 0.25 * Math.sin(TAU * (x * 1.5 + t / 9)));
    }
  },
  'rainbow-full': ({ B, g, t }) => {
    for (let k = 0; k < g.n; k++) {
      hsvS(360 * (g.a[k]! - t / 14), 1, 1);
      addS(B, k, 0.75);
    }
  },
  // Roue des couleurs qui tourne (matrice) ; en miroir depuis le milieu (bande).
  'rainbow-spin': ({ B, g, t }) => {
    const scale = g.strip ? 1.6 : 1;
    for (let k = 0; k < g.n; k++) {
      hsvS(360 * (g.ang[k]! * scale - t / 5), 1, 1);
      addS(B, k, 0.62 + 0.3 * Math.sin(TAU * (g.rad[k]! * 2 - t / 1.5)));
    }
  },
  // --- Feu -------------------------------------------------------------------
  // Braises : chaque LED couve à son rythme ; la dominante aux plus chaudes.
  'fire-embers': ({ B, g, P, t, ns }) => {
    for (let k = 0; k < g.n; k++) {
      const heat = ledSoftNoise(ns + k, t * 0.9) * 0.6 + ledSoftNoise(ns + k + 977, t * 2.3) * 0.4;
      addMix(B, k, P, 2, 0, smooth((heat - 0.35) * 2.2), 0.1 + 0.9 * heat * heat);
    }
  },
  // Flammes qui montent : chaudes en bas, des langues qui s'élèvent et retombent.
  'fire-flames': ({ B, g, P, t, ns }) => {
    for (let k = 0; k < g.n; k++) {
      const lane = g.lane[k]! * 31;
      const y = g.up[k]!;
      const n1 = ledSoftNoise(ns + lane, y * 5 - t * 2.2);
      const n2 = ledSoftNoise(ns + lane + 500, y * 9 - t * 3.7);
      const flick = ledSoftNoise(ns + lane + 999, t * 1.7);
      const heat = clamp01((0.55 * n1 + 0.45 * n2) * 1.3 + 0.3 - y * (0.85 + 0.5 * flick));
      const w = clamp01((heat - 0.85) * 3) * 0.6;
      const lv = heat ** 1.2;
      addMix(B, k, P, 2, 0, smooth(heat * 1.6 - 0.2), lv * (1 - w));
      addWhite(B, k, lv * w);
    }
  },
  // --- Aurore ----------------------------------------------------------------
  // Trois voiles de couleur qui ondulent lentement et se mêlent.
  'aurora-soft': ({ B, g, P, t, ns }) => {
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const y = g.up[k]!;
      const w1 = smooth(ledSoftNoise(ns + 1, x * 3 + y * 1.5 + t * 0.13)) ** 2;
      const w2 = smooth(ledSoftNoise(ns + 2, x * 4.3 - t * 0.19 + y)) ** 2;
      const w3 = smooth(ledSoftNoise(ns + 3, x * 2.1 + t * 0.09 - y * 2)) ** 2;
      add(B, k, P, 0, 0.12 + 0.88 * w1);
      add(B, k, P, 1, 0.75 * w2);
      add(B, k, P, 3, 0.6 * w3);
    }
  },
  // Rideau d'aurore : des plis verticaux qui ondoient ; sur une matrice, plus vif en haut.
  'aurora-curtain': ({ B, g, P, t, ns }) => {
    const strip = g.strip;
    for (let k = 0; k < g.n; k++) {
      const x = g.a[k]!;
      const y = g.up[k]!;
      const band = smooth(ledSoftNoise(ns + 4, x * 9 + Math.sin(TAU * (t / 7) + x * 3) * 0.6 + t * 0.25)) ** 1.5;
      const falloff = strip ? 1 : 0.35 + 0.65 * y;
      const f = strip ? 0.5 + 0.5 * Math.sin(TAU * (x * 0.7 - t / 19)) : 1 - y;
      addMix(B, k, P, 0, 4, f, (0.12 + 0.88 * band) * falloff);
    }
  },
  // --- Théâtre ---------------------------------------------------------------
  // Une LED sur trois, qui avance ; une sur deux de ces lumières dans la seconde couleur.
  'theater-chase': ({ B, g, P, t }) => {
    const shift = t * 6 + 0.5;
    for (let k = 0; k < g.n; k++) {
      const q = g.pos[k]! - shift;
      const m = Math.round(q / 3);
      const lv = clamp01(1 - Math.abs(q - 3 * m) * 1.4);
      add(B, k, P, 0, 0.1);
      if (lv > 0) add(B, k, P, mod(m, 2), lv);
    }
  },
  // Deux couleurs en alternance, qui avancent puis reculent.
  'theater-dual': ({ B, g, P, t }) => {
    const shift = 6 * Math.sin((TAU * t) / 14) + 0.5;
    for (let k = 0; k < g.n; k++) {
      const q = g.pos[k]! - shift;
      const m = Math.round(q / 2);
      const lv = clamp01(1 - Math.abs(q - 2 * m) * 1.6);
      add(B, k, P, 0, 0.08);
      if (lv > 0) add(B, k, P, mod(m, 2), lv);
    }
  },
  // Motif doux (un creux toutes les cinq LED) qui défile, couleurs de la palette en cycle.
  'theater-fade': ({ B, g, P, t }) => {
    for (let k = 0; k < g.n; k++) {
      const q = g.pos[k]! - t * 2;
      const c = 0.5 + 0.5 * Math.cos((TAU * q) / 5);
      cycle(P, q / 25, 5);
      addS(B, k, 0.15 + 0.85 * c * c);
    }
  },
  // --- Ponctuels -------------------------------------------------------------
  // Éclair : tout s'allume, blanchi, puis s'éteint dans la couleur dominante.
  flash: ({ B, g, P, e }) => {
    const env = (1 - e) ** 2.5;
    const w = 0.6 * (1 - e) ** 2;
    for (let k = 0; k < g.n; k++) addWhiteMix(B, k, P, 0, w, env * (1 - 0.2 * g.rad[k]!));
  },
  // Onde qui part du centre.
  'ripple-center': (c) => ripple(c, c.g.rad),
  // Onde qui part du bas (du début d'une bande).
  'ripple-end': (c) => ripple(c, c.g.up),
  // Montée : un faisceau qui accélère vers le haut, puis explose en gerbe.
  'rise-burst': ({ B, g, P, e, seed }) => {
    if (e < 0.45) {
      const L = Math.max(3, g.upLen * 0.25);
      const head = -1 + g.upLen * (e / 0.45) ** 1.5;
      for (let k = 0; k < g.n; k++) {
        const d = head - g.upPos[k]!;
        const lv = trail(d, L);
        if (lv > 0) addWhiteMix(B, k, P, 0, 0.5 * Math.max(0, 1 - Math.abs(d)), lv);
      }
      return;
    }
    const f = (e - 0.45) / 0.55;
    const step = Math.floor(f * 14);
    const glow = 0.7 * (1 - f) ** 3;
    for (let k = 0; k < g.n; k++) {
      const dist = 1 - g.up[k]!;
      addWhiteMix(B, k, P, 0, 0.3, glow);
      addWhiteMix(B, k, P, 1, 0.4, Math.exp(-(((dist - f * 1.2) / 0.1) ** 2)) * (1 - f));
      if (rnd(seed, k, step) < 0.2) addWhiteMix(B, k, P, Math.floor(rnd(seed, k + 99, step) * 5), 0.3, 0.9 * (1 - f));
    }
  },
  // Rideau qui s'ouvre depuis le milieu, ou se ferme depuis les bords, puis s'éteint.
  'curtain-open': (c) => curtain(c, true),
  'curtain-close': (c) => curtain(c, false),
  // Deux pulsations : la dominante, puis la seconde couleur.
  'pulse-double': ({ B, g, P, e }) => {
    const env = smooth(e / 0.06) * (Math.exp(-(((e - 0.18) / 0.1) ** 2)) + 0.85 * Math.exp(-(((e - 0.55) / 0.12) ** 2)));
    const f = smooth((e - 0.3) / 0.15);
    for (let k = 0; k < g.n; k++) addMix(B, k, P, 0, 1, f, env * (1 - 0.3 * g.rad[k]!));
  },
  // Pluie d'étincelles qui tombent du haut, chacune de sa couleur.
  'spark-rain': ({ B, g, P, e, seed }) => {
    const drops = g.strip ? 8 : 2;
    const tl = Math.max(2, g.upLen * 0.08);
    const glow = 0.25 * (1 - e) ** 2;
    for (let k = 0; k < g.n; k++) {
      const lane = g.lane[k]!;
      const u = g.upPos[k]!;
      add(B, k, P, 0, glow);
      for (let j = 0; j < drops; j++) {
        const p = (e - rnd(seed, lane, j) * 0.55) / (0.3 + 0.15 * rnd(seed, lane, j + 50));
        if (p < 0 || p > 1) continue;
        const head = g.upLen - p * (g.upLen + tl + 1);
        const lv = trail(u - head, tl);
        if (lv > 0) addWhiteMix(B, k, P, (lane * 3 + j) % 5, 0.35, lv * (1 - 0.4 * p));
      }
    }
  },
  // Stroboscope court : sept éclairs, un sur deux blanchi.
  strobe: ({ B, g, P, e }) => {
    const f = e * 7;
    const i = Math.floor(f);
    if (f - i >= 0.3) return;
    const lv = 1 - e * 0.6;
    for (let k = 0; k < g.n; k++) addWhiteMix(B, k, P, 0, i % 2 ? 0.7 : 0, lv);
  },
  // Un arc-en-ciel traverse la bande d'un bout à l'autre.
  'rainbow-sweep': ({ B, g, e }) => {
    const center = -0.35 + 1.7 * e;
    const fade = 1 - 0.3 * e;
    for (let k = 0; k < g.n; k++) {
      const x = (g.a[k]! - center) / 0.3;
      if (x <= -1 || x >= 1) continue;
      hsvS(180 * (x + 1) + 180 * e, 1, 1);
      addS(B, k, (0.5 + 0.5 * Math.cos(Math.PI * x)) * fade);
    }
  },
  // La lumière s'écoule vers le bas et disparaît (bille perdue).
  drain: ({ B, g, P, e }) => {
    const level = 1.02 - smooth(e) * 1.25;
    const lv = 0.55 + 0.45 * (1 - e);
    const span = Math.max(1, g.upLen - 1);
    for (let k = 0; k < g.n; k++) {
      const y = g.up[k]!;
      const d = (level - y) * span;
      addMix(B, k, P, 0, 1, y * 0.6, clamp01(d / 2 + 0.5) * lv);
      addWhite(B, k, Math.exp(-((d / 1.2) ** 2)) * 0.5 * (1 - e));
    }
  },
};

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/**
 * Dessine l'effet dans `B` (déjà à zéro, 3 réels par LED). Boucle : `ms` depuis son départ, multiplié par
 * `speed`. Ponctuel : rien avant 0 ni à partir de sa durée. Rend false si rien n'est dessiné.
 */
function drawFx(id: string, g: Geo, ms: number, P: Float32Array, seed: number, speed: number, durationMs: number | undefined, B: Float32Array): boolean {
  const info = INFO.get(id);
  if (!info || !g.n || !Number.isFinite(ms)) return false;
  ctx.B = B;
  ctx.g = g;
  ctx.P = P;
  ctx.seed = seed | 0;
  ctx.ns = ((seed | 0) & 0xffff) * 131;
  if (info.kind === 'loop') {
    ctx.t = (ms / 1000) * (Number.isFinite(speed) && speed > 0 ? speed : 1);
    ctx.e = 0;
  } else {
    const dur = durationMs !== undefined && durationMs > 0 ? durationMs : info.defaultMs!;
    const e = ms / dur;
    if (!(e >= 0 && e < 1)) return false;
    ctx.t = ms / 1000;
    ctx.e = e;
  }
  RENDER[info.id](ctx);
  return true;
}

/** Octets d'après la lumière (0 à 1 par canal) : gamma 2, plafonnés à la luminosité maximale. */
function toBytes(B: Float32Array, count: number, brightness: number, out: Uint8Array): void {
  const top = 255 * (Number.isFinite(brightness) ? clamp01(brightness) : 0);
  for (let i = 0; i < count; i++) {
    const v = B[i]!;
    const c = v > 0 ? (v < 1 ? v : 1) : 0;
    out[i] = Math.round(top * c * c);
  }
}

export interface LedFxRenderOptions {
  /** 1 à 5 couleurs (Rgb ou #rrggbb), ou une palette de `ledFxPalette` ; sans : la sarcelle de la marque. */
  palette?: readonly (Rgb | string)[];
  /** Luminosité maximale, 0 à 1 : aucun octet ne la dépasse. */
  brightness: number;
  /** Graine des positions et des rythmes tirés au hasard (même graine : même image). */
  seed?: number;
  /** Vitesse des boucles (1 : normale). */
  speed?: number;
  /** Durée d'un ponctuel, en ms (sinon `defaultMs`). */
  durationMs?: number;
}

let scratch = new Float32Array(0);
let paletteKey = '';
let paletteCache = paletteF32(ledFxPalette(undefined));

function paletteOf(colors: readonly (Rgb | string)[] | undefined): Float32Array {
  const key = colors ? colors.join('|') : '';
  if (key !== paletteKey) {
    paletteCache = paletteF32(ledFxPalette(colors));
    paletteKey = key;
  }
  return paletteCache;
}

/** Image de l'effet `id` à l'instant `ms` : 3 octets RVB par LED (`out` réutilisé s'il a la bonne taille). */
export function renderLedFx(id: LedFxId, grid: LedGrid, ms: number, opts: LedFxRenderOptions, out?: Uint8Array): Uint8Array {
  const g = geometry(grid);
  const count = g.n * 3;
  const target = out && out.length === count ? out : new Uint8Array(count);
  if (scratch.length < count) scratch = new Float32Array(count);
  scratch.fill(0, 0, count);
  drawFx(id, g, ms, paletteOf(opts.palette), opts.seed ?? 0, opts.speed ?? 1, opts.durationMs, scratch);
  toBytes(scratch, count, opts.brightness, target);
  return target;
}

// ---------------------------------------------------------------------------
// Séquenceur
// ---------------------------------------------------------------------------

export interface LedFxSequencerOptions {
  /** 1 à 5 couleurs : voir `ledFxPalette`. */
  colors?: readonly (Rgb | string)[];
  /** Luminosité maximale, 0 à 1 (0,4 par défaut) : rien ne la dépasse, effets posés compris. */
  brightness?: number;
  /** Part de la luminosité laissée aux boucles (LED_AMBIENT_CEILING par défaut) : le reste est pour les effets posés. */
  ambientLevel?: number;
  /** Graine du tirage (1 par défaut) : même graine, même suite d'effets. */
  seed?: number;
  /** Familles d'effets en boucle permises (toutes par défaut). */
  families?: readonly LedFxFamily[];
  /** Intensité permise : 'calm', 'lively' ou 'all' (par défaut). */
  mood?: LedFxMood | 'all';
  /** Durée de chaque effet, tirée entre ces deux bornes (20 à 40 s par défaut). */
  minMs?: number;
  maxMs?: number;
  /** Fondu enchaîné entre deux effets (3 s par défaut). */
  fadeMs?: number;
  /** Fondu d'une palette à l'autre (0,9 s par défaut). */
  paletteFadeMs?: number;
  /** Nombre de dernières variantes évitées au tirage (3 par défaut). */
  avoidRecent?: number;
  /** Vitesse des boucles (1 : normale). */
  speed?: number;
}

export interface LedFxTriggerOptions {
  /** Durée en ms (sinon `defaultMs` ; 4 s pour un effet en boucle posé par-dessus). */
  durationMs?: number;
  /** Couleurs propres à cet effet (sinon la palette du moment). */
  colors?: readonly (Rgb | string)[];
  /** Intensité, 0 à 1 (1 par défaut). */
  level?: number;
  seed?: number;
}

interface Slot {
  id: LedFxId;
  start: number;
  end: number;
  seed: number;
}

interface Shot {
  id: LedFxId;
  start: number;
  dur: number;
  loop: boolean;
  level: number;
  seed: number;
  P?: Float32Array;
}

interface SeqSettings {
  brightness: number;
  ambientLevel: number;
  families?: readonly LedFxFamily[];
  mood: LedFxMood | 'all';
  minMs: number;
  maxMs: number;
  fadeMs: number;
  paletteFadeMs: number;
  avoidRecent: number;
  speed: number;
}

const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

function seqSettings(o: LedFxSequencerOptions, base?: SeqSettings): SeqSettings {
  const fadeMs = num(o.fadeMs, base?.fadeMs ?? 3000, 0, 60_000);
  const minMs = num(o.minMs, base?.minMs ?? 20_000, Math.max(1000, fadeMs), 3_600_000);
  return {
    brightness: num(o.brightness, base?.brightness ?? 0.4, 0, 1),
    ambientLevel: num(o.ambientLevel, base?.ambientLevel ?? LED_AMBIENT_CEILING, 0, 1),
    families: o.families ?? base?.families,
    mood: o.mood === 'calm' || o.mood === 'lively' || o.mood === 'all' ? o.mood : (base?.mood ?? 'all'),
    minMs,
    maxMs: Math.max(minMs, num(o.maxMs, base?.maxMs ?? 40_000, 1000, 3_600_000)),
    fadeMs,
    paletteFadeMs: num(o.paletteFadeMs, base?.paletteFadeMs ?? 900, 0, 60_000),
    avoidRecent: Math.round(num(o.avoidRecent, base?.avoidRecent ?? 3, 0, 16)),
    speed: num(o.speed, base?.speed ?? 1, 0.05, 20),
  };
}

/** Générateur pseudo-aléatoire (mulberry32) : la suite ne dépend que de la graine. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOPS = LED_FX.filter((f) => f.kind === 'loop');

/**
 * Enchaîne les effets en boucle avec un fondu enchaîné, et pose les effets ponctuels par-dessus.
 * Toutes les méthodes prennent l'instant `now` (ms, horloge de l'appelant, croissante).
 */
export class LedFxSequencer {
  private s: SeqSettings;
  private readonly rng: () => number;
  private readonly seed: number;
  private cur!: Slot;
  private prev?: Slot;
  private fadeStart = -Infinity;
  private readonly recent: LedFxId[] = [];
  private palFrom: Float32Array;
  private palTo: Float32Array;
  private palStart = -Infinity;
  private readonly palNow = new Float32Array(15);
  private shots: Shot[] = [];
  private shotCount = 0;
  private acc = new Float32Array(0);
  private work = new Float32Array(0);

  constructor(options: LedFxSequencerOptions = {}, now = 0) {
    this.seed = Math.floor(num(options.seed, 1, -2147483648, 2147483647));
    this.rng = mulberry32(this.seed);
    this.s = seqSettings(options);
    this.palFrom = this.palTo = paletteF32(ledFxPalette(options.colors));
    this.next(now);
  }

  /** Effet en boucle montré (celui vers lequel va le fondu en cours). */
  get current(): LedFxId {
    return this.cur.id;
  }

  /** Change des réglages ; si l'effet montré n'est plus permis, passe au suivant. Les couleurs passent par un fondu. */
  configure(options: Partial<LedFxSequencerOptions>, now: number): void {
    this.s = seqSettings(options, this.s);
    if (options.colors) this.setPalette(options.colors, now);
    if (!this.pool().some((f) => f.id === this.cur.id)) this.next(now);
  }

  /** Passe à l'effet suivant (tiré au sort), par un fondu enchaîné ; rend son id. */
  next(now: number): LedFxId {
    const id = this.pick();
    if (this.cur) {
      // Fondu déjà en cours : on part de l'effet le plus visible des deux.
      const w = smooth((now - this.fadeStart) / Math.max(1, this.s.fadeMs));
      if (w >= 0.5 || !this.prev) this.prev = this.cur;
    }
    this.fadeStart = now;
    const span = this.s.maxMs - this.s.minMs;
    this.cur = { id, start: now, end: now + this.s.minMs + this.rng() * span, seed: Math.floor(this.rng() * 0x3fffffff) };
    this.recent.push(id);
    if (this.recent.length > 32) this.recent.shift();
    return id;
  }

  /** Nouvelles couleurs : fondu depuis la palette montrée (`instant` : sans fondu). */
  setPalette(colors: readonly (Rgb | string)[] | undefined, now: number, instant = false): void {
    const target = paletteF32(ledFxPalette(colors));
    if (target.every((v, i) => v === this.palTo[i])) return;
    this.palFrom = this.palette(now).slice();
    this.palTo = target;
    this.palStart = instant ? -Infinity : now;
  }

  /**
   * Pose un effet par-dessus l'ambiance : un ponctuel joue sa durée puis disparaît ; un effet en boucle
   * apparaît et s'efface en douceur au bout de `durationMs` (4 s par défaut). Rend false pour un id inconnu.
   */
  trigger(id: LedFxId, now: number, opts: LedFxTriggerOptions = {}): boolean {
    const info = INFO.get(id);
    if (!info) return false;
    const loop = info.kind === 'loop';
    const dur = opts.durationMs !== undefined && opts.durationMs > 0 ? opts.durationMs : loop ? 4000 : info.defaultMs!;
    this.shotCount++;
    this.shots.push({
      id: info.id,
      start: now,
      dur,
      loop,
      level: num(opts.level, 1, 0, 1),
      seed: opts.seed ?? Math.floor(rnd(this.seed, this.shotCount, 17) * 0x3fffffff),
      P: opts.colors ? paletteF32(ledFxPalette(opts.colors)) : undefined,
    });
    if (this.shots.length > 6) this.shots.shift();
    return true;
  }

  /** Image à l'instant `now` : 3 octets RVB par LED, jamais au-delà de la luminosité réglée. */
  render(grid: LedGrid, now: number, out?: Uint8Array): Uint8Array {
    const g = geometry(grid);
    const count = g.n * 3;
    const target = out && out.length === count ? out : new Uint8Array(count);
    if (now >= this.cur.end) this.next(now);
    if (this.acc.length < count) {
      this.acc = new Float32Array(count);
      this.work = new Float32Array(count);
    }
    this.acc.fill(0, 0, count);
    const P = this.palette(now);
    const amb = this.s.ambientLevel;
    const w = this.s.fadeMs > 0 ? smooth((now - this.fadeStart) / this.s.fadeMs) : 1;
    if (w < 1 && this.prev) this.layer(this.prev.id, g, now - this.prev.start, P, this.prev.seed, undefined, amb * (1 - w), count);
    this.layer(this.cur.id, g, now - this.cur.start, P, this.cur.seed, undefined, amb * w, count);
    if (this.shots.length) {
      this.shots = this.shots.filter((x) => now - x.start < x.dur);
      for (const x of this.shots) {
        const ms = now - x.start;
        const env = x.loop ? smooth(ms / 250) * smooth((x.dur - ms) / 400) : 1;
        this.layer(x.id, g, ms, x.P ?? P, x.seed, x.dur, x.level * env, count);
      }
    }
    toBytes(this.acc, count, this.s.brightness, target);
    return target;
  }

  /** Palette montrée à l'instant `now` (fondu compris), dans un tampon réutilisé. */
  private palette(now: number): Float32Array {
    const f = this.s.paletteFadeMs > 0 ? smooth((now - this.palStart) / this.s.paletteFadeMs) : 1;
    for (let i = 0; i < 15; i++) this.palNow[i] = this.palFrom[i]! + (this.palTo[i]! - this.palFrom[i]!) * f;
    return this.palNow;
  }

  private layer(id: LedFxId, g: Geo, ms: number, P: Float32Array, seed: number, durationMs: number | undefined, weight: number, count: number): void {
    if (weight <= 0) return;
    const work = this.work;
    work.fill(0, 0, count);
    if (!drawFx(id, g, ms, P, seed, this.s.speed, durationMs, work)) return;
    // Chaque couche plafonnée à 1 avant sa part : l'ambiance ne déborde jamais sur la marge des effets posés.
    const acc = this.acc;
    for (let i = 0; i < count; i++) {
      const v = work[i]!;
      acc[i]! += (v < 1 ? v : 1) * weight;
    }
  }

  /** Effets en boucle permis ; un filtre qui ne laisse rien retombe sur les familles seules, puis sur tout. */
  private pool(): readonly LedFxInfo[] {
    const fam = this.s.families;
    const byFamily = fam?.length ? LOOPS.filter((f) => fam.includes(f.family)) : LOOPS;
    const byMood = this.s.mood === 'all' ? byFamily : byFamily.filter((f) => f.mood === this.s.mood);
    return byMood.length ? byMood : byFamily.length ? byFamily : LOOPS;
  }

  /** Une famille au hasard (jamais celle de l'effet montré, s'il y en a d'autres), puis une variante récente évitée. */
  private pick(): LedFxId {
    const pool = this.pool();
    const curId = this.cur?.id;
    const curFamily = curId ? INFO.get(curId)?.family : undefined;
    const families = [...new Set(pool.map((f) => f.family))];
    const choices = families.length > 1 ? families.filter((f) => f !== curFamily) : families;
    const family = choices[Math.floor(this.rng() * choices.length)]!;
    const variants = pool.filter((f) => f.family === family);
    const avoid = this.s.avoidRecent > 0 ? this.recent.slice(-this.s.avoidRecent) : [];
    const fresh = variants.filter((f) => f.id !== curId && !avoid.includes(f.id));
    if (fresh.length) return fresh[Math.floor(this.rng() * fresh.length)]!.id;
    // Toutes récentes : la moins récente (l'effet montré seulement s'il est seul).
    let best = variants[0]!;
    let bestAt = Infinity;
    for (const f of variants) {
      if (f.id === curId && variants.length > 1) continue;
      const at = this.recent.lastIndexOf(f.id);
      if (at < bestAt) {
        best = f;
        bestAt = at;
      }
    }
    return best.id;
  }
}
