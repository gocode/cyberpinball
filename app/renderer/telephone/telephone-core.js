// Cœur de la page du téléphone (télécommande de la borne, packages/core/src/remote.ts) : le
// chiffrement des messages, la saisie, le nom du téléphone. Servi par la borne au téléphone
// (app/src/phone-remote.ts), chargé aussi par les tests sous Node (remote.test.ts compare ce
// chiffrement à celui de node:crypto). Rien ici ne touche à la page.
//
// La page est servie en HTTP sur le réseau local, où le navigateur n'offre pas WebCrypto : d'où
// ChaCha20-Poly1305 (RFC 8439) écrit ici, Poly1305 en BigInt (messages de quelques centaines
// d'octets). Même format de trame que sealRemote / openRemote : base64url(nonce 12 ‖ chiffré ‖ étiquette 16).
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

  function chachaXor(key, counter, nonce, data) {
    const out = new Uint8Array(data.length);
    for (let at = 0, n = counter; at < data.length; at += 64, n++) {
      const block = chachaBlock(key, n, nonce);
      for (let i = 0; i < 64 && at + i < data.length; i++) out[at + i] = data[at + i] ^ block[i];
    }
    return out;
  }

  // --- Poly1305 -----------------------------------------------------------

  const P = (1n << 130n) - 5n;
  const le = (bytes) => {
    let v = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    return v;
  };

  function poly1305(key, msg) {
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

  return { chachaBlock, poly1305, aeadSeal, aeadOpen, toB64, fromB64, seal, open, textDiff, deviceName };
});
