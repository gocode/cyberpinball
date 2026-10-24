[English](CHANGELOG.en.md) · Français

# Nouveautés de Cyber Pinball

Une section par version, `## <version>` puis une ligne `- ` par point : `npm run publier` en tire
les nouveautés du flux de mise à jour, affichées sur la borne avant l'installation, et de la
release GitHub. Des phrases courtes, pour l'utilisateur de la borne. Chaque section a sa
traduction, point par point, dans [CHANGELOG.en.md](CHANGELOG.en.md) (vérifié par `npm test`) ;
le flux de mise à jour et la release GitHub reprennent les deux langues (la borne affiche celle de
son interface).

## 0.1.1

- Mise à jour depuis la borne, aussi pour une borne copiée sans l'installeur : ses raccourcis restent ceux qui existent.
- Pastille rouge plus discrète sur la roue dentée ; le menu système s'ouvre sur l'entrée qui attend.

## 0.1.0

- Première version publique : assistant d'écrans, de boutons et de son, menu des tables aux boutons de la borne.
- Ajout de tables, bibliothèque de ROM, PuP-Packs, catalogue VPS et liste d'attente.
- Médias des jeux : import depuis PinUP Popper ou PinballX, téléchargement depuis VPinMediaDB, puis VPForums et VPUniverse avec votre compte, mode attente.
- Mise à jour depuis le menu système : « Mise à jour de Cyber Pinball », signalée par une pastille rouge sur la roue dentée quand une version est disponible.
- Interface en français ou en anglais, au choix dans le menu système : « Langue / Language ».
- S'installe à côté de PinUP Popper, PinballX ou PinballY : attend qu'un autre menu ouvert soit fermé, prévient avant de retourner un écran dans Windows.
