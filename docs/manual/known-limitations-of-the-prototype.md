[Français](../manuel/limites-connues-du-prototype.md) · English · [Manual contents](../manual.md)

## Known limitations of the prototype

- Application startup: between its launch and its first black covers (about 1 to 2 s), the desktop stays visible; no window can exist any earlier.
  Except on a [dedicated cabinet](dedicated-cabinet.md#dedicated-cabinet) (Windows Enterprise, Education or IoT Enterprise): Cyber Pinball replaces Explorer there, so there is no desktop left to see.
  If the application is force-stopped in the middle of a game, it leaves the taskbars hidden until its next startup (or until Explorer restarts).
  Before its first frame, a window is transparent (no Windows system backdrop): if nothing from Cyber Pinball is underneath, the desktop shows through until then; this is the case of the black cover at startup, hence the desktop staying visible a little longer.
  A screen that is plugged back in or wakes up while the menu is running (monitors put to sleep by the Windows lock screen, renumbered on wake-up) gets its black cover again, but the menu windows do not follow this change yet: the screen guard reports the uncovered or badly covered screen in the console, and restarting Cyber Pinball puts everything back in place.
- VPX 10.8.1 keys (`Player`, `Backglass`, `ScoreView`, `Topper` windows, `[Plugin.<id>] Enable`, priorities and settings of the B2S, PUP and DMDUtil plugins).
  The format of screen names and the plugins to enable change with the VPX version: they are described per version in the manifest (`adapterSettings`).
- Other VPX versions (see [Other VPX versions](other-vpx-versions.md#other-vpx-versions)): Cyber Pinball is only their launcher, with that VPX's settings.
  No virtual reality, in-game display adjustment, games with friends, 3D vision, Cyber Pinball's VPX settings or PuP-Pack preparation for the tables played that way.
- Menu image on the real DMD: the DMD server only accepts the `dmdutil64.dll` of VPX 10.8.1, recognised by its fingerprint.
  With any other VPX version, newer or older, "Image du menu" (Menu image) is greyed out with its reason and VPX keeps the DMD during games.
  Moving to another version requires copying the headers again, redoing `packages/dmdserver/dmdutil64.def`, adding the fingerprint and checking whether that DLL drives the PIN2DMD itself (`vendor/PROVENANCE.txt`); a test requires it for the installed VPX version.
  The PIN2DMD depends on this server: VPX 10.8.1's DMD module does not drive it, and without the server it stays dark, in games too.
  Beta, like all of the real DMD, until confirmed on equipped cabinets.
- VPX log for diagnostics: `%APPDATA%\VPinballX\10.8\vpinball.log` ("The selected display … is not available" lines).
- Executable and installers unsigned as long as no certificate is provided (configuration ready, see [Code signing](installation-and-file-layout.md#code-signing)): SmartScreen warns when the installer is launched.
  The binaries shipped with the application (VPX plugins, OpenXR layer, headset companion, DMD server) are not signed either, and some antivirus products can block an unsigned program.
- Updates on request only (system menu, see [Updating from the cabinet](installation-and-file-layout.md#updating-from-the-cabinet)): no background check.
  During installation (about a minute), the Windows desktop and the installer's progress page are visible on the main screen.
  Rolling back to the previous version when the installer fails has not yet been triggered in a test.
- VPX locates screens in logical coordinates: with Windows scaling other than 100%, the position written may not match.
  The wizard reports it.
- Model stored as JSON.
  The spec calls for SQLite.
- Cabinet configurations: per-table settings (including the framing set during a game, even though it depends on the playfield screen) are shared by all configurations.
  A general VPX setting changed after a configuration was created only applies to the active configuration.
  The selection screen, configuration management and the banner have not been captured yet (waiting for the off-screen test mode, so as not to occupy the machine's screens).
- VPX 10.8.1 plugin mode only: no `ScreenRes.txt`, `DmdDevice.ini` or `B2STableSettings.xml` yet for classic mode; DOF through the VPX plugin only (no classic DirectOutput.dll), with no LED test outside a game.
  The real DMD does not need it: in plugin mode, VPX drives it through its DMDUtil plugin (`[Plugin.DMDUtil]`), and `DmdDevice.ini` is only read by VPinMAME's `DmdDevice64.dll`, in classic mode.
- Zones: the stacking order of two overlapping zones and the rotation of a zone cannot be set (VPX has no setting for them).
  The actual rendering in VPX still has to be checked on a cabinet, in particular the windowed playfield of a desktop PC.
- Buttons: keyboard keys and joystick buttons (Pinscape, encoder in gamepad mode; see "Cabinet buttons").
  A gamepad's D-pads are captured as buttons, not yet its axes (a Zero Delay's stick directions, triggers); an encoder button that sends a key combination is not supported.
- Sound: videos and menu music still play on the Windows default output, as do COM components outside plugins (standalone VPinMAME, B2S, PinUP Player).
  Nothing checks yet that the default output is the backglass one.
- Pinball FX3 (beta, see [Pinball FX3 tables](pinball-fx3-tables.md)): not yet tried on a real installation; direct launch, `-class` and the "Pinball FX Classic" window title come from front-ends and Zen, not from a test.
  Cyber Pinball can't tell which tables are bought (Steam installs them all) or whether the game stayed on its home screen: it assumes so from a game shorter than 45 s.
  Real DMD: only through `dmdext`, which reads the game's memory, and which Cyber Pinball doesn't start yet.
  "Mars" opens "Attack from Mars" when the account has both tables (game bug).
