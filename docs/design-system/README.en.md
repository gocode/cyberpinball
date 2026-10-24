English · [Français](README.md)

# Cyber Pinball — design system

The visual language of Cyber Pinball: tokens, components and screen mockups, following the art direction of October 22, 2026 (blue-green black, signal green, widely spaced wordmark), with a "smoked glass" background, a rail-ball-flippers cover and recomposed screens.

## Opening and regenerating

Open `index.html`: the design system page (foundations, colors, typography, spacing, 13 live components with their HTML code, 5 screens). `components/<Name>/preview.html` shows a single component at its reference size. These are static previews, without handling of the cabinet buttons. The pages load Saira from Google Fonts; offline, they fall back to Segoe UI.

From the repository root, with Node 22 or later:

```powershell
node docs/design-system/src/construire.mjs
```

It runs `icones.mjs` (icons, background and `components/bundle.css`), `composants.mjs` (previews and component notes), `tokens-css.mjs` (`tokens.css`) and `page.mjs` (`index.html`) in turn.

Sources, to edit instead of the generated files:

- `tokens.json`: colors, families, sizes, spacing, radii and glows.
- `src/base.css`: the `.cp-*` components; the last declarations, those of the revision, produce the final rendering.
- `src/fonds.css`: the "smoked glass" background.
- `src/icones.mjs`: the 36 icons (SVG masks).
- `src/composants.mjs` and `src/ecrans.mjs`: component examples and the composition of the five screens.
- `src/couverture.html`: the cover.
- `src/page.mjs`: the `index.html` page.

## Color principles

Background `void #030807`, panels `surface #07110f`, controls `surface-raised #0c1a17`. Rule `line-strong #24504a`, soft teal glow. Light is static and kept tight.

Green `signal #8be23a` marks the current choice or the primary action. PINBALL in the wordmark is the identity exception. Group subheadings and the OK state are green, as in the art direction; arrows, idle keys and captions are not. Only one control carries `.is-focus` in a screen mockup. When the focus is on "Jouer" (Play), the open tab is only a neutral marker.

States always keep a word and a sign: check mark + "OK", triangle + "À vérifier" (To check), cross + "Bloquant" (Blocking). Severity never depends on color alone: "OK" in `signal`, "À vérifier" in `warning` (amber `#f2b33d`), "Bloquant" in `danger` (red `#ff6b6b`), each with its sign and its word. A deletion keeps its explicit verb, its icon and, in the product, its confirmation. `meta #5fb4cf` is reserved for metadata.

The `dmd` orange belongs only to the fallback display. It is not a second interface accent.

## Typography and legibility

Family: Saira. The wordmark stays in light, widely spaced capitals; screen titles are in capitals, game titles keep their natural case. Body text at 24 px; titles of diagnostic findings at 28 px; **no text below 20 px** at the reference scale.

**Fonts:** the previews load Saira from Google Fonts. For the application, which must work offline, Saira (SIL Open Font License) will be bundled like the fallback fonts, from the google/fonts repository (`ofl/saira`, variable font in weight and width), in `app/renderer/polices/`. `src/base.css` already declares `local("Saira")`, then Segoe UI.

Computed contrasts: `ink` on `surface` 16.46:1; on `surface-raised` 15.34:1; `ink-muted` on `surface-raised` 7.59:1; `on-signal` on `signal` 11.88:1. Never put the white `ink` on a flat signal fill: its contrast is only 1.38:1.

## Ambient background and missing media

`.fond-ambiance` dresses the available space behind the panels; `.fond-media` frames an empty slot. `.cp-art` adapts the same smoked glass to the media of the components. A missing media item is named, with no fake table artwork. The inner frame must not appear on media that is actually loaded.

These backgrounds use only static gradients and rules. No image to download, no canvas, no animated blur, no animated noise and no per-frame computation. The colors of real media are not constrained by this palette; any interface laid over real media must stay protected by an opaque surface or a dark enough overlay, to be checked against a white image.

## Geometry

Values are defined for a short side of 1080 px. In Electron, convert n px to `n / 10.8 cqmin` in the screen container. At 4K, double the reference dimensions without changing the composition. Screen previews are deliberately fixed; the `index.html` page only scales them down for browsing. Do not apply the conversion twice.

Outer margins 48 to 64 px, panels 32 to 40 px; setting rows 68 to 76 px depending on density. The details screen uses two rows of three tabs rather than shortening their labels.

## States and interaction to build into the prototype

`.is-focus` marks the control that a button press acts on; `.is-active` / `.is-current` mark an open view. The product must update them according to the actual navigation. In an interactive integration, use semantic buttons, links and tabs, expose the current state to assistive technologies and keep the DOM focus in sync. The spans in the previews are not interactive components ready to ship.

For the exit question, Start confirms the selected answer; Exit and the timeout carry on with the configuration. Never implement a timeout that automatically confirms a data loss. The bar shown is a static illustration of the existing mechanism.

## Rendering and checking

From the repository root:

```powershell
npx electron docs/design-system/src/rendu.cjs
```

Each preview is rendered in an off-screen Electron window that is never shown; the captures go to `tmp/design-system/` (large screens scaled down to fit the window), and the console lists the pages that overflow and the clipped texts. Frames that deliberately mask a backdrop (cover, system menu) show up there as "clipped": that is expected. Legibility at one meter and performance remain to be checked on the cabinet.
