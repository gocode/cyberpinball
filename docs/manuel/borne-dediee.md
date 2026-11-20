[English](../manual/dedicated-cabinet.md) · Français · [Sommaire du manuel](../manuel.md)

## Borne dédiée

Option désactivée par défaut : tant qu'on ne l'active pas, Cyber Pinball n'écrit rien dans Windows.
Activée, elle fait de Cyber Pinball le *shell* de Windows pour le compte de la borne, à la place de l'Explorateur : à l'ouverture de la session, il s'ouvre au lieu du bureau et de la barre des tâches, et le bureau ne se voit plus jamais, même pendant les 1 à 2 s du démarrage (voir [Limites connues du prototype](limites-connues-du-prototype.md#limites-connues-du-prototype)).
Les autres comptes, dont l'administrateur, gardent l'Explorateur.
Entrée : Menu système > « Borne » > « Borne dédiée ».

**Moyen retenu : Shell Launcher**, la fonction de Windows faite pour les bornes (fonctions facultatives `Client-DeviceLockdown` et `Client-EmbeddedShellLauncher`, classe WMI `WESL_UserSetting`) : un shell par compte (SID), et une action à la sortie de l'application selon son code (0 relancer, 1 redémarrer le PC, 2 l'éteindre, 3 ne rien faire).
Il n'existe que dans les éditions Entreprise, Éducation et IoT Enterprise (dont Windows 11 IoT Enterprise LTSC 2024), pas dans Pro ni Famille : là, l'écran passe par le réglage « Interface utilisateur personnalisée » du compte et un surveillant (voir plus bas, « Sans Shell Launcher »).
Écartée : la valeur `Shell` de `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`, par compte et sans élévation, mais qu'aucune documentation actuelle de Microsoft ne décrit (sur le poste de développement, `IniFileMapping\system.ini\boot` ne fait lire `Shell` que dans HKLM), sans relance si Cyber Pinball se ferme ou plante (écran noir), et sans les programmes de démarrage que lance l'Explorateur.

Code : [packages/core/src/dedicated.ts](../../packages/core/src/dedicated.ts) (script élevé, Windows simulé, jugement des résultats), [app/src/dedicated-menu.ts](../../app/src/dedicated-menu.ts) (écran), [app/src/dedicated-system.ts](../../app/src/dedicated-system.ts) (exécuteur : le vrai, et le simulé des essais hors écran et des bacs à sable), [app/src/dedicated-session.ts](../../app/src/dedicated-session.ts) (session dont Cyber Pinball est le shell).
Tests : [dedicated.test.ts](../../packages/core/src/test/dedicated.test.ts) fait tourner la logique du vrai script dans PowerShell sur une couche système simulée (aucun appel à Windows) et la compare au simulateur ; [dedicated-menu.test.ts](../../packages/core/src/test/dedicated-menu.test.ts) parcourt l'écran et fixe l'invariant : **aucune écriture dans Windows ne part ailleurs que des actions « Activer » et « Désactiver »**.

### Activer

1. Créez d'abord un autre compte administrateur, avec un mot de passe : c'est par lui qu'on reprend la main en secours.
   Sans lui, l'écran refuse d'activer (« Bloquant »).
2. Ouvrez la session du compte de la borne, avec Cyber Pinball installé (`<racine>\app\CyberPinball.exe` ; depuis les sources, l'activation est refusée).
3. Menu système > « Borne » > « Borne dédiée » : l'écran dit ce qui change et vérifie l'édition de Windows et le compte de secours.
4. « Activer pour ce compte » : Windows demande l'autorisation (UAC ; le mot de passe d'un administrateur si le compte de la borne est un compte standard).
   Un seul script, `<données>\borne-dediee\activer.ps1`, relève l'état de Windows, active les fonctions facultatives, met l'Explorateur comme shell des autres comptes s'il ne l'était pas, donne à ce compte la commande `"<racine>\app\CyberPinball.exe" --borne-dediee`, met Shell Launcher en service, puis relève de nouveau l'état ; l'écran vérifie chaque point.
   Une activation qui échoue en route remet l'état d'avant d'elle-même.
5. Redémarrez le PC : la session s'ouvre sur Cyber Pinball.
   Si Windows demande un redémarrage pour activer les fonctions, l'écran le dit ; après le redémarrage, « Terminer l'activation ».

Sont gardés dans `<données>\borne-dediee` : `etat.json` (l'état de Windows d'avant, référence de la désactivation) et `desactiver.ps1` (le script de secours).

### Revenir en arrière

Menu système > « Borne » > « Borne dédiée » > « Désactiver et rétablir le bureau » (autorisation de Windows).
Le script remet chaque point dans son état d'avant, le relit, puis désactive les fonctions facultatives si elles l'étaient ; l'écran compare point par point et marque chacun « Vérifié ».
Une différence reste affichée (« Bloquant »), et l'état d'avant est gardé pour réessayer.
Le bureau revient à la prochaine ouverture de session ; les fonctions sont retirées tout à fait au prochain redémarrage.

| Point | Activer | Désactiver |
| --- | --- | --- |
| Démarrage du compte de la borne (`SetCustomShell`) | Cyber Pinball, relancé à toute sortie sauf le code 77 | le réglage d'avant, ou aucun |
| Shell Launcher en service (`SetEnabled`) | oui | la valeur d'avant |
| Démarrage des autres comptes (`SetDefaultShell`) | `explorer.exe`, s'il ne l'était pas | la valeur d'avant |
| Valeur `Shell` de `HKLM\…\Winlogon` (réécrite par `SetEnabled`) | pas écrite par Cyber Pinball | la valeur d'avant, vérifiée |
| Fonctions facultatives | activées | désactivées, si elles l'étaient |

### Secours

- **Sur la borne** : Ctrl+Alt+Suppr, puis « Gestionnaire des tâches » ; Fichier > Exécuter une nouvelle tâche : `explorer.exe` (une fenêtre de fichiers) ou tout autre programme.
  Ou Ctrl+Alt+Suppr, « Se déconnecter », puis la session du compte administrateur, qui garde le bureau.
  Shell Launcher ne bloque pas Ctrl+Alt+Suppr (le filtre clavier de Windows le ferait, mais Cyber Pinball ne l'active pas).
- **Depuis le compte administrateur, sans Cyber Pinball** : dans PowerShell lancé en administrateur, le script de secours remet l'état d'avant, comme « Désactiver », et affiche son résultat ; à la prochaine ouverture de l'écran « Borne dédiée », Cyber Pinball le relit, le vérifie et oublie l'activation.

```powershell
powershell -ExecutionPolicy RemoteSigned -File "D:\CyberPinball\data\borne-dediee\desactiver.ps1"
```

- **Cyber Pinball redémarre en boucle** (il plante au démarrage, Shell Launcher le relance) : Ctrl+Alt+Suppr, « Se déconnecter », compte administrateur, le script ci-dessus, puis redémarrer ; la cause est notée dans `<données>\logs\erreurs.txt`.
- **En dernier recours**, sans les fichiers de Cyber Pinball, dans PowerShell en administrateur (`Borne` : le nom du compte de la borne) :

```powershell
$sid = (New-Object System.Security.Principal.NTAccount('Borne')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$sl = [wmiclass]'\\localhost\root\standardcimv2\embedded:WESL_UserSetting'
$sl.RemoveCustomShell($sid)
$sl.SetEnabled($false)
```

### Sans Shell Launcher : Windows Pro et Famille

Sous Windows 11 Pro, Shell Launcher n'existe pas, et l'écran ne proposait rien.
Il propose maintenant, sur toutes les éditions, deux façons au choix, toujours pour le seul compte de la borne ; sous Entreprise, Éducation et IoT Enterprise, « Activer pour ce compte » reste Shell Launcher.

- **« Remplacer le bureau pour ce compte »** : la stratégie « Interface utilisateur personnalisée » (*Custom User Interface*, celle que règle `gpedit.msc` sous Configuration utilisateur > Modèles d'administration > Système), valeur `Shell` de `HKEY_USERS\<SID>\Software\Microsoft\Windows\CurrentVersion\Policies\System`, documentée par Microsoft et lue à l'ouverture de session.
  Elle vaut `"<racine>\app\CyberPinball.exe" --borne-compte`.
  Une stratégie n'est modifiable qu'en administrateur : Windows demande l'autorisation (UAC), à l'activation et à la désactivation.
  Mêmes conditions que Shell Launcher : un autre compte administrateur, une installation.
- **« Lancer au démarrage de Windows »** : le raccourci `Cyber Pinball.lnk` dans le dossier Démarrage du compte (le même que la case de l'installeur), et le bureau masqué derrière : fond d'écran vide (`Control Panel\Desktop\WallPaper`), couleur de fond noire (`Control Panel\Colors\Background` = `0 0 0`), icônes masquées (`Explorer\Advanced\HideIcons` = 1).
  Sans UAC.
  Le bureau, noir, se voit 1 à 2 s avant que Cyber Pinball couvre les écrans.
  Aussi dans Menu système > « Borne » > « Lancement au démarrage », qui ouvre la même page et dit dans son libellé si Cyber Pinball se lance déjà (raccourci de l'installeur compris).

**Le surveillant.**
Windows ne relance pas un shell qui se ferme ; Cyber Pinball le fait lui-même, comme Shell Launcher : `--borne-compte` démarre un processus sans fenêtre (`app/src/supervisor.ts`, appelé par `main.ts` avant tout le reste) qui lance `CyberPinball.exe --borne-dediee` et le relance à chaque sortie, plantage compris.
Tout ce que décrit « Ce que la borne dédiée change ailleurs » vaut donc tel quel (relances, code 77 d'une mise à jour, après lequel le surveillant s'arrête).
Si Cyber Pinball sort 5 fois en 2 minutes, le surveillant ouvre l'Explorateur et s'arrête, plutôt que de laisser un écran noir (`supervisorVerdict`).
Il note son départ dans `<données>\borne-dediee\surveillant.json`.

**La sauvegarde.**
Avant toute écriture, le script (`<données>\borne-dediee\reglages-ecrire.ps1`, généré) relève chaque réglage qu'il va changer, valeur absente comprise ; ce relevé est enregistré dans `reglages-windows.json` et l'écran le montre (« Sauvegarde du … : « Désactiver » remet », avant et maintenant, réglage par réglage).
« Désactiver et rétablir le bureau » ou « Ne plus lancer au démarrage » remet la sauvegarde telle quelle puis la vérifie, réglage par réglage (« Vérifié »).
Une écriture qui échoue en route remet l'état d'avant d'elle-même.
Le script de secours `retablir-reglages.ps1` fait la même remise hors de Cyber Pinball ; l'écran relit ensuite son résultat et oublie l'activation :

```powershell
powershell -ExecutionPolicy RemoteSigned -File "D:\CyberPinball\data\borne-dediee\retablir-reglages.ps1"
```

Sur la borne bloquée : Ctrl+Alt+Suppr, « Gestionnaire des tâches », Fichier > Exécuter une nouvelle tâche, cette commande, en cochant « Créer cette tâche avec des privilèges d'administration » si le bureau est remplacé.

**Diagnostic.**
Bureau remplacé : si le PC a redémarré depuis l'activation et que la session s'ouvre pourtant avec le bureau, l'écran le dit en rouge, « Windows n'a pas appliqué le réglage » (le surveillant n'est pas parti) ou « Le surveillant a rendu la main à l'Explorateur » (Cyber Pinball se fermait en boucle, cause dans `erreurs.txt`).
Dans le premier cas, se rabattre sur « Lancer au démarrage de Windows ».

Code : [packages/core/src/windowssettings.ts](../../packages/core/src/windowssettings.ts) (script, Windows simulé, jugement, règle du surveillant), [app/src/supervisor.ts](../../app/src/supervisor.ts), l'écran et l'exécuteur ci-dessus.
Tests : [windowssettings.test.ts](../../packages/core/src/test/windowssettings.test.ts) fait tourner le vrai script sur une couche simulée et le compare au simulateur, pour chaque façon et chaque point de départ, désactivation et échec en route compris ; [dedicated-menu.test.ts](../../packages/core/src/test/dedicated-menu.test.ts) parcourt les deux façons sous Windows Pro et fixe l'invariant : une écriture ne part que des actions de l'écran.

### Ce que la borne dédiée change ailleurs

- **Relances** (front-end ↔ assistant, langue, configuration de la borne) : Shell Launcher ne surveille que le processus qu'il a lancé.
  Celui-ci note ses arguments (`<données>\borne-dediee\relance.json`, valables une minute), se ferme, et Shell Launcher le relance ; le nouveau les reprend.
  Entre les deux, l'écran est noir un instant (sans Explorateur, il n'y a pas de bureau à voir).
- **Fermeture ou plantage** : Shell Launcher relance Cyber Pinball.
  « Quitter Cyber Pinball » disparaît du front-end (il ne ferait que relancer) ; « Redémarrer Cyber Pinball » reste.
- **Mise à jour** : Cyber Pinball se ferme avec le code 77, pour lequel Shell Launcher ne fait rien ; l'installeur (ou `maj-legere.js`) le relance, comme d'habitude.
  Ce Cyber Pinball-là n'est plus surveillé par Shell Launcher jusqu'à la prochaine ouverture de session : s'il se ferme, il se relance lui-même, mais un plantage n'est plus rattrapé.
  Redémarrer le PC après une mise à jour rétablit la surveillance.
- **« Bureau Windows » devient « Ouvrir l'Explorateur Windows »** : sans Explorateur, il n'y a ni bureau ni barre des tâches.
  L'entrée ouvre une fenêtre de l'Explorateur (sous Shell Launcher, `explorer.exe` lancé à part n'ouvre qu'une fenêtre de fichiers : il ne devient le shell, avec bureau et barre des tâches, que si la valeur `Shell` de Winlogon est la sienne ; comportement rapporté par des sources tierces, à confirmer sur la borne), puis libère tous les écrans comme le mode bureau ; Ctrl+Maj+D ou Alt+Tab ramène le front-end.
- **Barres des tâches** : sans Explorateur, il n'y en a aucune ; leur masquage pendant une partie (gardien des écrans) ne trouve rien à masquer, et ne rétablit toujours que ce qu'il a masqué.
- **Barres des tâches en borne lancée au démarrage** : quand « Lancer au démarrage de Windows » ou « Remplacer le bureau » est activé (`reglages-windows.json`, `etat.json`), que le raccourci `Cyber Pinball.lnk` est dans le dossier Démarrage du compte (case de l'installeur comprise) ou que Cyber Pinball est le shell, les barres des tâches sont masquées **toute la session**, pas seulement pendant les parties (`cabinetHidesTaskbars`, `packages/core/src/coexistence.ts`).
  Celles que l'Explorateur crée après Cyber Pinball au démarrage de Windows, ou réaffiche, sont masquées dès qu'elles apparaissent (relecture toutes les 50 ms).
  Elles reviennent quand on retourne sur Windows : « Bureau Windows » du front-end ou Ctrl+Maj+D (elles se masquent de nouveau au retour au front-end), et « Quitter Cyber Pinball » (`restoresTaskbarsAt` : seulement `desktop` et `quit`).
  Une relève (front-end ↔ assistant, langue) les passe au nouveau processus sans qu'elles se montrent.
  Si Cyber Pinball s'arrête sans les rendre (plantage, arrêt forcé), un PowerShell caché lancé au premier masquage (`taskbarRescueScript`) attend la fin du processus, puis 8 s, et, si aucun Cyber Pinball ne l'a relayé et que le témoin `<données>\barres-des-taches-masquees` est encore là, réaffiche les barres qu'il désigne et le retire.
  Lancé à la main sans ce réglage, Cyber Pinball ne masque les barres que pendant les parties, comme avant.
  Tests : `coexistence.test.ts`.
- **Assistant au premier démarrage** : il ne propose pas la borne dédiée (désactivée par défaut, autorisation de Windows nécessaire).
  En borne dédiée, l'assistant tourne comme le front-end, et le quitter relance Cyber Pinball.
- **Raccourci « au démarrage de Windows » de l'installeur** : sans effet en borne dédiée (le dossier Démarrage est lancé par l'Explorateur).
  C'est le même que celui de « Lancer au démarrage de Windows » (`Cyber Pinball.lnk`) ; l'écran le signale et propose « Retirer le lancement au démarrage ».
- **Désinstallation** : si `etat.json` ou `reglages-windows.json` est encore là, le désinstalleur prévient (sans Cyber Pinball, la session pourrait s'ouvrir sur un écran noir) et ne continue qu'à la demande : il n'a pas les droits pour défaire ces réglages.
