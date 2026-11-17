[Français](../manuel/communaute-au-telephone.md) · English · [Manual contents](../manual.md)

## Community on the phone

The **Communauté** (Community) tab of the phone page gathers **Messages**, **Amis** (Friends) and **Scores** (previous section), as three buttons under the top bar.
It keeps the last one opened.
Messaging there is the same as at the cabinet (System menu > Friends > Messages): the cabinet chooses, formats and translates everything (`app/src/chat-menu.ts`, `remoteCommunity`); the page only draws (`app/renderer/telephone/telephone-community.js`).

- **Messages**: the conversations in the cabinet's order (most recent first, then friends without a message, then former friends whose conversation stays readable), with the friend's avatar and presence mark (green online, blue in a game, hollow offline), the last message ("Vous : …", You: …), its time, and the number of unread messages.
  A refusal or messages waiting are written under the conversation, in amber.
  The red dot on the tab, and the number on "Messages", count the unread messages of all friends.
- **Friends**: the same friends, online first, with their presence spelled out ("En partie : Neon Abyss", In a game; "Vu il y a 2 h", Seen 2 h ago).
  A tap also opens the conversation.
- **The conversation**: full screen, without the tabs (the phone keyboard comes up there); the friend, their avatar and presence in the top bar, with the way back to the conversations.
  The friend's messages on the left, mine on the right in green, dashed while they wait for the friend's connection, amber if they were not delivered; days and the friend's events (records, badges) in the middle; reactions under their message.
  It is the same conversation as at the cabinet (`threadItems`, shared by both).
  The status line says what will happen to what you write ("Nova est en ligne", online, offline, refusal); above the field, the reactions to the last message received and the ready-made phrases, in one tap.
  **Typing**: under the last message, who is writing right now, the friend or the members of a group (the nicknames, three at most then "+2", and three dots lighting up one after the other); the same under the room and the in-game chat (see "Typing" in [Friends: the cabinet network](friends-the-cabinet-network.md#messaging)).
  The phone's field sends it in turn (`typing`, once a second at most while text remains, the cabinet relaying only one every 3 s) and stops it when it is emptied, the message sent or the thread left; the cabinet checks the friend, the group or the room.
  Opened on the phone, the conversation is read, as at the cabinet.
- **Writing**: in the menu, and during a game if "Messagerie au téléphone pendant la partie" (Messaging on the phone during a game) allows it.
  The field, 500 characters at most, goes through the cabinet, which checks the friend, the text and the reaction (`chat-send`, `chat-react`).
  Unable to write (sharing off, messaging disabled, former friend): the field is greyed out and the reason shows in place of the status line.
- **Unavailable**: sharing off or messaging disabled, Messages and Friends say so ("Messagerie indisponible", Messaging unavailable, with the cabinet's reason); in guest mode, messaging is closed on the phone ("Fermée en mode invité.", Closed in guest mode), as at the cabinet.
- **What goes to the phone**: only what is displayed: names, presence, texts, times already formatted, and each friend's public key (the one used to write to them, as for the in-game conversation).
  Avatars under a token (`/images/<token>`).
  The phone only sends the key of the open conversation (`chat-open`, 64 hexadecimal characters, or nothing for the list), the text and the reaction.
- **Updates**: the cabinet sends the list and the open conversation when they change (a message received, a presence), at most every 1.5 s (`MENUS_MS`), and right after a message sent.
- **Tests**: `telecommande.test.ts` replays Community in the off-screen rankings scenario (`demo-telephone-scores`): the dot and the number of unread messages, the top bar, the friends' order, the open conversation (the cabinet receives only the friend's key), bubbles on both sides full screen, a quick phrase and a written message reaching the cabinet, the way back closing the conversation.
