[Français](../manuel/amis-le-reseau-des-bornes.md) · English · [Manual contents](../manual.md)

## Community: the cabinet network

System menu > "Communauté" (Community) links cabinets together **with no server**: each finds the others and talks to them directly, over the Internet or on the local network.
Sharing is **on by default**; "Partage et réseau" (Sharing and network) turns it off.
What is yours (nickname, avatar, country, badges, public profile, what others see, deleting the account) is in System menu > "Mon compte" (My account) (see [My account](my-account.md#my-account)).

| Entry | What it shows |
| --- | --- |
| Messages | Conversations with your friends, the most recent first, then the friends you have not written to yet. The red dot and "non lus" (unread) mark what is waiting. Start opens a friend's conversation (see "Messaging" below). |
| Mes amis (My friends) | Online, then offline. For each: playing and which table (in real time), in the menu, or seen how long ago; their latest event ("Nouveau meilleur score sur …", New high score on; "Badge reçu : …", Badge earned; "A joué à …", Played). Start opens their profile, the one screen of a player (see "Public profile and likes" below): their presence, their library, their level, their badges, a single activity list, "Inviter à une partie en direct" (Invite to a live game; greyed out, "Hors ligne", Offline, when they are not), "Voir sa bibliothèque" (See their library), "Écrire un message" (Write a message), "Retirer de mes amis" (Remove from my friends), "Bloquer …" (Block …). At the top, an invitation received or the live game in progress. |
| Historique des parties (Game history) | The games with friends finished on this cabinet, newest first, by day: the table, the time, and below it the players with their rank and score. A game opens to review its details (see "Game history" below). |
| Trouver un joueur (Find a player) | The directory: "Chercher un nom…" (Search for a name, ignoring accents and case; or the ID shown on a player's profile, whole or its first four characters), cabinets "À proximité (réseau local)" (Nearby, local network) and "Vus récemment" (Seen recently). Start on a player opens their profile: "Envoyer une demande d'ami" (Send a friend request), or cancel, accept, decline, and "Bloquer …" (Block …). |
| Demandes d'amis (Friend requests) | Received (to answer, red dot up to the gear) and sent ("En attente : remise dès que sa borne sera en ligne", Waiting: delivered as soon as their cabinet is online). |
| Partage et réseau (Sharing and network) | The network only: sharing on or off, local network, library shared or not, download speed, Windows Firewall, live state of Stern SAM tables, the reminder of what others see, blocked players. The nickname, the avatar, the country, the settings of what others see and deleting the account are in My account. The selection opens on "Retour" (Back): a stray Start does not turn sharing off. |
| Masquer les notifications pendant les parties (Hide notifications during games) | Off by default: a friend coming online, a request to join a game, the news of a game with friends also show during games, with their sound (see "Everywhere, even in a game" in [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)). Start toggles; on, nothing shows or rings during a game, everything waits for the menu. |

**Identity.**
Each cabinet has an Ed25519 key, created on first start and kept in `<data>\social.json` (with friends, requests, directory, events and badges; never shared).
The name (2 to 24 letters, digits, spaces, `'`, `.`, `_`, `-`) is signed by this key; the player's ID ("A1B2-C3D4-E5F6-7890", `playerId`, taken from the key) tells two players with the same name apart.
It only shows on a player's profile ("Identifiant : …" (ID) line) and in My account ("Mon pseudo" (My nickname), taking back an account, deleting it); everywhere else (lists, friends, scores, live game, headings), the name shows alone, with the avatar.
A test guard (`noTag`, friends-menu.test.ts) rejects any tag attached to a name.
An unreadable `social.json` is set aside (`social.json.illisible-<date>`), never overwritten.

**Deleting your account (GDPR).**
System menu > "Mon compte" (My account) > "Supprimer mon compte" (Delete my account) shows what goes (the account and its ID, friends, requests, conversations, rooms, avatar, published scores, public profile, suggestions and votes on the feedback board, reactions to What's new) and what stays (tables, their scores, settings, and backups already made, which contain the account, to delete in System menu > Cyber Pinball > Backups), with the cursor on "Annuler" (Cancel).
"Supprimer définitivement mon compte" (Permanently delete my account): the feedback service first erases the key's suggestions, votes and reactions, along with the account's encrypted copy and its password (`POST /api/oubli`, signed by it; if unreachable, the player retries or goes on without it); an **erasure notice** signed by the key (`forget`: the key, the time) goes to connected cabinets, with "unfriend" to friends and requests, and the network stops; the account files are erased (`social.json`, `avatars\`, `amis\messagerie.json`, `amis\salons.json`, `amis\profils.json`, `amis\records.json`, `amis\parties.json`, the received rankings); Cyber Pinball restarts with a new key.
Every cabinet that receives the notice checks its signature, erases everything that comes from that key (directory, friends, requests, rankings, public card, likes, room lines, conversation), refuses whatever a relay would bring back, keeps the notice in `<data>\amis\oublis.json` (the key only, no name) and relays it; it is attached to every link's hello, for cabinets that were off.
Modules: [forget.ts](../../packages/core/src/forget.ts), `app/src/account-delete.ts`.
Tests: [suppression-compte.test.ts](../../packages/core/src/test/suppression-compte.test.ts) (signature, erasure of each piece of data, and between two cabinets on 127.0.0.1: the notice erases the player and their lines) and `retours-service.test.ts` (suggestions, votes, replay).

**Mandatory nickname at start.**
Right after the installation's screen wizard, the front-end opens the "Votre profil de joueur" (Your player profile) screen: "Choisir mon pseudo…" (Choose my nickname…) (on-screen keyboard, an empty field rather than the default name "Joueur A1B2"), "Mettre un avatar…" (Add an avatar…) (the "Mon avatar" screen, see "Player avatars") and "Continuer" (Continue), which resumes the start where it was (install VPX, add a table, the wheel).
The nickname is mandatory: as long as it is not chosen, the nickname line reads "to be chosen", "Continuer" stays greyed out, and both "Continuer" and Exit only remind the player of the nickname, with the selection back on "Choisir mon pseudo…".
The default name typed again as is ("Joueur A1B2", "Player A1B2") is refused.
The avatar stays optional.
"J'ai déjà un compte…" (I already have an account…), before "Continuer", takes back an existing account, and an account found in this PC's backup copy is offered automatically (see [My account](my-account.md#my-account)).
As long as the question is asked (see "Invited players" below), an optional entry slips in before "Continuer": "Qui vous a fait découvrir Cyber Pinball ?" (Who introduced you to Cyber Pinball?), which becomes "Découvert grâce à …" (Discovered thanks to …) once a player is chosen.
The screen comes back at every start as long as the profile has the default name, even if already seen and even with an avatar; a profile that had skipped the screen without a nickname therefore gets it again at the next start.
Never in guest mode nor during an unattended test (unless `CYBERPINBALL_PROFIL=1`), and after the opening when the start lands on the wheel.
The date of the first opening (`profileOffered` in `social.json`) stays recorded, for reference.
Code: `app/src/profile-welcome.ts`, rule `profileWelcomeDue` in [packages/core/src/social.ts](../../packages/core/src/social.ts), test `packages/core/src/test/profile-welcome.test.ts`.

**Directory with no server.**
Every cabinet with sharing on joins the same Hyperswarm topic (`cyberpinball/annuaire/1`, on Holepunch's DHT, bootstrap nodes `node1-3.hyperdht.org`).
On each connection, two cabinets exchange their profile and up to 200 profiles they have seen: the directory travels from cabinet to cabinet.
A relayed profile only gets in if its signature is valid; the most recent wins; a profile not seen again for 60 days leaves.
"Vu il y a…" (Seen … ago: directory, player profile, rankings) is the last time the player was online: seen by this cabinet (their hello, their local beacon), or by a cabinet relaying them, at the date it gives (`seen` field of each relayed profile, kept between the signed profile's date and now; an older cabinet that does not send it: the profile's date).
Receiving a relayed profile never makes it younger: up to 0.1.11-essai.27, each relay reset every received profile to the time of receipt, so all players seemed "seen" at the same moment and none ever left the directory.
Dates already distorted are brought back, once, to the last sure proof (profile date, local beacon, a friend's last presence, a friend request received; `repairDirectorySeen`, marker `directorySeenChecked`).
Two players find each other as well as a thousand: the DHT is shared by every Holepunch user.
They only need to be on at the same time.

**Friend request.**
It leaves as soon as the other cabinet can be reached, otherwise on its next connection (the requesting cabinet joins it by its key).
On each connection, both cabinets restate where they stand (friend: "accept"; pending request: "request"), so an acceptance or removal made while the other was off still gets through.
Requested on both sides: friends at once.
A decline is remembered for 30 days (the same request gets "no" without coming back on screen).
Blocking removes the player from the directory and cuts any connection with their cabinet.

**Presence and events.**
Friends receive: online or not, the table being played as soon as VPX shows it (title, manufacturer, year, VPS id, never a path) and the return to the menu; high scores entered at the end of the game (VPX only records the score at the end: the score during a ball cannot be read), games of at least one minute and badges earned.
A cabinet that connects receives each friend's last ten events.

**Badges.**
Computed from what the tables already record (games and play time in each `.info`, high scores in `VPReg.stg`).
On the first computation, those the history deserves are granted without an event: friends only see "Badge reçu" for what happens afterwards ([badges.ts](../../packages/core/src/badges.ts)).

**Local network.**
A multicast beacon (`239.255.42.99:47999`, TTL 1, every 5 s) announces the cabinet; neighbouring cabinets connect over encrypted TCP (secret-stream, the same Noise as Hyperswarm), even without the Internet.
"Nearby" as long as the beacon is less than a minute old.
The beacon joins its group network adapter by network adapter (IPv4, loopback excluded), and again at every announcement: `addMembership` without an adapter uses the default route's and throws (`EHOSTUNREACH`, `ENODEV`) when there is none, a cabinet started before its network, an unplugged cable, a VPN taking the route.
A refused adapter does not stop the others, and an adapter that shows up later is picked up at the next announcement.
**A local network failure is never blocking**: the Internet carries on, "Sharing and network" says "Local network: unavailable" with its reason ("no network adapter connected", or the system error), "Nearby" shows it greyed out, and a local network that could not open (port taken) is retried automatically, 30 s then twice as long after each failure, up to 5 min.
A failed start on the Internet side closes everything it had opened and is retried at the same pace; only it shows "Network unavailable" and "Blocking" in "My friends".

**Presence: online, offline, list up to date.**
A friend is online as long as at least one greeted link connects them to the cabinet, whatever it is: the Internet, the local network, or one replacing the other.
Greeted: their hello arrived on that link, so both cabinets see each other on it; a connection opened then closed before the hello does not count.
When their last link drops, they stay online for 15 s (grace): Hyperswarm replaces a duplicate connection by closing the old one before handing over the new one, and a cabinet that reconnects does so within a few seconds.
Past that delay with no new link, they go offline, "seen" at the drop of their last link, never at the time it is noticed; nothing is saved when a connection closes.
Each side decides on the same links, so both cabinets converge: an Internet link silent for 20 s (crashed cabinet, changed network) is closed, a local link has its TCP probes, and on the local network, if the beacon only gets through one way, the cabinet that does not usually call calls after two beacons without a local link (an Internet link no longer replaces the local one).
A followed friend without a link is asked of Hyperswarm again every 5 s for two minutes after startup or a network change, then every 30 s: after four failures (cabinet off, network not ready at startup, brief connections), Hyperswarm waited ten minutes before trying again, and the directory did not give it back.
These delays are drawn at random around their value (from half to one and a half times): two cabinets calling each other at the same instant get in each other's way, because Hyperswarm keeps, on the larger key's side, its own call still in progress and cuts the other's, even when that call is going to fail (incoming blocked on the other side); at a fixed pace they fell back together at every redial.
An Internet call cut before the hello, with no other link, is retried 0.3 to 1.5 s later (at most six times a minute), without waiting for Hyperswarm's 1 s, 5 s then 15 s.
The list says whether it can be trusted ([friendpresence.ts](../../packages/core/src/friendpresence.ts)): "Looking for friends…" at startup (30 s, or until every friend is there) and after a network change, "Updating…" during a grace, then "List up to date: 1 friend online", with a bar sweeping back and forth while it cannot be trusted; a friend offline during a search is "Seen 3 h ago · still looking".
Everywhere presence shows: "My friends", the system menu ("1 online · still looking"), "Play with a friend", a friend's profile ("Linked over the Internet and the local network"), the table menu pill (shown even at zero during the search, hollow dot).
"Just connected" is not announced during the search: the cabinet is the one arriving.
Log (`data\logs\journal.txt`), for friends and requests only: each link opened or closed, over what, its reason ("Duplicate connection", "connection timed out", "fin normale"), its duration and what remains; "X en ligne" with, during the search, the delay since it began ("2.4 s après le début de la recherche"); "X hors ligne (dernière liaison fermée il y a 15 s)"; a friend's local beacon and its address; a failed local call (firewall) once every five minutes; a friend Hyperswarm had given up on.

**Windows Firewall.**
Without a rule, Windows would show its "Allow access" prompt on the network's first start, which nobody can answer on a cabinet without a mouse.
The installer therefore adds the "Cyber Pinball" rule (inbound, `CyberPinball.exe` only, all profiles), with Windows' permission (UAC), once and only if it is missing ("Partage entre bornes : autoriser dans le pare-feu de Windows" section); never during an update (`/MAJ`), silently (`/S`, unless `/PAREFEU`) or in a sandbox.
Uninstalling removes it.
When it is missing (run from source, `npm run deployer`, UAC declined), "Partage et réseau" says so and offers "Autoriser dans le pare-feu de Windows" (Allow in Windows Firewall).
Without it, friends over the Internet still get through (outbound NAT hole punching); the local network and cabinets calling in, less well.
Under the same permission, a second rule, "Cyber Pinball VPX", **blocks** inbound traffic for VPX: VPX's inspector, which gives the live state of Stern SAM tables and the DMD image (friends' scores on its score screen) during a game with friends, listens on every address; with this rule, Windows shows no prompt for VPX and the local network cannot get in, while Cyber Pinball reads it through `127.0.0.1`, which the firewall does not filter.
As long as it is missing, the inspector is never enabled.
It follows VPX's version: VPX is started through the `emulators\vpx\current` junction, and Windows may name the process by its version's real folder; so the rule targets both paths (`vpxFirewallPrograms`).
The installer adds it for the version the application will install (`VPX_PAREFEU_REEL` and `VPX_PAREFEU_JONCTION`, from `version` and `executable` in `packages/installer/components.json`); on a cabinet already installed and updated by pre-release, "Partage et réseau" offers "Autoriser dans le pare-feu de Windows" (Allow in Windows Firewall), one request for both rules.
When VPX changes version (new folder, junction moved), the real path no longer matches: the rule must be set again, it is read again before every game with friends, and the inspector stays off until then.
"Partage et réseau" always shows the "État en direct des tables Stern SAM" (Live state of Stern SAM tables) line: "Prêt" (Ready), or greyed with its reason (VPX not installed, rule to set, VPX changed version, rule unreadable).
Uninstalling also removes the VPX rule if it targets this root, under the same request.
The commands: [packages/core/src/firewall.ts](../../packages/core/src/firewall.ts), the elevation: `app/src/firewall-rule.ts`, the inspector offered to the game: `app/src/vpx-inspector.ts`.

**Firewall after an update.**
After the update to 0.1.5, the cabinet network was blocked, although permission had been given before.
The cabinet's firewall event log (`Microsoft-Windows-Windows Firewall With Advanced Security/Firewall`) showed it: the rule added by netsh did not exist; there were only four "Query User" rules, which Windows creates on its own each time its "Allow access" prompt shows (TCP and UDP, for a single network profile, **blocking** until someone clicks).
Windows names them after the executable's description, "Cyber Pinball": the same name as ours, so reading by name (`netsh … show rule name="Cyber Pinball"`) took them for a permission.
A blocking rule always wins.
And the VPX rule, new in 0.1.5, is added by no update: the light update does not run the installer, and the installer in update mode (`/MAJ`) never asks for Windows' permission.
The path of `CyberPinball.exe`, for its part, never changes (`<root>\app`, replaced in place).
Since then: rules are read **by program** (any inbound rule targeting the executable, whatever its name), through PowerShell, whose values do not depend on Windows' language (`firewallReadScript`, `appFirewallState`): "blocked" (a blocking rule), "allowed on some networks only", "missing", "allowed" on all networks.
Adding the rule first removes any inbound rule on the executable, then adds ours for all profiles; for VPX, inbound blocked for each version folder and for the `current` junction.
The same Windows permission registers the "Cyber Pinball pare-feu" scheduled task (`firewallSetupScript`): no trigger, started by the application only, outside the session (S4U, administrator rights, no window), on a fixed script encoded in its arguments, which only adds these two rules again.
At every startup, and at the one following a full or light update, `app/src/firewall-guard.ts` reads the rules, writes their state to the log ("Pare-feu (après la mise à jour 0.1.5 → 0.1.6) : Cyber Pinball blocked, VPX missing, réparation automatique prête."), and, if one is missing or no longer matches, starts the task: nothing to confirm, even without a mouse.
Without the task (never allowed on this machine), or if the repair was not enough, the state stays visible with its reason: "Partage et réseau" (each rule, and "Réparation automatique du pare-feu : prête" or "pas encore autorisée"), "Mes amis" ("Réseau des bornes bloqué par le pare-feu de Windows", friends "Bloqué par le pare-feu" instead of "Hors ligne"), and, at the startup following an update, the "Pare-feu de Windows" screen, opened on the table menu with "Autoriser dans le pare-feu de Windows" selected: a single Windows prompt, never in the middle of a game.
Otherwise, a notice at the top of the menu.
The installer also removes any inbound rule on the executable before adding its own, and uninstalling removes the task under the same prompt.
The tests (`pare-feu-maj.test.ts`) simulate PowerShell, netsh and schtasks: never the machine's real firewall.

**Shared library.**
On by default between friends: two players who became friends each see the other's library without setting anything.
"Partage et réseau" > "Ne plus partager ma bibliothèque" (Stop sharing my library) turns it off, "Partager ma bibliothèque avec mes amis" (Share my library with my friends) turns it back on; this choice of the player is kept (`shareLibraryChosen`), and a `social.json` written before this default, which said "no" without anyone choosing it, is read back as "shared".
The screen reminds you to only share what you have the right to share (captures of works, ROMs and PuP-Packs remain their rights holders').
Friends see the list of tables and, for each, its own media (those in `medias\`: logo, backglass, videos, rules, music; neither the cabinet shared media nor the image taken from the `.directb2s`).
A friend's profile > "Voir sa bibliothèque" (See their library): "Sur votre borne" (On your cabinet: same game by VPS id, ROM, or title and year; "2 manquants", 2 missing) and "Absentes de votre borne" (Not on your cabinet).
One of their tables: its media, "Déjà équipé" (Already has one: your table already has this type of media, not necessarily the same file) or "Manquant" (Missing), then "Récupérer les n médias manquants" (Get the n missing media), "Récupérer les n médias" (Get the n media) or "Inviter … à jouer" (Invite … to play).
The transfer shows its progress and can be cancelled (Exit); each file arrives in `<data>\amis\recus\` and only leaves it if it has the announced size and SHA-256 fingerprint and first bytes that say media of its type (the import's checks).
It then enters the table's "Médias du jeu" (Game media) draft, with its origin ("la borne de Bruno #A1B2", Bruno's cabinet), the cursor on the first media item received ("Afficheur large reçu de Bruno : vérifiez-le, puis enregistrez.", Wide display received from Bruno: check it, then save): you see it, then "Enregistrer" (Save) shows the plan before writing.
**A friend's whole table.**
A table you do not have: "Récupérer toute la table" (Get the whole table); a table you already have: "Choisir les parties de sa table" (Choose parts of their table).
The parts screen asks the friend's cabinet for the list of its files, sorted by game part ("Parties du jeu"): table (the `.vpx`, the DMD content and the extra scripts), backglass, ROM, PuP-Pack, DMD colours, sounds, music, point of view, own settings, menu media; each part with its number of files and its weight, and yours opposite when you have it.
The screen opens in the list of parts, the cursor on the first one: each line says in plain words "Cochée" (Ticked) or "Non cochée" (Unticked) (the title counts "3 cochées sur 4", 3 ticked of 4), and Start on a part ticks or unticks it; for a table you already have, ticked, theirs replaces yours, unticked, you keep yours.
The flippers go down from the last part to "Récupérer les n parties cochées" (Get the n ticked parts), then to "Retour" (Back); the help strip says so in the list ("Start ou Entrée : cocher ou décocher la partie", Start or Enter: tick or untick the part; `listStart`: any screen whose list is ticked declares it), and MagnaSave goes from the list to the actions and back.
By default: all their parts you do not have, except those under rights, unticked with their note: the ROM ("l'œuvre du fabricant : à ne prendre que si vous en avez le droit", the manufacturer's work: only take it if you have the right to) and the PuP-Pack ("vidéos et musiques souvent tirées du jeu : à ne prendre que si vous en avez le droit", videos and music often taken from the game: only take it if you have the right to).
One rule for every unticked part: its line says it is there and how to tick it, "+ Disponible : Start pour la cocher" (Available: Start to tick it; "… pour prendre la sienne à la place de la vôtre", to take theirs instead of yours, when you have it), and for the ROM and the PuP-Pack, with a "!" sign, "Disponible, à cocher vous-même : Start, puis l'attestation de vos droits" (Available, tick it yourself: Start, then the declaration of your rights).
Start on one of them opens its legal notice ("La ROM : vos droits", The ROM: your rights; "Le PuP-Pack : vos droits", The PuP-Pack: your rights): what it is and who owns it, where it comes from ("Ce contenu vient directement de la borne de … : Cyber Pinball ne le fournit pas et ne vérifie pas vos droits. Vous en êtes seul responsable.", This content comes straight from …'s cabinet: Cyber Pinball does not provide it and does not check your rights. You alone are responsible for it.), then the pledge to tick, "J'atteste avoir le droit de détenir ce contenu (par exemple la machine d'origine ou une licence) et je m'engage à respecter le droit d'auteur et les conditions d'utilisation de ses ayants droit." (I certify that I have the right to hold this content, for example the original machine or a licence, and I agree to respect the copyright and the terms of use of its rights holders; "J'atteste et je m'engage", I certify and agree, "À cocher", To tick, then "Cochée", Ticked).
"Prendre la ROM" (Take the ROM) or "Prendre le PuP-Pack" (Take the PuP-Pack) does nothing until it is ticked; once ticked, the cursor moves onto it, then the parts screen comes back on the ROM's line, "Cochée", "✓ Droits attestés" (Rights attested).
A part asked for by an invitation is ticked by default only if it is not under rights.
The attestation holds for this table while the screen is open; it follows the download (`attested`, `attestedAt` in its queue record), and a file of a rights part that was not attested never enters it (`attestedTableFiles`).
The ROM offered is the one the table plays on the friend's cabinet, wherever it is: in the table's `pinmame\roms`, or only in their ROM library, found through PinMAME's shared folder (the inventory's `libraryRoms`); it arrives under `pinmame\roms`, and the add plan stores it in your library.
The table's aliases (`pinmame\alias.txt`, the ROM loaded under another name) are part of the ROM: they come with it, never without it.
A friend's table that asks for a ROM their cabinet does not offer (older version, ROM not found on their side) says so under the list, "ROM …: not offered by their cabinet", before anything is received.
Below the list, "Récupérer les n parties cochées" (Get the n ticked parts: the weight; refused if there is not enough room, plus 1 GiB, on the data drive).
**A transfer starts only once**: it carries a key, the table and the friend (`dedupe`), and while it runs, waits for its friend, is paused, or is received but not installed, nothing starts it again.
It shows where it was started: in the friend's library, the table's line carries its state ("Réception en cours", Transfer in progress; "En attente de Bruno", Waiting for Bruno; "Reçue · à installer", Received · to install), its bar and "42 % · 120 Mo sur 300 Mo · fichier 3 sur 14 · Start : voir la réception" (Start: see the transfer); Start leads to it.
On the table's page, "Voir la réception de la table" (See the table transfer, or "Installer la table reçue", Install the received table) replaces "Récupérer toute la table", the cursor on it, with the same bar at the top; likewise "Voir la réception des médias" (See the media transfer).
The friend's profile adds it to the line of their library ("1 réception en cours", 1 transfer in progress).
The transfer screen says "Lancée à 14:02 : rien d'autre à faire" (Started at 14:02: nothing else to do): it carries on if you leave it, and Start on the table comes back here without starting it again; "Continuer en arrière-plan" goes back to the table, "Annuler la réception" (Cancel the transfer) deletes what was received.
Once received, the screen says "Reçue, pas encore installée" (Received, not installed yet) and offers first **"Installer dans ma bibliothèque"** (Install in my library: this table's add plan); likewise the table's page and Downloads.
A received table whose plan was cancelled stays "Reçue · à installer" while its folder is there, and "Récupérer de nouveau" (Get it again) is an explicit choice on that screen.
A reminder: a table contains a script that VPX runs, to be taken only from friends you trust.
The files arrive in `<data>\amis\tables\<date>\<table folder>\` under their relative path, checked on both sides (never "..", nor a drive, nor an absolute path, nor a reserved Windows name, nor a program: `.exe`, `.dll`, `.bat`, `.ps1`, `.lnk`…), each with its size and its SHA-256 fingerprint, computed while sending (a file of several gigabytes is read only once).
Saves, high scores (`nvram`, `VPReg.stg`), PinMAME settings and statistics never leave.
Then the folder goes through the add plan, like a downloaded table: a new table, or into yours (the parts taken replace yours, to the trash); nothing is put away before "Installer" (Install).
A file missing on arrival: nothing is installed.
An invitation to a live game on a table you do not have offers "La récupérer chez …" (Get it from …).
"Trouver cette table dans le catalogue" (Find this table in the catalogue) remains there to get it from its site.
**What is announced is served**: a library media item goes through the import checks as soon as it is announced (`mediaRefusal`, kept per file, size and date), and one that fails them is announced neither in the library nor in its table's files; the log says so ("… n'est pas annoncé (le contenu ne correspond pas à son nom (.png))", … is not announced).
If a file is still refused on the way, every file of a table except its `.vpx` is optional: it is skipped with its exact reason ("média refusé par les contrôles : …", media refused by the checks; "introuvable chez votre ami : …", not found at your friend's; "fichier abîmé ou changé : …", file damaged or changed), the rest arrives, and both the transfer screen and Downloads say "1 fichier sauté" (1 file skipped).
"Ne le partage plus" is now only said of a friend who turned sharing off.
What travels carries no path of the cabinet: each table, media item and file has an opaque id that only the sharing cabinet links to a file; only friends can ask for them.

**Download speed.**
"Partage et réseau" > "Limiter le débit des téléchargements…" (Limit download speed…): no limit (by default), 256 KB/s, 512 KB/s, 1, 2, 5, 10 or 20 MB/s (each with its equivalent in Mbit/s, the unit of internet boxes).
The limit applies to everything friends send (tables, parts, media), **all transfers together**: shared equally between the transfers in progress, never less than 16 KB/s each.
The sending cabinet is the one that slows down: only it pushes the chunks, and slowing down reception would also block presence and messages, which go through the same channel.
The receiver gives its speed in the request (`file-get`, field `rate`, in bytes per second), then corrects it on the way (`file-rate`) when the limit changes or another transfer starts or ends; the sender follows this pace on average (`RatePacer`, a late wake-up of Windows timers is made up, with at most 250 ms ahead).
A cabinet from before this setting ignores both and sends at full speed; the screen says so.
Downloads from sites and VPinMediaDB are not affected.
Kept in `<data>\social.json` (`downloadRate`, absent: no limit).
Code: [packages/core/src/ratelimit.ts](../../packages/core/src/ratelimit.ts), `serveFile` and `fetchOne` in `app/src/friend-content.ts`; tests: [debit-amis.test.ts](../../packages/core/src/test/debit-amis.test.ts) (including a real 640 KB transfer at 256 KB/s between two cabinets linked in memory, and the limit lifted on the way).

**Live game.**
Two entries.
A friend's profile > "Inviter à une partie en direct" (Invite to a live game): choose a table (those they have in the same version first, see "Choosing the table of a live game" below).
A table's page > "Jouer avec un ami" (Play with a friend), right under "Jouer" (Play): choose the friend (online ones first, those who have the table in the same version at the top, offline friends greyed out below).
Both stay visible when you cannot invite, greyed out with their reason: "Hors ligne : invitez-le quand il sera connecté" (Offline: invite them once they are connected), "Aucun ami en ligne pour l'instant" (No friend online right now), "Pas encore d'ami : Menu système > Communauté > Trouver un joueur" (No friend yet: System menu > Community > Find a player); a friend in a game can be invited too ("En partie : il recevra une notification discrète sur sa table", In a game: they will get a discreet notification on their table).
A room opens, the invitation leaves; up to four players ("Inviter un autre ami", Invite another friend).
On the friend's side, the invitation chime rings and "Invitation de …" (Invitation from) opens by itself over the table menu, in the system menu and on the help (over the open screen, which "Répondre plus tard" gives back as it was), the cursor on "Répondre plus tard" (Answer later, with the time left): a button already pressed neither accepts nor declines; otherwise it waits at the top of "Mes amis", two minutes at most.
The cabinet checks there that it has the same version as the host, mandatorily (a score to compete on, and tournaments later): the same `.vpx` (SHA-256 fingerprint, kept in `<data>\amis\empreintes.json`) and the same script played.
The script played: the table's own, or the `.vbs` next to it when it replaces it (VPX then plays the `.vbs`); a modified `.vbs`, or one from another version, must be the same for everyone, the one Cyber Pinball writes itself (PuP repairs, specific to each cabinet) does not count.
Not the same version, no "Accepter" (Accept): "Autre version de cette table" (Another version of this table) (or "Même table, autre script", Same table, another script, a `.vbs` next to the table), and "Récupérer sa version chez …" (Fetch …'s version) opens their table in their shared library, the table ticked, then the add plan; all that is left is to ask for a new invitation.
On the host's side: "N'a pas la même version : il peut récupérer la vôtre" (Does not have the same version: they can fetch yours) ([meme-version.test.ts](../../packages/core/src/test/meme-version.test.ts)).
The same `.vpx` is recognised under another name: the invitation gives its size, the cabinet computes the fingerprint of its tables of that size.
The log says what it found ("la même version", the same version; "une autre version : partie refusée", another version: game refused; "le même .vpx, mais un autre script", the same .vpx but another script; "reconnue par l'empreinte de son .vpx", recognised by its .vpx fingerprint), or "introuvable ici" (not found here) with the game looked for.
A table fetched from a friend keeps the name it has on their cabinet: a `.info` with its title, manufacturer, year and VPS game comes with the received files, and the add plan takes it before the game's name on VPS ([meme-table-autre-nom.test.ts](../../packages/core/src/test/meme-table-autre-nom.test.ts)).
The number of balls per game counts too: known on both sides and different (5 against 3), the score goes out of the ranking, "5 billes au lieu de 3" (5 balls instead of 3) in the invitation, the room and the results ("Autre nombre de billes : score hors classement", Another number of balls: score not ranked); unknown on one side, it judges nothing.
It is read, never guessed ([ballcount.ts](../../packages/core/src/ballcount.ts), [app/src/ball-count.ts](../../app/src/ball-count.ts)): for a ROM table, the "Balls Per Game" adjustment in `<table>\pinmame\nvram\<rom>.nv` (otherwise the shared PinMAME folder), according to that ROM's memory map from the [Pinball Memory Maps](https://github.com/tomlogic/pinball-memory-maps) project (ODbL licence), downloaded on demand and kept in `<data>\cache\cartes-memoire`; without a `.nv`, the table has not run yet and the ROM starts from its factory setting (the map's default); a ROM whose map does not describe this adjustment (Stern SAM: Star Trek, The Walking Dead) stays unknown.
Without a ROM: "Const BallsPerGame = 3" outside the script's procedures (GOTG, The Goonies, The Matrix), or the service menu of VPW tables (Game of Thrones: "BALL PER GAME", the value chosen in `VPReg.stg`, otherwise the default).
A table that creates its settings on the fly (2001) stays unknown ([nombre-de-billes.test.ts](../../packages/core/src/test/nombre-de-billes.test.ts)).
Without the table, only "Refuser" (Decline) remains, with "Trouver cette table dans le catalogue".
The host starts the game as soon as a friend has accepted: "Départ commun" (Shared start) opens on every cabinet, a large number from 5 to 1 in the centre and the players below (the cursor on "Retour au menu", Back to menu: a Start pressed to get ready does not leave the game, the start is still on), then the table starts everywhere as if by Start.
Each plays their own game on their cabinet: nothing is controlled remotely.
Back in the menu, "Résultats" (Results): the players whose score entered the table's high score table, ranked, their score shown large ("Meilleur score connu", Best known score); the others without a rank, "Score non disponible" (Score not available: an unknown score is not ranked); each player's play time; "Autre nombre de billes : score hors classement" (Another number of balls: score not ranked) when that is the case (that score is shown without a rank).
The screen fills in as the others come back (fifteen minutes at most after the first).
The host can "Rejouer avec les mêmes joueurs" (Play again with the same players).
The host runs the game and sends the room to everyone; guests do not need to be friends with each other.
**The table's copy**: a live game never touches the player's usual ROM memory, records or settings.
VPX plays a copy of the table, made just before launch in `<root>\parties\<game>\` (same drive as the tables) ([tabledouble.ts](../../packages/core/src/tabledouble.ts), [app/src/table-double.ts](../../app/src/table-double.ts)): linked (hard link, the same file with no extra space) what nothing writes during a game, the `.vpx`, the backglass, the ROMs, images, sounds, videos and fonts; copied everything else, what VPX, PinMAME, PuP or B2S may write (`pinmame\nvram`, `pinmame\cfg`, `user\VPReg.stg`, `.ini`, `.xml`, `.vbs`, PuP scripts); left out `cache\` (VPX rebuilds it) and `medias\`.
A table that plays its ROM from the shared PinMAME folder gets its own `pinmame\roms` (links) and a copy of its memory in its copy, otherwise PinMAME would write into the shared folder.
The game's records are read in the copy, then it is deleted, never following a link to a folder; a copy left by a crash goes at the next start.
No copy, no game, never a fallback to the usual folder: table sharing its folder with others, link or junction in its folder, ROM not found, tables on another drive; the screen says so, "Votre table habituelle reste intacte : rien n'a été lancé" (Your usual table stays untouched: nothing was started).
The log compares the usual folder's fingerprint (size and date of each file) before and after: "dossier de la table intact (N fichiers comparés)" (table folder untouched, N files compared), or what changed.
The test has a fake VPX write everywhere these programs write, then compares every byte ([double-de-table.test.ts](../../packages/core/src/test/double-de-table.test.ts)).
Measured on a cabinet: Game of Thrones, 1853 links and 19 copies in 3.8 s, none of the 1881 files changed.
**The host's settings**: everyone starts from the same machine state, without Cyber Pinball having to read or understand each setting ([hostsettings.ts](../../packages/core/src/hostsettings.ts)).
As soon as a friend accepts, the host's cabinet sends them, for each ROM of the table, its memory (`pinmame\nvram\<rom>.nv`: balls per game, ball save, tilt warnings, extra balls, high scores) and its DIP switches (`pinmame\cfg\<rom>.cfg`), and the values the table saves (`user\VPReg.stg`: the service menu of VPW tables, their high scores); a file the host does not have goes as "absent".
In 96 KiB pieces (a message between cabinets carries 256 KiB at most; a Stern SAM ROM's memory is 128 KiB), each file checked by its SHA-256 fingerprint; the guest tells the host whether it received them whole.
At launch, they replace the copies in the guest's copy of the table, and a file absent on the host is removed from it: both cabinets then start from factory settings.
The guest's usual folder does not move.
In the room: "Prêt, réglages de l'hôte reçus" (Ready, host's settings received); "en route" (on their way) while they travel; "non reçus : score hors classement" (not received: score not ranked) if they arrived damaged, too large (over 1 MiB per file), or if the guest's cabinet runs a version older than this feature; in the results, "Hors classement : réglages de l'hôte non reçus" (Not ranked: host's settings not received).
To play with 5 balls, the host sets their own table to 5 before inviting.
Settings specific to each cabinet do not travel: PinMAME's `default.cfg`, the table's display and sound options (`.ini`) ([reglages-de-l-hote.test.ts](../../packages/core/src/test/reglages-de-l-hote.test.ts)).
**Nor does the volume** (decision of 16/11/2026): each cabinet keeps its own sound level, suited to where it stands, whether the host plays louder or quieter.
Yet it lives in those same files; in the guest's copy, each one is the host's with the guest's volume ([volume-de-l-invite.test.ts](../../packages/core/src/test/volume-de-l-invite.test.ts)): in the ROM's memory, the volumes its Pinball Memory Maps map locates (WPC "Volume", Stern SAM "Master Volume", knocker volume…), their checksums rebuilt (without them, the ROM resets the volume at boot: measured on the libpinmame bench with The Addams Family); at the end of the `.cfg`, PinMAME's 25 mixing levels; in `VPReg.stg`, the keys whose name says volume and those the VPW service menu titles with "VOLUME" at the end (`scriptVolumeKeys`).
A guest who never played the table keeps the factory volume, as at home.
When the volume cannot be put back safely, the guest's own file stays, with its own game settings: map not in the cache, map that does not locate the volume (Whitestar, Data East, System 11…), wrong checksum, volume key the host does not have, file absent on the host while the guest has set their volume.
Only machines whose sound is set by a potentiometer on the sound board (Bally, Williams System 4 to 9, Gottlieb System 1 and 80, Atari, Stern M-100 and M-200, Zaccaria, Taito…) receive the host's whole memory.
The log says, file by file, what comes from the host and what is kept: "réglages de l'hôte posés dans le double, volume de l'invité gardé : pinmame/nvram/taf_l7.nv : celui de l'hôte, volume de l'invité gardé (Volume) ; …" (host's settings placed in the copy, guest's volume kept: … the host's, guest's volume kept).
**The group's high score board**: the scores of ranked live games, per exact version of the table (same `.vpx`, same script), kept by each cabinet that played in `<data>\amis\records.json`, twenty places ([groupboard.ts](../../packages/core/src/groupboard.ts)).
Each ranked player's best score goes in, once per game; out of the ranking (host's settings not received, another number of balls), it does not.
The room shows "Record du groupe à battre : …" (Group record to beat) (or "Pas encore de record du groupe sur cette version", No group record on this version yet); the results, "Records du groupe sur cette version" (Group records on this version), the top five.
In the game, the table's high score table is the group's: before launch, its records are written into the copy's `VPReg.stg`, in place of the host's, the last place left at zero, so that each player's score always enters it and can be read on return.
Only the values are rewritten, in place, within the room already allocated to each: the structure of the file, which VPX reads through Windows, does not change; credits and settings (the host's number of balls) stay.
Between friends, the knocker only rings for the group record beaten; these records are not sent to friends like those of a solo game.
A ROM table (PinMAME: T2, Star Trek, The Walking Dead) keeps its high score table in the ROM memory: it is read and written in the copy's `<rom>.nv` according to that ROM's map (Pinball Memory Maps, cached in `<data>\cache\cartes-memoire`), mirrored copies and checksums redone (one wrong checksum, and the ROM restores its factory high scores); then everything is read back, and a single wrong checksum cancels the write ([romscores.ts](../../packages/core/src/romscores.ts)).
Checked on a cabinet's memories: the 134 checksums of T2, 73 of Star Trek and 23 of The Walking Dead, correct according to this computation, stay correct after the high score table, the only thing changed, is written.
No map for the ROM, a map without `validation`, a 4-bit memory: nothing is written or read, nothing enters the board ("Aucun score classé pour l'instant", No ranked score yet).
Without a `.nv` (the host has none: factory settings), the ROM starts from its factory high scores: a score lower than the last one cannot be read ([tableau-du-groupe.test.ts](../../packages/core/src/test/tableau-du-groupe.test.ts), [records-rom.test.ts](../../packages/core/src/test/records-rom.test.ts)).
**Live game state**: for original tables built on the common script base (Game of Thrones, GOTG, The Goonies, The Matrix: `Score()`, `CurrentPlayer`, `PlayersPlayingGame`, `BallsRemaining()`, `BallsPerGame`, `bGameInPlay`), the copy's script gets an addition, never the table's ([livestate.ts](../../packages/core/src/livestate.ts)).
An element the script never uses (a wall, a light; neither its name nor its events appear in it) lends its built-in timer: four times a second, the score, the ball and "game in progress" go to the copy's `cyberpinball-etat.txt`.
The `<table>_KeyDown` procedure is wrapped: the coin door is always ignored; Start and the lockbar, outside a game in progress (no other game after ours); during the game, Start goes through (it validates the letters of Game of Thrones' initials), and a player added with Start shows in the state: their score goes out of the ranking.
The start is automatic: once the table is ready, on the shared start's “go” (below), the script inserts a credit then presses Start, and tries again if it does not start (four times at most).
During the game, Cyber Pinball reads the state twice a second; score and ball go to the others (at most twice a second, at once on a new ball), and the game's strip shows each player, their score and where they are, the best at the top in signal green ([gamenotice.ts](../../packages/core/src/gamenotice.ts), `liveBoardView`).
**Where it goes**: never at the top of the playfield, and always a visible permanent strip (`liveBoardPlacement`).
Automatic takes, in order, the backglass, free or taken by the table (its B2S, its PuP-Pack: the usual case, the strip goes in front, discreetly), otherwise the topper, likewise, otherwise, as a last resort, the bottom of the playfield; the scores on the DMD are a separate setting ("Scores sur le DMD", Scores on the DMD, on by default), in addition, never instead; the log says the place and why ("pourquoi : automatique : fronton (pris par la table, la bande passe devant), et sur le DMD quand il montre l'écran de score"), and "aucune place visible" (no visible place) should it happen.
The test [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) fixes the invariant on every screen combination (playfield alone, + backglass, + DMD, + backglass and DMD, + topper, DMD under the backglass), each screen taken or not, DMD readable or not, four orientations, one to four players and each choice; `packages\core\ecrans-simules\pincab.json` is a real PinCab's configuration.
**On the DMD**, only when it shows the table's score screen.
The DMD that VPX or PinMAME draws cannot be written from outside (no window to write to, no script shared by ROM tables), but it can be read: for a game with friends, the VPX inspector is enabled in the double's copy of `VPinballX.ini` (firewall rule closing VPX to the network in place, read through 127.0.0.1), which gives the displays (`/api/tree`: PinMAME's DMD, FlexDMD…) and a frame at each change (`/ws/display`) ([app/src/dmd-watch.ts](../../app/src/dmd-watch.ts)).
The score screen rule ([dmdscore.ts](../../packages/core/src/dmdscore.ts)): a game in progress according to the state (never attract mode, the end of the game or initials entry); a "screen", stable frames (0.4 s at least, within 8% of their ink) linked by transitions of one second at most and changing by no more than 45% of their dots from one to the next; it is the score screen when its frame changes while the score moves (within 1.2 s: the state reading lags), or when it has the layout of a score screen already recognised in the last two minutes (the same one, back after an animation, other digits), or, at rest (score still for 3 s), when it comes back or stays 3.5 s (and, once the score screen has been seen in play, looks like it); quiet for 1.5 s.
A mode text, a choice to make (ball held, score frozen), the BONUS neither change with the score nor look like it: nothing is laid over them.
Measured off-screen on the cabinet's ROMs with libpinmame: Terminator 2 shows its score screen ~1 s, slides its score ~0.5 s, then shows it again; with the ball in play, its digits change by 15 to 40% of its dots at each hit, an animation, a BONUS or a text by 50 to 160%; Star Trek shows an animated scene in play with the score in a corner.
On the bench, with this rule, Terminator 2 played (a hit every 0.4 to 2.5 s) gives 12 passes in 170 s (one every 12 s), all on the score screen, and Star Trek 8, never on "BALL SAVED" nor on an animation.
The scores are then laid over it for 4 s, in its place (the FullDMD dressing's, otherwise the DMD zone), same dot font and colour as the menu's DMD; up to three players, "PARTIE ENTRE AMIS" (GAME WITH FRIENDS) on top, one line per player, name and ball ("B2", "END") on the left, score on the right, this cabinet's player at full brightness (`liveBoardDots`).
Every 12 s as long as the DMD shows the score screen; sooner, 10 s after the previous one, when one of the player's balls ends, someone else takes the lead or finishes their game; never twice within 10 s; they leave as soon as the DMD shows something else (`LiveBoardFlash`).
Without the inspector (VPX firewall rule not allowed) or without a state reading for the table, nothing on the DMD, and the log says so.
A table without PinMAME (FlexDMD DMD, The Goonies, The Matrix): its image is never read (the inspector would make its scene render outside the script's thread, which stops VPX); the scores show there at the same pace from the state reading alone, game in progress for 5 s and score moved less than 8 s ago (ball in play: neither ball held nor a choice to make), without seeing an animation, which a pass may cover for 4 s (`DmdSignalWatch`).
**Summary in the log**, for each game: "Scores sur le DMD : 9 passages en 112 s de partie (un toutes les 12 s) ; le reste du temps : …" (9 passes in 112 s of play, one every 12 s; the rest of the time: …), or "aucun passage en … ; pourquoi : …" (no pass in …; why: …): setting off, no DMD screen, DMD unreadable and why (inspector unreachable, no DMD in its tree, stream closed), or what the rule saw, as a share of the time.
Guard (`LiveDmdTally`): setting on and DMD present, with no pass after 60 s of play, the log says why at once ("Scores sur le DMD : aucun passage après 60 s de partie ; pourquoi : …"); the test [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) fixes the invariant (a pass, or the reason) over every combination of setting, screen, reading and DMD.
A hardware DMD alone (ZeDMD, PIN2DMD) cannot be covered.
**On the backglass**, free or taken by the table (its B2S, its PuP-Pack; the log says which, from `occupiedRoles`, read again every 2 s), permanently: "Partie entre amis" then one card per player, side by side, name, large score, "Bille 2 sur 3" (Ball 2 of 3); at the bottom of the backglass, like an electromechanical machine's score reels, discreetly (a fifth of its height at most, never below the readable size: a short backglass otherwise sent it to the playfield); without a backglass, in the middle of the topper.
With neither backglass nor topper, **an inset at the bottom of the playfield**, in the player's left corner, turned with the playfield: on the apron, below the outlane exits, away from the drain and the shooter lane; one line per player (name, score, ball), a tenth of the playfield height at most.
**The player's choice**: System menu > Community > "Scores des amis pendant la partie" (Friends' scores during the game) ([app/src/live-scores-menu.ts](../../app/src/live-scores-menu.ts), kept in `<data>\amis\scores-en-partie.json`): Automatic (the above), On the backglass (at the bottom, over its image, its B2S or its PuP-Pack), On the topper (in the middle, likewise), At the bottom of the playfield, On the side of the playfield (in the middle of the player's left edge).
Every choice stays visible; one the cabinet does not allow is greyed with its reason (no backglass screen, no topper).
Separately, "Scores sur le DMD : activés" (Scores on the DMD: on, the default) or "désactivés" (off: nothing on the DMD any more), Start to switch; greyed with its reason without a DMD screen, or while the VPX firewall rule is not allowed (the DMD cannot be read).
The settings apply to every table (the file allows a per-table setting, `tables`, not offered yet); a place a table does not allow falls back to automatic, and the log says why.
It is set outside the game: during the game, the buttons belong to VPX, and Cyber Pinball has no menu on top.
**Always in front**: PuP, B2S or external DMD windows put themselves back on top during the game; twice a second, the Windows window stack is read again, a window of another process that came in front of the strip is logged ("Bande de la partie entre amis recouverte par "…" (class, process) : remise devant", once; "repasse sans cesse devant" if it insists), and the strip comes back in front (`overlayCoveredBy`), then every 40 ms while the window insists (and 5 s after the last time), never taking the focus.
Measured off screen (the real strip on a simulated backglass, covered by another process's always-on-top window):in front of a B2S (always on top set once), 100% of the time; in front of a PuP-Pack putting itself back on top every 100 ms, 83% (before the fast bring-to-front: 11%).
No visual setting is offered during the game: the place is set here.
Tests: [bande-partie.test.ts](../../packages/core/src/test/bande-partie.test.ts) (screens from `packages\core\ecrans-simules`, four orientations, one to four players, each choice, covering, pace) and [dmd-ecran-de-score.test.ts](../../packages/core/src/test/dmd-ecran-de-score.test.ts) (drawn sequences).
Once the game is over (initials entered), VPX closes by itself after 4 s; the final score comes from the state, it ranks and enters the group board even if nobody entered initials.
A game that ran for 20 s at least counts as played, even if VPX crashes or returns an error code when closing ("La partie n'a pas démarré de son côté" showed after several minutes of play).
Checked on the real scripts of Game of Thrones, GOTG, The Goonies and The Matrix: completed, they compile (cscript, nothing executed).
**ROM tables** (PinMAME): the game state is in the ROM's memory.
The live state reads it through `Controller.NVRAM` (the very bytes of the `.nv`), at the addresses of the `game_state` section of the ROM's map (Pinball Memory Maps, cached in `<data>\cache\cartes-memoire`): scores, current player, ball, game over, number of players, and balls per game from its settings (`romLivePlan`).
The map and the memory are those of the game PinMAME really loads: the table's alias (`pinmame\alias.txt`) replaces the name the script asks for, for the live state as well as for the group's records, the ball count and the host's settings (`loadedRoms`; Star Trek asks for `st_162h` and loads `st_161h`, its memory is `st_161h.nv`).
The keys are wrapped as for original tables.
Measured on the cabinet's libpinmame, with no screen or sound, with T2's ROM (`t2_l8`): at boot, the memory shows the previous game for three seconds if VPX was quit in the middle of a game, then the ROM clears it; so a game only counts after the live state's own Start, and the start waits for the table in attract mode (two seconds); the credit goes through `vpmKeyDown` (taken 750 ms later), and Start is held for half a second, two seconds after the credit (again every ten seconds, two minutes at most, if the game does not start).
Game over comes before the initials are entered, and the score only enters the high score table afterwards (up to a minute and a half later): as long as a score of the game beats the last place without being in it, the game stays in progress for the live state (Start goes through and confirms the letters), two minutes at most; then VPX closes.
The memory is read twice a second (every two seconds above 32 KB: copying 128 KB costs the script about 3 ms, on VPX's thread).
Williams WPC: the whole RAM is the NVRAM, everything is read there (Terminator 2).
Stern SAM (Star Trek, The Walking Dead): scores, number of players, balls per game and the high score table are in the NVRAM, but the map puts player, ball and game over in main RAM, out of the script's reach; the test bench found no reliable game-in-progress flag in the NVRAM, and a ball counter that keeps the ball of an interrupted game until the following game.
These three values go through VPX 10.8.1's inspector: VPX's PinMAME plugin reads a reduced map placed in the double (`pinmame\memmaps\index.json` and `cyberpinball.json`, under the name the script asks for and under the one PinMAME loads), then publishes these values read from the CPU's memory; the inspector serves them over HTTP, and the live state reads them through `127.0.0.1` (`/api/tree` for their number, `/api/states` for their value, 600 ms wait at most: without an answer, that reading is skipped).
The values are raw there: the map's mask and inversion (game over: status byte `& 0xFE` zero) are applied in the live state.
The inspector is enabled for the game with friends only, through a copy of the cabinet's `VPinballX.ini` placed in the double (`[Plugin.Inspector]`, `Enable = 1`, a free port from 2113 to 2122) and given to VPX with `-Ini`; the usual `VPinballX.ini` is never touched, and whatever VPX changes in the copy during the game leaves with the double (the log says so).
It listens on every address, with no command (in this version: `/info`, `/api/tree`, `/api/states`, display images): it is only enabled if the "Cyber Pinball VPX" firewall rule closes VPX to the network for its active version (see Windows Firewall); otherwise the log says "pas de relevé de l'état de jeu (… ; l'inspector de VPX les lirait, s'il pouvait être activé ; règle du pare-feu de VPX absente…)" (no live state: the inspector would read them, the VPX firewall rule is missing) and the game plays as before.
A table that reads everything in its NVRAM (T2) never uses it.
Main RAM is cleared when the ROM boots: no previous game to discard; the start waits for the table in attract mode, as on WPC.
What only a test on the real cabinet will confirm: the addresses of Star Trek's map were measured by its authors on `st_161h` and `st_161hc` (the cabinet plays `st_161h`), those of The Walking Dead on `twd_160h`; the test bench cannot read SAM's main RAM.
The Walking Dead's map puts "Balls Per Game" in `game_state` only (`ball_count`): it is read there too, for the live state as well as for the ranking's ball count.
Checked: the completed script of both T2 versions on the cabinet compiles (cscript, nothing executed); the live state, run by cscript on the bytes of T2's real memory captured on the bench during a game, gives the start, the live score and ball, keeps the game going during the initials and ends it when the score enters the table ([etat-en-direct.test.ts](../../packages/core/src/test/etat-en-direct.test.ts)).
**The shared start**: everyone starts at the same time; after that, it does not matter who finishes first ([livestart.ts](../../packages/core/src/livestart.ts)).
Each cabinet starts VPX; when its table has loaded and its state reader answers (“pret=1” in `cyberpinball-etat.txt`: the table on screen for three seconds, or a ROM table waiting for four readings), it tells the host it is ready.
The host gives the “go” when every awaited player is ready, and the room carries it to everyone.
Each cabinet then writes `cyberpinball-partez.txt` in its copy; the state reader looks for it on every tick (a quarter of a second, half a second on a ROM table), and only then inserts the credit and presses Start.
A file rather than a key sent to VPX: no window to aim at and no focus to take, nothing lost if VPX is busy, and the file stays there for a slower reader.
Until then, Start and the coin door stay blocked: nobody starts alone.
While waiting, a card in the middle of the playfield, in its top third (no ball is in play): “Waiting for players”, the reason (“Waiting for Bruno — Loading table…”), then each player, a green tick once ready, and their status (Starting VPX…, Loading table…, Ready, Left the game, Old version: starts without waiting); at the start, “Go!” for four seconds, and the game strip takes over.
Those four seconds count from when “Go!” appears on screen, never from the time of the signal: on a busy cabinet, the card's window can take several seconds to appear.
So the card loads, hidden, as soon as VPX is launched, and appears as soon as there is something to say, even for a wait of an instant; a cabinet only says it is ready once its table is on screen.
The log says what the player saw: “carte montrée 5.1 s en attente, « Partez ! » 4.0 s”.
The live game screen shows the same wait, and “Ready, waiting for the shared start” for each player.
Edge cases, each one stated on screen.
A player who is never ready: from the first ready player, the others have 90 s (“Starting without Bruno in 45 s if their table is not ready”); then the “go” without them rather than a cancellation: those who are ready do not lose their game, and the latecomer, who has already received the “go”, starts as soon as their table is ready (“The others have already started: your turn!”); their score counts like the others.
A player who quits VPX while waiting, or whose game did not start, is no longer awaited (“Left the game”).
A cabinet left on a version from before the shared start never says it is ready: it is not awaited, its table starts as soon as it has loaded, and the room says so (“Cyber Pinball … on their cabinet: their table starts without waiting for the others, needs updating”); a guest whose host is in that case starts without waiting, and their table says so.
A host who goes silent (cabinet switched off): a ready guest starts on their own two minutes later (“No news from …: your table starts on its own”).
A table without a state reader (neither the common script base nor a map for its ROM) is ready as soon as it is on screen; Start is not blocked there: the card says “Wait for “Go!” before pressing Start”, then “Go!” and “Press Start”.
The log says “ma table est prête”, “« partez » donné (tous prêts)” or “(sans …, pas prêts à temps)”, then “« partez » posé pour le relevé”.
Checked: the state machine (delays, start, old cabinet, silent host), the message between cabinets, two cabinets on a test network, and the completed state reader run by cscript on the common script base and on T2's memory: no credit or Start before the file, not even the player's ([depart-commun.test.ts](../../packages/core/src/test/depart-commun.test.ts)).
**Cabinet versions**: each cabinet announces at the invitation and the answer what it can do (`LIVE_PROTOCOL`: 1 invitation and fingerprint, 0.1.4; 2 host's settings and group board, 0.1.5-essai.8; 3 live state and automatic start, 0.1.5-essai.13; 4 shared start) and its Cyber Pinball version.
A cabinet that lags behind shows: in the room, "Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour" (Cyber Pinball 0.1.5-essai.10 on their cabinet: no automatic start or live score, needs updating); in the invitation, "Ancienne version chez …" (Old version on …'s cabinet); in the strip, "Ancienne version : pas de score en direct" (Old version: no live score).
In the results, each player has their game score (read live, otherwise entered in the table's high score table) and their rank in the game, with the reason for being out of the ranking (several players in their table, host's settings not received, another number of balls); never their place in their table's high score table, which says nothing about the game ([version-des-bornes.test.ts](../../packages/core/src/test/version-des-bornes.test.ts)).
**Invitation during a game**: the cabinet no longer answers "busy", it leaves the choice to the player.
The chime rings (one of the interface sounds allowed during a game, see [Interface sounds](game-media.md#interface-sounds)), the one-line notification "Bruno vous invite à rejoindre une partie" (Bruno invites you to join a game) shows with it (see "Game news"), and a discreet card appears over VPX, in the playfield's top left corner as the player sees it (a recording's indicator holds the right corner): "Bruno vous invite à jouer" (Bruno invites you to play), the table, the time left and "Quittez la partie pour le rejoindre, ou continuez : elle s'efface seule" (Leave the game to join them, or keep playing: it fades away by itself).
A window without focus, that clicks go through and that no recording sees ([app/src/game-notice.ts](../../app/src/game-notice.ts), [gamenotice.ts](../../packages/core/src/gamenotice.ts)): VPX keeps control.
After 12 s, it shrinks to a pill "Invitation de Bruno" (Invitation from Bruno) with the time left, until the invitation expires, is cancelled or the game ends.
Nothing to do to ignore it; leaving your game brings you back to the menu, where the invitation opens by itself if it is still valid.
Only a live game already in progress answers "busy".
In the room, the host reads "Invité, en partie : notifié sur sa table, il peut quitter la sienne pour vous rejoindre" (Invited, in a game: notified on their table, they can leave theirs to join you).
Seeing the others' score, ball and DMD during the game is the next step, to be decided on a mockup.

**Game news.**
Away from the game's screen (on the tables menu, in the system menu, during any game), a one-line notification says right away that a friend invites you to join a game, that a guest accepts or declines, and why, that a player leaves the game, that the host cancels it, or that the game is over for everyone when you finished yours before the others: the winner, your rank, where the results are; a friend coming online too (see "Game with friends" and "Everywhere, even in a game" in [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)).
During a game, it sits over VPX, in the playfield's top-left corner for the player, turned with it in the direction VPX really draws the table (`played`, [gameorientation.ts](../../packages/core/src/gameorientation.ts); the same rule places the band and the start card), 720 × 76 px on a playfield 1,080 px on its short side, under an invitation's card if there is one, never on the common start's card; a window without focus, that clicks go through and that no recording sees, brought back in front if a VPX window goes over it ([app/src/game-notice.ts](../../app/src/game-notice.ts), `line`; `GAME_NOTICE_LINE`).
During the game with friends itself, the band keeps what it shows (who finished, who left); an invitation cannot arrive then (the cabinet answers "busy"), a friend coming online can.
Back in the menu, results not yet seen open by themselves.

**Invitation endings, on both cabinets**.
Every invitation ending is told to both cabinets, and their screens adapt: accepted, declined (with its reason: not this table, not the same version, busy), cancelled by the host, game started without the guest, table changed, expired (two minutes), a friend gone offline (after the presence tolerance).
On the host's side, the room puts at the top each answer of the last 30 seconds, "Bruno a refusé votre invitation" (Bruno declined your invitation) · "Sa place est libérée : invitez un autre ami, ou changez de table" (Their seat is free: invite another friend, or change table) (or "Bruno a accepté votre invitation", "Bruno est passé hors ligne : invitation retirée", "Pas de réponse de Bruno en deux minutes"), with the ding, even with the room open; elsewhere, the notification says it.
On the guest's side, the decision screen turns to "Invitation annulée par Bruno" (Invitation cancelled by Bruno) (or "Bruno a lancé la partie sans vous", "Invitation expirée", "Bruno est passé hors ligne", "Bruno a changé de table" with "Voir la nouvelle invitation", See the new invitation), with "Retour" (Back); the invitation notification already shown leaves, and another one says the ending ("Bruno a annulé son invitation", ding) when the screen is not open; during a game, the card on the playfield closes and the line says it.
A lost message leaves no one waiting: the guest's answer goes again at each resend of the invitation (every 10 s); the ending told by the host (`game-cancel` and its reason, `why`) goes again every 3 s until its acknowledgement (`game-cancel-ok`), two minutes at most, and waits for an offline guest to come back; an acceptance arriving too late gets that ending back (`lateAnswerEnd`), rather than waiting for a start that will never come.
Each also notices expiry and the other going offline on its own.
An older cabinet still understands the cancellation (without a reason).
Invited again after a refusal, in the same room, it is a new invitation: its number (`round`) is in its notification's key.
The log tells each ending ("invitation de Bruno (« … ») terminée : cancelled", "fin de l'invitation dite à Poste (expired)", "reçue par Poste", "a répondu « decline »").
Tests: [fins-d-invitation.test.ts](../../packages/core/src/test/fins-d-invitation.test.ts) (the real service on two cabinets and a test network that loses a message: every ending reaches both sides).

**Reliable shared start, tables without live tracking.**
On an unstable connection, "Go!" could stay 90 s on one cabinet and forever on the other, and no score was counted.
The waiting card now leaves by itself: "Go!" fades 4 s after it appeared, and no card stays more than 2 min 20 s, even when no message arrives any more (`liveWaitCardEnd`); the service also carries the end of the wait to the screen, on the next tick (`live-game.ts`).
A start message lost during a cut is sent again: the host sends the room again (including "go") every 3 s during the game, and at once to a guest back online; the guest sends its state again ("ready", its finished game) as long as the host's room does not show it (`liveStatusBehind`); a lost start message is caught up by the room, which gives the time left (`startIn`).
A table without live tracking of the game state (script outside the common base, ROM whose map is missing, VPX inspector impossible) has no automatic start, no live score, and no game over seen by Cyber Pinball: this is said before the game, when choosing the table ("Manual start"), in the room and in the invitation, with the reason (`liveStateSupport`, the same computation as the double); it stays playable.
On the table, the card says to press Start at "Go!" and to quit the table when the game is over.
The score counts if it entered the table's high score table (read in the double when it closes); otherwise the results say "Score not read: table without live tracking, and the score did not enter its high score table", without a rank.
An error after the game (a refused write) no longer loses the result: it is sent to the host anyway.
The log gives each start message sent, received or sent again ("Départ commun : …"), each view of the card ("Départ commun, carte : « title — reason »") and why it left ("« Partez ! » lu", "restée trop longtemps", "plus d'attente", "fin de la partie").

**Games in a row, original tables.**
A game on Terminator 2, then on The Goonies and The Matrix, could stay on "Loading table…" forever for both players.
These original tables (common base) set the player, the number of players and the scores only at Start: before, live tracking wrote them empty (`joueurs=;joueur=;…;score=;pret=1`), the line could not be read, and "ready" was never read; nobody being ready, the delay for the last ones never started.
Live tracking now always writes numbers (`CyberPinball_N`, 0 as long as the script has set nothing), and reading it accepts those empty values before the game (`parseLiveState`), never during it.
Safeguard: a table on screen for 20 s with no "ready" from live tracking says it is ready anyway, and the log says why ("Départ commun (…) : table à l'écran depuis 20 s, le relevé ne dit pas « prêt » (its last line) : prête quand même"); live tracking keeps its three seconds before the credit and Start.
A wait where nobody says ready also ends: "go" at the latest 1 min 50 s after the launch.
Everything the service keeps about a game (state sent, resends, manual start, "go" carried to each player) is stored under its identifier and dies with it; the planned launch only applies to its own game, and a start, a room or a state from another game is ignored.
Before the start too, nothing depends on a single message: the host sends the invitation again every 10 s as long as the guest has not answered; an invitation already received does not ring twice, and one already answered sends the same answer again (each intended invitation has its number, `round`: a friend invited again after a refusal sees the new one).
The log gives each invitation received, sent again, or refused automatically (« déjà dans la partie … »).

**VPX stopped mid-game, FlexDMD DMD.**
During a game with friends on The Goonies, VPX stopped during play: "La partie n'a pas pu se dérouler" (The game couldn't run), "VPX exited with code 3221226356" (0xC0000374, heap corruption), after "Actor Ball not found in children of" and "Runtime error on line 9781, col 2: Objet requis: 'FlexDMD.Stage.GetLabel(...)'".
The cause was Cyber Pinball: to put the friends' scores on the DMD score screen, it read the DMD through the VPX inspector.
The inspector's server runs on its own thread and asks for a frame every 10 ms; for FlexDMD, each frame asked draws the whole scene (`GetRenderFrame` → `FlexDMD::Render`, update and drawing of the elements), on that thread, while the table's script changes the same scene on its own, with no lock (`LockRenderThread` is only a counter; VPX 10.8.1 sources, commit af26b2d93).
The scene gets damaged, the script no longer finds its element, VPX closes.
The inspector now only reads PinMAME's DMD, whose frame is already computed by the emulation (`inspectorDisplayReadable`): a table without PinMAME no longer turns the inspector on for the DMD, and a FlexDMD or UltraDMD display found in the tree is never read (the log says so; the board stays on the backglass).
Neither live tracking (added at the end of the script, timer of a table element), nor the PuP-Pack switches, nor the PupCapture recognition (reading `FlexDMD.DmdPixels` in the script's thread) draw the scene from another thread.
For any table, a VPX stop is now read in the end of its log (`diagnoseVpxFailure`): the script error (runtime or compile, line, column, message, the faulty line quoted from the table's script, the FlexDMD element not found just before) and the Windows exit code named (0xC0000374, 0xC0000005…).
The failure screen gives that reason ("The table's script stopped", "VPX stopped during the game") and, nothing being missing, Start plays the table again instead of opening "What's missing to play"; in a game with friends, Start opens the game, which the others carry on, and the score counts up to the stop.
Cyber Pinball's log keeps one line of it: « VPX arrêté (file) : erreur du script ligne …, VPX fermé (0x…) ».
A player whose VPX stops before 20 s of play shows as "VPX stopped during their game", distinct from a game that never started.

**Game history.**
System menu > Community > "Historique des parties" (Game history): every live game finished on this cabinet, newest first, grouped by day ("Vendredi 30 octobre 2026", Friday 30 October 2026); for each, the table as the title, the start time, and below it the players with their rank and score ("1. Bruno 2 841 350 120 · 2. Alexis (vous) 1 000 000 · Chloé 9 999, hors classement", 1. Bruno … · 2. Alexis (you) … · Chloé 9,999, not ranked).
A game you won carries a star.
Choosing a game opens its details: the table version and its number of balls, the host, then each player, their rank and score ("Meilleur score", Best score), why they were not ranked (host's settings not received, different number of balls, more than one player on their table), the place taken on the table's high score board and the time played; without a score, "Score non disponible" (Score not available) and what happened to them ("La partie n'a pas démarré de son côté", The game did not start on their side; "A quitté la partie", Left the game; "Résultat pas arrivé à temps", Result did not arrive in time; or, for a cabinet that is behind, "Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour", Cyber Pinball 0.1.5-essai.10 on their cabinet: no automatic start or live score, to update: each cabinet's version is kept).
Back returns to the list, the cursor on that game.
Each cabinet keeps the games it played, as host or guest, once each, in `<données>\amis\parties.json`; games from before this version are not there ([gamehistory.ts](../../packages/core/src/gamehistory.ts), [app/src/game-history-menu.ts](../../app/src/game-history-menu.ts)).
The format prepares the rankings to come (group of friends, then national and worldwide) without building them: each player is identified by their cabinet's public key (their name is only for display), the exact table version is there (same `.vpx`, same script: only those scores compare), each score says whether it counted and why, and a format number (`v`) allows adding fields without losing the games kept; a format newer than the cabinet's is shown, never rewritten.
An unreadable file is never overwritten: it is set aside (`parties.illisible-<date>.json`), the history starts empty again and the log says so; the same for `records.json`, the group board ([historique-des-parties.test.ts](../../packages/core/src/test/historique-des-parties.test.ts)).

**What others see.**
Everyone: the name and the avatar.
Friends: presence, the table being played, high scores, badges, games, and the library if it is shared (its tables, their parts and their media; a ROM or a PuP-Pack only if the friend ticks them, attesting they have the right to).
Connected cabinets see the IP address, as in any peer-to-peer exchange.

**Tests.**
Never the real network during a test: `socialNetMode` turns the network off as soon as a test variable is set (autopilot, captures, stress, `CYBERPINBALL_HOME` sandbox, simulated screens), except `CYBERPINBALL_RESEAU=simule`: an in-process HyperDHT test network and an in-memory local network, on 127.0.0.1 only, with a simulated firewall rule.
`CYBERPINBALL_RESEAU=non` also turns it off in normal use.

Code: decisions in [packages/core/src/social.ts](../../packages/core/src/social.ts) (profile, messages, directory, friendship, events), [friendlibrary.ts](../../packages/core/src/friendlibrary.ts) (shared library, file messages) and [livegame.ts](../../packages/core/src/livegame.ts) (invitation, room, start, results), transport in `app/src/social-net.ts` (the only module that opens sockets), services in `app/src/friend-content.ts` and `app/src/live-game.ts`, screens in `app/src/friends-menu.ts`, `app/src/profile-menu.ts` (a player's profile), `app/src/friend-library-menu.ts` and `app/src/live-game-menu.ts`.
A player's name always follows their most recent signed profile, wherever it comes from (hello, relayed directory, beacon), never an older one (`learnProfiles`, `renamePeer`).
Proofs: [social.test.ts](../../packages/core/src/test/social.test.ts) (names, signatures, trapped messages, directory, friendship rules on both sides, badges, network mode), [social-net.test.ts](../../packages/core/src/test/social-net.test.ts) (two cabinets on a test network: directory, request, acceptance even with a cabinet off, presence, high score, removal, local network without the Internet, blocking; local network down at start, the Internet running anyway and the local network retried; beacon that does not throw on a refused or missing adapter; no socket outside 127.0.0.1; no other module loads Hyperswarm, `net` or `dgram`), [firewall.test.ts](../../packages/core/src/test/firewall.test.ts) (netsh output in every language, same rule in the installer, never during an update, silently or in a sandbox), [friend-services.test.ts](../../packages/core/src/test/friend-services.test.ts) (library shared by default and refused once turned off, media received identical to the byte, unknown id refused, whole table part by part with no saves, program or untaken ROM, trapped path refused, live game from invitation to results), [friends-menu.test.ts](../../packages/core/src/test/friends-menu.test.ts) (each screen, sharing by default, each part of a table leading to its own action and the ROM unticked, countdown cursor, invitation greyed out with its reason and "Jouer avec un ami"), [invitation-en-partie.test.ts](../../packages/core/src/test/invitation-en-partie.test.ts) (invitation received during a game: kept, never "busy"; card then pill, playfield corner in all four orientations, window without focus or capture, opened on return to the menu).

**Limits.**
The score during the game is not read (VPX only records it at the end): a live game only compares high scores entered on the table's high score table and play times.
One file at a time per friend; an interrupted transfer resumes where it stopped as soon as the friend is back (see "Download manager").
The directory only knows the cabinets seen since sharing started; two players must be on at the same time to find each other, and behind two symmetric NATs (CGNAT, 4G tethering) with no third cabinet to relay, the connection can fail.
Adding the firewall rule for real (UAC) has only been tried in principle, never on the development machine's real firewall.

### Choosing the table of a live game

The table choice takes the guests into account **before** the invitation (`packages/core/src/livechoice.ts`).

- **First, "Même version chez tous" (Same version for everyone)**: the tables each guest has in the strictly identical version, judged exactly as at acceptance (`matchLiveTable`): the same `.vpx` (SHA-256 fingerprint) and the same played script.
  The detail says with whom: "Même version chez Bruno" (Same version at Bruno's).
- **"À vérifier" (To be checked)**: a cabinet that does not tell its versions is flagged, not refused; the table can still be chosen, the check at acceptance decides.
  Reasons: "Bibliothèque de Bruno inconnue (ancienne version de Cyber Pinball)" (Bruno's library unknown, older version of Cyber Pinball), "… (il ne la partage pas)" (not shared), "Bibliothèque de Bruno demandée à sa borne…" (requested from their cabinet), "… injoignable pour l'instant" (unreachable for now), "Version de Bruno en cours de vérification…" (a fingerprint being computed, at their end or here).
- **"Indisponibles" (Unavailable)**, greyed out, never hidden, with who blocks: "Autre version chez Bruno" (Other version at Bruno's, or "Même table, autre script chez Bruno", same table, other script), then "Bruno n'a pas cette table" (Bruno does not have this table).
  Start on another version opens the parts of their table in their shared library, the table ticked by default ("Start : récupérer sa version chez Bruno", Start: get Bruno's version); on a missing table, nothing.
- **Several guests**: a table is playable if it is for all of them; the reason names each of those who block.
  You get there through "Changer de table" (Change table) in the room (the guests get a new invitation, the old room is cancelled and they are told) and through "Autre table, mêmes joueurs" (Another table, same players) on the results.
- **Choosing the friend for a table** ("Jouer avec un ami", "Inviter un autre ami" in the room) follows the same rule: those who have the same version first, the others greyed out with their reason.

**What the friend's cabinet says about its tables.**
Their shared library carries, for each table, the size of the `.vpx` and the `versions` announcement: their cabinet can give their strict version.
The inviter asks (`table-versions-get`) for the version of only the tables that may be theirs, the same game or a `.vpx` of the same size (the same file under another name); the friend's cabinet computes the fingerprint of those only, once per file (`<data>\amis\empreintes.json`), and answers table by table (`table-versions`).
A cabinet running an older version does not announce `versions` and ignores the request: its tables go to "À vérifier".
The check at acceptance remains the safety net: a table changed in the meantime is refused there, as before.

### Messaging

System menu > Community > "Messages", or "Écrire un message" (Write a message) on a friend's profile.
You write **between friends only**, without a server: messages go straight from one cabinet to the other, over the same encrypted connection as presence, and stay on both cabinets.

**A friend's conversation.**
Their messages on the left, yours on the right, and in the middle the events of the friendship drawn by the cabinet (a high score, a badge).
The flippers choose a message, Start opens "Répondre" (Reply), MagnaSave goes to the previous or next friend, Exit leaves the conversation for its actions: "Écrire un message…" (Write a message…), "Réponse rapide…" (Quick reply…), "Options de la conversation" (Conversation options), "Voir son profil" (See their profile).

**Replying with the buttons.**
"Répondre" offers seven emoji reactions placed on the chosen message (👍 Like, ❤️ Love, 🥰 Care, 😆 Haha, 😮 Wow, 😢 Sad, 😡 Angry, the same as in the rooms; Start again on yours removes it; an older reaction, Bravo or TILT!, still shows), six ready-made sentences, and "Écrire un message…": the on-screen keyboard, or the paired phone, whose text appears in the field as you type. 500 characters at most.
On a desktop, the real keyboard types directly.

**On-screen keyboard: position and emoji.**
The text has an insertion point: the ◀ ▶ keys of the on-screen keyboard move it, as do a real keyboard's left and right arrows, Home and End (unless those arrows are the cabinet's buttons); a letter, Effacer (Backspace) and Delete act there.
An emoji counts as one character.
The 😀 key opens the emoji panel next to the keys (below them on a portrait screen), never over the text: forty emoji and "Lettres" (Letters) to go back; the flippers move through it while it is open.
On a desktop, the Windows panel (Win + period) also types into the field.
No emoji in a link: the key is greyed out there.
Module: [textedit.ts](../../packages/core/src/textedit.ts); tests: [textedit.test.ts](../../packages/core/src/test/textedit.test.ts).

**A friend who is offline.**
The message waits on the cabinet, dashed, "En attente · partira quand … sera en ligne" (Waiting · will leave when … is online), and leaves on its own as soon as both cabinets are on at the same time.
It turns to "Reçu" (Received) when the friend's cabinet has saved it.
After 30 days without a connection, it is dropped: "Non remis" (Not delivered).
There is no read receipt.

**During a game.**
The buttons stay with VPX: none of them is used for messaging.
The paired phone, however, shows the most recent conversation under "Partie en cours" (Game in progress): reactions and sentences in one tap (the reaction goes to the last message received), and a field to write.
The "Répondre depuis le téléphone pendant une partie" (Reply from the phone during a game) setting turns it off; messages are then read back in the menu.

**Backglass and DMD.**
While a conversation is open, the backglass shows the friend's card: their badge, presence, latest high score and how long you have been friends.
In the menu, an incoming message is also announced on the DMD, in dots, for four seconds; never during a game.

**Notifications.**
An incoming message is announced by the "Message de …" (Message from …) notification in the table menu, in the system menu and over the game (unless "Masquer les notifications pendant les parties" is on); a click opens its conversation.
An open conversation announces nothing more.

**Options and settings.**
A conversation's options mute a friend's notifications, delete the conversation (on this cabinet only) or block the friend (the cabinet network's block, which also deletes the conversation).
An unread conversation counts in the messages pill of the tables menu, unless muted, and shows on the "Messages en attente" (Waiting messages) screen (see [Tables menu notifications](tables-menu-notifications.md#tables-menu-notifications)).
"Réglages de la messagerie" (Messaging settings) turns messaging on or off (off, your friends see "N'accepte pas de messages", Does not accept messages, and what they write waits), mutes the message sound, and sets how long messages are kept: 30 days, 1 year (default) or always.
In guest mode the system menu is closed: no messaging, and message notifications wait until it is unlocked.
The settings also include "Répondre depuis le téléphone pendant une partie" (Reply from the phone during a game, on by default).

**Deleting a message.**
Start on one of your messages, then "Supprimer ce message…" (Delete this message…) and the confirmation: it disappears from your thread, with the reactions on it, and from your friend's as soon as their cabinet receives the deletion.
The deletion is a signed message (`del`: the message ID) that is sent and waits like any other; a cabinet only removes messages from whoever signs it.
A cabinet older than this version does not acknowledge it: it stays pending, showing nothing, then is dropped.
Tests: [suppression-messages.test.ts](../../packages/core/src/test/suppression-messages.test.ts).

**Typing.**
While a friend has text in their field (on-screen keyboard, real keyboard or phone), their badge appears under the last message: their avatar, their nickname and three dots lighting up one after the other.
The same goes in a group (each member typing, under the discussion) and in a room (under the log, three badges at most, then "+2"; ignored players are left out).
The phone shows it too, under the thread, the room or the in-game chat (the nicknames, three at most then "+2", and the three dots), and its own fields send it.
The dots leave with the message, when the field is emptied or closed, or by themselves 8 seconds after the last signal.
It is a short-lived signal, never stored: `chat-typing` to a friend, `grp-typing` to the reachable members of a group, `room-typing` in a room (signed by its author, relayed like presence); one every 3 seconds at most while typing.
A cabinet older than this version neither sends nor shows it.
Tests: [en-train-d-ecrire.test.ts](../../packages/core/src/test/en-train-d-ecrire.test.ts).

**What travels.**
Each message is signed by its author's key and checked on arrival; a cabinet that receives the same message twice keeps it once.
Messages are kept in `<data>\amis\messagerie.json`.

### Public profile and likes

Every player has a **public profile**, readable by those who are not their friends: their nickname, avatar, level, badges, country, number of friends (never the list), the number of their published high scores, their invited players, their public groups and their **recent activity** (high scores and badges of the last 30 days).
Current table, games played, library and messages stay between friends, and the profile says so ("Table en cours, parties jouées, bibliothèque : réservées à ses amis", Current table, games played, library: for their friends only); "Online" or "Playing" show in "Joueurs en ligne" (Players online, see below).

**One screen per player.**
Friend or not, a player has only one screen, their profile (`app/src/profile-menu.ts`); up to 0.1.13, a friend's page and their public profile duplicated each other, with two different activity lists.
My friends, "Joueurs en ligne" (Players online), the directory ("Trouver un joueur", Find a player), friend requests, messaging and groups ("Voir son profil", See their profile), rooms (a line's options) and Recent activity all lead straight to it; its "Retour" (Back) returns where you came from.
Under the nickname, the tier and level ("Flippeur · niveau 14", Flipper · level 14), then "Votre ami" (Your friend) or "Profil public · pas votre ami" (Public profile · not your friend).
From top to bottom:

- what the relationship adds (`playerPart` in `app/src/friends-menu.ts`): for a friend, their presence ("En partie", Playing; "En ligne", Online; or "Hors ligne", Offline; since when you have been friends, how their cabinet is linked) and their library (with "1 réception en cours", 1 transfer in progress); for another player, where they were seen ("Sur votre réseau local", On your local network; "Vu il y a 3 j", Seen 3 days ago) and the pending friend request, sent or received;
- their country, number of friends and published high scores, "Profil actualisé il y a …" (Profile updated … ago), then their ID;
- their level and its bar ("Flippeur · niveau 14", "350 / 750 XP");
- their badges as medals, the rarest first, twelve at most ("23 badges sur 56", 23 badges out of 56; "Les 12 plus rares", The 12 rarest);
- their invited players, if any (see "Invited players" below);
- their public groups, never a private group (see [Levels and badges](levels-and-badges.md#what-the-player-sees));
- a single activity list, the most recent at the top: their high scores and badges of the last 30 days, to like, and, for a friend, the games they played over the same 30 days (with no public card received, their friend events alone).

The card of a player whose cabinet does not have the levels version yet has no level: the line reads "Niveau pas encore connu" (Level not known yet; "Sa borne n'a pas encore la version qui donne le niveau", Their cabinet does not have the version that gives the level yet).
An implausible level shows as "Niveau ?" (Level ?, see [Levels and badges](levels-and-badges.md#starting-level-and-plausibility)).
The actions: for a friend, "Inviter à une partie en direct" (Invite to a live game), "Voir sa bibliothèque" (See their library), "Écrire un message" (Write a message); for another player, "Envoyer une demande d'ami" (Send a friend request; or cancel, accept, decline) and "Écrire un message", greyed out; then "Masquer son activité" (Hide their activity), "Retirer de mes amis" (Remove from my friends; a friend, with confirmation), "Bloquer …" (Block …) and "Retour" (Back).

**Liking.**
On the profile, the flippers choose a high score or a badge, Start likes it, Start again unlikes it.
Everyone sees the number of likes; only the author sees who liked it.
A like shows as a raised thumb, filled when you already like it; the same thumb marks the "Ont aimé" (Liked by) screen, the notification of a like received, the experience points detail and the "Apprécié" (Appreciated), "Populaire" (Popular) and "Généreux" (Generous) badges.
You cannot write to a player who is not a friend: "Écrire un message" (Write a message) stays visible, greyed out, with its reason; "Envoyer une demande d'ami" (Send a friend request) is next to it.
"Masquer son activité" (Hide their activity) hides their events and likes on this cabinet, along with their level, badges and invited players; "Bloquer" (Block) cuts everything.

**My public profile.**
System menu > "Mon compte" (My account) > "Mon profil public" (My public profile) shows what others see (country, friends and high scores, level and bar, badges as medals, invited players, public groups) and, for each event of "Votre activité récente" (Your recent activity), who liked it (Start).
During the first month, it also offers "Qui vous a fait découvrir Cyber Pinball ?" (Who introduced you to Cyber Pinball?, see "Invited players" below).
A like received is announced by a notification in the table menu, grouped ("Dora and Kiko like your activity").
The public profile is **on by default**; "Désactiver mon profil public" (Turn off my public profile), here or in "Ce que voient les autres" (What others see), leaves others only the nickname in the directory (and the scores, if they are published).

**Without a server.**
A player's public card is signed by their key and travels from cabinet to cabinet like the ranking scores: each cabinet keeps it 60 days, so a profile can be read even when its player is offline, as of the last card received ("Profil actualisé il y a …", Profile updated … ago).
A like is a small signed message, delivered straight to the author's cabinet when it is linked, otherwise relayed by one or two cabinets, and retried at every link for 30 days.
The number shown is the one of the last card received.
One cabinet cannot give a player more than 100 likes a day.
Cards sent together stay under 180 KiB per message (`withinBytes`, [publicprofile.ts](../../packages/core/src/publicprofile.ts)): a card carries up to twenty invited player certificates, and a message that is too big would be refused whole.
Cards and likes are kept in `<data>\amis\profils.json`.

### Invited players

A player who introduced Cyber Pinball to others sees it on their profile, with the Ambassador badge from the first one; the invited player's profile, however, never says who invited them.
With no server and no account, only the invited player can say who invited them ([invitations.ts](../../packages/core/src/invitations.ts)).

**The question.**
"Qui vous a fait découvrir Cyber Pinball ?" (Who introduced you to Cyber Pinball?) is asked on the "Votre profil de joueur" (Your player profile) screen at first launch, before "Continuer" (Continue), then in System menu > "Mon compte" (My account) > "Mon profil public" (My public profile), for the 30 days after that screen first opened (`DECLARE_DAYS`, `profileOffered`); it is always optional.
The screen (`app/src/invite-menu.ts`) first offers the players "Sur votre réseau local" (On your local network), then "Vos amis" (Your friends; eight at most per list), "Chercher un joueur…" (Search for a player…: their nickname, or the ID shown on their profile, in the directory), "Personne : je l'ai trouvé seul" (Nobody: I found it myself; the question does not come back) and "Plus tard" (Later).
The chosen player carries "Choisi" (Chosen), the screen says "Vous avez choisi …" (You picked …) and the entry becomes "Découvert grâce à …" (Discovered thanks to …); as long as nothing is confirmed, it can be changed.

**When it counts.**
The invitation counts after the first completed game (see [Levels and badges](levels-and-badges.md#earning-xp)), or right away if a game has already been completed.
The cabinet then signs a certificate (`invited`: the inviter, the invited player, their nickname, their machine's fingerprint, the time) and hands it to the inviter's cabinet if it is linked; otherwise the linked cabinets relay it, twice at most (`INVITE_TTL`), and it goes out again at every link until the inviter has received it directly.
The screen then says "Bruno vous a fait découvrir Cyber Pinball" (Bruno introduced you to Cyber Pinball) and "C'est compté : il le voit sur son profil" (It counts: they can see it on their profile; or "… as soon as their cabinet is online"); nothing can be changed any more.

**A machine only counts once.**
The machine's fingerprint is derived from the Windows `MachineGuid` in a way that cannot be traced back to it (`machineTag`); the `MachineGuid` never leaves the cabinet.
If it cannot be read, the declared invitation waits for a later game.
The inviter keeps one certificate per machine and per player, never their own nor an arrival from their own machine, and attaches the twenty most recent to their public card (`INVITES_IN_CARD`), with their total.
Every cabinet that shows their profile checks each certificate's signature against the invited player's key (`invitedOf`): an inflated number does not get through; beyond the twenty attached, the announced total is believed, 500 at most.
A deleted account (erasure notice) withdraws its certificate.

**On the inviter's profile.**
A "Personnes invitées" (Invited players) part: "A fait découvrir Cyber Pinball à 3 joueurs" (Introduced 3 players to Cyber Pinball; "Vous avez fait découvrir Cyber Pinball à 3 joueurs", You introduced 3 players to Cyber Pinball, in My public profile), with the avatars of the eight most recent and "+N" beyond.

**XP, notification and badges.**
Each invited player earns the inviter 100 XP, then 25 XP for every tier they reach (Flippeur, Habitué…, read from their public card if it is plausible), outside the cap (see [Levels and badges](levels-and-badges.md#earning-xp)).
The notification "Nova, que vous avez invité, vient de finir sa première partie" (Nova, whom you invited, just finished their first game; "Elle compte parmi vos personnes invitées", They now count among your invited players) announces it with its sound, grouped if needed ("2 personnes invitées ont fini leur première partie", 2 invited players finished their first game); a click opens My public profile.
The Ambassador, Gatherer and Community builder badges follow their number.

**Files and tests.**
The choice, "Nobody", one's own certificate and those received are kept in `<data>\amis\invitations.json`; `app/src/invitations-service.ts` reads the machine's fingerprint (`CYBERPINBALL_MACHINE` replaces it for the dummy cabinets of the tests).
A cabinet older than this version ignores the certificates (`invites`) and does not show invited players.
Tests: [invitations.test.ts](../../packages/core/src/test/invitations.test.ts).

### Community and players online

**The Community medallion.**
On the wheel, right after the Juke-box and before the Collections medallion and the tables of each collection, a medallion on the shared chrome ring opens the community: its name in green, the number of players online and friends online below.
Everywhere (medallion, poster, System menu, "Joueurs en ligne" (Players online) tabs, phone), the number of players online, and that of your country, only shows above five, like the people present in a room: a nearly empty network, in figures, would put people off; players stay named, and your online friends are always counted.
Start opens the **home screen**, six doors: "Joueurs en ligne" (Players online), "Parties instantanées" (Instant games, see below), "Mes amis" (My friends, with the badge of received requests), "Messages" (messaging between friends), your country's room (see "Rooms by country" below) and "Classements" (Leaderboards), which opens on two doors, "Joueurs" (Players) and "Tables".
"Joueurs" (Players) ranks players by their XP, in Friends, National and Worldwide tabs (Start or MagnaSave goes from one to the next), for the week (XP earned since Monday, back to zero every Monday) or of all time (the flippers switch between them).
It opens on National · This week (Worldwide without a chosen country): the week first, where everyone has a chance.
Each line gives the rank, the flag, the player's avatar with their level and presence, their nickname and their XP, the other period in small print ("12 400 XP au total" (12,400 XP in total), "+850 cette semaine" (+850 this week)); tied players share the same rank.
It counts the players whose public card the cabinet has received, which carries, signed, the week's XP and its Monday (the card of a cabinet not yet up to date is only ranked in All time), and you, even with your public profile turned off.
Your line, "(vous)" (you), always stays visible, set apart beyond the first fifty; under the board, your place ("National · Cette semaine : votre place, 37 sur 120 joueurs" (your place, 37 of 120 players)).
A total impossible for anyone (beyond everything that could be earned since levels arrived, allowing for the XP brought by invited people), or a week beyond what a week allows, is not ranked: it is counted under the board ("1 joueur écarté (XP impossibles)" (1 player set aside, impossible XP)).
A total that is only unexpected for how long the player has been known to this cabinet is ranked, their level shown as "?".
With sharing off, the door is greyed with its reason; without a country, National says "Pays non choisi : Mon compte > Mon pays" (Country not chosen); without friends, Friends says "Aucun ami pour l'instant" (No friend yet).
Exit returns to the two doors, where the "Joueurs" (Players) door sums up your place: "Vous : niveau 14 · 37ᵉ au monde cette semaine · 3ᵉ dans votre pays" (You: level 14 · 37th worldwide this week · 3rd in your country).
"Tables" shows all your tables, the five most recently played first ("Jouées récemment" (Played recently), with "hier" (yesterday), "il y a 3 j" (3 d ago)), then all the others from A to Z, in This cabinet, Friends, National and Worldwide tabs, each counting its ranked tables ("3 sur 42", 3 of 42), over the chosen period ("Période": All time, This year, This week, Today; Start goes to the next).
It opens on Worldwide · All time (This cabinet when sharing is off), the cursor on the search.
A ranked table tells the leader, their score, the number of players (of games, for This cabinet) and your place, with "Premier" (First) in green when you lead; a table without a ranking stays in the list, greyed, with its reason (no score over the period, fingerprint being computed, unreadable version).
"Rechercher une table" (Search for a table), at the top of the list, filters by name with the on-screen keyboard or the PC's, without accents or capitals: each word typed starts a word of the name or is found in the name written without spaces ("comete" finds "Comète").
During a search, the tables follow from A to Z; "Effacer la recherche" (Clear the search) brings them all back.
Start on a table opens its leaderboard at the same scope and period, whose "Back" returns to the list of tables.
In a scoreboard, as in "Joueurs" (Players), Start or MagnaSave goes to the next scope, the flippers change the period and Exit goes back: a cabinet whose MagnaSave buttons confirm and go back in the OS can thus change scope.
The player ranking is computed by `playerBoard` in `packages/core/src/playerranking.ts`, the screen in `app/src/rankings-menu.ts`; tests: `packages/core/src/test/classement-joueurs.test.ts` and `packages/core/src/test/classements-global.test.ts`.
Exit goes back to the wheel.
The medallion can be hidden in System menu > Tables > Wheel ("Communauté dans la roue", Community on the wheel); it never shows in guest mode.
Chosen on the wheel, it shows its **poster**, like the Juke-box: behind the wheel (the whole playfield on a cabinet, the playfield frame on a desktop) and in place of the backglass media.
Both posters give the figures (players online, those from your country, your friends) and the friends online (otherwise unread messages); with sharing turned off, they say how to turn it on.
The playfield one also shows your level (its tier and bar), your place in the worldwide ranking and in your country, and your week in one line ("Cette semaine : +850 XP · 37ᵉ au monde · 3ᵉ dans votre pays", This week: +850 XP · 37th worldwide · 3rd in your country); a place not known yet keeps its box, greyed out, with its reason ("Pas encore classé", Not ranked yet; "Pays non choisi", Country not chosen).
Your country's room, with those present and its last line, only appears on the backglass poster.

**Players online.**
Also at the top of System menu > Community.
Every player your cabinet has come across, friends or not (the network directory, your friends, the players from the leaderboards), **those online first**: your **friends online**, then the players from **your country**, then the others; in each group, those playing first, then by name.
Then, under "Hors ligne" (Offline), all the others: your friends first, then the most recently seen ("Vu il y a 3 j", Seen 3 days ago).
Each line carries the player's badge, their flag before their name (the Cyber Pinball flag, a comet ball, for a player who has not given their country; the same in the leaderboards and chat rooms), a green ring around the badge when they are connected, and below it what they are doing ("En partie", Playing, with the table between friends; "En ligne", Online; "Vu il y a 3 j", Seen 3 days ago) and what you have in common ("6 tables en commun", 6 tables in common; "Sur votre réseau local", On your local network); "Ami" (Friend, outside the friends section) or "Demande envoyée" (Request sent) on the same line.
The **current table** is only shown between friends.
MagnaSave goes from one **filter** to the next, as tabs above the list: Tous (All), Mon pays (My country), À proximité (Nearby: the local network), Mêmes tables (Same tables: players whose ranked scores are on tables you have, the most tables in common first).
A filter that cannot show anything stays visible, greyed out, its reason in place of the number ("Réseau local coupé", Local network off; "Pays non choisi", No country chosen).
Start on a player, friend or not, opens their profile (a friend's presence and library; friend request, likes, blocking).

**Appear online to everyone.**
On by default.
Turned off (at the bottom of "Joueurs en ligne", or in My account > "Ce que voient les autres", What others see), you no longer appear to players who are not your friends; your friends still see your status, and you still see the list.
On the phone, the Community tab has a "Joueurs" (Players) tab: the same list, with the requests received, the filters as chips and each player's profile (see [Community on the phone](community-on-the-phone.md#community-on-the-phone)).

**Without a server.**
Every two minutes each cabinet signs a small signal (`live`: its key, nickname, country, "online" or "playing", the time; never the table), sent to the linked cabinets, and at once when it starts or ends a game.
Each cabinet checks the signature, keeps the most recent one per player and relays only what is new, so the spreading stops by itself.
A player is "online" as long as their last signal is less than five minutes old: they may appear one or two minutes after connecting, and stay listed up to five minutes after leaving.
A signal that is too old, dated more than a minute in the future or modified is refused; those of a blocked player are dropped.
Nothing is written to disk.
The module is [livepresence.ts](../../packages/core/src/livepresence.ts), the screen `app/src/community-menu.ts`.

**Tests.**
[livepresence.test.ts](../../packages/core/src/test/livepresence.test.ts): signed signal, refused if changed, too old or from the future; the most recent wins, only the new one is relayed; groups, order and filters of the list; between two cabinets that are not friends (test network on 127.0.0.1), "online" arrives, "playing" without the table, the option cuts the signal.

### Instant games

A live game open to everyone, friends or not.
A player opens it, chooses the number of players, and it shows up in the Community of every cabinet online; anyone can join it, and **as soon as it is full, it starts by itself for everyone**.
The game itself is the one played between friends (see "Community: the cabinet network"): each player plays on their own cabinet, the same version of the table, with the host's settings, a common start and everyone's results.

**Opening a game.**
Community > Parties instantanées (Instant games) > "Ouvrir une partie instantanée" (Open an instant game): the table (your VPX tables), then the number of players, yourself included (2, 3 or 4).
Also from a table's sheet: "Partie instantanée" (Instant game), right after "Jouer avec un ami" (Play with a friend).
The waiting room opens: "Waiting for 2 players", the players already there and the free seats.
Each arrival brings a notification ("Tiltman joined your game") and a line at the top of the room ("1 more player and it starts").
"Annuler la partie" (Cancel the game) removes it from every list, and players who had joined are told.
A game that is not full within thirty minutes closes by itself.
One game at a time: opening another one closes the previous one.
On the phone, Community > Players shows the open games and "Ouvrir une partie instantanée" (Open an instant game) (see Community on the phone).

**Joining.**
Community > Parties instantanées: the games opened by others, most recent first.
Each line shows the host's badge and flag, the table, how long it has been open, how many players are there, the seats left, and what you have of the table: "Same version", otherwise the line is greyed out with its reason ("You have another version of this table", "You don't have this table").
Start on a playable game: the table is checked on your cabinet, then you enter the host's room ("Connecting to Kiko's cabinet…" while the two cabinets reach each other).
"Quitter la partie" (Leave the game) frees your seat.
Arriving too late, the screen says so: "Kiko's game is full", or already started.

**Between strangers.**
Only the game's messages travel between its players: no library, no messaging, no current table.
A player who is blocked, or banned from the rooms by moderation, does not see your games and cannot join them; theirs are not offered to you.
After the game, "Rejouer avec les mêmes joueurs" (Play again with the same players) only re-invites your friends.
Unavailable in guest mode, and without sharing (the door is greyed out with its reason).

**No server.**
The host signs a small announcement (`instant`: the table, its fingerprint and the script's, the number of seats, the players already there, open or closed), which travels from cabinet to cabinet like the public presence.
It signs it again every 20 seconds and at each arrival; an announcement older than one minute is no longer shown (cabinet switched off, network down).
At the start or on cancellation, a "closed" announcement removes it everywhere without waiting.
To join, the player's cabinet reaches the host's by its key and sends it `game-join` (repeated every 3 seconds, given up after 45 seconds without an answer); the host adds them if a seat is left, otherwise answers `game-cancel` with the reason (`full`, `started`).
A game's players are its "partners": their cabinets reach each other by key, and the live game's messages (`game-*`) travel between them as between friends.
The module is [instantgames.ts](../../packages/core/src/instantgames.ts), the screens `app/src/instant-menu.ts` and `app/src/live-game-menu.ts`, the service `app/src/live-game.ts`.

**Tests.**
[parties-instantanees.test.ts](../../packages/core/src/test/parties-instantanees.test.ts): the announcement is signed and refused if changed, too old or from the future; the list leaves out mine, full ones, closed ones and those of an excluded player; a player gets in while a seat is left, never beyond; on three cabinets that are not friends, everyone joins and the full game starts for all, a fourth one arriving too late is told; a seat that is left opens up again; and on the cabinet network on 127.0.0.1, the announcement travels between strangers, the game too between its players, messaging does not.

### Groups

Circles of your own, public or private: a chat, a table of the week and the group leaderboard, seen by its members only.
You enter through the "Groupes" (Groups) door of the Community home screen, between Messages and your country's room; it gives the number of groups and the latest news (or how many public groups are waiting), and carries the red dot when a message is waiting or an invitation has arrived.

**Public or private.**
A private group (the default choice) appears nowhere: you only get in by invitation.
A public group appears in the public group list of every cabinet, and any player joins it with one press; you can also invite your friends to it.
Either way, the chat, the table of the week and the leaderboard stay between members: the list only shows the name, the members, the creator and the table of the week.
The creator chooses the access when creating the group, and changes it later in "Membres" (Members: "Accès : public" or "Accès : privé", Access: public or private); a group made private leaves the list at once, its members stay.

**Groups.**
First "Mes groupes" (My groups), one line per group: its name (a padlock if it is private, three players if it is public), its members as badges, how many they are and the latest fact (the last message, or who leads on the table of the week); "2 nouveaux" (2 new) when messages are waiting.
Then "Groupes publics" (Public groups), those the other cabinets have announced and you are not a member of, the biggest first: the name, the members as badges, how many they are, the creator and the table of the week.
Then "Créer un groupe" (Create a group), "Invitations reçues" (Invitations received, greyed out without an invitation) and "Retour" (Back).

**Joining a public group.**
Start on a public group: its preview, with the members, their presence and the table of the week ("déjà dans votre borne", already on your cabinet, or not), never the messages.
"Rejoindre" (Join) brings you into the group: the chat arrives as soon as a member is online.
It is greyed out, with its reason, when the group has 20 members, or when its creator removed you from it: you then need an invitation.

**Create a group.**
The name (32 characters at most, with the on-screen keyboard or the phone), the friends to invite (tick boxes, online first; 20 members at most, invitations included), then the access: "Sur invitation seulement" (By invitation only, private), Start switches it to "Ouvert à tous" (Open to all, public), and back.
"Créer le groupe" (Create the group) sends the invitations right away; it stays greyed out while the group has no name.
Only a friend can be invited, by any member.

**A group.**
At the top, the table of the week: chosen by a member ("Choisir la table de la semaine", Choose the table of the week), for everyone, until the coming Sunday 23:59 (at least two days away); Start launches it.
A member who does not have it sees it greyed out, "pas dans votre borne" (not on your cabinet).
Then the chat, in bubbles like messaging (yours on the right, the author and time below, reactions as chips), and the group leaderboard: each member's best score on the table of the week since it was chosen, taken from the scores the leaderboards already relay (a score a member publishes counts by itself), "Record du groupe" (Group record) on the first.
The actions: "Écrire au groupe" (Write to the group: ready-made phrases, or the on-screen keyboard and the phone), "Choisir la table de la semaine", "Inviter des amis" (Invite friends, greyed out when all your friends are members or invited, or at 20 members), "Membres" (Members), "Quitter le groupe" (Leave the group).

**Messages.**
Start on a message: the seven emoji reactions, the phrases, "Écrire un message…" (Write a message…); on yours, "Supprimer ce message…" (Delete this message…, for everyone, after confirmation); on someone else's, "Signaler ce message…" (Report this message…).
500 characters at most, one line every 3 seconds and 20 in 10 minutes, as in the rooms; the rooms' word filter applies on display, and to the names of public groups.
A message that arrives in a group that is not on screen is announced by a notification ("Kiko · Les flippeurs du jeudi", the message below), everywhere, over VPX included; "Notifications du groupe" (Group notifications, in Members) turns it off for that group.

**Members.**
Each with their avatar, their flag, "Créateur" (Creator), and their presence (online, in a game, offline).
Pending invitations follow, with who invited.
Then the group's access (the creator changes it, the others read it) and the group notifications.
The creator can remove a member or cancel an invitation (Start on the line); everyone can leave whenever they like.
A member who was removed or left no longer sees the group; their messages stay, signed with their name.

**Invitation received.**
A notification announces it ("Bruno vous invite dans « Les flippeurs du jeudi »", Bruno invites you to…), like a friend request.
The screen shows who invites, whether the group is public or private, the members and the table of the week ("déjà dans votre borne", already on your cabinet, or not), never the messages: they only arrive once the invitation is accepted.
"Accepter" (Accept) joins the group; "Refuser" (Decline) tells the inviter nothing more than "declined".

**On the phone.**
In the Community tab, "Messages" offers "Créer un groupe" (Create a group, opened on the cabinet) and "Groupes publics" (Public groups), then the invitations received, and shows your groups at the top of the conversations; a group's thread has its table of the week, its ranking, each message's author and its ⋮ menu (see Community on the phone).
As with messaging, the cabinet checks everything that goes out, in the front end as during a game.

**Report.**
The report goes encrypted for each moderator, like a room report (see "Room moderation").
It carries the message as its author signed it; the moderators see it under "Groupe" (Group), never the group's name.
A player excluded by the moderation can no longer write in a group: their messages no longer get through, nor their announcements.

**No server, no outside cabinet.**
A group is a series of lines each signed by its author (`grp`: creation with its access, invitation, arrival, decline, departure, removal, access change, message, reaction, message deletion, table of the week).
Each member's cabinet keeps the series and derives the group from it by replaying it in date order: a line from a player who was not a member at that time does not count; only the creator removes and changes the access; an arrival without invitation only counts if the group is public at that time, has room left and the player was not removed from it.
The members' cabinets connect directly by their key (like the players of an instant game), friends or not, and the messages go through no cabinet outside the group.
Every 20 seconds, and as soon as a member becomes reachable, each one first gives it its own lines (its arrival, if the member does not know it yet), then states with a fingerprint what it has of each group (`grp-sum`); a different fingerprint makes the other list its lines (`grp-have`), and the missing ones are sent.
A written message goes at once to the reachable members, who relay it: an absent member receives it from any other member when they come back.
An invitation (`grp-invite`: the membership lines and the table of the week, without the messages) goes to the invited friend's cabinet until it is acknowledged (`grp-invite-ok`); a decline goes to the inviter.
A public group announces itself to every cabinet (`grp-pub`): its membership lines and its table of the week, each signed by its author, and the announcement itself signed by the member who makes it; each member repeats it every 30 minutes and at each change, each cabinet relays it and keeps the latest of each group for seven days.
When "Groupes" opens, the cabinet asks the connected cabinets for their directory (`grp-pub-ask`).
A group made private announces itself one last time this way: each cabinet removes it from its list, and keeps that last announcement so that an older one still on its way does not bring it back.
Everything is kept in `<data>\amis\groupes.json`: 3,000 messages per group and one year at most, never the membership lines; a group you left is erased after 14 days, an unanswered invitation after 30, an announcement after seven days; the directory keeps 200 groups at most.
The module is [groups.ts](../../packages/core/src/groups.ts), the service `app/src/group-service.ts`, the screens `app/src/groups-menu.ts`.

**Tests.**
[groupes.test.ts](../../packages/core/src/test/groupes.test.ts): only members invite, write, react and choose the table; only the creator removes and changes the access; a message can only be deleted by its author; the order of arrival does not matter; a wrong signature, an edited text or a date in the future are refused; the invitation does not carry the messages and only counts coming from a member who invites me; a public group can be joined without invitation, never by a removed member; its announcement does not carry the messages, and is refused if edited or made by a non-member; a private group never announces itself; made private again, it leaves the directory and an older announcement does not bring it back.
On the test network on 127.0.0.1: Alice and Chloé, who are not friends, talk through a private group, a message written while Chloé is off reaches her when she comes back, Dora, outside the group, receives nothing, and her decline goes back to Alice; Eve, a stranger, finds Alice's public group in the directory (never her private group), joins it, receives its history and talks there; closed by Alice, it leaves Dora's directory and can no longer be joined.
Off-screen demonstration: fictional cabinets in `groupes` mode (Bruno creates a private group and invites the cabinet, Kiko opens a public group).

### Rooms by country

One public chat room per declared country, plus "Monde" (World, preferably in English).
You enter through the room door on the Community home screen (your country's room, or the one chosen as the default room), then "Autres salons…" (Other rooms…) for World, the active rooms of other countries, and every country by name.

**The log.**
Old-school, one line per message: the time, the flag, `<name>` in the hue of their key (the same as their badge) and the text, which wraps under it.
An action ("/me starts Star Courier") is written in italics; a line that mentions you (`@YourName`) is highlighted in blue; yours has its name in green; arrivals and departures ("→ Kiko joins") are more discreet.
Those present, with badge and flag, are in the side column (below on a cabinet); their number only shows (there, on the room door, the medallion poster, the room list and the phone) above five, so that a nearly empty room does not put anyone off.
A room you leave keeps you present for one more minute (`ROOM_LINGER_MS`): whoever comes by sees that someone was just there, and the "Écrire" (Write) screen does not make you vanish while you type a line.
Under each line, its reactions as chips ("👍 3", yours circled in blue).
The flippers browse the lines, Start opens the options of the chosen line: "Réagir" (React), the seven emoji reactions as tiles (👍 Like, ❤️ Love, 🥰 Care, 😆 Haha, 😮 Wow, 😢 Sad, 😡 Angry; one per player and per line, another one replaces it, Start on yours removes it), reply (your line starts with `@name`), see their profile, send a friend request, ignore this player in the rooms (their lines disappear, they are not told), block.
"Signaler ce message" (Report this message) sends it to the moderators (see "Room moderation").

**Deleting your line.**
Start on one of your lines: "Supprimer ma ligne…" (Delete my line…), then the confirmation.
It disappears from the room here and for the other players: a deletion signed by your key (`room-del`: the line ID, the room, the key, the time) travels from cabinet to cabinet like a line, and every cabinet keeps it seven days so a relay cannot bring the line back; it is also attached to the history given to whoever enters the room.
No one can remove someone else's line (moderation hides it).

**Writing.**
"Écrire dans le salon" (Write in the room): the first time, the room rules (respect, nothing personal, no advertising, we talk pinball, moderators are watching), accepted once for all rooms; "Lire seulement" (Read only) keeps the room open without writing.
Then, below the room's five latest messages (so you reply knowing what was just said), the ready-made phrases, as badges side by side ("Who wants a game?", "Anyone on …?" with the table chosen on the wheel, "Well played!"…), "Gérer les phrases…" (Manage phrases…) right after them, "Reply to @…" when someone mentioned you, the on-screen keyboard, or the phone: its QR code is in a band below the phrases, and once linked, the band says so.
The on-screen keyboard opens with "Écrire…" (Write…).
One line, 300 characters at most, no clickable links.
With a keyboard: "/me …" for an action, told in the third person as on IRC ("/me arrives" shows as "<YourName> arrives", in italics), "/ignorer name" to ignore a player.
The flippers always browse the keys of the on-screen keyboard, even after text typed on a real keyboard, on the phone or through the Windows emoji panel.

**Limits.**
One line every 3 seconds and 20 in 10 minutes at most per player: the cabinet says so ("Three seconds between two lines"), and every cabinet refuses to keep or relay a line beyond that, so an excess stops at the first cabinet.
The word filter, on by default, replaces rude words with asterisks on display.

**New messages.**
A line arriving in one of your rooms (your default room, and those you wrote in within the last 24 hours), that is not on screen, is announced in the menu by a discreet notification ("Kiko · France room", the line below; "3 new messages · France room" when they pile up).
It stays up to two minutes, gives way as soon as another piece of news is waiting, and leaves when the room opens; never over a game, nor in Recent activity.
A click opens that room.
Setting: "Nouveaux messages de mes salons" (New messages in my rooms).

**Mentions.**
A line that mentions your name, in a room that is not on screen, is announced by a notification ("Bruno mentions you · France room"), in the menu and over VPX during a game, unless "Mentions pendant les parties" (Mentions during games) is turned off or "Masquer les notifications pendant les parties" (Hide notifications during games) is chosen.
A click opens that room.
The room door on the home screen and the Community medallion count unread mentions.
They also count in the messages pill of the tables menu, one line per room on "Messages en attente" (Waiting messages).

**Community settings.**
System menu > Community > Réglages de la communauté (Community settings): appear online to everyone, rooms on or off (off, they stay visible, greyed out with their reason: for the family), default room (your country or World), word filter, mentions during games, new messages in my rooms (notification or nothing), ready-made phrases, ignored players (to stop ignoring), room rules.
In guest mode, the community is closed along with the system menu.

**Ready-made phrases.**
Community settings > Phrases préparées (Ready-made phrases), or "Gérer les phrases…" from "Écrire dans le salon": the list in the order of the badges, then "Ajouter une phrase…" (Add a phrase…), "Rétablir celles d'origine…" (Restore the original ones…) and "Retour".
A phrase is typed on the on-screen keyboard or on the phone, with the rules of a room line: one line, 300 characters at most; empty, too long or already in the list, it is refused and the reason is shown.
Twenty phrases at most: beyond that, "Add" is greyed out with its reason.
Start on a phrase: "Modifier…" (Edit…), "Monter" (Move up), "Descendre" (Move down) (the cursor stays on the button), "Supprimer…" (Delete…, after confirmation).
`{table}` in a phrase becomes the table chosen on the wheel; with no table chosen, the phrase is not offered.
The phone gets the same list.
The original phrases (six, "Thanks!" included) follow the cabinet language as long as they are not edited; the phrases are kept in `<data>\amis\salons.json` (`phrases`, absent: the original ones).

**On the phone.**
The Rooms tab of Community: the room is picked on the phone, independently of the cabinet; its last 60 lines, a line's options on a tap (react, reply, profile, report, block, delete your own), phrases in one tap and a field; you write there in the front-end as during a game.
The rules are accepted at the cabinet.

**Without a server.**
Each line (`room`: id, room, key, name, country, text, action or not, time) is signed by its author's key and travels from cabinet to cabinet; each cabinet checks the signature, drops a duplicate, applies the limits, keeps 7 days of lines (300 per room, 60 rooms at most) in `<data>\amis\salons.json`, and relays what is new.
When entering a room, the cabinet asks the linked cabinets (`room-ask`) for the last 100 lines of the last 24 hours.
Those present announce themselves with a signed signal (`room-here`) every two minutes while their room is on screen (and for one minute after leaving it), fresh for five minutes.
A reaction (`room-react`: the target line, the room, the key, the name, the reaction or `null` to remove it, the time) is signed the same way, relayed and kept seven days; only each player's latest one on a line counts, and the history given to whoever enters includes them.
A cabinet from before reactions ignores them.
A line that is too old, dated in the future, modified or spread over several lines is refused; those of a blocked player are dropped.
The module is [rooms.ts](../../packages/core/src/rooms.ts), the screen `app/src/rooms-menu.ts`.

**Tests.**
[rooms.test.ts](../../packages/core/src/test/rooms.test.ts): signed line, refused if changed, too old, from the future or on several lines; duplicate dropped; 3 s and 20-in-10-minutes limits; 24-hour history; tidying; mentions and word filter; file read back; those present fresh for five minutes; between two cabinets that are not friends (test network on 127.0.0.1), the rules first, the line written before the other arrives reaches them through the history, those present see each other, a line written now arrives at once.

### Room moderation

**Reporting.**
On a room line, Start then "Signaler ce message" (Report this message): you choose the reason (insults or harassment, spam or advertising, shocking content, personal information, other).
The report, signed by you, attaches the line as its author signed it (one cannot be invented) and is sent encrypted for each moderator: only they can read it, and the reported player does not know who reported them.

**The moderators.**
Their player keys are listed in a numbered charter, signed by the project key (the same as the update key) and shipped with Cyber Pinball; a more recent charter travels from cabinet to cabinet and replaces the old one.
Nobody else can claim to be a moderator.
A moderator's cabinet has the entry System menu > Community > Modération (Moderation): the report queue, the most reported messages first.
Opening a report shows the lines around the message, who reported it and why, and the decisions: hide the message, mute for 1 h, 24 h or 7 days (the message hidden too), ban from the rooms, lift a current sanction, or dismiss.
The same decisions are in a line's options, and "Sujet du salon…" (Room topic…) sets the line shown at the top of the room.
A new report is announced by a notification.

**The effects.**
Each decision is signed by the moderator's key, checked against the charter and applied by every cabinet: a hidden line shows "message masqué par la modération" (message hidden by the moderators); the lines of a muted player (during the mute) or of a banned player are no longer kept or relayed; their earlier lines stay.
The sanctioned player can still read the rooms; "Écrire dans le salon" (Write in the room) is greyed out with the decision, its end and its reason ("Muted until 22:40 · moderation decision · reason: insults or harassment").

**Without a server.**
Charter and decisions (`mod`) travel like the lines, and every hello gives the charter and the decisions in force.
A report (`report`) is encrypted for each moderator (the player's Ed25519 key converted to an X25519 key, libsodium) and delivered to their cabinet when it is linked, otherwise relayed by two cabinets at most.
Decisions and received reports are kept in `<data>\amis\moderation.json`; a mute that ended more than 7 days ago and a report older than 30 days leave it.
The charter is changed with `node scripts/charte-moderation.mjs --ajouter <key>` (or `--retirer`), which signs it with the project key; it ships with the next version.
The module is [moderation.ts](../../packages/core/src/moderation.ts).

**Tests.**
[moderation.test.ts](../../packages/core/src/test/moderation.test.ts): shipped charter signed by the project key, refused if changed or signed by another key; only a charter moderator's decision passes; hide, mute for its duration, ban, lift, topic; signed report attaching the real line; queue grouped, most reported first; between three cabinets (test network on 127.0.0.1), the report reaches only the moderator, their decision applies everywhere, the muted player can no longer write.

### Player avatars

Everyone customises an avatar, visible to all, friends or not, wherever their name is shown (public avatar, decided on 15/11/2026).
For now it is always a picture of one's own: a photo or a picture taken from the disk, or in the built-in browser, cropped with the cabinet buttons ([avatar.ts](../../packages/core/src/avatar.ts), screen `app/src/avatar-menu.ts`).

- **Where it shows.**
  "Mes amis" (My friends) (online, the badge's ring is green; offline, it dims), a player's profile (in front of their name, and their invited players), "Joueurs en ligne" (Players online), the rooms (their people present and their lines), the scoreboards, "Trouver un joueur" (Find a player) and the results, "Demandes d'amis" (Friend requests), "Depuis un ami" (From a friend), "Protéger et transférer mon compte" (Protect and transfer my account) (yours), the game history (each game's players as small badges, then each one in front of their rank), the lobby, the invitation and the results of a live game, the invitation card and the score band during the game, and notifications that are about a single player ("Bruno vient de se connecter", Bruno has just connected).
  Without a picture: the initials ("AM" for "Alexis Martin") on a dark hue taken from the key, the same on every cabinet.
  The score insert at the bottom of the playfield, too small for readable initials, keeps the hue only.
- **Choosing the picture.**
  System menu > "Mon compte" (My account) > "Mon avatar" (My avatar) (or "Mettre un avatar…", Add an avatar…, on the first launch's "Votre profil de joueur" screen).
  "Choisir une image sur ce PC…" (Choose a picture on this PC…) opens Cyber Pinball's file picker (.jpg, .jpeg, .png, .webp, .gif, .bmp, .avif, 40 MB at most).
  "Chercher une image sur le web…" (Search the web for a picture…) opens the built-in browser on an image search: right-click a picture, "Télécharger cette image" (Download this image) (offered on every free search, media included, since image search engines have no download link), and the browser closes onto the cropping screen.
- **Working picture.**
  The chosen picture is reduced to 1,600 pixels per side at most and redrawn as JPEG by Chromium's engine, in the hidden conversion page (`media-convert.ts`, `fitJpeg`): a photo loses its metadata there (EXIF, GPS position) and follows its orientation.
  It stays in `<data>\avatars\recadrage\` with its framing (`cadrage.json`): "Recadrer mon avatar" (Crop my avatar) goes back to it, even after a restart; without a working picture, the entry stays visible, greyed out, "Indisponible : choisissez d'abord une image" (Unavailable: choose a picture first).
- **Cropping with the buttons.**
  The whole picture, the kept square on top (the outside darkened, a green line, the circle the other players will see), and on the right the preview, large and at list size.
  The flippers choose a move, Start applies it, as many times as needed, the cursor staying on that move: "Valider ce cadrage" (Use this framing), "Zoom avant" (Zoom in), "Zoom arrière" (Zoom out) (one step: a quarter), "Déplacer vers la gauche" (Move left), "… la droite" (right), "… le haut" (up), "… le bas" (down) (one step: a tenth of the square's side), "Recentrer" (Recenter), "Choisir une autre image" (Choose another picture), "Annuler" (Cancel).
  The square never leaves the picture; at its closest, a tenth of its short side ("Zoom avant" greyed out, "Au plus près", As close as it gets); at its widest, the whole height or width ("Zoom arrière" greyed out).
  At the start, the largest square, centred; a portrait takes it a little higher, where the face is.
  With the mouse: drag the frame (it follows the pointer, the move is sent on release), the wheel zooms.
- **Saving.**
  "Valider ce cadrage" cuts the square into a 256-pixel JPEG (`cropJpeg`, quality 0.86, redone at 0.72 then 0.55 if it exceeds 96 KB), stored under its digest: `<data>\avatars\<sha256>.jpg`.
  The name changes with the content: nothing to invalidate in the renderer's cache, and two players with the same picture keep it only once.
  `social.json` keeps the file name (`avatar`), and the friends' ones (`peerAvatars`, by key).
  The file goes into backups ("Réglages et scores", Settings and scores) and into the account's backup copy (see [My account](my-account.md#my-account)): a restore or a takeover brings the picture back with its name.
  Windows read it through the `cyber-media://` protocol, whose folders include `avatars` (the windows laid over the game allow it in their security policy).
- **Exchange between cabinets.**
  The avatar's digest travels with everything the player signs or announces: the hello of each link (absent: no avatar; a cabinet from before avatars sends none and counts as having no avatar), the public presence signal, the presence signal in a room, the public profile card and the leaderboard scores.
  In both presence signals it has its own signature (`asig`, `avatarClaimText`): a cabinet from before the public avatar still verifies the signal, ignores the digest and does not relay it; tampered with on the way, the digest is dropped and the signal stays, without an avatar.
  A change is announced at once (`avatar`) to connected cabinets, and goes out again with the card and both signals.
  For a player who is neither a friend nor in a request, the digest kept is the one from the safest and freshest source (`publicAvatarHash`): their connected cabinet, their public presence, their room, their card, their latest score.
  The picture is asked for when it is displayed (`avatarFile`): from the player's cabinet if it is connected, otherwise from at most three connected cabinets that may have it (`avatar-get`, then `avatar-data`, in base64).
  A cabinet answers any cabinet that is not blocked: its current avatar, and another player's if it holds it and its digest is known (announced, signed or attached to a score); never a digest nobody announces.
  Friends and players with a pending request ask again for theirs as soon as it changes, as before.
  On receipt, the picture must have the announced digest, be a JPEG, PNG or WebP recognised by its bytes (never by its name), weigh 96 KB at most and measure 1,024 pixels per side at most, read from its header without decoding it: otherwise nothing is written.
  An unanswered request is repeated at most every 30 s.
- **Tidying.**
  A friend removed, a request declined or cancelled: their avatar leaves `social.json`; its file stays as long as its digest is known elsewhere (it is public), then goes.
  A blocked player: nothing of theirs is displayed or given.
  A changed avatar replaces the old one, whose file goes as soon as nobody carries it any more.
  Only files named like an avatar are touched, never the `recadrage` folder.

**Tests.**
[avatar.test.ts](../../packages/core/src/test/avatar.test.ts): type and dimensions read from the bytes, refusals (too heavy, too large, other digest, anything but base64), bounded framing, initials and hue, folder tidying, state read back.
[avatar-public.test.ts](../../packages/core/src/test/avatar-public.test.ts): the digest attached to the presence signals, signed apart, refused when tampered with, ignored by an older cabinet; the order of the sources.
[social-net.test.ts](../../packages/core/src/test/social-net.test.ts): three cabinets on a test network (127.0.0.1); the avatar shows at a player who is neither a friend nor in a request; changed, the new one arrives everywhere and the old file goes; a declined request forgets it from the state, not from the screen; removed, the initials come back; blocked, nothing any more.
[classements.test.ts](../../packages/core/src/test/classements.test.ts): the avatar attached to scores, then the new one without a score; a digest nobody announces is never given.

**Limits.**
A picture of one's own only: no ready-made avatars to choose from yet.
No round cropping: the square is sent, the circle is drawn by each cabinet.
An animated picture (GIF) becomes still.
