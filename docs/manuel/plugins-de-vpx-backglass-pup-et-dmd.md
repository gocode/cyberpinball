[English](../manual/vpx-plugins-backglass-pup-and-dmd.md) · Français · [Sommaire du manuel](../manuel.md)

## Plugins de VPX : backglass, PuP et DMD

VPX 10.8.1 dessine lui-même le backglass, les packs PuP et le DMD par ses plugins (mode « plugins ») : `ScreenRes.txt`, `B2STableSettings.xml` et `DmdDevice.ini` n'y sont lus par personne.
Tout passe donc par `VPinballX.ini`.
Le mode classique (VPX 10.8.0, composants COM) viendra plus tard ; DOF passe par le plugin DOF de VPX (voir [LED et retours (DOF)](led-et-retours-dof.md#led-et-retours-dof)).

**Qui dessine sur chaque fenêtre.**
Plusieurs plugins peuvent dessiner sur les fenêtres Backglass, ScoreView (rôle DMD) et Topper.
Pour chaque image, VPX essaie leurs moteurs de rendu dans l'ordre décroissant de `Priority.<moteur>` et garde le premier qui dessine (`player.cpp`, `OnAuxRendererChanged`).
Sans ces clés, tous valent 0 et l'ordre dépend du chargement des plugins.
Un pack PuP ne dessine que quand il a une vidéo à montrer : placé devant, il laisse le backglass du .directb2s visible le reste du temps.

Clés écrites (`vpxSettingsFor` et `vpxPluginDefaults` dans `packages/core/src/vpx.ts`, `packages/core/src/dmd.ts`) :

| Clé | Valeur | Gérée |
| --- | --- | --- |
| `[Backglass] Priority.PUP`, `Priority.B2S` | 100, 50 ; si le rôle backglass est affecté | oui |
| `[ScoreView] Priority.PUP`, `Priority.B2S`, `Priority.ScoreView` | 100, 50, 10 ; si le rôle DMD est affecté. Écran DMD seul : `Priority.B2S = 0` ([Écran du DMD](#écran-du-dmd--fulldmd-ou-dmd-seul)) | oui |
| `[Topper] Priority.PUP` | 100 ; si le rôle topper est affecté (B2S ne dessine pas sur le topper) | oui |
| `[Plugin.B2SLegacy] Enable` | 0 tant que B2S est activé : les deux répondent aux tables qui demandent `B2S.Server`, et le dernier chargé l'emporte | oui |
| `[Plugin.B2S] ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos` | 1 et 1 si le rôle DMD existe et n'est pas un DMD seul. Le FullDMD d'un .directb2s passe devant ScoreView : sans incrustation, on ne verrait que son cadre. La position du DMD est cherchée dans l'image | non, proposées si la clé est vide |
| `[Plugin.DMDUtil] Enable`, et `ZeDMD`, `PIN2DMD` ou `Pixelcade` | 1 pour le DMD réel reconnu ou réglé sur « oui », 0 pour un modèle réglé sur « non » ; rien sans DMD réel ni choix | oui |
| `[Plugin.DMDUtil] ZeDMDWiFiEnabled`, `ZeDMDWiFiAddr` | le ZeDMD en wifi de « DMD réel » : 1 et son adresse, ou 0 une fois coupé ; rien tant qu'il n'a jamais été réglé | oui |
| `[Plugin.DMDUtil] DMDServer`, `DMDServerAddr`, `DMDServerPort` | « Image du front-end » : 1, `127.0.0.1` et `6789` quand le serveur du DMD tient l'afficheur, avec `ZeDMD`, `PIN2DMD`, `Pixelcade` et `ZeDMDWiFiEnabled` à 0 (le serveur seul ouvre le matériel) ; 0 sinon, et VPX ouvre le DMD lui-même ; rien tant que l'image du front-end n'a jamais été réglée | oui |
| `[Plugin.PinMAME] PinMAMEPath` | `<racine>\pinmame`, s'il contient `roms` | non, proposée si la clé est vide |
| `[Plugin.PinMAME] Cheat` | 1 si le plugin PinMAME est activé. Sans lui, une ROM WPC (Williams et Bally, 1990-1999) refait son test de mémoire, « TESTING… », avant chaque partie ; activé, PinMAME saute ce contrôle (`wpc.c`, `MACHINE_INIT`). Règles et scores inchangés. Réglage « Démarrage rapide des ROM » de l'onglet « Essentiels » | non, proposée si la clé est vide |
| `[Plugin.Serum] SerumPath`, `[Plugin.VNI] VniPath` | `<racine>\pinmame\altcolor`, s'il contient un `<rom>\<rom>.cRZ` ou `.cROMc` (Serum), `.pal` ou `.vni` (VNI) | non, proposées si la clé est vide |

Chaque table cherche d'abord ses ROM et ses couleurs dans son propre dossier (`pinmame\roms`, `serum`, `vni`, `pinmame\altcolor`) ; les dossiers communs ne servent qu'ensuite.
La synchronisation signale « B2S et B2SLegacy activés ensemble » quand les deux le sont (B2SLegacy rallumé à la main, puis gardé).

**DMD réel.**
`probeUsbDevices` (`packages/win-displays/src/usb.ts`) liste les périphériques USB présents par le gestionnaire de configuration de Windows (`CM_Get_Device_ID_ListW`) et lit leur nom et leur port série dans le registre, en lecture seule.
Aucun port n'est ouvert, alors que les détecteurs de libdmdutil envoient une demande de connexion à chaque port.
Identifiants reconnus (`HARDWARE_DMD_IDS`) :

| DMD | VID:PID | Source |
| --- | --- | --- |
| ZeDMD | `303A:1001` (ESP32-S3), `1A86:55D3` (CH343) ; `1A86:7523` (CH340) et `10C4:EA60` (CP210x), convertisseurs courants signalés « à confirmer » | filtre de détection automatique de libzedmd (`ZeDMDComm.cpp`) |
| PIN2DMD | `0314:E457` | libdmdutil (`PIN2DMD.cpp`) |
| Pixelcade | `1B4F:0008` (carte IOIO-OTG) | firmware IOIO ; libdmdutil la reconnaît à sa réponse « IOIO » |

DMDUtil cherche lui-même le port : Cyber Pinball n'écrit ni `ZeDMDDevice` ni `PixelcadeDevice`.
Débranché, le DMD garde ses clés telles quelles.
`npm run probe` affiche les DMD reconnus (`npm run probe -- --usb` : tous les périphériques USB).

**La rubrique DMD (Menu système > Borne > DMD).**
Tous les réglages du DMD ensemble (16/11/2026) : « Écran du DMD » (FullDMD ou DMD seul, voir [Écran du DMD](#écran-du-dmd--fulldmd-ou-dmd-seul)), « DMD du front-end » (vivant ou classique) et « Couleur du DMD » (voir [DMD du front-end](medias-des-jeux.md#dmd-du-front-end)), « DMD réel ».
Le DMD sur la roue reste sur la fiche de chaque table, qui le règle pour elle seule.

**Menu système > Borne > DMD > « DMD réel » (bêta).**
L'écran (`app/src/hardware-dmd-menu.ts`) montre les DMD reconnus, ce qui empêchera VPX de les ouvrir, et règle chaque modèle.
La prise en charge reste en bêta tant que des bornes équipées ne l'ont pas confirmée : le badge « BÊTA » le dit sur l'entrée.

- **Un choix par modèle**, Start pour passer de l'un à l'autre : « automatique » (allumé quand il est reconnu, clés gardées une fois débranché), « oui » (toujours allumé : DMDUtil le cherche au début de chaque partie), « non » (jamais : une carte Arduino au CH340 ne reçoit plus la poignée de main de DMDUtil).
  En automatique, un ZeDMD reconnu sur un CH340 ou un CP210x est allumé, avec le conseil de passer à « non » si ce n'en est pas un.
  Sauf quand ce pont USB-série courant est sans doute autre chose, une Wemos D1 ou un ESP32 de LED adressables par exemple (`zedmdDoubt`) : il n'a pas répondu comme un ZeDMD à la dernière partie (« handshake response error » dans `vpinball.log`), le Cabinet.xml de DOF le donne à un contrôleur, ou des LED adressables du configtool attendent encore leur contrôleur (voir [LED et retours (DOF)](led-et-retours-dof.md#led-et-retours-dof)).
  Il n'est alors pas allumé d'office : l'écran le montre pour ce qu'il est (« COM3 : pont USB-série, pas un ZeDMD », « ZeDMD pas allumé d'office ») et dit pourquoi dans les points à vérifier.
  Un port qui a répondu comme un ZeDMD à la dernière partie reste allumé, et « ZeDMD : oui » passe outre.
- **ZeDMD en wifi** : invisible pour l'USB.
  Start demande son nom ou son adresse IP (`zedmd-wifi.local` sans réglage, nom de libzedmd) ; vide, le wifi est coupé et l'adresse gardée. libdmdutil l'ouvre même sans `ZeDMD = 1` (`DMD::FindDisplays`).
- **Pilotes**, lus sans rien ouvrir : le service du pilote (`Service` du registre) et le code du Gestionnaire de périphériques (`CM_Get_DevNode_Status`).
  Le PIN2DMD passe par libusb, qui demande un pilote générique (WinUSB, libusbK ou libusb0) ; un autre pilote, ou aucun, est signalé avec l'outil du PIN2DMD ou Zadig.
  libusb n'ouvre libusb0 (le libusb-win32 des anciens outils du PIN2DMD) et libusbK que par `libusbK.dll`, chargée depuis `System32` seulement (`windows_winusb.c`, `winusbx_init`) : sans elle, le pilote est signalé avec le conseil de passer à WinUSB par Zadig (`libusbKDll`, relevé par `packages/win-displays/src/usb.ts`).
  Un ZeDMD ou un Pixelcade sans port COM manque du pilote de sa puce (CH340/CH343 de WCH, CP210x de Silicon Labs).
- **Sonde du PIN2DMD** : libdmdutil abandonne en silence quand `libusb_open` ou `libusb_claim_interface` échoue (`PIN2DMD.cpp`, `PIN2DMDInit`) ; le journal de VPX ne dit rien et le DMD reste noir.
  La sonde (`app/src/sonde-pin2dmd.ts`, l'exécutable en mode Node, sans fenêtre) fait les mêmes étapes avec la `libusb64-1.0.dll` de VPX, puis relâche tout.
  Elle va jusqu'au bout de `PIN2DMDInit`, comme VPX : elle lit le nom de la carte (`iProduct`), que le module DMD de VPX compare à trois noms seulement, « PIN2DMD », « PIN2DMD XL » et « PIN2DMD HD ».
  Une carte qui ne donne pas son nom, ou un autre nom, n'est jamais pilotée par VPX et le DMD reste noir : l'écran « DMD réel » et la Santé le disent avec le nom lu (« PIN2DMD : la carte se présente sous le nom « … » »), et proposent d'envoyer un rapport, car Cyber Pinball ne peut pas le contourner.
  Elle tourne au démarrage du front-end, au retour d'une partie, après un choix de « DMD réel » (`applyMenuDmdServer`) et après l'arrêt d'un serveur du DMD qui ne trouve pas l'afficheur, jamais pendant une partie ni quand le serveur du DMD tient la carte.
  Son verdict est joint au PIN2DMD (`libusbProbe`) : carte déjà ouverte par un autre programme (codes `-3` et `-6`, avec les programmes ouverts reconnus), pilote que libusb ne sait pas utiliser (`-12`), carte introuvable, autre erreur.
  L'écran, la Santé et les points à vérifier avant la partie le disent ; ouverte puis relâchée, la ligne dit « VPX pourra l'allumer ».
- **Programmes qui gardent un DMD réel** (`DMD_HOLDER_PROGRAMS`, `dmd.ts`) : dmdext, PinUP Popper, PinballX, PinballY, un autre VPX, Future Pinball.
  Ouverts au moment de la synchronisation, ils sont signalés avant la partie pour tous les modèles : un seul programme à la fois tient un PIN2DMD ou un port série.
- **Taille du PIN2DMD** : le nom que la carte donne à l'USB, lu par Windows au branchement (`DEVPKEY_Device_BusReportedDeviceDesc`) : « PIN2DMD » 128 × 32, « PIN2DMD XL » 192 × 64, « PIN2DMD HD » 256 × 64, comme libdmdutil (`PIN2DMD.cpp`).
  Le ZeDMD donne sa taille à la connexion seulement.

Les choix sont gardés avec la configuration de la borne (`cabinet.json`, `hardwareDmd`) et repris par la synchronisation qui précède chaque partie.
La santé de la borne a un contrôle « DMD réel » : prêt, ou un point à vérifier (pilote à installer, PIN2DMD que VPX n'ouvrira pas, serveur du DMD qui ne trouve pas l'afficheur, pont USB-série qui n'a pas répondu comme un ZeDMD).
Prêt sans « Image du front-end », il dit que ce choix fait aussi montrer le front-end au DMD réel.

**Image du front-end (bêta).**
Réglage « Image du front-end » de « DMD réel », non par défaut : le DMD réel montre aussi le DMD du front-end entre les parties, pas seulement pendant celles-ci.
Un seul programme peut tenir l'afficheur : c'est le serveur de libdmdutil, `dmdserver`, lancé caché par Cyber Pinball.
Le front-end et VPX lui envoient leurs images tour à tour (`app/src/dmd-server.ts`, protocole dans `packages/core/src/dmdserver.ts`).

- **Le serveur** : `cyberpinball-dmdserver.exe` (`packages/dmdserver`, livré dans `natif\dmdserver`), le `server.cpp` de libdmdutil construit sur le `dmdutil64.dll` que VPX installe lui-même dans `plugins\dmdutil`.
  C'est exactement la version de libdmdutil de VPX 10.8.1 (commit 3485e2e), qui gère ZeDMD, ZeDMD en wifi, PIN2DMD et Pixelcade.
  Rien n'est téléchargé, aucune DLL n'est copiée.
  Les archives Windows publiées par libdmdutil ne conviennent pas : celle de la 0.11.0 n'a pas les DLL dont dépend `dmdserver.exe`, et la 0.10.0 ne connaît pas le PIN2DMD.
  Avant tout chargement, l'empreinte SHA-256 de la DLL est comparée à celles de `packages/dmdserver/src/empreintes.h` : une DLL inconnue n'est jamais chargée et arrête le serveur avec le code 6.
  Le serveur appelle les classes C++ de la DLL, et une autre version de libdmdutil peut changer leur disposition en mémoire sans changer ses fonctions : seule l'empreinte le dit sûrement.
  La DLL reconnue est ensuite chargée à la demande depuis le dossier passé par `-d`, et toutes ses fonctions sont liées avant de chercher un DMD : une DLL absente arrête le serveur avec le code 3, une fonction manquante avec le code 4, sans fenêtre d'erreur de Windows.
  `--verifier` fait ces contrôles seuls et donne l'empreinte (`node scripts/dmdserver.mjs --verifier --vpx <dossier de VPX>`).
- **Lancement** : au démarrage du front-end, après un choix de « DMD réel » et au retour d'une partie, s'il y a au moins un DMD allumé (reconnu, réglé sur « oui », ou ZeDMD en wifi).
  `dmdserver.ini` (dossier des données) reprend les choix par modèle : Serum et PuP restent éteints (`AltColor = 0`, `PUPCapture = 0`), car VPX envoie ses images déjà colorées.
  `-w` : le serveur attend le DMD plutôt que de s'arrêter, mais 20 secondes au plus (`FIND_TIMEOUT_MS`).
  Sans afficheur trouvé dans ce délai, il est arrêté et ne se relance pas de lui-même : libdmdutil garde ouvert un PIN2DMD dont il refuse le nom, et VPX, qui ouvre alors le DMD lui-même, le trouverait pris.
  L'écran « DMD réel » et la Santé le disent (« Le serveur du DMD ne trouve pas l'afficheur (aucune réponse en 20 s) »), avec la cause trouvée par la sonde du PIN2DMD, sinon le conseil d'envoyer un rapport ; VPX reprend le DMD lui-même pendant les parties.
  Avant une partie que VPX pilote lui-même (`DMDServer = 0`), le serveur est toujours arrêté et sa fin attendue (`handDmdToVpx`) : le système rend la carte à sa sortie.
  S'il s'arrête (DMD débranché, plantage), il est relancé 2 s plus tard.
  Après un code 3 ou 4, il ne l'est plus : la raison est affichée dans « DMD réel » et dans la santé de la borne.
- **Images** : le DMD du front-end, vivant ou classique, en RGB24 128 × 32, dans la couleur réglée (un point éteint est noir sur le DMD réel).
  Pendant une partie, le front-end se déconnecte avant que VPX ne se connecte, puis se reconnecte et renvoie sa dernière image au retour.
- **VPX** : la synchronisation écrit `DMDServer = 1` seulement quand le serveur tient l'afficheur et que le front-end y est connecté.
  Sinon (serveur absent, en attente du DMD, arrêté), elle écrit `DMDServer = 0` et les clés par modèle, et VPX ouvre le DMD lui-même comme sans l'image du front-end.

### Plusieurs rôles sur un écran : zones

Une borne à deux écrans met souvent le backglass et le DMD sur le moniteur du fronton.
Une borne sans écran de DMD l'incruste dans l'image du playfield.
Un poste de bureau met tout sur un écran : la table d'un côté, le backglass de l'autre.
Dans le modèle de borne, plusieurs rôles peuvent donc pointer vers le même écran, chacun dans sa zone (`zones`), playfield compris.
Une zone est un rectangle en fractions de l'image de l'écran (0 à 1) : elle survit à un changement de définition.
Elle peut garder un format (`aspect`, largeur sur hauteur : 16/9, 4…) : on la redimensionne alors sans en changer les proportions.
Sans zone, le rôle occupe l'écran entier, comme avant.
Code : [packages/core/src/zones.ts](../../packages/core/src/zones.ts).

VPX 10.8.1 sait faire les deux, sans outil tiers (`src/renderer/Window.cpp`, `Renderer.cpp`) :

| Le rôle est… | Clés écrites | Effet dans VPX |
| --- | --- | --- |
| seul sur son écran | `<Préfixe>Output = 1`, `FullScreen = 1`, `WndX = WndY = 0`, `Width` et `Height` de l'écran | fenêtre plein écran sans bordure |
| sur une zone d'un écran (playfield compris) | `Output = 1` (pas pour le playfield), `Display`, `FullScreen = 0` (« Windowed »), `WndX`, `WndY`, `Width`, `Height` de la zone, en pixels relatifs à l'écran | fenêtre sans bordure posée sur la zone (toutes les fenêtres de VPX sont sans bordure) |
| dans la zone du playfield, sur son écran | `Output = 2` (« Embedded in playfield »), `WndX`, `WndY`, `Width`, `Height` de la zone, relatifs à la fenêtre du playfield | dessiné dans l'image du playfield, sur un fond noir, après la table : pas de fenêtre à garder au premier plan |

Un rôle sur l'écran du playfield mais hors de sa zone (poste de bureau) est une fenêtre à part.
Le cadrage des tables suit la fenêtre du playfield, pas l'écran : vue borne quand la fenêtre est plus haute que large, `ScreenWidth` et `ScreenHeight` à la taille réelle de la zone.
« Garder » une taille changée dans VPX la ramène à l'écran entier.

**Ordre de superposition.**
VPX n'a aucun réglage : les incrustations sont dessinées backglass, puis DMD, puis topper (`Renderer.cpp`), et c'est Windows qui empile deux fenêtres qui se chevauchent.
Rien n'empêche deux zones de se chevaucher (un DMD posé sur le bas du backglass, par exemple) : c'est signalé pour information, avec ce qui passera devant.
Seuls deux rôles affectés au même écran sans zone ni l'un ni l'autre donnent un avertissement : c'est un oubli.

**Pas de rotation par zone.**
VPX 10.8.1 n'a de réglage de rotation que pour la vue de la table (`ViewDTRotation`, `ViewCabRotation`…) et la VR : ses fenêtres Backglass, ScoreView et Topper, et leurs incrustations, sont toujours dessinées dans le sens de l'image Windows.

**Fenêtre DMD : FullDMD et DMD superposés.**
La zone du rôle DMD est celle de la fenêtre ScoreView.
Elle a deux couches : en fond, le FullDMD (image FullDMD du .directb2s, ou écran 5 d'un PuP-Pack, que le plugin PUP prend comme racine de ScoreView, avec repli sur l'écran 1 : `PUPManager.cpp`) ; par-dessus, le DMD de la ROM, que les plugins placent eux-mêmes dans la fenêtre (B2S : `ScoreViewDMDOverlay` et `ScoreViewDMDAutoPos`, qui cherche la place du DMD dans l'image ; PuP : écran 1 posé sur l'écran 5 par `CustomPos`).
Une zone n'a donc pas à viser le DMD 128×32 : elle donne la place du FullDMD.
Ce que montre l'écran, FullDMD ou DMD seul, se dit une fois pour toutes ([Écran du DMD](#écran-du-dmd--fulldmd-ou-dmd-seul)).
`splitBackglassDmd` partage un écran entre le backglass en haut et une bande DMD centrée en bas, aux proportions demandées (4:1 pour un DMD seul, 16:9 pour un FullDMD), au plus un tiers de la hauteur.

- **Synchronisation** : signale deux rôles qui se recouvrent sur un même écran (le cas de deux rôles affectés au même écran sans zone), une zone invalide dans `cabinet.json` (l'écran entier est alors utilisé), un rôle incrusté sur tout le playfield, et une incrustation vue de côté ou à l'envers par le joueur : VPX ne tourne pas les incrustations.
- **Disposition des écrans** ([app/src/arrange.ts](../../app/src/arrange.ts)) : étape de l'assistant après les rôles, ouverte sur « Terminer » (un Start garde tout tel quel), ou seule depuis le menu système > « Borne » > « Configuration de la borne » > « Disposition des écrans », ou `--assistant --disposition` ; à l'étape des écrans, « Placer librement… » l'ouvre sur un rôle et revient à l'assistant.
  Le panneau s'affiche sur l'écran du playfield ; chaque écran montre ses zones, celle choisie avec ses coins.
  Lignes : la zone (n'importe quel rôle), son écran (« Aucun écran » pour un rôle annexe), le format conservé (Libre, 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), le plein écran (avec un format verrouillé : la plus grande zone à ce format, centrée), la position horizontale et verticale, la largeur, la hauteur, la taille précise, la position précise, le placement au-dessus, en dessous, à gauche ou à droite d'un autre rôle du même écran (réduit, format gardé, s'il manque de la place), l'alignement sur un bord ou au centre, l'aimantation et « Annuler les changements ».
  Position et taille sont libres au pixel près sur tout l'écran ; une zone n'en sort jamais et garde au moins 16 px de côté.
  Ouverte depuis le front-end, l'étape commence sur la ligne « Zone » ; dans l'assistant, sur « Terminer ».
  Le panneau se range en haut ou en bas, à l'opposé de la zone choisie quand elle est sur son écran.
  - **Aux boutons** : flippers pour choisir une ligne, Start pour l'ouvrir, flippers pour régler au pixel près (aperçu immédiat ; maintenus, ils accélèrent jusqu'à 64 px par cran), Start pour valider, Exit pour annuler.
  - **Au clavier** : flèches pour déplacer la zone (ligne fermée) ou régler dans les deux sens ; chiffres puis Entrée pour la taille précise (la largeur seule quand un format est verrouillé) et pour la position précise (X, puis Y).
  - **À la souris** : clic sur une ligne, sur une zone pour la choisir ; zone tirée pour la déplacer, jusque sur un autre écran (elle y passe aussitôt, même taille si elle y tient, et devient incrustée si elle tombe dans la zone du playfield), coin tiré pour la redimensionner, le coin opposé restant en place.
    Chaque zone montre ses coins et son étiquette (rôle, taille, plein écran, fenêtre ou incrusté), posée dans le premier coin de la zone que rien de l'écran ne recouvre (en haut à gauche d'ordinaire ; sur un playfield pivoté de 270°, le panneau passe à gauche et l'étiquette du playfield à droite ; `placeZoneLabels`, `app/renderer/screen.js`), et chaque écran sans le panneau rappelle le geste dans sa ligne d'aide, en bas, à sa place dans la page : posé en bandeau par-dessus l'écran, il recouvrait l'étiquette de la zone du haut (fronton de la borne).
    Les bords tirés s'aimantent à 12 px près à ceux et au milieu de l'écran et aux bords des autres zones (`snapRect`) ; ligne « Aimantation » pour la couper, ou Alt maintenu pendant le geste.
    Le playfield ne change pas d'écran à la souris : c'est l'étape des rôles qui le décide.
  - **Disposition seule** : enregistre le modèle et ne reprend dans `VPinballX.ini` que les fenêtres et le cadrage ; un rôle dont l'écran est seulement débranché garde son écran.
- **Réglage dans VPX** : une fenêtre fenêtrée ou incrustée déplacée ou redimensionnée dans l'interface de VPX (page d'affichage de la fenêtre, qui encadre l'incrustation) est signalée au démarrage comme toute clé changée à la main.
  « Garder » la reprend dans la zone du rôle, et la clé reste gérée.
  Une fenêtre plein écran retouchée est laissée à l'utilisateur.
- **PuP-Packs** : le choix de l'option du pack compare les proportions de la zone, pas celles de l'écran entier, et suit le type de l'écran du DMD (FullDMD ou DMD seul).
- **Assistant d'écrans** : à l'étape du DMD, les flippers proposent les écrans libres (un écran large deux fois : FullDMD sur tout l'écran, puis DMD seul en bande 4:1 au centre), puis le bas de l'écran du backglass (bande 4:1 pour un DMD seul, ou 16:9 pour un FullDMD avec le DMD par-dessus ; le backglass garde le haut) et l'incrustation dans le playfield (4:1, au bord opposé aux flippers, sur 40 % de la largeur).
  Une borne à deux écrans a donc toujours une place pour le DMD.
  La zone proposée est dessinée sur l'écran, en pointillés, à l'endroit exact où VPX l'affichera.
  La disposition enregistrée est reproposée d'office, telle quelle si elle a été retouchée dans VPX depuis (« comme enregistré »).
  Le réglage fin se fait dans VPX (ci-dessus).
- **Front-end** : une fenêtre par écran physique, pas par rôle.
  Les rôles qui partagent un écran sont dessinés dans la même fenêtre, chacun dans sa zone ; un DMD incrusté se dessine sur le playfield sans pivoter, comme dans VPX.
  Deux fenêtres sur un même écran se disputeraient le plein écran qui couvre la barre des tâches (`coverDisplay`).
  La page du playfield tient dans sa zone, tailles comprises (`cqmin`, relatives à la zone).

### Écran du DMD : FullDMD ou DMD seul

VPX 10.8.1 n'a qu'une fenêtre pour le DMD et le FullDMD (ScoreView).
L'écran qui la montre n'a pourtant pas la même fonction selon la borne, et Cyber Pinball le fait dire une fois pour toutes (`dmdKind` dans le modèle de borne : `fulldmd` ou `dmd`).
Code : [packages/core/src/dmdscreen.ts](../../packages/core/src/dmdscreen.ts).

| | FullDMD | DMD seul |
| --- | --- | --- |
| Écran | écran large (16:9) entier, souvent le panneau des haut-parleurs ; ou bande 16:9 sous le fronton | bande 4:1 : vrai écran DMD, bande sous le fronton, écran 16:9 derrière la découpe du panneau, incrustation dans le playfield |
| Front-end | le média `(FullDMD)` sur tout l'écran (`(DMD)` réduit à défaut) | le média `(DMD)` dans la bande (`(FullDMD)` réduit à défaut), du noir autour |
| VPX | `[ScoreView]` plein écran ; `Priority.B2S = 50` : l'image FullDMD du `.directb2s`, le DMD du jeu incrusté (`ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos`) | fenêtre sur la bande ; `Priority.B2S = 0` : le DMD du jeu par ScoreView, sans l'image FullDMD écrasée dans la bande |
| PuP-Packs | option qui met son écran 5 (FullDMD) dans la fenêtre du DMD | option qui y met son écran 1 (DMD), ou rien |

- **Où le dire** : à l'assistant, étape « Écrans et rôles » : un écran large libre est proposé deux fois au DMD, « FullDMD ? » (tout l'écran) puis « DMD en bande 4:1 au centre ? » ; un écran déjà 4:1 seulement en « DMD ? » ; le bas du fronton en 4:1 (DMD seul) ou 16:9 (FullDMD) ; l'incrustation dans le playfield est toujours un DMD seul.
  Placé librement, le DMD prend le type de la forme de sa zone.
  Ou, sans refaire l'assistant, menu système > « Borne » > « DMD » > « Écran du DMD » (aussi dans « Configuration de la borne », après la disposition) : l'état actuel, puis « C'est un FullDMD » et « C'est un DMD seul », chacun avec son schéma.
  Start enregistre et relance le front-end ; ses fenêtres, `VPinballX.ini` et les PuP-Packs suivent.
  La zone ne change que si elle n'a pas la forme du choix : FullDMD seul sur son écran, l'écran entier ; DMD seul, une bande 4:1 centrée ; sous le fronton, la bande du bas à la nouvelle forme (`withDmdKind`).
  Une bande déjà en forme est gardée telle quelle.
- **Disposition des écrans** : le type est gardé tant que la zone du DMD ne change pas ; tirée à une autre forme, elle décide (`dmdKindAfterArrange`, frontière 8:3).
  La zone porte le nom du type (« FullDMD » ou « DMD »).
- **Configurations d'avant ce choix** : rien n'est réécrit.
  Sans `dmdKind`, le type se déduit comme avant des proportions de la zone (4:1 ou 16:9, frontière 8:3).
  Un seul cas est ambigu : une bande DMD seule au milieu d'un écran large, qui ne montre rien d'autre (`dmdKindQuestion`), un FullDMD peut-être découpé par erreur (par exemple : bande 4,78:1 au milieu d'un écran 16:9 ; le front-end y montrait l'image FullDMD réduite).
  La synchronisation le signale (« À vérifier »), le front-end l'annonce au démarrage par un bandeau, et l'entrée « Écran du DMD » porte la pastille rouge jusqu'à la réponse.
  Un type contraire à la forme de la zone (FullDMD dans une bande, DMD seul sur tout l'écran) est signalé pour information.
- **Fond des écrans sans playfield** : fronton, DMD et topper montrent leurs zones sur du noir pur, jamais le fond d'ambiance ni le cadre 9:16 du plateau du front-end au bureau (`#media-bg`, propre au playfield ; `layout-check.ts` le refuse sur un autre écran).
- **Limite de VPX 10.8.1** : dans la fenêtre du DMD, VPX garde le premier moteur qui dessine.
  Le plugin PUP ne dessine jamais le DMD de la table : pour une table qui dessine le sien, le diagnostic rend la fenêtre au DMD (`[ScoreView] Priority.PUP = 0`, règle `pupHidesDmd`), et l'écran 5 du pack ne s'y montre pas pendant la partie.
- **Tests** : [dmdscreen.test.ts](../../packages/core/src/test/dmdscreen.test.ts).

### Habillage FullDMD en partie

Cas de *The Walking Dead* (écran 16:9 du DMD) : dans le front-end, l'écran du FullDMD montre le média `(FullDMD)` de la table, une illustration en haut et un cadre en bas avec un DMD figé dedans ; en partie, il ne restait qu'un DMD simple étiré sur toute la largeur.
Code : [fulldmdframe.ts](../../packages/core/src/fulldmdframe.ts), [fulldmdtable.ts](../../packages/core/src/fulldmdtable.ts), [app/src/fulldmd.ts](../../app/src/fulldmd.ts).

- **Ce qui s'affiche en partie** : la fenêtre ScoreView de VPX 10.8.1, sur tout l'écran du FullDMD.
  Trois plugins peuvent la remplir, par priorité : un PuP-Pack (écran 5, sinon 1), le plugin B2S (image FullDMD du `.directb2s`, `DMDImage`, le DMD incrusté dedans), puis le plugin ScoreView, qui dessine le DMD de la ROM, de FlexDMD ou d'UltraDMD avec ses mises en page (`plugins\scoreview\layouts\*.scv` : « Fit: Contain », vitre « Glass-Dirty »).
  Ni dmdext ni Freezy : les plugins de VPX tiennent leur rôle.
  Sur *The Walking Dead* : `.directb2s` sans image FullDMD (seule l'image du fronton), PuP-Pack en option « No Topper BG and DMD seperate » (écrans 1 et 5 éteints) : le plugin ScoreView dessinait seul, sur tout l'écran.
- **D'où vient l'habillage** : le média `(FullDMD)` de la table (VPinMediaDB, image 1920 × 1080 ou vidéo), que seul le front-end montrait.
  Le plugin ScoreView ne sait pas dessiner d'image de fond : la visuelle `- Image` de ses mises en page est refusée (« Not yet supported », `ScoreView.cpp`, commit af26b2d93), et sa vitre (`Glass`) ne couvre que le rectangle du DMD.
- **Voies comparées** : (a) Cyber Pinball garde l'habillage sur l'écran et pose la fenêtre du DMD dans son cadre : fidèle dans le front-end, pour toutes les tables (ROM, FlexDMD, UltraDMD), rien à installer, et la fenêtre du front-end reste déjà derrière VPX pendant la partie (fond de partie) ; (b) le `.directb2s` à trois écrans ou le PuP-Pack habillent déjà le FullDMD : gardé tel quel quand c'est le cas, mais beaucoup de tables n'ont ni l'un ni l'autre, et le plugin PUP ne dessine jamais le DMD de la table (`pupHidesDmd`) ; (c) une mise en page `.scv` par table : impossible en 10.8.1, faute d'image de fond.
  Retenue : (a), et (b) quand la table l'a déjà.
- **Le cadre** (`detectDmdFrame`) : un rectangle dont les quatre côtés sont des bords francs, large d'au moins 40 % de l'image, aux proportions d'un DMD (2,5:1 à 6,5:1) ; d'un cadre à plusieurs traits (néon double, filet doré), on garde l'intérieur.
  Une vidéo est lue à 10, 35, 60 et 85 % de sa durée, hors écran, par le convertisseur ([media-convert.ts](../../app/src/media-convert.ts)) : le cadre est celui que montre la majorité de ces images.
  Le résultat est gardé par média (chemin, taille, date) dans `data\cache\fulldmd-cadres.json`.
  Sur la borne : cadre trouvé pour *The Walking Dead*, *Game of Thrones*, *2001*, *Terminator 2*, *Star Trek* et *Goonies* ; aucun dans la vidéo de *Guardians of the Galaxy*.
- **Avant chaque partie** (`prepareDressing`) : quand l'écran du DMD est un FullDMD (pas incrusté dans le playfield), que la table a un média `(FullDMD)` avec un cadre (le sien ou celui de la borne, pas l'image du `.directb2s`), qu'elle dessine un DMD (script inconnu : oui), et que ni le `.directb2s` (image FullDMD) ni un PuP-Pack (fenêtre du DMD, `Priority.PUP` non nul) ne l'habillent déjà, le `.ini` de la table reçoit `[ScoreView] ScoreViewFullScreen = 0`, `ScoreViewWndX`, `ScoreViewWndY`, `ScoreViewWidth` et `ScoreViewHeight` sur le cadre (le média est montré entier et centré dans la zone, comme dans le front-end).
  La place écrite est retenue dans le `.info` (`CyberPinball.fullDmd.window`) : Cyber Pinball la met à jour (autre média, autre écran) ou la retire quand l'habillage n'a plus lieu ; le journal du front-end le note (« Habillage FullDMD (…) : … »).
  Sinon rien ne change : la fenêtre du DMD garde toute sa zone.
- **Pendant la partie** : la fenêtre du front-end sur l'écran du DMD garde l'habillage (`momentScreen`, `dressed`), figé, ou animé si « Médias pendant la partie » est sur « animés » ; sur « éteints » aussi, puisqu'il fait partie de l'afficheur.
  Le DMD du jeu s'inscrit dans le cadre, la fenêtre de VPX par-dessus.
- **Réglage fin** : en partie, les deux MagnaSave > « Position du DMD » (ci-dessous), ou menu de VPX > « Display Settings » > « ScoreView Display » : position et taille au pixel près, puis « Save as Table Override ».
  Une place qui n'est plus celle que Cyber Pinball a écrite est celle de l'utilisateur : elle n'est plus jamais touchée.
  Le diagnostic la montre (« Écrans placés pour cette table ») ; « Revenir à la disposition générale » la retire, et le cadre trouvé revient à la partie suivante.
- **Détection** : le diagnostic signale « Le DMD cacherait l'habillage FullDMD » (`fullDmdHidden`, avertissement) quand la place du DMD réglée pour la table recouvre au moins la moitié de l'habillage (`dressCoverage` ; `ScoreViewFullScreen = 1`, par exemple) ; la correction pose le DMD dans le cadre.
  Pendant la partie, le front-end relit la pile des fenêtres de Windows : une fenêtre de VPX qui recouvre l'habillage est notée au journal (« Partie : le DMD de VPX recouvre … % de l'habillage FullDMD », `liveDressCoverage`).
- **Diagnostic de toutes les tables** : `npm run habillage` (`scripts\diagnostic-habillage.ps1` : Electron sur un bureau Windows caché, rien n'apparaît à l'écran) liste chaque table, le cadre trouvé, la place du DMD en partie, et marque « [À CORRIGER] » celles dont le DMD recouvrirait l'habillage.
  Rien n'est changé aux tables.
- **Tests** : [fulldmdframe.test.ts](../../packages/core/src/test/fulldmdframe.test.ts) (cadre, vidéo, place dans l'écran, `.ini` de la table, invariant sur des écrans simulés, diagnostic) et le piège `fullDmdHidden` de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### DMD réglé pour le mode bureau

Certaines tables récentes choisissent où dessiner leur DMD par une option de table du menu de VPX (F12), dont la valeur par défaut le met dans le décor du mode bureau.
*JP's Space Cadet* v7.0 (JPSalas) en est l'exemple : son option « DMD Type » vaut par défaut « Desktop DMD », un DMD fait de flashers dans le décor, invisible en mode cabinet ; FlexDMD n'est jamais créé et la fenêtre du DMD de VPX reste noire (17/11/2026, sur une borne à trois écrans).
Code : [tableoptions.ts](../../packages/core/src/tableoptions.ts), constat dans [doctor.ts](../../packages/core/src/doctor.ts) (`desktopDmdFinding`).

- **Lecture du script** (`tableOptions`) : les appels `Table1.Option(nom, min, max, pas, défaut, unité, Array(libellés))` dont tous les arguments sont écrits en toutes lettres, commentaires retirés et lignes continuées par « _ » remises bout à bout ; une option dont un argument est calculé est ignorée.
- **Option du DMD repérée** (`cabinetDmdOptions`) : une liste de libellés dont la valeur par défaut désigne un DMD de bureau ou aucun (« Desktop », « DT », « Internal », « Playfield », « Backdrop », « Flasher », « Text box », « Apron », « None », « Off »…), dont le nom ou un libellé parle de DMD, et qui propose FlexDMD, à défaut UltraDMD (que le plugin FlexDMD de VPX fournit aussi).
  Ou un interrupteur du type « Use FlexDMD » (Off/On, ou 0/1 sans libellés) éteint par défaut.
- **Écriture** (`cabinetDmdIni`) : VPX 10.8.1 range le choix du joueur dans `[TableOption]` du `.ini` de la table, sous le nom de l'option dont chaque caractère qui n'est ni lettre ni chiffre devient « _ » (« DMD Type » donne `DMD_Type`, `PinTable::Option`) ; une liste de libellés y vaut le minimum plus le rang du libellé, un interrupteur 0 ou 1.
  Cyber Pinball y écrit la valeur de FlexDMD seulement pour une clé absente ou vide : un choix fait dans le menu de VPX n'est jamais écrasé, et ce menu montre et change ce réglage comme n'importe quel autre.
  Un `.ini` neuf prend les fins de ligne de Windows, comme ceux que VPX écrit.
- **Quand** : seulement sur une borne qui a un écran ou une zone de DMD ; dès l'installation et avant chaque partie (`PUP_PLAY_REPAIRS`), sans rien demander.
  La table n'est pas modifiée.
- **Diagnostic** : constat « DMD réglé pour le mode bureau » (`dmdDesktopOption`), qui nomme l'option, sa valeur par défaut, celle choisie pour la borne et le fichier, avec la correction « Régler « DMD Type » sur « FlexDMD » dans … » ; il disparaît une fois la clé écrite.
  Les lectures de script passent en version 10 (`FACTS_VERSION`, `app/src/vbs.ts`) : les tables déjà installées sont relues.
- **Tests** : [tableoptions.test.ts](../../packages/core/src/test/tableoptions.test.ts) (lecture des options, clés de VPX, choix du joueur gardé, diagnostic, `.ini` neuf, état de la fenêtre du DMD de VPX) et le piège `dmdDesktopOption` de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### DMD de FlexDMD et d'UltraDMD sans arrêt en partie

Le plugin FlexDMD de VPX 10.8.1, qui sert aussi UltraDMD, fait certains travaux sur le fil de VPX, au moment où le script les demande : la partie s'arrête le temps de les faire, flippers compris.
Deux cas sont réglés avant la partie, sans modifier la table.

- **Images rangées dans la table** (tables de JP comme *Hellboy* ou *Daredevil*) : FlexDMD lit et décode chaque image « VPX.nom » du `.vpx` à son premier affichage (`AssetManager.cpp`), puis la garde.
  Le `.vbs` de Cyber Pinball les demande toutes juste après `FlexDMD.Run = True`, pendant l'écran de chargement ([flexprewarm.ts](../../packages/core/src/flexprewarm.ts)) : en partie, elles sont déjà là.
  Les images retenues sont celles de la table dont le script écrit le nom en entier (« VPX.nom&… »), le donne en chaîne (« "VPX." & nom », chez JP) ou le fabrique à partir d'un début (« "d_" & lettre » : les lettres du DMD de *Hellboy*) ; seules comptent les chaînes qui sont le nom d'une image de la table.
  Les options d'image écrites dans le script sont reprises quand FlexDMD les reconnaît en entier (`dmd=`, `dmd2=`, `add`, `region=`, `pad=`) ; une autre chaîne qui commence par « & » (paramètres d'une adresse web) n'est jamais demandée à FlexDMD.
  Jusqu'à 3 000 demandes (`FLEX_PREWARM_MAX`) : toutes les images des grandes tables, *Daredevil* compris (178 images en trois variantes).
  Constat du diagnostic « Images du DMD chargées en pleine partie » (`flexImagesLate`), réparé seul avant chaque partie (`PUP_PLAY_REPAIRS`) ; un `.vbs` venu d'ailleurs n'est pas touché.
- **Vidéos trop grandes** (tables UltraDMD ou FlexDMD) : le plugin décode chaque vidéo du dossier du DMD en entier, d'un coup, à chaque scène qui la montre (`Video.cpp`) ; une vidéo de 1920 × 480 figeait la partie une à plusieurs secondes à chaque scène.
  Une vidéo de plus de quatre fois le plus grand DMD (256 × 64 points), ou de plus de 3 Mo quand sa taille ne se lit pas, est signalée ([dmdvideos.ts](../../packages/core/src/dmdvideos.ts)) : constat « Vidéos du DMD trop grandes : la partie se fige » (`dmdVideosHeavy`), dans le diagnostic de la table et dans la ligne « Tables » de la Santé de la borne.
  Avant la partie, celles que Chromium sait lire (mp4, m4v, mov, webm) sont ramenées à 128 × 32 (`app/src/dmd-video-shrink.ts`) : réencodées en VP8 dans un WebM, sous le même nom, que VPX reconnaît à son contenu ; l'original va à la corbeille de Cyber Pinball.
  Elles s'affichent pareil sur le DMD, et une vidéo déjà réduite n'est pas refaite.
  Les autres (wmv, avi) restent telles quelles, et le constat conseille de les remplacer par des mp4 à la taille du DMD.
- **Tests** : `images-dmd-avance.test.ts`, `dmd-videos.test.ts`, `reduction-videos-dmd.test.ts`, `webm-dmd.test.ts` et les pièges `flexImagesLate` et `dmdVideosHeavy` de [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### Position du DMD en partie

Déplacer le DMD en partie restait compliqué, le menu de VPX mêlant ses nombreux réglages (dont celui du FullDMD) sans dire à quoi ils servent.
Pendant une partie, les deux MagnaSave ensemble (sans eux, Crédit et Start ; Ctrl gauche et Ctrl droit au clavier) ouvrent désormais les **réglages en partie** de Cyber Pinball, « Position du DMD » en tête, avant tout le reste.
Code : [dmdplace.ts](../../packages/core/src/dmdplace.ts) (places, `.ini` de la table, menu), [app/src/in-game-menu.ts](../../app/src/in-game-menu.ts) (combinaison, fenêtres, fenêtre de VPX), page [app/renderer/in-game-menu.html](../../app/renderer/in-game-menu.html).

- **Ce qui bouge** : le DMD, c'est-à-dire la fenêtre « Visual Pinball Score View » de VPX 10.8.1 ([ScoreView]), où le plugin ScoreView dessine les points de la ROM, de FlexDMD ou d'UltraDMD.
  Pendant le réglage, Cyber Pinball la déplace et la redimensionne lui-même (`setWindowBounds`, `SetWindowPos` sans l'activer) ; le plugin VPX « CyberPinballDmd » de Cyber Pinball fait suivre VPX et ScoreView (ci-dessous, « Redimensionné en partie »).
  On voit le vrai DMD bouger, sur n'importe quel écran de la borne.
- **VPX en pause** : la fenêtre du panneau prend le premier plan ; VPX le perd et se met en pause (`Player::OnFocusChanged`, `IsPlaying` exige le focus de sa fenêtre de jeu), et les boutons, clavier comme joystick, vont au menu.
  À la sortie, VPX reprend le premier plan, et la partie.
- **La combinaison** est lue par Cyber Pinball, VPX au premier plan : touches du clavier par `GetAsyncKeyState` (`keysDown`, codes de `windowsVk`), boutons du joystick par le sondage de SDL (`watchJoystickButtons`, `SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS`).
  Elle n'est plus écrite dans `[Input] Mapping.InGameUI` (`inGameMenuSetting` ne garde que F12, et retire la combinaison écrite avant) : VPX n'ouvre plus son menu par-dessus.
- **Le menu** (sur l'écran du plateau, dans sa zone, tourné vers le joueur ; du côté opposé au DMD quand il est sur le même écran) : « Écran » (chaque écran de la configuration, nommé par ses rôles), « Position horizontale », « Position verticale », « Largeur » et « Hauteur » (chacune seule, au pixel, autour du centre ; le format se libère), « Format » (4:1 d'abord, puis libre, 3:1, 2:1, 16:9… ; libre, il dit les proportions du moment, « Libre · 4,4:1 », et un flipper à gauche rend le 4:1, la largeur gardée), « DMD » (affiché ou masqué), « Enregistrer pour cette table », « Revenir à la position générale », puis « Tous les réglages de VPX » et « Reprendre la partie ».
  Une ligne indisponible reste là, grisée, sa raison dite quand on la choisit (DMD masqué, table sans position à elle, un seul écran, aucune touche n'ouvre le menu de VPX).
- **Sans bandes noires** ([packages/core/src/scoreviewlayouts.ts](../../packages/core/src/scoreviewlayouts.ts)) : le plugin ScoreView de VPX 10.8.1 pose le DMD dans sa fenêtre d'après une mise en page (`.scv`) : celle dont les proportions sont les plus proches de la fenêtre, en « Contain », seule valeur de `Fit` qu'il accepte (`ScoreView::Parse`, `Select`, `Render`).
  Les siennes sont au format du DMD : une fenêtre en 4,5:1 ou en 3:1 gardait des bandes noires.
  Cyber Pinball prépare `<données>\scoreview` à chaque synchronisation de VPinballX.ini (`prepareScoreViewLayouts`, appelé par `syncVpxIni`) et le propose dans `[Plugin.ScoreView] LayoutFolder`, écrit seulement si la clé est vide : toutes les mises en page de la version de VPX installée, à l'identique (afficheurs alphanumériques, LCD, CRT, images de verre), plus, pour chaque DMD (128 × 32, 128 × 16, 192 × 64), des variantes étirées de 1,5 % en 1,5 % de proportions : la plus proche remplit la fenêtre à moins de 1 % près.
  Seulement de la moitié au double du format du DMD environ, et jamais plus étroit que 1,9:1 (`MIN_FILL_ASPECT`) : un écran 16:9 entier (FullDMD sans cadre) n'est pas une fenêtre taillée pour le DMD, qui y garde ses proportions, au milieu ; une variante « Contain » juste au-delà de chaque bout l'assure.
  Le dossier n'est réécrit que si les mises en page de VPX ou ces règles changent (empreinte dans `cyberpinball.json`).
- **Redimensionné en partie, rempli tout de suite** ([packages/vpx-vision3d/src/dmd-suivi.cpp](../../packages/vpx-vision3d/src/dmd-suivi.cpp), [suivi-dmd.h](../../packages/vpx-vision3d/src/suivi-dmd.h)).
  Jusqu'au 13 novembre 2026, une largeur, une hauteur ou un format changés en partie laissaient des bandes noires, ou un DMD qui ne remplissait pas sa nouvelle place, jusqu'à la partie suivante.
  Deux causes, trouvées au banc : (1) **SDL** : la fenêtre du DMD est sans bordure et non redimensionnable (`Window.cpp`, `SDL_WINDOW_BORDERLESS`) ; le SDL 3 de VPX 10.8.1 garde alors sa zone cliente à la taille qu'il lui connaît (`SDL_windowsevents.c`, `WM_NCCALCSIZE`) : redimensionnée de l'extérieur, la fenêtre change de cadre, mais VPX continue de dessiner à l'ancienne taille dans un coin, sans jamais recevoir `SDL_EVENT_WINDOW_RESIZED` ; (2) **ScoreView** choisit sa mise en page (`.scv`) à son premier rendu et ne la rechoisit que sur le message `Controller.OnDisplaysChanged` (`ScoreView.cpp`, `OnResChanged`, `m_invalidBestLayout`).
  Le plugin VPX « CyberPinballDmd » regarde, à chaque image, la fenêtre « Visual Pinball Score View » de son processus : quand son cadre diffère de sa zone cliente (taille posée de l'extérieur), il donne la taille à SDL (`SDL_SetWindowSize`, en points de SDL, l'échelle de l'écran tirée de la zone cliente), puis fait recalculer le cadre (`SetWindowPos` avec `SWP_FRAMECHANGED`, sans bouger ni redimensionner) : VPX reçoit la taille et refait la surface de la fenêtre, à sa place.
  Quand la zone cliente change, il diffuse `Controller.OnDisplaysChanged` : tout de suite, au plus une fois tous les 0,1 s pendant un réglage tenu, puis une fois encore 0,3 s après le dernier changement (VPX peut rendre une image de plus à l'ancienne taille).
  Le message est sûr : VPX le diffuse lui-même au début et à la fin de chaque partie et à chaque DMD de flasher ajouté ou retiré ; ses abonnés (DMDUtil, Serum, VNI, PinMAME, B2S, ScoreView) relisent la liste des sources et reprennent la même, PuP ne l'écoute pas.
  Le plugin ne fait rien d'autre : ni rendu, ni touche, ni minuterie, et SDL n'est appelé que pour une taille posée de l'extérieur.
  Il est activé dans toutes les parties (`[Plugin.CyberPinballDmd] Enable = 1`, liste `enabledPlugins` de `components.json`, écrite à chaque synchronisation de VPinballX.ini), dans le casque compris, où la fenêtre n'est pas dessinée, et remis dans `<VPX>\plugins\cyberpinball-dmd` avant chaque partie s'il a changé ([app/src/vpx-plugins.ts](../../app/src/vpx-plugins.ts), comme Vision 3D et la pause dans le casque).
  **Preuve au banc** ([scripts/banc-dmd.ps1](../../scripts/banc-dmd.ps1)) : le vrai VPX 10.8.1 en 2D sur le bureau caché, son coupé, sans synchronisation d'image (aucune composition d'écran sur ce bureau), Terminator 2 (Williams 1991, DMD 128 × 32 de PinMAME) ; la fenêtre du DMD passe en cours de partie de 4:1 (512 × 128) à 6:1 (768 × 128) puis à 2,8:1 (448 × 160), comme le fait le menu ; une sonde du plugin, réservée au banc (`Probe = 1`, un rendu placé devant ScoreView qui le laisse dessiner), mesure la part de la fenêtre que le DMD remplit.
  Suivi éteint (`Follow = 0`) : VPX dessine toujours en 512 × 128, le DMD remplit 66,7 % puis 80 % de la fenêtre.
  Taille donnée à SDL seulement (`Follow = 2`) : VPX suit, mais ScoreView garde la mise en page 4:1, 66,7 % puis 70 %.
  Suivi entier (`Follow = 1`, le défaut) : 99,9 % puis 99,8 %, 0,3 s après chaque redimensionnement, la fenêtre restée à sa place.
  Une table à afficheurs alphanumériques (Back to the Future de Data East) n'a qu'une mise en page, sans variantes étirées : elle garde ses proportions.

| Bouton | Dans les réglages en partie |
| --- | --- |
| Flippers | changer de ligne ; dans une ligne ouverte, moins et plus (maintenus : plus vite) |
| MagnaSave gauche, droit | changer de ligne ; dans une ligne de position, monter et descendre |
| Start | ouvrir la ligne, puis la valider |
| Exit | annuler la ligne ouverte ; sinon reprendre la partie |
| Clavier | flèches : déplacer le DMD dans les deux sens (sur « Largeur » ou « Hauteur » ouverte : ← → la largeur, ↑ ↓ la hauteur) ; + et − : les deux ensemble, proportions gardées ; Entrée, Échap |
| Souris | tirer le cadre du DMD (jusque sur un autre écran, `planDrag`) ; tirer un coin pour le redimensionner ; Alt : sans aimantation |

- **Où elle s'enregistre** : `<données>\positions-dmd.json`, par configuration de la borne puis par table (`DmdPlace` : empreinte de l'écran, zone en fractions, masqué ou non).
  Une table sans place suit la position générale de la configuration (zones de l'assistant, écrites dans `VPinballX.ini`).
  « Revenir à la position générale » retire la place de la table.
  Quitter avec des changements pas enregistrés pose la question : enregistrer, abandonner (le DMD revient où il était), ou continuer.
- **Avant chaque partie** (`prepareDmdPlace`, après l'habillage FullDMD) : la place de la table pour la configuration branchée est écrite dans `[ScoreView]` du `.ini` de la table : `ScoreViewOutput = 1`, `ScoreViewDisplay`, `ScoreViewFullScreen = 0`, position, taille, et `Priority.B2S = 0`.
  Jamais pendant la partie : VPX pourrait réécrire ce `.ini` en quittant.
  Les clés écrites sont retenues (`written`) ; une table qui n'a plus de place (ou dont l'écran est absent) les perd, sauf celles changées depuis dans le menu de VPX.
- **Sur un FullDMD** : l'image FullDMD reste autour, seuls les points du DMD sont posés à la place choisie.
  `Priority.B2S = 0` : le plugin B2S ne dessine plus l'image FullDMD du `.directb2s` dans la petite fenêtre ; le fond de partie de Cyber Pinball montre le média FullDMD derrière.
  Une place réglée ainsi passe avant l'habillage FullDMD (`dressUpdate` la garde, « place réglée en partie ») ; le diagnostic ne la signale ni comme « Écrans placés pour cette table » ni comme « Le DMD cacherait l'habillage FullDMD » (`DoctorContext.dmdPlaced`).
- **DMD masqué** : jamais `ScoreViewOutput = 0`, qui empêche VPX d'ouvrir la fenêtre : « DMD : affiché » ne montrait alors rien jusqu'au redémarrage de la table (13 novembre 2026).
  La fenêtre est écrite à sa place, et Cyber Pinball, qui la guette dès le lancement de VPX, la range hors de tout écran à sa taille avant son premier affichage (`watchHiddenDmd`, `dmdParkedRect`) : à sa taille, car le plugin ScoreView choisit sa mise en page sur la fenêtre à son premier rendu (le plugin « CyberPinballDmd » la lui fait rechoisir à chaque changement de taille, pas à un simple déplacement) ; dans le menu, masquer la range de même, à sa taille, et l'afficher la ramène aussitôt à sa place.
  Jamais `ShowWindow(SW_HIDE)` : VPX 10.8.1 remontre à chaque image une fenêtre annexe cachée (`Renderer::RenderAncillaryWindow`, « if (!IsVisible()) Show() »).
  Un `.ini` écrit avant (`Output = 0`) est réécrit à la partie suivante.
- **Le cadre du DMD** est dessiné à la place de l'écran dans la page de sa fenêtre (`screenBox`), pas en fractions de la fenêtre : si Windows pose ou taille la fenêtre d'un écran autrement que demandé, elle est reposée à sa place une fois montrée et le journal le dit (`keepOverlayOnScreen`), et le cadre reste juste (13 novembre 2026 : sur l'écran du DMD, il n'atteignait pas le bas, alors que la place enregistrée le touchait).
- **Sans fenêtre du DMD dans la partie** (DMD éteint ou incrusté dans le plateau) : le menu le dit ; le cadre se remplit d'un aperçu en points de DMD (`DmdMenuFrame.preview`) ; la place choisie se règle et s'enregistre, et se voit à la partie suivante.
- **Fenêtre du DMD encore vide** (`vpxDmdWindowState`) : VPX 10.8.1 ne montre une fenêtre annexe qu'à la première image qu'un plugin y dessine (`Renderer.cpp`, « if (rendered) … Show() ») ; une fenêtre du DMD posée sur un écran mais invisible veut donc dire que la table n'envoie aucun DMD (option réglée pour le mode bureau, voir [DMD réglé pour le mode bureau](#dmd-réglé-pour-le-mode-bureau), ou table sans DMD).
  Le menu la prenait pour un DMD masqué : « Masqué » revenait à chaque partie, même après « Afficher » et « Enregistrer pour cette table » (*JP's Space Cadet*, 17/11/2026).
  Seule une fenêtre rangée hors des écrans compte désormais comme masquée (état `parked`) ; une fenêtre vide (`empty`) laisse le menu partir de la place enregistrée (celle de la table, sinon la position générale), affichée, et le menu explique que VPX n'a encore rien dessiné dans la fenêtre du DMD, que la table ne lui envoie aucun DMD, et que la place choisie s'enregistre et servira dès que la table en enverra un.
  Le journal le note (« Réglages en partie (…) : menu ouvert, DMD de VPX vide (VPX n'y a rien dessiné : la table n'envoie pas de DMD), fenêtre en … »).
- **Sur la roue** : ce réglage ne change rien à la roue, qui a le sien (fiche > « Gérer la table… » > « DMD sur la roue », voir [DMD du front-end](medias-des-jeux.md#dmd-du-front-end)).
- **Limites** : un PuP-Pack qui dessine dans la fenêtre du DMD (écran 5 ou 1, `Priority.PUP` non nul) y reste, réduit à la place choisie.
  Les lettres et la ponctuation du clavier suivent sa disposition (`windowsVk`) ; les touches d'une borne (Maj, Ctrl, chiffres, F1-F24) non.
- **Tests** : [dmdplace.test.ts](../../packages/core/src/test/dmdplace.test.ts) (places par configuration et par table, `.ini` de la table, menu aux boutons, au clavier et à la souris, place lue sur la fenêtre de VPX), [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) (`Mapping.InGameUI` sans combinaison, `vpxMenuKeys`, `windowsVk`), [pupvisible.test.ts](../../packages/core/src/test/pupvisible.test.ts) (fenêtres au premier plan : seulement à la demande du joueur, fermées à la fin de la partie).

### Régler l'affichage en partie

Tout réglage visuel qui demande de voir le résultat se fait **pendant une partie**, sur l'image réelle, avec le menu de VPX 10.8.1 lui-même : cadrage de la table (ci-dessus), place et taille du fronton, du DMD et du topper (`DisplaySettingsPage`, lu dans le code au commit af26b2d93), aspect des afficheurs.
Un PuP-Pack, par exemple, dessine souvent un cadre sur le fronton (en bas, au centre) où le DMD doit tomber, et chaque pack a le sien.

1. **Entrer dans le menu de VPX** : depuis la fiche, « Régler l'affichage en partie » (la table démarre menu ouvert sur le cadrage, la partie ne compte pas dans les statistiques) ; ou, pendant n'importe quelle partie, les deux MagnaSave appuyés ensemble (Crédit et Start sur une borne sans MagnaSave), puis « Tous les réglages de VPX » dans les réglages en partie de Cyber Pinball (ci-dessus) ; F12 au clavier directement.
   `[Input] Mapping.InGameUI` ne garde que F12, **même sans relevé des boutons** : c'est alors la seule clé de `[Input]` que Cyber Pinball écrit (`inGameMenuSetting`, `packages/core/src/buttons.ts`), et la combinaison qu'y écrivaient les versions précédentes en est retirée.
   Exit n'y entre jamais : seul, il quitte la partie.
2. **Régler** : « Point Of View » pour le cadrage ; Exit ramène à l'accueil du menu, puis « Display Settings » > « Backglass Display », « ScoreView Display » (le DMD) ou « Topper Display » : position et taille au pixel près, appliquées en direct ; la fenêtre se tire aussi à la souris.
3. **Enregistrer** (Start) : « Save as Table Override » écrit dans le `.ini` de la table, pour elle seule ; « Save Globally » dans `VPinballX.ini`, pour toutes les tables.

Boutons du menu de VPX (`InputManager.cpp`), rappelés sur l'écran de chargement du réglage (« Réglage de l'affichage », `displayKeys`) :

| Bouton | Dans le menu de VPX |
| --- | --- |
| MagnaSave gauche, droit | changer de ligne |
| Flippers | régler la valeur |
| Start | enregistrer : pour cette table ou pour toutes |
| Crédit | annuler les changements |
| Lanceur | valeur par défaut |
| Exit | page précédente, puis fermer le menu ; menu fermé, quitter la partie |

VPX n'allume « Enregistrer » qu'après un changement (`InGameUIPage::IsModified`) : après Crédit (annuler), il reste grisé.
L'aide-mémoire le dit, « Enregistrer grisé : rien n'a changé ; Lancer le rallume » : le Lanceur (valeur par défaut) suffit à le rallumer.

| Le rôle est… | Réglable en direct | Remarque |
| --- | --- | --- |
| sur une zone d'un écran (fenêtre « Windowed ») | position et taille | le cas du DMD posé sur le fronton |
| seul sur son écran (plein écran) | non | passer en fenêtré dans ce menu écrit `FullScreen` tout de suite dans les réglages généraux, appliqué au lancement suivant |
| incrusté dans le playfield | position et taille | encadré en vert tant que la page est ouverte |

- **Après la partie** : une place enregistrée pour la table donne au diagnostic le constat « Écrans placés pour cette table » (information, avec les tailles et positions), et sa correction « Revenir à la disposition générale » retire ces clés seulement (`tableWindowsFinding`, `packages/core/src/doctor.ts`).
  Une place enregistrée pour toutes les tables est une clé gérée changée à la main : le front-end demande au démarrage s'il faut la garder (voir « Plusieurs rôles sur un écran : zones »).
- **Hors partie** : dans « Réglages de cette table », les réglages visuels (cadrage et caméra, fenêtres, profils des afficheurs `[DMD]` et `[Alpha]`, place du DMD dans l'image B2S, marges des écrans PuP) portent le badge « En partie » et ne se modifient plus ; seule la valeur propre à la table peut être retirée.
  Les mesures du meuble (largeur de l'écran, lockbar) restent réglables.
- **Qui dessine dans la fenêtre du DMD** : le plugin PUP ne dessine jamais le DMD de la table ; il n'en lit les images que pour reconnaître des scènes (PuPCapture, `PUPManager::ProcessDmdFrame`).
  S'il prend la fenêtre ScoreView (pack avec un écran 5, ou un écran 1 qui n'est pas posé sur le fronton), le score de la ROM, de FlexDMD ou d'UltraDMD n'y paraît pas.
  VPX lit la priorité dans les réglages de la table : pour une table qui dessine son DMD (ROM de PinMAME, `CreateObject("FlexDMD.FlexDMD")` ou `UltraDMD.DMDObject`, dossier du DMD) et dont le script n'écrit pas lui-même le score sur le pack (`LabelNew`, `LabelInit`), le diagnostic écrit `[ScoreView] Priority.PUP = 0` dans le `.ini` de la table (« Le PuP-Pack cacherait le DMD de la table », `pupHidesDmd`), et le front-end le fait seul avant la partie.
  Le pack garde le fronton et le topper ; une valeur déjà réglée pour la table dans le menu de VPX est respectée.
  Cas trouvé sur *2001* (score UltraDMD, option « DMD on Fulldmd »).
- **Limites** : sans MagnaSave, on ne change pas de ligne dans le menu de VPX (`UIUp`, `UIDown`) ; l'ordre d'empilement de deux fenêtres de VPX qui se chevauchent (DMD sur le fronton) est laissé à Windows.
