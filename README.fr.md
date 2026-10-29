# Cyber Pinball

**Un frontend libre pour borne de flipper virtuel. Décrivez votre borne une fois : Cyber Pinball règle tout le reste, tout se pilote aux boutons des flippers, et l'on joue en ligne avec les bornes de ses amis.**

[English](README.md) · [Télécharger](https://github.com/gocode/cyberpinball/releases) · [Manuel technique](docs/manuel.md) · [Nouveautés](CHANGELOG.md)

<p align="center"><img src="docs/images/fr/cabinet.webp?v=9f776b3256" width="900" alt="Le menu des tables sur une borne à quatre écrans : l'écran du playfield, remis debout, avec le plateau de la table choisie, la roue des médaillons ronds des tables et les commandes ; à côté, le topper, le fronton et l'afficheur DMD du même jeu, Neon Abyss."></p>

<p align="center"><sub>Les tables présentées sont fictives.</sub></p>

Cyber Pinball fait d'un PC rempli de tables Visual Pinball X une vraie borne d'arcade : une roue des tables digne de la machine, chaque écran de la borne utilisé, et ni clavier, ni souris, ni fichier `.ini` en vue. Il écrit et tient à jour la configuration de tous les composants à votre place (VPX, fronton, PuP-Packs et DMD, position des écrans, sorties audio, touches), trouve ce qu'il manque à une table avant qu'on puisse y jouer, rassemble ses médias depuis les sites de la communauté, et relie votre borne à celles de vos amis pour partager des tables et jouer ensemble en direct, sans aucun serveur entre elles.

> **État : premier prototype (0.1.x).** Windows seulement, pensé pour Visual Pinball X 10.8.1 en mode plugins. Tout n'est pas encore poli : sauvegardez vos tables avant d'essayer.

## Points forts

- **[Jouer entre amis, de borne à borne](#jouer-entre-amis-de-borne-à-borne)** : des parties en ligne jusqu'à quatre bornes, tables et médias partagés, qui joue et sur quelle table. Sans serveur, sans compte.
- **[Réglée depuis la borne elle-même](#réglée-depuis-la-borne-elle-même)** : un assistant mené aux boutons des flippers, des écrans reconnus à leur empreinte matérielle, et rien ne casse quand Windows les renumérote.
- **[Un menu digne d'une vraie borne](#un-menu-digne-dune-vraie-borne)** : roue de médaillons, DMD vivant, lancement cinématique, sons de la machine, et jamais un coin de bureau Windows.
- **[De l'envie d'une table à la partie](#de-lenvie-dune-table-à-la-partie)** : le catalogue VPS, un chemin guidé « Ce qu'il manque pour jouer », un médecin des tables, chaque fichier téléchargé rangé à sa place.
- **[Des médias de partout, choisis par vous](#des-médias-de-partout-choisis-par-vous)** : des galeries de ce que propose chaque site, un navigateur intégré, et vos propres parties filmées pour la roue.
- **[Une borne qui veille sur elle-même](#une-borne-qui-veille-sur-elle-même)** : un bilan de santé, des mises à jour signées, des horaires de nuit, un mode invité pour les soirées.

## Jouer entre amis, de borne à borne

<p align="center"><img src="docs/images/fr/friends.webp?v=218e5380dc" width="760" alt="Mes amis : Bruno est en ligne et joue à Star Courier, avec son nouveau record à l'instant, et Émile est hors ligne ; à côté, la page de Bruno, ses derniers événements et Voir sa bibliothèque."></p>

<p align="center"><img src="docs/images/fr/friends-library.webp?v=a13c6b478c" width="760" alt="La bibliothèque de Bruno : les tables communes aux deux bornes et celle que cette borne n'a pas, Glass Lagoon, avec ses médias et Récupérer toute la table."></p>

Votre borne n'est plus une île. Cyber Pinball relie les bornes directement entre elles, par Internet ou par le réseau local, sans compte à créer et sans aucun serveur entre elles.

- **Des parties en ligne, en direct.** Invitez jusqu'à trois amis sur la même table : l'invitation s'ouvre sur leur borne, la version de la table est vérifiée, un compte à rebours commun lance la partie sur toutes les bornes à la fois, puis chacun voit les résultats côte à côte.
- **Qui joue, en ce moment.** Vos amis en ligne, la table sur laquelle ils sont, leurs derniers records et leurs badges, avec de petites notifications sur la roue, jamais pendant une partie.
- **Des tables et des médias partagés.** Parcourez la bibliothèque d'un ami : les tables que vous n'avez pas, les médias qui vous manquent. Récupérez une table entière, ou partie par partie (table, fronton, sons, médias), sa version et la vôtre côte à côte. Tout est vérifié à l'arrivée et montré dans le plan d'ajout avant la moindre installation ; ROM et PuP-Pack sont décochés par défaut.
- **Trouver des joueurs.** Cherchez un joueur par son nom dans un annuaire que les bornes se transmettent, ou trouvez les bornes autour de vous sur le réseau local, même sans Internet. Envoyez une demande d'ami ; il accepte de son côté.
- **Votre borne, vos règles.** Sauvegardes, fichiers de records et programmes ne quittent jamais votre borne. Le partage est activé par défaut et se coupe à un seul endroit, « Partage et réseau », qui montre aussi ce que voient les autres bornes. Construit sur Hyperswarm de [Holepunch](https://holepunch.to).

## Réglée depuis la borne elle-même

<p align="center"><img src="docs/images/fr/wizard.webp?v=03329ccd70" width="900" alt="L'assistant de configuration, étape des écrans et de leurs rôles : chacun des quatre écrans affiche son numéro, et l'écran du playfield demande « Playfield ? » avec les indications des flippers et de Start."></p>

- **Un assistant qu'on suit debout aux flippers.** Boutons (encodeur clavier, manette ou Pinscape KL25Z), lanceur analogique, accéléromètre et plomb de tilt, écrans, sens et diagonale du playfield, sorties audio : chaque étape se répond avec les boutons de la borne.
- **Des écrans reconnus, pas numérotés.** Chaque écran est identifié par son empreinte EDID, et `VPinballX.ini` est réécrit à chaque démarrage. Changez un écran, réveillez-les dans un autre ordre, laissez Windows tout renuméroter : le playfield reste le playfield.
- **Le son là où il doit être.** Une étape joue un son sur chaque sortie, fait choisir celles du fronton et du playfield, et teste chaque haut-parleur d'une carte 5.1 ou 7.1. Le menu, sa musique et chaque vidéo passent par les haut-parleurs de la borne.
- **Plusieurs configurations, une seule installation.** La même installation sert une borne et un PC de bureau : la configuration branchée est reconnue toute seule, chacune avec ses écrans, son son, ses boutons et son `VPinballX.ini`.
- **Les réglages de VPX sans le `.ini`.** Tous les réglages de VPX, lus dans son propre code source, se modifient pour toutes les tables ou table par table. Le cadrage et la position du fronton, du DMD et du topper se règlent sur la table lancée, depuis le menu de VPX.

<p align="center"><img src="docs/images/fr/vpx-settings.webp?v=72eca11b71" width="760" alt="L'écran des réglages de VPX : l'onglet Essentiels avec la vue de la table et le son, les valeurs gérées par Cyber Pinball, et la description du réglage choisi."></p>

## Un menu digne d'une vraie borne

<p align="center"><img src="docs/images/fr/launch.webp?v=a90b793d83" width="900" alt="Animation du lancement sur une borne à quatre écrans : au Start, le logo de Neon Abyss s'allume sur le plateau, file vers le haut à travers le DMD et se pose sur le fronton, puis les écrans s'effacent quand Visual Pinball X prend la main."></p>

- **Une roue de médaillons** sur la vidéo du plateau de la table, une fenêtre par écran de la borne : le topper, le fronton et le DMD suivent le jeu choisi.
- **Un DMD vivant.** Cyber Pinball dessine l'afficheur lui-même, avec sa propre police à points : le titre, PRESS START, les crédits, l'horloge et les records, dans la couleur de votre choix.
- **Un lancement cinématique.** Au Start, le logo du jeu vole du playfield vers le fronton, le DMD montre le chargement, et un coup de bobine sonne quand VPX prend la main. VPX n'attend jamais le spectacle.
- **Les sons de la machine.** Un clic de solénoïde au changement de table, une pièce au Start, le knocker quand un record tombe ; et la musique de chaque jeu sur la roue.
- **Jamais d'écran blanc, jamais le bureau.** Du démarrage à la fin d'une partie et retour, chaque écran reste couvert ; Ctrl+Maj+D les libère tous quand vous voulez retrouver Windows.
- **Sur un PC de bureau aussi.** Le playfield dans un cadre 9:16, la roue et le jeu à côté, le fronton sur un second écran si vous en avez un.

<p align="center"><img src="docs/images/fr/live-dmd.webp?v=7a6e43e169" width="760" alt="Le DMD vivant du menu, dessiné par Cyber Pinball : tour à tour le titre du jeu, PRESS START, le meilleur score et l'horloge."></p>

<p align="center"><img src="docs/images/fr/desktop.webp?v=eccb3b9ce0" width="900" alt="Le menu des tables sur un PC de bureau : le plateau de Neon Abyss dans un cadre 9:16 debout à gauche ; à droite son fronton, la roue des médaillons (Copper Comet, Lunar Diner, Midnight Circuit, Neon Abyss, Star Courier, Thunder Reef, Atlas Rising) et le bandeau du titre."></p>

## De l'envie d'une table à la partie

<p align="center"><img src="docs/images/fr/missing-to-play.webp?v=265baffecb" width="760" alt="Ce qu'il manque pour jouer, pour Neon Abyss : à gauche, étape 3 sur 4, la ROM reste à faire et le geste conseillé est de la récupérer sur vpforums.org, ou de jouer avec une révision voisine déjà sur la borne ; à droite, une fois la ROM installée, Tout est prêt pour jouer, avec Jouer en première action."></p>

- **« Ajouter une table » réunit toutes les entrées.** Un dossier d'import, une clé USB, le PC, votre dossier Téléchargements ou le catalogue du [Virtual Pinball Spreadsheet](https://github.com/VirtualPinballSpreadsheet/vps-db) : chaque jeu, ses versions et ce qu'il manque encore à cette borne pour y jouer. Chaque table est nommée d'après cette base.
- **« Ce qu'il manque pour jouer ».** Un chemin pas à pas, d'une ROM ou d'un fronton manquant jusqu'à la bonne page de téléchargement, puis l'installation de ce que vous avez récupéré, jusqu'à « Jouer ». Seuls la table et sa ROM sont indispensables ; le reste est proposé en plus.
- **Chaque fichier va à sa place.** Un fichier téléchargé est reconnu à son contenu (table, fronton, ROM, PuP-Pack, couleurs du DMD, sons, musique…) et rangé dans cette partie du jeu, même quand on attendait autre chose. Les « Parties du jeu » d'une table permettent d'ajouter, remplacer, réaffecter ou retirer chaque partie.
- **Un médecin des tables.** « Diagnostiquer et réparer » explique en mots simples pourquoi une table ne marche pas, et répare ce qu'il peut : une ROM dans le mauvais dossier, un PuP-Pack que son script laisse éteint, un fronton sur le mauvais écran.
- **Une bibliothèque de ROM partagée.** Chaque ROM rangée une seule fois, liée physiquement dans chaque table qui l'utilise.
- **Des PuP-Packs qui marchent.** L'option du pack est choisie d'après vos écrans, le pack est vérifié avant chaque partie, et les problèmes connus des packs (images sous un nom de vidéo, noms de fichiers accentués, vidéos déclenchées par le DMD) sont corrigés pour tous les packs.
- **Des téléchargements qui reprennent** le lendemain si la connexion tombe, et vous ramènent d'un geste à l'écran d'où vous êtes parti. Cyber Pinball ne télécharge jamais de tables ni de ROM à votre place : vous choisissez, sur les sites de leurs auteurs.

## Des médias de partout, choisis par vous

<p align="center">
  <img src="docs/images/fr/game-page.webp?v=c9bc2367a6" width="360" alt="La fiche du jeu Neon Abyss : statistiques de jeu, fichiers, et les actions Jouer, Prospectus, Règles, Modifier les informations, Médias du jeu, Réglages de cette table, Diagnostiquer et réparer, Retirer la table.">
  <img src="docs/images/fr/game-media.webp?v=0804b74ab4" width="360" alt="L'écran Médias du jeu de Neon Abyss : chaque média avec son aperçu, l'endroit où le menu le montre et son rôle (logo de la roue, plateau, fronton, DMD…), et les actions Chercher les médias et Chercher sur le web.">
</p>

- **Chaque média, côte à côte.** Logo de la roue, vidéo du plateau, fronton, DMD, topper, vidéo de chargement, musique, prospectus et règles : « Médias du jeu » montre ce qu'est chacun, où le menu l'utilise, et permet de le remplacer.
- **Des galeries, pas des devinettes.** Chaque média liste ce que proposent [VPinMediaDB](https://github.com/superhac/vpinmediadb), VPForums et VPUniverse, avec aperçus, nombre de téléchargements, notes, auteurs et dates ; vous choisissez, et c'est le fichier choisi qui est enregistré. Les sites à compte s'utilisent avec votre propre compte gratuit ; leurs attentes sont mises en file pour vous.
- **Un navigateur intégré** sur chaque écran d'ajout ou de choix, la recherche déjà remplie. Une page YouTube ou Vimeo ? « Récupérer le son » ou « Récupérer la vidéo », coupé et attribué d'un seul geste.
- **Jouer et enregistrer.** Depuis la fiche d'une table, Cyber Pinball filme votre partie ; de retour au menu, la vidéo peut devenir la présentation de la table sur la roue.
- **Jamais de roue vide.** Quand un média manque, un remplaçant est dessiné aux couleurs de la table. Vous avez déjà des médias d'un autre frontend ? Importez-les.

## Une borne qui veille sur elle-même

<p align="center">
  <img src="docs/images/fr/health.webp?v=65df0dccb2" width="360" alt="Santé de la borne : 1 point bloquant, 2 à vérifier, 3 OK. Espace disque correct, Midnight Circuit ne démarre pas faute de sa ROM (ligne choisie, avec Ouvrir le médecin de la table), VPinMediaDB a des médias pour 2 tables, la borne du salon est reconnue avec ses 4 écrans, et une version plus récente de VPX peut être installée.">
  <img src="docs/images/fr/update.webp?v=1d61b1b143" width="360" alt="Une mise à jour est disponible : Cyber Pinball 0.2.0, sa date de sortie, ses nouveautés, la taille de l'installeur signé, et les boutons Mettre à jour maintenant et Plus tard.">
</p>

- **Santé de la borne.** Espace disque, tables qui ne démarrent pas, médias manquants, écrans et version de VPX sur un seul écran, chacun avec sa réparation.
- **Des mises à jour signées, depuis la borne.** Une pastille rouge sur la roue dentée quand une version sort ; les nouveautés dans votre langue ; un bouton l'installe. Chaque version est signée, et la borne refuse tout ce qui ne porte pas la signature de l'éditeur. Tables, médias et réglages sont conservés.
- **Des horaires d'arcade.** La nuit, la borne baisse ses écrans et se tait, puis se met en veille ou s'éteint à l'heure choisie si personne ne joue, après un avertissement que n'importe quel bouton annule.
- **Un mode invité** pour une soirée ou les enfants : les invités choisissent une table, jouent et lisent sa fiche, rien d'autre ; les deux flippers et les deux MagnaSave tenus le déverrouillent.
- **Une borne dédiée.** Si vous le souhaitez, Cyber Pinball remplace l'interface de Windows, avec un moyen de la retrouver ; éteindre, redémarrer et mettre en veille depuis le menu, chaque écran noir jusqu'au bout.
- **Le bureau rendu tel qu'il était.** L'écran du playfield n'est tourné que pendant que Cyber Pinball tourne ; chaque sortie, même après un plantage, lui rend son orientation.
- **En français ou en anglais**, au choix dans le menu système (« Language / Langue »), dates et nombres compris.

<p align="center"><img src="docs/images/fr/system-menu.webp?v=4399a62b92" width="360" alt="Le menu système : les rubriques Amis, Tables, Médias, Téléchargements, Borne et Cyber Pinball, chacune avec ce qu'elle contient."></p>

## Prérequis

- Windows 10 ou 11, 64 bits.
- Un disque local avec quelques Go libres. Program Files, les dossiers de Windows et les lecteurs réseau sont refusés : VPX et les tables ont besoin d'écrire à côté d'eux.
- Visual Pinball X 10.8.1 : installé pour vous au premier lancement.

## Installation

Téléchargez un installeur sur la page des [versions publiées](https://github.com/gocode/cyberpinball/releases) :

| Fichier | Taille | Visual Pinball X |
| --- | --- | --- |
| `CyberPinball-Setup.exe` | 110 Mio environ | téléchargé au premier lancement depuis sa page officielle, vérifié par SHA-256 |
| `CyberPinball-Setup-complet.exe` | 280 Mio environ | archive officielle incluse, pour une borne sans Internet |

- Tout vit dans **un dossier racine** que vous choisissez (par exemple `D:\CyberPinball`) : l'application dans `app\`, et à côté les tables, médias, configuration, données et émulateurs. Cyber Pinball garde sa propre copie de VPX et son propre `VPinballX.ini`, et n'inscrit rien dans Windows.
- Pas besoin de droits d'administrateur : l'installation se fait pour l'utilisateur courant. Pour les amis, Windows demande une fois l'autorisation de laisser passer Cyber Pinball par son pare-feu ; la refuser rend seulement le réseau local moins sûr.
- Options : un raccourci sur le bureau, et le lancement au démarrage de Windows (borne dédiée). Installation silencieuse : `/S`, `/DEMARRAGE` (lancement au démarrage), `/SANSBUREAU` (pas de raccourci sur le bureau), `/PAREFEU` (demander la règle du pare-feu même en silence), `/D=D:\Borne` (dossier racine, en dernier et sans guillemets).
- **La désinstallation ne retire que l'application.** Tables, médias, configuration et données restent dans le dossier racine ; une réinstallation au même endroit les retrouve telles quelles.
- Les installeurs ne sont pas encore signés : Windows SmartScreen avertit à leur lancement.

Au premier lancement, Cyber Pinball propose d'installer VPX, puis guide le réglage des boutons, du lanceur analogique, des écrans, du playfield, de la disposition et du son, le tout aux boutons de la borne.

## Mise à jour

Depuis la borne : **menu système > « Cyber Pinball » > « Mise à jour de Cyber Pinball »**. Rien ne s'installe d'office : Cyber Pinball cherche discrètement une nouvelle version après le démarrage puis toutes les 6 heures, et quand il y en a une, une pastille rouge apparaît sur la roue dentée du menu et sur cette entrée. L'entrée montre alors les nouveautés de chaque version manquée, et l'installe d'un seul bouton si l'on choisit « Mettre à jour maintenant ». Il se ferme pendant l'installation (une minute environ), redémarre tout seul et dit quelle version est installée. Si l'installation échoue, l'installeur remet la version précédente en place.

Chaque version publiée porte un flux signé (`cyberpinball-maj.json`, Ed25519). L'installeur n'est téléchargé que si la signature correspond à la clé livrée dans l'application, et il n'est lancé que si sa taille et son SHA-256 sont les bons. Une préversion (`0.2.0-beta.1`) n'est jamais proposée aux bornes.

## Commandes

Les boutons sont ceux que l'assistant a relevés. En attendant, ce sont les touches qu'envoient d'ordinaire les encodeurs de borne :

| Bouton | Touche par défaut | Menu des tables |
| --- | --- | --- |
| Flipper gauche / droit | Maj gauche / droite | Choisir une table |
| Start | 1 | Jouer |
| Exit | Échap | Menu système (réglages, configuration de la borne, mise à jour, quitter) |
| Clavier | Tab, ou ⚙ à la souris | Menu système, de n'importe où |
| Clavier | Ctrl+Maj+D | Bureau Windows : libère tous les écrans du PC ; de nouveau : retour au menu |
| Clavier | Ctrl+Maj+K | Arrêter une partie bloquée |

Pendant une partie, les touches sont celles de la section `[Input]` de VPX, rappelées sur l'écran de chargement.

## Compiler depuis les sources

Il faut Windows 10 ou 11 et Node.js 22 ou plus.

```bash
npm install
npm test            # compile, passe le contrôle de publication et les tests du cœur
npm start           # menu des tables (assistant d'écrans au premier démarrage)
npm run assistant   # assistant complet de la borne
npm run probe       # liste les écrans et les sorties audio détectés
npm run installeur  # fabrique release\CyberPinball-Setup.exe et CyberPinball-Setup-complet.exe
```

`lanceur.cmd` ouvre un menu avec les mêmes actions. Les tests de bout en bout se font sans opérateur et entièrement hors écran : Electron rend en mémoire sur un bureau Windows caché, avec des écrans simulés, et ne prend jamais les écrans du développeur.

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Modèle de borne, empreintes EDID, correspondance des écrans, générateurs INI et VPX, mise à jour. Sans Electron ni Windows. |
| `packages/win-displays` | Fonctions de Windows par FFI (koffi) : écrans, sorties audio, périphériques USB, fenêtres, orientation. |
| `packages/installer` | Manifeste des composants tiers, dossier racine, téléchargements vérifiés, jonctions de version. |
| `app` | L'application Electron : assistant, menu des tables, réglages de VPX, gestion des tables, lancement des parties. |
| `docs` | Manuel technique, scénarios de tests manuels, notes de recherche, design system. |

Le [manuel technique](docs/manuel.md) décrit chaque partie en détail : les fichiers écrits, les commandes, les essais hors écran et les limites connues. Les [scénarios de tests manuels](docs/tests-manuels.md) couvrent ce qui demande une vraie borne. Les deux existent aussi en anglais.

### Publier une version (mainteneurs)

Chaque étape ci-dessous est une action de `lanceur.cmd` (rubrique « Fabrication et publication sur GitHub ») : voir l'[aide-mémoire](docs/manuel.md#aide-mémoire--publier-une-version) du manuel technique.

`npm run publier` vérifie que rien de personnel ni de secret ne va partir, fabrique les deux installeurs, signe le flux de mise à jour et envoie un instantané du code sur `main`. Il crée ensuite la release GitHub `v<version>` avec les installeurs et le flux. Les nouveautés viennent de [CHANGELOG.md](CHANGELOG.md) (affichées sur la borne) et de sa traduction [CHANGELOG.en.md](CHANGELOG.en.md) (ajoutée à la release GitHub). Il faut un jeton GitHub à grain fin, rangé une fois pour toutes dans `%USERPROFILE%\.cyberpinball\jeton-github.txt` (ou la variable `CYBERPINBALL_GITHUB_TOKEN`), et la clé de publication : aucun des deux n'est jamais dans le dépôt, et le `.gitignore` comme le contrôle de publication en écartent les fichiers de secrets. La description et les sujets du dépôt viennent du `package.json` et sont appliqués à chaque release, ou par `npm run decrire` (le jeton a alors besoin de la permission « Administration »). Voir [Mise à jour depuis la borne](docs/manuel.md#mise-à-jour-depuis-la-borne) dans le manuel technique.

## Composants tiers et licences

- **Visual Pinball X** ne fait pas partie de ce dépôt. Il est téléchargé depuis ses [versions officielles](https://github.com/vpinball/vpinball/releases) et vérifié contre une empreinte SHA-256 fixée. Sa licence (GPLv3+, et pour certains fichiers une licence dérivée de celle de MAME) n'autorise sa redistribution que gratuitement, hors de tout produit ou activité commerciale. L'installeur complet **ne doit donc être ni vendu, ni livré avec une borne vendue ou exploitée commercialement**.
- La **base VPS** et **VPinMediaDB** ne déclarent aucune licence. Cyber Pinball ne les livre pas : elles sont téléchargées depuis leurs adresses officielles au premier usage. Les médias de VPinMediaDB appartiennent à leurs auteurs et les visuels des jeux à leurs fabricants : **usage personnel, sur sa propre borne** seulement. Les fichiers de VPForums et de VPUniverse se téléchargent avec votre propre compte, un à la fois, à votre demande, et restent sur votre borne : leurs sites interdisent de les remettre en ligne ou de les redistribuer.
- Le réseau des bornes s'appuie sur Hyperswarm, HyperDHT, Protomux et secret-stream de Holepunch, avec sodium-native et udx-native (licences MIT et Apache-2.0).
- Les polices (Audiowide, Bebas Neue, Orbitron, Saira) sont sous licence SIL Open Font License ; leurs licences sont rangées à côté d'elles, dans `app/renderer/polices`.
- Cyber Pinball ne télécharge ni tables ni ROM à votre place. Les tables viennent des sites de leurs auteurs, et les fabricants de flippers n'autorisent pas la diffusion de leurs ROM.

## Licence

La licence de Cyber Pinball lui-même n'est pas encore choisie. Tant qu'un fichier `LICENSE` n'a pas été ajouté, le code est publié pour être lu et essayé, et tous les droits restent à son auteur.
