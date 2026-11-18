[Français](../manuel/autres-versions-de-vpx.md) · English · [Manual contents](../manual.md)

## Other VPX versions

A table can be played with a VPX already installed on the PC (10.8.0, 10.7…), for instance a table taken over from another installation that runs better with it.
Cyber Pinball never installs it: it is the player's installation, with its own settings, and VPinMAME and B2S Server, which these versions need, are registered in Windows.
As long as no other VPX is added, none of what follows shows, neither on a table's sheet nor in the installation plan.

**The list.**
System menu > "Borne" (Cabinet) > "Autres versions de VPX" (Other VPX versions); its detail names the VPX added, otherwise "Aucune : toutes les tables sont jouées avec le VPX de Cyber Pinball" (None: all tables are played with Cyber Pinball's VPX).
On opening, Cyber Pinball looks for the VPX of the PC's other installations (standalone VPX folder, PinUP Popper emulators) and offers each one with a Start ("Ajouter VPX 10.8.0" (Add VPX 10.8.0), "Trouvé sur ce PC : …" (Found on this PC: …)); a version already in the list is not offered again.
"Ajouter un autre VPX…" (Add another VPX…) has it chosen by its executable, in the file picker.
Only a VPX 10 `VPinballX*.exe` is accepted, recognised by its file version (`checkOtherVpx`); the version Cyber Pinball already uses is refused, since its tables would only lose Cyber Pinball's features.
Start on an added VPX removes it, after a confirmation that says how many tables chose it: they go back to Cyber Pinball's VPX and will get it back if it is added again; nothing is deleted from the PC.
The list is kept in `<data>\autres-vpx.json`.

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

Code: [packages/core/src/autres-vpx.ts](../../packages/core/src/autres-vpx.ts) (list, a table's choice, executable check, takeover from another installation), [app/src/autres-vpx-menu.ts](../../app/src/autres-vpx-menu.ts) (screens); tests `autres-vpx.test.ts`.
