[English](../manual/future-pinball-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Future Pinball

Cyber Pinball lance aussi les tables de **Future Pinball** (Black Sheep Studios, 2005), à côté des tables VPX, sur la même roue.
**En bêta, premier niveau** : l'entrée de l'entonnoir et la ligne « Future Pinball » de la fiche portent la pastille « BÊTA », l'écran « Tables de Future Pinball » le dit en tête.
BAM (FPLoader, suivi de la tête, ses réglages) n'est pas encore pris en charge : la table se joue dans Future Pinball seul.
Les scores du jeu ne sont pas lus, et Cyber Pinball ne télécharge pas de tables de Future Pinball.

Une table de Future Pinball est un fichier `.fpt`, comme un `.vpx` : elle a dans le dossier des tables un dossier « Titre (Fabricant Année) » avec son `.fpt`, son `.info` et ses médias ; la roue, les collections, les favoris, les statistiques et les médias marchent donc de la même façon.

- **Trouver le jeu** : Cyber Pinball cherche « Future Pinball.exe » aux emplacements habituels, sur C:, D: et E: : `Games\Future Pinball`, `Future Pinball` à la racine, `Program Files (x86)\Future Pinball`, `Program Files\Future Pinball`, `vPinball\FuturePinball`, `vPinball\Future Pinball`, `Visual Pinball\Future Pinball`, `PinballX\Future Pinball`.
  Ailleurs, **« Choisir le dossier de Future Pinball… »** le désigne : le dossier de son exécutable, l'exécutable lui-même ou son dossier Tables.
  Le choix est gardé dans `<données>\future-pinball.json` et passe avant les emplacements habituels ; **« Revenir aux emplacements habituels »** l'oublie.
  Ce qui est trouvé n'est pas mémorisé : un jeu installé ensuite est vu aussitôt.
- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Future Pinball »**.
  L'écran montre le jeu trouvé (« Trouvé sur ce PC » ou « Dossier choisi à la main »), ou « Introuvable » avec les endroits cherchés, puis les `.fpt` du dossier Tables du jeu et de ses sous-dossiers (deux niveaux), triés par nom.
  Une table déjà dans le front-end porte « Dans le front-end » et Start ouvre sa fiche ; Exit revient alors à cet écran.
  Start sur une autre table l'ajoute au front-end, dans un dossier « Titre (Fabricant Année) » du dossier des tables.
  Un dossier qui tient déjà une autre table (la même machine en VPX, un autre `.fpt`) reste à elle : la table de Future Pinball prend « … Future Pinball », sans quoi les deux partageraient leur `.info` et leurs médias.
  Le `.fpt` y est **lié** (lien physique, sur le même disque : aucune place en plus) ou **copié** (autre disque, clé USB) ; l'original, dans le dossier Tables du jeu, n'est jamais modifié.
  Son nom vient de la base VPS (jeux qui existent en Future Pinball d'abord, format « FP ») quand elle le reconnaît sans hésiter, sinon du nom du fichier ; titre, fabricant, année et jeu VPS vont dans le `.info`.
  Quand le jeu VPS est reconnu, les médias du front-end qui manquent (VPinMediaDB) arrivent ensuite en arrière-plan, suivis dans Téléchargements.
  Une table déjà présente (même nom de fichier, même taille) n'est pas ajoutée une seconde fois.
- **Une table rangée ailleurs** : **« Choisir des fichiers .fpt… »** (clé USB, Téléchargements, autre disque), même sans le dossier du jeu.
  Un `.fpt` choisi par « Choisir des fichiers… » de l'entonnoir, ou glissé sur la fenêtre, passe par le même ajout ; seul, il ouvre l'écran « Tables de Future Pinball », qui dit ce qui a été fait.
- **Lancement** : `"Future Pinball.exe" /open "<table>.fpt" /play /exit`, lancé depuis le dossier du jeu (ses bibliothèques `.fpl`), avec le `.fpt` du dossier de la table.
  La partie est celle de Pinball FX : chargement, barres des tâches masquées, autres front-ends ouverts signalés, statistiques et niveau, retour à la roue.
  Le jeu est reconnu à la première fenêtre visible de son propre processus, jamais à un titre qu'une page web pourrait porter.
  Quitter la table dans le jeu le ferme (`/exit`) et ramène à la roue ; un **appui long sur Exit** (2 s) le ferme aussi.
  Les boutons arrivent au jeu tels quels : contrairement aux jeux de Zen, les boutons de joystick ne sont pas changés en touches du clavier.
- **Fenêtre et écrans** : ouvert en fenêtre ailleurs que sur le playfield, le jeu y est posé ; en plein écran, il reste là où ses préférences l'ont mis.
  Ses écrans et son cadrage se règlent dans ses préférences (Vidéo) ; « Régler l'affichage en partie » reste grisé avec cette raison.
  Comme pour les jeux de Zen, les écrans où ses fenêtres annexes dessinent (fronton, DMD) lui sont laissés, et les autres montrent leur média selon « Médias pendant la partie » (voir [Tables de Pinball FX](tables-de-pinball-fx.md)).
- **Partie impossible** : jeu introuvable (le message renvoie à « Tables de Future Pinball » pour choisir son dossier), fichier de la table absent, ou chemin que la ligne de commande ne saurait passer (guillemet) : dit avant tout lancement.
  Un jeu qui se ferme sans ouvrir de fenêtre (table illisible ou refusée) : « Future Pinball s'est fermé sans ouvrir la table », aussitôt, avec ce qu'il faut vérifier dans le jeu lui-même (ses bibliothèques `.fpl`, sa version).
- **Fiche** : ce qui est propre à VPX reste à sa place, grisé, avec la raison : « Parties du jeu » (la table tient dans son `.fpt`), « Fichiers de la table », « Réglages de cette table », « Régler l'affichage en partie », « DMD sur la roue », « Jouer et enregistrer », « Diagnostiquer et réparer », « Jouer avec un ami », les parties en direct et le tableau des scores (« Scores de Future Pinball : pas encore lus par Cyber Pinball »).
  La section Fichiers dit le `.fpt`, le jeu trouvé (son dossier, pastille « BÊTA », ou « Introuvable sur ce PC » et où le choisir) et la ligne « BAM » : « Pas encore : la table se joue sans suivi de la tête ni réglages de BAM ».
  « Supprimer la table » met la table du front-end à la corbeille ; l'original, dans le dossier Tables du jeu, n'est pas touché.
  « Médias du jeu » et « Modifier les informations » marchent comme pour une table VPX.
- **Diagnostic** : le diagnostic ne lit que les tables VPX (script, ROM, PuP-Pack, fronton, réglages de VPX).
  Une table de Future Pinball, de Pinball FX ou de Pinball FX3 ne donne aucun constat : jamais de « ROM absente » sur un `.fpt`.
- **Code** : détection, liste des tables, commande, ajout et place de la fenêtre dans [packages/core/src/futurepinball.ts](../../packages/core/src/futurepinball.ts) ; écran « Tables de Future Pinball » dans [app/src/futurepinball-ui.ts](../../app/src/futurepinball-ui.ts) ; partie dans [app/src/futurepinball-play.ts](../../app/src/futurepinball-play.ts) et `playPinballFx` (`app/src/frontend.ts`), lanceur commun dans [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts) (`FUTURE_PINBALL_LAUNCH_GAME`) ; fiche dans `app/src/library.ts`.
  Tests : `futurepinball.test.ts`, `futurepinball-play.test.ts`.
