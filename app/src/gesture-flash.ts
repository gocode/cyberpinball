// Message d'un geste (« flash ») : la confirmation ou l'erreur qu'un écran du menu montre après une
// action (« Nom changé », « Avatar enregistré », « Pseudo refusé »…). Il reste affiché jusqu'au
// geste suivant de l'utilisateur, quel que soit le nombre de fois que l'écran se redessine
// entre-temps.
//
// Pourquoi : library.ts rappelle build() d'un écran décrit à chaque broadcast(), et bien des
// broadcast() ne viennent pas de l'utilisateur (le profil social redessine 250 ms après chaque
// changement, un téléchargement avance, un ami se connecte…). Un message effacé dans build(), au
// premier dessin, disparaissait donc avant d'avoir été lu. Règle : build() lit le message, ne
// l'efface jamais ; seul un geste l'efface (onGesture), ou une action qui en pose un autre.
//
// Le geste : library.ts appelle userGesture() avant chaque action validée (Start, clic, raccourci),
// chaque retour (Exit, « Retour »), chaque touche d'une saisie, chaque fichier déposé, et quand le
// menu se ferme. Déplacer la sélection (flippers, MagnaSave, défilement du texte) n'en est pas un :
// le message reste pendant qu'on parcourt l'écran.
//
// Sans electron : les tests du cœur chargent ce module (packages/core/src/test/gesture-flash.test.ts).

const listeners = new Set<() => void>();

/**
 * Un geste de l'utilisateur commence : les messages du geste précédent s'effacent, avant que
 * l'action ne pose le sien. Appelé par library.ts (et par les essais, qui jouent l'utilisateur).
 */
export function userGesture(): void {
  for (const clear of listeners) clear();
}

/**
 * Efface un message au geste suivant : `clear` remet la variable du message à undefined. À
 * appeler une fois, à la création de l'écran (pas à chaque ouverture) ; rend de quoi se désabonner.
 */
export function onGesture(clear: () => void): () => void {
  listeners.add(clear);
  return () => listeners.delete(clear);
}
