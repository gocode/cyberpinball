# Cyber Pinball — design system

Langage visuel de Cyber Pinball : tokens, composants et maquettes d'écrans, dans la direction artistique du 22 octobre 2026 (noir bleu-vert, vert signal, marque très espacée), avec un fond « verre fumé », une couverture rail-bille-flippers et des écrans recomposés.

## Ouvrir et régénérer

Ouvrir `index.html` : la page du design system (fondations, couleurs, typographie, espaces, 13 composants vivants avec leur code HTML, 5 écrans). `components/<Nom>/preview.html` montre un composant seul, à sa taille de référence. Ce sont des aperçus statiques, sans gestion des boutons de la borne. Les pages chargent Saira depuis Google Fonts ; sans réseau, elles retombent sur Segoe UI.

Depuis la racine du dépôt, avec Node 22 ou plus :

```powershell
node docs/design-system/src/construire.mjs
```

Il enchaîne `icones.mjs` (icônes, fond et `components/bundle.css`), `composants.mjs` (aperçus et notices), `tokens-css.mjs` (`tokens.css`) et `page.mjs` (`index.html`).

Sources, à modifier à la place des fichiers générés :

- `tokens.json` : couleurs, familles, tailles, espacements, rayons et halos.
- `src/base.css` : composants `.cp-*` ; les dernières déclarations, celles de la révision, font le rendu final.
- `src/fonds.css` : le fond « verre fumé ».
- `src/icones.mjs` : les 36 icônes (masques SVG).
- `src/composants.mjs` et `src/ecrans.mjs` : exemples des composants et composition des cinq écrans.
- `src/couverture.html` : la couverture.
- `src/page.mjs` : la page `index.html`.

## Principes de couleur

Fond `void #030807`, panneaux `surface #07110f`, contrôles `surface-raised #0c1a17`. Filet `line-strong #24504a`, lueur sarcelle douce. La lumière est statique et peu étendue.

Le vert `signal #8be23a` désigne le choix courant ou l’action principale. PINBALL dans la marque constitue l’exception identitaire. Les intertitres de groupe et l'état OK sont verts, comme dans la DA ; flèches, touches au repos et légendes ne le sont pas. Un seul contrôle porte `.is-focus` dans une maquette d’écran. Si le focus est sur Jouer, l’onglet ouvert n’est qu’un repère neutre.

Les états gardent un mot et un signe : coche + OK, triangle + À vérifier, croix + Bloquant. La gravité ne dépend jamais de la couleur seule : OK en `signal`, À vérifier en `warning` (ambre `#f2b33d`), Bloquant en `danger` (rouge `#ff6b6b`), chacun avec son signe et son mot. Une suppression conserve son verbe explicite, son icône et, dans le produit, sa confirmation. `meta #5fb4cf` reste réservé aux métadonnées.

L’orange `dmd` appartient uniquement à l’afficheur de repli. Ce n’est pas un second accent d’interface.

## Typographie et lisibilité

Famille : Saira. Le mot-symbole reste en capitales espacées, léger ; les titres d’écran sont en capitales, les titres de jeux conservent leur casse naturelle. Texte courant à 24 px ; titres des constats du diagnostic à 28 px ; **aucun texte sous 20 px** à l’échelle de référence.

**Polices :** les aperçus chargent Saira depuis Google Fonts. Pour l'application, qui doit marcher hors ligne, Saira (SIL Open Font License) sera embarquée comme les polices des replis, depuis le dépôt google/fonts (`ofl/saira`, police variable en graisse et en largeur), dans `app/renderer/polices/`. `src/base.css` déclare déjà `local("Saira")`, puis Segoe UI.

Contrastes calculés : `ink` sur `surface` 16,46:1 ; sur `surface-raised` 15,34:1 ; `ink-muted` sur `surface-raised` 7,59:1 ; `on-signal` sur `signal` 11,88:1. Ne jamais poser le blanc `ink` sur un aplat signal : son contraste n’est que de 1,38:1.

## Fond d’ambiance et média absent

`.fond-ambiance` habille l’espace disponible derrière les panneaux ; `.fond-media` encadre un emplacement vide. `.cp-art` est l’adaptation du même verre fumé aux médias des composants. Un média absent est nommé, sans faux visuel de table. Le cadre intérieur ne doit pas apparaître sur un média réellement chargé.

Ces fonds utilisent uniquement des dégradés statiques et des filets. Pas d’image à télécharger, de canvas, de flou animé, de bruit animé ou de calcul par image. Les couleurs d’un média réel ne sont pas contraintes par cette palette ; toute interface superposée à un média réel doit rester protégée par une surface opaque ou un voile suffisamment sombre, à vérifier sur une image blanche.

## Géométrie

Les valeurs sont définies pour un petit côté de 1080 px. Dans Electron, convertir n px en `n / 10,8 cqmin` dans le conteneur d’écran. À 4K, doubler les dimensions de référence, sans changer la composition. Les aperçus d’écran restent volontairement fixes ; la page `index.html` les réduit seulement pour les parcourir. Ne pas appliquer la conversion deux fois.

Marges extérieures 48 à 64 px, panneaux 32 à 40 px ; lignes de réglage de 68 à 76 px selon la densité. La fiche utilise deux rangées de trois onglets au lieu de réduire leurs libellés.

## États et interaction à intégrer dans le prototype

`.is-focus` représente le contrôle sur lequel agit l’appui ; `.is-active` / `.is-current` représentent une vue ouverte. Le produit doit les mettre à jour selon la navigation réelle. Dans une intégration interactive, employer des boutons, des liens et des onglets sémantiques, exposer l’état courant aux technologies d’assistance et synchroniser le focus DOM. Les spans des aperçus ne sont pas des composants interactifs prêts à livrer.

Pour la question de sortie, Start valide la réponse choisie ; Exit et l’expiration du délai poursuivent la configuration. Ne jamais implémenter un délai qui valide automatiquement une perte de données. La barre affichée est une illustration statique du mécanisme existant.

## Rendu et vérification

Depuis la racine du dépôt :

```powershell
npx electron docs/design-system/src/rendu.cjs
```

Chaque aperçu est rendu dans une fenêtre Electron hors écran, jamais montrée ; les captures vont dans `tmp/design-system/` (les grands écrans réduits pour tenir dans la fenêtre), et la console liste les pages qui débordent et les textes coupés. Les cadres qui masquent volontairement un décor (couverture, menu système) y apparaissent comme « coupés » : c'est attendu. La lecture à un mètre et les performances restent à vérifier sur la borne.
