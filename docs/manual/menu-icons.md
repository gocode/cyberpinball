[Français](../manuel/icones-des-menus.md) · English · [Manual contents](../manual.md)

## Menu icons

Every menu entry carries an icon of its own, and every screen opened from the system menu shows its entry's icon before its title: you can tell at a glance where you are.
The icons were drawn for Cyber Pinball, with no icon font and no online resource.

- **A single registry**: [app/renderer/icons.js](../../app/renderer/icons.js) draws each icon once (`CYBER_ICONS`, SVG geometry only on a 24 grid) and `cyberIcon(name)` places it in the page.
  Every window loads it before its scripts; the design system reads it too (`docs/design-system/src/icones.mjs`, "Icônes" sheet).
  The names known to the code are in [packages/core/src/icons.ts](../../packages/core/src/icons.ts) (`ICON_NAMES`, `IconName` type).
- **Declarative**: an entry picks its icon with an `icon` field — required on `SystemItem` (system menu), optional on `Action`, `Row` and `Built` (screen title) in `app/src/library.ts`; `WizardStep.icon` for the steps of "Configuration de la borne" (Cabinet setup), `EssentialGroup.icon` for the groups of the VPX settings.
  A screen opened from the system menu that declares no icon takes its entry's (catalogue, adding a table, ROMs, media), except a table's screens (game page, doctor…), titled with the game's name.
- **Drawing and sizes**: a 2-unit stroke for the whole family (`theme.css`, `.icon`), in the text color.
  For a 1,080 px short side: 30 px before a menu entry, 24 px from the label and aligned on its first line; 60 px before a title; 38 px for the gear (72 px click area); 22 to 26 px in the tabs and groups of the settings; never under 20 px.
- **States**: the icon follows its label (dark on the green bar, red at rest for a destructive action, dark on the red bar once selected); the "waiting for the user" dot sits at the top right of the icon, as on the gear.
- **No icon** before a value, a choice in a list, a table or a configuration: only before what opens or does something.
  "Retour" (Back) carries the `back` arrow in menus whose entries have icons.

**Adding an icon**: draw it in the right family of `icons.js` (`path`, `circle`, `rect`… elements and their geometry attributes only, live area 3 to 21), add its name to `ICON_NAMES`, declare it on the entry, rebuild the design system (`node docs/design-system/src/construire.mjs`) and look at it in the sheet, at 22, 30 and 60 px.

**Invariants**: [icons.test.ts](../../packages/core/src/test/icons.test.ts) (run by `npm test`) checks that the registry and `ICON_NAMES` have exactly the same names, that each drawing is geometry only within the 24 frame, that no two names draw the same icon, that every page drawing an icon loads the registry before its scripts, that no screen draws an SVG itself, and that the entries of "Configuration de la borne" and the settings groups each have their own.
On screen, the layout guard (`app/src/layout-check.ts`) reports an unknown icon, one smaller than 20 px, or the same icon for two entries of a menu (`data-icon-menu`).
