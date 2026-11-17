[Français](../manuel/plugins-de-vpx-backglass-pup-et-dmd.md) · English · [Manual contents](../manual.md)

## VPX plugins: backglass, PuP and DMD

VPX 10.8.1 draws the backglass, PuP packs and the DMD itself, through its plugins ("plugins" mode): `ScreenRes.txt`, `B2STableSettings.xml` and `DmdDevice.ini` are read by nobody in that mode.
Everything therefore goes through `VPinballX.ini`.
Classic mode (VPX 10.8.0, COM components) will come later; DOF goes through the VPX DOF plugin (see [LED and feedback (DOF)](led-and-feedback-dof.md#led-and-feedback-dof)).

**Who draws on each window.**
Several plugins can draw on the Backglass, ScoreView (DMD role) and Topper windows.
For each frame, VPX tries their renderers in descending order of `Priority.<moteur>` and keeps the first one that draws (`player.cpp`, `OnAuxRendererChanged`).
Without these keys, they are all 0 and the order depends on the order in which plugins load.
A PuP pack only draws when it has a video to show: placed in front, it leaves the .directb2s backglass visible the rest of the time.

Keys written (`vpxSettingsFor` and `vpxPluginDefaults` in `packages/core/src/vpx.ts`, `packages/core/src/dmd.ts`):

| Key | Value | Managed |
| --- | --- | --- |
| `[Backglass] Priority.PUP`, `Priority.B2S` | 100, 50; if the backglass role is assigned | yes |
| `[ScoreView] Priority.PUP`, `Priority.B2S`, `Priority.ScoreView` | 100, 50, 10; if the DMD role is assigned. DMD-only screen: `Priority.B2S = 0` ([DMD screen](#dmd-screen-fulldmd-or-dmd-only)) | yes |
| `[Topper] Priority.PUP` | 100; if the topper role is assigned (B2S does not draw on the topper) | yes |
| `[Plugin.B2SLegacy] Enable` | 0 as long as B2S is enabled: both answer tables that request `B2S.Server`, and the last one loaded wins | yes |
| `[Plugin.B2S] ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos` | 1 and 1 if the DMD role exists and is not a DMD only. The FullDMD of a .directb2s goes in front of ScoreView: without the overlay, only its frame would be visible. The DMD's position is searched for in the image | no, offered if the key is empty |
| `[Plugin.DMDUtil] Enable`, and `ZeDMD`, `PIN2DMD` or `Pixelcade` | 1 for the recognized real DMD or one set to "oui" (yes), 0 for a model set to "non" (no); nothing without a real DMD or a choice | yes |
| `[Plugin.DMDUtil] ZeDMDWiFiEnabled`, `ZeDMDWiFiAddr` | the ZeDMD over Wi-Fi of "DMD réel" (Real DMD): 1 and its address, or 0 once turned off; nothing as long as it has never been set | yes |
| `[Plugin.DMDUtil] DMDServer`, `DMDServerAddr`, `DMDServerPort` | "Image du menu" (Menu image): 1, `127.0.0.1` and `6789` when the DMD server holds the display, with `ZeDMD`, `PIN2DMD`, `Pixelcade` and `ZeDMDWiFiEnabled` at 0 (only the server opens the hardware); 0 otherwise, and VPX opens the DMD itself; nothing as long as the menu image has never been set | yes |
| `[Plugin.PinMAME] PinMAMEPath` | `<racine>\pinmame`, if it contains `roms` | no, offered if the key is empty |
| `[Plugin.PinMAME] Cheat` | 1 if the PinMAME plugin is enabled. Without it, a WPC ROM (Williams and Bally, 1990-1999) runs its memory test, “TESTING…”, before every game; when on, PinMAME skips that check (`wpc.c`, `MACHINE_INIT`). Rules and scores unchanged. Setting « Démarrage rapide des ROM » (Fast ROM startup) in the « Essentiels » (Essentials) tab | no, offered if the key is empty |
| `[Plugin.Serum] SerumPath`, `[Plugin.VNI] VniPath` | `<racine>\pinmame\altcolor`, if it contains a `<rom>\<rom>.cRZ` or `.cROMc` (Serum), `.pal` or `.vni` (VNI) | no, offered if the key is empty |

Each table first looks for its ROMs and colorizations in its own folder (`pinmame\roms`, `serum`, `vni`, `pinmame\altcolor`); the shared folders only come after.
The synchronization reports "B2S et B2SLegacy activés ensemble" (B2S and B2SLegacy enabled together) when both are enabled (B2SLegacy turned back on by hand, then kept).

**Real DMD.**
`probeUsbDevices` (`packages/win-displays/src/usb.ts`) lists the USB devices present through the Windows configuration manager (`CM_Get_Device_ID_ListW`) and reads their name and serial port from the registry, read-only.
No port is opened, whereas libdmdutil's detectors send a connection request to every port.
Recognized identifiers (`HARDWARE_DMD_IDS`):

| DMD | VID:PID | Source |
| --- | --- | --- |
| ZeDMD | `303A:1001` (ESP32-S3), `1A86:55D3` (CH343); `1A86:7523` (CH340) and `10C4:EA60` (CP210x), common converters flagged "à confirmer" (to be confirmed) | libzedmd's automatic detection filter (`ZeDMDComm.cpp`) |
| PIN2DMD | `0314:E457` | libdmdutil (`PIN2DMD.cpp`) |
| Pixelcade | `1B4F:0008` (IOIO-OTG board) | IOIO firmware; libdmdutil recognizes it by its "IOIO" reply |

DMDUtil finds the port itself: Cyber Pinball writes neither `ZeDMDDevice` nor `PixelcadeDevice`.
When the DMD is unplugged, its keys are kept as they are.
`npm run probe` shows the recognized DMDs (`npm run probe -- --usb`: all USB devices).

**The DMD section (System menu > Cabinet > DMD).**
All DMD settings together (16/11/2026): "Écran du DMD" (DMD screen: FullDMD or DMD only, see [DMD screen](#dmd-screen-fulldmd-or-dmd-only)), "DMD du menu" (Menu DMD: live or classic) and "Couleur du DMD" (DMD colour) (see [Menu DMD](game-media.md#menu-dmd)), "DMD réel" (Real DMD).
The DMD on the wheel stays on each table's page, which sets it for that table only.

**System menu > Cabinet > DMD > "DMD réel" (Real DMD, beta).**
The screen (`app/src/hardware-dmd-menu.ts`) shows the recognized DMDs, what will prevent VPX from opening them, and sets each model.
Support stays in beta until equipped cabinets have confirmed it: the "BÊTA" (BETA) badge says so on the entry.

- **One choice per model**, Start to go from one to the next: "automatique" (automatic: on when recognized, keys kept once unplugged), "oui" (yes: always on, DMDUtil looks for it at the start of each game), "non" (no: never, an Arduino board on a CH340 no longer gets DMDUtil's handshake).
  In automatic, a ZeDMD recognized on a CH340 or a CP210x is turned on, with the advice to switch to "non" (no) if it is not one.
- **ZeDMD over Wi-Fi**: invisible to USB.
  Start asks for its name or IP address (`zedmd-wifi.local` without any setting, libzedmd's name); empty, Wi-Fi is turned off and the address kept. libdmdutil opens it even without `ZeDMD = 1` (`DMD::FindDisplays`).
- **Drivers**, read without opening anything: the driver service (registry `Service`) and the Device Manager code (`CM_Get_DevNode_Status`).
  The PIN2DMD goes through libusb, which needs a generic driver (WinUSB, libusbK or libusb0); another driver, or none, is reported with the PIN2DMD tool or Zadig.
  libusb only opens libusb0 (the libusb-win32 of older PIN2DMD tools) and libusbK through `libusbK.dll`, loaded from `System32` only (`windows_winusb.c`, `winusbx_init`): without it, the driver is reported with the advice to switch to WinUSB with Zadig (`libusbKDll`, read by `packages/win-displays/src/usb.ts`).
  A ZeDMD or a Pixelcade without a COM port lacks its chip's driver (WCH CH340/CH343, Silicon Labs CP210x).
- **PIN2DMD probe**: libdmdutil gives up silently when `libusb_open` or `libusb_claim_interface` fails (`PIN2DMD.cpp`, `PIN2DMDInit`); the VPX log says nothing and the DMD stays dark.
  The probe (`app/src/sonde-pin2dmd.ts`, the executable in Node mode, with no window) takes the same steps with VPX's `libusb64-1.0.dll`, then releases everything.
  It runs when the front-end starts, after a game and after a "Real DMD" choice (`applyMenuDmdServer`), never during a game nor while the DMD server holds the board.
  Its verdict is attached to the PIN2DMD (`libusbProbe`): board already opened by another program (codes `-3` and `-6`, with the open programs recognised), driver libusb cannot use (`-12`), board not found, other error.
  The page, cabinet health and the points to check before the game say it; opened then released, the row says "VPX will be able to light it".
- **Programs that hold a real DMD** (`DMD_HOLDER_PROGRAMS`, `dmd.ts`): dmdext, PinUP Popper, PinballX, PinballY, another VPX, Future Pinball.
  Open at synchronization time, they are reported before the game for every model: only one program at a time holds a PIN2DMD or a serial port.
- **PIN2DMD size**: the name the board gives to USB, read by Windows when it is plugged in (`DEVPKEY_Device_BusReportedDeviceDesc`): "PIN2DMD" 128 × 32, "PIN2DMD XL" 192 × 64, "PIN2DMD HD" 256 × 64, as libdmdutil does (`PIN2DMD.cpp`).
  The ZeDMD gives its size only when connected.

The choices are kept with the cabinet configuration (`cabinet.json`, `hardwareDmd`) and picked up by the synchronization that precedes each game.
Cabinet health has a "DMD réel" (Real DMD) check: ready, or a driver to install.
Ready without "Menu image", it says that this choice makes the real DMD show the menu too.

**Menu image (beta).**
The "Image du menu" (Menu image) setting of "DMD réel" (Real DMD), off by default: the real DMD also shows the menu DMD between games, not only during them.
Only one program can hold the display: libdmdutil's server, `dmdserver`, started hidden by Cyber Pinball.
The menu and VPX send it their frames in turn (`app/src/dmd-server.ts`, protocol in `packages/core/src/dmdserver.ts`).

- **The server**: `cyberpinball-dmdserver.exe` (`packages/dmdserver`, shipped in `natif\dmdserver`), libdmdutil's `server.cpp` built on the `dmdutil64.dll` that VPX itself installs in `plugins\dmdutil`.
  It is exactly the libdmdutil version of VPX 10.8.1 (commit 3485e2e), which handles ZeDMD, ZeDMD over Wi-Fi, PIN2DMD and Pixelcade.
  Nothing is downloaded, no DLL is copied.
  The Windows archives published by libdmdutil do not fit: the 0.11.0 one lacks the DLLs `dmdserver.exe` depends on, and 0.10.0 does not know the PIN2DMD.
  Before any loading, the DLL's SHA-256 fingerprint is compared with those in `packages/dmdserver/src/empreintes.h`: an unknown DLL is never loaded and stops the server with code 6.
  The server calls the DLL's C++ classes, and another libdmdutil version can change their memory layout without changing its functions: only the fingerprint tells reliably.
  The recognised DLL is then loaded on demand from the folder passed with `-d`, and all its functions are bound before looking for a DMD: a missing DLL stops the server with code 3, a missing function with code 4, without any Windows error window.
  `--verifier` runs these checks alone and gives the fingerprint (`node scripts/dmdserver.mjs --verifier --vpx <VPX folder>`).
- **Start**: when the menu starts, after a "DMD réel" choice and when returning from a game, if at least one DMD is on (recognized, set to "oui" (yes), or ZeDMD over Wi-Fi).
  `dmdserver.ini` (data folder) takes the per-model choices: Serum and PuP stay off (`AltColor = 0`, `PUPCapture = 0`), because VPX sends frames that are already coloured.
  `-w`: the server waits for the DMD instead of stopping.
  If it stops (DMD unplugged, crash), it is restarted 2 s later.
  After code 3 or 4 it is not: the reason is shown in "DMD réel" and in cabinet health.
- **Frames**: the menu DMD, live or classic, in RGB24 128 × 32, in the chosen colour (an off dot is black on the real DMD).
  During a game, the menu disconnects before VPX connects, then reconnects and sends its last frame again on return.
- **VPX**: the synchronization writes `DMDServer = 1` only when the server holds the display and the menu is connected to it.
  Otherwise (server missing, waiting for the DMD, stopped), it writes `DMDServer = 0` and the per-model keys, and VPX opens the DMD itself as without the menu image.

### Several roles on one screen: zones

A two-screen cabinet often puts the backglass and the DMD on the backglass monitor.
A cabinet without a DMD screen embeds the DMD in the playfield image.
A desktop PC puts everything on one screen: the table on one side, the backglass on the other.
In the cabinet model, several roles can therefore point to the same screen, each in its own zone (`zones`), the playfield included.
A zone is a rectangle expressed in fractions of the screen image (0 to 1): it survives a resolution change.
It can keep an aspect ratio (`aspect`, width over height: 16/9, 4…): it is then resized without changing its proportions.
Without a zone, the role fills the whole screen, as before.
Code: [packages/core/src/zones.ts](../../packages/core/src/zones.ts).

VPX 10.8.1 can do both, without any third-party tool (`src/renderer/Window.cpp`, `Renderer.cpp`):

| The role is… | Keys written | Effect in VPX |
| --- | --- | --- |
| alone on its screen | `<Préfixe>Output = 1`, `FullScreen = 1`, `WndX = WndY = 0`, `Width` and `Height` of the screen | borderless full-screen window |
| in a zone of a screen (playfield included) | `Output = 1` (not for the playfield), `Display`, `FullScreen = 0` ("Windowed"), `WndX`, `WndY`, `Width`, `Height` of the zone, in pixels relative to the screen | borderless window placed over the zone (all VPX windows are borderless) |
| in the playfield zone, on its screen | `Output = 2` ("Embedded in playfield"), `WndX`, `WndY`, `Width`, `Height` of the zone, relative to the playfield window | drawn inside the playfield image, on a black background, after the table: no window to keep in the foreground |

A role on the playfield screen but outside its zone (desktop PC) is a separate window.
Table framing follows the playfield window, not the screen: cabinet view when the window is taller than it is wide, `ScreenWidth` and `ScreenHeight` set to the zone's actual size.
"Garder" (Keep) on a size changed in VPX brings it back to the whole screen.

**Stacking order.**
VPX has no setting for it: embedded displays are drawn backglass, then DMD, then topper (`Renderer.cpp`), and it is Windows that stacks two overlapping windows.
Nothing prevents two zones from overlapping (a DMD placed over the bottom of the backglass, for example): this is reported for information, along with what will be in front.
Only two roles assigned to the same screen with no zone for either of them give a warning: that is an oversight.

**No per-zone rotation.**
VPX 10.8.1 only has rotation settings for the table view (`ViewDTRotation`, `ViewCabRotation`…) and for VR: its Backglass, ScoreView and Topper windows, and their embedded displays, are always drawn in the orientation of the Windows image.

**DMD window: FullDMD and DMD layered.**
The DMD role's zone is the ScoreView window's zone.
It has two layers: at the back, the FullDMD (the FullDMD image of the .directb2s, or screen 5 of a PuP-Pack, which the PUP plugin takes as the ScoreView root, falling back to screen 1: `PUPManager.cpp`); on top, the ROM's DMD, which the plugins place in the window themselves (B2S: `ScoreViewDMDOverlay` and `ScoreViewDMDAutoPos`, which looks for the DMD's place in the image; PuP: screen 1 placed over screen 5 by `CustomPos`).
A zone therefore does not need to target the 128×32 DMD: it gives the FullDMD's place.
What the screen shows, FullDMD or DMD only, is said once and for all ([DMD screen](#dmd-screen-fulldmd-or-dmd-only)).
`splitBackglassDmd` splits a screen between the backglass at the top and a centered DMD strip at the bottom, at the requested proportions (4:1 for a DMD alone, 16:9 for a FullDMD), taking at most one third of the height.

- **Synchronization**: reports two roles overlapping on one screen (the case of two roles assigned to the same screen without a zone), an invalid zone in `cabinet.json` (the whole screen is then used), a role embedded over the whole playfield, and an embedded display that the player would see sideways or upside down: VPX does not rotate embedded displays.
- **Screen layout** ([app/src/arrange.ts](../../app/src/arrange.ts)): a wizard step after the roles, opened on "Terminer" (Finish) (a Start keeps everything as it is), or on its own from the system menu > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration) > "Disposition des écrans" (Screen layout), or `--assistant --disposition`; at the screens step, "Placer librement…" (Place freely…) opens it on a role and returns to the wizard afterwards.
  The panel appears on the playfield screen; each screen shows its zones, the selected one with its corners.
  Rows: the zone (any role), its screen ("Aucun écran" (No screen) for a secondary role), the kept aspect ratio ("Libre" (Free), 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), full screen (with a locked ratio: the largest zone at that ratio, centered), horizontal and vertical position, width, height, exact size, exact position, placement above, below, left or right of another role on the same screen (shrunk, ratio kept, if there is not enough room), alignment to an edge or to the center, snapping, and "Annuler les changements" (Undo changes).
  Position and size are free to the pixel across the whole screen; a zone never leaves the screen and stays at least 16 px on each side.
  Opened from the menu, the step starts on the "Zone" row; in the wizard, on "Terminer".
  The panel docks at the top or the bottom, opposite the selected zone when that zone is on its screen.
  - **With the buttons**: flippers to choose a row, Start to open it, flippers to adjust to the pixel (immediate preview; held down, they speed up to 64 px per step), Start to confirm, Exit to cancel.
  - **With the keyboard**: arrows to move the zone (row closed) or to adjust in both directions; digits then Enter for the exact size (width only when a ratio is locked) and for the exact position (X, then Y).
  - **With the mouse**: click a row, or a zone to select it; drag a zone to move it, even onto another screen (it moves there at once, at the same size if it fits, and becomes embedded if it lands in the playfield zone); drag a corner to resize it, the opposite corner staying in place.
    Each zone shows its corners and its label (role, size, full screen, window or embedded), placed in the first corner of the zone that nothing on the screen covers (top left as a rule; on a playfield rotated by 270°, the panel moves to the left and the playfield label to the right; `placeZoneLabels`, `app/renderer/screen.js`), and each screen without the panel reminds you of the gesture in its hint line, at the bottom, in the page flow: laid as a banner over the screen, it covered the label of the top zone (cabinet backglass).
    Dragged edges snap within 12 px to the screen's edges and middle and to the edges of the other zones (`snapRect`); the "Aimantation" (Snapping) row turns it off, or hold Alt during the gesture.
    The playfield cannot be moved to another screen with the mouse: the roles step decides that.
  - **Layout on its own**: saves the model and only rewrites the windows and the framing in `VPinballX.ini`; a role whose screen is merely unplugged keeps its screen.
- **Adjusting in VPX**: a windowed or embedded display moved or resized in the VPX interface (the window's display page, which frames the embedded display) is reported at startup like any key changed by hand.
  "Garder" (Keep) takes it back into the role's zone, and the key stays managed.
  A full-screen window that was retouched is left to the user.
- **PuP-Packs**: choosing the pack option compares the proportions of the zone, not those of the whole screen, and follows the type of the DMD screen (FullDMD or DMD only).
- **Screen wizard**: at the DMD step, the flippers offer the free screens (a wide screen twice: FullDMD on the whole screen, then DMD only as a centered 4:1 strip), then the bottom of the backglass screen (a 4:1 strip for a DMD alone, or 16:9 for a FullDMD with the DMD on top; the backglass keeps the top) and embedding in the playfield (4:1, at the edge opposite the flippers, over 40% of the width).
  A two-screen cabinet therefore always has a place for the DMD.
  The offered zone is drawn on the screen, dotted, at the exact place where VPX will show it.
  The saved layout is offered again by default, unchanged if it was retouched in VPX since then ("comme enregistré" (as saved)).
  Fine adjustment is done in VPX (see above).
- **Menu**: one window per physical screen, not per role.
  Roles that share a screen are drawn in the same window, each in its zone; an embedded DMD is drawn on the playfield without rotating, as in VPX.
  Two windows on the same screen would fight over the full-screen state that covers the taskbar (`coverDisplay`).
  The playfield page fits within its zone, sizes included (`cqmin`, relative to the zone).

### DMD screen: FullDMD or DMD only

VPX 10.8.1 has only one window for the DMD and the FullDMD (ScoreView).
Yet the screen that shows it does not play the same part on every cabinet, and Cyber Pinball has you say it once and for all (`dmdKind` in the cabinet model: `fulldmd` or `dmd`).
Code: [packages/core/src/dmdscreen.ts](../../packages/core/src/dmdscreen.ts).

| | FullDMD | DMD only |
| --- | --- | --- |
| Screen | a whole wide (16:9) screen, often the speaker panel; or a 16:9 strip under the backglass | a 4:1 strip: real DMD screen, strip under the backglass, 16:9 screen behind the speaker panel's cutout, embedded in the playfield |
| Menu | the `(FullDMD)` media over the whole screen (`(DMD)` shrunk if missing) | the `(DMD)` media in the strip (`(FullDMD)` shrunk if missing), black around it |
| VPX | `[ScoreView]` full screen; `Priority.B2S = 50`: the `.directb2s` FullDMD image, the game DMD inset (`ScoreViewDMDOverlay`, `ScoreViewDMDAutoPos`) | window on the strip; `Priority.B2S = 0`: the game DMD through ScoreView, without the FullDMD image squeezed into the strip |
| PuP-Packs | option that puts its screen 5 (FullDMD) in the DMD window | option that puts its screen 1 (DMD) there, or nothing |

- **Where to say it**: in the wizard, "Écrans et rôles" (Screens and roles) step: a free wide screen is offered twice for the DMD, "FullDMD ?" (the whole screen) then "DMD en bande 4:1 au centre ?" (DMD as a 4:1 strip in the middle?); a screen that is already 4:1 only as "DMD ?"; the bottom of the backglass at 4:1 (DMD only) or 16:9 (FullDMD); embedding in the playfield is always a DMD only.
  Placed freely, the DMD takes the type of its zone's shape.
  Or, without redoing the wizard, system menu > "Borne" (Cabinet) > "DMD" > "Écran du DMD" (DMD screen) (also in "Configuration de la borne" (Cabinet setup), after the layout): the current state, then "C'est un FullDMD" (It's a FullDMD) and "C'est un DMD seul" (It's a DMD only), each with its sketch.
  Start saves and relaunches the menu; its windows, `VPinballX.ini` and the PuP-Packs follow.
  The zone only changes if it does not have the shape of the choice: a FullDMD alone on its screen gets the whole screen; a DMD only, a centered 4:1 strip; under the backglass, the bottom strip at the new shape (`withDmdKind`).
  A strip that already has the right shape is kept as it is.
- **Screen layout**: the type is kept as long as the DMD zone does not change; dragged to another shape, the shape decides (`dmdKindAfterArrange`, boundary at 8:3).
  The zone is named after the type ("FullDMD" or "DMD").
- **Configurations from before this choice**: nothing is rewritten.
  Without `dmdKind`, the type is deduced as before from the zone's proportions (4:1 or 16:9, boundary at 8:3).
  Only one case is ambiguous: a DMD strip alone in the middle of a wide screen that shows nothing else (`dmdKindQuestion`), perhaps a FullDMD cut down by mistake (for example: a 4.78:1 strip in the middle of a 16:9 screen; the menu showed the FullDMD image shrunk into it).
  Synchronization reports it ("À vérifier", To check), the menu announces it at startup with a banner, and the "Écran du DMD" entry carries the red dot until it is answered.
  A type that contradicts the zone's shape (FullDMD in a strip, DMD only on the whole screen) is reported for information.
- **Background of screens without the playfield**: backglass, DMD and topper show their zones on pure black, never the ambient background nor the 9:16 playfield frame of the desktop menu (`#media-bg`, specific to the playfield; `layout-check.ts` rejects it on any other screen).
- **VPX 10.8.1 limit**: in the DMD window, VPX keeps the first renderer that draws.
  The PUP plugin never draws the table's DMD: for a table that draws its own, the doctor gives the window back to the DMD (`[ScoreView] Priority.PUP = 0`, `pupHidesDmd` rule), and the pack's screen 5 does not show there during play.
- **Tests**: [dmdscreen.test.ts](../../packages/core/src/test/dmdscreen.test.ts).

### FullDMD artwork in game

Case of *The Walking Dead* (16:9 DMD screen): in the menu, the FullDMD screen shows the table's `(FullDMD)` media, artwork at the top and a frame at the bottom with a still DMD in it; in game, only a plain DMD stretched across the whole width was left.
Code: [fulldmdframe.ts](../../packages/core/src/fulldmdframe.ts), [fulldmdtable.ts](../../packages/core/src/fulldmdtable.ts), [app/src/fulldmd.ts](../../app/src/fulldmd.ts).

- **What shows in game**: VPX 10.8.1's ScoreView window, on the whole FullDMD screen.
  Three plugins can fill it, by priority: a PuP-Pack (screen 5, otherwise 1), the B2S plugin (FullDMD image of the `.directb2s`, `DMDImage`, with the DMD inset), then the ScoreView plugin, which draws the ROM, FlexDMD or UltraDMD DMD with its layouts (`plugins\scoreview\layouts\*.scv`: "Fit: Contain", "Glass-Dirty" glass).
  Neither dmdext nor Freezy: VPX's plugins do their job.
  On *The Walking Dead*: a `.directb2s` without a FullDMD image (only the backglass image), the PuP-Pack on its "No Topper BG and DMD seperate" option (screens 1 and 5 off): the ScoreView plugin drew alone, on the whole screen.
- **Where the artwork comes from**: the table's `(FullDMD)` media (VPinMediaDB, a 1920 × 1080 image or a video), which only the menu showed.
  The ScoreView plugin cannot draw a background image: the `- Image` visual of its layouts is rejected ("Not yet supported", `ScoreView.cpp`, commit af26b2d93), and its glass (`Glass`) only covers the DMD rectangle.
- **Options compared**: (a) Cyber Pinball keeps the artwork on the screen and places the DMD window in its frame: faithful to the menu, for every table (ROM, FlexDMD, UltraDMD), nothing to install, and the menu window already stays behind VPX during the game (in-game background); (b) the three-screen `.directb2s` or the PuP-Pack already dress the FullDMD: kept as is when that is the case, but many tables have neither, and the PUP plugin never draws the table's DMD (`pupHidesDmd`); (c) one `.scv` layout per table: impossible in 10.8.1, for lack of a background image.
  Chosen: (a), and (b) when the table already has it.
- **The frame** (`detectDmdFrame`): a rectangle whose four sides are clean edges, at least 40 % of the image wide, with a DMD's proportions (2.5:1 to 6.5:1); of a frame with several strokes (double neon, gold fillet), the inside is kept.
  A video is read at 10, 35, 60 and 85 % of its length, off screen, by the converter ([media-convert.ts](../../app/src/media-convert.ts)): the frame is the one most of those images show.
  The result is kept per media (path, size, date) in `data\cache\fulldmd-cadres.json`.
  On the cabinet: a frame found for *The Walking Dead*, *Game of Thrones*, *2001*, *Terminator 2*, *Star Trek* and *Goonies*; none in the *Guardians of the Galaxy* video.
- **Before each game** (`prepareDressing`): when the DMD screen is a FullDMD (not embedded in the playfield), the table has a `(FullDMD)` media with a frame (its own or the cabinet's, not the `.directb2s` image), it draws a DMD (unknown script: yes), and neither the `.directb2s` (FullDMD image) nor a PuP-Pack (DMD window, non-zero `Priority.PUP`) already dresses it, the table's `.ini` gets `[ScoreView] ScoreViewFullScreen = 0`, `ScoreViewWndX`, `ScoreViewWndY`, `ScoreViewWidth` and `ScoreViewHeight` on the frame (the media is shown whole and centred in the zone, as in the menu).
  The placement written is remembered in the `.info` (`CyberPinball.fullDmd.window`): Cyber Pinball updates it (other media, other screen) or removes it when there is no artwork any more; the menu log records it ("Habillage FullDMD (…) : …").
  Otherwise nothing changes: the DMD window keeps its whole zone.
- **During the game**: the menu window on the DMD screen keeps the artwork (`momentScreen`, `dressed`), still, or animated if "Media during the game" is set to "animated"; also when set to "off", since it is part of the display.
  The game's DMD sits in the frame, VPX's window on top.
- **Fine tuning**: in game, both MagnaSaves > "Position du DMD" (DMD position, below), or VPX menu > "Display Settings" > "ScoreView Display": position and size to the pixel, then "Save as Table Override".
  A placement that is no longer the one Cyber Pinball wrote is the user's: it is never touched again.
  The doctor shows it ("Écrans placés pour cette table", Screens placed for this table); "Revenir à la disposition générale" (Back to the general layout) removes it, and the frame found comes back at the next game.
- **Detection**: the doctor reports "Le DMD cacherait l'habillage FullDMD" (The DMD would hide the FullDMD artwork, `fullDmdHidden`, warning) when the DMD placement set for the table covers at least half of the artwork (`dressCoverage`; `ScoreViewFullScreen = 1`, for instance); the fix puts the DMD in the frame.
  During the game, the menu reads Windows' window stack again: a VPX window covering the artwork is logged ("Partie : le DMD de VPX recouvre … % de l'habillage FullDMD", `liveDressCoverage`).
- **Diagnosis of every table**: `npm run habillage` (`scripts\diagnostic-habillage.ps1`: Electron on a hidden Windows desktop, nothing appears on screen) lists each table, the frame found, the DMD placement in game, and marks "[À CORRIGER]" (to fix) those whose DMD would cover the artwork.
  Nothing is changed in the tables.
- **Tests**: [fulldmdframe.test.ts](../../packages/core/src/test/fulldmdframe.test.ts) (frame, video, placement on the screen, table `.ini`, invariant on simulated screens, doctor) and the `fullDmdHidden` trap in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### DMD set for desktop mode

Some recent tables choose where to draw their DMD with a table option of the VPX menu (F12), whose default value puts it in the desktop-mode scenery.
*JP's Space Cadet* v7.0 (JPSalas) is the example: its "DMD Type" option defaults to "Desktop DMD", a DMD made of flashers in the scenery, invisible in cabinet mode; FlexDMD is never created and VPX's DMD window stays black (11/17/2026, on a three-screen cabinet).
Code: [tableoptions.ts](../../packages/core/src/tableoptions.ts), finding in [doctor.ts](../../packages/core/src/doctor.ts) (`desktopDmdFinding`).

- **Reading the script** (`tableOptions`): the `Table1.Option(name, min, max, step, default, unit, Array(labels))` calls whose arguments are all written out literally, comments removed and lines continued with "_" joined back together; an option with a computed argument is ignored.
- **DMD option spotted** (`cabinetDmdOptions`): a list of labels whose default value names a desktop DMD or none ("Desktop", "DT", "Internal", "Playfield", "Backdrop", "Flasher", "Text box", "Apron", "None", "Off"…), whose name or one label mentions a DMD, and which offers FlexDMD, or else UltraDMD (which VPX's FlexDMD plugin also provides).
  Or a switch such as "Use FlexDMD" (Off/On, or 0/1 with no labels) off by default.
- **Writing** (`cabinetDmdIni`): VPX 10.8.1 stores the player's choice in `[TableOption]` of the table's `.ini`, under the option's name with every character that is neither a letter nor a digit turned into "_" ("DMD Type" gives `DMD_Type`, `PinTable::Option`); a list of labels is stored as the minimum plus the label's rank, a switch as 0 or 1.
  Cyber Pinball writes the FlexDMD value there only for a missing or empty key: a choice made in the VPX menu is never overwritten, and that menu shows and changes this setting like any other.
  A new `.ini` gets Windows line endings, like the ones VPX writes.
- **When**: only on a cabinet with a DMD screen or zone; at installation and before each game (`PUP_PLAY_REPAIRS`), without asking anything.
  The table is not modified.
- **Doctor**: finding "DMD réglé pour le mode bureau" (DMD set for desktop mode) (`dmdDesktopOption`), which names the option, its default value, the one chosen for the cabinet and the file, with the fix "Régler « DMD Type » sur « FlexDMD » dans …" (Set "DMD Type" to "FlexDMD" in …); it goes away once the key is written.
  Script readings move to version 10 (`FACTS_VERSION`, `app/src/vbs.ts`): tables already installed are read again.
- **Tests**: [tableoptions.test.ts](../../packages/core/src/test/tableoptions.test.ts) (reading the options, VPX keys, player's choice kept, doctor, new `.ini`, state of VPX's DMD window) and the `dmdDesktopOption` trap in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### DMD position during a game

Moving the DMD during a game was still complicated, VPX's menu mixing its many settings (the FullDMD's among them) without saying what they are for.
During a game, both MagnaSave buttons together (without them, Credit and Start; left Ctrl and right Ctrl on a keyboard) now open Cyber Pinball's **in-game settings**, "Position du DMD" (DMD position) first, before anything else.
Code: [dmdplace.ts](../../packages/core/src/dmdplace.ts) (positions, table `.ini`, menu), [app/src/in-game-menu.ts](../../app/src/in-game-menu.ts) (combination, windows, VPX's window), page [app/renderer/in-game-menu.html](../../app/renderer/in-game-menu.html).

- **What moves**: the DMD, that is VPX 10.8.1's "Visual Pinball Score View" window ([ScoreView]), where the ScoreView plugin draws the dots of the ROM, FlexDMD or UltraDMD.
  During the adjustment, Cyber Pinball moves and resizes it itself (`setWindowBounds`, `SetWindowPos` without activating it); Cyber Pinball's VPX plugin "CyberPinballDmd" makes VPX and ScoreView follow (below, "Resized in game").
  You see the real DMD move, on any screen of the cabinet.
- **VPX paused**: the panel's window takes the foreground; VPX loses it and pauses (`Player::OnFocusChanged`, `IsPlaying` requires its game window to have focus), and the buttons, keyboard and joystick alike, go to the menu.
  On leaving, VPX takes the foreground back, and the game resumes.
- **The combination** is read by Cyber Pinball while VPX is in the foreground: keyboard keys through `GetAsyncKeyState` (`keysDown`, codes from `windowsVk`), joystick buttons through SDL polling (`watchJoystickButtons`, `SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS`).
  It is no longer written to `[Input] Mapping.InGameUI` (`inGameMenuSetting` keeps F12 only, and removes the combination written before): VPX no longer opens its menu on top.
- **The menu** (on the playfield screen, in its zone, facing the player; on the side away from the DMD when it is on the same screen): "Écran" (Screen: each screen of the configuration, named after its roles), "Position horizontale", "Position verticale", "Largeur" (Width) and "Hauteur" (Height) (each on its own, to the pixel, around the centre; the format is released), "Format" (4:1 first, then free, 3:1, 2:1, 16:9…; when free, it gives the current proportions, "Libre · 4,4:1", and a left flipper brings back 4:1, width kept), "DMD" (shown or hidden), "Enregistrer pour cette table" (Save for this table), "Revenir à la position générale" (Back to the general position), then "Tous les réglages de VPX" (All VPX settings) and "Reprendre la partie" (Resume the game).
  An unavailable line stays there, greyed out, its reason given when you select it (DMD hidden, table without a position of its own, only one screen, no key opens VPX's menu).
- **No black bars** ([packages/core/src/scoreviewlayouts.ts](../../packages/core/src/scoreviewlayouts.ts)): VPX 10.8.1's ScoreView plugin places the DMD in its window according to a layout (`.scv`): the one whose proportions are closest to the window, as "Contain", the only `Fit` value it accepts (`ScoreView::Parse`, `Select`, `Render`).
  Its own layouts are in the DMD's format: a 4.5:1 or 3:1 window kept black bars.
  Cyber Pinball prepares `<data>\scoreview` at each VPinballX.ini synchronisation (`prepareScoreViewLayouts`, called by `syncVpxIni`) and offers it in `[Plugin.ScoreView] LayoutFolder`, written only when the key is empty: all the layouts of the installed VPX version, unchanged (alphanumeric displays, LCD, CRT, glass images), plus, for each DMD (128 × 32, 128 × 16, 192 × 64), stretched variants every 1.5% of proportions: the closest one fills the window to within 1%.
  Only from about half to twice the DMD's format, and never narrower than 1.9:1 (`MIN_FILL_ASPECT`): a whole 16:9 screen (FullDMD without a frame) is not a window cut for the DMD, which keeps its proportions there, in the middle; a "Contain" variant just beyond each end ensures it.
  The folder is only rewritten when VPX's layouts or these rules change (fingerprint in `cyberpinball.json`).
- **Resized in game, filled at once** ([packages/vpx-vision3d/src/dmd-suivi.cpp](../../packages/vpx-vision3d/src/dmd-suivi.cpp), [suivi-dmd.h](../../packages/vpx-vision3d/src/suivi-dmd.h)).
  Until 13 November 2026, a width, height or format changed in game left black bars, or a DMD that did not fill its new position, until the next game.
  Two causes, found on the test bench: (1) **SDL**: the DMD window is borderless and not resizable (`Window.cpp`, `SDL_WINDOW_BORDERLESS`); VPX 10.8.1's SDL 3 then keeps its client area at the size it knows (`SDL_windowsevents.c`, `WM_NCCALCSIZE`): resized from outside, the window's frame changes, but VPX keeps drawing at the old size in a corner, never receiving `SDL_EVENT_WINDOW_RESIZED`; (2) **ScoreView** picks its layout (`.scv`) at its first render and only picks again on the `Controller.OnDisplaysChanged` message (`ScoreView.cpp`, `OnResChanged`, `m_invalidBestLayout`).
  The "CyberPinballDmd" VPX plugin looks, at every frame, at its process's "Visual Pinball Score View" window: when its frame differs from its client area (a size set from outside), it gives the size to SDL (`SDL_SetWindowSize`, in SDL points, the screen scale taken from the client area), then has the frame recalculated (`SetWindowPos` with `SWP_FRAMECHANGED`, neither moving nor resizing): VPX receives the size and rebuilds the window's surface, in place.
  When the client area changes, it broadcasts `Controller.OnDisplaysChanged`: at once, at most once every 0.1 s while a setting is held, then once more 0.3 s after the last change (VPX may render one more frame at the old size).
  The message is safe: VPX broadcasts it itself at the start and end of every game and whenever a flasher DMD is added or removed; its subscribers (DMDUtil, Serum, VNI, PinMAME, B2S, ScoreView) read the list of sources again and pick the same one, PuP does not listen to it.
  The plugin does nothing else: no rendering, no keys, no timer, and SDL is only called for a size set from outside.
  It is enabled in every game (`[Plugin.CyberPinballDmd] Enable = 1`, `enabledPlugins` list in `components.json`, written at each VPinballX.ini synchronisation), in the headset too, where the window is not drawn, and put back into `<VPX>\plugins\cyberpinball-dmd` before each game when it has changed ([app/src/vpx-plugins.ts](../../app/src/vpx-plugins.ts), like 3D Vision and the pause in the headset).
  **Proof on the test bench** ([scripts/banc-dmd.ps1](../../scripts/banc-dmd.ps1)): the real VPX 10.8.1 in 2D on the hidden desktop, sound off, no frame sync (no screen composition on that desktop), Terminator 2 (Williams 1991, PinMAME 128 × 32 DMD); during the game the DMD window goes from 4:1 (512 × 128) to 6:1 (768 × 128) then to 2.8:1 (448 × 160), as the menu does; a probe in the plugin, for the bench only (`Probe = 1`, a renderer placed before ScoreView that lets it draw), measures how much of the window the DMD fills.
  Follow off (`Follow = 0`): VPX still draws at 512 × 128, the DMD fills 66.7% then 80% of the window.
  Size given to SDL only (`Follow = 2`): VPX follows, but ScoreView keeps the 4:1 layout, 66.7% then 70%.
  Full follow (`Follow = 1`, the default): 99.9% then 99.8%, 0.3 s after each resize, the window staying in place.
  A table with alphanumeric displays (Data East's Back to the Future) has a single layout, with no stretched variants: it keeps its proportions.

| Button | In the in-game settings |
| --- | --- |
| Flippers | change line; in an open line, less and more (held: faster) |
| Left, right MagnaSave | change line; in a position line, move up and down |
| Start | open the line, then confirm it |
| Exit | cancel the open line; otherwise resume the game |
| Keyboard | arrows: move the DMD both ways (on an open "Largeur" or "Hauteur" line: ← → the width, ↑ ↓ the height); + and −: both together, proportions kept; Enter, Esc |
| Mouse | drag the DMD frame (even onto another screen, `planDrag`); drag a corner to resize it; Alt: no snapping |

- **Where it is saved**: `<data>\positions-dmd.json`, by cabinet configuration then by table (`DmdPlace`: screen fingerprint, zone in fractions, hidden or not).
  A table without a position follows the configuration's general position (the wizard's zones, written to `VPinballX.ini`).
  "Revenir à la position générale" removes the table's position.
  Leaving with unsaved changes asks: save, discard (the DMD goes back where it was), or keep adjusting.
- **Before each game** (`prepareDmdPlace`, after the FullDMD artwork): the table's position for the connected configuration is written to `[ScoreView]` in the table's `.ini`: `ScoreViewOutput = 1`, `ScoreViewDisplay`, `ScoreViewFullScreen = 0`, position, size, and `Priority.B2S = 0`.
  Never during the game: VPX could rewrite that `.ini` when it quits.
  The keys written are remembered (`written`); a table that no longer has a position (or whose screen is missing) loses them, except those changed since in VPX's menu.
- **On a FullDMD**: the FullDMD picture stays around it, only the DMD's dots are placed where chosen.
  `Priority.B2S = 0`: the B2S plugin no longer draws the `.directb2s` FullDMD picture in the small window; Cyber Pinball's in-game background shows the FullDMD media behind.
  A position set this way comes before the FullDMD artwork (`dressUpdate` keeps it, "place set in game"); the doctor reports it neither as "Écrans placés pour cette table" (Screens placed for this table) nor as "Le DMD cacherait l'habillage FullDMD" (The DMD would hide the FullDMD artwork) (`DoctorContext.dmdPlaced`).
- **DMD hidden**: never `ScoreViewOutput = 0`, which stops VPX from opening the window: "DMD : affiché" (shown) then showed nothing until the table was restarted (13 November 2026).
  The window is written at its position, and Cyber Pinball, which watches for it from VPX's launch, moves it off every screen at its size before it is first shown (`watchHiddenDmd`, `dmdParkedRect`): at its size, because the ScoreView plugin picks its layout from the window at its first render (the "CyberPinballDmd" plugin makes it pick again at each change of size, not at a mere move); in the menu, hiding moves it away the same way, at its size, and showing it brings it straight back to its position.
  Never `ShowWindow(SW_HIDE)`: VPX 10.8.1 shows a hidden ancillary window again at every frame (`Renderer::RenderAncillaryWindow`, "if (!IsVisible()) Show()").
  An `.ini` written before (`Output = 0`) is rewritten at the next game.
- **The DMD frame** is drawn where the screen is in its window's page (`screenBox`), not in fractions of the window: if Windows places or sizes a screen's window differently from what was asked, it is put back in place once shown and the log says so (`keepOverlayOnScreen`), and the frame stays right (13 November 2026: on the DMD screen it did not reach the bottom, while the saved position touched it).
- **No DMD window in the game** (DMD off or embedded in the playfield): the menu says so; the frame fills with a preview in DMD dots (`DmdMenuFrame.preview`); the chosen position is adjusted and saved, and shows in the next game.
- **DMD window still empty** (`vpxDmdWindowState`): VPX 10.8.1 only shows an ancillary window once a plugin draws its first frame there (`Renderer.cpp`, "if (rendered) … Show()"); a DMD window placed on a screen but invisible therefore means the table sends no DMD (option set for desktop mode, see [DMD set for desktop mode](#dmd-set-for-desktop-mode), or a table without a DMD).
  The menu took it for a hidden DMD: "Masqué" (Hidden) came back at every game, even after "Afficher" (Show) and "Enregistrer pour cette table" (Save for this table) (*JP's Space Cadet*, 11/17/2026).
  Only a window moved off the screens now counts as hidden (`parked` state); an empty window (`empty`) lets the menu start from the saved position (the table's, otherwise the general position), shown, and the menu explains that VPX hasn't drawn anything in the DMD window yet, that the table sends it no DMD, and that the chosen position is saved and will be used as soon as the table sends one.
  The log notes it ("Réglages en partie (…) : menu ouvert, DMD de VPX vide (VPX n'y a rien dessiné : la table n'envoie pas de DMD), fenêtre en …").
- **On the wheel**: this setting changes nothing on the wheel, which has its own (the table's page > "Gérer la table…" > "DMD sur la roue", DMD on the wheel; see [Menu DMD](game-media.md#menu-dmd)).
- **Limits**: a PuP-Pack drawing in the DMD window (screen 5 or 1, non-zero `Priority.PUP`) stays there, shrunk to the chosen position.
  The keyboard's letters and punctuation follow its layout (`windowsVk`); a cabinet's keys (Shift, Ctrl, digits, F1-F24) do not.
- **Tests**: [dmdplace.test.ts](../../packages/core/src/test/dmdplace.test.ts) (positions by configuration and by table, table `.ini`, menu with the buttons, the keyboard and the mouse, position read from VPX's window), [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) (`Mapping.InGameUI` without the combination, `vpxMenuKeys`, `windowsVk`), [pupvisible.test.ts](../../packages/core/src/test/pupvisible.test.ts) (windows in the foreground: only on the player's request, closed at the end of the game).

### Adjusting the display during a game

Every visual setting whose result has to be seen is made **during a game**, on the real picture, with VPX 10.8.1's own menu: the table's framing (above), the position and size of the backglass, DMD and topper (`DisplaySettingsPage`, read in the code at commit af26b2d93), and the look of the displays.
A PuP-Pack, for example, often draws a frame on the backglass (bottom centre) where the DMD must land, and each pack has its own.

1. **Enter VPX's menu**: from the details screen, "Régler l'affichage en partie" (Adjust display in game) (the table starts with the menu open on framing, and the game does not count in the statistics); or, during any game, both MagnaSave buttons pressed together (Credit and Start on a cabinet without MagnaSave), then "Tous les réglages de VPX" (All VPX settings) in Cyber Pinball's in-game settings (above); F12 on a keyboard directly.
   `[Input] Mapping.InGameUI` keeps F12 only, **even without recorded buttons**: it is then the only `[Input]` key Cyber Pinball writes (`inGameMenuSetting`, `packages/core/src/buttons.ts`), and the combination that earlier versions wrote there is removed.
   Exit is never part of it: on its own, it quits the game.
2. **Adjust**: "Point Of View" for framing; Exit goes back to the menu's home page, then "Display Settings" > "Backglass Display", "ScoreView Display" (the DMD) or "Topper Display": position and size to the pixel, applied live; the window can also be dragged with the mouse.
3. **Save** (Start): "Save as Table Override" writes to the table's `.ini`, for that table only; "Save Globally" to `VPinballX.ini`, for every table.

Buttons in VPX's menu (`InputManager.cpp`), listed on the adjustment's loading screen ("Réglage de l'affichage" (Display adjustment), `displayKeys`):

| Button | In VPX's menu |
| --- | --- |
| Left, right MagnaSave | change line |
| Flippers | adjust the value |
| Start | save: for this table or for all |
| Credit | cancel the changes |
| Plunger | default value |
| Exit | previous page, then close the menu; with the menu closed, quit the game |

VPX only lights up "Save" after a change (`InGameUIPage::IsModified`): after Credit (cancel), it stays greyed out.
The reminder says so, "Save greyed out: nothing changed; Launch turns it back on": the Launch button (default value) is enough to light it up again.

| The role is… | Adjustable live | Note |
| --- | --- | --- |
| on a zone of a screen ("Windowed" window) | position and size | the case of the DMD placed on the backglass |
| alone on its screen (full screen) | no | switching to windowed in this menu writes `FullScreen` straight to the general settings, applied at the next launch |
| embedded in the playfield | position and size | outlined in green while the page is open |

- **After the game**: a position saved for the table gives the doctor the finding "Écrans placés pour cette table" (Screens placed for this table) (information, with sizes and positions), and its fix "Revenir à la disposition générale" (Back to the general layout) removes those keys only (`tableWindowsFinding`, `packages/core/src/doctor.ts`).
  A position saved for every table is a managed key changed by hand: the menu asks at startup whether to keep it (see "Several roles on one screen: zones").
- **Outside a game**: in "Réglages de cette table" (This table's settings), visual settings (framing and camera, windows, `[DMD]` and `[Alpha]` display profiles, the DMD's place in the B2S picture, PuP screen margins) carry the "En partie" (In game) badge and can no longer be changed; only the table's own value can be removed.
  Cabinet measurements (screen width, lockbar) remain adjustable.
- **Who draws in the DMD window**: the PUP plugin never draws the table's DMD; it only reads its frames to recognize scenes (PuPCapture, `PUPManager::ProcessDmdFrame`).
  If it takes the ScoreView window (a pack with a screen 5, or a screen 1 not placed on the backglass), the score of the ROM, FlexDMD or UltraDMD does not show there.
  VPX reads the priority from the table's settings: for a table that draws its DMD (PinMAME ROM, `CreateObject("FlexDMD.FlexDMD")` or `UltraDMD.DMDObject`, DMD folder) and whose script does not write the score on the pack itself (`LabelNew`, `LabelInit`), the doctor writes `[ScoreView] Priority.PUP = 0` in the table's `.ini` ("Le PuP-Pack cacherait le DMD de la table", The PuP-Pack would hide the table's DMD, `pupHidesDmd`), and the menu does it by itself before the game.
  The pack keeps the backglass and the topper; a value already set for the table in the VPX menu is kept.
  Case found on *2001* (UltraDMD score, "DMD on Fulldmd" option).
- **Limits**: without MagnaSave, you cannot change line in VPX's menu (`UIUp`, `UIDown`); the stacking order of two overlapping VPX windows (DMD on the backglass) is left to Windows.
