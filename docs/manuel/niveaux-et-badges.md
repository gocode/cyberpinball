[English](../manual/levels-and-badges.md) · Français · [Sommaire du manuel](../manuel.md)

## Niveaux et badges

Le joueur gagne des points d'expérience (XP) en jouant, en progressant, aux classements de la semaine, avec ses badges et dans la vie entre joueurs.
Ils font monter un niveau qui ne baisse jamais.
Le niveau se voit en permanence en haut de l'écran des tables et des écrans pleins, sur le profil public et dans les tableaux de scores.
Sur une borne qui joue en local (Menu système > Communauté > Réglages de la communauté > Jouer en local), rien de tout cela ne s'affiche : ni carte du joueur, ni Mon niveau, ni Mes badges, ni moments ; les XP continuent de se compter en silence, et ce qui a été gagné entre-temps revient avec la communauté, sans son moment.
Règles : [packages/core/src/levels.ts](../../packages/core/src/levels.ts) ; badges : [packages/core/src/badges.ts](../../packages/core/src/badges.ts) ; suivi dans l'application : [app/src/level-tracker.ts](../../app/src/level-tracker.ts).

### Courbe et paliers

Pour passer du niveau *n* au niveau *n* + 1, il faut 100 + 50 × (*n* − 1) XP (`levelNeed`) : le niveau 10 à 2 700 XP, le niveau 20 à 10 450 XP.
Tous les dix niveaux, un palier, qui donne son titre et la couleur de l'anneau de l'avatar : Novice (1 à 9), Flippeur, Habitué, Expert, Maître, Sorcier, puis Légende dès le niveau 60.

### Gagner des XP

| Action | XP | Condition |
| --- | --- | --- |
| Minute de vraie partie | 1 | 60 au plus par partie ; une partie dont les scores relevés sont tous nuls (table laissée ouverte) ne compte pas ses minutes |
| Partie menée au bout | 10 | au moins 2 minutes, ou un score non nul |
| Première partie du jour | 20 | une fois par jour |
| Nouvelle table | 50 | première partie sur une table jamais jouée |
| Record personnel battu | 25 | une fois par table et par jour ; le premier score d'une table la pose sans rien battre |
| Tableau d'honneur | 50 | une entrée au tableau des records de la table ; 100 pour la première place |
| Partie en ligne menée au bout | 20 | en direct, instantanée ou de groupe ; 20 de plus pour une victoire (première place, deux joueurs classés au moins) |

Ces XP de jeu sont plafonnés à 600 par jour (`DAILY_PLAY_CAP`).

| Vie sociale | XP | Condition |
| --- | --- | --- |
| Présent au salon | 10 | premier message du jour dans un salon ou un groupe |
| Nouvel ami | 25 | une fois par ami, même retiré puis revenu |
| « J'aime » reçu | 2 | chacun ne compte qu'une fois, retenu par son identifiant |
| Réaction reçue | 1 | sur une ligne de salon ; même règle |
| Personne invitée | 100 | une personne à qui vous avez fait découvrir Cyber Pinball finit sa première partie menée au bout ; une fois par personne, hors plafond (voir [Personnes invitées](amis-le-reseau-des-bornes.md#personnes-invitées)) |
| Palier d'une personne invitée | 25 | chaque palier qu'elle passe (Flippeur, Habitué…), lu sur sa carte publique s'il est vraisemblable ; hors plafond |

La vie sociale a son propre plafond : 100 XP par jour (`DAILY_SOCIAL_CAP`), sans les personnes invitées.
Leurs gains se lisent dans « Mon niveau » : « Personne invitée » (« Nova a fini sa première partie »), « Une personne invitée progresse » (« Nova passe un palier »).

**Classements de la semaine** : la semaine des tableaux (lundi 0 h, heure de la borne) est relevée pendant qu'elle court, puis versée le mardi, une fois les scores tardifs arrivés.
Pour chaque table, seule la meilleure des trois portées compte : Monde 300, 150, 75, 25 (1er, 2e et 3e, 4e à 10e, 11e à 100e), pays 150, 75, 40, amis 30, 15.
Il faut au moins dix joueurs classés au monde, cinq dans le pays, trois entre amis ; au plus dix tables comptent par semaine.
Une semaine close, la borne ne garde plus tous les scores des autres : la dernière relève ne peut que faire perdre une place, jamais en gagner (`noteStanding`).

**Badges** : selon leur rareté, 50 pour un commun, 150 pour un rare, 400 pour un épique, 1 000 pour un légendaire, hors plafond.

### Niveau de départ et vraisemblance

Au premier lancement de la version, le niveau est calculé sur l'historique déjà relevé (parties et temps des `.info`, tables jouées, records), au plus 30 000 XP (`START_XP_MAX`), sans plafond quotidien.
Les badges que l'historique mérite déjà sont donnés en même temps, sans annonce aux amis, et un écran unique « Votre niveau de départ » les présente.
Les amis et les « J'aime » d'avant sont comptés sans XP.

Le niveau voyage dans la carte publique signée et dans chaque score publié (champ `xp`, qui n'entre au texte signé que s'il est présent).
Un tableau des scores montre le niveau d'aujourd'hui : celui de la dernière carte publique reçue du joueur (le mien, d'après mes XP), et seulement à défaut celui que porte son score ; un score publié avant les niveaux a donc lui aussi un niveau, dès que la carte du joueur est arrivée.
Chaque borne note le jour où elle a reçu pour la première fois la carte d'un joueur ; un niveau qui dépasse ce que les plafonds permettent depuis ce jour s'affiche « ? » (`shownLevel`).
Chaque personne invitée vérifiée sur sa carte ajoute à ce qui est permis ce qu'elle peut rapporter, 250 XP (100 + 6 paliers × 25, `INVITED_XP_MAX`).
Le niveau ne change jamais une place dans un classement.
Rien ne compte en mode invité ni pendant un essai sans opérateur.

**Niveau en cours de vérification.**
Un niveau trop élevé pour l'ancienneté connue du joueur s'affiche « Niveau en cours de vérification » au lieu de « Niveau ? ».

### Badges

Cinquante-six badges en douze familles : Parcours, Temps de jeu, Explorateur, Progrès, Tableau d'honneur, Classements, En ligne, Salons, Entre joueurs, Communauté, Découvertes et Secrets.
Chacun a une rareté : 18 communs, 18 rares, 13 épiques, 7 légendaires.
Les huit premiers badges gardent leur identifiant, pour être reconnus par les amis restés sur une version plus ancienne.
Les badges secrets restent cachés dans « Mes badges » jusqu'à ce qu'ils tombent : seul leur indice se lit.
Une nouvelle série du catalogue (`BADGES_SERIES`) donne une première fois, sans annonce, ce que l'historique mérite déjà.

**La famille Communauté** (série 3) récompense ceux qui font vivre Cyber Pinball :

| Badge | Rareté | Condition |
| --- | --- | --- |
| Ambassadeur | rare | faire découvrir Cyber Pinball à un joueur (une personne invitée confirmée, voir [Personnes invitées](amis-le-reseau-des-bornes.md#personnes-invitées)) |
| Rassembleur | épique | à cinq joueurs |
| Bâtisseur de communauté | légendaire | à vingt joueurs |
| Une voix qui compte | commun | envoyer un avis, un retour ou une proposition (voir [Retours et propositions](retours-et-propositions.md#retours-et-propositions)) |
| Force de proposition | rare | en envoyer dix |
| Son idée est dans le jeu | épique | voir une de ses propositions arriver dans Cyber Pinball |

Ce qui compte comme contribution ([packages/core/src/feedback.ts](../../packages/core/src/feedback.ts), `<données>\retours\contributions.json`) : une proposition publique dès qu'elle paraît dans la liste comme la vôtre, et plus quand l'équipe l'a masquée ou fusionnée ; un rapport écrit par le joueur, un par jour au plus, jamais un plantage envoyé d'office.
Une proposition passée « fait » donne « Son idée est dans le jeu » une seule fois, avec la notification « Votre idée est arrivée dans Cyber Pinball » (son titre dessous), qui ouvre Mon profil public.
Pour l'annoncer sans ouvrir « Retours et propositions », la liste est relue peu après le démarrage, puis deux fois par jour, seulement si vous y avez publié.

Dessin : les communs en Liseré néon rond (anneau chromé, tube néon, émail profond, pictogramme néon, quatre rivets lumineux) ; les rares, épiques et légendaires en Liseré néon dans un hexagone aux coins arrondis, avec six rivets (rare), douze (épique) ou six étoiles (légendaire).
Les rivets et les étoiles brillent à la couleur de la rareté.

### Ce que voit le joueur

- **Carte du joueur**, en haut de l'écran des tables, à gauche des pastilles : l'avatar dans l'anneau de son palier, le pseudo, « NIV. 14 » et une fine barre ; au retour d'une partie, la part gagnée brille et « +85 XP » apparaît puis s'efface.
  La pastille des badges, à côté, ouvre « Mes badges » ; la carte ouvre « Mon niveau ».
  En mode invité, la carte dit « Invité · Parties sans XP ».
  La carte et la pastille des badges restent aussi en haut des écrans pleins (Menu système et ses écrans, Mes badges, aide…), sur la ligne de la marque, à la hauteur des autres pastilles (`--pill-height`, [app/renderer/niveau.css](../../app/renderer/niveau.css)) ; jamais en mode attente ni au Juke-box.
  Là, « +85 XP » ne s'affiche pas (il tomberait sur le titre de l'écran), et en borne la carte cède sa place le temps d'une notification.
  La roue dentée du Menu système, à leur droite, est une pastille ronde du même gabarit (voir [Menu système](menu-systeme-cinq-rubriques.md#menu-système--neuf-rubriques)).
- **Mon niveau**, dans Arène > Progression : la barre et les XP restants, les XP de la semaine, les quatre derniers gains, les classements de la semaine en cours avec les XP prévus, les deux badges les plus proches ; puis « Mes badges », « Comment gagner des XP » et « Mon profil public ».
- **Mes badges** : chaque ligne porte le dessin du badge, dans sa forme et sa rareté ([app/src/level-menu.ts](../../app/src/level-menu.ts), `Row.medal`).
  Un badge reçu brille, avec un halo à la couleur de sa rareté et un reflet qui passe ; un badge pas encore reçu reste gris et éteint, sans reflet ; un secret pas encore reçu ne montre que son cadenas.
  Les deux badges les plus proches, dans « Mon niveau », ont le même dessin.
  Un badge pas encore reçu dit ce qu'il rapporte (« Jouer à 100 tables différentes · +1 000 XP à gagner »), badges secrets compris, après leur indice.
- **Profil public** (voir [Communauté : le réseau des bornes](amis-le-reseau-des-bornes.md#profil-public-et--jaime-)) : le palier et le niveau sous le pseudo ; puis, après le pays, le nombre d’amis, selon leur confidentialité et les records, la ligne du niveau avec sa barre (« Flippeur · niveau 14 », « 350 / 750 XP ») et ses badges en médailles, les plus rares d'abord (avec le catalogue complet dans l’onglet Badges).
  Sous chaque médaille, son nom entier, sur deux lignes au besoin, jamais coupé au milieu d'un mot (« Ambassadeu / r »), puis les XP qu'elle rapporte (« +150 XP »), à la couleur de sa rareté.
  La carte d'une borne qui n'a pas encore cette version n'a pas de niveau : « Niveau pas encore connu ».
  Ses personnes invitées viennent ensuite (« A fait découvrir Cyber Pinball à 3 joueurs », avec leurs avatars).
  Sur son propre profil, la ligne rappelle le barème : « +100 XP par personne invitée, +25 XP à chacun de ses paliers ; badge Ambassadeur dès la première ».
  Tant qu'on n'a invité personne, la section dit « Faites découvrir Cyber Pinball à vos amis », avec ce même barème ; le profil d'un autre joueur n'a pas de section sans personne invitée.
  Ses **groupes publics** suivent, tels que cette borne les connaît par l'annuaire des groupes (`playerPublicGroups`, [packages/core/src/groups.ts](../../packages/core/src/groups.ts)) : nom, nombre de membres, table de la semaine ; Start ouvre le groupe, ou sa page de l'annuaire avec « Rejoindre ».
  Un groupe privé n'y paraît jamais, ni même leur nombre.
- **Tableaux de scores** en réseau : une colonne « niveau » entre le nom et le score, une pastille à la couleur du palier, « ? » en pointillés pour un niveau invraisemblable.

### Le moment d'un badge

Au retour sur l'écran des tables, jamais pendant une partie ni un chargement, chaque badge reçu a son moment, environ cinq secondes ([app/renderer/niveau.js](../../app/renderer/niveau.js)).
Le fond dépend de la famille du badge : Horizon (Parcours, Temps de jeu, Explorateur, Découvertes), Onde de choc (Tableau d'honneur, Classements), Montée (Progrès), Nuée (En ligne, Salons, Entre joueurs, Communauté), Révélation (Secrets, avec « Secret dévoilé »).
Quand le niveau monte pendant le moment, des rayons à la couleur du palier s'ajoutent et « Niveau 15 » s'affiche ; un légendaire a des rayons dorés dès le début.
Le badge arrive, un faisceau en suit le bord exact (cercle ou hexagone) avec une étincelle en tête, puis viennent le nom, la condition, la rareté, les XP qui défilent et la barre du niveau.
Un badge secret, lui, apparaît en sautant, par à-coups, comme un signal capté.
Plusieurs badges passent l'un après l'autre (« 1 / 3 ») ; un bouton ferme le moment, sauf dans la première seconde et demie, et il se ferme seul huit secondes après la fin.
Le voile se pose une fois, à l'ouverture du moment, et reste d'un badge à l'autre : l'écran des tables ne se rallume pas sous le badge suivant.
Au bureau, le badge et le texte tiennent dans une colonne 9:16 au milieu de l'écran ; le fond couvre tout l'écran.
Ses étoiles et ses poussières se répartissent sur toute la largeur, de part et d'autre du badge, et l'essaim se centre sur la colonne (test : [moment-fond.test.ts](../../packages/core/src/test/moment-fond.test.ts), pour chaque fond).

Deux musiques synthétisées l'accompagnent (sons de l'interface, voir [Médias des jeux](medias-des-jeux.md#sons-de-linterface)) : « Tintement » pour un badge commun, « Fanfare » pour un rare, un épique ou un légendaire, et « Passage de niveau », une fanfare de quatre secondes, quand le niveau monte.
Le temps du moment, la musique de la table choisie sur la roue et le son de la vidéo du plateau se taisent en fondu, pour que la musique du moment s'entende seule ; ensuite, la musique de la table reprend où elle en était (`hushForMoment`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)).

### Fichiers et tests

Le niveau est gardé dans `<données>\amis\niveau.json` : les XP, les quarante derniers gains, les XP par jour (plafonds, Marathon), les records personnels par table, les relevés des classements de la semaine, les identifiants des « J'aime » et réactions déjà comptés, le dernier palier payé de chaque personne invitée (`invitees`), le moment qui attend d'être montré.
Un fichier illisible est mis de côté (`niveau.json.illisible-<date>`) et le niveau repart de l'historique ; un fichier d'une version plus récente est montré sans être complété.

Tests : [levels.test.ts](../../packages/core/src/test/levels.test.ts) (courbe, plafonds, record personnel, table laissée ouverte, classements de la semaine et leur versement le mardi, vie sociale, niveau de départ, vraisemblance, fichier, invariants des badges), [invitations.test.ts](../../packages/core/src/test/invitations.test.ts) (personnes invitées, leurs XP, badges de la Communauté, contributions), [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts) (la roue dentée au gabarit des pastilles, la carte du joueur et ses badges sur les écrans pleins).

**Ouvrir une partie** que d'autres rejoignent rapporte 25 XP, une fois par groupe exact de joueurs ; rejouer avec les mêmes n'en donne plus, un groupe différent en redonne.
**Gagner un défi** à son échéance rapporte 40 XP.
L'onglet Badges de Mon profil indique pour chaque badge obtenu ou à obtenir ses XP, ma progression et l'objectif restant.
