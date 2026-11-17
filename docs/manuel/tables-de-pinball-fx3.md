[English](../manual/pinball-fx3-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Pinball FX3

Cyber Pinball lance aussi les tables de **Pinball FX3** (Zen Studios, 2017), renommé **« Pinball FX Classic »** sur Steam en avril 2026.
Beaucoup de bornes l'ont encore, avec des tables achetées qui ne passent pas dans [Pinball FX](tables-de-pinball-fx.md).
**En bêta**, comme Pinball FX : pastille « BÊTA » sur l'entrée de l'entonnoir et sur la fiche.
Pinball FX2 n'est pas pris en charge : ancien, sans lancement direct fiable.
Tout ce qui suit vaut pour la version Steam : les versions Microsoft Store et consoles n'ont ni mode borne ni lancement direct (le jeu a quitté les boutiques Microsoft en mai 2026).

Pinball FX et Pinball FX3 sont deux variantes d'un même code, les « jeux de Zen » ([packages/core/src/zen.ts](../../packages/core/src/zen.ts)) : même écran d'ajout, même fiche d'ajout avec ses médias, même partie, même retour.
Ce qui change d'un jeu à l'autre est décrit ici.

- **Ce que le jeu demande au joueur** : rien à Zen.
  Le **code borne** qu'il fallait demander à Zen n'existe plus depuis la mise à jour 1.0.26.1 du 4 novembre 2024 : le mode borne se débloque pour tout le monde (un usage commercial demande toujours l'accord de Zen).
  Il reste à l'**activer une fois** dans le jeu : icône de borne à côté du profil, puis « Activer ».
  Sans mode borne, ou sans la table sur le compte Steam, le jeu s'ouvre sur son écran d'accueil au lieu de la table.
  L'écran « Tables de Pinball FX3 » le dit en tête, avec l'adresse de l'aide de Zen (`pinballfx.com/?page_id=7754`) ; la fiche d'une table a une ligne « Mode borne ».
- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Pinball FX3 »**.
  La liste est faite des **fichiers de tables installés avec le jeu** (`data\steam\*.pxp`), relus à chaque ouverture, sans les fichiers du jeu lui-même (`gui`, `sfx`, `txt`, `preview`, `PTSData`, `game_cfg`, `*_cfg`, `*_sfx`, `*Assets`).
  Steam installe **toutes** les tables, achetées ou non (elles servent aux essais dans le jeu) : rien sur le disque ne dit lesquelles le joueur possède, et Cyber Pinball ne le devine pas.
  Le joueur choisit lui-même, comme pour Pinball FX ; la fiche d'ajout le rappelle.
  Un dossier vide ou illisible donne une ligne « Aucune table trouvée » qui renvoie à la vérification des fichiers dans Steam.
- **Catalogue** : 100 fichiers connus (dépôt Steam 442121, manifeste du 1er avril 2026), chacun relié à la même table de Pinball FX quand elle existe (84 avec leur jeu VPS ; titre, fabricant, année : `WMS_Fish_Tales` = « Fish Tales (Williams 1992) ») ; sinon son titre (« Family Guy Pinball », Zen Studios).
  Les noms peu parlants sont traduits (`Citadel` = Sorcerer's Lair, `SpaceBear1` = The Last Jedi, `RedCup1` = Solo, `STARWARS_LAPB` = Rogue One…).
  Un fichier inconnu (table plus récente) paraît sous son nom (« STARWARS New Table »), lançable.
  Les captures et médias viennent de la base VPS comme pour Pinball FX, la version « FX3 » d'abord ; dans un pack reçu, le fichier au nom de la table (`WMS_Fish_Tales.png`) est pris.
- **Fiche** : `.pinballfx3` (JSON : `{ "PinballFX3": { "Table": "WMS_Fish_Tales" } }`) dans un dossier « Titre (Fabricant Année) ».
  La même machine déjà présente en VPX ou dans Pinball FX garde son dossier : la fiche FX3 prend « … Pinball FX3 », sans quoi les deux partageraient leur `.info` et leurs médias.
  Un nom de table invalide dans la fiche (espace, guillemet) la laisse inventoriée sans clé : elle n'est jamais lancée avec un nom deviné.
- **Installation trouvée** : Steam seulement, manifeste `appmanifest_442120.acf` complet (drapeau 4 de `StateFlags`) dans l'une des bibliothèques ; le dossier garde son nom d'installation (`Pinball FX3`) malgré le nouveau nom du jeu.
  Absent : **« Installer Pinball FX3 »** ouvre Steam sur `steam://install/442120` (le jeu est gratuit, les tables s'y achètent) ; sans Steam, l'entrée est grisée avec sa raison.
- **Lancement** : `steam.exe -applaunch 442120 -class -table_<fichier>`, `-class` pour les tables **Williams et Bally** seulement (leur **mode classique** : les règles de la machine, sans les améliorations de Zen ; la fiche le dit).
  Ces arguments ne sont pas documentés par Zen : ils viennent des front-ends (PinUP Popper, PinballX, RetroBat) et du support de Zen qu'ils citent.
  Un nom de table qui contiendrait autre chose que lettres, chiffres, « _ » et « - » est refusé avant tout lancement.
  Le jeu est reconnu à sa fenêtre : **« Pinball FX Classic »** depuis avril 2026, « Pinball FX3 » avant ; jamais une page de Steam qui le nommerait.
  Un Pinball FX3 resté ouvert est fermé avant la partie (Steam ne ferait que le montrer, sans ouvrir la table).
- **Table restée sur l'écran d'accueil du jeu** : la fenêtre est la même sur l'écran d'accueil et sur une table, Cyber Pinball ne peut pas le voir.
  Une partie de moins de 45 s affiche au retour **« Pinball FX3 est resté sur son écran d'accueil ? »** avec les causes possibles, au conditionnel : table pas sur ce compte Steam, mode borne pas activé, et pour « Mars » le défaut connu du jeu qui ouvre « Attack from Mars » quand le compte a les deux tables.
  Une fenêtre jamais parue (120 s) échoue avec son explication, comme pour Pinball FX.
- **Quitter** : comme Pinball FX, un **appui long sur Exit** (2 s) ferme le jeu et revient à la roue ; le cartouche du chargement l'écrit au nom du jeu.
- **DMD** : celui du jeu, sur l'écran DMD de la borne (mode borne, « Dot Matrix » repositionné).
  Un **vrai DMD** (ZeDMD, PIN2DMD, PinDMD) ne reçoit l'image de FX3 que par `dmdext mirror --source=pinballfx3` de dmd-extensions, qui **lit la mémoire du jeu** : pas d'interface officielle de Zen (contrairement à Pinball FX et son `DmdDevice64.dll`), et une mise à jour du jeu peut le casser (le renommage d'avril 2026 en a gêné).
  Cyber Pinball ne lance pas `dmdext` pour l'instant ; « DMD sur la roue » reste grisé avec sa raison.
- **Ce que Pinball FX3 ne donne pas** : pas de ROM ni de NVRAM (ni tableau des scores ni classement), pas de VR, pas de réglages en partie, pas de parties entre amis ni en direct ; tout cela reste à sa place sur la fiche, grisé, avec la raison, comme pour Pinball FX.
  « Supprimer la table » la retire du front-end ; elle reste dans Pinball FX3.
- **Code** : catalogue, détection, tables installées, commande et message de partie courte dans [packages/core/src/pinballfx3.ts](../../packages/core/src/pinballfx3.ts) ; lecture de Steam commune dans [packages/core/src/steam.ts](../../packages/core/src/steam.ts) ; ce qui est commun aux deux jeux dans [packages/core/src/zen.ts](../../packages/core/src/zen.ts) (`ZEN_GAMES`, `ZenTable`, `zenTableOfEntry`) ; fiche dans `addZenTable` ([packages/core/src/tables.ts](../../packages/core/src/tables.ts)) ; fenêtre dans `isPinballFx3Window` et `ZEN_LAUNCH_GAMES` ([app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts)) ; installation dans `pinballFx3Setup` ([app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts)).
  Tests : `pinballfx3.test.ts`, `pinballfx-launcher.test.ts` (système simulé).
- **Pas encore essayé sur une vraie installation** (poste de développement sans FX3) : lancement direct d'une table, `-class`, titre de la fenêtre « Pinball FX Classic », fermeture par Exit tenu, message de partie courte.
  Les noms de fichiers viennent du manifeste Steam publié, pas d'un dossier relu sur une borne.
