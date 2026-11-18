[Français](../manuel/pup-packs.md) · English · [Manual contents](../manual.md)

## PuP-Packs

Cyber Pinball targets **VPX 10.8.1 plugin mode**: the PUP plugin shipped with VPX replaces PinUP Player, so there is nothing to install or register (classic mode will come later, DOF goes through the VPX DOF plugin: see [LED and feedback (DOF)](led-and-feedback-dof.md#led-and-feedback-dof)).
The plugin looks for the pack in `<dossier de la table>\pupvideos\<nom>`, case-insensitively, where `<nom>` is the value the script passes to `PuPlayer.B2SInit` or `Init`, or failing that the ROM being played.

**When adding** ([packages/core/src/puppack.ts](../../packages/core/src/puppack.ts), [tableimport.ts](../../packages/core/src/tableimport.ts)), a pack (a folder containing `screens.pup`, `playlists.pup`, `triggers.pup`, or options that contain them) is:

- **named** the way the script loads it: name passed to `B2SInit` (a literal, or a variable such as `pGameName`, `cPuPPack`), then the ROM, then the name passed to `Init`.
  A pack already correctly named keeps its name; a pack named otherwise ("Monster Bash PuP-Pack v2") takes the expected name.
  Without a readable script (VPX missing), it keeps its folder name and the plan points this out;
- **flattened**: `rom\rom\…`, or an archive folder that contains only the pack (a readme next to it does not get in the way);
- **cleaned**: `._*`, `.DS_Store`, `__MACOSX` and 0-byte MP4 files are not installed;
- **replaced entirely** if it already exists: the old folder goes to the recycle bin, never a mix;
- **configured**: the screen layout option is applied by copying its files, **without ever running a `.bat`**.

**Options.**
Published packs store their variants in `PuP-Pack_Options\<option>\` and ship one `.bat` per option at the root, for example `Option 2 - FullDMD on Backglass.bat`:

```bat
rem echo off
xcopy /y "PuP-Pack_Options\Option 2 - FullDMD on Backglass\*"
del /Q PuPDesktopPunch.exe
del /Q PuPInit.bat
```

Every `.bat` whose name mentions an option (or that copies files) is **read, not run**.
Recognized: `copy` and `xcopy` of a folder, a pattern (`*`, `*.pup`) or a file of the pack to its root or one of its folders (`/s`, `/e` to recurse), `del`/`erase` of files at the root (they go to the recycle bin), and anything with no effect: `rem`, `::`, `echo`, `@echo off`, `pause`, `cls`, `exit`, `title`, `cd`/`pushd` to the `.bat` folder (`%~dp0`, `.`), `>nul`.
Anything else makes the analysis fail: absolute path, `..`, variable (`%PUPDIR%`), `start`, `if`, `for`, `call`, `set`, `move`, `ren`, `rd`, chaining (`&`, `|`), redirection to a file, copy with no matching file.
Option folders with no readable `.bat` (packs shipped with only `PuP-Pack_Options`, like those applied by hand on Linux) also become options.
Classic-mode tool `.bat` files (`PuPInit.bat`, `configdisplays.bat`) are ignored.

**Choosing the option**, automatically, based on the cabinet model: the option name ("Topper", "FullDMD on Backglass", "2 Screen", "Desktop", "16x9", "4x3", "AIO", "Stream"…) and then its `screens.pup` (screen 0 on: topper; screen 5 or 1 inside the backglass through CustomPos: DMD in the backglass) are compared with the assigned roles (backglass, DMD, topper) and with the aspect ratios of the DMD (real 4:1 or FullDMD 16:9) and of the backglass.
A desktop or all-in-one cabinet option is never picked on a cabinet.
If the choice is not clear-cut, if the cabinet is not configured, or if a `.bat` could not be read, the "Quelle option du PuP-Pack ?" (Which PuP-Pack option?) screen opens before the plan, showing the rejected `.bat` and the reason; from the plan, "Changer l'option du PuP-Pack" (Change the PuP-Pack option) reopens it.
The chosen option and the pack's original name are kept in the table's `.info` (`CyberPinball.pup.<nom>`, other fields are preserved): when the pack is updated, the same option is reused without asking.

**DMD frame on the backglass.**
Many packs have neither a DMD screen (1) nor a FullDMD screen (5), but a screen placed on the backglass whose name or playlist mentions DMD (*Star Trek LE*: screen 13 "BGdmdText", at 26 %, 79 %, over 48 % × 21 % of the backglass).
When it is on, the pack plays its own animations there: the real DMD stays on its own screen (option for a cabinet with a DMD).
When it is off, the frame stays empty so the DMD can be placed there (option for a two-screen cabinet).
With no screen 1, no screen 5 and no frame, nothing about the DMD is inferred from `screens.pup`: a pack without a DMD screen does not mean "cabinet without a DMD".
The ROM's DMD cannot show inside a pack's frame: the PUP plugin, which then draws the backglass window, never draws the DMD.

**Changing the option after installation**: table details screen > "PuP-Pack", offered as soon as one of the table's packs has options (`tablePupPacks`, `packages/core/src/doctor.ts`).
The screen shows the applied option, the one that suits the cabinet, and every option with what it targets (topper, DMD on its own screen or in the backglass, FullDMD, aspect ratios).
Start applies the chosen option: its files are copied, the files they replace and those its `.bat` deletes go to the trash (`trash\<date> PuP-Pack <folder>`: the previous state, to go back to it), and no `.bat` is ever run (`pupOptionOps`).
If one of the option's files is missing from the pack, nothing is touched and the message names it (`missingSources`).
After the copy, the pack is read again: "appliquée" (applied) is only shown if the option is recognised in place, otherwise the message says what is missing (`checkAppliedOption`).
The choice is remembered in the `.info` (`option`, and `chosen: "user"`: the doctor no longer questions it) and applies from the next game; "Jouer" (Play) is offered on the same screen to see it.
On the details screen, the "PuP-Pack" line turns orange when another option suits the cabinet better.
"Pour cette borne" (For this cabinet) names the recommended option and the cabinet as configured (backglass, FullDMD or 4:1 DMD, topper); when two options are equally good, it names both, to be tried.
A list taller than the screen shows a rule on the edge behind which entries remain, at the top as at the bottom, and the selected entry is brought whole into view when the selection changes (`markOverflow`, `app/renderer/library.js`, every list of the management screens).
**A list's position only follows the user's gestures** (flippers, Tab, click, mouse wheel): a screen redrawn by an update (download progress, "Attente du site · 27 s" (Waiting for the site · 27 s), state of a received file) puts every list back where it was, without bringing the selected item back into view; the proposals can be browsed with the wheel while a card downloads.
Only `app/renderer/scroll-keeper.js` scrolls a list (menu and VPX settings): it records every scrolled list before the render and restores it after, and only brings the selection into view if it changed or another screen opens (which starts from the top); a list whose content changes in nature carries its own key (`data-scroll-key`, details of a VPX setting) and starts from the top.
What is on screen does not move either: the selected item, if it was in view, stays at the same place in its list when an update inserts something above it (a site's "Non connecté" (Not signed in) banner at the top of the proposals), and if it was whole and grows ("Choisi, à enregistrer" (Chosen, to be saved)), the list moves just enough for it to stay whole.
A screen opened directly on an item further down (media received from a friend) keeps it whole as long as no gesture has followed, even when the cards' images load afterwards.
These positions are measured in the list's layout (`offsetTop`), never on screen: a cabinet's playfield is rotated and `getBoundingClientRect` measures the other axis there (a selection that overflowed passed for whole).
Never a fade: it made the last visible line look disabled; the layout guard reports a fade on a scrolling list and a selection that is not whole in its list, `defilement.test.ts` rejects a fade in the stylesheets.
A list on its own (system menu, sections) starts just below the title, at the same height from one screen to the next, centred horizontally only.

**Recognising the option in place** (`appliedOption`, [puppack.ts](../../packages/core/src/puppack.ts)).
Everything the option copies must be at the root, identical, and what its `.bat` deletes must be absent; only the preview images placed at the root (`Option 2.JPG`, for PinUP Popper) do not count.
The `.pup` files alone are not enough: on *Guardians of the Galaxy* (`gotg_2020`), options 0 "3 Screen Desktop" and 2 "3 Screen FullDMD" have the same `screens.pup`, `playlists.pup` and `triggers.pup`; only `Option Selected.txt` and the desktop tools (`PuPDesktopPunch.exe`, `PuPInit.bat`) tell them apart.
A complete option comes before an option whose `.pup` files alone are there ("en partie seulement", partly only, with what is missing); between options with identical files, the one remembered in the `.info` wins, and the screen says so ("Mêmes fichiers", same files).
The `.bat` is read in order: `del Option*.jpg` then `xcopy … Option 2.JPG` leaves the preview in place (before, it went to the trash right after being copied).
An option's folder is the folder of its `.pup` files; an options folder that a `.bat` copies does not become a second option, and two options never share a name: every GOTG option appeared twice, and the tie between twins hid the recommendation ("pas de choix net", no clear choice).
A backup folder (`PuP-Pack_Options - Copy`, `_backup`, `….orig`, `….bak`) is never an option (`isBackupName`).
"NoDMD" written as one word reads as "No DMD".

**PuP-Pack switched off by the script.**
Some scripts only start the pack when a variable allows it, and ship it switched off: *2001 - A Space Odyssey (Original 2025)* writes `usePUP = False` ("enable Pinup Player functions for this table").
However well the pack is placed and its option applied, the script never calls `PuPlayer.B2SInit`: the PUP plugin loads nothing (`vpinball.log` says "Plugin PUP loaded", never "PUP path") and the game only shows the usual backglass and DMD.
`pupScriptSwitch` ([puppack.ts](../../packages/core/src/puppack.ts)) follows the conditions around `CreateObject("PinUpPlayer.PinDisplay")`, in its Sub and then where that Sub is called, and keeps the variable whose starting value, a literal never switched back on elsewhere, prevents reaching it.
It stays silent when the value comes from a table option, a file read or another variable (*Guardians of the Galaxy*: `DMDMode`).
To switch the pack on without modifying the table, Cyber Pinball writes `<table>.vbs` next to the `.vpx`: VPX 10.8.1 plays that file instead of the table's script (`PinTable::LoadScriptOverride`; the log says "Loading script: …").
It is the script read from the `.vpx` (`readVpxScript`, [vpxinfo.ts](../../packages/core/src/vpxinfo.ts), without VPX), byte for byte, with only the value changed, plus a last line `' CyberPinball-script {…}` that keeps the fingerprint of the original script ([scriptpatch.ts](../../packages/core/src/scriptpatch.ts)); script error line numbers do not move.
That `.vbs` is not a "replaced script": the details screen says "Script adapté" (Adapted script).
When a table is added with its pack, or a pack for a table already installed, the plan writes it automatically; when the table is updated, the plan rewrites it from the new script, or moves it to the recycle bin if the new version starts the pack by itself.
A `.vbs` from elsewhere is never replaced: the doctor offers to switch the pack on in it.
A protected (encrypted) script cannot be read without VPX: the doctor then says which value to change.

**Relayed switch, and PuP-DMD.**
*The Goonies Never Say Die Pinball (VPW 2021)* ships `Const enablePupPack = False`, then `Dim HasPuP : HasPup = enablePupPack`, and only starts the pack `If HasPup Then`.
You could hear the table's music, never the pack.
The log said "Plugin PUP loaded", with no "PUP path".
`pupScriptSwitch` now follows a variable that only copies another one (two relays at most, never changed in a Sub) back to the literal value: that is the one switched on.
The PuP-DMD (the score the script writes on the pack's DMD screen, `LabelInit`) often has its own switch (`Const enablePupDMD = False`), found the same way by `pupDmdSwitch`.
Switched off, the pack lays its empty frame (`PuPFrames\default.png`) in the DMD window, on top of the table's DMD, and the script asks PinUP Player to hide that screen (`SendMSG` FN 12), which the PUP plugin does not do.
`pupSwitchesToEnable` therefore switches both on when the option in place takes the DMD window (`packDrawsDmd`) of a cabinet that has one, otherwise the pack alone.
The `.vbs` keeps them all in its last line (`kind: 'dmd'` for the PuP-DMD).
The doctor reads the script again from the `.vpx` rather than trusting the cached reading, which might predate this (readings at version 6: an older reading of the same table is redone without VPX, `cachedScript`).
Adding a table or a pack does the same.

**Pack nobody starts.**
*Game of Thrones LE (VPW, Stern 2015)* is an original table with FlexDMD and no ROM.
Its script never creates `PinUpPlayer.PinDisplay` ("`Dim PuPlayer ' Not currently used`"); mikeleonheart's pack was made for PinUP Player hooked to B2S Server, which looked for it under the game name given to B2S (`cGameName = "gameofthrones"`).
The VPX 10.8.1 PUP plugin only loads a pack by itself for a PinMAME game (`OnControllersChanged` only keeps a `pinmame::…` game, never `b2s::…`): the log said "Plugin PUP loaded", never "PUP path".
The doctor said nothing: with no PuP call and no ROM, it expected no name, and none of its rules applied.
It was the third pack in a row installed with no video on the backglass.
Now `pupLoaderNeeded` ([puppack.ts](../../packages/core/src/puppack.ts)) recognises this case; the expected name is the game name for B2S (`b2sName`, read from `.B2SName = "…"` or `cGameName`), failing that the name of the pack's only folder, and the pack is renamed to it (the option kept in the `.info` follows, `renamePupMemory`).
Cyber Pinball's `.vbs` then starts the pack the way the table would (`addPupLoader`): `Sub Table1_Init() : CyberPinball_PuPStart` on the Sub's line (the table object's name is read from the `.vpx`, `readVpxTableName`), and, after the last line, a Sub that creates `PinUpPlayer.PinDisplay` and calls `B2SInit "", "<pack>"`, under `On Error Resume Next` then `Err.Clear`.
Line numbers do not move; the last line keeps `"loader": {…}`, and the `.vbs` is rebuilt when the table is updated as long as the new script does not start the pack itself.
It is done before each game ("PuP-Pack jamais lancé" (PuP-Pack never started), in `PUP_PLAY_REPAIRS`).
Safeguard: a pack present that no name points to (several folders, no game name) gives "PuP-Pack jamais chargé" (PuP-Pack never loaded) instead of silence.
The test `puplancement.test.ts` simulates the plugin (name given by the played script, or ROM, then `pupvideos\<name>\screens.pup`) on each kind of table: no ROM and no PuP, `B2SInit` under the right or another name, `usePUP = False`, PinMAME game; after the pre-game repairs, each one loads its pack.

**DMD image triggers without PinMAME.**
The *Game of Thrones* pack has 185 active triggers, 183 of them `D<n>` with `PupCapture\<n>.bmp`: PinUP Player recognised the table's DMD images.
The PUP plugin only receives these images from PinMAME ROMs (`GetIdentifyFrame`); FlexDMD does not provide them (`FlexDMDPlugin.cpp`, "TODO … pup events").
The script, however, can read the FlexDMD frame: `FlexDMD.DmdPixels` returns 128 × 32 bytes at the exact 16 levels of the captures (0, 17 … 255 in `GRAY_4`), as an array VBScript reads dot by dot.
So Cyber Pinball's `.vbs` redoes the plugin's matching ([pupcapture.ts](../../packages/core/src/pupcapture.ts)): `Sub FrameTimer_Timer() : CyberPinball_PuPCapture` on the line of the Sub of the table's frame timer (the one whose script sets `Interval = -1`), and, after the last line, a block that reads the frame at most every 20 ms of `GameTime`, compares 16 probe dots then the hash of the area of the candidate captures only, and sends `B2SData "D<n>", 1` then `0` to the object that started the pack (`CyberPinball_PuP`, or the script's own), like libpupdmd: the first capture by increasing number, never the same one twice in a row.
The block's first line carries its settings (pack, objects, timer, depth, hash of the `PupCapture` files), and so does the `.vbs`'s last line (`"capture": {…}`): when the captures or the script change, the block is rebuilt in place; when the table is updated, it follows the rebuilt `.vbs`.
The doctor offers it ("Vidéos du PuP-Pack déclenchées par le DMD : sans effet" (PuP-Pack videos triggered by the DMD: no effect), fix "Reconnaître les images du DMD" (Match the DMD frames)) and the menu does it by itself before the game (`PUP_PLAY_REPAIRS`).
Impossible without a `FlexDMD.FlexDMD` object, with a colour DMD, without a frame timer, without the pack's object in a variable, or with a protected script: the finding says so, with no fix.
Nothing is done when the script sends `D` triggers itself (`PuPlayer.B2SData "D…"`, `dmdTriggers`).
On *Game of Thrones*, 120 of the 183 active captures are, dot for dot, a frame of a FlexDMD asset; the others mix an asset with the script's text, to be checked on the cabinet.
Cost measured in `cscript`: 0.28 ms per read of an ordinary frame.
Tests: `pupcapture.test.ts` runs the generated VBScript in `cscript` (simulated FlexDMD and PinDisplay) and compares it with libpupdmd's matching; `pupcapture-medecin.test.ts` checks the repair, updated captures and table, a `.vbs` from elsewhere, `usePUP = False`.
Script readings at version 7.

**Background already in place.**
The PUP plugin restarts a screen's background video on every `SetBG` trigger, even when it is the one already playing (`PUPMediaManager::Play`); PinUP Player let it play on.
On *Game of Thrones*, the DMD's "choose your house" screen alternates with a filler frame: D11 (Stark, `SetBG`) restarted on every return, and the backglass showed almost only the video's black start, frame included, with flashes of Stark.
`backgroundTriggers` ([pupcapture.ts](../../packages/core/src/pupcapture.ts)) reads from `triggers.pup` the `D<n>` triggers whose active lines all set a file as background; the matching only sends them when they change at least one screen's background (`CyberPinball_PuPCapChanges`).
A trigger that does anything else goes out as before.
`triggers.pup` is part of the block's fingerprint (`captureSignature`): a `.vbs` already written is rebuilt before the next game.
A background changed by a trigger the matching does not send (`E…`, sent by the table) is not tracked.

**Incomplete PuP-Packs** (test of 10 November 2026, *The Matrix*: early sound and topper).
Any failure of one pack becomes a check of every pack: one minute after launch, the log reviews the installed packs and the incomplete ones ("PuP-Packs : N pack(s) contrôlé(s), M incomplet(s) …", `auditPupPacks`), missing files and played-but-empty playlists.
The check never blocks a game: the table's diagnostic says so, and "Ce qu'il manque pour jouer" (What's missing to play) offers to complete the pack through the acquisition circuit ("Recompléter le PuP-Pack", Complete the PuP-Pack: the complete pack of the table's game).
That day, on the development PC: 8 packs, 4 with one missing file each (*2001*, *Game of Thrones LE*, *Star Trek LE*, *The Matrix*: `Toppers\TopperEnterMatrix.mp4`), no played empty playlist.
*The Matrix*'s empty playlists (Intro, Start, Smith, PUPOptions) are played by nothing: they raise no alert, and do not explain its game start.

**Files the plugin reads differently.**
The background fix was not enough: the *Game of Thrones* backglass still flickered.
The real cause was in the pack's files.
The house sigils (`Choose your House\Stark.mp4`…) are PNG or JPEG images, the backglass background (`Backglass\Backglass.mp4`) a JPEG, all named `.mp4`.
PinUP Player showed them as images; the PUP plugin decides by extension (`PUPScreen::Play`: only `.png`, `.jpg`, `.jpeg` and `.bmp` are images) and hands them to FFmpeg, which plays them as one-frame videos, in a loop: an almost black backglass, with flashes of the sigil.
The same pack names `9y10perro y montaña.mp4` in a UTF-8 `triggers.pup`; the plugin converts that name with the Windows code page (`std::filesystem::path` from a `std::string`, `PUPTrigger::CreateFromCSV`), does not find the file and drops the trigger ("PlayFile not found" in `vpinball.log`).
`packFileFixes` ([pupfiles.ts](../../packages/core/src/pupfiles.ts)) reads the nature of each playlist file from its first bytes (`mediaKind`): an image named like a video gets its true extension back, a name with accents (file or playlist folder) becomes ASCII (`asciiName`), never overwriting another file, and every `.pup` in the pack, options and backups included, is rewritten byte for byte except the changed names: the option in place is still recognised.
A name the table's script mentions is never changed.
This is the finding "Fichiers du PuP-Pack que le plugin PUP lirait mal" (PuP-Pack files the PUP plugin would misread), repaired before each game (`PUP_PLAY_REPAIRS`) and now also as soon as a table or a pack is installed (`install`, [library.ts](../../app/src/library.ts), which applies all the `PUP_PLAY_REPAIRS` repairs).
What remains missing, a file named by an active trigger or a lit screen and absent from the pack, is reported ("Fichiers du PuP-Pack absents" (PuP-Pack files missing), `missingPackFiles`, no fix): on the cabinet, bietekwiet's FullDMD video for *Game of Thrones*, and one file in the *2001*, *Star Trek* and *The Matrix* packs.
The test `pupfichiers.test.ts` simulates the plugin's reading (names read with the Windows code page, case-insensitive) and checks that after the repairs every named file is found and no image carries a video extension.

**Backglass left to the `.directb2s`, and repairs before the game.**
An option may place the Backglass screen (2) inside the FullDMD (5): on *2001*, "(3 Screens) B2S Users, …, Pup on Fulldmd" writes `2,Backglass,…,"5,12.7,13.5,74.8,74.6"`.
The plugin then draws nothing in the backglass window: a window is only filled if its root (topper: screen 0; backglass: 2, otherwise 6; DMD: 5, otherwise 1) is not a screen placed inside another one with no children, and a visible screen descends from it (`PUPManager::Render`, reproduced by `pupWindows` in [puppack.ts](../../packages/core/src/puppack.ts)).
These "B2S Users" options rely on the table's `.directb2s`; without it, the backglass stays on a still image.
The automatic choice therefore reads, in each option's `screens.pup`, which windows it fills: a backglass left empty costs a lot if the table has no `.directb2s`, a little if that is unknown, almost nothing otherwise (the pack on the backglass stays preferred).
Whether the topper window is filled wins over the name ("Default Locale Topper Off" puts the topper in the main screen).
The doctor then offers the option that puts the pack on the backglass ("Option du PuP-Pack inadaptée à la borne", with "fronton laissé au .directb2s" (backglass left to the .directb2s) and "table sans .directb2s" (table without a .directb2s)).
Before each game, the menu itself applies the pack repairs the doctor would offer (`PUP_PLAY_REPAIRS`, `repairPupForPlay`: pack renamed or moved up, option copied or changed, script that switches the pack off, stale Cyber Pinball `.vbs`): without them, a pack stayed off until the doctor was opened.
An option chosen on the details screen is kept, the table is never modified, replaced files go to the recycle bin (`trash\… Avant la partie <folder>`), and the menu's log notes each repair ("PuP-Pack (…) : …").

**Playlist order.**
A screen whose `screens.pup` gives the playlist without a file plays the first file of the folder.
The PUP plugin sorts those files case-sensitively (`PUPPlaylist.cpp`, `std::ranges::sort`), PinUP Player like Windows.
Authors often name a transparent image so that it comes first (`aaclear.png`, `blank.png`, `black.png`); for the plugin, `Overlay1 by Dr Nobody TY.png` came first.
On *2001*, screen 14 "Callouts" thus showed a whole frame squashed in the middle of the backglass; *Guardians of the Galaxy* had six folders in that case.
`playlistRenames` ([puppack.ts](../../packages/core/src/puppack.ts)) finds, folder by folder, the file PinUP Player would play first and renames it in upper case, extension kept: it then comes first in both orders.
The plugin finds a file named by a trigger or by `screens.pup` regardless of case: nothing else changes.
This is done on import, by the doctor ("Playlist du PuP-Pack lue dans le mauvais ordre", PuP-Pack playlist read in the wrong order) and before each game.

**The doctor** ([doctor.ts](../../packages/core/src/doctor.ts)) checks, without launching VPX:

| Finding | When | Fix |
| --- | --- | --- |
| PuP-Pack not found | the script loads a pack (or a `pupvideos` folder exists) and there is no `pupvideos\<nom attendu>` | rename the only folder present; otherwise, add the pack |
| PuP-Pack stored one folder too deep | `pupvideos\X\X\screens.pup` | move the pack up |
| Unused PuP-Pack | another folder in `pupvideos` that no version in the folder loads | recycle bin |
| PuP-Pack switched off by the script | an expected pack is in place, and the script VPX plays (the `.vbs` next to the table if there is one) never starts the pack (`usePUP = False`, or `HasPup = enablePupPack` with `enablePupPack = False`), or, the pack's option taking the DMD window, leaves the PuP-DMD off (`enablePupDMD = False`: "PuP-DMD coupée par le script" (PuP-DMD switched off by the script)) | switch each switch on in `<table>.vbs` (or in the `.vbs` already there); protected script: the values to change |
| PuP-Pack never started | a table without ROM whose script never starts PuP, a pack in place under the expected name (game name for B2S, or only folder), and no `.vbs` that starts it | start it in `<table>.vbs`, at the beginning of `<table>_Init` (also done before the game); protected script: nothing to do without VPX |
| PuP-Pack made for another version of the table | a table without ROM whose script does not start PuP (Cyber Pinball starts the pack), a pack whose `E<n>` triggers wait for numbers the script never sends (it only sends those of DOF or `B2SSetData`, `scriptB2sEvents`), with no default trigger nor recognised DMD frames (`packDrivers`): the pack's backglass and screen stay black (*JP's Space Cadet* v7.0 and the Galaxy Edition pack); the details give the expected numbers ("E1 to E40") and those the script sends | none: install the version of the game that asks for this pack ("incl. PuP" or a VPS note in the catalog), or remove the pack |
| Videos triggered by the DMD: no effect | a pack with `PupCapture`, a table without ROM, active `D<n>` triggers with their image, a script that sends no `D`, and no `.vbs` that matches them up to date | match them in `<table>.vbs` on the FlexDMD frame (also done before the game); colour DMD, no frame timer or protected script: none |
| Script adapted for an older version | Cyber Pinball's `.vbs` was made from another script than the `.vpx`'s (table updated by hand) | rewrite it from the new script, or move it to the recycle bin |
| Option not applied, or modified | options exist, and the root has no `.pup` (or its `.pup` files match no option, `appliedOption`) | copy the chosen option again (remembered, otherwise based on the cabinet) and remember it |
| Option differs from the remembered one, or is incomplete | the option remembered in the `.info` is not the one whose files are in place (`.bat` run by hand, interrupted copy), or is only partly there (a file it deletes came back) | chosen on the details screen, or partly in place: apply it again; chosen automatically at installation: remember the option in place (also done before the game) |
| Option unsuited to the cabinet | an option is applied, and another one scores clearly better for the current cabinet (cabinet changed since installation, older automatic choice, backglass left to the `.directb2s` of a table that has none), unless the option was chosen on the details screen | apply the better one and remember it |
| PuP-Pack without screens.pup | the pack has no `screens.pup` at its root and no option remains to be applied: a pack without options, or a pack with options whose option in place does not bring one (*Hellboy*, *Daredevil*, *24*); PinUP Player used its default screens, the PUP plugin creates none and the pack stays dark | declare in `screens.pup` the screens the pack targets, as PinUP showed them (`defaultScreensPup`); also done at installation and before the game |
| The PuP-Pack would hide the table's DMD | the pack takes the DMD window (screen 5 or 1), the table draws its DMD (ROM, FlexDMD, UltraDMD) without writing the score on the pack, and the table's `.ini` does not set `[ScoreView] Priority.PUP` | write `[ScoreView] Priority.PUP = 0` in the table's `.ini` (also done before the game) |
| PuP-Pack score on the backglass, DMD screen empty | the cabinet has a DMD screen, the script writes the score on the pack (`LabelNew`), the pack's DMD screen (5, otherwise 1) is placed inside the backglass (CustomPos "2,0,0,100,100": pack made for a single 16:9 screen, like City Hunter) and no option of the pack puts it on the DMD: the PUP plugin draws nothing in the DMD window (`dmdInBackglass`) | rewrite that screen's CustomPos in `screens.pup` (the old file to the trash) so that it becomes a root showing, in the DMD window, the backglass band the other screens leave free, as large as possible without distortion and centred (`dmdBandPlacement`: the screen keeps the 16:9 proportions of the backglass, because the plugin places and sizes labels in % of the width and height; e.g. "1,0,-133.34,100,233.11" for a 1724 × 416 DMD, "1,0,-28.65,100,100" for a 16:9 FullDMD); the original CustomPos and the one written are kept in the `.info`, and the position is computed again when the DMD window changes shape ("Score du PuP-Pack à recadrer sur l'écran DMD", another cabinet setup); a position changed by hand since is left alone (also done before the game) |
| PuP-Pack score to put back on the backglass | the cabinet no longer has a DMD screen and the screen has the position set above | put back the original CustomPos kept in the `.info` (also done before the game) |
| PuP-Pack files the PUP plugin would misread | in a playlist, an image named like a video (`Stark.mp4`, a PNG), or a name with accents | give the image its extension back, make the name ASCII, rewrite every `.pup` in the pack (options included); also done on install and before the game; name mentioned by the script: left |
| PuP-Pack files missing | an active trigger or a lit screen names a file missing from its playlist | no repair on the spot: "Ce qu'il manque pour jouer" (What's missing to play) offers to complete the pack (information, never blocking) |
| PuP-Pack playlists empty | a playlist the pack really plays (an active trigger without a chosen file, a lit screen, or the table's script when the pack declares it in `playlists.pup`) is empty or missing; an empty playlist nothing points to is ignored, as is a pack without a single media file (configuration only, not installed) (`emptyPlayedPlaylists`) | no repair on the spot: "Ce qu'il manque pour jouer" (What's missing to play) offers to complete the pack (information, never blocking) |
| Playlist read in the wrong order | in a folder of the pack, the first file for the PUP plugin (case-sensitive sort) is not PinUP Player's (Windows sort): `aaclear.png` behind `Overlay1….png` | rename the intended file in upper case (extension kept); also done on import and before the game |
| Pack screens missing from the cabinet | a visible screen targets the topper, the DMD or the backglass while that role is not assigned | — (information) |
| Playfield videos not displayed | screen 3 (Playfield) is visible: the plugin does not render it | — |
| PuP-Pack driven by the script | `playlistadd` in the script and no `.pup` | — |
| Pack meant for another ROM | `PupCapture` folder and a ROM different from the pack's original name, or a ROM in another language (suffix `f`, `g`, `i`, `s` after the version, assumed) | — |
| VPX log | the table's last game in `vpinball.log` ("Starting script" or "Startup done" from VPX 10.8.1): pack loaded without `screens.pup`, no pack loaded (unless the script switches the pack off: the previous finding says so), `Not implemented` functions. | — |
| PuP-Pack disabled | the table's pack is in `pupvideos (off)` ("Game parts" > PuP-Pack > "Disable the PuP-Pack") and no pack it loads is in `pupvideos` | — (information): nothing is asked for, neither "not found", nor the "no pack loaded" log, nor an option, nor a script to switch on |
| Script still adapted for the disabled PuP-Pack | Cyber Pinball's `.vbs` switches on or starts the disabled pack (switch, start, DMD frame recognition), or comes from an older version of the table | redo the `.vbs` from the table's script with nothing PuP in it (the `core.vbs` fixes stay), or move it to the trash; also done before every game |

**Unrecognized cases** (the plan then offers the options to pick with the buttons, or the doctor reports it): `.bat` files that ask for a choice (`choice`, `set /p`) or test for files (`if exist`), `.bat` files that run an executable (`PuPDesktopPunch.exe`, installers), options stored outside a folder whose name contains "option" and with no readable `.bat`, packs with no `.pup` at all outside a `pupvideos` folder (old script-driven packs: recognized only if they already arrive inside `pupvideos\`), a pack-specific `PinUpPlayer.ini` (ignored by the plugin), changes made in the PuP-Pack Editor (enabling topper videos, for example) that no longer match any option: reported as information, never overwritten without the button.
The VPX FFmpeg DLLs and the `Priority.PUP` keys in `VPinballX.ini` (which put the pack ahead of the directb2s) belong to the VPX sync, not to this module.

Sources for the option rule: the `.bat` example in [dekay's vpinball wiki](https://github-wiki-see.page/m/dekay/vpinball-wiki/wiki/PUP-Packs), [pup-research](https://github.com/francisdb/pup-research) ("copy the .pup files from `PuP-Pack_Options/<option>` to the root"), the [Batocera wiki](https://wiki.batocera.org/systems:vpinball) (Batman 66: `Option 3 - Desktop`), and option names of VPUniverse and vpinball.com packs, from search engine summaries (Tron Legacy, Transformers, Aliens, Pirates of the Caribbean, PinEvent packs: "Option 1 - Backglass and Topper", "2 Screen - 4x3 or 5x4", "Full DMD on Backglass", "Backbox AIO", "PUP Stream").
VPUniverse pages refuse automated reading (403): the rule still needs confirming on real packs.
