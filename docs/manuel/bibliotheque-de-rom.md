[English](../manual/rom-library.md) · Français · [Sommaire du manuel](../manuel.md)

## Bibliothèque de ROM

Une ROM sert souvent à plusieurs tables (versions, mods d'une même machine).
Chaque ROM est stockée **une seule fois**, dans `<racine>\pinmame\roms`, et chaque table qui la joue en a, dans son propre `pinmame\roms` (là où VPX 10.8.1 la cherche d'abord), un **lien physique** : le même fichier sur le disque, sans place en plus.
Le dossier n'a pas été inventé : `<racine>\pinmame` est déjà le dossier commun de PinMAME que la synchronisation propose pour `[Plugin.PinMAME] PinMAMEPath` dès qu'il contient `roms` ; une table sans lien y trouve donc encore sa ROM, en secours, **à condition de ne pas avoir de dossier `pinmame\roms`** : dès que ce dossier existe, le plugin PinMAME n'y cherche que là (`PinMAMEPlugin.cpp`, l. 436-477, commit af26b2d93), et le médecin le signale comme bloquant quand la ROM n'y est pas.
Code : [packages/core/src/romlibrary.ts](../../packages/core/src/romlibrary.ts).

**Alias de ROM par table** ([packages/core/src/romalias.ts](../../packages/core/src/romalias.ts)) : le plugin lit aussi `alias.txt` dans le dossier PinMAME de la table (`<table>\pinmame`), une ligne « nom demandé par le script,jeu chargé », avant même la ROM.
Le médecin s'en sert de trois façons :

- **Révision voisine** : la ROM demandée manque, mais une autre révision du même jeu (`t2_l6` pour `t2_l8`) est dans la table ou la bibliothèque ; sur demande, il la lie et écrit l'alias.
  L'avertissement le dit : lampes, bobines ou contacts peuvent différer, les réglages et records (NVRAM) ne sont pas repris, les sons remasterisés et couleurs du DMD rangés sous l'autre nom ne sont plus trouvés.
  Tant que l'alias sert, un rappel reste dans le diagnostic.
- **Anciens noms de VPinMAME** (« goldfinger » pour « bond », 119 noms tirés de `release/VPMAlias.txt` de PinMAME, dans [packages/core/src/vpmalias.ts](../../packages/core/src/vpmalias.ts)) : VPinMAME les traduisait de lui-même, le plugin de VPX 10.8.1 ne les connaît plus ; le médecin écrit la ligne, et dit s'il manque aussi la ROM réelle.
- **Alias devenu inutile** : la ROM demandée est arrivée, mais l'alias passe avant elle ; « Revenir à la ROM demandée » retire la ligne (et le fichier, s'il n'en reste aucune).

- **Même volume obligatoire** : un lien physique ne relie que deux dossiers d'un même disque (NTFS).
  Une table sur un autre volume que la racine (jonction vers un autre disque, clé en FAT32 ou exFAT) reçoit une **copie**, et le plan le dit.
- **Identité** : deux fichiers de même nom sont la même ROM si leur contenu est le même : l'empreinte porte sur les puces du zip (chemin, CRC et taille de chaque fichier), si bien qu'une même ROM zippée par deux outils (autre compression, autres dates) reste une seule version ; un fichier qui n'est pas un zip lisible est comparé octet pour octet (SHA-1).
  Deux contenus différents sous le même nom : le plus récent (date du fichier) est gardé, ou celui qu'on choisit dans le plan (« Garder plutôt… ») ; l'autre part à la corbeille.
  Une copie identique remplacée par un lien est supprimée (son contenu reste dans la bibliothèque, octet pour octet : c'est vérifié juste avant) ; tout autre fichier remplacé va à la corbeille.
- **Ajout** : une ROM importée entre dans la bibliothèque, puis est liée dans **toutes les tables installées qui la jouent** : celles dont le script la demande sans en avoir aucune, celles qui en ont déjà une copie, et la table à laquelle l'import la destine.
  Une nouvelle table dont la ROM est déjà dans la bibliothèque la reçoit sans rien importer de plus.
  Une ROM qu'aucune table n'attend encore est rangée quand même, pour la table à venir.
  Les scripts des tables pas encore lus le sont avant le plan (VPX `-ExtractVBS`, environ une seconde chacun, puis gardés en cache ; si VPX ne rend pas le script, celui écrit dans le `.vpx` est relu sans lui, sauf script protégé).
- **ROM reconnue d'après son contenu** ([packages/core/src/romzip.ts](../../packages/core/src/romzip.ts)) : PinMAME (VPinMAME comme le plugin de VPX 10.8.1) ne lit une ROM que sous la forme `<nom>.zip`, **ses puces à la racine du zip**.
  Une archive est une ROM quand elle ne contient que des puces (ni table, ni image, ni vidéo, ni son, ni autre archive ; notes `.txt` tolérées), toutes dans un même dossier : à la racine, ou dans un sous-dossier (`t2_l8.zip › t2_l8 › t2_l8.rom, t2_u14.l3…`, comme beaucoup de ROM téléchargées).
  Elle est reconnue partout : zip seul, zip dans le paquet d'une table (zip, 7z, rar), ROM en 7z ou rar, dossier de puces déballées (`roms\t2_l8\`).
  Son nom vient, dans l'ordre, d'une ROM demandée par le script d'une table portée par l'archive ou un dossier (casse comprise : `T2_L8.ZIP` devient `t2_l8.zip`), d'un nom de ROM connu (base VPS, anciens noms de VPinMAME), d'une puce nommée comme une ROM demandée (`t2_l8.rom` dans « Terminator 2 ROM.zip »), de la seule ROM demandée de la même famille que les puces (`t2_u14.l3` → `t2_l8`), enfin du nom de l'archive.
  Une ROM dont les puces sont dans un dossier est **refaite en un zip à plat** (puces recopiées telles quelles, sans recompression, datées comme l'archive d'origine) avant d'entrer dans la bibliothèque ; le plan le dit (« ROM t2_l8 reconnue dans le dossier « t2_l8 » »), comme un renommage.
  Ses fichiers ne sont jamais rangés un à un dans le dossier d'une table.
- **Rangement** (menu système, Exit dans le front-end : « Ranger les ROM dans la bibliothèque ») : pour les ROM d'avant la bibliothèque.
  Le plan montre, ROM par ROM, celle qui entre dans la bibliothèque, les copies remplacées par un lien, les liens ajoutés, les versions écartées et la place libérée ; rien ne bouge avant « Ranger ».
  Le bilan donne la place des ROM mesurée avant et après.
- **Vue globale** (menu système : « Bibliothèque de ROM »), aux boutons : chaque ROM, les tables qui l'utilisent et sa taille ; les ROM à ranger ; les ROM **inutilisées** (aucune table ne l'a ni ne l'attend), avec la corbeille proposée une par une ou toutes ; les ROM **attendues mais absentes**, avec « Ajouter ».
  La place sur le disque compte chaque fichier physique une fois et dit ce que les liens économisent.
  Seules les ROM des dossiers `pinmame\roms` sont concernées : les `.zip` rangés ailleurs (polices FlexDMD, par exemple) ne sont pas des ROM.
- **Médecin** : « ROM pas liée dans la table » (elle est dans la bibliothèque, pas dans `pinmame\roms` : la lier) et « Copie de ROM au lieu d'un lien » (la remplacer par un lien ; pour une autre version, utiliser celle de la bibliothèque, l'autre va à la corbeille).
  La fiche de la table marque « (bibliothèque) » une ROM liée.
- **ROM éparpillée, ROM à sous-dossier** (réparation de ce qu'ont laissé les versions jusqu'à 0.1.3-essai.1, qui déballaient un zip de ROM à sous-dossier et rangeaient ses puces à la racine de la table) : « ROM « t2_l8 » en fichiers éparpillés dans la table » repère les puces de la ROM demandée restées à la racine de la table (même nom qu'elle ou même famille : `t2_l8.rom`, `t2_u14.l3`… ; ni `.vgm`, ni `.ini`, ni `.log`) ou dans un dossier nommé comme elle ; « Refaire t2_l8.zip dans la bibliothèque et le lier » refait le zip à plat, le range dans la bibliothèque, le lie dans `pinmame\roms` et met les puces à la corbeille.
  Si la ROM est déjà là (bibliothèque, lien, alias), il ne reste qu'à mettre ces fichiers à la corbeille.
  « ROM illisible : ses fichiers sont dans un sous-dossier du zip » repère un tel zip posé à la main dans `pinmame\roms`, et « ROM mal rangée » un zip à sous-dossier ailleurs dans la table : tous deux le refont à plat.
  Le parcours « Ce qu'il manque pour jouer » propose ces corrections sur place, avant toute recherche.

Supprimer une table ne met à la corbeille que son lien : la ROM reste dans la bibliothèque, et la vue globale la propose ensuite comme inutilisée si plus aucune table ne la joue.
