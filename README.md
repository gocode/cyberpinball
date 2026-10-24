# Cyber Pinball

**An open-source frontend for virtual pinball cabinets that configures the whole cabinet from a single model.**

[Français](README.fr.md) · [Technical manual (French)](docs/manuel.md) · [Releases](https://github.com/gocode/cyberpinball/releases) · [Changelog](CHANGELOG.md)

You describe your cabinet once: its screens, buttons and speakers. Cyber Pinball then writes and maintains the configuration of every component for you: Visual Pinball X, its backglass, PuP and DMD plugins, screen positions, sound outputs and keys. No more hand-editing `.ini` files, and no more broken setup when Windows renumbers your monitors.

> **Status: early prototype (0.1.0).** Windows only, built around Visual Pinball X 10.8.1 in plugin mode. Expect rough edges, and back up your tables before trying it.

## Features

- **Screens, detected and recognised.** Each monitor is identified by its EDID fingerprint, not by its Windows number. A wizard, driven entirely by the cabinet buttons, assigns the roles (playfield, backglass, DMD, topper), the flipper edge and the playfield diagonal. `VPinballX.ini` is rewritten at every start, so the cabinet survives monitors being swapped, renumbered or woken up in a different order.
- **Several setups, one installation.** The same install can serve a desk PC and a cabinet. The connected setup is recognised automatically, each with its own screens, sound, buttons and `VPinballX.ini`.
- **Sound.** A wizard step plays a sound on every output, lets you pick the backglass and playfield outputs, and tests the speakers of a 5.1 or 7.1 card.
- **A table menu made for cabinets.** One window per cabinet screen, a menu rotated for a player standing at the flippers, a loading screen with the game controls, play statistics, and VPX errors explained in plain words. No screen ever shows the Windows desktop, from start-up to the end of a game.
- **Table management from the cabinet.** Add tables from an import folder, a USB stick or the PC; each table is named from the [Virtual Pinball Spreadsheet](https://github.com/VirtualPinballSpreadsheet/vps-db) database. There is a shared ROM library (each ROM stored once, hard-linked into every table that uses it), automatic choice of the PuP-Pack option that fits your screens, and a "doctor" that explains why a table fails.
- **Find a table.** A catalogue of the VPS database shows every game, its versions and what this cabinet needs to play it, plus a waiting list for the files you download yourself. Cyber Pinball never downloads tables or ROMs on your behalf.
- **Game media.** Logos, playfield videos, backglasses, DMD, topper, loading videos, music, flyers and rules can be imported from PinUP Popper or PinballX, or downloaded on demand from [VPinMediaDB](https://github.com/superhac/vpinmediadb). When a media file is missing, a built-in fallback is drawn instead. There is also an attract mode.
- **VPX settings without the `.ini`.** All VPX settings, read from VPX's own source code, are editable globally or per table. An "Adjust the view" screen frames each table with the cabinet buttons.
- **In-app updates.** System menu > "Update Cyber Pinball" checks GitHub on demand, shows what's new, then downloads and installs the new version. Every release is signed: the cabinet refuses anything that was not signed with the publisher's key. Your tables, media and settings are kept.

## Requirements

- Windows 10 or 11, 64-bit.
- A local disk with a few GB free. Program Files, Windows folders and network drives are refused, because VPX and the tables need to write next to themselves.
- Visual Pinball X 10.8.1: installed for you on first launch.

## Installation

Download an installer from the [Releases](https://github.com/gocode/cyberpinball/releases) page:

| File | Size | Visual Pinball X |
| --- | --- | --- |
| `CyberPinball-Setup.exe` | about 110 MiB | downloaded on first launch from its official page, checked by SHA-256 |
| `CyberPinball-Setup-complet.exe` | about 280 MiB | official archive included, for a cabinet without Internet access |

- Everything lives in **one root folder** that you choose (for example `D:\CyberPinball`): the application in `app\`, and next to it the tables, media, configuration, data and emulators.
- No administrator rights are needed: it installs for the current user.
- Options: a desktop shortcut, and start with Windows (for a dedicated cabinet). Silent install: `/S`, `/DEMARRAGE` (start with Windows), `/SANSBUREAU` (no desktop shortcut), `/D=D:\Cabinet` (root folder, last and without quotes).
- **Uninstalling removes the application only.** Tables, media, configuration and data stay in the root folder; reinstalling into the same folder finds them as they were.
- The installers are not code-signed yet, so Windows SmartScreen will warn when you run them.

On first launch, Cyber Pinball offers to install VPX, then walks you through buttons, screens, playfield, layout and sound, all from the cabinet buttons.

## Updating

From the cabinet: **system menu > "Update Cyber Pinball"**. Nothing happens automatically. Cyber Pinball looks for the latest release when you open the entry, and installs it only if you choose "Update now". It closes while the installer runs (about a minute), then restarts on its own and tells you which version is installed. If the installation fails, the installer puts the previous version back.

Each release ships a signed feed (`cyberpinball-maj.json`, Ed25519). The installer is downloaded only if the signature matches the key built into the application, and it is launched only if its size and SHA-256 match. A pre-release (`0.2.0-beta.1`) is never offered to cabinets.

## Controls

The buttons are those learned by the wizard. Until then, the usual defaults of cabinet encoders apply:

| Button | Default key | Table menu |
| --- | --- | --- |
| Left / right flipper | Left / right Shift | Choose a table |
| Start | 1 | Play |
| Exit | Escape | System menu (settings, cabinet setup, updates, quit) |
| Keyboard | Tab, or ⚙ with the mouse | System menu, from anywhere |
| Keyboard | Ctrl+Shift+K | Stop a game that hangs |

During a game, the keys are those in VPX's `[Input]` section, shown on the loading screen.

## Building from source

You need Windows 10 or 11 and Node.js 22 or later.

```bash
npm install
npm test            # builds, runs the publication check and the core tests
npm start           # table menu (screen wizard on first start)
npm run assistant   # full cabinet wizard
npm run probe       # lists detected screens and audio outputs
npm run installeur  # builds release\CyberPinball-Setup.exe and CyberPinball-Setup-complet.exe
```

`lanceur.cmd` opens a menu with the same actions. End-to-end tests run without an operator and entirely off-screen: Electron renders in memory on a hidden Windows desktop with simulated monitors, so they never take over the developer's screens.

| Folder | Role |
| --- | --- |
| `packages/core` | Cabinet model, EDID fingerprints, screen matching, INI and VPX generators, updates. No Electron, no Windows. |
| `packages/win-displays` | Windows APIs through FFI (koffi): displays, audio outputs, USB devices, windows, orientation. |
| `packages/installer` | Third-party component manifest, root folder, verified downloads, version junctions. |
| `app` | The Electron application: wizard, table menu, VPX settings, table management, game launcher. |
| `docs` | Technical manual, manual test scenarios, research notes, design system. |

The technical manual ([docs/manuel.md](docs/manuel.md), in French) describes every part in detail: the files written, the commands, the off-screen tests and the known limitations.

### Publishing a release (maintainers)

`npm run publier` checks that nothing personal or secret is about to be published, builds both installers, signs the update feed and pushes a snapshot of the code to `main`. It then creates the GitHub release `v<version>` with the installers and the feed. Release notes come from [CHANGELOG.md](CHANGELOG.md). It needs a fine-grained GitHub token (`CYBERPINBALL_GITHUB_TOKEN`) and the publication key, which never lives in the repository. See "Mise à jour depuis la borne" in the [technical manual](docs/manuel.md).

## Third-party components and licences

- **Visual Pinball X** is not part of this repository. It is downloaded from its [official releases](https://github.com/vpinball/vpinball/releases) and checked against a pinned SHA-256. Its licence (GPLv3+, plus a MAME-derived licence for some files) allows redistribution only free of charge and outside any commercial product or activity. The complete installer therefore **must not be sold, nor shipped with a cabinet that is sold or operated commercially**.
- The **VPS database** and **VPinMediaDB** declare no licence. Cyber Pinball does not ship them: they are downloaded from their official addresses when first used. Media from VPinMediaDB belong to their authors and the game artwork to its manufacturers, for **personal use on your own cabinet** only.
- Fonts (Audiowide, Bebas Neue, Orbitron, Press Start 2P, Saira) are under the SIL Open Font License; their licence files sit next to them in `app/renderer/polices`.
- Cyber Pinball does not download tables or ROMs for you. Tables come from their authors' sites, and pinball manufacturers do not allow their ROMs to be shared.

## Licence

The licence of Cyber Pinball itself has not been chosen yet. Until a `LICENSE` file is added, the code is published for reading and testing, and all rights remain with its author.
