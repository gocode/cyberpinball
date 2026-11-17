[English](../manual/rankings-on-the-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Classements au téléphone

La vue **Scores** de la page du téléphone (onglet Communauté) montre le tableau des scores de chaque table, exactement comme à la borne (fiche de la table > « Tableau des scores ») : les portées **Cette borne**, **Amis**, **National** et **Mondial**, les quatre périodes (tout temps, cette année, cette semaine, aujourd'hui), le rang, le drapeau, la pastille du joueur avec sa marque de présence, le nom et le score.
Lecture seule : « Masquer un score… » reste à la borne.
C'est, au téléphone, la porte « Tables » des Classements de la borne (Communauté > Classements > Tables, puis une table) ; la porte « Joueurs », le classement des joueurs par leurs XP, ne se montre qu'à la borne (voir « Le médaillon Communauté » dans [Amis](amis-le-reseau-des-bornes.md#amis--le-réseau-des-bornes)).

- **Quelle table** : celle que la borne a choisie sur la roue, ou lancée pendant une partie, s'ouvre par défaut, marquée « À la borne » ; la page la suit quand la roue tourne.
  Le bouton de la table, en tête, ouvre la liste de toutes les tables (un champ « Chercher une table » au-delà de huit) ; une autre table choisie reste, même quand la roue tourne, jusqu'à ce qu'on choisisse de nouveau celle de la borne.
- **Portée et période** : à la première ouverture, le classement **Mondial** de **Cette semaine**, comme à la borne (fiche > « Tableau des scores », `app/src/scores-choice.ts`) ; sans classement mondial (partage désactivé), **Cette borne**.
  Une portée ou une période touchée est gardée par le téléphone (stockage du navigateur, `cyberpinball.scores`) et rouvre la vue la fois suivante.
  À la borne, le dernier choix (clic, flippers, MagnaSave) est gardé dans `<données>\tableau-des-scores.json` (partie Réglages des sauvegardes), pour toutes les tables ; un choix gardé est rouvert tel quel, avec sa raison si son classement manque.
- **Rien recalculé à part** : la borne envoie ce que montre son propre tableau des scores (`app/src/remote-ranks.ts`, qui reprend `scoreboardView` et `rankingScoreboardView` de `scoreboard-menu.ts`, avec `table-scores.ts` et `table-rankings.ts`) : mêmes lignes, mêmes nombres de parties ou de joueurs, même place, même note (version comparée, scores non publiés, hors ligne), même légende des marques de présence.
  Les textes sont traduits à la borne.
- **Indisponible** : une portée dont le classement ne se montre pas est grisée ; choisie, elle dit pourquoi, comme la borne : « Pays non choisi : Amis > Partage et réseau », « Aucun ami pour l'instant », « Partage désactivé », « Empreinte de la table en calcul… », « Version de la table illisible : pas de classement ».
  Hors ligne, les classements en réseau restent lisibles d'après les scores déjà reçus, et la note le dit.
  Une période sans partie dit ce que dit la borne (« Aucun score pour l'instant », « Aucun score cette semaine »…).
- **Tableau** : une grille commune, comme à la borne : rang, drapeau, pastille, nom et score dans les mêmes colonnes sur toutes les lignes, au pixel près (le rang et le score à la largeur du plus long, en chiffres de même chasse), la première place et ma ligne marquées, ma ligne au-delà des premières places séparée par un pointillé.
  Faute de place pour la date, une ligne touchée ouvre une feuille avec son rang et son score, quand, le pays et la présence en toutes lettres (« Vu il y a 2 h »).
  Ma place dans ce classement, la note et la légende suivent le tableau.
- **Mise à jour** : tant que la vue est ouverte, la borne renvoie le tableau quand il change (une partie finie, un score reçu d'une autre borne, une présence), au plus une fois par seconde ; la vue quittée, elle cesse de le relire.
- **Pendant une partie** : l'onglet Communauté reste ouvert, et Scores sur la table lancée ; Écran montre la partie ; Menus et Boutons sont grisés (« Après la partie »), Boutons revenant avec les réglages en partie.
- **Mode invité** : les classements restent lisibles (la borne les montre à l'invité, porte `sheet.scores`), sur les tables de la collection imposée.
  Si la borne les fermait à l'invité, la page dirait « Classements fermés », avec la raison.
- **Ce qui part au téléphone** : seulement ce qui s'affiche.
  Une table est un rang dans la liste envoyée (`ranks-tables`, dont la version change avec les lignes) ; jamais un chemin, un fichier ni une clé de joueur.
  Les drapeaux viennent de la borne (`/drapeaux/<code>.svg`, deux lettres) ; une pastille, sous un jeton tiré au hasard (`/images/<jeton>`, `app/src/remote-images.ts`), valable tant que la télécommande vit : la borne ne sert aucun autre fichier.
  Les jetons viennent tous de la télécommande, la seule à les servir (`phone-remote.ts`, `images`) : les classements la reçoivent obligatoirement, aucune vue ne peut donner un jeton que la borne ne servirait pas.
  La page ne joint jamais d'autre hôte que la borne.
- **Messages** : le téléphone demande `ranks` (portée, période, et le rang et la version de la liste, ou rien pour la table de la borne), puis `ranks-off` à la sortie de la vue ; une portée ou une période inconnue coupe la liaison, un rang d'une liste dépassée est ignoré.
  La borne répond `ranks-tables` puis `ranks`.
  Tout passe par la liaison scellée de la télécommande.
- **Page du téléphone** : `app/renderer/telephone/telephone-ranks.js`, `body[data-view='ranks']`.
  Portées en onglets soulignés, périodes deux par rangée (comme la borne en portrait), le vert sur la portée et la période ouvertes.
  Le panneau défile, jamais la page ; cibles de 48 px au moins, textes de 15 px au moins, jusqu'à 320 × 568.
- **Essais** : `telecommande.test.ts` rejoue un scénario hors écran (`demo-telephone-scores`) : le vrai tableau des scores sur un réseau des bornes simulé et la vraie page du téléphone ; la table de la borne par défaut, suivie quand la roue tourne ; une autre de la liste ; chaque portée et chaque période comparées à ce que montre la borne ; drapeaux, pastilles et présence ; les portées grisées avec leur raison ; hors ligne ; une table sans partie ; le mode invité ; une partie ; les refus ; rien d'autre que ce qui s'affiche au téléphone ; trois tailles d'écran et le garde-fou de mise en page ; la borne coupée.
