// Couche Windows simulée pour le gardien des barres des tâches (taskbarguard.test.ts,
// docs\demo-barre-dessus.cjs) : la pile des fenêtres et la règle de l'Explorateur pour ses barres.
//
// La règle, telle qu'on la voit sur les bornes et le PC de développement :
// - une fenêtre qui prend le premier plan et couvre tout son écran (plein écran) fait passer la
//   barre de CET écran derrière tout ; les barres des autres écrans ne bougent pas ;
// - une fenêtre qui prend le premier plan sans couvrir son écran (VPX avant son plein écran, un
//   programme ordinaire, le menu Démarrer) fait repasser toutes les barres devant, en premier
//   plan permanent, masquées comprises (elles reviennent ainsi à leur réaffichage) ;
// - un changement de zone de travail ou d'écrans fait aussi repasser les barres devant.

import type { CoverRect, StackedWindow } from '../screencover';
import type { TaskbarLayer } from '../taskbarguard';

export interface SimWindow extends StackedWindow {
  handle: bigint;
  visible: boolean;
  topmost: boolean;
}

export interface SimScreen {
  name: string;
  rect: CoverRect;
}

function contains(outer: CoverRect, inner: CoverRect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}

function centerIn(r: CoverRect, d: CoverRect): boolean {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height;
}

export class SimulatedExplorer {
  /** Toutes les fenêtres de premier niveau, la plus haute d'abord. */
  windows: SimWindow[] = [];
  focused: SimWindow | undefined;
  /** Vrai : l'Explorateur remet aussitôt devant une barre qu'un autre a rangée (essai du masquage). */
  stubborn = false;
  calls: string[] = [];
  private next = 1000n;
  private clock = 0;

  constructor(readonly screens: SimScreen[]) {
    // Une barre par écran, en bas, devant tout : celle de l'écran principal, puis les autres.
    screens.forEach((s, i) =>
      this.windows.push(this.make(4, i === 0 ? 'Shell_TrayWnd' : 'Shell_SecondaryTrayWnd', '', { x: s.rect.x, y: s.rect.y + s.rect.height - 48, width: s.rect.width, height: 48 }, true)),
    );
  }

  private make(pid: number, className: string, title: string, rect: CoverRect, topmost = false): SimWindow {
    return { pid, className, title, rect, minimized: false, handle: this.next++, visible: true, topmost };
  }

  taskbars(): SimWindow[] {
    return this.windows.filter((w) => w.className === 'Shell_TrayWnd' || w.className === 'Shell_SecondaryTrayWnd');
  }

  taskbarOf(screen: string): SimWindow {
    const s = this.screens.find((x) => x.name === screen)!;
    return this.taskbars().find((t) => centerIn(t.rect, s.rect))!;
  }

  private screenOf(w: SimWindow): SimScreen | undefined {
    return this.screens.find((s) => centerIn(w.rect, s.rect));
  }

  /** Ouvre une fenêtre au sommet des fenêtres ordinaires, sans l'activer (masquée si `visible` est faux). */
  open(pid: number, title: string, rect: CoverRect, visible = true): SimWindow {
    const w = this.make(pid, 'Chrome_WidgetWin_1', title, rect);
    w.visible = visible;
    this.windows.splice(this.windows.filter((x) => x.topmost).length, 0, w);
    return w;
  }

  close(w: SimWindow): void {
    this.windows = this.windows.filter((x) => x !== w);
    // Windows donne le premier plan à la fenêtre suivante : souvent la barre des tâches.
    if (this.focused === w) this.focused = this.windows.find((x) => x.visible);
  }

  /** Premier plan donné à `w` (SetForegroundWindow réussi) : la règle de l'Explorateur s'applique. */
  activate(w: SimWindow): void {
    this.focused = w;
    w.visible = true;
    this.toTop(w);
    const screen = this.screenOf(w);
    if (screen && contains(w.rect, screen.rect) && !(w.className === 'Shell_TrayWnd' || w.className === 'Shell_SecondaryTrayWnd')) {
      const bar = this.taskbarOf(screen.name);
      bar.topmost = false;
      this.windows = [...this.windows.filter((x) => x !== bar), bar];
    } else {
      this.raiseTaskbars();
    }
  }

  /** Zone de travail ou écrans changés : l'Explorateur replace ses barres, devant tout. */
  workAreaChanged(): void {
    this.raiseTaskbars();
  }

  private raiseTaskbars(): void {
    for (const bar of this.taskbars()) {
      bar.topmost = true;
      this.windows = [bar, ...this.windows.filter((x) => x !== bar)];
    }
  }

  private toTop(w: SimWindow): void {
    const rest = this.windows.filter((x) => x !== w);
    const at = w.topmost ? 0 : rest.filter((x) => x.topmost).length;
    rest.splice(at, 0, w);
    this.windows = rest;
  }

  hide(w: SimWindow): void {
    w.visible = false;
  }

  /** ShowWindow(SW_SHOWNA) : réaffichée là où elle est dans la pile, sans activation. */
  showInactive(w: SimWindow): void {
    w.visible = true;
  }

  /** SetWindowPos(w, after) : juste sous `after` ; sous une fenêtre ordinaire, w perd son premier plan permanent. */
  placeBelow(w: SimWindow, after: SimWindow): void {
    this.calls.push(`placeBelow ${w.className} ${after.title}`);
    const rest = this.windows.filter((x) => x !== w);
    rest.splice(rest.indexOf(after) + 1, 0, w);
    this.windows = rest;
    w.topmost = after.topmost;
    if (this.stubborn) this.raiseTaskbars();
  }

  tick(ms: number): void {
    this.clock += ms;
  }

  /** Couche du gardien sur ce Windows simulé. */
  layer(onHide?: (w: SimWindow) => void): TaskbarLayer<SimWindow> {
    return {
      stack: () => this.windows.filter((w) => w.visible),
      foreground: () => this.focused,
      placeBelow: (t, u) => this.placeBelow(t, u),
      hide: (t) => {
        this.calls.push(`hide ${t.className}`);
        this.hide(t);
        onHide?.(t);
        return true;
      },
      now: () => this.clock,
    };
  }
}
