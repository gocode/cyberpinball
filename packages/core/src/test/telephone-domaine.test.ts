// Adresse stable du téléphone gardé, par Internet (remote-relay.ts, app/src/phone-relay.ts,
// packages/service-telephone). Le routeur change l'adresse IP de la borne au redémarrage : le
// raccourci du téléphone mène à une adresse morte, et Android ne résout pas « cyberpinball.local ».
// Le raccourci passe donc par https://t.cyberpinball.com/b/<id>, qui renvoie à l'adresse du moment.
//
// Invariants fixés ici :
// - la clé du téléphone ne quitte jamais le téléphone : ni dans la déclaration de la borne, ni dans
//   la seule requête de la page du service (GET /api/b/<id>) ; elle ne voyage que dans le fragment
//   de l'adresse locale ;
// - le service n'accepte qu'une déclaration signée par la clé dont l'empreinte est l'identifiant,
//   datée et plus récente que la précédente ; il ne garde que des données qu'il ne lit pas ;
// - un téléphone oublié ne retrouve plus l'adresse ; une adresse qui n'est pas privée n'est jamais
//   suivie ;
// - le service injoignable : la dernière adresse connue ; aucune : « Borne introuvable » ;
// - la borne ne déclare que ce qui change, réessaie en s'espaçant, efface quand on coupe la fonction.
// Rien ne sort sur le vrai réseau : le service tourne en mémoire, la borne lui parle par un faux fetch.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { aeadSeal } from '../chacha';
import { createKeptPhones, keptFingerprint, relayAddressOk, relayId, relayKeys, relayOpen, relayRecord, relaySeed, relayVerify, toBase64Url, type RelayPayload } from '../index';
import { REPO_ROOT } from './i18n-scan';

const SERVICE = path.join(REPO_ROOT, 'packages', 'service-telephone');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-core.js')) as {
  keptFingerprint(key: Uint8Array): string;
  aeadOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Uint8Array | null;
  fromB64(text: string): Uint8Array | null;
  toB64(bytes: Uint8Array): string;
};
interface Located {
  kind: 'go' | 'forgotten' | 'lost';
  url?: string;
  from?: 'service' | 'memoire';
}
interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const page = require(path.join(SERVICE, 'public', 'page.js')) as {
  parse(location: { pathname: string; hash: string }, c: typeof core): { id: string; key: Uint8Array | null; install: boolean };
  openEntry(c: typeof core, key: Uint8Array, id: string, payload: RelayPayload): { host: string; port: number; t: number } | 'absent' | null;
  localAddress(host: unknown, port: unknown): boolean;
  locate(env: { core: typeof core; id: string; key: Uint8Array; storage: Storage; fetch: (url: string, init?: RequestInit) => Promise<Response>; timeoutMs?: number }): Promise<Located>;
};
interface Worker {
  fetch(request: Request, env: unknown, ctx: unknown, now?: number): Promise<Response>;
}
const loadWorker = async () => (await import(pathToFileURL(path.join(SERVICE, 'worker.mjs')).href)) as { default: Worker; verify(id: string, payload: unknown, now: number, before?: number): Promise<{ ok: boolean; why?: string }> };

interface PhoneRelay {
  update(address: { host: string; port: number } | undefined): void;
  url(): string | undefined;
  state(): { on: boolean; published?: number; error?: string; host: string };
  busy(): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPhoneRelay, RELAY_RETRY_MS } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-relay.js')) as { createPhoneRelay(opts: Record<string, unknown>): PhoneRelay; RELAY_RETRY_MS: number[] };

const NOW = Date.UTC(2026, 10, 13, 12);

/** Le service en mémoire : son KV, ses fichiers (la page), et chaque requête reçue. */
function memoryService(worker: Worker, clock: () => number = () => NOW) {
  const kv = new Map<string, string>();
  const ttl = new Map<string, number>();
  const seen: { method: string; url: string; body: string }[] = [];
  const env = {
    ADRESSES: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string, o?: { expirationTtl?: number }) => {
        kv.set(k, v);
        if (o?.expirationTtl) ttl.set(k, o.expirationTtl);
      },
      delete: async (k: string) => void kv.delete(k),
    },
    ASSETS: { fetch: async () => new Response('<!doctype html><title>page</title>', { status: 200, headers: { 'Content-Type': 'text/html' } }) },
  };
  const call = async (url: string, init: RequestInit = {}) => {
    const full = new URL(url, 'https://t.cyberpinball.com');
    const body = typeof init.body === 'string' ? init.body : '';
    seen.push({ method: init.method ?? 'GET', url: full.href, body });
    return worker.fetch(new Request(full, { method: init.method ?? 'GET', ...(body ? { body } : {}), headers: init.headers ?? {} }), env, {}, clock());
  };
  return { kv, ttl, seen, env, fetch: call };
}

function memoryStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const phoneA = crypto.randomBytes(32);
const phoneB = crypto.randomBytes(32);
const seed = relaySeed();
const ID = relayId(relayKeys(seed).publicKey);

test('adresse stable : la déclaration de la borne ne contient ni la clé d’un téléphone ni son adresse en clair', () => {
  const { id, payload } = relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA, phoneB], now: NOW });
  assert.equal(id, ID);
  const text = JSON.stringify(payload);
  for (const k of [phoneA, phoneB]) {
    assert.ok(!text.includes(toBase64Url(k)), 'clé en base64url');
    assert.ok(!text.includes(k.toString('hex')), 'clé en hexadécimal');
    assert.ok(!text.includes(k.toString('base64')), 'clé en base64');
  }
  assert.ok(!text.includes('192.168'), 'adresse en clair');
  assert.ok(!text.includes('47820'), 'port en clair');
  // Chaque téléphone lit son entrée avec sa clé, et rien d'autre.
  const body = JSON.parse(payload.b) as Parameters<typeof relayOpen>[1];
  assert.deepEqual(relayOpen(phoneA, body), { host: '192.168.68.52', port: 47820, t: NOW });
  assert.deepEqual(relayOpen(phoneB, body), { host: '192.168.68.52', port: 47820, t: NOW });
  assert.equal(relayOpen(crypto.randomBytes(32), body), undefined);
  // Liée à cette borne : la même entrée sous un autre identifiant ne s'ouvre pas.
  assert.equal(relayOpen(phoneA, { ...body, id: 'A'.repeat(22) }), undefined);
});

test('adresse stable : seule une IPv4 privée et un port se déclarent ou se suivent', () => {
  for (const [h, p, ok] of [
    ['192.168.68.52', 47820, true],
    ['10.0.0.4', 47820, true],
    ['172.16.0.9', 1, true],
    ['172.32.0.9', 47820, false],
    ['127.0.0.1', 47820, false],
    ['8.8.8.8', 47820, false],
    ['169.254.3.4', 47820, false],
    ['cyberpinball.local', 47820, false],
    ['192.168.1.300', 47820, false],
    ['192.168.1.3', 0, false],
    ['192.168.1.3', 70000, false],
  ] as const) {
    assert.equal(relayAddressOk(h, p), ok, `${h}:${p}`);
    assert.equal(page.localAddress(h, p), ok, `page : ${h}:${p}`);
  }
});

test('adresse stable : le service n’accepte qu’une déclaration signée par la borne, datée, plus récente', async () => {
  const w = await loadWorker();
  const first = relayRecord({ seed, host: '192.168.68.54', port: 47820, phones: [phoneA], now: NOW - 60_000 });
  const second = relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA], now: NOW });
  // Même règle des deux côtés : le cœur (essais) et le service (WebCrypto).
  type Verdict = { ok: boolean; why?: string };
  const verifiers: ((i: string, p: unknown, n: number, b?: number) => Promise<Verdict>)[] = [async (i, p, n, b) => relayVerify(i, p, n, b) as Verdict, w.verify];
  for (const verify of verifiers) {
    assert.equal((await verify(ID, second.payload, NOW)).ok, true);
    // Corps modifié après signature (une autre date, une autre entrée).
    const tampered = { ...second.payload, b: second.payload.b.replace(`"t":${NOW}`, `"t":${NOW + 1}`) };
    assert.equal((await verify(ID, tampered, NOW)).why, 'signature');
    // Une autre borne qui signe sous l'identifiant de celle-ci.
    const other = relayRecord({ seed: relaySeed(), host: '192.168.1.2', port: 47820, phones: [phoneA], now: NOW });
    const squat = { ...other.payload, b: other.payload.b.replace(`"id":"${other.id}"`, `"id":"${ID}"`) };
    assert.equal((await verify(ID, squat, NOW)).ok, false);
    // Rejeu d'une déclaration plus ancienne que celle gardée.
    assert.equal((await verify(ID, first.payload, NOW, NOW)).why, 'rejeu');
    // Horloge hors de la tolérance.
    assert.equal((await verify(ID, relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA], now: NOW - 3_600_000 }).payload, NOW)).why, 'date');
    // Pas de forme : refusée sans planter.
    assert.equal((await verify(ID, { b: '{', s: 'x' }, NOW)).ok, false);
    assert.equal((await verify('court', second.payload, NOW)).ok, false);
  }
});

test('adresse stable : le service garde la déclaration, la page la déchiffre sur le téléphone et renvoie à l’adresse locale', async () => {
  const w = await loadWorker();
  const svc = memoryService(w.default);
  const put = async (r: ReturnType<typeof relayRecord>) => svc.fetch(`/api/b/${r.id}`, { method: 'PUT', body: JSON.stringify(r.payload), headers: { 'Content-Type': 'application/json' } });
  assert.equal((await put(relayRecord({ seed, host: '192.168.68.54', port: 47820, phones: [phoneA, phoneB], now: NOW - 120_000 }))).status, 204);
  // Le DHCP change l'adresse : nouvelle déclaration.
  assert.equal((await put(relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA, phoneB], now: NOW }))).status, 204);
  // L'ancienne, rejouée par un tiers : refusée, l'adresse reste la bonne.
  assert.equal((await put(relayRecord({ seed, host: '192.168.68.54', port: 47820, phones: [phoneA, phoneB], now: NOW - 60_000 }))).status, 409);
  assert.ok(svc.ttl.get(ID)! > 0, 'la déclaration expire chez le service');
  // Le service ne garde rien de lisible.
  const stored = svc.kv.get(ID)!;
  assert.ok(!stored.includes('192.168') && !stored.includes(toBase64Url(phoneA)));

  const storage = memoryStorage();
  svc.seen.length = 0;
  const where = await page.locate({ core, id: ID, key: phoneA, storage, fetch: svc.fetch });
  assert.equal(where.kind, 'go');
  assert.equal(where.from, 'service');
  assert.equal(where.url, `http://192.168.68.52:47820/#g=${toBase64Url(phoneA)}&d=1`);
  // Une seule requête, sans clé ni empreinte : la clé ne quitte pas le téléphone.
  assert.equal(svc.seen.length, 1);
  assert.deepEqual([svc.seen[0]!.method, new URL(svc.seen[0]!.url).pathname], ['GET', `/api/b/${ID}`]);
  for (const secret of [toBase64Url(phoneA), keptFingerprint(phoneA), phoneA.toString('hex')]) {
    assert.ok(!svc.seen[0]!.url.includes(secret) && !svc.seen[0]!.body.includes(secret));
  }
  // La clé ne voyage que dans le fragment de l'adresse locale (jamais envoyé sur le réseau).
  const out = new URL(where.url!);
  assert.equal(out.protocol, 'http:');
  assert.ok(relayAddressOk(out.hostname, Number(out.port)));
  assert.ok(!out.pathname.includes(toBase64Url(phoneA)) && !out.search.includes(toBase64Url(phoneA)));
  // Et la page ne garde jamais la clé : seulement la dernière adresse.
  for (const v of storage.map.values()) assert.ok(!v.includes(toBase64Url(phoneA)));

  // L'autre téléphone gardé lit la sienne ; un téléphone inconnu, rien.
  assert.equal((await page.locate({ core, id: ID, key: phoneB, storage: memoryStorage(), fetch: svc.fetch })).kind, 'go');
  assert.equal((await page.locate({ core, id: ID, key: crypto.randomBytes(32), storage: memoryStorage(), fetch: svc.fetch })).kind, 'forgotten');
});

test('adresse stable : un téléphone oublié ne retrouve plus l’adresse ; plus aucun téléphone, le service efface tout', async () => {
  const w = await loadWorker();
  const svc = memoryService(w.default);
  const put = async (r: ReturnType<typeof relayRecord>) => svc.fetch(`/api/b/${r.id}`, { method: 'PUT', body: JSON.stringify(r.payload) });
  await put(relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA, phoneB], now: NOW - 120_000 }));
  const storage = memoryStorage();
  assert.equal((await page.locate({ core, id: ID, key: phoneB, storage, fetch: svc.fetch })).kind, 'go');
  // phoneB oublié à la borne : il n'a plus d'entrée, et sa dernière adresse est oubliée aussi.
  await put(relayRecord({ seed, host: '192.168.68.52', port: 47820, phones: [phoneA], now: NOW - 60_000 }));
  assert.equal((await page.locate({ core, id: ID, key: phoneB, storage, fetch: svc.fetch })).kind, 'forgotten');
  assert.equal(storage.map.size, 0);
  // Tous oubliés (ou fonction coupée) : déclaration vide, effacée.
  assert.equal((await put(relayRecord({ seed, host: '0.0.0.0', port: 0, phones: [], now: NOW }))).status, 204);
  assert.equal(svc.kv.has(ID), false);
  assert.equal((await svc.fetch(`/api/b/${ID}`)).status, 404);
});

test('adresse stable : service injoignable, la dernière adresse connue ; aucune, « Borne introuvable »', async () => {
  const w = await loadWorker();
  const svc = memoryService(w.default);
  await svc.fetch(`/api/b/${ID}`, { method: 'PUT', body: JSON.stringify(relayRecord({ seed, host: '10.0.0.7', port: 47820, phones: [phoneA], now: NOW }).payload) });
  const storage = memoryStorage();
  assert.equal((await page.locate({ core, id: ID, key: phoneA, storage, fetch: svc.fetch })).from, 'service');
  const down = async (): Promise<Response> => {
    throw new TypeError('Failed to fetch');
  };
  const offline = await page.locate({ core, id: ID, key: phoneA, storage, fetch: down });
  assert.deepEqual([offline.kind, offline.from, offline.url], ['go', 'memoire', `http://10.0.0.7:47820/#g=${toBase64Url(phoneA)}&d=1`]);
  // Service en panne (500) ou borne oubliée par le service (404, 60 jours sans nouvelles) : la mémoire aussi.
  assert.equal((await page.locate({ core, id: ID, key: phoneA, storage, fetch: async () => new Response('', { status: 500 }) })).from, 'memoire');
  assert.equal((await page.locate({ core, id: ID, key: phoneA, storage, fetch: async () => new Response('', { status: 404 }) })).from, 'memoire');
  // Le service qui ne répond pas du tout : abandonné après le délai, la mémoire encore.
  const hang = (_url: string, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
  assert.equal((await page.locate({ core, id: ID, key: phoneA, storage, fetch: hang, timeoutMs: 30 })).from, 'memoire');
  // Rien de connu : la page le dit.
  assert.equal((await page.locate({ core, id: ID, key: phoneA, storage: memoryStorage(), fetch: down })).kind, 'lost');
});

test('adresse stable : la page ne suit jamais une adresse publique, même bien chiffrée', async () => {
  // Une entrée scellée sous la bonne clé, mais vers une adresse d'Internet : refusée.
  const nonce = crypto.randomBytes(12);
  const plain = Buffer.from(JSON.stringify({ h: '8.8.8.8', p: 443, t: NOW }));
  const c = toBase64Url(Buffer.concat([nonce, aeadSeal(phoneA, nonce, Buffer.from(`cyberpinball:adresse:${ID}`), plain)]));
  const payload = { b: JSON.stringify({ v: 1, id: ID, pk: 'x', t: NOW, e: [{ f: keptFingerprint(phoneA), c }] }), s: 'x' };
  assert.equal(page.openEntry(core, phoneA, ID, payload), null);
  assert.equal(relayOpen(phoneA, JSON.parse(payload.b) as Parameters<typeof relayOpen>[1]), undefined);
  // La déclaration d'une autre borne (autre identifiant dans le corps) : rien.
  const other = relayRecord({ seed: relaySeed(), host: '192.168.1.2', port: 47820, phones: [phoneA], now: NOW });
  assert.equal(page.openEntry(core, phoneA, ID, other.payload), null);
});

test('adresse stable : la page lit l’identifiant et la clé dans l’adresse, jamais ailleurs', () => {
  const g = toBase64Url(phoneA);
  assert.deepEqual(page.parse({ pathname: `/b/${ID}`, hash: `#g=${g}` }, core), { id: ID, key: new Uint8Array(phoneA), install: false });
  assert.equal(page.parse({ pathname: `/b/${ID}/`, hash: `#g=${g}&r=1` }, core).install, true);
  assert.equal(page.parse({ pathname: `/b/${ID}`, hash: '' }, core).key, null);
  assert.equal(page.parse({ pathname: '/b/court', hash: `#g=${g}` }, core).id, '');
  assert.equal(page.parse({ pathname: `/b/${ID}`, hash: '#g=abc' }, core).key, null);
});

test('adresse stable : le service sert la page de chaque borne avec ses en-têtes, et rien d’autre sous /api', async () => {
  const w = await loadWorker();
  const svc = memoryService(w.default);
  const r = await svc.fetch(`/b/${ID}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
  assert.equal(r.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal((await svc.fetch('/api/b/court')).status, 404);
  assert.equal((await svc.fetch(`/api/b/${ID}`, { method: 'DELETE' })).status, 405);
  assert.equal((await svc.fetch(`/api/b/${ID}`, { method: 'PUT', body: 'x'.repeat(9000) })).status, 413);
  assert.equal((await svc.fetch(`/api/b/${ID}`, { method: 'PUT', body: '{' })).status, 400);
});

test('adresse stable : la borne déclare ce qui change, réessaie en s’espaçant, efface quand on coupe', async () => {
  const w = await loadWorker();
  let clock = NOW;
  const svc = memoryService(w.default, () => clock);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-relais-'));
  const kept = createKeptPhones(dir, { now: () => clock });
  const lines: string[] = [];
  let down = false;
  const calls: string[] = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (down) throw new TypeError('fetch failed');
    return svc.fetch(url, init);
  };
  const relay = createPhoneRelay({ kept, origin: 'https://t.cyberpinball.com', fetch: fakeFetch, now: () => clock, log: (l: string) => lines.push(l) });
  const settle = async () => {
    for (let i = 0; i < 50 && relay.busy(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  const here = { host: '192.168.68.52', port: 47820 };

  // Aucun téléphone gardé : rien n'est déclaré, et le téléphone ne reçoit pas d'entrée stable.
  relay.update(here);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(relay.url(), undefined);

  kept.add(phoneA, 'Android · Chrome');
  relay.update(here);
  await settle();
  assert.equal(calls.length, 1);
  const id = relayId(relayKeys(kept.relaySeed()).publicKey);
  assert.equal(relay.url(), `https://t.cyberpinball.com/b/${id}`);
  assert.ok(lines.some((l) => /adresse stable déclarée/.test(l)));
  // Rien n'a changé : rien n'est renvoyé (le service a un quota d'écritures).
  relay.update(here);
  await settle();
  assert.equal(calls.length, 1);
  // Jamais une adresse d'essai ou publique.
  relay.update({ host: '127.0.0.1', port: 47820 });
  await settle();
  assert.equal(calls.length, 1);

  // Le DHCP change l'adresse, et le service est injoignable : nouvel essai seulement après le délai.
  clock += 1000;
  down = true;
  relay.update({ host: '192.168.68.60', port: 47820 });
  await settle();
  assert.equal(calls.length, 2);
  assert.ok(relay.state().error);
  clock += RELAY_RETRY_MS[0]! - 1;
  relay.update({ host: '192.168.68.60', port: 47820 });
  await settle();
  assert.equal(calls.length, 2, 'pas avant le délai');
  clock += 2;
  down = false;
  relay.update({ host: '192.168.68.60', port: 47820 });
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(relay.state().error, undefined);
  const located = await page.locate({ core, id, key: phoneA, storage: memoryStorage(), fetch: svc.fetch });
  assert.equal(located.url, `http://192.168.68.60:47820/#g=${toBase64Url(phoneA)}&d=1`);

  // Une semaine sans changement : renouvelée (le service l'oublierait après 60 jours).
  clock += 7 * 86_400_000;
  relay.update({ host: '192.168.68.60', port: 47820 });
  await settle();
  assert.equal(calls.length, 4);

  // La graine et la déclaration survivent au redémarrage de la borne (même identifiant, même raccourci).
  const again = createKeptPhones(dir, { now: () => clock });
  assert.equal(relayId(relayKeys(again.relaySeed()).publicKey), id);
  assert.ok(again.relayPublished());
  // telephones.json ne contient pas l'adresse en clair dans la déclaration, mais la graine reste un secret de la borne.
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'telephones.json'), 'utf8')).relay.seed);

  // Coupée à la borne : la déclaration est effacée chez le service, plus d'entrée stable au téléphone.
  clock += 1000;
  kept.setRelayOn(false);
  relay.update({ host: '192.168.68.60', port: 47820 });
  await settle();
  assert.equal(calls.length, 5);
  assert.equal(svc.kv.has(id), false);
  assert.equal(relay.url(), undefined);
  assert.equal(kept.relayPublished(), undefined);
  // Coupée et effacée : plus rien ne part.
  relay.update({ host: '192.168.68.61', port: 47820 });
  await settle();
  assert.equal(calls.length, 5);
  assert.equal(createKeptPhones(dir).relayOn(), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('adresse stable : le service et la page de la borne partagent le même chiffrement, rien de secret dans le service', () => {
  // La page du service reprend telephone-core.js et les icônes de la page du téléphone, copiés à la mise en ligne.
  const ignore = fs.readFileSync(path.join(SERVICE, '.gitignore'), 'utf8');
  for (const f of ['telephone-core.js', 'icone-180.png', 'icone-192.png']) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', f)), f);
    assert.ok(ignore.includes(`public/${f}`), `${f} copié, jamais suivi`);
  }
  const html = fs.readFileSync(path.join(SERVICE, 'public', 'index.html'), 'utf8');
  assert.match(html, /src="\/telephone-core\.js"/);
  // Ni manifeste (son adresse de départ perdrait la clé) ni script tiers.
  assert.doesNotMatch(html, /rel="manifest"/);
  assert.doesNotMatch(html, /src="https?:/);
  // wrangler.toml : aucun jeton, aucun identifiant de compte.
  const toml = fs.readFileSync(path.join(SERVICE, 'wrangler.toml'), 'utf8');
  assert.doesNotMatch(toml, /account_id|api_token|CLOUDFLARE_API/i);
  // La page de la borne envoie au service la clé dans le fragment seulement.
  const local = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.js'), 'utf8');
  assert.match(local, /location\.href = `\$\{url\}#g=\$\{core\.toB64\(key\)\}&r=1`/);
});
