[English](../manual/feedback-and-ideas.md) · Français · [Sommaire du manuel](../manuel.md)

## Retours et propositions

Menu système > Aide et infos > Retours et propositions : le tableau public des propositions des joueurs et le formulaire des retours, le même d'où que l'on vienne.
Cinq portes peuvent y mener, sans jamais y obliger : cette entrée du menu système ; l'écran d'une partie échouée (« Flipper : envoyer un rapport aux développeurs », le problème déjà rappelé) et le diagnostic d'une table (« Envoyer un rapport aux développeurs »), qui envoient d'un appui un rapport privé, la fiche technique jointe, chiffré et anonymisé, une description restant facultative ; la fiche technique (« Envoyer un rapport » > « À l'équipe de Cyber Pinball », rapport technique joint et description reprise) ; l'appli du téléphone (menu ⋮ > « Retours et propositions », et « Envoyer un rapport aux développeurs » sur l'écran d'échec).

**Le tableau.**
Les propositions de tous les joueurs, les plus demandées d'abord, avec des onglets par nature (Problème, Amélioration, Nouvelle fonction) et « Les miennes » (proposées ou votées depuis cette borne).
Chaque ligne dit sa nature, son état dans sa pastille, son nombre de votes, le pseudo de son auteur (« par Ressort »), les doublons regroupés et la réponse de l'équipe.
Chaque état a sa pastille, avec son icône et sa couleur, pour se distinguer d'un coup d'œil : « Nouvelle » (étincelle) et « À l'étude » (œil) en contour, tant que l'équipe ne s'est pas engagée ; « Prévue » (calendrier), « En développement » (roue dentée) et « Faite » (coche) en fond plein, dès qu'elle l'est ; « Pas retenue » (croix) en pointillés.
Start ouvre une proposition : son texte, son auteur avec son drapeau et la date, son avancement, la réponse de l'équipe, puis « Ils la soutiennent (12) », les joueurs qui ont voté pour elle, chacun avec son drapeau, le plus récent d'abord ; « Voter pour cette proposition », ou « Retirer mon vote ».
L'avancement porte la même pastille que la liste et dit ce que l'état veut dire : « Pas encore examinée par l'équipe », « L'équipe l'examine », « Retenue : elle arrivera dans une prochaine version », « L'équipe y travaille en ce moment », « Disponible dans Cyber Pinball », « L'équipe ne prévoit pas de la faire ».
Votre pseudo s'ajoute aux soutiens quand vous votez ; les votes donnés avant l'arrivée des pseudos restent comptés, sans nom (« et 4 autres joueurs · Votes donnés sans pseudo, avant novembre 2026 »).
Une proposition faite avant l'arrivée des pseudos reçoit celui de son auteur dès que sa borne est à jour, sans qu'il ait à voter de nouveau ; d'ici là, elle dit « Auteur non nommé ».
Une voix par borne : le vote est signé par la clé du joueur de la borne (celle du réseau des amis), qui ne sert qu'à compter une voix et n'est jamais rendue par le service.
Les textes publics, traduits compris, passent par le filtre de mots des salons.

**Dans votre langue.**
Chaque proposition se lit dans la langue de la borne : le service traduit d'office le titre, la description et la réponse de l'équipe dans toutes les langues de Cyber Pinball, dès la publication, et reprend chaque heure ce qui manque, propositions publiées avant la traduction comprises.
Tant qu'elle n'est pas traduite, une proposition s'affiche telle qu'écrite.
Une mention discrète signale un texte traduit : « traduit du français » en fin de ligne dans la liste ; sur la fiche, « Traduit de l'anglais » sous la description (« Traduction automatique · « Voir l'original » pour le texte de l'auteur ») et sous la réponse de l'équipe.
« Voir l'original » montre la proposition telle que l'auteur l'a écrite (« Texte original, tel que l'auteur l'a écrit ») ; « Voir la traduction » y revient, et le choix tient jusqu'au redémarrage.

**Le formulaire.**
La nature, un titre (4 à 90 caractères) et une description facultative, au clavier à l'écran ou au téléphone, et « Joindre le rapport technique » (d'office pour un problème).
Dès le titre écrit, les propositions proches s'affichent (« Déjà proposé ? Votez plutôt », `similarProposals` : mots porteurs en commun, sans accents ni pluriels).
Elles sont comparées dans votre langue, traductions comprises : une idée écrite dans une autre langue est retrouvée aussi.
« Joindre des fichiers… » ajoute des fichiers de ce PC (captures d'écran, journaux, réglages), choisis dans le [sélecteur de fichiers](telechargements-et-selecteur-de-fichiers.md#téléchargements-et-sélecteur-de-fichiers) de Cyber Pinball, aux flippers, à la souris ou au clavier ; « Envoyer un rapport aux développeurs » (écran d'échec, diagnostic d'une table) a le même bouton.
Cinq fichiers et 1,2 Mo en tout au plus (« 340 Ko sur 1,2 Mo · privé, lu par l'équipe seule ») ; une capture d'écran trop lourde est réduite plutôt que refusée (« image réduite pour tenir »), et ce qui n'a pas pu être joint est dit sous la liste (trop lourd, dossier, illisible, au-delà de cinq).
Les fichiers s'alignent sous « Fichiers joints · privés » ; Start sur l'un d'eux le retire.
Ils ne sont jamais publics : avec des fichiers joints, un rapport privé part toujours, même quand la proposition est publiée.
« Envoyer à l'équipe seulement » vient d'abord et n'en fait qu'un message privé (« Privé : rien n'est publié ») ; « Publier en public », ensuite, la rend publique tout de suite, son auteur votant pour elle (cinq par jour et par borne au plus).
Pour un problème signalé, c'est l'envoi privé qui est mis en avant ; pour une idée, la publication, pour que les autres joueurs votent.
Le titre et la description sont publics ; le rapport technique et les fichiers joints, eux, ne le sont jamais.

**Les rapports privés.**
Le rapport technique est le ZIP de la [fiche technique](fiche-technique.md#fiche-technique), anonymisé de la même façon, avec une enveloppe (nature, texte, table, version, langue, identifiant de borne tiré au hasard).
Les fichiers joints y entrent sous `pieces-jointes/`, avec leur seul nom, jamais leur emplacement sur le disque ; s'ils ne tiennent pas avec le rapport technique, celui-ci est retiré et l'enveloppe le dit à l'équipe.
Il est **scellé sur la borne** pour la clé « retours » du projet (X25519 et AES-256-GCM, `sealReport`, en-tête `CPR1`) : le service garde des octets qu'il ne peut pas lire, et seule l'équipe les ouvre.
Hors ligne, il attend dans `<données>\retours\attente` et repart au démarrage, puis toutes les 30 minutes (vingt au plus, oubliés après 30 jours).

**Rapports de plantage automatiques.**
Au premier plantage de VPX, en quittant l'écran d'échec, une question : « Envoyer les rapports de plantage ? » (« Oui, à chaque plantage », « Non », « Décrire ce qui s'est passé », « Voir le contenu du rapport »).
La réponse est retenue dans `<données>\retours.json` et se change dans Retours et propositions.
Avec l'accord, chaque plantage de VPX, et ceux de Cyber Pinball (exception non rattrapée, plantage natif relevé au démarrage suivant), part seul, un même plantage une fois par jour au plus (`crashDue`).
Un plantage dont le rapport automatique est parti a sous l'erreur un encart 👌 « L'équipe a été prévenue » ; le flipper n'y ajoute plus que vos détails et vos fichiers joints (« Ajouter des détails pour les développeurs » ; « Envoyer mes fichiers » quand il n'y a que des fichiers), le rapport technique ne repartant pas.

**Le service.**
Le Worker du projet, à `t.cyberpinball.com` (le même que l'adresse stable du téléphone), sur une base Cloudflare D1 (`packages/service-telephone/worker.mjs`, `schema.sql`) : `GET /api/propositions`, `POST /api/propositions`, `POST /api/votes` (corps signés, datés, jamais rejoués), `POST /api/rapports` (une boîte `CPR1` de 1,9 Mo au plus) ; la gestion (`/api/admin/…`) exige la signature de la clé « retours ».
Le même service tient `/api/soutiens` (les soutiens d'une proposition), `/api/noms` (le pseudo signé de chaque borne, qui nomme ses propositions et ses votes), `/api/nouveautes` (les réactions aux [Nouveautés](nouveautes.md#nouveautés)) et `/api/oubli` (l'effacement d'un compte supprimé).
Il traduit les propositions avec Workers AI (modèle m2m100), à la publication puis chaque heure ; un échec de traduction ne bloque jamais la publication et se retente plus tard.
Mise en ligne : `node scripts/service-telephone.mjs d1` (une fois), puis `deployer`.
L'équipe change l'état des propositions, y répond, masque ou regroupe les doublons (les voix du doublon passent à la cible, sans double voix) et lit les rapports avec la clé « retours », gardée hors du dépôt.

Code : [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts) (protocole, scellement, doublons, accord) ; [app/src/feedback-service.ts](../../app/src/feedback-service.ts) (le service vu de la borne, la file d'attente) ; [app/src/feedback-menu.ts](../../app/src/feedback-menu.ts) (les écrans).
[feedback.test.ts](../../packages/core/src/test/feedback.test.ts) et [retours-service.test.ts](../../packages/core/src/test/retours-service.test.ts) fixent le scellement, la signature, les doublons, l'accord, et que la borne et le service parlent le même protocole ; [retours-traduction.test.ts](../../packages/core/src/test/retours-traduction.test.ts) les traductions, [feedback-etats.test.ts](../../packages/core/src/test/feedback-etats.test.ts) les pastilles d'état, [rapport-pieces-jointes.test.ts](../../packages/core/src/test/rapport-pieces-jointes.test.ts) les fichiers joints.
