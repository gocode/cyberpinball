import type { EdidInfo } from './model';

const HEADER = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];
const DESCRIPTOR_OFFSETS = [54, 72, 90, 108];
const TAG_SERIAL = 0xff;
const TAG_NAME = 0xfc;

/** Lit le bloc de base (128 octets) d'un EDID. Renvoie undefined si le bloc est invalide. */
export function parseEdid(bytes: Uint8Array): EdidInfo | undefined {
  if (bytes.length < 128) return undefined;
  for (let i = 0; i < HEADER.length; i++) {
    if (bytes[i] !== HEADER[i]) return undefined;
  }

  // Trois lettres de 5 bits, sur deux octets en big-endian ; 1 = « A ».
  const packed = (bytes[8]! << 8) | bytes[9]!;
  const manufacturer = [10, 5, 0]
    .map((shift) => String.fromCharCode(((packed >> shift) & 0x1f) + 64))
    .join('');

  const info: EdidInfo = {
    manufacturer,
    productCode: bytes[10]! | (bytes[11]! << 8),
    serialNumber: (bytes[12]! | (bytes[13]! << 8) | (bytes[14]! << 16) | (bytes[15]! << 24)) >>> 0,
    widthCm: bytes[21]!,
    heightCm: bytes[22]!,
  };

  // Premier descripteur : timing détaillé (horloge pixel non nulle), taille de l'image en mm.
  const t = DESCRIPTOR_OFFSETS[0]!;
  if (bytes[t] !== 0 || bytes[t + 1] !== 0) {
    const width = bytes[t + 12]! | ((bytes[t + 14]! >> 4) << 8);
    const height = bytes[t + 13]! | ((bytes[t + 14]! & 0x0f) << 8);
    if (width > 0 && height > 0) info.imageMm = { width, height };
  }

  for (const offset of DESCRIPTOR_OFFSETS) {
    // Un descripteur d'affichage commence par 00 00 00 <tag>.
    if (bytes[offset] !== 0 || bytes[offset + 1] !== 0 || bytes[offset + 2] !== 0) continue;
    const tag = bytes[offset + 3];
    const text = readDescriptorText(bytes.subarray(offset + 5, offset + 18));
    if (!text) continue;
    if (tag === TAG_SERIAL) info.serialText = text;
    if (tag === TAG_NAME) info.monitorName = text;
  }

  return info;
}

function readDescriptorText(raw: Uint8Array): string {
  let end = raw.indexOf(0x0a);
  if (end === -1) end = raw.length;
  return String.fromCharCode(...raw.subarray(0, end)).trim();
}

/** Convertit la sortie hexadécimale de `reg query` (REG_BINARY) en octets. */
export function edidFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
