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
