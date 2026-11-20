[Français](../manuel/acces-direct-aux-menus-depuis-le-telephone.md) · English · [Manual contents](../manual.md)

## Direct access to menus from the phone

In the menu, the phone page has a single bar at the top and five tabs at the bottom: **Écran** (Screen), **Menus**, **Juke-box**, **Communauté** (Community: Messages, Players, Rooms and Scores) and **Boutons** (Buttons) (next sections).
It opens on Screen, then keeps the last view chosen.
No need to step through the menu with the arrows any more: you tap what you want.

- **Top bar**: the Cyber Pinball icon (the one of the Home screen shortcut), the screen open at the cabinet and what is chosen on it (in Community, its title and the unread messages; in a conversation, the friend), the link dot, in Community the recent activity bell, then **"Clavier"** (Keyboard), which appears only when the cabinet is waiting for input (it opens the phone keyboard), and the **⋮** menu: "Retours et propositions" (Feedback and ideas), "Nous suivre" (Follow us; its links open straight on the phone, with no QR code), "Envoyer un fichier à la borne" (Send a file to the cabinet), "Ajouter à l'écran d'accueil" (Add to Home screen), "Déconnecter ce téléphone" (Disconnect this phone).
  The three big bottom buttons (Keyboard, Send, More) no longer exist in the menu; in the built-in browser, the toolbar stays (Back, Forward, Keyboard, More, Close).
- **Bottom tabs**: a slim bar, the icon in its pill (filled, in signal green, on the open tab) and the label below; the red dot on Community flags an unread message.
  During a game, an unavailable tab is greyed out, its reason ("Après la partie", After the game) in place of the label.

- **Screen**: the entries of the screen open at the cabinet, in its order, with their icon, their detail and their red dot.
  The cabinet's current choice is in green.
  Tapping an entry does what a click on the cabinet does (`library.ts`, `remoteEntries` → `handleAction`): the cabinet finds the item by its identity, even if the list has moved.
  A flipper pressed at the cabinet moves the green marker without redrawing the list.
  On the table menu, the list shows the tables of the collection on display (and the Jukebox medallion): tap a table to choose it on the wheel, then again to press Start (its sheet, or the game if Start plays directly).
  A choice list of the on-screen keyboard (the manufacturer) can be tapped too.
  A question ("Quitter Cyber Pinball ?", Quit Cyber Pinball?) or a message has its Start and Exit entries.
  A section the cabinet draws as chips (the canned phrases of "Écrire dans le salon" (Write in the room) and "Répondre" (Reply), the reactions) becomes a strip of chips, side by side on at most two lines, which scrolls to the right when there are more; the reactions are on a line of their own, above the phrases.
- **What's new**: the cabinet's timeline, narrowed to the width: the date and version heading each day, the thread and dot of each line (green while it is new), its title, its "Nouveau" (New) and "BÊTA" (BETA) badges, its description, its reactions at a glance and its small preview.
  An opened news item shows its date and version, its preview, its full text and where to find it.
  Its seven reactions are chips side by side, each with its emoji and the number of players who picked it, yours highlighted; a tap reacts, like Start at the cabinet.
  The previews are the ones shipped with the application, served under their name (`nouveautes/<name>-<language>.webp`): no other file.
- **Menus**: every menu of the cabinet, arranged like the system menu (`packages/core/src/remote-menus.ts`, `remoteMenuTree`) and preceded by "Menu des tables" (Table menu).
  A section opens on the phone (its path at the top, the arrow goes up); the cabinet does not move while you browse.
  An entry opens **directly at the cabinet**, as if it had been chosen in its section (its "Retour" (Back) leads there), and the phone switches to Screen to show what just opened.
  The tree is not copied by hand: it comes from the system menu's, with the entries the cabinet really provides, their detail and their unavailability.
  A menu added later to the system menu therefore shows up on the phone by itself.
- **Table menu**: each table has the **medallion of its wheel** on the left, the green ring on the chosen table.
  The button at the top gives the **collection** shown and its number of tables; tapped, it opens the list of collections (the shown one in green) and chooses one at the cabinet, like MagnaSave or a click in the collection list (`collections.choose`).
  In guest mode, the imposed collection does not change: the button carries a padlock and the sheet says why.
  The button next to it switches to the **grid**: two columns, the backglass image of each table, its medallion in the corner (without a backglass image, the medallion large); the choice is kept on the phone.
- **Table images, always up to date**: nothing is prepared in advance.
  Each time the screen is sent, the cabinet reads the images from each table's media, the same as its wheel's (`MenuMedias.wheel` for the medallion, `roleMedia(…, 'backglass')` for the backglass): a table added, a media file downloaded or replaced shows up on the phone without doing anything.
  They go under a token (`/images/<token>`), reduced by the cabinet (medallion 128 px, backglass 360 px; PNG kept as PNG for a medallion's transparency).
  The backglass image is only read when the phone shows the grid (`grid` message): the list does not trigger the extraction of the whole library's `.directb2s` files.
- **Buttons**: the cabinet's buttons, as before (section "The phone as a remote for the menu").
- **Unavailable**: a greyed-out entry keeps its reason under its label.
  It can still be tapped and does what Start would do at the cabinet, which says so again.
- **States**: "Chargement de l'écran…" (Loading the screen…) while waiting for the cabinet; "Opération en cours" (Operation in progress) with what is happening, nothing to tap; "Rien à toucher sur cet écran" (Nothing to tap on this screen) with what to do (the Jukebox is driven with the buttons); cabinet cut off or Cyber Pinball closed, the link message replaces everything.
- **During a game**: nothing changes, VPX has the buttons.
  Only the **in-game settings** are reachable: "Ouvrir les réglages en partie" (Open the in-game settings) opens them like both MagnaSave buttons.
  The list then shows their lines (a blocked line is greyed out with its reason), the phone's buttons drive them, and Menus is greyed out ("Après la partie", After the game), like Buttons while the settings are closed; Scores stays open.
  "Reprendre la partie" (Resume the game) closes the settings.
  In the headset, the button is greyed out: the settings open in the headset there.
- **Guest mode**: the list only shows what the cabinet shows the guest (the actions already filtered by the doors, `GUEST_DOORS`), and every tap goes through the same doors.
  Menus is locked with its reason, only "Menu des tables" remains; the cabinet refuses to open a system menu entry, even when asked by hand.
  The in-game settings are greyed out ("Fermés en mode invité.", Closed in guest mode.).
  The phone never unlocks anything.
- **Security**: the phone only sends identifiers.
  For an entry of the screen, the rank and the version of the screen it received (`pick`): a rank from an outdated screen is ignored.
  For a menu, its identifier in the tree (`open`): letters, digits and hyphens only, 40 at most, checked by the cabinet (`remoteMenuTarget`); an unknown identifier is ignored, and anything that looks like a path cuts the link.
  What goes to the phone is bounded: shortened labels and details, icons from the registry, 1500 entries at most (`REMOTE_ENTRIES_MAX`), never a path or a key.
  The log only records the identifier of the menus asked for.
- **Phone page**: `body[data-view]` (`list`, `menus`, `buttons`, and for Community `messages`, `friends`, `room`, `ranks`, `thread`, `profile`, `page`); `body[data-ingame]` during the in-game settings.
  Targets of 48 px at least; text of 15 px at least, except the bottom tab labels (12 px at least, under their icon), as the mockups approved on 11/11/2026 want; down to 320 × 568.
- **Tests**: `remote-menus.test.ts` (the tree follows the system menu's in its order, an entry not provided is not there, bounded messages, checked identifiers, the same doors as the cabinet, every section drawn apart at the cabinet classified for the phone, a news item's timeline and page); `telecommande.test.ts` replays an off-screen scenario: the real table management and the real phone page, entries tapped, the marker following the flippers, a section browsed then an entry opened at the cabinet, the refusals (outdated rank, unknown menu, path), the wheel, guest mode, an operation in progress, a game and its settings, three screen sizes, the cabinet cut off, no key in the log.
