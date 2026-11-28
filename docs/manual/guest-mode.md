[Français](../manuel/mode-invite.md) · English · [Manual contents](../manual.md)

## Guest mode

For a party or the kids: System menu > Ma borne > Démarrage et accès (Startup and access) > Mode invité (Guest mode), then "Activer le mode invité" (Turn on guest mode).
The table menu opens locked, and stays so until unlocked, even after a restart (`mode-invite.json` in the data folder).

- **What stays open**: choosing a table (flippers, arrow keys, wheel, click), opening its game page, playing, reading the flyer and the rules, the controls reminder (Help button, H, F1), stopping a stuck game (Ctrl+Shift+K).
  The game page only offers Play, Flyer, Rules and Back to the menu, without the "Files" section.
- **What is closed**: the system menu (Exit, Tab, gear), VPX settings (R, Settings button), Windows desktop (Ctrl+Shift+D), Ctrl+Q, Alt+F4 on a menu window, the game page actions that edit, delete, repair or download (Edit, Game media, Files, PuP-Pack, Adjust the display, Settings for this table, Diagnose, Delete, What is missing to play, Going further), files dragged onto the window, and Start on a menu message that repairs or installs (wizard, VPX, buttons, VPinballX.ini edited by hand, what is missing to play): Exit closes the message without changing anything.
  A closed door does nothing but show "Locked · guest mode" for three seconds at the top right, next to the padlock that replaces the gear (with the word "Guest"); the menu footer no longer offers "Exit: menu", and the controls reminder only lists what works.
- **Unlocking**: both flippers and both MagnaSaves held together for 3 seconds, from the table menu, a game page or a message.
  Each hand holds its flipper and the MagnaSave next to it, the very MagnaSave gesture: doable alone, without letting go of the cabinet.
  Four buttons held at once never happen by chance in a menu driven one button at a time, and the combination is not listened to during a game or its loading (VPX has the buttons then): it never gets in the way of play.
  The padlock ring fills up; released before the end, it drops back.
  At the end, guest mode stops (saved), "Guest mode off" replaces the padlock for a few seconds, then the gear comes back.
  The combination is only written on the entry's screen, never on the menu nor during a game.
  It follows the buttons recorded in the "Buttons" step; a MagnaSave that was not recorded is held with a keyboard's Left Ctrl or Right Ctrl (the entry's screen says so), and a keyboard's default keys (Shift and Ctrl, left and right) also unlock as long as no other button has taken them.
  The first button pressed does what it usually does (a flipper moves the selection by one); the next ones, held with it, nothing else.
- **Troubleshooting**: without the buttons (broken MagnaSave), with Cyber Pinball closed, delete `mode-invite.json` from the data folder.

**Entry points.**
Every way of acting on the menu has a name in `GUEST_DOORS` ([packages/core/src/guestmode.ts](../../packages/core/src/guestmode.ts)), open or closed to guests: keys and buttons (`handleKey`, `app/src/frontend.ts`), clicks (the `action` channel: gear, table wheel), global shortcuts, closing a window, dragged files (`library.handleAction`), Start on each kind of message (`MESSAGE_DOORS`), table management screens (`GUEST_SCREENS`: the game page and its pages only) and game page actions (`SheetAction`: each one declares its door).
The compiler requires a door for every kind of message and every game page action; in guest mode, a screen action without a door is hidden, so a new action stays closed until it is declared.
The autopilot goes through the same doors.
[guestmode.test.ts](../../packages/core/src/test/guestmode.test.ts) pins the invariants: the list of open doors (opening one means writing it there with its reason), every declared door is used in `app/src`, the game page and the messages declare their doors, and **every input source in `app/src`** (`ipcMain` channel, global shortcut, `before-input-event`, joystick buttons) is counted file by file: a new one makes the test fail until it says which door it goes through.
The lock, the hint, the combination (held buttons, timer, release, game in progress) and the saved setting are tested there too.

**Locked collection.**
A locked collection alone decides which tables are visible and playable, even when empty; a collection that cannot be found shows no table.
The Surprise table draws within the imposed collection, minus the excluded tables, and only among the tables marked as suitable for the family.

**Limits.**
During a game, Cyber Pinball's in-game settings (both MagnaSaves: DMD position, VPX menu) are closed to guests (`game.settings` door); VPX keeps its own controls: its menu (F12 on a keyboard) and its settings stay reachable, and Exit leaves the game as usual.
Guest mode does not lock Windows (Windows key, Alt+Tab, Ctrl+Alt+Del), nor the wizard started separately from the launcher.
