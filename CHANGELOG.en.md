English · [Français](CHANGELOG.md)

# What's new in Cyber Pinball

One section per release, `## <version>` then one `- ` line per item, translating the same
section of [CHANGELOG.md](CHANGELOG.md) point by point (same versions, same number of items).
`npm run publier` puts both languages in the update feed, where the cabinet shows the notes in
its own language before installing, and in the GitHub release. Short sentences, written for the cabinet's user.

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
