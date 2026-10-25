# Icones

Le jeu d'icônes de Cyber Pinball : un seul registre, `app/renderer/icons.js`, où chaque icône est dessinée une fois ; l'application et ce design system le lisent tous deux.

- Dessin : trait de 2 sur une grille de 24, bouts et joints arrondis, zone vive de 3 à 21 (2 à 22 pour les pointes), aucun remplissage. Une silhouette par fonction ; deux entrées d'un même menu n'ont jamais la même icône, une même fonction garde la sienne partout.
- Tailles (petit côté de 1 080 px) : entrée de menu 30 px (`2.78cqmin`), à 24 px du libellé, alignée sur sa première ligne ; titre d'écran 60 px ; roue dentée 38 px (zone cliquable de 72 px) ; onglets et groupes 22 à 26 px. Jamais sous 20 px.
- Couleur : celle du libellé. Au repos `ink` ; choisie `on-signal` sur l'aplat vert ; sans objet `ink-faint` ; destructrice `danger` au repos (icône et verbe), sombre sur l'aplat rouge une fois choisie.
- Pastille « attend l'utilisateur » : rond rouge de 12 px en haut à droite de l'icône, cerclé de noir ; la même sur la roue dentée.
- Pas d'icône devant une valeur, une ligne de statistiques, une table, une configuration ou un choix de liste : seulement devant ce qui ouvre ou fait quelque chose.
- Fournir, ici : `<i class="cp-i cp-i-<nom>"></i>` (masque, taille `font-size`, couleur `color`) ; dans l'application : `cyberIcon('<nom>')`, et un champ `icon` sur l'entrée de menu.

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
