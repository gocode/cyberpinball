[English](../manual/game-page-its-files.md) · Français · [Sommaire du manuel](../manuel.md)

## Fiche d'une table : ses fichiers

**Ses actions** : la fiche tient en quelques choix.
En tête, « Jouer », « Jouer avec un ami » et « Prospectus et règles » : un seul livret, le prospectus (ou la fiche générée) puis les règles (cartes, textes et vidéo trouvés seuls, et toujours les commandes de la partie en dernier) ; les flippers passent d'une page à l'autre, de l'un à l'autre, Start tourne la page puis revient à la fiche après la dernière, et la souris saute à l'autre partie.
Tout le reste est rangé sous **« Gérer la table… »** : « Pour aller plus loin », « Médias du jeu », « Parties du jeu », « Fichiers de la table », « PuP-Pack », « Réglages de cette table », « Régler l'affichage en partie », « Jouer et enregistrer », « Diagnostiquer et réparer », « Modifier les informations », « Supprimer la table ».
Son détail dit, dès la fiche, ce qui demande un œil (« À vérifier : Fichiers de la table, PuP-Pack »), en orange.
Les écrans ouverts de là y reviennent (`sheetManage`, `app/src/library.ts`) ; Exit sur « Gérer la table » ramène à la fiche.
« Ce qu'il manque pour jouer » reste en tête de la fiche, avant « Jouer ».
En mode invité, la porte `sheet.manage` est fermée : la fiche garde « Jouer », « Prospectus et règles » et le retour.
Les démonstrations nomment une action rangée sous « Gérer la table… » par son nom, et l'autopilote y passe, comme pour une entrée du menu système (`activateByLabel`).

La fiche d'une table (Start sur une table du front-end) montre ses statistiques sur une ligne et un **résumé borné** de ses fichiers : une ligne par sorte présente (table, backglass, ROM, contenu du DMD, vidéos PuP, couleurs du DMD, sons alternatifs, musique, réglages propres, médias), trois noms au plus par ligne (« t2_l3, t2_l4 et 4 autres »), une ligne « Absents » pour les sortes manquantes et une ligne « À vérifier » (backglass mal nommé, script remplacé par un `.vbs`, rapport de plantage).
En hauteur (borne, playfield tourné, ou écran portrait), les informations gardent leur place et les actions passent sur deux colonnes ; la liste des actions défile si elle dépasse.
Sur une borne, la liste des actions mangeait toute la hauteur : avec beaucoup de fichiers, seule la première ligne des statistiques restait visible.

**« Fichiers de la table »** (action de la fiche, détail « 66 fichiers · 940 ko · 3 à vérifier ») : tout le dossier de la table, groupé par sorte, la table et ses frontons d'abord.
Chaque fichier y est une ligne à choisir, avec son nom entier (il passe à la ligne), son dossier dans celui de la table, son état et sa taille : « cette table » ou « autre version du dossier », backglass « chargé par VPX avec cette table » ou « mal nommé : VPX ne le chargera pas », ROM « lien vers la bibliothèque de ROM », « copie à part : la bibliothèque a aussi cette ROM » ou « propre à la table », « demandée par le script », sauvegarde et réglages de PinMAME, script de remplacement, rapport de plantage.
Les dossiers qu'on range d'un bloc (un PuP-Pack, des sons alternatifs, des couleurs du DMD, le contenu FlexDMD, les médias du front-end) sont une ligne, avec leur nombre de fichiers ; la musique est listée fichier par fichier.
Ce que le script attend et qui manque (ROM, dossier du DMD) apparaît en tête de sa sorte, « absente ».
Aux boutons, les flippers parcourent la liste, qui défile pour garder le fichier choisi visible ; Start ouvre le **détail** du fichier : type, dossier complet, taille, date, état, et pour une ROM liée le fichier de la bibliothèque qu'elle partage ; « Bibliothèque de ROM » et « Diagnostiquer et réparer » y mènent quand ils servent.
Dans le dossier commun des tables, seuls les fichiers compagnons de la table (même nom) sont à elle.
L'inventaire est lu à l'ouverture de la fiche, pas à chaque bouton.

Code : [packages/core/src/tablecontents.ts](../../packages/core/src/tablecontents.ts) (inventaire, tests `tablecontents.test.ts`), écrans dans [app/src/table-files.ts](../../app/src/table-files.ts), résumé dans `buildSheet` (`app/src/library.ts`), mise en page `.lib-sheet`, `.lib-files` et `.lib-facts` dans `app/renderer/library.css` ; les lignes à choisir (`Row.pick`) ne répètent pas leur action dans la liste.
