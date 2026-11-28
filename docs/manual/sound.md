[Français](../manuel/son.md) · English · [Manual contents](../manual.md)

## Sound

VPX 10.8.1 has only two outputs: `[Player] SoundDeviceBG` (backglass: ROM music and voices, AltSound, PuP-Pack, table music) and `[Player] SoundDevice` (playfield: mechanical sounds, mixed according to `Sound3D`).
It identifies them by the output's **Windows name** ("Haut-parleurs (USB Audio Device)", i.e. "Speakers (USB Audio Device)" on an English Windows), compared character for character; a name it cannot find silently sends it to the Windows default output.
This name is localized, can be renamed, and is sometimes shared by two identical cards: as with screens, Cyber Pinball keeps its own fingerprint and rewrites the current name at every synchronization.

**Detection** (`probeAudioOutputs`, `packages/win-displays/src/audio.ts`): active outputs are read from `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{guid}`, read-only and through the Unicode API (`RegGetValueW`), because `reg.exe` mangles accented characters.
For each one: the MMDevice identifier (`{0.0.0.00000000}.{guid}`), the name VPX expects ("DeviceDesc (interface)"), bus, form factor, channels and speaker mask set in Windows, ContainerId, and default output (the active output with the highest `Level:0`, cross-checked against Chromium on the development PC).
An HDMI output is tied to its screen through the ContainerId of the PnP monitor (`ObservedDisplay.containerId`); the container shared by everything built into the PC (`{00000000-0000-0000-FFFF-FFFFFFFFFFFF}`) ties nothing.
`npm run probe` shows all of this.

**The setup wizard's "Son" (Sound) step**, after the screens, or on its own (System menu > My cabinet > Cabinet setup > "Cabinet sound", whose line says "Backbox, playfield, SSF and exciters", `--assistant --son`: only `SoundDevice`, `SoundDeviceBG` and `Sound3D` are written).
Virtual outputs (Steam, Oculus: bus `ROOT`) and Bluetooth outputs are left out, unless they already had a role.

**Suggested setups** (`proposeAudioSetups`, `packages/core/src/audio-setups.ts`; list, drawing and check in `app/src/sound-setups.ts`): before any question, the step looks at what the cabinet has and suggests at most three setups, the safest first, under a sentence saying what it detected ("Detected: Realtek, green jack, black jack plugged in, set to stereo in Windows; speakers of … (backglass).", `describeDetected`).
It takes into account the jacks of the motherboard sound card, the speakers of the backglass and playfield screens, an amplifier connected over HDMI (an HDMI output that belongs to no screen), the channels set in Windows and the settings already saved.

- **Keep the current settings**: first when the saved settings find their outputs again.
- **SSF**: the game's sounds make the cabinet vibrate, two or four exciters on the card ("SSF on the sound card", "SSF with two exciters"); the backglass on the green jack, or on its screen's speakers when nothing is plugged into the card's front jack ("SSF: <screen> + <card>").
- **Stereo**: each screen plays its own sound; the backglass on the card and the playfield on the playfield screen; everything on the card (the exciters then stay silent); or everything on the playfield screen.
- **"None fits: set up step by step"**, always last (Exit leads there too): the output-by-output setup described below.

Jacks are only read on a motherboard card (bus `HDAUDIO`, analog output), whose driver describes each one; front-panel jacks, often a headset, do not count when the rear panel has some.
A jack is only called plugged in when it can sense a cable (Windows tells, jack by jack); a USB card or an HDMI output is checked by ear, never by an assumed jack colour.
The colours are the sound card standard: green for front, black for rear, grey for sides.
SSF comes first ("Try first") when a cable is sensed in the rear or side jack; a card already set to 5.1 or 7.1 in Windows also offers it before stereo, but "to be checked by ear".
A card whose jacks sense nothing, or that is left in stereo, is still offered for SSF, but "to be checked by ear", after the stereo suggestions (third at most, never dropped): a desktop card almost always has rear jacks, rarely exciters.
Each suggestion has its **drawing of the cabinet** seen from above: the backglass, the playfield near the backglass and the playfield near the player ("YOU"), with what should play there ("black jack", a screen's speakers) or "not plugged in".
Tests: [audio-setups.test.ts](../../packages/core/src/test/audio-setups.test.ts).

Start tries the chosen setup.
In stereo, or to keep the settings, the summary follows.
In SSF, a **pair-by-pair check** plays each expected pair, left then right, and asks whether it is heard where the setup expects it ("do you hear it in the backbox, on both sides?", "do they vibrate under the playfield, near you?"); the drawing lights up the current pair and ticks those already checked.
Start: yes; Exit: no sound; a flipper: heard somewhere else, and the pair gets the step-by-step question; Backspace goes back to the previous pair, then to the list.

**Card set to stereo**: an SSF setup whose card reports fewer channels than needed (6 for two exciters, 8 for four) first goes through the **Windows Sound panel**.
The wizard opens it (`mmsys.cpl`, `app/src/sound-panel.ts`) and says what to do (""<card>", Configure, 5.1 Surround, then Next to the end"); it reads the outputs again every 1.5 s and starts the check as soon as Windows reports 5.1 or 7.1.
Start opens the panel again, Exit stays in stereo.
Step by step does the same: when no output reports 6 channels or more and a sound card (or an HDMI amplifier) is in stereo, it asks "Exciters or speakers on the playfield (SSF, surround)?" (`stereoSurroundCandidate`: the output that has a role, then the motherboard card, then the other cards, then the HDMI amplifier; never a screen's speaker).
"Yes, switch to 7.1" opens the panel and starts the speaker test as soon as the card reports it; "No, stereo" keeps stereo.
Offscreen, the panel does not open.

**Two exciters**: SSF in 5.1 sends them the whole playfield sound (VPX 10.8.1 then plays it in stereo on the rear pair); in 7.1, part of each sound would go to the side jack, which is silent.
The wizard therefore recommends 5.1 (the suggestion's badge, the Sound panel instructions, the test's remark), and the summary presents SSF in 5.1 as a setting, not as an error.
Two exciters on the side jack: it recommends plugging them into the rear jack.

**Nothing heard** on the rear or sides of a motherboard card: the summary explains the case of three-jack cards (green, blue, pink): reassign the blue or pink jack in the maker's audio console (Realtek Audio Console), or plug into the front headphone jack.
A cable is sensed in the exciters' jack but nothing vibrated: it rather suggests looking at the exciters' amplifier, switched on and volume up (`pluggedButSilentNotices`).

**Step by step**: each output plays, on itself, a sound generated by an oscillator (no file), n beeps for output n, in a loop: `AudioContext.setSinkId` in a wizard window, the output being found by `enumerateDevices` under its Windows name (Chromium appends "(vid:pid)" to the name of USB outputs, which is ignored for the comparison).
The player answers with the buttons:

| Button | Output played | Speaker test |
| --- | --- | --- |
| Left flipper | backglass | playfield, near the player |
| Right flipper | playfield | playfield, backglass side |
| Start | both (SSF with a single card) | in the backglass |
| Exit | no role, next output | nothing heard |
| Backspace | previous output | previous pair |

The backglass screen's speaker is offered by default for the backglass, and a card set to 7.1 (failing that, the playfield screen's speaker) for the playfield; these outputs are played first, and the screen whose output is the speaker lights up.
Running the wizard again starts from the saved outputs.
If the playfield output reports 6 or 8 channels, each speaker pair (front, rear, side) beeps on the left, then at a higher pitch on the right (`ChannelMergerNode`, discrete channels in the order of the Windows mask, like SDL), and the player says where they hear it.
The answers choose the mix (`playfieldModeFromTest`, `packages/core/src/audio.ts`): front in the backglass and another pair on the playfield gives SSF; front and another pair on the playfield gives surround, in the direction heard; otherwise stereo.
Rear / side wiring that is swapped for SSF is flagged.
The summary shows the chosen outputs and the `Sound3D` value that will be written.

Permissions: Chromium only gives output names, and only allows `setSinkId`, with the `media` or `speaker-selection` permission; the wizard grants these two to its windows (`setPermissionCheckHandler`) and allows playback without a user gesture (`autoplayPolicy`), since the buttons go through the main process.
If the output is not found, or if Chromium opens fewer channels than reported, the screen says so and the player can still answer.

Model (`cabinet.json`, `audio` field): outputs stored by `endpointId`, with the `containerId` as a fallback (for a driver that recreates a screen's HDMI output) and the fingerprint of the screen whose speaker it is; `roles` (backglass, playfield, possibly the same output); `playfieldMode` (`stereo`, `surround`, `ssf`) and `lockbarPair` in surround.
At each synchronization, outputs are found again by identifier, then by ContainerId if there is no ambiguity, never by name.

Keys written to `VPinballX.ini` (`vpxAudioSettings`), managed like the others (a value changed by hand is never silently overwritten):

| Key | Value |
| --- | --- |
| `[Player] SoundDeviceBG` | current name of the backglass output; empty if none (Windows default output) |
| `[Player] SoundDevice` | current name of the playfield output; empty if none |
| `[Player] Sound3D` | stereo: 0, or 1 on a 7.1 output (mode 0 cancels the gains there); surround: 3 (front on the lockbar side) or 2 (rear on the lockbar side); SSF: 5 |

A model without a "Son" (Sound) step (saved before that step existed, or with no output to offer) writes none of these keys, and the settings screen leaves them editable.
Points to check, reported by the synchronization and the wizard: output not found (the key stays as it is, VPX will play on the default output), two active outputs with the same name (VPX takes the last one), a `Sound3D` too ambitious for the channels set in Windows (surround with fewer than 4 channels, SSF with fewer than 6: VPX falls back to stereo; set the output to 5.1 or 7.1 in the Sound control panel).
SSF in 5.1 is reported as plain information: perfect for two exciters; four need 7.1.
Cyber Pinball never changes the Windows default output or an output's format by itself (for 5.1 or 7.1, it opens the Sound panel and the player makes the change); only the cabinet's volume buttons set the Windows volume (see [Cabinet volume](#cabinet-volume)).
Volumes (`MusicVolume`, `SoundVolume`) remain player settings.

To be confirmed on a real cabinet: how `Sound3D` modes 2, 3 and 5 actually sound, the expected direction of the rear and side pairs in SSF (Pinscape guide: rear on the player's side), the channels Chromium actually opens on a 7.1 card, the ContainerId of an HDMI output after a port change, and the disappearance of a screen's HDMI output when the screen is in standby.

### Cabinet volume

The **Volume −**, **Volume +** and **Mute** buttons (optional, "Boutons" step) set the sound of **the whole cabinet**: the Windows volume, the one in the taskbar, hence everything that plays (VPX, PinMAME, PuP-Pack, B2S, the Cyber Pinball menu), in the menu as well as during a game.

- **Volume +**: 5% louder, on the 5% grid (16% goes to 20%); muted sound comes back first, as with the Windows keys.
- **Volume −**: 5% quieter.
  **Held for one second** (`MUTE_HOLD_MS`), it mutes the sound, or restores it if it was muted; the level from before the press is the level of the restored sound.
- **Mute**: mutes or restores the sound.
  No encoder sends it by default: it has no default key and only exists once captured.
- One step per press, no repeat: holding Volume − is how you mute.
- **Outputs set**: those of the "Son" (Sound) step roles (backglass, playfield; two cards in SSF), each by the same step as the backglass output, keeping their gap, bounded from 0 to 100%; without the "Son" step, the Windows default output (`volumeOutputIds`).
  An unplugged output is skipped.
- **Badge**: in the middle of the top of the playfield, turned toward the player (`gameNoticeBounds`, `top-center` corner), the icon, "Volume" and the level with its bar; when muted, "Son coupé" (Sound muted) and how to restore it.
  It stays 1.6 s after the last press, 4 s when muted, and reminds you when you come back from a game.
  It is the in-game notification window (`overlay`, `app/src/game-notice.ts`): transparent, never focused, clicked through, absent from captures and recordings; it takes control away from neither VPX nor the menu.
- **Reading the buttons** (`app/src/cabinet-volume.ts`): polled every 25 ms, whatever window is in the foreground, keyboard keys through `GetAsyncKeyState` (`keysDown`), joystick buttons through SDL (`watchJoystickButtons`), like the in-game settings combination.
  A button captured on a keyboard media key (`AudioVolumeUp`, `AudioVolumeDown`, `AudioVolumeMute`) is left to Windows, which already sets the sound when it is pressed; the badge shows the result.
- **Windows volume** (`readEndpointVolumes`, `writeEndpointVolumes`, `packages/win-displays/src/system-volume.ts`): Core Audio, `IMMDeviceEnumerator` then `IAudioEndpointVolume` (`GetMasterVolumeLevelScalar`, `SetMasterVolumeLevelScalar`, `GetMute`, `SetMute`) called through their method table with koffi; outputs are designated by their MMDevice identifier, the one from the "Son" step.
- **`[Input]`**: `Mapping.VolumeDown` and `Mapping.VolumeUp` no longer have a key (`Key;0`), with or without a capture, and a joystick button written there before is removed (`vpxVolumeSettings`); otherwise `-` and `=` would also set VPX, which would show a different volume.
  A controller added by hand in F12 > "Input Settings" stays.
- **Offscreen** (unattended tests), the Windows volume is never touched: a simulated volume, and presses arrive through the menu windows (the autopilot's `hold:` and `release:` steps).
  Captures: `volume-borne-niveau.png`, `volume-borne-coupe.png`.
  Tests: [cabinetvolume.test.ts](../../packages/core/src/test/cabinetvolume.test.ts).

**Volume on the phone.**
A speaker button in the remote's top bar sets the cabinet's sound: in the menu, during a game, in the Juke-box and in applications opened on the cabinet.
It opens a slider with the current level: Volume −, Volume + (keep your finger down to go faster) and Mute, like the cabinet's volume buttons, whose badge shows on the playfield at each press.
An Android's Back button folds the slider away.
The phone's own volume keys still set its own sound: a web page cannot capture them, hence these on-screen buttons.
The cabinet volume also sets the sound of Edge and of applications opened on the cabinet: by the same step it follows Windows' default output (where Edge plays) and any output where a program plays, in addition to the outputs chosen in the "Sound" step; before, a volume bar and a Mute could stay without effect.
The slider says why the sound does not move (Windows does not answer, no audio output, or a setting not taken by an output) instead of staying silent.

### Night mode

To play without disturbing anyone, night mode lowers in one go what you choose, line by line: a black veil on the menu's screens, the sound (a percentage of Windows' volume, 0% for mute), the LEDs' brightness or switch-off, and toys cut (solenoids, shaker…).
**Settings**: System menu > My cabinet > "Configuration de la borne" (Cabinet configuration) > "Mode nuit" (Night mode) (line after the sound): screens, sound, LEDs, toys, schedule.
It turns on from the settings, from an optional interface button, or, as you choose, at night on the cabinet's schedule (optional link); turned off during the night, the schedule does not turn it back on before the next night.
The button is captured in the "Interface buttons" step, in addition to the advanced button of the game buttons (collapsed "Advanced buttons" section of the summary, empty by default): one press turns it on or removes it, in the menu as in a game.
The black veil also applies on the wheel and in the menus (not just in attract mode), never during a game.
On deactivation, the previous volume comes back, except for an output you adjusted with the buttons in the meantime.
During a game, toys and LEDs follow too, through a variant of `Cabinet.xml` placed for the length of the game (restore log: a crash is repaired at the next start).
This only applies if the DOF configuration is the one Cyber Pinball wrote; a hand-made configuration is never touched, and the settings screen says why the option has no effect.

### VR audio output

The "VR audio output" setting (System menu > My cabinet > Virtual reality and 3D vision, detailed in [Launching a game](launching-a-game.md)) chooses where the sound goes in the headset: Automatic, The cabinet, or any Windows audio output (useful for a headset, such as a Pimax, whose audio device is not recognised).
When no headset output is recognised, the log lists the Windows audio outputs it saw.

**Audio preview** of a card on the tables screen: it stops when a game starts, instead of carrying on over the table's music.

### Game volume

A ROM too quiet next to the table's mechanical sounds (Medieval Madness on a PinCab, 11/12/2026) is fixed neither by the cabinet volume, which raises everything, nor by PinMAME: its `volume` setting (`HKCU\Software\Freeware\Visual PinMame\<rom>`) is an attenuation, already at 0, its maximum.
The volume belongs to the machine itself: on a WPC, a Stern or a Data East, the ROM keeps it in its NVRAM, and it is set as on the real machine, coin door open, with its − and + buttons.

- **Buttons** (optional, "Boutons" (Buttons) step): "Porte du monnayeur" (Coin door, End by default), "Porte : bouton −" (Door: − button, 8) and "Porte : bouton +" (Door: + button, 9).
  Any free cabinet button, joystick or keyboard, can hold each of them; a mapping made before them shows them in the summary, where that single button is redone.
- **Path to the ROM**: VPX's `CoinDoor`, `Service2` and `Service3` actions reach the table script as `keyCoinDoor`, `keyDown` and `keyUp` (`scripts/VPMKeys.vbs`), which `vpmKeyDown` (`WPC.vbs`…) hands to the door switches.
  The door toggles on each press (`toggleKeyCoinDoor`).
- **During a game**: door, then − or + as many times as needed (the ROM shows the volume on the DMD), then door to close it.
  The setting stays for that table, in its NVRAM, and Cyber Pinball keeps it as the player's choice (see [ROM volume](#rom-volume)).
- **Limits**: older machines (System 11, Gottlieb, early solid state) often have a potentiometer on the sound board and no volume in the ROM; the − and + buttons set nothing there.
  The service menu's Escape and Enter buttons (7 and 0, `Service1` and `Service4`) keep their VPX keys, with no button to map.
- Tests: [buttons.test.ts](../../packages/core/src/test/buttons.test.ts) ("porte du monnayeur et ses boutons − et +").

### ROM volume

Williams WPC machines and some Stern SAM machines keep their main volume in the ROM's memory (NVRAM, `<pinmame>\nvram\<rom>.nv`), not in VPX.
With no memory, the ROM sets its factory volume at start-up: 12 of 31 on WPC, quiet next to the table's sounds (Monster Bash almost silent, 11/17/2026), 40 of 63 on Stern SAM.
Changing it took the coin-door gesture during a game (above), which nobody knows.
Cyber Pinball reads this volume, shows it on the table's page, sets it outside a game in "Réglages de cette table" (Settings for this table), and raises a low factory volume to the recommended volume on its own just before the game.
Code: [romvolume.ts](../../packages/core/src/romvolume.ts) (state, advice, player's choice), [romscores.ts](../../packages/core/src/romscores.ts) (reading and writing the memory), [app/src/rom-volume.ts](../../app/src/rom-volume.ts) (before and after the game), [app/src/settings.ts](../../app/src/settings.ts) (setting).

- **Where the volume is** (`romMasterVolume`): the ROM's memory map (Pinball Memory Maps, the same as for balls per game and high scores, read from the `<données>\cache\cartes-memoire` cache, offline) locates `game_state.volume` ("Volume", "Master Volume").
  It is only used if it can be read and written safely: one whole byte, a range, a single NVRAM area, described checksums.
  Otherwise (Whitestar, Data East, System 11…), the machine does not keep its volume in a memory Cyber Pinball can read.
- **Which memory** (`tablePinmameDir`, `romVolumeStatus`): `<table>\pinmame\nvram` when the table has its ROMs next to it, otherwise the shared PinMAME folder; the first ROM PinMAME loads (aliases included) whose map locates the volume.
- **What the ROM will play** (`readRomVolume`): the stored value; with no memory (the ROM creates it during its first game), a blank block, a wrong checksum or an out-of-range value, its factory volume.
  Factory volume: the map's (Stern SAM), otherwise 12 for a WPC (`WPC_FACTORY_VOLUME`, measured on the libpinmame bench with The Addams Family and Monster Bash).
- **Low and recommended** (`romVolumeAdvice`), from the ROM's range, never from a cabinet: low below half the range, recommended at three quarters.
  WPC: low below 16, recommended 23 of 31; Stern SAM: low below 32, recommended 47 of 63 (their factory volume, 40, is not low).
- **Writing** (`writeRomVolume`, `setRomVolume`): always outside a game, on the memory read again just before (high scores may have been written since); the byte and its mirror copies set, each checksum covering them redone, the result read back, then written in one go (`writeFileAtomic`).
  Refused, with its reason, when it is not safe: value out of range, byte no checksum covers, or a block mixing the volume with other settings whose checksum is already wrong (redoing it would validate bytes the ROM rejected).
  A block holding only the volume (WPC, SAM) is always redone: blank, it becomes valid.
- **Before the game** (`beforeGame`): the wanted volume is set, if it is not already; the player's choice, otherwise, when automatic, the recommended volume instead of a low factory volume.
  With no memory, nothing is written: the ROM creates it during the first game, at the factory volume, and Cyber Pinball raises that low volume as soon as the game ends.
  Never in the double of a game between friends (its volume is already the cabinet's, see [Community: the cabinet network](friends-the-cabinet-network.md#community-the-cabinet-network)), nor for "Régler l'affichage en partie" (Adjust the display during a game).
  Log: "Volume de la ROM (…, taf_l7) : 12 → 23 sur 31 avant la partie (volume d'usine bas, conseillé)." ("usine → 23" for a blank block).
- **After the game** (`afterGame`, `romVolumeChangedInGame`): a volume changed at the coin door during the game becomes the player's choice, kept afterwards (log: "… réglé à la porte pendant la partie, gardé."); a volume still at the factory value after a first game is not a choice.
  The player's choices are in `<données>\volumes-rom.json`, per `.nv` file.
- **Low volume set elsewhere**: a low volume that is neither the factory one nor chosen in Cyber Pinball (set in another front-end, or at the door before Cyber Pinball) is never changed on its own: it may be wanted.
  The diagnosis flags it: finding "Volume de la ROM bas" (Low ROM volume) (`lowRomVolume`, `romVolumeFinding`), To check in the table's diagnosis and in the "Tables" line of [Cabinet health](cabinet-health.md#cabinet-health), with the fix "Monter le volume de la ROM à 23 sur 31" (Raise the ROM volume to 23 of 31) (`romVolume` operation of `applyOps`: the memory read again at write time, the old one to the recycle bin).
- **Table's page** ("Volume de la ROM" (ROM volume) line of its files summary, `romVolumeLine`): "12 sur 31, d'usine, faible : monté à 23 avant la partie" (12 of 31, factory, low: raised to 23 before the game), "d'usine, 12 sur 31 (faible) : monté à 23 dès la fin de la première partie" (factory, 12 of 31 (low): raised to 23 as soon as the first game ends), "18 sur 31 (votre réglage)" (18 of 31 (your setting)), "… : remis à … (votre réglage) avant la partie" (…: set back to … (your setting) before the game), or "10 sur 31 : bas" (10 of 31: low), in orange, with "volume de la ROM bas" (ROM volume low) in the "À vérifier" (To check) line.
  A table whose ROM does not keep its volume has no such line.
- **"Réglages de cette table" (Settings for this table) > Son (Sound)**: a "Volume de la ROM" (ROM volume) line, after VPX's volumes, for every table that plays a ROM.
  Start opens the list: "Automatique : 23 si le volume d'usine est bas" (Automatic: 23 if the factory volume is low) (recommended), then each value of the range ("12 sur 31"…), marked "d'usine" (factory), "conseillé" (recommended) or "bas" (low).
  The choice is written to the memory at once; with no memory yet, it is remembered and set when the first game ends.
  "Valeur par défaut" (Default value) (Del) goes back to automatic.
  Badge: "Réglé pour cette table" (Set for this table), "Monté à 23 avant la partie" (Raised to 23 before the game: a low factory volume Cyber Pinball raises on its own), "Bas" (Low) or "Automatique" (Automatic).
  The details give the value used, the table's setting, the range, the factory volume, the recommended one, the memory file ("créée à la première partie", created during the first game, if missing) and the door gesture with the cabinet's keys.
- **Machine that does not keep its volume in memory** (or map not known yet, PinMAME folder not found): the line says "Réglé à la machine" (Set on the machine), read-only; Start says why Cyber Pinball cannot set it and recalls the gesture with the cabinet's keys ("pendant la partie, ouvrir la porte du monnayeur (Fin), puis − (8) ou + (9)", during the game, open the coin door (End), then − (8) or + (9), `romVolumeGesture`).
  Without these buttons mapped, it recalls that VPX's volume ("Volume du backglass", Backglass volume) also raises the ROM's music and voices.
- Tests: [volume-des-rom.test.ts](../../packages/core/src/test/volume-des-rom.test.ts), on real memories measured on the libpinmame bench (WPC, Stern SAM, Data East), and the `lowRomVolume` trap in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).

### Music and sound of a table

A table can play silent without saying anything on screen: VPX silently skips music it cannot find, and a setting specific to the table can mute its sound.
After every game, the cabinet log says which sound outputs VPX opened, which ones it did not find and the music it did not find ("Son de la partie (…)" (Sound of the game), see "Sound, DMD and script errors in the cabinet log" in [Launching a game](launching-a-game.md#launching-a-game)).

- **Sound muted for this table** (`tableAudioMuted`, `mutedAudioSettings`): the table's own `.ini` sets to 0, in `[Player]`, the backglass volume (`MusicVolume`: the music and the sounds played on the backglass), the playfield volume (`SoundVolume`), or the old `PlayMusic` and `PlaySound` switches; it is often a `.ini` brought over from another installation.
  The table's diagnosis reports it as a warning ("Son coupé pour cette table" (Sound muted for this table): "….ini règle MusicVolume à 0 pour cette table seulement : elle se joue sans ce son." (….ini sets MusicVolume to 0 for this table only: it plays without that sound.)), with "Rendre le son à cette table" (Give this table its sound back).
  The fix removes those keys only, and moves the `.ini` to the recycle bin if it held nothing else: the table then follows the general setting.
- **Music not found** (`musicMissing`): VPX looks for the music the script plays (`PlayMusic`) in the table's `music` folder, then in VPX's, and writes "Failed to stream music: …" to `vpinball.log` when it does not find it.
  The diagnosis reads the table's last game in that log and reports it as a warning: "Musique introuvable" (Music not found) ("À la dernière partie, VPX n'a pas trouvé « … » : il cherche la musique de la table dans « …\music »." (In the last game, VPX did not find "…": it looks for the table's music in "…\music".)), with the reminder that it ships with the original table, to be put in the import folder before "Ajouter une table" (Add a table).
  The finding goes away after a game where VPX finds the music.
- **Music read in the script**: Cyber Pinball recognises the music the script plays, whether its name is written plainly (`PlayMusic "Akira\track.mp3"`), held by a variable (`PlayMusic MusicDir & "theme.mp3"`, with `MusicDir = "Goldorak\"`) or passed to a script procedure that plays it (`Sub PlaySong(s) : PlayMusic s : End Sub`, then `PlaySong "theme.mp3"`).
  A name that cannot be read in full in the text is never guessed.
  When tables are brought over from another installation, that music follows the table; if it is neither in the installation's Music folder nor in the table's, the import screen says it is missing ("absent de l'installation : musique « … »" (missing from the installation: music "…")).
- **Music carried by the PuP-Pack**: a table whose music goes through its PuP-Pack (a playlist named "Music", "Audio", "Sound"…) is silent as long as that playlist is empty.
  The diagnosis then reports "Playlist du PuP-Pack vide" (Empty PuP-Pack playlist) as a warning, no longer as mere information: "La musique de la table passe par ce pack (« Music ») : sans elle, la table est muette." (The table's music goes through this pack ("Music"): without it, the table is silent.), with the advice to bring the pack over in full, its videos and music often being a separate download (see [PuP-Packs](pup-packs.md#pup-packs)).
- Tests: [son-et-dmd.test.ts](../../packages/core/src/test/son-et-dmd.test.ts) (log, findings, music named through a variable or a procedure) and the `tableAudioMuted` and `musicMissing` traps in [doctor-traps.test.ts](../../packages/core/src/test/doctor-traps.test.ts).
