[English](../manual/setup-wizard-and-configuration-menu.md) · Français · [Sommaire du manuel](../manuel.md)

## Assistant et menu de configuration

L'assistant (`app/src/wizard.ts`, écrans `app/renderer/screen.*`) enchaîne au premier démarrage, ou par « Assistant complet » : **boutons** (relevé de chaque bouton), **lanceur analogique** (plunger à capteur, accéléromètre), **tilt** (balancier de la borne ou balancier simulé par VPX), **écrans et rôles** (playfield, backglass, DMD, topper), **orientation et taille du playfield** (bord des flippers, retournement de l'écran dans Windows si VPX en a besoin, diagonale), **disposition des écrans** (zones), **son** (sorties audio, test des haut-parleurs), puis le récapitulatif et l'écriture de `cabinet.json` et de `VPinballX.ini`.
La liste des étapes, ce que chacune décide et ses clés sont dans [packages/core/src/wizardsteps.ts](../../packages/core/src/wizardsteps.ts) (`WIZARD_PHASES`, `WIZARD_STEPS`), testés dans [wizardsteps.test.ts](../../packages/core/src/test/wizardsteps.test.ts).

**Menu système (Exit, Tab ou ⚙) > « Borne » > « Configuration de la borne »** regroupe tout ce qui règle la borne.
Chaque étape s'y refait seule et revient à l'écran des tables, enregistrée ou non :

| Entrée | Option | Ce qui est refait | Clés de `VPinballX.ini` écrites |
| --- | --- | --- | --- |
| Boutons du jeu | `--boutons` | relevé des boutons du jeu et essai | `[Input]` |
| Boutons de l'interface | `--interface` | relevé des boutons qui pilotent Cyber Pinball et essai | aucune |
| Lanceur analogique | `--lanceur` | détection du lanceur à capteur, sens, zone morte, vitesse, accéléromètre, essai | `[Input]` des capteurs |
| Tilt | `--tilt` | balancier de la borne ou balancier simulé par VPX, angle du contact, essai aux secousses | `[Player] SimulatedPlumb`, `PlumbThresholdAngle` |
| Écrans et rôles | `--ecrans` | l'écran de chaque rôle ; bord des flippers et diagonale seulement si le playfield change d'écran | fenêtres de VPX et cadrage |
| Orientation et taille du playfield | `--playfield` | bord des flippers, retournement de l'écran, diagonale | fenêtres de VPX et cadrage |
| Disposition des écrans | `--disposition` | zone de chaque rôle sur son écran | fenêtres de VPX et cadrage |
| Son de la borne | `--son` | sorties du fronton et du plateau, test des haut-parleurs | `SoundDevice`, `SoundDeviceBG`, `Sound3D` |
| Assistant complet | | toutes les étapes à la suite | toutes les clés gérées |
| Touches par défaut des encodeurs | | remise immédiate des deux jeux de boutons, sans assistant | `[Input]` |
| Configurations de la borne | | choix, renommage, corbeille, nouvelle configuration | |

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
