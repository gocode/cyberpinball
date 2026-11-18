// Code de récupération du compte (« Mon compte > Protéger et transférer ») : la clé du joueur écrite
// en 24 mots de recoverywords.ts, à noter sur papier ou à photographier en QR.
//
// La clé du joueur (social.ts) est une clé Ed25519 tirée au hasard : ses 32 octets (la graine) sont
// toute l'identité. 24 mots de 11 bits = 264 bits : les 256 bits de la graine, puis 8 bits de contrôle
// (premier octet de son SHA-256), qui font refuser un mot mal recopié ou deux mots inversés. Le code ne
// dépend d'aucun serveur : il redonne la même clé sur n'importe quel PC, même hors ligne. Ce qui
// entoure la clé (pseudo, amis, niveau) revient du coffre chiffré (vault.ts) quand il existe.
//
// Le QR du code ne contient que les mots, séparés par des espaces, jamais une adresse : l'appareil
// photo du téléphone les lit en texte, et la télécommande les colle d'un coup (parseRecoveryText).

import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { RECOVERY_WORDS } from './recoverywords';
import type { PlayerKey } from './sharing';

export const RECOVERY_WORD_COUNT = 24;
const SEED_BYTES = 32;
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

const INDEX = new Map(RECOVERY_WORDS.map((w, i) => [w, i]));

/** Un mot tel que tapé ou lu : minuscules, sans accent ni ponctuation. */
export function normalizeRecoveryWord(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Les 24 mots d'une graine de 32 octets. */
export function recoveryWords(seed: Uint8Array): string[] {
  if (seed.length !== SEED_BYTES) throw new Error('graine de 32 octets attendue'); // i18n-ignore : erreur de programmation
  const check = createHash('sha256').update(seed).digest()[0]!;
  const bits = [...seed, check].map((b) => b.toString(2).padStart(8, '0')).join('');
  const words: string[] = [];
  for (let i = 0; i < RECOVERY_WORD_COUNT; i++) words.push(RECOVERY_WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]!);
  return words;
}

export type RecoveryProblem = { kind: 'count'; count: number } | { kind: 'unknown'; position: number; word: string } | { kind: 'checksum' };

/** La graine de 24 mots, ou ce qui ne va pas (nombre de mots, mot inconnu, contrôle faux). */
export function seedFromWords(words: readonly string[]): { seed: Buffer } | { problem: RecoveryProblem } {
  const clean = words.map(normalizeRecoveryWord).filter(Boolean);
  if (clean.length !== RECOVERY_WORD_COUNT) return { problem: { kind: 'count', count: clean.length } };
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const index = INDEX.get(clean[i]!);
    if (index === undefined) return { problem: { kind: 'unknown', position: i + 1, word: clean[i]! } };
    bits += index.toString(2).padStart(11, '0');
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const seed = bytes.subarray(0, SEED_BYTES);
  if (createHash('sha256').update(seed).digest()[0] !== bytes[SEED_BYTES]) return { problem: { kind: 'checksum' } };
  return { seed: Buffer.from(seed) };
}

/**
 * Les mots d'un texte collé ou tapé : le QR lu par le téléphone, une liste numérotée recopiée
 * (« 1 orage · 2 pivoter… »), des retours à la ligne. Les numéros et la ponctuation sont ignorés.
 */
export function parseRecoveryText(text: string): string[] {
  return text
    .split(/[\s,;·.\-–—]+/u)
    .map(normalizeRecoveryWord)
    .filter((w) => w.length > 0);
}

/** Les mots de la liste qui commencent par ce début (le clavier les propose dès deux lettres). */
export function suggestRecoveryWords(prefix: string, max = 6): string[] {
  const p = normalizeRecoveryWord(prefix);
  if (p.length < 2) return [];
  const out: string[] = [];
  for (const w of RECOVERY_WORDS) {
    if (w.startsWith(p)) out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Un mot de la liste ? */
export const isRecoveryWord = (word: string): boolean => INDEX.has(normalizeRecoveryWord(word));

/** La clé du joueur refaite de sa graine : la même paire que celle de social.json. */
export function playerKeyFromSeed(seed: Uint8Array): PlayerKey {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  return {
    publicKey: Buffer.from(jwk.x!, 'base64url').toString('hex'),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

/** Le texte du QR : les 24 mots séparés par une espace. */
export const recoveryQrText = (words: readonly string[]): string => words.join(' ');

/** Les deux positions demandées pour vérifier qu'un code est bien noté (1 à 24, distinctes). */
export function recoveryCheckPositions(random: () => number = Math.random): [number, number] {
  const a = 1 + Math.floor(random() * RECOVERY_WORD_COUNT);
  let b = 1 + Math.floor(random() * (RECOVERY_WORD_COUNT - 1));
  if (b >= a) b++;
  return a < b ? [a, b] : [b, a];
}
