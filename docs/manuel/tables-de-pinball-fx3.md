[English](../manual/pinball-fx3-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Pinball FX3

Cyber Pinball lance aussi les tables de **Pinball FX3** (Zen Studios, 2017), renommé **« Pinball FX Classic »** sur Steam en avril 2026.
Beaucoup de bornes l'ont encore, avec des tables achetées qui ne passent pas dans [Pinball FX](tables-de-pinball-fx.md).
**En bêta**, comme Pinball FX : pastille « BÊTA » sur l'entrée de l'entonnoir et sur la fiche.
Pinball FX2 n'est pas pris en charge : ancien, sans lancement direct fiable.
Tout ce qui suit vaut pour la version Steam, installée par Steam ou rangée dans un dossier choisi à la main : les versions Microsoft Store et consoles n'ont ni mode borne ni lancement direct (le jeu a quitté les boutiques Microsoft en mai 2026).

Pinball FX et Pinball FX3 sont deux variantes d'un même code, les « jeux de Zen » ([packages/core/src/zen.ts](../../packages/core/src/zen.ts)) : même écran d'ajout, même fiche d'ajout avec ses médias, même partie, même retour.
Ce qui change d'un jeu à l'autre est décrit ici.

- **Ce que le jeu demande au joueur** : rien à Zen.
  Le **code borne** qu'il fallait demander à Zen n'existe plus depuis la mise à jour 1.0.26.1 du 4 novembre 2024 : le mode borne se débloque pour tout le monde (un usage commercial demande toujours l'accord de Zen).
  Il reste à l'**activer une fois** dans le jeu : icône de borne à côté du profil, puis « Activer ».
  Sans mode borne, ou sans la table sur le compte Steam, le jeu s'ouvre sur son écran d'accueil au lieu de la table.
  Seules **Fish Tales** et **Sorcerer's Lair** sont gratuites, sur tous les comptes ; les autres tables ne s'ouvrent que si elles sont achetées sur le compte Steam, et les messages de Cyber Pinball le rappellent pour elles seulement.
  L'écran « Tables de Pinball FX3 » le dit en tête, avec l'adresse de l'aide de Zen (`pinballfx.com/?page_id=7754`) ; la fiche d'une table a une ligne « Mode borne ».
- **Première ouverture du jeu sur ce PC** : tant que Pinball FX3 n'a jamais été ouvert sur ce PC (pas de `SystemConfigCache.dat` dans son dossier), son mode borne n'y est pas activé et il s'ouvrirait sur son écran d'accueil, en paysage.
  Avant de lancer la table, Cyber Pinball affiche alors « Première ouverture de Pinball FX3 sur ce PC » : ce qu'il faut faire dans le jeu (icône de borne à côté du profil, « Activer », puis l'orientation à saisir, d'après le côté des flippers de ta borne ; le DMD et le fronton seront replacés par Cyber Pinball), puis fermer le jeu par Exit tenu et relancer la table ; pour une table payante, le rappel de l'achat.
  Start ouvre le jeu quand même, pour le régler ; Exit revient au front-end.
  Ces réglages sont chiffrés par le jeu (fichiers `.dat` de son dossier et de son profil Steam) : Cyber Pinball ne peut ni les lire ni les écrire, contrairement à la rotation de Pinball FX.
  Une fois le jeu ouvert sur ce PC, rien ne dit plus si son mode borne est actif : le message ne revient pas.
- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Pinball FX3 »**.
  La liste est faite des **fichiers de tables installés avec le jeu** (`data\steam\*.pxp`), relus à chaque ouverture, sans les fichiers du jeu lui-même (`gui`, `sfx`, `txt`, `preview`, `PTSData`, `game_cfg`, `*_cfg`, `*_sfx`, `*Assets`).
  Steam installe **toutes** les tables, achetées ou non (elles servent aux essais dans le jeu) : rien sur le disque ne dit lesquelles le joueur possède, et Cyber Pinball ne le devine pas.
  Le joueur choisit lui-même, comme pour Pinball FX ; la fiche d'ajout le rappelle.
  Un dossier vide ou illisible donne une ligne « Aucune table trouvée » qui renvoie à la vérification des fichiers dans Steam.
  L'écran s'ouvre aussi quand le jeu n'est pas trouvé : il propose alors de l'installer avec Steam, ou de choisir son dossier.
  En tête, il dit où est le jeu (« Installé par Steam », ou le dossier choisi à la main) et, pour un dossier choisi qui ne sert plus, pourquoi (disque débranché, exécutable absent, aucune table).
- **Dossier du jeu choisi à la main** : pour des tables rangées hors de la bibliothèque de Steam, Menu système > Tables > Ajouter une table > « Tables de Pinball FX3 » > **« Choisir le dossier du jeu… »** (« Changer le dossier du jeu… » quand il y en a un).
  Le dossier convient s'il contient « Pinball FX Classic.exe » ou « Pinball FX3.exe » et des tables dans `data\steam` ; le jeu, son dossier `data` ou `data\steam`, ou le dossier qui le contient sont aussi reconnus.
  Il est gardé dans le dossier des données, et les tables de l'écran viennent alors de lui ; un dossier refusé n'est pas gardé, et l'écran dit pourquoi.
  Le même dossier, choisi par « Choisir un dossier… » de l'entonnoir ou glissé sur la fenêtre, est reconnu, gardé comme dossier du jeu, et l'écran « Tables de Pinball FX3 » s'ouvre avec ses tables, au lieu de « Rien à installer » ; le reste de la sélection suit l'ajout habituel.
  Avec un dossier choisi, les parties se lancent par l'exécutable du jeu, sans passer par Steam : `-offline`, `-class` pour les tables Williams et Bally, `-table_<fichier>`, depuis le dossier du jeu.
  Cyber Pinball n'écrit rien dans ce dossier : si le jeu exige Steam, c'est lui qui refuse de s'ouvrir, et le message le dit aussitôt, avec le moyen de revenir à Steam.
  Le dossier de Steam choisi à la main passe toujours par Steam (lancé directement, Steam demanderait une confirmation à chaque partie).
  **« Oublier ce dossier »** revient au jeu de Steam ; sans dossier choisi, rien ne change.
- **Catalogue** : 100 fichiers connus (dépôt Steam 442121, manifeste du 1er avril 2026), chacun relié à la même table de Pinball FX quand elle existe (84 avec leur jeu VPS ; titre, fabricant, année : `WMS_Fish_Tales` = « Fish Tales (Williams 1992) ») ; sinon son titre (« Family Guy Pinball », Zen Studios).
  Les noms peu parlants sont traduits (`Citadel` = Sorcerer's Lair, `SpaceBear1` = The Last Jedi, `RedCup1` = Solo, `STARWARS_LAPB` = Rogue One…).
  Un fichier inconnu (table plus récente) paraît sous son nom (« STARWARS New Table »), lançable.
  Les captures et médias viennent de la base VPS comme pour Pinball FX, la version « FX3 » d'abord ; dans un pack reçu, le fichier au nom de la table (`WMS_Fish_Tales.png`) est pris.
  Les tables propres à Zen (Aliens, Archer, American Dad, Portal, The Walking Dead…) sont reliées à leur jeu de la base VPS par leur titre exact : elles ont leur vignette et leurs médias, et « Chercher les médias manquants » les complète pour celles déjà ajoutées.
  Une image rangée à côté d'une table dans `data\steam`, au nom de son fichier (« Archer.png » à côté de « Archer.pxp »), sert de vignette dans la liste et se range avec la table à son ajout, selon ses proportions : à peu près carrée ou petite, comme logo ; en largeur, comme fronton (c'est là que le jeu l'affiche) ; en hauteur, comme image de la table.
- **Fiche** : `.pinballfx3` (JSON : `{ "PinballFX3": { "Table": "WMS_Fish_Tales" } }`) dans un dossier « Titre (Fabricant Année) ».
  La même machine déjà présente en VPX ou dans Pinball FX garde son dossier : la fiche FX3 prend « … Pinball FX3 », sans quoi les deux partageraient leur `.info` et leurs médias.
  Un nom de table invalide dans la fiche (espace, guillemet) la laisse inventoriée sans clé : elle n'est jamais lancée avec un nom deviné.
- **Installation trouvée** : le dossier choisi à la main s'il convient, sinon Steam, manifeste `appmanifest_442120.acf` complet (drapeau 4 de `StateFlags`) dans l'une des bibliothèques ; le dossier garde son nom d'installation (`Pinball FX3`) malgré le nouveau nom du jeu.
  Absent : l'entrée de l'entonnoir garde son nom, « Tables de Pinball FX3 » (« Introuvable sur ce PC : l'installer avec Steam, ou choisir le dossier du jeu »), et son écran propose l'installation par Steam, sur `steam://install/442120` (le jeu est gratuit, les tables s'y achètent), et le choix du dossier du jeu.
  Sans Steam, il reste le choix du dossier.
- **Lancement** : `steam.exe -applaunch 442120 -class -table_<fichier>` (dossier choisi à la main : l'exécutable du jeu, voir plus haut), `-class` pour les tables **Williams et Bally** seulement (leur **mode classique** : les règles de la machine, sans les améliorations de Zen ; la fiche le dit).
  Ces arguments ne sont pas documentés par Zen : ils viennent des front-ends (PinUP Popper, PinballX, RetroBat) et du support de Zen qu'ils citent.
  Un nom de table qui contiendrait autre chose que lettres, chiffres, « _ » et « - » est refusé avant tout lancement.
  Le jeu est reconnu à sa fenêtre : **« Pinball FX Classic »** depuis avril 2026, « Pinball FX3 » avant ; jamais une page de Steam qui le nommerait.
  Un Pinball FX3 resté ouvert est fermé avant la partie (Steam ne ferait que le montrer, sans ouvrir la table).
- **Table restée sur l'écran d'accueil du jeu** : la fenêtre est la même sur l'écran d'accueil et sur une table, Cyber Pinball ne peut pas le voir.
  Une partie de moins de 45 s affiche au retour **« Pinball FX3 est resté sur son écran d'accueil ? »** avec les causes possibles, au conditionnel : table pas sur ce compte Steam (jamais pour Fish Tales ni Sorcerer's Lair, gratuites), mode borne pas activé, et pour « Mars » le défaut connu du jeu qui ouvre « Attack from Mars » quand le compte a les deux tables.
  Une fenêtre jamais parue (120 s) échoue avec son explication, comme pour Pinball FX.
- **Quitter** : comme Pinball FX, un **appui long sur Exit** (2 s) ferme le jeu et revient à la roue ; l'écran de chargement l'écrit au nom du jeu, en une pastille au bas de l'écran.
- **Boutons et écrans sur une borne** : comme pour Pinball FX, les boutons de joystick d'une borne envoient au jeu les touches de son écran Contrôles > Clavier, et les écrans où le jeu dessine lui sont laissés (voir [Tables de Pinball FX](tables-de-pinball-fx.md)).
  Les menus de Pinball FX3 se parcourent aux flèches gauche et droite, sur lesquelles Maj ne fait rien : chaque flipper envoie donc aussi la flèche de son côté (`PINBALLFX3_EXTRA_KEYS`), ce qui permet d'atteindre l'icône de borne et d'activer le mode borne sans clavier ; en partie, les flippers lèvent toujours les batteurs.
  Sur une borne au clavier (encodeur clavier, clavier), la touche d'un flipper arrive seule au jeu : bonne en partie, sans effet dans les menus.
  Pendant la partie, Cyber Pinball lit donc ces touches et envoie en plus la flèche de leur côté, sans rien retarder aux flippers : rien ne s'intercale entre la touche et le jeu.
  Pinball FX3 en plein écran 1080p sur un playfield 4K change la définition de l'écran, et Windows redispose les autres : les fenêtres du front-end suivent chacune l'écran de son rôle, sans plateau tourné sur l'écran du DMD ni DMD sur le fronton.
- **Fenêtres placées par Cyber Pinball** : en mode borne, une fois la partie lancée, Cyber Pinball place lui-même les fenêtres du DMD et du fronton sur les écrans de ces rôles.
  Avant, elles s'ouvraient où les réglages du jeu les avaient mises (DMD décentré, fronton décalé de 101 px et rogné en bas, relevé sur un PinCab).
  Rien à faire : si le jeu remet une fenêtre ailleurs malgré quatre essais, le journal le signale et Cyber Pinball la laisse.
  Quand le playfield s'ouvre en mode fenêtré (barre de titre, boutons réduire et agrandir, cadre), Cyber Pinball retire la bordure et cale la fenêtre sur l'écran du playfield ; un playfield déjà sans bordure n'est pas touché.
  Le DMD n'est plus centré au milieu de l'écran du FullDMD : quand la table a un média FullDMD avec un cadre (le même repérage que pour VPX), Cyber Pinball pose le DMD dans ce cadre.
  L'activation du mode borne et l'orientation restent à régler dans le jeu (ses réglages sont chiffrés).
- **Orientation** : la rotation de l'image se règle dans le mode borne du jeu, Cyber Pinball ne l'écrit pas.
  Pour que ce réglage vaille d'un front-end à l'autre, Pinball FX3 démarre sur l'écran du playfield tel que Windows l'oriente, comme avec un autre front-end : l'orientation de Windows revient juste avant le lancement, ne bouge plus pendant la partie, et celle que Cyber Pinball donne au playfield pour Visual Pinball reprend au retour à la roue (voir [Orientation et cadrage des tables](orientation-et-cadrage-des-tables.md#orientation-du-bureau-à-la-sortie)).
  Sur une borne où Cyber Pinball tourne cet écran pour Visual Pinball, une orientation saisie dans FX3 quand il démarrait sur celle de la session donne désormais une image à l'envers.
  Avant la prochaine partie de FX3, Cyber Pinball le dit une fois, « Pinball FX3 : orientation à changer », avec l'ancienne et la nouvelle valeur à saisir (« Dans Pinball FX3, mode borne : passez Orientation de 270° à 90°. ») ; Start ouvre le jeu pour la changer, Exit revient au front-end.
  Le message ne paraît que si FX3 a déjà été lancé par Cyber Pinball sur cette borne (une de ses tables a des parties) et si la valeur change vraiment ; il ne revient pas.
- **Fronton du jeu** : en mode borne, avec le repositionnement du fronton activé, FX3 ouvre une fenêtre sur l'écran du fronton et y affiche l'image rangée à côté du fichier de la table, au nom de la table (`data\steam\<table>.png`, ou `.bmp`, `.gif`, `.jpg`, `.jpeg`), et `PinballFX3.*` pour son écran d'accueil ; sans elle, il n'y écrit que le chemin qu'il cherche.
  Avant chaque partie, une table qui n'a pas d'image la reçoit : son fronton dans Cyber Pinball (copié tel quel dans un format que FX3 lit, sinon converti en PNG), sinon celui du catalogue « FX3 Backglass art » d'archive.org (images faites par des joueurs), avec l'image de l'accueil.
  Le catalogue est attendu 15 s au plus ; au-delà, il continue en arrière-plan et l'image sert à la partie suivante.
  Une table sans fronton dans Cyber Pinball prend cette image comme fronton, et la roue la montre.
  Après une partie, les images de toutes les tables installées arrivent en arrière-plan, une fois par démarrage, suivies dans les Téléchargements : FX3 montre aussi celles d'autres tables pendant ses transitions.
  L'entrée **« Télécharger les frontons des tables »** de l'écran « Tables de Pinball FX3 » fait la même chose à la demande, avec son avancée et son bilan (déposés, déjà là, absents du catalogue, en échec).
  Chaque image est vérifiée (taille et MD5 annoncés par archive.org), déposée sous le nom attendu par le jeu, avec ou sans Steam, et un téléchargement interrompu reprend où il s'était arrêté.
  Une image déjà là, celle du joueur ou d'un autre pack, n'est jamais remplacée.
- **DMD** : celui du jeu, sur l'écran DMD de la borne (mode borne, « Dot Matrix » repositionné).
  Un **vrai DMD** (ZeDMD, PIN2DMD, PinDMD) ne reçoit l'image de FX3 que par `dmdext mirror --source=pinballfx3` de dmd-extensions, qui **lit la mémoire du jeu** : pas d'interface officielle de Zen (contrairement à Pinball FX et son `DmdDevice64.dll`), et une mise à jour du jeu peut le casser (le renommage d'avril 2026 en a gêné).
  Cyber Pinball ne lance pas `dmdext` pour l'instant ; « DMD sur la roue » reste grisé avec sa raison.
- **Ce que Pinball FX3 ne donne pas** : pas de ROM ni de NVRAM (ni tableau des scores ni classement), pas de VR, pas de réglages en partie, pas de parties entre amis ni en direct ; tout cela reste à sa place sur la fiche, grisé, avec la raison, comme pour Pinball FX.
  « Supprimer la table » la retire du front-end ; elle reste dans Pinball FX3.
- **Code** : catalogue, détection, tables installées, commande et message de partie courte dans [packages/core/src/pinballfx3.ts](../../packages/core/src/pinballfx3.ts) ; dossier choisi à la main dans [packages/core/src/pinballfx3-folder.ts](../../packages/core/src/pinballfx3-folder.ts) et [app/src/pinballfx3-folder-ui.ts](../../app/src/pinballfx3-folder-ui.ts) ; frontons dans [packages/core/src/pinballfx3-backglass.ts](../../packages/core/src/pinballfx3-backglass.ts) et [app/src/pinballfx3-backglass.ts](../../app/src/pinballfx3-backglass.ts) ; première ouverture, tables gratuites et message d'orientation dans [packages/core/src/pinballfx3-cabinet.ts](../../packages/core/src/pinballfx3-cabinet.ts) (`pinballFx3FirstRunMessage`, `PINBALLFX3_FREE_TABLES`, `takePinballFx3OrientationNotice`) ; orientation de Windows pour le jeu dans `GAMES_ON_WINDOWS_ORIENTATION` ([packages/core/src/sessionorientation.ts](../../packages/core/src/sessionorientation.ts)) ; lecture de Steam commune dans [packages/core/src/steam.ts](../../packages/core/src/steam.ts) ; ce qui est commun aux deux jeux dans [packages/core/src/zen.ts](../../packages/core/src/zen.ts) (`ZEN_GAMES`, `ZenTable`, `zenTableOfEntry`) ; fiche dans `addZenTable` ([packages/core/src/tables.ts](../../packages/core/src/tables.ts)) ; fenêtre dans `isPinballFx3Window` et `ZEN_LAUNCH_GAMES` ([app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts)) ; installation dans `pinballFx3Setup` ([app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts)).
  Tests : `pinballfx3.test.ts`, `pinballfx3-cabinet.test.ts`, `pinballfx3-folder.test.ts`, `pinballfx3-backglass.test.ts`, `pinballfx-launcher.test.ts` (système simulé).
- **Relevé sur une vraie borne** : les réglages chiffrés, la première ouverture sur l'écran d'accueil en paysage, le plein écran 1080p qui change la définition du playfield, le chemin écrit dans la fenêtre du fronton sans image, l'orientation à saisir sur l'orientation de Windows.
  **Pas encore vérifié** : lancement direct d'une table, `-class`, titre de la fenêtre « Pinball FX Classic », fermeture par Exit tenu, message de partie courte.
  Les noms de fichiers viennent du manifeste Steam publié, pas d'un dossier relu sur une borne.
