[Français](../manuel/sante-de-la-borne.md) · English · [Manual contents](../manual.md)

## Cabinet health

System menu > "Borne" (Cabinet) > "Santé de la borne" (Cabinet health) gathers on one page what other screens already know, to see at a glance what prevents playing or deserves a look.
Each line has a state — **OK** (tick, green), **À vérifier** (To check: exclamation mark, amber), **Bloquant** (Blocking: cross, red), never colour alone — and opens, with Start or a click, the screen that repairs it; its "Retour" (Back) returns to the page.
The summary at the top counts the lines in each state and says how old the check is.

| Check | Where it comes from | States | What the line opens |
| --- | --- | --- | --- |
| PC and Windows | The last [Tech sheet](tech-sheet.md#tech-sheet) reading (`pcLines`) | To check: a screen below the refresh rate Windows offers or it advertises, Windows restart pending, "Économie d'énergie" (Power saver) plan, graphics driver more than two years old, less than 8 GB of memory; OK otherwise | The tech sheet block that explains it |
| Disk space | One drive per root, among those of the tables, the downloads and the data | Blocking under 2 GB free, or a tables drive that no longer responds; To check under 10 GB | Downloads (free up space) |
| Tables | Each table's diagnosis, on its already-read script (`diagnose`, `playBlockers`) | Blocking: a requested ROM is missing; To check: the table crashed, unreadable script, the table is sluggish or stutters on this cabinet, low ROM volume, DMD videos too large, brought down to the DMD size on their own before the next game (`HEALTH_CHECK_FINDINGS`), or script never read; OK: no requested ROM is missing | The table diagnosis (five lines at most, then "See every table to review"); ROM library (read the scripts) |
| PuP-Packs | The diagnosis of each table that has a `pupvideos` folder (`pupFacts`, `PUP_HEALTH_FINDINGS`): pack not found or badly placed, switched off by the script, option missing or made for another cabinet, pack that would hide the DMD, VPX log that did not see it loaded | To check: one line per table, with the cause, and "réparé de lui-même avant la prochaine partie" (repaired automatically before the next game) when the menu takes care of it (`PUP_PLAY_REPAIRS`); OK: all ready; nothing without any pack | The table's diagnosis, where the repair takes one step |
| Media | The "Find missing media" plan on the VPinMediaDB index already kept, offline | To check: VPinMediaDB has media for tables recognised with certainty, or has never been consulted; OK otherwise. Never blocking: media are optional | Missing media |
| Screens | The setup in use against the plugged-in screens (`scoreConfiguration`, `chooseConfiguration`) | Blocking: no setup, none of its screens plugged in, or playfield not found; To check: a screen is missing, another setup would match better, or "VPX confond deux écrans" (VPX mixes up two screens): two roles on two screens with the same name, which VPX 10.8.1 cannot tell apart (`homonymousRoles`, it opens both windows on the first; PuP videos meant for one hide behind the other), "recalé à chaque partie" (realigned at every game, see below), or "pas le playfield" (not the playfield) when the playfield is one of them | Cabinet setup |
| Cabinet buttons | The connected joysticks, read by VPX's SDL library, against the cabinet's button setup (`buttonsHealthFacts`) | Check: two identical boards (same SDL GUID) that buttons, the plunger or the accelerometer come from (see [Cabinet buttons](cabinet-buttons.md#cabinet-buttons)); OK: the joysticks read, or keyboard buttons with no joystick | Commandes de la borne (Cabinet controls) |
| Real DMD | The real DMDs recognised over USB, the PIN2DMD probe and the DMD server (`hardwareDmdLines`); nothing without a real DMD | To check: missing or refused driver, PIN2DMD that does not give its name or gives a name VPX does not know (with the name read), DMD server that cannot find the display (with the cause found), USB-serial bridge that did not answer like a ZeDMD; OK: "DMD réel prêt" (Real DMD ready) (see [Real DMD](vpx-plugins-backglass-pup-and-dmd.md#vpx-plugins-backglass-pup-and-dmd)) | DMD réel (Real DMD) |
| LED and feedback (DOF) | The controllers recognised over USB and the folder the VPX DOF plugin reads (`dofLines`); nothing without a controller or configuration | To check: a point from the DOF screen, including configtool addressable LEDs without a Cabinet.xml (with the likely serial port of their controller) and an old DOF configuration found on the drives; OK: "DOF prêt" (DOF ready) (see [LED and feedback (DOF)](led-and-feedback-dof.md#led-and-feedback-dof)) | LED et retours (DOF) (LED and feedback) |
| Visual Pinball X | The active version, against the installer manifest's (offline) | Blocking: VPX missing; To check: a newer version is known, or VPX files replaced outside Cyber Pinball (another VPX copied over it), named with their version ("VPX 10.8.1-5436: one file changed outside Cyber Pinball") | Install VPX (the old version stays alongside); "Put the original files back", taken from the verified VPX archive without touching the rest of the folder (see [Installation and file layout](installation-and-file-layout.md#installation-and-file-layout)); VPX settings when all is well |

**Tables that are sluggish or stutter.**
Every game is measured (see "Frame rate of every game" in [Launching a game](launching-a-game.md#launching-a-game)) and stored in `<données>\logs\cadence-parties.json`.
The diagnosis reads each table's last judged game (`slowTableFinding`, [slowtable.ts](../../packages/core/src/slowtable.ts)): if it was sluggish, finding "La table rame sur cette borne" (The table is sluggish on this cabinet); if it only stuttered, "La table saccade sur cette borne" (The table stutters on this cabinet) (`slowTable`).
Its details give that game's figures: "À la dernière partie (date), VPX a tenu … images par seconde pour … visées." (In the last game (date), VPX held … frames per second for a target of ….), the worst moment (worst 10 s window) when it is lower, and the number of picture freezes of at least a tenth of a second with the longest.
Another cabinet program open during that game (PinUP Popper, PinUP Player, dmdext, B2S server) is mentioned there: "PinUP Popper was open during the game: it may take the processor, the disk or the real DMD at times", with the advice to close it or remove it from Windows startup (see [Coexisting](coexisting-with-another-cabinet-frontend.md#coexisting-with-another-cabinet-frontend)).
The finding counts as "To check" in the "Tables" line and shows in the table's diagnosis, hence on its page ("Diagnostiquer et réparer", Diagnose and repair); it goes away as soon as a game keeps up, the last one being what counts, and the details say so.
It has no fix: the cause (PC, VPX settings, PuP-Pack, table) remains to be found, and VPX's log of that game, attached to every report, keeps the time of each stall.

**Low ROM volume.**
A low ROM volume set outside Cyber Pinball (another front-end, the coin door before it) counts as "To check" in the "Tables" line (`lowRomVolume` finding), with "Monter le volume de la ROM" (Raise the ROM volume) in the table's diagnosis; a low factory volume does not appear there, since it is raised on its own before the game (see [ROM volume](sound.md#rom-volume)).

**Fast to open.**
The check runs in the background and yields to the menu between two tables: it never starts VPX, downloads nothing, and takes a few seconds for 200 tables.
The page opens at once on the last check, kept from one launch to the next in `<data>\cache\sante.json`, then runs it again ("Vérifié il y a 2 min · nouvelle vérification en cours…", Checked 2 min ago · new check under way…); the last summary stays on screen until the new one is ready.
A check also runs 15 seconds after start-up, then every 30 minutes (never during a game), and "Vérifier maintenant" (Check now) starts one.

**No window above VPX.**
When a game starts, `closeTopmostWindows` ([frontend.ts](../../app/src/frontend.ts)) closes any Cyber Pinball window that is "always on top" (only "Récupérer" is): it would sit in front of the windows where the PUP plugin draws.
[pupvisible.test.ts](../../packages/core/src/test/pupvisible.test.ts) refuses any other always-on-top window.

**VPX windows moved back to their screen.**
VPX 10.8.1 recognises a screen by its name only (`Window::GetDisplayConfig`) and takes the first one that bears it.
On the "Poste à 3 écrans" development PC, the backglass and the DMD are two PL2294H: VPX opened "Visual Pinball Backglass" and "Visual Pinball Score View" on the same screen (`vpinball.log`: "Window #1" and "Window #2" "on display PL2294H"), where they overlapped, and the PuP videos meant for the DMD were hidden.
No `VPinballX.ini` setting avoids it: in windowed mode, `WndX` and `WndY` are relative to the chosen screen and must fit in it.
During the game, the loop that reads the window stack every 2 s (`watchOccupied`, [frontend.ts](../../app/src/frontend.ts)) therefore moves each VPX ancillary window back to its role's screen.
It recognises the window by its title (`VPX_ANCILLARY_WINDOWS`: Backglass, Score View, Topper) and moves it at the same size, at the same place within the screen, without activating it or changing its rank in the stack (`moveWindow`, `SetWindowPos` with `SWP_NOACTIVATE`, `SWP_NOZORDER` and `SWP_ASYNCWINDOWPOS`).
This only happens with a VPX version that finds screens by name only (the profile's `name` format) and for roles whose name is shared by another plugged-in screen (`confusableRoles`: another role's screen, or an unused screen of the same model).
A window already on its screen is never touched: what is adjusted in the VPX menu stays.
These ancillary windows are written windowed at the size of their screen, never fullscreen (`vpxSettingsFor`, `confused` parameter): SDL keeps only one fullscreen window per screen and minimizes the previous one when another goes fullscreen there (`SDL_UpdateFullscreenMode`, `SDL_MinimizeWindow`).
Fullscreen on the same PL2294H, the backglass stayed minimized for the whole game, and a minimized window is never moved back: the PuP-Pack no longer showed on the backglass as soon as it also used the DMD (The Matrix, City Hunter).
A VPX ancillary window minimized during a game is reported in the menu log ("[avertissement] Partie : « Visual Pinball Backglass » est réduite par Windows…", `minimizedVpxWindows`).
A window that VPX puts elsewhere again more than three times is left where it puts it, and the menu log says so.
The playfield window, the rendering one, is never moved: when the playfield is one of the mixed-up roles, cabinet health says so.
Pure code: `vpxWindowMoves` ([vpxwindows.ts](../../packages/core/src/vpxwindows.ts)), pinned by [vpxplacement.test.ts](../../packages/core/src/test/vpxplacement.test.ts); the menu log notes each window moved back ("Partie : « Visual Pinball Score View » ramenée sur l'écran du rôle dmd…").

**Badge.**
A Blocking line in the last check puts the red dot on "Santé de la borne", on the Borne section and on the gear; the entry's details say how many issues are blocking or to check.

Code: the lines and their states in [packages/core/src/health.ts](../../packages/core/src/health.ts), the check, the cache and the page in `app/src/health.ts`, the rendering in `app/renderer/library.js` (`renderHealth`).
[health.test.ts](../../packages/core/src/test/health.test.ts) pins every state of every check and that **every line leads to a real screen**: a system menu entry placed in the tree and provided by the application, a table's diagnosis, the list of tables to review or the VPX installation.
