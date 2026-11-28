[English](../manual/cabinet-buttons.md) · Français · [Sommaire du manuel](../manuel.md)

## Boutons de la borne

**Deux jeux de boutons, indépendants.**
Les boutons **du jeu** (flippers, Start, Exit, crédit, lanceur, MagnaSave, Extra Ball, pause, tilt, tremblements, volume) sont ce que VPX reçoit pendant une partie : `cabinet.json` > `buttons`, écrits dans `[Input] Mapping.*`.
Les boutons **de l'interface** (Précédent, Suivant, Valider, Retour et menu ; facultatifs : Aide-mémoire, Réglages de VPX, Bureau Windows, Quitter sans enregistrer) pilotent Cyber Pinball : écran des tables, fiches, réglages de VPX, assistant, avertissements ; `cabinet.json` > `navigation`, que VPX ne lit pas.
Chacun se relève, se récapitule et s'essaie de son côté, par le même écran et les mêmes fonctions (`KeySet` : `GAME_KEYS`, `INTERFACE_KEYS` ; `recordKey`, `keyProblems`, `keysToTry`, `packages/core/src/buttons.ts`) ; touche du clavier ou bouton de joystick, librement d'un bouton à l'autre, et un même bouton physique peut servir aux deux jeux (chaque jeu ne refuse que ses propres doublons).

- **Par défaut**, l'interface est sur les mêmes boutons physiques que flippers, Start et Exit du jeu (`defaultNavigation`).
  Une borne enregistrée avant les boutons de l'interface (pas de `navigation`) garde ainsi sa navigation sur ses boutons de jeu, sans rien à refaire (`navigationButtons`, migration douce).
  Une fois les boutons de l'interface enregistrés, relever le jeu autrement ne les change plus.
- **Touches de secours du clavier**, toujours actives : Tab (Menu système), flèches gauche / haut (précédent), droite / bas (suivant), Entrée (valider), Échap (retour).
  Un bouton de l'interface ne peut pas prendre la touche de secours d'un autre rôle (« Entrée reste la touche de secours « Valider » », `refusedNavigationKey`).
  H et F1 (aide-mémoire) et R (réglages de VPX) restent actives tant qu'aucun bouton de la borne, du jeu ou de l'interface, ne les envoie (`interfaceKeys`, `withoutButtonKeys`).
- **Toute l'interface lit ses propres boutons** : front-end (`interfaceKeys`), réglages de VPX, avertissement « autre menu ouvert », assistant (`navigationKeys`), toujours avec la borne entière (`ButtonsSource`), jamais les seuls boutons du jeu (test d'invariant dans `buttons.test.ts`).
  L'aide-mémoire « Pendant une partie » et le réglage de l'affichage en partie restent ceux du jeu (`gameKeys`, `displayKeys`).
- **Relevé incohérent** des boutons de l'interface (`navigationProblems`) : l'interface revient sur les flippers, Start et Exit du jeu, et le front-end propose au démarrage de refaire l'étape (« Boutons de l'interface à refaire », Start : `--interface`).

Première étape de l'assistant, puisque tout le reste se pilote aux boutons : l'écran demande « Appuyez sur le bouton » flipper gauche, flipper droit, Start, Exit, crédit, lanceur, puis les boutons facultatifs (MagnaSave gauche et droit, Extra Ball, Pause, balancier de tilt, slam tilt, tremblements à gauche, à droite et vers l'avant, volume − et +, muet), qu'Exit passe.
La même question s'affiche sur tous les écrans (droite pour le joueur sur l'ancien playfield), au-dessus de la liste de tous les boutons : ceux déjà relevés avec leur touche, celui en cours, ceux à venir, pour choisir à l'avance quel bouton de la borne tiendra quel rôle.
Une touche déjà relevée pour un autre bouton du même jeu **passe au nouveau** : l'ancien est vidé, et l'écran le dit (« Maj gauche était le bouton Flipper gauche : Flipper gauche est à relever de nouveau », ou « … n'a plus de touche » pour un bouton facultatif, `recordKey` → `taken`, `takenNotice`), puis la ligne de l'ancien, en orange, dit quel bouton a repris sa touche jusqu'à ce qu'il soit relevé de nouveau (« reprise par Start »).
Un bouton obligatoire ainsi vidé est redemandé avant le récapitulatif, un facultatif reste sans bouton à l'enregistrement.
Jusqu'à la 0.1.11-essai.43, elle était refusée : une borne dont tous les boutons étaient pris ne pouvait plus en échanger deux.
La touche Windows et les touches que VPX ne sait pas lire restent refusées ; un bouton compte quand on le relâche, une seule fois, et une touche maintenue 3 s ouvre « Quitter sans enregistrer ? » au lieu d'être relevée.
Un bouton qui envoie AltGr (Alt droit d'un clavier européen) est relevé une seule fois, comme Alt droit : Windows le fait précéder d'un Ctrl gauche, que le relevé ignore quand Alt droit le suit dans les 50 ms (`altGrPhantomControl`) ; un Ctrl gauche seul, comme le MagnaSave d'une carte en mode clavier, se relève normalement.
Chaque relevé est écrit au journal (`<données>\logs\journal.txt`), bouton par bouton (« Assistant : relevé game, … sur … : gardé », ou passé, refusé et pourquoi, passé à la souris), puis les touches validées à la fin du relevé (« Assistant : touches validées (game) : … ») : le journal joint à un rapport suffit pour voir ce qu'un joueur a obtenu.

**Assistant complet** : les boutons de l'interface d'abord, puisqu'ils pilotent le front-end et toute la suite de l'assistant (Précédent, Suivant, Valider, Retour et menu, puis Aide-mémoire, Réglages de VPX, Bureau Windows et Quitter sans enregistrer, que Retour passe), puis ceux du jeu.
Sur une borne neuve, ceux du jeu sont proposés sur les mêmes boutons (flippers sur Précédent et Suivant, Start sur Valider, Exit sur Retour ; les autres sur les touches des encodeurs, `gameFromNavigation`) : Valider les garde sans essai ; un bouton se refait seul, ou « Tout modifier » les demande un par un.
Un bouton du jeu dont la touche des encodeurs a ainsi été prise par un flipper, Start ou Exit reste sans touche, et sa ligne dit, en orange, lequel l'a reprise (« reprise par Flipper gauche », `gameKeysTakenByNavigation`).
Les boutons facultatifs de l'interface (Aide-mémoire, Réglages de VPX, Bureau Windows, Quitter sans enregistrer) ne retirent rien au jeu : un MagnaSave choisi pour l'aide-mémoire garde sa touche aux boutons du jeu et reste le MagnaSave en partie, sur une carte en mode clavier comme la CSD PinOne (MagnaSave sur Ctrl) comme ailleurs.
Sur une borne déjà configurée, chaque étape s'ouvre sur ses touches actuelles.
La frise en haut de chaque écran porte le nom de l'étape et le bouton en cours (« Boutons de l'interface · Bouton 2 sur 4 », voir [Assistant et menu de configuration](assistant-et-menu-de-configuration.md#assistant-et-menu-de-configuration)) ; « ◀ Précédent » (ou Retour arrière) au récapitulatif, ou au premier bouton d'un relevé, revient à l'étape d'avant : du jeu à l'interface, de l'interface au premier écran ; grisé avec « Première étape » quand il n'y a rien avant.
Avant le 16/11/2026, l'assistant relevait le jeu puis l'interface, et Précédent tournait en rond dans l'interface.
Au récapitulatif de l'interface, Précédent, Suivant, Valider et Retour dont la touche a changé doivent avoir été pressés avant Valider ; au récapitulatif du jeu, les flippers, Start et Exit.
Les touches de l'interface en vigueur, les flèches et Entrée choisissent et lancent aussi aux deux récapitulatifs, sans compter comme essai.
Sans réponse à la première étape (20 s), les deux jeux gardent leurs touches et l'assistant passe aux écrans.

Une borne neuve (pas encore de touches enregistrées) s'ouvre sur « Vos boutons sont-ils déjà les bons ? » : la liste des boutons de l'interface en vigueur, ceux des encodeurs (Précédent : Maj gauche, Suivant : Maj droite, Valider : 1, Retour et menu : Échap), « Garder ces touches » choisi d'office et « Modifier mes boutons ».
Sur cet écran, les appuis choisissent et rien n'est relevé : comme dans tout menu, les flippers et les flèches passent d'un choix à l'autre sans jamais changer d'écran, Start ou Entrée valident le choix sélectionné.
« Garder ces touches » propose ensuite les boutons du jeu sur ces mêmes boutons, à valider ; « Modifier mes boutons », Exit (Échap) ou un clic sur une ligne ouvrent le relevé bouton par bouton.
Un compte à rebours, barre et phrase, dit toujours ce qui se passera à la fin.
Avant la 0.1.13, l'assistant ouvrait directement le relevé, qui aurait pris Entrée pour un bouton : un testeur ne trouvait pas comment continuer avec des touches déjà bonnes.
Dans le relevé, chaque bouton à venir montre en retrait la touche en vigueur, celle des encodeurs.
Sur une borne déjà configurée, et toujours pour l'étape seule, l'étape s'ouvre directement sur le récapitulatif : chaque bouton avec sa touche actuelle, sans rien à refaire.
Un bouton se change seul : clic sur sa ligne, ou flippers jusqu'à sa ligne (après les actions) puis Start ; on appuie sur le nouveau bouton et l'on revient au récapitulatif, les autres touches gardées (Retour arrière annule).
« Tout modifier » repart du relevé complet.

Sous la question, quatre consignes disent chaque geste en clair, avec le bouton de la borne et le bouton de l'écran qui le font (`captureGuide`) : **Passer** (« pas ce bouton sur la borne : Exit (…) ou « Passer ce bouton » », « pas de bouton pour ce rôle : Retour (…) ou « Passer ce bouton » » pour l'interface, « impossible, bouton obligatoire : appuyez dessus sur la borne »), **Revenir** (« Retour arrière ou « ◀ Précédent » : bouton précédent », ou l'étape précédente, ou annuler en refaisant un seul bouton), **Finir** (« Terminer le relevé » dès les boutons obligatoires relevés, puis « Valider ») et **Corriger** (clic sur un bouton de la liste).
Au récapitulatif, elles deviennent **Choisir** (flippers ou flèches, puis Start ou Entrée ; ou un clic), **Revenir** (étape précédente), **Finir** (presser sur la borne les boutons marqués ○, puis « Valider ») et **Corriger** (un bouton de la liste pour le refaire, ou « Tout modifier »).

Une erreur se corrige sans les boutons de la borne, puisqu'ils sont justement en train d'être relevés : clic sur une ligne de la liste (ce bouton est redemandé, puis l'étape reprend au premier bouton sans réponse), Retour arrière ou « ◀ Précédent » (le bouton d'avant ; Retour arrière ne peut donc pas être relevé comme bouton), et les actions sous la liste, toujours affichées et cliquables (le pointeur apparaît quand on bouge la souris) : « ◀ Précédent », « Passer ce bouton », « Terminer le relevé », « Touches par défaut des encodeurs » (« Touches par défaut » pour l'interface) et « Tout modifier ».
« Passer ce bouton » fait ce que fait Exit sur un bouton facultatif : il reste sans touche ; sur un bouton obligatoire, il est grisé (« Bouton obligatoire »).
« Terminer le relevé » est grisé tant qu'un bouton obligatoire manque (« Après les boutons obligatoires ») ; ensuite, chaque bouton restant garde la touche affichée en retrait dans la liste (celle en vigueur), sauf si un bouton relevé l'a prise, et le récapitulatif s'ouvre (« Relevé : boutons restants avec leur touche actuelle »), où l'on valide.
En refaisant un seul bouton, « Terminer le relevé » revient au récapitulatif sans rien changer.

Le récapitulatif est aussi un essai : les flippers choisissent l'action (Valider, Précédent, Touches par défaut des encodeurs, Tout modifier) ou un bouton à refaire, Start lance ce choix.
Un flipper, Start ou Exit dont la touche vient d'être relevée (différente de celle en vigueur) doit avoir été pressé au moins une fois avant que Valider soit accepté (coche dans la liste ; sous Valider, « Faire : Flipper gauche ○ · … » tant qu'il en reste) : un relevé faux ne peut donc pas être enregistré sans que le joueur s'en aperçoive.
Les touches gardées et les touches par défaut des encodeurs, connues, n'ont pas à être essayées : « Touches par défaut des encodeurs » puis « Enregistrer » enregistre aussitôt.
Les flèches et Entrée d'un clavier choisissent et lancent aussi, sans compter comme essai.
Tant qu'un bouton reste à essayer (ou qu'un bouton obligatoire manque), « Valider » est grisé dès l'arrivée, sa raison dessous, seule liste des boutons encore à presser (« Faire : Start ○ · Exit ○ ») ; chaque appui coche ✓ dans la liste, et Valider s'allume.
Valider passe aux écrans (ou enregistre, étape seule).
Dans l'assistant complet, si personne n'appuie sur rien pendant 20 secondes, les touches actuelles sont gardées (celles des encodeurs sur une borne neuve) : une borne sans opérateur passe ainsi aux écrans comme avant.

Seules : menu système (Exit) > « Ma borne » > « Configuration de la borne » > « Boutons » > « Boutons du jeu » (`npm run assistant -- --boutons`, action `boutons` du lanceur, ou l'action « Affecter les boutons de la borne » d'une touche dans les réglages de VPX) ou « Boutons de l'interface » (`npm run assistant -- --interface`).
Le reste du modèle est gardé : l'étape du jeu ne reprend en main que les clés `[Input]`, celle de l'interface n'écrit rien dans `VPinballX.ini` (« VPinballX.ini inchangé : VPX ne lit pas les boutons de l'interface. »).
Dans l'étape du jeu, « Touches par défaut des encodeurs » remet celles des encodeurs ; dans celle de l'interface, « Touches par défaut » remet les flippers, Start et Exit du jeu en vigueur.

**Accès à la configuration sans les boutons** : un relevé faux (par exemple Exit sur un bouton qu'on ne retrouve plus) ne doit jamais fermer l'accès aux réglages.
Depuis l'écran des tables et ses messages, une roue dentée discrète en haut à droite (⚙, cliquable par-dessus tout, plus visible quand on bouge la souris) et la touche Tab d'un clavier ouvrent le menu système et ses rubriques (Tables, Médias, Borne, Cyber Pinball) : ajouter une table, réglages de VPX, configuration de la borne (boutons, lanceur, tilt, écrans, playfield, disposition, son, assistant complet, configurations, touches par défaut des encodeurs), bibliothèque de ROM, quitter.
Dans ces menus, Tab et Maj+Tab déplacent le curseur quels que soient les boutons relevés, et chaque ligne se clique.
Tab et Retour arrière sont réservés : l'étape « Boutons » les refuse, et un relevé qui en contiendrait est traité comme incohérent (touches par défaut).

**Touches par défaut des encodeurs** (Maj gauche / droite, 1, Échap, 5, Entrée…), le recours quand un relevé enregistré ne pilote plus une borne aux boutons de clavier : menu système > « Ma borne » > « Configuration de la borne » > « Boutons » > « Touches par défaut des encodeurs », la dernière ligne (à la souris : clic sur « Exit : Menu système » au pied de l'écran, puis sur les lignes), « Remettre les touches par défaut des encodeurs » dans le détail d'une touche des réglages de VPX (Avancé > Input), et sans aucun bouton l'action `boutons-defaut` du lanceur (`node app/dist/sync-cli.js --boutons-par-defaut`).
`cabinet.json` reprend les touches par défaut, pour les deux jeux (l'interface sur les flippers, Start et Exit des encodeurs), et `[Input]` est réécrit : les actions de VPX qui avaient perdu leur touche la retrouvent (`withDefaultButtons`, `app/src/buttons-reset.ts`).

- **Jamais d'une seule pression** : la ligne (détail « Pour une borne aux boutons de clavier ; demande confirmation ») ouvre « Remplacer les boutons par les touches par défaut ? », qui dit ce qui va changer, « Annuler » présélectionné ; « Remplacer » se choisit exprès (`resetConsequences`).
  Dans les réglages de VPX, la même question précède la remise.
- **Refusée sur une borne aux boutons de joystick** (Pinscape, encodeur en mode manette) : des touches de clavier ne peuvent pas remplacer ces boutons, et plus aucun ne répondrait (`defaultButtonsRefusal`, [packages/core/src/buttons-backup.ts](../../packages/core/src/buttons-backup.ts)).
  La ligne reste visible, grisée (« Indisponible : les boutons de cette borne sont des boutons de joystick ») ; l'écran qu'elle ouvre dit pourquoi, avec le nombre de boutons de joystick, et propose « Retour » ou « Boutons du jeu » (dans les réglages de VPX : « Affecter les boutons de la borne »).
  Seule l'action `boutons-defaut` du lanceur, dernier recours sans aucun bouton, passe outre.
- **Le relevé remplacé est toujours gardé** (`boutons-precedents.json` dans le dossier des données, avec les réglages `[Input]` laissés à la main) : « Rétablir les boutons d'avant » apparaît alors dans « Configuration de la borne » (« Relevé remplacé le … par les touches par défaut des encodeurs ») et le remet, `[Input]` compris (« Boutons d'avant rétablis », `restoreButtons`).
  Seule la dernière remise est gardée, pour la configuration de la borne dont c'est le relevé ; une fois rétabli, la ligne disparaît.
- **Au journal** : chaque remise, avec qui l'a demandée (« Boutons : touches par défaut des encodeurs remises (Menu système) ; relevé remplacé gardé (… bouton(s) de joystick, …) »), et chaque rétablissement (« Boutons : relevé d'avant la remise du … rétabli »).

**Relevé incohérent** (bouton obligatoire sans touche, même touche pour deux boutons, touche refusée, par exemple après une modification de `cabinet.json` à la main) : `buttonProblems` le détecte, toute l'interface revient aux touches par défaut (`buttonKeys`), la synchronisation n'écrit plus `[Input]` et le signale, et le front-end propose au démarrage de refaire l'étape « Boutons ».

Les touches sont rangées dans `cabinet.json` (`buttons` pour le jeu, `navigation` pour l'interface, codes `KeyboardEvent.code` : `ShiftLeft`, `Digit1`… ou jetons de joystick) : l'interface lit `navigation` (ou, sans elle, les flippers, Start et Exit de `buttons`) dans l'assistant, le front-end, la fiche, la gestion des tables et les réglages de VPX (`navigationKeys`, `interfaceKeys`, `packages/core/src/buttons.ts`) ; l'aide-mémoire de la partie (`gameKeys`) et `[Input]` lisent `buttons`.
Un modèle sans `buttons` garde les touches par défaut et ne touche pas à `[Input]`.

**Ce que VPX attend** (relevé dans `src/input/InputManager.cpp` et `InputAction.cpp` au commit `af26b2d93` de 10.8.1-5436) : VPX n'enregistre plus de codes DirectInput (`LFlipKey`, `JoyLFlipKey`… n'existent plus).
Chaque action a sa clé `[Input] Mapping.<action>`, une liste d'alternatives séparées par ` | `, chacune une combinaison séparée par ` & ` ; une touche du clavier s'écrit `Key;<scancode SDL>` (usage HID : A = 4, 1 = 30, Entrée = 40, Shift gauche = 225), un bouton de manette `SDLJoy_<GUID SDL>_<n>;<bouton>`.
Une valeur vide vaut la touche par défaut de VPX.
Cyber Pinball traduit `KeyboardEvent.code` en scancode SDL (`SDL_SCANCODES`) et écrit :

| Bouton | Clés `[Input]` (défaut de VPX) |
| --- | --- |
| Flipper gauche / droit | `Mapping.LeftFlipper`, `LeftStagedFlipper`, `UILeft` (`Key;225`) / `RightFlipper`, `RightStagedFlipper`, `UIRight` (`Key;229`) |
| Start, Exit | `Mapping.Start` (`Key;30`), `Mapping.ExitGame` (`Key;41`) |
| Crédit, lanceur | `Mapping.Credit1` (`Key;34`), `Mapping.LaunchBall` (`Key;40`) |
| MagnaSave gauche / droit | `Mapping.LeftMagna`, `UIUp` (`Key;224`) / `RightMagna`, `UIDown` (`Key;228`) |
| Extra Ball, Pause, balancier de tilt | `Mapping.ExtraBall` (`Key;5`), `Mapping.Pause` (`Key;19`), `Mapping.Tilt` (`Key;23`) |
| Slam tilt (porte du monnayeur) | `Mapping.SlamTilt` (`Key;74`) |
| Porte du monnayeur, porte : bouton − / + | `Mapping.CoinDoor` (`Key;77`), `Mapping.Service2` (`Key;37`) / `Mapping.Service3` (`Key;38`) ; voir [Volume du jeu](son.md#volume-du-jeu) |
| Tremblements | `Mapping.LeftNudge` (`Key;29`), `RightNudge` (`Key;56`), `CenterNudge` (`Key;44`) |
| Volume − / + / Muet | aucune : `Mapping.VolumeDown` et `Mapping.VolumeUp` reçoivent `Key;0`, avec ou sans étape « Boutons » ; Cyber Pinball lit ces boutons lui-même (voir [Volume de la borne](son.md#volume-de-la-borne)) |

- Un bouton facultatif passé garde la touche par défaut de VPX.
- **Pause** : l'action `Pause` de VPX arrête la partie, et un nouvel appui la reprend (`SetPlayState(!IsPlaying())`, `InputManager.cpp`).
  Jusqu'à la 0.1.3-essai.6, aucun bouton de la borne n'y menait : seule la touche P d'un clavier branché mettait en pause.
  Un relevé fait avant ce bouton ne l'a pas : P reste la touche de la pause, sauf si un autre bouton l'a prise ; refaire « Boutons du jeu » pour la donner à un bouton de la borne.
- Seules les touches seules du clavier sont remplacées : un bouton de manette ou une combinaison ajoutés dans le menu de VPX (F12, « Input Settings ») restent à côté.
- Une autre action de VPX dont la touche par défaut est celle d'un bouton la perd (`Key;0`, aucune touche : une valeur vide la lui rendrait) : sinon, un bouton Extra Ball sur D ouvrirait aussi le débogueur.
  Les doublons voulus par VPX restent (Service 7 garde `-`, la touche par défaut de Volume −).
  L'action retrouve sa touche quand le conflit disparaît.
  Le récapitulatif et les constats de la synchronisation les nomment.
- Ces clés sont gérées comme les autres : une touche changée à la main dans VPX est signalée au démarrage, gardée ou remise au choix (`[Input] Mapping.LeftFlipper = Key;4 au lieu de Key;225`).
  Les réglages de VPX les montrent dans l'onglet Avancé, section Input, avec le nom de l'action et de la touche.
- Les scripts des tables ne voient pas la différence : `LeftFlipperKey`, `StartGameKey`… valent l'identifiant de l'action, pas la touche (`ScriptGlobalTable.cpp`).
  VPX envoie en plus au script le code DirectInput de chaque touche pressée, qu'une vieille table peut tester directement.

**Boutons de joystick (Pinscape sur KL25Z, VirtuaPin, encodeur en mode manette)** : un contrôleur Pinscape envoie par défaut ses boutons comme ceux d'un joystick USB, pas comme des touches du clavier.
Cyber Pinball les lit avec la bibliothèque SDL 3 de VPX lui-même (`SDL364.dll` à côté de `VPinballX64.exe`), chargée par koffi et initialisée comme VPX l'initialise (`SDL_INIT_JOYSTICK | SDL_INIT_GAMEPAD`, aucune indication ; `src/input/SDLInputHandler.h` au commit `af26b2d93`) : mêmes GUID, même ordre des joysticks, même numérotation des boutons.
VPX désigne un joystick par `SDLJoy_<GUID SDL>_<rang>`, le rang distinguant deux joysticks de même GUID (`joystickDeviceIds`), et un bouton par son numéro SDL, à partir de 0.
Lecture par sondage, 100 fois par seconde, dans le processus principal (`packages/win-displays/src/joystick.ts`, `app/src/joystick-input.ts`), sans file d'événements de SDL ni pompe de messages qui détournerait celle d'Electron.

- **Toute l'interface** : chaque appui arrive à la fenêtre de Cyber Pinball qui a le focus comme une touche, dont le code (`KeyboardEvent.code`) est le jeton de VPX du bouton (`SDLJoy_…_1;3`).
  L'étape « Boutons » le relève comme une touche (« Bouton 4 du joystick », numéroté à partir de 1 comme dans les « Contrôleurs de jeu » de Windows et l'outil de configuration du Pinscape), le reprend à l'autre bouton qui l'avait, et le front-end, la fiche, les réglages de VPX, l'avertissement « autre menu ouvert » et la fenêtre « Récupérer » (Exit) le suivent.
  Un bouton tenu se répète comme une touche (500 ms, puis 30 fois par seconde) : un flipper tenu fait défiler le front-end.
  Pendant une partie, aucune fenêtre de Cyber Pinball n'a le focus : les appuis ne vont nulle part.
  Pendant le relevé, une ligne dit ce qui est lu : « Joystick lu : mjrnet Pinscape Controller », « Aucun joystick branché », ou « Joysticks lus une fois VPX installé ».
- **Clavier et joystick mélangés** : touches du clavier et boutons du joystick se relèvent par le même chemin (`recordButton`), librement d'un bouton à l'autre : flippers au Pinscape, Start et crédit sur l'encodeur en mode clavier, par exemple.
  Windows envoie les touches du clavier à la fenêtre au premier plan, alors que Cyber Pinball remet les boutons du joystick à la fenêtre active pour Electron ; une fenêtre peut être active sans être au premier plan (processus relancé auquel Windows refuse le premier plan) : sur la vraie borne (0.1.3-essai.1), les boutons du joystick se relevaient, plus les touches du clavier.
  Chaque appui d'un bouton du joystick vérifie donc que le premier plan est à Cyber Pinball et le reprend sinon (`keyboardFollows`, `app/src/foreground.ts`), avec un avertissement dans la console (« Clavier : le premier plan de Windows était à … ») et, à l'étape « Boutons », la mention « clavier repris à « fenêtre » (processus) » (ou « clavier retenu par … » si Windows refuse) après la ligne des joysticks ; l'assistant le prend en s'ouvrant.
  Le focus qui passe d'un écran de l'assistant à l'autre ne fait plus oublier une touche enfoncée.
- **Relâchement des touches du clavier** : le relevé compte un bouton à son relâchement, et le mode invité suit les boutons tenus.
  Or annuler l'appui d'une touche dans `before-input-event` fait aussi jeter son relâchement par Chromium (`RenderWidgetHostImpl`, `suppress_events_until_keydown_`) : sans parade, aucune touche du clavier ne se relevait (le relâchement n'arrivait jamais, et la touche « tenue » ouvrait « Quitter sans enregistrer ? » au bout de 3 s), alors que les boutons du joystick, remis sans passer par Chromium, se relevaient ; le mode invité tenait pour enfoncée une touche relâchée.
  Les fenêtres qui lisent les relâchements (assistant, front-end) passent donc par `onKeyInput` (`app/src/key-input.ts`) : l'appui traité n'y est pas annulé, c'est la page qui l'annule (`app/src/preload.ts`, en phase de capture, après avoir demandé au processus principal s'il l'a traité), et le relâchement arrive.
  [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) refuse un `before-input-event` qui lirait lui-même les relâchements ; [clavier-reel.test.ts](../../packages/core/src/test/clavier-reel.test.ts) relève, hors écran, chaque bouton du jeu et de l'interface par de vraies touches (`sendInputEvent`), ainsi qu'au joystick virtuel de SDL, et vérifie ce qui est enregistré.
- **`[Input]`** : chaque action du bouton reçoit le jeton du joystick en tête, et garde la touche du clavier de VPX à côté (`SDLJoy_…_1;0 | Key;225`), sauf si un autre bouton de la borne l'a prise.
  Un nouveau relevé retire les boutons de joystick écrits la fois précédente et garde ceux ajoutés dans F12 > « Input Settings » (`withButtonMapping`).
  Les deux MagnaSave du joystick ouvrent les réglages en partie : Cyber Pinball les lit lui-même (`watchJoystickButtons`), et `Mapping.InGameUI` ne garde que F12.
- **Contrôle après chaque partie** : VPX écrit dans `vpinball.log` les joysticks qu'il voit (« Joystick connected: mjrnet Pinscape Controller #1 (… VPX UID: SDLJoy_…_1) »).
  Si VPX a vu des joysticks mais pas celui des boutons relevés (`joysticksUnseenByVpx`), c'est que Cyber Pinball et VPX ne le nomment pas pareil : le front-end le dit (« Boutons du joystick introuvables dans VPX ») et Start rouvre l'étape « Boutons ».
- **Croix** (chapeaux de SDL : la croix d'une manette en mode XInput, comme un I-PAC, un Pinscape Pico ou une carte à Raspberry Pico réglés en manette, ou les entrées « POV » d'un encodeur) : VPX en fait quatre boutons par croix, numérotés `0x100 + 4 × croix + direction` (gauche, droite, haut, bas ; `SDL_EVENT_JOYSTICK_HAT_MOTION` dans `SDLInputHandler.h` au commit `af26b2d93`).
  Cyber Pinball les lit de même à chaque sondage (`hatChanges`, `packages/core/src/buttons.ts`) : une direction se relève comme un bouton (« Croix ↑ du joystick », `SDLJoy_…_1;258`), une diagonale en tient deux, et `[Input]` la reçoit telle que VPX la lit.
  Avant, une croix ne se relevait pas.
  Tests : [joystick-croix.test.ts](../../packages/core/src/test/joystick-croix.test.ts) (joystick virtuel de SDL à une croix) et [clavier-reel.test.ts](../../packages/core/src/test/clavier-reel.test.ts) (lanceur relevé à la croix, autopilote « JoyCroix:up »).
- **Cartes identiques** (deux Zero Delay, deux I-PAC en mode manette, deux Pinscape) : même GUID SDL, que VPX ne distingue que par leur rang, l'ordre où SDL les voit.
  Ce rang peut s'inverser après un débranchement ou un redémarrage, et les boutons relevés passent alors à l'autre carte (VPX le reconnaît dans `OnJoystickAdded`).
  L'étape « Boutons » le dit à côté des joysticks lus (« 2 cartes identiques (…) : VPX les distingue par leur ordre de branchement, qui peut s'inverser… »), et la Santé de la borne, contrôle « Boutons de la borne », le signale quand des boutons, le lanceur ou l'accéléromètre en viennent (`twinJoysticks`, `twinJoysticksInUse`).
  Remède : un identifiant USB différent sur chaque carte quand son outil le permet, sinon tous les boutons sur une seule.
- **Hors du relevé** : le lanceur analogique et l'accéléromètre du Pinscape sont des axes, affectés à l'étape « Lanceur » (voir [Lanceur analogique et accéléromètre](lanceur-analogique-et-accelerometre.md#lanceur-analogique-et-accéléromètre)).
  Les chapeaux et les axes affectés à une action dans VPX restent à côté des boutons, comme une manette.
- **Jeux qui ne lisent que le clavier** (Pinball FX, Pinball FX3, Future Pinball) : ils ignorent un joystick DirectInput.
  Pendant leur partie, Cyber Pinball rend chaque bouton de joystick relevé ici sous la touche que le jeu attend pour son rôle : celles de l'écran Contrôles des jeux de Zen, celles des préférences de Future Pinball (voir [Tables de Pinball FX](tables-de-pinball-fx.md) et [Tables de Future Pinball](tables-de-future-pinball.md)).
  Les touches ne partent que vers le jeu au premier plan, jamais en double vers le front-end, et celles encore tenues sont relâchées à la fin ; les boutons d'un encodeur clavier arrivent au jeu tels quels.
  Dans Pinball FX3, les flippers envoient aussi la flèche de leur côté, qui parcourt ses menus, au joystick comme au clavier.
- **Sans VPX installé**, ou si la bibliothèque SDL manque, les joysticks ne sont pas lus (l'étape le dit) : le clavier, les touches par défaut des encodeurs et la souris restent.
  **Au premier lancement**, l'assistant installe donc VPX lui-même dès son ouverture, en arrière-plan et sans rien demander (`wizardInstallsVpx`, [packages/core/src/first-run.ts](../../packages/core/src/first-run.ts)) : pour l'assistant complet et les étapes qui lisent un joystick (boutons, interface, lanceur, tilt), quand VPX manque à une installation, jamais pendant un essai sans opérateur (sauf `CYBERPINBALL_VPX_ASSISTANT=1`).
  La progression s'affiche sous chaque écran, et le premier écran des boutons ajoute que les joysticks seront lus à la fin et que le clavier marche tout de suite.
  Le délai de 20 s de ce premier écran court même pendant l'installation : jusqu'en 0.1.12 il l'attendait, et un téléchargement bloqué (antivirus, connexion lente) figeait l'écran sans explication.
  Les joysticks se relisent aussitôt VPX installé (`retryJoysticks`) ; tant qu'aucun bouton de la borne n'est un bouton de joystick, l'un de leurs boutons ramène au relevé depuis le premier écran, les écrans, la disposition, le son ou le récapitulatif, ce que dit l'avis de chacune (`joystickReturnsToButtons`, assistant complet seulement) : une borne à Pinscape seul, qui n'a rien pu presser pendant l'installation, relève ainsi ses boutons ; un assistant fini avant l'installation attend sa fin pour ouvrir le front-end (`menuWaitsForVpx`).
  Un échec (pas de connexion) n'arrête rien : l'étape le dit, le clavier reste, et le front-end repropose l'installation.
  Si la bibliothèque ne se charge pas faute du runtime Visual C++ (que l'installeur pose d'habitude), l'étape le dit aussi ; une fois VPX ou le runtime installés depuis le front-end, un joystick lu pour la première fois alors qu'aucun bouton du jeu n'en vient fait proposer « Boutons du jeu » (`joystickButtonsUnrecorded`).
  Avant la 0.1.11-essai.27, l'assistant passait avant VPX : une borne qui n'avait que des boutons de joystick ne pouvait ni relever ses boutons ni son lanceur au premier lancement.
  Tests : [first-run.test.ts](../../packages/core/src/test/first-run.test.ts).

**Boutons avancés** (étape « Boutons » de l'assistant et des réglages des boutons de la borne).
Une section repliée, en bas de la liste, te laisse affecter Crédit 2, 3 et 4 (autres monnayeurs), Fire (la barre de verrouillage), Afficher les règles, le Mode debug (statistiques d'affichage de VPX) et le Mode nuit.
Tous sont facultatifs et vides par défaut ; l'assistant ne te les demande pas un par un.
Crédit 1 est facultatif lui aussi : une borne n'a besoin que d'un monnayeur, Crédit 1 ou l'un des Crédits 2 à 4.
Sans touche, Crédit 1 n'est plus actif dans VPX, et le menu de VPX en partie, l'aide et « Annuler les changements » suivent le premier monnayeur relevé.
Le bouton Mode nuit bascule le mode d'un appui, au front-end comme en partie (voir [Son](son.md)).
Les gâchettes analogiques des manettes se relèvent comme boutons de l'interface et du jeu, avec leur axe et leur sens reconnus par SDL et transmis à VPX ; les capteurs analogiques des pincabs ne deviennent pas des boutons.

**Annuler la dernière touche.**
Au récapitulatif et pendant le relevé, « Annuler la dernière touche » défait, aux flippers comme à la souris, chaque touche relevée, passée ou remise par défaut, une à une.
La touche prise à un autre bouton lui est rendue, et l'écran dit ce qui a été défait, sans quitter l'étape.
Les icônes des deux jeux de boutons sont à leur place : la manette pour « Boutons du jeu », le bouton d'arcade pour « Boutons de l'interface ».
L'écran du relevé du Bureau Windows dit que le même bouton de joystick ramène Cyber Pinball, et qu'au clavier il faut Ctrl+Maj+D ou la barre des tâches.
Quand tu ouvres l'assistant depuis le menu, l'écran dit tout de suite « Ouverture de l'assistant… ».
Sur un seul écran, l'assistant va jusqu'au choix du DMD incrusté dans le playfield, même sans écran pour le backglass.

**Boutons pendant une partie.**
Un bouton lié à Extra Ball (ou la touche F12) n'arrête plus la partie : il ouvrait l'aide de débogage des tables à ROM de core.vbs (« Click YES to Add a ball to the Trough… »), que Cyber Pinball prenait pour une erreur fatale.
Elle est maintenant fermée par Annuler, sans effet sur la table, et une ligne du journal explique ce qui s'est passé ; les autres questions des tables restent fatales, et Cyber Pinball ne répond jamais Oui ni Non à ta place.
Pendant une partie, les boutons du joystick ne vont plus au front-end : il ne reprend plus le premier plan à VPX.
Dans le menu de VPX en partie, les boutons suivent la navigation de Cyber Pinball : les flippers changent de ligne (gauche : précédente, droit : suivante), les MagnaSave règlent, valident ou annulent (gauche : diminuer ou annuler, droit : augmenter ou valider).
Sur une borne sans MagnaSave, les flippers gardent le réglage, VPX n'ayant alors aucun autre bouton pour augmenter ou valider.
Le rappel du réglage de l'affichage en partie (« Changer de ligne », « Régler, valider ou annuler ») montre les bons boutons ; les touches de VPX se réécrivent d'elles-mêmes au prochain lancement.

**Table surprise** (bêta).
Dans la roue, maintiens les deux flippers 1,5 seconde pour tirer au hasard une table de la collection active, avec une loterie de logos sur le plateau ; la partie part quand tu relâches les deux flippers.
Exit ou un MagnaSave annule.
Tant que les deux flippers sont tenus, leurs répétitions sont ignorées : la roue ne bouge plus pendant le geste.
Seules les tables que tu as autorisées entrent dans le tirage : fiche de la table, Gérer la table > « Table surprise », qui dit « Peut sortir » ou « Ne sort jamais ».
Toutes les tables jouables de la collection affichée y entrent, sans rien confirmer table par table, et une mise à jour de la table ou de VPX ne la retire plus ; celles de Pinball FX (quelle que soit la boutique : Steam, Epic…) et de Pinball FX3 y entrent aussi.
Pour écarter toute une collection du tirage dans « Toutes les tables » : Menu système > Tables > Collections > « Exclure du tirage… », puis Start sur la collection (pour une collection personnelle : Gérer mes collections > la collection > « Exclure du tirage de Toutes les tables »).
Dans la liste des collections, une collection écartée affiche « hors tirage » ; tirer dans la collection elle-même reste possible.

### Sortir d'une longue liste : la liste et les actions de l'écran

Un écran de gestion qui montre une **liste de contenu** (les tables d'« Ajouter à un jeu », les cartes de « Médias du jeu », les tuiles d'une galerie de fichiers, la bibliothèque d'un ami, les fichiers et les emplacements du sélecteur, les lignes de la Santé de la borne, les téléchargements) a deux zones : la liste, et les actions de l'écran (« Retour », les autres gestes).
Le cœur en décide par nature, jamais par longueur (`screenZones`, [packages/core/src/listzones.ts](../../packages/core/src/listzones.ts)) : une carte de média, une ligne à choisir (`Row.pick`) ou une ligne de la Santé est dans la liste ; tout le reste est une action.
Une liste d'options (deux ou trois réglages au choix, « Ce que montre cet écran ») le déclare (`Section.options`) et reste une simple liste d'actions.
Un écran sans liste de contenu, ou qui n'a rien d'autre qu'elle, ne change pas.

- **La liste se reconnaît** à son cadre (`.lib-zone`, `app/renderer/library.js`, `zoneFrame`) et à son bandeau, hors de ce qui défile : à gauche la position du choix (« 17 / 37 ») ou, hors d'elle, le nombre d'éléments ; à droite le repère, une touche cerclée et son effet : « Exit · Sortir de la liste » tant qu'on y est, « MagnaSave · Revenir à la liste » sinon (un clic dessus fait la même chose).
  La zone du choix a son cadre éclairé en sarcelle ; l'autre s'éteint un peu.
  Un seul focus : le vert reste à l'élément choisi.
- **Exit dans la liste** ramène aux actions de l'écran, sur l'entrée d'où l'on y était venu, sinon sur celle qui fait la même chose qu'Exit (« Retour », « Annuler »), sinon sur la première (`leaveList`).
  Un second Exit quitte l'écran, comme avant.
  Le bandeau d'aide le dit : « Exit ou Échap : sortir de la liste ».
- **MagnaSave gauche ou droit** (F6 au clavier, la touche de Windows qui passe d'un volet à l'autre) bascule d'une zone à l'autre sans étape de plus, et retrouve dans la liste l'élément qu'on y avait quitté (`switchZone`, `ZoneMemory`).
  Les MagnaSave sont ceux de l'étape « Boutons » de l'assistant, sinon les touches par défaut des encodeurs (Ctrl gauche et droit) ; une touche déjà prise par un bouton de l'interface la garde (`zoneSwitchKeys`, [buttons.ts](../../packages/core/src/buttons.ts)).
  La bascule se fait au relâchement, et seulement si rien d'autre n'a été pressé entre-temps : le Ctrl d'un raccourci (Ctrl+Maj+D) ne bascule jamais.
- **Ce que Start fait dans la liste** se lit au bandeau d'aide : « valider » d'ordinaire ; un écran dont la liste se coche le déclare (`listStart`, « Start ou Entrée : cocher ou décocher la partie » pour les parties de la table d'un ami).
- **En borne** (écran en hauteur), le contenu prend sa hauteur et les actions le suivent juste dessous ; le vide reste en bas (`.lib-body` : `minmax(0, max-content) auto`).
  Une liste plus longue que la place défile dans son cadre, les actions toujours visibles.
- **Un appui de flipper** suit l'ordre de l'écran et passe d'une zone à l'autre à leur bord, comme avant (`zoneStep`) : une borne sans MagnaSave atteint toujours ses actions.
  **Un flipper tenu** reste dans sa zone et s'arrête à son bout, sans faire le tour (`zoneHold`) ; après une seconde, il accélère (`holdMove`) : de lettre en lettre sur une liste triée par nom, section par section (une lettre au plus tous les quarts de seconde, l'initiale affichée en grand dans le bandeau ; une table mise en tête, la « probable », n'empêche pas le saut), de trois en trois sinon.

Garde-fous : [sortie-de-liste.test.ts](../../packages/core/src/test/sortie-de-liste.test.ts) fixe l'invariant sur tout écran à zones (Exit depuis n'importe quel élément de la liste mène aux actions, jamais hors de l'écran ; la bascule va et revient à la position quittée ; un flipper tenu reste dans sa zone), vérifie que le rendu met chaque liste de contenu dans son cadre avec son repère, et relève toute liste qui défile dans `app/renderer` : une nouvelle fait échouer le test tant qu'elle n'est pas rangée (liste de contenu, liste d'actions, ou autre avec sa raison ; les listes des réglages de VPX ont leur propre navigation, Exit y remonte d'un niveau).
Dans le rendu réel, le garde-fou de mise en page signale « liste de contenu sans cadre ni repère ».

### Lire un texte plus long que l'écran

Un écran sans liste de contenu peut porter un texte plus long que lui, où il n'y a rien à choisir : les nouveautés d'une mise à jour, un message, une explication.
Quand un tel texte dépasse de son cadre, la molette ou la barre de défilement l'atteignent, mais pas les boutons : les flippers ne parcourent que les actions.
Le texte qui dépasse devient donc une **zone de lecture**, une étape du parcours ([packages/core/src/reading.ts](../../packages/core/src/reading.ts)) :

- **On y entre** par un flipper gauche sur la première action (le texte est au-dessus des actions), par un flipper droit sur la dernière (le parcours fait le tour), ou directement par MagnaSave (F6), qui en revient aussi (`entersReading`).
- **On y lit** page par page : flipper droit ou Start, la page suivante ; flipper gauche, la précédente.
  Une page avance de 85 % de la vue, deux lignes de la précédente restent pour ne pas perdre le fil, en douceur.
  Arrivé en bas, le flipper droit passe à la première action (« Mettre à jour maintenant ») ; arrivé en haut, le gauche à la dernière : on lit puis on agit, sans bouton de plus (`readingStep`).
  Un flipper tenu fait défiler page après page et s'arrête au bout, sans sortir du texte.
- **Exit** revient aux actions, sur celle d'où l'on venait ; un second Exit quitte l'écran.
  Page préc. et Page suiv. d'un clavier font défiler le texte de partout ; la molette aussi, comme avant.
- **Le texte se reconnaît** au cadre d'une liste de contenu (`readingFrame`, [app/renderer/library.js](../../app/renderer/library.js)), montré seulement s'il dépasse : à gauche la part lue (« 45 % lu »), à droite le repère, « MagnaSave · Faire défiler le texte » hors de lui, « Exit · Revenir aux actions » dedans.
  Pendant la lecture, le cadre porte le choix (éclairé en sarcelle), aucune action n'est en vert et les actions s'éteignent un peu ; le bandeau d'aide dit « Flippers : faire défiler… ».
  Un texte qui tient dans l'écran n'a ni cadre ni étape de plus.
- **Qui mesure quoi** : le processus principal ne voit pas la mise en page.
  Le rendu mesure le texte (cadre caché, puis montré s'il dépasse : le montrer ne fait que réduire la place), et envoie au processus principal s'il dépasse, s'il est en haut, s'il est en bas (action `reading`, numérotée par écran : une mesure d'un écran précédent est ignorée), seulement quand cela change.
  Chaque page demandée par un bouton est numérotée et faite une seule fois, même si l'écran se redessine (un tic de progression).
  Le défilement passe par [scroll-keeper.js](../../app/renderer/scroll-keeper.js) (`page`, `readingAt`), seul à faire défiler une liste.
  La mesure ne réveille pas la borne du mode attente.
- **Réglages de VPX** : le détail du réglage choisi (sa description d'origine de VPX peut être longue) défile aux MagnaSave sans quitter la liste : le gauche remonte, le droit (ou F6) descend d'une page ([settings.ts](../../app/src/settings.ts), `detailMove`).
  Le bandeau d'aide le dit.

Garde-fous : [lecture.test.ts](../../packages/core/src/test/lecture.test.ts) fixe le parcours (entrée, pages, sortie au bout, flipper tenu arrêté au bout) et le vrai rendu (cadre seulement si le texte dépasse, mesure envoyée une fois par changement, une page par appui).
Tout texte à lire qui défile le dit par `data-reading` ; dans le rendu réel de toute fenêtre, le garde-fou de mise en page signale « texte qui défile hors d'atteinte des boutons » pour celui qui ne le dit pas (une liste de choix sans choix courant le dit par `data-choices`).
Le recensement des listes qui défilent ([sortie-de-liste.test.ts](../../packages/core/src/test/sortie-de-liste.test.ts)) donne pour chacune la façon dont les boutons l'atteignent.

### Le message d'un geste reste jusqu'au geste suivant

La confirmation ou l'erreur d'une action (« Nom changé », « Avatar enregistré », « Pseudo refusé », « Demande envoyée à … ») s'affiche en tête de l'écran et y reste jusqu'au geste suivant de l'utilisateur, quel que soit le nombre de fois que l'écran se redessine entre-temps.

- **Pourquoi** : `app/src/library.ts` rappelle `build()` d'un écran décrit à chaque `broadcast()`, et beaucoup ne viennent pas de l'utilisateur (le profil social redessine 250 ms après chaque changement, un téléchargement avance, un ami se connecte).
  Un écran qui effaçait son message en le dessinant le perdait avant qu'on l'ait lu (constaté le 10/11/2026 sur « Votre profil de joueur »).
- **Un geste** (`userGesture`, [app/src/gesture-flash.ts](../../app/src/gesture-flash.ts)) : `library.ts` le compte avant chaque action validée (Start, clic, raccourci), chaque retour (Exit, « Retour »), chaque touche d'une saisie, chaque fichier déposé, et quand le front-end se ferme.
  Déplacer la sélection (flippers, MagnaSave, défilement du texte) n'en est pas un : le message reste pendant qu'on parcourt l'écran.
- **Règle des écrans** : `build()` lit le message, ne l'efface jamais.
  L'écran s'abonne une fois, à sa création (`onGesture(() => (flash = undefined))`) ; une action peut aussi remplacer le message par le sien.

Garde-fous : [gesture-flash.test.ts](../../packages/core/src/test/gesture-flash.test.ts) vérifie qu'un écran redessiné sans geste montre le même message, effacé au geste suivant, et refuse tout écran de `app/src` qui efface son message en le lisant ; [friends-menu.test.ts](../../packages/core/src/test/friends-menu.test.ts) et [profile-welcome.test.ts](../../packages/core/src/test/profile-welcome.test.ts) le vérifient sur leurs écrans.
