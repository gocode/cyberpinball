[Français](../manuel/cohabitation-avec-un-autre-front-end-de-borne.md) · English · [Manual contents](../manual.md)

## Coexisting with another cabinet frontend

Cyber Pinball installs on a cabinet that already has PinUP Popper, PinballX or PinballY without changing anything in their installation.
Code: [packages/core/src/coexistence.ts](../../packages/core/src/coexistence.ts) (known frontends, taskbars, list of the Windows settings it changes) and [app/src/frontend-gate.ts](../../app/src/frontend-gate.ts) (waiting screen); the invariant is pinned down by [coexistence.test.ts](../../packages/core/src/test/coexistence.test.ts).

**What stays separate.**

- Everything lives in the Cyber Pinball root folder: its own copy of VPX (`emulators\vpx\`), its tables, ROMs and media.
- VPX is launched with `-Ini <root>\config\VPinballX.ini`: the other frontend's `VPinballX.ini` is neither read nor written.
  Only the log `%APPDATA%\VPinballX\10.8\vpinball.log` is shared if the other frontend also uses VPX 10.8: each game rewrites it.
- VPX plugin mode: no component is registered in Windows (VPinMAME, B2S and PinUP Player stay the other frontend's); `B2STableSettings.xml`, `DmdDevice.ini` and `PUPDatabase.db` are not touched.
  The DOF folder (`%APPDATA%\VPinballX\10.8\directoutputconfig`) is shared by every VPX 10.8 on the PC: Cyber Pinball only writes there on request (configtool import, previous configuration backed up; addressable LEDs described), and never in place of a hand-written `Cabinet.xml` or GlobalConfig (see [LED and feedback (DOF)](led-and-feedback-dof.md#led-and-feedback-dof)).
- The other frontend's files are never moved: "Reprendre les médias de PinUP Popper / PinballX" (Import media from PinUP Popper / PinballX) copies them, and a table picked outside `import\` is copied.
- ROMs and NVRAM are stored separately: high scores and game settings are not shared.

**What is shared: a few Windows settings.**
Their full list is `WINDOWS_CHANGES`.
The test rejects a declared call made outside its file, and any call that would change something else (`FORBIDDEN_WINDOWS_CALLS`: registry outside the installer, default audio output, the application starting itself at sign-in, system parameters, processes killed by name).

| Setting | When | What Cyber Pinball does for the other frontend |
| --- | --- | --- |
| Orientation of the playfield screen, for the session only, given back on exit | wizard, "Où sont les flippers ?" (Where are the flippers?) step, only if VPX cannot put the flippers on the player's side; given again at every startup | Another frontend installed or running: the first Start warns ("Retourner l'écran dans Windows ?" (Flip the screen in Windows?): its menu and tables would be upside down too). Start flips anyway, then asks for confirmation within 15 s as usual; Exit keeps the Windows orientation, tables upside down in Cyber Pinball. |
| Taskbars | during a game | Only the ones Cyber Pinball hid come back (`taskbarsToRestore`): a taskbar already hidden by the other frontend stays hidden. The `barres-des-taches-masquees` marker keeps the HWND of each one. |
| Ctrl+Shift+K shortcut | during a game | Released at the end of the game. |
| Ctrl+Shift+D shortcut | in desktop mode | Released on return to the menu. |
| Start at sign-in, desktop replaced or hidden | installer option, and System menu > "Borne" > "Borne dédiée" (Dedicated cabinet) or "Lancement au démarrage" (Launch at startup), off by default | Another frontend installed: the screen flags it before turning anything on (if it also starts with Windows, the two would fight over the screens). Each Windows setting is recorded before being written and put back as it was when turned off (`Sys-Set`, `windowssettings.ts`). |
| "Programs and Features" entry | installation (`HKCU`) | Removed on uninstall. |
| "Cyber Pinball pare-feu" scheduled task | "Autoriser dans le pare-feu de Windows" (Allow in Windows Firewall), under the same permission | No trigger: started by Cyber Pinball only, when one of its firewall rules is missing, to add it again (see "Firewall after an update"). Touches nothing else; removed on uninstall. |

**Another frontend already running.**
The two frontends would fight over the screens, the DMD display and the cabinet buttons.
At startup, before covering any screen (`otherFrontendsGate`, called by `main.ts` before the screen guard), Cyber Pinball looks for the processes of the known frontends (`OTHER_FRONTENDS`: `PinUpMenu.exe` and `PinUpDisplay.exe` for PinUP Popper, `PinballX.exe`, `PinballY.exe`; `PinUpPlayer.exe`, the PuP-Pack player, is not one of them).
If it finds one, only the main screen shows "PinUP Popper est ouvert" (PinUP Popper is running): Cyber Pinball starts on its own as soon as it is closed (checked every second); Start or "Continuer quand même" (Continue anyway) starts right away; Exit or "Quitter Cyber Pinball" (Quit Cyber Pinball) quits.
Nothing is closed or changed in the other frontend.
Before each game, the menu checks again: a frontend opened in the meantime gives "PinUP Popper est ouvert" (Start: play anyway · Exit: back to the menu).
A frontend accepted once is no longer reported until Cyber Pinball closes, menu ↔ wizard relaunches included (`CYBERPINBALL_AUTRES_MENUS_ACCEPTES`, passed on to the new process).

**Programs open during the game.**
Accepted at startup, another cabinet program can still slow games down: at times it takes the processor, the disk or the real DMD (a player coming from PinUP Popper had freezes of 1 to 2 s on almost every table).
At each game, Cyber Pinball notes those that are open (`GAME_INTRUDERS`, `programsDuringGame`, [coexistence.ts](../../packages/core/src/coexistence.ts)): the frontends above, PinUP Player (`PinUpPlayer.exe`, the PuP-Pack player), dmdext and the B2S server outside VPX (`B2SBackglassServerEXE.exe`).
- **Over the game**, a notification "Open during the game: PinUP Popper and dmdext", detailed "It may slow the game down: close it", once a day and per program, even if you chose "Continue anyway" at startup.
- **With the game's measurement** (`cadence-parties.json`, field `others`): the finding "The table is sluggish on this cabinet" mentions it first, as a cause to rule out first (see [Cabinet health](cabinet-health.md#cabinet-health)).
- **In the log**: "Partie (…) : ouverts pendant la partie : …".

Tests: [programmes-ouverts.test.ts](../../packages/core/src/test/programmes-ouverts.test.ts).

**Installed frontends** (`installedFrontends`, for the orientation warning): the executable, or the `POPMedia` or `Media` folder, in the default locations (`vPinball\PinUPSystem`, `PinUPSystem`, `PinballX`, `PinballY`…, on C:, D: and E:).

**Simulated frontends**: offscreen, only simulated frontends count: `CYBERPINBALL_AUTRES_MENUS` (running, executable names separated by commas; with `CYBERPINBALL_AUTRES_MENUS_FICHIER`, closed when that file disappears) and `CYBERPINBALL_AUTRES_MENUS_INSTALLES` (installed).
