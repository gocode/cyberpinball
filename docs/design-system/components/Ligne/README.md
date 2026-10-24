# Ligne

Une ligne : icône, libellé (et détail), valeur dans une pastille, chevron. La brique des réglages, des boutons et des plans.

- Fournir : `.cp-row` avec une icône, un `<span>` (libellé, `.detail` facultatif) et une `.cp-value`. `.is-focus` sur la ligne choisie ; `.is-empty` sur une valeur absente (« pas de bouton ») ; `.is-locked` sur une valeur imposée par Cyber Pinball.
- Grouper les lignes dans `.cp-rows` sous un `.cp-label`.
- La valeur dit l'état actuel, le chevron dit que Start la change.

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
