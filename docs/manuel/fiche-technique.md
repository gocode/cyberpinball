[English](../manual/tech-sheet.md) · Français · [Sommaire du manuel](../manuel.md)

## Fiche technique

Menu système > « Ma borne » > « Santé et sauvegardes » > « Fiche technique » récapitule tout ce qui compose la borne, pour repérer un problème soi-même ou le décrire à qui aide, et fait le rapport à lui transmettre.
La page montre six blocs, chacun avec son état écrit (« ✓ OK », « ! À vérifier », « ✕ Bloquant », jamais la couleur seule) et l'essentiel en une ligne ; Start ouvre le détail du bloc, en grille « libellé | valeur » (toutes les valeurs partent du même bord, `Section.kind` `spec`, `Row.label`), suivi de ses points « À vérifier » expliqués et des entrées du front-end qui réparent.

| Bloc | Ce qu'il montre | Ce qu'il propose |
| --- | --- | --- |
| PC | Disques d'abord (modèle, NVMe, SSD ou disque dur, place libre), puis processeur, mémoire (barrettes, fréquence, part utilisée), carte graphique et la version de son pilote (celle de NVIDIA, « 566.36 », pas celle de Windows), carte mère et BIOS, réseau, démarrage de Windows | Téléchargements (faire de la place) |
| Windows | Édition et build, redémarrage en attente, mode d'alimentation et délais d'écran et de veille, mode Jeu, planification GPU, notifications, Visual C++, langue et clavier | Redémarrer la borne (s'il y a une mise à jour en attente), Borne dédiée |
| Écrans | Chaque écran branché, par son rôle dans la configuration retenue : modèle, diagonale, définition, fréquence, connexion (HDMI, DisplayPort…), fréquence la plus haute annoncée quand il en a une, échelle de Windows, rotation ; puis la configuration retenue et ses écrans trouvés | Configuration de la borne |
| Contrôleurs | Boutons (Pinscape, clavier ou encodeur, nombre de boutons configurés), lanceur, accéléromètre, contrôleurs DOF | Commandes de la borne, LED et retours (DOF) |
| Logiciels | VPX et la version que Cyber Pinball connaît (« facultative » : une information, pas une panne), les plugins de VPX trouvés dans son dossier `plugins` et leur état dans `VPinballX.ini` (PinMAME, B2S, DOF, FlexDMD, PUP, Serum, AltSound, DMDUtil d'abord), les tables avec un PuP-Pack ; les fichiers de VPX remplacés hors de Cyber Pinball, nommés avec leur version (« Fichiers de VPX : 1 modifié », « SDL364.dll 3.2.18.0 ») | Installer la version connue de VPX, Réglages de VPX, Santé de la borne (« Remettre les fichiers d'origine ») |
| Cyber Pinball | Version et préversions, mode (borne ou bureau), borne dédiée, dossier des données, tables et tables prêtes, réseau des amis, téléphones jumelés, erreurs du journal depuis hier, langue ; en dernière ligne, le numéro de la borne | Mise à jour de Cyber Pinball, Activité récente |

**Relevé.**
Un script PowerShell sans fenêtre ni autorisation (`TECH_PROBE_SCRIPT`, [app/src/tech-facts.ts](../../app/src/tech-facts.ts)) lit le PC et Windows (CIM, registre, `powercfg`, `Get-Disk`, `Get-NetAdapter`) ; il dure quelques secondes à vingt secondes et tourne à part, sans bloquer le front-end.
Il passe par un fichier `.ps1` lisible, jamais encodé, avec la politique d'exécution `RemoteSigned`, et ne relève pas les antivirus installés : les deux ensemble faisaient prendre Cyber Pinball pour un cheval de Troie (voir « PowerShell et antivirus » dans [Installation et organisation des fichiers](installation-et-organisation-des-fichiers.md#signature)).
Chaque partie est dans son propre `try` : ce qui échoue reste absent et la ligne dit « Non relevé », rien n'est affirmé.
`probeDisplayLinks` ([win-displays](../../packages/win-displays/src/index.ts)) donne la connexion de chaque écran (`DISPLAYCONFIG_PATH_TARGET_INFO.outputTechnology`), sa fréquence, la plus haute que Windows propose à sa définition (`EnumDisplaySettingsExW`, `displayRefresh`) et celle que l'écran annonce dans son EDID (descripteur « limites de balayage », `edidMaxRefresh`).
Le rôle de chaque écran vient de son empreinte, comme pour la santé (`techDisplays`).
La page s'ouvre aussitôt sur le dernier relevé, gardé dans `<données>\cache\fiche.json`, puis le refait ; « Relever à nouveau » le relance.
Les essais remplacent le relevé par un fichier (`CYBERPINBALL_FICHE`).

**Fréquence des écrans.**
Un écran sous sa fréquence est « À vérifier », sans affirmer une cause qui n'est pas établie (`refreshGap`, `refreshNote`) : si Windows propose plus à cette définition, la ligne le dit (« Playfield à 60 Hz, Windows propose 144 Hz ») et renvoie aux paramètres d'affichage ; si seul l'écran annonce plus, elle demande de vérifier le port et le câble, et rappelle, en HDMI seulement, que certains câbles et cartes plafonnent la 4K à 60 Hz.
Un écart d'un hertz (59,94 Hz) ne compte pas.

**Numéro de la borne.**
La dernière ligne du bloc Cyber Pinball, en retrait, donne le numéro de la borne (« 7KQ2-M9XD »), à donner à l'équipe de Cyber Pinball pour qu'elle retrouve les rapports de cette borne.
Il est tiré de l'identifiant de borne que portent les rapports (une empreinte, sans retour possible à l'identifiant, `borneCode` de [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts)), en huit caractères de l'alphabet de Crockford (ni I, L, O ni U, qu'on confond au téléphone) ; il ne dit rien du joueur.
Il est enregistré dès sa première lecture, et ne change plus d'un démarrage à l'autre.
Test : `numero-borne.test.ts`.

**Dans la santé de la borne.**
Chaque relevé met à jour le groupe « PC et Windows » de [Santé de la borne](sante-de-la-borne.md#santé-de-la-borne) (`HealthFacts.pc`, `pcLines`), sans refaire le reste : écrans sous leur fréquence, redémarrage de Windows en attente, mode d'alimentation (« Économie d'énergie » à vérifier), pilote graphique de plus de deux ans, moins de 8 Go de mémoire.
Chaque ligne ouvre le bloc de la fiche qui l'explique (cible `sheet`), dont le « Retour » ramène à la santé.

**Envoyer un rapport.**
Un ZIP `rapport-borne-AAAA-MM-JJ.zip` (`buildReport`, [packages/core/src/techsheet.ts](../../packages/core/src/techsheet.ts)) : `rapport.html` (la fiche et la santé, une page autonome, sans script ni ressource externe, lisible et imprimable partout), `probleme.txt` (ce que le joueur a écrit par « Décrire le problème », au téléphone ou au clavier, s'il l'a fait), `resume.txt`, `sante.json`, `fiche.json`, le journal de Cyber Pinball des sept derniers jours (`journalSince`), celui de VPX de la dernière partie, `VPinballX.ini` et `configurations.json`.
Chaque partie y est mesurée : le journal de Cyber Pinball a la ligne « Cadence de la partie » de chacune (images par seconde tenues par VPX pour la cadence visée, arrêts de l'image, mémoire prise par VPX, verdict), et celui de VPX chaque à-coup à son heure et les bilans du plugin (voir « Cadence de chaque partie » dans [Lancement d'une partie](lancement-d-une-partie.md#lancement-dune-partie)).
Après un lancement échoué, le ZIP joint aussi le `crash.txt` de VPX (sa pile d'appels) ; un journal de VPX plus ancien que ce lancement, VPX s'étant arrêté avant d'écrire le sien, y est nommé `vpinball-partie-precedente.log` au lieu de `vpinball.log`.
Tout est **anonymisé avant l'écriture** (`anonymizer`) : dossier du profil et nom du compte (`‹utilisateur›`), nom du PC (`‹PC›`), noms du joueur, de la borne et des amis (`‹ami 1›`…), adresses IPv4 et IPv6, adresses e-mail ; les empreintes et numéros de série des écrans deviennent « écran 1 », « écran 2 ».
Les numéros de version, de pilote et les heures restent lisibles.
« Voir le contenu du rapport » liste chaque fichier, sa taille et ce qui est remplacé.
Cinq destinations, la borne n'ayant pas de messagerie :

- **À l'équipe de Cyber Pinball** : le formulaire de [Retours et propositions](retours-et-propositions.md#retours-et-propositions), le rapport joint et la description reprise ; il part chiffré au service du projet.
- **Sur le téléphone connecté** (la télécommande, [Le téléphone comme télécommande du front-end](le-telephone-comme-telecommande-du-front-end.md#le-téléphone-comme-télécommande-du-front-end)) : le téléphone reçoit une feuille « Rapport de la borne » avec « Télécharger le rapport », « Préparer un e-mail » (un lien `mailto:` qui ouvre sa messagerie avec le résumé, `reportMailto` ; on y joint le fichier téléchargé) et « Copier le résumé » (pour un forum ou WhatsApp).
  La page du téléphone est en HTTP : le partage du système (`navigator.share`) et le presse-papiers moderne n'y sont pas permis, d'où ces trois gestes.
  Le ZIP est servi par la borne sous un jeton tiré au hasard, à l'adresse de ce téléphone seulement, pendant dix minutes (`offerReport`, `REPORT_MS`, [phone-remote.ts](../../app/src/phone-remote.ts)) ; il passe en clair sur le réseau local, comme tout téléchargement, mais il est déjà anonymisé.
  Sans téléphone connecté, la ligne devient « Connecter un téléphone » et ouvre le QR code de la télécommande.
- **Sur une clé USB** : une ligne par clé branchée, le rapport écrit dans `Rapports Cyber Pinball` puis relu ; « Éjecter la clé » suit.
  Sans clé, la ligne reste visible, grisée avec sa raison.
- **À un ami** : le résumé court (500 caractères au plus, les points à voir d'abord, `reportShort`) part dans le fil de la messagerie, suivi de la description du problème ; la messagerie ne transporte que du texte, le fichier complet passe par le téléphone ou une clé.
  Grisé sans ami, ou réseau des amis coupé.
- **Dans un dossier de la borne** : `<données>\rapports`, à copier soi-même.

Code : blocs, contrôles, anonymisation et rapport dans [packages/core/src/techsheet.ts](../../packages/core/src/techsheet.ts) ; relevé dans [app/src/tech-facts.ts](../../app/src/tech-facts.ts) ; écrans dans [app/src/tech-sheet.ts](../../app/src/tech-sheet.ts) ; page du téléphone dans `app/renderer/telephone/telephone.js` (`reportOffer`).
[techsheet.test.ts](../../packages/core/src/test/techsheet.test.ts) fixe la lecture du relevé, la version d'un pilote NVIDIA, les fréquences, les contrôles de la santé, les blocs, l'anonymisation (jamais le compte, le PC ni une adresse dans aucun fichier du ZIP) et le résumé court.

**Cartes graphiques.**
La fiche technique cite toutes les cartes graphiques dans son résumé et nomme la carte concernée par chaque alerte de pilote, sans déduire laquelle est utilisée par la partie.
