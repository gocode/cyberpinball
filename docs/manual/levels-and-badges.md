[Français](../manuel/niveaux-et-badges.md) · English · [Manual contents](../manual.md)

## Levels and badges

Players earn experience points (XP) by playing, by improving, in the weekly rankings, with their badges and through life between players.
XP raises a level that never goes down.
The level is always visible at the top of the tables screen, on the public profile and in the score tables.
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

Social life has its own cap: 100 XP a day (`DAILY_SOCIAL_CAP`).

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
The level never changes a place in a ranking.
Nothing counts in guest mode or during an unattended test.

### Badges

Fifty badges in eleven families: Journey, Play time, Explorer, Progress, Honor roll, Rankings, Online, Chat rooms, Between players, Discoveries and Secrets.
Each has a rarity: 17 common, 16 rare, 11 epic, 6 legendary.
The first eight badges keep their identifier, so friends still on an older version recognise them.
Secret badges stay hidden in "My badges" until they are earned: only their hint can be read.
A new catalogue series (`BADGES_SERIES`) grants once, without announcement, what the history already deserves.

Design: common badges in round Neon trim (chrome ring, neon tube, deep enamel, neon pictogram, four glowing rivets); rare, epic and legendary ones in Neon trim inside a hexagon with rounded corners, with six rivets (rare), twelve (epic) or six stars (legendary).
Rivets and stars glow in the rarity colour.

### What the player sees

- **Player card**, at the top of the tables screen, left of the pills: the avatar in its tier ring, the name, "LV. 14" and a thin bar; back from a game, the part just earned glows and "+85 XP" appears then fades.
  The badges pill next to it opens "My badges"; the card opens "My level".
  In guest mode, the card says "Guest · Games without XP".
- **My level**, first in the Community home: the bar and XP to go, this week's XP, the four latest gains, the current week's rankings with the expected XP, the two closest badges; then "My badges", "How to earn XP" and "My public profile".
- **Public profile**: the tier and level under the name, and the number of friends (never the list).
  Their **public groups** follow, as this cabinet knows them from the group directory (`playerPublicGroups`, [packages/core/src/groups.ts](../../packages/core/src/groups.ts)): name, number of members, table of the week; Start opens the group, or its directory page with "Join".
  A private group never shows there, not even their number.
- **Network score tables**: a "level" column between the name and the score, a pill in the tier colour, a dashed "?" for an implausible level.

### The badge moment

Back on the tables screen, never during a game or a loading, each badge earned gets its moment, about five seconds long ([app/renderer/niveau.js](../../app/renderer/niveau.js)).
The background depends on the badge family: Horizon (Journey, Play time, Explorer, Discoveries), Shock wave (Honor roll, Rankings), Rise (Progress), Swarm (Online, Chat rooms, Between players), Reveal (Secrets, with "Secret revealed").
When the level goes up during the moment, rays in the tier colour join in and "Level 15" appears; a legendary badge gets golden rays from the start.
The badge arrives, a beam follows its exact edge (circle or hexagon) with a spark at its head, then come the name, the condition, the rarity, the XP counting up and the level bar.
Several badges play one after another ("1 / 3"); any button closes the moment, except during the first second and a half, and it closes by itself eight seconds after the end.
On a desktop, the badge and text sit in a 9:16 column in the middle of the screen; the background covers the whole screen.

Two synthesized tunes go with it (interface sounds, see [Game media](game-media.md#interface-sounds)): "Chime" for a common badge, "Fanfare" for a rare, epic or legendary one, and "Level up" when the level rises.

### Files and tests

The level is kept in `<data>\amis\niveau.json`: XP, the forty latest gains, XP per day (caps, Marathon), personal bests per table, weekly ranking readings, the identifiers of likes and reactions already counted, the moment waiting to be shown.
An unreadable file is set aside (`niveau.json.illisible-<date>`) and the level starts again from the history; a file from a newer version is shown without being updated.

Tests: [levels.test.ts](../../packages/core/src/test/levels.test.ts) (curve, caps, personal best, table left open, weekly rankings and their Tuesday payment, social life, starting level, plausibility, file, invariants of the 50 badges).
