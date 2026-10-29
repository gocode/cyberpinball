# Cyber Pinball

**A free, open-source frontend for virtual pinball cabinets. Describe your cabinet once: Cyber Pinball sets up everything else, you drive it all from the flipper buttons, and you play online with your friends' cabinets.**

[Français](README.fr.md) · [Download](https://github.com/gocode/cyberpinball/releases) · [Technical manual](docs/manual.md) · [What's new](CHANGELOG.en.md)

<p align="center"><img src="docs/images/en/cabinet.webp?v=6c63b0c2a8" width="900" alt="The table menu on a four-screen cabinet: the playfield screen, shown upright, with the selected table's playfield, the wheel of round table medallions and the button hints; next to it the topper, the backglass and the DMD showing the same game, Neon Abyss."></p>

<p align="center"><sub>Tables shown are fictional.</sub></p>

Cyber Pinball turns a PC full of Visual Pinball X tables into a real arcade cabinet: a table wheel worthy of the machine, every screen of the cabinet used, and no keyboard, mouse or `.ini` file in sight. It writes and maintains the configuration of every component for you (VPX, backglass, PuP-Packs and DMD, screen positions, sound outputs, keys), finds what a table needs before you can play it, gathers its media from the community sites, and links your cabinet to your friends' cabinets to share tables and play live together, with no server in between.

> **Status: early prototype (0.1.x).** Windows only, built around Visual Pinball X 10.8.1 in plugin mode. Expect rough edges, and back up your tables before trying it.

## Highlights

- **[Play with friends, cabinet to cabinet](#play-with-friends-cabinet-to-cabinet)**: live online games on up to four cabinets, shared tables and media, who is playing and on which table. No server, no account.
- **[Set up from the cabinet itself](#set-up-from-the-cabinet-itself)**: a wizard driven by the flipper buttons, screens recognised by their hardware fingerprint, so nothing breaks when Windows renumbers them.
- **[A menu with real cabinet presence](#a-menu-with-real-cabinet-presence)**: wheel of medallions, live DMD, cinematic launch, interface sounds, and never a glimpse of the Windows desktop.
- **[From "I want this table" to "Play"](#from-i-want-this-table-to-play)**: the VPS catalogue, a guided "What's missing to play" path, a table doctor, every downloaded file sent where it belongs.
- **[Media from every source, chosen by you](#media-from-every-source-chosen-by-you)**: galleries of what each site offers, a built-in browser, and your own games recorded as wheel videos.
- **[A cabinet that looks after itself](#a-cabinet-that-looks-after-itself)**: a health check, signed updates, a night schedule, guest mode for parties.

## Play with friends, cabinet to cabinet

<p align="center"><img src="docs/images/en/live-game.webp?v=1db3208de7" width="760" alt="A live game between cabinets: on the left, Bruno's invitation opens by itself on this cabinet, on Atlas Rising; on the right, the shared start, a countdown with both players ready, before the table starts on every cabinet at the same time."></p>

Your cabinet is no longer an island. Cyber Pinball links cabinets directly to each other, over the Internet or the local network, with no account to create and no server in between.

- **Live online games.** Invite up to three friends on the same table: the invitation opens on their cabinet, the table version is checked, a shared countdown starts the game on every cabinet at once, then everyone sees the results side by side.
- **Who's playing, right now.** Your friends online, the table they are on, their latest high scores and badges, with small notifications on the wheel, never during a game.
- **Shared tables and media.** Browse a friend's library: the tables you don't have, the media you are missing. Fetch a whole table, or part by part (table, backglass, sounds, media), their version and yours side by side. Everything is checked on arrival and shown in the add plan before anything is installed; ROM and PuP-Pack are unticked by default, and only ticked once you attest that you hold the rights.
- **Find players.** Search for a player by name in a directory the cabinets pass to each other, or find the cabinets around you on the local network, even without the Internet. Send a friend request; they accept on their side.
- **Your cabinet, your rules.** Saves, high-score files and programs never leave your cabinet. Sharing is on by default and turned off in one place, "Sharing and network", which also shows what other cabinets can see. Built on [Holepunch](https://holepunch.to)'s Hyperswarm.

<p align="center"><img src="docs/images/en/friends.webp?v=f215598b45" width="760" alt="My friends: Bruno is online and playing Star Courier, with his new high score just now, and Émile is offline; next to it, Bruno's page with his latest events and See their library."></p>

<p align="center"><img src="docs/images/en/friends-library.webp?v=9d2ac18401" width="760" alt="Bruno's library: the tables on both cabinets and the one this cabinet does not have, Glass Lagoon, with its media and Get the whole table."></p>

## Set up from the cabinet itself

<p align="center"><img src="docs/images/en/wizard.webp?v=27678de49a" width="900" alt="The setup wizard, screens and roles step: each of the four screens shows its number, and the playfield screen asks “Playfield?” with the flipper and Start hints."></p>

- **A wizard you follow standing at the flippers.** Buttons (keyboard encoder, gamepad or Pinscape KL25Z), analog plunger, accelerometer and tilt bob, screens, playfield orientation and diagonal, sound outputs: each step is answered with the cabinet's own buttons.
- **Screens recognised, not numbered.** Each monitor is identified by its EDID fingerprint, and `VPinballX.ini` is rewritten at every start. Swap a monitor, wake the screens in a different order, let Windows renumber everything: the playfield stays the playfield.
- **Sound where it belongs.** One step plays a sound on every output, lets you pick the backglass and playfield outputs, and tests each speaker of a 5.1 or 7.1 card. The menu, its music and every video go through the cabinet speakers.
- **Several setups, one install.** The same installation serves a cabinet and a desk PC: the connected setup is recognised on its own, each with its screens, sound, buttons and `VPinballX.ini`.
- **VPX settings without the `.ini`.** Every VPX setting, read from VPX's own source code, is editable globally or table by table. Framing and the position of the backglass, DMD and topper are adjusted on the running table, from VPX's menu.

<p align="center"><img src="docs/images/en/vpx-settings.webp?v=38fcfb008f" width="760" alt="The VPX settings screen: the Essentials tab with table view and sound settings, the values managed by Cyber Pinball, and the description of the selected setting."></p>

## A menu with real cabinet presence

<p align="center"><img src="docs/images/en/launch.webp?v=eddb60de91" width="900" alt="Animation of the launch on a four-screen cabinet: after Start, the Neon Abyss logo lights up on the playfield, flies up through the DMD and lands on the backglass, then the screens fade out as Visual Pinball X takes over."></p>

- **A wheel of medallions** over the table's own playfield video, one window per cabinet screen: the topper, backglass and DMD follow the selected game.
- **A living DMD.** Cyber Pinball draws the display itself, with its own dot font: the title, PRESS START, credits, the clock and high scores, in the colour you choose.
- **A cinematic launch.** On Start, the game's logo flies from the playfield to the backglass, the DMD shows the loading, and a coil thumps when VPX takes over. VPX never waits for the show.
- **Sounds of the machine.** A solenoid click when changing table, a coin on Start, the knocker when a high score falls; and each game's music on the wheel.
- **Never a white flash, never the desktop.** From start-up to the end of a game and back, every screen stays covered; Ctrl+Shift+D frees all of them when you want Windows back.
- **On a desk PC too.** The playfield in a 9:16 frame, the wheel and the game beside it, the backglass on a second monitor if you have one.

<p align="center"><img src="docs/images/en/live-dmd.webp?v=7a6e43e169" width="760" alt="The menu's live DMD drawn by Cyber Pinball: the game title, PRESS START, the top high score and the clock, in turn."></p>

<p align="center"><img src="docs/images/en/desktop.webp?v=517a956156" width="900" alt="The table menu on a desk PC: the playfield of Neon Abyss in an upright 9:16 frame on the left; on the right its backglass, the wheel of medallions (Copper Comet, Lunar Diner, Midnight Circuit, Neon Abyss, Star Courier, Thunder Reef, Atlas Rising) and the title panel."></p>

## From "I want this table" to "Play"

<p align="center"><img src="docs/images/en/missing-to-play.webp?v=8b4e90863c" width="760" alt="What's missing to play, for Neon Abyss: on the left, step 3 of 4, the ROM is still to do and the suggested action is to get it from vpforums.org, or to play with a neighbouring revision already on the cabinet; on the right, once the ROM is installed, All set to play, with Play as the first action."></p>

- **"Add a table" gathers every way in.** An import folder, a USB stick, the PC, your Downloads folder or the [Virtual Pinball Spreadsheet](https://github.com/VirtualPinballSpreadsheet/vps-db) catalogue: every game, its versions and what this cabinet still needs to play it. Each table is named from that database.
- **"What's missing to play".** A step-by-step path, from a missing ROM or backglass to the right download page, then the install of what you fetched, ending on "Play". Only the table and its ROM are required; the rest is offered as extras.
- **Every file goes where it belongs.** A file you download is recognised by its content (table, backglass, ROM, PuP-Pack, DMD colours, sounds, music…) and filed into that part of the game, even when something else was expected. A table's "Game parts" lets you add, replace, reassign or remove each part.
- **A table doctor.** "Diagnose and fix" explains in plain words why a table fails, and repairs what it can: a ROM in the wrong folder, a PuP-Pack its script keeps switched off, a backglass on the wrong screen.
- **A shared ROM library.** Each ROM stored once, hard-linked into every table that uses it.
- **PuP-Packs that just work.** The pack option is chosen from your screens, the pack is checked before each game, and known pack problems (images under a video name, accented file names, videos triggered by the DMD) are fixed for every pack.
- **Downloads that resume** the next day if the connection drops, and bring you back in one move to the screen you started from. Cyber Pinball never downloads tables or ROMs on your behalf: you choose, from their authors' sites.

## Media from every source, chosen by you

<p align="center">
  <img src="docs/images/en/game-page.webp?v=288bd5f7e2" width="360" alt="The game page of Neon Abyss: play statistics, files, and the actions Play, Flyer, Rules, Edit info, Game media, Settings for this table, Diagnose and fix, Remove table.">
  <img src="docs/images/en/game-media.webp?v=08cb8e257b" width="360" alt="The Game media screen of Neon Abyss: each media item with its preview, where the menu shows it and its role (wheel logo, playfield, backglass, DMD…), and the actions Find media and Search the web.">
</p>

- **Every media item, side by side.** Wheel logo, playfield video, backglass, DMD, topper, loading video, music, flyer and rules: "Game media" shows what each one is, where the menu uses it, and lets you replace it.
- **Galleries, not guesses.** Each item lists what [VPinMediaDB](https://github.com/superhac/vpinmediadb), VPForums and VPUniverse offer, with previews, download counts, ratings, authors and dates; you pick, and the file you picked is the one saved. Sites that need an account use your own free account; their waiting times are queued for you.
- **A built-in browser** on every add or choice screen, with the search already filled in. A YouTube or Vimeo page? "Get the sound" or "Get the video", trimmed and assigned in one go.
- **Play and record.** From a table's page, Cyber Pinball films your game; back in the menu, the video can become the table's presentation on the wheel.
- **Never an empty wheel.** When a media file is missing, a fallback is drawn in the table's colours. Already have media from another frontend? Import it.

## A cabinet that looks after itself

<p align="center">
  <img src="docs/images/en/health.webp?v=5e114520e0" width="360" alt="Cabinet health: 1 blocking, 2 to check, 3 OK. Disk space is fine, Midnight Circuit won't start because its ROM is missing (selected, with Open the table doctor), VPinMediaDB has media for 2 tables, the living-room cabinet is recognised with all 4 screens, and a newer VPX is available to install.">
  <img src="docs/images/en/update.webp?v=5a7a736a90" width="360" alt="An update is available: Cyber Pinball 0.2.0, its release date, what's new, the size of the signed installer, and the Update now and Later buttons.">
</p>

- **Cabinet health.** Disk space, tables that don't start, missing media, screens and VPX version on one screen, each with its repair.
- **Signed updates, from the cabinet.** A red dot on the gear when a release is out; what's new in your language; one press installs it. Every release is signed, and the cabinet refuses anything that does not carry the publisher's signature. Tables, media and settings are kept.
- **Arcade hours.** The cabinet dims and goes quiet at night, then sleeps or shuts down at the chosen time if nobody is playing, after a warning any button cancels.
- **Guest mode** for a party or the kids: guests can choose a table, play and read its page, nothing else; holding both flippers and both MagnaSaves unlocks it.
- **A dedicated cabinet.** Optionally, Cyber Pinball replaces the Windows shell, with a way to bring it back; shut down, restart and sleep from the menu, every screen black until the end.
- **The desktop put back as it was.** The playfield screen is rotated only while Cyber Pinball runs; every exit, even after a crash, restores its orientation.
- **English or French**, chosen in the system menu ("Language / Langue"), with dates and numbers to match.

<p align="center"><img src="docs/images/en/system-menu.webp?v=d6869d2503" width="360" alt="The system menu: Friends, Tables, Media, Downloads, Cabinet and Cyber Pinball sections, each with what it holds."></p>

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

- Everything lives in **one root folder** that you choose (for example `D:\CyberPinball`): the application in `app\`, and next to it the tables, media, configuration, data and emulators. Cyber Pinball keeps its own copy of VPX and its own `VPinballX.ini`, and registers nothing in Windows.
- No administrator rights are needed: it installs for the current user. For Friends, Windows asks once for permission to let Cyber Pinball through its firewall; declining only makes the local network less reliable.
- Options: a desktop shortcut, and start with Windows (for a dedicated cabinet). Silent install: `/S`, `/DEMARRAGE` (start with Windows), `/SANSBUREAU` (no desktop shortcut), `/PAREFEU` (ask for the firewall rule even when silent), `/D=D:\Cabinet` (root folder, last and without quotes).
- **Uninstalling removes the application only.** Tables, media, configuration and data stay in the root folder; reinstalling into the same folder finds them as they were.
- The installers are not code-signed yet, so Windows SmartScreen will warn when you run them.

On first launch, Cyber Pinball offers to install VPX, then walks you through buttons, the analog plunger, screens, playfield, layout and sound, all from the cabinet buttons.

## Updating

From the cabinet: **system menu > "Cyber Pinball" > "Cyber Pinball update"**. Nothing is installed automatically: Cyber Pinball quietly checks for a new release after start-up and every 6 hours, and when one is out, a red dot appears on the menu's gear and on that entry. The entry then lists what's new in every version you missed, and installs it in one press if you choose "Update now". It closes while the installer runs (about a minute), then restarts on its own and tells you which version is installed. If the installation fails, the installer puts the previous version back.

Each release ships a signed feed (`cyberpinball-maj.json`, Ed25519). The installer is downloaded only if the signature matches the key built into the application, and it is launched only if its size and SHA-256 match. A pre-release (`0.2.0-beta.1`) is never offered to cabinets.

## Controls

The buttons are those learned by the wizard. Until then, the usual defaults of cabinet encoders apply:

| Button | Default key | Table menu |
| --- | --- | --- |
| Left / right flipper | Left / right Shift | Choose a table |
| Start | 1 | Play |
| Exit | Escape | System menu (settings, cabinet setup, updates, quit) |
| Keyboard | Tab, or ⚙ with the mouse | System menu, from anywhere |
| Keyboard | Ctrl+Shift+D | Windows desktop: frees every screen of the PC; again: back to the menu |
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
- The cabinet network uses Holepunch's Hyperswarm, HyperDHT, Protomux and secret-stream, with sodium-native and udx-native (MIT and Apache-2.0 licences).
- To compare the number of balls per game of ROM tables, Cyber Pinball reads PinMAME memory maps from the [Pinball Memory Maps](https://github.com/tomlogic/pinball-memory-maps) project, downloaded on demand: this program makes use of content from the Pinball Memory Maps project, made available under the Open Database License (ODbL v1.0).
- Fonts (Audiowide, Bebas Neue, Orbitron, Saira) are under the SIL Open Font License; their licence files sit next to them in `app/renderer/polices`.
- Cyber Pinball does not download tables or ROMs for you. Tables come from their authors' sites, and pinball manufacturers do not allow their ROMs to be shared.

## Licence

The licence of Cyber Pinball itself has not been chosen yet. Until a `LICENSE` file is added, the code is published for reading and testing, and all rights remain with its author.
