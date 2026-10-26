# Preavis

Préavis d'arrêt de l'horaire de la borne, posé sur le plateau au-dessus du voile de nuit : ce qui va arriver, le temps restant, comment l'éviter. Le moindre bouton le retire.

- Fournir : `.stop-notice` (couche `#stop`, géométrie et rotation du plateau) avec l'icône de l'arrêt (`moon` pour la veille, `power` pour l'extinction), le libellé (« Mise en veille dans », « Extinction dans »), le compte (`.stop-notice-count`, secondes et « s »), la jauge (`.stop-notice-bar`, durée totale `--stop-ms`, temps écoulé négatif `--stop-delay`) et l'invite (« Appuyez sur un bouton pour garder la borne allumée »).
- Mesures (petit côté 1080) : largeur extérieure 864 px au plus, à 97 px du bas ; icône 65 px ; libellé et invite 24 px ; compte 97 px, chiffres tabulaires ; jauge 5 px.
- Sobre : fond `surface` opaque, filet `line-strong`, compte `ink` sans halo, pas de vert (ni choix ni réussite), pas d'ambre (un arrêt réglé n'est pas une anomalie), invite fixe, pas de pulsation ni de clignotement final. Pendant le préavis, l'invite du mode attente disparaît : une consigne à la fois.
- Voile de nuit (`.night-veil`) : noir sur toute la fenêtre, 50, 70 (défaut), 85 ou 100 % ; descend en 4 s (`ease-in-out`), se lève d'un coup. L'invite du mode attente reste dessous ; seul le préavis passe au-dessus. Ni le DMD ni un son ne répètent le préavis.

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
