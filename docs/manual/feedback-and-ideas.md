[Français](../manuel/retours-et-propositions.md) · English · [Manual contents](../manual.md)

## Feedback and ideas

System menu > "Aide et infos" (Help and info) > "Retours et propositions" (Feedback and ideas): the public board of players' ideas and the feedback form, the same wherever you come from.
Five doors can lead there, never forcing you: this system menu entry; the failure screen of a game ("Flipper : envoyer un rapport aux développeurs" (Flipper: send a report to the developers), the problem already filled in) and a table's diagnosis ("Envoyer un rapport aux développeurs" (Send a report to the developers)), which send a private report in one press, the tech sheet attached, encrypted and anonymised, a description remaining optional; the tech sheet ("Envoyer un rapport" > "À l'équipe de Cyber Pinball" (To the Cyber Pinball team), technical report attached and description carried over); the phone app (⋮ menu > Feedback and ideas, and "Send a report to the developers" on the failure screen).

**The board.**
Every player's ideas, most requested first, with tabs by kind (Problem, Improvement, New feature) and "Mine" (suggested or voted from this cabinet).
Each line shows its kind, its status in its badge, its vote count, its author's nickname ("by Ressort"), merged duplicates and the team reply.
Each status has its own badge, with its icon and colour, to be told apart at a glance: "New" (sparkle) and "Under review" (eye) outlined, until the team commits to it; "Planned" (calendar), "In development" (gear) and "Done" (check mark) filled, once it does; "Not planned" (cross) dashed.
Start opens an idea: its text, its author with their flag and the date, its progress, the team reply, then "Supporters (12)", the players who voted for it, each with their flag, the most recent first; "Vote for this idea", or "Remove my vote".
The progress line carries the same badge as the list and says what the status means: "Not reviewed by the team yet", "The team is looking into it", "Accepted: it will come in a future version", "The team is working on it now", "Available in Cyber Pinball", "The team does not plan to do it".
Your nickname joins the supporters when you vote; votes given before nicknames arrived stay counted, without a name ("and 4 other players · Votes given without a nickname, before November 2026").
An idea suggested before nicknames arrived gets its author's nickname as soon as their cabinet is up to date, without them having to vote again; until then, it says "Author not named".
One vote per cabinet: the vote is signed by the cabinet's player key (the friends network one), which only counts a vote and is never returned by the service.
Public texts, translations included, go through the rooms word filter.

**In your language.**
Every idea reads in the cabinet's language: the service automatically translates the title, the description and the team reply into all of Cyber Pinball's languages as soon as the idea is published, and every hour picks up what is missing, ideas published before translation included.
Until it is translated, an idea shows as written.
A small note marks translated text: "translated from French" at the end of the line in the list; on the idea's page, "Translated from English" under the description ("Automatic translation · "See the original" for the author's text") and under the team reply.
"See the original" shows the idea as the author wrote it ("Original text, as the author wrote it"); "See the translation" goes back, and the choice holds until the next restart.

**The form.**
The kind, a title (4 to 90 characters) and an optional description, on the on-screen keyboard or the phone, and "Attach the technical report" (on by default for a problem).
As soon as the title is written, similar ideas show up ("Already suggested? Vote instead", `similarProposals`: shared meaningful words, ignoring accents and plurals).
They are compared in your language, translations included: an idea written in another language is found too.
"Attach files…" adds files from this PC (screenshots, logs, settings), chosen in Cyber Pinball's [file picker](downloads-and-file-picker.md#downloads-and-file-picker), with the flippers, the mouse or the keyboard; "Send a report to the developers" (failure screen, a table's diagnosis) has the same button.
Five files and 1.2 MB in all at most ("340 KB of 1.2 MB · private, read by the team only"); a screenshot that is too large is shrunk rather than refused ("image shrunk to fit"), and what could not be attached is said under the list (too large, a folder, unreadable, beyond five).
The files are listed under "Attached files · private"; Start on one of them removes it.
They are never public: with attached files, a private report is always sent, even when the idea is published.
"Send to the team only" comes first and only makes a private message ("Private: nothing is published"); "Publish publicly", next, makes it public right away, its author voting for it (five a day per cabinet at most).
For a reported problem, the private sending is highlighted; for an idea, publishing, so that other players can vote.
The title and description are public; the technical report and the attached files never are.

**Follow us.**
System menu > Help and info > "Follow us" gathers, in one list, the places where Cyber Pinball can be found: the Facebook page (French-speaking or English-speaking depending on the interface language), the video tutorials on YouTube, and GitHub, each with what you find there.
While a line is chosen, its QR code is under the actions, to aim the phone at; Start opens the page in the built-in browser.
In guest mode, with no browser, Start shows the QR code large.
A discreet "Nous suivre" (Follow us) line also leads there from Feedback and ideas, after sending feedback or a report, and from a table's diagnosis; its "Retour" (Back) goes back to where you came from.
On the phone, "Follow us" is in the ⋮ menu, and its links open straight on the phone, with no QR code.
The wizard also shows the QR code of the video tutorials under the "Quitter sans enregistrer ?" (Quit without saving?) question (see [Setup wizard and configuration menu](setup-wizard-and-configuration-menu.md#setup-wizard-and-configuration-menu)).
Code: [packages/core/src/follow.ts](../../packages/core/src/follow.ts) (the addresses), [app/src/follow-menu.ts](../../app/src/follow-menu.ts) (the screen); test: [follow.test.ts](../../packages/core/src/test/follow.test.ts).

**Private reports.**
The technical report is the [tech sheet](tech-sheet.md#tech-sheet) ZIP, anonymised the same way, with an envelope (kind, text, table, version, language, random cabinet identifier).
Attached files go into it under `pieces-jointes/`, with their name only, never their location on the disk; if they do not fit with the technical report, the latter is dropped and the envelope tells the team.
It is **sealed on the cabinet** for the project's "retours" key (X25519 and AES-256-GCM, `sealReport`, `CPR1` header): the service keeps bytes it cannot read, and only the team opens them.
Offline, it waits in `<data>\retours\attente` and goes again at startup, then every 30 minutes (twenty at most, dropped after 30 days).

**Automatic crash reports.**
At the first VPX crash, when leaving the failure screen, a question: "Send crash reports?" ("Yes, at every crash", "No", "Describe what happened", "See what the report contains").
The answer is kept in `<data>\retours.json` and can be changed in Feedback and ideas.
With consent, every VPX crash, and those of Cyber Pinball (uncaught exception, native crash found at the next startup), goes by itself, the same crash once a day at most (`crashDue`).
A crash whose automatic report has been sent has a 👌 box under the error, "L'équipe a été prévenue" (The team has been told); the flipper then only adds your details and attached files ("Ajouter des détails pour les développeurs" (Add details for the developers); "Send my files" when there are only files), the technical report not going again.

**The service.**
The project Worker at `t.cyberpinball.com` (the same as the phone's stable address), on a Cloudflare D1 database (`packages/service-telephone/worker.mjs`, `schema.sql`): `GET /api/propositions`, `POST /api/propositions`, `POST /api/votes` (signed, dated bodies, never replayed), `POST /api/rapports` (a `CPR1` box of 1.9 MB at most); management (`/api/admin/…`) requires the "retours" key signature.
The same service holds `/api/soutiens` (an idea's supporters), `/api/noms` (each cabinet's signed nickname, which names its ideas and votes), `/api/nouveautes` (reactions to [What's new](whats-new.md#whats-new)) and `/api/oubli` (erasing a deleted account).
It translates the ideas with Workers AI (m2m100 model), at publication then every hour; a failed translation never blocks publication and is tried again later.
Going live: `node scripts/service-telephone.mjs d1` (once), then `deployer`.
The team changes the status of ideas, replies, hides or merges duplicates (the duplicate's votes go to the target, never twice) and reads the reports with the "retours" key, kept outside the repository.

Code: [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts) (protocol, sealing, duplicates, consent); [app/src/feedback-service.ts](../../app/src/feedback-service.ts) (the service seen from the cabinet, the queue); [app/src/feedback-menu.ts](../../app/src/feedback-menu.ts) (the screens).
[feedback.test.ts](../../packages/core/src/test/feedback.test.ts) and [retours-service.test.ts](../../packages/core/src/test/retours-service.test.ts) pin the sealing, the signature, duplicates, consent, and that the cabinet and the service speak the same protocol; [retours-traduction.test.ts](../../packages/core/src/test/retours-traduction.test.ts) the translations, [feedback-etats.test.ts](../../packages/core/src/test/feedback-etats.test.ts) the status badges, [rapport-pieces-jointes.test.ts](../../packages/core/src/test/rapport-pieces-jointes.test.ts) the attached files.
