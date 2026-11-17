[English](../manual/getting-started.md) · Français · [Sommaire du manuel](../manuel.md)

## Démarrer

Prérequis : Windows 10 ou 11, Node.js 22 ou plus.

Le plus simple : double-cliquez sur `lanceur.cmd`.
Il propose un menu (jouer, installation, ouverture de VPX, détection, assistant, synchronisation, tests, dossier de données) et compile ce qu'il faut avant chaque action.
`.\lanceur.cmd sync` lance une action directement.

**Comme un utilisateur final** : l'action « Fabriquer et déployer » (ou `npm run deployer`) produit `CyberPinball.exe` et le copie dans `<racine>\app\`, avec un raccourci `Cyber Pinball.lnk` à la racine.
L'exécutable trouve sa racine tout seul (le dossier qui contient `app\`) ; s'il manque VPX, il propose de l'installer depuis l'écran.

**Pour distribuer** : l'action « Fabriquer l'installeur » (ou `npm run installeur`) produit `release\CyberPinball-Setup.exe` (version légère) et `release\CyberPinball-Setup-complet.exe` (avec VPX).
Voir [Installeur Windows](installation-et-organisation-des-fichiers.md#installeur-windows).

Les mêmes commandes avec npm :

```bash
npm install
npm test          # compile et lance tous les tests du cœur (une quinzaine de minutes : avant chaque préversion)
npm run verifier  # pendant le travail : les tests rapides, sans Electron ni Chromium (-- puppack vbs : ces fichiers de test ; -- --modifies : ceux des fichiers changés)
npm run test:electron # seulement les tests qui lancent Electron, Chromium ou un autre processus
npm run avant-fusion  # contrôle de publication, puis npm test : avant chaque fusion dans la branche publiée
npm run probe     # liste les écrans et les sorties audio détectés, leur empreinte et le nom attendu par VPX
npm start         # écran des tables (assistant d'écrans au premier démarrage)
npm run assistant # assistant complet (-- --boutons, --lanceur, --tilt, --ecrans, --playfield, --disposition, --son : une seule étape)
npm run fabriquer # exécutable dans release\win-unpacked\ (npm run deployer : et copie dans <racine>\app\)
npm run installeur # idem, puis release\CyberPinball-Setup.exe et -complet.exe (-- --leger : sans la complète)
npm run sync      # ce que fera l'application à chaque démarrage : corrige VPinballX.ini si les écrans ont bougé
npm run vpx-schema # régénère le schéma des réglages de VPX depuis son code source (-- --check : vérifie seulement)
```

**Dans un worktree sans `node_modules` à lui** (`.claude\worktrees\<nom>`), Node et tsc trouvent les dépendances en remontant jusqu'au dossier principal, mais les liens `@cyberpinball\*` de celui-ci mènent au code du dossier principal.
`npm run build` (donc `npm test`) commence par [scripts/liens-espaces.mjs](../../scripts/liens-espaces.mjs), qui pose dans le worktree les jonctions `node_modules\@cyberpinball\*` vers ses propres dossiers : `app\` compile et tourne contre le cœur du worktree.
Le script ne supprime rien ; un lien qui pointe ailleurs arrête la compilation avec la commande pour le retirer.
Les tests chargent un fichier de dépendance par le nom du paquet (`require('hyperdht/testnet.js')`), jamais par un chemin `node_modules` (vérifié par `resolution-depot.test.ts`).
Avant de compiler, `npm run build` retire aussi, par [scripts/sorties-orphelines.mjs](../../scripts/sorties-orphelines.mjs), les fichiers de `dist\` dont la source a été supprimée ou renommée : `tsc -b` ne les efface jamais, et `npm test` lançait encore un test retiré resté dans `dist\test\` (`--verifier` les liste sans rien retirer).

Les touches sont celles des boutons de la borne, relevées à la première étape de l'assistant (« Boutons », voir plus bas).
Tant qu'elle n'a pas été faite, ce sont celles qu'envoient par défaut les encodeurs de borne :

| Bouton | Touche par défaut | Assistant | Écran des tables |
| --- | --- | --- | --- |
| Flipper gauche / droit | Shift gauche / droit | Changer d'écran ; son : fronton / plateau | Choisir une table |
| Start | 1 | Valider ; son : les deux | La fiche de la table ; ou la partie, réglage « Start sur la roue : jouer directement » (la fiche à Start maintenu, ou F6 d'un clavier) |
| Exit | Échap | Passer un rôle, recommencer ; son : aucun rôle ; boutons : passer un bouton facultatif | Menu système : revenir, réglages de VPX, boutons, quitter |
| (clavier) | flèches, Entrée, Échap | Comme les flippers, Start, Exit | Comme les flippers, Start, Exit |
| (clavier) | Tab | Bouton : refusé (réservé) | Menu système, depuis n'importe où dans le front-end ; puis Tab / Maj+Tab pour s'y déplacer |
| (souris) | ⚙ en haut à droite | | Menu système |
| (souris) | « ‹ » et le nom de l'écran où il mène, au-dessus du titre | | Comme Exit, dans chaque sous-menu, sur la fiche et dans les réglages de VPX |
| (clavier) | H | | Afficher les commandes |
| (clavier) | R | | Réglages de VPX |
| (clavier) | Retour arrière | Étape précédente | |
| (clavier) | Ctrl+Q | Quitter | Quitter |
| (clavier) | Ctrl+Maj+D | | « Bureau Windows » : libère tous les écrans du PC ; de nouveau, même depuis une autre application : retour au front-end |
| Bureau Windows (facultatif) | aucune | | Comme Ctrl+Maj+D, d'un appui ; bouton de joystick : de nouveau au bureau, retour au front-end |
| (clavier) | Ctrl+Maj+K | | Arrêter une partie bloquée |

Les touches du clavier ne servent que si aucun bouton de la borne ne les envoie déjà (une flèche relevée comme flipper droit ne recule plus) ; H et R non plus.

**Pointeur de la souris** : il se masque trois secondes après son dernier mouvement, sur toutes les fenêtres de Cyber Pinball (front-end, assistant, réglages, menu en partie, fenêtre « Récupérer »), et revient dès que la souris bouge.

**Raccourcis dans le menu système** : une entrée qui a un raccourci le montre à droite de son libellé, en touches cerclées comme le bandeau d'aide (« Réglages de VPX » : R, « Commandes de la borne » : H, « Bureau Windows » : Ctrl Maj D), et le raccourci la déclenche aussi depuis ce menu.
Les touches affichées sont lues là où le raccourci est défini : les touches de l'interface de cette borne (`interfaceKeys`, une touche prise par un bouton disparaît) et les combinaisons de `SHORTCUTS` (`packages/core/src/shortcuts.ts`), d'où viennent aussi le raccourci global et l'aide-mémoire.
Un bouton de joystick ne s'affiche pas (son nom ne tient pas dans une touche).
Modèle de la DA : `LigneMenu`, `.cp-shortcut`.

**Retour en tête d'écran** : chaque écran du front-end (menu système, fiche, médecin, ajout, catalogue, médias, configurations…) porte au-dessus de son titre un bouton qui fait ce que fait Exit ; à la souris, inutile de descendre au bas de la liste chercher « Retour ».
Il **nomme l'écran où il mène** : « ‹ Neon Abyss » (la fiche), « ‹ Gérer la table », « ‹ Téléchargements », « ‹ Écran des tables » (la roue, ou la liste des titres).
La destination se lit du parcours des écrans traversés (`BackTrail`, [packages/core/src/backtrail.ts](../../packages/core/src/backtrail.ts)) : chaque écran affiché s'y ajoute, et revenir sur l'un d'eux, par son retour ou par une action qui le rouvre (enregistrer, annuler), coupe la suite.
Un retour qui arrive ailleurs que là où son bouton l'annonçait est appris pour la fois suivante et dit au journal (« Retour de « … » : le bouton annonçait « … », arrivé sur « … » »), pour que l'écran déclare sa destination ; Exit, un clic sur le bouton, Start ou un clic sur l'action de retour le vérifient.
Une action de retour qui dit autre chose qu'un retour (« Annuler », « Retour sans enregistrer ») garde son libellé ; Au bas de la liste, un « Retour » qui ne dit rien nomme aussi sa destination (« Retour : Menu système »), et « Retour à la fiche » qui mène en fait à « Gérer la table » devient « Retour : Gérer la table ».
Dans la liste d'un écran à deux zones, où Exit passe aux actions au lieu de revenir, le bouton montre **« Exit : actions »** (la touche cerclée) et un clic fait de même.
Il n'apparaît pas quand l'action de retour est la seule de l'écran (un message et son « Continuer »).
Tout écran décrit par `Built` (`app/src/library.ts`) l'obtient de son champ `back`, obligatoire : un nouvel écran ne peut pas l'oublier (`backLabel`, action `back` du rendu, `.lib-back` dans `app/renderer/library.*`).
Le clavier à l'écran le recouvre sans le retirer, pour que la page ne saute pas.
Les réglages de VPX ont le leur sous la marque : « ‹ Retour aux sections » dans une section de l'onglet « Avancé », « ‹ Fermer » ailleurs.
Tests : [retour-nomme.test.ts](../../packages/core/src/test/retour-nomme.test.ts).

Pendant une partie, ce sont les touches écrites dans `[Input]` de VPX (rappelées sur l'écran de chargement au bureau, et dans l'aide-mémoire, touche H) : par défaut Shift pour les flippers, Entrée pour le lanceur, 5 pour un crédit, 1 pour Start, Échap pour quitter (VPX 10.8.1 quitte dès l'appui), P pour mettre en pause (un nouvel appui reprend la partie), et les deux MagnaSave ensemble (sans eux, Crédit et Start) pour les réglages en partie : la position du DMD, puis le menu de VPX, où se placent les autres écrans (« Position du DMD en partie », « Régler l'affichage en partie »).
