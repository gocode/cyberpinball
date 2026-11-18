[English](../manual/what-s-missing-to-play-guided-path.md) · Français · [Sommaire du manuel](../manuel.md)

## Ce qu'il manque pour jouer : parcours guidé

Une table qui ne se lance pas a presque toujours une cause que Cyber Pinball connaît déjà (ROM absente, VPX pas installé…), mais le médecin s'arrêtait souvent au constat (« ROM « t2_l8 » absente : mettez le fichier dans le dossier d'import »), sans dire où trouver le fichier.
L'écran **« Ce qu'il manque pour jouer »** accompagne jusqu'à la partie : chaque étape dit où elle en est et propose le geste suivant, en un appui sur Start (ou un clic).

- **Ce qui est obligatoire pour jouer** : le fichier `.vpx` et, si son script en demande une, la ROM, absente ou illisible pour PinMAME (pas liée, mal rangée, éparpillée, ancien nom sans alias).
  Une ROM trouvée par le dossier commun de PinMAME, ou fournie par un alias vers une révision voisine, suffit.
  Rien d'autre ne retient « Jouer » : contenu du DMD, fronton `.directb2s`, PuP-Pack, médias, couleurs du DMD, sons alternatifs, rangement de la table sont proposés, jamais exigés.
  Une seule règle, dans le cœur : [packages/core/src/playable.ts](../../packages/core/src/playable.ts) (`blocksPlay`, `playBlockers`, `requiredForPlay`).
  Le médecin s'y tient (seuls les constats de ROM sont de gravité « erreur » ; `playSeverity`, appliqué par `diagnose`, fait redescendre tout autre constat à « avertissement »), comme le parcours, « Ce qu'il faut » du catalogue (« indispensable » : la table et la ROM), l'installation rapide, la fiche et l'inventaire « Fichiers de la table » (`romBlockers`, qui ne disent plus « ROM absente » quand PinMAME la trouve par son dossier commun).
  Tests : `playable.test.ts` (chaque règle du médecin, même marquée « erreur ») et l'invariant vérifié sur chaque table piégée (`doctor-traps.test.ts`).
- **Où on le trouve** : en tête de la fiche quand la ROM manque, ou qu'un parcours est en cours (« Reprendre : Étape 3 sur 4 ») ; après une partie qui a échoué (« Start : voir ce qu'il manque pour jouer ») ; dans le diagnostic, dès qu'un constat empêche de jouer ; dans la liste d'attente (« Reprendre : ce qu'il manque pour jouer <table> »).
  Un contenu du DMD absent est proposé dans la fiche après « Jouer » (« Pour aller plus loin »), jamais en tête.
- **Étapes** : d'abord le chemin jusqu'à « Jouer », numéroté : « Borne et VPX », « Table » (le fichier .vpx, et la ROM que demande son script), « ROM <nom> » (si le script utilise PinMAME), puis « Jouer ».
  En tête, « Étape n sur N » (le chemin seul), une barre d'un segment par étape et « 2 étapes réglées · 1 indispensable à faire · 1 amélioration proposée ».
  Ensuite, **« Pour aller plus loin »** : facultatives, sans numéro (signe « + ») ni place dans le décompte, jamais indispensables : « Rangement de la table » (table hors de son dossier, script remplacé par un `.vbs`, rapport de plantage), « Contenu du DMD » (si le script charge un dossier FlexDMD ou UltraDMD), « Fronton » (si la borne a un écran de fronton), « PuP-Pack » (si le script en charge un), « Affichage » (s'il y a un réglage propre à la table à corriger).
  Chaque étape a son état, un mot et un signe : « Réglé », « À faire », « Conseillé », « Attendu », « À installer », « Facultatif », « En attente », « Non vérifié ».
  La courante est la première indispensable pas réglée, sinon « Jouer » (« Tout est prêt pour jouer »).
  Ses gestes viennent en premier, le conseillé allumé ; puis le premier geste de chaque autre étape ouverte, le chemin puis les améliorations (un fronton, le contenu du DMD), « Revérifier » et « Diagnostic complet ».
- **Contenu du DMD** : le dossier que charge un script FlexDMD ou UltraDMD (`.ProjectFolder = "./TheGooniesDMD/"`) est facultatif.
  Sans lui, l'emplacement du DMD garde un DMD par défaut : en partie, celui de la ROM, que dessinent les plugins PinMAME et ScoreView de VPX (§ « Plugins de VPX ») ; dans le front-end, l'afficheur à points de Cyber Pinball (`fallback.js`).
  Le plugin FlexDMD de VPX 10.8.1 renvoie `Nothing` au script pour une image absente (`plugins/flexdmd/actors/Image.cpp`, commit af26b2d93) : le DMD que dessine le script reste vide, et un script qui ne s'y attend pas s'arrête sur « Type incompatible » (Goonies de VPW).
  L'échec de la partie le dit alors (« Le script s'est arrêté sur le DMD qu'il dessine… »), et l'étape propose « Récupérer la table d'origine » ou « J'ai l'archive de la table » ; un dossier vidé en vrac à la racine de la table se range sur place.
- **ROM absente** : Cyber Pinball cherche dans la base VPS (en cache, sans réseau) les fichiers ROM de ce nom, celui du jeu de la table d'abord, puis les autres révisions du même jeu (`romSources`).
  « Récupérer la ROM t2_l8 » l'ajoute à la liste d'attente, rattachée à la table, et ouvre sa fiche dans la fenêtre « Récupérer » : on s'y connecte et on télécharge soi-même.
  Cyber Pinball ne télécharge jamais à la place de l'utilisateur sur un forum à compte (§ « Trouver une table » ci-dessus).
  Pendant l'attente : « Rouvrir la page » et « Chercher dans Téléchargements ».
  Le fichier reçu (fenêtre « Récupérer », surveillance de Téléchargements) fait passer l'étape à « À installer » : « Installer le fichier reçu » montre le plan d'ajout (bibliothèque de ROM, lien dans la table), puis revient au parcours, qui relit la table.
  Une révision voisine déjà sur la borne est proposée en second (« Jouer avec t2_l6, révision voisine », avec l'avertissement du § « Bibliothèque de ROM »), ou en premier si la base VPS ne donne aucun lien ; une révision voisine donnée par la base, en dernier recours.
  Sans lien : « Chercher t2_l8 dans le catalogue » ; toujours : « J'ai déjà le fichier » (le glisser sur l'écran, ou le choisir sur ce PC), qui passe aussi par le plan et revient au parcours.
- **Reprendre plus tard** : l'état se relit à chaque ouverture (constats du médecin, liste d'attente, base VPS).
  Les étapes déjà montrées sont retenues dans `<données>\parcours.json`, avec la dernière position (numéro d'étape et total, traduits à l'affichage : la fiche suit la langue choisie depuis) : une étape réglée depuis reste dans la liste, cochée, et « Étape n sur N » ne change pas de sens.
  Le parcours est oublié quand on lance la partie depuis lui.
- **Code** : plan dans [packages/core/src/journey.ts](../../packages/core/src/journey.ts) (`planJourney`, `romSources`, `journeyChoices`, mémoire des parcours), tests dans `packages/core/src/test/journey.test.ts` (tables piégées analysées par le médecin, d'une ROM absente jusqu'à « Jouer ») ; écran dans `app/src/journey.ts`, rendu `renderJourney` (`app/renderer/library.js`) ; points d'entrée du catalogue (`fetchFor`, `reopen`, `scanDownloads`, `openSearch`) dans `app/src/catalog.ts`.
  Maquettes : `EcranParcours` et `EcranParcoursBureau` du design system.

**Ce qui empêche un jeu de fonctionner**, ce que le médecin en disait, et ce que fait le parcours :

| Cause | Constat du médecin | Avant le parcours | Étape et geste du parcours |
| --- | --- | --- | --- |
| VPX pas installé | aucun : le script n'est pas lu, la ROM pas vérifiée | message « Aucune table », installation de VPX | « Borne et VPX » : « Installer Visual Pinball X » ; la ROM attend (« En attente ») |
| Borne pas configurée | aucun | assistant au premier lancement | « Borne et VPX » : « Configurer la borne » |
| Table en vrac dans le dossier des tables | `outsideFolder` | la déplacer | « Rangement de la table », pour aller plus loin : la même correction |
| Dossier de la table, ou l'un de ses sous-dossiers, au nom abîmé par une copie sous Node 22 (« Ã‰tÃ© » pour « Été ») | `folderMangled` | aucun : la table se dédoublait, ou son pack restait introuvable | « Rangement de la table » : ranger le contenu sous le vrai nom |
| Script illisible, remplacé par un `.vbs`, ou adapté pour une ancienne version | `scriptUnreadable`, `scriptOverride`, `scriptPatchStale` | `.vbs` à la corbeille ; `.vbs` de Cyber Pinball refait d'après le nouveau script | « ROM » non vérifiée ; le `.vbs` dans « Rangement de la table » |
| Script qu'arrête le core.vbs de VPX 10.8 (`vpmInit` appelé deux fois : « cvpmFlips2.Init is called twice ») | `scriptCoreCompat` | aucun : la partie s'arrêtait à chaque lancement | réparé seul avant la partie (`.vbs` de Cyber Pinball) ; script protégé : « Rangement de la table » dit quoi retirer |
| Script qui redéfinit une procédure à chaque clignotement d'une lumière (`FlashForMs`, `SetFlash`) : la partie s'arrête le temps que l'antivirus l'analyse | `scriptCoreCompat` (avertissement, « Script qui arrête la partie à chaque clignotement ») | aucun : la partie s'arrêtait un instant à chaque clignotement | réparé seul avant la partie (`.vbs` de Cyber Pinball) ; jamais exigé pour jouer |
| ROM absente | `romMissing`, sans correction | « mettez le fichier dans le dossier d'import » | « ROM » : sa fiche dans la base VPS, fenêtre « Récupérer », attendue puis reçue pour la table, plan, retour au parcours |
| Révision voisine sur la borne | `romAlias` (bloquant) | écrire l'alias | proposée en second, après la ROM exacte |
| Seule une autre révision dans la base VPS | aucun | rien | « Récupérer t2_l6, révision voisine », puis l'alias |
| Ancien nom de VPinMAME | `romAliasHistoric` | écrire l'alias, ou « il faut aussi bond.zip » | la correction, ou la ROM réelle à récupérer |
| ROM dans la bibliothèque, pas liée | `romNotLinked` | la lier | la même correction |
| ROM ailleurs dans le dossier de la table | `romMisplaced` | la ranger | la même correction |
| Alias devenu inutile | `romAliasObsolete` | retirer la ligne | « Conseillé » |
| Dossier du DMD absent | `dmdFolderMissing` (avertissement) | ranger les fichiers en vrac, sinon « ajoutez-le » ; il était bloquant | « Contenu du DMD », pour aller plus loin : la correction, ou la table d'origine à récupérer (« J'ai l'archive de la table ») ; « Jouer » tout de suite |
| Fronton absent ou mal nommé | `backglassMissing`, `backglassMisnamed` | information, ou renommer | « Fronton », pour aller plus loin : renommer, ou le fronton qui va avec les écrans |
| Fronton sans aucune image (bouchon « Generic » laissé par un autre front-end de borne) : le plugin B2S de VPX 10.8.1 plante à la première image (0xC0000005 dans `plugin-b2s64.dll`) | `backglassEmpty` (`b2sWithoutBackglass`, un `.directb2s` en XML sans `BackglassImage`, `BackglassOnImage` ni `BackglassOffImage`) | le mettre à la corbeille ; fait seul dès l'installation et avant chaque partie (`PUP_PLAY_REPAIRS`) | rien à faire : la table se joue sans fronton B2S |
| PuP-Pack introuvable, rangé trop bas, coupé par le script, option | `pupMissing`, `pupNested`, `pupDisabledByScript`, `pupOptionNotApplied`, `pupOptionUnsuited` | renommer, remonter, allumer le pack dans un `.vbs`, appliquer l'option | « PuP-Pack », pour aller plus loin : la correction, ou le pack à récupérer |
| Cadrage ou écrans imposés par la table | `manualView`, `tableWindows` | retirer le réglage | « Affichage », pour aller plus loin |
| Écrans changés, configuration à choisir | aucun (vu au lancement) | message avant la partie | hors du parcours : le lancement ouvre le choix de configuration |
| Autre front-end de borne ouvert | aucun (vu au lancement) | « PinUP Popper est ouvert » | hors du parcours |
| Boutons du joystick que VPX n'a pas vus | aucun (vu après la partie) | refaire l'étape « Boutons » | hors du parcours |
| Fichiers de VPX remplacés hors de Cyber Pinball (un autre VPX copié par-dessus) : VPX s'arrête en démarrant, sur toutes les tables | aucun ; « Santé de la borne » et la fiche technique les nomment | aucun : l'écran d'échec accusait la table | hors du parcours : « VPX s'est arrêté en démarrant », Start remet les fichiers d'origine |
| Autre VPX choisi pour la table, déplacé ou désinstallé | aucun (vu au lancement) | aucun | hors du parcours : « VPX 10.8.0 introuvable » ; Gérer la table, « Jouée avec », pour revenir au VPX de Cyber Pinball |
