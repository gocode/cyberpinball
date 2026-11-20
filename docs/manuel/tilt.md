[English](../manual/tilt.md) · Français · [Sommaire du manuel](../manuel.md)

## Tilt

Ce qui fait tilter la borne se décide à l'étape « Tilt » de l'assistant ([app/src/tilt-step.ts](../../app/src/tilt-step.ts), [packages/core/src/tilt.ts](../../packages/core/src/tilt.ts)).
Elle suit l'étape « Lanceur » dans l'assistant complet, qui la passe sans rien écrire sur une borne sans accéléromètre réglé ni Pinscape branché (ou dont l'accéléromètre a été éteint), sans balancier relevé ni tilt enregistré (VPX garde alors son balancier simulé) ; seule : menu système > « Borne » > « Configuration de la borne » > « Tilt » (`npm run assistant -- --tilt`, action `tilt` du lanceur).

**Ce que VPX en fait** (VPX 10.8.1, commit `af26b2d93`) :

- l'action **Tilt** (`[Input] Mapping.Tilt`, T par défaut) arrive au script de la table comme la touche `MechanicalTilt`, que les scripts de PinMAME appellent `keyBangBack` (`scripts/VPMKeys.vbs`) : `vpmKeyDown` appelle `vpmNudge.DoMechTilt` (`WPC.vbs`, `s11.vbs`, `sega.vbs`…), qui donne une impulsion sur l'interrupteur du balancier de la machine (`vpmNudge.TiltSwitch`, `core.vbs`).
  La ROM compte ses avertissements puis tilte, comme la vraie machine ;
- le **balancier simulé** (`physics/cabinet/PlumbHandler.cpp`) est un pendule de 10 cm mû par l'accélération de la caisse : celle que VPX déduit des secousses de l'accéléromètre (`GamepadNudge.cpp` : intention de secousse, puis caisse de 113 kg sur ses pieds) et des boutons de tremblement.
  Quand il touche son anneau, il appuie lui-même sur l'action Tilt.
  Réglages `[Player]` (`Settings_properties.inl`) : `SimulatedPlumb` (1 par défaut), `PlumbThresholdAngle` (angle du contact en degrés, de 0,15 à 4, 1 par défaut ; plus petit, tilt plus facile), `PlumbDamping` (amortissement, 0 à 2, 1).
  Le `.ini` d'une table peut les remplacer pour elle (`PhysicsEngine.cpp` lit les réglages de la table) ;
- l'action **SlamTilt** (`Mapping.SlamTilt`, Origine par défaut) arrive au script comme `keySlamDoorHit` : l'interrupteur slam tilt de la machine (`swSlamTilt`, 21 sur une WPC) reste fermé tant que le bouton est appuyé, et la ROM arrête la partie de tous les joueurs.

Le guide du Pinscape (mjrnet, « Nudge & Tilt ») câble un vrai balancier comme un bouton, sur une entrée du KL25Z réglée en bouton de joystick (ou en touche T) ; avec lui, le balancier simulé est en trop : deux balanciers, un même coup compterait deux fois.

**Les quatre cas, et ce que Cyber Pinball écrit** :

| Borne | Étape « Boutons » | Étape « Tilt » | `VPinballX.ini` |
| --- | --- | --- | --- |
| Balancier câblé (Pinscape ou encodeur) | « Balancier de tilt » relevé (bouton de joystick ou T) | « Balancier de la borne » | `[Input] Mapping.Tilt = SDLJoy_…;9 \| Key;23`, `[Player] SimulatedPlumb = 0` |
| Accéléromètre seul | « Balancier de tilt » passé (Exit) | « Balancier simulé par VPX », angle du contact | `[Player] SimulatedPlumb = 1`, `PlumbThresholdAngle = 0.5` (par exemple) |
| Slam tilt de la porte | « Slam tilt » relevé | sans effet | `[Input] Mapping.SlamTilt = SDLJoy_…;11 \| Key;74` |
| Ni balancier ni simulation | « Balancier de tilt » passé | « Pas de tilt » | `[Player] SimulatedPlumb = 0` ; la touche T d'un clavier reste le tilt |

**Relevé du balancier** (étape « Boutons ») : le bouton facultatif « Balancier de tilt » demande « Faites toucher l'anneau au balancier » et rappelle ce qu'il est (le pendule contre son anneau, câblé sur une entrée du Pinscape ou de l'encodeur).
Il se relève comme les autres, au joystick comme au clavier (`recordButton`).
Un contact rebondit, et un balancier qui oscille retouche son anneau : la touche tout juste relevée ne compte plus pendant 1 s pour le bouton suivant (`BOUNCE_MS`, `wizard.ts`), sauf après Exit qui passe un bouton (on le presse plusieurs fois de suite).
Le « Slam tilt » suit, facultatif lui aussi.

**L'étape « Tilt »** :

- **Proposition** : un balancier relevé l'emporte (« Balancier de la borne », balancier simulé éteint) ; sans lui, ce que VPX fait aujourd'hui (« Réglage actuel de VPX : balancier simulé par VPX, contact à 1,00° »).
  Une borne dont l'étape est faite s'ouvre sur son réglage.
  Ligne « Tilt » : Start (ou clic) passe d'un mode à l'autre : « Balancier de la borne » et « Balancier simulé par VPX » avec un balancier relevé, sinon « Balancier simulé par VPX » et « Pas de tilt ».
- **Accéléromètre** : la ligne « Accéléromètre » choisit la carte dont l'accéléromètre fait trembler la table quand on bouscule la borne, sans lien avec le lanceur (lanceur à bouton, ou lanceur branché sur une autre carte que le KL25Z).
  Proposé d'office : celui réglé à l'étape « Lanceur », sinon le premier Pinscape lu (axes X et Y, force ×2), tant qu'il n'a pas été éteint (`proposedNudge`, [plunger.ts](../../packages/core/src/plunger.ts)).
  La valeur dit les axes et la carte (« Axes X et Y · mjrnet Pinscape Controller »).
  Start (ou clic) passe à la carte suivante parmi celles qui ont au moins deux axes, les Pinscape d'abord, puis à « Aucun », qui tient : le Pinscape n'est plus proposé, ni ici ni à l'étape « Lanceur ».
  La carte d'arrivée garde ses axes, sa force et ses sens ; une autre prend X et Y.
  L'accéléromètre choisi est enregistré avec le tilt (`[Input] Mapping.Nudge0.X` et `.Y`) ; quand l'étape est refaite seule, ses autres clés (`NudgeSensorCount`, `Mapping.Nudge0.Type`) suivent à la synchronisation suivante du front-end, comme toute clé hors de l'étape.
- **Angle du contact** (balancier simulé) : Start puis flippers, par pas de 0,05°, de 0,15° à 4° ; Start pour finir.
  Plus petit, tilt plus facile : 4° est le plus dur.
- **Force des secousses** (avec un accéléromètre) : l'échelle des axes X et Y de l'accéléromètre (`[Input] Mapping.Nudge0.X` et `.Y`, `NUDGE_GAIN` dans [plunger.ts](../../packages/core/src/plunger.ts)), de ×0,50 à ×6, par pas de 0,25 ; Start puis flippers.
  VPX lit l'accéléromètre comme un stick de manette (`Mapping.Nudge0.Type = 0`, sa propre disposition par défaut pour un Pinscape, `SDLInputHandler.h`) : une valeur de 1 vaut g/2 m/s² (`GamepadNudge.cpp`), et toute secousse sous 1 m/s² est ignorée (`NudgeIntentHandler.cpp`).
  Or un Pinscape réglé en « 1G » (son réglage par défaut) envoie l'accélération en g, pleine échelle à 1 g (`rawToReport`, `main.cpp` du firmware) : à l'échelle 1, VPX ignore tout ce qui reste sous 0,2 g et ne voit que la moitié du reste.
  Sur la vraie borne, la bille bougeait à peine et le balancier simulé ne tiltait jamais, même à 4° (l'angle le plus dur).
  À ×2, 1 g mesuré vaut 1 g dans VPX : c'est la force proposée pour un Pinscape (étape « Lanceur » et étape « Tilt »).
  Sous l'anneau, l'essai dit la plus forte secousse lue ces 3 dernières secondes, en pour cent de l'échelle, et le seuil sous lequel VPX l'ignore (`nudgeFloor` : 20 % à ×1, 10 % à ×2) ; la simulation du balancier suit la force choisie.
  Une force réglée dans le menu de VPX (échelle d'un axe, sens inversé) est reprise telle quelle.
  Un accéléromètre resté à la force ×1 est signalé à chaque synchronisation (« Secousses : accéléromètre lu à la force ×1,00… »).
- **Essai** : l'anneau du contact vu de dessus.
  En balancier simulé, le point suit le balancier calculé comme VPX le calculera, pas à pas d'une milliseconde, d'après les axes de l'accéléromètre lus par la bibliothèque SDL de VPX (même mise en forme des axes, même `Mapping.Nudge0.Strength`, même amortissement) : chaque contact allume l'anneau, « TILT » dessous, et compte comme un appui sur Tilt (le balancier rebondit sur l'anneau : une secousse franche en fait souvent plusieurs, comme dans VPX) ; le pied d'écran dit la part du contact atteinte et la secousse en g.
  Avec le balancier de la borne, l'anneau s'allume à chaque contact réel (« Contacts du balancier : n »).
  Sans accéléromètre (« Aucun », ou aucune carte à deux axes), l'étape le dit : seuls les boutons de tremblement feront bouger le balancier simulé, et l'essai ne le montre pas.
- **Clés** : `[Player] SimulatedPlumb` et `PlumbThresholdAngle` (`vpxTiltSettings`, `isTiltKey`), seulement après l'étape (migration douce : sans elle, `[Player]` reste tel quel).
  L'amortissement reste à VPX (F12 > « Nudge Settings »).
  Comme les autres clés gérées, un angle changé ensuite en partie est signalé, gardé ou remis au choix.

**Réglages incohérents signalés** (`tiltFindings`, à chaque synchronisation : résultat de l'assistant et de ses étapes, action `sync`) : balancier relevé, étape « Tilt » jamais faite et balancier simulé allumé (deux balanciers) ; « Balancier de la borne » choisi sans bouton relevé ; balancier simulé sans accéléromètre ni bouton de tremblement ; balancier simulé choisi mais éteint à la main dans `VPinballX.ini`.

**Table immobile à l'écran** : `[Player] NudgeStrength = 0`, à chaque synchronisation, étape « Tilt » faite ou non (`VPX_STILL_TABLE`, [tilt.ts](../../packages/core/src/tilt.ts)).
Ce réglage de VPX (« Visual Nudge Strength », de 0 à 2, 1 par défaut) ne fait que décaler l'image du plateau d'autant que la caisse simulée bouge (`Renderer.cpp` : décalage de l'écran, ou translation de la table sans pré-rendu statique).
La bille, le balancier simulé et le script n'en dépendent pas.
Sur une borne, c'est la vraie caisse qui bouge : la table reste immobile à l'écran et seule la bille réagit aux secousses (essai sur une vraie borne).
Clé gérée comme les autres : remise à la main dans VPX, elle est signalée au lieu d'être écrasée.
Le `.ini` d'une table peut encore la remplacer pour cette table.

**Aide-mémoire « Pendant une partie »** : une seule ligne « Tilt » (l'aide-mémoire remplit déjà l'écran) : la touche ou le bouton du balancier, « secousse trop forte » quand le balancier simulé est choisi, et « slam tilt » avec sa touche s'il en a une (`gameKeys`).
