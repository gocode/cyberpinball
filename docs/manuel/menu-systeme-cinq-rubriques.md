[English](../manual/system-menu-five-sections.md) · Français · [Sommaire du manuel](../manuel.md)

<a id="menu-système--huit-rubriques"></a>

## Menu système : neuf rubriques

Le menu système (Exit, Tab ou ⚙ depuis l'écran des tables) tient en neuf rubriques, dans l'ordre de l'usage : Tables, Ma borne, Téléchargements, Activité récente, Communauté, Arène, Juke-box, Aide et infos, Quitter ou éteindre, puis « Retour aux tables ».
Téléchargements, Activité récente et Juke-box ouvrent directement leur écran ; les six autres s'ouvrent sur leurs entrées.
Hors racine à neuf rubriques, aucun écran du menu n'a plus de huit lignes, « Retour » non compris : la liste se lit d'un coup d'œil.
Chaque entrée n'a qu'une place, et la racine n'a pas de raccourci qui double une rubrique.
La ligne d'une rubrique dit ce qu'elle contient, jamais l'état ni le badge BÊTA d'une de ses entrées : ils se lisent en entrant, sur l'entrée qu'ils concernent.
Le menu s'ouvre le curseur sur la dernière ligne choisie à sa racine, même après un redémarrage (gardée dans `<données>\menu-systeme.json`) ; celui qui l'ouvre surtout pour éteindre retrouve son curseur sur « Quitter ou éteindre ».
Chaque rubrique s'ouvre sur ses entrées ; Exit (ou « Retour ») remonte d'un cran, la sélection sur la rubrique qu'on quitte.
Un écran ouvert depuis une entrée revient, par son « Retour », à la rubrique d'où l'on venait, la sélection sur cette entrée ; la roue dentée rouvre toujours les rubriques.

**La roue dentée.**
En haut à droite, à droite de la carte du joueur et des pastilles (badges, amis, téléchargements), elle est elle-même une pastille ronde du même gabarit : même hauteur, même haut, même fond, même filet et même survol (filet et anneau verts, jamais un fond carré), à l'écart habituel des autres.
Sur un écran plein (Menu système et ses écrans, Mes badges, aide…), elle suit les pastilles de la ligne de la marque, au même centre que sur l'écran des tables : elle ne saute pas d'un écran à l'autre.
Jusqu'à la 0.1.13, elle devenait carrée au survol et restait décalée par rapport aux pastilles.
Test : [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts).

| Rubrique | Entrées |
| --- | --- |
| Tables | Toutes les tables, Collections (voir [Collections et favoris](medias-des-jeux.md#collections-et-favoris)), Roue (voir [Roue : ses réglages](medias-des-jeux.md#roue--ses-réglages)), Ajouter une table, Trouver les médias manquants (sur VPinMediaDB), Bibliothèque de ROM, Son et mode attente, Migration (Reprendre les médias, Regrouper les ROM) |
| Ma borne | Configuration de la borne (Boutons, Écrans, Son de la borne, Mode nuit, Langue / Language, Configurations de la borne, Assistant complet : voir [Assistant et menu de configuration](assistant-et-menu-de-configuration.md#assistant-et-menu-de-configuration)), VPX (Pré-réglages, Réglages de VPX, Autres versions de VPX, et VPX d’essai sur une machine de développement : voir [Autres versions de VPX](autres-versions-de-vpx.md#autres-versions-de-vpx)), DMD et LED (Écran du DMD, DMD du front-end, Couleur du DMD, DMD réel, LED et retours (DOF)), Réalité virtuelle et vision 3D (Réalité virtuelle, Caler la borne, Manettes du casque, Recopie sur le playfield, Sortie audio en VR, Vision 3D, Lunettes 3D), Télécommande du téléphone, Démarrage et accès (Borne dédiée, Lancement au démarrage, Relance par Start : voir [Relance par Start](relance-par-start.md#relance-par-start), Mode invité), Santé et sauvegardes (Santé de la borne, Fiche technique, Mode débogage, Sauvegardes : voir [Sauvegardes](sauvegardes.md#sauvegardes)) |
| Téléchargements | L'écran des téléchargements (voir [Téléchargements et sélecteur de fichiers](telechargements-et-selecteur-de-fichiers.md#téléchargements-et-sélecteur-de-fichiers)) |
| Activité récente | Les notifications des derniers jours, en entier (voir [Activité récente](activite-recente.md#activité-récente)) |
| Communauté | Accueil, Messages, Joueurs, Groupes, Salons et Profil ; réglages de la communauté. Voir [Communauté](amis-le-reseau-des-bornes.md#communauté--le-réseau-des-bornes). |
| Arène | Parties en direct, Classements et Progression (Mon niveau, Mes badges, Historique des parties) ; le médaillon ouvre aussi l’Arène, ses scores, tables du jour et défis. |
| Juke-box | L'écran du Juke-box, d'où s'ouvrent aussi ses réglages (voir [Réglages du Juke-box](medias-des-jeux.md#réglages-du-juke-box)) |
| Aide et infos | Rechercher, Commandes de la borne, Nouveautés (voir [Nouveautés](nouveautes.md#nouveautés)), Mise à jour de Cyber Pinball, Retours et propositions (voir [Retours et propositions](retours-et-propositions.md#retours-et-propositions)), Nous suivre, Conditions d’utilisation, Crédits (voir [Crédits de la communauté](credits-de-la-communaute.md#crédits-de-la-communauté)) |
| Quitter ou éteindre | Bureau Windows (Ouvrir l’Explorateur Windows en [borne dédiée](borne-dediee.md#borne-dédiée)), Quitter Cyber Pinball, Redémarrer Cyber Pinball, Mettre en veille, Redémarrer la borne, Éteindre la borne (voir [Éteindre, mettre en veille, redémarrer la borne](eteindre-mettre-en-veille-redemarrer-la-borne.md#éteindre-mettre-en-veille-redémarrer-la-borne)) |

Ma borne reçoit ce qui changerait si l'on installait Cyber Pinball sur une autre borne : le matériel, les écrans, VPX, Windows, la langue de la borne.
« Migration » (dans Tables) regroupe ce qui ne sert qu'une fois, en venant d'un autre front-end : « Reprendre les médias » (de PinUP Popper ou PinballX) et « Regrouper les ROM » dans la bibliothèque.
Une rubrique dont il ne reste rien sur cette borne (jeu local, entrées absentes) n'est pas montrée.

**Menu système > Tables > « Toutes les tables »** : la liste de toutes les tables de la borne, par titre (fabricant · année · version, et « Jouée 12 fois » ou « Jamais jouée »).
Start sur une table ouvre **sa fiche, la même que depuis la roue** (Jouer, Jouer avec un ami, Modifier les informations, Médias du jeu, Parties du jeu, Fichiers de la table, réglages, diagnostic, suppression…) ; son « Retour à la liste des tables » (ou Exit) ramène à la liste, sur cette table, et tout écran ouvert depuis la fiche y revient comme d'habitude.
« Jouer » lance la partie, puis revient à l'écran des tables, la roue sur cette table.
Une table supprimée depuis la liste y ramène.
Code : `openAllTables` et `sheetReturn` dans `app/src/library.ts`.

La pastille rouge d'une entrée (fichiers reçus à installer, mise à jour disponible, écran du DMD à vérifier, code de récupération à noter…) remonte à sa rubrique, puis à la roue dentée ; à l'ouverture d'une rubrique, la sélection va sur la première qui en porte une (à la racine, sur la dernière ligne choisie, s'il y en a une).

L'arbre (rubriques, ordre, nom et icône de chaque entrée) est dans [packages/core/src/systemmenu.ts](../../packages/core/src/systemmenu.ts) (`SYSTEM_ROOT_ENTRIES`, `SYSTEM_GROUPS`, `SYSTEM_ITEMS`) ; la mémoire de la dernière ligne choisie, dans [packages/core/src/systemmemory.ts](../../packages/core/src/systemmemory.ts).
L'application fournit ce que fait chaque entrée par son identifiant (`library.provideSystemItem`, `app/src/library.ts` et `frontend.ts`) ; une nouvelle entrée se range en ajoutant son identifiant à une rubrique, sans toucher aux autres.
[systemmenu.test.ts](../../packages/core/src/test/systemmenu.test.ts) fixe les invariants : huit lignes au plus par écran (`MAX_SYSTEM_ENTRIES`), chaque entrée rangée une seule fois, une icône par entrée dans une rubrique (et pas celle de la rubrique), chaque entrée fournie par l'application, et **chaque chemin « Menu système > … »** écrit dans ce manuel, sa traduction, les tests manuels, les README et les textes de l'interface nomme des entrées qui existent, dans cet ordre.
Les démonstrations désignent une entrée par son nom (`action:…`) : depuis le menu système, l'autopilote va la chercher dans sa rubrique.

**Rechercher dans le Menu système** (Menu système > Aide et infos > « Rechercher », `systemsearch.ts`).
Tape une lettre (clavier à l'écran, vrai clavier ou téléphone) : les réglages, rubriques et mots-clés qui correspondent s'affichent à chaque lettre.
Un résultat ouvre son écran, le curseur posé sur le réglage.
Le bouton de retour d'un écran ouvert après une saisie au clavier à l'écran mène à l'écran d'avant la saisie, plus au clavier.

**Mode débogage** (Menu système > Ma borne > Santé et sauvegardes > « Mode débogage »).
Il affiche en direct, dans un coin de l'écran de ton choix (le backglass par défaut, sinon le DMD, sinon le playfield), les mesures de tous tes écrans : cadence de chaque fenêtre du front-end, cadence de VPX en partie sur la dernière minute, à-coups et leur cause probable, temps de chargement des médias et étapes du lancement, processeur, mémoire, carte graphique.
Une ligne compacte ou un panneau détaillé ; sur le DMD, une bande lisible de loin.
Il ne gêne pas la partie : la fenêtre est transparente, ne prend jamais le focus ni les clics, n'apparaît pas dans les enregistrements et ne s'ouvre jamais dans le casque ; sur le playfield, le panneau est réduit pour ne pas cacher la table.
Éteint, rien ne tourne.
« Joindre aux rapports », dans le même écran, ajoute les mesures des 10 dernières minutes au rapport technique (fichier `debogage.json`, sans chemin ni nom de compte).
Le plugin du DMD de VPX ne dit sa cadence chaque seconde que si Cyber Pinball le lui demande, à la prochaine fabrication du plugin.
Avec le mode débogage allumé, « Bureau Windows » (Ctrl+Maj+D) fonctionne comme d'habitude : sa fenêtre se retire au bureau au lieu de ramener aussitôt le front-end.

**Mise à jour automatique au lancement** (Menu système > Aide et infos > « Mise à jour de Cyber Pinball »).
Une case « Mise à jour automatique au lancement », cochée par défaut : au démarrage, une version plus récente se télécharge et s'installe d'elle-même, jamais pendant une partie, et sans nouvel essai si la précédente n'a pas abouti.
« Annuler » pendant le téléchargement la remet à plus tard ; décocher la case revient à la simple pastille rouge.
Une mise à jour légère lancée après une relance par Start ne ferme plus l'application sans rien installer : l'arrêt du veilleur de la relance par Start ne touche plus à l'application qui le demande, ni à l'installeur ; après une mise à jour interrompue, le journal dit « Mise à jour interrompue » et les écrans retrouvent leur orientation d'origine.
Après une mise à jour légère, Cyber Pinball ne reste plus figé une minute au lancement : l'ancienne version se retire sans rien bloquer, et le veilleur resté sur l'ancienne version est arrêté puis relancé depuis la nouvelle.

**Réalité virtuelle et vision 3D : nouveautés de la 0.2.4** (Menu système > Ma borne > Réalité virtuelle et vision 3D).
- **Casques Pimax** (runtime Pimax OpenXR) : ils démarrent maintenant ; si le runtime refuse quelque chose, l'erreur est écrite dans le journal du casque au lieu d'une relance silencieuse en boucle toutes les 2 secondes.
  Si le compagnon du casque s'arrête juste après son lancement sans que tu aies porté le casque, Cyber Pinball attend de plus en plus longtemps avant de réessayer (jusqu'à 5 minutes).
- **Casque débranché ou retiré** avec la réalité virtuelle activée : Cyber Pinball ne le cherche plus pendant une partie sur les écrans (ces essais, toutes les 15 secondes, faisaient sauter des images à VPX).
- **Lunettes actives NVIDIA 3D Vision (bêta)** : « Lunettes 3D » > « Lunettes » passe des lunettes à filtres colorés aux lunettes actives.
  Chaque œil voit la table à la pleine définition, le fronton et le DMD restent à plat.
  Il faut une carte GeForce, le pilote NVIDIA 452.06 au plus avec la 3D activée, l'émetteur, et le playfield en écran principal ; un mode au-delà de ce que l'émetteur synchronise (environ 2560x1440 à 120 Hz, et 100 Hz au moins) est signalé, mais un playfield en 4K n'est plus déclaré hors de portée à tort.
  L'écran vérifie chacun de ces points (pilote et version, 3D activée, émetteur branché, écran principal, version de VPX, écran du playfield retrouvé par son nom) et donne la marche à suivre pour ce qui manque ; la santé de la borne le signale aussi.
  Tant qu'il manque quelque chose, les parties se jouent à plat ; ce qui n'a pas pu être vérifié est signalé, et la partie tente la 3D quand même.
  Après chaque partie, l'écran dit si la 3D s'est bien activée.
  Cyber Pinball active lui-même la 3D stéréoscopique du pilote avant chaque partie en relief et la coupe après : il n'est plus nécessaire de la cocher dans le Panneau NVIDIA.
  Toute autre partie (à plat, dans le casque, avec un autre VPX) se lance la 3D du pilote coupée, car active elle faisait disparaître des éléments des tables.
  Quand 3D Fix Manager est ouvert, il empêche d'activer la 3D (bouton « Enable 3D ») : l'écran et la partie le disent (« 3D Fix Manager bloque la 3D : ferme-le », par-dessus la partie) ; Cyber Pinball retente à chaque partie, donc fermer 3D Fix Manager suffit, sans relancer Cyber Pinball.
  Cyber Pinball ne reste plus figé sur la première image de l'ouverture quand la 3D du pilote est activée (Panneau NVIDIA ou « Enable 3D ») : il la coupe au lancement, avant d'ouvrir ses fenêtres, et la rallume pour chaque partie en relief ; si un programme la remet aussitôt, c'est noté dans le journal des incidents avec la marche à suivre.
  La lecture du pilote ne fige plus le front-end au lancement (environ 5 s), ni à la Santé de la borne et au lancement d'une partie en relief ; un second lancement de Cyber Pinball, déjà ouvert, ne coupe plus la 3D d'une partie en relief en cours.
  VPX corrigé, série 7 : le mode direct de NVIDIA 3D Vision (Direct3D 11, plein écran exclusif sur le playfield, chaque œil présenté au pilote) ; en cas d'échec, la partie continue avec les deux vues côte à côte, et le journal de VPX dit pourquoi.

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
