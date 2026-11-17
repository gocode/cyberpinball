[Français](../manuel/langue-de-l-interface.md) · English · [Manual contents](../manual.md)

## Interface language

Everything Cyber Pinball displays exists in French and in English: table menu and game pages, system menu, setup wizard, VPX settings, the "Get" window, and the messages and findings of the core (doctor, synchronisation, import, update).
Dates and numbers follow the language (`fr-FR` or `en-GB`).
Console logs, test reports and files written for other tools stay in French.

- **By default**: the Windows language if it is French, English otherwise (`app.getPreferredSystemLanguages()`).
- **System menu > "Cyber Pinball" > "Language / Langue"**: the entry is named in both languages, so it can be found whatever language is shown, and each language is offered in its own words ("Français", "English").
  The choice, made with the cabinet buttons like everything else, is kept in `<data>\language.json` (`{ "language": "en" }`); the menu restarts at once through the screen guard (`relaunchCovered`), as for a change of configuration, and reopens its windows in the new language.
- **At installation**: the small window at the start of the installer (or `/LANGUE=fr|en`) writes the same `language.json`; see [Windows installer](installation-and-file-layout.md#windows-installer).
- **`CYBERPINBALL_LANGUE=fr|en`** forces the language (tests, screenshots); a choice made in the menu also replaces it for the restart.

**Method** (`packages/core/src/i18n.ts`): every displayed text goes through `t('texte français', { parameter })`, its French form being the key; the English catalogue, split by part of the interface in `packages/core/src/i18n/en/*.ts`, gives its translation.
Parameters go in braces (`t('{role} : aucun écran', { role })`), plurals through `tn(n, '{n} table', '{n} tables')` (0 and 1 are singular in French, only 1 in English), lists through `formatList` ("a, b et c" / "a, b and c"), dates and numbers through `formatDate`, `formatDateTime`, `formatNumber`.
The language is set once per process, at start-up (`app/src/language.ts`, imported by `main.ts` before the modules that display anything): no text is translated while a module loads, and the label tables of the core (`ROLES`, `BUTTONS`, `WIZARD_STEPS`…) are getters (`get label()`).
Windows receive the language and the catalogue through their preload (`cyberI18n`); `app/renderer/i18n.js`, loaded before the other scripts of each page, gives them the same `t`, `tn` and `uiLocale()`, and translates the fixed texts of the pages, marked `data-i18n` (with a context key, `data-i18n="…"`, when one French text has two meanings).

**Stored texts**: nothing translated is written to a data file, otherwise it would keep the language of the moment it was written ("Resume: Étape 3 sur 4" after switching to English).
What is stored is neutral data (step number and total, counts, codes), or a deferred text: `tLater('texte français', { parameter })` and `tnLater(n, …)` keep the key and its parameters, `say()` speaks them when displayed, and a label from a constants table is referred to as `{ ref, id }` (`registerTextRef`: media type, part, badge), and a score as `laterNumber` (written the way the language writes numbers).
Older files that already hold the translated text are converted when read: `readStoredText` finds it in the catalogue, in French or English.
A recomputable readout (health, tech sheet) records its language and is discarded when read in another one.
Tests: `textes-enregistres.test.ts`, whose detector reports any catalogue text written to a file.

**Invariant** (`packages/core/src/test/i18n.test.ts`, run by `npm test`): the scan of the interface sources (`i18n-scan.ts`: `app/src`, `app/renderer`, `packages/core/src`, `packages/installer/src`, `packages/win-displays/src`) collects every key passed to `t()`, `tn()` and `data-i18n`, and fails on a key without translation, a key that is not a literal (`${…}` template, variable), different `{parameters}` between a key and its translation, one key translated in two ways, a translation left in French, a key nothing uses any more, and a text that looks French outside `t()` (accents, common words; comments and console logs excepted).
A text that must not be translated (file name, search pattern, proper noun) carries `// i18n-ignore` at the end of its line.
The test also checks that no text is translated while the core modules load.
By hand, on a few files:

```bash
npx tsc -b packages/core && node packages/core/dist/test/i18n-scan.js app/src/wizard.ts app/renderer/screen.js
```

At run time, a text requested without a translation is shown in French and the console reports it once ("Traduction manquante : …").
