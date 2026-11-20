[Français](../manuel/activite-recente.md) · English · [Manual contents](../manual.md)

## Recent activity

A notification stays only a few seconds, is shortened to fit its line, waits for the end of a game ("Masquer les notifications pendant les parties" (Hide notifications during games)) or melts into a summary ("4 nouveautés" (4 new notifications)): seen too late, it was lost.
**Menu système (System menu) > Activité récente (Recent activity)**, at the system menu root, right after Téléchargements (Downloads), keeps them all, in full.
It is filed in no section, since it covers everything, not only friends.

- **What goes in**: every notification event, as soon as it arrives, whether it showed or not (a friend coming online or starting a game, their record, their badge, a friend request received or accepted, an invitation and its end, a guest accepting, declining or leaving, a game with friends finished or cancelled, a download finished or blocked); a newer version of Cyber Pinball found in the background (once per version), the update done or failed at startup; the startup notices that name a screen (backup restored, cabinet configuration recognized, DMD screen to check, Windows firewall).
  The immediate answer to a gesture (orientation handed back, simulated sleep) does not go in.
- **The screen**: grouped by day ("Aujourd'hui" (Today), "Hier" (Yesterday), then the date), the most recent at the top.
  Each line has its notification's icon, or the badge of the player it is about, its full text, nothing shortened, its time, the friend's state ("En ligne" (Online)) and, below, what Start does ("↩ Start : voir son profil" (see their profile), "répondre à l'invitation" (answer the invitation), "voir les résultats" (see the results), "ouvrir les téléchargements" (open downloads), "voir la mise à jour" (see the update)).
  An action that no longer holds stays visible, the line greyed and its reason instead: "✕ Invitation expirée" (Invitation expired), "Partie terminée" (Game over), "Retiré de la liste des téléchargements" (Removed from the download list), "N'est plus dans vos amis" (No longer among your friends).
  A blocked download has the red cross of blocking states.
  "Retour" (Back) returns to the screen you came from; back from an action, the line you left is chosen.
- **Grouped**: what repeats during the day is a single line: "Chloé : 3 connexions" (Chloé: 3 sign-ins), with the times ("À 21:31, 19:02 et 14:10" (At 21:31, 19:02 and 14:10)), "Bruno : 2 parties lancées" (Bruno: 2 games started) on the same table, "Téléchargement bloqué 2 fois" (Download blocked 2 times).
- **Messages, one line per conversation**: a message from a friend, a group message, a mention in a group or in a room never gets a line of its own.
  The messages of one conversation are grouped on one line per day, which says how many and shows the last one: "3 messages de Nova" (3 messages from Nova), "4 messages · Les Flippeurs du Nord", "1 mention · Les Flippeurs du Nord", "2 mentions · Salon France".
  Reading a group's chat also reads its mentions.
  Start opens the conversation ("lire la conversation" (read the conversation), "ouvrir la discussion du groupe" (open the group chat), "ouvrir le salon" (open the room)); the line says what still waits there ("3 en attente" (3 pending)), and becomes read by itself once the conversation is read where it lives.
  A conversation read elsewhere (in Messages, the group, the room or from "Messages en attente" (Waiting messages)) also reads its lines here, without going through this screen.
  No longer a friend, group left, room closed: the line stays, greyed with its reason ("N'est plus dans vos amis" (No longer among your friends), "Vous n'êtes plus dans ce groupe" (You are no longer in this group), "Salon fermé" (Room closed)).
  A group or a room shows its icon, not the pill of its last author.
  While they wait, the same conversations are gathered by the messages pill on the "Messages en attente" (Waiting messages) screen (see [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)); Recent activity keeps their trace once read.
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
  What awaits an answer already has its dot where you answer it: friend requests and invitation in Communauté (Community), finished or blocked download in Téléchargements (Downloads), available version or update that did not go through in "Mise à jour de Cyber Pinball" (Cyber Pinball update).
  Doubling it here made two dots for one thing, or a dot for nothing (an installed update, a friend signing in), and, the entry then being filed under Amis (Friends), an update dot that rose through the Friends section.
- **From the tables menu**: the "4 nouveautés" (4 new notifications) summary opens Recent activity, which says each one in full; "Retour" (Back) returns to the tables menu.
  A single notification keeps its direct action (My friends, Friend requests, Downloads, the game with friends).
  "Messages en attente" (Waiting messages) leads there too, among its shortcuts; "Retour" (Back) then returns there.
- **Guest mode**: the screen is closed, like the whole system menu; the summary does not lead there.
- **On the phone**: the bell in the Community top bar carries the number of unread lines and opens the same log, day by day, in a sheet (see [Community on the phone](community-on-the-phone.md#community-on-the-phone)).
  Each line has its time, the friend's state and its full text; a line that no longer holds stays greyed out with its reason.
  Tapped, it is read and leads to its screen: a friend's or a group's thread, a profile, Players or a room open on the phone, the rest on the cabinet.
  "Effacer l'activité récente" (Clear recent activity) empties it after a confirmation on the phone.
  The phone only receives a reference for each line (`activity-act`), never a player's key.
- **Code**: the log in `packages/core/src/activity.ts` (`addActivity`, `trimActivity`, `markActivityShown`, `markActivityRead`, `activityText`, `activityAct`, `markThreadRead`, `loadActivity`); the screen and what each line does in `app/src/activity-menu.ts`; each event recorded by `app/src/menu-notices.ts` (`activity`), the notification that says it in full marking it read (`NoticeTick.entered`).
- **Tests**: `packages/core/src/test/activite-recente.test.ts` (full text, grouping within the day and repeats, the 50-line limit, file kept and set aside, unread and summary, every kind in French and English, the real queue on every screen, the screen with its greyed lines and its actions, the line seen under the cursor); `packages/core/src/test/messages-attente.test.ts` (one line per conversation, a read conversation reading its lines, the line opening its conversation or greyed).
