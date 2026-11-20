[Français](../manuel/borne-dediee.md) · English · [Manual contents](../manual.md)

## Dedicated cabinet

An option, off by default: until it is turned on, Cyber Pinball writes nothing to Windows.
When on, it makes Cyber Pinball the Windows *shell* for the cabinet account, instead of Explorer: at sign-in it opens instead of the desktop and the taskbar, and the desktop never shows again, not even during the 1 to 2 s of startup (see [Known limitations of the prototype](known-limitations-of-the-prototype.md#known-limitations-of-the-prototype)).
Other accounts, the administrator included, keep Explorer.
Entry: System menu > "Borne" (Cabinet) > "Borne dédiée" (Dedicated cabinet).

**Chosen means: Shell Launcher**, the Windows feature made for kiosks (optional features `Client-DeviceLockdown` and `Client-EmbeddedShellLauncher`, WMI class `WESL_UserSetting`): one shell per account (SID), and an action when the application exits, depending on its exit code (0 restart it, 1 restart the PC, 2 shut it down, 3 do nothing).
It only exists in the Enterprise, Education and IoT Enterprise editions (Windows 11 IoT Enterprise LTSC 2024 included), not in Pro or Home: there, the screen uses the account's "Interface utilisateur personnalisée" (Custom User Interface) setting and a supervisor (see below, "Without Shell Launcher").
Ruled out: the `Shell` value under `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`, per account and without elevation, but described by no current Microsoft documentation (on the development PC, `IniFileMapping\system.ini\boot` only has `Shell` read from HKLM), with no restart if Cyber Pinball closes or crashes (black screen), and without the startup programs that Explorer launches.

Code: [packages/core/src/dedicated.ts](../../packages/core/src/dedicated.ts) (elevated script, simulated Windows, judging the results), [app/src/dedicated-menu.ts](../../app/src/dedicated-menu.ts) (screen), [app/src/dedicated-system.ts](../../app/src/dedicated-system.ts) (executor: the real one, and the simulated one of offscreen runs and sandboxes), [app/src/dedicated-session.ts](../../app/src/dedicated-session.ts) (session where Cyber Pinball is the shell).
Tests: [dedicated.test.ts](../../packages/core/src/test/dedicated.test.ts) runs the logic of the real script in PowerShell on a simulated system layer (no call to Windows) and compares it with the simulator; [dedicated-menu.test.ts](../../packages/core/src/test/dedicated-menu.test.ts) walks through the screen and pins the invariant: **no write to Windows starts anywhere but the "Turn on" and "Turn off" actions**.

### Turning on

1. First create another administrator account, with a password: it is the way back in, as a rescue.
   Without it, the screen refuses to turn on ("Blocking").
2. Sign in with the cabinet account, with Cyber Pinball installed (`<root>\app\CyberPinball.exe`; from the sources, turning on is refused).
3. System menu > "Borne" (Cabinet) > "Borne dédiée" (Dedicated cabinet): the screen says what changes and checks the Windows edition and the rescue account.
4. "Turn on for this account": Windows asks for permission (UAC; an administrator's password if the cabinet account is a standard account).
   A single script, `<data>\borne-dediee\activer.ps1`, reads the state of Windows, enables the optional features, makes Explorer the shell of other accounts if it was not, gives this account the command `"<root>\app\CyberPinball.exe" --borne-dediee`, starts Shell Launcher, then reads the state again; the screen checks every point.
   If turning on fails midway, the script puts the previous state back by itself.
5. Restart the PC: the session opens on Cyber Pinball.
   If Windows asks for a restart to enable the features, the screen says so; after the restart, "Finish turning on".

Kept in `<data>\borne-dediee`: `etat.json` (the previous state of Windows, reference for turning off) and `desactiver.ps1` (the rescue script).

### Going back

System menu > "Borne" (Cabinet) > "Borne dédiée" (Dedicated cabinet) > "Turn off and bring back the desktop" (Windows permission).
The script puts every point back in its previous state, reads it again, then disables the optional features if they were disabled; the screen compares point by point and marks each one "Checked".
A difference stays on screen ("Blocking"), and the previous state is kept to try again.
The desktop comes back at the next sign-in; the features are fully removed at the next restart.

| Point | Turn on | Turn off |
| --- | --- | --- |
| Startup of the cabinet account (`SetCustomShell`) | Cyber Pinball, restarted on any exit except code 77 | the previous setting, or none |
| Shell Launcher running (`SetEnabled`) | yes | the previous value |
| Startup of other accounts (`SetDefaultShell`) | `explorer.exe`, if it was not | the previous value |
| `Shell` value under `HKLM\…\Winlogon` (rewritten by `SetEnabled`) | not written by Cyber Pinball | the previous value, checked |
| Optional features | enabled | disabled, if they were |

### Rescue

- **On the cabinet**: Ctrl+Alt+Del, then "Task Manager"; File > Run new task: `explorer.exe` (a file window) or any other program.
  Or Ctrl+Alt+Del, "Sign out", then sign in with the administrator account, which keeps the desktop.
  Shell Launcher does not block Ctrl+Alt+Del (the Windows keyboard filter would, but Cyber Pinball does not enable it).
- **From the administrator account, without Cyber Pinball**: in PowerShell started as administrator, the rescue script puts the previous state back, like "Turn off", and prints its result; the next time the "Borne dédiée" screen opens, Cyber Pinball reads it, checks it and forgets the activation.

```powershell
powershell -ExecutionPolicy RemoteSigned -File "D:\CyberPinball\data\borne-dediee\desactiver.ps1"
```

- **Cyber Pinball keeps restarting** (it crashes at startup, Shell Launcher restarts it): Ctrl+Alt+Del, "Sign out", administrator account, the script above, then restart; the cause is written to `<data>\logs\erreurs.txt`.
- **As a last resort**, without Cyber Pinball's files, in PowerShell as administrator (`Borne`: the name of the cabinet account):

```powershell
$sid = (New-Object System.Security.Principal.NTAccount('Borne')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$sl = [wmiclass]'\\localhost\root\standardcimv2\embedded:WESL_UserSetting'
$sl.RemoveCustomShell($sid)
$sl.SetEnabled($false)
```

### Without Shell Launcher: Windows Pro and Home

On Windows 11 Pro, Shell Launcher does not exist, and the screen offered nothing.
It now offers, on every edition, two ways to choose from, always for the cabinet's account only; on Enterprise, Education and IoT Enterprise, "Activer pour ce compte" (Turn on for this account) is still Shell Launcher.

- **"Remplacer le bureau pour ce compte" (Replace the desktop for this account)**: the "Custom User Interface" policy (the one `gpedit.msc` sets under User Configuration > Administrative Templates > System), the `Shell` value of `HKEY_USERS\<SID>\Software\Microsoft\Windows\CurrentVersion\Policies\System`, documented by Microsoft and read at sign-in.
  It is set to `"<root>\app\CyberPinball.exe" --borne-compte`.
  A policy can only be changed as an administrator: Windows asks for permission (UAC), when turning on and when turning off.
  Same conditions as Shell Launcher: another administrator account, an installation.
- **"Lancer au démarrage de Windows" (Launch at Windows startup)**: the `Cyber Pinball.lnk` shortcut in the account's Startup folder (the same as the installer checkbox), and the desktop hidden behind it: empty wallpaper (`Control Panel\Desktop\WallPaper`), black background color (`Control Panel\Colors\Background` = `0 0 0`), hidden icons (`Explorer\Advanced\HideIcons` = 1).
  No UAC.
  The black desktop shows for 1 to 2 s before Cyber Pinball covers the screens.
  Also under System menu > "Borne" > "Lancement au démarrage" (Launch at startup), which opens the same page and says in its label whether Cyber Pinball already launches (installer shortcut included).

**The supervisor.**
Windows does not restart a shell that closes; Cyber Pinball does it itself, like Shell Launcher: `--borne-compte` starts a windowless process (`app/src/supervisor.ts`, called by `main.ts` before anything else) that launches `CyberPinball.exe --borne-dediee` and restarts it on every exit, crashes included.
Everything "What the dedicated cabinet changes elsewhere" describes therefore holds as is (relaunches, exit code 77 of an update, after which the supervisor stops).
If Cyber Pinball exits 5 times within 2 minutes, the supervisor opens Explorer and stops, rather than leave a black screen (`supervisorVerdict`).
It records its start in `<data>\borne-dediee\surveillant.json`.

**The backup.**
Before any write, the script (`<data>\borne-dediee\reglages-ecrire.ps1`, generated) records each setting it is about to change, missing value included; this record is saved in `reglages-windows.json` and the screen shows it ("Sauvegarde du … : « Désactiver » remet", Backup of …: "Turn off" puts back, before and now, setting by setting).
"Désactiver et rétablir le bureau" (Turn off and bring back the desktop) or "Ne plus lancer au démarrage" (Stop launching at startup) puts the backup back as it was, then checks it setting by setting ("Vérifié", Checked).
A write that fails midway puts the previous state back by itself.
The rescue script `retablir-reglages.ps1` does the same outside Cyber Pinball; the screen then reads its result and forgets the activation:

```powershell
powershell -ExecutionPolicy RemoteSigned -File "D:\CyberPinball\data\borne-dediee\retablir-reglages.ps1"
```

On a stuck cabinet: Ctrl+Alt+Del, "Task Manager", File > Run new task, this command, ticking "Create this task with administrative privileges" if the desktop is replaced.

**Diagnosis.**
Desktop replaced: if the PC has restarted since turning it on and the session still opens with the desktop, the screen says so in red, "Windows n'a pas appliqué le réglage" (Windows did not apply the setting: the supervisor never started) or "Le surveillant a rendu la main à l'Explorateur" (The supervisor handed over to Explorer: Cyber Pinball kept closing, cause in `erreurs.txt`).
In the first case, fall back to "Lancer au démarrage de Windows".

Code: [packages/core/src/windowssettings.ts](../../packages/core/src/windowssettings.ts) (script, simulated Windows, verdict, supervisor rule), [app/src/supervisor.ts](../../app/src/supervisor.ts), the screen and the executor above.
Tests: [windowssettings.test.ts](../../packages/core/src/test/windowssettings.test.ts) runs the real script on a simulated layer and compares it with the simulator, for each way and each starting point, turning off and failure midway included; [dedicated-menu.test.ts](../../packages/core/src/test/dedicated-menu.test.ts) goes through both ways on Windows Pro and pins the invariant: a write only comes from the screen's actions.

### What the dedicated cabinet changes elsewhere

- **Restarts** (menu ↔ wizard, language, cabinet setup): Shell Launcher only watches the process it started.
  That process writes down its arguments (`<data>\borne-dediee\relance.json`, valid for one minute), closes, and Shell Launcher starts it again; the new one picks them up.
  In between, the screen is black for a moment (without Explorer, there is no desktop to see).
- **Closing or crashing**: Shell Launcher restarts Cyber Pinball.
  "Quit Cyber Pinball" disappears from the menu (it would only relaunch); "Restart Cyber Pinball" stays.
- **Update**: Cyber Pinball closes with code 77, for which Shell Launcher does nothing; the installer (or `maj-legere.js`) restarts it, as usual.
  That Cyber Pinball is no longer watched by Shell Launcher until the next sign-in: if it closes, it restarts itself, but a crash is no longer caught.
  Restarting the PC after an update brings the watch back.
- **"Windows desktop" becomes "Open Windows Explorer"**: without Explorer there is neither desktop nor taskbar.
  The entry opens an Explorer window (under Shell Launcher, `explorer.exe` started on its own only opens a file window: it only becomes the shell, with desktop and taskbar, when the Winlogon `Shell` value is its own; behaviour reported by third-party sources, to be confirmed on the cabinet), then frees every screen like desktop mode; Ctrl+Shift+D or Alt+Tab brings back the menu.
- **Taskbars**: without Explorer there are none; hiding them during a game (screen guard) finds nothing to hide, and still only restores what it hid.
- **Taskbars when the cabinet starts with Windows**: when "Lancer au démarrage de Windows" (Start with Windows) or "Remplacer le bureau" (Replace the desktop) is on (`reglages-windows.json`, `etat.json`), when the `Cyber Pinball.lnk` shortcut is in the account's Startup folder (the installer's box included) or when Cyber Pinball is the shell, the taskbars are hidden **for the whole session**, not only during games (`cabinetHidesTaskbars`, `packages/core/src/coexistence.ts`).
  Those Explorer creates after Cyber Pinball when Windows starts, or shows again, are hidden as soon as they appear (checked every 50 ms).
  They come back when going back to Windows: "Bureau Windows" (Windows desktop) in the menu or Ctrl+Shift+D (hidden again on returning to the menu), and "Quitter Cyber Pinball" (Quit Cyber Pinball) (`restoresTaskbarsAt`: only `desktop` and `quit`).
  A handover (menu ↔ wizard, language) passes them to the new process without them showing.
  If Cyber Pinball stops without giving them back (crash, forced stop), a hidden PowerShell started at the first hiding (`taskbarRescueScript`) waits for the process to end, then 8 s, and, if no Cyber Pinball took over and the `<données>\barres-des-taches-masquees` marker is still there, shows the taskbars it lists and removes it.
  Started by hand without this setting, Cyber Pinball hides the taskbars only during games, as before.
  Tests: `coexistence.test.ts`.
- **Wizard at first startup**: it does not offer the dedicated cabinet (off by default, Windows permission needed).
  On a dedicated cabinet, the wizard runs like the menu, and quitting it restarts Cyber Pinball.
- **Installer "at Windows startup" shortcut**: no effect on a dedicated cabinet (the Startup folder is launched by Explorer).
  It is the same one as "Lancer au démarrage de Windows" (Launch at Windows startup) makes (`Cyber Pinball.lnk`); the screen flags it and offers "Retirer le lancement au démarrage" (Remove the launch at startup).
- **Uninstalling**: if `etat.json` or `reglages-windows.json` is still there, the uninstaller warns (without Cyber Pinball, the session could open on a black screen) and only goes on if asked to: it lacks the rights to undo these settings.
