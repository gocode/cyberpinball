// Couleur de chaque table au menu (demande du 06/11/2026) : une teinte dominante tirée des médias
// de la table, le fronton d'abord (l'image allumée du .directb2s comprise), sinon le logo, sinon
// le plateau. Elle habille l'ambiance du menu (halo derrière la roue, filets des cadres, fond des
// replis) et, sur demande, les points du DMD du menu ; jamais la sélection : le vert signal reste
// le seul repère du choix courant et de l'action principale (docs/design-system, « une seule
// chose allumée »).
//
// Calcul une fois par fichier de média (chemin, taille, date), gardé dans
// <données>\cache\teintes-tables.json ; un média remplacé est relu. Les pixels viennent du
// convertisseur hors écran (app/src/media-convert.ts, mediaFrames), réduits à quelques dizaines
// de points de large : quelques millisecondes de calcul, jamais pendant le défilement (le
// processus principal attend que la table choisie reste en place, app/src/table-tint.ts).
//
// Mesure et corrections dans l'espace OKLCH (clarté perçue, chroma, teinte) :
//   - les pixels presque noirs, presque blancs ou gris ne votent pas ; les autres votent pour
//     leur teinte, pesés par leur chroma ; la teinte retenue est la moyenne autour du pic ;
//   - trop peu de couleur (une image en noir et blanc, un fronton sombre) : pas de teinte, le
//     menu garde la sarcelle de la marque ;
//   - clarté imposée (celle de la sarcelle de la marque) et chroma bornée : un fronton très sombre
//     ou très terne donne une lueur aussi visible que les autres, jamais criarde ;
//   - trop proche du vert signal : la teinte est écartée de lui, ou abandonnée au profit de la
//     sarcelle si elle tombe dessus (on ne saurait pas de quel côté la pousser).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { saveOrWarn, writeFileAtomic } from './atomicwrite';
import { dmdColorReadable } from './dmdcolor';
import type { RgbaImage } from './png';

/** Sarcelle de la marque (filets, verre fumé : --cp-primary des replis) : la teinte quand la table n'en a pas. */
export const NEUTRAL_TINT = '#36c9b4';

/** Couleur de l'interface d'où l'ambiance doit rester distincte. */
export const SIGNAL_COLOR = '#8be23a';

/** Clarté OKLCH de la teinte d'ambiance : celle de la sarcelle de la marque. */
export const TINT_LIGHTNESS = 0.75;
/** Chroma OKLCH de la teinte d'ambiance : assez pour se distinguer de la sarcelle, jamais criarde. */
export const TINT_CHROMA_MIN = 0.09;
export const TINT_CHROMA_MAX = 0.15;
/** Clarté et chroma des points du DMD quand il prend la couleur de la table. */
export const TINT_DMD_LIGHTNESS = 0.8;
export const TINT_DMD_CHROMA_MIN = 0.12;
export const TINT_DMD_CHROMA_MAX = 0.2;

/** Écart de teinte (degrés OKLCH) en deçà duquel une teinte passerait pour le vert signal. */
export const SIGNAL_DISTANCE = 35;
/** En deçà, la teinte est sur le vert signal même : abandonnée (on ne sait de quel côté l'écarter). */
export const SIGNAL_REJECT = 8;

/** Pixels qui votent : ni presque noirs, ni presque blancs, ni gris. */
const MIN_L = 0.2;
const MAX_L = 0.97;
const MIN_PIXEL_CHROMA = 0.045;
/** Part minimale de pixels colorés parmi les pixels visibles, et chroma moyenne minimale. */
export const MIN_COLOR_SHARE = 0.08;
export const MIN_MEAN_CHROMA = 0.06;
/** Largeur des cases de l'histogramme des teintes, et demi-largeur de la moyenne autour du pic. */
const BIN_DEGREES = 10;
const PEAK_HALF_WIDTH = 25;

/** Une teinte mesurée dans des images, avant correction. */
export interface TintMeasure {
  /** Teinte OKLCH, en degrés (0 à 360). */
  hue: number;
  /** Chroma moyenne des pixels autour du pic. */
  chroma: number;
  /** Part des pixels visibles qui ont voté (assez de couleur). */
  share: number;
  /** Part du poids coloré que porte le pic retenu (0 à 1) : faible, l'image est bigarrée. */
  dominance: number;
}

/** Pourquoi une image ne donne pas de teinte. */
export type TintRefusal = 'vide' | 'terne' | 'signal';

/** Teinte d'une table, prête pour le menu. */
export interface TableTint {
  /** Couleur d'ambiance (#rrggbb) : halo derrière la roue, filets, fond des replis. */
  color: string;
  /** Couleur des points du DMD du menu, si l'on a choisi « Couleur de la table » (#rrggbb). */
  dmd: string;
  /** Teinte OKLCH retenue, après correction (degrés). */
  hue: number;
  /** Teinte mesurée avant correction : différente quand elle a été écartée du vert signal. */
  measured: number;
}

// ---------------------------------------------------------------------------
// Espace de couleur OKLab / OKLCH (Björn Ottosson, 2020)

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0 à 255) → OKLab. */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r / 255);
  const G = toLinear(g / 255);
  const B = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab → sRGB linéaire (hors gamut possible : composantes hors de 0 à 1). */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** sRGB (0 à 255) → OKLCH [clarté, chroma, teinte en degrés]. */
export function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const [L, a, bb] = rgbToOklab(r, g, b);
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return [L, Math.hypot(a, bb), h < 0 ? h + 360 : h];
}

/** « #rrggbb » → [r, g, b] (0 à 255). */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** OKLCH → « #rrggbb », la chroma réduite jusqu'à tenir dans sRGB (même clarté, même teinte). */
export function oklchToHex(L: number, C: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const inGamut = (c: number) => oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad)).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
  let c = C;
  if (!inGamut(c)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const rgb = oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad)).map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Écart entre deux teintes, en degrés (0 à 180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Teinte OKLCH du vert signal. */
export const SIGNAL_HUE = rgbToOklch(...hexToRgb(SIGNAL_COLOR))[2];

// ---------------------------------------------------------------------------
// Mesure

/**
 * Teinte dominante de quelques images (une image, ou quelques moments d'une vidéo), ou la raison
 * de n'en voir aucune. Les pixels transparents (un logo détouré) ne comptent pas.
 */
export function measureTint(images: readonly RgbaImage[]): TintMeasure | TintRefusal {
  const bins = new Float64Array(360 / BIN_DEGREES);
  const voters: { h: number; c: number; w: number }[] = [];
  let visible = 0;
  for (const img of images) {
    const d = img.data;
    for (let i = 0; i + 3 < d.length; i += 4) {
      if (d[i + 3]! < 128) continue;
      visible++;
      const [L, C, h] = rgbToOklch(d[i]!, d[i + 1]!, d[i + 2]!);
      if (L < MIN_L || L > MAX_L || C < MIN_PIXEL_CHROMA) continue;
      // Une couleur franche pèse plus qu'une couleur passée ; un ton moyen plus qu'un ton extrême.
      const w = C * (1 - Math.abs(L - 0.62));
      voters.push({ h, c: C, w });
      bins[Math.floor(h / BIN_DEGREES) % bins.length]! += w;
    }
  }
  if (!visible) return 'vide';
  const share = voters.length / visible;
  if (share < MIN_COLOR_SHARE) return 'terne';
  // Pic de l'histogramme lissé (chaque case avec ses deux voisines, en boucle).
  const n = bins.length;
  let peak = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    const v = bins[(i + n - 1) % n]! + 2 * bins[i]! + bins[(i + 1) % n]!;
    if (v > best) {
      best = v;
      peak = i;
    }
  }
  const center = (peak + 0.5) * BIN_DEGREES;
  // Moyenne circulaire des teintes autour du pic, pesée ; chroma moyenne des mêmes pixels.
  let x = 0;
  let y = 0;
  let weight = 0;
  let chroma = 0;
  let total = 0;
  for (const v of voters) {
    total += v.w;
    if (hueDistance(v.h, center) > PEAK_HALF_WIDTH) continue;
    const rad = (v.h * Math.PI) / 180;
    x += v.w * Math.cos(rad);
    y += v.w * Math.sin(rad);
    weight += v.w;
    chroma += v.w * v.c;
  }
  if (!weight) return 'terne';
  const mean = (Math.atan2(y, x) * 180) / Math.PI;
  const measure: TintMeasure = { hue: mean < 0 ? mean + 360 : mean, chroma: chroma / weight, share, dominance: weight / total };
  return measure.chroma < MIN_MEAN_CHROMA ? 'terne' : measure;
}

// ---------------------------------------------------------------------------
// Corrections

/** Teinte écartée du vert signal, ou 'signal' si elle tombe dessus. */
export function awayFromSignal(hue: number): number | 'signal' {
  const d = hueDistance(hue, SIGNAL_HUE);
  if (d < SIGNAL_REJECT) return 'signal';
  if (d >= SIGNAL_DISTANCE) return hue;
  // Du côté où elle était, à la distance minimale.
  const side = ((hue - SIGNAL_HUE + 540) % 360) - 180 >= 0 ? 1 : -1;
  return (SIGNAL_HUE + side * SIGNAL_DISTANCE + 360) % 360;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Teinte mesurée → couleurs du menu (ambiance et DMD), ou 'signal' si elle est écartée. */
export function correctTint(measure: TintMeasure): TableTint | 'signal' {
  const hue = awayFromSignal(measure.hue);
  if (hue === 'signal') return 'signal';
  const color = oklchToHex(TINT_LIGHTNESS, clamp(measure.chroma, TINT_CHROMA_MIN, TINT_CHROMA_MAX), hue);
  let dmd = oklchToHex(TINT_DMD_LIGHTNESS, clamp(measure.chroma * 1.3, TINT_DMD_CHROMA_MIN, TINT_DMD_CHROMA_MAX), hue);
  // Garde-fou : la clarté imposée suffit toujours ; une couleur illisible prendrait celle d'ambiance.
  if (!dmdColorReadable(dmd)) dmd = color;
  return { color, dmd, hue: Math.round(hue * 10) / 10, measured: Math.round(measure.hue * 10) / 10 };
}

/** Teinte de la table d'après les images d'un média, ou la raison de n'en donner aucune. */
export function tableTint(images: readonly RgbaImage[]): TableTint | TintRefusal {
  const measure = measureTint(images);
  return typeof measure === 'string' ? measure : correctTint(measure);
}

// ---------------------------------------------------------------------------
// Lisibilité : la teinte n'éclaire que l'ambiance, sous les voiles ; le texte reste lisible.

/** Luminance relative WCAG d'une couleur sRGB (0 à 255). */
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((c) => toLinear(c / 255));
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
}

/** Rapport de contraste WCAG entre deux couleurs. */
export function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (la! + 0.05) / (lb! + 0.05);
}

/** `top` posé à `alpha` sur `under` (composition « normale », sRGB). */
export function blend(top: readonly [number, number, number], alpha: number, under: readonly [number, number, number]): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(top[i]! * alpha + under[i]! * (1 - alpha))) as [number, number, number];
}

/**
 * Opacité la plus forte de la teinte sous un texte du menu (lueur derrière la roue, filets) : le
 * design system la tient ici, et le test vérifie que l'encre reste lisible dessus, quelle que soit
 * la teinte (app/renderer/frontend.css, --table-tint).
 */
export const TINT_MAX_ALPHA_UNDER_TEXT = 0.25;

// ---------------------------------------------------------------------------
// Cache sur disque : une mesure par fichier de média

/** Change quand la mesure ou les corrections changent : les teintes plus anciennes sont refaites. */
export const TINT_CACHE_VERSION = 1;

/** <données>\cache\teintes-tables.json */
export function tintCacheFile(dataDir: string): string {
  return path.join(dataDir, 'cache', 'teintes-tables.json');
}

/** Ce que le cache garde d'un média : sa teinte, ou la raison de n'en avoir aucune. */
export type TintRecord = { tint: TableTint } | { refused: TintRefusal };

interface TintCacheFile {
  version: number;
  entries: Record<string, TintRecord>;
}

/** Clé d'un média : chemin, taille et date ; un média remplacé est relu. */
export function tintCacheKey(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return crypto.createHash('sha1').update(`${path.resolve(file).toLowerCase()}|${stat.size}|${Math.round(stat.mtimeMs)}`).digest('hex').slice(0, 20);
  } catch {
    return undefined;
  }
}

function readTintCache(cacheFile: string): TintCacheFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as TintCacheFile;
    if (parsed?.version === TINT_CACHE_VERSION && parsed.entries && typeof parsed.entries === 'object') return parsed;
  } catch {
    // Absent, abîmé, ou d'une autre version : les teintes seront refaites.
  }
  return { version: TINT_CACHE_VERSION, entries: {} };
}

/** Mesure déjà faite pour ce média ; undefined s'il n'a jamais été lu (ou a changé depuis). */
export function cachedTint(cacheFile: string, media: string): TintRecord | undefined {
  const key = tintCacheKey(media);
  return key ? readTintCache(cacheFile).entries[key] : undefined;
}

/** Garde la mesure d'un média (écriture atomique ; un refus d'écrire est noté, jamais levé). */
export function storeTint(cacheFile: string, media: string, record: TintRecord): void {
  const key = tintCacheKey(media);
  if (!key) return;
  const cache = readTintCache(cacheFile);
  cache.entries[key] = record;
  saveOrWarn(cacheFile, () => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileAtomic(cacheFile, JSON.stringify(cache, null, 1) + '\n');
  });
}
