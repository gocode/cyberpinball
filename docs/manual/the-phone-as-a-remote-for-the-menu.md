[Français](../manuel/le-telephone-comme-telecommande-du-front-end.md) · English · [Manual contents](../manual.md)

## The phone as a remote for the menu

Second milestone: the built-in browser's link serves the whole menu.
The phone holds the cabinet's buttons, types instead of the on-screen keyboard and sends a file to the import folder.
What the phone drives follows what the cabinet shows (`RemoteMode`): the site page when "Récupérer" (Get) is open (touchpad, previous section), **the menu** otherwise, nothing during a game.

- **Where the QR code lives**: **System menu > My cabinet > Phone remote** (`app/src/phone-remote-menu.ts`), a panel with the QR on the left and the state on the right ("Connecter un téléphone" (Connect a phone), then the four-digit code and "Comparez les codes" (Compare the codes), then "Téléphone connecté" (Phone connected) and "Déconnecter le téléphone" (Disconnect the phone)); **under the on-screen keyboard**, a "Taper au téléphone" (Type on your phone) strip with a small QR, then the code, then "Le téléphone connecté tape ici" (The connected phone types here) (its height does not change from one state to another: the keys do not move); "Récupérer"'s banner, as before.
  The same pairing everywhere: three-minute single-use QR, code on both sides, **Start accepts, Exit refuses**.
  On these screens, while a phone is waiting, Start and Exit belong to it, never to the screen behind (Start does not type a key on the on-screen keyboard).
  When the screen that showed the code closes, the waiting phone is refused.
  Unavailable (firewall, no local network), the block stays, greyed out with the reason, with no readable QR.
- **How long the link lasts**: it lives as long as Cyber Pinball's menu runs, games included.
  Opening "Récupérer" switches the phone to the touchpad, closing it brings it back to the buttons, without a new acceptance.
  It ends when the phone disconnects ("Plus" (More) > "Déconnecter ce téléphone" (Disconnect this phone)), when it is disconnected at the cabinet, **after 20 minutes without a gesture in the menu** (`REMOTE_IDLE_MS`, game time does not count), or when Cyber Pinball closes (the phone says "Cyber Pinball fermé" (Cyber Pinball closed)).
  With no QR shown and no phone, nothing listens.
- **Buttons**: Start (confirm), left flipper (previous), right flipper (next), Exit (back), MagnaSave (on the wheel, the next collection; elsewhere, a screen's list or actions; the phone's button says which).
  Each is sent pressed then released; the cabinet hands it to the **cabinet's key path** (`frontend.ts`, `remoteButton` → `handleKey`), with that button's key on this cabinet (`interfaceKeys`, `zoneSwitchKeys`): whatever a cabinet button does, it does.
  A held flipper repeats after 0.4 s, every 70 ms (`isAutoRepeat`): the menu speeds up as under a real button, the phone's button says "Défilement rapide" (Fast scroll).
  A held button is released when the finger lifts or leaves the button, when the page goes to the background, when the link is cut, after 20 s at most.
  Top of the page: the screen shown and what is selected on it.
- **Volume**: the remote also sets the sound of Edge and of the applications open on the cabinet.
  It only set the outputs chosen at the "Sound" step (backglass, playfield) while Edge plays on Windows' default output, which may be another one, hence a sound bar and a Mute with no effect; the volume now follows, by the same amount, the default output and every output where a program plays.
- **The phone's Back button** (Android, or the back gesture) steps back through the remote's screens instead of closing it, like the page's own back buttons.
  It closes an open sheet (⋮ menu, reactions…), leaves a conversation, a profile, a full-screen page or the Juke-box player, goes up a section in Menus or out of a playlist in the Juke-box, and brings the other tabs back to Screen.
  On Screen, it goes back on the screen open on the cabinet, as if you touched its back button; when the cabinet's browser is open, it returns to its previous page.
  On the starting screen, there is nowhere left to go back to: it leaves the page, as before.
  In full screen, the first Back leaves full screen, the next one steps back through the screens (`telephone-retour.js`; test: `telephone-retour.test.ts`).
- **The top bar's ⋮ menu**: the keyboard when the cabinet is waiting for input, "Retours et propositions" (Feedback and ideas, opened at the cabinet), "Nous suivre" (Follow us), sending a file, the Home screen, full screen on Android, then "Déconnecter ce téléphone" (Disconnect this phone).
  "Follow us" is a list of links there (the Facebook page in the cabinet's language, the video tutorials on YouTube, GitHub) that the phone opens itself, with no QR code: you are already on the phone (see "Follow us" in [Feedback and ideas](feedback-and-ideas.md#feedback-and-ideas)).
- **Typing**: when the menu opens its on-screen keyboard (title search, player name, configuration name, Art-Net node address, LED count…), the phone opens its keyboard panel **with the cabinet's text** (never a password: the menu asks for none); what is typed replaces that text (`library.ts`, `remoteSet`), a number keeps its digits.
  "Valider" (Confirm) is Enter, "Annuler" (Cancel) is Exit.
  If the text changes at the cabinet meanwhile, the phone takes it over.
  Nothing typed goes into the log.
- **Sending a file**: "Envoyer" (Send) picks a file on the phone.
  The cabinet checks before any transfer: **2 GB at most** (`REMOTE_UPLOAD_MAX`), a non-empty file, disk space (512 MB left free), guest mode (`phone.files` door, closed).
  The name is cleaned (`cleanUploadName`): the last element only, nothing of a path, no character Windows forbids, no dot at the start or end, never a device name (`CON`, `NUL`…), 120 characters at most; a name already taken becomes "(2)".
  The 256 KiB chunks go one after the other over HTTP (`POST /envoi/<transfer>/<rank>`), sealed under the link's key, bound to the connection, the transfer and their rank (`uploadAad`): a chunk replayed, moved, from another connection or addressed to another host name is refused and the transfer dropped.
  The file is written aside (`.envoi-<transfer>.part`, which the import folder ignores), then takes its name in the import folder, never anywhere else; dropped (Cancel, link cut, a minute without a chunk), it is deleted.
  Progress on the phone ("34 % · 12,4 Mo sur 36,2 Mo", "Envoi 34 %" on the button) and on the cabinet ("Réception depuis le téléphone · 34 %" (Receiving from the phone) banner), then "Reçu du téléphone : <name>, dans le dossier d'import" (Received from the phone); it then shows up in System menu > Tables > Add a table.
- **Faster encryption**: ChaCha20 with no allocation per block, Poly1305 in ten 13-bit limbs (poly1305-donna 16-bit) instead of BigInt, on both sides: about 70 MB/s instead of 9, compared with `node:crypto` by the tests.
  A 256 KiB chunk opens in a few milliseconds in the main process.
- **Game**: VPX has the buttons; the page says "Partie en cours" (Game in progress), Keyboard and Send are greyed out ("Après la partie", After the game), the buttons do nothing.
  On return, the phone drives the menu again.
- **Guest mode**: the phone's buttons go through the same doors as the cabinet's (`GUEST_DOORS`); the phone **never unlocks** guest mode (its presses do not count in the combination); sending files is closed (`phone.files`); the remote screen is in the system menu, closed to guests.
- **Phone page, menu mode**: `body[data-mode]`, one detailed panel at a time (the keyboard wins, the transfer goes on and its percentage stays on "Envoyer"); when the visible height drops below 680 px (phone keyboard open), a typing view replaces the buttons; Start turns dark again when "Valider" is on screen or a flipper is held (a single green); an unavailable tool stays, greyed out with its reason ("Aucun champ" (No field), "Après la partie").
**A touch during a screen change.**
An entry touched at the moment a detail of the screen changes (a progress figure, a note) does what it announces; the cabinet used to ignore it, the screen having changed version in the meantime.
A touch on a screen that has truly changed is still ignored.

- **Tests**: `remote.test.ts` (buttons, text, transfer: closed messages, cleaned names, sealed chunks refused from elsewhere, large chunks correct and fast); `telecommande.test.ts` replays the scenario end to end: the real table management off screen, the QR read **from the screenshot of the screen itself**, the real phone page accepted by Start, Exit and a held flipper on the phone, typing and confirming, a file sent byte for byte, then the refusals (over 2 GB, guest mode, name climbing folders, chunk from another connection, replayed chunk, other host), a game, "Récupérer" taking and giving back the phone, the on-screen keyboard's QR, inactivity, Disconnect, closing; the layout guard rereads every cabinet screen.
  `guestmode.test.ts` pins the path through `handleKey` and the `phone.files` door.
