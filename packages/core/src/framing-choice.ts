// Cadrage : un choix, jamais une réparation proposée d'office (27/11/2026). Les propositions automatiques de cadrage ne
// sont pas encore assez sûres, et une table qui a déjà son cadrage (celui de son installation d'origine, une vue réglée
// pour elle, un POV) n'a rien à gagner à s'en voir proposer un autre. Ces constats restent affichés (ils disent quel
// cadrage la table suit), mais leur correction ne se fait que dans « Point de vue », où chaque cadrage est nommé, montré
// et réversible : ni dans le parcours de la table, ni dans « Tout réparer », ni sous le curseur du diagnostic.

import type { Finding } from './doctor';

/** Constats qui décrivent le cadrage que la table a déjà : leur « correction » en changerait, c'est un choix. */
export const FRAMING_CHOICE_CODES = ['originFraming', 'manualView', 'importedView', 'povView', 'povOffered'] as const satisfies readonly Finding['code'][];

/**
 * La correction de ce constat change-t-elle un cadrage en place sans qu'un défaut soit certain ? Une table de travers
 * n'en est une que quand le sens de la partie se vérifie (avertissement) ; sinon (vue de l'auteur, sens inconnu), c'est
 * une supposition : un choix aussi.
 */
export function isFramingChoice(f: Pick<Finding, 'code' | 'severity'>): boolean {
  return (FRAMING_CHOICE_CODES as readonly string[]).includes(f.code) || (f.code === 'tableOrientation' && f.severity !== 'warning');
}
