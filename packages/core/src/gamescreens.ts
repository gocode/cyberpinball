// Écrans de la borne pendant une partie, quel que soit le jeu (VPX, Pinball FX, Pinball FX3,
// Future Pinball) : chaque fenêtre du front-end reste sur l'écran de son rôle, et un écran où le
// jeu dessine lui-même lui est laissé. Tout se décide ici, sans Electron ; app/src/game-screens.ts
// l'applique aux fenêtres.
//
// Cas d'origine (borne de référence, 19/11/2026) : Pinball FX3 ouvert en plein écran exclusif
// 1920 × 1080 sur un playfield 4K. Windows change la définition du playfield et redispose les
// écrans (le DMD passe de x = 3840 à x = 1920, le fronton de 5760 à 3840). Les fenêtres du
// front-end restées à leurs anciennes coordonnées tombent sur l'écran voisin : le plateau, tourné
// pour le playfield, s'affichait de travers sur l'écran du DMD, et la carte du DMD sur le fronton.

import type { ObservedDisplay, RoleId } from './model';
import { ROLES } from './model';
import { OCCUPIED_SHARE, type RoleRect } from './menumoments';
import { TASKBAR_CLASSES, type CoverRect, type StackedWindow } from './screencover';
import { sameDisplay, zoneRect, type ScreenSurface } from './zones';

/**
 * Zone de chaque rôle à l'écran, en pixels physiques, d'après les fenêtres du front-end (une par
 * écran, screenSurfaces) : tout l'écran pour le playfield, la part de sa zone pour les autres.
 */
export function surfaceRoleRects(surfaces: readonly ScreenSurface[]): RoleRect[] {
  return surfaces.flatMap((s) => {
    const d = s.display.bounds;
    const own = s.role === 'playfield' ? [{ role: s.role, rect: { ...d } }] : [];
    const parts = s.parts.map((p) => {
      const r = zoneRect(p.zone, d);
      return { role: p.role as RoleId, rect: { x: d.x + r.x, y: d.y + r.y, width: r.width, height: r.height } };
    });
    return [...own, ...parts];
  });
}

/** Écran de chaque rôle (assignations du front-end). */
export type RoleDisplays = Partial<Record<RoleId, ObservedDisplay>>;

/** Un rôle dont l'écran a changé de place, de taille ou de sens. */
export interface FollowedRole {
  role: RoleId;
  from: ObservedDisplay;
  to: ObservedDisplay;
}

function sameGeometry(a: ObservedDisplay, b: ObservedDisplay): boolean {
  return a.bounds.x === b.bounds.x && a.bounds.y === b.bounds.y && a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height && a.rotation === b.rotation;
}

/**
 * Écran de chaque rôle après un changement d'écrans (définition changée par un jeu, écran
 * rebranché, rotation) : le même écran physique, reconnu à son chemin d'interface (devicePath,
 * sinon son nom GDI : sameDisplay), à sa nouvelle place. Jamais un autre écran : un rôle dont
 * l'écran n'est plus là garde l'ancien (Windows le ramènera, et la reprise des fenêtres avec lui).
 * `moved` : les rôles dont l'écran a bougé, changé de taille ou de sens.
 */
export function followDisplays(assignments: RoleDisplays, observed: readonly ObservedDisplay[]): { assignments: RoleDisplays; moved: FollowedRole[] } {
  const next: RoleDisplays = {};
  const moved: FollowedRole[] = [];
  for (const { id } of ROLES) {
    const from = assignments[id];
    if (!from) continue;
    const to = observed.find((d) => sameDisplay(d, from));
    next[id] = to ?? from;
    if (to && !sameGeometry(from, to)) moved.push({ role: id, from, to });
  }
  return { assignments: next, moved };
}

/**
 * Rôles dont l'écran n'est plus celui que la fenêtre couvre : la fenêtre du rôle (`windows`, son
 * rectangle en pixels physiques) tombée sur un autre écran que le sien. Rend, pour chacun, l'écran
 * où elle est (celui qui en porte la plus grande part), pour le journal ; c'est ce qui montrait le
 * plateau sur l'écran du DMD. Un rôle dont l'écran n'est pas branché n'est pas compté : sa fenêtre
 * attend son retour là où Windows l'a mise.
 */
export function misplacedWindows(assignments: RoleDisplays, windows: Partial<Record<RoleId, CoverRect>>, observed: readonly ObservedDisplay[]): { role: RoleId; on?: ObservedDisplay }[] {
  const out: { role: RoleId; on?: ObservedDisplay }[] = [];
  for (const { id } of ROLES) {
    const rect = windows[id];
    const own = assignments[id];
    if (!rect || !own || !observed.some((d) => sameDisplay(d, own))) continue;
    let best: { display: ObservedDisplay; area: number } | undefined;
    for (const d of observed) {
      const area = overlapArea(rect, d.bounds);
      if (area > 0 && (!best || area > best.area)) best = { display: d, area };
    }
    if (!best || !sameDisplay(best.display, own)) out.push({ role: id, ...(best ? { on: best.display } : {}) });
  }
  return out;
}

function overlapArea(a: CoverRect, b: CoverRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Part de la zone d'un rôle qu'une fenêtre du front-end doit couvrir, devant une fenêtre du jeu, pour être
 * passée derrière lui. Plus 0,99 (20/11/2026) : au passage du jeu en plein écran, Windows déplace des
 * écrans, et une fenêtre du front-end décalée de 11 pixels (98,98 % du fronton) restait devant le fronton
 * de Future Pinball toute la partie, l'image du chargement à la place de celle du jeu. La moitié suffit :
 * une notification, petite, reste devant.
 */
export const HIDING_SHARE = 0.5;

/** Une fenêtre du front-end posée devant une fenêtre du jeu qui dessine sur la zone d'un rôle. */
export interface HiddenGameWindow<W extends StackedWindow = StackedWindow> {
  role: RoleId;
  /** Fenêtre du jeu (fronton, DMD ou topper de son mode borne, fenêtre annexe de Future Pinball). */
  game: W;
  /** Fenêtres du front-end qui la cachent, de la plus basse à la plus haute. */
  ours: W[];
}

/**
 * Écrans d'une partie d'un jeu autre que VPX (Pinball FX, Pinball FX3, Future Pinball) : seules les
 * fenêtres des processus du jeu (`gamePids`) comptent, jamais celles du shell de Windows (« Expérience
 * d'entrée Windows », plein écran et au premier plan permanent, posées en 0, 0 : après un changement
 * de définition, elles couvrent l'écran voisin) ni d'un autre programme.
 * - `occupied` : rôles dont la zone est couverte, pour au moins OCCUPIED_SHARE, par une fenêtre visible
 *   du jeu, devant ou derrière celles du front-end ; leur fond de partie reste figé (momentScreen).
 * - `hidden` : celles de ces fenêtres que le front-end cache (une de ses fenêtres couvre au moins
 *   HIDING_SHARE de la zone au-dessus d'elle) ; elles sont à repasser devant (app/src/game-screens.ts),
 *   sans premier plan.
 */
export function gameScreens<W extends StackedWindow>(zones: readonly RoleRect[], stack: readonly W[], ownPid: number, gamePids: readonly number[]): { occupied: RoleId[]; hidden: HiddenGameWindow<W>[] } {
  const occupied: RoleId[] = [];
  const hidden: HiddenGameWindow<W>[] = [];
  const counts = (w: W) => !w.minimized && !(TASKBAR_CLASSES as readonly string[]).includes(w.className);
  for (const zone of zones) {
    const area = zone.rect.width * zone.rect.height;
    if (area <= 0) continue;
    const share = (w: W) => overlapArea(w.rect, zone.rect) / area;
    const index = stack.findIndex((w) => counts(w) && gamePids.includes(w.pid) && share(w) >= OCCUPIED_SHARE);
    if (index < 0) continue;
    occupied.push(zone.role);
    const ours = stack.slice(0, index).filter((w) => counts(w) && w.pid === ownPid && share(w) >= HIDING_SHARE);
    if (ours.length) hidden.push({ role: zone.role, game: stack[index]!, ours: ours.reverse() });
  }
  return { occupied, hidden };
}
