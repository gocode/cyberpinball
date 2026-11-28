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
- le plugin ne démarre que pour une table à ROM PinMAME ; pour les tables originales (sans ROM) que ta configuration connaît, Cyber Pinball lance libdof à part (voir « Pendant la partie : tables à ROM et tables originales » plus bas).

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

**Menu système > « Ma borne » > « DMD et LED » > « LED et retours (DOF) »** ([app/src/dof-menu.ts](../../app/src/dof-menu.ts)) :

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

Hors animations des LED et essai d'une bande (voir plus bas), rien n'est envoyé aux contrôleurs hors partie.
L'essai des retours de la table se fait en partie.

**Tester une bande** (« Tester cette bande », dans l'écran de configuration de chaque bande, sans lancer de table).
Rouge, vert, bleu, blanc, chenillard (sens et longueur), début et fin de bande, ordre des couleurs, câblage de la matrice, luminosité, règle pour compter les LED, arc-en-ciel et « Tout éteindre ».
« Si tu vois… » trouve l'ordre des couleurs (GRB, RGB…) d'après ce que tu vois, et l'applique.
Teensy, Wemos D1 (port série) et Art-Net / WLED (réseau) sont pilotés directement ; DudesCab et Pinscape Pico se décrivent dans l'outil de leur carte et seul DOF les pilote.
Le port série des LED est rendu à DOF dès qu'une partie se prépare (toute table, tout jeu) : les LED s'éteignent, le port est fermé et ne se rouvre qu'au retour.
Un port pris par un autre programme, absent, ou une carte qui ne répond pas donne un message qui dit quoi faire.

**Animations des LED hors partie** (Menu système > Ma borne > DMD et LED > « LED et retours (DOF) » > « Animations des LED »).
Dans les menus et à la roue des tables, tes bandes de LED adressables montrent une ambiance aux couleurs de la table choisie, ou à une couleur fixe.
Les couleurs de la table sont jusqu'à quatre couleurs dominantes mesurées sur son fronton et son plateau (la roue ne sert qu'en dernier recours) : une table toute verte garde ses LED vertes.
Style « Florilège », par défaut : les effets s'enchaînent (comètes, faisceaux, vagues, étincelles, arcs-en-ciel…) aux couleurs de la table, un autre à chaque changement d'écran.
Les autres styles sont la respiration, le dégradé lent, le scintillement, la vague et les braises ; un style déjà choisi reste le tien.
Chaque changement de table lance un balayage dans le sens du défilement, l'ouverture d'une fiche une pulsation.
À l'ouverture de Cyber Pinball, les bandes jouent leur propre animation, calée sur celle de l'écran : un faisceau vert part du bas du plateau, côté flippers, monte jusqu'au milieu, puis explose en une onde verte ; elles se fondent ensuite dans l'ambiance des menus.
Les effets qui montent partent du bas, quel que soit le bout de la bande câblé en premier : le sens vient de la disposition déclarée de chaque bande.
Les animations se taisent dès qu'une partie se prépare (le port est rendu à DOF) et reviennent après.
Rien ne tourne sans bande décrite, avec les animations éteintes, ni sur une carte qui porte ses bandes ; 25 images par seconde au plus ; l'essai des bandes garde la main.
Réglages : allumer ou éteindre, style, luminosité maximale (de 0 à 100 % par pas de 10, 40 % au départ, jamais dépassée), vitesse, couleurs de la table ou couleur fixe, extinction après inactivité (30 minutes au départ) ; chaque choix se voit aussitôt sur les bandes.
Les pourcentages suivent la luminosité perçue : 50 % paraît moitié moins fort que 100 %, 10 % est la quasi-extinction, et la couleur tient jusqu'en bas sans paliers ; un réglage déjà fait garde la même lumière (30 % devient 60 %).
**Juke-box** : pendant la musique, les bandes suivent le son : les graves montent depuis le bas de la bande, les médiums éclairent le milieu, les aigus le haut, dans un dégradé aux couleurs de la pochette du morceau (arc-en-ciel à défaut, vert Cyber Pinball sans pochette).
Le niveau se règle tout seul sur quelques secondes, bande de fréquences par bande : la barre monte et descend vraiment avec le rythme, même sur un morceau fort et saturé.
Sans son, les bandes reprennent l'ambiance ; la luminosité maximale n'est jamais dépassée ; dès qu'une partie se prépare, le port est rendu à DOF.
Le réglage « Juke-box : les LED suivent la musique » (activé par défaut), dans « Animations des LED », l'active ou le coupe.

**Couleurs de la table affichée** (celles du DMD du front-end et des LED).
La couleur suit la table affichée à la roue : l'ordre est le fronton, puis le plateau, puis la roue.
Les couleurs sont plus franches : le bleu, le rouge, le violet et le rose ne sortent plus en pastel, la clarté s'adaptant à la teinte ; les couleurs déjà mesurées sont recalculées une fois, en tâche de fond.
Elles suivent plus vite le changement de jeu : les couleurs de toute la collection sont mesurées d'avance, en tâche de fond et seulement au repos (jamais pendant une partie), en partant du jeu affiché, et gardées sur le disque, donc déjà connues au démarrage suivant.
En défilement rapide, une table dont la couleur est connue la montre après un très court arrêt au lieu de l'attente complète.
Une seule mesure reste active à la fois : les vidéos des tables quittées ne s'accumulent pas.

**Pendant la partie : tables à ROM et tables originales.**
- Table à ROM PinMAME : DOF joue la configuration du configtool, comme avant.
  Une ROM dont la configuration n'anime presque rien sur les bandes reçoit des effets de repli qui réagissent au jeu (bobines, contacts, lampes de la ROM : flippers, slingshots, bumpers, flashers, éjections, knocker, rampes, bille servie, lanceur automatique), écrits à part dans la configuration DOF.
  Seuls les effets qui réagissent comptent : une configuration qui n'allume les bandes qu'en continu (éclairage général) est complétée ; une configuration riche n'est jamais touchée.
  Interrupteur « Effets LED ajoutés aux tables à ROM » (activé par défaut).
- Une table n'est une table à ROM que si son script appelle PinMAME **et** que le nom de sa ROM et son fichier sont sur la borne : les tables originales qui recopient ce code sans ROM (Stranger Things, par exemple) retrouvent leurs effets sans ROM.
  Le script est lu une fois dans le fichier de la table, sans lancer VPX.
  Pendant la partie, Cyber Pinball vérifie dans le journal de VPX que PinMAME a vraiment démarré ; sinon la partie passe aux effets sans ROM, et à l'inverse une table qui lance PinMAME rend les LED à DOF.
- Tables originales (sans ROM) que ta configuration DOF connaît (Space Cadet, Stranger Things, Matrix, City Hunter…) : le plugin DOF de VPX 10.8 ne démarre qu'avec une ROM, donc Cyber Pinball lance la libdof de VPX à part pendant la partie, avec le nom B2S de la table, et lui passe les événements du script, impulsions comprises.
  Tous les effets du configtool jouent alors, sur tout ton matériel (Pinscape, LedWiz, bandes de LED…).
  Les tables qui ont leur propre `Sub DOF` dans le script sont prises aussi : le `.vbs` de Cyber Pinball branche l'écoute dans la Sub, sans déplacer aucune ligne.
  Interrupteur « DOF des tables originales » (activé par défaut).
  Si le relais ne démarre pas ou s'arrête en cours de partie, les effets sans ROM prennent le relais (s'ils sont activés).
- Une configuration qui suit moins de la moitié des appels DOF que le script envoie vraiment sur les bandes (autre version du script, effets réservés aux toys) est complétée sur toutes les bandes : les événements les plus fréquents prennent les couleurs de la table, les plus rares des couleurs variées ; les effets de la config d'origine restent tels quels.
- Tables sans ROM ni config : interrupteur « Effets LED des tables sans ROM » (coupé par défaut), avec une intensité de 0 à 100 % par pas de 10, jamais au-dessus de la luminosité maximale des animations.
  Le rôle de chaque événement est lu dans le script de la table, et chacun a son effet : à chaque flip, une petite barre aux couleurs de la table part du bas de la bande, du côté du flipper, monte un peu (jamais plus de la moitié de la bande), pleine à la base et se fondant vers les LED éteintes, puis un petit tir file lentement vers le fond du plateau ; plusieurs coups d'affilée font plusieurs tirs.
  À l'envoi d'une bille, une comète monte toute la bande (éclair blanc au départ, étincelles en haut), au moment où la bille quitte le lanceur, tir manuel compris ; bille perdue : la comète redescend, en rouge.
  Jackpot, multibille et extra-bille : éclair blanc, vagues de couleurs et pluie d'étincelles ; bumpers, slingshots et éjecteurs : éclair à cœur blanc ; cibles, couloirs et spinners : petites vagues scintillantes ; tilt, début et fin de partie ont les leurs.
  Ce qui arrive souvent reste dans les couleurs de la table, mêlées à leur teinte voisine pour plus de profondeur ; les couleurs contrastées sont réservées aux moments rares.
  Les boutons de la borne (flippers, lanceur, start) et le lanceur analogique déclenchent aussi leur effet.
  Aucun effet ne clignote sans fin : chacun s'arrête seul en moins d'une seconde, les bandes sont éteintes entre deux événements, et l'éclairage général et les moteurs ne les allument pas.
  Une table originale dont le script n'appelle jamais DOF (Agentic) anime aussi ses slingshots, bumpers, cibles, soucoupes et récompenses d'après les sons qu'elle joue ; avec les effets de Cyber Pinball, une table à ROM anime les bandes sur tout ce qui se passe, lu dans les bobines de la ROM.
  Les sons de la table comptent toujours, même quand son script n'appelle DOF que pour les flippers, et un même événement donné par deux sources ne joue qu'une fois.
  Une animation de départ joue à l'ouverture de la partie.
  Les bandes sont éteintes et le port rendu à la fin de la partie.
  Pour cela, Cyber Pinball ajoute une courte écoute à `scripts/controller.vbs` de VPX (copie d'origine à côté, `controller.vbs.cyberpinball-avant`) : elle ne fait rien hors des parties lancées par Cyber Pinball et ne peut pas faire échouer le script.
- **Par table** : « Gérer la table » > « Effets LED de Cyber Pinball ».
  Activée, tes bandes jouent les effets de Cyber Pinball (dégradés, comète au lancer, couleurs de la table) au lieu de la config DOF de la table (utile quand une config communautaire allume tout d'une seule couleur), aussi pour une table à ROM.
  Les autres toys (bobines, contacteurs, lampes, moteurs) gardent la config DOF.
  Le choix prend effet à la partie suivante ; décoché, tout revient exactement comme avant.
  Une table sans effet DOF dans sa config, ou une borne sans bande décrite, n'a pas cette ligne.
- Le journal dit le mode LED de chaque partie (DOF avec sa ROM, relais DOF, ou effets sans ROM avec leurs couleurs et leur luminosité), le bilan des événements reçus et la part du temps où les bandes étaient allumées, et si les appels DOF du script n'atteignent aucune écoute.

**Diagnostic d'une table** (`dofFindingsFor`, seulement sur une borne qui a des ini) : `dofLocalIni` (un `directoutputconfig*.ini` dans le dossier de la table masque celui de la borne quand `IniFilesPath` n'est pas réglé ; correction : le mettre à la corbeille), `dofNoPinmame` (table sans ROM : retours par le relais DOF de Cyber Pinball seulement si ta configuration connaît la table), `dofNoConfig` (la configuration n'a rien pour sa ROM, selon les trois règles de libdof : égalité sans casse, puis `<rom>_…`, puis préfixe).
Jamais bloquant.

**Santé de la borne** : un contrôle « LED et retours (DOF) » (`dofLines`), absent sur une borne sans contrôleur ni configuration ; une ligne par point à vérifier (LED adressables sans Cabinet.xml et configuration d'un ancien DOF comprises), sinon « DOF prêt », chacune vers l'écran.

**DOF et DMD réel.**
Une Wemos D1 ou un ESP32 passe par le même pont USB-série courant (CH340, CP210x) qu'un ZeDMD générique.
Le port d'un contrôleur déclaré dans Cabinet.xml, ou un tel pont quand des LED adressables attendent encore leur contrôleur, n'est donc pas allumé d'office comme ZeDMD (voir [DMD réel](plugins-de-vpx-backglass-pup-et-dmd.md#plugins-de-vpx--backglass-pup-et-dmd)).

**Réglages de VPX** : l'onglet « Essentiels » a un groupe « Retours de la borne (DOF) » : `[Plugin.DOF] Enable` (gérée), et `[Controller] DOFContactors`, `DOFKnocker`, `DOFChimes`, `DOFBell`, `DOFGear`, `DOFShaker`, `DOFFlippers`, `DOFTargets`, `DOFDropTargets` : son de la table, DOF, ou les deux (défaut de VPX).
Seuls les scripts qui utilisent `controller.vbs` les lisent.

Essais : [dof.test.ts](../../packages/core/src/test/dof.test.ts) (identifiants, règles des ROM, lecture du dossier, Cabinet.xml écrit puis relu, fichiers à la main jamais remplacés, constats du cas réel au cas réglé, import, `[Plugin.DOF] Enable`) et trois tables piégées de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
En bac à sable, le dossier de DOF est `<bac à sable>\sandbox\directoutputconfig` (`CYBERPINBALL_DOF_DIR` pour un autre) ; `CYBERPINBALL_USB_DEVICES` simule les contrôleurs.
