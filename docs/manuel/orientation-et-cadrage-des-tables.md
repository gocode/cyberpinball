[English](../manual/table-orientation-and-framing.md) · Français · [Sommaire du manuel](../manuel.md)

## Orientation et cadrage des tables

Après le choix du playfield, l'assistant demande où se tient le joueur : les flippers font tourner l'affichage jusqu'à ce que le texte soit à l'endroit, la bande « Flippers · vous êtes ici » de son côté.
Il demande ensuite la diagonale, proposée d'après l'EDID (la taille au millimètre du timing détaillé, sinon les centimètres), et refusée si elle ne colle pas aux proportions de l'image : c'est le cas de certains téléviseurs et des projecteurs.
Le tout est rangé dans `cabinet.json` (`playfield.flipperEdge`, `playfield.manualSizeCm` seulement si la diagonale diffère de l'EDID ; `packages/core/src/layout.ts`).
Ces questions se refont seules par menu système > « Borne » > « Configuration de la borne » > « Orientation et taille du playfield » (`--assistant --playfield`), et avec « Écrans et rôles » quand le playfield change d'écran.

Clés écrites dans `VPinballX.ini` (`vpxLayoutSettings`, relevées dans `ViewSetup.cpp` et `player.cpp` de VPX 10.8.1) :

| Clé | Valeur | Gérée |
| --- | --- | --- |
| `[Player] BGSet` | 1 (borne) si l'image est plus haute que large pour le joueur, sinon 0 | oui |
| `[Player] ScreenWidth`, `ScreenHeight` | taille réelle en cm, le grand côté en largeur quelle que soit l'orientation | oui |
| `[Player] CabinetAutofitMode` | en vue borne, 1 (« Ajuster la table ») ou 2 (« Remplir l'écran ») : le mode choisi est gardé, toute autre valeur (absente, 0, `Manual`) devient 1 | en partie : le mode est libre, le manuel est refusé |

Avec le cadrage automatique, VPX recalcule toute la vue borne de la table et en déduit la rotation de la forme de la fenêtre : flippers à droite d'une image paysage, en bas d'une image portrait, sans réglage possible.

#### Sens des tables en partie

VPX dessine dans les coordonnées de Windows : seule compte la forme de la fenêtre du playfield, jamais l'orientation de l'écran.
Ce qui décide du sens (`vpxPlayedFlipperEdge`, `packages/core/src/vpx.ts`, relevé dans `ViewSetup.cpp`, `player.cpp` et `pintable.cpp` de VPX 10.8.1, commit `af26b2d93`) :

| Valeurs lues par VPX (`VPinballX.ini`, sous le `.ini` de la table) | Rotation de la vue | Flippers |
| --- | --- | --- |
| `BGSet = 1`, `CabinetAutofitMode` 1 ou 2 | `SetWindowAutofit` remet la rotation de la table à 0 à chaque partie, `GetRotation` ajoute 270° pour une fenêtre paysage, 0° pour une fenêtre portrait ; `ViewCabRotation` n'y fait rien | à droite (paysage), en bas (portrait) |
| `BGSet = 1`, cadrage manuel (`CabinetAutofitMode` 0, absent : défaut de VPX) | celle de la vue borne réglée dans la table, souvent 270° pour un Windows en paysage | imprévisible : de travers sur un Windows en portrait |
| `BGSet` 0 ou 2 (vue bureau ou FSS) | celle de la vue bureau de la table | en bas |

Une rotation de r degrés met les flippers au bord dont `edgeRotation` vaut r (0 en bas, 90 à gauche, 180 en haut, 270 à droite) : c'est la même convention que la rotation du front-end.
Sans `ScreenWidth`/`ScreenHeight`, VPX cadre quand même, avec sa taille par défaut.

D'où la règle : en vue borne, le cadrage automatique est exigé, pas proposé.
Jusqu'à la 0.1.3-essai.3, `CabinetAutofitMode` n'était écrit que si la clé était vide : un `CabinetAutofitMode = 0` déjà présent (ancien `VPinballX.ini`, réglage changé dans le menu de VPX ou dans « Réglages ») restait, et chaque table reprenait sa propre vue borne, tournée pour un Windows en paysage.
Sur un playfield en portrait dans Windows, flippers en bas, le front-end était droit et la partie de travers.

- **Synchronisation** (`requireAutofit`, `orientationFinding`, `packages/core/src/sync.ts`) : une valeur hors de 1 et 2 est remplacée par 1, avec le constat « cadrage automatique de VPX rétabli » quand elle était écrite ; une borne déjà configurée est corrigée au prochain démarrage, sans refaire l'assistant.
  Après écriture, le sens est recalculé sur le fichier : si VPX ne dessinera pas les flippers du côté du joueur (orientation de Windows à changer, `BGSet` changé à la main, `CabinetAutofitMode` gardé par l'utilisateur dans `vpxManual`), un avertissement le dit, avec les valeurs en cause.
- **Réglages** : le choix « Manuel », et la valeur par défaut de VPX qui en est un, ne sont plus proposés pour `CabinetAutofitMode` dans le réglage général.
- **Médecin** : « Table de travers sur cette borne » (`tableOrientation`) quand le `.ini` d'une table, par `BGSet` ou `CabinetAutofitMode`, empêche VPX de dessiner les flippers du côté du joueur ; il remplace alors « Cadrage manuel imposé par la table ».
  La réparation retire ces clés seulement ; le fichier part à la corbeille s'il ne contient rien d'autre.
  Si `VPinballX.ini` est lui-même en cause, c'est la synchronisation qui le dit.
- **Test** : `packages/core/src/test/orientation.test.ts` parcourt les quatre orientations de Windows, d'un écran paysage et d'un écran natif portrait, les quatre bords des flippers et sept `VPinballX.ini` de départ : la partie est dans le sens du joueur et du front-end, sans avertissement, et une seconde synchronisation ne change plus rien ; écran tourné hors de l'assistant ou retournement refusé : sens juste, ou avertissement.

Pour un joueur à gauche ou en haut, l'assistant tourne lui-même l'écran du playfield, pour la session seulement (voir [Orientation du bureau à la sortie](#orientation-du-bureau-à-la-sortie)).
À l'étape « Où sont les flippers ? », il annonce « Start : retourner l'écran pour VPX » ; Start passe l'écran en orientation retournée (`SessionOrientation.want`, puis `setDisplayOrientation`, `packages/win-displays/src/orientation.ts` : `ChangeDisplaySettingsExW` essayé à blanc, appliqué sans `CDS_UPDATEREGISTRY`, relu, et remis comme avant si Windows a fait autre chose).
L'assistant refait la détection, replace ses fenêtres et recalcule le bord du joueur dans la nouvelle image (gauche ↔ droite, haut ↔ bas) : le joueur voit toujours le texte à l'endroit.
Comme Windows, il demande ensuite de garder cette orientation : sans Start dans les 15 secondes, ou avec Exit, l'écran reprend son orientation d'origine, et Start continue alors sans retourner (tables à l'envers).
Le choix de la rotation est dans `vpxOrientationFix` (`packages/core/src/vpx.ts`) : un retournement, qui garde la définition et la disposition des autres écrans ; un quart de tour seulement pour un Windows en portrait vu de côté.
La synchronisation, elle, ne touche pas à l'orientation : elle signale le problème et renvoie vers l'assistant.
Avec un autre front-end de borne installé ou ouvert (PinUP Popper, PinballX, PinballY), le premier Start ne retourne rien : il avertit que l'orientation est un réglage de Windows que cet autre front-end subit aussi ; Start retourne quand même, Exit garde l'orientation de Windows (voir [Cohabitation avec un autre front-end de borne](cohabitation-avec-un-autre-front-end-de-borne.md#cohabitation-avec-un-autre-front-end-de-borne)).

Le bord enregistré vaut pour l'orientation que Windows avait au moment de l'assistant, gardée avec l'écran (`lastSeen.rotation`).
Si elle change ensuite hors de l'assistant (Paramètres > Affichage, pilote, retour de veille), l'image tourne sous le joueur : `currentFlipperEdge` (`packages/core/src/layout.ts`) fait tourner le bord enregistré de l'écart entre les deux orientations, et c'est ce bord actuel qui sert au cadrage, à l'avertissement « à l'envers » de la synchronisation, à la rotation des fenêtres de Cyber Pinball sur le playfield (`playfieldRotation`) et au bord proposé quand on relance l'assistant.
Sans orientation relevée à l'enregistrement, le bord enregistré est gardé tel quel.

Un modèle enregistré avant cette étape ne reçoit aucune clé de cadrage tant que l'assistant n'a pas été relancé.

#### Orientation du bureau à la sortie

En quittant Cyber Pinball, le bureau et le menu Démarrer de l'écran du playfield restaient à l'envers.
L'assistant tournait l'écran avec `CDS_UPDATEREGISTRY` : le réglage de Windows changeait pour de bon, bureau compris, et rien ne le rendait à la sortie.
Ni le front-end ni VPX ne touchaient l'orientation ; seul l'assistant le faisait (`WINDOWS_CHANGES`, `packages/core/src/coexistence.ts`).

Désormais, Windows garde son orientation, et Cyber Pinball ne tourne l'écran que le temps d'être ouvert (`SessionOrientation`, `packages/core/src/sessionorientation.ts` ; `app/src/display-orientation.ts`) :

- **Orientation de jeu** : l'assistant enregistre dans le modèle l'orientation de Windows dans laquelle il a configuré le playfield, quand il a dû la changer (`playfield.windowsRotation`).
  Chaque démarrage (front-end, assistant, réglages) la redonne à l'écran, avant d'ouvrir les fenêtres, par un changement dynamique : rien n'est écrit dans le réglage de Windows, et un redémarrage du PC rend toujours son orientation au bureau.
- **Origine notée avant d'y toucher** : avant la première rotation, l'orientation d'origine de chaque écran (empreinte, nom GDI, origine, orientation donnée) est écrite dans `<données>\orientation-ecrans.json`, qui survit à un plantage.
  Le fichier disparaît quand plus aucun écran n'est tourné.
- **Toutes les sorties la rendent** : « Quitter Cyber Pinball », fermeture de la dernière fenêtre, mise à jour, borne dédiée (code 77) passent par `will-quit`, avant la sortie de la borne dédiée (`main.ts` importe `display-orientation.ts` en premier), puis par `process.on('exit')` en dernier recours (`app.exit`).
  Une relance (front-end ↔ assistant, langue, configuration, Shell Launcher) passe la main (`handOverOrientation`) : le processus suivant reprend le fichier, sans que l'écran tourne entre les deux.
- **Plantage, arrêt forcé** : le fichier reste ; au lancement suivant, un écran encore dans l'orientation donnée par Cyber Pinball (ou revenu à son origine après un redémarrage) garde son origine notée ; un écran tourné entre-temps par l'utilisateur garde la sienne, qui devient l'origine.
  Extinction, redémarrage et veille du module d'alimentation : rien n'étant écrit dans le réglage de Windows, l'écran repart dans le sien ; au réveil d'une veille, si Windows a remis son réglage (écrans réénumérés), la session reprend l'orientation de jeu (`check`, sur `display-added`, `display-metrics-changed` et `resume`).
- **Mode bureau** : « Bureau Windows » rend l'orientation de Windows (`suspend`), le retour reprend celle de jeu (`resume`) ; après un quart de tour, le front-end se relance pour replacer ses fenêtres.
  Cette relance, comme celles de la langue, du type de DMD ou d'une configuration, reprend la place du front-end (`packages/core/src/menu-resume.ts`, argument `--reprendre-menu=`) : la table sélectionnée sur la roue, et la rubrique du menu système ouverte, la sélection sur l'entrée choisie, sans la relancer.
  « Redémarrer Cyber Pinball » repart de zéro, ouverture comprise.
  Une rubrique inconnue, le mode invité ou des écrans du premier démarrage (conditions, profil) laissent le front-end sur la roue.
- **Avertissement** : une orientation que Windows refuse de rendre est notée dans le journal (« Orientation : … n'a pas repris son orientation d'origine (0°) : … Paramètres > Affichage > Orientation de l'écran la rétablit. ») et dans le fichier ; le démarrage suivant réessaie et la redit en bandeau (« À la dernière fermeture de Cyber Pinball : … »).
- **Bornes configurées par une version plus ancienne** (`legacyOrientation`) : modèle sans `windowsRotation`, orientation enregistrée (`lastSeen.rotation`) différente de 0° et telle que l'assistant l'aurait choisie en partant de 0° (`vpxOrientationFix`).
  Si Windows l'a perdue (redémarrage), le front-end note l'orientation de jeu et la reprend sans question.
  S'il la garde encore, le front-end le propose : « Bureau Windows tourné par Cyber Pinball » ; Start rend 0° au réglage de Windows (seule écriture de ce réglage, `giveBack`) puis remet l'orientation de jeu pour la session, l'écran clignote deux fois ; Exit garde l'orientation du bureau telle qu'elle est.
  Dans les deux cas, la question ne revient pas.
  Mode invité : Start n'y fait rien (`message.orientation`).

Écrans simulés (`CYBERPINBALL_DISPLAYS`, essai sans opérateur, hors écran) : la rotation va dans `<données>\ecrans-simules-orientation.json` (`windows` : le réglage ; `session` : le changement dynamique, perdu au redémarrage), que `observedDisplays` applique aux écrans ; aucun vrai écran ne tourne.
Preuves : `packages/core/src/test/sortie-orientation.test.ts` (chaque chemin de sortie sur les quatre jeux de `packages\core\ecrans-simules`, avec un Windows simulé qui compte les écritures de son réglage ; reprise après plantage, refus de Windows, réparation).

#### Sens des tables, vérifié

Une table pouvait s'afficher à l'envers après chaque redémarrage ou reconnexion de la session (vu sur un PinCab : playfield 4K couché, joueur au bord gauche de l'image, Windows retourné par l'assistant) : Windows avait rendu son réglage à l'écran du playfield.
Le front-end, qui suit l'orientation actuelle (`currentFlipperEdge`), restait droit ; VPX, qui ne regarde que la forme de la fenêtre, dessinait la table à l'envers, et il fallait la retourner dans le menu de VPX à chaque démarrage.
La session redonne désormais l'orientation de jeu au démarrage, au réveil et à la reconnexion (section précédente) ; ce qui suit le vérifie et le montre.

- **Santé de la borne** (`orientationFacts`, `orientationVerdict`, `packages/core/src/gameorientation.ts`) : sous « Écrans », après la configuration reconnue, « Tables dans votre sens, flippers … » avec l'orientation de Windows, ou, bloquante, « Tables à l'envers : VPX les dessinera flippers …, vous êtes … », avec la cause : l'orientation de jeu que Windows n'a pas reprise, ou, sans orientation à reprendre, « relancez « Orientation et taille du playfield » ».
- **Journal** : les avertissements de la synchronisation vont aussi dans la console (« Synchronisation : … »), dont « Les tables s'afficheront à l'envers ».
- **Correction faite dans le menu de VPX** : pour remettre une table dans son sens, il fallait passer en cadrage manuel et tourner la vue, ce que VPX enregistre dans le `.ini` de la table (`CabinetAutofitMode = 0`, `ViewCabMode`, `ViewCabRotation`).
  Cyber Pinball ne l'écrase pas.
  Quand le `.ini` donne la vue et sa rotation, son sens est connu (`manualCabRotation`, `packages/core/src/vpx.ts`, d'après `ViewSetup::GetRotation` : en mode « Window », la rotation s'ajoute à 270° pour une fenêtre paysage, à 0° pour une fenêtre portrait ; en « Legacy » ou « Camera », elle vaut seule) : le médecin ne signale pas « Table de travers » une table dans le sens du joueur, et dit où VPX dessinera les autres.
  Une correction faite pendant que Windows avait perdu l'orientation de jeu met la table à l'envers une fois l'orientation reprise : le médecin la signale, et sa réparation retire `BGSet` et `CabinetAutofitMode` du `.ini` de la table (la rotation qui reste est ignorée par le cadrage automatique).
- **Test** : `packages/core/src/test/gameorientation.test.ts` fixe l'invariant sur un écran paysage et un écran natif portrait, pour les quatre orientations de Windows et les quatre bords du joueur : assistant, sortie, redémarrage simulé (Windows rend son réglage), démarrage de la session, puis reconnexion (`check`) ; à chaque fois, VPX dessine la partie du côté du joueur, le front-end aussi, sans avertissement, et rien n'est écrit dans le réglage de Windows.
  Une borne configurée par une version plus ancienne et revenue à 0° retrouve son sens (`legacyOrientation`).

### Cadrage d'une table, en partie

Le cadrage d'une table se juge sur la table lancée, pas sur une liste de valeurs.
Fiche d'une table > « Régler l'affichage en partie » lance la table avec `-PovEdit` au lieu de `-Play` (VPX 10.8.1, `AppCommands.cpp`) : la même partie, le menu de VPX ouvert d'emblée sur « Point Of View ».
L'écran « Ajuster la vue » de la fiche, qui choisissait ces valeurs hors partie puis les essayait, est retiré, avec son essai par `-TableIni`.

Avec le cadrage automatique, VPX recalcule la vue borne après avoir lu les surcharges de la table : les clés `[TableOverride] ViewCab*` ne servent qu'en cadrage manuel.
La page « Point Of View » ne propose donc que ce que le cadrage relit (d'après le code de VPX 10.8.1) :

| Mode (`[Player] CabinetAutofitMode`) | Réglages de la page | Effet |
| --- | --- | --- |
| « Fit Table » (1) | le mode et `CabinetAutofitPos` (0 à 20 %) | position des flippers du bas sur l'écran ; plus haut, le tablier remonte dans l'écran, au prix du haut de la table |
| « Fit Screen » (2) | le mode seul | toute la longueur de la table, étirée ou tassée |
| manuel (0) | décalages, échelles, vitre, rotation, puis `ScreenPlayerX/Y/Z` | vue réglée à la main, que le médecin signale quand une table l'impose |

- **Enregistrer** (Start) > « Save as Table Override » : dans le `.ini` de la table.
  Au retour, la fiche dit « Affichage enregistré pour cette table » si ce fichier a changé.
- **Hors partie**, ces clés ne se modifient plus pour une table : dans « Réglages de cette table », elles ont le badge « En partie » et seule leur valeur propre à la table peut être retirée (`isLiveVisual`, `packages/core/src/vpx-settings.ts`) ; les essentiels de la table ne les montrent plus.
- **Médecin** : « Cadrage manuel imposé par la table » quand le `.ini` de la table (souvent livré avec elle, réglé pour l'écran de son auteur) contient `CabinetAutofitMode = 0` ; la réparation retire la clé, l'ancien fichier part à la corbeille.
