[Français](../manuel/boutons-de-la-borne.md) · English · [Manual contents](../manual.md)

## Cabinet buttons

**Two independent sets of buttons.**
The **game** buttons (flippers, Start, Exit, coin, plunger, MagnaSaves, Extra Ball, pause, tilt, nudges, volume) are what VPX receives during a game: `cabinet.json` > `buttons`, written to `[Input] Mapping.*`.
The **interface** buttons (Previous, Next, Confirm, Back and menu; optional: Cheat sheet (Aide-mémoire), VPX settings, Windows desktop, Leave without saving) drive Cyber Pinball: table menu, details screens, VPX settings, wizard, warnings; `cabinet.json` > `navigation`, which VPX does not read.
Each set is captured, summarised and tested on its own, through the same screen and functions (`KeySet`: `GAME_KEYS`, `INTERFACE_KEYS`; `recordKey`, `keyProblems`, `keysToTry`, `packages/core/src/buttons.ts`); keyboard key or joystick button, freely from one button to the next, and one physical button can serve both sets (each set only refuses its own duplicates).

- **By default**, the interface is on the same physical buttons as the game flippers, Start and Exit (`defaultNavigation`).
  A cabinet saved before the interface buttons existed (no `navigation`) therefore keeps its navigation on its game buttons, with nothing to redo (`navigationButtons`, soft migration).
  Once the interface buttons are saved, capturing the game differently no longer changes them.
- **Keyboard fallback keys**, always active: Tab (menu and configuration), left / up arrows (previous), right / down (next), Enter (confirm), Esc (back).
  An interface button cannot take another role's fallback key ("Entrée reste la touche de secours « Valider »", Enter stays the "Confirm" fallback key, `refusedNavigationKey`).
  H and F1 (cheat sheet) and R (VPX settings) stay active as long as no cabinet button, game or interface, sends them (`interfaceKeys`, `withoutButtonKeys`).
- **The whole interface reads its own buttons**: menu (`interfaceKeys`), VPX settings, "other frontend open" warning, wizard (`navigationKeys`), always given the whole cabinet (`ButtonsSource`), never the game buttons alone (invariant test in `buttons.test.ts`).
  The "During a game" cheat sheet and the in-game display adjustment stay the game's (`gameKeys`, `displayKeys`).
- **Inconsistent capture** of the interface buttons (`navigationProblems`): the interface falls back to the game flippers, Start and Exit, and the menu offers at startup to redo the step ("Boutons de l'interface à refaire", Interface buttons need redoing; Start: `--interface`).

This is the first step of the wizard, since everything else is driven with the buttons: the screen asks "Appuyez sur le bouton" (Press the button) for left flipper, right flipper, Start, Exit, coin, plunger, then the optional buttons (left and right MagnaSave, Extra Ball, Pause, tilt bob, slam tilt, nudges to the left, to the right and forward, volume − and +, mute), which Exit skips.
The same question is shown on every screen (upright for the player on the previous playfield), above the list of all buttons: those already captured with their key, the current one, those still to come, so you can decide in advance which cabinet button will play which role.
A key already captured for another button of the same set **moves to the new one**: the old one is emptied, and the screen says so ("Maj gauche était le bouton Flipper gauche : Flipper gauche est à relever de nouveau" (Left Shift was the Left flipper button: Left flipper must be mapped again), or "… n'a plus de touche" (… has no key now) for an optional button, `recordKey` → `taken`, `takenNotice`); the old button's line then says, in orange, which button took its key until it is mapped again ("reprise par Start", now on Start).
A required button emptied this way is asked again before the summary; an optional one stays without a button when saved.
Up to 0.1.11-essai.43 it was refused: a cabinet whose buttons were all taken could no longer swap two of them.
The Windows key and keys VPX cannot read are still refused; a button counts when it is released, only once, and a key held for 3 s opens "Quitter sans enregistrer ?" (Leave without saving?) instead of being captured.
A button that sends AltGr (Right Alt on a European keyboard) is captured only once, as Right Alt: Windows sends a Left Ctrl just before it, which the capture ignores when Right Alt follows within 50 ms (`altGrPhantomControl`); a Left Ctrl on its own, like the MagnaSave of a board in keyboard mode, is captured normally.
Each capture is written to the log (`<data>\logs\journal.txt`), button by button ("Assistant : relevé game, … sur … : gardé", or skipped, refused and why, skipped with the mouse), then the keys confirmed at the end of the capture ("Assistant : touches validées (game) : …"): the log attached to a report is enough to see what a player ended up with.

**Full wizard**: the interface buttons first, since they drive the menus and the rest of the wizard (Previous, Next, Confirm, Back and menu, then Cheat sheet, VPX settings, Windows desktop and Leave without saving, which Back skips), then the game buttons.
On a new cabinet, the game buttons are offered on the same buttons (flippers on Previous and Next, Start on Confirm, Exit on Back; the others on the encoders' keys, `gameFromNavigation`): "Valider" (Confirm) keeps them without a test; one button can be redone on its own, or "Tout modifier" (Change all) asks for them one by one.
A game button whose encoder key was thus taken by a flipper, Start or Exit is left without a key, and its line says, in orange, which one took it ("reprise par Flipper gauche", now on Left flipper, `gameKeysTakenByNavigation`).
The optional interface buttons (Cheat sheet, VPX settings, Windows desktop, Leave without saving) take nothing away from the game: a MagnaSave chosen for the cheat sheet keeps its key among the game buttons and stays the MagnaSave in a game, on a board in keyboard mode such as the CSD PinOne (MagnaSaves on Ctrl) as anywhere else.
On an already configured cabinet, each step opens on its current keys.
The step bar at the top of every screen shows the step's name and the current button ("Boutons de l'interface · Bouton 2 sur 4", Interface buttons · Button 2 of 4, see [Setup wizard and configuration menu](setup-wizard-and-configuration-menu.md#setup-wizard-and-configuration-menu)); "◀ Précédent" (Previous, or Backspace) on the summary, or on the first button of a capture, goes back to the step before: from the game to the interface, from the interface to the first screen; greyed out with "Première étape" (First step) when there is nothing before.
Before 16/11/2026, the wizard captured the game and then the interface, and Previous went round in circles in the interface.
On the interface summary, Previous, Next, Confirm and Back whose key changed must have been pressed before Confirm; on the game summary, the flippers, Start and Exit.
The interface keys in effect, the arrows and Enter also choose and run on both summaries, without counting as a test.
With no answer on the first step (20 s), both sets keep their keys and the wizard moves on to the screens.

A new cabinet (no keys saved yet) opens on "Vos boutons sont-ils déjà les bons ?" (Are your buttons already right?): the list of the interface buttons in effect, the encoders' ones (Previous: Left Shift, Next: Right Shift, Confirm: 1, Back and menu: Esc), "Garder ces touches" (Keep these keys) selected by default and "Modifier mes boutons" (Change my buttons).
On this screen, presses choose and nothing is captured: as in any menu, the flippers and arrows move from one choice to the other without ever changing screen, Start or Enter confirm the selected choice.
"Garder ces touches" then offers the game buttons on these same buttons, to confirm; "Modifier mes boutons", Exit (Esc) or a click on a line open the button-by-button capture.
A countdown, bar and sentence, always says what will happen at the end.
Before 0.1.13, the wizard opened the capture straight away, which would have taken Enter for a button: a tester could not find how to go on with keys that were already right.
In the capture, each button still to come shows, dimmed, the key currently in effect, i.e. the encoders' key.
On a cabinet that is already configured, and always for the step on its own, the step opens straight on the summary: each button with its current key, nothing to redo.
A single button can be changed on its own: click its line, or use the flippers to reach its line (after the actions) then Start; press the new button and you are back at the summary, the other keys kept (Backspace cancels).
"Tout modifier" (Change all) starts the full capture over.

Under the question, four instructions state each gesture plainly, with the cabinet button and the on-screen button that do it (`captureGuide`): **Passer** (Skip: "pas ce bouton sur la borne : Exit (…) ou « Passer ce bouton »", the cabinet has no such button: Exit (…) or "Skip this button"; "pas de bouton pour ce rôle : Retour (…) ou « Passer ce bouton »" for the interface; "impossible, bouton obligatoire : appuyez dessus sur la borne", not possible, required button: press it on the cabinet), **Revenir** (Back: "Retour arrière ou « ◀ Précédent » : bouton précédent", Backspace or "◀ Previous": previous button, or the previous step, or cancel when redoing a single button), **Finir** (Finish: "Terminer le relevé" (Finish mapping) once the required buttons are mapped, then "Valider") and **Corriger** (Fix: click a button in the list).
On the summary, they become **Choisir** (Choose: flippers or arrows, then Start or Enter; or a click), **Revenir** (previous step), **Finir** (press the buttons marked ○ on the cabinet, then "Valider") and **Corriger** (a button in the list to redo it, or "Tout modifier").

A mistake can be fixed without the cabinet buttons, since those are precisely what is being captured: click a line in the list (that button is asked again, then the step resumes at the first unanswered button), Backspace or "◀ Précédent" (◀ Previous) (the previous button; Backspace therefore cannot be captured as a button), and the actions under the list, always shown and clickable (the pointer appears when you move the mouse): "◀ Précédent", "Passer ce bouton" (Skip this button), "Terminer le relevé" (Finish mapping), "Touches par défaut des encodeurs" (Encoder default keys; "Touches par défaut", Default keys, for the interface) and "Tout modifier".
"Passer ce bouton" does what Exit does on an optional button: it is left without a key; on a required button, it is greyed out ("Bouton obligatoire", Required button).
"Terminer le relevé" is greyed out while a required button is missing ("Après les boutons obligatoires", After the required buttons); after that, each remaining button keeps the key shown dimmed in the list (the one in effect), unless a captured button has taken it, and the summary opens ("Relevé : boutons restants avec leur touche actuelle", Mapped: remaining buttons with their current key), where you confirm.
When redoing a single button, "Terminer le relevé" goes back to the summary without changing anything.

The summary is also a test: the flippers choose the action ("Valider" (Confirm), "Précédent", "Touches par défaut des encodeurs", "Tout modifier") or a button to redo, Start runs that choice.
A flipper, Start or Exit whose key has just been captured (different from the one in effect) must have been pressed at least once before "Valider" is accepted (check mark in the list; under "Valider", "Faire : Flipper gauche ○ · …" (To press: Left flipper ○ · …) while some remain): a wrong capture therefore cannot be saved without the player noticing.
Kept keys and the encoders' default keys are known and need no test: "Touches par défaut des encodeurs" then "Enregistrer" (Save) saves at once.
A keyboard's arrows and Enter also choose and run, without counting as a test.
While a button remains to be tested (or a required button is missing), "Valider" is greyed out from the start, with its reason below, the only list of the buttons still to press ("Faire : Start ○ · Exit ○", To press: Start ○ · Exit ○); each press ticks ✓ in the list, and "Valider" lights up.
"Valider" moves on to the screens (or saves, for the step on its own).
In the full wizard, if nobody presses anything for 20 seconds, the current keys are kept (the encoders' keys on a new cabinet): an unattended cabinet thus moves on to the screens as before.

On their own: system menu (Exit) > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration) > "Boutons du jeu" (Game buttons; `npm run assistant -- --boutons`, the launcher's `boutons` action, or the "Affecter les boutons de la borne" (Assign the cabinet buttons) action of a key in the VPX settings) or "Boutons de l'interface" (Interface buttons, `npm run assistant -- --interface`).
The rest of the model is kept: the game step only takes over the `[Input]` keys, the interface step writes nothing to `VPinballX.ini` ("VPinballX.ini inchangé : VPX ne lit pas les boutons de l'interface.", VPinballX.ini unchanged: VPX does not read the interface buttons).
In the game step, "Touches par défaut des encodeurs" (Encoder default keys) gives back the encoders' keys; in the interface step, "Touches par défaut" (Default keys) gives back the game flippers, Start and Exit in effect.

**Access to configuration without the buttons**: a wrong capture (for example Exit on a button you can no longer find) must never lock you out of the settings.
From the table menu and its messages, a discreet gear at the top right (⚙, clickable on top of everything, more visible when you move the mouse) and a keyboard's Tab key open the system menu and its sections (Tables, Médias, Borne, Cyber Pinball): add a table, VPX settings, cabinet configuration (buttons, plunger, tilt, screens, playfield, layout, sound, full wizard, configurations, encoder default keys), ROM library, quit.
In these menus, Tab and Shift+Tab move the cursor whatever buttons have been captured, and every line can be clicked.
Tab and Backspace are reserved: the "Boutons" (Buttons) step refuses them, and a capture containing one is treated as inconsistent (default keys).

**Encoder default keys** (left / right Shift, 1, Esc, 5, Enter…), the fallback when a saved capture no longer drives a cabinet with keyboard buttons: system menu > "Borne" (Cabinet) > "Configuration de la borne" > "Touches par défaut des encodeurs" (Encoder default keys), the last line (with the mouse: click "Exit : Menu système" (Exit: System menu) at the foot of the screen, then the lines), "Remettre les touches par défaut des encodeurs" (Restore the encoder default keys) in the details of a key in the VPX settings ("Avancé" (Advanced) > Input), and, without any button, the launcher's `boutons-defaut` action (`node app/dist/sync-cli.js --boutons-par-defaut`).
`cabinet.json` goes back to the default keys, for both sets (the interface on the encoders' flippers, Start and Exit), and `[Input]` is rewritten: VPX actions that had lost their key get it back (`withDefaultButtons`, `app/src/buttons-reset.ts`).

- **Never with a single press**: the line (detail "Pour une borne aux boutons de clavier ; demande confirmation", For a cabinet with keyboard buttons; asks for confirmation) opens "Remplacer les boutons par les touches par défaut ?" (Replace the buttons with the default keys?), which says what will change, with "Annuler" (Cancel) preselected; "Remplacer" (Replace) has to be chosen on purpose (`resetConsequences`).
  In the VPX settings, the same question comes before the reset.
- **Refused on a cabinet with joystick buttons** (Pinscape, encoder in gamepad mode): keyboard keys cannot replace these buttons, and none would respond anymore (`defaultButtonsRefusal`, [packages/core/src/buttons-backup.ts](../../packages/core/src/buttons-backup.ts)).
  The line stays visible, greyed out ("Indisponible : les boutons de cette borne sont des boutons de joystick", Unavailable: this cabinet's buttons are joystick buttons); the screen it opens says why, with the number of joystick buttons, and offers "Retour" (Back) or "Boutons du jeu" (Game buttons; in the VPX settings: "Affecter les boutons de la borne").
  Only the launcher's `boutons-defaut` action, the last resort without any button, overrides it.
- **The replaced mapping is always kept** (`boutons-precedents.json` in the data folder, with the `[Input]` settings left by hand): "Rétablir les boutons d'avant" (Restore the previous buttons) then appears in "Configuration de la borne" ("Relevé remplacé le … par les touches par défaut des encodeurs", Mapping replaced on … by the encoder default keys) and puts it back, `[Input]` included ("Boutons d'avant rétablis", Previous buttons restored, `restoreButtons`).
  Only the last reset is kept, for the cabinet configuration the mapping belongs to; once restored, the line disappears.
- **In the log**: each reset, with who asked for it ("Boutons : touches par défaut des encodeurs remises (Menu système) ; relevé remplacé gardé (… bouton(s) de joystick, …)"), and each restore ("Boutons : relevé d'avant la remise du … rétabli").

**Inconsistent capture** (required button with no key, the same key for two buttons, a refused key, for example after editing `cabinet.json` by hand): `buttonProblems` detects it, the whole interface falls back to the default keys (`buttonKeys`), the sync stops writing `[Input]` and reports it, and the menu offers at startup to redo the "Boutons" step.

The keys are stored in `cabinet.json` (`buttons` for the game, `navigation` for the interface, `KeyboardEvent.code` codes: `ShiftLeft`, `Digit1`… or joystick tokens): the interface reads `navigation` (or, without it, the flippers, Start and Exit of `buttons`) in the wizard, menu, details screen, table management and VPX settings (`navigationKeys`, `interfaceKeys`, `packages/core/src/buttons.ts`); the in-game key reminder (`gameKeys`) and `[Input]` read `buttons`.
A model without `buttons` keeps the default keys and leaves `[Input]` alone.

**What VPX expects** (read from `src/input/InputManager.cpp` and `InputAction.cpp` at commit `af26b2d93` of 10.8.1-5436): VPX no longer stores DirectInput codes (`LFlipKey`, `JoyLFlipKey`… no longer exist).
Each action has its own `[Input] Mapping.<action>` key, a list of alternatives separated by ` | `, each one a combination separated by ` & `; a keyboard key is written `Key;<scancode SDL>` (HID usage: A = 4, 1 = 30, Enter = 40, left Shift = 225), a gamepad button `SDLJoy_<GUID SDL>_<n>;<bouton>`.
An empty value means VPX's default key.
Cyber Pinball translates `KeyboardEvent.code` into an SDL scancode (`SDL_SCANCODES`) and writes:

| Button | `[Input]` keys (VPX default) |
| --- | --- |
| Left / right flipper | `Mapping.LeftFlipper`, `LeftStagedFlipper`, `UILeft` (`Key;225`) / `RightFlipper`, `RightStagedFlipper`, `UIRight` (`Key;229`) |
| Start, Exit | `Mapping.Start` (`Key;30`), `Mapping.ExitGame` (`Key;41`) |
| Coin, plunger | `Mapping.Credit1` (`Key;34`), `Mapping.LaunchBall` (`Key;40`) |
| Left / right MagnaSave | `Mapping.LeftMagna`, `UIUp` (`Key;224`) / `RightMagna`, `UIDown` (`Key;228`) |
| Extra Ball, Pause, tilt bob | `Mapping.ExtraBall` (`Key;5`), `Mapping.Pause` (`Key;19`), `Mapping.Tilt` (`Key;23`) |
| Slam tilt (coin door) | `Mapping.SlamTilt` (`Key;74`) |
| Coin door, door − / + button | `Mapping.CoinDoor` (`Key;77`), `Mapping.Service2` (`Key;37`) / `Mapping.Service3` (`Key;38`); see [Game volume](sound.md#game-volume) |
| Nudges | `Mapping.LeftNudge` (`Key;29`), `RightNudge` (`Key;56`), `CenterNudge` (`Key;44`) |
| Volume − / + / Mute | none: `Mapping.VolumeDown` and `Mapping.VolumeUp` get `Key;0`, with or without the "Boutons" (Buttons) step; Cyber Pinball reads these buttons itself (see [Cabinet volume](sound.md#cabinet-volume)) |

- A skipped optional button keeps VPX's default key.
- **Pause**: VPX's `Pause` action stops the game, and pressing it again resumes it (`SetPlayState(!IsPlaying())`, `InputManager.cpp`).
  Up to 0.1.3-essai.6, no cabinet button led to it: only the P key of a plugged-in keyboard paused.
  A capture made before this button does not have it: P stays the pause key, unless another button took it; redo "Boutons du jeu" (Game buttons) to give it to a cabinet button.
- Only single keyboard keys are replaced: a gamepad button or a combination added in VPX's menu (F12, "Input Settings") stays alongside.
- Another VPX action whose default key is that of a button loses it (`Key;0`, no key: an empty value would give it back): otherwise an Extra Ball button on D would also open the debugger.
  Duplicates that VPX intends are kept (Service 7 keeps `-`, the default key of Volume −).
  The action gets its key back when the conflict goes away.
  The summary and the sync's findings name these actions.
- These keys are managed like the others: a key changed by hand in VPX is reported at startup, kept or reset as you choose (`[Input] Mapping.LeftFlipper = Key;4 au lieu de Key;225`).
  The VPX settings show them in the "Avancé" tab, Input section, with the names of the action and of the key.
- Table scripts do not see the difference: `LeftFlipperKey`, `StartGameKey`… hold the action's identifier, not the key (`ScriptGlobalTable.cpp`).
  VPX also sends the script the DirectInput code of each key pressed, which an old table can test directly.

**Joystick buttons (Pinscape on a KL25Z, VirtuaPin, encoder in gamepad mode)**: a Pinscape controller sends its buttons as a USB joystick's by default, not as keyboard keys.
Cyber Pinball reads them with VPX's own SDL 3 library (`SDL364.dll` next to `VPinballX64.exe`), loaded through koffi and initialised the way VPX initialises it (`SDL_INIT_JOYSTICK | SDL_INIT_GAMEPAD`, no hints; `src/input/SDLInputHandler.h` at commit `af26b2d93`): same GUIDs, same joystick order, same button numbering.
VPX names a joystick `SDLJoy_<GUID SDL>_<rank>`, the rank telling apart two joysticks with the same GUID (`joystickDeviceIds`), and a button by its SDL number, from 0.
Polled 100 times a second in the main process (`packages/win-displays/src/joystick.ts`, `app/src/joystick-input.ts`), without SDL's event queue or a message pump that would hijack Electron's.

- **The whole interface**: each press reaches the Cyber Pinball window that has focus as a key, whose code (`KeyboardEvent.code`) is VPX's token for the button (`SDLJoy_…_1;3`).
  The "Boutons" (Buttons) step captures it like a key ("Bouton 4 du joystick", Joystick button 4, numbered from 1 as in Windows' "Game controllers" and the Pinscape configuration tool), takes it over from another button that had it, and the menu, the table page, the VPX settings, the "other frontend open" warning and the "Récupérer" (Fetch) window (Exit) follow it.
  A held button repeats like a key (500 ms, then 30 times a second): a held flipper scrolls the menu.
  During a game no Cyber Pinball window has focus: presses go nowhere.
  During capture, a line says what is read: "Joystick lu : mjrnet Pinscape Controller" (Joystick read), "Aucun joystick branché" (No joystick connected), or "Joysticks lus une fois VPX installé" (Joysticks are read once VPX is installed).
- **Keyboard and joystick mixed**: keyboard keys and joystick buttons are captured along the same path (`recordButton`), freely from one button to the next: flippers on the Pinscape, Start and credit on an encoder in keyboard mode, for instance.
  Windows sends keyboard keys to the foreground window, whereas Cyber Pinball hands joystick buttons to the window Electron considers active; a window can be active without being in the foreground (a relaunched process that Windows refuses the foreground): on the real cabinet (0.1.3-essai.1), joystick buttons were captured, keyboard keys no longer were.
  Each joystick button press therefore checks that the foreground belongs to Cyber Pinball and takes it back otherwise (`keyboardFollows`, `app/src/foreground.ts`), with a warning in the console ("Clavier : le premier plan de Windows était à …", Keyboard: the Windows foreground was with …) and, in the "Boutons" step, "clavier repris à « window » (process)" (keyboard taken back from …; "clavier retenu par …", keyboard held by …, if Windows refuses) after the joystick line; the wizard takes it when it opens.
  Focus moving from one wizard screen to another no longer makes it forget a key being held down.
- **Keyboard key releases**: capture counts a button when it is released, and guest mode follows the buttons held down.
  Yet cancelling a key press in `before-input-event` also makes Chromium drop its release (`RenderWidgetHostImpl`, `suppress_events_until_keydown_`): without a workaround, no keyboard key was captured (the release never arrived, and the key "held" opened "Quitter sans enregistrer ?" (Quit without saving?) after 3 s), whereas joystick buttons, handed over without going through Chromium, were captured; guest mode considered a released key as still held.
  Windows that read releases (wizard, menu) therefore go through `onKeyInput` (`app/src/key-input.ts`): the handled press is not cancelled there, the page cancels it (`app/src/preload.ts`, in the capture phase, after asking the main process whether it handled it), and the release arrives.
  [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) rejects any `before-input-event` handler that reads releases itself; [clavier-reel.test.ts](../../packages/core/src/test/clavier-reel.test.ts) captures, off screen, every game and interface button with real keys (`sendInputEvent`), as well as with SDL's virtual joystick, and checks what is saved.
- **`[Input]`**: each of the button's actions gets the joystick token first, and keeps VPX's keyboard key alongside (`SDLJoy_…_1;0 | Key;225`), unless another cabinet button took it.
  A new capture removes the joystick buttons written the previous time and keeps those added in F12 > "Input Settings" (`withButtonMapping`).
  The joystick's two MagnaSaves open the in-game settings: Cyber Pinball reads them itself (`watchJoystickButtons`), and `Mapping.InGameUI` keeps F12 only.
- **Check after each game**: VPX writes the joysticks it sees to `vpinball.log` ("Joystick connected: mjrnet Pinscape Controller #1 (… VPX UID: SDLJoy_…_1)").
  If VPX saw joysticks but not the one of the captured buttons (`joysticksUnseenByVpx`), Cyber Pinball and VPX do not name it the same way: the menu says so ("Boutons du joystick introuvables dans VPX", Joystick buttons not found by VPX) and Start reopens the "Boutons" step.
- **D-pads** (SDL hats: the D-pad of a gamepad in XInput mode, such as an I-PAC, a Pinscape Pico or a Raspberry Pico board set to gamepad, or an encoder's "POV" inputs): VPX turns each D-pad into four buttons, numbered `0x100 + 4 × D-pad + direction` (left, right, up, down; `SDL_EVENT_JOYSTICK_HAT_MOTION` in `SDLInputHandler.h` at commit `af26b2d93`).
  Cyber Pinball reads them the same way at each poll (`hatChanges`, `packages/core/src/buttons.ts`): a direction is captured like a button ("Croix ↑ du joystick" (Joystick D-pad ↑), `SDLJoy_…_1;258`), a diagonal holds two, and `[Input]` gets it as VPX reads it.
  Before, a D-pad could not be captured.
  Tests: [joystick-croix.test.ts](../../packages/core/src/test/joystick-croix.test.ts) (SDL virtual joystick with one D-pad) and [clavier-reel.test.ts](../../packages/core/src/test/clavier-reel.test.ts) (plunger captured on the D-pad, autopilot "JoyCroix:up").
- **Identical boards** (two Zero Delays, two I-PACs in gamepad mode, two Pinscapes): same SDL GUID, which VPX tells apart only by their rank, the order SDL sees them in.
  That rank can swap after an unplug or a restart, and the captured buttons then move to the other board (VPX acknowledges it in `OnJoystickAdded`).
  The "Boutons" (Buttons) step says so next to the joysticks read ("2 cartes identiques (…) : VPX les distingue par leur ordre de branchement, qui peut s'inverser…" (2 identical boards (…): VPX tells them apart by the order they were plugged in, which can swap…)), and Cabinet health, check "Boutons de la borne" (Cabinet buttons), flags it when buttons, the plunger or the accelerometer come from them (`twinJoysticks`, `twinJoysticksInUse`).
  Remedy: a different USB ID on each board when its tool allows it, otherwise all the buttons on just one.
- **Outside the capture**: the Pinscape's analog plunger and accelerometer are axes, assigned by the "Lanceur" (Plunger) step (see [Analog plunger and accelerometer](analog-plunger-and-accelerometer.md#analog-plunger-and-accelerometer)).
  Hats and axes assigned to an action in VPX stay alongside the buttons, like a gamepad's.
- **Without VPX installed**, or if the SDL library is missing, joysticks are not read (the step says so): the keyboard, the encoders' default keys and the mouse remain.
  **On first launch**, the wizard therefore installs VPX itself as soon as it opens, in the background and without asking anything (`wizardInstallsVpx`, [packages/core/src/first-run.ts](../../packages/core/src/first-run.ts)): for the full wizard and the steps that read a joystick (buttons, interface, plunger, tilt), when an installation lacks VPX, never during an unattended test (unless `CYBERPINBALL_VPX_ASSISTANT=1`).
  Progress shows under each screen, and the first buttons screen adds that joysticks will be read at the end and that the keyboard works right away.
  The 20 s timeout of that first screen runs even during the installation: up to 0.1.12 it waited for it, and a blocked download (antivirus, slow connection) froze the screen with no explanation.
  Joysticks are read again as soon as VPX is installed (`retryJoysticks`); as long as no cabinet button is a joystick button, one of their buttons brings back the capture from the first screen, the screens, the layout, the sound or the summary, which each step's notice says (`joystickReturnsToButtons`, full wizard only): a Pinscape-only cabinet, which could press nothing during the installation, thus captures its buttons; a wizard finished before the installation waits for its end to open the menu (`menuWaitsForVpx`).
  A failure (no connection) stops nothing: the step says so, the keyboard remains, and the menu offers the installation again.
  If the library does not load for lack of the Visual C++ runtime (which the installer usually sets up), the step says so too; once VPX or the runtime is installed from the menu, a joystick read for the first time while no game button comes from one brings up "Boutons du jeu" (Game buttons) (`joystickButtonsUnrecorded`).
  Before 0.1.11-essai.27, the wizard ran before VPX: a cabinet with only joystick buttons could neither capture its buttons nor its plunger on first launch.
  Tests: [first-run.test.ts](../../packages/core/src/test/first-run.test.ts).

### Leaving a long list: the list and the screen actions

A management screen that shows a **content list** (the tables of "Ajouter à un jeu" (Add to a game), the cards of "Médias du jeu" (Game media), the tiles of a file gallery, a friend's library, the files and places of the file picker, the lines of the cabinet health page, the downloads) has two zones: the list, and the screen actions ("Retour" (Back), the other gestures).
The core decides by nature, never by length (`screenZones`, [packages/core/src/listzones.ts](../../packages/core/src/listzones.ts)): a media card, a line to pick (`Row.pick`) or a health line is in the list; everything else is an action.
A list of options (two or three settings to choose from, "Ce que montre cet écran" (What this screen shows)) declares it (`Section.options`) and stays a plain list of actions.
A screen without a content list, or with nothing else, does not change.

- **The list is recognisable** by its frame (`.lib-zone`, `app/renderer/library.js`, `zoneFrame`) and its header bar, outside what scrolls: on the left the position of the choice ("17 / 37") or, outside it, the number of items; on the right the marker, a circled key and what it does: "Exit · Sortir de la liste" (Leave the list) while in it, "MagnaSave · Revenir à la liste" (Back to the list) otherwise (a click on it does the same).
  The zone holding the choice has its frame lit in teal; the other one dims a little.
  One focus only: green stays on the chosen item.
- **Exit in the list** brings back to the screen actions, on the entry it was entered from, otherwise on the one that does the same as Exit ("Retour", "Annuler" (Cancel)), otherwise on the first one (`leaveList`).
  A second Exit leaves the screen, as before.
  The help bar says so: "Exit ou Échap : sortir de la liste".
- **Left or right MagnaSave** (F6 on a keyboard, the Windows key that moves between panes) switches from one zone to the other without an extra step, and finds again the item left in the list (`switchZone`, `ZoneMemory`).
  The MagnaSave buttons are those of the wizard's "Boutons" (Buttons) step, otherwise the encoders' default keys (left and right Ctrl); a key already taken by an interface button keeps its role (`zoneSwitchKeys`, [buttons.ts](../../packages/core/src/buttons.ts)).
  The switch happens on release, and only if nothing else was pressed meanwhile: the Ctrl of a shortcut (Ctrl+Shift+D) never switches.
- **What Start does in the list** is read on the help strip: "valider" (confirm) usually; a screen whose list is ticked declares it (`listStart`, "Start ou Entrée : cocher ou décocher la partie", Start or Enter: tick or untick the part, for the parts of a friend's table).
- **On the cabinet** (upright screen), the content takes its own height and the actions follow right below it; the gap stays at the bottom (`.lib-body`: `minmax(0, max-content) auto`).
  A list longer than the room scrolls in its frame, the actions always visible.
- **A flipper press** follows the screen order and goes from one zone to the other at their edge, as before (`zoneStep`): a cabinet without MagnaSave always reaches its actions.
  **A held flipper** stays in its zone and stops at its end, without wrapping around (`zoneHold`); after one second, it speeds up (`holdMove`): letter by letter on a list sorted by name, section by section (one letter at most every quarter of a second, the initial shown large in the header bar; a table put first, the "probable" one, does not prevent the jump), three at a time otherwise.

Safeguards: [sortie-de-liste.test.ts](../../packages/core/src/test/sortie-de-liste.test.ts) fixes the invariant on every screen with zones (Exit from any item of the list leads to the actions, never out of the screen; the switch goes and comes back to the position left; a held flipper stays in its zone), checks that the renderer puts each content list in its frame with its marker, and lists every scrolling list in `app/renderer`: a new one fails the test until it is classified (content list, action list, or other with its reason; the VPX settings lists have their own navigation, Exit goes up one level there).
In the real rendering, the layout safeguard reports "liste de contenu sans cadre ni repère" (content list without frame or marker).

### Reading text longer than the screen

A screen without a content list can carry text longer than itself, with nothing to choose in it: the release notes of an update, a message, an explanation.
When such text overflows its frame, the mouse wheel or the scroll bar can reach it, but not the buttons: the flippers only go through the actions.
Text that overflows therefore becomes a **reading zone**, one step of the path ([packages/core/src/reading.ts](../../packages/core/src/reading.ts)):

- **You enter it** with the left flipper on the first action (the text sits above the actions), with the right flipper on the last one (the path wraps around), or directly with MagnaSave (F6), which also brings you back (`entersReading`).
- **You read it** page by page: right flipper or Start, next page; left flipper, previous page.
  A page moves 85 % of the view, two lines of the previous one stay so you do not lose your place, smoothly.
  At the bottom, the right flipper moves to the first action ("Mettre à jour maintenant" (Update now)); at the top, the left one to the last: read, then act, with no extra button (`readingStep`).
  A held flipper scrolls page after page and stops at the end, without leaving the text.
- **Exit** goes back to the actions, on the one you came from; a second Exit leaves the screen.
  A keyboard's Page Up and Page Down scroll the text from anywhere; so does the mouse wheel, as before.
- **The text is recognisable** by the frame of a content list (`readingFrame`, [app/renderer/library.js](../../app/renderer/library.js)), shown only when it overflows: on the left the part read ("45 % lu" (45 % read)), on the right the marker, "MagnaSave · Faire défiler le texte" (Scroll the text) outside it, "Exit · Revenir aux actions" (Back to the actions) inside.
  While reading, the frame holds the choice (lit in teal), no action is green and the actions dim slightly; the help strip says "Flippers : faire défiler…" (Flippers: scroll…).
  Text that fits on the screen gets no frame and no extra step.
- **Who measures what**: the main process does not see the layout.
  The renderer measures the text (frame hidden, then shown if it overflows: showing it only reduces the space), and tells the main process whether it overflows, whether it is at the top, at the bottom (`reading` action, numbered per screen: a measurement from a previous screen is ignored), only when that changes.
  Each page asked for by a button is numbered and done once, even if the screen redraws (a progress tick).
  Scrolling goes through [scroll-keeper.js](../../app/renderer/scroll-keeper.js) (`page`, `readingAt`), the only code that scrolls a list.
  The measurement does not wake the cabinet from attract mode.
- **VPX settings**: the details of the chosen setting (its original VPX description can be long) scroll with the MagnaSave buttons without leaving the list: left goes up, right (or F6) goes down one page ([settings.ts](../../app/src/settings.ts), `detailMove`).
  The help strip says so.

Safeguards: [lecture.test.ts](../../packages/core/src/test/lecture.test.ts) pins the path (entering, pages, leaving at the end, held flipper stopped at the end) and the real renderer (frame only when the text overflows, measurement sent once per change, one page per press).
Every scrolling text meant for reading says so with `data-reading`; in the real rendering of every window, the layout safeguard reports "texte qui défile hors d'atteinte des boutons" (scrolling text out of the buttons' reach) for one that does not (a list of choices with no current choice says so with `data-choices`).
The census of scrolling lists ([sortie-de-liste.test.ts](../../packages/core/src/test/sortie-de-liste.test.ts)) gives, for each one, how the buttons reach it.

### A gesture's message stays until the next gesture

The confirmation or error of an action ("Name changed", "Avatar saved", "Name refused", "Request sent to …") shows at the top of the screen and stays there until the user's next gesture, however many times the screen is redrawn in between.

- **Why**: `app/src/library.ts` calls a described screen's `build()` again on every `broadcast()`, and many of those do not come from the user (the social profile redraws 250 ms after each change, a download progresses, a friend comes online).
  A screen that cleared its message while drawing it lost it before it could be read (seen on 10/11/2026 on "Your player profile").
- **A gesture** (`userGesture`, [app/src/gesture-flash.ts](../../app/src/gesture-flash.ts)): `library.ts` counts one before each validated action (Start, click, shortcut), each back (Exit, "Back"), each key of a text input, each dropped file, and when the menu closes.
  Moving the selection (flippers, MagnaSave, scrolling text) is not one: the message stays while the screen is browsed.
- **Screen rule**: `build()` reads the message and never clears it.
  The screen subscribes once, when created (`onGesture(() => (flash = undefined))`); an action may also replace the message with its own.

Safeguards: [gesture-flash.test.ts](../../packages/core/src/test/gesture-flash.test.ts) checks that a screen redrawn without a gesture shows the same message, cleared at the next gesture, and rejects any screen in `app/src` that clears its message while reading it; [friends-menu.test.ts](../../packages/core/src/test/friends-menu.test.ts) and [profile-welcome.test.ts](../../packages/core/src/test/profile-welcome.test.ts) check it on their screens.
