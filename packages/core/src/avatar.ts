// Avatar des joueurs du réseau des bornes (rubrique Amis) : une image carrée que chacun choisit
// (photo ou image de son disque, ou prise dans le navigateur intégré), recadrée aux boutons, et que
// ses amis voient partout où son nom s'affiche (Mes amis, sa fiche, les demandes, l'historique
// des parties, la partie en direct, les notifications).
//
// Ici, ce qui se décide sur des données : le cadrage (un carré dans l'image, déplacé et agrandi
// pas à pas), le contrôle d'une image reçue d'une autre borne (type reconnu à ses premiers
// octets, taille du fichier et de l'image bornées, empreinte vérifiée), la pastille montrée quand
// il n'y a pas d'image (initiales sur une teinte tirée de la clé). Le transport est dans
// app/src/social-net.ts, l'écran dans app/src/avatar-menu.ts.
//
// Fichiers : <données>\avatars\<empreinte>.<ext>, nommés par l'empreinte SHA-256 de leur contenu.
// Une image ne change donc jamais sous un même nom (rien à invalider dans le cache du rendu), et
// deux amis qui ont la même image ne la gardent qu'une fois.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { mediaUrl } from './mediaview';

/** Côté de l'image envoyée aux amis, en pixels. */
export const AVATAR_SIZE = 256;
/** Au plus, pour un fichier d'avatar reçu (un JPEG de 256 px pèse de 10 à 40 Ko). */
export const AVATAR_MAX_BYTES = 96 * 1024;
/** Au plus, en pixels de côté, pour une image reçue : rien de plus grand ne se décode. */
export const AVATAR_MAX_SIDE = 1024;
/** Côté de l'image de travail du recadrage : une photo de 12 Mpx est réduite d'abord. */
export const AVATAR_SOURCE_SIDE = 1600;
/** Au plus, pour une image choisie sur ce PC ou dans le navigateur, avant réduction. */
export const AVATAR_PICK_MAX_BYTES = 40 * 1024 * 1024;

export type AvatarExt = 'jpg' | 'png' | 'webp';

/** Ce que le rendu dessine pour un joueur : son image, sinon ses initiales sur sa teinte. */
export interface AvatarView {
  /** Adresse cyber-media:// de l'image ; absente : les initiales. */
  src?: string;
  initials: string;
  /** Teinte (0 à 359) du fond des initiales, tirée de la clé : la même sur toutes les bornes. */
  hue: number;
}

// ---------------------------------------------------------------------------
// Initiales et teinte

/** « Alexis Martin » -> « AM », « Joueur A1B2 » -> « JA », « 4ever » -> « 4 ». */
export function avatarInitials(name: string): string {
  const words = name
    .normalize('NFC')
    .split(/[\s._-]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0]!.toLocaleUpperCase());
  return letters.join('') || '?';
}

/** Teinte de la pastille d'un joueur, tirée de sa clé. */
export function avatarHue(key: string): number {
  return parseInt(createHash('sha256').update(key).digest('hex').slice(0, 6), 16) % 360;
}

/** La pastille d'un joueur : son image si on l'a (`file`), sinon ses initiales. */
export function avatarView(key: string, name: string, file?: string): AvatarView {
  return { ...(file ? { src: mediaUrl(file) } : {}), initials: avatarInitials(name), hue: avatarHue(key) };
}

// ---------------------------------------------------------------------------
// Fichiers

const HASH = /^[0-9a-f]{64}$/;
const FILE = /^([0-9a-f]{64})\.(jpg|png|webp)$/;

export const isAvatarHash = (v: unknown): v is string => typeof v === 'string' && HASH.test(v);
/** Nom d'un fichier d'avatar : « <empreinte>.<ext> ». */
export const isAvatarFileName = (v: unknown): v is string => typeof v === 'string' && FILE.test(v);
/** Empreinte d'un nom de fichier d'avatar. */
export const avatarHashOf = (fileName: string): string => FILE.exec(fileName)?.[1] ?? '';

export function avatarDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function avatarsDir(dataDir: string): string {
  return path.join(dataDir, 'avatars');
}

export function avatarPath(dataDir: string, fileName: string): string {
  return path.join(avatarsDir(dataDir), fileName);
}

/** Écrit une image contrôlée (readAvatarImage) sous son empreinte ; renvoie le nom du fichier. */
export function writeAvatarFile(dataDir: string, image: AvatarImage): string {
  const name = `${image.hash}.${image.ext}`;
  const file = avatarPath(dataDir, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, image.bytes);
  }
  return name;
}

/** Image d'un avatar enregistré, relue et contrôlée ; undefined si elle manque ou ne correspond plus. */
export function readAvatarFile(dataDir: string, fileName: string): AvatarImage | undefined {
  if (!isAvatarFileName(fileName)) return undefined;
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(avatarPath(dataDir, fileName));
  } catch {
    return undefined;
  }
  const image = readAvatarImage(bytes);
  return image && image.hash === avatarHashOf(fileName) ? image : undefined;
}

/**
 * Retire du dossier les avatars que plus personne n'utilise (un ami retiré, une image changée).
 * Seuls les fichiers nommés comme un avatar sont touchés ; le dossier de recadrage est laissé.
 */
export function pruneAvatarFiles(dataDir: string, keep: Iterable<string>): string[] {
  const wanted = new Set([...keep].map((n) => n.toLowerCase()));
  const removed: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(avatarsDir(dataDir));
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!isAvatarFileName(name) || wanted.has(name.toLowerCase())) continue;
    try {
      fs.rmSync(avatarPath(dataDir, name), { force: true });
      removed.push(name);
    } catch {
      // Fichier tenu par le rendu : il partira au prochain rangement.
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Image reçue : type, dimensions, empreinte

export interface AvatarImage {
  bytes: Buffer;
  ext: AvatarExt;
  width: number;
  height: number;
  hash: string;
}

/** Type d'une image d'après ses premiers octets (jamais d'après son nom). */
export function sniffImage(bytes: Buffer): AvatarExt | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

/** Largeur et hauteur lues dans l'en-tête, sans décoder l'image ; undefined si l'en-tête est illisible. */
export function imageDimensions(bytes: Buffer, ext: AvatarExt): { width: number; height: number } | undefined {
  try {
    if (ext === 'png') {
      if (bytes.length < 24 || bytes.toString('latin1', 12, 16) !== 'IHDR') return undefined;
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    if (ext === 'webp') {
      const chunk = bytes.toString('latin1', 12, 16);
      if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
        const bits = bytes.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X' && bytes.length >= 30) return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
      return undefined;
    }
    // JPEG : les segments jusqu'au premier « Start Of Frame », qui porte les dimensions.
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      // Marqueurs sans longueur.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return undefined; // fin, ou données avant tout en-tête de trame
      const length = bytes.readUInt16BE(i + 2);
      if (length < 2) return undefined;
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return i + 9 <= bytes.length ? { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) } : undefined;
      i += 2 + length;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Image d'avatar contrôlée : un JPEG, PNG ou WebP reconnu à ses octets, de taille et de dimensions
 * bornées, qui doit avoir l'empreinte annoncée (`hash`) quand on en attend une. Undefined sinon :
 * une image refusée n'est jamais écrite.
 */
export function readAvatarImage(bytes: Buffer, hash?: string): AvatarImage | undefined {
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) return undefined;
  const ext = sniffImage(bytes);
  if (!ext) return undefined;
  const size = imageDimensions(bytes, ext);
  if (!size || size.width < 1 || size.height < 1 || size.width > AVATAR_MAX_SIDE || size.height > AVATAR_MAX_SIDE) return undefined;
  const digest = avatarDigest(bytes);
  if (hash !== undefined && digest !== hash) return undefined;
  return { bytes, ext, ...size, hash: digest };
}

/** Image transmise en base64 (message « avatar-data ») : décodée et contrôlée. */
export function decodeAvatarData(data: unknown, hash: string): AvatarImage | undefined {
  if (typeof data !== 'string' || data.length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return undefined;
  return readAvatarImage(Buffer.from(data, 'base64'), hash);
}

// ---------------------------------------------------------------------------
// Recadrage

/** Carré gardé dans l'image de travail, en pixels : centre et côté. */
export interface AvatarCrop {
  cx: number;
  cy: number;
  side: number;
}

/** Pas d'un appui : un dixième du côté pour un déplacement, un quart pour un zoom. */
export const CROP_MOVE_STEP = 0.1;
export const CROP_ZOOM_STEP = 1.25;
/** Au plus près : un dixième du petit côté de l'image (au moins 16 pixels). */
const CROP_MIN_PART = 0.1;

const minSide = (w: number, h: number) => Math.min(Math.min(w, h), Math.max(16, Math.min(w, h) * CROP_MIN_PART));

/** Carré gardé dans les limites de l'image, de côté borné. */
export function clampCrop(crop: AvatarCrop, width: number, height: number): AvatarCrop {
  const side = Math.min(Math.min(width, height), Math.max(minSide(width, height), crop.side));
  const half = side / 2;
  return { side, cx: Math.min(width - half, Math.max(half, crop.cx)), cy: Math.min(height - half, Math.max(half, crop.cy)) };
}

/** Cadrage de départ : le plus grand carré, centré ; un portrait (plus haut que large) le prend un peu plus haut, où est le visage. */
export function initialCrop(width: number, height: number): AvatarCrop {
  const side = Math.min(width, height);
  const cy = height > width ? Math.max(side / 2, height * 0.4) : height / 2;
  return clampCrop({ cx: width / 2, cy, side }, width, height);
}

/** Déplace le carré de `dx`, `dy` pas (un pas : un dixième de son côté). */
export function moveCrop(crop: AvatarCrop, dx: number, dy: number, width: number, height: number): AvatarCrop {
  const step = crop.side * CROP_MOVE_STEP;
  return clampCrop({ ...crop, cx: crop.cx + dx * step, cy: crop.cy + dy * step }, width, height);
}

/** Déplace le carré de `dx`, `dy` pixels de l'image (glisser à la souris). */
export function dragCrop(crop: AvatarCrop, dx: number, dy: number, width: number, height: number): AvatarCrop {
  return clampCrop({ ...crop, cx: crop.cx + dx, cy: crop.cy + dy }, width, height);
}

/** Zoom de `steps` crans (positif : plus près, le carré rétrécit autour de son centre). */
export function zoomCrop(crop: AvatarCrop, steps: number, width: number, height: number): AvatarCrop {
  return clampCrop({ ...crop, side: crop.side / Math.pow(CROP_ZOOM_STEP, steps) }, width, height);
}

/** Le carré au plus près, ou au plus large : le bouton de zoom correspondant est grisé. */
export function cropLimits(crop: AvatarCrop, width: number, height: number): { closest: boolean; widest: boolean } {
  return { closest: crop.side <= minSide(width, height) + 0.5, widest: crop.side >= Math.min(width, height) - 0.5 };
}

/** Rectangle en pixels entiers, pour la découpe. */
export function cropRect(crop: AvatarCrop, width: number, height: number): { x: number; y: number; side: number } {
  const c = clampCrop(crop, width, height);
  const side = Math.max(1, Math.floor(c.side));
  const x = Math.min(width - side, Math.max(0, Math.round(c.cx - side / 2)));
  const y = Math.min(height - side, Math.max(0, Math.round(c.cy - side / 2)));
  return { x, y, side };
}

/** Ce que le rendu dessine du recadrage : le carré en parts de la largeur et de la hauteur de l'image. */
export function cropBox(crop: AvatarCrop, width: number, height: number): { left: number; top: number; width: number; height: number } {
  const c = clampCrop(crop, width, height);
  return { left: (c.cx - c.side / 2) / width, top: (c.cy - c.side / 2) / height, width: c.side / width, height: c.side / height };
}
