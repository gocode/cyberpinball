[Français](../manuel/lanceur-analogique-et-accelerometre.md) · English · [Manual contents](../manual.md)

## Analog plunger and accelerometer

An **analog plunger** (potentiometer or sensor plunger, read by a Pinscape on KL25Z or another controller in joystick mode) is not a button: it is a joystick **axis**, whose value follows the plunger's travel.
The wizard's "Lanceur" (Plunger) step assigns and sets it, along with the Pinscape's accelerometer for nudging ([app/src/plunger-step.ts](../../app/src/plunger-step.ts), [packages/core/src/plunger.ts](../../packages/core/src/plunger.ts)).
It follows the game buttons in the full wizard; on its own: system menu > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration) > "Lanceur analogique" (Analog plunger) (`npm run assistant -- --lanceur`, `plunger` action of the launcher).

- **Detection**: "Tirez le lanceur à fond, puis lâchez-le" (Pull the plunger all the way, then let go).
  Cyber Pinball reads every axis of every joystick through VPX's SDL library (the same numbers as VPX); the axis that moved the most, and came back to rest, becomes the plunger, with its direction (pulling raises or lowers the value).
  The first readings of a freshly opened joystick don't count, and an axis that jumped without coming back (a gamepad trigger) gives way to the plunger.
  Meanwhile a gauge shows the axis that is moving.
- **Proposed setting**: a dead zone just above the noise measured at rest; on a six-axis Pinscape ("X/Y/Z + RX/RY/RZ" in its config tool) whose plunger is on Z, the **speed measured by the board** on RZ, more accurate than the one VPX computes; the **accelerometer** on X and Y of the first Pinscape read, whether the plunger is on that Pinscape or on another board (a button encoder, for example).
  An accelerometer already set, or turned off, stays as it is when the detection is redone: it does not depend on the plunger.
- **Test**: the gauge shows the position as VPX will compute it (dead zone, direction), from forward to fully pulled, with the furthest pull; each shot (plunger released) shows its strength.
  Lines: sensor (detect again), direction, dead zone (0 to 30 %, with the flippers), speed, accelerometer ("Oui, axes X et Y" (Yes, axes X and Y), or "Axes X et Y · " (Axes X and Y · ) followed by the board's name when it is not the plunger's; Start turns it on or off); then "Enregistrer" (Save) ("Continuer" (Continue) in the full wizard) or "Pas de lanceur analogique" (No analog plunger).
  Everything also works with the mouse.
- **No analog plunger**: this choice only removes the plunger; the accelerometer that is set stays, and VPX still reads nudging (`NudgeSensorCount` at 1): a cabinet with a button plunger can have its accelerometer on a KL25Z.
  Without an analog plunger, the accelerometer is chosen at the "Tilt" step (see [Tilt](tilt.md#tilt)).
- **Rest far from 0**: VPX has no offset, the plunger would look pulled all the time.
  The step says so: the rest position is set on the board (Pinscape calibration).
- **Already set**: a cabinet where the step was done opens on its setting; otherwise, a plunger already assigned in VPX (its menu, or its accepted Pinscape layout) is taken as is ("Réglage trouvé dans VPX", Setting found in VPX).
  In the full wizard, a cabinet with no joystick with axes and no known setting skips the step without writing anything.

Keys written (`vpxAnalogSettings`, format read in `PlungerHandler.cpp`, `PhysicsSensor.cpp`, `NudgeHandler.cpp` and `GamepadNudge.cpp` at commit `af26b2d93`); a sensor value is written `<joystick>;<axis>;<P|V|A>;<dead zone>;<scale>;<limit>`, the axis numbered like VPX (0x200 plus the SDL axis: Z is 514), a negative scale reversing the axis:

| `[Input]` key | Value |
| --- | --- |
| `PlungerSensorCount` | 1, or 0 with no analog plunger |
| `Mapping.Plunger0.Position` | `SDLJoy_…_1;514;P;0.020000;1.000000;1.000000` |
| `Mapping.Plunger0.Velocity` | `SDLJoy_…_1;517;V;0.000000;12.500000;1.000000` (Pinscape speed), otherwise empty |
| `NudgeSensorCount` | 1, or 0 with no accelerometer |
| `Mapping.Nudge0.Type`, `X`, `Y` | 0 (gamepad), `SDLJoy_…_1;512;A;0.000000;2.000000;1.000000`, `SDLJoy_…_1;513;A;…` (the scale is the nudge strength: ×2 proposed for a Pinscape, see [Tilt](tilt.md#tilt)) |
| `Device.<joystick>.NoAutoLayout` | 1 for each joystick whose buttons or sensors Cyber Pinball writes |

- **VPX's default layout turned off**: VPX recognises a six-axis Pinscape and offers, during a game, to apply its layout (plunger on Z, accelerometer on X and Y).
  Accepting first erases everything coming from that joystick (`ApplyDefaultDeviceMapping`, `ClearDeviceMappings`), including the buttons mapped by Cyber Pinball.
  `NoAutoLayout` turns that offer off for the cabinet's joysticks; a Pinscape set to "X/Y/Z" only (three axes) was not recognised by VPX anyway, and its plunger only worked once assigned by hand.
- These keys belong to the "Lanceur" step (`isAnalogKey`) and no longer to the "Boutons" (Buttons) step; `NoAutoLayout` belongs to both.
  Like the other managed keys, a setting later changed in VPX's menu (the dead zone, for example) is reported, then kept or reset as you choose.
- The "Lanceur" (Launch) button (`Mapping.LaunchBall`) stays: it serves tables with an automatic plunger, and the Pinscape can send it when the plunger is pushed forward ("ZB Launch Ball", set on the board).
