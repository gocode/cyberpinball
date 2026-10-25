English · [Français](CHANGELOG.md)

# What's new in Cyber Pinball

One section per release, `## <version>` then one `- ` line per item, translating the same
section of [CHANGELOG.md](CHANGELOG.md) point by point (same versions, same number of items).
`npm run publier` puts both languages in the update feed, where the cabinet shows the notes in
its own language before installing, and in the GitHub release. Short sentences, written for the cabinet's user.

## 0.1.3

- Buttons of a Pinscape (KL25Z) or of an encoder in gamepad mode: captured in the "Buttons" step and followed by the whole menu and by VPX.
- Game buttons and interface buttons set separately; keyboard keys and joystick buttons mix freely.
- "Add a table" brings every way of adding a table together in one place, with filters in the catalogue and quick install.
- "What's missing to play": a guided path, from a missing ROM or backglass all the way to "Play".
- A ROM stored in a subfolder of its zip is recognised; "Diagnose and fix" gathers a ROM scattered in a table.
- Correctable waiting list: reassign, empty, replace or remove a file received by mistake; a table's page has a "Files" section.
- An icon for each menu.
- Table menu on a cabinet: help bar reduced to Flippers, Start and Exit ("Cabinet controls" in the system menu), glow of the arrows and the name no longer cut off.
- Tables show the right way up during a game on a cabinet whose flippers are at the bottom.
- The "Récupérer" window stays in front: the backglass no longer comes over it on the first click.
- "Fetch" window on a cabinet: it opens on a readable screen (the backglass if the playfield is turned), with the pointer brought onto it; Exit closes it.
- The "Fetch" window, when reopened, picks up the page where you were; more thorough site search.
- No more white screen when a window opens or moves to another screen.
- Lighter updates (the application alone, in a few seconds) and test pre-releases, to receive or not from the update menu.

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
