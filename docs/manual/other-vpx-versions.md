[Français](../manuel/autres-versions-de-vpx.md) · English · [Manual contents](../manual.md)

## Other VPX versions

A table can be played with a VPX already installed on the PC (10.8.0, 10.7…), for instance a table taken over from another installation that runs better with it.
Cyber Pinball never installs it: it is the player's installation, with its own settings, and VPinMAME and B2S Server, which these versions need, are registered in Windows.
As long as no other VPX is added, none of what follows shows, neither on a table's sheet nor in the installation plan, except the warning about a table saved by a newer VPX (below).

**The list.**
System menu > "Ma borne" (My cabinet) > "VPX" > "Autres versions de VPX" (Other VPX versions); its detail names the VPX added, otherwise "Aucune : toutes les tables sont jouées avec le VPX de Cyber Pinball" (None: all tables are played with Cyber Pinball's VPX).
On opening, Cyber Pinball looks for the VPX of the PC's other installations (standalone VPX folder, PinUP Popper emulators) and offers each one with a Start ("Ajouter VPX 10.8.0" (Add VPX 10.8.0), "Trouvé sur ce PC : …" (Found on this PC: …)); a version already in the list is not offered again.
"Ajouter un autre VPX…" (Add another VPX…) has it chosen by its executable, in the file picker.
Only a VPX 10 `VPinballX*.exe` is accepted, recognised by its file version (`checkOtherVpx`); the version Cyber Pinball already uses is refused, since its tables would only lose Cyber Pinball's features.
A VPX is named by its first three numbers ("VPX 10.8.0"), except a 10.9 prerelease, numbered 10.8.1 but reading 10.9 tables: it keeps its revision ("VPX 10.8.1.6012", `vpxVersionName`), so it is not mistaken for 10.8.1.
Start on an added VPX removes it, after a confirmation that says how many tables chose it: they go back to Cyber Pinball's VPX and will get it back if it is added again; nothing is deleted from the PC.
The list is kept in `<data>\autres-vpx.json`.

**Trial VPX (development).**
On a machine that has its developer key, signed by Cyber Pinball's release key and tied to that machine, the VPX section also has "VPX d’essai" (Trial VPX): the next version of VPX, installed next to Cyber Pinball's, without reinstalling or touching the VPX 10.8.1 settings (it has its own `VPinballX.ini`).
Switching versions restarts Cyber Pinball; tables, media and ROMs stay shared, and the scores made with the trial version stay on the cabinet.
Elsewhere, the entry does not exist, even when Cyber Pinball is run from its sources: the key cannot be made or copied to another PC ([packages/core/src/devkey.ts](../../packages/core/src/devkey.ts), `app/src/vpx-essai.ts`).

**A table's choice.**
On the sheet, "Gérer la table…" (Manage table…) then has the line "Jouée avec VPX 10.8.1 de Cyber Pinball" (Played with Cyber Pinball's VPX 10.8.1) (or "Jouée avec VPX 10.8.0"), after "Réglages de cette table" (This table's settings); Start opens "VPX de cette table" (This table's VPX), the cursor on the current choice.
The choice is written to the table's `.info` (`CyberPinball.vpx`), where it follows the table; a choice whose VPX is no longer in the list no longer counts.
A table's installation plan has the same line, and "Changer le VPX" (Change the VPX).
A table taken over from another installation keeps the VPX that played it: Cyber Pinball finds the executable that installation launched it with (in PinUP Popper, the table's emulator and its alternative executable, `ALTEXE`), and the installation plan keeps that VPX if it is in the list (same file, otherwise same version).
In guest mode, the `sheet.vpx` door is closed.

**The game.**
Cyber Pinball is then only the launcher: the chosen executable with `-Play` and the table, without `-Ini`, hence with that VPX's settings (screens, backglass, DMD, VPinMAME, B2S Server, PinUP Player), then the return to the menu.
It never writes to that other VPX's folder and prepares nothing of what it does for its own VPX 10.8.1 in plugin mode: no cabinet `VPinballX.ini`, no plugins, no DMD position, no ROM volume, no shrunk DMD videos.
Kept for Cyber Pinball's VPX: virtual reality, in-game display adjustment, games with friends, 3D vision, Cyber Pinball's VPX settings (screens, real DMD, buttons) and PuP-Pack preparation (PinUP Player reads the pack as the player's installation set it up).
The sheet says so ("Pas de réalité virtuelle, réglage de l'affichage en partie… pour ces tables." (No virtual reality, in-game display adjustment… for these tables.)), and "Régler l'affichage en partie" (Adjust the display during a game) does not show there.
A game with friends on such a table is refused before the launch ("Partie entre amis impossible avec VPX 10.8.0" (Game with friends not available with VPX 10.8.0)), as is an executable moved or uninstalled ("VPX 10.8.0 introuvable" (VPX 10.8.0 not found)), with the way back to Cyber Pinball's VPX.
The log notes each game ("Partie (…) avec un autre VPX : VPX 10.8.0, …, ses propres réglages.").
A VPX 10.8.0 starts without the editor window, and the game is left with the cabinet's Quit button, even if that VPX uses other buttons.

**Table saved by a newer VPX.**
Each table keeps the format version of the VPX that saved it (`readVpxFileVersion`); an older VPX shows an error window and loads it badly.
That is the case of a table saved by a 10.9 prerelease (revision 5963 and later) and played by Cyber Pinball's VPX 10.8.1 (`packages/core/src/vpx-format.ts`).
Cyber Pinball compares that format with the one read by the VPX that would play the table, its own or the one chosen in "Jouée avec" (Played with) (`tableTooNew`).
- **The Diagnosis and the Cabinet health** report it ("Table enregistrée par VPX 10.9", Table saved with VPX 10.9); if a recent enough VPX is in the list, the fix "La jouer avec VPX 10.8.1.6012" (Play it with VPX 10.8.1.6012) chooses it for the table.
- **The installation plan** says so in orange ("VPX 10.8.1 de Cyber Pinball ne sait pas ouvrir une table enregistrée par VPX 10.9 : la partie échouerait.", Cyber Pinball's VPX 10.8.1 cannot open a table saved with VPX 10.9: the game would fail.), and picks by default the first VPX in the list that can open it, the newest first; "Changer le VPX" (Change the VPX) is still possible.
- **The game** is refused before VPX is launched: "VPX 10.8.1 de Cyber Pinball ne peut pas ouvrir cette table" (Cyber Pinball's VPX 10.8.1 cannot open this table), "Elle a été enregistrée par VPX 10.9, plus récent." (It was saved with VPX 10.9, a newer version.), then what to do, and Start or Exit goes back to the front-end; the log says "Partie (…) refusée : enregistrée par VPX 10.9, plus récent que …".
- **What to do**: when a VPX in the list can open it, "VPX 10.8.1.6012 sait la jouer : Gérer la table, puis « Jouée avec », pour le choisir." (VPX 10.8.1.6012 can play it: Manage table, then "Played with", to choose it.); otherwise, "Ajoutez un VPX 10.9 ou plus récent (Menu système > Ma borne > VPX > Autres versions de VPX), puis choisissez-le dans Gérer la table, « Jouée avec »." (Add a VPX 10.9 or newer (System menu > My cabinet > VPX > Other VPX versions), then choose it in Manage table, "Played with".).
- **The script** of such a table is read straight from the `.vpx`, without launching a VPX that cannot open it and would stay stuck on its error window (`app/src/vbs.ts`).

Code: [packages/core/src/autres-vpx.ts](../../packages/core/src/autres-vpx.ts) (list, a table's choice, executable check, takeover from another installation, table too new), [packages/core/src/vpx-format.ts](../../packages/core/src/vpx-format.ts) (format read by each version), [app/src/autres-vpx-menu.ts](../../app/src/autres-vpx-menu.ts) (screens); tests `autres-vpx.test.ts` and `vpx-format.test.ts`.
