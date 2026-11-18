[English](../manual/vpx-settings.md) · Français · [Sommaire du manuel](../manuel.md)

## Réglages de VPX

Écran des tables, touche R (ou Exit puis « Réglages de VPX ») ; seul : `npx electron app --reglages [--table=<morceau du nom>]`, action « reglages » du lanceur.

- La liste des réglages n'est pas codée à la main : `npm run vpx-schema` lit `src/core/Settings_properties.inl` du code source de VPX au commit de la version installée (`sourceCommit` du manifeste) et écrit `packages/installer/vpx-settings/<version>.json`.
  Il y ajoute les réglages que les plugins déclarent à leur chargement, lus dans le dossier `plugins/` du même commit (`packages/core/src/vpx-plugin-settings.ts`) : `[Plugin.<id>] Enable` de chaque plugin (`plugin.cfg`), les macros `MSGPI_*_SETTING` réellement enregistrées (`RegisterSetting`), et `[Backglass|ScoreView|Topper] Priority.<moteur>` pour chaque moteur de rendu des fenêtres annexes.
  Pour 10.8.1-5436 : 1240 réglages, dont 101 de plugins.
  Chaque réglage de plugin porte le plugin qui le déclare : sans effet quand ce plugin est éteint.
  Avec `-- --ini <VPinballX.ini>`, il vérifie que chaque réglage du schéma figure dans un fichier écrit par cette version (sauf ceux des plugins que VPX n'a pas chargés) ; avec `-- --check`, il échoue si le fichier committé diffère du code source.
- Onglet « Essentiels » : une sélection traduite (`packages/core/src/vpx-essentials.ts`), dont les groupes « Backglass, PuP et DMD réel » et « Dossiers communs à toutes les tables ».
  Onglet « Avancé » : tout le schéma par section, avec les libellés et descriptions d'origine, plus les clés hors schéma (touches, options déclarées par les tables) en lecture seule ; une touche `[Input] Mapping.*` s'affiche avec le nom de l'action et de la touche.
- Flippers : se déplacer et choisir une valeur ; Start : modifier, valider ; Exit : annuler, revenir ; Suppr : valeur par défaut ; souris et molette, avec « ‹ Retour aux sections » ou « ‹ Fermer » sous la marque.
- Les clés écrites par Cyber Pinball (fenêtres, plugins activés ou éteints, priorités des plugins sur les fenêtres affectées, `SecurityLevel` et `AskToTurnOn` qui évitent les questions de VPX en partie (voir [Lancement d'une partie](lancement-d-une-partie.md#lancement-dune-partie)), `NudgeStrength` qui garde la table immobile à l'écran (voir [Tilt](tilt.md#tilt)), DMD réel détecté, touches des boutons une fois l'étape « Boutons » faite, et sorties audio une fois l'étape « Son » faite) sont affichées sans pouvoir être modifiées, avec l'origine de leur valeur et la façon de la changer.
- Écriture : seule la ligne du réglage change (`IniDocument`), avec sauvegarde horodatée (`writeWithBackup`).
  « Valeur par défaut » laisse la clé vide, la convention de VPX.
- Par table (`openSettings({ scope: 'table', table })`) : le fichier `<table>.ini` à côté du .vpx, trouvé comme VPX le fait (nom de la table, sinon nom du dossier).
  Seules les valeurs différentes du réglage général y sont gardées, comme VPX ; un fichier vide est supprimé.
  Pour une table qui joue une ROM, le groupe « Son » des Essentiels ajoute « Volume de la ROM » après les volumes de VPX : il n'est pas dans le `.ini` mais dans la mémoire de la ROM, que Cyber Pinball écrit hors partie (`RomVolumeControl`, voir [Volume de la ROM](son.md#volume-de-la-rom)).
  L'écran ouvert seul (`--reglages --table=…`) l'a aussi.
  En bac à sable (`CYBERPINBALL_HOME`), il est écrit dans `<bac à sable>\sandbox\tables\` et jamais à côté du vrai .vpx.
- Ces réglages sont ceux du VPX de Cyber Pinball : une table jouée avec un autre VPX du PC part avec les réglages de cet autre VPX, que Cyber Pinball ne touche jamais (voir [Autres versions de VPX](autres-versions-de-vpx.md#autres-versions-de-vpx)).
