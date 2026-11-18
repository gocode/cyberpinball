[English](../manual/my-account.md) · Français · [Sommaire du manuel](../manuel.md)

## Mon compte

Menu système > « Mon compte », en tête des rubriques, rassemble ce qui est à vous : de quoi retrouver votre compte sur un autre PC, votre pseudo, votre avatar, votre pays, vos badges, votre profil public, ce que voient les autres et la suppression du compte.
Le compte, c'est la clé du joueur de la borne (voir « Identité » dans [Communauté : le réseau des bornes](amis-le-reseau-des-bornes.md#communauté--le-réseau-des-bornes)), avec son pseudo, son pays, ses amis, ses badges, son niveau et son avatar.
Il vit dans le dossier des données de Cyber Pinball ; la copie de secours, le code de récupération et le mot de passe le gardent aussi ailleurs, pour une réinstallation ou un autre PC.
En mode invité, la rubrique est fermée, comme tout le menu système.

| Entrée | Ce qu'elle fait |
| --- | --- |
| Protéger et transférer mon compte | La copie de secours de ce PC, le code de récupération, le mot de passe, la copie chiffrée sur le serveur, et « Reprendre un compte sur cette borne… » (voir ci-dessous). Tant que ni le code ni un mot de passe ne protègent le compte, l'entrée dit « Code de récupération à noter », avec la pastille rouge jusqu'à la roue dentée ; ensuite, « Protégé · copie de secours, code, mot de passe ». |
| Mon pseudo | Le pseudo et l'identifiant du joueur (« Alexis · identifiant A1B2-C3D4-E5F6-7890 ») ; Start le change au clavier à l'écran (2 à 24 caractères), et vos amis et l'annuaire reçoivent le nouveau. |
| Mon avatar | La photo ou l'image que tous les joueurs voient à côté de votre pseudo : « Choisir une image sur ce PC… », « Chercher une image sur le web… », « Recadrer mon avatar », « Retirer mon avatar » (voir [Avatar des joueurs](amis-le-reseau-des-bornes.md#avatar-des-joueurs)). Sans avatar, vos initiales sur une teinte tirée de votre clé. |
| Mon pays | « D'après la région de Windows », puis tous les pays par ordre alphabétique, le choix actuel repéré. Il accompagne vos scores : il vous place au classement national et se voit, en drapeau, devant votre pseudo. |
| Mes badges | Les 56 badges, par famille, obtenus (avec leur date) ou à obtenir (avec leur progression) ; les badges secrets ne montrent que leur indice (voir [Niveaux et badges](niveaux-et-badges.md#niveaux-et-badges)). |
| Mon profil public | Ce que voient les joueurs qui ne sont pas vos amis (niveau, badges, pays, amis, records, personnes invitées, groupes publics, activité récente), et qui a aimé chacun de vos records et badges. Pendant le premier mois, « Qui vous a fait découvrir Cyber Pinball ? » (voir [Profil public et « J'aime »](amis-le-reseau-des-bornes.md#profil-public-et--jaime-)). |
| Ce que voient les autres | Le profil public, les scores publiés aux classements et la présence en ligne pour tous, chacun activé par défaut et coupé ici (voir plus bas). |
| Supprimer mon compte | Ce qui part et ce qui reste, puis « Supprimer définitivement mon compte », le curseur sur « Annuler » ; la copie chiffrée sur le serveur et le mot de passe partent avec le compte (voir « Supprimer son compte (RGPD) » dans [Communauté : le réseau des bornes](amis-le-reseau-des-bornes.md#communauté--le-réseau-des-bornes)). |

### Copie de secours sur ce PC

Cyber Pinball écrit d'office une copie du compte hors de son propre dossier, dans `%APPDATA%\CyberPinball\comptes` : au démarrage, toutes les deux minutes quand le compte a changé, et à la fermeture.
Une désinstallation, un dossier de Cyber Pinball effacé ou une réinstallation dans un autre dossier la laissent en place.
Elle rassemble en un seul fichier `social.json` (la clé, le pseudo, le pays, les amis, les badges), `amis\niveau.json` (les XP et le niveau), `compte.json` (ce qui protège le compte) et l'image de l'avatar.
Chaque compte joué sur ce PC a la sienne, huit au plus : au-delà, les plus anciennes partent.
Elle ne protège ni d'une panne du disque ni d'un changement de PC : pour cela, le code de récupération, le mot de passe ou une [sauvegarde](sauvegardes.md#sauvegardes).

**Au premier lancement.**
Une installation neuve qui trouve sur ce PC la copie d'un autre compte, tant que son propre pseudo n'est pas choisi, ouvre l'écran « Votre profil de joueur » sur « Un compte a été trouvé sur ce PC » : le pseudo, le niveau, les badges, les amis et la date de la copie.
« Reprendre le compte de … » ouvre la confirmation (voir « Reprendre un compte » plus bas) ; « Reprendre un autre compte… » mène aux autres moyens ; « Créer un nouveau compte » revient au choix du pseudo, et la copie n'est plus proposée jusqu'au démarrage suivant.
Exit ne décide rien : l'écran reste.
Sans copie trouvée, l'écran « Votre profil de joueur » propose « J'ai déjà un compte… » avant « Continuer » : le code de récupération, le mot de passe ou une sauvegarde.

### Code de récupération

La clé du joueur s'écrit en 24 mots, qui la redonnent sur n'importe quel PC, même hors ligne, sans aucun serveur ([recovery.ts](../../packages/core/src/recovery.ts)).
« Noter mon code de récupération… » les affiche numérotés, quatre par ligne, avec leur QR, qui ne contient que les mots en texte, jamais une adresse.
Notez-les sur papier, ou photographiez le QR avec votre téléphone ; quiconque les a peut prendre votre compte, et Cyber Pinball ne peut pas les retrouver pour vous.
« Je l'ai noté » demande deux mots tirés au hasard, l'un après l'autre (« Mot n° 7 ») ; justes, le code est noté (« Code de récupération noté : votre compte est protégé ») ; un mot faux ramène à l'écran précédent avec « Ce n'est pas le mot n° 7 : revoyez le code ».
« Plus tard » laisse l'entrée rappeler le code ; une fois noté, « Revoir mon code de récupération… » le remontre.
Les mots se tapent sans accent ni majuscule, et le code porte son propre contrôle : un mot mal recopié ou deux mots inversés sont refusés.

### Mot de passe

Facultatif : « Créer un mot de passe… » fait de votre pseudo votre identifiant (sans tenir compte des majuscules, réservé pour vous), avec un mot de passe d'au moins 8 caractères, tapé deux fois.
L'écran suivant rappelle l'identifiant, la force du mot de passe (Faible, Correct, Solide) et qu'un mot de passe oublié ne se réinitialise pas : aucune adresse e-mail n'est demandée, seul le code de récupération le remplace.
« Enregistrer » chiffre le compte sur la borne avec le mot de passe, puis l'envoie au serveur de Cyber Pinball, qui ne peut pas l'ouvrir et ne connaît pas le mot de passe.
Un identifiant déjà pris est refusé (« changez de pseudo, puis recommencez ») ; sans Internet, l'action reste visible, grisée, avec sa raison.
Une fois créé, « Changer de mot de passe… » et « Retirer le mot de passe » (le code de récupération reste) le remplacent.
Le service n'accepte que dix essais manqués par heure et par identifiant : au-delà, il faut attendre, même avec le bon mot de passe, ou prendre le code de récupération.

### Copie chiffrée sur le serveur

Dès que le compte est protégé (code noté ou mot de passe), une copie chiffrée du compte part au service du projet, puis de nouveau quand il change, au plus toutes les 30 minutes ([vault.ts](../../packages/core/src/vault.ts)).
Elle est chiffrée sur la borne (AES-256-GCM) avec une clé tirée de celle du joueur : le code de récupération l'ouvre sans rien d'autre ; avec un mot de passe, scrypt en tire de quoi le prouver au service, qui n'en garde que l'empreinte, et de quoi ouvrir la clé de la copie.
Le mot de passe, le code et la clé du joueur ne quittent jamais la borne.
La ligne dit « À jour le … », « Pas à jour » quand le service est injoignable (nouvel essai tout seul), ou « Coupée ».
« Ne plus garder de copie chiffrée sur le serveur » la coupe, et retire le mot de passe : le code ne redonne alors que la clé, sans pseudo, amis, niveau ni badges ; « Garder une copie chiffrée sur le serveur » la rétablit.

### Reprendre un compte

« Reprendre un compte sur cette borne… » (dans Protéger et transférer mon compte, ou « J'ai déjà un compte… » au premier lancement) propose :

- « Avec mon code de récupération… » : les 24 mots, tapés au clavier à l'écran et séparés par des espaces, ou collés d'un coup depuis le téléphone (son appareil photo lit le QR, on copie le texte et on le colle) ; tant qu'il en manque, l'écran garde ceux déjà tapés (« 12 mots sur 24 ») avec « Continuer à taper… », et un mot inconnu est nommé (« Le mot n° 5 « … » n'est pas dans la liste »).
- « Avec mon pseudo et mon mot de passe… » : il faut Internet ; sans lui, l'action reste grisée avec sa raison.
- « Depuis une sauvegarde… » : « Restaurer une sauvegarde » de [Sauvegardes](sauvegardes.md#sauvegardes), dont la partie « Réglages et scores » contient le compte.
- « Copie de ce PC : … » : un autre compte joué sur ce PC, avec son niveau, ses badges, ses amis et la date de sa copie.

Le compte trouvé s'affiche avant que rien ne change, « Reprendre le compte de … ? », le curseur sur « Annuler » : ce qui revient (pseudo et avatar, niveau et XP, badges, amis, qui vous reconnaissent sans rien redemander) et ce qui est remplacé (le compte de cette borne, avec « notez d'abord son code s'il compte pour vous » quand il a des parties ou des amis).
Les scores des tables restent sur l'autre borne : une sauvegarde « Réglages et scores » les ramène.
Le code seul, sans copie chiffrée sur le serveur, ne redonne que la clé : vos amis vous reconnaissent, mais le pseudo, le niveau et les badges ne reviennent pas.
« Reprendre le compte de … » efface les fichiers du compte de cette borne, pose ceux du compte repris et redémarre Cyber Pinball.
Ce qui ne va pas est dit en clair, avec « Réessayer… » : mot de passe faux, aucun compte avec cet identifiant, trop d'essais, copie chiffrée illisible, service injoignable.

### Ce que voient les autres

Vos amis voient toujours votre présence, votre table en cours et vos parties ; pour les autres joueurs, trois choix, activés par défaut :

- **Profil public** : pays, badges, records et activité récente ; désactivé, les autres ne voient que votre pseudo dans l'annuaire.
- **Scores publiés** aux classements Amis, National et Mondial, jamais en mode invité ; coupés, vous voyez les classements sans que vos parties y entrent.
- **Présence en ligne pour tous** : « En ligne » ou « En partie », jamais la table ; coupée, les autres ne vous voient plus dans « Joueurs en ligne ».

L'entrée dit combien d'éléments sont réservés aux amis.

### Fichiers et tests

`<données>\compte.json` garde ce qui protège le compte, sans aucun secret : la date du code noté, l'identifiant du mot de passe, la copie chiffrée gardée ou coupée.
Code : [account.ts](../../packages/core/src/account.ts) (le compte d'un bloc, les copies de secours), [recovery.ts](../../packages/core/src/recovery.ts) (le code), [vault.ts](../../packages/core/src/vault.ts) (la copie chiffrée), `app/src/account-service.ts` (copie, envoi, reprise), `app/src/account-menu.ts` (les écrans), `app/src/profile-welcome.ts` (le premier lancement) ; côté service, `packages/service-telephone/worker.mjs`.
Test : [mon-compte.test.ts](../../packages/core/src/test/mon-compte.test.ts).
