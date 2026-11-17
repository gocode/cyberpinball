[English](../manual/unattended-end-to-end-tests.md) · Français · [Sommaire du manuel](../manuel.md)

## Tests de bout en bout sans opérateur

**Règle, pour tout essai et toute session de développement : hors écran par défaut.**
Un essai sans opérateur ne doit jamais ouvrir de fenêtre sur les écrans du poste, lui prendre le focus ni dépendre des écrans branchés : le poste sert à travailler pendant que les essais tournent, en arrière-plan.

- **Hors écran** (`app/src/offscreen.ts`, règles dans `packages/core/src/offscreen.ts`) : automatique dès que `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` ou `CYBERPINBALL_STRESS` est défini, ou imposé par `CYBERPINBALL_HORS_ECRAN=1`.
  Toutes les fenêtres naissent par `createWindow` et sont rendues en mémoire (rendu hors écran d'Electron, `webPreferences.offscreen`) à la taille de leur écran, au facteur d'échelle 1 : jamais montrées, jamais au premier plan, absentes de la barre des tâches, son coupé.
  `coverDisplay` ne fait que les dimensionner (pivotement simulé compris) ; `show`, `focus`, plein écran, réduction et reprise du premier plan sont sans effet.
  Le rendu est celui d'une vraie fenêtre : captures (`capturePage`), garde-fou de mise en page, touches rejouées et clics (`click:<sélecteur>`, `sendInputEvent`) fonctionnent de la même façon.
- **Écrans simulés** : `CYBERPINBALL_DISPLAYS=<fichier.json>` remplace la détection des écrans partout (assistant, front-end, réglages, `sync`, remise des boutons : `observedDisplays`, `app/src/displays.ts`), même forme que `npm run probe -- --json` (champ `displays`), EDID compris ; un fichier mal formé est refusé avec l'écran et le champ fautifs.
  Jeux versionnés dans `packages\core\ecrans-simules\` : `pc-dev` (les quatre écrans du PC de développement, ceux du modèle de borne de `D:\CyberPinball`), `borne` (playfield 4K couché, fronton 1080p, DMD 4:1, topper), `poste-deux-ecrans` (le poste actuel : principal et deux écrans), `un-ecran`.
  Avec des écrans simulés, l'orientation n'est jamais appliquée à un vrai écran.
- **Guet** : pendant un essai hors écran, toute fenêtre de l'application visible ou au premier plan (`isVisible`, `isFocused`, fenêtres natives du processus, boîtes de dialogue comprises) est signalée dans la console (« Hors écran : … ») et dans `<captures>\hors-ecran.txt` (« Aucune fenêtre visible ni au premier plan » sinon).
  Les scripts de démonstration échouent si une fenêtre est apparue ; `npm test` rejoue l'assistant hors écran sur la borne simulée et le vérifie.
- **Journal de l'application** : tout ce qu'elle écrit dans sa console (le double d'une table, les réglages de l'hôte, les records du groupe, une invitation, un lancement de VPX…) va aussi dans `<racine>\data\logs\journal.txt`, une ligne datée par message, `[avertissement]` ou `[erreur]` quand ce n'en est pas une simple information ; au-delà de 2 Mo, il devient `journal-ancien.txt` et un nouveau commence.
  Ce qui s'est passé sur une borne pendant un essai se relit après coup (`app/src/journal.ts`, `packages/core/src/journal.ts`, tests dans `journal.test.ts`).
  Y sont aussi notés les processus de Chromium arrêtés (rendu d'une page, GPU : `journalProcessesGone`, `app/src/uncaught.ts`) et toute fenêtre montrée sans avoir reçu `ready-to-show` : Electron ne l'émet jamais pour une fenêtre déjà visible à sa première image, ni pour une page qui n'a rien peint de significatif, et, au redémarrage d'une mise à jour sur un poste chargé, le front-end pouvait ainsi rester invisible, Cyber Pinball tournant derrière ses voiles noirs.
  Toute fenêtre attend donc par `whenReadyToShow` (`app/src/offscreen.ts`), qui la montre au plus tard après 10 s et note l'état de sa page (« pas de ready-to-show après 10 s (page en chargement : non, rendu planté : non…) ») ; `offscreen.test.ts` refuse toute autre attente de `ready-to-show`.
- **Exception non rattrapée** : à l'écran, sur la borne, elle est notée dans `<racine>\data\logs\erreurs.txt` (date, nature, pile ; les plus anciennes entrées partent au-delà de 512 Ko) et dans la console, et l'application continue : jamais la boîte modale d'Electron, qui figerait le front-end jusqu'au clic sur OK, souvent cachée sous ses fenêtres plein écran.
  Une promesse rejetée sans traitement y est notée de même (`app/src/uncaught.ts`, `packages/core/src/errorlog.ts`, tests dans `errorlog.test.ts`).
  Y vont aussi, depuis le 10/11/2026, les **incidents rattrapés** (« incident rattrapé » : un geste du téléphone non transmis, une page du navigateur intégré tombée puis rechargée, une demande refusée, un import de connexion raté ; une ligne, jamais ce qui a été tapé ni l'adresse complète d'une page) et, au démarrage suivant, les **plantages natifs** que Node ne voit pas : Crashpad garde leur rapport dans `%APPDATA%\CyberPinball\Crashpad\reports\*.dmp`, sans rien envoyer, et chaque rapport nouveau devient une entrée « plantage natif » avec son chemin (`journalNativeCrashes`, à l'écran seulement).
  Hors écran, elle arrête l'essai en échec, l'erreur dans la console (« Hors écran : exception non rattrapée, essai arrêté. »), au lieu de la boîte modale d'Electron (« A JavaScript error occurred in the main process ») : sur le bureau caché, personne ne la fermerait et le processus principal resterait figé, minuteries et garde-fous compris (`app/src/offscreen.ts`, test d'invariant dans `offscreen.test.ts`).
- **Bureau caché** (`scripts\bureau-cache.ps1`, chargé par exemple par `scripts\diagnostic-habillage.ps1`) : un script d'essai se relance tout entier (PowerShell, node, Electron, outils) sur un bureau Windows à part, `CyberPinballEssais` (`Enter-BureauCache`, `CreateDesktop` puis `CreateProcess` avec ce bureau), que l'utilisateur ne voit jamais ; sa sortie revient dans la console d'origine.
  Même si une fenêtre se montrait par erreur, rien n'apparaîtrait sur les écrans du poste.
  L'application applique la même règle à tout essai sans opérateur, quel que soit son lanceur (`npx electron app` à la main, autre script, autre session) : hors écran et hors du bureau caché, elle s'y relance avec les mêmes arguments (`relaunchOnHiddenDesktop`, `app/src/offscreen.ts` ; `packages/win-displays/src/desktop.ts`), recopie sa sortie et rend son code de sortie ; `npm test` le vérifie.
  Le relais lancé sur le bureau caché est rangé dans un objet tâche de Windows (job, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, créé suspendu puis rangé avant de démarrer) que seul son lanceur tient : quand le lanceur meurt, même tué net au délai d'un test, tout l'arbre du bureau caché meurt avec lui ; il n'hérite pas de la console du lanceur, seul le journal lui est confié.
  Côté tests, tout Electron passe par `runElectron` (`packages/core/src/test/electron-run.ts`) : sortie dans des fichiers, délai, puis tout processus resté vivant de l'essai (reconnu à son `--user-data-dir`) est tué, arbre compris, et le test échoue en le nommant ; les commandes du pare-feu (PowerShell, netsh, schtasks) ont l'entrée fermée, sont rendues à la fin du processus, tuées arbre compris à leur délai (30 s, 5 min pour l'autorisation de Windows) et à la fermeture de l'application (tests dans `enfants-vivants.test.ts`).
  **Seule faille connue : une nouvelle console.**
  Windows 11 la confie au Terminal, qui s'ouvre sur le bureau de l'utilisateur et prend le focus, même depuis le bureau caché : les scripts lancent leurs outils dans leur propre console (`Start-Process … -NoNewWindow`, jamais `start`), l'application les lance avec `windowsHide` (tests d'invariant dans `offscreen.test.ts`).
- **Réservé aux écrans du poste** : une partie de VPX (« Jouer », « Régler l'affichage en partie »), l'endurance et les captures du bureau entier sont refusées hors écran avec le message « … nécessite les écrans du poste », et ne se lancent qu'avec `CYBERPINBALL_A_L_ECRAN=1` (fenêtres réelles, plein écran, focus pris).
  La boîte de dialogue « Choisir des fichiers » est aussi refusée hors écran.
  Lire le script d'une table (`VPinballX -ExtractVBS`) reste permis : VPX n'ouvre alors aucune fenêtre visible.
- **Écrans simulés pour un essai à la main** : les jeux d'écrans de `packages\core\ecrans-simules\` (`pc-dev.json`, `borne.json`, `poste-deux-ecrans.json`, `un-ecran.json`, `pincab.json`) se donnent à `CYBERPINBALL_DISPLAYS`.
  Un essai à la main :

  ```powershell
  $env:CYBERPINBALL_DISPLAYS = "$PWD\packages\core\ecrans-simules\borne.json"
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  $env:CYBERPINBALL_AUTOPILOT = 'SansBoutons,Digit1'
  npx electron app --assistant
  ```

**Garde-fou de mise en page** (`app/src/layout-check.ts`) : à chaque touche rejouée par l'autopilote (assistant, écran des tables, réglages de VPX), chaque fenêtre est inspectée dans son rendu réel.
Sont signalés deux textes ou commandes qui se chevauchent (un calque au fond opaque qui en cache un autre, comme l'aide par-dessus le front-end, n'en est pas un), ce qui sort de la fenêtre, et un texte coupé par un conteneur qui masque ce qui dépasse, lui-même compris.
Une coupure voulue (« … », lignes limitées par `-webkit-line-clamp`) n'excuse que l'élément qui la fait : les lignes gardées ne doivent être rognées par aucun autre conteneur (un titre limité à deux lignes dans une zone haute d'une seule perdait sa première ligne sans être signalé).
Une liste qui défile ne doit porter aucun fondu (`mask-image` : la ligne du bord passerait pour désactivée), et l'entrée choisie d'une liste (action, ligne, carte) doit y être entière : ni rognée, ni cachée par ce qui reste accroché en haut de la liste, sauf dans une liste que l'utilisateur en a lui-même éloignée à la molette (`data-user-scroll`, posé par `scroll-keeper.js` jusqu'au prochain changement de choix).
Une liste qui défile sans geste de l'utilisateur (molette, pointeur, clavier dans la page) ni rendu de `scroll-keeper.js` est signalée (« défilement sans geste de l'utilisateur », aussi dans la console de la page) ; l'autopilote, qui ramène une ligne dans la vue avant de la cliquer, le déclare comme un geste.
Preuves : `defilement.test.ts` (tics de progression et changement de choix dans le vrai rendu du front-end et des réglages de VPX, aucun `scrollIntoView` ni `scrollTop` posé hors de `scroll-keeper.js`).
Un test vérifie que les scripts injectés se compilent (`packages/core/src/test/layout-check.test.ts`) : une erreur de syntaxe y rendait le garde-fou muet.
La hauteur retenue pour un texte est celle de sa police, dans le bon sens pour une vue pivotée.
**Plancher de 20 px** (design system) : un texte ou une icône plus petits que 20 px à l'échelle d'un petit côté de 1 080 px, tels qu'on les voit, est signalé (« texte plus petit que 20 px ») : le corps de la police est multiplié par l'échelle de chaque `transform` au-dessus du texte, et une animation qui tourne en boucle compte à son pas le plus petit.
Les noms des petits médaillons de la roue, réduits par `scale(--s)`, passaient à 13,6 px sans être signalés : le garde-fou ne mesurait que les icônes, et le test des feuilles ne lisait que les corps en `cqmin`.
Un corps en px fixes ne suit pas l'écran : les feuilles des écrans n'en ont aucun (seule la planche du développeur, `fallback-demo.css`, en garde) ; le bandeau de « Récupérer » en avait quinze, de 12 à 16 px.
Ce que coupe un `clip-path: inset()` (la roue fait entrer ses médaillons par ses bords) ne compte pas comme hors de la fenêtre.
**Zones du front-end** : chaque cadre de l'écran des tables dit sa zone (`data-frame` : « plateau » pour le cadre 9:16 du média, « menu » pour le fronton, la roue, les informations et la barre d'aide) ; deux zones différentes qui se recouvrent sont signalées (« cadres qui se recouvrent »), comme un cadre qui sort de la zone du playfield.
Deux cadres d'une même zone peuvent se recouvrir (la roue mord sur le fronton), et un cadre qui couvre toute la zone est un fond (le média du plateau en borne).
En 4:3, le fronton et la roue couvraient le cadre du plateau sans que rien ne le dise : aucun texte ne s'y chevauchait (voir « L'écran des tables au bureau, de 5:4 à 16:9 et plus »).
Un dernier recours voulu sous le plancher se déclare par `data-below-floor` (commandes de l'encart du chargement au corps le plus petit) ; le lancement en cinéma, qui emporte le médaillon hors de l'écran, est mis à part, comme les replis (`.cp-fb`, `fallback.js`) : médias dessinés à la place d'une image ou d'une vidéo du jeu, leurs textes suivent la taille de leur zone comme ceux d'un média (le repli du chargement dans le cadre 9:16 du bureau).
Preuves : [plancher-textes.test.ts](../../packages/core/src/test/plancher-textes.test.ts) (géométrie de la roue, glissement compris ; aucun corps en px fixes, ni écrit sous 20 px dans les feuilles, unités `--u`, `--w` et `--b` du front-end comprises ; cas témoins dans un vrai Chromium hors écran).
**Calques, textes de la feuille de style, icônes** : un calque opaque n'excuse un recouvrement que s'il cache le texte du dessous en entier ; s'il n'en cache qu'une partie (un bandeau sur le bout d'une étiquette), c'est signalé (« caché en partie »).
Un élément qui laisse passer la souris (`pointer-events: none`) compte comme les autres : le relevé au point tombait dessous.
Un texte écrit par la feuille de style (`content:` d'un `::before` ou d'un `::after`) est signalé : sans nœud de texte, il échappait au relevé comme à la traduction ; le relevé des textes de l'interface lit aussi les feuilles de style (`i18n-scan.ts`, `scanCss`).
Une icône poussée seule au-dessus ou au-dessous de son texte par un retour à la ligne (texte courant, ou ligne flex qui passe à la ligne ; vue pivotée comprise) est signalée (« icône seule sur sa ligne ») ; une ligne du front-end garde son icône devant son texte (`.lib-row-icon + .lib-row-text`).
Preuve : [disposition-ecrans.test.ts](../../packages/core/src/test/disposition-ecrans.test.ts) (cas témoins dans un vrai Chromium hors écran, puis la vraie page de l'éditeur de disposition, dans l'état que rendent `arrange.ts` et `wizard.ts`, sur la borne, le fronton partagé, le poste à deux écrans, le PC de développement et un seul écran en 1366 × 768, 1920 × 1080 et 4K, en français et en anglais).
Les problèmes vont dans la console (« Mise en page : … ») et dans `<captures>\mise-en-page.txt` (« Aucun problème de mise en page. » sinon).

L'écran de l'assistant est construit en flux (`app/renderer/screen.*`) : en-tête, contenu centré dans la place qui reste, pied (message, étape, aide) et bande des flippers, sans position absolue ; un contenu trop haut repousse le pied au lieu de passer dessous.
Le panneau des récapitulatifs, qui ne défile pas, réduit son corps d'un ou deux crans tant qu'il déborde.
La liste des boutons passe sur deux colonnes quand l'écran est plus haut que large.

**Garde-fou du bac à sable** (`packages/core/src/sandbox.ts`, `app/src/sandbox-guard.ts`) : dès que `CYBERPINBALL_HOME` est défini avec `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` ou `CYBERPINBALL_STRESS`, l'application et `sync` refusent toute écriture de fichier hors de `CYBERPINBALL_HOME`, de `CYBERPINBALL_ROOT`, du dossier `tmp\` du projet et du dossier temporaire de Windows ; le chemin fautif est écrit dans la console et l'opération échoue.
Il protège la vraie racine d'un essai qui la viserait par erreur (un chemin d'ini recopié d'un vrai modèle de borne, un paramètre d'installeur ignoré).
Un essai volontaire sur la vraie racine se fait sans `CYBERPINBALL_HOME`.

- **Assistant** : `CYBERPINBALL_AUTOPILOT` rejoue une suite de touches, `CYBERPINBALL_CAPTURE` enregistre une capture de chaque écran après chaque touche.
  Le pseudo-code `SansBoutons` fait comme si personne n'avait touché à rien pendant l'étape « Boutons » (touches actuelles gardées, sans attendre 20 s).
  Chaque touche est enfoncée puis relâchée (le relevé des boutons compte au relâchement) ; `Maintenir3:KeyA` la tient 3 s, `CtrlQ` fait Ctrl+Q.
  Ces touches arrivent directement au traitement des touches ; `Clavier:KeyA` passe, lui, par le chemin d'une vraie touche (`webContents.sendInputEvent` sur l'écran principal, `before-input-event`, Chromium, la page) et signale une touche dont l'appui ou le relâchement n'est pas arrivé ; `Joy3` appuie le bouton 3 d'un joystick virtuel de SDL.
  Chaque relevé laisse une ligne dans la console (« Assistant : relevé game, credit sur Digit5 : gardé », refusé ou passé).

  ```bash
  CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftLeft,Digit1,Digit1,Digit1,Digit1,ShiftRight,Digit1,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/captures npx electron app --assistant
  ```

  Sans opérateur, l'orientation des écrans est simulée (la géométrie change dans `ecrans-simules-orientation.json`, aucun écran ne tourne).
  Le pseudo-code `Attendre16` laisse passer 16 secondes sans touche, pour voir le compte à rebours expirer.
  Proposition, annulation, expiration puis confirmation du retournement :

  ```bash
  CYBERPINBALL_HOME=tmp/flip/home CYBERPINBALL_AUTOPILOT=SansBoutons,Digit1,ShiftRight,Digit1,Escape,Digit1,Escape,ShiftRight,Digit1,Attendre16,ShiftLeft,Digit1,Digit1,Digit1,Escape,Escape,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/flip/captures npx electron app --assistant
  ```

  L'étape « Son » joue vraiment ses bips (brefs : chaque touche arrive 400 ms après la précédente) et écrit dans la console le compte rendu de chaque son (sortie trouvée, canaux ouverts).
  `CYBERPINBALL_AUDIO_OUTPUTS=<fichier.json>` remplace les sorties détectées par une liste au format du champ `audio` de `npm run probe -- --json`, par exemple pour ajouter une carte 7.1 fictive et capturer le test des haut-parleurs (Electron ne la trouve pas : aucun son, message à l'écran).
  Avec quatre écrans, un HDMI fictif du fronton et une carte 7.1 fictive :

  ```bash
  CYBERPINBALL_AUDIO_OUTPUTS=tmp/son/sorties-simulees.json CYBERPINBALL_HOME=tmp/son/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftRight,ShiftRight,ShiftRight,Digit1,Digit1,Digit1,Digit1,Escape,Escape,ShiftLeft,ShiftRight,Escape,Escape,Digit1,ShiftLeft,ShiftRight,Digit1 CYBERPINBALL_CAPTURE=tmp/son/captures npx electron app --assistant
  ```

- **Endurance du lanceur** (critère du jalon 2, **nécessite les écrans du poste** : `CYBERPINBALL_A_L_ECRAN=1`) : `CYBERPINBALL_STRESS="N,S"` lance N fois la table choisie par `CYBERPINBALL_TABLE`, arrête chaque partie après S secondes et vérifie que le front-end reprend le premier plan.
  Le bilan s'affiche et part dans `data\logs\stress-*.json` ; ces parties ne comptent pas dans les statistiques.

  ```bash
  CYBERPINBALL_A_L_ECRAN=1 CYBERPINBALL_STRESS=50,10 CYBERPINBALL_TABLE=1.25 npx electron app
  ```

- **Rotation du front-end** : `CYBERPINBALL_FLIPPERS=bottom|left|top|right` force le bord des flippers sans modifier `cabinet.json` (gauche : 90°, droite : 270°, haut : 180°).
  Avec `--reglages`, l'écran seul ne pivote que si cette variable est posée.
  Étape `drag` de l'autopilote : le cadre de dépôt des fichiers.

  ```bash
  CYBERPINBALL_FLIPPERS=left CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=Digit1,Escape,Escape CYBERPINBALL_CAPTURE=tmp/captures npx electron app
  ```

- **Réglages de VPX** : `CYBERPINBALL_AUTOPILOT` et `CYBERPINBALL_CAPTURE` fonctionnent aussi avec `--reglages`, avec `click:<sélecteur>` (`click:.back` : le bouton de retour).

- **Installeur** : en bac à sable (`CYBERPINBALL_HOME` défini), l'installeur range `root.json` et les raccourcis (`Menu Démarrer`, `Bureau`, `Démarrage`) dans ce dossier et n'écrit rien dans le registre.
  En mode silencieux, `/D=` y est obligatoire (à défaut, seule la racine mémorisée dans ce bac à sable est acceptée) : jamais de repli sur la vraie racine.
  Le désinstalleur relit ce choix dans `installation.ini`.
  Installation, premier lancement (`--user-data-dir` garde aussi les données de Chromium dans `tmp\`), puis désinstallation :

  ```powershell
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"
  Start-Process release\CyberPinball-Setup-complet.exe -ArgumentList '/S', "/D=$PWD\tmp\essai\racine" -Wait
  $env:CYBERPINBALL_AUTOPILOT = 'wait:500'; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  Start-Process tmp\essai\racine\app\CyberPinball.exe -ArgumentList "--user-data-dir=$PWD\tmp\essai\electron" -Wait
  Start-Process 'tmp\essai\racine\app\Désinstaller Cyber Pinball.exe' -ArgumentList '/S'
  ```
