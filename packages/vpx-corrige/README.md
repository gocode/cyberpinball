# VPX 10.8.1-5436 patched Cyber Pinball

[Français](LISEZMOI.md)

Cyber Pinball installs Visual Pinball X 10.8.1-5436 from its official archive, then replaces its `VPinballX_BGFX64.exe` executable and its PuP plugin `plugins/pup/plugin-pup64.dll` with these ones: the same version, rebuilt with the patches in this folder.
Other plugins and libraries stay those of the official archive.
Another VPX (trial version, VPX installed by the user) is never touched.

Current patch set: "patched Cyber Pinball 4".
The version number stays 10.8.1.5436 (Cyber Pinball, plugins and tables rely on it); the executable's product version, the VPX log and its crash reports show `af26b2d93-patched-cyberpinball-4`.

## Patches

- `01-cadence-fenetres-annexes.patch`: backport onto 5436 of VPX commits [d73557d](https://github.com/vpinball/vpinball/commit/d73557d138475b3dda7ecd886decb0ca79450763) and [f832180](https://github.com/vpinball/vpinball/commit/f832180557271d7aa9652784376bc99c7c908ae5) (November 2026). 5436 redrew the backglass, ScoreView and topper at every playfield frame; a slower ancillary screen (50 or 60 Hz) then paced the whole game. Each ancillary window now follows the refresh rate of its own screen.
- `02-cadrage-garde-le-haut.patch` (Cyber Pinball, November 2026): on a 16:9 screen, a table is 17 to 29% too narrow, and "Fit Table" (CabinetAutofitMode = 1) enlarged it until it filled the width, even if that cut off the back of the playfield (on Attack from Mars, the saucer leaves the screen). Two settings are added, `[Player] CabinetAutofitKeepTop` and `CabinetAutofitMaxStretch` (also in the VPX menu, next to the flipper position): the zoom stops when the back edge of the playfield gets close to the top of the screen (6% kept for the back wall), with the flippers at the chosen height: the apron, below the flippers, and the empty space under the glass above the back wall are what leave the screen, and the rest of the width is filled by a capped stretch. Without `CabinetAutofitKeepTop`, nothing changes.
- `03-pup-label-sans-verrou.patch` (PuP plugin): a PuP label decoded its image (PNG, animated GIF) while holding its lock, which the rendering of every frame and the script wait on. A full screen GIF of several MB thus froze the game for 200 to 300 ms each time it was shown. Decoding now runs without the lock, and the frames of a GIF are converted at that time instead of one by one during rendering.
- `04-temps-gpu-au-journal.patch` (Cyber Pinball, November 2026): every minute and at the end of the game, VPX writes in its log how long the GPU takes to draw a frame (mean, median, 95th percentile, maximum) and the time available at the playfield refresh rate. Cyber Pinball's quality presets (Auto mode) use it to fit the graphics settings to the machine. Nothing else changes.

## Build

`node scripts/vpx-corrige.mjs` (CMake and Build Tools 2022 with the ATL component).
VPX sources are those of commit `af26b2d93`, dependencies those of its `platforms/config.sh`.
The PuP plugin links against the DLLs of the official archive (SDL_image, SDL_ttf, pupdmd), whose import libraries are generated from them; only their headers and FFmpeg's are downloaded.

## License

VPX is distributed under GPLv3+ (and a MAME-derived license for part of the files), see the attached `LICENSE` file.
The complete sources of these files (VPX at commit `af26b2d93`, the libraries they are built with, the patches and the recipe) are published here: https://github.com/gocode/cyberpinball/releases/tag/sources-vpx-10.8.1-5436-patched-cyberpinball-4
