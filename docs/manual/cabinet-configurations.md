[Français](../manuel/configurations-de-la-borne.md) · English · [Manual contents](../manual.md)

## Cabinet configurations

The same installation can be used on several machines: three screens besides the main one on one PC, two on another, a cabinet.
`data\cabinet.json` holds all the **configurations**; each one is a complete cabinet model (screens by EDID fingerprint, roles, zones, flipper edge, diagonal, sound, buttons, keys left to the user) with its **own `VPinballX.ini`** and its own memory of the keys written.
Tables, ROMs, media, per-table settings and statistics stay shared.
Code: [packages/core/src/configurations.ts](../../packages/core/src/configurations.ts) (computation), [packages/core/src/store.ts](../../packages/core/src/store.ts) (files), [app/src/configurations-menu.ts](../../app/src/configurations-menu.ts) (screens), tests in [configurations.test.ts](../../packages/core/src/test/configurations.test.ts).

- **Migration**: a `cabinet.json` from before configurations becomes, the first time it is read, the "Borne" (Cabinet) configuration, taken over as is, which keeps `config\VPinballX.ini` and its memory; the old file is kept as `data\cabinet-v1.json`.
  Nothing to do.
- **Recognition** (at startup, before each game, `sync`): each configuration gets a score from the connected screens (`scoreConfiguration`): 100 per screen found by its serial number, 60 per screen found by model and port (weak fingerprint), 30 by model and size only (cable moved to another port), −50 per missing screen, −10 per extra connected screen.
  A configuration is a candidate with at least one screen found, at most one missing (a screen turned off) and no more extra screens than screens found.
  The only complete candidate is picked automatically; otherwise a choice already made for these same screens; otherwise the best candidate if it is alone with its score.
  A partly found configuration stays selected with a warning, and the sync warns about the role of the screen that is off (and blocks if it is the playfield), as before.
  Every choice is explained: "« Second poste » reconnue : 3 écrans sur 3 retrouvés (2 par numéro de série, 1 par modèle et port) — score 260, devant « Borne » (score -110)" ("Second poste" recognized: 3 of 3 screens found (2 by serial number, 1 by model and port), score 260, ahead of "Borne" (score -110)).
- **Ambiguity or no match**: nothing is written.
  The menu opens on the main screen with "Quelle configuration est branchée ?" (Which configuration is connected?): the known configurations, from closest to farthest with their score, "Nouvelle configuration" (New configuration) (full wizard) and "Plus tard" (Later) (the menu stays usable; a game asks for the configuration again).
  The choice is remembered for these screens (10 screen sets remembered) and the menu restarts on the right screens.
  On the command line: exit code 3, and `npm run sync -- --configuration "Nom"` makes the same choice.
- **Configuration change**: a sync finding ("Configuration changée : « Borne » à la place de « Second poste »…" (Configuration changed: "Borne" instead of "Second poste"…)) and a 12 s banner at the top of the menu, with no button to press.
- **System menu > "Borne" (Cabinet) > "Configuration de la borne" (Cabinet configuration) > "Configurations de la borne" (Cabinet configurations)** (its details name the active configuration, and say whether it is forced): the list with each one's score for the connected screens; for each one, "Utiliser avec ces écrans" (Use with these screens), "Toujours utiliser celle-ci" (Always use this one) (forced: recognition is suspended until "Reconnaissance automatique" (Automatic recognition)), "Écran du navigateur intégré" (Built-in browser screen) (where the "Récupérer" window opens, see [Screen and pointer](adding-a-table-the-funnel-the-catalog-recuperer.md#adding-a-table-the-funnel-the-catalog-récupérer-waiting-list)), "Renommer" (Rename) (on-screen keyboard, or a real keyboard), "Supprimer" (Delete) (configuration trash, restorable with its file; the last one cannot be deleted); "Nouvelle configuration" restarts the wizard with `--nouvelle-configuration`.
- **New configuration**: the wizard creates the configuration ("Poste à 3 écrans" (3-screen PC), to be renamed), remembered for the connected screens.
  Its `VPinballX-<id>.ini` file starts as a copy of the active configuration's file: hand-made settings that do not depend on the screens (graphics quality, physics, keys) carry over; the wizard then writes the screens, sound and buttons into it.
  "Assistant complet" (Full setup wizard) redoes the active configuration, and so does the "Boutons" (Buttons) step on its own.
- **One `VPinballX.ini` per configuration, rather than a single one rewritten at each switch**: VPX re-saves its file itself, and the user sets both managed keys (kept in `vpxManual`) and free keys in it.
  A single file would mean setting aside, then restoring, each machine's own values at every switch, and the detection of hand edits would mistake the other machine's values for tweaks: a value set by hand on one machine would be overwritten or lost on the way back.
  With one file each, syncing a configuration never touches another one's file, and the memory of keys written stays tied to its own file (the "bascule aller-retour" (round-trip switch) test).
  The trade-off: a general setting changed later (through "Réglages de VPX", VPX settings) only applies to the active configuration.
- **Safeguard**: all the application code goes through the active configuration's file (`activeVpxIni`, `syncConfiguration` in [app/src/vpx-ini.ts](../../app/src/vpx-ini.ts)); a test rejects any other access to `Locations.vpxIni`.
