// Barres des tâches de Windows devant les écrans de la borne (signalement du 29/10/2026 : par
// moments, au retour d'une partie, la barre des tâches restait devant le DMD, parfois devant le
// playfield).
//
// La règle de l'Explorateur : la barre des tâches d'un écran passe derrière une fenêtre plein
// écran seulement quand cette fenêtre devient le premier plan (fenêtre « rude ») ; elle
// repasse devant dès qu'une autre fenêtre prend le premier plan, et à chaque fois qu'on la
// réaffiche. Au démarrage, chaque fenêtre du menu prend le premier plan en apparaissant : chaque
// barre passe derrière la sienne. Après une partie, les barres masquées pendant le jeu
// (screen-guard.ts) reviennent au-dessus de tout, et seul le playfield reprend le premier plan :
// le DMD et le fronton ne l'ont jamais, leur barre reste devant. Le playfield aussi, quand
// l'Explorateur réaffiche sa barre après que le playfield a repris la main, ou que Windows
// lui refuse le premier plan.
//
// Le gardien des barres ne compte donc pas sur cette règle : à chaque bascule (retour de partie,
// retour du bureau, changement d'écrans ou de zone de travail, premier plan rendu au menu) et à
// chaque relecture du gardien des écrans, une barre trouvée devant une fenêtre de Cyber Pinball
// est rangée juste sous elle (SetWindowPos, sans rien activer). Jamais pendant qu'un autre
// programme a le premier plan (VPX en partie, menu Démarrer) : le premier plan n'est jamais pris
// à personne. Une barre que Windows remet devant aussitôt, plusieurs fois de suite, est masquée
// comme pendant une partie, jusqu'au mode bureau ou à la fermeture.

import { t } from './i18n';
import { coveringWindow, displayOf, isTaskbar, screenCover, type CoverRect, type StackedWindow } from './screencover';

/** Bascules où le gardien des barres passe, et où le journal des écrans note la pile des fenêtres. */
export const TASKBAR_MOMENTS = ['start', 'game', 'vpx', 'return', 'desktop', 'desktop-back', 'displays', 'focus', 'watch'] as const;
export type TaskbarMoment = (typeof TASKBAR_MOMENTS)[number];

export function taskbarMomentLabel(moment: TaskbarMoment): string {
  switch (moment) {
    case 'start':
      return t('démarrage du menu');
    case 'game':
      return t('début d’une partie');
    case 'vpx':
      return t('partie en cours');
    case 'return':
      return t('retour d’une partie');
    case 'desktop':
      return t('passage au bureau Windows');
    case 'desktop-back':
      return t('retour du bureau Windows');
    case 'displays':
      return t('changement d’écrans ou de zone de travail');
    case 'focus':
      return t('premier plan rendu au menu');
    case 'watch':
      return t('relecture du gardien des écrans');
  }
}

/** Écran de la borne vu par le gardien : son rôle et son rectangle en pixels physiques. */
export interface GuardScreen {
  name: string;
  rect: CoverRect;
}

/** Ce que le gardien demande à Windows (app/src/screen-guard.ts) ; simulé par les tests. */
export interface TaskbarLayer<W extends StackedWindow = StackedWindow> {
  /** Fenêtres visibles, la plus haute d'abord. */
  stack(): W[];
  /** Fenêtre au premier plan (GetForegroundWindow). */
  foreground(): W | undefined;
  /** Range `taskbar` juste sous `under`, sans rien activer ni déplacer. */
  placeBelow(taskbar: W, under: W): void;
  /** Masque `taskbar` comme pendant une partie ; faux si c'est impossible (témoin non écrit). */
  hide(taskbar: W): boolean;
  now(): number;
}

/** Ce qu'un passage du gardien a fait sur un écran. */
export interface TaskbarRepair {
  screen: string;
  moment: TaskbarMoment;
  /** Barre rangée sous la fenêtre du menu, ou masquée (Windows la remettait devant). */
  action: 'placed' | 'hidden';
  taskbar: StackedWindow;
  under: StackedWindow;
  /**
   * Relue juste après : la barre ne passe plus devant. Sur la borne, la demande à l'Explorateur
   * est postée (SWP_ASYNCWINDOWPOS) : une barre encore devant à cette relecture peut ne pas
   * l'être un instant plus tard ; la relecture suivante du gardien le dit.
   */
  held: boolean;
}

/** Ce que « Santé de la borne » montre de la session (packages/core/src/health.ts). */
export interface TaskbarFacts {
  /** Barres remises derrière depuis le démarrage. */
  repaired: number;
  /** Écrans dont la barre a dû être masquée : Windows la remettait sans cesse devant. */
  hidden: string[];
  /** Dernière remise en place. */
  last?: { screen: string; moment: TaskbarMoment; at: string };
}

/** Remises en place d'une même barre au-delà desquelles elle est masquée… */
export const TASKBAR_REPAIRS_BEFORE_HIDE = 5;
/** … si elles tiennent dans ce délai : Windows la remet devant aussitôt. */
export const TASKBAR_REPAIR_WINDOW_MS = 10_000;

/**
 * Fenêtres au premier plan qui laissent le gardien agir : Cyber Pinball, le bureau ou la barre
 * des tâches elle-même (la fenêtre de VPX fermée, Windows donne souvent le premier plan à la
 * barre), ou personne. Toute autre (VPX, menu Démarrer, un programme ouvert par-dessus) le
 * suspend : la barre qui va avec reste devant, comme Windows le veut.
 */
const IDLE_SHELL_CLASSES = ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Progman', 'WorkerW'];

export function guardMayAct(foreground: StackedWindow | undefined, pids: number[]): boolean {
  return !foreground || pids.includes(foreground.pid) || IDLE_SHELL_CLASSES.includes(foreground.className);
}

export class TaskbarGuard<W extends StackedWindow = StackedWindow> {
  private repaired = 0;
  private last: TaskbarFacts['last'];
  private readonly hiddenScreens = new Set<string>();
  /** Instants des dernières remises en place, par barre (HWND, ou classe et rectangle). */
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly layer: TaskbarLayer<W>,
    private readonly pids: number[],
  ) {}

  /**
   * Toute barre des tâches qui passe devant la fenêtre de Cyber Pinball de son écran est rangée
   * sous elle ; rend ce qui a été fait (rien si un autre programme a le premier plan).
   */
  check(screens: GuardScreen[], moment: TaskbarMoment): TaskbarRepair[] {
    if (!guardMayAct(this.layer.foreground(), this.pids)) return [];
    const done: { screen: GuardScreen; action: TaskbarRepair['action']; taskbar: W; under: W }[] = [];
    const stack = this.layer.stack();
    for (const screen of screens) {
      const cover = screenCover(screen.rect, stack, this.pids);
      if (cover.state !== 'taskbar' || !cover.under) continue;
      const taskbar = cover.taskbar as W;
      const under = cover.under as W;
      // Une barre à cheval sur deux écrans n'est rangée qu'une fois, sous la fenêtre de son écran.
      if (done.some((d) => sameWindow(d.taskbar, taskbar))) continue;
      const own = displayOf(taskbar.rect, screens.map((s) => s.rect));
      if (own && own !== screen.rect && coveringWindow(own, stack, this.pids)) continue;
      const key = keyOf(taskbar);
      const now = this.layer.now();
      const times = (this.recent.get(key) ?? []).filter((at) => now - at < TASKBAR_REPAIR_WINDOW_MS);
      const hide = times.length >= TASKBAR_REPAIRS_BEFORE_HIDE && this.layer.hide(taskbar);
      if (!hide) this.layer.placeBelow(taskbar, under);
      this.recent.set(key, [...times, now]);
      done.push({ screen, action: hide ? 'hidden' : 'placed', taskbar, under });
    }
    if (!done.length) return [];
    const after = this.layer.stack();
    const at = new Date(this.layer.now()).toISOString();
    return done.map(({ screen, action, taskbar, under }) => {
      this.repaired++;
      this.last = { screen: screen.name, moment, at };
      if (action === 'hidden') this.hiddenScreens.add(screen.name);
      const held = screenCover(screen.rect, after, this.pids).state !== 'taskbar';
      return { screen: screen.name, moment, action, taskbar, under, held };
    });
  }

  facts(): TaskbarFacts {
    return { repaired: this.repaired, hidden: [...this.hiddenScreens], ...(this.last && { last: this.last }) };
  }

  /** Mode bureau : les barres masquées sont rendues, la série de remises en place repart de zéro. */
  forget(): void {
    this.recent.clear();
  }
}

function sameWindow(a: StackedWindow, b: StackedWindow): boolean {
  return keyOf(a) === keyOf(b);
}

function keyOf(w: StackedWindow): string {
  return w.handle !== undefined ? String(w.handle) : `${w.className} ${w.rect.x},${w.rect.y}`;
}

/** Constat d'une remise en place, pour la console et le journal des écrans. */
export function repairNotice(r: TaskbarRepair): string {
  const what = r.action === 'hidden' ? 'remise devant sans cesse par Windows, masquée' : 'remise derrière'; // i18n-ignore : journal
  return `Barre des tâches (${r.taskbar.className}) devant « ${r.under.title || r.under.className} » sur l’écran « ${r.screen} » (${taskbarMomentLabel(r.moment)}) : ${what}.`; // i18n-ignore : journal
}

// ---------- Journal des écrans ----------

/** Fichier du journal des bascules, dans <données>\logs. */
export const SCREENS_LOG_FILE = 'ecrans.txt';

function where(r: CoverRect): string {
  return `${r.width} × ${r.height} en ${r.x}, ${r.y}`;
}

function describeWindow(w: StackedWindow): string {
  const flags = [w.className, `pid ${w.pid}`, ...(w.handle !== undefined ? [`HWND ${w.handle}`] : []), ...(w.topmost ? ['premier plan permanent'] : [])]; // i18n-ignore : journal
  return `${w.title ? `« ${w.title} »` : 'sans titre'} (${flags.join(', ')})`; // i18n-ignore : journal
}

/**
 * Entrée du journal des écrans à une bascule : le premier plan de Windows, puis, pour chaque
 * écran de la borne, la fenêtre de Cyber Pinball qui le couvre et tout ce qui est au-dessus
 * d'elle sur cet écran (ordre de Windows, la plus haute d'abord), puis chaque barre des tâches,
 * visible ou masquée, avec son rectangle. La prochaine fois qu'une barre passe devant, le
 * journal dit laquelle, au-dessus de quoi, et qui avait le premier plan.
 */
export function stackingReport(
  moment: TaskbarMoment,
  screens: GuardScreen[],
  stack: StackedWindow[],
  foreground: StackedWindow | undefined,
  taskbars: (StackedWindow & { visible: boolean })[],
  pids: number[],
  at = new Date(),
): string {
  const lines = [`${at.toISOString()} ${taskbarMomentLabel(moment)}`, `premier plan : ${foreground ? describeWindow(foreground) : 'aucun'}`]; // i18n-ignore : journal
  for (const screen of screens) {
    const under = coveringWindow(screen.rect, stack, pids);
    const index = under ? stack.indexOf(under) : stack.length;
    const above = stack.slice(0, index).filter((w) => !w.minimized && intersects(w.rect, screen.rect));
    const cover = screenCover(screen.rect, stack, pids);
    const state = cover.state === 'covered' ? 'couvert' : cover.state === 'taskbar' ? 'BARRE DES TÂCHES DEVANT' : 'DÉCOUVERT'; // i18n-ignore : journal
    lines.push(`écran « ${screen.name} » (${where(screen.rect)}) : ${state} ; sous ${under ? describeWindow(under) : 'aucune fenêtre de Cyber Pinball'}`); // i18n-ignore : journal
    for (const w of above) lines.push(`  au-dessus : ${describeWindow(w)}, ${where(w.rect)}${isTaskbar(w) ? ' [barre des tâches]' : ''}`); // i18n-ignore : journal
  }
  for (const t of taskbars) lines.push(`barre ${t.className}${t.handle !== undefined ? ` HWND ${t.handle}` : ''} : ${where(t.rect)}, ${t.visible ? 'visible' : 'masquée'}${t.topmost ? ', premier plan permanent' : ''}`); // i18n-ignore : journal
  return `${lines.join('\n')}\n\n`;
}

function intersects(a: CoverRect, b: CoverRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
