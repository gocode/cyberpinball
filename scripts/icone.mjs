// Dessine l'icône de Cyber Pinball et l'écrit en .ico (16 à 256 px) et en .png,
// ainsi que le bandeau des pages d'accueil et de fin de l'installeur.
//   node scripts/icone.mjs     -> app\ressources\icone.ico, icone.png, installeur-bandeau.bmp
//
// Dessin procédural, sans dépendance, dans la direction artistique du 22 octobre 2026
// (docs/design-system, image de la bannière) : une bille noire chromée qui arrive du
// coin haut droit dans une traînée sarcelle, au-dessus de deux flippers sombres à
// liseré sarcelle, dans un cadre de verre fumé (noir #030807, filet sarcelle).
// Les traits gardent au moins un pixel aux petites tailles. Chaque pixel est
// suréchantillonné 6×6. Le résultat est versionné : ce script ne sert qu'à le refaire.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repo, 'app', 'ressources');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 6;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Sarcelle lumineuse des filets (celle de la bannière) et sarcelle sombre du cadre. */
const TEAL = hex('#36c9b4');
const TEAL_DEEP = hex('#2f7f72');
const BG_TOP = hex('#122a24');
const BG_BOTTOM = hex('#030807');
const FLIPPER = hex('#0e1d1a');
const WHITE = [1, 1, 1];

/** Distance signée à un rectangle arrondi centré en (0.5, 0.5). */
function roundedBox(x, y, half, radius) {
  const qx = Math.abs(x - 0.5) - half + radius;
  const qy = Math.abs(y - 0.5) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance signée à un segment épais dont le rayon passe de r1 à r2. */
function taperedCapsule(x, y, ax, ay, bx, by, r1, r2) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (r1 + (r2 - r1) * t);
}

/** Couleur (RGBA, prémultipliée non) d'un point de l'icône, en coordonnées 0..1, pour une icône de size pixels. */
function shade(x, y, size) {
  let color = [0, 0, 0];
  let alpha = 0;
  const over = (c, a) => {
    const outA = a + alpha * (1 - a);
    if (outA <= 0) return;
    color = color.map((v, i) => (c[i] * a + v * alpha * (1 - a)) / outA);
    alpha = outA;
  };
  // Épaisseur d'un trait : sa valeur à 256 px, jamais moins d'un pixel.
  const stroke = (w) => Math.max(w, 1.05 / size);
  const small = size <= 32;
  // 16 et 24 px : dessin simplifié (ni traînée ni reflet, bille plus grosse, flippers pleins).
  const tiny = size <= 24;

  // Lueur sarcelle autour du cadre, discrète.
  const box = roundedBox(x, y, 0.44, 0.16);
  if (box > 0 && !small) over(TEAL, 0.3 * Math.exp(-box / 0.018) * (box < 0.06 ? 1 : 0));
  if (box > 0) return [...color, alpha];
  // Verre fumé : clair en haut à gauche, noir en bas à droite, reflet oblique.
  let bg = mix(BG_TOP, BG_BOTTOM, clamp((x + y - 0.25) / 1.1));
  const band = (x * 0.42 + y * 0.9 - 0.62) / 0.05;
  if (!tiny && band > 0 && band < 3) bg = mix(bg, TEAL, 0.05 * (1 - band / 3));
  over(bg, 1);
  // Filet du cadre.
  const edge = tiny ? 0.75 / size : stroke(0.022);
  if (box > -edge) over(mix(TEAL_DEEP, TEAL, 0.35), 1);

  const inside = box <= -edge;
  if (!inside) return [...color, alpha];

  // Traînée de la bille, du coin haut droit vers elle : un fuseau qui s'éteint en s'éloignant.
  const cx = 0.5;
  const cy = 0.4;
  const r = tiny ? 0.23 : 0.2;
  {
    const ax = cx + r * 0.55;
    const ay = cy - r * 0.55;
    const bx = 0.86;
    const by = 0.14;
    const dx = bx - ax;
    const dy = by - ay;
    const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    if (!tiny && t > -0.2 && t < 1) {
      const dist = Math.abs((x - ax) * dy - (y - ay) * dx) / Math.hypot(dx, dy);
      const width = r * 0.8 * (1 - clamp(t)) ** 0.8 + 0.006;
      const k = clamp(1 - dist / width) * (1 - clamp(t)) * clamp((t + 0.2) / 0.2);
      if (k > 0) over(mix(TEAL, WHITE, 0.25 * k), Math.min(1, 1.1 * k));
    }
  }

  // Flippers sombres, pointes vers le centre, liseré sarcelle (plus clair sur le bord haut).
  const left = tiny ? taperedCapsule(x, y, 0.23, 0.72, 0.43, 0.8, 0.065, 0.04) : taperedCapsule(x, y, 0.235, 0.715, 0.445, 0.8, 0.058, 0.03);
  const right = tiny ? taperedCapsule(x, y, 0.77, 0.72, 0.57, 0.8, 0.065, 0.04) : taperedCapsule(x, y, 0.765, 0.715, 0.555, 0.8, 0.058, 0.03);
  const flipper = Math.min(left, right);
  const line = stroke(small ? 0.03 : 0.016);
  if (flipper < 0 && tiny) over(TEAL, 1);
  else if (flipper < 0) {
    over(FLIPPER, 1);
    if (flipper > -line) over(TEAL, 1);
    // Axe du flipper : un point clair sur le pivot.
    const pivot = Math.min(Math.hypot(x - 0.235, y - 0.715), Math.hypot(x - 0.765, y - 0.715));
    if (!small && pivot < 0.018) over(mix(TEAL, WHITE, 0.4), 1);
  }

  // Bille noire chromée : la salle se reflète en haut, la lumière sarcelle du plateau en bas.
  const d = Math.hypot(x - cx, y - cy);
  if (d < r + 0.045 && d >= r && !small) over(TEAL, 0.28 * (1 - (d - r) / 0.045) ** 2);
  if (d < r) {
    const nx = (x - cx) / r;
    const ny = (y - cy) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const light = [-0.45, -0.6, 0.66];
    const diffuse = clamp(nx * light[0] + ny * light[1] + nz * light[2]);
    // Haut : gris sombre qui s'éclaircit vers le bord ; bas : noir, puis sarcelle au bord.
    const sky = mix([0.1, 0.13, 0.13], [0.42, 0.47, 0.46], clamp(-ny) * (1 - nz * 0.6));
    const floor = mix([0.01, 0.025, 0.02], TEAL, clamp((ny - 0.3) / 0.5) * clamp(1.15 - nz) * 1.6);
    let c = mix(sky.map((v) => v * (0.6 + 0.4 * diffuse)), floor, clamp((ny + 0.05) / 0.12));
    const spec = Math.exp(-(Math.hypot(nx + 0.36, ny + 0.42) ** 2) / (small ? 0.06 : 0.018));
    c = mix(c, WHITE, spec);
    over(c, 1);
    // Liseré : la bille se détache du fond même à 16 px.
    if (d > r - stroke(small ? 0.03 : 0.012)) over(mix(TEAL, WHITE, 0.2), small ? 1 : 0.85);
  }
  return [...color, alpha];
}

/** Image RGBA 8 bits d'une taille donnée. */
function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, size);
          sum[0] += r * a;
          sum[1] += g * a;
          sum[2] += b * a;
          sum[3] += a;
        }
      }
      const a = sum[3] / (SS * SS);
      const o = (py * size + px) * 4;
      for (let i = 0; i < 3; i++) pixels[o + i] = sum[3] > 0 ? Math.round(clamp(sum[i] / sum[3]) * 255) : 0;
      pixels[o + 3] = Math.round(a * 255);
    }
  }
  return pixels;
}

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
