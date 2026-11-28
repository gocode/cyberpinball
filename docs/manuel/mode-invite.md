[English](../manual/guest-mode.md) · Français · [Sommaire du manuel](../manuel.md)

## Mode invité

Pour une soirée ou les enfants : Menu système > Ma borne > Démarrage et accès > Mode invité, puis « Activer le mode invité ».
L'écran des tables s'ouvre verrouillé, et le reste jusqu'au déverrouillage, même après un redémarrage (`mode-invite.json` dans le dossier des données).

- **Ce qui reste ouvert** : choisir une table (flippers, flèches, roue, clic), ouvrir sa fiche, jouer, lire le prospectus et les règles, l'aide-mémoire des commandes (bouton Aide, H, F1), arrêter une partie bloquée (Ctrl+Maj+K).
  La fiche n'offre plus que Jouer, Prospectus, Règles et Retour dans le front-end, sans la section « Fichiers ».
- **Ce qui est fermé** : le menu système (Exit, Tab, roue dentée), les réglages de VPX (R, bouton Réglages), Bureau Windows (Ctrl+Maj+D), Ctrl+Q, Alt+F4 sur une fenêtre du front-end, les actions de la fiche qui modifient, suppriment, réparent ou téléchargent (Modifier, Médias du jeu, Fichiers, PuP-Pack, Régler l'affichage, Réglages de cette table, Diagnostiquer, Supprimer, Ce qu'il manque pour jouer, Pour aller plus loin), les fichiers glissés sur la fenêtre, et Start sur un message du front-end qui répare ou installe (assistant, VPX, boutons, VPinballX.ini changé à la main, ce qu'il manque pour jouer) : Exit ferme le message sans rien changer.
  Une porte fermée ne fait rien d'autre que montrer « Verrouillé · mode invité » trois secondes en haut à droite, près du cadenas qui remplace la roue dentée (avec le mot « Invité ») ; le pied du front-end ne propose plus « Exit : Menu système », et l'aide-mémoire ne liste que ce qui marche.
- **Déverrouiller** : les deux flippers et les deux MagnaSave tenus ensemble 3 secondes, depuis l'écran des tables, une fiche ou un message.
  Chaque main tient son flipper et la MagnaSave d'à côté, le geste même de la MagnaSave : faisable seul, sans lâcher la borne.
  Quatre boutons tenus à la fois n'arrivent pas par hasard dans un menu qui se pilote un bouton à la fois, et la combinaison n'est pas écoutée pendant une partie ni son chargement (VPX a alors les boutons) : elle ne gêne jamais le jeu.
  L'anneau du cadenas se remplit ; relâché avant la fin, il retombe.
  Au bout, le mode invité s'arrête (enregistré), « Mode invité désactivé » remplace le cadenas quelques secondes, puis la roue dentée revient.
  La combinaison n'est écrite que sur l'écran de l'entrée, jamais sur le front-end ni pendant la partie.
  Elle suit les boutons relevés à l'étape « Boutons » ; une MagnaSave non relevée est tenue par Ctrl gauche ou Ctrl droit d'un clavier (l'écran de l'entrée le dit), et les touches par défaut d'un clavier (Maj et Ctrl, gauche et droite) déverrouillent aussi tant qu'aucun autre bouton ne les a prises.
  Le premier bouton appuyé fait ce qu'il fait d'habitude (un flipper déplace la sélection d'un cran) ; les suivants, tenus avec lui, rien d'autre.
- **Dépannage** : sans les boutons (MagnaSave en panne), Cyber Pinball fermé, supprimer `mode-invite.json` du dossier des données.

**Portes d'entrée.**
Chaque façon d'agir sur le front-end porte un nom de `GUEST_DOORS` ([packages/core/src/guestmode.ts](../../packages/core/src/guestmode.ts)), ouverte ou fermée à l'invité : touches et boutons (`handleKey`, `app/src/frontend.ts`), clics (canal `action` : roue dentée, roue des tables), raccourcis globaux, fermeture d'une fenêtre, fichiers glissés (`library.handleAction`), Start sur chaque sorte de message (`MESSAGE_DOORS`), écrans de la gestion des tables (`GUEST_SCREENS` : la fiche et ses pages seulement) et actions de la fiche (`SheetAction` : chacune déclare sa porte).
Le compilateur exige une porte pour chaque sorte de message et chaque action de la fiche ; en mode invité, une action d'écran sans porte est cachée, si bien qu'une action nouvelle reste fermée tant qu'on ne l'a pas déclarée.
L'autopilote passe par les mêmes portes.
[guestmode.test.ts](../../packages/core/src/test/guestmode.test.ts) fixe les invariants : la liste des portes ouvertes (en ouvrir une demande de l'y écrire avec sa raison), chaque porte déclarée sert dans `app/src`, la fiche et les messages déclarent leurs portes, et **toute source d'entrées de `app/src`** (canal `ipcMain`, raccourci global, `before-input-event`, boutons du joystick) est relevée fichier par fichier : une nouvelle fait échouer le test tant qu'on n'a pas dit par quelle porte elle passe.
Le verrou, l'indice, la combinaison (boutons tenus, minuterie, relâchement, partie en cours) et l'enregistrement y sont testés aussi.

**Collection verrouillée.**
Une collection verrouillée décide seule des tables visibles et jouables, même vide ; une collection introuvable ne montre aucune table.
La Table surprise y tire dans la collection imposée, moins les tables exclues, et seulement parmi les tables marquées adaptées à la famille.

**Limites.**
Pendant une partie, les réglages en partie de Cyber Pinball (les deux MagnaSave : position du DMD, menu de VPX) sont fermés à l'invité (porte `game.settings`) ; VPX garde ses propres commandes : son menu (F12 au clavier) et ses réglages restent accessibles, et Exit quitte la partie comme d'habitude.
Le mode invité ne verrouille pas Windows (touche Windows, Alt+Tab, Ctrl+Alt+Suppr), ni l'assistant lancé à part depuis le lanceur.
