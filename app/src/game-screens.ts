// Écrans de la borne pendant une partie (packages/core/src/gamescreens.ts) : chaque fenêtre du
// front-end suit l'écran de son rôle quand un jeu change la définition d'un écran, et la fenêtre
// d'un jeu autre que VPX qui dessine sur un écran (mode borne de Pinball FX et de Pinball FX3,
// fenêtres annexes de Future Pinball) repasse devant celle du front-end. Rien n'est activé :
// le premier plan reste au jeu. frontend.ts n'en reçoit que le branchement.

import { screen, type BrowserWindow } from 'electron';
import {
  followDisplays,
  gameScreens,
  misplacedWindows,
  screenSurfaces,
  surfaceRoleRects,
  type ObservedDisplay,
  type RoleDisplays,
  type RoleId,
  type RoleRect,
  type ScreenZone,
  type StackedWindow,
} from '@cyberpinball/core';
import { placeWindowBelow, type WindowInfo } from '@cyberpinball/win-displays';
import { coverDisplay } from './cover-display';
import { isShown, OFFSCREEN, windowRect } from './offscreen';
import { nameScreen } from './screen-guard';

export interface FollowScreensInput {
  /** Écran de chaque rôle tel que le front-end le connaît (menuAssignments). */
  assignments: RoleDisplays;
  zones: Partial<Record<RoleId, ScreenZone>>;
  /** Fenêtre de chaque écran, par le rôle qui la nomme (openWindows). */
  windows: ReadonlyMap<RoleId, BrowserWindow>;
  /** Écrans relus maintenant (observedDisplays). */
  observed: readonly ObservedDisplay[];
  /** Nom d'un rôle dans le journal (« fronton », « DMD »…). */
  label: (role: RoleId) => string;
  log: (line: string) => void;
}

const where = (d: ObservedDisplay) => `${d.bounds.width} × ${d.bounds.height} en ${d.bounds.x}, ${d.bounds.y}`; // i18n-ignore : journal

/**
 * Écrans changés (définition, place, sens), pendant une partie comme au menu : chaque fenêtre du
 * front-end est reposée sur l'écran de son rôle, reconnu à son identité et non à ses anciennes
 * coordonnées. Une fenêtre trouvée sur l'écran d'un autre rôle est notée dans le journal. Rend les
 * nouvelles assignations et zones des rôles, ou undefined si rien n'a bougé.
 */
export function followScreens(input: FollowScreensInput): { assignments: RoleDisplays; roleRects: RoleRect[] } | undefined {
  if (OFFSCREEN) return undefined;
  const { assignments, moved } = followDisplays(input.assignments, input.observed);
  const rects: Partial<Record<RoleId, { x: number; y: number; width: number; height: number }>> = {};
  // Une fenêtre cachée ou réduite (mode bureau) n'est sur aucun écran : seules les fenêtres affichées sont vérifiées.
  for (const [role, win] of input.windows) if (isShown(win) && !win.isMinimized()) rects[role] = screen.dipToScreenRect(win, win.getBounds());
  const misplaced = misplacedWindows(assignments, rects, input.observed);
  for (const m of misplaced) {
    const own = assignments[m.role]!;
    input.log(`Écrans : la fenêtre du ${input.label(m.role)} est ${m.on ? `sur l’écran ${where(m.on)}` : 'hors de tout écran'} au lieu du sien (${where(own)}) ; reposée sur son écran.`); // i18n-ignore : journal
  }
  if (!moved.length && !misplaced.length) return undefined;
  for (const m of moved) input.log(`Écrans : l’écran du ${input.label(m.role)} est passé de ${where(m.from)} à ${where(m.to)} (définition changée par un jeu, écran rebranché ou tourné) ; sa fenêtre le suit.`); // i18n-ignore : journal
  const surfaces = screenSurfaces(assignments, input.zones);
  // Seules les fenêtres concernées sont reposées : une reprise du plein écran se verrait.
  const concerned = new Set<RoleId>([...moved.map((m) => m.role), ...misplaced.map((m) => m.role)]);
  for (const s of surfaces) {
    const win = input.windows.get(s.role);
    if (!win || win.isDestroyed() || ![s.role, ...s.parts.map((p) => p.role)].some((r) => concerned.has(r))) continue;
    const bounds = windowRect(s.display.bounds);
    coverDisplay(win, bounds);
    nameScreen(bounds, input.label(s.role));
  }
  return { assignments, roleRects: surfaceRoleRects(surfaces) };
}

/**
 * Partie d'un jeu autre que VPX : rôles que le jeu occupe (ses seules fenêtres comptent), et ses
 * fenêtres cachées par le front-end repassées devant (placeWindowBelow, sans activation ni
 * déplacement). `seen` : fenêtres du jeu déjà signalées pendant cette partie (une ligne chacune).
 */
export function watchGameWindows(input: { zones: readonly RoleRect[]; stack: readonly WindowInfo[]; ownPid: number; gamePids: readonly number[]; game: string; seen: Set<bigint>; label: (role: RoleId) => string; log: (line: string) => void }): RoleId[] {
  const { occupied, hidden } = gameScreens<WindowInfo & StackedWindow>(input.zones, input.stack, input.ownPid, input.gamePids);
  for (const h of hidden) {
    // De la plus basse à la plus haute : l'ordre des fenêtres du front-end entre elles est gardé.
    for (const ours of h.ours) placeWindowBelow(ours, h.game);
    if (input.seen.has(h.game.handle)) continue;
    input.seen.add(h.game.handle);
    input.log(`Partie : « ${h.game.title || '(sans titre)'} » de ${input.game} dessine sur le ${input.label(h.role)} ; le front-end passe derrière.`); // i18n-ignore : journal
  }
  return occupied;
}
