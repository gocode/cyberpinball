[Français](../manuel/eteindre-mettre-en-veille-redemarrer-la-borne.md) · English · [Manual contents](../manual.md)

## Shutting down, sleeping, restarting the cabinet

In the system menu's Quitter ou éteindre (Quit or shut down) section, the last one of the root, after "Bureau Windows" (Windows desktop), "Quitter Cyber Pinball" (Quit Cyber Pinball) and "Redémarrer Cyber Pinball" (Restart Cyber Pinball; all the ways out together, from the lightest to the heaviest): "Mettre en veille" (Sleep), "Redémarrer la borne" (Restart the cabinet), "Éteindre la borne" (Shut down the cabinet).
Each opens a confirmation screen that says what is going to happen; Start confirms (the action is preselected, in green like any current choice: going through the confirmation is caution enough), Exit or "Annuler" (Cancel) returns to the section, with the selection on the entry.
The module is [app/src/power.ts](../../app/src/power.ts); the method, the simulation and the scheduled action are in [packages/core/src/power.ts](../../packages/core/src/power.ts), the sleep call in [packages/win-displays/src/power.ts](../../packages/win-displays/src/power.ts).

- **Restart Cyber Pinball**: closes and reopens the software alone, the PC stays on (after a ROM or a setting changed outside the menu, a screen or a controller plugged back in, a menu that no longer responds well).
  No confirmation, like "Quitter Cyber Pinball" (Quit Cyber Pinball): nothing shuts down.
  It is the covered relaunch of language and configuration changes (`relaunchMenu`, `relaunchCovered` in [app/src/screen-guard.ts](../../app/src/screen-guard.ts)): settings saved, the new process paints its windows before the old one closes, no screen shows the desktop in between, without the startup opening.
  Dedicated cabinet (Cyber Pinball as the Windows shell): the relaunch goes through Shell Launcher, and "Quitter Cyber Pinball" is not offered (see [Dedicated cabinet](dedicated-cabinet.md#dedicated-cabinet)).
- **Shut down, restart**: every screen turns plain black, the playfield only showing "Extinction de la borne…" (Shutting the cabinet down…; no brand, media or gear), then the menu saves its settings (state of the menu media), gives back the taskbars a game may have hidden, then runs `shutdown.exe /s /t 0` (`/r` to restart).
  Its windows and veils stay in place until Windows closes the application, with its own shutdown screen already shown: no screen shows the desktop in between.
  Full shutdown: Windows Fast Startup only applies with `/hybrid`, so the cabinet starts cold, its USB devices (Pinscape, encoders) enumerated again.
  Without `/f` (which `/t 0` does not imply): an open application can save, or hold Windows back; after a minute without a shutdown, the menu says so ("La borne ne s'est pas éteinte", The cabinet did not shut down) and Exit brings it back.
- **Sleep**: the same black screen ("Mise en veille…", Going to sleep…), settings saved, then S3 sleep through `powrprof.dll`'s `SetSuspendState(FALSE, FALSE, FALSE)`, called directly through koffi, on a separate thread.
  Cyber Pinball stays open: on wake, the table menu comes back as it was.
  Never `rundll32 powrprof.dll,SetSuspendState 0,1,0`: rundll32 passes its own arguments (window, instance, command line), the first one, "hibernate", receives a non-null window handle, and the PC hibernates whenever hibernation is enabled, which is the default on Windows 11 and on the cabinet (`powercfg /a`: S3 sleep and hibernation).
  The process's shutdown privilege (`SeShutdownPrivilege`) is enabled before the call.
  Hybrid sleep, if Windows enabled it, is still sleep (memory is also copied to disk).
  A PC with Modern Standby only (S0 low power idle, no S3) does not allow requesting it: `IsPwrSuspendAllowed` says so beforehand, the entry shows "Indisponible : ce PC n'a que la veille moderne" (Not available: this PC only has Modern Standby) and its screen ("Veille indisponible depuis Cyber Pinball", Sleep not available from Cyber Pinball) points to the Windows Start menu, without asking Windows anything.
- **Scheduled action**: `createPowerControl` performs an action right away (`run`) or at a given time (`schedule(action, at)`, cancelled by `cancel()`, listed by `scheduled()`).
  The time is read again at least every minute (sleep suspends timers); an action whose time passed more than five minutes ago (cabinet asleep or off at that time) is missed, not caught up on wake (`onMissed`).
  A scheduled action can wait for the cabinet to be free (`ready`, read every second) until a deadline (`until`), and announce itself with a warning (`notice`) that a button removes.
  Every action, asked from the menu or scheduled, then waits for Windows to shut down (`settle`).
  The menu exposes it through `createPowerMenu(…).control`, for the cabinet schedule's automatic stop (see [Cabinet schedule](game-media.md#cabinet-schedule)).
- **Tests**: nothing ever shuts down.
  The real executor is only built when no test variable at all is set (`powerSimulated`): offscreen, autopilot, captures, endurance, sandbox (`CYBERPINBALL_HOME`), unit tests, even with `CYBERPINBALL_A_L_ECRAN=1`, and on request (`CYBERPINBALL_ALIMENTATION_SIMULEE=1`).
  The action is only logged there ("Alimentation simulée : shutdown.exe /s /t 0"), the black screen stays 2.5 s, then the menu comes back with the notice "Mode essai : extinction simulée, le PC reste allumé" (Test mode: shutdown simulated, the PC stays on; cleared as soon as another confirmation opens).
  `CYBERPINBALL_ALIMENTATION_SANS_VEILLE=1` simulates, in tests only, a PC without S3 sleep.
- **Proofs**: [power.test.ts](../../packages/core/src/test/power.test.ts) pins the invariants (every test simulated, real executor never built in a test, no other path to shutdown in the code: `shutdown.exe`, `SetSuspendState`, `rundll32`, `ExitWindowsEx`, `Stop-Computer`…; methods without `/f` or hibernation; scheduled, missed, cancelled action).
