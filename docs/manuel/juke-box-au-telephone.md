[English](../manual/juke-box-on-the-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Juke-box au téléphone

L'onglet **Juke-box** de la page du téléphone pilote le lecteur de la borne, comme à la borne : c'est le même lecteur (`app/src/jukebox-player.ts`), ses mêmes règles de lecture et les mêmes écrans, rien n'est refait à part.
Parcourir au téléphone déplace donc aussi la sélection à la borne.

- **Fermé** : le médaillon (« 4 playlists · 86 morceaux ») et **« Ouvrir le Juke-box »**, qui fait ce que fait Start sur le médaillon de la roue (mêmes portes du mode invité).
  Masqué de la roue, ou pendant une partie : grisé, avec sa raison.
- **Écouter** : les playlists, chacune avec la mosaïque de ses premières pochettes, son nombre de morceaux, sa durée ; l'égaliseur sur celle qui joue.
  Une playlist touchée s'ouvre (à la borne aussi) : son nom et le retour en tête, puis **Tout lire**, **Lecture aléatoire** et **Répétition** en boutons, à part des morceaux, puis les morceaux avec leur pochette, leur artiste et leur durée.
  Un morceau touché se lit d'un coup (la borne le choisit puis fait Start).
  Un morceau pas encore lisible est grisé, sa raison en ambre (« Téléchargement en cours · 40 % »).
- **Gérer** : la gestion du Juke-box s'ouvre à la borne (même lecteur fermé) et se montre **dans l'onglet Juke-box**, rangée en zones : les ajouts en tuiles (Importer de YouTube, Nouvelle playlist), l'état du compte YouTube en ligne d'état, puis les playlists sous leur titre, chacune avec sa vignette (sa pochette, sinon le disque) et son **⋮**.
  Les options d'une playlist (ajouter des fichiers, renommer, qualité, resynchroniser, libérer la place, supprimer…) ne suivent plus la liste : le ⋮ choisit la playlist à la borne sans l'ouvrir (message `focus`) et ouvre ses options dans une feuille à son nom ; une option indisponible y garde sa raison.
  Le sélecteur **Écouter / Gérer** reste toujours visible : « Écouter » ramène au lecteur, qui reprend là où il était.
  Le rangement vient de l'écran de la borne lui-même (`library.ts`, `remoteEntries` : la section de chaque action, `zone` et `group`) : la vue Écran met aussi un titre avant chaque groupe, sur tous les écrans.
- **Mini-lecteur** : dès qu'un morceau joue, au-dessus des onglets, partout : la pochette, le titre, « En lecture · 02 / 24 », Pause et Suivant, la barre du temps.
  Touché, il ouvre le **lecteur** : la grande pochette, le titre et l'artiste, le temps (on fait glisser pour avancer, comme le flipper tenu), Précédent, Lecture / Pause, Suivant, Lecture aléatoire, Répétition (playlist, morceau, aucune).
  Pendant une publicité YouTube, Suivant et l'avance sont grisés.
- **Précédent / suivant** : ajoutés au lecteur pour le téléphone (`skip`) : suivant, comme la fin du morceau (l'aléatoire tire le suivant), sans répéter le même ; précédent, le morceau lisible d'avant dans la playlist.
- **Ce qui part au téléphone** : ce qu'affiche le lecteur, toute la liste du niveau ouvert (`remoteView`, la vue du lecteur sans la fenêtre de huit lignes de la borne) : titres, artistes, durées, raisons, modes.
  Les pochettes sous jeton (`/images/<jeton>`), **réduites par la borne** (160 px pour une miniature, 120 px pour une case de mosaïque, 480 px pour la grande pochette, en JPEG ; Electron, `nativeImage`) : le réseau du téléphone reste léger, jamais un chemin.
  Le temps du morceau part à part (`jb-time`) ; la page l'avance seule, la borne ne le renvoie qu'en cas d'écart (pause, avance, morceau suivant).
- **Messages** : le téléphone envoie `jb` : `open`, `row` (une ligne reçue), `play`, `up`, `pause`, `shuffle`, `repeat`, `seek` (0 à 1), `next`, `prev`, `manage`, `exit` ; une ligne est sa clé reçue (200 caractères au plus).
  Tout autre mot coupe la liaison.
  La borne passe chaque commande au lecteur, comme un clic (`click`), et vérifie tout.
**Connexion à YouTube.**
La fenêtre d'Edge où tu te connectes à YouTube, depuis la borne, s'ouvre en plein écran, sans barre de titre.

- **Essais** : `telecommande.test.ts` rejoue le Juke-box dans le scénario hors écran des classements (`demo-telephone-scores`) : les playlists sans la gestion mêlée, leurs pochettes réduites sous jeton, une playlist ouverte, ses boutons à part des morceaux, un morceau grisé avec sa raison, un morceau lu d'un toucher, le mini-lecteur, le lecteur et son temps, pause, suivant, avance, retour, « Gérer ».
