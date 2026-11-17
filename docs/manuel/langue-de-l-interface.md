[English](../manual/interface-language.md) · Français · [Sommaire du manuel](../manuel.md)

## Langue de l'interface

Tout ce qu'affiche Cyber Pinball existe en français et en anglais : écran des tables et fiches, menu système, assistant, réglages de VPX, fenêtre « Récupérer », messages et constats du cœur (médecin, synchronisation, import, mise à jour).
Les dates et les nombres suivent la langue (`fr-FR` ou `en-GB`).
Les journaux de la console, les rapports des essais et les fichiers écrits pour d'autres outils restent en français.

- **Par défaut** : la langue de Windows si c'est le français, l'anglais sinon (`app.getPreferredSystemLanguages()`).
- **Menu système > « Cyber Pinball » > « Langue / Language »** : l'entrée est nommée dans les deux langues, pour qu'on la retrouve quelle que soit la langue affichée, et chaque langue se présente dans la sienne (« Français », « English »).
  Le choix, aux boutons comme le reste, est gardé dans `<données>\language.json` (`{ "language": "en" }`) ; le front-end se relance aussitôt par le gardien des écrans (`relaunchCovered`), comme pour un changement de configuration, et rouvre ses fenêtres dans la nouvelle langue.
- **À l'installation** : la petite fenêtre du début de l'installeur (ou `/LANGUE=fr|en`) écrit le même `language.json` ; voir [Installeur Windows](installation-et-organisation-des-fichiers.md#installeur-windows).
- **`CYBERPINBALL_LANGUE=fr|en`** impose la langue (essais, captures) ; un choix fait dans le front-end la remplace aussi pour la relance.

**Méthode** (`packages/core/src/i18n.ts`) : chaque texte affiché passe par `t('texte français', { paramètre })`, sa forme française servant de clé ; le catalogue anglais, rangé par partie de l'interface dans `packages/core/src/i18n/en/*.ts`, en donne la traduction.
Paramètres entre accolades (`t('{role} : aucun écran', { role })`), pluriels par `tn(n, '{n} table', '{n} tables')` (0 et 1 au singulier en français, 1 seul en anglais), listes par `formatList` (« a, b et c » / « a, b and c »), dates et nombres par `formatDate`, `formatDateTime`, `formatNumber`.
La langue est fixée une fois par processus, au démarrage (`app/src/language.ts`, importé par `main.ts` avant les modules qui affichent quelque chose) : aucun texte ne se traduit au chargement d'un module, et les tables de libellés du cœur (`ROLES`, `BUTTONS`, `WIZARD_STEPS`…) sont des accesseurs (`get label()`).
Les fenêtres reçoivent la langue et le catalogue par leur préchargement (`cyberI18n`) ; `app/renderer/i18n.js`, chargé avant les autres scripts de chaque page, leur donne les mêmes `t`, `tn` et `uiLocale()`, et traduit les textes fixes des pages, marqués `data-i18n` (avec une clé de contexte, `data-i18n="…"`, quand un même texte français a deux sens).

**Textes enregistrés** : rien de traduit n'est écrit dans un fichier de données, sinon il garderait la langue du moment où il a été écrit (« Resume: Étape 3 sur 4 » après passage à l'anglais).
On y enregistre des données neutres (numéro d'étape et total, comptes, codes), ou un texte différé : `tLater('texte français', { paramètre })` et `tnLater(n, …)` gardent la clé et ses paramètres, `say()` les dit à l'affichage, un libellé de table de constantes s'y désigne par `{ ref, id }` (`registerTextRef` : type de média, partie, badge), un score par `laterNumber` (écrit à la façon de la langue).
Les anciens fichiers qui tiennent déjà le texte traduit se convertissent à la lecture : `readStoredText` le retrouve dans le catalogue, en français ou en anglais.
Un relevé recalculable (santé, fiche technique) note sa langue et s'oublie à la lecture dans une autre.
Essais : `textes-enregistres.test.ts`, dont le détecteur relève tout texte du catalogue écrit dans un fichier.

**Invariant** (`packages/core/src/test/i18n.test.ts`, lancé par `npm test`) : le relevé des sources de l'interface (`i18n-scan.ts` : `app/src`, `app/renderer`, `packages/core/src`, `packages/installer/src`, `packages/win-displays/src`) retrouve chaque clé passée à `t()`, `tn()` et `data-i18n`, et échoue sur une clé sans traduction, une clé qui n'est pas un littéral (gabarit `${…}`, variable), des `{paramètres}` différents entre la clé et sa traduction, une même clé traduite de deux façons, une traduction restée en français, une clé que plus rien n'utilise, et un texte qui a l'air français hors de `t()` (accents, mots courants ; hors commentaires et journaux de console).
Un texte qui ne se traduit pas (nom de fichier, motif de recherche, nom propre) porte `// i18n-ignore` en fin de ligne.
Le test vérifie aussi qu'aucun texte n'est traduit au chargement des modules du cœur.
À la main, sur quelques fichiers :

```bash
npx tsc -b packages/core && node packages/core/dist/test/i18n-scan.js app/src/wizard.ts app/renderer/screen.js
```

En partie, un texte demandé sans traduction s'affiche en français et la console le signale une fois (« Traduction manquante : … »).
