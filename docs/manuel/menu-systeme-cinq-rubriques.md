[English](../manual/system-menu-five-sections.md) · Français · [Sommaire du manuel](../manuel.md)

## Menu système : cinq rubriques

Le menu système (Exit, Tab ou ⚙ depuis l'écran des tables) ne montre que cinq rubriques, puis « Retour aux tables ».
Chaque rubrique s'ouvre sur ses entrées ; Exit (ou « Retour ») remonte d'un cran, la sélection sur la rubrique qu'on quitte.
Un écran ouvert depuis une entrée revient, par son « Retour », à la rubrique d'où l'on venait, la sélection sur cette entrée ; la roue dentée rouvre toujours les rubriques.

**La roue dentée.**
En haut à droite, à droite de la carte du joueur et des pastilles (badges, amis, téléchargements), elle est elle-même une pastille ronde du même gabarit : même hauteur, même haut, même fond, même filet et même survol (filet et anneau verts, jamais un fond carré), à l'écart habituel des autres.
Sur un écran plein (Menu système et ses écrans, Mes badges, aide…), elle suit les pastilles de la ligne de la marque, au même centre que sur l'écran des tables : elle ne saute pas d'un écran à l'autre.
Jusqu'à la 0.1.13, elle devenait carrée au survol et restait décalée par rapport aux pastilles.
Test : [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts).

| Rubrique | Entrées |
| --- | --- |
| Tables | Toutes les tables, Collections, Roue (voir [Roue : ses réglages](medias-des-jeux.md#roue--ses-réglages)), Ajouter une table, Téléchargements, Bibliothèque de ROM |
| Médias | Trouver les médias manquants (sur VPinMediaDB) ; Médias, son et attente |
| Amis | Joueurs en ligne, Messages, Mes amis, Mon avatar, Mon profil public, Historique des parties, Trouver un joueur, Demandes d’amis, Mes badges, Réglages de la communauté, Partage et réseau, Scores des amis pendant la partie, Masquer les notifications pendant les parties (voir [Amis : le réseau des bornes](amis-le-reseau-des-bornes.md#amis--le-réseau-des-bornes)) |
| Borne | Santé de la borne, Fiche technique, Configuration de la borne, Réglages de VPX, Commandes de la borne, DMD (Écran du DMD, DMD du front-end, Couleur du DMD, DMD réel), Bureau Windows (Ouvrir l’Explorateur Windows en [borne dédiée](borne-dediee.md#borne-dédiée)), Borne dédiée, Relance par Start (voir [Relance par Start](relance-par-start.md#relance-par-start)), Mode invité |
| Cyber Pinball | Langue / Language, Mise à jour de Cyber Pinball, Activité récente (voir [Activité récente](activite-recente.md#activité-récente)), Sauvegardes (voir [Sauvegardes](sauvegardes.md#sauvegardes)), Migration, Quitter Cyber Pinball, Redémarrer Cyber Pinball, Mettre en veille, Redémarrer la borne, Éteindre la borne |

« Migration » (dans Cyber Pinball) regroupe ce qui ne sert qu'une fois, en venant d'un autre frontend : « Reprendre les médias » (de PinUP Popper ou PinballX) et « Regrouper les ROM » dans la bibliothèque.

**Menu système > Tables > « Toutes les tables »** : la liste de toutes les tables de la borne, par titre (fabricant · année · version, et « Jouée 12 fois » ou « Jamais jouée »).
Start sur une table ouvre **sa fiche, la même que depuis la roue** (Jouer, Jouer avec un ami, Modifier les informations, Médias du jeu, Parties du jeu, Fichiers de la table, réglages, diagnostic, suppression…) ; son « Retour à la liste des tables » (ou Exit) ramène à la liste, sur cette table, et tout écran ouvert depuis la fiche y revient comme d'habitude.
« Jouer » lance la partie, puis revient à l'écran des tables, la roue sur cette table.
Une table supprimée depuis la liste y ramène.
Code : `openAllTables` et `sheetReturn` dans `app/src/library.ts`.

La pastille rouge d'une entrée (fichiers reçus à installer, mise à jour disponible, écran du DMD à vérifier…) remonte à sa rubrique, puis à la roue dentée ; à l'ouverture, la sélection va sur la première qui en porte une.

L'arbre (rubriques, ordre, nom et icône de chaque entrée) est dans [packages/core/src/systemmenu.ts](../../packages/core/src/systemmenu.ts) (`SYSTEM_ROOT`, `SYSTEM_GROUPS`, `SYSTEM_ITEMS`).
L'application fournit ce que fait chaque entrée par son identifiant (`library.provideSystemItem`, `app/src/library.ts` et `frontend.ts`) ; une nouvelle entrée se range en ajoutant son identifiant à une rubrique, sans toucher aux autres.
[systemmenu.test.ts](../../packages/core/src/test/systemmenu.test.ts) fixe les invariants : chaque entrée rangée une seule fois, une icône par entrée dans une rubrique (et pas celle de la rubrique), chaque entrée fournie par l'application, et **chaque chemin « Menu système > … »** écrit dans ce manuel, sa traduction, les tests manuels, les README et les textes de l'interface nomme des entrées qui existent, dans cet ordre.
Les démonstrations désignent une entrée par son nom (`action:…`) : depuis le menu système, l'autopilote va la chercher dans sa rubrique.

**Un écran se construit sans lire le disque.**
Un écran est reconstruit plusieurs fois à chaque touche (la touche elle-même, la vue, le téléphone), et la touche suivante attend : ce qui lit le disque à proportion des fichiers (une estimation, une liste de sauvegardes, la comparaison d'un plan) se fait à l'ouverture de l'écran, sous un message d'attente (`library.task`), et le résultat est gardé jusqu'au prochain changement connu (copie finie, lecteur branché).
Une construction de plus de `SLOW_BUILD_MS` (40 ms) est signalée une fois au journal avec le nom de l'écran (« Écran « … » lent à construire »).
Le 14/11/2026, « Sauvegarder maintenant » relisait le cache d'empreintes et cherchait chaque fichier sur la clé, pour chaque niveau, à chaque flipper : les appuis se perdaient.
[sauvegardes-menu.test.ts](../../packages/core/src/test/sauvegardes-menu.test.ts) compte les lectures du disque d'écrans reconstruits sur une borne pleine de fichiers.

**Lectures gardées par écran (`kept`).**
Depuis le 17/11/2026, la règle tient pour tous les écrans de la gestion des tables, sans écran à part : ce qu'une construction lit du disque passe par `kept(clé, lecture)` (library.ts ; les modules le reçoivent : médias du jeu, parties du jeu, Classements).
La première construction d'un écran, à son ouverture, lit et garde ; les reconstructions suivantes, celles des touches, reprennent ce qui est gardé.
L'écran relit tout après une action qui le laisse affiché (une suppression, un réglage écrit), à la fin d'une opération longue (`task`), et quand l'application dit que le disque a changé (`library.changed()` : guet des dossiers, téléchargement fini, règles trouvées, scores relevés).
Seules les reconstructions sont chronométrées ; une ouverture de plus de `SLOW_OPENING_MS` (500 ms) est dite à part (« Écran « … » long à ouvrir »).
En essai hors écran, un guet (build-guard.ts) compte chaque lecture faite en reconstruisant un écran, même petite, et la dit au journal avec la fonction et le nom du premier fichier lu (« Écran « … » lit le disque en se construisant : statSync ×6947 »).
Relevé à l'origine : la fiche d'une table à PuP-Pack relevait ses milliers de fichiers à chaque flipper (700 ms), « Ajouter une table » parcourait le dossier d'import et les téléchargements (595 ms).
Les formateurs de dates et de nombres sont aussi gardés par langue (i18n.ts) : en créer un par ligne coûtait 700 ms à un relevé de 460 téléchargements.
[ecrans-rapides.test.ts](../../packages/core/src/test/ecrans-rapides.test.ts) parcourt les écrans sur une borne chargée (300 tables, un PuP-Pack de 3 000 fichiers, des centaines de téléchargements) et exige zéro lecture et moins de 40 ms par reconstruction.
