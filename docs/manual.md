English · [Français](manuel.md)

# Cyber Pinball: technical manual

Complete reference of the prototype, in English (the French version, [manuel.md](manuel.md), is the reference): how each part works, the files it writes, commands, unattended tests and known limitations.
Project overview: [README.md](../README.md) (in French: [README.fr.md](../README.fr.md)).

Open-source frontend for virtual pinball cabinets.
The idea: you describe the cabinet once, and Cyber Pinball writes and maintains the configuration of every component (VPX, then B2S, PinUP, DMD, DOF).
No more editing an `.ini` by hand.

**Status: prototype of milestones 1 and 2.**
- **Screens**: EDID detection, a setup wizard driven by the cabinet buttons (roles, flipper edge, playfield diagonal), generation of `VPinballX.ini` with automatic table framing, corrected automatically when Windows renumbers or moves the screens.
- **Cabinet configurations**: several screen sets for one installation (two machines, a desktop PC and a cabinet), each with its own roles, sound, buttons and `VPinballX.ini`; the one that is plugged in is recognized automatically at startup, before each game and by the `sync` command (see [Cabinet configurations](manual/cabinet-configurations.md#cabinet-configurations)).
- **Sound**: a wizard step that plays a sound on each audio output and has you pick the backglass output and the playfield output, then tests the speakers of a 5.1 or 7.1 sound card; `SoundDeviceBG`, `SoundDevice` and `Sound3D` are rewritten at every startup with the current names of the outputs (see [Sound](manual/sound.md#sound)).
- **Table menu**: one window per cabinet screen, VPX launched with `-Play`, a loading screen (on a cabinet, the loading media alone, full screen; on a desktop, with the game controls), return to the menu with the foreground taken back, statistics in each table's `.info` file, VPX errors reported in plain language.
  With the playfield screen lying flat and rotated while Windows stays in landscape, the menu, the details screen, table management and the settings rotate for a player standing at the flipper edge (`playfield.flipperEdge` in the cabinet model, mapped to the screen's current orientation), in portrait at 90° and 270°; the backglass, DMD and topper do not rotate.
- **Full-screen windows**: each window (menu, details screen, settings, wizard) covers its whole screen, Windows taskbar included, with no border line: Electron full screen (`coverDisplay`, `app/src/cover-display.ts`), without forcing the foreground.
  VPX comes to the front during a game, and the Windows key or Alt+Tab bring back the desktop and the taskbar.
  System menu > "Borne" (Cabinet) > "Bureau Windows" (Windows desktop), or Ctrl+Shift+D from the menu, frees every screen of the PC, however many there are (desktop mode, see the screen guard); Ctrl+Shift+D again, the Cyber Pinball button in the taskbar or Alt+Tab reopens the menu on all its screens.
  A cabinet button can also lead there directly: interface buttons > "Bureau Windows" (Windows desktop) (see [Cabinet buttons](manual/cabinet-buttons.md#cabinet-buttons)).
- **No screen ever shows the Windows desktop** (screen guard, `app/src/screen-guard.ts`), from startup to the end of a game: one black cover per screen, opened before any other window and never in the foreground; the menu windows stay behind VPX during loading and play; the menu ↔ wizard restart hands over without a gap; the taskbars are hidden during a game.
  **Never a light screen** either: without a Windows system backdrop, a window stays transparent until its first frame, and only goes full screen once shown.
  A screen that stays uncovered for more than one second is reported in the console (see [Launching a game](manual/launching-a-game.md#launching-a-game)).

The manual is split into one section per file ([manual](manual/) folder), one sentence per line: two changes in two sections, or in two sentences, do not get in each other's way when merging.
A new section gets its heading below, in its place, and its translation in [manuel.md](manuel.md); `node scripts/decoupage.mjs --phrases <file>` puts one sentence per line back, `npm test` checks it.

## [Getting started](manual/getting-started.md)
## [Installation and file layout](manual/installation-and-file-layout.md)
## [VPS database](manual/vps-database.md)
## [Adding a table: the funnel, the catalog, "Récupérer", waiting list](manual/adding-a-table-the-funnel-the-catalog-recuperer.md)
## [Download manager](manual/download-manager.md)
## [Tables menu notifications](manual/tables-menu-notifications.md)
## [Recent activity](manual/recent-activity.md)
## [What's new](manual/whats-new.md)
## [Downloads and file picker](manual/downloads-and-file-picker.md)
## [What's missing to play: guided path](manual/what-s-missing-to-play-guided-path.md)
## [Game page: its files](manual/game-page-its-files.md)
## [Game parts](manual/game-parts.md)
## [Pinball FX tables](manual/pinball-fx-tables.md)
## [Never stuck: the web from every adding screen](manual/never-stuck-the-web-from-every-adding-screen.md)
## [The phone as a remote for the built-in browser](manual/the-phone-as-a-remote-for-the-built-in-browser.md)
## [The phone as a remote for the menu](manual/the-phone-as-a-remote-for-the-menu.md)
## [Kept phone](manual/kept-phone.md)
## [Direct access to menus from the phone](manual/direct-access-to-menus-from-the-phone.md)
## [Rankings on the phone](manual/rankings-on-the-phone.md)
## [Juke-box on the phone](manual/juke-box-on-the-phone.md)
## [Community on the phone](manual/community-on-the-phone.md)
## [ROM library](manual/rom-library.md)
## [PuP-Packs](manual/pup-packs.md)
## [PuP-Pack disabled, table by table](manual/pup-pack-disabled-table-by-table.md)
## [Structure](manual/structure.md)
## [VPX settings](manual/vpx-settings.md)
## [System menu: five sections](manual/system-menu-five-sections.md)
## [Cabinet health](manual/cabinet-health.md)
## [Tech sheet](manual/tech-sheet.md)
## [Feedback and ideas](manual/feedback-and-ideas.md)
## [Shutting down, sleeping, restarting the cabinet](manual/shutting-down-sleeping-restarting-the-cabinet.md)
## [Guest mode](manual/guest-mode.md)
## [Backups](manual/backups.md)
## [Friends: the cabinet network](manual/friends-the-cabinet-network.md)
## [Levels and badges](manual/levels-and-badges.md)
## [Setup wizard and configuration menu](manual/setup-wizard-and-configuration-menu.md)
## [Terms of use](manual/terms-of-use.md)
## [Community credits](manual/community-credits.md)
## [Interface language](manual/interface-language.md)
## [Menu icons](manual/menu-icons.md)
## [Cabinet buttons](manual/cabinet-buttons.md)
## [Analog plunger and accelerometer](manual/analog-plunger-and-accelerometer.md)
## [Tilt](manual/tilt.md)
## [Cabinet configurations](manual/cabinet-configurations.md)
## [Table orientation and framing](manual/table-orientation-and-framing.md)
## [Sound](manual/sound.md)
## [VPX plugins: backglass, PuP and DMD](manual/vpx-plugins-backglass-pup-and-dmd.md)
## [LED and feedback (DOF)](manual/led-and-feedback-dof.md)
## [Game media](manual/game-media.md)
## [Launching a game](manual/launching-a-game.md)
## [Coexisting with another cabinet frontend](manual/coexisting-with-another-cabinet-frontend.md)
## [Dedicated cabinet](manual/dedicated-cabinet.md)
## [Relaunch with Start](manual/relaunch-with-start.md)
## [Unattended end-to-end tests](manual/unattended-end-to-end-tests.md)
## [Known limitations of the prototype](manual/known-limitations-of-the-prototype.md)
