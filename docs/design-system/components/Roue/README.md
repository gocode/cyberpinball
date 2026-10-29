# Roue

La roue des tables : les logos ronds défilent, la table choisie grossit au centre dans un anneau vert.

- Fournir : le logo de chaque table (`.cp-logo`, image ronde ou repli dessiné), cinq visibles au plus ; `.near` sur les voisins, `.is-focus` au centre ; un compteur `.cp-count` dessous.
- Les flippers tournent la roue, Start ouvre la fiche. Les flèches sont cliquables à la souris.
- Le titre, le fabricant et l'année de la table choisie s'écrivent au-dessus de la roue en `display` et `meta`, jamais dans la roue.
- Logo absent (repli dessiné) : le médaillon du centre écrit le titre (28 px, trois lignes au plus) ; les autres portent son initiale en grand (96 px dans le repère du bandeau, Saira 600, `ink`). Réduit à la place d'un voisin, un nom passerait sous 20 px. Nom et initiale ne se voient jamais ensemble : pendant le glissement, l'un s'éteint en 60 ms, l'autre s'allume ensuite en 160 ms.
- Les 20 px valent pour le texte tel qu'on le voit, après la mise à l'échelle de sa place.

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
