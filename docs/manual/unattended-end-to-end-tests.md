[Français](../manuel/tests-de-bout-en-bout-sans-operateur.md) · English · [Manual contents](../manual.md)

## Unattended end-to-end tests

**Rule, for every test and every development session: off-screen by default.**
An unattended test must never open a window on the machine's screens, steal its focus or depend on the screens plugged in: the machine is used for work while the tests run in the background.

- **Off-screen** (`app/src/offscreen.ts`, rules in `packages/core/src/offscreen.ts`): automatic as soon as `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` or `CYBERPINBALL_STRESS` is set, or forced with `CYBERPINBALL_HORS_ECRAN=1`.
  Every window is created through `createWindow` and rendered in memory (Electron off-screen rendering, `webPreferences.offscreen`) at the size of its screen, with a scale factor of 1: never shown, never in the foreground, absent from the taskbar, sound muted.
  `coverDisplay` only sizes them (simulated rotation included); `show`, `focus`, full screen, minimizing and taking back the foreground have no effect.
  The rendering is that of a real window: captures (`capturePage`), the layout guard, replayed keys and clicks (`click:<selector>`, `sendInputEvent`) all work the same way.
- **Simulated screens**: `CYBERPINBALL_DISPLAYS=<file.json>` replaces screen detection everywhere (setup wizard, menu, settings, `sync`, button reset: `observedDisplays`, `app/src/displays.ts`), in the same shape as `npm run probe -- --json` (`displays` field), EDID included; a malformed file is rejected, naming the faulty screen and field.
  Screen sets versioned in `packages\core\ecrans-simules\`: `pc-dev` (the four screens of the development PC, those of the cabinet model in `D:\CyberPinball`), `borne` (4K playfield lying flat, 1080p backglass, 4:1 DMD, topper), `poste-deux-ecrans` (the current machine: main screen and two screens), `un-ecran`.
  With simulated screens, orientation is never applied to a real screen.
- **Watch**: during an off-screen test, any application window that is visible or in the foreground (`isVisible`, `isFocused`, native windows of the process, dialog boxes included) is reported in the console ("Hors écran : …" (Off-screen: …)) and in `<captures>\hors-ecran.txt` ("Aucune fenêtre visible ni au premier plan" (No window visible or in the foreground) otherwise).
  The demo scripts fail if a window appeared; `npm test` replays the wizard off-screen on the simulated cabinet and checks this.
- **Application log**: everything it writes to its console (a table's copy, the host's settings, the group records, an invitation, a VPX launch…) also goes to `<racine>\data\logs\journal.txt`, one dated line per message, `[avertissement]` (warning) or `[erreur]` (error) when it is not plain information; beyond 2 MB it becomes `journal-ancien.txt` and a new one starts.
  What happened on a cabinet during a test can be read afterwards (`app/src/journal.ts`, `packages/core/src/journal.ts`, tests in `journal.test.ts`).
  It also records Chromium processes that stopped (a page's renderer, the GPU: `journalProcessesGone`, `app/src/uncaught.ts`) and any window shown without having received `ready-to-show`: Electron never emits it for a window already visible at its first frame, nor for a page that has painted nothing meaningful, and, at the restart after an update on a busy PC, the menu could stay invisible this way, Cyber Pinball running behind its black veils.
  Every window therefore waits through `whenReadyToShow` (`app/src/offscreen.ts`), which shows it after 10 s at the latest and records the state of its page (“pas de ready-to-show après 10 s (page en chargement : non, rendu planté : non…)”); `offscreen.test.ts` rejects any other wait for `ready-to-show`.
- **Uncaught exception**: on screen, on the cabinet, it is written to `<racine>\data\logs\erreurs.txt` (date, kind, stack; the oldest entries go beyond 512 KB) and to the console, and the application carries on: never Electron's modal box, which would freeze the menu until OK is clicked, often hidden under its full-screen windows.
  An unhandled promise rejection is logged the same way (`app/src/uncaught.ts`, `packages/core/src/errorlog.ts`, tests in `errorlog.test.ts`).
  Since 10/11/2026 it also holds **caught incidents** ("incident rattrapé": a phone gesture not delivered, a built-in browser page that crashed and was reloaded, a refused request, a failed sign-in import; one line, never what was typed nor a page's full address) and, at the next start, **native crashes** that Node does not see: Crashpad keeps their report in `%APPDATA%\CyberPinball\Crashpad\reports\*.dmp`, sending nothing, and each new report becomes a "plantage natif" (native crash) entry with its path (`journalNativeCrashes`, on screen only).
  Off-screen, it stops the test as failed, with the error in the console ("Hors écran : exception non rattrapée, essai arrêté." (Off-screen: uncaught exception, test stopped.)), instead of Electron's modal box ("A JavaScript error occurred in the main process"): on the hidden desktop nobody would close it and the main process would stay frozen, timers and safeguards included (`app/src/offscreen.ts`, invariant test in `offscreen.test.ts`).
- **Hidden desktop** (`scripts\bureau-cache.ps1`, loaded for example by `scripts\diagnostic-habillage.ps1`): a test script relaunches itself entirely (PowerShell, node, Electron, tools) on a separate Windows desktop, `CyberPinballEssais` (`Enter-BureauCache`, `CreateDesktop` then `CreateProcess` with that desktop), which the user never sees; its output comes back to the original console.
  Even if a window were shown by mistake, nothing would appear on the machine's screens.
  The application applies the same rule to any unattended test, whatever launched it (`npx electron app` by hand, another script, another session): when off-screen and outside the hidden desktop, it relaunches itself there with the same arguments (`relaunchOnHiddenDesktop`, `app/src/offscreen.ts`; `packages/win-displays/src/desktop.ts`), copies back its output and returns its exit code; `npm test` checks this.
  The relay started on the hidden desktop is placed in a Windows job object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, created suspended and placed before it starts) held only by its launcher: when the launcher dies, even killed outright at a test's timeout, the whole hidden-desktop tree dies with it; it does not inherit the launcher's console, only the log is handed to it.
  On the test side, every Electron goes through `runElectron` (`packages/core/src/test/electron-run.ts`): output to files, timeout, then any process of the test still alive (recognised by its `--user-data-dir`) is killed, tree included, and the test fails naming it; firewall commands (PowerShell, netsh, schtasks) have their input closed, are returned when the process ends, killed tree included at their timeout (30 s, 5 min for the Windows permission) and when the application closes (tests in `enfants-vivants.test.ts`).
  **Only known gap: a new console.**
  Windows 11 hands it to Terminal, which opens on the user's desktop and takes the focus, even from the hidden desktop: the scripts run their tools in their own console (`Start-Process … -NoNewWindow`, never `start`), and the application runs them with `windowsHide` (invariant tests in `offscreen.test.ts`).
- **Reserved for the machine's screens**: a VPX game ("Jouer" (Play), "Régler l'affichage en partie" (Adjust display in game)), the endurance test and captures of the whole desktop are refused off-screen with the message "… nécessite les écrans du poste" (… requires the machine's screens), and only run with `CYBERPINBALL_A_L_ECRAN=1` (real windows, full screen, focus taken).
  The "Choisir des fichiers" (Choose files) dialog box is also refused off-screen.
  Reading a table's script (`VPinballX -ExtractVBS`) is still allowed: VPX then opens no visible window.
- **Simulated screens for a test by hand**: the screen sets in `packages\core\ecrans-simules\` (`pc-dev.json`, `borne.json`, `poste-deux-ecrans.json`, `un-ecran.json`, `pincab.json`) are passed to `CYBERPINBALL_DISPLAYS`.
  A test by hand:

  ```powershell
  $env:CYBERPINBALL_DISPLAYS = "$PWD\packages\core\ecrans-simules\borne.json"
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  $env:CYBERPINBALL_AUTOPILOT = 'SansBoutons,Digit1'
  npx electron app --assistant
  ```

**Layout guard** (`app/src/layout-check.ts`): at each key replayed by the autopilot (setup wizard, table menu, VPX settings), every window is inspected in its actual rendering.
It reports two texts or controls that overlap (a layer with an opaque background hiding another one, like the help over the menu, does not count), anything that goes outside the window, and text clipped by a container that hides its overflow, itself included.
An intended cut ("…", lines limited by `-webkit-line-clamp`) only excuses the element that makes it: the lines it keeps must not be clipped by any other container (a title limited to two lines in a zone one line high lost its first line without being reported).
A scrolling list must carry no fade (`mask-image`: the line at the edge would look disabled), and the selected entry of a list (action, row, card) must be whole within it: neither clipped nor hidden by what stays pinned at the top of the list, except in a list the user moved away from it themselves with the wheel (`data-user-scroll`, set by `scroll-keeper.js` until the next change of selection).
A list that scrolls without a user gesture (wheel, pointer, keyboard in the page) or a render from `scroll-keeper.js` is reported ("défilement sans geste de l'utilisateur" (scrolling without a user gesture), also in the page's console); the autopilot, which brings a row into view before clicking it, declares that as a gesture.
Proofs: `defilement.test.ts` (progress ticks and change of selection in the real renderer of the menu and of the VPX settings, no `scrollIntoView` or `scrollTop` set outside `scroll-keeper.js`).
A test checks that the injected scripts compile (`packages/core/src/test/layout-check.test.ts`): a syntax error there made the guard silent.
The height used for a text is that of its font, in the right direction for a rotated view.
**20 px floor** (design system): a text or an icon smaller than 20 px at the scale of a 1,080 px short side, as it is seen, is reported ("texte plus petit que 20 px" (text smaller than 20 px)): the font size is multiplied by the scale of every `transform` above the text, and an animation that loops counts at its smallest step.
The names in the wheel's small medallions, shrunk by `scale(--s)`, went down to 13.6 px without being reported: the guard only measured icons, and the stylesheet test only read sizes in `cqmin`.
A font size in fixed px does not follow the screen: the screens' stylesheets have none (only the developer's sheet, `fallback-demo.css`, keeps some); the "Récupérer" banner had fifteen, from 12 to 16 px.
What a `clip-path: inset()` cuts off (the wheel brings its medallions in through its edges) does not count as outside the window.
**Menu zones**: each frame of the table menu states its zone (`data-frame`: "plateau" for the media's 9:16 frame, "menu" for the backglass, the wheel, the information and the help bar); two different zones that overlap are reported ("cadres qui se recouvrent", frames overlapping), as is a frame that leaves the playfield zone.
Two frames of the same zone may overlap (the wheel overlaps the backglass), and a frame that covers the whole zone is a background (the playfield media on a cabinet).
At 4:3, the backglass and the wheel covered the playfield frame without anything saying so: no text overlapped there (see "The table menu on a desktop, from 5:4 to 16:9 and wider").
A deliberate last resort below the floor is declared with `data-below-floor` (the loading card's controls at their smallest size); the cinema launch, which carries the medallion off the screen, is set apart, as are the fallbacks (`.cp-fb`, `fallback.js`): media drawn in place of an image or a video of the game, their texts follow the size of their zone like a media's (the loading fallback in the desktop's 9:16 frame).
Proofs: [plancher-textes.test.ts](../../packages/core/src/test/plancher-textes.test.ts) (wheel geometry, gliding included; no size in fixed px, nor written below 20 px, in the stylesheets, the menu's `--u`, `--w` and `--b` units included; reference cases in a real off-screen Chromium).
**Layers, style-sheet text, icons**: an opaque layer only excuses an overlap if it hides the text underneath entirely; if it hides only part of it (a banner over the end of a label), it is reported ("caché en partie", partly hidden).
An element that lets the mouse through (`pointer-events: none`) counts like the others: the point check used to fall through it.
Text written by the style sheet (`content:` of a `::before` or `::after`) is reported: with no text node, it escaped the check as well as translation; the interface text scan also reads the style sheets (`i18n-scan.ts`, `scanCss`).
An icon pushed alone above or below its text by a line break (running text, or a wrapping flex row; rotated views included) is reported ("icône seule sur sa ligne", icon alone on its line); a menu row keeps its icon in front of its text (`.lib-row-icon + .lib-row-text`).
Proof: [disposition-ecrans.test.ts](../../packages/core/src/test/disposition-ecrans.test.ts) (control cases in a real off-screen Chromium, then the real page of the layout editor, in the state rendered by `arrange.ts` and `wizard.ts`, on the cabinet, the shared backglass screen, the two-screen desk, the development PC and a single screen at 1366 × 768, 1920 × 1080 and 4K, in French and English).
Problems go to the console ("Mise en page : …" (Layout: …)) and to `<captures>\mise-en-page.txt` ("Aucun problème de mise en page." (No layout problems.) otherwise).

The wizard screen is built as a flow (`app/renderer/screen.*`): header, content centered in the remaining space, footer (message, step, help) and flipper strip, with no absolute positioning; content that is too tall pushes the footer down instead of sliding under it.
The summary panel, which does not scroll, shrinks its body by one or two steps as long as it overflows.
The button list switches to two columns when the screen is taller than it is wide.

**Sandbox guard** (`packages/core/src/sandbox.ts`, `app/src/sandbox-guard.ts`): as soon as `CYBERPINBALL_HOME` is set together with `CYBERPINBALL_AUTOPILOT`, `CYBERPINBALL_CAPTURE` or `CYBERPINBALL_STRESS`, the application and `sync` refuse any file write outside `CYBERPINBALL_HOME`, `CYBERPINBALL_ROOT`, the project's `tmp\` folder and the Windows temporary folder; the offending path is written to the console and the operation fails.
It protects the real root from a test that would target it by mistake (an ini path copied from a real cabinet model, an installer parameter that was ignored).
A deliberate test on the real root is done without `CYBERPINBALL_HOME`.

- **Setup wizard**: `CYBERPINBALL_AUTOPILOT` replays a sequence of keys, `CYBERPINBALL_CAPTURE` saves a capture of each screen after each key.
  The `SansBoutons` pseudo-code acts as if nobody had touched anything during the "Boutons" step (current keys kept, without waiting 20 s).
  Each key is pressed then released (button capture counts on release); `Maintenir3:KeyA` holds it for 3 s, `CtrlQ` sends Ctrl+Q.
  These keys go straight to key handling; `Clavier:KeyA`, on the other hand, goes along the path of a real key (`webContents.sendInputEvent` on the primary screen, `before-input-event`, Chromium, the page) and reports a key whose press or release did not arrive; `Joy3` presses button 3 of an SDL virtual joystick.
  Each capture leaves a line in the console ("Assistant : relevé game, credit sur Digit5 : gardé", or refused, or skipped).

  ```bash
  CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftLeft,Digit1,Digit1,Digit1,Digit1,ShiftRight,Digit1,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/captures npx electron app --assistant
  ```

  When unattended, screen orientation is simulated (the geometry changes in `ecrans-simules-orientation.json`, no screen rotates).
  The `Attendre16` pseudo-code lets 16 seconds pass without a key, to see the countdown expire.
  Proposing, canceling, letting expire, then confirming the flip:

  ```bash
  CYBERPINBALL_HOME=tmp/flip/home CYBERPINBALL_AUTOPILOT=SansBoutons,Digit1,ShiftRight,Digit1,Escape,Digit1,Escape,ShiftRight,Digit1,Attendre16,ShiftLeft,Digit1,Digit1,Digit1,Escape,Escape,Escape,Digit1 CYBERPINBALL_CAPTURE=tmp/flip/captures npx electron app --assistant
  ```

  The "Son" (Sound) step really plays its beeps (short ones: each key arrives 400 ms after the previous one) and writes a report of each sound to the console (output found, channels opened).
  `CYBERPINBALL_AUDIO_OUTPUTS=<file.json>` replaces the detected outputs with a list in the format of the `audio` field of `npm run probe -- --json`, for example to add a fake 7.1 card and capture the speaker test (Electron cannot find it: no sound, message on screen).
  With four screens, a fake backglass HDMI output and a fake 7.1 card:

  ```bash
  CYBERPINBALL_AUDIO_OUTPUTS=tmp/son/sorties-simulees.json CYBERPINBALL_HOME=tmp/son/home CYBERPINBALL_AUTOPILOT=SansBoutons,ShiftRight,ShiftRight,ShiftRight,Digit1,Digit1,Digit1,Digit1,Escape,Escape,ShiftLeft,ShiftRight,Escape,Escape,Digit1,ShiftLeft,ShiftRight,Digit1 CYBERPINBALL_CAPTURE=tmp/son/captures npx electron app --assistant
  ```

- **Launcher endurance** (milestone 2 criterion, **requires the machine's screens**: `CYBERPINBALL_A_L_ECRAN=1`): `CYBERPINBALL_STRESS="N,S"` launches the table chosen by `CYBERPINBALL_TABLE` N times, stops each game after S seconds and checks that the menu takes back the foreground.
  The report is displayed and written to `data\logs\stress-*.json`; these games do not count in the statistics.

  ```bash
  CYBERPINBALL_A_L_ECRAN=1 CYBERPINBALL_STRESS=50,10 CYBERPINBALL_TABLE=1.25 npx electron app
  ```

- **Menu rotation**: `CYBERPINBALL_FLIPPERS=bottom|left|top|right` forces the flipper edge without modifying `cabinet.json` (left: 90°, right: 270°, top: 180°).
  With `--reglages`, the screen alone only rotates if this variable is set.
  The autopilot's `drag` step: the file drop frame.

  ```bash
  CYBERPINBALL_FLIPPERS=left CYBERPINBALL_HOME=tmp/home CYBERPINBALL_AUTOPILOT=Digit1,Escape,Escape CYBERPINBALL_CAPTURE=tmp/captures npx electron app
  ```

- **VPX settings**: `CYBERPINBALL_AUTOPILOT` and `CYBERPINBALL_CAPTURE` also work with `--reglages`, with `click:<selector>` (`click:.back`: the back button).

- **Installer**: in a sandbox (`CYBERPINBALL_HOME` set), the installer puts `root.json` and the shortcuts (`Menu Démarrer`, `Bureau`, `Démarrage`) in that folder and writes nothing to the registry.
  In silent mode, `/D=` is mandatory there (failing that, only the root remembered in that sandbox is accepted): never a fallback to the real root.
  The uninstaller reads this choice back from `installation.ini`.
  Installation, first launch (`--user-data-dir` also keeps Chromium's data in `tmp\`), then uninstallation:

  ```powershell
  $env:CYBERPINBALL_HOME = "$PWD\tmp\essai\home"
  Start-Process release\CyberPinball-Setup-complet.exe -ArgumentList '/S', "/D=$PWD\tmp\essai\racine" -Wait
  $env:CYBERPINBALL_AUTOPILOT = 'wait:500'; $env:CYBERPINBALL_CAPTURE = "$PWD\tmp\essai\captures"
  Start-Process tmp\essai\racine\app\CyberPinball.exe -ArgumentList "--user-data-dir=$PWD\tmp\essai\electron" -Wait
  Start-Process 'tmp\essai\racine\app\Désinstaller Cyber Pinball.exe' -ArgumentList '/S'
  ```
