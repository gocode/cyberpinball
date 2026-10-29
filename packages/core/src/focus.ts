// Curseur des écrans à choisir (bibliothèque, médias, propositions) : il désigne un
// élément, pas un rang. Une liste qui change sous les yeux de l'utilisateur (fichier
// reçu d'un site, téléchargement fait dans la fenêtre « Récupérer », aperçu arrivé)
// peut insérer une carte au-dessus de celle qu'il regarde : valider « le 3ᵉ » validerait
// alors celle d'au-dessus. Le 27/10/2026, sur les propositions de l'Afficheur large de
// The Matrix, le média rangé n’était pas celui que l’on pensait avoir choisi.
//
// Règles :
// - chaque action a une identité : sa clé (`key`), sinon son libellé s'il est unique
//   dans l'écran ; sans identité, seul le rang vaut (écrans fixes) ;
// - entre deux vues d'un même écran, le curseur suit l'identité de l'élément qu'il
//   montrait ; un élément remplacé par ses fichiers (fiche d'un site, reçue) garde le
//   curseur sur son premier fichier (clé « <clé de la fiche>/… ») ;
// - pendant une opération longue (inventaire, analyse), l'écran attend : ce qu'il montre sous
//   le curseur n'a pas été choisi, il n'est pas suivi. Le 29/10/2026, la Bibliothèque de ROM
//   s'ouvrait sur « Retour au menu », seule action de l'écran le temps de l'inventaire, que le
//   curseur suivait une fois la liste arrivée, au lieu de sa première action ;
// - un clic arrive avec l'identité de ce qui a été cliqué : il vaut pour cet élément où
//   qu'il soit maintenant, et pour rien s'il a disparu.

/** Ce qu'il faut d'une action pour la reconnaître. */
export interface Identified {
  key?: string;
  label: string;
}

/** Identité de chaque action : sa clé, sinon son libellé s'il n'apparaît qu'une fois. */
export function actionIds(actions: readonly Identified[]): (string | undefined)[] {
  const count = new Map<string, number>();
  for (const a of actions) if (a.key === undefined) count.set(a.label, (count.get(a.label) ?? 0) + 1);
  return actions.map((a) => (a.key !== undefined ? `key:${a.key}` : count.get(a.label) === 1 ? `label:${a.label}` : undefined));
}

/** Rang de l'élément d'identité `id` : lui-même, sinon le premier qui en descend (« id/… »). */
export function indexOfId(ids: readonly (string | undefined)[], id: string): number {
  const exact = ids.indexOf(id);
  if (exact >= 0) return exact;
  return ids.findIndex((x) => x !== undefined && x.startsWith(`${id}/`));
}

/** Ce que l'écran montrait sous le curseur à la dernière vue. */
export interface FocusAnchor {
  /** Écran de la dernière vue (même objet : même écran). */
  screen: unknown;
  cursor: number;
  id: string | undefined;
}

/** Ce que retient la vue : rien à suivre pendant une opération longue (`busy`), où rien ne se choisit. */
export function anchorOf(screen: unknown, cursor: number, ids: readonly (string | undefined)[], busy: boolean): FocusAnchor {
  return { screen, cursor, id: busy ? undefined : ids[cursor] };
}

/**
 * Curseur pour la vue suivante. Même écran et curseur inchangé depuis la dernière vue :
 * il suit l'élément qu'il montrait, s'il est encore là. Le code qui a déplacé le
 * curseur exprès (autre écran, autre rang) est obéi.
 */
export function followCursor(ids: readonly (string | undefined)[], cursor: number, screen: unknown, anchor: FocusAnchor | undefined): number {
  const n = ids.length;
  const clamp = (i: number) => Math.min(Math.max(0, i), Math.max(0, n - 1));
  if (!anchor || anchor.screen !== screen || anchor.cursor !== cursor || anchor.id === undefined) return clamp(cursor);
  if (ids[cursor] === anchor.id) return clamp(cursor);
  const moved = indexOfId(ids, anchor.id);
  return moved >= 0 ? moved : clamp(cursor);
}

/**
 * Action visée par un clic : celle qui porte l'identité cliquée, où qu'elle soit ; le rang
 * seulement si l'élément cliqué n'avait pas d'identité. undefined : l'élément a disparu
 * (ou le rang n'existe plus), rien n'est lancé.
 */
export function resolveActivation(ids: readonly (string | undefined)[], index: number, id: string | undefined): number | undefined {
  if (id !== undefined) {
    const at = ids[index] === id ? index : ids.indexOf(id);
    return at >= 0 ? at : undefined;
  }
  return index >= 0 && index < ids.length ? index : undefined;
}
