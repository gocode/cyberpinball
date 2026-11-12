English · [Français](fonctionnalites.md)

# Cyber Pinball: every feature

The [README](../README.md) introduces Cyber Pinball in a few pictures. This page lists everything it does, section by section, as you find it on the cabinet. For the inner workings (files written, commands, tests), see the [technical manual](manual.md).

<p align="center"><img src="images/en/cabinet.webp?v=509ed89f07" width="900" alt="The table menu on a four-screen cabinet: the playfield screen, shown upright, with the selected table's playfield, the wheel of round table medallions and the button hints; next to it the topper and the backglass of the same game, Neon Abyss, and the menu's animated DMD."></p>

<p align="center"><sub>Tables shown are fictional.</sub></p>

## Contents

- [Play with friends](#play-with-friends)
- [Leaderboards](#leaderboards)
- [Install and update](#install-and-update)
- [Set up the cabinet](#set-up-the-cabinet)
- [The table menu](#the-table-menu)
- [Jukebox](#jukebox)
- [Everything from the buttons](#everything-from-the-buttons)
- [The phone as a remote](#the-phone-as-a-remote)
- [Add tables](#add-tables)
- [A table's page](#a-tables-page)
- [ROMs, PuP-Packs, backglass and DMD](#roms-pup-packs-backglass-and-dmd)
- [VPX settings and in-game settings](#vpx-settings-and-in-game-settings)
- [Game media](#game-media)
- [During a game](#during-a-game)
- [Virtual reality and 3D vision](#virtual-reality-and-3d-vision)
- [A cabinet that looks after itself](#a-cabinet-that-looks-after-itself)
- [Current limitations](#current-limitations)

## Play with friends

Cabinets link directly to each other, over the Internet or the local network, with no server and no account. Everything is in System menu > "Friends".

<p align="center"><img src="images/en/live-game.webp?v=1db3208de7" width="760" alt="A live game between cabinets: Bruno's invitation for Atlas Rising opens by itself, then the shared start, a countdown with both players ready."></p>

### Find your friends and see who's online

- **"Find a player"**: search by name (accents and case ignored) or by the ID shown on the player's page, with "Nearby (local network)" and "Recently seen" sections.
- **A directory with no server**: cabinets pass profiles to each other (up to 200 per connection, signed). A profile not seen for 60 days drops out.
- **The local network works even without the Internet**: a neighbouring cabinet is "Nearby" as long as its beacon is less than a minute old.
- **Friend requests**: sent at once, or at the other cabinet's next connection. A request made on both sides makes you friends straight away; a refusal is remembered for 30 days. "Block" cuts every link with a cabinet.
- **"My friends"**: online then offline, the table each one is playing right now, their latest event ("New high score on …", "Badge earned: …"), and when they were last seen.
- **Stable presence**: a friend stays online as long as a link joins you (15 s of grace when it drops). The list says whether it is settled: "Looking for friends…", "Updating…", then "List up to date: 1 friend online". A friend's page says how you are linked (Internet, local network).
- **A badge on the table menu**: the number of friends online; a click opens "My friends".
- **"My badges"**: eight badges (First game, Ten tables, A hundred games, An hour on one table, Ten hours of play, On the high-score board, Grand Champion, Five-time champion).
- **A name of your own**: 2 to 24 characters, shown alone, with the avatar. Two players with the same name are told apart by the unique ID on their page. On first start, right after the screens wizard, Cyber Pinball offers to choose your nickname and avatar; nothing is required, and everything can be changed later.
- **"My avatar"**: a photo or a picture of your own, taken from the PC or in the built-in browser, cropped with the cabinet buttons (zoom, move, recentre) or the mouse. A photo loses its metadata, GPS position included. Without an avatar, your initials on a hue of your own. Only your friends and the players of a pending request receive it, and the players who see your scores in the leaderboards.

<p align="center"><img src="images/en/friends.webp?v=9353564220" width="760" alt="My friends: Bruno online, playing Star Courier with his new high score, and Émile offline; next to it, Bruno's page with his latest events and See their library."></p>

<p align="center">
  <img src="images/en/features/friends-section.webp?v=e5c1ff7c24" width="300" alt="The Friends section: Messages, My friends, My avatar, My public profile, Game history, Find a player, Friend requests, My badges, Sharing and network, Friends' scores during the game, Hide notifications during games.">
  <img src="images/en/features/badges.webp?v=b6caa8b6b3" width="300" alt="My badges, 4 of 8: First game, A hundred games, An hour on one table and Ten hours of play earned; Ten tables, On the high-score board, Grand Champion and Five-time champion still to earn.">
</p>

### Invite and play live

- **Two ways to invite**: "Invite to a live game" on a friend's page, or "Play with a friend" on a table's page, right under "Play". An invitation that can't be sent stays visible, greyed out with its reason ("Offline", "No friend online right now").
- **Up to four cabinets** in the lobby; guests don't need to be friends with each other.
- **Choosing the table** puts first the ones everyone has in the same version. The others stay visible, greyed out with who is blocking ("Another version at Bruno's", "Bruno doesn't have this table"); Start opens their version in their library, ready to fetch.
- **The invitation opens by itself** on the friend's cabinet, with a chime, and lasts two minutes. Even during a game, a discreet card in the corner of the playfield shows it without getting in the way.
- **The same table for everyone**: same `.vpx` file, same script. A table named differently on the friend's cabinet is recognised by its file.
- **The host's settings** (balls per game, ball save, tilt…) are sent to every guest and applied to their game. A different number of balls still lets you play, but outside the ranking, and the invitation says so before you accept.
- **A shared start**: each cabinet waits until everyone's table has loaded. A card in the middle of the playfield says who you are waiting for ("Waiting: Bruno — Loading the table…"), then "Go!" shows everywhere. A latecomer doesn't hold the others back for more than 90 s.
- **Your table stays untouched**: the game runs on a copy of the table, made just before and deleted afterwards. The ROM memory, your high scores and your settings don't move.
- **The results** rank the players with their score and play time, fill in as the others come back, and offer "Play again with the same players" or "Another table, same players".

### During the game

- **Automatic start and finish** on the original tables of the common core and on Williams WPC and Stern SAM ROM tables: a credit then Start on "Go!", the end of the game read from the table, VPX closed on its own, the results opened.
- **A live score strip**: each player's score and ball, the leader first. It goes on the backglass (even when the backglass or the PuP-Pack uses it, discreet, at the bottom), otherwise the topper, otherwise the bottom of the playfield. It never hides the ball.
- **Scores on the DMD** during quiet moments, only when it shows the table's score screen; setting "Scores on the DMD", on by default.
- **Setting "Friends' scores during the game"**: Automatic, On the backglass, On the topper, At the bottom of the playfield, On the side of the playfield. A place your cabinet can't offer is greyed out with its reason.
- **One-line notifications**, at the top of the playfield and over VPX, without taking control from it: a friend coming online, an invitation, a guest accepting or declining (with the reason), a finished game with the winner and your place. Each has its own little sound. "Hide notifications during games" keeps them for when you are back at the menu.
- **"Recent activity" to read back what you missed**, at the top of the system menu: every notification in full, by day, the time, repeats grouped ("Chloé: 3 sign-ins"), and Start does what it announces (the friend's page, the invitation while it holds, the results, the downloads, the update). What no longer holds stays, greyed with its reason ("Invitation expired"). Unread is marked there without a red dot (everything that waits has its own where you answer it); the last 50 kept from one start to the next.
- **A table with no live reading** is labelled "Manual start, no live score", with the reason: its score counts if it makes the table's high-score board.
- **A cabinet still on an old version** is flagged in the lobby, the invitation and the strip, instead of looking broken.

<p align="center"><img src="images/en/live-scores.webp?v=29773bd3be" width="760" alt="A game with friends on Atlas Rising: at the bottom of the backglass, the Game with friends strip shows Bruno's and Alexis's scores live, and the DMD shows the same scores in glowing dots."></p>

<p align="center"><img src="images/en/friends-notifications.webp?v=3ed1612d4f" width="760" alt="Two moments of a game: a discreet line at the top of the playfield says Bruno just came online, then his invitation card with the time left to answer."></p>

<p align="center"><img src="images/en/features/live-scores-setting.webp?v=73afcfa0ab" width="360" alt="Friends' scores during the game: Automatic selected, On the backglass, On the topper, At the bottom of the playfield, On the side of the playfield, and Scores on the DMD."></p>

### Group high scores and history

- **A high-score board per table version**, twenty places: the lobby shows the score to beat, the results the top five, and during the game the machine displays the group's high scores instead of yours. ROM tables too: their board is written into the ROM memory of the copy.
- **The knocker** only fires when the group's record falls.
- **"Game history"**: every finished live game, by day, with the table, the time, the players, their rank and score; a star marks the games you won. The details give the table version, the number of balls, the host, each player's play time and why a score was unranked.

### Messaging

- **Between friends, with no server**: System menu > Friends > "Messages", or "Write" on a friend's page. Messages go straight from one cabinet to the other, encrypted, and stay on both cabinets.
- **A thread like on a phone**: the friend's messages on the left, yours on the right, and in between the friendship's events (a high score, a badge). MagnaSave goes to the previous or next friend; the backglass shows the friend's card while their thread is open.
- **Reply from the buttons**: six reactions placed on a message (Bravo, Rematch?, TILT!, Wow, OK, Like), six ready-made phrases, or "Write a message…" with the on-screen keyboard or the phone, whose text appears as you type. At a desk, the real keyboard.
- **A friend offline**: the message waits, "Waiting", and leaves by itself as soon as both cabinets are on at the same time, then turns to "Received".
- **During a game**, the buttons stay with VPX: the paired phone shows the most recent thread, with reactions, phrases and a field to write. An incoming message is announced by a notification, and in the menu by the DMD too.
- **Options**: mute a friend's notifications, clear a conversation, block; turn messaging off, mute its sound, keep messages 30 days, a year or forever.

### Public profile and likes

- **A profile anyone can read**: nickname, country, avatar, badges, number of published high scores and activity over the last 30 days. Presence, current table, games, library and messages stay between friends.
- **Like a high score or a badge** with one press of Start; a like received is announced by a notification. "My public profile" shows what others see and who liked what; it turns off in one move.
- **No server here either**: a player's card is signed and travels from cabinet to cabinet, so a profile can be read even when its player is offline.

<p align="center"><img src="images/en/messages.webp?v=eb9b0423c5" width="360" alt="The conversation with Bruno on the cabinet: the card of his new high score on Star Courier, his messages, then your reply, received and greeted with a “Bravo”; next to it, Write a message, Quick reply and Conversation options."></p>

### Shared libraries

- **"See their library"** on a friend's page: the tables you both have (with the media you are missing) and the ones you don't have.
- **Fetch a whole table**, or choose part by part (table, backglass, ROM, PuP-Pack, DMD colours, sounds, music, point of view, own settings, media), their version and yours side by side. Each line says "Ticked" or "Unticked".
- **ROM and PuP-Pack unticked by default**: they can only be ticked once you attest that you hold the rights ("I certify and agree").
- **Everything is checked on arrival** (size, SHA-256 fingerprint, content matching its type), then goes through the add plan before anything is installed. A file refused on the way is skipped with its reason; the rest arrives.
- **A transfer only starts once** and can be followed everywhere: "Receiving", its bar and percentage, on the table's page and in "Downloads". Once received: "Install in my library".
- **From "Add a table"**: "From a friend…" lists your friends, those with tables you lack first, and opens their library on those tables.
- **Free space is checked** before starting (the size plus 1 GiB).
- **"Limit download speed…"**: from 256 kB/s to 20 MB/s, or no limit, to leave the connection to the rest of the house.

<p align="center"><img src="images/en/friends-library.webp?v=937265c14c" width="760" alt="Bruno's library: the tables on both cabinets, and the one this cabinet doesn't have, Glass Lagoon, with its media and Get the whole table."></p>

### Privacy, network and firewall

- **What never leaves**: programs (`.exe`, `.dll`, `.bat`, `.ps1`…), saves, high-score files, PinMAME settings, statistics, and no path from your disk.
- **What others see**: everyone, your name; your friends, your presence, your current table, your high scores, your badges, your games and your library if you share it.
- **"Sharing and network"** gathers it all: sharing (on by default), your name, the local network, the shared library, the speed limit, the firewall, what others see, blocked players. The screen opens on "Back", so a stray Start never turns anything off.
- **The Windows firewall**: the installer sets the rules once, with no prompt on a cabinet without a mouse. They are checked again at every start and after every update, and put back on their own if one is missing. A rule that Windows blocks is reported plainly ("Cabinet network blocked by the Windows firewall").
- **End-to-end encrypted**, on [Holepunch](https://holepunch.to)'s Hyperswarm network.

## Leaderboards

<p align="center"><img src="images/en/leaderboard.webp?v=e71ce7fd79" width="360" alt="A table's scoreboard: this year's World ranking, each player with their country's flag, their avatar and their presence, and your own place under the board."></p>

- **"Scoreboard"** on every table's page: four periods, "All time", "This year", "This week", "Today", switched with the flippers. Every game played on the cabinet leaves its scores there, dated: read from the ROM's memory after the game (one per player, with initials when the score makes the machine's high score list), those that make an original table's high score list, the score of a game with friends. "All time" also brings in the high scores the table already kept, without its factory scores (the round values a ROM or script puts on the list when first started). A table whose scores cannot be read says so.
- **Four scopes**: "This cabinet", "Friends", "National" and "World", switched with MagnaSave. Under each ranking, your place for that scope and period; outside the top lines, your own line at the end of the table.
- **A fair comparison**: players only compare on the same exact table version and the same number of balls.
- **No server**: each score leaves signed by the player's key and travels from cabinet to cabinet. Only scores read by Cyber Pinball leave, never in guest mode; a dubious score can be hidden on the cabinet.
- **Every player recognisable**: their country's flag (all 256 present-day countries and territories have one), their avatar (attached to their scores, even if they are not your friend) and their presence, as a mark on the avatar like in a messaging app: green dot online, green dot and ring in game, hollow dot offline (a legend under the table recalls it; with the mouse, the status in words, "Seen 2 h ago").
- **Your country** comes from the Windows region and can be changed in "Sharing and network", where you can also stop publishing your scores.
- **On the phone too**: the Scores view shows the same rankings, even during a game (see [The phone as a remote](#the-phone-as-a-remote)).

## Install and update

### Two installers

- **Light installer** (about 110 MiB): Visual Pinball X 10.8.1 is downloaded on first launch from its official page and checked by SHA-256.
- **Full installer** (about 280 MiB): the official VPX archive included, for a cabinet without Internet access.
- **No administrator rights**: installed for the current user, with an entry in "Programs and Features".
- **Options**: a desktop shortcut, start with Windows; silent install from the command line.
- **Terms of use** shown by the installer, then by the menu until they are accepted, and available again in System menu > Cyber Pinball > Terms of use.
- **Uninstalling removes the application only**: tables, media, configuration and data stay, and reinstalling into the same folder finds them.

### A single root folder

- **Everything lives in a folder you choose** (for example `D:\CyberPinball`): the application, one VPX version per folder, the tables, the media, the ROM library, the configuration, the data, the downloads, and an `import\` folder for a USB stick.
- **A separate copy of VPX** with its own `VPinballX.ini`: nothing is registered in Windows. Program Files, Windows folders and network shares are refused.
- **Every downloaded component is checked**: an archive whose fingerprint doesn't match is deleted, never installed. The archives kept let you reinstall without a network.
- **`VPinballX.ini` backed up** before every write (10 versions kept). Only Cyber Pinball's keys are changed; a value changed by hand is never silently overwritten: the menu asks whether to keep it.

### Signed updates

- **From the cabinet**: System menu > "Cyber Pinball" > "Cyber Pinball update". Nothing is installed automatically.
- **A red dot** on the gear when a release is out; Cyber Pinball checks at start-up and then every 6 hours.
- **What's new in every version you missed**, in the cabinet's language, then "Update now" in one press.
- **Signed**: the cabinet only reads a feed signed (Ed25519) by the publishing key, and only runs the installer if its size and SHA-256 match.
- **Light updates**: when only the application changes, a package of about 1.5 MiB installs in a few seconds, with no installer.
- **Roll-back**: the previous version is set aside during the install and put back if it fails. At the next start, a banner says which version is installed.
- **Pre-releases**, received or not ("Pre-releases: not received / received").

<p align="center"><img src="images/en/update.webp?v=fa0c1e19dd" width="360" alt="An update is available: Cyber Pinball 0.2.0, its release date, what's new, the size of the signed installer, and the Update now and Later buttons."></p>

## Set up the cabinet

On first start, the wizard runs through every step. Afterwards, System menu > "Cabinet" > "Cabinet setup" runs each one on its own: it only changes its own settings.

<p align="center"><img src="images/en/wizard.webp?v=61a3eb8d13" width="900" alt="The setup wizard, Screens and roles step: each screen shows its number, and the playfield asks “Playfield?” with the flipper and Start hints."></p>

<p align="center">
  <img src="images/en/features/cabinet-setup.webp?v=c62c848439" width="300" alt="Cabinet setup: each step can be run on its own, from the game buttons to the cabinet sound, with the full wizard and the encoders' default keys.">
  <img src="images/en/features/configurations.webp?v=4cccf3e0c7" width="300" alt="Cabinet configurations: the active configuration, recognised with all 4 of its screens, the screens plugged in, and New configuration.">
</p>

### A wizard you follow from the flippers

- **Steps**: "Game buttons", "Interface buttons", "Analog plunger", "Tilt", "Screens and roles", "Playfield orientation and size", "Screen layout", "Cabinet sound", then a summary.
- **Every question shows on every screen**, so you see it from wherever you stand.
- **"Quit without saving?"** at any time (hold Exit for 2 s): the question says what would be lost, and nothing is written if you confirm.
- **The button summary is a test**: each newly learned button must be pressed before it is accepted.

### Buttons, joysticks and Pinscape

- **Two sets of buttons**: the game's (flippers, Start, Exit, credit, plunger, MagnaSave, Extra Ball, pause, tilt, nudges, volume, mute) and the interface's (Previous, Next, Confirm, Back). One button can serve both.
- **Keyboard and joystick mixed freely**: keyboard encoders, encoders in gamepad mode, Pinscape KL25Z, VirtuaPin. The step says which joystick it reads ("Joystick read: …").
- **Safe learning**: duplicates, the Windows key and keys VPX can't read are refused.
- **After every game**, if VPX didn't see the learned joystick, the menu says so and reopens the "Buttons" step.
- **The encoders' default keys** as a fallback, in one move, even with no button at all.
- **An optional Pause button**: one press pauses the game, another resumes it.

<p align="center">
  <img src="images/en/features/buttons.webp?v=56b64279a0" width="300" alt="Game buttons: each button with its key (flippers, Start, Exit, coin, plunger, MagnaSave, Extra Ball, pause, tilt, nudges, volume, mute), and Save, Previous, Default keys, Map all.">
  <img src="images/en/features/interface-buttons.webp?v=f7defa8123" width="300" alt="Interface buttons: Previous, Next, Confirm, Back and menu, Cheat sheet and VPX settings, with the keyboard fallback keys always active.">
</p>

### Analog plunger and tilt

- **Potentiometer or sensor plunger**: "Pull the plunger all the way, then let go"; the axis and its direction are found, with a live gauge. Dead zone (0 to 30%), speed and accelerometer are adjustable, and each test shot shows its strength.
- **Tilt**: the cabinet's tilt bob, a tilt bob simulated by VPX from the accelerometer, the coin door's slam tilt, or no tilt.
- **Contact angle** from 0.15° to 4°, **nudge strength** from ×0.50 to ×6 (×2 offered for a Pinscape). The test shows the ring seen from above and displays "TILT" at each contact.
- **Inconsistent settings flagged**: two tilt bobs, a tilt bob with no button, a simulated bob with no sensor.

<p align="center"><img src="images/en/features/tilt.webp?v=cbdc5d9b3f" width="360" alt="The Tilt step: the tilt bob's ring seen from above, the tilt bob simulated by VPX and the contact angle, to test by nudging the cabinet."></p>

### Screens recognised by their fingerprint

- **Each screen is identified by its EDID fingerprint** (maker, model, serial number), never by its Windows number.
- **`VPinballX.ini` is rewritten at every start**: plug a screen into another port, wake them in a different order, let Windows renumber everything: the playfield stays the playfield.
- **Roles**: playfield, backglass, DMD, topper. The playfield diagonal is suggested from the screen, and an inconsistent value is refused.
- **VPX's windows** (backglass, DMD, topper) are brought back to their role's screen during the game when two screens share the same name.

### Several roles on one screen

- **Zones**: backglass and DMD on the same screen, a DMD inset into the playfield, or everything on one desk screen. They are stored as proportions of the screen and survive a resolution change.
- **"Screen layout"**: kept aspect ratio (free, 16:9, 16:10, 4:3, 5:4, 21:9, 4:1, 9:16, 3:4), position and size to the pixel, placement next to another role, 12 px snapping, "Undo changes". From the buttons, the keyboard or the mouse, including dragging a zone from one screen to another.
- **Ready-made spots**: the bottom of the backglass as a 4:1 or 16:9 strip, an inset in the playfield: a two-screen cabinet always has room for the DMD.
- **Overlaps and slips flagged**, with what will be in front.

<p align="center"><img src="images/en/features/screen-layout.webp?v=14c06ce11b" width="360" alt="Screen layout, playfield zone: screen, kept aspect ratio, full screen, position, width, height, exact size and position, snapping."></p>

### DMD, FullDMD and real DMDs

- **"DMD screen"**: say once whether it is a FullDMD (16:9 screen, the game's DMD inset) or a DMD only (4:1 strip). The menu, VPX and PuP-Packs follow it; an ambiguous case is flagged "To check".
- **FullDMD frame during the game**: the table's FullDMD image stays on screen and the game's DMD sits in its frame, found on its own in the image or video.
- **Real DMDs recognised** without opening a port (ZeDMD, PIN2DMD, Pixelcade): the plugin that drives them is switched on for you.

<p align="center"><img src="images/en/features/dmd-screen.webp?v=d12e559721" width="360" alt="DMD screen: “It's a FullDMD” or “It's a DMD only”, each with its diagram."></p>

### Orientation and framing

- **The player says where they stand**: the flippers rotate the display until the text is upright. Menu, game pages and settings turn for them; backglass, DMD and topper stay upright.
- **VPX's automatic framing** enforced in cabinet view and restored on its own; a warning says if VPX would draw the flippers on the wrong side.
- **The Windows desktop given back the right way up**: the playfield screen is rotated only while the session runs, and every exit, even after a crash, restores its previous orientation.
- **Tables the right way round**, kept from one start to the next; "Cabinet health" fixes the ones turned around in VPX's menu.

<p align="center"><img src="images/en/features/playfield.webp?v=78f7b456c6" width="360" alt="Where are the flippers? The playfield screen, recognised by its fingerprint, with the “Flippers · you are here” strip on the player's side."></p>

### Sound

- **The "Sound" step** plays n beeps on output n: left flipper for the backglass, right flipper for the playfield, Start for both. Virtual and Bluetooth outputs are left out.
- **Speaker test for a 5.1 or 7.1 card**, pair by pair, to choose stereo, surround or SSF; swapped wiring is flagged.
- **Outputs found by their ID**, never by their name; Cyber Pinball never changes Windows' default output.
- **All the menu's sound goes through the cabinet speakers**: music, videos, previews, web pages.
- **Volume buttons**: the whole cabinet's volume, in the menu and during a game, 5% per press; holding Volume − for a second mutes or unmutes; a badge shows the level at the top of the playfield.

<p align="center"><img src="images/en/features/sound.webp?v=9dc834a96c" width="360" alt="The Sound step: output 1 of 2 plays one beep; left flipper for the backglass, right flipper for the playfield, Start for both."></p>

### LED and feedback (DOF)

- **Controllers recognised without sending them anything** (Pinscape, LedWiz, Teensy, DudesCab, PacLed…), the VPX DOF plugin turned on, and what keeps an LED from lighting stated plainly (missing configuration, controller without its file, undeclared Teensy).
- **The configtool configuration** is fetched in "Get" and imports itself; the old one is backed up.
- **Addressable LEDs (WS2812)**: describe your strips (Teensy, Wemos D1, or Art-Net to WLED on an ESP32) and Cyber Pinball writes the DOF `Cabinet.xml`, never replacing a hand-written file.
- **A table's doctor** points out a ROM with no DOF effects; the VPX settings choose, for the knocker or the shaker, the table's sound, the cabinet or both.

### Several configurations

- **One install, several setups**: a cabinet and a desk PC, for example. Each configuration has its screens, roles, zones, sound, buttons and its own `VPinballX.ini`; tables, ROMs, media and statistics are shared.
- **Recognised on its own** at start-up and before every game, from the screens plugged in; the choice is explained, and a doubt opens "Which configuration is connected?".
- **"Cabinet configurations"**: use, force, rename, delete (restorable from the bin), create.

## The table menu

### The wheel and the screens

- **A wheel of medallions** over the selected table's playfield video, one window per screen: topper, backglass and DMD follow the game.
- **A wheel that comes alive**: the selected table lights up with a green halo from behind its medallion, over a glow in its hue; once it stops, a white spark runs round the medallion, tracing a green ring on its chrome edge, then keeps turning slowly, and a gleam sweeps across it. Each press sends a wave of light along the arc, and the new title spreads apart as it arrives.
- **Menu screens that open in a second**: a thin line of light draws itself under the title, and the lines come in one by one.
- **Live changes**: a media file or a table added, replaced, renamed or removed shows up at once on every screen, without restarting.
- **Neighbouring tables' media preloaded**, and a 280 ms fade when changing table.
- **"Media during play"**: frozen (default), animated or off, on the screens VPX doesn't use.
- **Outside the table menu** (system menu, settings, help), the screens switch to the brand display, in silence; a table's page keeps its media.

<p align="center"><img src="images/en/launch.webp?v=d9a0c78278" width="900" alt="Animation of the launch on a four-screen cabinet: after Start, the Neon Abyss logo lights up on the playfield, flies up through the DMD and lands on the backglass, then the screens fade out as Visual Pinball X takes over."></p>

### Live DMD and brand colours

- **The menu's DMD drawn by Cyber Pinball**, on a 128 × 32 dot grid: the title, PRESS START, the high scores ("HIGH SCORE #1" to #4), the clock, the credits, never fading out: the table's DMD media shows around the dots on a FullDMD, or alone with the "classic" DMD.
- **A DMD that comes alive**: on arriving at a table, a close-up of its wheel in dots (often its logotype) lights up, slides and makes way for the title; the pages alternate three effects (threads of light running along each row, a light wipe, a diagonal shimmer), and from one table to the next the new one slides in the direction of the wheel; every other cycle, a short gameplay scene: bumpers, plunger, flippers, "BANK COMPLETE", "BALL LOCKED", multiball.
- **High scores read from the table**, never made up.
- **"DMD sur la roue" (DMD on the wheel), table by table** (the table's page > "Gérer la table…", Manage the table…): dots shown or hidden (the FullDMD screen then shows its media alone), and their position on the DMD screen, set with the buttons while watching the DMD screen live. Separate from the in-game DMD, which keeps its own setting.
- **"DMD colour"**: signal green by default, presets (teal, light ink, glacier blue, soft amber, plasma orange) or any colour you like.
- **Each table has its colour** in the menu: the wheel's light, the frames' glow and the background of screens without media take the hue of its backglass, with a fade; the chosen table stays green. The DMD can take it too ("Couleur de la table", Table colour). Setting: "Couleur de chaque table au menu" (Colour of each table in the menu).
- **A dot font** drawn for Cyber Pinball.

<p align="center"><img src="images/en/live-dmd.webp?v=7a6e43e169" width="760" alt="The menu's live DMD: the game title, PRESS START, the top high score and the clock, in turn."></p>

### Intro, cinematic launch and sounds

- **Startup intro**: threads of light weave up from the bottom of the playfield, a spark rises and flares in the centre, "CYBER PINBALL" spreads apart as it sharpens, and the backglass and the DMD light up with the ignition, over a soft breath that opens into a chord. Then "Press a button to choose a table"; the threads keep turning slowly in drifting dust, so the screen never freezes. Drawn by the graphics card, it stays smooth in 4K; on a desk PC, it plays lying across the width. Put your own image or video on each screen and your own background music, or turn it off; "Watch the intro" and "Restart Cyber Pinball" play it again.
- **Cinematic launch**: on Start, the game's logo pulls back like a ball on the plunger, flies up to the backglass followed by a beam of threads of light that closes in on it, with a flash as it lands; a glowing disc crosses the DMD, and a coil thumps when VPX takes over. VPX never waits for the show.
- **Sounds of the machine**, all synthesised: a solenoid click when changing table, a coin on Start, the knocker when a high score falls, a chime for an invitation, a signal for a friend.
- **Each game's music** on the wheel (60% by default); a table without music plays its playfield video's sound (40%). The music only starts if the table stays selected for 350 ms: scrolling plays nothing.
- **"This game's volume"** from 0 to 200% for a table that is too loud or too quiet.

<p align="center">
  <img src="images/en/features/startup-show.webp?v=ce8bfd8641" width="300" alt="Startup intro: played or off, Watch the intro, each screen's animation to replace with your own image or video, and the background music.">
  <img src="images/en/features/dmd-colour.webp?v=641f20eba9" width="300" alt="DMD colour: signal green, teal, light ink, glacier blue, soft amber, plasma orange, or a colour of your own.">
</p>

### Collections and favourites

- **Collections** on the wheel: All, Favourites, Recent, Never played, With my online friends, each manufacturer, each decade. **Left or right MagnaSave** goes to the previous or next one, at once; the list of collections shows for a few seconds, an empty collection greyed out with its reason.
- **A fixed marker** on the title cartouche ("☆ FAVOURITES │ 3 / 12"): the collection and the table's place, which never move when you change table. Each collection keeps its table.
- **Favourites**: "Add to favourites" on the table page, a white star before the title; a favourite from another installation is taken as it is.
- **My collections**: personal collections with your own names ("Party nights", "For the kids"…), filled from each table's page, renamed or deleted at will.
- **Collection buttons** of your choice: any free cabinet button; **System menu > Collections** too, with no button at all.
- **Guest mode restricted to a collection** (favourites, a manufacturer…), and **attract mode** within the collection shown.

<p align="center">
  <img src="images/en/features/collections.webp?v=40a6e35021" width="300" alt="The wheel on the Recent collection, the list of collections open: All tables, Favourites, Recent, Never played and With my online friends, the empty ones greyed out with their reason, then the manufacturers.">
  <img src="images/en/features/favorites.webp?v=8105d3ed83" width="300" alt="The page of a table added to favourites: the white star after its title, “Remove from favourites”.">
</p>

### Wheel, table order and attract mode

- **System menu > Tables > Wheel** gathers every wheel setting: layout, order, table at startup, Start on the wheel, animated logos, colour of each table, Juke-box.
- **"Animated logos"**: only the chosen table's logo moves (default), its neighbours stay on their first frame; or all of them move.
- **"Table order"**: by title, last played, most played, year, manufacturer, or shuffled at every start.
- **"Table at startup"**: the first one, a random table, or the last one played.
- **"Start on the wheel"**: open the game page (default), or play right away; the game page stays on a held Start (or F6).
- **Attract mode** after 5 minutes (from 1 to 30 minutes, or never): a random table every 20 s, with its media, and the first button brings the menu back as it was.

<p align="center">
  <img src="images/en/features/wheel-settings.webp?v=07247843ea" width="300" alt="Wheel: menu layout, table order, table at startup, Start on the wheel, animated logos, colour of each table, Juke-box in the wheel.">
  <img src="images/en/features/menu-settings.webp?v=54860c0860" width="300" alt="Media, sound and attract mode: Juke-box visualizer, game music and its volume, video sound, cinematic launch, intro, interface sounds…">
</p>

### On a desk PC

- **On a desk PC**: the playfield in a 9:16 frame, the wheel and the details beside it, the backglass on a second monitor if you have one.
- **Four wheels** to choose from: "Medallions", "Banner", "Minimal", "Arch".
- **Layout that adapts** from 16:9 and wider down to 5:4, checked from 1366 × 768 to 4K.

<p align="center"><img src="images/en/desktop.webp?v=5191eb8fc7" width="900" alt="The table menu on a desk PC: the playfield of Neon Abyss in an upright 9:16 frame on the left, the backglass, the wheel of medallions and the title panel on the right."></p>

### Never a white flash, never the desktop

- **A black veil per screen**, from start-up to the end of a game: no screen ever shows the Windows desktop.
- **No white flash**: a window stays transparent until its first frame.
- **Taskbars hidden** during the game, then given back; put back behind the menu on return. On a cabinet started with Windows, hidden for the whole session, given back on the Windows desktop and when quitting.
- **"Windows desktop"** (Ctrl+Shift+D) frees every screen of the PC, and Cyber Pinball stays silent while you are there; the same shortcut brings the menu back.

## Jukebox

<p align="center"><img src="images/en/jukebox.webp?v=588b41addb" width="900" alt="The jukebox on a four-screen cabinet: on the playfield, the Néon nocturne playlist, its play modes and the track playing; on the backglass, the track's artwork; on the DMD, the artist's name and a spectrum in glowing dots."></p>

### The player

- **A medallion at the head of the table wheel** plays your playlists. Start: the disc leaves the playfield and takes the stage on all three screens (a button interrupts it). The backglass plays the music video, the playfield the list of tracks, the DMD a spectrum in dots; the medallion can be hidden in System menu > Media.
- **All your playlists at the entrance**, in large rows: cover, number of tracks, length, sources, the one playing marked. Start opens one; Exit goes back up to the playlists without stopping the music, then back to the wheel.
- **The wheel's buttons**: flippers to choose a track (held, they move forward or back through the track in steps of 5, 10 then 30 s), Start to play or pause, MagnaSave for the neighbouring playlist, Exit to go back.
- **Playback modes** remembered by each playlist: "Play all", "Shuffle" (each track once before any plays again), "Repeat: playlist / track / off". Start held on a playlist plays it shuffled.
- **DMD in colour**: the visualiser takes the cover's colours, or Multicolour, or the DMD colour ("Juke-box visualiser").
- **At a desk**: the mouse wheel scrolls, a click selects, a double click plays, a click in the progress bar jumps there.

### Managing playlists

- **"Juke-box management"**, at the top of the list or by holding Start on a track (also System menu > Jukebox): create, rename, reorder, delete; the space used and the free space are shown.
- **Import from YouTube**: a playlist or a video, by its link pasted from the phone, typed on the keyboard, or from "Get" ("Add to the Juke-box"). With the on-screen keyboard, the start of the link is already written: you only type the ID. You see the number of tracks, the length, the estimated size and the videos skipped with their reason, then choose the tracks (each with its thumbnail, to preview before ticking it), the playlist, and the quality (1080p, 720p, sound only).
- **Your YouTube account**: your own playlists, private ones included, and "Liked videos" and "Watch later". Sign-in happens in Microsoft Edge, on the browsers' screen, driven by the phone if needed; Cyber Pinball never sees or keeps any password, and nothing needs to be created at Google.
- **Your own files**: a file, or a whole folder, subfolders included, with the folder's cover.
- **Online or on the cabinet**: each track plays online, downloaded, or from your disk; "Download everything" and "Free up space" switch a playlist from one mode to the other. Without a network or without space, these features stay visible, greyed out with their reason.
- **Each track** can be moved or copied to another playlist, with no file copied, and its title, artist and album corrected (your correction wins over YouTube).

## Everything from the buttons

- **Flippers, Start and Exit** are enough everywhere: choose, confirm, go back. The gear ⚙ and Tab open the system menu with the mouse or the keyboard.
- **A system menu in five sections**: Friends, Tables, Media, Cabinet and Cyber Pinball, with Recent activity, Collections, Jukebox, Downloads and Phone remote as shortcuts. A red dot climbs up to the gear when an entry is waiting for you, and the menu opens on it.
- **An action's message stays** ("Name changed", "Avatar saved"…) until the next action, instead of vanishing at once.
- **The flippers follow the screen's order**, from top to bottom, on every management screen; they only wrap around at the two ends.
- **Always a way out**: Exit closes "Get" even when Windows has taken the foreground, and held for two seconds it forces it closed. Before every Windows permission prompt, a screen warns that you will have to answer with the keyboard or the mouse.
- **Long lists**: Exit goes back to the screen's actions, MagnaSave switches between the list and the actions and keeps your place, a held flipper scrolls letter by letter.
- **Long texts** (release notes, messages) read page by page with the flippers, with how much you have read.
- **A back button that says where it leads**, above every screen's title, clickable: "‹ Neon Abyss", "‹ Downloads", "‹ Table menu"; in a list, "Exit: actions".
- **A feature that's unavailable stays visible**, greyed out, with its reason.
- **Keyboard shortcuts** shown next to the entries: R for VPX settings, H for the controls, Ctrl+Shift+D for the desktop, Ctrl+Shift+K to stop a game that hangs.
- **An icon for every menu**, drawn for Cyber Pinball.
- **A built-in file picker**, in place of Windows': downloads, the import folder, the Desktop, USB sticks and drives, from the buttons, the mouse or the keyboard.

<p align="center"><img src="images/en/system-menu.webp?v=4606414e88" width="360" alt="The system menu: Recent activity, Collections, Friends, Tables, Media, Juke-box, Downloads, Phone remote, Cabinet and Cyber Pinball, each with what it holds."></p>

<p align="center"><img src="images/en/features/controls.webp?v=6415a94deb" width="360" alt="The controls cheat sheet: in the menu (choose a table, game page, VPX settings, Windows desktop, stuck game) and during a game (flippers, plunger, coin, MagnaSave, pause, tilt, volume)."></p>

## The phone as a remote

<p align="center"><img src="images/en/phone.webp?v=e0e7c35344" width="760" alt="The phone page, served by the cabinet: the Menus view that opens any menu directly, the jukebox player, and a table's World ranking in the Community tab."></p>

- **Nothing to install**: System menu > Phone remote shows a large QR code (the on-screen keyboard and the built-in browser's banner show a small one). Scan it with your phone, on the same Wi-Fi as the cabinet: the page comes from the cabinet.
- **You accept the phone at the cabinet**: the same four-digit code on both sides, Start (or Enter, with "Accept" selected by default) to accept, Exit to refuse. One phone at a time; the QR changes every three minutes and serves only once.
- **Accepted once, the phone is kept**: it then comes back without a QR code or acceptance, from a shortcut on its Home screen (Android and iPhone alike, with the Cyber Pinball icon, still with nothing to install); it reconnects by itself when Cyber Pinball restarts or updates, and finds the cabinet by its name on the local network when the router has given it another address. Cabinet off or another Wi-Fi: the page keeps retrying and picks up as soon as the cabinet answers. Kept phones are listed in System menu > Phone remote, where "Forget this phone" removes one of them.
- **Five slim tabs at the bottom**: Screen, Menus, Jukebox, Community and Buttons; at the top, a single slim bar, with "Keyboard" when the cabinet is waiting for input and the ⋮ menu (send a file, full screen on Android, disconnect).
- **Every menu in one tap**: the Screen view shows the entries of the screen open at the cabinet, which you tap directly; the Menus view arranges every menu like the system menu and directly opens the one you tap; the Buttons view holds **the cabinet's buttons** (Start, flippers, Exit, MagnaSave; a held flipper scrolls fast). During a game, only the in-game settings open from the phone. An unavailable menu is greyed out with its reason.
- **Tables in pictures**: the table menu shows each table's medallion, or as a grid its backglass image (tap to choose, again for Start); a table added has its own straight away. A button at the top changes collection, like MagnaSave at the cabinet.
- **The Jukebox in your hand**: playlists with their covers, tracks, play and pause, previous and next, shuffle and repeat, moving through a track. A mini player follows the current track above the tabs; "Manage" neatly arranges the additions, the YouTube account and the playlists.
- **The Community in your hand**: messages, friends and scores. Conversations open as a thread, like on a phone: the friend's messages on the left, yours on the right, reactions and quick phrases in one tap, and a field to write, even during a game. A red dot flags an unread message, from any tab.
- **The rankings in your hand**: the Scores view shows the scoreboard of every table, exactly as at the cabinet: this cabinet, friends, national and world, the four periods, flags, avatars and presence. The table chosen or launched at the cabinet opens first, another one can be chosen from the list, during a game too.
- **Type instead of the on-screen keyboard** (search, player name, playlist link) and **send a file to the import folder** (up to 2 GB, progress on both screens), which "Add a table" then offers.
- **The built-in browser in your hand**: a touchpad for the pointer, which glides smoothly over the whole window, banner included (Web, Images, YouTube, Video engines): tap, a click; two fingers, scroll; long press, right-click. **The phone's keyboard** as soon as a field has the keyboard focus: a filled field arrives with its text, to correct on the phone (never a password, which stays hidden), "Next field", Enter. Back, Forward, More (including the search and its engines), Close. The same touchpad drives Microsoft Edge for the YouTube sign-in.
- **The cabinet's report** (see [Tech sheet and report](#tech-sheet-and-report)) can be downloaded to the phone, sent in a prepared e-mail, or its summary copied.
- **Guest mode applies to the phone**, which never unlocks it: the menus stay locked.
- **Encrypted, and on the local network only**: nobody on the Wi-Fi reads what you type. Cyber Pinball records nothing you type: you sign in yourself.

<p align="center"><img src="images/en/features/telecommande.webp?v=2d5fc38805" width="900" alt="The built-in browser driven by a phone: the banner says Phone connected, the green pointer is on the username field; next to it, the phone page with its touchpad and keyboard"></p>

## Add tables

<p align="center"><img src="images/en/features/add-table.webp?v=cc5972a213" width="360" alt="Add a table: the import folder, Find a table online, Reuse a downloaded file, Choose files or a folder, Received and expected, Table updates, Site accounts, Search the web."></p>

### Every way to add a table

- **"Add a table"** (System menu > "Tables") gathers it all: "Ready to install", the import folder (USB stick), "Find a table online", "Reuse a downloaded file", "Choose files…", drag and drop, "Received and expected", "Table updates", "Site accounts", and "From a friend…" (a friend's library, their tables you lack first).
- **Every table named from the VPS database** (Virtual Pinball Spreadsheet, about 2,600 games): a "Title (Manufacturer Year)" folder, details filled in (manufacturer, year, authors, IPDB number). A doubt opens "Which game is it?" with five suggestions.
- **"Table updates"**: the tables for which a newer version exists.
- **"From another installation…"**: the tables of another cabinet menu, listed one by one; tick the ones you want, and each arrives with what that installation kept elsewhere (PuP-Pack, ROM, DMD colours and sounds, DMD folder, backglass, media). Nothing is brought in wholesale; the original installation does not change.
- **A game part can be chosen as a folder too** ("Game parts" > "Look for a file or a folder…"): a PuP-Pack, sounds or colours, even taken from a folder that holds many.

### The online catalogue

- **Every game of the VPS database playable in VPX**, with its versions and what this cabinet needs to play it, worked out from your screens and the ROMs already there.
- **"Filters and sorting"**: kind of game (no ROM needed, solid-state, electro-mechanical, original creation), files available (backglass, ROM, PuP-Pack, sounds, DMD colours, topper, VR…), site, installed or not; search by title, initials or ROM name. Most popular first by default (the number of authors who worked on the game), or newest, or title; filters and sort kept from one visit to the next.
- **A smooth catalogue**: twelve games per page, the thumbnails arrive in the background while the buttons keep responding.
- **A recommended version**, with its reasons spelled out (not a MOD if possible, the most recent, a live link…).
- **"Quick install"**: the recommended table, ROM and backglass are fetched one after the other, each page opening on its own.
- **Galleries, never lists of names**: a preview in the right shape, popularity read from the site ("1,324 downloads · 5/5"), author, date, sort by popularity.

### The built-in "Get" browser

- **The site's page opens under a banner** reminding you what to download (game, version, authors, ROM). You sign in and download yourself: Cyber Pinball clicks nothing, fills in nothing and never sees a password.
- **Each downloaded file is matched** to what was expected, with its progress (percentage, size, speed, time left) and "Cancel".
- **The page is kept** where you left it; the cabinet's Exit closes it.
- **"Built-in browser screen"**: automatic, or one of the cabinet's roles.
- **"Block ads"**, on by default, YouTube included; table forums are never filtered.
- **"Search the web…"** on every add or choice screen, with the search already filled in.

### Site accounts

- **"Site accounts"**: VPUniverse, VPForums, Pinball Nirvana, PinSound, each "Signed in" (with its expiry date) or not; "Sign out" only clears that site's cookies.
- **Nothing is bypassed**: you sign in and download yourself, on the site's page. Cyber Pinball accepts no terms, skips no waiting time and solves no check.

### Every file where it belongs

- **A received file is recognised by its content** (table, backglass, ROM, PuP-Pack, sounds, DMD colours, music, point of view, topper, media), zip, 7z and rar archives included, and filed into that part of the game, even when something else was expected.
- **A complete archive** fills all its parts in one go.
- **A file that needs fixing never blocks the rest**: it is "kept aside", and "Received file to check" asks where it goes.
- **A waiting list you can correct**: reassign, empty, replace, stop waiting. Nothing is ever deleted: the bin is Cyber Pinball's own.
- **Windows' Downloads folder** can be watched, for a file fetched in your own browser.

### Download manager

- **One place** for everything that arrives, from a site or a friend, and a badge on the table menu ("2 in progress · 45%").
- **Resumes without loss** if the connection drops, even the next day, with spaced-out retries; a paused download never restarts on its own.
- **Never twice**: a download already requested is not started again.
- **Checked after resuming** (SHA-256 or MD5): a wrong file is never handed over.
- **Back to the screen you started from**, in one move, even after a restart.

### What's missing to play

- **A guided path**: "Cabinet and VPX", "Table", "ROM", "Play", with "Step n of N" and the next move one press of Start away.
- **Only the table and its ROM are required**; backglass, PuP-Pack, media, DMD content, colours and sounds are offered, never demanded.
- **Missing ROM**: "Get the … ROM" opens its page, or "Play with …", a neighbouring revision already on the cabinet.
- **Remembered**: a step that's done stays ticked; "Resume: Step 3 of 4" at the top of the table's page.

<p align="center"><img src="images/en/missing-to-play.webp?v=d751d66624" width="760" alt="What's missing to play, for Neon Abyss: step 3 of 4, the ROM to fetch from vpforums.org or a neighbouring revision; then, once the ROM is installed, All set to play."></p>

## A table's page

- **Start on a table** opens its page (or launches the game, if "Start on the wheel" says so): play statistics, a summary of its files, and three choices at the top, "Play", "Play with a friend", "Flyer and rules". The rest waits under "Manage the table…": "Game media", "Game parts", "Table files", "PuP-Pack", "This table's settings", "Adjust display in game", "Play and record", "Diagnose and repair", "Edit info", "Delete the table"; whatever needs a look shows from the game page.
- **"Scoreboard"**: the table's scores on this cabinet, at your friends', in your country and in the world (see [Leaderboards](#leaderboards)).
- **"Add to favourites"** and **"Add to a collection…"**: the table in your favourites or your collections (see [Collections and favourites](#collections-and-favourites)).
- **"All tables"** (System menu > "Tables"): the full list, with manufacturer, year, version and number of games; Start opens the same page.
- **"Game parts"**: one line per part (table, backglass, ROM, PuP-Pack, DMD colours, sounds, music, point of view, topper, media), "Present", "Received, to install", "Expected" or missing; each one can be added, replaced, reassigned or removed, and a missing part starts a search on every site.
- **"Table files"**: the whole folder grouped by kind, with what VPX will do with each file ("loaded by VPX with this table", "wrongly named: VPX won't load it").
- **"Flyer and rules"**: a single booklet, page by page, turned for the player. The rules are found automatically: the card and text stored in the table, a public rulesheet (The Pinball Primer, Pinball Rule Sheets), a tutorial video to watch on the phone; the game controls always come last. For about ten tables, a game guide opens the booklet: the goal, then one objective per page, with the shots numbered on the playfield and the shots from the flippers.
- **"Diagnose and fix"**: the table doctor (see [A cabinet that looks after itself](#a-cabinet-that-looks-after-itself)).

<p align="center"><img src="images/en/game-page.webp?v=5a9f437c7d" width="360" alt="The game page of Neon Abyss: its play statistics and files, then Play, Play with a friend, Scoreboard, Flyer and rules, Add to favourites, Add to a collection and Manage the table."></p>

<p align="center">
  <img src="images/en/features/all-tables.webp?v=14d154367e" width="300" alt="All tables: the seven tables with their manufacturer, year and number of games played.">
  <img src="images/en/features/game-parts.webp?v=0b063aba98" width="300" alt="Game parts of Neon Abyss: table, backglass, ROM, PuP-Pack, DMD colours, remastered sounds, music, point of view, own settings and media, each present or missing.">
</p>

<p align="center">
  <img src="images/en/features/doctor.webp?v=0523069f91" width="300" alt="The diagnosis of Neon Abyss: no backglass, and media whose proportions differ from their screens, each finding explained in plain words.">
  <img src="images/en/features/flyer.webp?v=4e77f38894" width="300" alt="The flyer of Neon Abyss, full page, turned for the player.">
</p>

## ROMs, PuP-Packs, backglass and DMD

### ROM library

- **Each ROM stored once**, hard-linked into every table that plays it, taking no extra space.
- **Recognised by its content**, as zip, 7z, rar or a folder of chips, and renamed if needed.
- **Neighbouring revisions and old names**: a table can play a close revision (with a warning), and 119 old VPinMAME names are translated.
- **"ROM library"**: each ROM, its tables, its size, the ROMs to file, unused or expected, and the space saved.
- **"Gather ROMs"** files those of an older install, with a plan and a report of the space freed.

### PuP-Packs

- **No PinUP Player to install**: VPX 10.8.1's PuP plugin.
- **When added**, the pack is named the way the script expects, flattened, cleaned, and set up without ever running its `.bat` files (read, not run).
- **The pack option chosen from your screens** (topper, DMD, FullDMD, backglass); the table's "PuP-Pack" screen shows the option applied and the one recommended "For this cabinet".
- **Fixed before every game**: a pack the table's script keeps switched off is switched on (by an adapted script next to it, the table is never modified), a pack nobody starts is started, images shipped under a video name and accented file names are fixed, the playlist order restored.
- **Videos triggered by the DMD** recognised during the game on FlexDMD tables without a ROM.
- **The table's DMD stays in front of the pack** when the pack would hide it.
- **Disabled, table by table** ("Game parts" > "PuP-Pack"): the table plays as if the pack were not installed, without its videos; "Re-enable the PuP-Pack" puts it back exactly.

### Backglass, DMD and VPX plugins

- **VPX 10.8.1 in plugin mode**, set up for you: backglass, PuP-Packs and DMD drawn by VPX, with no third-party tool.
- **Priorities set**: a PuP-Pack goes in front of the `.directb2s`, which stays visible when the pack has nothing to show.
- **Serum and VNI DMD colours** offered automatically.
- **A FullDMD `.directb2s`** receives the ROM's DMD, its place found in the image.

## VPX settings and in-game settings

- **Every VPX setting**, read from the installed version's source code (1,240 for 10.8.1, 101 of them for plugins): a translated "Essentials" tab, a complete "Advanced" tab.
- **Globally or table by table**: a table's own settings only keep what differs from the global ones.
- **The keys Cyber Pinball manages** are shown read-only, with where their value comes from and how to change it.
- **In-game settings**: both MagnaSaves together open "DMD position" (screen, position, size, format), then VPX's menu. VPX pauses while you adjust; the position is saved for this table or for all of them.
- **"Adjust display in game"** on a table's page: the table starts on its framing (point of view, backglass, DMD, topper), and that game doesn't count in the statistics.
- **VPX's questions avoided** (ActiveX, VR headset); a VPX dialog box stops the game and its text becomes the on-screen message.

<p align="center"><img src="images/en/vpx-settings.webp?v=03be4e0581" width="760" alt="The VPX settings screen: the Essentials tab with table view and sound settings, the values managed by Cyber Pinball, and the description of the selected setting."></p>

## Game media

<p align="center">
  <img src="images/en/game-media.webp?v=2c9b874489" width="360" alt="The Game media screen of Neon Abyss: each media item with its preview, where the menu shows it and its role, and the actions Find media and Search the web.">
</p>

### Media roles

| Media | Where it shows | Without a file |
| --- | --- | --- |
| Logo | wheel, list, attract mode | the title in styled text |
| Playfield | playfield background | smoked glass |
| Backglass | backglass | the lit image of the `.directb2s`, otherwise a card (title, manufacturer, year) |
| Display (DMD) | 4:1 DMD | the title in dots |
| Wide display (FullDMD) | 16:9 DMD | the display centred, otherwise the title in dots |
| Topper | topper | logo, manufacturer and year |
| Loading | from Start to the game | brand, title, manufacturer, year, progress bar |
| Game music | backglass speakers | the cabinet's music, otherwise silence |
| Launch sound | once, on Start | the loading video's sound |
| Flyer | on request, page by page | a page drawn from the game's details |
| Rules | on request, page by page | the rules found automatically, then the game's controls |

- **Never an empty screen**: a missing media item is replaced by a fallback drawn in the table's colours.
- **"Game media"**: one card per item with its preview, its state ("Present", "Fallback: …"), its dimensions and weight. Take from the import folder, pick on the PC, drag in, replace, move to the bin; nothing is written before "Save", which shows the plan first.

### Galleries of suggestions

- **"See suggestions"**: every version found for an item, with its preview and source: VPinMediaDB, community sites, the VPS database, and what the table already holds (PuP-Pack, FlexDMD or UltraDMD animations, images from the `.directb2s` and the `.vpx`).
- **Popularity, author, date**, sort by popularity; the media saved is always the one you picked.
- **Deep search**: the `.vpx` internal name, author, IPDB number, ROM, initials or translated title; "Wrong game?" always offered.
- **"Search more"**: more pages per site and the game's other editions; **"Animated only"** keeps just videos and animated images; **added words** ("neon") narrow the search on the sites and on the web. A line says how many suggestions the filters hide.
- **Site entries filed by the VPS database** (logos, toppers, media packs) are offered straight away, with no search.

### VPinMediaDB and community sites

- **"Find media"** from VPinMediaDB (about 1,155 games): logo, playfield in 1k or 4k depending on your screen, backglass, wide display, flyer, music. A plan to confirm, a checked download.
- **"Find missing media"** for every table at once, never replacing existing media.
- **VPForums and VPUniverse** with your own account: their waiting times are queued for you, with a timer on screen.

### Free search, YouTube and videos

- **"Search the web myself…"**: the built-in browser on a search you can change as you like (Web, Images, Videos, YouTube).
- **"Your accounts"** under the search: vpuniverse.com, vpforums.org, pinballnirvana.com and pinsound-community.org in one press; signed in, the chip searches the title there, otherwise it opens the site's sign-in page.
- **"Get the sound" or "Get the video"** on a YouTube, Vimeo or Dailymotion page, through the yt-dlp tool, downloaded and checked on first use.
- **Files judged by their content**, converted when needed (image to PNG, a video's sound extracted as is) and assigned at once.
- **Trim a sound**: waveform, start and end, closing fade, for a presentation tune of the right length.

### Table sounds

- **"Table sounds"**: listen to the PuP-Pack's music and the sound of its videos, and make one the game's presentation music or launch sound; the original stays in the pack.

### Record a game for the wheel

- **"Play and record"**: Cyber Pinball films the game (the playfield, and optionally the backglass and the display), from the chosen moment (0 to 60 s) for the chosen length (15 to 90 s), with sound. The playfield is filmed in 4K by default (1440p, 1080p or 720p if you prefer, also in System > "Media, sound and attract mode").
- **A discreet indicator**, left out of the video: "Recording in 7 s", "REC 0:12 / 0:30".
- **Back in the menu**: "Use for the wheel", "Keep aside", "Play and record again" or "Discard the recording".

### Media doctor and import from another frontend

- **The media doctor** flags an unreadable format, a wrongly named or misplaced item, proportions that don't fit the screen, a very heavy file, duplicates. Its fixes are always safe (rename, move, bin); "Fix all" runs them in a row.
- **"Import media"** from another installed frontend (System menu > "Cyber Pinball" > "Migration"): a plan table by table, the original install is not modified.

## During a game

- **The loading screen**: on the cabinet, the game's loading video alone, full screen; on a desk PC, the video with the game's controls beside it.
- **A slow table says so**, on a desk PC: after 8 s, the loading panel gives the step actually seen (VPX running, its windows open), the elapsed time, and how to stop (Ctrl+Shift+K or Exit). Never a made-up percentage; on the cabinet, the loading media stays alone.
- **The menu's windows never take control from VPX**; a notification for an invitation, a friend or a game with friends shows over it without stealing focus.
- **Ctrl+Shift+K stops a game that hangs**: a polite close, then forced after 5 s.
- **A game that fails says why**: an error in the table's script (line and message) or a VPX exit explained, and Start plays the table again or opens "What's missing to play".
- **Old scripts fixed** without modifying the table (for example a `vpmInit` called twice, which VPX 10.8 rejects).
- **Statistics kept** for each table: number of games, play time.
- **A screen that Windows disconnects then reconnects**, during a game or in the menu, gets its role and its picture back; on returning from a game, each window takes its screen back.
- **VPX on a fresh Windows**: Microsoft's Visual C++ runtime, if missing, is detected and installed (official version, with no window, with Windows' consent); if VPX stops for lack of a library, the failure screen says so.

## Virtual reality and 3D vision

Two features in beta ("BETA" badge in System menu > Cabinet): without the hardware, the entry stays visible, greyed out with its reason.

### Virtual reality

- **The tables in the headset**: with a Meta Quest (through Link or Virtual Desktop) or a SteamVR headset, tables start in the headset when it is ready, otherwise on the screens, never with a VPX question. The backglass shows above the playfield of tables without a VR room, in the part that the table's room leaves visible.
- **The menu in the headset**: between games, the cabinet's screens placed in front of you at their real size (playfield in portrait, DMD, backglass and topper upright), over a plain floor, with a faint halo in the chosen table's tint. Headset on, the PC screens go to rest; headset off, the PC takes over again. During a game, the headset switches to VPX, then comes back to the menu.
- **"Align the cabinet"**: a controller on each corner of your real lockbar, a trigger, and the headset cabinet settles onto it; menu and games then stay in the same place, one alignment per configuration. At a desk, with no real cabinet, it is set once in front of you.
- **The controllers** follow one rule, in the menu as in game: A confirms, B goes back (in game: pause), the thumbsticks move the selection, the triggers are the flippers, the grips the MagnaSaves, X the next collection in the menu; ≡ opens the headset menu. A wizard offers the default buttons of each controller model (Touch, Index, Vive, Windows Mixed Reality), then lets you choose them one by one.
- **Pause in game**: Resume or Quit, on the scene's backglass; holding Pause for 1.5 s fills a circle and leaves the game.
- **For spectators**, the playfield screen shows what the player sees. The sound goes through the headset's earphones.
- **A smooth game**: VPX gets a graphics profile suited to the machine's card, Air Link over Wi-Fi is flagged, and each game logs its smoothness. Headset off or Link cut, the game closes and the menu comes back to the PC screens.

### 3D vision

- **The perspective follows your head**, like a window opened onto the playfield. A plain webcam is enough; a Kinect for Xbox 360 does even better and aims at your head by itself.
- **The Kinect driver in one click**: choosing "3D vision" downloads it from Microsoft, with the kit that accepts a Kinect for Xbox 360, and installs it with no window, with Windows' consent. When the Kinect refuses to start, the screen gives the real reason (not supported, no power, USB port saturated, Windows memory integrity…).
- **A dedicated screen** says where the sensor stands, lets you try it without launching a table, and sets "Calibrate the playing position", "Intensity" (25 to 150%) and "Responsiveness". In game, both MagnaSaves offer "Recenter the 3D view" and the intensity; after each game, a summary says whether VPX followed your head properly.
- **Camera pictures never leave the PC.**

## A cabinet that looks after itself

<p align="center"><img src="images/en/health.webp?v=794ac8eb14" width="360" alt="Cabinet health: 1 blocking, 2 to check, 3 OK. Disk space is fine, Midnight Circuit won't start because its ROM is missing, VPinMediaDB has media for 2 tables, the living-room cabinet is recognised with all 4 screens, tables are the right way round with the flippers at the bottom, and a newer VPX is available."></p>

### Cabinet health

- **One page**: the PC and Windows, disk space, tables that don't start, PuP-Packs (incomplete ones included), missing media, screens, the VPX version, the Visual C++ runtime and the headset, each "OK", "To check" or "Blocking".
- **Each line opens the screen that fixes it**, and its "Back" returns to the page.
- **Checked automatically** 15 s after start-up then every 30 minutes, never during a game, without starting VPX or downloading anything.

### Tech sheet and report

- **System menu > Cabinet > "Tech sheet"**: the PC, Windows, the screens, the controllers, the software and Cyber Pinball on one page, six blocks each with its state in words; Start opens the details and the menu entries that fix things.
- **What you see at a glance**: the disks and their free space, the graphics card and its driver version, each screen with its role, resolution, connection and refresh rate, the buttons and DOF controllers, the VPX plugins and their state.
- **Points to check, explained**: a screen set below the refresh rate it accepts (a 4K at 60 Hz that accepts 144 Hz), a pending Windows restart, "Power saver" mode, an old graphics driver, little memory. They also show up in the cabinet health, in the "PC and Windows" group.
- **Send a report** with no e-mail software: to the connected phone (download, prepare an e-mail, copy the summary), to a USB stick, as a summary to a friend through messaging, or into a folder on the cabinet. "Describe the problem" adds your own words, and "See what the report contains" shows each file.
- **Anonymised before writing**: no user name, no PC name, no IP address, no friends' names, no screen serial numbers.

<p align="center"><img src="images/en/tech-sheet.webp?v=be70aa361a" width="360" alt="The cabinet's tech sheet: the PC, Windows, the screens, the controllers, the software and Cyber Pinball, each block with its status (OK or To check), then Send a report and Cabinet health."></p>

### The table doctor

- **"Diagnose and fix"** explains in plain words why a table doesn't work, and fixes what it can: a ROM misplaced or scattered, a PuP-Pack switched off by its script or badly set up, a wrongly named backglass, a table drawn the wrong way round, framing imposed by the table.
- **Nothing is deleted**: replaced files go to Cyber Pinball's bin.

### Backups

- **On a USB drive, a disk or a network drive**, at its root or in the folder of your choice: settings and scores (a few MB), the tables too, or the whole installation. What has not changed is never copied again, and every file is read back and checked.
- **Restoring shows the plan first**: what will be replaced, put back or kept, part by part. The earlier state goes to the bin, and "Annuler la dernière restauration" (Undo the last restore) puts it back.
- **From one cabinet to another**: another cabinet's backup does not bring over its screens or its identity on the friends network by default.
- **Automatic** (off by default): settings and scores every day or every week, as soon as possible (the first time the cabinet is free) or at the chosen time; a game started takes priority. Copied to the drive as soon as it is plugged in.

### Cabinet schedule

- **Like an arcade** (off by default): at night, the cabinet dims its screens (a 50 to 85% veil, or black screens) and goes quiet in attract mode.
- **Automatic stop** at the chosen time (sleep or shut down), only if nobody is playing, after a 30 s warning any button cancels.

<p align="center"><img src="images/en/features/arcade-hours.webp?v=c5fbf2cc1f" width="360" alt="Cabinet schedule: start and end of the night, screens during night-time attract mode, automatic stop and stop mode, and what can wake the cabinet."></p>

### Guest mode

- **For a party or the kids**: guests can only choose a table, play, and read its flyer and rules.
- **Closed**: the system menu, the settings, the Windows desktop, any action that changes, fixes or downloads. A closed door just says "Locked · guest mode".
- **Unlocking**: both flippers and both MagnaSaves held for 3 s, with a ring filling up. The mode stays on after a restart.

<p align="center"><img src="images/en/features/guest-mode.webp?v=f78e4b29b2" width="360" alt="Guest mode: unlocking with both flippers and both MagnaSaves held for 3 seconds, what stays closed, and Turn on guest mode."></p>

### Dedicated cabinet and launch at startup

- **"Dedicated cabinet"** (off by default): the Windows session opens straight on Cyber Pinball, with no desktop or taskbar, and a watchdog restarts it if it closes. On Windows Pro and Home as on Enterprise and IoT.
- **"Launch at startup"**: Cyber Pinball opens with Windows, the desktop hidden behind it.
- **Taskbars hidden for the whole session** on a cabinet launched at startup; they come back on the Windows desktop (Ctrl+Shift+D) and when quitting, and by themselves after an abrupt stop.
- **Relaunch with Start**: when Start is a joystick button (Pinscape, encoder in gamepad mode), a 2-second long press reopens Cyber Pinball from Windows, or brings the menu back from the Windows desktop. A small windowless process keeps watch, set in System menu > Cabinet > Relaunch with Start.
- **Every Windows setting backed up** before writing; turning it off puts it back as it was and checks it, and a rescue script does the same outside Cyber Pinball.

<p align="center"><img src="images/en/features/dedicated.webp?v=d9f78b1d3a" width="360" alt="Dedicated cabinet: off, what's needed before turning it on, two ways to choose from (replace the desktop, launch at Windows startup), and the rescue to reach Windows."></p>

### Shut down, sleep, restart

- **From the "Cyber Pinball" section**: a confirmation, then the settings are saved and every screen turns black, never showing the desktop. On waking, the menu comes back as it was.
- **"Restart Cyber Pinball"** restarts the software alone, without restarting the PC: after a setting changed outside the menu, a screen or a controller plugged back in.

### Language

- **English or French**, everything included (menus, wizard, VPX settings, browser, messages), with dates and numbers to match: System menu > "Cyber Pinball" > "Language / Langue".

<p align="center"><img src="images/en/features/language.webp?v=7f8e62676a" width="360" alt="Language / Langue: Français or English, each language in its own words."></p>

### Next to another frontend

- **Installs next to another cabinet frontend** without changing anything of its own: its own copy of VPX, its ROMs and their memory.
- **Waits for another open frontend to close** before starting or launching a game, and warns before rotating a screen in Windows.

### Log

- **An application log** (`data\logs\journal.txt`): everything it does, dated, to understand afterwards what happened on a cabinet. An error never freezes the cabinet on a dialog box.
- **Incidents kept apart** (`data\logs\erreurs.txt`): errors caught and crashes. A menu window that crashes is reloaded instead of staying black; on a dedicated cabinet, a frozen Cyber Pinball is restarted by itself.

## Current limitations

Cyber Pinball is an early prototype (0.1.x). What isn't there yet:

- **Windows only**, and only Visual Pinball X 10.8.1 in plugin mode: no classic mode, no other emulators for now.
- **Unsigned installers**: Windows SmartScreen warns when you install.
- **Real DMDs** (ZeDMD, PIN2DMD, Pixelcade): driven by VPX during games, not by the menu yet.
- **Knocker**: it doesn't fire yet for a high score beaten on a table whose ROM keeps its high scores (the scoreboard, for its part, reads them after every game).
- **Virtual reality and 3D vision** are in beta. The Kinect for Xbox One is recognised, but not supported yet.
- **Avatars**: only a picture of your own, no ready-made avatars yet; an animated picture becomes still.
- **Guest mode** doesn't lock Windows itself (Windows key, Alt+Tab).
- **Games with friends**: behind two very closed connections (CGNAT, 4G) with no third cabinet to relay, the link may fail. Some tables don't report their number of balls: their score is not judged on it.
- **Windows scaling** other than 100%: positions may shift (the wizard flags it).
