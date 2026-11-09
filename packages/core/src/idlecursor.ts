// Pointeur de la souris masqué quand on ne s'en sert plus : une borne se joue aux boutons,
// le pointeur resté au milieu du playfield ou du fronton gêne. Il revient dès que la souris
// bouge, et disparaît de nouveau CURSOR_IDLE_MS après son dernier mouvement.
//
// Règles :
// - toutes les pages de l'application, fenêtres et vues web (fenêtre « Récupérer » comprise),
//   présentes ou à venir : le masquage ne dépend pas de chaque feuille de style. Le 08/11/2026,
//   les réglages, le menu en partie et la fenêtre « Récupérer » gardaient le pointeur affiché
//   tant qu'il restait dessus ;
// - le mouvement se lit à la position du pointeur sur le bureau, relevée toutes les
//   CURSOR_POLL_MS : rien à prévoir dans une nouvelle fenêtre ;
// - une feuille d'origine utilisateur en !important, posée sur chaque page à son chargement,
//   masque le pointeur tant que la racine de la page porte HIDDEN_CURSOR_ATTRIBUTE : elle
//   l'emporte sur les pointeurs des pages (un bouton en cursor: pointer, une poignée en
//   nwse-resize). Le processus principal pose et retire l'attribut, dans un monde isolé (aucun
//   script de la page n'est touché, une politique de sécurité stricte ne l'empêche pas). Sans
//   l'attribut, chaque page retrouve son propre pointeur. La feuille n'est jamais retirée :
//   dans Electron 44, removeInsertedCSS la laisse en place, et le 08/11/2026 le pointeur, une
//   fois masqué, ne revenait plus ;
// - au démarrage, le pointeur est visible : il se masque après le délai, sans mouvement.

/** Délai sans mouvement de la souris avant de masquer le pointeur. */
export const CURSOR_IDLE_MS = 3000;
/** Intervalle de relevé de la position du pointeur (délai de sa réapparition au plus). */
export const CURSOR_POLL_MS = 100;
/** Attribut de la racine des pages qui masque le pointeur. */
export const HIDDEN_CURSOR_ATTRIBUTE = 'data-cyberpinball-pointeur-masque';
/** Feuille posée sur chaque page : elle masque le pointeur quand la racine porte l'attribut. */
export const HIDDEN_CURSOR_CSS = ['', ' *', ' *::before', ' *::after'].map((s) => `html[${HIDDEN_CURSOR_ATTRIBUTE}]${s}`).join(', ') + ' { cursor: none !important; }';
/** Monde isolé où l'attribut est posé, à l'écart des scripts des pages. */
export const HIDDEN_CURSOR_WORLD = 1801;

/** Script qui pose (masqué) ou retire l'attribut de la racine de la page. */
export function hiddenCursorScript(hidden: boolean): string {
  const name = JSON.stringify(HIDDEN_CURSOR_ATTRIBUTE);
  return hidden ? `document.documentElement?.setAttribute(${name}, '')` : `document.documentElement?.removeAttribute(${name})`;
}

export interface Point {
  x: number;
  y: number;
}

/** État du pointeur : dernière position vue, instant de son dernier mouvement, masqué ou non. */
export interface IdleCursor {
  readonly at?: Point;
  readonly movedAt: number;
  readonly hidden: boolean;
}

/** Au démarrage : visible, comme s'il venait de bouger. */
export function idleCursorStart(now: number): IdleCursor {
  return { movedAt: now, hidden: false };
}

/**
 * Un relevé de la position du pointeur. Un mouvement le montre aussitôt ; immobile depuis
 * `idleMs` ou plus, il est masqué. Le premier relevé n'est pas un mouvement.
 */
export function idleCursorStep(state: IdleCursor, at: Point, now: number, idleMs = CURSOR_IDLE_MS): IdleCursor {
  const moved = state.at !== undefined && (state.at.x !== at.x || state.at.y !== at.y);
  if (moved) return { at, movedAt: now, hidden: false };
  return { at, movedAt: state.movedAt, hidden: state.hidden || now - state.movedAt >= idleMs };
}
