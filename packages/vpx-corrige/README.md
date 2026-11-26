# VPX 10.8.1-5436 patched Cyber Pinball

[Français](LISEZMOI.md)

Cyber Pinball installs Visual Pinball X 10.8.1-5436 from its official archive, then replaces its `VPinballX_BGFX64.exe` executable, its PuP plugin `plugins/pup/plugin-pup64.dll` and its DOF library `plugins/dof/dof64.dll` with these ones: the same version, rebuilt with the patches in this folder.
Other plugins and libraries stay those of the official archive.
Another VPX (trial version, VPX installed by the user) is never touched.

Current patch set: "patched Cyber Pinball 8".
The version number stays 10.8.1.5436 (Cyber Pinball, plugins and tables rely on it); the executable's product version, the VPX log and its crash reports show `af26b2d93-patched-cyberpinball-8`.

## Patches

- `01-cadence-fenetres-annexes.patch`: backport onto 5436 of VPX commits [d73557d](https://github.com/vpinball/vpinball/commit/d73557d138475b3dda7ecd886decb0ca79450763) and [f832180](https://github.com/vpinball/vpinball/commit/f832180557271d7aa9652784376bc99c7c908ae5) (November 2026). 5436 redrew the backglass, ScoreView and topper at every playfield frame; a slower ancillary screen (50 or 60 Hz) then paced the whole game. Each ancillary window now follows the refresh rate of its own screen.
- `02-cadrage-garde-le-haut.patch` (Cyber Pinball, November 2026): on a 16:9 screen, a table is 17 to 29% too narrow, and "Fit Table" (CabinetAutofitMode = 1) enlarged it until it filled the width, even if that cut off the back of the playfield (on Attack from Mars, the saucer leaves the screen). Two settings are added, `[Player] CabinetAutofitKeepTop` and `CabinetAutofitMaxStretch` (also in the VPX menu, next to the flipper position): the zoom stops when the back edge of the playfield gets close to the top of the screen (6% kept for the back wall), with the flippers at the chosen height: the apron, below the flippers, and the empty space under the glass above the back wall are what leave the screen, and the rest of the width is filled by a capped stretch. Without `CabinetAutofitKeepTop`, nothing changes.
- `04-temps-gpu-au-journal.patch` (Cyber Pinball, November 2026): every minute and at the end of the game, VPX writes in its log how long the GPU takes to draw a frame (mean, median, 95th percentile, maximum) and the time available at the playfield refresh rate. Cyber Pinball's quality presets (Auto mode) use it to fit the graphics settings to the machine. Nothing else changes.
- `06-nvidia-3d-vision.patch` (Cyber Pinball, November 2026): NVIDIA 3D Vision shutter glasses, with a GeForce card and an NVIDIA driver up to 452.06. A new setting, `[Player] Stereo3DNvidiaDirect`, used with "Side by Side" stereo, switches the NVIDIA driver to its direct mode (NVAPI) before the Direct3D 11 device is created. BGFX renders both views side by side, each at the full screen width, into an offscreen target; on each frame, each view is drawn to the stereo backbuffer of an exclusive fullscreen swapchain after selecting the eye with `NvAPI_Stereo_SetActiveEye`. If anything is missing (driver, stereo disabled, playfield not on the main display), VPX logs why and falls back to plain side by side rendering. Without the setting, nothing changes.
- `07-pup-amont-bdbccaf30.patch` (PuP plugin, patch set 8): the PuP plugin of VPX at commit [bdbccaf30](https://github.com/vpinball/vpinball/commit/bdbccaf30) (November 2026), built for the plugin interface of 5436. The 5436 plugin only advanced videos while their screen was drawn: on a PuP screen that is not displayed (DMD, topper), a video never ended, the queue stayed stuck and the background music never came. The upstream plugin keeps media up to date on its own clock, plays the packs' sounds (`PlaySSF`, sound bank) without overlapping them, and includes lock free label decoding (former patch 03). The 5436 plugin headers do not change (the other plugins are those of the official archive): a small file, `Compat5436.h`, supplies the few newer helpers the plugin uses, and the in game DMD overlays (DMDOverlay, PagedUI), absent from 5436, are left out.
- `08-pup-playlistadd-met-a-jour.patch` (PuP plugin, patch set 8, applied after 07): like PinUP Player, `playlistadd` on a playlist already declared in `playlists.pup` updates its order (shuffled or alphabetical) and its rest time instead of being ignored. Stranger Things 4 declares every playlist with 30 rest seconds and sets them to 0 from its script: callouts and sounds of the same playlist were skipped for 30 seconds.

- `correctifs-libdof/` (DOF library, patch set 6): the libdof of 5436 (commit `eef645d9`) with a backport of libdof commits [0383246](https://github.com/vpinball/libdof/commit/03832462f10d19b1795e2292646193ca39e51fbd) and [c79bcff](https://github.com/vpinball/libdof/commit/c79bcff5be61e3c10022d2e6fa25f207e038bc53) (its `FinishUpdaterThread` part). While unloading, 5436 shut a DudesCab board down a second time, after it was really closed, and VPX crashed while closing (0xC0000005). The DudesCab destructor no longer runs the shutdown again, and a controller's output thread is always waited for instead of being abandoned. The library interface (`include/DOF/DOF.h`) does not change: the official `plugin-dof64.dll` loads it as is.

## Build

Patch `05-pov-sans-editeur.patch` guards automatic imports of legacy POV views: direct launches have no Windows editor, yet VPX tried to refresh its properties, causing an access violation immediately after `InitTablePostLoad`. Empty or invalid legacy numeric fields are also ignored. The imported file is identified in the log.
The automated `powershell -File scripts/banc-vpx-pov.ps1 -Vpx <VPX 5436 folder>` benchmark checks six cases on the hidden desktop, using a copy of VPX's bundled test table: no POV, named POV, `autopov.pov`, empty, invalid and valid legacy fields, including assertions on the exported settings.

`node scripts/vpx-corrige.mjs` (CMake and Build Tools 2022 with the ATL component).
VPX sources are those of commit `af26b2d93`, dependencies those of its `platforms/config.sh`.
The PuP plugin links against the DLLs of the official archive (SDL_image, SDL_ttf, pupdmd), whose import libraries are generated from them; only their headers and FFmpeg's are downloaded.
`dof64.dll` is compiled with MSVC as in VPX, likewise linked against the official DLLs of `plugins/dof` (libusb, libserialport, hidapi, libftdi); the recipe rejects a DLL whose exports or loaded libraries differ from the official one.

## License

VPX is distributed under GPLv3+ (and a MAME-derived license for part of the files), see the attached `LICENSE` file; libdof under its own license, attached as `plugins/dof/LICENSE-libdof`.
The complete sources of these files (VPX at commit `af26b2d93`, the libraries they are built with, the patches and the recipe) are published here: https://github.com/gocode/cyberpinball/releases/tag/sources-vpx-10.8.1-5436-patched-cyberpinball-8
