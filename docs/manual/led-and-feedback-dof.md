[Français](../manuel/led-et-retours-dof.md) · English · [Manual contents](../manual.md)

## LED and feedback (DOF)

DOF (DirectOutput Framework) drives the cabinet's LEDs, flashers, contactors, knocker and shaker during games, from the configuration made on [configtool.vpuniverse.com](https://configtool.vpuniverse.com).
In plugin mode, VPX 10.8.1 ships it: its `DOF` plugin links libdof (vpinball/libdof `eef645d`, pinned by VPX `af26b2d93`).
Nothing to install.

**What libdof reads** (libdof sources quoted in [dof.ts](../../packages/core/src/dof.ts)):

- `GlobalConfig_B2SServer.xml` in `%APPDATA%\VPinballX\10.8\directoutputconfig\` (the VPX preference folder, whatever `-Ini` Cyber Pinball passes), otherwise in `.\directoutputconfig\` of the VPX folder;
- the configtool's `directoutputconfig<N>.ini` (or `ledcontrol<N>.ini`), searched in `IniFilesPath`, then the table folder, then the GlobalConfig folder, then the VPX folder: **the first folder that has any wins**;
- `Cabinet.xml` only when the GlobalConfig's `CabinetConfigFilePattern` points to it.
  Without it, libdof finds on its own only Pinscape, Pinscape Pico, LedWiz, DudesCab, UMX, PacLed64, PacDrive, Ultimate I/O, FT245R and PinOne.
  **Teensy, Wemos D1, PinControl and Art-Net only exist for it when declared in Cabinet.xml**;
- the plugin only starts for a table with a PinMAME ROM: electromechanical and original tables without a ROM get no feedback in plugin mode.

**Addressable LEDs and the KL25Z.**
The KL25Z (Pinscape) drives on/off or dimmable outputs, not the data signal of WS2812 strips: strips wired to it never light up.
They need their own controller (Teensy with TeensyStripController, Wemos D1 with WemosD1MPStripController, DudesCab, Pinscape Pico), declared in `Cabinet.xml`.
The KL25Z keeps the buttons, the plunger and the regular outputs.
The screen says so when it sees a KL25Z and no addressable LED controller.

**Controllers recognised without opening anything.**
`detectDofControllers` reads the USB IDs from the passive list of `probeUsbDevices` (as for real DMDs):

| Controller | USB ID | `directoutputconfig<N>.ini` |
| --- | --- | --- |
| Pinscape KL25Z | `FAFA:00F0`–`00FF` (unit = PID & 0xF + 1) or `1209:EAEA` | 50 + unit (51 by default) |
| LedWiz | `FAFA:00F0`–`00FF`, zebsboards `20A0` | unit (1 to 16) |
| Pinscape Pico | product name “Pinscape Pico” | 119 + unit |
| DudesCab | `2E8A:106F` | 90 + unit − 1 |
| PacLed64, PacDrive, Ultimate I/O | `D209:1401`–`1404`, `D209:1500`, `D209:0410`–`0411` | 20–23, 19, 27–28 |
| SainSmart / FT245R | `0403:6001` (common FTDI ID: reported as uncertain) | 40 + rank |
| Teensy (addressable LEDs) | `16C0:0483` (PJRC serial) | the one of the Cabinet.xml `LedWizEquivalent`, 30 for the configtool |

`FAFA:00Fx` is shared by the LedWiz and the Pinscape in LedWiz emulation: since a LedWiz is never a joystick, such a device recorded as a joystick in the “Boutons” (Buttons) step is a Pinscape (`cabinetJoystickHids`, from the IDs carried by the SDL token).
Otherwise both numbers are offered.
The unit number of a native Pinscape or of a DudesCab is set on the board: 1 is assumed, and said.

**What Cyber Pinball writes.**

- `[Plugin.DOF] Enable = 1` (managed key, `vpxDofSettings`) as soon as a controller is plugged in, declared in Cabinet.xml, or ini files exist.
  Otherwise nothing: the plugin stays as VPX or the user left it.
  Changed by hand, it is reported like the other managed keys.
- The configtool's ini files, on import (see below): they replace every previous `directoutputconfig*.ini` and `tablemappings.*`, set aside in `<data>\sauvegardes\dof\<date>\`.
- `Cabinet.xml` and `GlobalConfig_B2SServer.xml` (`IniFilesPath` and `CabinetConfigFilePattern` on `{GlobalConfigDir}`) when addressable LEDs are described, **only if the file is missing or carries the “Written by Cyber Pinball” mark** (`planLedWrite`).
  A hand-written file is never replaced: the screen says which one and why.
  A hand-written GlobalConfig that already points to a Cabinet.xml is followed.

The folder is **shared by every VPX 10.8 on the PC** (another cabinet frontend included): it is the same cabinet, the same controllers.

**System menu > “Borne” > “LED et retours (DOF)”** (LED and feedback) ([app/src/dof-menu.ts](../../app/src/dof-menu.ts)):

- **Controllers**: those recognised over USB (with the ini number they read) and those only declared in Cabinet.xml;
- **Configuration**: the ini files found and their folder, how many ROMs are configured, Cabinet.xml (written by Cyber Pinball or by hand, number of strips);
- **To check** (`dofFindings`): no ini; a controller without its ini; a Teensy plugged in but not declared; a Cabinet.xml that no GlobalConfig points to; a Cabinet.xml COM port that is missing; a controller type libdof does not handle (SSF, Hue); a strip no output targets; a `LedWizEquivalent` without its ini; `IniFilesPath` not found; an unreadable file;
- **“Ouvrir configtool.vpuniverse.com”** (Open configtool.vpuniverse.com): the page opens in “Récupérer” (Fetch), with the user's VPUniverse account; the ZIP from “Generate Config” comes back to the screen and is imported.
  The site sits behind a Cloudflare challenge: no automatic download, the user clicks;
- **“Importer la configuration du configtool…”** (Import the configtool configuration…): an already downloaded ZIP (`planDofImport`); a ZIP without `directoutputconfig*.ini` is refused; a Cabinet.xml or GlobalConfig from the ZIP never overwrites a file in place;
- **“Bandes de LED adressables…”** (Addressable LED strips): the board first, in three families (libdof: a `LedStrip` needs a controller that takes values, `ISupportsSetValues`):
  - **Teensy (TeensyStripController) and Wemos D1**: serial port (picked among the plugged-in ports, or typed), outputs of the board;
  - **Art-Net** (WLED on an ESP32, or any other Art-Net node): the node's IP address (empty: broadcast on the whole network) and first universe (0 for WLED); one `ArtNet` controller per universe, each of 512 channels, so 170 LEDs at most (`ArtNet.h`, `DMX_CHANNELS`), numbering starting again from 1 on each universe; a longer strip is split into two strips on two universes.
    **Alignment with WLED** (`wledSegments`): in “Multi RGB”, WLED lays out 170 LEDs per universe one after the other (LED k: start universe + k ÷ 170, channels 3 × (k mod 170) + 1 to 3).
    Since a DOF strip never spills over from one universe to the next, it starts in WLED at 170 × (its universe − the first one) + its `FirstLedNumber` − 1: for one strip per universe, “Start” 0, 170, 340, 510 in LED Preferences, with gaps in the numbering.
    With consecutive “Start” values (0, 120, 240…), the second strip would receive shifted colours.
    The editor shows, under “Dans WLED (LED Preferences)”, each strip's “Start” and length and the total LED count, and the save notice repeats them.
    WLED settings recalled on screen: Config > Sync Interfaces > Realtime, “Art-Net” receive, start universe, DMX start address 1, “Multi RGB”; Config > WiFi Setup, “WiFi sleep” unticked; a fast level shifter (74AHCT125, 74HCT245) between the ESP32 (3.3 V) and the strips, bidirectional BSS138 modules being often too slow for WS2812.
    Art-Net is “ready to test” in libdof, not proven;
  - **DudesCab (MX mode, firmware 1.9 or later) and Pinscape Pico**: strips are described in the board's tool, which libdof reads from the board (`UMXController::UpdateCabinetFromConfig` creates the DudesCab `LedStrip`s itself; Pinscape Pico LEDs are outputs of the board).
    The editor explains it, and “Ajouter une bande” and “Enregistrer” stay greyed out with that reason: a `Cabinet.xml` would duplicate them.

  Then each strip: name, controller output, columns × rows, wiring (libdof's 16 arrangements, serpentine included), colour order (GRB for most WS2812), brightness, DOF output (1, 4, 7…: the toy's one in the configtool).
  LEDs are numbered from one end of the controller to the other, output 1 first, strips of the same output one after the other (`stripFirstLeds`). “Enregistrer” (Save) writes the files, backs up those it replaces, and says what to declare in the configtool (controller number 30, each toy on its output).
  An incomplete description keeps “Enregistrer” greyed out, with the reason. “Ajouter une bande” (Add a strip) starts from a template: vertical strip on the left or right of the playfield (1 × 120, first LED at the top), ring around a backbox speaker (24 × 1), matrix at the back of the playfield (32 × 8 serpentine), or other (1 × 60); each takes the controller's first free output and the next DOF output.
  The editor reminds how to wire a long data cable up to the backbox: Ethernet cable from the OctoWS2811, each data wire twisted with a ground, 100 to 330 Ω resistor at the start, 5 V brought by its own cable.
  Test case: a reference cabinet, two strips of more than 100 LEDs on either side of the playfield and two speaker rings, each on its own output (`dof.test.ts`);
- an unavailable function (VPX missing, no built-in browser) stays visible, greyed out, with its reason.

Nothing is sent to the controllers outside a game: no port is opened, no LED is lit for a test.
Testing happens in a game, on a table with a PinMAME ROM.

**Table doctor** (`dofFindingsFor`, only on a cabinet that has ini files): `dofLocalIni` (a `directoutputconfig*.ini` in the table folder hides the cabinet's when `IniFilesPath` is not set; fix: move it to the recycle bin), `dofNoPinmame` (table without a ROM: no feedback in plugin mode), `dofNoConfig` (the configuration has nothing for its ROM, by libdof's three rules: case-insensitive match, then `<rom>_…`, then prefix).
Never blocking.

**Cabinet health**: a “LED et retours (DOF)” check (`dofLines`), absent on a cabinet with no controller and no configuration; one line per point to check, otherwise “DOF prêt” (DOF ready), each leading to the screen.

**VPX settings**: the “Essentiels” (Essentials) tab has a “Retours de la borne (DOF)” (Cabinet feedback) group: `[Plugin.DOF] Enable` (managed), and `[Controller] DOFContactors`, `DOFKnocker`, `DOFChimes`, `DOFBell`, `DOFGear`, `DOFShaker`, `DOFFlippers`, `DOFTargets`, `DOFDropTargets`: table sound, DOF, or both (VPX default).
Only scripts that use `controller.vbs` read them.

Tests: [dof.test.ts](../../packages/core/src/test/dof.test.ts) (IDs, ROM rules, folder reading, Cabinet.xml written then read back, hand-written files never replaced, findings from the real case to the fixed one, import, `[Plugin.DOF] Enable`) and three trap tables in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
In a sandbox, the DOF folder is `<sandbox>\sandbox\directoutputconfig` (`CYBERPINBALL_DOF_DIR` for another one); `CYBERPINBALL_USB_DEVICES` simulates the controllers.
