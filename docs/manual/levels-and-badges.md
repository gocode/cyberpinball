[Français](../manuel/niveaux-et-badges.md) · English · [Manual contents](../manual.md)

## Levels and badges

Players earn experience points (XP) by playing, by improving, in the weekly rankings, with their badges and through life between players.
XP raises a level that never goes down.
The level is always visible at the top of the tables screen and of full-screen pages, on the public profile and in the score tables.
Rules: [packages/core/src/levels.ts](../../packages/core/src/levels.ts); badges: [packages/core/src/badges.ts](../../packages/core/src/badges.ts); tracking in the app: [app/src/level-tracker.ts](../../app/src/level-tracker.ts).

### Curve and tiers

Going from level *n* to level *n* + 1 takes 100 + 50 × (*n* − 1) XP (`levelNeed`): level 10 at 2,700 XP, level 20 at 10,450 XP.
Every ten levels, a tier gives its title and the colour of the avatar ring: Novice (Rookie, 1 to 9), Flippeur (Flipper), Habitué (Regular), Expert, Maître (Master), Sorcier (Wizard), then Légende (Legend) from level 60.

### Earning XP

| Action | XP | Condition |
| --- | --- | --- |
| Minute of real play | 1 | at most 60 per game; a game whose recorded scores are all zero (table left open) does not count its minutes |
| Game played to the end | 10 | at least 2 minutes, or a non-zero score |
| First game of the day | 20 | once a day |
| New table | 50 | first game on a table never played |
| Personal best beaten | 25 | once per table per day; a table's first score sets it without beating anything |
| Honor roll | 50 | an entry in the table's high-score list; 100 for first place |
| Online game played to the end | 20 | live, instant or group; 20 more for a win (first place, at least two ranked players) |

These game XP are capped at 600 a day (`DAILY_PLAY_CAP`).

| Social life | XP | Condition |
| --- | --- | --- |
| In the chat room | 10 | first message of the day in a chat room or a group |
| New friend | 25 | once per friend, even if removed and added again |
| Like received | 2 | each counts only once, remembered by its identifier |
| Reaction received | 1 | on a chat room line; same rule |
| Invited player | 100 | a player you introduced to Cyber Pinball finishes their first completed game; once per player, outside the cap (see [Invited players](friends-the-cabinet-network.md#invited-players)) |
| Tier of an invited player | 25 | every tier they reach (Flippeur, Habitué…), read from their public card if it is plausible; outside the cap |

Social life has its own cap: 100 XP a day (`DAILY_SOCIAL_CAP`), invited players aside.
Their gains show in "My level": "Personne invitée" (Invited player; "Nova a fini sa première partie", Nova finished their first game), "Une personne invitée progresse" (An invited player levels up; "Nova passe un palier", Nova reached a new tier).

**Weekly rankings**: the scoreboard week (Monday 0:00, cabinet time) is recorded while it runs, then paid on Tuesday, once late scores have arrived.
For each table, only the best of the three scopes counts: World 300, 150, 75, 25 (1st, 2nd and 3rd, 4th to 10th, 11th to 100th), country 150, 75, 40, friends 30, 15.
At least ten ranked players are needed in the world, five in the country, three among friends; at most ten tables count per week.
Once a week is closed, the cabinet no longer keeps all of the others' scores: the last reading can only lose a place, never gain one (`noteStanding`).

**Badges**: by rarity, 50 for common, 150 for rare, 400 for epic, 1,000 for legendary, outside the caps.

### Starting level and plausibility

On the first launch of the version, the level is worked out from the history already recorded (games and time in the `.info` files, tables played, records), at most 30,000 XP (`START_XP_MAX`), with no daily cap.
Badges the history already deserves are granted at the same time, without telling friends, and a single "Your starting level" screen presents them.
Friends and likes from before are counted without XP.

The level travels in the signed public card and in every published score (`xp` field, which only enters the signed text when present).
Each cabinet notes the day it first received a player's card; a level beyond what the caps allow since that day shows as "?" (`shownLevel`).
Each invited player checked on their card adds to what is allowed what they can earn, 250 XP (100 + 6 tiers × 25, `INVITED_XP_MAX`).
The level never changes a place in a ranking.
Nothing counts in guest mode or during an unattended test.

### Badges

Fifty-six badges in twelve families: Journey, Play time, Explorer, Progress, Honor roll, Rankings, Online, Chat rooms, Between players, Community, Discoveries and Secrets.
Each has a rarity: 18 common, 18 rare, 13 epic, 7 legendary.
The first eight badges keep their identifier, so friends still on an older version recognise them.
Secret badges stay hidden in "My badges" until they are earned: only their hint can be read.
A new catalogue series (`BADGES_SERIES`) grants once, without announcement, what the history already deserves.

**The Community family** (series 3) rewards those who keep Cyber Pinball alive:

| Badge | Rarity | Condition |
| --- | --- | --- |
| Ambassadeur (Ambassador) | rare | introduce one player to Cyber Pinball (one confirmed invited player, see [Invited players](friends-the-cabinet-network.md#invited-players)) |
| Rassembleur (Gatherer) | epic | five players |
| Bâtisseur de communauté (Community builder) | legendary | twenty players |
| Une voix qui compte (A voice that counts) | common | send a review, feedback or a suggestion (see [Feedback and ideas](feedback-and-ideas.md#feedback-and-ideas)) |
| Force de proposition (Idea machine) | rare | send ten |
| Son idée est dans le jeu (Your idea made it in) | epic | see one of your suggestions land in Cyber Pinball |

What counts as a contribution ([packages/core/src/feedback.ts](../../packages/core/src/feedback.ts), `<data>\retours\contributions.json`): a public suggestion as soon as it appears in the list as yours, and no longer once the team has hidden or merged it; a report written by the player, one a day at most, never a crash sent automatically.
A suggestion marked "done" grants "Your idea made it in" only once, with the notification "Votre idée est arrivée dans Cyber Pinball" (Your idea is now in Cyber Pinball; its title below), which opens My public profile.
To announce it without opening "Retours et propositions" (Feedback and ideas), the list is read again shortly after start, then twice a day, only if you have published there.

Design: common badges in round Neon trim (chrome ring, neon tube, deep enamel, neon pictogram, four glowing rivets); rare, epic and legendary ones in Neon trim inside a hexagon with rounded corners, with six rivets (rare), twelve (epic) or six stars (legendary).
Rivets and stars glow in the rarity colour.

### What the player sees

- **Player card**, at the top of the tables screen, left of the pills: the avatar in its tier ring, the name, "LV. 14" and a thin bar; back from a game, the part just earned glows and "+85 XP" appears then fades.
  The badges pill next to it opens "My badges"; the card opens "My level".
  In guest mode, the card says "Guest · Games without XP".
  The card and the badges pill also stay at the top of full-screen pages (System menu and its screens, My badges, help…), on the brand line, at the height of the other pills (`--pill-height`, [app/renderer/niveau.css](../../app/renderer/niveau.css)); never in attract mode nor in the Juke-box.
  There, "+85 XP" does not show (it would fall on the screen's title), and on a cabinet the card gives way while a notification is shown.
  The System menu gear, on their right, is a round pill of the same size (see [System menu](system-menu-five-sections.md#system-menu-five-sections)).
- **My level**, first in the Community home: the bar and XP to go, this week's XP, the four latest gains, the current week's rankings with the expected XP, the two closest badges; then "My badges", "How to earn XP" and "My public profile".
- **My badges**: each row carries the badge's drawing, in its shape and rarity ([app/src/level-menu.ts](../../app/src/level-menu.ts), `Row.medal`).
  An earned badge shines, with a halo in its rarity colour and a passing gleam; a badge not earned yet stays grey and unlit, without a gleam; a secret not earned yet shows only its padlock.
  The two closest badges, in "My level", have the same drawing.
  A badge not earned yet says what it is worth ("Play 100 different tables · +1,000 XP to earn"), secret badges included, after their hint.
- **Public profile** (see [Friends: the cabinet network](friends-the-cabinet-network.md#public-profile-and-likes)): the tier and level under the name; then, after the country, the number of friends (never the list) and the high scores, the level line with its bar ("Flippeur · niveau 14", "350 / 750 XP") and their badges as medals, the rarest first (twelve at most, "23 badges sur 56", 23 badges out of 56).
  Under each medal, its full name, on two lines if needed, never cut in the middle of a word ("Ambassado / r"), then the XP it is worth ("+150 XP"), in its rarity colour.
  The card of a cabinet that does not have this version yet has no level: "Niveau pas encore connu" (Level not known yet).
  Their invited players come next ("A fait découvrir Cyber Pinball à 3 joueurs", Introduced 3 players to Cyber Pinball, with their avatars).
  On your own profile, the row recalls the scale: "+100 XP per invited player, +25 XP for each of their tiers; Ambassador badge from the first one".
  As long as you have invited no one, the section says "Introduce your friends to Cyber Pinball", with the same scale; another player's profile has no section without invited players.
  Their **public groups** follow, as this cabinet knows them from the group directory (`playerPublicGroups`, [packages/core/src/groups.ts](../../packages/core/src/groups.ts)): name, number of members, table of the week; Start opens the group, or its directory page with "Join".
  A private group never shows there, not even their number.
- **Network score tables**: a "level" column between the name and the score, a pill in the tier colour, a dashed "?" for an implausible level.

### The badge moment

Back on the tables screen, never during a game or a loading, each badge earned gets its moment, about five seconds long ([app/renderer/niveau.js](../../app/renderer/niveau.js)).
The background depends on the badge family: Horizon (Journey, Play time, Explorer, Discoveries), Shock wave (Honor roll, Rankings), Rise (Progress), Swarm (Online, Chat rooms, Between players, Community), Reveal (Secrets, with "Secret revealed").
When the level goes up during the moment, rays in the tier colour join in and "Level 15" appears; a legendary badge gets golden rays from the start.
The badge arrives, a beam follows its exact edge (circle or hexagon) with a spark at its head, then come the name, the condition, the rarity, the XP counting up and the level bar.
Several badges play one after another ("1 / 3"); any button closes the moment, except during the first second and a half, and it closes by itself eight seconds after the end.
On a desktop, the badge and text sit in a 9:16 column in the middle of the screen; the background covers the whole screen.
Its stars and dust spread over the whole width, on both sides of the badge, and the swarm centres on the column (test: [moment-fond.test.ts](../../packages/core/src/test/moment-fond.test.ts), for each background).

Two synthesized tunes go with it (interface sounds, see [Game media](game-media.md#interface-sounds)): "Chime" for a common badge, "Fanfare" for a rare, epic or legendary one, and "Level up" when the level rises.

### Files and tests

The level is kept in `<data>\amis\niveau.json`: XP, the forty latest gains, XP per day (caps, Marathon), personal bests per table, weekly ranking readings, the identifiers of likes and reactions already counted, the last tier paid for each invited player (`invitees`), the moment waiting to be shown.
An unreadable file is set aside (`niveau.json.illisible-<date>`) and the level starts again from the history; a file from a newer version is shown without being updated.

Tests: [levels.test.ts](../../packages/core/src/test/levels.test.ts) (curve, caps, personal best, table left open, weekly rankings and their Tuesday payment, social life, starting level, plausibility, file, invariants of the badges), [invitations.test.ts](../../packages/core/src/test/invitations.test.ts) (invited players, their XP, Community badges, contributions), [entete-homogene.test.ts](../../packages/core/src/test/entete-homogene.test.ts) (the gear sized like the pills, the player card and its badges on full-screen pages).
