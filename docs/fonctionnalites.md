[English](features.md) · Français

# Cyber Pinball : toutes les fonctionnalités

Le [README](../README.fr.md) présente Cyber Pinball en quelques images. Cette page détaille tout ce qu'il sait faire, rubrique par rubrique, tel que vous le trouvez sur la borne. Pour le fonctionnement interne (fichiers écrits, commandes, essais), voyez le [manuel technique](manuel.md).

<p align="center"><img src="images/fr/cabinet.webp?v=7cf14b1872" width="900" alt="Le menu des tables sur une borne à quatre écrans. Sur le playfield, montré à la verticale : le plateau de la table sélectionnée, la roue de médaillons ronds et les commandes. À côté, le topper et le fronton du même jeu, Neon Abyss, et le DMD animé du menu."></p>

<p align="center"><sub>Les tables présentées sont fictives.</sub></p>

## Sommaire

- [Jouer entre amis](#jouer-entre-amis)
- [Classements](#classements)
- [Installer et mettre à jour](#installer-et-mettre-à-jour)
- [Configurer la borne](#configurer-la-borne)
- [Le menu des tables](#le-menu-des-tables)
- [Juke-box](#juke-box)
- [Tout se fait aux boutons](#tout-se-fait-aux-boutons)
- [Le téléphone comme télécommande](#le-téléphone-comme-télécommande)
- [Ajouter des tables](#ajouter-des-tables)
- [La fiche d'une table](#la-fiche-dune-table)
- [ROM, PuP-Packs, fronton et DMD](#rom-pup-packs-fronton-et-dmd)
- [Réglages de VPX et réglages en partie](#réglages-de-vpx-et-réglages-en-partie)
- [Médias des jeux](#médias-des-jeux)
- [Pendant une partie](#pendant-une-partie)
- [Réalité virtuelle et Vision 3D](#réalité-virtuelle-et-vision-3d)
- [Une borne qui s'entretient](#une-borne-qui-sentretient)
- [Limites actuelles](#limites-actuelles)

## Jouer entre amis

Les bornes se relient directement entre elles, par Internet ou par le réseau local, sans serveur ni compte. Tout se trouve dans Menu système > « Amis ».

<p align="center"><img src="images/fr/live-game.webp?v=57b0ba496a" width="760" alt="Une partie en direct entre bornes : l'invitation de Bruno pour Atlas Rising s'ouvre d'elle-même, puis le départ commun, un compte à rebours avec les deux joueurs prêts."></p>

### Trouver ses amis et les voir en ligne

- **« Trouver un joueur »** : recherche par nom (sans tenir compte des accents ni des majuscules) ou par l'identifiant affiché sur la fiche du joueur, rubriques « À proximité (réseau local) » et « Vus récemment ».
- **Un annuaire sans serveur** : les bornes se transmettent les profils (jusqu'à 200 à chaque connexion, signés). Un profil qui n'a pas été revu depuis 60 jours en sort.
- **Le réseau local marche même sans Internet** : une borne voisine est « À proximité » tant que sa balise date de moins d'une minute.
- **Demandes d'amis** : envoyées tout de suite, ou à la prochaine connexion de l'autre borne. Une demande faite des deux côtés vous rend amis aussitôt ; un refus est retenu 30 jours. « Bloquer » coupe toute liaison avec une borne.
- **« Mes amis »** : en ligne puis hors ligne, la table que chacun joue en ce moment, son dernier événement (« Nouveau meilleur score sur … », « Badge reçu : … »), et depuis quand il n'a pas été vu.
- **Une présence stable** : un ami reste en ligne tant qu'une liaison le relie à vous (15 s de tolérance quand elle tombe). La liste dit si elle est sûre : « Recherche des amis… », « Mise à jour en cours… », puis « Liste à jour : 1 ami en ligne ». La fiche d'un ami dit par où il est relié (Internet, réseau local).
- **Une pastille au menu des tables** : le nombre d'amis en ligne ; un clic ouvre « Mes amis ».
- **« Mes badges »** : huit badges (Première partie, Dix tables, Cent parties, Une heure sur une table, Dix heures de jeu, Au tableau d'honneur, Grand Champion, Cinq fois champion).
- **Un nom à soi** : de 2 à 24 caractères, affiché seul, avec l'avatar. Deux joueurs du même nom se départagent par l'identifiant unique de leur fiche. Au premier démarrage, juste après l'assistant d'écrans, Cyber Pinball propose de choisir son pseudo et son avatar ; rien d'obligatoire, tout se change ensuite.
- **« Mon avatar »** : une photo ou une image à vous, prise sur le PC ou dans le navigateur intégré, recadrée aux boutons de la borne (zoom, déplacer, recentrer) ou à la souris. Une photo y perd ses métadonnées, position GPS comprise. Sans avatar, vos initiales sur une teinte qui vous est propre. Seuls vos amis et les joueurs d'une demande en cours le reçoivent, et les joueurs qui voient vos scores dans les classements.

<p align="center"><img src="images/fr/friends.webp?v=8306cc0c9e" width="760" alt="Mes amis : Bruno en ligne, en partie sur Star Courier avec son nouveau record, et Émile hors ligne ; à côté, la fiche de Bruno avec ses derniers événements et « Voir sa bibliothèque »."></p>

<p align="center">
  <img src="images/fr/features/friends-section.webp?v=e38b02af5d" width="300" alt="La rubrique Amis : Messages, Mes amis, Mon avatar, Mon profil public, Historique des parties, Trouver un joueur, Demandes d'amis, Mes badges, Partage et réseau, Scores des amis pendant la partie, Masquer les notifications pendant les parties.">
  <img src="images/fr/features/badges.webp?v=3c2118215f" width="300" alt="Mes badges, 4 sur 8 : Première partie, Cent parties, Une heure sur une table et Dix heures de jeu obtenus ; Dix tables, Au tableau d'honneur, Grand Champion et Cinq fois champion à obtenir.">
</p>

### Inviter et jouer en direct

- **Deux façons d'inviter** : « Inviter à une partie en direct » sur la fiche d'un ami, ou « Jouer avec un ami » sur la fiche d'une table, juste sous « Jouer ». Une invitation impossible reste visible, grisée avec sa raison (« Hors ligne », « Aucun ami en ligne pour l'instant »).
- **Jusqu'à quatre bornes** dans le salon ; les invités n'ont pas besoin d'être amis entre eux.
- **Le choix de la table** met en tête celles que tous ont dans la même version. Les autres restent visibles, grisées avec le nom de qui bloque (« Autre version chez Bruno », « Bruno n'a pas cette table ») ; Start ouvre sa version dans sa bibliothèque, à récupérer.
- **L'invitation s'ouvre d'elle-même** chez l'ami, avec un carillon, et vaut deux minutes. Même pendant une partie, une carte discrète dans le coin du plateau la montre sans gêner le jeu.
- **La même table pour tous** : même fichier `.vpx`, même script. Une table renommée autrement chez l'ami est reconnue à son fichier.
- **Les réglages de celui qui invite** (nombre de billes, sauvetage de bille, tilt…) sont envoyés à chaque invité et posés dans sa partie. Un nombre de billes différent fait jouer quand même, mais hors classement, et l'invitation le dit avant d'accepter.
- **Un départ commun** : chaque borne attend que les tables de tous soient chargées. Une carte au centre du plateau dit qui l'on attend (« En attente : Bruno — Chargement de la table… »), puis « Partez ! » s'affiche partout. Un retardataire ne bloque pas les autres au-delà de 90 s.
- **Votre table reste intacte** : la partie se joue sur un double de la table, fait juste avant et supprimé au retour. La mémoire de la ROM, vos records et vos réglages ne bougent pas.
- **Les résultats** classent les joueurs avec leur score et leur durée, se complètent à mesure que les autres reviennent, et proposent « Rejouer avec les mêmes joueurs » ou « Autre table, mêmes joueurs ».

### Pendant la partie

- **Démarrage et fin automatiques** sur les tables originales du socle commun et sur les tables à ROM Williams WPC et Stern SAM : un crédit puis Start au « Partez ! », la fin de partie lue dans la table, VPX fermé tout seul, les résultats ouverts.
- **Une bande des scores en direct** : le score et la bille de chacun, le meilleur en tête. Elle va sur le fronton (même pris par le backglass ou le PuP-Pack, discrète, en bas), sinon le topper, sinon le bas du plateau. Elle ne cache jamais la bille.
- **Les scores sur le DMD** aux moments calmes, seulement quand il montre l'écran de score de la table ; réglage « Scores sur le DMD », activé par défaut.
- **Réglage « Scores des amis pendant la partie »** : Automatique, Sur le fronton, Sur le topper, En bas du plateau, Sur le côté du plateau. Une place impossible sur votre borne est grisée avec sa raison.
- **Des notifications en une ligne**, en haut du plateau et par-dessus VPX, sans lui prendre la main : un ami qui se connecte, une invitation, un invité qui accepte ou décline (avec la raison), une partie finie avec le gagnant et votre place. Chacune a son petit son. « Masquer les notifications pendant les parties » les garde pour le retour au menu.
- **« Activité récente » pour relire ce qu'on a manqué**, en tête du menu système : chaque notification en entier, par jour, l'heure, ce qui se répète regroupé (« Chloé : 3 connexions »), et Start fait ce qu'elle annonce (la fiche de l'ami, l'invitation tant qu'elle vaut, les résultats, les téléchargements, la mise à jour). Ce qui ne vaut plus reste, grisé avec sa raison (« Invitation expirée »). Le non-lu y est marqué sans pastille rouge (chaque chose qui attend a la sienne là où on y répond) ; les 50 dernières gardées d'un démarrage à l'autre.
- **Une table sans relevé** est annoncée « Départ manuel, pas de score en direct », avec la raison : son score compte s'il entre au tableau d'honneur de la table.
- **Une borne restée sur une ancienne version** est signalée dans le salon, l'invitation et la bande, au lieu de sembler boguée.

<p align="center"><img src="images/fr/live-scores.webp?v=cf6ce49d8c" width="760" alt="Une partie entre amis sur Atlas Rising : en bas du fronton, la bande Partie entre amis montre les scores de Bruno et d'Alexis en direct, et le DMD les mêmes scores en points lumineux."></p>

<p align="center"><img src="images/fr/friends-notifications.webp?v=248819c9c6" width="760" alt="Deux moments d'une partie : une ligne discrète en haut du plateau annonce que Bruno vient de se connecter, puis sa carte d'invitation avec le temps restant pour répondre."></p>

<p align="center"><img src="images/fr/features/live-scores-setting.webp?v=07be4522fc" width="360" alt="Scores des amis pendant la partie : Automatique choisi, Sur le fronton, Sur le topper, En bas du plateau, Sur le côté du plateau, et Scores sur le DMD."></p>

### Records du groupe et historique

- **Un tableau des records par version de table**, vingt places : le salon donne le record à battre, les résultats les cinq meilleurs, et pendant la partie la machine affiche les records du groupe à la place des vôtres. Les tables à ROM aussi : leur tableau est écrit dans la mémoire de la ROM du double.
- **Le knocker** ne sonne que quand le record du groupe tombe.
- **« Historique des parties »** : chaque partie en direct finie, par jour, avec la table, l'heure, les joueurs, leur rang et leur score ; une étoile marque les parties gagnées. Le détail donne la version de la table, le nombre de billes, l'hôte, la durée de chacun et la raison d'un hors classement.

### Messagerie

- **Entre amis, sans serveur** : Menu système > Amis > « Messages », ou « Écrire » sur la fiche d'un ami. Les messages passent directement d'une borne à l'autre, chiffrés, et restent sur les deux bornes.
- **Un fil comme sur un téléphone** : les messages de l'ami à gauche, les vôtres à droite, et au milieu les évènements de l'amitié (un record, un badge). MagnaSave passe à l'ami précédent ou suivant ; le fronton montre la carte de l'ami pendant que son fil est ouvert.
- **Répondre aux boutons** : six réactions posées sur un message (Bravo, Revanche ?, TILT !, Waouh, OK, J'aime), six phrases toutes prêtes, ou « Écrire un message… » au clavier à l'écran ou au téléphone, dont le texte s'écrit en direct. Au bureau, le vrai clavier.
- **Un ami hors ligne** : le message attend, « En attente », et part tout seul dès que les deux bornes sont allumées en même temps, puis passe à « Reçu ».
- **Pendant une partie**, les boutons restent à VPX : le téléphone appairé montre le fil le plus récent, avec réactions, phrases et champ pour écrire. Un message arrivé s'annonce par une notification, au menu par le DMD aussi.
- **Options** : couper les notifications d'un ami, effacer une conversation, bloquer ; désactiver la messagerie, couper son son, garder les messages 30 jours, un an ou toujours.

### Profil public et « J'aime »

- **Un profil lisible par tous** : pseudo, pays, avatar, badges, nombre de records publiés et activité des 30 derniers jours. Présence, table en cours, parties, bibliothèque et messages restent entre amis.
- **Aimer un record ou un badge** d'un appui sur Start ; un « J'aime » reçu s'annonce par une notification. « Mon profil public » montre ce que voient les autres et qui a aimé quoi ; il se désactive d'un geste.
- **Sans serveur, lui aussi** : la carte d'un joueur est signée et passe de borne en borne, si bien qu'un profil se lit même quand son joueur est hors ligne.

<p align="center"><img src="images/fr/messages.webp?v=5ad77ce3bd" width="360" alt="La conversation avec Bruno sur la borne : la carte de son nouveau record sur Star Courier, ses messages, puis votre réponse, reçue et saluée d'un « Bravo » ; à côté, Écrire un message, Réponse rapide et Options de la conversation."></p>

### Bibliothèques partagées

- **« Voir sa bibliothèque »** sur la fiche d'un ami : les tables que vous avez tous les deux (avec les médias qui vous manquent) et celles que vous n'avez pas.
- **Récupérer toute une table**, ou choisir partie par partie (table, fronton, ROM, PuP-Pack, couleurs du DMD, sons, musique, point de vue, réglages propres, médias), sa version et la vôtre côte à côte. Chaque ligne dit « Cochée » ou « Non cochée ».
- **ROM et PuP-Pack décochés d'office** : ils ne se cochent qu'après l'attestation de vos droits (« J'atteste et je m'engage »).
- **Tout est vérifié à l'arrivée** (taille, empreinte SHA-256, contenu conforme à son type) puis passe par le plan d'ajout avant d'être installé. Un fichier refusé en route est sauté avec sa raison, le reste arrive.
- **Une réception ne part qu'une fois** et se suit partout : « Réception en cours », sa barre et son pourcentage, sur la fiche de la table et dans « Téléchargements ». Une fois reçue : « Installer dans ma bibliothèque ».
- **Depuis « Ajouter une table »** : « Depuis un ami… » liste vos amis, ceux qui ont des tables que vous n'avez pas en tête, et ouvre leur bibliothèque sur ces tables.
- **Une place suffisante est vérifiée** avant de commencer (la taille plus 1 Gio).
- **« Limiter le débit des téléchargements… »** : de 256 ko/s à 20 Mo/s, ou sans limite, pour laisser la connexion au reste de la maison.

<p align="center"><img src="images/fr/friends-library.webp?v=2ad79696e5" width="760" alt="La bibliothèque de Bruno : les tables présentes sur les deux bornes, et celle que cette borne n'a pas, Glass Lagoon, avec ses médias et « Récupérer toute la table »."></p>

### Confidentialité, réseau et pare-feu

- **Ce qui ne part jamais** : les programmes (`.exe`, `.dll`, `.bat`, `.ps1`…), les sauvegardes, les fichiers de records, les réglages de PinMAME, les statistiques, et aucun chemin de votre disque.
- **Ce que voient les autres** : tout le monde, votre nom ; vos amis, votre présence, votre table en cours, vos records, vos badges, vos parties et votre bibliothèque si vous la partagez.
- **« Partage et réseau »** réunit tout : le partage (activé par défaut), votre nom, le réseau local, la bibliothèque partagée, le débit, le pare-feu, ce que voient les autres, les joueurs bloqués. L'écran s'ouvre sur « Retour », pour qu'un Start par mégarde ne coupe rien.
- **Le pare-feu de Windows** : l'installeur pose les règles une seule fois, sans invite sur une borne sans souris. Elles sont revérifiées à chaque démarrage et après chaque mise à jour, et reposées d'elles-mêmes si l'une manque. Une règle que Windows bloque est dite en clair (« Réseau des bornes bloqué par le pare-feu de Windows »).
- **Chiffré de bout en bout**, sur le réseau Hyperswarm de [Holepunch](https://holepunch.to).

## Classements

<p align="center"><img src="images/fr/leaderboard.webp?v=ebcf7d0fee" width="360" alt="Le tableau des scores d'une table : le classement Mondial de l'année, chaque joueur avec le drapeau de son pays, son avatar et sa présence, et votre place sous le tableau."></p>

- **« Tableau des scores »** sur la fiche de chaque table : quatre périodes, « Tout temps », « Cette année », « Cette semaine », « Aujourd’hui », changées aux flippers. Chaque partie jouée sur la borne y laisse ses scores, datés : lus dans la mémoire de la ROM après la partie (un par joueur, avec les initiales quand le score entre au tableau de la machine), ceux qui entrent au tableau d’honneur d’une table originale, le score d’une partie entre amis. « Tout temps » réunit aussi les records que la table gardait déjà, sans ses scores d’usine (les valeurs rondes qu’une ROM ou un script met au tableau à la première mise en route). Une table dont les scores ne se lisent pas le dit.
- **Quatre portées** : « Cette borne », « Amis », « National » et « Mondial », changées aux MagnaSave. Sous chaque classement, votre place pour cette portée et cette période ; hors des premières lignes, votre ligne en fin de tableau.
- **Une comparaison juste** : on ne se compare que sur la même version exacte de la table et le même nombre de billes.
- **Sans serveur** : chaque score part signé par la clé du joueur et passe de borne en borne. Seuls les scores relevés par Cyber Pinball partent, jamais en mode invité ; un score douteux se masque sur la borne.
- **Chaque joueur reconnaissable** : le drapeau de son pays (les 256 pays et territoires d'aujourd'hui ont le leur), son avatar (joint à ses scores, même s'il n'est pas votre ami) et sa présence, en marque sur l'avatar comme dans une messagerie : point vert en ligne, point et anneau verts en partie, point creux hors ligne (une légende le rappelle sous le tableau ; à la souris, le statut en toutes lettres, « Vu il y a 2 h »).
- **Votre pays** vient de la région de Windows et se change dans « Partage et réseau », où l'on peut aussi ne plus publier ses scores.
- **Au téléphone aussi** : la vue Scores montre les mêmes classements, même pendant une partie (voir [Le téléphone comme télécommande](#le-téléphone-comme-télécommande)).

## Installer et mettre à jour

### Deux installeurs

- **Installeur léger** (environ 110 Mio) : Visual Pinball X 10.8.1 est téléchargé au premier lancement depuis sa page officielle et vérifié par SHA-256.
- **Installeur complet** (environ 280 Mio) : l'archive officielle de VPX incluse, pour une borne sans Internet.
- **Sans droits d'administrateur** : installation pour l'utilisateur courant, entrée dans « Programmes et fonctionnalités ».
- **Options** : raccourci sur le bureau, lancement au démarrage de Windows ; installation silencieuse en ligne de commande.
- **Conditions d'utilisation** présentées par l'installeur, puis par le menu tant qu'elles ne sont pas acceptées, et à relire dans Menu système > Cyber Pinball > Conditions d’utilisation.
- **La désinstallation ne retire que l'application** : tables, médias, configuration et données restent, et une réinstallation dans le même dossier les retrouve.

### Un seul dossier racine

- **Tout vit dans un dossier que vous choisissez** (par exemple `D:\CyberPinball`) : l'application, une version de VPX par dossier, les tables, les médias, la bibliothèque de ROM, la configuration, les données, les téléchargements, et un dossier `import\` pour une clé USB.
- **Une copie de VPX à part** et son propre `VPinballX.ini` : rien n'est enregistré dans Windows. Program Files, les dossiers de Windows et les partages réseau sont refusés.
- **Chaque composant téléchargé est vérifié** : une archive dont l'empreinte ne correspond pas est supprimée, jamais installée. Les archives gardées permettent de réinstaller sans réseau.
- **`VPinballX.ini` sauvegardé** avant chaque écriture (10 versions gardées). Seules les clés de Cyber Pinball sont modifiées ; une valeur changée à la main n'est jamais écrasée en silence : le menu demande s'il faut la garder.

### Mises à jour signées

- **Depuis la borne** : Menu système > « Cyber Pinball » > « Mise à jour de Cyber Pinball ». Rien ne s'installe d'office.
- **Une pastille rouge** sur la roue dentée quand une version sort ; la recherche se fait au démarrage puis toutes les 6 heures.
- **Les nouveautés de chaque version manquée**, dans la langue de la borne, puis « Mettre à jour maintenant » en un appui.
- **Signée** : la borne ne lit qu'un flux signé (Ed25519) par la clé de publication, et ne lance l'installeur que si sa taille et son SHA-256 correspondent.
- **Mises à jour légères** : quand seule l'application change, un paquet d'environ 1,5 Mio s'installe en quelques secondes, sans installeur.
- **Retour en arrière** : l'ancienne version est mise de côté pendant l'installation et remise si elle échoue. Au démarrage suivant, un bandeau dit quelle version est installée.
- **Préversions** à recevoir ou non (« Préversions : non reçues / reçues »).

<p align="center"><img src="images/fr/update.webp?v=678c1b367b" width="360" alt="Une mise à jour disponible : Cyber Pinball 0.2.0, sa date, ses nouveautés, la taille de l'installeur signé, et les boutons Mettre à jour maintenant et Plus tard."></p>

## Configurer la borne

Au premier démarrage, l'assistant enchaîne toutes les étapes. Ensuite, Menu système > « Borne » > « Configuration de la borne » refait chacune à part : elle ne change que ses propres réglages.

<p align="center"><img src="images/fr/wizard.webp?v=86d475eb65" width="900" alt="L'assistant, étape Écrans et rôles : chaque écran affiche son numéro, et le playfield demande « Playfield ? » avec les commandes des flippers et de Start."></p>

<p align="center">
  <img src="images/fr/features/cabinet-setup.webp?v=94f106b884" width="300" alt="Configuration de la borne : chaque étape se refait seule, des boutons du jeu au son de la borne, avec l'assistant complet et les touches par défaut des encodeurs.">
  <img src="images/fr/features/configurations.webp?v=f750e5ce15" width="300" alt="Configurations de la borne : la configuration active, reconnue avec ses 4 écrans sur 4, les écrans branchés, et Nouvelle configuration.">
</p>

### Un assistant qui se suit aux flippers

- **Étapes** : « Boutons du jeu », « Boutons de l'interface », « Lanceur analogique », « Tilt », « Écrans et rôles », « Orientation et taille du playfield », « Disposition des écrans », « Son de la borne », puis un récapitulatif.
- **Chaque question s'affiche sur tous les écrans**, pour que vous la voyiez d'où vous êtes.
- **« Quitter sans enregistrer ? »** à tout moment (Exit maintenu 2 s) : la question dit ce qui serait perdu, et rien n'est écrit si vous confirmez.
- **Le récapitulatif des boutons est un essai** : chaque bouton nouvellement relevé doit être pressé avant d'être validé.

### Boutons, joysticks et Pinscape

- **Deux jeux de boutons** : ceux du jeu (flippers, Start, Exit, crédit, lanceur, MagnaSave, Extra Ball, pause, tilt, tremblements, volume, muet) et ceux de l'interface (Précédent, Suivant, Valider, Retour). Un même bouton peut servir aux deux.
- **Clavier et joystick mélangés** : encodeurs clavier, encodeurs en mode manette, Pinscape KL25Z, VirtuaPin. Le relevé dit quel joystick il lit (« Joystick lu : … »).
- **Relevé sûr** : doublons, touche Windows et touches que VPX ne lit pas sont refusés.
- **Après chaque partie**, si VPX n'a pas vu le joystick relevé, le menu le dit et rouvre l'étape « Boutons ».
- **Touches par défaut des encodeurs** en recours, en un geste, même sans aucun bouton.
- **Bouton Pause** facultatif : un appui met la partie en pause, un autre la reprend.

<p align="center">
  <img src="images/fr/features/buttons.webp?v=1262855226" width="300" alt="Boutons du jeu : chaque bouton avec sa touche (flippers, Start, Exit, crédit, lanceur, MagnaSave, Extra Ball, pause, tilt, tremblements, volume, muet), et Enregistrer, Précédent, Touches par défaut, Tout relever.">
  <img src="images/fr/features/interface-buttons.webp?v=5808179f5a" width="300" alt="Boutons de l'interface : Précédent, Suivant, Valider, Retour et menu, Aide-mémoire et Réglages de VPX, avec les touches de secours du clavier toujours actives.">
</p>

### Lanceur analogique et tilt

- **Lanceur à potentiomètre ou à capteur** : « Tirez le lanceur à fond, puis lâchez-le » ; l'axe et son sens sont trouvés, avec une jauge en direct. Zone morte (0 à 30 %), vitesse et accéléromètre se règlent, et chaque tir d'essai affiche sa force.
- **Tilt** : balancier de la borne, balancier simulé par VPX d'après l'accéléromètre, slam tilt de la porte, ou pas de tilt.
- **Angle du contact** de 0,15° à 4°, **force des secousses** de ×0,50 à ×6 (×2 proposé pour un Pinscape). L'essai montre l'anneau vu de dessus et affiche « TILT » à chaque contact.
- **Réglages incohérents signalés** : deux balanciers, balancier sans bouton, balancier simulé sans capteur.

<p align="center"><img src="images/fr/features/tilt.webp?v=381dd60fd5" width="360" alt="L'étape Tilt : l'anneau du balancier vu de dessus, le balancier simulé par VPX et l'angle du contact, à essayer en secouant la borne."></p>

### Écrans reconnus par leur empreinte

- **Chaque écran est identifié par son empreinte EDID** (fabricant, modèle, numéro de série), jamais par son numéro Windows.
- **`VPinballX.ini` est réécrit à chaque démarrage** : changez un écran de prise, réveillez-les dans un autre ordre, laissez Windows tout renuméroter, le playfield reste le playfield.
- **Rôles** : playfield, fronton (backglass), DMD, topper. La diagonale du playfield est proposée d'après l'écran, et une valeur incohérente est refusée.
- **Les fenêtres de VPX** (fronton, DMD, topper) sont ramenées sur l'écran de leur rôle pendant la partie quand deux écrans portent le même nom.

### Plusieurs rôles sur un écran

- **Des zones** : fronton et DMD sur le même écran, DMD incrusté dans le playfield, ou tout sur un seul écran de bureau. Elles sont en proportions de l'écran et survivent à un changement de définition.
- **« Disposition des écrans »** : format conservé (libre, 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), position et taille au pixel, placement à côté d'un autre rôle, aimantation à 12 px, « Annuler les changements ». Aux boutons, au clavier ou à la souris, y compris en tirant une zone d'un écran à l'autre.
- **Emplacements tout faits** : bas du fronton en bande 4:1 ou 16:9, incrustation dans le playfield : une borne à deux écrans a toujours une place pour le DMD.
- **Chevauchements et oublis signalés**, avec ce qui passera devant.

<p align="center"><img src="images/fr/features/screen-layout.webp?v=0d67d11dcf" width="360" alt="Disposition des écrans, zone du playfield : écran, format conservé, plein écran, position, largeur, hauteur, taille et position précises, aimantation."></p>

### DMD, FullDMD et DMD matériels

- **« Écran du DMD »** : dites une fois s'il s'agit d'un FullDMD (écran 16:9, DMD du jeu incrusté) ou d'un DMD seul (bande 4:1). Le menu, VPX et les PuP-Packs le respectent ; un cas ambigu est signalé « À vérifier ».
- **Habillage FullDMD en partie** : l'image FullDMD de la table reste affichée et le DMD du jeu se pose dans son cadre, détecté tout seul dans l'image ou la vidéo.
- **DMD matériels reconnus** sans ouvrir de port (ZeDMD, PIN2DMD, Pixelcade) : le plugin qui les alimente est activé pour vous.

<p align="center"><img src="images/fr/features/dmd-screen.webp?v=3936da5aad" width="360" alt="Écran du DMD : « C'est un FullDMD » ou « C'est un DMD seul », chacun avec son schéma."></p>

### Orientation et cadrage

- **Le joueur dit où il se tient** : les flippers tournent l'affichage jusqu'à ce que le texte soit à l'endroit. Menu, fiche et réglages pivotent pour lui ; fronton, DMD et topper restent droits.
- **Cadrage automatique de VPX** imposé en vue borne et rétabli tout seul ; un avertissement dit si VPX dessinerait les flippers du mauvais côté.
- **Le bureau Windows rendu dans son sens** : l'écran du playfield n'est tourné que le temps de la session, et chaque sortie, même après un plantage, rend l'orientation d'avant.
- **Tables dans votre sens**, gardées d'un démarrage à l'autre ; « Santé de la borne » répare celles qu'on aurait retournées dans le menu de VPX.

<p align="center"><img src="images/fr/features/playfield.webp?v=f3a35917f1" width="360" alt="Où sont les flippers ? L'écran du playfield, reconnu à son empreinte, avec la bande « Flippers · vous êtes ici » au bord du joueur."></p>

### Son

- **L'étape « Son »** joue n bips sur la sortie n : flipper gauche pour le fronton, flipper droit pour le plateau, Start pour les deux. Sorties virtuelles et Bluetooth écartées.
- **Test des haut-parleurs d'une carte 5.1 ou 7.1**, paire par paire, pour choisir stéréo, surround ou SSF ; un câblage inversé est signalé.
- **Sorties retrouvées par identifiant**, jamais par leur nom ; Cyber Pinball ne change jamais la sortie par défaut de Windows.
- **Tout le son du menu passe par les haut-parleurs de la borne** : musiques, vidéos, aperçus, pages web.
- **Boutons de volume** : le volume de toute la borne, au menu comme en partie, 5 % par appui ; Volume − maintenu une seconde coupe ou rétablit le son ; une pastille montre le niveau en haut du plateau.

<p align="center"><img src="images/fr/features/sound.webp?v=dc66c38900" width="360" alt="L'étape Son : la sortie 1 sur 2 joue un bip ; flipper gauche pour le fronton, flipper droit pour le plateau, Start pour les deux."></p>

### LED et retours (DOF)

- **Les contrôleurs reconnus sans rien leur envoyer** (Pinscape, LedWiz, Teensy, DudesCab, PacLed…), le plugin DOF de VPX allumé, et ce qui empêche une LED de s'allumer dit clairement (configuration absente, contrôleur sans son fichier, Teensy non déclaré).
- **La configuration du configtool** se récupère dans « Récupérer » et s'importe d'elle-même ; l'ancienne est sauvegardée.
- **LED adressables (WS2812)** : décrivez vos bandes (Teensy, Wemos D1, ou Art-Net vers WLED sur un ESP32) et Cyber Pinball écrit le `Cabinet.xml` de DOF, sans jamais remplacer un fichier écrit à la main.
- **Le médecin d'une table** signale une ROM sans effets DOF ; les réglages de VPX choisissent, pour le knocker ou le vibreur, le son de la table, la borne ou les deux.

### Plusieurs configurations

- **Une installation, plusieurs postes** : une borne et un PC de bureau, par exemple. Chaque configuration a ses écrans, rôles, zones, son, boutons et son propre `VPinballX.ini` ; tables, ROM, médias et statistiques restent communs.
- **Reconnue toute seule** au démarrage et avant chaque partie, d'après les écrans branchés ; le choix est expliqué, et un doute ouvre « Quelle configuration est branchée ? ».
- **« Configurations de la borne »** : utiliser, forcer, renommer, supprimer (corbeille restaurable), créer.

## Le menu des tables

### La roue et les écrans

- **Une roue de médaillons** sur la vidéo du plateau de la table choisie, une fenêtre par écran : topper, fronton et DMD suivent le jeu.
- **Une roue qui s'anime** : la table choisie s'éclaire d'un halo vert venu de derrière son médaillon, sur une lueur à sa teinte ; à l'arrêt, une étincelle blanche fait le tour du médaillon en traçant un anneau vert sur son bord chromé, puis continue de tourner lentement, et un éclat le traverse. Chaque appui envoie une onde de lumière le long de l'arc, et le nouveau titre s'écarte en arrivant.
- **Des écrans de menu qui s'ouvrent en une seconde** : un filet lumineux se dessine sous le titre, et les lignes entrent une à une.
- **Changements en direct** : un média ou une table ajouté, remplacé, renommé ou retiré se voit aussitôt sur tous les écrans, sans redémarrer.
- **Médias des tables voisines préchargés** et fondu de 280 ms au changement de table.
- **« Médias pendant la partie »** : figés (par défaut), animés ou éteints, sur les écrans que VPX n'occupe pas.
- **Hors du menu des tables** (menu système, réglages, aide), les écrans passent à l'affichage de la marque, en silence ; la fiche d'une table garde ses médias.

<p align="center"><img src="images/fr/launch.webp?v=d9a0c78278" width="900" alt="Animation du lancement sur une borne à quatre écrans : après Start, le logo de Neon Abyss s'allume sur le plateau, traverse le DMD et se pose sur le fronton, puis les écrans s'effacent quand Visual Pinball X prend la main."></p>

### DMD vivant et couleurs de la marque

- **Le DMD du menu dessiné par Cyber Pinball**, sur une grille de 128 × 32 points : le titre, PRESS START, les records (« HIGH SCORE #1 » à #4), l'horloge, les crédits, sans jamais s'effacer : le média DMD de la table se voit autour des points sur un FullDMD, ou seul en DMD « classique ».
- **Le DMD prend vie** : à l'arrivée sur une table, un détail de sa wheel en points (souvent son logotype) s'allume, glisse et laisse place au titre ; les pages alternent trois effets (des fils de lumière qui courent sur chaque rangée, un volet lumineux, un scintillement en diagonale), et d'une table à l'autre la nouvelle glisse dans le sens de la roue ; un cycle sur deux, une courte scène de jeu : bumpers, lanceur, flippers, « BANK COMPLETE », « BALL LOCKED », multibille.
- **Records lus dans la table**, jamais inventés.
- **« DMD sur la roue », table par table** (fiche de la table > « Gérer la table… ») : les points affichés ou masqués (l'écran du FullDMD montre alors son média seul), et leur place sur l'écran du DMD, réglée aux boutons en voyant l'écran du DMD en direct. À part du DMD en partie, qui garde son propre réglage.
- **« Couleur du DMD »** : vert signal par défaut, préréglages (sarcelle, encre claire, bleu glacier, ambre doux, orange plasma) ou couleur libre.
- **Chaque table a sa couleur** au menu : la lumière de la roue, le halo des cadres et le fond des écrans sans média prennent la teinte de son fronton, en fondu ; la table choisie reste en vert. Le DMD peut la prendre aussi (« Couleur de la table »). Réglage : « Couleur de chaque table au menu ».
- **Une police à points** dessinée pour Cyber Pinball.

<p align="center"><img src="images/fr/live-dmd.webp?v=7a6e43e169" width="760" alt="Le DMD vivant du menu : le titre du jeu, PRESS START, le premier record et l'horloge, à tour de rôle."></p>

### Ouverture, lancement en cinéma et sons

- **Ouverture au démarrage** : des fils de lumière se tissent depuis le bas du plateau, une étincelle monte et s'embrase au centre, « CYBER PINBALL » s'écarte en se précisant, et le fronton et le DMD s'allument avec l'ignition, sur un souffle léger qui s'ouvre en accord. Puis « Appuyez sur un bouton pour choisir une table » ; les fils continuent de tourner lentement dans une poussière qui dérive, sans jamais figer l'écran. Tracée par la carte graphique, elle reste fluide en 4K ; sur un PC de bureau, elle se joue couchée en largeur. Mettez votre image ou votre vidéo sur chaque écran et votre musique de fond, ou coupez-la ; « Voir l'ouverture » et « Redémarrer Cyber Pinball » la rejouent.
- **Lancement en cinéma** : au Start, le logo du jeu recule comme une bille au lanceur, s'envole vers le fronton suivi d'un faisceau de fils de lumière qui s'y referme, avec un éclat quand il se pose ; un disque lumineux traverse le DMD, et un coup de bobine sonne quand VPX prend la main. VPX n'attend jamais l'animation.
- **Sons de la machine**, tous de synthèse : clic de solénoïde au changement de table, pièce au Start, knocker quand un record tombe, carillon d'une invitation, signal d'un ami.
- **La musique de chaque jeu** sur la roue (60 % par défaut) ; une table sans musique fait entendre sa vidéo du plateau (40 %). La musique ne démarre que si la table reste choisie 350 ms : faire défiler ne joue rien.
- **« Volume de ce jeu »** de 0 à 200 % pour une table trop forte ou trop faible.

<p align="center">
  <img src="images/fr/features/startup-show.webp?v=1dfc4766bb" width="300" alt="Ouverture au démarrage : jouée ou coupée, Voir l'ouverture, l'animation de chaque écran à remplacer par votre image ou votre vidéo, et la musique de fond.">
  <img src="images/fr/features/dmd-colour.webp?v=f2dca8a139" width="300" alt="Couleur du DMD : vert signal, sarcelle, encre claire, bleu glacier, ambre doux, orange plasma, ou une couleur libre.">
</p>

### Collections et favoris

- **Collections** sur la roue : Toutes, Favoris, Récentes, Jamais jouées, Avec mes amis en ligne, chaque fabricant, chaque décennie. **MagnaSave gauche ou droit** passe à la précédente ou à la suivante, aussitôt ; la liste des collections paraît quelques secondes, une collection vide grisée avec sa raison.
- **Un repère fixe** sur le cartouche du titre (« ☆ FAVORIS │ 3 / 12 ») : la collection et la place de la table, qui ne bougent jamais quand on change de table. Chaque collection garde sa table.
- **Favoris** : « Ajouter aux favoris » sur la fiche, une étoile blanche devant le titre ; le favori d'une autre installation est repris tel quel.
- **Mes collections** : des collections personnelles à votre nom (« Soirées », « Pour les enfants »…), remplies depuis la fiche de chaque table, renommées ou supprimées à volonté.
- **Boutons des collections** au choix : n'importe quel bouton libre de la borne ; **Menu système > Collections** aussi, sans aucun bouton.
- **Mode invité limité à une collection** (les favoris, un fabricant…), et **mode attente** dans la collection affichée.

<p align="center">
  <img src="images/fr/features/collections.webp?v=f452c194cb" width="300" alt="La roue sur la collection Récentes, la liste des collections ouverte : Toutes les tables, Favoris, Récentes, Jamais jouées et Avec mes amis en ligne, les collections vides grisées avec leur raison, puis les fabricants.">
  <img src="images/fr/features/favorites.webp?v=13dc8bf325" width="300" alt="La fiche d'une table ajoutée aux favoris : l'étoile blanche après son titre, « Retirer des favoris ».">
</p>

### Roue, ordre des tables et mode attente

- **Menu système > Tables > Roue** réunit tous les réglages de la roue : présentation, ordre, table au démarrage, Start sur la roue, logos animés, couleur de chaque table, Juke-box.
- **« Logos animés »** : seul le logo de la table choisie s'anime (par défaut), ses voisins restent sur leur première image ; ou tous s'animent.
- **« Ordre des tables »** : par titre, dernières jouées, plus jouées, année, fabricant, ou mélangé à chaque démarrage.
- **« Table au démarrage »** : la première, une table au hasard, ou la dernière jouée.
- **« Start sur la roue »** : ouvrir la fiche (par défaut), ou jouer directement ; la fiche reste à Start maintenu (ou F6).
- **Mode attente** après 5 minutes (de 1 à 30 minutes, ou jamais) : une table au hasard toutes les 20 s, avec ses médias, et le premier bouton ramène au menu tel qu'il était.

<p align="center">
  <img src="images/fr/features/wheel-settings.webp?v=1b731682e3" width="300" alt="Roue : présentation du menu, ordre des tables, table au démarrage, Start sur la roue, logos animés, couleur de chaque table, Juke-box dans la roue.">
  <img src="images/fr/features/menu-settings.webp?v=f909af7172" width="300" alt="Médias, son et attente : visualiseur du Juke-box, musique des jeux et son volume, son des vidéos, lancement en cinéma, ouverture, sons de l'interface…">
</p>

### Au bureau

- **Sur un PC de bureau** : le plateau dans un cadre 9:16, la roue et les informations à côté, le fronton sur un second écran s'il y en a un.
- **Quatre roues** au choix : « Médaillons », « Bandeau », « Minimaliste », « Arche ».
- **Mise en page adaptée** du 16:9 et plus jusqu'au 5:4, vérifiée de 1366 × 768 à la 4K.

<p align="center"><img src="images/fr/desktop.webp?v=29ca7206fd" width="900" alt="Le menu des tables sur un PC de bureau : le plateau de Neon Abyss dans un cadre 9:16 à gauche, le fronton, la roue de médaillons et le panneau du titre à droite."></p>

### Jamais d'écran clair, jamais le bureau

- **Un voile noir par écran**, du démarrage à la fin d'une partie : aucun écran ne montre le bureau Windows.
- **Pas de flash blanc** : une fenêtre reste transparente jusqu'à sa première image.
- **Barres des tâches masquées** pendant la partie, puis rendues ; remises derrière le menu au retour. Sur une borne lancée au démarrage de Windows, masquées toute la session, rendues au bureau Windows et quand on quitte.
- **« Bureau Windows »** (Ctrl+Maj+D) libère tous les écrans du PC, et Cyber Pinball se tait tant que vous y êtes ; le même raccourci ramène le menu.

## Juke-box

<p align="center"><img src="images/fr/jukebox.webp?v=26444dfe04" width="900" alt="Le Juke-box sur une borne à quatre écrans : sur le playfield, la playlist Néon nocturne, ses modes de lecture et le morceau en cours ; sur le fronton, l'illustration du morceau ; sur le DMD, le nom de l'artiste et un spectre en points lumineux."></p>

### Le lecteur

- **Un médaillon en tête de la roue des tables** joue vos playlists. Start : le disque quitte le playfield et prend la scène sur les trois écrans (un bouton l'interrompt). Le fronton passe le clip, le playfield la liste des morceaux, le DMD un spectre en points ; le médaillon se masque dans Menu système > Médias.
- **Toutes vos playlists à l'entrée**, en grandes lignes : pochette, nombre de morceaux, durée, sources, celle qui joue marquée. Start en ouvre une ; Exit remonte aux playlists sans couper la musique, puis revient à la roue.
- **Les boutons de la roue** : flippers pour choisir un morceau (tenus, ils avancent ou reculent dans le morceau par pas de 5, 10 puis 30 s), Start pour jouer ou mettre en pause, MagnaSave pour la playlist voisine, Exit pour revenir.
- **Modes de lecture** retenus par chaque playlist : « Tout lire », « Lecture aléatoire » (chaque morceau une fois avant d'en rejouer un), « Répétition : playlist / morceau / aucune ». Start maintenu sur une playlist la lance en aléatoire.
- **DMD en couleurs** : le visualiseur prend les couleurs de la pochette, ou Multicolore, ou la couleur du DMD (« Visualiseur du Juke-box »).
- **Au bureau** : la molette fait défiler, un clic choisit, un double clic joue, un clic dans la barre de progression va à cet endroit.

### Gestion des playlists

- **« Gestion du Juke-box »**, en tête de la liste ou par Start maintenu sur un morceau (aussi Menu système > Juke-box) : créer, renommer, réordonner, supprimer ; la place prise et l'espace libre sont affichés.
- **Importer de YouTube** : une playlist ou une vidéo, par son lien collé depuis le téléphone, au clavier, ou depuis « Récupérer » (« Ajouter au Juke-box »). Au clavier à l'écran, le début du lien est déjà écrit : on ne tape que l'identifiant. Vous voyez le nombre de morceaux, la durée, la taille estimée et les vidéos sautées avec leur raison, puis choisissez les morceaux (chacun avec sa miniature, à pré-écouter avant de le cocher), la playlist, et la qualité (1080p, 720p, son seul).
- **Votre compte YouTube** : vos propres playlists, privées comprises, et « J’aime » et « À regarder plus tard ». La connexion se fait dans Microsoft Edge, sur l'écran des navigateurs, piloté au besoin par le téléphone ; Cyber Pinball ne voit ni ne garde aucun mot de passe, et rien n'est à créer chez Google.
- **Vos propres fichiers** : un fichier, ou un dossier entier, sous-dossiers compris, avec la pochette du dossier.
- **En ligne ou sur la borne** : chaque morceau se lit en ligne, téléchargé, ou depuis votre disque ; « Tout télécharger » et « Libérer la place » font passer une playlist d'un mode à l'autre. Sans réseau ou sans place, ces fonctions restent visibles, grisées avec leur raison.
- **Chaque morceau** se déplace ou se copie vers une autre playlist, sans fichier copié, et son titre, son artiste et son album se corrigent (votre correction l'emporte sur YouTube).

## Tout se fait aux boutons

- **Flippers, Start et Exit** suffisent partout : choisir, valider, revenir. La roue dentée ⚙ et Tab ouvrent le menu système à la souris ou au clavier.
- **Menu système en cinq rubriques** : Amis, Tables, Médias, Borne et Cyber Pinball, avec en raccourci Activité récente, Collections, Juke-box, Téléchargements et Télécommande du téléphone. Une pastille rouge remonte jusqu'à la roue dentée quand une entrée vous attend, et le menu s'ouvre sur elle.
- **Le message d'un geste reste** (« Nom changé », « Avatar enregistré »…) jusqu'au geste suivant, au lieu de s'effacer aussitôt.
- **Les flippers suivent l'ordre de l'écran**, de haut en bas, sur tous les écrans de gestion ; le tour ne se fait qu'aux deux bouts.
- **Toujours une sortie** : Exit ferme « Récupérer » même quand Windows a pris le premier plan, et tenu deux secondes il le ferme de force. Avant chaque demande d'autorisation de Windows, un écran prévient qu'il faudra répondre au clavier ou à la souris.
- **Longues listes** : Exit ramène aux actions de l'écran, MagnaSave passe de la liste aux actions en retrouvant sa place, un flipper tenu fait défiler de lettre en lettre.
- **Textes longs** (nouveautés, messages) lus page par page aux flippers, avec la part déjà lue.
- **Un retour qui dit où il mène** au-dessus du titre de chaque écran, cliquable : « ‹ Neon Abyss », « ‹ Téléchargements », « ‹ Menu des tables » ; dans une liste, « Exit : actions ».
- **Une fonction indisponible reste visible**, grisée, avec sa raison.
- **Raccourcis clavier** affichés à côté des entrées : R pour les réglages de VPX, H pour les commandes, Ctrl+Maj+D pour le bureau, Ctrl+Maj+K pour arrêter une partie bloquée.
- **Une icône par menu**, dessinée pour Cyber Pinball.
- **Sélecteur de fichiers intégré**, à la place de celui de Windows : téléchargements, dossier d'import, Bureau, clés USB et disques, aux boutons, à la souris ou au clavier.

<p align="center"><img src="images/fr/system-menu.webp?v=5646ca729d" width="360" alt="Le menu système : Activité récente, Collections, Amis, Tables, Médias, Juke-box, Téléchargements, Télécommande du téléphone, Borne et Cyber Pinball, chacune avec un résumé de son contenu."></p>

<p align="center"><img src="images/fr/features/controls.webp?v=b76db12917" width="360" alt="L'aide-mémoire des commandes : dans le menu (choisir une table, fiche, réglages de VPX, bureau Windows, partie bloquée) et pendant une partie (flippers, lanceur, crédit, MagnaSave, pause, tilt, volume)."></p>

## Le téléphone comme télécommande

<p align="center"><img src="images/fr/phone.webp?v=df6b8e9ceb" width="760" alt="La page du téléphone, servie par la borne : la vue Menus qui ouvre directement n'importe quel menu, le lecteur du Juke-box, et le classement Mondial d'une table dans la rubrique Communauté."></p>

- **Rien à installer** : Menu système > Télécommande du téléphone montre un QR code en grand (le clavier à l'écran et le bandeau du navigateur intégré en montrent un petit). Scannez-le avec votre téléphone, sur le même Wi-Fi que la borne : la page vient de la borne.
- **Vous acceptez le téléphone à la borne** : le même code de quatre chiffres des deux côtés, Start (ou Entrée, « Accepter » étant choisi d’office) pour accepter, Exit pour refuser. Un seul téléphone à la fois ; le QR change toutes les trois minutes et ne sert qu'une fois.
- **Accepté une fois, le téléphone est gardé** : il revient ensuite sans QR ni acceptation, d'un raccourci sur son écran d'accueil (Android comme iPhone, avec l'icône de Cyber Pinball, toujours sans rien installer) ; il se reconnecte seul quand Cyber Pinball redémarre ou se met à jour, et retrouve la borne par son nom sur le réseau local quand le routeur lui a donné une autre adresse. Borne éteinte ou autre Wi-Fi : la page réessaie seule et reprend dès que la borne répond. Les téléphones gardés sont listés dans Menu système > Télécommande du téléphone, où « Oublier ce téléphone » retire l'un d'eux.
- **Cinq onglets fins en bas** : Écran, Menus, Juke-box, Communauté et Boutons ; en haut, une seule barre fine, avec « Clavier » quand la borne attend une saisie et le menu ⋮ (envoyer un fichier, plein écran sur Android, se déconnecter).
- **Chaque menu en un toucher** : la vue Écran montre les entrées de l’écran ouvert à la borne, qu’on touche directement ; la vue Menus range tous les menus comme le menu système et ouvre directement celui qu’on touche ; la vue Boutons tient **les boutons de la borne** (Start, flippers, Exit, MagnaSave ; un flipper tenu fait défiler vite). Pendant une partie, seuls les réglages en partie s'ouvrent du téléphone. Un menu indisponible est grisé avec sa raison.
- **Les tables en images** : le menu des tables montre le médaillon de chaque table, ou en grille l’image de son fronton (toucher pour choisir, encore pour Start) ; une table ajoutée a les siens tout de suite. Un bouton en tête change de collection, comme MagnaSave à la borne.
- **Le Juke-box dans la main** : les playlists avec leurs pochettes, les morceaux, lecture et pause, précédent et suivant, aléatoire et répétition, avancer dans un morceau. Un mini-lecteur suit le morceau en cours au-dessus des onglets ; « Gérer » range clairement les ajouts, le compte YouTube et les playlists.
- **La Communauté dans la main** : messages, amis et scores. Les conversations s’ouvrent en fil, comme sur un téléphone : les messages de l’ami à gauche, les vôtres à droite, réactions et phrases rapides d’un appui, et un champ pour écrire, même pendant une partie. Une pastille rouge signale un message non lu, depuis n’importe quel onglet.
- **Les classements dans la main** : la vue Scores montre le tableau des scores de chaque table, exactement comme à la borne : cette borne, amis, national et mondial, les quatre périodes, drapeaux, avatars et présence. La table choisie ou lancée à la borne s’ouvre d’abord, une autre se choisit dans la liste, aussi pendant une partie.
- **Taper à la place du clavier à l'écran** (recherche, nom d'un joueur, lien d'une playlist) et **envoyer un fichier dans le dossier d'import** (jusqu'à 2 Go, la progression sur les deux écrans), qu'« Ajouter une table » propose ensuite.
- **Le navigateur intégré à la main** : un pavé tactile pour le pointeur, qui glisse sans à-coups sur toute la fenêtre, bandeau compris (moteurs Web, Images, YouTube, Vidéo) : toucher, un clic ; deux doigts, défiler ; appui long, clic droit. **Le clavier du téléphone** dès qu'un champ a le clavier : un champ rempli arrive avec son texte, à corriger sur le téléphone (jamais un mot de passe, qui reste masqué), « Champ suivant », Entrée. Retour, Avancer, Plus (dont la recherche et ses moteurs), Fermer. Le même pavé pilote Microsoft Edge pour la connexion à YouTube.
- **Le rapport de la borne** (voir [Fiche technique et rapport](#fiche-technique-et-rapport)) se télécharge sur le téléphone, part dans un e-mail préparé, ou son résumé se copie.
- **Le mode invité s'applique au téléphone**, qui ne le déverrouille jamais : les menus restent verrouillés.
- **Chiffré, et sur le réseau local seulement** : personne sur le Wi-Fi ne lit ce que vous tapez. Cyber Pinball n'enregistre rien de ce que vous tapez : c'est vous qui vous connectez.

<p align="center"><img src="images/fr/features/telecommande.webp?v=6bba909c78" width="900" alt="Le navigateur intégré piloté par un téléphone : le bandeau dit « Téléphone connecté », le pointeur vert est sur le champ de l'identifiant ; à côté, la page du téléphone avec son pavé tactile et son clavier"></p>

## Ajouter des tables

<p align="center"><img src="images/fr/features/add-table.webp?v=24f026656a" width="360" alt="Ajouter une table : le dossier d'import, Trouver une table en ligne, Reprendre un fichier téléchargé, Choisir des fichiers ou un dossier, Récupérés et attendus, Mises à jour des tables, Comptes des sites, Chercher sur le web."></p>

### Toutes les façons d'ajouter une table

- **« Ajouter une table »** (Menu système > « Tables ») réunit tout : « Prêt à installer », le dossier d'import (clé USB), « Trouver une table en ligne », « Reprendre un fichier téléchargé », « Choisir des fichiers… », glisser-déposer, « Récupérés et attendus », « Mises à jour des tables », « Comptes des sites », et « Depuis un ami… » (la bibliothèque d'un ami, ses tables que vous n'avez pas en tête).
- **Chaque table nommée d'après la base VPS** (Virtual Pinball Spreadsheet, environ 2 600 jeux) : dossier « Titre (Fabricant Année) », fiche remplie (fabricant, année, auteurs, identifiant IPDB). Un doute ouvre « Quel jeu est-ce ? » avec cinq propositions.
- **« Mises à jour des tables »** : les tables dont une version plus récente existe.
- **« Depuis une autre installation… »** : les tables d'un autre menu de borne, listées une à une ; on coche celles qu'on veut, et chacune arrive avec ce que cette installation rangeait ailleurs (PuP-Pack, ROM, couleurs et sons du DMD, dossier DMD, fronton, médias). Rien n'est repris en bloc, l'installation d'origine ne change pas.
- **Une partie du jeu se choisit aussi en dossier** (« Parties du jeu » > « Chercher un fichier ou un dossier… ») : un PuP-Pack, des sons ou des couleurs, même pris dans un dossier qui en contient beaucoup.

### Le catalogue en ligne

- **Chaque jeu de la base VPS jouable en VPX**, avec ses versions et ce qu'il faut pour le jouer sur cette borne, calculé d'après vos écrans et les ROM déjà là.
- **« Filtres et tri »** : sorte de jeu (sans ROM, électronique, électromécanique, création originale), fichiers disponibles (fronton, ROM, PuP-Pack, sons, couleurs du DMD, topper, VR…), site, déjà installés ou non ; recherche par titre, initiales ou nom de ROM. Les plus populaires d'abord par défaut (le nombre d'auteurs qui ont travaillé sur le jeu), ou les nouveautés, ou le titre ; filtres et tri gardés d'une visite à l'autre.
- **Un catalogue fluide** : douze jeux par page, les vignettes arrivent en arrière-plan pendant que les touches répondent.
- **Une version conseillée**, avec ses raisons écrites (pas un MOD si possible, la plus récente, un lien vivant…).
- **« Installation rapide »** : la table, la ROM puis le fronton conseillés se récupèrent l'un après l'autre, chaque page s'ouvrant d'elle-même.
- **Galeries, jamais des listes de noms** : aperçu au bon format, popularité lue sur le site (« 1 324 téléchargements · 5/5 »), auteur, date, tri par popularité.

### Le navigateur intégré « Récupérer »

- **La page du site s'ouvre sous un bandeau** qui rappelle quoi télécharger (jeu, version, auteurs, ROM). Vous vous connectez et téléchargez vous-même : Cyber Pinball ne clique rien, ne remplit rien et ne voit aucun mot de passe.
- **Chaque fichier téléchargé est rattaché** à ce qu'on attendait, avec sa progression (pourcentage, volume, débit, temps restant) et « Annuler ».
- **La page reprise** là où vous l'aviez laissée ; Exit de la borne la ferme.
- **« Écran du navigateur intégré »** : automatique, ou un rôle de la borne.
- **« Bloquer les publicités »**, activé par défaut, YouTube compris ; les forums des tables ne sont jamais filtrés.
- **« Chercher sur le web… »** sur chaque écran d'ajout ou de choix, la recherche déjà remplie.

### Comptes des sites

- **« Comptes des sites »** : VPUniverse, VPForums, Pinball Nirvana, PinSound, chacun « Connecté » (avec sa date d'expiration) ou non ; « Se déconnecter » n'efface que les cookies de ce site.
- **Rien n'est contourné** : vous vous connectez et téléchargez vous-même, dans la page du site. Cyber Pinball n'accepte aucune condition, ne saute aucun délai et ne résout aucune vérification.

### Chaque fichier à sa place

- **Un fichier reçu est reconnu à son contenu** (table, fronton, ROM, PuP-Pack, sons, couleurs du DMD, musique, point de vue, topper, médias), archives zip, 7z et rar comprises, et rangé dans cette partie du jeu, même si l'on attendait autre chose.
- **Une archive complète** remplit en une fois toutes ses parties.
- **Un fichier à corriger ne bloque jamais le reste** : il est « gardé de côté », et « Fichier reçu à vérifier » demande où le ranger.
- **Liste d'attente corrigeable** : réaffecter, vider, remplacer, ne plus attendre. Rien n'est jamais effacé : la corbeille est celle de Cyber Pinball.
- **Le dossier Téléchargements de Windows** peut être surveillé, pour un fichier pris dans votre propre navigateur.

### Gestionnaire de téléchargements

- **Un seul endroit** pour tout ce qui arrive, d'un site ou d'un ami, et une pastille au menu des tables (« 2 en cours · 45 % »).
- **Reprise sans perte** si la connexion tombe, même le lendemain, avec de nouveaux essais espacés ; un téléchargement mis en pause ne repart jamais seul.
- **Jamais deux fois** : un téléchargement déjà demandé n'est pas relancé.
- **Vérifié après une reprise** (SHA-256 ou MD5) : jamais un fichier faux n'est rendu.
- **Retour à l'écran d'où vous l'aviez demandé**, d'un geste, même après un redémarrage.

### Ce qu'il manque pour jouer

- **Un parcours guidé** : « Borne et VPX », « Table », « ROM », « Jouer », avec « Étape n sur N » et le geste suivant en un appui sur Start.
- **Seuls la table et sa ROM sont obligatoires** ; fronton, PuP-Pack, médias, contenu du DMD, couleurs et sons sont proposés, jamais exigés.
- **ROM absente** : « Récupérer la ROM … » ouvre sa page, ou « Jouer avec … », une révision voisine déjà sur la borne.
- **Mémorisé** : une étape réglée reste cochée ; « Reprendre : Étape 3 sur 4 » en tête de la fiche.

<p align="center"><img src="images/fr/missing-to-play.webp?v=f9fd568af5" width="760" alt="Ce qu'il manque pour jouer, pour Neon Abyss : l'étape 3 sur 4, la ROM à récupérer sur vpforums.org ou une révision voisine ; puis, la ROM installée, Tout est prêt pour jouer."></p>

## La fiche d'une table

- **Start sur une table** ouvre sa fiche (ou lance la partie, si « Start sur la roue » le dit) : statistiques de jeu, résumé des fichiers, et trois choix en tête, « Jouer », « Jouer avec un ami », « Prospectus et règles ». Le reste attend sous « Gérer la table… » : « Médias du jeu », « Parties du jeu », « Fichiers de la table », « PuP-Pack », « Réglages de cette table », « Régler l'affichage en partie », « Jouer et enregistrer », « Diagnostiquer et réparer », « Modifier les informations », « Supprimer la table » ; ce qui demande un œil s'annonce dès la fiche.
- **« Tableau des scores »** : les scores de la table sur cette borne, chez vos amis, dans votre pays et dans le monde (voir [Classements](#classements)).
- **« Ajouter aux favoris »** et **« Ajouter à une collection… »** : la table dans vos favoris ou vos collections (voir [Collections et favoris](#collections-et-favoris)).
- **« Toutes les tables »** (Menu système > « Tables ») : la liste complète, avec fabricant, année, version et nombre de parties ; Start ouvre la même fiche.
- **« Parties du jeu »** : une ligne par partie (table, fronton, ROM, PuP-Pack, couleurs du DMD, sons, musique, point de vue, topper, médias), « Présent », « Reçu, à installer », « Attendu » ou absent ; chacune s'ajoute, se remplace, se réaffecte ou se retire, et une partie absente lance la recherche sur tous les sites.
- **« Fichiers de la table »** : tout le dossier groupé par sorte, avec ce que VPX en fera (« chargé par VPX avec cette table », « mal nommé : VPX ne le chargera pas »).
- **« Prospectus et règles »** : un seul livret, page par page, tourné pour le joueur. Les règles se trouvent seules : la carte et le texte rangés dans la table, une feuille de règles publique (The Pinball Primer, Pinball Rule Sheets), une vidéo d'explication à regarder sur le téléphone ; les commandes de la partie viennent toujours en dernier. Pour une dizaine de tables, un guide du jeu ouvre le livret : le but, puis un objectif par page, avec les coups numérotés sur le plateau et les tirs depuis les flippers.
- **« Diagnostiquer et réparer »** : le médecin de la table (voir [Une borne qui s'entretient](#une-borne-qui-sentretient)).

<p align="center"><img src="images/fr/game-page.webp?v=5bd3333057" width="360" alt="La fiche du jeu Neon Abyss : ses statistiques de jeu et ses fichiers, puis Jouer, Jouer avec un ami, Tableau des scores, Prospectus et règles, Ajouter aux favoris, Ajouter à une collection et Gérer la table."></p>

<p align="center">
  <img src="images/fr/features/all-tables.webp?v=4edcfce892" width="300" alt="Toutes les tables : les sept tables avec leur fabricant, leur année et leur nombre de parties.">
  <img src="images/fr/features/game-parts.webp?v=959b4e8089" width="300" alt="Parties du jeu de Neon Abyss : table, fronton, ROM, PuP-Pack, couleurs du DMD, sons remasterisés, musique, point de vue, réglages propres et médias, chacune présente ou absente.">
</p>

<p align="center">
  <img src="images/fr/features/doctor.webp?v=9a9c8dadf8" width="300" alt="Le diagnostic de Neon Abyss : pas de fronton, et des médias aux proportions différentes de leurs écrans, chaque constat expliqué en clair.">
  <img src="images/fr/features/flyer.webp?v=e669583cc5" width="300" alt="Le prospectus de Neon Abyss, page entière, tourné pour le joueur.">
</p>

## ROM, PuP-Packs, fronton et DMD

### Bibliothèque de ROM

- **Chaque ROM stockée une seule fois**, liée par lien physique dans chaque table qui la joue, sans place en plus.
- **Reconnue à son contenu**, en zip, 7z, rar ou dossier de puces, et renommée s'il le faut.
- **Révisions voisines et anciens noms** : une table peut jouer une révision proche (avec un avertissement), et 119 anciens noms de VPinMAME sont traduits.
- **« Bibliothèque de ROM »** : chaque ROM, ses tables, sa taille, les ROM à ranger, inutilisées ou attendues, et la place économisée.
- **« Regrouper les ROM »** range celles d'une ancienne installation, avec un plan et le bilan de la place libérée.

### PuP-Packs

- **Sans PinUP Player à installer** : le plugin PuP de VPX 10.8.1.
- **À l'ajout**, le pack est nommé comme le script l'attend, aplati, nettoyé, et configuré sans jamais exécuter ses `.bat` (lus, pas exécutés).
- **L'option du pack choisie d'après vos écrans** (topper, DMD, FullDMD, fronton) ; fiche > « PuP-Pack » montre l'option appliquée et celle conseillée « Pour cette borne ».
- **Réparé avant chaque partie** : un pack que le script de la table garde éteint est allumé (par un script adapté à côté, la table n'est jamais modifiée), un pack que personne ne lance est lancé, les images livrées sous un nom de vidéo et les noms accentués sont corrigés, l'ordre des playlists remis.
- **Vidéos déclenchées par le DMD** reconnues pendant la partie sur les tables FlexDMD sans ROM.
- **Le DMD de la table reste devant le pack** quand le pack le cacherait.
- **Désactivé, table par table** (« Parties du jeu » > « PuP-Pack ») : la table se joue comme si le pack n'était pas installé, sans ses vidéos ; « Réactiver le PuP-Pack » le remet à l'identique.

### Fronton, DMD et plugins de VPX

- **VPX 10.8.1 en mode plugins**, réglé pour vous : backglass, PuP-Packs et DMD dessinés par VPX, sans outil tiers.
- **Priorités réglées** : un PuP-Pack passe devant le `.directb2s`, qui reste visible quand le pack n'a rien à montrer.
- **Couleurs du DMD** Serum et VNI proposées d'office.
- **Le DMD d'un `.directb2s` FullDMD** reçoit le DMD de la ROM, sa place trouvée dans l'image.

## Réglages de VPX et réglages en partie

- **Chaque réglage de VPX**, lu dans le code source de la version installée (1 240 pour 10.8.1, dont 101 de plugins) : onglet « Essentiels » traduit, onglet « Avancé » complet.
- **Globalement ou table par table** : un réglage propre à une table ne garde que ce qui diffère du réglage général.
- **Les clés que Cyber Pinball gère** sont affichées sans pouvoir être modifiées, avec l'origine de leur valeur et la façon de la changer.
- **Réglages en partie** : les deux MagnaSave ensemble ouvrent « Position du DMD » (écran, position, taille, format), puis le menu de VPX. VPX se met en pause pendant le réglage ; la place s'enregistre pour cette table ou pour toutes.
- **« Régler l'affichage en partie »** sur la fiche : la table démarre sur le cadrage (point de vue, fronton, DMD, topper), et cette partie ne compte pas dans les statistiques.
- **Les questions de VPX évitées** (ActiveX, casque VR) ; une boîte de dialogue de VPX arrête la partie et son texte devient le message à l'écran.

<p align="center"><img src="images/fr/vpx-settings.webp?v=b26434761e" width="760" alt="Les réglages de VPX : l'onglet Essentiels avec les réglages de la vue et du son, les valeurs gérées par Cyber Pinball, et le détail du réglage choisi."></p>

## Médias des jeux

<p align="center">
  <img src="images/fr/game-media.webp?v=587ec90bc4" width="360" alt="Médias du jeu de Neon Abyss : chaque média avec son aperçu, où le menu le montre et son rôle, et les actions Chercher les médias et Chercher sur le web.">
</p>

### Les rôles des médias

| Média | Où il s'affiche | Sans fichier |
| --- | --- | --- |
| Logo | roue, liste, mode attente | le titre en texte stylisé |
| Plateau | fond du playfield | verre fumé |
| Fronton | fronton | l'image allumée du `.directb2s`, sinon une carte (titre, fabricant, année) |
| Afficheur (DMD) | DMD 4:1 | le titre en points |
| Afficheur large (FullDMD) | DMD 16:9 | l'afficheur centré, sinon le titre en points |
| Topper | topper | logo, fabricant et année |
| Chargement | du Start à la partie | marque, titre, fabricant, année, barre d'attente |
| Musique du jeu | haut-parleurs du fronton | la musique de la borne, sinon le silence |
| Son de lancement | une fois au Start | le son de la vidéo de chargement |
| Prospectus | sur demande, page par page | une fiche tirée des informations du jeu |
| Règles | sur demande, page par page | les règles trouvées seules, puis les commandes de la partie |

- **Jamais un écran vide** : un média manquant est remplacé par un repli dessiné aux couleurs de la table.
- **« Médias du jeu »** : une carte par média avec son aperçu, son état (« Présent », « Repli : … »), ses dimensions et son poids. Prendre dans le dossier d'import, choisir sur le PC, glisser, remplacer, mettre à la corbeille ; rien n'est écrit avant « Enregistrer », qui montre le plan.

### Galeries de propositions

- **« Voir les propositions »** : toutes les versions trouvées pour un média, avec leur aperçu et leur provenance : VPinMediaDB, sites communautaires, base VPS, et ce que contient déjà la table (PuP-Pack, animations FlexDMD ou UltraDMD, images du `.directb2s` et du `.vpx`).
- **Popularité, auteur, date**, tri par popularité ; le média enregistré est toujours celui que vous avez choisi.
- **Recherche approfondie** : nom interne du `.vpx`, auteur, numéro IPDB, ROM, initiales ou titre traduit ; « Pas le bon jeu ? » toujours proposé.
- **« Chercher plus »** : plus de pages par site et les autres éditions du jeu ; **« Animés seulement »** ne garde que les vidéos et images animées ; **des mots ajoutés** (« neon ») affinent la recherche sur les sites et sur le web. Une ligne dit combien de propositions les filtres masquent.
- **Les fiches des sites rangées par la base VPS** (logos, toppers, packs de médias) sont proposées d'office, sans recherche.

### VPinMediaDB et sites communautaires

- **« Chercher les médias »** depuis VPinMediaDB (environ 1 155 jeux) : logo, plateau en 1k ou 4k selon votre écran, fronton, afficheur large, prospectus, musique. Plan à valider, téléchargement vérifié.
- **« Trouver les médias manquants »** pour toutes les tables d'un coup, sans jamais remplacer un média existant.
- **VPForums et VPUniverse** avec votre propre compte : leurs temps d'attente sont mis en file pour vous, avec un minuteur à l'écran.

### Recherche libre, YouTube et vidéos

- **« Chercher moi-même sur le web… »** : le navigateur intégré sur une recherche que vous changez à votre guise (Web, Images, Vidéos, YouTube).
- **« Vos comptes »** sous la recherche : vpuniverse.com, vpforums.org, pinballnirvana.com et pinsound-community.org en un appui ; connecté, la pastille y cherche le titre, sinon elle ouvre la page de connexion du site.
- **« Récupérer le son » ou « Récupérer la vidéo »** sur une page YouTube, Vimeo ou Dailymotion, par l'outil yt-dlp, téléchargé et vérifié à la première utilisation.
- **Fichiers jugés sur leur contenu**, convertis si besoin (image en PNG, son d'une vidéo extrait tel quel) et affectés aussitôt.
- **Découpe d'un son** : forme d'onde, début et fin, fondu de fin, pour une musique de présentation à la bonne longueur.

### Sons de la table

- **« Sons de la table »** : écouter les musiques du PuP-Pack et le son de ses vidéos, et en faire la musique de présentation ou le son de lancement du jeu ; l'original reste dans le pack.

### Filmer une partie pour la roue

- **« Jouer et enregistrer »** : Cyber Pinball filme la partie (le plateau, et au choix le fronton et l'afficheur), du moment choisi (0 à 60 s) pendant la durée choisie (15 à 90 s), avec le son. Le plateau est filmé en 4K par défaut (1440p, 1080p ou 720p au choix, aussi dans Système > « Médias, son et attente »).
- **Un témoin discret**, exclu de la vidéo : « Enregistrement dans 7 s », « REC 0:12 / 0:30 ».
- **Au retour** : « Utiliser pour la roue », « Garder de côté », « Rejouer et enregistrer » ou « Jeter l'enregistrement ».

### Médecin des médias et reprise d'un autre frontend

- **Le médecin des médias** signale un format illisible, un média mal nommé ou mal rangé, des proportions qui ne collent pas à l'écran, un fichier très lourd, des doublons. Ses corrections sont toujours sûres (renommer, déplacer, corbeille) ; « Tout réparer » les enchaîne.
- **« Reprendre les médias »** d'un autre frontend installé (Menu système > « Cyber Pinball » > « Migration ») : plan table par table, l'installation d'origine n'est pas modifiée.

## Pendant une partie

- **L'écran de chargement** : sur la borne, la vidéo de chargement du jeu seule, plein écran ; au bureau, la vidéo et les commandes de la partie à côté.
- **Une table qui tarde le dit**, au bureau : passé 8 s, l'encart du chargement donne l'étape réellement vue (VPX lancé, ses fenêtres ouvertes), le temps écoulé, et comment arrêter (Ctrl+Maj+K ou Exit). Jamais de pourcentage inventé ; sur la borne, le média de chargement reste seul.
- **Les fenêtres du menu ne prennent jamais la main à VPX** ; la notification d'une invitation, d'un ami ou d'une partie entre amis s'affiche par-dessus sans voler le focus.
- **Ctrl+Maj+K arrête une partie bloquée** : fermeture polie, puis forcée après 5 s.
- **Une partie qui échoue dit pourquoi** : erreur du script de la table (ligne et message) ou arrêt de VPX expliqué, et Start rejoue la table ou ouvre « Ce qu'il manque pour jouer ».
- **Scripts anciens corrigés** sans modifier la table (par exemple un `vpmInit` appelé deux fois, que VPX 10.8 refuse).
- **Statistiques gardées** pour chaque table : nombre de parties, temps de jeu.
- **Un écran que Windows débranche puis rebranche**, pendant une partie ou au menu, retrouve son rôle et son image ; au retour d'une partie, chaque fenêtre reprend son écran.
- **VPX sur un Windows neuf** : le runtime Visual C++ de Microsoft, s'il manque, est détecté et installé (version officielle, sans fenêtre, avec l'accord de Windows) ; si VPX s'arrête faute d'une bibliothèque, l'écran d'échec le dit.

## Réalité virtuelle et Vision 3D

Deux fonctions en bêta (badge « BÊTA » dans Menu système > Borne) : sans le matériel, l'entrée reste visible, grisée avec sa raison.

### Réalité virtuelle

- **Les tables dans le casque** : avec un Meta Quest (par Link ou Virtual Desktop) ou un casque SteamVR, les tables se lancent dans le casque quand il est prêt, sinon sur les écrans, sans jamais de question de VPX. Le fronton s'affiche au-dessus du plateau des tables sans pièce VR, dans la partie que la pièce de la table laisse voir.
- **Le menu dans le casque** : hors partie, les écrans de la borne posés devant vous à leur taille réelle (plateau en portrait, DMD, fronton et topper debout), sur un sol sobre, avec un léger halo à la teinte de la table choisie. Casque porté, les écrans du PC se mettent au repos ; casque retiré, le PC reprend la main. Pendant une partie, le casque passe à VPX, puis revient au menu.
- **« Caler la borne »** : une manette sur chaque coin de votre vraie barre avant, une gâchette, et la borne du casque se pose dessus ; menu et parties restent ensuite au même endroit, un calage par configuration. Au bureau, sans vraie borne, elle se pose une fois devant vous.
- **Les manettes** suivent une seule règle, au menu comme en partie : A valide, B revient (en partie : pause), les joysticks déplacent la sélection, les gâchettes sont les flippers, les poignées les MagnaSave, X la collection suivante au menu ; ≡ ouvre le menu du casque. Un assistant propose les boutons par défaut de chaque modèle de manettes (Touch, Index, Vive, Windows Mixed Reality), puis permet de les choisir un par un.
- **Pause en partie** : Reprendre ou Quitter, sur le fronton de la scène ; tenir Pause 1,5 s remplit un cercle et sort de la partie.
- **Pour les spectateurs**, l'écran du plateau montre ce que voit le joueur. Le son passe dans les écouteurs du casque.
- **Une partie fluide** : VPX reçoit un profil graphique adapté à la carte de la machine, Air Link en Wi-Fi est signalé, et chaque partie note sa fluidité au journal. Casque éteint ou Link coupé, la partie se ferme et le menu revient aux écrans du PC.

### Vision 3D

- **La perspective suit votre tête**, comme une fenêtre ouverte sur le plateau. Une simple webcam suffit ; une Kinect pour Xbox 360 fait encore mieux et vise seule votre tête.
- **Le pilote de la Kinect en un clic** : choisir « Vision 3D » le télécharge chez Microsoft, avec le kit qui accepte une Kinect pour Xbox 360, et l'installe sans fenêtre, avec l'accord de Windows. Quand la Kinect refuse de démarrer, l'écran dit la vraie raison (pas prise en charge, sans courant, port USB saturé, intégrité de la mémoire de Windows…).
- **Un écran dédié** dit où en est le capteur, permet de l'essayer sans lancer de table, et règle « Calibrer la position de jeu », « Intensité » (25 à 150 %) et « Réactivité ». En partie, les deux MagnaSave proposent « Recentrer la vue 3D » et l'intensité ; après chaque partie, un bilan dit si VPX a bien suivi votre tête.
- **Les images de la caméra ne quittent jamais le PC.**

## Une borne qui s'entretient

<p align="center"><img src="images/fr/health.webp?v=c6ceeb14be" width="360" alt="Santé de la borne : 1 bloquant, 2 à vérifier, 3 OK. L'espace disque va bien, Midnight Circuit ne démarre pas faute de ROM, VPinMediaDB a des médias pour 2 tables, la borne du salon est reconnue avec ses 4 écrans, les tables sont dans votre sens, flippers en bas, et une version plus récente de VPX est disponible."></p>

### Santé de la borne

- **Une seule page** : le PC et Windows, l'espace disque, les tables qui ne démarrent pas, les PuP-Packs (incomplets compris), les médias manquants, les écrans, la version de VPX, le runtime Visual C++ et le casque, chacun « OK », « À vérifier » ou « Bloquant ».
- **Chaque ligne ouvre l'écran qui répare**, et son « Retour » ramène à la page.
- **Relevé automatique** 15 s après le démarrage puis toutes les 30 minutes, jamais pendant une partie, sans lancer VPX ni rien télécharger.

### Fiche technique et rapport

- **Menu système > Borne > « Fiche technique »** : le PC, Windows, les écrans, les contrôleurs, les logiciels et Cyber Pinball sur une page, six blocs chacun avec son état écrit ; Start ouvre le détail et les entrées du menu qui réparent.
- **Ce qui se voit d'un coup d'œil** : les disques et leur place libre, la carte graphique et la version de son pilote, chaque écran avec son rôle, sa définition, sa connexion et sa fréquence, les boutons et contrôleurs DOF, les plugins de VPX et leur état.
- **Les points à vérifier expliqués** : un écran réglé sous la fréquence qu'il accepte (un 4K à 60 Hz qui accepte 144 Hz), un redémarrage de Windows en attente, le mode « Économie d'énergie », un pilote graphique ancien, peu de mémoire. Ils remontent aussi dans la santé de la borne, au groupe « PC et Windows ».
- **Envoyer un rapport** sans logiciel de messagerie : sur le téléphone connecté (télécharger, préparer un e-mail, copier le résumé), sur une clé USB, en résumé à un ami par la messagerie, ou dans un dossier de la borne. « Décrire le problème » y joint vos mots, et « Voir le contenu du rapport » montre chaque fichier.
- **Anonymisé avant l'écriture** : ni nom d'utilisateur, ni nom du PC, ni adresse IP, ni noms d'amis, ni numéros de série des écrans.

<p align="center"><img src="images/fr/tech-sheet.webp?v=7cf1534a18" width="360" alt="La fiche technique de la borne : le PC, Windows, les écrans, les contrôleurs, les logiciels et Cyber Pinball, chaque bloc avec son état (OK ou À vérifier), puis Envoyer un rapport et Santé de la borne."></p>

### Le médecin des tables

- **« Diagnostiquer et réparer »** explique en mots simples pourquoi une table ne marche pas, et répare ce qu'il peut : une ROM mal rangée ou éparpillée, un PuP-Pack coupé par son script ou mal configuré, un fronton mal nommé, une table de travers, un cadrage imposé par la table.
- **Rien n'est supprimé** : les fichiers remplacés vont à la corbeille de Cyber Pinball.

### Sauvegardes

- **Sur une clé USB, un disque ou un lecteur réseau**, à sa racine ou dans le dossier de votre choix : les réglages et les scores (quelques Mo), les tables en plus, ou toute l'installation. Ce qui n'a pas changé n'est jamais recopié, et chaque fichier est relu et vérifié.
- **Restaurer montre d'abord le plan** : ce qui sera remplacé, remis ou gardé, partie par partie. L'état d'avant part à la corbeille, et « Annuler la dernière restauration » le remet.
- **D'une borne à l'autre** : la sauvegarde d'une autre borne ne reprend d'office ni ses écrans ni son identité sur le réseau des amis.
- **Automatique** (désactivée par défaut) : les réglages et les scores chaque jour ou chaque semaine, dès que possible (la première fois que la borne est libre) ou à l'heure choisie ; une partie lancée passe avant. Copiés sur la clé dès qu'elle est branchée.

### Horaire de la borne

- **Comme en salle d'arcade** (désactivé par défaut) : la nuit, la borne baisse ses écrans (voile de 50 à 85 %, ou écrans noirs) et se tait en attente.
- **Arrêt automatique** à l'heure choisie (mise en veille ou extinction), seulement si personne ne joue, après 30 s de préavis qu'un simple bouton annule.

<p align="center"><img src="images/fr/features/arcade-hours.webp?v=e69a7c4ec4" width="360" alt="Horaire de la borne : début et fin de la nuit, écrans pendant l'attente nocturne, arrêt automatique et mode d'arrêt, et ce qui peut réveiller la borne."></p>

### Mode invité

- **Pour une soirée ou les enfants** : on peut seulement choisir une table, jouer, lire son prospectus et ses règles.
- **Fermés** : le menu système, les réglages, le bureau Windows, toute action qui modifie, répare ou télécharge. Une porte fermée dit seulement « Verrouillé · mode invité ».
- **Déverrouillage** : les deux flippers et les deux MagnaSave tenus 3 s, un anneau qui se remplit. Le mode reste actif après un redémarrage.

<p align="center"><img src="images/fr/features/guest-mode.webp?v=154176a1f1" width="360" alt="Mode invité : ce qui se déverrouille avec les deux flippers et les deux MagnaSave tenus 3 secondes, ce qui reste fermé, et Activer le mode invité."></p>

### Borne dédiée et lancement au démarrage

- **« Borne dédiée »** (désactivée par défaut) : la session Windows s'ouvre directement sur Cyber Pinball, sans bureau ni barre des tâches, et un surveillant le relance s'il se ferme. Sous Windows Pro et Famille comme sous Entreprise et IoT.
- **« Lancement au démarrage »** : Cyber Pinball s'ouvre avec Windows, le bureau masqué derrière.
- **Barres des tâches masquées toute la session** sur une borne lancée au démarrage ; elles reviennent au bureau Windows (Ctrl+Maj+D) et quand on quitte, et seules après un arrêt brutal.
- **Relance par Start** : quand Start est un bouton de joystick (Pinscape, encodeur en mode manette), un appui long de 2 s rouvre Cyber Pinball depuis Windows, ou ramène le menu depuis le bureau Windows. Un petit processus sans fenêtre veille, réglable dans Menu système > Borne > Relance par Start.
- **Chaque réglage de Windows sauvegardé** avant d'écrire ; « Désactiver » le remet tel quel et le vérifie, et un script de secours fait de même hors de Cyber Pinball.

<p align="center"><img src="images/fr/features/dedicated.webp?v=e5b46c9705" width="360" alt="Borne dédiée : désactivée, ce qu'il faut avant d'activer, deux façons au choix (remplacer le bureau, lancer au démarrage de Windows), et le secours pour accéder à Windows."></p>

### Éteindre, mettre en veille, redémarrer

- **Depuis la rubrique « Cyber Pinball »** : une confirmation, puis les réglages sont enregistrés et tous les écrans passent au noir, sans montrer le bureau. Au réveil, le menu revient tel quel.
- **« Redémarrer Cyber Pinball »** relance le logiciel seul, sans redémarrer le PC : après un réglage changé hors du menu, un écran ou une manette rebranchés.

### Langue

- **Français ou anglais**, tout compris (menus, assistant, réglages de VPX, navigateur, messages), dates et nombres assortis : Menu système > « Cyber Pinball » > « Langue / Language ».

<p align="center"><img src="images/fr/features/language.webp?v=135f61fd23" width="360" alt="Langue / Language : Français ou English, chaque langue dans la sienne."></p>

### À côté d'un autre frontend

- **S'installe à côté d'un autre menu de borne** sans rien changer chez lui : sa propre copie de VPX, de ses ROM et de leur mémoire.
- **Attend qu'un autre menu ouvert soit fermé** avant de démarrer ou de lancer une partie, et prévient avant de tourner un écran dans Windows.

### Journal

- **Un journal de l'application** (`data\logs\journal.txt`) : tout ce qu'elle fait, daté, pour comprendre après coup ce qui s'est passé sur une borne. Une erreur ne fige jamais la borne sur une boîte de dialogue.
- **Les incidents à part** (`data\logs\erreurs.txt`) : les erreurs rattrapées et les plantages. Une fenêtre du menu qui plante est rechargée au lieu de rester noire ; en borne dédiée, Cyber Pinball figé est relancé tout seul.

## Limites actuelles

Cyber Pinball est un premier prototype (0.1.x). Ce qui n'est pas encore là :

- **Windows seulement**, et seulement Visual Pinball X 10.8.1 en mode plugins : pas de mode classique, pas d'autres émulateurs pour l'instant.
- **Installeurs non signés** : Windows SmartScreen avertit à l'installation.
- **DMD matériels** (ZeDMD, PIN2DMD, Pixelcade) : alimentés par VPX pendant les parties, pas encore par le menu.
- **Knocker** : il ne sonne pas encore pour un record battu sur une table dont la ROM garde ses records (le tableau des scores, lui, les lit après chaque partie).
- **Réalité virtuelle et Vision 3D** sont en bêta. La Kinect pour Xbox One est reconnue, mais pas encore prise en charge.
- **Avatars** : une image à soi seulement, pas encore d'avatars tout faits ; une image animée devient fixe.
- **Le mode invité** ne verrouille pas Windows lui-même (touche Windows, Alt+Tab).
- **Partie entre amis** : derrière deux connexions très fermées (CGNAT, 4G) sans troisième borne pour relayer, la liaison peut échouer. Certaines tables ne disent pas leur nombre de billes : leur score ne juge rien.
- **Mise à l'échelle de Windows** différente de 100 % : les positions peuvent se décaler (l'assistant le signale).
