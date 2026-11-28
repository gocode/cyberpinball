// Relais des mises à jour (updaterelay.ts, routes /maj/… du service) et cause lisible des erreurs
// réseau (netcause.ts).
//
// Rapport d'un joueur (21/11/2026) : une borne ne joignait plus GitHub depuis deux jours (« fetch
// failed », rien de plus), alors que le service de Cyber Pinball lui répondait. Ces tests fixent :
// - qu'une borne qui ne joint pas GitHub trouve, télécharge et vérifie sa mise à jour par le relais,
//   de bout en bout (borne → service → « GitHub »), sans rien demander au joueur ;
// - que le relais ne sert que le dépôt de Cyber Pinball (pas un relais ouvert) ;
// - que l'erreur dit pourquoi (adresse injoignable, nom introuvable, certificat…), pas « fetch failed ».

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { describeNetworkError, networkErrorCode, networkFailureOf } from '../netcause';
import { RELAY_ORIGIN } from '../remote-relay';
import { checkForUpdate, downloadUpdate, signManifest, tagsApiUrl, UPDATE_REPOSITORY, type UpdateManifest } from '../update';
import { relayedUpdateUrl, updateFetchWithRelay } from '../updaterelay';
import { SERVICE_DIR } from './fausse-d1';
import { REPO_ROOT } from './i18n-scan';

type Relay = (request: Request, url: URL, get?: typeof fetch) => Promise<Response | undefined>;
const worker = async () => (await import(pathToFileURL(path.join(SERVICE_DIR, 'worker.mjs')).href)) as { updateRelay: Relay; UPDATE_REPOSITORY: string };

/** Erreur du fetch de Node : « fetch failed », la raison dans cause. */
const nodeError = (code: string) => new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ${code}`), { code }) });

const API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases`;
const SITE = `https://github.com/${UPDATE_REPOSITORY}/releases/`;

test('cause lisible : codes de Node (cause, erreurs groupées) et de Chromium', () => {
  assert.equal(networkErrorCode(nodeError('ENETUNREACH')), 'ENETUNREACH');
  const grouped = new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error('a'), { code: 'ECONNREFUSED' })], 'x') });
  assert.equal(networkErrorCode(grouped), 'ECONNREFUSED');
  assert.equal(networkErrorCode(new Error('net::ERR_ADDRESS_UNREACHABLE')), 'ERR_ADDRESS_UNREACHABLE');
  assert.equal(networkFailureOf('ERR_ADDRESS_UNREACHABLE'), 'unreachable');
  assert.equal(networkFailureOf('ENOTFOUND'), 'dns');
  assert.equal(networkFailureOf('SELF_SIGNED_CERT_IN_CHAIN'), 'certificate');
  assert.equal(networkFailureOf('UND_ERR_CONNECT_TIMEOUT'), 'timeout');
  assert.equal(networkFailureOf('ERR_PROXY_CONNECTION_FAILED'), 'proxy');
  assert.match(describeNetworkError(nodeError('ENETUNREACH')), /adresse injoignable.*\[ENETUNREACH\]/);
  assert.match(describeNetworkError(nodeError('SELF_SIGNED_CERT_IN_CHAIN')), /certificat.*\[SELF_SIGNED_CERT_IN_CHAIN\]/);
  // Sans code connu : le message tel quel, jamais vide.
  assert.equal(describeNetworkError(new Error('plus rien ne vient du site')), 'plus rien ne vient du site');
  assert.equal(describeNetworkError(new TypeError('fetch failed')), 'fetch failed');
  assert.equal(describeNetworkError(nodeError('EWHATEVER')), 'fetch failed [EWHATEVER]');
});

test('relais : les adresses publiques du dépôt seulement, le même dépôt partout', async () => {
  assert.equal(relayedUpdateUrl(`${API}?per_page=10`), `${RELAY_ORIGIN}/maj/api/releases?per_page=10`);
  assert.equal(relayedUpdateUrl(`${SITE}download/v0.2.2/CyberPinball-Setup.exe`), `${RELAY_ORIGIN}/maj/github/releases/download/v0.2.2/CyberPinball-Setup.exe`);
  assert.equal(relayedUpdateUrl(`${SITE}latest/download/cyberpinball-maj.json`), `${RELAY_ORIGIN}/maj/github/releases/latest/download/cyberpinball-maj.json`);
  assert.equal(relayedUpdateUrl(tagsApiUrl()), `${RELAY_ORIGIN}/maj/api/tags`);
  assert.equal(relayedUpdateUrl(tagsApiUrl('autre/depot')), undefined);
  assert.equal(relayedUpdateUrl('https://api.github.com/repos/autre/depot/releases'), undefined);
  assert.equal(relayedUpdateUrl('https://github.com/autre/depot/releases/download/v1/x.exe'), undefined);
  assert.equal(relayedUpdateUrl('https://objects.githubusercontent.com/x'), undefined);
  assert.equal((await worker()).UPDATE_REPOSITORY, UPDATE_REPOSITORY, 'le service relaie le dépôt des mises à jour');
  const source = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'core', 'src', 'updaterelay.ts'), 'utf8');
  assert.match(source, new RegExp(`const REPOSITORY = '${UPDATE_REPOSITORY}'`), 'updaterelay.ts : le dépôt des mises à jour');
});

test('service : seulement le dépôt de Cyber Pinball, Range transmis, installeur pour un navigateur', async () => {
  const { updateRelay } = await worker();
  const asked: { url: string; range: string | null; method: string }[] = [];
  const github = (async (input: string, init?: RequestInit) => {
    asked.push({ url: input, range: new Headers(init?.headers).get('range'), method: init?.method ?? 'GET' });
    if (input.endsWith('/releases/latest'))
      return Response.json({ assets: [{ name: 'CyberPinball-Setup-complet.exe', browser_download_url: `${SITE}download/v0.2.2/CyberPinball-Setup-complet.exe` }, { name: 'CyberPinball-Setup.exe', browser_download_url: `${SITE}download/v0.2.2/CyberPinball-Setup.exe` }] });
    return new Response('octets', { status: 206, headers: { 'content-range': 'bytes 2-7/8', 'content-type': 'application/octet-stream' } });
  }) as typeof fetch;
  const call = (route: string, init?: RequestInit) => updateRelay(new Request(`${RELAY_ORIGIN}${route}`, init), new URL(route, RELAY_ORIGIN), github);

  assert.equal(await call('/api/b/rien'), undefined, 'les autres routes ne sont pas au relais');
  assert.equal((await call('/maj/api/releases?per_page=500'))!.status, 206);
  assert.equal(asked.at(-1)!.url, `${API}?per_page=30`, 'au plus 30 publications');
  const file = await call('/maj/github/releases/download/v0.2.2/CyberPinball-Setup.exe', { headers: { range: 'bytes=2-' } });
  assert.equal(file!.status, 206);
  assert.equal(file!.headers.get('content-range'), 'bytes 2-7/8');
  assert.deepEqual(asked.at(-1), { url: `${SITE}download/v0.2.2/CyberPinball-Setup.exe`, range: 'bytes=2-', method: 'GET' });
  for (const refused of ['/maj/github/releases/download/v1/../../autre', '/maj/github/autre/depot', '/maj/github/releases/download/v1/a/b', '/maj/rien']) {
    const before = asked.length;
    assert.equal((await call(refused))!.status, 404, refused);
    assert.equal(asked.length, before, `${refused} : GitHub n'est pas appelé`);
  }
  assert.equal((await call('/maj/api/releases', { method: 'POST', body: 'x' }))!.status, 405);
  const setup = await call('/telecharger');
  assert.equal(asked.at(-1)!.url, `${SITE}download/v0.2.2/CyberPinball-Setup.exe`, 'l’installeur léger, pas le complet');
  assert.match(setup!.headers.get('content-disposition') ?? '', /CyberPinball-Setup\.exe/);
});

test('fetch des mises à jour : GitHub injoignable → relais, qui passe ensuite en premier', async () => {
  const seen: string[] = [];
  const lines: string[] = [];
  let githubDown = true;
  const base = (async (input: string) => {
    seen.push(input);
    if (input.startsWith(RELAY_ORIGIN)) return new Response('relais');
    if (githubDown) throw nodeError('ENETUNREACH');
    return new Response('github');
  }) as typeof fetch;
  const get = updateFetchWithRelay({ base, log: (l) => lines.push(l) });
  assert.equal(await (await get(`${API}?per_page=10`)).text(), 'relais');
  assert.match(lines.join('\n'), /GitHub injoignable \(adresse injoignable.*ENETUNREACH.*le relais d'abord/);
  seen.length = 0;
  await get(`${SITE}download/v1/x.exe`);
  assert.equal(seen.length, 1, 'le relais d’abord : GitHub n’est plus essayé avant');
  assert.ok(seen[0]!.startsWith(`${RELAY_ORIGIN}/maj/github/`));
  // Une autre adresse (canal privé, autre site) ne passe jamais par le relais.
  seen.length = 0;
  githubDown = false;
  await get('https://example.org/autre.json');
  assert.deepEqual(seen, ['https://example.org/autre.json']);
});

test('fetch des mises à jour : réponse HTTP rendue telle quelle, abandon jamais retenté, deux échecs expliqués', async () => {
  let relayCalls = 0;
  const http500 = (async (input: string) => {
    if (input.startsWith(RELAY_ORIGIN)) relayCalls++;
    return new Response('', { status: 500 });
  }) as typeof fetch;
  assert.equal((await updateFetchWithRelay({ base: http500 })(`${API}?per_page=10`)).status, 500);
  assert.equal(relayCalls, 0, 'GitHub a répondu : pas de relais');

  const abort = new AbortController();
  abort.abort();
  const aborting = (async () => {
    throw new DOMException('annulé', 'AbortError');
  }) as typeof fetch;
  let calls = 0;
  await assert.rejects(
    updateFetchWithRelay({
      base: (async (...args: Parameters<typeof fetch>) => {
        calls++;
        return aborting(...args);
      }) as typeof fetch,
    })(`${API}?per_page=10`, { signal: abort.signal }),
    /annulé/,
  );
  assert.equal(calls, 1, 'abandon de l’appelant : pas d’autre chemin');

  const down = (async (input: string) => {
    throw input.startsWith(RELAY_ORIGIN) ? nodeError('ENOTFOUND') : nodeError('ENETUNREACH');
  }) as typeof fetch;
  await assert.rejects(updateFetchWithRelay({ base: down })(`${API}?per_page=10`), (error: Error) => {
    assert.match(error.message, /adresse injoignable.*ENETUNREACH.*relais de Cyber Pinball : nom du site introuvable.*ENOTFOUND/);
    return true;
  });
});

test('fetch des mises à jour : GitHub muet → relais au bout de la patience, sans attendre la fin', async () => {
  const mute = (async (input: string, init?: RequestInit) => {
    if (input.startsWith(RELAY_ORIGIN)) return new Response('relais');
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
  }) as typeof fetch;
  const started = Date.now();
  assert.equal(await (await updateFetchWithRelay({ base: mute, directPatienceMs: 50 })(`${API}?per_page=10`)).text(), 'relais');
  assert.ok(Date.now() - started < 2_000);
});

test('de bout en bout : borne sans GitHub → service → « GitHub » : version trouvée, téléchargée, vérifiée', async () => {
  const { updateRelay } = await worker();
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const exe = Buffer.from('installeur de la 0.3.0-essai.1');
  const tag = 'v0.3.0-essai.1';
  const manifest: UpdateManifest = {
    version: '0.3.0-essai.1',
    date: '2026-11-21T10:00:00.000Z',
    notes: ['Relais des mises à jour'],
    installer: { name: 'CyberPinball-Setup.exe', url: `${SITE}download/${tag}/CyberPinball-Setup.exe`, size: exe.length, sha256: createHash('sha256').update(exe).digest('hex') },
  };
  const feed = `${SITE}download/${tag}/cyberpinball-maj.json`;
  // « GitHub », vu du service seulement.
  const githubSeen: string[] = [];
  const github = (async (input: string, init?: RequestInit) => {
    githubSeen.push(`${init?.method ?? 'GET'} ${input}`);
    // Les étiquettes (la plus haute version, quel que soit l'ordre de la liste) ; la liste n'est plus lue.
    if (input === tagsApiUrl()) return Response.json([{ ref: 'refs/tags/v0.2.1-essai.29' }, { ref: `refs/tags/${tag}` }]);
    if (input.startsWith(API)) return Response.json([{ tag_name: tag, assets: [{ name: 'cyberpinball-maj.json', browser_download_url: feed, url: 'https://api.github.com/x' }] }]);
    if (input === feed) return new Response(JSON.stringify(signManifest(manifest, priv)));
    if (input === manifest.installer.url) return new Response(exe, { headers: { 'content-length': String(exe.length) } });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  // La borne : GitHub injoignable, le service joignable.
  const cabinet = (async (input: string, init?: RequestInit) => {
    if (!input.startsWith(RELAY_ORIGIN)) throw nodeError('ENETUNREACH');
    const url = new URL(input);
    return (await updateRelay(new Request(input, { method: init?.method ?? 'GET', headers: init?.headers }), url, github))!;
  }) as typeof fetch;
  const get = updateFetchWithRelay({ base: cabinet });

  const check = await checkForUpdate({ current: '0.2.1-essai.29', prereleases: true, publicKey: pub, fetch: get, patience: { retryDelayMs: 10 } });
  assert.equal(check.status, 'available');
  assert.equal(check.latest.version, '0.3.0-essai.1');
  assert.ok(githubSeen.includes(`GET ${tagsApiUrl()}`) && githubSeen.includes(`HEAD ${feed}`), githubSeen.join('\n'));
  assert.ok(!githubSeen.some((s) => s.includes('/releases?')), 'étiquettes lues par le relais : la liste n’est pas demandée');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-relais-'));
  try {
    const file = await downloadUpdate(check.latest, dir, { fetch: get });
    assert.deepEqual(fs.readFileSync(file), exe, 'installeur reçu par le relais, empreinte vérifiée');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Ni GitHub ni le service : l'erreur dit pourquoi, pas seulement « fetch failed ».
  const nothing = (async () => {
    throw nodeError('ENETUNREACH');
  }) as typeof fetch;
  await assert.rejects(checkForUpdate({ current: '0.2.1-essai.29', publicKey: pub, fetch: updateFetchWithRelay({ base: nothing }), patience: { retryDelayMs: 10 } }), /Pas de réponse du site des mises à jour.*adresse injoignable.*ENETUNREACH/);
});

test('écran des mises à jour : toutes ses lectures passent par le fetch du relais, et le secours est proposé', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'updates-menu.ts'), 'utf8');
  for (const call of source.match(/checkForUpdate\(\{[^)]*\}\)/g) ?? []) assert.match(call, /sourceOptions\(/, `${call} : sans le fetch du relais`);
  assert.doesNotMatch(source, /channelFetch\(channel\(\)\)/, 'le téléchargement passe aussi par le fetch du relais');
  assert.match(source, /t\('Installer automatiquement la dernière version'\)/);
  assert.match(source, /updateFetchWithRelay\(\{ relayFirst: true/);
});
