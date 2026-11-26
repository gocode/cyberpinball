// Root Access (26/11/2026) : les LED de la borne jouent le jeu comme une table de flipper. Le jeu envoie des
// signaux (un flip, un bumper, une cible, la sortie d'un étage, la bille perdue…) et où il en est
// (RootAccessStatus) ; ici, chaque signal pose un effet du catalogue des LED par-dessus une ambiance calme
// aux couleurs de l'étage (led-effets.ts, LedFxSequencer). Sans Electron : testé tel quel.

import { LedFxSequencer, type LedFxId } from './led-effets';
import type { LedGrid } from './led-live';
import type { RootAccessStatus } from './root-access-dmd';

/** Les signaux que la page du jeu envoie (le nom du son ou de l'événement qui les produit). */
export const ROOT_ACCESS_SIGNALS = [
  'flip',
  'bumper',
  'sling',
  'cible',
  'touche',
  'bascule',
  'ouvert',
  'ferme',
  'sortie',
  'lance',
  'chute',
  'sauve',
  'descente',
  'perdue',
  'chaine',
  'catapulte',
  'aimant',
] as const;
export type RootAccessSignal = (typeof ROOT_ACCESS_SIGNALS)[number];

/** Un signal reçu de la page : seul un nom connu passe, l'argument (côté d'un flip, charge du lanceur) est borné. */
export function parseRootAccessSignal(name: unknown, arg?: unknown): { signal: RootAccessSignal; arg?: string | number } | undefined {
  const signal = ROOT_ACCESS_SIGNALS.find((s) => s === name);
  if (!signal) return undefined;
  if (typeof arg === 'number' && Number.isFinite(arg)) return { signal, arg: Math.min(1, Math.max(0, arg)) };
  if (typeof arg === 'string') return { signal, arg: arg.slice(0, 8) };
  return { signal };
}

interface SignalFx {
  fx: LedFxId;
  ms: number;
  colors: readonly string[];
  level: number;
}

const SIGNAL_FX: Readonly<Record<RootAccessSignal, SignalFx>> = {
  flip: { fx: 'flash', ms: 150, colors: ['#bdf6ff'], level: 0.4 },
  bumper: { fx: 'ripple-center', ms: 520, colors: ['#ffb02e'], level: 0.9 },
  sling: { fx: 'flash', ms: 220, colors: ['#ff7a1a'], level: 0.7 },
  cible: { fx: 'sparkle-burst', ms: 900, colors: ['#3dff9a', '#ffffff'], level: 0.9 },
  touche: { fx: 'ripple-end', ms: 650, colors: ['#17d9c3'], level: 0.8 },
  bascule: { fx: 'pulse-double', ms: 900, colors: ['#b25cff'], level: 0.9 },
  ouvert: { fx: 'curtain-open', ms: 1000, colors: ['#3dff9a'], level: 0.9 },
  ferme: { fx: 'curtain-close', ms: 1000, colors: ['#ffb02e'], level: 0.8 },
  sortie: { fx: 'rise-burst', ms: 1700, colors: ['#17d9c3', '#ffffff'], level: 1 },
  lance: { fx: 'beam-up', ms: 800, colors: ['#ffffff', '#17d9c3'], level: 0.8 },
  chute: { fx: 'drain', ms: 1300, colors: ['#ff4a2e'], level: 0.9 },
  sauve: { fx: 'strobe', ms: 600, colors: ['#39b8ff'], level: 0.8 },
  descente: { fx: 'drain', ms: 1400, colors: ['#ff5a1a'], level: 1 },
  perdue: { fx: 'drain', ms: 2600, colors: ['#ff1f1f'], level: 1 },
  chaine: { fx: 'sparkle-flash', ms: 800, colors: ['#ffd84a', '#ffffff'], level: 0.9 },
  catapulte: { fx: 'beam-up', ms: 500, colors: ['#ff4ad8'], level: 0.9 },
  aimant: { fx: 'pulse-double', ms: 1000, colors: ['#39b8ff', '#ffffff'], level: 0.8 },
};

/** Les couleurs de chaque étage (le premier en bas) ; au-delà du sixième, on repart du début. */
export const ROOT_ACCESS_FLOOR_COLORS: readonly (readonly string[])[] = [
  ['#17d9c3', '#0a6f66'],
  ['#2bd96a', '#0c6b30'],
  ['#e0b020', '#7a5a08'],
  ['#ff8a1a', '#8a3d05'],
  ['#d94acb', '#6a1c63'],
  ['#8ab4ff', '#ffffff'],
];

const TITLE_COLORS = ['#17d9c3', '#0a6f66'];
const DEAD_COLORS = ['#ff2a1a', '#6a0a05'];
const WON_COLORS = ['#ffd84a', '#ff4ad8', '#17d9c3', '#8ab4ff', '#ffffff'];

/** Une partie, une ambiance, et les effets de chaque signal. `now` est l'horloge de l'appelant, en ms, croissante. */
export class RootAccessLeds {
  private readonly seq: LedFxSequencer;
  private shown: string | undefined;
  private lastFlip = -Infinity;

  constructor(now = 0, seed = 7) {
    this.seq = new LedFxSequencer({ colors: TITLE_COLORS, brightness: 0.6, ambientLevel: 0.35, seed, families: ['aurora', 'breath', 'wave', 'gradient'], mood: 'calm', minMs: 20_000, maxMs: 30_000 }, now);
  }

  /** Où en est le jeu : l'ambiance prend les couleurs de l'étage ; la victoire et la défaite ont les leurs. */
  setStatus(status: RootAccessStatus | undefined, now: number): void {
    const screen = status?.screen ?? 'titre';
    const key = screen === 'jeu' ? `jeu${status!.floor}` : screen;
    if (key === this.shown) return;
    const first = this.shown === undefined;
    this.shown = key;
    if (screen === 'dead') {
      this.seq.configure({ families: ['fire'], mood: 'all', colors: DEAD_COLORS }, now);
    } else if (screen === 'won') {
      this.seq.configure({ families: ['rainbow'], mood: 'all', colors: WON_COLORS }, now);
      this.signalFx({ fx: 'rainbow-sweep', ms: 1600, colors: WON_COLORS, level: 1 }, now);
      this.signalFx({ fx: 'rise-burst', ms: 1800, colors: WON_COLORS, level: 1 }, now);
    } else if (screen === 'jeu') {
      const colors = ROOT_ACCESS_FLOOR_COLORS[(status!.floor - 1) % ROOT_ACCESS_FLOOR_COLORS.length]!;
      this.seq.configure({ families: ['aurora', 'breath', 'wave', 'gradient'], mood: 'calm', colors }, now);
    } else {
      this.seq.configure({ families: ['aurora', 'breath', 'wave', 'gradient'], mood: 'calm', colors: TITLE_COLORS }, now);
    }
    // Un autre étage, un autre décor lumineux ; pas de coupure à la première image.
    if (!first) this.seq.next(now);
  }

  /** Un signal du jeu : son effet se pose aussitôt par-dessus l'ambiance. */
  signal(signal: RootAccessSignal, now: number, arg?: string | number): void {
    const base = SIGNAL_FX[signal];
    if (signal === 'flip') {
      // Une rafale de flips ne doit pas saturer les LED : un éclair toutes les 90 ms au plus.
      if (now - this.lastFlip < 90) return;
      this.lastFlip = now;
    }
    // Le lanceur chargé à fond part plus fort ; un flip gauche et un flip droit ne s'éclairent pas pareil.
    const level = signal === 'lance' && typeof arg === 'number' ? 0.4 + 0.6 * arg : base.level;
    const colors = signal === 'flip' && typeof arg === 'string' ? (arg.startsWith('l') ? ['#bdf6ff'] : ['#ffe6bd']) : base.colors;
    this.signalFx({ ...base, level, colors }, now);
  }

  private signalFx(fx: SignalFx, now: number): void {
    this.seq.trigger(fx.fx, now, { durationMs: fx.ms, colors: fx.colors, level: fx.level });
  }

  /** L'image d'une bande à l'instant `now` : 3 octets RVB par LED. */
  render(grid: LedGrid, now: number): Uint8Array {
    return this.seq.render(grid, now);
  }
}
