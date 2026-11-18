[Français](../manuel/fiche-d-une-table-ses-fichiers.md) · English · [Manual contents](../manual.md)

## Game page: its files

**Its actions**: the game page holds a few choices.
At the top, "Jouer" (Play), "Jouer avec un ami" (Play with a friend) and "Prospectus et règles" (Flyer and rules): a single booklet, the flyer (or the generated sheet) then the rules (cards, texts and video found automatically, and always the game controls last); the flippers move from page to page, from one to the other, Start turns the page then goes back to the game page after the last one, and the mouse jumps to the other part.
Everything else is under **"Gérer la table…"** (Manage the table…): "Pour aller plus loin" (Going further), "Médias du jeu" (Game media), "Parties du jeu" (Game parts), "Fichiers de la table" (Table files), "PuP-Pack", "Réglages de cette table" (This table's settings), "Jouée avec …" (Played with …) (only when another VPX is added, see [Other VPX versions](other-vpx-versions.md#other-vpx-versions)), "Régler l'affichage en partie" (Adjust display in game), "Jouer et enregistrer" (Play and record), "Diagnostiquer et réparer" (Diagnose and repair), "Modifier les informations" (Edit info), "Supprimer la table" (Delete the table).
Its detail says, from the game page, what needs a look ("À vérifier : Fichiers de la table, PuP-Pack" (To check: Table files, PuP-Pack)), in orange.
The screens opened from there come back to it (`sheetManage`, `app/src/library.ts`); Exit on "Gérer la table" goes back to the game page.
"Ce qu'il manque pour jouer" (What is missing to play) stays at the top of the game page, before "Jouer".
In guest mode, the `sheet.manage` door is closed: the game page keeps "Jouer", "Prospectus et règles" and the back action.
Demonstrations name an action under "Gérer la table…" by its name, and the autopilot goes through it, as for a system menu entry (`activateByLabel`).

A table's game page (Start on a table in the menu) shows its statistics on one line and a **bounded summary** of its files: one line per kind present (table, backglass, ROM, DMD content, PuP videos, DMD colours, alternative sounds, music, own settings, media), three names at most per line ("t2_l3, t2_l4 and 4 more"), a "Absents" (Missing) line for the missing kinds and a "À vérifier" (To check) line (misnamed backglass, script replaced by a `.vbs`, crash report, low ROM volume).
After the ROM, a "Volume de la ROM" (ROM volume) line gives, for a machine that keeps its volume in its memory, the one the ROM will play and what Cyber Pinball does with it ("12 sur 31, d'usine, faible : monté à 23 avant la partie" (12 of 31, factory, low: raised to 23 before the game), "18 sur 31 (votre réglage)" (18 of 31 (your setting))…, see [ROM volume](sound.md#rom-volume)).
A table that is sluggish or stutters on the cabinet says so in "Diagnostiquer et réparer" (Diagnose and repair), with the figures of its last game (see [Cabinet health](cabinet-health.md#cabinet-health)).
"Diagnostiquer et réparer" also offers "Envoyer un rapport aux développeurs" (Send a report to the developers): in one press, the table's findings, what was just repaired, the tech sheet and the logs, encrypted and anonymised; a description stays optional, and without findings the detail says "Un souci que le diagnostic ne voit pas" (A problem the diagnosis does not see).
Upright (cabinet with a turned playfield, or portrait screen), the information keeps its place and the actions go on two columns; the action list scrolls if it overflows.
On a cabinet, the action list used to take the whole height: with many files, only the first statistics line was still visible.

**"Fichiers de la table"** (Table files) (game page action, detail "66 files · 940 KB · 3 to check"): the whole table folder, grouped by kind, the table and its backglasses first.
Each file is a line to choose there, with its full name (it wraps), its folder inside the table's, its state and its size: "cette table" (this table) or "autre version du dossier" (other version in the folder), backglass "chargé par VPX avec cette table" (loaded by VPX with this table) or "mal nommé : VPX ne le chargera pas" (misnamed: VPX will not load it), ROM "lien vers la bibliothèque de ROM" (link to the ROM library), "copie à part : la bibliothèque a aussi cette ROM" (separate copy: the library also has this ROM) or "propre à la table" (own to the table), "demandée par le script" (asked for by the script), PinMAME save and settings, override script, crash report.
Folders filed as one block (a PuP-Pack, alternative sounds, DMD colours, FlexDMD content, menu media) are one line, with their number of files; music is listed file by file.
What the script expects and is missing (ROM, DMD folder) appears at the top of its kind, "absente" (missing).
With the buttons, the flippers go through the list, which scrolls to keep the chosen file visible; Start opens the file's **detail**: type, full folder, size, date, state, and for a linked ROM the library file it shares; "Bibliothèque de ROM" (ROM library) and "Diagnostiquer et réparer" (Diagnose and fix) lead there when useful.
In the common tables folder, only the table's companion files (same name) belong to it.
The inventory is read when the game page opens, not on each button press.

Code: [packages/core/src/tablecontents.ts](../../packages/core/src/tablecontents.ts) (inventory, tests `tablecontents.test.ts`), screens in [app/src/table-files.ts](../../app/src/table-files.ts), summary in `buildSheet` (`app/src/library.ts`), layout `.lib-sheet`, `.lib-files` and `.lib-facts` in `app/renderer/library.css`; lines to choose (`Row.pick`) do not repeat their action in the list.
