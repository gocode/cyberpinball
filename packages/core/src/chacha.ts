// ChaCha20-Poly1305 (RFC 8439) en TypeScript, pour la télécommande du téléphone (remote.ts).
// Pourquoi pas node:crypto : Electron embarque BoringSSL, dont createCipheriv ne connaît pas
// « chacha20-poly1305 » (« Unknown cipher », vérifié le 06/11/2026 dans Electron 44) ; Node seul,
// avec OpenSSL, le connaît. Le même calcul que la page du téléphone (app/renderer/telephone/telephone-core.js),
// tous deux comparés à node:crypto par remote.test.ts (vecteurs de la RFC, messages au hasard).
// Messages de quelques centaines d'octets : Poly1305 en BigInt suffit.

const rotl = (v: number, n: number) => ((v << n) | (v >>> (32 - n))) >>> 0;

function quarter(x: Uint32Array, a: number, b: number, c: number, d: number): void {
  x[a] = (x[a]! + x[b]!) >>> 0;
  x[d] = rotl(x[d]! ^ x[a]!, 16);
  x[c] = (x[c]! + x[d]!) >>> 0;
  x[b] = rotl(x[b]! ^ x[c]!, 12);
  x[a] = (x[a]! + x[b]!) >>> 0;
  x[d] = rotl(x[d]! ^ x[a]!, 8);
  x[c] = (x[c]! + x[d]!) >>> 0;
  x[b] = rotl(x[b]! ^ x[c]!, 7);
}

const word = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

/** Un bloc de 64 octets du flux de ChaCha20 (clé de 32 octets, compteur, nonce de 12). */
export function chachaBlock(key: Uint8Array, counter: number, nonce: Uint8Array): Uint8Array {
  const s = new Uint32Array(16);
  s[0] = 0x61707865;
  s[1] = 0x3320646e;
  s[2] = 0x79622d32;
  s[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) s[4 + i] = word(key, i * 4);
  s[12] = counter >>> 0;
  for (let i = 0; i < 3; i++) s[13 + i] = word(nonce, i * 4);
  const x = new Uint32Array(s);
  for (let i = 0; i < 10; i++) {
    quarter(x, 0, 4, 8, 12);
    quarter(x, 1, 5, 9, 13);
    quarter(x, 2, 6, 10, 14);
    quarter(x, 3, 7, 11, 15);
    quarter(x, 0, 5, 10, 15);
    quarter(x, 1, 6, 11, 12);
    quarter(x, 2, 7, 8, 13);
    quarter(x, 3, 4, 9, 14);
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    const v = (x[i]! + s[i]!) >>> 0;
    out[i * 4] = v & 255;
    out[i * 4 + 1] = (v >>> 8) & 255;
    out[i * 4 + 2] = (v >>> 16) & 255;
    out[i * 4 + 3] = v >>> 24;
  }
  return out;
}

function chachaXor(key: Uint8Array, counter: number, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let at = 0, n = counter; at < data.length; at += 64, n++) {
    const block = chachaBlock(key, n, nonce);
    for (let i = 0; i < 64 && at + i < data.length; i++) out[at + i] = data[at + i]! ^ block[i]!;
  }
  return out;
}

const P = (1n << 130n) - 5n;
const le = (bytes: Uint8Array) => {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]!);
  return v;
};

/** Étiquette Poly1305 de `msg` sous une clé à usage unique de 32 octets. */
export function poly1305(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const r = le(key.subarray(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  const s = le(key.subarray(16, 32));
  let acc = 0n;
  for (let at = 0; at < msg.length; at += 16) {
    const chunk = msg.subarray(at, Math.min(at + 16, msg.length));
    acc = ((acc + le(chunk) + (1n << BigInt(8 * chunk.length))) * r) % P;
  }
  let tag = (acc + s) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number(tag & 255n);
    tag >>= 8n;
  }
  return out;
}

function macData(aad: Uint8Array, ct: Uint8Array): Uint8Array {
  const pad = (n: number) => (16 - (n % 16)) % 16;
  const out = new Uint8Array(aad.length + pad(aad.length) + ct.length + pad(ct.length) + 16);
  out.set(aad, 0);
  out.set(ct, aad.length + pad(aad.length));
  const lens = new DataView(out.buffer, out.length - 16);
  lens.setUint32(0, aad.length, true);
  lens.setUint32(8, ct.length, true);
  return out;
}

/** Chiffre et authentifie : le chiffré suivi de l'étiquette de 16 octets. */
export function aeadSeal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plain: Uint8Array): Uint8Array {
  const polyKey = chachaBlock(key, 0, nonce).subarray(0, 32);
  const ct = chachaXor(key, 1, nonce, plain);
  const tag = poly1305(polyKey, macData(aad, ct));
  const out = new Uint8Array(ct.length + 16);
  out.set(ct, 0);
  out.set(tag, ct.length);
  return out;
}

/** Le clair, ou undefined si l'étiquette ne correspond pas (autre clé, autres données associées, trame modifiée). */
export function aeadOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Uint8Array | undefined {
  if (sealed.length < 16) return undefined;
  const ct = sealed.subarray(0, sealed.length - 16);
  const tag = poly1305(chachaBlock(key, 0, nonce).subarray(0, 32), macData(aad, ct));
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= tag[i]! ^ sealed[ct.length + i]!;
  return diff ? undefined : chachaXor(key, 1, nonce, ct);
}
