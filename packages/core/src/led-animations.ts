// Animations des LED hors partie : la partie pure (aucune entrée-sortie, l'horloge est donnée).
//
// Quand rien ne se passe, dans les écrans et dans la roue des tables, les bandes de LED adressables
// montrent une ambiance douce (respiration, dégradé lent, scintillement, vague, braises) aux couleurs
// de la table choisie ou à une couleur fixe. Chaque changement de table lance un balayage dans le
// sens du défilement, et l'ouverture de la fiche une pulsation. Ce module décrit :
// - les réglages (activer, style, luminosité maximale, vitesse, couleurs, extinction après inactivité),
//   leur lecture sûre et leur écriture (writeFileAtomic) ;
// - la palette tirée de la teinte de la table (tabletint.ts, déjà mesurée et gardée par table) ;
// - le moteur (`LedAmbientEngine`) : image d'une bande à un instant, fondu entre palettes, transitions.
// Le service des LED, les minuteries et le branchement au front-end sont dans app/src/led-animations.ts.
//
// Invariants (fixés par led-animations.test.ts) : aucune LED ne dépasse la luminosité maximale réglée ;
// l'ambiance seule reste sous 70 % de ce maximum, la marge est celle des transitions ; une image ne
// dépend que de l'instant donné (aucun hasard) ; tout réglage illisible retombe sur une valeur sûre.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t } from './i18n';
import { hsvToRgb, rgbToHsv, type Rgb } from './jukebox-visualizer';
import { ledXY, type LedGrid } from './led-live';
import { hexToRgb, NEUTRAL_TINT } from './tabletint';

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

export const LED_AMBIENT_STYLES = ['breath', 'drift', 'twinkle', 'wave', 'embers'] as const;
export type LedAmbientStyle = (typeof LED_AMBIENT_STYLES)[number];

export const LED_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type LedSpeed = (typeof LED_SPEEDS)[number];

/** Luminosité maximale proposée, en % de celle des bandes. */
export const LED_BRIGHTNESS_CHOICES: readonly number[] = [10, 20, 30, 40, 50, 60, 80, 100];
/** Extinction après inactivité, en minutes (0 : jamais). */
export const LED_IDLE_CHOICES: readonly number[] = [5, 15, 30, 60, 120, 0];

/** Couleurs fixes proposées (couleur unique quand on ne suit pas la table). */
export const LED_FIXED_COLORS = [
  { id: 'teal', hex: NEUTRAL_TINT },
  { id: 'blue', hex: '#2f6bff' },
  { id: 'violet', hex: '#8a3ffc' },
  { id: 'pink', hex: '#ff3d9a' },
  { id: 'red', hex: '#ff2a2a' },
  { id: 'orange', hex: '#ff7a1a' },
  { id: 'amber', hex: '#ffb000' },
  { id: 'green', hex: '#2bdc5a' },
  { id: 'white', hex: '#ffd9a0' },
] as const;
export type LedFixedColorId = (typeof LED_FIXED_COLORS)[number]['id'];

export interface LedAnimationSettings {
  /** Animations allumées (sans effet quand aucune bande n'est décrite). */
  enabled: boolean;
  style: LedAmbientStyle;
  /** Luminosité maximale, de 5 à 100 % : rien ne dépasse, transitions comprises. */
  brightness: number;
  speed: LedSpeed;
  /** Les couleurs viennent de la table choisie ; sinon `color`. */
  followTable: boolean;
  /** Couleur fixe (#rrggbb), et celle de repli quand la table n'a pas de teinte. */
  color: string;
  /** Minutes sans rien toucher avant d'éteindre ; 0 : jamais. */
  idleMinutes: number;
}

/** Valeurs sûres : allumées, douces (40 %), qui suivent la table, éteintes après 30 minutes. */
export const DEFAULT_LED_ANIMATIONS: Readonly<LedAnimationSettings> = {
  enabled: true,
  style: 'breath',
  brightness: 40,
  speed: 'normal',
  followTable: true,
  color: NEUTRAL_TINT,
  idleMinutes: 30,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Réglages d'après un fichier lu (n'importe quoi) : chaque valeur illisible reprend celle par défaut. */
export function normalizeLedAnimations(raw: unknown): LedAnimationSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LED_ANIMATIONS;
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback);
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    style: (LED_AMBIENT_STYLES as readonly unknown[]).includes(o.style) ? (o.style as LedAmbientStyle) : d.style,
    brightness: num(o.brightness, d.brightness, 5, 100),
    speed: (LED_SPEEDS as readonly unknown[]).includes(o.speed) ? (o.speed as LedSpeed) : d.speed,
    followTable: typeof o.followTable === 'boolean' ? o.followTable : d.followTable,
    color: typeof o.color === 'string' && HEX.test(o.color.trim()) ? o.color.trim().toLowerCase() : d.color,
    idleMinutes: num(o.idleMinutes, d.idleMinutes, 0, 24 * 60),
  };
}

export function ledAnimationsFile(dataDir: string): string {
  return path.join(dataDir, 'led-animations.json');
}

export function readLedAnimations(dataDir: string): LedAnimationSettings {
  try {
    return normalizeLedAnimations(JSON.parse(fs.readFileSync(ledAnimationsFile(dataDir), 'utf8')));
  } catch {
    return { ...DEFAULT_LED_ANIMATIONS };
  }
}

export function writeLedAnimations(dataDir: string, settings: LedAnimationSettings): void {
  writeFileAtomic(ledAnimationsFile(dataDir), JSON.stringify(normalizeLedAnimations(settings), null, 2) + '\n');
}

// Textes (tutoiement) des écrans de réglage.

export function ledStyleLabel(style: LedAmbientStyle): string {
  switch (style) {
    case 'breath':
      return t('Respiration');
    case 'drift':
      return t('Dégradé lent');
    case 'twinkle':
      return t('Scintillement');
    case 'wave':
      return t('Vague');
    case 'embers':
      return t('Braises');
  }
}

export function ledStyleDetail(style: LedAmbientStyle): string {
  switch (style) {
    case 'breath':
      return t('Les LED montent et descendent doucement, comme un souffle');
    case 'drift':
      return t('Un dégradé de couleurs qui glisse lentement le long des bandes');
    case 'twinkle':
      return t('Un fond sombre, de petites étincelles qui s’allument çà et là');
    case 'wave':
      return t('Une vague de lumière qui va et vient');
    case 'embers':
      return t('Un feu qui couve, chaud et irrégulier');
  }
}

export function ledSpeedLabel(speed: LedSpeed): string {
  return speed === 'slow' ? t('Lente') : speed === 'fast' ? t('Rapide') : t('Normale');
}

export function ledColorLabel(id: LedFixedColorId): string {
  switch (id) {
    case 'teal':
      return t('Sarcelle');
    case 'blue':
      return t('Bleu');
    case 'violet':
      return t('Violet');
    case 'pink':
      return t('Rose');
    case 'red':
      return t('Rouge');
    case 'orange':
      return t('Orange');
    case 'amber':
      return t('Ambre');
    case 'green':
      return t('Vert');
    case 'white':
      return t('Blanc chaud');
  }
}

/** Identité de la couleur fixe réglée (celle de la liste, sinon la plus proche n'existe pas : undefined). */
export function ledFixedColorId(hex: string): LedFixedColorId | undefined {
  return LED_FIXED_COLORS.find((c) => c.hex === hex.toLowerCase())?.id;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Trois couleurs vives, proches en teinte : la couleur de la table, sa voisine chaude, sa voisine froide. */
export interface LedPalette {
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
}

/**
 * Palette des LED d'après une couleur (#rrggbb ; undefined : la sarcelle de la marque). La teinte de la
 * table est un pastel pensé pour l'écran : sur une LED, il tirerait sur le blanc ; on garde sa teinte et
 * on la sature. Une couleur déjà presque blanche (blanc chaud) reste telle quelle.
 */
export function ledPalette(hex: string | undefined): LedPalette {
  const rgb = hexToRgb(hex && HEX.test(hex.trim()) ? hex.trim() : NEUTRAL_TINT);
  const [h, s] = rgbToHsv(rgb);
  const sat = s < 0.12 ? s : Math.max(s, 0.85);
  return {
    primary: hsvToRgb(h, sat, 1),
    secondary: hsvToRgb(h + 35, Math.min(1, sat * 0.95), 0.95),
    accent: hsvToRgb(h - 35, sat * 0.8, 1),
  };
}

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

/** Part de la luminosité maximale que l'ambiance seule ne dépasse pas : le reste est pour les transitions. */
export const LED_AMBIENT_CEILING = 0.7;
const FADE_MS = 900;
const SWEEP_MS = 800;
const ARRIVE_MS = 1200;
const SPEED_FACTOR: Record<LedSpeed, number> = { slow: 0.55, normal: 1, fast: 1.8 };

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
/** Lissage (smoothstep) : 0 sous 0, 1 au-delà de 1, une courbe en S entre les deux. Partagé avec led-effets.ts. */
export function ledSmooth(v: number): number {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
}
const smooth = ledSmooth;
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const mixRgb = (a: Rgb, b: Rgb, f: number): Rgb => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

/** Nombre pseudo-aléatoire stable dans [0, 1[ pour un entier : les étincelles ne dépendent que de l'instant. */
export function ledHash(n: number): number {
  let x = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Bruit doux : interpolation entre deux valeurs aléatoires voisines (0 à 1, continu en `x`). Partagé avec led-effets.ts. */
export function ledSoftNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  return lerp(ledHash(seed * 7919 + i), ledHash(seed * 7919 + i + 1), smooth(x - i));
}

/** Couleur d'un point d'un cycle primary → secondary → accent → primary (`f` modulo 1). */
function cycleColor(p: LedPalette, f: number): Rgb {
  const x = (((f % 1) + 1) % 1) * 3;
  const i = Math.floor(x);
  const part = smooth(x - i);
  return i === 0 ? mixRgb(p.primary, p.secondary, part) : i === 1 ? mixRgb(p.secondary, p.accent, part) : mixRgb(p.accent, p.primary, part);
}

const mixPalette = (a: LedPalette, b: LedPalette, f: number): LedPalette => ({
  primary: mixRgb(a.primary, b.primary, f),
  secondary: mixRgb(a.secondary, b.secondary, f),
  accent: mixRgb(a.accent, b.accent, f),
});

interface Transition {
  kind: 'sweep' | 'arrive';
  start: number;
  dir: 1 | -1;
}

export class LedAmbientEngine {
  private from: LedPalette;
  private to: LedPalette;
  private fadeStart = -Infinity;
  private transitions: Transition[] = [];
  private positions?: { key: string; u: Float32Array };

  constructor(public settings: LedAnimationSettings = { ...DEFAULT_LED_ANIMATIONS }) {
    this.from = this.to = ledPalette(settings.color);
  }

  configure(settings: LedAnimationSettings): void {
    this.settings = settings;
  }

  /** Couleur visée : celle de la table si on la suit et qu'elle en a une, sinon la couleur fixe. */
  targetColor(tint: string | undefined): string {
    return this.settings.followTable && tint && HEX.test(tint) ? tint : this.settings.color;
  }

  /** Palette montrée à l'instant `now` (fondu en cours compris). */
  palette(now: number): LedPalette {
    return mixPalette(this.from, this.to, smooth((now - this.fadeStart) / FADE_MS));
  }

  /** Nouvelle teinte de table (ou aucune) : fondu depuis la palette montrée ; `instant` : sans fondu. */
  setTint(tint: string | undefined, now: number, instant = false): void {
    const target = ledPalette(this.targetColor(tint));
    if (JSON.stringify(target) === JSON.stringify(this.to)) return;
    this.from = instant ? target : this.palette(now);
    this.to = target;
    this.fadeStart = instant ? -Infinity : now;
  }

  /** Changement de table : une bande de lumière traverse, dans le sens du défilement (1 : vers la fin). */
  sweep(now: number, dir: 1 | -1 = 1): void {
    this.transitions = [...this.transitions.filter((x) => now - x.start < 2000).slice(-2), { kind: 'sweep', start: now, dir }];
  }

  /** Arrivée sur la fiche : deux pulsations qui s'éteignent. */
  arrive(now: number): void {
    this.transitions = [...this.transitions.filter((x) => now - x.start < 2000).slice(-2), { kind: 'arrive', start: now, dir: 1 }];
  }

  /** Une transition ou un fondu est en cours : l'image bouge même pour un style immobile. */
  busy(now: number): boolean {
    return now - this.fadeStart < FADE_MS || this.transitions.some((x) => now - x.start < (x.kind === 'sweep' ? SWEEP_MS : ARRIVE_MS));
  }

  /** Position (0 à 1) de chaque LED le long de la bande ; pour une matrice, selon la colonne. */
  private along(grid: LedGrid): Float32Array {
    const key = `${grid.width}x${grid.height}:${grid.arrangement}`;
    if (this.positions?.key === key) return this.positions.u;
    const n = Math.max(0, grid.width) * Math.max(0, grid.height);
    const u = new Float32Array(n);
    const matrix = grid.width > 1 && grid.height > 1;
    for (let k = 0; k < n; k++) u[k] = matrix ? ledXY(grid, k).x / Math.max(1, grid.width - 1) : n > 1 ? k / (n - 1) : 0;
    this.positions = { key, u };
    return u;
  }

  /** Image de la bande à l'instant `now` (ms) : 3 octets par LED, jamais au-delà de la luminosité réglée. */
  render(grid: LedGrid, now: number): Uint8Array {
    const u = this.along(grid);
    const n = u.length;
    const out = new Uint8Array(n * 3);
    const speed = SPEED_FACTOR[this.settings.speed];
    const s = (now / 1000) * speed;
    const p = this.palette(now);
    const cap = clamp01(this.settings.brightness / 100);
    const style = this.settings.style;
    for (let k = 0; k < n; k++) {
      const [color, level] = this.ambient(style, p, k, u[k]!, s);
      let r = color[0] * level * LED_AMBIENT_CEILING;
      let g = color[1] * level * LED_AMBIENT_CEILING;
      let b = color[2] * level * LED_AMBIENT_CEILING;
      for (const tr of this.transitions) {
        const e = (now - tr.start) / (tr.kind === 'sweep' ? SWEEP_MS : ARRIVE_MS);
        if (e < 0 || e >= 1) continue;
        let add = 0;
        if (tr.kind === 'sweep') {
          const w = 0.22;
          const head = tr.dir > 0 ? lerp(-w, 1 + w, smooth(e)) : lerp(1 + w, -w, smooth(e));
          add = clamp01(1 - Math.abs(u[k]! - head) / w);
          add = add * add * (3 - 2 * add) * (1 - e * 0.3);
        } else {
          add = 0.5 * Math.abs(Math.sin(e * Math.PI * 2)) * (1 - e);
        }
        const c = tr.kind === 'sweep' ? mixRgb(p.primary, [255, 255, 255], 0.35) : mixRgb(p.primary, p.accent, 0.5);
        r += c[0] * add;
        g += c[1] * add;
        b += c[2] * add;
      }
      // Gamma 2 : sur une LED, un quart de la valeur paraît déjà à moitié allumé ; la luminosité réglée plafonne.
      out[k * 3] = Math.round(255 * cap * clamp01(r / 255) ** 2);
      out[k * 3 + 1] = Math.round(255 * cap * clamp01(g / 255) ** 2);
      out[k * 3 + 2] = Math.round(255 * cap * clamp01(b / 255) ** 2);
    }
    return out;
  }

  /** Couleur et niveau (0 à 1) de la LED `k`, à la position `x` de la bande, au temps `s` (en périodes de base). */
  private ambient(style: LedAmbientStyle, p: LedPalette, k: number, x: number, s: number): [Rgb, number] {
    switch (style) {
      case 'breath': {
        // 7 s par souffle, la fin de la bande un peu en retard : la respiration se propage.
        const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * (s / 7 - x * 0.12));
        return [mixRgb(p.primary, p.secondary, 0.5 - 0.5 * Math.cos(2 * Math.PI * (s / 31 + x * 0.2))), 0.18 + 0.82 * breath];
      }
      case 'drift':
        return [cycleColor(p, x * 0.7 - s / 40), 0.75];
      case 'twinkle': {
        const phase = ledHash(k * 3 + 1);
        const period = 1.6 + 2.4 * ledHash(k * 3 + 2);
        const cycle = s / period + phase;
        const spark = Math.max(0, Math.sin(Math.PI * (cycle % 1))) ** 14;
        // Une étincelle sur trois seulement s'allume vraiment à chaque tour : le fond reste calme.
        const lit = ledHash(Math.floor(cycle) * 131 + k) < 0.38 ? spark : 0;
        return [mixRgb(p.primary, ledHash(k * 5 + Math.floor(cycle)) < 0.5 ? p.secondary : p.accent, lit), 0.12 + 0.88 * lit];
      }
      case 'wave': {
        const wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * (x * 1.4 - s / 9));
        return [mixRgb(p.primary, p.secondary, 0.5 + 0.5 * Math.sin(2 * Math.PI * (x * 0.6 + s / 23))), 0.12 + 0.88 * smooth(wave)];
      }
      case 'embers': {
        const heat = ledSoftNoise(k + 1, s * 0.9) * 0.6 + ledSoftNoise(k + 977, s * 2.3) * 0.4;
        return [mixRgb(p.primary, p.accent, smooth((heat - 0.35) * 2.2)), 0.1 + 0.9 * heat * heat];
      }
    }
  }
}
