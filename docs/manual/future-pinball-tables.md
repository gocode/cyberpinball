[Français](../manuel/tables-de-future-pinball.md) · English · [Manual contents](../manual.md)

## Future Pinball tables

Cyber Pinball also launches **Future Pinball** tables (Black Sheep Studios, 2005), next to the VPX tables, on the same wheel.
**In beta**: the funnel entry and the table page's "Future Pinball" row carry the "BETA" pill, and the "Future Pinball tables" screen says so at the top.
When BAM is installed with the game, the game goes through it; its settings stay its own, in its in-game menu.
The game's scores aren't read.
The catalog also offers the Future Pinball versions of games (see [Adding a table](adding-a-table-the-funnel-the-catalog-recuperer.md#adding-a-table-the-funnel-the-catalog-récupérer-waiting-list)).

A Future Pinball table is a `.fpt` file, like a `.vpx`: it gets a "Title (Manufacturer Year)" folder in the tables folder with its `.fpt`, its `.info` and its media; the wheel, collections, favourites, statistics and media therefore work the same way.

- **Finding the game**: Cyber Pinball looks for "Future Pinball.exe" in the usual places, on C:, D: and E:: `Games\Future Pinball`, `Future Pinball` at the root, `Program Files (x86)\Future Pinball`, `Program Files\Future Pinball`, `vPinball\FuturePinball`, `vPinball\Future Pinball`, `Visual Pinball\Future Pinball`, `PinballX\Future Pinball`.
  Elsewhere, **"Choose the Future Pinball folder…"** points to it: its executable's folder, the executable itself or its Tables folder.
  The choice is kept in `<data>\future-pinball.json` and comes before the usual places; **"Go back to the usual places"** forgets it.
  What is found isn't remembered: a game installed later is seen right away.
  BAM is recognised by its launcher, `BAM\FPLoader.exe` in the game folder.
  A game installed elsewhere (`C:\vPinball\FuturePinball`, `C:\Games`…) is still detected and used as it is, nothing moved; the "Future Pinball tables" screen and adding a table say which folder is used and why.
- **Installing Future Pinball and BAM**: System menu > Tables > Add a table > "Future Pinball tables" > **"Install Future Pinball and BAM…"** downloads and installs them in Cyber Pinball's own folder.
  Nothing ships with Cyber Pinball: the authors say nothing about redistribution, so you download from them, with your agreement.
  The screen says what is downloaded, from where and to where, and checks that 300 MB remain on the disk before downloading; the file's fingerprint is checked.
  The author's installer is not run, because it stops on its licence page even in silent mode: the screen shows you both contracts in full (Future Pinball's and BAM's) and only extracts the files after you agree, kept next to the game.
  Extraction is done by innoextract, a small free tool also downloaded on request, with no administrator prompt; the files are placed unmodified, and your tables, libraries, music and scripts already there are never overwritten.
  This installation has no uninstaller, no shortcuts and no `.fpt` file association: Cyber Pinball launches the tables itself, and deleting the Future Pinball folder in Cyber Pinball removes everything; the request screen says so before the download.
  If extraction fails on your PC (antivirus, rights, disk), an "Install by hand" screen guides you: open the author's installer, already downloaded and checked, read and accept its contract, then "I'm done: check" finds Future Pinball wherever you installed it.
- **Taking over an existing installation**: you can take the tables, libraries, music and scripts of the old installation into Cyber Pinball's; the list, size and destination are shown before the copy, nothing is overwritten, the old installation stays intact.
  The takeover also takes BAM's views (each table's tuned camera): a view BAM had created by default and nobody had tuned is replaced, keeping the old one beside it; a view you had saved is never overwritten.
- **Adding your tables**: System menu > Tables > Add a table > **"Future Pinball tables"**.
  The screen shows the game found ("Found on this PC" or "Folder chosen by hand"), or "Not found" with the places searched, then the `.fpt` files in the game's Tables folder and its subfolders (two levels), sorted by name.
  A table already in the front-end shows "In the menu" and Start opens its page; Exit then goes back to this screen.
  Start on another table adds it to the front-end, in a "Title (Manufacturer Year)" folder of the tables folder.
  A folder that already holds another table (the same machine in VPX, another `.fpt`) stays its own: the Future Pinball table takes a folder ending in "Future Pinball", otherwise both would share their `.info` and media.
  The `.fpt` is **linked** there (hard link, on the same drive: no extra space) or **copied** (another drive, USB stick); the original, in the game's Tables folder, is never modified.
  The table's BAM physics settings (the `.xml` with the same name, next to the `.fpt`) follow it, linked or copied the same way: BAM looks for them next to the table it opens.
  Its name comes from the VPS database (games that exist in Future Pinball first, "FP" format) when it recognises it without hesitation, otherwise from the file name; title, manufacturer, year and VPS game go into the `.info`.
  When the VPS game is recognised, the missing front-end media (VPinMediaDB) then arrive in the background, tracked in Downloads.
  A table already there (same file name, same size) isn't added a second time.
- **A table kept elsewhere**: **"Choose .fpt files…"** (USB stick, Downloads, another drive), even without the game folder.
  A `.fpt` picked with the funnel's "Choose files…", or dropped on the window, goes through the same add; on its own, it opens the "Future Pinball tables" screen, which says what was done.
- **A table's archive** (received from the catalog or through Downloads): each file goes to its place in the game folder, then the table arrives on the wheel with the name of the chosen game and its version noted.
  The `.fpt` goes into Tables, the libraries (`.fpl`) into Libraries, a script library (`.vbs`) into Scripts, the BAM physics settings (`.xml` named after the table) next to it in Tables.
  A file stored in the archive under one of the game's folders (Tables, Libraries, Music, Scripts, BAM) keeps its place there.
  An archive that only holds libraries, like a table's sounds, voices and music shipped separately, is put into Libraries the same way.
  Nothing is overwritten: a library already there stays the game's own (other tables use it), and another table with the same name is copied next to it, as "Title (2).fpt".
  The other files (readme, pictures, preview videos) go nowhere.
  Before the game, Cyber Pinball reads the libraries (`.fpl`) the table cites and spots those missing from the game (for example Ghostbusters' sounds, delivered in a second archive).
  A library the old installation still had is put back without overwriting anything; otherwise the log says so, names the received archive that may contain it and reminds you to use "Add a table" on it.
  In a Future Pinball version's "What it takes", only the table is needed: an animated backglass (`.directb2s`) offered by the listing is for VPX, and the screen says so, since Future Pinball draws its own backglass.
- **Launch**: `"Future Pinball.exe" /open "<table>.fpt" /play /exit`, started from the game folder (its `.fpl` libraries), with the `.fpt` in the table's folder.
  With BAM, the game goes through its launcher, as with the other front-ends: `"BAM\FPLoader.exe" /open "<table>.fpt" /play /exit /arcaderender /STAYINRAM`, started from the BAM folder; without `/STAYINRAM`, BAM doesn't load its settings.
  Recent tables (FizX physics) need BAM to play as intended.
  The game flow is Pinball FX's: loading, taskbars hidden, other open front-ends reported, statistics and level, back to the wheel.
  Without BAM, the game is recognised by the first visible window of its own process, never by a title a web page could carry.
  With BAM, it is recognised by its executable, "Future Pinball.exe", even when FPLoader starts it separately; a Future Pinball already open before the launch isn't taken for the game, and FPLoader, if it stays open, is closed at the end.
  Quitting the table in the game closes it (`/exit`) and returns to the wheel; **holding Exit** (2 s) closes it too, and the loading screen says so in a pill at the bottom of the screen ("To get back to Cyber Pinball: hold Exit for 2 s").
- **Buttons of a joystick cabinet** (Pinscape, encoder in gamepad mode): Future Pinball only reads the keyboard, and its own gamepad setting only works on an English Windows.
  During the game, Cyber Pinball therefore turns each joystick button recorded by the wizard into the key the game's preferences give its role (Preferences > Keys, read from the user's registry; its original keys if they're missing).
  Turned into keys: flippers, plunger, Start, credit, left, right and forward nudges, left and right MagnaSave (the game's "Special 1" and "Special 2"); Exit sends Esc, which quits the table.
  The keys are only sent while the game is in the foreground, and those still held are released at the end of the game; the buttons of a keyboard encoder reach the game as they are.
- **The table's view with the cabinet's buttons** (cabinet without a keyboard, joystick buttons): during a game, press the two MagnaSave buttons together, BAM's menu opens and you set the table's view with the cabinet's buttons.
  The flippers change the value, the MagnaSave choose the row, Start confirms, Exit closes the menu (the game goes on); with the menu closed, your buttons behave as before.
  BAM itself saves the table's view and reads it back at the next launch.
  The opening key is read from BAM's `bam.cfg` file (Menu); without a readable setting, it is the one in BAM's manual.
  A cabinet whose MagnaSave are on the keyboard keeps BAM's menu on its keyboard.
  The help is shown at the top of the "Future Pinball tables" screen.
- **Nudging**: Future Pinball doesn't read a Pinscape's accelerometer.
  During the game, Cyber Pinball follows the accelerometer chosen at the "Tilt" step (see [Tilt](tilt.md#tilt)) and, at each clear jolt, taps the game's nudge key for that side once: left, right or forward, according to its preferences.
  The direction follows the accelerometer's setting for VPX: a cabinet where VPX nudges the right way nudges the right way here.
  A short pause follows each nudge, so that the cabinet's rebound doesn't count as a second one; nothing is sent while the game isn't in the foreground, nor with the accelerometer set to "None".
  At the end of the game, the log counts the nudges sent on each side.
- **Window and screens**: opened as a window elsewhere than on the playfield, the game is moved onto it; in full screen, it stays where its preferences put it.
  The game remembers the Windows name of the screen ("\\.\DISPLAY2"), which Windows sometimes renumbers: the playfield could open on the DMD screen, screens rearranged and the playfield kept a frozen picture during the game.
  Cyber Pinball therefore sets these two screens, playfield and backglass, from your cabinet before each game.
  Its framing is set in its preferences (Video); "Adjust display in game" stays greyed out with that reason.
  The game keeps the orientation Cyber Pinball gives the playfield for the session: started on the Windows one, the table would be upside down (see [Table orientation and framing](table-orientation-and-framing.md#desktop-orientation-on-exit)).
  As for the Zen games, the screens its extra windows draw on (backglass, DMD) are left to it, and the others show their media according to "Médias pendant la partie" (Media during play) (see [Pinball FX tables](pinball-fx-tables.md)).
- **DMD on the DMD screen, through dmdext**: Future Pinball draws its DMD in its backglass window.
  When DMD Extensions (dmdext) is installed with the game and set up, that is `dmdext.exe` and its `DmdDevice.ini` in the game folder or in its `dmdext` subfolder, that DMD is copied onto the cabinet's DMD screen during the game, as with PinUP Popper: `dmdext mirror --source=futurepinball -q --virtual-stay-on-top --fps 60 -g "<table>" --use-ini="DmdDevice.ini"`.
  dmdext is started before the game and closed at the end; a failed start is noted in the log, and the game goes on without a copied DMD.
  Its virtual DMD is placed by Cyber Pinball on the DMD screen as it is during the game, the full width of the screen in a DMD's shape (4:1), in the middle: the game's full screen makes Windows move screens, and the place written in `DmdDevice.ini` then fell outside every screen.
  A DMD the player has already placed entirely on the DMD screen stays where it is.
  The DMD screen is left to dmdext as to a game window.
- **"PinEvent" tables** (like Retroflair BAM Edition): they play with Future Pinball's DMD and sounds, with nothing more to install; Cyber Pinball no longer asks you to install PinUP Player or PinUP Popper.
  The PuP-Pack player (PinUP Player) a table sometimes starts is no longer mistaken for PinUP Popper (no more false "PinUP Popper is open" alert), and it closes with the game.
  When it is there, it places its windows according to its own setting (`PinUpPlayer.ini`), written for another screen layout.
  During the game, Cyber Pinball places each PinUP Player window over the whole screen of its role, as it is at that moment: PinUP's screen 0 on the topper, 2 on the backglass, 5 on the FullDMD; the others stay where PinUP puts them.
  These screens are left to the PuP-Pack, and PinUP's setting isn't changed.
- **Game not possible**: game not found (the message points to "Future Pinball tables" to choose its folder), table file missing, or a path the command line couldn't pass (quote): said before any launch.
  A game that closes without opening a window (unreadable or refused table): "Future Pinball closed without opening the table", at once, with what to check in the game itself (its `.fpl` libraries, its version).
  With BAM, a launcher that stops before the game appears: "Future Pinball didn't open: its launcher (BAM) stopped first", and the message suggests starting `BAM\FPLoader.exe` yourself to check the table.
- **Table page**: what is specific to VPX stays in place, greyed out, with the reason: "Game parts" (the table fits in its `.fpt`), "Table files", "Settings for this table", "Adjust display in game", "DMD on the wheel", "Play and record", "Diagnose and fix", "Play with a friend", live games and the scoreboard ("Future Pinball scores: not read by Cyber Pinball yet").
  The Files section shows the `.fpt`, the game found (its folder, "BETA" pill, or "Not found on this PC" and where to choose it) and the "BAM" row: "Installed: the game starts through FPLoader; its settings are in its in-game menu", or "Not installed: the table plays without BAM (FizX tables need it)".
  "Remove table" moves the front-end's table to the recycle bin; the original, in the game's Tables folder, isn't touched.
  "Game media" and "Edit info" work as for a VPX table.
- **Diagnosis**: the diagnosis only reads VPX tables (script, ROM, PuP-Pack, backglass, VPX settings).
  A Future Pinball, Pinball FX or Pinball FX3 table gives no finding: never a "missing ROM" on a `.fpt`.
- **Code**: detection, table list, command (BAM included), adding, dmdext, PinUP Player windows and window placement in [packages/core/src/futurepinball.ts](../../packages/core/src/futurepinball.ts); archives in [packages/core/src/futurepinball-archive.ts](../../packages/core/src/futurepinball-archive.ts); the game's keys in [packages/core/src/futurepinball-keys.ts](../../packages/core/src/futurepinball-keys.ts); nudging in [packages/core/src/nudge-keys.ts](../../packages/core/src/nudge-keys.ts) and [app/src/nudge-keys.ts](../../app/src/nudge-keys.ts); "Future Pinball tables" screen in [app/src/futurepinball-ui.ts](../../app/src/futurepinball-ui.ts); game in [app/src/futurepinball-play.ts](../../app/src/futurepinball-play.ts) and `playPinballFx` (`app/src/frontend.ts`), shared launcher in [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts) (`FUTURE_PINBALL_LAUNCH_GAME`, `FUTURE_PINBALL_BAM_LAUNCH_GAME`), sending the keys in [app/src/zen-keys.ts](../../app/src/zen-keys.ts); table page in `app/src/library.ts`.
  Tests: `futurepinball.test.ts`, `futurepinball-play.test.ts`, `futurepinball-archive.test.ts`, `futurepinball-keys.test.ts`.
