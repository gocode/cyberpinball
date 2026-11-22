[Français](../manuel/orientation-et-cadrage-des-tables.md) · English · [Manual contents](../manual.md)

## Table orientation and framing

After the playfield is chosen, the wizard asks where the player stands: the flippers rotate the display until the text is upright, with the "Flippers · vous êtes ici" (Flippers · you are here) band on the player's side.
It then asks for the diagonal, suggested from the EDID (the millimeter size from the detailed timing, otherwise the centimeters), and discarded if it does not match the image proportions, as happens with some TVs and with projectors.
All of this is stored in `cabinet.json` (`playfield.flipperEdge`, `playfield.manualSizeCm` only if the diagonal differs from the EDID; `packages/core/src/layout.ts`).
These questions can be redone on their own through system menu > "Ma borne" (My cabinet) > "Configuration de la borne" (Cabinet setup) > "Écrans" (Screens) > "Orientation et taille du playfield" (Playfield orientation and size) (`--assistant --playfield`), and with "Écrans et rôles" (Screens and roles) when the playfield moves to another screen.

Keys written to `VPinballX.ini` (`vpxLayoutSettings`, read from `ViewSetup.cpp` and `player.cpp` in VPX 10.8.1):

| Key | Value | Managed |
| --- | --- | --- |
| `[Player] BGSet` | 1 (cabinet) if the image is taller than it is wide for the player, otherwise 0 | yes |
| `[Player] ScreenWidth`, `ScreenHeight` | real size in cm, the long side as the width whatever the orientation | yes |
| `[Player] CabinetAutofitMode` | in cabinet view, 1 ("Fit Table") or 2 ("Fit Screen"): the chosen mode is kept, any other value (absent, 0, `Manual`) becomes 1 | in game: the mode is free, manual is refused |

With automatic framing, VPX recomputes the table's whole cabinet view and derives the rotation from the shape of the window: flippers on the right of a landscape image, at the bottom of a portrait image, with no setting to change it.

#### Direction of tables in play

VPX draws in Windows coordinates: only the shape of the playfield window counts, never the orientation of the screen.
What decides the direction (`vpxPlayedFlipperEdge`, `packages/core/src/vpx.ts`, read from `ViewSetup.cpp`, `player.cpp` and `pintable.cpp` of VPX 10.8.1, commit `af26b2d93`):

| Values read by VPX (`VPinballX.ini`, under the table's `.ini`) | View rotation | Flippers |
| --- | --- | --- |
| `BGSet = 1`, `CabinetAutofitMode` 1 or 2 | `SetWindowAutofit` resets the table's rotation to 0 at every game, `GetRotation` adds 270° for a landscape window, 0° for a portrait window; `ViewCabRotation` has no effect | right (landscape), bottom (portrait) |
| `BGSet = 1`, manual framing (`CabinetAutofitMode` 0, or absent: VPX default) | that of the cabinet view set in the table, often 270° for Windows in landscape | unpredictable: sideways on Windows in portrait |
| `BGSet` 0 or 2 (desktop or FSS view) | that of the table's desktop view | bottom |

A rotation of r degrees puts the flippers at the edge whose `edgeRotation` is r (0 bottom, 90 left, 180 top, 270 right): the same convention as the menu rotation.
Without `ScreenWidth`/`ScreenHeight`, VPX still fits the table, with its default size.

Hence the rule: in cabinet view, automatic framing is required, not suggested.
Up to 0.1.3-essai.3, `CabinetAutofitMode` was only written when the key was empty: a `CabinetAutofitMode = 0` already there (old `VPinballX.ini`, setting changed in the VPX menu or in "Réglages" (Settings)) stayed, and every table went back to its own cabinet view, rotated for Windows in landscape.
On a playfield in portrait in Windows, flippers at the bottom, the menu was upright and the game sideways.

- **Sync** (`requireAutofit`, `orientationFinding`, `packages/core/src/sync.ts`): a value other than 1 and 2 is replaced by 1, with the finding "cadrage automatique de VPX rétabli" (VPX automatic framing restored) when it was written; a cabinet already set up is corrected at the next start, without redoing the wizard.
  After writing, the direction is computed again from the file: if VPX will not draw the flippers on the player's side (Windows orientation to change, `BGSet` changed by hand, `CabinetAutofitMode` kept by the user in `vpxManual`), a warning says so, with the values at fault.
- **Settings**: the "Manuel" (Manual) choice, and the VPX default that is one, are no longer offered for `CabinetAutofitMode` in the general setting.
- **Diagnosis**: "Table de travers sur cette borne" (Table sideways on this cabinet, `tableOrientation`) when a table's `.ini`, through `BGSet` or `CabinetAutofitMode`, stops VPX drawing the flippers on the player's side; it then replaces "Cadrage manuel imposé par la table" (Manual view forced by the table).
  The repair removes these keys only; the file goes to the recycle bin if it holds nothing else.
  If `VPinballX.ini` itself is at fault, the sync says so.
- **Test**: `packages/core/src/test/orientation.test.ts` goes through the four Windows orientations, of a landscape screen and of a native portrait screen, the four flipper edges and seven starting `VPinballX.ini` files: the game goes the player's and the menu's way, without a warning, and a second sync changes nothing more; screen rotated outside the wizard or flip refused: right direction, or a warning.

For a player on the left or at the top, the wizard rotates the playfield screen itself, for the session only (see [Desktop orientation on exit](#desktop-orientation-on-exit)).
At the "Où sont les flippers ?" (Where are the flippers?) step, it announces "Start : retourner l'écran pour VPX" (Start: flip the screen for VPX); Start switches the screen to a flipped orientation (`SessionOrientation.want`, then `setDisplayOrientation`, `packages/win-displays/src/orientation.ts`: `ChangeDisplaySettingsExW` tried as a dry run, applied without `CDS_UPDATEREGISTRY`, read back, and put back as it was if Windows did something else).
The wizard runs the detection again, repositions its windows and recomputes the player's edge in the new image (left ↔ right, top ↔ bottom): the player always sees the text upright.
Like Windows, it then asks whether to keep this orientation: without Start within 15 seconds, or with Exit, the screen returns to its original orientation, and Start then carries on without flipping (tables upside down).
The choice of rotation is in `vpxOrientationFix` (`packages/core/src/vpx.ts`): a flip, which keeps the resolution and the layout of the other screens; a quarter turn only for a Windows portrait screen seen from the side.
The sync, on the other hand, does not touch the orientation: it reports the problem and points to the wizard.
With another cabinet frontend installed or running (PinUP Popper, PinballX, PinballY), the first Start flips nothing: it warns that the orientation is a Windows setting that the other frontend is subject to as well; Start flips anyway, Exit keeps the Windows orientation (see [Coexisting with another cabinet frontend](coexisting-with-another-cabinet-frontend.md#coexisting-with-another-cabinet-frontend)).

The saved edge applies to the orientation Windows had at the time of the wizard, stored with the screen (`lastSeen.rotation`).
If it later changes outside the wizard (Settings > Display, driver, waking from sleep), the image rotates under the player: `currentFlipperEdge` (`packages/core/src/layout.ts`) rotates the saved edge by the difference between the two orientations, and this current edge is the one used for framing, for the sync's "à l'envers" (upside down) warning, for rotating Cyber Pinball's windows on the playfield (`playfieldRotation`) and for the edge suggested when the wizard is run again.
If no orientation was recorded at save time, the saved edge is kept as is.

A model saved before this step gets no framing key until the wizard has been run again.

#### Desktop orientation on exit

After quitting Cyber Pinball, the desktop and Start menu on the playfield screen stayed upside down.
The wizard rotated the screen with `CDS_UPDATEREGISTRY`: the Windows setting changed for good, desktop included, and nothing gave it back on exit.
Neither the menu nor VPX touched the orientation; only the wizard did (`WINDOWS_CHANGES`, `packages/core/src/coexistence.ts`).

Windows now keeps its orientation, and Cyber Pinball only rotates the screen while it is open (`SessionOrientation`, `packages/core/src/sessionorientation.ts`; `app/src/display-orientation.ts`):

- **Playing orientation**: the wizard records in the model the Windows orientation in which it configured the playfield, when it had to change it (`playfield.windowsRotation`).
  Every start (menu, wizard, settings) gives it back to the screen, before opening the windows, through a dynamic change: nothing is written to the Windows setting, and restarting the PC always gives the desktop its orientation back.
- **Origin recorded before touching anything**: before the first rotation, each screen's original orientation (fingerprint, GDI name, origin, orientation given) is written to `<data>\orientation-ecrans.json`, which survives a crash.
  The file goes away once no screen is rotated any more.
- **Every exit gives it back**: "Quitter Cyber Pinball" (Quit Cyber Pinball), closing the last window, an update, the dedicated cabinet (exit code 77) go through `will-quit`, before the dedicated cabinet's own exit (`main.ts` imports `display-orientation.ts` first), then through `process.on('exit')` as a last resort (`app.exit`).
  A relaunch (menu ↔ wizard, language, configuration, Shell Launcher) hands over (`handOverOrientation`): the next process picks up the file, and the screen does not rotate in between.
- **Crash, forced stop**: the file stays; at the next launch, a screen still in the orientation Cyber Pinball gave it (or back to its origin after a restart) keeps its recorded origin; a screen the user has rotated in the meantime keeps its own, which becomes the origin.
  Shutdown, restart and sleep from the power module: since nothing is written to the Windows setting, the screen comes back in its own; on waking from sleep, if Windows has put its setting back (screens enumerated again), the session takes back the playing orientation (`check`, on `display-added`, `display-metrics-changed` and `resume`).
- **Desktop mode**: "Bureau Windows" (Windows desktop) gives the Windows orientation back (`suspend`), returning takes back the playing one (`resume`); after a quarter turn, the menu relaunches to reposition its windows.
  That relaunch, like those for the language, the DMD type or a configuration, takes back the menu's place (`packages/core/src/menu-resume.ts`, argument `--reprendre-menu=`): the table selected on the wheel, and the open system menu section, the selection on the chosen entry, without running it.
  "Redémarrer Cyber Pinball" (Restart Cyber Pinball) starts from scratch, opening included.
  An unknown section, guest mode or first-start screens (terms, profile) leave the menu on the wheel.
- **Games from other programs**: **Pinball FX3** starts on the playfield screen as Windows orients it, as with another front-end (`GAMES_ON_WINDOWS_ORIENTATION`), so that the orientation entered in its cabinet mode holds from one front-end to another.
  The Windows orientation comes back just before it starts, no longer moves during the game, and the playing orientation comes back on returning to the wheel; an orientation entered in FX3 on the old basis is reported once, with the value to enter (see [Pinball FX3 tables](pinball-fx3-tables.md)).
  **Future Pinball** keeps the session's playing orientation: started on the Windows one, its table showed upside down.
  **Pinball FX** too, and it rotates its image like the front-end's windows (see [Pinball FX tables](pinball-fx-tables.md)).
- **Warning**: an orientation Windows refuses to give back is written to the log ("Orientation : … n'a pas repris son orientation d'origine (0°) : … Paramètres > Affichage > Orientation de l'écran la rétablit.", i.e. did not get its original orientation back; Settings > Display > Display orientation restores it) and to the file; the next start tries again and repeats it in a banner ("À la dernière fermeture de Cyber Pinball : …", when Cyber Pinball last closed).
- **Cabinets configured by an older version** (`legacyOrientation`): a model without `windowsRotation`, a recorded orientation (`lastSeen.rotation`) other than 0° and such that the wizard would have chosen it starting from 0° (`vpxOrientationFix`).
  If Windows has lost it (restart), the menu records the playing orientation and takes it back without asking.
  If Windows still keeps it, the menu offers: "Bureau Windows tourné par Cyber Pinball" (Windows desktop rotated by Cyber Pinball); Start gives 0° back to the Windows setting (the only write to that setting, `giveBack`) then puts the playing orientation back for the session, and the screen flickers twice; Exit keeps the desktop orientation as it is.
  Either way, the question does not come back.
  Guest mode: Start does nothing there (`message.orientation`).

Simulated screens (`CYBERPINBALL_DISPLAYS`, unattended run, off screen): the rotation goes to `<data>\ecrans-simules-orientation.json` (`windows`: the setting; `session`: the dynamic change, lost on restart), which `observedDisplays` applies to the screens; no real screen rotates.
Evidence: `packages/core/src/test/sortie-orientation.test.ts` (every exit path on the four sets of `packages\core\ecrans-simules`, with a simulated Windows that counts writes to its setting; recovery after a crash, Windows refusing, repair).

#### Direction of tables, checked

A table could show upside down after every restart or session reconnection (seen on a PinCab: 4K playfield lying flat, player at the left edge of the image, Windows flipped by the wizard): Windows had given its own setting back to the playfield screen.
The menu, which follows the current orientation (`currentFlipperEdge`), stayed upright; VPX, which only looks at the shape of the window, drew the table upside down, and it had to be turned around in VPX's menu at every startup.
The session now gives the game orientation back at startup, on wake and on reconnection (previous section); what follows checks it and shows it.

- **Cabinet health** (`orientationFacts`, `orientationVerdict`, `packages/core/src/gameorientation.ts`): under "Screens", after the recognised configuration, "Tables the right way for you, flippers …" with the Windows orientation, or, blocking, "Tables upside down: VPX will draw them with the flippers …, you stand …", with the cause: the game orientation Windows did not take back, or, with no orientation to take back, "run “Playfield orientation and size” again".
- **Log**: the sync's warnings also go to the console ("Synchronisation : …"), including "Tables will show upside down".
- **Fix made in VPX's menu**: to turn a table the right way, one had to switch to manual framing and rotate the view, which VPX saves in the table's `.ini` (`CabinetAutofitMode = 0`, `ViewCabMode`, `ViewCabRotation`).
  Cyber Pinball does not overwrite it.
  When the `.ini` gives the view and its rotation, its direction is known (`manualCabRotation`, `packages/core/src/vpx.ts`, after `ViewSetup::GetRotation`: in "Window" mode the rotation is added to 270° for a landscape window, to 0° for a portrait window; in "Legacy" or "Camera" it stands alone): the diagnosis does not report "Table de travers" (Table sideways) for a table the right way for the player, and says where VPX will draw the others.
  A fix made while Windows had lost the game orientation turns the table upside down once the orientation is taken back: the diagnosis reports it, and its repair removes `BGSet` and `CabinetAutofitMode` from the table's `.ini` (the remaining rotation is ignored by automatic framing).
- **Test**: `packages/core/src/test/gameorientation.test.ts` pins the invariant on a landscape screen and a native portrait screen, for the four Windows orientations and the four player edges: wizard, exit, simulated restart (Windows gives its setting back), session start, then reconnection (`check`); each time, VPX draws the game on the player's side, the menu too, with no warning, and nothing is written to the Windows setting.
  A cabinet configured by an older version and back at 0° gets its direction back (`legacyOrientation`).

### Table framing, during a game

A table's framing is judged on the running table, not on a list of values.
Table details screen > "Régler l'affichage en partie" (Adjust display in game) launches the table with `-PovEdit` instead of `-Play` (VPX 10.8.1, `AppCommands.cpp`): the same game, with VPX's menu open from the start on "Point Of View".
The details screen's "Ajuster la vue" (Adjust the view) screen, which picked these values outside a game and then tried them out, was removed, together with its `-TableIni` trial run.

With automatic framing, VPX recomputes the cabinet view after reading the table's overrides: the `[TableOverride] ViewCab*` keys only apply with manual framing.
The "Point Of View" page therefore only offers what the framing reads again (according to the VPX 10.8.1 code):

| Mode (`[Player] CabinetAutofitMode`) | Settings on the page | Effect |
| --- | --- | --- |
| "Fit Table" (1) | the mode and `CabinetAutofitPos` (0 to 20 %) | position of the bottom flippers on the screen; higher up, the apron rises into the screen, at the expense of the top of the table |
| "Fit Screen" (2) | the mode only | the full length of the table, stretched or squeezed |
| manual (0) | offsets, scales, glass, rotation, then `ScreenPlayerX/Y/Z` | a hand-set view, which the diagnosis reports when a table forces it |

- **Save** (Start) > "Save as Table Override": in the table's `.ini`.
  Back on the details screen, it says "Affichage enregistré pour cette table" (Display saved for this table) if that file changed.
- **Outside a game**, these keys can no longer be changed for a table: in "Réglages de cette table" (This table's settings), they carry the "En partie" (In game) badge and only the table's own value can be removed (`isLiveVisual`, `packages/core/src/vpx-settings.ts`); the table's essentials no longer list them.
- **Diagnosis**: "Cadrage manuel imposé par la table" (Manual framing forced by the table) when the table's `.ini` (often shipped with it, set up for its author's screen) contains `CabinetAutofitMode = 0`; the repair removes the key, and the old file goes to the trash.
  When that `.ini` also has its own cabinet view (`[TableOverride] ViewCabHOfs`, `ViewCabVOfs`, `ViewCabScale…`, `hasOwnCabinetView`), set in game or brought in, it is no longer a problem but information, "Framing set for this table" (`manualView`): VPX plays it as it was saved for it.
  Its fix, "Switch this table to automatic framing", writes `CabinetAutofitMode = 1` instead of removing the key: going back to automatic lasts from one game to the next.

### Framing of a table brought in

A table brought in from another installation (PinUP Popper, PinballX, VPX alone) may have in its `.ini` the framing set for it on the old cabinet: under VPX 10.7 or 10.8.0, the cabinet view touched up and saved for that table alone (`[TableOverride] ViewCab…`).
VPX 10.8.1 adds automatic framing, which Cyber Pinball enforces for the direction of tables: in automatic framing, those values are no longer read, and the table arrived "not set up".
VPX 10.8.1's point of view saves the framing mode with the view: an `.ini` that has the view without `CabinetAutofitMode` comes from an older VPX.
Cyber Pinball then sets manual framing (`CabinetAutofitMode = 0`) there for that table alone, **as long as the game still faces the right way** on your cabinet (`importedViewFinding`, [tableview.ts](../../packages/core/src/tableview.ts), from the flipper edge VPX would draw with that view); otherwise, nothing is kept.
This is the finding "Framing set for this table" (`importedView`, information), repaired before each game (`PUP_PLAY_REPAIRS`) and at installation, so also for tables already imported.
A framing already chosen for the table (key present) is never touched; "Adjust display in game" lets you touch it up or switch to automatic framing.
Test: [cadrage-repris.test.ts](../../packages/core/src/test/cadrage-repris.test.ts).

### Choosing and importing a point of view (beta)

Table sheet > Manage table… > Point of view identifies the framing: shared cabinet framing, the table's supplied POV or an imported POV.
Import a POV… accepts a .pov or VPX 10.8 POV .ini from Downloads, a USB drive or disk; it is stored with this table and affects only it.
A POV putting the flippers on the wrong side is refused with its reason; a supplied POV is offered in diagnostics when framing is already chosen.
Switching to manual framing without a saved view is not a per-table view: diagnostics offers cabinet framing.
With patched VPX, Fit Table keeps the back of the playfield on screen: lower decoration and empty space above are cropped first, then width stretching of at most 15% fills the gap.
Keep the top of the table and Maximum width stretch are available in VPX settings > Table view and framing, and VPX's in-game menu with eye height and distance.
