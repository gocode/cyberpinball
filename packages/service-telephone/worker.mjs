// Service de t.cyberpinball.com : un Worker Cloudflare qui fait deux choses distinctes.
//
// 1. L'adresse stable du téléphone (packages/core/src/remote-relay.ts) :
//    - garder, pour chaque borne, sa dernière déclaration (adresse locale chiffrée pour chacun de ses
//      téléphones gardés, signée par la borne) : PUT /api/b/<id> l'écrit, GET /api/b/<id> la rend ;
//    - servir la page du raccourci (/b/<id>, public/index.html et page.js), qui déchiffre l'adresse sur
//      le téléphone et y renvoie.
//    Il ne lit rien : sans la clé d'un téléphone, une déclaration est illisible. Il ne liste rien : une
//    borne ne se trouve que par son identifiant, l'empreinte de sa clé publique. Une écriture n'est
//    acceptée que signée par la clé dont l'empreinte est l'identifiant, datée à dix minutes près, et
//    plus récente que la précédente (rejeu refusé).
//
// 2. Les retours des joueurs (base D1 « RETOURS », schema.sql), en deux circuits :
//    - public : le tableau des propositions (bugs, améliorations, nouvelles fonctions) et leurs votes.
//      GET /api/propositions les liste ; POST /api/propositions en publie une tout de suite (pas de
//      validation préalable) ; POST /api/votes donne ou retire une voix. Chaque écriture est signée par
//      la clé Ed25519 de la borne (protocole v1, RETOURS_PREFIX), datée à dix minutes près, jamais
//      rejouée. Le service garde la clé publique de l'auteur et des votants, pour compter une voix par
//      borne et limiter les propositions par jour, mais ne la rend jamais dans une réponse ;
//    - privé : les rapports chiffrés (POST /api/rapports), des boîtes scellées binaires « CPR1 » que
//      le service ne peut pas lire (seul l'administrateur a la clé) ; il ne garde que la boîte et sa
//      date, sans auteur, et seulement les plus récentes.
//    L'administrateur (requêtes /api/admin/…, signées par ADMIN_PUBLIC_KEY) masque, change le statut,
//    répond, fusionne les doublons, et relève les rapports.
//    Les réactions aux Nouveautés du front-end : GET /api/nouveautes rend les totaux de chaque
//    nouveauté (et la mienne si `pk` est donné) ; POST /api/nouveautes pose, change ou retire ma
//    réaction, signée comme un vote, une par borne et par nouveauté.
//
// Il ne journalise ni adresse IP ni contenu : l'adresse IP ne sert que de clé à la limite d'écritures.
//
// Liaisons (wrangler.toml) : ADRESSES (KV), ASSETS (public/), RETOURS (D1 ; sans elle, les routes
// des retours répondent 503), LIMITE (limite d'écritures par adresse IP, facultative).
// ADMIN_PUBLIC_KEY (variable, facultative) : clé publique d'administration en hexadécimal, qui
// remplace la constante du même nom. Elle ne se règle que par le déploiement (wrangler.toml ou
// tableau de bord Cloudflare) : les essais s'en servent pour signer avec une clé de test.

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

// ─── Retours des joueurs ────────────────────────────────────────────────────────────────────────

/** Texte signé par une borne : ce préfixe, puis le champ `b` (JSON) de la requête. */
export const RETOURS_PREFIX = 'cyberpinball:retours:v1\n';
/** Texte signé par l'administrateur : ce préfixe, puis méthode, chemin, date et SHA-256 du corps. */
export const ADMIN_PREFIX = 'cyberpinball:retours-admin:v1\n';
/** Clé publique Ed25519 de l'administrateur (hexadécimal). env.ADMIN_PUBLIC_KEY la remplace s'il est réglé. */
export const ADMIN_PUBLIC_KEY = '9039d503e01125f2db79014217d9c044b354b2be1741ff8eb69383ee5af2d1e1';
export const KINDS = ['bug', 'improvement', 'feature'];
export const STATUSES = ['new', 'review', 'planned', 'progress', 'done', 'declined'];
export const LANGS = ['fr', 'en'];
export const TITLE_MIN = 4;
export const TITLE_MAX = 90;
export const TEXT_MAX = 2000;
export const REPLY_MAX = 1000;
/** Taille d'un rapport chiffré, en octets. */
export const REPORT_MIN = 64;
export const REPORT_MAX = 1_900_000;
/** Rapports gardés : au-delà de ce nombre, ou de ce total d'octets, les plus anciens sont effacés. */
export const REPORTS_KEPT = 2000;
export const REPORTS_BYTES_MAX = 400_000_000;
export const PROPOSALS_PER_DAY = 5;
/** Taille du texte signé `b` d'une borne, en octets UTF-8. */
export const SIGNED_MAX = 8192;
/** Propositions rendues par la liste publique. */
export const LIST_MAX = 500;
const ADMIN_BODY_MAX = 65_536;
const DAY_MS = 86_400_000;
const PID = /^[A-Za-z0-9_-]{10}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const CONTROL = /\p{Cc}/u;
const CONTROL_BUT_NEWLINE = /[^\P{Cc}\n]/u;

/** Base64 standard, par morceaux : un coffre de 900 ko ferait déborder la pile en un seul appel. */
function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(text, bytes) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1) return undefined;
  let bin;
  try {
    bin = atob(text);
  } catch {
    return undefined;
  }
  const out = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return bytes === undefined || out.length === bytes ? out : undefined;
}

function fromHex(hex) {
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
}

async function sha256hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ed25519(publicKey, signature, text) {
  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, encoder.encode(text));
  } catch {
    return false;
  }
}

/** Identifiant d'une proposition ou d'un rapport : 10 caractères base64url aléatoires. */
function newId() {
  return toB64u(crypto.getRandomValues(new Uint8Array(8))).slice(0, 10);
}

/** Titre : espaces (retours à la ligne compris) réduits à un seul, bords ôtés ; aucun autre caractère de contrôle. */
export function cleanTitle(value) {
  if (typeof value !== 'string') return undefined;
  const s = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return CONTROL.test(s) || s.length < TITLE_MIN || s.length > TITLE_MAX ? undefined : s;
}

/** Texte libre : retours à la ligne permis (\r\n ramené à \n), bords ôtés ; tout autre caractère de contrôle refusé. */
export function cleanText(value, max = TEXT_MAX) {
  if (typeof value !== 'string') return undefined;
  const s = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  return CONTROL_BUT_NEWLINE.test(s) || s.length > max ? undefined : s;
}

/** Lit le corps texte d'une requête, borné (undefined : trop long). */
async function boundedText(request, max) {
  if (Number(request.headers.get('Content-Length') ?? 0) > max) return undefined;
  const text = await request.text();
  return text.length > max ? undefined : text;
}

/**
 * Vérifie une requête signée d'une borne : { b, s }, `b` le JSON { v: 1, op, pk, t, … }, `s` la
 * signature Ed25519 (base64) de RETOURS_PREFIX + b par `pk`. Rend { body } ou { status, why }.
 */
export async function verifySigned(payload, op, now, max = SIGNED_MAX) {
  if (!payload || typeof payload.b !== 'string' || typeof payload.s !== 'string') return { status: 400, why: 'forme' };
  if (encoder.encode(payload.b).length > max) return { status: 413, why: 'taille' };
  let body;
  try {
    body = JSON.parse(payload.b);
  } catch {
    return { status: 400, why: 'forme' };
  }
  const sig = fromB64(payload.s, 64);
  if (!body || typeof body !== 'object' || body.v !== 1 || body.op !== op || typeof body.pk !== 'string' || !HEX64.test(body.pk) || !Number.isSafeInteger(body.t) || !sig) return { status: 400, why: 'forme' };
  if (!(await ed25519(fromHex(body.pk), sig, RETOURS_PREFIX + payload.b))) return { status: 403, why: 'signature' };
  if (Math.abs(body.t - now) > CLOCK_SKEW_MS) return { status: 422, why: 'date' };
  return { body };
}

async function signedRequest(request, op, now, max = SIGNED_MAX) {
  // `b` est une chaîne JSON dans le JSON : ses guillemets échappés peuvent presque doubler sa taille.
  const text = await boundedText(request, max * 2 + SIGNED_MAX);
  if (text === undefined) return { status: 413, why: 'taille' };
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { status: 400, why: 'forme' };
  }
  return verifySigned(payload, op, now, max);
}

// Rejeu : chaque (clé, date) acceptée est notée le temps où sa date reste admise (deux fois l'écart
// d'horloge), pour toutes les écritures signées, votes retirés compris.
const seen = async (db, pk, t) => (await db.prepare('SELECT 1 AS x FROM signatures WHERE pk = ?1 AND t = ?2').bind(pk, t).first()) !== null;
const markSeen = (db, pk, t, now) => [db.prepare('DELETE FROM signatures WHERE t < ?1').bind(now - 2 * CLOCK_SKEW_MS), db.prepare('INSERT INTO signatures (pk, t) VALUES (?1, ?2)').bind(pk, t)];

/** Écrit un lot ; s'il échoue parce que la même signature vient d'être notée, c'est un rejeu. */
async function writeOnce(db, pk, t, statements) {
  try {
    await db.batch(statements);
    return undefined;
  } catch (e) {
    if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
    throw e;
  }
}

async function limited(request, env) {
  if (!env.LIMITE) return false;
  const { success } = await env.LIMITE.limit({ key: `retours:${request.headers.get('CF-Connecting-IP') ?? 'inconnue'}` });
  return !success;
}

const SELECT_PROPOSITIONS = `SELECT p.id, p.kind, p.title, p.text, p.lang, p.status, p.at, p.updated, p.reply, p.hidden, p.merged_into,
  (SELECT COUNT(*) FROM votes v WHERE v.proposition = p.id) AS n_votes,
  (SELECT COUNT(*) FROM propositions m WHERE m.merged_into = p.id) AS n_merged,
  p.author = ?1 AS is_mine,
  EXISTS (SELECT 1 FROM votes w WHERE w.proposition = p.id AND w.voter = ?1) AS has_voted
FROM propositions p`;

/** Une proposition telle que rendue : jamais la clé de l'auteur ni celles des votants. */
function present(row, { admin = false, pk } = {}) {
  const out = { id: row.id, kind: row.kind, title: row.title, text: row.text, lang: row.lang, votes: row.n_votes, status: row.status, at: row.at, updated: row.updated };
  if (row.reply !== null && row.reply !== undefined) out.reply = row.reply;
  out.merged = row.n_merged;
  if (pk) {
    out.mine = !!row.is_mine;
    out.voted = !!row.has_voted;
  }
  if (admin) {
    out.hidden = !!row.hidden;
    out.merged_into = row.merged_into ?? null;
  }
  return out;
}

async function listPropositions(env, url) {
  const asked = url.searchParams.get('pk');
  const pk = asked && HEX64.test(asked) ? asked : undefined;
  const { results } = await env.RETOURS.prepare(`${SELECT_PROPOSITIONS} WHERE p.hidden = 0 AND p.merged_into IS NULL ORDER BY n_votes DESC, p.at DESC LIMIT ?2`).bind(pk ?? '', LIST_MAX).all();
  return reply(200, { propositions: results.map((r) => present(r, { pk })) });
}

async function propose(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'propose', now);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t } = checked.body;
  const kind = KINDS.includes(checked.body.kind) ? checked.body.kind : undefined;
  const lang = LANGS.includes(checked.body.lang) ? checked.body.lang : undefined;
  const title = cleanTitle(checked.body.title);
  const text = checked.body.text === undefined ? '' : cleanText(checked.body.text);
  if (!kind || !lang || title === undefined || text === undefined) return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  const count = await db.prepare('SELECT COUNT(*) AS n FROM propositions WHERE author = ?1 AND at > ?2').bind(pk, now - DAY_MS).first('n');
  if (count >= PROPOSALS_PER_DAY) return reply(429, { erreur: 'quota' });
  const id = newId();
  // L'auteur vote pour sa proposition, dans la même transaction.
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    db.prepare('INSERT INTO propositions (id, kind, title, text, lang, author, t, at, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)').bind(id, kind, title, text, lang, pk, t, now),
    db.prepare('INSERT INTO votes (proposition, voter, at) VALUES (?1, ?2, ?3)').bind(id, pk, t),
  ]);
  return refused ?? reply(201, { id });
}

/** La proposition visible qui reçoit les voix de `id` : elle-même, ou celle où elle a été fusionnée. */
async function resolveVisible(db, id) {
  for (let hops = 0; hops < 8; hops++) {
    const row = await db.prepare('SELECT id, hidden, merged_into FROM propositions WHERE id = ?1').bind(id).first();
    if (!row || row.hidden) return undefined;
    if (!row.merged_into) return row.id;
    id = row.merged_into;
  }
  return undefined;
}

async function vote(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'vote', now);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t, id, on } = checked.body;
  if (typeof id !== 'string' || !PID.test(id) || typeof on !== 'boolean') return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  const target = await resolveVisible(db, id);
  if (!target) return reply(404, { erreur: 'inconnue' });
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  const last = await db.prepare('SELECT at FROM votes WHERE proposition = ?1 AND voter = ?2').bind(target, pk).first('at');
  if (last !== null && last !== undefined && t <= last) return reply(409, { erreur: 'rejeu' });
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    on
      ? db.prepare('INSERT INTO votes (proposition, voter, at) VALUES (?1, ?2, ?3) ON CONFLICT (proposition, voter) DO UPDATE SET at = excluded.at').bind(target, pk, t)
      : db.prepare('DELETE FROM votes WHERE proposition = ?1 AND voter = ?2').bind(target, pk),
  ]);
  if (refused) return refused;
  const votes = await db.prepare('SELECT COUNT(*) AS n FROM votes WHERE proposition = ?1').bind(target).first('n');
  return reply(200, { id: target, votes, voted: on });
}

/**
 * Compte supprimé par son joueur (RGPD, droit à l'effacement) : ses propositions (et les votes qu'elles
 * avaient) et ses votes partent. Une proposition d'un autre fusionnée dans l'une des siennes redevient
 * visible seule. Signée par la clé effacée, comme un vote.
 */
async function forget(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'forget', now);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t } = checked.body;
  const db = env.RETOURS;
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  const propositions = await db.prepare('SELECT COUNT(*) AS n FROM propositions WHERE author = ?1').bind(pk).first('n');
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    db.prepare('UPDATE propositions SET merged_into = NULL WHERE merged_into IN (SELECT id FROM propositions WHERE author = ?1)').bind(pk),
    db.prepare('DELETE FROM votes WHERE proposition IN (SELECT id FROM propositions WHERE author = ?1)').bind(pk),
    db.prepare('DELETE FROM propositions WHERE author = ?1').bind(pk),
    db.prepare('DELETE FROM votes WHERE voter = ?1').bind(pk),
    db.prepare('DELETE FROM reactions_nouveautes WHERE voter = ?1').bind(pk),
    // Le coffre du compte et son mot de passe (routes /api/coffre…) partent avec lui.
    db.prepare('DELETE FROM coffres WHERE pk = ?1').bind(pk),
    db.prepare('DELETE FROM coffres_mdp WHERE pk = ?1').bind(pk),
  ]);
  if (refused) return refused;
  return reply(200, { propositions: propositions ?? 0 });
}

// ─── Réactions aux Nouveautés ───────────────────────────────────────────────────────────────────

/** Les sept réactions, dans l'ordre (le même que REACTIONS, packages/core/src/reactions.ts). */
export const NEWS_REACTIONS = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];
/** Identifiant d'une nouveauté (news.ts) : minuscules, chiffres, tirets. */
export const NEWS_ITEM = /^[a-z0-9-]{2,40}$/;
/** Nouveautés rendues au plus (les plus récentes ont les identifiants que la borne connaît). */
export const NEWS_ITEMS_MAX = 100;

/** Les totaux de chaque nouveauté, et ma réaction si `pk` est donné : jamais une clé. */
async function listNewsReactions(env, url) {
  const asked = url.searchParams.get('pk');
  const pk = asked && HEX64.test(asked) ? asked : '';
  const { results } = await env.RETOURS.prepare('SELECT item, kind, COUNT(*) AS n, SUM(voter = ?1) AS mine FROM reactions_nouveautes GROUP BY item, kind ORDER BY item LIMIT ?2').bind(pk, NEWS_ITEMS_MAX * NEWS_REACTIONS.length).all();
  const reactions = {};
  for (const r of results) {
    const one = (reactions[r.item] ??= { counts: {} });
    one.counts[r.kind] = r.n;
    if (pk && r.mine) one.mine = r.kind;
  }
  return reply(200, { reactions });
}

async function totalsOf(db, item) {
  const { results } = await db.prepare('SELECT kind, COUNT(*) AS n FROM reactions_nouveautes WHERE item = ?1 GROUP BY kind').bind(item).all();
  return Object.fromEntries(results.map((r) => [r.kind, r.n]));
}

/** Pose, change ou retire (kind: null) ma réaction à une nouveauté : signée, une par borne, jamais rejouée. */
async function reactNews(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'news-react', now);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t, item, kind } = checked.body;
  if (typeof item !== 'string' || !NEWS_ITEM.test(item) || (kind !== null && !NEWS_REACTIONS.includes(kind))) return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  const last = await db.prepare('SELECT at FROM reactions_nouveautes WHERE item = ?1 AND voter = ?2').bind(item, pk).first('at');
  if (last !== null && last !== undefined && t <= last) return reply(409, { erreur: 'rejeu' });
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    kind
      ? db.prepare('INSERT INTO reactions_nouveautes (item, voter, kind, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (item, voter) DO UPDATE SET kind = excluded.kind, at = excluded.at').bind(item, pk, kind, t)
      : db.prepare('DELETE FROM reactions_nouveautes WHERE item = ?1 AND voter = ?2').bind(item, pk),
  ]);
  if (refused) return refused;
  return reply(200, { item, counts: await totalsOf(db, item), ...(kind ? { mine: kind } : {}) });
}

async function report(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  if (Number(request.headers.get('Content-Length') ?? 0) > REPORT_MAX) return reply(413, { erreur: 'taille' });
  const data = await request.arrayBuffer();
  if (data.byteLength > REPORT_MAX) return reply(413, { erreur: 'taille' });
  const head = new Uint8Array(data, 0, Math.min(4, data.byteLength));
  if (data.byteLength < REPORT_MIN || String.fromCharCode(...head) !== 'CPR1') return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  const id = newId();
  // Les plus anciens partent au-delà de REPORTS_KEPT rapports ou de REPORTS_BYTES_MAX octets en tout.
  await db.batch([
    db.prepare('INSERT INTO rapports (id, at, size, data) VALUES (?1, ?2, ?3, ?4)').bind(id, now, data.byteLength, data),
    db
      .prepare('DELETE FROM rapports WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER w AS n, SUM(size) OVER w AS total FROM rapports WINDOW w AS (ORDER BY at DESC, rowid DESC)) WHERE n > ?1 OR total > ?2)')
      .bind(REPORTS_KEPT, REPORTS_BYTES_MAX),
  ]);
  return reply(201, { id });
}

/** Vérifie la signature d'administration (en-têtes X-Retours-Date et X-Retours-Signature) ; rend la raison d'un refus. */
export async function verifyAdmin(request, env, raw, now) {
  const date = request.headers.get('X-Retours-Date') ?? '';
  const sig = fromB64(request.headers.get('X-Retours-Signature') ?? '', 64);
  const keyHex = typeof env.ADMIN_PUBLIC_KEY === 'string' && env.ADMIN_PUBLIC_KEY ? env.ADMIN_PUBLIC_KEY.toLowerCase() : ADMIN_PUBLIC_KEY;
  if (!/^\d{1,16}$/.test(date) || !sig || !HEX64.test(keyHex)) return 'signature';
  const url = new URL(request.url);
  const head = `${ADMIN_PREFIX}${request.method}\n${url.pathname}${url.search}\n${date}\n`;
  const key = fromHex(keyHex);
  // Corps : son SHA-256 ; sans corps, celui de la chaîne vide (une chaîne vide à sa place est aussi admise).
  const good = (await ed25519(key, sig, head + (await sha256hex(raw)))) || (raw.byteLength === 0 && (await ed25519(key, sig, head)));
  if (!good) return 'signature';
  if (Math.abs(Number(date) - now) > CLOCK_SKEW_MS) return 'date';
  return undefined;
}

async function adminEdit(env, id, raw, date, now) {
  const db = env.RETOURS;
  const row = await db.prepare('SELECT id, merged_into FROM propositions WHERE id = ?1').bind(id).first();
  if (!row) return reply(404, { erreur: 'inconnue' });
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return reply(400, { erreur: 'forme' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { erreur: 'forme' });
  // Colonnes à changer : ?1 est l'identifiant, les valeurs suivent.
  const sets = [];
  const values = [];
  const set = (column, value) => {
    values.push(value);
    sets.push(`${column} = ?${values.length + 1}`);
  };
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return reply(400, { erreur: 'forme' });
    set('status', body.status);
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') return reply(400, { erreur: 'forme' });
    set('hidden', body.hidden ? 1 : 0);
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return reply(400, { erreur: 'forme' });
    set('kind', body.kind);
  }
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (title === undefined) return reply(400, { erreur: 'forme' });
    set('title', title);
  }
  if (body.text !== undefined) {
    const text = cleanText(body.text);
    if (text === undefined) return reply(400, { erreur: 'forme' });
    set('text', text);
  }
  if (body.reply !== undefined) {
    const answer = cleanText(body.reply, REPLY_MAX);
    if (answer === undefined) return reply(400, { erreur: 'forme' });
    set('reply', answer === '' ? null : answer);
  }
  const statements = [];
  if (body.mergeInto !== undefined) {
    const target = typeof body.mergeInto === 'string' && PID.test(body.mergeInto) ? await db.prepare('SELECT id, merged_into FROM propositions WHERE id = ?1').bind(body.mergeInto).first() : null;
    // Ni dans elle-même, ni dans une proposition déjà fusionnée, ni depuis une source déjà fusionnée.
    if (!target || target.id === id || target.merged_into || row.merged_into) return reply(400, { erreur: 'fusion' });
    statements.push(
      // Les voix passent à la cible, sans double voix ; les propositions déjà fusionnées dans la source la suivent.
      db.prepare('INSERT OR IGNORE INTO votes (proposition, voter, at) SELECT ?1, voter, at FROM votes WHERE proposition = ?2').bind(target.id, id),
      db.prepare('DELETE FROM votes WHERE proposition = ?1').bind(id),
      db.prepare('UPDATE propositions SET merged_into = ?1, updated = ?2 WHERE merged_into = ?3').bind(target.id, now, id),
      db.prepare('UPDATE propositions SET merged_into = ?1 WHERE id = ?2').bind(target.id, id),
      db.prepare('UPDATE propositions SET updated = ?1 WHERE id = ?2').bind(now, target.id),
    );
  }
  set('updated', now);
  statements.push(db.prepare(`UPDATE propositions SET ${sets.join(', ')} WHERE id = ?1`).bind(id, ...values));
  const refused = await writeOnce(db, 'admin', date, [...markSeen(db, 'admin', date, now), ...statements]);
  if (refused) return refused;
  const after = await db.prepare(`${SELECT_PROPOSITIONS} WHERE p.id = ?2`).bind('', id).first();
  return reply(200, present(after, { admin: true }));
}

async function admin(request, env, url, now) {
  if (Number(request.headers.get('Content-Length') ?? 0) > ADMIN_BODY_MAX) return reply(413, { erreur: 'taille' });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > ADMIN_BODY_MAX) return reply(413, { erreur: 'taille' });
  const refused = await verifyAdmin(request, env, raw, now);
  if (refused) return reply(403, { erreur: refused });
  const date = Number(request.headers.get('X-Retours-Date'));
  const db = env.RETOURS;
  // Une écriture d'administration ne se rejoue pas plus que celle d'une borne.
  if (request.method !== 'GET' && (await seen(db, 'admin', date))) return reply(409, { erreur: 'rejeu' });
  const route = url.pathname.slice('/api/admin/'.length);
  if (route === 'propositions') {
    if (request.method !== 'GET') return reply(405, { erreur: 'méthode' });
    const { results } = await db.prepare(`${SELECT_PROPOSITIONS} ORDER BY n_votes DESC, p.at DESC`).bind('').all();
    return reply(200, { propositions: results.map((r) => present(r, { admin: true })) });
  }
  const edit = /^propositions\/([A-Za-z0-9_-]{10})$/.exec(route);
  if (edit) return request.method === 'POST' ? adminEdit(env, edit[1], raw, date, now) : reply(405, { erreur: 'méthode' });
  if (route === 'rapports') {
    if (request.method !== 'GET') return reply(405, { erreur: 'méthode' });
    const { results } = await db.prepare('SELECT id, at, size FROM rapports ORDER BY at DESC, rowid DESC').all();
    return reply(200, { rapports: results.map((r) => ({ id: r.id, at: r.at, size: r.size })) });
  }
  const one = /^rapports\/([A-Za-z0-9_-]{10})$/.exec(route);
  if (one && request.method === 'GET') {
    // D1 rend un BLOB en tableau d'octets.
    const data = await db.prepare('SELECT data FROM rapports WHERE id = ?1').bind(one[1]).first('data');
    if (data === null || data === undefined) return reply(404, { erreur: 'inconnu' });
    return new Response(new Uint8Array(data), { status: 200, headers: { ...API_HEADERS, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${one[1]}.cpr"` } });
  }
  if (one && request.method === 'DELETE') {
    const again = await writeOnce(db, 'admin', date, [...markSeen(db, 'admin', date, now), db.prepare('DELETE FROM rapports WHERE id = ?1').bind(one[1])]);
    return again ?? reply(204);
  }
  return one ? reply(405, { erreur: 'méthode' }) : reply(404, { erreur: 'inconnue' });
}

// ─── Coffre du compte (packages/core/src/vault.ts) ──────────────────────────────────────────────
//
// Une copie chiffrée du compte d'un joueur, que le service ne peut pas ouvrir, rangée sous sa clé
// publique. POST /api/coffre l'écrit (signée par la clé, op « coffre ») ; GET /api/coffre/<pk> la
// rend à qui connaît la clé publique (elle ne s'ouvre qu'avec la graine du joueur, c'est-à-dire son
// code de récupération). Un mot de passe facultatif (POST /api/coffre/mdp, op « coffre-mdp ») réserve
// un identifiant (le pseudo, sans casse) et garde : le sel de scrypt, l'empreinte SHA-256 de la
// preuve du mot de passe, l'enveloppe de la clé des données. POST /api/coffre/sel rend le sel d'un
// identifiant ; POST /api/coffre/ouvrir rend l'enveloppe et le coffre à qui donne la bonne preuve,
// au plus VAULT_TRIES essais manqués par identifiant et par heure.

/** Taille d'un coffre chiffré, en octets. */
export const VAULT_MAX = 900_000;
export const VAULT_TRIES = 10;
const HOUR_MS = 3_600_000;
const LOGIN_MAX = 40;

/** Identifiant d'un mot de passe : déjà normalisé par la borne (NFC, minuscules, espaces simples). */
export function cleanLogin(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > LOGIN_MAX || CONTROL.test(value)) return undefined;
  const s = value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return s === value ? s : undefined;
}

async function bodyJson(request, max) {
  const text = await boundedText(request, max);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function vaultPut(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'coffre', now, Math.ceil((VAULT_MAX * 4) / 3) + 1024);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t, data, hash } = checked.body;
  const bytes = fromB64(data);
  if (!bytes || bytes.length < 32 || bytes.length > VAULT_MAX || typeof hash !== 'string' || !HEX64.test(hash)) return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  // Un envoi plus ancien que le coffre gardé ne le remplace pas.
  const kept = await db.prepare('SELECT t FROM coffres WHERE pk = ?1').bind(pk).first('t');
  if (kept !== null && kept !== undefined && kept >= t) return reply(409, { erreur: 'ancien' });
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    db.prepare('INSERT INTO coffres (pk, data, hash, t, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (pk) DO UPDATE SET data = ?2, hash = ?3, t = ?4, at = ?5').bind(pk, bytes, hash, t, now),
  ]);
  return refused ?? reply(204);
}

async function vaultGet(env, pk) {
  const row = await env.RETOURS.prepare('SELECT data, at FROM coffres WHERE pk = ?1').bind(pk).first();
  if (!row) return reply(404, { erreur: 'inconnu' });
  return reply(200, { data: toB64(new Uint8Array(row.data)), at: row.at });
}

async function vaultPassword(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const checked = await signedRequest(request, 'coffre-mdp', now);
  if (!checked.body) return reply(checked.status, { erreur: checked.why });
  const { pk, t } = checked.body;
  const db = env.RETOURS;
  if (await seen(db, pk, t)) return reply(409, { erreur: 'rejeu' });
  if (checked.body.remove === true) {
    const refused = await writeOnce(db, pk, t, [...markSeen(db, pk, t, now), db.prepare('DELETE FROM coffres_mdp WHERE pk = ?1').bind(pk)]);
    return refused ?? reply(204);
  }
  const login = cleanLogin(checked.body.login);
  const salt = fromB64(checked.body.salt, 16);
  const wrap = fromB64(checked.body.wrap, 60);
  const auth = checked.body.auth;
  if (!login || !salt || !wrap || typeof auth !== 'string' || !HEX64.test(auth)) return reply(400, { erreur: 'forme' });
  if ((await db.prepare('SELECT 1 AS x FROM coffres WHERE pk = ?1').bind(pk).first()) === null) return reply(409, { erreur: 'sans-coffre' });
  const owner = await db.prepare('SELECT pk FROM coffres_mdp WHERE login = ?1').bind(login).first('pk');
  if (owner && owner !== pk) return reply(409, { erreur: 'pris' });
  const refused = await writeOnce(db, pk, t, [
    ...markSeen(db, pk, t, now),
    db.prepare('DELETE FROM coffres_mdp WHERE pk = ?1').bind(pk),
    db.prepare('INSERT INTO coffres_mdp (login, pk, salt, auth, wrap, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(login, pk, salt, auth, wrap, now),
    db.prepare('DELETE FROM coffres_essais WHERE login = ?1').bind(login),
  ]);
  return refused ?? reply(204);
}

async function vaultSalt(request, env) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const body = await bodyJson(request, 512);
  const login = cleanLogin(body?.login);
  if (!login) return reply(400, { erreur: 'forme' });
  const salt = await env.RETOURS.prepare('SELECT salt FROM coffres_mdp WHERE login = ?1').bind(login).first('salt');
  return salt ? reply(200, { salt: toB64(new Uint8Array(salt)) }) : reply(404, { erreur: 'inconnu' });
}

async function vaultOpen(request, env, now) {
  if (await limited(request, env)) return reply(429, { erreur: 'trop' });
  const body = await bodyJson(request, 512);
  const login = cleanLogin(body?.login);
  const proof = fromB64(body?.auth, 32);
  if (!login || !proof) return reply(400, { erreur: 'forme' });
  const db = env.RETOURS;
  await db.prepare('DELETE FROM coffres_essais WHERE at < ?1').bind(now - HOUR_MS).run();
  const tries = await db.prepare('SELECT COUNT(*) AS n FROM coffres_essais WHERE login = ?1').bind(login).first('n');
  if ((tries ?? 0) >= VAULT_TRIES) return reply(429, { erreur: 'essais' });
  const row = await db.prepare('SELECT m.pk, m.auth, m.wrap, c.data, c.at FROM coffres_mdp m JOIN coffres c ON c.pk = m.pk WHERE m.login = ?1').bind(login).first();
  if (!row || (await sha256hex(proof)) !== row.auth) {
    await db.prepare('INSERT INTO coffres_essais (login, at) VALUES (?1, ?2)').bind(login, now).run();
    return reply(403, { erreur: 'refuse' });
  }
  await db.prepare('DELETE FROM coffres_essais WHERE login = ?1').bind(login).run();
  return reply(200, { pk: row.pk, wrap: toB64(new Uint8Array(row.wrap)), data: toB64(new Uint8Array(row.data)), at: row.at });
}

/** Les routes du coffre (/api/coffre…) ; undefined pour les autres. */
async function coffre(request, env, url, now) {
  const path = url.pathname;
  if (path !== '/api/coffre' && !path.startsWith('/api/coffre/')) return undefined;
  if (!env.RETOURS) return reply(503, { erreur: 'indisponible' });
  try {
    const get = /^\/api\/coffre\/([0-9a-f]{64})$/.exec(path);
    if (get) {
      if (request.method !== 'GET') return reply(405, { erreur: 'méthode' });
      if (await limited(request, env)) return reply(429, { erreur: 'trop' });
      return await vaultGet(env, get[1]);
    }
    if (request.method !== 'POST') return reply(405, { erreur: 'méthode' });
    if (path === '/api/coffre') return await vaultPut(request, env, now);
    if (path === '/api/coffre/mdp') return await vaultPassword(request, env, now);
    if (path === '/api/coffre/sel') return await vaultSalt(request, env);
    if (path === '/api/coffre/ouvrir') return await vaultOpen(request, env, now);
    return reply(404, { erreur: 'inconnue' });
  } catch {
    // Rien n'est journalisé : ni la requête, ni l'erreur.
    return reply(500, { erreur: 'service' });
  }
}

/** Les routes des retours (/api/propositions, /api/votes, /api/rapports, /api/admin/…) ; undefined pour les autres. */
async function retours(request, env, url, now) {
  const path = url.pathname;
  const known = path === '/api/propositions' || path === '/api/votes' || path === '/api/oubli' || path === '/api/rapports' || path === '/api/nouveautes' || path.startsWith('/api/admin/');
  if (!known) return undefined;
  if (!env.RETOURS) return reply(503, { erreur: 'indisponible' });
  try {
    if (path.startsWith('/api/admin/')) return await admin(request, env, url, now);
    if (path === '/api/nouveautes') {
      if (request.method === 'GET') return await listNewsReactions(env, url);
      return request.method === 'POST' ? await reactNews(request, env, now) : reply(405, { erreur: 'méthode' });
    }
    if (path === '/api/propositions') {
      if (request.method === 'GET') return await listPropositions(env, url);
      return request.method === 'POST' ? await propose(request, env, now) : reply(405, { erreur: 'méthode' });
    }
    if (request.method !== 'POST') return reply(405, { erreur: 'méthode' });
    if (path === '/api/oubli') return await forget(request, env, now);
    return path === '/api/votes' ? await vote(request, env, now) : await report(request, env, now);
  } catch {
    // Rien n'est journalisé : ni la requête, ni l'erreur (qui pourrait citer un contenu).
    return reply(500, { erreur: 'service' });
  }
}

export default {
  async fetch(request, env, _ctx, now = Date.now()) {
    const url = new URL(request.url);
    const call = /^\/api\/b\/([^/]+)$/.exec(url.pathname);
    if (call) return ID.test(call[1]) ? api(request, env, call[1], now) : reply(404, { erreur: 'inconnue' });
    const answered = (await coffre(request, env, url, now)) ?? (await retours(request, env, url, now));
    if (answered) return answered;
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
