[Français](../manuel/tables-de-pinball-fx.md) · English · [Manual contents](../manual.md)

## Pinball FX tables

Cyber Pinball also launches **Pinball FX** tables (Zen Studios, 2023), bought on Steam or Epic.
**In beta**: the funnel entry and the table page's "Pinball FX" row carry the "BETA" pill, and the tables screen says so at the top.
Pinball FX3 ("Pinball FX Classic") has its own section: [Pinball FX3 tables](pinball-fx3-tables.md), and so does Future Pinball: [Future Pinball tables](future-pinball-tables.md).
Its tables aren't files: they are game content, identified by a number.
Each one gets a "Title (Manufacturer Year)" folder in the tables folder with an **entry file** `.pinballfx` (JSON: `{ "PinballFX": { "Table": 156 } }`), its `.info` and its media, like a VPX table; the wheel, collections, favourites, statistics and media therefore work the same way.

- **Adding your tables**: System menu > Tables > Add a table > **"Pinball FX tables"**.
  The list is Zen's catalogue (number, title; manufacturer and year of the Williams and Bally machines to find their media), sorted by title.
  As for a VPX table, Start first opens its **add page**: the table (number, VPS capture), then one card per media file with its preview and source (VPinMediaDB, a site entry linked by VPS with "Compte … nécessaire" (… account needed) when no account is signed in, the VPS capture for the playfield), and one "Introuvable" (Not found) card for those with no source; Start on a card takes or leaves out the media file.
  Taken by default are those that download nothing from a site (VPinMediaDB, VPS capture, file from an entry already received); a site entry to download has to be chosen, and its card says what will happen: its size (read on its page), "Pack commun à N tables" (Pack shared by N tables) when the VPS database files it under several games (Cyber Pinball only takes the table's file from it; no preview, it would show another table), otherwise the author's screenshot, and the site page opened for its waiting time, counted in the daily quota.
  In a received pack, the table's file is the one carrying its Pinball FX number ("Table_97.png", the community packs' convention), otherwise its title; never a pack thumbnail (`pthumbs`).
  Nothing is written before **"Ajouter au front-end"** (Add to the menu), at the top, which adds the table then downloads only the taken media in the background.
  A table already in the menu shows "In the menu" and Start opens its page.
  Cyber Pinball can't read which tables the player owns: the player chooses.
- **Images and media**: each catalogue table carries its VPS database game (`vps`, 133 tables out of 146 on 16/11/2026: the one with an "FX" version, otherwise, for a Williams or Bally machine, the machine's game).
  The list shows as a thumbnail the table capture VPS provides (downloaded without blocking the screen, in batches).
  The entry file gets that ID in memory as long as its `.info` gives no other: "Find missing media" and "Game media" recognise it, tables added earlier included.
  On adding, in the background and tracked in downloads: the missing VPinMediaDB media (`fillMissing` in `quiet` mode), then, without a playfield image, the VPS capture (`placeMissingMedia`, source noted in the `.info`).
  Nothing is replaced.
  What VPinMediaDB doesn't know (a Zen original, "Back to the Future Pinball"): logo, backglass and topper then come from the VPUniverse or VPForums entries the VPS database links to the game (`vpsSiteHits`, `.directb2s` files included: their image becomes the backglass, `b2sBackglassesBeside`), downloaded with the user's account through the sites queue; in a pack of logos, the file named after the table (`pickNamedMedia`), never a guessed file.
  With no account signed in, nothing is requested: the message says what is missing and where to sign in.
  The "Pinball FX tables" screen has a **"Chercher les médias manquants"** (Find missing media) entry for tables already in the menu.
- **Game type**: in the title plate, a chip before manufacturer · year names the program that plays the table, for every table: "VPX" (grey outline), or "Pinball FX", "Pinball FX3", "Future Pinball" (signal green); medallions (Juke-box, Community, Collections) have none.
  On a cabinet that mixes several, the collections have a "Types de jeu" (Game types) group (see Collections).
  The names come from `TABLE_ENGINES` (packages/core/src/tables.ts), the same in every language.
- **Finding the installation**: Steam (folder read from the user's registry, `libraryfolders.vdf`, manifest `appmanifest_2328760.acf` whose `StateFlags` carries flag 4, "fully installed": Steam writes the manifest as soon as the download starts), otherwise Epic (launcher `*.item` manifests, display name "Pinball FX").
  Nothing is remembered: a game installed later is seen right away.
- **Installing Pinball FX**: unlike VPX, Cyber Pinball downloads neither the game nor its tables: it's a commercial game, bought and downloaded on the player's Steam or Epic account.
  When it's missing, the funnel entry becomes **"Install Pinball FX"**: it runs `steam.exe steam://install/2328760` (Steam's install window, or the game's store page if it isn't on the account), otherwise the Epic launcher on `com.epicgames.launcher://store/p/pinball-fx`, and brings in front of Cyber Pinball the first Steam or Epic window shown within 20 s.
  The game's state is then read every 5 s (two hours at most) and the funnel redraws: "Downloading in Steam" (greyed out), then "Pinball FX tables".
  Neither Steam nor Epic: greyed out, with the reason.
  A table launched without the game says so and gives this path.
- **Launch**: `steam.exe -applaunch 2328760 -Table <number> -GameMode Classic` (Epic: the game executable with `-Table` and `-GameMode`), arguments documented by Zen.
  The game is recognised by its "PinballFX" window; the game lasts as long as its process lives.
  A Pinball FX left open is closed before the game.
  Pinball FX takes 20 to 25 s to open a table: after 120 s without a window, the game fails with its explanation.
- **Quitting**: quitting the table in the game goes back to its own menu; **holding Exit** (2 s) closes the game and returns to the wheel.
  The loading card says so; the shortcut that stops a stuck game works too.
- **Image rotation on a cabinet**: before each game, Cyber Pinball sets the game's forced display rotation (the game's Options > Video) in the same direction as its own playfield windows, for a player standing at the flipper edge.
  The table faces the player instead of staying in landscape.
  The setting is written to `LocalSettings.cfg` (`%LOCALAPPDATA%\PinballFX\Saved\PersistentDownloadDir\<store>\LocalSettings.cfg`, `video` section: `useForcedDisplayRotation`, and `forcedDisplayRotation` set to `Rot_90`, `Rot_180` or `Rot_270`), the rest of the file kept as it is.
  A PC whose playfield screen is upright keeps the player's setting.
  A game never opened on this PC doesn't have this file yet: the rotation is written before the next game.
  Pinball FX3 has no equivalent: its settings are encrypted (see [Pinball FX3 tables](pinball-fx3-tables.md)).
- **Buttons of a joystick cabinet** (Pinscape, encoder in gamepad mode): Pinball FX and Pinball FX3 only read the keyboard and Xbox controllers, not a joystick.
  During the game, each joystick button recorded by the wizard sends the game the key its Options > Controls > Keyboard screen expects for its role.
  Flippers on Left Shift and Right Shift, plunger and Start on Enter (launch, confirm), Exit and Pause on Esc (back, pause), left and right MagnaSave on the Up and Down arrows, left, right and forward nudges on Left Alt, Right Alt and Space.
  In the game's menus, the flippers move along the top bar, the MagnaSave buttons through the windows it opens, Start confirms and Exit goes back.
  During play, the Up and Down arrows are also the backglass view and Judge Dredd's right shot.
  Credit, coin door and tilt have no command in the game; the volume buttons stay with Cyber Pinball (Windows sound).
  The keys are only sent while the game is in the foreground, never twice to the front-end; any still held are released at the end of the game.
  At the end of each game, the log counts the presses sent to the game and those held back because the game was not in the foreground.
  The buttons of a keyboard encoder send their own keys, which the game receives as they are: Cyber Pinball doesn't touch them.
  Nothing to install (neither x360ce nor JoyToKey).
- **Screens during the game**: the front-end detects the screens the game draws on itself (backglass, DMD or topper of its cabinet mode), from the game's own windows only, never those of Windows or another program.
  It leaves them to the game: its window goes behind the game's, without taking the foreground from it, and its background stays still there.
  The other screens show their media according to "Médias pendant la partie" (Media during play) (see [Game media](game-media.md)).
  A game that changes a screen's resolution during play doesn't shift the front-end's windows: each one follows its role's screen, recognised by its identity and not by its old coordinates.
  A window found on another role's screen is logged and put back on its own.
- **What Pinball FX doesn't provide**: no ROM or NVRAM, so no score board or ranking; no VR, no in-game settings, no DMD read by Cyber Pinball.
  Its screens, its external DMD (`DmdDevice64.dll` from dmd-extensions) and the per-table backglass image (`PinballFX\Mods\Cabinet\Table_<number>.png`) are set in the game's **cabinet mode**; only its image rotation is written by Cyber Pinball.
  On the table page, what doesn't apply stays in place, greyed out, with the reason: "Game parts", "Table files", "Settings for this table", "Adjust display in game", "DMD on the wheel", "Play and record", "Diagnose and fix", "Play with a friend", "Scoreboard".
  "Remove table" removes it from the menu; it stays in Pinball FX.
- **Code**: catalogue, detection and command in [packages/core/src/pinballfx.ts](../../packages/core/src/pinballfx.ts); entry files in [packages/core/src/tables.ts](../../packages/core/src/tables.ts) (`addPinballFxTable`, `tableFileEmulator`); launcher in [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts), installation in [app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts), game in `playPinballFx` (`app/src/frontend.ts`), screens in `app/src/library.ts`.
  Rotation and button keys in [packages/core/src/pinballfx-cabinet.ts](../../packages/core/src/pinballfx-cabinet.ts) (`applyPinballFxRotation`, `ZEN_GAME_KEYS`), sending the keys in [app/src/zen-keys.ts](../../app/src/zen-keys.ts); screens during the game in [packages/core/src/gamescreens.ts](../../packages/core/src/gamescreens.ts) (`followDisplays`, `misplacedWindows`, `gameScreens`) and [app/src/game-screens.ts](../../app/src/game-screens.ts).
  A table's script is only read from a `.vpx` (`app/src/vbs.ts`): an entry file has no ROM or PuP-Pack.
  Tests: `pinballfx.test.ts`, `pinballfx-launcher.test.ts` (simulated system), `pinballfx-cabinet.test.ts`, `gamescreens.test.ts`.
  Internal off-screen demonstration with a fake Steam (`CYBERPINBALL_STEAM_SIMULE`).
