# LigneMenu

Une entrée de menu, en capitales, avec son icône et, au besoin, un détail sur une ligne.

- Fournir : une liste `.cp-menu` d'éléments `.cp-menu-item` (icône, libellé, `<small>` facultatif). `.is-focus` sur l'entrée choisie, `.is-quiet` sur « Quitter », `.is-danger` sur une action destructrice.
- L'icône (30 px, couleur du libellé) est alignée sur la première ligne du libellé ; la pastille rouge d'une entrée qui attend l'utilisateur se pose en haut à droite de l'icône (`.cp-glyph` > icône + `.cp-dot`).
- L'entrée choisie est une barre opaque `signal`, texte et icône `on-signal`.
- Raccourci clavier qui fait la même chose sans passer par le menu : `.cp-shortcut` en dernier dans l'entrée, une `.cp-cap` par touche (« Ctrl », « Maj », « D ») séparées par « + », à droite de la première ligne. Les touches viennent de la définition du raccourci dans le code, jamais écrites à la main ; un bouton de joystick ne s'y montre pas.
- Pour : menu système, configuration de la borne, menus d'Exit. Pas pour les listes de tables (voir `Roue` et `CarteTable`).

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
