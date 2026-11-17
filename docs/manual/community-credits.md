[Français](../manuel/credits-de-la-communaute.md) · English · [Manual contents](../manual.md)

## Community credits

Tables, backglasses, PuP-Packs, DMD colours and sounds, toppers, media and rules are the work of the virtual pinball community.
Cyber Pinball names their authors without cluttering the game ([packages/core/src/credits.ts](../../packages/core/src/credits.ts); on screen, [app/src/credits-menu.ts](../../app/src/credits-menu.ts)):

- **The wheel**: under the title, the main author of the recreation, like a book's author: "Data East · 1990 · par TastyWasps" (by TastyWasps).
  The first author named (VPS and authors put the main team first); nothing when unknown.
- **A table's details screen**: the "Crédits" (Credits) entry, after "Prospectus et règles" (Flyer and rules), sums up ("Table de TastyWasps, JPSalas et 12 autres · fronton de HauntFreaks") and opens the **Credits** page: one line per role, in a column shared by the whole page, grouped from the real machine to the rules: **La machine** (The machine: designers and manufacturer from the VPS database; the ROM, played by PinMAME, stays with the manufacturer), **La table** (The table: the VPX recreation), **L'habillage** (Dressing: backglass, PuP-Pack, DMD colours, remastered sounds, music, topper, point of view), **Le menu** (The menu: media whose source is recorded: VPinMediaDB, a site, a friend's cabinet; the others on one "Provenance non notée" (Source not recorded) line), **Règles et explications** (Rules and explanations: game guide, card, author's text, rule sheet, video).
  A part that is present but unknown is still listed, greyed out, "Auteur non renseigné" (Author unknown) with the reason: never a guessed name.
- **A line with a page** (the one the part comes from: VPUniverse, VPForums…): while it is selected, its QR code sits under the actions, with its title ("Sa page sur VPUniverse", Its page on VPUniverse) and its address, to scan with a phone (`Action.qr`, computed for the selected item only).
  **Start opens it directly** in the built-in browser ("Récupérer" (Fetch) window, without a claim: a downloaded file goes to the waiting list as from a VPS page); the banner gives the table, the role and all its authors, and reminds you that a thank-you is welcome.
  Close (Esc) returns to the credits.
- **A line without a page but with more than four authors**: Start opens all its authors and what they made elsewhere on the cabinet.
- **The community**: System menu > Cyber Pinball > "La communauté" (The community) (also from the Credits page): the cabinet's authors, from most to least present ("HauntFreaks · 8 frontons · 4 tables"; 40 at most, then "… and N more"), each with their tables; then the software and sites without which nothing works (VPX, PinMAME, B2S, Serum, PinUP Player, DOF; VPS, VPinMediaDB, VPUniverse, VPForums, IPDB, The Pinball Primer).
  This ranking only reads the `.info` files (not the tables themselves), rebuilt at most every 30 s.
- **Attract mode**: the discreet line described in [Attract mode](game-media.md#attract-mode).

Where names come from, from most to least reliable (`tableAuthors`):

- **The source recorded at installation** from the catalogue: `CyberPinball.source` in the `.info` for the table (the VPS file, its authors, version and page), `CyberPinball.parts.<kind>` for each dressing part (`b2s`, `pup`, `altcolor`, `altsound`, `music`, `topper`, `pov`: VPS id, version, authors, page, database note, date).
  A replaced part takes the old one's place.
- **For the table only**: the recreation recognised in VPS from the author and version written in the table by its author (the author alone is enough only if they made a single recreation of that game), otherwise `Info.Authors` from the `.info` (filled at import), otherwise the author's text as is.
- **Media**: the author of a VPUniverse or VPForums entry is recorded with the media's source (`MediaOrigin.author`).
- A part installed before this version, or by hand, has no source: "Auteur non renseigné" (Author unknown).
  Reinstalling it from the catalogue (details screen > Gérer la table… (Manage table…) > Parties du jeu (Game parts)) records it.

Guest mode: the Credits page can be read (door `sheet.credits`); the built-in browser stays closed to guests (door `sheet.credits-web`: one can sign in and download there), so Start on a line with a page opens its authors and its QR code instead (the phone remote's QR block, with its own wording: it pairs nothing).
The community is in the system menu, closed to guests.

Tests: [credits.test.ts](../../packages/core/src/test/credits.test.ts) (source read and written without touching the rest of the `.info`, authors from most to least reliable, no guessed name, page groups, summary, attract mode line, community ranking), [uisounds.test.ts](../../packages/core/src/test/uisounds.test.ts) ("Mode attente" screen: each line comes back to itself).
