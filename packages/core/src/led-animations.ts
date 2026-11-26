// Animations des LED hors partie : la partie pure (aucune entrée-sortie, l'horloge est donnée).
//
// Quand rien ne se passe, dans les écrans et dans la roue des tables, les bandes de LED adressables
// montrent une ambiance aux couleurs de la table choisie (les couleurs dominantes de son visuel) ou à
// une couleur fixe : le Florilège (par défaut : les effets de led-effets.ts s'enchaînent, un autre à
// chaque changement d'écran), ou un style unique et doux (respiration, dégradé lent, scintillement,
// vague, braises). Chaque changement de table lance un balayage dans le sens du défilement, et
// l'ouverture de la fiche une pulsation. À l'ouverture de Cyber Pinball, les bandes jouent l'animation
// d'ouverture (led-ouverture.ts), puis se fondent dans l'ambiance des menus. Ce module décrit :
// - les réglages (activer, style, luminosité maximale, vitesse, couleurs, extinction après inactivité),
//   leur lecture sûre et leur écriture (writeFileAtomic) ;
// - la palette tirée des couleurs de la table (tabletint.ts, déjà mesurées et gardées par table) ;
// - le moteur (`LedAmbientEngine`) : image d'une bande à un instant, fondu entre palettes, transitions.
// Le service des LED, les minuteries et le branchement au front-end sont dans app/src/led-animations.ts.
//
// Invariants (fixés par led-animations.test.ts) : aucune LED ne dépasse la luminosité maximale réglée ;
// l'ambiance seule reste sous 70 % de ce maximum, la marge est celle des transitions ; une image ne
// dépend que de l'instant donné (aucun hasard), sauf le Florilège, dont la suite d'effets dépend aussi
// de sa graine (tirée au lancement, fixée par les essais) ; tout réglage illisible retombe sur une
// valeur sûre ; animations éteintes : tout est noir.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t } from './i18n';
import { hsvToRgb, rgbToHsv, type Rgb } from './jukebox-visualizer';
// led-effets.ts et led-ouverture.ts importent ce module en retour : ils ne s'en servent qu'à l'appel,
// jamais au chargement, et ce module ne se sert d'eux que dans le moteur (import circulaire sans risque).
import { LedFxSequencer, ledLightToBytes, type LedFxId } from './led-effets';
import { ledXY, type LedGrid } from './led-live';
import { LED_LEVEL_CHOICES, LED_LEVEL_SCALE, ledDitherByte, ledLevelFromLinear, ledLevelGain } from './led-luminosite';
import { ledIntroLight } from './led-ouverture';
import { hexToRgb, NEUTRAL_TINT } from './tabletint';

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

/** Styles de l'ambiance ; le Florilège (`medley`) enchaîne les effets de led-effets.ts, c'est le défaut. */
export const LED_AMBIENT_STYLES = ['medley', 'breath', 'drift', 'twinkle', 'wave', 'embers'] as const;
export type LedAmbientStyle = (typeof LED_AMBIENT_STYLES)[number];

export const LED_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type LedSpeed = (typeof LED_SPEEDS)[number];

/** Luminosité maximale proposée, en % perçu de celle des bandes (led-luminosite.ts), de l'extinction au plein. */
export const LED_BRIGHTNESS_CHOICES: readonly number[] = LED_LEVEL_CHOICES;
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
  /**
   * Luminosité maximale, de 0 (éteint) à 100 %, en clarté perçue (`ledLevelGain`) : rien ne dépasse,
   * transitions comprises.
   */
  brightness: number;
  speed: LedSpeed;
  /** Les couleurs viennent de la table choisie ; sinon `color`. */
  followTable: boolean;
  /** Couleur fixe (#rrggbb), et celle de repli quand la table n'a pas de teinte. */
  color: string;
  /** Minutes sans rien toucher avant d'éteindre ; 0 : jamais. */
  idleMinutes: number;
}

/**
 * Valeurs sûres : allumées, douces (50 % perçus, moins de la moitié de l'ancien défaut de 40 %
 * linéaires), le Florilège (de la variété aux menus et au repos), qui suivent la table, éteintes après
 * 30 minutes. Un style déjà enregistré reste celui du joueur.
 */
export const DEFAULT_LED_ANIMATIONS: Readonly<LedAnimationSettings> = {
  enabled: true,
  style: 'medley',
  brightness: 50,
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
    brightness: num(o.brightness, d.brightness, 0, 100),
    speed: (LED_SPEEDS as readonly unknown[]).includes(o.speed) ? (o.speed as LedSpeed) : d.speed,
    followTable: typeof o.followTable === 'boolean' ? o.followTable : d.followTable,
    color: typeof o.color === 'string' && HEX.test(o.color.trim()) ? o.color.trim().toLowerCase() : d.color,
    idleMinutes: num(o.idleMinutes, d.idleMinutes, 0, 24 * 60),
  };
}

export function ledAnimationsFile(dataDir: string): string {
  return path.join(dataDir, 'led-animations.json');
}

/**
 * Fichier lu tel quel vers les réglages : un fichier d'avant la courbe perçue (sans `scale`) avait une
 * luminosité linéaire, reprise au cran perçu qui donne la même lumière (`ledLevelFromLinear`).
 */
export function ledAnimationsFromFile(raw: unknown): LedAnimationSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  if (o && o.scale !== LED_LEVEL_SCALE && typeof o.brightness === 'number' && Number.isFinite(o.brightness)) {
    return normalizeLedAnimations({ ...o, brightness: ledLevelFromLinear(o.brightness) });
  }
  return normalizeLedAnimations(raw);
}

export function readLedAnimations(dataDir: string): LedAnimationSettings {
  try {
    return ledAnimationsFromFile(JSON.parse(fs.readFileSync(ledAnimationsFile(dataDir), 'utf8')));
  } catch {
    return { ...DEFAULT_LED_ANIMATIONS };
  }
}

export function writeLedAnimations(dataDir: string, settings: LedAnimationSettings): void {
  writeFileAtomic(ledAnimationsFile(dataDir), JSON.stringify({ ...normalizeLedAnimations(settings), scale: LED_LEVEL_SCALE }, null, 2) + '\n');
}

// Textes (tutoiement) des écrans de réglage.

export function ledStyleLabel(style: LedAmbientStyle): string {
  switch (style) {
    case 'medley':
      return t('Florilège');
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
    case 'medley':
      return t('Les effets s’enchaînent : comètes, faisceaux, vagues, étincelles, arcs-en-ciel… aux couleurs de la table');
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

/** Couleur d'une LED d'après un #rrggbb : sa teinte, saturée comme `ledPalette` (sauf un blanc), à pleine valeur. */
function vivid(hex: string): Rgb {
  const [h, s] = rgbToHsv(hexToRgb(hex));
  return hsvToRgb(h, s < 0.12 ? s : Math.max(s, 0.85), 1);
}

/**
 * Palette des LED d'après les couleurs dominantes du visuel d'une table (#rrggbb, la plus présente
 * d'abord) : primary = la première, secondary et accent = la deuxième et la troisième, chacune saturée
 * comme `ledPalette` ; une couleur qui manque est la voisine de teinte de la première (`ledPalette`).
 * Sans couleur lisible : `ledPalette(undefined)`, la sarcelle de la marque.
 */
export function ledPaletteFrom(colors: readonly string[] | undefined): LedPalette {
  const list = (colors ?? []).map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => HEX.test(c));
  const base = ledPalette(list[0]);
  return {
    primary: base.primary,
    secondary: list[1] ? vivid(list[1]) : base.secondary,
    accent: list[2] ? vivid(list[2]) : base.accent,
  };
}

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

/** Part de la luminosité maximale que l'ambiance seule ne dépasse pas : le reste est pour les transitions. */
export const LED_AMBIENT_CEILING = 0.7;
/** Florilège : écart minimal entre deux changements d'effet provoqués par un changement d'écran. */
export const LED_SHUFFLE_MIN_MS = 8000;
const FADE_MS = 900;
const SWEEP_MS = 800;
const ARRIVE_MS = 1200;
/** Fin de l'ouverture : fondu de son image vers l'ambiance des menus. */
const HANDOFF_MS = 1500;
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

export interface LedAmbientEngineOptions {
  /**
   * Graine du Florilège (l'ordre des effets) : tirée au hasard à chaque lancement par défaut, pour que
   * la borne ne rejoue pas toujours la même suite ; fixée par les essais.
   */
  seed?: number;
}

export class LedAmbientEngine {
  private from: LedPalette;
  private to: LedPalette;
  private fadeStart = -Infinity;
  private transitions: Transition[] = [];
  private positions?: { key: string; u: Float32Array };
  /** Couleurs visées (#rrggbb, la dominante d'abord) : celles que reçoit le Florilège. */
  private colors: readonly string[];
  private readonly seed: number;
  private seq?: LedFxSequencer;
  private lastNow = 0;
  /** Ouverture en cours : instant de son départ (horloge de l'appelant). */
  private introStart?: number;
  /** Sortie de l'ouverture : fondu de son image vers l'ambiance. */
  private handoff?: { start: number; introStart: number };
  private introLight: Float32Array = new Float32Array(0);

  constructor(
    public settings: LedAnimationSettings = { ...DEFAULT_LED_ANIMATIONS },
    options: LedAmbientEngineOptions = {},
  ) {
    this.from = this.to = ledPalette(settings.color);
    this.colors = [settings.color];
    this.seed = options.seed !== undefined && Number.isFinite(options.seed) ? Math.floor(options.seed) : 1 + Math.floor(Math.random() * 0x7ffffffe);
  }

  configure(settings: LedAnimationSettings): void {
    this.settings = settings;
    this.seq?.configure({ speed: SPEED_FACTOR[settings.speed] }, this.lastNow);
  }

  /** Couleur visée : celle de la table si on la suit et qu'elle en a une, sinon la couleur fixe. */
  targetColor(tint: string | undefined): string {
    return this.settings.followTable && tint && HEX.test(tint) ? tint : this.settings.color;
  }

  /**
   * Couleurs visées : sans suivre la table, la couleur fixe ; sinon les couleurs dominantes du visuel
   * de la table (jusqu'à 5), à défaut sa teinte, à défaut la couleur fixe.
   */
  targetColors(tint: string | undefined, palette?: readonly string[]): string[] {
    if (!this.settings.followTable) return [this.settings.color];
    const list = (palette ?? []).filter((c): c is string => typeof c === 'string' && HEX.test(c.trim())).map((c) => c.trim().toLowerCase());
    return list.length ? list.slice(0, 5) : [this.targetColor(tint)];
  }

  /** Palette montrée à l'instant `now` (fondu en cours compris). */
  palette(now: number): LedPalette {
    return mixPalette(this.from, this.to, smooth((now - this.fadeStart) / FADE_MS));
  }

  /**
   * Nouvelle table (ou aucune) : sa teinte et, s'il y en a, les couleurs dominantes de son visuel
   * (`palette`, la plus présente d'abord). Fondu depuis la palette montrée ; `instant` : sans fondu.
   */
  setTint(tint: string | undefined, now: number, instant = false, palette?: readonly string[]): void {
    const colors = this.targetColors(tint, palette);
    const target = ledPaletteFrom(colors);
    this.colors = colors;
    this.seq?.setPalette(colors, now, instant);
    if (JSON.stringify(target) === JSON.stringify(this.to)) return;
    this.from = instant ? target : this.palette(now);
    this.to = target;
    this.fadeStart = instant ? -Infinity : now;
  }

  /** Effet en boucle que montre le Florilège (undefined tant qu'il n'a pas servi). */
  get medleyEffect(): LedFxId | undefined {
    return this.seq?.current;
  }

  /**
   * Florilège : passe à l'effet suivant (changement d'écran), par un fondu enchaîné. Sans effet pour un
   * autre style. Au plus un changement par LED_SHUFFLE_MIN_MS : des écrans passés vite (un message, une
   * confirmation) ne font pas défiler les effets en fondus avortés.
   */
  shuffle(now: number): void {
    if (this.settings.style !== 'medley' || now - this.shuffledAt < LED_SHUFFLE_MIN_MS) return;
    this.shuffledAt = now;
    this.sequencer(now).next(now);
  }
  private shuffledAt = -Infinity;

  /**
   * Ouverture de Cyber Pinball : l'image suit l'animation d'ouverture des LED (led-ouverture.ts), calée
   * sur `startedAt`, l'instant de départ des animations des écrans (même horloge que `render`). Une
   * liaison ouverte en retard prend l'animation où elle en est.
   */
  playIntro(startedAt: number): void {
    if (!Number.isFinite(startedAt)) return;
    this.introStart = startedAt;
    this.handoff = undefined;
  }

  /** Fin de l'ouverture : son image se fond dans l'ambiance (1,5 s), sans passer par le noir. */
  endIntro(now: number): void {
    if (this.introStart === undefined) return;
    this.handoff = { start: now, introStart: this.introStart };
    this.introStart = undefined;
  }

  /** L'ouverture est en cours (pas sa sortie). */
  get introPlaying(): boolean {
    return this.introStart !== undefined;
  }

  /** Le séquenceur du Florilège, créé au premier besoin, déjà installé (pas de montée depuis le noir). */
  private sequencer(now: number): LedFxSequencer {
    if (!this.seq) {
      const fadeMs = 3000;
      this.seq = new LedFxSequencer(
        { colors: this.colors, brightness: 1, ambientLevel: LED_AMBIENT_CEILING, seed: this.seed, speed: SPEED_FACTOR[this.settings.speed], fadeMs },
        now - fadeMs,
      );
    }
    return this.seq;
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
    return (
      this.introStart !== undefined ||
      (this.handoff !== undefined && now - this.handoff.start < HANDOFF_MS) ||
      now - this.fadeStart < FADE_MS ||
      this.transitions.some((x) => now - x.start < (x.kind === 'sweep' ? SWEEP_MS : ARRIVE_MS))
    );
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

  /**
   * Image de la bande à l'instant `now` (ms) : 3 octets par LED, jamais au-delà de la luminosité réglée.
   * Tout se compose en lumière AVANT gamma (0 à 255 par canal) : l'ambiance (un style, ou la lumière du
   * séquenceur du Florilège, prise avant son gamma), l'ouverture et son fondu de sortie, puis les
   * transitions ajoutées par-dessus ; le gamma 2 et le plafond ne s'appliquent qu'une fois, à la fin.
   */
  render(grid: LedGrid, now: number): Uint8Array {
    if (Number.isFinite(now)) this.lastNow = now;
    const u = this.along(grid);
    const n = u.length;
    const out = new Uint8Array(n * 3);
    if (!this.settings.enabled || !n) return out;
    const cap = ledLevelGain(this.settings.brightness);
    if (this.handoff && now - this.handoff.start >= HANDOFF_MS) this.handoff = undefined;
    // Ouverture : son image seule, sans ambiance ni transitions.
    if (this.introStart !== undefined) {
      this.introLight = ledIntroLight(grid, now - this.introStart, this.introLight);
      return ledLightToBytes(this.introLight, cap, out);
    }
    const speed = SPEED_FACTOR[this.settings.speed];
    const s = (now / 1000) * speed;
    const p = this.palette(now);
    const style = this.settings.style;
    const medley = style === 'medley' ? this.sequencer(now).light(grid, now) : undefined;
    // Sortie de l'ouverture : son image (qui continue) cède la place à l'ambiance.
    let fromIntro = 0;
    if (this.handoff) {
      fromIntro = 1 - smooth((now - this.handoff.start) / HANDOFF_MS);
      this.introLight = ledIntroLight(grid, now - this.handoff.introStart, this.introLight);
    }
    const intro = this.introLight;
    for (let k = 0; k < n; k++) {
      let r: number;
      let g: number;
      let b: number;
      if (medley) {
        r = 255 * Math.min(1, medley[k * 3]!);
        g = 255 * Math.min(1, medley[k * 3 + 1]!);
        b = 255 * Math.min(1, medley[k * 3 + 2]!);
      } else {
        const [color, level] = this.ambient(style, p, k, u[k]!, s);
        r = color[0] * level * LED_AMBIENT_CEILING;
        g = color[1] * level * LED_AMBIENT_CEILING;
        b = color[2] * level * LED_AMBIENT_CEILING;
      }
      if (fromIntro > 0) {
        r = lerp(r, 255 * intro[k * 3]!, fromIntro);
        g = lerp(g, 255 * intro[k * 3 + 1]!, fromIntro);
        b = lerp(b, 255 * intro[k * 3 + 2]!, fromIntro);
      }
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
      // Gamma 2 : sur une LED, un quart de la valeur paraît déjà à moitié allumé ; la luminosité réglée
      // plafonne (gain de sa courbe perçue), et l'arrondi tramé garde la nuance à faible niveau.
      out[k * 3] = ledDitherByte(255 * cap * clamp01(r / 255) ** 2, k);
      out[k * 3 + 1] = ledDitherByte(255 * cap * clamp01(g / 255) ** 2, k);
      out[k * 3 + 2] = ledDitherByte(255 * cap * clamp01(b / 255) ** 2, k);
    }
    return out;
  }

  /** Couleur et niveau (0 à 1) de la LED `k`, à la position `x` de la bande, au temps `s` (en périodes de base). */
  private ambient(style: LedAmbientStyle, p: LedPalette, k: number, x: number, s: number): [Rgb, number] {
    switch (style) {
      case 'medley': // rendu par le séquenceur (render) ; ici, la respiration en repli
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
