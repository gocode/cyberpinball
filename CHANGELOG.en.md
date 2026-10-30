English · [Français](CHANGELOG.md)

# What's new in Cyber Pinball

One section per release, `## <version>` then one `- ` line per item, translating the same
section of [CHANGELOG.md](CHANGELOG.md) point by point (same versions, same number of items).
`npm run publier` puts both languages in the update feed, where the cabinet shows the notes in
its own language before installing, and in the GitHub release. Short sentences, written for the cabinet's user.

## 0.1.5

- Cinema launch: the game logo now lands whole and centered on the backglass, and leaves the playfield whole; a large wheel (medallion) used to spill out the bottom, cut off. A logo taller than it is wide also stays in its slot on the menu wheel.
- "Play with a friend" on a table's page, right under "Play": choose the friend to invite to a live game. An invitation that cannot be sent is no longer hidden: it stays visible, greyed out with its reason ("Offline", "No friend online right now").
- An invitation now arrives even during a game: a chime and a discreet card in the playfield corner (who sends it, the table, the time left), without getting in the way. Leave your game to join your friend, the invitation opens back in the menu; or keep playing, it fades away by itself.
- A table fetched from a friend is recognised in their invitations, even when your cabinet named it differently ("Game of Thrones (Limited Edition)" here, "Game of Thrones LE" on theirs): the same `.vpx` file is the same table. It now keeps, when installed, the name it has on the friend's cabinet.
- Live game: everyone plays the same version of the table, mandatorily, for a score to compete on: the same `.vpx` file and the same script. Without it, no "Accept": "Fetch …'s version" opens their table in their shared library, ticked.
- Live game: the number of balls per game counts. Set differently from the host (5 against 3), you still play, but your score stays out of the ranking; the invitation says so before you accept. It is read from the ROM (ROM tables described by the Pinball Memory Maps project), the script or the table's service menu.
- Live game: your usual table is never modified. The game is played on a copy of the table, made just before launch and deleted on return: the ROM memory, your high scores and your settings stay as they are.

## 0.1.4

- Friends (System menu > Friends), between cabinets and with no central server: your friends online with the table they are playing and their latest high scores, finding a player by name or on the local network, friend requests, first badges. Sharing is on by default and is turned off in "Sharing and network", which also says what other cabinets see; Windows asks once to allow Cyber Pinball through its firewall.
- Friends' library, shared by default between friends (turned off in "Sharing and network"): "See their library" on a friend's page shows their tables and the media you are missing. You can fetch a whole table you don't have, or pick part by part those of a table you already have, their version and yours side by side; ROM and PuP-Pack are unticked by default, with a note on rights. Everything goes through the add plan before it is installed; saves, high scores and programs are never sent.
- Live game between friends, up to 4 cabinets: the invitation opens on the friend's cabinet on the same table (version checked), a 5-second countdown starts the game everywhere, then everyone sees the results.
- Friends online at a glance on the tables menu, and small, discreet notifications, one at a time: a friend coming online, a friend request, a finished download. Nothing shows during a game: a summary waits for you when you come back. Can be turned off in "Médias, son et attente" (Media, sound and attract mode).
- A friend's name always follows their latest rename, and a pending friend request is sent again when the cabinets meet.
- Downloads, in the system menu and as a pill on the tables menu: follows everything coming from sites and your friends, resumes by itself where it stopped if the connection drops, even the next day, and takes you back in one move to the screen you asked from.
- Game parts: every file received goes to the part its content calls for (table, PuP-Pack, backglass, ROM, colours, sounds, music…), even when something else was expected; a file to fix no longer blocks installing the rest. A table's sheet has a "Game parts" section to add, replace, reassign or remove each part.
- Downloads: a file can be added to a table, to another game, or installed as a new table.
- Every file to choose (media, backglass, table, PuP-Pack…) is shown as a gallery: preview, download count and rating read from the site, author, version and date, with a sort by popularity; the media saved is always the one you picked.
- "Search the web…" on every add or choice screen: the built-in browser opens on a search already filled in. A part missing from a game starts a search on VPS, Downloads, VPForums and VPUniverse right away.
- More reliable VPUniverse search: short words in the title ("say", "die") no longer empty the search, and the wait imposed by the site is no longer taken for "no results".
- "Jouer et enregistrer" (Play and record), on a table's page: Cyber Pinball films the game, from the moment you chose until the length you chose or until you leave the table, with a small witness in the corner of the playfield. Back in the menu, the video can become the table's presentation on the wheel, after confirmation, or be kept aside.
- System menu in five sections, in this order: Friends, Tables, Media, then Downloads, Cabinet and Cyber Pinball; what is only used when coming from another frontend sits in "Migration".
- Live menu DMD: Cyber Pinball draws the display itself, with the title, PRESS START, credits, the clock and high scores.
- Cinematic launch: on Start, the game logo flies from the playfield to the backglass, the DMD shows loading, a coil thumps when VPX takes over; VPX never waits, and "Media, sound and attract mode" turns it off.
- Interface sounds: a solenoid click when changing table, a coin on Start, the knocker when a high score falls; can be turned off in "Media, sound and attract mode".
- Backglass and DMD in the brand's colours, with a dot font drawn for Cyber Pinball; the DMD colour is adjustable (signal green by default, presets or a free colour).
- The table wheel has sound right after installation: each game's music plays by default, and a table without music plays its playfield video (40%). Cabinets already set up keep their choice: turn "Game music" back on in System menu > Media > "Media, sound and attract mode".
- All sound goes through the cabinet speakers: the music and sounds offered in "Game media", and videos watched in "Get" (YouTube…), no longer go to the Windows default output, often silent on a PinCab.
- Menu lists: a list too long for the screen is marked by a rule at the top or bottom instead of a fade, the selected entry stays whole and every list starts just below its title.
- Long lists: in a content list (games, media, files…), marked by its frame and the "Exit · Leave the list" cue, Exit takes you back to the screen's actions instead of leaving it; MagnaSave (F6 on the keyboard) switches between the two and keeps your place, and holding a flipper scrolls letter by letter.
- Lists no longer move during a download: only a user gesture scrolls them.
- The names under the small medallions of the wheel are larger and can be read from a distance, like every text of the menu.
- Tables menu on a desktop, on a screen narrower than 16:9 (5:4, 4:3): the playfield and the rest of the menu no longer overlap.
- "Récupérer" (Fetch) window: its banner follows the size of the screen, and its texts read as well in 4K as on a small screen; in portrait, its buttons move below.
- Cabinet health (Cabinet section): disk space, tables that don't start, missing media, screens and VPX version on a single screen.
- Dedicated cabinet (Cabinet section), off by default: Cyber Pinball can replace the Windows Explorer, with a way to bring it back.
- Shut down, restart and sleep from the Cyber Pinball section, right after "Quit Cyber Pinball": one confirmation, then settings are saved and every screen turns black, never showing the desktop; on wake, the menu comes back as it was.
- Guest mode (Cabinet section): for a party or the kids, guests can only choose a table, play and read its game page; holding both flippers and both MagnaSaves for 3 seconds unlocks it.
- Cabinet schedule ("Media, sound and attract mode", off by default): like in an arcade, the cabinet dims its screens and goes quiet at night, then sleeps or shuts down at the chosen time if nobody is playing, after a 30-second warning that any button cancels.
- Accelerometer nudge strength, adjustable in the "Tilt" step of the cabinet setup: ×2 is proposed for a Pinscape, which VPX almost ignored at the original scale.
- Windows desktop given back the right way up: Cyber Pinball no longer rotates the playfield screen in the Windows setting, only while it is open; every exit, even after a crash, gives the desktop its previous orientation back. A cabinet already left rotated offers it on first start.
- Table orientation kept from one start to the next: after a restart or a reconnection, tables no longer show upside down in game. "Cabinet health" says whether they face you, and repairs those that were turned in the VPX menu.
- The Windows taskbar no longer shows over the DMD, backglass or playfield when you come back from a game: Cyber Pinball puts it straight back behind, and "Cabinet health" tells you if it had to.
- VPX windows in their place in game: when two screens share the same name, the backglass, the DMD and the score view no longer pile up; Cyber Pinball moves each one back to the screen of its role.
- Game buttons: keyboard keys can be captured again.
- PuP-Packs visible in game: when a table's script keeps its PuP-Pack or PuP-DMD switched off, Cyber Pinball switches it on at install and before each game.
- PuP-Packs the table does not start itself (Game of Thrones LE): Cyber Pinball stores them under the right name and starts them before each game; the doctor says which of the pack's videos cannot trigger with the table's DMD.
- PuP-Pack videos triggered by DMD frames on FlexDMD tables without ROM (Game of Thrones LE): Cyber Pinball recognises these frames during the game and starts the videos, like PinUP Player.
- PuP-Packs: the backglass no longer flickers when the same background video is requested several times in a row (Game of Thrones LE, house selection screen).
- PuP-Packs: images shipped under a video name (Game of Thrones LE) finally show as images, with no flicker, and files with accented names are found; Cyber Pinball fixes this for every pack, on install and before each game.

## 0.1.3

- Buttons of a Pinscape (KL25Z) or of an encoder in gamepad mode: captured in the "Buttons" step and followed by the whole menu and by VPX.
- Optional Pause button in the "Buttons" step: one press pauses the game, another resumes it (P on the keyboard by default).
- Analog plunger (a Pinscape sensor plunger): detected by pulling it, set and tested in the "Plunger" step, along with the accelerometer for nudging.
- Game buttons and interface buttons set separately; keyboard keys and joystick buttons mix freely.
- "Add a table" brings every way of adding a table together in one place, with filters in the catalogue and quick install.
- "What's missing to play": a guided path, from a missing ROM or backglass all the way to "Play".
- A ROM stored in a subfolder of its zip is recognised; "Diagnose and fix" gathers a ROM scattered in a table.
- Correctable waiting list: reassign, empty, replace or remove a file received by mistake; a table's page has a "Files" section.
- An icon for each menu.
- Table menu on a cabinet: help bar reduced to Flippers, Start and Exit ("Cabinet controls" in the system menu), glow of the arrows and the name no longer cut off.
- Tables show the right way up during a game on a cabinet whose flippers are at the bottom.
- Only the table file and its ROM are required to play; DMD content, backglass and PuP-Pack are offered as extras.
- "Downloads" screen: files already received, to reuse or delete; a built-in file picker replaces the Windows one.
- "Fetch" window: progress of each download (percentage, size, speed, time left) and a "Cancel" button.
- The screen where the "Fetch" window opens is chosen in the cabinet configuration.
- PuP-Pack turned off by its table's script (2001, for instance): turned on at install, and repaired by "Diagnose and fix" for tables already installed.
- The "Récupérer" window stays in front: the backglass no longer comes over it on the first click.
- "Fetch" window on a cabinet: it opens on a readable screen (the backglass if the playfield is turned), with the pointer brought onto it; Exit closes it.
- The "Fetch" window, when reopened, picks up the page where you were; more thorough site search.
- No more white screen when a window opens or moves to another screen.
- Lighter updates (the application alone, in a few seconds) and test pre-releases, to receive or not from the update menu.
- DMD screen: say whether it is a FullDMD (the whole screen, game DMD inset) or a DMD only; the menu, VPX and PuP-Packs follow it.
- PuP-Pack on the backglass: the pack option is chosen from the cabinet's screens, the game DMD stays in front of the pack, and the pack is checked before each game.
- Tilt: new "Tilt" step (the cabinet's plumb bob, or a plumb bob simulated by VPX from the accelerometer), plumb bob and slam tilt captured in the "Buttons" step.
- A media file added, replaced or removed (wheel logo, backglass, video, music…) and a table added or renamed show up immediately on every screen, without restarting.
- System menu, settings, help and messages: backglass, display and topper switch to the Cyber Pinball display, without the last table's video or music; a table's details screen keeps its media.
- "Table sounds" (Game media > Music or Launch sound): listen to the PuP-Pack's music and its videos' sound, and make one the game's presentation music or launch sound.
- Media: "Search the web myself…" on each media item opens the built-in browser on a search you change as you like; the downloaded file is checked, converted if needed (music can be trimmed) and assigned at once.
- "Bureau Windows" (Windows desktop) now frees every screen of the PC, rather than often just one; Ctrl+Shift+D goes there straight from the menu and back, the shortcut shown next to the entry.
- Wide display (FullDMD) in game: the menu's artwork stays on screen and the game's DMD sits in its frame; its placement is fine-tuned in game, table by table, from the VPX menu.
- Media: on a YouTube, Vimeo or Dailymotion page, "Get the sound" or "Get the video" through the yt-dlp tool, downloaded from GitHub and checked on first use.
- PuP-Pack: the applied option is finally shown as it is (option 2 of Guardians of the Galaxy no longer passes for option 0), each option only once, the one best suited to the cabinet recommended; "applied" is only announced once the option is checked in place, otherwise the message says why.
- Loading screen: on the cabinet, the game's loading video alone, full screen, with no text; on a desktop, the video in the playfield frame and the title with the game's controls in a panel beside it, no longer covering anything.

## 0.1.2

- Updates: the check runs right at start-up, then every 6 hours; the red dot appears without opening the menu.
- Updates: installing no longer gets stuck when Cyber Pinball is started from its shortcut, and a failure restarts Cyber Pinball with no click needed.
- A "‹ Back" button above the title of every menu, and in the VPX settings.
- Media suggested by sites: displays the cabinet does not show are flagged, number of sites per media item, web search.

## 0.1.1

- Updating from the cabinet also works on a cabinet copied without the installer: its shortcuts stay as they are.
- A subtler red dot on the gear; the system menu opens on the entry that needs you.

## 0.1.0

- First public release: screen, button and sound setup wizard, table menu driven by the cabinet buttons.
- Adding tables, ROM library, PuP-Packs, VPS catalog and download queue.
- Game media: import from PinUP Popper or PinballX, download from VPinMediaDB, then VPForums and VPUniverse with your account, attract mode.
- Updates from the system menu: "Cyber Pinball update", flagged by a red dot on the gear when a new version is out.
- English or French interface, chosen in the system menu: "Language / Langue".
- Installs alongside PinUP Popper, PinballX or PinballY: waits for another running frontend to close, warns before flipping a screen in Windows.
