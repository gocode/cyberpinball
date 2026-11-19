[English](../manual/pup-packs.md) · Français · [Sommaire du manuel](../manuel.md)

## PuP-Packs

Cyber Pinball vise le **mode plugins de VPX 10.8.1** : le plugin PUP livré avec VPX remplace PinUP Player, qui n'a rien à installer ni à enregistrer (le mode classique viendra plus tard, DOF passe par le plugin DOF de VPX : voir [LED et retours (DOF)](led-et-retours-dof.md#led-et-retours-dof)).
Le plugin cherche le pack dans `<dossier de la table>\pupvideos\<nom>`, sans tenir compte de la casse, où `<nom>` est la valeur passée par le script à `PuPlayer.B2SInit` ou `Init`, ou à défaut la ROM jouée.

**À l'ajout** ([packages/core/src/puppack.ts](../../packages/core/src/puppack.ts), [tableimport.ts](../../packages/core/src/tableimport.ts)), un pack (dossier qui contient `screens.pup`, `playlists.pup`, `triggers.pup`, ou des options qui en contiennent) est :

- **nommé** comme le script le charge : nom passé à `B2SInit` (littéral, ou variable comme `pGameName`, `cPuPPack`), puis la ROM, puis le nom passé à `Init`.
  Un pack déjà bien nommé garde son nom ; un pack nommé autrement (« Monster Bash PuP-Pack v2 ») prend le nom attendu.
  Sans script lisible (VPX absent), il garde le nom de son dossier et le plan le signale ;
- **aplati** : `rom\rom\…`, ou un dossier d'archive qui ne contient que le pack (un lisez-moi à côté ne gêne pas) ;
- **nettoyé** : `._*`, `.DS_Store`, `__MACOSX` et MP4 de 0 octet ne sont pas installés ;
- **remplacé en entier** s'il existe déjà : l'ancien dossier part à la corbeille, jamais de mélange ;
- **configuré** : l'option de disposition des écrans est appliquée en recopiant ses fichiers, **sans jamais exécuter de `.bat`**.

**Les options.**
Les packs publiés rangent leurs variantes dans `PuP-Pack_Options\<option>\` et livrent un `.bat` par option à la racine, par exemple `Option 2 - FullDMD on Backglass.bat` :

```bat
rem echo off
xcopy /y "PuP-Pack_Options\Option 2 - FullDMD on Backglass\*"
del /Q PuPDesktopPunch.exe
del /Q PuPInit.bat
```

Chaque `.bat` dont le nom parle d'option (ou qui copie des fichiers) est **lu, pas exécuté**.
Sont reconnus : `copy` et `xcopy` d'un dossier, d'un motif (`*`, `*.pup`) ou d'un fichier du pack vers sa racine ou un de ses dossiers (`/s`, `/e` pour descendre), `del`/`erase` de fichiers de la racine (ils partent à la corbeille), et ce qui n'a pas d'effet : `rem`, `::`, `echo`, `@echo off`, `pause`, `cls`, `exit`, `title`, `cd`/`pushd` vers le dossier du `.bat` (`%~dp0`, `.`), `>nul`.
Tout le reste fait échouer l'analyse : chemin absolu, `..`, variable (`%PUPDIR%`), `start`, `if`, `for`, `call`, `set`, `move`, `ren`, `rd`, enchaînements (`&`, `|`), redirection vers un fichier, copie sans fichier correspondant.
Les dossiers d'options sans `.bat` lisible (packs livrés avec seulement `PuP-Pack_Options`, comme ceux qu'on applique à la main sous Linux) deviennent aussi des options.
Les `.bat` d'outils du mode classique (`PuPInit.bat`, `configdisplays.bat`) sont ignorés.

**Choix de l'option**, d'office, d'après le modèle de borne : le nom de l'option (« Topper », « FullDMD on Backglass », « 2 Screen », « Desktop », « 16x9 », « 4x3 », « AIO », « Stream »…) puis son `screens.pup` (écran 0 allumé : topper ; écran 5 ou 1 dans le backglass par CustomPos : DMD dans le backglass) sont comparés aux rôles affectés (backglass, DMD, topper) et aux proportions du DMD (4:1 réel ou FullDMD 16:9) et du backglass.
Une option de bureau ou pour borne tout-en-un n'est jamais retenue sur une borne.
Si le choix n'est pas net, si la borne n'est pas configurée, ou si un `.bat` n'a pas pu être lu, l'écran « Quelle option du PuP-Pack ? » s'ouvre avant le plan, avec le `.bat` refusé et sa raison ; depuis le plan, « Changer l'option du PuP-Pack » le rouvre.
L'option retenue et le nom d'origine du pack sont gardés dans le `.info` de la table (`CyberPinball.pup.<nom>`, les autres champs sont conservés) : à la mise à jour du pack, la même option est reprise sans question.

**Encart DMD sur le backglass.**
Beaucoup de packs n'ont ni écran DMD (1) ni FullDMD (5), mais un écran posé sur le backglass dont le nom ou la playlist parle de DMD (*Star Trek LE* : écran 13 « BGdmdText », à 26 %, 79 %, sur 48 % × 21 % du backglass).
Allumé, le pack y passe ses propres animations : le vrai DMD reste sur son écran (option pour borne à DMD).
Éteint, l'encart reste vide pour qu'on y pose le DMD (option pour borne à deux écrans).
Sans écran 1 ni 5 ni encart, rien n'est déduit du `screens.pup` sur le DMD : l'absence d'écran DMD du pack ne veut pas dire « borne sans DMD ».
Le DMD de la ROM ne peut pas s'afficher dans un encart du pack : le plugin PUP, qui dessine alors la fenêtre du backglass, ne dessine jamais le DMD.

**Changer d'option après l'installation** : fiche de la table > « PuP-Pack », proposé dès qu'un pack de la table a des options (`tablePupPacks`, `packages/core/src/doctor.ts`).
L'écran montre l'option appliquée, celle qui convient à la borne, et chaque option avec ce qu'elle vise (topper, DMD sur son écran ou dans le backglass, FullDMD, proportions).
Start applique l'option choisie : ses fichiers sont recopiés, ceux qu'ils remplacent et ceux que son `.bat` supprime partent à la corbeille (`trash\<date> PuP-Pack <dossier>` : l'état d'avant, pour y revenir), aucun `.bat` n'est exécuté (`pupOptionOps`).
Si un fichier de l'option manque dans le pack, rien n'est touché et le message dit lequel (`missingSources`).
Après la copie, le pack est relu : « appliquée » ne s'affiche que si l'option est reconnue en place, sinon le message dit ce qui manque (`checkAppliedOption`).
Le choix est retenu dans le `.info` (`option`, et `chosen: "user"` : le diagnostic ne le remet plus en cause) et sert dès la partie suivante ; « Jouer » est proposé sur le même écran pour le voir.
Sur la fiche, la ligne « PuP-Pack » passe en orange quand une autre option convient mieux à la borne.
« Pour cette borne » nomme l'option conseillée et la borne telle qu'elle est configurée (fronton, FullDMD ou DMD 4:1, topper) ; quand deux options se valent, il nomme les deux, à essayer.
Une liste plus haute que l'écran montre un filet sur le bord derrière lequel il reste des entrées, en haut comme en bas, et l'entrée choisie est amenée entière dans la vue quand le choix change (`markOverflow`, `app/renderer/library.js`, toutes les listes des écrans de gestion).
**La position d'une liste ne suit que les gestes de l'utilisateur** (flippers, Tab, clic, molette) : un écran redessiné par une mise à jour (progression d'un téléchargement, « Attente du site · 27 s », état d'un fichier reçu) remet chaque liste où elle était, sans y ramener l'élément choisi ; on peut parcourir les propositions à la molette pendant qu'une carte télécharge.
Seul `app/renderer/scroll-keeper.js` fait défiler une liste (front-end et réglages de VPX) : il relève chaque liste défilée avant le rendu et la remet après, et ne ramène le choix dans la vue que s'il a changé ou si un autre écran s'ouvre (qui repart du haut) ; une liste dont le contenu change de nature porte sa propre clé (`data-scroll-key`, détail d'un réglage de VPX) et repart du haut.
Ce qu'on voit ne bouge pas non plus : l'élément choisi, s'il était dans la vue, reste au même endroit de sa liste quand une mise à jour insère quelque chose au-dessus (bandeau « Non connecté » d'un site en tête des propositions), et s'il y était entier et qu'il grandit (« Choisi, à enregistrer »), la liste avance juste assez pour qu'il le reste.
Un écran ouvert directement sur un élément plus bas (médias reçus d'un ami) le garde entier tant qu'aucun geste n'a suivi, même quand les images des cartes se chargent ensuite.
Ces positions se mesurent dans la mise en page de la liste (`offsetTop`), jamais à l'écran : le plateau d'une borne est tourné et `getBoundingClientRect` y mesure l'autre axe (un choix qui débordait passait pour entier).
Jamais de fondu : il faisait passer la dernière ligne visible pour désactivée ; le garde-fou de mise en page signale un fondu sur une liste qui défile et un choix qui n'est pas entier dans sa liste, `defilement.test.ts` refuse un fondu dans les feuilles de style.
Une liste seule (menu système, rubriques) part juste sous le titre, à la même hauteur d'un écran à l'autre, centrée en largeur seulement.

**Reconnaître l'option en place** (`appliedOption`, [puppack.ts](../../packages/core/src/puppack.ts)).
Tout ce que l'option recopie doit être à la racine, identique, et ce que son `.bat` supprime doit en être absent ; seules les images d'aperçu posées à la racine (`Option 2.JPG`, pour PinUP Popper) ne comptent pas.
Les `.pup` seuls ne suffisent pas : sur *Guardians of the Galaxy* (`gotg_2020`), les options 0 « 3 Screen Desktop » et 2 « 3 Screen FullDMD » ont les mêmes `screens.pup`, `playlists.pup` et `triggers.pup` ; seuls `Option Selected.txt` et les outils du bureau (`PuPDesktopPunch.exe`, `PuPInit.bat`) les distinguent.
Une option complète passe avant une option dont seuls les `.pup` sont là (« en partie seulement », avec ce qui manque) ; entre options aux fichiers identiques, celle retenue dans le `.info`, et l'écran le dit (« Mêmes fichiers »).
Le `.bat` est lu dans l'ordre : `del Option*.jpg` puis `xcopy … Option 2.JPG` laisse l'aperçu en place (avant, il partait à la corbeille juste après sa copie).
Le dossier d'une option est celui de ses `.pup` ; un dossier d'options qu'un `.bat` recopie ne redevient pas une seconde option, et deux options ne portent jamais le même nom : chaque option de GOTG apparaissait deux fois, et l'égalité entre jumelles cachait la recommandation (« pas de choix net »).
Un dossier de sauvegarde (`PuP-Pack_Options - Copy`, `_backup`, `….orig`, `….bak`) n'est jamais une option (`isBackupName`).
« NoDMD » attaché se lit comme « No DMD ».

**PuP-Pack coupé par le script.**
Certains scripts ne lancent le pack que si une variable le permet, et la livrent éteinte : *2001 - A Space Odyssey (Original 2025)* écrit `usePUP = False` (« enable Pinup Player functions for this table »).
Le pack a beau être rangé et son option appliquée, le script n'appelle jamais `PuPlayer.B2SInit` : le plugin PUP ne charge rien (`vpinball.log` dit « Plugin PUP loaded », jamais « PUP path ») et la partie n'affiche que le fronton et le DMD habituels.
`pupScriptSwitch` ([puppack.ts](../../packages/core/src/puppack.ts)) suit les conditions qui entourent `CreateObject("PinUpPlayer.PinDisplay")`, dans sa Sub puis là où elle est appelée, et retient la variable dont la valeur de départ, littérale et jamais rallumée ailleurs, empêche d'y arriver.
Il se tait quand la valeur vient d'une option de la table, d'un fichier lu ou d'une autre variable (*Guardians of the Galaxy* : `DMDMode`).
Pour allumer le pack sans modifier la table, Cyber Pinball écrit `<table>.vbs` à côté du `.vpx` : VPX 10.8.1 joue ce fichier à la place du script de la table (`PinTable::LoadScriptOverride` ; le journal dit « Loading script: … »).
C'est le script lu dans le `.vpx` (`readVpxScript`, [vpxinfo.ts](../../packages/core/src/vpxinfo.ts), sans VPX), octet pour octet, où seule la valeur change, plus une dernière ligne `' CyberPinball-script {…}` qui garde l'empreinte du script d'origine ([scriptpatch.ts](../../packages/core/src/scriptpatch.ts)) ; les numéros de ligne des erreurs de script ne bougent pas.
Ce `.vbs`-là n'est pas un « script remplacé » : la fiche dit « Script adapté ».
À l'ajout d'une table avec son pack, ou d'un pack pour une table déjà installée, le plan l'écrit d'office ; à la mise à jour de la table, il le refait d'après le nouveau script, ou le met à la corbeille si la nouvelle version lance le pack d'elle-même.
Un `.vbs` venu d'ailleurs n'est jamais remplacé : le diagnostic propose d'y allumer le pack.
Un script protégé (chiffré) ne se lit pas sans VPX : le diagnostic dit alors quelle valeur changer.

**Interrupteur relayé, et PuP-DMD.**
*The Goonies Never Say Die Pinball (VPW 2021)* livre `Const enablePupPack = False`, puis `Dim HasPuP : HasPup = enablePupPack`, et ne lance le pack que `If HasPup Then`.
On entendait la musique de la table, jamais le pack.
Le journal disait « Plugin PUP loaded », sans « PUP path ».
`pupScriptSwitch` suit maintenant une variable qui ne fait que recopier une autre (deux relais au plus, jamais changée dans une Sub) jusqu'à la valeur littérale : c'est elle qu'on allume.
La PuP-DMD (le score que le script écrit sur l'écran DMD du pack, `LabelInit`) a souvent son propre interrupteur (`Const enablePupDMD = False`), trouvé de la même façon par `pupDmdSwitch`.
Éteint, le pack pose son cadre vide (`PuPFrames\default.png`) dans la fenêtre du DMD, par-dessus le DMD de la table, et le script demande à PinUP Player de cacher cet écran (`SendMSG` FN 12), ce que le plugin PUP ne fait pas.
`pupSwitchesToEnable` allume donc les deux quand l'option en place occupe la fenêtre du DMD (`packDrawsDmd`) d'une borne qui en a une, sinon le pack seul.
Le `.vbs` les garde tous dans sa dernière ligne (`kind: 'dmd'` pour la PuP-DMD).
Le diagnostic relit le script dans le `.vpx` au lieu de se fier à la lecture gardée en cache, qui pouvait dater d'avant (lectures en version 6 : une ancienne lecture de la même table est refaite sans VPX, `cachedScript`).
L'ajout d'une table ou d'un pack fait de même.

**Pack que personne ne lance.**
*Game of Thrones LE (VPW, Stern 2015)* est une table originale en FlexDMD, sans ROM.
Son script ne crée jamais `PinUpPlayer.PinDisplay` (« `Dim PuPlayer ' Not currently used` ») ; le pack de mikeleonheart est fait pour PinUP Player branché sur B2S Server, qui le cherchait sous le nom du jeu donné à B2S (`cGameName = "gameofthrones"`).
Le plugin PUP de VPX 10.8.1 ne charge un pack de lui-même que pour un jeu PinMAME (`OnControllersChanged` ne retient qu'un jeu `pinmame::…`, jamais `b2s::…`) : le journal disait « Plugin PUP loaded », jamais « PUP path ».
Le diagnostic, lui, ne disait rien : sans appel PuP ni ROM, il n'attendait aucun nom, et aucune de ses règles ne s'appliquait.
C'était le troisième pack de suite installé sans vidéo sur le fronton.
Désormais, `pupLoaderNeeded` ([puppack.ts](../../packages/core/src/puppack.ts)) reconnaît ce cas ; le nom attendu est celui du jeu pour B2S (`b2sName`, lu dans `.B2SName = "…"` ou `cGameName`), à défaut celui du seul dossier du pack, et le pack y est renommé (l'option retenue dans le `.info` suit, `renamePupMemory`).
Le `.vbs` de Cyber Pinball lance alors le pack comme le ferait la table (`addPupLoader`) : `Sub Table1_Init() : CyberPinball_PuPStart` sur la ligne de la Sub (le nom de l'objet table est lu dans le `.vpx`, `readVpxTableName`), et, après la dernière ligne, une Sub qui crée `PinUpPlayer.PinDisplay` et appelle `B2SInit "", "<pack>"`, sous `On Error Resume Next` puis `Err.Clear`.
Les numéros de ligne ne bougent pas ; la dernière ligne garde `"loader": {…}`, et le `.vbs` est refait à la mise à jour de la table tant que le nouveau script ne lance pas le pack lui-même.
C'est fait avant chaque partie (« PuP-Pack jamais lancé », dans `PUP_PLAY_REPAIRS`).
Garde-fou : un pack présent qu'aucun nom ne désigne (plusieurs dossiers, aucun nom de jeu) donne « PuP-Pack jamais chargé » au lieu du silence.
Le test `puplancement.test.ts` simule le plugin (nom donné par le script joué, ou ROM, puis `pupvideos\<nom>\screens.pup`) sur chaque forme de table : sans ROM ni PuP, `B2SInit` sous le bon ou un autre nom, `usePUP = False`, jeu PinMAME ; après les réparations d'avant-partie, chacune charge son pack.

**Déclencheurs par images du DMD sans PinMAME.**
Le pack de *Game of Thrones* compte 185 déclencheurs actifs, dont 183 `D<n>` avec `PupCapture\<n>.bmp` : PinUP Player reconnaissait les images du DMD de la table.
Le plugin PUP ne reçoit ces images que des ROM de PinMAME (`GetIdentifyFrame`) ; FlexDMD ne les lui donne pas (`FlexDMDPlugin.cpp`, « TODO … pup events »).
Le script, lui, lit l'image de FlexDMD : `FlexDMD.DmdPixels` rend 128 × 32 octets aux 16 niveaux exacts des captures (0, 17 … 255 en `GRAY_4`), en tableau que le VBScript lit point par point.
Le `.vbs` de Cyber Pinball refait donc la reconnaissance du plugin ([pupcapture.ts](../../packages/core/src/pupcapture.ts)) : `Sub FrameTimer_Timer() : CyberPinball_PuPCapture` sur la ligne de la Sub du minuteur d'images de la table (celui dont le script met `Interval = -1`), et, après la dernière ligne, un bloc qui lit l'image au plus toutes les 20 ms de `GameTime`, compare 16 points témoins puis l'empreinte de la zone des seules captures candidates, et envoie `B2SData "D<n>", 1` puis `0` à l'objet qui a lancé le pack (`CyberPinball_PuP`, ou celui du script), comme libpupdmd : la première capture par numéro croissant, jamais deux fois de suite la même.
La première ligne du bloc porte ses réglages (pack, objets, minuteur, profondeur, empreinte des fichiers de `PupCapture`), la dernière ligne du `.vbs` aussi (`"capture": {…}`) : captures ou script changés, le bloc est refait à sa place ; table mise à jour, il suit le `.vbs` refait.
Le diagnostic le propose (« Vidéos du PuP-Pack déclenchées par le DMD : sans effet », correction « Reconnaître les images du DMD ») et le front-end le fait seul avant la partie (`PUP_PLAY_REPAIRS`).
Impossible sans objet `FlexDMD.FlexDMD`, avec un DMD en couleurs, sans minuteur d'images, sans objet du pack dans une variable, ou avec un script protégé : le constat le dit, sans correction.
Rien n'est fait quand le script envoie lui-même des `D` (`PuPlayer.B2SData "D…"`, `dmdTriggers`).
Sur *Game of Thrones*, 120 des 183 captures actives sont, point pour point, une image d'une ressource FlexDMD ; les autres mêlent une ressource et le texte du script, à vérifier sur la borne.
Coût mesuré dans `cscript` : 0,28 ms par lecture d'une image ordinaire.
Tests : `pupcapture.test.ts` exécute le VBScript généré dans `cscript` (FlexDMD et PinDisplay simulés) et le compare à la reconnaissance de libpupdmd ; `pupcapture-medecin.test.ts` vérifie la réparation, la mise à jour des captures et de la table, un `.vbs` venu d'ailleurs, `usePUP = False`.
Lectures des scripts en version 7.

**Fond déjà en place.**
Le plugin PUP relance la vidéo de fond d'un écran à chaque déclencheur `SetBG`, même quand c'est celle qui tourne (`PUPMediaManager::Play`) ; PinUP Player la laissait tourner.
Sur *Game of Thrones*, l'écran « choisis ta maison » du DMD alterne avec une image de remplissage : D11 (Stark, `SetBG`) repartait à chaque retour, et le fronton ne montrait presque que le début noir de la vidéo, cadre compris, avec des éclairs de Stark.
`backgroundTriggers` ([pupcapture.ts](../../packages/core/src/pupcapture.ts)) lit dans `triggers.pup` les déclencheurs `D<n>` dont toutes les lignes actives posent un fichier en fond ; la reconnaissance ne les envoie que s'ils changent le fond d'au moins un écran (`CyberPinball_PuPCapChanges`).
Un déclencheur qui fait autre chose part comme avant.
`triggers.pup` entre dans l'empreinte du bloc (`captureSignature`) : un `.vbs` déjà écrit est refait avant la partie suivante.
Un fond changé par un déclencheur que la reconnaissance n'envoie pas (`E…`, envoyé par la table) n'est pas suivi.

**PuP-Packs incomplets** (essai du 10 novembre 2026, *The Matrix* : son du début et topper).
Toute panne d'un pack devient un contrôle de tous les packs : une minute après le lancement, le journal relève les packs installés et ceux qui sont incomplets (« PuP-Packs : N pack(s) contrôlé(s), M incomplet(s) … », `auditPupPacks`), fichiers absents et playlists jouées mais vides.
Le contrôle ne bloque jamais une partie : le diagnostic de la table le dit, et « Ce qu'il manque pour jouer » propose de recompléter le pack par le circuit d'acquisition (« Recompléter le PuP-Pack », le pack complet du jeu de la table).
Ce jour-là, sur le PC de développement : 8 packs, 4 avec un fichier absent chacun (*2001*, *Game of Thrones LE*, *Star Trek LE*, *The Matrix* : `Toppers\TopperEnterMatrix.mp4`), aucune playlist jouée vide.
Les playlists vides de *The Matrix* (Intro, Start, Smith, PUPOptions) ne sont jouées par rien : elles ne font pas d'alerte, et n'expliquent pas son début de partie.

**Fichiers que le plugin lit autrement.**
La correction du fond déjà en place n'a pas suffi : le fronton de *Game of Thrones* clignotait toujours.
La vraie cause était dans les fichiers du pack.
Les blasons des maisons (`Choose your House\Stark.mp4`…) sont des images PNG ou JPEG, le fond du fronton (`Backglass\Backglass.mp4`) un JPEG, tous nommés `.mp4`.
PinUP Player les montrait comme des images ; le plugin PUP choisit d'après l'extension (`PUPScreen::Play` : seuls `.png`, `.jpg`, `.jpeg` et `.bmp` sont des images) et les donne à FFmpeg, qui les joue comme des vidéos d'une seule image, en boucle : un fronton presque noir, avec des éclairs du blason.
Le même pack nomme `9y10perro y montaña.mp4` dans un `triggers.pup` en UTF-8 ; le plugin convertit ce nom avec la page de codes de Windows (`std::filesystem::path` d'une `std::string`, `PUPTrigger::CreateFromCSV`), ne trouve pas le fichier et abandonne le déclencheur (« PlayFile not found » dans `vpinball.log`).
`packFileFixes` ([pupfiles.ts](../../packages/core/src/pupfiles.ts)) lit la nature de chaque fichier des playlists à ses premiers octets (`mediaKind`) : une image nommée comme une vidéo reprend sa vraie extension, un nom accentué (fichier ou dossier de playlist) passe en ASCII (`asciiName`), sans jamais écraser un autre fichier, et chaque `.pup` du pack, options et sauvegardes comprises, est réécrit octet pour octet sauf les noms changés : l'option en place reste reconnue.
Un nom que cite le script de la table n'est jamais changé.
C'est le constat « Fichiers du PuP-Pack que le plugin PUP lirait mal », réparé avant chaque partie (`PUP_PLAY_REPAIRS`) et désormais aussi dès l'installation d'une table ou d'un pack (`install`, [library.ts](../../app/src/library.ts), qui applique toutes les réparations de `PUP_PLAY_REPAIRS`).
Ce qui reste introuvable, un fichier nommé par un déclencheur actif ou un écran allumé et absent du pack, est signalé (« Fichiers du PuP-Pack absents », `missingPackFiles`, sans correction) : sur la borne, la vidéo FullDMD de bietekwiet pour *Game of Thrones*, et un fichier dans les packs de *2001*, *Star Trek* et *The Matrix*.
Le test `pupfichiers.test.ts` simule la lecture du plugin (noms lus en page de codes Windows, sans tenir compte de la casse) et vérifie qu'après les réparations chaque fichier nommé se retrouve et qu'aucune image ne porte d'extension de vidéo.

**Fronton laissé au `.directb2s`, et réparations avant la partie.**
Une option peut poser l'écran Backglass (2) dans le FullDMD (5) : sur *2001*, « (3 Screens) B2S Users, …, Pup on Fulldmd » écrit `2,Backglass,…,"5,12.7,13.5,74.8,74.6"`.
Le plugin ne dessine alors rien dans la fenêtre du fronton : une fenêtre n'est remplie que si sa racine (topper : écran 0 ; fronton : 2, sinon 6 ; DMD : 5, sinon 1) n'est pas un écran posé dans un autre sans enfant, et qu'un écran visible en descend (`PUPManager::Render`, reproduit par `pupWindows` dans [puppack.ts](../../packages/core/src/puppack.ts)).
Ces options « B2S Users » comptent sur le `.directb2s` de la table ; sans lui, le fronton reste sur une image fixe.
Le choix d'office lit donc, dans le `screens.pup` de chaque option, les fenêtres qu'elle remplit : un fronton laissé vide coûte beaucoup si la table n'a pas de `.directb2s`, un peu si on ne sait pas, presque rien sinon (le pack sur le fronton reste préféré).
La fenêtre du topper, remplie ou non, l'emporte sur le nom (« Default Locale Topper Off » range le topper dans l'écran principal).
Le diagnostic propose alors l'option qui met le pack sur le fronton (« Option du PuP-Pack inadaptée à la borne », avec « fronton laissé au .directb2s » et « table sans .directb2s »).
Avant chaque partie, le front-end fait seul les réparations du pack que le diagnostic proposerait (`PUP_PLAY_REPAIRS`, `repairPupForPlay` : pack renommé ou remonté, option recopiée ou changée, script qui coupe le pack, `.vbs` de Cyber Pinball périmé) : sans elles, un pack restait éteint tant qu'on n'ouvrait pas le diagnostic.
Une option choisie dans la fiche est gardée, la table n'est jamais modifiée, les fichiers remplacés vont à la corbeille (`trash\… Avant la partie <dossier>`), et le journal du front-end note chaque réparation (« PuP-Pack (…) : … »).

**Ordre des playlists.**
Un écran dont `screens.pup` donne la playlist sans fichier joue le premier fichier du dossier.
Le plugin PUP trie ces fichiers en tenant compte de la casse (`PUPPlaylist.cpp`, `std::ranges::sort`), PinUP Player comme Windows.
Les auteurs nomment souvent une image transparente pour qu'elle passe en premier (`aaclear.png`, `blank.png`, `black.png`) ; pour le plugin, `Overlay1 by Dr Nobody TY.png` passait devant.
Sur *2001*, l'écran 14 « Callouts » affichait ainsi un cadre entier écrasé au milieu du fronton ; *Guardians of the Galaxy* avait six dossiers dans ce cas.
`playlistRenames` ([puppack.ts](../../packages/core/src/puppack.ts)) repère, dossier par dossier, le fichier que PinUP Player jouerait en premier et le renomme en majuscules, extension gardée : il passe alors premier dans les deux ordres.
Le plugin retrouve sans tenir compte de la casse un fichier nommé par un déclencheur ou par `screens.pup` : rien d'autre ne change.
C'est fait à l'import, par le diagnostic (« Playlist du PuP-Pack lue dans le mauvais ordre ») et avant chaque partie.

**Le diagnostic** ([doctor.ts](../../packages/core/src/doctor.ts)) vérifie, sans lancer VPX :

| Constat | Quand | Correction |
| --- | --- | --- |
| PuP-Pack introuvable | le script charge un pack (ou un dossier `pupvideos` existe) et aucun `pupvideos\<nom attendu>` | renommer le seul dossier présent ; sinon, ajouter le pack |
| PuP-Pack rangé un dossier trop bas | `pupvideos\X\X\screens.pup` | remonter le pack |
| PuP-Pack inutilisé | un autre dossier de `pupvideos` qu'aucune version du dossier ne charge | corbeille |
| PuP-Pack coupé par le script | un pack attendu est rangé, et le script que VPX joue (le `.vbs` à côté de la table s'il y en a un) ne lance jamais le pack (`usePUP = False`, ou `HasPup = enablePupPack` avec `enablePupPack = False`), ou, l'option du pack occupant la fenêtre du DMD, laisse la PuP-DMD éteinte (`enablePupDMD = False` : « PuP-DMD coupée par le script ») | allumer chaque interrupteur dans `<table>.vbs` (ou dans le `.vbs` déjà là) ; script protégé : les valeurs à changer |
| PuP-Pack jamais lancé | table sans ROM dont le script ne lance jamais PuP, pack rangé sous le nom attendu (nom du jeu pour B2S, ou seul dossier), et aucun `.vbs` qui le lance | le lancer dans `<table>.vbs`, au début de `<table>_Init` (fait aussi avant la partie) ; script protégé : rien à faire sans VPX |
| PuP-Pack fait pour une autre version de la table | table sans ROM dont le script ne lance pas PuP (Cyber Pinball lance le pack), pack dont les déclencheurs `E<n>` attendent des numéros que le script n'envoie jamais (il n'envoie que ceux de DOF ou de `B2SSetData`, `scriptB2sEvents`), sans déclencheur par défaut ni images du DMD reconnues (`packDrivers`) : le fronton et l'écran du pack restent noirs (*JP's Space Cadet* v7.0 et le pack de la Galaxy Edition) ; le détail donne les numéros attendus (« E1 à E40 ») et ceux que le script envoie | aucune : installer la version du jeu qui demande ce pack (« incl. PuP » ou note de VPS dans le catalogue), ou retirer le pack |
| Vidéos déclenchées par le DMD : sans effet | pack à `PupCapture`, table sans ROM, déclencheurs `D<n>` actifs avec leur image, script qui n'envoie aucun `D`, et aucun `.vbs` qui les reconnaît à jour | les reconnaître dans `<table>.vbs` sur l'image de FlexDMD (fait aussi avant la partie) ; DMD en couleurs, sans minuteur d'images ou script protégé : aucune |
| Script adapté pour une ancienne version | le `.vbs` de Cyber Pinball est tiré d'un autre script que celui du `.vpx` (table mise à jour à la main) | le refaire d'après le nouveau script, ou le mettre à la corbeille |
| Option non appliquée, ou modifiée | des options, et une racine sans `.pup` (ou dont les `.pup` ne sont ceux d'aucune option, `appliedOption`) | recopier l'option retenue (mémorisée, sinon d'après la borne) et la mémoriser |
| Option différente de celle retenue, ou incomplète | l'option retenue dans le `.info` n'est pas celle dont les fichiers sont en place (`.bat` lancé à la main, copie interrompue), ou n'y est qu'en partie (un fichier qu'elle supprime est revenu) | choisie dans la fiche, ou en partie en place : la réappliquer ; retenue d'office à l'installation : retenir l'option en place (fait aussi avant la partie) |
| Option inadaptée à la borne | une option appliquée, une autre nettement mieux notée pour la borne actuelle (borne changée depuis l'installation, ancien choix d'office, fronton laissé au `.directb2s` d'une table qui n'en a pas), sauf si l'option a été choisie dans la fiche | appliquer la meilleure et la mémoriser |
| PuP-Pack sans screens.pup | le pack n'a pas de `screens.pup` à sa racine et aucune option ne reste à appliquer : pack sans options, ou pack à options dont l'option en place n'en apporte pas (*Hellboy*, *Daredevil*, *24*) ; PinUP Player prenait ses écrans par défaut, le plugin PUP n'en crée aucun et le pack reste éteint | déclarer dans `screens.pup` les écrans que le pack vise, comme PinUP les montrait (`defaultScreensPup`) ; fait aussi à l'installation et avant la partie |
| Le PuP-Pack cacherait le DMD de la table | le pack occupe la fenêtre du DMD (écran 5 ou 1), la table dessine son DMD (ROM, FlexDMD, UltraDMD) sans écrire le score sur le pack, et le `.ini` de la table ne règle pas `[ScoreView] Priority.PUP` | écrire `[ScoreView] Priority.PUP = 0` dans le `.ini` de la table (fait aussi avant la partie) |
| Score du PuP-Pack dans le fronton, écran DMD vide | la borne a un écran DMD, le script écrit le score sur le pack (`LabelNew`), l'écran du DMD du pack (5, sinon 1) est posé dans le fronton (CustomPos « 2,0,0,100,100 » : pack fait pour un seul écran 16:9, comme City Hunter) et aucune option du pack ne le met sur le DMD : le plugin PUP ne dessine rien dans la fenêtre du DMD (`dmdInBackglass`) | réécrire le CustomPos de cet écran dans `screens.pup` (l'ancien à la corbeille) pour qu'il soit une racine qui montre, dans la fenêtre du DMD, la bande du fronton que les autres écrans laissent libre, au plus grand sans la déformer et centrée (`dmdBandPlacement` : l'écran garde les proportions 16:9 du fronton, car le plugin place et dimensionne les étiquettes en % de la largeur et de la hauteur ; ex. « 1,0,-133.34,100,233.11 » pour un DMD 1724 × 416, « 1,0,-28.65,100,100 » pour un FullDMD 16:9) ; le CustomPos d'origine et celui posé sont retenus dans le `.info`, et la place est recalculée quand la fenêtre du DMD change de forme (« Score du PuP-Pack à recadrer sur l'écran DMD », autre configuration de la borne) ; une place changée à la main depuis est laissée (fait aussi avant la partie) |
| Score du PuP-Pack à remettre dans le fronton | la borne n'a plus d'écran DMD et l'écran a la place posée ci-dessus | remettre le CustomPos d'origine retenu dans le `.info` (fait aussi avant la partie) |
| Fichiers du PuP-Pack que le plugin PUP lirait mal | dans une playlist, une image nommée comme une vidéo (`Stark.mp4`, un PNG), ou un nom accentué | redonner son extension à l'image, passer le nom en ASCII, réécrire chaque `.pup` du pack (options comprises) ; fait aussi à l'installation et avant la partie ; nom cité par le script : laissé |
| Fichiers du PuP-Pack absents | un déclencheur actif ou un écran allumé nomme un fichier absent de sa playlist | aucune réparation sur place : « Ce qu'il manque pour jouer » propose de recompléter le pack (information, jamais bloquant) |
| Playlists du PuP-Pack vides | une playlist que le pack joue vraiment (déclencheur actif sans fichier choisi, écran allumé, ou script de la table quand le pack la déclare dans `playlists.pup`) est vide ou absente ; une playlist vide que rien ne vise est ignorée, comme un pack sans un seul média (configuration seule, pas installé) (`emptyPlayedPlaylists`) | aucune réparation sur place : « Ce qu'il manque pour jouer » propose de recompléter le pack (information, jamais bloquant) |
| Playlist lue dans le mauvais ordre | dans un dossier du pack, le premier fichier pour le plugin PUP (tri sensible à la casse) n'est pas celui de PinUP Player (tri de Windows) : `aaclear.png` derrière `Overlay1….png` | renommer le fichier voulu en majuscules (extension gardée) ; fait aussi à l'import et avant la partie |
| Écrans du pack absents de la borne | un écran visible vise le topper, le DMD ou le backglass alors que le rôle n'est pas affecté | — (information) |
| Vidéos sur le plateau non affichées | l'écran 3 (Playfield) est visible : le plugin ne le rend pas | — |
| PuP-Pack piloté par le script | `playlistadd` dans le script et aucun `.pup` | — |
| Pack prévu pour une autre ROM | dossier `PupCapture` et ROM différente du nom d'origine du pack, ou ROM d'une autre langue (suffixe `f`, `g`, `i`, `s` après la version, supposé) | — |
| Journal de VPX | dernière partie de la table dans `vpinball.log` (« Starting script » ou « Startup done » de VPX 10.8.1) : pack chargé sans `screens.pup`, aucun pack chargé (sauf si le script coupe le pack : le constat précédent le dit), fonctions `Not implemented`. | — |
| PuP-Pack désactivé | le pack de la table est dans `pupvideos (off)` (« Parties du jeu » > PuP-Pack > « Désactiver le PuP-Pack ») et aucun pack qu'elle charge n'est dans `pupvideos` | — (information) : rien n'est réclamé, ni « introuvable », ni journal « aucun pack chargé », ni option, ni script à allumer |
| Script encore adapté pour le PuP-Pack désactivé | le `.vbs` de Cyber Pinball allume ou lance le pack désactivé (interrupteur, lancement, reconnaissance des images du DMD), ou date d'une ancienne version de la table | refaire le `.vbs` d'après le script de la table sans rien de PuP (les correctifs du `core.vbs` restent), ou le mettre à la corbeille ; fait aussi avant chaque partie |

**Cas non reconnus** (le plan propose alors les options aux boutons, ou le diagnostic le signale) : `.bat` qui demandent un choix (`choice`, `set /p`) ou testent des fichiers (`if exist`), `.bat` qui lancent un exécutable (`PuPDesktopPunch.exe`, installeurs), options rangées hors d'un dossier dont le nom contient « option » et sans `.bat` lisible, packs sans aucun `.pup` hors d'un dossier `pupvideos` (packs anciens pilotés par le script : reconnus seulement s'ils arrivent déjà dans `pupvideos\`), `PinUpPlayer.ini` propre au pack (ignoré par le plugin), modifications faites dans le PuP-Pack Editor (activer les vidéos du topper, par exemple) qui ne correspondent plus à aucune option : signalées en information, jamais écrasées sans le bouton.
Les DLL FFmpeg de VPX et les clés `Priority.PUP` de `VPinballX.ini` (qui font passer le pack devant le directb2s) relèvent de la synchronisation de VPX, pas de ce module.

Sources de la règle des options : l'exemple de `.bat` du [wiki vpinball de dekay](https://github-wiki-see.page/m/dekay/vpinball-wiki/wiki/PUP-Packs), [pup-research](https://github.com/francisdb/pup-research) (« copier les .pup de `PuP-Pack_Options/<option>` à la racine »), le [wiki Batocera](https://wiki.batocera.org/systems:vpinball) (Batman 66 : `Option 3 - Desktop`), les noms d'options des packs VPUniverse et vpinball.com, d'après les résumés des moteurs de recherche (Tron Legacy, Transformers, Aliens, Pirates of the Caribbean, packs PinEvent : « Option 1 - Backglass and Topper », « 2 Screen - 4x3 or 5x4 », « Full DMD on Backglass », « Backbox AIO », « PUP Stream »).
Les pages de VPUniverse refusent la lecture automatique (403) : la règle reste à confirmer sur des packs réels.
