[English](../manual/setup-wizard-and-configuration-menu.md) · Français · [Sommaire du manuel](../manuel.md)

## Assistant et menu de configuration

L'assistant (`app/src/wizard.ts`, écrans `app/renderer/screen.*`) enchaîne au premier démarrage, ou par « Assistant complet » : **boutons** (relevé de chaque bouton), **lanceur analogique** (plunger à capteur, accéléromètre), **tilt** (balancier de la borne ou balancier simulé par VPX), **écrans et rôles** (playfield, backglass, DMD, topper), **orientation et taille du playfield** (bord des flippers, retournement de l'écran dans Windows si VPX en a besoin, diagonale), **disposition des écrans** (zones), **son** (sorties audio, test des haut-parleurs), puis le récapitulatif et l'écriture de `cabinet.json` et de `VPinballX.ini`.
La liste des étapes, ce que chacune décide et ses clés sont dans [packages/core/src/wizardsteps.ts](../../packages/core/src/wizardsteps.ts) (`WIZARD_PHASES`, `WIZARD_STEPS`), testés dans [wizardsteps.test.ts](../../packages/core/src/test/wizardsteps.test.ts).

**Frise des étapes** : en haut de chaque écran, entre la marque et « Quitter sans enregistrer », une pastille numérotée par étape de l'assistant complet (boutons de l'interface, boutons du jeu, lanceur, tilt, écrans, disposition, son, récapitulatif) ([app/src/wizard-progress.ts](../../app/src/wizard-progress.ts)).
Les étapes faites et à venir ne montrent que leur numéro ; celle en cours, en vert, porte son nom et où l'on en est : « Boutons de l'interface · Bouton 1 sur 4 », « Boutons de l'interface · Bouton facultatif 2 sur 4 », « Écrans · Rôle 2 sur 4 », « Son · Sortie 1 sur 3 », « Son · Haut-parleurs 1 sur 3 ».
Une étape refaite seule n'a qu'une pastille, à son nom ; l'écran de fin n'en a pas.

**Au clavier et à la souris** : chaque étape a ses commandes à l'écran, cliquables, avec sous chacune les touches qui font la même chose ([app/src/wizard-controls.ts](../../app/src/wizard-controls.ts)) : « Revenir » (Retour arrière), les deux choix des flippers (et des flèches), l'action qui fait avancer, en évidence (Start ou Entrée), et la réponse d'Exit (Échap) quand l'étape en a une.
Par exemple « ◀ Tourner », « Tourner ▶ » et « Valider » au bord des flippers ; « − Moins », « Plus + » et « Valider » à la diagonale ; « ◀ Écran précédent », « Écran suivant ▶ », « Valider » (ou « Ouvrir l'éditeur ») et « Aucun écran » pour chaque rôle ; « Dans le fronton », « Sur le plateau », « Les deux » et « Aucun » pour chaque sortie du son ; « Plateau, près de vous », « Plateau, côté fronton », « Dans le fronton » et « Rien entendu » au test des haut-parleurs ; « Enregistrer » et « Recommencer » au récapitulatif ; « Continuer vers les tables » à la fin.
Les étapes « Lanceur » et « Tilt » ont « Revenir » en plus de leurs propres lignes, cliquables elles aussi.
Un clic passe par le même traitement que l'appui du bouton de la borne, sous un code qu'aucun clavier ni joystick ne peut envoyer : il fait exactement la même chose.
Toute la première configuration se fait ainsi depuis un PC, en bureau à distance compris ; seul le relevé des boutons demande d'appuyer sur les vrais boutons de la borne.

**Menu système (Exit, Tab ou ⚙) > « Ma borne » > « Configuration de la borne »** regroupe tout ce qui règle la borne.
Chaque étape s'y refait seule et revient à l'écran des tables, enregistrée ou non :

| Entrée | Option | Ce qui est refait | Clés de `VPinballX.ini` écrites |
| --- | --- | --- | --- |
| Boutons du jeu | `--boutons` | relevé des boutons du jeu et essai | `[Input]` |
| Boutons de l'interface | `--interface` | relevé des boutons qui pilotent Cyber Pinball et essai | aucune |
| Lanceur analogique | `--lanceur` | détection du lanceur à capteur, sens, zone morte, vitesse, accéléromètre, essai | `[Input]` des capteurs |
| Tilt | `--tilt` | balancier de la borne ou balancier simulé par VPX, angle du contact, accéléromètre et force des secousses, essai aux secousses | `[Player] SimulatedPlumb`, `PlumbThresholdAngle`, `[Input] Mapping.Nudge0.X` et `.Y` |
| Écrans et rôles | `--ecrans` | l'écran de chaque rôle ; bord des flippers et diagonale seulement si le playfield change d'écran | fenêtres de VPX et cadrage |
| Orientation et taille du playfield | `--playfield` | bord des flippers, retournement de l'écran, diagonale | fenêtres de VPX et cadrage |
| Disposition des écrans | `--disposition` | zone de chaque rôle sur son écran | fenêtres de VPX et cadrage |
| Son de la borne | `--son` | sorties du fronton et du plateau, test des haut-parleurs | `SoundDevice`, `SoundDeviceBG`, `Sound3D` |
| Assistant complet | | toutes les étapes à la suite | toutes les clés gérées |
| Configurations de la borne | | choix, renommage, corbeille, nouvelle configuration | |
| Rétablir les boutons d'avant | | seulement après une remise aux touches par défaut : le relevé remplacé, remis | `[Input]` |
| Touches par défaut des encodeurs | | après confirmation, les deux jeux de boutons aux touches des encodeurs, sans assistant ; grisée sur une borne aux boutons de joystick (voir [Boutons de la borne](boutons-de-la-borne.md#boutons-de-la-borne)) | `[Input]` |

Une étape seule part du modèle enregistré (rôles, écrans, bord des flippers), ne change que ses champs de `cabinet.json` (`stepCabinet`) et n'écrit que ses clés de `VPinballX.ini` (option `only` de la synchronisation), même changées à la main ; les autres restent telles quelles jusqu'à la synchronisation suivante du front-end.
Le récapitulatif ne montre que ces clés ; Exit y recommence l'étape, Retour arrière revient à la dernière question.
Fenêtres et cadrage : `[Player] Playfield*`, `[Backglass]`, `[ScoreView]`, `[Topper]`, `BGSet`, `ScreenWidth`, `ScreenHeight`, `CabinetAutofitMode`.

**Quitter sans enregistrer, à toute étape** (éditeur de disposition, compte à rebours du retournement et récapitulatif compris) : la question « Quitter sans enregistrer ? » s'ouvre par

- le bouton **« Quitter sans enregistrer »**, toujours affiché en haut à droite de chaque écran (cliquable aussi dans l'éditeur de disposition).
  **Il dit dessous le geste qui marche à cette étape** (`quitGestures`) : « Exit (Échap) maintenu 2 s », « Toute touche maintenue 3 s » pendant le relevé, et le bouton dédié quand il agit (« ou Bouton 9 du joystick ») ; jusqu'à la 0.1.11-essai.43, ce geste n'était écrit que dans le sous-menu « Configuration de la borne », et personne ne le connaissait ;
- **le bouton « Quitter sans enregistrer » de la borne**, facultatif, affecté à l'étape « Boutons de l'interface » (`navigation.quit`) : un appui ouvre la question, un second y répond oui, à toute étape, assistant complet ou étape seule.
  Il garde son rôle là où ce même bouton physique en a déjà un (`quitButtonActs`, [wizardsteps.ts](../../packages/core/src/wizardsteps.ts)) : pendant le relevé d'un bouton, il se relève comme un autre (maintenu 3 s, il ouvre la question comme toute touche) ; au récapitulatif des boutons, il compte comme l'essai du bouton du jeu qu'il est aussi ; à l'étape « Tilt », il reste le balancier s'il l'est.
  Hors de la configuration, il ne fait rien ;
- **Ctrl+Q** d'un clavier ; Ctrl+Q de nouveau répond oui ;
- **Échap ou Exit maintenu 2 s** (le bouton affiche « Maintenu : quitter sans enregistrer ? dans 1 s ») ;
- **pendant le relevé des boutons, n'importe quelle touche maintenue 3 s**, qui n'est pas relevée.
  À ce moment, on ne sait pas encore quelle touche est Exit : c'est le seul geste qui marche avec n'importe quel encodeur.
  Pour qu'il ne gêne pas le relevé, un bouton est relevé **au relâchement** : un appui sur un bouton de borne dure bien moins d'une seconde, la différence ne se voit pas, et une touche tenue n'est jamais relevée (rien à défaire).
  Hors du relevé, seuls Échap et Exit maintenus ouvrent la question : les flippers maintenus gardent leur effet (accélérer un réglage de l'éditeur) ;
- **Exit (ou Retour arrière) à la première question** d'une étape, quand il n'y a rien avant : le playfield de l'assistant complet, le bord des flippers de l'orientation seule, la première sortie du son seul, l'éditeur de la disposition seule.

La question dit ce qui serait perdu (« Boutons : Flipper gauche sur A », « DMD : … », « Flippers à gauche de l'image », « Son… », « Écran du playfield : remis dans son orientation d'origine », ou « Rien n'a été changé ») et où l'on va.
**Start (ou Entrée) : oui** · **Exit, Échap ou Retour arrière : non** · le même geste encore (une touche maintenue de nouveau) : oui · sans réponse en 20 s, l'assistant reprend.
Pendant le relevé, le Start et l'Exit déjà relevés répondent aussi.
Oui : rien n'est écrit, ni `cabinet.json` ni `VPinballX.ini` ; une orientation d'écran non confirmée est remise ; retour à l'écran des tables, ou, au premier démarrage sans modèle (le front-end ne peut pas s'ouvrir), fermeture de Cyber Pinball annoncée à l'écran (« l'assistant reprendra au prochain démarrage »).
Un test fixe l'invariant : la question passe avant toute étape dans `handleKey`, la souris avant toute autre action, chaque état envoyé aux écrans porte le bouton, et rien n'est écrit hors des deux fonctions d'enregistrement.

**« Placer librement… »** : à l'étape des écrans, après les écrans entiers et les emplacements tout faits (bas du backglass en 4:1 ou 16:9, incrustation dans le playfield), le backglass, le DMD et le topper proposent « Placer librement… ».
Start ouvre l'éditeur de disposition sur ce rôle, posé sur son écran enregistré (sinon un écran libre, sinon celui du backglass), le curseur sur la ligne « Zone » ; « Revenir à l'assistant » garde la place choisie et passe au rôle suivant, Exit revient à la question telle qu'elle était.
