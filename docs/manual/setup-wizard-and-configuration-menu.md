[Français](../manuel/assistant-et-menu-de-configuration.md) · English · [Manual contents](../manual.md)

## Setup wizard and configuration menu

The setup wizard (`app/src/wizard.ts`, screens `app/renderer/screen.*`) runs at first start, or through "Assistant complet" (Full setup wizard), and goes through: **buttons** (capturing each button), **analog plunger** (sensor plunger, accelerometer), **tilt** (cabinet tilt bob or tilt bob simulated by VPX), **screens and roles** (playfield, backglass, DMD, topper), **playfield orientation and size** (flipper edge, flipping the screen in Windows if VPX needs it, diagonal), **screen layout** (zones), **sound** (audio outputs, speaker test), then the summary and the writing of `cabinet.json` and `VPinballX.ini`.
The list of steps, what each one decides and its keys are in [packages/core/src/wizardsteps.ts](../../packages/core/src/wizardsteps.ts) (`WIZARD_PHASES`, `WIZARD_STEPS`), tested in [wizardsteps.test.ts](../../packages/core/src/test/wizardsteps.test.ts).

**System menu (Exit, Tab or ⚙) > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration)** gathers everything that sets up the cabinet.
Each step can be redone there on its own and returns to the table menu, saved or not:

| Entry | Option | What is redone | `VPinballX.ini` keys written |
| --- | --- | --- | --- |
| "Boutons du jeu" (Game buttons) | `--boutons` | game button capture and test | `[Input]` |
| "Boutons de l'interface" (Interface buttons) | `--interface` | capture and test of the buttons that drive Cyber Pinball | none |
| "Lanceur analogique" (Analog plunger) | `--lanceur` | sensor plunger detection, direction, dead zone, speed, accelerometer, test | sensor `[Input]` keys |
| "Tilt" | `--tilt` | cabinet tilt bob or tilt bob simulated by VPX, contact angle, nudge test | `[Player] SimulatedPlumb`, `PlumbThresholdAngle` |
| "Écrans et rôles" (Screens and roles) | `--ecrans` | the screen of each role; flipper edge and diagonal only if the playfield moves to another screen | VPX windows and framing |
| "Orientation et taille du playfield" (Playfield orientation and size) | `--playfield` | flipper edge, screen flip, diagonal | VPX windows and framing |
| "Disposition des écrans" (Screen layout) | `--disposition` | zone of each role on its screen | VPX windows and framing |
| "Son de la borne" (Cabinet sound) | `--son` | backglass and playfield outputs, speaker test | `SoundDevice`, `SoundDeviceBG`, `Sound3D` |
| "Assistant complet" | | all the steps in a row | all managed keys |
| "Touches par défaut des encodeurs" (Default encoder keys) | | immediate reset of both button sets, no wizard | `[Input]` |
| "Configurations de la borne" (Cabinet configurations) | | choose, rename, trash, new configuration | |

A single step starts from the saved model (roles, screens, flipper edge), changes only its own fields in `cabinet.json` (`stepCabinet`) and writes only its own `VPinballX.ini` keys (the `only` option of the sync), even ones changed by hand; the other keys stay as they are until the next sync from the menu.
The summary shows only those keys; Exit there restarts the step, Backspace goes back to the last question.
Windows and framing: `[Player] Playfield*`, `[Backglass]`, `[ScoreView]`, `[Topper]`, `BGSet`, `ScreenWidth`, `ScreenHeight`, `CabinetAutofitMode`.

**Leaving without saving, at any step** (layout editor, flip countdown and summary included): the "Quitter sans enregistrer ?" (Leave without saving?) question opens with

- the **"Quitter sans enregistrer"** (Leave without saving) button, always shown at the top right of every screen (also clickable in the layout editor).
  **Underneath, it states the gesture that works at this step** (`quitGestures`): "Exit (Échap) maintenu 2 s" (Exit (Esc) held 2 s), "Toute touche maintenue 3 s" (Any key held 3 s) during capture, and the dedicated button when it acts ("ou Bouton 9 du joystick", or Joystick button 9); up to 0.1.11-essai.43, this gesture was only written in the "Configuration de la borne" (Cabinet setup) submenu, and nobody knew about it;
- **the cabinet's "Quitter sans enregistrer" (Leave without saving) button**, optional, assigned in the "Boutons de l'interface" (Interface buttons) step (`navigation.quit`): one press opens the question, a second answers yes, at any step, full wizard or single step.
  It keeps its role where the same physical button already has one (`quitButtonActs`, [wizardsteps.ts](../../packages/core/src/wizardsteps.ts)): while a button is being captured, it is captured like any other (held 3 s, it opens the question like any key); on the buttons summary, it counts as the test of the game button it also is; in the "Tilt" step, it stays the tilt bob if it is one.
  Outside the setup, it does nothing;
- **Ctrl+Q** on a keyboard; Ctrl+Q again answers yes;
- **Esc or Exit held for 2 s** (the button shows "Maintenu : quitter sans enregistrer ? dans 1 s" (Held: leave without saving? in 1 s));
- **during button capture, any key held for 3 s**, which is not captured.
  At that point the wizard does not yet know which key is Exit: this is the only gesture that works with any encoder.
  So that it does not get in the way of the capture, a button is captured **on release**: a press on a cabinet button lasts well under a second, the difference is invisible, and a held key is never captured (nothing to undo).
  Outside button capture, only a held Esc or Exit opens the question: held flippers keep their effect (speeding up a setting in the editor);
- **Exit (or Backspace) on the first question** of a step, when there is nothing before it: the playfield in the full wizard, the flipper edge in orientation alone, the first output in sound alone, the editor in layout alone.

The question says what would be lost ("Boutons : Flipper gauche sur A" (Buttons: Left flipper on A), "DMD : …", "Flippers à gauche de l'image" (Flippers on the left of the image), "Son…" (Sound…), "Écran du playfield : remis dans son orientation d'origine" (Playfield screen: restored to its original orientation), or "Rien n'a été changé" (Nothing was changed)) and where you will end up.
**Start (or Enter): yes** · **Exit, Esc or Backspace: no** · the same gesture again (a key held again): yes · with no answer within 20 s, the wizard resumes.
During button capture, the Start and Exit already captured also answer.
Yes: nothing is written, neither `cabinet.json` nor `VPinballX.ini`; an unconfirmed screen orientation is restored; back to the table menu or, on first start without a model (the menu cannot open), Cyber Pinball closes, as announced on screen ("l'assistant reprendra au prochain démarrage" (the wizard will resume at next start)).
A test pins the invariant: the question comes before any step in `handleKey`, the mouse before any other action, every state sent to the screens carries the button, and nothing is written outside the two save functions.

**"Placer librement…"** (Place freely…): at the screens step, after the whole screens and the ready-made spots (bottom of the backglass in 4:1 or 16:9, inset in the playfield), the backglass, DMD and topper offer "Placer librement…".
Start opens the layout editor on that role, placed on its saved screen (otherwise a free screen, otherwise the backglass screen), with the cursor on the "Zone" line; "Revenir à l'assistant" (Back to the wizard) keeps the chosen spot and moves on to the next role, Exit returns to the question as it was.
