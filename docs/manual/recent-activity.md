[Français](../manuel/activite-recente.md) · English · [Manual contents](../manual.md)

## Recent activity

A notification stays only a few seconds, is shortened to fit its line, waits for the end of a game ("Masquer les notifications pendant les parties" (Hide notifications during games)) or melts into a summary ("4 nouveautés" (4 new notifications)): seen too late, it was lost.
**Menu système (System menu) > Activité récente (Recent activity)**, at the top of the system menu root, keeps them all, in full.
It is also filed in the Cyber Pinball section, since it covers everything, not only friends.

- **What goes in**: every notification event, as soon as it arrives, whether it showed or not (a friend coming online or starting a game, their record, their badge, a friend request received or accepted, an invitation and its end, a guest accepting, declining or leaving, a game with friends finished or cancelled, a download finished or blocked); a newer version of Cyber Pinball found in the background (once per version), the update done or failed at startup; the startup notices that name a screen (backup restored, cabinet configuration recognized, DMD screen to check, Windows firewall).
  The immediate answer to a gesture (orientation handed back, simulated sleep) does not go in.
- **The screen**: grouped by day ("Aujourd'hui" (Today), "Hier" (Yesterday), then the date), the most recent at the top.
  Each line has its notification's icon, or the badge of the player it is about, its full text, nothing shortened, its time, the friend's state ("En ligne" (Online)) and, below, what Start does ("↩ Start : voir sa fiche" (see their page), "répondre à l'invitation" (answer the invitation), "voir les résultats" (see the results), "ouvrir les téléchargements" (open downloads), "voir la mise à jour" (see the update)).
  An action that no longer holds stays visible, the line greyed and its reason instead: "✕ Invitation expirée" (Invitation expired), "Partie terminée" (Game over), "Retiré de la liste des téléchargements" (Removed from the download list), "N'est plus dans vos amis" (No longer among your friends).
  A blocked download has the red cross of blocking states.
  "Retour" (Back) returns to the screen you came from; back from an action, the line you left is chosen.
- **Grouped**: what repeats during the day is a single line: "Chloé : 3 connexions" (Chloé: 3 sign-ins), with the times ("À 21:31, 19:02 et 14:10" (At 21:31, 19:02 and 14:10)), "Bruno : 2 parties lancées" (Bruno: 2 games started) on the same table, "Téléchargement bloqué 2 fois" (Download blocked 2 times).
  The same event said again (a reading that comes back, a record sent again by a friend reconnecting) does not count twice.
- **Kept**: the last 50 lines, from one start to the next (`<données>\activite.json`); beyond that, the oldest already read go first.
  An unreadable file is set aside, never overwritten.
  "Effacer l'activité récente" (Clear recent activity) empties the list after a question (Annuler (Cancel) chosen first); friends, downloads and games stay.
- **Unread**: what the notification did not say in full: held during a game or in the system menu, expired, melted into a summary.
  What a notification or a banner said is read: a sign-in, a finished download, "Cyber Pinball 0.1.9 est installé" (Cyber Pinball 0.1.9 is installed) on restart.
  Only errors stay unread even when said, until they are seen here.
  A line is seen when the cursor rests on it (not everything at once on opening); its marker, the red dot and the word "Non lu" (Unread), stays until you leave the screen, and the subtitle counts the lines unread on opening.
  Menu notifications set to "compteur seul" (counter only) or "coupées" (off): what no longer shows is recorded as already read, except games with friends and errors.
- **Never a red dot**: unread is marked in the screen only, and the entry says "<n> non lues · …" (<n> unread · …).
  What awaits an answer already has its dot where you answer it: friend requests and invitation in Amis (Friends), finished or blocked download in Téléchargements (Downloads), available version or update that did not go through in "Mise à jour de Cyber Pinball" (Cyber Pinball update).
  Doubling it here made two dots for one thing, or a dot for nothing (an installed update, a friend signing in), and, the entry then being filed under Amis (Friends), an update dot that rose through the Friends section.
- **From the tables menu**: the "4 nouveautés" (4 new notifications) summary opens Recent activity, which says each one in full; "Retour" (Back) returns to the tables menu.
  A single notification keeps its direct action (My friends, Friend requests, Downloads, the game with friends).
- **Guest mode**: the screen is closed, like the whole system menu; the summary does not lead there.
- **Code**: the log in `packages/core/src/activity.ts` (`addActivity`, `trimActivity`, `markActivityShown`, `markActivityRead`, `activityText`, `activityAct`, `loadActivity`); the screen and what each line does in `app/src/activity-menu.ts`; each event recorded by `app/src/menu-notices.ts` (`activity`), the notification that says it in full marking it read (`NoticeTick.entered`).
- **Tests**: `packages/core/src/test/activite-recente.test.ts` (full text, grouping within the day and repeats, the 50-line limit, file kept and set aside, unread and summary, every kind in French and English, the real queue on every screen, the screen with its greyed lines and its actions, the line seen under the cursor).
