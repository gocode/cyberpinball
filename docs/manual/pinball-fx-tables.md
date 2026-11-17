[Français](../manuel/tables-de-pinball-fx.md) · English · [Manual contents](../manual.md)

## Pinball FX tables

Cyber Pinball also launches **Pinball FX** tables (Zen Studios, 2023), bought on Steam or Epic.
**In beta**: the funnel entry and the table page's "Pinball FX" row carry the "BETA" pill, and the tables screen says so at the top.
Its tables aren't files: they are game content, identified by a number.
Each one gets a "Title (Manufacturer Year)" folder in the tables folder with an **entry file** `.pinballfx` (JSON: `{ "PinballFX": { "Table": 156 } }`), its `.info` and its media, like a VPX table; the wheel, collections, favourites, statistics and media therefore work the same way.

- **Adding your tables**: System menu > Tables > Add a table > **"Pinball FX tables"**.
  The list is Zen's catalogue (number, title; manufacturer and year of the Williams and Bally machines to find their media), sorted by title.
  As for a VPX table, Start first opens its **add page**: the table (number, VPS capture), then one card per media file with its preview and source (VPinMediaDB, a site entry linked by VPS with "Compte … nécessaire" (… account needed) when no account is signed in, the VPS capture for the playfield), and one "Introuvable" (Not found) card for those with no source; Start on a card takes or leaves out the media file (all those that come without an account are taken by default).
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
- **Game type**: in the title plate, a chip before manufacturer · year names the program that plays the table, for every table: "VPX" (grey outline) or "Pinball FX" (signal green); medallions (Juke-box, Community, Collections) have none.
  On a cabinet that mixes both, the collections have a "Types de jeu" (Game types) group (see Collections).
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
- **What Pinball FX doesn't provide**: no ROM or NVRAM, so no score board or ranking; no VR, no in-game settings, no DMD read by Cyber Pinball.
  Its screens, its external DMD (`DmdDevice64.dll` from dmd-extensions) and the per-table backglass image (`PinballFX\Mods\Cabinet\Table_<number>.png`) are set in the game's **cabinet mode**.
  On the table page, what doesn't apply stays in place, greyed out, with the reason: "Game parts", "Table files", "Settings for this table", "Adjust display in game", "DMD on the wheel", "Play and record", "Diagnose and fix", "Play with a friend", "Scoreboard".
  "Remove table" removes it from the menu; it stays in Pinball FX.
- **Code**: catalogue, detection and command in [packages/core/src/pinballfx.ts](../../packages/core/src/pinballfx.ts); entry files in [packages/core/src/tables.ts](../../packages/core/src/tables.ts) (`addPinballFxTable`, `tableFileEmulator`); launcher in [app/src/pinballfx-launcher.ts](../../app/src/pinballfx-launcher.ts), installation in [app/src/pinballfx-install.ts](../../app/src/pinballfx-install.ts), game in `playPinballFx` (`app/src/frontend.ts`), screens in `app/src/library.ts`.
  A table's script is only read from a `.vpx` (`app/src/vbs.ts`): an entry file has no ROM or PuP-Pack.
  Tests: `pinballfx.test.ts`, `pinballfx-launcher.test.ts` (simulated system).
  Internal off-screen demonstration with a fake Steam (`CYBERPINBALL_STEAM_SIMULE`).
