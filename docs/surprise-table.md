English · [Français](table-surprise.md)

# Surprise table

## Usage

From the table wheel, hold both flippers for 1.5 seconds. Short presses retain their usual navigation. The playfield overlay cycles through permitted logos for about three seconds, then waits for both flippers to be released before handing over to the existing launcher. If a logo cannot be displayed, its title remains visible.

Exit cancels. Either MagnaSave also cancels and gives priority to the guest unlock combination. Start, clicks and phone commands cannot launch a second game during the draw. The backglass and DMD retain their current presentation.

## Permissions

V1 never infers a table's content from its title or collection. An administrator opens its sheet, **Manage table → Surprise table**, then confirms either “family-friendly and playable” or “normal mode only and playable”. Adult, hidden and unverified entries remain excluded. Guests cannot grant or change these permissions.

Confirmations belong to each entry and this installation, in `table-surprise.json` in the data directory. They do not modify shared `.info` files. Variants remain distinct. An entry without confirmation is never sent to the draw renderer, even as an intermediate logo.

The draw uses the exact active collection, without navigation's fallback to All. Empty or missing collections launch nothing. In guest mode, only confirmed family entries in the enforced collection participate.

## Availability

Checks reread the files and engine actually used. VPX requires a recognised compatible format, an analysable script and an available ROM if requested. Future Pinball requires its FPT and launcher. The administrator must verify dynamic dependencies and pack operation before confirming an entry.

For Pinball FX, the administrator confirms ownership and accessibility of the table with the active Steam account. Confirmation is bound to that account and table ID. This does not query Steam's entitlement API. If the active account is unknown, or for Epic, FX3 and Pinball M, V1 excludes the entry. These engines remain normally usable outside the draw.

Fingerprints include sizes and modification times of the table file, any external script, the engine and recorded dependencies. Changes require a new confirmation. These checks guarantee neither all game data integrity nor the absence of a later crash; native launcher messages and protections remain active.

## Technical organisation

`packages/core/src/table-surprise.ts` contains the gesture, default-deny policy, uniform per-ID selection and cancellable session. Clock, randomness and launcher are injectable. A generation invalidates late results; the renderer decides neither the winner nor the launch.

`app/src/table-surprise.ts` provides local checks and administrative settings. Dependencies recorded during confirmation are retained so that holding the flippers does not extract or analyse every table again. These checks never use a game executable.

`frontend.ts` connects configured buttons, the exact collection, guest mode and the existing launcher. A shared reservation is acquired before `backups.yieldToGame()`, rechecked after that wait and released on every exit. Exit can invalidate preparation still waiting. Zen continuations reenter the same gate.

Menu joystick navigation is suspended during the playing phase before attempting to reclaim keyboard focus: Electron can still consider the menu active after Windows has handed the keyboard to VPX. Global button observers and the in-game settings menu remain available. Exit during a slow loading phase retains its usual behavior.

`app/renderer/table-surprise.js` and its stylesheet affect only the playfield, use existing local media, respect rotations and reduce motion when requested. The main process timer remains authoritative even if the renderer drops a frame.

## Validation

`npm run verifier -- table-surprise joystick-menu-game guestmode collections cinema i18n` checks policy, timing, cancellation, concurrent commands, files, focus and integration. The Electron test uses fictional files and an in-memory, muted window that is never shown. It covers all four rotations in 4K, FHD, title fallback and cancellation.

Also run `npm run build`, `npm run test:electron` and `npm test` before contributing. Real cabinet button, readability and engine launch checks remain separate human tests. Surprise table tests must never start a real game or DOF controller.
