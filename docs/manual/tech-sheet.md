[Français](../manuel/fiche-technique.md) · English · [Manual contents](../manual.md)

## Tech sheet

System menu > "Borne" (Cabinet) > "Fiche technique" (Tech sheet) sums up everything the cabinet is made of, to spot a problem yourself or describe it to whoever helps, and builds the report to send them.
The page shows six blocks, each with its state written out ("✓ OK", "! À vérifier" (To check), "✕ Bloquant" (Blocking), never colour alone) and the gist on one line; Start opens the block's detail, in a "label | value" grid (every value starts from the same edge, `Section.kind` `spec`, `Row.label`), followed by its "À vérifier" (To check) points explained and the menu entries that fix them.

| Block | What it shows | What it offers |
| --- | --- | --- |
| PC | Drives first (model, NVMe, SSD or hard drive, free space), then processor, memory (modules, speed, share in use), graphics card and its driver version (NVIDIA's, "566.36", not Windows'), motherboard and BIOS, network, Windows start | Downloads (free up space) |
| Windows | Edition and build, restart pending, power plan and screen and sleep timeouts, Game Mode, GPU scheduling, notifications, Visual C++, antivirus, language and keyboard | Restart the cabinet (when an update is pending), Dedicated cabinet |
| Screens | Each connected screen, by its role in the setup in use: model, diagonal, resolution, refresh rate, connection (HDMI, DisplayPort…), highest advertised refresh rate when it has one, Windows scale, rotation; then the setup in use and its screens found | Cabinet configuration |
| Controllers | Buttons (Pinscape, keyboard or encoder, number of buttons set up), plunger, accelerometer, DOF controllers | Cabinet controls, LEDs and feedback (DOF) |
| Software | VPX and the version Cyber Pinball knows ("facultative", optional: information, not a fault), the VPX plugins found in its `plugins` folder and their state in `VPinballX.ini` (PinMAME, B2S, DOF, FlexDMD, PUP, Serum, AltSound, DMDUtil first), the tables with a PuP-Pack; the VPX files replaced outside Cyber Pinball, named with their version ("Fichiers de VPX : 1 modifié" (VPX files: 1 changed), "SDL364.dll 3.2.18.0") | Install the known VPX version, VPX settings, Cabinet health ("Remettre les fichiers d'origine" (Put the original files back)) |
| Cyber Pinball | Version and pre-releases, mode (cabinet or desktop), dedicated cabinet, data folder, tables and tables ready, friends network, paired phones, log errors since yesterday, language; on the last line, the cabinet number | Cyber Pinball update, Recent activity |

**Reading.**
A PowerShell script with no window and no elevation (`TECH_PROBE_SCRIPT`, [app/src/tech-facts.ts](../../app/src/tech-facts.ts)) reads the PC and Windows (CIM, registry, `powercfg`, `Get-Disk`, `Get-NetAdapter`); it takes a few seconds to twenty seconds and runs on its own, without blocking the menu.
Each part is in its own `try`: what fails stays absent and the line says "Non relevé" (Not read), nothing is asserted.
`probeDisplayLinks` ([win-displays](../../packages/win-displays/src/index.ts)) gives each screen's connection (`DISPLAYCONFIG_PATH_TARGET_INFO.outputTechnology`), its refresh rate, the highest one Windows offers at its resolution (`EnumDisplaySettingsExW`, `displayRefresh`) and the one the screen advertises in its EDID ("range limits" descriptor, `edidMaxRefresh`).
Each screen's role comes from its fingerprint, as for the health page (`techDisplays`).
The page opens at once on the last reading, kept in `<data>\cache\fiche.json`, then reads again; "Relever à nouveau" (Read again) restarts it.
Tests replace the reading with a file (`CYBERPINBALL_FICHE`).

**Screen refresh rate.**
A screen below its refresh rate is "To check", without asserting a cause that is not established (`refreshGap`, `refreshNote`): if Windows offers more at this resolution, the line says so ("Playfield à 60 Hz, Windows propose 144 Hz", Playfield at 60 Hz, Windows offers 144 Hz) and points to the display settings; if only the screen advertises more, it asks to check the port and the cable, and recalls, over HDMI only, that some cables and cards cap 4K at 60 Hz.
A one-hertz gap (59.94 Hz) does not count.

**Cabinet number.**
The last line of the Cyber Pinball block, indented, gives the cabinet number ("7KQ2-M9XD"), to give to the Cyber Pinball team so they can find this cabinet's reports.
It is derived from the cabinet identifier the reports carry (a fingerprint, with no way back to the identifier, `borneCode` in [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts)), in eight characters of Crockford's alphabet (no I, L, O or U, which get mixed up over the phone); it says nothing about the player.
It is saved from its first reading on, and no longer changes from one start to the next.
Test: `numero-borne.test.ts`.

**In the cabinet health.**
Each reading updates the "PC et Windows" (PC and Windows) group of [Cabinet health](cabinet-health.md#cabinet-health) (`HealthFacts.pc`, `pcLines`), without redoing the rest: screens below their refresh rate, Windows restart pending, power plan ("Économie d'énergie", Power saver, to check), graphics driver more than two years old, less than 8 GB of memory.
Each line opens the tech sheet block that explains it (`sheet` target), whose "Retour" (Back) returns to the health page.

**Send a report.**
A `rapport-borne-YYYY-MM-DD.zip` ZIP (`buildReport`, [packages/core/src/techsheet.ts](../../packages/core/src/techsheet.ts)): `rapport.html` (the sheet and the health, a standalone page with no script or external resource, readable and printable anywhere), `probleme.txt` (what the player wrote through "Décrire le problème" (Describe the problem), with the phone or the keyboard, if they did), `resume.txt`, `sante.json`, `fiche.json`, the Cyber Pinball log for the last seven days (`journalSince`), the VPX log of the last game, `VPinballX.ini` and `configurations.json`.
Every game is measured there: the Cyber Pinball log has the "Cadence de la partie" (Frame rate of the game) line of each (frames per second VPX held against the target, picture freezes, memory used by VPX, verdict), and VPX's log has each stall at its time and the plugin's summaries (see "Frame rate of every game" in [Launching a game](launching-a-game.md#launching-a-game)).
After a failed launch, the ZIP also attaches VPX's `crash.txt` (its call stack); a VPX log older than that launch, VPX having stopped before writing its own, is named `vpinball-partie-precedente.log` (earlier game) there instead of `vpinball.log`.
Everything is **anonymised before writing** (`anonymizer`): profile folder and account name (`‹utilisateur›`), PC name (`‹PC›`), names of the player, the cabinet and friends (`‹ami 1›`…), IPv4 and IPv6 addresses, email addresses; screen fingerprints and serial numbers become "écran 1", "écran 2".
Version and driver numbers and times stay readable.
"Voir le contenu du rapport" (See what the report contains) lists each file, its size and what is replaced.
Five destinations, since the cabinet has no mail app:

- **To the Cyber Pinball team**: the [Feedback and ideas](feedback-and-ideas.md#feedback-and-ideas) form, the report attached and the description carried over; it goes encrypted to the project service.
- **To the connected phone** (the remote, [The phone as a remote for the menu](the-phone-as-a-remote-for-the-menu.md#the-phone-as-a-remote-for-the-menu)): the phone gets a "Rapport de la borne" (Cabinet report) sheet with "Télécharger le rapport" (Download the report), "Préparer un e-mail" (Write an email: a `mailto:` link that opens its mail app with the summary, `reportMailto`; the downloaded file is attached there) and "Copier le résumé" (Copy the summary, for a forum or WhatsApp).
  The phone page is served over HTTP: the system share sheet (`navigator.share`) and the modern clipboard are not allowed there, hence these three actions.
  The cabinet serves the ZIP under a random token, to this phone's address only, for ten minutes (`offerReport`, `REPORT_MS`, [phone-remote.ts](../../app/src/phone-remote.ts)); it travels in clear on the local network, like any download, but it is already anonymised.
  With no phone connected, the line becomes "Connecter un téléphone" (Connect a phone) and opens the remote's QR code.
- **On a USB stick**: one line per plugged-in stick, the report written to `Rapports Cyber Pinball` then read back; "Éjecter la clé" (Eject the stick) follows.
  Without a stick, the line stays visible, greyed out with its reason.
- **To a friend**: the short summary (500 characters at most, the points to look at first, `reportShort`) goes into the messages thread, followed by the problem description; messages only carry text, the full file goes through the phone or a stick.
  Greyed out without friends, or with the friends network off.
- **In a cabinet folder**: `<data>\rapports`, to copy yourself.

Code: blocks, checks, anonymisation and report in [packages/core/src/techsheet.ts](../../packages/core/src/techsheet.ts); reading in [app/src/tech-facts.ts](../../app/src/tech-facts.ts); screens in [app/src/tech-sheet.ts](../../app/src/tech-sheet.ts); phone page in `app/renderer/telephone/telephone.js` (`reportOffer`).
[techsheet.test.ts](../../packages/core/src/test/techsheet.test.ts) pins the reading of the probe, the NVIDIA driver version, the refresh rates, the health checks, the blocks, anonymisation (never the account, the PC or an address in any file of the ZIP) and the short summary.
