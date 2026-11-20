[Français](../manuel/mon-compte.md) · English · [Manual contents](../manual.md)

## My account

System menu > "Mon compte" (My account), at the top of the sections, gathers what is yours: what you need to get your account back on another PC, your nickname, your avatar, your country, your badges, your public profile, what others see and deleting the account.
The account is the cabinet's player key (see "Identity" in [Community: the cabinet network](friends-the-cabinet-network.md#community-the-cabinet-network)), with its nickname, country, friends, badges, level and avatar.
It lives in Cyber Pinball's data folder; the backup copy, the recovery code and the password also keep it elsewhere, for a reinstallation or another PC.
In guest mode, the section is closed, like the whole system menu.
On a cabinet that plays locally (System menu > Community > Local play), My badges, My public profile and What others see are removed; the other entries stay, and everything comes back with the community (see "Local play" in [Community: the cabinet network](friends-the-cabinet-network.md#community-the-cabinet-network)).

| Entry | What it does |
| --- | --- |
| Protéger et transférer mon compte (Protect and transfer my account) | The backup copy on this PC, the recovery code, the password, the encrypted copy on the server, and "Reprendre un compte sur cette borne…" (Take back an account on this cabinet…, see below). As long as neither the code nor a password protects the account, the entry says "Code de récupération à noter" (Recovery code to write down), with the red dot up to the gear; then "Protégé · copie de secours, code, mot de passe" (Protected · backup copy, code, password). |
| Mon pseudo (My nickname) | The nickname and the player's ID ("Alexis · identifiant A1B2-C3D4-E5F6-7890"); Start changes it with the on-screen keyboard (2 to 24 characters), and your friends and the directory receive the new one. |
| Mon avatar (My avatar) | The photo or picture every player sees next to your nickname: "Choisir une image sur ce PC…" (Choose a picture on this PC…), "Chercher une image sur le web…" (Search the web for a picture…), "Recadrer mon avatar" (Crop my avatar), "Retirer mon avatar" (Remove my avatar) (see [Player avatars](friends-the-cabinet-network.md#player-avatars)). Without an avatar, your initials on a hue taken from your key. |
| Mon pays (My country) | "D'après la région de Windows" (From the Windows region), then every country in alphabetical order, the current choice marked. It goes with your scores: it places you in the national ranking and shows, as a flag, in front of your nickname. |
| Mes badges (My badges) | The 56 badges, by family, earned (with their date) or still to earn (with their progress); secret badges only show their hint (see [Levels and badges](levels-and-badges.md#levels-and-badges)). |
| Mon profil public (My public profile) | What players who are not your friends see (level, badges, country, friends, high scores, invited players, public groups, recent activity), and who liked each of your high scores and badges. During the first month, "Qui vous a fait découvrir Cyber Pinball ?" (Who introduced you to Cyber Pinball?, see [Public profile and likes](friends-the-cabinet-network.md#public-profile-and-likes)). |
| Ce que voient les autres (What others see) | The public profile, scores published to the leaderboards and presence online to everyone, each on by default and turned off here (see below). |
| Supprimer mon compte (Delete my account) | What goes and what stays, then "Supprimer définitivement mon compte" (Permanently delete my account), with the cursor on "Annuler" (Cancel); the encrypted copy on the server and the password go with the account (see "Deleting your account (GDPR)" in [Community: the cabinet network](friends-the-cabinet-network.md#community-the-cabinet-network)). |

### Backup copy on this PC

Cyber Pinball automatically writes a copy of the account outside its own folder, in `%APPDATA%\CyberPinball\comptes`: at startup, every two minutes when the account has changed, and when closing.
An uninstall, a deleted Cyber Pinball folder or a reinstallation in another folder leave it in place.
It gathers into a single file `social.json` (the key, nickname, country, friends, badges), `amis\niveau.json` (XP and level), `compte.json` (what protects the account) and the avatar picture.
Each account played on this PC has its own, eight at most: beyond that, the oldest go.
It does not protect against a disk failure or a change of PC: for that, the recovery code, the password or a [backup](backups.md#backups).

**At first launch.**
A new installation that finds on this PC the copy of another account, as long as its own nickname is not chosen, opens the "Votre profil de joueur" (Your player profile) screen on "Un compte a été trouvé sur ce PC" (An account was found on this PC): the nickname, level, badges, friends and the date of the copy.
"Reprendre le compte de …" (Take back …'s account) opens the confirmation (see "Taking back an account" below); "Reprendre un autre compte…" (Take back another account…) leads to the other ways; "Créer un nouveau compte" (Create a new account) goes back to choosing the nickname, and the copy is not offered again until the next startup.
Exit decides nothing: the screen stays.
With no copy found, the "Votre profil de joueur" screen offers "J'ai déjà un compte…" (I already have an account…) before "Continuer" (Continue): the recovery code, the password or a backup.

### Recovery code

The player key is written as 24 words, which give it back on any PC, even offline, with no server at all ([recovery.ts](../../packages/core/src/recovery.ts)).
"Noter mon code de récupération…" (Write down my recovery code…) shows them numbered, four per line, with their QR code, which only holds the words as text, never an address.
Write them down on paper, or photograph the QR code with your phone; anyone who has them can take your account, and Cyber Pinball cannot find them again for you.
"Je l'ai noté" (I wrote it down) asks for two words picked at random, one after the other ("Mot n° 7", Word no. 7); if both are right, the code is noted ("Code de récupération noté : votre compte est protégé", Recovery code noted: your account is protected); a wrong word goes back to the previous screen with "Ce n'est pas le mot n° 7 : revoyez le code" (That is not word no. 7: check the code again).
"Plus tard" (Later) lets the entry keep reminding you of the code; once noted, "Revoir mon code de récupération…" (See my recovery code again…) shows it again.
The words are typed without accents or capitals, and the code carries its own check: a word copied wrong or two swapped words are refused.

### Password

Optional: "Créer un mot de passe…" (Create a password…) makes your nickname your login (ignoring capitals, reserved for you), with a password of at least 8 characters, typed twice.
The next screen recalls the login, the password's strength (Weak, Fair, Strong) and that a forgotten password cannot be reset: no email address is asked for, only the recovery code replaces it.
"Enregistrer" (Save) encrypts the account on the cabinet with the password, then sends it to the Cyber Pinball server, which cannot open it and does not know the password.
A login already taken is refused ("changez de pseudo, puis recommencez", change your nickname, then start again); without Internet, the action stays visible, greyed out, with its reason.
Once created, "Changer de mot de passe…" (Change my password…) and "Retirer le mot de passe" (Remove the password; the recovery code stays) take its place.
The service only accepts ten failed tries per hour and per login: beyond that, you have to wait, even with the right password, or use the recovery code.

### Encrypted copy on the server

As soon as the account is protected (code noted or password), an encrypted copy of the account goes to the project's service, then again when it changes, at most every 30 minutes ([vault.ts](../../packages/core/src/vault.ts)).
It is encrypted on the cabinet (AES-256-GCM) with a key derived from the player's key: the recovery code opens it with nothing else; with a password, scrypt derives from it what proves it to the service, which only keeps its hash, and what opens the copy's key.
The password, the code and the player key never leave the cabinet.
The line says "À jour le …" (Up to date on …), "Pas à jour" (Not up to date) when the service cannot be reached (new try on its own), or "Coupée" (Off).
"Ne plus garder de copie chiffrée sur le serveur" (Stop keeping an encrypted copy on the server) turns it off, and removes the password: the code then only gives back the key, without nickname, friends, level or badges; "Garder une copie chiffrée sur le serveur" (Keep an encrypted copy on the server) brings it back.

### Taking back an account

"Reprendre un compte sur cette borne…" (Take back an account on this cabinet…, in Protect and transfer my account, or "J'ai déjà un compte…" at first launch) offers:

- "Avec mon code de récupération…" (With my recovery code…): the 24 words, typed with the on-screen keyboard and separated by spaces, or pasted in one go from the phone (its camera reads the QR code, you copy the text and paste it); while some are missing, the screen keeps those already typed ("12 mots sur 24", 12 words of 24) with "Continuer à taper…" (Keep typing…), and an unknown word is named ("Le mot n° 5 « … » n'est pas dans la liste", Word no. 5 "…" is not in the list).
- "Avec mon pseudo et mon mot de passe…" (With my nickname and my password…): Internet is needed; without it, the action stays greyed out with its reason.
- "Depuis une sauvegarde…" (From a backup…): "Restaurer une sauvegarde" (Restore a backup) in [Backups](backups.md#backups), whose "Réglages et scores" (Settings and scores) part contains the account.
- "Copie de ce PC : …" (Copy on this PC: …): another account played on this PC, with its level, badges, friends and the date of its copy.

The account found is shown before anything changes, "Reprendre le compte de … ?" (Take back …'s account?), with the cursor on "Annuler" (Cancel): what comes back (nickname and avatar, level and XP, badges, friends, who recognise you without asking anything again) and what is replaced (this cabinet's account, with "notez d'abord son code s'il compte pour vous", write down its code first if it matters to you, when it has games or friends).
The tables' scores stay on the other cabinet: a "Réglages et scores" (Settings and scores) backup brings them back.
The code alone, without an encrypted copy on the server, only gives back the key: your friends recognise you, but the nickname, level and badges do not come back.
"Reprendre le compte de …" (Take back …'s account) erases this cabinet's account files, puts in those of the account taken back and restarts Cyber Pinball.
What goes wrong is said plainly, with "Réessayer…" (Try again…): wrong password, no account with this login, too many tries, unreadable encrypted copy, service unreachable.

### What others see

Your friends always see your presence, your current table and your games; for other players, three choices, on by default:

- **Public profile**: country, badges, high scores and recent activity; turned off, others only see your nickname in the directory.
- **Published scores** in the Friends, National and Worldwide leaderboards, never in guest mode; turned off, you see the leaderboards without your games entering them.
- **Presence online to everyone**: "En ligne" (Online) or "En partie" (In a game), never the table; turned off, others no longer see you in "Joueurs en ligne" (Players online).

The entry says how many items are kept for friends.

### Files and tests

`<data>\compte.json` keeps what protects the account, with no secret at all: the date the code was noted, the password's login, whether the encrypted copy is kept or turned off.
Code: [account.ts](../../packages/core/src/account.ts) (the account in one block, the backup copies), [recovery.ts](../../packages/core/src/recovery.ts) (the code), [vault.ts](../../packages/core/src/vault.ts) (the encrypted copy), `app/src/account-service.ts` (copy, sending, taking back), `app/src/account-menu.ts` (the screens), `app/src/profile-welcome.ts` (first launch); on the service side, `packages/service-telephone/worker.mjs`.
Test: [mon-compte.test.ts](../../packages/core/src/test/mon-compte.test.ts).
