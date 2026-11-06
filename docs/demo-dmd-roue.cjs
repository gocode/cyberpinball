// Médias FullDMD inventés pour docs\demo-dmd-roue.ps1 (DMD sur la roue) : dessinés point par point,
// sans aucun nom de jeu réel.
//   node docs/demo-dmd-roue.cjs <dossier des tables>
// Atlas Rising : une illustration en haut et un cadre de DMD doré en bas (le cadre est trouvé, comme
// sur The Walking Dead) ; Copper Comet : une illustration sur tout l'écran, sans cadre (comme la
// vidéo de Guardians of the Galaxy). Les autres tables n'ont pas de média FullDMD.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const tables = path.resolve(process.argv[2]);

const W = 1920;
const H = 1080;

function image(paint) {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * W + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  return core.encodePng({ width: W, height: H, data });
}

/** Cadre doré de 12 px, de 6 % à 94 % de la largeur, de 60 % à 95 % de la hauteur ; noir dedans. */
const FRAME = { x0: Math.round(W * 0.06), x1: Math.round(W * 0.94), y0: Math.round(H * 0.6), y1: Math.round(H * 0.95) };

const framed = () =>
  image((x, y) => {
    const { x0, x1, y0, y1 } = FRAME;
    const inFrame = x >= x0 && x < x1 && y >= y0 && y < y1;
    if (inFrame && (x < x0 + 12 || x >= x1 - 12 || y < y0 + 12 || y >= y1 - 12)) return [214, 170, 70];
    if (inFrame || y >= H * 0.56) return [0, 0, 0];
    return [30 + Math.round((x / W) * 110), 16, 70 + Math.round((y / H) * 170)];
  });

const unframed = () =>
  image((x, y) => {
    const band = Math.floor((x + y) / 90) % 2;
    return [150 + Math.round((y / H) * 90), 60 + band * 30, 20 + Math.round((x / W) * 60)];
  });

for (const dir of fs.readdirSync(tables)) {
  const medias = path.join(tables, dir, 'medias');
  if (!fs.existsSync(medias)) continue;
  if (dir.startsWith('Atlas Rising')) fs.writeFileSync(path.join(medias, `(FullDMD) ${dir}.png`), framed());
  else if (dir.startsWith('Copper Comet')) fs.writeFileSync(path.join(medias, `(FullDMD) ${dir}.png`), unframed());
  else continue;
  console.log(`FullDMD : ${dir}`);
}
