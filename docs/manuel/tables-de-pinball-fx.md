[English](../manual/pinball-fx-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Pinball FX

Cyber Pinball lance aussi les tables de **Pinball FX** (Zen Studios, 2023), acheté sur Steam ou sur Epic.
**En bêta** : l'entrée de l'entonnoir et la ligne « Pinball FX » de la fiche portent la pastille « BÊTA », l'écran des tables le dit en tête.
Ses tables ne sont pas des fichiers : ce sont des contenus du jeu, désignés par un numéro.
Chacune a dans le dossier des tables un dossier « Titre (Fabricant Année) » avec une **fiche** `.pinballfx` (JSON : `{ "PinballFX": { "Table": 156 } }`), son `.info` et ses médias, comme une table VPX ; la roue, les collections, les favoris, les statistiques et les médias marchent donc de la même façon.

- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Pinball FX »**.
  La liste est le catalogue de Zen (numéro, titre ; fabricant et année des machines Williams et Bally pour retrouver leurs médias), triée par titre.
  Comme pour une table VPX, Start ouvre d'abord sa **fiche d'ajout** : la table (numéro, capture de VPS), puis une carte par média avec son aperçu et sa provenance (VPinMediaDB, fiche d'un site rattachée par VPS avec « Compte … nécessaire » sans compte connecté, capture de VPS pour le plateau), et une carte « Introuvable » pour ceux qui n'ont aucune source ; Start sur une carte prend ou laisse le média.
  Sont pris d'office ceux qui ne téléchargent rien sur un site (VPinMediaDB, capture de VPS, fichier d'une fiche déjà reçue) ; une fiche de site à télécharger est à choisir, et sa carte dit ce qui se passera : sa taille (lue sur sa page), « Pack commun à N tables » quand la base VPS la range sous plusieurs jeux (Cyber Pinball n'y prend que le fichier de la table ; pas d'aperçu, il montrerait une autre table), sinon la capture de l'auteur, et la page du site ouverte le temps de son attente, comptée dans le quota du jour.
  Dans un pack reçu, le fichier de la table est celui qui porte son numéro dans Pinball FX (« Table_97.png », convention des packs de la communauté), sinon son titre ; jamais une vignette du pack (`pthumbs`).
  Rien n'est écrit avant **« Ajouter au front-end »**, en tête, qui ajoute la table puis télécharge en arrière-plan les seuls médias pris.
  Une table déjà dans le front-end porte « Dans le front-end » et Start ouvre sa fiche.
  Cyber Pinball ne sait pas lire quelles tables le joueur possède : il choisit lui-même.
- **Images et médias** : chaque table du catalogue porte son jeu de la base VPS (`vps`, 133 tables sur 146 le 16/11/2026 : celui qui a une version « FX », sinon, pour une machine Williams ou Bally, le jeu de la machine).
  La liste montre en vignette la capture de la table que donne VPS (téléchargée sans bloquer l’écran, par paquets).
  La fiche reçoit cet identifiant en mémoire tant que son `.info` n’en donne pas d’autre : « Trouver les médias manquants » et « Médias du jeu » la reconnaissent, tables déjà ajoutées comprises.
  À l’ajout, en arrière-plan et suivis dans les téléchargements : les médias de VPinMediaDB qui manquent (`fillMissing` en mode `quiet`), puis, sans image du plateau, la capture de VPS (`placeMissingMedia`, source notée dans le `.info`).
  Rien n’est remplacé.
  Ce que VPinMediaDB ne connaît pas (une table propre à Zen, « Back to the Future Pinball ») : logo, fronton et topper viennent ensuite des fiches de VPUniverse ou de VPForums que la base VPS rattache au jeu (`vpsSiteHits`, les `.directb2s` compris : leur image devient le fronton, `b2sBackglassesBeside`), téléchargées avec le compte de l’utilisateur par la file des sites ; dans un pack de logos, le fichier au nom de la table (`pickNamedMedia`), jamais un fichier deviné.
  Sans compte connecté, rien n’est demandé : le message dit ce qui manque et où se connecter.
  L’écran « Tables de Pinball FX » a une entrée **« Chercher les médias manquants »** pour les tables déjà dans le front-end.
- **Type de jeu** : dans la plaque du titre, une puce devant fabricant · année nomme le logiciel qui joue la table, pour toutes les tables : « VPX » (liseré gris) ou « Pinball FX » (vert signal) ; les médaillons (Juke-box, Communauté, Collections) n'en ont pas.
  Sur une borne qui mêle les deux, les collections ont un groupe « Types de jeu » (voir Collections).
  Les noms viennent de `TABLE_ENGINES` (packages/core/src/tables.ts), pareils dans toutes les langues.
- **Installation trouvée** : Steam (dossier lu dans le registre de l'utilisateur, `libraryfolders.vdf`, manifeste `appmanifest_2328760.acf` dont `StateFlags` porte le drapeau 4, « entièrement installé » : Steam écrit le manifeste dès le début du téléchargement), sinon Epic (manifestes `*.item` du lanceur, nom affiché « Pinball FX »).
  Rien n'est mémorisé : un jeu installé ensuite est vu aussitôt.
- **Installer Pinball FX** : Cyber Pinball ne télécharge ni le jeu ni ses tables, contrairement à VPX : c'est un jeu commercial, acheté et téléchargé sur le compte Steam ou Epic du joueur.
  Quand il manque, l'entrée de l'entonnoir devient **« Installer Pinball FX »** : elle lance `steam.exe steam://install/2328760` (la fenêtre d'installation de Steam, ou la page du jeu en boutique s'il n'est pas sur le compte), sinon le lanceur d'Epic sur `com.epicgames.launcher://store/p/pinball-fx`, et amène devant Cyber Pinball la première fenêtre de Steam ou d'Epic parue dans les 20 s.
  Ensuite l'état du jeu est relu toutes les 5 s (deux heures au plus) et l'entonnoir se redessine : « Téléchargement en cours dans Steam » (grisé), puis « Tables de Pinball FX ».
  Ni Steam ni Epic : grisée, avec la raison.
  Une table lancée sans le jeu le dit et donne ce chemin.
- **Lancement** : `steam.exe -applaunch 2328760 -Table <numéro> -GameMode Classic` (Epic : l'exécutable du jeu avec `-Table` et `-GameMode`), arguments documentés par Zen.
  Le jeu est reconnu à sa fenêtre « PinballFX » ; la partie dure tant que son processus vit.
  Un Pinball FX resté ouvert est fermé avant la partie.
  Pinball FX met 20 à 25 s à ouvrir une table : au-delà de 120 s sans fenêtre, la partie échoue avec son explication.
- **Quitter** : quitter la table dans le jeu ramène à son propre menu ; un **appui long sur Exit** (2 s) ferme le jeu et revient à la roue.
  Le cartouche du chargement l'écrit ; le raccourci d'arrêt d'une partie bloquée marche aussi.
- **Ce que Pinball FX ne donne pas** : pas de ROM ni de NVRAM, donc ni tableau des scores ni classement ; pas de VR, pas de réglages en partie, pas de DMD lu par Cyber Pinball.
  Ses écrans, son DMD externe (`DmdDevice64.dll` de dmd-extensions) et l'image de fronton par table (`PinballFX\Mods\Cabinet\Table_<numéro>.png`) se règlent dans le **mode borne** du jeu.
  Sur la fiche, ce qui ne s'applique pas reste à sa place, grisé, avec la raison : « Parties du jeu », « Fichiers de la table », « Réglages de cette table », « Régler l'affichage en partie », « DMD sur la roue », « Jouer et enregistrer », « Diagnostiquer et réparer », « Jouer avec un ami », « Tableau des scores ».
  « Supprimer la table » retire la table du front-end ; elle reste dans Pinball FX.
- **Code** : catalogue, détection et commande dans [packages/core/src/pinballfx.ts](../../packages/core/src/pinballfx.ts) ; fiches dans [packages/core/src/tables.ts](../../packages/core/src/tables.ts) (`addPinballFxTable`, `tableFileEmulator`) ; lanceur dans [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts), installation dans [app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts), partie dans `playPinballFx` (`app/src/frontend.ts`), écrans dans `app/src/library.ts`.
  Le script d'une table n'est lu que dans un `.vpx` (`app/src/vbs.ts`) : une fiche n'a ni ROM ni PuP-Pack.
  Tests : `pinballfx.test.ts`, `pinballfx-launcher.test.ts` (système simulé).
  Démonstration interne hors écran avec un faux Steam (`CYBERPINBALL_STEAM_SIMULE`).
