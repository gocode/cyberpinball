[English](../manual/cabinet-health.md) · Français · [Sommaire du manuel](../manuel.md)

## Santé de la borne

Menu système > « Borne » > « Santé de la borne » réunit sur une page ce que d'autres écrans savent déjà, pour voir d'un coup d'œil ce qui empêche de jouer ou mérite un détour.
Chaque ligne a un état — **OK** (coche, vert), **À vérifier** (point d'exclamation, ambre), **Bloquant** (croix, rouge), jamais la couleur seule — et ouvre, à Start ou au clic, l'écran qui répare ; son « Retour » ramène à la page.
Le bilan en tête compte les lignes de chaque état et dit quand le relevé date.

| Contrôle | D'où il vient | États | Ce que la ligne ouvre |
| --- | --- | --- | --- |
| PC et Windows | Le dernier relevé de la [Fiche technique](fiche-technique.md#fiche-technique) (`pcLines`) | À vérifier : un écran sous la fréquence que Windows propose ou qu'il annonce, redémarrage de Windows en attente, mode « Économie d'énergie », pilote graphique de plus de deux ans, moins de 8 Go de mémoire ; OK sinon | Le bloc de la fiche technique qui l'explique |
| Espace disque | Un lecteur par racine, parmi ceux des tables, des téléchargements et des données | Bloquant sous 2 Go libres, ou lecteur des tables qui ne répond plus ; À vérifier sous 10 Go | Téléchargements (faire de la place) |
| Tables | Le médecin de chaque table, sur son script déjà lu (`diagnose`, `playBlockers`) | Bloquant : une ROM demandée manque ; À vérifier : la table a planté, script illisible, la table rame ou saccade sur cette borne, volume de la ROM bas, vidéos du DMD trop grandes, ramenées seules à la taille du DMD avant la prochaine partie (`HEALTH_CHECK_FINDINGS`), ou script jamais lu ; OK : aucune ROM demandée ne manque | Le médecin de la table (cinq lignes au plus, puis « Voir toutes les tables à revoir ») ; Bibliothèque de ROM (lire les scripts) |
| PuP-Packs | Le médecin de chaque table qui a un dossier `pupvideos` (`pupFacts`, `PUP_HEALTH_FINDINGS`) : pack introuvable ou mal rangé, coupé par le script, option absente ou faite pour une autre borne, pack qui cacherait le DMD, journal de VPX qui ne l'a pas vu chargé | À vérifier : une ligne par table, avec la cause, et « réparé de lui-même avant la prochaine partie » quand le front-end s'en charge (`PUP_PLAY_REPAIRS`) ; OK : tous prêts ; rien sans aucun pack | Le médecin de la table, où la réparation se fait en un geste |
| Médias | Le plan de « Trouver les médias manquants » sur l'index de VPinMediaDB déjà gardé, sans réseau | À vérifier : VPinMediaDB a des médias pour des tables reconnues avec certitude, ou n'a jamais été consulté ; OK sinon. Jamais bloquant : les médias sont facultatifs | Médias manquants |
| Écrans | La configuration retenue contre les écrans branchés (`scoreConfiguration`, `chooseConfiguration`) | Bloquant : aucune configuration, aucun de ses écrans branché, ou playfield introuvable ; À vérifier : un écran manque, une autre configuration correspondrait mieux, ou « VPX confond deux écrans » : deux rôles sur deux écrans du même nom, que VPX 10.8.1 ne distingue pas (`homonymousRoles`, il ouvre les deux fenêtres sur le premier ; les vidéos PuP faites pour l'un se cachent derrière l'autre), « recalé à chaque partie » (voir plus bas), ou « pas le playfield » quand le playfield en est | Configuration de la borne |
| Boutons de la borne | Les joysticks branchés, lus par la bibliothèque SDL de VPX, contre le relevé de la borne (`buttonsHealthFacts`) | À vérifier : deux cartes identiques (même GUID SDL) dont viennent des boutons, le lanceur ou l'accéléromètre (voir [Boutons de la borne](boutons-de-la-borne.md#boutons-de-la-borne)) ; OK : les joysticks lus, ou les boutons du clavier sans joystick | Commandes de la borne |
| DMD réel | Les DMD réels reconnus à l'USB, la sonde du PIN2DMD et le serveur du DMD (`hardwareDmdLines`) ; rien sans DMD réel | À vérifier : pilote manquant ou refusé, PIN2DMD qui ne donne pas son nom ou un nom que VPX ne connaît pas (avec le nom lu), serveur du DMD qui ne trouve pas l'afficheur (avec la cause trouvée), pont USB-série qui n'a pas répondu comme un ZeDMD ; OK : « DMD réel prêt » (voir [DMD réel](plugins-de-vpx-backglass-pup-et-dmd.md#plugins-de-vpx--backglass-pup-et-dmd)) | DMD réel |
| LED et retours (DOF) | Les contrôleurs reconnus à l'USB et le dossier que lit le plugin DOF de VPX (`dofLines`) ; rien sans contrôleur ni configuration | À vérifier : un point de l'écran DOF, dont des LED adressables du configtool sans Cabinet.xml (avec le port série probable de leur contrôleur) et la configuration d'un ancien DOF trouvée sur les disques ; OK : « DOF prêt » (voir [LED et retours (DOF)](led-et-retours-dof.md#led-et-retours-dof)) | LED et retours (DOF) |
| Visual Pinball X | La version active, contre celle du manifeste de l'installeur (sans réseau) | Bloquant : VPX absent ; À vérifier : une version plus récente est connue, ou des fichiers de VPX remplacés hors de Cyber Pinball (un autre VPX copié par-dessus), nommés avec leur version (« VPX 10.8.1-5436 : un fichier modifié hors de Cyber Pinball ») | Installer VPX (l'ancienne version reste à côté) ; « Remettre les fichiers d'origine », repris dans l'archive vérifiée de VPX sans toucher au reste du dossier (voir [Installation et organisation des fichiers](installation-et-organisation-des-fichiers.md#installation-et-organisation-des-fichiers)) ; Réglages de VPX si tout va bien |

**Tables qui rament ou saccadent.**
Chaque partie est mesurée (voir « Cadence de chaque partie » dans [Lancement d'une partie](lancement-d-une-partie.md#lancement-dune-partie)) et rangée dans `<données>\logs\cadence-parties.json`.
Le médecin lit la dernière partie jugée de chaque table (`slowTableFinding`, [slowtable.ts](../../packages/core/src/slowtable.ts)) : si elle a ramé, constat « La table rame sur cette borne » ; si elle a seulement saccadé, « La table saccade sur cette borne » (`slowTable`).
Son détail donne les chiffres de cette partie : « À la dernière partie (date), VPX a tenu … images par seconde pour … visées. », le pire moment (pire fenêtre de 10 s) quand il est plus bas, et le nombre d'arrêts de l'image d'au moins un dixième de seconde avec le plus long.
Un autre programme de borne ouvert pendant cette partie (PinUP Popper, PinUP Player, dmdext, serveur B2S) y est rappelé : « PinUP Popper était ouvert pendant la partie : il peut prendre le processeur, le disque ou le DMD réel par moments », avec le conseil de le fermer ou de le retirer du démarrage de Windows (voir [Cohabitation](cohabitation-avec-un-autre-front-end-de-borne.md#cohabitation-avec-un-autre-front-end-de-borne)).
Le constat compte « À vérifier » dans la ligne « Tables » et paraît dans le diagnostic de la table, donc sur sa fiche (« Diagnostiquer et réparer ») ; il disparaît dès qu'une partie tient la cadence, la dernière faisant foi, et le détail le rappelle.
Il n'a pas de correction : la cause (PC, réglages de VPX, PuP-Pack, table) reste à chercher, et le journal de VPX de cette partie, joint à chaque rapport, garde l'heure de chaque à-coup.

**Volume de la ROM bas.**
Un volume de la ROM bas réglé hors de Cyber Pinball (un autre front-end, la porte du monnayeur avant lui) compte « À vérifier » dans la ligne « Tables » (constat `lowRomVolume`), avec « Monter le volume de la ROM » dans le diagnostic de la table ; un volume d'usine bas n'y figure pas, puisqu'il est monté seul avant la partie (voir [Volume de la ROM](son.md#volume-de-la-rom)).

**Rapide à l'ouverture.**
Le relevé tourne en tâche de fond et cède la main dans le front-end entre deux tables : il ne lance jamais VPX, ne télécharge rien, et prend quelques secondes pour 200 tables.
La page s'ouvre aussitôt sur le dernier relevé, gardé d'un lancement à l'autre dans `<données>\cache\sante.json`, puis le refait (« Vérifié il y a 2 min · nouvelle vérification en cours… ») ; le dernier bilan reste affiché tant que le nouveau n'est pas prêt.
Un relevé a aussi lieu 15 secondes après le démarrage, puis toutes les 30 minutes (jamais pendant une partie), et « Vérifier maintenant » le relance.

**Aucune fenêtre au-dessus de VPX.**
Au lancement d'une partie, `closeTopmostWindows` ([frontend.ts](../../app/src/frontend.ts)) ferme toute fenêtre de Cyber Pinball « toujours au premier plan » (seule « Récupérer » l'est) : elle passerait devant les fenêtres où le plugin PUP dessine.
[pupvisible.test.ts](../../packages/core/src/test/pupvisible.test.ts) refuse toute autre fenêtre au premier plan.

**Fenêtres de VPX ramenées sur leur écran.**
VPX 10.8.1 ne reconnaît un écran que par son nom (`Window::GetDisplayConfig`) et prend le premier qui le porte.
Sur le poste de développement « Poste à 3 écrans », le fronton et le DMD sont deux PL2294H : VPX ouvrait « Visual Pinball Backglass » et « Visual Pinball Score View » sur le même écran (`vpinball.log` : « Window #1 » et « Window #2 » « on display PL2294H »), où elles se superposaient, et les vidéos PuP faites pour le DMD se cachaient.
Aucun réglage de `VPinballX.ini` ne l'évite : en fenêtré, `WndX` et `WndY` sont relatifs à l'écran choisi et doivent y tenir.
Pendant la partie, la boucle qui relit la pile des fenêtres toutes les 2 s (`watchOccupied`, [frontend.ts](../../app/src/frontend.ts)) ramène donc chaque fenêtre annexe de VPX sur l'écran de son rôle.
Elle reconnaît la fenêtre à son titre (`VPX_ANCILLARY_WINDOWS` : Backglass, Score View, Topper) et la déplace à la même taille, à la même place dans l'écran, sans l'activer ni changer son rang dans la pile (`moveWindow`, `SetWindowPos` avec `SWP_NOACTIVATE`, `SWP_NOZORDER` et `SWP_ASYNCWINDOWPOS`).
Cela ne se fait qu'avec une version de VPX qui repère les écrans par leur seul nom (format `name` du profil) et pour les rôles dont un autre écran branché porte le même nom (`confusableRoles` : l'écran d'un autre rôle, ou un écran inutilisé du même modèle).
Une fenêtre déjà sur son écran n'est jamais touchée : ce qu'on règle dans le menu de VPX reste.
Ces fenêtres annexes sont écrites fenêtrées à la taille de leur écran, jamais en plein écran (`vpxSettingsFor`, paramètre `confused`) : SDL ne garde qu'une fenêtre plein écran par écran et réduit la précédente quand une autre y passe (`SDL_UpdateFullscreenMode`, `SDL_MinimizeWindow`).
En plein écran sur le même PL2294H, le fronton restait réduit toute la partie, et une fenêtre réduite n'est jamais ramenée : le PuP-Pack ne se voyait plus sur le fronton dès qu'il occupait aussi le DMD (The Matrix, City Hunter).
Une fenêtre annexe de VPX réduite pendant une partie est signalée dans le journal du front-end (« [avertissement] Partie : « Visual Pinball Backglass » est réduite par Windows… », `minimizedVpxWindows`).
Une fenêtre que VPX remet ailleurs plus de trois fois est laissée où il la met, et le journal du front-end le dit.
La fenêtre du playfield, celle du rendu, n'est jamais déplacée : quand le playfield est l'un des rôles confondus, la santé de la borne le dit.
Code pur : `vpxWindowMoves` ([vpxwindows.ts](../../packages/core/src/vpxwindows.ts)), fixé par [vpxplacement.test.ts](../../packages/core/src/test/vpxplacement.test.ts) ; le journal du front-end note chaque fenêtre ramenée (« Partie : « Visual Pinball Score View » ramenée sur l'écran du rôle dmd… »).

**Pastille.**
Un point Bloquant au dernier relevé met la pastille rouge sur « Santé de la borne », sur la rubrique Borne et sur la roue dentée ; le détail de l'entrée dit combien de points sont bloquants ou à vérifier.

Code : les lignes et leurs états dans [packages/core/src/health.ts](../../packages/core/src/health.ts), le relevé, le cache et la page dans `app/src/health.ts`, le rendu dans `app/renderer/library.js` (`renderHealth`).
[health.test.ts](../../packages/core/src/test/health.test.ts) fixe chaque état de chaque contrôle et que **chaque ligne mène à un écran réel** : une entrée du menu système rangée dans l'arbre et fournie par l'application, le médecin d'une table, la liste des tables à revoir ou l'installation de VPX.
