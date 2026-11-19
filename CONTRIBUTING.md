# Contributing to Cyber Pinball

Thank you for your interest. Bug reports, fixes, translations and new ideas are all welcome. This guide explains how the repository is organised, how to build and test it, the conventions the code follows, and how to propose a change.

[README](README.md) · [Technical manual](docs/manual.md) · [Every feature](docs/features.md)

## Languages in the repository

Cyber Pinball is developed in French, and is being opened up to contributors who do not read it:

- **Interface strings** are written in French in the code, and French is their source language: each French string is the key of its English translation (see [Interface text](#interface-text-t)).
- **Code comments** are being translated to English, starting with the public modules of the core (`packages/core/src`). Some modules still have French comments; a translation of a comment is always a welcome change. `node scripts/commentaires-seuls.mjs <files or folders>` proves that a change only touches comments: the compiled output without comments, and the source reprinted without comments, are identical byte for byte. `node scripts/traduire-commentaires.mjs --extraire <file> <blocks.txt>` extracts the comments of a file as plain text blocks, and `--appliquer` puts the translated blocks back in place.
- **Identifiers** of the code are mostly in English. Test names, scripts, some file names and environment variables are in French; they stay as they are.
- **Documentation** exists in both languages: the [technical manual](docs/manual.md) describes every part in detail (files written, commands, tests, known limits). The French version is the reference.

Issues and pull requests in English are perfectly fine.

## Repository layout

| Folder | Content |
| --- | --- |
| `app/src/` | Electron main process, in TypeScript: the frontend (`frontend.ts`: state, game launch, broadcast to the windows), the table screen (`library.ts`), the setup wizard (`wizard.ts`), the entry point and its modes (`main.ts`). |
| `app/renderer/` | Pages of the windows: HTML, CSS and plain JavaScript, loaded as is, with no build step. |
| `packages/core/src/` | The core, with no Electron dependency: cabinet model, INI and VPX generators, table diagnosis (`doctor.ts`), PuP-Packs (`puppack.ts`), `.vpx` reading (`vpxinfo.ts`), file writes (`atomicwrite.ts`), table file operations (`fileops.ts`), updates (`update.ts`)… Its public API is exported by `index.ts`. |
| `packages/core/src/i18n/en/` | English catalogue of the interface strings, one file per area. |
| `packages/core/src/test/` | **All** the automated tests, including those of `app/` (they load the compiled `app/dist/*.js`) and of `win-displays`. |
| `packages/win-displays/` | Windows APIs through FFI (koffi): displays, audio outputs, USB devices, windows, orientation. |
| `packages/installer/` | Third-party component manifest, root folder, verified downloads, version junctions. |
| `packages/casque-vr/`, `packages/vpx-vision3d/`, `packages/dmdserver/` | Native C++ (CMake): the VR headset companion, the VPX "Vision3D" plugin (3D vision) and the server that shows the frontend on a real DMD (built on VPX's libdmdutil). Optional: the application builds and runs without them. |
| `packages/service-telephone/` | The small web service (Cloudflare Worker) behind the phone remote's stable address. |
| `scripts/` | Build, release, publication audit, translation checks and the test runner (`verifier.mjs`). |
| `docs/` | Technical manual (French and English), feature list and its screenshots, design system. |

New code goes into a module of its own (`app/src/<feature>.ts`, `app/renderer/<feature>.js`, `packages/core/src/<feature>.ts`): `frontend.ts` and `library.ts` are already very large and should only receive the wiring.

## Build and test

You need Windows 10 or 11, 64-bit, and Node.js 22 or later. Native modules need CMake and the Visual Studio C++ build tools, but only if you work on them.

```bash
npm ci                              # install the exact dependencies of package-lock.json
npm run build                       # compile every TypeScript package (tsc -b)
npm test                            # build, check translations, run the whole test suite
npm run verifier                    # build, then the fast tests only (no Electron, no Chromium)
npm run verifier -- puppack vpx     # only the test files whose name contains one of these words
npm run verifier -- --modifies      # the tests that import or mention a file you changed
npm run test:electron               # only the slow tests (Electron, Chromium, child processes)
npm start                           # run the table screen
npm run assistant                   # run the full cabinet setup wizard
```

`npm run verifier` also takes `--sans-build` (do not recompile) and `--nom "<regex>"` (filter the tests by name). While working, run the tests related to your change; run the whole `npm test` once before proposing it (several minutes).

Tests use the Node.js test runner (`node --test`). A test file lives in `packages/core/src/test/<name>.test.ts`, is compiled to `packages/core/dist/test/` and is picked up automatically.

## Conventions

### Interface text: `t()`

Every string the player can see goes through `t()` (or `tn()` for plurals), with the **French** text as the key:

```ts
t('Aucune table trouvée dans {folder}', { folder })
```

The English translation goes into the matching file of `packages/core/src/i18n/en/` (`'Aucune table trouvée dans {folder}': 'No table found in {folder}'`). In the renderer pages, elements use `data-i18n`. Strings that are not interface text (file names, protocol words, search patterns) are marked on their line with a comment `// i18n-ignore: <reason>`.

The test `i18n.test.ts` scans the sources: it fails on a French-looking string outside `t()` and on a key that has no English translation. If you do not write French, use your best French key (a machine translation is fine) with your English text as its translation, and say so in your pull request: the French wording will be reviewed.

### File writes: `writeFileAtomic`

A state or settings file is written with `writeFileAtomic` (`packages/core/src/atomicwrite.ts`): it writes a temporary file and renames it over the original, so a power cut never leaves a truncated file. Renames go through `renameWithRetry`, which retries for a moment when another process (antivirus, indexing) briefly holds the file. Never call `fs.writeFileSync` directly on a file that must survive a power cut; `ecritures-atomiques.test.ts` checks it for the modules that keep the cabinet's state.

### Tests run off-screen

A test never shows anything on the developer's screens. Every window is created by `createWindow` (`app/src/offscreen.ts`): during a test, Electron renders in memory on a hidden Windows desktop. Screens are simulated through `CYBERPINBALL_DISPLAYS` (sets in `packages/core/ecrans-simules/`). `offscreen.test.ts` rejects a window created any other way and any command-line tool launched without `windowsHide`.

### Other rules

- Test and demo data is invented: fictional tables, players and addresses (`example.com`). Nothing personal.
- Every published Markdown document has its translation (`scripts/traductions.mjs`, run by `npm test`).
- Interface vocabulary is checked by `vocabulaire.test.ts`.

## Proposing a change

1. For anything beyond a small fix, open an [issue](https://github.com/gocode/cyberpinball/issues) or a [discussion](https://github.com/gocode/cyberpinball/discussions) first, to agree on the approach.
2. Fork the repository, make your change on a branch, and add or update a test that pins down the behaviour you fixed or added.
3. Run `npm test` and make sure it passes.
4. Open a pull request against `main` that describes what changes for the player and how you checked it. A screenshot helps for any visible change.

The public `main` branch receives snapshots of the development history: a pull request is not merged as is, but applied by the maintainer on the development branch, and it appears on `main` with the next release.

By contributing, you agree that your contribution is released under the project's licence, the [GNU General Public License, version 3 or later](LICENSE).
