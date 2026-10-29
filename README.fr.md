# Cyber Pinball

**Un frontend libre pour borne de flipper virtuel. Vous décrivez votre borne une fois, Cyber Pinball règle tout le reste. Tout se commande avec les boutons des flippers, et vous jouez en ligne avec les bornes de vos amis.**

[English](README.md) · [Télécharger](https://github.com/gocode/cyberpinball/releases) · [Manuel technique](docs/manuel.md) · [Nouveautés](CHANGELOG.md)

<p align="center"><img src="docs/images/fr/cabinet.webp?v=9f776b3256" width="900" alt="Le menu des tables sur une borne à quatre écrans. Sur le playfield, montré à la verticale : le plateau de la table sélectionnée, la roue de médaillons ronds et les commandes. À côté, le topper, le fronton et le DMD du même jeu, Neon Abyss."></p>

<p align="center"><sub>Les tables présentées sont fictives.</sub></p>

Cyber Pinball transforme un PC rempli de tables Visual Pinball X en véritable borne d'arcade. La roue de sélection a l'allure d'une vraie machine, tous les écrans de la borne servent, et vous n'avez plus jamais besoin d'un clavier, d'une souris ou d'un fichier `.ini`. Cyber Pinball configure lui-même chaque composant et garde ces réglages à jour : VPX, fronton, PuP-Packs et DMD, emplacement des écrans, sorties audio, touches. Il repère ce qui manque à une table avant que vous puissiez y jouer et va chercher ses médias sur les sites de la communauté. Il relie aussi votre borne à celles de vos amis : vous échangez des tables et jouez ensemble en direct, sans le moindre serveur entre vous.

> **Statut : premier prototype (0.1.x).** Windows uniquement, conçu pour Visual Pinball X 10.8.1 en mode plugins. Il reste des angles à arrondir : sauvegardez vos tables avant de l'essayer.

## Points forts

- **[Jouer entre amis, de borne à borne](#jouer-entre-amis-de-borne-à-borne)** : des parties en ligne jusqu'à quatre bornes, des tables et des médias qui s'échangent, et vous voyez qui joue à quoi. Sans serveur ni compte.
- **[Tout se règle depuis la borne](#tout-se-règle-depuis-la-borne)** : un assistant qui se suit aux boutons des flippers. Les écrans sont reconnus à leur empreinte matérielle, si bien que rien ne casse quand Windows les renumérote.
- **[Un menu digne d'une vraie borne](#un-menu-digne-dune-vraie-borne)** : une roue de médaillons, un DMD animé, un lancement façon cinéma, les bruits de la machine, et jamais le moindre bout de bureau Windows.
- **[De la table repérée à la première partie](#de-la-table-repérée-à-la-première-partie)** : le catalogue VPS, un parcours guidé « Ce qu'il manque pour jouer », un médecin des tables, et chaque fichier téléchargé rangé au bon endroit.
- **[Les médias de votre choix, d'où qu'ils viennent](#les-médias-de-votre-choix-doù-quils-viennent)** : pour chaque média, tout ce que proposent les sites, un navigateur intégré, et vos propres parties filmées pour présenter les tables sur la roue.
- **[Une borne qui s'entretient toute seule](#une-borne-qui-sentretient-toute-seule)** : un bilan de santé, des mises à jour signées, des horaires pour la nuit, un mode invité pour les soirées.

## Jouer entre amis, de borne à borne

<p align="center"><img src="docs/images/fr/live-game.webp?v=57b0ba496a" width="760" alt="Une partie en direct entre bornes. À gauche, l'invitation de Bruno pour Atlas Rising s'affiche toute seule sur cette borne. À droite, le départ commun : un compte à rebours, les deux joueurs prêts, juste avant que la table démarre sur toutes les bornes en même temps."></p>

Une partie entre amis, chacun chez soi ? Cyber Pinball relie directement vos bornes, par Internet ou sur le réseau local : pas de compte à créer, pas de serveur au milieu.

- **Des parties en direct, en ligne.** Invitez jusqu'à trois amis sur une table. L'invitation s'affiche sur leur borne, Cyber Pinball vérifie que tout le monde a la même version de la table, puis un compte à rebours commun lance la partie partout en même temps. À la fin, les scores de chacun s'affichent côte à côte.
- **Savoir qui joue.** Vous voyez quels amis sont en ligne, sur quelle table ils jouent, leurs derniers records et leurs badges. De petites notifications apparaissent sur la roue, jamais pendant une partie.
- **Compléter sa collection chez un ami.** Parcourez la bibliothèque d'un ami pour y repérer les tables que vous n'avez pas et les médias qui vous manquent. Récupérez une table complète ou seulement certaines de ses parties (table, fronton, sons, médias), en comparant sa version et la vôtre. Tout est vérifié à la réception, et vous voyez exactement ce qui va être ajouté avant la moindre installation ; la ROM et le PuP-Pack sont décochés par défaut, et ne se cochent qu'après avoir attesté que vous en avez les droits.
- **Trouver des partenaires de jeu.** Cherchez un joueur par son nom dans un annuaire que les bornes se transmettent entre elles, ou repérez les bornes voisines sur le réseau local, même sans Internet. Envoyez-lui une demande d'ami : il n'a plus qu'à l'accepter.
- **Chez vous, c'est vous qui décidez.** Vos sauvegardes, vos fichiers de records et vos programmes ne quittent jamais votre borne. Le partage est activé par défaut et se coupe à un seul endroit, « Partage et réseau », qui montre aussi ce que les autres bornes peuvent voir. Le tout repose sur Hyperswarm, de [Holepunch](https://holepunch.to).

<p align="center"><img src="docs/images/fr/friends.webp?v=8a30474698" width="760" alt="Mes amis : Bruno est en ligne sur Star Courier et vient de battre son record, Émile est hors ligne. À côté, la page de Bruno, avec ses derniers événements et le bouton Voir sa bibliothèque."></p>

<p align="center"><img src="docs/images/fr/friends-library.webp?v=2a1884157c" width="760" alt="La bibliothèque de Bruno : les tables que les deux bornes ont en commun, et Glass Lagoon, que cette borne n'a pas encore, avec ses médias et le bouton Récupérer toute la table."></p>

## Tout se règle depuis la borne

<p align="center"><img src="docs/images/fr/wizard.webp?v=03329ccd70" width="900" alt="L'assistant de configuration, à l'étape des écrans et de leurs rôles : chacun des quatre écrans affiche son numéro, et celui du playfield demande « Playfield ? », avec les consignes pour les flippers et Start."></p>

- **Un assistant qui se suit debout, aux flippers.** Boutons (encodeur clavier, manette ou Pinscape KL25Z), lanceur analogique, accéléromètre et plomb de tilt, écrans, orientation et diagonale du playfield, sorties audio : à chaque étape, on répond avec les boutons de la borne.
- **Des écrans reconnus, pas simplement numérotés.** Chaque écran est identifié par son empreinte EDID, et `VPinballX.ini` est réécrit à chaque démarrage. Vous pouvez remplacer un écran, les allumer dans un autre ordre ou laisser Windows tout renuméroter : le playfield reste le playfield.
- **Chaque son au bon endroit.** Une étape joue un son sur chaque sortie pour vous faire choisir celle du fronton et celle du playfield, puis teste un à un les haut-parleurs d'une carte 5.1 ou 7.1. Le menu, sa musique et toutes les vidéos sortent sur les haut-parleurs de la borne.
- **Une seule installation, plusieurs configurations.** La même installation peut servir à la borne et à un PC de bureau. Cyber Pinball reconnaît tout seul la configuration branchée, chacune avec ses écrans, son son, ses boutons et son `VPinballX.ini`.
- **Les réglages de VPX sans toucher au `.ini`.** Tous les réglages de VPX, repris de son code source, se modifient pour l'ensemble des tables ou table par table. Le cadrage et l'emplacement du fronton, du DMD et du topper se règlent pendant la partie, depuis le menu de VPX.

<p align="center"><img src="docs/images/fr/vpx-settings.webp?v=72eca11b71" width="760" alt="L'écran des réglages de VPX : l'onglet Essentiels, avec la vue de la table et le son, les valeurs gérées par Cyber Pinball et l'explication du réglage sélectionné."></p>

## Un menu digne d'une vraie borne

<p align="center"><img src="docs/images/fr/launch.webp?v=eddb60de91" width="900" alt="Le lancement animé d'une table sur une borne à quatre écrans : au Start, le logo de Neon Abyss s'allume sur le plateau, monte en traversant le DMD et vient se poser sur le fronton, puis les écrans s'effacent quand Visual Pinball X prend le relais."></p>

- **Une roue de médaillons** posée sur la vidéo du plateau, et une fenêtre pour chaque écran de la borne : le topper, le fronton et le DMD suivent le jeu sélectionné.
- **Un DMD bien vivant.** Cyber Pinball dessine lui-même l'afficheur, avec sa propre police à points : le titre, PRESS START, les crédits, l'heure et les records défilent dans la couleur de votre choix.
- **Un lancement de cinéma.** Au Start, le logo du jeu s'envole du playfield jusqu'au fronton, le DMD affiche le chargement, et un coup de bobine retentit quand VPX prend le relais. Le spectacle ne retarde jamais VPX.
- **Les bruits de la machine.** Un clac de solénoïde quand vous changez de table, une pièce au Start, le knocker quand un record tombe, et la musique de chaque jeu sur la roue.
- **Ni écran blanc, ni bureau.** Du démarrage à la fin d'une partie, retour au menu compris, tous les écrans restent couverts. Ctrl+Maj+D les libère quand vous voulez retrouver Windows.
- **Aussi sur un PC de bureau.** Le playfield s'affiche dans un cadre 9:16 avec la roue et le jeu à côté, et le fronton passe sur un second écran si vous en avez un.

<p align="center"><img src="docs/images/fr/live-dmd.webp?v=7a6e43e169" width="760" alt="Le DMD du menu, dessiné par Cyber Pinball, qui fait défiler le titre du jeu, PRESS START, le meilleur score et l'heure."></p>

<p align="center"><img src="docs/images/fr/desktop.webp?v=eccb3b9ce0" width="900" alt="Le menu des tables sur un PC de bureau : à gauche, le plateau de Neon Abyss dans un cadre 9:16 vertical ; à droite, son fronton, la roue de médaillons (Copper Comet, Lunar Diner, Midnight Circuit, Neon Abyss, Star Courier, Thunder Reef, Atlas Rising) et le bandeau du titre."></p>

## De la table repérée à la première partie

<p align="center"><img src="docs/images/fr/missing-to-play.webp?v=265baffecb" width="760" alt="Ce qu'il manque pour jouer à Neon Abyss. À gauche, l'étape 3 sur 4 : il reste la ROM, et Cyber Pinball conseille de la récupérer sur vpforums.org, ou de jouer avec une révision proche déjà présente sur la borne. À droite, une fois la ROM installée : Tout est prêt pour jouer, avec Jouer comme première action."></p>

- **« Ajouter une table » regroupe toutes les sources.** Un dossier d'import, une clé USB, le PC, votre dossier Téléchargements ou le catalogue du [Virtual Pinball Spreadsheet](https://github.com/VirtualPinballSpreadsheet/vps-db) : pour chaque jeu, vous voyez ses versions et ce qui manque encore à votre borne pour y jouer. Les tables portent le nom que leur donne cette base.
- **« Ce qu'il manque pour jouer ».** Un parcours pas à pas : d'une ROM ou d'un fronton manquant jusqu'à la bonne page de téléchargement, puis l'installation de ce que vous avez récupéré, et enfin « Jouer ». Seules la table et sa ROM sont indispensables ; le reste est proposé en bonus.
- **Chaque fichier trouve sa place.** Cyber Pinball reconnaît un fichier téléchargé à son contenu (table, fronton, ROM, PuP-Pack, couleurs du DMD, sons, musique…) et le range dans la bonne partie du jeu, même si vous attendiez autre chose. Depuis les « Parties du jeu » d'une table, vous pouvez ajouter, remplacer, réaffecter ou retirer chacune d'elles.
- **Un médecin des tables.** « Diagnostiquer et réparer » explique simplement pourquoi une table ne fonctionne pas et répare ce qui peut l'être : une ROM dans le mauvais dossier, un PuP-Pack que le script de la table laisse éteint, un fronton sur le mauvais écran.
- **Une seule bibliothèque de ROM.** Chaque ROM n'est stockée qu'une fois, puis liée physiquement dans chaque table qui en a besoin.
- **Des PuP-Packs qui fonctionnent.** L'option du pack est choisie en fonction de vos écrans, le pack est vérifié avant chaque partie, et ses défauts connus (images enregistrées sous un nom de vidéo, noms de fichiers accentués, vidéos déclenchées par le DMD) sont corrigés, quel que soit le pack.
- **Des téléchargements qui reprennent** le lendemain si la connexion coupe, et qui vous ramènent d'un geste à l'écran d'où vous étiez parti. Cyber Pinball ne télécharge jamais de tables ni de ROM de lui-même : c'est vous qui choisissez, sur les sites de leurs auteurs.

## Les médias de votre choix, d'où qu'ils viennent

<p align="center">
  <img src="docs/images/fr/game-page.webp?v=c9bc2367a6" width="360" alt="La fiche du jeu Neon Abyss : statistiques de jeu, fichiers, et les actions Jouer, Prospectus, Règles, Modifier les informations, Médias du jeu, Réglages de cette table, Diagnostiquer et réparer, Retirer la table.">
  <img src="docs/images/fr/game-media.webp?v=0804b74ab4" width="360" alt="L'écran Médias du jeu de Neon Abyss : chaque média avec son aperçu, l'endroit où le menu l'affiche et son rôle (logo de la roue, plateau, fronton, DMD…), et les actions Chercher les médias et Chercher sur le web.">
</p>

- **Tous les médias d'un jeu, d'un coup d'œil.** Logo de la roue, vidéo du plateau, fronton, DMD, topper, vidéo de chargement, musique, prospectus et règles : « Médias du jeu » montre chacun d'eux, indique où le menu s'en sert et permet de le remplacer.
- **Choisir sur pièces.** Pour chaque média, vous voyez tout ce que proposent [VPinMediaDB](https://github.com/superhac/vpinmediadb), VPForums et VPUniverse, avec aperçus, nombre de téléchargements, notes, auteurs et dates. Vous choisissez, et c'est bien ce fichier-là qui est enregistré. Les sites qui demandent un compte s'utilisent avec le vôtre, gratuit ; quand ils imposent un délai entre deux téléchargements, Cyber Pinball met les vôtres en file d'attente.
- **Un navigateur intégré** sur chaque écran d'ajout ou de choix, avec la recherche déjà saisie. Vous tombez sur une page YouTube ou Vimeo ? « Récupérer le son » ou « Récupérer la vidéo » : l'extrait est découpé et attribué à la table en un seul geste.
- **Jouer et enregistrer.** Depuis la fiche d'une table, Cyber Pinball filme votre partie ; de retour au menu, cette vidéo peut devenir la présentation de la table sur la roue.
- **Jamais de roue vide.** Quand un média manque, Cyber Pinball dessine un remplaçant aux couleurs de la table. Vous avez déjà des médias venant d'un autre frontend ? Importez-les.

## Une borne qui s'entretient toute seule

<p align="center">
  <img src="docs/images/fr/health.webp?v=65df0dccb2" width="360" alt="Santé de la borne : 1 point bloquant, 2 à vérifier, 3 OK. L'espace disque suffit ; Midnight Circuit ne démarre pas faute de ROM (ligne sélectionnée, avec Ouvrir le médecin de la table) ; VPinMediaDB a des médias pour 2 tables ; la borne du salon est reconnue avec ses 4 écrans ; une version plus récente de VPX peut être installée.">
  <img src="docs/images/fr/update.webp?v=1d61b1b143" width="360" alt="Une mise à jour est disponible : Cyber Pinball 0.2.0, avec sa date de sortie, ses nouveautés, la taille de l'installeur signé, et les boutons Mettre à jour maintenant et Plus tard.">
</p>

- **La santé de la borne d'un seul coup d'œil.** Espace disque, tables qui ne démarrent pas, médias manquants, écrans, version de VPX : tout est réuni sur un seul écran, et chaque problème vient avec sa solution.
- **Des mises à jour signées, installées depuis la borne.** Une pastille rouge apparaît sur la roue dentée dès qu'une version sort. Vous lisez les nouveautés dans votre langue, et un bouton suffit pour l'installer. Chaque version est signée, et la borne refuse tout ce qui ne porte pas la signature de l'éditeur. Vos tables, médias et réglages sont conservés.
- **Des horaires d'arcade.** La nuit, la borne baisse ses écrans et coupe le son, puis se met en veille ou s'éteint à l'heure choisie si personne ne joue. Un avertissement prévient avant, et n'importe quel bouton l'annule.
- **Un mode invité** pour les soirées ou pour les enfants : on peut choisir une table, jouer et lire sa fiche, rien de plus. Pour en sortir, on maintient les deux flippers et les deux boutons MagnaSave.
- **Une borne dédiée.** Si vous le souhaitez, Cyber Pinball remplace l'interface de Windows, en gardant un moyen de la retrouver. Vous éteignez, redémarrez ou mettez en veille depuis le menu, avec des écrans noirs jusqu'au bout.
- **Le bureau rendu tel que vous l'avez laissé.** L'écran du playfield n'est pivoté que le temps où Cyber Pinball fonctionne. À chaque fermeture, même après un plantage, il retrouve son orientation.
- **En français ou en anglais**, au choix dans le menu système (« Language / Langue »), dates et nombres compris.

<p align="center"><img src="docs/images/fr/system-menu.webp?v=4399a62b92" width="360" alt="Le menu système : les rubriques Amis, Tables, Médias, Téléchargements, Borne et Cyber Pinball, chacune avec un résumé de son contenu."></p>

## Prérequis

- Windows 10 ou 11, 64 bits.
- Un disque local avec quelques Go libres. Program Files, les dossiers de Windows et les lecteurs réseau sont exclus, car VPX et les tables doivent pouvoir écrire dans leur propre dossier.
- Visual Pinball X 10.8.1, installé pour vous au premier lancement.

## Installation

Téléchargez un installeur sur la page des [versions publiées](https://github.com/gocode/cyberpinball/releases) :

| Fichier | Taille | Visual Pinball X |
| --- | --- | --- |
| `CyberPinball-Setup.exe` | 110 Mio environ | téléchargé au premier lancement depuis sa page officielle, puis vérifié par SHA-256 |
| `CyberPinball-Setup-complet.exe` | 280 Mio environ | archive officielle incluse, pour une borne sans accès à Internet |

- Tout est regroupé dans **un dossier racine** de votre choix (par exemple `D:\CyberPinball`) : l'application dans `app\`, et à côté les tables, les médias, la configuration, les données et les émulateurs. Cyber Pinball utilise sa propre copie de VPX et son propre `VPinballX.ini`, et n'inscrit rien dans Windows.
- Aucun droit d'administrateur n'est nécessaire : l'installation se fait pour l'utilisateur courant. Pour les Amis, Windows vous demande une seule fois d'autoriser Cyber Pinball à franchir son pare-feu ; si vous refusez, les liaisons sur le réseau local seront simplement moins fiables.
- En option : un raccourci sur le bureau et le lancement au démarrage de Windows (pour une borne dédiée). Installation silencieuse : `/S`, `/DEMARRAGE` (lancement au démarrage), `/SANSBUREAU` (pas de raccourci sur le bureau), `/PAREFEU` (demander la règle du pare-feu même en mode silencieux), `/D=D:\Borne` (dossier racine, en dernier et sans guillemets).
- **La désinstallation ne retire que l'application.** Vos tables, médias, configuration et données restent dans le dossier racine ; si vous réinstallez au même endroit, vous les retrouvez tels quels.
- Les installeurs ne sont pas encore signés : Windows SmartScreen affiche un avertissement au lancement.

Au premier lancement, Cyber Pinball propose d'installer VPX, puis vous guide pour régler les boutons, le lanceur analogique, les écrans, le playfield, la disposition et le son, le tout avec les boutons de la borne.

## Mise à jour

Depuis la borne : **menu système > « Cyber Pinball » > « Mise à jour de Cyber Pinball »**. Rien ne s'installe sans votre accord. Cyber Pinball vérifie discrètement s'il existe une nouvelle version peu après le démarrage, puis toutes les 6 heures. S'il en trouve une, une pastille rouge apparaît sur la roue dentée du menu et sur cette entrée. Vous y lisez les nouveautés de chaque version manquée, et « Mettre à jour maintenant » l'installe en un seul geste. Cyber Pinball se ferme le temps de l'installation (environ une minute), redémarre tout seul et indique la version installée. Si l'installation échoue, l'installeur rétablit la version précédente.

Chaque version publiée s'accompagne d'un flux signé (`cyberpinball-maj.json`, Ed25519). L'installeur n'est téléchargé que si la signature correspond à la clé fournie avec l'application, et il n'est exécuté que si sa taille et son SHA-256 sont les bons. Les préversions (`0.2.0-beta.1`) ne sont jamais proposées aux bornes.

## Commandes

Les boutons sont ceux que l'assistant a relevés. D'ici là, ce sont les touches qu'envoient habituellement les encodeurs de borne :

| Bouton | Touche par défaut | Menu des tables |
| --- | --- | --- |
| Flipper gauche / droit | Maj gauche / droite | Choisir une table |
| Start | 1 | Jouer |
| Exit | Échap | Menu système (réglages, configuration de la borne, mise à jour, quitter) |
| Clavier | Tab, ou ⚙ à la souris | Menu système, depuis n'importe quel écran |
| Clavier | Ctrl+Maj+D | Bureau Windows : libère tous les écrans du PC ; une seconde fois : retour au menu |
| Clavier | Ctrl+Maj+K | Arrêter une partie bloquée |

En cours de partie, les touches sont celles de la section `[Input]` de VPX ; l'écran de chargement les rappelle.

## Compiler depuis les sources

Il vous faut Windows 10 ou 11 et Node.js 22 ou plus récent.

```bash
npm install
npm test            # compile, passe le contrôle de publication et les tests du cœur
npm start           # menu des tables (assistant d'écrans au premier démarrage)
npm run assistant   # assistant complet de la borne
npm run probe       # liste les écrans et les sorties audio détectés
npm run installeur  # fabrique release\CyberPinball-Setup.exe et CyberPinball-Setup-complet.exe
```

`lanceur.cmd` ouvre un menu qui propose les mêmes actions. Les tests de bout en bout tournent sans intervention et entièrement hors écran : Electron fait son rendu en mémoire sur un bureau Windows caché, avec des écrans simulés, sans jamais occuper les écrans du développeur.

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Modèle de la borne, empreintes EDID, correspondance des écrans, générateurs INI et VPX, mise à jour. Sans Electron ni Windows. |
| `packages/win-displays` | Appels à Windows par FFI (koffi) : écrans, sorties audio, périphériques USB, fenêtres, orientation. |
| `packages/installer` | Manifeste des composants tiers, dossier racine, téléchargements vérifiés, jonctions de version. |
| `app` | L'application Electron : assistant, menu des tables, réglages de VPX, gestion des tables, lancement des parties. |
| `docs` | Manuel technique, scénarios de tests manuels, notes de recherche, design system. |

Le [manuel technique](docs/manuel.md) détaille chaque partie : fichiers écrits, commandes, essais hors écran et limites connues. Les [scénarios de tests manuels](docs/tests-manuels.md) couvrent ce qui demande une vraie borne. Les deux documents existent aussi en anglais.

### Publier une version (mainteneurs)

Chacune des étapes ci-dessous est une action de `lanceur.cmd` (rubrique « Fabrication et publication sur GitHub ») : voir l'[aide-mémoire](docs/manuel.md#aide-mémoire--publier-une-version) du manuel technique.

`npm run publier` vérifie que rien de personnel ni de secret ne risque de partir, fabrique les deux installeurs, signe le flux de mise à jour et envoie un instantané du code sur `main`. Il crée ensuite la release GitHub `v<version>` avec les installeurs et le flux. Les nouveautés proviennent de [CHANGELOG.md](CHANGELOG.md), affiché sur la borne, et de sa traduction [CHANGELOG.en.md](CHANGELOG.en.md), jointe à la release GitHub. Il faut un jeton GitHub à accès restreint (fine-grained), enregistré une fois pour toutes dans `%USERPROFILE%\.cyberpinball\jeton-github.txt` (ou dans la variable `CYBERPINBALL_GITHUB_TOKEN`), ainsi que la clé de publication. Ni l'un ni l'autre ne se trouve jamais dans le dépôt : le `.gitignore` et le contrôle de publication écartent tous deux les fichiers de secrets. La description et les sujets du dépôt sont tirés du `package.json` et appliqués à chaque release, ou par `npm run decrire` (le jeton doit alors avoir la permission « Administration »). Voir [Mise à jour depuis la borne](docs/manuel.md#mise-à-jour-depuis-la-borne) dans le manuel technique.

## Composants tiers et licences

- **Visual Pinball X** ne fait pas partie de ce dépôt. Il est téléchargé depuis ses [versions officielles](https://github.com/vpinball/vpinball/releases) et contrôlé avec une empreinte SHA-256 fixe. Sa licence (GPLv3+, et pour certains fichiers une licence dérivée de celle de MAME) n'en autorise la redistribution que gratuite, en dehors de tout produit ou activité commerciale. L'installeur complet **ne doit donc être ni vendu, ni fourni avec une borne vendue ou exploitée commercialement**.
- La **base VPS** et **VPinMediaDB** n'indiquent aucune licence. Cyber Pinball ne les inclut pas : elles sont téléchargées depuis leurs adresses officielles à la première utilisation. Les médias de VPinMediaDB appartiennent à leurs auteurs, et les visuels des jeux à leurs fabricants : ils sont réservés à un **usage personnel, sur votre propre borne**. Les fichiers de VPForums et de VPUniverse se téléchargent avec votre propre compte, un par un, à votre demande, et restent sur votre borne : ces sites interdisent de les remettre en ligne ou de les redistribuer.
- Le réseau des bornes repose sur Hyperswarm, HyperDHT, Protomux et secret-stream, de Holepunch, ainsi que sur sodium-native et udx-native (licences MIT et Apache-2.0).
- Pour comparer le nombre de billes par partie des tables à ROM, Cyber Pinball lit les cartes mémoire de PinMAME du projet [Pinball Memory Maps](https://github.com/tomlogic/pinball-memory-maps), téléchargées à la demande : ce programme utilise du contenu du projet Pinball Memory Maps, mis à disposition sous licence Open Database License (ODbL v1.0).
- Les polices (Audiowide, Bebas Neue, Orbitron, Saira) sont sous licence SIL Open Font License ; leurs licences se trouvent à côté d'elles, dans `app/renderer/polices`.
- Cyber Pinball ne télécharge ni tables ni ROM à votre place. Les tables proviennent des sites de leurs auteurs, et les fabricants de flippers n'autorisent pas la diffusion de leurs ROM.

## Licence

Cyber Pinball est un logiciel libre, publié sous la licence publique générale GNU, version 3 ou (à votre choix) toute version ultérieure (GPL-3.0-or-later). Vous pouvez l'utiliser, l'étudier, le modifier et le redistribuer, gratuitement ou non, à condition que toute version redistribuée, modifiée ou non, reste sous cette licence et soit accompagnée de son code source. Il est fourni sans aucune garantie. Le texte complet se trouve dans le fichier [LICENSE](LICENSE).

Les composants tiers cités plus haut gardent leur propre licence. En particulier, l'installeur complet, qui embarque Visual Pinball X, reste soumis à celle de VPX : il ne doit être ni vendu, ni fourni avec une borne vendue ou exploitée commercialement.

© 2026 Go Code.
