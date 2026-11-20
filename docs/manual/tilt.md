[Français](../manuel/tilt.md) · English · [Manual contents](../manual.md)

## Tilt

What makes the cabinet tilt is decided at the wizard's "Tilt" step ([app/src/tilt-step.ts](../../app/src/tilt-step.ts), [packages/core/src/tilt.ts](../../packages/core/src/tilt.ts)).
It follows the "Lanceur" (Plunger) step in the full wizard, which skips it without writing anything on a cabinet with no accelerometer set and no Pinscape plugged in (or whose accelerometer was turned off), no captured tilt bob and no saved tilt (VPX then keeps its simulated tilt bob); on its own: system menu > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration) > "Tilt" (`npm run assistant -- --tilt`, `tilt` action of the launcher).

**What VPX does with it** (VPX 10.8.1, commit `af26b2d93`):

- the **Tilt** action (`[Input] Mapping.Tilt`, T by default) reaches the table script as the `MechanicalTilt` key, which PinMAME scripts call `keyBangBack` (`scripts/VPMKeys.vbs`): `vpmKeyDown` calls `vpmNudge.DoMechTilt` (`WPC.vbs`, `s11.vbs`, `sega.vbs`…), which pulses the machine's tilt bob switch (`vpmNudge.TiltSwitch`, `core.vbs`).
  The ROM counts its warnings, then tilts, like the real machine;
- the **simulated tilt bob** (`physics/cabinet/PlumbHandler.cpp`) is a 10 cm pendulum driven by the cabinet's acceleration: the one VPX derives from the accelerometer's nudges (`GamepadNudge.cpp`: nudge intent, then a 113 kg cabinet on its legs) and from the nudge buttons.
  When it touches its ring, it presses the Tilt action itself.
  `[Player]` settings (`Settings_properties.inl`): `SimulatedPlumb` (1 by default), `PlumbThresholdAngle` (contact angle in degrees, 0.15 to 4, 1 by default; smaller, easier tilt), `PlumbDamping` (0 to 2, 1).
  A table's `.ini` can override them for that table (`PhysicsEngine.cpp` reads the table's settings);
- the **SlamTilt** action (`Mapping.SlamTilt`, Home by default) reaches the script as `keySlamDoorHit`: the machine's slam tilt switch (`swSlamTilt`, 21 on a WPC) stays closed while the button is held, and the ROM ends the game for every player.

The Pinscape guide (mjrnet, "Nudge & Tilt") wires a real tilt bob like a button, on a KL25Z input set as a joystick button (or the T key); with it, the simulated tilt bob is redundant: two tilt bobs, a single bump would count twice.

**The four cases, and what Cyber Pinball writes**:

| Cabinet | "Boutons" (Buttons) step | "Tilt" step | `VPinballX.ini` |
| --- | --- | --- | --- |
| Wired tilt bob (Pinscape or encoder) | "Balancier de tilt" (Tilt bob) captured (joystick button or T) | "Balancier de la borne" (Cabinet tilt bob) | `[Input] Mapping.Tilt = SDLJoy_…;9 \| Key;23`, `[Player] SimulatedPlumb = 0` |
| Accelerometer only | "Balancier de tilt" skipped (Exit) | "Balancier simulé par VPX" (Tilt bob simulated by VPX), contact angle | `[Player] SimulatedPlumb = 1`, `PlumbThresholdAngle = 0.5` (for example) |
| Coin door slam tilt | "Slam tilt" captured | no effect | `[Input] Mapping.SlamTilt = SDLJoy_…;11 \| Key;74` |
| Neither a tilt bob nor simulation | "Balancier de tilt" skipped | "Pas de tilt" (No tilt) | `[Player] SimulatedPlumb = 0`; a keyboard's T key stays the tilt |

**Capturing the tilt bob** ("Boutons" step): the optional "Balancier de tilt" (Tilt bob) button asks "Faites toucher l'anneau au balancier" (Make the tilt bob touch its ring) and recalls what it is (the pendulum against its ring, wired to a Pinscape or encoder input).
It is captured like the others, from the joystick as from the keyboard (`recordButton`).
A contact bounces, and a swinging tilt bob touches its ring again: the key just captured no longer counts for the next button for 1 s (`BOUNCE_MS`, `wizard.ts`), except after Exit skips a button (it is pressed several times in a row).
"Slam tilt" comes next, optional too.

**The "Tilt" step**:

- **Proposal**: a captured tilt bob wins ("Balancier de la borne", simulated tilt bob off); without one, what VPX does today ("Réglage actuel de VPX : balancier simulé par VPX, contact à 1,00°", Current VPX setting: tilt bob simulated by VPX, contact at 1.00°).
  A cabinet whose step is done opens on its setting.
  "Tilt" line: Start (or a click) switches modes: "Balancier de la borne" and "Balancier simulé par VPX" with a captured tilt bob, otherwise "Balancier simulé par VPX" and "Pas de tilt".
- **Accelerometer**: the "Accéléromètre" (Accelerometer) line chooses the board whose accelerometer shakes the table when the cabinet is nudged, regardless of the plunger (button plunger, or plunger wired to another board than the KL25Z).
  Proposed by default: the one set at the "Lanceur" step, otherwise the first Pinscape read (axes X and Y, strength ×2), as long as it has not been turned off (`proposedNudge`, [plunger.ts](../../packages/core/src/plunger.ts)).
  The value gives the axes and the board ("Axes X et Y · mjrnet Pinscape Controller", Axes X and Y · mjrnet Pinscape Controller).
  Start (or a click) moves to the next board among those with at least two axes, Pinscapes first, then to "Aucun" (None), which holds: the Pinscape is no longer proposed, neither here nor at the "Lanceur" step.
  The board you started with keeps its axes, strength and directions; another one takes X and Y.
  The chosen accelerometer is saved with the tilt (`[Input] Mapping.Nudge0.X` and `.Y`); when the step is redone on its own, its other keys (`NudgeSensorCount`, `Mapping.Nudge0.Type`) follow at the next synchronization of the front-end, like any key outside the step.
- **Contact angle** (simulated tilt bob): Start, then the flippers, in 0.05° steps, from 0.15° to 4°; Start to finish.
  Smaller, easier tilt: 4° is the hardest.
- **Nudge strength** (with an accelerometer): the scale of the accelerometer's X and Y axes (`[Input] Mapping.Nudge0.X` and `.Y`, `NUDGE_GAIN` in [plunger.ts](../../packages/core/src/plunger.ts)), from ×0.50 to ×6, in 0.25 steps; Start, then the flippers.
  VPX reads the accelerometer like a gamepad stick (`Mapping.Nudge0.Type = 0`, its own default layout for a Pinscape, `SDLInputHandler.h`): a value of 1 is worth g/2 m/s² (`GamepadNudge.cpp`), and any nudge under 1 m/s² is ignored (`NudgeIntentHandler.cpp`).
  But a Pinscape set to "1G" (its default setting) sends the acceleration in g, full scale at 1 g (`rawToReport`, the firmware's `main.cpp`): at scale 1, VPX ignores everything under 0.2 g and only sees half of the rest.
  On the real cabinet, the ball barely moved and the simulated tilt bob never tilted, even at 4° (the hardest angle).
  At ×2, 1 g measured is 1 g in VPX: that is the strength proposed for a Pinscape ("Lanceur" step and "Tilt" step).
  Under the ring, the test shows the strongest nudge read in the last 3 seconds, as a percentage of the scale, and the threshold under which VPX ignores it (`nudgeFloor`: 20 % at ×1, 10 % at ×2); the tilt bob simulation follows the chosen strength.
  A strength set in VPX's menu (an axis scale, a reversed direction) is taken over as is.
  An accelerometer left at strength ×1 is reported at each synchronization ("Secousses : accéléromètre lu à la force ×1,00…", Nudging: accelerometer read at strength ×1.00…).
- **Test**: the contact ring seen from above.
  With the simulated tilt bob, the dot follows the tilt bob computed as VPX will compute it, one millisecond at a time, from the accelerometer axes read by VPX's SDL library (same axis shaping, same `Mapping.Nudge0.Strength`, same damping): each contact lights the ring, "TILT" under it, and counts as a Tilt press (the tilt bob bounces on the ring: a hard nudge often makes several, as in VPX); the footer gives the share of the contact reached and the nudge in g.
  With the cabinet tilt bob, the ring lights at each real contact ("Contacts du balancier : n", Tilt bob contacts: n).
  Without an accelerometer ("Aucun", or no board with two axes), the step says so: only the nudge buttons will move the simulated tilt bob, and the test does not show it.
- **Keys**: `[Player] SimulatedPlumb` and `PlumbThresholdAngle` (`vpxTiltSettings`, `isTiltKey`), only after the step (smooth migration: without it, `[Player]` stays as it is).
  Damping is left to VPX (F12 > "Nudge Settings").
  Like the other managed keys, an angle changed later in a game is reported, kept or reset as you choose.

**Inconsistent settings reported** (`tiltFindings`, at each synchronization: result of the wizard and its steps, `sync` action): tilt bob captured, "Tilt" step never done and simulated tilt bob on (two tilt bobs); "Balancier de la borne" chosen without a captured button; simulated tilt bob without an accelerometer or nudge button; simulated tilt bob chosen but turned off by hand in `VPinballX.ini`.

**Table still on screen**: `[Player] NudgeStrength = 0`, at each synchronization, whether or not the "Tilt" step is done (`VPX_STILL_TABLE`, [tilt.ts](../../packages/core/src/tilt.ts)).
This VPX setting ("Visual Nudge Strength", from 0 to 2, 1 by default) only shifts the playfield image by as much as the simulated cabinet moves (`Renderer.cpp`: screen offset, or table translation without the static prerender).
The ball, the simulated tilt bob and the script do not depend on it.
On a cabinet, the real cabinet is what moves: the table stays still on screen and only the ball reacts to nudges (test on a real cabinet).
A managed key like the others: set back by hand in VPX, it is reported instead of being overwritten.
A table's `.ini` can still override it for that table.

**"Pendant une partie" (During a game) reminder**: a single "Tilt" line (the reminder already fills the screen): the tilt bob's key or button, "secousse trop forte" (nudging too hard) when the simulated tilt bob is chosen, and "slam tilt" with its key if it has one (`gameKeys`).
