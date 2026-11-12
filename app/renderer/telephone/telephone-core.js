// Cœur de la page du téléphone (télécommande de la borne, packages/core/src/remote.ts) : le
// chiffrement des messages, la saisie, le nom du téléphone. Servi par la borne au téléphone
// (app/src/phone-remote.ts), chargé aussi par les tests sous Node (remote.test.ts compare ce
// chiffrement à celui de node:crypto). Rien ici ne touche à la page.
//
// La page est servie en HTTP sur le réseau local, où le navigateur n'offre pas WebCrypto : d'où
// ChaCha20-Poly1305 (RFC 8439) écrit ici. Même format de trame que sealRemote / openRemote :
// base64url(nonce 12 ‖ chiffré ‖ étiquette 16) ; les morceaux d'un fichier envoyé, le même en
// binaire (sealBytes). Assez rapide pour un fichier de plusieurs centaines de Mo : ChaCha20 sans
// allocation par bloc, Poly1305 en membres de 13 bits (poly1305-donna 16 bits) plutôt qu'en BigInt.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.cyberRemoteCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- ChaCha20 ---------------------------------------------------------

  const rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;

  function quarter(x, a, b, c, d) {
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12);
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7);
  }

  const word = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

  /** Un bloc de 64 octets du flux de ChaCha20 (clé 32, compteur, nonce 12). */
  function chachaBlock(key, counter, nonce) {
    const s = new Uint32Array(16);
    s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
    for (let i = 0; i < 8; i++) s[4 + i] = word(key, i * 4);
    s[12] = counter >>> 0;
    for (let i = 0; i < 3; i++) s[13 + i] = word(nonce, i * 4);
    const x = new Uint32Array(s);
    for (let i = 0; i < 10; i++) {
      quarter(x, 0, 4, 8, 12); quarter(x, 1, 5, 9, 13); quarter(x, 2, 6, 10, 14); quarter(x, 3, 7, 11, 15);
      quarter(x, 0, 5, 10, 15); quarter(x, 1, 6, 11, 12); quarter(x, 2, 7, 8, 13); quarter(x, 3, 4, 9, 14);
    }
    const out = new Uint8Array(64);
    for (let i = 0; i < 16; i++) {
      const v = (x[i] + s[i]) >>> 0;
      out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255; out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = v >>> 24;
    }
    return out;
  }

  /** Le flux de ChaCha20 à partir du bloc `counter`, mêlé à `data` : seize variables locales, aucune allocation par bloc. */
  function chachaXor(key, counter, nonce, data) {
    const out = new Uint8Array(data.length);
    const k0 = word(key, 0) | 0;
    const k1 = word(key, 4) | 0;
    const k2 = word(key, 8) | 0;
    const k3 = word(key, 12) | 0;
    const k4 = word(key, 16) | 0;
    const k5 = word(key, 20) | 0;
    const k6 = word(key, 24) | 0;
    const k7 = word(key, 28) | 0;
    const n0 = word(nonce, 0) | 0;
    const n1 = word(nonce, 4) | 0;
    const n2 = word(nonce, 8) | 0;
    const len = data.length;
    for (let at = 0, n = counter; at < len; at += 64, n++) {
      let x0 = 0x61707865, x1 = 0x3320646e, x2 = 0x79622d32, x3 = 0x6b206574, x4 = k0, x5 = k1, x6 = k2, x7 = k3, x8 = k4, x9 = k5, x10 = k6, x11 = k7, x12 = n | 0, x13 = n0, x14 = n1, x15 = n2;
      for (let r = 0; r < 10; r++) {
        x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 16) | (x12 >>> 16);
        x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 12) | (x4 >>> 20);
        x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 8) | (x12 >>> 24);
        x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 7) | (x4 >>> 25);
        x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 16) | (x13 >>> 16);
        x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 12) | (x5 >>> 20);
        x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 8) | (x13 >>> 24);
        x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 7) | (x5 >>> 25);
        x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 16) | (x14 >>> 16);
        x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 12) | (x6 >>> 20);
        x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 8) | (x14 >>> 24);
        x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 7) | (x6 >>> 25);
        x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 16) | (x15 >>> 16);
        x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 12) | (x7 >>> 20);
        x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 8) | (x15 >>> 24);
        x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 7) | (x7 >>> 25);
        x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 16) | (x15 >>> 16);
        x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 12) | (x5 >>> 20);
        x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 8) | (x15 >>> 24);
        x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 7) | (x5 >>> 25);
        x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 16) | (x12 >>> 16);
        x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 12) | (x6 >>> 20);
        x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 8) | (x12 >>> 24);
        x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 7) | (x6 >>> 25);
        x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 16) | (x13 >>> 16);
        x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 12) | (x7 >>> 20);
        x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 8) | (x13 >>> 24);
        x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 7) | (x7 >>> 25);
        x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 16) | (x14 >>> 16);
        x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 12) | (x4 >>> 20);
        x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 8) | (x14 >>> 24);
        x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 7) | (x4 >>> 25);
      }
      x0 = (x0 + 0x61707865) | 0;
      x1 = (x1 + 0x3320646e) | 0;
      x2 = (x2 + 0x79622d32) | 0;
      x3 = (x3 + 0x6b206574) | 0;
      x4 = (x4 + k0) | 0;
      x5 = (x5 + k1) | 0;
      x6 = (x6 + k2) | 0;
      x7 = (x7 + k3) | 0;
      x8 = (x8 + k4) | 0;
      x9 = (x9 + k5) | 0;
      x10 = (x10 + k6) | 0;
      x11 = (x11 + k7) | 0;
      x12 = (x12 + n) | 0;
      x13 = (x13 + n0) | 0;
      x14 = (x14 + n1) | 0;
      x15 = (x15 + n2) | 0;
      if (at + 64 <= len) {
        out[at + 0] = data[at + 0] ^ (x0 & 255); out[at + 1] = data[at + 1] ^ ((x0 >>> 8) & 255); out[at + 2] = data[at + 2] ^ ((x0 >>> 16) & 255); out[at + 3] = data[at + 3] ^ (x0 >>> 24);
        out[at + 4] = data[at + 4] ^ (x1 & 255); out[at + 5] = data[at + 5] ^ ((x1 >>> 8) & 255); out[at + 6] = data[at + 6] ^ ((x1 >>> 16) & 255); out[at + 7] = data[at + 7] ^ (x1 >>> 24);
        out[at + 8] = data[at + 8] ^ (x2 & 255); out[at + 9] = data[at + 9] ^ ((x2 >>> 8) & 255); out[at + 10] = data[at + 10] ^ ((x2 >>> 16) & 255); out[at + 11] = data[at + 11] ^ (x2 >>> 24);
        out[at + 12] = data[at + 12] ^ (x3 & 255); out[at + 13] = data[at + 13] ^ ((x3 >>> 8) & 255); out[at + 14] = data[at + 14] ^ ((x3 >>> 16) & 255); out[at + 15] = data[at + 15] ^ (x3 >>> 24);
        out[at + 16] = data[at + 16] ^ (x4 & 255); out[at + 17] = data[at + 17] ^ ((x4 >>> 8) & 255); out[at + 18] = data[at + 18] ^ ((x4 >>> 16) & 255); out[at + 19] = data[at + 19] ^ (x4 >>> 24);
        out[at + 20] = data[at + 20] ^ (x5 & 255); out[at + 21] = data[at + 21] ^ ((x5 >>> 8) & 255); out[at + 22] = data[at + 22] ^ ((x5 >>> 16) & 255); out[at + 23] = data[at + 23] ^ (x5 >>> 24);
        out[at + 24] = data[at + 24] ^ (x6 & 255); out[at + 25] = data[at + 25] ^ ((x6 >>> 8) & 255); out[at + 26] = data[at + 26] ^ ((x6 >>> 16) & 255); out[at + 27] = data[at + 27] ^ (x6 >>> 24);
        out[at + 28] = data[at + 28] ^ (x7 & 255); out[at + 29] = data[at + 29] ^ ((x7 >>> 8) & 255); out[at + 30] = data[at + 30] ^ ((x7 >>> 16) & 255); out[at + 31] = data[at + 31] ^ (x7 >>> 24);
        out[at + 32] = data[at + 32] ^ (x8 & 255); out[at + 33] = data[at + 33] ^ ((x8 >>> 8) & 255); out[at + 34] = data[at + 34] ^ ((x8 >>> 16) & 255); out[at + 35] = data[at + 35] ^ (x8 >>> 24);
        out[at + 36] = data[at + 36] ^ (x9 & 255); out[at + 37] = data[at + 37] ^ ((x9 >>> 8) & 255); out[at + 38] = data[at + 38] ^ ((x9 >>> 16) & 255); out[at + 39] = data[at + 39] ^ (x9 >>> 24);
        out[at + 40] = data[at + 40] ^ (x10 & 255); out[at + 41] = data[at + 41] ^ ((x10 >>> 8) & 255); out[at + 42] = data[at + 42] ^ ((x10 >>> 16) & 255); out[at + 43] = data[at + 43] ^ (x10 >>> 24);
        out[at + 44] = data[at + 44] ^ (x11 & 255); out[at + 45] = data[at + 45] ^ ((x11 >>> 8) & 255); out[at + 46] = data[at + 46] ^ ((x11 >>> 16) & 255); out[at + 47] = data[at + 47] ^ (x11 >>> 24);
        out[at + 48] = data[at + 48] ^ (x12 & 255); out[at + 49] = data[at + 49] ^ ((x12 >>> 8) & 255); out[at + 50] = data[at + 50] ^ ((x12 >>> 16) & 255); out[at + 51] = data[at + 51] ^ (x12 >>> 24);
        out[at + 52] = data[at + 52] ^ (x13 & 255); out[at + 53] = data[at + 53] ^ ((x13 >>> 8) & 255); out[at + 54] = data[at + 54] ^ ((x13 >>> 16) & 255); out[at + 55] = data[at + 55] ^ (x13 >>> 24);
        out[at + 56] = data[at + 56] ^ (x14 & 255); out[at + 57] = data[at + 57] ^ ((x14 >>> 8) & 255); out[at + 58] = data[at + 58] ^ ((x14 >>> 16) & 255); out[at + 59] = data[at + 59] ^ (x14 >>> 24);
        out[at + 60] = data[at + 60] ^ (x15 & 255); out[at + 61] = data[at + 61] ^ ((x15 >>> 8) & 255); out[at + 62] = data[at + 62] ^ ((x15 >>> 16) & 255); out[at + 63] = data[at + 63] ^ (x15 >>> 24);
      } else {
        const words = [x0, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15];
        for (let i = 0; at + i < len; i++) out[at + i] = data[at + i] ^ ((words[i >> 2] >>> ((i & 3) * 8)) & 255);
      }
    }
    return out;
  }

  // --- Poly1305 -----------------------------------------------------------

  const u16 = (b, i) => b[i] | (b[i + 1] << 8);

  /**
   * Étiquette Poly1305 de `msg` sous une clé à usage unique de 32 octets (poly1305-donna, version
   * 16 bits, domaine public) : h et r en dix membres de 13 bits, en variables locales. Les produits
   * restent sous 2^32 (la retenue partielle après le cinquième y veille), là où >>> ne tronque rien.
   */
  function poly1305(key, msg) {
    const t0k = u16(key, 0);
    const t1k = u16(key, 2);
    const t2k = u16(key, 4);
    const t3k = u16(key, 6);
    const t4k = u16(key, 8);
    const t5k = u16(key, 10);
    const t6k = u16(key, 12);
    const t7k = u16(key, 14);
    const r0 = t0k & 0x1fff;
    const r1 = ((t0k >>> 13) | (t1k << 3)) & 0x1fff;
    const r2 = ((t1k >>> 10) | (t2k << 6)) & 0x1f03;
    const r3 = ((t2k >>> 7) | (t3k << 9)) & 0x1fff;
    const r4 = ((t3k >>> 4) | (t4k << 12)) & 0x00ff;
    const r5 = (t4k >>> 1) & 0x1ffe;
    const r6 = ((t4k >>> 14) | (t5k << 2)) & 0x1fff;
    const r7 = ((t5k >>> 11) | (t6k << 5)) & 0x1f81;
    const r8 = ((t6k >>> 8) | (t7k << 8)) & 0x1fff;
    const r9 = (t7k >>> 5) & 0x007f;
    const v1 = 5 * r1;
    const v2 = 5 * r2;
    const v3 = 5 * r3;
    const v4 = 5 * r4;
    const v5 = 5 * r5;
    const v6 = 5 * r6;
    const v7 = 5 * r7;
    const v8 = 5 * r8;
    const v9 = 5 * r9;
    let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0, h8 = 0, h9 = 0;
    const last = new Uint8Array(16);
    for (let at = 0; at < msg.length; at += 16) {
      let m = msg;
      let p = at;
      let hibit = 1 << 11;
      if (msg.length - at < 16) {
        // Dernier bloc incomplet : complété par un 1 puis des zéros, sans le bit 2^128.
        last.fill(0);
        last.set(msg.subarray(at));
        last[msg.length - at] = 1;
        m = last;
        p = 0;
        hibit = 0;
      }
      const t0 = m[p + 0] | (m[p + 1] << 8);
      const t1 = m[p + 2] | (m[p + 3] << 8);
      const t2 = m[p + 4] | (m[p + 5] << 8);
      const t3 = m[p + 6] | (m[p + 7] << 8);
      const t4 = m[p + 8] | (m[p + 9] << 8);
      const t5 = m[p + 10] | (m[p + 11] << 8);
      const t6 = m[p + 12] | (m[p + 13] << 8);
      const t7 = m[p + 14] | (m[p + 15] << 8);
      h0 += t0 & 0x1fff;
      h1 += ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
      h2 += ((t1 >>> 10) | (t2 << 6)) & 0x1fff;
      h3 += ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
      h4 += ((t3 >>> 4) | (t4 << 12)) & 0x1fff;
      h5 += (t4 >>> 1) & 0x1fff;
      h6 += ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
      h7 += ((t5 >>> 11) | (t6 << 5)) & 0x1fff;
      h8 += ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
      h9 += (t7 >>> 5) | hibit;
      let c = 0;
      let d;
      d = c + h0 * r0 + h1 * v9 + h2 * v8 + h3 * v7 + h4 * v6;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * v5 + h6 * v4 + h7 * v3 + h8 * v2 + h9 * v1;
      c += d >>> 13;
      const d0 = d & 0x1fff;
      d = c + h0 * r1 + h1 * r0 + h2 * v9 + h3 * v8 + h4 * v7;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * v6 + h6 * v5 + h7 * v4 + h8 * v3 + h9 * v2;
      c += d >>> 13;
      const d1 = d & 0x1fff;
      d = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * v9 + h4 * v8;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * v7 + h6 * v6 + h7 * v5 + h8 * v4 + h9 * v3;
      c += d >>> 13;
      const d2 = d & 0x1fff;
      d = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * v9;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * v8 + h6 * v7 + h7 * v6 + h8 * v5 + h9 * v4;
      c += d >>> 13;
      const d3 = d & 0x1fff;
      d = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * v9 + h6 * v8 + h7 * v7 + h8 * v6 + h9 * v5;
      c += d >>> 13;
      const d4 = d & 0x1fff;
      d = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * r0 + h6 * v9 + h7 * v8 + h8 * v7 + h9 * v6;
      c += d >>> 13;
      const d5 = d & 0x1fff;
      d = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * r1 + h6 * r0 + h7 * v9 + h8 * v8 + h9 * v7;
      c += d >>> 13;
      const d6 = d & 0x1fff;
      d = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * r2 + h6 * r1 + h7 * r0 + h8 * v9 + h9 * v8;
      c += d >>> 13;
      const d7 = d & 0x1fff;
      d = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * v9;
      c += d >>> 13;
      const d8 = d & 0x1fff;
      d = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
      c = d >>> 13;
      d &= 0x1fff;
      d += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
      c += d >>> 13;
      const d9 = d & 0x1fff;
      c = (c << 2) + c + d0;
      h0 = c & 0x1fff;
      h1 = d1 + (c >>> 13);
      h2 = d2;
      h3 = d3;
      h4 = d4;
      h5 = d5;
      h6 = d6;
      h7 = d7;
      h8 = d8;
      h9 = d9;
    }
    // Retenue complète, puis h - p si h >= p.
    let c = h1 >>> 13;
    h1 &= 0x1fff;
    h2 += c;
    c = h2 >>> 13;
    h2 &= 0x1fff;
    h3 += c;
    c = h3 >>> 13;
    h3 &= 0x1fff;
    h4 += c;
    c = h4 >>> 13;
    h4 &= 0x1fff;
    h5 += c;
    c = h5 >>> 13;
    h5 &= 0x1fff;
    h6 += c;
    c = h6 >>> 13;
    h6 &= 0x1fff;
    h7 += c;
    c = h7 >>> 13;
    h7 &= 0x1fff;
    h8 += c;
    c = h8 >>> 13;
    h8 &= 0x1fff;
    h9 += c;
    c = h9 >>> 13;
    h9 &= 0x1fff;
    h0 += c * 5;
    c = h0 >>> 13;
    h0 &= 0x1fff;
    h1 += c;
    c = h1 >>> 13;
    h1 &= 0x1fff;
    h2 += c;
    let g0 = h0 + 5;
    c = g0 >>> 13;
    g0 &= 0x1fff;
    let g1 = h1 + c;
    c = g1 >>> 13;
    g1 &= 0x1fff;
    let g2 = h2 + c;
    c = g2 >>> 13;
    g2 &= 0x1fff;
    let g3 = h3 + c;
    c = g3 >>> 13;
    g3 &= 0x1fff;
    let g4 = h4 + c;
    c = g4 >>> 13;
    g4 &= 0x1fff;
    let g5 = h5 + c;
    c = g5 >>> 13;
    g5 &= 0x1fff;
    let g6 = h6 + c;
    c = g6 >>> 13;
    g6 &= 0x1fff;
    let g7 = h7 + c;
    c = g7 >>> 13;
    g7 &= 0x1fff;
    let g8 = h8 + c;
    c = g8 >>> 13;
    g8 &= 0x1fff;
    let g9 = h9 + c;
    c = g9 >>> 13;
    g9 &= 0x1fff;
    // c vaut 1 si h + 5 atteint 2^130, c'est-à-dire si h >= p : on garde g.
    if (c) {
      h0 = g0; h1 = g1; h2 = g2; h3 = g3; h4 = g4; h5 = g5; h6 = g6; h7 = g7; h8 = g8; h9 = g9;
    }
    // h modulo 2^128, en huit mots de 16 bits, plus la seconde moitié de la clé.
    const w = [(h0 | (h1 << 13)) & 0xffff, ((h1 >>> 3) | (h2 << 10)) & 0xffff, ((h2 >>> 6) | (h3 << 7)) & 0xffff, ((h3 >>> 9) | (h4 << 4)) & 0xffff, ((h4 >>> 12) | (h5 << 1) | (h6 << 14)) & 0xffff, ((h6 >>> 2) | (h7 << 11)) & 0xffff, ((h7 >>> 5) | (h8 << 8)) & 0xffff, ((h8 >>> 8) | (h9 << 5)) & 0xffff];
    const out = new Uint8Array(16);
    let f = 0;
    for (let i = 0; i < 8; i++) {
      f = w[i] + u16(key, 16 + i * 2) + (f >>> 16);
      out[i * 2] = f & 255;
      out[i * 2 + 1] = (f >>> 8) & 255;
    }
    return out;
  }

  function macData(aad, ct) {
    const pad = (n) => (16 - (n % 16)) % 16;
    const out = new Uint8Array(aad.length + pad(aad.length) + ct.length + pad(ct.length) + 16);
    out.set(aad, 0);
    out.set(ct, aad.length + pad(aad.length));
    const lens = new DataView(out.buffer, out.length - 16);
    lens.setUint32(0, aad.length, true);
    lens.setUint32(8, ct.length, true);
    return out;
  }

  /** ChaCha20-Poly1305 : chiffré suivi de l'étiquette de 16 octets. */
  function aeadSeal(key, nonce, aad, plain) {
    const polyKey = chachaBlock(key, 0, nonce).subarray(0, 32);
    const ct = chachaXor(key, 1, nonce, plain);
    const tag = poly1305(polyKey, macData(aad, ct));
    const out = new Uint8Array(ct.length + 16);
    out.set(ct, 0);
    out.set(tag, ct.length);
    return out;
  }

  /** Le clair, ou null si l'étiquette ne correspond pas (autre clé, autres données associées, trame modifiée). */
  function aeadOpen(key, nonce, aad, sealed) {
    if (sealed.length < 16) return null;
    const ct = sealed.subarray(0, sealed.length - 16);
    const polyKey = chachaBlock(key, 0, nonce).subarray(0, 32);
    const tag = poly1305(polyKey, macData(aad, ct));
    let diff = 0;
    for (let i = 0; i < 16; i++) diff |= tag[i] ^ sealed[ct.length + i];
    return diff ? null : chachaXor(key, 1, nonce, ct);
  }

  // --- base64url, trames ---------------------------------------------------

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function toB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
      out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += ALPHABET[n & 63];
    }
    return out;
  }

  function fromB64(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    const out = new Uint8Array(Math.floor((text.length * 3) / 4));
    let bits = 0;
    let value = 0;
    let at = 0;
    for (const ch of text) {
      value = (value << 6) | ALPHABET.indexOf(ch);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[at++] = (value >> bits) & 255;
      }
    }
    return out;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /** Hasard du navigateur (getRandomValues existe aussi hors HTTPS), ou celui que donne un test. */
  function randomBytes(n, random) {
    if (random) return random(n);
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  }

  /** Scelle un message pour la borne : même format que sealRemote (remote.ts). */
  function seal(key, aad, message, random) {
    const nonce = randomBytes(12, random);
    const body = aeadSeal(key, nonce, aad, encoder.encode(JSON.stringify(message)));
    const out = new Uint8Array(12 + body.length);
    out.set(nonce, 0);
    out.set(body, 12);
    return toB64(out);
  }

  /** Scelle des octets (un morceau de fichier) : nonce 12 ‖ chiffré ‖ étiquette 16, en binaire. */
  function sealBytes(key, aad, plain, random) {
    const nonce = randomBytes(12, random);
    const body = aeadSeal(key, nonce, aad, plain);
    const out = new Uint8Array(12 + body.length);
    out.set(nonce, 0);
    out.set(body, 12);
    return out;
  }

  /** Ouvre une trame de la borne ; null si elle n'est pas de cette clé, pour ces données associées. */
  function open(key, aad, frame) {
    const raw = fromB64(frame);
    if (!raw || raw.length < 28) return null;
    const plain = aeadOpen(key, raw.subarray(0, 12), aad, raw.subarray(12));
    if (!plain) return null;
    try {
      return JSON.parse(decoder.decode(plain));
    } catch {
      return null;
    }
  }

  // --- Saisie ---------------------------------------------------------------

  /**
   * Ce qui a changé dans le champ du téléphone, en effacements puis ajouts à la fin : ce qui suit
   * le début commun est effacé puis retapé. Juste tant que le curseur du champ de la borne est à la
   * fin de ce qu'on y a tapé, ce qui est le cas d'une saisie au fil des touches (corrections du
   * clavier du téléphone comprises : il remplace le dernier mot). Compté en caractères, pas en
   * unités UTF-16 : un émoji s'efface d'une touche.
   */
  function textDiff(before, after) {
    const a = Array.from(before);
    const b = Array.from(after);
    let same = 0;
    while (same < a.length && same < b.length && a[same] === b[same]) same++;
    return { del: a.length - same, ins: b.slice(same).join('') };
  }

  /** « Android · Chrome », « iPhone · Safari » : de quoi reconnaître son téléphone à la borne. */
  function deviceName(userAgent) {
    const ua = String(userAgent || '');
    const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const browser = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return [system, browser].filter(Boolean).join(' · ');
  }

  /** Empreinte d'une clé gardée (keptFingerprint, remote.ts) : l'étiquette d'un texte fixe sous cette clé. */
  function keptFingerprint(key) {
    return toB64(aeadSeal(key, new Uint8Array(12), encoder.encode('cyberpinball:garde'), new Uint8Array(0)));
  }

  /** Preuve attendue de la borne jointe par son nom, pour ce défi (keptNameProof, remote.ts). */
  function nameProof(key, nonce) {
    return toB64(aeadSeal(key, nonce, encoder.encode('cyberpinball:nom'), new Uint8Array(0)));
  }

  /**
   * Adresse par le nom local de la borne, si la page est ouverte par une adresse IP et que la borne
   * en donne un (« pinup.local ») ; sinon rien. Même port.
   */
  function nameUrl(location, name) {
    if (typeof name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/.test(name)) return null;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(location.hostname) || !location.port) return null;
    return `http://${name}:${location.port}`;
  }

  return { chachaBlock, poly1305, aeadSeal, aeadOpen, toB64, fromB64, seal, sealBytes, open, textDiff, deviceName, keptFingerprint, nameProof, nameUrl };
});
