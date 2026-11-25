// Section « Boutons avancés » de l'étape « Boutons » (assistant complet et étape seule) : les boutons
// facultatifs d'actions de VPX qu'aucun encodeur n'envoie d'office (Crédit 2 à 4, Fire, règles, mode
// debug). Le relevé pas à pas ne les demande pas : au récapitulatif, une ligne « Boutons avancés »
// les déplie, et un clic (ou précédent, suivant, valider) relève l'un d'eux. Repliée par défaut.

import { t, tn } from '@cyberpinball/core';

/** Une ligne de la liste des boutons : un bouton (son indice dans les boutons du jeu), ou l'entête de la section. */
export type ButtonRow = { kind: 'item'; index: number } | { kind: 'advanced' };

/** Lignes montrées : les boutons ordinaires, l'entête de la section, puis les avancés si elle est dépliée. */
export function buttonRows(items: readonly { advanced?: boolean }[], open: boolean, onlyAdvanced = false): ButtonRow[] {
  const main = items.flatMap((b, index): ButtonRow[] => (b.advanced ? [] : [{ kind: 'item', index }]));
  const advanced = items.flatMap((b, index): ButtonRow[] => (b.advanced ? [{ kind: 'item', index }] : []));
  if (!advanced.length) return main;
  // Pendant le relevé d'un bouton avancé, seuls les avancés restent : la liste entière avec la section
  // dépliée ne tient plus à l'écran à côté de la consigne.
  if (onlyAdvanced) return advanced;
  return [...main, { kind: 'advanced' }, ...(open ? advanced : [])];
}

/** Valeur de la ligne d'entête : combien de boutons avancés ont une touche, et l'état de la section. */
export function advancedSummary(items: readonly { id: string; advanced?: boolean }[], keys: Readonly<Record<string, string | undefined>>, open: boolean): string {
  const set = items.filter((b) => b.advanced && keys[b.id]).length;
  const count = set ? tn(set, '{n} bouton affecté', '{n} boutons affectés') : t('aucun');
  return `${count} ${open ? '▾' : '▸'}`;
}
