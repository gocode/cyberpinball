// Rend l'icône de Cyber Pinball et l'écrit en .ico (16 à 256 px) et en .png, ainsi que
// le bandeau des pages d'accueil et de fin de l'installeur.
//   node scripts/icone.mjs     -> app\ressources\icone.ico, icone.png, installeur-bandeau.bmp
//
// Le dessin est app/renderer/icone.svg, choisi le 24 octobre 2026 dans la
// direction artistique (docs/design-system) : une bille noire chromée dont la traînée
// sarcelle passe par-dessus la lunette d'une plaque (métal, filet vert signal, verre
// fumé) et s'arrête dans le coin. Le même fichier sert de logo au topper dessiné
// (app/renderer/fallback.js). Chaque taille est rendue par l'Electron du projet, hors
// écran (scripts/icone-rendu.cjs), puis assemblée ici sans autre dépendance.
// Le résultat est versionné : ce script ne sert qu'à le refaire.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repo, 'app', 'ressources');
const SVG = path.join(repo, 'app', 'renderer', 'icone.svg');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Taille de l'icône dans le bandeau de l'installeur. */
const BANNER_ICON = 116;

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Sarcelle lumineuse des filets et noir sarcelle du fond (docs/design-system). */
const TEAL = hex('#36c9b4');
const BG_BOTTOM = hex('#030807');

/** Images RGBA 8 bits de l'icône, une par taille, rendues par Electron hors écran. */
function renderAll(sizes) {
  const electron = createRequire(import.meta.url)('electron');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-icone-'));
  try {
    const job = path.join(tmp, 'tache.json');
    fs.writeFileSync(job, JSON.stringify({ svg: fs.readFileSync(SVG, 'utf8'), sizes, out: tmp }));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(electron, [path.join(repo, 'scripts', 'icone-rendu.cjs'), job], { stdio: 'inherit', env });
    if (run.status !== 0) throw new Error(`rendu de l'icône en échec (code ${run.status})`);
    return new Map(sizes.map((size) => [size, fs.readFileSync(path.join(tmp, `${size}.rgba`))]));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const rendered = renderAll([...SIZES, BANNER_ICON]);
const render = (size) => rendered.get(size);

function png(size, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Entrée BMP (DIB 32 bits, de bas en haut, avec masque) : lue par tous les outils, NSIS compris. */
function dib(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // hauteur doublée : couleurs + masque
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const colors = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4;
      colors[to] = rgba[from + 2];
      colors[to + 1] = rgba[from + 1];
      colors[to + 2] = rgba[from];
      colors[to + 3] = rgba[from + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, colors, Buffer.alloc(maskRow * size)]);
}

const images = SIZES.map((size) => {
  const rgba = render(size);
  // 256 px en PNG (format attendu par Windows à cette taille), les autres en BMP.
  return { size, rgba, data: size >= 256 ? png(size, rgba) : dib(size, rgba) };
});

const dir = Buffer.alloc(6 + 16 * images.length);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  dir[e] = img.size >= 256 ? 0 : img.size;
  dir[e + 1] = img.size >= 256 ? 0 : img.size;
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(img.data.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += img.data.length;
});

/**
 * Bandeau des pages d'accueil et de fin de l'installeur (164 × 314, BMP 24 bits) :
 * l'icône sur le noir sarcelle, avec un filet sarcelle le long du bord droit.
 */
function banner() {
  const w = 164;
  const h = 314;
  const size = 116;
  const ox = Math.round((w - size) / 2);
  const oy = 64;
  const icon = render(size);
  const rowBytes = Math.ceil((w * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = mix(hex('#0c1a17'), BG_BOTTOM, y / h);
      const edge = w - 1 - x;
      c = mix(c, TEAL, edge < 2 ? 0.8 : Math.exp(-edge / 5) * 0.3);
      const ix = x - ox;
      const iy = y - oy;
      if (ix >= 0 && iy >= 0 && ix < size && iy < size) {
        const o = (iy * size + ix) * 4;
        c = mix(c, [icon[o] / 255, icon[o + 1] / 255, icon[o + 2] / 255], icon[o + 3] / 255);
      }
      const p = (h - 1 - y) * rowBytes + x * 3;
      pixels[p] = Math.round(c[2] * 255);
      pixels[p + 1] = Math.round(c[1] * 255);
      pixels[p + 2] = Math.round(c[0] * 255);
    }
  }
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(w, 18);
  header.writeInt32LE(h, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'installeur-bandeau.bmp'), banner());
fs.writeFileSync(path.join(out, 'icone.ico'), Buffer.concat([dir, ...images.map((i) => i.data)]));
const big = images.find((i) => i.size === 256);
fs.writeFileSync(path.join(out, 'icone.png'), png(256, big.rgba));
console.log(`Icône : ${path.join(out, 'icone.ico')} (${SIZES.join(', ')} px), icone.png et installeur-bandeau.bmp`);
