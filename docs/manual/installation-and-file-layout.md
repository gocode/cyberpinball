[Français](../manuel/installation-et-organisation-des-fichiers.md) · English · [Manual contents](../manual.md)

## Installation and file layout

All of Cyber Pinball lives in a **root chosen at installation** (the launcher's "Installer" (Install) action), for example `D:\CyberPinball`.
The layout is fixed: an update moves nothing.

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

- Third-party components (VPX today, other emulators later) are described in [packages/installer/components.json](../../packages/installer/components.json): version, official URL, SHA-256, and distribution mode (`automatic` if the license allows shipping them, `manual` otherwise).
  They are not in the git repository.
- An archive whose hash does not match the manifest is deleted, never installed.
  Running the installation again downloads nothing a second time.
- **VPX's Visual C++ runtime.**
  The VPX archive does not contain Microsoft's Visual C++ runtime (`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`), which `freeimage64.dll` and `SDL364.dll`, loaded when VPX starts, import, as do most of its plugins (PinMAME, DMDUtil, Serum, PUP, DOF).
  A fresh Windows does not always have it, and VPX then does not start at all (0xC0000135).
  The runtime must also be at least as recent as the tools that compiled VPX: `vcRuntime` in the manifest's `vpx` entry (14.51 for 10.8.1-5436), with `requires: ["vc-redist-x64"]`.
  The `vc-redist-x64` component (kind `runtime`) is Microsoft's official installer, at a fixed address, with its SHA-256 hash and Authenticode signature checked (`signer` field).
  Cyber Pinball reads the version of the three DLLs in System32 without running anything (`vcRuntimeReady`, [app/src/vc-runtime.ts](../../app/src/vc-runtime.ts)): at startup, a missing or too old runtime opens the message "Il manque le runtime Visual C++ à Windows" (Windows is missing the Visual C++ runtime); "Santé de la borne" (Cabinet health) marks it Blocking; installing VPX ("Installer VPX" (Install VPX), which only checks the runtime when VPX is already there) runs the installer with no window (`/install /quiet /norestart`), with Windows' approval, asked once (accepted codes: 0, 3010, 1641, 1638).
  The full installer drops it into `downloads\` next to the VPX archive, for a cabinet without Internet.
  A VPX that stops for lack of a DLL (0xC0000135, 0xC0000139, 0xC000007B) is named on the failure screen, which points to "Santé de la borne" (`vpxMissingLibrary`, [packages/core/src/vpxfailure.ts](../../packages/core/src/vpxfailure.ts)).
  For a new VPX version: when it is installed, Cyber Pinball reads the DLLs its files import (`vpxRuntimeNeeds`, [packages/core/src/vc-runtime.ts](../../packages/core/src/vc-runtime.ts)) and logs a runtime newer than `vcRuntime`, or any other redistributable library missing from a fresh Windows (legacy DirectX, OpenAL…); `vc-runtime.test.ts` checks the same on the machine's installed VPX (or `CYBERPINBALL_VPX_DIR`), and that the manifest's Microsoft installer is recent enough.
- **Checked VPX files.**
  The manifest gives the size of every executable and library in the VPX archive (`files`, read by `scripts/composant-fichiers.mjs`); at each cabinet health and tech sheet reading, and after VPX stopped while starting, Cyber Pinball compares the installed folder with that list (`checkComponentFiles`, [packages/installer/src/component-files.ts](../../packages/installer/src/component-files.ts); `app/src/vpx-integrity.ts`), with a simple `stat`.
  A changed or missing file, most often because another VPX was copied over it, is named with its version in "Santé de la borne" (Cabinet health) ("VPX 10.8.1-5436 : 1 fichier modifié hors de Cyber Pinball" (1 file changed outside Cyber Pinball), "SDL364.dll 3.2.18.0 : VPX peut s'arrêter dès son démarrage, sur toutes les tables" (VPX may stop as soon as it starts, on every table)) and in the tech sheet ("Logiciels" (Software) block).
  "Remettre les fichiers d'origine" (Put the original files back) takes them from the verified VPX archive (downloaded if it is no longer in `downloads\`, SHA-256 checked), extracts only those files and puts them back one by one, leaving the rest of the folder alone (settings, Cyber Pinball's plugins, `VPReg.stg`).
  Another VPX executable put next to Cyber Pinball's is neither removed nor launched: the launcher always takes the executable named by the manifest (`findExecutable`, `Component.executable`), and the log reports it.
  Tests: `vpx-fichiers-modifies.test.ts`.
- The root is refused in Program Files, in Windows and on a network share.
  The choice is stored in `%APPDATA%\CyberPinball\root.json`.
- Before a root is chosen, everything is written to a sandbox (`%APPDATA%\CyberPinball\sandbox\`).
  It is taken over automatically during installation.
- Before each write of `VPinballX.ini`, the previous version is backed up to `data\backups\` (10 versions kept).
  Only the keys owned by Cyber Pinball are modified.
- An owned key changed by hand (or through VPX's in-game menu) is never silently overwritten: `data\vpx-owned.json` keeps the values last written to each `VPinballX.ini` (one set of values per cabinet configuration), and at startup the menu asks whether to keep the new value or restore Cyber Pinball's (`npm run sync -- --reecrire` on the command line).
  Keeping a screen size imports it back into the cabinet model; keeping any other key leaves it to the user (`vpxManual` in `cabinet.json`, editable in the VPX settings) until the next run of the screen wizard, which takes back control of all keys.
  A number rewritten by VPX with different decimals does not count as a change.
- **Folder copies**: a single function, `copyTree` ([packages/core/src/copytree.ts](../../packages/core/src/copytree.ts)), for adding tables, moves from one disk to another, the light update, installation and packaging.
  On Windows, Node 22's `fs.cpSync` (22.23.2) wrote an accented destination into a ghost folder ("pupvideos (désactivés)" became "pupvideos (dÃ©sactivÃ©s)", even when the right folder existed) and killed the process outright (code 0xC0000409, no catchable error) as soon as the source or a parent folder had an accent: a table called "Été", an accented Windows profile.
  The application itself runs in Electron 44 (Node 24), which does not have this defect; the tests, `fabriquer.mjs` and the command-line tools run under Node 22.
  `copyTree` only uses `mkdirSync` and `copyFileSync`, which are sound everywhere.
  `copie-sure.test.ts` refuses any `fs.cpSync` in the sources and copies from and to accented folders.
  What the old defect left behind, the table diagnosis recognises by its name (`folderMangled`, `unmangledName`) and offers to move under its real name; a file already present under the real name goes to the trash, replaced by the newer copy.
- Variables for testing: `CYBERPINBALL_ROOT` (another root), `CYBERPINBALL_HOME` (isolated sandbox), `CYBERPINBALL_VPX_INI` (another file).

On the command line: `node packages/installer/dist/cli.js setup <racine>`, `install [id]`, `status`.

### Windows installer

`npm run installeur` builds the executable, then two French-language NSIS installers in `release\`:

| File | Size | VPX |
| --- | --- | --- |
| `CyberPinball-Setup.exe` (light) | 111 MiB | downloaded on first launch (173 MB), verified by SHA-256 |
| `CyberPinball-Setup-complet.exe` | 276 MiB | official archive included, placed in `downloads\`: installed on first launch, no connection needed |

What the installer does:
- **Language** before anything else, French or English, in a small window written in both languages.
  Preselected: the language already chosen in Cyber Pinball in this root (`<root>\data\language.json`), otherwise the Windows language if it is French, English otherwise, like the application.
  The whole installer follows it (pages, messages, terms, uninstaller), and it becomes Cyber Pinball's language: the choice is written to `<root>\data\language.json`, in the application's format (see [Interface language](interface-language.md#interface-language)).
  No window during an update (`/MAJ`) or a silent install (`/S`): nothing is written, the application keeps its language.
  The uninstaller uses Cyber Pinball's language on the cabinet.
  Texts: [scripts/installeur/langues.nsh](../../scripts/installeur/langues.nsh), both languages side by side; [installeur-langues.test.ts](../../packages/core/src/test/installeur-langues.test.ts) checks that every text the script displays has its two translations there, with the same variables, and that no French text is left hard-coded in `cyberpinball.nsi`.
- **Terms of use** first, after the welcome page: the text of [packages/core/src/terms.ts](../../packages/core/src/terms.ts), written in both languages at every build and shown in the chosen language, to be accepted to carry on (see [Terms of use](terms-of-use.md#terms-of-use)).
  "I accept" writes `<root>\data\conditions.json`; an update (`/MAJ`) or a silent install (`/S`) does not show the page, and the application then shows the text itself.
- **Root folder** of your choice.
  Suggested: the one from the previous installation, otherwise the root stored in `root.json`, otherwise `D:\CyberPinball` if `D:` is a local disk, otherwise `C:\CyberPinball`.
  Same refusals as `packages/installer`: Program Files, Windows, network folder (mapped network drives included), plus a missing drive or an incomplete path.
  An `app\` folder that does not contain Cyber Pinball is refused too.
- The application goes into `<racine>\app\` (replaced entirely at each update), the root layout is created and the root is stored in `%APPDATA%\CyberPinball\root.json`.
- Data from before a root was chosen (`%APPDATA%\CyberPinball`: cabinet model, backups, `sandbox\VPinballX.ini`) is taken over as `setup` does it, never overwriting the root's own data.
- Shortcuts: `Cyber Pinball.lnk` at the root and in the Start menu; on the desktop (checked by default); optionally at Windows startup, for a dedicated cabinet (the session's Startup folder).
- **Microsoft Visual C++ runtime**, if Windows lacks it: section "Microsoft Visual C++ runtime, for VPX (if missing)", always checked.
  VPX does not start without it, and neither does its SDL library, which reads the buttons and plunger of a Pinscape or of an encoder in gamepad mode: it must be there before the first wizard.
  Installing it asks for Windows' consent (UAC), which the cabinet buttons cannot answer; the installer therefore does it while the user has the mouse in hand.
  Cyber Pinball itself does it, started in Node mode (`ELECTRON_RUN_AS_NODE`, [app/src/runtime-vc.ts](../../app/src/runtime-vc.ts)), through the same function as the menu (`ensureVcRuntime`): verified download, or the file already placed in `downloads\` by the full installer, Microsoft signature checked.
  Nothing is asked if the runtime is already enough.
  Never during an update (`/MAJ`), a silent install (`/S`) or in a sandbox: the menu then offers it at startup.
  Node mode is never passed on to "Launch Cyber Pinball" on the last page.
- Per-user installation, without administrator rights, with an entry in "Programmes et fonctionnalités" (Programs and Features) (`HKCU`).
- If Cyber Pinball is open, the installer and the uninstaller ask you to close it.
- Command line: `/S` silent, `/DEMARRAGE` launch at Windows startup, `/SANSBUREAU` no desktop shortcut, `/LANGUE=fr` or `/LANGUE=en` language of the installer and of Cyber Pinball (written like the window's choice, which is not shown), `/D=D:\Borne` root (last, without quotes).
  Exit code 2 if the root is refused.

**Uninstalling removes the application only**: the `app\` folder, the shortcuts and the "Programmes et fonctionnalités" entry.
Tables, media, configuration, data (cabinet model, backups), emulators, downloads, `import\` and `root.json` stay: a reinstallation into the same root finds them as they were.
To erase everything, delete the root by hand.
The uninstaller (`app\Désinstaller Cyber Pinball.exe`, `/S` for silent mode) refuses to run outside an `app\` folder that contains `CyberPinball.exe` and the `installation.ini` log.

**VPX license and the full version.**
Most of VPX's files are under GPLv3+; the rest keeps a license derived from MAME's (`docs\license.txt` in the archive), which allows redistribution on three conditions: do not sell it or use it in a commercial product or activity, provide the sources of any modified version, reproduce the license.
The full version embeds the unchanged official archive (hash checked against the manifest at build time) and, next to it, `<archive>.licence.txt`: the full license text read from the archive itself, the archive's address and the commit of its sources.
It can therefore be redistributed free of charge, but **must never be sold, nor shipped with a cabinet that is sold or operated commercially**.
The build stops if the license found in the archive changes.
The archive is taken from `CYBERPINBALL_VPX_ARCHIVE` if that variable is set, otherwise from `cache\downloads\` (downloaded if needed).

The NSIS script is [scripts/installeur/cyberpinball.nsi](../../scripts/installeur/cyberpinball.nsi), compiled by [scripts/installeur.mjs](../../scripts/installeur.mjs) with the NSIS 3 that electron-builder downloads (hash verified).
The icon is drawn in [app/renderer/icone.svg](../../app/renderer/icone.svg), which also serves as the logo of the drawn topper; `node scripts/icone.mjs` renders it off-screen at each size of the `.ico` and derives the welcome-page banner from it (into `app\ressources\`).
In the executable, koffi is reduced to the JavaScript loaded at run time and the `win32-x64` binary.

### Code signing

Nothing is signed without a certificate: the build carries on without asking anything.
With a code signing certificate (Authenticode), `CyberPinball.exe`, the uninstaller and both installers are signed and timestamped by `signtool` (the uninstaller is written and signed before being embedded).
The certificate is designated through environment variables, never in the repository ([scripts/signature.mjs](../../scripts/signature.mjs)):

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

An installed cabinet updates itself from the system menu, entry **"Mise à jour de Cyber Pinball" (Cyber Pinball update)** (details: installed version, and available version once checked).
Nothing is installed on its own: a quiet check runs right at start-up, then every 6 hours while Cyber Pinball keeps running (every 5 minutes while it fails, for instance when the network is not ready yet as the cabinet boots), without downloading anything or showing anything if it fails; an error from a manual check does not stop it; an available version, or an update that did not go through (found on restart, until the entry is opened), puts a **red dot** on the menu's gear (⚙) and on the "Mise à jour de Cyber Pinball" (Cyber Pinball update) entry of the system menu (`attention` on system menu entries, carried by the gear as soon as one entry has it).
Once opened, the entry shows straight away the release notes of every version missed since the cabinet's own (the feed's `history`), and "Mettre à jour maintenant" (Update now), selected by default: installing takes one button press.
A result older than 10 minutes is checked again.
Off-screen, tests only check their own test site (`CYBERPINBALL_MAJ_URL`), never GitHub.
Code: [packages/core/src/update.ts](../../packages/core/src/update.ts) (feed, versions, download), [app/src/updates-menu.ts](../../app/src/updates-menu.ts) (screen).

- **Where**: the releases of the public repository [github.com/gocode/cyberpinball](https://github.com/gocode/cyberpinball).
  The cabinet reads `https://github.com/gocode/cyberpinball/releases/latest/download/cyberpinball-maj.json` (a GitHub redirect, free of its API's rate limit; pre-releases are not listed there).
  The repository is written in a single place (`UPDATE_REPOSITORY`), equal to `repository` in `package.json` (checked by the tests); the installer derives from it the website shown in "Programmes et fonctionnalités" (Programs and Features).
- **Signed feed**: `cyberpinball-maj.json` contains the manifest (version, date, release notes in French and, when `CHANGELOG.en.md` has the version's section, in English (`notesByLanguage.en`): the cabinet shows those in its language, otherwise the French ones; light installer: release address, size, SHA-256) and its Ed25519 signature.
  The cabinet only reads a feed signed by the publishing key, whose public half ships with the application ([update-key.ts](../../packages/core/src/update-key.ts)): a compromised GitHub account is not enough to get a program installed on the cabinets.
  The downloaded installer (`<racine>\downloads\cyberpinball\CyberPinball-Setup-<version>.exe`, previous ones are deleted) is verified (size and SHA-256 from the signed feed) before it is launched; a bad file is deleted.
- **Screens**: checking; "à jour" (up to date: latest published version and its date); "Cyber Pinball x.y.z est disponible" (Cyber Pinball x.y.z is available), with release notes, size and verification, plus "Mettre à jour maintenant" and "Plus tard" (Later); download (MiB received, percentage, "Annuler" (Cancel)); "Installation"; "Mise à jour impossible" (Update failed: no network, no published version, signature or hash refused) with "Réessayer" (Retry).
  When run from the sources (`npm start`), the check works but installation is not offered.
- **Installation**: the usual installer, in `/MAJ /D=<racine>` mode (plus `/S` off-screen).
  Only its progress page is shown; it waits for Cyber Pinball to close (up to 60 s), keeps the shortcuts chosen at the previous installation (desktop, Windows startup, read from `app\installation.ini`; for a cabinet deployed with `npm run deployer`, which has none, the ones that exist), is started from the download folder (a working directory inside `app\`, the one the cabinet shortcut uses, would prevent renaming it), renames the old `app\` to `app.precedente` for the duration of the install (retried for 10 s; if it is still held, nothing changes and Cyber Pinball restarts, no click needed) (put back if it fails, deleted if it succeeds), then restarts Cyber Pinball with its previous arguments (`CYBERPINBALL_MAJ_ARGS`).
  Tables, media, configuration and data are not touched, as with any reinstallation.
- **Light update**: each release also attaches `CyberPinball-application.zip` (1.5 MiB), the contents of `app\resources\app` alone: the JavaScript, the interface, koffi.
  A cabinet whose **base** matches the package's takes it instead of the installer.
  The base (`cyberpinball.socle` in the application's `package.json`, for instance `electron-44.5.1-842034390a0b`) sums up everything around `resources\app` that only the installer changes: Electron and electron-builder versions, the executable's configuration and icon ([scripts/fabriquer.mjs](../../scripts/fabriquer.mjs)).
  The package is verified like the installer (size and SHA-256 from the signed feed), unpacked in `downloads\cyberpinball\application-<version>\` and refused if it does not hold the announced version and base; Cyber Pinball then starts the new version's `maj-legere.js` through its own executable in Node mode (`ELECTRON_RUN_AS_NODE`), and closes.
  The script ([app/src/maj-legere.ts](../../app/src/maj-legere.ts)) waits for it to close, renames `resources\app` to `resources\app.precedente` (retried for 10 s), puts the new one in its place (the old one restored if that fails, deleted otherwise; at the next startup if a Chromium process still closing holds one of its files), writes the version in "Programmes et fonctionnalités" (Programs and Features) if the installation is the one registered there, then restarts Cyber Pinball with its previous arguments; log in `downloads\cyberpinball\maj-legere.txt`.
  A few seconds, with no installer and no window.
  A version from before light updates (no base), or with another base, goes through the installer.
- **Quick release** (`publier.mjs --rapide`): only the application is built (no electron-builder, in seconds) and published with its feed; the installers are not rebuilt.
  The feed points to those of the last full release (`installer.version`): a cabinet with another base first installs that version, then is offered the light update on restart ("Installeur de la x.y.z, puis la mise à jour légère vers …" (Installer for x.y.z, then the light update to …)).
  A quick release is refused if the built base no longer matches the last published feed (Electron updated, icon changed…): a full release is needed then.
  A feed with no light package, or an installer that brings nothing newer than the installed version, offers nothing impossible: the screen says so, with no "Mettre à jour maintenant" (Update now) button.
- **Versions received**: the "Versions reçues : …" (Versions received: …) entry of the update screens opens the choice of source, with the cursor on the one followed: **Versions finales** (Final versions, the default), **Préversions** (Pre-releases), and **Essais privés** (Private tests) on a computer that has a test channel (below).
  The choice is kept in `<données>\preversions.json` (`source`, and `preversions` for earlier versions), then a new search starts.
  A cabinet never goes back to an older version: after switching source, it keeps its own until the chosen source releases a newer one (the screen says so).
- **Pre-releases**: a cabinet that receives them looks for the feed of the highest-version release, pre-releases included, in the GitHub API's list of releases (no token, 60 requests per hour: plenty); an unreadable list falls back to the final releases' feed.
  The feed is still checked by its signature.
  Other cabinets never see a pre-release (`0.1.3-essai.1`, published as a "pre-release"), and the final version (`0.1.3`) goes ahead of its pre-releases.
- **Private test channel**: for whoever maintains Cyber Pinball and wants to try their versions on their own cabinets before releasing them.
  Tests are releases of a **private** GitHub repository (`publier.mjs --rapide --prive`, launcher action `publier-essai`); the code is not pushed to the public repository.
  A computer that has the file `%USERPROFILE%\.cyberpinball\canal-essai.json` (`{ "depot": "owner/name", "jeton": "github_pat_…" }`, launcher action `canal-essai`) is offered "Essais privés" (Private tests); others see nothing of it.
  The file is outside the data folder: never backed up, shared or included in the tech sheet.
  The fine-grained token only grants read access to "Contents" on that one repository; it is attached only to that repository's API addresses, and GitHub's redirect to its storage is followed without it (`channelFetch`).
  The cabinet takes the newest of the public pre-releases and the private tests; a private test is downloaded through the API (`releases/assets/<id>`) and checked like everything else against the feed's signature and SHA-256: a stolen token cannot get anything installed other than what the publisher signed.
  A refused or expired token is a displayed error ("Canal d'essai … illisible", test channel … unreadable), never a silent fallback; a removed file takes the cabinet back to public pre-releases.
  Both repositories share the numbering: `publier.mjs --prive` refuses a number already released on the public repository, accepts only a pre-release, and puts the release on the private repository's branch (which needs a first commit).
  The publishing token must then be able to write to that repository.
- **At the next startup**: `data\mise-a-jour.json`, written before the installer or the light update is launched, tells whether the expected version is running: a banner "Cyber Pinball x.y.z est installé (avant : …)" (Cyber Pinball x.y.z is installed (before: …)), or "La mise à jour vers x.y.z n'a pas abouti : la version … est restée en place" (The update to x.y.z did not complete: version … stayed in place).
  A version newer than the previous one counts as installed (a quick release's installer sets up an older version than the feed's).

#### Cheat sheet: publishing a release

Everything is done from the launcher: double-click `lanceur.cmd` (folder `D:\wamp\www\cyberpinball`), section **"Fabrication et publication sur GitHub"** (Building and publishing on GitHub), or run `.\lanceur.cmd <action>` directly.

| When | Launcher action | What it does |
| --- | --- | --- |
| Once, then when the token expires | `jeton` | Saves the GitHub token (masked input) in `%USERPROFILE%\.cyberpinball\jeton-github.txt`, outside the repository |
| Before a final release | `version` | Moves to the next version (patch, `mineure` for minor or `majeure` for major), gathers the pending release notes (`changements/`) into both CHANGELOGs, opens them in Notepad for review, checks the release notes (as many in English as in French), then commits "Version x.y.z" |
| Before publishing, if needed | `verifier` | `npm run avant-fusion` (publication check, tests, translations) and the version's release notes |
| To go live | `publier` | Both installers, the signed feed, the code snapshot on GitHub, the release, then the repository description (15 to 20 min). Cabinets see the version as soon as it ends |
| To go faster | `publier-leger` | Same with the light installer only, the one cabinets download (twice as fast) |
| After each merge | `publier-rapide` | The next pre-release, without rebuilding the installers (1 to 2 min): number taken after the highest GitHub tag, release notes from `changements/` gathered into the CHANGELOGs, "Version …" commit, then the application alone and the feed; cabinets with the same base update within seconds, the others through the installers of the last full release. Refused if Electron or the executable changed |
| To prepare a pre-release without publishing it | `preversion` | Moves to the next test pre-release (`0.1.3-essai.1`, then `-essai.2`…) based on `package.json` and commits it; `publier-rapide` puts it online (or does this step itself), only for cabinets set to "Préversions" (Pre-releases). `version` then gives the final version (`0.1.3`) |
| To try it without anyone else seeing it | `publier-essai` | The next pre-release, numbered as by `publier-rapide`, in the private repository of the test channel (1 to 2 min): only cabinets that have this channel, set to "Essais privés" (Private tests), see it; the code does not go to the public repository |
| Once per test computer or cabinet | `canal-essai` | Saves the private repository and its read token (masked input) in `%USERPROFILE%\.cyberpinball\canal-essai.json` |
| To review before everyone else | `publier-brouillon` | Draft release: invisible to cabinets until "Publish release" on GitHub |
| Code only, no version | `envoyer` | Code snapshot on `main`, without a release: cabinets see nothing |
| Repository description | `decrire` | Repository description and topics, taken from `package.json` |
| Before a delicate release | `essai-maj` | Full off-screen test: installs one version, publishes the next on a local site, updates and checks (about 15 min) |
| After changing the light update | `essai-maj-legere` | Same with a quick release: the cabinet gets the light package, with no installer (about 10 min) |
| On this cabinet, without publishing | `deployer` | Builds the application and copies it into `<racine>\app` (fast, no installer) |

Each publication asks for confirmation ("o") before sending anything, and stops without publishing if the release notes are missing, if a change is not committed in git, or if the publication check finds a secret.
The signing key (`%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`) and the token stay outside the repository, as do the secret files that `.gitignore` keeps out.

#### Publishing a release

```powershell
# 1. Release notes of each branch in changements/<branch>.md (see below); the version number is set by the publication.
# 2. Once and for all: a fine-grained GitHub token, limited to the gocode/cyberpinball repository, with
#    "Contents" and "Administration" read and write, saved on its own in this file (outside the repository):
#    %USERPROFILE%\.cyberpinball\jeton-github.txt   (or the CYBERPINBALL_GITHUB_TOKEN variable)
npm run publier                      # -- --brouillon: release left as a draft, invisible to cabinets
npm run publier -- --rapide          # without rebuilding the installers: light package and feed only
node scripts/publier.mjs --rapide --essai   # after a merge: next pre-release, number and version commit included
```

[scripts/publier.mjs](../../scripts/publier.mjs) runs the publication check, builds both installers, writes and signs the feed, reads it back with the shipped key, creates the `v<version>` release on the pushed commit (refused if there are uncommitted changes, if the commit is not on GitHub or if the release already exists), attaches `CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe`, `CyberPinball-application.zip` and `cyberpinball-maj.json` (with `--rapide`: the light package and the feed only, after reading the last published feed to reuse its installers and compare the base), publishes it, then reads the feed again the way a cabinet does.
A version with a prerelease tag (`0.2.0-essai.1`) goes out as a "pre-release": only cabinets that accept pre-releases see it; with no section of its own in the CHANGELOG, it takes the release notes of its final version (`## 0.2.0`), otherwise "Préversion d'essai de la 0.2.0" (Test pre-release of 0.2.0).
With `--essai` (or `--suivante correctif|mineure|majeure`), the publication sets the number itself: it reads the `v…` tags on GitHub (public repository and test channel repository, a single numbering), takes the version after the highest one, gathers the pending release notes under the section of its final version in both CHANGELOGs, removes their files, updates `package.json` and `package-lock.json` and commits "Version …".
A publication interrupted after this commit can be run again as is: the number, still free on GitHub, is reused.
Finally, it sets the repository description and topics, taken from `description` and `keywords` in `package.json`; `npm run decrire` sets them on their own (`-- --essai`: checks without sending anything).
For this, the token also needs the "Administration: read and write" permission.
#### Release notes of a branch

A branch never writes to `CHANGELOG.md`, `CHANGELOG.en.md` or the number in `package.json`: two branches that added their lines at the top of the same section got in each other's way at every merge.
It writes its release notes in `changements/<branch>.md`, a file of its own, with the same items in both languages:

```markdown
## Français

- Une phrase courte, pour l'utilisateur de la borne.

## English

- The same point, in English.
```

`npm test` checks each file (both sections, as many items, no item already published).
When publishing, these files are gathered into both CHANGELOGs, then removed ([scripts/version-suivante.mjs](../../scripts/version-suivante.mjs)).
A branch started before this way of working moves its CHANGELOG lines with `node scripts/decoupage.mjs --reporter`, while merging the main branch.

**Complete package, one build at a time** ([scripts/paquet-application.mjs](../../scripts/paquet-application.mjs)): `fabriquer.mjs` starts by emptying `build\`; two builds started in the same folder step on each other, and that is how pre-release 0.1.13-essai.1 went out without its code (6.2 MiB instead of 17.8).
A lock (`release\.fabrication.lock`, the process number) refuses a second build while the first one runs; `publier.mjs` holds it until the upload.
`fabriquer.mjs` checks `build\app` before packaging it, and `publier.mjs` reads the zip back before sending it: without `dist/main.js`, `dist/preload.js`, `dist/maj-legere.js`, `dist/veilleur.js`, `renderer/frontend.html`, `renderer/screen.html` or `components.json`, nothing goes out.
On the cabinet side, `unpackAppPackage` already refused such a package; it now says "le code de l’application manque dans le paquet" (the application code is missing from the package) rather than a wrong version number.

**Direct download.**
At the top of README.md and README.fr.md, the "Download" section gives `https://github.com/gocode/cyberpinball/releases/latest/download/<file>` links, which lead straight to the installer of the latest final version (GitHub never treats a pre-release as "latest"); they never change, and the version badge updates itself.
They only work if every final version carries both installers under their names (`CyberPinball-Setup.exe`, `CyberPinball-Setup-complet.exe`): `npm run publier` therefore refuses `--rapide` and `--leger` for a final version (a pre-release keeps them), refuses to upload a final version without both installers, and checks these links once the version is published.
`npm test` refuses a README without these links, or with a link pinned to a version (`releases/download/v…`).
See [scripts/telechargement-direct.mjs](../../scripts/telechargement-direct.mjs).

**Publishing key**: created once by `node scripts/cle-publication.mjs` (never replaced afterwards; `--verifier` checks that it matches the shipped key).
The private key is never in the repository: `%USERPROFILE%\.cyberpinball\cle-publication-maj.pem`, or `CYBERPINBALL_MAJ_CLE_PRIVEE`.
**Back it up off the machine**: if it were lost, installed cabinets would refuse every later update and would have to be reinstalled by hand.

**Publication check** ([scripts/audit-publication.mjs](../../scripts/audit-publication.mjs), run by `npm run avant-fusion`, by pushing and by publishing; `npm test` no longer runs it since 17/11/2026): since the repository is public, it rejects, in tracked files and in new files not yet added (nor ignored) that will leave with the next commit, private keys, tokens (GitHub, OpenAI, AWS, Slack, Google), passwords written in plain text, Windows profile paths (`C:\Users\<nom>`), e-mail addresses not on its allow list (commit co-author, font authors, examples) and the names from a private list kept outside the repository (`%USERPROFILE%\.cyberpinball\audit-noms.txt`, one per line, or `CYBERPINBALL_AUDIT_NOMS`).
`--commits <a..b>` also checks the messages and authors of those commits.

**Update in a sandbox**: `CYBERPINBALL_MAJ_URL` overrides the feed address; `CYBERPINBALL_MAJ_CLE` (PEM file) overrides the public key, only in a sandbox (`CYBERPINBALL_HOME`).
Also only in a sandbox, `CYBERPINBALL_MAJ_INSTALLEE=1` makes its root count as an installation: the screen offers "Update now" even when running from source.
