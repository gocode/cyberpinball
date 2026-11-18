// « Jouer en local » (Menu système > Communauté, 18/11/2026) : un joueur qui ne joue que sur sa borne
// retire toute la partie sociale d'un coup, au lieu de quatre réglages à quatre endroits, et le
// système de niveaux avec elle (aucun interrupteur ne le cachait).
//
// Activé : le réseau des bornes s'arrête (social.ts, `enabled` faux), la rubrique Communauté ne garde
// que cette entrée, Mon compte perd badges, profil public et « Ce que voient les autres » ; le
// médaillon Communauté, la carte du joueur, les moments de badge et de niveau, la pastille des
// messages, la Communauté au téléphone, « Jouer avec un ami » et « Partie instantanée » sur la fiche,
// les classements en ligne au tableau des scores disparaissent (app/src/frontend.ts, library.ts).
// Les XP continuent de se compter en silence : remise, la communauté revient avec tout.
//
// Jamais touchés : la mise à jour de Cyber Pinball, les Nouveautés, Retours et propositions, les
// sauvegardes, le catalogue des tables. Ils ne passent pas par le réseau des bornes.

import { isSystemGroup, SYSTEM_GROUPS, type SystemItemId } from './systemmenu';

/** Entrées de Mon compte qui n'ont de sens qu'avec les autres joueurs. */
const ACCOUNT_SOCIAL: readonly SystemItemId[] = ['badges', 'public-profile', 'account-privacy'];

/**
 * Entrées du Menu système retirées en jeu local : toute la rubrique Communauté sauf l'interrupteur,
 * et la part sociale de Mon compte. Lu par l'arbre (library.ts) ; localplay.test.ts le fixe.
 */
export const LOCAL_PLAY_HIDDEN: ReadonlySet<SystemItemId> = new Set<SystemItemId>([
  ...SYSTEM_GROUPS.amis.entries.filter((id): id is SystemItemId => id !== 'local-play' && !isSystemGroup(id)),
  ...ACCOUNT_SOCIAL,
]);

/** L'entrée est-elle retirée du Menu système quand le joueur joue en local ? */
export function hiddenInLocalPlay(id: SystemItemId, local: boolean): boolean {
  return local && LOCAL_PLAY_HIDDEN.has(id);
}
