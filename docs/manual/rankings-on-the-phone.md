[Français](../manuel/classements-au-telephone.md) · English · [Manual contents](../manual.md)

## Rankings on the phone

The **Scores** view of the phone page (Community tab) shows the scoreboard of every table, exactly as at the cabinet (table sheet > "Tableau des scores", Scoreboard): the scopes **Cette borne** (This cabinet), **Amis** (Friends), **National** and **Mondial** (World), the four periods (all time, this year, this week, today), the rank, the flag, the player's avatar with its presence mark, the name and the score.
Read only: "Masquer un score…" (Hide a score…) stays at the cabinet.
It is, on the phone, the "Tables" door of the cabinet's Leaderboards (Community > Leaderboards > Tables, then a table); the "Joueurs" (Players) door, the ranking of players by their XP, only shows at the cabinet (see "The Community medallion" in [Friends](friends-the-cabinet-network.md#community-the-cabinet-network)), the phone only having your place in My level.

- **My level**: at the top of Scores, a summary: the level in its circle, the tier, the bar and the level's XP, this week's gain as a pill.
  A tap opens My level full screen, as on the cabinet (`app/src/level-menu.ts`, laid out for the phone by `phone-pages.ts`): the bar, the week, this week's rankings, the closest badges drawn as on the cabinet, then "Mes badges" (My badges) and "Comment gagner des XP" (How to earn XP, the scale), which open the same way; the way back returns to the previous page.
  The cabinet sends a page while it is open (`page-open`), without its actions: the phone only reads it.
- **One table / All tables**: a switch at the top, kept by the phone (`cyberpinball.scores-mode`).
  All tables: one line per table, from the same computation as the "Tables" screen of the cabinet's Leaderboards (`rankings-menu.ts`, `remoteTables`), at the chosen scope and period.
  First the last five played ("Jouées récemment", Recently played, with how long ago), then all the others from A to Z; each with its leader (their flag, their score) and your place.
  A table without a ranking stays greyed out with its reason ("Aucun score cette semaine", No score this week; "Empreinte de la table en calcul…", Table fingerprint being computed…); an unavailable scope is greyed out with its reason, as for one table.
  Tapping a line opens that table's scoreboard ("Une table", One table), at the same scope and period.
- **Which table**: the one the cabinet chose on the wheel, or launched during a game, opens by default, marked "À la borne" (On the cabinet); the page follows it when the wheel turns.
  The table button, at the top, opens the list of all the tables (a "Chercher une table" (Search for a table) field beyond eight); another table chosen there stays, even when the wheel turns, until the cabinet's table is chosen again.
- **Scope and period**: on first opening, the **Mondial** (World) ranking for **Cette semaine** (This week), as at the cabinet (table sheet > "Tableau des scores", `app/src/scores-choice.ts`); without a world ranking (sharing disabled), **Cette borne** (This cabinet).
  A scope or period tapped is kept by the phone (browser storage, `cyberpinball.scores`) and reopens the view next time.
  At the cabinet, the last choice (click, flippers, MagnaSave) is kept in `<data>\tableau-des-scores.json` (Settings part of backups), for all tables; a kept choice reopens as is, with its reason if its ranking is missing.
- **Nothing computed separately**: the cabinet sends what its own scoreboard shows (`app/src/remote-ranks.ts`, which reuses `scoreboardView` and `rankingScoreboardView` from `scoreboard-menu.ts`, with `table-scores.ts` and `table-rankings.ts`): the same lines, the same numbers of games or players, the same place, the same note (version compared, scores not published, offline), the same legend of the presence marks.
  The texts are translated at the cabinet.
- **Unavailable**: a scope whose ranking cannot be shown is greyed out; chosen, it says why, as the cabinet does: "Pays non choisi : Mon profil > Modifier mon profil > Mon pays" (No country chosen: My profile > Edit my profile > My country), "Aucun ami pour l'instant" (No friend yet), "Partage désactivé" (Sharing turned off), "Empreinte de la table en calcul…" (Table fingerprint being computed…), "Version de la table illisible : pas de classement" (Table version unreadable: no ranking).
  Offline, the network rankings stay readable from the scores already received, and the note says so.
  A period without games says what the cabinet says ("Aucun score pour l'instant", No score yet; "Aucun score cette semaine", No score this week…).
- **Board**: one shared grid, as at the cabinet: rank, flag, avatar, name and score in the same columns on every line, to the pixel (the rank and the score as wide as the longest, in fixed-width digits), the first place and my line marked, my line beyond the top places set apart by a dotted rule.
  With no room for the date, a tapped line opens a sheet with its rank and score, when, the country and the presence in words ("Vu il y a 2 h", Seen 2 h ago).
  My place in this ranking, the note and the legend follow the board.
- **Updates**: while the view is open, the cabinet sends the board again when it changes (a game over, a score received from another cabinet, a presence), at most once a second; once the view is left, it stops reading it.
- **During a game**: the Community tab stays open, and Scores on the launched table; Screen shows the game; Menus, Juke-box and Buttons are greyed out ("Après la partie", After the game), Buttons coming back with the in-game settings.
- **Guest mode**: the rankings stay readable (the cabinet shows them to the guest, door `sheet.scores`), on the tables of the imposed collection.
  If the cabinet closed them to the guest, the page would say "Classements fermés" (Rankings closed), with the reason.
- **What goes to the phone**: only what is displayed.
  A table is a rank in the list sent (`ranks-tables`, whose version changes with the lines); never a path, a file or a player key.
  The flags come from the cabinet (`/drapeaux/<code>.svg`, two letters); an avatar, under a random token (`/images/<token>`, `app/src/remote-images.ts`), valid while the remote lives: the cabinet serves no other file.
  The tokens all come from the remote, the only one that serves them (`phone-remote.ts`, `images`): the rankings must receive it, no view can hand out a token the cabinet would not serve.
  The page never reaches any host other than the cabinet.
- **Messages**: the phone asks `ranks` (scope, period, and the rank and version of the list, or nothing for the cabinet's table; `all` for all tables), then `ranks-off` when leaving the view; an unknown scope or period cuts the link, a rank from an outdated list is ignored.
  The cabinet answers `ranks-tables` then `ranks`.
  Everything goes through the remote's sealed link.
- **Phone page**: `app/renderer/telephone/telephone-ranks.js` and `telephone-niveau.js` (My level, All tables), `body[data-view='ranks']`.
  Scopes as underlined tabs, periods two per row (like the cabinet in portrait), green on the open scope and period.
  The panel scrolls, never the page; targets of 48 px at least, text of 15 px at least, down to 320 × 568.
- **Tests**: `telecommande.test.ts` replays an off-screen scenario (`demo-telephone-scores`): the real scoreboard on a simulated cabinet network and the real phone page; the cabinet's table by default, followed when the wheel turns; another one from the list; every scope and every period compared with what the cabinet shows; flags, avatars and presence; the scopes greyed out with their reason; offline; a table without games; guest mode; a game; the refusals; nothing but what is displayed on the phone; three screen sizes and the layout guard; the cabinet cut off.
  `telephone-scores-niveau.test.ts`: My level, summary and pages as the cabinet shows them (without their actions); All tables, from the computation of the "Tables" screen, each table by its rank in the list, never its file.
