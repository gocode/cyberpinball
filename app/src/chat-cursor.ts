// Une discussion s'ouvre sur ses derniers messages, en bas, comme dans toute messagerie.
//
// Messages privés, salons et groupes : chaque ligne de la discussion est une action dont la clé
// commence par « line: », dans l'ordre du fil (la plus récente en dernier). Le curseur posé à
// l'ouverture sur la dernière d'entre elles amène la discussion en bas (scroll-keeper.js la garde
// dans la vue). Le 19/11/2026, un groupe s'ouvrait sur sa table de la semaine, en haut, loin des
// messages du jour : un seul calcul pour les trois écrans, fixé par fils-en-bas.test.ts.

/** Rang de la dernière ligne de la discussion parmi les actions de l'écran ; aucune ligne : undefined. */
export function lastLineAt(built: { actions: readonly { key?: string }[] }): number | undefined {
  for (let i = built.actions.length - 1; i >= 0; i--) if (built.actions[i]!.key?.startsWith('line:')) return i;
  return undefined;
}
