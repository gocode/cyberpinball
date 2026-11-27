// Pinball FX3 en mode borne : placer ses fenêtres du fronton et du DMD sur les écrans de ces rôles,
// après le lancement (27/11/2026, essai sur le PinCab).
//
// Relevé (PinCab, FX3 en mode borne, écran d'accueil) : FX3 ouvre trois fenêtres de classe PxWindowClass
// dans son processus : le playfield (« Pinball FX Classic », 3856 × 2180 en (0, 0)) et deux fenêtres
// annexes toutes deux titrées « Pinball FX2 » : le DMD (1920 × 480 en (3840, 390)) et le fronton
// (1920 × 1080 en (5760, 101), 101 px sous le haut de son écran et rognée en bas). Les places viennent
// des réglages chiffrés du jeu, saisis à la main dans son menu : sur une autre disposition d'écrans, ou
// après un changement, elles tombent à côté (DMD qui masque le fond du front-end, fronton décalé).
// Les deux fenêtres annexes ne se distinguent que par leur forme : le DMD est quatre fois plus large
// que haut. Le playfield, lui, reste où le jeu l'a mis (son orientation est un réglage du jeu).
//
// Ici, rien que du calcul et un suivi sans effet de bord : la lecture des fenêtres, leur déplacement
// et le journal sont donnés par l'appelant (app/src/frontend.ts).

import type { Rect } from './model';

/** Titre des deux fenêtres annexes de FX3 (DMD et fronton) en mode borne. */
export const PINBALLFX3_SECONDARY_TITLE = 'Pinball FX2';

/** Une fenêtre du processus de FX3, telle que la lit Windows. */
export interface Fx3Window {
  handle: bigint;
  title: string;
  visible: boolean;
  minimized?: boolean;
  /** Avec barre de titre et cadre (mode fenêtré du jeu, `Mode = 0` de graphics.cfg). */
  framed?: boolean;
  rect: Rect;
}

export type Fx3WindowRole = 'playfield' | 'backglass' | 'dmd';

/** Titres de la fenêtre du playfield : « Pinball FX Classic » (Steam 442120 renommé) ou « Pinball FX3 ». */
const PLAYFIELD_TITLES: readonly string[] = ['Pinball FX Classic', 'Pinball FX3'];

/** Au-delà de ce rapport largeur / hauteur, une fenêtre annexe est le DMD (4 : 1 chez FX3), sinon le fronton (16 : 9). */
const DMD_MIN_RATIO = 2.5;

/**
 * Les fenêtres annexes de FX3 (titre « Pinball FX2 », visibles, de taille non nulle) rangées par rôle,
 * d'après leur forme. Une seule par rôle (la plus grande). Vide hors du mode borne : FX3 n'ouvre alors
 * que son playfield.
 */
export function classifyFx3Windows<W extends Fx3Window>(windows: readonly W[]): Partial<Record<Fx3WindowRole, W>> {
  const found: Partial<Record<Fx3WindowRole, W>> = {};
  for (const w of windows) {
    if (!w.visible || w.minimized || w.rect.width <= 0 || w.rect.height <= 0) continue;
    if (!PLAYFIELD_TITLES.includes(w.title) && w.title !== PINBALLFX3_SECONDARY_TITLE) continue;
    const role: Fx3WindowRole = PLAYFIELD_TITLES.includes(w.title) ? 'playfield' : w.rect.width / w.rect.height >= DMD_MIN_RATIO ? 'dmd' : 'backglass';
    const current = found[role];
    if (!current || w.rect.width * w.rect.height > current.rect.width * current.rect.height) found[role] = w;
  }
  return found;
}

/**
 * Place d'une fenêtre annexe sur l'écran de son rôle : sa forme gardée, la plus grande possible dans
 * l'écran, centrée (le DMD 4 : 1 sur un écran 16 : 9 : toute la largeur, centré en hauteur).
 */
export function fx3WindowTarget(window: Rect, screen: Rect): Rect | undefined {
  if (window.width <= 0 || window.height <= 0 || screen.width <= 0 || screen.height <= 0) return undefined;
  // Forme de l'écran à 2 % près (la zone utile d'un playfield fenêtré 3840 × 2160 dans sa fenêtre de
  // 3856 × 2180) : tout l'écran, sans bandes de quelques pixels.
  const ratio = window.width / window.height / (screen.width / screen.height);
  if (Math.abs(ratio - 1) <= 0.02) return { ...screen };
  const scale = Math.min(screen.width / window.width, screen.height / window.height);
  const width = Math.round(window.width * scale);
  const height = Math.round(window.height * scale);
  return { x: screen.x + Math.round((screen.width - width) / 2), y: screen.y + Math.round((screen.height - height) / 2), width, height };
}

/** Écart toléré, en pixels, entre la place demandée et celle que Windows relit (bordures, arrondis). */
export const FX3_PLACE_TOLERANCE = 2;

export function sameFx3Place(a: Rect, b: Rect, tolerance = FX3_PLACE_TOLERANCE): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
}

/** Nombre de poses d'une même fenêtre avant d'y renoncer : au-delà, le jeu la remet ailleurs à chaque fois. */
export const FX3_MAX_ATTEMPTS = 4;

interface RoleState {
  target: Rect;
  attempts: number;
  confirmed: boolean;
  gaveUp: boolean;
}

export interface Fx3PlacementEvents {
  /** Fenêtre posée et relue à sa place. */
  placed: (role: Fx3WindowRole, to: Rect) => void;
  /** Fenêtre qui n'a pas gardé sa place malgré FX3_MAX_ATTEMPTS poses : le jeu la remet ailleurs (diagnostic). */
  resisted: (role: Fx3WindowRole, wanted: Rect, actual: Rect) => void;
}

export interface Fx3PlacementWatch {
  /**
   * À appeler régulièrement pendant la partie : pose les fenêtres annexes sur l'écran de leur rôle
   * (`roleRect`), relit leur place au passage suivant et la signale si le jeu l'a changée.
   */
  tick<W extends Fx3Window>(
    windows: readonly W[],
    roleRect: (role: Fx3WindowRole) => Rect | undefined,
    setBounds: (w: W, r: Rect) => boolean,
    events: Fx3PlacementEvents,
    stripFrame?: (w: W) => boolean,
  ): void;
}

/**
 * Suivi des fenêtres annexes de FX3 : un rôle sans écran, ou sans fenêtre, est laissé. Une fenêtre déjà
 * à sa place n'est pas touchée. Posée, elle est relue au passage suivant : à sa place, elle est
 * confirmée une fois ; ailleurs, reposée jusqu'à FX3_MAX_ATTEMPTS fois, puis signalée (resisted) et
 * laissée, pour ne pas se battre avec le jeu.
 */
export function createFx3PlacementWatch(): Fx3PlacementWatch {
  const states = new Map<Fx3WindowRole, RoleState>();
  return {
    tick(windows, roleRect, setBounds, events, stripFrame) {
      const found = classifyFx3Windows(windows);
      for (const role of ['playfield', 'backglass', 'dmd'] as const) {
        const w = found[role];
        const screen = roleRect(role);
        if (!w || !screen) continue;
        let state = states.get(role);
        if (state?.gaveUp) continue;
        if (role === 'playfield') {
          // Le playfield n'est touché que s'il est fenêtré (barre de titre, boutons) : sans bordure d'emblée,
          // il reste où le jeu l'a mis (son orientation est un réglage du jeu). Le cadre est retiré à un
          // passage, la fenêtre calée sur son écran au suivant, une fois sa nouvelle taille relue.
          if (w.framed && stripFrame) {
            state ??= { target: screen, attempts: 0, confirmed: false, gaveUp: false };
            states.set(role, state);
            if (state.attempts >= FX3_MAX_ATTEMPTS) {
              state.gaveUp = true;
              events.resisted(role, state.target, w.rect);
              continue;
            }
            state.attempts++;
            state.confirmed = false;
            stripFrame(w);
            continue;
          }
          if (!state) continue;
        }
        const target = fx3WindowTarget(w.rect, screen);
        if (!target) continue;
        if (state?.confirmed && sameFx3Place(w.rect, state.target)) continue;
        if (state && !state.confirmed && sameFx3Place(w.rect, state.target)) {
          state.confirmed = true;
          events.placed(role, state.target);
          continue;
        }
        if (!state) {
          // Déjà à la place voulue : rien à poser. Dans l'écran mais pas sur la zone du rôle ne suffit pas
          // (le DMD du PinCab y était, décentré de 90 px sur la zone du DMD de la borne).
          if (sameFx3Place(w.rect, target)) continue;
          state = { target, attempts: 0, confirmed: false, gaveUp: false };
          states.set(role, state);
        }
        if (state.attempts >= FX3_MAX_ATTEMPTS) {
          state.gaveUp = true;
          events.resisted(role, state.target, w.rect);
          continue;
        }
        state.target = target;
        state.confirmed = false;
        state.attempts++;
        setBounds(w, target);
      }
    },
  };
}
