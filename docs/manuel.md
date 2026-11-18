[English](manual.md) · Français

# Cyber Pinball : manuel technique

Référence complète du prototype, en français : fonctionnement de chaque partie, fichiers écrits, commandes, essais sans opérateur et limites connues.
Présentation du projet : [README.fr.md](../README.fr.md) (en anglais : [README.md](../README.md)).

Frontend open source de borne de flipper virtuel.
Son principe : on décrit la borne une fois, et Cyber Pinball écrit et maintient la configuration de tous les composants (VPX, puis B2S, PinUP, DMD, DOF).
Plus besoin d'éditer un `.ini` à la main.

**État : prototype des jalons 1 et 2.**
- **Écrans** : détection par EDID, assistant piloté par les boutons de la borne (rôles, bord des flippers, diagonale du playfield), génération de `VPinballX.ini` avec le cadrage automatique des tables, corrigé automatiquement quand Windows renumérote ou déplace les écrans.
- **Configurations de la borne** : plusieurs jeux d'écrans pour une même installation (deux postes, un PC de bureau et une borne), chacun avec ses rôles, son son, ses boutons et son `VPinballX.ini` ; celui qui est branché est reconnu d'office au démarrage, avant chaque partie et à la commande `sync` (voir [Configurations de la borne](manuel/configurations-de-la-borne.md#configurations-de-la-borne)).
- **Son** : étape de l'assistant qui joue un son sur chaque sortie audio et fait choisir celle du fronton et celle du plateau, puis teste les haut-parleurs d'une carte 5.1 ou 7.1 ; `SoundDeviceBG`, `SoundDevice` et `Sound3D` réécrits à chaque démarrage avec le nom courant des sorties (voir [Son](manuel/son.md#son)).
- **Écran des tables** : une fenêtre par écran de la borne, lancement de VPX en `-Play`, écran de chargement (en borne, le média de chargement seul, plein écran ; au bureau, avec les commandes de la partie), retour au front-end avec reprise du premier plan, statistiques dans le fichier `.info` de chaque table, erreurs de VPX rapportées en clair.
  Écran du playfield couché et tourné, Windows resté en paysage : le front-end, la fiche, la gestion des tables et les réglages pivotent pour un joueur placé au bord des flippers (`playfield.flipperEdge` du modèle de borne, ramené à l'orientation actuelle de l'écran), en portrait à 90° et 270° ; le backglass, le DMD et le topper ne pivotent pas.
- **Fenêtres plein écran** : chaque fenêtre (écran des tables, fiche, réglages, assistant) couvre tout son écran, barre des tâches de Windows comprise, sans liseré : plein écran d'Electron (`coverDisplay`, `app/src/cover-display.ts`), sans premier plan forcé.
  VPX passe devant pendant une partie, et la touche Windows ou Alt+Tab font revenir le bureau et la barre des tâches.
  Menu système > « Borne » > « Bureau Windows », ou Ctrl+Maj+D depuis le front-end, libère tous les écrans du PC, quel que soit leur nombre (mode bureau, voir le gardien des écrans) ; Ctrl+Maj+D de nouveau, le bouton de Cyber Pinball dans la barre des tâches ou Alt+Tab rouvre le front-end sur tous ses écrans.
  Un bouton de la borne peut aussi y mener directement : Boutons de l'interface > « Bureau Windows » (voir [Boutons de la borne](manuel/boutons-de-la-borne.md#boutons-de-la-borne)).
- **Aucun écran ne montre le bureau Windows** (gardien des écrans, `app/src/screen-guard.ts`), du démarrage à la fin d'une partie : un voile noir par écran, ouvert avant toute autre fenêtre et jamais au premier plan ; les fenêtres du front-end restent derrière VPX pendant le chargement et la partie ; la relance front-end ↔ assistant passe le relais sans trou ; les barres des tâches sont masquées pendant une partie.
  **Jamais d'écran clair** non plus : sans fond système de Windows, une fenêtre reste transparente jusqu'à sa première image, et ne passe en plein écran qu'une fois affichée.
  Un écran qui reste découvert plus d'une seconde est signalé dans la console (voir [Lancement d'une partie](manuel/lancement-d-une-partie.md#lancement-dune-partie)).

Le manuel tient en une rubrique par fichier (dossier [manuel](manuel/)), une phrase par ligne : deux changements dans deux rubriques, ou dans deux phrases, ne se gênent pas à la fusion.
Une nouvelle rubrique prend son titre ci-dessous, à sa place, et sa traduction dans [manual.md](manual.md) ; `node scripts/decoupage.mjs --phrases <fichier>` remet une phrase par ligne, `npm test` le vérifie.

## [Démarrer](manuel/demarrer.md)
## [Installation et organisation des fichiers](manuel/installation-et-organisation-des-fichiers.md)
## [Base VPS](manuel/base-vps.md)
## [Ajouter une table : l'entonnoir, le catalogue, « Récupérer », liste d'attente](manuel/ajouter-une-table-l-entonnoir-le-catalogue.md)
## [Gestionnaire de téléchargements](manuel/gestionnaire-de-telechargements.md)
## [Notifications de l'écran des tables](manuel/notifications-de-l-ecran-des-tables.md)
## [Activité récente](manuel/activite-recente.md)
## [Nouveautés](manuel/nouveautes.md)
## [Téléchargements et sélecteur de fichiers](manuel/telechargements-et-selecteur-de-fichiers.md)
## [Ce qu'il manque pour jouer : parcours guidé](manuel/ce-qu-il-manque-pour-jouer-parcours-guide.md)
## [Fiche d'une table : ses fichiers](manuel/fiche-d-une-table-ses-fichiers.md)
## [Parties d'un jeu](manuel/parties-d-un-jeu.md)
## [Tables de Pinball FX](manuel/tables-de-pinball-fx.md)
## [Tables de Pinball FX3](manuel/tables-de-pinball-fx3.md)
## [Jamais enfermé : le web depuis chaque écran d'ajout](manuel/jamais-enferme-le-web-depuis-chaque-ecran-d.md)
## [Le téléphone comme télécommande du navigateur intégré](manuel/le-telephone-comme-telecommande-du-navigateur.md)
## [Le téléphone comme télécommande du front-end](manuel/le-telephone-comme-telecommande-du-front-end.md)
## [Téléphone gardé](manuel/telephone-garde.md)
## [Accès direct aux menus depuis le téléphone](manuel/acces-direct-aux-menus-depuis-le-telephone.md)
## [Classements au téléphone](manuel/classements-au-telephone.md)
## [Juke-box au téléphone](manuel/juke-box-au-telephone.md)
## [Communauté au téléphone](manuel/communaute-au-telephone.md)
## [Bibliothèque de ROM](manuel/bibliotheque-de-rom.md)
## [PuP-Packs](manuel/pup-packs.md)
## [PuP-Pack désactivé, table par table](manuel/pup-pack-desactive-table-par-table.md)
## [Structure](manuel/structure.md)
## [Réglages de VPX](manuel/reglages-de-vpx.md)
## [Autres versions de VPX](manuel/autres-versions-de-vpx.md)
## [Menu système : six rubriques](manuel/menu-systeme-cinq-rubriques.md)
## [Santé de la borne](manuel/sante-de-la-borne.md)
## [Fiche technique](manuel/fiche-technique.md)
## [Retours et propositions](manuel/retours-et-propositions.md)
## [Éteindre, mettre en veille, redémarrer la borne](manuel/eteindre-mettre-en-veille-redemarrer-la-borne.md)
## [Mode invité](manuel/mode-invite.md)
## [Sauvegardes](manuel/sauvegardes.md)
## [Mon compte](manuel/mon-compte.md)
## [Communauté : le réseau des bornes](manuel/amis-le-reseau-des-bornes.md)
## [Niveaux et badges](manuel/niveaux-et-badges.md)
## [Assistant et menu de configuration](manuel/assistant-et-menu-de-configuration.md)
## [Conditions d'utilisation](manuel/conditions-d-utilisation.md)
## [Crédits de la communauté](manuel/credits-de-la-communaute.md)
## [Langue de l'interface](manuel/langue-de-l-interface.md)
## [Icônes des menus](manuel/icones-des-menus.md)
## [Boutons de la borne](manuel/boutons-de-la-borne.md)
## [Lanceur analogique et accéléromètre](manuel/lanceur-analogique-et-accelerometre.md)
## [Tilt](manuel/tilt.md)
## [Configurations de la borne](manuel/configurations-de-la-borne.md)
## [Orientation et cadrage des tables](manuel/orientation-et-cadrage-des-tables.md)
## [Son](manuel/son.md)
## [Plugins de VPX : backglass, PuP et DMD](manuel/plugins-de-vpx-backglass-pup-et-dmd.md)
## [LED et retours (DOF)](manuel/led-et-retours-dof.md)
## [Médias des jeux](manuel/medias-des-jeux.md)
## [Lancement d'une partie](manuel/lancement-d-une-partie.md)
## [Cohabitation avec un autre front-end de borne](manuel/cohabitation-avec-un-autre-front-end-de-borne.md)
## [Borne dédiée](manuel/borne-dediee.md)
## [Relance par Start](manuel/relance-par-start.md)
## [Tests de bout en bout sans opérateur](manuel/tests-de-bout-en-bout-sans-operateur.md)
## [Limites connues du prototype](manuel/limites-connues-du-prototype.md)
