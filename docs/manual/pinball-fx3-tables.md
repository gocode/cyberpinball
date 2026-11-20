[Français](../manuel/tables-de-pinball-fx3.md) · English · [Manual contents](../manual.md)

## Pinball FX3 tables

Cyber Pinball also launches **Pinball FX3** tables (Zen Studios, 2017), renamed **"Pinball FX Classic"** on Steam in April 2026.
Many cabinets still have it, with bought tables that don't carry over to [Pinball FX](pinball-fx-tables.md).
**In beta**, like Pinball FX: "BETA" badge on the funnel entry and on the table page.
Pinball FX2 isn't supported: old, with no reliable direct launch.
Everything below applies to the Steam version, installed by Steam or kept in a folder chosen by hand: the Microsoft Store and console versions have neither cabinet mode nor direct launch (the game left Microsoft's stores in May 2026).

Pinball FX and Pinball FX3 are two variants of the same code, the "Zen games" ([packages/core/src/zen.ts](../../packages/core/src/zen.ts)): same adding screen, same adding page with its media, same game, same return.
What differs from one game to the other is described here.

- **What the game asks of the player**: nothing from Zen.
  The **cabinet code** that had to be requested from Zen no longer exists since update 1.0.26.1 of November 4, 2024: cabinet mode unlocks for everyone (commercial use still needs Zen's approval).
  It still has to be **turned on once** in the game: cabinet icon next to the profile, then "Activate".
  Without cabinet mode, or without the table on the Steam account, the game opens on its home screen instead of the table.
  Only **Fish Tales** and **Sorcerer's Lair** are free, on every account; the other tables only open if they are bought on the Steam account, and Cyber Pinball's messages remind you of it for them only.
  The "Pinball FX3 tables" screen says so at the top, with the address of Zen's help (`pinballfx.com/?page_id=7754`); a table's page has a "Cabinet mode" line.
- **The game's first opening on this PC**: as long as Pinball FX3 has never been opened on this PC (no `SystemConfigCache.dat` in its folder), its cabinet mode isn't turned on there and it would open on its home screen, in landscape.
  Before starting the table, Cyber Pinball then shows "First time Pinball FX3 opens on this PC": what to do in the game (cabinet icon next to the profile, "Activate", then the playfield rotation and the backglass and DMD screens), then close the game by holding Exit and start the table again; for a paid table, the purchase reminder.
  Start opens the game anyway, to set it up; Exit goes back to the front-end.
  The game encrypts these settings (`.dat` files in its folder and its Steam profile): Cyber Pinball can neither read nor write them, unlike Pinball FX's rotation.
  Once the game has been opened on this PC, nothing tells any more whether its cabinet mode is on: the message doesn't come back.
- **Adding tables**: System menu > Tables > Add a table > **"Pinball FX3 tables"**.
  The list is made of the **table files installed with the game** (`data\steam\*.pxp`), read again at each opening, without the game's own files (`gui`, `sfx`, `txt`, `preview`, `PTSData`, `game_cfg`, `*_cfg`, `*_sfx`, `*Assets`).
  Steam installs **all** tables, bought or not (they are used for in-game trials): nothing on disk says which ones the player owns, and Cyber Pinball doesn't guess.
  The player chooses, as for Pinball FX; the adding page reminds it.
  An empty or unreadable folder gives a "No table found" line pointing to the file check in Steam.
  The screen also opens when the game isn't found: it then offers to install it with Steam, or to choose its folder.
  At the top, it says where the game is ("Installed by Steam", or the folder chosen by hand) and, for a chosen folder that is no longer used, why (drive unplugged, executable missing, no tables).
- **Game folder chosen by hand**: for tables kept outside the Steam library, System menu > Tables > Add a table > "Pinball FX3 tables" > **"Choose the game folder…"** ("Change the game folder…" when there is one).
  The folder is accepted if it holds "Pinball FX Classic.exe" or "Pinball FX3.exe" and tables in `data\steam`; the game itself, its `data` or `data\steam` folder, or the folder that contains it are recognised too.
  It is kept in the data folder, and the screen's tables then come from it; a refused folder isn't kept, and the screen says why.
  The same folder, chosen through the funnel's "Choose a folder…" or dropped on the window, is recognised, kept as the game folder, and the "Pinball FX3 tables" screen opens with its tables, instead of "Nothing to install"; the rest of the selection follows the usual add.
  With a chosen folder, games start through the game's executable, without going through Steam: `-offline`, `-class` for Williams and Bally tables, `-table_<file>`, from the game folder.
  Cyber Pinball writes nothing in that folder: if the game requires Steam, the game itself refuses to open, and the message says so at once, with the way back to Steam.
  The Steam folder chosen by hand always goes through Steam (started directly, Steam would ask for a confirmation at every game).
  **"Forget this folder"** goes back to the Steam game; without a chosen folder, nothing changes.
- **Catalog**: 100 known files (Steam depot 442121, manifest of April 1, 2026), each linked to the same Pinball FX table when it exists (84 with their VPS game; title, manufacturer, year: `WMS_Fish_Tales` = "Fish Tales (Williams 1992)"); otherwise its title ("Family Guy Pinball", Zen Studios).
  Cryptic names are translated (`Citadel` = Sorcerer's Lair, `SpaceBear1` = The Last Jedi, `RedCup1` = Solo, `STARWARS_LAPB` = Rogue One…).
  An unknown file (newer table) shows under its name ("STARWARS New Table"), and can be launched.
  Captures and media come from the VPS database as for Pinball FX, the "FX3" version first; in a received pack, the file named after the table (`WMS_Fish_Tales.png`) is taken.
  Zen's own tables (Aliens, Archer, American Dad, Portal, The Walking Dead…) are linked to their VPS database game by their exact title: they have their thumbnail and their media, and "Chercher les médias manquants" (Find missing media) completes those already added.
  A picture stored next to a table in `data\steam`, named after its file ("Archer.png" next to "Archer.pxp"), is the list's thumbnail and is filed with the table when it is added, according to its proportions: roughly square or small, as the logo; wide, as the backglass (that's where the game shows it); tall, as a picture of the table.
- **Entry**: `.pinballfx3` (JSON: `{ "PinballFX3": { "Table": "WMS_Fish_Tales" } }`) in a "Title (Manufacturer Year)" folder.
  The same machine already present in VPX or Pinball FX keeps its folder: the FX3 entry takes a folder ending in "Pinball FX3", otherwise both would share their `.info` and media.
  An invalid table name in the entry (space, quote) leaves it in the inventory without a key: it is never launched with a guessed name.
- **Installation found**: the folder chosen by hand if it is suitable, otherwise Steam, complete `appmanifest_442120.acf` manifest (flag 4 of `StateFlags`) in one of the libraries; the folder keeps its install name (`Pinball FX3`) despite the game's new name.
  Missing: the funnel entry keeps its name, "Pinball FX3 tables" ("Not found on this PC: install it with Steam, or choose the game folder"), and its screen offers the Steam install, on `steam://install/442120` (the game is free, tables are bought there), and the choice of the game folder.
  Without Steam, choosing the folder remains.
- **Launch**: `steam.exe -applaunch 442120 -class -table_<file>` (folder chosen by hand: the game's executable, see above), `-class` for **Williams and Bally** tables only (their **classic mode**: the machine's rules, without Zen's upgrades; the page says so).
  These arguments aren't documented by Zen: they come from front-ends (PinUP Popper, PinballX, RetroBat) and the Zen support they quote.
  A table name containing anything other than letters, digits, "_" and "-" is refused before any launch.
  The game is recognized by its window: **"Pinball FX Classic"** since April 2026, "Pinball FX3" before; never a Steam page naming it.
  A Pinball FX3 left open is closed before the game (Steam would only show it, without opening the table).
- **Table stuck on the game's home screen**: the window is the same on the home screen and on a table, Cyber Pinball can't see it.
  A game shorter than 45 s shows on return **"Did Pinball FX3 stay on its home screen?"** with the possible causes, in the conditional: table not on this Steam account (never for Fish Tales or Sorcerer's Lair, which are free), cabinet mode not turned on, and for "Mars" the game's known bug that opens "Attack from Mars" when the account has both tables.
  A window that never shows up (120 s) fails with its explanation, as for Pinball FX.
- **Quitting**: as for Pinball FX, **holding Exit** (2 s) closes the game and returns to the wheel; the loading card says so with the game's name.
- **Buttons and screens on a cabinet**: as for Pinball FX, the joystick buttons of a cabinet send the game the keys of its Controls > Keyboard screen, and the screens the game draws on are left to it (see [Pinball FX tables](pinball-fx-tables.md)).
  Pinball FX3's menus are browsed with the left and right arrows, on which Shift does nothing: each flipper therefore also sends the arrow on its side (`PINBALLFX3_EXTRA_KEYS`), which lets you reach the cabinet icon and turn on cabinet mode without a keyboard; in a game, the flippers still raise the flippers on the table.
  On a keyboard cabinet (keyboard encoder, keyboard), a flipper's key reaches the game alone: right during play, no effect in the menus.
  During the game, Cyber Pinball therefore reads these keys and also sends the arrow on their side, without delaying the flippers at all: nothing comes between the key and the game.
  Pinball FX3 in 1080p full screen on a 4K playfield changes the screen's resolution, and Windows rearranges the others: the front-end's windows each follow their role's screen, with no rotated playfield on the DMD screen and no DMD on the backglass.
- **Orientation**: the image rotation is set in the game's cabinet mode, Cyber Pinball doesn't write it.
  So that this setting holds from one front-end to another, Pinball FX3 starts on the playfield screen as Windows orients it, as with another front-end: the Windows orientation comes back just before the launch, no longer moves during the game, and the one Cyber Pinball gives the playfield for Visual Pinball comes back on returning to the wheel (see [Table orientation and framing](table-orientation-and-framing.md#desktop-orientation-on-exit)).
  On a cabinet where Cyber Pinball rotates that screen for Visual Pinball, an orientation entered in FX3 when it started on the session's one now gives an upside-down image.
  Before the next FX3 game, Cyber Pinball says so once, "Pinball FX3: orientation to change", with the old and the new value to enter ("In Pinball FX3, cabinet mode: change Orientation from 270° to 90°."); Start opens the game to change it, Exit goes back to the front-end.
  The message only shows if FX3 has already been started by Cyber Pinball on this cabinet (one of its tables has games) and if the value really changes; it doesn't come back.
- **The game's backglass**: in cabinet mode, with backglass repositioning on, FX3 opens a window on the backglass screen and shows there the picture stored next to the table's file, named after the table (`data\steam\<table>.png`, or `.bmp`, `.gif`, `.jpg`, `.jpeg`), and `PinballFX3.*` for its home screen; without it, it only writes the path it is looking for.
  Before each game, a table with no picture gets one: its backglass in Cyber Pinball (copied as is in a format FX3 reads, otherwise converted to PNG), otherwise the one from archive.org's "FX3 Backglass art" catalogue (pictures made by players), along with the home screen picture.
  The catalogue is waited for 15 s at most; beyond that, it carries on in the background and the picture serves the next game.
  A table with no backglass in Cyber Pinball takes that picture as its backglass, and the wheel shows it.
  After a game, the pictures of all installed tables arrive in the background, once per start, tracked in Downloads: FX3 also shows other tables' pictures during its transitions.
  The **"Download the tables’ backglasses"** entry of the "Pinball FX3 tables" screen does the same on demand, with its progress and its summary (placed, already there, missing from the catalogue, failed).
  Each picture is checked (size and MD5 announced by archive.org), put under the name the game expects, with or without Steam, and an interrupted download resumes where it stopped.
  A picture already there, the player's or from another pack, is never replaced.
- **DMD**: the game's own, on the cabinet's DMD screen (cabinet mode, "Dot Matrix" repositioned).
  A **real DMD** (ZeDMD, PIN2DMD, PinDMD) only gets FX3's image through `dmdext mirror --source=pinballfx3` from dmd-extensions, which **reads the game's memory**: no official Zen interface (unlike Pinball FX and its `DmdDevice64.dll`), and a game update can break it (the April 2026 rename caused trouble).
  Cyber Pinball doesn't start `dmdext` for now; "DMD on the wheel" stays greyed out with its reason.
- **What Pinball FX3 doesn't provide**: no ROM or NVRAM (no scoreboard or ranking), no VR, no in-game settings, no games with friends or live games; all of these stay in place on the page, greyed out, with the reason, as for Pinball FX.
  "Delete the table" removes it from the menu; it stays in Pinball FX3.
- **Code**: catalog, detection, installed tables, command and short-game message in [packages/core/src/pinballfx3.ts](../../packages/core/src/pinballfx3.ts); folder chosen by hand in [packages/core/src/pinballfx3-folder.ts](../../packages/core/src/pinballfx3-folder.ts) and [app/src/pinballfx3-folder-ui.ts](../../app/src/pinballfx3-folder-ui.ts); backglasses in [packages/core/src/pinballfx3-backglass.ts](../../packages/core/src/pinballfx3-backglass.ts) and [app/src/pinballfx3-backglass.ts](../../app/src/pinballfx3-backglass.ts); first opening, free tables and orientation message in [packages/core/src/pinballfx3-cabinet.ts](../../packages/core/src/pinballfx3-cabinet.ts) (`pinballFx3FirstRunMessage`, `PINBALLFX3_FREE_TABLES`, `takePinballFx3OrientationNotice`); Windows orientation for the game in `GAMES_ON_WINDOWS_ORIENTATION` ([packages/core/src/sessionorientation.ts](../../packages/core/src/sessionorientation.ts)); shared Steam reading in [packages/core/src/steam.ts](../../packages/core/src/steam.ts); what both games share in [packages/core/src/zen.ts](../../packages/core/src/zen.ts) (`ZEN_GAMES`, `ZenTable`, `zenTableOfEntry`); entry in `addZenTable` ([packages/core/src/tables.ts](../../packages/core/src/tables.ts)); window in `isPinballFx3Window` and `ZEN_LAUNCH_GAMES` ([app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts)); installation in `pinballFx3Setup` ([app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts)).
  Tests: `pinballfx3.test.ts`, `pinballfx3-cabinet.test.ts`, `pinballfx3-folder.test.ts`, `pinballfx3-backglass.test.ts`, `pinballfx-launcher.test.ts` (simulated system).
- **Observed on a real cabinet**: the encrypted settings, the first opening on the home screen in landscape, the 1080p full screen that changes the playfield's resolution, the path written in the backglass window without a picture, the orientation to enter on the Windows orientation.
  **Not yet checked**: direct launch of a table, `-class`, "Pinball FX Classic" window title, closing by holding Exit, short-game message.
  File names come from the published Steam manifest, not from a folder read on a cabinet.
