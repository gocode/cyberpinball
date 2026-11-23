# VPX 10.8.1-5436 patched Cyber Pinball

[English](README.md)

Cyber Pinball installe Visual Pinball X 10.8.1-5436 depuis son archive officielle, puis remplace son exécutable `VPinballX_BGFX64.exe`, son plugin PuP `plugins/pup/plugin-pup64.dll` et sa bibliothèque DOF `plugins/dof/dof64.dll` par ceux-ci : la même version, reconstruite avec les correctifs de ce dossier.
Les autres plugins et les bibliothèques restent ceux de l'archive officielle.
Un autre VPX (version d'essai, VPX installé par l'utilisateur) n'est jamais touché.

Série de correctifs actuelle : « patched Cyber Pinball 6 ».
Le numéro de version reste 10.8.1.5436 (Cyber Pinball, les plugins et les tables s'y règlent) ; la version produit de l'exécutable, le journal de VPX et ses rapports de plantage affichent `af26b2d93-patched-cyberpinball-6`.

## Correctifs

- `01-cadence-fenetres-annexes.patch` : report sur la 5436 des commits [d73557d](https://github.com/vpinball/vpinball/commit/d73557d138475b3dda7ecd886decb0ca79450763) et [f832180](https://github.com/vpinball/vpinball/commit/f832180557271d7aa9652784376bc99c7c908ae5) de VPX (novembre 2026). La 5436 redessinait le backglass, le ScoreView et le topper à chaque image du playfield ; un écran annexe plus lent (50 ou 60 Hz) calait alors toute la partie sur sa fréquence. Chaque fenêtre annexe suit désormais la fréquence de son propre écran.
- `02-cadrage-garde-le-haut.patch` (Cyber Pinball, novembre 2026) : sur un écran 16:9, une table est 17 à 29 % trop étroite, et « Fit Table » (CabinetAutofitMode = 1) l'agrandissait jusqu'à remplir la largeur, quitte à couper le fond du plateau (sur Attack from Mars, la soucoupe sort de l'écran). Deux réglages s'y ajoutent, `[Player] CabinetAutofitKeepTop` et `CabinetAutofitMaxStretch` (aussi dans le menu de VPX, avec la hauteur des flippers) : le zoom s'arrête quand le fond du plateau arrive près du haut de l'écran (6 % sont gardés pour le décor du fond), les flippers à la hauteur choisie : ce sont l'apron, sous les flippers, et le vide sous la vitre au-dessus du fond qui sortent de l'écran, et le reste de la largeur est comblé par un étirement plafonné. Sans `CabinetAutofitKeepTop`, rien ne change.
- `03-pup-label-sans-verrou.patch` (plugin PuP) : un label PuP décodait son image (PNG, GIF animé) en gardant son verrou, que le rendu de chaque image et le script attendent. Un GIF plein écran de plusieurs Mo figeait ainsi la partie 200 à 300 ms à chaque affichage. Le décodage se fait désormais sans le verrou, et les images d'un GIF sont converties à ce moment-là plutôt qu'une à une pendant le rendu.
- `04-temps-gpu-au-journal.patch` (Cyber Pinball, novembre 2026) : chaque minute et en fin de partie, VPX écrit dans son journal le temps que met la carte graphique à dessiner une image (moyenne, médiane, 95e centile, maximum) et le temps disponible à la fréquence du playfield. Les pré-réglages de qualité de Cyber Pinball (mode Auto) s'en servent pour adapter les réglages graphiques à la machine. Rien d'autre ne change.

- `correctifs-libdof/` (bibliothèque DOF, série 6) : la libdof de la 5436 (commit `eef645d9`) avec le report des commits [0383246](https://github.com/vpinball/libdof/commit/03832462f10d19b1795e2292646193ca39e51fbd) et [c79bcff](https://github.com/vpinball/libdof/commit/c79bcff5be61e3c10022d2e6fa25f207e038bc53) (partie `FinishUpdaterThread`) de libdof. En se déchargeant, la 5436 arrêtait une carte DudesCab une seconde fois, après sa vraie fermeture, et VPX plantait en se fermant (0xC0000005). Le destructeur de la DudesCab ne relance plus l'arrêt, et le fil de sortie d'un contrôleur est toujours attendu au lieu d'être abandonné. L'interface de la bibliothèque (`include/DOF/DOF.h`) ne change pas : le `plugin-dof64.dll` officiel la charge telle quelle.

## Construire

Le correctif `05-pov-sans-editeur.patch` protège l’import automatique des anciens cadrages POV : lors d’un lancement direct, aucun éditeur Windows n’existe et VPX tentait pourtant de rafraîchir ses propriétés, provoquant un accès mémoire interdit juste après `InitTablePostLoad`. Les champs numériques anciens vides ou illisibles sont également ignorés. Le fichier importé est nommé dans le journal.
Le banc automatisé `powershell -File scripts/banc-vpx-pov.ps1 -Vpx <dossier de VPX 5436>` vérifie six cas sur le bureau caché, avec une copie de la table de test livrée par VPX : sans POV, POV nommé, `autopov.pov`, champs anciens vides, illisibles et valides, avec contrôle des réglages exportés.

`node scripts/vpx-corrige.mjs` (CMake et Build Tools 2022 avec le composant ATL).
Les sources de VPX sont celles du commit `af26b2d93`, les dépendances celles de son `platforms/config.sh`.
Le plugin PuP est lié aux DLL de l'archive officielle (SDL_image, SDL_ttf, pupdmd), dont les bibliothèques d'import sont tirées ; seuls leurs en-têtes et ceux de FFmpeg sont téléchargés.
`dof64.dll` est compilée par MSVC comme dans VPX, liée de même aux DLL officielles de `plugins/dof` (libusb, libserialport, hidapi, libftdi) ; la recette refuse une DLL dont les exportations ou les bibliothèques chargées diffèrent de l'officielle.

## Licence

VPX est distribué sous GPLv3+ (et une licence dérivée de MAME pour une partie des fichiers), voir le fichier `LICENSE` joint ; libdof sous sa propre licence, jointe dans `plugins/dof/LICENSE-libdof`.
Les sources complètes de ces fichiers (VPX au commit `af26b2d93`, les bibliothèques avec lesquelles ils sont construits, les correctifs et la recette) sont publiées ici : https://github.com/gocode/cyberpinball/releases/tag/sources-vpx-10.8.1-5436-patched-cyberpinball-6
