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
- the plugin only starts for a table with a PinMAME ROM; for original tables (no ROM) that your configuration knows, Cyber Pinball starts libdof separately (see "During a game: ROM tables and original tables" below).

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

**System menu > “Ma borne” > “DMD et LED” > “LED et retours (DOF)”** (LED and feedback) ([app/src/dof-menu.ts](../../app/src/dof-menu.ts)):

- **Controllers**: those recognised over USB (with the ini number they read) and those only declared in Cabinet.xml;
- **Configuration**: the ini files found and their folder, how many ROMs are configured, Cabinet.xml (written by Cyber Pinball or by hand, number of strips);
- **To check** (`dofFindings`): no ini; a controller without its ini; a Teensy plugged in but not declared; a Cabinet.xml that no GlobalConfig points to; a Cabinet.xml COM port that is missing; a controller type libdof does not handle (SSF, Hue); a strip no output targets; a `LedWizEquivalent` without its ini; `IniFilesPath` not found; an unreadable file; addressable LEDs without a Cabinet.xml; an old DOF configuration the plugin does not read.
  **Addressable LEDs without a Cabinet.xml** (`addressableIniUndeclared`): a `directoutputconfig30.ini` to `39.ini` (the configtool's addressable LED controllers) with no `LedWizEquivalent` of that number in a Cabinet.xml read by libdof, which then never creates the controller: the strips stay dark.
  The finding gives the likely serial port of their controller, without opening anything (`addressablePortGuess`): that of a recognised Teensy, otherwise that of a CH340 or CP210x USB-serial bridge (Wemos D1, ESP32).
  “Bandes de LED adressables…” (Addressable LED strips) then turns amber (“Vos fichiers du configtool attendent des LED adressables : dites ici où elles sont branchées”, Your configtool files expect addressable LEDs: say here where they are connected) and the editor starts from that port.
  Nothing is reported with a DudesCab or a Pinscape Pico, which carry their strips themselves;
- **Old DOF configuration** (`legacyIni`): a cabinet coming from PinUP Popper, PinballX or PinballY keeps its configtool configuration in the folder of its classic DOF (`…\DirectOutput\Config`), which the VPX DOF plugin does not read.
  When the folder the plugin reads has no ini file, Cyber Pinball looks for a classic DOF on the fixed drives, without opening anything: `<drive>\DirectOutput` and `<drive>\<folder>\DirectOutput` (C:\DirectOutput, C:\vPinball\DirectOutput, Program Files…), scanned once (`legacyDofInstalls`, `app/src/dof-files.ts`); its ini files are read where its GlobalConfig pointed.
  The screen and the Cabinet health show the folder found, its files and their date.
  **“Reprendre la configuration de l'ancien DOF”** (Reuse the old DOF configuration), at the top of the actions (three old DOFs at most), copies its `directoutputconfig*.ini` and `tablemappings.*` there (`planLegacyDofImport`), setting the previous ones aside in `<data>\sauvegardes\dof\<date>\`; the old DOF folder does not change.
  Its GlobalConfig is never reused: the VPX DOF plugin does not need it.
  Its Cabinet.xml (Teensy, addressable LEDs), if it has one, is reviewed separately (`planLegacyCabinet`): reused only if it is readable, libdof handles all its controllers, each strip has its controller declared, the COM ports it names are plugged in and no Cabinet.xml is already in the DOF folder.
  When the reused ini files have addressable LEDs (30 to 39), a consistent Cabinet.xml is reused in the same step, with a Cyber Pinball GlobalConfig pointing to it.
  Otherwise a “Cabinet.xml de l'ancien DOF” (Old DOF's Cabinet.xml) screen says what it declares and, where relevant, “Pourquoi il n'est pas repris” (Why it is not reused), with “Reprendre ce Cabinet.xml” (Reuse this Cabinet.xml) or “Décrire les bandes dans Cyber Pinball…” (Describe the strips in Cyber Pinball…), and “Ne pas le reprendre” (Do not reuse it);
- **“Ouvrir configtool.vpuniverse.com”** (Open configtool.vpuniverse.com): the page opens in “Récupérer” (Fetch), with the user's VPUniverse account; the ZIP from “Generate Config” comes back to the screen and is imported.
  The site sits behind a Cloudflare challenge: no automatic download, the user clicks;
- **“Importer la configuration du configtool…”** (Import the configtool configuration…): an already downloaded ZIP (`planDofImport`); a ZIP without `directoutputconfig*.ini` is refused; a Cabinet.xml or GlobalConfig from the ZIP never overwrites a file in place;
- **“Bandes de LED adressables…”** (Addressable LED strips): the board first, in three families (libdof: a `LedStrip` needs a controller that takes values, `ISupportsSetValues`):
  - **Teensy (TeensyStripController) and Wemos D1**: serial port (picked among the plugged-in ports, or typed), outputs of the board.
    Without a recognised Teensy, the editor starts from a Wemos D1 on the USB-serial bridge found (CH340, CP210x).
    A Wemos D1 automatically gets, in Cabinet.xml, the settings its firmware expects (`WEMOS_SETTINGS`): `ComPortBaudRate` 2,000,000 baud, `UseCompression` and `SendPerLedstripLength` (per-strip length), with the serial port delays of a proven Cabinet.xml.
    Without them, libdof applies the Teensy's: 9600 baud, and nothing lights up.
    A Cabinet.xml read back in the editor keeps all its controller settings, written back as they are on save;
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
  LEDs are numbered from one end of the controller to the other, output 1 first, strips of the same output one after the other (`stripFirstLeds`).
  “Enregistrer” (Save) writes the files, backs up those it replaces, and says what to declare in the configtool (controller number 30, each toy on its output).
  An incomplete description keeps “Enregistrer” greyed out, with the reason.
  “Ajouter une bande” (Add a strip) starts from a template: vertical strip on the left or right of the playfield (1 × 120, first LED at the top), ring around a backbox speaker (24 × 1), matrix at the back of the playfield (32 × 8 serpentine), or other (1 × 60); each takes the controller's first free output and the next DOF output.
  The editor reminds how to wire a long data cable up to the backbox: Ethernet cable from the OctoWS2811, each data wire twisted with a ground, 100 to 330 Ω resistor at the start, 5 V brought by its own cable.
  Test case: a reference cabinet, two strips of more than 100 LEDs on either side of the playfield and two speaker rings, each on its own output (`dof.test.ts`);
- an unavailable function (VPX missing, no built-in browser) stays visible, greyed out, with its reason.

Apart from the LED animations and the strip test (see below), nothing is sent to the controllers outside a game.
Testing the table's feedback happens in a game.

**Testing a strip** ("Test this strip", in each strip's configuration screen, without launching a table).
Red, green, blue, white, chaser (direction and length), start and end of the strip, colour order, matrix wiring, brightness, a ruler to count the LEDs, rainbow and "Turn everything off".
"If you see…" finds the colour order (GRB, RGB…) from what you see, and applies it.
Teensy, Wemos D1 (serial port) and Art-Net / WLED (network) are driven directly; DudesCab and Pinscape Pico are described in their board's own tool and only DOF drives them.
The LED serial port is handed back to DOF as soon as a game is being prepared (any table, any game): the LEDs go out, the port is closed and only reopens afterwards.
A port held by another program, a missing port, or a board that does not answer gives a message saying what to do.

**LED animations outside a game** (System menu > My cabinet > DMD and LEDs > "LED et retours (DOF)" (LEDs and feedback) > "Animations des LED" (LED animations)).
In the menus and on the table wheel, your addressable LED strips show a mood in the colours of the selected table, or in a fixed colour.
The table's colours are up to four dominant colours measured on its backglass and playfield (the wheel is only a last resort): an all-green table keeps green LEDs.
"Medley" style, the default: effects follow one another (comets, beams, waves, sparks, rainbows…) in the table's colours, a different one at each change of screen.
The other styles are breathing, slow gradient, twinkle, wave and embers; a style you already chose stays yours.
Each change of table launches a sweep in the scrolling direction, opening a game page a pulse.
When Cyber Pinball opens, the strips play their own animation, in step with the screen's: a green beam leaves the bottom of the playfield, on the flipper side, rises to the middle, then bursts into a green wave; they then melt into the menu mood.
Effects that rise start from the bottom, whichever end of the strip is wired first: the direction comes from each strip's declared layout.
Animations go quiet as soon as a game is being prepared (the port is handed back to DOF) and come back afterwards.
Nothing runs without a described strip, with animations off, or on a board that carries its own strips; at most 25 frames per second; the strip test keeps priority.
Settings: on or off, style, maximum brightness (0 to 100% in steps of 10, 40% by default, never exceeded), speed, table colours or fixed colour, switch off after inactivity (30 minutes by default); each choice shows on the strips straight away.
Percentages follow perceived brightness: 50% looks half as strong as 100%, 10% is near-off, and the colour holds all the way down without steps; a setting you already made keeps the same light (30% becomes 60%).
**Juke-box**: while music plays, the strips follow the sound: bass rises from the bottom of the strip, mids light the middle, treble the top, in a gradient in the colours of the track's cover (rainbow otherwise, Cyber Pinball green with no cover).
The level adjusts itself over a few seconds, band by band: the bar really rises and falls with the beat, even on a loud, saturated track.
With no sound, the strips go back to the mood; the maximum brightness is never exceeded; as soon as a game is being prepared, the port is handed back to DOF.
The "Jukebox: the LEDs follow the music" setting (on by default), in "LED animations", turns it on or off.

**Colours of the displayed table** (those of the menu DMD and of the LEDs).
The colour follows the table shown on the wheel: the order is the backglass, then the playfield, then the wheel.
Colours are more vivid: blue, red, purple and pink no longer come out pastel, the lightness adapting to the hue; colours already measured are recomputed once, in the background.
They follow a change of game faster: the colours of the whole collection are measured in advance, in the background and only at rest (never during a game), starting from the displayed game, and kept on disk, so already known at the next start.
When scrolling fast, a table whose colour is known is shown after a very short pause instead of the full wait.
Only one measurement stays active at a time: videos of tables you have left do not pile up.

**During a game: ROM tables and original tables.**
- Table with a PinMAME ROM: DOF plays the configtool configuration, as before.
  A ROM whose configuration animates almost nothing on the strips gets fallback effects that react to the game (the ROM's coils, contacts and lamps: flippers, slingshots, bumpers, flashers, ejects, knocker, ramps, ball served, auto-plunger), written separately in the DOF configuration.
  Only effects that react count: a configuration that only lights the strips continuously (general illumination) is completed; a rich configuration is never touched.
  "Added LED effects for ROM tables" switch (on by default).
- A table only counts as a ROM table if its script calls PinMAME **and** its ROM name and file are on the cabinet: original tables that copy this code without a ROM (Stranger Things, for example) get their no-ROM effects back.
  The script is read once in the table file, without launching VPX.
  During the game, Cyber Pinball checks in VPX's log that PinMAME really started; if not, the game switches to the no-ROM effects, and conversely a table that does start PinMAME gives the LEDs back to DOF.
- Original tables (no ROM) that your DOF configuration knows (Space Cadet, Stranger Things, Matrix, City Hunter…): VPX 10.8's DOF plugin only starts with a ROM, so Cyber Pinball starts VPX's libdof separately during the game, with the table's B2S name, and passes it the script's events, pulses included.
  Every configtool effect then plays, on all your hardware (Pinscape, LedWiz, LED strips…).
  Tables that have their own `Sub DOF` in the script are covered too: Cyber Pinball's `.vbs` plugs the listener into the Sub, without moving any line.
  "DOF for original tables" switch (on by default).
  If the relay does not start or stops mid-game, the no-ROM effects take over (if enabled).
- A configuration that follows fewer than half of the DOF calls the script really sends on the strips (another script version, effects reserved for toys) is completed on all strips: the most frequent events take the table's colours, the rarest varied colours; the original configuration's effects stay as they are.
- Tables with no ROM and no configuration: "LED effects for tables without a ROM" switch (off by default), with an intensity from 0 to 100% in steps of 10, never above the animations' maximum brightness.
  Each event's role is read from the table's script, and each has its effect: on each flip, a small bar in the table's colours leaves the bottom of the strip, on the flipper's side, and rises a little (never more than half the strip), full at the base and fading towards unlit LEDs, then a small shot slides slowly towards the back of the playfield; several flips in a row give several shots.
  When a ball is served, a comet climbs the whole strip (white flash at the start, sparks at the top), at the moment the ball leaves the plunger, manual shot included; ball lost: the comet comes back down, in red.
  Jackpot, multiball and extra ball: white flash, waves of colour and a rain of sparks; bumpers, slingshots and ejectors: white-hearted flash; targets, lanes and spinners: small twinkling waves; tilt, game start and game end have theirs.
  What happens often stays in the table's colours, mixed with their neighbouring hue for depth; contrasting colours are kept for rare moments.
  The cabinet buttons (flippers, plunger, start) and the analog plunger trigger their effect too.
  No effect blinks endlessly: each stops by itself in under a second, the strips are off between two events, and general illumination and motors do not light them.
  An original table whose script never calls DOF (Agentic) also animates its slingshots, bumpers, targets, saucers and rewards from the sounds it plays; with Cyber Pinball's effects, a ROM table animates the strips on everything that happens, read from the ROM's coils.
  The table's sounds always count, even when its script only calls DOF for the flippers, and an event given by two sources plays only once.
  A start animation plays when the game opens.
  The strips are switched off and the port handed back at the end of the game.
  To do this, Cyber Pinball adds a short listener to VPX's `scripts/controller.vbs` (original copy kept next to it, `controller.vbs.cyberpinball-avant`): it does nothing outside games launched by Cyber Pinball and cannot make the script fail.
- **Per table**: "Manage the table" > "Cyber Pinball LED effects".
  When on, your strips play Cyber Pinball's effects (gradients, launch comet, the table's colours) instead of the table's DOF config (useful when a community config lights everything in one colour), for a ROM table too.
  The other toys (coils, contactors, lamps, motors) keep the DOF config.
  The choice takes effect at the next game; untick it and everything returns exactly as before.
  A table with no DOF effect in its config, or a cabinet with no described strip, has no such line.
- The log states each game's LED mode (DOF with its ROM, DOF relay, or no-ROM effects with their colours and brightness), the tally of events received and the share of time the strips were lit, and whether the script's DOF calls reach no listener.

**Table diagnosis** (`dofFindingsFor`, only on a cabinet that has ini files): `dofLocalIni` (a `directoutputconfig*.ini` in the table folder hides the cabinet's when `IniFilesPath` is not set; fix: move it to the recycle bin), `dofNoPinmame` (table without a ROM: feedback only through Cyber Pinball's DOF relay, if your configuration knows the table), `dofNoConfig` (the configuration has nothing for its ROM, by libdof's three rules: case-insensitive match, then `<rom>_…`, then prefix).
Never blocking.

**Cabinet health**: a “LED et retours (DOF)” check (`dofLines`), absent on a cabinet with no controller and no configuration; one line per point to check (addressable LEDs without a Cabinet.xml and an old DOF configuration included), otherwise “DOF prêt” (DOF ready), each leading to the screen.

**DOF and real DMD.**
A Wemos D1 or an ESP32 goes through the same common USB-serial bridge (CH340, CP210x) as a generic ZeDMD.
The port of a controller declared in Cabinet.xml, or such a bridge while addressable LEDs are still waiting for their controller, is therefore not turned on as a ZeDMD by default (see [Real DMD](vpx-plugins-backglass-pup-and-dmd.md#vpx-plugins-backglass-pup-and-dmd)).

**VPX settings**: the “Essentiels” (Essentials) tab has a “Retours de la borne (DOF)” (Cabinet feedback) group: `[Plugin.DOF] Enable` (managed), and `[Controller] DOFContactors`, `DOFKnocker`, `DOFChimes`, `DOFBell`, `DOFGear`, `DOFShaker`, `DOFFlippers`, `DOFTargets`, `DOFDropTargets`: table sound, DOF, or both (VPX default).
Only scripts that use `controller.vbs` read them.

Tests: [dof.test.ts](../../packages/core/src/test/dof.test.ts) (IDs, ROM rules, folder reading, Cabinet.xml written then read back, hand-written files never replaced, findings from the real case to the fixed one, import, `[Plugin.DOF] Enable`) and three trap tables in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
In a sandbox, the DOF folder is `<sandbox>\sandbox\directoutputconfig` (`CYBERPINBALL_DOF_DIR` for another one); `CYBERPINBALL_USB_DEVICES` simulates the controllers.
