# LigneMenu

Une entrée de menu, en capitales, avec son icône et, au besoin, un détail sur une ligne.

- Fournir : une liste `.cp-menu` d'éléments `.cp-menu-item` (icône, libellé, `<small>` facultatif). `.is-focus` sur l'entrée choisie, `.is-quiet` sur « Quitter ».
- L'entrée choisie est une barre opaque `signal`, texte `on-signal`.
- Pour : menu système, configuration de la borne, menus d'Exit. Pas pour les listes de tables (voir `Roue` et `CarteTable`).

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
