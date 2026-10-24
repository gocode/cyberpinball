English · [Français](manuel.md)

# Cyber Pinball: technical manual

Complete reference of the prototype, in English (the French version, [manuel.md](manuel.md), is the reference): how each part works, the files it writes, commands, unattended tests and known limitations. Project overview: [README.md](../README.md) (in French: [README.fr.md](../README.fr.md)).

The design notes cited here (`docs/recherche/…`) are internal working documents: they are not published with the code.

Open-source frontend for virtual pinball cabinets. The idea: you describe the cabinet once, and Cyber Pinball writes and maintains the configuration of every component (VPX, then B2S, PinUP, DMD, DOF). No more editing an `.ini` by hand.

**Status: prototype of milestones 1 and 2.**
- **Screens**: EDID detection, a setup wizard driven by the cabinet buttons (roles, flipper edge, playfield diagonal), generation of `VPinballX.ini` with automatic table framing, corrected automatically when Windows renumbers or moves the screens.
- **Cabinet configurations**: several screen sets for one installation (two machines, a desktop PC and a cabinet), each with its own roles, sound, buttons and `VPinballX.ini`; the one that is plugged in is recognized automatically at startup, before each game and by the `sync` command (see [Cabinet configurations](#cabinet-configurations)).
- **Sound**: a wizard step that plays a sound on each audio output and has you pick the backglass output and the playfield output, then tests the speakers of a 5.1 or 7.1 sound card; `SoundDeviceBG`, `SoundDevice` and `Sound3D` are rewritten at every startup with the current names of the outputs (see [Sound](#sound)).
- **Table menu**: one window per cabinet screen, VPX launched with `-Play`, a loading screen showing the game controls, return to the menu with the foreground taken back, statistics in each table's `.info` file, VPX errors reported in plain language. With the playfield screen lying flat and rotated while Windows stays in landscape, the menu, the details screen, table management and the settings rotate for a player standing at the flipper edge (`playfield.flipperEdge` in the cabinet model, mapped to the screen's current orientation), in portrait at 90° and 270°; the backglass, DMD and topper do not rotate.
- **Full-screen windows**: each window (menu, details screen, settings, wizard) covers its whole screen, Windows taskbar included, with no border line: Electron full screen (`coverDisplay`, `app/src/cover-display.ts`), without forcing the foreground. VPX comes to the front during a game, Windows dialog boxes ("Choisir des fichiers" (Choose files)) stay on top, and the Windows key or Alt+Tab bring back the desktop and the taskbar. System menu > "Bureau Windows" (Windows desktop) minimizes all windows; the playfield button in the taskbar (or Alt+Tab) reopens the menu on all screens.
- **No screen ever shows the Windows desktop** (screen guard, `app/src/screen-guard.ts`), from startup to the end of a game: one black cover per screen, opened before any other window and never in the foreground; the menu windows stay behind VPX during loading and play; the menu ↔ wizard restart hands over without a gap; the taskbars are hidden during a game. A screen that stays uncovered for more than one second is reported in the console (see [Launching a game](#launching-a-game)).

## Getting started

Requirements: Windows 10 or 11, Node.js 22 or later.

The simplest way: double-click `lanceur.cmd`. It offers a menu (play, installation, opening VPX, detection, wizard, synchronization, endurance, tests, off-screen demos, data folder) and compiles whatever is needed before each action. `.\lanceur.cmd sync` runs an action directly. The scenarios to test by hand are in [docs/manual-tests.md](manual-tests.md).

**As an end user**: the "Fabriquer et déployer" (Build and deploy) action (or `npm run deployer`) produces `CyberPinball.exe` and copies it to `<racine>\app\`, with a `Cyber Pinball.lnk` shortcut at the root. The executable finds its root by itself (the folder that contains `app\`); if VPX is missing, it offers to install it from the screen.

**To distribute**: the "Fabriquer l'installeur" (Build the installer) action (or `npm run installeur`) produces `release\CyberPinball-Setup.exe` (light version) and `release\CyberPinball-Setup-complet.exe` (with VPX). See [Windows installer](#windows-installer).

The same commands with npm:

```bash
npm install
npm test          # builds and runs the core tests
npm run probe     # lists the detected screens and audio outputs, their fingerprint and the name VPX expects
npm start         # table menu (screen wizard on first startup)
npm run assistant # full wizard (-- --boutons, --ecrans, --playfield, --disposition, --son: a single step)
npm run fabriquer # executable in release\win-unpacked\ (npm run deployer: also copies it to <racine>\app\)
npm run installeur # same, then release\CyberPinball-Setup.exe and -complet.exe (-- --leger: without the full one)
npm run sync      # what the application does at every startup: fixes VPinballX.ini if the screens have moved
npm run vpx-schema # regenerates the VPX settings schema from its source code (-- --check: check only)
```

The keys are those of the cabinet buttons, recorded at the first step of the wizard ("Boutons" (Buttons), see below). Until that step has been done, they are the ones cabinet encoders send by default:

| Button | Default key | Setup wizard | Table menu |
| --- | --- | --- | --- |
| Left / right flipper | Left / right Shift | Change screen; sound: backglass / playfield | Choose a table |
| Start | 1 | Confirm; sound: both | Play |
| Exit | Esc | Skip a role, start over; sound: no role; buttons: skip an optional button | Menu: back, VPX settings, buttons, quit |
| (keyboard) | arrows, Enter, Esc | Like the flippers, Start, Exit | Like the flippers, Start, Exit |
| (keyboard) | Tab | Button: refused (reserved) | Menu and configuration, from anywhere in the menu; then Tab / Shift+Tab to move through it |
| (mouse) | ⚙ top right | | Menu and configuration |
| (keyboard) | H | | Show the controls |
| (keyboard) | R | | VPX settings |
| (keyboard) | Backspace | Previous step | |
| (keyboard) | Ctrl+Q | Quit | Quit |
| (keyboard) | Ctrl+Shift+K | | Stop a stuck game |

The keyboard keys only work if no cabinet button already sends them (an arrow recorded as the right flipper no longer moves back); the same goes for H and R.

During a game, the keys are those written in VPX's `[Input]` section (shown again on the loading screen): by default Shift for the flippers, Enter for the plunger, 5 for a credit, 1 for Start, Esc to quit (VPX 10.8.1 quits as soon as it is pressed), and both MagnaSave buttons together (without them, Credit and Start) for VPX's menu, where the screens are placed ("Adjusting the display during a game").

## Installation and file layout

All of Cyber Pinball lives in a **root chosen at installation** (the launcher's "Installer" (Install) action), e.g. `D:\CyberPinball`. The layout is fixed: an update moves nothing.

```
D:\CyberPinball\
  app\                         Cyber Pinball, replaced entirely at each update
  emulators\vpx\10.8.1-5436\   VPX as published, one version per folder
  emulators\vpx\current\       junction to the active version
  tables\  media\              tables and media, all emulator families
  pinmame\roms\                ROM library: each ROM stored once, linked into each table
  config\VPinballX.ini         passed to VPX with -Ini, independent of its version; VPinballX-<id>.ini: other configurations
  data\                        cabinet model (cabinet.json, all its configurations), backups
  downloads\                   verified archives, to reinstall without a network; VPS database
  import\                      tables dropped from a USB stick, offered for adding
```

- Third-party components (VPX today, other emulators later) are described in [packages/installer/components.json](../packages/installer/components.json): version, official URL, SHA-256, and distribution mode (`automatic` if the license allows shipping them, `manual` otherwise). They are not in the git repository.
- An archive whose hash does not match the manifest is deleted, never installed. Running the installation again downloads nothing a second time.
- The root is refused in Program Files, in Windows and on a network share. The choice is stored in `%APPDATA%\CyberPinball\root.json`.
- Before a root is chosen, everything is written to a sandbox (`%APPDATA%\CyberPinball\sandbox\`). It is taken over automatically during installation.
- Before each write of `VPinballX.ini`, the previous version is backed up to `data\backups\` (10 versions kept). Only the keys owned by Cyber Pinball are modified.
- An owned key changed by hand (or through VPX's in-game menu) is never silently overwritten: `data\vpx-owned.json` keeps the values last written to each `VPinballX.ini` (one set of values per cabinet configuration), and at startup the menu asks whether to keep the new value or restore Cyber Pinball's (`npm run sync -- --reecrire` on the command line). Keeping a screen size imports it back into the cabinet model; keeping any other key leaves it to the user (`vpxManual` in `cabinet.json`, editable in the VPX settings) until the next run of the screen wizard, which takes back control of all keys. A number rewritten by VPX with different decimals does not count as a change.
- Variables for testing: `CYBERPINBALL_ROOT` (another root), `CYBERPINBALL_HOME` (isolated sandbox), `CYBERPINBALL_VPX_INI` (another file).

On the command line: `node packages/installer/dist/cli.js setup <racine>`, `install [id]`, `status`.

### Windows installer

`npm run installeur` builds the executable, then two French-language NSIS installers in `release\`:

| File | Size | VPX |
| --- | --- | --- |
| `CyberPinball-Setup.exe` (light) | 111 MiB | downloaded on first launch (173 MB), verified by SHA-256 |
| `CyberPinball-Setup-complet.exe` | 276 MiB | official archive included, placed in `downloads\`: installed on first launch, no connection needed |

What the installer does:
- **Root folder** of your choice. Suggested: the one from the previous installation, otherwise the root stored in `root.json`, otherwise `D:\CyberPinball` if `D:` is a local disk, otherwise `C:\CyberPinball`. Same refusals as `packages/installer`: Program Files, Windows, network folder (mapped network drives included), plus a missing drive or an incomplete path. An `app\` folder that does not contain Cyber Pinball is refused too.
- The application goes into `<racine>\app\` (replaced entirely at each update), the root layout is created and the root is stored in `%APPDATA%\CyberPinball\root.json`.
- Data from before a root was chosen (`%APPDATA%\CyberPinball`: cabinet model, backups, `sandbox\VPinballX.ini`) is taken over as `setup` does it, never overwriting the root's own data.
- Shortcuts: `Cyber Pinball.lnk` at the root and in the Start menu; on the desktop (checked by default); optionally at Windows startup, for a dedicated cabinet (the session's Startup folder).
- Per-user installation, without administrator rights, with an entry in "Programmes et fonctionnalités" (Programs and Features) (`HKCU`).
- If Cyber Pinball is open, the installer and the uninstaller ask you to close it.
- Command line: `/S` silent, `/DEMARRAGE` launch at Windows startup, `/SANSBUREAU` no desktop shortcut, `/D=D:\Borne` root (last, without quotes). Exit code 2 if the root is refused.

**Uninstalling removes the application only**: the `app\` folder, the shortcuts and the "Programmes et fonctionnalités" entry. Tables, media, configuration, data (cabinet model, backups), emulators, downloads, `import\` and `root.json` stay: a reinstallation into the same root finds them as they were. To erase everything, delete the root by hand. The uninstaller (`app\Désinstaller Cyber Pinball.exe`, `/S` for silent mode) refuses to run outside an `app\` folder that contains `CyberPinball.exe` and the `installation.ini` log.

**VPX license and the full version.** Most of VPX's files are under GPLv3+; the rest keeps a license derived from MAME's (`docs\license.txt` in the archive), which allows redistribution on three conditions: do not sell it or use it in a commercial product or activity, provide the sources of any modified version, reproduce the license. The full version embeds the unchanged official archive (hash checked against the manifest at build time) and, next to it, `<archive>.licence.txt`: the full license text read from the archive itself, the archive's address and the commit of its sources. It can therefore be redistributed free of charge, but **must never be sold, nor shipped with a cabinet that is sold or operated commercially**. The build stops if the license found in the archive changes. The archive is taken from `CYBERPINBALL_VPX_ARCHIVE` if that variable is set, otherwise from `cache\downloads\` (downloaded if needed).

The NSIS script is [scripts/installeur/cyberpinball.nsi](../scripts/installeur/cyberpinball.nsi), compiled by [scripts/installeur.mjs](../scripts/installeur.mjs) with the NSIS 3 that electron-builder downloads (hash verified). The icon is drawn in [app/renderer/icone.svg](../app/renderer/icone.svg), which also serves as the logo of the drawn topper; `node scripts/icone.mjs` renders it off-screen at each size of the `.ico` and derives the welcome-page banner from it (into `app\ressources\`). In the executable, koffi is reduced to the JavaScript loaded at run time and the `win32-x64` binary.

### Code signing

Nothing is signed without a certificate: the build carries on without asking anything. With a code signing certificate (Authenticode), `CyberPinball.exe`, the uninstaller and both installers are signed and timestamped by `signtool` (the uninstaller is written and signed before being embedded). The certificate is designated through environment variables, never in the repository ([scripts/signature.mjs](../scripts/signature.mjs)):

| Variable | Role |
| --- | --- |
| `CYBERPINBALL_SIGN_SHA1` | thumbprint of a certificate in the Windows store: USB token or HSM, mandatory for certificates issued since June 2023 |
| `CYBERPINBALL_SIGN_PFX`, `CYBERPINBALL_SIGN_PASSWORD` | `.pfx` file and its password (older or test certificate) |
| `CYBERPINBALL_SIGN_ARGS` | `signtool` arguments that replace the previous ones, e.g. `/dlib … /dmdf …` for a cloud signing service (Azure Trusted Signing) |
| `CYBERPINBALL_SIGN_TIMESTAMP` | RFC 3161 timestamp server (default: `http://timestamp.digicert.com`) |
| `SIGNTOOL_PATH` | `signtool.exe` to use (default: the most recent one from the Windows Kits, otherwise the one supplied by electron-builder) |

Procedure, once the certificate has been obtained in the name of Cyber Pinball's publisher:

```powershell
certutil -user -store My                    # certificate thumbprint ("Cert Hash(sha1)", « Hachage cert. (sha1) » on French Windows)
$env:CYBERPINBALL_SIGN_SHA1 = '<empreinte>'
npm run installeur
Get-AuthenticodeSignature release\CyberPinball-Setup.exe, release\win-unpacked\CyberPinball.exe   # Status: Valid
```

An OV certificate gives a valid signature, but SmartScreen keeps warning until the publisher's reputation is established; an EV certificate or Azure Trusted Signing establishes it right away.

### Updating from the cabinet

An installed cabinet updates itself from the system menu, entry **"Mise à jour de Cyber Pinball" (Cyber Pinball update)** (details: installed version, and available version once checked). Nothing is installed on its own: a quiet check runs 30 s after start-up, then every 6 hours, without downloading anything or showing anything if it fails (no network); an available version puts a **red dot** on the menu's gear (⚙) and on the "Mise à jour de Cyber Pinball" (Cyber Pinball update) entry of the system menu (`attention` on system menu entries, carried by the gear as soon as one entry has it). Once opened, the entry shows straight away the release notes of every version missed since the cabinet's own (the feed's `history`), and "Mettre à jour maintenant" (Update now), selected by default: installing takes one button press. A result older than 10 minutes is checked again. Off-screen, tests only check their own test site (`CYBERPINBALL_MAJ_URL`), never GitHub. Code: [packages/core/src/update.ts](../packages/core/src/update.ts) (feed, versions, download), [app/src/updates-menu.ts](../app/src/updates-menu.ts) (screen).

- **Where**: the releases of the public repository [github.com/gocode/cyberpinball](https://github.com/gocode/cyberpinball). The cabinet reads `https://github.com/gocode/cyberpinball/releases/latest/download/cyberpinball-maj.json` (a GitHub redirect, free of its API's rate limit; pre-releases are not listed there). The repository is written in a single place (`UPDATE_REPOSITORY`), equal to `repository` in `package.json` (checked by the tests); the installer derives from it the website shown in "Programmes et fonctionnalités" (Programs and Features).
- **Signed feed**: `cyberpinball-maj.json` contains the manifest (version, date, release notes in French and, when `CHANGELOG.en.md` has the version's section, in English (`notesByLanguage.en`): the cabinet shows those in its language, otherwise the French ones; light installer: release address, size, SHA-256) and its Ed25519 signature. The cabinet only reads a feed signed by the publishing key, whose public half ships with the application ([update-key.ts](../packages/core/src/update-key.ts)): a compromised GitHub account is not enough to get a program installed on the cabinets. The downloaded installer (`<racine>\downloads\cyberpinball\CyberPinball-Setup-<version>.exe`, previous ones are deleted) is verified (size and SHA-256 from the signed feed) before it is launched; a bad file is deleted.
- **Screens**: checking; "à jour" (up to date: latest published version and its date); "Cyber Pinball x.y.z est disponible" (Cyber Pinball x.y.z is available), with release notes, size and verification, plus "Mettre à jour maintenant" and "Plus tard" (Later); download (MiB received, percentage, "Annuler" (Cancel)); "Installation"; "Mise à jour impossible" (Update failed: no network, no published version, signature or hash refused) with "Réessayer" (Retry). When run from the sources (`npm start`), the check works but installation is not offered.
- **Installation**: the usual installer, in `/MAJ /D=<racine>` mode (plus `/S` off-screen). Only its progress page is shown; it waits for Cyber Pinball to close (up to 60 s), keeps the shortcuts chosen at the previous installation (desktop, Windows startup, read from `app\installation.ini`; for a cabinet deployed with `npm run deployer`, which has none, the ones that exist), renames the old `app\` to `app.precedente` for the duration of the installation (put back if it fails, deleted if it succeeds), then restarts Cyber Pinball with its previous arguments (`CYBERPINBALL_MAJ_ARGS`). Tables, media, configuration and data are not touched, as with any reinstallation.
- **At the next startup**: `data\mise-a-jour.json`, written before the installer is launched, tells whether the expected version is running: a banner "Cyber Pinball x.y.z est installé (avant : …)" (Cyber Pinball x.y.z is installed (before: …)), or "La mise à jour vers x.y.z n'a pas abouti : la version … est restée en place" (The update to x.y.z did not complete: version … stayed in place).

#### Publishing a release

```powershell
# 1. Version in package.json, release notes in CHANGELOG.md ("## 0.2.0" section, one "-" line per item), commit, push to GitHub.
# 2. Once and for all: a fine-grained GitHub token, limited to the gocode/cyberpinball repository, with
#    "Contents" and "Administration" read and write, saved on its own in this file (outside the repository):
#    %USERPROFILE%\.cyberpinball\jeton-github.txt   (or the CYBERPINBALL_GITHUB_TOKEN variable)
npm run publier                      # -- --brouillon: release left as a draft, invisible to cabinets
```

[scripts/publier.mjs](../scripts/publier.mjs) runs the publication check, builds both installers, writes and signs the feed, reads it back with the shipped key, creates the `v<version>` release on the pushed commit (refused if there are uncommitted changes, if the commit is not on GitHub or if the release already exists), attaches `CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe` and `cyberpinball-maj.json`, publishes it, then reads the feed again the way a cabinet does. A version with a prerelease tag (`0.2.0-beta.1`) goes out as a "pre-release": cabinets do not see it. Finally, it sets the repository description and topics, taken from `description` and `keywords` in `package.json`; `npm run decrire` sets them on their own (`-- --essai`: checks without sending anything). For this, the token also needs the "Administration: read and write" permission.

**Publishing key**: created once by `node scripts/cle-publication.mjs` (never replaced afterwards; `--verifier` checks that it matches the shipped key). The private key is never in the repository: `%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`, or `CYBERPINBALL_MAJ_CLE_PRIVEE`. **Back it up off the machine**: if it were lost, installed cabinets would refuse every later update and would have to be reinstalled by hand.

**Publication check** ([scripts/audit-publication.mjs](../scripts/audit-publication.mjs), run by `npm test` and by publishing): since the repository is public, it rejects, in tracked files, private keys, tokens (GitHub, OpenAI, AWS, Slack, Google), passwords written in plain text, Windows profile paths (`C:\Users\<nom>`), e-mail addresses not on its allow list (commit co-author, font authors, examples) and the names from a private list kept outside the repository (`%USERPROFILE%\.cyberpinball\audit-noms.txt`, one per line, or `CYBERPINBALL_AUDIT_NOMS`). `--commits <a..b>` also checks the messages and authors of those commits.

**Unattended test**: `.\docs\demo-mise-a-jour.ps1` (hidden desktop, simulated screens) builds the installer for the repository's version, publishes the next version on a local site (`CYBERPINBALL_VERSION_ESSAI`, `publier --local`, feed signed with the real key), installs the old version in a sandbox with launch at startup and no desktop shortcut, makes it reject a forged feed, then runs the real update: the old version downloads, launches the installer and closes, the installer replaces it and starts the new version, which announces the update and reports itself up to date. It checks the installed version, the kept shortcuts, that `app.precedente` is deleted, that the follow-up record is consumed, the site's requests, the layout and the off-screen watch. `CYBERPINBALL_MAJ_URL` overrides the feed address; `CYBERPINBALL_MAJ_CLE` (PEM file) overrides the public key, only in a sandbox (`CYBERPINBALL_HOME`). Also only in a sandbox, `CYBERPINBALL_MAJ_INSTALLEE=1` makes its root count as an installation: the screen offers "Update now" even when running from source (project page screenshots).

## VPS database

When tables are added, each one is identified in the [VPS database](https://github.com/VirtualPinballSpreadsheet/vps-db) (Virtual Pinball Spreadsheet, file `db/vpsdb.json`, about 2,600 games), which is then used to name the folder "Title (Manufacturer Year)" and fill in the `.info`: `Title`, `Manufacturer`, `Year`, `VPSId` (the game identifier, shared by every version in the folder), `Authors` (those of the identified table version) and `IPDBId`. Fields already present in an existing `.info`, or in one shipped with the archive, are kept.

- **License**: the `vps-db` repository declares no license (checked on October 20, 2026: no LICENSE file, `license: null` in the GitHub API, nothing on the website). Without a license, redistribution is not allowed, so Cyber Pinball does not ship the database. It is downloaded the first time a table is added, from its official address (`https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json`), and kept in `<racine>\downloads\vpsdb.json`, like the components. The tests use a hand-copied extract of a few games.
- **Updates**: at most every 12 hours, in the background, when "Ajouter une table" (Add a table) is opened; `lastUpdated.json` (a few bytes) tells whether the database has changed. Without a network, the cache is used as is; with neither cache nor network, names are derived from the files, as before. An invalid response never replaces the cache.
- **Matching** ([packages/core/src/vps.ts](../packages/core/src/vps.ts)): based on the names of the `.vpx` files, of the `.directb2s` in the same package, of the archive and of the folders, and on the ROM read from the script. The VPUniverse numeric prefix is ignored; titles are compared regardless of case, accents and punctuation, with or without the article ("Addams Family" for "The Addams Family"), by main title ("Terminator 2" for "Terminator 2 - Judgment Day"), and "Dr." for "Doctor"; manufacturer and year break ties between games with the same name; authors ("VPW", "g5k", "Bigus") and version number identify the table version. The result is a list of games, each with a score between 0 and 1.
- **Confidence**: at 0.85 or more, with a lead of 0.08 over the next one, the game is picked without asking. Otherwise, the "Quel jeu est-ce ?" (Which game is it?) screen offers up to five games, plus "Garder" (Keep) for the name derived from the files (game not in the database); a game not in the database with no candidate gets the file name, without asking. From the plan, "Choisir le jeu" (Choose the game) or "Changer le jeu" (Change the game) reopens the screen for each table. Nothing moves until "Installer" (Install).
- Measured on the whole database (a made-up name "Name (Manufacturer Year).vpx" for each of the 2,366 games that have a VPX table): 99.7% identified first, no wrong certainty; the others are duplicates within the database.

## Finding a table: catalog, "Récupérer", waiting list

System menu > **"Trouver une table (catalogue VPS)" (Find a table (VPS catalog))**: every game in the VPS database that can be played in VPX (2,370 on October 22, 2026, 960 of them with no ROM to find), its versions, and what it takes to play it on this cabinet. Design, rights and site terms: `docs/recherche/acquisition.md`.

- **What Cyber Pinball does not do**: download on the user's behalf. Nearly all VPS links lead to forum pages (vpuniverse.com, vpforums.org…) that require an account and whose terms forbid bots and rehosting; no manufacturer allows its ROMs to be distributed for emulation. The warning is shown on first use (accepted once, with the date stored in `<données>\acquisition.json`).
- **Catalog**: twelve games per page, with their VPS thumbnail, their type, their versions and their ROM; "Chercher un titre…" (Search a title…) matches title, initials and ROM name, like the media search; filters "Jeux" (Games: all, no ROM to find, solid-state, electromechanical, original creations) and "Sur la borne" (On the cabinet: not installed yet, installed or not, already installed); sort by title or newest first.
- **A game's details screen**: its VPX versions, the **recommended** one first (not a MOD when possible, VPW preferred, the most recently updated, with a working link; the reasons are spelled out), then the others, with their particulars (MOD, VR, nFozzy, Fleep, what they include), the date and the site.
- **What it takes**, worked out without downloading anything, from the cabinet's screens and the ROMs already there: the table; the backglass (`.directb2s`), unless it comes with the table or the cabinet has no backglass screen, with the ones that suit its screens first; the ROM, unless the game needs none or it comes with the table ("déjà sur la borne" (already on the cabinet) if the library or a table has it); then, optional, PuP-Pack, remastered sounds, DMD colors (if there is a display), music, topper (if there is a topper screen), point of view. Each line gives its site and whether an account is needed.
- **"Récupérer" (Fetch) window** (Start on a line): the file's page opens on the main screen, under a Cyber Pinball banner that reminds you what to download (game, version, authors, ROM), with "Précédent" (Back), "Retour à la fiche" (Back to the page), "Ouvrir dans mon navigateur" (Open in my browser) and "Fermer (Échap)" (Close (Esc)). You sign in and download yourself, with keyboard and mouse; Cyber Pinball clicks nothing, fills in nothing and sees no password (separate session, `persist:acquisition`, like a browser). Each downloaded file is stored in `<racine>\downloads\acquisition` and matched to what was expected through the page it came from.
- **Waiting list** (system menu, or from the catalog): what is being fetched, game by game, "Attendu" (Expected) or "Reçu" (Received). A file downloaded in your own browser is found through "Surveiller Téléchargements : oui" (Watch Downloads: yes) (the Windows Downloads folder, only while something is expected; a file still downloading, `.crdownload` or `.part`, is ignored) or through "Chercher dans Téléchargements" (Search Downloads); it is matched by its name (zip named after the ROM, `.directb2s`, game name) and left where it is.
- **Installation**: "Installer : <jeu>" (Install: <game>) opens the usual add plan with the received files, the VPS game already chosen; nothing moves until "Installer" (Install), then the doctor checks the table. The origin is recorded in the `.info` (`CyberPinball.source`: VPS game and file, version, authors, page, date); the copies in `downloads\acquisition` are deleted, the files in Downloads stay.
- **Table updates** (system menu): a table whose VPS file has a newer version, according to its recorded origin or, without one, according to the author and version written in the table; Start opens what is needed for the new version.
- **Site accounts** (system menu): vpuniverse.com, vpforums.org, pinballnirvana.com and pinsound-community.org, each "Connecté" (Signed in, with the date until which the sign-in is kept), "connecté pour cette fois seulement" (signed in for this time only) or "Pas connecté" (Not signed in), read from the cookies of the "Récupérer" session, all subdomains included. "Se connecter" (Sign in) opens the site's sign-in page in the "Récupérer" window: you enter your own account there and tick "Remember me"; the sign-in is then kept from one start to the next, as in a browser (about 3 months on vpuniverse.com, one year on pinballnirvana.com). "Se déconnecter" (Sign out) deletes that site's cookies and nothing else. Cyber Pinball neither sees nor keeps any password.
- **Direct download** (a setting in "Comptes des sites" (Site accounts), off by default): when the user is signed in to the site, "Récupérer" loads the page in a hidden view of that session and follows the download link the site offers (page, confirmation page, at most four pages), without showing the page; the file lands in the waiting list as usual. As soon as the site asks for something, the page opens in the "Récupérer" window, with the reason in orange in the banner: not signed in, Cloudflare check or CAPTCHA, several files to choose from, enforced wait (free-account timer), terms to accept, limit reached, proxy refused, file on another site, page not recognized. Cyber Pinball builds no address, accepts no terms, skips no wait and solves no check: one download, one page, at the user's request. Site flows and terms: `docs/recherche/comptes-sites.md` and `docs/recherche/acquisition.md`, § 14.
- **Code**: `packages/core/src/acquisition.ts` (hosts, catalog, recommendation, what it takes, waiting list, matching, origin, updates), tests in `packages/core/src/test/acquisition.test.ts`; screens in `app/src/catalog.ts`, window in `app/src/acquire-window.ts` (banner `app/renderer/acquire.*`), watching in `app/src/downloads-watch.ts`, accounts and download probes in `packages/core/src/sitesessions.ts` (tests `sitesessions.test.ts`). Off-screen demos, on fake pages (no forum page is loaded): `.\docs\demo-catalogue.ps1`, and `.\docs\demo-comptes.ps1` for accounts and direct download. Manual tests: [docs/manual-tests.md](manual-tests.md), "Manual tests: finding a table".

## ROM library

A ROM is often used by several tables (versions, mods of the same machine). Each ROM is stored **only once**, in `<racine>\pinmame\roms`, and each table that plays it gets a **hard link** to it in its own `pinmame\roms` (where VPX 10.8.1 looks first): the same file on disk, taking no extra space. The folder was not invented: `<racine>\pinmame` is already the shared PinMAME folder that the sync suggests for `[Plugin.PinMAME] PinMAMEPath` as soon as it contains `roms`; a table without a link therefore still finds its ROM there, as a fallback, **provided it has no `pinmame\roms` folder**: as soon as that folder exists, the PinMAME plugin looks only there (`PinMAMEPlugin.cpp`, lines 436-477, commit af26b2d93), and the doctor reports it as blocking when the ROM is missing from it. Code: [packages/core/src/romlibrary.ts](../packages/core/src/romlibrary.ts).

**Per-table ROM aliases** ([packages/core/src/romalias.ts](../packages/core/src/romalias.ts)): the plugin also reads `alias.txt` in the table's PinMAME folder (`<table>\pinmame`), one line "name requested by the script,game loaded", even before the ROM. The doctor uses it in three ways:

- **Neighboring revision**: the requested ROM is missing, but another revision of the same game (`t2_l6` for `t2_l8`) is in the table or the library; on request, it links it and writes the alias. The warning says so: lamps, coils or switches may differ, settings and high scores (NVRAM) are not carried over, and remastered sounds and DMD colors stored under the other name are no longer found. As long as the alias is in use, a reminder stays in the diagnosis.
- **Old VPinMAME names** ("goldfinger" for "bond", 119 names taken from PinMAME's `release/VPMAlias.txt`, in [packages/core/src/vpmalias.ts](../packages/core/src/vpmalias.ts)): VPinMAME translated them on its own, but the VPX 10.8.1 plugin no longer knows them; the doctor writes the line, and says whether the real ROM is missing too.
- **Alias no longer needed**: the requested ROM has arrived, but the alias takes precedence over it; "Revenir à la ROM demandée" (Back to the requested ROM) removes the line (and the file, if no line is left).

- **Same volume required**: a hard link only connects two folders on the same disk (NTFS). A table on a different volume from the root (junction to another disk, FAT32 or exFAT drive) gets a **copy**, and the plan says so.
- **Identity**: two files with the same name are the same ROM if their SHA-1 hash is the same. Two different contents under the same name: the most recent (file date) is kept, or the one chosen in the plan ("Garder plutôt…" (Keep instead…)); the other goes to the recycle bin. An identical copy replaced by a link is deleted (its content stays in the library, byte for byte: this is checked just before); any other replaced file goes to the recycle bin.
- **Adding**: an imported ROM enters the library, then is linked into **every installed table that plays it**: those whose script requests it without having any copy, those that already have a copy, and the table the import is meant for. A new table whose ROM is already in the library gets it without importing anything more. A ROM that no table is expecting yet is stored anyway, for the table to come. Scripts of tables not yet read are read before the plan (VPX `-ExtractVBS`, about one second each, then cached).
- **Tidying up** (system menu, Exit in the menu: "Ranger les ROM dans la bibliothèque" (Move ROMs into the library)): for ROMs from before the library. The plan shows, ROM by ROM, the one that enters the library, the copies replaced by a link, the links added, the versions set aside and the space freed; nothing moves until "Ranger" (Tidy up). The summary gives the space taken by ROMs measured before and after.
- **Overall view** (system menu: "Bibliothèque de ROM" (ROM library)), with the cabinet buttons: each ROM, the tables that use it and its size; the ROMs to tidy up; **unused** ROMs (no table has it or expects it), with the recycle bin offered one by one or for all; ROMs **expected but missing**, with "Ajouter" (Add). Disk space counts each physical file once and states what the links save. Only ROMs in `pinmame\roms` folders are concerned: `.zip` files stored elsewhere (FlexDMD fonts, for example) are not ROMs.
- **Doctor**: "ROM pas liée dans la table" (ROM not linked in the table) (it is in the library, not in `pinmame\roms`: link it) and "Copie de ROM au lieu d'un lien" (ROM copy instead of a link) (replace it with a link; for a different version, use the library one, the other goes to the recycle bin). The table's details screen marks a linked ROM with "(bibliothèque)" ((library)).

Deleting a table only sends its link to the recycle bin: the ROM stays in the library, and the overall view then offers it as unused if no table plays it anymore.

## PuP-Packs

Cyber Pinball targets **VPX 10.8.1 plugin mode**: the PUP plugin shipped with VPX replaces PinUP Player, so there is nothing to install or register (decision of October 20, 2026; classic mode and DOF will come later). The plugin looks for the pack in `<dossier de la table>\pupvideos\<nom>`, case-insensitively, where `<nom>` is the value the script passes to `PuPlayer.B2SInit` or `Init`, or failing that the ROM being played. The full research, with references to the VPX code, is in `docs/recherche/pup-packs.md`.

**When adding** ([packages/core/src/puppack.ts](../packages/core/src/puppack.ts), [tableimport.ts](../packages/core/src/tableimport.ts)), a pack (a folder containing `screens.pup`, `playlists.pup`, `triggers.pup`, or options that contain them) is:

- **named** the way the script loads it: name passed to `B2SInit` (a literal, or a variable such as `pGameName`, `cPuPPack`), then the ROM, then the name passed to `Init`. A pack already correctly named keeps its name; a pack named otherwise ("Monster Bash PuP-Pack v2") takes the expected name. Without a readable script (VPX missing), it keeps its folder name and the plan points this out;
- **flattened**: `rom\rom\…`, or an archive folder that contains only the pack (a readme next to it does not get in the way);
- **cleaned**: `._*`, `.DS_Store`, `__MACOSX` and 0-byte MP4 files are not installed;
- **replaced entirely** if it already exists: the old folder goes to the recycle bin, never a mix;
- **configured**: the screen layout option is applied by copying its files, **without ever running a `.bat`**.

**Options.** Published packs store their variants in `PuP-Pack_Options\<option>\` and ship one `.bat` per option at the root, for example `Option 2 - FullDMD on Backglass.bat`:

```bat
rem echo off
xcopy /y "PuP-Pack_Options\Option 2 - FullDMD on Backglass\*"
del /Q PuPDesktopPunch.exe
del /Q PuPInit.bat
```

Every `.bat` whose name mentions an option (or that copies files) is **read, not run**. Recognized: `copy` and `xcopy` of a folder, a pattern (`*`, `*.pup`) or a file of the pack to its root or one of its folders (`/s`, `/e` to recurse), `del`/`erase` of files at the root (they go to the recycle bin), and anything with no effect: `rem`, `::`, `echo`, `@echo off`, `pause`, `cls`, `exit`, `title`, `cd`/`pushd` to the `.bat` folder (`%~dp0`, `.`), `>nul`. Anything else makes the analysis fail: absolute path, `..`, variable (`%PUPDIR%`), `start`, `if`, `for`, `call`, `set`, `move`, `ren`, `rd`, chaining (`&`, `|`), redirection to a file, copy with no matching file. Option folders with no readable `.bat` (packs shipped with only `PuP-Pack_Options`, like those applied by hand on Linux) also become options. Classic-mode tool `.bat` files (`PuPInit.bat`, `configdisplays.bat`) are ignored.

**Choosing the option**, automatically, based on the cabinet model: the option name ("Topper", "FullDMD on Backglass", "2 Screen", "Desktop", "16x9", "4x3", "AIO", "Stream"…) and then its `screens.pup` (screen 0 on: topper; screen 5 or 1 inside the backglass through CustomPos: DMD in the backglass) are compared with the assigned roles (backglass, DMD, topper) and with the aspect ratios of the DMD (real 4:1 or FullDMD 16:9) and of the backglass. A desktop or all-in-one cabinet option is never picked on a cabinet. If the choice is not clear-cut, if the cabinet is not configured, or if a `.bat` could not be read, the "Quelle option du PuP-Pack ?" (Which PuP-Pack option?) screen opens before the plan, showing the rejected `.bat` and the reason; from the plan, "Changer l'option du PuP-Pack" (Change the PuP-Pack option) reopens it. The chosen option and the pack's original name are kept in the table's `.info` (`CyberPinball.pup.<nom>`, other fields are preserved): when the pack is updated, the same option is reused without asking.

**DMD frame on the backglass.** Many packs have neither a DMD screen (1) nor a FullDMD screen (5), but a screen placed on the backglass whose name or playlist mentions DMD (*Star Trek LE*: screen 13 "BGdmdText", at 26 %, 79 %, over 48 % × 21 % of the backglass). When it is on, the pack plays its own animations there: the real DMD stays on its own screen (option for a cabinet with a DMD). When it is off, the frame stays empty so the DMD can be placed there (option for a two-screen cabinet). With no screen 1, no screen 5 and no frame, nothing about the DMD is inferred from `screens.pup`: a pack without a DMD screen does not mean "cabinet without a DMD" (rule fixed on 24 October 2026: the option made for a four-screen cabinet ranked below the one with the empty frame). The ROM's DMD cannot show inside a pack's frame: the PUP plugin, which then draws the backglass window, never draws the DMD (`docs/recherche/pup-packs.md`).

**Changing the option after installation**: table details screen > "PuP-Pack", offered as soon as one of the table's packs has options (`tablePupPacks`, `packages/core/src/doctor.ts`). The screen shows the applied option, the one that suits the cabinet, and every option with what it targets (topper, DMD on its own screen or in the backglass, FullDMD, aspect ratios). Start applies the chosen option: its files are copied, the old `.pup` files go to the trash, and no `.bat` is ever run (`pupOptionOps`). The choice is remembered in the `.info` (`option`, and `chosen: "user"`: the doctor no longer questions it) and applies from the next game; "Jouer" (Play) is offered on the same screen to see it. On the details screen, the "PuP-Pack" line turns orange when another option suits the cabinet better.

**The doctor** ([doctor.ts](../packages/core/src/doctor.ts)) checks, without launching VPX:

| Finding | When | Fix |
| --- | --- | --- |
| PuP-Pack not found | the script loads a pack (or a `pupvideos` folder exists) and there is no `pupvideos\<nom attendu>` | rename the only folder present; otherwise, add the pack |
| PuP-Pack stored one folder too deep | `pupvideos\X\X\screens.pup` | move the pack up |
| Unused PuP-Pack | another folder in `pupvideos` that no version in the folder loads | recycle bin |
| Option not applied, or modified | options exist, and the root has no `.pup` (or its `.pup` files match no option) | copy the chosen option again (remembered, otherwise based on the cabinet) and remember it |
| Option unsuited to the cabinet | an option is applied, and another one scores clearly better for the current cabinet (cabinet changed since installation, older automatic choice), unless the option was chosen on the details screen | apply the better one and remember it |
| Pack screens missing from the cabinet | a visible screen targets the topper, the DMD or the backglass while that role is not assigned | — (information) |
| Playfield videos not displayed | screen 3 (Playfield) is visible: the plugin does not render it | — |
| PuP-Pack driven by the script | `playlistadd` in the script and no `.pup` | — |
| Pack meant for another ROM | `PupCapture` folder and a ROM different from the pack's original name, or a ROM in another language (suffix `f`, `g`, `i`, `s` after the version, assumed) | — |
| VPX log | the table's last game in `vpinball.log`: pack loaded without `screens.pup`, no pack loaded, `Not implemented` functions | — |

**Unrecognized cases** (the plan then offers the options to pick with the buttons, or the doctor reports it): `.bat` files that ask for a choice (`choice`, `set /p`) or test for files (`if exist`), `.bat` files that run an executable (`PuPDesktopPunch.exe`, installers), options stored outside a folder whose name contains "option" and with no readable `.bat`, packs with no `.pup` at all outside a `pupvideos` folder (old script-driven packs: recognized only if they already arrive inside `pupvideos\`), a pack-specific `PinUpPlayer.ini` (ignored by the plugin), changes made in the PuP-Pack Editor (enabling topper videos, for example) that no longer match any option: reported as information, never overwritten without the button. The VPX FFmpeg DLLs and the `Priority.PUP` keys in `VPinballX.ini` (which put the pack ahead of the directb2s) belong to the VPX sync, not to this module.

Sources for the option rule: the `.bat` example in [dekay's vpinball wiki](https://github-wiki-see.page/m/dekay/vpinball-wiki/wiki/PUP-Packs), [pup-research](https://github.com/francisdb/pup-research) ("copy the .pup files from `PuP-Pack_Options/<option>` to the root"), the [Batocera wiki](https://wiki.batocera.org/systems:vpinball) (Batman 66: `Option 3 - Desktop`), and option names of VPUniverse and vpinball.com packs, from search engine summaries (Tron Legacy, Transformers, Aliens, Pirates of the Caribbean, PinEvent packs: "Option 1 - Backglass and Topper", "2 Screen - 4x3 or 5x4", "Full DMD on Backglass", "Backbox AIO", "PUP Stream"). VPUniverse pages refuse automated reading (403): the rule still needs confirming on real packs (manual tests 44 to 51).

## Structure

| Folder | Role |
| --- | --- |
| `packages/core` | Cabinet model, EDID, fingerprints, screen matching, INI, VPX generator, buttons and keys (`buttons.ts`). No Electron, no Windows. |
| `packages/win-displays` | Windows functions through FFI (koffi): screen detection (DisplayConfig, EDID, scaling, ContainerId), audio outputs (`audio.ts`, MMDevices registry read by `registry.ts`), connected USB devices (`usb.ts`, for real DMDs), windows and foreground (`windows.ts`), screen orientation (`orientation.ts`). |
| `packages/installer` | Manifest of third-party components, choice of the root, verified download, extraction, junction to the active version. |
| `app` | Electron application: entry point (`main.ts`), setup wizard for buttons, screens and sound (`wizard.ts`, test sounds in `renderer/sound.js`), table menu (`frontend.ts`), VPX settings (`settings.ts`), table management (`library.ts`), VPX launch and monitoring (`launcher.ts`), `sync` command. |
| `docs/design-system` | Visual language of the redesign (tokens, `.cp-*` components, icons, screen mockups) and its `index.html` page; regenerated by `node docs/design-system/src/construire.mjs`. Applied to the interface (`app/renderer/theme.css`), to the built-in fallbacks (`fallback.css`) and to the icon (`app/renderer/icone.svg`). |

## VPX settings

From the table menu, R key (or Exit then "Réglages de VPX" (VPX settings)); standalone: `npx electron app --reglages [--table=<morceau du nom>]`, launcher action "reglages".

- The list of settings is not hand-coded: `npm run vpx-schema` reads `src/core/Settings_properties.inl` from the VPX source code at the commit of the installed version (`sourceCommit` in the manifest) and writes `packages/installer/vpx-settings/<version>.json`. It adds the settings that plugins declare when they load, read from the `plugins/` folder of the same commit (`packages/core/src/vpx-plugin-settings.ts`): each plugin's `[Plugin.<id>] Enable` (`plugin.cfg`), the `MSGPI_*_SETTING` macros actually registered (`RegisterSetting`), and `[Backglass|ScoreView|Topper] Priority.<moteur>` for each rendering engine of the secondary windows. For 10.8.1-5436: 1,240 settings, 101 of them from plugins. Each plugin setting records the plugin that declares it: it has no effect when that plugin is off. With `-- --ini <VPinballX.ini>`, it checks that every setting in the schema appears in a file written by that version (except those of plugins VPX did not load); with `-- --check`, it fails if the committed file differs from the source code.
- "Essentiels" (Essentials) tab: a translated selection (`packages/core/src/vpx-essentials.ts`), including the groups "Backglass, PuP et DMD réel" (Backglass, PuP and real DMD) and "Dossiers communs à toutes les tables" (Folders shared by all tables). "Avancé" (Advanced) tab: the whole schema by section, with the original labels and descriptions, plus keys outside the schema (keys, options declared by tables) as read-only; an `[Input] Mapping.*` key is shown with the name of the action and of the key.
- Flipper buttons: move and pick a value; Start: edit, confirm; Exit: cancel, go back; Del: default value; mouse and wheel also work.
- Keys written by Cyber Pinball (windows, plugins on or off, plugin priorities on the assigned windows, `SecurityLevel` and `AskToTurnOn`, which prevent VPX from asking questions during play (see [Launching a game](#launching-a-game)), detected real DMD, button keys once the "Boutons" (Buttons) step is done, and audio outputs once the "Son" (Sound) step is done) are shown but cannot be changed, along with where their value comes from and how to change it.
- Writing: only the setting's line changes (`IniDocument`), with a timestamped backup (`writeWithBackup`). "Valeur par défaut" (Default value) leaves the key empty, which is the VPX convention.
- Per table (`openSettings({ scope: 'table', table })`): the `<table>.ini` file next to the .vpx, found the way VPX does it (table name, otherwise folder name). Only values that differ from the global setting are kept in it, as VPX does; an empty file is deleted. In a sandbox (`CYBERPINBALL_HOME`), it is written to `<bac à sable>\sandbox\tables\` and never next to the real .vpx.

## Setup wizard and configuration menu

The setup wizard (`app/src/wizard.ts`, screens `app/renderer/screen.*`) runs at first start, or through "Assistant complet" (Full setup wizard), and goes through: **buttons** (capturing each button), **screens and roles** (playfield, backglass, DMD, topper), **playfield orientation and size** (flipper edge, flipping the screen in Windows if VPX needs it, diagonal), **screen layout** (zones), **sound** (audio outputs, speaker test), then the summary and the writing of `cabinet.json` and `VPinballX.ini`. The list of steps, what each one decides and its keys are in [packages/core/src/wizardsteps.ts](../packages/core/src/wizardsteps.ts) (`WIZARD_PHASES`, `WIZARD_STEPS`), tested in [wizardsteps.test.ts](../packages/core/src/test/wizardsteps.test.ts).

**System menu (Exit, Tab or ⚙) > "Configuration de la borne" (Cabinet configuration)** gathers everything that sets up the cabinet. Each step can be redone there on its own and returns to the table menu, saved or not:

| Entry | Option | What is redone | `VPinballX.ini` keys written |
| --- | --- | --- | --- |
| "Boutons de la borne" (Cabinet buttons) | `--boutons` | button capture and test | `[Input]` |
| "Écrans et rôles" (Screens and roles) | `--ecrans` | the screen of each role; flipper edge and diagonal only if the playfield moves to another screen | VPX windows and framing |
| "Orientation et taille du playfield" (Playfield orientation and size) | `--playfield` | flipper edge, screen flip, diagonal | VPX windows and framing |
| "Disposition des écrans" (Screen layout) | `--disposition` | zone of each role on its screen | VPX windows and framing |
| "Son de la borne" (Cabinet sound) | `--son` | backglass and playfield outputs, speaker test | `SoundDevice`, `SoundDeviceBG`, `Sound3D` |
| "Assistant complet" | | all the steps in a row | all managed keys |
| "Touches par défaut des encodeurs" (Default encoder keys) | | immediate reset, no wizard | `[Input]` |
| "Configurations de la borne" (Cabinet configurations) | | choose, rename, trash, new configuration | |

A single step starts from the saved model (roles, screens, flipper edge), changes only its own fields in `cabinet.json` (`stepCabinet`) and writes only its own `VPinballX.ini` keys (the `only` option of the sync), even ones changed by hand; the other keys stay as they are until the next sync from the menu. The summary shows only those keys; Exit there restarts the step, Backspace goes back to the last question. Windows and framing: `[Player] Playfield*`, `[Backglass]`, `[ScoreView]`, `[Topper]`, `BGSet`, `ScreenWidth`, `ScreenHeight`, `CabinetAutofitMode`.

**Leaving without saving, at any step** (layout editor, flip countdown and summary included): the "Quitter sans enregistrer ?" (Leave without saving?) question opens with

- the **"Quitter sans enregistrer"** (Leave without saving) button, always shown at the top right of every screen (also clickable in the layout editor);
- **Ctrl+Q** on a keyboard; Ctrl+Q again answers yes;
- **Esc or Exit held for 2 s** (the button shows "Maintenu : quitter sans enregistrer ? dans 1 s" (Held: leave without saving? in 1 s));
- **during button capture, any key held for 3 s**, which is not captured. At that point the wizard does not yet know which key is Exit: this is the only gesture that works with any encoder. So that it does not get in the way of the capture, a button is captured **on release**: a press on a cabinet button lasts well under a second, the difference is invisible, and a held key is never captured (nothing to undo). Outside button capture, only a held Esc or Exit opens the question: held flippers keep their effect (speeding up a setting in the editor);
- **Exit (or Backspace) on the first question** of a step, when there is nothing before it: the playfield in the full wizard, the flipper edge in orientation alone, the first output in sound alone, the editor in layout alone.

The question says what would be lost ("Boutons : Flipper gauche sur A" (Buttons: Left flipper on A), "DMD : …", "Flippers à gauche de l'image" (Flippers on the left of the image), "Son…" (Sound…), "Écran du playfield : remis dans son orientation d'origine" (Playfield screen: restored to its original orientation), or "Rien n'a été changé" (Nothing was changed)) and where you will end up. **Start (or Enter): yes** · **Exit, Esc or Backspace: no** · the same gesture again (a key held again): yes · with no answer within 20 s, the wizard resumes. During button capture, the Start and Exit already captured also answer. Yes: nothing is written, neither `cabinet.json` nor `VPinballX.ini`; an unconfirmed screen orientation is restored; back to the table menu or, on first start without a model (the menu cannot open), Cyber Pinball closes, as announced on screen ("l'assistant reprendra au prochain démarrage" (the wizard will resume at next start)). A test pins the invariant: the question comes before any step in `handleKey`, the mouse before any other action, every state sent to the screens carries the button, and nothing is written outside the two save functions.

**"Placer librement…"** (Place freely…): at the screens step, after the whole screens and the ready-made spots (bottom of the backglass in 4:1 or 16:9, inset in the playfield), the backglass, DMD and topper offer "Placer librement…". Start opens the layout editor on that role, placed on its saved screen (otherwise a free screen, otherwise the backglass screen), with the cursor on the "Zone" line; "Revenir à l'assistant" (Back to the wizard) keeps the chosen spot and moves on to the next role, Exit returns to the question as it was.

## Interface language

Everything Cyber Pinball displays exists in French and in English: table menu and game pages, system menu, setup wizard, VPX settings, the "Get" window, and the messages and findings of the core (doctor, synchronisation, import, update). Dates and numbers follow the language (`fr-FR` or `en-GB`). Console logs, test reports and files written for other tools stay in French.

- **By default**: the Windows language if it is French, English otherwise (`app.getPreferredSystemLanguages()`).
- **System menu > "Language / Langue"**: the entry is named in both languages, so it can be found whatever language is shown, and each language is offered in its own words ("Français", "English"). The choice, made with the cabinet buttons like everything else, is kept in `<data>\language.json` (`{ "language": "en" }`); the menu restarts at once through the screen guard (`relaunchCovered`), as for a change of configuration, and reopens its windows in the new language.
- **`CYBERPINBALL_LANGUE=fr|en`** forces the language (tests, screenshots); a choice made in the menu also replaces it for the restart.

**Method** (`packages/core/src/i18n.ts`): every displayed text goes through `t('texte français', { parameter })`, its French form being the key; the English catalogue, split by part of the interface in `packages/core/src/i18n/en/*.ts`, gives its translation. Parameters go in braces (`t('{role} : aucun écran', { role })`), plurals through `tn(n, '{n} table', '{n} tables')` (0 and 1 are singular in French, only 1 in English), lists through `formatList` ("a, b et c" / "a, b and c"), dates and numbers through `formatDate`, `formatDateTime`, `formatNumber`. The language is set once per process, at start-up (`app/src/language.ts`, imported by `main.ts` before the modules that display anything): no text is translated while a module loads, and the label tables of the core (`ROLES`, `BUTTONS`, `WIZARD_STEPS`…) are getters (`get label()`). Windows receive the language and the catalogue through their preload (`cyberI18n`); `app/renderer/i18n.js`, loaded before the other scripts of each page, gives them the same `t`, `tn` and `uiLocale()`, and translates the fixed texts of the pages, marked `data-i18n` (with a context key, `data-i18n="…"`, when one French text has two meanings).

**Invariant** (`packages/core/src/test/i18n.test.ts`, run by `npm test`): the scan of the interface sources (`i18n-scan.ts`: `app/src`, `app/renderer`, `packages/core/src`, `packages/installer/src`, `packages/win-displays/src`) collects every key passed to `t()`, `tn()` and `data-i18n`, and fails on a key without translation, a key that is not a literal (`${…}` template, variable), different `{parameters}` between a key and its translation, one key translated in two ways, a translation left in French, a key nothing uses any more, and a text that looks French outside `t()` (accents, common words; comments and console logs excepted). A text that must not be translated (file name, search pattern, proper noun) carries `// i18n-ignore` at the end of its line. The test also checks that no text is translated while the core modules load. By hand, on a few files:

```bash
npx tsc -b packages/core && node packages/core/dist/test/i18n-scan.js app/src/wizard.ts app/renderer/screen.js
```

At run time, a text requested without a translation is shown in French and the console reports it once ("Traduction manquante : …").

## Cabinet buttons

This is the first step of the wizard, since everything else is driven with the buttons: the screen asks "Appuyez sur le bouton" (Press the button) for left flipper, right flipper, Start, Exit, coin, plunger, then the optional buttons (left and right MagnaSave, Extra Ball, Tilt, nudges to the left, to the right and forward, volume − and +), which Exit skips. The same question is shown on every screen (upright for the player on the previous playfield), above the list of all buttons: those already captured with their key, the current one, those still to come, so you can decide in advance which cabinet button will play which role. A key already captured for another button is refused, as are the Windows key and keys VPX cannot read; a button counts when it is released, only once, and a key held for 3 s opens "Quitter sans enregistrer ?" (Leave without saving?) instead of being captured.

This button-by-button capture is the one for a new cabinet (no keys saved yet); each button still to come shows, dimmed, the key currently in effect, i.e. the encoders' key. On a cabinet that is already configured, and always for the step on its own, the step opens straight on the summary: each button with its current key, nothing to redo. A single button can be changed on its own: click its line, or use the flippers to reach its line (after the actions) then Start; press the new button and you are back at the summary, the other keys kept (Backspace cancels). "Tout relever" (Capture all) starts the full capture over.

A mistake can be fixed without the cabinet buttons, since those are precisely what is being captured: click a line in the list (that button is asked again, then the step resumes at the first unanswered button), Backspace or "◀ Précédent" (◀ Previous) (the previous button; Backspace therefore cannot be captured as a button), "Touches par défaut" (Default keys) and "Tout relever", always shown and clickable (the pointer appears when you move the mouse).

The summary is also a test: the flippers choose the action ("Valider" (Confirm), "Précédent", "Touches par défaut", "Tout relever") or a button to redo, Start runs that choice. A flipper, Start or Exit whose key has just been captured (different from the one in effect) must have been pressed at least once before "Valider" is accepted (check mark in the list, "Essai des touches relevées : Flipper gauche ✓ · …" (Testing captured keys: Left flipper ✓ · …)): a wrong capture therefore cannot be saved without the player noticing. Kept keys and the encoders' default keys are known and need no test: "Touches par défaut" then "Enregistrer" (Save) saves at once. A keyboard's arrows and Enter also choose and run, without counting as a test. "Valider" moves on to the screens (or saves, for the step on its own). In the full wizard, if nobody presses anything for 20 seconds, the current keys are kept (the encoders' keys on a new cabinet): an unattended cabinet, or one whose encoder is in gamepad mode, thus moves on to the screens as before.

On its own: system menu (Exit) > "Configuration de la borne" (Cabinet configuration) > "Boutons de la borne" (Cabinet buttons), `npm run assistant -- --boutons`, the launcher's `boutons` action, or the "Affecter les boutons de la borne" (Assign the cabinet buttons) action of a key in the VPX settings. The rest of the model is kept; only the `[Input]` keys are taken over.

**Access to configuration without the buttons**: a wrong capture (for example Exit on a button you can no longer find) must never lock you out of the settings. From the table menu and its messages, a discreet gear at the top right (⚙, clickable on top of everything, more visible when you move the mouse) and a keyboard's Tab key open "Menu et configuration" (Menu and configuration): add a table, VPX settings, cabinet configuration (buttons, screens, playfield, layout, sound, full wizard, default encoder keys, configurations), ROM library, quit. In these menus, Tab and Shift+Tab move the cursor whatever buttons have been captured, and every line can be clicked. Tab and Backspace are reserved: the "Boutons" (Buttons) step refuses them, and a capture containing one is treated as inconsistent (default keys).

**Default encoder keys** (left / right Shift, 1, Esc, 5, Enter…), the fallback when a saved capture no longer drives the cabinet: system menu > "Configuration de la borne" > "Touches par défaut des encodeurs" (Default encoder keys) (with the mouse: click "Exit : menu" (Exit: menu) at the foot of the menu, then the lines), "Remettre les touches par défaut des encodeurs" (Restore the default encoder keys) in the details of a key in the VPX settings ("Avancé" (Advanced) > Input), and, without any button, the launcher's `boutons-defaut` action (`node app/dist/sync-cli.js --boutons-par-defaut`). `cabinet.json` goes back to the default keys, and `[Input]` is rewritten: VPX actions that had lost their key get it back (`withDefaultButtons`, `app/src/buttons-reset.ts`).

**Inconsistent capture** (required button with no key, the same key for two buttons, a refused key, for example after editing `cabinet.json` by hand): `buttonProblems` detects it, the whole interface falls back to the default keys (`buttonKeys`), the sync stops writing `[Input]` and reports it, and the menu offers at startup to redo the "Boutons" step.

The keys are stored in `cabinet.json` (`buttons`, `KeyboardEvent.code` codes: `ShiftLeft`, `Digit1`…) and the whole interface reads them: wizard, menu, details screen and table management (`navigationKeys`, `packages/core/src/buttons.ts`), VPX settings, in-game key reminder (`gameKeys`). A model without `buttons` keeps the default keys and leaves `[Input]` alone.

**What VPX expects** (read from `src/input/InputManager.cpp` and `InputAction.cpp` at commit `af26b2d93` of 10.8.1-5436): VPX no longer stores DirectInput codes (`LFlipKey`, `JoyLFlipKey`… no longer exist). Each action has its own `[Input] Mapping.<action>` key, a list of alternatives separated by ` | `, each one a combination separated by ` & `; a keyboard key is written `Key;<scancode SDL>` (HID usage: A = 4, 1 = 30, Enter = 40, left Shift = 225), a gamepad button `SDLJoy_<GUID SDL>_<n>;<bouton>`. An empty value means VPX's default key. Cyber Pinball translates `KeyboardEvent.code` into an SDL scancode (`SDL_SCANCODES`) and writes:

| Button | `[Input]` keys (VPX default) |
| --- | --- |
| Left / right flipper | `Mapping.LeftFlipper`, `LeftStagedFlipper`, `UILeft` (`Key;225`) / `RightFlipper`, `RightStagedFlipper`, `UIRight` (`Key;229`) |
| Start, Exit | `Mapping.Start` (`Key;30`), `Mapping.ExitGame` (`Key;41`) |
| Coin, plunger | `Mapping.Credit1` (`Key;34`), `Mapping.LaunchBall` (`Key;40`) |
| Left / right MagnaSave | `Mapping.LeftMagna`, `UIUp` (`Key;224`) / `RightMagna`, `UIDown` (`Key;228`) |
| Extra Ball, Tilt | `Mapping.ExtraBall` (`Key;5`), `Mapping.Tilt` (`Key;23`) |
| Nudges | `Mapping.LeftNudge` (`Key;29`), `RightNudge` (`Key;56`), `CenterNudge` (`Key;44`) |
| Volume − / + | `Mapping.VolumeDown` (`Key;45`), `Mapping.VolumeUp` (`Key;46`) |

- A skipped optional button keeps VPX's default key.
- Only single keyboard keys are replaced: a gamepad button or a combination added in VPX's menu (F12, "Input Settings") stays alongside.
- Another VPX action whose default key is that of a button loses it (`Key;0`, no key: an empty value would give it back): otherwise an Extra Ball button on D would also open the debugger. Duplicates that VPX intends are kept (Volume − and Service 7 share `-`). The action gets its key back when the conflict goes away. The summary and the sync's findings name these actions.
- These keys are managed like the others: a key changed by hand in VPX is reported at startup, kept or reset as you choose (`[Input] Mapping.LeftFlipper = Key;4 au lieu de Key;225`). The VPX settings show them in the "Avancé" tab, Input section, with the names of the action and of the key.
- Table scripts do not see the difference: `LeftFlipperKey`, `StartGameKey`… hold the action's identifier, not the key (`ScriptGlobalTable.cpp`). VPX also sends the script the DirectInput code of each key pressed, which an old table can test directly.

**Gamepads and encoders in joystick mode**: not handled. VPX identifies a gamepad by its SDL GUID (bus, vendor, product, version and name checksum) followed by its index, and numbers buttons (0…), hats (0x100…) and axes (0x200…) its own way; Chromium provides neither the device version nor the same numbering, so the wizard cannot write these keys without hardware to check them against. Cyber Pinball's interface only reads the keyboard anyway. With an encoder in joystick mode: switch it to keyboard mode (most allow it), or let VPX offer its default layout (it does so the first time a gamepad, a Pinscape or an Arcade2TV is plugged in) then refine it in F12 > "Input Settings". Cyber Pinball keeps these assignments.

## Cabinet configurations

The same installation can be used on several machines: three screens besides the main one on one PC, two on another, a cabinet. `data\cabinet.json` holds all the **configurations**; each one is a complete cabinet model (screens by EDID fingerprint, roles, zones, flipper edge, diagonal, sound, buttons, keys left to the user) with its **own `VPinballX.ini`** and its own memory of the keys written. Tables, ROMs, media, per-table settings and statistics stay shared. Code: [packages/core/src/configurations.ts](../packages/core/src/configurations.ts) (computation), [packages/core/src/store.ts](../packages/core/src/store.ts) (files), [app/src/configurations-menu.ts](../app/src/configurations-menu.ts) (screens), tests in [configurations.test.ts](../packages/core/src/test/configurations.test.ts).

- **Migration**: a `cabinet.json` from before configurations becomes, the first time it is read, the "Borne" (Cabinet) configuration, taken over as is, which keeps `config\VPinballX.ini` and its memory; the old file is kept as `data\cabinet-v1.json`. Nothing to do.
- **Recognition** (at startup, before each game, `sync`): each configuration gets a score from the connected screens (`scoreConfiguration`): 100 per screen found by its serial number, 60 per screen found by model and port (weak fingerprint), 30 by model and size only (cable moved to another port), −50 per missing screen, −10 per extra connected screen. A configuration is a candidate with at least one screen found, at most one missing (a screen turned off) and no more extra screens than screens found. The only complete candidate is picked automatically; otherwise a choice already made for these same screens; otherwise the best candidate if it is alone with its score. A partly found configuration stays selected with a warning, and the sync warns about the role of the screen that is off (and blocks if it is the playfield), as before. Every choice is explained: "« Second poste » reconnue : 3 écrans sur 3 retrouvés (2 par numéro de série, 1 par modèle et port) — score 260, devant « Borne » (score -110)" ("Second poste" recognized: 3 of 3 screens found (2 by serial number, 1 by model and port), score 260, ahead of "Borne" (score -110)).
- **Ambiguity or no match**: nothing is written. The menu opens on the main screen with "Quelle configuration est branchée ?" (Which configuration is connected?): the known configurations, from closest to farthest with their score, "Nouvelle configuration" (New configuration) (full wizard) and "Plus tard" (Later) (the menu stays usable; a game asks for the configuration again). The choice is remembered for these screens (10 screen sets remembered) and the menu restarts on the right screens. On the command line: exit code 3, and `npm run sync -- --configuration "Nom"` makes the same choice.
- **Configuration change**: a sync finding ("Configuration changée : « Borne » à la place de « Second poste »…" (Configuration changed: "Borne" instead of "Second poste"…)) and a 12 s banner at the top of the menu, with no button to press.
- **System menu > "Configuration de la borne" (Cabinet configuration) > "Configurations de la borne" (Cabinet configurations)** (its details name the active configuration, and say whether it is forced): the list with each one's score for the connected screens; for each one, "Utiliser avec ces écrans" (Use with these screens), "Toujours utiliser celle-ci" (Always use this one) (forced: recognition is suspended until "Reconnaissance automatique" (Automatic recognition)), "Renommer" (Rename) (on-screen keyboard, or a real keyboard), "Supprimer" (Delete) (configuration trash, restorable with its file; the last one cannot be deleted); "Nouvelle configuration" restarts the wizard with `--nouvelle-configuration`.
- **New configuration**: the wizard creates the configuration ("Poste à 3 écrans" (3-screen PC), to be renamed), remembered for the connected screens. Its `VPinballX-<id>.ini` file starts as a copy of the active configuration's file: hand-made settings that do not depend on the screens (graphics quality, physics, keys) carry over; the wizard then writes the screens, sound and buttons into it. "Assistant complet" (Full setup wizard) redoes the active configuration, and so does the "Boutons" (Buttons) step on its own.
- **One `VPinballX.ini` per configuration, rather than a single one rewritten at each switch**: VPX re-saves its file itself, and the user sets both managed keys (kept in `vpxManual`) and free keys in it. A single file would mean setting aside, then restoring, each machine's own values at every switch, and the detection of hand edits would mistake the other machine's values for tweaks: a value set by hand on one machine would be overwritten or lost on the way back. With one file each, syncing a configuration never touches another one's file, and the memory of keys written stays tied to its own file (the "bascule aller-retour" (round-trip switch) test). The trade-off: a general setting changed later (through "Réglages de VPX", VPX settings) only applies to the active configuration.
- **Safeguard**: all the application code goes through the active configuration's file (`activeVpxIni`, `syncConfiguration` in [app/src/vpx-ini.ts](../app/src/vpx-ini.ts)); a test rejects any other access to `Locations.vpxIni`.

## Table orientation and framing

After the playfield is chosen, the wizard asks where the player stands: the flippers rotate the display until the text is upright, with the "Flippers · vous êtes ici" (Flippers · you are here) band on the player's side. It then asks for the diagonal, suggested from the EDID (the millimeter size from the detailed timing, otherwise the centimeters), and discarded if it does not match the image proportions, as happens with some TVs and with projectors. All of this is stored in `cabinet.json` (`playfield.flipperEdge`, `playfield.manualSizeCm` only if the diagonal differs from the EDID; `packages/core/src/layout.ts`). These questions can be redone on their own through system menu > "Configuration de la borne" (Cabinet configuration) > "Orientation et taille du playfield" (Playfield orientation and size) (`--assistant --playfield`), and with "Écrans et rôles" (Screens and roles) when the playfield moves to another screen.

Keys written to `VPinballX.ini` (`vpxLayoutSettings`, read from `ViewSetup.cpp` and `player.cpp` in VPX 10.8.1):

| Key | Value | Managed |
| --- | --- | --- |
| `[Player] BGSet` | 1 (cabinet) if the image is taller than it is wide for the player, otherwise 0 | yes |
| `[Player] ScreenWidth`, `ScreenHeight` | real size in cm, the long side as the width whatever the orientation | yes |
| `[Player] CabinetAutofitMode` | 1 ("Ajuster la table" (Fit table)) in cabinet view, only if the key is empty | no, can be changed in the settings |

With automatic framing, VPX recomputes the table's whole cabinet view and derives the rotation from the shape of the window: flippers on the right of a landscape image, at the bottom of a portrait image, with no setting to change it.

For a player on the left or at the top, the wizard rotates the playfield screen in Windows itself. At the "Où sont les flippers ?" (Where are the flippers?) step, it announces "Start : retourner l'écran pour VPX" (Start: flip the screen for VPX); Start switches the screen to a flipped orientation (`setDisplayOrientation`, `packages/win-displays/src/orientation.ts`: `ChangeDisplaySettingsExW` tried as a dry run, applied, read back, and put back as it was if Windows did something else). The wizard runs the detection again, repositions its windows and recomputes the player's edge in the new image (left ↔ right, top ↔ bottom): the player always sees the text upright. Like Windows, it then asks whether to keep this orientation: without Start within 15 seconds, or with Exit, the screen returns to its original orientation, and Start then carries on without flipping (tables upside down). The choice of rotation is in `vpxOrientationFix` (`packages/core/src/vpx.ts`): a flip, which keeps the resolution and the layout of the other screens; a quarter turn only for a Windows portrait screen seen from the side. The sync, on the other hand, does not touch the orientation: it reports the problem and points to the wizard. With another cabinet frontend installed or running (PinUP Popper, PinballX, PinballY), the first Start flips nothing: it warns that the orientation is a Windows setting that the other frontend is subject to as well; Start flips anyway, Exit keeps the Windows orientation (see [Coexisting with another cabinet frontend](#coexisting-with-another-cabinet-frontend)).

The saved edge applies to the orientation Windows had at the time of the wizard, stored with the screen (`lastSeen.rotation`). If it later changes outside the wizard (Settings > Display, driver, waking from sleep), the image rotates under the player: `currentFlipperEdge` (`packages/core/src/layout.ts`) rotates the saved edge by the difference between the two orientations, and this current edge is the one used for framing, for the sync's "à l'envers" (upside down) warning, for rotating Cyber Pinball's windows on the playfield (`playfieldRotation`) and for the edge suggested when the wizard is run again. If no orientation was recorded at save time, the saved edge is kept as is.

A model saved before this step gets no framing key until the wizard has been run again.

### Table framing, during a game

A table's framing is judged on the running table, not on a list of values. Table details screen > "Régler l'affichage en partie" (Adjust display in game) launches the table with `-PovEdit` instead of `-Play` (VPX 10.8.1, `AppCommands.cpp`): the same game, with VPX's menu open from the start on "Point Of View". The details screen's "Ajuster la vue" (Adjust the view) screen, which picked these values outside a game and then tried them out, was removed (24 October 2026), together with its `-TableIni` trial run.

With automatic framing, VPX recomputes the cabinet view after reading the table's overrides: the `[TableOverride] ViewCab*` keys only apply with manual framing. The "Point Of View" page therefore only offers what the framing reads again (VPX 10.8.1 code: `docs/recherche/vue-par-table.md`):

| Mode (`[Player] CabinetAutofitMode`) | Settings on the page | Effect |
| --- | --- | --- |
| "Fit Table" (1) | the mode and `CabinetAutofitPos` (0 to 20 %) | position of the bottom flippers on the screen; higher up, the apron rises into the screen, at the expense of the top of the table |
| "Fit Screen" (2) | the mode only | the full length of the table, stretched or squeezed |
| manual (0) | offsets, scales, glass, rotation, then `ScreenPlayerX/Y/Z` | a hand-set view, which the doctor reports when a table forces it |

- **Save** (Start) > "Save as Table Override": in the table's `.ini`. Back on the details screen, it says "Affichage enregistré pour cette table" (Display saved for this table) if that file changed.
- **Outside a game**, these keys can no longer be changed for a table: in "Réglages de cette table" (This table's settings), they carry the "En partie" (In game) badge and only the table's own value can be removed (`isLiveVisual`, `packages/core/src/vpx-settings.ts`); the table's essentials no longer list them.
- **Doctor**: "Cadrage manuel imposé par la table" (Manual framing forced by the table) when the table's `.ini` (often shipped with it, set up for its author's screen) contains `CabinetAutofitMode = 0`; the repair removes the key, and the old file goes to the trash.

## Sound

VPX 10.8.1 has only two outputs: `[Player] SoundDeviceBG` (backglass: ROM music and voices, AltSound, PuP-Pack, table music) and `[Player] SoundDevice` (playfield: mechanical sounds, mixed according to `Sound3D`). It identifies them by the output's **Windows name** ("Haut-parleurs (USB Audio Device)", i.e. "Speakers (USB Audio Device)" on an English Windows), compared character for character; a name it cannot find silently sends it to the Windows default output. This name is localized, can be renamed, and is sometimes shared by two identical cards: as with screens, Cyber Pinball keeps its own fingerprint and rewrites the current name at every synchronization.

**Detection** (`probeAudioOutputs`, `packages/win-displays/src/audio.ts`): active outputs are read from `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}`, read-only and through the Unicode API (`RegGetValueW`), because `reg.exe` mangles accented characters. For each one: the MMDevice identifier (`{0.0.0.00000000}.{guid}`), the name VPX expects ("DeviceDesc (interface)"), bus, form factor, channels and speaker mask set in Windows, ContainerId, and default output (the active output with the highest `Level:0`, cross-checked against Chromium on the development PC). An HDMI output is tied to its screen through the ContainerId of the PnP monitor (`ObservedDisplay.containerId`); the container shared by everything built into the PC (`{00000000-0000-0000-FFFF-FFFFFFFFFFFF}`) ties nothing. `npm run probe` shows all of this.

**The setup wizard's "Son" (Sound) step**, after the screens, or on its own (system menu > "Configuration de la borne" (Cabinet configuration) > "Son de la borne" (Cabinet sound), `--assistant --son`: only `SoundDevice`, `SoundDeviceBG` and `Sound3D` are written). Virtual outputs (Steam, Oculus: bus `ROOT`) and Bluetooth outputs are left out, unless they already had a role. Each output plays, on itself, a sound generated by an oscillator (no file), n beeps for output n, in a loop: `AudioContext.setSinkId` in a wizard window, the output being found by `enumerateDevices` under its Windows name (Chromium appends "(vid:pid)" to the name of USB outputs, which is ignored for the comparison). The player answers with the buttons:

| Button | Output played | Speaker test |
| --- | --- | --- |
| Left flipper | backglass | playfield, near the player |
| Right flipper | playfield | playfield, backglass side |
| Start | both (SSF with a single card) | in the backglass |
| Exit | no role, next output | nothing heard |
| Backspace | previous output | previous pair |

The backglass screen's speaker is offered by default for the backglass, and a card set to 7.1 (failing that, the playfield screen's speaker) for the playfield; these outputs are played first, and the screen whose output is the speaker lights up. Running the wizard again starts from the saved outputs. If the playfield output reports 6 or 8 channels, each speaker pair (front, rear, side) beeps on the left, then at a higher pitch on the right (`ChannelMergerNode`, discrete channels in the order of the Windows mask, like SDL), and the player says where they hear it. The answers choose the mix (`playfieldModeFromTest`, `packages/core/src/audio.ts`): front in the backglass and another pair on the playfield gives SSF; front and another pair on the playfield gives surround, in the direction heard; otherwise stereo. Rear / side wiring that is swapped for SSF is flagged. The summary shows the chosen outputs and the `Sound3D` value that will be written.

Permissions: Chromium only gives output names, and only allows `setSinkId`, with the `media` or `speaker-selection` permission; the wizard grants these two to its windows (`setPermissionCheckHandler`) and allows playback without a user gesture (`autoplayPolicy`), since the buttons go through the main process. If the output is not found, or if Chromium opens fewer channels than reported, the screen says so and the player can still answer.

Model (`cabinet.json`, `audio` field): outputs stored by `endpointId`, with the `containerId` as a fallback (for a driver that recreates a screen's HDMI output) and the fingerprint of the screen whose speaker it is; `roles` (backglass, playfield, possibly the same output); `playfieldMode` (`stereo`, `surround`, `ssf`) and `lockbarPair` in surround. At each synchronization, outputs are found again by identifier, then by ContainerId if there is no ambiguity, never by name.

Keys written to `VPinballX.ini` (`vpxAudioSettings`), managed like the others (a value changed by hand is never silently overwritten):

| Key | Value |
| --- | --- |
| `[Player] SoundDeviceBG` | current name of the backglass output; empty if none (Windows default output) |
| `[Player] SoundDevice` | current name of the playfield output; empty if none |
| `[Player] Sound3D` | stereo: 0, or 1 on a 7.1 output (mode 0 cancels the gains there); surround: 3 (front on the lockbar side) or 2 (rear on the lockbar side); SSF: 5 |

A model without a "Son" (Sound) step (saved before that step existed, or with no output to offer) writes none of these keys, and the settings screen leaves them editable. Points to check, reported by the synchronization and the wizard: output not found (the key stays as it is, VPX will play on the default output), two active outputs with the same name (VPX takes the last one), a `Sound3D` too ambitious for the channels set in Windows (surround with fewer than 4 channels, SSF with fewer than 8: VPX falls back to stereo; set the output to 5.1 or 7.1 in the Sound control panel). Cyber Pinball never changes a Windows audio setting or the default output by itself. Volumes (`MusicVolume`, `SoundVolume`) remain player settings.

To be confirmed on a real cabinet (`docs/manual-tests.md`, scenarios 29 to 38): how `Sound3D` modes 2, 3 and 5 actually sound, the expected direction of the rear and side pairs in SSF (Pinscape guide: rear on the player's side), the channels Chromium actually opens on a 7.1 card, the ContainerId of an HDMI output after a port change, and the disappearance of a screen's HDMI output when the screen is in standby.

## VPX plugins: backglass, PuP and DMD

VPX 10.8.1 draws the backglass, PuP packs and the DMD itself, through its plugins ("plugins" mode): `ScreenRes.txt`, `B2STableSettings.xml` and `DmdDevice.ini` are read by nobody in that mode (`docs/recherche/generateurs-classiques.md`). Everything therefore goes through `VPinballX.ini`. Classic mode (VPX 10.8.0, COM components) and DOF will come later.

**Who draws on each window.** Several plugins can draw on the Backglass, ScoreView (DMD role) and Topper windows. For each frame, VPX tries their renderers in descending order of `Priority.<moteur>` and keeps the first one that draws (`player.cpp`, `OnAuxRendererChanged`). Without these keys, they are all 0 and the order depends on the order in which plugins load. A PuP pack only draws when it has a video to show: placed in front, it leaves the .directb2s backglass visible the rest of the time (`docs/recherche/pup-packs.md`, § 4.3).

Keys written (`vpxSettingsFor` and `vpxPluginDefaults` in `packages/core/src/vpx.ts`, `packages/core/src/dmd.ts`):

| Key | Value | Managed |
| --- | --- | --- |
| `[Backglass] Priority.PUP`, `Priority.B2S` | 100, 50; if the backglass role is assigned | yes |
| `[ScoreView] Priority.PUP`, `Priority.B2S`, `Priority.ScoreView` | 100, 50, 10; if the DMD role is assigned | yes |
| `[Topper] Priority.PUP` | 100; if the topper role is assigned (B2S does not draw on the topper) | yes |
| `[Plugin.B2SLegacy] Enable` | 0 as long as B2S is enabled: both answer tables that request `B2S.Server`, and the last one loaded wins | yes |
| `[Plugin.B2S] ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos` | 1 and 1 if the DMD role exists. The FullDMD of a .directb2s goes in front of ScoreView: without the overlay, only its frame would be visible. The DMD's position is searched for in the image | no, offered if the key is empty |
| `[Plugin.DMDUtil] Enable`, and `ZeDMD`, `PIN2DMD` or `Pixelcade` | 1 for the recognized real DMD; nothing without a real DMD | yes |
| `[Plugin.PinMAME] PinMAMEPath` | `<racine>\pinmame`, if it contains `roms` | no, offered if the key is empty |
| `[Plugin.Serum] SerumPath`, `[Plugin.VNI] VniPath` | `<racine>\pinmame\altcolor`, if it contains a `<rom>\<rom>.cRZ` or `.cROMc` (Serum), `.pal` or `.vni` (VNI) | no, offered if the key is empty |

Each table first looks for its ROMs and colorizations in its own folder (`pinmame\roms`, `serum`, `vni`, `pinmame\altcolor`); the shared folders only come after. The synchronization reports "B2S et B2SLegacy activés ensemble" (B2S and B2SLegacy enabled together) when both are enabled (B2SLegacy turned back on by hand, then kept).

**Real DMD.** `probeUsbDevices` (`packages/win-displays/src/usb.ts`) lists the USB devices present through the Windows configuration manager (`CM_Get_Device_ID_ListW`) and reads their name and serial port from the registry, read-only. No port is opened, whereas libdmdutil's detectors send a connection request to every port. Recognized identifiers (`HARDWARE_DMD_IDS`):

| DMD | VID:PID | Source |
| --- | --- | --- |
| ZeDMD | `303A:1001` (ESP32-S3), `1A86:55D3` (CH343); `1A86:7523` (CH340) and `10C4:EA60` (CP210x), common converters flagged "à confirmer" (to be confirmed) | libzedmd's automatic detection filter (`ZeDMDComm.cpp`) |
| PIN2DMD | `0314:E457` | libdmdutil (`PIN2DMD.cpp`) |
| Pixelcade | `1B4F:0008` (IOIO-OTG board) | IOIO firmware; libdmdutil recognizes it by its "IOIO" reply |

DMDUtil finds the port itself: Cyber Pinball writes neither `ZeDMDDevice` nor `PixelcadeDevice`. When the DMD is unplugged, its keys are kept as they are. `npm run probe` shows the recognized DMDs (`npm run probe -- --usb`: all USB devices).

### Several roles on one screen: zones

A two-screen cabinet often puts the backglass and the DMD on the backglass monitor. A cabinet without a DMD screen embeds the DMD in the playfield image. A desktop PC puts everything on one screen: the table on one side, the backglass on the other. In the cabinet model, several roles can therefore point to the same screen, each in its own zone (`zones`), the playfield included. A zone is a rectangle expressed in fractions of the screen image (0 to 1): it survives a resolution change. It can keep an aspect ratio (`aspect`, width over height: 16/9, 4…): it is then resized without changing its proportions. Without a zone, the role fills the whole screen, as before. Code: [packages/core/src/zones.ts](../packages/core/src/zones.ts).

VPX 10.8.1 can do both, without any third-party tool (`src/renderer/Window.cpp`, `Renderer.cpp`):

| The role is… | Keys written | Effect in VPX |
| --- | --- | --- |
| alone on its screen | `<Préfixe>Output = 1`, `FullScreen = 1`, `WndX = WndY = 0`, `Width` and `Height` of the screen | borderless full-screen window |
| in a zone of a screen (playfield included) | `Output = 1` (not for the playfield), `Display`, `FullScreen = 0` ("Windowed"), `WndX`, `WndY`, `Width`, `Height` of the zone, in pixels relative to the screen | borderless window placed over the zone (all VPX windows are borderless) |
| in the playfield zone, on its screen | `Output = 2` ("Embedded in playfield"), `WndX`, `WndY`, `Width`, `Height` of the zone, relative to the playfield window | drawn inside the playfield image, on a black background, after the table: no window to keep in the foreground |

A role on the playfield screen but outside its zone (desktop PC) is a separate window. Table framing follows the playfield window, not the screen: cabinet view when the window is taller than it is wide, `ScreenWidth` and `ScreenHeight` set to the zone's actual size. "Garder" (Keep) on a size changed in VPX brings it back to the whole screen.

**Stacking order.** VPX has no setting for it: embedded displays are drawn backglass, then DMD, then topper (`Renderer.cpp`), and it is Windows that stacks two overlapping windows. Nothing prevents two zones from overlapping (a DMD placed over the bottom of the backglass, for example): this is reported for information, along with what will be in front. Only two roles assigned to the same screen with no zone for either of them give a warning: that is an oversight.

**No per-zone rotation.** VPX 10.8.1 only has rotation settings for the table view (`ViewDTRotation`, `ViewCabRotation`…) and for VR: its Backglass, ScoreView and Topper windows, and their embedded displays, are always drawn in the orientation of the Windows image.

**DMD window: FullDMD and DMD layered.** The DMD role's zone is the ScoreView window's zone. It has two layers: at the back, the FullDMD (the FullDMD image of the .directb2s, or screen 5 of a PuP-Pack, which the PUP plugin takes as the ScoreView root, falling back to screen 1: `PUPManager.cpp`); on top, the ROM's DMD, which the plugins place in the window themselves (B2S: `ScoreViewDMDOverlay` and `ScoreViewDMDAutoPos`, which looks for the DMD's place in the image; PuP: screen 1 placed over screen 5 by `CustomPos`). A zone therefore does not need to target the 128×32 DMD: it gives the FullDMD's place. `splitBackglassDmd` splits a screen between the backglass at the top and a centered DMD strip at the bottom, at the requested proportions (4:1 for a DMD alone, 16:9 for a FullDMD), taking at most one third of the height.

- **Synchronization**: reports two roles overlapping on one screen (the case of two roles assigned to the same screen without a zone), an invalid zone in `cabinet.json` (the whole screen is then used), a role embedded over the whole playfield, and an embedded display that the player would see sideways or upside down: VPX does not rotate embedded displays.
- **Screen layout** ([app/src/arrange.ts](../app/src/arrange.ts)): a wizard step after the roles, opened on "Terminer" (Finish) (a Start keeps everything as it is), or on its own from the system menu ("Configuration de la borne" (Cabinet configuration) > "Disposition des écrans" (Screen layout), `--assistant --disposition`); at the screens step, "Placer librement…" (Place freely…) opens it on a role and returns to the wizard afterwards. The panel appears on the playfield screen; each screen shows its zones, the selected one with its corners. Rows: the zone (any role), its screen ("Aucun écran" (No screen) for a secondary role), the kept aspect ratio ("Libre" (Free), 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), full screen (with a locked ratio: the largest zone at that ratio, centered), horizontal and vertical position, width, height, exact size, exact position, placement above, below, left or right of another role on the same screen (shrunk, ratio kept, if there is not enough room), alignment to an edge or to the center, snapping, and "Annuler les changements" (Undo changes). Position and size are free to the pixel across the whole screen; a zone never leaves the screen and stays at least 16 px on each side. Opened from the menu, the step starts on the "Zone" row; in the wizard, on "Terminer". The panel docks at the top or the bottom, opposite the selected zone when that zone is on its screen.
  - **With the buttons**: flippers to choose a row, Start to open it, flippers to adjust to the pixel (immediate preview; held down, they speed up to 64 px per step), Start to confirm, Exit to cancel.
  - **With the keyboard**: arrows to move the zone (row closed) or to adjust in both directions; digits then Enter for the exact size (width only when a ratio is locked) and for the exact position (X, then Y).
  - **With the mouse**: click a row, or a zone to select it; drag a zone to move it, even onto another screen (it moves there at once, at the same size if it fits, and becomes embedded if it lands in the playfield zone); drag a corner to resize it, the opposite corner staying in place. Each zone shows its corners, and each screen reminds you of the gesture. Dragged edges snap within 12 px to the screen's edges and middle and to the edges of the other zones (`snapRect`); the "Aimantation" (Snapping) row turns it off, or hold Alt during the gesture. The playfield cannot be moved to another screen with the mouse: the roles step decides that.
  - **Layout on its own**: saves the model and only rewrites the windows and the framing in `VPinballX.ini`; a role whose screen is merely unplugged keeps its screen.
- **Adjusting in VPX**: a windowed or embedded display moved or resized in the VPX interface (the window's display page, which frames the embedded display) is reported at startup like any key changed by hand. "Garder" (Keep) takes it back into the role's zone, and the key stays managed. A full-screen window that was retouched is left to the user.
- **PuP-Packs**: choosing the pack option compares the proportions of the zone, not those of the whole screen.
- **Screen wizard**: at the DMD step, after the free screens, the flippers offer the bottom of the backglass screen (a 4:1 strip for a DMD alone, or 16:9 for a FullDMD with the DMD on top; the backglass keeps the top) and embedding in the playfield (4:1, at the edge opposite the flippers, over 40% of the width). A two-screen cabinet therefore always has a place for the DMD. The offered zone is drawn on the screen, dotted, at the exact place where VPX will show it. The saved layout is offered again by default, unchanged if it was retouched in VPX since then ("comme enregistré" (as saved)). Fine adjustment is done in VPX (see above).
- **Menu**: one window per physical screen, not per role. Roles that share a screen are drawn in the same window, each in its zone; an embedded DMD is drawn on the playfield without rotating, as in VPX. Two windows on the same screen would fight over the full-screen state that covers the taskbar (`coverDisplay`). The playfield page fits within its zone, sizes included (`cqmin`, relative to the zone).
- **Demo**: `.\docs\demo-zones.ps1`, off screen on `docs\ecrans\pc-dev.json` (`-Ecrans`). Layouts: `fronton` (DMD below the backglass), `incruste` (DMD in the playfield), `editeur` (layout on its own: DMD selected, 4:1 ratio, placed below the backglass, corner dragged with the mouse, dragged onto the playfield screen where it becomes embedded, 960 px wide and position 100, 50 with the keyboard, snapping off, saved), `bureau` (one screen: playfield in 9:16 on the left, backglass on the right, embedded DMD); plus `assistant`, for the development PC's screens. The keys written and the screenshots (`tmp\captures\zones`) are displayed; neither the real model nor the real `VPinballX.ini` is touched. The wizard's autopilot can drag a zone: `drag:<écran>:<rôle>:<move|nw|ne|sw|se>:<dx>:<dy>`.

### Adjusting the display during a game

Every visual setting whose result has to be seen is made **during a game**, on the real picture, with VPX 10.8.1's own menu: the table's framing (above), the position and size of the backglass, DMD and topper (`DisplaySettingsPage`, read in the code at commit af26b2d93), and the look of the displays. A PuP-Pack, for example, often draws a frame on the backglass (bottom centre) where the DMD must land, and each pack has its own.

1. **Enter VPX's menu**: from the details screen, "Régler l'affichage en partie" (Adjust display in game) (the table starts with the menu open on framing, and the game does not count in the statistics); or, during any game, both MagnaSave buttons pressed together (Credit and Start on a cabinet without MagnaSave, F12 on a keyboard). Cyber Pinball writes this combination to `[Input] Mapping.InGameUI`, next to F12 (`inGameMenuButtons`, `packages/core/src/buttons.ts`), **even without recorded buttons**: it is then the only `[Input]` key it writes, with the encoders' default keys (`inGameMenuSetting`). Exit is never part of it: on its own, it quits the game.
2. **Adjust**: "Point Of View" for framing; Exit goes back to the menu's home page, then "Display Settings" > "Backglass Display", "ScoreView Display" (the DMD) or "Topper Display": position and size to the pixel, applied live; the window can also be dragged with the mouse.
3. **Save** (Start): "Save as Table Override" writes to the table's `.ini`, for that table only; "Save Globally" to `VPinballX.ini`, for every table.

Buttons in VPX's menu (`InputManager.cpp`), listed on the adjustment's loading screen ("Réglage de l'affichage" (Display adjustment), `displayKeys`):

| Button | In VPX's menu |
| --- | --- |
| Left, right MagnaSave | change line |
| Flippers | adjust the value |
| Start | save: for this table or for all |
| Credit | cancel the changes |
| Plunger | default value |
| Exit | previous page, then close the menu; with the menu closed, quit the game |

| The role is… | Adjustable live | Note |
| --- | --- | --- |
| on a zone of a screen ("Windowed" window) | position and size | the case of the DMD placed on the backglass |
| alone on its screen (full screen) | no | switching to windowed in this menu writes `FullScreen` straight to the general settings, applied at the next launch |
| embedded in the playfield | position and size | outlined in green while the page is open |

- **After the game**: a position saved for the table gives the doctor the finding "Écrans placés pour cette table" (Screens placed for this table) (information, with sizes and positions), and its fix "Revenir à la disposition générale" (Back to the general layout) removes those keys only (`tableWindowsFinding`, `packages/core/src/doctor.ts`). A position saved for every table is a managed key changed by hand: the menu asks at startup whether to keep it (see "Several roles on one screen: zones").
- **Outside a game**: in "Réglages de cette table" (This table's settings), visual settings (framing and camera, windows, `[DMD]` and `[Alpha]` display profiles, the DMD's place in the B2S picture, PuP screen margins) carry the "En partie" (In game) badge and can no longer be changed; only the table's own value can be removed. Cabinet measurements (screen width, lockbar) remain adjustable.
- **Who draws in the DMD window**: the PUP plugin never draws the ROM's DMD. If it takes the ScoreView window (a pack with a screen 5, or a screen 1 not placed on the backglass), the ROM's DMD does not show there; `[ScoreView] Priority.PUP` must then be lower than `Priority.ScoreView` for that table. Not handled by Cyber Pinball yet.
- **Limits**: without MagnaSave, you cannot change line in VPX's menu (`UIUp`, `UIDown`); the stacking order of two overlapping VPX windows (DMD on the backglass) is left to Windows. To check on the cabinet: manual tests 86 to 89, 225 and 226.

## Game media

Each game can have its own presentation media: logo, playfield video, backglass, display, topper, loading video, music, launch sound, flyer and rules. The menu shows each one on the intended screen at the right moment. When a media item is missing, the menu shows a fallback drawn by Cyber Pinball in its place: never an empty screen, never the Windows desktop. Design: `docs/recherche/medias.md`, § 5.

A game's media go in its table's folder, in a `medias\` subfolder, and are named after the folder, `(Type) <nom du dossier>.ext`, as VPX 10.8.1 suggests: `medias\(Backglass) Terminator 2 (Williams 1991).mp4`. The `.vpx` name works too, for media specific to one version. The flyer and the rules can have several pages: `(GameHelp) <nom>.png`, then `(GameHelp) <nom> 2.png`, `… 3.png`. No per-screen setting: each media item's screen, proportions and rotation come from the cabinet model.

| Type (file) | In the menu | What it is for | Where and when it is shown | Formats | Without a file |
| --- | --- | --- | --- | --- | --- |
| `(Wheel)` | "Logo" | Identifies the table in the menu list, on a transparent background. | Playfield: table list; attract mode | png, apng, webp, gif | the title as stylized text |
| `(Playfield)` | "Plateau" (Playfield) | The table in play, in the background behind the list. | Playfield, dimmed under the list; attract mode | mp4, webm, m4v, or an image | discreet teal smoked glass, no fake table visual |
| `(Backglass)` | "Fronton" (Backglass) | The game's backglass image or animation. | Backglass: selected table, loading, attract mode; during play if VPX leaves the screen free | mp4, webm, m4v, or an image | the lit image of the `.directb2s`, otherwise a card: title, manufacturer, year |
| `(DMD)` | "Afficheur" (Display) | Animation for the 4:1 display. | Narrow display (4:1), at the same moments as the backglass | same as the backglass | the "Afficheur large" media scaled down, otherwise the title in dots on a 128 × 32 grid |
| `(FullDMD)` | "Afficheur large" (Wide display) | 16:9 animation for a wide display. | Wide display (16:9), at the same moments | same as the backglass | the "Afficheur" media centered, otherwise the title in dots |
| `(Topper)` | "Topper" | The animated banner above the backglass. | Topper, at the same moments | same as the backglass | animated logo and Cyber Pinball brand, manufacturer and year |
| `(Loading)` | "Chargement" (Loading) | Video played while VPX loads the table. | Playfield, from the Start press until the game appears, under the controls banner | mp4, webm, m4v | loading screen: title, manufacturer, year, game controls |
| `(Audio)` | "Musique du jeu" (Game music) | The music of the selected table. | Backglass speakers, as long as the table is selected ("Musique des jeux" (Game music), off by default); in attract mode if attract-mode sound is set to reduced | mp3, ogg, m4a, flac, wav | the cabinet music, otherwise silence |
| `(AudioLaunch)` | "Son de lancement" (Launch sound) | A short sound at launch. | Backglass speakers, once, on Start | same as the music | nothing (or the loading video's sound) |
| `(GameInfo)` | "Prospectus" (Flyer) | One or more pages presenting the game. | Playfield, on request: details screen > "Prospectus", page by page | png, apng, webp, jpg, jpeg, gif, mp4 | a card generated from the `.info`: title, manufacturer, year, authors |
| `(GameHelp)` | "Règles" (Rules) | One or more rule cards. | Playfield, on request: details screen > "Règles", page by page | same as the flyer | the game controls |

`(Other)`, `(RealDMD)` and `(RealColorDMD)` (Popper, PinballX) have no screen in Cyber Pinball: they are read, kept and ignored. Popper's old formats (`flv`, `f4v`, `avi`, `mov`, `wmv`, `mpg`, `mpeg`) cannot be played: the media doctor reports them, and the import leaves them aside.

For each screen, the menu takes the first media found: `(Type) <nom du .vpx>` (the `.vpx` name), `(Type) <nom du dossier>` (the folder name), VPinFE's fixed names (`bg.png`, `wheel.png`, `table.mp4`…), the `.directb2s` image (backglass only), the **cabinet default** `<racine>\media\(Type).ext`, and finally the built-in fallback.

### Adding media

- **Details screen > "Médias du jeu" (Game media)** (the simplest way, with the buttons or the mouse): each media item with its role, the screen and the moment it appears, a preview, and what the menu shows today. You take a file copied into `<racine>\import` (from a USB stick), pick it on this PC or drag it onto the window; you replace, remove, set the playfield half-turn and the game's volume. Nothing is written before "Enregistrer" (Save), which shows the plan first. See the Manager: "Médias du jeu" section.
- **With the table**: an archive containing media laid out the PinUP Popper way (`POPMedia\…\Wheel\<jeu>.png`), the PinballX way or the VPinFE way is recognized when the table is added ("Ajouter une table" (Add a table)); the media are renamed `(Type) <dossier>` in `medias\`. A media pack on its own, without a `.vpx`, completes an installed table. See "Importing media".
- **From a PinUP Popper or PinballX installation**: system menu > "Reprendre les médias de PinUP Popper / PinballX" (Take over media from PinUP Popper / PinballX). Everything is copied; the original installation is not modified.
- **By hand**: copy the file into `medias\` under the name `(Type) <nom du dossier>.ext`. The menu picks it up within 10 seconds. The doctor (details screen > "Diagnostiquer et réparer" (Diagnose and repair)) reports a name that does not match the game, a file stored outside `medias\`, an unreadable format, proportions that do not fit the screen, and offers the rename.
- **Cabinet defaults**: a file `<racine>\media\(Type).ext`, with no game name, is used for every game that lacks that media type: a topper in your game room's colors, ambient music, a background video. It takes precedence over the built-in fallback.

- **Online, on demand**: "Chercher les médias" (Search for media) takes everything VPinMediaDB has for the game, with a plan to approve ("Media from VPinMediaDB"). For one specific media item, "Voir les propositions" (See suggestions) shows every version found, online and on the cabinet, and you choose from the previews ("Suggestions for each media item and deep search").

### Flyers and rules

Details screen > "Prospectus" (Flyer) or "Règles" (Rules) (the number of pages is written under the action): the page fills the playfield screen, rotated for the player, whole and undistorted. The flipper buttons go to the previous or next page, Start to the next one and then back to the details screen after the last page, Exit back to the details screen; with the mouse, the buttons under the page do the same. A video page (`mp4`) loops, muted. Without a file, the flyer is a sheet generated from the `.info` (a backglass-style card with the title, then manufacturer, year, authors, version, description), and the rules show the game's controls, each with a sentence saying how to add the real media file. Code: `sheetPages` ([packages/core/src/mediaview.ts](../packages/core/src/mediaview.ts)), the `pages` screen in `app/src/library.ts`, rendering by `renderPages` in `app/renderer/library.js`.


### In the menu windows

Each menu window shows the media of the selected table. The lookup follows the order given in § 5.3 of the research notes (`resolveMedia`, [packages/core/src/medias.ts](../packages/core/src/medias.ts)): `.vpx` name, folder name, VPinFE names, `.directb2s` image (backglass), cabinet defaults, then the built-in fallback.

| Screen | Media | Display |
| --- | --- | --- |
| playfield, behind the menu | `(Playfield)` | `cover`, darkened under the list; rotated so the media's flippers land on the cabinet's flipper edge (a portrait file has its flippers at the bottom, a landscape file on the right, as in Popper and VPinMediaDB) |
| menu list | `(Wheel)` | logo above the title of the selected table and in a fixed-size box in front of each title in the list (the title's initial when there is no logo) |
| backglass | `(Backglass)`, otherwise the lit image of the `.directb2s` | `contain` on black |
| DMD | `(DMD)` or `(FullDMD)` depending on the proportions of the DMD zone (4:1 or 16:9), otherwise the other one | `contain` on black |
| topper | `(Topper)` | `contain` on black |

- **Zones**: each role of a shared screen (backglass and DMD strip, DMD embedded in the playfield) has its own media in its zone.
- **Playback** (`app/renderer/media.js`): videos loop, muted, except the playfield background video when the "Son des vidéos du menu" (Menu video sound) setting asks for it (see "Menu sound"); 280 ms crossfade on table change; the media of the two neighboring tables on each side are preloaded, and a video you just left is kept ready for a while (eight items at most, four of them videos); the playfield background is paused under an opaque overlay (help, details screen, message); all videos are paused when the window is hidden. Fast navigation stacks nothing up: a layer still waiting for its first frame is dropped.
- **Fallback** when there is no media or on a playback error: the components of `app/renderer/fallback.js` (task T3) as soon as `frontend.html` has loaded them (`window.CyberFallback`), otherwise a minimal fallback: title, manufacturer and year on black, shrunk until they fit their zone, and nothing on the playfield background. The drawn topper shows the brand and the **game's title** (two lines at most), not the manufacturer and year, which are already on the backglass and in the menu.
- **Background during play**, the "Médias pendant la partie" (Media during play) setting on the "Médias, son et attente" (Media, sound and attract mode) screen (system menu; Start moves to the next choice, saved in `<données>\medias.json`): **frozen** by default (first frame, drawn once on a canvas, with no video decoder open during play), **animated** (the playfield and the screens VPX occupies stay frozen), or **off** (black, with a discreet title). See "Loading and play".
- **`cyber-media://` protocol** ([app/src/media-protocol.ts](../app/src/media-protocol.ts), rules in [packages/core/src/mediaview.ts](../packages/core/src/mediaview.ts)): the only path from the windows to the files (the CSP of `frontend.html` allows nothing else for images and videos). It only serves a media file (an extension from the catalog) placed directly in the `medias\` folder of a known table, in `<racine>\media\` or in the `.directb2s` image cache (`<données>\cache\medias\`), plus, one at a time, the files that "Médias du jeu" (Game media) previews before storing them (import folder, file picked on this PC, `allowPreview`); built-in fallbacks are drawn by the window, with no file. Subfolders, escaping with `..`, alternate data streams, symbolic links and any other extension are refused (403). It answers range requests (206), which video playback needs. The address changes with the file's date and size: a media file replaced under the same name is not served from the cache.
- **`.directb2s` image**: extracted in the background, one table at a time, the first time the table comes up; the fallback shows in the meantime, then the image fades in to replace it.
- **Playback errors** (undecodable video, damaged image): reported by the window to the main process with the error code, written to the console and to the single log `<données>\logs\medias-erreurs.json` (format described in "The media doctor"), one entry per file; an entry disappears when the file changes. The doctor reports them.
- **Tests**: [mediaview.test.ts](../packages/core/src/test/mediaview.test.ts) (addresses, allowed folders, rotation for each flipper edge, DMD or FullDMD, `.directb2s`, setting, error log, CSP and rendering hookups).
- **Off-screen demo**: `npm run build` then `npx electron docs/demo-medias-menu.cjs` builds a sandbox in `tmp\medias-menu\racine` (eight tables, generated images and WebM videos, a `.directb2s`, a damaged video, a default topper), opens the menu windows without showing them (off-screen rendering) on three simulated cabinets (flippers on the left with a shared backglass and a topper, landscape with an embedded DMD, flippers on the right with a 4:1 DMD), and captures every screen: media present, missing, portrait, landscape, video, image, crossfade in progress, rapid burst, help, play frozen, animated, off. `tmp\medias-menu\rapport.json` lists what each layer displays, texts that overlap or overflow (none expected), the video pause while the window is hidden, and the playback errors reported.

### Menu sound

The menu sound comes from a single window, the playfield one (`app/renderer/menu-audio.js`). The main process decides what to play at each moment (`menuSound`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts)); everything is set in **System menu > "Médias, son et attente" (Media, sound and attract mode)** (`app/src/menu-settings.ts`), saved in `<données>\medias.json` and applied immediately.

| Moment | You hear | Setting (default) |
| --- | --- | --- |
| Navigation, details screen, messages | the selected game's music, `(Audio)` (otherwise the cabinet's, `<racine>\media\(Audio).*`), looping | "Musique des jeux" (Game music): **off** by default, for a silent cabinet in a living room; "Volume de la musique" (Music volume) (60%) |
| Navigation, game with no music or music off | the sound of the playfield background video | "Son des vidéos du menu" (Menu video sound) (0%: muted) |
| Loading | the launch sound, `(AudioLaunch)`, once; without it, the sound of the loading video | "Volume du lancement" (Launch volume) (80%) |
| Play | nothing: everything fades out as soon as VPX's game window appears | — |
| Attract mode | as during navigation, for the table being shown | "Son en attente" (Attract mode sound): **off** by default, or reduced (30% of the volume) |

- **Per-game volume**: each volume is multiplied by the game's relative volume (details screen > "Médias du jeu" (Game media) > "Volume de ce jeu" (This game's volume), `CyberPinball.medias.volume` in the `.info`), without exceeding the maximum. A game set to 50% plays its music at 30% when the setting is at 60%.
- **Transitions**: on table change, the old music fades out (700 ms) and the new one only starts if the table stays selected for 350 ms: scrolling through the list plays nothing. A video's sound follows its crossfade. At launch, the music stops and the launch sound starts.
- **Output**: the backglass output in the cabinet model (the setup wizard's "Son" (Sound) step; it is also the output for VPX music, `SoundDeviceBG`), otherwise the playfield one, otherwise the Windows default output. It is found among Chromium's outputs by its Windows name (the "(vid:pid)" suffix of USB outputs is ignored), then music, launch sound and videos are sent to it (`setSinkId`). Output not found: the default output. For this, the menu windows have the `media` and `speaker-selection` permissions and playback without a user gesture (`autoplayPolicy`), like the wizard.
- **Windows desktop** (windows minimized): the music goes silent, then resumes on return.
- **Off screen**, every application window is muted (`createWindow`, `app/src/offscreen.ts`): an unattended test makes no noise. After each step, the autopilot records what would have played (`CyberMenuAudio.status()`: file, volume, playback, output, video sound) and what each screen shows (`cyberEtat()`: phase, position, table shown in attract mode, and for each media layer the displayed item, video playing or paused, image, frozen image or fallback) in `son.txt`, next to the screenshots.
- **Tests**: [menumoments.test.ts](../packages/core/src/test/menumoments.test.ts) (settings and hand-written values, volumes, sound for each moment, menu output, sound media resolved on disk, rendering hookups, muted windows off screen). Demo: `.\docs\demo-moments.ps1` (see "Unattended end-to-end tests").

### Loading and play

What each screen shows from launch to the end of the game (`momentScreen`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts); rendering in `app/renderer/frontend.js`):

| Moment | Playfield | Other screens |
| --- | --- | --- |
| Loading (from Start until VPX's game window appears) | the game's `(Loading)` video, full screen and rotated according to the flipper edge, under a banner with the title and the game's controls; without it, the backup loading screen (`fallback.js`: title, manufacturer, year, progress bar) with the controls below | the game's media, animated, until VPX's windows cover them |
| Play | first frame of the playfield background, under VPX | a screen VPX **does not occupy**: according to "Médias pendant la partie" (Media during play) (frozen by default, animated, off); a screen it **does occupy** (`.directb2s` backglass, PinMAME DMD, PuP): frozen, since it cannot be seen and must cost nothing |

- **Occupied screens**: as soon as the game window appears, then every 2 s, the Windows window stack is read again (`occupiedRoles`): a role is occupied when a window from another process covers at least half of its zone (the whole screen, or its share of a shared screen: DMD strip under the backglass, embedded DMD) above the Cyber Pinball window. The console says so: "Partie : écrans occupés par VPX : backglass, dmd." (Play: screens occupied by VPX: backglass, dmd.)
- **Focus**: none of this shows a window or brings one to the foreground; only the state sent to the menu windows changes, and they stay behind VPX's windows (screen guard).
- **Simulated game** (off-screen tests only): `CYBERPINBALL_PARTIE_SIMULEE=<rôles occupés>` ("backglass,dmd", or empty) replaces VPX with a fake game (`simulateVpx`, `app/src/launcher.ts`): loading, a 10 s game with the autopilot, return to the menu, without launching anything or grabbing a global shortcut. On screen, the variable is ignored.

### Attract mode

After a while with no button pressed on the table menu, the cabinet shows itself off (`AttractMode`, `pickAttractTable`, [packages/core/src/menumoments.ts](../packages/core/src/menumoments.ts)):

- **Delay**: "Mode attente" (Attract mode) (5 min by default; 1, 2, 3, 5, 10, 15 or 30 min; **never**). The countdown restarts with every button press and every click, and when you come back to the table menu: it never runs on the details screen, the help, a message, a settings screen or during a game.
- **Tables**: a table drawn at random every N seconds ("Table suivante en attente" (Next table in attract mode), 20 s by default), never the table selected in the menu nor one of the last ones shown (about a third of the tables), so that every table eventually comes up. Each screen shows that table's media; the playfield shows its background (less darkened than in the menu), its logo or, failing that, its title as a backup logo (`fallback.js`), manufacturer and year, and "Appuyez sur un bouton pour revenir au menu" (Press any button to return to the menu).
- **Exit**: the first button, whichever it is, or a click, returns to the menu as it was, with no other effect: the selection does not move, Start does not open the details screen, Exit does not open the system menu.
- **Sound**: "Son en attente" (Attract mode sound) is off by default; when set to reduced, the music of the table shown (or its video's sound) plays at 30% of its volume.

### Manager: "Médias du jeu"

Details screen > "Médias du jeu" (Game media): what the menu shows for this game, screen by screen, without handling any file (design: `docs/recherche/medias.md`, § 5). One card per media item: its label ("Logo", "Plateau" (Playfield), "Fronton" (Backglass), "Afficheur" (Display), "Afficheur large" (Wide display), "Topper", "Chargement" (Loading), "Musique du jeu" (Game music), "Son de lancement" (Launch sound), "Prospectus" (Flyer), "Règles" (Rules)) and its file name in parentheses, **where** it appears (screen and moment, in plain words, instead of Popper's screen names), its **role** in one sentence, a preview (the image, a frame from the video, or the description of the fallback), and the status: "Présent" (Present), or the fallback in use and which one ("Repli : image du .directb2s" (Fallback: .directb2s image), "Repli : défaut de la borne" (Fallback: cabinet default), "Repli : Afficheur large" (Fallback: Wide display), "Repli intégré" (Built-in fallback)), with dimensions and file size. A media item the cabinet does not show says so ("Cette borne n'a pas d'écran topper" (This cabinet has no topper screen), or a narrow display that shows the "Afficheur" rather than the "Afficheur large"). The files in `medias\` that the game does not use are listed with the reason (another game's name, unreadable format, type with no screen).

- **Actions**, with the buttons or the mouse: take a file from `<racine>\import` (subfolders included, only the formats the menu reads for this media type), pick it on this PC, or drag it onto the window (on the overview, the type is read from the name: `(Wheel) …`, VPinFE's `bg.png`, Popper's `Wheel` folder or PinballX's `Backglass Images`, otherwise it is the selected media item); replace; move to the trash; half-turn of the playfield and of the loading video (the preview is rotated the way the menu will show it, as seen by the player); relative game volume (0 to 200%); for the flyer and the rules, the list of pages, and for each page move up, move down, replace or remove.
- **Nothing is written before "Enregistrer" (Save)**, which first shows the plan, one line per media item. Files are stored as `(Type) <nom du dossier>[ N].ext` (a file from the import folder leaves it, a file picked on this PC or dragged in is copied); any other file of that type for this game (old file, another format that would take precedence, VPinFE name, unreadable format) goes to the trash; pages are renumbered in two passes, so that none overwrites another. Half-turn and volume go into the `.info` under `CyberPinball.medias` (`halfTurn`, `volume`), with its other fields kept. Leaving with unsaved changes asks "Quitter sans enregistrer ?" (Leave without saving?).
- Code: `packages/core/src/mediaedit.ts` (where each media item appears, draft, plan, renaming, `.info`), tests in `packages/core/src/test/mediaedit.test.ts`; screens in `app/src/library-medias.ts`, cards in `app/renderer/library.js` and `library.css`.

### Importing media

Other frontends organize media differently; the import recognizes them and renames them. Code: [packages/core/src/mediaimport.ts](../packages/core/src/mediaimport.ts), hooked into table adding ([tableimport.ts](../packages/core/src/tableimport.ts)) and into the takeover screen ([app/src/media-import.ts](../app/src/media-import.ts)); tests in [mediaimport.test.ts](../packages/core/src/test/mediaimport.test.ts).

**What is recognized**, in an archive, a selection or the import folder:

| Layout | Example | Type |
| --- | --- | --- |
| PinUP Popper | `POPMedia\Visual Pinball X\Wheel\<jeu>.png`, folders `PlayField`, `Backglass`, `DMD`, `Menu` (FullDMD), `Topper`, `Loading`, `Audio`, `AudioLaunch`, `GameInfo`, `GameHelp`, `Other2` | folder name; pages `<jeu>01.png`, `<jeu>02.mp4` in order |
| PinballX | `Media\Visual Pinball\Wheel Images\<jeu>.png`, `Table Videos`, `Table Images`, `Backglass Videos`, `DMD Videos`, `FullDMD Videos`, `Topper Videos`, `Launch Audio`, `Table Audio`, `Loading Videos`, `Real DMD…`; `Media\Flyer Images\Front`, `Back`, `Inside1`… (flyer pages, in that order) | folder name |
| VPinFE | `medias\bg.png`, `wheel.png`, `table.mp4`, `dmd.png` (FullDMD)… | fixed file name |
| Already named | `(Backglass) <n'importe quel nom>.mp4`, anywhere | the name |

A Popper folder with an ambiguous name (`DMD`, `Audio`, `Backglass`, `Topper`, `Loading`, `Menu`) is only recognized under `POPMedia` or next to an unambiguous folder (`Wheel`, `PlayField`, `GameHelp`…): alone in an archive, a `DMD` folder is more often a table's FlexDMD content. A DMD folder loaded by the script always stays a DMD folder.

**Assigning to a game**: in a single-table package, the media belong to that table. Otherwise, the file name decides (the game name for Popper and PinballX, `(Type) <nom>`, the table folder for VPinFE): name of a `.vpx` or of the folder, ROM, title (manufacturer and year break ties), game recognized by the VPS database (compared with the `VPSId` in the `.info` of installed tables). A media file named after a game that is neither in the import nor among the installed tables stays where it is ("Non importé" (Not imported)).

**Storage**: `(Type) <nom du dossier>.ext`, for all versions of the game. A single file per type, in the best format (video before image for screens, Visual Pinball X before Visual Pinball 9); the others are flagged "Doublon" (Duplicate). Flyers and rules keep all their pages (`(GameHelp) <nom>.png`, `(GameHelp) <nom> 2.png`…). A media file of the same type already in the table (including another extension or other pages) goes to the trash; the plan marks it "remplace l'existant" (replaces the existing one).

**Never stored, always flagged in the plan**: formats the menu does not read (`flv`, `f4v`, `avi`, `mov`, checked on Electron 44.5.1: convert them to mp4 or webm), a format not intended for the type (a video as a logo, for example), media for an emulator other than Visual Pinball (`POPMedia\Future Pinball\…`). In move mode (import folder), they stay in `import\`.

**"Reprendre les médias de PinUP Popper / PinballX" (Take over media from PinUP Popper / PinballX)** (system menu, Exit in the menu): offers the installations found in the usual locations (`C:\vPinball\PinUPSystem\POPMedia`, `C:\PinballX\Media`…) or a chosen folder (`PinUPSystem`, `POPMedia`, an emulator's or a type's folder, the PinballX folder or its `Media`). Each media file is matched to an installed table, never by guessing: a name that refers to several tables ("Fathom" for two versions stored in two folders) is not copied. The plan gives, table by table, the types received, their size, how the table was recognized and what is replaced; then the unreadable formats, the games without a table and the other emulators. Free space is checked beforehand. "Copier" (Copy) **copies**: the original installation is never modified. PuP-Packs (`PUPVideos`) and Popper's default media (`System`, `Default`) are not taken over.

**Unrecognized cases**: Popper's `MediaSearch` field (a media item shared by several tables, with a wildcard) and `MediaWildCard` (several files picked at random: only one is kept); media named differently from the game in Popper's or PinballX's database, when that name resembles neither the `.vpx`, the folder, the title nor a VPS game (they are listed as "Sans table" (No table)); PinballX's `Table Images Desktop` and `Table Videos Desktop` (desktop views); Popper's `Wheelbar` and themes; subfolders of a type folder, other than PinballX flyers.

Unattended demo, with the window never shown (screenshots in `tmp\captures\import-medias`): `npm run build`, then `npx electron docs/demo-import-medias.js`.

### The media doctor

The doctor ([doctor.ts](../packages/core/src/doctor.ts), details screen > "Diagnostiquer et réparer" (Diagnose and repair)) checks, without launching anything:

| Finding | When | Fix |
| --- | --- | --- |
| Format the menu does not read | `flv`, `f4v`, `avi`, `mov` (checked with `canPlayType` in Electron 44.5.1), `wmv`, `mpg`, `mpeg` (not among Chromium's formats); or a format not intended for the type (`(Wheel)` as a `jpg`, `(Loading)` as an image…) | trash if a readable version has the same name; otherwise, convert (HandBrake) |
| Display stored under the wrong type | `(DMD)` in 16:9, or `(FullDMD)` in 4:1: the menu picks DMD or FullDMD from the proportions of the DMD screen (boundary at 8:3) | rename to the other type, if the name is free |
| Misnamed media | `(Type) nom` whose name is neither that of a `.vpx` in the folder nor that of the folder (pages included: `Nom 2`, `Nom_02`); file with neither `(Type)` nor a VPinFE name | rename to `(Type) <dossier>` (the next free page for the flyer and the rules), unless `medias\` already shows that type |
| Media stored outside `medias\` | PinUP Popper layout (`POPMedia\…\Wheel\<jeu>.png`) or PinballX layout (`Media\Visual Pinball\Wheel Images\…`) in the table folder, or `(Type) nom` placed next to the table; the `pupvideos`, `pinmame` and `cache` folders and the script's DMD folder are ignored | store and rename as `medias\(Type) <dossier>.ext`; the emptied tree goes to the trash |
| Proportions differ from the screen | a gap of more than 15% (`MEDIA_RATIO_TOLERANCE`, measured as a ratio) from the role's zone in the cabinet model: cropped playfield (only the aspect ratio matters, since the menu rotates the media; an almost square file does not tell where the flippers are), black bars or a portrait media item on a landscape screen for the backglass, DMD and topper, FullDMD shown shrunk for lack of a DMD | — (information) |
| Very heavy media | image over 25 MB or over 7680 × 4320 pixels, video over 300 MB, sound over 50 MB (`MEDIA_SIZE_LIMITS`, `MEDIA_MAX_PIXELS`) | — (re-encode) |
| Duplicate media | several files of the same type for the same game (`.png` and `.webp`, `.vpx` name and folder name, `(Wheel)` and VPinFE's `wheel.png`): only one is shown; a version in the folder that has its own media is not a duplicate | trash the never-shown files of the same kind; an image next to a video of the same type is only flagged |
| Media the menu could not read | error recorded by the display in the error file, for a file unchanged since then | trash for a damaged or rejected file (decoding, format, image); only flagged for a disk error |

Every fix is safe: rename, move into `medias\`, or move to the trash (`trash\`); nothing is converted or deleted. "Tout réparer" (Repair all) chains the fixes without any two of them targeting the same file; anything that depends on a rename (the type of a misnamed display, for example) is checked at the next analysis.

**Playback error file**: `<racine>\data\logs\medias-erreurs.json`, written by the main process ([mediaerrors.ts](../packages/core/src/mediaerrors.ts), `recordMediaError`) when the display passes it an error from `<video>`, `<audio>` or `<img>`. Format, version 1:

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

`kind` comes from `MediaError.code` (2 `network`, 3 `decode`, 4 `unsupported`, anything else `other`) or is `image` for `<img>`; an interrupted playback (code 1, the table was changed) is not recorded. `type`, `role` and `message` (300 characters at most) are optional. An entry only applies to the file as it was (same size, same date): a replaced or re-encoded file is no longer flagged, and its old entries disappear at the next write. 200 entries at most, the most recent ones.

### Unattended proofs

`.\docs\demo-medias.ps1` replays the whole milestone off screen, on the hidden Windows desktop, with the real menu: a sandbox of three tables with generated media (`docs\demo-medias.cjs`): a complete one (all types, two flyer pages, a rule card, music, launch sound, loading video), a partial one (logo, playfield as an image, backglass taken from the `.directb2s`), one with no media at all and a very long title, plus a default topper in `<racine>\media`. On the reference cabinet (`docs\ecrans\borne.json`: 4K playfield lying flat, player at the left edge, backglass, 4:1 DMD, topper), then on the two-screen PC (`poste-deux-ecrans.json`: landscape playfield, backglass and DMD as a strip on the other screen), the same sequence captures every screen at every moment: navigation over the three tables, the flyer page by page, the rules, their fallbacks, "Médias du jeu" (Game media) and its pages, loading (video, then backup screen), a simulated game occupying the backglass (free screens animated, "en partie" (during play) fallbacks), return to the menu, attract mode and leaving it. The script fails if a screen is empty (uniform image, `vides.txt`), if a text overlaps another, runs off the screen or is clipped (`mise-en-page.txt`, a safeguard on every screen), or if a screen does not show the expected media or fallback (layers recorded in `son.txt`). One contact sheet per step, with all the screens side by side and the playfield turned upright as the player sees it, in `tmp\captures\medias\<écrans>\planches`. `-Ecrans borne` replays only one of them.

### Media from VPinMediaDB: "Chercher les médias"

[VPinMediaDB](https://github.com/superhac/vpinmediadb) (the `superhac/vpinmediadb` repository on GitHub) stores media for about 1,155 games, one folder per VPS identifier. Cyber Pinball downloads them **on request only**, never automatically (design: `docs/recherche/medias.md`, § 3.1, § 3.4 and § 5.5).

- **Disclaimer**: VPinMediaDB declares no license (`license: null` in the GitHub API, no LICENSE file and no terms of use, checked on October 21, 2026). Its media belong to their authors, and the game artwork to its manufacturers: **personal use, on your own cabinet only**, without redistributing them. Cyber Pinball ships none of them. The disclaimer is shown on first use (accepted once, date stored in `<données>\mediadb.json`) and at the top of every plan. The source is credited in the plan, on the media item's details ("Source : VPinMediaDB (github.com/superhac/vpinmediadb), téléchargé le …" (Source: VPinMediaDB (github.com/superhac/vpinmediadb), downloaded on ...), followed by the file's address) and here.
- **Two entry points**:
  - a table's details screen > "Médias du jeu" (Game media) > "Chercher les médias" (Search for media): everything VPinMediaDB has for that game;
  - system menu > "Médias manquants : chercher sur VPinMediaDB" (Missing media: search VPinMediaDB): whatever each table is missing, one table per folder. From here, an existing media file is never replaced, and a table matched by its title alone is not served automatically.
- **Matching**: by the `VPSId` in the `.info`. Otherwise, by the table's name (title, initials, manufacturer, year) matched against the VPS database (section "VPS database"), which supplies the identifier. An identifier that is known but missing from VPinMediaDB only leads to the other editions of the same game (Pro, Premium, LE), to be checked on the previews. When nothing is certain, deep search takes over (next section). "Pas le bon jeu ?" (Not the right game?) is always offered: it shows the possible games with the reasons for each, and lets you search for another title with the keyboard.
- **What is taken**:

  | VPinMediaDB | Media | Notes |
  | --- | --- | --- |
  | `wheel.png` | Logo `(Wheel)` | 500 × 500, transparent |
  | `1k/table.mp4`, otherwise `table.png` in 1k or 4k | Playfield `(Playfield)` | video first; landscape, flippers on the right, and the menu rotates it |
  | `1k/bg.png` | Backglass `(Backglass)` | 1k only |
  | `1k/dmd.mp4`, otherwise `1k/dmd.png` | Wide display `(FullDMD)` | 16:9; scaled down on a 4:1 display |
  | `flyer.png` | Flyer `(GameInfo)` | page 1 |
  | `audio.mp3` | Game music `(Audio)` | |

  Not taken: `cab.png` (photo of the cabinet), `fss.png` (playfield and backglass for a single screen), `realdmd*.png` (physical DMD, which Cyber Pinball does not handle). VPinMediaDB never has a 4:1 display, a topper, a loading video, a launch sound or rules.
- **1k or 4k**: only the playfield image exists in 4k. The "Qualité téléchargée (VPinMediaDB)" (Download quality (VPinMediaDB)) setting is in system menu > "Médias, son et attente" (Media, sound and attract mode):
  - automatic: 4k if the playfield zone, in the active configuration, is larger than 2,560 pixels on a side;
  - or 1k, or 4k, forced.

  The plan states what was chosen, and why.
- **Plan to approve**: one card per media item.
  - Each card shows the preview (the 1k image of the same media item, received and verified, which is then reused for the download), the size (HEAD request, cached by MD5 in `downloads\vpinmdb.sizes.json`), what gets replaced, and the name the media file will be stored under.
  - Start on a card switches to the next variant: video, image, or nothing.
  - Selected automatically: missing media, and the new version of a file that already came from VPinMediaDB. A media file added by the user stays "Gardé" (Kept); replacing it has to be requested ("Remplace l'actuel" (Replaces the current one); the old one goes to the trash).
- **Download**: one file at a time, received as `downloads\vpinmediadb\<md5>.ext.part`. The size and MD5 from the index are checked, then the file is stored as `medias\(Type) <nom du dossier>.ext`, and the old file goes to `trash\<date> Médias <dossier> (VPinMediaDB)`. An interrupted download (connection lost, 30 s without data) or an invalid one (MD5, size, HTTP response) is deleted: nothing is left behind, and the other media carry on. Progress: "Plateau (2 sur 6) : 1,2 Mo sur 1,7 Mo…" (Playfield (2 of 6): 1.2 MB of 1.7 MB...).
- **Source in the `.info`**: `CyberPinball.medias.sources.<Type>` receives `{ origin: "VPinMediaDB", url, date, vpsId, key, md5, file }`. The forced 180° turn of a replaced playfield is removed: the new file follows the standard, which the menu rotates on its own. A later search says "À jour" (Up to date), or offers the new version if the MD5 in the index has changed.
- **Index**: `vpinmdb.json` (1.7 MB), downloaded on first use from `https://raw.githubusercontent.com/superhac/vpinmediadb/main/vpinmdb.json` and kept in `<racine>\downloads`.
  - It is rechecked at most every 12 hours, in the background; GitHub answers 304 (ETag) if it has not changed.
  - Without a network connection, the cache is used, and an invalid response never replaces it.
  - Only addresses from the `superhac/vpinmediadb` repository are accepted. The `bg_thumbs` entry, which is empty, is ignored.
- **Measured volumes** (October 21, 2026, HEAD requests):

  | | 1k | 4k |
  | --- | --- | --- |
  | Terminator 2, all defaults (playfield and display videos) | 14 MB | 14 MB |
  | Terminator 2, images only | 9.8 MB | 20 MB |
  | Playfield image only (Terminator 2) | 3.5 MB | 13 MB |
  | Average of 12 games, all defaults | 11 MB | 17 MB |
  | Average of 12 games, playfield image | 3.2 MB | 13 MB |

  4k only changes the playfield image, which is about four times heavier. By default, the playfield video (1k) takes precedence over it, when it exists.
- **Code**: `packages/core/src/mediadb.ts`, tests in `packages/core/src/test/mediadb.test.ts` (fake index and files served by a local server, no network access); screens in `app/src/media-download.ts`. Real trial without a window: `npm run build`, then `node docs/essai-vpinmediadb.mjs --types Wheel` (sandbox `tmp\essai-vpinmediadb`). Demo: `.\docs\demo-vpinmediadb.ps1` (section "Unattended end-to-end tests"). Manual tests: [docs/manual-tests.md](manual-tests.md), scenarios 160 to 168.

### Suggestions for each media item and deep search

The automatic choice is not always enough: the table's name has been changed, shortened or translated ("GOTG_2.1.1.vpx", title "Gardiens de la galaxie"), or you prefer another version of the backglass. A table's details screen > "Médias du jeu" (Game media) > a media item > **"Voir les propositions" (See suggestions)** shows every version found for that media item, each with its preview, where it comes from, and why.

- **What is suggested**, in this order:
  - VPinMediaDB, for **each selected game**: the recognized game, its other editions (Pro, Premium, LE), and the close matches you add; each variant (video or image, 1k or 4k), with a file shared by two editions shown only once;
  - what the **table already has** without knowing it:
    - in the **PuP-Pack**: the file that `screens.pup` assigns to the backglass, topper or display screen; those that `triggers.pup` sets at startup (`D0`) or in attract mode (`E454`), and the music of its `MusicOnly` screens (the game-mode backgrounds are in-game scenes, left out); the `PupImages` frames with a backglass aspect ratio (`-4x3`, `-5x4`, `-16x9`); folders with telling names (`BGDefault`, `Topper`, `DMDAttract`...), except for a file whose screen `screens.pup` or `triggers.pup` already state; music files (over 500 KB);
    - the animations in the FlexDMD or UltraDMD folder that the script loads;
    - in **each `.directb2s` in the folder**: the lit image and the display, then the same images **"tout allumés" (all lit)**, with every visible bulb from `<Illumination>` laid over them the way the B2S server shows them when they light up (a piece of lit image is laid on as is, a glow takes the bulb's color). The compositing is done once, with no dependency (PNG reading and writing in `packages/core/src/png.ts`), and kept in `<données>\cache\medias` (`b2sLitImages`, `packages/core/src/b2simage.ts`); on Terminator 2 (8 flashers, 2,517 × 2,397 image), about 4 s the first time. A second `.directb2s` is another possible backglass, offered with its name ("que VPX ne charge pas" (which VPX does not load)); a copy of the same file under another name, which is common (the site's name next to the table's name), is read and shown only once;
    - in the **`.vpx`**: the screenshot the author stored in it; the flat playfield image (`IMAG` field, except Visual Light Mapper atlases); the rule card that the rules Markdown points to (`![…](nom)`), otherwise an image with a card-like name; the backglass and the logo from the VR room. Only the start of each image is read to get its name; the selected images are written once to `<données>\cache\medias` (`vpx-<clé>-…`), and read again if the `.vpx` changes;
  - the **community sites**, with the user's own account: **VPForums**, then **VPUniverse** as a last resort (see "Community site media" below);
  - the **VPS database thumbnails**: the playfield of each version of the table and the backglass of each `.directb2s` (from 352 × 626 to 1,000 × 750, "basse définition" (low definition)), often the only image of a game missing from VPinMediaDB: 2,608 games have a playfield one, 1,746 a backglass one;
  - the **VPS database music** (`soundFiles`): Dropbox share links to an mp3 or ogg, downloaded only when you choose the card, one at a time. The received file is checked by its signature (`isAudioFile`): a dead link returns an HTML page, and the card then says "Lien mort" (Dead link).
- **Choosing**: Start on a suggestion puts it in the draft, like a file from the import folder (a new page for the flyer and the rules). An online file is downloaded and verified (VPinMediaDB MD5) at the moment it is chosen; a file from the table is copied, and the original stays in place. The card says "Actuel" (Current) or "Choisi, à enregistrer" (Chosen, to be saved). Nothing is written before "Enregistrer" (Save), which shows the plan; the origin of a downloaded file (VPinMediaDB or VPS database, address, date, VPS identifier) goes into the `.info`, and disappears if the media file is later replaced by hand. A suggested music track plays as soon as its card is selected.
- **"Autres jeux…" (Other games...)**: the possible games, most likely first, with their logo (or a thumbnail), what they have online and their reasons; Start adds a game to or removes it from the suggestions. Selected automatically: the first game, its other editions, and those almost as likely (four at most).
- **"Chercher un autre titre…" (Search for another title...)**: typing on the on-screen keyboard (or a real keyboard) an English title ("lord of the rings"), initials ("TMNT") or a ROM name ("t2_l8"); the first game found is added to the suggestions.
- **Deep search**: every clue the table gives about itself, checked one by one against the VPS database, with each lead keeping its reasons in plain words:
  - the **name written into the table** by its author (File > Table Info in the VPX editor: the `TableInfo` storage of the `.vpx`, read without loading the table): "GOTG_2.1.1.vpx" is called "Guardians Of The Galaxy" there; its **author and version** point to the exact recreation in VPS; an **IPDB number** quoted in its description points to the game;
  - the title on the details screen, the name of the `.vpx`, of the folder and of the `.directb2s`;
  - the **ROM**, the **PuP-Pack** and the **DMD folder** read from the script (the script is read through VPX if it never has been before);
  - the **initials** ("GOTG", "TMNT", "TAF", "T2") and **fuzzy words**, for a translated title ("gardiens", "galaxie");
  - several independent clues pointing to the same game push it up; file names, which copy one another, count as one.

  The automatic plan ("Chercher les médias" (Search for media)) and the system menu's "médias manquants" (missing media) use it when the name is not enough: a table recognized this way is shown for checking, never served automatically.
- **Code**: `packages/core/src/vps.ts` (initials, fuzzy words, other editions, free search), `vpxinfo.ts` (reading the `.vpx`), `mediasearch.ts` (clues and leads), `mediachoices.ts` (suggestions), `mediaedit.ts` (origin on save), tests in `packages/core/src/test/mediasearch.test.ts` and `b2slit.test.ts`; screens in `app/src/media-proposals.ts` and `app/src/media-search.ts`. Off-screen demo, with the real VPinMediaDB: `.\docs\demo-propositions.ps1` (screenshots in `tmp\demo-propositions\captures`). Manual tests: [docs/manual-tests.md](manual-tests.md), scenarios 182 to 187 and 206 to 211.

### Community site media

PinUP Popper is not on the cabinet: Cyber Pinball replaces it. Its media server can only be reached from Popper Setup, but the same authors post on the forums, with a free account. The suggestions for each media item search them, in the session of the "Récupérer" (Get) window (where you sign in yourself; Cyber Pinball never sees a password). Survey of 24/10/2026: `docs/recherche/sources-medias.md` § 6.

- **VPForums first**: 808 complete media packs, 4,153 logos, 1,829 videos. Its search is for members only: without a sign-in, a row says so and "Se connecter à VPForums…" (Sign in to VPForums...) opens its sign-in page.
- **VPUniverse as a last resort**: about 24,000 menu media (logos, playfield, backglass, DMD and topper videos, loading videos, cards, launch sounds, flyers), but **about 45 s of waiting before each file** with a free account, and a limited number of downloads. Its results show without an account; downloading needs one.
- **Search**: when the suggestions open, one results page per site and per title (the title of each selected game without its subtitle, "terminator 2", or what was typed in "Chercher un autre titre…" (Search for another title...)), read in a hidden view and limited to the menu media categories (`SITE_CATEGORIES`). Results are kept for half an hour; nothing is searched in the background. Each result keeps its title, category, author, date, download count and the thumbnail posted by the author (a still image, even for a video).
- **Matching**: the title of each result, stripped of the media words ("Topper Video", "Animated Wheel"...), is checked against the whole VPS database; it only counts if it points to a selected game (a "Terminator 3" result is not taken for Terminator 2). The media type comes from the category ("Topper Videos": topper); for VPForums' mixed videos, from the title; a complete pack counts for every media item.
- **Queue**: Start on a card puts it in its site's queue, one file at a time per site, each site on its own. The download happens in a hidden view, like the direct download of "Récupérer" (Get); **VPUniverse's timer runs in the page**, as for a member who clicks: the page asks the server for the wait, counts down, then starts the file, and the card shows the seconds left ("Attente du site · 31 s" (Site wait · 31 s)). Cyber Pinball waits and shortens nothing. Start on a queued card removes it; "Arrêter la file" (Stop the queue) stops everything. A download cap stops that site's queue; a page that asks for something (several files to choose from, terms, a check) opens in the visible window, and the file downloaded there goes back to the media item.
- **Receiving**: the file is stored in `<téléchargements>\sites\<site>-<entry>\fichiers`, the archive unpacked; a pack laid out the Popper or PinballX way gives each file's type by its folder. Received files are recorded in `<téléchargements>\sites\recus.json` and suggested on later visits, for this media item as for a pack's other screens ("Reçu de VPForums" (Received from VPForums)). The file awaited by the last card chosen for a media item goes into the draft by itself; another choice made in the meantime is never replaced. Nothing is written to `medias\` before "Enregistrer" (Save); the source (site, entry address) goes into the `.info`.
- **Code**: `packages/core/src/mediasites.ts` (categories, addresses, results page scripts, matching, received files), `sitesessions.ts` (timer, `WAIT_PROBES`), `app/src/media-sites.ts` (search, thumbnails, queue, received files), `app/src/acquire-window.ts` (hidden view, download recipient), `app/src/media-proposals.ts` (cards); tests in `packages/core/src/test/mediasites.test.ts`. Off-screen demo: `.\docs\demo-medias-sites.ps1` (one results page from each real site, as a visitor, then fake entries for sign-in, queue, timer and pack; captures in `tmp\demo-medias-sites\captures`). Manual tests: [docs/manual-tests.md](manual-tests.md), scenarios 241 to 246.

## Launching a game

`app/src/launcher.ts` launches the table the way a frontend does: `VPinballX_BGFX64.exe -Ini <VPinballX.ini> -Play <table.vpx>`, then watches the process's windows every 250 ms until it ends. The game starts when the "Visual Pinball Player" window appears (it takes the foreground back if needed); closing that window shuts VPX down cleanly (exit code 0). Ctrl+Shift+K stops a stuck game (polite close, then forced after 5 s).

**No screen ever shows the Windows desktop.** The menu windows are no longer hidden during a game: they stay behind VPX's windows, without taking focus from it. The playfield keeps the loading screen (the game's loading video, or a fallback screen, and the controls) until the game window appears, then each screen switches to its **in-game background**: the game's media, frozen by default, visible only on a screen VPX does not use (topper without a window, backglass without a `.directb2s`, no DMD); see "Loading and play". For this, each window receives a `game` state (table, media, playback of each role), rendered by `renderGame` (`app/renderer/frontend.js`). On return, the menu takes the foreground back as before.

A single rule covers every moment, the **screen guard** (`app/src/screen-guard.ts`, started by `main.ts` before any other window, except the waiting screen for another running frontend):

- **one black cover per screen**, present from startup to shutdown, which follows screens being added, removed and rotated; it never takes focus (`focusable: false`) and only appears once painted: shown before its first frame, a window stays white for nearly a second. It covers screens without a Cyber Pinball window: a screen with no role, and screens other than the main one with `--reglages`;
- **gap-free relaunch** (`relaunchCovered`, the only way to relaunch the application: menu → wizard, wizard → menu, settings → wizard): the new process opens its covers and windows on top of the old one's, which only closes afterwards (15 s wait at most);
- **taskbars hidden during a game**: when VPX takes the foreground, before its game window goes full screen, Windows briefly brings the taskbar back in front of the screens it does not occupy (seen on the DMD screen). They come back at the end of the game, when the application closes, and at the next startup if the application stopped in the middle of a game (marker `barres-des-taches-masquees` in the data folder): only the ones Cyber Pinball hid, a taskbar already hidden by another frontend stays hidden;
- **console report**: twice a second, the Windows window stack is read again (`screenCover`, `packages/core/src/screencover.ts`); a screen that stays for more than a second without a Cyber Pinball window covering it, or under a taskbar, produces "Écran « Topper » : aucune fenêtre de Cyber Pinball ne le couvre, le bureau Windows se voit." (Screen "Topper": no Cyber Pinball window covers it, the Windows desktop shows through.), then "de nouveau couvert" (covered again). The endurance test counts these reports per launch ("écrans découverts" (uncovered screens)). "Bureau Windows" (Windows desktop) in the system menu suspends the rule until you return.

Tests pin down the rule: no window is hidden with `hide()`, the application only relaunches through `relaunchCovered`, and the guard starts before the other windows (`packages/core/src/test/screencover.test.ts`).

**No editor or audit window.** With `-Play`, VPX 10.8.1 does not create its editor (`PlayTableCommand`, `src/core/AppCommands.cpp`): no table audit (the "Table audit" box only exists in the editor, when opening a table with errors), no script editor (a script error goes to the log and to an in-game notification), no progress window, debugger or table picker. Checked on the development PC with three tables, including Terminator 2 1.25, whose audit reports 18 errors: only the "Visual Pinball Player", "Visual Pinball Backglass" and "Visual Pinball Score View" windows (class `SDL_app`) are shown; "Visual Pinball Topper" is created hidden when the topper is not assigned; nothing more on exit.

Two VPinballX.ini settings still make VPX ask a question in the middle of loading; Cyber Pinball manages them (written at every sync, with manual changes detected and never silently overwritten, like the other managed keys):

| Setting | Value written | Otherwise |
| --- | --- | --- |
| `[Player] SecurityLevel` | `0`: all ActiveX objects in the script allowed (VPX default) | from 1 to 3, "This table is attempting to create an object of type …" (Yes / No) for each object, even `Scripting.Dictionary`; at 4, all refused and the script stops |
| `[PlayerVR] AskToTurnOn` | `2`: VR off (VPX default) | at 0, "Connection to VR headset failed / Retry connection ?" (Yes / No) or "VR mode activated but OpenXR initialization failed."; the Windows build of VPX includes OpenXR |

Every other visible VPX window is classified (`classifyVpxWindow`, `packages/core/src/vpxwindows.ts`):

- **dialog box** (`#32770`): the game stops and its text becomes the on-screen message, without the buttons. The ActiveX prompt and the VR headset prompt are recognized: the message names the setting to restore. The text is read with `WM_GETTEXT` (`windowTexts`): it is the only way to read an edit box in another process, where VPX puts the audit report and script errors;
- **editor window**, if another version of VPX opened one: the editor (class `VPinball`), the script editor (`CVFrame`), "Preparing Table" and the debugger are hidden (closing them would quit VPX or ask a question), the table audit ("Dialog" box whose text starts with "Table audit:" or "This table contains error(s)") is closed; the game goes on, and the game window takes the foreground back;
- **unknown window**: left on screen.

The last two cases leave a one-sentence report (`LaunchResult.notices`): written to the console at the end of the game, added to the message of a failed game and to the endurance test summary ("autres fenêtres de VPX" (other VPX windows)).

`node scripts/sonde-fenetres.mjs --exe … --ini … --table …` (after `npm run build`) lists every window of a game, hidden ones included, along with what the launcher would do with them; `--commande Edit` opens the table in the editor to check that the editor and the audit are recognized on real windows. Always on copies of the table and of VPinballX.ini.

## Coexisting with another cabinet frontend

Cyber Pinball installs on a cabinet that already has PinUP Popper, PinballX or PinballY without changing anything in their installation. Code: [packages/core/src/coexistence.ts](../packages/core/src/coexistence.ts) (known frontends, taskbars, list of the Windows settings it changes) and [app/src/frontend-gate.ts](../app/src/frontend-gate.ts) (waiting screen); the invariant is pinned down by [coexistence.test.ts](../packages/core/src/test/coexistence.test.ts).

**What stays separate.**

- Everything lives in the Cyber Pinball root folder: its own copy of VPX (`emulators\vpx\`), its tables, ROMs and media.
- VPX is launched with `-Ini <root>\config\VPinballX.ini`: the other frontend's `VPinballX.ini` is neither read nor written. Only the log `%APPDATA%\VPinballX\10.8\vpinball.log` is shared if the other frontend also uses VPX 10.8: each game rewrites it.
- VPX plugin mode: no component is registered in Windows (VPinMAME, B2S and PinUP Player stay the other frontend's); `B2STableSettings.xml`, `DmdDevice.ini`, the DOF configuration and `PUPDatabase.db` are not touched.
- The other frontend's files are never moved: "Reprendre les médias de PinUP Popper / PinballX" (Import media from PinUP Popper / PinballX) copies them, and a table picked outside `import\` is copied.
- ROMs and NVRAM are stored separately: high scores and game settings are not shared.

**What is shared: a few Windows settings.** Their full list is `WINDOWS_CHANGES`. The test rejects a declared call made outside its file, and any call that would change something else (`FORBIDDEN_WINDOWS_CALLS`: registry outside the installer, default audio output, the application starting itself at sign-in, system parameters, processes killed by name).

| Setting | When | What Cyber Pinball does for the other frontend |
| --- | --- | --- |
| Orientation of the playfield screen | wizard, "Où sont les flippers ?" (Where are the flippers?) step, only if VPX cannot put the flippers on the player's side | Another frontend installed or running: the first Start warns ("Retourner l'écran dans Windows ?" (Flip the screen in Windows?): its menu and tables would be upside down too). Start flips anyway, then asks for confirmation within 15 s as usual; Exit keeps the Windows orientation, tables upside down in Cyber Pinball. |
| Taskbars | during a game | Only the ones Cyber Pinball hid come back (`taskbarsToRestore`): a taskbar already hidden by the other frontend stays hidden. The `barres-des-taches-masquees` marker keeps the HWND of each one. |
| Ctrl+Shift+K shortcut | during a game | Released at the end of the game. |
| Start at sign-in | installer option, unchecked by default | Leave it unchecked if the other frontend starts with Windows: the two would fight over the screens. |
| "Programs and Features" entry | installation (`HKCU`) | Removed on uninstall. |

**Another frontend already running.** The two frontends would fight over the screens, the DMD display and the cabinet buttons. At startup, before covering any screen (`otherFrontendsGate`, called by `main.ts` before the screen guard), Cyber Pinball looks for the processes of the known frontends (`OTHER_FRONTENDS`: `PinUpMenu.exe` and `PinUpDisplay.exe` for PinUP Popper, `PinballX.exe`, `PinballY.exe`; `PinUpPlayer.exe`, the PuP-Pack player, is not one of them). If it finds one, only the main screen shows "PinUP Popper est ouvert" (PinUP Popper is running): Cyber Pinball starts on its own as soon as it is closed (checked every second); Start or "Continuer quand même" (Continue anyway) starts right away; Exit or "Quitter Cyber Pinball" (Quit Cyber Pinball) quits. Nothing is closed or changed in the other frontend. Before each game, the menu checks again: a frontend opened in the meantime gives "PinUP Popper est ouvert" (Start: play anyway · Exit: back to the menu). A frontend accepted once is no longer reported until Cyber Pinball closes, menu ↔ wizard relaunches included (`CYBERPINBALL_AUTRES_MENUS_ACCEPTES`, passed on to the new process).

**Installed frontends** (`installedFrontends`, for the orientation warning): the executable, or the `POPMedia` or `Media` folder, in the default locations (`vPinball\PinUPSystem`, `PinUPSystem`, `PinballX`, `PinballY`…, on C:, D: and E:).

**Unattended test**: `.\docs\demo-autre-menu.ps1` (offscreen) runs the waiting screen then the menu starting when Popper "closes", the message before a game then the simulated game, and the wizard warning (orientation kept, then simulated flip). Offscreen, only simulated frontends count: `CYBERPINBALL_AUTRES_MENUS` (running, executable names separated by commas; with `CYBERPINBALL_AUTRES_MENUS_FICHIER`, closed when that file disappears) and `CYBERPINBALL_AUTRES_MENUS_INSTALLES` (installed). On a real cabinet with PinUP Popper: manual tests 231 to 235.

## Unattended end-to-end tests

**Rule, for every test and every development session: off-screen by default.** An unattended test must never open a window on the machine's screens, steal its focus or depend on the screens plugged in: the machine is used for work while the tests run in the background.

- **Off-screen** (`app/src/offscreen.ts`, rules in `packages/core/src/offscreen.ts`): automatic as soon as `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` or `CYBERPINBALL_STRESS` is set, or forced with `CYBERPINBALL_HORS_ECRAN=1`. Every window is created through `createWindow` and rendered in memory (Electron off-screen rendering, `webPreferences.offscreen`) at the size of its screen, with a scale factor of 1: never shown, never in the foreground, absent from the taskbar, sound muted. `coverDisplay` only sizes them (simulated rotation included); `show`, `focus`, full screen, minimizing and taking back the foreground have no effect. The rendering is that of a real window: captures (`capturePage`), the layout guard, replayed keys and clicks (`click:<selector>`, `sendInputEvent`) all work the same way.
- **Simulated screens**: `CYBERPINBALL_DISPLAYS=<file.json>` replaces screen detection everywhere (setup wizard, menu, settings, `sync`, button reset: `observedDisplays`, `app/src/displays.ts`), in the same shape as `npm run probe -- --json` (`displays` field), EDID included; a malformed file is rejected, naming the faulty screen and field. Screen sets versioned in `docs\ecrans\`: `pc-dev` (the four screens of the development PC, those of the cabinet model in `D:\CyberPinball`), `borne` (4K playfield lying flat, 1080p backglass, 4:1 DMD, topper), `poste-deux-ecrans` (the current machine: main screen and two screens), `un-ecran`. With simulated screens, orientation is never applied to a real screen.
- **Watch**: during an off-screen test, any application window that is visible or in the foreground (`isVisible`, `isFocused`, native windows of the process, dialog boxes included) is reported in the console ("Hors écran : …" (Off-screen: …)) and in `<captures>\hors-ecran.txt` ("Aucune fenêtre visible ni au premier plan" (No window visible or in the foreground) otherwise). The demo scripts fail if a window appeared; `npm test` replays the wizard off-screen on the simulated cabinet and checks this.
- **Hidden desktop, mandatory for demos** (`docs\hors-ecran.ps1`): each `docs\demo-*.ps1`, `docs\demos-hors-ecran.ps1` and the launcher's demo actions relaunch themselves entirely (PowerShell, node, Electron, tools) on a separate Windows desktop, `CyberPinballEssais` (`Enter-BureauCache`, `CreateDesktop` then `CreateProcess` with that desktop), which the user never sees; their output comes back to the original console. Even if a window were shown by mistake, nothing would appear on the machine's screens. The application applies the same rule to any unattended test, whatever launched it (`npx electron app` by hand, another script, another session): when off-screen and outside the hidden desktop, it relaunches itself there with the same arguments (`relaunchOnHiddenDesktop`, `app/src/offscreen.ts`; `packages/win-displays/src/desktop.ts`), copies back its output and returns its exit code; `npm test` checks this. **Only known gap: a new console.** Windows 11 hands it to Terminal, which opens on the user's desktop and takes the focus, even from the hidden desktop: the scripts run their tools in their own console (`Start-Process … -NoNewWindow`, never `start`), and the application runs them with `windowsHide` (invariant tests in `offscreen.test.ts`). `.\docs\preuve-bureau-cache.ps1 -Etape notepad|console|electron` checks this: it launches a Notepad, inherited consoles or a full-screen Electron window on the hidden desktop, confirms they are visible there, and fails if anything appears or takes the foreground on the user's desktop.
- **Reserved for the machine's screens**: a VPX game ("Jouer" (Play), "Régler l'affichage en partie" (Adjust display in game)), the endurance test and captures of the whole desktop are refused off-screen with the message "… nécessite les écrans du poste" (… requires the machine's screens), and only run with `CYBERPINBALL_A_L_ECRAN=1` (real windows, full screen, focus taken): `docs\demo-barre-taches.ps1`, `docs\demo-fenetres.ps1`, the launcher's "Endurance" (Endurance) action. The "Choisir des fichiers" (Choose files) dialog box is also refused off-screen. Reading a table's script (`VPinballX -ExtractVBS`) is still allowed: VPX then opens no visible window.
- **Demos**: each `docs\demo-*.ps1` loads `docs\hors-ecran.ps1` and runs off-screen on `docs\ecrans\pc-dev.json` (`-Ecrans borne`, for example, for another cabinet). `.\docs\demos-hors-ecran.ps1` (the launcher's "demos" action) replays them all in a row, with the output of each in `tmp\demos\`, and fails if any of them fails. A test by hand:

  ```powershell
  $env:CYBERPINBALL_DISPLAYS = "$PWD\docs\ecrans\borne.json"
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  $env:CYBERPINBALL_AUTOPILOT = 'SansBoutons,Digit1'
  npx electron app --assistant
  ```

**Layout guard** (`app/src/layout-check.ts`): at each key replayed by the autopilot (setup wizard, table menu, VPX settings), every window is inspected in its actual rendering. It reports two texts or controls that overlap (a layer with an opaque background hiding another one, like the help over the menu, does not count), anything that goes outside the window, and text clipped by a container that hides its overflow, itself included. An intended cut ("…", lines limited by `-webkit-line-clamp`) only excuses the element that makes it: the lines it keeps must not be clipped by any other container (a title limited to two lines in a zone one line high lost its first line without being reported). A test checks that the injected scripts compile (`packages/core/src/test/layout-check.test.ts`): a syntax error there made the guard silent. The height used for a text is that of its font, in the right direction for a rotated view. Problems go to the console ("Mise en page : …" (Layout: …)) and to `<captures>\mise-en-page.txt` ("Aucun problème de mise en page." (No layout problems.) otherwise); `docs\demo-boutons.ps1` fails if there are any. `.\docs\demo-mise-en-page.ps1` replays every state of the wizard on every screen of the simulated cabinet (1920 × 1080 and 1366 × 768 with `pc-dev`): the "Boutons" (Buttons) step in landscape and on a playfield rotated left and right, screens, orientation and flip, diagonal, sound with two fake outputs (one of them 7.1), summary and saving; it fails at the first problem found.

The wizard screen is built as a flow (`app/renderer/screen.*`): header, content centered in the remaining space, footer (message, step, help) and flipper strip, with no absolute positioning; content that is too tall pushes the footer down instead of sliding under it. The summary panel, which does not scroll, shrinks its body by one or two steps as long as it overflows. The button list switches to two columns when the screen is taller than it is wide.

**Sandbox guard** (`packages/core/src/sandbox.ts`, `app/src/sandbox-guard.ts`): as soon as `CYBERPINBALL_HOME` is set together with `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` or `CYBERPINBALL_STRESS`, the application and `sync` refuse any file write outside `CYBERPINBALL_HOME`, `CYBERPINBALL_ROOT`, the project's `tmp\` folder and the Windows temporary folder; the offending path is written to the console and the operation fails. It came out of two incidents on October 20, 2026 where a test touched the real root (an ini path copied from a real cabinet model, an installer parameter that was ignored). A deliberate test on the real root is done without `CYBERPINBALL_HOME`.

- **Setup wizard**: `CYBERPINBALL_AUTOPILOT` replays a sequence of keys, `CYBERPINBALL_CAPTURE` saves a capture of each screen after each key. The `SansBoutons` pseudo-code acts as if nobody had touched anything during the "Boutons" step (current keys kept, without waiting 20 s). Each key is pressed then released (button capture counts on release); `Maintenir3:KeyA` holds it for 3 s, `CtrlQ` sends Ctrl+Q.

  ```bash
  CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftLeft,Digit1,Digit1,Digit1,Digit1,ShiftRight,Digit1,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/captures npx electron app --assistant
  ```

  When unattended, screen orientation is simulated (the geometry changes in memory, no screen rotates). The `Attendre16` pseudo-code lets 16 seconds pass without a key, to see the countdown expire. Proposing, canceling, letting expire, then confirming the flip:

  ```bash
  CYBERPINBALL_HOME=tmp/flip/home CYBERPINBALL_AUTOPILOT=SansBoutons,Digit1,ShiftRight,Digit1,Escape,Digit1,Escape,ShiftRight,Digit1,Attendre16,ShiftLeft,Digit1,Digit1,Digit1,Escape,Escape,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/flip/captures npx electron app --assistant
  ```

  The "Son" (Sound) step really plays its beeps (short ones: each key arrives 400 ms after the previous one) and writes a report of each sound to the console (output found, channels opened). `CYBERPINBALL_AUDIO_OUTPUTS=<file.json>` replaces the detected outputs with a list in the format of the `audio` field of `npm run probe -- --json`, for example to add a fake 7.1 card and capture the speaker test (Electron cannot find it: no sound, message on screen). With four screens, a fake backglass HDMI output and a fake 7.1 card:

  ```bash
  CYBERPINBALL_AUDIO_OUTPUTS=tmp/son/sorties-simulees.json CYBERPINBALL_HOME=tmp/son/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftRight,ShiftRight,ShiftRight,Digit1,Digit1,Digit1,Digit1,Escape,Escape,ShiftLeft,ShiftRight,Escape,Escape,Digit1,ShiftLeft,ShiftRight,Digit1 CYBERPINBALL_CAPTURE=tmp/son/captures npx electron app --assistant
  ```

- **Exits and single steps**: `.\docs\demo-sorties.ps1` builds a cabinet model through the full wizard (simulated screens, fake audio outputs) in `tmp\demo-sorties`, then leaves each wizard mode without saving, each one with a different gesture (key held 3 s during button capture at first startup, Ctrl+Q, Esc or Exit held 2 s, button clicked with the mouse, Exit at the first question; "Placer librement…" (Place freely…) on the DMD in `sortie-ecrans`), and checks that `cabinet.json`, `VPinballX.ini` and `vpx-owned.json` have not changed and that the question announced what would be lost; finally it saves each step on its own (screens, playfield, sound, layout) and checks that no key or field outside the step has changed. `-Scenarios sortie-son,etape-son` replays only some of them. Captures in `tmp\captures\sorties`.
- **Cabinet buttons**: `.\docs\demo-boutons.ps1 -Run` copies the real cabinet model and `VPinballX.ini` into a sandbox (`tmp\demo-boutons`), then replays the "Boutons" step on its own with an encoder set to other keys (duplicate and Windows key refused, Exit redone with Backspace, validation refused without a test, Credit redone by clicking its row, test then saving) and shows the resulting `[Input]`; the full wizard with no answer for 21 s (default keys kept); the full wizard with "Touches par défaut" (Default keys) and "Recommencer" (Start over) clicked, then driven with the new keys; the menu's cheat sheet, then the reset to default keys from the system menu with the mouse. Wizard autopilot pseudo-code: `click:<selector>` clicks in the window of the first screen. Captures in `tmp\captures\boutons`.

- **Launcher endurance** (milestone 2 criterion, **requires the machine's screens**: `CYBERPINBALL_A_L_ECRAN=1`, set by the launcher action): `CYBERPINBALL_STRESS="N,S"` launches the table chosen by `CYBERPINBALL_TABLE` N times, stops each game after S seconds and checks that the menu takes back the foreground. The report is displayed and written to `data\logs\stress-*.json`; these games do not count in the statistics. The launcher's "Endurance" action.

  ```bash
  CYBERPINBALL_A_L_ECRAN=1 CYBERPINBALL_STRESS=50,10 CYBERPINBALL_TABLE=1.25 npx electron app
  ```

- **VPX windows** (**requires the machine's screens**: `$env:CYBERPINBALL_A_L_ECRAN = '1'`): `.\docs\demo-fenetres.ps1 -Run` copies Terminator 2 1.25 (failing audit), the real cabinet model and `VPinballX.ini` into a sandbox (`tmp\demo-fenetres`), then plays three games through the endurance test: INI as is (Cyber Pinball writes `SecurityLevel = 0` and `AskToTurnOn = 2`, game successful, no other window), then `SecurityLevel = 1` and `AskToTurnOn = 0` set by hand (kept, game stopped on the VPX question with the setting to restore). At the end it checks that the real `VPinballX.ini` has not changed.

- **Taskbar** (**requires the machine's screens**: `$env:CYBERPINBALL_A_L_ECRAN = '1'`): `.\docs\demo-barre-taches.ps1 -Etiquette apres` launches the menu, the settings and the wizard in a sandbox (`tmp\demo-barre-taches`) and captures the whole desktop meanwhile (`capturePage` does not see the taskbar); `bords.txt` gives the brightness of the first and last row of each screen. The `bureau` scenario picks "Bureau Windows" (Windows desktop) in the system menu, then reopens the playfield as if through its taskbar button. `-Scenarios` replays only some of them; `-Partie` plays a game of Terminator 2 with the real VPX and checks the return to the menu. Captures in `tmp\captures\barre-taches`.

- **Covered screens**: `.\docs\demo-ecrans-couverts.ps1 -Etiquette apres` continuously captures the whole desktop during a game of Terminator 2 (real VPX, copy in `tmp\demo-ecrans-couverts`), the menu → wizard and wizard → menu relaunch, the settings alone and an endurance test (`-Lancements`, 10 by default). Each capture is compared, screen by screen, with a capture of the desktop taken just before: a pixel identical to the desktop is a visible desktop pixel (`couverture.txt`: share of the screen and of its bottom strip, the taskbar's). The report separates startup (before the first windows), what follows (everything must be covered) and shutdown; captures taken while another instance of Cyber Pinball is running are ignored, and the script waits for it to finish before each scenario. `-Scenarios partie,endurance` replays only some of them. Captures in `tmp\captures\ecrans-couverts`.

- **Menu rotation**: `CYBERPINBALL_FLIPPERS=bottom|left|top|right` forces the flipper edge without modifying `cabinet.json` (left: 90°, right: 270°, top: 180°). With `--reglages`, the screen alone only rotates if this variable is set. The autopilot's `drag` step: the file drop frame.

  ```bash
  CYBERPINBALL_FLIPPERS=left CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=Digit1,Escape,Escape CYBERPINBALL_CAPTURE=tmp/captures npx electron app
  ```

- **Adding tables with the VPS database**: `.\docs\demo-vps.ps1 -Run` fills the import folder of a sandbox (`tmp\demo-vps`) with empty files named after real tables (certain games, uncertain ones, a missing one), copies the VPS database into the cache, then replays the "Quel jeu est-ce ?" (Which game is it?) screen, the plan and the installation; captures in `tmp\captures\vps`, written `.info` files shown in the terminal.

- **VPX plugins**: `.\docs\demo-plugins.ps1 -Run` copies the real cabinet model and `VPinballX.ini` into a sandbox (`tmp\demo-plugins`), creates a shared `pinmame` folder there and simulates a ZeDMD (`CYBERPINBALL_USB_DEVICES=<file.json>`, in the format of the `usb` field of `npm run probe -- --json`). It syncs, turns B2SLegacy back on by hand, syncs again (change and finding reported), restores Cyber Pinball's values, then goes through the settings screen; captures in `tmp\captures\plugins`.
- **PuP-Packs**: `.\docs\demo-pup.ps1 -Run` builds dummy packs (options in `PuP-Pack_Options`, one `.bat` per option, one of them unreadable, macOS leftovers, an extra folder) and two dummy tables whose script is pre-recorded in the cache (VPX is never run on these files), then replays choosing the option, the plan, the installation and the check, and the media doctor on a table with a badly organized pack ("Tout réparer" (Repair all), then the option). A second sandbox replays adding on a simulated two-screen cabinet: the option is picked automatically. Captures in `tmp\captures\pup` and `tmp\captures\pup-deux-ecrans`.

- **ROM library**: `.\docs\demo-roms.ps1 -Run` prepares a sandbox (`tmp\demo-roms`) of nine dummy tables with their script pre-recorded in the cache, with their ROMs copied as before the library existed (the real `t2_l8` from the test table, three identical copies and another, older version; other ROMs of realistic size), an unused ROM in the library and a missing ROM in the import folder. It replays the global view, the organization plan (choosing the version to keep, then back to the most recent one), the organization and its report, sending an unused ROM to the recycle bin, then adding the missing ROM; captures in `tmp\captures\roms`, space taken by the ROMs measured before and after in the terminal.

- **Project page screenshots**: `.\docs\demo-captures.ps1` rebuilds the images in `docs\images\en` and `docs\imagesr` (README.md and README.fr.md). Made-up tables (no third-party artwork, no real game name): the playfield, backglass and topper of the three main games come from `docs\demo-captures-medias` (original illustrations generated once with Codex), and the wheel logos (a medallion with a metal bezel, the backglass art and a title that overflows it) and other media are drawn by `docs\demo-captures.cjs`, the simulated `borne` cabinet, the cabinet model from `demo-medias.cjs modele`, and a next version announced by a local site whose feed is signed with a test key (`CYBERPINBALL_MAJ_CLE`). For each language (`CYBERPINBALL_LANGUE`): table menu, game page, system menu and an available update; the wizard's "Screens and roles" step; VPX settings (VPinballX.ini read from a `subst` drive, for a short path). Then everything is assembled as WebP (`demo-captures.cjs --planche`): the playfield lying flat is turned upright, the whole cabinet is laid out screen by screen. The layout guard and the off-screen watch must stay silent. `-Langues en`, `-Etapes menu, images` redo only part of it.
- **Menu moments**: `.\docs\demo-moments.ps1` builds a sandbox of tables with generated media (`docs\demo-moments.cjs`: images, WebM videos some of which have a sound track, music and launch sounds in WAV, a `.directb2s`, a game volume at 50%), then replays the real menu off-screen, on the hidden desktop, with the real cabinet model (backglass output: the machine's first active output). Scenarios `navigation` (each game's music, relative volume, sound of the playfield video, "Médias, son et attente" (Media, sound and attract mode) screen), `silence` (default settings: nothing plays) `partie` (three simulated games, `CYBERPINBALL_PARTIE_SIMULEE=backglass`: loading video and launch sound, fallback loading screen with a very long title, portrait loading video with sound; during play, occupied backglass frozen, topper animated, silence; return to the menu and its music) `pivotee` (the same game, menu rotated with `CYBERPINBALL_FLIPPERS=left` and DMD as a strip under the backglass, then attract mode rotated) and `attente` (attract mode after 5 s, one table every 3 s at reduced volume; a flipper, Start then Exit leave it without changing the selection or opening anything). The sound and media layers expected on each screen at each step are compared with the `son.txt` record. Windows muted; the layout guard must stay silent; captures in `tmp\captures\moments\<scénario>`. The script fails otherwise. Before that, the layout guard runs its reference cases.
- **Game media, the whole milestone**: `.\docs\demo-medias.ps1` (typical cabinet, then a two-screen machine; navigation, flyers and rules, "Médias du jeu" (Game media), loading, play, attract mode; empty screens, layout and fallbacks checked): see "Game media", "Unattended proofs". Also in `.\docs\demos-hors-ecran.ps1`.
- **Media of one game**: `npm run build`, then `npx electron docs\demo-medias-fiche.cjs`. Entirely off-screen (windows never shown, `offscreen` rendering): generates one sandbox per screen in `tmp\demo-medias-fiche` (images, WebM videos, sound, `.directb2s`, cabinet default, import folder), then goes through the details screen, the overview, the playfield and its half-turn, the rules pages (moving, adding), replacing the logo and the backglass from the import folder, the display and its fallback, a drop on the overview, the volume, the plan and saving, a table without media (backglass taken from the `.directb2s`), dropping a file organized Popper-style, and "Quitter sans enregistrer ?" (Quit without saving?). Three screens: landscape 1920 × 1080, the same lying flat (menu rotated by a quarter turn) and portrait 1080 × 1920. Captures and layout check in `tmp\demo-medias-fiche\captures`, resulting files in `resultat.txt`.
- **Media from VPinMediaDB**: `.\docs\demo-vpinmediadb.ps1` (Internet connection required: it is the real repository). On the hidden desktop, entirely off-screen (`docs\demo-vpinmediadb.cjs`, windows never shown): sandbox `tmp\demo-vpinmediadb` of three tables (Terminator 2 with its `VPSId` and a user logo, Medieval Madness without a `VPSId`, an unknown table), in landscape and in portrait. Walkthrough: first-use warning, plan with previews, logo replaced, playfield as a video or as a 4k image, progress, media details with its source, then the system menu's "Médias manquants" (Missing media) (details of a table, download, second search with nothing to do). Captures, the `resultat.txt` record (files organized, recycle bin, `.info` sources) and the layout guard in `tmp\demo-vpinmediadb\captures`. Thumbnails of H.264 videos stay black in these captures: their frames are decoded by the graphics card and do not appear in an off-screen rendering; on screen, they are displayed.
- **Adjusting the display during a game**: it has no unattended demonstration, since everything happens inside VPX (`-PovEdit`); manual tests 86 to 90.
- **VPX settings**: `CYBERPINBALL_AUTOPILOT` and `CYBERPINBALL_CAPTURE` also work with `--reglages`. The launcher's "demo-reglages" action: copies the real VPinballX.ini into a sandbox, changes one general setting and two settings of a table, keeps the captures in `tmp\demo-reglages`.

- **Installer**: in a sandbox (`CYBERPINBALL_HOME` set), the installer puts `root.json` and the shortcuts (`Menu Démarrer`, `Bureau`, `Démarrage`) in that folder and writes nothing to the registry. In silent mode, `/D=` is mandatory there (failing that, only the root remembered in that sandbox is accepted): never a fallback to the real root. The uninstaller reads this choice back from `installation.ini`. Installation, first launch (`--user-data-dir` also keeps Chromium's data in `tmp\`), then uninstallation:

  ```powershell
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"
  Start-Process release\CyberPinball-Setup-complet.exe -ArgumentList '/S', "/D=$PWD\tmp\essai\racine" -Wait
  $env:CYBERPINBALL_AUTOPILOT = 'wait:500'; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  Start-Process tmp\essai\racine\app\CyberPinball.exe -ArgumentList "--user-data-dir=$PWD\tmp\essai\electron" -Wait
  Start-Process 'tmp\essai\racine\app\Désinstaller Cyber Pinball.exe' -ArgumentList '/S'
  ```

## Known limitations of the prototype

- Application startup: between its launch and its first black covers (about 1 to 2 s), the desktop stays visible; no window can exist any earlier. If the application is force-stopped in the middle of a game, it leaves the taskbars hidden until its next startup (or until Explorer restarts). A full-screen window shown for the first time is light-colored for a few tens of milliseconds before its first frame (measured: about 45 ms); on a menu ↔ wizard relaunch, this flash may be visible. Making it appear transparent and then opaque (`setOpacity`) was tried and removed: while transparent, it is not painted, and the flash comes back when it turns opaque, at startup on all four screens. A screen that is plugged back in or wakes up while the menu is running (monitors put to sleep by the Windows lock screen, renumbered on wake-up) gets its black cover again, but the menu windows do not follow this change yet: the screen guard reports the uncovered or badly covered screen in the console, and restarting Cyber Pinball puts everything back in place.
- VPX 10.8.1 keys (`Player`, `Backglass`, `ScoreView`, `Topper` windows, `[Plugin.<id>] Enable`, priorities and settings of the B2S, PUP and DMDUtil plugins). The format of screen names and the plugins to enable change with the VPX version: they are described per version in the manifest (`adapterSettings`).
- VPX log for diagnostics: `%APPDATA%\VPinballX\10.8\vpinball.log` ("The selected display … is not available" lines).
- Executable and installers unsigned as long as no certificate is provided (configuration ready, see [Code signing](#code-signing)): SmartScreen warns when the installer is launched.
- Updates on request only (system menu, see [Updating from the cabinet](#updating-from-the-cabinet)): no background check. During installation (about a minute), the Windows desktop and the installer's progress page are visible on the main screen. Rolling back to the previous version when the installer fails has not yet been triggered in a test.
- VPX locates screens in logical coordinates: with Windows scaling other than 100%, the position written may not match. The wizard reports it.
- Model stored as JSON. The spec calls for SQLite.
- Cabinet configurations: per-table settings (including the framing set during a game, even though it depends on the playfield screen) are shared by all configurations. A general VPX setting changed after a configuration was created only applies to the active configuration. The selection screen, configuration management and the banner have not been captured yet (waiting for the off-screen test mode, so as not to occupy the machine's screens).
- VPX 10.8.1 plugin mode only: no `ScreenRes.txt`, `DmdDevice.ini` or `B2STableSettings.xml` yet for classic mode, no DOF.
- Zones: the stacking order of two overlapping zones and the rotation of a zone cannot be set (VPX has no setting for them). The actual rendering in VPX still has to be checked on a cabinet (manual tests 101 to 106, 144 and 145), in particular the windowed playfield of a desktop PC.
- Buttons: keyboard only. Encoders in joystick mode and gamepads are neither read by the interface nor written to `[Input]` (see "Cabinet buttons"); an encoder button that sends a key combination is not supported.
- Sound: videos and menu music still play on the Windows default output, as do COM components outside plugins (standalone VPinMAME, B2S, PinUP Player). Nothing checks yet that the default output is the backglass one.
