[English](../manual/menu-icons.md) · Français · [Sommaire du manuel](../manuel.md)

## Icônes des menus

Chaque entrée de menu porte une icône qui la distingue, et chaque écran ouvert depuis le menu système reprend celle de son entrée devant son titre : on sait d'un coup d'œil où l'on est.
Les icônes ont été dessinées pour Cyber Pinball, sans police d'icônes ni ressource en ligne.

- **Un seul registre** : [app/renderer/icons.js](../../app/renderer/icons.js) dessine chaque icône une fois (`CYBER_ICONS`, géométrie SVG seule sur une grille de 24) et `cyberIcon(nom)` la pose dans la page.
  Chaque fenêtre le charge avant ses scripts ; le design system le lit aussi (`docs/design-system/src/icones.mjs`, planche « Icônes »).
  Les noms connus du code sont dans [packages/core/src/icons.ts](../../packages/core/src/icons.ts) (`ICON_NAMES`, type `IconName`).
- **Déclaratif** : une entrée choisit son icône par un champ `icon` — obligatoire sur `SystemItem` (menu système), facultatif sur `Action`, `Row` et `Built` (titre de l'écran) dans `app/src/library.ts` ; `WizardStep.icon` pour les étapes de « Configuration de la borne », `EssentialGroup.icon` pour les groupes des réglages de VPX.
  Un écran ouvert depuis le menu système qui ne déclare pas d'icône reprend celle de son entrée (catalogue, ajout de table, ROM, médias), sauf les écrans d'une table (fiche, diagnostic…), titrés du nom du jeu.
- **Dessin et tailles** : trait de 2 unités pour toute la famille (`theme.css`, `.icon`), couleur du texte.
  Pour un petit côté de 1 080 px : 30 px devant une entrée de menu, à 24 px du libellé et alignée sur sa première ligne ; 60 px devant un titre ; 38 px pour la roue dentée (zone cliquable de 72 px) ; 22 à 26 px dans les onglets et groupes des réglages ; jamais moins de 20 px.
- **États** : l'icône suit son libellé (sombre sur l'aplat vert, rouge au repos pour une action destructrice, sombre sur l'aplat rouge une fois choisie) ; la pastille « attend l'utilisateur » se pose en haut à droite de l'icône, comme sur la roue dentée.
- **Pas d'icône** devant une valeur, un choix de liste, une table ou une configuration : seulement devant ce qui ouvre ou fait quelque chose.
  « Retour » porte la flèche `back` dans les menus dont les entrées ont une icône.

**Ajouter une icône** : la dessiner dans la famille voulue de `icons.js` (éléments `path`, `circle`, `rect`… et leurs seuls attributs de géométrie, zone vive de 3 à 21), ajouter son nom à `ICON_NAMES`, la déclarer sur l'entrée, régénérer le design system (`node docs/design-system/src/construire.mjs`) et la regarder dans la planche, à 22, 30 et 60 px.

**Invariants** : [icons.test.ts](../../packages/core/src/test/icons.test.ts) (lancé par `npm test`) vérifie que le registre et `ICON_NAMES` ont exactement les mêmes noms, que chaque dessin n'est que de la géométrie dans le cadre de 24, que deux noms ne dessinent pas la même icône, que chaque page qui dessine une icône charge le registre avant ses scripts, qu'aucun écran ne dessine de SVG lui-même, et que les entrées de « Configuration de la borne » et les groupes des réglages ont chacun la leur.
À l'écran, le garde-fou de mise en page (`app/src/layout-check.ts`) signale une icône inconnue, plus petite que 20 px, ou la même pour deux entrées d'un menu (`data-icon-menu`).
