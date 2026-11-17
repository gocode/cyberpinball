[Français](../manuel/juke-box-au-telephone.md) · English · [Manual contents](../manual.md)

## Juke-box on the phone

The **Juke-box** tab of the phone page drives the cabinet's player, as at the cabinet: it is the same player (`app/src/jukebox-player.ts`), the same playback rules and the same screens, nothing is redone separately.
Browsing on the phone therefore also moves the selection at the cabinet.

- **Closed**: the medallion ("4 playlists · 86 morceaux") and **"Ouvrir le Juke-box"** (Open the Juke-box), which does what Start does on the wheel medallion (same guest-mode doors).
  Hidden from the wheel, or during a game: greyed out, with its reason.
- **Listen** ("Écouter"): the playlists, each with the mosaic of its first covers, its number of tracks, its duration; the equaliser on the one playing.
  A tapped playlist opens (at the cabinet too): its name and the way back at the top, then **Tout lire** (Play all), **Lecture aléatoire** (Shuffle) and **Répétition** (Repeat) as buttons, apart from the tracks, then the tracks with their cover, artist and duration.
  A tapped track plays at once (the cabinet chooses it then presses Start).
  A track not yet playable is greyed out, its reason in amber ("Téléchargement en cours · 40 %", Downloading).
- **Manage** ("Gérer"): the Juke-box management opens at the cabinet (even with the player closed) and shows **in the Juke-box tab**, arranged in zones: the additions as tiles (Import from YouTube, New playlist), the YouTube account state as a status line, then the playlists under their title, each with its thumbnail (its cover, otherwise the disc) and its **⋮**.
  A playlist's options (add files, rename, quality, resync, free up space, delete…) no longer follow the list: the ⋮ chooses the playlist at the cabinet without opening it (`focus` message) and opens its options in a sheet named after it; an unavailable option keeps its reason there.
  The **Listen / Manage** switch always stays visible: "Écouter" (Listen) goes back to the player, which resumes where it was.
  The arrangement comes from the cabinet's screen itself (`library.ts`, `remoteEntries`: each action's section, `zone` and `group`): the Screen view also puts a title before each group, on every screen.
- **Mini player**: as soon as a track plays, above the tabs, everywhere: the cover, the title, "En lecture · 02 / 24" (Playing), Pause and Next, the time bar.
  Tapped, it opens the **player**: the large cover, title and artist, the time (drag to move through the track, like a held flipper), Previous, Play / Pause, Next, Shuffle, Repeat (playlist, track, none).
  During a YouTube ad, Next and seeking are greyed out.
- **Previous / next**: added to the player for the phone (`skip`): next, like the end of the track (shuffle draws the next one), without repeating the same one; previous, the playable track before it in the playlist.
- **What goes to the phone**: what the player shows, the whole list of the open level (`remoteView`, the player view without the cabinet's eight-line window): titles, artists, durations, reasons, modes.
  The covers under a token (`/images/<token>`), **reduced by the cabinet** (160 px for a thumbnail, 120 px for a mosaic tile, 480 px for the large cover, as JPEG; Electron, `nativeImage`): the phone's network stays light, never a path.
  The track time goes separately (`jb-time`); the page advances it by itself, the cabinet only resends it when it drifts (pause, seek, next track).
- **Messages**: the phone sends `jb`: `open`, `row` (a line received), `play`, `up`, `pause`, `shuffle`, `repeat`, `seek` (0 to 1), `next`, `prev`, `manage`, `exit`; a line is its received key (200 characters at most).
  Any other word cuts the link.
  The cabinet passes each command to the player, like a click (`click`), and checks everything.
- **Tests**: `telecommande.test.ts` replays the Juke-box in the off-screen rankings scenario (`demo-telephone-scores`): the playlists without management mixed in, their covers reduced under a token, an open playlist, its buttons apart from the tracks, a greyed track with its reason, a track played in one tap, the mini player, the player and its time, pause, next, seeking, back, "Manage".
