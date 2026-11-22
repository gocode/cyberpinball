# VPX 10.8.1-5436 patched Cyber Pinball

[English](README.md)

Cyber Pinball installe Visual Pinball X 10.8.1-5436 depuis son archive officielle, puis remplace son exécutable `VPinballX_BGFX64.exe` et son plugin PuP `plugins/pup/plugin-pup64.dll` par ceux-ci : la même version, reconstruite avec les correctifs de ce dossier.
Les autres plugins et les bibliothèques restent ceux de l'archive officielle.
Un autre VPX (version d'essai, VPX installé par l'utilisateur) n'est jamais touché.

Série de correctifs actuelle : « patched Cyber Pinball 4 ».
Le numéro de version reste 10.8.1.5436 (Cyber Pinball, les plugins et les tables s'y règlent) ; la version produit de l'exécutable, le journal de VPX et ses rapports de plantage affichent `af26b2d93-patched-cyberpinball-4`.

## Correctifs

- `01-cadence-fenetres-annexes.patch` : report sur la 5436 des commits [d73557d](https://github.com/vpinball/vpinball/commit/d73557d138475b3dda7ecd886decb0ca79450763) et [f832180](https://github.com/vpinball/vpinball/commit/f832180557271d7aa9652784376bc99c7c908ae5) de VPX (novembre 2026). La 5436 redessinait le backglass, le ScoreView et le topper à chaque image du playfield ; un écran annexe plus lent (50 ou 60 Hz) calait alors toute la partie sur sa fréquence. Chaque fenêtre annexe suit désormais la fréquence de son propre écran.
- `02-cadrage-garde-le-haut.patch` (Cyber Pinball, novembre 2026) : sur un écran 16:9, une table est 17 à 29 % trop étroite, et « Fit Table » (CabinetAutofitMode = 1) l'agrandissait jusqu'à remplir la largeur, quitte à couper le fond du plateau (sur Attack from Mars, la soucoupe sort de l'écran). Deux réglages s'y ajoutent, `[Player] CabinetAutofitKeepTop` et `CabinetAutofitMaxStretch` (aussi dans le menu de VPX, avec la hauteur des flippers) : le zoom s'arrête quand le fond du plateau arrive près du haut de l'écran (6 % sont gardés pour le décor du fond), les flippers à la hauteur choisie : ce sont l'apron, sous les flippers, et le vide sous la vitre au-dessus du fond qui sortent de l'écran, et le reste de la largeur est comblé par un étirement plafonné. Sans `CabinetAutofitKeepTop`, rien ne change.
- `03-pup-label-sans-verrou.patch` (plugin PuP) : un label PuP décodait son image (PNG, GIF animé) en gardant son verrou, que le rendu de chaque image et le script attendent. Un GIF plein écran de plusieurs Mo figeait ainsi la partie 200 à 300 ms à chaque affichage. Le décodage se fait désormais sans le verrou, et les images d'un GIF sont converties à ce moment-là plutôt qu'une à une pendant le rendu.
- `04-temps-gpu-au-journal.patch` (Cyber Pinball, novembre 2026) : chaque minute et en fin de partie, VPX écrit dans son journal le temps que met la carte graphique à dessiner une image (moyenne, médiane, 95e centile, maximum) et le temps disponible à la fréquence du playfield. Les pré-réglages de qualité de Cyber Pinball (mode Auto) s'en servent pour adapter les réglages graphiques à la machine. Rien d'autre ne change.

## Construire

`node scripts/vpx-corrige.mjs` (CMake et Build Tools 2022 avec le composant ATL).
Les sources de VPX sont celles du commit `af26b2d93`, les dépendances celles de son `platforms/config.sh`.
Le plugin PuP est lié aux DLL de l'archive officielle (SDL_image, SDL_ttf, pupdmd), dont les bibliothèques d'import sont tirées ; seuls leurs en-têtes et ceux de FFmpeg sont téléchargés.

## Licence

VPX est distribué sous GPLv3+ (et une licence dérivée de MAME pour une partie des fichiers), voir le fichier `LICENSE` joint.
Les sources complètes de ces fichiers (VPX au commit `af26b2d93`, les bibliothèques avec lesquelles ils sont construits, les correctifs et la recette) sont publiées ici : https://github.com/gocode/cyberpinball/releases/tag/sources-vpx-10.8.1-5436-patched-cyberpinball-4
