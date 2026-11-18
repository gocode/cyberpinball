[Français](../manuel/relance-par-start.md) · English · [Manual contents](../manual.md)

## Relaunch with Start

A **long press (2 s) on Start**, when Start is a joystick button (Pinscape on a KL25Z, encoder in gamepad mode, recorded in the “Boutons” (Buttons) step), reopens Cyber Pinball from Windows:

- **Cyber Pinball closed** (“Quitter Cyber Pinball” (Quit Cyber Pinball), Alt+F4, crash): it starts again, as from its shortcut;
- **Cyber Pinball open in desktop mode** (system menu > “Borne” (Cabinet) > “Bureau Windows” (Windows desktop)): the menu comes back on all its screens, as with Ctrl+Shift+D or the taskbar.
  The Start press that picked “Bureau Windows” does not count: release it, then hold it again.

Nothing happens during a VPX game started from the desktop (a “Visual Pinball Player” window on screen: Start is a game button there), nor while the menu is open.
A Start mapped to a keyboard key is not covered: on the desktop, the key would also reach the foreground program.

**The watcher.**
With Cyber Pinball closed, nothing reads the joystick any more: a small windowless process does: `CyberPinball.exe` in Node mode (`ELECTRON_RUN_AS_NODE`, like the light update), running `dist\veilleur.js` (`app/src/veilleur.ts`; menu side `app/src/start-relaunch.ts`, pure logic in `packages/core/src/start-relaunch.ts`).
Without Chromium, it costs about 0.2% of one core and 45 MB.
It reads the Start button through VPX's SDL, like the menu (same `SDLJoy_<GUID>_<rank>;<button>` tokens), ten times a second, and rereads the button mapping (`cabinet.json`) every 5 s.
One watcher at a time: a second one, seeing the first alive (its pid), quits at once; it does not count as a second launch of Cyber Pinball.
While Cyber Pinball is open (`<data>\relance-start\application.pid`, pid checked against its executable name), it does not read the joystick.

- **Start-up**: a `Cyber Pinball - relance par Start.lnk` shortcut in the account's Startup folder (`CyberPinball.exe --veilleur`, which starts the watcher and exits at once), placed by installed Cyber Pinball each time the menu starts (redone if it points to another executable), and the watcher started if it is not running.
  From the sources, nothing is placed (the executable is Electron).
- **Updates**: the watcher keeps `CyberPinball.exe` open.
  It is stopped (`<data>\relance-start\veilleur.pid`) before the installer or the light update, by the installer itself (run by hand), by the uninstaller and by `npm run deployer`; Cyber Pinball, once restarted, starts it again.
- **Setting**: system menu > “Borne” (Cabinet) > “Relance par Start” (Relaunch with Start), which says “oui” (yes) or “non” (no) (`<data>\relance-start\reglage.json`, yes by default).
  Greyed out, with the reason, when Start is not a joystick button and on a [dedicated cabinet](dedicated-cabinet.md#dedicated-cabinet), where Cyber Pinball relaunches by itself.
  “Non” (No) removes the shortcut and stops the watcher.
- **Log**: the watcher writes to the same `journal.txt` (“Relance par Start : …”): button followed, press recognised, launch or reason for doing nothing.
