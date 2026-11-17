[Français](../manuel/menu-systeme-cinq-rubriques.md) · English · [Manual contents](../manual.md)

## System menu: five sections

The system menu (Exit, Tab or ⚙ from the table menu) shows only five sections, then "Retour aux tables" (Back to tables).
Each section opens on its entries; Exit (or "Retour", Back) goes up one level, with the selection on the section being left.
A screen opened from an entry returns, through its "Retour", to the section it came from, with the selection on that entry; the gear always reopens the sections.

**The gear.**
At the top right, to the right of the player card and the pills (badges, friends, downloads), it is itself a round pill of the same size: same height, same top, same background, same border and same hover (green border and ring, never a square background), at the usual gap from the others.
On a full-screen page (System menu and its screens, My badges, help…), it follows the pills of the brand line, at the same centre as on the tables screen: it does not jump from one screen to the next.
Up to 0.1.13, it turned square on hover and sat offset from the pills.
Test: [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts).

| Section | Entries |
| --- | --- |
| Tables | All tables, Collections, Roue (Wheel, see [Wheel: its settings](game-media.md#wheel-its-settings)), Add a table, Downloads, ROM library |
| Médias (Media) | Find missing media (on VPinMediaDB); Media, sound and attract mode |
| Amis (Friends) | Players online, Messages, My friends, My avatar, My public profile, Game history, Find a player, Friend requests, My badges, Community settings, Sharing and network, Friends' scores during the game, Hide notifications during games (see [Friends: the cabinet network](friends-the-cabinet-network.md#friends-the-cabinet-network)) |
| Borne (Cabinet) | Cabinet health, Tech sheet, Cabinet setup, VPX settings, Cabinet controls, DMD (DMD screen, Menu DMD, DMD colour, Real DMD), Windows desktop (Open Windows Explorer on a [dedicated cabinet](dedicated-cabinet.md#dedicated-cabinet)), Dedicated cabinet, Relaunch with Start (see [Relaunch with Start](relaunch-with-start.md#relaunch-with-start)), Guest mode |
| Cyber Pinball | Langue / Language, Cyber Pinball update, Recent activity (see [Recent activity](recent-activity.md#recent-activity)), Backups (see [Backups](backups.md#backups)), Migration, Quit Cyber Pinball, Restart Cyber Pinball, Sleep, Restart the cabinet, Shut down the cabinet |

"Migration" (in Cyber Pinball) gathers what is only used once, when coming from another frontend: "Reprendre les médias" (Import media, from PinUP Popper or PinballX) and "Regrouper les ROM" (Gather ROMs) in the library.

**Menu système > Tables > « Toutes les tables »** (System menu > Tables > All tables): the list of every table on the cabinet, by title (manufacturer · year · version, and "Jouée 12 fois", Played 12 times, or "Jamais jouée", Never played).
Start on a table opens **its page, the same as from the wheel** (Play, Play with a friend, Edit information, Game media, Game parts, Table files, settings, diagnosis, removal…); its "Retour à la liste des tables" (Back to the table list, or Exit) goes back to the list, on that table, and every screen opened from the page comes back to it as usual.
"Jouer" (Play) launches the game, then goes back to the table menu, the wheel on that table.
A table removed from the list goes back to it.
Code: `openAllTables` and `sheetReturn` in `app/src/library.ts`.

An entry's red dot (received files to install, update available, DMD screen to check…) goes up to its section, then to the gear; on opening, the selection goes to the first one that carries one.

The tree (sections, order, name and icon of each entry) is in [packages/core/src/systemmenu.ts](../../packages/core/src/systemmenu.ts) (`SYSTEM_ROOT`, `SYSTEM_GROUPS`, `SYSTEM_ITEMS`).
The application provides what each entry does through its identifier (`library.provideSystemItem`, `app/src/library.ts` and `frontend.ts`); a new entry is placed by adding its identifier to a section, without touching the others.
[systemmenu.test.ts](../../packages/core/src/test/systemmenu.test.ts) pins the invariants: each entry placed once, one icon per entry within a section (and not the section's own), every entry provided by the application, and **every "System menu > …" path** written in this manual, its translation, the manual tests, the READMEs and the interface texts names entries that exist, in that order.
Demonstrations name an entry (`action:…`): from the system menu, the autopilot finds it in its section.

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
