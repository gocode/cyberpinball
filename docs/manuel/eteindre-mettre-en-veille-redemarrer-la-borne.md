[English](../manual/shutting-down-sleeping-restarting-the-cabinet.md) · Français · [Sommaire du manuel](../manuel.md)

## Éteindre, mettre en veille, redémarrer la borne

Dans la rubrique Quitter ou éteindre du menu système, la dernière de la racine, après « Bureau Windows », « Quitter Cyber Pinball » et « Redémarrer Cyber Pinball » (toutes les sorties ensemble, de la plus légère à la plus lourde) : « Mettre en veille », « Redémarrer la borne », « Éteindre la borne ».
Chacune ouvre un écran de confirmation qui dit ce qui va se passer ; Start confirme (l'action est choisie d'office, en vert comme tout choix courant : le passage par la confirmation suffit à la prudence), Exit ou « Annuler » ramène à la rubrique, la sélection sur l'entrée.
Le module est [app/src/power.ts](../../app/src/power.ts) ; la méthode, la simulation et l'action programmée sont dans [packages/core/src/power.ts](../../packages/core/src/power.ts), l'appel de la veille dans [packages/win-displays/src/power.ts](../../packages/win-displays/src/power.ts).

- **Redémarrer Cyber Pinball** : ferme et rouvre le logiciel seul, le PC reste allumé (après une ROM ou un réglage changé hors du front-end, un écran ou une manette rebranchés, un front-end qui ne répond plus bien).
  Sans confirmation, comme « Quitter Cyber Pinball » : rien ne s'éteint.
  C'est la relance couverte des changements de langue et de configuration (`relaunchMenu`, `relaunchCovered` dans [app/src/screen-guard.ts](../../app/src/screen-guard.ts)) : réglages enregistrés, le nouveau processus peint ses fenêtres avant que l'ancien se ferme, aucun écran ne montre le bureau entre les deux, sans l'ouverture du démarrage.
  Borne dédiée (Cyber Pinball shell de Windows) : la relance passe par Shell Launcher, et « Quitter Cyber Pinball » n'est pas proposé (voir [Borne dédiée](borne-dediee.md#borne-dédiée)).
- **Éteindre, redémarrer** : chaque écran passe au noir uni, le playfield ne portant que « Extinction de la borne… » (ni marque, ni média, ni roue dentée), puis le front-end enregistre ses réglages (état des médias du front-end), rend les barres des tâches qu'une partie aurait masquées, puis lance `shutdown.exe /s /t 0` (`/r` pour redémarrer).
  Ses fenêtres et ses voiles restent en place jusqu'à ce que Windows ferme l'application, son propre écran d'arrêt déjà affiché : aucun écran ne montre le bureau entre les deux.
  Arrêt complet : le démarrage rapide de Windows n'intervient qu'avec `/hybrid`, la borne repart donc à froid, ses périphériques USB (Pinscape, encodeurs) réénumérés.
  Sans `/f` (que `/t 0` n'implique pas) : une application ouverte peut enregistrer, ou retenir Windows ; au bout d'une minute sans arrêt, le front-end le dit (« La borne ne s'est pas éteinte ») et Exit le ramène.
- **Mettre en veille** : même écran noir (« Mise en veille… »), réglages enregistrés, puis veille S3 par `SetSuspendState(FALSE, FALSE, FALSE)` de `powrprof.dll`, appelée directement par koffi, sur un fil à part.
  Cyber Pinball reste ouvert : au réveil, l'écran des tables revient tel quel.
  Jamais `rundll32 powrprof.dll,SetSuspendState 0,1,0` : rundll32 passe ses propres arguments (fenêtre, instance, ligne de commande), le premier, « hiberner », reçoit une poignée de fenêtre non nulle, et le PC hiberne dès que la veille prolongée est active, ce qui est le cas par défaut sous Windows 11 et sur la borne (`powercfg /a` : veille S3 et veille prolongée).
  Le privilège d'arrêt du processus (`SeShutdownPrivilege`) est activé avant l'appel.
  La veille hybride, si Windows l'a activée, reste une veille (la mémoire est en plus copiée sur le disque).
  Un PC à veille moderne seulement (S0 faible consommation, sans S3) ne permet pas de la demander : `IsPwrSuspendAllowed` le dit d'avance, l'entrée affiche « Indisponible : ce PC n'a que la veille moderne » et son écran (« Veille indisponible depuis Cyber Pinball ») renvoie au menu Démarrer de Windows, sans rien demander à Windows.
- **Action programmée** : `createPowerControl` fait une action tout de suite (`run`) ou à une heure donnée (`schedule(action, at)`, annulable par `cancel()`, liste par `scheduled()`).
  L'heure est relue au moins chaque minute (une veille suspend les minuteries) ; une action dont l'heure est passée de plus de cinq minutes (borne en veille ou arrêtée à l'heure dite) est manquée, pas rattrapée au réveil (`onMissed`).
  Une action programmée peut attendre la borne libre (`ready`, relu chaque seconde) jusqu'à une heure limite (`until`), et s'annoncer par un préavis (`notice`) qu'un bouton retire.
  Toute action, demandée dans le front-end ou programmée, attend ensuite l'arrêt de Windows (`settle`).
  Le front-end l'expose par `createPowerMenu(…).control`, pour l'arrêt automatique de l'horaire de la borne (voir [Horaire de la borne](medias-des-jeux.md#horaire-de-la-borne)).
- **Essais** : rien ne s'éteint jamais.
  L'exécuteur réel n'est construit qu'en l'absence de toute variable d'essai (`powerSimulated`) : hors écran, pilote automatique, captures, endurance, bac à sable (`CYBERPINBALL_HOME`), tests unitaires, même avec `CYBERPINBALL_A_L_ECRAN=1`, et sur demande (`CYBERPINBALL_ALIMENTATION_SIMULEE=1`).
  L'action y est seulement journalisée (« Alimentation simulée : shutdown.exe /s /t 0 »), l'écran noir reste 2,5 s, puis le front-end revient avec le constat « Mode essai : extinction simulée, le PC reste allumé » (effacé dès qu'une autre confirmation s'ouvre).
  `CYBERPINBALL_ALIMENTATION_SANS_VEILLE=1` simule, en essai seulement, un PC sans veille S3.
- **Preuves** : [power.test.ts](../../packages/core/src/test/power.test.ts) fixe les invariants (chaque essai simulé, exécuteur réel jamais construit en essai, aucun autre chemin vers l'arrêt dans le code : `shutdown.exe`, `SetSuspendState`, `rundll32`, `ExitWindowsEx`, `Stop-Computer`… ; méthodes sans `/f` ni hibernation ; action programmée, manquée, annulée).
