# Notification

Les notifications du menu des tables : la pastille des amis en ligne et une notification discrète à la fois, à gauche de la roue dentée.

- Fournir : `.cp-corner` (de droite à gauche : pastille des téléchargements, `.cp-pill` des amis, puis `.cp-notice`). Au bureau, la notification se pose sur la ligne de la marque et s'arrête avant les cadres ; en borne, elle passe sur sa ligne, sous les pastilles, alignée à droite. Jamais sur le média de la table ni sur la roue.
- Pastille des amis : 64 px de haut, icône des amis en bleu méta, point vert de 10 px (présence, pas une action), le nombre ; absente quand aucun ami n'est en ligne (un zéro ne dit rien). Un clic ouvre « Mes amis ».
- Notification : 64 px de haut, 620 px au plus, filet de 4 px et icône de 24 px dans la couleur du ton (bleu méta : une information, un ami qui se connecte ou lance une partie ; vert : une réussite, fini, record, nouvel ami ; ambre : une demande ; rouge : un blocage), titre de 24 px (interligne 28) et précision de 20 px (interligne 24), chacun sur une ligne : raccourcir le nom ou le titre, jamais la police. Surface pleine, ombre sobre, aucun halo.
- Comportement (`packages/core/src/notices.ts`) : une à la fois, environ 6 s, puis une pause ; ce qui arrive ensemble se regroupe (« 3 amis viennent de se connecter »), trois genres ou plus font un résumé ; rien pendant une partie, en attente, en mode invité, sous un écran plein ; elle s'estompe entièrement en partant (320 ms).
- Pour : ce qui arrive sans qu'on le demande, au menu des tables. Pas pour le constat d'une action (bandeau bref) ni pour une erreur bloquante (message).

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
