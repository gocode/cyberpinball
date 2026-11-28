[Français](../manuel/menu-systeme-cinq-rubriques.md) · English · [Manual contents](../manual.md)

<a id="system-menu-eight-sections"></a>

## System menu: nine sections

The system menu (Exit, Tab or ⚙ from the tables screen) has nine sections, in order of use: Tables, Ma borne (My cabinet), Téléchargements (Downloads), Activité récente (Recent activity), Communauté (Community), Arena, Juke-box, Aide et infos (Help and info), Quitter ou éteindre (Quit or shut down), then "Retour aux tables" (Back to tables).
Downloads, Recent activity and Juke-box open their screen directly; the other six open on their entries.
Apart from the nine-section root, no menu screen has more than eight lines, "Retour" (Back) not included: the list reads at a glance.
Each entry has a single place, and the root has no shortcut that duplicates a section.
A section's line says what it holds, never the state or the BETA badge of one of its entries: they are read once inside, on the entry they concern.
The menu opens with the cursor on the last line chosen at its root, even after a restart (kept in `<data>\menu-systeme.json`); someone who mostly opens it to shut down finds the cursor on "Quitter ou éteindre" (Quit or shut down).
Each section opens on its entries; Exit (or "Retour", Back) goes up one level, with the selection on the section being left.
A screen opened from an entry returns, through its "Retour", to the section it came from, with the selection on that entry; the gear always reopens the sections.

**The gear.**
At the top right, to the right of the player card and the pills (badges, friends, downloads), it is itself a round pill of the same size: same height, same top, same background, same border and same hover (green border and ring, never a square background), at the usual gap from the others.
On a full-screen page (System menu and its screens, My badges, help…), it follows the pills of the brand line, at the same centre as on the tables screen: it does not jump from one screen to the next.
Up to 0.1.13, it turned square on hover and sat offset from the pills.
Test: [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts).

| Section | Entries |
| --- | --- |
| Tables | All tables, Collections (see [Collections and favourites](game-media.md#collections-and-favourites)), Roue (Wheel, see [Wheel: its settings](game-media.md#wheel-its-settings)), Add a table, Find missing media (on VPinMediaDB), ROM library, Sound and attract mode, Migration (Import media, Gather ROMs) |
| Ma borne (My cabinet) | Cabinet setup (Buttons, Screens, Cabinet sound, Night mode, Langue / Language, Cabinet configurations, Full wizard: see [Setup wizard and configuration menu](setup-wizard-and-configuration-menu.md#setup-wizard-and-configuration-menu)), VPX (Presets, VPX settings, Other VPX versions, and Trial VPX on a development machine: see [Other VPX versions](other-vpx-versions.md#other-vpx-versions)), DMD and LEDs (DMD screen, Menu DMD, DMD colour, Real DMD, LED and feedback (DOF)), Virtual reality and 3D vision (Virtual reality, Align the cabinet, Headset controllers, Mirror on the playfield, VR audio output, 3D vision, 3D glasses), Phone remote, Startup and access (Dedicated cabinet, Launch at startup, Relaunch with Start: see [Relaunch with Start](relaunch-with-start.md#relaunch-with-start), Guest mode), Health and backups (Cabinet health, Tech sheet, Debug mode, Backups: see [Backups](backups.md#backups)) |
| Téléchargements (Downloads) | The downloads screen (see [Downloads and file picker](downloads-and-file-picker.md#downloads-and-file-picker)) |
| Activité récente (Recent activity) | The notifications of the last few days, in full (see [Recent activity](recent-activity.md#recent-activity)) |
| Community | Home, Messages, Players, Groups, Rooms and Profile; Community settings. See [Community](friends-the-cabinet-network.md#community-the-cabinet-network). |
| Arena | Live games, Leaderboards and Progression (My level, My badges, Game history); the medallion also opens Arena with its scores, daily tables and challenges. |
| Juke-box | The Juke-box screen, which also opens its settings (see [Juke-box settings](game-media.md#juke-box-settings)) |
| Aide et infos (Help and info) | Search, Cabinet controls, What's new (see [What's new](whats-new.md#whats-new)), Cyber Pinball update, Feedback and ideas (see [Feedback and ideas](feedback-and-ideas.md#feedback-and-ideas)), Follow us, Terms of use, Credits (see [Community credits](community-credits.md#community-credits)) |
| Quitter ou éteindre (Quit or shut down) | Windows desktop (Open Windows Explorer on a [dedicated cabinet](dedicated-cabinet.md#dedicated-cabinet)), Quit Cyber Pinball, Restart Cyber Pinball, Sleep, Restart the cabinet, Shut down the cabinet (see [Shutting down, sleeping, restarting the cabinet](shutting-down-sleeping-restarting-the-cabinet.md#shutting-down-sleeping-restarting-the-cabinet)) |

My cabinet receives what would change if Cyber Pinball were installed on another cabinet: the hardware, the screens, VPX, Windows, the cabinet's language.
"Migration" (in Tables) gathers what is only used once, when coming from another front-end: "Reprendre les médias" (Import media, from PinUP Popper or PinballX) and "Regrouper les ROM" (Gather ROMs) in the library.
A section with nothing left on this cabinet (local play, missing entries) is not shown.

**Menu système > Tables > « Toutes les tables »** (System menu > Tables > All tables): the list of every table on the cabinet, by title (manufacturer · year · version, and "Jouée 12 fois", Played 12 times, or "Jamais jouée", Never played).
Start on a table opens **its page, the same as from the wheel** (Play, Play with a friend, Edit information, Game media, Game parts, Table files, settings, diagnosis, removal…); its "Retour à la liste des tables" (Back to the table list, or Exit) goes back to the list, on that table, and every screen opened from the page comes back to it as usual.
"Jouer" (Play) launches the game, then goes back to the table menu, the wheel on that table.
A table removed from the list goes back to it.
Code: `openAllTables` and `sheetReturn` in `app/src/library.ts`.

An entry's red dot (received files to install, update available, DMD screen to check, recovery code to write down…) goes up to its section, then to the gear; when a section opens, the selection goes to the first one that carries one (at the root, to the last line chosen, if there is one).

The tree (sections, order, name and icon of each entry) is in [packages/core/src/systemmenu.ts](../../packages/core/src/systemmenu.ts) (`SYSTEM_ROOT_ENTRIES`, `SYSTEM_GROUPS`, `SYSTEM_ITEMS`); the memory of the last line chosen, in [packages/core/src/systemmemory.ts](../../packages/core/src/systemmemory.ts).
The application provides what each entry does through its identifier (`library.provideSystemItem`, `app/src/library.ts` and `frontend.ts`); a new entry is placed by adding its identifier to a section, without touching the others.
[systemmenu.test.ts](../../packages/core/src/test/systemmenu.test.ts) pins the invariants: at most eight lines per screen (`MAX_SYSTEM_ENTRIES`), each entry placed once, one icon per entry within a section (and not the section's own), every entry provided by the application, and **every "System menu > …" path** written in this manual, its translation, the manual tests, the READMEs and the interface texts names entries that exist, in that order.
Demonstrations name an entry (`action:…`): from the system menu, the autopilot finds it in its section.

**Searching the System menu** (System menu > Help and info > "Rechercher" (Search), `systemsearch.ts`).
Type a letter (on-screen keyboard, real keyboard or phone): the settings, sections and keywords that match appear at each letter.
A result opens its screen, with the cursor on the setting.
The Back button of a screen opened after typing on the on-screen keyboard leads to the screen before the typing, no longer to the keyboard.

**Debug mode** (System menu > My cabinet > Health and backups > "Mode débogage" (Debug mode)).
It shows live, in a corner of the screen of your choice (the backglass by default, otherwise the DMD, otherwise the playfield), the measurements of all your screens: frame rate of each front-end window, frame rate of VPX in a game over the last minute, stutters and their likely cause, media loading times and launch steps, processor, memory, graphics card.
A compact line or a detailed panel; on the DMD, a strip readable from afar.
It does not get in the way of the game: the window is transparent, never takes focus or clicks, does not appear in recordings and never opens in the headset; on the playfield, the panel is reduced so it does not hide the table.
When off, nothing runs.
"Joindre aux rapports" (Attach to reports), on the same screen, adds the last 10 minutes of measurements to the technical report (`debogage.json` file, with no path or account name).
The VPX DMD plugin only reports its frame rate every second if Cyber Pinball asks it to, at the next build of the plugin.
With debug mode on, "Bureau Windows" (Windows desktop, Ctrl+Shift+D) works as usual: its window steps back to the desktop instead of immediately bringing the front-end back.

**Automatic update at launch** (System menu > Help and info > "Mise à jour de Cyber Pinball" (Cyber Pinball update)).
An "Mise à jour automatique au lancement" (Automatic update at launch) box, ticked by default: at startup, a newer version downloads and installs itself, never during a game, and without a new try if the previous one did not complete.
"Annuler" (Cancel) during the download puts it off until later; unticking the box goes back to the simple red dot.
A light update started after a relaunch by Start no longer closes the application without installing anything: stopping the Start relaunch watcher no longer touches the application that asks for it, nor the installer; after an interrupted update, the log says "Mise à jour interrompue" (Update interrupted) and the screens get their original orientation back.
After a light update, Cyber Pinball no longer stays frozen for a minute at launch: the old version steps aside without blocking anything, and the watcher left on the old version is stopped then relaunched from the new one.

**Virtual reality and 3D vision: what is new in 0.2.4** (System menu > My cabinet > Virtual reality and 3D vision).
- **Pimax headsets** (Pimax OpenXR runtime): they now start; if the runtime refuses something, the error is written in the headset log instead of a silent relaunch loop every 2 seconds.
  If the headset companion stops right after starting while you have not put the headset on, Cyber Pinball waits longer and longer before trying again (up to 5 minutes).
- **Headset unplugged or removed** with virtual reality on: Cyber Pinball no longer looks for it during a game on the screens (those tries, every 15 seconds, made VPX drop frames).
- **NVIDIA 3D Vision active glasses (beta)**: "Lunettes 3D" (3D glasses) > "Lunettes" (Glasses) switches from colour-filter glasses to active glasses.
  Each eye sees the table at full resolution, the backglass and the DMD stay flat.
  You need a GeForce card, NVIDIA driver 452.06 at most with 3D enabled, the emitter, and the playfield as the main screen; a mode beyond what the emitter synchronises (about 2560x1440 at 120 Hz, and 100 Hz at least) is flagged, but a 4K playfield is no longer wrongly declared out of reach.
  The screen checks each of these points (driver and version, 3D enabled, emitter plugged in, main screen, VPX version, playfield screen found by its name) and gives the way forward for what is missing; cabinet health flags it too.
  As long as something is missing, games are played flat; what could not be checked is flagged, and the game tries 3D anyway.
  After each game, the screen tells you whether 3D really switched on.
  Cyber Pinball itself turns on the driver's stereoscopic 3D before each relief game and turns it off afterwards: you no longer need to tick it in the NVIDIA Control Panel.
  Any other game (flat, in the headset, with another VPX) is launched with the driver's 3D off, because on it made elements of the tables disappear.
  When 3D Fix Manager is open, it prevents 3D from being turned on ("Enable 3D" button): the screen and the game say so ("3D Fix Manager bloque la 3D : ferme-le", shown over the game); Cyber Pinball tries again at each game, so closing 3D Fix Manager is enough, without relaunching Cyber Pinball.
  Cyber Pinball no longer stays frozen on the first frame of the opening when the driver's 3D is on (NVIDIA Control Panel or "Enable 3D"): it turns it off at launch, before opening its windows, and turns it back on for each relief game; if a program puts it back at once, it is noted in the incident log with the way forward.
  Reading the driver no longer freezes the front-end at launch (about 5 s), nor at Cabinet health and when launching a relief game; a second launch of Cyber Pinball, already open, no longer turns off the 3D of a relief game in progress.
  Corrected VPX, series 7: the direct mode of NVIDIA 3D Vision (Direct3D 11, exclusive full screen on the playfield, each eye presented to the driver); on failure, the game goes on with the two views side by side, and the VPX log says why.

**A screen is built without reading the disk.**
A screen is rebuilt several times on every key press (the key itself, the view, the phone), and the next key waits: whatever reads the disk in proportion to the number of files (an estimate, a list of backups, comparing a plan) is done when the screen opens, under a waiting message (`library.task`), and the result is kept until the next known change (a copy finished, a drive plugged in).
A build taking more than `SLOW_BUILD_MS` (40 ms) is reported once in the log with the screen's name ("Écran « … » lent à construire", screen slow to build).
On 14/11/2026, "Sauvegarder maintenant" (Back up now) re-read the hash cache and looked for every file on the USB key, for each level, on every flipper press: presses were lost.
[sauvegardes-menu.test.ts](../../packages/core/src/test/sauvegardes-menu.test.ts) counts the disk reads of screens rebuilt on a cabinet full of files.

**Reads kept per screen (`kept`).**
Since 17/11/2026 the rule holds for every table-management screen, with no screen left out: whatever a build reads from disk goes through `kept(key, read)` (library.ts; modules receive it: game media, game parts, Leaderboards).
A screen's first build, when it opens, reads and keeps; the following builds, those of the key presses, reuse what was kept.
The screen reads everything again after an action that leaves it on display (a deletion, a setting written), at the end of a long operation (`task`), and when the application says the disk changed (`library.changed()`: folder watcher, download finished, rules found, scores read).
Only rebuilds are timed; an opening longer than `SLOW_OPENING_MS` (500 ms) is reported separately ("Écran « … » long à ouvrir", screen slow to open).
In off-screen tests, a watcher (build-guard.ts) counts every read made while rebuilding a screen, however small, and logs it with the function and the name of the first file read ("Écran « … » lit le disque en se construisant : statSync ×6947", screen reads the disk while building).
The original finding: the sheet of a table with a PuP-Pack scanned its thousands of files on every flipper press (700 ms), "Ajouter une table" (Add a table) walked the import folder and the downloads (595 ms).
Date and number formatters are also kept per language (i18n.ts): creating one per row cost 700 ms for a list of 460 downloads.
[ecrans-rapides.test.ts](../../packages/core/src/test/ecrans-rapides.test.ts) walks the screens on a loaded cabinet (300 tables, a 3,000-file PuP-Pack, hundreds of downloads) and requires zero reads and under 40 ms per rebuild.
