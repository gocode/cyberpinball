[Français](../manuel/base-vps.md) · English · [Manual contents](../manual.md)

## VPS database

When tables are added, each one is identified in the [VPS database](https://github.com/VirtualPinballSpreadsheet/vps-db) (Virtual Pinball Spreadsheet, file `db/vpsdb.json`, about 2,600 games), which is then used to name the folder "Title (Manufacturer Year)" and fill in the `.info`: `Title`, `Manufacturer`, `Year`, `VPSId` (the game identifier, shared by every version in the folder), `Authors` (those of the identified table version) and `IPDBId`.
Fields already present in an existing `.info`, or in one shipped with the archive, are kept.

- **License**: the `vps-db` repository declares no license (checked on October 20, 2026: no LICENSE file, `license: null` in the GitHub API, nothing on the website).
  Without a license, redistribution is not allowed, so Cyber Pinball does not ship the database.
  It is downloaded the first time a table is added, from its official address (`https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json`), and kept in `<racine>\downloads\vpsdb.json`, like the components.
  The tests use a hand-copied extract of a few games.
- **Updates**: at most every 12 hours, in the background, when "Ajouter une table" (Add a table) is opened; `lastUpdated.json` (a few bytes) tells whether the database has changed.
  Without a network, the cache is used as is; with neither cache nor network, names are derived from the files, as before.
  An invalid response never replaces the cache.
- **Matching** ([packages/core/src/vps.ts](../../packages/core/src/vps.ts)): based on the names of the `.vpx` files, of the `.directb2s` in the same package, of the archive and of the folders, and on the ROM read from the script.
  The VPUniverse numeric prefix is ignored; titles are compared regardless of case, accents and punctuation, with or without the article ("Addams Family" for "The Addams Family"), by main title ("Terminator 2" for "Terminator 2 - Judgment Day"), and "Dr." for "Doctor"; manufacturer and year break ties between games with the same name; authors ("VPW", "g5k", "Bigus") and version number identify the table version.
  The result is a list of games, each with a score between 0 and 1.
- **Confidence**: at 0.85 or more, with a lead of 0.08 over the next one, the game is picked without asking.
  Otherwise, the "Quel jeu est-ce ?" (Which game is it?) screen offers up to five games, plus "Garder" (Keep) for the name derived from the files (game not in the database); a game not in the database with no candidate gets the file name, without asking.
  From the plan, "Choisir le jeu" (Choose the game) or "Changer le jeu" (Change the game) reopens the screen for each table.
  Nothing moves until "Installer" (Install).
- Measured on the whole database (a made-up name "Name (Manufacturer Year).vpx" for each of the 2,366 games that have a VPX table): 99.7% identified first, no wrong certainty; the others are duplicates within the database.
