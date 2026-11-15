// Service de l'adresse stable du téléphone (packages/core/src/remote-relay.ts) : un Worker
// Cloudflare, à https://t.cyberpinball.com. Il ne fait que deux choses :
// - garder, pour chaque borne, sa dernière déclaration (adresse locale chiffrée pour chacun de ses
//   téléphones gardés, signée par la borne) : PUT /api/b/<id> l'écrit, GET /api/b/<id> la rend ;
// - servir la page du raccourci (/b/<id>, public/index.html et page.js), qui déchiffre l'adresse sur
//   le téléphone et y renvoie.
//
// Il ne lit rien : sans la clé d'un téléphone, une déclaration est illisible. Il ne liste rien : une
// borne ne se trouve que par son identifiant, l'empreinte de sa clé publique. Il ne journalise ni
// adresse IP ni contenu. Une écriture n'est acceptée que signée par la clé dont l'empreinte est
// l'identifiant, datée à dix minutes près, et plus récente que la précédente (rejeu refusé).
//
// Liaisons (wrangler.toml) : ADRESSES (KV), ASSETS (public/), LIMITE (limite d'écritures par
// adresse IP, facultative).

export const ID = /^[A-Za-z0-9_-]{22}$/;
/** Texte signé : ce préfixe, puis la déclaration. Le même que RELAY_SIGNED_PREFIX (remote-relay.ts). */
export const SIGNED_PREFIX = 'cyberpinball:adresse:v1\n';
export const CLOCK_SKEW_MS = 10 * 60_000;
export const TTL_S = 60 * 86_400;
export const BODY_MAX = 4096;
export const ENTRIES_MAX = 8;

const encoder = new TextEncoder();

function fromB64u(text, bytes) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  const out = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return bytes === undefined || out.length === bytes ? out : undefined;
}

function toB64u(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Identifiant d'une borne : les 22 premiers caractères base64url du SHA-256 de sa clé publique. */
export async function idOf(publicKey) {
  return toB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey))).slice(0, 22);
}

/**
 * Vérifie une déclaration (même règle que relayVerify, remote-relay.ts) : forme, identifiant tiré de
 * la clé publique, signature Ed25519, date. `before` : la date de la déclaration gardée, à dépasser.
 */
export async function verify(id, payload, now, before) {
  if (!ID.test(id)) return { ok: false, why: 'id' };
  if (!payload || typeof payload.b !== 'string' || typeof payload.s !== 'string' || payload.b.length > BODY_MAX) return { ok: false, why: 'forme' };
  let body;
  try {
    body = JSON.parse(payload.b);
  } catch {
    return { ok: false, why: 'forme' };
  }
  const pk = fromB64u(body?.pk, 32);
  const sig = fromB64u(payload.s, 64);
  if (body?.v !== 1 || body.id !== id || !pk || !sig || typeof body.t !== 'number' || !Array.isArray(body.e) || body.e.length > ENTRIES_MAX) return { ok: false, why: 'forme' };
  if (!body.e.every((x) => x && /^[A-Za-z0-9_-]{22}$/.test(x.f) && typeof x.c === 'string' && /^[A-Za-z0-9_-]{40,400}$/.test(x.c))) return { ok: false, why: 'forme' };
  if ((await idOf(pk)) !== id) return { ok: false, why: 'id' };
  let good = false;
  try {
    const key = await crypto.subtle.importKey('raw', pk, { name: 'Ed25519' }, false, ['verify']);
    good = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, encoder.encode(SIGNED_PREFIX + payload.b));
  } catch {
    good = false;
  }
  if (!good) return { ok: false, why: 'signature' };
  if (Math.abs(body.t - now) > CLOCK_SKEW_MS) return { ok: false, why: 'date' };
  if (before !== undefined && body.t <= before) return { ok: false, why: 'rejeu' };
  return { ok: true, body };
}

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** En-têtes de la page du raccourci (les mêmes que public/_headers, que la page servie par le Worker ne reçoit pas). */
export const PAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-cache',
};

function reply(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: API_HEADERS });
}

async function api(request, env, id, now) {
  if (request.method === 'GET') {
    const kept = await env.ADRESSES.get(id);
    return kept ? new Response(kept, { status: 200, headers: API_HEADERS }) : reply(404, { erreur: 'inconnue' });
  }
  if (request.method !== 'PUT') return reply(405, { erreur: 'méthode' });
  // Une écriture par borne compte : les écritures d'une même adresse IP sont limitées (LIMITE).
  if (env.LIMITE) {
    const { success } = await env.LIMITE.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'inconnue' });
    if (!success) return reply(429, { erreur: 'trop' });
  }
  const text = await request.text();
  if (text.length > BODY_MAX * 2) return reply(413, { erreur: 'taille' });
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return reply(400, { erreur: 'forme' });
  }
  const kept = await env.ADRESSES.get(id);
  let before;
  try {
    before = kept ? JSON.parse(JSON.parse(kept).b).t : undefined;
  } catch {
    before = undefined;
  }
  const checked = await verify(id, payload, now, before);
  if (!checked.ok) return reply(checked.why === 'rejeu' ? 409 : checked.why === 'date' ? 422 : 403, { erreur: checked.why });
  // Plus aucun téléphone (tous oubliés, ou fonction coupée à la borne) : l'entrée est effacée.
  if (!checked.body.e.length) await env.ADRESSES.delete(id);
  else await env.ADRESSES.put(id, JSON.stringify({ b: payload.b, s: payload.s }), { expirationTtl: TTL_S });
  return reply(204);
}

export default {
  async fetch(request, env, _ctx, now = Date.now()) {
    const url = new URL(request.url);
    const call = /^\/api\/b\/([^/]+)$/.exec(url.pathname);
    if (call) return ID.test(call[1]) ? api(request, env, call[1], now) : reply(404, { erreur: 'inconnue' });
    // La page du raccourci d'une borne : la même pour toutes (page.js lit l'identifiant dans l'adresse).
    if (/^\/b\/[A-Za-z0-9_-]{22}\/?$/.test(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
      const headers = new Headers(page.headers);
      for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v);
      return new Response(page.body, { status: page.status, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
