[Français](../manuel/demarrer.md) · English · [Manual contents](../manual.md)

## Getting started

Requirements: Windows 10 or 11, Node.js 22 or later.

The simplest way: double-click `lanceur.cmd`.
It offers a menu (play, installation, opening VPX, detection, wizard, synchronization, tests, data folder) and compiles whatever is needed before each action.
`.\lanceur.cmd sync` runs an action directly.

**As an end user**: the "Fabriquer et déployer" (Build and deploy) action (or `npm run deployer`) produces `CyberPinball.exe` and copies it to `<racine>\app\`, with a `Cyber Pinball.lnk` shortcut at the root.
The executable finds its root by itself (the folder that contains `app\`); if VPX is missing, it offers to install it from the screen.

**To distribute**: the "Fabriquer l'installeur" (Build the installer) action (or `npm run installeur`) produces `release\CyberPinball-Setup.exe` (light version) and `release\CyberPinball-Setup-complet.exe` (with VPX).
See [Windows installer](installation-and-file-layout.md#windows-installer).

The same commands with npm:

```bash
npm install
npm test          # builds and runs all the core tests (about fifteen minutes: before each pre-release)
npm run verifier  # while working: the fast tests, without Electron or Chromium (-- puppack vbs: those test files; -- --modifies: those of the changed files)
npm run test:electron # only the tests that launch Electron, Chromium or another process
npm run avant-fusion  # publication check, then npm test: before each merge into the published branch
npm run probe     # lists the detected screens and audio outputs, their fingerprint and the name VPX expects
npm start         # table menu (screen wizard on first startup)
npm run assistant # full wizard (-- --boutons, --lanceur, --tilt, --ecrans, --playfield, --disposition, --son: a single step)
npm run fabriquer # executable in release\win-unpacked\ (npm run deployer: also copies it to <racine>\app\)
npm run installeur # same, then release\CyberPinball-Setup.exe and -complet.exe (-- --leger: without the full one)
npm run sync      # what the application does at every startup: fixes VPinballX.ini if the screens have moved
npm run vpx-schema # regenerates the VPX settings schema from its source code (-- --check: check only)
```

**In a worktree without its own `node_modules`** (`.claude\worktrees\<nom>`), Node and tsc find the dependencies by walking up to the main folder, but its `@cyberpinball\*` links lead to the main folder's code.
`npm run build` (hence `npm test`) starts with [scripts/liens-espaces.mjs](../../scripts/liens-espaces.mjs), which creates in the worktree the `node_modules\@cyberpinball\*` junctions to its own folders: `app\` builds and runs against the worktree's core.
The script deletes nothing; a link that points elsewhere stops the build with the command to remove it.
Tests load a dependency file by its package name (`require('hyperdht/testnet.js')`), never through a `node_modules` path (checked by `resolution-depot.test.ts`).
Before compiling, `npm run build` also removes, through [scripts/sorties-orphelines.mjs](../../scripts/sorties-orphelines.mjs), the `dist\` files whose source was deleted or renamed: `tsc -b` never deletes them, and `npm test` still ran a removed test left in `dist\test\` (`--verifier` lists them without removing anything).

The keys are those of the cabinet buttons, recorded at the first step of the wizard ("Boutons" (Buttons), see below).
Until that step has been done, they are the ones cabinet encoders send by default:

| Button | Default key | Setup wizard | Table menu |
| --- | --- | --- | --- |
| Left / right flipper | Left / right Shift | Change screen; sound: backglass / playfield | Choose a table |
| Start | 1 | Confirm; sound: both | The table's game page; or the game, setting "Start sur la roue : jouer directement" (Start on the wheel: play right away; the game page on a held Start, or F6 on a keyboard) |
| Exit | Esc | Skip a role, start over; sound: no role; buttons: skip an optional button | Menu: back, VPX settings, buttons, quit |
| (keyboard) | arrows, Enter, Esc | Like the flippers, Start, Exit | Like the flippers, Start, Exit |
| (keyboard) | Tab | Button: refused (reserved) | System menu, from anywhere in the menu; then Tab / Shift+Tab to move through it |
| (mouse) | ⚙ top right | | System menu |
| (mouse) | "‹" and the name of the screen it leads to, above the title | | Like Exit, in every submenu, on the game page and in the VPX settings |
| (keyboard) | H | | Show the controls |
| (keyboard) | R | | VPX settings |
| (keyboard) | Backspace | Previous step | |
| (keyboard) | Ctrl+Q | Quit | Quit |
| (keyboard) | Ctrl+Shift+D | | "Bureau Windows" (Windows desktop): frees every screen of the PC; again, even from another application: back to the menu |
| Windows desktop (optional) | none | | Like Ctrl+Shift+D, in one press; joystick button: pressed again on the desktop, back to the menu |
| (keyboard) | Ctrl+Shift+K | | Stop a stuck game |

The keyboard keys only work if no cabinet button already sends them (an arrow recorded as the right flipper no longer moves back); the same goes for H and R.

**Mouse pointer**: it hides three seconds after it last moved, on every Cyber Pinball window (menu, wizard, settings, in-game menu, "Get" window), and comes back as soon as the mouse moves.

**Shortcuts in the system menu**: an entry that has a shortcut shows it to the right of its label, as circled keys like the help bar ("Réglages de VPX" (VPX settings): R, "Commandes de la borne" (Cabinet controls): H, "Bureau Windows" (Windows desktop): Ctrl Shift D), and the shortcut also triggers it from that menu.
The keys shown are read where the shortcut is defined: this cabinet's interface keys (`interfaceKeys`, a key taken by a button disappears) and the combinations in `SHORTCUTS` (`packages/core/src/shortcuts.ts`), which also give the global shortcut and the controls reminder.
A joystick button is not shown (its name does not fit in a key).
Art direction model: `LigneMenu`, `.cp-shortcut`.

**Back at the top of the screen**: every menu screen (system menu, game page, doctor, adding, catalog, media, configurations…) has, above its title, a button that does what Exit does; with the mouse, no need to go down to the bottom of the list to find "Retour" (Back).
It **names the screen it leads to**: "‹ Neon Abyss" (the game page), "‹ Gérer la table" (Manage the table), "‹ Téléchargements" (Downloads), "‹ Menu des tables" (Table menu: the wheel, or the list of titles).
The destination is read from the trail of screens gone through (`BackTrail`, [packages/core/src/backtrail.ts](../../packages/core/src/backtrail.ts)): each screen shown is added to it, and coming back to one of them, through its back button or through an action that reopens it (save, cancel), cuts what follows.
A back that lands somewhere other than where its button said is learnt for the next time and written to the log ("Retour de « … » : le bouton annonçait « … », arrivé sur « … »"), so that the screen declares its destination; Exit, a click on the button, Start or a click on the back action all check it.
A back action that says something other than going back ("Annuler" (Cancel), "Retour sans enregistrer" (Back without saving)) keeps its label; At the bottom of the list, a plain "Retour" (Back) also names its destination ("Retour : Menu système" (Back: System menu)), and "Retour à la fiche" (Back to game page) that actually leads to "Gérer la table" becomes "Retour : Gérer la table" (Back: Manage the table).
In the list of a two-zone screen, where Exit moves to the actions instead of going back, the button shows **"Exit : actions"** (the circled key) and a click does the same.
It does not appear when the back action is the only one on the screen (a message and its "Continuer" (Continue)).
Every screen described by `Built` (`app/src/library.ts`) gets it from its `back` field, which is mandatory: a new screen cannot forget it (`backLabel`, renderer action `back`, `.lib-back` in `app/renderer/library.*`).
The on-screen keyboard covers it without removing it, so that the page does not jump.
The VPX settings have their own under the brand: "‹ Retour aux sections" (Back to sections) in a section of the "Avancé" (Advanced) tab, "‹ Fermer" (Close) elsewhere.
Tests: [retour-nomme.test.ts](../../packages/core/src/test/retour-nomme.test.ts).

During a game, the keys are those written in VPX's `[Input]` section (shown again on the loading screen on a desktop, and in the reminder, H key): by default Shift for the flippers, Enter for the plunger, 5 for a credit, 1 for Start, Esc to quit (VPX 10.8.1 quits as soon as it is pressed), P to pause (pressing it again resumes the game), and both MagnaSave buttons together (without them, Credit and Start) for the in-game settings: the DMD position, then VPX's menu, where the other screens are placed ("DMD position during a game", "Adjusting the display during a game").
