// Fenêtres de Cyber Pinball : chacune couvre tout son écran, barre des tâches comprise.
import type { BrowserWindow, Rectangle } from 'electron';
import { offscreenMode } from '@cyberpinball/core';

// Sans electron à l'exécution : le module est aussi chargé par les tests du cœur.
const OFFSCREEN = offscreenMode(process.env);

/**
 * Fait couvrir à `win` tout l'écran de `bounds` (coordonnées Electron, DIP), barre des
 * tâches de Windows comprise. Seule façon de dimensionner une fenêtre à un écran :
 * une fenêtre sans cadre simplement posée aux limites de l'écran reste sous la barre
 * des tâches (le bas de la page, et ce qu'on y clique, devient inaccessible).
 *
 * Plein écran d'Electron, sans premier plan forcé : Windows met la barre des tâches
 * derrière la fenêtre, mais VPX passe devant pendant une partie et les boîtes de
 * dialogue natives (ouvertes avec la fenêtre pour parent) restent au-dessus.
 * Appelée de nouveau quand la géométrie des écrans change (rotation) : le plein écran
 * est quitté, la fenêtre replacée, puis remise en plein écran sur son nouvel écran.
 * À chaque affichage (le menu est masqué pendant une partie, puis réaffiché) et à chaque
 * retour du bureau Windows (fenêtre réduite, puis rouverte), la fenêtre reprend tout son
 * écran si elle l'a perdu.
 *
 * Hors écran (essai sans opérateur, app/src/offscreen.ts), ni plein écran ni reprise :
 * la fenêtre prend seulement la taille de son écran, réel ou simulé, pivotement compris.
 */
export function coverDisplay(win: BrowserWindow, bounds: Rectangle): void {
  if (win.isDestroyed()) return;
  if (OFFSCREEN) {
    win.setBounds(bounds);
    return;
  }
  if (!covered.has(win)) {
    const recover = () => {
      const wanted = covered.get(win);
      if (wanted && !win.isDestroyed() && coverProblem(stateOf(win), wanted)) cover(win, wanted);
    };
    win.on('show', recover);
    win.on('restore', recover);
  }
  covered.set(win, bounds);
  cover(win, bounds);
}

/** Écran que chaque fenêtre doit couvrir (coordonnées Electron). */
const covered = new WeakMap<BrowserWindow, Rectangle>();

function cover(win: BrowserWindow, bounds: Rectangle): void {
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds(bounds);
  win.setFullScreen(true);
  const problem = coverProblem(stateOf(win), bounds);
  if (problem) console.warn(`Fenêtre « ${win.getTitle()} » : ne couvre pas son écran (${problem}).`);
}

function stateOf(win: BrowserWindow): { fullScreen: boolean; bounds: Rectangle } {
  return { fullScreen: win.isFullScreen(), bounds: win.getBounds() };
}

/** Écart entre la place prise par la fenêtre et l'écran demandé, en clair ; undefined si elle le couvre. */
export function coverProblem(state: { fullScreen: boolean; bounds: Rectangle }, wanted: Rectangle): string | undefined {
  const { bounds } = state;
  const covers = bounds.x <= wanted.x && bounds.y <= wanted.y && bounds.x + bounds.width >= wanted.x + wanted.width && bounds.y + bounds.height >= wanted.y + wanted.height;
  if (state.fullScreen && covers) return undefined;
  const where = (r: Rectangle) => `${r.width} × ${r.height} en ${r.x}, ${r.y}`;
  return `${state.fullScreen ? 'en plein écran' : 'pas en plein écran'}, ${where(bounds)} au lieu de ${where(wanted)}`;
}


/**
 * Place une vue (WebContentsView) dans sa fenêtre, sous un bandeau de `top` pixels, sur
 * toute la place restante : la page d'un site sous le bandeau de la fenêtre
 * « Récupérer ». Suit les changements de taille de la fenêtre (plein écran, rotation).
 */
export function fillBelow(win: BrowserWindow, view: { setBounds(bounds: Rectangle): void }, top: number): void {
  const place = () => {
    if (win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    view.setBounds({ x: 0, y: top, width: width!, height: Math.max(0, height! - top) });
  };
  win.on('resize', place);
  place();
}
