[English](../manual/future-pinball-tables.md) · Français · [Sommaire du manuel](../manuel.md)

## Tables de Future Pinball

Cyber Pinball lance aussi les tables de **Future Pinball** (Black Sheep Studios, 2005), à côté des tables VPX, sur la même roue.
**En bêta** : l'entrée de l'entonnoir et la ligne « Future Pinball » de la fiche portent la pastille « BÊTA », l'écran « Tables de Future Pinball » le dit en tête.
Quand BAM est installé avec le jeu, la partie passe par lui ; ses réglages restent les siens, dans son menu en jeu.
Les scores du jeu ne sont pas lus.
Le catalogue propose aussi les versions Future Pinball des jeux (voir [Ajouter une table](ajouter-une-table-l-entonnoir-le-catalogue.md#ajouter-une-table--lentonnoir-le-catalogue--récupérer--liste-dattente)).

Une table de Future Pinball est un fichier `.fpt`, comme un `.vpx` : elle a dans le dossier des tables un dossier « Titre (Fabricant Année) » avec son `.fpt`, son `.info` et ses médias ; la roue, les collections, les favoris, les statistiques et les médias marchent donc de la même façon.

- **Trouver le jeu** : Cyber Pinball cherche « Future Pinball.exe » aux emplacements habituels, sur C:, D: et E: : `Games\Future Pinball`, `Future Pinball` à la racine, `Program Files (x86)\Future Pinball`, `Program Files\Future Pinball`, `vPinball\FuturePinball`, `vPinball\Future Pinball`, `Visual Pinball\Future Pinball`, `PinballX\Future Pinball`.
  Ailleurs, **« Choisir le dossier de Future Pinball… »** le désigne : le dossier de son exécutable, l'exécutable lui-même ou son dossier Tables.
  Le choix est gardé dans `<données>\future-pinball.json` et passe avant les emplacements habituels ; **« Revenir aux emplacements habituels »** l'oublie.
  Ce qui est trouvé n'est pas mémorisé : un jeu installé ensuite est vu aussitôt.
  BAM est reconnu à son lanceur, `BAM\FPLoader.exe` dans le dossier du jeu.
  Un jeu installé ailleurs (`C:\vPinball\FuturePinball`, `C:\Games`…) reste détecté et utilisé tel quel, sans rien déplacer ; l'écran « Tables de Future Pinball » et l'ajout d'une table disent quel dossier est utilisé et pourquoi.
- **Installer Future Pinball et BAM** : Menu système > Tables > Ajouter une table > « Tables de Future Pinball » > **« Installer Future Pinball et BAM… »** les télécharge et les installe dans le dossier de Cyber Pinball.
  Rien n'est livré avec Cyber Pinball : les auteurs ne parlent pas de redistribution, tu télécharges donc chez eux, avec ton accord.
  L'écran dit ce qui est téléchargé, d'où et où, et vérifie qu'il reste 300 Mo sur le disque avant de télécharger ; l'empreinte du fichier est vérifiée.
  L'installateur de l'auteur n'est pas lancé, car il s'arrête sur sa page de licence, même en mode silencieux : l'écran te montre en entier les deux contrats (celui de Future Pinball et celui de BAM) et n'extrait les fichiers qu'après ton accord, gardé à côté du jeu.
  L'extraction se fait par innoextract, un petit outil libre téléchargé lui aussi à la demande, sans demande d'administrateur ; les fichiers sont posés sans modification, et tes tables, bibliothèques, musiques et scripts déjà présents ne sont jamais écrasés.
  Cette installation n'a ni désinstalleur, ni raccourcis, ni association des fichiers `.fpt` : Cyber Pinball lance lui-même les tables, et supprimer le dossier de Future Pinball dans Cyber Pinball suffit à tout retirer ; l'écran de demande le dit avant le téléchargement.
  Si l'extraction échoue sur ton PC (antivirus, droits, disque), un écran « Installer à la main » te guide : ouvrir l'installateur de l'auteur déjà téléchargé et vérifié, lire et accepter son contrat, puis « J'ai fini : vérifier » retrouve Future Pinball où que tu l'aies installé.
- **Reprendre une installation existante** : tu peux reprendre les tables, bibliothèques, musiques et scripts de l'ancienne installation dans celle de Cyber Pinball ; la liste, la taille et la destination sont affichées avant la copie, rien n'est écrasé, l'ancienne installation reste intacte.
  La reprise reprend aussi les vues de BAM (la caméra réglée de chaque table) : une vue que BAM avait créée par défaut et que personne n'avait réglée est remplacée en gardant l'ancienne à côté ; une vue que tu avais enregistrée n'est jamais écrasée.
- **Ajouter ses tables** : Menu système > Tables > Ajouter une table > **« Tables de Future Pinball »**.
  L'écran montre le jeu trouvé (« Trouvé sur ce PC » ou « Dossier choisi à la main »), ou « Introuvable » avec les endroits cherchés, puis les `.fpt` du dossier Tables du jeu et de ses sous-dossiers (deux niveaux), triés par nom.
  Une table déjà dans le front-end porte « Dans le front-end » et Start ouvre sa fiche ; Exit revient alors à cet écran.
  Start sur une autre table l'ajoute au front-end, dans un dossier « Titre (Fabricant Année) » du dossier des tables.
  Un dossier qui tient déjà une autre table (la même machine en VPX, un autre `.fpt`) reste à elle : la table de Future Pinball prend « … Future Pinball », sans quoi les deux partageraient leur `.info` et leurs médias.
  Le `.fpt` y est **lié** (lien physique, sur le même disque : aucune place en plus) ou **copié** (autre disque, clé USB) ; l'original, dans le dossier Tables du jeu, n'est jamais modifié.
  Les réglages de physique de BAM de la table (le `.xml` du même nom, à côté du `.fpt`) la suivent, liés ou copiés de même : BAM les cherche à côté de la table qu'il ouvre.
  Son nom vient de la base VPS (jeux qui existent en Future Pinball d'abord, format « FP ») quand elle le reconnaît sans hésiter, sinon du nom du fichier ; titre, fabricant, année et jeu VPS vont dans le `.info`.
  Quand le jeu VPS est reconnu, les médias du front-end qui manquent (VPinMediaDB) arrivent ensuite en arrière-plan, suivis dans Téléchargements.
  Une table déjà présente (même nom de fichier, même taille) n'est pas ajoutée une seconde fois.
- **Une table rangée ailleurs** : **« Choisir des fichiers .fpt… »** (clé USB, Téléchargements, autre disque), même sans le dossier du jeu.
  Un `.fpt` choisi par « Choisir des fichiers… » de l'entonnoir, ou glissé sur la fenêtre, passe par le même ajout ; seul, il ouvre l'écran « Tables de Future Pinball », qui dit ce qui a été fait.
- **Archive d'une table** (reçue du catalogue ou par Téléchargements) : chaque fichier va à sa place dans le dossier du jeu, puis la table arrive sur la roue avec le nom du jeu choisi et sa version notée.
  Le `.fpt` va dans Tables, les bibliothèques (`.fpl`) dans Libraries, une bibliothèque de script (`.vbs`) dans Scripts, les réglages de physique de BAM (`.xml` au nom de la table) à côté d'elle dans Tables.
  Un fichier rangé dans l'archive sous un dossier du jeu (Tables, Libraries, Music, Scripts, BAM) y garde sa place.
  Une archive qui ne contient que des bibliothèques, comme les sons, voix et musiques d'une table livrés à part, est rangée de même dans Libraries.
  Rien n'est écrasé : une bibliothèque déjà là reste celle du jeu (d'autres tables s'en servent), et une autre table du même nom est copiée à côté, sous « Titre (2).fpt ».
  Les autres fichiers (lisez-moi, images, vidéos de présentation) ne vont nulle part.
  Avant la partie, Cyber Pinball lit les bibliothèques (`.fpl`) que la table cite et repère celles qui manquent dans le jeu (par exemple les sons de Ghostbusters, livrés dans une seconde archive).
  Une bibliothèque que l'ancienne installation avait encore est remise sans rien écraser ; sinon le journal le dit, nomme l'archive reçue qui la contient peut-être et rappelle d'utiliser « Ajouter une table » dessus.
  Dans « Ce qu'il faut » d'une version Future Pinball, il ne faut que la table : un fronton animé (`.directb2s`) proposé par la fiche sert à VPX, et l'écran le dit, Future Pinball dessinant son propre fronton.
- **Lancement** : `"Future Pinball.exe" /open "<table>.fpt" /play /exit`, lancé depuis le dossier du jeu (ses bibliothèques `.fpl`), avec le `.fpt` du dossier de la table.
  Avec BAM, la partie passe par son lanceur, comme avec les autres front-ends : `"BAM\FPLoader.exe" /open "<table>.fpt" /play /exit /arcaderender /STAYINRAM`, lancé depuis le dossier de BAM ; sans `/STAYINRAM`, BAM ne charge pas ses réglages.
  Les tables récentes (physique FizX) ont besoin de BAM pour se jouer comme prévu.
  La partie est celle de Pinball FX : chargement, barres des tâches masquées, autres front-ends ouverts signalés, statistiques et niveau, retour à la roue.
  Sans BAM, le jeu est reconnu à la première fenêtre visible de son propre processus, jamais à un titre qu'une page web pourrait porter.
  Avec BAM, il est reconnu à son exécutable, « Future Pinball.exe », même quand FPLoader le lance à part ; un Future Pinball déjà ouvert avant le lancement n'est pas pris pour la partie, et FPLoader, s'il reste ouvert, est fermé à la fin.
  Quitter la table dans le jeu le ferme (`/exit`) et ramène à la roue ; un **appui long sur Exit** (2 s) le ferme aussi, et l'écran de chargement l'écrit en une pastille au bas de l'écran (« Pour revenir à Cyber Pinball : maintiens Exit 2 s »).
- **Boutons d'une borne à joystick** (Pinscape, encodeur en mode manette) : Future Pinball ne lit que le clavier, et son propre réglage de manette ne marche que sous un Windows en anglais.
  Pendant la partie, Cyber Pinball rend donc chaque bouton de joystick relevé par l'assistant sous la touche que les préférences du jeu donnent à son rôle (Préférences > Touches, lues dans le registre de l'utilisateur ; ses touches d'origine si elles manquent).
  Sont rendus : flippers, lanceur, Start, crédit, secousses gauche, droite et avant, MagnaSave gauche et droit (les « Special 1 » et « Special 2 » du jeu) ; Exit envoie Échap, qui quitte la table.
  Les touches ne partent que quand le jeu est au premier plan, et celles encore tenues sont relâchées à la fin de la partie ; les boutons d'un encodeur clavier arrivent au jeu tels quels.
- **Vue de la table aux boutons de la borne** (borne sans clavier, boutons de joystick) : en partie, appuie sur les deux boutons MagnaSave ensemble, le menu de BAM s'ouvre et tu règles la vue de la table avec les boutons de la borne.
  Les flippers changent la valeur, les MagnaSave choisissent la ligne, Start valide, Exit ferme le menu (la partie continue) ; menu fermé, tes boutons se comportent comme avant.
  BAM enregistre lui-même la vue de la table et la relit au lancement suivant.
  La touche d'ouverture est lue dans le fichier `bam.cfg` de BAM (Menu) ; sans réglage lisible, c'est celle du manuel de BAM.
  Une borne dont les MagnaSave sont au clavier garde le menu de BAM à son clavier.
  L'aide s'affiche en tête de l'écran « Tables de Future Pinball ».
- **Secousses** : Future Pinball ne lit pas l'accéléromètre d'un Pinscape.
  Pendant la partie, Cyber Pinball suit l'accéléromètre choisi à l'étape « Tilt » (voir [Tilt](tilt.md#tilt)) et, à chaque à-coup franc, frappe une fois la touche de secousse du jeu de ce côté : gauche, droite ou vers l'avant, d'après ses préférences.
  Le sens suit le réglage de l'accéléromètre pour VPX : une borne dont VPX secoue juste secoue juste ici.
  Une courte pause suit chaque secousse, pour que le rebond de la caisse ne compte pas comme une seconde ; rien n'est envoyé quand le jeu n'est pas au premier plan, ni avec l'accéléromètre réglé sur « Aucun ».
  À la fin de la partie, le journal compte les secousses envoyées de chaque côté.
- **Fenêtre et écrans** : ouvert en fenêtre ailleurs que sur le playfield, le jeu y est posé ; en plein écran, il reste là où ses préférences l'ont mis.
  Le jeu retient le nom Windows de l'écran (« \\.\DISPLAY2 »), que Windows renumérote parfois : le playfield pouvait s'ouvrir sur l'écran du DMD, les écrans se réarrangeaient et le playfield gardait une image fixe pendant la partie.
  Cyber Pinball règle donc ces deux écrans, playfield et fronton, d'après ta borne avant chaque partie.
  Son cadrage se règle dans ses préférences (Vidéo) ; « Régler l'affichage en partie » reste grisé avec cette raison.
  La partie garde l'orientation que Cyber Pinball donne au playfield pour la session : lancée sur celle de Windows, la table s'afficherait à l'envers (voir [Orientation et cadrage des tables](orientation-et-cadrage-des-tables.md#orientation-du-bureau-à-la-sortie)).
  Comme pour les jeux de Zen, les écrans où ses fenêtres annexes dessinent (fronton, DMD) lui sont laissés, et les autres montrent leur média selon « Médias pendant la partie » (voir [Tables de Pinball FX](tables-de-pinball-fx.md)).
- **DMD sur l'écran DMD, par dmdext** : Future Pinball dessine son DMD dans sa fenêtre du fronton.
  Quand DMD Extensions (dmdext) est installé avec le jeu et réglé, c'est-à-dire `dmdext.exe` et son `DmdDevice.ini` dans le dossier du jeu ou dans son sous-dossier `dmdext`, ce DMD est recopié sur l'écran DMD de la borne pendant la partie, comme avec PinUP Popper : `dmdext mirror --source=futurepinball -q --virtual-stay-on-top --fps 60 -g "<table>" --use-ini="DmdDevice.ini"`.
  dmdext est lancé avant le jeu et fermé à la fin ; un échec de lancement est noté au journal, et la partie continue sans DMD recopié.
  Son DMD virtuel est posé par Cyber Pinball sur l'écran DMD tel qu'il est pendant la partie, toute la largeur de l'écran au format d'un DMD (4:1), au milieu : le plein écran du jeu fait déplacer des écrans par Windows, et la place écrite dans `DmdDevice.ini` tombait alors hors de tout écran.
  Un DMD que le joueur a déjà placé entièrement sur l'écran DMD reste où il est.
  L'écran DMD est laissé à dmdext comme à une fenêtre du jeu.
- **Tables « PinEvent »** (comme Retroflair BAM Edition) : elles se jouent avec le DMD et les sons de Future Pinball, sans rien à installer de plus ; Cyber Pinball ne te demande plus d'installer PinUP Player ni PinUP Popper.
  Le lecteur de PuP-Packs (PinUP Player) qu'une table lance parfois n'est plus pris pour PinUP Popper (plus de fausse alerte « PinUP Popper est ouvert »), et il se ferme avec la partie.
  Quand il est là, il place ses fenêtres d'après son propre réglage (`PinUpPlayer.ini`), écrit pour une autre disposition des écrans.
  Pendant la partie, Cyber Pinball pose chaque fenêtre de PinUP Player sur tout l'écran de son rôle, tel qu'il est à cet instant : l'écran 0 de PinUP sur le topper, le 2 sur le fronton, le 5 sur le FullDMD ; les autres restent où PinUP les met.
  Ces écrans sont laissés au PuP-Pack, et le réglage de PinUP n'est pas modifié.
- **Partie impossible** : jeu introuvable (le message renvoie à « Tables de Future Pinball » pour choisir son dossier), fichier de la table absent, ou chemin que la ligne de commande ne saurait passer (guillemet) : dit avant tout lancement.
  Un jeu qui se ferme sans ouvrir de fenêtre (table illisible ou refusée) : « Future Pinball s'est fermé sans ouvrir la table », aussitôt, avec ce qu'il faut vérifier dans le jeu lui-même (ses bibliothèques `.fpl`, sa version).
  Avec BAM, un lanceur arrêté avant que le jeu paraisse : « Future Pinball ne s'est pas ouvert : son lanceur (BAM) s'est arrêté avant », et le message propose de lancer `BAM\FPLoader.exe` soi-même pour vérifier la table.
- **Fiche** : ce qui est propre à VPX reste à sa place, grisé, avec la raison : « Parties du jeu » (la table tient dans son `.fpt`), « Fichiers de la table », « Réglages de cette table », « Régler l'affichage en partie », « DMD sur la roue », « Jouer et enregistrer », « Diagnostiquer et réparer », « Jouer avec un ami », les parties en direct et le tableau des scores (« Scores de Future Pinball : pas encore lus par Cyber Pinball »).
  La section Fichiers dit le `.fpt`, le jeu trouvé (son dossier, pastille « BÊTA », ou « Introuvable sur ce PC » et où le choisir) et la ligne « BAM » : « Installé : la partie passe par FPLoader ; ses réglages dans son menu en jeu », ou « Pas installé : la table se joue sans BAM (les tables FizX en ont besoin) ».
  « Supprimer la table » met la table du front-end à la corbeille ; l'original, dans le dossier Tables du jeu, n'est pas touché.
  « Médias du jeu » et « Modifier les informations » marchent comme pour une table VPX.
- **Diagnostic** : le diagnostic ne lit que les tables VPX (script, ROM, PuP-Pack, fronton, réglages de VPX).
  Une table de Future Pinball, de Pinball FX ou de Pinball FX3 ne donne aucun constat : jamais de « ROM absente » sur un `.fpt`.
- **Code** : détection, liste des tables, commande (BAM compris), ajout, dmdext, fenêtres de PinUP Player et place de la fenêtre dans [packages/core/src/futurepinball.ts](../../packages/core/src/futurepinball.ts) ; archives dans [packages/core/src/futurepinball-archive.ts](../../packages/core/src/futurepinball-archive.ts) ; touches du jeu dans [packages/core/src/futurepinball-keys.ts](../../packages/core/src/futurepinball-keys.ts) ; secousses dans [packages/core/src/nudge-keys.ts](../../packages/core/src/nudge-keys.ts) et [app/src/nudge-keys.ts](../../app/src/nudge-keys.ts) ; écran « Tables de Future Pinball » dans [app/src/futurepinball-ui.ts](../../app/src/futurepinball-ui.ts) ; partie dans [app/src/futurepinball-play.ts](../../app/src/futurepinball-play.ts) et `playPinballFx` (`app/src/frontend.ts`), lanceur commun dans [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts) (`FUTURE_PINBALL_LAUNCH_GAME`, `FUTURE_PINBALL_BAM_LAUNCH_GAME`), envoi des touches dans [app/src/zen-keys.ts](../../app/src/zen-keys.ts) ; fiche dans `app/src/library.ts`.
  Tests : `futurepinball.test.ts`, `futurepinball-play.test.ts`, `futurepinball-archive.test.ts`, `futurepinball-keys.test.ts`.
