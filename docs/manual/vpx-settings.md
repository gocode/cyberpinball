[Français](../manuel/reglages-de-vpx.md) · English · [Manual contents](../manual.md)

## VPX settings

From the table menu, R key (or Exit then "Réglages de VPX" (VPX settings)); standalone: `npx electron app --reglages [--table=<morceau du nom>]`, launcher action "reglages".

- The list of settings is not hand-coded: `npm run vpx-schema` reads `src/core/Settings_properties.inl` from the VPX source code at the commit of the installed version (`sourceCommit` in the manifest) and writes `packages/installer/vpx-settings/<version>.json`.
  It adds the settings that plugins declare when they load, read from the `plugins/` folder of the same commit (`packages/core/src/vpx-plugin-settings.ts`): each plugin's `[Plugin.<id>] Enable` (`plugin.cfg`), the `MSGPI_*_SETTING` macros actually registered (`RegisterSetting`), and `[Backglass|ScoreView|Topper] Priority.<moteur>` for each rendering engine of the secondary windows.
  For 10.8.1-5436: 1,240 settings, 101 of them from plugins.
  Each plugin setting records the plugin that declares it: it has no effect when that plugin is off.
  With `-- --ini <VPinballX.ini>`, it checks that every setting in the schema appears in a file written by that version (except those of plugins VPX did not load); with `-- --check`, it fails if the committed file differs from the source code.
- "Essentiels" (Essentials) tab: a translated selection (`packages/core/src/vpx-essentials.ts`), including the groups "Backglass, PuP et DMD réel" (Backglass, PuP and real DMD) and "Dossiers communs à toutes les tables" (Folders shared by all tables).
  "Avancé" (Advanced) tab: the whole schema by section, with the original labels and descriptions, plus keys outside the schema (keys, options declared by tables) as read-only; an `[Input] Mapping.*` key is shown with the name of the action and of the key.
- Flipper buttons: move and pick a value; Start: edit, confirm; Exit: cancel, go back; Del: default value; mouse and wheel also work, with "‹ Retour aux sections" (Back to sections) or "‹ Fermer" (Close) under the brand.
- Keys written by Cyber Pinball (windows, plugins on or off, plugin priorities on the assigned windows, `SecurityLevel` and `AskToTurnOn`, which prevent VPX from asking questions during play (see [Launching a game](launching-a-game.md#launching-a-game)), `NudgeStrength`, which keeps the table still on screen (see [Tilt](tilt.md#tilt)), detected real DMD, button keys once the "Boutons" (Buttons) step is done, and audio outputs once the "Son" (Sound) step is done) are shown but cannot be changed, along with where their value comes from and how to change it.
- Writing: only the setting's line changes (`IniDocument`), with a timestamped backup (`writeWithBackup`).
  "Valeur par défaut" (Default value) leaves the key empty, which is the VPX convention.
- Per table (`openSettings({ scope: 'table', table })`): the `<table>.ini` file next to the .vpx, found the way VPX does it (table name, otherwise folder name).
  Only values that differ from the global setting are kept in it, as VPX does; an empty file is deleted.
  In a sandbox (`CYBERPINBALL_HOME`), it is written to `<bac à sable>\sandbox\tables\` and never next to the real .vpx.
