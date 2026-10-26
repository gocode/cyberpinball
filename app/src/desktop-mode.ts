// Mode bureau (menu système > « Borne » > « Bureau Windows », ou son raccourci) : tous les écrans du PC
// redeviennent utilisables comme sans Cyber Pinball, quel que soit leur nombre.
//
// Signalement du 26/10/2026 : en mode bureau, souvent un seul écran revenait. Seules les
// fenêtres du menu étaient réduites ; les voiles noirs du gardien des écrans (un par écran,
// sans bouton dans la barre des tâches, screen-guard.ts) restaient en plein écran derrière
// elles et cachaient le bureau et la barre des tâches de chaque écran, sauf là où une autre
// fenêtre passait devant. Désormais chaque fenêtre de l'application quitte son écran,
// quelle qu'elle soit (menu, voiles, navigateur intégré, réglages, et toute fenêtre à venir),
// et y revient au retour, les voiles d'abord.
//
// Sans electron à l'exécution : le module est aussi chargé par les tests du cœur, avec des
// fenêtres simulées.

/** Ce que le mode bureau lit d'une fenêtre de l'application (BrowserWindow). */
export interface DesktopWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
}

export interface DesktopModeOptions<W extends DesktopWindow> {
  /** Toutes les fenêtres de l'application (BrowserWindow.getAllWindows) : aucune n'est oubliée. */
  windows(): W[];
  /** Fenêtre affichée (isShown d'offscreen.ts). */
  isShown(win: W): boolean;
  /** Voile noir du gardien des écrans : caché, puisqu'il n'a ni bouton dans la barre des tâches ni focus. */
  isVeil(win: W): boolean;
  /** Cache un voile (hideCovered de cover-display.ts). */
  hideVeil(win: W): void;
  /** Remontre un voile, sans focus ; il reprend alors son plein écran (coverDisplay). */
  showVeil(win: W): void;
  /** Réduit une autre fenêtre (minimizeCovered) : le bouton du playfield dans la barre des tâches rouvre le menu. */
  minimizeWindow(win: W): void;
  /** Rouvre une fenêtre réduite. */
  restoreWindow(win: W): void;
  /** Remet une fenêtre devant les autres, sans focus (moveTop) : un voile remontré passe devant les fenêtres déjà rouvertes. */
  raiseWindow(win: W): void;
}

export class DesktopMode<W extends DesktopWindow> {
  /** Fenêtres rangées par le mode bureau, à remettre au retour. */
  private readonly away = new Set<W>();
  private on = false;

  constructor(private readonly options: DesktopModeOptions<W>) {}

  get active(): boolean {
    return this.on;
  }

  /** Passe au bureau : chaque fenêtre affichée de l'application quitte son écran ; rend celles qui l'ont quitté. */
  enter(): W[] {
    this.on = true;
    return this.clear();
  }

  /**
   * Au bureau, range toute fenêtre de l'application revenue sur un écran (voile d'un écran
   * branché entre-temps, fenêtre ouverte depuis) ; rend celles qu'il a fallu ranger.
   */
  clear(): W[] {
    if (!this.on) return [];
    const left: W[] = [];
    for (const win of this.options.windows()) {
      if (!this.onScreen(win)) continue;
      left.push(win);
      if (this.options.isVeil(win)) this.options.hideVeil(win);
      else this.options.minimizeWindow(win);
      this.away.add(win);
    }
    return left;
  }

  /**
   * Vrai si l'utilisateur a rouvert une fenêtre rangée (bouton de la barre des tâches, Alt+Tab) :
   * le menu doit revenir sur tous ses écrans. Un voile ne se rouvre pas de lui-même.
   */
  reopened(): boolean {
    return this.on && [...this.away].some((win) => !this.options.isVeil(win) && this.onScreen(win));
  }

  /**
   * Retour au menu : les voiles d'abord (chaque écran est noir avant que sa fenêtre revienne),
   * puis les fenêtres rangées, remises devant les voiles, y compris celle que l'utilisateur a rouverte.
   */
  leave(): void {
    if (!this.on) return;
    this.on = false;
    const away = [...this.away].filter((win) => !win.isDestroyed());
    this.away.clear();
    for (const win of away) if (this.options.isVeil(win) && !this.options.isShown(win)) this.options.showVeil(win);
    for (const win of away) {
      if (this.options.isVeil(win)) continue;
      if (win.isMinimized()) this.options.restoreWindow(win);
      this.options.raiseWindow(win);
    }
  }

  /** Fenêtre affichée sur un écran : ni détruite, ni cachée, ni réduite. */
  private onScreen(win: W): boolean {
    return !win.isDestroyed() && this.options.isShown(win) && !win.isMinimized();
  }
}
