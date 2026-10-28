// Partage entre bornes : les identités communes à toutes les bornes, quel que soit le moyen
// d'échange (paquet sur une clé USB aujourd'hui, réseau pair à pair plus tard).
// Conception : docs/recherche/partage-medias.md, § 2.
//
// - Une table : identifiant du jeu dans la base VPS, sinon ROM PinMAME, sinon titre normalisé
//   et année. Les médias valent pour le jeu, pas pour une version de la table.
// - Un média : son type, et l'empreinte SHA-256 de son contenu, lu octet par octet.
// - Un joueur : une clé Ed25519 créée sur la borne, qui signe ce qu'il partage. C'est la forme
//   de clé de HyperDHT, de Hypercore, de BEP 44 et de libp2p : elle servira quel que soit le
//   réseau retenu.
//
// Rien ici n'ouvre de connexion.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { mediaKind, mediaTypeInfo, parseMediaType, type MediaKind, type MediaType } from './medias';
import type { TableEntry } from './tables';
import { vpsKey } from './vps';
import { sniffBytes } from './webmedia';

// ---------------------------------------------------------------------------
// Une table

export interface TableIdentity {
  /** Identifiant du jeu dans la base VPS (Info.VPSId du .info). */
  vpsId?: string;
  /** ROM PinMAME que jouent ses scripts, en minuscules. */
  roms?: string[];
  title: string;
  manufacturer?: string;
  year?: number;
}

const MAX_TEXT = 200;

/** Texte court et sans caractère de contrôle, ou undefined. */
function cleanText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max);
  return text || undefined;
}

const ROM_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Identité d'une table installée ; `roms` : celles que ses scripts jouent (déjà lues). */
export function tableIdentity(table: TableEntry, roms: readonly string[] = []): TableIdentity {
  const info = table.info.Info ?? {};
  return normalizeIdentity({
    vpsId: info.VPSId,
    roms: [...roms],
    title: info.Title ?? table.title,
    manufacturer: info.Manufacturer ?? table.manufacturer,
    year: info.Year ?? table.year,
  });
}

function normalizeIdentity(raw: { vpsId?: unknown; roms?: unknown; title?: unknown; manufacturer?: unknown; year?: unknown }): TableIdentity {
  const vpsId = cleanText(raw.vpsId, 64);
  const roms = [...new Set((Array.isArray(raw.roms) ? raw.roms : []).filter((r): r is string => typeof r === 'string').map((r) => r.trim().toLowerCase()))].filter((r) => ROM_NAME.test(r));
  const year = typeof raw.year === 'number' && Number.isInteger(raw.year) && raw.year >= 1900 && raw.year <= 2200 ? raw.year : undefined;
  const manufacturer = cleanText(raw.manufacturer, 80);
  return {
    ...(vpsId && /^[A-Za-z0-9_-]+$/.test(vpsId) ? { vpsId } : {}),
    ...(roms.length ? { roms } : {}),
    title: cleanText(raw.title) ?? '',
    ...(manufacturer ? { manufacturer } : {}),
    ...(year ? { year } : {}),
  };
}

/** Identité lue dans un paquet ou reçue d'une autre borne : nettoyée, ou undefined si elle ne désigne rien. */
export function parseTableIdentity(raw: unknown): TableIdentity | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const id = normalizeIdentity(raw as Record<string, unknown>);
  return id.vpsId || id.roms || vpsKey(id.title) ? id : undefined;
}

/**
 * Clés de rendez-vous d'une table, de la plus sûre à la plus faible : « vps:<id> »,
 * « rom:<rom> » (une par ROM), « title:<clé du titre>:<année> ». Deux bornes qui ont une
 * clé en commun parlent du même jeu.
 */
export function tableShareKeys(id: TableIdentity): string[] {
  const keys: string[] = [];
  if (id.vpsId) keys.push(`vps:${id.vpsId}`);
  for (const rom of id.roms ?? []) keys.push(`rom:${rom}`);
  const title = vpsKey(id.title);
  if (title) keys.push(`title:${title}:${id.year ?? ''}`);
  return keys;
}

export type SameTableHow = 'vps' | 'rom' | 'title';

/**
 * Les deux identités désignent-elles le même jeu, et à quel titre ? Deux identifiants VPS
 * différents désignent deux jeux, même si une ROM ou le titre se ressemblent. Le titre seul
 * demande la même année (ou aucune des deux).
 */
export function sameTable(a: TableIdentity, b: TableIdentity): SameTableHow | undefined {
  if (a.vpsId && b.vpsId) return a.vpsId === b.vpsId ? 'vps' : undefined;
  if (a.roms?.some((r) => b.roms?.includes(r))) return 'rom';
  const title = vpsKey(a.title);
  if (title && title === vpsKey(b.title) && a.year === b.year) return 'title';
  return undefined;
}

// ---------------------------------------------------------------------------
// Un média

/** Ce qui peut circuler entre bornes : les médias que le menu montre (un rôle de la borne ou le son). */
export function isShareableType(type: MediaType): boolean {
  return mediaTypeInfo(type).target !== undefined;
}

/** Types partageables, d'après leur nom ; undefined pour un type inconnu ou qui ne circule pas. */
export function shareableType(raw: unknown): MediaType | undefined {
  const type = typeof raw === 'string' ? parseMediaType(raw) : undefined;
  return type && isShareableType(type) ? type : undefined;
}

/** Plus gros fichier accepté, par nature (docs/recherche/partage-medias.md, § 5.2). */
export const SHARE_MAX_BYTES: Readonly<Record<MediaKind, number>> = {
  image: 64 * 2 ** 20,
  audio: 128 * 2 ** 20,
  video: 2 ** 30,
};

/** Noms d'un même conteneur : le contenu en dit un, le fichier peut porter l'autre. */
const SAME_CONTAINER: readonly (readonly string[])[] = [
  ['jpg', 'jpeg'],
  ['png', 'apng'],
  ['mp4', 'm4v', 'm4a'],
];

const sameContainer = (a: string, b: string) => a === b || SAME_CONTAINER.some((group) => group.includes(a) && group.includes(b));

export type ShareCheck = { ok: true; kind: MediaKind; format: string } | { ok: false; reason: string };

/**
 * Un fichier peut-il circuler comme ce média ? Le nom doit porter un format que ce type
 * accepte, et les premiers octets doivent dire le même conteneur : un exécutable nommé .png,
 * une page web nommée .mp4, une archive, une ROM sont refusés. Le contenu prime sur le nom.
 */
export function checkShareable(type: MediaType, name: string, head: Buffer, bytes: number): ShareCheck {
  if (!isShareableType(type)) return { ok: false, reason: t('type de média qui ne se partage pas ({type})', { type }) };
  const info = mediaTypeInfo(type);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!ext || !info.formats.includes(ext)) return { ok: false, reason: ext ? t('format .{ext} refusé pour {label}', { ext, label: info.label }) : t('fichier sans extension') };
  const kind = mediaKind(`x.${ext}`)!;
  const sniffed = sniffBytes(head);
  if (!sniffed.format || (sniffed.kind !== 'image' && sniffed.kind !== 'video' && sniffed.kind !== 'audio') || !sameContainer(sniffed.format, ext)) {
    return { ok: false, reason: t('le contenu ne correspond pas à son nom (.{ext})', { ext }) };
  }
  if (bytes <= 0) return { ok: false, reason: t('fichier vide') };
  if (bytes > SHARE_MAX_BYTES[kind]) return { ok: false, reason: t('fichier trop gros ({mb} Mo au plus)', { mb: Math.round(SHARE_MAX_BYTES[kind] / 2 ** 20) }) };
  return { ok: true, kind, format: ext };
}

export interface MediaIdentity {
  type: MediaType;
  kind: MediaKind;
  /** Extension du fichier, en minuscules (accordée à son contenu). */
  format: string;
  bytes: number;
  /** Empreinte SHA-256 du contenu, en hexadécimal. */
  sha256: string;
}

/** Lit un fichier par morceaux : empreinte SHA-256, et ses premiers octets. */
export function hashFile(file: string): { sha256: string; bytes: number; head: Buffer } {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(512);
  let headLength = 0;
  let bytes = 0;
  try {
    const buf = Buffer.alloc(1 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) {
      const chunk = buf.subarray(0, n);
      if (headLength < head.length) headLength += chunk.copy(head, headLength, 0, Math.min(n, head.length - headLength));
      hash.update(chunk);
      bytes += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { sha256: hash.digest('hex'), bytes, head: head.subarray(0, headLength) };
}

/** Identité d'un média de la borne, ou la raison pour laquelle il ne peut pas circuler. */
export function mediaIdentity(file: string, type: MediaType): { ok: true; media: MediaIdentity } | { ok: false; reason: string } {
  let read: ReturnType<typeof hashFile>;
  try {
    read = hashFile(file);
  } catch {
    return { ok: false, reason: t('fichier illisible') };
  }
  const check = checkShareable(type, file, read.head, read.bytes);
  if (!check.ok) return check;
  return { ok: true, media: { type, kind: check.kind, format: check.format, bytes: read.bytes, sha256: read.sha256 } };
}

// ---------------------------------------------------------------------------
// Un joueur

/** Clé du joueur : la publique (32 octets en hexadécimal) circule, la privée reste sur la borne. */
export interface PlayerKey {
  publicKey: string;
  /** Clé privée au format PKCS #8 (PEM) : jamais transmise, jamais dans un paquet. */
  privateKey: string;
}

/** Nouvelle clé Ed25519 pour le joueur de cette borne. */
export function createPlayerKey(): PlayerKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex'),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

const isPublicKey = (key: unknown): key is string => typeof key === 'string' && /^[0-9a-f]{64}$/.test(key);

/** Empreinte courte d'une clé publique, à lire ou à dicter : « a3f9-12c0-7be4-55d1 ». */
export function playerFingerprint(publicKey: string): string {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest('hex');
  return digest.slice(0, 16).match(/.{4}/g)!.join('-');
}

/** Signature Ed25519 d'un texte (base64). */
export function signText(text: string, key: PlayerKey): string {
  return sign(null, Buffer.from(text, 'utf8'), createPrivateKey(key.privateKey)).toString('base64');
}

/** La signature est-elle celle de cette clé publique sur ce texte exact ? */
export function verifyText(text: string, signature: string, publicKey: string): boolean {
  if (!isPublicKey(publicKey) || typeof signature !== 'string') return false;
  try {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey, 'hex').toString('base64url') }, format: 'jwk' });
    return verify(null, Buffer.from(text, 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export { isPublicKey as isPlayerPublicKey };
