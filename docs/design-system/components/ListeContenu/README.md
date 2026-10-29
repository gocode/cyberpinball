# ListeContenu

La liste de contenu d'un écran (jeux, médias, fichiers, téléchargements, bibliothèque d'un ami) : une zone à part des actions de l'écran, dans son cadre, avec son repère.

- Fournir : `.cp-zone` (`.is-active` quand le choix y est, `.is-idle` sinon) avec `.cp-zone-bar` puis la liste qui défile (`.cp-zone-list`, un `.is-focus` au plus). Le bandeau ne défile pas.
- Bandeau : à gauche la position du choix (« **17** / 37 ») ou, hors de la liste, le nombre d'éléments ; l'initiale `.cp-zone-letter` pendant un saut par lettre (flipper tenu sur une liste triée par nom) ; à droite le repère `.cp-zone-tag` : touche cerclée et effet, « Exit · Sortir de la liste » dans la liste, « MagnaSave · Revenir à la liste » sinon. Aucun intitulé de plus.
- Zone du choix : cadre `halo` et `halo-panel`. L'autre zone à 0,8 d'opacité (`.is-idle`, `.cp-menu.is-dimmed`) : distincte, jamais au point de paraître indisponible. Un seul focus : le vert reste à l'élément choisi ; le repère n'est jamais vert.
- Comportement (`packages/core/src/listzones.ts`) : Exit dans la liste ramène aux actions (l'entrée d'où l'on venait, sinon « Retour »), un second Exit quitte l'écran ; MagnaSave ou F6 bascule et retrouve la position quittée. La liste se décide par nature, jamais par longueur ; une liste d'options courte n'en est pas une.
- Pour : toute liste de contenu à côté d'actions. Pas pour un menu seul (`LigneMenu`).

Aperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.
