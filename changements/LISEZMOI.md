# Nouveautés en attente / Pending release notes

Une branche écrit ses nouveautés ici, dans un fichier à elle (`<branche>.md`), jamais dans `CHANGELOG.md` ni `CHANGELOG.en.md`.
Deux sections, `## Français` puis `## English`, avec autant de points « - » dans chacune : `npm test` le vérifie.
La publication (`node scripts/publier.mjs --rapide --essai`) rassemble ces fichiers dans les deux CHANGELOG, sous la version publiée, puis les retire.

A branch writes its release notes here, in a file of its own (`<branch>.md`), never in `CHANGELOG.md` or `CHANGELOG.en.md`.
Two sections, `## Français` then `## English`, with as many "-" items in each: `npm test` checks it.
Publishing (`node scripts/publier.mjs --rapide --essai`) gathers these files into both CHANGELOGs, under the published version, then removes them.
