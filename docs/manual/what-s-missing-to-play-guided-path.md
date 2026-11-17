[Français](../manuel/ce-qu-il-manque-pour-jouer-parcours-guide.md) · English · [Manual contents](../manual.md)

## What's missing to play: guided path

A table that will not start almost always has a cause Cyber Pinball already knows (missing ROM, VPX not installed…), but the doctor often stopped at the finding ("ROM « t2_l8 » absente: put the file in the import folder") without saying where to find the file.
The **"Ce qu'il manque pour jouer" (What's missing to play)** screen leads all the way to the game: each step says where it stands and offers the next move, one press of Start away (or one click).

- **What it takes to play**: the `.vpx` file and, if its script asks for one, the ROM, when it is missing or unreadable for PinMAME (not linked, misplaced, scattered, old name without an alias).
  A ROM found through PinMAME's shared folder, or provided by an alias to a neighbouring revision, is enough.
  Nothing else holds "Jouer" (Play) back: DMD content, `.directb2s` backglass, PuP-Pack, media, DMD colours, alternative sounds, tidying the table are offered, never required.
  A single rule, in the core: [packages/core/src/playable.ts](../../packages/core/src/playable.ts) (`blocksPlay`, `playBlockers`, `requiredForPlay`).
  The doctor follows it (only ROM findings have the "error" severity; `playSeverity`, applied by `diagnose`, brings any other finding down to "warning"), and so do the path, the catalog's "Ce qu'il faut" ("indispensable", essential: the table and the ROM), the quick install, the details screen and the "Fichiers de la table" (Table files) inventory (`romBlockers`, which no longer say "ROM missing" when PinMAME finds it through its shared folder).
  Tests: `playable.test.ts` (every doctor rule, even marked "error") and the invariant checked on every trapped table (`doctor-traps.test.ts`).
- **Where to find it**: at the top of the details screen when the ROM is missing, or when a path is under way ("Reprendre : Étape 3 sur 4", Resume: Step 3 of 4); after a game that failed ("Start : voir ce qu'il manque pour jouer", Start: see what's missing to play); in the diagnosis, as soon as a finding keeps the table from playing; in the waiting list ("Reprendre : ce qu'il manque pour jouer <table>", Resume: what's missing to play <table>).
  Missing DMD content is offered on the details screen after "Jouer" ("Pour aller plus loin", Going further), never at the top.
- **Steps**: first the path up to "Jouer" (Play), numbered: "Borne et VPX" (Cabinet and VPX), "Table" (the .vpx file, and the ROM its script asks for), "ROM <name>" (if the script uses PinMAME), then "Jouer".
  At the top, "Étape n sur N" (Step n of N, the path only), a bar with one segment per step and "2 étapes réglées · 1 indispensable à faire · 1 amélioration proposée" (2 steps settled · 1 essential to do · 1 suggested improvement).
  Then **"Pour aller plus loin" (Going further)**: optional, without a number (a "+" sign) or a place in the count, never essential: "Rangement de la table" (Tidying the table: table outside its folder, script replaced by a `.vbs`, crash report), "Contenu du DMD" (DMD content, if the script loads a FlexDMD or UltraDMD folder), "Fronton" (Backglass, if the cabinet has a backglass screen), "PuP-Pack" (if the script loads one), "Affichage" (Display, if a table-specific setting needs fixing).
  Each step has its state, a word and a sign: "Réglé" (Settled), "À faire" (To do), "Conseillé" (Advised), "Attendu" (Waiting), "À installer" (To install), "Facultatif" (Optional), "En attente" (Pending), "Non vérifié" (Not checked).
  The current one is the first essential step not settled, otherwise "Jouer" ("Tout est prêt pour jouer", All set to play).
  Its moves come first, the advised one lit; then the first move of every other open step, the path then the improvements (a backglass, the DMD content), "Revérifier" (Check again) and "Diagnostic complet" (Full diagnosis).
- **DMD content**: the folder a FlexDMD or UltraDMD script loads (`.ProjectFolder = "./TheGooniesDMD/"`) is optional.
  Without it, the DMD's place keeps a default DMD: during a game, the ROM's, drawn by VPX's PinMAME and ScoreView plugins (§ "VPX plugins"); in the menu, Cyber Pinball's dot-matrix display (`fallback.js`).
  VPX 10.8.1's FlexDMD plugin hands `Nothing` back to the script for a missing image (`plugins/flexdmd/actors/Image.cpp`, commit af26b2d93): the DMD the script draws stays empty, and a script that does not expect it stops on "Type mismatch" (VPW's Goonies).
  The failed game then says so ("Le script s'est arrêté sur le DMD qu'il dessine…", The script stopped on the DMD it draws…), and the step offers "Récupérer la table d'origine" (Get the original table) or "J'ai l'archive de la table" (I have the table's archive); a folder emptied loose at the root of the table is put back in place.
- **Missing ROM**: Cyber Pinball looks in the VPS database (cached, no network) for ROM files of that name, the table's own game first, then the other revisions of the same game (`romSources`).
  "Récupérer la ROM t2_l8" (Get the t2_l8 ROM) adds it to the waiting list, attached to the table, and opens its page in the "Récupérer" window: you sign in and download yourself there.
  Cyber Pinball never downloads on the user's behalf from a forum that needs an account (§ "Finding a table" above).
  While waiting: "Rouvrir la page" (Reopen the page) and "Chercher dans Téléchargements" (Search Downloads).
  The received file ("Récupérer" window, watched Downloads folder) turns the step into "À installer" (To install): "Installer le fichier reçu" (Install the received file) shows the add plan (ROM library, link in the table), then comes back to the path, which reads the table again.
  A neighbouring revision already on the cabinet is offered second ("Jouer avec t2_l6, révision voisine", Play with t2_l6, neighbouring revision, with the warning from § "ROM library"), or first if the VPS database gives no link; a neighbouring revision given by the database comes last.
  Without a link: "Chercher t2_l8 dans le catalogue" (Search the catalog for t2_l8); always: "J'ai déjà le fichier" (I already have the file: drop it on the screen, or pick it on this PC), which also goes through the plan and comes back to the path.
- **Resuming later**: the state is read again at every opening (doctor's findings, waiting list, VPS database).
  The steps already shown are remembered in `<données>\parcours.json`, with the last position (step number and total, translated when shown, so the sheet follows a language changed since): a step settled since stays in the list, ticked, and "Step n of N" keeps its meaning.
  The path is forgotten when the game is started from it.
- **Code**: plan in [packages/core/src/journey.ts](../../packages/core/src/journey.ts) (`planJourney`, `romSources`, `journeyChoices`, remembered paths), tests in `packages/core/src/test/journey.test.ts` (trapped tables analysed by the doctor, from a missing ROM up to "Jouer"); screen in `app/src/journey.ts`, rendering `renderJourney` (`app/renderer/library.js`); catalog entry points (`fetchFor`, `reopen`, `scanDownloads`, `openSearch`) in `app/src/catalog.ts`.
  Mockups: `EcranParcours` and `EcranParcoursBureau` in the design system.

**What keeps a game from working**, what the doctor said about it, and what the path does:

| Cause | Doctor's finding | Before the path | Step and move in the path |
| --- | --- | --- | --- |
| VPX not installed | none: the script is not read, the ROM not checked | "Aucune table" (No table) message, VPX installation | "Borne et VPX": "Installer Visual Pinball X" (Install Visual Pinball X); the ROM waits ("En attente", Pending) |
| Cabinet not set up | none | wizard on first start | "Borne et VPX": "Configurer la borne" (Set up the cabinet) |
| Table loose in the tables folder | `outsideFolder` | move it | "Rangement de la table" (Tidying the table), going further: the same fix |
| Table folder, or one of its subfolders, whose name was damaged by a copy under Node 22 ("Ã‰tÃ©" for "Été") | `folderMangled` | none: the table showed up twice, or its pack could not be found | "Rangement de la table" (Tidying the table): move the contents under the real name |
| Unreadable script, replaced by a `.vbs`, or adapted for an older version | `scriptUnreadable`, `scriptOverride`, `scriptPatchStale` | `.vbs` to the recycle bin; Cyber Pinball's `.vbs` rewritten from the new script | "ROM" not checked; the `.vbs` under "Rangement de la table" |
| Script stopped by the VPX 10.8 core.vbs (`vpmInit` called twice: "cvpmFlips2.Init is called twice") | `scriptCoreCompat` | none: the game stopped at every launch | repaired by itself before the game (Cyber Pinball's `.vbs`); protected script: "Rangement de la table" says what to remove |
| Missing ROM | `romMissing`, without a fix | "put the file in the import folder" | "ROM": its page in the VPS database, "Récupérer" window, awaited then received for the table, plan, back to the path |
| Neighbouring revision on the cabinet | `romAlias` (blocking) | write the alias | offered second, after the exact ROM |
| Only another revision in the VPS database | none | nothing | "Récupérer t2_l6, révision voisine" (Get t2_l6, neighbouring revision), then the alias |
| Old VPinMAME name | `romAliasHistoric` | write the alias, or "bond.zip is needed too" | the fix, or the real ROM to get |
| ROM in the library, not linked | `romNotLinked` | link it | the same fix |
| ROM elsewhere in the table folder | `romMisplaced` | put it away | the same fix |
| Alias no longer needed | `romAliasObsolete` | remove the line | "Conseillé" (Advised) |
| Missing DMD folder | `dmdFolderMissing` (warning) | gather the loose files, otherwise "add it"; it used to be blocking | "Contenu du DMD", going further: the fix, or the original table to get ("J'ai l'archive de la table", I have the table's archive); "Jouer" right away |
| Missing or misnamed backglass | `backglassMissing`, `backglassMisnamed` | information, or rename | "Fronton", going further: rename, or the backglass that suits the screens |
| Backglass with no image at all ("Generic" placeholder left by another cabinet frontend): the VPX 10.8.1 B2S plugin crashes at the first frame (0xC0000005 in `plugin-b2s64.dll`) | `backglassEmpty` (`b2sWithoutBackglass`, an XML `.directb2s` with no `BackglassImage`, `BackglassOnImage` or `BackglassOffImage`) | move it to the recycle bin; done by itself on installation and before each game (`PUP_PLAY_REPAIRS`) | nothing to do: the table plays without a B2S backglass |
| PuP-Pack not found, one folder too deep, switched off by the script, option | `pupMissing`, `pupNested`, `pupDisabledByScript`, `pupOptionNotApplied`, `pupOptionUnsuited` | rename, move up, switch the pack on in a `.vbs`, apply the option | "PuP-Pack", going further: the fix, or the pack to get |
| Framing or screens forced by the table | `manualView`, `tableWindows` | remove the setting | "Affichage", going further |
| Screens changed, configuration to choose | none (seen at launch) | message before the game | outside the path: the launch opens the configuration choice |
| Another cabinet menu open | none (seen at launch) | "PinUP Popper est ouvert" (PinUP Popper is open) | outside the path |
| Joystick buttons VPX did not see | none (seen after the game) | redo the "Boutons" (Buttons) step | outside the path |
