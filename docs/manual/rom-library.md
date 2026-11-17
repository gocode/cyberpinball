[Français](../manuel/bibliotheque-de-rom.md) · English · [Manual contents](../manual.md)

## ROM library

A ROM is often used by several tables (versions, mods of the same machine).
Each ROM is stored **only once**, in `<racine>\pinmame\roms`, and each table that plays it gets a **hard link** to it in its own `pinmame\roms` (where VPX 10.8.1 looks first): the same file on disk, taking no extra space.
The folder was not invented: `<racine>\pinmame` is already the shared PinMAME folder that the sync suggests for `[Plugin.PinMAME] PinMAMEPath` as soon as it contains `roms`; a table without a link therefore still finds its ROM there, as a fallback, **provided it has no `pinmame\roms` folder**: as soon as that folder exists, the PinMAME plugin looks only there (`PinMAMEPlugin.cpp`, lines 436-477, commit af26b2d93), and the doctor reports it as blocking when the ROM is missing from it.
Code: [packages/core/src/romlibrary.ts](../../packages/core/src/romlibrary.ts).

**Per-table ROM aliases** ([packages/core/src/romalias.ts](../../packages/core/src/romalias.ts)): the plugin also reads `alias.txt` in the table's PinMAME folder (`<table>\pinmame`), one line "name requested by the script,game loaded", even before the ROM.
The doctor uses it in three ways:

- **Neighboring revision**: the requested ROM is missing, but another revision of the same game (`t2_l6` for `t2_l8`) is in the table or the library; on request, it links it and writes the alias.
  The warning says so: lamps, coils or switches may differ, settings and high scores (NVRAM) are not carried over, and remastered sounds and DMD colors stored under the other name are no longer found.
  As long as the alias is in use, a reminder stays in the diagnosis.
- **Old VPinMAME names** ("goldfinger" for "bond", 119 names taken from PinMAME's `release/VPMAlias.txt`, in [packages/core/src/vpmalias.ts](../../packages/core/src/vpmalias.ts)): VPinMAME translated them on its own, but the VPX 10.8.1 plugin no longer knows them; the doctor writes the line, and says whether the real ROM is missing too.
- **Alias no longer needed**: the requested ROM has arrived, but the alias takes precedence over it; "Revenir à la ROM demandée" (Back to the requested ROM) removes the line (and the file, if no line is left).

- **Same volume required**: a hard link only connects two folders on the same disk (NTFS).
  A table on a different volume from the root (junction to another disk, FAT32 or exFAT drive) gets a **copy**, and the plan says so.
- **Identity**: two files with the same name are the same ROM if their content is the same: the fingerprint covers the chips in the zip (path, CRC and size of each file), so the same ROM zipped by two tools (different compression, different dates) remains a single version; a file that is not a readable zip is compared byte for byte (SHA-1).
  Two different contents under the same name: the most recent (file date) is kept, or the one chosen in the plan ("Garder plutôt…" (Keep instead…)); the other goes to the recycle bin.
  An identical copy replaced by a link is deleted (its content stays in the library, byte for byte: this is checked just before); any other replaced file goes to the recycle bin.
- **Adding**: an imported ROM enters the library, then is linked into **every installed table that plays it**: those whose script requests it without having any copy, those that already have a copy, and the table the import is meant for.
  A new table whose ROM is already in the library gets it without importing anything more.
  A ROM that no table is expecting yet is stored anyway, for the table to come.
  Scripts of tables not yet read are read before the plan (VPX `-ExtractVBS`, about one second each, then cached; if VPX does not return the script, the one written in the `.vpx` is read without it, unless the script is protected).
- **ROM recognised by its content** ([packages/core/src/romzip.ts](../../packages/core/src/romzip.ts)): PinMAME (VPinMAME as well as the VPX 10.8.1 plugin) only reads a ROM as `<nom>.zip`, **its chips at the root of the zip**.
  An archive is a ROM when it contains nothing but chips (no table, image, video, sound or other archive; `.txt` notes are tolerated), all in one folder: at the root, or in a subfolder (`t2_l8.zip › t2_l8 › t2_l8.rom, t2_u14.l3…`, like many downloaded ROMs).
  It is recognised everywhere: a zip on its own, a zip inside a table's package (zip, 7z, rar), a ROM as 7z or rar, a folder of unpacked chips (`roms\t2_l8\`).
  Its name comes, in this order, from a ROM requested by a table's script and carried by the archive or a folder (case included: `T2_L8.ZIP` becomes `t2_l8.zip`), from a known ROM name (VPS database, old VPinMAME names), from a chip named like a requested ROM (`t2_l8.rom` in "Terminator 2 ROM.zip"), from the only requested ROM of the same family as the chips (`t2_u14.l3` → `t2_l8`), and finally from the archive name.
  A ROM whose chips are in a folder is **rebuilt as a flat zip** (chips copied as they are, without recompression, dated like the original archive) before entering the library; the plan says so ("ROM t2_l8 reconnue dans le dossier « t2_l8 »" (ROM t2_l8 recognised in the "t2_l8" folder)), as it does for a rename.
  Its files are never stored one by one in a table's folder.
- **Tidying up** (system menu, Exit in the menu: "Ranger les ROM dans la bibliothèque" (Move ROMs into the library)): for ROMs from before the library.
  The plan shows, ROM by ROM, the one that enters the library, the copies replaced by a link, the links added, the versions set aside and the space freed; nothing moves until "Ranger" (Tidy up).
  The summary gives the space taken by ROMs measured before and after.
- **Overall view** (system menu: "Bibliothèque de ROM" (ROM library)), with the cabinet buttons: each ROM, the tables that use it and its size; the ROMs to tidy up; **unused** ROMs (no table has it or expects it), with the recycle bin offered one by one or for all; ROMs **expected but missing**, with "Ajouter" (Add).
  Disk space counts each physical file once and states what the links save.
  Only ROMs in `pinmame\roms` folders are concerned: `.zip` files stored elsewhere (FlexDMD fonts, for example) are not ROMs.
- **Doctor**: "ROM pas liée dans la table" (ROM not linked in the table) (it is in the library, not in `pinmame\roms`: link it) and "Copie de ROM au lieu d'un lien" (ROM copy instead of a link) (replace it with a link; for a different version, use the library one, the other goes to the recycle bin).
  The table's details screen marks a linked ROM with "(bibliothèque)" ((library)).
- **Scattered ROM, ROM in a subfolder** (repairing what versions up to 0.1.3-essai.1 left behind: they unpacked a ROM zip with a subfolder and stored its chips at the root of the table): "ROM « t2_l8 » en fichiers éparpillés dans la table" (ROM "t2_l8" scattered as loose files in the table) spots the chips of the requested ROM left at the root of the table (same name as the ROM or same family: `t2_l8.rom`, `t2_u14.l3`…; never `.vgm`, `.ini` or `.log`) or in a folder named after it; "Refaire t2_l8.zip dans la bibliothèque et le lier" (Rebuild t2_l8.zip in the library and link it) rebuilds the flat zip, stores it in the library, links it in `pinmame\roms` and moves the chips to the recycle bin.
  If the ROM is already there (library, link, alias), all that is left is moving these files to the recycle bin.
  "ROM illisible : ses fichiers sont dans un sous-dossier du zip" (ROM unreadable: its files are in a subfolder of the zip) spots such a zip put by hand in `pinmame\roms`, and "ROM mal rangée" (Misplaced ROM) a subfolder zip elsewhere in the table: both rebuild it flat.
  The "Ce qu'il manque pour jouer" (What's missing to play) journey offers these fixes on the spot, before any search.

Deleting a table only sends its link to the recycle bin: the ROM stays in the library, and the overall view then offers it as unused if no table plays it anymore.
