[Français](../manuel/sauvegardes.md) · English · [Manual contents](../manual.md)

## Backups

Menu système > « Cyber Pinball » > « Sauvegardes » (System menu > Cyber Pinball > Backups) copies the cabinet to a USB drive, an external disk or a network drive, and restores it, on this cabinet (after a failure or a settings mistake) or on another PC.
The entry shows the date and level of the last backup.
Every backup also holds your account (nickname, avatar, level, badges, friends); System menu > "Mon compte" (My account) > "Protéger et transférer mon compte" (Protect and transfer my account), then "Reprendre un compte sur cette borne…" (Take back an account on this cabinet…) > "Depuis une sauvegarde…" (From a backup…), also leads here (see [My account](my-account.md#my-account)).

**Three levels, each containing the previous one** (`LEVEL_PARTS`, [packages/core/src/backup.ts](../../packages/core/src/backup.ts)):

| Level | Parts | What it holds |
| --- | --- | --- |
| Settings and scores (a few MB) | `cabinet`, `settings`, `scores`, `friends` | `data\cabinet.json` and its configurations, `vpx-owned.json`, `config\VPinballX*.ini`; the other JSON files of `data` (menu media, language, DMD positions, guest mode…), each table's `.ini` and `pinmame\cfg`; each table's `pinmame\nvram`, `pinmame\memcard` and `user\VPReg.stg`; `data\social.json` (including the private key of the cabinet's identity), `data\avatars` (your avatar picture and your friends' ones, never the cropping folder) and `data\amis` |
| With the tables | plus `tables` | The table folders (without their `cache`), `pinmame\roms`, `media` |
| The whole installation | plus `vpx` | `emulators` (never the `current` junction), `downloads`, `tools`, `data\enregistrements` |

Never backed up: `app` (the installer puts it back), `trash`, `import`, `parties`, `data\cache`, `data\logs`, `data\backups`, `data\staging`, what friends sent (`data\amis\recus`, `data\amis\tables`), what only applies to this PC (`telechargements.json`, `mise-a-jour.json`, `orientation-ecrans.json`, `borne-dediee\`), the backups' own settings and restores, temporary files.
`partOf` sorts each path; junctions and symbolic links are never followed.

**Destination.**
A `CyberPinball-Sauvegardes` folder at the root of the chosen drive (USB drive, disk, network drive, or the cabinet disk: "does not protect against a disk failure"), or in a specific folder of that drive: "Choisir un dossier…" (Choose a folder…) opens the Cyber Pinball folder picker on the current destination.
The chosen folder is kept from the drive root (`destination.folder`, "Sauvegardes\Borne"); if it is already called `CyberPinball-Sauvegardes`, its parent is taken.
A folder inside the Cyber Pinball installation, on no drive, or that cannot be written to (a write test when choosing) is refused with its reason.
"Restaurer" (Restore) looks in the chosen folder and at the root of every drive.
Drives come from `listDrives` (`Win32_LogicalDisk`, with `FileSystem` and `VolumeSerialNumber`); the chosen drive is recognised by its serial number even if its letter changes (`data\sauvegardes.json`).
Before starting, the space needed is worked out (what is already on the destination is deducted, `estimateBackup`) and a level that does not fit is blocked with its reason: missing space, or FAT32 and a file over 4 GB.

**A deduplicated, verified copy.**
On the destination, `objets\ab\<SHA-256>` keeps the content of each file once, and `<cabinet>\<date> <level>\sauvegarde.json` the list of one backup.
A file unchanged since the previous backup is therefore never copied again, on any file system.
Fingerprints already worked out (size, date, SHA-256) are kept in `data\sauvegardes-empreintes.json`.
Each object is written to a temporary file, read back and compared with its fingerprint, then stored: a "verified" backup was checked file by file.
The list is written after each part: a copy that is stopped or cut off (drive pulled out) keeps what is verified, marked "Incomplète" (Incomplete), and "Reprendre la sauvegarde" (Resume the backup) copies only what is missing.
The backup list marks as "Endommagée" (Damaged) one whose object is missing or no longer has its size.
During the copy the front-end stays usable but games wait ("Une sauvegarde est en cours : les parties attendent sa fin.", A backup is in progress: games wait for it to end, `play` in [frontend.ts](../../app/src/frontend.ts)): a game would write its scores during the copy.
At the end, "Éjecter la clé" (Eject the drive) asks Windows to eject it and says when it can be unplugged.

**Restoring in two steps.**
"Restaurer une sauvegarde" (Restore a backup) lists those on the plugged-in drives and on the cabinet, this cabinet's first.
Each cabinet has its own identity (`data\borne.json`); on a fresh installation (no cabinet model), its backups are recognised as this cabinet's.
The plan (`planRestore`) gives, part by part, the files replaced, put back or identical; Start includes or excludes a part at once: the files are compared once, when the plan opens (`surveyRestore`), then recombined on each choice (`planFromSurvey`).
The starting focus is on the first one, never on "Restaurer la sélection" (Restore the selection).
A file the backup does not have (a table added since) stays where it is, and without the tables, the settings and scores of a table missing here are skipped.
A table's scores (NVRAM, `VPReg.stg`) go back to those of the backup, without merging.
Then:

1. the application copies each file of the plan into `data\restauration\`, comparing its fingerprint with the backup's (`prepareRestore`): nothing in the root changes, and if stopped or cut off, the restore simply does not happen;
2. Cyber Pinball restarts and, at the very start, before the language, the cabinet model, the friends or `VPinballX.ini` are read ([app/src/restore-on-start.ts](../../app/src/restore-on-start.ts), `applyPendingRestore`), each current file goes to the trash (`<date> Avant restauration`) and the restored file takes its place.
   The old process, which stays open while the new one covers the screens, can no longer write anything in the root or the data folder, except the log ([app/src/write-freeze.ts](../../app/src/write-freeze.ts)): nothing it held in memory can overwrite a restored file.
   A file it keeps open (a video playing) cannot be put in place straight away: the old one stays, and the file is put in place again 20 s then 60 s after startup (`RESTORE_ATTEMPTS`, in the same report).

The report (`data\restauration-derniere.json`) is announced at startup and shown at the top of Backups.
"Annuler la dernière restauration" (Undo the last restore) puts back, the same way, what went to the trash and removes what was added, as long as the trash keeps it.

**Another cabinet.**
A backup made on another cabinet does not bring over by default either its screens, buttons and sound (the `cabinet` part, which can be included) or its friends and network identity.
"Garder mes amis et l'identité de cette borne" (Keep my friends and this cabinet's identity) is the starting choice; "Remplacer « … » sur le réseau" (Replace "…" on the network) takes its private key and friends, after a confirmation: the old cabinet must not connect again.
A backup that holds the identity says so at the end of the copy ("gardez-la pour vous", keep it to yourself).

**Moving to a new PC.**
When this cabinet has no life on the network yet (no friend, no pending request, no conversation: `hasNetworkHistory`, read once when the plan opens), taking over the backup's identity loses nothing: it is a move to a new PC.
The two choices become "Garder l'identité neuve de ce PC" (Keep this PC's new identity) and "Reprendre l'identité de « … »" (Take over "…"'s identity: nickname, friends, messages), the latter chosen by default.
The confirmation stays ("Reprendre l'identité de « … » ?", focus on Back): the old PC must not connect again.
An unreadable friends or messaging file counts as a life: taking over is then not chosen by default.

**Automatic backup.**
"Automatique" (Automatic): off (default), every day or every week.
Time: "Dès que possible" (As soon as possible, the default: a cabinet is not on all day), the first time the cabinet is free during the day (since midnight) or the week (since Monday midnight); or "À heure fixe" (At a set time), the chosen hour (4 am by default) and, every week, the day (Sunday by default), a missed time (PC off) being caught up as soon as possible.
Settings and scores only, on the cabinet (`data\sauvegardes`, the last 10 kept), then copied to the destination as soon as it is plugged in (setting "Copier aussi sur la destination", Also copy to the destination).
Checked every minute, it starts when the cabinet is free: in the front-end, no button for 30 s (`backupFree`); a game started during the copy stops it (`yieldToGame`), what was verified stays, and it runs again at the next free moment.
After a failure (disk full), no new attempt for 30 min.
The screen shows the next one (`lastAutoSlot`, `nextAutoSlot`, `autoBackupDue`).
`pruneBackups` removes automatic backups beyond the last 10, incomplete ones caught up by a complete one, then the objects nothing refers to any more; a backup made by hand or another cabinet's is never removed.

Code: the engine in [packages/core/src/backup.ts](../../packages/core/src/backup.ts), the screens in [app/src/backups-menu.ts](../../app/src/backups-menu.ts), ejection in `app/src/drive-eject.ts`.
[sauvegardes.test.ts](../../packages/core/src/test/sauvegardes.test.ts) pins the engine: part of each path, nested levels, junctions never followed, deduplicated and read-back copy, estimate and FAT32, backup stopped then resumed, damaged object, two-step restore and its undo, busy file put in place later, data folder outside the root, pruning of automatic backups, due times; [gel-ecritures.test.ts](../../packages/core/src/test/gel-ecritures.test.ts), the write freeze.
[sauvegardes-menu.test.ts](../../packages/core/src/test/sauvegardes-menu.test.ts) pins the screens with simulated drives: nothing writes without its action, starting focus never on an action that writes, unavailable actions greyed out with their reason, game refused during a copy, another cabinet without its identity, confirmation before taking it, move to a new PC where taking over is chosen by default, automatic backup only when the cabinet is free.

**Limits.**
The first launch after a reinstall opens the wizard: the restore is done afterwards, from Backups (the backup's screens and buttons replace those the wizard has just recorded).
The account, however, can come back from the very first launch, through this PC's backup copy, the recovery code or the password (see [My account](my-account.md#my-account)).
A folder outside a drive letter (`\\NAS\borne`) cannot be chosen on screen yet: a network drive mapped to a letter works.
