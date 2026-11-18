[English](../manual/other-vpx-versions.md) · Français · [Sommaire du manuel](../manuel.md)

## Autres versions de VPX

Une table peut se jouer avec un VPX déjà installé sur le PC (10.8.0, 10.7…), par exemple une table reprise d'une autre installation qui tourne mieux avec lui.
Cyber Pinball ne l'installe jamais : c'est l'installation du joueur, avec ses propres réglages, et VPinMAME et B2S Server, dont ces versions ont besoin, sont inscrits dans le registre de Windows.
Tant qu'aucun autre VPX n'est ajouté, rien de ce qui suit n'apparaît, ni dans la fiche d'une table, ni dans le plan d'installation.

**La liste.**
Menu système > « Borne » > « Autres versions de VPX » ; son détail nomme les VPX ajoutés, sinon « Aucune : toutes les tables sont jouées avec le VPX de Cyber Pinball ».
À l'ouverture, Cyber Pinball cherche les VPX des autres installations du PC (dossier de VPX seul, émulateurs de PinUP Popper) et propose chacun d'un Start (« Ajouter VPX 10.8.0 », « Trouvé sur ce PC : … ») ; une version déjà dans la liste n'est pas reproposée.
« Ajouter un autre VPX… » le fait choisir par son exécutable, dans le sélecteur de fichiers.
Seul un `VPinballX*.exe` de VPX 10 est accepté, reconnu à sa version de fichier (`checkOtherVpx`) ; la version que Cyber Pinball utilise déjà est refusée, ses tables n'y perdant que les fonctions de Cyber Pinball.
Start sur un VPX ajouté le retire, après une confirmation qui dit combien de tables l'ont choisi : elles reviennent au VPX de Cyber Pinball et le retrouveront s'il est ajouté de nouveau ; rien n'est effacé du PC.
La liste est gardée dans `<données>\autres-vpx.json`.

**Le choix d'une table.**
Dans la fiche, « Gérer la table… » a alors la ligne « Jouée avec VPX 10.8.1 de Cyber Pinball » (ou « Jouée avec VPX 10.8.0 »), après « Réglages de cette table » ; Start ouvre « VPX de cette table », le curseur sur le choix actuel.
Le choix est écrit dans le `.info` de la table (`CyberPinball.vpx`), où il suit la table ; un choix dont le VPX n'est plus dans la liste ne compte plus.
Le plan d'installation d'une table a la même ligne, et « Changer le VPX ».
Une table reprise d'une autre installation garde le VPX qui la jouait : Cyber Pinball retrouve l'exécutable avec lequel cette installation la lançait (dans PinUP Popper, l'émulateur de la table et son exécutable de remplacement, `ALTEXE`), et le plan d'installation reprend ce VPX s'il est dans la liste (même fichier, sinon même version).
En mode invité, la porte `sheet.vpx` est fermée.

**La partie.**
Cyber Pinball n'est alors que le lanceur : l'exécutable choisi avec `-Play` et la table, sans `-Ini`, donc avec les réglages de ce VPX (écrans, fronton, DMD, VPinMAME, B2S Server, PinUP Player), puis le retour au front-end.
Il n'écrit jamais dans le dossier de cet autre VPX et ne prépare rien de ce qu'il fait pour son propre VPX 10.8.1 en mode plugins : ni `VPinballX.ini` de la borne, ni plugins, ni position du DMD, ni volume de la ROM, ni vidéos du DMD réduites.
Restent réservés au VPX de Cyber Pinball : la réalité virtuelle, le réglage de l'affichage en partie, les parties entre amis, la Vision 3D, les réglages de VPX de Cyber Pinball (écrans, DMD réel, boutons) et la préparation des PuP-Packs (PinUP Player lit le pack tel que l'installation du joueur l'a réglé).
La fiche le dit (« Pas de réalité virtuelle, réglage de l'affichage en partie… pour ces tables. »), et « Régler l'affichage en partie » n'y paraît pas.
Une partie entre amis sur une telle table est refusée avant le lancement (« Partie entre amis impossible avec VPX 10.8.0 »), comme un exécutable déplacé ou désinstallé (« VPX 10.8.0 introuvable »), avec le chemin pour revenir au VPX de Cyber Pinball.
Le journal note chaque partie (« Partie (…) avec un autre VPX : VPX 10.8.0, …, ses propres réglages. »).

Code : [packages/core/src/autres-vpx.ts](../../packages/core/src/autres-vpx.ts) (liste, choix d'une table, vérification de l'exécutable, reprise d'une autre installation), [app/src/autres-vpx-menu.ts](../../app/src/autres-vpx-menu.ts) (écrans) ; tests `autres-vpx.test.ts`.
