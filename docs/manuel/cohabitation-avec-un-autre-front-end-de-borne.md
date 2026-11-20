[English](../manual/coexisting-with-another-cabinet-frontend.md) · Français · [Sommaire du manuel](../manuel.md)

## Cohabitation avec un autre front-end de borne

Cyber Pinball s'installe sur une borne qui a déjà PinUP Popper, PinballX ou PinballY sans rien changer à leur installation.
Code : [packages/core/src/coexistence.ts](../../packages/core/src/coexistence.ts) (front-ends connus, barres des tâches, liste des réglages de Windows modifiés) et [app/src/frontend-gate.ts](../../app/src/frontend-gate.ts) (écran d'attente) ; l'invariant est fixé par [coexistence.test.ts](../../packages/core/src/test/coexistence.test.ts).

**Ce qui reste séparé.**

- Tout vit dans la racine de Cyber Pinball : sa propre copie de VPX (`emulators\vpx\`), ses tables, ses ROM, ses médias.
- VPX est lancé avec `-Ini <racine>\config\VPinballX.ini` : le `VPinballX.ini` de l'autre front-end n'est ni lu ni écrit.
  Seul le journal `%APPDATA%\VPinballX\10.8\vpinball.log` est commun si l'autre front-end utilise aussi VPX 10.8 : chaque partie le réécrit.
- Mode plugins de VPX : aucun composant n'est enregistré dans Windows (VPinMAME, B2S et PinUP Player restent ceux de l'autre front-end) ; `B2STableSettings.xml`, `DmdDevice.ini` et `PUPDatabase.db` ne sont pas touchés.
  Le dossier de DOF (`%APPDATA%\VPinballX\10.8\directoutputconfig`) est commun à tout VPX 10.8 du PC : Cyber Pinball n'y écrit qu'à la demande (import du configtool, ancienne configuration sauvegardée ; LED adressables décrites), et jamais à la place d'un `Cabinet.xml` ou d'un GlobalConfig écrit à la main (voir [LED et retours (DOF)](led-et-retours-dof.md#led-et-retours-dof)).
  Le DOF classique de l'autre front-end (`C:\DirectOutput`, `C:\vPinball\DirectOutput`…) garde sa configuration du configtool dans son propre dossier, que le plugin DOF de VPX ne lit pas.
  Quand le dossier de DOF de VPX est vide, l'écran « LED et retours (DOF) » et la Santé de la borne montrent cette ancienne configuration, et « Reprendre la configuration de l'ancien DOF » copie ses ini et tablemappings sans toucher au dossier d'origine ; son GlobalConfig n'est jamais repris, son Cabinet.xml seulement s'il est cohérent et que ses ports sont branchés.
- Les fichiers de l'autre front-end ne sont jamais déplacés ni modifiés : « Reprendre les médias de PinUP Popper / PinballX » les copie, une table choisie hors de `import\` est copiée.
  La reprise des médias lit la base de l'installation, qui relie chaque jeu à son `.vpx` : les médias d'une table reprise sous un autre nom trouvent leur table, et « Reprendre aussi ces tables » ajoute celles qui ne sont pas encore dans Cyber Pinball, avec leurs médias (voir « Import des médias » dans [Médias des jeux](medias-des-jeux.md#médias-des-jeux)).
  Les tables reprises de son installation (Ajouter une table > « Depuis une autre installation… », en bêta) ne sont pas dupliquées quand elle est sur le même disque que Cyber Pinball : leurs gros fichiers (tables, frontons, vidéos, images, sons, ROM) deviennent des liens physiques NTFS, sans place en plus, et seuls les petits fichiers que VPX, PinMAME ou le PuP-Pack peuvent réécrire sont copiés (voir [Ajouter une table](ajouter-une-table-l-entonnoir-le-catalogue.md#ajouter-une-table--lentonnoir-le-catalogue--récupérer--liste-dattente)).
  Avant d'écrire dans un fichier lié, Cyber Pinball coupe son lien : le fichier de l'autre front-end garde ses octets et sa date.
  Sur un autre disque, tout est copié, et l'écran de reprise le dit.
- ROM et NVRAM sont rangées à part : records et réglages des jeux ne sont pas partagés.

**Ce qui est commun : quelques réglages de Windows.**
Leur liste complète est `WINDOWS_CHANGES`.
Le test refuse un appel déclaré ailleurs que dans son fichier, et tout appel qui modifierait autre chose (`FORBIDDEN_WINDOWS_CALLS` : registre hors de l'installeur, sortie audio par défaut, lancement à l'ouverture de session par l'application, paramètres système, processus arrêtés par leur nom).

| Réglage | Quand | Ce que Cyber Pinball fait pour l'autre front-end |
| --- | --- | --- |
| Orientation de l'écran du playfield, pour la session seulement, rendue à la sortie | assistant, étape « Où sont les flippers ? », seulement si VPX ne sait pas mettre les flippers du côté du joueur ; redonnée à chaque démarrage | Autre front-end installé ou ouvert : le premier Start avertit (« Retourner l'écran dans Windows ? » : son front-end et ses tables seraient aussi à l'envers). Start retourne quand même, puis demande confirmation en 15 s comme d'habitude ; Exit garde l'orientation de Windows, tables à l'envers dans Cyber Pinball. |
| Barres des tâches | pendant une partie | Seules celles que Cyber Pinball a masquées reviennent (`taskbarsToRestore`) : une barre déjà masquée par l'autre front-end le reste. Le témoin `barres-des-taches-masquees` garde le HWND de chacune. |
| Raccourci Ctrl+Maj+K | pendant une partie | Rendu à la fin de la partie. |
| Raccourci Ctrl+Maj+D | en mode bureau | Rendu au retour au front-end. |
| Lancement à l'ouverture de session, bureau remplacé ou masqué | option de l'installeur, et Menu système > « Ma borne » > « Démarrage et accès » > « Borne dédiée » ou « Lancement au démarrage », désactivés par défaut | Autre front-end installé : l'écran le signale avant d'activer (s'il démarre aussi avec Windows, les deux se disputeraient les écrans). Chaque réglage de Windows est relevé avant d'être écrit et remis tel quel à la désactivation (`Sys-Set`, `windowssettings.ts`). |
| Entrée de « Programmes et fonctionnalités » | installation (`HKCU`) | Retirée à la désinstallation. |
| Tâche planifiée « Cyber Pinball pare-feu » | « Autoriser dans le pare-feu de Windows », sous la même autorisation | Sans déclencheur : lancée par Cyber Pinball seulement, quand une de ses règles du pare-feu manque, pour la reposer (voir « Pare-feu après une mise à jour »). Ne touche à rien d'autre ; retirée à la désinstallation. Son script, lisible, est dans `ProgramData\CyberPinball`, retiré avec elle. |

**Autre front-end déjà ouvert.**
Les deux front-ends se disputeraient les écrans, l'afficheur DMD et les boutons de la borne.
Au démarrage, avant de couvrir le moindre écran (`otherFrontendsGate`, appelé par `main.ts` avant le gardien des écrans), Cyber Pinball cherche les processus des front-ends connus (`OTHER_FRONTENDS` : `PinUpMenu.exe` et `PinUpDisplay.exe` pour PinUP Popper, `PinballX.exe`, `PinballY.exe` ; `PinUpPlayer.exe`, le lecteur des PuP-Packs, n'en fait pas partie).
S'il en trouve un, l'écran principal seul affiche « PinUP Popper est ouvert » : Cyber Pinball démarre tout seul dès qu'il est fermé (vérifié chaque seconde) ; Start ou « Continuer quand même » démarre tout de suite ; Exit ou « Quitter Cyber Pinball » quitte.
Rien n'est fermé ni modifié chez l'autre front-end.
Avant chaque partie, le front-end vérifie de nouveau : un menu ouvert depuis donne « PinUP Popper est ouvert » (Start : jouer quand même · Exit : revenir au front-end).
Un front-end accepté une fois n'est plus signalé jusqu'à la fermeture de Cyber Pinball, relances front-end ↔ assistant comprises (`CYBERPINBALL_AUTRES_MENUS_ACCEPTES`, transmis au nouveau processus).

**Programmes ouverts pendant la partie.**
Accepté au démarrage, un autre programme de borne peut encore ralentir les parties : il prend par moments le processeur, le disque ou le DMD réel (un joueur venu de PinUP Popper avait des arrêts de 1 à 2 s sur presque toutes les tables).
À chaque partie, Cyber Pinball relève ceux qui sont ouverts (`GAME_INTRUDERS`, `programsDuringGame`, [coexistence.ts](../../packages/core/src/coexistence.ts)) : les front-ends ci-dessus, PinUP Player (`PinUpPlayer.exe`, le lecteur des PuP-Packs), dmdext et le serveur B2S hors de VPX (`B2SBackglassServerEXE.exe`).
- **Par-dessus la partie**, une notification « Ouvert pendant la partie : PinUP Popper et dmdext », précisée « Il peut ralentir la partie : fermez-le », une fois par jour et par programme, même si vous aviez choisi « Continuer quand même » au démarrage.
- **Avec la mesure de la partie** (`cadence-parties.json`, champ `others`) : le constat « La table rame sur cette borne » le rappelle en premier, comme une cause à écarter d'abord (voir [Santé de la borne](sante-de-la-borne.md#santé-de-la-borne)).
- **Dans le journal** : « Partie (…) : ouverts pendant la partie : … ».

Tests : [programmes-ouverts.test.ts](../../packages/core/src/test/programmes-ouverts.test.ts).

**Front-ends installés** (`installedFrontends`, pour l'avertissement de l'orientation) : l'exécutable, ou le dossier `POPMedia` ou `Media`, aux emplacements par défaut (`vPinball\PinUPSystem`, `PinUPSystem`, `PinballX`, `PinballY`…, sur C:, D: et E:).

**Front-ends simulés** : hors écran, seuls les front-ends simulés comptent : `CYBERPINBALL_AUTRES_MENUS` (ouverts, noms d'exécutables séparés par des virgules ; avec `CYBERPINBALL_AUTRES_MENUS_FICHIER`, fermés quand ce fichier disparaît) et `CYBERPINBALL_AUTRES_MENUS_INSTALLES` (installés).
