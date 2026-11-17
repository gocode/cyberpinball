[English](../manual/recent-activity.md) · Français · [Sommaire du manuel](../manuel.md)

## Activité récente

Une notification ne reste que quelques secondes, se raccourcit pour tenir sur sa ligne, attend la fin d'une partie (« Masquer les notifications pendant les parties ») ou se fond dans un résumé (« 4 nouveautés ») : vue trop tard, elle était perdue.
**Menu système > Activité récente**, à la racine du menu système (juste après « Nouveautés » quand elles y sont), les garde toutes, en entier.
Elle est aussi rangée dans la rubrique Cyber Pinball, puisqu'elle parle de tout, pas que des amis.

- **Ce qui y entre** : chaque évènement des notifications, dès son arrivée, qu'il se soit montré ou non (un ami qui se connecte ou lance une partie, son record, son badge, une demande d'ami reçue ou acceptée, une invitation et sa fin, un invité qui accepte, décline ou quitte, une partie entre amis finie ou annulée, un téléchargement fini ou bloqué) ; une version plus récente de Cyber Pinball trouvée en arrière-plan (une fois par version), la mise à jour faite ou manquée au démarrage ; les constats du démarrage qui nomment un écran (sauvegarde restaurée, configuration de la borne reconnue, écran du DMD à vérifier, pare-feu de Windows).
  La réponse immédiate à un geste (orientation rendue, veille simulée) n'y entre pas.
- **L'écran** : groupé par jour (« Aujourd'hui », « Hier », puis la date), les plus récentes en haut.
  Chaque ligne a l'icône de sa notification, ou la pastille du joueur dont elle parle, son texte entier, rien de raccourci, son heure, l'état de l'ami (« En ligne ») et, dessous, ce que fait Start (« ↩ Start : voir sa fiche », « répondre à l'invitation », « voir les résultats », « ouvrir les téléchargements », « voir la mise à jour »).
  Une action qui ne vaut plus reste visible, la ligne grisée et sa raison à la place : « ✕ Invitation expirée », « Partie terminée », « Retiré de la liste des téléchargements », « N'est plus dans vos amis ».
  Un téléchargement bloqué a la croix rouge des états bloquants.
  « Retour » ramène à l'écran d'où l'on vient ; revenu d'une action, la ligne quittée est choisie.
- **Regroupé** : ce qui se répète dans la journée ne fait qu'une ligne : « Chloé : 3 connexions », avec les heures (« À 21:31, 19:02 et 14:10 »), « Bruno : 2 parties lancées » sur une même table, « Téléchargement bloqué 2 fois ».
  Un même évènement redit (un relevé qui revient, un record renvoyé par un ami qui se reconnecte) ne compte pas deux fois.
- **Gardé** : les 50 dernières lignes, d'un démarrage à l'autre (`<données>\activite.json`) ; au-delà, les plus anciennes déjà lues partent d'abord.
  Un fichier illisible est mis de côté, jamais écrasé.
  « Effacer l'activité récente » vide la liste après une question (Annuler choisi d'abord) ; les amis, téléchargements et parties restent.
- **Non lu** : ce que la notification n'a pas dit en entier : retenu pendant une partie ou dans le menu système, expiré, fondu dans un résumé.
  Ce qu'une notification ou un bandeau a dit est lu : une connexion, une fin de téléchargement, « Cyber Pinball 0.1.9 est installé » au redémarrage.
  Seules les erreurs restent non lues même dites, jusqu'à ce qu'on les voie ici.
  Une ligne est vue quand le curseur s'y pose (pas tout d'un coup à l'ouverture) ; son repère, la pastille rouge et le mot « Non lu », reste jusqu'à ce qu'on quitte l'écran, et le sous-titre compte les lignes non lues à l'ouverture.
  Notifications du front-end « compteur seul » ou « coupées » : ce qui ne se montre plus est consigné déjà lu, sauf la partie entre amis et les erreurs.
- **Jamais de pastille rouge** : le non-lu se marque dans l'écran seulement, et l'entrée dit « <n> non lues · … ».
  Ce qui attend une réponse a déjà sa pastille là où l'on y répond : demandes d'ami et invitation dans Amis, téléchargement fini ou bloqué dans Téléchargements, version disponible ou mise à jour qui n'a pas abouti dans « Mise à jour de Cyber Pinball ».
  La redoubler ici faisait deux pastilles pour une chose, ou une pastille pour rien (une mise à jour installée, une connexion d'ami), et, l'entrée étant alors rangée sous Amis, une pastille de mise à jour qui remontait par la rubrique Amis.
- **Depuis l'écran des tables** : le résumé « 4 nouveautés » ouvre Activité récente, qui dit chacune en entier ; « Retour » ramène à l'écran des tables.
  Une notification seule garde son action directe (Mes amis, Demandes d'amis, Téléchargements, la partie entre amis).
- **Mode invité** : l'écran est fermé, comme tout le menu système ; le résumé n'y mène pas.
- **Code** : le journal dans `packages/core/src/activity.ts` (`addActivity`, `trimActivity`, `markActivityShown`, `markActivityRead`, `activityText`, `activityAct`, `loadActivity`) ; l'écran et ce que fait chaque ligne dans `app/src/activity-menu.ts` ; chaque évènement consigné par `app/src/menu-notices.ts` (`activity`), la notification qui le dit en entier le donnant pour lu (`NoticeTick.entered`).
- **Tests** : `packages/core/src/test/activite-recente.test.ts` (texte entier, regroupement dans la journée et redites, limite des 50 lignes, fichier gardé et mis de côté, non lu et résumé, chaque genre en français et en anglais, la vraie file sur chaque écran, l'écran avec ses lignes grisées et ses actions, la ligne vue sous le curseur).
