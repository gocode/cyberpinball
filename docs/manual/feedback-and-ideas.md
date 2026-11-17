[Français](../manuel/retours-et-propositions.md) · English · [Manual contents](../manual.md)

## Feedback and ideas

System menu > Cyber Pinball > "Retours et propositions" (Feedback and ideas): the public board of players' ideas and the feedback form, the same wherever you come from.
Four doors can lead there, never forcing you: this system menu entry; the screen of a failed game ("Flipper : signaler ce problème" (Flipper: report this problem), with the table and the VPX exit code already filled in); the tech sheet ("Envoyer un rapport" > "À l'équipe de Cyber Pinball" (To the Cyber Pinball team), technical report attached and description carried over); the phone app (⋮ menu > Feedback and ideas, and "Report this problem" on the failure screen).

**The board.**
Every player's ideas, most requested first, with tabs by kind (Problem, Improvement, New feature) and "Mine" (suggested or voted from this cabinet).
Each line shows its kind, its status (New, Under review, Planned, In development, Done, Not planned), its vote count, merged duplicates and the team reply.
Start opens an idea: "Vote for this idea", or "Remove my vote".
One vote per cabinet: the vote is signed by the cabinet's player key (the friends network one), which only counts a vote and is never returned by the service.
Public texts go through the rooms word filter.

**The form.**
The kind, a title (4 to 90 characters) and an optional description, on the on-screen keyboard or the phone, and "Attach the technical report" (on by default for a problem).
As soon as the title is written, similar ideas show up ("Already suggested? Vote instead", `similarProposals`: shared meaningful words, ignoring accents and plurals).
"Publish" makes it public right away, its author voting for it (five a day per cabinet at most); "Send to the team only" only makes a private message.
The title and description are public; the technical report never is.

**Private reports.**
The technical report is the [tech sheet](tech-sheet.md#tech-sheet) ZIP, anonymised the same way, with an envelope (kind, text, table, version, language, random cabinet identifier).
It is **sealed on the cabinet** for the project's "retours" key (X25519 and AES-256-GCM, `sealReport`, `CPR1` header): the service keeps bytes it cannot read, and only the team opens them.
Offline, it waits in `<data>\retours\attente` and goes again at startup, then every 30 minutes (twenty at most, dropped after 30 days).

**Automatic crash reports.**
At the first VPX crash, when leaving the failure screen, a question: "Send crash reports?" ("Yes, at every crash", "No", "Describe what happened", "See what the report contains").
The answer is kept in `<data>\retours.json` and can be changed in Feedback and ideas.
With consent, every VPX crash, and those of Cyber Pinball (uncaught exception, native crash found at the next startup), goes by itself, the same crash once a day at most (`crashDue`).

**The service.**
The project Worker at `t.cyberpinball.com` (the same as the phone's stable address), on a Cloudflare D1 database (`packages/service-telephone/worker.mjs`, `schema.sql`): `GET /api/propositions`, `POST /api/propositions`, `POST /api/votes` (signed, dated bodies, never replayed), `POST /api/rapports` (a `CPR1` box of 1.9 MB at most); management (`/api/admin/…`) requires the "retours" key signature.
Going live: `node scripts/service-telephone.mjs d1` (once), then `deployer`.
The team changes the status of ideas, replies, hides or merges duplicates (the duplicate's votes go to the target, never twice) and reads the reports with the "retours" key, kept outside the repository.

Code: [packages/core/src/feedback.ts](../../packages/core/src/feedback.ts) (protocol, sealing, duplicates, consent); [app/src/feedback-service.ts](../../app/src/feedback-service.ts) (the service seen from the cabinet, the queue); [app/src/feedback-menu.ts](../../app/src/feedback-menu.ts) (the screens).
[feedback.test.ts](../../packages/core/src/test/feedback.test.ts) and [retours-service.test.ts](../../packages/core/src/test/retours-service.test.ts) pin the sealing, the signature, duplicates, consent, and that the cabinet and the service speak the same protocol.
