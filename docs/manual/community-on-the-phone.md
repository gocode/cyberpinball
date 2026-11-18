[Français](../manuel/communaute-au-telephone.md) · English · [Manual contents](../manual.md)

## Community on the phone

The **Communauté** (Community) tab of the phone page has four tabs under the top bar: **Messages**, **Joueurs** (Players), **Salons** (Rooms) and **Scores** (previous section).
It keeps the last one opened.
The number of unread messages is a capsule in the corner of "Messages", whose label is never cut off; the red dot on the Community tab counts the same ones.
The Community there is the same as at the cabinet (System menu > Community): the cabinet chooses, formats and translates everything (`app/src/chat-menu.ts`, `community-menu.ts`, `groups-menu.ts`, `instant-menu.ts`, `rooms-menu.ts`, `phone-community.ts`); the page only draws (`app/renderer/telephone/telephone-community.js`, `telephone-groupes.js`, `telephone-niveau.js`).

- **The bell**: in the top bar of the four tabs, with the number of unread notifications ("99+" beyond that).
  It opens the cabinet's recent activity in a sheet, day by day, each line with its time, the friend's state and its full text; a line that no longer holds is greyed out with its reason (see [Recent activity](recent-activity.md#recent-activity)).
  A tapped line leads to its screen: a friend's or a group's thread, a profile, Players (a friend request received) or a room open on the phone; the rest opens on the cabinet, and the phone switches to Screen.
  "Effacer l'activité récente" (Clear recent activity) empties the log after a confirmation on the phone; your friends, downloads and games stay.
- **Messages**: at the top, "Créer un groupe" (Create a group) and "Groupes publics" (Public groups); then the group invitations you received (who invites, the group, Accept, Decline); then the conversations.
  Creating a group opens on the cabinet, and the phone switches to Screen: the name is typed there with the phone's keyboard.
  Your groups come first among the conversations (their avatar carries the group's initials), then the friends in the cabinet's order (most recent first, then friends without a message, then former friends whose conversation stays readable), with the friend's avatar and presence mark (green online, blue in a game, hollow offline), the last message ("Vous : …", You: …), its time, and the number of unread messages.
  A refusal or messages waiting are written under the conversation, in amber.
- **Public groups**: full screen, the number of groups in the top bar.
  A field searches a group by its name; each group has its name, its members as avatars, "Rejoindre" (Join) and "Aperçu" (Preview: its table of the week, its members).
  Your own public groups are marked "Déjà membre" (Already a member); a full group, or one you were removed from, is greyed out with its reason.
  The directory is asked from the linked cabinets when the page opens, and fills up in a few seconds.
- **The conversation**: full screen, without the tabs (the phone keyboard comes up there); the friend, their avatar and presence in the top bar, with the way back to the conversations.
  The friend's messages on the left, mine on the right in green, dashed while they wait for the friend's connection, amber if they were not delivered; days and the friend's events (records, badges) in the middle; reactions under their message.
  It is the same conversation as at the cabinet (`threadItems`, shared by both).
  The status line says what will happen to what you write ("Nova est en ligne", online, offline, refusal); above the field, the reactions to the last message received and the ready-made phrases, in one tap.
  **Typing**: under the last message, who is writing right now, the friend or the members of a group (the nicknames, three at most then "+2", and three dots lighting up one after the other); the same under the room and the in-game chat (see "Typing" in [Community: the cabinet network](friends-the-cabinet-network.md#messaging)).
  The phone's field sends it in turn (`typing`, once a second at most while text remains, the cabinet relaying only one every 3 s) and stops it when it is emptied, the message sent or the thread left; the cabinet checks the friend, the group or the room.
  Opened on the phone, the conversation is read, as at the cabinet.
- **A group's thread**: at the top, its table of the week ("Jouer" (Play) launches it on the cabinet; greyed out with its reason if it is not in your cabinet) and its ranking (the top five, your line marked).
  The author's nickname is above each message.
  The ⋮ menu of the top bar gives the members (a tap opens their profile), "Inviter des amis" (Invite friends; greyed out with its reason when no one can be invited), "Notifications du groupe" (Group notifications, on or muted) and "Quitter le groupe" (Leave the group), after a confirmation.
- **Players**: the cabinet's list (Community > Players online).
  At the top, the friend requests received (Accept, Decline, Profile).
  Then the open instant games: the table, its host, the players as avatars and "Rejoindre" (Join); a game on another version of the table, or on a table you do not have, stays greyed out with its reason.
  Joining happens on the cabinet (the table is checked there, then the host's lobby opens), and the phone switches to Screen.
  Then "Ouvrir une partie instantanée" (Open an instant game): the table picked on the wheel by default, "Changer" (Change) for another one (the cabinet's VPX tables), the number of players, you included, from 2 to 4, then "Ouvrir la partie" (Open the game).
  Then the filters as chips (All, My country, Nearby, Same tables, with their count; a filter that can show nothing is greyed out), kept by the phone, and the players grouped as on the cabinet, each with their avatar, their flag before their name and what they are doing.
- **Your game**: a game opened or joined has its card at the top of Players; "Voir" (See) opens it full screen.
  The taken seats (avatar and nickname) and the free ones, the start, the time it closes if it is not full, "Inviter des amis" (Invite friends) online (only the host invites: otherwise greyed out with its reason), then "Annuler la partie" (Cancel the game; "Quitter la partie", Leave the game, for whoever joined it), after a confirmation.
  The start, the game and the results happen on the cabinet.
- **A player's profile**: tapping a player (in Players, a request, a group's members, a room line) opens their profile full screen, the same as on the cabinet: their avatar, flag, name, level and its bar, their official badges drawn as on the cabinet, their activity with likes (a tap on the star likes or unlikes), their public groups, and what stays reserved for their friends.
  The main actions as buttons, the first in green: send a friend request, write to a friend (the thread opens on the phone), invite them to a game or browse their library (on the cabinet, the phone switches to Screen); a greyed-out action says its reason below.
  Under "Plus" (More): hide their activity, remove them from your friends, block them; removing and blocking are confirmed on the phone.
  The way back returns to the view the profile was opened from.
- **Rooms**: the room is picked at the top, as chips: yours, World, the active ones (with their attendance beyond five), and "Autres pays…" (Other countries…), which opens the list of countries by name.
  This choice belongs to the phone, independent of the room open on the cabinet; writing and canned phrases go to the picked room.
  The last 60 lines, old-style: the time, the nickname in its key's hue, the text, its reactions below; the top bar says the room and its attendance.
  Tapping a line opens its options, as on the cabinet: the seven reactions as chips (yours highlighted, tapping it again removes it), "Répondre à @…" (Reply to @…; the field starts with @nickname), "Voir son profil" (See their profile), "Envoyer une demande d'ami" (Send a friend request; not to a friend), "Ignorer … dans les salons" (Ignore … in rooms), "Signaler ce message" (Report this message) with its reason, "Bloquer …" (Block …); on your own line, "Supprimer ma ligne…" (Delete my line…).
  Blocking and deleting are confirmed on the phone; the cabinet checks that the line belongs to this room, and the status line says what was done ("Signalement envoyé aux modérateurs", Report sent to the moderators).
  A line hidden by moderation is hidden on the phone too ("message masqué par la modération", message hidden by moderation), without its reactions or options.
  The room rules are accepted on the cabinet ("Écrire dans le salon", Write in the room); until then, the field is greyed out with that reason.
- **Phrases and reactions as chips**: in a friend's or a group's thread, the room and the in-game messages, the reactions to the last message received are on a line of their own, above the canned phrases as chips, side by side on at most two lines.
  When there are more, the strip scrolls to the right (a fade at the edge shows it); each chip is a 48 px target.
- **During a game**: the Community stays open.
  What the phone cannot do while a game runs (create a group, play a group's table of the week, join or open an instant game) stays visible, greyed out, with its reason ("Pendant une partie : à la fin de celle-ci", During a game: at its end).
- **Writing**: in the front-end, and during a game if "Messagerie au téléphone pendant la partie" (Messaging on the phone during a game) allows it.
  The field, 500 characters at most, goes through the cabinet, which checks the friend, the text and the reaction (`chat-send`, `chat-react`).
  Unable to write (sharing off, messaging disabled, former friend): the field is greyed out and the reason shows in place of the status line.
- **Unavailable**: sharing off or messaging disabled, Messages and Players say so ("Messagerie indisponible", Messaging unavailable, with the cabinet's reason); in guest mode, messaging is closed on the phone ("Fermée en mode invité.", Closed in guest mode), as at the cabinet.
- **What goes to the phone**: only what is displayed: names, presence, texts, times already formatted, and each friend's public key (the one used to write to them, as for the in-game conversation).
  Avatars under a token (`/images/<token>`).
  The phone only sends the key of the open conversation (`chat-open`, 64 hexadecimal characters, or nothing for the list), the text and the reaction.
  For the rest, it only sends back identities, which the cabinet checks before acting: a player's key (`profile-open`, `profile-act`, `friend-answer`), a group (`group-act`), an instant game (`instant-act`), a room line (`room-open`, `room-act`), the reference of a recent activity line (`activity-act`); a table is a reference, never a path.
- **Updates**: the cabinet sends the list and the open conversation when they change (a message received, a presence), at most every 1.5 s (`MENUS_MS`), and right after a message sent; likewise the profile, the room, the recent activity and a full-screen page, while they are open.
- **Tests**: `telecommande.test.ts` replays Community in the off-screen rankings scenario (`demo-telephone-scores`): the unread capsule, the top bar, the friends' order, the open conversation (the cabinet receives only the friend's key), bubbles on both sides full screen, a quick phrase and a written message reaching the cabinet, the way back closing the conversation, and cut-off labels detected.
  `telephone-communaute.test.ts` (Players and the profile, its actions found again by their identity), `telephone-groupes.test.ts` (groups, public groups, instant games), `telephone-salons.test.ts` (the picked room, gestures checked on a line of that room, the hidden line) and `telephone-scores-niveau.test.ts` (recent activity by day, each line led to its screen) pin down what the cabinet sends and what it accepts.
