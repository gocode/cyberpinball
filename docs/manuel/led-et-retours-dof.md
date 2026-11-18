[English](../manual/led-and-feedback-dof.md) · Français · [Sommaire du manuel](../manuel.md)

## LED et retours (DOF)

DOF (DirectOutput Framework) allume les LED, flashers, contacteurs, knocker et vibreur de la borne pendant les parties, d'après la configuration faite sur [configtool.vpuniverse.com](https://configtool.vpuniverse.com).
En mode plugins, VPX 10.8.1 l'embarque : son plugin `DOF` lie libdof (vpinball/libdof `eef645d`, épinglé par VPX `af26b2d93`).
Rien à installer.

**Ce que libdof lit** (sources de libdof citées dans [dof.ts](../../packages/core/src/dof.ts)) :

- `GlobalConfig_B2SServer.xml` dans `%APPDATA%\VPinballX\10.8\directoutputconfig\` (le dossier de préférences de VPX, quel que soit le `-Ini` passé par Cyber Pinball), sinon dans `.\directoutputconfig\` du dossier de VPX ;
- les `directoutputconfig<N>.ini` (ou `ledcontrol<N>.ini`) du configtool, cherchés dans `IniFilesPath`, puis le dossier de la table, puis le dossier du GlobalConfig, puis le dossier de VPX : **le premier dossier qui en contient gagne** ;
- `Cabinet.xml` seulement si `CabinetConfigFilePattern` du GlobalConfig le désigne.
  Sans lui, libdof ne trouve seul que Pinscape, Pinscape Pico, LedWiz, DudesCab, UMX, PacLed64, PacDrive, Ultimate I/O, FT245R et PinOne.
  **Teensy, Wemos D1, PinControl et Art-Net n'existent pour lui que déclarés dans Cabinet.xml** ;
- le plugin ne démarre que pour une table à ROM PinMAME : les tables électromécaniques et originales sans ROM n'ont pas de retours en mode plugins.

**LED adressables et KL25Z.**
La KL25Z (Pinscape) pilote des sorties tout-ou-rien ou à variation, pas le signal de données des bandes WS2812 : des bandes branchées dessus ne s'allument jamais.
Il leur faut un contrôleur à elles (Teensy avec TeensyStripController, Wemos D1 avec WemosD1MPStripController, DudesCab, Pinscape Pico), déclaré dans `Cabinet.xml`.
La KL25Z garde les boutons, le lanceur et les sorties classiques.
L'écran le dit quand il voit une KL25Z sans contrôleur de LED adressables.

**Contrôleurs reconnus sans rien ouvrir.**
`detectDofControllers` lit les identifiants USB par la liste passive de `probeUsbDevices` (comme les DMD réels) :

| Contrôleur | Identifiant USB | `directoutputconfig<N>.ini` |
| --- | --- | --- |
| Pinscape KL25Z | `FAFA:00F0`–`00FF` (unité = PID & 0xF + 1) ou `1209:EAEA` | 50 + unité (51 par défaut) |
| LedWiz | `FAFA:00F0`–`00FF`, `20A0` de zebsboards | unité (1 à 16) |
| Pinscape Pico | nom du produit « Pinscape Pico » | 119 + unité |
| DudesCab | `2E8A:106F` | 90 + unité − 1 |
| PacLed64, PacDrive, Ultimate I/O | `D209:1401`–`1404`, `D209:1500`, `D209:0410`–`0411` | 20–23, 19, 27–28 |
| SainSmart / FT245R | `0403:6001` (identifiant FTDI courant : signalé incertain) | 40 + rang |
| Teensy (LED adressables) | `16C0:0483` (série de PJRC) | celui du `LedWizEquivalent` de Cabinet.xml, 30 pour le configtool |

`FAFA:00Fx` est commun au LedWiz et au Pinscape en émulation LedWiz : un LedWiz n'étant jamais un joystick, un tel périphérique relevé comme joystick à l'étape « Boutons » est un Pinscape (`cabinetJoystickHids`, d'après les identifiants portés par le jeton SDL).
Sinon, les deux numéros sont proposés.
Le numéro d'unité d'un Pinscape natif ou d'un DudesCab est réglé sur la carte : 1 est supposé, et dit.

**Ce que Cyber Pinball écrit.**

- `[Plugin.DOF] Enable = 1` (clé gérée, `vpxDofSettings`) dès qu'un contrôleur est branché, déclaré dans Cabinet.xml, ou que des ini existent.
  Sinon rien : le plugin reste tel que VPX ou l'utilisateur l'a laissé.
  Changée à la main, elle est signalée comme les autres clés gérées.
- Les ini du configtool, à l'import (voir plus bas) : ils remplacent tous les `directoutputconfig*.ini` et `tablemappings.*` d'avant, mis de côté dans `<données>\sauvegardes\dof\<date>\`.
- `Cabinet.xml` et `GlobalConfig_B2SServer.xml` (`IniFilesPath` et `CabinetConfigFilePattern` sur `{GlobalConfigDir}`) quand on décrit des LED adressables, **seulement si le fichier est absent ou porte la marque « Written by Cyber Pinball »** (`planLedWrite`).
  Un fichier écrit à la main n'est jamais remplacé : l'écran dit lequel et pourquoi.
  Un GlobalConfig écrit à la main qui désigne déjà un Cabinet.xml est suivi.

Le dossier est **commun à tout VPX 10.8 du PC** (un autre front-end de borne compris) : c'est la même borne, les mêmes contrôleurs.

**Menu système > « Borne » > « LED et retours (DOF) »** ([app/src/dof-menu.ts](../../app/src/dof-menu.ts)) :

- **Contrôleurs** : ceux reconnus à l'USB (avec le numéro d'ini qu'ils lisent) et ceux seulement déclarés dans Cabinet.xml ;
- **Configuration** : les ini trouvés et leur dossier, le nombre de ROM configurées, Cabinet.xml (écrit par Cyber Pinball ou à la main, nombre de bandes) ;
- **À vérifier** (`dofFindings`) : aucun ini ; contrôleur sans son ini ; Teensy branché mais non déclaré ; Cabinet.xml présent mais qu'aucun GlobalConfig ne désigne ; port COM de Cabinet.xml absent ; type de contrôleur que libdof ne gère pas (SSF, Hue) ; bande qu'aucune sortie ne vise ; `LedWizEquivalent` sans son ini ; `IniFilesPath` introuvable ; fichier illisible ; LED adressables sans Cabinet.xml ; configuration d'un ancien DOF que le plugin ne lit pas.
  **LED adressables sans Cabinet.xml** (`addressableIniUndeclared`) : un `directoutputconfig30.ini` à `39.ini` (les contrôleurs de LED adressables du configtool) sans `LedWizEquivalent` de ce numéro dans un Cabinet.xml lu par libdof, qui ne crée alors jamais le contrôleur : les bandes restent éteintes.
  Le constat donne le port série probable de leur contrôleur, sans rien ouvrir (`addressablePortGuess`) : celui d'un Teensy reconnu, sinon celui d'un pont USB-série CH340 ou CP210x (Wemos D1, ESP32).
  « Bandes de LED adressables… » passe alors en ambre (« Vos fichiers du configtool attendent des LED adressables : dites ici où elles sont branchées ») et l'éditeur part de ce port.
  Rien n'est signalé avec un DudesCab ou une Pinscape Pico, qui portent eux-mêmes leurs bandes ;
- **Configuration d'un ancien DOF** (`legacyIni`) : une borne qui vient de PinUP Popper, PinballX ou PinballY garde sa configuration du configtool dans le dossier de son DOF classique (`…\DirectOutput\Config`), que le plugin DOF de VPX ne lit pas.
  Quand le dossier lu par le plugin n'a aucun ini, Cyber Pinball cherche un DOF classique sur les disques fixes, sans rien ouvrir : `<disque>\DirectOutput` et `<disque>\<dossier>\DirectOutput` (C:\DirectOutput, C:\vPinball\DirectOutput, Program Files…), relevés une fois (`legacyDofInstalls`, `app/src/dof-files.ts`) ; ses ini sont lus là où son GlobalConfig les désignait.
  L'écran et la Santé de la borne montrent le dossier trouvé, ses fichiers et leur date.
  **« Reprendre la configuration de l'ancien DOF »**, en tête des actions (trois anciens DOF au plus), y copie ses `directoutputconfig*.ini` et `tablemappings.*` (`planLegacyDofImport`), en mettant de côté ceux d'avant dans `<données>\sauvegardes\dof\<date>\` ; le dossier de l'ancien DOF ne change pas.
  Son GlobalConfig n'est jamais repris : le plugin DOF de VPX n'en a pas besoin.
  Son Cabinet.xml (Teensy, LED adressables), s'il en a un, est examiné à part (`planLegacyCabinet`) : repris seulement s'il est lisible, que libdof gère tous ses contrôleurs, que chaque bande a son contrôleur déclaré, que les ports COM qu'il nomme sont branchés et qu'aucun Cabinet.xml n'est déjà dans le dossier de DOF.
  Quand les ini repris ont des LED adressables (30 à 39), un Cabinet.xml cohérent est repris dans le même geste, avec un GlobalConfig de Cyber Pinball qui le désigne.
  Sinon un écran « Cabinet.xml de l'ancien DOF » dit ce qu'il déclare et, s'il y a lieu, « Pourquoi il n'est pas repris », avec « Reprendre ce Cabinet.xml » ou « Décrire les bandes dans Cyber Pinball… », et « Ne pas le reprendre » ;
- **« Ouvrir configtool.vpuniverse.com »** : la page s'ouvre dans « Récupérer », avec son compte VPUniverse ; le ZIP de « Generate Config » revient à l'écran et s'importe.
  Le site est derrière un défi Cloudflare : aucun téléchargement automatique, c'est l'utilisateur qui clique ;
- **« Importer la configuration du configtool… »** : un ZIP déjà téléchargé (`planDofImport`) ; un ZIP sans `directoutputconfig*.ini` est refusé ; un Cabinet.xml ou un GlobalConfig du ZIP n'écrase jamais un fichier présent ;
- **« Bandes de LED adressables… »** : la carte d'abord, en trois familles (libdof : `LedStrip` exige un contrôleur qui reçoit des valeurs, `ISupportsSetValues`) :
  - **Teensy (TeensyStripController) et Wemos D1** : port série (choisi parmi les ports branchés, ou saisi), sorties de la carte.
    Sans Teensy reconnu, l'éditeur part d'une Wemos D1 sur le pont USB-série trouvé (CH340, CP210x).
    Une Wemos D1 reçoit d'office, dans Cabinet.xml, les réglages qu'attend son micrologiciel (`WEMOS_SETTINGS`) : `ComPortBaudRate` 2 000 000 bauds, `UseCompression` et `SendPerLedstripLength` (longueur par bande), avec les délais du port série d'un Cabinet.xml éprouvé.
    Sans eux, libdof lui applique ceux du Teensy : 9600 bauds, et rien ne s'allume.
    Un Cabinet.xml relu dans l'éditeur garde tous les réglages de son contrôleur, réécrits tels quels à l'enregistrement ;
  - **Art-Net** (WLED sur un ESP32, ou tout autre nœud Art-Net) : adresse IP du nœud (vide : diffusion sur tout le réseau) et premier univers (0 pour WLED) ; un contrôleur `ArtNet` par univers, chacun de 512 canaux, soit 170 LED au plus (`ArtNet.h`, `DMX_CHANNELS`), la numérotation repartant de 1 à chaque univers ; une bande plus longue se coupe en deux bandes sur deux univers.
    **Alignement avec WLED** (`wledSegments`) : en « Multi RGB », WLED range 170 LED par univers à la suite (LED k : univers de départ + k ÷ 170, canaux 3 × (k mod 170) + 1 à 3).
    Une bande de DOF ne débordant jamais d'un univers, elle commence dans WLED à 170 × (son univers − le premier) + sa `FirstLedNumber` − 1 : pour une bande par univers, « Start » 0, 170, 340, 510 dans LED Preferences, avec des trous dans la numérotation.
    Avec des « Start » à la suite (0, 120, 240…), la deuxième bande recevrait les couleurs décalées.
    L'éditeur affiche, sous « Dans WLED (LED Preferences) », le « Start » et la longueur de chaque bande et le nombre total de LED, et l'avis d'enregistrement les répète.
    Réglages de WLED rappelés à l'écran : Config > Sync Interfaces > Realtime, réception « Art-Net », univers de départ, adresse DMX de départ 1, « Multi RGB » ; Config > WiFi Setup, « WiFi sleep » décoché ; un adaptateur de niveau rapide (74AHCT125, 74HCT245) entre l'ESP32 (3,3 V) et les bandes, les modules bidirectionnels à BSS138 étant souvent trop lents pour les WS2812.
    Art-Net est « prêt à tester » dans libdof, pas éprouvé ;
  - **DudesCab (mode MX, micrologiciel 1.9 ou plus récent) et Pinscape Pico** : les bandes se décrivent dans l'outil de la carte, que libdof lit sur la carte (`UMXController::UpdateCabinetFromConfig` crée lui-même les `LedStrip` du DudesCab ; les LED de la Pinscape Pico sont des sorties de la carte).
    L'éditeur l'explique, et « Ajouter une bande » et « Enregistrer » restent grisés avec cette raison : un `Cabinet.xml` les doublerait.

  Puis chaque bande : nom, sortie du contrôleur, colonnes × lignes, câblage (16 dispositions de libdof, serpentin compris), ordre des couleurs (GRB pour la plupart des WS2812), luminosité, sortie DOF (1, 4, 7… : celle du toy dans le configtool).
  Les LED sont numérotées d'un bout à l'autre du contrôleur, sortie 1 d'abord, les bandes d'une même sortie à la suite (`stripFirstLeds`).
  « Enregistrer » écrit les fichiers, sauvegarde ceux qu'il remplace, et dit quoi déclarer dans le configtool (contrôleur numéro 30, chaque toy sur sa sortie).
  Une description incomplète garde « Enregistrer » grisé, avec la raison.
  « Ajouter une bande » part d'un modèle : bande verticale à gauche ou à droite du playfield (1 × 120, première LED en haut), anneau autour d'un haut-parleur du fronton (24 × 1), matrice au fond du playfield (32 × 8 en serpentin), ou autre (1 × 60) ; chacun prend la première sortie libre du contrôleur et la sortie DOF suivante.
  L'éditeur rappelle le câblage d'un câble de données long jusqu'au fronton : câble Ethernet depuis l'OctoWS2811, chaque fil de données torsadé avec une masse, résistance de 100 à 330 Ω au départ, 5 V amené par son propre câble.
  Cas d'essai : une borne de référence, deux bandes de plus de 100 LED de part et d'autre du playfield et deux anneaux de haut-parleurs, chacun sur sa sortie (`dof.test.ts`) ;
- une fonction indisponible (VPX absent, navigateur intégré absent) reste visible, grisée, avec sa raison.

Rien n'est envoyé aux contrôleurs hors partie : aucun port n'est ouvert, aucune LED n'est allumée pour essai.
L'essai se fait en partie, sur une table à ROM PinMAME.

**Médecin d'une table** (`dofFindingsFor`, seulement sur une borne qui a des ini) : `dofLocalIni` (un `directoutputconfig*.ini` dans le dossier de la table masque celui de la borne quand `IniFilesPath` n'est pas réglé ; correction : le mettre à la corbeille), `dofNoPinmame` (table sans ROM : pas de retours en mode plugins), `dofNoConfig` (la configuration n'a rien pour sa ROM, selon les trois règles de libdof : égalité sans casse, puis `<rom>_…`, puis préfixe).
Jamais bloquant.

**Santé de la borne** : un contrôle « LED et retours (DOF) » (`dofLines`), absent sur une borne sans contrôleur ni configuration ; une ligne par point à vérifier (LED adressables sans Cabinet.xml et configuration d'un ancien DOF comprises), sinon « DOF prêt », chacune vers l'écran.

**DOF et DMD réel.**
Une Wemos D1 ou un ESP32 passe par le même pont USB-série courant (CH340, CP210x) qu'un ZeDMD générique.
Le port d'un contrôleur déclaré dans Cabinet.xml, ou un tel pont quand des LED adressables attendent encore leur contrôleur, n'est donc pas allumé d'office comme ZeDMD (voir [DMD réel](plugins-de-vpx-backglass-pup-et-dmd.md#plugins-de-vpx--backglass-pup-et-dmd)).

**Réglages de VPX** : l'onglet « Essentiels » a un groupe « Retours de la borne (DOF) » : `[Plugin.DOF] Enable` (gérée), et `[Controller] DOFContactors`, `DOFKnocker`, `DOFChimes`, `DOFBell`, `DOFGear`, `DOFShaker`, `DOFFlippers`, `DOFTargets`, `DOFDropTargets` : son de la table, DOF, ou les deux (défaut de VPX).
Seuls les scripts qui utilisent `controller.vbs` les lisent.

Essais : [dof.test.ts](../../packages/core/src/test/dof.test.ts) (identifiants, règles des ROM, lecture du dossier, Cabinet.xml écrit puis relu, fichiers à la main jamais remplacés, constats du cas réel au cas réglé, import, `[Plugin.DOF] Enable`) et trois tables piégées de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
En bac à sable, le dossier de DOF est `<bac à sable>\sandbox\directoutputconfig` (`CYBERPINBALL_DOF_DIR` pour un autre) ; `CYBERPINBALL_USB_DEVICES` simule les contrôleurs.
