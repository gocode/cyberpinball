[Français](../manuel/medias-des-jeux.md) · English · [Manual contents](../manual.md)

## Game media

Each game can have its own presentation media: logo, playfield video, backglass, display, topper, loading video, music, launch sound, flyer and rules.
The menu shows each one on the intended screen at the right moment.
When a media item is missing, the menu shows a default display drawn by Cyber Pinball in its place: never an empty screen, never the Windows desktop.

A game's media go in its table's folder, in a `medias\` subfolder, and are named after the folder, `(Type) <nom du dossier>.ext`, as VPX 10.8.1 suggests: `medias\(Backglass) Terminator 2 (Williams 1991).mp4`.
The `.vpx` name works too, for media specific to one version.
The flyer and the rules can have several pages: `(GameHelp) <nom>.png`, then `(GameHelp) <nom> 2.png`, `… 3.png`.
No per-screen setting: each media item's screen, proportions and rotation come from the cabinet model.

| Type (file) | In the menu | What it is for | Where and when it is shown | Formats | Without a file |
| --- | --- | --- | --- | --- | --- |
| `(Wheel)` | "Logo" | Identifies the table in the menu list, on a transparent background. | Playfield: table list; attract mode | png, apng, webp, gif | the title as stylized text |
| `(Playfield)` | "Plateau" (Playfield) | The table in play, in the background behind the list. | Playfield, dimmed under the list; attract mode | mp4, webm, m4v, or an image | discreet teal smoked glass, no fake table visual |
| `(Backglass)` | "Fronton" (Backglass) | The game's backglass image or animation. | Backglass: selected table, loading, attract mode; during play if VPX leaves the screen free | mp4, webm, m4v, or an image | the lit image of the `.directb2s`, otherwise a card: title, manufacturer, year |
| `(DMD)` | "Afficheur" (Display) | Animation for the 4:1 display. | Narrow display (4:1), at the same moments as the backglass | same as the backglass | the "Afficheur large" media scaled down, otherwise the title in dots on a 128 × 32 grid |
| `(FullDMD)` | "Afficheur large" (Wide display) | 16:9 animation for a wide display. | Wide display (16:9), at the same moments | same as the backglass | the "Afficheur" media centered, otherwise the title in dots |
| `(Topper)` | "Topper" | The animated banner above the backglass. | Topper, at the same moments | same as the backglass | animated logo and Cyber Pinball brand, manufacturer and year |
| `(Loading)` | "Chargement" (Loading) | Video played while VPX loads the table. | Playfield, from the Start press until the game appears: full screen on a cabinet, in the 9:16 frame on a desktop | mp4, webm, m4v | backup loading screen: brand, title, manufacturer, year, progress bar |
| `(Audio)` | "Musique du jeu" (Game music) | The music of the selected table. | Backglass speakers, as long as the table is selected ("Musique des jeux" (Game music), on by default); in attract mode if attract-mode sound is set to reduced | mp3, ogg, m4a, flac, wav | the music taken from its ROM ([ROM music](#rom-music)), otherwise the cabinet music, otherwise silence |
| `(AudioLaunch)` | "Son de lancement" (Launch sound) | A short sound at launch. | Backglass speakers, once, on Start | same as the music | nothing (or the loading video's sound) |
| `(GameInfo)` | "Prospectus" (Flyer) | One or more pages presenting the game. | Playfield, on request: details screen > "Prospectus", page by page | png, apng, webp, jpg, jpeg, gif, mp4 | a card generated from the `.info`: title, manufacturer, year, authors |
| `(GameHelp)` | "Règles" (Rules) | One or more rule cards. | Playfield, on request: details screen > "Règles", page by page | same as the flyer | the rules found automatically (card and text from the `.vpx`, rulesheet, video), then the game controls |

`(Other)`, `(RealDMD)` and `(RealColorDMD)` (Popper, PinballX) have no screen in Cyber Pinball: they are read, kept and ignored.
Popper's old formats (`flv`, `f4v`, `avi`, `mov`, `wmv`, `mpg`, `mpeg`) cannot be played: the media doctor reports them, and the import leaves them aside.

For each screen, the menu takes the first media found: `(Type) <nom du .vpx>` (the `.vpx` name), `(Type) <nom du dossier>` (the folder name), VPinFE's fixed names (`bg.png`, `wheel.png`, `table.mp4`…), the `.directb2s` image (backglass only), the **cabinet shared media** `<racine>\media\(Type).ext`, and finally the default display.

### Adding media

- **Details screen > "Médias du jeu" (Game media)** (the simplest way, with the buttons or the mouse): each media item with its role, the screen and the moment it appears, a preview, and what the menu shows today.
  You take a file copied into `<racine>\import` (from a USB stick), pick it on this PC or drag it onto the window; you replace, remove, set the playfield half-turn and the game's volume.
  Nothing is written before "Enregistrer" (Save), which shows the plan first.
  See the Manager: "Médias du jeu" section.
- **With the table**: an archive containing media laid out the PinUP Popper way (`POPMedia\…\Wheel\<jeu>.png`), the PinballX way or the VPinFE way is recognized when the table is added ("Ajouter une table" (Add a table)); the media are renamed `(Type) <dossier>` in `medias\`.
  A media pack on its own, without a `.vpx`, completes an installed table.
  See "Importing media".
- **From a PinUP Popper or PinballX installation**: system menu > "Cyber Pinball" > "Migration" > "Reprendre les médias" (Import media, from PinUP Popper / PinballX).
  Everything is copied; the original installation is not modified.
- **By hand**: copy the file into `medias\` under the name `(Type) <nom du dossier>.ext`.
  The menu shows it immediately on every screen, without restarting (see "Live changes").
  The doctor (details screen > "Diagnostiquer et réparer" (Diagnose and repair)) reports a name that does not match the game, a file stored outside `medias\`, an unreadable format, proportions that do not fit the screen, and offers the rename.
- **Cabinet shared media**: a file `<racine>\media\(Type).ext`, with no game name, is used for every game that lacks that media type: a topper in your game room's colors, ambient music, a background video.
  It takes precedence over the default display.

- **Online, on demand**: "Chercher les médias" (Search for media) takes everything VPinMediaDB has for the game, with a plan to approve ("Media from VPinMediaDB").
  For one specific media item, "Voir les propositions" (See suggestions) shows every version found, online and on the cabinet, and you choose from the previews ("Suggestions for each media item and deep search").

### Flyers and rules

Details screen > "Prospectus" (Flyer) or "Règles" (Rules) (the number of pages is written under the action): the page fills the playfield screen, rotated for the player, whole and undistorted.
The flipper buttons go to the previous or next page, Start to the next one and then back to the details screen after the last page, Exit back to the details screen; with the mouse, the buttons under the page do the same.
A video page (`mp4`) loops, muted.
Without a file, the flyer is a sheet generated from the `.info` (a backglass-style card with the title, then manufacturer, year, authors, version, description).
Code: `sheetPages` ([packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)), the `pages` screen in `app/src/library.ts`, rendering by `renderPages` in `app/renderer/library.js`.

**Rules found automatically**.
The rules are no longer limited to the cards the user stored: Cyber Pinball looks for what explains the game by itself, and shows it before the controls, which are almost always the same.
Page order:

1. the table's rules cards (its `(GameHelp)` media); without them, the card the author stored in the `.vpx`, read without writing anything to the table's folder;
2. the rules text the author stored in the `.vpx` (`TableRules`), without the card it points to;
3. a public rulesheet: the one from The Pinball Primer that the VPS catalogue gives for the game (`tutorialFiles` field), otherwise the one from Pinball Rule Sheets (pinballrulesheets.com), matched in the site's list by manufacturer and full title (edition ignored; Stern before 1999 is Stern Electronics, another manufacturer).
   The text is split into pages of about 1,100 characters, each part under its heading ("(suite)" (continued) when it goes on); it shrinks to fit, never below 20 px at 1080; 80 pages at most, the rest is read on the site;
4. a tutorial video on YouTube known to VPS (a tutorial comes before an overview): its thumbnail, title, authors and a QR code to watch it on the phone;
5. the game controls, always last, with what each source gave: found, searching, or missing and greyed out with its reason (none for this game, no network, game not recognised in the VPS catalogue, catalogue not downloaded yet).

**Game guide**.
For a few games, a guide written for Cyber Pinball comes before everything else: a "Le but" (The goal) page, then one objective per page, and "Bonus et astuces" (Bonuses and tips).
Each page shows the playfield seen from above (the flat image stored in the `.vpx`, otherwise a playfield drawn from its walls, ramps, bumpers, targets and holes), the numbered shots in place, the shots from the flippers or the plunger, and in the margins the label of each shot on the page; the text below says what to do and what it is worth.
Shots are named after their element in the `.vpx`: their positions are read from the player's table (`readVpxPlayfield`).
The guide is matched by the VPS game; another recreation of the same game, where fewer than three quarters of the named elements exist, does not get it (badly placed markers would be worse than nothing).
The guide screen is drawn at a fixed size, portrait (1,080 × 1,860) or landscape (1,760 × 960) depending on the room, then scaled; it takes the whole booklet screen, the actions stay below.
Ten guides: Back to the Future, Terminator 2, Game of Thrones, Guardians of the Galaxy, Star Trek, The Walking Dead, The Goonies, The Matrix, City Hunter, 2001 - A Space Odyssey; written by Claude from each table's script, rulesheet and card, to be reviewed (each guide's "À vérifier", in the research notes).
Code: [packages/core/src/tableguide.ts](../../packages/core/src/tableguide.ts), guides in `packages/core/src/guides`, rendering in [app/renderer/guide.js](../../app/renderer/guide.js).
Tests: [tableguide.test.ts](../../packages/core/src/test/tableguide.test.ts).

Each page states its source under the text: the table, or the site, its address, and "en anglais" (in English) when the interface is not in English.
The sheets are written by communities and state no licence: Cyber Pinball ships none of them.
They are read on the player's machine when the game page opens, kept in `<data>\cache\regles` (read again after 30 days, the pinballrulesheets.com list after 7; without a network, the kept copy is used; a missing page is not asked for again before the delay).
The video thumbnail goes to the media cache (`regles-video-<id>.jpg`).
The search runs in the background when the game page opens, once per table (again if the `.vpx` changes); the booklet fills in when it returns.
The VPS game is the one the table names, otherwise the deep search when it is certain (`tableGame`), or, between tied leads, the only one with the manufacturer and year the table gives (Williams's 1991 Terminator 2 rather than "JP's Terminator 2", which has the same ROM); only the VPS database already downloaded is used, opening the rules never starts a download of the database.
With the mouse, "Commandes de la partie" (Game controls) jumps to the last page.
Code: [packages/core/src/tablerules.ts](../../packages/core/src/tablerules.ts) (reading pages, matching, cache), [app/src/table-rules.ts](../../app/src/table-rules.ts) (page order, sources), `renderHelp` in `app/renderer/library.js`.
Tests: [tablerules.test.ts](../../packages/core/src/test/tablerules.test.ts).


### In the menu windows

On the table menu, each menu window shows the media of the selected table (elsewhere, see "Outside the table menu: the default display").
The lookup follows this order (`resolveMedia`, [packages/core/src/medias.ts](../../packages/core/src/medias.ts)): `.vpx` name, folder name, VPinFE names, `.directb2s` image (backglass), cabinet shared media, then the default display.

| Screen | Media | Display |
| --- | --- | --- |
| playfield, behind the menu | `(Playfield)` | `cover`, darkened under the list; rotated so the media's flippers land on the cabinet's flipper edge (a portrait file has its flippers at the bottom, a landscape file on the right, as in Popper and VPinMediaDB) |
| menu list | `(Wheel)` | logo above the title of the selected table and in a fixed-size box in front of each title in the list (the title's initial when there is no logo); in the wheel, each table's medallion. Without a logo, the centre medallion writes the title (three lines at most) and the others carry the game's initial, large: shrunk to a neighbour's place, a name fell below the 20 px floor (13.6 px on a cabinet). Name and initial are never seen together: when a medallion leaves the centre, the name goes out in 60 ms, before being shrunk below 20 px, then the initial lights up (`fillWheelItem` and `placeWheelItem`, `app/renderer/frontend.js`; `.wheel-initial`, `frontend.css`) |
| backglass | `(Backglass)`, otherwise the lit image of the `.directb2s` | `contain` on black |
| DMD | `(FullDMD)` on a FullDMD screen, `(DMD)` on a DMD only ([DMD screen](vpx-plugins-backglass-pup-and-dmd.md#dmd-screen-fulldmd-or-dmd-only); without an answer, from the proportions of its zone), otherwise the other one | `contain` on black; around a strip, black |
| topper | `(Topper)` | `contain` on black |

- **Zones**: each role of a shared screen (backglass and DMD strip, DMD embedded in the playfield) has its own media in its zone.
- **Playback** (`app/renderer/media.js`): videos loop, muted, except the playfield background video when the "Son des vidéos du menu" (Menu video sound) setting asks for it (see "Menu sound"); 280 ms crossfade on table change; the media of the two neighboring tables on each side are preloaded, and a video you just left is kept ready for a while (eight items at most, four of them videos); the playfield background is paused under an opaque overlay (help, details screen, message); all videos are paused when the window is hidden.
  Fast navigation stacks nothing up: a layer still waiting for its first frame is dropped.
- **Default display** when there is no media or on a playback error: the components of `app/renderer/fallback.js` (task T3) as soon as `frontend.html` has loaded them (`window.CyberFallback`), otherwise a minimal display: title, manufacturer and year on black, shrunk until they fit their zone, and nothing on the playfield background.
  The drawn topper shows the brand and the **game's title** (two lines at most), not the manufacturer and year, which are already on the backglass and in the menu.
- **Background during play**, the "Médias pendant la partie" (Media during play) setting on the "Médias, son et attente" (Media, sound and attract mode) screen (system menu; Start moves to the next choice, saved in `<données>\medias.json`): **frozen** by default (first frame, drawn once on a canvas, with no video decoder open during play), **animated** (the playfield and the screens VPX occupies stay frozen), or **off** (black, with a discreet title).
  See "Loading and play".
- **`cyber-media://` protocol** ([app/src/media-protocol.ts](../../app/src/media-protocol.ts), rules in [packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)): the only path from the windows to the files (the CSP of `frontend.html` allows nothing else for images and videos).
  It only serves a media file (an extension from the catalog) placed directly in the `medias\` folder of a known table, in `<racine>\media\` or in the `.directb2s` image cache (`<données>\cache\medias\`), plus, one at a time, the files that "Médias du jeu" (Game media) previews before storing them (import folder, file picked on this PC, `allowPreview`); default displays are drawn by the window, with no file.
  Subfolders, escaping with `..`, alternate data streams, symbolic links and any other extension are refused (403).
  It answers range requests (206), which video playback needs.
  The address changes with the file's date and size: a media file replaced under the same name is not served from the cache.
- **Live changes** ([packages/core/src/mediawatch.ts](../../packages/core/src/mediawatch.ts)): a media file added, replaced or removed (any type: wheel logo, playfield, backglass, DMD, FullDMD, topper, loading video, music, launch sound, `.directb2s`) and a table added, renamed or deleted show up immediately on every screen, without restarting, whatever the path: "Médias du jeu" (Game media), "Chercher les médias" (Find media), suggestions, adding through "Récupérer" (Fetch), a file copied by hand.
  One single mechanism: the menu watches `<racine>\tables` and `<racine>\media` (recursive `fs.watch`, native on Windows); 400 ms after the last write (a copy produces a burst of them), it rescans the tables (`.vpx`, folder added or renamed) or forgets its resolved media (`MenuMedias.invalidate`; the `.directb2s` is read again while the previous image stays on screen, with no fallback in between), then sends its state to every window again.
  What VPX writes next to the tables during a game (`.ini`, logs) triggers nothing.
  In the wheel, a table already on screen keeps its place: only its content changes, the new logo replacing the old one (or the title) once loaded; the selection stays on the same table.
  Since file addresses change with their date and size, no screen keeps the old image: the `.directb2s` image cache is stamped the same way and the dimensions cache checks date and size, so there is nothing to repair at startup.
  A folder missing at startup (`<racine>\media`) is watched as soon as it exists (when the tables are rescanned); where watching is impossible (network drive), resolved media expire after 10 s.
- **`.directb2s` image**: extracted in the background, one table at a time, the first time the table comes up; the fallback shows in the meantime, then the image fades in to replace it.
- **Playback errors** (undecodable video, damaged image): reported by the window to the main process with the error code, written to the console and to the single log `<données>\logs\medias-erreurs.json` (format described in "The media doctor"), one entry per file; an entry disappears when the file changes.
  The doctor reports them.
- **Tests**: [mediaview.test.ts](../../packages/core/src/test/mediaview.test.ts) (addresses, allowed folders, rotation for each flipper edge, DMD or FullDMD, `.directb2s`, setting, error log, CSP and rendering hookups), [mediawatch.ts](../../packages/core/src/test/mediawatch.test.ts) (folder watch, new file after a change of each type, `.directb2s` re-read without a fallback, the real renderer's wheel showing a logo added to a table already on screen, without moving).

### The table menu on a desktop, from 5:4 to 16:9 and wider

On a desktop (playfield zone wider than tall, `html.menu-desktop`), the table's media sits in a 9:16 frame on the left, full height; the wheel or the list, and the information, are on the right.
Dimensions in reference pixels (`--u`, the zone height is 1080); the playfield frame never changes (x 64 → 627).
With a band wheel (Médaillons, Bandeau, Minimaliste, Arche), the game's backglass is on the right, the wheel at the bottom, and the layout follows the screen width (`app/renderer/frontend.css`, `html.menu-desktop[data-menu-band]`):

- **16:9 and wider**: a band 1236 wide (`--b` = 1236 / 1080 `--u`), 34 from the right edge; a 16:9 backglass above it, aligned with the top of the playfield, the wheel overlapping its bottom; the help bar is aligned with the bottom of the playfield.
- **From 16:10 to 16:9**: the whole group shrinks to the room left on the right of the playfield (a band of `min(1236, W − 684)`, its left edge at 650).
  The alignments stay: top of the backglass on the playfield's top, help bar on its bottom; the wheel overlaps the backglass less.
- **Narrower than 16:10** (3:2, 4:3, 5:4): **compact layout**, two zones.
  On the right of the playfield, a column from 675 to 64 from the edge; the 16:9 backglass at the top, the whole band at the bottom, both as wide as the column; between them, the empty space stays dark (from 26 in 3:2 to 313 in 5:4).
  Before, the backglass and the band kept their 16:9 dimensions and covered almost all of the playfield frame; only a strip of the playfield stayed visible (16:10 overlapped too).
- **Texts of a shrunk band**: each font size has a floor (`max()`), larger than drawn when the band shrinks: 20 px from 16:10; in the compact layout, 26 for the title (23 on the Médaillons plate, so that it fits there with manufacturer · year), 23 for a long title, manufacturer · year and the counter, 22 for the help (20 px are only 14 pixels on a screen 768 high).
  Manufacturer · year stack above the centered counter, the title above them, without touching.
  In the compact layout, the title fits on one line ("…"), across the column for Bandeau and Minimaliste (the Arche and the Médaillons keep their drawn slot: widened, the title crossed the medallions sliding along the Arche's legs); the name in the center medallion, on two lines at most; the Médaillons counter never wraps.
  The medallions' name and initial have their floor too (`--floor-text`, computed outside the wheel), including while the name leaves or reaches the center.
- **Nothing moves** from one table to the next: all these dimensions depend only on the screen size.
  At 16:9 and wider, and for the title list, the rendering is the same as before, pixel for pixel.
- **Proof**: [cadres-menu.test.ts](../../packages/core/src/test/cadres-menu.test.ts) checks that each menu frame belongs to its zone and that the guard sees two zones overlapping; [plancher-textes.test.ts](../../packages/core/src/test/plancher-textes.test.ts) redoes the computation of the wheel's floors.

### Outside the table menu: the default display

The cabinet screens (backglass, DMD or FullDMD display, topper, and the playfield background) only show a table's media while it is the subject.
Outside the table menu, nothing of the last table on the wheel stays on screen or keeps playing: every screen switches to the **Cyber Pinball default display**, silently, and going back to the wheel gives the selected table its media and music back.

| Open screen | Cabinet screens | Sound |
| --- | --- | --- |
| Table menu, attract mode | media of the selected (or shown) table | its music, or the sound of its video |
| Loading, game | media of the table being played (see "Loading and game") | launch sound, then VPX |
| A table's details screen and what opens from it ("Médias du jeu" (Game media) and its proposals, flyer, rules, "Fichiers" (Files), "Ce qu'il manque pour jouer" (What is missing to play), "Diagnostiquer et réparer" (Diagnose and repair), "Modifier les informations" (Edit details), that table's VPX settings, the file picker and on-screen keyboard opened from these screens) | media of **that** table: it is the subject, and you see what you are adjusting | its music |
| Failed game ("La partie n'a pas pu se dérouler" (The game could not run)) | media of the table that was played | its music |
| System menu and everything that opens from it (adding, catalogue, downloads, ROMs, settings, cabinet configuration, language, updates…), global VPX settings, controls help, messages, quit confirmation | default display | nothing |

- **Default display** (`defaultMediaView`, [packages/core/src/mediaview.ts](../../packages/core/src/mediaview.ts)): the one of each screen with no game title, which draws the brand in the art direction (`app/renderer/fallback.js`, teal black background, signal green rules): backglass with the brand's cover ("CYBER" above "PINBALL" in signal green, light, wide and widely spaced Saira, the art direction's illustration on the right, see [Brand backglass and DMD](#brand-backglass-and-dmd)); DMD display with the stacked brand in its dot font; FullDMD with the stacked brand inside its lamp frame (live menu DMD: the brand, PRESS START and the clock, see [Menu DMD](#menu-dmd)); topper with the logo and the brand; playfield background in smoked glass.
  No table file is read, no video runs; the display follows its screen (DMD only or FullDMD).
  Dark from the first frame: never white at the switch.
- **Rule** (`screensTable`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)): each menu phase states which table it is about, in an exhaustive table (a new phase does not compile until it is declared there).
  The system menu only keeps a table for a screen that declares it: a table's own screens (details, flyer, editing, doctor, removal) carry it, a described screen gives it when it opens (`openCustom(build, at, table)` in `app/src/library.ts`), an input or a notice keeps the one of the screen it opens from.
  Any new screen that says nothing gets the default display.
- **Trials**: the layer report (`cyberEtat()`) says "marque" (brand) for the default display with no table, "repli" (internal value) for the one of a table that lacks that media.
- **Tests**: [ecrans-par-defaut.test.ts](../../packages/core/src/test/ecrans-par-defaut.test.ts) (each phase, each screen, a renderer component for each, `frontend.ts` wiring).

### Menu sound

The menu sound comes from a single window, the playfield one (`app/renderer/menu-audio.js`).
The main process decides what to play at each moment (`menuSound`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)); everything is set in **System menu > "Médias" (Media) > "Médias, son et attente" (Media, sound and attract mode)** (`app/src/menu-settings.ts`), saved in `<données>\medias.json` and applied immediately.

| Moment | You hear | Setting (default) |
| --- | --- | --- |
| Navigation, the table's details screen, failed game | the selected game's music, `(Audio)` (otherwise the one taken from its ROM, then the cabinet's, `<racine>\media\(Audio).*`), looping | "Musique des jeux" (Game music): **on** by default, so the wheel is never silent after installation (turn it off for a silent cabinet in a living room); "Volume de la musique" (Music volume) (60%) |
| Navigation, game with no music or music off | the sound of the playfield background video | "Son des vidéos du menu" (Menu video sound) (40%; 0%: muted) |
| Loading | the launch sound, `(AudioLaunch)`, once; without it, the sound of the loading video | "Volume du lancement" (Launch volume) (80%) |
| Play | nothing: everything fades out as soon as VPX's game window appears | — |
| Attract mode | as during navigation, for the table being shown | "Son en attente" (Attract mode sound): **off** by default, or reduced (30% of the volume) |

- **One sound at a time**: the game's music, otherwise the sound of the playfield video; never both.
  A screen that lets you listen to sounds (music suggestions, [Table sounds](#table-sounds)) silences the menu while it is open.
  The backglass, display (DMD or FullDMD) and topper videos are **always muted**, on purpose: several videos with sound at once would be a cacophony, and it is also PinUP Popper's usual setting.
  VPinMediaDB videos have no audio track anyway (`table.mp4` and `dmd.mp4` checked on the cabinet): a game's sound there is a separate file, its music (`audio`, about 650 games out of 1,150), stored as `(Audio)`.
  A game with no music whose playfield video has no sound therefore stays **silent in the menu**, whatever "Son des vidéos du menu" (Menu video sound) says, even if its display is animated (the case of *Guardians of the Galaxy* on the reference cabinet: no `(Audio)`, no sound in `(Playfield)` or `(FullDMD)`, and no music on VPinMediaDB).
  To hear it: give it music (details screen > "Médias du jeu" (Game media) > "Musique du jeu" (Game music): "Sons de la table" (Table sounds) to take one from its PuP-Pack, see [Table sounds](#table-sounds), or a `medias\(Audio) <dossier>.mp3` file), or add cabinet music `<racine>\media\(Audio).mp3`, played for every game that has none; "Musique des jeux" (Game music) must be "jouée" (on).
  A ROM table with no music gets its ROM's music by itself ([ROM music](#rom-music)).
- **Per-game volume**: each volume is multiplied by the game's relative volume (details screen > "Médias du jeu" (Game media) > "Volume de ce jeu" (This game's volume), `CyberPinball.medias.volume` in the `.info`), without exceeding the maximum.
  A game set to 50% plays its music at 30% when the setting is at 60%.
- **Transitions**: on table change, the old music fades out (700 ms) and the new one only starts if the table stays selected for 350 ms: scrolling through the list plays nothing.
  A video's sound follows its crossfade.
  At launch, the music stops and the launch sound starts.
- **Output**: the backglass output in the cabinet model (the setup wizard's "Son" (Sound) step; it is also the output for VPX music, `SoundDeviceBG`), otherwise the playfield one, otherwise the Windows default output.
  It is found among Chromium's outputs by its Windows name (the "(vid:pid)" suffix of USB outputs is ignored), then music, launch sound and videos are sent to it (`setSinkId`).
  Output not found: the default output.
  For this, the menu windows have the `media` and `speaker-selection` permissions and playback without a user gesture (`autoplayPolicy`), like the wizard.
  **All of Cyber Pinball's sound** uses this output, not just the menu's: the Windows default output is not necessarily connected to the cabinet (on a PinCab, often an HDMI screen with no speakers; for example, the wheel and the launch played on the cabinet, but not the sounds offered in "Médias du jeu" (Game media)).
  The sounds and videos of the library screens are sent to it as soon as they are created (`CyberMenuAudio.route`, `app/renderer/library.js`), and any audio or video element of the window that starts playing without going through it is sent there (`play` event, in the capture phase).
  So are the web pages of the "Récupérer" (Get) window (YouTube, previews), frame by frame (`audioSinkScript`, `packages/core/src/audiosink.ts`, run at each `did-frame-finish-load`): Electron has no per-window output.
  Its hidden views, and those of media conversion, stay muted.
- **Windows desktop** (windows minimized): **no sound at all from Cyber Pinball**, then everything resumes on return.
  Desktop mode mutes every page of the application (`webContents.getAllWebContents`, `setAudioMuted`): the menu windows, but also the juke-box player and any other view without a window of its own, and a page opened during desktop mode starts muted (`web-contents-created`).
  On return, sound comes back only to the pages it muted: those already muted (offscreen, headset, hidden views) stay muted.
  Before, only the menu music went silent by itself (hidden page) and the juke-box kept playing on the desktop.
- **Off screen**, every application window is muted (`createWindow`, `app/src/offscreen.ts`): an unattended test makes no noise.
  After each step, the autopilot records what would have played (`CyberMenuAudio.status()`: file, volume, playback, output, video sound) and what each screen shows (`cyberEtat()`: phase, position, table shown in attract mode, and for each media layer the displayed item, video playing or paused, image, frozen image or fallback) in `son.txt`, next to the screenshots.
- **Tests**: [menumoments.test.ts](../../packages/core/src/test/menumoments.test.ts) (settings and hand-written values, volumes, sound for each moment, menu output, sound media resolved on disk, rendering hookups, muted windows off screen), [sortie-audio.test.ts](../../packages/core/src/test/sortie-audio.test.ts) (invariant: every rendering script that creates a sound routes it, every web page view is muted or routed; sound offered in "Médias du jeu" (Game media) on the cabinet output in the real rendering; web page script).

### Interface sounds

Eleven sounds punctuate the menu, on top of the music: four pinball noises, a chime, a ding, a signal, the opening breath and the three tunes of badges and levels, never cutting or lowering it (`app/renderer/ui-sounds.js`).
The registry, what triggers each sound and the rule deciding whether it plays are in [packages/core/src/uisounds.ts](../../packages/core/src/uisounds.ts) (`UI_SOUNDS`, `uiSoundCue`).

| Sound | When | Source and licence |
| --- | --- | --- |
| Solenoid click (`solenoid`) | a neighbouring table in the table menu (left and right buttons, or a click on the wheel) | WebAudio synthesis written for Cyber Pinball (filtered metallic strike, dull body of the coil, plunger return); Cyber Pinball's code licence, no recording |
| Coin drop (`coin`) | Start on "Jouer" (Play): launching a game (not the display adjustment) | WebAudio synthesis (bounces of a metal disc, inharmonic modes, drop into the cash box); same licence |
| Knocker (`knocker`) | back from a game in which a score entered the table's high-score list (`VPReg.stg`, see "High scores") | WebAudio synthesis (hammer on the wooden cabinet, cabinet resonance); same licence |
| Coil thump (`coil`) | cinematic launch: the moment VPX takes over (its game window holds the foreground, see [Cinematic launch](#cinematic-launch)) | WebAudio synthesis (a dry, dull 125 ms "thunk": a filtered noise contact, a muffled body falling from 145 to 95 Hz, a hint of metal around 650 Hz); same licence |
| Invitation chime (`invite`) | a friend invites you to a live game, in the menu as well as during a game (see "Live game" in [Friends](friends-the-cabinet-network.md#community-the-cabinet-network)) | WebAudio synthesis (three rising bell notes, A, C sharp, E, 110 ms apart, with their bell partials; 0.6 s, no reverb): the only musical sound of the registry, far from the tables' mechanical knocks, it can be recognised over VPX's music; same licence |
| Game-with-friends ding (`news`) | news of a game with friends, in the menu as well as during a game: a guest accepts or declines, a player leaves, the game is over (see "Game with friends" in [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)) | WebAudio synthesis (two soft bell notes rising a fourth, E then A, 120 ms apart, half as loud as the chime and without its metal attack; 0.45 s, no reverb): from the chime's family, but news, not a call; same licence |
| Friend signal (`friend`) | a friend just came online, in the menu as well as during a game; once per friend in a quarter of an hour, never for a reconnection within the presence tolerance (see "Everywhere, even in a game" in [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)) | WebAudio synthesis (a single soft note gliding up, from 520 to 780 Hz in 70 ms, with a hint of octave; 0.25 s, no reverb): neither bell nor knock, it is mistaken neither for the chime nor for the ding; same licence |
| Opening breath (`intro`) | the startup opening (and "Voir l'ouverture", See the opening), when its animations start; not when an opening music has been chosen, which has the floor | WebAudio synthesis (a filtered breath rising with the spark, from 400 to 5,200 Hz in 1.25 s, then at ignition a soft glassy chord, A, E, B, C sharp, over a falling bass; 3.1 s, no reverb); dated by the main process (`hitAt` = start of the animations + `INTRO_TIMELINE.ignition`), it starts 1.25 s before the ignition, counted on the animations' clock rather than when the message arrives, once the output is awake and its latency subtracted: the chord lands on the playfield's flash; same licence |
| Badge chime (`badge`) | a common badge earned, back on the tables screen, timed to its animation (see [Levels and badges](levels-and-badges.md#levels-and-badges)) | WebAudio synthesis (a short breath, then as the badge arrives an arpeggio of FM bells, C, E, G, C, over a soft pad; small ticks while the XP count up; 4.2 s, with reverb); same licence |
| Badge fanfare (`badge-rare`) | a rare, epic or legendary badge earned, back on the tables screen, timed to its animation | WebAudio synthesis (a rising breath, a deep impact as the badge arrives, an arpeggio, then F, G, C chords under the text; ticks while the XP count up; 5.6 s, with reverb); same licence |
| Level up (`level-up`) | the level rises, during a badge moment or on its own | WebAudio synthesis (two bell notes rising a fourth, G then C; 1.6 s, with reverb); same licence |

- **Settings**: **System menu > Médias (Media) > "Médias, son et attente" (Media, sound and attract mode)**: "Sons de l'interface" (Interface sounds; on by default; Start turns them off or back on, and plays the click) and "Volume des sons de l'interface" (Interface sound volume; 50% by default; choosing plays the coin).
  Saved in `<données>\medias.json` (`uiSounds`, `uiSoundsVolume`).
- **Never during a game**: the main process requests no sound during a game or in attract mode (`uiSoundCue`); the window, for its part, refuses any sound while the state says "game in progress", silences anything still ringing and closes its audio context: no stream is open on the output while VPX plays.
  The coin drops during loading, before VPX takes the screens.
  The one exception is the **handover** sound (`handover` in `UI_SOUNDS`: the coil thump alone): requested at the very moment VPX takes over, it starts at the beginning of the game and rings out there (125 ms), then the audio context closes; the window only accepts it for `coil`, even if another sound claimed to be a handover sound.
  The second exception is a **call** sound (`call` in `UI_SOUNDS`: the invitation chime alone): a friend's invitation awaits an answer, it rings once during the game; the window only accepts it for `invite`.
  The third exception is the sounds of **notifications that also show during a game** (`notice` in `UI_SOUNDS`: the ding and the friend signal): each rings with its notification, once, unless "Masquer les notifications pendant les parties" (Hide notifications during games, System menu > Community) is on; the window only accepts `invite`, `news` and `friend`.
  All follow the interface sounds setting and volume: turned off, they are silent too.
- **Output**: the menu sound's output (see [Menu sound](#menu-sound)), passed on by `menu-audio.js`; the audio context closes four seconds after the last sound.
- **Fast scrolling**: the same sound does not start again within 45 ms; each table passed clicks, without a machine-gun effect.
- **Licence**: no excerpt from a real pinball machine and no sound of uncertain rights; each sound is computed on the fly by WebAudio, with no file.
  An added recipe must be too, or come from a CC0 sound whose source is recorded in `UI_SOUNDS`.
- **Adding a sound**: its identifier in `UI_SOUND_IDS`, its entry (name, trigger, source, licence) in `UI_SOUNDS`, its recipe in `RECIPES` in `ui-sounds.js`, the `playUiSound('<id>')` call in `app/src/frontend.ts`, and its row in this table.
  The test rejects a sound with no recipe, no trigger, or missing from the manual.
- **High scores**: the knocker sounds back from a game when a score has entered the table's high-score list.
  High scores are read before launch and on return (`readTableRecords`, `newRecords`, [packages/core/src/highscores.ts](../../packages/core/src/highscores.ts), the same source as the menu DMD) from what VPX 10.8.1 keeps for the table: `<dossier de la table>\user\VPReg.stg`, where VPW tables and most original tables save `HighScore1..N` and their initials.
  **Not covered**: PinMAME tables whose ROM keeps its own high scores (`nvram\<rom>.nv`, a raw image of the game's memory, to be read with each ROM's map); for them, the knocker does not sound.
  Without a reading before the game (missing or unreadable file, or several tables in the same file with no name to tell them apart), nothing is compared and nothing sounds: a high score is never assumed.
- **Off screen** the windows are muted; `CyberUiSounds.status()` reports what would have played (sound, volume) and whether the window is muted, recorded in `son.txt` by the autopilot (`interface` field).
- **Tests**: [uisounds.test.ts](../../packages/core/src/test/uisounds.test.ts) (nothing plays when off, at 0%, in attract mode or during a game, on both sides; recipe, trigger and manual row for each sound; knocker wired to the high scores before and after the game; each sub-screen of "Médias, son et attente" returns to its own row).

### Loading and play

What each screen shows from launch to the end of the game (`momentScreen`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts); rendering in `app/renderer/frontend.js`):

| Moment | Playfield | Other screens |
| --- | --- | --- |
| Loading (from Start until VPX's game window appears) | on a cabinet, the game's `(Loading)` video alone, full screen and rotated according to the flipper edge; on a desktop, the same video in the menu's 9:16 frame on the left, with the panel holding the title and the game's controls on its right; without it, the backup loading screen in its place (`fallback.js`: brand, title, manufacturer, year, progress bar) | the game's media, animated, until VPX's windows cover them |
| Play | first frame of the playfield background, under VPX | a screen VPX **does not occupy**: according to "Médias pendant la partie" (Media during play) (frozen by default, animated, off); a screen it **does occupy** (`.directb2s` backglass, PinMAME DMD, PuP): frozen, since it cannot be seen and must cost nothing |

- **Loading screen** (`loadingScreen`, `app/renderer/frontend.js`).
  **On a cabinet** (playfield zone taller than wide, `html.menu-cab`), the playfield suits the loading media: it fills the whole screen, alone, with no title, no "Chargement de la table…" (Loading table…) and no controls.
  Without media, the backup loading screen replaces it, full screen, without its label (`fallback.js`, option `label: false`).
  The one exception, the in-game display adjustment (details screen > "Régler l'affichage en partie" (Adjust the display during a game)) keeps its reminder, the buttons of VPX's menu (`loadingKeys.display`), as a banner over the media or under the fallback's progress bar.
  **On a desktop** (`html.menu-desktop`), the loading media (or its fallback) takes the place of the menu's media, in the 9:16 frame on the left (531 × 944 at x 80, y 92, for a short side of 1080); on the right, a single panel (`loadingCard`) uses the frame's measurements: same top, same height, same edge, 80 from the screen's edge, and a gap of 60 from edge to edge, the frame's own distance to the screen's edge.
  It holds, in the flow, the title (64, or 48 for a long title; two lines at most), manufacturer · year, "Chargement de la table…" (Loading table…) and its signal-green progress bar, then, after a rule, the game's controls; whatever space is left stays below them.
  The controls (`fitLoadingCard`) take the most readable layout that fits without cutting anything off: two columns (at least 440 wide each) with no key split over two lines, otherwise one column, otherwise two columns with split keys, at a size of 24, 22 then 20 (the design system's floor); then a compact panel (32 margins, title at 48); only as a last resort, a size below the floor rather than a hidden control (a dozen joystick buttons in a 5:4 window).
  The brand stays in its place, top left.
  The layout is rebuilt if the window changes shape.
  Layout guard (`app/src/layout-check.ts`, `html.loading-phase`): on a cabinet, no interface text over the media; on a desktop, the panel does not cover the frame, edges included, and the fallback sits exactly in the frame.
  Tests: [chargement.test.ts](../../packages/core/src/test/chargement.test.ts) (the real renderer under linkedom, measurements from `frontend.css`).
- **Slow loading** ([packages/core/src/loadingprogress.ts](../../packages/core/src/loadingprogress.ts)). 8 s after Start (`LOADING_SLOW_MS`) without the table on screen, the desk PC loading screen says so, in its panel: the **step actually observed** ("Cyber Pinball prépare la partie" (Cyber Pinball is preparing the game), "VPX est lancé : il charge la table" (VPX is running: it is loading the table) once the process has started, "VPX a ouvert ses fenêtres : la table finit de charger" (VPX has opened its windows: the table is finishing loading) as soon as a VPX window appears before the game's, `onWindows` in `launcher.ts`), the elapsed time ("depuis 12 s" (for 12 s), counted by the renderer every second) and how to stop ("Ctrl+Maj+K ou Exit : arrêter" (Ctrl+Shift+K or Exit: stop)).
  No percentage, no bar moving with time: nothing is estimated.
  The step replaces "Chargement de la table…" (Loading the table…) in the panel, the time and the stop under the bar.
  **On a cabinet, nothing**: the playfield keeps the loading media alone, with no controls or step (the layout guard still refuses any text on the cabinet loading screen).
  Exit, once the 8 s have passed, and Ctrl+Shift+K at any time during loading stop the launch, through the forced stop door (`game.force-stop`, open to guests): before VPX is launched, it is not launched; afterwards, it closes (polite close, then forced after 5 s); the wheel comes back, with no failure message and no game counted.
  The log says "Lancement : la table n'est pas à l'écran 8 s après le Start (…)" and "Lancement : arrêté pendant le chargement (…)".
  Offscreen, `CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS` makes the simulated game slow.
  Tests: [chargement-lisible.test.ts](../../packages/core/src/test/chargement-lisible.test.ts).
- **Occupied screens**: as soon as the game window appears, then every 2 s, the Windows window stack is read again (`occupiedRoles`): a role is occupied when a window from another process covers at least half of its zone (the whole screen, or its share of a shared screen: DMD strip under the backglass, embedded DMD) above the Cyber Pinball window.
  The console says so: "Partie : écrans occupés par VPX : backglass, dmd." (Play: screens occupied by VPX: backglass, dmd.)
- **Focus**: none of this shows a window or brings one to the foreground; only the state sent to the menu windows changes, and they stay behind VPX's windows (screen guard).
- **Simulated game** (off-screen tests only): `CYBERPINBALL_PARTIE_SIMULEE=<rôles occupés>` ("backglass,dmd", or empty) replaces VPX with a fake game (`simulateVpx`, `app/src/launcher.ts`): loading, a 10 s game with the autopilot, return to the menu, without launching anything or grabbing a global shortcut.
  On screen, the variable is ignored.

### Startup intro

When Cyber Pinball opens, each screen of the cabinet plays its intro animation, once, then **holds its last frame** (the playfield keeps going in a very subtle loop); the first button (or a click) shows the wheel.
A button during playback skips the intro.
Setting **System menu > Médias (Media) > "Médias, son et attente" (Media, sound and attract mode) > "Ouverture au démarrage" (Startup intro)**: played by default, or off (the menu opens straight on the wheel).
Saved in `<données>\medias.json`, field `intro`.
Code: [packages/core/src/intro.ts](../../packages/core/src/intro.ts) (settings, files, timing, views), [app/renderer/intro.js](../../app/renderer/intro.js) and `intro.css` (the animations), [app/src/intro-menu.ts](../../app/src/intro-menu.ts) (the settings screen).

| Time since the start | Playfield | DMD / FullDMD | Backglass | Topper |
| --- | --- | --- | --- | --- |
| 250 – 1,700 ms | a spark rises from the bottom of the screen along a thread of light; at 1,250 ms, ignition at the core: flash, anamorphic streak, ripple, and some thirty threads of light unfold into a spindle | power-on: random dots (DMD) or one round of the lamp frame (FullDMD), then the ball crosses the display from bottom to top (950 ms) | black | black |
| 1,250 – 3,100 ms | pulses run along the threads, which slow down without stopping; the brand takes shape in luminous dust, from the middle outwards (1,950 ms) | the brand is drawn behind a sweeping line (1,350 ms); FullDMD: PRESS START (2,500 ms) | the artwork flickers on like its lamps, then the brand letter by letter | a streak of light crosses it (2,300 ms) and leaves the logo and the brand |
| 3,400 – 4,100 ms | a gleam passes over the brand | a gleam passes over the brand's dots | a gleam passes over the brand | a gleam passes |
| then | the loop, with no jump from the last frame: the threads of the spindle keep turning, very slowly, and the glowing dust drifts on three depths (the far ones finer, blurrier and slower), with a slight sway; "Appuyez sur un bouton pour choisir une table" (Press a button to choose a table) appears (4,300 ms), pulses twice and stays | last frame | last frame | last frame |

- **When**: at startup only, when the menu lands on the wheel (`introAtStartup`); not on a message to deal with (VPX missing, buttons to redo, no table), nor when choosing a configuration, nor when the menu relaunches itself (language, configuration: `--sans-ouverture` option), nor under the test autopilot (unless `CYBERPINBALL_OUVERTURE=1`).
  The animations start together once every menu window is ready (at most 5 s after they open): until then, black.
- **The Cyber Pinball animations are part of the application**: they are drawn by the renderer (CSS, SVG, dots; the playfield by WebGL2 at full resolution, with the brand as text on top), in each screen, at any aspect ratio, turned for the player on the playfield until the fade that removes them is over (the rotation is carried by the animation, `.media-fallback.facing-player`, not by the page's phase: nothing flips to landscape for a moment at the first button); no file carries them, nothing can delete them.
  The cabinet's DMD plays the 4:1 display one or the FullDMD one, depending on its screen.
  The playfield plays the "Soie" (silk) intro of the approved mock-up (11/11/2026): the same formulas, the same curves, the same timings, drawn by the graphics card (WebGL2, about 6 ms per frame in 4K; the mock-up's 2D canvas cost 160 and stuttered), with the adaptive pacing of the first intro (the canvas loses a quarter of its size, down to 1,920 pixels, if the card cannot keep up); without WebGL2, the same drawing in a 2D canvas, at most 1,920 pixels.
  The spindle's waist is tighter and its twist stronger than in the mock-up, so that the threads cross at the centre, and one thread in six is signal green (teal at the waist, green towards the edges), as in the first intro.
  Forty-six threads of light in a spindle weave up from the bottom (0.1 to 2.4 s), a spark rises to the spindle's waist (1.2 to 2.4 s), the anamorphic ignition opens at the centre (2.4 s: a flattened flash, the horizon line, a glow over the whole screen), "CYBER PINBALL" appears, spreading out and coming into focus (2.5 to 3.4 s); the prompt appears under the spindle at 3.9 s (`timeline.hint`) and breathes between 40 and 85%.
  The drawing is measured in units of a 1080 × 1920 playfield: on a desktop PC (playfield wider than tall), the unit follows the height, the spindle stays in the centre, the horizon line and the dust run from edge to edge; only a backglass intro image or video chosen by the player takes its place, full screen.
  "Redémarrer Cyber Pinball" (Restart Cyber Pinball, system menu) replays the intro like a startup; relaunches after a language or configuration change skip it (`--sans-ouverture`).
  Timing written once (`INTRO_TIMELINE`), sent to the windows with their state: the playfield's ignition lights the backglass and the DMD brand (2.4 s), the ball crosses the DMD while the spark rises.
  At the end, only the playfield keeps going: the threads turn slowly and the dust drifts on three depths, at the animation's canvas size (no jump in sharpness), at 30 frames per second at most, 20 then 15 if the graphics card cannot keep up, stopped under the night veil and when the window is hidden.
- **Your images, videos and music**: for each screen (Plateau (Playfield), Fronton (Backglass), Topper, Afficheur (DMD), Afficheur large (FullDMD)), "Choisir une image ou une vidéo…" (Choose an image or a video…; file picker, or a file dropped on the screen) copies the file to `<racine>\media` as `(IntroPlayfield)`, `(IntroBackglass)`, `(IntroTopper)`, `(IntroDMD)`, `(IntroFullDMD)` (mp4, webm, m4v, png, apng, webp, jpg, gif); a file put there by hand works too.
  A video plays once and holds its last frame (the loop belongs only to the Cyber Pinball animation: your file is never animated or restarted); an image fades in; the playfield is turned according to the flipper edge, like its media.
  An unreadable file gives way to the Cyber Pinball animation.
  "Musique de fond" (Background music; `(IntroAudio)`: mp3, ogg, m4a, flac, wav) loops until the first button, at the music volume, independent of the animations and of "Musique des jeux" (Game music); without it, a playfield intro video keeps its sound (at the menu video volume), the Cyber Pinball animations are silent.
- **Going back to the Cyber Pinball animation** (per screen) or **"Tout revenir aux animations de Cyber Pinball"** (Back to the Cyber Pinball animations everywhere; no music) deletes nothing: your file stays in `<racine>\media`, the screen says so ("gardé, prêt à reprendre", kept, ready to use again) and "Votre fichier : …" (Your file: …) takes it back.
  A file replaced by another goes to the root's trash (`<racine>\trash\<date> Ouverture`), never deleted.
- **"Voir l'ouverture"** (Watch the intro) plays it right away on every screen; a button goes back to the settings ("Appuyez sur un bouton pour revenir aux réglages").
- **During the intro**: the wheel is not there yet, the screens are about no table (`intro` phase of `screensTable`); no live DMD, no attract mode, no interface sound; short notices (configuration recognised, update installed) wait for the wheel.
  A cabinet left on the intro is free for the schedule's stop.
- **Tests**: the `cyberEtat()` report says `ouverture` (number, started, each scene mounted with its time and whether it reached the end, prompt shown).
  Tests: [intro.test.ts](../../packages/core/src/test/intro.test.ts) (settings, files, filing to the trash, nothing deletes the animations, startup, run, views, sound, buttons, real renderer: black before the start, each role's scene, video played once without restarting, prompt).

### Cinematic launch

On Start on "Jouer" (Play), the launch plays like the opening of a film, on every screen of the cabinet: the game logo lights up in the middle of the playfield and flies up to the backglass, a spot of light crosses the DMD, the logo lands on the backglass and waits there; when VPX takes over, a coil thumps and everything fades.
Setting "Lancement en cinéma" (Cinematic launch) in **System menu > Médias (Media) > "Médias, son et attente" (Media, sound and attract mode)**: on by default; Start turns it off (loading goes back to what it was: no logo, no pass over the DMD, no coil thump) or back on (the coil thump plays).
Saved in `<données>\medias.json`, field `cinema`.
The in-game display adjustment (game page > "Régler l'affichage en partie") has no cinematic launch, just as it has no coin.

| Time since Start | Playfield | DMD (live) | Backglass |
| --- | --- | --- | --- |
| 0 – 240 ms | the logo appears in the middle, over the loading media; a short ripple leaves it | the table title, the ball at the end of the rail | its media |
| 240 – 340 ms | it pulls back a notch, like a ball drawn back by the plunger | the ball shakes by one dot | |
| 340 – 740 ms | it shoots up (towards the backglass) and leaves the screen | | |
| 660 – 900 ms | the loading media, alone | a 9-dot disc of light crosses the display from bottom to top, then a 40 ms flash | the backglass dims (800 – 1,080 ms) |
| 840 – 1,200 ms | | the title and the rolling ball (loading) | the logo enters from the bottom, barely overshoots, lands; a ripple as it lands (1,200 – 1,600 ms) |
| then | | | the logo waits, a halo breathes behind it |
| VPX takes over | VPX covers the screen | VPX takes the display | coil thump; logo and dimming fade in 240 ms |

- **VPX never waits for the animation.**
  The choreography starts on Start and lives in the menu windows that are already open: CSS animations (`frontend.css`, "Lancement en cinéma") and the live DMD's `lancement` animation.
  The main process only keeps its state (`LaunchCinema`, [packages/core/src/cinema.ts](../../packages/core/src/cinema.ts)), set on Start and read by each window with its state (`viewFor`: `cinema` field), with no waiting and no timer: VPX starts at the same moment as with the setting off (after the loading screen, `CYBERPINBALL_LOADING_MS`, 2.5 s by default), which the console states for every game, with what took that time ("Lancement : VPX lancé 2731 ms après le Start (écran de chargement 2500 ms, préparation 224 ms ; lancement en cinéma joué)." — the preparation is the screens being re-read, the PuP-Pack and the FullDMD dressing; nothing else is left).
  If VPX takes over in the middle of the choreography, it stops there: whatever had not started yet never starts.
- **The handover is a real signal**, never a delay: the launcher ([app/src/launcher.ts](../../app/src/launcher.ts), `onForeground`) reads the foreground window on every pass (250 ms); as soon as VPX's game window holds it, the coil thumps, once per launch (`LaunchCinema.handover`).
  If Windows never gives it the foreground, it does not thump.
  The logo and the dimming fade as soon as the game window appears ("game" state), usually on the same pass.
- **Screens in sync**: each window counts from the time of Start (`startedAt`); a window that sets up the choreography late picks it up at the right point.
  The timing is written once (`CINEMA_TIMELINE`, cinema.ts); the stylesheet and the DMD follow it, which the test checks.
- **Where**: on the playfield, the `#cinema` layer, turned like the menu (up is the backglass, from the flipper side); on a cabinet the logo only passes through (under a second), then the loading media stays alone, as the loading screen requires.
  On a desktop it starts from the media's 9:16 frame and leaves it through the top; the title and controls panel does not move.
  On the backglass, its zone (its own window, or its part of a shared screen).
- **Fallbacks**: without a logo (or an unreadable one), the wheel's medallion, dark with a chrome ring, with the title (three lines at most).
  Without a backglass, the logo still flies off and leaves the playfield: nothing waits for it elsewhere, loading stays the same.
  Classic or absent DMD: no pass.
  Interface sounds off: no coil thump, the rest plays.
- **Never a light screen**: no window is opened for the cinematic launch; everything happens in the menu windows, on their dark backgrounds, and the fade only touches the cinematic layer.
- **Design**: ignition with no bounce, a single small deceleration on landing, short thin ripples, backglass dimmed to 64 %, a calm halo while waiting; the DMD in its orange matrix (9-dot disc, core 14, 10-dot trail, a local flash at 15 only).

### Living medallions: Jukebox and Community

The Jukebox and Community medallions are animated (maintainer's choice, 11/13/2026).
Their inside is drawn live in a canvas, under the shared chrome ring ([app/renderer/medaillons-vivants.js](../../app/renderer/medaillons-vivants.js), `CyberMedaillons`):

- **Jukebox, "Onde" (Wave)**: three Silk threads (signal green, teal, violet) weave in a spindle around the round badge with the note; a spark runs along the green thread.
- **Community, "Montée" (Rise)**: the same round badge, with the green player; behind it, violet, blue or green chat bubbles rise, each carrying an emoji (friendship, competition, scores) or three dots.
  The emojis come from Windows' color font (Segoe UI Emoji); no flags, which Windows shows as two letters.
- **Collections, "Éclat" (Burst)**: the same round badge, with the signal-green favourites star.
  Behind it, small violet, blue or green stars leave the badge one after another and fly to the edge while turning, like a favourite being added; they grow, then fade before the ring.
- **Volume**: a soft highlight at the top left and a light shadow at the bottom right, over the inside.

**In the wheel**, each medallion is a canvas placed in the ring's hole (80.65 % of the ring image), under the ring as an image (`img.wheel-img`, `medaillons/contour-512.webp`): the wheel's green halo and light circle fit the ring, as they do for a logo.
Only the center medallion is animated, and it restarts from its first frame when it arrives there; its neighbors stay on their first frame (with the "Logos animés : tous" (all animated) setting, all of them animate).
The picture stays still when Windows asks for reduced motion, and nothing is drawn while the window is hidden (a single `requestAnimationFrame` loop for every canvas).

**Jukebox**: on the cabinet's playfield, the living medallion heads the playlist, its threads behind the title.
On the poster (backglass, playfield behind the wheel), the threads cross the whole poster, passing behind the medallion; the vinyl, orbit and light line of the former decor are removed.
For a track without a clip, on the backglass, the threads move behind the cover and the title.
The track's progress bar becomes a green thread, wavy over the played part, with the spark as the playhead.
A clip keeps the whole backglass.
No pulse on the beat: while playing, the threads wave at a constant amplitude; when paused, they settle almost flat.

**Still images**: `medaillons/juke-box.png`, `communaute.png`, `collections.png` and their 512 px WebP versions are the first frame of these insides, drawn from the same code by the generator (`npx electron docs/design-system/src/medaillons.cjs`, `CyberMedaillons.paint`).
They are used where the medallion stays still (the Jukebox's entrance cinematic), and as a fallback without a canvas.

**Tests**: [medaillons-vivants-chromium.test.ts](../../packages/core/src/test/medaillons-vivants-chromium.test.ts) opens the real menu page in an off-screen Chromium, with the three medallions in the wheel, each in turn at the center.
It checks that the ring covers the canvas centered in its hole, that the center medallion animates and its neighbors stay still, with no error and no refusal from the security policy.
A second test lays out the Jukebox header and its bar with the real style sheet: no glow touches the edge of its canvas.
Each canvas overflows its element to give a `b`-pixel blur its 1.5 `b` reach, and the threads' amplitude is capped by that room (`reach`, `TRACK_PAD`).

### Wheel: its settings

Every setting of the tables wheel is on one screen, **Menu système > Tables > Roue** (System menu > Tables > Wheel), next to Collections (request of 12/11/2026).
They were mixed with sound and attract mode in System menu > Médias (Media) > "Médias, son et attente" (Media, sound and attract mode), which keeps sound, attract mode, the DMD and media.
Code: [app/src/wheel-settings.ts](../../app/src/wheel-settings.ts); everything is kept in `<data>\medias.json` and applies at once.

- **"Présentation du menu"** (Menu layout; Start: the list): Medallions wheel (default), Banner, Minimal, Arch, or the list of titles (`menuLayout`).
- **"Ordre des tables"** (Table order), **"Table au démarrage"** (Table at startup) and **"Start sur la roue"** (Start on the wheel): see [below](#table-order-and-startup-table).
- **"Logos animés"** (Animated logos; Start: toggle): **only the chosen table** (default) or **all** (`wheelMotion`, `selected` or `all`).
  An animated logo (animated APNG, GIF or WebP) only moves in the centre of the wheel; its neighbours show its first frame, still, and resume the animation when they reach the centre.
  With "all", each one moves as before.
  The first frame is taken once per logo (`CyberMedia.stillLogo`, [app/renderer/media.js](../../app/renderer/media.js), through `ImageDecoder`, whose header alone tells whether the file is animated: a still logo is only partly read) and laid over the animated logo (`attachStill`, [app/renderer/frontend.js](../../app/renderer/frontend.js), class `.wheel-still`); away from the centre, the stylesheet no longer draws the animated logo, so Chromium no longer animates it.
  Until the still frame is ready, the animated logo stays: never an empty spot.
  The logos of the list and of attract mode do not change.
  For this, the menu page's security policy (`frontend.html`) allows reading media files (`connect-src cyber-media:`) and `blob:` images: without them, the reading was refused and every logo kept moving (pre-release 0.1.11-essai.12).
  A still frame that cannot be made says so in the console ("Logo animé : première image impossible"), and any Cyber Pinball page that has content refused by its security policy notes it in `<data>\logs\erreurs.txt` (`journalPolicyViolations`, [app/src/uncaught.ts](../../app/src/uncaught.ts)); the off-screen runs' layout guard then fails ("politique de sécurité de la page").
  Proof in a real off-screen Chromium, with the real page and animated APNGs: [roue-logos-chromium.test.ts](../../packages/core/src/test/roue-logos-chromium.test.ts).
- **"Couleur de chaque table au menu"** (Colour of each table in the menu): see [Colour of each table in the menu](#colour-of-each-table-in-the-menu).
- **"Juke-box dans la roue"** (Juke-box in the wheel; Start: toggle): the Juke-box medallion at the head of each collection (default), or hidden (`jukebox`).
- **"Communauté dans la roue"** and **"Collections dans la roue"** (Community and Collections in the wheel; Start: toggle): the Community and Collections medallions, shown by default (`community`, `collectionsMedallion`).

The collections the wheel shows are chosen in **Menu système > Tables > Collections** (System menu > Tables > Collections).
Tests: [roue-reglages.test.ts](../../packages/core/src/test/roue-reglages.test.ts).

### Juke-box settings

Every setting of the Juke-box is on one screen, **Menu système > Médias > Réglages du Juke-box** (System menu > Media > Juke-box settings), right after the Juke-box management, and also as the "Réglages du Juke-box" line at the top of that management, where Exit leads back (request of 13/11/2026: configuring the Juke-box, not managing its content).
Code: [app/src/jukebox-settings.ts](../../app/src/jukebox-settings.ts), [packages/core/src/jukebox-audio.ts](../../packages/core/src/jukebox-audio.ts); everything is kept in `<data>\medias.json` (`jukeboxAudio`, `jukeboxVisualizer`, `jukebox`) and applies at once, even to the song playing.

- **"Sorties du son"** (Sound outputs; Start: the list): the Windows outputs (virtual ones such as the headset's left out, like in the "Son" step), the cabinet's first.
  With no setting, the Juke-box plays on the menu output (the backglass one, see the "Son" step), sound untouched: that is the factory setting, on the same path as before (`setSinkId` alone).
  Start on an output opens its screen:
  - **"Juke-box sur cette sortie"** (Juke-box on this output): yes or no.
    Adding an output keeps the one that was playing (sound is added, never moved); the last active output cannot be cut (greyed, with its reason).
  - **"Volume"**: 0 to 100 %, relative to the other outputs; the overall volume stays the cabinet's (Volume buttons).
  - **"Profil"** (Profile): **complet** (full, untouched), **basses seules** (bass only, below 120 Hz, two low-pass stages: for a subwoofer), **médiums et aigus** (mids and highs, above 120 Hz: small speakers next to a subwoofer), **personnalisé** (custom): **"Basses"** (low shelf 200 Hz), **"Médiums"** (peak 1 kHz), **"Aigus"** (high shelf 4 kHz), from −12 to +12 dB in 3 dB steps; outside the custom profile these three lines are greyed.
  - **"Retard"** (Delay): 0 to 200 ms, to line up an output that sounds earlier than the others.
  - **"Écouter cette sortie"** (Listen to this output): five seconds on this output alone, with its settings: two bass pulses, a chord, cymbals, then all together, synthesised on the spot (no file).
  - **"Revenir au réglage d'usine"** (Back to the factory setting) in the list empties `jukeboxAudio`.
- **"Visualiseur du Juke-box"** (Juke-box visualiser; Start: next mode): Pochette, Multicolore, Classique (moved from "Médias, son et attente").
- **"Juke-box dans la roue"** (Juke-box in the wheel): the same setting as in Tables > Roue.

**How the sound is split.**
Electron sends an element to one output only, and each sound card has its own clock.
As soon as the plan is more than the menu output with untouched sound, each output has its own `AudioContext` placed on its card (`setSinkId`, found by its Windows name like everywhere else), with its chain (filters, delay, gain): its card clocks it ([app/renderer/audio-routes.js](../../app/renderer/audio-routes.js), `CyberAudioRoutes`).
The player's element plays on the first output; each other output reads its own copy of the song, which follows it (play, pause, seek) and stays aligned within 20 ms, through a speed corrected by one thousandth at most without changing the pitch, or a jump beyond 300 ms; each card's lead (`baseLatency`, `outputLatency`) is compensated.
Never a `MediaStreamDestination` played by an `<audio>`: Chromium keeps realigning that stream to the card's clock, and the song seemed to slow down then speed up (test of 13/11/2026 on the PinCab, pre-release 0.1.11-essai.42).
A new plan rebuilds the chains and copies: the song does not restart.
The DMD spectrum then reads the graph's analyser.
The main process sends the plan with each state of the clip (`jukeboxRoutes`); for the YouTube player, the same engine is replayed in its page and laid on its video at each probe (`onlineRoutesScript`), redone if YouTube changes the element; one video only, no copy possible: the other outputs receive its stream (`captureStream`), each in its context placed on its card ("stream" mode).
With the headset in use, everything follows the headset as before; the cabinet outputs wait.
The log notes the real output of each song ("Juke-box : t4 joue sur …"), an output that cannot be found ("(introuvable)"), and the YouTube player's routing.

Tests: [jukebox-audio.test.ts](../../packages/core/src/test/jukebox-audio.test.ts) (factory setting, adding, last output, filters, damaged file), [jukebox-reglages.test.ts](../../packages/core/src/test/jukebox-reglages.test.ts) (screens, buttons, return to the line), and [jukebox-sorties-chromium.test.ts](../../packages/core/src/test/jukebox-sorties-chromium.test.ts), in a real off-screen and muted Chromium: a 440 Hz tone goes through the graph, two branches with their filters, a new plan without stopping the song, the test excerpt.

### Table order and startup table

Three settings of **Menu système > Tables > Roue** (System menu > Tables > Wheel), kept in `<data>\medias.json` (fields `tableOrder` and `startTable`); code: [packages/core/src/tableorder.ts](../../packages/core/src/tableorder.ts), applied by `app/src/frontend.ts` each time the tables are read.

- **"Ordre des tables"** (Table order; Start: the list of choices): how the medallions follow each other on the wheel, and the titles in the list.
  **By title** by default (A to Z, as before), **last played first**, **most played first** (from `User.LastRun` and `User.StartCount` in the `.info`, which Cyber Pinball keeps up to date at each launch; a table never played goes to the end), **by year** or **by manufacturer** (then by year; unknown at the end), or **shuffled at every start**: a random order drawn when the cabinet starts, kept until the next start (a table added in the meantime takes a random place without moving the others).
  On a tie, the title decides.
  Changing the order keeps the selected table.
- **"Table au démarrage"** (Table at startup; Start: next choice): **the first one** in the chosen order (by default, as before), **at random** (the cabinet doesn't always open on the same table), or **the last one played** (to pick up where you left off).
- **"Start sur la roue"** (Start on the wheel; Start: next choice): **open the game page** (default, as before), or **play right away**: releasing Start launches the chosen table, without going through the game page.
  The game page stays two gestures away: Start held for 0.7 s (`WHEEL_START_HOLD_MS`, `packages/core/src/tableorder.ts`; it opens without waiting for the release, and another button during the press cancels it) and F6 on a keyboard; the cabinet's MagnaSave buttons stay on changing the collection.
  The help line says "Start : jouer · Start tenu : fiche" (Start: play · Hold Start: game page), the controls reminder (H) "Jouer la table choisie" (Play the chosen table) and "Fiche de la table : Start maintenu, ou F6" (Game page: hold Start, or F6); a click on "Start : jouer" or on the table in the centre plays at once.
  Kept in `medias.json` (`wheelStart`).

Attract mode still draws its tables at random, whatever the order, among those of the active collection (below).
Tests: [ordre-des-tables.test.ts](../../packages/core/src/test/ordre-des-tables.test.ts).

### Collections and favourites

The order sorts the tables; a **collection** picks some of them.
The wheel, the list, the counter and attract mode only show the tables of the active collection.
Code: [packages/core/src/collections.ts](../../packages/core/src/collections.ts) (the collections, the cut list, favourites), [app/src/collections-menu.ts](../../app/src/collections-menu.ts) (the active collection, the table kept in each one, the MagnaSave buttons), drawn in `app/renderer/frontend.js` (`fillShelf`, `placeCollections`) and `frontend.css` ("Collections").

- **The collections**, in this order: **"Toutes les tables"** (All tables); **"Favoris"** (Favourites); **"Récentes"** (Recent), the last 10 played, most recent first (from `User.LastRun`); **"Jamais jouées"** (Never played: neither `User.StartCount` nor `User.LastRun`); **"Avec mes amis en ligne"** (With my online friends), the tables at least one online friend has in the same version (what the friends network already knows of their libraries, like "Jouer avec un ami"); then, on a cabinet that mixes several programs, one per **game type** (**Visual Pinball X**, **Pinball FX** marked "bêta" (beta); group "Types de jeu" (Game types), `engine:vpx`, `engine:pinballfx`); then one per **manufacturer** (A to Z, "Bally" and "bally" are one) and one per **decade** ("Années 1990", the 1990s).
  Each keeps the chosen "Ordre des tables", except Recent.
- **The marker**: "☆ FAVORIS │ 1 / 4", the collection shown and the place of the selected table in it, in place of the former counter.
  On the Médaillons wheel, it sits in an inset drawn on top of the title cartouche, set back under the wheel: the lower arc passes in front of its top edge (background layer of `roues/medaillons.svg`, drawn from `docs/design-system/src/roues/medaillons.svg` by `roues.mjs`).
  Each other wheel draws its own too: under the Bandeau's blade and under the Minimaliste's line, which pass in front of its edge; under the Arche, a small plate between the medallions and the title.
  The counter no longer keeps its place under manufacturer · year: on a narrow desktop, the title no longer rises up to the marker; in the list layout, at the head of the rows.
  Its place and size depend neither on the table nor on the collection: changing table only changes the number, changing collection the name.
- **Changing collection**: **left or right MagnaSave** on the wheel, previous or next collection, applied at once, looping; an empty collection is skipped.
  Only the marker changes: no list shows over the wheel any more (removed on 11/13/2026, the Collections medallion replaces it).
  With the mouse: a click on the marker goes to the next one.
  To see all the collections: the **Collections medallion** (below) or **Menu système > Collections** (System menu > Collections, at the top of the system menu, and in Tables), the same list with the flippers and Start.
- **The Collections medallion** (11/13/2026): on the wheel, after the Juke-box and Community, the last of the leading medallions, right before the first table.
  Its name in green, below it the number of collections and the one the wheel shows.
  Start (or a click at the center of the wheel, or a tap on the phone) opens the **list of collections**, the same as System menu > Collections, with the cursor on the collection shown: Start on a collection shows it on the wheel, on the table it remembers; Exit goes back to the medallion.
  It also holds "Nouvelle collection…" (New collection…), "Gérer mes collections…" (Manage my collections…) and "Boutons des collections" (Collection buttons).
  Selected on the wheel, it shows its **poster**, like Community: behind the wheel and on the backglass, the number of collections and tables, the collection shown, a few others, and "Start · Choisir une collection" (Choose a collection).
  It can be hidden in System menu > Tables > Wheel ("Collections dans la roue", Collections on the wheel); it disappears when guest mode imposes a collection or closes the choice of collections.
- **Collection buttons**: on the Collections screen, "Boutons des collections" (Collection buttons) waits for two presses, the previous collection then the next: any cabinet button (a Pinscape board's joystick included) or keyboard key, except the flippers, Start and Exit.
  They come before MagnaSave; "Remettre les MagnaSave" (Back to MagnaSave) forgets them.
  Kept in `<data>\collections.json` (field `keys`).
  Without chosen buttons, the MagnaSave buttons recorded by the "Boutons" step; a MagnaSave not recorded (optional button) takes its default keyboard key (Left Ctrl, Right Ctrl).
  At startup the log says which keys change collection ("Touches des collections : …").
- **My collections**: personal collections, named as you like.
  "Nouvelle collection…" (New collection…, on the Collections screen, or a table's page > "Ajouter à une collection…", which creates it with that table) asks for a name with the on-screen keyboard; "Ajouter à une collection…" (Add to a collection…) on the page ticks or unticks the table in each one; "Gérer mes collections…" (Manage my collections…) renames or deletes (the tables stay on the cabinet).
  They come after the fixed collections, under "Mes collections", in their creation order; their tables in the menu order.
  Kept in `<data>\collections.json` (field `mine`: id, name, tables by their path in the tables folder).
  Closed to guests (door `sheet.collections`).
- **The table kept**: each collection remembers its table; you find it again when you come back.
  A table that left the collection (removed from favourites) gives its place to its neighbour; a collection that became empty gives back All.
  The active collection is kept from one start to the next (`<data>\collections.json`); "Table au démarrage" picks the table in it.
- **Favourites**: "Ajouter aux favoris" (Add to favourites, or "Retirer des favoris") on a table's page; a filled white star sits before the title, on the wheel as on the page (never green; its place is kept outside favourites, the title doesn't move).
  It is the `User.Favorite` field of the `.info` (1 or 0), the one other frontends write: a table taken over from another installation keeps its favourite, even when the table here already has its statistics (`mergeFavorite`, tableimport.ts).
- **Guest mode**: its screen (Menu système > Borne > Mode invité) offers "Tables proposées" (Tables offered): all (MagnaSave stays free), or a non-empty collection (Start: next choice).
  Restricted, the locked menu only shows that one: the padlock replaces the marker's icon, the help no longer mentions MagnaSave, and a MagnaSave press only shows the "Verrouillé" hint (door `menu.collection-locked`).
  The choice is kept with guest mode (`<data>\mode-invite.json`, field `collection`); on unlocking, the previous collection comes back.
  Adding or removing a favourite is closed to guests (`sheet.favorite`).

Tests: [collections.test.ts](../../packages/core/src/test/collections.test.ts), [medaillon-collections.test.ts](../../packages/core/src/test/medaillon-collections.test.ts).

### Attract mode

After a while with no button pressed on the table menu, the cabinet shows itself off (`AttractMode`, `pickAttractTable`, [packages/core/src/menumoments.ts](../../packages/core/src/menumoments.ts)):

- **Delay**: "Mode attente" (Attract mode) (5 min by default; 1, 2, 3, 5, 10, 15 or 30 min; **never**).
  The countdown restarts with every button press and every click, and when you come back to the table menu: it never runs on the details screen, the help, a message, a settings screen or during a game.
- **Tables**: a table drawn at random every N seconds ("Table suivante en attente" (Next table in attract mode), 20 s by default), never the table selected in the menu nor one of the last ones shown (about a third of the tables), so that every table eventually comes up.
  Each screen shows that table's media; the playfield shows its background (less darkened than in the menu), its logo or, failing that, its title as a backup logo (`fallback.js`), manufacturer and year, and "Appuyez sur un bouton pour revenir au menu" (Press any button to return to the menu).
- **Exit**: the first button, whichever it is, or a click, returns to the menu as it was, with no other effect: the selection does not move, Start does not open the details screen, Exit does not open the system menu.
- **Sound**: "Son en attente" (Attract mode sound) is off by default; when set to reduced, the music of the table shown (or its video's sound) plays at 30% of its volume.
- **Credits**: a discreet line at the bottom of the playfield, above the prompt, says who made the table shown: "Table TastyWasps, JPSalas et 12 autres · Fronton HauntFreaks · Couleurs Enthusiast" (the known ones, two lines at most; see [Community credits](community-credits.md#community-credits)).
  "Crédits de la table" (Table credits): shown by default, or hidden (`<data>\medias.json`, `attractCredits` field).
- **Its settings, in one place**: System menu > "Médias" (Media) > "Médias, son et attente" (Media, sound and attract mode) > **"Mode attente"** (Attract mode) opens a screen of its own (`ATTRACT_ROWS`, [app/src/menu-settings.ts](../../app/src/menu-settings.ts)): delay, next table, sound, table credits, cabinet schedule.
  The "Médias, son et attente" line sums them up ("une table toutes les 20 s · son coupé · crédits affichés").

### Cabinet schedule

Like an arcade cabinet, the cabinet lives on its own when nobody is playing (attract mode, above), and a schedule rules its day (`ArcadeHours`, [packages/core/src/arcadehours.ts](../../packages/core/src/arcadehours.ts); in the menu, [app/src/frontend.ts](../../app/src/frontend.ts) and [app/src/arcade-hours.ts](../../app/src/arcade-hours.ts)).
System menu > "Médias" (Media) > "Médias, son et attente" (Media, sound and attract mode) > "Mode attente" (Attract mode) > **"Horaire de la borne"** (Cabinet schedule); the settings go into `<data>\medias.json` (`hours` field).

- **Cabinet schedule: off** by default.
  While off, its settings stay visible and editable ("Settings kept; no effect while the schedule is off").
- **Night**: "Night starts" (23:00) and "Night ends" (8:00), in whole hours; the night spans midnight.
  Equal start and end are refused in the list ("choose two different times"), rather than an invented 24-hour night.
  Local time; a clock change follows the wall clock.
- **Screens during night attract mode**: at night, in attract mode only, a black veil covers every window (media, zones, menu, prompt included): **black veil at 50, 70 (default) or 85%**, **black screens** (100%) or **screens unchanged**.
  It comes down in 4 s and lifts at once at the first button.
  Under black screens, once the veil is opaque, the videos stop and the table shown no longer changes.
  Attract mode is **silent at night**, whatever this choice.
  With attract mode set to "never", there is no veil (the settings screen line says so).
- **Automatic stop**: at a time (2:00 by default) or **never**; **stop mode**: **sleep** (default) or **shutdown**.
  At that time, if the cabinet is **free** (attract mode running, or in the menu with no button for the attract delay, 5 min at least; never during a game, a loading screen, the Windows desktop or another power action), the playfield shows a **30 s warning** above the veil: "Going to sleep in 22 s" (or "Shutting down in"), a draining gauge, "Press a button to keep the cabinet on".
  At zero, the stop goes through the power module (section "Shutting down, sleeping, restarting the cabinet"): the same plain black screen on every screen, settings saved before acting, `SetSuspendState` or `shutdown.exe`.
  The warning is repeated neither on the DMD nor by a sound.
- **The slightest button gives control back**: during the warning, a button or a click removes it at once, with no other effect (like leaving attract mode); the cabinet stays on as long as it is used.
  A game in progress holds the stop back: it waits until the cabinet is free again, with a new full warning, until the **end of the night**; after that, it is no longer made and the stop is scheduled for the next night.
  Woken up within the stop window (between 2:00 and 8:00) then left alone, the cabinet goes back to sleep.
  A stop time outside the night is flagged in orange; it then applies for one hour only (otherwise a stop at exactly 8:00 would stop the cabinet all day).
- **Missed, not caught up**: with the cabinet already asleep or off during the stop window, the stop is missed (`onMissed` of the power module), never made on wake.
- **Waking up**: from sleep, the PC power button; or a cabinet button if Windows allows its device to wake the PC (Device Manager > the device > Power Management).
  The screen's "Réveil depuis la veille" (Waking from sleep) block says so, read from Windows (`MSPower_DeviceWakeEnable`, keyboard, HID and mouse classes), without writing anything there: "Devices allowed by Windows: Pinscape Controller, HID Keyboard Device", "No allowed device detected", or "Device list unavailable".
  A permission is not a guarantee: waking with a cabinet button has to be checked on the cabinet (the BIOS must also power USB in sleep).
  After a shutdown, only the PC power button turns the cabinet back on.
  Cyber Pinball never ticks that box itself and schedules no Windows wake-up (wake timer, scheduled task): to be decided with the user.
- **Tests**: never a real sleep or a real shutdown (`powerSimulated`: the stop is logged, "Alimentation simulée : …").
  In tests only, `CYBERPINBALL_HORLOGE=2026-10-27T01:59:48` shifts the schedule's clock (the cabinet believes it is 1:59) and `CYBERPINBALL_REVEIL=Name 1|Name 2` ("-": unavailable) replaces reading Windows; outside tests, the clock is the PC's.
- **Proofs**: [arcadehours.test.ts](../../packages/core/src/test/arcadehours.test.ts) (night spanning midnight, stop window, warning, button that removes it, game until morning, sleep during the window, settings read again; never a real executor in a test; read-only wake-up; settings closed to guests; rendering of the veil and the warning).

### Menu DMD

While you browse, Cyber Pinball draws the DMD display itself, like a machine in attract mode: a 128 × 32 dot grid that cycles through the selected table's title, the invitation to play, its high scores, the time and the credits, with a close-up of its wheel on arrival and a short gameplay scene every other cycle.
The dots stay on screen at all times: the table's DMD media never replaces them, it shows around them (FullDMD frame, below).
Setting "DMD du menu" (Menu DMD) in **System menu > "Borne" (Cabinet) > "DMD"** ( Start switches between the two, saved in `<data>\medias.json`, field `dmd`): **live** by default, or **classic** (the table's media alone, else the generated DMD that scrolls its title, as before).
That media is the DMD screen's (`roleMedia`, `resolveMedia`): on a FullDMD screen, the table's (FullDMD) media, and its (DMD) only if it has no FullDMD; on a DMD-only screen, the (DMD) first, the (FullDMD) failing that.
When the table has both, the DMD screen takes the one whose proportions best fill its zone (`bestDmdMedia`, `dmdScreenAspect`: the role's zone in the cabinet model, otherwise 4:1 or 16:9), whatever its label: a 21:9 "(DMD)" taken over from PinUP Popper comes before a 16:9 "(FullDMD)" on a 4:1 DMD, instead of leaving half the screen empty.
On a tie, or if one of the two cannot be measured, the order above decides.
It is never the DMD the ROM produces during a game: the table is not running in the menu.

| Page | What it shows | Duration |
| --- | --- | --- |
| Title | the title in large (9 × 14 dots), manufacturer and year below in small; a title wider than the display (3-dot margins included) starts left-aligned, holds for 1 s, scrolls at 24 dots per second, holds 1 s on its end | 4.8 s, more if the title scrolls |
| PRESS START | in large, blinks twice (0.8 s on, 0.4 s off) | 2.4 s |
| High scores | one page per rank, 4 at most: "HIGH SCORE #1  MPT" in small, the score in large, digits grouped by three | 2.4 s each |
| Clock | the time in very large (18 × 28 dots), one shade down, the colon beating the seconds | 3 s |
| Credits | "CREDITS n": the credits the table saved, 0 otherwise (the menu has no coin door) | 1.8 s |

- **Cycle** (`liveDmdPages`, `LiveDmdProgram`, [packages/core/src/livedmd.ts](../../packages/core/src/livedmd.ts)): in the table's order, looping; a page with nothing to show (no high scores) is skipped, never replaced by an empty page.
  About 22 s for a table with 4 high scores.
  Selecting another table starts again from the title; so does the same table when its high scores change.
  No media page since 09/11/2026: it cleared the dots for 5 s per cycle, which read as a blinking DMD; a test checks that at every moment of the cycle the display has lit dots (except PRESS START, which blinks).
- **Transitions** (`DMD_TRANSITIONS`, `transitionTo`, `DMD_ALTERNANCE`): since the "Soie" (Silk) motion (11/11/2026), pages alternate three effects, in this order, in a loop.
  **Threads** (520 ms): on each row, a full-brightness thread runs left to right, rows offset from one another (a fixed ripple), and the lit dots just behind it keep some glow, like phosphor afterglow.
  **Light wipe** (320 ms: a front of 2 columns at full brightness and 2 at shade 7, left to right).
  **Sparkle** (440 ms): each dot switches to the new frame along a jittered diagonal (fixed hash), its front at full brightness.
  **Light-up** stays reserved for the wheel close-up (400 ms, each dot first at full brightness), and two high scores replace each other without movement.
  Push (160 ms) and dissolve (320 ms) remain available.
  **From one table to the next**, the new one slides over the old one in the wheel's direction (240 ms, `LiveDmd.show`); when scrolling fast, each step restarts the slide from the current frame.
- **Wheel close-up** (`wheelDetail`, `wheelPage`, [packages/core/src/dmdscenes.ts](../../packages/core/src/dmdscenes.ts)): wheels are illustrated medallions, unreadable when shrunk to 32 dots high.
  So the wheel is enlarged to 112 dots square, in tones chosen by the art director (background 0, shadows 1 to 3, volumes 5 to 10, outlines 12 to 14, rare highlights 15, no dithering; a pixel is worth mostly its strongest channel, so a bright red stays bright), and the display settles on its 32-line band richest in edges: most often the logotype (2001, Back to the Future, Star Trek, Goonies), otherwise a face or an emblem. 800 ms after arriving on a table (fast browsing only shows titles), the close-up lights up over the title, slides by 16 dots (640 ms), holds (480 ms), a 3-dot shine raises its dots by 2 shades (240 ms), holds (400 ms), then the title pushes it away and the cycle starts from the beginning.
  Once per arrival, and on return from a game.
  The wheel is read by the off-screen converter ([app/src/dmd-wheel.ts](../../app/src/dmd-wheel.ts)), so in any format Chromium can read (PNG, APNG, GIF, WebP, JPEG, first frame of a video), 200 ms after stopping on the table, one at a time, kept in memory (200 tables at most); read too late for the current visit, it plays on the next one.
  Without a wheel, or with nothing visible: no close-up, the cycle stays the same.
- **Gameplay interludes** (`DMD_INTERLUDES`, `liveDmdProgram`, `dmdscenes.ts`): six pinball scenes in dots, 1.7 to 2.8 s long, in the grammar of real DMDs (a 3-dot ball at full brightness, a trail of three positions at shades 10, 6, 3, scenery at shades 3 to 5, 80 ms flashes on contact): **bumpers** (4 hits, sparks), **plunger** (a shaking pull, release, lane, orbit), **flippers** (the flipper strikes in 80 ms and sends the ball back), **targets** (three drop targets, then "BANK COMPLETE"), **lock** (the ball slows into the hole, then "BALL LOCKED"), **multiball** (three balls).
  Every other cycle, after the last high score (no high scores: after PRESS START), so every 40 to 50 s; the six in turn, never the same twice in a row, the rotation starting from a scene picked from the table's title.
  Their frames are computed once and for all.
- **No table** (system menu, settings, help, messages: the default display): the stacked brand in its font (CYBER at shade 11, PINBALL at full brightness), PRESS START, the clock; a gameplay scene every other cycle, after PRESS START.
- **Loading**: the "chargement" animation ("LOADING" and a 4 × 2-dot ball rolling on a rail) until the game starts; with the cinematic launch, the "lancement" animation (the table title, the ball shaking at the plunger, the disc of light of the passing logo, then the same rolling ball; see [Cinematic launch](#cinematic-launch)).
  **Game**: nothing more is sent, VPX owns the display; the DMD screen goes back to its in-game background ("Loading and play").
  Desktop mode also stops the display.
- **On the DMD screen** (`liveDmdArea`): DMD only, the dots fill the 4:1 strip.
  FullDMD: if the table's FullDMD media has a drawn DMD frame (searched as for the in-game artwork, once per media, kept in `<data>\cache\fulldmd-cadres.json`), the dots sit inside that frame, inset by one dot, where VPX will put its DMD during the game, and the media shows around them.
  Without a media, or without a frame: the 4:1 strip across the full width, centred, black around it.
  Without a table, no strip: the fallback FullDMD shows the brand over its whole 160 × 90 grid.
  The frame of a video not searched yet is searched in the background: the strip shows first, the frame as soon as it is found.
  Under dots drawn on black, the zone's video is paused.
- **DMD on the wheel, table by table**: the table's page > "Gérer la table…" (Manage the table…) > "DMD sur la roue" (DMD on the wheel).
  This setting is for the wheel only; the in-game DMD keeps its own (both MagnaSaves, [DMD position during a game](vpx-plugins-backglass-pup-and-dmd.md#dmd-position-during-a-game)), and neither ever touches the other.
  The settings screen is on the playfield; the DMD screen shows the table, its dots where set and a dashed frame with its caption (size and position in pixels), live.
  - **Lines**: "DMD sur la roue" (shown or hidden: hidden, the dots are not drawn and the screen shows its media alone, the FullDMD media or nothing), "Position horizontale" (Horizontal position), "Position verticale" (Vertical position), "Largeur" (Width) and "Hauteur" (Height) (each on its own; the format is released), "Format" (4:1 first, then free, 3:1, 2:1…; when free, it gives the current proportions and a left flipper brings back 4:1), "Enregistrer pour cette table" (Save for this table), "Revenir à la place automatique" (Back to the automatic position), "Retour" (Back).
    A position line is greyed out, its reason given, while the DMD is hidden.
  - **Buttons**: Start opens a line; in an open line, the flippers move or resize by the pixel (held: faster, up to 64 pixels per step), the MagnaSaves move up and down, as do the keyboard arrows and + / −; Start confirms, Exit cancels the line.
    Leaving with unsaved changes asks: save, discard, keep adjusting.
  - **Saving**: `<data>\dmd-roue.json`, per cabinet configuration then per table (`MenuDmdPlace`: zone as fractions of the DMD zone, `hidden`).
    Only what differs from the automatic position is kept: a position left automatic still follows another media or a frame found later; a DMD that is only hidden does not freeze its position.
    "Revenir à la place automatique" removes the setting.
    The menu log notes each save ("DMD sur la roue (…) : …").
  - **On the wheel** (`liveDmdView`, [app/src/menu-dmd.ts](../../app/src/menu-dmd.ts), [packages/core/src/menudmd.ts](../../packages/core/src/menudmd.ts)): the table's setting, otherwise the automatic position above.
    Dots moved away from the automatic position over a FullDMD media let the media show around them, as in a found frame.
    Loading a game always shows its animation at the automatic position.
    With "DMD du menu" (Menu DMD) on "classique" (classic), the setting is saved but not visible: the screen says so.
- **Rendering**: 128 × 32 grid, 16 shades (0: dot off, still visible; 14 for titles, scores and PRESS START; 11 for the clock, the credits, the manufacturer and the high score labels; 5 for the rail), in the chosen colour (signal green by default, see [Brand backglass and DMD](#brand-backglass-and-dmd)), a round hole per dot and a light glow; the grid fills the whole dot area, even outside 4:1 (stretched dots, `dotMatrix(…, { fill: true })`: no more black bars on an area set by width or height alone) (`CyberFallback.dotMatrix`, [app/renderer/fallback.js](../../app/renderer/fallback.js)); an unlit dot stays a barely visible neutral grey, never a shade of the colour.
  "Saira Points" font, drawn after Saira ([packages/core/src/dmdfont.ts](../../packages/core/src/dmdfont.ts)): small 5 × 7, large 9 × 14 (drawn dot by dot, no more Scale2x), clock from the large one doubled (18 × 28), brand 11 × 11; accents removed, unknown signs as "?".
  The display's words stay those of pinball machines (PRESS START, CREDITS, HIGH SCORE).
- **How it works**: the program is computed without a browser (`livedmd.ts`, `dmdscenes.ts`, `liveDmdProgram`); the main process runs it ([app/src/live-dmd.ts](../../app/src/live-dmd.ts)) and only sends the DMD screen's window (channel `dmd`) the frames that change: a still page is sent once, what moves (scrolling, blinking, clock, transitions, wheel, interludes, animation) at 25 frames per second.
  The window draws them as dots over the DMD zone (`syncLiveDmd`, [app/renderer/frontend.js](../../app/renderer/frontend.js)); a reloaded window receives the current frame straight away.
- **On-demand animations** (for "Lancement en cinéma" and later features): `playDmdAnimation(name, { label })` ([app/src/frontend.ts](../../app/src/frontend.ts)) plays an animation over the cycle and returns `{ stop(), done }`; the cycle resumes on `stop()`, or at the end of an animation that has a duration.
  Animations are listed by name in `DMD_ANIMATIONS` (`livedmd.ts`): `chargement` and `lancement`, whose text `label` can replace.
- **High scores** ([packages/core/src/highscores.ts](../../packages/core/src/highscores.ts), a source shared with the interface sounds): VPX 10.8.1 stores what a table saves in `<table folder>\user\VPReg.stg`, an OLE compound file (one storage per name chosen by the script, one UTF-16LE stream per value).
  VPW tables and most original tables keep `HighScore1..N`, `HighScore1Name..N` and `Credits` there (checked on the cabinet: Guardians of the Galaxy, Game of Thrones, The Goonies).
  Nothing is made up: without `VPReg.stg`, without a table of scores, or with several storages none of which carries the file name or the title, there is no high score page.
  The file is read again as soon as it changes (after a game).
  `newRecords(before, after)` gives the scores that entered the table, for the knocker.
  Not covered: PinMAME tables whose ROM keeps the high scores in `nvram\<rom>.nv` (it would take each ROM's memory map, the pinmame-nvram-maps project).
- **Hardware DMDs** (ZeDMD, PIN2DMD, Pixelcade): they do not receive the menu display yet; VPX alone drives them during a game, through the DMDUtil plugin.
  What is missing:
  1. A callable interface: the libraries shipped with VPX 10.8.1 (`plugins\dmdutil\zedmd64.dll`, `dmdutil64.dll`) only export C++ classes (`ZeDMD::Open`, `ZeDMD::RenderRgb888`, `DMDUtil::DMD`…), no C functions: it would take a native module built for Electron.
  2. Shared access: a serial port (ZeDMD, Pixelcade) or a libusb device (PIN2DMD) has a single owner.
     Held by the menu at launch, DMDUtil could not open it and the DMD would stay dark during the game; handing it over before every launch and taking it back on return leaves no room for error.
  3. Safe detection: it stays passive (USB identifiers, "Real DMD"); a CH340 or CP210x may be something other than a ZeDMD, and sending it a handshake would be risky.
  4. A test bench: ZeDMD's serial protocol (handshake, compression, firmware versions) is only described by libzedmd's code, and the reference cabinet has no hardware DMD.

  The safe route is libdmdutil's server (`dmdserver`): it alone holds the hardware, VPX (`[Plugin.DMDUtil] DMDServer`, `DMDServerAddr`, `DMDServerPort`) and the menu send it their frames over the local network.
  It would need installing (it is not shipped with VPX 10.8.1), starting with the menu, switching VPX to it, and writing a client for its protocol in `live-dmd.ts` (a "DMDStream" header then the frame, according to libdmdutil's code, to be checked on a real DMD).
  The frames are ready: `LiveDmd` already produces the 128 × 32-shade grid a hardware DMD displays.
- **Tests**: [menudmd.test.ts](../../packages/core/src/test/menudmd.test.ts) (DMD on the wheel: settings per configuration and per table, automatic position without a setting, wheel and game kept apart, settings screen with the buttons), [livedmd.test.ts](../../packages/core/src/test/livedmd.test.ts) (font, DMD text, every page within its margins, fixed or scrolling title, order and durations, pushes, dot placement, animation, only changed frames sent, pause during a game, slide from one table to the next, wheel read late), [dmdscenes.test.ts](../../packages/core/src/test/dmdscenes.test.ts) (three Silk effects in turn, light-up towards the wheel, wheel close-up: tones, chosen band, opening played once; six interludes, every other cycle, never the same twice in a row; the display never empty, opening and interludes included), [highscores.test.ts](../../packages/core/src/test/highscores.test.ts) (VPReg.stg, several tables in one file, nothing made up, new high scores).

### Brand backglass and DMD

Wherever Cyber Pinball writes its brand or draws a dot display, it follows the art direction ([docs/design-system](../design-system/README.en.md)), with one rule for every screen.

- **The brand** is written only by its components (`app/renderer/fallback.js`): on one line, "C Y B E R  P I N B A L L" (light Saira, widened to 125%, widely spaced, PINBALL in signal green) on the topper, the loading screen, the "in game" screen and the logo without a title; stacked, CYBER above PINBALL, on the backglass.
  Never as a game title.
- **Backglass without a game** (system menu, settings, help, messages): the design system's cover.
  The art direction's illustration (`app/renderer/fronton-marque.webp`, the cover's teal ball and flippers) on the right, faded to black under the stacked brand on the left; in 4:3 and in portrait, the brand moves up and the illustration fills the bottom, its top always faded; in a strip (3:1, 4:1), the brand takes half the height.
  Fixed light.
  A game's backglass without media keeps its card (title, rule, manufacturer and year).
- **Display font**: "Saira Points" ([packages/core/src/dmdfont.ts](../../packages/core/src/dmdfont.ts)), drawn dot by dot after Saira, at the DMD's real resolution: rectangles with chamfered corners, C and G with horizontal terminals, R with a slanted leg, pointed A, open 4.
  Small 5 × 7 (running text); large 9 × 14 with two-dot strokes (titles, scores, PRESS START; a 12-letter title fits in 122 dots); clock: the large one doubled by nearest neighbour (18 × 28); brand 11 × 11 with one-dot strokes, 4 dots apart (PINBALL: 91 dots).
  The live DMD (main process) and the windows' fallback displays (`dmd` at 128 × 32, `fullDmd` at 160 × 90, which enlarges the large one ×3 or ×2 for a short title) write with the same glyphs: the windows read a copy, `app/renderer/police-points.js`, written by `node scripts/police-points.mjs` after `npm run build`; a test rejects an outdated copy.
  Press Start 2P, the former font of small texts, is no longer shipped.
- **The brand on a display**: stacked, 3 free rows at the top and bottom, 4 between the words.
  A display has only one colour: light carries the hierarchy the interface gives by colour, CYBER at shade 11, PINBALL at full brightness (15).
- **DMD colour** (System menu > "Borne" (Cabinet) > "DMD" > **"Couleur du DMD" (DMD colour)**, kept in `<data>\medias.json`, field `dmdColor`): the colour of the dots of the menu DMD and of the fallback displays, not of VPX's DMD during play (the table's own).
  **Signal green** `#8BE23A` by default (the design system's `dmd` token), or a preset: teal `#36C9B4`, light ink `#E6F0EC`, glacier blue `#5FB4CF`, soft amber `#F2B33D`, plasma orange `#FF8A1F` (the former colour); or **"Couleur libre…" (Custom colour…)**, typed in hexadecimal on the on-screen keyboard (`#8BE23A`, `8be23a` or `#8be`).
  A colour too dark (no component at 112 or more) is refused, with the reason; an unreadable value in `medias.json` falls back to signal green.
  The choice returns to its row; the DMD, which shows the brand in the system menu, changes at once (`setDmdColor`, [app/renderer/fallback.js](../../app/renderer/fallback.js), applied with every state; the minimal fallback follows the `--dmd` token).
- **Unlit dot**: a barely visible neutral grey, the same for every colour, instead of a veil of the colour over the whole grid.
- **Proofs**: [marque-dmd.test.ts](../../packages/core/src/test/marque-dmd.test.ts) (font copy up to date and loaded before `fallback.js`; no display text drawn with a text font; brand written only by its components; same default colour in the core, `fallback.js`, `theme.css` and the design system; presets readable and taken from the art direction; custom colour and refused colour; setting read, kept and sent to the windows), [livedmd.test.ts](../../packages/core/src/test/livedmd.test.ts) (drawing of the three sizes, brand at its shades).

### Colour of each table in the menu

In the tables menu, each table has its colour: the light of the wheel band (glows and neon of the arcs), a soft glow behind the wheel, the glow of the frames and panels, the smoked glass and rails of the stand-in screens take the hue of its media.
The hue dresses the ambience, never the selection: the ring, the glow under the chosen table, the title and the main action stay signal green, the only marker of the current choice.
Without a table (system menu, settings) or without a hue, the menu keeps the brand's teal (`#36C9B4`).

- **Setting**: System menu > "Tables" > "Roue" (Wheel) > **"Couleur de chaque table au menu" (Colour of each table in the menu)** (shown by default; Start: turn off), kept in `<data>\medias.json`, field `tableColor`.
- **Where the hue comes from** ([packages/core/src/tabletint.ts](../../packages/core/src/tabletint.ts)): the backglass first (its media, otherwise the lit image of the `.directb2s`), then the logo, then the playfield; the first with enough colour gives it.
  The image (or four moments of a video) is reduced to 64 dots wide by the off-screen converter ([app/src/media-convert.ts](../../app/src/media-convert.ts)); nearly black, nearly white or grey pixels do not vote; the others vote for their hue (OKLCH), weighted by their chroma; the hue kept is the mean around the histogram's peak.
- **Corrections**: under 8 % of coloured pixels, or a mean chroma under 0.06 (black-and-white or very dark backglass): no hue, the brand's teal.
  Otherwise lightness is imposed (0.75, the teal's) and chroma bounded (0.09 to 0.15): a very dark or very dull backglass gives a glow as visible as the others, never garish.
  A hue less than 35° from signal green is pushed away from it, on its own side; under 8°, it is dropped.
  The glow never exceeds 25 % of the hue under a text: ink stays at 7:1 at least, muted text at 4.5:1, whatever the hue (checked by the test).
- **Once per media file**: the measure is kept in `<data>\cache\teintes-tables.json` (key: path, size, date of the file; a refusal too) and redone when the media changes: its dated address (`mediaUrl`) changes, the hue is read again.
- **Nothing is computed while scrolling** ([app/src/table-tint.ts](../../app/src/table-tint.ts)): the hue only changes once the chosen table has stayed put for 260 ms; until then the ambience keeps the previous hue, then fades to the new one in 280 ms, in step with the media crossfade (`--table-tint` property declared as a colour, [app/renderer/theme.css](../../app/renderer/theme.css)).
  Nothing moves in the layout: the layers are fixed, only their colour changes.
- **Wheel bands**: each source drawing ([docs/design-system/src/roues](../design-system/src/roues)) is cut by `node docs/design-system/src/roues.mjs` into three layers ([app/renderer/roues](../../app/renderer/roues)): the background (glass, shadows, green glow), the light (glows and neon, a mask painted in the hue) and the top (bright cores, arrows, title plate).
  Edit the source, then run the script again.
  The light and the top bleed 60 units beyond the band at the top and bottom (`DEBORD`, the same value as the `inset` of `.wheel-stage::before` and `::after`): the glow of the pointer, drawn at the top edge above the selected table, was cut flat by the image frame.
  Proof: [roue-arret.test.ts](../../packages/core/src/test/roue-arret.test.ts) (no blurred glow of a layer leaves its frame vertically; once drawn, the green ring becomes a closed stroke, without the slit the dash joint left at twelve o'clock).
- **Menu DMD**: in "Couleur du DMD" (DMD colour), the **"Couleur de la table" (Table colour)** choice (`dmdColor` set to `table`) gives the dots the hue of the table shown, brighter than the ambience's (lightness 0.80, chroma 0.12 to 0.20).
  It is measured first on the DMD screen's media (FullDMD, or a capture of the machine's DMD: its dots give the colour, the black frame does not vote), closer to the real DMD than the backglass, which keeps the ambience (12/11/2026: a red and blue backglass gave red dots to a machine with an orange DMD); with no hue on that media, the backglass's (`TintSubject.dmdFiles`, [app/src/table-tint.ts](../../app/src/table-tint.ts)); a table without a hue keeps signal green.
  The default stays signal green.
- **Proof**: [couleur-table.test.ts](../../packages/core/src/test/couleur-table.test.ts) (dominant hue, cut-out logo, dull, dark or pale backglass, distance from signal green, readability for every hue, cache, nothing measured while scrolling, backglass then playfield).

### Smooth wheel in bursts

Scrolling fast through the wheel never doubles a medallion, and a press costs the renderer as little as possible.

- **Halo of the chosen table** ([app/renderer/frontend.js](../../app/renderer/frontend.js), `wheelHalo`, `haloSync`): each medallion has a twin laid under the whole wheel, which gets its places in the same call (`placeWheelItem`); their glides start together from the same point.
  Only the chosen table's twin holds a copy of the logo, whose green halo (`drop-shadow`) follows its shape; the others are empty.
  Before, a single copy moved from table to table and started again from the place the new table was heading to, not from where it was seen: in a burst, two medallions slid out of step (13 November 2026).
- **No forced layout during a press**: the ripple is placed in percent of its own size (`PULSE_SIZE`), the glide duration is read once per wheel style, an entering logo fades in through `@starting-style` (`.entering` class), the ring size is measured after the next frame (`afterPaint`), the screen width for the title blur comes from a resize observer, and the scroll keeper ([app/renderer/scroll-keeper.js](../../app/renderer/scroll-keeper.js)) no longer reads back every element's position when nothing was scrolled.
  Measured off screen over a burst of twenty presses: 5 to 6 ms of rendering per press instead of 14 to 19.
- **Proofs**: [roue-rafale-chromium.test.ts](../../packages/core/src/test/roue-rafale-chromium.test.ts) (real Chromium off screen, one press every 70 ms, glide clock advanced by the test bench 10 ms at a time: no logo drawn in two places; the old code showed some at 144 steps out of 230; a press path reads neither layout nor computed styles).

### Manager: "Médias du jeu"

Details screen > "Médias du jeu" (Game media): what the menu shows for this game, screen by screen, without handling any file.
One card per media item: its label ("Logo", "Plateau" (Playfield), "Fronton" (Backglass), "Afficheur" (Display), "Afficheur large" (Wide display), "Topper", "Chargement" (Loading), "Musique du jeu" (Game music), "Son de lancement" (Launch sound), "Prospectus" (Flyer), "Règles" (Rules)) and its file name in parentheses, **where** it appears (screen and moment, in plain words, instead of Popper's screen names), its **role** in one sentence, a preview (the image, a frame from the video, or the description of the default display), and the status: "Présent" (Present), or what is shown instead ("À la place : image du .directb2s" (Instead: .directb2s image), "À la place : média commun de la borne" (Instead: cabinet shared media), "À la place : Afficheur large" (Instead: Wide display), "Affichage par défaut" (Default display)), with dimensions and file size.
A media item the cabinet does not show says so ("Cette borne n'a pas d'écran topper" (This cabinet has no topper screen), or a narrow display that shows the "Afficheur" rather than the "Afficheur large").
The files in `medias\` that the game does not use are listed with the reason (another game's name, unreadable format, type with no screen).

- **Actions**, with the buttons or the mouse: take a file from `<racine>\import` (subfolders included, only the formats the menu reads for this media type), pick it on this PC, or drag it onto the window (on the overview, the type is read from the name: `(Wheel) …`, VPinFE's `bg.png`, Popper's `Wheel` folder or PinballX's `Backglass Images`, otherwise it is the selected media item); replace; move to the trash; half-turn of the playfield and of the loading video (the preview is rotated the way the menu will show it, as seen by the player); relative game volume (0 to 200%); for the flyer and the rules, the list of pages, and for each page move up, move down, replace or remove.
- **Nothing is written before "Enregistrer" (Save)**, which first shows the plan, one line per media item.
  Files are stored as `(Type) <nom du dossier>[ N].ext` (a file from the import folder leaves it, a file picked on this PC or dragged in is copied); any other file of that type for this game (old file, another format that would take precedence, VPinFE name, unreadable format) goes to the trash; pages are renumbered in two passes, so that none overwrites another.
  Half-turn and volume go into the `.info` under `CyberPinball.medias` (`halfTurn`, `volume`), with its other fields kept.
  Leaving with unsaved changes asks "Quitter sans enregistrer ?" (Leave without saving?).
- Code: `packages/core/src/mediaedit.ts` (where each media item appears, draft, plan, renaming, `.info`), tests in `packages/core/src/test/mediaedit.test.ts`; screens in `app/src/library-medias.ts`, cards in `app/renderer/library.js` and `library.css`.

### Importing media

Other frontends organize media differently; the import recognizes them and renames them.
Code: [packages/core/src/mediaimport.ts](../../packages/core/src/mediaimport.ts), hooked into table adding ([tableimport.ts](../../packages/core/src/tableimport.ts)) and into the takeover screen ([app/src/media-import.ts](../../app/src/media-import.ts)); tests in [mediaimport.test.ts](../../packages/core/src/test/mediaimport.test.ts).

**What is recognized**, in an archive, a selection or the import folder:

| Layout | Example | Type |
| --- | --- | --- |
| PinUP Popper | `POPMedia\Visual Pinball X\Wheel\<jeu>.png`, folders `PlayField`, `Backglass`, `DMD`, `Menu` (FullDMD), `Topper`, `Loading`, `Audio`, `AudioLaunch`, `GameInfo`, `GameHelp`, `Other2` | folder name; pages `<jeu>01.png`, `<jeu>02.mp4` in order |
| PinballX | `Media\Visual Pinball\Wheel Images\<jeu>.png`, `Table Videos`, `Table Images`, `Backglass Videos`, `DMD Videos`, `FullDMD Videos`, `Topper Videos`, `Launch Audio`, `Table Audio`, `Loading Videos`, `Real DMD…`; `Media\Flyer Images\Front`, `Back`, `Inside1`… (flyer pages, in that order) | folder name |
| VPinFE | `medias\bg.png`, `wheel.png`, `table.mp4`, `dmd.png` (FullDMD)… | fixed file name |
| Already named | `(Backglass) <n'importe quel nom>.mp4`, anywhere | the name |

A Popper folder with an ambiguous name (`DMD`, `Audio`, `Backglass`, `Topper`, `Loading`, `Menu`) is only recognized under `POPMedia` or next to an unambiguous folder (`Wheel`, `PlayField`, `GameHelp`…): alone in an archive, a `DMD` folder is more often a table's FlexDMD content.
A DMD folder loaded by the script always stays a DMD folder.

**Assigning to a game**: in a single-table package, the media belong to that table.
Otherwise, the file name decides (the game name for Popper and PinballX, `(Type) <nom>`, the table folder for VPinFE): name of a `.vpx` or of the folder, ROM, title (manufacturer and year break ties), game recognized by the VPS database (compared with the `VPSId` in the `.info` of installed tables).
A media file named after a game that is neither in the import nor among the installed tables stays where it is ("Non importé" (Not imported)).

**Storage**: `(Type) <nom du dossier>.ext`, for all versions of the game.
A single file per type, in the best format (video before image for screens, Visual Pinball X before Visual Pinball 9); the others are flagged "Doublon" (Duplicate).
Flyers and rules keep all their pages (`(GameHelp) <nom>.png`, `(GameHelp) <nom> 2.png`…).
A media file of the same type already in the table (including another extension or other pages) goes to the trash; the plan marks it "remplace l'existant" (replaces the existing one).

**Never stored, always flagged in the plan**: formats the menu does not read (`flv`, `f4v`, `avi`, `mov`, checked on Electron 44.5.1: convert them to mp4 or webm), a format not intended for the type (a video as a logo, for example), media for an emulator other than Visual Pinball (`POPMedia\Future Pinball\…`).
In move mode (import folder), they stay in `import\`.

**"Reprendre les médias de PinUP Popper / PinballX" (Take over media from PinUP Popper / PinballX)** (system menu, Exit in the menu): offers the installations found in the usual locations (`C:\vPinball\PinUPSystem\POPMedia`, `C:\PinballX\Media`…) or a chosen folder (`PinUPSystem`, `POPMedia`, an emulator's or a type's folder, the PinballX folder or its `Media`).
Each media file is matched to an installed table, never by guessing: a name that refers to several tables ("Fathom" for two versions stored in two folders) is not copied.
The plan gives, table by table, the types received, their size, how the table was recognized and what is replaced; then the unreadable formats, the games without a table and the other emulators.
Free space is checked beforehand.
"Copier" (Copy) **copies**: the original installation is never modified.
PuP-Packs (`PUPVideos`) and Popper's default media (`System`, `Default`) are not taken over.

**Unrecognized cases**: Popper's `MediaSearch` field (a media item shared by several tables, with a wildcard) and `MediaWildCard` (several files picked at random: only one is kept); media named differently from the game in Popper's or PinballX's database, when that name resembles neither the `.vpx`, the folder, the title nor a VPS game (they are listed as "Sans table" (No table)); PinballX's `Table Images Desktop` and `Table Videos Desktop` (desktop views); Popper's `Wheelbar` and themes; subfolders of a type folder, other than PinballX flyers.

### The media doctor

The doctor ([doctor.ts](../../packages/core/src/doctor.ts), details screen > "Diagnostiquer et réparer" (Diagnose and repair)) checks, without launching anything:

| Finding | When | Fix |
| --- | --- | --- |
| Format the menu does not read | `flv`, `f4v`, `avi`, `mov` (checked with `canPlayType` in Electron 44.5.1), `wmv`, `mpg`, `mpeg` (not among Chromium's formats); or a format not intended for the type (`(Wheel)` as a `jpg`, `(Loading)` as an image…) | trash if a readable version has the same name; otherwise, convert (HandBrake) |
| Display stored under the wrong type | `(DMD)` in 16:9, or `(FullDMD)` in 4:1 (boundary at 8:3), and the other type's name free; when both names are taken, nothing shows: the DMD screen already takes the one that fills it best (information, under "À savoir" (Good to know)) | rename to the other type, in one step |
| Misnamed media | `(Type) nom` whose name is neither that of a `.vpx` in the folder nor that of the folder (pages included: `Nom 2`, `Nom_02`); file with neither `(Type)` nor a VPinFE name | rename to `(Type) <dossier>` (the next free page for the flyer and the rules), unless `medias\` already shows that type |
| Media stored outside `medias\` | PinUP Popper layout (`POPMedia\…\Wheel\<jeu>.png`) or PinballX layout (`Media\Visual Pinball\Wheel Images\…`) in the table folder, or `(Type) nom` placed next to the table; the `pupvideos`, `pinmame` and `cache` folders and the script's DMD folder are ignored | store and rename as `medias\(Type) <dossier>.ext`; the emptied tree goes to the trash |
| Proportions differ from the screen | a gap of more than 15% (`MEDIA_RATIO_TOLERANCE`, measured as a ratio) from the role's zone in the cabinet model: cropped playfield (only the aspect ratio matters, since the menu rotates the media; an almost square file does not tell where the flippers are), black bars or a portrait media item on a landscape screen for the backglass, DMD and topper, FullDMD shown shrunk for lack of a DMD | — (information) |
| Very heavy media | image over 25 MB or over 7680 × 4320 pixels, video over 300 MB, sound over 50 MB (`MEDIA_SIZE_LIMITS`, `MEDIA_MAX_PIXELS`) | — (re-encode) |
| Duplicate media | several files of the same type for the same game (`.png` and `.webp`, `.vpx` name and folder name, `(Wheel)` and VPinFE's `wheel.png`): only one is shown; a version in the folder that has its own media is not a duplicate | trash the never-shown files of the same kind; an image next to a video of the same type is only flagged |
| Media the menu could not read | error recorded by the display in the error file, for a file unchanged since then | trash for a damaged or rejected file (decoding, format, image); only flagged for a disk error |

**No backglass** (`backglassMissing`): a table without a `.directb2s` leaves the backglass screen to the front-end during the game; the finding says what it really shows there, the table's Backglass media (by name), otherwise its title or the backglass media shared by the cabinet.
It stays silent when the cabinet has no backglass screen, or when one of the table's PuP-Packs fills the backglass (`pupShowsBackglass`); a VR table whose room has its own backglass (`tableHasVrRoom`) is not invited to receive a `.directb2s`.
**Good to know**: information with nothing to set in Cyber Pinball (a media's proportions, missing backglass, a display whose two names are taken) carries `note`; the Diagnosis and the check of an added table show it apart, at the bottom, in an "À savoir" (Good to know) section, without "Ignorer" (Ignore), so the check of a taken-over table keeps at the top only what can be repaired.
Every fix is safe: rename, move into `medias\`, or move to the trash (`trash\`); nothing is converted or deleted.
"Tout réparer" (Repair all) chains the fixes without any two of them targeting the same file; anything that depends on a rename (the type of a misnamed display, for example) is checked at the next analysis.

Each finding can also be ignored for this table ("Ignorer « … »" (Ignore "…"), or the finding itself when it has no fix): kept by its code in the table's `.info` (`CyberPinball.doctor.ignored`, `setFindingIgnored`), it no longer counts anywhere, neither in the cabinet health nor in "Ce qu'il manque pour jouer" (What is missing to play) (`splitIgnoredFindings`).
The diagnosis keeps it under "Ignorés" (Ignored), where "Ne plus ignorer « … »" (Stop ignoring "…") brings it back.
All findings with the same code go together.

**Playback error file**: `<racine>\data\logs\medias-erreurs.json`, written by the main process ([mediaerrors.ts](../../packages/core/src/mediaerrors.ts), `recordMediaError`) when the display passes it an error from `<video>`, `<audio>` or `<img>`.
Format, version 1:

```json
{
  "version": 1,
  "errors": [
    {
      "file": "D:\\CyberPinball\\tables\\T2 (Williams 1991)\\medias\\(Backglass) T2 (Williams 1991).mp4",
      "type": "Backglass",
      "role": "backglass",
      "kind": "decode",
      "message": "PIPELINE_ERROR_DECODE",
      "size": 48211763,
      "mtimeMs": 1792500000000.123,
      "first": "2026-10-21T20:14:03.512Z",
      "last": "2026-10-21T20:31:40.007Z",
      "count": 3
    }
  ]
}
```

`kind` comes from `MediaError.code` (2 `network`, 3 `decode`, 4 `unsupported`, anything else `other`) or is `image` for `<img>`; an interrupted playback (code 1, the table was changed) is not recorded.
`type`, `role` and `message` (300 characters at most) are optional.
An entry only applies to the file as it was (same size, same date): a replaced or re-encoded file is no longer flagged, and its old entries disappear at the next write. 200 entries at most, the most recent ones.

### Media from VPinMediaDB: "Chercher les médias"

[VPinMediaDB](https://github.com/superhac/vpinmediadb) (the `superhac/vpinmediadb` repository on GitHub) stores media for about 1,155 games, one folder per VPS identifier.
Cyber Pinball downloads them **on request only**, never automatically.

- **Disclaimer**: VPinMediaDB declares no license (`license: null` in the GitHub API, no LICENSE file and no terms of use, checked on October 21, 2026).
  Its media belong to their authors, and the game artwork to its manufacturers: **personal use, on your own cabinet only**, without redistributing them.
  Cyber Pinball ships none of them.
  The disclaimer is shown on first use (accepted once, date stored in `<données>\mediadb.json`) and at the top of every plan.
  The source is credited in the plan, on the media item's details ("Source : VPinMediaDB (github.com/superhac/vpinmediadb), téléchargé le …" (Source: VPinMediaDB (github.com/superhac/vpinmediadb), downloaded on ...), followed by the file's address) and here.
- **Two entry points**:
  - a table's details screen > "Médias du jeu" (Game media) > "Chercher les médias" (Search for media): everything VPinMediaDB has for that game;
  - system menu > "Médias" (Media) > "Trouver les médias manquants" (Find missing media): whatever each table is missing, one table per folder.
    From here, an existing media file is never replaced, and a table matched by its title alone is not served automatically.
- **Matching**: by the `VPSId` in the `.info`.
  Otherwise, by the table's name (title, initials, manufacturer, year) matched against the VPS database (section "VPS database"), which supplies the identifier.
  An identifier that is known but missing from VPinMediaDB only leads to the other editions of the same game (Pro, Premium, LE), to be checked on the previews.
  When nothing is certain, deep search takes over (next section).
  "Pas le bon jeu ?" (Not the right game?) is always offered: it shows the possible games with the reasons for each, and lets you search for another title with the keyboard.
- **What is taken**:

  | VPinMediaDB | Media | Notes |
  | --- | --- | --- |
  | `wheel.png` | Logo `(Wheel)` | 500 × 500, transparent |
  | `1k/table.mp4`, otherwise `table.png` in 1k or 4k | Playfield `(Playfield)` | video first; landscape, flippers on the right, and the menu rotates it |
  | `1k/bg.png` | Backglass `(Backglass)` | 1k only |
  | `1k/dmd.mp4`, otherwise `1k/dmd.png` | Wide display `(FullDMD)` | 16:9; scaled down on a 4:1 display |
  | `flyer.png` | Flyer `(GameInfo)` | page 1 |
  | `audio.mp3` | Game music `(Audio)` | |

  Not taken: `cab.png` (photo of the cabinet), `fss.png` (playfield and backglass for a single screen), `realdmd*.png` (physical DMD, which Cyber Pinball does not handle).
  VPinMediaDB never has a 4:1 display, a topper, a loading video, a launch sound or rules.
- **1k or 4k**: only the playfield image exists in 4k.
  The "Qualité téléchargée (VPinMediaDB)" (Download quality (VPinMediaDB)) setting is in system menu > "Médias" (Media) > "Médias, son et attente" (Media, sound and attract mode):
  - automatic: 4k if the playfield zone, in the active configuration, is larger than 2,560 pixels on a side;
  - or 1k, or 4k, forced.

  The plan states what was chosen, and why.
- **Plan to approve**: one card per media item.
  - Each card shows the preview (the 1k image of the same media item, received and verified, which is then reused for the download), the size (HEAD request, cached by MD5 in `downloads\vpinmdb.sizes.json`), what gets replaced, and the name the media file will be stored under.
  - Start on a card switches to the next variant: video, image, or nothing.
  - Selected automatically: missing media, and the new version of a file that already came from VPinMediaDB.
    A media file added by the user stays "Gardé" (Kept); replacing it has to be requested ("Remplace l'actuel" (Replaces the current one); the old one goes to the trash).
- **Download**: one file at a time, received as `downloads\vpinmediadb\<md5>.ext.part`.
  The size and MD5 from the index are checked, then the file is stored as `medias\(Type) <nom du dossier>.ext`, and the old file goes to `trash\<date> Médias <dossier> (VPinMediaDB)`.
  An interrupted download (connection lost, 30 s without data) or an invalid one (MD5, size, HTTP response) is deleted: nothing is left behind, and the other media carry on.
  Progress: "Plateau (2 sur 6) : 1,2 Mo sur 1,7 Mo…" (Playfield (2 of 6): 1.2 MB of 1.7 MB...).
- **Source in the `.info`**: `CyberPinball.medias.sources.<Type>` receives `{ origin: "VPinMediaDB", url, date, vpsId, key, md5, file }`.
  The forced 180° turn of a replaced playfield is removed: the new file follows the standard, which the menu rotates on its own.
  A later search says "À jour" (Up to date), or offers the new version if the MD5 in the index has changed.
- **Index**: `vpinmdb.json` (1.7 MB), downloaded on first use from `https://raw.githubusercontent.com/superhac/vpinmediadb/main/vpinmdb.json` and kept in `<racine>\downloads`.
  - It is rechecked at most every 12 hours, in the background; GitHub answers 304 (ETag) if it has not changed.
  - Without a network connection, the cache is used, and an invalid response never replaces it.
  - Only addresses from the `superhac/vpinmediadb` repository are accepted.
    The `bg_thumbs` entry, which is empty, is ignored.
- **Measured volumes** (October 21, 2026, HEAD requests):

  | | 1k | 4k |
  | --- | --- | --- |
  | Terminator 2, all defaults (playfield and display videos) | 14 MB | 14 MB |
  | Terminator 2, images only | 9.8 MB | 20 MB |
  | Playfield image only (Terminator 2) | 3.5 MB | 13 MB |
  | Average of 12 games, all defaults | 11 MB | 17 MB |
  | Average of 12 games, playfield image | 3.2 MB | 13 MB |

  4k only changes the playfield image, which is about four times heavier.
  By default, the playfield video (1k) takes precedence over it, when it exists.
- **Code**: `packages/core/src/mediadb.ts`, tests in `packages/core/src/test/mediadb.test.ts` (fake index and files served by a local server, no network access); screens in `app/src/media-download.ts`.

### Suggestions for each media item and deep search

The automatic choice is not always enough: the table's name has been changed, shortened or translated ("GOTG_2.1.1.vpx", title "Gardiens de la galaxie"), or you prefer another version of the backglass.
A table's details screen > "Médias du jeu" (Game media) > a media item > **"Voir les propositions" (See suggestions)** shows every version found for that media item, each with its preview, where it comes from, and why.

- **What is suggested**, in this order:
  - VPinMediaDB, for **each selected game**: the recognized game, its other editions (Pro, Premium, LE), and the close matches you add; each variant (video or image, 1k or 4k), with a file shared by two editions shown only once;
  - what the **table already has** without knowing it:
    - in the **PuP-Pack**: the file that `screens.pup` assigns to the backglass, topper or display screen; those that `triggers.pup` sets at startup (`D0`) or in attract mode (`E454`), and the music of its `MusicOnly` screens (the game-mode backgrounds are in-game scenes, left out); the `PupImages` frames with a backglass aspect ratio (`-4x3`, `-5x4`, `-16x9`); folders with telling names (`BGDefault`, `Topper`, `DMDAttract`...), except for a file whose screen `screens.pup` or `triggers.pup` already state; music files (over 500 KB);
    - the animations in the FlexDMD or UltraDMD folder that the script loads;
    - in **each `.directb2s` in the folder**: the lit image and the display, then the same images **"tout allumés" (all lit)**, with every visible bulb from `<Illumination>` laid over them the way the B2S server shows them when they light up (a piece of lit image is laid on as is, a glow takes the bulb's color).
      The compositing is done once, with no dependency (PNG reading and writing in `packages/core/src/png.ts`), and kept in `<données>\cache\medias` (`b2sLitImages`, `packages/core/src/b2simage.ts`); on Terminator 2 (8 flashers, 2,517 × 2,397 image), about 4 s the first time.
      A second `.directb2s` is another possible backglass, offered with its name ("que VPX ne charge pas" (which VPX does not load)); a copy of the same file under another name, which is common (the site's name next to the table's name), is read and shown only once;
    - in the **`.vpx`**: the screenshot the author stored in it; the flat playfield image (`IMAG` field, except Visual Light Mapper atlases); the rule card that the rules Markdown points to (`![…](nom)`), otherwise an image with a card-like name; the backglass and the logo from the VR room.
      Only the start of each image is read to get its name; the selected images are written once to `<données>\cache\medias` (`vpx-<clé>-…`), and read again if the `.vpx` changes;
  - the **community sites**, with the user's own account: **VPForums**, then **VPUniverse** as a last resort (see "Community site media" below);
  - the **VPS database thumbnails**: the playfield of each version of the table and the backglass of each `.directb2s` (from 352 × 626 to 1,000 × 750, "basse définition" (low definition)), often the only image of a game missing from VPinMediaDB: 2,608 games have a playfield one, 1,746 a backglass one;
  - the **VPS database music** (`soundFiles`): Dropbox share links to an mp3 or ogg, downloaded only when you choose the card, one at a time.
    The received file is checked by its signature (`isAudioFile`): a dead link returns an HTML page, and the card then says "Lien mort" (Dead link).
- **Choosing**: Start on a suggestion puts it in the draft, like a file from the import folder (a new page for the flyer and the rules).
  An online file is downloaded and verified (VPinMediaDB MD5) at the moment it is chosen; a file from the table is copied, and the original stays in place.
  The card says "Actuel" (Current) or "Choisi, à enregistrer" (Chosen, to be saved); the "Actuel" card of an online file shows the cabinet's file (the video itself, not the site's preview image).
  **Taking the current media again changes nothing**: Start on the "Actuel" card says so instead of putting it back in the draft, and a chosen file whose content is the current one's, byte for byte (size then MD5, `sameFileContent`), brings the draft back to today's state with "identique au média actuel" (identical to the current media): without this, "Enregistrer" (Save) rewrote the same file and the old one seemed to stay.
  Nothing is written before "Enregistrer" (Save), which shows the plan; the origin of a downloaded file (VPinMediaDB or VPS database, address, date, VPS identifier) goes into the `.info`, and disappears if the media file is later replaced by hand.
  A suggested music track plays as soon as its card is selected.
- **Gallery**: suggestions are shown as tiles, four per row on a desktop, three on the cabinet, the preview in the shape of the screen that shows the media (16:9 for the wide display and loading, 4:1 for the display, 4:3 for the backglass, square for the wheel, upright for the playfield and pages); each tile carries the name, the source, the state and the popularity, and under the gallery sits the detail of the chosen tile (where it comes from, what arrives on download, the game it belongs to).
  Start puts the suggestion in the draft **and stays on the suggestions**: the tile turns "Choisi, à enregistrer" (Chosen, to be saved), the message says under which name it will be stored.
- **One media item after another**: "Média suivant : …" (Next media: …) and "Média précédent : …" (Previous media: …) open the suggestions of the neighbouring media item among those the cabinet shows (the 4:1 Display is skipped on a cabinet that shows the Wide display), without going back to the overview; the detail says when the neighbour already has a pending choice.
  "Enregistrer" (Save) appears as soon as there is a change and opens the same plan as the overview.
- **Popularity**: the download count **VPUniverse** gives for each file page ("510 téléchargements", 510 downloads) is on the tile; "Trier : pertinence" (Sort: relevance) becomes "Trier : popularité" (Sort: popularity) (most downloaded first, then the usual order; stable sort, kept from one media item to the next during the visit).
  VPinMediaDB gives none (a GitHub repository without a counter), nor does the VPS database; VPForums is not read for it until it has a witness page of its results (`packages/core/test-pages`).
  The entry only appears when a suggestion has that count (`sortProposals`, `app/src/media-proposals.ts`).
- **"Autre jeu" (Other game)**: a suggestion from a VPS game that is not the table's own (same title, other authors, other year) carries this sign, and its detail names both.
  For The Matrix (VP_Cooks, JPSalas, 2023), VPinMediaDB only has the media of "The Matrix (Original 2026)", another table (VPW, March 2026): the year 2026 comes from the VPS database, not from a Cyber Pinball error.
  The "Chercher les médias" (Search for media) plan says so too (`otherGameRows`).
- **The choice holds, even when the list moves** (`packages/core/src/focus.ts`): while you look, a file page received from a site turns into its files, a download made in "Récupérer" (Get) lands at the top, a preview arrives.
  The cursor points at an item, not a rank: each action has an identity (its key, `mediaChoiceKey` for a suggestion, otherwise its label when unique), the cursor follows it from one view to the next of the same screen, and a click carries the identity of the clicked tile (ignored if it has gone).
  A file awaited from a site only enters the draft on arrival if that media item has not changed since the request (`pagesSignature`): another choice made in the meantime, here or on the media item's screen (import folder, this PC, dropped file, media removed), wins.
  A card screen without identities is reported once in the log.
  The invariant "the stored media is the one validated" is pinned by `packages/core/src/test/choix-media.test.ts`.
- **Display the cabinet does not show**: a cabinet whose DMD screen is a FullDMD shows the Afficheur large (FullDMD); the Afficheur (4:1 DMD) is only used when it is missing (and the other way round for a DMD only).
  Its suggestions say so first ("Pas montré sur votre borne", Not shown on your cabinet) and "Propositions : Afficheur large" (Suggestions: FullDMD) goes straight to those of the media the cabinet shows.
  Sites often have FullDMD videos and no 4:1 DMD: without this warning, you searched on the wrong screen.
- **"Chercher sur le web…" (Search the web...)**, when nothing fits: the media's free search, the same as "Chercher moi-même sur le web…" (Search the web myself...) on its screen (see "Free search" below), on the title typed in "Chercher un autre titre…" (Search another title...) if there is one.
  What you download there then stays offered first ("Téléchargé du web", Downloaded from the web) for that table only; a pack laid out the Popper way also serves the other screens.
- **"Autres jeux…" (Other games...)**: the possible games, most likely first, with their logo (or a thumbnail), what they have online and their reasons; Start adds a game to or removes it from the suggestions.
  Selected automatically: the first game, its other editions, and those almost as likely (four at most).
- **"Chercher un autre titre…" (Search for another title...)**: typing on the on-screen keyboard (or a real keyboard) an English title ("lord of the rings"), initials ("TMNT") or a ROM name ("t2_l8"); the first game found is added to the suggestions.
  As with every search you can resume ("Ajouter des mots à la recherche…" (Add words to the search), "Chercher un titre…" (Search for a title) in the game parts, the VPinMediaDB plan), the entry's detail says the title currently searched ("Titre cherché : « … »" (Searched title)), and the field opens pre-filled with it; for added words, the whole search, title first: you see what you are adding to (17/11/2026).
  A received pack of several games only offers the table's files (`namedMediaFiles`, beyond `PACK_FILES` files).
- **Deep search**: every clue the table gives about itself, checked one by one against the VPS database, with each lead keeping its reasons in plain words:
  - the **name written into the table** by its author (File > Table Info in the VPX editor: the `TableInfo` storage of the `.vpx`, read without loading the table): "GOTG_2.1.1.vpx" is called "Guardians Of The Galaxy" there; its **author and version** point to the exact recreation in VPS; an **IPDB number** quoted in its description points to the game;
  - the title on the details screen, the name of the `.vpx`, of the folder and of the `.directb2s`;
  - the **ROM**, the **PuP-Pack** and the **DMD folder** read from the script (the script is read through VPX if it never has been before);
  - the **initials** ("GOTG", "TMNT", "TAF", "T2") and **fuzzy words**, for a translated title ("gardiens", "galaxie");
  - several independent clues pointing to the same game push it up; file names, which copy one another, count as one.

  The automatic plan ("Chercher les médias" (Search for media)) and the system menu's "médias manquants" (missing media) use it when the name is not enough: a table recognized this way is shown for checking, never served automatically.
- **Code**: `packages/core/src/vps.ts` (initials, fuzzy words, other editions, free search), `vpxinfo.ts` (reading the `.vpx`), `mediasearch.ts` (clues and leads), `mediachoices.ts` (suggestions), `mediaedit.ts` (origin on save), tests in `packages/core/src/test/mediasearch.test.ts` and `b2slit.test.ts`; screens in `app/src/media-proposals.ts` and `app/src/media-search.ts`.

### Table sounds

Table details screen > "Médias du jeu" (Game media) > "Musique du jeu" (Game music) or "Son de lancement" (Launch sound) > **"Sons de la table" (Table sounds)**: the sounds the table already has, by folder, to make one of them its presentation music or its launch sound.
A PuP-Pack often has dozens (music in the `Topper` or `Music` folder, callouts, intro videos) that VPinMediaDB does not have: *Guardians of the Galaxy* has 38 music tracks and 64 videos with sound in its pack, and no music on VPinMediaDB.

- **Folders**: each with what it holds ("38 sons" (38 sounds), "1 vidéo avec du son" (1 video with sound)); those with a music name (`Music`, `Songs`, `Topper`, `Attract`…) first, then `medias\`, then the others.
  A PuP-Pack folder is named after its pack ("PuP-Pack gotg_2020 › Topper").
  A single folder: its files open directly.
- **Listening**: each file is a card; the selected card's sound plays, looping, and stops as soon as another card is selected or the screen is left (one sound at a time, as in the suggestions).
  Meanwhile the menu music goes silent, and resumes when leaving the screen (`previewsSound` in `app/src/library.ts`, read by `soundView` in `app/src/frontend.ts`): before, the table's music played over the music suggestions.
  Start takes it.
- **What is shown**: sound files (mp3, ogg, m4a, flac, wav), and MP4 videos (`.mp4`, `.m4v`, `.mov`) that have an audio track the menu can play (AAC, MP3, Opus or FLAC), with that track's duration.
  Not the backup copies and options of a pack (`Topper.orig`, `_backup`, `PuP-Pack_Options`…), nor the empty files of packs ("@blank.mp4", "30 Second Blank Mp3"), nor silent videos.
  A table stored in the shared tables folder: only its files in `medias\` (the rest of the folder belongs to the other tables).
- **From a video, only the sound**: its audio track is extracted into an `.m4a`, without re-encoding (the track is copied as is into a new file, `packages/core/src/mp4audio.ts`; there is no ffmpeg on the cabinet), kept in `<données>\cache\sons\`.
  The 2.6 s intro of the *Guardians of the Galaxy* pack (1 MB of video) gives a 46 KB sound.
  A fragmented video, or one whose sound is in a format Chromium cannot play (AC-3), is refused, with the reason.
- **Nothing is moved**: the choice goes into the "Médias du jeu" (Game media) draft; on save, the file is **copied** into `medias\` under the media's name (`(Audio) <table>.mp3`, `(AudioLaunch) <table>.m4a`), and the original stays in the pack, which still needs it.
- **Code**: `packages/core/src/tablesounds.ts` (inventory), `packages/core/src/mp4audio.ts` (an MP4's audio track, extraction), tests in `packages/core/src/test/tablesounds.test.ts` (fake MP4s: moov in front or behind, `co64`, uneven chunks, refusals); screen in `app/src/media-sounds.ts`, hooked into `app/src/library-medias.ts`.

### ROM music

A ROM table with no game music gets its ROM's music: Cyber Pinball runs the ROM in PinMAME, with no screen and no sound, drops coins, presses Start and keeps the music of the game start.
Nothing to do: it is automatic, in the background.
To keep it as the game's real music, or to record it right away: table details screen > "Médias du jeu" (Game media) > "Musique du jeu" (Game music) > **"Musique de la ROM" (ROM music)**.

- **Which tables**: those whose script loads a ROM (aliases included: Star Trek asks for `st_162h` and loads `st_161h`) and that have no `(Audio)` of their own.
  One ROM serves every table that loads it.
- **When**: one minute after the menu opens, then one minute after each game; one ROM at a time, about a minute each (54 emulated seconds: boot, Escape at 12 s to get past the "factory settings" screen of a blank memory, four coins at 20 s, Start at 24 s, then at most 30 s kept).
  **Never during a game**: as soon as a game is being prepared, the recording in progress stops, without counting as a try, and resumes later.
  Not on the Windows desktop either.
  Off screen (unattended tests), nothing starts by itself.
- **No screen, no sound**: a separate process, `CyberPinball.exe` in Node mode (`app/src/enregistreur-rom.ts`), with no window, at a lower priority than the menu.
  Through koffi it loads the `pinmame64.dll` of the PinMAME plugin of the active VPX version (`<racine>\emulators\vpx\current\plugins\pinmame\`); libpinmame plays nothing itself, it hands its sound over through a callback.
  One process per ROM: libpinmame has a single global state, and a ROM that brings PinMAME down only brings that process down.
- **The table's memory is never touched**: PinMAME works in `<données>\cache\musiques-rom\travail\`, on a copy of the `.zip` files (those of `<table>\pinmame\roms`, then those of the same family in the ROM library), with blank NVRAM and settings.
  A work folder inside a table's folder is refused (`prepareRomScratch`).
  High scores, credits and settings stay the cabinet's.
  The folder is emptied after each recording.
- **Balls and mechanisms**: a machine started with an empty trough looks for its balls and stays silent.
  The trough switches are read from the table script (the `.vbs` next to it, if there is one): `bsTrough.InitSw 0, 21, 20, 19, 18` (the first one is the entry), `.InitSwitches Array(…)` of a `cvpmTrough`, or `Controller.Switch(n) = 1` in a `_Hit` that mentions the trough.
  To these are added the switches of the mechanisms the script simulates, at their rest position (`.AddSw 84, 0, 1`): without them, *The Addams Family* thinks its "Thing" hand is stuck and refuses the game, Start does nothing.
- **What is kept**: from Start on (the coins before it are dropped), from the first sound to the last one before 3 s of silence, at most 30 s.
  The DC offset is removed (WPC sound boards output an offset of about −20 dBFS even when silent, which hid every silence), the sound is normalized to 80% of full scale and ends with a 1.5 s fade.
  It is encoded in **Opus** into an `.ogg` (96 kbit/s, about 360 KB for 30 s) by the Chromium engine, in the converter's hidden page (`audioToOggOpus`, `app/src/media-convert.ts`; container written by `oggOpusFile`), and stored in `<données>\cache\musiques-rom\<rom>.ogg`.
- **In the menu**: played when the game has no music of its own, before the cabinet's (`resolveMedia`, source `rom`); "Médias du jeu" (Game media) shows it as "À la place : musique de la ROM" (Instead: ROM music).
  It stays in the cache: "Trouver les médias manquants" (Find missing media) and VPinMediaDB can still set real music.
- **"Musique de la ROM" (ROM music)** (table details screen > "Médias du jeu" > "Musique du jeu"): already recorded, "t2_l8, 30 s, enregistrée le … : Start pour la prendre" (t2_l8, 30 s, recorded on …: Start to take it) puts it in the draft, copied into `medias\` as `(Audio) <table>.ogg` on save; it is also among the suggestions ("Voir les propositions" (See suggestions), source "Musique de la ROM").
  Not made yet: Start records it right away (about a minute), and the screen updates when it is ready.
  Silent or failed: the reason, and Start to try again.
- **Silent ROM, failed ROM**: `<données>\cache\musiques-rom\etat.json` keeps each try (`ok`, `silent` or `failed`, the date, the number of tries, the switches, the reason).
  A **silent** ROM (less than 3 s of sound after Start) is **never retried automatically**.
  A failed ROM (PinMAME does not start it, stops, stops giving sound, or takes more than 3 minutes) is retried once more, then no longer.
  The log describes each recording (switches, duration, size) and, for a silent ROM, what the display showed.
- **Measured on real ROMs** (12/11/2026, development PC, `pinmame64.dll` of VPX 10.8.1, by the service itself; ROMs and tables of the reference cabinet and of the PinCab):

  | Table | ROM | System | Switches | Kept | Size | Real time |
  | --- | --- | --- | --- | --- | --- | --- |
  | Terminator 2 | `t2_l8` | Williams WPC (DMD) | 17, 16, 15, 33 | 30.3 s, mono | 360 KB | 58 s |
  | The Addams Family | `taf_l7` | Bally WPC (Fliptronics) | 15, 16, 17, 82, 84 | 29.3 s, mono | 348 KB | 56 s |
  | Back to the Future | `bttf_a27` | Data East (alphanumeric) | 11, 12, 13 | 30.3 s, stereo | 360 KB | 59 s |
  | Star Trek (Enterprise LE) | `st_161h` (script `st_162h`) | Stern SAM | 21, 20, 19, 18 | 30.3 s, stereo | 359 KB | 58 s |
  | The Walking Dead (LE) | `twd_160h` | Stern SAM | 21, 20, 19, 18 | 30.3 s, stereo | 359 KB | 57 s |
  | Aliens (Original 2020) | `sorcr_l2` | Williams System 9 | 30, 29 | 30.3 s, mono | 360 KB | 56 s |

  All of them start a game (display read back: "BALL 1", credits) and play without a break to the end of the 30 s; each table's `pinmame` folder is identical before and after.
  Without the rest switches, *The Addams Family* stayed in attract mode.
  Three traps cleared on the way: PinMAME reads the keyboard on every frame (about a hundred keys) and each read goes through the process's main thread, hence a keyboard switched on only around the presses (otherwise emulation fell to a quarter of its speed); a direct call to libpinmame while it was waiting for a callback blocked both (every call is asynchronous); `koffi.view` brings the process down under Electron (V8 memory cage), so the bytes are copied with `koffi.decode`.
  The sound was checked through its levels and by decoding the `.ogg` in Chromium, not yet listened to on the cabinet.
- **Limits**: a table with a protected script does not give its switches, the ROM is tried without them; a mechanism whose rest is not at position 0 is not covered.
  What a ROM plays at the start of a game is not always its finest music (often ball 1's): "Sons de la table" (Table sounds), VPinMediaDB or a file are still there to replace it.
- **Based on** VRTableManager by Mike (mikebm), MIT licence ([github.com/mikebm/VRTableManager](https://github.com/mikebm/VRTableManager), `RomAudio.cs` and `RomRecorder.cs`): separate process, blank NVRAM, Escape then coins and Start, trough switches read from the script, cut at the first silence.
  Its licence is in `packages/core/LICENSE-VRTableManager.txt`.
- **Code**: `packages/core/src/romaudio.ts` (switches, schedule, work folder, cut, Ogg Opus, state), `app/src/enregistreur-rom.ts` (the PinMAME process), `app/src/rom-music.ts` (queue, pause, encoding), `app/src/library-medias.ts` and `app/src/media-proposals.ts` (screens).
  Tests: `packages/core/src/test/romaudio.test.ts` (switches from real scripts, presses at emulated time, DC offset, cut, Ogg pages and their CRC, silent ROM never retried, table NVRAM never touched, fallback and suggestion).

### Community site media

PinUP Popper is not on the cabinet: Cyber Pinball replaces it.
Its media server can only be reached from Popper Setup, but the same authors post on the forums, with a free account.
The suggestions for each media item search them, in the session of the "Récupérer" (Get) window (where you sign in yourself; Cyber Pinball never sees a password).

- **VPForums first**: 808 complete media packs, 4,153 logos, 1,829 videos.
  Its search is for members only: without a sign-in, the "Se connecter à VPForums…" (Sign in to VPForums...) action says so and opens its sign-in page.
- **VPUniverse as a last resort**: about 24,000 menu media (logos, playfield, backglass, DMD and topper videos, loading videos, cards, launch sounds, flyers), but **about 45 s of waiting before each file** with a free account, and a limited number of downloads.
  Its results show without an account; downloading needs one.
- **Search**: when a media's suggestions open, each site's results pages for each title (the title of each selected game without its subtitle, "terminator 2", or what was typed in "Chercher un autre titre…" (Search for another title...)), read in a hidden view, three at most (`SITE_SEARCH_PAGES`, 25 entries per page on VPUniverse).
  VPUniverse searches only the categories of the open media (`siteSearchNodes`: "Topper Videos" and "Topper Images" for the topper): with all categories mixed, Game of Thrones' 16 wheels filled the first page and its toppers fell to the next ones (8 toppers in their categories, 4 on the mixed first page).
  VPForums does not filter by category: one search serves every media.
  The page script (`SITE_SEARCH_PROBES`) takes as title the entry's link that has text: signed in, VPUniverse puts an "unread" dot before each entry not yet seen, a link to the same entry without text, which the script took for the title.
  What the script returns is checked (`checkSiteSearch`): an untitled entry is dropped and logged to the console; if most are, the "Chercher plus" (Search more) tile says "page de résultats illisible" (unreadable results page) instead of counting the entries elsewhere.
  The scripts run in the tests on a real saved results page (`packages/core/test-pages/`), as a visitor gets it and as a member sees it.
  The sites have no line before the suggestions (17/11/2026: one line per site came before the first result): their state sits on the tiles ("≈ 45 s d'attente", wait; "Connexion nécessaire", sign-in needed) and in the actions ("Se connecter à …", Sign in to …); a site that could not search says so on the "Chercher plus" (Search more) tile.
  Results are kept for half an hour; nothing is searched in the background.
  Each result keeps its title, category, author, date, download count and the thumbnail posted by the author (a still image, even for a video).
  The tile shows the downloads as an icon (a down arrow) and a number, never in words (`MediaCard.downloads`).
- **Matching**: the title of each result, stripped of the media words ("Topper Video", "Animated Wheel"...), is checked against the whole VPS database; it only counts if it points to a selected game (a "Terminator 3" result is not taken for Terminator 2).
  The media type comes from the category ("Topper Videos": topper); for VPForums' mixed videos, from the title; a complete pack counts for every media item.
- **Entries listed by the VPS database**: the `wheelArtFiles`, `topperFiles` and `mediaPackFiles` lists of each selected game point to VPUniverse and VPForums entries (3,157 logos on VPUniverse and 375 on VPForums on 11/12/2026; mega.nz links and links reported dead are left out).
  They are offered with no search or request, assigned to their game without matching the title (`vpsSiteHits`, `SiteHit.vps` field): some cannot be found by title (under The Matrix, "any", a "Wheel Mega Pack"), and VPForums ones show even without an account, its search being for members only.
  With no thumbnail, they come after the search results.
- **Search more** (last tile of the suggestions gallery, like a next page; `State.wide`): up to `SITE_SEARCH_MORE_PAGES` pages (10) per title instead of 3, entries for every edition the deep search recognized surely (score of at least 0.6, or another edition of the game; not Dominatrix for The Matrix), and titles that have all the searched words without surely naming a selected game, assigned to the first selected game, marked "Close title" and placed last (`siteOffers(…, loose)`).
  "Terminator 3" is still not taken for "terminator 2": it lacks the "2".
  Once the search is wider, the tile goes away; the "Recherche simple" (Simple search) action brings it back.
  The state holds for the table until the end of the visit, even after "Search for another title…".
- **Animated only** (`animatedOnly`, kept from one media item to the next like the sort order; logo, playfield, backglass, displays, topper: `ANIMATABLE_MEDIA_TYPES`): only videos and animated images remain (`mediaChoiceAnimated`): an entry from an animated category or called animated by its title ("Animated", "APNG", "GIF", `hitAnimated`), an image on disk whose header says it is animated (APNG `acTL`, GIF `NETSCAPE2.0`, animated WebP; `readMediaDimensions`, read once per visit), an online file in APNG or GIF.
  The site search changes too: VPUniverse searches only the media item's animated categories ("Animated Wheel Images (APNG)" for the logo, "Topper Videos" for the topper, `siteSearchNodes(…, animated)`), otherwise a well-known game's still logos come first; VPForums, which mixes still and animated logos, gets the word "animated" (`siteSearchTerms`).
  The card of an animated image entry says so ("animated").
- **Added words** ("Add words to the search…", `State.extra`): added to the searched title on both sites ("matrix neon") and in "Search the web…" (`webSearchQuery(…, { extra, animated })`).
  Suggestions that do not have them, in their title, their detail, or their entry's title or author, are hidden; an entry found by VPUniverse is kept, its "and" search having found the words at least in its description.
  Empty: removed.
- **What the filters hide**: the lead counts the hidden suggestions ("8 propositions (3 masquées)", 8 suggestions (3 hidden)), and an empty screen offers "Search more" or the web, instead of passing for an empty source.
  The number of suggestions shown elsewhere (overview) ignores the filters.
- **Queue**: Start on a card puts it in its site's queue, one file at a time per site, each site on its own.
  The download happens in a hidden view, and the file's page opens at the same time in the "Récupérer" (Get) window (banner: "Cyber Pinball télécharge ce fichier pour le média…" (Cyber Pinball is downloading this file for the media item…), in green: information, not a warning; the progress has its line there); **VPUniverse's timer runs in the page**, as for a member who clicks: the page asks the server for the wait, counts down, then starts the file, and the card shows the seconds left ("Attente du site · 31 s" (Site wait · 31 s)).
  Cyber Pinball waits and shortens nothing.
  Start on a queued card removes it; "Arrêter la file" (Stop the queue) stops everything.
  A download cap stops that site's queue; a page that asks for something (several files to choose from, terms, a check) opens in the visible window, and the file downloaded there goes back to the media item.
- **Receiving**: the file is stored in `<téléchargements>\sites\<site>-<entry>\fichiers`, the archive unpacked; a pack laid out the Popper or PinballX way gives each file's type by its folder.
  Received files are recorded in `<téléchargements>\sites\recus.json` and suggested on later visits, for this media item as for a pack's other screens ("Reçu de VPForums" (Received from VPForums)).
  The file awaited by the last card chosen for a media item goes into the draft by itself; another choice made in the meantime is never replaced.
  Nothing is written to `medias\` before "Enregistrer" (Save); the source (site, entry address) goes into the `.info`.
- **Code**: `packages/core/src/mediasites.ts` (categories, addresses, results page scripts, matching, count per media, web search, received files), `sitesessions.ts` (timer, `WAIT_PROBES`), `app/src/media-sites.ts` (search, thumbnails, queue, received files), `app/src/acquire-window.ts` (hidden view, download recipient), `app/src/media-proposals.ts` (cards); tests in `packages/core/src/test/mediasites.test.ts`.
  The test bench calls the garbage collector during every wait: a hidden view nothing holds any more would vanish at the whim of a GC, and closing it afterwards threw "Object has been destroyed"; `acquire-window.ts` therefore keeps each hidden view until it is closed (`hiddenViews`, `closeHidden`, invariant test in `offscreen.test.ts`).

### Free search: "Chercher moi-même sur le web…" (Search the web myself...)

When the connected sources do not have what you need (game music for Guardians of the Galaxy, when the suggestions only have toppers), you search yourself in the built-in browser, and Cyber Pinball sees what you download arrive.

- **Entry**: on each media item's screen (table sheet > "Médias du jeu" (Game media) > a media item), right after "Voir les propositions" (See suggestions), **"Chercher moi-même sur le web…" (Search the web myself...)** opens the "Récupérer" (Get) window without waiting for the suggestions search.
  Its detail gives the search text ("Built-in browser, free search: “Guardians of the Galaxy table music vpinball”"), "Resumes the page where you left off" once the window is closed, or "Downloading: 1.2 MB of 3.4 MB…" during a download.
- **Bar**: the window opens on a pre-filled DuckDuckGo search (table title without manufacturer or year, screen words in English, "vpinball": `webSearchQuery`, `packages/core/src/mediasites.ts`).
  Under the usual line, a search line: the **Web**, **Images**, **Videos** (DuckDuckGo) and **YouTube** engines, the field and **"Chercher" (Search)** (`webEngineUrl`, `packages/core/src/webmedia.ts`).
  The field keeps the text of the last results page, even on the pages after it; switching engine runs the same text again.
  While you type in the field, keys are not cabinet buttons; Esc always closes.
  The "Retour à la fiche" (Back to the entry) button becomes "Retour à la recherche" (Back to the search).
  Closing (Esc, Exit, Alt+F4) keeps the page and its history; the window reopened for the same media item resumes where you left off, with the search text.
  The status line is a how-to ("the file is checked, then offered for “Musique du jeu”"), not a warning.
- **Video pages**: every page loaded, or changed without reloading (YouTube), is read by a probe (`VIDEO_PAGE_PROBE`): a YouTube video (watch, shorts, youtu.be), Vimeo, Dailymotion, or a `<video>` element on another page.
  One more line describes it ("YouTube video: “…” · 2:47").
  When the page plays an ordinary video file (http(s) address), **"Télécharger cette vidéo" (Download this video)** downloads it like a link and it comes back to the media item, sound included (for music, it is extracted).
  YouTube, Vimeo and Dailymotion play a segmented stream (`blob:`): the line offers **"Récupérer le son" (Get the sound)** and **"Récupérer la vidéo" (Get the video)** through yt-dlp (see below), the move expected for this media item lit first (the sound for music and the launch sound, the video for a screen).
  The title is read from the live page: YouTube does not update its meta tags from one video to the next.
- **yt-dlp**: the tool that gets the video or the sound of a YouTube, Vimeo, Dailymotion… page, **alone, without ffmpeg**.
  It does not ship with Cyber Pinball: the **first** request downloads it from the official repository's GitHub releases (`yt-dlp.exe`, about 18 MB, the bar's line says so before the click), checks it against **two SHA-256 hashes** that must agree (the one GitHub's API gives for the file, and its line in the same release's `SHA2-256SUMS`; a file that differs is deleted, never run) and stores it in `<racine>\tools\yt-dlp` with `version.json` (`packages/core/src/ytdlp.ts`, `app/src/ytdlp-tool.ts`).
  A new release is looked for at most once a week, on use, and replaces the old one with the same checks; with no network, the installed tool is used as is. yt-dlp never updates itself (`--no-update`).
  Without ffmpeg, only single-file formats: **the sound alone as M4A** (accepted as is by the music, can be trimmed), otherwise the best sound (WebM Opus, converted to WAV); **the video alone as MP4** H.264 up to 1080p (silent, which is enough for a menu screen).
  A single file, never a playlist (`--no-playlist`), no user configuration read (`--ignore-config`).
  For YouTube, yt-dlp needs a JavaScript engine: Cyber Pinball's executable stands in for it (`--js-runtimes node:<executable>`, `ELECTRON_RUN_AS_NODE=1`, Node 24; yt-dlp needs Node 22 at least).
  The retrieval has its line in the bar, like a download (installation, then percentage, amount, speed), and "Annuler" (Cancel), or Start then Start on the cabinet, stops yt-dlp and what it started, keeping nothing.
  The file received goes through the same check and the same "Received" screen as a download.
  A failure gives its reason ("private video", "YouTube asks to prove you are not a robot…", "network unreachable"…). yt-dlp is only offered for a search started from a media item.
  YouTube's terms only allow downloading where the service permits it: what you get is your own call.
- **Detection**: every file downloaded in the window comes back to it (`will-download`, the page's recipient); during the search, **Windows Downloads** is watched too (`watchDownloads`) for what you get in your own browser ("Ouvrir dans mon navigateur", Open in my browser): only media and archives that arrive after opening count (`isMediaDownload`), copied (the original stays where it is), a file still being written (`.crdownload`, `.part`) ignored.
  Watching stops when you leave the table's media, at most two hours later.
- **Check** (`judgeWebFile`, `packages/core/src/webmedia.ts`): each file, archive unpacked, is judged for the media item from its **content** (first bytes, `sniffMedia`), not only its name: **accepted** as is (a WebM video named `.mp4` is stored as `.webm`), **to convert**, or **refused** with its reason ("web page saved under a file name: the site sent back a page instead of the file", "an image, whereas “Musique du jeu” needs: mp3, ogg, m4a, flac, wav", ".mkv video the menu does not play; converting it would need an external tool (ffmpeg)", "unknown format (.txt)").
  A file of a pack laid out for another screen goes to it.
  Everything is noted in `<téléchargements>\sites\web.json` (`files`, `convert`, `refused`, `windows`); what is of no use is not kept.
- **Conversions with no external tool** (`app/src/media-convert.ts`): Chromium's engine decodes, in a hidden page (a view with no window, in a separate session whose every address is served by the application, with no network): an image (JPEG for the logo, BMP, AVIF, ICO) is redrawn as **PNG**; a sound the menu does not play (Opus, AAC, WebM) or the **sound of a video** (MP4, WebM, MKV, MOV) is decoded, trimmed and written as 16-bit 44.1 kHz **WAV** (`wavFile`).
  An MP4 or MOV video can also give its sound track **as is**, as `.m4a`, with no re-encoding ("Take its sound as is (.m4a) and assign", `extractMp4Sound`, the same means as "Sons de la table" (Table sounds)).
  A video in a format the menu does not play is not converted.
- **"Reçu pour « … »" (Received for “…”) screen**: it opens by itself behind the window as soon as the file arrives, if the table's media are still open.
  It shows the file with its preview (a sound plays when its card is selected), its state ("Accepted as is", "To convert to PNG", "Video sound, to extract to WAV"), **what will be written** ("Stored as “(Audio) Guardians of the Galaxy (Stern 2017).wav”") and what goes to the trash, then the refused files and those that go to other screens.
  Actions: **"Affecter à « … » et enregistrer" (Assign to “…” and save)** (or "Convert to PNG, then assign"), "Put in the draft" (writes nothing, with the other changes), "Back to the search" (resumes the page), "Keep for later" (stays in the suggestions).
  Several useful files: one screen shows them all, you choose.
  Nothing usable: "Received: nothing usable for “…”", with the reasons.
- **Trimming a sound** (game music, launch sound): "Trim, then assign…" shows two cards, **the excerpt** (it plays when the card is selected, on "Assign this excerpt") and **the waveform** of the whole sound (`waveformPng`), the kept part in signal green on a lit band, the rest in dimmed teal, the fade-out darker.
  Actions: "Start later / earlier", "End later / earlier", "Step: 1 s / 5 s / 15 s", "Fade-out: yes / no" (2 s), "The whole sound".
  Offered first: the first ten seconds for the launch sound; the whole sound, up to three minutes, for the music (with a fade if it is cut).
  The excerpt is redone in the background on each change (the decoded sound stays in the hidden page).
- **Immediate assignment**: "Assign … and save" writes **this media item only** at once (`planSingleMedia`, `packages/core/src/mediaedit.ts`, same plan and same trash as "Enregistrer" (Save)): the file copied into `medias\` under its name, the old one to the trash, the origin (host and address, or "Windows Downloads") in the `.info`; the table is read again for the menu.
  The draft's other changes stay to be saved; this media item's, replaced, is dropped.
  It is the only write that skips the plan screen: the "Received" screen has shown what would be written.
- **Code**: `packages/core/src/webmedia.ts` (engines, `sniffMedia`, `judgeWebFile`, WAV, trimming, waveform, video page probe), `app/src/media-web.ts` (entry, "Received" and trim screens), `app/src/media-convert.ts` (conversions), `app/src/media-sites.ts` (reception, check, Windows Downloads), `app/src/acquire-window.ts` and `app/renderer/acquire.*` (search bar, video page); tests in `packages/core/src/test/webmedia.test.ts` and `ytdlp.test.ts` (including the probe on its sample pages `youtube-video.html` and `video-directe.html`, as a visitor and as a member, detection with a fake "Récupérer" (Get) window and a fake Downloads folder, assigning a single media item).

### Recording a game for the wheel

A table's presentation video on the wheel (the playfield full screen, on a cabinet) is first of all the table in real conditions.
Cyber Pinball films it while you play, with nothing to download or install: Chromium's screen capture (Windows Graphics Capture, frames kept on the graphics card) and the MediaRecorder encoder (MP4, H.264, AAC sound), inside the application's Electron.

- **Entry**: table sheet > **"Jouer et enregistrer"** (Play and record) (door `sheet.record`, closed in guest mode).
  The preparation screen says what will be filmed and starts it: "Lancer et enregistrer" (Launch and record).
  Its settings, kept for next time in `<data>\enregistrement.json`: **screens filmed** (always the playfield; the backglass and the display as you choose, when the cabinet has them), **start** (0, 5, 10, 20, 30 or 60 s after the table appears; 10 by default), **length** (15, 30, 45, 60 or 90 s; 30 by default), **game sound** with the playfield video (yes by default), playfield **video quality** (4K, 1440p, 1080p or 720p; 4K by default, each choice states the weight of a take of the chosen length).
  The quality can also be set in System > "Médias, son et attente" (Media, sound and attract) > **"Qualité des parties enregistrées"** (Recorded game quality) (Start cycles through the choices); both write the same file, and a file from before this setting (then capped at 1080p) moves to 4K.
- **Why no gesture during the game** (options weighed): 1. a button combination in game, read by Cyber Pinball while VPX has the foreground: every cabinet button already belongs to VPX (both MagnaSaves open its menu, Start launches a ball, Exit quits), one more gesture would also trigger the VPX action; 2. a keyboard shortcut (Ctrl+Shift+…): useless on a cabinet without a keyboard; 3.
  **recording armed from the sheet, automatic start and end**: chosen, no button is hijacked, nothing can fire by mistake during a real game, and the player knows in advance when it starts and when it stops.
- **The two events** (`advanceRecording`, [packages/core/src/gamerecording.ts](../../packages/core/src/gamerecording.ts)): **`recording-start`**, when the VPX game window has held the foreground (the launcher's `onForeground`) for the chosen delay, to skip the VPX fade-in; **`recording-end`**, at the first of: the length reached (clean end: 0.4 s fade to black, the wheel loop restarts without a jolt; a fade-in too), the table left (VPX closed: the last half second, held back before being written, is dropped, so what comes before the closing is never in the video), a capture failure.
  An end under 5 s keeps nothing.
  The log says "Enregistrement (…) : événement de début." and "… : événement de fin (duration, game-end or failed).".
- **Witness**: a discreet pill in the corner of the playfield, bottom left for the player (flipper end, where the eyes are: at the top right, at the far end of the table, it went unseen), turned like the menu (`indicatorBounds`), never in the video (window excluded from capture, checked on a 4K take): green ring and "Enregistrement dans 7 s" (Recording in 7 s) during the delay, a slowly beating red dot, "REC" and "0:12 / 0:30" while recording, then "✓ Enregistré · 0:30" (Recorded) for three seconds (or, in amber, "Trop court : pas gardé", Too short: not kept).
  Transparent window, no focus nor click, above VPX, **excluded from capture** (`setContentProtection`, WDA_EXCLUDEFROMCAPTURE since Windows 10 2004): the video never contains it.
  It is the only Cyber Pinball window left on top during a game (exception bounded by `pupvisible.test.ts` and `buttons.test.ts`: one corner of the playfield, never the focus, removed three seconds after the end).
  Page `app/renderer/recording.html` (a single red accent, a low-amplitude beat, still when Windows reduces animations).
- **Capture** (`app/src/game-recording.ts`, `app/renderer/recorder.js`, a window never shown): one capture per filmed screen, at the size just needed (a 4K screen filmed in 1080p is captured at 1920 × 1080; in 4K, at its full size); each role takes **the zone where VPX draws it** there (backglass and DMD sharing a screen: each its band).
  The playfield is **always rendered in portrait, flippers at the bottom** (`uprightRotation` from the edge where VPX draws the flippers, `orientationFacts`), at the chosen resolution at most (2160 × 3840 in 4K, 1440 × 2560, 1080 × 1920 or 720 × 1280), **never above the screen** (a 1080p playfield stays 1080p): that is the standard the wheel knows how to turn (`mediaFlipperEdge`), and it shows it exactly as the player saw it, in every screen orientation; a desktop playfield (landscape, flippers already at the bottom) is cropped in the centre to 9:16.
  Backglass and DMD keep their orientation, scaled to 1280 wide at most.
  **Frame rate**: 60 frames per second (`RECORDING_FPS`), the rate at which VPX draws the table.
  Capture goes through the graphics card (`RECORDING_CHROMIUM_FEATURES`: `WebRtcAllowWgcUsingTexture` and `ZeroCopyDesktopCapture`, added to `--enable-features` at startup): the ordinary capture (DXGI) copies each frame through the processor and allows itself no more than half a core, i.e. 25 frames per second at best in 4K (20 to 25 measured in a game on a 4K cabinet, 12/11/2026); this one holds 56 to 57.
  **Bitrate** from the size and frame rate produced (`recordingBitrate`: 0.14 bit per pixel per frame at 30 frames/s, one and a half times that at 60, i.e. about 52 Mbit/s in 4K and 13 in 1080p, 3 at least).
  MediaRecorder spreads the requested bitrate as if each frame lasted 1/30 s, whatever the frame rate: at 60 frames/s it wrote twice too much (98 Mbit/s for 52, 367 MB for 30 s on a 4K cabinet); so it is asked for half (`mediaRecorderBitrate`, `MEDIARECORDER_ASSUMED_FPS`), and the log notes each file's real bitrate against the target, "DÉBIT TROP HAUT" (bitrate too high) beyond one and a half times (`RECORDING_MAX_BITRATE_RATIO`); **codec** H.264 High at the level that size requires at that rate (`h264CodecLevel`: 4.0 in 720p, 4.2 in 1080p, 5.1 in 1440p, 5.2 in 4K), otherwise WebM VP9 if MediaRecorder refuses MP4.
  The sound is Windows' (output loopback), on the playfield video only.
  **VPX plumb bob**: VPX draws its simulated plumb bob into the playfield image (`src/ui/live/PlumbOverlay.cpp`, the same in 10.8.1), a red circle and a dot at the player's bottom left as soon as a nudge moves it, faded out in two seconds; it ended up in the videos of cabinets with an accelerometer.
  No setting hides it on its own: the recorded game gets a separate INI (`<data>\enregistrement\VPinballX.ini`, `recordingini.ts`), the cabinet's with `[Player] SimulatedPlumb = 0`; during the take, nudges move the ball but do not tilt (a wired plumb bob stays active).
  When it quits, VPX rewrites that INI: what it changed during the game goes back into the cabinet's INI, except the plumb bob (`recordingIniCarryBack`).
  Nothing to do without a simulated plumb bob, nor for a game in the headset.
  **Written frame rate**: at the end, each file is read back (`readVideoCadence`, `packages/core/src/videocadence.ts`: plain or fragmented MP4, no dependency); the log notes its frames, its rate and its largest gap ("playfield, 1790 images en 30.0 s, 59.7 images/s pour 60 demandées, écart max 34 ms"), and "CADENCE BASSE" (low frame rate) below 80% of the requested rate (`recordingCadenceLow`); the take's preview gives the measured rate.
- **Back from the game**: the **"Enregistrement de la partie"** (Game recording) screen previews each video, what it would replace, its size and length, then: **"Utiliser pour la roue"** (Use for the wheel) first opens the plan (`planMediaChanges`: the video stored in `medias\` under the game's name, the old media to Cyber Pinball's recycle bin, the old one's forced half-turn removed); nothing is written before **"Confirmer"** (Confirm), then the wheel shows the new video.
  **"Garder de côté"** (Keep aside) (and Exit) changes nothing on the wheel: the file waits in `<data>\enregistrements\<.vpx name>\(Playfield) YYYY-MM-DD HH-MM-SS.mp4` and comes first among that media's proposals ("Médias du jeu" > the media > "Voir les propositions", source "Enregistré en partie sur cette borne", Recorded in game on this cabinet).
  **"Rejouer et enregistrer"** (Play and record again) starts over (the first stays aside).
  **"Jeter l'enregistrement"** (Discard the recording) sends it to the recycle bin.
- **Simulated game** (off-screen tests): no screen is captured; the recorder draws a fake table the way VPX would draw it (red band at the top, green flippers at the bottom), the rest of the path is the real one.
  Unattended, the recorded game lasts the delay and the length, plus 3 s; `CYBERPINBALL_PARTIE_MS` shortens it (end by leaving the table).
- **Proof**: [enregistrement-partie.test.ts](../../packages/core/src/test/enregistrement-partie.test.ts) (events, delay, length, leaving, failure, witness, fade, settings, playfield orientation in the four orientations round trip with the wheel, desktop crop, shared zones, files, proposals).
