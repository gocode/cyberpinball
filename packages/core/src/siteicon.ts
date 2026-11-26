// Applications (26/11/2026) : l'icône d'un site telle qu'il la sert, rendue montrable par la grille. Le
// format se lit dans les octets, jamais dans l'en-tête HTTP (des sites servent leur favicon.ico en
// « image/png » ou en « application/octet-stream ») ; la taille aussi, sans décoder l'image. Un .ico
// (le favicon de la plupart des sites) devient le PNG de sa plus grande image : le protocole des médias
// ne sert pas les .ico, et Chromium y choisirait parfois la plus petite. Le SVG n'est pas gardé (il
// faudrait le servir tel quel) : une autre icône du site passe à sa place.

import { imageDimensions, sniffImage } from './avatar';
import { encodePng } from './png';

export type IconFormat = 'png' | 'jpg' | 'gif' | 'webp';

/** Une icône prête à écrire : ses octets (PNG pour un .ico), son extension et sa taille. */
export interface IconImage {
  data: Buffer;
  ext: IconFormat;
  width: number;
  height: number;
}

/** Au-delà, une image d'icône est refusée (un .ico abîmé peut annoncer n'importe quoi). */
const MAX_SIDE = 4096;

const sized = (width: number, height: number) => (width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE ? { width, height } : undefined);

/** Format reconnu aux premiers octets (ceux des avatars, plus le GIF) ; 'ico' pour une icône Windows. */
export function sniffIcon(b: Buffer): IconFormat | 'ico' | undefined {
  const known = sniffImage(b);
  if (known) return known;
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif';
  if (b.length >= 6 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1 && b.readUInt16LE(4) > 0) return 'ico';
  return undefined;
}

/** Largeur et hauteur lues dans l'en-tête d'un PNG, JPEG, GIF ou WebP. */
function imageSizeOf(b: Buffer, format: IconFormat): { width: number; height: number } | undefined {
  const size = format === 'gif' ? (b.length >= 10 ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : undefined) : imageDimensions(b, format);
  return size && sized(size.width, size.height);
}

/** La plus grande image d'un .ico (à taille égale, la plus riche en couleurs), en PNG. */
function icoToPng(b: Buffer): IconImage | undefined {
  const count = b.readUInt16LE(4);
  let best: { w: number; h: number; bpp: number; offset: number; length: number } | undefined;
  for (let i = 0; i < count && 6 + i * 16 + 16 <= b.length; i++) {
    const e = 6 + i * 16;
    const entry = { w: b[e] || 256, h: b[e + 1] || 256, bpp: b.readUInt16LE(e + 6), length: b.readUInt32LE(e + 8), offset: b.readUInt32LE(e + 12) };
    if (!entry.length || entry.offset + entry.length > b.length) continue;
    if (!best || entry.w * entry.h > best.w * best.h || (entry.w * entry.h === best.w * best.h && entry.bpp > best.bpp)) best = entry;
  }
  if (!best) return undefined;
  const part = b.subarray(best.offset, best.offset + best.length);
  if (sniffIcon(part) === 'png') {
    const size = imageSizeOf(part, 'png');
    return size ? { data: Buffer.from(part), ext: 'png', ...size } : undefined;
  }
  return dibToPng(part);
}

/** Image BMP d'un .ico (en-tête BITMAPINFOHEADER, hauteur doublée par le masque) : 1, 4, 8, 24 ou 32 bits. */
function dibToPng(d: Buffer): IconImage | undefined {
  if (d.length < 40) return undefined;
  const header = d.readUInt32LE(0);
  const width = d.readInt32LE(4);
  const height = Math.abs(d.readInt32LE(8)) >> 1;
  const bpp = d.readUInt16LE(14);
  const compression = d.readUInt32LE(16);
  if (header < 40 || !sized(width, height) || ![1, 4, 8, 24, 32].includes(bpp) || (compression !== 0 && !(compression === 3 && bpp === 32))) return undefined;
  const colors = bpp <= 8 ? d.readUInt32LE(32) || 1 << bpp : 0;
  const palette = header + (compression === 3 && header === 40 ? 12 : 0);
  const pixels = palette + colors * 4;
  const stride = ((width * bpp + 31) >> 5) << 2;
  const maskStride = ((width + 31) >> 5) << 2;
  const mask = pixels + stride * height;
  const hasMask = mask + maskStride * height <= d.length;
  if (pixels + stride * height > d.length) return undefined;
  const out = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = pixels + (height - 1 - y) * stride; // de bas en haut
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let bgr: number;
      let alpha = 255;
      if (bpp === 32) {
        bgr = row + x * 4;
        alpha = d[bgr + 3]!;
        if (alpha) anyAlpha = true;
      } else if (bpp === 24) bgr = row + x * 3;
      else {
        const bit = x * bpp;
        const index = (d[row + (bit >> 3)]! >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        bgr = palette + index * 4;
        if (bgr + 3 > d.length) return undefined;
      }
      out[o] = d[bgr + 2]!;
      out[o + 1] = d[bgr + 1]!;
      out[o + 2] = d[bgr]!;
      out[o + 3] = alpha;
    }
  }
  // Sans canal alpha (ou un alpha tout à zéro, fréquent dans les vieux .ico) : le masque dit le transparent.
  if (bpp !== 32 || !anyAlpha) {
    for (let y = 0; y < height; y++) {
      const row = mask + (height - 1 - y) * maskStride;
      for (let x = 0; x < width; x++) {
        const transparent = hasMask && (d[row + (x >> 3)]! >> (7 - (x & 7))) & 1;
        out[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  }
  return { data: encodePng({ width, height, data: out }), ext: 'png', width, height };
}

/** L'icône prête à garder, ou undefined : format inconnu (SVG, HTML d'une page d'erreur), image abîmée. */
export function readIconImage(b: Buffer): IconImage | undefined {
  const format = sniffIcon(b);
  if (!format) return undefined;
  if (format === 'ico') return icoToPng(b);
  const size = imageSizeOf(b, format);
  return size ? { data: b, ext: format, ...size } : undefined;
}
