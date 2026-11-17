[English](../manual/relaunch-with-start.md) · Français · [Sommaire du manuel](../manuel.md)

## Relance par Start

Un **appui long (2 s) sur Start**, quand Start est un bouton de joystick (Pinscape sur KL25Z, encodeur en mode manette, relevé dans l'étape « Boutons »), rouvre Cyber Pinball depuis Windows :

- **Cyber Pinball fermé** (« Quitter Cyber Pinball », Alt+F4, plantage) : il se relance, comme par son raccourci ;
- **Cyber Pinball ouvert en mode bureau** (menu système > « Borne » > « Bureau Windows ») : le front-end revient sur tous ses écrans, comme par Ctrl+Maj+D ou la barre des tâches.
  Le Start qui a choisi « Bureau Windows » ne compte pas : il faut le relâcher, puis le tenir de nouveau.

Rien ne se passe pendant une partie de VPX lancée depuis le bureau (fenêtre « Visual Pinball Player » à l'écran : Start y est un bouton du jeu), ni tant que le front-end est ouvert.
Un Start sur une touche du clavier n'est pas concerné : sur le bureau, la touche irait aussi au programme au premier plan.

**Le veilleur.**
Cyber Pinball fermé, plus rien ne lit le joystick : un petit processus sans fenêtre s'en charge : `CyberPinball.exe` en mode Node (`ELECTRON_RUN_AS_NODE`, comme la mise à jour légère), qui exécute `dist\veilleur.js` (`app/src/veilleur.ts` ; côté front-end `app/src/start-relaunch.ts`, logique pure dans `packages/core/src/start-relaunch.ts`).
Sans Chromium, il coûte environ 0,2 % d'un cœur et 45 Mo.
Il lit le bouton Start par le SDL de VPX, comme le front-end (mêmes jetons `SDLJoy_<GUID>_<rang>;<bouton>`), dix fois par seconde, et relit le relevé des boutons (`cabinet.json`) toutes les 5 s.
Un seul veilleur à la fois : un second, voyant le premier vivant (son pid), se ferme aussitôt ; il ne compte pas comme un second lancement de Cyber Pinball.
Tant que Cyber Pinball est ouvert (`<données>\relance-start\application.pid`, pid vérifié par son nom d'exécutable), il ne lit pas le joystick.

- **Lancement** : raccourci `Cyber Pinball - relance par Start.lnk` du dossier Démarrage du compte (`CyberPinball.exe --veilleur`, qui lance le veilleur et sort aussitôt), posé par Cyber Pinball installé à chaque démarrage du front-end (refait s'il vise un autre exécutable), et le veilleur lancé s'il ne tourne pas.
  Depuis les sources, rien n'est posé (l'exécutable est Electron).
- **Mises à jour** : le veilleur tient `CyberPinball.exe` ouvert.
  Il est arrêté (`<données>\relance-start\veilleur.pid`) avant l'installeur ou la mise à jour légère, par l'installeur lui-même (lancé à la main), par le désinstalleur et par `npm run deployer` ; Cyber Pinball relancé le relance.
- **Réglage** : menu système > « Borne » > « Relance par Start », qui dit « oui » ou « non » (`<données>\relance-start\reglage.json`, oui par défaut).
  Grisée, avec la raison, quand Start n'est pas un bouton de joystick et en [borne dédiée](borne-dediee.md#borne-dédiée), où Cyber Pinball est relancé de lui-même.
  « Non » retire le raccourci et arrête le veilleur.
- **Journal** : le veilleur écrit dans le même `journal.txt` (« Relance par Start : … ») : bouton suivi, appui reconnu, lancement ou raison de ne rien faire.
