// Écran de la fenêtre « Récupérer » d'après les écrans du menu : le calcul est dans le cœur
// (packages/core/src/browser-screen.ts) ; ici, les écrans des rôles passent en coordonnées
// Electron. Partagé par le menu (frontend.ts) et la démonstration hors écran.

import type { Rectangle } from 'electron';
import { browserScreenNotice, pickBrowserScreen, type ObservedDisplay, type RoleId, type Rotation } from '@cyberpinball/core';
import { windowRect } from './offscreen';

/**
 * Écran du rôle choisi (`wanted`), sinon automatique, parmi les écrans de la borne
 * (`assignments`, rôle -> écran observé) ; deux rôles d'un même écran (fronton et DMD) en
 * ont le même rectangle. Sans écran de la borne (configuration à choisir), `fallback` :
 * les fenêtres du menu, et la règle automatique.
 */
export function browserScreenFor(
  assignments: Partial<Record<RoleId, ObservedDisplay>>,
  rotation: Rotation,
  wanted: RoleId | undefined,
  fallback: () => { role: RoleId; bounds: Rectangle }[],
): { bounds: Rectangle; notice?: string } | undefined {
  const rects = new Map<ObservedDisplay, Rectangle>();
  const rectOf = (d: ObservedDisplay) => rects.get(d) ?? rects.set(d, windowRect(d.bounds)).get(d)!;
  const assigned = (Object.entries(assignments) as [RoleId, ObservedDisplay][]).map(([role, d]) => ({ role, bounds: rectOf(d) }));
  const pick = assigned.length ? pickBrowserScreen(assigned, rotation, wanted) : pickBrowserScreen(fallback(), rotation, undefined);
  return pick && { bounds: pick.bounds, notice: browserScreenNotice(pick) };
}
