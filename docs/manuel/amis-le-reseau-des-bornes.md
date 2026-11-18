[English](../manual/friends-the-cabinet-network.md) · Français · [Sommaire du manuel](../manuel.md)

## Amis : le réseau des bornes

Menu système > « Communauté » relie les bornes entre elles **sans serveur** : chacune trouve les autres et leur parle directement, par Internet ou sur le réseau local.
Le partage est **activé par défaut** ; « Partage et réseau » le coupe.

| Entrée | Ce qu'elle montre |
| --- | --- |
| Messages | Les conversations avec vos amis, la plus récente d'abord, puis les amis à qui vous n'avez pas encore écrit. La pastille rouge et « non lus » marquent ce qui attend. Start ouvre le fil d'un ami (voir « Messagerie » plus bas). |
| Mes amis | En ligne, puis hors ligne. Pour chacun : en partie et sur quelle table (en temps réel), dans le front-end, ou vu il y a combien de temps ; son dernier évènement (« Nouveau meilleur score sur … », « Badge reçu : … », « A joué à … »). Start ouvre son profil, le seul écran d'un joueur (voir « Profil public et « J'aime » » plus bas) : sa présence, sa bibliothèque, son niveau, ses badges, une seule liste d'activité, « Inviter à une partie en direct » (grisée, « Hors ligne », quand il ne l'est pas), « Voir sa bibliothèque », « Écrire un message », « Retirer de mes amis », « Bloquer … ». En tête, une invitation reçue ou la partie en direct en cours. |
| Mon avatar | La photo ou l'image que tous les joueurs voient à côté de votre nom : « Choisir une image sur ce PC… », « Chercher une image sur le web… », « Recadrer mon avatar », « Retirer mon avatar » (voir « Avatar des joueurs » plus bas). Sans avatar, vos initiales sur une teinte tirée de votre clé. |
| Mon profil public | Ce que voient les joueurs qui ne sont pas vos amis (niveau, badges, pays, amis, records, personnes invitées, groupes publics, activité récente), et qui a aimé chacun de vos records et badges. Pendant le premier mois, « Qui vous a fait découvrir Cyber Pinball ? » (voir « Personnes invitées » plus bas). Il se désactive ici (voir « Profil public et « J'aime » » plus bas). |
| Historique des parties | Les parties entre amis finies sur cette borne, de la plus récente à la plus ancienne, par jour : la table, l'heure, et dessous les joueurs avec leur rang et leur score. Une partie s'ouvre pour revoir son détail (voir « Historique des parties » plus bas). |
| Trouver un joueur | L'annuaire : « Chercher un nom… » (sans accents ni casse ; ou l'identifiant vu sur le profil d'un joueur, entier ou ses quatre premiers caractères), les bornes « À proximité (réseau local) » et celles « Vus récemment ». Start sur un joueur ouvre son profil : « Envoyer une demande d'ami », ou « Annuler la demande », « Accepter », « Refuser », et « Bloquer … ». |
| Demandes d'amis | Reçues (à valider, pastille rouge jusqu'à la roue dentée) et envoyées (« En attente : remise dès que sa borne sera en ligne »). |
| Mes badges | Les 56 badges, par famille, obtenus (avec leur date) ou à obtenir (avec leur progression) ; les badges secrets ne montrent que leur indice (voir [Niveaux et badges](niveaux-et-badges.md#niveaux-et-badges)). |
| Partage et réseau | Partage activé ou non, « Votre nom : Alexis » (avec l'identifiant de la borne), réseau local, bibliothèque partagée ou non, débit des téléchargements, pare-feu de Windows, ce que voient les autres, joueurs bloqués. La sélection s'ouvre sur « Retour » : un Start par mégarde ne coupe pas le partage. |
| Masquer les notifications pendant les parties | Désactivé par défaut : la connexion d'un ami, une demande de rejoindre une partie, les nouvelles de la partie entre amis s'affichent aussi pendant les parties, avec leur son (voir « Partout, même en partie » dans [Notifications de l'écran des tables](notifications-de-l-ecran-des-tables.md#notifications-de-lécran-des-tables)). Start bascule ; activé, rien ne s'affiche ni ne sonne pendant une partie, tout attend le front-end. |

**Identité.**
Chaque borne a une clé Ed25519, créée au premier démarrage et gardée dans `<données>\social.json` (avec les amis, les demandes, l'annuaire, les évènements et les badges ; jamais partagé).
Le nom (2 à 24 lettres, chiffres, espaces, `'`, `.`, `_`, `-`) est signé par cette clé ; l'identifiant du joueur (« A1B2-C3D4-E5F6-7890 », `playerId`, tiré de la clé) distingue deux joueurs du même nom.
Il ne s'affiche que sur le profil d'un joueur (ligne « Identifiant : … ») et dans « Partage et réseau » ; partout ailleurs (listes, amis, scores, partie en direct, titres), le nom s'affiche seul, avec l'avatar.
Une garde des tests (`noTag`, friends-menu.test.ts) refuse toute étiquette accolée à un nom.
Un `social.json` illisible est mis de côté (`social.json.illisible-<date>`), jamais écrasé.

**Supprimer son compte (RGPD).**
« Partage et réseau » > « Supprimer mon compte… » montre ce qui part (le compte et son identifiant, les amis, les demandes, les conversations, les salons, l'avatar, les scores publiés, le profil public, les propositions et votes du tableau des retours) et ce qui reste (les tables, leurs scores, les réglages, les sauvegardes déjà faites, qui contiennent le compte, à effacer dans Menu système > Cyber Pinball > Sauvegardes), le curseur sur « Annuler ».
« Supprimer définitivement mon compte » : le service des retours efface d'abord les propositions et les votes de la clé (`POST /api/oubli`, signé par elle ; injoignable, le joueur réessaie ou continue sans lui) ; un **avis d'oubli** signé par la clé (`forget` : la clé, l'heure) part vers les bornes reliées, avec « unfriend » vers les amis et les demandes, et le réseau s'arrête ; les fichiers du compte sont effacés (`social.json`, `avatars\`, `amis\messagerie.json`, `amis\salons.json`, `amis\profils.json`, `amis\records.json`, `amis\parties.json`, les classements reçus) ; Cyber Pinball redémarre avec une clé neuve.
Chaque borne qui reçoit l'avis vérifie sa signature, efface tout ce qui vient de cette clé (annuaire, amis, demandes, classements, carte publique, « J'aime », lignes de salon, conversation), refuse ce qui en reviendrait par un relais, garde l'avis dans `<données>\amis\oublis.json` (la clé seule, sans nom) et le relaie ; il est joint au bonjour de chaque liaison, pour les bornes qui étaient éteintes.
Modules : [forget.ts](../../packages/core/src/forget.ts), `app/src/account-delete.ts`.
Essais : [suppression-compte.test.ts](../../packages/core/src/test/suppression-compte.test.ts) (signature, effacement de chaque donnée, et entre deux bornes en 127.0.0.1 : l'avis efface le joueur et ses lignes) et `retours-service.test.ts` (propositions, votes, rejeu).

**Pseudo obligatoire au démarrage.**
Juste après l'assistant d'écrans de l'installation, le front-end ouvre l'écran « Votre profil de joueur » : « Choisir mon pseudo… » (clavier à l'écran, champ vide plutôt que le nom donné d'office « Joueur A1B2 »), « Mettre un avatar… » (l'écran « Mon avatar », voir « Avatar des joueurs ») et « Continuer », qui reprend le démarrage là où il en était (installer VPX, ajouter une table, la roue).
Le pseudo est obligatoire : tant qu'il n'est pas choisi, la ligne du pseudo affiche « à choisir », « Continuer » reste grisé, et « Continuer » comme Exit ne font que rappeler le pseudo, la sélection revenue sur « Choisir mon pseudo… ».
Le nom d'office retapé tel quel (« Joueur A1B2 », « Player A1B2 ») est refusé.
L'avatar reste facultatif.
Tant que la question se pose (voir « Personnes invitées » plus bas), une entrée facultative se glisse avant « Continuer » : « Qui vous a fait découvrir Cyber Pinball ? », qui devient « Découvert grâce à … » une fois un joueur choisi.
L'écran revient à chaque démarrage tant que le profil porte le nom d'office, même déjà vu et même avec un avatar ; un profil qui avait passé l'écran sans pseudo le retrouve donc au démarrage suivant.
Jamais en mode invité ni pendant un essai sans opérateur (sauf `CYBERPINBALL_PROFIL=1`), et après l'ouverture quand le démarrage arrive sur la roue.
La date de la première ouverture (`profileOffered` dans `social.json`) reste notée, pour mémoire.
Code : `app/src/profile-welcome.ts`, règle `profileWelcomeDue` de [packages/core/src/social.ts](../../packages/core/src/social.ts), test `packages/core/src/test/profile-welcome.test.ts`.

**Annuaire sans serveur.**
Toutes les bornes dont le partage est activé rejoignent un même sujet Hyperswarm (`cyberpinball/annuaire/1`, sur la DHT de Holepunch, nœuds d'amorçage `node1-3.hyperdht.org`).
À chaque connexion, deux bornes échangent leur profil et jusqu'à 200 profils vus : l'annuaire passe de borne en borne.
Un profil relayé n'entre que si sa signature est bonne ; le plus récent l'emporte ; un profil non revu depuis 60 jours sort.
« Vu il y a… » (annuaire, profil d'un joueur, classements) est la dernière fois que le joueur était en ligne : vu par cette borne (son bonjour, sa balise locale), ou par une borne qui le relaie, à la date qu'elle en donne (champ `seen` de chaque profil relayé, borné entre la date du profil signé et maintenant ; une borne plus ancienne qui ne l'envoie pas : la date du profil).
Recevoir un profil relayé ne le rajeunit jamais : jusqu'à la 0.1.11-essai.27, chaque relais remettait tous les profils reçus à l'heure de réception, si bien que tous les joueurs semblaient « vus » au même moment et qu'aucun ne sortait jamais de l'annuaire.
Les dates déjà faussées sont ramenées, une fois, à la dernière preuve sûre (date du profil, balise locale, dernière présence d'un ami, demande d'ami reçue ; `repairDirectorySeen`, marqueur `directorySeenChecked`).
Deux joueurs seulement se trouvent aussi bien que mille : la DHT est celle de tous les usagers de Holepunch.
Ils doivent seulement être allumés en même temps.

**Demande d'ami.**
Elle part dès que l'autre borne est joignable, sinon à sa prochaine connexion (la borne qui demande la rejoint par sa clé).
À chaque connexion, les deux bornes se redisent où elles en sont (ami : « accept » ; demande en cours : « request »), si bien qu'une acceptation ou un retrait faits pendant que l'autre était éteinte arrivent quand même.
Demandé des deux côtés : amis tout de suite.
Un refus est retenu 30 jours (la même demande reçoit « non » sans revenir à l'écran).
Bloquer retire le joueur de l'annuaire et coupe toute connexion avec sa borne.

**Présence et évènements.**
Les amis reçoivent : en ligne ou non, la table en cours dès que VPX l'affiche (titre, fabricant, année, identifiant VPS, jamais un chemin) et le retour au front-end ; les records entrés au tableau d'honneur à la fin de la partie (VPX n'enregistre le score qu'à la fin : le score pendant la bille n'est pas lisible), les parties d'au moins une minute et les badges gagnés.
Une borne qui se connecte reçoit les dix derniers évènements de chaque ami.

**Badges.**
Calculés d'après ce que les tables enregistrent déjà (parties et temps de jeu de chaque `.info`, records de `VPReg.stg`).
Au premier calcul, ceux que l'historique mérite sont donnés sans évènement : les amis ne voient « Badge reçu » que pour ce qui arrive ensuite ([badges.ts](../../packages/core/src/badges.ts)).

**Réseau local.**
Une balise de multidiffusion (`239.255.42.99:47999`, TTL 1, toutes les 5 s) annonce la borne ; les bornes voisines se relient par TCP chiffré (secret-stream, le même Noise que Hyperswarm), même sans Internet.
« À proximité » tant que la balise date de moins d'une minute.
La balise rejoint son groupe carte réseau par carte réseau (IPv4, hors bouclage), et de nouveau à chaque annonce : `addMembership` sans carte prend celle de la route par défaut et lève (`EHOSTUNREACH`, `ENODEV`) quand il n'y en a pas, borne démarrée avant son réseau, câble débranché, VPN qui prend la route.
Une carte refusée n'empêche pas les autres, et une carte qui arrive plus tard est prise à l'annonce suivante.
**Une panne du réseau local n'est jamais bloquante** : Internet continue, « Partage et réseau » dit « Réseau local : indisponible » avec sa raison (« aucune carte réseau connectée », ou l'erreur du système), « À proximité » la montre grisée, et un réseau local qui n'a pas pu s'ouvrir (port pris) est réessayé tout seul, 30 s puis le double à chaque échec, jusqu'à 5 min.
Un démarrage raté côté Internet referme tout ce qu'il avait ouvert et se réessaie au même rythme ; seul lui affiche « Réseau indisponible » et « Bloquant » dans « Mes amis ».

**Présence : en ligne, hors ligne, liste à jour.**
Un ami est en ligne tant qu'au moins une liaison saluée le relie à la borne, quelle qu'elle soit : Internet, réseau local, ou l'une qui remplace l'autre.
Saluée : son bonjour (« hello ») est arrivé sur cette liaison, donc les deux bornes s'y voient ; une connexion ouverte puis fermée avant le bonjour ne compte pas.
Quand sa dernière liaison tombe, il reste en ligne 15 s (tolérance) : Hyperswarm remplace une connexion en double en fermant l'ancienne avant de donner la nouvelle, et une borne qui se reconnecte le fait en quelques secondes.
Passé ce délai sans nouvelle liaison, il passe hors ligne, « vu » à la chute de sa dernière liaison, jamais à l'heure où on s'en aperçoit ; rien ne s'enregistre à la fermeture d'une connexion.
Chaque côté décide sur les mêmes liaisons, si bien que les deux bornes convergent : une liaison Internet muette 20 s (borne plantée, réseau changé) est fermée, une liaison locale a ses sondes TCP, et sur le réseau local, si la balise ne passe que dans un sens, la borne qui n'appelle pas d'habitude appelle après deux balises sans liaison locale (une liaison Internet ne dispense plus de la locale).
Un ami suivi sans liaison est redemandé à Hyperswarm toutes les 5 s pendant deux minutes après le démarrage ou un changement de réseau, puis toutes les 30 s : après quatre échecs (borne éteinte, réseau pas prêt au démarrage, connexions brèves), Hyperswarm attendait dix minutes avant de réessayer, et l'annuaire ne le lui rendait pas.
Ces délais sont tirés au hasard autour de leur valeur (de moitié à une fois et demie) : deux bornes qui s'appellent au même instant se gênent, car Hyperswarm garde chez la plus grande clé son propre appel encore en cours et coupe celui de l'autre, même quand cet appel va échouer (entrant bloqué chez l'autre) ; à rythme fixe, elles retombaient ensemble à chaque relance.
Un appel Internet coupé avant le bonjour, sans autre liaison, est relancé entre 0,3 et 1,5 s plus tard (six fois par minute au plus), sans attendre les 1 s, 5 s puis 15 s de Hyperswarm.
La liste dit si elle est sûre ([friendpresence.ts](../../packages/core/src/friendpresence.ts)) : « Recherche des amis… » au démarrage (30 s, ou jusqu'à ce que tous les amis soient là) et après un changement de réseau, « Mise à jour en cours… » pendant une tolérance, puis « Liste à jour : 1 ami en ligne », avec une barre qui va et vient tant qu'elle n'est pas sûre ; un ami hors ligne pendant une recherche est « Vu il y a 3 h · recherche en cours ».
Partout où la présence s'affiche : « Mes amis », le menu système (« 1 en ligne · recherche en cours »), « Jouer avec un ami », le profil d'un ami (« Relié par Internet et le réseau local »), la pastille de l'écran des tables (montrée même à zéro pendant la recherche, point évidé).
« Vient de se connecter » n'est pas annoncé pendant la recherche : c'est la borne qui arrive.
Journal (`data\logs\journal.txt`), pour les amis et les demandes seulement : chaque liaison ouverte ou fermée, par où, sa raison (« Duplicate connection », « connection timed out », « fin normale »), sa durée et ce qui reste ; « X en ligne » avec, pendant la recherche, le délai depuis son début (« 2.4 s après le début de la recherche ») ; « X hors ligne (dernière liaison fermée il y a 15 s) » ; la balise locale reçue d'un ami et son adresse ; un appel local impossible (pare-feu) une fois par cinq minutes ; un ami qu'Hyperswarm avait abandonné.

**Pare-feu de Windows.**
Sans règle, Windows afficherait son invite « Autoriser l'accès » au premier démarrage du réseau, à laquelle personne ne répond sur une borne sans souris.
L'installeur pose donc la règle « Cyber Pinball » (entrée, `CyberPinball.exe` seul, tous profils), avec l'autorisation de Windows (UAC), une seule fois et seulement si elle manque (section « Partage entre bornes : autoriser dans le pare-feu de Windows ») ; jamais en mise à jour (`/MAJ`), en silence (`/S`, sauf `/PAREFEU`) ni dans un bac à sable.
La désinstallation la retire.
Quand elle manque (lancé depuis les sources, `npm run deployer`, UAC refusé), « Partage et réseau » le dit et propose « Autoriser dans le pare-feu de Windows ».
Sans elle, les amis par Internet passent quand même (perçage de NAT sortant) ; le réseau local et les bornes qui appellent, moins bien.
Sous la même autorisation, une seconde règle, « Cyber Pinball VPX », **bloque** l'entrée pour VPX : l'inspector de VPX, qui donne l'état en direct des tables Stern SAM et l'image du DMD (scores des amis sur son écran de score) pendant une partie entre amis, écoute sur toutes les adresses ; avec cette règle, Windows n'affiche pas son invite pour VPX et le réseau local n'y entre pas, tandis que Cyber Pinball le lit par `127.0.0.1`, que le pare-feu ne filtre pas.
Tant qu'elle manque, l'inspector n'est jamais activé.
Elle suit la version de VPX : VPX est lancé par la jonction `emulators\vpx\current`, et Windows peut nommer le processus par le dossier réel de sa version ; la règle vise donc les deux chemins (`vpxFirewallPrograms`).
L'installeur la pose pour la version que l'application installera (`VPX_PAREFEU_REEL` et `VPX_PAREFEU_JONCTION`, d'après `version` et `executable` de `packages/installer/components.json`) ; sur une borne déjà installée et mise à jour par préversion, « Partage et réseau » propose « Autoriser dans le pare-feu de Windows », une seule demande pour les deux règles.
Quand VPX change de version (nouveau dossier, jonction déplacée), le chemin réel ne correspond plus : la règle est à reposer, relue avant chaque partie entre amis, et l'inspector reste éteint d'ici là.
« Partage et réseau » montre toujours la ligne « État en direct des tables Stern SAM » : « Prêt », ou grisée avec sa raison (VPX pas installé, règle à poser, VPX a changé de version, règle illisible).
La désinstallation retire aussi la règle de VPX si elle vise cette racine, sous la même demande.
Les commandes : [packages/core/src/firewall.ts](../../packages/core/src/firewall.ts), l'élévation : `app/src/firewall-rule.ts`, l'inspector proposé à la partie : `app/src/vpx-inspector.ts`.

**Pare-feu après une mise à jour.**
Après la mise à jour en 0.1.5, le réseau des bornes était bloqué, alors que l'autorisation avait été donnée avant.
Le journal des évènements du pare-feu de la borne (`Microsoft-Windows-Windows Firewall With Advanced Security/Firewall`) l'a montré : la règle posée par netsh n'existait pas ; il n'y avait que quatre règles « Query User », que Windows crée lui-même chaque fois que son invite « Autoriser l'accès » s'affiche (TCP et UDP, pour un seul profil de réseau, **bloquantes** tant que personne ne clique).
Windows les nomme d'après la description de l'exécutable, « Cyber Pinball » : le même nom que la nôtre, si bien que la lecture par nom (`netsh … show rule name="Cyber Pinball"`) les prenait pour une autorisation.
Une règle bloquante l'emporte toujours.
Et la règle de VPX, arrivée avec la 0.1.5, n'est posée par aucune mise à jour : la mise à jour légère n'exécute pas l'installeur, et l'installeur en mise à jour (`/MAJ`) ne demande jamais l'autorisation de Windows.
Le chemin de `CyberPinball.exe`, lui, ne change jamais (`<racine>\app`, remplacé sur place).
Depuis : la lecture se fait **par programme** (toute règle d'entrée qui vise l'exécutable, quel que soit son nom), par PowerShell, dont les valeurs ne dépendent pas de la langue de Windows (`firewallReadScript`, `appFirewallState`) : « bloqué » (une règle bloquante), « autorisé sur certains réseaux seulement », « absent », « autorisé » sur tous les réseaux.
La pose retire d'abord toute règle d'entrée sur l'exécutable, puis pose la sienne pour tous les profils ; pour VPX, l'entrée bloquée pour chaque dossier de version et pour la jonction `current`.
La même autorisation de Windows enregistre la tâche planifiée « Cyber Pinball pare-feu » (`firewallSetupScript`) : sans déclencheur, lancée par l'application seulement, hors de la session (S4U, droits d'administrateur, aucune fenêtre), sur un script figé encodé dans ses arguments, qui ne fait que reposer ces deux règles.
À chaque démarrage, et à celui qui suit une mise à jour complète ou légère, `app/src/firewall-guard.ts` lit les règles, écrit leur état au journal (« Pare-feu (après la mise à jour 0.1.5 → 0.1.6) : Cyber Pinball blocked, VPX missing, réparation automatique prête. »), et, si l'une manque ou ne correspond plus, lance la tâche : rien à valider, même sans souris.
Sans tâche (jamais autorisée sur ce poste) ou si la réparation n'a pas suffi, l'état reste visible avec sa raison : « Partage et réseau » (chaque règle, et « Réparation automatique du pare-feu : prête » ou « pas encore autorisée »), « Mes amis » (« Réseau des bornes bloqué par le pare-feu de Windows », les amis « Bloqué par le pare-feu » au lieu de « Hors ligne »), et, au démarrage qui suit une mise à jour, l'écran « Pare-feu de Windows », ouvert à l'écran des tables avec « Autoriser dans le pare-feu de Windows » sélectionné : une seule demande de Windows, jamais au milieu d'une partie.
Sinon, un constat en haut du front-end.
L'installeur retire lui aussi toute règle d'entrée sur l'exécutable avant de poser la sienne, et la désinstallation retire la tâche sous la même demande.
Les tests (`pare-feu-maj.test.ts`) simulent PowerShell, netsh et schtasks : jamais le vrai pare-feu du poste.

**Bibliothèque partagée.**
Activée par défaut entre amis : deux joueurs devenus amis voient chacun la bibliothèque de l'autre sans rien régler.
« Partage et réseau » > « Ne plus partager ma bibliothèque » la coupe, « Partager ma bibliothèque avec mes amis » la remet ; ce choix du joueur est gardé (`shareLibraryChosen`), et un `social.json` écrit avant ce défaut, qui portait « non » sans que personne l'ait choisi, est relu « partagée ».
L'écran rappelle de ne partager que ce qu'on a le droit de partager (captures d'œuvres, ROM et PuP-Packs restent à leurs ayants droit).
Les amis voient la liste des tables et, pour chacune, ses médias propres (ceux de `medias\` : logo, fronton, vidéos, règles, musique ; ni les médias communs de la borne ni l'image tirée du `.directb2s`).
Profil d'un ami > « Voir sa bibliothèque » : « Sur votre borne » (même jeu : identifiant VPS, ROM, ou titre et année ; « 2 manquants ») et « Absentes de votre borne ».
Une de ses tables : ses médias, « Déjà équipé » (votre table a déjà ce type de média, pas forcément le même fichier) ou « Manquant », puis « Récupérer les n médias manquants », « Récupérer les n médias » ou « Inviter … à jouer ».
La réception montre sa progression et s'annule (Exit) ; chaque fichier arrive dans `<données>\amis\recus\` et n'en sort que s'il a la taille et l'empreinte SHA-256 annoncées et des premiers octets qui disent un média de son type (les contrôles de l'import).
Il entre alors dans le brouillon de « Médias du jeu » de la table, avec sa provenance (« la borne de Bruno #A1B2 »), le curseur sur le premier média reçu (« Afficheur large reçu de Bruno : vérifiez-le, puis enregistrez. ») : on le voit, puis « Enregistrer » montre le plan avant d'écrire.
**Toute une table d'un ami.**
Une table qu'on n'a pas : « Récupérer toute la table » ; une table qu'on a déjà : « Choisir les parties de sa table ».
L'écran des parties demande à la borne de l'ami la liste de ses fichiers, rangés par partie du jeu (« Parties du jeu ») : table (le `.vpx`, le contenu du DMD et les scripts complémentaires), fronton, ROM, PuP-Pack, couleurs du DMD, sons, musique, point de vue, réglages propres, médias du front-end ; chaque partie avec son nombre de fichiers et son poids, et la vôtre en face quand vous l'avez.
L'écran s'ouvre dans la liste des parties, le curseur sur la première : chaque ligne dit en toutes lettres « Cochée » ou « Non cochée » (le titre compte « 3 cochées sur 4 »), et Start sur une partie la coche ou la décoche ; pour une table qu'on a déjà, cochée, la sienne remplace la vôtre, non cochée, vous gardez la vôtre.
Les flippers descendent de la dernière partie à « Récupérer les n parties cochées », puis à « Retour » ; le bandeau d'aide le dit dans la liste (« Start ou Entrée : cocher ou décocher la partie », `listStart` : tout écran dont la liste se coche le déclare), et MagnaSave passe de la liste aux actions et revient.
D'office : toutes ses parties que vous n'avez pas, sauf celles sous droits, décochées avec leur mention : la ROM (« l'œuvre du fabricant : à ne prendre que si vous en avez le droit ») et le PuP-Pack (« vidéos et musiques souvent tirées du jeu : à ne prendre que si vous en avez le droit »).
Une seule règle pour toute partie non cochée : sa ligne dit qu'elle est là et comment la cocher, « + Disponible : Start pour la cocher » (« … pour prendre la sienne à la place de la vôtre » quand vous l'avez), et pour la ROM et le PuP-Pack « ! Disponible, à cocher vous-même : Start, puis l'attestation de vos droits ».
Start sur l'une d'elles ouvre sa mention légale (« La ROM : vos droits », « Le PuP-Pack : vos droits ») : ce qu'elle est et à qui elle appartient, sa provenance (« Ce contenu vient directement de la borne de … : Cyber Pinball ne le fournit pas et ne vérifie pas vos droits. Vous en êtes seul responsable. »), puis l'engagement à cocher, « J'atteste avoir le droit de détenir ce contenu (par exemple la machine d'origine ou une licence) et je m'engage à respecter le droit d'auteur et les conditions d'utilisation de ses ayants droit. » (« J'atteste et je m'engage », « À cocher » puis « Cochée »).
« Prendre la ROM » ou « Prendre le PuP-Pack » ne fait rien tant qu'il n'est pas coché ; cochée, le curseur passe dessus, puis l'écran des parties revient sur la ligne de la ROM, « Cochée », « ✓ Droits attestés ».
Une partie demandée par une invitation n'est cochée d'office que si elle n'est pas sous droits.
L'attestation vaut pour cette table le temps de l'écran ; elle suit le téléchargement (`attested`, `attestedAt` dans sa fiche de la file), et un fichier d'une partie sous droits non attestée n'y entre jamais (`attestedTableFiles`).
La ROM proposée est celle que la table joue chez l'ami, où qu'elle soit : dans `pinmame\roms` de la table, ou seulement dans sa bibliothèque de ROM, trouvée par le dossier commun de PinMAME (`libraryRoms` de l'inventaire) ; elle arrive sous `pinmame\roms`, et le plan d'ajout la range dans votre bibliothèque.
Les alias de la table (`pinmame\alias.txt`, la ROM chargée sous un autre nom) font partie de la ROM : ils viennent avec elle, jamais sans elle.
Une table de l'ami qui demande une ROM que sa borne ne propose pas (version plus ancienne, ROM introuvable chez lui) le dit sous la liste, « ROM … : pas proposée par sa borne », avant toute réception.
Sous la liste, « Récupérer les n parties cochées » (le poids ; refusé s'il ne reste pas la place, plus 1 Gio, sur le lecteur des données).
**Une réception ne part qu'une fois** : elle porte une clé, la table et l'ami (`dedupe`), et tant qu'elle tourne, attend son ami, est en pause, ou est reçue sans être installée, rien ne la relance.
Elle se voit là où on l'a lancée : dans la bibliothèque de l'ami, la ligne de la table porte son état (« Réception en cours », « En attente de Bruno », « Reçue · à installer »), sa barre et « 42 % · 120 Mo sur 300 Mo · fichier 3 sur 14 · Start : voir la réception » ; Start y mène.
Sur la fiche de la table, « Voir la réception de la table » (ou « Installer la table reçue ») remplace « Récupérer toute la table », le curseur dessus, avec la même barre en tête ; de même « Voir la réception des médias ».
Le profil de l'ami l'ajoute à la ligne de sa bibliothèque (« 1 réception en cours »).
L'écran de la réception dit « Lancée à 14:02 : rien d'autre à faire » : elle continue si on le quitte, et Start sur la table revient ici sans la relancer ; « Continuer en arrière-plan » ramène à la table, « Annuler la réception » efface ce qui est reçu.
Reçue, l'écran dit « Reçue, pas encore installée » et propose d'abord **« Installer dans ma bibliothèque »** (le plan d'ajout de cette table) ; de même la fiche de la table et Téléchargements.
Une table reçue dont le plan a été annulé reste « Reçue · à installer » tant que son dossier est là, et « Récupérer de nouveau » est un choix explicite de cet écran.
Un rappel : une table contient un script que VPX exécute, à ne prendre que d'amis de confiance.
Les fichiers arrivent dans `<données>\amis\tables\<date>\<dossier de la table>\` sous leur chemin relatif, vérifié des deux côtés (jamais « .. », ni lecteur, ni chemin absolu, ni nom réservé de Windows, ni programme : `.exe`, `.dll`, `.bat`, `.ps1`, `.lnk`…), chacun avec sa taille et son empreinte SHA-256, calculée pendant l'envoi (un fichier de plusieurs gigaoctets n'est lu qu'une fois).
Jamais ne partent les sauvegardes, les records (`nvram`, `VPReg.stg`), les réglages de PinMAME ni les statistiques.
Puis le dossier passe par le plan d'ajout, comme une table téléchargée : nouvelle table, ou vers la vôtre (les parties prises remplacent les vôtres, à la corbeille) ; rien n'est rangé avant « Installer ».
Un fichier manquant à l'arrivée : rien n'est installé.
Une invitation à une partie en direct sur une table qu'on n'a pas propose « La récupérer chez … ».
« Trouver cette table dans le catalogue » reste là pour la prendre sur son site.
**Ce qui est annoncé est servi** : un média de la bibliothèque passe les contrôles de l'import dès l'annonce (`mediaRefusal`, gardé par fichier, taille et date), et celui qui les échoue n'est annoncé ni dans la bibliothèque ni dans les fichiers de sa table ; le journal le dit (« … n'est pas annoncé (le contenu ne correspond pas à son nom (.png)) »).
Si un fichier est tout de même refusé en route, tout fichier d'une table sauf son `.vpx` est facultatif : il est sauté avec sa raison exacte (« média refusé par les contrôles : … », « introuvable chez votre ami : … », « fichier abîmé ou changé : … »), le reste arrive, et l'écran de la réception comme Téléchargements disent « 1 fichier sauté ».
« Ne le partage plus » ne se dit plus que d'un ami qui a coupé son partage.
Ce qui circule ne porte aucun chemin de la borne : chaque table, chaque média et chaque fichier y a un identifiant opaque que seule la borne qui partage relie à un fichier ; seuls les amis peuvent les demander.

**Débit des téléchargements.**
« Partage et réseau » > « Limiter le débit des téléchargements… » : sans limite (par défaut), 256 ko/s, 512 ko/s, 1, 2, 5, 10 ou 20 Mo/s (chacun avec son équivalent en Mbit/s, l'unité des box).
La limite vaut pour tout ce que les amis envoient (tables, parties, médias), **tous envois confondus** : partagée à parts égales entre les réceptions en cours, jamais moins de 16 ko/s chacune.
C'est la borne qui envoie qui ralentit : elle seule pousse les morceaux, et freiner la réception bloquerait aussi la présence et les messages, qui passent par le même canal.
Le receveur donne son débit dans la demande (`file-get`, champ `rate`, en octets par seconde), puis le corrige en route (`file-rate`) quand la limite change ou qu'une autre réception commence ou finit ; l'envoi suit ce rythme en moyenne (`RatePacer`, un réveil en retard des minuteurs de Windows est rattrapé, avec au plus 250 ms d'avance).
Une borne d'avant ce réglage ignore les deux et envoie à pleine vitesse ; l'écran le dit.
Les téléchargements des sites et de VPinMediaDB ne sont pas concernés.
Gardé dans `<données>\social.json` (`downloadRate`, absent : sans limite).
Code : [packages/core/src/ratelimit.ts](../../packages/core/src/ratelimit.ts), `serveFile` et `fetchOne` dans `app/src/friend-content.ts` ; tests : [debit-amis.test.ts](../../packages/core/src/test/debit-amis.test.ts) (dont un vrai transfert de 640 ko à 256 ko/s entre deux bornes reliées en mémoire, et la limite levée en route).

**Partie en direct.**
Deux entrées.
Profil d'un ami > « Inviter à une partie en direct » : choisir une table (celles qu'il a dans la même version d'abord, voir « Choisir la table d'une partie en direct » plus bas).
Fiche d'une table > « Jouer avec un ami », juste sous « Jouer » : choisir l'ami (en ligne en tête, ceux qui ont la table dans la même version d'abord, les amis hors ligne grisés dessous).
Les deux restent visibles quand on ne peut pas inviter, grisées avec leur raison : « Hors ligne : invitez-le quand il sera connecté », « Aucun ami en ligne pour l'instant », « Pas encore d'ami : Menu système > Communauté > Trouver un joueur » ; un ami en partie s'invite aussi (« En partie : il recevra une notification discrète sur sa table »).
Un salon s'ouvre, l'invitation part ; jusqu'à quatre joueurs (« Inviter un autre ami »).
Chez l'ami, le carillon d'invitation sonne et « Invitation de … » s'ouvre d'elle-même sur l'écran des tables, dans le menu système et sur l'aide (par-dessus l'écran ouvert, que « Répondre plus tard » rend tel qu'il était), le curseur sur « Répondre plus tard » (avec le temps restant) : un bouton déjà appuyé n'accepte ni ne refuse ; sinon elle attend en tête de « Mes amis », deux minutes au plus.
La borne y vérifie qu'elle a la même version que celui qui invite, obligatoirement (un score sur lequel se défier, et plus tard des tournois) : le même `.vpx` (empreinte SHA-256, gardée dans `<données>\amis\empreintes.json`) et le même script joué.
Le script joué : celui de la table, ou le `.vbs` posé à côté d'elle quand il le remplace (VPX joue alors le `.vbs`) ; un `.vbs` modifié ou venu d'une autre version doit être le même chez tous, celui que Cyber Pinball pose lui-même (réparations PuP, propres à chaque borne) ne compte pas.
Pas la même version, pas d'« Accepter » : « Autre version de cette table » (ou « Même table, autre script », un `.vbs` à côté de la table), et « Récupérer sa version chez … » ouvre sa table dans sa bibliothèque partagée, la table cochée d'office, puis le plan d'ajout ; il ne reste qu'à demander une nouvelle invitation.
Chez celui qui invite : « N'a pas la même version : il peut récupérer la vôtre » ([meme-version.test.ts](../../packages/core/src/test/meme-version.test.ts)).
Le même `.vpx` se reconnaît sous un autre nom : l'invitation donne sa taille, la borne calcule l'empreinte de ses tables de cette taille.
Le journal dit ce qu'il a trouvé (« la même version », « une autre version : partie refusée », « le même .vpx, mais un autre script », « reconnue par l'empreinte de son .vpx »), ou « introuvable ici » avec le jeu cherché.
Une table récupérée chez un ami garde le nom qu'elle a chez lui : un `.info` à son titre, son fabricant, son année et son jeu VPS accompagne les fichiers reçus, et le plan d'ajout le prend avant le nom du jeu chez VPS ([meme-table-autre-nom.test.ts](../../packages/core/src/test/meme-table-autre-nom.test.ts)).
Le nombre de billes par partie compte aussi : connu des deux côtés et différent (5 contre 3), le score passe hors classement, « 5 billes au lieu de 3 » à l'invitation, au salon et aux résultats (« Autre nombre de billes : score hors classement ») ; inconnu d'un côté, il ne juge rien.
Il se lit, jamais deviné ([ballcount.ts](../../packages/core/src/ballcount.ts), [app/src/ball-count.ts](../../app/src/ball-count.ts)) : pour une table à ROM, le réglage « Balls Per Game » dans `<table>\pinmame\nvram\<rom>.nv` (sinon le dossier PinMAME commun), d'après la carte mémoire de cette ROM du projet [Pinball Memory Maps](https://github.com/tomlogic/pinball-memory-maps) (licence ODbL), téléchargée à la demande et gardée dans `<données>\cache\cartes-memoire` ; sans `.nv`, la table n'a pas encore tourné, la ROM part de son réglage d'usine (la valeur par défaut de la carte) ; une ROM dont la carte ne décrit pas ce réglage (Stern SAM : Star Trek, The Walking Dead) reste inconnue.
Sans ROM : « Const BallsPerGame = 3 » hors des procédures du script (GOTG, The Goonies, The Matrix), ou le menu de service des tables de VPW (Game of Thrones : « BALL PER GAME », la valeur choisie dans `VPReg.stg`, sinon celle par défaut).
Une table qui crée ses réglages en cours de route (2001) reste inconnue ([nombre-de-billes.test.ts](../../packages/core/src/test/nombre-de-billes.test.ts)).
Sans la table, seul « Refuser » reste, avec « Trouver cette table dans le catalogue ».
Celui qui invite lance la partie dès qu'un ami a accepté : « Départ commun » s'ouvre sur chaque borne, un grand chiffre de 5 à 1 au centre et les joueurs dessous (le curseur sur « Retour au front-end » : un Start pour se préparer ne quitte pas la partie, le départ reste prévu), puis la table se lance partout comme par Start.
Chacun joue sa propre partie sur sa borne : rien n'est commandé à distance.
Au retour, « Résultats » : les joueurs dont le score est entré au tableau d'honneur de la table, classés, leur score en avant (« Meilleur score connu ») ; les autres sans rang, « Score non disponible » (on ne classe pas un score inconnu) ; la durée de chacun ; « Autre nombre de billes : score hors classement » quand c'est le cas (ce score s'affiche sans rang).
L'écran se complète à mesure que les autres reviennent (quinze minutes au plus après le premier).
Celui qui invite peut « Rejouer avec les mêmes joueurs ».
Il tient la partie et renvoie le salon à tous ; les invités n'ont pas besoin d'être amis entre eux.
**Le double de la table** : une partie en direct ne touche jamais la mémoire de ROM, les records ni les réglages habituels du joueur.
VPX joue un double de la table, fait juste avant le lancement dans `<racine>\parties\<partie>\` (même disque que les tables) ([tabledouble.ts](../../packages/core/src/tabledouble.ts), [app/src/table-double.ts](../../app/src/table-double.ts)) : lié (lien physique, le même fichier sans place en plus) ce que rien n'écrit pendant une partie, le `.vpx`, le fronton, les ROM, les images, sons, vidéos et polices ; copié tout le reste, ce que VPX, PinMAME, PuP ou B2S peuvent écrire (`pinmame\nvram`, `pinmame\cfg`, `user\VPReg.stg`, `.ini`, `.xml`, `.vbs`, scripts de PuP) ; laissés `cache\` (VPX le refait) et `medias\`.
Une table qui joue sa ROM depuis le dossier PinMAME commun reçoit dans son double son propre `pinmame\roms` (liens) et une copie de sa mémoire, sinon PinMAME écrirait dans le dossier commun.
Les records de la partie se lisent dans le double, puis il est supprimé, sans jamais suivre un lien vers un dossier ; un double laissé par un plantage part au démarrage suivant.
Pas de double, pas de partie, jamais de repli sur le dossier habituel : table rangée avec d'autres, lien ou jonction dans son dossier, ROM introuvable, tables sur un autre disque ; l'écran le dit, « Votre table habituelle reste intacte : rien n'a été lancé ».
Le journal compare l'empreinte du dossier habituel (taille et date de chaque fichier) avant et après : « dossier de la table intact (N fichiers comparés) », ou ce qui a changé.
Le test fait jouer un faux VPX qui écrit partout où ces programmes écrivent, puis compare chaque octet ([double-de-table.test.ts](../../packages/core/src/test/double-de-table.test.ts)).
Mesuré sur une borne : Game of Thrones, 1853 liens et 19 copies en 3,8 s, aucun des 1881 fichiers changé.
**Les réglages de l'hôte** : tout le monde part du même état de machine, sans que Cyber Pinball ait à lire ni comprendre chaque réglage ([hostsettings.ts](../../packages/core/src/hostsettings.ts)).
Dès qu'un ami accepte, la borne de l'hôte lui envoie, pour chaque ROM de la table, sa mémoire (`pinmame\nvram\<rom>.nv` : billes par partie, sauvetage de bille, avertissements de tilt, billes en extra, records) et ses interrupteurs DIP (`pinmame\cfg\<rom>.cfg`), et les valeurs enregistrées par la table (`user\VPReg.stg` : le menu de service des tables de VPW, leurs records) ; un fichier que l'hôte n'a pas part « absent ».
Par morceaux de 96 Kio (un message entre bornes porte 256 Kio au plus ; la mémoire d'une ROM Stern SAM fait 128 Kio), chaque fichier vérifié par son empreinte SHA-256 ; l'invité dit à l'hôte s'il les a reçus entiers.
Au lancement, ils remplacent les copies du double de l'invité, et un fichier absent chez l'hôte en est retiré : les deux bornes partent alors des réglages d'usine.
Le dossier habituel de l'invité ne bouge pas.
Dans le salon : « Prêt, réglages de l'hôte reçus » ; « en route » tant qu'ils voyagent ; « non reçus : score hors classement » s'ils sont arrivés abîmés, trop gros (plus de 1 Mio par fichier), ou si la borne de l'invité a une version antérieure à cette fonction ; aux résultats, « Hors classement : réglages de l'hôte non reçus ».
Pour jouer à 5 billes, l'hôte règle sa propre table sur 5 avant d'inviter.
Les réglages propres à chaque borne ne voyagent pas : `default.cfg` de PinMAME, les options d'affichage et de son de la table (`.ini`) ([reglages-de-l-hote.test.ts](../../packages/core/src/test/reglages-de-l-hote.test.ts)).
**Le volume non plus** (décision du 16/11/2026) : chaque borne garde son niveau sonore, adapté à son lieu, que l'hôte joue plus fort ou moins fort.
Il vit pourtant dans ces mêmes fichiers ; dans le double de l'invité, chacun est celui de l'hôte avec le volume de l'invité ([volume-de-l-invite.test.ts](../../packages/core/src/test/volume-de-l-invite.test.ts)) : dans la mémoire de la ROM, les volumes que situe sa carte de Pinball Memory Maps (« Volume » des WPC, « Master Volume » des Stern SAM, volume du knocker…), leurs sommes de contrôle refaites (sans elles, la ROM remet le volume au démarrage : mesuré au banc libpinmame sur The Addams Family) ; à la fin du `.cfg`, les 25 niveaux de mixage de PinMAME ; dans `VPReg.stg`, les clés dont le nom dit un volume et celles que le menu de service de VPW intitule « … VOLUME » (`scriptVolumeKeys`).
Un invité qui n'a jamais joué la table garde le volume d'usine, comme chez lui.
Quand le volume ne se repose pas sûrement, c'est le fichier de l'invité qui reste, avec ses propres réglages de jeu : carte absente du cache, carte qui ne situe pas le volume (Whitestar, Data East, System 11…), somme de contrôle fausse, clé de volume que l'hôte n'a pas, fichier absent chez l'hôte alors que l'invité a réglé son volume.
Seules les machines dont le son se règle par un potentiomètre de la carte son (Bally, Williams System 4 à 9, Gottlieb System 1 et 80, Atari, Stern M-100 et M-200, Zaccaria, Taito…) reçoivent la mémoire de l'hôte entière.
Le journal dit, fichier par fichier, ce qui vient de l'hôte et ce qui est gardé : « réglages de l'hôte posés dans le double, volume de l'invité gardé : pinmame/nvram/taf_l7.nv : celui de l'hôte, volume de l'invité gardé (Volume) ; … ».
**Le tableau des records du groupe** : les scores des parties en direct classées, par version exacte de la table (même `.vpx`, même script), gardés par chaque borne qui a joué dans `<données>\amis\records.json`, vingt places ([groupboard.ts](../../packages/core/src/groupboard.ts)).
Le meilleur score de chaque joueur classé y entre, une fois par partie ; hors classement (réglages de l'hôte non reçus, autre nombre de billes), non.
Le salon montre « Record du groupe à battre : … » (ou « Pas encore de record du groupe sur cette version ») ; les résultats, « Records du groupe sur cette version », les cinq meilleurs.
Dans la partie, le tableau de la table est celui du groupe : avant le lancement, ses records sont posés dans le `VPReg.stg` du double, à la place de ceux de l'hôte, la dernière place laissée à zéro, pour que le score de chaque joueur y entre toujours et se lise au retour.
Seules les valeurs sont réécrites, sur place, dans la place déjà allouée à chacune : la structure du fichier, que VPX lit par Windows, ne change pas ; crédits et réglages (le nombre de billes de l'hôte) restent.
Le knocker ne sonne, entre amis, que pour le record du groupe battu ; ces records ne partent pas aux amis comme ceux d'une partie seule.
Une table à ROM (PinMAME : T2, Star Trek, The Walking Dead) garde son tableau dans la mémoire de la ROM : il est lu et écrit dans le `<rom>.nv` du double d'après la carte de cette ROM (Pinball Memory Maps, en cache dans `<données>\cache\cartes-memoire`), les copies en miroir et les sommes de contrôle refaites (une somme fausse, et la ROM remet ses records d'usine) ; puis tout est relu, et une seule somme fausse annule l'écriture ([romscores.ts](../../packages/core/src/romscores.ts)).
Vérifié sur les mémoires d'une borne : les 134 sommes de T2, 73 de Star Trek et 23 de The Walking Dead, justes selon ce calcul, le restent après l'écriture du tableau, seul changé.
Pas de carte pour la ROM, une carte sans `validation`, une mémoire en demi-octets : rien n'est posé ni lu, rien n'entre au tableau (« Aucun score classé pour l'instant »).
Sans `.nv` (l'hôte n'en a pas : réglages d'usine), la ROM part de ses records d'usine : un score plus bas que le dernier ne se lit pas ([tableau-du-groupe.test.ts](../../packages/core/src/test/tableau-du-groupe.test.ts), [records-rom.test.ts](../../packages/core/src/test/records-rom.test.ts)).
**L'état de jeu en direct** : pour les tables originales bâties sur le socle de script commun (Game of Thrones, GOTG, The Goonies, The Matrix : `Score()`, `CurrentPlayer`, `PlayersPlayingGame`, `BallsRemaining()`, `BallsPerGame`, `bGameInPlay`), le script du double reçoit un ajout, jamais celui de la table ([livestate.ts](../../packages/core/src/livestate.ts)).
Un élément que le script n'utilise jamais (un mur, une lampe ; ni son nom ni ses événements n'y paraissent) prête son minuteur intégré : quatre fois par seconde, le score, la bille et « partie en cours » vont dans `cyberpinball-etat.txt` du double.
La procédure `<table>_KeyDown` est enveloppée : le monnayeur est toujours ignoré ; Start et la barre de verrouillage, hors d'une partie en cours (pas d'autre partie après la nôtre) ; pendant la partie, Start passe (il valide les lettres des initiales de Game of Thrones), et un joueur ajouté par Start se voit dans le relevé : son score passe hors classement.
Le départ est automatique : la table prête, au « partez » du départ commun (plus bas), le script met un crédit puis appuie sur Start, et recommence s'il ne part pas (quatre fois au plus).
Pendant la partie, Cyber Pinball lit le relevé deux fois par seconde ; score et bille partent aux autres (au plus deux fois par seconde, tout de suite à une nouvelle bille), et la bande de la partie montre chaque joueur, son score et où il en est, le meilleur en tête en vert signal ([gamenotice.ts](../../packages/core/src/gamenotice.ts), `liveBoardView`).
**Sa place** : jamais en haut du plateau, et toujours une bande permanente visible (`liveBoardPlacement`).
L'automatique prend, dans l'ordre, le fronton, qu'il soit libre ou pris par la table (son B2S, son PuP-Pack : c'est le cas courant, la bande passe devant, discrète), sinon le topper, de même, sinon, en dernier recours, le bas du plateau ; les scores sur le DMD sont un réglage à part (« Scores sur le DMD », activé par défaut), en plus, jamais à la place ; le journal dit la place et pourquoi (« pourquoi : automatique : fronton (pris par la table, la bande passe devant), et sur le DMD quand il montre l'écran de score »), et « aucune place visible » si cela arrivait.
Le test [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) fixe l'invariant sur toutes les combinaisons d'écrans (plateau seul, + fronton, + DMD, + fronton et DMD, + topper, DMD sous le fronton), chaque écran pris ou non, DMD lisible ou non, quatre sens, un à quatre joueurs et chaque choix ; `packages\core\ecrans-simules\pincab.json` est la configuration d'un vrai PinCab.
**Sur le DMD**, seulement quand il montre l'écran de score de la table.
Le DMD que VPX ou PinMAME dessine ne s'écrit pas de l'extérieur (ni fenêtre à laquelle écrire, ni script commun aux tables à ROM), mais il se lit : pour une partie entre amis, l'inspector de VPX est activé dans la copie du `VPinballX.ini` du double (règle du pare-feu qui ferme VPX au réseau posée, lu par 127.0.0.1), qui donne les afficheurs (`/api/tree` : DMD de PinMAME, FlexDMD…) et une image à chaque changement (`/ws/display`) ([app/src/dmd-watch.ts](../../app/src/dmd-watch.ts)).
La règle de l'écran de score ([dmdscore.ts](../../packages/core/src/dmdscore.ts)) : une partie en cours selon le relevé (jamais l'attente, la fin de partie ni la saisie des initiales) ; un « écran », des images stables (0,4 s au moins, à 8 % de leur encre près) reliées par des transitions d'une seconde au plus et qui ne changent pas de plus de 45 % de leurs points de l'une à la suivante ; c'est l'écran de score quand son image change pendant que le score bouge (à 1,2 s près : le relevé a du retard), ou quand il a la mise en page d'un écran de score déjà reconnu dans les deux dernières minutes (le même, revenu après une animation, d'autres chiffres), ou, au repos (score immobile depuis 3 s), quand il revient ou reste 3,5 s (et, une fois l'écran de score vu en jeu, qu'il lui ressemble) ; calme depuis 1,5 s.
Un texte de mode, un choix à faire (bille retenue, score figé), le BONUS ne changent pas avec le score ni ne lui ressemblent : rien ne s'y pose.
Mesuré hors écran sur les ROM de la borne par la libpinmame : Terminator 2 montre son écran de score ~1 s, fait glisser son score ~0,5 s, puis le remontre ; bille en jeu, ses chiffres changent de 15 à 40 % de ses points à chaque coup, une animation, un BONUS ou un texte de 50 à 160 % ; Star Trek montre en jeu une scène animée au score en coin.
Au banc, avec cette règle, Terminator 2 joué (un coup toutes les 0,4 à 2,5 s) donne 12 passages en 170 s (un toutes les 12 s), tous sur l'écran de score, et Star Trek 8, jamais sur « BALL SAVED » ni sur une animation.
Les scores s'y posent alors 4 s, par-dessus, à sa place (celle de l'habillage FullDMD, sinon la zone du DMD), même police à points et même couleur que le DMD du front-end ; jusqu'à trois joueurs « PARTIE ENTRE AMIS » au-dessus, une ligne par joueur, nom et bille (« B2 », « FIN ») à gauche, score à droite, le joueur de la borne au plein éclat (`liveBoardDots`).
Toutes les 12 s tant que le DMD montre l'écran de score ; plus tôt, 10 s après le précédent, quand une bille du joueur finit, qu'un autre prend la tête ou finit sa partie ; jamais deux fois en moins de 10 s ; ils partent dès que le DMD montre autre chose (`LiveBoardFlash`).
Sans inspector (pare-feu de VPX non autorisé) ou sans relevé pour la table, rien sur le DMD, et le journal le dit.
Une table sans PinMAME (DMD de FlexDMD, The Goonies, The Matrix) : son image ne se lit jamais (l'inspector ferait dessiner sa scène hors du fil du script, ce qui arrête VPX) ; les scores y passent au même rythme d'après le relevé seul, partie en cours depuis 5 s et score bougé depuis moins de 8 s (bille en jeu : ni bille retenue, ni choix à faire), sans voir une animation, qu'un passage peut couvrir 4 s (`DmdSignalWatch`).
**Bilan au journal**, à chaque partie : « Scores sur le DMD : 9 passages en 112 s de partie (un toutes les 12 s) ; le reste du temps : écran de score, en attente du rythme 45 %, DMD : autre écran (animation, texte, choix à faire) 20 %… », ou « aucun passage en … ; pourquoi : … » (réglage désactivé, pas d'écran du DMD, DMD illisible et pourquoi : inspector injoignable, aucun DMD dans son arbre, flux fermé ; ou ce que la règle a vu, en part du temps).
Garde-fou (`LiveDmdTally`) : réglage activé et DMD présent, sans passage après 60 s de partie, le journal dit aussitôt pourquoi (« Scores sur le DMD : aucun passage après 60 s de partie ; pourquoi : … ») ; le test [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) fixe l'invariant (un passage, ou la raison) sur toutes les combinaisons de réglage, d'écran, de lecture et de DMD.
Un DMD matériel seul (ZeDMD, PIN2DMD) ne peut pas être recouvert.
**Sur le fronton**, libre ou pris par la table (son B2S, son PuP-Pack ; le journal dit lequel, d'après `occupiedRoles`, relu toutes les 2 s), en permanence : « Partie entre amis » puis une carte par joueur, côte à côte, nom, score en grand, « Bille 2 sur 3 » ; en bas du fronton, comme les compteurs d'un électromécanique, discrète (au plus un cinquième de sa hauteur, sans descendre sous la taille lisible : un fronton peu haut la rejetait sinon vers le plateau) ; sans fronton, au centre du topper.
Sans fronton ni topper, **un encart au bas du plateau**, dans le coin gauche pour le joueur, tourné avec le plateau : sur le tablier, sous la sortie des couloirs extérieurs, loin de l'écoulement et du couloir de lancement ; une ligne par joueur (nom, score, bille), au plus un dixième de la hauteur du plateau.
**Au choix du joueur** : Menu système > Communauté > « Scores des amis pendant la partie » ([app/src/live-scores-menu.ts](../../app/src/live-scores-menu.ts), gardé dans `<données>\amis\scores-en-partie.json`) : Automatique (ce qui précède), Sur le fronton (en bas, par-dessus son image, son B2S ou son PuP-Pack), Sur le topper (au centre, de même), En bas du plateau, Sur le côté du plateau (au milieu du bord gauche du joueur).
Chaque choix reste visible ; celui que la borne ne permet pas est grisé avec sa raison (pas d'écran de fronton, pas de topper).
À part, « Scores sur le DMD : activés » (par défaut) ou « désactivés » (plus rien sur le DMD), Start pour basculer ; grisé avec sa raison sans écran du DMD, ou tant que le pare-feu de VPX n'est pas autorisé (le DMD ne se lit pas).
Les réglages valent pour toutes les tables (le fichier prévoit un réglage par table, `tables`, pas encore proposé) ; une place qu'une table ne permet pas revient à l'automatique, et le journal dit pourquoi.
Il se fait hors partie : pendant la partie, les boutons sont à VPX, et Cyber Pinball n'a pas de menu par-dessus.
**Toujours devant** : les fenêtres de PuP, de B2S ou d'un DMD externe se remettent au premier plan permanent pendant la partie ; deux fois par seconde, la pile des fenêtres de Windows est relue, une fenêtre d'un autre processus passée devant la bande est notée au journal (« Bande de la partie entre amis recouverte par « … » (classe, processus) : remise devant », une fois ; « repasse sans cesse devant » si elle insiste), et la bande repasse devant (`overlayCoveredBy`), puis toutes les 40 ms tant que la fenêtre insiste (et 5 s après la dernière fois), sans jamais prendre le focus.
Mesuré hors écran (la vraie bande sur un fronton simulé, couvert par une fenêtre d'un autre processus au premier plan permanent) :devant un B2S (premier plan posé une fois), 100 % du temps ; devant un PuP-Pack qui se remet au premier plan toutes les 100 ms, 83 % (avant la remise devant rapide : 11 %).
Un réglage visuel n'est pas proposé pendant la partie : la place se règle ici.
Tests : [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) (écrans de `packages\core\ecrans-simules`, quatre sens, un à quatre joueurs, chaque choix, recouvrement, cadence) et [dmd-ecran-de-score.test.ts](../../packages/core/src/test/dmd-ecran-de-score.test.ts) (séquences dessinées).
La partie finie (les initiales saisies), VPX se ferme seul après 4 s ; le score final vient du relevé, il classe et entre au tableau du groupe même si personne n'a saisi ses initiales.
Une partie qui a tourné 20 s au moins compte comme jouée, même si VPX plante ou rend un code d'erreur en se fermant (« La partie n'a pas démarré de son côté » s'affichait après plusieurs minutes de jeu).
Vérifié sur les scripts réels de Game of Thrones, GOTG, The Goonies et The Matrix : complétés, ils se compilent (cscript, rien n'exécuté).
**Tables à ROM** (PinMAME) : l'état de jeu est dans la mémoire de la ROM.
Le relevé la lit par `Controller.NVRAM` (les octets mêmes du `.nv`), aux adresses de la section `game_state` de la carte de la ROM (Pinball Memory Maps, en cache dans `<données>\cache\cartes-memoire`) : scores, joueur en cours, bille, fin de partie, nombre de joueurs, et les billes par partie dans ses réglages (`romLivePlan`).
La carte et la mémoire sont celles du jeu que PinMAME charge vraiment : l'alias de la table (`pinmame\alias.txt`) remplace le nom demandé par le script, pour l'état de jeu comme pour les records du groupe, le nombre de billes et les réglages de l'hôte (`loadedRoms` ; Star Trek demande `st_162h` et charge `st_161h`, sa mémoire est `st_161h.nv`).
Les touches sont enveloppées comme pour les tables originales.
Relevé sur la libpinmame de la borne, sans écran ni son, avec la ROM de T2 (`t2_l8`) : au démarrage, la mémoire montre trois secondes la partie d'avant si VPX a été quitté en pleine partie, puis la ROM l'efface ; une partie ne compte donc qu'après le Start du relevé, et le départ attend la table en attente (deux secondes) ; le crédit passe par `vpmKeyDown` (pris 750 ms après), et Start est tenu une demi-seconde, deux secondes après le crédit (encore toutes les dix secondes, deux minutes au plus, s'il ne part pas).
La fin de partie arrive avant la saisie des initiales, et le score n'entre au tableau qu'après (jusqu'à une minute et demie plus tard) : tant qu'un score de la partie bat la dernière place sans y être, la partie reste en cours pour le relevé (Start passe et valide les lettres), deux minutes au plus ; puis VPX se ferme.
La mémoire est lue deux fois par seconde (toutes les deux secondes au-delà de 32 Ko : copier 128 Ko coûte environ 3 ms au script, sur le fil de VPX).
Williams WPC : toute la RAM est la NVRAM, tout s'y lit (Terminator 2).
Stern SAM (Star Trek, The Walking Dead) : scores, nombre de joueurs, billes par partie et tableau des records sont dans la NVRAM, mais la carte met joueur, bille et fin de partie en RAM principale, hors de portée du script ; le banc n'a trouvé dans la NVRAM aucun indicateur sûr de partie en cours, et un compteur de billes qui garde la bille d'une partie coupée jusqu'à la partie d'après.
Ces trois valeurs passent par l'inspector de VPX 10.8.1 : le module PinMAME de VPX lit une carte réduite posée dans le double (`pinmame\memmaps\index.json` et `cyberpinball.json`, sous le nom demandé par le script et sous celui que PinMAME charge), puis publie ces valeurs lues dans la mémoire du processeur ; l'inspector les sert en HTTP, et le relevé les lit par `127.0.0.1` (`/api/tree` pour leur numéro, `/api/states` pour leur valeur, 600 ms d'attente au plus : sans réponse, ce relevé est sauté).
Les valeurs y sont brutes : masque et inversion de la carte (fin de partie : octet d'état `& 0xFE` nul) s'appliquent dans le relevé.
L'inspector est activé pour la partie entre amis seulement, par une copie du `VPinballX.ini` de la borne posée dans le double (`[Plugin.Inspector]`, `Enable = 1`, un port libre de 2113 à 2122) et passée à VPX par `-Ini` ; le `VPinballX.ini` habituel n'est jamais touché, et ce que VPX change dans la copie pendant la partie part avec le double (le journal le dit).
Il écoute sur toutes les adresses, sans commande (dans cette version : `/info`, `/api/tree`, `/api/states`, images des afficheurs) : il n'est activé que si la règle « Cyber Pinball VPX » du pare-feu ferme VPX au réseau pour sa version active (voir Pare-feu de Windows) ; sinon le journal dit « pas de relevé de l'état de jeu (… ; l'inspector de VPX les lirait, s'il pouvait être activé ; règle du pare-feu de VPX absente…) » et la partie se joue comme avant.
Une table qui lit tout dans sa NVRAM (T2) ne l'utilise jamais.
La RAM principale est effacée au démarrage de la ROM : pas de partie d'avant à écarter ; le départ attend la table en attente, comme sur WPC.
Ce que seul l'essai sur la vraie borne confirmera : les adresses de la carte de Star Trek ont été mesurées par ses auteurs sur `st_161h` et `st_161hc` (la borne joue `st_161h`), celles de The Walking Dead sur `twd_160h` ; le banc ne lit pas la RAM principale de SAM.
Les cartes de The Walking Dead ne mettent « Balls Per Game » que dans `game_state` (`ball_count`) : il y est lu aussi, pour le relevé comme pour le nombre de billes du classement.
Vérifié : le script complété des deux versions de T2 de la borne se compile (cscript, rien d'exécuté) ; le relevé, exécuté par cscript sur les octets de la vraie mémoire de T2 relevés au banc pendant une partie, donne le départ, le score et la bille en direct, garde la partie pendant les initiales et la finit quand le score entre au tableau ([etat-en-direct.test.ts](../../packages/core/src/test/etat-en-direct.test.ts)).
**Le départ commun** : tout le monde part en même temps ; ensuite, peu importe qui finit le premier ([livestart.ts](../../packages/core/src/livestart.ts)).
Chaque borne lance VPX ; quand sa table est chargée et que son relevé répond (« pret=1 » dans `cyberpinball-etat.txt` : la table à l'écran depuis trois secondes, ou une table à ROM en attente depuis quatre relevés), elle dit « prêt » à l'hôte.
L'hôte donne « partez » quand tous les joueurs attendus sont prêts, et le salon le porte à chacun.
Chaque borne pose alors `cyberpinball-partez.txt` dans son double ; le relevé le cherche à chaque tour (un quart de seconde, une demi-seconde sur une table à ROM), et alors seulement met le crédit et appuie sur Start.
Un fichier plutôt qu'une touche envoyée à VPX : aucune fenêtre à viser ni focus à prendre, rien qui se perde si VPX est occupé, et le fichier reste là pour un relevé plus lent.
D'ici là, Start et le monnayeur restent bloqués : personne ne part seul.
Pendant l'attente, une carte au centre du plateau, dans son tiers haut (aucune bille n'est en jeu) : « En attente des joueurs », la raison (« En attente : Bruno — Chargement de la table… »), puis chaque joueur, une coche verte quand il est prêt, et son statut (Lancement de VPX…, Chargement de la table…, Prêt, A quitté la partie, Ancienne version : part sans attendre) ; au départ, « Partez ! » quatre secondes, et la bande de la partie prend la suite.
Ces quatre secondes se comptent depuis l'apparition de « Partez ! » à l'écran, jamais depuis l'heure du signal : sur une borne chargée, la fenêtre de la carte peut mettre plusieurs secondes à naître.
La carte se charge donc, cachée, dès le lancement de VPX, et paraît dès qu'il y a quelque chose à dire, même pour une attente d'un instant ; une borne ne se dit prête qu'une fois sa table à l'écran.
Le journal dit ce que le joueur a vu : « carte montrée 5.1 s en attente, « Partez ! » 4.0 s ».
L'écran de la partie en direct montre la même attente, et pour chacun « Prêt, en attente du départ commun ».
Les cas limites, chacun dit à l'écran.
Un joueur jamais prêt : dès le premier prêt, les autres ont 90 s (« Départ sans Bruno dans 45 s si sa table n'est pas prête ») ; puis « partez » sans lui plutôt qu'une annulation : ceux qui sont prêts ne perdent pas leur partie, et le retardataire, qui a déjà reçu « partez », part dès que sa table l'est (« Les autres sont déjà partis : à vous ! ») ; son score compte comme les autres.
Un joueur qui quitte VPX pendant l'attente, ou dont la partie n'a pas démarré, n'est plus attendu (« A quitté la partie »).
Une borne restée sur une version d'avant le départ commun ne dit jamais « prêt » : elle n'est pas attendue, sa table part dès qu'elle est chargée, et le salon le dit (« Cyber Pinball … sur sa borne : sa table part sans attendre les autres, à mettre à jour ») ; un invité dont l'hôte est dans ce cas part sans attendre, et sa table le dit.
Un hôte devenu muet (sa borne éteinte) : un invité prêt part seul deux minutes après (« Plus de nouvelles de … : votre table part seule »).
Une table sans relevé (ni socle commun ni carte de sa ROM) est prête dès qu'elle est à l'écran ; Start n'y est pas bloqué : la carte dit « Attendez « Partez ! » pour appuyer sur Start », puis « Partez ! » et « Appuyez sur Start ».
Le journal dit « ma table est prête », « « partez » donné (tous prêts) » ou « (sans …, pas prêts à temps) », puis « « partez » posé pour le relevé ».
Vérifié : la machine d'états (délais, départ, borne ancienne, hôte muet), le message entre bornes, deux bornes sur un réseau d'essai, et le relevé complété exécuté par cscript sur le socle commun et sur la mémoire de T2 : ni crédit ni Start avant le fichier, pas même ceux du joueur ([depart-commun.test.ts](../../packages/core/src/test/depart-commun.test.ts)).
**La version des bornes** : chaque borne annonce à l'invitation et à la réponse ce qu'elle sait faire (`LIVE_PROTOCOL` : 1 invitation et empreinte, 0.1.4 ; 2 réglages de l'hôte et tableau du groupe, 0.1.5-essai.8 ; 3 relevé en direct et départ automatique, 0.1.5-essai.13 ; 4 départ commun) et sa version de Cyber Pinball.
Une borne en retard se voit : dans le salon, « Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour » ; à l'invitation, « Ancienne version chez … » ; dans la bande, « Ancienne version : pas de score en direct ».
Aux résultats, chaque joueur a son score de la partie (lu en direct, sinon entré au tableau de la table) et son rang dans la partie, avec la raison d'un hors classement (plusieurs joueurs dans sa table, réglages de l'hôte non reçus, autre nombre de billes) ; plus jamais sa place au tableau de sa table, qui ne dit rien de la partie ([version-des-bornes.test.ts](../../packages/core/src/test/version-des-bornes.test.ts)).
**Invitation pendant une partie** : la borne ne répond plus « occupé », elle laisse le choix au joueur.
Le carillon sonne (un des sons de l'interface permis pendant la partie, voir [Sons de l'interface](medias-des-jeux.md#sons-de-linterface)), la notification d'une ligne « Bruno vous invite à rejoindre une partie » paraît avec lui (voir « Nouvelles de la partie »), et une carte discrète se pose par-dessus VPX, dans le coin du plateau en haut à gauche pour le joueur (le témoin d'un enregistrement tient le coin droit) : « Bruno vous invite à jouer », la table, le temps restant et « Quittez la partie pour le rejoindre, ou continuez : elle s'efface seule ».
Une fenêtre sans focus, que les clics traversent et qu'aucun enregistrement ne voit ([app/src/game-notice.ts](../../app/src/game-notice.ts), [gamenotice.ts](../../packages/core/src/gamenotice.ts)) : VPX garde la main.
Après 12 s, elle se réduit à une pastille « Invitation de Bruno » avec le temps restant, jusqu'à ce que l'invitation expire, soit annulée ou que la partie finisse.
Rien à faire pour l'ignorer ; quitter sa partie ramène au front-end, où l'invitation s'ouvre d'elle-même si elle vaut encore.
Seule une partie en direct déjà en cours répond « occupé ».
Dans le salon, celui qui invite lit « Invité, en partie : notifié sur sa table, il peut quitter la sienne pour vous rejoindre ».
Voir le score, la bille et le DMD des autres pendant la partie est l'étape suivante, à décider en maquette.

**Nouvelles de la partie.**
Hors de l'écran de la partie (à l'écran des tables, dans le menu système, pendant n'importe quelle partie), une notification d'une ligne dit tout de suite qu'un ami invite à rejoindre une partie, qu'un invité accepte ou décline, et pourquoi, qu'un joueur quitte la partie, que celui qui invite l'annule, ou que la partie est finie pour tous quand on a fini la sienne avant les autres : le gagnant, sa place, où sont les résultats ; un ami qui se connecte aussi (voir « Partie entre amis » et « Partout, même en partie » dans [Notifications de l'écran des tables](notifications-de-l-ecran-des-tables.md#notifications-de-lécran-des-tables)).
Pendant une partie, elle se pose par-dessus VPX, dans le coin du plateau en haut à gauche pour le joueur, tournée avec lui dans le sens où VPX dessine vraiment la table (`played`, [gameorientation.ts](../../packages/core/src/gameorientation.ts) ; la même règle place la bande et la carte du départ), 720 × 76 px sur un plateau de 1 080 px de petit côté, sous la carte d'une invitation si elle est là, jamais sur la carte du départ commun ; une fenêtre sans focus, que les clics traversent et qu'aucun enregistrement ne voit, remise devant si une fenêtre de VPX passe dessus ([app/src/game-notice.ts](../../app/src/game-notice.ts), `line` ; `GAME_NOTICE_LINE`).
Pendant la partie entre amis elle-même, la bande garde ce qu'elle montre (qui a fini, qui a quitté) ; une invitation ne peut pas y arriver (la borne répond « occupé »), un ami qui se connecte, si.
Au retour au front-end, les résultats pas encore vus s'ouvrent d'eux-mêmes.

**Fins d'invitation, aux deux bornes**.
Chaque fin d'invitation est dite aux deux bornes, et leurs écrans s'y adaptent : acceptée, refusée (avec sa raison : pas cette table, pas la même version, occupé), annulée par celui qui invite, partie lancée sans l'invité, changée de table, expirée (deux minutes), un ami passé hors ligne (après la tolérance de présence).
Chez celui qui invite, le salon met en tête chaque réponse des 30 dernières secondes, « Bruno a refusé votre invitation » · « Sa place est libérée : invitez un autre ami, ou changez de table » (ou « Bruno a accepté votre invitation », « Bruno est passé hors ligne : invitation retirée », « Pas de réponse de Bruno en deux minutes »), avec le tintement, même salon ouvert ; ailleurs, la notification le dit.
Chez l'invité, l'écran de la décision passe à « Invitation annulée par Bruno » (ou « Bruno a lancé la partie sans vous », « Invitation expirée », « Bruno est passé hors ligne », « Bruno a changé de table » avec « Voir la nouvelle invitation »), avec « Retour » ; la notification d'invitation déjà affichée part, et une autre dit la fin (« Bruno a annulé son invitation », tintement) quand l'écran n'est pas ouvert ; pendant une partie, la carte sur le plateau se ferme et la ligne le dit.
Un message perdu ne laisse personne attendre : la réponse de l'invité repart à chaque renvoi de l'invitation (toutes les 10 s) ; la fin dite par celui qui invite (`game-cancel` et sa raison, `why`) repart toutes les 3 s jusqu'à son accusé de réception (`game-cancel-ok`), deux minutes au plus, et attend le retour d'un invité hors ligne ; une acceptation arrivée trop tard reçoit cette fin en retour (`lateAnswerEnd`), plutôt que d'attendre un départ qui ne viendra pas.
Chacun constate aussi seul l'expiration et le départ de l'autre hors ligne.
Une borne d'avant comprend toujours l'annulation (sans raison).
Réinvité après un refus, dans le même salon, c'est une nouvelle invitation : son numéro (`round`) est dans la clé de sa notification.
Le journal dit chaque fin (« invitation de Bruno (« … ») terminée : cancelled », « fin de l'invitation dite à Poste (expired) », « reçue par Poste », « a répondu « decline » »).
Tests : [fins-d-invitation.test.ts](../../packages/core/src/test/fins-d-invitation.test.ts) (le service réel sur deux bornes et un réseau d'essai qui perd un message : chaque fin arrive aux deux côtés).

**Départ commun fiable, tables sans relevé.**
Sur une connexion instable, « Partez ! » pouvait rester 90 s sur une borne et sans fin sur l'autre, et aucun score n'était compté.
La carte de l'attente part désormais d'elle-même : « Partez ! » s'efface 4 s après être apparu, et aucune carte ne reste plus de 2 min 20 s, même si plus aucun message n'arrive (`liveWaitCardEnd`) ; le service porte aussi la fin de l'attente à l'écran, au tour qui suit (`live-game.ts`).
Un message du départ perdu pendant une coupure est renvoyé : l'hôte renvoie la salle (« partez » compris) toutes les 3 s pendant la partie, et tout de suite à un invité revenu en ligne ; l'invité renvoie son état (« prêt », sa partie finie) tant que la salle de l'hôte ne le montre pas (`liveStatusBehind`) ; un message de départ perdu est rattrapé par la salle, qui dit le temps restant (`startIn`).
Une table sans relevé de l'état de jeu (script hors du socle commun, ROM dont la carte manque, inspector de VPX impossible) n'a ni départ automatique, ni score en direct, ni fin de partie vue par Cyber Pinball : c'est dit avant la partie, dans le choix de la table (« Départ manuel »), dans le salon et dans l'invitation, avec la raison (`liveStateSupport`, le même calcul que le double) ; elle reste jouable.
Sur la table, la carte dit d'appuyer sur Start à « Partez ! » et de quitter la table à la fin de sa partie.
Le score compte s'il est entré au tableau d'honneur de la table (lu dans le double à la fermeture) ; sinon les résultats disent « Score non lu : table sans relevé, et score pas entré à son tableau d'honneur », sans rang.
Une erreur après la partie (une écriture refusée) ne fait plus perdre le résultat : il part quand même vers l'hôte.
Le journal dit chaque message du départ envoyé, reçu ou renvoyé (« Départ commun : … »), chaque vue de la carte (« Départ commun, carte : « titre — raison » ») et pourquoi elle est partie (« « Partez ! » lu », « restée trop longtemps », « plus d'attente », « fin de la partie »).

**Parties à la suite, tables originales.**
Une partie sur Terminator 2, puis sur The Goonies et The Matrix, pouvait rester sur « Chargement de la table… » sans fin pour les deux joueurs.
Ces tables originales (socle commun) ne posent joueur, nombre de joueurs et scores qu'au Start : avant, le relevé les écrivait vides (`joueurs=;joueur=;…;score=;pret=1`), la ligne était illisible, et « prêt » ne se lisait jamais ; personne n'étant prêt, le délai des derniers ne commençait pas.
Le relevé écrit désormais toujours des nombres (`CyberPinball_N`, 0 tant que le script n'a rien posé), et sa lecture accepte ces vides avant la partie (`parseLiveState`), jamais pendant.
Garde-fou : une table à l'écran depuis 20 s sans « prêt » du relevé se dit prête quand même, et le journal dit pourquoi (« Départ commun (…) : table à l'écran depuis 20 s, le relevé ne dit pas « prêt » (sa dernière ligne) : prête quand même ») ; le relevé garde ses trois secondes avant le crédit et Start.
Une attente où personne ne se dit prêt finit aussi : « partez » au plus tard 1 min 50 s après le lancement.
Tout ce que le service retient d'une partie (état envoyé, renvois, départ manuel, « partez » porté à chacun) est rangé sous son identifiant et meurt avec elle ; le lancement prévu ne vaut que pour sa partie, et un départ, une salle ou un état d'une autre partie sont ignorés.
Avant le départ aussi, rien ne dépend d'un message unique : l'hôte renvoie l'invitation toutes les 10 s tant que l'invité n'a pas répondu ; une invitation déjà reçue ne sonne pas deux fois, et celle à laquelle on a répondu fait repartir la même réponse (chaque invitation voulue a son numéro, `round` : un ami invité de nouveau après un refus voit la nouvelle).
Le journal dit chaque invitation reçue, renvoyée, ou refusée d'office (« déjà dans la partie … »).

**VPX arrêté en pleine partie, DMD de FlexDMD.**
Pendant une partie entre amis sur The Goonies, VPX s'arrêtait en cours de jeu : « La partie n'a pas pu se dérouler », « VPX s'est terminé avec le code 3221226356 » (0xC0000374, corruption du tas), après « Actor Ball not found in children of » et « Runtime error on line 9781, col 2: Objet requis: 'FlexDMD.Stage.GetLabel(...)' ».
La cause était Cyber Pinball : pour poser les scores des amis sur l'écran de score du DMD, il lisait le DMD par l'inspector de VPX.
Le serveur de l'inspector tourne sur son propre fil et demande une image toutes les 10 ms ; pour FlexDMD, chaque image demandée fait dessiner toute la scène (`GetRenderFrame` → `FlexDMD::Render`, mise à jour et dessin des éléments), sur ce fil-là, pendant que le script de la table modifie la même scène sur le sien, sans verrou (`LockRenderThread` n'est qu'un compteur ; sources de VPX 10.8.1, commit af26b2d93).
La scène s'abîme, le script ne trouve plus son élément, VPX se ferme.
Désormais l'inspector ne lit que le DMD de PinMAME, dont l'image est déjà calculée par l'émulation (`inspectorDisplayReadable`) : une table sans PinMAME n'active plus l'inspector pour le DMD, et un DMD de FlexDMD ou d'UltraDMD trouvé dans l'arbre n'est jamais lu (le journal le dit ; la bande reste sur le fronton).
Ni le relevé (ajouté à la fin du script, minuteur d'un élément de la table), ni les interrupteurs du PuP-Pack, ni la reconnaissance PupCapture (lecture de `FlexDMD.DmdPixels` dans le fil du script) ne dessinent la scène d'un autre fil.
Pour toute table, un arrêt de VPX se lit maintenant dans la fin de son journal (`diagnoseVpxFailure`) : l'erreur du script (exécution ou compilation, ligne, colonne, message, la ligne en faute citée depuis le script de la table, l'élément FlexDMD introuvable juste avant) et le code de sortie de Windows nommé (0xC0000374, 0xC0000005…).
L'écran d'échec dit cette raison (« Le script de la table s'est arrêté », « VPX s'est arrêté pendant la partie ») et, rien ne manquant, Start rejoue la table au lieu d'ouvrir « Ce qu'il manque pour jouer » ; en partie entre amis, Start ouvre la partie, que les autres continuent, et le score compte jusqu'à l'arrêt.
Le journal de Cyber Pinball en garde une ligne : « VPX arrêté (fichier) : erreur du script ligne …, VPX fermé (0x…) ».
Un joueur dont VPX s'arrête avant 20 s de jeu apparaît « VPX s'est arrêté pendant sa partie », distinct d'une partie jamais démarrée.

**Historique des parties.**
Menu système > Communauté > « Historique des parties » : chaque partie en direct finie sur cette borne, de la plus récente à la plus ancienne, rangées par jour (« Vendredi 30 octobre 2026 ») ; pour chacune, la table en titre, l'heure du départ, et dessous les joueurs avec leur rang et leur score (« 1. Bruno 2 841 350 120 · 2. Alexis (vous) 1 000 000 · Chloé 9 999, hors classement »).
Une partie que vous avez gagnée porte une étoile.
Choisir une partie ouvre son détail : la version de la table et son nombre de billes, l'hôte, puis chaque joueur, son rang et son score (« Meilleur score »), pourquoi il était hors classement (réglages de l'hôte non reçus, autre nombre de billes, plus d'un joueur dans sa table), la place prise au tableau d'honneur de la table et la durée jouée ; sans score, « Score non disponible » et ce qui lui est arrivé (« La partie n'a pas démarré de son côté », « A quitté la partie », « Résultat pas arrivé à temps », ou pour une borne en retard « Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour » : la version de chaque borne est gardée).
Retour ramène la liste, le curseur sur cette partie.
Chaque borne garde les parties qu'elle a jouées, hôte comme invitée, une fois chacune, dans `<données>\amis\parties.json` ; les parties d'avant cette version n'y sont pas ([gamehistory.ts](../../packages/core/src/gamehistory.ts), [app/src/game-history-menu.ts](../../app/src/game-history-menu.ts)).
Le format prépare les classements à venir (groupe d'amis, puis national et mondial), sans les construire : chaque joueur y est désigné par la clé publique de sa borne (son nom n'est qu'un affichage), la version exacte de la table y est (même `.vpx`, même script : seuls ces scores se comparent), chaque score dit s'il comptait et pourquoi, et un numéro de format (`v`) laisse ajouter des champs sans perdre les parties gardées ; un format plus récent que celui de la borne est montré, jamais réécrit.
Un fichier illisible n'est jamais écrasé : il est mis de côté (`parties.illisible-<date>.json`), l'historique repart vide et le journal le dit ; de même pour `records.json`, le tableau du groupe ([historique-des-parties.test.ts](../../packages/core/src/test/historique-des-parties.test.ts)).

**Ce que voient les autres.**
Tous : le nom et l'avatar.
Les amis : la présence, la table en cours, les records, les badges, les parties, et la bibliothèque si elle est partagée (ses tables, leurs parties et leurs médias ; une ROM ou un PuP-Pack seulement si l'ami les coche en attestant en avoir le droit).
Les bornes reliées voient l'adresse IP, comme dans tout échange de pair à pair.

**Essais.**
Jamais le vrai réseau pendant un essai : `socialNetMode` coupe le réseau dès qu'une variable d'essai est là (autopilote, captures, endurance, bac à sable `CYBERPINBALL_HOME`, écrans simulés), sauf `CYBERPINBALL_RESEAU=simule` : un réseau d'essai HyperDHT dans le processus et un réseau local en mémoire, sur 127.0.0.1 seulement, avec une règle de pare-feu simulée.
`CYBERPINBALL_RESEAU=non` coupe aussi en usage normal.

Code : les décisions dans [packages/core/src/social.ts](../../packages/core/src/social.ts) (profil, messages, annuaire, amitié, évènements), [friendlibrary.ts](../../packages/core/src/friendlibrary.ts) (bibliothèque partagée, messages des fichiers) et [livegame.ts](../../packages/core/src/livegame.ts) (invitation, salon, départ, résultats), le transport dans `app/src/social-net.ts` (seul module qui ouvre des sockets), les services dans `app/src/friend-content.ts` et `app/src/live-game.ts`, les écrans dans `app/src/friends-menu.ts`, `app/src/profile-menu.ts` (le profil d'un joueur), `app/src/friend-library-menu.ts` et `app/src/live-game-menu.ts`.
Le nom d'un joueur suit toujours son profil signé le plus récent, d'où qu'il vienne (bonjour, annuaire relayé, balise), jamais un plus ancien (`learnProfiles`, `renamePeer`).
Preuves : [social.test.ts](../../packages/core/src/test/social.test.ts) (noms, signatures, messages piégés, annuaire, règles d'amitié des deux côtés, badges, mode du réseau), [social-net.test.ts](../../packages/core/src/test/social-net.test.ts) (deux bornes sur un réseau d'essai : annuaire, demande, acceptation même borne éteinte, présence, record, retrait, réseau local sans Internet, blocage ; réseau local en panne au démarrage, Internet qui tourne quand même et le local réessayé ; balise qui ne lève pas sur une carte refusée ou absente ; aucune socket hors de 127.0.0.1 ; aucun autre module ne charge Hyperswarm, `net` ou `dgram`), [firewall.test.ts](../../packages/core/src/test/firewall.test.ts) (lecture de netsh dans toutes les langues, même règle dans l'installeur, jamais en mise à jour, en silence ni en bac à sable), [friend-services.test.ts](../../packages/core/src/test/friend-services.test.ts) (bibliothèque partagée par défaut et refusée une fois coupée, médias reçus identiques à l'octet, identifiant inconnu refusé, table entière partie par partie sans sauvegardes ni programme ni ROM pas prise, chemin piégé refusé, partie en direct de l'invitation aux résultats), [friends-menu.test.ts](../../packages/core/src/test/friends-menu.test.ts) (chaque écran, partage par défaut, chaque partie d'une table menant à sa propre action et la ROM décochée, curseur du compte à rebours, invitation grisée avec sa raison et « Jouer avec un ami »), [invitation-en-partie.test.ts](../../packages/core/src/test/invitation-en-partie.test.ts) (invitation reçue pendant une partie : gardée, jamais « occupé » ; carte puis pastille, coin du plateau dans les quatre sens, fenêtre sans focus ni capture, ouverte au retour au front-end).

**Limites.**
Le score pendant la partie n'est pas lu (VPX ne l'enregistre qu'à la fin) : une partie en direct ne compare que les records entrés au tableau d'honneur et les durées.
Un fichier à la fois par ami ; un transfert coupé reprend là où il s'était arrêté, dès que l'ami revient (voir « Gestionnaire de téléchargements »).
L'annuaire ne connaît que les bornes vues depuis le démarrage du partage ; deux joueurs doivent être allumés en même temps pour se trouver, et derrière deux NAT symétriques (CGNAT, partage 4G) sans troisième borne pour relayer, la connexion peut échouer.
La pose réelle de la règle du pare-feu (UAC) n'a été essayée que dans son principe, jamais sur le vrai pare-feu du poste de développement.

### Choisir la table d'une partie en direct

Le choix de la table tient compte des invités **avant** l'invitation (`packages/core/src/livechoice.ts`).

- **En tête, « Même version chez tous »** : les tables que chaque invité a dans la version strictement identique, jugée exactement comme à l'acceptation (`matchLiveTable`) : le même `.vpx` (empreinte SHA-256) et le même script joué.
  Le détail dit avec qui : « Même version chez Bruno ».
- **« À vérifier »** : une borne qui ne dit pas ses versions est signalée, pas refusée ; la table reste choisissable, la vérification à l'acceptation tranche.
  Raisons : « Bibliothèque de Bruno inconnue (ancienne version de Cyber Pinball) », « … (il ne la partage pas) », « Bibliothèque de Bruno demandée à sa borne… », « … injoignable pour l'instant », « Version de Bruno en cours de vérification… » (une empreinte qui se calcule, chez lui ou ici).
- **« Indisponibles »**, grisées, jamais cachées, avec qui bloque : « Autre version chez Bruno » (ou « Même table, autre script chez Bruno »), puis « Bruno n'a pas cette table ».
  Start sur une autre version ouvre les parties de sa table dans sa bibliothèque partagée, la table cochée d'office (« Start : récupérer sa version chez Bruno ») ; sur une table absente, rien.
- **Plusieurs invités** : une table est jouable si elle l'est chez tous ; la raison nomme chacun de ceux qui bloquent.
  On y arrive par « Changer de table » dans le salon (les invités reçoivent une nouvelle invitation, l'ancien salon est annulé et ils en sont prévenus) et par « Autre table, mêmes joueurs » aux résultats.
- **Choisir l'ami d'une table** (« Jouer avec un ami », « Inviter un autre ami » dans le salon) suit la même règle : ceux qui ont la même version en tête, les autres grisés avec leur raison.

**Ce que la borne de l'ami dit de ses tables.**
Sa bibliothèque partagée porte, pour chaque table, la taille du `.vpx` et l'annonce `versions` : sa borne sait donner leur version stricte.
Celui qui invite demande (`table-versions-get`) la version des seules tables qui peuvent être les siennes, le même jeu ou un `.vpx` de la même taille (le même fichier sous un autre nom) ; la borne de l'ami calcule l'empreinte de celles-là seulement, une fois par fichier (`<données>\amis\empreintes.json`), et répond table par table (`table-versions`).
Une borne d'une version plus ancienne n'annonce pas `versions` et ignore la demande : ses tables passent « À vérifier ».
La vérification à l'acceptation reste le filet de sécurité : une table changée entre-temps est refusée là, comme avant.

### Messagerie

Menu système > Communauté > « Messages », ou « Écrire un message » sur le profil d'un ami.
On écrit **entre amis seulement**, sans serveur : les messages passent directement d'une borne à l'autre, sur la même connexion chiffrée que la présence, et restent sur les deux bornes.

**Le fil d'un ami.**
Ses messages à gauche, les vôtres à droite, et au centre les évènements de l'amitié dessinés par la borne (un record, un badge).
Les flippers choisissent un message, Start ouvre « Répondre », MagnaSave passe à l'ami précédent ou suivant, Exit sort du fil vers ses actions : « Écrire un message… », « Réponse rapide… », « Options de la conversation », « Voir son profil ».

**Répondre aux boutons.**
« Répondre » propose sept réactions par emoji posées sur le message choisi (👍 J'aime, ❤️ J'adore, 🥰 Solidaire, 😆 Haha, 😮 Waouh, 😢 Triste, 😡 Grrr, les mêmes que dans les salons ; Start de nouveau sur la sienne la retire ; une réaction d'avant, Bravo ou TILT !, reste affichée), six phrases toutes prêtes, et « Écrire un message… » : le clavier à l'écran, ou le téléphone appairé, dont le texte s'écrit en direct dans le champ. 500 caractères au plus.
Au bureau, le vrai clavier écrit directement.

**Clavier à l'écran : position et emojis.**
Le texte a un point d'insertion : les touches ◀ ▶ du clavier à l'écran le déplacent, comme les flèches gauche et droite, Début et Fin d'un vrai clavier (sauf si ces flèches sont les boutons de la borne) ; une lettre, Effacer et Suppr agissent là.
Un emoji compte pour un caractère.
La touche 😀 ouvre le panneau des emojis à côté des touches (dessous sur un écran en hauteur), jamais sur le texte : quarante emojis et « Lettres » pour revenir ; les flippers le parcourent tant qu'il est ouvert.
Au bureau, le panneau de Windows (Win + point) écrit aussi dans le champ.
Pas d'emoji dans un lien : la touche y est grisée.
Module : [textedit.ts](../../packages/core/src/textedit.ts) ; essais : [textedit.test.ts](../../packages/core/src/test/textedit.test.ts).

**Un ami hors ligne.**
Le message attend sur la borne, en pointillés, « En attente · partira quand … sera en ligne », et part tout seul dès que les deux bornes sont allumées en même temps.
Il passe à « Reçu » quand la borne de l'ami l'a enregistré.
Au bout de 30 jours sans connexion, il est abandonné : « Non remis ».
Il n'y a pas d'accusé de lecture.

**Pendant une partie.**
Les boutons restent à VPX : aucun ne sert à la messagerie.
Le téléphone appairé, lui, montre le fil le plus récent sous « Partie en cours » : réactions et phrases d'un toucher (la réaction vise le dernier message reçu), et un champ pour écrire.
Le réglage « Répondre depuis le téléphone pendant une partie » le coupe ; les messages se lisent alors au retour au front-end.

**Fronton et DMD.**
Pendant qu'un fil est ouvert, le fronton montre la carte de l'ami : sa pastille, sa présence, son dernier record et depuis quand vous êtes amis.
Dans le front-end, un message arrivé s'annonce aussi au DMD, en points, quatre secondes ; jamais pendant une partie.

**Notifications.**
Un message arrivé s'annonce par la notification « Message de … » à l'écran des tables, dans le menu système et par-dessus la partie (sauf « Masquer les notifications pendant les parties ») ; un clic ouvre son fil.
Un fil ouvert n'annonce rien de plus.

**Options et réglages.**
Les options d'une conversation coupent les notifications d'un ami, effacent la conversation (sur cette borne seulement) ou bloquent l'ami (le blocage du réseau des bornes, qui efface aussi la conversation).
Une conversation non lue compte dans la pastille des messages de l'écran des tables, sauf en sourdine, et paraît sur l'écran « Messages en attente » (voir [Notifications de l'écran des tables](notifications-de-l-ecran-des-tables.md#notifications-de-lécran-des-tables)).
« Réglages de la messagerie » active ou désactive la messagerie (désactivée, vos amis voient « N'accepte pas de messages » et ce qu'ils écrivent attend), coupe le son des messages, et règle leur durée de conservation : 30 jours, 1 an (par défaut) ou toujours.
En mode invité, le menu système est fermé : pas de messagerie, et les notifications de message attendent le déverrouillage.
Les réglages comptent aussi « Répondre depuis le téléphone pendant une partie » (activé par défaut).

**Supprimer un message.**
Start sur l'un de vos messages, puis « Supprimer ce message… » et la confirmation : il disparaît de votre fil, avec les réactions posées dessus, et chez l'ami dès que sa borne reçoit le retrait.
Le retrait est un message signé (`del` : l'identifiant du message) qui part et attend comme un autre ; une borne ne retire que les messages de celui qui le signe.
Une borne d'avant cette version ne l'accuse pas : il reste en attente, sans rien montrer, puis est abandonné.
Essais : [suppression-messages.test.ts](../../packages/core/src/test/suppression-messages.test.ts).

**En train d'écrire.**
Tant qu'un ami a du texte dans son champ (clavier à l'écran, vrai clavier ou téléphone), son badge apparaît sous le dernier message : son avatar, son pseudo et trois points qui s'allument l'un après l'autre.
De même dans un groupe (chaque membre qui écrit, sous la discussion) et dans un salon (sous le journal, trois badges au plus, puis « +2 » ; les joueurs ignorés n'y sont pas).
Le téléphone le montre aussi, sous le fil, le salon ou la messagerie de la partie (les pseudos, trois au plus puis « +2 », et les trois points), et ses propres champs l'envoient.
Les points partent avec le message, quand le champ est vidé ou fermé, ou d'eux-mêmes 8 secondes après le dernier signal.
C'est un signal éphémère, jamais gardé : `chat-typing` vers un ami, `grp-typing` vers les membres joignables d'un groupe, `room-typing` dans un salon (signé par son auteur, relayé comme la présence) ; un toutes les 3 secondes au plus pendant la frappe.
Une borne d'avant cette version ne l'envoie pas et ne l'affiche pas.
Essais : [en-train-d-ecrire.test.ts](../../packages/core/src/test/en-train-d-ecrire.test.ts).

**Ce qui circule.**
Chaque message est signé par la clé de son auteur et vérifié à l'arrivée ; une borne qui reçoit deux fois le même message ne le garde qu'une fois.
Les messages sont gardés dans `<données>\amis\messagerie.json`.

### Profil public et « J'aime »

Tout joueur a un **profil public**, lisible par ceux qui ne sont pas ses amis : son pseudo, son avatar, son niveau, ses badges, son pays, son nombre d'amis (jamais leur liste), le nombre de ses records publiés, ses personnes invitées, ses groupes publics et son **activité récente** (records et badges des 30 derniers jours).
Table en cours, parties jouées, bibliothèque et messages restent entre amis, et le profil le dit (« Table en cours, parties jouées, bibliothèque : réservées à ses amis ») ; « En ligne » ou « En partie » se voient dans « Joueurs en ligne » (voir plus bas).

**Un seul écran par joueur.**
Ami ou non, un joueur n'a qu'un écran, son profil (`app/src/profile-menu.ts`) ; jusqu'à la 0.1.13, la fiche d'un ami et son profil public faisaient doublon, avec deux listes d'activité différentes.
Mes amis, « Joueurs en ligne », l'annuaire (« Trouver un joueur »), les demandes d'amis, la messagerie et les groupes (« Voir son profil »), les salons (les options d'une ligne) et l'Activité récente y mènent tous directement ; son « Retour » revient d'où l'on venait.
Sous le pseudo, le palier et le niveau (« Flippeur · niveau 14 »), puis « Votre ami » ou « Profil public · pas votre ami ».
De haut en bas :

- ce que la relation ajoute (`playerPart` de `app/src/friends-menu.ts`) : pour un ami, sa présence (« En partie », « En ligne » ou « Hors ligne », depuis quand vous êtes amis, par où sa borne est reliée) et sa bibliothèque (avec « 1 réception en cours ») ; pour un autre joueur, où il a été vu (« Sur votre réseau local », « Vu il y a 3 j ») et la demande d'ami en cours, envoyée ou reçue ;
- son pays, son nombre d'amis et ses records publiés, « Profil actualisé il y a … », puis son identifiant ;
- son niveau et sa barre (« Flippeur · niveau 14 », « 350 / 750 XP ») ;
- ses badges en médailles, les plus rares d'abord, douze au plus (« 23 badges sur 56 », « Les 12 plus rares ») ;
- ses personnes invitées, s'il en a (voir « Personnes invitées » ci-dessous) ;
- ses groupes publics, jamais un groupe privé (voir [Niveaux et badges](niveaux-et-badges.md#ce-que-voit-le-joueur)) ;
- une seule liste d'activité, la plus récente en haut : ses records et badges des 30 derniers jours, à aimer, et, pour un ami, ses parties jouées sur les mêmes 30 jours (sans carte publique reçue, ses évènements d'ami seuls).

La carte d'un joueur dont la borne n'a pas encore la version des niveaux n'a pas de niveau : la ligne dit « Niveau pas encore connu » (« Sa borne n'a pas encore la version qui donne le niveau »).
Un niveau invraisemblable s'affiche « Niveau ? » (voir [Niveaux et badges](niveaux-et-badges.md#niveau-de-départ-et-vraisemblance)).
Les actions : pour un ami, « Inviter à une partie en direct », « Voir sa bibliothèque », « Écrire un message » ; pour un autre joueur, « Envoyer une demande d'ami » (ou « Annuler la demande », « Accepter », « Refuser ») et « Écrire un message », grisé ; puis « Masquer son activité », « Retirer de mes amis » (un ami, avec confirmation), « Bloquer … » et « Retour ».

**Aimer.**
Sur le profil, les flippers choisissent un record ou un badge, Start l'aime, Start de nouveau ne l'aime plus.
Chacun voit le nombre de « J'aime » ; seul l'auteur voit qui a aimé.
On ne peut pas écrire à un joueur qui n'est pas un ami : « Écrire un message » reste visible, grisé, avec sa raison ; « Envoyer une demande d'ami » est à côté.
« Masquer son activité » cache sur cette borne ses évènements et ses « J'aime », avec son niveau, ses badges et ses personnes invitées ; « Bloquer » coupe tout.

**Mon profil public.**
Menu système > « Mon compte » > « Mon profil public » montre ce que voient les autres (pays, amis et records, niveau et barre, badges en médailles, personnes invitées, groupes publics) et, pour chaque évènement de « Votre activité récente », qui l'a aimé (Start).
Pendant le premier mois, il propose aussi « Qui vous a fait découvrir Cyber Pinball ? » (voir « Personnes invitées » ci-dessous).
Un « J'aime » reçu s'annonce par une notification à l'écran des tables, regroupée (« Dora et Kiko aiment votre activité »).
Le profil public est **activé par défaut** ; « Désactiver mon profil public », ici ou dans « Partage et réseau », ne laisse aux autres que le pseudo dans l'annuaire (et les scores, s'ils sont publiés).

**Sans serveur.**
La carte publique d'un joueur est signée par sa clé et passe de borne en borne comme les scores des classements : chaque borne la garde 60 jours, si bien qu'un profil se lit même quand son joueur est hors ligne, dans l'état de la dernière carte reçue (« Profil actualisé il y a … »).
Un « J'aime » est un petit message signé, remis directement à la borne de l'auteur quand elle est reliée, sinon relayé par une ou deux bornes, et réessayé à chaque liaison pendant 30 jours.
Le nombre affiché est celui de la dernière carte reçue.
Une même borne ne peut pas donner plus de 100 « J'aime » par jour à un joueur.
Les cartes envoyées ensemble tiennent sous 180 Kio par message (`withinBytes`, [publicprofile.ts](../../packages/core/src/publicprofile.ts)) : une carte porte jusqu'à vingt attestations de personnes invitées, et un message trop gros serait refusé entier.
Cartes et « J'aime » sont gardés dans `<données>\amis\profils.json`.

### Personnes invitées

Un joueur qui a fait découvrir Cyber Pinball à d'autres le voit sur son profil, avec le badge Ambassadeur dès la première personne ; le profil de la personne invitée, lui, ne dit jamais qui l'a invitée.
Sans serveur ni compte, seule la personne invitée peut dire qui l'a invitée ([invitations.ts](../../packages/core/src/invitations.ts)).

**La question.**
« Qui vous a fait découvrir Cyber Pinball ? » se pose à l'écran « Votre profil de joueur » du premier lancement, avant « Continuer », puis dans Menu système > « Mon compte » > « Mon profil public », pendant les 30 jours qui suivent la première ouverture de cet écran (`DECLARE_DAYS`, `profileOffered`) ; elle est toujours facultative.
L'écran (`app/src/invite-menu.ts`) propose d'abord les joueurs « Sur votre réseau local », puis « Vos amis » (huit au plus par liste), « Chercher un joueur… » (son pseudo, ou l'identifiant vu sur son profil, dans l'annuaire), « Personne : je l'ai trouvé seul » (la question ne revient plus) et « Plus tard ».
Le joueur choisi porte « Choisi », l'écran dit « Vous avez choisi … » et l'entrée devient « Découvert grâce à … » ; tant que rien n'est confirmé, on peut en changer.

**Quand ça compte.**
L'invitation compte à la première partie menée au bout (voir [Niveaux et badges](niveaux-et-badges.md#gagner-des-xp)), ou tout de suite si une partie l'a déjà été.
La borne signe alors une attestation (`invited` : l'inviteur, la personne invitée, son pseudo, l'empreinte de sa machine, l'heure) et la remet à la borne de l'inviteur si elle est reliée ; sinon, les bornes reliées la relaient, deux fois au plus (`INVITE_TTL`), et elle repart à chaque liaison tant que l'inviteur ne l'a pas reçue directement.
L'écran dit ensuite « Bruno vous a fait découvrir Cyber Pinball » et « C'est compté : il le voit sur son profil » (ou « … dès que sa borne sera en ligne ») ; plus rien ne se change.

**Une machine ne compte qu'une fois.**
L'empreinte de la machine est tirée du `MachineGuid` de Windows sans qu'on puisse remonter jusqu'à lui (`machineTag`) ; le `MachineGuid` ne quitte jamais la borne.
Illisible, l'invitation déclarée attend une partie suivante.
L'inviteur garde une attestation par machine et par joueur, jamais la sienne ni une venue de sa propre machine, et joint les vingt plus récentes à sa carte publique (`INVITES_IN_CARD`), avec leur total.
Toute borne qui montre son profil vérifie la signature de chaque attestation par la clé de la personne invitée (`invitedOf`) : un nombre gonflé ne passe pas ; au-delà des vingt jointes, le total annoncé est cru, 500 au plus.
Un compte supprimé (avis d'oubli) retire son attestation.

**Sur le profil de l'inviteur.**
Une partie « Personnes invitées » : « A fait découvrir Cyber Pinball à 3 joueurs » (« Vous avez fait découvrir Cyber Pinball à 3 joueurs » dans Mon profil public), avec les avatars des huit plus récentes et « +N » au-delà.

**XP, notification et badges.**
Chaque personne invitée rapporte 100 XP à l'inviteur, puis 25 XP à chaque palier qu'elle passe (Flippeur, Habitué…, lu sur sa carte publique s'il est vraisemblable), hors plafond (voir [Niveaux et badges](niveaux-et-badges.md#gagner-des-xp)).
La notification « Nova, que vous avez invité, vient de finir sa première partie » (« Elle compte parmi vos personnes invitées ») l'annonce avec son son, regroupée au besoin (« 2 personnes invitées ont fini leur première partie ») ; un clic ouvre Mon profil public.
Les badges Ambassadeur, Rassembleur et Bâtisseur de communauté suivent leur nombre.

**Fichiers et tests.**
Le choix, « Personne », sa propre attestation et celles reçues sont gardés dans `<données>\amis\invitations.json` ; `app/src/invitations-service.ts` lit l'empreinte de la machine (`CYBERPINBALL_MACHINE` la remplace pour les bornes fictives des essais).
Une borne d'avant cette version ignore les attestations (`invites`) et ne montre pas les personnes invitées.
Tests : [invitations.test.ts](../../packages/core/src/test/invitations.test.ts).

### Communauté et joueurs en ligne

**Le médaillon Communauté.**
Dans la roue, juste après le Juke-box et avant le médaillon Collections et les tables de chaque collection, un médaillon sur l'anneau chromé commun ouvre la communauté : son nom en vert, le nombre de joueurs en ligne et d'amis en ligne dessous.
Partout (médaillon, affiche, Menu système, onglets de « Joueurs en ligne », téléphone), le nombre de joueurs en ligne, et celui de votre pays, ne s'affiche qu'au-delà de cinq, comme les présents d'un salon : un réseau presque vide, chiffré, découragerait ; les joueurs restent nommés, et vos amis en ligne se comptent toujours.
Start ouvre l'**accueil**, six portes : « Joueurs en ligne », « Parties instantanées » (voir ci-dessous), « Mes amis » (avec la pastille des demandes reçues), « Messages » (la messagerie entre amis), le salon de votre pays (voir « Salons par pays » ci-dessous) et « Classements », qui ouvre sur deux portes, « Joueurs » et « Tables ».
« Joueurs » classe les joueurs par leurs XP, en onglets Amis, National et Mondial (MagnaSave passe de l'un à l'autre), de la semaine (les XP gagnés depuis lundi, à zéro chaque lundi) ou de tout temps (les flippers passent de l'une à l'autre).
Il s'ouvre sur National · Cette semaine (Mondial sans pays choisi) : la semaine d'abord, où chacun a sa chance.
Chaque ligne donne le rang, le drapeau, la pastille du joueur avec son niveau et sa présence, son pseudo et ses XP, l'autre période en petit (« 12 400 XP au total », « +850 cette semaine ») ; à égalité, le même rang.
Il compte les joueurs dont la borne a reçu la carte publique, qui porte, signés, les XP de la semaine et son lundi (la carte d'une borne pas encore à jour ne se classe qu'en Tout temps), et vous, même profil public désactivé.
Votre ligne, « (vous) », reste toujours visible, à part au-delà des cinquante premiers ; sous le tableau, votre place (« National · Cette semaine : votre place, 37 sur 120 joueurs »).
Un total impossible pour quiconque (au-delà de tout ce qui a pu se gagner depuis l'arrivée des niveaux, compte tenu des XP que rapportent les personnes invitées), ou une semaine au-delà de ce qu'une semaine permet, ne se classe pas : il est compté sous le tableau (« 1 joueur écarté (XP impossibles) »).
Un total seulement inattendu pour l'ancienneté du joueur sur cette borne se classe, son niveau montré « ? ».
Partage désactivé, la porte est grisée avec sa raison ; sans pays, National dit « Pays non choisi : Mon compte > Mon pays » ; sans ami, Amis dit « Aucun ami pour l'instant ».
Start ou Exit revient aux deux portes, dont la porte « Joueurs » résume votre place : « Vous : niveau 14 · 37ᵉ au monde cette semaine · 3ᵉ dans votre pays ».
« Tables » montre toutes vos tables, les cinq dernières jouées d'abord (« Jouées récemment », avec « hier », « il y a 3 j »), puis toutes les autres de A à Z, en onglets Cette borne, Amis, National et Mondial, chacun comptant ses tables classées (« 3 sur 42 »), sur la période choisie (« Période » : Tout temps, Cette année, Cette semaine, Aujourd'hui ; Start passe à la suivante).
Il s'ouvre sur Mondial · Tout temps (Cette borne quand le partage est désactivé), le curseur sur la recherche.
Une table classée dit le premier, son score, le nombre de joueurs (de parties, pour Cette borne) et votre place, avec « Premier » en vert quand vous menez ; une table sans classement reste dans la liste, grisée, avec sa raison (aucun score sur la période, empreinte en calcul, version illisible).
« Rechercher une table », en tête de la liste, filtre par nom avec le clavier à l'écran ou celui du PC, sans accents ni majuscules : chaque mot tapé commence un mot du nom ou se trouve dans le nom écrit sans espaces (« comete » trouve « Comète »).
Pendant une recherche, les tables se suivent de A à Z ; « Effacer la recherche » les ramène toutes.
Start sur une table ouvre son tableau des scores à la même portée et à la même période, dont le « Retour » revient à la liste des tables.
Le classement des joueurs est calculé par `playerBoard` dans `packages/core/src/playerranking.ts`, l'écran dans `app/src/rankings-menu.ts` ; tests : `packages/core/src/test/classement-joueurs.test.ts` et `packages/core/src/test/classements-global.test.ts`.
Exit revient à la roue.
Le médaillon se masque dans Menu système > Tables > Roue (« Communauté dans la roue ») ; il n'apparaît jamais en mode invité.
Choisi dans la roue, il montre son **affiche**, comme le Juke-box : derrière la roue (tout le plateau en borne, le cadre du plateau au bureau) et à la place du média du fronton.
Elle donne les chiffres (joueurs en ligne, ceux de votre pays, vos amis), le salon de votre pays avec ses présents et sa dernière ligne, et les amis en ligne (sinon les messages non lus) ; partage désactivé, elle dit comment l'activer.

**Joueurs en ligne.**
Aussi en tête de Menu système > Communauté.
Tous les joueurs que votre borne a croisés, amis ou non (l'annuaire du réseau, vos amis, les joueurs des classements), **ceux en ligne d'abord** : vos **amis en ligne**, puis les joueurs de **votre pays**, puis les autres ; dans chaque groupe, ceux qui sont en partie d'abord, puis par nom.
Viennent ensuite, dans « Hors ligne », tous les autres : vos amis d'abord, puis le plus récemment vu (« Vu il y a 3 j »).
Chaque ligne porte la pastille du joueur, son drapeau devant son nom (le drapeau Cyber Pinball, une bille comète, pour un joueur qui n'a pas dit son pays ; de même dans les classements et les salons), un anneau vert autour de la pastille quand il est connecté, et dessous ce qu'il fait (« En partie », sur quelle table entre amis, « En ligne », « Vu il y a 3 j ») et ce qui vous rapproche (« 6 tables en commun », « Sur votre réseau local ») ; « Ami » (hors de la section des amis) ou « Demande envoyée » dans la même ligne.
La **table en cours** n'est montrée qu'entre amis.
MagnaSave passe d'un **filtre** à l'autre, en onglets au-dessus de la liste : Tous, Mon pays, À proximité (le réseau local), Mêmes tables (les joueurs dont les scores classés portent sur des tables que vous avez, le plus de tables en commun d'abord).
Un filtre qui ne peut rien montrer reste visible, grisé, sa raison à la place du nombre (« Réseau local coupé », « Pays non choisi »).
Start sur un joueur, ami ou non, ouvre son profil (présence et bibliothèque d'un ami ; demande d'ami, « J'aime », blocage).

**Apparaître en ligne pour tous.**
Activé par défaut.
Coupé (en bas de « Joueurs en ligne », ou dans « Partage et réseau »), vous n'apparaissez plus chez les joueurs qui ne sont pas vos amis ; vos amis voient toujours votre présence, et vous voyez toujours la liste.
Au téléphone, l'onglet Communauté a une partie « Joueurs » : vos amis, puis les autres joueurs en ligne, qu'on voit sans pouvoir leur écrire.

**Sans serveur.**
Chaque borne signe toutes les deux minutes un petit signal (`live` : sa clé, son pseudo, son pays, « en ligne » ou « en partie », l'heure ; jamais la table), envoyé aux bornes reliées, et tout de suite quand elle entre en partie ou en sort.
Chaque borne vérifie la signature, garde le plus récent de chaque joueur et relaie seulement ce qui est nouveau, si bien que la diffusion s'arrête d'elle-même.
Un joueur est « en ligne » tant que son dernier signal a moins de cinq minutes : il peut apparaître une à deux minutes après sa connexion, et rester affiché jusqu'à cinq minutes après son départ.
Un signal trop vieux, daté de plus d'une minute dans le futur ou modifié est refusé ; ceux d'un joueur bloqué sont laissés.
Rien n'est écrit sur le disque.
Le module est [livepresence.ts](../../packages/core/src/livepresence.ts), l'écran `app/src/community-menu.ts`.

**Essais.**
[livepresence.test.ts](../../packages/core/src/test/livepresence.test.ts) : signal signé, refusé s'il est changé, trop vieux ou du futur ; le plus récent l'emporte, seul le nouveau se relaie ; groupes, ordre et filtres de la liste ; entre deux bornes qui ne sont pas amies (réseau d'essai en 127.0.0.1), « en ligne » arrive, « en partie » sans la table, l'option coupe le signal.

### Parties instantanées

Une partie en direct ouverte à tous, amis ou non.
Un joueur l'ouvre, choisit le nombre de joueurs, et elle s'affiche dans la Communauté de chaque borne en ligne ; n'importe qui la rejoint, et **dès qu'elle est complète, elle part d'elle-même pour tout le monde**.
La partie elle-même est celle des amis (voir « Amis : le réseau des bornes ») : chacun joue sur sa borne, la même version de la table, avec les réglages de l'hôte, un départ commun et les résultats de chacun.

**Ouvrir une partie.**
Communauté > Parties instantanées > « Ouvrir une partie instantanée » : la table (vos tables VPX), puis le nombre de joueurs, vous compris (2, 3 ou 4).
Aussi depuis la fiche d'une table : « Partie instantanée », juste après « Jouer avec un ami ».
Le salon d'attente s'ouvre : « En attente de 2 joueurs », les joueurs déjà là et les places libres.
À chaque arrivée, une notification (« Tiltman a rejoint votre partie ») et une ligne en tête du salon (« Encore 1 joueur et elle part »).
« Annuler la partie » la retire de toutes les listes, et ceux qui l'avaient rejointe en sont prévenus.
Une partie qui n'est pas complète en trente minutes se ferme d'elle-même.
Une seule partie à la fois : en ouvrir une autre ferme la précédente.

**Rejoindre.**
Communauté > Parties instantanées : les parties ouvertes par les autres, la plus récente d'abord.
Chaque ligne porte la pastille et le drapeau de l'hôte, la table, depuis quand elle est ouverte, combien de joueurs sont là, les places restantes, et ce que vous avez de la table : « Même version », sinon la ligne est grisée avec sa raison (« Autre version de cette table chez vous », « Vous n'avez pas cette table »).
Start sur une partie jouable : la table est vérifiée sur votre borne, puis vous entrez dans le salon de l'hôte (« Connexion à la borne de Kiko… » le temps que les deux bornes se rejoignent).
« Quitter la partie » libère votre place.
Arrivé trop tard, l'écran le dit : « La partie de Kiko est complète », ou déjà partie.

**Entre inconnus.**
Seuls les messages de la partie passent entre ses joueurs : ni bibliothèque, ni messagerie, ni table en cours.
Un joueur bloqué ou exclu des salons par la modération ne voit pas vos parties et ne peut pas les rejoindre ; les siennes ne vous sont pas proposées.
Après la partie, « Rejouer avec les mêmes joueurs » ne réinvite que vos amis.
Indisponible en mode invité, et sans partage (la porte est grisée avec sa raison).

**Sans serveur.**
L'hôte signe une petite annonce (`instant` : la table, son empreinte et celle du script, le nombre de places, les joueurs déjà là, ouverte ou fermée), qui passe de borne en borne comme la présence publique.
Il la signe de nouveau toutes les 20 secondes et à chaque arrivée ; une annonce de plus d'une minute n'est plus montrée (borne éteinte, réseau coupé).
Au départ ou à l'annulation, une annonce « fermée » la retire partout sans attendre.
Pour rejoindre, la borne du joueur rejoint celle de l'hôte par sa clé et lui envoie `game-join` (redit toutes les 3 secondes, abandonné après 45 secondes sans réponse) ; l'hôte l'ajoute s'il reste une place, sinon répond `game-cancel` avec la raison (`full`, `started`).
Les joueurs d'une partie sont ses « partenaires » : leurs bornes se rejoignent par leur clé, et les messages de la partie en direct (`game-*`) passent entre eux comme entre amis.
Le module est [instantgames.ts](../../packages/core/src/instantgames.ts), les écrans `app/src/instant-menu.ts` et `app/src/live-game-menu.ts`, le service `app/src/live-game.ts`.

**Essais.**
[parties-instantanees.test.ts](../../packages/core/src/test/parties-instantanees.test.ts) : l'annonce est signée et refusée si elle est changée, trop vieille ou du futur ; la liste écarte la mienne, les complètes, les fermées et celles d'un joueur écarté ; un joueur entre tant qu'il reste une place, jamais au-delà ; sur trois bornes qui ne sont pas amies, chacun rejoint et la partie complète part pour tous, une quatrième arrivée trop tard l'apprend ; une place quittée se libère ; et sur le réseau des bornes en 127.0.0.1, l'annonce passe entre inconnus, la partie aussi entre ses joueurs, la messagerie non.

### Groupes

Des cercles à soi, publics ou privés : une discussion, une table de la semaine et le classement du groupe, que seuls ses membres voient.
On y entre par la porte « Groupes » de l'accueil Communauté, entre Messages et le salon du pays ; elle dit le nombre de groupes et la dernière nouveauté (ou combien de groupes publics attendent), et porte la pastille rouge quand un message attend ou qu'une invitation est arrivée.

**Public ou privé.**
Un groupe privé (le choix par défaut) n'apparaît nulle part : on y entre seulement sur invitation.
Un groupe public paraît dans la liste des groupes publics de toutes les bornes, et n'importe quel joueur le rejoint d'un appui ; on peut aussi y inviter ses amis.
Dans les deux cas, la discussion, la table de la semaine et le classement restent entre membres : la liste ne montre que le nom, les membres, le créateur et la table de la semaine.
Le créateur choisit l'accès à la création, et le change ensuite dans « Membres » (« Accès : public » ou « Accès : privé ») ; un groupe rendu privé sort aussitôt de la liste, ses membres restent.

**Groupes.**
D'abord « Mes groupes », une ligne par groupe : son nom (un cadenas s'il est privé, trois joueurs s'il est public), ses membres en pastilles, leur nombre et le dernier fait (le dernier message, ou qui mène sur la table de la semaine) ; « 2 nouveaux » quand des messages attendent.
Puis « Groupes publics », ceux que les autres bornes ont annoncés et dont vous n'êtes pas membre, les plus fournis d'abord : le nom, les membres en pastilles, leur nombre, le créateur et la table de la semaine.
Puis « Créer un groupe », « Invitations reçues » (grisée sans invitation) et « Retour ».

**Rejoindre un groupe public.**
Start sur un groupe public : son aperçu, avec les membres, leur présence et la table de la semaine (« déjà dans votre borne » ou non), jamais les messages.
« Rejoindre » fait entrer dans le groupe : la discussion arrive dès qu'un membre est en ligne.
Il est grisé, avec sa raison, quand le groupe compte 20 membres, ou quand son créateur vous en a retiré : il faut alors une invitation.

**Créer un groupe.**
Le nom (32 caractères au plus, au clavier à l'écran ou au téléphone), les amis à inviter (cases à cocher, en ligne d'abord ; 20 membres au plus, invitations comprises), puis l'accès : « Sur invitation seulement » (privé), Start le passe à « Ouvert à tous » (public), et inversement.
« Créer le groupe » envoie les invitations tout de suite ; il est grisé tant que le groupe n'a pas de nom.
Seul un ami peut être invité, par n'importe quel membre.

**Un groupe.**
En tête, la table de la semaine : choisie par un membre (« Choisir la table de la semaine »), pour tous, jusqu'au dimanche 23:59 qui vient (au moins deux jours) ; Start la lance.
Un membre qui ne l'a pas la voit grisée, « pas dans votre borne ».
Puis la discussion, en bulles comme la messagerie (les vôtres à droite, l'auteur et l'heure dessous, les réactions en pastilles), et le classement du groupe : le meilleur score de chaque membre sur la table de la semaine depuis qu'elle est choisie, tiré des scores déjà relayés par les classements (un score publié par un membre compte de lui-même), « Record du groupe » sur le premier.
Les actions : « Écrire au groupe » (phrases prêtes, ou clavier à l'écran et téléphone), « Choisir la table de la semaine », « Inviter des amis » (grisé quand tous vos amis sont membres ou invités, ou à 20 membres), « Membres », « Quitter le groupe ».

**Messages.**
Start sur un message : les sept réactions par emoji, les phrases, « Écrire un message… » ; sur le vôtre, « Supprimer ce message… » (pour tous, après confirmation) ; sur celui d'un autre, « Signaler ce message… ».
500 caractères au plus, une ligne toutes les 3 secondes et 20 en 10 minutes, comme dans les salons ; le filtre de mots des salons s'applique à l'affichage, et aux noms des groupes publics.
Un message arrivé dans un groupe qui n'est pas à l'écran s'annonce par une notification (« Kiko · Les flippeurs du jeudi », le message dessous), partout, par-dessus VPX compris ; « Notifications du groupe » (dans Membres) la coupe pour ce groupe.

**Membres.**
Chacun avec son avatar, son drapeau, « Créateur », et sa présence (en ligne, en partie, hors ligne).
Les invitations en attente suivent, avec qui a invité.
Puis l'accès du groupe (le créateur le change, les autres le lisent) et les notifications du groupe.
Le créateur peut retirer un membre ou annuler une invitation (Start sur la ligne) ; chacun peut partir quand il veut.
Un membre retiré ou parti ne voit plus le groupe ; ses messages restent, signés de son nom.

**Invitation reçue.**
Une notification l'annonce (« Bruno vous invite dans « Les flippeurs du jeudi » »), comme une demande d'ami.
L'écran montre qui invite, si le groupe est public ou privé, les membres et la table de la semaine (« déjà dans votre borne » ou non), jamais les messages : ils n'arrivent qu'une fois l'invitation acceptée.
« Accepter » fait entrer dans le groupe ; « Refuser » ne dit rien de plus que « refusée » à qui a invité.

**Au téléphone.**
Dans l'onglet Communauté, « Messages » montre vos groupes en tête des conversations (leur pastille porte les initiales du groupe) ; un toucher ouvre le fil du groupe, avec l'auteur de chaque message, les réactions et les phrases d'un appui, et un champ pour écrire.
Comme pour la messagerie, la borne vérifie tout ce qui part, dans le front-end comme pendant une partie.

**Signaler.**
Le signalement part chiffré pour chaque modérateur, comme celui d'un salon (voir « Modération des salons »).
Il joint le message tel que son auteur l'a signé ; les modérateurs le voient sous « Groupe », jamais le nom du groupe.
Un joueur exclu par la modération ne peut plus écrire dans un groupe : ses messages ne passent plus, ses annonces non plus.

**Sans serveur, sans borne étrangère.**
Un groupe est une suite de lignes signées chacune par son auteur (`grp` : création avec son accès, invitation, arrivée, refus, départ, retrait, changement d'accès, message, réaction, retrait d'un message, table de la semaine).
Chaque borne de membre garde la suite et en tire le groupe en la rejouant dans l'ordre des dates : une ligne d'un joueur qui n'était pas membre à ce moment ne compte pas ; seul le créateur retire et change l'accès ; une arrivée sans invitation ne compte que si le groupe est public à ce moment, qu'il reste de la place et que le joueur n'en a pas été retiré.
Les bornes des membres se relient directement par leur clé (comme les joueurs d'une partie instantanée), amies ou non, et les messages ne passent par aucune borne étrangère au groupe.
Toutes les 20 secondes, et dès qu'un membre devient joignable, chacune lui donne d'abord ses propres lignes (son arrivée, si le membre ne la connaît pas encore), puis dit d'une empreinte ce qu'elle a de chaque groupe (`grp-sum`) ; une empreinte différente fait dire la liste des lignes (`grp-have`), et l'autre envoie celles qui manquent.
Un message écrit part aussitôt vers les membres joignables, qui le relaient : un membre absent le reçoit de n'importe quel autre membre, à son retour.
Une invitation (`grp-invite` : les lignes d'appartenance et la table de la semaine, sans les messages) part à la borne de l'ami invité jusqu'à son accusé (`grp-invite-ok`) ; un refus part vers qui a invité.
Un groupe public s'annonce à toutes les bornes (`grp-pub`) : ses lignes d'appartenance et sa table de la semaine, signées une à une par leurs auteurs, et l'annonce elle-même signée par le membre qui la fait ; chaque membre la redit toutes les 30 minutes et à chaque changement, chaque borne la relaie et garde la plus récente de chaque groupe sept jours.
En ouvrant « Groupes », la borne demande leur annuaire aux bornes reliées (`grp-pub-ask`).
Un groupe redevenu privé s'annonce une dernière fois ainsi : chaque borne le retire de sa liste, et garde cette dernière annonce pour qu'une plus ancienne encore en route ne l'y ramène pas.
Tout est gardé dans `<données>\amis\groupes.json` : 3 000 messages par groupe et un an au plus, jamais les lignes d'appartenance ; un groupe quitté s'efface après 14 jours, une invitation sans réponse après 30, une annonce après sept jours ; l'annuaire garde 200 groupes au plus.
Le module est [groups.ts](../../packages/core/src/groups.ts), le service `app/src/group-service.ts`, les écrans `app/src/groups-menu.ts`.

**Essais.**
[groupes.test.ts](../../packages/core/src/test/groupes.test.ts) : seuls les membres invitent, écrivent, réagissent et choisissent la table ; seul le créateur retire et change l'accès ; un message ne se retire que par son auteur ; l'ordre d'arrivée ne compte pas ; signature fausse, texte retouché ou date du futur refusés ; l'invitation ne porte pas les messages et ne vaut que venue d'un membre qui m'invite ; un groupe public se rejoint sans invitation, jamais par un membre retiré ; son annonce ne porte pas les messages, refusée si elle est retouchée ou faite par un non-membre ; un groupe privé ne s'annonce jamais ; redevenu privé, il quitte l'annuaire et une annonce plus ancienne ne l'y ramène pas.
Sur le réseau d'essai en 127.0.0.1 : Alice et Chloé, qui ne sont pas amies, se parlent par un groupe privé, un message écrit pendant que Chloé est éteinte lui arrive à son retour, Dora, hors du groupe, ne reçoit rien, et son refus revient à Alice ; Eve, une inconnue, trouve le groupe public d'Alice dans l'annuaire (jamais son groupe privé), le rejoint, en reçoit l'historique et y parle ; fermé par Alice, il quitte l'annuaire de Dora et ne se rejoint plus.
Démonstration hors écran : bornes fictives en mode `groupes` (Bruno crée un groupe privé et invite la borne, Kiko ouvre un groupe public).

### Salons par pays

Un salon de discussion public par pays déclaré, plus « Monde » (en anglais de préférence).
On y entre par la porte du salon dans l'accueil Communauté (celui de votre pays, ou celui choisi comme salon par défaut), puis « Autres salons… » pour Monde, les salons actifs des autres pays, et tous les pays par leur nom.

**Le journal.**
À l'ancienne, une ligne par message : l'heure, le drapeau, `<pseudo>` à la teinte de sa clé (la même que sa pastille) et le texte, qui revient à la ligne sous lui.
Une action (« /me lance Star Courier ») s'écrit en italique ; une ligne qui vous cite (`@VotrePseudo`) est surlignée en bleu ; la vôtre a son pseudo en vert ; les arrivées et départs (« → Kiko arrive ») sont plus discrets.
Les présents, avec pastille et drapeau, sont dans la colonne latérale (dessous en borne) ; leur nombre ne s'affiche (là, sur la porte du salon, l'affiche du médaillon, la liste des salons et le téléphone) qu'au-delà de cinq, pour qu'un salon presque vide ne décourage pas d'entrer.
Un salon quitté vous garde présent encore une minute (`ROOM_LINGER_MS`) : qui passe voit que quelqu'un vient d'y être, et l'écran « Écrire » ne vous fait pas disparaître le temps d'une ligne.
Sous chaque ligne, ses réactions en pastilles (« 👍 3 », la vôtre cerclée de bleu).
Les flippers parcourent les lignes, Start ouvre les options de la ligne choisie : « Réagir », les sept réactions par emoji en tuiles (👍 J'aime, ❤️ J'adore, 🥰 Solidaire, 😆 Haha, 😮 Waouh, 😢 Triste, 😡 Grrr ; une par joueur et par ligne, une autre la remplace, Start sur la sienne la retire), répondre (votre ligne commence par `@pseudo`), voir son profil, envoyer une demande d'ami, ignorer ce joueur dans les salons (ses lignes disparaissent, il n'est pas prévenu), bloquer.
« Signaler ce message » l'envoie aux modérateurs (voir « Modération des salons »).

**Supprimer sa ligne.**
Start sur l'une de vos lignes : « Supprimer ma ligne… », puis la confirmation.
Elle disparaît du salon ici et chez les autres joueurs : un retrait signé par votre clé (`room-del` : l'identifiant de la ligne, le salon, la clé, l'heure) passe de borne en borne comme une ligne, et chaque borne le garde sept jours pour qu'un relais ne la ramène pas ; il est aussi joint à l'historique donné à qui entre dans le salon.
Personne ne retire la ligne d'un autre (la modération la masque).

**Écrire.**
« Écrire dans le salon » : la première fois, les règles des salons (respect, rien de personnel, pas de publicité, on parle flipper, la modération veille), acceptées une fois pour tous les salons ; « Lire seulement » laisse le salon ouvert sans écrire.
Puis, sous les cinq derniers messages du salon (pour répondre en sachant ce qui vient d'être dit), les phrases préparées, en badges les uns à côté des autres (« Qui veut faire une partie ? », « Quelqu'un sur … ? » avec la table choisie dans la roue, « Bien joué ! »…), « Gérer les phrases… » juste après elles, « Répondre à @… » quand quelqu'un vous a cité, le clavier à l'écran, ou le téléphone : son QR code est en bande sous les phrases, et une fois relié, la bande le dit.
Le clavier à l'écran s'ouvre par « Écrire… ».
Une ligne, 300 caractères au plus, aucun lien cliquable.
Au clavier : « /me … » pour une action, dite à la troisième personne comme sur IRC (« /me arrive » s'affiche « <VotrePseudo> arrive », en italique), « /ignorer pseudo » pour ignorer un joueur.
Les flippers parcourent toujours les touches du clavier à l'écran, même après un texte tapé au vrai clavier, au téléphone ou par le panneau des emojis de Windows.

**Limites.**
Une ligne toutes les 3 secondes et 20 en 10 minutes au plus par joueur : la borne le dit (« Trois secondes entre deux lignes »), et chaque borne refuse de garder ou de relayer une ligne au-delà, si bien qu'un excès s'arrête à la première borne.
Le filtre de mots, actif par défaut, remplace les mots grossiers par des étoiles à l'affichage.

**Nouveaux messages.**
Une ligne arrivée dans un de vos salons (votre salon par défaut, et ceux où vous avez écrit depuis 24 heures), qui n'est pas à l'écran, s'annonce dans le front-end par une notification discrète (« Kiko · Salon France », la ligne dessous ; « 3 nouveaux messages · Salon France » quand elles s'accumulent).
Elle reste jusqu'à deux minutes, cède sa place dès qu'une autre nouvelle attend, et part quand le salon s'ouvre ; jamais par-dessus une partie, ni au journal d'Activité récente.
Un clic ouvre ce salon.
Réglage : « Nouveaux messages de mes salons ».

**Mentions.**
Une ligne qui cite votre pseudo, dans un salon qui n'est pas à l'écran, s'annonce par une notification (« Bruno vous cite · Salon France »), dans le front-end et par-dessus VPX en partie, sauf si « Mentions pendant les parties » est coupé ou si « Masquer les notifications pendant les parties » est choisi.
Un clic ouvre ce salon.
La porte du salon dans l'accueil et le médaillon Communauté comptent les mentions non lues.
Elles comptent aussi dans la pastille des messages de l'écran des tables, une ligne par salon sur « Messages en attente ».

**Réglages de la communauté.**
Menu système > Communauté > Réglages de la communauté : apparaître en ligne pour tous, salons activés ou désactivés (désactivés, ils restent visibles, grisés avec leur raison : pour la famille), salon par défaut (votre pays ou Monde), filtre de mots, mentions pendant les parties, nouveaux messages de mes salons (notification ou rien), phrases préparées, joueurs ignorés (à ne plus ignorer), règles des salons.
En mode invité, la communauté est fermée avec le menu système.

**Phrases préparées.**
Réglages de la communauté > Phrases préparées (ou « Gérer les phrases… » depuis « Écrire dans le salon ») : la liste dans l'ordre des badges, puis « Ajouter une phrase… », « Rétablir celles d'origine… » et « Retour ».
Une phrase s'écrit au clavier à l'écran ou au téléphone, avec les règles d'une ligne du salon : une ligne, 300 caractères au plus ; vide, trop longue ou déjà dans la liste, elle est refusée et la raison s'affiche.
Vingt phrases au plus : au-delà, « Ajouter » est grisé avec sa raison.
Start sur une phrase : « Modifier… », « Monter », « Descendre » (le curseur reste sur le bouton), « Supprimer… » (après confirmation).
`{table}` dans une phrase devient la table choisie dans la roue ; sans table choisie, la phrase n'est pas proposée.
Le téléphone reçoit la même liste.
Les phrases d'origine (six, dont « Merci ! ») suivent la langue de la borne tant qu'on ne les modifie pas ; les phrases sont gardées dans `<données>\amis\salons.json` (`phrases`, absent : celles d'origine).

**Au téléphone.**
L'onglet Communauté a une partie « Salon » : les 60 dernières lignes du salon ouvert à la borne (sinon du salon par défaut), des phrases d'un appui et un champ ; on y écrit dans le front-end comme pendant une partie.
Les règles s'acceptent à la borne.

**Sans serveur.**
Chaque ligne (`room` : identifiant, salon, clé, pseudo, pays, texte, action ou non, heure) est signée par la clé de son auteur et passe de borne en borne ; chaque borne vérifie la signature, écarte un doublon, applique les limites, garde 7 jours de lignes (300 par salon, 60 salons au plus) dans `<données>\amis\salons.json`, et relaie ce qui est nouveau.
En entrant dans un salon, la borne demande aux bornes reliées (`room-ask`) les 100 dernières lignes des 24 dernières heures.
Les présents s'annoncent par un signal signé (`room-here`) toutes les deux minutes tant que leur salon est à l'écran (et une minute après l'avoir quitté), frais cinq minutes.
Une réaction (`room-react` : la ligne visée, le salon, la clé, le pseudo, la réaction ou `null` pour la retirer, l'heure) est signée de même, relayée et gardée sept jours ; seule la plus récente de chaque joueur sur une ligne compte, et l'historique donné à qui entre les joint.
Une borne d'avant les réactions les ignore.
Une ligne trop vieille, datée du futur, modifiée ou sur plusieurs lignes est refusée ; celles d'un joueur bloqué sont laissées.
Le module est [rooms.ts](../../packages/core/src/rooms.ts), l'écran `app/src/rooms-menu.ts`.

**Essais.**
[rooms.test.ts](../../packages/core/src/test/rooms.test.ts) : ligne signée, refusée si elle est changée, trop vieille, du futur ou sur plusieurs lignes ; doublon écarté ; limites de 3 s et de 20 en 10 minutes ; historique des 24 h ; ménage ; mentions et filtre de mots ; fichier relu ; présents frais cinq minutes ; entre deux bornes qui ne sont pas amies (réseau d'essai en 127.0.0.1), les règles d'abord, la ligne écrite avant l'arrivée de l'autre lui vient par l'historique, les présents se voient, une ligne écrite arrive tout de suite.

### Modération des salons

**Signaler.**
Sur une ligne d'un salon, Start puis « Signaler ce message » : on choisit la raison (insultes ou harcèlement, spam ou publicité, contenu choquant, informations personnelles, autre).
Le signalement, signé par vous, joint la ligne telle que son auteur l'a signée (on ne peut pas en inventer une) et part chiffré pour chaque modérateur : lui seul peut le lire, et le joueur signalé ne sait pas qui l'a signalé.

**Les modérateurs.**
Leurs clés de joueur sont listées dans une charte numérotée, signée par la clé du projet (la même que celle des mises à jour) et livrée avec Cyber Pinball ; une charte plus récente passe de borne en borne et remplace l'ancienne.
Personne d'autre ne peut se dire modérateur.
Une borne de modérateur a l'entrée Menu système > Communauté > Modération : la file des signalements, les messages les plus signalés d'abord.
Ouvrir un signalement montre les lignes autour du message, qui l'a signalé et pourquoi, et les décisions : masquer le message, sourdine 1 h, 24 h ou 7 jours (le message masqué aussi), exclure des salons, lever une sanction en cours, ou classer sans suite.
Les mêmes décisions sont dans les options d'une ligne, et « Sujet du salon… » pose la ligne affichée en tête du salon.
Un nouveau signalement s'annonce par une notification.

**Les effets.**
Chaque décision est signée par la clé du modérateur, vérifiée contre la charte et appliquée par toutes les bornes : une ligne masquée s'affiche « message masqué par la modération » ; les lignes d'un joueur en sourdine (pendant sa sourdine) ou exclu ne sont plus gardées ni relayées ; ses lignes d'avant restent.
Le joueur sanctionné lit toujours les salons ; « Écrire dans le salon » est grisé avec la décision, sa fin et sa raison (« En sourdine jusqu'à 22:40 · décision de la modération · raison : insultes ou harcèlement »).

**Sans serveur.**
Charte et décisions (`mod`) voyagent comme les lignes, et chaque bonjour donne la charte et les décisions en vigueur.
Un signalement (`report`) est chiffré pour chaque modérateur (la clé Ed25519 du joueur convertie en clé X25519, libsodium) et remis à sa borne quand elle est reliée, sinon relayé par deux bornes au plus.
Décisions et signalements reçus sont gardés dans `<données>\amis\moderation.json` ; une sourdine finie depuis 7 jours et un signalement de plus de 30 jours en partent.
La charte se change avec `node scripts/charte-moderation.mjs --ajouter <clé>` (ou `--retirer`), qui la signe avec la clé du projet ; elle part avec la version suivante.
Le module est [moderation.ts](../../packages/core/src/moderation.ts).

**Essais.**
[moderation.test.ts](../../packages/core/src/test/moderation.test.ts) : charte livrée signée par la clé du projet, refusée si elle est changée ou signée par une autre clé ; seule la décision d'un modérateur de la charte passe ; masquer, sourdine pendant sa durée, exclusion, levée, sujet ; signalement signé qui joint la vraie ligne ; file regroupée, les plus signalés d'abord ; entre trois bornes (réseau d'essai en 127.0.0.1), le signalement n'arrive qu'au modérateur, sa décision s'applique partout, le joueur en sourdine ne peut plus écrire.

### Avatar des joueurs

Chacun personnalise un avatar, visible de tous, amis ou non, partout où son nom s'affiche (avatar public, décidé le 15/11/2026).
Pour l'instant, c'est toujours une image à soi : une photo ou une image prise sur le disque, ou dans le navigateur intégré, recadrée aux boutons de la borne ([avatar.ts](../../packages/core/src/avatar.ts), écran `app/src/avatar-menu.ts`).

- **Où il se voit.**
  « Mes amis » (en ligne, l'anneau de la pastille est vert ; hors ligne, elle s'éteint), le profil d'un joueur (devant son nom, et ses personnes invitées), « Joueurs en ligne », les salons (leurs présents et leurs lignes), les tableaux des scores, « Trouver un joueur » et les résultats, « Demandes d'amis », « Depuis un ami », « Partage et réseau » (le vôtre), l'historique des parties (les joueurs de chaque partie en petites pastilles, puis chacun devant son rang), le salon, l'invitation et les résultats d'une partie en direct, la carte d'invitation et la bande des scores pendant la partie, et les notifications qui ne parlent que d'un joueur (« Bruno vient de se connecter »).
  Sans image : les initiales (« AM » pour « Alexis Martin ») sur une teinte sombre tirée de la clé, la même sur toutes les bornes.
  L'encart des scores au bas du plateau, trop petit pour des initiales lisibles, ne garde que la teinte.
- **Choisir l'image.**
  Menu système > « Mon compte » > « Mon avatar » (ou « Partage et réseau » > « Changer d'avatar… »).
  « Choisir une image sur ce PC… » ouvre le sélecteur de fichiers de Cyber Pinball (.jpg, .jpeg, .png, .webp, .gif, .bmp, .avif, 40 Mo au plus).
  « Chercher une image sur le web… » ouvre le navigateur intégré sur une recherche d'images : un clic droit sur une image, « Télécharger cette image » (proposé sur toute recherche libre, médias compris, les moteurs d'images n'ayant pas de lien de téléchargement), et le navigateur se ferme sur le recadrage.
- **Image de travail.**
  L'image choisie est réduite à 1 600 pixels de côté au plus et redessinée en JPEG par le moteur de Chromium, dans la page cachée des conversions (`media-convert.ts`, `fitJpeg`) : une photo y perd ses métadonnées (EXIF, position GPS) et suit son orientation.
  Elle reste dans `<données>\avatars\recadrage\` avec son cadrage (`cadrage.json`) : « Recadrer mon avatar » y revient, même après un redémarrage ; sans image de travail, l'entrée reste visible, grisée, « Indisponible : choisissez d'abord une image ».
- **Recadrage aux boutons.**
  L'image entière, le carré gardé par-dessus (l'extérieur assombri, un filet vert, le rond que verront les autres joueurs), et à droite l'aperçu en grand et à la taille des listes.
  Les flippers choisissent un geste, Start l'applique, autant de fois qu'il faut, le curseur restant sur ce geste : « Valider ce cadrage », « Zoom avant », « Zoom arrière » (un cran : un quart), « Déplacer vers la gauche », « … la droite », « … le haut », « … le bas » (un pas : un dixième du côté du carré), « Recentrer », « Choisir une autre image », « Annuler ».
  Le carré ne sort jamais de l'image ; au plus près, un dixième de son petit côté (« Zoom avant » grisé, « Au plus près ») ; au plus large, toute la hauteur ou la largeur (« Zoom arrière » grisé).
  Au départ, le plus grand carré, centré ; un portrait le prend un peu plus haut, où est le visage.
  À la souris : on glisse le cadre (il suit le pointeur, le geste part au lâcher), la molette zoome.
- **Enregistrement.**
  « Valider ce cadrage » découpe le carré en JPEG de 256 pixels (`cropJpeg`, qualité 0,86, refait à 0,72 puis 0,55 s'il dépasse 96 Ko), rangé sous son empreinte : `<données>\avatars\<sha256>.jpg`.
  Le nom change avec le contenu : rien à invalider dans le cache du rendu, et deux joueurs qui ont la même image ne la gardent qu'une fois.
  `social.json` garde le nom du fichier (`avatar`), et ceux des amis (`peerAvatars`, par clé).
  Les fenêtres le lisent par le protocole `cyber-media://`, dont le dossier `avatars` fait partie (les fenêtres posées pendant la partie l'autorisent dans leur politique de sécurité).
- **Échange entre bornes.**
  L'empreinte de l'avatar voyage avec tout ce que le joueur signe ou annonce : le bonjour de chaque liaison (absente : pas d'avatar ; une borne d'avant les avatars n'en envoie pas, elle compte comme sans avatar), le signal de présence publique, le signal de présence dans un salon, la carte du profil public et les scores des classements.
  Dans les deux signaux de présence, elle a sa propre signature (`asig`, `avatarClaimText`) : une borne d'avant l'avatar public vérifie toujours le signal, l'ignore et ne la relaie pas ; retouchée en route, elle tombe et le signal reste, sans avatar.
  Un changement s'annonce aussitôt (`avatar`) aux bornes reliées, et repart avec la carte et les deux signaux.
  Pour un joueur qui n'est ni ami ni en demande, l'empreinte retenue est celle de la source la plus sûre et la plus fraîche (`publicAvatarHash`) : sa borne reliée, sa présence publique, son salon, sa carte, son score le plus récent.
  L'image se demande quand elle s'affiche (`avatarFile`) : à la borne du joueur si elle est reliée, sinon à trois bornes reliées au plus, qui l'ont peut-être (`avatar-get`, puis `avatar-data`, en base64).
  Une borne répond à toute borne qui n'est pas bloquée : son avatar du moment, et celui d'un autre joueur si elle l'a et que son empreinte est connue (annoncée, signée ou jointe à un score) ; jamais une empreinte que personne n'annonce.
  Les amis et les joueurs d'une demande en cours redemandent le leur dès qu'il change, comme avant.
  À la réception, l'image doit avoir l'empreinte annoncée, être un JPEG, un PNG ou un WebP reconnu à ses octets (jamais à son nom), peser 96 Ko au plus et mesurer 1 024 pixels de côté au plus, lus dans son en-tête sans la décoder : sinon rien n'est écrit.
  Une demande sans réponse est refaite au plus toutes les 30 s.
- **Rangement.**
  Un ami retiré, une demande refusée ou annulée : son avatar sort de `social.json` ; son fichier reste tant que son empreinte est connue ailleurs (il est public), puis part.
  Un joueur bloqué : rien de lui ne s'affiche ni ne se donne.
  Un avatar changé remplace l'ancien, dont le fichier part dès que plus personne ne le porte.
  Seuls les fichiers nommés comme un avatar sont touchés, jamais le dossier `recadrage`.

**Essais.**
[avatar.test.ts](../../packages/core/src/test/avatar.test.ts) : type et dimensions lus dans les octets, refus (trop lourde, trop grande, autre empreinte, autre chose que du base64), cadrage borné, initiales et teinte, rangement du dossier, état relu.
[avatar-public.test.ts](../../packages/core/src/test/avatar-public.test.ts) : l'empreinte jointe aux signaux de présence, signée à part, retouchée refusée, ignorée par une borne d'avant ; l'ordre des sources.
[social-net.test.ts](../../packages/core/src/test/social-net.test.ts) : trois bornes sur un réseau d'essai (127.0.0.1) ; l'avatar se voit chez un joueur qui n'est ni ami ni en demande ; changé, le nouveau arrive partout et l'ancien fichier part ; une demande refusée l'oublie de l'état, pas de l'écran ; retiré, les initiales reviennent ; bloqué, plus rien.
[classements.test.ts](../../packages/core/src/test/classements.test.ts) : l'avatar joint aux scores, puis le nouveau sans score ; une empreinte que personne n'annonce ne se donne jamais.

**Limites.**
Une image à soi seulement : pas encore d'avatars tout faits à choisir.
Pas de recadrage en rond : le carré est envoyé, le rond est dessiné par chaque borne.
Une image animée (GIF) devient fixe.
