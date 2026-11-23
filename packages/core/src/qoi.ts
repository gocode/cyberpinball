// Images QOI (format des captures de VPX, -CaptureAttract) lues en RGBA, pour les aperçus du cadrage
// (app/src/framing-preview.ts) et le banc de cadrage. Format : https://qoiformat.org/qoi-specification.pdf

import type { RgbaImage } from './png';

export function decodeQoi(buf: Buffer): RgbaImage {
  if (buf.length < 22 || buf.toString('latin1', 0, 4) !== 'qoif') throw new Error('pas une image QOI'); // i18n-ignore : erreur technique
  const width = buf.readUInt32BE(4);
  const height = buf.readUInt32BE(8);
  const data = Buffer.alloc(width * height * 4);
  const index = new Uint8Array(64 * 4);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let p = 14;
  let run = 0;
  for (let o = 0; o < data.length; o += 4) {
    if (run > 0) run--;
    else if (p < buf.length - 8) {
      const b1 = buf[p++]!;
      if (b1 === 0xfe) {
        r = buf[p++]!;
        g = buf[p++]!;
        b = buf[p++]!;
      } else if (b1 === 0xff) {
        r = buf[p++]!;
        g = buf[p++]!;
        b = buf[p++]!;
        a = buf[p++]!;
      } else if ((b1 & 0xc0) === 0x00) {
        const i = (b1 & 0x3f) * 4;
        r = index[i]!;
        g = index[i + 1]!;
        b = index[i + 2]!;
        a = index[i + 3]!;
      } else if ((b1 & 0xc0) === 0x40) {
        r = (r + ((b1 >> 4) & 3) - 2) & 255;
        g = (g + ((b1 >> 2) & 3) - 2) & 255;
        b = (b + (b1 & 3) - 2) & 255;
      } else if ((b1 & 0xc0) === 0x80) {
        const b2 = buf[p++]!;
        const vg = (b1 & 0x3f) - 32;
        r = (r + vg - 8 + ((b2 >> 4) & 0x0f)) & 255;
        g = (g + vg) & 255;
        b = (b + vg - 8 + (b2 & 0x0f)) & 255;
      } else run = b1 & 0x3f;
      const h = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4;
      index[h] = r;
      index[h + 1] = g;
      index[h + 2] = b;
      index[h + 3] = a;
    }
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    // Rendu de VPX : opaque, quel que soit l'alpha écrit par la capture.
    data[o + 3] = 255;
  }
  return { width, height, data };
}
