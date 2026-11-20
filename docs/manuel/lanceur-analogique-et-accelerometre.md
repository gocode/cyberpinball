[English](../manual/analog-plunger-and-accelerometer.md) · Français · [Sommaire du manuel](../manuel.md)

## Lanceur analogique et accéléromètre

Un **lanceur analogique** (plunger à potentiomètre ou à capteur, lu par un Pinscape sur KL25Z ou par un autre contrôleur en mode joystick) n'est pas un bouton : c'est un **axe** de joystick, dont la valeur suit la course du lanceur.
L'étape « Lanceur » de l'assistant l'affecte et le règle, avec l'accéléromètre du Pinscape pour les tremblements ([app/src/plunger-step.ts](../../app/src/plunger-step.ts), [packages/core/src/plunger.ts](../../packages/core/src/plunger.ts)).
Elle suit les boutons du jeu dans l'assistant complet ; seule : menu système > « Ma borne » > « Configuration de la borne » > « Boutons » > « Lanceur analogique » (`npm run assistant -- --lanceur`, action `plunger` du lanceur).

- **Détection** : « Tirez le lanceur à fond, puis lâchez-le ».
  Cyber Pinball lit tous les axes de tous les joysticks par la bibliothèque SDL de VPX (les mêmes numéros que VPX) ; l'axe qui a le plus bougé, et qui est revenu au repos, devient le lanceur, avec son sens (tirer fait monter ou baisser la valeur).
  Les premières lectures d'un joystick tout juste ouvert ne comptent pas, et un axe qui a sauté sans revenir (gâchette d'une manette) cède la place au lanceur.
  Une jauge montre pendant ce temps l'axe qui bouge.
- **Réglage proposé** : zone morte juste au-dessus du bruit mesuré au repos ; sur un Pinscape à six axes (« X/Y/Z + RX/RY/RZ » dans son outil de configuration) dont le lanceur est sur Z, la **vitesse mesurée par la carte** sur RZ, plus juste que celle que VPX calcule ; l'**accéléromètre** sur X et Y du premier Pinscape lu, que le lanceur soit sur ce Pinscape ou sur une autre carte (un encodeur de boutons, par exemple).
  Un accéléromètre déjà réglé, ou éteint, reste tel quel quand on refait la détection : il ne dépend pas du lanceur.
- **Essai** : la jauge montre la position telle que VPX la calculera (zone morte, sens), de l'avant au tiré à fond, avec le plus grand recul ; chaque tir (lanceur lâché) affiche sa force.
  Lignes : capteur (refaire la détection), sens, zone morte (de 0 à 30 %, aux flippers), vitesse, accéléromètre (« Oui, axes X et Y », ou « Axes X et Y · » suivi du nom de la carte quand elle n'est pas celle du lanceur ; Start l'allume ou l'éteint) ; puis « Enregistrer » (« Continuer » dans l'assistant complet) ou « Pas de lanceur analogique ».
  Tout se fait aussi à la souris.
- **Pas de lanceur analogique** : ce choix ne retire que le lanceur ; l'accéléromètre réglé reste, et VPX lit toujours les secousses (`NudgeSensorCount` à 1) : une borne au lanceur à bouton peut avoir son accéléromètre sur un KL25Z.
  Sans lanceur analogique, l'accéléromètre se choisit à l'étape « Tilt » (voir [Tilt](tilt.md#tilt)).
- **Repos loin de 0** : VPX n'a pas de décalage, le lanceur lui paraîtrait tiré en permanence.
  L'étape le signale : le repos se règle sur la carte (calibration du Pinscape).
- **Déjà réglé** : une borne dont l'étape a été faite s'ouvre sur son réglage ; sinon, un lanceur déjà affecté dans VPX (son menu, ou sa disposition du Pinscape acceptée) est repris tel quel (« Réglage trouvé dans VPX »).
  Dans l'assistant complet, une borne sans aucun joystick à axes ni réglage connu passe l'étape sans rien écrire.

Clés écrites (`vpxAnalogSettings`, format relevé dans `PlungerHandler.cpp`, `PhysicsSensor.cpp`, `NudgeHandler.cpp` et `GamepadNudge.cpp` au commit `af26b2d93`) ; une valeur de capteur s'écrit `<joystick>;<axe>;<P|V|A>;<zone morte>;<échelle>;<limite>`, l'axe numéroté comme VPX (0x200 plus l'axe SDL : Z vaut 514), une échelle négative inversant l'axe :

| Clé `[Input]` | Valeur |
| --- | --- |
| `PlungerSensorCount` | 1, ou 0 sans lanceur analogique |
| `Mapping.Plunger0.Position` | `SDLJoy_…_1;514;P;0.020000;1.000000;1.000000` |
| `Mapping.Plunger0.Velocity` | `SDLJoy_…_1;517;V;0.000000;12.500000;1.000000` (vitesse du Pinscape), sinon vide |
| `NudgeSensorCount` | 1, ou 0 sans accéléromètre |
| `Mapping.Nudge0.Type`, `X`, `Y` | 0 (manette), `SDLJoy_…_1;512;A;0.000000;2.000000;1.000000`, `SDLJoy_…_1;513;A;…` (l'échelle est la force des secousses : ×2 proposé pour un Pinscape, voir [Tilt](tilt.md#tilt)) |
| `Device.<joystick>.NoAutoLayout` | 1 pour chaque joystick dont Cyber Pinball écrit les boutons ou les capteurs |

- **Disposition par défaut de VPX coupée** : VPX reconnaît un Pinscape à six axes et propose en partie d'appliquer sa disposition (lanceur sur Z, accéléromètre sur X et Y).
  Accepter efface d'abord tout ce qui vient de ce joystick (`ApplyDefaultDeviceMapping`, `ClearDeviceMappings`), y compris les boutons relevés par Cyber Pinball.
  `NoAutoLayout` coupe cette proposition pour les joysticks de la borne ; un Pinscape réglé en « X/Y/Z » seulement (trois axes) n'était de toute façon pas reconnu par VPX, et son lanceur ne marchait qu'une fois affecté à la main.
- Ces clés appartiennent à l'étape « Lanceur » (`isAnalogKey`) et plus à l'étape « Boutons » ; `NoAutoLayout` est aux deux.
  Comme les autres clés gérées, un réglage changé ensuite dans le menu de VPX (zone morte, par exemple) est signalé, gardé ou remis au choix.
- Le bouton « Lanceur » (`Mapping.LaunchBall`) reste : il sert aux tables à lanceur automatique, et le Pinscape peut l'envoyer quand on pousse le lanceur vers l'avant (« ZB Launch Ball », réglé sur la carte).
