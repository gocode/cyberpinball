[English](../manual/feedback-and-ideas.md) · Français · [Sommaire du manuel](../manuel.md)

## Retours et propositions

Menu système > Cyber Pinball > Retours et propositions : le tableau public des propositions des joueurs et le formulaire des retours, le même d'où que l'on vienne.
Cinq portes peuvent y mener, sans jamais y obliger : cette entrée du menu système ; l'écran d'une partie échouée (« Flipper : envoyer un rapport aux développeurs », le problème déjà rappelé) et le diagnostic d'une table (« Envoyer un rapport aux développeurs »), qui envoient d'un appui un rapport privé, la fiche technique jointe, chiffré et anonymisé, une description restant facultative ; la fiche technique (« Envoyer un rapport » > « À l'équipe de Cyber Pinball », rapport technique joint et description reprise) ; l'appli du téléphone (menu ⋮ > « Retours et propositions », et « Envoyer un rapport aux développeurs » sur l'écran d'échec).

**Le tableau.**
Les propositions de tous les joueurs, les plus demandées d'abord, avec des onglets par nature (Problème, Amélioration, Nouvelle fonction) et « Les miennes » (proposées ou votées depuis cette borne).
Chaque ligne dit sa nature, son état (Nouvelle, À l'étude, Prévue, En développement, Faite, Pas retenue), son nombre de votes, le pseudo de son auteur (« par Ressort »), les doublons regroupés et la réponse de l'équipe.
Start ouvre une proposition : son texte, son auteur avec son drapeau et la date, son état, la réponse de l'équipe, puis « Ils la soutiennent (12) », les joueurs qui ont voté pour elle, chacun avec son drapeau, le plus récent d'abord ; « Voter pour cette proposition », ou « Retirer mon vote ».
Votre pseudo s'ajoute aux soutiens quand vous votez ; les votes donnés avant l'arrivée des pseudos restent comptés, sans nom (« et 4 autres joueurs · Votes donnés sans pseudo, avant novembre 2026 »).
Une proposition faite avant l'arrivée des pseudos reçoit celui de son auteur dès que sa borne est à jour, sans qu'il ait à voter de nouveau ; d'ici là, elle dit « Auteur non nommé ».
Une voix par borne : le vote est signé par la clé du joueur de la borne (celle du réseau des amis), qui ne sert qu'à compter une voix et n'est jamais rendue par le service.
Les textes publics passent par le filtre de mots des salons.

**Le formulaire.**
La nature, un titre (4 à 90 caractères) et une description facultative, au clavier à l'écran ou au téléphone, et « Joindre le rapport technique » (d'office pour un problème).
Dès le titre écrit, les propositions proches s'affichent (« Déjà proposé ? Votez plutôt », `similarProposals` : mots porteurs en commun, sans accents ni pluriels).
« Envoyer à l'équipe seulement » vient d'abord et n'en fait qu'un message privé (« Privé : rien n'est publié ») ; « Publier en public », ensuite, la rend publique tout de suite, son auteur votant pour elle (cinq par jour et par borne au plus).
Pour un problème signalé, c'est l'envoi privé qui est mis en avant ; pour une idée, la publication, pour que les autres joueurs votent.
Le titre et la description sont publics ; le rapport technique, lui, ne l'est jamais.

**Les rapports privés.**
Le rapport technique est le ZIP de la [fiche technique](fiche-technique.md#fiche-technique), anonymisé de la même façon, avec une enveloppe (nature, texte, table, version, langue, identifiant de borne tiré au hasard).
Il est **scellé sur la borne** pour la clé « retours » du projet (X25519 et AES-256-GCM, `sealReport`, en-tête `CPR1`) : le service garde des octets qu'il ne peut pas lire, et seule l'équipe les ouvre.
Hors ligne, il attend dans `<données>\retours\attente` et repart au démarrage, puis toutes les 30 minutes (vingt au plus, oubliés après 30 jours).

**Rapports de plantage automatiques.**
Au premier plantage de VPX, en quittant l'écran d'échec, une question : « Envoyer les rapports de plantage ? » (« Oui, à chaque plantage », « Non », « Décrire ce qui s'est passé », « Voir le contenu du rapport »).
La réponse est retenue dans `<données>\retours.json` et se change dans Retours et propositions.
Avec l'accord, chaque plantage de VPX, et ceux de Cyber Pinball (exception non rattrapée, plantage natif relevé au démarrage suivant), part seul, un même plantage une fois par jour au plus (`crashDue`).
Un plantage dont le rapport automatique est parti a sous l'erreur un encart 👌 « L'équipe a été prévenue » ; le flipper n'y ajoute plus que vos détails (« Ajouter des détails pour les développeurs »), le rapport technique ne repartant pas.

**Le service.**
Le Worker du projet, à `t.cyberpinball.com` (le même que l'adresse stable du téléphone), sur une base Cloudflare D1 (`packages/service-telephone/worker.mjs`, `schema.sql`) : `GET /api/propositions`, `POST /api/propositions`, `POST /api/votes` (corps signés, datés, jamais rejoués), `POST /api/rapports` (une boîte `CPR1` de 1,9 Mo au plus) ; la gestion (`/api/admin/…`) exige la signature de la clé « retours ».
Le même service tient `/api/soutiens` (les soutiens d'une proposition), `/api/noms` (le pseudo signé de chaque borne, qui nomme ses propositions et ses votes), `/api/nouveautes` (les réactions aux [Nouveautés](nouveautes.md#nouveautés)) et `/api/oubli` (l'effacement d'un compte supprimé).
Mise en ligne : `node scripts/service-telephone.mjs d1` (une fois), puis `deployer`.
L'équipe change l'état des propositions, y répond, masque ou regroupe les doublons (les voix du doublon passent à la cible, sans double voix) et lit les rapports avec la clé « retours », gardée hors du dépôt.

Code : [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts) (protocole, scellement, doublons, accord) ; [app/src/feedback-service.ts](../../app/src/feedback-service.ts) (le service vu de la borne, la file d'attente) ; [app/src/feedback-menu.ts](../../app/src/feedback-menu.ts) (les écrans).
[feedback.test.ts](../../packages/core/src/test/feedback.test.ts) et [retours-service.test.ts](../../packages/core/src/test/retours-service.test.ts) fixent le scellement, la signature, les doublons, l'accord, et que la borne et le service parlent le même protocole.
