[English](../manual/game-page-its-files.md) · Français · [Sommaire du manuel](../manuel.md)

## Fiche d'une table : ses fichiers

**Ses actions** : la fiche tient en quelques choix.
En tête, « Jouer », « Jouer avec un ami » et « Prospectus et règles » : un seul livret, le prospectus (ou la fiche générée) puis les règles (cartes, textes et vidéo trouvés seuls, et toujours les commandes de la partie en dernier) ; les flippers passent d'une page à l'autre, de l'un à l'autre, Start tourne la page puis revient à la fiche après la dernière, et la souris saute à l'autre partie.
Tout le reste est rangé sous **« Gérer la table… »** : « Pour aller plus loin », « Médias du jeu », « Parties du jeu », « Fichiers de la table », « PuP-Pack », « Réglages de cette table », « Jouée avec … » (seulement quand un autre VPX est ajouté, voir [Autres versions de VPX](autres-versions-de-vpx.md#autres-versions-de-vpx)), « Régler l'affichage en partie », « Jouer et enregistrer », « Diagnostiquer et réparer », « Modifier les informations », « Supprimer la table ».
Son détail dit, dès la fiche, ce qui demande un œil (« À vérifier : Fichiers de la table, PuP-Pack »), en orange.
Les écrans ouverts de là y reviennent (`sheetManage`, `app/src/library.ts`) ; Exit sur « Gérer la table » ramène à la fiche.
« Ce qu'il manque pour jouer » reste en tête de la fiche, avant « Jouer ».
En mode invité, la porte `sheet.manage` est fermée : la fiche garde « Jouer », « Prospectus et règles » et le retour.
Les démonstrations nomment une action rangée sous « Gérer la table… » par son nom, et l'autopilote y passe, comme pour une entrée du menu système (`activateByLabel`).

La fiche d'une table (Start sur une table du front-end) montre ses statistiques sur une ligne et un **résumé borné** de ses fichiers : une ligne par sorte présente (table, backglass, ROM, contenu du DMD, vidéos PuP, couleurs du DMD, sons alternatifs, musique, réglages propres, médias), trois noms au plus par ligne (« t2_l3, t2_l4 et 4 autres »), une ligne « Absents » pour les sortes manquantes et une ligne « À vérifier » (backglass mal nommé, script remplacé par un `.vbs`, rapport de plantage, volume de la ROM bas).
Après la ROM, une ligne « Volume de la ROM » dit, pour une machine qui garde son volume dans sa mémoire, celui que la ROM jouera et ce que Cyber Pinball en fait (« 12 sur 31, d'usine, faible : monté à 23 avant la partie », « 18 sur 31 (votre réglage) »…, voir [Volume de la ROM](son.md#volume-de-la-rom)).
Une table qui rame ou saccade sur la borne le dit dans « Diagnostiquer et réparer », avec les chiffres de sa dernière partie (voir [Santé de la borne](sante-de-la-borne.md#santé-de-la-borne)).
« Diagnostiquer et réparer » propose aussi « Envoyer un rapport aux développeurs » : d'un appui, les constats de la table, ce qui vient d'être réparé, la fiche technique et les journaux, chiffrés et anonymisés ; une description reste facultative, et sans constat le détail dit « Un souci que le diagnostic ne voit pas ».
En hauteur (borne, playfield tourné, ou écran portrait), les informations gardent leur place et les actions passent sur deux colonnes ; la liste des actions défile si elle dépasse.
Sur une borne, la liste des actions mangeait toute la hauteur : avec beaucoup de fichiers, seule la première ligne des statistiques restait visible.

**« Supprimer la table »** (sous « Gérer la table… ») montre ce qui part et sa taille, puis « Mettre à la corbeille » déplace le dossier de la table (ou, dans le dossier commun des tables, ses seuls fichiers) dans la corbeille de Cyber Pinball (`<racine>\trash\<date> Table <titre>`) : rien n'est effacé.
Cela marche aussi pour la table affichée sur la roue : ses vidéos sont lues morceau par morceau, et Cyber Pinball ne garde aucun fichier ouvert entre deux morceaux (`app/src/media-response.ts`), si bien que Windows laisse déplacer son dossier.
Une table reprise d'une autre installation par liens physiques n'y perd que les noms de Cyber Pinball : les fichiers de l'installation d'origine restent intacts.
Si un fichier de la table est ouvert dans un autre programme (VPX, un lecteur vidéo, l'Explorateur de fichiers…), Windows refuse le déplacement : l'écran « Opération impossible » dit quel fichier est tenu et, quand Windows le sait, par quel programme (« « Table.mp4 » est ouvert dans … : fermez-le, puis réessayez. »), puis « Continuer » revient à l'écran d'avant.
Toute action du front-end qui échoue est rattrapée et dite de la même façon (`runAction` de `app/src/library.ts`, `fileErrorText` de `packages/core/src/fileerror.ts`, programme qui tient le fichier lu par le gestionnaire de redémarrage de Windows, `packages/win-displays/src/file-holders.ts`) : disque plein, fichier disparu, ou autre raison donnée telle quelle.
Tests : `fichiers-refuses.test.ts`, `medias-sans-verrou.test.ts`, `medias-sans-verrou-chromium.test.ts`.

**« Fichiers de la table »** (action de la fiche, détail « 66 fichiers · 940 ko · 3 à vérifier ») : tout le dossier de la table, groupé par sorte, la table et ses frontons d'abord.
Chaque fichier y est une ligne à choisir, avec son nom entier (il passe à la ligne), son dossier dans celui de la table, son état et sa taille : « cette table » ou « autre version du dossier », backglass « chargé par VPX avec cette table » ou « mal nommé : VPX ne le chargera pas », ROM « lien vers la bibliothèque de ROM », « copie à part : la bibliothèque a aussi cette ROM » ou « propre à la table », « demandée par le script », sauvegarde et réglages de PinMAME, script de remplacement, rapport de plantage.
Les dossiers qu'on range d'un bloc (un PuP-Pack, des sons alternatifs, des couleurs du DMD, le contenu FlexDMD, les médias du front-end) sont une ligne, avec leur nombre de fichiers ; la musique est listée fichier par fichier.
Ce que le script attend et qui manque (ROM, dossier du DMD) apparaît en tête de sa sorte, « absente ».
Aux boutons, les flippers parcourent la liste, qui défile pour garder le fichier choisi visible ; Start ouvre le **détail** du fichier : type, dossier complet, taille, date, état, et pour une ROM liée le fichier de la bibliothèque qu'elle partage ; « Bibliothèque de ROM » et « Diagnostiquer et réparer » y mènent quand ils servent.
Dans le dossier commun des tables, seuls les fichiers compagnons de la table (même nom) sont à elle.
L'inventaire est lu à l'ouverture de la fiche, pas à chaque bouton.

Code : [packages/core/src/tablecontents.ts](../../packages/core/src/tablecontents.ts) (inventaire, tests `tablecontents.test.ts`), écrans dans [app/src/table-files.ts](../../app/src/table-files.ts), résumé dans `buildSheet` (`app/src/library.ts`), mise en page `.lib-sheet`, `.lib-files` et `.lib-facts` dans `app/renderer/library.css` ; les lignes à choisir (`Row.pick`) ne répètent pas leur action dans la liste.
