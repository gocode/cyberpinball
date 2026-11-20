[English](../manual/pinball-fx-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Pinball FX

Cyber Pinball lance aussi les tables de **Pinball FX** (Zen Studios, 2023), acheté sur Steam ou sur Epic.
**En bêta** : l'entrée de l'entonnoir et la ligne « Pinball FX » de la fiche portent la pastille « BÊTA », l'écran des tables le dit en tête.
Pinball FX3 (« Pinball FX Classic ») a sa rubrique : [Tables de Pinball FX3](tables-de-pinball-fx3.md), Future Pinball aussi : [Tables de Future Pinball](tables-de-future-pinball.md).
Ses tables ne sont pas des fichiers : ce sont des contenus du jeu, désignés par un numéro.
Chacune a dans le dossier des tables un dossier « Titre (Fabricant Année) » avec une **fiche** `.pinballfx` (JSON : `{ "PinballFX": { "Table": 156 } }`), son `.info` et ses médias, comme une table VPX ; la roue, les collections, les favoris, les statistiques et les médias marchent donc de la même façon.

- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Pinball FX »**.
  La liste est le catalogue de Zen (numéro, titre ; fabricant et année des machines Williams et Bally pour retrouver leurs médias), triée par titre.
  Comme pour une table VPX, Start ouvre d'abord sa **fiche d'ajout** : la table (numéro, capture de VPS), puis une carte par média avec son aperçu et sa provenance (VPinMediaDB, fiche d'un site rattachée par VPS avec « Compte … nécessaire » sans compte connecté, capture de VPS pour le plateau), et une carte « Introuvable » pour ceux qui n'ont aucune source ; Start sur une carte prend ou laisse le média.
  Sont pris d'office ceux qui ne téléchargent rien sur un site (VPinMediaDB, capture de VPS, fichier d'une fiche déjà reçue) ; une fiche de site à télécharger est à choisir, et sa carte dit ce qui se passera : sa taille (lue sur sa page), « Pack commun à N tables » quand la base VPS la range sous plusieurs jeux (Cyber Pinball n'y prend que le fichier de la table ; pas d'aperçu, il montrerait une autre table), sinon la capture de l'auteur, et la page du site ouverte le temps de son attente, comptée dans le quota du jour.
  Dans un pack reçu, le fichier de la table est celui qui porte son numéro dans Pinball FX (« Table_97.png », convention des packs de la communauté), sinon son titre ; jamais une vignette du pack (`pthumbs`).
  Un média qui a plusieurs sources le dit sur sa carte (« Start : 2 autres choix pour ce média »), et Start les montre tous : chaque version de VPinMediaDB, image ou vidéo, l'image rangée dans le dossier du jeu, la capture de VPS, chaque fiche de VPForums ou de VPUniverse.
  Pour le fronton s'y ajoute en dernier l'image du catalogue « FX3 Backglass art » d'archive.org (images faites par des joueurs), un choix de plus, jamais pris d'office.
  Start sur un choix remplace celui de la fiche, et c'est lui qui arrive après l'ajout ; « Laisser ce média » l'écarte ; les autres médias ne changent pas.
  Rien n'est écrit avant **« Ajouter au front-end »**, en tête, qui ajoute la table puis télécharge en arrière-plan les seuls médias pris.
  Les médias de la table s'ouvrent aussitôt après l'ajout, comme pour une table VPX : on y voit chaque média arriver, et chacun s'y remplace (VPinMediaDB, sites, web, fichier de ce PC), se règle et s'enregistre.
  Une table déjà dans le front-end porte « Dans le front-end » et Start ouvre sa fiche.
  Cyber Pinball ne sait pas lire quelles tables le joueur possède : il choisit lui-même.
- **Images et médias** : chaque table du catalogue porte son jeu de la base VPS (`vps`, 133 tables sur 146 le 16/11/2026 : celui qui a une version « FX », sinon, pour une machine Williams ou Bally, le jeu de la machine).
  Une table que le catalogue ne relie à aucun jeu, souvent une table propre à Zen, est reconnue à son titre exact parmi les jeux de la base VPS qui ont une table de Zen (titre comparé sans casse, accents, ponctuation ni le mot « Pinball » ; deux jeux au même titre : aucun, jamais deviné).
  La liste montre en vignette la capture de la table que donne VPS (téléchargée sans bloquer l’écran, par paquets).
  La fiche reçoit cet identifiant en mémoire tant que son `.info` n’en donne pas d’autre : « Trouver les médias manquants » et « Médias du jeu » la reconnaissent, tables déjà ajoutées comprises.
  À l’ajout, en arrière-plan et suivis dans les téléchargements : les médias de VPinMediaDB qui manquent (`fillMissing` en mode `quiet`), puis, sans image du plateau, la capture de VPS (`placeMissingMedia`, source notée dans le `.info`).
  Rien n’est remplacé.
  Ce que VPinMediaDB ne connaît pas (une table propre à Zen, « Back to the Future Pinball ») : logo, fronton et topper viennent ensuite des fiches de VPUniverse ou de VPForums que la base VPS rattache au jeu (`vpsSiteHits`, les `.directb2s` compris : leur image devient le fronton, `b2sBackglassesBeside`), téléchargées avec le compte de l’utilisateur par la file des sites ; dans un pack de logos, le fichier au nom de la table (`pickNamedMedia`), jamais un fichier deviné.
  Sans compte connecté, rien n’est demandé : le message dit ce qui manque et où se connecter.
  L’écran « Tables de Pinball FX » a une entrée **« Chercher les médias manquants »** pour les tables déjà dans le front-end.
- **Type de jeu** : dans la plaque du titre, une puce devant fabricant · année nomme le logiciel qui joue la table, pour toutes les tables : « VPX » (liseré gris), ou « Pinball FX », « Pinball FX3 », « Future Pinball » (vert signal) ; les médaillons (Juke-box, Communauté, Collections) n'en ont pas.
  Sur une borne qui en mêle plusieurs, les collections ont un groupe « Types de jeu » (voir Collections).
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
- **Rotation de l'image sur une borne** : avant chaque partie, Cyber Pinball règle la rotation forcée de l'image du jeu (Options > Vidéo du jeu) dans le même sens que ses propres fenêtres du playfield, pour un joueur placé au bord des flippers.
  La table est face au joueur au lieu de rester en paysage.
  Le réglage est écrit dans `LocalSettings.cfg` (`%LOCALAPPDATA%\PinballFX\Saved\PersistentDownloadDir\<boutique>\LocalSettings.cfg`, section `video` : `useForcedDisplayRotation`, et `forcedDisplayRotation` à `Rot_90`, `Rot_180` ou `Rot_270`), le reste du fichier gardé tel quel.
  Un PC dont l'écran du playfield est droit garde le réglage du joueur.
  Un jeu jamais ouvert sur ce PC n'a pas encore ce fichier : la rotation est écrite avant la partie suivante.
  Pinball FX3 n'a pas d'équivalent : ses réglages sont chiffrés (voir [Tables de Pinball FX3](tables-de-pinball-fx3.md)).
- **Mode borne réglé par Cyber Pinball** : rien à régler dans le menu « Cabinet Support » du jeu.
  Avant chaque partie, Cyber Pinball active le mode borne et pose la fenêtre du DMD du jeu sur l'écran DMD de la borne, d'après sa propre configuration des écrans ; sur un FullDMD, le DMD prend la bande centrale au format 4:1, comme celui de Visual Pinball.
  La fenêtre du fronton du jeu est éteinte : une seule image sur le fronton, celle choisie à l'ajout de la table, affichée par Cyber Pinball comme hors du mode borne.
  Allumée, elle se posait par-dessus et, son image absente (menus du jeu, table choisie dans le jeu), montrait le chemin du fichier qu'elle cherchait ; aucune image n'est déposée dans le dossier du mode borne du jeu.
  Seules l'activation, la place et la taille du DMD et l'extinction du fronton sont écrites dans `<jeu>\PinballFX\Mods\Cabinet\Settings.ini` ; le reste (DMD externe, marges, taille des points, numéro d'écran) est laissé tel quel, et un fichier en UTF-16 le reste.
  Ce fichier n'existe qu'une fois « Cabinet Support » ouvert une fois dans le jeu : sans lui, rien n'est écrit, et la partie se lance quand même.
- **DMD envoyé à dmdext** : avec l'option « appareil externe » de son mode borne (`DmdDevice64.dll` de dmd-extensions : colorisation, PuP-Packs), le jeu ouvre le DMD virtuel de dmdext, là où `DmdDevice.ini` le place, parfois par-dessus le fronton.
  Pendant la partie, Cyber Pinball le pose sur l'écran DMD de la borne tel qu'il est, comme le DMD de Future Pinball : toute la largeur de l'écran, au format 4:1, au milieu.
  Un DMD virtuel déjà entier sur l'écran DMD reste où il est.
- **Boutons d'une borne à joystick** (Pinscape, encodeur en mode manette) : Pinball FX et Pinball FX3 ne lisent que le clavier et les manettes Xbox, pas un joystick.
  Pendant la partie, chaque bouton de joystick relevé par l'assistant envoie au jeu la touche que son écran Options > Contrôles > Clavier attend pour son rôle.
  Flippers sur Maj gauche et Maj droite, lanceur et Start sur Entrée (lancer, valider), Exit et Pause sur Échap (retour, pause), MagnaSave gauche et droit sur les flèches haut et bas, tremblements gauche, droit et avant sur Alt gauche, Alt droite et Espace.
  Dans les menus du jeu, les flippers parcourent la barre du haut, les MagnaSave les fenêtres qu'elle ouvre, Start valide et Exit revient.
  En partie, les flèches haut et bas sont aussi la vue du fronton et le tir droit de Judge Dredd.
  Crédit, porte du monnayeur et tilt n'ont pas de commande dans le jeu ; les boutons de volume restent à Cyber Pinball (son de Windows).
  Les touches ne partent que quand le jeu est au premier plan, jamais en double vers le front-end ; celles encore tenues sont relâchées à la fin de la partie.
  En mode borne, le jeu ouvre plusieurs fenêtres (table, fronton, DMD), et le clavier pouvait aller à celle du fronton ou du DMD, que la table n'écoute pas.
  Avant chaque appui, et deux fois par seconde, la fenêtre de la table (la plus grande du jeu) reprend donc le premier plan quand une autre fenêtre du jeu l'a ; le journal nomme la première fenêtre ainsi corrigée.
  À la fin de chaque partie, le journal compte les appuis envoyés au jeu, ceux gardés parce que le jeu n'était pas au premier plan, et les reprises du premier plan par la table.
  Les boutons d'un encodeur clavier envoient leurs propres touches, que le jeu reçoit telles quelles : Cyber Pinball n'y touche pas.
  Rien à installer (ni x360ce ni JoyToKey).
- **Écrans pendant la partie** : le front-end relève les écrans où le jeu dessine lui-même (fronton, DMD ou topper de son mode borne), d'après les seules fenêtres du jeu, jamais celles de Windows ni d'un autre programme.
  Il leur laisse la place : sa fenêtre passe derrière celle du jeu, sans lui prendre le premier plan, et son fond y reste figé.
  Une fenêtre du front-end passe derrière dès qu'elle couvre la moitié de l'écran que le jeu occupe : au passage du jeu en plein écran, Windows déplace des écrans, et une fenêtre décalée de quelques pixels n'était plus reconnue comme cachant le jeu (l'image du chargement restait devant le fronton de Future Pinball toute la partie).
  Une petite fenêtre, comme une notification, reste devant.
  Les autres écrans montrent leur média selon « Médias pendant la partie » (voir [Médias des jeux](medias-des-jeux.md)).
  Un jeu qui change la définition d'un écran pendant la partie ne déplace pas les fenêtres du front-end : chacune suit l'écran de son rôle, reconnu à son identité et non à ses anciennes coordonnées.
  Une fenêtre trouvée sur l'écran d'un autre rôle est notée dans le journal et reposée sur le sien.
- **Ce que Pinball FX ne donne pas** : pas de ROM ni de NVRAM, donc ni tableau des scores ni classement ; pas de VR, pas de réglages en partie, pas de DMD lu par Cyber Pinball.
  Son DMD externe (`DmdDevice64.dll` de dmd-extensions), ses marges et la taille de ses points se règlent dans le **mode borne** du jeu ; Cyber Pinball n'y écrit que la rotation de l'image, l'activation, la place du DMD et l'extinction du fronton.
  Sur la fiche, ce qui ne s'applique pas reste à sa place, grisé, avec la raison : « Parties du jeu », « Fichiers de la table », « Réglages de cette table », « Régler l'affichage en partie », « DMD sur la roue », « Jouer et enregistrer », « Diagnostiquer et réparer », « Jouer avec un ami », « Tableau des scores ».
  « Supprimer la table » retire la table du front-end ; elle reste dans Pinball FX.
- **Code** : catalogue, détection et commande dans [packages/core/src/pinballfx.ts](../../packages/core/src/pinballfx.ts) ; fiches dans [packages/core/src/tables.ts](../../packages/core/src/tables.ts) (`addPinballFxTable`, `tableFileEmulator`) ; lanceur dans [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts), installation dans [app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts), partie dans `playPinballFx` (`app/src/frontend.ts`), écrans dans `app/src/library.ts`.
  Rotation, mode borne et touches des boutons dans [packages/core/src/pinballfx-cabinet.ts](../../packages/core/src/pinballfx-cabinet.ts) (`applyPinballFxRotation`, `applyPinballFxCabinet`, `ZEN_GAME_KEYS`), envoi des touches et reprise du premier plan dans [app/src/zen-keys.ts](../../app/src/zen-keys.ts), DMD virtuel de dmdext dans `placeVirtualDmd` ([app/src/futurepinball-play.ts](../../app/src/futurepinball-play.ts)) ; médias de l'ajout dans [packages/core/src/zen-media.ts](../../packages/core/src/zen-media.ts) ; écrans pendant la partie dans [packages/core/src/gamescreens.ts](../../packages/core/src/gamescreens.ts) (`followDisplays`, `misplacedWindows`, `gameScreens`) et [app/src/game-screens.ts](../../app/src/game-screens.ts).
  Le script d'une table n'est lu que dans un `.vpx` (`app/src/vbs.ts`) : une fiche n'a ni ROM ni PuP-Pack.
  Tests : `pinballfx.test.ts`, `pinballfx-launcher.test.ts` (système simulé), `pinballfx-cabinet.test.ts`, `gamescreens.test.ts`.
  Démonstration interne hors écran avec un faux Steam (`CYBERPINBALL_STEAM_SIMULE`).
