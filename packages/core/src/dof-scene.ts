// Effets des LED d'une partie sur une table sans ROM ni ligne DOF (profil générique) : une image par
// bande, calculée à chaque instant à partir des événements reçus (dof-evenements-script.ts).
//
// Essai sur une borne, 25/11/2026 : « l'animation à chaque flip, il faut qu'il se passe quelque chose, ça part du bas
// vers le haut » ; « pas d'animation à l'envoi de la bille ». Chaque type d'événement a sa forme (balayage,
// comète, éclair, remplissage, stroboscope) et sa couleur, tirée de la palette de la table (ledPalette) :
// flippers dans la couleur principale, slingshots et lanceur dans l'accent, bumpers et cibles dans la
// secondaire, perte de bille et tilt en rouge, gains en blanc. Tout se règle sur la géométrie des bandes
// (ledXY) : rien d'une borne en particulier.
//
// Moteur remplaçable : l'appli n'appelle que createDofScene, trigger, release et render.

import type { LedArrangement } from './dof';
import { ledXY } from './led-live';
import { ledPalette } from './led-animations';
import { ledFxPalette, renderLedFx, type LedFxId } from './led-effets';
import { ledDitherByte } from './led-luminosite';
import type { DofEventKind, DofSide } from './dof-evenements-script';

type Rgb = readonly [number, number, number];

export interface DofScenePalette {
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
}

export interface DofSceneStrip {
  name: string;
  width: number;
  height: number;
  arrangement: LedArrangement;
}

interface Active {
  kind: DofEventKind;
  side: DofSide;
  start: number;
  /** Relâché à cet instant (flipper tenu, flasher allumé) ; undefined : encore tenu, ou effet sans tenue. */
  released?: number;
  hold: boolean;
  seed: number;
}

/** Durée de vie (ms) de chaque effet, après le relâchement pour un effet tenu. */
const LIFE: Readonly<Record<DofEventKind, number>> = {
  flipper: 420,
  sling: 200,
  bumper: 240,
  launch: 900,
  'ball-start': 900,
  drain: 1100,
  kicker: 420,
  target: 220,
  spinner: 420,
  ramp: 600,
  rollover: 180,
  award: 700,
  jackpot: 1800,
  multiball: 2600,
  tilt: 1300,
  'game-start': 1500,
  'game-over': 2200,
  flasher: 160,
  gi: 0,
  mech: 0,
  other: 180,
};
/** Effets qui suivent l'état de l'événement (allumé tant qu'il dure). */
const HOLDS: ReadonlySet<DofEventKind> = new Set(['flipper', 'flasher']);
/**
 * Un effet tenu jamais relâché (événement perdu, flasher laissé allumé) s'éteint quand même. Retour d'essai
 * (25/11/2026, table originale) : « les LED restent presque constamment allumées ». Entre deux événements,
 * les bandes sont éteintes : ni lueur de fond (GI), ni flipper tenu qui reste allumé.
 */
const MAX_HOLD = 1200;
/** Flipper tenu : le bas reste allumé ce temps-là après le flip, puis s'éteint même si le bouton reste enfoncé. */
const FLIPPER_HOLD_MS = 450;
/** Le même événement reçu deux fois de suite (touche et script) ne rejoue pas l'effet. */
const DEBOUNCE = 90;
/**
 * Règle de couleur (retour d'essai, 25/11/2026) : ce qui arrive souvent (flips, slingshots, bumpers, lancer, cibles,
 * rampes…) reste dans les couleurs de la table, pour ne pas détonner ; les couleurs variées et contrastées
 * sont réservées aux événements rares. Les formes, elles, varient partout.
 */
export const DOF_RARE_EVENTS: ReadonlySet<DofEventKind> = new Set(['jackpot', 'award', 'multiball', 'tilt', 'game-start', 'game-over', 'drain']);

/**
 * Grands moments (rares) joués aussi par la bibliothèque d'effets (led-effets.ts), par-dessus la forme propre
 * de l'événement : des effets sans sens de montée, justes quel que soit le câblage de la bande. `contrast` :
 * couleurs contrastées plutôt que celles de la table.
 */
const FX: Partial<Record<DofEventKind, { id: LedFxId; contrast: boolean }>> = {
  jackpot: { id: 'rainbow-sweep', contrast: true },
  multiball: { id: 'spark-rain', contrast: true },
  award: { id: 'pulse-double', contrast: true },
  'game-start': { id: 'curtain-open', contrast: true },
  'game-over': { id: 'curtain-close', contrast: true },
};
const RED: Rgb = [255, 20, 0];
const GOLD: Rgb = [255, 170, 0];
/** Couleur opposée sur le cercle des teintes (même saturation). */
const complement = (c: Rgb): Rgb => {
  const s = Math.max(...c) + Math.min(...c);
  return [s - c[0], s - c[1], s - c[2]];
};

/**
 * Palette des effets d'une table : ses couleurs dominantes mesurées (TableTints, jusqu'à quatre), sinon
 * déclinée de sa couleur principale — la même extraction que la roue et le DMD.
 */
export function dofScenePalette(color: string | undefined, measured?: readonly string[]): DofScenePalette {
  const valid = (measured ?? []).filter((c) => /^#?[0-9a-f]{6}$/i.test(c.trim()));
  if (valid.length) {
    const p = ledFxPalette(valid);
    return { primary: p[0], secondary: p[1], accent: p[2] };
  }
  return ledPalette(color);
}
const WHITE: Rgb = [255, 255, 255];

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Bruit stable (0..1) pour le scintillement. */
const noise = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Le côté de la borne d'une bande, d'après son nom (« PF Left », « Gauche », « L ») ; centre sinon : une
 * bande du centre (matrice, fond) prend les effets des deux côtés, sur sa moitié quand elle est large.
 */
export function dofStripSide(name: string): DofSide {
  if (/gauche|left|links|\bg\b|\bl\b/i.test(name)) return 'left';
  if (/droit|right|rechts|\bd\b|\br\b/i.test(name)) return 'right';
  return 'center';
}

/**
 * Lanceur analogique : la bille part quand la tirette, tirée (plus d'un tiers de la course), revient au
 * repos en moins de 160 ms. Une tirette ramenée doucement ne lance rien. `pull` : 0 au repos, 1 tirée à fond.
 */
export function createLaunchDetector(): (pull: number, now: number) => boolean {
  let pulledAt: number | undefined;
  return (pull, now) => {
    if (pull > 0.35) {
      pulledAt = now;
      return false;
    }
    if (pulledAt === undefined || pull > 0.12) return false;
    const fired = now - pulledAt < 160;
    pulledAt = undefined;
    return fired;
  };
}

export interface DofScene {
  /** Un événement commence (état allumé). */
  trigger(kind: DofEventKind, side: DofSide, now: number): void;
  /** Il s'arrête (état éteint) : un flipper relâché, un flasher éteint, le GI coupé. */
  release(kind: DofEventKind, side: DofSide, now: number): void;
  /** L'image d'une bande à cet instant : 3 octets par LED, dans l'ordre du câblage. */
  render(strip: DofSceneStrip, now: number): Uint8Array;
  /** Effets en cours (ou ambiance allumée) : faut-il encore envoyer des images ? */
  busy(now: number): boolean;
}

export function createDofScene(palette: DofScenePalette, intensity = 1): DofScene {
  const k = clamp01(intensity);
  let actives: Active[] = [];
  let seed = 1;
  const last = new Map<string, number>();
  /** Côté d'une bande, gardé par nom. */
  const sides = new Map<string, DofSide>();
  const fxPalette = ledFxPalette([palette.primary, palette.secondary, palette.accent]);
  const opposite = complement(palette.primary);
  const contrastPalette = ledFxPalette([opposite, GOLD, WHITE, palette.primary]);

  /** Fin du maintien : le relâché, ou pour un flipper au plus tard FLIPPER_HOLD_MS après le flip. */
  function releasedAt(a: Active): number | undefined {
    return a.kind === 'flipper' ? Math.min(a.released ?? Infinity, a.start + FLIPPER_HOLD_MS) : a.released;
  }

  function alive(a: Active, now: number): boolean {
    const released = releasedAt(a);
    if (a.hold && released === undefined) return now - a.start < MAX_HOLD;
    const end = a.hold ? released! + Math.max(150, LIFE[a.kind] - (released! - a.start)) : a.start + LIFE[a.kind];
    return now < end;
  }

  /** Couleur et force (0..1) d'un effet pour une LED : p hauteur (0 en bas, 1 en haut), x de 0 à 1. */
  function shade(a: Active, p: number, x: number, now: number): [Rgb, number] {
    const t = now - a.start;
    const fadeOut = (life: number) => clamp01(1 - t / life);
    switch (a.kind) {
      case 'flipper': {
        // Balayage du bas vers le haut, tête claire et traîne ; flipper tenu : le bas reste allumé.
        const head = t / 230;
        const d = head - p;
        const sweep = d >= 0 && d < 0.4 ? (1 - d / 0.4) ** 1.5 : 0;
        const color = d < 0.06 ? mix(palette.primary, WHITE, 0.55) : palette.primary;
        const released = releasedAt(a)!;
        const held = now <= released ? 1 : clamp01(1 - (now - released) / 150);
        const base = t > 120 && p < 0.3 ? 0.45 * (1 - p / 0.3) * held : 0;
        return [color, Math.max(sweep, base)];
      }
      case 'sling':
        return [palette.accent, fadeOut(200) ** 2 * (p < 0.45 ? 1 : 0.5)];
      case 'bumper': {
        const flicker = 0.6 + 0.4 * noise(Math.floor(t / 35), Math.floor(p * 40) + a.seed);
        return [mix(palette.secondary, WHITE, 0.15), fadeOut(240) ** 1.5 * (p > 0.45 ? 1 : 0.25) * flicker];
      }
      case 'launch': {
        // Comète qui monte le couloir du lanceur, puis éclair en haut de la borne.
        if (t < 520) {
          const d = t / 420 - p;
          return [mix(palette.accent, WHITE, d < 0.05 ? 0.55 : 0.2), d >= 0 && d < 0.5 ? (1 - d / 0.5) ** 1.2 : 0];
        }
        return [mix(palette.accent, WHITE, 0.4), p > 0.6 ? clamp01(1 - (t - 520) / 380) : 0];
      }
      case 'ball-start': {
        const level = t / 550;
        return [palette.primary, p <= level ? 0.75 * fadeOut(900) : 0];
      }
      case 'drain': {
        // La lumière tombe vers le bas, en rouge.
        const head = 1 - t / 650;
        const d = p - head;
        return [mix(palette.primary, RED, 0.75), d >= 0 && d < 0.6 ? (1 - d / 0.6) * fadeOut(1100) : 0];
      }
      case 'kicker': {
        const pulse = t < 400 ? Math.sin((Math.PI * (t % 200)) / 200) : 0;
        return [palette.accent, p > 0.3 && p < 0.85 ? pulse : pulse * 0.3];
      }
      case 'target': {
        const at = 0.4 + 0.45 * noise(a.seed, 7);
        return [palette.secondary, Math.abs(p - at) < 0.14 ? fadeOut(220) : 0];
      }
      case 'spinner': {
        const head = (t % 140) / 140;
        const d = head - p;
        return [palette.secondary, (d >= 0 && d < 0.25 ? 1 - d / 0.25 : 0) * fadeOut(420)];
      }
      case 'ramp': {
        const d = t / 480 - p;
        return [d < 0.06 ? palette.accent : palette.secondary, d >= 0 && d < 0.45 ? 1 - d / 0.45 : 0];
      }
      case 'rollover':
        return [palette.accent, p > 0.78 ? fadeOut(180) : 0];
      case 'award': {
        // Extra-ball, replay, knocker : stroboscope blanc et or, hors des couleurs de la table.
        const beat = Math.floor(t / 75);
        return [beat % 4 === 0 ? WHITE : GOLD, t < 450 ? (beat % 2 === 0 ? 1 : 0) : 0.6 * clamp01(1 - (t - 450) / 250)];
      }
      case 'jackpot': {
        // Bandes contrastées (opposée de la table, or, sa couleur) qui montent, puis s'éteignent.
        const phase = (p * 3 - t / 160) % 3;
        const colors = [opposite, GOLD, palette.primary];
        const c = colors[((Math.floor(phase) % 3) + 3) % 3]!;
        return [c, t < 1400 ? 1 : clamp01(1 - (t - 1400) / 400)];
      }
      case 'multiball': {
        const stripe = Math.floor(p * 6 - t / 90 + x * 2);
        const c = stripe % 2 === 0 ? palette.primary : opposite;
        return [c, 0.9 * (t < 2200 ? 1 : clamp01(1 - (t - 2200) / 400))];
      }
      case 'tilt': {
        const on = Math.floor(t / 200) % 2 === 0;
        return [RED, on ? 1 : 0.1];
      }
      case 'game-start': {
        // Trois remplissages successifs, du bas vers le haut, dans les couleurs de la table.
        const step = Math.min(2, Math.floor(t / 400));
        const local = (t - step * 400) / 400;
        const c = [palette.primary, palette.secondary, palette.accent][step]!;
        return [c, p <= local || t > 1200 ? (t > 1200 ? clamp01(1 - (t - 1200) / 300) : 1) : 0];
      }
      case 'game-over': {
        const level = 1 - t / 1800;
        return [palette.primary, p <= level ? 0.8 * clamp01(level) : 0];
      }
      case 'flasher': {
        const held = a.released === undefined ? 1 : clamp01(1 - (now - a.released) / 150);
        return [mix(palette.primary, WHITE, 0.6), 0.8 * held];
      }
      case 'other': {
        const at = noise(a.seed, 3);
        return [palette.secondary, Math.abs(p - at) < 0.1 ? 0.8 * fadeOut(180) : 0];
      }
      default:
        return [WHITE, 0];
    }
  }

  function applies(a: Active, side: DofSide, x: number, wide: boolean): boolean {
    if (a.side === 'center' || side === a.side) return true;
    if (side !== 'center') return false;
    // Bande du centre : toute la bande si elle est étroite, sa moitié sinon.
    return !wide || (a.side === 'left' ? x <= 0.5 : x >= 0.5);
  }

  return {
    trigger(kind, side, now) {
      // GI allumé tout le long de la partie, mécanismes : pas un événement à montrer.
      if (kind === 'mech' || kind === 'gi') return;
      const key = `${kind}/${side}`;
      const prev = last.get(key);
      last.set(key, now);
      const held = actives.find((a) => a.kind === kind && a.side === side && a.hold && a.released === undefined);
      if (held || (prev !== undefined && now - prev < DEBOUNCE)) return;
      actives = actives.filter((a) => alive(a, now));
      actives.push({ kind, side, start: now, hold: HOLDS.has(kind), seed: seed++ });
      if (actives.length > 48) actives.splice(0, actives.length - 48);
    },
    release(kind, side, now) {
      for (const a of actives) if (a.kind === kind && a.side === side && a.hold && a.released === undefined) a.released = now;
    },
    render(strip, now) {
      actives = actives.filter((a) => alive(a, now));
      const n = Math.max(0, strip.width) * Math.max(0, strip.height);
      const out = new Uint8Array(n * 3);
      let side = sides.get(strip.name);
      if (!side) sides.set(strip.name, (side = dofStripSide(strip.name)));
      const tall = strip.height > 1;
      const wide = strip.width > 1;
      // Effets de la bibliothèque des grands moments en cours (événements du centre : toute la bande).
      const layers: Uint8Array[] = [];
      for (const a of actives) {
        const fx = FX[a.kind];
        if (fx && n > 0) layers.push(renderLedFx(fx.id, strip, now - a.start, { palette: fx.contrast ? contrastPalette : fxPalette, brightness: 1, seed: a.seed, durationMs: LIFE[a.kind] }));
      }
      for (let i = 0; i < n; i++) {
        const { x: cx, y } = ledXY(strip, i);
        // Bande verticale : 0 en bas, 1 en haut ; bande à plat (une ligne) : le long de la bande.
        const p = tall ? (strip.height - 1 - y) / (strip.height - 1) : wide ? cx / (strip.width - 1) : 0.5;
        const x = wide && tall ? cx / (strip.width - 1) : 0.5;
        let r = 0;
        let g = 0;
        let b = 0;
        for (const a of actives) {
          if (!applies(a, side, x, wide && tall)) continue;
          const [c, f] = shade(a, p, x, now);
          if (f <= 0) continue;
          r = Math.max(r, c[0] * f);
          g = Math.max(g, c[1] * f);
          b = Math.max(b, c[2] * f);
        }
        for (const layer of layers) {
          r = Math.max(r, layer[i * 3]!);
          g = Math.max(g, layer[i * 3 + 1]!);
          b = Math.max(b, layer[i * 3 + 2]!);
        }
        // Gain de la luminosité réglée (linéaire, led-luminosite.ts), arrondi tramé : la nuance tient à faible niveau.
        out[i * 3] = ledDitherByte(r * k, i);
        out[i * 3 + 1] = ledDitherByte(g * k, i);
        out[i * 3 + 2] = ledDitherByte(b * k, i);
      }
      return out;
    },
    busy(now) {
      return actives.some((a) => alive(a, now));
    },
  };
}
