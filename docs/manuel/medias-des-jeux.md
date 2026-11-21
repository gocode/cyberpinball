[English](../manual/game-media.md) · Français · [Sommaire du manuel](../manuel.md)

## Médias des jeux

Chaque jeu peut avoir ses médias de présentation : logo, vidéo du plateau, fronton, afficheur, topper, vidéo de chargement, musique, son de lancement, prospectus et règles.
Le front-end montre chacun sur l'écran prévu et au bon moment.
Quand un média manque, il montre à sa place un affichage par défaut dessiné par Cyber Pinball : jamais un écran vide, jamais le bureau Windows.

Les médias d'un jeu se rangent dans le dossier de sa table, sous-dossier `medias\`, et s'appellent `(Type) <nom du dossier>.ext`, comme le propose VPX 10.8.1 : `medias\(Backglass) Terminator 2 (Williams 1991).mp4`.
Le nom du `.vpx` convient aussi, pour un média propre à une version.
Le prospectus et les règles peuvent avoir plusieurs pages : `(GameHelp) <nom>.png`, puis `(GameHelp) <nom> 2.png`, `… 3.png`.
Aucun réglage par écran : l'écran de chaque média, ses proportions et sa rotation viennent du modèle de la borne.

| Type (fichier) | Dans le front-end | À quoi il sert | Où et quand il s'affiche | Formats | Sans fichier |
| --- | --- | --- | --- | --- | --- |
| `(Wheel)` | Logo | Identifie la table dans la liste du front-end, sur fond transparent. | Playfield : liste des tables ; mode attente | png, apng, webp, gif | le titre en texte stylisé |
| `(Playfield)` | Plateau | La table qui joue, en fond derrière la liste. | Playfield, assombri sous la liste ; mode attente | mp4, webm, m4v, ou une image | verre fumé sarcelle, discret, sans faux visuel de table |
| `(Backglass)` | Fronton | L'image ou l'animation du fronton du jeu. | Fronton : table choisie, chargement, mode attente ; en partie si VPX laisse l'écran libre | mp4, webm, m4v, ou une image | l'image allumée du `.directb2s`, sinon une carte : titre, fabricant, année |
| `(DMD)` | Afficheur | Animation de l'afficheur 4:1. | Afficheur étroit (4:1), aux mêmes moments que le fronton | comme le fronton | l'Afficheur large réduit, sinon le titre en points sur une grille 128 × 32 |
| `(FullDMD)` | Afficheur large | Animation 16:9 pour un afficheur large. | Afficheur large (16:9), aux mêmes moments | comme le fronton | l'Afficheur centré, sinon le titre en points |
| `(Topper)` | Topper | Le bandeau animé au-dessus du fronton. | Topper, aux mêmes moments | comme le fronton | logo animé et marque de Cyber Pinball, fabricant et année |
| `(Loading)` | Chargement | Vidéo jouée pendant que VPX charge la table. | Playfield, du Start à l'apparition de la partie : plein écran en borne, dans le cadre 9:16 au bureau | mp4, webm, m4v | écran de chargement de secours : marque, titre, fabricant, année, barre d'attente |
| `(Audio)` | Musique du jeu | La musique de la table choisie. | Haut-parleurs du fronton, tant que la table est choisie (« Musique des jeux », jouée par défaut) ; en attente si son son est réduit | mp3, ogg, m4a, flac, wav | la musique tirée de sa ROM ([Musique de la ROM](#musique-de-la-rom)), sinon celle de la borne, sinon le silence |
| `(AudioLaunch)` | Son de lancement | Un son court au lancement. | Haut-parleurs du fronton, une fois, au Start | comme la musique | rien (ou le son de la vidéo de chargement) |
| `(GameInfo)` | Prospectus | Une ou plusieurs pages de présentation du jeu. | Playfield, sur demande : fiche > « Prospectus », page par page | png, apng, webp, jpg, jpeg, gif, mp4 | une fiche générée depuis le `.info` : titre, fabricant, année, auteurs |
| `(GameHelp)` | Règles | Une ou plusieurs cartes de règles. | Playfield, sur demande : fiche > « Règles », page par page | comme le prospectus | les règles trouvées seules (carte et texte du `.vpx`, feuille de règles, vidéo), puis les commandes de la partie |

`(Other)`, `(RealDMD)` et `(RealColorDMD)` (Popper, PinballX) n'ont pas d'écran chez Cyber Pinball : ils sont lus, gardés et ignorés.
Les anciens formats de Popper (`flv`, `f4v`, `avi`, `mov`, `wmv`, `mpg`, `mpeg`) ne se lisent pas : le diagnostic les signale, l'import les laisse de côté.

Pour chaque écran, le front-end prend le premier média trouvé : `(Type) <nom du .vpx>`, `(Type) <nom du dossier>`, les noms fixes de VPinFE (`bg.png`, `wheel.png`, `table.mp4`…), l'image du `.directb2s` (fronton seulement), le **média commun de la borne** `<racine>\media\(Type).ext`, et enfin l'affichage par défaut.

### Ajouter des médias

- **Fiche d'une table > « Médias du jeu »** (le plus simple, aux boutons ou à la souris) : chaque média avec son rôle, l'écran et le moment où il s'affiche, un aperçu, et ce que le front-end montre aujourd'hui.
  On prend un fichier copié dans `<racine>\import` (depuis une clé USB), on le choisit sur ce PC ou on le glisse sur la fenêtre ; on remplace, on retire, on règle le demi-tour du plateau et le volume du jeu.
  Rien n'est écrit avant « Enregistrer », qui montre d'abord le plan.
  Voir « Gestionnaire : « Médias du jeu » ».
- **Avec la table** : une archive qui contient des médias rangés à la façon de PinUP Popper (`POPMedia\…\Wheel\<jeu>.png`), de PinballX ou de VPinFE est reconnue à l'ajout (« Ajouter une table ») ; les médias sont renommés `(Type) <dossier>` dans `medias\`.
  Un pack de médias seul, sans `.vpx`, complète une table installée.
  Voir « Import des médias ».
- **Depuis une installation de PinUP Popper ou de PinballX** : menu système > « Tables » > « Migration » > « Reprendre les médias » (de PinUP Popper / PinballX).
  Tout est copié, l'installation d'origine n'est pas modifiée.
- **À la main** : copier le fichier dans `medias\` sous son nom `(Type) <nom du dossier>.ext`.
  Le front-end le montre aussitôt sur chaque écran, sans redémarrer (voir « Changements en direct »).
  Le diagnostic (fiche > « Diagnostiquer et réparer ») signale un nom qui ne correspond pas au jeu, un fichier rangé hors de `medias\`, un format illisible, des proportions qui ne collent pas à l'écran, et propose le renommage.
- **Médias communs de la borne** : un fichier `<racine>\media\(Type).ext`, sans nom de jeu, sert à tous les jeux qui n'ont pas ce média : un topper aux couleurs de la salle, une musique d'ambiance, une vidéo de fond.
  Il passe avant l'affichage par défaut.

- **En ligne, à la demande** : « Chercher les médias » prend dans VPinMediaDB tout ce qu'il a pour le jeu, avec un plan à valider (« Médias depuis VPinMediaDB »).
  Pour un média précis, « Voir les propositions » montre toutes les versions trouvées, en ligne et sur la borne, et l'on choisit sur les aperçus (« Propositions de chaque média et recherche approfondie »).

### Prospectus et règles

Fiche d'une table > « Prospectus » ou « Règles » (le nombre de pages est écrit sous l'action) : la page occupe l'écran du playfield, tournée pour le joueur, entière et sans déformation.
Les flippers passent à la page précédente ou suivante, Start à la suivante puis revient à la fiche après la dernière, Exit revient à la fiche ; à la souris, les boutons sous la page font de même.
Une page vidéo (`mp4`) tourne en boucle, muette.
Sans fichier, le prospectus est une fiche générée depuis le `.info` (carte de fronton avec le titre, puis fabricant, année, auteurs, version, description).
Code : `sheetPages` ([packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)), écran `pages` de `app/src/library.ts`, rendu `renderPages` de `app/renderer/library.js`.

**Règles trouvées seules**.
Les règles ne se limitent plus aux cartes que l'utilisateur a rangées : Cyber Pinball cherche lui-même ce qui explique le jeu, et le montre avant les commandes, qui sont presque toujours les mêmes.
Ordre des pages :

1. les cartes de règles de la table (ses médias `(GameHelp)`) ; sans elles, la carte que l'auteur a rangée dans le `.vpx`, lue sans rien écrire dans le dossier de la table ;
2. le texte de règles que l'auteur a rangé dans le `.vpx` (`TableRules`), sans la carte qu'il désigne ;
3. une feuille de règles publique : celle de The Pinball Primer que le catalogue VPS donne pour le jeu (champ `tutorialFiles`), sinon celle de Pinball Rule Sheets (pinballrulesheets.com), reconnue dans la liste du site par le fabricant et le titre entier (édition ignorée ; Stern avant 1999 est Stern Electronics, un autre fabricant).
   Le texte est découpé en pages d'environ 1 100 caractères, chaque partie sous son titre (« (suite) » quand elle continue) ; il se réduit pour tenir, jamais sous 20 px à 1080 ; 80 pages au plus, la suite se lit sur le site ;
4. une vidéo d'explication sur YouTube que VPS connaît (un tutoriel passe avant une présentation) : sa vignette, son titre, ses auteurs et un QR code pour la regarder sur le téléphone ;
5. les commandes de la partie, toujours en dernier, avec ce que chaque source a donné : trouvée, en recherche, ou absente et grisée avec sa raison (aucune pour ce jeu, pas de réseau, jeu non reconnu dans le catalogue VPS, catalogue pas encore téléchargé).

**Guide du jeu**.
Pour quelques jeux, un guide rédigé pour Cyber Pinball passe avant tout le reste : une page « Le but », puis un objectif par page, et « Bonus et astuces ».
Chaque page montre le plateau vu de dessus (l'image à plat rangée dans le `.vpx`, sinon un plateau dessiné d'après ses murs, rampes, bumpers, cibles et trous), les coups numérotés à leur place, les tirs depuis les flippers ou le lanceur, et dans les marges l'étiquette de chaque coup de la page ; le texte dessous dit quoi faire et ce que ça rapporte.
Les coups sont désignés par le nom de leur élément dans le `.vpx` : leurs positions sont lues dans la table du joueur (`readVpxPlayfield`).
Le guide est reconnu par le jeu VPS ; une autre recréation du même jeu, où moins des trois quarts des éléments désignés existent, ne l'a pas (des pastilles mal placées seraient pires que rien).
L'écran du guide est dessiné à taille fixe, en hauteur (1 080 × 1 860) ou en largeur (1 760 × 960) selon la place, puis mis à l'échelle ; il prend tout l'écran du livret, les actions restent dessous.
Dix guides : Back to the Future, Terminator 2, Game of Thrones, Guardians of the Galaxy, Star Trek, The Walking Dead, The Goonies, The Matrix, City Hunter, 2001 - A Space Odyssey ; rédigés par Claude d'après le script, la feuille de règles et la carte de chaque table, à relire (« À vérifier » de chaque guide, dans les notes de recherche).
Code : [packages/core/src/tableguide.ts](../../packages/core/src/tableguide.ts), guides dans `packages/core/src/guides`, rendu [app/renderer/guide.js](../../app/renderer/guide.js).
Tests : [tableguide.test.ts](../../packages/core/src/test/tableguide.test.ts).

Chaque page dit sa source sous le texte : la table, ou le site, son adresse, et « en anglais » quand l'interface ne l'est pas.
Les feuilles sont écrites par des communautés et ne déclarent aucune licence : Cyber Pinball n'en livre aucune.
Elles sont lues sur la machine du joueur quand il ouvre la fiche, gardées dans `<données>\cache\regles` (relues après 30 jours, la liste de pinballrulesheets.com après 7 ; sans réseau, la copie gardée sert ; une page absente n'est pas redemandée avant le délai).
La vignette de la vidéo va dans le cache des médias (`regles-video-<id>.jpg`).
La recherche part en arrière-plan à l'ouverture de la fiche, une fois par table (de nouveau si le `.vpx` change) ; le livret se complète à son retour.
Le jeu VPS est celui que la table désigne, sinon la recherche approfondie quand elle est sûre (`tableGame`), ou, entre des pistes à égalité, la seule du fabricant et de l'année que la table donne (Terminator 2 de Williams 1991 plutôt que « JP's Terminator 2 », qui a la même ROM) ; seule la base VPS déjà téléchargée sert, ouvrir les règles ne lance aucun téléchargement de la base.
À la souris, « Commandes de la partie » saute à la dernière page.
Code : [packages/core/src/tablerules.ts](../../packages/core/src/tablerules.ts) (lecture des pages, rapprochement, cache), [app/src/table-rules.ts](../../app/src/table-rules.ts) (ordre des pages, sources), `renderHelp` de `app/renderer/library.js`.
Tests : [tablerules.test.ts](../../packages/core/src/test/tablerules.test.ts).


### Dans les fenêtres du front-end

Sur l'écran des tables, chaque fenêtre du front-end montre les médias de la table choisie (ailleurs, voir « Hors de l'écran des tables : l'affichage par défaut »).
La recherche suit cet ordre (`resolveMedia`, [packages/core/src/medias.ts](../../packages/core/src/medias.ts)) : nom du `.vpx`, nom du dossier, noms de VPinFE, image du `.directb2s` (fronton), médias communs de la borne, puis affichage par défaut.

| Écran | Média | Affichage |
| --- | --- | --- |
| playfield, en fond du front-end | `(Playfield)` | `cover`, assombri sous la liste ; tourné pour que les flippers du média tombent au bord des flippers de la borne (un fichier en portrait a les flippers en bas, un fichier en paysage à droite, comme chez Popper et dans VPinMediaDB) |
| liste du front-end | `(Wheel)` | logo au-dessus du titre de la table choisie et dans une case de taille fixe devant chaque titre de la liste (l'initiale du titre sans logo) ; dans la roue, le médaillon de chaque table. Sans logo, le médaillon du centre écrit le titre (trois lignes au plus) et les autres portent l'initiale du jeu en grand : réduit à la place d'un voisin, un nom passait sous le plancher de 20 px (13,6 px en borne). Nom et initiale ne se voient jamais ensemble : quand un médaillon quitte le centre, le nom s'éteint en 60 ms, avant d'être réduit sous 20 px, puis l'initiale s'allume (`fillWheelItem` et `placeWheelItem`, `app/renderer/frontend.js` ; `.wheel-initial`, `frontend.css`) |
| backglass | `(Backglass)`, sinon l'image allumée du `.directb2s` | `fill` : étiré à tout son écran, comme pendant la partie (B2S de VPX, Pinball FX3) ; une image 4:3 sur un écran 16:9 n'est pas entourée de bandes noires |
| DMD | `(FullDMD)` sur un écran FullDMD, `(DMD)` sur un DMD seul ([Écran du DMD](plugins-de-vpx-backglass-pup-et-dmd.md#écran-du-dmd--fulldmd-ou-dmd-seul) ; sans réponse, selon les proportions de sa zone), l'autre sinon | `contain` sur fond noir ; autour d'une bande, du noir |
| topper | `(Topper)` | `contain` sur fond noir |

- **Zones** : chaque rôle d'un écran partagé (fronton et bande DMD, DMD incrusté dans le playfield) a son propre média dans sa zone.
- **Lecture** (`app/renderer/media.js`) : vidéos en boucle, muettes, sauf celle du fond du playfield quand le réglage « Son des vidéos du front-end » le demande (voir « Son du front-end ») ; fondu enchaîné de 280 ms au changement de table ; médias des deux tables voisines de chaque côté préchargés, et une vidéo quittée gardée prête un moment (huit éléments au plus, dont quatre vidéos) ; fond du playfield en pause sous une superposition opaque (aide, fiche, message) ; toutes les vidéos en pause quand la fenêtre est cachée.
  Une navigation rapide n'empile rien : une couche qui attend encore sa première image est abandonnée.
- **Affichage par défaut** sans média ou sur erreur de lecture : les composants de `app/renderer/fallback.js` (tâche T3) dès qu'ils sont chargés par `frontend.html` (`window.CyberFallback`), sinon un affichage minimal : le titre, le fabricant et l'année sur fond noir, réduits jusqu'à tenir dans leur zone, et rien sur le fond du playfield.
  Le topper dessiné porte la marque et le **titre du jeu** (deux lignes au plus), pas le fabricant et l'année, déjà sur le fronton et dans le front-end.
- **Fond de partie**, réglage « Médias pendant la partie » de l'écran « Médias, son et attente » (menu système ; Start passe au choix suivant, enregistré dans `<données>\medias.json`) : **figés** par défaut (première image, dessinée une fois sur un canvas, sans décodeur vidéo ouvert pendant la partie), **animés** (le playfield et les écrans que VPX occupe restent figés), ou **éteints** (noir et titre en discret).
  Voir « Chargement et partie ».
- **Protocole `cyber-media://`** ([app/src/media-protocol.ts](../../app/src/media-protocol.ts), règles dans [packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)) : seul chemin des fenêtres vers les fichiers (la CSP de `frontend.html` n'autorise rien d'autre pour les images et les vidéos).
  Il ne sert qu'un fichier de média (extension du catalogue) posé directement dans `medias\` d'une table connue, dans `<racine>\media\` ou dans le cache des images du `.directb2s` (`<données>\cache\medias\`), plus, un par un, les fichiers que « Médias du jeu » montre en aperçu avant de les ranger (dossier d'import, fichier choisi sur ce PC, `allowPreview`) ; les affichages par défaut sont dessinés par la fenêtre, sans fichier : sous-dossier, sortie par `..`, flux de données alternatif, lien symbolique et autre extension sont refusés (403).
  Il répond aux requêtes partielles (206), dont la lecture des vidéos a besoin.
  L'adresse change avec la date et la taille du fichier : un média remplacé sous le même nom n'est pas repris du cache.
- **Changements en direct** ([packages/core/src/mediawatch.ts](../../packages/core/src/mediawatch.ts)) : un média ajouté, remplacé ou retiré (n'importe quel type : logo de la roue, plateau, fronton, DMD, FullDMD, topper, vidéo de chargement, musique, son de lancement, `.directb2s`) et une table ajoutée, renommée ou supprimée se voient aussitôt sur chaque écran, sans redémarrer, quel que soit le chemin : « Médias du jeu », « Chercher les médias », propositions, ajout par « Récupérer », fichier copié à la main.
  Un seul mécanisme : le front-end guette `<racine>\tables` et `<racine>\media` (`fs.watch` récursif, natif sous Windows) ; 400 ms après la dernière écriture (une copie en fait une rafale), il relit les tables (`.vpx`, dossier ajouté ou renommé) ou oublie ses médias résolus (`MenuMedias.invalidate`, le `.directb2s` est relu en gardant l'image d'avant à l'écran, sans repli intercalé), puis renvoie son état à toutes les fenêtres.
  Ce que VPX écrit à côté des tables pendant la partie (`.ini`, journaux) ne relance rien.
  Dans la roue, une table déjà à l'écran garde sa place : seul son contenu change, le nouveau logo remplaçant l'ancien (ou le titre) une fois chargé ; la sélection reste sur la même table.
  L'adresse des fichiers changeant avec leur date et leur taille, aucun écran ne garde l'ancienne image : le cache des images du `.directb2s` est daté de la même façon et celui des dimensions vérifie la date et la taille, il n'y a donc rien à réparer au démarrage.
  Un dossier absent au démarrage (`<racine>\media`) est guetté dès qu'il existe (à la relecture des tables) ; sans guet possible (lecteur réseau), les médias résolus expirent au bout de 10 s.
- **Image du `.directb2s`** : extraite en tâche de fond, une table à la fois, au premier passage sur la table ; le repli s'affiche en attendant, puis l'image le remplace en fondu.
- **Erreurs de lecture** (vidéo indécodable, image abîmée) : remontées par la fenêtre au processus principal avec le code de l'erreur, écrites dans la console et dans le journal unique `<données>\logs\medias-erreurs.json` (format décrit dans « Le diagnostic des médias »), une entrée par fichier ; une entrée disparaît quand le fichier change.
  Le diagnostic les signale.
- **Tests** : [mediaview.test.ts](../../packages/core/src/test/mediaview.test.ts) (adresses, dossiers autorisés, rotation pour chaque bord des flippers, DMD ou FullDMD, `.directb2s`, réglage, journal des erreurs, CSP et branchements du rendu), [mediawatch.ts](../../packages/core/src/test/mediawatch.test.ts) (guet des dossiers, nouveau fichier après un changement de chaque type, `.directb2s` relu sans repli, roue du vrai rendu qui affiche un logo ajouté à une table déjà à l'écran, sans bouger).

### L'écran des tables au bureau, de 5:4 à 16:9 et plus

Au bureau (zone du playfield en largeur, `html.menu-desktop`), le média de la table est dans un cadre 9:16 à gauche, sur toute la hauteur ; la roue ou la liste, et les informations, sont à droite.
Cotes en pixels de référence (`--u`, la hauteur de la zone vaut 1080) ; le cadre du plateau ne change jamais (x 64 → 627).
Avec une roue à bandeau (Médaillons, Bandeau, Minimaliste, Arche), le fronton du jeu est à droite, la roue en bas, et la disposition suit la largeur de l'écran (`app/renderer/frontend.css`, `html.menu-desktop[data-menu-band]`) :

- **16:9 et plus** : bandeau de 1236 de large (`--b` = 1236 / 1080 `--u`), à 34 du bord droit ; fronton 16:9 au-dessus, aligné sur le haut du plateau, la roue mordant sur son bas ; la barre d'aide est alignée sur le bas du plateau.
- **De 16:10 à 16:9** : tout le groupe se réduit à la place laissée à droite du plateau (bandeau de `min(1236, W − 684)`, son bord gauche à 650).
  Les alignements restent : haut du fronton sur celui du plateau, barre d'aide sur son bas ; la roue mord moins sur le fronton.
- **Plus étroit que 16:10** (3:2, 4:3, 5:4) : **disposition compacte**, deux zones.
  À droite du plateau, une colonne de 675 à 64 du bord ; le fronton 16:9 en haut, le bandeau entier en bas, tous deux de la largeur de la colonne ; entre eux, le vide reste sombre (de 26 en 3:2 à 313 en 5:4).
  Avant, le fronton et le bandeau gardaient leurs cotes du 16:9 et recouvraient presque tout le cadre du plateau ; seule une bande du plateau restait visible (le 16:10 se recouvrait aussi).
- **Textes du bandeau réduit** : chaque corps garde un plancher (`max()`), plus gros que dessiné quand le bandeau rétrécit : 20 px dès le 16:10 ; en disposition compacte, 26 pour le titre (23 sur la plaque des Médaillons, pour qu'il y tienne avec fabricant · année), 23 pour un titre long, fabricant · année et le compteur, 22 pour l'aide (20 px ne font que 14 pixels sur un écran de 768 de haut).
  Fabricant · année s'empilent au-dessus du compteur, le titre au-dessus d'eux, sans se toucher.
  En disposition compacte, le titre tient sur une ligne (« … »), sur la largeur de la colonne pour Bandeau et Minimaliste (l'Arche et les Médaillons gardent leur place dessinée : élargi, le titre croisait les médaillons qui glissent le long des pieds de l'Arche) ; le nom du médaillon du centre, sur deux lignes au plus ; le compteur des Médaillons ne passe jamais à la ligne.
  Le nom et l'initiale des médaillons ont aussi leur plancher (`--floor-text`, calculé hors de la roue), y compris quand le nom quitte le centre ou y arrive.
- **Rien ne bouge** d'une table à l'autre : toutes ces cotes ne dépendent que de la taille de l'écran.
  En 16:9 et plus, et pour la liste des titres, le rendu est le même au pixel près qu'avant.
- **Preuves** : [cadres-menu.test.ts](../../packages/core/src/test/cadres-menu.test.ts) vérifie que chaque cadre du front-end est rangé dans sa zone et que le garde-fou voit deux zones qui se recouvrent ; [plancher-textes.test.ts](../../packages/core/src/test/plancher-textes.test.ts) refait le calcul des planchers de la roue.

### Hors de l'écran des tables : l'affichage par défaut

Les écrans de la borne (fronton, afficheur DMD ou FullDMD, topper, et le fond du playfield) ne montrent les médias d'une table que quand on parle d'elle.
Hors de l'écran des tables, rien de la dernière table de la roue ne reste à l'écran ni ne s'entend : chaque écran passe à l'**affichage par défaut de Cyber Pinball**, en silence, et le retour à la roue rend ses médias et sa musique à la table choisie.

| Écran ouvert | Écrans de la borne | Son |
| --- | --- | --- |
| Écran des tables, mode attente | médias de la table choisie (ou montrée) | sa musique, ou le son de sa vidéo |
| Chargement, partie | médias de la table jouée (voir « Chargement et partie ») | lancement, puis VPX |
| Fiche d'une table et ce qui s'en ouvre (« Médias du jeu » et ses propositions, prospectus, règles, « Fichiers », « Ce qu'il manque pour jouer », « Diagnostiquer et réparer », « Modifier les informations », réglages de VPX de cette table, le sélecteur de fichiers et le clavier à l'écran ouverts depuis ces écrans) | médias de **cette** table : c'est d'elle qu'on parle, et l'on voit ce qu'on règle | sa musique |
| Partie échouée (« La partie n'a pas pu se dérouler ») | médias de la table jouée | sa musique |
| Menu système et tout ce qui s'en ouvre (ajout, catalogue, téléchargements, ROM, réglages, configuration de la borne, langue, mises à jour…), réglages de VPX généraux, aide des commandes, messages, confirmation de sortie | affichage par défaut | rien |

- **Affichage par défaut** (`defaultMediaView`, [packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)) : celui de chaque écran sans titre de jeu, qui dessine la marque dans la direction artistique (`app/renderer/fallback.js`, fond noir sarcelle, filets vert signal) : fronton à la couverture de la marque (« CYBER » au-dessus de « PINBALL » en vert signal, Saira légère élargie et très espacée, l'illustration de la DA à droite, voir [Fronton et DMD de la marque](#fronton-et-dmd-de-la-marque)) ; afficheur DMD avec la marque empilée dans sa police à points ; FullDMD avec la marque empilée dans son cadre de lampes (DMD du front-end vivant : la marque, PRESS START et l’horloge, voir [DMD du front-end](#dmd-du-front-end)) ; topper avec le logo et la marque ; fond du playfield en verre fumé.
  Aucun fichier de table n'est lu, aucune vidéo ne tourne ; l'afficheur suit son écran (DMD seul ou FullDMD).
  Fond sombre dès la première image : jamais de blanc à la bascule.
- **Règle** (`screensTable`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)) : chaque phase du front-end dit de quelle table elle parle, dans un tableau exhaustif (une nouvelle phase ne compile pas sans y être déclarée).
  Le menu système ne garde une table que pour un écran qui la déclare : les écrans d'une table (fiche, prospectus, modification, diagnostic, suppression) la portent, un écran décrit la donne à son ouverture (`openCustom(build, at, table)` dans `app/src/library.ts`), une saisie ou un message garde celle de l'écran d'où il s'ouvre.
  Tout nouvel écran qui ne dit rien prend l'affichage par défaut.
- **Essais** : le relevé des couches (`cyberEtat()`) dit « marque » pour l'affichage par défaut sans table, « repli » (valeur interne) pour celui d'une table sans ce média.
- **Tests** : [ecrans-par-defaut.test.ts](../../packages/core/src/test/ecrans-par-defaut.test.ts) (chaque phase, chaque écran, composant du rendu pour chacun, branchements de `frontend.ts`).

### Son du front-end

Le son du front-end sort d'une seule fenêtre, celle du playfield (`app/renderer/menu-audio.js`).
Le processus principal décide quoi jouer à chaque moment (`menuSound`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)) ; tout se règle dans **Menu système > « Tables » > « Son et mode attente »** (`app/src/menu-settings.ts`), enregistré dans `<données>\medias.json` et appliqué aussitôt.

| Moment | On entend | Réglage (défaut) |
| --- | --- | --- |
| Navigation, fiche de la table, partie échouée | la musique du jeu choisi, `(Audio)` (sinon celle tirée de sa ROM, puis celle de la borne, `<racine>\media\(Audio).*`), en boucle | « Musique des jeux » : **jouée** par défaut, pour que la roue ne soit jamais muette à l'installation (à couper pour une borne silencieuse dans une pièce de vie) ; « Volume de la musique » (60 %) |
| Navigation, jeu sans musique ou musique coupée | le son de la vidéo du fond du playfield | « Son des vidéos du front-end » (40 % ; 0 % : muettes) |
| Chargement | le son de lancement, `(AudioLaunch)`, une fois ; sans lui, le son de la vidéo de chargement | « Volume du lancement » (80 %) |
| Partie | rien : tout se tait en fondu dès que la fenêtre de jeu de VPX apparaît | — |
| Attente | comme en navigation, pour la table montrée | « Son en attente » : **coupé** par défaut, ou réduit (30 % du volume) |

- **Un seul son à la fois** : la musique du jeu, sinon le son de la vidéo du plateau ; jamais les deux.
  Un écran qui fait écouter des sons (propositions de musique, [Sons de la table](#sons-de-la-table)) fait taire le front-end tant qu'il est ouvert.
  Les vidéos du fronton, de l'afficheur (DMD ou FullDMD) et du topper sont **toujours muettes**, à dessein : plusieurs vidéos sonores en même temps feraient une cacophonie, et c'est aussi le réglage d'usage de PinUP Popper.
  Les vidéos de VPinMediaDB n'ont d'ailleurs aucune piste son (`table.mp4` et `dmd.mp4` vérifiés sur la borne) : le son d'un jeu y est un fichier à part, sa musique (`audio`, environ 650 jeux sur 1 150), rangée en `(Audio)`.
  Un jeu sans musique dont la vidéo du plateau n'a pas de son reste donc **silencieux dans le front-end**, quel que soit « Son des vidéos du front-end », même si son afficheur s'anime (cas de *Guardians of the Galaxy* sur la borne de référence : ni `(Audio)`, ni son dans `(Playfield)` ou `(FullDMD)`, et pas de musique sur VPinMediaDB).
  Pour l'entendre : lui donner une musique (fiche > « Médias du jeu » > « Musique du jeu » : « Sons de la table » pour en prendre une dans son PuP-Pack, voir [Sons de la table](#sons-de-la-table), ou un fichier `medias\(Audio) <dossier>.mp3`), ou poser une musique de la borne `<racine>\media\(Audio).mp3`, jouée pour tous les jeux qui n'en ont pas ; « Musique des jeux » doit être « jouée ».
  Une table à ROM sans musique reçoit d'elle-même celle de sa ROM ([Musique de la ROM](#musique-de-la-rom)).
- **Volume d'un jeu** : chaque volume est multiplié par le volume relatif du jeu (fiche > « Médias du jeu » > « Volume de ce jeu », `CyberPinball.medias.volume` du `.info`), sans dépasser le maximum.
  Un jeu à 50 % joue sa musique à 30 % quand le réglage est à 60 %.
- **Enchaînements** : au changement de table, l'ancienne musique s'éteint en fondu (700 ms) et la nouvelle ne démarre que si la table reste choisie 350 ms : faire défiler la liste ne joue rien.
  Le son d'une vidéo suit son fondu enchaîné.
  Au lancement, la musique s'éteint et le son de lancement part.
- **Sortie** : celle du fronton dans le modèle de la borne (étape « Son » de l'assistant ; c'est aussi celle de la musique de VPX, `SoundDeviceBG`), sinon celle du plateau, sinon la sortie par défaut de Windows.
  Elle est retrouvée parmi les sorties de Chromium par son nom Windows (suffixe « (vid:pid) » des sorties USB ignoré), puis musique, son de lancement et vidéos y sont envoyés (`setSinkId`).
  Sortie introuvable : la sortie par défaut.
  Les fenêtres du front-end ont pour cela les permissions `media` et `speaker-selection` et la lecture sans geste de l'utilisateur (`autoplayPolicy`), comme l'assistant.
  **Tout le son de Cyber Pinball** prend cette sortie, pas seulement celui du front-end : la sortie par défaut de Windows n'est pas forcément reliée à la borne (sur un PinCab, souvent un écran HDMI sans haut-parleurs ; par exemple, la roue et le lancement sonnaient sur la borne, mais pas les sons proposés dans « Médias du jeu »).
  Les sons et vidéos des écrans de la bibliothèque y sont envoyés dès leur création (`CyberMenuAudio.route`, `app/renderer/library.js`), et tout élément audio ou vidéo de la fenêtre qui se met à jouer sans y être passé y est renvoyé (événement `play`, en capture).
  Les pages web de la fenêtre « Récupérer » (YouTube, extraits) aussi, cadre par cadre (`audioSinkScript`, `packages/core/src/audiosink.ts`, joué à chaque `did-frame-finish-load`) : Electron n'a pas de sortie par fenêtre.
  Ses vues cachées, et celles de la conversion des médias, restent muettes.
- **Bureau Windows** (fenêtres réduites) : **plus aucun son de Cyber Pinball**, puis tout reprend au retour.
  Le mode bureau coupe le son de chaque page de l'application (`webContents.getAllWebContents`, `setAudioMuted`) : fenêtres du front-end, mais aussi le lecteur du juke-box et toute autre vue sans fenêtre propre, et une page ouverte pendant le bureau naît muette (`web-contents-created`).
  Au retour, le son revient aux seules pages qu'il a coupées : celles déjà muettes (hors écran, casque, vues cachées) le restent.
  Auparavant, seule la musique du front-end se taisait d'elle-même (page cachée) et le juke-box continuait de jouer au bureau.
- **Hors écran**, toute fenêtre de l'application est muette (`createWindow`, `app/src/offscreen.ts`) : un essai sans opérateur ne fait aucun bruit.
  L'autopilote relève après chaque étape ce qui aurait joué (`CyberMenuAudio.status()` : fichier, volume, lecture, sortie, son de la vidéo) et ce que montre chaque écran (`cyberEtat()` : phase, position, table montrée en attente, et pour chaque couche de média l'élément affiché, vidéo en lecture ou en pause, image, image figée ou repli) dans `son.txt`, à côté des captures.
- **Tests** : [menumoments.test.ts](../../packages/core/src/test/menumoments.test.ts) (réglages et valeurs écrites à la main, volumes, son de chaque moment, sortie du front-end, médias sonores résolus sur le disque, branchements du rendu, fenêtres muettes hors écran), [sortie-audio.test.ts](../../packages/core/src/test/sortie-audio.test.ts) (invariant : tout script du rendu qui crée un son le route, toute vue de page web est muette ou routée ; son proposé de « Médias du jeu » sur la sortie de la borne dans le vrai rendu ; script des pages web).

### Sons de l'interface

Onze sons ponctuent le front-end, par-dessus la musique : quatre bruits de flipper, un carillon, un tintement, un signal, le souffle de l'ouverture et les trois musiques des badges et du niveau, sans jamais la couper ni la baisser (`app/renderer/ui-sounds.js`).
Le registre, ce qui déclenche chaque son et la règle qui décide s'il joue sont dans [packages/core/src/uisounds.ts](../../packages/core/src/uisounds.ts) (`UI_SOUNDS`, `uiSoundCue`).

| Son | Quand | Source et licence |
| --- | --- | --- |
| Clic de solénoïde (`solenoid`) | une table voisine dans l'écran des tables (boutons gauche et droit, ou clic sur la roue) | synthèse WebAudio écrite pour Cyber Pinball (choc métallique filtré, corps sourd de la bobine, retour du plongeur) ; licence du code de Cyber Pinball, aucun enregistrement |
| Pièce qui tombe (`coin`) | Start sur « Jouer » : lancement d'une partie (pas le réglage de l'affichage) | synthèse WebAudio (rebonds d'un disque de métal, modes inharmoniques, chute dans la caisse) ; même licence |
| Knocker (`knocker`) | au retour d'une partie où un score est entré au tableau d'honneur de la table (`VPReg.stg`, voir « Records ») | synthèse WebAudio (marteau sur la caisse en bois, résonance du meuble) ; même licence |
| Coup de bobine (`coil`) | lancement en cinéma : l'instant où VPX prend la main (sa fenêtre de jeu au premier plan, voir [Lancement en cinéma](#lancement-en-cinéma)) | synthèse WebAudio (un « tchoum » sec et mat de 125 ms : contact de bruit filtré, corps sourd de 145 à 95 Hz, pointe de métal vers 650 Hz) ; même licence |
| Carillon d'invitation (`invite`) | un ami invite à une partie en direct, dans le front-end comme pendant une partie (voir « Partie en direct » dans [Amis](amis-le-reseau-des-bornes.md#communauté--le-réseau-des-bornes)) | synthèse WebAudio (trois notes de cloche qui montent, la, do dièse, mi, à 110 ms d'écart, avec leurs partiels de cloche ; 0,6 s, sans réverbération) : le seul son musical du registre, loin des chocs mécaniques des tables, il se reconnaît par-dessus la musique de VPX ; même licence |
| Tintement de la partie entre amis (`news`) | une nouvelle de la partie entre amis, dans le front-end comme pendant une partie : un invité accepte ou décline, un joueur quitte, la partie est finie (voir « Partie entre amis » dans [Notifications de l'écran des tables](notifications-de-l-ecran-des-tables.md#notifications-de-lécran-des-tables)) | synthèse WebAudio (deux notes de cloche douces qui montent d'une quarte, mi puis la, à 120 ms d'écart, deux fois moins fortes que le carillon et sans son attaque de métal ; 0,45 s, sans réverbération) : de la famille du carillon, mais une nouvelle, pas un appel ; même licence |
| Signal d'un ami (`friend`) | un ami vient de se connecter, dans le front-end comme pendant une partie ; une fois par ami en un quart d'heure, jamais pour une reconnexion dans la tolérance de présence (voir « Partout, même en partie » dans [Notifications de l'écran des tables](notifications-de-l-ecran-des-tables.md#notifications-de-lécran-des-tables)) | synthèse WebAudio (une seule note douce qui glisse vers le haut, de 520 à 780 Hz en 70 ms, avec un soupçon d'octave ; 0,25 s, sans réverbération) : ni cloche ni choc, elle ne se confond ni avec le carillon ni avec le tintement ; même licence |
| Souffle de l'ouverture (`intro`) | l'ouverture au démarrage (et « Voir l'ouverture »), quand ses animations partent ; pas quand une musique d'ouverture a été choisie, qui a la parole | synthèse WebAudio (un souffle filtré qui monte avec l'étincelle, de 400 à 5 200 Hz en 1,25 s, puis à l'ignition un accord doux et vitré, la, mi, si, do dièse, sur un grave qui descend ; 3,1 s, sans réverbération) ; daté par le processus principal (`hitAt` = départ des animations + `INTRO_TIMELINE.ignition`), il part 1,25 s avant l'ignition, compté sur l'horloge des animations et non à l'arrivée du message, une fois la sortie réveillée et son retard retranché : l'accord tombe sur l'éclair du plateau ; même licence |
| Tintement d'un badge (`badge`) | un badge commun reçu, au retour sur l'écran des tables, calé sur son animation (voir [Niveaux et badges](niveaux-et-badges.md#niveaux-et-badges)) | synthèse WebAudio (un court souffle, puis à l'arrivée du badge un arpège de cloches en modulation de fréquence, do, mi, sol, do, sur une nappe douce ; de petits tics pendant le défilement des XP ; 4,2 s, réverbéré) ; même licence |
| Fanfare d'un badge (`badge-rare`) | un badge rare, épique ou légendaire reçu, au retour sur l'écran des tables, calé sur son animation | synthèse WebAudio (un souffle qui monte, un impact grave à l'arrivée du badge, un arpège, puis les accords fa, sol, do pendant le texte ; des tics pendant le défilement des XP ; 5,6 s, réverbéré) ; même licence |
| Passage de niveau (`level-up`) | le niveau monte, pendant le moment d'un badge ou seul ; la musique de la table et le son de la vidéo du plateau se taisent le temps du moment | synthèse WebAudio (une fanfare : un impact grave et l'accord de do avec un arpège qui monte, un accord de sol en appel, puis le grand accord de do tenu, sa basse et ses cloches ; 4 s, réverbérée) ; même licence |

- **Réglages** : **Menu système > Tables > « Son et mode attente »** : « Sons de l'interface » (joués par défaut ; Start coupe ou rétablit, et fait entendre le clic) et « Volume des sons de l'interface » (50 % par défaut ; le choix fait entendre la pièce).
  Gardés dans `<données>\medias.json` (`uiSounds`, `uiSoundsVolume`).
- **Jamais pendant une partie** : le processus principal ne demande aucun son pendant la partie ni en mode attente (`uiSoundCue`) ; la fenêtre, de son côté, refuse tout son tant que l'état dit « partie en cours », fait taire celui qui sonne encore et ferme son contexte audio : aucun flux ouvert sur la sortie pendant que VPX joue.
  La pièce tombe pendant le chargement, avant que VPX ne prenne les écrans.
  Seule exception, le son du **passage de relais** (`handover` dans `UI_SOUNDS` : le coup de bobine seul) : demandé à l'instant où VPX prend la main, il part au tout début de la partie et y finit de sonner (125 ms), puis le contexte audio se ferme ; la fenêtre ne l'accepte que pour `coil`, même si un autre son se disait « de relais ».
  Seconde exception, le son d'un **appel** (`call` dans `UI_SOUNDS` : le carillon d'invitation seul) : une invitation d'un ami attend une réponse, il sonne une fois pendant la partie ; la fenêtre ne l'accepte que pour `invite`.
  Troisième exception, les sons des **notifications qui se montrent aussi pendant la partie** (`notice` dans `UI_SOUNDS` : le tintement et le signal d'un ami) : chacun sonne avec sa notification, une fois, sauf « Masquer les notifications pendant les parties » (Menu système > Communauté) ; la fenêtre n'accepte que `invite`, `news` et `friend`.
  Tous suivent le réglage et le volume des sons de l'interface : coupés, ils se taisent aussi.
- **Sortie** : celle du son du front-end (voir [Son du front-end](#son-du-front-end)), passée par `menu-audio.js` ; le contexte audio se ferme quatre secondes après le dernier son.
- **Défilement rapide** : le même son ne repart pas avant 45 ms ; chaque table passée claque, sans mitraille.
- **Licence** : aucun extrait de vrai flipper ni son de droit incertain ; chaque son est calculé à la volée par WebAudio, sans fichier.
  Une recette ajoutée doit l'être aussi, ou venir d'un son CC0 dont la source est notée dans `UI_SOUNDS`.
- **Ajouter un son** : son identifiant dans `UI_SOUND_IDS`, sa fiche (nom, déclencheur, source, licence) dans `UI_SOUNDS`, sa recette dans `RECIPES` de `ui-sounds.js`, l'appel `playUiSound('<id>')` dans `app/src/frontend.ts`, et sa ligne dans ce tableau.
  Le test refuse un son sans recette, sans déclencheur ou absent du manuel.
- **Records** : le knocker sonne au retour d'une partie quand un score est entré au tableau d'honneur de la table.
  Les records sont lus avant le lancement et au retour (`readTableRecords`, `newRecords`, [packages/core/src/highscores.ts](../../packages/core/src/highscores.ts), la même source que le DMD du front-end) dans ce que VPX 10.8.1 garde pour la table : `<dossier de la table>\user\VPReg.stg`, où les tables de VPW et la plupart des tables originales enregistrent `HighScore1..N` et leurs initiales.
  **Pas couvert** : les tables PinMAME dont la ROM tient elle-même ses records (`nvram\<rom>.nv`, une image brute de la mémoire du jeu, à lire avec la carte de chaque ROM) ; pour elles, le knocker ne sonne pas.
  Sans lecture avant la partie (fichier absent, illisible, ou plusieurs tables dans le même fichier sans nom qui les départage), rien n'est comparé et rien ne sonne : jamais de record supposé.
- **Hors écran** les fenêtres sont muettes ; `CyberUiSounds.status()` dit ce qui aurait joué (son, volume) et si la fenêtre est muette, relevé dans `son.txt` par l'autopilote (champ `interface`).
- **Tests** : [uisounds.test.ts](../../packages/core/src/test/uisounds.test.ts) (rien ne joue coupé, à 0 %, en attente ou pendant une partie, des deux côtés ; recette, déclencheur et ligne du manuel pour chaque son ; knocker branché sur les records d'avant et d'après la partie ; retour de chaque sous-écran de « Médias, son et attente » sur sa ligne).

### Chargement et partie

Ce que montre chaque écran du lancement à la fin de la partie (`momentScreen`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts) ; rendu dans `app/renderer/frontend.js`) :

| Moment | Playfield | Autres écrans |
| --- | --- | --- |
| Chargement (du Start à l'apparition de la fenêtre de jeu de VPX) | en borne, la vidéo `(Loading)` du jeu seule, plein écran et tournée d'après le bord des flippers ; au bureau, la même dans le cadre 9:16 du front-end, à gauche, et l'encart du titre et des commandes de la partie à sa droite ; sans elle, l'écran de chargement de secours à sa place (`fallback.js` : marque, titre, fabricant, année, barre d'attente) | les médias du jeu, animés, jusqu'à ce que les fenêtres de VPX les recouvrent |
| Partie | première image du fond du playfield, sous VPX | écran que VPX **n'occupe pas** : selon « Médias pendant la partie » (figés par défaut, animés, éteints) ; écran qu'il **occupe** (fronton du `.directb2s`, DMD de PinMAME, PuP) : figé, il ne se voit pas et ne doit rien coûter |

- **Écran de chargement** (`loadingScreen`, `app/renderer/frontend.js`).
  **En borne** (zone du playfield en hauteur, `html.menu-cab`), le plateau se prête au média de chargement : il occupe tout l'écran, seul, sans titre, sans « Chargement de la table… » ni commandes.
  Sans média, l'écran de chargement de secours le remplace, plein écran, sans son libellé (`fallback.js`, option `label: false`).
  Seule exception, le réglage de l'affichage en partie (fiche > « Régler l'affichage en partie ») garde son aide-mémoire, les boutons du menu de VPX (`loadingKeys.display`), en bandeau sur le média ou sous la barre d'attente du repli.
  **Au bureau** (`html.menu-desktop`), le média de chargement (ou son repli) prend la place de celui du front-end, dans le cadre 9:16 à gauche (531 × 944 en x 80, y 92, pour un petit côté de 1080) ; à droite, un encart unique (`loadingCard`) reprend les cotes du cadre : même haut, même hauteur, même chant, 80 du bord de l'écran, et 60 d'écart de chant à chant, celui du cadre au bord de l'écran.
  Il contient, dans le flux, le titre (64, ou 48 pour un titre long ; deux lignes au plus), fabricant · année, « Chargement de la table… » et sa barre d'attente en vert signal, puis, après un filet, les commandes de la partie ; le vide qui reste passe sous elles.
  Les commandes (`fitLoadingCard`) prennent la disposition la plus lisible qui tienne sans rien rogner : deux colonnes (au moins 440 de large chacune) sans touche coupée sur deux lignes, sinon une colonne, sinon deux colonnes aux touches coupées, au corps de 24, 22 puis 20 (plancher du design system) ; puis un encart compact (marges de 32, titre à 48) ; en dernier recours seulement, un corps sous le plancher, plutôt qu'une commande cachée (une douzaine de boutons de joystick dans une fenêtre en 5:4).
  La marque reste à sa place, en haut à gauche.
  La composition est refaite si la fenêtre change de forme.
  Garde-fou de mise en page (`app/src/layout-check.ts`, `html.loading-phase`) : en borne, aucun texte de l'interface sur le média ; au bureau, l'encart ne recouvre pas le cadre, chants compris, et le repli est posé exactement dans le cadre.
  Tests : [chargement.test.ts](../../packages/core/src/test/chargement.test.ts) (vrai rendu sous linkedom, cotes de `frontend.css`).
- **Chargement qui tarde** ([packages/core/src/loadingprogress.ts](../../packages/core/src/loadingprogress.ts)).
  Passé 8 s après le Start (`LOADING_SLOW_MS`) sans que la table soit à l'écran, le chargement du bureau le dit, dans son encart : l'étape **réellement observée** (« Cyber Pinball prépare la partie », « VPX est lancé : il charge la table » une fois le processus parti, « VPX a ouvert ses fenêtres : la table finit de charger » dès qu'une fenêtre de VPX paraît avant celle du jeu, `onWindows` de `launcher.ts`), le temps écoulé (« depuis 12 s », compté par le rendu chaque seconde) et comment arrêter (« Ctrl+Maj+K ou Exit : arrêter »).
  Aucun pourcentage, aucune barre qui avancerait au temps : rien n'est estimé.
  L'étape remplace « Chargement de la table… » dans l'encart, le temps et l'arrêt sous la barre.
  **En borne, rien** : le playfield garde le média de chargement seul, sans commandes ni étape (le garde-fou refuse toujours tout texte sur le chargement en borne).
  Exit, une fois les 8 s passées, et Ctrl+Maj+K à tout moment du chargement arrêtent le lancement, par la porte de l'arrêt forcé (`game.force-stop`, ouverte à l'invité) : avant le lancement de VPX, il n'est pas lancé ; après, il se ferme (fermeture polie, puis forcée après 5 s) ; la roue revient, sans message d'échec ni partie comptée.
  Le journal dit « Lancement : la table n'est pas à l'écran 8 s après le Start (…) » et « Lancement : arrêté pendant le chargement (…) ».
  Hors écran, `CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS` fait tarder la partie simulée.
  Tests : [chargement-lisible.test.ts](../../packages/core/src/test/chargement-lisible.test.ts).
- **Écrans occupés** : dès que la fenêtre de jeu apparaît, puis toutes les 2 s, la pile des fenêtres de Windows est relue (`occupiedRoles`) : un rôle est occupé quand une fenêtre d'un autre processus couvre au moins la moitié de sa zone (l'écran entier, ou sa part d'un écran partagé : bande DMD sous le fronton, DMD incrusté) au-dessus de la fenêtre de Cyber Pinball.
  La console le dit : « Partie : écrans occupés par VPX : backglass, dmd. »
- **Focus** : rien de tout cela ne montre une fenêtre ni ne la met au premier plan ; seul l'état envoyé aux fenêtres du front-end change, et elles restent derrière celles de VPX (gardien des écrans).
- **Partie simulée** (essais hors écran seulement) : `CYBERPINBALL_PARTIE_SIMULEE=<rôles occupés>` (« backglass,dmd », ou vide) remplace VPX par une fausse partie (`simulateVpx`, `app/src/launcher.ts`) : chargement, partie de 10 s avec l'autopilote, retour au front-end, sans rien lancer ni prendre de raccourci global.
  À l'écran, la variable est ignorée.

### Ouverture au démarrage

Quand Cyber Pinball s'ouvre, chaque écran de la borne joue son animation d'ouverture, une seule fois, puis **garde sa dernière image** (le plateau, lui, continue en boucle, très discrètement) ; le premier bouton (ou un clic) affiche la roue.
Un bouton pendant la lecture passe l'ouverture.
Réglage **Menu système > Tables > « Son et mode attente » > « Ouverture au démarrage »** : jouée par défaut, ou coupée (le front-end s'ouvre droit sur la roue).
Gardé dans `<données>\medias.json`, champ `intro`.
Code : [packages/core/src/intro.ts](../../packages/core/src/intro.ts) (réglages, fichiers, rythme, vues), [app/renderer/intro.js](../../app/renderer/intro.js) et `intro.css` (les animations), [app/src/intro-menu.ts](../../app/src/intro-menu.ts) (l'écran de réglages).

| Temps depuis le départ | Plateau | DMD / FullDMD | Fronton | Topper |
| --- | --- | --- | --- | --- |
| 250 – 1 700 ms | une étincelle monte du bas de l'écran le long d'un fil de lumière ; à 1 250 ms, ignition au cœur : éclair, trait anamorphique, onde, et une trentaine de fils de lumière se déploient en fuseau | mise sous tension : points au hasard (DMD) ou un tour du cadre de lampes (FullDMD), puis la bille traverse l'afficheur de bas en haut (950 ms) | noir | noir |
| 1 250 – 3 100 ms | des impulsions parcourent les fils, qui ralentissent sans s'arrêter ; la marque se forme dans une poussière lumineuse, du centre vers les bords (1 950 ms) | la marque se dessine derrière un trait de balayage (1 350 ms) ; FullDMD : PRESS START (2 500 ms) | l'illustration s'allume en vacillant comme ses lampes, puis la marque lettre par lettre | un trait de lumière le traverse (2 300 ms) et laisse le logo et la marque |
| 3 400 – 4 100 ms | un reflet passe sur la marque | un reflet passe sur les points de la marque | un reflet passe sur la marque | un reflet passe |
| ensuite | la boucle, sans saut depuis la dernière image : les fils du fuseau continuent de tourner, très lentement, et la poussière lumineuse dérive sur trois profondeurs (les lointaines plus fines, plus floues et plus lentes), avec un léger balancement ; « Appuyez sur un bouton pour choisir une table » paraît (4 300 ms), bat deux fois et reste | dernière image | dernière image | dernière image |

- **Quand** : au démarrage seulement, quand le front-end arrive sur la roue (`introAtStartup`) ; pas sur un message à traiter (VPX absent, boutons à refaire, aucune table), ni au choix d'une configuration, ni quand le front-end se relance lui-même (langue, configuration : option `--sans-ouverture`), ni sous l'autopilote des essais (sauf `CYBERPINBALL_OUVERTURE=1`).
  Les animations partent ensemble quand toutes les fenêtres du front-end sont prêtes (au plus 5 s après leur ouverture) : avant, du noir.
- **Les animations de Cyber Pinball font partie de l'application** : elles sont dessinées par le rendu (CSS, SVG, points ; le plateau par WebGL2 à pleine résolution, la marque en texte par-dessus), dans chaque écran, à toutes ses proportions, tournées pour le joueur sur le plateau, jusqu'à la fin du fondu qui les retire (la rotation est portée par l'animation, `.media-fallback.facing-player`, pas par la phase de la page : rien ne passe un instant en paysage au premier bouton) ; aucun fichier ne les porte, rien ne peut les effacer.
  Le DMD de la borne joue celle de l'afficheur 4:1 ou celle du FullDMD, selon son écran.
  Le plateau joue l'ouverture « Soie » de la maquette validée (11/11/2026) : les mêmes formules, les mêmes courbes, les mêmes instants, tracés par la carte graphique (WebGL2, environ 6 ms par image en 4K ; le Canvas 2D de la maquette en coûtait 160 et saccadait), avec la cadence adaptative de la première ouverture (le canevas perd un quart de sa taille, jusqu'à 1 920 points, si la carte ne suit pas) ; sans WebGL2, le même dessin en Canvas 2D, à 1 920 points au plus.
  La taille du fuseau est plus serrée et sa torsion plus forte que dans la maquette, pour que les fils se croisent au centre, et un fil sur six est vert signal (sarcelle à la taille, vert vers les bords), comme dans la première ouverture.
  Quarante-six fils de lumière en fuseau se tissent depuis le bas (0,1 à 2,4 s), une étincelle monte jusqu'à la taille du fuseau (1,2 à 2,4 s), l'ignition anamorphique s'ouvre au centre (2,4 s, un éclair aplati, la ligne d'horizon, un éclat sur tout l'écran), « CYBER PINBALL » paraît en s'écartant et en se précisant (2,5 à 3,4 s) ; l'invite paraît sous le fuseau à 3,9 s (`timeline.hint`) et respire entre 40 et 85 %.
  Le dessin est mesuré en unités d'un plateau de 1080 × 1920 : au bureau (plateau en largeur), l'unité suit la hauteur, le fuseau reste au centre, la ligne d'horizon et la poussière vont d'un bord à l'autre ; seule une image ou une vidéo d'ouverture du fronton choisie par le joueur y prend sa place, plein écran.
  « Redémarrer Cyber Pinball » (menu système) rejoue l'ouverture comme un démarrage ; les relances après une langue ou une configuration la sautent (`--sans-ouverture`).
  Rythme écrit une fois (`INTRO_TIMELINE`), envoyé aux fenêtres avec leur état : l'ignition du plateau allume le fronton et la marque du DMD (2,4 s), la bille traverse le DMD pendant que l'étincelle monte.
  Au bout, seul le plateau continue : les fils tournent lentement et la poussière dérive sur trois profondeurs, à la taille de canevas de l'animation (aucun saut de netteté), à 30 images par seconde au plus, 20 puis 15 si la carte graphique ne suit pas, arrêtée sous le voile de nuit et quand la fenêtre est cachée.
- **Vos images, vidéos et musique** : pour chaque écran (Plateau, Fronton, Topper, Afficheur (DMD), Afficheur large (FullDMD)), « Choisir une image ou une vidéo… » (sélecteur de fichiers, ou fichier glissé sur l'écran) copie le fichier dans `<racine>\media` sous `(IntroPlayfield)`, `(IntroBackglass)`, `(IntroTopper)`, `(IntroDMD)`, `(IntroFullDMD)` (mp4, webm, m4v, png, apng, webp, jpg, gif) ; un fichier posé là à la main sert aussi.
  Une vidéo se joue une fois et garde sa dernière image (la boucle n'est que celle de l'animation de Cyber Pinball : votre fichier n'est jamais animé ni relancé) ; une image paraît en fondu ; le plateau est tourné d'après le bord des flippers, comme son média.
  Un fichier illisible laisse place à l'animation de Cyber Pinball.
  « Musique de fond » (`(IntroAudio)` : mp3, ogg, m4a, flac, wav) joue en boucle jusqu'au premier bouton, au volume de la musique, indépendante des animations et de « Musique des jeux » ; sans elle, une vidéo d'ouverture du plateau garde son son (au volume du son des vidéos), les animations de Cyber Pinball sont muettes.
- **Revenir à l'animation de Cyber Pinball** (par écran) ou **« Tout revenir aux animations de Cyber Pinball »** (sans musique) ne supprime rien : votre fichier reste dans `<racine>\media`, l'écran le dit (« gardé, prêt à reprendre ») et « Votre fichier : … » le reprend.
  Un fichier remplacé par un autre part à la corbeille de la racine (`<racine>\trash\<date> Ouverture`), jamais effacé.
- **« Voir l'ouverture »** la joue tout de suite sur tous les écrans ; un bouton revient aux réglages (« Appuyez sur un bouton pour revenir aux réglages »).
- **Pendant l'ouverture** : la roue n'est pas encore là, les écrans ne parlent d'aucune table (phase `intro` de `screensTable`) ; ni DMD vivant, ni mode attente, ni son de l'interface ; les constats brefs (configuration reconnue, mise à jour installée) attendent la roue.
  Une borne laissée sur l'ouverture est libre pour l'arrêt de l'horaire.
- **Essais** : le relevé `cyberEtat()` dit `ouverture` (numéro, partie, chaque scène montée avec son instant et si elle est au bout, invite posée).
  Tests : [intro.test.ts](../../packages/core/src/test/intro.test.ts) (réglages, fichiers, rangement vers la corbeille, rien n'efface les animations, démarrage, déroulé, vues, son, boutons, vrai rendu : noir avant le départ, scène de chaque rôle, vidéo jouée une fois sans relance, invite).

### Lancement en cinéma

Au Start sur « Jouer », le lancement se joue comme une ouverture de film, sur tous les écrans de la borne : le logo du jeu s'allume au centre du plateau et s'envole vers le fronton, une tache de lumière traverse le DMD, le logo se pose sur le fronton et y attend ; quand VPX prend la main, un coup de bobine sonne et tout s'efface.
Réglage « Lancement en cinéma » de **Menu système > Tables > « Son et mode attente »** : joué par défaut ; Start le coupe (le chargement redevient celui d'avant : ni logo, ni passage sur le DMD, ni coup de bobine) ou le rétablit (le coup de bobine se fait entendre).
Gardé dans `<données>\medias.json`, champ `cinema`.
Le réglage de l'affichage en partie (fiche > « Régler l'affichage en partie ») n'a pas de cinéma, comme il n'a pas de pièce.

| Temps depuis le Start | Plateau | DMD (vivant) | Fronton |
| --- | --- | --- | --- |
| 0 – 240 ms | le logo paraît au centre, sur le média de chargement ; une onde brève part de lui | le titre de la table, la bille au bout du rail | son média |
| 240 – 340 ms | il recule d'un cran, comme une bille tirée par le lanceur | la bille tremble d'un point | |
| 340 – 740 ms | il file vers le haut (le fronton) et sort de l'écran | | |
| 660 – 900 ms | le média de chargement, seul | un disque lumineux de 9 points traverse l'afficheur de bas en haut, puis un éclat de 40 ms | le fronton s'assombrit (800 – 1 080 ms) |
| 840 – 1 200 ms | | le titre et la bille qui roule (le chargement) | le logo entre par le bas, dépasse à peine, se pose ; une onde à la pose (1 200 – 1 600 ms) |
| ensuite | | | le logo attend, un halo respire derrière lui |
| VPX prend la main | VPX recouvre l'écran | VPX prend l'afficheur | coup de bobine ; logo et voile s'effacent en 240 ms |

- **VPX n'attend jamais l'animation.**
  La chorégraphie part au Start et vit dans les fenêtres du front-end déjà ouvertes : animations CSS (`frontend.css`, « Lancement en cinéma ») et animation `lancement` du DMD vivant.
  Le processus principal n'en garde qu'un état (`LaunchCinema`, [packages/core/src/cinema.ts](../../packages/core/src/cinema.ts)), posé au Start, relu par chaque fenêtre avec son état (`viewFor` : champ `cinema`), sans attente ni minuteur : VPX part au même moment qu'avec le réglage coupé (après l'écran de chargement, `CYBERPINBALL_LOADING_MS`, 2,5 s par défaut), ce que la console dit à chaque partie, avec ce qui a pris ce temps (« Lancement : VPX lancé 2731 ms après le Start (écran de chargement 2500 ms, préparation 224 ms ; lancement en cinéma joué). » : la préparation, ce sont les écrans relus, le PuP-Pack et l'habillage FullDMD ; il ne reste rien d'autre).
  Si VPX prend la main au milieu de la chorégraphie, elle s'arrête là : ce qui n'était pas encore parti ne part plus.
- **Le passage de relais est un signal réel**, jamais un délai : le lanceur ([app/src/launcher.ts](../../app/src/launcher.ts), `onForeground`) relit à chaque tour (250 ms) la fenêtre au premier plan ; dès que la fenêtre de jeu de VPX la tient, le coup de bobine part, une fois par lancement (`LaunchCinema.handover`).
  Si Windows ne lui donne jamais le premier plan, il ne sonne pas.
  Le logo et le voile s'effacent, eux, dès que la fenêtre de jeu paraît (état « partie »), d'ordinaire dans le même tour.
- **Synchronisation des écrans** : chaque fenêtre compte depuis l'heure du Start (`startedAt`) ; une fenêtre qui pose la chorégraphie en retard la reprend au bon moment.
  Le rythme est écrit une fois (`CINEMA_TIMELINE`, cinema.ts) ; la feuille de style et le DMD le suivent, ce que vérifie le test.
- **Où** : sur le plateau, la couche `#cinema`, tournée comme le front-end (le haut est le fronton, d'après le bord des flippers) ; en borne, le logo ne fait que passer (moins d'une seconde), puis le média de chargement reste seul, comme le veut l'écran de chargement.
  Au bureau, il part du cadre 9:16 du média et en sort par le haut ; l'encart du titre et des commandes ne bouge pas.
  Sur le fronton, sa zone (sa propre fenêtre, ou sa part d'un écran partagé).
- **Replis** : sans logo (ou logo illisible), le médaillon de la roue, sombre et cerclé de chrome, avec le titre (trois lignes au plus).
  Sans fronton, le logo s'envole quand même et sort du plateau : rien ne l'attend ailleurs, le chargement reste le même.
  DMD classique ou absent : pas de passage.
  Sons de l'interface coupés : pas de coup de bobine, le reste se joue.
- **Jamais d'écran clair** : aucune fenêtre n'est ouverte pour le cinéma ; tout se joue dans les fenêtres du front-end, sur leurs fonds sombres, et le fondu ne touche que la couche du cinéma.
- **Dessin** : allumage sans rebond, une seule petite décélération à la pose, ondes brèves et fines, voile du fronton à 64 %, halo de tenue calme ; le DMD dans sa matrice orange (disque de 9 points, cœur 14, traînée de 10 points, éclat local à 15 seulement).

### Médaillons vivants : Juke-box et Communauté

Les médaillons du Juke-box et de la Communauté sont animés (choix du mainteneur, 13/11/2026).
Leur intérieur est dessiné en direct dans un canevas, sous l'anneau chromé commun ([app/renderer/medaillons-vivants.js](../../app/renderer/medaillons-vivants.js), `CyberMedaillons`) :

- **Juke-box, « Onde »** : trois fils Soie (vert signal, sarcelle, violet) ondulent en fuseau autour du rond à la note ; une étincelle court le long du fil vert.
- **Communauté, « Montée »** : le même rond, avec le joueur vert ; derrière lui montent des bulles de discussion violettes, bleues ou vertes, qui portent un emoji (amitié, compétition, scores) ou trois points.
  Les emojis viennent de la police de couleur de Windows (Segoe UI Emoji) ; aucun drapeau, que Windows affiche en deux lettres.
- **Collections, « Éclat »** : le même rond, avec l'étoile vert signal des favoris.
  Derrière, de petites étoiles violettes, bleues ou vertes partent du rond l'une après l'autre et filent vers le bord en tournant, comme un favori qu'on ajoute ; elles grandissent puis s'effacent avant l'anneau.
- **Volume** : un reflet doux en haut à gauche et une ombre légère en bas à droite, par-dessus l'intérieur.

**Dans la roue**, chaque médaillon est un canevas posé dans le trou de l'anneau (80,65 % de l'image du contour), sous l'anneau en image (`img.wheel-img`, `medaillons/contour-512.webp`) : le halo vert et le cercle lumineux de la roue se calent sur l'anneau, comme pour un logo.
Seul le médaillon du centre s'anime, et repart de sa première image en y arrivant ; ses voisins restent sur leur première image (au réglage « Logos animés : tous » (all animated), tous s'animent).
L'image reste figée quand Windows demande moins d'animations, et rien n'est dessiné tant que la fenêtre est cachée (une seule boucle `requestAnimationFrame` pour tous les canevas).

**Juke-box** : sur le plateau en borne, le médaillon vivant est en tête de la playlist, ses fils derrière le titre.
Sur l'affiche (fronton, plateau derrière la roue), les fils traversent toute l'affiche en passant derrière le médaillon ; le vinyle, l'orbite et le filet de l'ancien décor sont retirés.
Pour un morceau sans clip, au fronton, les fils battent derrière la pochette et le titre.
La barre de progression du morceau devient un fil vert, ondulé sur la part jouée, l'étincelle en tête de lecture.
Un clip garde tout le fronton.
Aucune pulsation sur le tempo : en lecture, les fils ondulent à amplitude constante ; en pause, ils se posent presque à plat.

**Images fixes** : `medaillons/juke-box.png`, `communaute.png`, `collections.png` et leurs versions WebP de 512 px sont la première image de ces intérieurs, tirée du même code par le générateur (`npx electron docs/design-system/src/medaillons.cjs`, `CyberMedaillons.paint`).
Elles servent là où le médaillon reste fixe (cinématique d'entrée du Juke-box), et de repli sans canevas.

**Essais** : [medaillons-vivants-chromium.test.ts](../../packages/core/src/test/medaillons-vivants-chromium.test.ts) ouvre la vraie page du front-end dans un Chromium hors écran, avec les trois médaillons dans la roue, chacun à son tour au centre.
Il vérifie que l'anneau couvre le canevas centré dans son trou, que le médaillon du centre s'anime et que son voisin reste immobile, sans erreur ni refus de la politique de sécurité.
Un second essai pose l'en-tête du Juke-box et sa barre avec la vraie feuille de style : aucune lueur ne touche le bord de son canevas.
Chaque canevas déborde de son élément pour laisser à un flou de `b` pixels sa portée de 1,5 `b`, et l'amplitude des fils est plafonnée par cette place (`reach`, `TRACK_PAD`).

### Roue : ses réglages

Tous les réglages de la roue des tables sont sur un même écran, **Menu système > Tables > Roue**, à côté des Collections (demande du 12/11/2026).
Ils étaient mêlés au son et au mode attente dans Menu système > Tables > « Son et mode attente », qui garde le son, l'attente, le DMD et les médias.
Code : [app/src/wheel-settings.ts](../../app/src/wheel-settings.ts) ; tout est gardé dans `<données>\medias.json`, et s'applique aussitôt.

- **« Présentation des tables »** (Start : la liste) : roue Médaillons (par défaut), Bandeau, Minimaliste, Arche, ou la liste des titres (`menuLayout`).
- **« Ordre des tables »**, **« Table au démarrage »** et **« Start sur la roue »** : voir [ci-dessous](#ordre-des-tables-et-table-au-démarrage).
- **« Logos animés »** (Start : basculer) : **seulement la table choisie** (par défaut) ou **tous** (`wheelMotion`, `selected` ou `all`).
  Un logo animé (APNG, GIF ou WebP animé) ne s'anime qu'au centre de la roue ; ses voisins montrent sa première image, fixe, et reprennent l'animation en arrivant au centre.
  Au réglage « tous », chacun s'anime comme avant.
  La première image est tirée une fois par logo (`CyberMedia.stillLogo`, [app/renderer/media.js](../../app/renderer/media.js), par `ImageDecoder`, dont l'en-tête suffit à dire si le fichier est animé : un logo fixe n'est lu qu'en partie) et posée sur le logo animé (`attachStill`, [app/renderer/frontend.js](../../app/renderer/frontend.js), classe `.wheel-still`) ; hors du centre, la feuille de style ne dessine plus le logo animé, donc Chromium ne l'anime plus.
  Tant que l'image fixe n'est pas prête, le logo animé reste : jamais de place vide.
  Les logos de la liste et du mode attente ne changent pas.
  La politique de sécurité de la page du front-end (`frontend.html`) permet pour cela la lecture des fichiers de médias (`connect-src cyber-media:`) et les images `blob:` : sans elles, la lecture était refusée et tous les logos restaient animés (préversion 0.1.11-essai.12).
  Une image fixe impossible le dit dans la console (« Logo animé : première image impossible »), et toute page de Cyber Pinball qui se voit refuser un contenu par sa politique de sécurité le note dans `<données>\logs\erreurs.txt` (`journalPolicyViolations`, [app/src/uncaught.ts](../../app/src/uncaught.ts)) ; le garde-fou des essais hors écran échoue alors (« politique de sécurité de la page »).
  Preuve dans un vrai Chromium hors écran, avec la vraie page et des APNG animées : [roue-logos-chromium.test.ts](../../packages/core/src/test/roue-logos-chromium.test.ts).
- **« Couleur de chaque table dans le front-end »** : voir [Couleur de chaque table dans le front-end](#couleur-de-chaque-table-dans-le-front-end).
- **« Juke-box dans la roue »** (Start : basculer) : le médaillon Juke-box en tête de chaque collection (par défaut), ou masqué (`jukebox`).
- **« Communauté dans la roue »** et **« Collections dans la roue »** (Start : basculer) : les médaillons Communauté et Collections, affichés par défaut (`community`, `collectionsMedallion`).

Les collections que la roue montre se choisissent dans **Menu système > Tables > Collections**.
Tests : [roue-reglages.test.ts](../../packages/core/src/test/roue-reglages.test.ts).

### Réglages du Juke-box

Tous les réglages du Juke-box sont sur un même écran, **Menu système > Juke-box > Réglages du Juke-box**, juste après la gestion du Juke-box, et aussi en ligne « Réglages du Juke-box » en tête de cette gestion, où Exit ramène (demande du 13/11/2026 : la configuration du Juke-box, pas la gestion de son contenu).
Code : [app/src/jukebox-settings.ts](../../app/src/jukebox-settings.ts), [packages/core/src/jukebox-audio.ts](../../packages/core/src/jukebox-audio.ts) ; tout est gardé dans `<données>\medias.json` (`jukeboxAudio`, `jukeboxVisualizer`, `jukebox`) et s'applique aussitôt, même au morceau en cours.

- **« Sorties du son »** (Start : la liste) : les sorties de Windows (sans les virtuelles, comme le casque, comme à l'étape « Son »), celle de la borne en tête.
  Sans réglage, le Juke-box joue sur la sortie du front-end (celle du fronton, voir l'étape « Son »), son intact : c'est le réglage d'usine, par le même chemin qu'avant (`setSinkId` seul).
  Start sur une sortie ouvre son écran :
  - **« Juke-box sur cette sortie »** : oui ou non.
    Ajouter une sortie garde celle qui jouait (on ajoute du son, on ne le déplace pas) ; la dernière sortie active ne se coupe pas (grisée, avec sa raison).
  - **« Volume »** : de 0 à 100 %, par rapport aux autres sorties ; le volume général reste celui de la borne (boutons de volume).
  - **« Profil »** : **complet** (son intact), **basses seules** (sous 120 Hz, deux étages passe-bas : pour un caisson), **médiums et aigus** (au-dessus de 120 Hz : de petits haut-parleurs à côté d'un caisson), **personnalisé** : **« Basses »** (plateau grave à 200 Hz), **« Médiums »** (cloche à 1 kHz), **« Aigus »** (plateau aigu à 4 kHz), de −12 à +12 dB par pas de 3 dB ; hors profil personnalisé, ces trois lignes sont grisées.
  - **« Retard »** : de 0 à 200 ms, pour caler une sortie qui sonne avant les autres.
  - **« Écouter cette sortie »** : cinq secondes sur elle seule, avec ses réglages : deux pulsations de basse, un accord, des cymbales, puis tout ensemble, synthétisés sur place (aucun fichier).
  - **« Revenir au réglage d'usine »**, dans la liste, vide `jukeboxAudio`.
- **« Visualiseur du Juke-box »** (Start : mode suivant) : Pochette, Multicolore, Classique (venu de « Médias, son et attente »).
- **« Juke-box dans la roue »** : le même réglage que dans Tables > Roue.

**Comment le son se partage.**
Electron n'envoie un élément que sur une sortie, et chaque carte son a sa propre horloge.
Dès que le plan est autre chose que la sortie du front-end, son intact, chaque sortie a son propre `AudioContext` posé sur sa carte (`setSinkId`, retrouvée par son nom Windows comme partout), avec sa chaîne (filtres, retard, gain) : c'est sa carte qui le cadence ([app/renderer/audio-routes.js](../../app/renderer/audio-routes.js), `CyberAudioRoutes`).
L'élément du lecteur joue sur la première sortie ; chaque autre sortie lit sa propre copie du morceau, qui le suit (lecture, pause, saut) et reste alignée sur lui à 20 ms près, par une vitesse corrigée d'un millième au plus sans changer la hauteur, ou d'un saut au-delà de 300 ms ; l'avance de chaque carte (`baseLatency`, `outputLatency`) est compensée.
Jamais de `MediaStreamDestination` lu par un `<audio>` : Chromium recale ce flux sans cesse sur l'horloge de la carte, et le morceau semblait ralentir puis accélérer (essai du 13/11/2026 sur le PinCab, préversion 0.1.11-essai.42).
Un nouveau plan refait les chaînes et les copies : le morceau ne repart pas.
Le spectre du DMD lit alors l'analyseur du graphe.
Le processus principal envoie le plan avec chaque état du clip (`jukeboxRoutes`) ; pour le lecteur YouTube, le même moteur est rejoué dans sa page et posé sur sa vidéo à chaque relevé (`onlineRoutesScript`), refait si YouTube change d'élément ; une seule vidéo, aucune copie possible : les autres sorties reçoivent son flux (`captureStream`), chacune dans son contexte posé sur sa carte (mode « flux »).
Casque en usage, tout suit le casque comme avant ; les sorties de la borne attendent.
Le journal note la sortie réelle de chaque morceau (« Juke-box : t4 joue sur … »), une sortie introuvable (« (introuvable) »), et le routage du lecteur YouTube.

**Lecture des morceaux locaux.**
Les sons et les vidéos lus depuis le disque (fichiers ajoutés, morceaux téléchargés sur la borne) ne passent plus par le processus principal, qui fait tout le front-end.
Une vidéo lourde (4K, son et image rangés loin l'un de l'autre dans le fichier) fait relancer à Chromium plusieurs lectures du fichier par seconde : chacune attendait le processus principal, et le morceau se figeait, son compris, toutes les quelques secondes dès que le front-end était occupé.
Un petit serveur, dans un processus à part (`utilityProcess` d'Electron, « Cyber Pinball - Juke-box »), les sert désormais ([app/src/jukebox-media-server.ts](../../app/src/jukebox-media-server.ts), [app/src/jukebox-media-worker.ts](../../app/src/jukebox-media-worker.ts)).
Il n'écoute que la borne (`127.0.0.1`, port choisi par le système), chaque adresse porte un jeton tiré au hasard à son lancement, et il ne sert, en lecture, que les fichiers que le front-end lui autorise un par un, sans rien lister.
Tant qu'il n'est pas prêt, ou s'il s'arrête (relancé trois fois au plus), le lecteur revient au protocole `cyber-media://` : la lecture marche toujours, et le journal le dit (« Juke-box : serveur des fichiers … ; lecture par le protocole des médias »).
Ce serveur est un script fabriqué à part, livré à côté de l'application (`jukebox-media-worker.js`, liste `builtApart` de la fabrication) : un test vérifie que tout script que l'application charge par son nom y figure.
Chaque coupure de plus d'un quart de seconde pendant la lecture d'un morceau local est notée au journal, avec sa cause : attente de données, image figée ou son figé ([app/renderer/jukebox-stalls.js](../../app/renderer/jukebox-stalls.js)).
La ligne dit aussi ce qui était chargé d'avance et le pire retard du processus principal sur les dix dernières secondes (« Juke-box : [avertissement] t4 s'est arrêté 1.2 s à 95 s (attente de données, 0.3 s chargées d'avance ; processus principal en retard de … ms au plus sur les 10 dernières secondes) ; coupure n° 1. »).
Le chargement du début, une pause et un saut voulus ne comptent pas ; après les cinq premières coupures d'un morceau, une ligne toutes les dix.

Tests : [jukebox-audio.test.ts](../../packages/core/src/test/jukebox-audio.test.ts) (réglage d'usine, ajout, dernière sortie, filtres, fichier abîmé), [jukebox-reglages.test.ts](../../packages/core/src/test/jukebox-reglages.test.ts) (écrans, boutons, retour sur la ligne), et [jukebox-sorties-chromium.test.ts](../../packages/core/src/test/jukebox-sorties-chromium.test.ts), dans un vrai Chromium hors écran et muet : un la à 440 Hz traverse le graphe, deux branches avec leurs filtres, un nouveau plan sans couper le morceau, l'extrait d'essai.

### Ordre des tables et table au démarrage

Trois réglages de **Menu système > Tables > Roue**, gardés dans `<données>\medias.json` (champs `tableOrder` et `startTable`) ; code : [packages/core/src/tableorder.ts](../../packages/core/src/tableorder.ts), appliqué par `app/src/frontend.ts` à chaque lecture des tables.

- **« Ordre des tables »** (Start : la liste des choix) : comment les médaillons se suivent dans la roue, et les titres dans la liste.
  **Par titre** par défaut (de A à Z, comme avant), **dernières jouées d'abord**, **plus jouées d'abord** (d'après `User.LastRun` et `User.StartCount` du `.info`, que Cyber Pinball tient à jour à chaque lancement ; une table jamais jouée passe à la fin), **par année** ou **par fabricant** (puis par année ; inconnu à la fin), ou **mélangé à chaque démarrage** : un ordre tiré au hasard quand la borne démarre, gardé jusqu'au suivant (une table ajoutée en route prend sa place au hasard sans bousculer les autres).
  À égalité, le titre départage.
  Changer d'ordre garde la table choisie.
- **« Table au démarrage »** (Start : choix suivant) : **la première** dans l'ordre choisi (par défaut, comme avant), **au hasard** (la borne ne s'ouvre pas toujours sur la même table), ou **la dernière jouée** (pour reprendre où l'on s'était arrêté).
- **« Start sur la roue »** (Start : choix suivant) : **ouvrir la fiche** (par défaut, comme avant), ou **jouer directement** : Start relâché lance la table choisie, sans passer par la fiche.
  La fiche reste à deux gestes : Start maintenu 0,7 s (`WHEEL_START_HOLD_MS`, `packages/core/src/tableorder.ts` ; elle s'ouvre sans attendre le relâchement, et un autre bouton pendant l'appui l'annule) et F6 d'un clavier ; les MagnaSave de la borne restent au changement de collection.
  La ligne d'aide dit « Start : jouer · Start tenu : fiche », l'aide-mémoire (H) « Jouer la table choisie » et « Fiche de la table : Start maintenu, ou F6 » ; un clic sur « Start : jouer » ou sur la table au centre joue aussitôt.
  Gardé dans `medias.json` (`wheelStart`).

Le mode attente tire toujours ses tables au hasard, quel que soit l'ordre, parmi celles de la collection active (plus bas).
Tests : [ordre-des-tables.test.ts](../../packages/core/src/test/ordre-des-tables.test.ts).

### Collections et favoris

L'ordre range les tables ; une **collection** en choisit une partie.
La roue, la liste, le compteur et le mode attente ne montrent que les tables de la collection active.
Code : [packages/core/src/collections.ts](../../packages/core/src/collections.ts) (les collections, la liste découpée, les favoris), [app/src/collections-menu.ts](../../app/src/collections-menu.ts) (la collection active, la table gardée dans chacune, les MagnaSave), dessin dans `app/renderer/frontend.js` (`fillShelf`, `placeCollections`) et `frontend.css` (« Collections »).

- **Les collections**, dans cet ordre : **Toutes les tables** ; **Favoris** ; **Récentes**, les 10 dernières jouées, la plus récente d'abord (d'après `User.LastRun`) ; **Jamais jouées** (ni `User.StartCount` ni `User.LastRun`) ; **Avec mes amis en ligne**, les tables qu'au moins un ami en ligne a dans la même version (ce que le réseau des amis sait déjà de leurs bibliothèques, comme « Jouer avec un ami ») ; puis, sur une borne qui mêle plusieurs logiciels, une par **type de jeu** (**Visual Pinball X**, **Pinball FX** avec la mention « bêta » ; groupe « Types de jeu », `engine:vpx`, `engine:pinballfx`) ; puis une par **fabricant** (de A à Z, « Bally » et « bally » ne font qu'un) et une par **décennie** (« Années 1990 »).
  Chacune garde l'« Ordre des tables » choisi, sauf Récentes.
- **Le repère** : « ☆ FAVORIS │ 1 / 4 », la collection affichée et la place de la table choisie dedans, à la place de l'ancien compteur.
  Sur la roue Médaillons, il est dans un encart dessiné sur le dessus du cartouche du titre, en retrait sous la roue : l'arc inférieur passe devant son bord haut (couche du fond de `roues/medaillons.svg`, tirée de `docs/design-system/src/roues/medaillons.svg` par `roues.mjs`).
  Chaque autre roue dessine aussi le sien : sous la lame du Bandeau et sous le filet du Minimaliste, qui passent devant son bord ; sous l'Arche, une petite plaque entre les médaillons et le titre.
  Le compteur ne garde plus sa place sous fabricant · année : au bureau étroit, le titre ne remonte plus jusqu'au repère ; en présentation liste, en tête des lignes.
  Sa place et sa taille ne dépendent ni de la table ni de la collection : changer de table n'en change que le chiffre, changer de collection le nom.
- **Changer de collection** : **MagnaSave gauche ou droit** sur la roue, collection précédente ou suivante, appliquée aussitôt, en boucle ; une collection vide est sautée.
  Seul le repère change : aucune liste ne paraît plus par-dessus la roue (retirée le 13/11/2026, le médaillon Collections la remplace).
  À la souris : un clic sur le repère passe à la suivante.
  Pour voir toutes les collections : le **médaillon Collections** (ci-dessous) ou **Menu système > Tables > Collections**, la même liste aux flippers et à Start.
- **Le médaillon Collections** (13/11/2026) : dans la roue, après le Juke-box et la Communauté, le dernier des médaillons de tête, juste avant la première table.
  Son nom en vert, dessous le nombre de collections et celle que la roue montre.
  Start (ou un clic au centre de la roue, ou une touche sur le téléphone) ouvre la **liste des collections**, la même que Menu système > Tables > Collections, le curseur sur la collection montrée : Start sur une collection l'affiche sur la roue, sur la table qu'elle retient ; Exit revient au médaillon.
  On y trouve aussi « Nouvelle collection… », « Gérer mes collections… » et « Boutons des collections ».
  Choisi dans la roue, il montre son **affiche**, comme la Communauté : derrière la roue et au fronton, le nombre de collections et de tables, la collection montrée, quelques autres, et « Start · Choisir une collection ».
  Il se masque dans Menu système > Tables > Roue (« Collections dans la roue ») ; il disparaît quand le mode invité impose une collection ou ferme le choix des collections.
- **Boutons des collections** : sur l'écran Collections, « Boutons des collections » attend deux appuis, la collection précédente puis la suivante : n'importe quel bouton de la borne (joystick d'une carte Pinscape compris) ou touche du clavier, sauf les flippers, Start et Exit.
  Ils passent avant les MagnaSave ; « Remettre les MagnaSave » les oublie.
  Gardés dans `<données>\collections.json` (champ `keys`).
  Sans boutons choisis, les MagnaSave relevés à l'étape « Boutons » ; un MagnaSave non relevé (bouton facultatif) prend sa touche par défaut d'un clavier (Ctrl gauche, Ctrl droit).
  Le journal dit au démarrage quelles touches changent de collection (« Touches des collections : … »).
- **Mes collections** : des collections personnelles, nommées à son goût.
  « Nouvelle collection… » (écran Collections, ou fiche d'une table > « Ajouter à une collection… », qui la crée avec cette table) demande un nom au clavier à l'écran ; « Ajouter à une collection… » sur la fiche coche ou décoche la table dans chacune ; « Gérer mes collections… » renomme ou supprime (les tables restent sur la borne).
  Elles viennent après les collections fixes, sous « Mes collections », dans l'ordre de leur création ; leurs tables dans l'ordre du front-end.
  Gardées dans `<données>\collections.json` (champ `mine` : identifiant, nom, tables désignées par leur chemin dans le dossier des tables).
  Fermé à l'invité (porte `sheet.collections`).
- **La table gardée** : chaque collection retient sa table ; on la retrouve en y revenant.
  Une table sortie de la collection (retirée des favoris) laisse sa place à sa voisine ; une collection devenue vide rend Toutes.
  La collection active est gardée d'un démarrage à l'autre (`<données>\collections.json`) ; « Table au démarrage » y choisit la table.
- **Les favoris** : « Ajouter aux favoris » (ou « Retirer des favoris ») sur la fiche d'une table ; une étoile blanche pleine se pose devant le titre, sur la roue comme sur la fiche (jamais en vert ; sa place est gardée hors des favoris, le titre ne bouge pas).
  C'est le champ `User.Favorite` du `.info` (1 ou 0), celui qu'écrivent d'autres frontends : une table reprise d'une autre installation garde son favori, même quand la table d'ici a déjà ses statistiques (`mergeFavorite`, tableimport.ts).
- **Mode invité** : son écran (Menu système > Ma borne > Démarrage et accès > Mode invité) propose « Tables proposées » : toutes (les MagnaSave restent libres), ou une collection non vide (Start : choix suivant).
  Limité, le front-end verrouillé ne montre qu'elle : le cadenas remplace l'icône du repère, l'aide ne parle plus des MagnaSave, et un MagnaSave ne fait que l'indice « Verrouillé » (porte `menu.collection-locked`).
  Le choix est gardé avec le mode invité (`<données>\mode-invite.json`, champ `collection`) ; au déverrouillage, la collection d'avant revient.
  Ajouter ou retirer un favori est fermé à l'invité (`sheet.favorite`).

Tests : [collections.test.ts](../../packages/core/src/test/collections.test.ts), [medaillon-collections.test.ts](../../packages/core/src/test/medaillon-collections.test.ts).

### Mode attente

Après un temps sans bouton sur l'écran des tables, la borne se présente toute seule (`AttractMode`, `pickAttractTable`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)) :

- **Délai** : « Mode attente » (5 min par défaut ; 1, 2, 3, 5, 10, 15 ou 30 min ; **jamais**).
  Le compte repart à chaque bouton et à chaque clic, et quand on revient à l'écran des tables : il ne court jamais sur la fiche, l'aide, un message, un écran de réglage ou pendant une partie.
- **Tables** : une table tirée au hasard toutes les N secondes (« Table suivante en attente », 20 s par défaut), jamais la table choisie dans le front-end ni l'une des dernières montrées (un tiers des tables environ), si bien que toutes finissent par passer.
  Chaque écran montre les médias de cette table ; le playfield, son fond (moins assombri que dans le front-end), son logo ou à défaut son titre en logo de secours (`fallback.js`), fabricant et année, et « Appuyez sur un bouton pour revenir au front-end ».
- **Sortie** : le premier bouton, quel qu'il soit, ou un clic, revient au front-end tel qu'il était, sans autre effet : la sélection ne bouge pas, Start n'ouvre pas la fiche, Exit n'ouvre pas le menu système.
- **Son** : « Son en attente » coupé par défaut ; réduit, la musique de la table montrée (ou le son de sa vidéo) joue à 30 % de son volume.
- **Crédits** : une ligne discrète en bas du plateau, au-dessus de l'invite, cite qui a fait la table montrée : « Table TastyWasps, JPSalas et 12 autres · Fronton HauntFreaks · Couleurs Enthusiast » (ceux qu'on connaît, deux lignes au plus ; voir [Crédits de la communauté](credits-de-la-communaute.md#crédits-de-la-communauté)).
  « Crédits de la table » : affichés par défaut, ou masqués (`<données>\medias.json`, champ `attractCredits`).
- **Ses réglages, au même endroit** : Menu système > « Tables » > « Son et mode attente » > **« Mode attente »** ouvre un écran à lui (`ATTRACT_ROWS`, [app/src/menu-settings.ts](../../app/src/menu-settings.ts)) : délai, table suivante, son, crédits de la table, horaire de la borne.
  La ligne de « Médias, son et attente » les résume (« une table toutes les 20 s · son coupé · crédits affichés »).

### Horaire de la borne

Comme une borne de salle d'arcade, la borne vit seule quand personne ne joue (le mode attente, ci-dessus), et un horaire règle sa journée (`ArcadeHours`, [packages/core/src/arcadehours.ts](../../packages/core/src/arcadehours.ts) ; dans le front-end, [app/src/frontend.ts](../../app/src/frontend.ts) et [app/src/arcade-hours.ts](../../app/src/arcade-hours.ts)).
Menu système > « Tables » > « Son et mode attente » > « Mode attente » > **« Horaire de la borne »** ; les réglages vont dans `<données>\medias.json` (champ `hours`).

- **Horaire de la borne : désactivé** par défaut.
  Désactivé, ses réglages restent visibles et modifiables (« Réglages conservés ; aucun effet tant que l'horaire est désactivé »).
- **Nuit** : « Début de la nuit » (23 h) et « Fin de la nuit » (8 h), en heures pleines ; la nuit traverse minuit.
  Début et fin égaux sont refusés dans la liste (« choisissez deux heures différentes »), plutôt qu'une nuit de 24 h inventée.
  Heures locales ; un changement d'heure est suivi par l'horloge murale.
- **Écrans pendant l'attente nocturne** : la nuit, en mode attente seulement, un voile noir couvre chaque fenêtre (médias, zones, roue des tables, invite comprise) : **voile noir à 50, 70 (défaut) ou 85 %**, **écrans noirs** (100 %) ou **écrans inchangés**.
  Il descend en 4 s et se lève d'un coup au premier bouton.
  Sous les écrans noirs, une fois le voile opaque, les vidéos s'arrêtent et la table montrée ne change plus.
  L'attente est **muette la nuit**, quel que soit ce choix.
  Avec le mode attente réglé sur « jamais », pas de voile (la ligne de l'écran des réglages le dit).
- **Arrêt automatique** : à une heure (2 h par défaut) ou **jamais** ; **mode d'arrêt** : **mise en veille** (défaut) ou **extinction**.
  À l'heure dite, si la borne est **libre** (mode attente en cours, ou dans le front-end sans bouton depuis le délai de l'attente, 5 min au moins ; jamais pendant une partie, un chargement, au bureau Windows ni pendant une autre action d'alimentation), le plateau affiche **30 s de préavis** au-dessus du voile : « Mise en veille dans 22 s » (ou « Extinction dans »), une jauge qui se vide, « Appuyez sur un bouton pour garder la borne allumée ».
  À zéro, l'arrêt passe par le module d'alimentation (section « Éteindre, mettre en veille, redémarrer la borne ») : même écran noir uni sur chaque écran, réglages enregistrés avant d'agir, `SetSuspendState` ou `shutdown.exe`.
  Le préavis n'est répété ni au DMD ni par un son.
- **Le moindre bouton rend la main** : pendant le préavis, un bouton ou un clic le retire aussitôt, sans autre effet (comme la sortie du mode attente) ; la borne reste allumée tant qu'on s'en sert.
  Une partie en cours retient l'arrêt : il attend que la borne redevienne libre, avec un nouveau préavis complet, jusqu'à la **fin de la nuit** ; après, il n'est plus fait et l'arrêt est reprogrammé pour la nuit suivante.
  Réveillée dans la fenêtre d'arrêt (entre 2 h et 8 h) puis laissée seule, la borne se rendort.
  Une heure d'arrêt hors de la nuit est signalée en orange ; elle vaut alors pour une heure seulement (sinon un arrêt à 8 h pile arrêterait la borne toute la journée).
- **Manqué, pas rattrapé** : borne déjà en veille ou éteinte pendant la fenêtre d'arrêt, l'arrêt est manqué (`onMissed` du module d'alimentation), jamais fait au réveil.
- **Réveil** : depuis la veille, le bouton d'alimentation du PC ; ou un bouton de la borne si Windows autorise son périphérique à sortir le PC de la veille (Gestionnaire de périphériques > le périphérique > Gestion de l'alimentation).
  Le bloc « Réveil depuis la veille » de l'écran le dit, lu dans Windows (`MSPower_DeviceWakeEnable`, classes clavier, HID et souris), sans rien y écrire : « Périphériques autorisés par Windows : Pinscape Controller, Périphérique clavier HID », « Aucun périphérique autorisé détecté », ou « Liste des périphériques indisponible ».
  Une autorisation n'est pas une garantie : le réveil par un bouton de la borne se vérifie sur la borne (le BIOS doit aussi alimenter l'USB en veille).
  Après une extinction, seul le bouton d'alimentation du PC rallume la borne.
  Cyber Pinball ne coche jamais cette case lui-même et ne programme aucun réveil de Windows (minuterie de réveil, tâche planifiée) : à décider avec l'utilisateur.
- **Essais** : jamais de vraie veille ni de vraie extinction (`powerSimulated` : l'arrêt est journalisé, « Alimentation simulée : … »).
  En essai seulement, `CYBERPINBALL_HORLOGE=2026-10-27T01:59:48` décale l'horloge de l'horaire (la borne croit qu'il est 1 h 59) et `CYBERPINBALL_REVEIL=Nom 1|Nom 2` (« - » : indisponible) remplace la lecture de Windows ; hors essai, l'horloge est celle du PC.
- **Preuves** : [arcadehours.test.ts](../../packages/core/src/test/arcadehours.test.ts) (nuit à cheval sur minuit, fenêtre d'arrêt, préavis, bouton qui le retire, partie jusqu'au matin, veille pendant la fenêtre, réglages relus ; jamais d'exécuteur réel en essai ; lecture seule du réveil ; réglages fermés à l'invité ; rendu du voile et du préavis).

### DMD du front-end

Pendant la navigation, Cyber Pinball dessine lui-même l'afficheur du DMD, comme une machine en attente : une grille de 128 × 32 points qui fait tourner le titre de la table choisie, l'invitation à jouer, ses records, l'heure et les crédits, avec le détail de sa wheel à l'arrivée et une courte scène de jeu un cycle sur deux.
Les points restent affichés en permanence : le média DMD de la table ne les remplace jamais, il se voit autour d'eux (cadre du FullDMD, ci-dessous).
Réglage « DMD du front-end » de **Menu système > « Ma borne » > « DMD et LED »** ( Start passe de l'un à l'autre, enregistré dans `<données>\medias.json`, champ `dmd`) : **vivant** par défaut, ou **classique** (le média de la table seul, sinon le DMD généré qui fait défiler son titre, comme avant).
Ce média est celui de l'écran du DMD (`roleMedia`, `resolveMedia`) : sur un écran FullDMD, le média (FullDMD) de la table, et son (DMD) seulement s'il n'a pas de FullDMD ; sur un DMD seul, le (DMD) d'abord, le (FullDMD) à défaut.
Quand la table a les deux, l'écran du DMD prend celui dont les proportions remplissent le mieux sa zone (`bestDmdMedia`, `dmdScreenAspect` : la zone du rôle dans le modèle de la borne, sinon 4:1 ou 16:9), quel que soit son libellé : un « (DMD) » en 21:9 repris de PinUP Popper passe devant un « (FullDMD) » en 16:9 sur un DMD 4:1, au lieu de laisser la moitié de l'écran vide.
À égalité, ou si l'un des deux ne se mesure pas, l'ordre ci-dessus décide.
Ce n'est jamais le DMD que la ROM produit en partie : la table ne tourne pas dans le front-end.

| Page | Ce qu'elle montre | Durée |
| --- | --- | --- |
| Titre | le titre en grand (9 × 14 points), fabricant et année dessous en petit ; un titre plus large que l'afficheur (marges de 3 points comprises) part calé à gauche, s'arrête 1 s, défile à 24 points par seconde, s'arrête 1 s sur sa fin | 4,8 s, plus si le titre défile |
| PRESS START | en grand, clignote deux fois (0,8 s allumé, 0,4 s éteint) | 2,4 s |
| Records | une page par place, 4 au plus : « HIGH SCORE #1  MPT » en petit, le score en grand, chiffres groupés par trois | 2,4 s chacune |
| Horloge | l'heure en très grand (18 × 28 points), un ton en dessous, les deux-points qui battent la seconde | 3 s |
| Crédits | « CREDITS n » : les crédits que la table a enregistrés, 0 sinon (le front-end n'a pas de monnayeur) | 1,8 s |

- **Alternance** (`liveDmdPages`, `LiveDmdProgram`, [packages/core/src/livedmd.ts](../../packages/core/src/livedmd.ts)) : dans l'ordre du tableau, en boucle ; une page sans objet (pas de records) est sautée, jamais remplacée par une page vide.
  Environ 22 s pour une table à 4 records.
  Changer de table repart du titre ; la même table dont les records changent aussi.
  Plus de page du média depuis le 09/11/2026 : elle effaçait les points 5 s par cycle, ce qui se lisait comme un DMD qui clignote ; un essai fixe qu'à chaque instant du cycle l'afficheur a des points allumés (PRESS START excepté, qui clignote).
- **Transitions** (`DMD_TRANSITIONS`, `transitionTo`, `DMD_ALTERNANCE`) : depuis le mouvement « Soie » (11/11/2026), les pages alternent trois effets, dans cet ordre et en boucle.
  **Fils** (520 ms) : sur chaque rangée, un fil au plein éclat court de gauche à droite, les rangées décalées (ondulation figée), et les points allumés juste derrière gardent un reste d'éclat, comme une rémanence de phosphore.
  **Volet lumineux** (320 ms : un front de 2 colonnes au plein éclat et 2 à la nuance 7, de gauche à droite).
  **Scintillement** (440 ms) : chaque point passe à la nouvelle image le long d'une diagonale tremblée (hachage figé), son front au plein éclat.
  L'**allumage** reste propre au détail de la wheel (400 ms, chaque point d'abord au plein éclat), et deux records se remplacent sans mouvement.
  La poussée (160 ms) et la dissolution (320 ms) restent disponibles.
  **D'une table à l'autre**, la nouvelle glisse sur l'ancienne dans le sens de la roue (240 ms, `LiveDmd.show`) ; en défilement rapide, chaque cran relance le glissement depuis l'image du moment.
- **Détail de la wheel** (`wheelDetail`, `wheelPage`, [packages/core/src/dmdscenes.ts](../../packages/core/src/dmdscenes.ts)) : les wheels sont des médaillons illustrés, illisibles réduits à 32 points de haut.
  La wheel est donc agrandie à 112 points de côté, en tons choisis par le directeur artistique (fond 0, ombres 1 à 3, volumes 5 à 10, contours 12 à 14, rares éclats 15, sans tramage ; un pixel vaut surtout son canal le plus fort, un rouge vif reste vif), et l'afficheur se pose sur sa bande de 32 lignes la plus riche en bords : le logotype le plus souvent (2001, Back to the Future, Star Trek, Goonies), sinon un visage ou un emblème. 800 ms après l'arrivée sur une table (la navigation rapide ne montre que les titres), le détail s'allume par-dessus le titre, glisse de 16 points (640 ms), s'arrête (480 ms), un reflet de 3 points relève ses points de 2 nuances (240 ms), s'arrête (400 ms), puis le titre le pousse et l'alternance part du début.
  Une fois par arrivée, et au retour d'une partie.
  La wheel est lue par le convertisseur hors écran ([app/src/dmd-wheel.ts](../../app/src/dmd-wheel.ts)), donc dans tout format que Chromium sait lire (PNG, APNG, GIF, WebP, JPEG, première image d'une vidéo), 200 ms après l'arrêt sur la table, une seule à la fois, gardée en mémoire (200 tables au plus) ; lue trop tard pour la visite en cours, elle joue à la suivante.
  Sans wheel, ou sans rien de visible : pas de détail, l'alternance reste la même.
- **Intermèdes de jeu** (`DMD_INTERLUDES`, `liveDmdProgram`, `dmdscenes.ts`) : six scènes de flipper en points, de 1,7 à 2,8 s, dans la grammaire des vrais DMD (bille de 3 points au plein éclat, traînée de trois positions aux nuances 10, 6, 3, décor aux nuances 3 à 5, flashs de 80 ms au contact) : **bumpers** (4 chocs, étincelles), **lanceur** (compression qui tremble, détente, couloir, orbite), **flippers** (la palette frappe en 80 ms et renvoie la bille), **cibles** (trois cibles tombantes, puis « BANK COMPLETE »), **verrou** (la bille ralentit vers le trou, puis « BALL LOCKED »), **multibille** (trois billes).
  Un cycle sur deux, après le dernier record (sans records : après PRESS START), soit toutes les 40 à 50 s ; les six tour à tour, jamais la même deux fois de suite, la rotation partant d'une scène tirée du titre de la table.
  Leurs images sont calculées une fois pour toutes.
- **Sans table** (menu système, réglages, aide, messages : l'affichage par défaut) : la marque empilée dans sa police (CYBER à la nuance 11, PINBALL au plein éclat), PRESS START, l'horloge ; une scène de jeu un cycle sur deux, après PRESS START.
- **Chargement** : l'animation « chargement » (« LOADING » et une bille de 4 × 2 points qui roule sur un rail) jusqu'à la partie ; avec le lancement en cinéma, l'animation « lancement » (le titre de la table, la bille qui tremble au lanceur, le disque lumineux du logo qui passe, puis la même bille qui roule ; voir [Lancement en cinéma](#lancement-en-cinéma)).
  **Partie** : plus rien n'est envoyé, VPX a l'afficheur ; l'écran du DMD reprend son fond de partie (« Chargement et partie »).
  Le mode bureau arrête aussi l'afficheur.
- **Sur l'écran du DMD** (`liveDmdArea`) : DMD seul, les points remplissent la bande 4:1.
  FullDMD : si le média FullDMD de la table a un cadre de DMD dessiné (cherché comme pour l'habillage en partie, une fois par média, gardé dans `<données>\cache\fulldmd-cadres.json`), les points se posent dans ce cadre, en retrait d'un point, là où VPX mettra son DMD en partie, et le média se voit autour.
  Sans média, ou sans cadre : la bande 4:1 sur toute la largeur, centrée, du noir autour.
  Sans table, pas de bande : le FullDMD de repli montre la marque sur toute sa grille de 160 × 90.
  Le cadre d'une vidéo pas encore cherché l'est en arrière-plan : la bande s'affiche d'abord, le cadre dès qu'il est trouvé.
  Sous les points posés sur du noir, la vidéo de la zone est en pause.
- **DMD sur la roue, table par table** : fiche de la table > « Gérer la table… » > « DMD sur la roue ».
  Ce réglage ne vaut que pour la roue ; le DMD en partie garde le sien (les deux MagnaSave, [Position du DMD en partie](plugins-de-vpx-backglass-pup-et-dmd.md#position-du-dmd-en-partie)), et l'un ne touche jamais l'autre.
  L'écran de réglage est sur le plateau ; l'écran du DMD montre la table, ses points à la place réglée et un cadre pointillé avec sa légende (taille et position en pixels), en direct.
  - **Lignes** : « DMD sur la roue » (affiché ou masqué : masqué, les points ne se dessinent pas et l'écran montre son média seul, le média FullDMD ou rien), « Position horizontale », « Position verticale », « Largeur » et « Hauteur » (chacune seule ; le format se libère), « Format » (4:1 d'abord, puis libre, 3:1, 2:1… ; libre, il dit les proportions du moment et un flipper à gauche rend le 4:1), « Enregistrer pour cette table », « Revenir à la place automatique », « Retour ».
    Une ligne de place se grise, sa raison dite, quand le DMD est masqué.
  - **Boutons** : Start ouvre une ligne ; dans une ligne ouverte, les flippers déplacent ou redimensionnent au pixel (maintenus : plus vite, jusqu'à 64 pixels par pas), les MagnaSave montent et descendent, les flèches et + / − du clavier aussi ; Start valide, Exit annule la ligne.
    Quitter avec des changements pas enregistrés pose la question : enregistrer, abandonner, continuer le réglage.
  - **Enregistrement** : `<données>\dmd-roue.json`, par configuration de la borne puis par table (`MenuDmdPlace` : zone en fractions de la zone du DMD, `hidden`).
    Seul ce qui diffère de l'automatique est gardé : une place restée automatique suit encore un autre média ou un cadre trouvé plus tard ; un DMD seulement masqué ne fige pas sa place.
    « Revenir à la place automatique » retire le réglage.
    Le journal du front-end note chaque enregistrement (« DMD sur la roue (…) : … »).
  - **Sur la roue** (`liveDmdView`, [app/src/menu-dmd.ts](../../app/src/menu-dmd.ts), [packages/core/src/menudmd.ts](../../packages/core/src/menudmd.ts)) : le réglage de la table, sinon la place automatique ci-dessus.
    Des points déplacés hors de la place automatique sur un média FullDMD laissent voir le média autour, comme dans un cadre trouvé.
    Le chargement d'une partie montre toujours son animation à la place automatique.
    Avec « DMD du front-end » sur « classique », le réglage s'enregistre mais ne se voit pas : l'écran le dit.
- **Rendu** : grille de 128 × 32, 16 nuances (0 : point éteint, encore visible ; 14 pour les titres, les scores et PRESS START ; 11 pour l'horloge, les crédits, le fabricant et le libellé des records ; 5 pour le rail), dans la couleur réglée (vert signal par défaut, voir [Fronton et DMD de la marque](#fronton-et-dmd-de-la-marque)), trou rond par point et léger halo ; la grille remplit toute la place des points, même hors du 4:1 (points étirés, `dotMatrix(…, { fill: true })` : plus de bandes noires sur une place réglée en largeur ou en hauteur seule) (`CyberFallback.dotMatrix`, [app/renderer/fallback.js](../../app/renderer/fallback.js)) ; le point éteint reste un gris neutre à peine visible, jamais une nuance de la couleur.
  Police « Saira Points », dessinée d'après Saira ([packages/core/src/dmdfont.ts](../../packages/core/src/dmdfont.ts)) : petit 5 × 7, grand 9 × 14 (dessiné point par point, plus de Scale2x), horloge du grand doublé (18 × 28), marque 11 × 11 ; accents retirés, signes inconnus en « ? ».
  Les mots de l'afficheur restent ceux des flippers (PRESS START, CREDITS, HIGH SCORE).
- **Fonctionnement** : le programme se calcule sans navigateur (`livedmd.ts`, `dmdscenes.ts`, `liveDmdProgram`) ; le processus principal le fait tourner ([app/src/live-dmd.ts](../../app/src/live-dmd.ts)) et n'envoie à la fenêtre de l'écran du DMD (canal `dmd`) que les images qui changent : une page fixe part une fois, ce qui bouge (défilement, clignotement, horloge, transitions, wheel, intermèdes, animation) à 25 images par seconde.
  La fenêtre les dessine en points par-dessus la zone du DMD (`syncLiveDmd`, [app/renderer/frontend.js](../../app/renderer/frontend.js)) ; une fenêtre rechargée reçoit aussitôt l'image courante.
- **Animations à la demande** (pour « Lancement en cinéma » et les suivantes) : `playDmdAnimation(nom, { label })` ([app/src/frontend.ts](../../app/src/frontend.ts)) joue une animation par-dessus l'alternance et rend `{ stop(), done }` ; l'alternance reprend à `stop()`, ou à la fin d'une animation qui a une durée.
  Les animations sont rangées par nom dans `DMD_ANIMATIONS` (`livedmd.ts`) : `chargement` et `lancement`, leur texte remplaçable par `label`.
- **Records** ([packages/core/src/highscores.ts](../../packages/core/src/highscores.ts), source partagée avec les sons d'interface) : VPX 10.8.1 range ce qu'une table enregistre dans `<dossier de la table>\user\VPReg.stg`, un fichier composé OLE (un stockage par nom choisi par le script, un flux UTF-16LE par valeur).
  Les tables de VPW et la plupart des tables originales y gardent `HighScore1..N`, `HighScore1Name..N` et `Credits` (relevé sur la borne : Guardians of the Galaxy, Game of Thrones, The Goonies).
  Rien n'est inventé : sans `VPReg.stg`, sans tableau, ou avec plusieurs stockages dont aucun ne porte le nom du fichier ou du titre, pas de page des records.
  Le fichier est relu dès qu'il change (après une partie).
  `newRecords(avant, après)` donne les scores entrés au tableau, pour le knocker.
  Non couvertes : les tables PinMAME dont la ROM garde les records dans `nvram\<rom>.nv` (il faudrait la carte mémoire de chaque ROM, projet pinmame-nvram-maps).
- **DMD matériels** (ZeDMD, PIN2DMD, Pixelcade) : ils ne reçoivent pas encore l'afficheur du front-end ; VPX seul les alimente en partie, par le plugin DMDUtil.
  Ce qui manque :
  1. Une interface appelable : les bibliothèques livrées avec VPX 10.8.1 (`plugins\dmdutil\zedmd64.dll`, `dmdutil64.dll`) n'exportent que des classes C++ (`ZeDMD::Open`, `ZeDMD::RenderRgb888`, `DMDUtil::DMD`…), sans fonctions C : il faudrait un module natif compilé pour Electron.
  2. Un accès partagé : un port série (ZeDMD, Pixelcade) ou un périphérique libusb (PIN2DMD) n'a qu'un propriétaire.
     Tenu par le front-end au lancement, DMDUtil ne l'ouvrirait pas et le DMD resterait noir en partie ; le rendre avant chaque lancement et le reprendre au retour ne laisse aucune marge d'erreur.
  3. Une détection sûre : elle reste passive (identifiants USB, « DMD réel ») ; un CH340 ou un CP210x peut être autre chose qu'un ZeDMD, et lui envoyer une poignée de main serait risqué.
  4. Un banc d'essai : le protocole série de ZeDMD (poignée de main, compression, versions du micrologiciel) n'est décrit que par le code de libzedmd, et la borne de référence n'a pas de DMD matériel.

  La voie sûre est le serveur de libdmdutil (`dmdserver`) : il garde seul le matériel, VPX (`[Plugin.DMDUtil] DMDServer`, `DMDServerAddr`, `DMDServerPort`) et le front-end lui envoient leurs images par le réseau local.
  Il faudrait l'installer (il n'est pas livré avec VPX 10.8.1), le lancer avec le front-end, basculer VPX sur lui, et écrire dans `live-dmd.ts` un client de son protocole (en-tête « DMDStream » puis l'image, d'après le code de libdmdutil, à vérifier sur un vrai DMD).
  Les images sont prêtes : `LiveDmd` produit déjà la grille de 128 × 32 nuances qu'un DMD matériel affiche.
- **Tests** : [menudmd.test.ts](../../packages/core/src/test/menudmd.test.ts) (DMD sur la roue : réglages par configuration et par table, place automatique sans réglage, roue et partie séparées, écran de réglage aux boutons), [livedmd.test.ts](../../packages/core/src/test/livedmd.test.ts) (police, texte du DMD, chaque page dans ses marges, titre fixe ou défilant, ordre et durées, poussées, place des points, animation, envoi des seules images changées, pause en partie, glissement d'une table à l'autre, wheel lue en retard), [dmdscenes.test.ts](../../packages/core/src/test/dmdscenes.test.ts) (trois effets Soie en alternance, allumage vers la wheel, détail de la wheel : tons, bande choisie, ouverture jouée une fois ; six intermèdes, un cycle sur deux, jamais deux fois le même de suite ; l'afficheur jamais vide, ouverture et intermèdes compris), [highscores.test.ts](../../packages/core/src/test/highscores.test.ts) (VPReg.stg, plusieurs tables dans un fichier, rien d'inventé, nouveaux records).

### Fronton et DMD de la marque

Partout où Cyber Pinball écrit sa marque ou dessine un afficheur à points, il suit la direction artistique ([docs/design-system](../design-system/README.md)), avec une seule règle pour tous les écrans.

- **La marque** ne s'écrit que par ses composants (`app/renderer/fallback.js`) : sur une ligne, « C Y B E R  P I N B A L L » (Saira légère, élargie à 125 %, très espacée, PINBALL en vert signal) sur le topper, le chargement, l'écran « en partie » et le logo sans titre ; empilée, CYBER au-dessus de PINBALL, sur le fronton.
  Jamais comme le titre d'un jeu.
- **Fronton sans jeu** (menu système, réglages, aide, messages) : la couverture du design system.
  L'illustration de la DA (`app/renderer/fronton-marque.webp`, bille et batteurs sarcelle, celle de la couverture) calée à droite, fondue vers le noir sous la marque empilée à gauche ; en 4:3 et en hauteur, la marque monte et l'illustration occupe le bas, son haut toujours fondu ; dans une bande (3:1, 4:1), la marque prend la moitié de la hauteur.
  Lumière fixe.
  Le fronton d'un jeu sans média garde sa carte (titre, filet, fabricant et année).
- **Police des afficheurs** : « Saira Points » ([packages/core/src/dmdfont.ts](../../packages/core/src/dmdfont.ts)), dessinée point par point d'après Saira, à la vraie résolution du DMD : rectangles aux coins chanfreinés, C et G à terminaisons horizontales, R à jambe oblique, A pointu, 4 ouvert.
  Petit 5 × 7 (textes courants) ; grand 9 × 14 en traits de deux points (titres, scores, PRESS START ; un titre de 12 lettres tient dans 122 points) ; horloge : le grand doublé au plus proche voisin (18 × 28) ; marque 11 × 11 au trait d'un point, espacée de 4 points (PINBALL : 91 points).
  Le DMD vivant (processus principal) et les afficheurs de repli des fenêtres (`dmd` en 128 × 32, `fullDmd` en 160 × 90, qui agrandit le grand ×3 ou ×2 pour un titre court) écrivent avec les mêmes signes : les fenêtres lisent une copie, `app/renderer/police-points.js`, écrite par `node scripts/police-points.mjs` après `npm run build` ; un test refuse une copie en retard.
  Press Start 2P, l'ancienne police des petits textes, n'est plus livrée.
- **La marque sur un afficheur** : empilée, 3 lignes libres en haut et en bas, 4 entre les mots.
  Un afficheur n'a qu'une couleur : la lumière porte la hiérarchie que l'interface donne par la couleur, CYBER à la nuance 11, PINBALL au plein éclat (15).
- **Couleur du DMD** (Menu système > « Ma borne » > « DMD et LED » > « Couleur du DMD »**, gardée dans `<données>\medias.json`, champ `dmdColor`) : la couleur des points du DMD du front-end et des afficheurs de repli, pas celle du DMD de VPX en partie (celui de la table).
  **Vert signal** `#8BE23A` par défaut (jeton `dmd` du design system), ou un préréglage : sarcelle `#36C9B4`, encre claire `#E6F0EC`, bleu glacier `#5FB4CF`, ambre doux `#F2B33D`, orange plasma `#FF8A1F` (l'ancienne couleur) ; ou **« Couleur libre… »**, écrite en hexadécimal au clavier à l'écran (`#8BE23A`, `8be23a` ou `#8be`).
  Une couleur trop sombre (aucune composante à 112 ou plus) est refusée, avec la raison ; une valeur illisible dans `medias.json` revient au vert signal.
  Le choix revient sur sa ligne ; le DMD, qui montre la marque dans le menu système, change aussitôt (`setDmdColor`, [app/renderer/fallback.js](../../app/renderer/fallback.js), appliqué à chaque état ; le repli minimal suit le jeton `--dmd`).
- **Point éteint** : un gris neutre à peine visible, le même pour toutes les couleurs, au lieu d'un voile de la couleur sur toute la grille.
- **Preuves** : [marque-dmd.test.ts](../../packages/core/src/test/marque-dmd.test.ts) (copie de la police à jour et chargée avant `fallback.js` ; aucun texte d'afficheur dessiné avec une police de texte ; marque écrite seulement par ses composants ; même couleur par défaut dans le cœur, `fallback.js`, `theme.css` et le design system ; préréglages lisibles et tirés de la DA ; couleur libre et couleur refusée ; réglage lu, gardé et envoyé aux fenêtres), [livedmd.test.ts](../../packages/core/src/test/livedmd.test.ts) (dessin des trois tailles, marque à ses nuances).

### Couleur de chaque table dans le front-end

À l'écran des tables, chaque table a sa couleur : la lumière du bandeau de la roue (halos et néon des arcs), une lueur douce derrière la roue, le halo des cadres et des panneaux, le verre fumé et les rails des écrans de repli prennent la teinte de ses médias.
La teinte habille l'ambiance, jamais la sélection : l'anneau, la lueur sous la table choisie, le titre et l'action principale restent au vert signal, seul repère du choix courant.
Sans table (menu système, réglages) ou sans teinte, le front-end garde la sarcelle de la marque (`#36C9B4`).

- **Réglage** : Menu système > « Tables » > « Roue » > **« Couleur de chaque table dans le front-end »** (affichée par défaut ; Start : couper), gardé dans `<données>\medias.json`, champ `tableColor`.
- **D'où vient la teinte** ([packages/core/src/tabletint.ts](../../packages/core/src/tabletint.ts)) : le fronton d'abord (son média, sinon l'image allumée du `.directb2s`), puis le logo, puis le plateau ; le premier qui a assez de couleur la donne.
  L'image (ou quatre moments d'une vidéo) est réduite à 64 points de large par le convertisseur hors écran ([app/src/media-convert.ts](../../app/src/media-convert.ts)) ; les pixels presque noirs, presque blancs ou gris ne votent pas ; les autres votent pour leur teinte (OKLCH), pesés par leur chroma ; la teinte retenue est la moyenne autour du pic de l'histogramme.
- **Corrections** : moins de 8 % de pixels colorés, ou une chroma moyenne sous 0,06 (fronton en noir et blanc, très sombre) : pas de teinte, la sarcelle de la marque.
  Sinon la clarté est imposée (0,75, celle de la sarcelle) et la chroma bornée (0,09 à 0,15) : un fronton très sombre ou très terne donne une lueur aussi visible que les autres, jamais criarde.
  Une teinte à moins de 35° du vert signal en est écartée, de son côté ; à moins de 8°, elle est abandonnée.
  La lueur ne dépasse jamais 25 % de la teinte sous un texte : l'encre reste à 7:1 au moins, le texte atténué à 4,5:1, quelle que soit la teinte (vérifié par le test).
- **Une fois par média** : la mesure est gardée dans `<données>\cache\teintes-tables.json` (clé : chemin, taille, date du fichier ; un refus aussi) et refaite quand le média change : son adresse datée (`mediaUrl`) change, la teinte est relue.
- **Pendant le défilement, rien n'est calculé** ([app/src/table-tint.ts](../../app/src/table-tint.ts)) : la teinte ne change que lorsque la table choisie est restée en place 260 ms ; d'ici là l'ambiance garde la teinte d'avant, puis passe à la nouvelle en fondu de 280 ms, au pas du fondu des médias (propriété `--table-tint` déclarée comme couleur, [app/renderer/theme.css](../../app/renderer/theme.css)).
  Rien ne bouge dans la mise en page : les couches sont fixes, seule leur couleur change.
- **Bandeaux des roues** : chaque dessin source ([docs/design-system/src/roues](../design-system/src/roues)) est coupé par `node docs/design-system/src/roues.mjs` en trois couches ([app/renderer/roues](../../app/renderer/roues)) : le fond (verre, ombres, lueur verte), la lumière (halos et néon, un masque peint dans la teinte) et le dessus (cœurs clairs, flèches, plaque du titre).
  Modifier la source, puis relancer le script.
  La lumière et le dessus débordent du bandeau de 60 unités en haut et en bas (`DEBORD`, même valeur que l'`inset` de `.wheel-stage::before` et `::after`) : le halo du pointeur, dessiné au bord haut au-dessus de la table choisie, était coupé net par le cadre de l'image.
  Preuve : [roue-arret.test.ts](../../packages/core/src/test/roue-arret.test.ts) (aucun halo flou d'une couche ne sort de son cadre en hauteur ; l'anneau vert, une fois tracé, devient un trait fermé, sans la fente que laissait à midi la jointure du pointillé).
- **DMD du front-end** : dans « Couleur du DMD », le choix **« Couleur de la table »** (`dmdColor` vaut `table`) donne aux points la teinte de la table montrée, plus vive que celle de l'ambiance (clarté 0,80, chroma 0,12 à 0,20).
  Elle se mesure d'abord sur le média de l'écran du DMD (FullDMD, ou capture du DMD de la machine : ses points y donnent la couleur, le cadre noir ne vote pas), plus proche du vrai DMD que le fronton, qui garde l'ambiance (12/11/2026 : un fronton rouge et bleu donnait des points rouges à une machine au DMD orange) ; sans teinte sur ce média, celle du fronton (`TintSubject.dmdFiles`, [app/src/table-tint.ts](../../app/src/table-tint.ts)) ; une table sans teinte garde le vert signal.
  Le défaut reste le vert signal.
- **Preuves** : [couleur-table.test.ts](../../packages/core/src/test/couleur-table.test.ts) (teinte dominante, logo détouré, fronton terne, sombre ou pâle, écart au vert signal, lisibilité pour toutes les teintes, cache, rien de mesuré pendant le défilement, fronton puis plateau).

### Roue fluide en rafale

Défiler vite dans la roue ne dédouble jamais un médaillon, et un appui coûte le moins possible au rendu.

- **Halo de la table choisie** ([app/renderer/frontend.js](../../app/renderer/frontend.js), `wheelHalo`, `haloSync`) : chaque médaillon a un jumeau posé sous toute la roue, qui reçoit ses places dans le même appel (`placeWheelItem`) ; leurs glissements partent ensemble du même point.
  Seul le jumeau de la table choisie porte une copie du logo, dont le halo vert (`drop-shadow`) suit la forme ; les autres sont vides.
  Auparavant, une copie unique passait de table en table et repartait de la place visée par la nouvelle table, pas de celle où on la voyait : en rafale, deux médaillons glissaient décalés (13 novembre 2026).
- **Aucun calcul de mise en page forcé pendant un appui** : l'onde est placée en pour-cent de sa taille (`PULSE_SIZE`), la durée du glissement est lue une fois par style de roue, un logo qui entre paraît en fondu par `@starting-style` (classe `.entering`), la taille de l'anneau est mesurée après l'image suivante (`afterPaint`), la largeur de l'écran pour le flou du titre vient d'un observateur de taille, et le gardien du défilement ([app/renderer/scroll-keeper.js](../../app/renderer/scroll-keeper.js)) ne relit plus la position de chaque élément quand rien n'était défilé.
  Mesuré hors écran sur une rafale de vingt appuis : 5 à 6 ms de rendu par appui au lieu de 14 à 19.
- **Preuves** : [roue-rafale-chromium.test.ts](../../packages/core/src/test/roue-rafale-chromium.test.ts) (vrai Chromium hors écran, rafale d'un appui toutes les 70 ms, horloge des glissements avancée par le banc de 10 ms en 10 ms : aucun logo dessiné à deux endroits ; l'ancien code en montrait à 144 pas sur 230 ; le chemin d'un appui ne lit ni la mise en page ni les styles calculés).

### Gestionnaire : « Médias du jeu »

Fiche d'une table > « Médias du jeu » : ce que le front-end montre pour ce jeu, écran par écran, sans manipuler de fichier.
Une carte par média : son libellé (Logo, Plateau, Fronton, Afficheur, Afficheur large, Topper, Chargement, Musique du jeu, Son de lancement, Prospectus, Règles) et son nom de fichier entre parenthèses, **où** il s'affiche (écran et moment, en clair, au lieu des noms d'écran de Popper), son **rôle** en une phrase, un aperçu (l'image, une image de la vidéo, ou la description de l'affichage par défaut), et l'état : « Présent », ou ce qui est montré à la place (« À la place : image du .directb2s », « À la place : média commun de la borne », « À la place : Afficheur large », « Affichage par défaut »), avec dimensions et poids.
Un média que la borne ne montre pas le dit (« Cette borne n'a pas d'écran topper », afficheur étroit qui montre l'Afficheur et non l'Afficheur large).
Les fichiers de `medias\` que le jeu n'utilise pas sont listés avec la raison (nom d'un autre jeu, format illisible, type sans écran).

- **Actions**, aux boutons ou à la souris : prendre un fichier dans `<racine>\import` (sous-dossiers compris, seulement les formats que le front-end lit pour ce média), le choisir sur ce PC, ou le glisser sur la fenêtre (sur la vue d'ensemble, le type se lit dans le nom : `(Wheel) …`, `bg.png` de VPinFE, dossier `Wheel` de Popper ou `Backglass Images` de PinballX, sinon c'est le média choisi) ; remplacer ; mettre à la corbeille ; demi-tour du plateau et de la vidéo de chargement (l'aperçu est tourné comme le front-end le montrera, vu du joueur) ; volume relatif du jeu (0 à 200 %) ; pour le prospectus et les règles, la liste des pages, et pour chaque page monter, descendre, remplacer ou retirer.
- **Rien n'est écrit avant « Enregistrer »**, qui montre d'abord le plan, une ligne par média.
  Les fichiers sont rangés sous `(Type) <nom du dossier>[ N].ext` (un fichier venu du dossier d'import le quitte, un fichier choisi sur ce PC ou glissé est copié) ; tout autre fichier de ce type pour ce jeu (ancien fichier, autre format qui passerait devant, nom de VPinFE, format illisible) va à la corbeille ; les pages sont renumérotées en deux temps, sans qu'aucune n'en écrase une autre.
  Demi-tour et volume vont dans le `.info` sous `CyberPinball.medias` (`halfTurn`, `volume`), ses autres champs conservés.
  Quitter avec des changements demande « Quitter sans enregistrer ? ».
- Code : `packages/core/src/mediaedit.ts` (où s'affiche chaque média, brouillon, plan, renommage, `.info`), tests dans `packages/core/src/test/mediaedit.test.ts` ; écrans dans `app/src/library-medias.ts`, cartes dans `app/renderer/library.js` et `library.css`.

### Import des médias

Les autres frontends les rangent autrement ; l'import les reconnaît et les renomme.
Code : [packages/core/src/mediaimport.ts](../../packages/core/src/mediaimport.ts), raccordé à l'ajout de tables ([tableimport.ts](../../packages/core/src/tableimport.ts)) et à l'écran de reprise ([app/src/media-import.ts](../../app/src/media-import.ts)) ; tests dans [mediaimport.test.ts](../../packages/core/src/test/mediaimport.test.ts).

**Ce qui est reconnu**, dans une archive, une sélection ou le dossier d'import :

| Rangement | Exemple | Type |
| --- | --- | --- |
| PinUP Popper | `POPMedia\Visual Pinball X\Wheel\<jeu>.png`, dossiers `PlayField`, `Backglass`, `DMD`, `Menu` (FullDMD), `Topper`, `Loading`, `Audio`, `AudioLaunch`, `GameInfo`, `GameHelp`, `Other2` | nom du dossier ; pages `<jeu>01.png`, `<jeu>02.mp4` dans l'ordre |
| PinballX | `Media\Visual Pinball\Wheel Images\<jeu>.png`, `Table Videos`, `Table Images`, `Backglass Videos`, `DMD Videos`, `FullDMD Videos`, `Topper Videos`, `Launch Audio`, `Table Audio`, `Loading Videos`, `Real DMD…` ; `Media\Flyer Images\Front`, `Back`, `Inside1`… (pages du prospectus, dans cet ordre) | nom du dossier |
| VPinFE | `medias\bg.png`, `wheel.png`, `table.mp4`, `dmd.png` (FullDMD)… | nom fixe du fichier |
| Déjà nommé | `(Backglass) <n'importe quel nom>.mp4`, partout | le nom |

Un dossier de Popper au nom ambigu (`DMD`, `Audio`, `Backglass`, `Topper`, `Loading`, `Menu`) n'est reconnu que sous `POPMedia` ou à côté d'un dossier sans équivoque (`Wheel`, `PlayField`, `GameHelp`…) : seul dans une archive, un dossier `DMD` est plus souvent le contenu FlexDMD d'une table.
Un dossier DMD que charge le script reste toujours un dossier DMD.

**Attribution au jeu** : dans le paquet d'une seule table, le média lui revient.
Sinon, d'après le nom du fichier (nom du jeu chez Popper et PinballX, `(Type) <nom>`, dossier de la table pour VPinFE) : nom d'un `.vpx` ou du dossier, ROM, titre (fabricant et année départagent), jeu reconnu par la base VPS (comparé au `VPSId` du `.info` des tables installées).
Un média nommé d'après un jeu absent de l'import et des tables installées reste où il est (« Non importé »).

**Rangement** : `(Type) <nom du dossier>.ext`, pour toutes les versions du jeu.
Un seul fichier par type, le meilleur format (vidéo avant image pour les écrans, Visual Pinball X avant Visual Pinball 9) ; les autres sont signalés « Doublon ».
Prospectus et règles gardent toutes leurs pages (`(GameHelp) <nom>.png`, `(GameHelp) <nom> 2.png`…).
Un média du même type déjà présent dans la table (autre extension ou autres pages comprises) part à la corbeille ; le plan le marque « remplace l'existant ».

**Jamais rangés, toujours signalés dans le plan** : les formats que le front-end ne lit pas (`flv`, `f4v`, `avi`, `mov`, vérifié sur Electron 44.5.1 : à convertir en mp4 ou webm), un format non prévu pour le type (une vidéo en guise de logo, par exemple), les médias d'un autre émulateur que Visual Pinball (`POPMedia\Future Pinball\…`).
En mode déplacement (dossier d'import), ils restent dans `import\`.

**Reprendre les médias de PinUP Popper / PinballX** (Menu système > Tables > Migration > Reprendre les médias) : propose les installations trouvées aux emplacements habituels (`C:\vPinball\PinUPSystem\POPMedia`, `C:\PinballX\Media`…) ou un dossier choisi (`PinUPSystem`, `POPMedia`, le dossier d'un émulateur ou d'un type, le dossier de PinballX ou son `Media`).
Chaque média est rapproché d'une table installée, sans jamais deviner : un nom qui désigne plusieurs tables (« Fathom » pour deux versions rangées dans deux dossiers) n'est pas copié.
La **base de l'installation** (celle de Popper : `GameName`, `GameFileName` ; celle de PinballX : description et nom de chaque jeu) relie chaque jeu à son fichier `.vpx` (`installationGameFiles`, `packages/core/src/installation.ts`) : les médias d'une table reprise sous le nom de son `.vpx`, autre que celui de ses médias (« AC-DC Premium » pour « AC-DC LUCI Premium (Stern 2013).vpx »), trouvent leur table, reconnue par « base de l'installation ».
Un jeu dont la table est dans l'installation mais pas encore dans Cyber Pinball a sa section, « Pas encore dans Cyber Pinball : <n> tables », et l'action **« Reprendre aussi ces tables »** ouvre « Depuis une autre installation… » avec ces tables déjà cochées, pour les ajouter avec leur VPX et leurs médias (voir « Reprendre une table d'une autre installation » dans [Ajouter une table](ajouter-une-table-l-entonnoir-le-catalogue.md#ajouter-une-table--lentonnoir-le-catalogue--récupérer--liste-dattente)).
Le plan donne, table par table, les types reçus, leur taille, comment la table a été reconnue et ce qui est remplacé ; puis les formats illisibles, les tables pas encore dans Cyber Pinball, les jeux sans table et les autres émulateurs.
La place libre est vérifiée avant.
« Copier » **copie** : l'installation d'origine n'est jamais modifiée.
Les PuP-Packs (`PUPVideos`) et les médias par défaut de Popper (`System`, `Default`) ne sont pas repris.

**Cas non reconnus** : le champ `MediaSearch` de Popper (un média partagé par plusieurs tables, avec joker) et `MediaWildCard` (plusieurs fichiers tirés au hasard : un seul est gardé) ; les médias d'un jeu dont la base de Popper ou de PinballX ne donne pas le `.vpx`, quand leur nom ne ressemble ni au `.vpx`, ni au dossier, ni au titre, ni à un jeu VPS (ils sont listés « Sans table ») ; `Table Images Desktop` et `Table Videos Desktop` de PinballX (vues de bureau) ; `Wheelbar` et les thèmes de Popper ; les sous-dossiers d'un dossier de type autres que les prospectus de PinballX.

### Le diagnostic des médias

Le diagnostic ([doctor.ts](../../packages/core/src/doctor.ts), fiche > « Diagnostiquer et réparer ») vérifie, sans rien lancer :

| Constat | Quand | Correction |
| --- | --- | --- |
| Format que le front-end ne lit pas | `flv`, `f4v`, `avi`, `mov` (vérifié avec `canPlayType` dans Electron 44.5.1), `wmv`, `mpg`, `mpeg` (absents des formats de Chromium) ; ou format non prévu pour le type (`(Wheel)` en `jpg`, `(Loading)` en image…) | corbeille si une version lisible porte le même nom ; sinon, convertir (HandBrake) |
| Afficheur rangé sous le mauvais type | `(DMD)` en 16:9, ou `(FullDMD)` en 4:1 (frontière 8:3), et le nom de l'autre type libre ; quand les deux noms sont pris, rien ne paraît : l'écran du DMD prend déjà celui qui le remplit le mieux (information, dans « À savoir ») | renommer dans l'autre type, en un geste |
| Média mal nommé | `(Type) nom` dont le nom n'est ni celui d'un `.vpx` du dossier ni celui du dossier (pages comprises : `Nom 2`, `Nom_02`) ; fichier sans `(Type)` ni nom de VPinFE | renommer `(Type) <dossier>` (la page suivante libre pour le prospectus et les règles), sauf si `medias\` montre déjà ce type |
| Média rangé hors de `medias\` | rangement de PinUP Popper (`POPMedia\…\Wheel\<jeu>.png`) ou de PinballX (`Media\Visual Pinball\Wheel Images\…`) dans le dossier de la table, ou `(Type) nom` posé à côté de la table ; les dossiers `pupvideos`, `pinmame`, `cache` et celui du DMD du script sont ignorés | ranger et renommer `medias\(Type) <dossier>.ext` ; l'arborescence vidée part à la corbeille |
| Proportions différentes de l'écran | écart de plus de 15 % (`MEDIA_RATIO_TOLERANCE`, mesuré en rapport) avec la zone du rôle dans le modèle de borne : plateau recadré (seul le rapport des côtés compte, le front-end tourne le média ; un fichier presque carré ne dit pas où sont les flippers), fronton étiré à tout son écran et donc déformé (`fit: 'fill'`, comme pendant la partie), bandes noires ou média en portrait sur un écran en paysage pour le DMD et le topper, FullDMD montré réduit faute de DMD | — (information) |
| Média très lourd | image de plus de 25 Mo ou de plus de 7680 × 4320 pixels, vidéo de plus de 300 Mo, son de plus de 50 Mo (`MEDIA_SIZE_LIMITS`, `MEDIA_MAX_PIXELS`) | — (réencoder) |
| Médias en double | plusieurs fichiers d'un même type pour un même jeu (`.png` et `.webp`, nom du `.vpx` et nom du dossier, `(Wheel)` et `wheel.png` de VPinFE) : un seul est montré ; une version du dossier qui a son propre média n'est pas un doublon | corbeille des fichiers jamais montrés de même nature ; une image à côté d'une vidéo du même type est seulement signalée |
| Média que le front-end n'a pas pu lire | erreur enregistrée par l'affichage dans le fichier des erreurs, pour un fichier inchangé depuis | corbeille pour un fichier abîmé ou refusé (décodage, format, image) ; seulement signalé pour une erreur de disque |

**Pas de backglass** (`backglassMissing`) : une table sans `.directb2s` laisse l'écran du fronton au front-end pendant la partie ; le constat dit ce qu'il y montre vraiment, le média Backglass de la table (son nom), sinon son titre ou le média de fronton commun à la borne.
Il se tait quand la borne n'a pas d'écran de fronton, ou quand un PuP-Pack de la table occupe le fronton (`pupShowsBackglass`) ; une table VR dont la pièce a son propre fronton (`tableHasVrRoom`) n'est pas invitée à recevoir un `.directb2s`.
**À savoir** : les informations sans rien à régler dans Cyber Pinball (proportions d'un média, fronton absent, afficheur dont les deux noms sont pris) portent `note` ; le Diagnostic et la vérification d'une table ajoutée les montrent à part, en bas, dans une section « À savoir », sans « Ignorer », si bien que la vérification d'une table reprise ne garde en tête que ce qui se répare.
Chaque correction est sûre : renommer, déplacer dans `medias\`, ou mettre à la corbeille (`trash\`) ; rien n'est converti ni supprimé.
« Tout réparer » enchaîne les corrections sans qu'elles visent deux fois le même fichier ; ce qui dépend d'un renommage (le type d'un afficheur mal nommé, par exemple) est vérifié à l'analyse suivante.

Chaque constat peut aussi être ignoré pour cette table (« Ignorer « … » », ou le constat lui-même quand il n'a pas de réparation) : retenu par son code dans le `.info` de la table (`CyberPinball.diagnosis.ignored`, `setFindingIgnored`), il ne compte plus nulle part, ni dans la santé de la borne, ni dans « Ce qu'il manque pour jouer » (`splitIgnoredFindings`).
Le Diagnostic le garde dans « Ignorés », d'où « Ne plus ignorer « … » » le rétablit.
Tous les constats du même code partent ensemble.

**Fichier des erreurs de lecture** : `<racine>\data\logs\medias-erreurs.json`, écrit par le processus principal ([mediaerrors.ts](../../packages/core/src/mediaerrors.ts), `recordMediaError`) quand l'affichage lui transmet une erreur de `<video>`, `<audio>` ou `<img>`.
Format, version 1 :

```json
{
  "version": 1,
  "errors": [
    {
      "file": "D:\\CyberPinball\\tables\\T2 (Williams 1991)\\medias\\(Backglass) T2 (Williams 1991).mp4",
      "type": "Backglass",
      "role": "backglass",
      "kind": "decode",
      "message": "PIPELINE_ERROR_DECODE",
      "size": 48211763,
      "mtimeMs": 1792500000000.123,
      "first": "2026-10-21T20:14:03.512Z",
      "last": "2026-10-21T20:31:40.007Z",
      "count": 3
    }
  ]
}
```

`kind` vient de `MediaError.code` (2 `network`, 3 `decode`, 4 `unsupported`, autre `other`) ou vaut `image` pour `<img>` ; une lecture interrompue (code 1, on a changé de table) n'est pas enregistrée.
`type`, `role` et `message` (300 caractères au plus) sont facultatifs.
Une entrée ne vaut que pour le fichier tel qu'il était (même taille, même date) : un fichier remplacé ou réencodé n'est plus signalé, et ses anciennes entrées disparaissent au prochain enregistrement. 200 entrées au plus, les plus récentes.

### Médias depuis VPinMediaDB : « Chercher les médias »

[VPinMediaDB](https://github.com/superhac/vpinmediadb) (dépôt `superhac/vpinmediadb` sur GitHub) range les médias d'environ 1 155 jeux, un dossier par identifiant VPS.
Cyber Pinball les télécharge **à la demande seulement**, jamais d'office.

- **Avertissement** : VPinMediaDB ne déclare aucune licence (`license: null` dans l'API GitHub, ni fichier LICENSE ni conditions d'usage, vérifié le 21 octobre 2026).
  Ses médias appartiennent à leurs auteurs, et les images des jeux à leurs fabricants : **usage personnel, sur sa borne seulement**, sans les redistribuer.
  Cyber Pinball n'en livre aucun.
  L'avertissement s'affiche au premier usage (accepté une fois, date dans `<données>\mediadb.json`) et en tête de chaque plan.
  La source est citée dans le plan, sur la fiche du média (« Source : VPinMediaDB (github.com/superhac/vpinmediadb), téléchargé le … », puis l'adresse du fichier) et ici.
- **Deux entrées** :
  - fiche d'une table > « Médias du jeu » > « Chercher les médias » : tout ce que VPinMediaDB a pour ce jeu ;
  - menu système > « Tables » > « Trouver les médias manquants » : ce qui manque à chaque table, une table par dossier.
    D'ici, un média existant n'est jamais remplacé, et une table reconnue au titre seulement n'est pas servie d'office.
- **Correspondance** : par le `VPSId` du `.info`.
  Sinon, par le nom de la table (titre, initiales, fabricant, année) rapproché de la base VPS (section « Base VPS »), qui donne l'identifiant.
  Un identifiant connu mais absent de VPinMediaDB mène seulement aux autres éditions du même jeu (Pro, Premium, LE), à vérifier sur les aperçus.
  Quand rien n'est sûr, la recherche approfondie prend le relais (section suivante).
  « Pas le bon jeu ? » est toujours proposé : il montre les jeux possibles avec leurs raisons, et permet de chercher un autre titre au clavier.
- **Ce qui est repris** :

  | VPinMediaDB | Média | Remarque |
  | --- | --- | --- |
  | `wheel.png` | Logo `(Wheel)` | 500 × 500, transparent |
  | `1k/table.mp4`, sinon `table.png` en 1k ou 4k | Plateau `(Playfield)` | la vidéo d'abord ; en largeur, flippers à droite, et le front-end le tourne |
  | `1k/bg.png` | Fronton `(Backglass)` | 1k seulement |
  | `1k/dmd.mp4`, sinon `1k/dmd.png` | Afficheur large `(FullDMD)` | 16:9 ; réduit sur un afficheur 4:1 |
  | `flyer.png` | Prospectus `(GameInfo)` | page 1 |
  | `audio.mp3` | Musique du jeu `(Audio)` | |

  Non repris : `cab.png` (photo du meuble), `fss.png` (plateau et fronton pour un seul écran), `realdmd*.png` (DMD physique, que Cyber Pinball ne gère pas).
  VPinMediaDB n'a jamais d'afficheur 4:1, de topper, de vidéo de chargement, de son de lancement ni de règles.
  Pour un jeu que VPinMediaDB n'a pas du tout, la base VPS donne encore l'image du fronton (aperçu de son `.directb2s` le plus récent) et celle du plateau : prévues à l'ajout par le catalogue et rangées à l'installation quand l'écran n'a pas de média, la source notée (voir « Ce qu'il faut » dans [Ajouter une table](ajouter-une-table-l-entonnoir-le-catalogue.md#ajouter-une-table--lentonnoir-le-catalogue--récupérer--liste-dattente)).
- **1k ou 4k** : seule l'image du plateau existe en 4k.
  Le réglage « Qualité téléchargée (VPinMediaDB) » se trouve dans menu système > « Tables » > « Son et mode attente » :
  - automatique : 4k si la zone du plateau, dans la configuration active, dépasse 2 560 points de côté ;
  - ou 1k, ou 4k, imposé.

  Le plan dit ce qui a été choisi, et pourquoi.
- **Plan à valider** : une carte par média.
  - Chaque carte montre l'aperçu (l'image 1k du même média, reçue et vérifiée, qui sert ensuite au téléchargement), le poids (requête HEAD, gardé par MD5 dans `downloads\vpinmdb.sizes.json`), ce qui est remplacé et le nom sous lequel le média sera rangé.
  - Start sur une carte passe à la variante suivante : vidéo, image, ou rien.
  - Chaque aperçu reçu est autorisé au protocole `cyber-media://` avant d'être montré (`stagePreviews`) : toutes les vignettes s'affichent, même quand l'écran se redessine pendant leur arrivée (la liste des tables de Pinball FX en reçoit des centaines), au lieu de rester des cases grises.
  - Sont retenus d'office : les médias qui manquent, et la nouvelle version d'un fichier déjà venu de VPinMediaDB.
    Un média mis par l'utilisateur reste « Gardé » ; pour le remplacer, il faut le demander (« Remplace l'actuel », l'ancien part à la corbeille).
- **Téléchargement** : un fichier à la fois, reçu sous `downloads\vpinmediadb\<md5>.ext.part`.
  La taille et le MD5 de l'index sont vérifiés, puis le fichier est rangé sous `medias\(Type) <nom du dossier>.ext`, et l'ancien fichier part dans `trash\<date> Médias <dossier> (VPinMediaDB)`.
  Un téléchargement interrompu (coupure, 30 s sans données) ou invalide (MD5, taille, réponse HTTP) est effacé : il ne reste rien, et les autres médias continuent.
  Progression : « Plateau (2 sur 6) : 1,2 Mo sur 1,7 Mo… ».
- **Source dans le `.info`** : `CyberPinball.medias.sources.<Type>` reçoit `{ origin: "VPinMediaDB", url, date, vpsId, key, md5, file }`.
  Le demi-tour forcé d'un plateau remplacé est retiré : le nouveau fichier suit le standard, que le front-end tourne de lui-même.
  Une recherche suivante dit « À jour », ou propose la nouvelle version si le MD5 de l'index a changé.
- **Index** : `vpinmdb.json` (1,7 Mo), téléchargé au premier usage depuis `https://raw.githubusercontent.com/superhac/vpinmediadb/main/vpinmdb.json` et gardé dans `<racine>\downloads`.
  - Il est revérifié au plus toutes les 12 heures, en arrière-plan ; GitHub répond 304 (ETag) s'il n'a pas changé.
  - Sans réseau, le cache sert, et une réponse invalide ne le remplace jamais.
  - Sur une connexion lente, la lecture n'est abandonnée que si GitHub ne répond plus du tout pendant 20 s (connexion, premier octet, puis chaque morceau relancent le compte), jamais au bout d'une durée totale ; une coupure passagère est réessayée deux fois, avec une attente qui double (`fetchTextPatiently`, `packages/core/src/patientfetch.ts`).
  - Seules les adresses du dépôt `superhac/vpinmediadb` sont acceptées.
    L'entrée `bg_thumbs`, vide, est ignorée.
- **Volumes mesurés** (21 octobre 2026, requêtes HEAD) :

  | | 1k | 4k |
  | --- | --- | --- |
  | Terminator 2, tout par défaut (vidéos du plateau et de l'afficheur) | 14 Mo | 14 Mo |
  | Terminator 2, images seulement | 9,8 Mo | 20 Mo |
  | Image du plateau seule (Terminator 2) | 3,5 Mo | 13 Mo |
  | Moyenne de 12 jeux, tout par défaut | 11 Mo | 17 Mo |
  | Moyenne de 12 jeux, image du plateau | 3,2 Mo | 13 Mo |

  Le 4k ne change que l'image du plateau, environ quatre fois plus lourde.
  Par défaut, la vidéo du plateau (1k) passe avant elle, quand elle existe.
- **Code** : `packages/core/src/mediadb.ts`, tests dans `packages/core/src/test/mediadb.test.ts` (index et fichiers factices servis par un serveur local, aucun accès au réseau) ; écrans dans `app/src/media-download.ts`.

### Propositions de chaque média et recherche approfondie

Le choix automatique ne suffit pas toujours : le nom de la table a été changé, abrégé ou traduit (« GOTG_2.1.1.vpx », titre « Gardiens de la galaxie »), ou l'on préfère une autre version du fronton.
Fiche d'une table > « Médias du jeu » > un média > **« Voir les propositions »** montre toutes les versions trouvées pour ce média, chacune avec son aperçu, d'où elle vient et pourquoi.

- **Ce qui est proposé**, dans cet ordre :
  - VPinMediaDB, pour **chaque jeu retenu** : le jeu reconnu, ses autres éditions (Pro, Premium, LE), et les jeux proches que l'on ajoute ; chaque variante (vidéo ou image, 1k ou 4k), un fichier partagé par deux éditions une seule fois ;
  - ce que la **table a déjà**, sans le savoir :
    - dans le **PuP-Pack** : le fichier que `screens.pup` donne à l'écran du fronton, du topper ou de l'afficheur ; ceux que `triggers.pup` pose au démarrage (`D0`) ou en attente (`E454`), et la musique de ses écrans `MusicOnly` (les fonds des modes de jeu sont des scènes de partie, écartés) ; les cadres de `PupImages` à la proportion d'un fronton (`-4x3`, `-5x4`, `-16x9`) ; les dossiers dont le nom parle (`BGDefault`, `Topper`, `DMDAttract`…), sauf pour un fichier dont `screens.pup` ou `triggers.pup` disent déjà l'écran ; les musiques (plus de 500 ko) ;
    - les animations du dossier FlexDMD ou UltraDMD que charge le script ;
    - dans **chaque `.directb2s` du dossier** : l'image allumée et l'afficheur, puis les mêmes **« tout allumés »**, toutes les ampoules visibles de `<Illumination>` posées dessus comme le serveur B2S les montre quand elles s'allument (un morceau d'image allumée se pose tel quel, une lueur prend la couleur de l'ampoule).
      La composition se fait une fois, sans dépendance (lecture et écriture des PNG dans `packages/core/src/png.ts`), et est gardée dans `<données>\cache\medias` (`b2sLitImages`, `packages/core/src/b2simage.ts`) ; sur Terminator 2 (8 flashers, image de 2 517 × 2 397), environ 4 s la première fois.
      Un second `.directb2s` est un autre fronton possible, proposé avec son nom (« que VPX ne charge pas ») ; une copie du même fichier sous un autre nom, fréquente (le nom du site à côté du nom de la table), n'est lue ni montrée qu'une fois ;
    - dans le **`.vpx`** : la capture que l'auteur y a rangée ; l'image du plateau à plat (champ `IMAG`, sauf les atlas du Visual Light Mapper) ; la carte de règles que désigne le Markdown des règles (`![…](nom)`), sinon une image au nom de carte ; le fronton et le logo de la pièce VR.
      Seul le début de chaque image est lu pour son nom ; les images retenues sont écrites une fois dans `<données>\cache\medias` (`vpx-<clé>-…`), relues si le `.vpx` change ;
  - les **sites communautaires**, avec le compte de l'utilisateur : **VPForums**, puis **VPUniverse** en dernier recours (voir « Médias des sites communautaires » ci-dessous) ;
  - les **vignettes de la base VPS** : le plateau de chaque version de la table et le fronton de chaque `.directb2s` (de 352 × 626 à 1 000 × 750, « basse définition »), souvent la seule image d'un jeu absent de VPinMediaDB : 2 608 jeux en ont une du plateau, 1 746 du fronton ;
  - les **musiques de la base VPS** (`soundFiles`) : liens de partage Dropbox vers un mp3 ou un ogg, téléchargés seulement quand on choisit la carte, un par un.
    Le fichier reçu est contrôlé à sa signature (`isAudioFile`) : un lien mort renvoie une page HTML, la carte dit alors « Lien mort ».
- **Choisir** : Start sur une proposition la met dans le brouillon, comme un fichier du dossier d'import (une nouvelle page pour le prospectus et les règles).
  Un fichier en ligne est téléchargé et vérifié (MD5 de VPinMediaDB) au moment du choix ; un fichier de la table est copié, l'original reste en place.
  La carte dit « Actuel » ou « Choisi, à enregistrer » ; la carte « Actuel » d'un fichier en ligne montre le fichier de la borne (la vidéo elle-même, pas l'image d'aperçu du site).
  **Reprendre le média actuel ne change rien** : Start sur la carte « Actuel » le dit au lieu de le remettre dans le brouillon, et un fichier choisi dont le contenu est celui de l'actuel, octet pour octet (taille puis MD5, `sameFileContent`), ramène le brouillon à l'état d'aujourd'hui avec « identique au média actuel » : sans cela, « Enregistrer » réécrivait le même fichier et l'on croyait que l'ancien restait.
  Rien n'est écrit avant « Enregistrer », qui montre le plan ; la provenance d'un fichier téléchargé (VPinMediaDB ou Base VPS, adresse, date, identifiant VPS) va dans le `.info`, et disparaît si le média est ensuite remplacé à la main.
  Une musique proposée s'écoute dès que sa carte est choisie.
- **Galerie** : les propositions s'affichent en tuiles, quatre par rangée au bureau, trois en borne, l'aperçu au format de l'écran qui montre le média (16:9 pour l'afficheur large et le chargement, 4:1 pour l'afficheur, 4:3 pour le fronton, carré pour le logo, en hauteur pour le plateau et les pages) ; sur chaque tuile, le nom, la provenance, l'état et la popularité, et sous la galerie le détail de la tuile choisie (d'où elle vient, ce qui arrive au téléchargement, le jeu retenu).
  Start met la proposition dans le brouillon **et reste sur les propositions** : la tuile passe à « Choisi, à enregistrer », le message dit sous quel nom elle sera rangée.
- **Un média après l'autre** : « Média suivant : … » et « Média précédent : … » ouvrent les propositions du média voisin parmi ceux que la borne montre (l'Afficheur 4:1 est sauté sur une borne qui montre l'Afficheur large), sans revenir à la vue d'ensemble ; le détail dit quand le voisin a déjà un choix en attente.
  « Enregistrer » apparaît dès qu'il y a un changement et ouvre le même plan que la vue d'ensemble.
- **Popularité** : le nombre de téléchargements que **VPUniverse** donne pour chaque fiche (« 510 téléchargements ») est sur la tuile ; « Trier : pertinence » devient « Trier : popularité » (les plus téléchargées d'abord, puis l'ordre habituel ; tri stable, gardé d'un média à l'autre pendant la visite).
  VPinMediaDB n'en donne pas (dépôt GitHub sans compteur), ni la base VPS ; VPForums n'est pas lu pour cela tant qu'il n'a pas de page témoin de ses résultats (`packages/core/test-pages`).
  L'entrée n'apparaît que si une proposition a ce nombre (`sortProposals`, `app/src/media-proposals.ts`).
- **« Autre jeu »** : une proposition d'un jeu de la base VPS qui n'est pas celui de la table (même titre, autres auteurs, autre année) porte ce signe, et son détail nomme les deux.
  Pour The Matrix (VP_Cooks, JPSalas, 2023), VPinMediaDB n'a que les médias de « The Matrix (Original 2026) », une autre table (VPW, mars 2026) : l'année 2026 vient de la base VPS, pas d'une erreur de Cyber Pinball.
  Le plan de « Chercher les médias » le dit aussi (`otherGameRows`).
- **Le choix est tenu, même si la liste bouge** (`packages/core/src/focus.ts`) : pendant qu'on regarde, une fiche reçue d'un site devient ses fichiers, un téléchargement fait dans « Récupérer » arrive en tête, un aperçu arrive.
  Le curseur désigne un élément, pas un rang : chaque action a une identité (sa clé, `mediaChoiceKey` pour une proposition, sinon son libellé s'il est unique), le curseur la suit d'une vue à l'autre du même écran, et un clic part avec l'identité de la tuile cliquée (ignoré si elle a disparu).
  Un fichier attendu d'un site n'entre dans le brouillon à sa réception que si ce média n'a pas changé depuis la demande (`pagesSignature`) : un autre choix fait entre-temps, ici ou sur l'écran du média (dossier d'import, ce PC, fichier glissé, média retiré), l'emporte.
  Un écran à cartes sans identité est signalé une fois au journal.
  L'invariant « le média rangé est celui validé » est fixé par `packages/core/src/test/choix-media.test.ts`.
- **Afficheur que la borne ne montre pas** : une borne dont l'écran DMD est un FullDMD montre l'Afficheur large ; l'Afficheur (4:1) ne sert que s'il manque (et inversement pour un DMD seul).
  Ses propositions le disent en tête (« Pas montré sur votre borne ») et « Propositions : Afficheur large » mène directement à celles du média que la borne montre.
  Les sites ont souvent des vidéos FullDMD et pas de DMD 4:1 : sans cet avertissement, on cherchait sur le mauvais écran.
- **« Chercher sur le web… »**, quand rien ne convient : la recherche libre du média, la même que « Chercher moi-même sur le web… » de son écran (voir « Recherche libre » ci-dessous), sur le titre saisi dans « Chercher un autre titre… » s'il y en a un.
  Ce qu'on y télécharge reste ensuite proposé en tête (« Téléchargé du web ») à cette table seulement ; un pack rangé à la manière de Popper sert aussi aux autres écrans.
- **« Autres jeux… »** : les jeux possibles, le plus probable d'abord, avec leur logo (ou une vignette), ce qu'ils ont en ligne et leurs raisons ; Start ajoute ou retire un jeu des propositions.
  Sont retenus d'office le premier jeu, ses autres éditions et ceux presque aussi probables (quatre au plus).
- **« Chercher un autre titre… »** : saisie au clavier de l'écran (ou au vrai clavier) d'un titre en anglais (« lord of the rings »), d'initiales (« TMNT ») ou d'un nom de ROM (« t2_l8 ») ; le premier jeu trouvé s'ajoute aux propositions.
  Comme toute recherche qu'on reprend (« Ajouter des mots à la recherche… », « Chercher un titre… » des parties du jeu, plan de VPinMediaDB), l'entrée dit dans son détail le titre cherché en ce moment (« Titre cherché : « … » »), et le champ s'ouvre prérempli avec lui ; pour les mots ajoutés, la recherche entière, titre en tête : on voit ce qu'on complète (17/11/2026).
  Un pack reçu de plusieurs jeux ne propose que les fichiers de la table (`namedMediaFiles`, au-delà de `PACK_FILES` fichiers).
- **Recherche approfondie** : tous les indices que la table donne d'elle-même, confrontés un par un à la base VPS, chaque piste gardant ses raisons en clair :
  - le **nom écrit dans la table** par son auteur (Fichier > Informations de la table dans l'éditeur de VPX : stockage `TableInfo` du `.vpx`, lu sans charger la table) : « GOTG_2.1.1.vpx » s'y appelle « Guardians Of The Galaxy » ; son **auteur et sa version** désignent la recréation exacte chez VPS ; un **numéro IPDB** cité dans sa description désigne le jeu ;
  - le titre de la fiche, le nom du `.vpx`, du dossier et du `.directb2s` ;
  - la **ROM**, le **PuP-Pack** et le **dossier du DMD** lus dans le script (le script est lu par VPX s'il ne l'a jamais été) ;
  - les **initiales** (« GOTG », « TMNT », « TAF », « T2 ») et les **mots approchés**, pour un titre traduit (« gardiens », « galaxie ») ;
  - plusieurs indices indépendants qui désignent le même jeu le font monter ; les noms de fichiers, qui se recopient l'un l'autre, comptent pour un.

  Le plan automatique (« Chercher les médias ») et les « médias manquants » du menu système s'en servent quand le nom ne suffit pas : une table reconnue ainsi est montrée à vérifier, jamais servie d'office.
- **Code** : `packages/core/src/vps.ts` (initiales, mots approchés, autres éditions, recherche libre), `vpxinfo.ts` (lecture du `.vpx`), `mediasearch.ts` (indices et pistes), `mediachoices.ts` (propositions), `mediaedit.ts` (provenance à l'enregistrement), tests dans `packages/core/src/test/mediasearch.test.ts` et `b2slit.test.ts` ; écrans dans `app/src/media-proposals.ts` et `app/src/media-search.ts`.

### Sons de la table

Fiche d'une table > « Médias du jeu » > « Musique du jeu » ou « Son de lancement » > **« Sons de la table »** : les sons que la table a déjà, rangés par dossier, pour en faire sa musique de présentation ou son son de lancement.
Un PuP-Pack en a souvent des dizaines (musiques du dossier `Topper` ou `Music`, annonces, vidéos d'introduction), que VPinMediaDB n'a pas : *Guardians of the Galaxy* a 38 musiques et 64 vidéos avec du son dans son pack, et aucune musique sur VPinMediaDB.

- **Dossiers** : chacun avec ce qu'il contient (« 38 sons », « 1 vidéo avec du son ») ; ceux qui portent un nom de musique (`Music`, `Songs`, `Topper`, `Attract`…) d'abord, puis `medias\`, puis les autres.
  Un dossier de PuP-Pack se nomme d'après son pack (« PuP-Pack gotg_2020 › Topper »).
  Un seul dossier : ses fichiers s'ouvrent directement.
- **Écouter** : chaque fichier est une carte ; le son de la carte choisie se joue, en boucle, et s'arrête dès qu'on en choisit une autre ou qu'on quitte l'écran (un seul son à la fois, comme les propositions).
  Pendant ce temps, la musique du front-end se tait, et reprend en quittant l'écran (`previewsSound` de `app/src/library.ts`, lu par `soundView` dans `app/src/frontend.ts`) : avant, la musique de la table jouait par-dessus les propositions de musique.
  Start le prend.
- **Ce qui est montré** : les fichiers son (mp3, ogg, m4a, flac, wav), et les vidéos MP4 (`.mp4`, `.m4v`, `.mov`) qui ont une piste son lisible par le front-end (AAC, MP3, Opus ou FLAC), avec la durée de cette piste.
  Ni les copies de sauvegarde et les options d'un pack (`Topper.orig`, `_backup`, `PuP-Pack_Options`…), ni les fichiers vides des packs (« @blank.mp4 », « 30 Second Blank Mp3 »), ni les vidéos muettes.
  Une table rangée dans le dossier commun des tables : seulement ses fichiers de `medias\` (le reste du dossier est aux autres tables).
- **D'une vidéo, le son seul** : sa piste son est extraite dans un `.m4a`, sans réencodage (la piste est recopiée telle quelle dans un nouveau fichier, `packages/core/src/mp4audio.ts` ; il n'y a pas de ffmpeg sur la borne), gardé dans `<données>\cache\sons\`.
  L'intro de 2,6 s du pack de *Guardians of the Galaxy* (1 Mo de vidéo) donne un son de 46 ko.
  Une vidéo fragmentée, ou dont le son est dans un format que Chromium ne lit pas (AC-3), est refusée, avec la raison.
- **Rien n'est déplacé** : le choix va dans le brouillon de « Médias du jeu » ; à l'enregistrement, le fichier est **copié** dans `medias\` sous le nom du média (`(Audio) <table>.mp3`, `(AudioLaunch) <table>.m4a`), l'original reste dans le pack, qui en a toujours besoin.
- **Code** : `packages/core/src/tablesounds.ts` (inventaire), `packages/core/src/mp4audio.ts` (piste son d'un MP4, extraction), tests dans `packages/core/src/test/tablesounds.test.ts` (MP4 factices : moov devant ou derrière, `co64`, morceaux inégaux, refus) ; écran dans `app/src/media-sounds.ts`, branché sur `app/src/library-medias.ts`.

### Musique de la ROM

Une table à ROM sans musique du jeu reçoit celle de sa ROM : Cyber Pinball fait tourner la ROM dans PinMAME, sans écran et sans son, glisse des pièces, presse Start et garde la musique du départ de la partie.
Rien à faire : c'est automatique, en tâche de fond.
Pour la ranger comme vraie musique du jeu, ou pour l'enregistrer tout de suite : fiche > « Médias du jeu » > « Musique du jeu » > **« Musique de la ROM »**.

- **Quelles tables** : celles dont le script charge une ROM (alias compris : Star Trek demande `st_162h` et charge `st_161h`) et qui n'ont pas leur propre `(Audio)`.
  Une ROM sert à toutes les tables qui la chargent.
- **Quand** : une minute après l'ouverture du front-end, puis une minute après chaque partie ; une ROM à la fois, environ une minute chacune (54 s émulées : démarrage, Échap à 12 s pour passer l'écran « réglages d'usine » d'une mémoire vierge, quatre pièces à 20 s, Start à 24 s, puis 30 s gardées au plus).
  **Jamais pendant une partie** : dès qu'une partie se prépare, l'enregistrement en cours s'arrête, sans compter comme un essai, et reprend plus tard.
  Au bureau Windows non plus.
  Hors écran (essais sans opérateur), rien ne part d'office.
- **Sans écran ni son** : un processus à part, `CyberPinball.exe` en mode Node (`app/src/enregistreur-rom.ts`), sans fenêtre, en priorité inférieure à celle du front-end.
  Il charge par koffi la `pinmame64.dll` du plugin PinMAME de la version active de VPX (`<racine>\emulators\vpx\current\plugins\pinmame\`) ; libpinmame ne joue rien elle-même, elle rend son son par un rappel.
  Un processus par ROM : libpinmame n'a qu'un état global, et une ROM qui fait tomber PinMAME ne fait tomber que ce processus.
- **La mémoire de la table n'est jamais touchée** : PinMAME travaille dans `<données>\cache\musiques-rom\travail\`, sur une copie des `.zip` (ceux de `<table>\pinmame\roms`, puis ceux de la même famille dans la bibliothèque de ROM), avec une NVRAM et des réglages vierges.
  Un dossier de travail dans celui d'une table est refusé (`prepareRomScratch`).
  Records, crédits et réglages restent ceux de la borne.
  Le dossier est vidé après chaque enregistrement.
- **Billes et mécanismes** : une machine démarrée gouttière vide cherche ses billes et reste muette.
  Les interrupteurs de la gouttière sont lus dans le script de la table (le `.vbs` posé à côté s'il existe) : `bsTrough.InitSw 0, 21, 20, 19, 18` (le premier est l'entrée), `.InitSwitches Array(…)` d'un `cvpmTrough`, ou `Controller.Switch(n) = 1` dans un `_Hit` qui parle de la gouttière.
  S'y ajoutent les interrupteurs des mécanismes que le script simule, à leur position de repos (`.AddSw 84, 0, 1`) : sans eux, *The Addams Family* croit sa main « Thing » bloquée et refuse la partie, Start reste sans effet.
- **Ce qui est gardé** : à partir de Start (les pièces avant sont écartées), du premier son jusqu'au dernier avant 3 s de silence, 30 s au plus.
  La composante continue est retirée (les cartes son WPC sortent un décalage d'environ −20 dBFS même muettes, qui cachait tout silence), le son normalisé à 80 % de la pleine échelle et terminé par un fondu de 1,5 s.
  Il est encodé en **Opus** dans un `.ogg` (96 kbit/s, environ 360 ko pour 30 s) par le moteur de Chromium, dans la page cachée du convertisseur (`audioToOggOpus`, `app/src/media-convert.ts` ; conteneur écrit par `oggOpusFile`), et rangé dans `<données>\cache\musiques-rom\<rom>.ogg`.
- **Dans le front-end** : jouée quand le jeu n’a pas sa propre musique, avant celle de la borne (`resolveMedia`, source `rom`) ; « Médias du jeu » la montre « À la place : musique de la ROM ».
  Elle reste dans le cache : « Trouver les médias manquants » et VPinMediaDB peuvent toujours poser une vraie musique.
- **« Musique de la ROM »** (fiche > « Médias du jeu » > « Musique du jeu ») : déjà enregistrée, « t2_l8, 30 s, enregistrée le … : Start pour la prendre » la met dans le brouillon, copiée dans `medias\` sous `(Audio) <table>.ogg` à l'enregistrement ; elle est aussi parmi les propositions (« Voir les propositions », source « Musique de la ROM »).
  Pas encore faite : Start l'enregistre tout de suite (environ une minute), et l'écran se met à jour quand elle est prête.
  Muette ou en échec : la raison, et Start pour réessayer.
- **ROM muette, ROM en échec** : `<données>\cache\musiques-rom\etat.json` garde chaque essai (`ok`, `silent` ou `failed`, la date, le nombre d'essais, les interrupteurs, la raison).
  Une ROM **muette** (moins de 3 s de son après Start) n'est **jamais réessayée d'office**.
  Une ROM en échec (PinMAME ne la démarre pas, s'arrête, ne rend plus de son ou dépasse 3 minutes) l'est une fois de plus, puis plus.
  Le journal décrit chaque enregistrement (interrupteurs, durée, poids) et, pour une ROM muette, ce que montrait l'afficheur.
- **Mesure sur les ROM réelles** (12/11/2026, poste de développement, `pinmame64.dll` de VPX 10.8.1, par le service lui-même ; ROM et tables de la borne de référence et du PinCab) :

  | Table | ROM | Système | Interrupteurs | Gardé | Poids | Durée réelle |
  | --- | --- | --- | --- | --- | --- | --- |
  | Terminator 2 | `t2_l8` | Williams WPC (DMD) | 17, 16, 15, 33 | 30,3 s, mono | 360 ko | 58 s |
  | The Addams Family | `taf_l7` | Bally WPC (Fliptronics) | 15, 16, 17, 82, 84 | 29,3 s, mono | 348 ko | 56 s |
  | Back to the Future | `bttf_a27` | Data East (alphanumérique) | 11, 12, 13 | 30,3 s, stéréo | 360 ko | 59 s |
  | Star Trek (Enterprise LE) | `st_161h` (script `st_162h`) | Stern SAM | 21, 20, 19, 18 | 30,3 s, stéréo | 359 ko | 58 s |
  | The Walking Dead (LE) | `twd_160h` | Stern SAM | 21, 20, 19, 18 | 30,3 s, stéréo | 359 ko | 57 s |
  | Aliens (Original 2020) | `sorcr_l2` | Williams System 9 | 30, 29 | 30,3 s, mono | 360 ko | 56 s |

  Toutes lancent une partie (afficheur relevé : « BALL 1 », crédits) et jouent sans interruption jusqu'au bout des 30 s ; le dossier `pinmame` de chaque table est identique avant et après.
  Sans les interrupteurs de repos, *The Addams Family* restait en attente.
  Trois pièges levés en route : PinMAME lit le clavier à chaque image (une centaine de touches) et chaque lecture repasse par le fil principal du processus, d'où un clavier allumé seulement autour des appuis (sinon l'émulation tombait au quart de sa vitesse) ; un appel direct à libpinmame pendant qu'elle attendait un rappel bloquait les deux (tous les appels sont asynchrones) ; `koffi.view` fait tomber le processus sous Electron (cage mémoire de V8), les octets sont donc copiés par `koffi.decode`.
  Le son a été vérifié par ses niveaux et par le décodage du `.ogg` dans Chromium, pas encore écouté sur la borne.
- **Limites** : une table au script protégé ne donne pas ses interrupteurs, la ROM est essayée sans eux ; un mécanisme dont le repos n'est pas à la position 0 n'est pas couvert.
  Ce qu'une ROM joue au départ d'une partie n'est pas toujours sa plus belle musique (souvent celle de la bille 1) : « Sons de la table », VPinMediaDB ou un fichier restent là pour la remplacer.
- **D'après** VRTableManager de Mike (mikebm), licence MIT ([github.com/mikebm/VRTableManager](https://github.com/mikebm/VRTableManager), `RomAudio.cs` et `RomRecorder.cs`) : processus à part, NVRAM vierge, Échap puis pièces et Start, interrupteurs de la gouttière lus dans le script, découpe au premier silence.
  Sa licence est dans `packages/core/LICENSE-VRTableManager.txt`.
- **Code** : `packages/core/src/romaudio.ts` (interrupteurs, calendrier, dossier de travail, découpe, Ogg Opus, état), `app/src/enregistreur-rom.ts` (le processus PinMAME), `app/src/rom-music.ts` (file, pause, encodage), `app/src/library-medias.ts` et `app/src/media-proposals.ts` (écrans).
  Tests : `packages/core/src/test/romaudio.test.ts` (interrupteurs de vrais scripts, appuis au temps émulé, décalage continu, découpe, pages Ogg et leur CRC, ROM muette jamais réessayée, NVRAM de la table jamais touchée, repli et proposition).

### Médias des sites communautaires

PinUP Popper n'est pas sur la borne : Cyber Pinball le remplace.
Son serveur de médias n'est accessible que depuis Popper Setup, mais les mêmes auteurs publient sur les forums, avec un compte gratuit.
Les propositions de chaque média y cherchent, dans la session de la fenêtre « Récupérer » (où l'on se connecte soi-même ; Cyber Pinball ne voit aucun mot de passe).

- **VPForums d'abord** : 808 packs de médias complets, 4 153 logos, 1 829 vidéos.
  Sa recherche est réservée aux membres : sans connexion, l'action « Se connecter à VPForums… » le dit et ouvre sa page de connexion.
- **VPUniverse en dernier recours** : environ 24 000 médias de front-end (logos, vidéos du plateau, du fronton, du DMD et du topper, chargements, cartes, sons de lancement, prospectus), mais **environ 45 s d'attente avant chaque fichier** avec un compte gratuit, et un nombre de téléchargements limité.
  Ses résultats se voient sans compte ; le téléchargement le demande.
- **Recherche** : quand on ouvre les propositions d'un média, les pages de résultats de chaque site pour chaque titre (le titre de chaque jeu retenu sans son sous-titre, « terminator 2 », ou la saisie de « Chercher un autre titre… »), lues dans une vue cachée, trois au plus (`SITE_SEARCH_PAGES`, 25 fiches par page sur VPUniverse).
  VPUniverse cherche dans les seules catégories du média ouvert (`siteSearchNodes` : « Topper Videos » et « Topper Images » pour le topper) : toutes catégories confondues, les 16 logos de Game of Thrones remplissaient la première page et ses toppers passaient aux suivantes (8 toppers par leurs catégories, 4 sur la première page mêlée).
  VPForums ne filtre pas par catégorie : une recherche sert à tous les médias.
  Le script de la page (`SITE_SEARCH_PROBES`) prend pour titre le lien de la fiche qui a du texte : connecté, VPUniverse met devant chaque fiche pas encore vue une pastille « non lu », un lien vers la même fiche sans texte, que le script prenait pour le titre.
  Ce que rend le script est vérifié (`checkSiteSearch`) : une fiche sans titre est écartée et notée dans la console ; si c'est le cas de la plupart, la tuile « Chercher plus » dit « page de résultats illisible » au lieu de compter les fiches ailleurs.
  Les scripts tournent dans les tests sur une vraie page de résultats enregistrée (`packages/core/test-pages/`), telle qu'un visiteur la reçoit et telle qu'un membre la voit.
  Les sites n'ont pas de ligne avant les propositions (17/11/2026 : une ligne par site passait avant le premier résultat) : leur état tient sur les tuiles (« ≈ 45 s d'attente », « Connexion nécessaire ») et dans les actions (« Se connecter à … ») ; un site qui n'a pas pu chercher le dit sur la tuile « Chercher plus ».
  Les résultats se gardent une demi-heure ; rien n'est cherché en tâche de fond.
  Chaque résultat garde son titre, sa catégorie, son auteur, sa date, son nombre de téléchargements et la vignette déposée par l'auteur (image fixe, même pour une vidéo).
  La tuile montre les téléchargements en icône (flèche vers le bas) et en chiffre, jamais en toutes lettres (`MediaCard.downloads`).
- **Rapprochement** : le titre de chaque résultat, débarrassé des mots du média (« Topper Video », « Animated Wheel »…), est confronté à toute la base VPS ; il ne compte que s'il désigne un jeu retenu (un résultat « Terminator 3 » ne passe pas pour Terminator 2).
  Le type de média vient de la catégorie (« Topper Videos » : topper) ; pour les vidéos mêlées de VPForums, du titre ; un pack complet vaut pour tous les médias.
- **Fiches rangées par la base VPS** : les listes `wheelArtFiles`, `topperFiles` et `mediaPackFiles` de chaque jeu retenu renvoient à des fiches de VPUniverse et de VPForums (3 157 logos sur VPUniverse et 375 sur VPForums le 12/11/2026 ; les liens mega.nz et ceux signalés morts ne sont pas repris).
  Elles sont proposées sans recherche ni requête, attribuées à leur jeu sans rapprochement du titre (`vpsSiteHits`, champ `SiteHit.vps`) : certaines sont introuvables par le titre (sous The Matrix, « any », un « Wheel Mega Pack »), et celles de VPForums se voient même sans compte, sa recherche étant réservée aux membres.
  Sans vignette, elles passent après les résultats de recherche.
- **Chercher plus** (dernière tuile de la galerie des propositions, comme une page suivante ; `State.wide`) : jusqu'à `SITE_SEARCH_MORE_PAGES` pages (10) par titre au lieu de 3, les fiches de toutes les éditions que la recherche approfondie a reconnues de façon sûre (score d'au moins 0,6, ou autre édition du jeu ; pas Dominatrix pour The Matrix), et les titres qui ont tous les mots cherchés sans désigner sûrement un jeu retenu, attribués au premier jeu retenu, marqués « Titre approché » et rangés en dernier (`siteOffers(…, loose)`).
  « Terminator 3 » ne passe toujours pas pour « terminator 2 » : il lui manque le « 2 ».
  La recherche élargie, la tuile disparaît ; l'action « Recherche simple » y ramène.
  L'état vaut pour la table jusqu'à la fin de la visite, même après « Chercher un autre titre… ».
- **Animés seulement** (`animatedOnly`, gardé d'un média à l'autre comme le tri ; logo, plateau, fronton, afficheurs, topper : `ANIMATABLE_MEDIA_TYPES`) : ne restent que les vidéos et les images animées (`mediaChoiceAnimated`) : fiche d'une catégorie animée ou dite animée par son titre (« Animated », « APNG », « GIF », `hitAnimated`), image du disque dont l'en-tête dit l'animation (APNG `acTL`, GIF `NETSCAPE2.0`, WebP animé ; `readMediaDimensions`, lu une fois par visite), fichier en ligne en APNG ou en GIF.
  La recherche des sites change aussi : VPUniverse cherche dans les seules catégories animées du média (« Animated Wheel Images (APNG) » pour le logo, « Topper Videos » pour le topper, `siteSearchNodes(…, animated)`), sinon les logos fixes d'un jeu connu passent devant ; VPForums, qui mêle logos fixes et animés, reçoit le mot « animated » (`siteSearchTerms`).
  La carte d'une fiche d'image animée le dit (« animée »).
- **Mots ajoutés** (« Ajouter des mots à la recherche… », `State.extra`) : ajoutés au titre cherché sur les deux sites (« matrix neon ») et dans « Chercher sur le web… » (`webSearchQuery(…, { extra, animated })`).
  Les propositions qui ne les ont pas, dans leur titre, leur détail, le titre ou l'auteur de leur fiche, sont masquées ; une fiche trouvée par VPUniverse est gardée, sa recherche « et » ayant trouvé les mots au moins dans sa description.
  Vide : retirés.
- **Ce que masquent les filtres** : le chapeau compte les propositions masquées (« 8 propositions (3 masquées) »), et un écran vide propose « Chercher plus » ou le web, au lieu de passer pour une source vide.
  Le nombre de propositions montré ailleurs (vue d'ensemble) ne tient pas compte des filtres.
- **File** : Start sur une carte la met dans la file de son site, un fichier à la fois par site, chaque site de son côté.
  Le téléchargement se fait dans une vue cachée, et la page du fichier s'ouvre en même temps dans la fenêtre « Récupérer » (bandeau : « Cyber Pinball télécharge ce fichier pour le média… », en vert : une information, pas un avertissement ; la progression y a sa ligne) ; le **minuteur de VPUniverse se déroule dans la page**, comme pour un membre qui clique : la page demande l'attente au serveur, décompte, puis lance le fichier, et la carte montre les secondes restantes (« Attente du site · 31 s »).
  Cyber Pinball attend, ne raccourcit rien.
  Start sur une carte en file l'en retire ; « Arrêter la file » arrête tout.
  Un plafond de téléchargements ou une connexion demandée arrêtent la file de ce site.
  **Fiche qui ne se télécharge pas d'elle-même** (page d'attente, clic demandé, plusieurs fichiers au choix, conditions, vérification) : sa page reste affichée dans la fenêtre « Récupérer », sans être rechargée, et le bandeau dit, en orange, ce qu'il reste à faire (« À faire vous-même : … Le fichier téléchargé revient aux propositions du média. »).
  Ce qu'on y télécharge est rangé pour ce média, comme un fichier de la file, et non dans les téléchargements généraux : le fronton choisi sur VPForums à l'ajout d'une table de Pinball FX3, par exemple, arrive bien dans les médias de la table.
  Page fermée sans téléchargement, ou laissée 20 minutes sans suite : la carte le dit (« page fermée sans téléchargement »), et la file de ce site passe au fichier suivant ; le journal note chaque fiche non reçue et sa raison.
- **Réception** : le fichier est rangé dans `<téléchargements>\sites\<site>-<fiche>\fichiers`, l'archive déballée ; un pack rangé à la manière de Popper ou de PinballX dit le type de chaque fichier par son dossier.
  Les fichiers reçus sont notés dans `<téléchargements>\sites\recus.json` et proposés aux visites suivantes, pour ce média comme pour les autres écrans d'un pack (« Reçu de VPForums »).
  Le fichier attendu par la dernière carte choisie pour un média passe de lui-même dans le brouillon ; un autre choix fait entre-temps n'est jamais remplacé.
  Rien n'est écrit dans `medias\` avant « Enregistrer » ; la provenance (site, adresse de la fiche) va dans le `.info`.
- **Code** : `packages/core/src/mediasites.ts` (catégories, adresses, scripts des pages de résultats, rapprochement, décompte par média, recherche sur le web, fichiers reçus), `sitesessions.ts` (minuteur, `WAIT_PROBES`), `app/src/media-sites.ts` (recherche, vignettes, file, reçus), `app/src/acquire-window.ts` (vue cachée, destinataire d'un téléchargement), `app/src/media-proposals.ts` (cartes) ; tests dans `packages/core/src/test/mediasites.test.ts`.
  Le banc appelle le ramasse-miettes à chaque attente : une vue cachée que plus rien ne garde disparaîtrait au hasard d'un GC, et la fermer ensuite levait « Object has been destroyed » ; `acquire-window.ts` garde donc chaque vue cachée jusqu'à sa fermeture (`hiddenViews`, `closeHidden`, test d'invariant dans `offscreen.test.ts`).

### Recherche libre : « Chercher moi-même sur le web… »

Quand les sources branchées n'ont pas ce qu'il faut (une musique du jeu pour Guardians of the Galaxy, quand les propositions n'ont que des toppers), on cherche soi-même dans le navigateur intégré, et Cyber Pinball voit arriver ce qu'on télécharge.

- **Entrée** : sur l'écran de chaque média (fiche > « Médias du jeu » > un média), juste après « Voir les propositions », **« Chercher moi-même sur le web… »** ouvre la fenêtre « Récupérer » sans attendre la recherche des propositions.
  Son détail dit le texte cherché (« Navigateur intégré, recherche libre : « Guardians of the Galaxy table music vpinball » »), « Reprend la page où vous en étiez » une fois la fenêtre fermée, ou « Téléchargement en cours : 1,2 Mo sur 3,4 Mo… » pendant un téléchargement.
- **Bandeau** : la fenêtre s'ouvre sur une recherche DuckDuckGo préremplie (titre de la table sans fabricant ni année, mots de l'écran en anglais, « vpinball » : `webSearchQuery`, `packages/core/src/mediasites.ts`).
  Sous la ligne habituelle, une ligne de recherche : les moteurs **Web**, **Images**, **Vidéos** (DuckDuckGo) et **YouTube**, le champ et **« Chercher »** (`webEngineUrl`, `packages/core/src/webmedia.ts`).
  Le champ garde le texte de la dernière page de résultats, même sur les pages suivantes ; changer de moteur relance le même texte.
  Tant qu'on tape dans le champ, les touches ne sont pas des boutons de la borne ; Échap ferme toujours.
  Le bouton « Retour à la fiche » devient « Retour à la recherche ».
  Fermer (Échap, Exit, Alt+F4) garde la page et son historique ; la fenêtre rouverte pour le même média reprend là où l'on en était, avec le texte cherché.
  La ligne d'état est un mode d'emploi (« le fichier est vérifié puis proposé pour « Musique du jeu » »), pas un avertissement.
- **Pages vidéo** : chaque page chargée, ou changée sans rechargement (YouTube), est lue par une sonde (`VIDEO_PAGE_PROBE`) : vidéo de YouTube (watch, shorts, youtu.be), de Vimeo, de Dailymotion, ou élément `<video>` d'une autre page.
  Une ligne de plus la décrit (« Vidéo YouTube : « … » · 2:47 »).
  Quand la page lit un fichier vidéo ordinaire (adresse http(s)), **« Télécharger cette vidéo »** le télécharge comme un lien et il revient au média, son son compris (pour la musique, il s'extrait).
  YouTube, Vimeo et Dailymotion lisent un flux découpé (`blob:`) : la ligne propose **« Récupérer le son »** et **« Récupérer la vidéo »** par yt-dlp (voir ci-dessous), le geste attendu pour ce média allumé en premier (le son pour la musique et le son de lancement, la vidéo pour un écran).
  Le titre se lit dans la page vivante : YouTube ne met pas à jour ses balises meta d'une vidéo à l'autre.
- **yt-dlp** : l'outil qui récupère la vidéo ou le son d'une page YouTube, Vimeo, Dailymotion…, **seul, sans ffmpeg**.
  Il n'est pas livré avec Cyber Pinball : la **première** demande le télécharge depuis les versions GitHub du dépôt officiel (`yt-dlp.exe`, environ 18 Mo, la ligne du bandeau le dit avant le clic), le vérifie par **deux empreintes SHA-256** qui doivent s'accorder (celle que donne l'API de GitHub pour le fichier, et sa ligne dans `SHA2-256SUMS` de la même version ; un fichier qui diffère est supprimé, jamais lancé) et le range dans `<racine>\tools\yt-dlp` avec `version.json` (`packages/core/src/ytdlp.ts`, `app/src/ytdlp-tool.ts`).
  Une nouvelle version est cherchée au plus une fois par semaine, à l'utilisation, et remplace l'ancienne avec les mêmes contrôles ; sans réseau, l'outil installé sert tel quel. yt-dlp ne se met jamais à jour lui-même (`--no-update`).
  Sans ffmpeg, seuls des formats d'un seul tenant : **le son seul en M4A** (accepté tel quel par la musique, découpable), sinon le meilleur son (WebM Opus, converti en WAV) ; **la vidéo seule en MP4** H.264 jusqu'au 1080p (muette, ce qui suffit pour un écran du front-end).
  Un seul fichier, jamais une liste de lecture (`--no-playlist`), aucune configuration de l'utilisateur lue (`--ignore-config`).
  Pour YouTube, yt-dlp demande un moteur JavaScript : l'exécutable de Cyber Pinball en tient lieu (`--js-runtimes node:<exécutable>`, `ELECTRON_RUN_AS_NODE=1`, Node 24 ; yt-dlp exige Node 22 au moins).
  La récupération a sa ligne dans le bandeau, comme un téléchargement (installation, puis pourcentage, volume, débit), et « Annuler » (ou Start, puis Start à la borne) arrête yt-dlp et ce qu'il a lancé, sans rien garder.
  Le fichier reçu passe par la même vérification et le même écran « Reçu » qu'un téléchargement.
  Un échec dit sa raison (« vidéo privée », « YouTube demande de prouver qu'on n'est pas un robot… », « réseau injoignable »…). yt-dlp n'est proposé que pour une recherche partie d'un média.
  Les conditions d'utilisation de YouTube n'autorisent le téléchargement que lorsque le service le permet : à chacun de juger ce qu'il récupère.
- **Détection** : tout fichier téléchargé dans la fenêtre lui revient (`will-download`, destinataire de la page) ; pendant la recherche, **Téléchargements de Windows** est aussi surveillé (`watchDownloads`) pour ce qu'on récupère dans son propre navigateur (« Ouvrir dans mon navigateur ») : seuls les médias et les archives arrivés après l'ouverture comptent (`isMediaDownload`), copiés (l'original reste où il est), un fichier en cours d'écriture (`.crdownload`, `.part`) ignoré.
  La surveillance s'arrête quand on quitte les médias de la table, au plus deux heures après.
- **Vérification** (`judgeWebFile`, `packages/core/src/webmedia.ts`) : chaque fichier, archive déballée, est jugé pour le média d'après son **contenu** (premiers octets, `sniffMedia`), pas seulement son nom : **accepté** tel quel (une vidéo WebM nommée `.mp4` est rangée en `.webm`), **à convertir**, ou **refusé** avec sa raison (« page web enregistrée sous un nom de fichier : le site a renvoyé une page au lieu du fichier », « une image, alors que « Musique du jeu » demande : mp3, ogg, m4a, flac, wav », « vidéo .mkv que le front-end ne lit pas ; la convertir demanderait un outil externe (ffmpeg) », « format inconnu (.txt) »).
  Un fichier d'un pack rangé pour un autre écran lui revient.
  Tout est noté dans `<téléchargements>\sites\web.json` (`files`, `convert`, `refused`, `windows`) ; ce qui ne sert à rien n'est pas gardé.
- **Conversions sans outil externe** (`app/src/media-convert.ts`) : le moteur de Chromium décode, dans une page cachée (une vue sans fenêtre, dans une session à part dont toutes les adresses sont servies par l'application, sans réseau) : une image (JPEG pour le logo, BMP, AVIF, ICO) est redessinée en **PNG** ; un son que le front-end ne lit pas (Opus, AAC, WebM) ou le **son d'une vidéo** (MP4, WebM, MKV, MOV) est décodé, découpé et écrit en **WAV** 16 bits à 44,1 kHz (`wavFile`).
  Une vidéo MP4 ou MOV peut aussi donner sa piste son **telle quelle**, en `.m4a`, sans réencodage (« Prendre son son tel quel (.m4a) et affecter », `extractMp4Sound`, le même moyen que « Sons de la table »).
  Une vidéo dans un format que le front-end ne lit pas n'est pas convertie.
- **Écran « Reçu pour « … » »** : il s'ouvre de lui-même derrière la fenêtre dès la réception, si les médias de la table sont encore ouverts.
  Il montre le fichier avec son aperçu (un son s'écoute quand sa carte est choisie), son état (« Accepté tel quel », « À convertir en PNG », « Son de la vidéo, à extraire en WAV »), **ce qui sera écrit** (« Rangé sous « (Audio) Guardians of the Galaxy (Stern 2017).wav » ») et ce qui part à la corbeille, puis les fichiers refusés et ceux qui vont à d'autres écrans.
  Actions : **« Affecter à « … » et enregistrer »** (ou « Convertir en PNG, puis affecter »), « Mettre dans le brouillon » (sans rien écrire, avec les autres changements), « Retour à la recherche » (reprend la page), « Garder pour plus tard » (reste dans les propositions).
  Plusieurs fichiers utiles : un écran les montre tous, on choisit.
  Rien d'utilisable : « Reçu : rien d'utilisable pour « … » », avec les raisons.
- **Découpe d'un son** (musique du jeu, son de lancement) : « Découper puis affecter… » montre deux cartes, **l'extrait** (il s'écoute quand la carte est choisie, sur « Affecter cet extrait ») et **la forme d'onde** du son entier (`waveformPng`), la partie gardée en vert signal sur une bande éclairée, le reste en sarcelle éteinte, le fondu de fin plus sombre.
  Actions : « Début plus tard / plus tôt », « Fin plus tard / plus tôt », « Pas : 1 s / 5 s / 15 s », « Fondu de fin : oui / non » (2 s), « Tout le son ».
  Proposé d'abord : les dix premières secondes pour le son de lancement ; tout le son, jusqu'à trois minutes, pour la musique (avec un fondu si elle est coupée).
  L'extrait se refait en tâche de fond à chaque réglage (le son décodé reste dans la page cachée).
- **Affectation immédiate** : « Affecter … et enregistrer » écrit **ce seul média** aussitôt (`planSingleMedia`, `packages/core/src/mediaedit.ts`, même plan et même corbeille qu'« Enregistrer ») : le fichier copié dans `medias\` sous son nom, l'ancien à la corbeille, la provenance (hôte et adresse, ou « Téléchargements de Windows ») dans le `.info` ; la table est relue pour le front-end.
  Les autres changements du brouillon restent à enregistrer ; celui de ce média, remplacé, est oublié.
  C'est la seule écriture sans passer par l'écran du plan : l'écran « Reçu » a montré ce qui serait écrit.
- **Code** : `packages/core/src/webmedia.ts` (moteurs, `sniffMedia`, `judgeWebFile`, WAV, découpe, forme d'onde, sonde des pages vidéo), `app/src/media-web.ts` (entrée, écrans « Reçu » et découpe), `app/src/media-convert.ts` (conversions), `app/src/media-sites.ts` (réception, jugement, Téléchargements de Windows), `app/src/acquire-window.ts` et `app/renderer/acquire.*` (bandeau de recherche, page vidéo) ; tests dans `packages/core/src/test/webmedia.test.ts` et `ytdlp.test.ts` (dont la sonde sur ses pages témoins `youtube-video.html` et `video-directe.html`, en visiteur et en membre, la détection avec une fausse fenêtre « Récupérer » et un faux dossier Téléchargements, l'affectation d'un seul média).

### Enregistrer une partie pour la roue

La vidéo de présentation d'une table sur la roue (le plateau en plein écran, en borne) est d'abord la table en conditions réelles.
Cyber Pinball la filme pendant qu'on y joue, sans rien télécharger ni installer : la capture d'écran de Chromium (Windows Graphics Capture, images gardées sur la carte graphique) et l'encodeur de MediaRecorder (MP4, H.264, son AAC), dans l'Electron de l'application.

- **Entrée** : fiche de la table > **« Jouer et enregistrer »** (porte `sheet.record`, fermée en mode invité).
  L'écran de préparation dit ce qui sera filmé et le lance : « Lancer et enregistrer ».
  Ses réglages, gardés pour la fois suivante dans `<données>\enregistrement.json` : **écrans filmés** (le plateau toujours ; le fronton et l'afficheur au choix, quand la borne les a), **début** (0, 5, 10, 20, 30 ou 60 s après l'apparition de la table ; 10 par défaut), **durée** (15, 30, 45, 60 ou 90 s ; 30 par défaut), **son de la partie** avec la vidéo du plateau (oui par défaut), **qualité de la vidéo** du plateau (4K, 1440p, 1080p ou 720p ; 4K par défaut, chaque choix annonce le poids d'une prise de la durée choisie).
  La qualité se règle aussi dans Système > « Médias, son et attente » > **« Qualité des parties enregistrées »** (Start fait défiler les choix) ; les deux écrivent le même fichier, et un fichier d'avant ce réglage (alors plafonné au 1080p) passe en 4K.
- **Pourquoi pas un geste pendant la partie** (options pesées) : 1. une combinaison de boutons en jeu, lue par Cyber Pinball pendant que VPX a le premier plan : chaque bouton de la borne appartient déjà à VPX (les deux MagnaSave ouvrent son menu, Start lance une bille, Exit quitte), un geste de plus déclencherait aussi l'action de VPX ; 2. un raccourci clavier (Ctrl+Maj+…) : sans clavier sur une borne, inutilisable ; 3.
  **l'enregistrement armé depuis la fiche, début et fin automatiques** : retenu, aucun bouton n'est détourné, rien ne peut se déclencher par erreur pendant une vraie partie, et le joueur sait d'avance quand ça commence et quand ça s'arrête.
- **Les deux événements** (`advanceRecording`, [packages/core/src/gamerecording.ts](../../packages/core/src/gamerecording.ts)) : **`recording-start`**, quand la fenêtre de jeu de VPX tient le premier plan (`onForeground` du lanceur) depuis le délai choisi, pour passer le fondu d'arrivée de VPX ; **`recording-end`**, au premier de : la durée atteinte (fin propre : fondu au noir de 0,4 s, la boucle de la roue repart sans à-coup ; un fondu d'entrée aussi), la table quittée (VPX fermé : la dernière demi-seconde, retenue avant d'être écrite, est jetée, ce qui précède la fermeture n'est jamais dans la vidéo), un échec de la capture.
  Une fin à moins de 5 s ne garde rien.
  Le journal dit « Enregistrement (…) : événement de début. » et « … : événement de fin (duration, game-end ou failed). ».
- **Témoin** : une pastille discrète dans le coin du plateau, en bas à gauche pour le joueur (côté flippers, là où se porte le regard : en haut à droite, au bout de la table, on ne la voyait pas), tournée comme le front-end (`indicatorBounds`), jamais dans la vidéo (fenêtre exclue de la capture, vérifié sur une prise 4K) : anneau vert et « Enregistrement dans 7 s » pendant le délai, point rouge qui bat lentement, « REC » et « 0:12 / 0:30 » pendant l'enregistrement, puis « ✓ Enregistré · 0:30 » trois secondes (ou, en ambre, « Trop court : pas gardé »).
  Fenêtre transparente, sans focus ni clic, au-dessus de VPX, **exclue de la capture** (`setContentProtection`, WDA_EXCLUDEFROMCAPTURE de Windows 10 2004) : la vidéo ne la contient jamais.
  C'est la seule fenêtre de Cyber Pinball laissée au premier plan pendant une partie (exception bornée par `pupvisible.test.ts` et `buttons.test.ts` : un coin du plateau, jamais le focus, retirée trois secondes après la fin).
  Page `app/renderer/recording.html` (un seul accent rouge, battement de faible amplitude, immobile si Windows réduit les animations).
- **Capture** (`app/src/game-recording.ts`, `app/renderer/recorder.js`, fenêtre jamais montrée) : une capture par écran filmé, à la taille juste nécessaire (un écran 4K filmé en 1080p est capturé en 1920 × 1080 ; en 4K, à sa pleine taille) ; chaque rôle y prend **la zone où VPX le dessine** (fronton et DMD qui partagent un écran : chacun sa bande).
  Le plateau est **toujours rendu en portrait, flippers en bas** (`uprightRotation` d'après le bord où VPX dessine les flippers, `orientationFacts`), à la définition choisie au plus (2160 × 3840 en 4K, 1440 × 2560, 1080 × 1920 ou 720 × 1280), **jamais au-delà de l'écran** (un plateau 1080p reste en 1080p) : c'est le standard que la roue sait tourner (`mediaFlipperEdge`), et elle le montre exactement comme le joueur le voyait, dans tous les sens d'écran ; un plateau de poste de bureau (paysage, flippers déjà en bas) est recadré au centre en 9:16.
  Fronton et DMD gardent leur sens, réduits à 1280 de large au plus.
  **Cadence** : 60 images par seconde (`RECORDING_FPS`), celle à laquelle VPX dessine la table.
  La capture passe par la carte graphique (`RECORDING_CHROMIUM_FEATURES` : `WebRtcAllowWgcUsingTexture` et `ZeroCopyDesktopCapture`, ajoutées à `--enable-features` au démarrage) : la capture ordinaire (DXGI) recopie chaque image par le processeur et s'interdit plus d'un demi-cœur, soit 25 images par seconde au mieux en 4K (20 à 25 mesurées en partie sur une borne 4K, 12/11/2026) ; celle-ci en tient 56 à 57.
  **Débit** à la taille et à la cadence produites (`recordingBitrate` : 0,14 bit par point et par image à 30 images/s, une fois et demie à 60, soit environ 52 Mbit/s en 4K et 13 en 1080p, 3 au moins).
  MediaRecorder répartit le débit demandé comme si l'image durait 1/30 s, quelle que soit la cadence : à 60 images/s, il en écrivait deux fois trop (98 Mbit/s pour 52, 367 Mo pour 30 s sur une borne 4K) ; on lui demande donc la moitié (`mediaRecorderBitrate`, `MEDIARECORDER_ASSUMED_FPS`), et le journal note le débit réel de chaque fichier contre le débit visé, « DÉBIT TROP HAUT » au-delà d'une fois et demie (`RECORDING_MAX_BITRATE_RATIO`) ; **codec** H.264 High au niveau qu'exige cette taille à cette cadence (`h264CodecLevel` : 4.0 en 720p, 4.2 en 1080p, 5.1 en 1440p, 5.2 en 4K), sinon WebM VP9 si MediaRecorder refuse le MP4.
  Le son est celui de Windows (boucle de sortie), sur la vidéo du plateau seulement.
  **Balancier de VPX** : VPX dessine son balancier simulé dans l'image du plateau (`src/ui/live/PlumbOverlay.cpp`, le même en 10.8.1), un cercle rouge et un point en bas à gauche du joueur dès qu'une secousse le fait bouger, effacé en deux secondes ; il entrait dans les vidéos des bornes à accéléromètre.
  Aucun réglage ne le masque seul : la partie enregistrée reçoit un INI à part (`<données>\enregistrement\VPinballX.ini`, `recordingini.ts`), celui de la borne avec `[Player] SimulatedPlumb = 0` ; pendant la prise, les secousses bougent la bille mais ne font pas tilter (un balancier câblé reste actif).
  En quittant, VPX réécrit cet INI : ce qu'il y a changé en partie revient dans l'INI de la borne, sauf le balancier (`recordingIniCarryBack`).
  Rien à faire sans balancier simulé, ni pour une partie dans le casque.
  **Cadence écrite** : à la fin, chaque fichier est relu (`readVideoCadence`, `packages/core/src/videocadence.ts` : MP4 ordinaire ou fragmenté, sans dépendance) ; le journal note ses images, sa cadence et son plus grand écart (« playfield, 1790 images en 30.0 s, 59.7 images/s pour 60 demandées, écart max 34 ms »), et « CADENCE BASSE » sous 80 % de la cadence demandée (`recordingCadenceLow`) ; l'aperçu de la prise dit la cadence mesurée.
- **Au retour** : l'écran **« Enregistrement de la partie »** montre chaque vidéo en aperçu, ce qu'elle remplacerait, sa taille et sa durée, puis : **« Utiliser pour la roue »** ouvre d'abord le plan (`planMediaChanges` : la vidéo rangée dans `medias\` sous le nom du jeu, l'ancien média à la corbeille de Cyber Pinball, le demi-tour forcé de l'ancien retiré) ; rien n'est écrit avant **« Confirmer »**, puis la roue montre la nouvelle vidéo.
  **« Garder de côté »** (et Exit) ne change rien sur la roue : le fichier attend dans `<données>\enregistrements\<nom du .vpx>\(Playfield) AAAA-MM-JJ HH-MM-SS.mp4` et figure en tête des propositions de ce média (« Médias du jeu » > le média > « Voir les propositions », source « Enregistré en partie sur cette borne »).
  **« Rejouer et enregistrer »** recommence (le premier reste de côté).
  **« Jeter l'enregistrement »** le met à la corbeille.
- **Partie simulée** (essais hors écran) : aucun écran n'est capturé ; l'enregistreur dessine une fausse table dans le sens où VPX la dessinerait (bandeau rouge en haut, flippers verts en bas), tout le reste du chemin est le vrai.
  Sans opérateur, la partie enregistrée dure le délai et la durée, plus 3 s ; `CYBERPINBALL_PARTIE_MS` la raccourcit (fin par la sortie de la table).
- **Preuves** : [enregistrement-partie.test.ts](../../packages/core/src/test/enregistrement-partie.test.ts) (événements, délai, durée, sortie, échec, témoin, fondu, réglages, sens du plateau dans les quatre orientations aller-retour avec la roue, recadrage du bureau, zones partagées, fichiers, propositions).
