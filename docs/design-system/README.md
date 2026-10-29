[English](README.en.md) · Français

# Cyber Pinball — design system

Langage visuel de Cyber Pinball : tokens, composants et maquettes d'écrans, dans la direction artistique du 22 octobre 2026 (noir bleu-vert, vert signal, marque très espacée), avec un fond « verre fumé », une couverture rail-bille-flippers et des écrans recomposés.

## Ouvrir et régénérer

Ouvrir `index.html` : la page du design system (fondations, couleurs, typographie, espaces, 16 composants vivants avec leur code HTML, 10 écrans, dont « Ce qu’il manque pour jouer » en borne et au bureau, « Téléchargements » et le sélecteur de fichiers). `components/<Nom>/preview.html` montre un composant seul, à sa taille de référence. Ce sont des aperçus statiques, sans gestion des boutons de la borne. Les pages chargent Saira depuis Google Fonts ; sans réseau, elles retombent sur Segoe UI.

Depuis la racine du dépôt, avec Node 22 ou plus :

```powershell
node docs/design-system/src/construire.mjs
```

Il enchaîne `icones.mjs` (icônes, fond et `components/bundle.css`), `composants.mjs` (aperçus et notices), `tokens-css.mjs` (`tokens.css`) et `page.mjs` (`index.html`).

Sources, à modifier à la place des fichiers générés :

- `tokens.json` : couleurs, familles, tailles, espacements, rayons et halos.
- `src/base.css` : composants `.cp-*` ; les dernières déclarations, celles de la révision, font le rendu final.
- `src/fonds.css` : le fond « verre fumé ».
- `src/icones.mjs` : les icônes, lues dans le registre de l’application (`app/renderer/icons.js`, seul endroit où elles sont dessinées), changées en masques SVG.
- `src/composants.mjs` et `src/ecrans.mjs` : exemples des composants et composition des dix écrans.
- `src/couverture.html` : la couverture.
- `src/page.mjs` : la page `index.html`.

## Principes de couleur

Fond `void #030807`, panneaux `surface #07110f`, contrôles `surface-raised #0c1a17`. Filet `line-strong #24504a`, lueur sarcelle douce. La lumière est statique et peu étendue.

Le vert `signal #8be23a` désigne le choix courant ou l’action principale. PINBALL dans la marque constitue l’exception identitaire. Les intertitres de groupe et l'état OK sont verts, comme dans la DA ; flèches, touches au repos et légendes ne le sont pas. Un seul contrôle porte `.is-focus` dans une maquette d’écran. Si le focus est sur Jouer, l’onglet ouvert n’est qu’un repère neutre.

Les états gardent un mot et un signe : coche + OK, triangle + À vérifier, croix + Bloquant. La gravité ne dépend jamais de la couleur seule : OK en `signal`, À vérifier en `warning` (ambre `#f2b33d`), Bloquant en `danger` (rouge `#ff6b6b`), chacun avec son signe et son mot. Une suppression conserve son verbe explicite, son icône et, dans le produit, sa confirmation. `meta #5fb4cf` reste réservé aux métadonnées.

`dmd` est la couleur par défaut des points des afficheurs que Cyber Pinball dessine (DMD du menu, replis) : le vert signal de la marque, réglable dans le menu (« Couleur du DMD » : vert signal, sarcelle, encre claire, bleu glacier, ambre doux, orange plasma `#ff8a1f`, ou une couleur libre). Ce n’est pas un second accent d’interface. Ces afficheurs écrivent avec « Saira Points », police à points dessinée d’après Saira (`packages/core/src/dmdfont.ts`) : la marque y est empilée, CYBER un ton dessous et PINBALL au plein éclat, puisqu’un afficheur n’a qu’une couleur.

## Typographie et lisibilité

Famille : Saira. Le mot-symbole reste en capitales espacées, léger ; les titres d’écran sont en capitales, les titres de jeux conservent leur casse naturelle. Texte courant à 24 px ; titres des constats du diagnostic à 28 px ; **aucun texte sous 20 px** à l’échelle de référence, tel qu’on le voit : un texte réduit par une transformation (médaillon d’une roue, pulsation) compte à sa taille rendue, et le garde-fou de mise en page le mesure ainsi.

**Polices :** les aperçus chargent Saira depuis Google Fonts. Pour l'application, qui doit marcher hors ligne, Saira (SIL Open Font License) sera embarquée comme les polices des replis, depuis le dépôt google/fonts (`ofl/saira`, police variable en graisse et en largeur), dans `app/renderer/polices/`. `src/base.css` déclare déjà `local("Saira")`, puis Segoe UI.

Contrastes calculés : `ink` sur `surface` 16,46:1 ; sur `surface-raised` 15,34:1 ; `ink-muted` sur `surface-raised` 7,59:1 ; `on-signal` sur `signal` 11,88:1. Ne jamais poser le blanc `ink` sur un aplat signal : son contraste n’est que de 1,38:1.

## Fond d’ambiance et média absent

`.fond-ambiance` habille l’espace disponible derrière les panneaux ; `.fond-media` encadre un emplacement vide. `.cp-art` est l’adaptation du même verre fumé aux médias des composants. Un média absent est nommé, sans faux visuel de table. Le cadre intérieur ne doit pas apparaître sur un média réellement chargé.

Ces fonds utilisent uniquement des dégradés statiques et des filets. Pas d’image à télécharger, de canvas, de flou animé, de bruit animé ou de calcul par image. Les couleurs d’un média réel ne sont pas contraintes par cette palette ; toute interface superposée à un média réel doit rester protégée par une surface opaque ou un voile suffisamment sombre, à vérifier sur une image blanche.

## Géométrie

Les valeurs sont définies pour un petit côté de 1080 px. Dans Electron, convertir n px en `n / 10,8 cqmin` dans le conteneur d’écran. À 4K, doubler les dimensions de référence, sans changer la composition. Les aperçus d’écran restent volontairement fixes ; la page `index.html` les réduit seulement pour les parcourir. Ne pas appliquer la conversion deux fois.

Marges extérieures 48 à 64 px, panneaux 32 à 40 px ; lignes de réglage de 68 à 76 px selon la densité. La fiche utilise deux rangées de trois onglets au lieu de réduire leurs libellés.

Une liste seule (menu système, rubriques) part juste sous l’en-tête, avec le même écart sur chaque écran ; elle est centrée en largeur, jamais en hauteur. Une liste plus haute que sa zone défile : un filet `--line-strong` de 3 px à la référence marque le bord derrière lequel il reste des entrées, en haut comme en bas. Jamais de fondu sur une liste : la ligne du bord passerait pour désactivée. L’entrée choisie est toujours entière dans la vue.

Au menu des tables, ce qui arrive sans qu’on le demande (un ami qui se connecte, un téléchargement fini) passe par une seule notification à la fois (`Notification`), à gauche de la roue dentée, à côté de la pastille des amis en ligne : 64 px de haut, filet et icône dans la couleur du ton (bleu méta pour une information, vert pour une réussite), titre de 24 px et précision de 20 px chacun sur une ligne ; jamais sur le média ni sur la roue.

Une liste de contenu (jeux, médias, fichiers) à côté des actions de l’écran est une zone à part (`ListeContenu`) : un cadre, un bandeau qui ne défile pas avec la position du choix et le repère « Exit · Sortir de la liste » (« MagnaSave · Revenir à la liste » hors d’elle). Le cadre de la zone du choix s’éclaire en sarcelle, l’autre zone passe à 0,8 d’opacité ; le vert reste à l’élément choisi. Exit dans la liste ramène aux actions, MagnaSave bascule.

## États et interaction à intégrer dans le prototype

`.is-focus` représente le contrôle sur lequel agit l’appui ; `.is-active` / `.is-current` représentent une vue ouverte. Le produit doit les mettre à jour selon la navigation réelle. Dans une intégration interactive, employer des boutons, des liens et des onglets sémantiques, exposer l’état courant aux technologies d’assistance et synchroniser le focus DOM. Les spans des aperçus ne sont pas des composants interactifs prêts à livrer.

Pour la question de sortie, Start valide la réponse choisie ; Exit et l’expiration du délai poursuivent la configuration. Ne jamais implémenter un délai qui valide automatiquement une perte de données. La barre affichée est une illustration statique du mécanisme existant.

## Rendu et vérification

Depuis la racine du dépôt :

```powershell
npx electron docs/design-system/src/rendu.cjs
```

Chaque aperçu est rendu dans une fenêtre Electron hors écran, jamais montrée ; les captures vont dans `tmp/design-system/` (les grands écrans réduits pour tenir dans la fenêtre), et la console liste les pages qui débordent et les textes coupés. Les cadres qui masquent volontairement un décor (couverture, menu système) y apparaissent comme « coupés » : c'est attendu. La lecture à un mètre et les performances restent à vérifier sur la borne.
