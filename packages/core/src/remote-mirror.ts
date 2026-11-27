// Miroir du navigateur sur le téléphone (télécommande, fenêtres Edge ouvertes par Cyber Pinball).
// Ici, ce qui ne dépend ni d'Electron ni du réseau : les messages que le téléphone peut envoyer,
// la conversion d'un point de l'image vers un pixel du bureau, la taille de l'image à demander, et
// l'adaptation à la liaison. La capture, l'envoi et la file des images sont dans app/src/phone-mirror.ts.

/** Rectangle d'une fenêtre, pixels physiques du bureau (les coordonnées peuvent être négatives : écran à gauche ou au-dessus). */
export interface MirrorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ce que le téléphone ajoute à son vocabulaire en mode miroir. Les points sont des fractions de
 * l'image (0 à 1) : le téléphone ne connaît ni la taille ni la place de la fenêtre sur le bureau,
 * et la borne les convertit avec le rectangle de la fenêtre au moment du geste.
 */
export type MirrorMessage =
  /** Demande (`on`) ou fin du miroir ; `w` × `h` : la place de l'image à l'écran du téléphone, en pixels de l'écran. */
  | { t: 'mirror'; s: number; on: boolean; w: number; h: number }
  /** Une image reçue et affichée : la suivante peut partir. */
  | { t: 'mirror-ack'; s: number; n: number }
  /** Un appui sur l'image : clic à cet endroit de la fenêtre. */
  | { t: 'tap'; s: number; fx: number; fy: number; button: 'left' | 'right'; count: 1 | 2 }
  /**
   * Un glissement du doigt commencé en (fx, fy) ; dx, dy : fractions de l'image (la page suit le doigt).
   * `end` : le doigt est levé (dernier message du glissement, éventuellement sans mouvement de plus).
   */
  | { t: 'mscroll'; s: number; fx: number; fy: number; dx: number; dy: number; end?: true }
  /** Un appui sur « Agrandir / Réduire la page » : `steps` pas de zoom de la page d'Edge (positif : agrandir, négatif : rapetisser), au plus MIRROR_ZOOM_STEPS_MAX à la fois. */
  | { t: 'mzoom'; s: number; steps: number };

/** Pas de zoom qu'un seul message peut demander. */
export const MIRROR_ZOOM_STEPS_MAX = 4;

const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const span = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2;

/** Taille de la place de l'image au téléphone : bornes d'un écran réel, jamais plus (la borne ne capture pas au-delà). */
export const MIRROR_BOX_MAX = 4000;

/** Lit un message du miroir ; undefined pour tout ce qui n'est pas attendu. `s` : le numéro déjà vérifié du message. */
export function parseMirrorMessage(m: Record<string, unknown>, s: number): MirrorMessage | undefined {
  switch (m.t) {
    case 'mirror': {
      if (typeof m.on !== 'boolean') return undefined;
      const w = Number(m.w);
      const h = Number(m.h);
      const sized = Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1 && w <= MIRROR_BOX_MAX && h <= MIRROR_BOX_MAX;
      // Sans place (arrêt) : celle-ci ne sert pas. Demandé sans place valable : refusé.
      if (m.on && !sized) return undefined;
      return { t: 'mirror', s, on: m.on, w: sized ? Math.round(w) : 1, h: sized ? Math.round(h) : 1 };
    }
    case 'mirror-ack':
      return typeof m.n === 'number' && Number.isSafeInteger(m.n) && m.n >= 1 ? { t: 'mirror-ack', s, n: m.n } : undefined;
    case 'tap':
      return unit(m.fx) && unit(m.fy) && (m.button === 'left' || m.button === 'right') ? { t: 'tap', s, fx: m.fx, fy: m.fy, button: m.button, count: m.count === 2 ? 2 : 1 } : undefined;
    case 'mscroll':
      return unit(m.fx) && unit(m.fy) && span(m.dx) && span(m.dy) ? { t: 'mscroll', s, fx: m.fx, fy: m.fy, dx: m.dx, dy: m.dy, ...(m.end === true ? { end: true as const } : {}) } : undefined;
    case 'mzoom':
      return typeof m.steps === 'number' && Number.isInteger(m.steps) && m.steps !== 0 && Math.abs(m.steps) <= MIRROR_ZOOM_STEPS_MAX ? { t: 'mzoom', s, steps: m.steps } : undefined;
    default:
      return undefined;
  }
}

/**
 * Le pixel du bureau sous le point (fx, fy) de l'image : dans la fenêtre, jamais sur son bord
 * extérieur (une fenêtre de largeur L couvre x … x + L − 1). Marche pour toute fenêtre : coordonnées
 * négatives, écran tourné en portrait, échelle de Windows quelconque (le rectangle est en pixels
 * physiques, comme le pointeur).
 */
export function mirrorPoint(rect: MirrorRect, fx: number, fy: number): { x: number; y: number } {
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    x: Math.round(rect.x) + Math.min(w - 1, Math.floor(clamp(fx) * w)),
    y: Math.round(rect.y) + Math.min(h - 1, Math.floor(clamp(fy) * h)),
  };
}

/** Plus grand côté de l'image envoyée, et plus petit (un téléphone réel n'a pas besoin de plus, la liaison de moins). */
export const MIRROR_EDGE_MAX = 1280;
export const MIRROR_EDGE_MIN = 160;

/**
 * Taille de l'image à demander à la capture : la fenêtre (son rapport largeur/hauteur) contenue
 * dans la place du téléphone, réduite par `scale` (adaptation à la liaison), jamais plus grande que
 * la fenêtre elle-même. Un téléphone en portrait et une fenêtre en paysage (ou l'inverse) donnent
 * chacun leur image, sans déformation.
 */
export function mirrorFit(rect: Pick<MirrorRect, 'width' | 'height'>, box: { w: number; h: number }, scale = 1): { width: number; height: number } {
  const rw = Math.max(1, rect.width);
  const rh = Math.max(1, rect.height);
  const bw = Math.max(1, box.w) * scale;
  const bh = Math.max(1, box.h) * scale;
  let k = Math.min(bw / rw, bh / rh, 1);
  const longest = Math.max(rw, rh) * k;
  if (longest > MIRROR_EDGE_MAX) k *= MIRROR_EDGE_MAX / longest;
  const shortest = Math.min(rw, rh) * k;
  if (shortest < MIRROR_EDGE_MIN) k = Math.min(1, k * (MIRROR_EDGE_MIN / shortest));
  return { width: Math.max(1, Math.round(rw * k)), height: Math.max(1, Math.round(rh * k)) };
}

/** Réduction de l'image et qualité du JPEG, du meilleur (liaison rapide) au plus léger (liaison lente). */
export const MIRROR_LEVELS: readonly { scale: number; quality: number }[] = [
  { scale: 1, quality: 72 },
  { scale: 0.75, quality: 60 },
  { scale: 0.55, quality: 50 },
  { scale: 0.4, quality: 40 },
];

/** De 4 à 8 images par seconde : le délai le plus court entre deux captures, et le plus long. */
export const MIRROR_FAST_MS = 125;
export const MIRROR_SLOW_MS = 250;
/** Aller-retour (envoi de l'image, accusé du téléphone) au-delà duquel on allège, et en deçà duquel on peut remonter. */
export const MIRROR_RTT_SLOW = 400;
export const MIRROR_RTT_FAST = 150;
/** Accusés rapides de suite avant de remonter d'un niveau. */
export const MIRROR_RISE_AFTER = 6;

export interface MirrorPace {
  level: number;
  fast: number;
}

/**
 * Adaptation à la liaison, à chaque accusé : une liaison lente descend d'un niveau (image plus
 * petite, JPEG plus léger), une liaison nettement rapide et stable remonte d'un niveau. `intervalMs` :
 * délai minimum entre deux captures (8 images par seconde au mieux, 4 au pire).
 */
export function mirrorAdapt(pace: MirrorPace, rttMs: number): MirrorPace & { intervalMs: number } {
  let { level, fast } = pace;
  const last = MIRROR_LEVELS.length - 1;
  if (rttMs > MIRROR_RTT_SLOW) {
    level = Math.min(last, level + 1);
    fast = 0;
  } else if (rttMs < MIRROR_RTT_FAST) {
    fast++;
    if (fast >= MIRROR_RISE_AFTER && level > 0) {
      level--;
      fast = 0;
    }
  } else fast = 0;
  return { level, fast, intervalMs: rttMs > 250 || level >= 2 ? MIRROR_SLOW_MS : MIRROR_FAST_MS };
}

/**
 * Molette pour un glissement du doigt de (dx, dy) fractions de l'image : la page suit le doigt, du
 * même nombre de pixels de la fenêtre que l'image en montre sous lui. Au sens de la molette
 * d'Electron et de Windows (un delta positif remonte la page : le doigt qui descend la fait descendre).
 */
export function mirrorWheel(rect: Pick<MirrorRect, 'width' | 'height'>, dx: number, dy: number): { deltaX: number; deltaY: number } {
  return { deltaX: Math.round(dx * Math.max(1, rect.width)), deltaY: Math.round(dy * Math.max(1, rect.height)) };
}
