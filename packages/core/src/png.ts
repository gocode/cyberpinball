// PNG en mémoire, sans dépendance (zlib de Node) : assez pour composer les ampoules
// d'un .directb2s sur son image allumée (b2simage.ts, b2sLitImages). Lecture des
// PNG non entrelacés de 1 à 16 bits par composante (gris, RVB, palette, avec ou sans
// transparence), écriture en RVBA 8 bits. Les pixels sont en RVBA, alpha non
// prémultiplié, ligne par ligne.

import * as zlib from 'node:zlib';

export interface RgbaImage {
  width: number;
  height: number;
  /** width × height × 4 octets : rouge, vert, bleu, alpha. */
  data: Buffer;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Au-delà, l'image n'est pas décodée (une image de 8 000 × 8 000 fait déjà 256 Mo). */
const MAX_PIXELS = 40_000_000;

/** Image décodée ; undefined si ce n'est pas un PNG lisible (entrelacé, abîmé, trop grand). */
export function decodePng(file: Buffer): RgbaImage | undefined {
  if (file.length < 33 || !file.subarray(0, 8).equals(SIGNATURE)) return undefined;
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = -1;
  let interlace = 0;
  let palette: Buffer | undefined;
  let trns: Buffer | undefined;
  const idat: Buffer[] = [];
  while (pos + 12 <= file.length) {
    const length = file.readUInt32BE(pos);
    const type = file.toString('latin1', pos + 4, pos + 8);
    const body = file.subarray(pos + 8, pos + 8 + length);
    if (body.length !== length) return undefined;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]!;
      color = body[9]!;
      interlace = body[12]!;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  if (!channels || !width || !height || interlace !== 0 || width * height > MAX_PIXELS || ![1, 2, 4, 8, 16].includes(depth)) return undefined;
  if (color === 3 && !palette) return undefined;
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < (stride + 1) * height) return undefined;

  // Filtres de ligne (aucun, gauche, haut, moyenne, Paeth), en place.
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    const prev = out - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!;
      const a = x >= bpp ? lines[out + x - bpp]! : 0;
      const b = y > 0 ? lines[prev + x]! : 0;
      const c = x >= bpp && y > 0 ? lines[prev + x - bpp]! : 0;
      let p: number;
      if (filter === 0) p = 0;
      else if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else return undefined;
      lines[out + x] = (v + p) & 0xff;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  const max = (1 << Math.min(depth, 8)) - 1;
  // Valeur d'une composante ramenée à 8 bits.
  const sample = (row: number, index: number): number => {
    if (depth === 8) return lines[row + index]!;
    if (depth === 16) return lines[row + index * 2]!;
    const bit = index * depth;
    const v = (lines[row + (bit >> 3)]! >> (8 - depth - (bit & 7))) & max;
    return color === 3 ? v : Math.round((v * 255) / max);
  };
  const raw16 = (row: number, index: number): number => (depth === 16 ? lines.readUInt16BE(row + index * 2) : depth === 8 ? lines[row + index]! : (lines[row + ((index * depth) >> 3)]! >> (8 - depth - ((index * depth) & 7))) & max);
  const key = trns && (color === 0 || color === 2) ? [0, 2, 4].slice(0, color === 0 ? 1 : 3).map((o) => trns!.readUInt16BE(o)) : undefined;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (color === 3) {
        const i = sample(row, x);
        data[o] = palette![i * 3] ?? 0;
        data[o + 1] = palette![i * 3 + 1] ?? 0;
        data[o + 2] = palette![i * 3 + 2] ?? 0;
        data[o + 3] = trns && i < trns.length ? trns[i]! : 255;
        continue;
      }
      const c = x * channels;
      if (color === 0 || color === 4) {
        const g = sample(row, c);
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = color === 4 ? sample(row, c + 1) : key && raw16(row, c) === key[0] ? 0 : 255;
      } else {
        data[o] = sample(row, c);
        data[o + 1] = sample(row, c + 1);
        data[o + 2] = sample(row, c + 2);
        data[o + 3] = color === 6 ? sample(row, c + 3) : key && raw16(row, c) === key[0] && raw16(row, c + 1) === key[1] && raw16(row, c + 2) === key[2] ? 0 : 255;
      }
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** PNG RVBA 8 bits, lignes sans filtre (assez pour une image de cache). */
export function encodePng(img: RgbaImage): Buffer {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Image redimensionnée (interpolation bilinéaire, alpha pris en compte). */
export function resizeRgba(img: RgbaImage, width: number, height: number): RgbaImage {
  if (width === img.width && height === img.height) return img;
  const data = Buffer.alloc(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(img.height - 1, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(img.width - 1, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const tx = fx - x0;
      const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
      const at = [(y0 * img.width + x0) * 4, (y0 * img.width + x1) * 4, (y1 * img.width + x0) * 4, (y1 * img.width + x1) * 4];
      let alpha = 0;
      const rgb = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const a = img.data[at[k]! + 3]! * w[k]!;
        alpha += a;
        for (let c = 0; c < 3; c++) rgb[c]! += img.data[at[k]! + c]! * a;
      }
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = alpha > 0 ? Math.round(rgb[c]! / alpha) : 0;
      data[o + 3] = Math.round(alpha);
    }
  }
  return { width, height, data };
}

/**
 * Pose layer sur base (en place) en (x, y), alpha « par-dessus » ; tint multiplie la
 * couleur de layer (couleur d'une ampoule, 255 = inchangé). Ce qui dépasse est coupé.
 */
export function drawOver(base: RgbaImage, layer: RgbaImage, x: number, y: number, tint?: [number, number, number]): void {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(base.width, x + layer.width);
  const bottom = Math.min(base.height, y + layer.height);
  for (let by = top; by < bottom; by++) {
    for (let bx = left; bx < right; bx++) {
      const s = ((by - y) * layer.width + (bx - x)) * 4;
      const d = (by * base.width + bx) * 4;
      const sa = layer.data[s + 3]! / 255;
      if (sa === 0) continue;
      const da = base.data[d + 3]! / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        const sc = tint ? (layer.data[s + c]! * tint[c]!) / 255 : layer.data[s + c]!;
        base.data[d + c] = Math.round((sc * sa + base.data[d + c]! * da * (1 - sa)) / oa);
      }
      base.data[d + 3] = Math.round(oa * 255);
    }
  }
}
