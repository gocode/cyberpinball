// Écrans couverts : sur une borne, aucun écran ne doit jamais montrer le bureau Windows
// ni sa barre des tâches, du démarrage du menu à la fin d'une partie. Le gardien des
// écrans (app/src/screen-guard.ts) relit régulièrement les fenêtres de premier niveau,
// de la plus haute à la plus basse, et demande ici ce que chaque écran montre.

export interface CoverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fenêtre visible, telle que Windows l'empile (EnumWindows : la plus haute d'abord). */
export interface StackedWindow {
  pid: number;
  className: string;
  title: string;
  /** Rectangle en pixels physiques. */
  rect: CoverRect;
  minimized: boolean;
}

/** Barre des tâches de Windows : celle de l'écran principal, puis celle de chaque autre écran. */
export const TASKBAR_CLASSES = ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd'] as const;

export type ScreenCover =
  /** Une fenêtre de Cyber Pinball (ou d'un processus qui couvre pour lui) recouvre tout l'écran. */
  | { state: 'covered'; by: StackedWindow }
  /** La barre des tâches passe devant la fenêtre qui couvre l'écran. */
  | { state: 'taskbar' }
  /** Aucune fenêtre ne couvre l'écran : le bureau se voit. */
  | { state: 'uncovered' };

function contains(outer: CoverRect, inner: CoverRect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}

function intersects(a: CoverRect, b: CoverRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Ce que montre l'écran `display` : on descend la pile des fenêtres jusqu'à la première
 * qui le couvre entièrement et appartient à l'un des processus `coverPids`. Une barre des
 * tâches rencontrée avant elle sur cet écran reste visible ; sans fenêtre couvrante, le
 * bureau se voit. Les fenêtres des autres programmes ne couvrent rien : seules celles de
 * Cyber Pinball (et de VPX qu'il a lancé) sont maîtrisées.
 */
export function screenCover(display: CoverRect, stack: StackedWindow[], coverPids: number[]): ScreenCover {
  for (const w of stack) {
    if (w.minimized) continue;
    if ((TASKBAR_CLASSES as readonly string[]).includes(w.className) && intersects(w.rect, display)) return { state: 'taskbar' };
    if (coverPids.includes(w.pid) && contains(w.rect, display)) return { state: 'covered', by: w };
  }
  return { state: 'uncovered' };
}

/**
 * Mode bureau (menu système > « Bureau Windows ») : l'inverse. Aucune fenêtre des processus
 * `pids` ne doit plus rien recouvrir de l'écran `display` ; rend celles qui le font encore.
 */
export function desktopBlockers(display: CoverRect, stack: StackedWindow[], pids: number[]): StackedWindow[] {
  return stack.filter((w) => !w.minimized && pids.includes(w.pid) && intersects(w.rect, display));
}

/** Constat en clair pour la console ; undefined si l'écran est couvert. */
export function coverNotice(cover: ScreenCover): string | undefined {
  if (cover.state === 'taskbar') return 'la barre des tâches de Windows passe devant'; // i18n-ignore : constat pour la console
  if (cover.state === 'uncovered') return 'aucune fenêtre de Cyber Pinball ne le couvre, le bureau Windows se voit'; // i18n-ignore : constat pour la console
  return undefined;
}
