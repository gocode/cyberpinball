[English](../manual/backups.md) · Français · [Sommaire du manuel](../manuel.md)

## Sauvegardes

Menu système > « Cyber Pinball » > « Sauvegardes » fait une copie de la borne sur une clé USB, un disque externe ou un lecteur réseau, et la restaure, sur cette borne (après une panne, une erreur de réglage) ou sur un autre PC.
L'entrée dit la date et le niveau de la dernière sauvegarde.
Chaque sauvegarde contient aussi votre compte (pseudo, avatar, niveau, badges, amis) ; Menu système > « Mon compte » > « Protéger et transférer mon compte », puis « Reprendre un compte sur cette borne… » > « Depuis une sauvegarde… », mène aussi ici (voir [Mon compte](mon-compte.md#mon-compte)).

**Trois niveaux, chacun contient le précédent** (`LEVEL_PARTS`, [packages/core/src/backup.ts](../../packages/core/src/backup.ts)) :

| Niveau | Parties | Ce qu'on y trouve |
| --- | --- | --- |
| Réglages et scores (quelques Mo) | `cabinet`, `settings`, `scores`, `friends` | `data\cabinet.json` et ses configurations, `vpx-owned.json`, `config\VPinballX*.ini` ; les autres fichiers JSON de `data` (médias du front-end, langue, positions du DMD, mode invité…), le `.ini` de chaque table et `pinmame\cfg` ; `pinmame\nvram`, `pinmame\memcard` et `user\VPReg.stg` de chaque table ; `data\social.json` (dont la clé privée de l'identité de la borne), `data\avatars` (l'image de votre avatar et celles de vos amis, jamais le dossier de recadrage) et `data\amis` |
| Avec les tables | en plus `tables` | Les dossiers des tables (sans leur `cache`), `pinmame\roms`, `media` |
| Toute l'installation | en plus `vpx` | `emulators` (jamais la jonction `current`), `downloads`, `tools`, `data\enregistrements` |

Jamais sauvegardés : `app` (l'installeur le remet), `trash`, `import`, `parties`, `data\cache`, `data\logs`, `data\backups`, `data\staging`, ce que des amis ont envoyé (`data\amis\recus`, `data\amis\tables`), ce qui ne vaut que pour ce PC (`telechargements.json`, `mise-a-jour.json`, `orientation-ecrans.json`, `borne-dediee\`), les réglages et restaurations des sauvegardes elles-mêmes, les temporaires.
`partOf` range chaque chemin ; les jonctions et liens symboliques ne sont jamais suivis.

**Destination.**
Un dossier `CyberPinball-Sauvegardes` à la racine du lecteur choisi (clé USB, disque, lecteur réseau, ou disque de la borne : « ne protège pas d'une panne du disque »), ou dans un dossier précis de ce lecteur : « Choisir un dossier… » ouvre le sélecteur de dossiers de Cyber Pinball sur la destination actuelle.
Le dossier choisi est gardé depuis la racine du lecteur (`destination.folder`, « Sauvegardes\Borne ») ; s'il s'appelle déjà `CyberPinball-Sauvegardes`, c'est son parent qui est pris.
Un dossier dans l'installation de Cyber Pinball, sur aucun lecteur, ou où l'on ne peut pas écrire (essai d'écriture au choix) est refusé avec sa raison.
« Restaurer » cherche dans le dossier choisi et à la racine de chaque lecteur.
Les lecteurs viennent de `listDrives` (`Win32_LogicalDisk`, avec `FileSystem` et `VolumeSerialNumber`) ; la clé choisie est reconnue par son numéro de série même si sa lettre change (`data\sauvegardes.json`).
Avant de lancer, la place nécessaire est calculée (ce qui est déjà sur la destination est déduit, `estimateBackup`) et un niveau qui ne tient pas est bloqué avec sa raison : place manquante, ou FAT32 et un fichier de plus de 4 Go.

**Une copie dédoublonnée et vérifiée.**
Dans la destination, `objets\ab\<SHA-256>` garde le contenu de chaque fichier une seule fois, et `<borne>\<date> <niveau>\sauvegarde.json` la liste d'une sauvegarde.
Un fichier inchangé depuis la sauvegarde précédente n'est donc jamais recopié, sur n'importe quel système de fichiers.
Les empreintes déjà calculées (taille, date, SHA-256) sont gardées dans `data\sauvegardes-empreintes.json`.
Chaque objet est écrit dans un temporaire, relu et comparé à son empreinte, puis rangé : une sauvegarde « vérifiée » l'a été fichier par fichier.
La liste est écrite après chaque partie : une copie arrêtée ou coupée (clé retirée) garde ce qui est vérifié, marquée « Incomplète », et « Reprendre la sauvegarde » ne copie que ce qui manque.
La liste des sauvegardes marque « Endommagée » celle dont un objet manque ou n'a plus sa taille.
Pendant la copie, le front-end reste utilisable mais les parties attendent (« Une sauvegarde est en cours : les parties attendent sa fin. », `play` dans [frontend.ts](../../app/src/frontend.ts)) : une partie écrirait ses scores pendant la copie.
À la fin, « Éjecter la clé » demande l'éjection à Windows et dit quand la clé peut être débranchée.

**Restaurer en deux temps.**
« Restaurer une sauvegarde » liste celles des lecteurs branchés et de la borne, celles de cette borne d'abord.
Chaque borne a sa propre identité (`data\borne.json`) ; sur une installation neuve (sans modèle de borne), ses sauvegardes sont reconnues comme celles de cette borne.
Le plan (`planRestore`) dit, partie par partie, les fichiers remplacés, remis ou identiques ; Start inclut ou exclut une partie sur-le-champ : les fichiers sont comparés une fois, à l'ouverture du plan (`surveyRestore`), puis recombinés à chaque choix (`planFromSurvey`).
Le focus de départ est sur la première, jamais sur « Restaurer la sélection ».
Un fichier qu'une sauvegarde n'a pas (une table ajoutée depuis) reste où il est, et sans les tables, les réglages et scores d'une table absente ici sont ignorés.
Les scores d'une table (NVRAM, `VPReg.stg`) reviennent à ceux de la sauvegarde, sans fusion.
Puis :

1. l'application copie chaque fichier du plan dans `data\restauration\` en comparant son empreinte à celle de la sauvegarde (`prepareRestore`) : rien de la racine ne change, et arrêtée ou coupée, la restauration n'a simplement pas lieu ;
2. Cyber Pinball redémarre et, au tout début du démarrage, avant que la langue, le modèle de borne, les amis ou `VPinballX.ini` ne soient lus ([app/src/restore-on-start.ts](../../app/src/restore-on-start.ts), `applyPendingRestore`), chaque fichier actuel part à la corbeille (`<date> Avant restauration`) et le fichier restauré prend sa place.
   L'ancien processus, qui reste ouvert le temps que le nouveau couvre les écrans, ne peut plus rien écrire dans la racine ni dans les données, sauf le journal ([app/src/write-freeze.ts](../../app/src/write-freeze.ts)) : rien de ce qu'il avait en mémoire ne réécrit un fichier restauré.
   Un fichier qu'il garde ouvert (une vidéo en lecture) ne peut pas être posé tout de suite : l'ancien reste en place, et le fichier est reposé 20 s puis 60 s après le démarrage (`RESTORE_ATTEMPTS`, dans le même constat).

Le constat (`data\restauration-derniere.json`) est annoncé au démarrage et montré en tête de Sauvegardes.
« Annuler la dernière restauration » remet, par le même chemin, ce qui a été mis à la corbeille et retire ce qui a été ajouté, tant que la corbeille le garde.

**Une autre borne.**
Une sauvegarde faite sur une autre borne ne reprend d'office ni ses écrans, ses boutons et son son (partie `cabinet`, que l'on peut inclure), ni ses amis et son identité sur le réseau.
« Garder mes amis et l'identité de cette borne » est le choix de départ ; « Remplacer « … » sur le réseau » reprend sa clé privée et ses amis, après une confirmation : l'ancienne borne ne doit plus se connecter.
Une sauvegarde qui contient l'identité le dit à la fin de la copie (« gardez-la pour vous »).

**Changement de PC.**
Quand cette borne n'a encore aucune vie sur le réseau (ni ami, ni demande en attente, ni conversation : `hasNetworkHistory`, lu une fois à l'ouverture du plan), reprendre l'identité de la sauvegarde ne fait rien perdre : c'est un changement de PC.
Les deux choix deviennent « Garder l'identité neuve de ce PC » et « Reprendre l'identité de « … » » (pseudo, amis, messages), ce second choisi d'office.
La confirmation reste (« Reprendre l'identité de « … » ? », focus sur Retour) : l'ancien PC ne doit plus se connecter.
Un fichier d'amis ou de messagerie illisible compte comme une vie : la reprise n'est alors pas proposée d'office.

**Sauvegarde automatique.**
« Automatique » : désactivée (par défaut), chaque jour ou chaque semaine.
Moment : « Dès que possible » (par défaut : une borne n'est pas allumée toute la journée), la première fois que la borne est libre dans la journée (depuis 0 h) ou dans la semaine (depuis lundi 0 h) ; ou « À heure fixe », l'heure choisie (4 h par défaut) et, chaque semaine, le jour (dimanche par défaut), une heure manquée (PC éteint) étant rattrapée dès que possible.
Les réglages et les scores seulement, sur la borne (`data\sauvegardes`, les 10 dernières gardées), puis copiés sur la destination dès qu'elle est branchée (réglage « Copier aussi sur la destination »).
Regardée chaque minute, elle part borne libre : dans le front-end, sans bouton depuis 30 s (`backupFree`) ; une partie lancée pendant la copie l'arrête (`yieldToGame`), ce qui est vérifié reste, et elle se refait au moment libre suivant.
Après un échec (disque plein), pas de nouvel essai avant 30 min.
L'écran dit la prochaine (`lastAutoSlot`, `nextAutoSlot`, `autoBackupDue`).
`pruneBackups` retire les sauvegardes automatiques au-delà des 10 dernières, les incomplètes rattrapées par une complète, puis les objets que plus rien ne cite ; une sauvegarde faite à la main ou celle d'une autre borne n'est jamais retirée.

Code : le moteur dans [packages/core/src/backup.ts](../../packages/core/src/backup.ts), les écrans dans [app/src/backups-menu.ts](../../app/src/backups-menu.ts), l'éjection dans `app/src/drive-eject.ts`.
[sauvegardes.test.ts](../../packages/core/src/test/sauvegardes.test.ts) fixe le moteur : partie de chaque chemin, niveaux emboîtés, jonctions jamais suivies, copie dédoublonnée et relue, estimation et FAT32, sauvegarde arrêtée puis reprise, objet abîmé, restauration en deux temps et son annulation, fichier occupé reposé plus tard, dossier des données hors de la racine, rangement des sauvegardes automatiques, échéances ; [gel-ecritures.test.ts](../../packages/core/src/test/gel-ecritures.test.ts), le gel des écritures.
[sauvegardes-menu.test.ts](../../packages/core/src/test/sauvegardes-menu.test.ts) fixe les écrans avec des lecteurs simulés : rien n'écrit sans son action, focus de départ jamais sur une action qui écrit, actions indisponibles grisées avec leur raison, partie refusée pendant une copie, autre borne sans son identité, confirmation avant de la prendre, changement de PC où la reprise est choisie d'office, sauvegarde automatique borne libre seulement.

**Limites.**
Le premier lancement après une réinstallation ouvre l'assistant : la restauration se fait ensuite, depuis Sauvegardes (les écrans et les boutons de la sauvegarde remplacent ceux que l'assistant vient de relever).
Le compte, lui, peut revenir dès le premier lancement, par la copie de secours de ce PC, le code de récupération ou le mot de passe (voir [Mon compte](mon-compte.md#mon-compte)).
Un dossier hors d'une lettre de lecteur (`\\NAS\borne`) ne se choisit pas encore à l'écran : un lecteur réseau monté sur une lettre convient.
