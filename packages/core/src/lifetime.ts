// Durée de vie de Cyber Pinball : il se ferme tout entier avec sa fenêtre, et ne tourne qu'une fois.
//
// Signalement du 08/11/2026 : fermer la fenêtre « Cyber Pinball » depuis Windows (bouton de la
// barre des tâches, Alt+F4) laissait des processus « Cyber Pinball » dans le gestionnaire des
// tâches. Seul le playfield a un bouton dans la barre des tâches ; le fronton, le DMD, le topper
// et les voiles noirs (un par écran) restaient ouverts, invisibles en mode bureau, et le
// processus avec eux. Le journal de la borne le montrait le 07/11 : mode bureau, 8 fenêtres
// rangées, puis les processus de Chromium arrêtés à la main ; et un nouveau lancement à côté de
// l'instance restée ouverte, deux bornes du même nom sur le réseau des amis.
//
// Trois règles, appliquées par app/src/app-lifetime.ts et app/src/single-instance.ts :
// - une fenêtre principale (menu, assistant) fermée depuis Windows ferme toute l'application,
//   comme la dernière fenêtre qui a un bouton dans la barre des tâches ;
// - une fermeture demandée qui n'aboutit pas (fenêtre qui refuse, sortie qui bloque) est notée
//   au journal et forcée au bout de QUIT_WATCHDOG_MS ;
// - un second lancement ne démarre pas à côté du premier : l'instance ouverte revient au premier
//   plan. Il attend un peu une instance en train de se fermer (relance de la borne dédiée,
//   double-clic juste après avoir quitté) ; une relève (relaunchCovered) démarre tout de suite
//   et prend le verrou quand l'ancien processus est sorti.

/** Une fermeture demandée est forcée si le processus vit encore au bout de ce délai. */
export const QUIT_WATCHDOG_MS = 15_000;
/** Intervalle des nouvelles demandes du verrou d'instance unique. */
export const SINGLE_INSTANCE_RETRY_MS = 500;
/** Un second lancement attend au plus ce délai qu'une instance en train de se fermer libère le verrou. */
export const SINGLE_INSTANCE_WAIT_MS = 8_000;
/** Les signaux d'un même second lancement (une demande par essai, pendant toute son attente) ne ramènent l'instance qu'une fois. */
export const SECOND_LAUNCH_DEBOUNCE_MS = SINGLE_INSTANCE_WAIT_MS + 2_000;

/** Ce qu'on sait de l'application quand une de ses fenêtres vient de se fermer. */
export interface ClosedWindowFacts {
  /** La fermeture de l'application est déjà en cours (before-quit). */
  quitting: boolean;
  /** Une relève est en cours : le nouveau processus ouvre ses fenêtres, l'ancien sort par app.exit. */
  relaunching: boolean;
  /** Fenêtre principale (une de celles du menu ou de l'assistant). */
  main: boolean;
  /** La fenêtre fermée avait un bouton dans la barre des tâches. */
  hadTaskbarButton: boolean;
  /** Fenêtres encore ouvertes qui ont un bouton dans la barre des tâches. */
  taskbarWindowsLeft: number;
}

/**
 * Pourquoi l'application doit se fermer après cette fenêtre, ou undefined : elle continue.
 * Une fermeture déjà en cours ou une relève n'en demandent pas une autre.
 */
export function quitAfterWindowClosed(facts: ClosedWindowFacts): 'main' | 'last-taskbar' | undefined {
  if (facts.quitting || facts.relaunching) return undefined;
  if (facts.main) return 'main';
  if (facts.hadTaskbarButton && facts.taskbarWindowsLeft === 0) return 'last-taskbar';
  return undefined;
}

/** Ce que fait un lancement qui n'a pas obtenu le verrou d'instance unique, au bout de `waited` ms. */
export function singleInstanceStep(opts: { relaying: boolean; waited: number }): 'start-and-retry' | 'retry' | 'give-up' {
  // Relève : l'ancien processus tient le verrou jusqu'à ce que nos fenêtres soient peintes.
  if (opts.relaying) return 'start-and-retry';
  return opts.waited < SINGLE_INSTANCE_WAIT_MS ? 'retry' : 'give-up';
}
