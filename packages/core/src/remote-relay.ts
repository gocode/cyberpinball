// Adresse stable du téléphone gardé, par Internet (13/11/2026). La borne sert la page du téléphone
// sur le réseau local, à son adresse IP. Le DHCP du routeur peut la changer au redémarrage. Le
// raccourci de l'écran d'accueil mène alors à une adresse morte, et le stockage du navigateur, rangé
// par adresse, ne suit pas. L'iPhone retrouve la borne par son nom (« cyberpinball.local »), mais
// Chrome et Brave pour Android ne résolvent pas les noms en « .local ».
//
// D'où une entrée stable sur Internet : https://t.cyberpinball.com/b/<id>, que le service du projet
// (packages/service-telephone) renvoie vers l'adresse locale du moment, http://<ip>:<port>/, en
// gardant la clé du téléphone dans le fragment (#g=…). Ce service ne fait que rediriger : une page
// HTTPS ne peut pas ouvrir de WebSocket en HTTP vers la borne (contenu mixte).
//
// Ce que la borne déclare, et comment :
// - son identifiant `id` : l'empreinte (SHA-256, 22 caractères base64url) de sa clé publique Ed25519,
//   tirée d'une graine propre à la borne (data\telephones.json), distincte de l'identité du joueur
//   sur le réseau des amis : rien ne relie les deux ;
// - une entrée par téléphone gardé : `f`, l'empreinte de sa clé (keptFingerprint), et `c`, son
//   adresse locale et son port scellés en ChaCha20-Poly1305 sous la clé de ce téléphone. Le service
//   ne stocke que des données illisibles : sans la clé d'un téléphone, personne ne lit l'adresse,
//   même avec l'identifiant. Un téléphone oublié n'a plus d'entrée ;
// - le tout signé (Ed25519) et daté : le service vérifie que la clé publique donne bien `id`, la
//   signature, et que la date avance. Personne d'autre que la borne n'écrit sous son identifiant.
//
// La clé d'un téléphone ne quitte jamais le téléphone : le fragment d'une adresse n'est pas envoyé,
// la page du service le lit en JavaScript, déchiffre l'adresse sur le téléphone, et le recopie dans
// l'adresse locale. Seules sont publiées une adresse IPv4 privée et un port, jamais un nom ni rien de
// la machine. La fonction se désactive dans Menu système > Ma borne > Télécommande du téléphone.

import * as crypto from 'node:crypto';
import { aeadOpen, aeadSeal } from './chacha';
import { fromBase64Url, keptFingerprint, toBase64Url } from './remote';

/** Le service de l'adresse stable (packages/service-telephone). CYBERPINBALL_RELAIS le remplace pendant un essai. */
export const RELAY_ORIGIN = 'https://t.cyberpinball.com';
/** Déclaration renouvelée au moins une fois par semaine (le service l'oublie après RELAY_TTL_S sans nouvelle). */
export const RELAY_REFRESH_MS = 7 * 86_400_000;
/** Durée de vie d'une déclaration chez le service, en secondes (60 jours). */
export const RELAY_TTL_S = 60 * 86_400;
/** Écart toléré entre l'horloge de la borne et celle du service. */
export const RELAY_CLOCK_SKEW_MS = 10 * 60_000;
/** Au plus, entrées d'une déclaration (REMOTE_KEPT_MAX téléphones gardés). */
export const RELAY_ENTRIES_MAX = 8;
/** Taille maximale d'une déclaration (texte signé). */
export const RELAY_BODY_MAX = 4096;
/** Texte signé : ce préfixe, puis la déclaration (JSON). Le même dans le service. */
export const RELAY_SIGNED_PREFIX = 'cyberpinball:adresse:v1\n';

const ID = /^[A-Za-z0-9_-]{22}$/;
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

/** Une graine neuve (32 octets), pour la première déclaration de la borne. */
export function relaySeed(random: (n: number) => Buffer = crypto.randomBytes): Buffer {
  return random(32);
}

/** Clé privée Ed25519 de la borne, et sa clé publique brute (32 octets), depuis sa graine. */
export function relayKeys(seed: Uint8Array): { privateKey: crypto.KeyObject; publicKey: Buffer } {
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { privateKey, publicKey: Buffer.from(publicKey) };
}

/** Identifiant de la borne chez le service : l'empreinte de sa clé publique (22 caractères base64url). */
export function relayId(publicKey: Uint8Array): string {
  return toBase64Url(crypto.createHash('sha256').update(publicKey).digest()).slice(0, 22);
}

/** Adresse du raccourci du téléphone : l'entrée stable de cette borne (la clé s'ajoute dans le fragment, sur le téléphone). */
export function relayPhoneUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, '')}/b/${id}`;
}

/**
 * Une adresse que la borne peut déclarer, et vers laquelle la page du service accepte de renvoyer :
 * une IPv4 privée (10/8, 172.16/12, 192.168/16), et un port. Jamais 127.0.0.1, une adresse publique
 * ni un nom. Même règle dans la page du service (page.js, localAddress).
 */
export function relayAddressOk(host: unknown, port: unknown): boolean {
  if (typeof host !== 'string' || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return false;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number) as [number, number, number, number];
  if ([a, b, c, d].some((x) => x > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Données associées de l'entrée d'un téléphone : liée à cette borne, elle ne sert pas ailleurs. */
function entryAad(id: string): Buffer {
  return Buffer.from(`cyberpinball:adresse:${id}`, 'utf8');
}

/** Ce que la borne envoie au service : la déclaration (texte JSON) et sa signature. */
export interface RelayPayload {
  b: string;
  s: string;
}

/** La déclaration, une fois lue. */
export interface RelayBody {
  v: 1;
  id: string;
  pk: string;
  t: number;
  e: { f: string; c: string }[];
}

export interface RelayRecordInput {
  seed: Uint8Array;
  host: string;
  port: number;
  /** Clés des téléphones gardés. */
  phones: readonly Uint8Array[];
  now: number;
  random?: (n: number) => Buffer;
}

/**
 * La déclaration signée de la borne. Sans téléphone (tous oubliés) ou fonction désactivée, `phones`
 * est vide : le service efface alors l'entrée de la borne.
 */
export function relayRecord(input: RelayRecordInput): { id: string; payload: RelayPayload } {
  const random = input.random ?? crypto.randomBytes;
  const { privateKey, publicKey } = relayKeys(input.seed);
  const id = relayId(publicKey);
  const plain = Buffer.from(JSON.stringify({ h: input.host, p: input.port, t: input.now }), 'utf8');
  const e = input.phones.slice(0, RELAY_ENTRIES_MAX).map((key) => {
    const nonce = random(12);
    return { f: keptFingerprint(key), c: toBase64Url(Buffer.concat([nonce, aeadSeal(key, nonce, entryAad(id), plain)])) };
  });
  const body: RelayBody = { v: 1, id, pk: toBase64Url(publicKey), t: input.now, e };
  const b = JSON.stringify(body);
  const s = toBase64Url(crypto.sign(null, Buffer.from(RELAY_SIGNED_PREFIX + b, 'utf8'), privateKey));
  return { id, payload: { b, s } };
}

/**
 * Vérifie une déclaration comme le service (packages/service-telephone/worker.mjs, verify) : forme,
 * identifiant tiré de la clé publique, signature, date. Pour les essais : le service a sa propre
 * version, en WebCrypto.
 */
export function relayVerify(id: string, payload: unknown, now: number, before?: number): { ok: true; body: RelayBody } | { ok: false; why: string } {
  if (!ID.test(id)) return { ok: false, why: 'id' };
  const p = payload as Partial<RelayPayload> | null;
  if (!p || typeof p.b !== 'string' || typeof p.s !== 'string' || p.b.length > RELAY_BODY_MAX) return { ok: false, why: 'forme' };
  let body: RelayBody;
  try {
    body = JSON.parse(p.b) as RelayBody;
  } catch {
    return { ok: false, why: 'forme' };
  }
  const pk = fromBase64Url(body?.pk, 32);
  const sig = fromBase64Url(p.s, 64);
  if (body?.v !== 1 || body.id !== id || !pk || !sig || typeof body.t !== 'number' || !Array.isArray(body.e) || body.e.length > RELAY_ENTRIES_MAX) return { ok: false, why: 'forme' };
  if (!body.e.every((x) => x && /^[A-Za-z0-9_-]{22}$/.test(x.f) && typeof x.c === 'string' && /^[A-Za-z0-9_-]{40,400}$/.test(x.c))) return { ok: false, why: 'forme' };
  if (relayId(pk) !== id) return { ok: false, why: 'id' };
  const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, pk]), format: 'der', type: 'spki' });
  if (!crypto.verify(null, Buffer.from(RELAY_SIGNED_PREFIX + p.b, 'utf8'), key, sig)) return { ok: false, why: 'signature' };
  if (Math.abs(body.t - now) > RELAY_CLOCK_SKEW_MS) return { ok: false, why: 'date' };
  if (before !== undefined && body.t <= before) return { ok: false, why: 'rejeu' };
  return { ok: true, body };
}

/**
 * Ce que lit le téléphone, avec sa clé : l'adresse locale de la borne, ou undefined (pas d'entrée à
 * lui, entrée d'une autre clé, adresse refusée). Même calcul dans la page du service (page.js).
 */
export function relayOpen(key: Uint8Array, body: Pick<RelayBody, 'id' | 'e'>): { host: string; port: number; t: number } | undefined {
  const f = keptFingerprint(key);
  const entry = body.e.find((x) => x.f === f);
  const raw = entry && fromBase64Url(entry.c);
  if (!raw || raw.length < 12 + 16) return undefined;
  const plain = aeadOpen(key, raw.subarray(0, 12), entryAad(body.id), raw.subarray(12));
  if (!plain) return undefined;
  try {
    const a = JSON.parse(Buffer.from(plain).toString('utf8')) as { h?: unknown; p?: unknown; t?: unknown };
    return relayAddressOk(a.h, a.p) && typeof a.t === 'number' ? { host: a.h as string, port: a.p as number, t: a.t } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ce que résume une déclaration, pour savoir s'il faut la renvoyer : l'adresse, le port, les
 * téléphones. Rien de secret : une empreinte.
 */
export function relaySum(host: string, port: number, phones: readonly Uint8Array[]): string {
  const prints = phones.map((k) => keptFingerprint(k)).sort();
  return toBase64Url(crypto.createHash('sha256').update(`${host}:${port}:${prints.join(',')}`).digest()).slice(0, 22);
}
