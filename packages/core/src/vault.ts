// Coffre du compte (« Mon compte > Protéger et transférer ») : une copie chiffrée du paquet de compte
// (account.ts) gardée par le service du projet (packages/service-telephone/worker.mjs, base D1), que
// le service ne peut pas ouvrir. Elle sert à retrouver tout le compte (pseudo, amis, niveau, badges,
// avatar) sur un autre PC, avec le code de récupération ou avec le pseudo et un mot de passe.
//
// Chiffrement, sur la borne seulement :
// - la clé des données est tirée de la graine du joueur (HKDF-SHA256) : le code de récupération, qui
//   redonne la graine (recovery.ts), ouvre donc le coffre sans rien d'autre ;
// - le paquet est compressé (gzip) puis chiffré en AES-256-GCM avec cette clé ;
// - avec un mot de passe : scrypt (N = 2^15, r = 8, p = 1) en tire 64 octets ; les 32 premiers
//   prouvent le mot de passe au service (il n'en garde que l'empreinte SHA-256 et limite les essais),
//   les 32 derniers chiffrent la clé des données (« enveloppe »), que le service ne rend qu'à qui a
//   prouvé le mot de passe. Le mot de passe et la clé ne quittent jamais la borne ;
// - le service range le coffre sous la clé publique du joueur ; chaque écriture est signée par sa
//   clé privée (même protocole que les retours, op « coffre » et « coffre-mdp »).
//
// Le protocole est fixé des deux côtés : ce fichier et worker.mjs, tenus ensemble par mon-compte.test.ts.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseAccountBundle, type AccountBundle } from './account';
import { FEEDBACK_PREFIX } from './feedback';
import { normalizeName } from './social';
import { signText, type PlayerKey } from './sharing';

/** Taille d'un coffre chiffré accepté par le service (octets). */
export const VAULT_MAX = 900_000;
export const VAULT_MAGIC = 'CPC1';
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** La clé des données du coffre, tirée de la graine du joueur. */
export function vaultDataKey(seed: Uint8Array): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(seed), Buffer.from('cyberpinball:coffre:v1'), Buffer.from('donnees'), 32));
}

function seal(key: Uint8Array, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

function open(key: Uint8Array, sealed: Uint8Array): Buffer | undefined {
  if (sealed.length < 28) return undefined;
  try {
    const d = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
    d.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([d.update(sealed.subarray(28)), d.final()]);
  } catch {
    return undefined;
  }
}

/** Le coffre d'un paquet : « CPC1 » puis le paquet compressé et chiffré avec la clé des données. */
export function sealVault(bundle: AccountBundle, dataKey: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from(VAULT_MAGIC), seal(dataKey, gzipSync(Buffer.from(JSON.stringify(bundle))))]);
}

/** Le paquet d'un coffre ; undefined si la clé ne l'ouvre pas ou s'il est abîmé. */
export function openVault(sealed: Uint8Array, dataKey: Uint8Array): AccountBundle | undefined {
  if (Buffer.from(sealed.subarray(0, 4)).toString() !== VAULT_MAGIC) return undefined;
  const plain = open(dataKey, sealed.subarray(4));
  if (!plain) return undefined;
  try {
    return parseAccountBundle(JSON.parse(gunzipSync(plain).toString('utf8')));
  } catch {
    return undefined;
  }
}

/** L'identifiant du mot de passe tel que le service le compare : le pseudo, sans casse ni espaces doubles. */
export function vaultLogin(name: string): string | undefined {
  const clean = normalizeName(name);
  return clean ? clean.normalize('NFC').toLowerCase() : undefined;
}

/** Ce que scrypt tire du mot de passe : la preuve (au service) et la clé de l'enveloppe (jamais envoyée). */
export function passwordKeys(password: string, salt: Uint8Array): { auth: Buffer; wrap: Buffer } {
  const out = scryptSync(password.normalize('NFC'), Buffer.from(salt), 64, SCRYPT);
  return { auth: out.subarray(0, 32), wrap: out.subarray(32) };
}

/** Un mot de passe acceptable : longueur, et pas seulement des espaces. */
export function passwordProblem(password: string): 'short' | 'long' | undefined {
  const p = password.normalize('NFC');
  if (p.trim().length < PASSWORD_MIN) return 'short';
  return p.length > PASSWORD_MAX ? 'long' : undefined;
}

/** Force affichée d'un mot de passe (longueur et variété), sans prétendre mieux. */
export function passwordStrength(password: string): 'weak' | 'fair' | 'strong' {
  const p = password.normalize('NFC');
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 14 || (p.length >= 11 && kinds >= 3)) return 'strong';
  return p.length >= 10 && kinds >= 2 ? 'fair' : 'weak';
}

/** Ce qu'envoie la borne pour créer ou changer le mot de passe : sel, empreinte de la preuve, enveloppe. */
export function passwordSetup(password: string, dataKey: Uint8Array, salt: Uint8Array = randomBytes(16)): { salt: string; auth: string; wrap: string } {
  const k = passwordKeys(password, salt);
  return { salt: Buffer.from(salt).toString('base64'), auth: createHash('sha256').update(k.auth).digest('hex'), wrap: seal(k.wrap, dataKey).toString('base64') };
}

/** La clé des données sortie de l'enveloppe rendue par le service ; undefined si le mot de passe ne l'ouvre pas. */
export function unwrapDataKey(wrapB64: string, wrapKey: Uint8Array): Buffer | undefined {
  const k = open(wrapKey, Buffer.from(wrapB64, 'base64'));
  return k && k.length === 32 ? k : undefined;
}

// ---------------------------------------------------------------------------
// Requêtes signées (même enveloppe que les retours : { b, s }, préfixe FEEDBACK_PREFIX)

export type VaultOp = { op: 'coffre'; data: string; hash: string } | { op: 'coffre-mdp'; login: string; salt: string; auth: string; wrap: string } | { op: 'coffre-mdp'; remove: true };

export function signVault(key: PlayerKey, op: VaultOp, now = Date.now()): { b: string; s: string } {
  const b = JSON.stringify({ v: 1, ...op, pk: key.publicKey, t: now });
  return { b, s: signText(FEEDBACK_PREFIX + b, key) };
}
