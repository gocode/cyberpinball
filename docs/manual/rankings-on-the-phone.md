[Français](../manuel/classements-au-telephone.md) · English · [Manual contents](../manual.md)

## Rankings on the phone

The **Scores** view of the phone page (Community tab) shows the scoreboard of every table, exactly as at the cabinet (table sheet > "Tableau des scores", Scoreboard): the scopes **Cette borne** (This cabinet), **Amis** (Friends), **National** and **Mondial** (World), the four periods (all time, this year, this week, today), the rank, the flag, the player's avatar with its presence mark, the name and the score.
Read only: "Masquer un score…" (Hide a score…) stays at the cabinet.

- **Which table**: the one the cabinet chose on the wheel, or launched during a game, opens by default, marked "À la borne" (On the cabinet); the page follows it when the wheel turns.
  The table button, at the top, opens the list of all the tables (a "Chercher une table" (Search for a table) field beyond eight); another table chosen there stays, even when the wheel turns, until the cabinet's table is chosen again.
- **Scope and period**: on first opening, the **Mondial** (World) ranking for **Cette semaine** (This week), as at the cabinet (table sheet > "Tableau des scores", `app/src/scores-choice.ts`); without a world ranking (sharing disabled), **Cette borne** (This cabinet).
  A scope or period tapped is kept by the phone (browser storage, `cyberpinball.scores`) and reopens the view next time.
  At the cabinet, the last choice (click, flippers, MagnaSave) is kept in `<data>\tableau-des-scores.json` (Settings part of backups), for all tables; a kept choice reopens as is, with its reason if its ranking is missing.
- **Nothing computed separately**: the cabinet sends what its own scoreboard shows (`app/src/remote-ranks.ts`, which reuses `scoreboardView` and `rankingScoreboardView` from `scoreboard-menu.ts`, with `table-scores.ts` and `table-rankings.ts`): the same lines, the same numbers of games or players, the same place, the same note (version compared, scores not published, offline), the same legend of the presence marks.
  The texts are translated at the cabinet.
- **Unavailable**: a scope whose ranking cannot be shown is greyed out; chosen, it says why, as the cabinet does: "Pays non choisi : Amis > Partage et réseau" (Country not chosen), "Aucun ami pour l'instant" (No friend yet), "Partage désactivé" (Sharing turned off), "Empreinte de la table en calcul…" (Table fingerprint being computed…), "Version de la table illisible : pas de classement" (Table version unreadable: no ranking).
  Offline, the network rankings stay readable from the scores already received, and the note says so.
  A period without games says what the cabinet says ("Aucun score pour l'instant", No score yet; "Aucun score cette semaine", No score this week…).
- **Board**: one shared grid, as at the cabinet: rank, flag, avatar, name and score in the same columns on every line, to the pixel (the rank and the score as wide as the longest, in fixed-width digits), the first place and my line marked, my line beyond the top places set apart by a dotted rule.
  With no room for the date, a tapped line opens a sheet with its rank and score, when, the country and the presence in words ("Vu il y a 2 h", Seen 2 h ago).
  My place in this ranking, the note and the legend follow the board.
- **Updates**: while the view is open, the cabinet sends the board again when it changes (a game over, a score received from another cabinet, a presence), at most once a second; once the view is left, it stops reading it.
- **During a game**: the Community tab stays open, and Scores on the launched table; Screen shows the game; Menus and Buttons are greyed out ("Après la partie", After the game), Buttons coming back with the in-game settings.
- **Guest mode**: the rankings stay readable (the cabinet shows them to the guest, door `sheet.scores`), on the tables of the imposed collection.
  If the cabinet closed them to the guest, the page would say "Classements fermés" (Rankings closed), with the reason.
- **What goes to the phone**: only what is displayed.
  A table is a rank in the list sent (`ranks-tables`, whose version changes with the lines); never a path, a file or a player key.
  The flags come from the cabinet (`/drapeaux/<code>.svg`, two letters); an avatar, under a random token (`/images/<token>`, `app/src/remote-images.ts`), valid while the remote lives: the cabinet serves no other file.
  The tokens all come from the remote, the only one that serves them (`phone-remote.ts`, `images`): the rankings must receive it, no view can hand out a token the cabinet would not serve.
  The page never reaches any host other than the cabinet.
- **Messages**: the phone asks `ranks` (scope, period, and the rank and version of the list, or nothing for the cabinet's table), then `ranks-off` when leaving the view; an unknown scope or period cuts the link, a rank from an outdated list is ignored.
  The cabinet answers `ranks-tables` then `ranks`.
  Everything goes through the remote's sealed link.
- **Phone page**: `app/renderer/telephone/telephone-ranks.js`, `body[data-view='ranks']`.
  Scopes as underlined tabs, periods two per row (like the cabinet in portrait), green on the open scope and period.
  The panel scrolls, never the page; targets of 48 px at least, text of 15 px at least, down to 320 × 568.
- **Tests**: `telecommande.test.ts` replays an off-screen scenario (`demo-telephone-scores`): the real scoreboard on a simulated cabinet network and the real phone page; the cabinet's table by default, followed when the wheel turns; another one from the list; every scope and every period compared with what the cabinet shows; flags, avatars and presence; the scopes greyed out with their reason; offline; a table without games; guest mode; a game; the refusals; nothing but what is displayed on the phone; three screen sizes and the layout guard; the cabinet cut off.
