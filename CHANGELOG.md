[English](CHANGELOG.en.md) · Français

# Nouveautés de Cyber Pinball

Une section par version, `## <version>` puis une ligne `- ` par point : `npm run publier` en tire
les nouveautés du flux de mise à jour, affichées sur la borne avant l'installation, et de la
release GitHub. Des phrases courtes, pour l'utilisateur de la borne. Chaque section a sa
traduction, point par point, dans [CHANGELOG.en.md](CHANGELOG.en.md) (vérifié par `npm test`) ;
le flux de mise à jour et la release GitHub reprennent les deux langues (la borne affiche celle de
son interface).

## 0.1.3

- Boutons d'un Pinscape (KL25Z) ou d'un encodeur en mode manette : relevés dans l'étape « Boutons » et suivis par tout le menu et par VPX.
- Boutons du jeu et boutons de l'interface réglés séparément ; touches du clavier et boutons de joystick se mélangent librement.
- « Ajouter une table » réunit au même endroit toutes les façons d'ajouter une table, avec des filtres dans le catalogue et l'installation rapide.
- « Ce qu'il manque pour jouer » : un parcours guidé, d'une ROM ou d'un fronton manquant jusqu'à « Jouer ».
- Une ROM rangée dans un sous-dossier de son zip est reconnue ; « Diagnostiquer et réparer » regroupe une ROM éparpillée dans une table.
- Liste d'attente corrigeable : réaffecter, vider, remplacer ou retirer un fichier reçu par erreur ; la fiche d'une table a une section « Fichiers ».
- Une icône pour chaque menu.
- La fenêtre « Récupérer » reste au premier plan : le fronton ne passe plus devant au premier clic.
- Fenêtre « Récupérer » sur une borne : elle s'ouvre sur un écran lisible (le fronton si le playfield est tourné), le pointeur amené dessus ; Exit la ferme.
- La fenêtre « Récupérer » rouverte reprend la page où vous en étiez ; recherche des sites plus complète.
- Plus d'écran blanc quand une fenêtre s'ouvre ou change d'écran.
- Mises à jour plus légères (l'application seule, en quelques secondes) et préversions d'essai, à recevoir ou non depuis le menu de la mise à jour.

## 0.1.2

- Mise à jour : la recherche part dès le démarrage, puis toutes les 6 heures ; la pastille rouge s'affiche sans ouvrir le menu.
- Mise à jour : l'installation ne bloque plus quand Cyber Pinball est lancé depuis son raccourci, et un échec relance Cyber Pinball sans clic.
- Bouton « ‹ Retour » au-dessus du titre de chaque menu, et dans les réglages de VPX.
- Médias proposés par les sites : afficheur que la borne ne montre pas signalé, nombre de sites par média, recherche sur le web.

## 0.1.1

- Mise à jour depuis la borne, aussi pour une borne copiée sans l'installeur : ses raccourcis restent ceux qui existent.
- Pastille rouge plus discrète sur la roue dentée ; le menu système s'ouvre sur l'entrée qui attend.

## 0.1.0

- Première version publique : assistant d'écrans, de boutons et de son, menu des tables aux boutons de la borne.
- Ajout de tables, bibliothèque de ROM, PuP-Packs, catalogue VPS et liste d'attente.
- Médias des jeux : import depuis PinUP Popper ou PinballX, téléchargement depuis VPinMediaDB, puis VPForums et VPUniverse avec votre compte, mode attente.
- Mise à jour depuis le menu système : « Mise à jour de Cyber Pinball », signalée par une pastille rouge sur la roue dentée quand une version est disponible.
- Interface en français ou en anglais, au choix dans le menu système : « Langue / Language ».
- S'installe à côté de PinUP Popper, PinballX ou PinballY : attend qu'un autre menu ouvert soit fermé, prévient avant de retourner un écran dans Windows.
