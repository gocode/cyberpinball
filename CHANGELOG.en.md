English · [Français](CHANGELOG.md)

# What's new in Cyber Pinball

One section per release, `## <version>` then one `- ` line per item, translating the same
section of [CHANGELOG.md](CHANGELOG.md) point by point (same versions, same number of items).
`npm run publier` puts both languages in the update feed, where the cabinet shows the notes in
its own language before installing, and in the GitHub release. Short sentences, written for the cabinet's user.

## 0.1.4

- System menu in four sections: Tables, Media, Cabinet and Cyber Pinball; what is only used when coming from another frontend sits in "Migration".
- Live menu DMD: Cyber Pinball draws the display itself, with the title, PRESS START, credits, the clock and high scores.
- Interface sounds: a solenoid click when changing table, a coin on Start, the knocker when a high score falls; can be turned off in "Media, sound and attract mode".
- Cabinet health (Cabinet section): disk space, tables that don't start, missing media, screens and VPX version on a single screen.
- Dedicated cabinet (Cabinet section), off by default: Cyber Pinball can replace the Windows Explorer, with a way to bring it back.
- Shut down, restart and sleep from the Cyber Pinball section, right after "Quit Cyber Pinball": one confirmation, then settings are saved and every screen turns black, never showing the desktop; on wake, the menu comes back as it was.
- Guest mode (Cabinet section): for a party or the kids, guests can only choose a table, play and read its game page; holding both flippers and both MagnaSaves for 3 seconds unlocks it.
- Accelerometer nudge strength, adjustable in the "Tilt" step of the cabinet setup: ×2 is proposed for a Pinscape, which VPX almost ignored at the original scale.
- Cinematic launch: on Start, the game logo flies from the playfield to the backglass, the DMD shows loading, a coil thumps when VPX takes over; VPX never waits, and "Media, sound and attract mode" turns it off.
- Menu lists: a list too long for the screen is marked by a rule at the top or bottom instead of a fade, the selected entry stays whole and every list starts just below its title.
- Cabinet schedule ("Media, sound and attract mode", off by default): like in an arcade, the cabinet dims its screens and goes quiet at night, then sleeps or shuts down at the chosen time if nobody is playing, after a 30-second warning that any button cancels.
- Windows desktop given back the right way up: Cyber Pinball no longer rotates the playfield screen in the Windows setting, only while it is open; every exit, even after a crash, gives the desktop its previous orientation back. A cabinet already left rotated offers it on first start.
- Table orientation kept from one start to the next: after a restart or a reconnection, tables no longer show upside down in game. "Cabinet health" says whether they face you, and repairs those that were turned in the VPX menu.
- Game parts: every file received goes to the part its content calls for (table, PuP-Pack, backglass, ROM, colours, sounds, music…), even when something else was expected; a file to fix no longer blocks installing the rest. A table's sheet has a "Game parts" section to add, replace, reassign or remove each part.
- Downloads: a file can be added to a table, to another game, or installed as a new table.
- Every file to choose (media, backglass, table, PuP-Pack…) is shown as a gallery: preview, download count and rating read from the site, author, version and date, with a sort by popularity; the media saved is always the one you picked.
- Lists no longer move during a download: only a user gesture scrolls them.
- Backglass and DMD in the brand's colours, with a dot font drawn for Cyber Pinball; the DMD colour is adjustable (signal green by default, presets or a free colour).
- Game buttons: keyboard keys can be captured again.
- "Search the web…" on every add or choice screen: the built-in browser opens on a search already filled in. A part missing from a game starts a search on VPS, Downloads, VPForums and VPUniverse right away.
- More reliable VPUniverse search: short words in the title ("say", "die") no longer empty the search, and the wait imposed by the site is no longer taken for "no results".
- PuP-Packs visible in game: when a table's script keeps its PuP-Pack or PuP-DMD switched off, Cyber Pinball switches it on at install and before each game.
- VPX windows in their place in game: when two screens share the same name, the backglass, the DMD and the score view no longer pile up; Cyber Pinball moves each one back to the screen of its role.
- Friends (System menu > Friends), between cabinets and with no central server: your friends online with the table they are playing and their latest high scores, finding a player by name or on the local network, friend requests, first badges. Sharing is on by default and is turned off in "Sharing and network", which also says what other cabinets see; Windows asks once to allow Cyber Pinball through its firewall.
- PuP-Packs the table does not start itself (Game of Thrones LE): Cyber Pinball stores them under the right name and starts them before each game; the doctor says which of the pack's videos cannot trigger with the table's DMD.
- PuP-Pack videos triggered by DMD frames on FlexDMD tables without ROM (Game of Thrones LE): Cyber Pinball recognises these frames during the game and starts the videos, like PinUP Player.

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
