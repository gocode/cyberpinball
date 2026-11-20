// « Jouer en local » (Menu système > Communauté, 18/11/2026) : un joueur qui ne joue que sur sa borne
// retire toute la partie sociale d'un coup, au lieu de quatre réglages à quatre endroits, et le
// système de niveaux avec elle (aucun interrupteur ne le cachait).
//
// Activé : le réseau des bornes s'arrête (social.ts, `enabled` faux), la rubrique Communauté ne garde
// que cette entrée et, dans Mon profil, ce qui est à soi (pseudo, avatar, pays, compte) ; le
// médaillon Communauté, la carte du joueur, les moments de badge et de niveau, la pastille des
// messages, la Communauté au téléphone, « Jouer avec un ami » et « Partie instantanée » sur la fiche,
// les classements en ligne au tableau des scores disparaissent (app/src/frontend.ts, library.ts).
// Les XP continuent de se compter en silence : remise, la communauté revient avec tout.
//
// Jamais touchés : la mise à jour de Cyber Pinball, les Nouveautés, Retours et propositions, les
// sauvegardes, le catalogue des tables. Ils ne passent pas par le réseau des bornes.

import { systemItemsUnder, type SystemItemId } from './systemmenu';

/**
 * Ce qui reste de la Communauté en jeu local : l'interrupteur, et ce qui est à soi sans les autres
 * joueurs (pseudo, avatar, pays, protéger ou supprimer son compte).
 */
const KEPT_IN_LOCAL_PLAY: readonly SystemItemId[] = ['local-play', 'player-name', 'avatar', 'country', 'account', 'account-delete'];

/**
 * Entrées du Menu système retirées en jeu local : toute la rubrique Communauté (l'accueil du
 * médaillon) sauf ce qui précède. Une rubrique dont il ne reste rien disparaît (library.ts) ;
 * jouer-en-local.test.ts le fixe.
 */
export const LOCAL_PLAY_HIDDEN: ReadonlySet<SystemItemId> = new Set<SystemItemId>(systemItemsUnder('amis').filter((id) => !KEPT_IN_LOCAL_PLAY.includes(id)));

/** L'entrée est-elle retirée du Menu système quand le joueur joue en local ? */
export function hiddenInLocalPlay(id: SystemItemId, local: boolean): boolean {
  return local && LOCAL_PLAY_HIDDEN.has(id);
}
