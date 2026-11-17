[English](../manual/structure.md) · Français · [Sommaire du manuel](../manuel.md)

## Structure

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Modèle de borne, EDID, empreintes, correspondance des écrans, INI, générateur VPX, boutons et touches (`buttons.ts`). Sans Electron ni Windows. |
| `packages/win-displays` | Fonctions Windows via FFI (koffi) : détection des écrans (DisplayConfig, EDID, échelle, ContainerId), sorties audio (`audio.ts`, registre MMDevices lu par `registry.ts`), périphériques USB présents (`usb.ts`, pour les DMD réels), fenêtres et premier plan (`windows.ts`), orientation d'un écran (`orientation.ts`). |
| `packages/installer` | Manifeste des composants tiers, choix de la racine, téléchargement vérifié, extraction, jonction vers la version active. |
| `app` | Application Electron : point d'entrée (`main.ts`), assistant des boutons, des écrans et du son (`wizard.ts`, sons de test dans `renderer/sound.js`), écran des tables (`frontend.ts`), réglages de VPX (`settings.ts`), gestion des tables (`library.ts`), lancement et surveillance de VPX (`launcher.ts`), commande `sync`. |
| `docs/design-system` | Langage visuel de la refonte (tokens, composants `.cp-*`, icônes, maquettes d'écrans) et sa page `index.html` ; régénéré par `node docs/design-system/src/construire.mjs`. Appliqué à l'interface (`app/renderer/theme.css`), aux replis intégrés (`fallback.css`) et à l'icône (`app/renderer/icone.svg`). |
