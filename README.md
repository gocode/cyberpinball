# Cyber Pinball

**An open-source frontend for virtual pinball cabinets that configures the whole cabinet from a single model.**

[Français](README.fr.md) · [Technical manual](docs/manual.md) · [Releases](https://github.com/gocode/cyberpinball/releases) · [Changelog](CHANGELOG.en.md)

You describe your cabinet once: its screens, buttons and speakers. Cyber Pinball then writes and maintains the configuration of every component for you: Visual Pinball X, its backglass, PuP and DMD plugins, screen positions, sound outputs and keys. No more hand-editing `.ini` files, and no more broken setup when Windows renumbers your monitors.

> **Status: early prototype (0.1.0).** Windows only, built around Visual Pinball X 10.8.1 in plugin mode. Expect rough edges, and back up your tables before trying it.

<p align="center"><img src="docs/images/en/cabinet.webp?v=7a6c78df66" width="880" alt="The table menu on a four-screen cabinet: the playfield screen, shown upright, with the selected table's playfield image, the wheel of table logos and the button hints; next to it the topper, the backglass and the DMD showing the same game, Neon Abyss."></p>

## Features

- **Screens, detected and recognised.** Each monitor is identified by its EDID fingerprint, not by its Windows number. A wizard, driven entirely by the cabinet buttons, assigns the roles (playfield, backglass, DMD, topper), the flipper edge and the playfield diagonal. `VPinballX.ini` is rewritten at every start, so the cabinet survives monitors being swapped, renumbered or woken up in a different order.
- **Several setups, one installation.** The same install can serve a desk PC and a cabinet. The connected setup is recognised automatically, each with its own screens, sound, buttons and `VPinballX.ini`.
- **Sound.** A wizard step plays a sound on every output, lets you pick the backglass and playfield outputs, and tests the speakers of a 5.1 or 7.1 card.
- **A table menu made for cabinets.** One window per cabinet screen, a menu rotated for a player standing at the flippers, a loading screen with the game controls, play statistics, and VPX errors explained in plain words. No screen ever shows the Windows desktop, from start-up to the end of a game.
- **Table management from the cabinet.** Add tables from an import folder, a USB stick or the PC; each table is named from the [Virtual Pinball Spreadsheet](https://github.com/VirtualPinballSpreadsheet/vps-db) database. There is a shared ROM library (each ROM stored once, hard-linked into every table that uses it), automatic choice of the PuP-Pack option that fits your screens, and a "doctor" that explains why a table fails, then a step-by-step "What's missing to play" path that leads to the right download page, installs what you fetched and ends on "Play".
- **Find a table.** A catalogue of the VPS database shows every game, its versions and what this cabinet needs to play it, plus a download queue for the files you download yourself. Cyber Pinball never downloads tables or ROMs on your behalf.
- **Game media.** Logos, playfield videos, backglasses, DMD, topper, loading videos, music, flyers and rules can be imported from PinUP Popper or PinballX, or downloaded on demand from [VPinMediaDB](https://github.com/superhac/vpinmediadb). Each media item also lists what the community sites offer, with your own free account: VPForums, then VPUniverse (whose free accounts wait about 45 seconds per file: Cyber Pinball queues them and waits). When a media file is missing, a built-in fallback is drawn instead. There is also an attract mode.
- **Alongside PinUP Popper, PinballX or PinballY.** Cyber Pinball keeps everything in its own folder, with its own copy of VPX and its own `VPinballX.ini`, and registers nothing in Windows. If another frontend is running, it waits for it to close instead of fighting over the screens; it warns before flipping a screen in Windows, and only restores the taskbars it hid itself.
- **VPX settings without the `.ini`.** All VPX settings, read from VPX's own source code, are editable globally or per table. Visual settings (each table's framing, the position of the backglass, DMD and topper) are made on the running table: "Adjust display in game" opens VPX's menu mid-game.
- **In-app updates.** System menu > "Cyber Pinball update" checks GitHub on demand, shows what's new, then downloads and installs the new version. Every release is signed: the cabinet refuses anything that was not signed with the publisher's key. Your tables, media and settings are kept.
- **English or French.** Every screen follows the language you choose in the system menu ("Language / Langue"), with dates and numbers to match. By default, Cyber Pinball speaks French if Windows does, and English otherwise.

## Screenshots

Every screenshot is taken off-screen by [`docs/demo-captures.ps1`](docs/demo-captures.ps1) on a simulated cabinet (4K playfield lying flat, backglass, DMD and topper). The games are made up: their playfields, backglasses and toppers are original illustrations generated with an image model for these screenshots ([`docs/demo-captures-medias`](docs/demo-captures-medias)), and the rest is drawn by the script.

<p align="center">
  <img src="docs/images/en/game-page.webp?v=7ba374c8d0" width="270" alt="The game page of Neon Abyss: play statistics, files, and the actions Play, Flyer, Rules, Edit info, Game media, Settings for this table, Diagnose and fix, Remove table.">
  <img src="docs/images/en/system-menu.webp?v=395397ca9f" width="270" alt="The system menu, Menu and setup: add a table, VPX settings, cabinet setup, VPS catalog, download queue, table updates, site accounts, ROM library, media import and download, media, sound and attract mode.">
  <img src="docs/images/en/update.webp?v=94e1b361a1" width="270" alt="An update is available: Cyber Pinball 0.2.0, its release date, what's new, the size of the signed installer, and the Update now and Later buttons.">
</p>

<p align="center"><img src="docs/images/en/wizard.webp?v=6d53e1887b" width="880" alt="The setup wizard, screens and roles step: each of the four screens shows its number, and the playfield screen asks “Playfield?” with the flipper and Start hints."></p>

<p align="center"><img src="docs/images/en/vpx-settings.webp?v=133ac0549e" width="880" alt="The VPX settings screen: the Essentials tab with table view and sound settings, the values managed by Cyber Pinball, and the description of the selected setting."></p>

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

From the cabinet: **system menu > "Cyber Pinball update"**. Nothing is installed automatically: Cyber Pinball quietly checks for a new release after start-up and every 6 hours, and when one is out, a red dot appears on the menu's gear and on that entry. The entry then lists what's new in every version you missed, and installs it in one press if you choose "Update now". It closes while the installer runs (about a minute), then restarts on its own and tells you which version is installed. If the installation fails, the installer puts the previous version back.

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

The [technical manual](docs/manual.md) describes every part in detail: the files written, the commands, the off-screen tests and the known limitations. The [manual test scenarios](docs/manual-tests.md) cover what needs a real cabinet. Both also exist in French, the reference version.

### Publishing a release (maintainers)

Every step below is an action of `lanceur.cmd` (section "Fabrication et publication sur GitHub"): see the [cheat sheet](docs/manual.md#cheat-sheet-publishing-a-release) in the technical manual.

`npm run publier` checks that nothing personal or secret is about to be published, builds both installers, signs the update feed and pushes a snapshot of the code to `main`. It then creates the GitHub release `v<version>` with the installers and the feed. Release notes come from [CHANGELOG.md](CHANGELOG.md) (French, shown on the cabinet) and [CHANGELOG.en.md](CHANGELOG.en.md) (English, added to the GitHub release). It needs a fine-grained GitHub token, saved once in `%USERPROFILE%\.cyberpinball\jeton-github.txt` (or the `CYBERPINBALL_GITHUB_TOKEN` variable), and the publication key: neither ever lives in the repository, and `.gitignore` plus the publication check keep secret files out of it. The repository description and topics come from `package.json` and are set at each release, or with `npm run decrire` (the token then also needs the "Administration" permission). See [Updating from the cabinet](docs/manual.md#updating-from-the-cabinet) in the technical manual.

## Third-party components and licences

- **Visual Pinball X** is not part of this repository. It is downloaded from its [official releases](https://github.com/vpinball/vpinball/releases) and checked against a pinned SHA-256. Its licence (GPLv3+, plus a MAME-derived licence for some files) allows redistribution only free of charge and outside any commercial product or activity. The complete installer therefore **must not be sold, nor shipped with a cabinet that is sold or operated commercially**.
- The **VPS database** and **VPinMediaDB** declare no licence. Cyber Pinball does not ship them: they are downloaded from their official addresses when first used. Media from VPinMediaDB belong to their authors and the game artwork to its manufacturers, for **personal use on your own cabinet** only. Files from VPForums and VPUniverse are downloaded with your own account, one at a time, at your request, and stay on your cabinet: their sites forbid re-hosting or redistributing them.
- Fonts (Audiowide, Bebas Neue, Orbitron, Press Start 2P, Saira) are under the SIL Open Font License; their licence files sit next to them in `app/renderer/polices`.
- Cyber Pinball does not download tables or ROMs for you. Tables come from their authors' sites, and pinball manufacturers do not allow their ROMs to be shared.

## Licence

The licence of Cyber Pinball itself has not been chosen yet. Until a `LICENSE` file is added, the code is published for reading and testing, and all rights remain with its author.
