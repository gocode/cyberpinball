[Français](../manuel/retours-et-propositions.md) · English · [Manual contents](../manual.md)

## Feedback and ideas

System menu > Cyber Pinball > "Retours et propositions" (Feedback and ideas): the public board of players' ideas and the feedback form, the same wherever you come from.
Five doors can lead there, never forcing you: this system menu entry; the failure screen of a game ("Flipper : envoyer un rapport aux développeurs" (Flipper: send a report to the developers), the problem already filled in) and a table's diagnosis ("Envoyer un rapport aux développeurs" (Send a report to the developers)), which send a private report in one press, the tech sheet attached, encrypted and anonymised, a description remaining optional; the tech sheet ("Envoyer un rapport" > "À l'équipe de Cyber Pinball" (To the Cyber Pinball team), technical report attached and description carried over); the phone app (⋮ menu > Feedback and ideas, and "Send a report to the developers" on the failure screen).

**The board.**
Every player's ideas, most requested first, with tabs by kind (Problem, Improvement, New feature) and "Mine" (suggested or voted from this cabinet).
Each line shows its kind, its status (New, Under review, Planned, In development, Done, Not planned), its vote count, its author's nickname ("by Ressort"), merged duplicates and the team reply.
Start opens an idea: its text, its author with their flag and the date, its status, the team reply, then "Supporters (12)", the players who voted for it, each with their flag, the most recent first; "Vote for this idea", or "Remove my vote".
Your nickname joins the supporters when you vote; votes given before nicknames arrived stay counted, without a name ("and 4 other players · Votes given without a nickname, before November 2026").
An idea suggested before nicknames arrived gets its author's nickname as soon as their cabinet is up to date, without them having to vote again; until then, it says "Author not named".
One vote per cabinet: the vote is signed by the cabinet's player key (the friends network one), which only counts a vote and is never returned by the service.
Public texts go through the rooms word filter.

**The form.**
The kind, a title (4 to 90 characters) and an optional description, on the on-screen keyboard or the phone, and "Attach the technical report" (on by default for a problem).
As soon as the title is written, similar ideas show up ("Already suggested? Vote instead", `similarProposals`: shared meaningful words, ignoring accents and plurals).
"Send to the team only" comes first and only makes a private message ("Private: nothing is published"); "Publish publicly", next, makes it public right away, its author voting for it (five a day per cabinet at most).
For a reported problem, the private sending is highlighted; for an idea, publishing, so that other players can vote.
The title and description are public; the technical report never is.

**Private reports.**
The technical report is the [tech sheet](tech-sheet.md#tech-sheet) ZIP, anonymised the same way, with an envelope (kind, text, table, version, language, random cabinet identifier).
It is **sealed on the cabinet** for the project's "retours" key (X25519 and AES-256-GCM, `sealReport`, `CPR1` header): the service keeps bytes it cannot read, and only the team opens them.
Offline, it waits in `<data>\retours\attente` and goes again at startup, then every 30 minutes (twenty at most, dropped after 30 days).

**Automatic crash reports.**
At the first VPX crash, when leaving the failure screen, a question: "Send crash reports?" ("Yes, at every crash", "No", "Describe what happened", "See what the report contains").
The answer is kept in `<data>\retours.json` and can be changed in Feedback and ideas.
With consent, every VPX crash, and those of Cyber Pinball (uncaught exception, native crash found at the next startup), goes by itself, the same crash once a day at most (`crashDue`).
A crash whose automatic report has been sent has a 👌 box under the error, "L'équipe a été prévenue" (The team has been told); the flipper then only adds your details ("Ajouter des détails pour les développeurs" (Add details for the developers)), the technical report not going again.

**The service.**
The project Worker at `t.cyberpinball.com` (the same as the phone's stable address), on a Cloudflare D1 database (`packages/service-telephone/worker.mjs`, `schema.sql`): `GET /api/propositions`, `POST /api/propositions`, `POST /api/votes` (signed, dated bodies, never replayed), `POST /api/rapports` (a `CPR1` box of 1.9 MB at most); management (`/api/admin/…`) requires the "retours" key signature.
The same service holds `/api/soutiens` (an idea's supporters), `/api/noms` (each cabinet's signed nickname, which names its ideas and votes), `/api/nouveautes` (reactions to [What's new](whats-new.md#whats-new)) and `/api/oubli` (erasing a deleted account).
Going live: `node scripts/service-telephone.mjs d1` (once), then `deployer`.
The team changes the status of ideas, replies, hides or merges duplicates (the duplicate's votes go to the target, never twice) and reads the reports with the "retours" key, kept outside the repository.

Code: [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts) (protocol, sealing, duplicates, consent); [app/src/feedback-service.ts](../../app/src/feedback-service.ts) (the service seen from the cabinet, the queue); [app/src/feedback-menu.ts](../../app/src/feedback-menu.ts) (the screens).
[feedback.test.ts](../../packages/core/src/test/feedback.test.ts) and [retours-service.test.ts](../../packages/core/src/test/retours-service.test.ts) pin the sealing, the signature, duplicates, consent, and that the cabinet and the service speak the same protocol.
