[Français](../manuel/tables-de-future-pinball.md) · English · [Manual contents](../manual.md)

## Future Pinball tables

Cyber Pinball also launches **Future Pinball** tables (Black Sheep Studios, 2005), next to the VPX tables, on the same wheel.
**In beta, first level**: the funnel entry and the table page's "Future Pinball" row carry the "BETA" pill, and the "Future Pinball tables" screen says so at the top.
BAM (FPLoader, head tracking, its settings) isn't supported yet: the table plays in Future Pinball alone.
The game's scores aren't read, and Cyber Pinball doesn't download Future Pinball tables.

A Future Pinball table is a `.fpt` file, like a `.vpx`: it gets a "Title (Manufacturer Year)" folder in the tables folder with its `.fpt`, its `.info` and its media; the wheel, collections, favourites, statistics and media therefore work the same way.

- **Finding the game**: Cyber Pinball looks for "Future Pinball.exe" in the usual places, on C:, D: and E:: `Games\Future Pinball`, `Future Pinball` at the root, `Program Files (x86)\Future Pinball`, `Program Files\Future Pinball`, `vPinball\FuturePinball`, `vPinball\Future Pinball`, `Visual Pinball\Future Pinball`, `PinballX\Future Pinball`.
  Elsewhere, **"Choose the Future Pinball folder…"** points to it: its executable's folder, the executable itself or its Tables folder.
  The choice is kept in `<data>\future-pinball.json` and comes before the usual places; **"Go back to the usual places"** forgets it.
  What is found isn't remembered: a game installed later is seen right away.
- **Adding your tables**: System menu > Tables > Add a table > **"Future Pinball tables"**.
  The screen shows the game found ("Found on this PC" or "Folder chosen by hand"), or "Not found" with the places searched, then the `.fpt` files in the game's Tables folder and its subfolders (two levels), sorted by name.
  A table already in the front-end shows "In the menu" and Start opens its page; Exit then goes back to this screen.
  Start on another table adds it to the front-end, in a "Title (Manufacturer Year)" folder of the tables folder.
  A folder that already holds another table (the same machine in VPX, another `.fpt`) stays its own: the Future Pinball table takes a folder ending in "Future Pinball", otherwise both would share their `.info` and media.
  The `.fpt` is **linked** there (hard link, on the same drive: no extra space) or **copied** (another drive, USB stick); the original, in the game's Tables folder, is never modified.
  Its name comes from the VPS database (games that exist in Future Pinball first, "FP" format) when it recognises it without hesitation, otherwise from the file name; title, manufacturer, year and VPS game go into the `.info`.
  When the VPS game is recognised, the missing front-end media (VPinMediaDB) then arrive in the background, tracked in Downloads.
  A table already there (same file name, same size) isn't added a second time.
- **A table kept elsewhere**: **"Choose .fpt files…"** (USB stick, Downloads, another drive), even without the game folder.
  A `.fpt` picked with the funnel's "Choose files…", or dropped on the window, goes through the same add; on its own, it opens the "Future Pinball tables" screen, which says what was done.
- **Launch**: `"Future Pinball.exe" /open "<table>.fpt" /play /exit`, started from the game folder (its `.fpl` libraries), with the `.fpt` in the table's folder.
  The game flow is Pinball FX's: loading, taskbars hidden, other open front-ends reported, statistics and level, back to the wheel.
  The game is recognised by the first visible window of its own process, never by a title a web page could carry.
  Quitting the table in the game closes it (`/exit`) and returns to the wheel; **holding Exit** (2 s) closes it too.
  The buttons reach the game as they are: unlike the Zen games, joystick buttons aren't turned into keyboard keys.
- **Window and screens**: opened as a window elsewhere than on the playfield, the game is moved onto it; in full screen, it stays where its preferences put it.
  Its screens and framing are set in its preferences (Video); "Adjust display in game" stays greyed out with that reason.
  As for the Zen games, the screens its extra windows draw on (backglass, DMD) are left to it, and the others show their media according to "Médias pendant la partie" (Media during play) (see [Pinball FX tables](pinball-fx-tables.md)).
- **Game not possible**: game not found (the message points to "Future Pinball tables" to choose its folder), table file missing, or a path the command line couldn't pass (quote): said before any launch.
  A game that closes without opening a window (unreadable or refused table): "Future Pinball closed without opening the table", at once, with what to check in the game itself (its `.fpl` libraries, its version).
- **Table page**: what is specific to VPX stays in place, greyed out, with the reason: "Game parts" (the table fits in its `.fpt`), "Table files", "Settings for this table", "Adjust display in game", "DMD on the wheel", "Play and record", "Diagnose and fix", "Play with a friend", live games and the scoreboard ("Future Pinball scores: not read by Cyber Pinball yet").
  The Files section shows the `.fpt`, the game found (its folder, "BETA" pill, or "Not found on this PC" and where to choose it) and the "BAM" row: "Not yet: the table plays without head tracking or BAM settings".
  "Remove table" moves the front-end's table to the recycle bin; the original, in the game's Tables folder, isn't touched.
  "Game media" and "Edit info" work as for a VPX table.
- **Diagnosis**: the diagnosis only reads VPX tables (script, ROM, PuP-Pack, backglass, VPX settings).
  A Future Pinball, Pinball FX or Pinball FX3 table gives no finding: never a "missing ROM" on a `.fpt`.
- **Code**: detection, table list, command, adding and window placement in [packages/core/src/futurepinball.ts](../../packages/core/src/futurepinball.ts); "Future Pinball tables" screen in [app/src/futurepinball-ui.ts](../../app/src/futurepinball-ui.ts); game in [app/src/futurepinball-play.ts](../../app/src/futurepinball-play.ts) and `playPinballFx` (`app/src/frontend.ts`), shared launcher in [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts) (`FUTURE_PINBALL_LAUNCH_GAME`); table page in `app/src/library.ts`.
  Tests: `futurepinball.test.ts`, `futurepinball-play.test.ts`.
