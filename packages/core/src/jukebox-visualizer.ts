// Visualiseur du DMD pendant le Juke-box, quand aucun habillage n'est choisi : le spectre de
// jukebox-screens.ts (24 colonnes de 3 points), en couleurs. Trois modes, réglage « Visualiseur
// du Juke-box » (Menu système > Médias) :
//   - Pochette (défaut) : deux ou trois couleurs tirées de la pochette du morceau en cours, en
//     dégradé du pied au sommet des colonnes ; sans pochette (ou une pochette sans couleur), le
//     mode Multicolore ;
//   - Multicolore : des teintes qui tournent doucement dans le temps et d'une colonne à l'autre ;
//   - Classique : la couleur réglée du DMD (vert signal par défaut), comme avant le 10/11/2026.
// Dans les trois, de la profondeur : une crête par colonne qui tient un instant puis retombe, une
// traînée sombre là où la colonne vient de redescendre, et un reflet atténué sous la base.
//
// Tout se calcule ici, sans navigateur ni hasard : la couleur d'un point (RGB au plein éclat) est
// multipliée par sa nuance (0 à 15) dans la fenêtre du DMD (fallback.js, CyberFallback.dotMatrix).

import { DMD_FONT_SMALL, dmdText, textWidth } from './dmdfont';
import { t } from './i18n';
import { DMD_HEIGHT, DMD_MARGIN, DMD_USABLE, DMD_WIDTH, blankDots, drawText, type DmdColors, type DmdDots } from './livedmd';

export type JukeboxVisualizerMode = 'pochette' | 'multicolore' | 'classique';
export const JUKEBOX_VISUALIZER_MODES: readonly JukeboxVisualizerMode[] = ['pochette', 'multicolore', 'classique'];
export const DEFAULT_JUKEBOX_VISUALIZER: JukeboxVisualizerMode = 'pochette';

export const isVisualizerMode = (v: unknown): v is JukeboxVisualizerMode => JUKEBOX_VISUALIZER_MODES.includes(v as JukeboxVisualizerMode);

export function visualizerModeLabel(mode: JukeboxVisualizerMode): string {
  switch (mode) {
    case 'pochette':
      return t('Pochette');
    case 'multicolore':
      return t('Multicolore');
    default:
      return t('Classique');
  }
}

export type Rgb = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Couleurs

/** Teinte (0 à 360), saturation et valeur (0 à 1) d'une couleur RGB (0 à 255). */
export function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const mix = (a: Rgb, b: Rgb, k: number): [number, number, number] => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];

/** Écart de teinte sur le cercle, en degrés (0 à 180). */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Couleur rendue vive pour un afficheur à points sur du noir : au plein éclat (la nuance du point
 * fait la lumière), assez saturée pour ne pas tourner au gris, jamais tout à fait blanche. Une
 * pochette terne ou sombre donne ainsi des points francs ; sa teinte est gardée.
 */
export function vividColor(c: Rgb, minSaturation = 0.55): [number, number, number] {
  const [h, s] = rgbToHsv(c);
  return hsvToRgb(h, Math.min(0.92, Math.max(minSaturation, s)), 1);
}

/** Pixel d'une image : rangé RGBA (canvas) ou BGRA (nativeImage.toBitmap d'Electron, sous Windows). */
export type PixelOrder = 'rgba' | 'bgra';

/** Cases de teinte de l'histogramme (15° chacune). */
const HUE_BINS = 24;

/**
 * Palette d'une pochette : trois couleurs vives (pied, milieu, sommet des colonnes), la dominante
 * d'abord. Les pixels comptent d'autant plus qu'ils sont saturés et lumineux ; les gris, les noirs
 * et les blancs ne votent pas. Une seconde teinte est cherchée à au moins 40° de la première, une
 * troisième à 40° des deux ; faute de mieux, la dominante se décline en voisines (± 28°). Rien
 * (undefined) quand la pochette n'a pas de couleur : le visualiseur passe en Multicolore.
 */
export function coverPalette(pixels: ArrayLike<number>, order: PixelOrder = 'rgba'): Rgb[] | undefined {
  const weight = new Float64Array(HUE_BINS);
  const sum = Array.from({ length: HUE_BINS }, () => [0, 0, 0]);
  const [ri, bi] = order === 'rgba' ? [0, 2] : [2, 0];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 255) < 128) continue;
    const c: Rgb = [pixels[i + ri]!, pixels[i + 1]!, pixels[i + bi]!];
    const [h, s, v] = rgbToHsv(c);
    if (s < 0.2 || v < 0.16) continue;
    const w = s * s * v;
    const bin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
    weight[bin]! += w;
    const acc = sum[bin]!;
    acc[0]! += c[0] * w;
    acc[1]! += c[1] * w;
    acc[2]! += c[2] * w;
  }
  // Une case et ses deux voisines : une teinte à cheval sur deux cases n'est pas coupée en deux.
  const smooth = Array.from({ length: HUE_BINS }, (_, b) => weight[(b + HUE_BINS - 1) % HUE_BINS]! * 0.5 + weight[b]! + weight[(b + 1) % HUE_BINS]! * 0.5);
  const total = weight.reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  const colorOf = (b: number): Rgb => {
    const acc = [0, 0, 0];
    let w = 0;
    for (const k of [(b + HUE_BINS - 1) % HUE_BINS, b, (b + 1) % HUE_BINS]) {
      w += weight[k]!;
      acc[0]! += sum[k]![0]!;
      acc[1]! += sum[k]![1]!;
      acc[2]! += sum[k]![2]!;
    }
    return [acc[0]! / w, acc[1]! / w, acc[2]! / w];
  };
  const hueOf = (b: number) => (b + 0.5) * (360 / HUE_BINS);
  const picked: number[] = [];
  // Une teinte retenue pèse au moins 6 % de la couleur de la pochette (sinon un détail l'emporterait).
  const floor = total * 0.06;
  for (let n = 0; n < 3; n++) {
    let best = -1;
    for (let b = 0; b < HUE_BINS; b++) {
      if (!weight[b] || smooth[b]! < (n ? floor : 0)) continue;
      if (picked.some((p) => hueGap(hueOf(p), hueOf(b)) < 40)) continue;
      if (best < 0 || smooth[b]! > smooth[best]!) best = b;
    }
    if (best < 0) break;
    picked.push(best);
  }
  const colors = picked.map((b) => vividColor(colorOf(b)));
  const [h0] = rgbToHsv(colors[0]!);
  // Pochette d'une seule teinte : ses voisines, pour que le dégradé reste un dégradé.
  if (colors.length === 1) colors.push(hsvToRgb(h0 - 28, 0.7, 1), hsvToRgb(h0 + 28, 0.62, 1));
  else if (colors.length === 2) colors.push(hsvToRgb((rgbToHsv(colors[1]!)[0] + h0) / 2 + (hueGap(h0, rgbToHsv(colors[1]!)[0]) > 120 ? 180 : 0), 0.6, 1));
  // Pied : la dominante ; sommet : la plus claire des deux autres (le haut des colonnes s'allume).
  const a = colors[1]!;
  const b = colors[2]!;
  const light = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return light(a) >= light(b) ? [colors[0]!, b, a] : [colors[0]!, a, b];
}

/** Palette du mode Multicolore à l'instant `elapsed` : des teintes qui tournent (un tour en 24 s). */
export function rainbowHue(elapsed: number, band: number, row: number): number {
  return (elapsed / 1000) * 15 + band * 9 + row * 4;
}

// ---------------------------------------------------------------------------
// Spectre en couleurs

/** Bandes, comme jukeboxSpectrumDots : 24 colonnes de 3 points, un pas de 5, à partir de x = 5. */
const BANDS = 24;
const BAND_X = 5;
const BAND_STEP = 5;
const BAND_W = 3;
/** Pied des colonnes (ligne 28) : deux lignes de reflet dessous, dans les 32 de l'afficheur. */
const BASE = DMD_HEIGHT - 4;
const HEIGHT = 17;
/** Crête : tenue avant de retomber, puis chute en points par seconde. */
export const VISUALIZER_PEAK_HOLD_MS = 320;
const PEAK_FALL = 14;
/** Traînée : hauteur qui suit la colonne en redescendant, en points par seconde. */
const TRAIL_FALL = 26;
/**
 * Lissage des niveaux (constantes de temps, ms) : la colonne monte presque aussitôt et redescend en
 * douceur ; les niveaux mesurés arrivent une quinzaine de fois par seconde, le DMD en dessine 25.
 */
const ATTACK_MS = 45;
const RELEASE_MS = 180;

export interface VisualizerInput {
  artist?: string;
  title?: string;
  /** Niveaux, 0 à 1, une valeur par bande. */
  levels: readonly number[];
  /** Temps depuis le début de l'animation, en ms. */
  elapsed: number;
  mode: JukeboxVisualizerMode;
  /** Couleurs de la pochette du morceau en cours (coverPalette). */
  palette?: readonly Rgb[];
  /** Couleur réglée du DMD (Classique), « #rrggbb ». */
  color: string;
}

export interface VisualizerFrame {
  dots: DmdDots;
  /** Couleur de chaque point ; absente en Classique (la couleur réglée du DMD). */
  rgb?: DmdColors;
  /** Mode réellement dessiné (Pochette sans pochette : Multicolore). */
  mode: JukeboxVisualizerMode;
}

export interface JukeboxVisualizer {
  frame(input: VisualizerInput): VisualizerFrame;
}

const hexRgb = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x8be23a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Le visualiseur : garde d'une image à l'autre la crête et la traînée de chaque colonne. Une image
 * par appel ; le temps vient de `elapsed`, jamais de l'horloge.
 */
export function createJukeboxVisualizer(): JukeboxVisualizer {
  const peak = new Float64Array(BANDS);
  const peakAt = new Float64Array(BANDS);
  const trail = new Float64Array(BANDS);
  const smooth = new Float64Array(BANDS);
  let last: number | undefined;

  return {
    frame(input) {
      const first = last === undefined || input.elapsed < last;
      const dt = first ? 0 : Math.min(0.25, (input.elapsed - last!) / 1000);
      last = input.elapsed;
      const mode: JukeboxVisualizerMode = input.mode === 'pochette' && !input.palette?.length ? 'multicolore' : input.mode;
      const dots = blankDots();
      const rgb = mode === 'classique' ? undefined : new Uint8Array(DMD_WIDTH * DMD_HEIGHT * 3);
      const pal = (input.palette?.length ? input.palette : [hexRgb(input.color)]) as Rgb[];
      const set = (x: number, y: number, level: number, c: Rgb) => {
        if (x < 0 || x >= DMD_WIDTH || y < 0 || y >= DMD_HEIGHT) return;
        const i = y * DMD_WIDTH + x;
        if (level < dots[i]!) return;
        dots[i] = level;
        if (rgb) {
          rgb[i * 3] = c[0];
          rgb[i * 3 + 1] = c[1];
          rgb[i * 3 + 2] = c[2];
        }
      };
      /** Couleur d'un point d'une colonne, de son pied (k = 0) à son sommet possible (k = 1). */
      const colorAt = (band: number, k: number, row: number): Rgb => {
        if (mode === 'classique') return pal[0]!;
        if (mode === 'multicolore') return hsvToRgb(rainbowHue(input.elapsed, band, row), 0.72, 1);
        // Pochette : pied → milieu → sommet, légèrement décalé d'une colonne à l'autre (ondulation lente).
        const drift = 0.12 * Math.sin(input.elapsed / 1400 + band * 0.45);
        const u = Math.min(1, Math.max(0, k + drift));
        const [a, b, c] = [pal[0]!, pal[1] ?? pal[0]!, pal[2] ?? pal[1] ?? pal[0]!];
        return u < 0.5 ? mix(a, b, u * 2) : mix(b, c, (u - 0.5) * 2);
      };

      // Tête : l'artiste (sinon le titre), défilant s'il est plus large que l'afficheur.
      const text = dmdText(input.artist || input.title || 'JUKE-BOX');
      const width = textWidth(DMD_FONT_SMALL, text);
      const tx = width <= DMD_USABLE ? DMD_MARGIN + 2 : DMD_WIDTH - (Math.floor((input.elapsed / 1000) * 24) % (width + 40 + DMD_WIDTH));
      const head = blankDots();
      drawText(head, DMD_FONT_SMALL, text, tx, 3);
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < DMD_WIDTH; x++) {
          const v = head[y * DMD_WIDTH + x]!;
          if (!v) continue;
          // Pochette : le texte dans la couleur la plus claire ; Multicolore : un reflet qui le parcourt.
          const c = mode === 'multicolore' ? hsvToRgb(rainbowHue(input.elapsed, x / 4, 0), 0.45, 1) : mode === 'pochette' ? mix(pal[2] ?? pal[0]!, [255, 255, 255], 0.35) : pal[0]!;
          set(x, y, v, c);
        }
      }

      for (let b = 0; b < BANDS; b++) {
        const target = Math.min(1, Math.max(0, input.levels[b] ?? 0));
        if (first) smooth[b] = target;
        else smooth[b]! += (target - smooth[b]!) * (1 - Math.exp((-dt * 1000) / (target >= smooth[b]! ? ATTACK_MS : RELEASE_MS)));
        const h = Math.max(1, Math.round(smooth[b]! * HEIGHT));
        // Crête : monte avec la colonne, tient, puis retombe.
        if (h >= peak[b]!) {
          peak[b] = h;
          peakAt[b] = input.elapsed;
        } else if (input.elapsed - peakAt[b]! > VISUALIZER_PEAK_HOLD_MS) peak[b] = Math.max(h, peak[b]! - PEAK_FALL * dt);
        trail[b] = h >= trail[b]! ? h : Math.max(h, trail[b]! - TRAIL_FALL * dt);
        const x0 = BAND_X + b * BAND_STEP;
        for (let y = 0; y < HEIGHT; y++) {
          const k = y / HEIGHT;
          const c = colorAt(b, k, y);
          let level = 0;
          if (y < h) level = Math.round(6 + 9 * k);
          else if (y < Math.round(trail[b]!)) level = 3; // traînée : la colonne qui redescend
          if (!level) continue;
          for (let dx = 0; dx < BAND_W; dx++) set(x0 + dx, BASE - y, level, c);
        }
        // Crête : un trait d'un point au-dessus de la colonne, clair, quand elle est retombée.
        const p = Math.round(peak[b]!);
        if (p > h && p < HEIGHT + 1) {
          const c = mode === 'classique' ? pal[0]! : mix(colorAt(b, 1, p), [255, 255, 255], 0.25);
          for (let dx = 0; dx < BAND_W; dx++) set(x0 + dx, BASE - p, 13, c);
        }
        // Reflet : les deux lignes sous la base, faibles, de la couleur du pied.
        for (let r = 1; r <= 2; r++) {
          if (h < r * 2) continue;
          const c = colorAt(b, 0, 0);
          for (let dx = 0; dx < BAND_W; dx++) set(x0 + dx, BASE + r, r === 1 ? 4 : 2, c);
        }
      }
      return { dots, ...(rgb ? { rgb } : {}), mode };
    },
  };
}
