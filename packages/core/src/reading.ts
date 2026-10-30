// Zone de lecture d'un écran de gestion : un texte plus long que l'écran, où il n'y a rien à
// choisir (nouveautés d'une mise à jour, message, explication).
//
// 30 octobre 2026, sur une borne : les nouveautés de la 0.1.5-essai.10 dépassaient de leur
// cadre, et seuls la molette ou la barre de défilement les faisaient défiler. Aux boutons, les
// flippers ne parcouraient que les actions de l'écran : la suite du texte restait hors d'atteinte.
// Les règles, pour tout écran sans liste de contenu (listzones.ts) dont le texte dépasse :
// - le texte devient une étape du parcours, avant la première action : un flipper gauche sur la
//   première action y entre (le texte est au-dessus des actions), un flipper droit sur la dernière
//   aussi (le parcours fait le tour) ; MagnaSave (F6) y va et en revient directement ;
// - dans le texte, le flipper droit (ou Start) avance d'une page, le gauche recule ; arrivé en bas,
//   le flipper droit passe à la première action, arrivé en haut le gauche à la dernière : on lit
//   puis on agit, sans bouton de plus ;
// - un flipper tenu fait défiler page après page et s'arrête au bout du texte, sans en sortir ;
// - Exit revient aux actions, sur celle d'où l'on venait ; un second Exit quitte l'écran ;
// - Page préc. / Page suiv. d'un clavier font défiler le texte de partout.
// Le processus principal ne voit pas la mise en page : le rendu (app/renderer/library.js) lui dit
// si le texte dépasse et s'il est en haut ou en bas (ReadingEdges). Tant qu'il ne l'a pas dit,
// l'écran se parcourt comme avant.

/** Ce que le rendu mesure du texte de l'écran. */
export interface ReadingEdges {
  /** Le texte dépasse de son cadre : il y a de quoi faire défiler. */
  overflow: boolean;
  /** Le haut du texte est visible. */
  top: boolean;
  /** Le bas du texte est visible. */
  bottom: boolean;
}

/** Résultat d'un geste : rester dans le texte (et le faire défiler, ou non), ou choisir une action. */
export type ReadingMove = { reading: true; scroll?: -1 | 1 } | { reading: false; cursor: number };

/**
 * Appui d'un flipper (`dir`) dans le texte. `held` : flipper tenu, qui reste dans le texte. Une
 * page de plus tant qu'il en reste ; au bout, la première ou la dernière action (`count` actions).
 */
export function readingStep(edges: ReadingEdges, count: number, dir: -1 | 1, held = false): ReadingMove {
  const atEnd = dir === 1 ? edges.bottom : edges.top;
  if (!atEnd) return { reading: true, scroll: dir };
  if (held || count <= 0) return { reading: true };
  return { reading: false, cursor: dir === 1 ? 0 : count - 1 };
}

/**
 * Appui d'un flipper (`dir`) sur l'action `cursor` d'un écran dont le texte dépasse : vrai s'il
 * mène au texte (gauche sur la première action, droit sur la dernière). Sinon l'écran se parcourt
 * comme d'habitude.
 */
export function entersReading(edges: ReadingEdges | undefined, count: number, cursor: number, dir: -1 | 1): boolean {
  if (!edges?.overflow) return false;
  if (count <= 0) return true;
  return dir === -1 ? cursor <= 0 : cursor >= count - 1;
}

