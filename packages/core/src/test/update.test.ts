import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  channelFetch,
  checkForUpdate,
  compareAppVersions,
  effectiveUpdateSource,
  loadPrivateChannel,
  loadUpdateSource,
  saveUpdateSource,
  loadAutoUpdate,
  saveAutoUpdate,
  downloadAppPackage,
  downloadUpdate,
  installedSocle,
  loadPrereleaseSetting,
  missedReleases,
  newestListedRelease,
  prereleaseFeedUrl,
  openEnvelope,
  recordPendingUpdate,
  relaunchArguments,
  releaseAssetUrl,
  releasesApiUrl,
  savePrereleaseSetting,
  signManifest,
  stagedAppDir,
  swapAppDir,
  tagsApiUrl,
  lightUpdateInterrupted,
  takeUpdateOutcome,
  unpackAppPackage,
  updateFeedUrl,
  updateInstallerArguments,
  updateNotes,
  updatePlan,
  updatePublicKey,
  UPDATE_REPOSITORY,
  waitForExit,
  windowsTar,
  type UpdateManifest,
} from '../update';
import { UPDATE_PUBLIC_KEY } from '../update-key';

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const keys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-maj-'));

function manifestFor(content: Buffer, url: string, version = '0.2.0'): UpdateManifest {
  return {
    version,
    date: '2026-10-24T10:00:00.000Z',
    notes: ['Mise à jour depuis le menu système'],
    installer: { name: 'CyberPinball-Setup.exe', url, size: content.length, sha256: createHash('sha256').update(content).digest('hex') },
  };
}

/** Petit serveur local : chaque chemin sert un contenu, compté pour vérifier les reprises. */
async function serve(files: Record<string, Buffer | string>): Promise<{ url: string; hits: Record<string, number>; close(): Promise<void> }> {
  const hits: Record<string, number> = {};
  const server = http.createServer((req, res) => {
    const body = files[req.url ?? ''];
    hits[req.url ?? ''] = (hits[req.url ?? ''] ?? 0) + 1;
    if (body === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': Buffer.byteLength(body) }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hits, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

test('versions : numérique, préversion avant la version finale', () => {
  assert.ok(compareAppVersions('0.10.0', '0.9.9') > 0);
  assert.ok(compareAppVersions('1.0.0', '0.99.99') > 0);
  assert.equal(compareAppVersions('0.2.0', '0.2.0'), 0);
  assert.ok(compareAppVersions('0.2.0-beta.1', '0.2.0') < 0);
  assert.ok(compareAppVersions('0.2.0-beta.2', '0.2.0-beta.10') < 0);
  assert.ok(compareAppVersions('0.2.0-beta', '0.2.0-alpha') > 0);
  assert.throws(() => compareAppVersions('v0.2', '0.2.0'), /illisible/);
});

test('nouveautés dans la langue de la borne, en français à défaut ; traductions vérifiées', () => {
  const k = keys();
  const m = { ...manifestFor(Buffer.from('exe'), 'https://example.org/CyberPinball-Setup.exe'), notesByLanguage: { en: ['Update from the system menu'] } };
  const read = openEnvelope(JSON.stringify(signManifest(m, k.priv)), k.pub);
  assert.deepEqual(updateNotes(read, 'en'), ['Update from the system menu']);
  assert.deepEqual(updateNotes(read, 'fr'), ['Mise à jour depuis le menu système']);
  // Flux d'avant les traductions, ou langue sans nouveautés : celles en français.
  assert.deepEqual(updateNotes({ ...read, notesByLanguage: undefined }, 'en'), ['Mise à jour depuis le menu système']);
  assert.deepEqual(updateNotes({ ...read, notesByLanguage: { en: [] } }, 'en'), ['Mise à jour depuis le menu système']);
  assert.throws(() => signManifest({ ...m, notesByLanguage: { en: [3] as unknown as string[] } }, k.priv), /nouveautés/);
});

test('flux signé : lu avec la bonne clé, refusé s’il est modifié ou signé par une autre clé', () => {
  const k = keys();
  const m = manifestFor(Buffer.from('exe'), 'https://example.org/CyberPinball-Setup.exe');
  const envelope = signManifest(m, k.priv);
  assert.deepEqual(openEnvelope(JSON.stringify(envelope), k.pub), m);

  const tampered = { ...envelope, manifest: envelope.manifest.replace('0.2.0', '9.9.9') };
  assert.throws(() => openEnvelope(JSON.stringify(tampered), k.pub), /Signature .* invalide/);
  assert.throws(() => openEnvelope(JSON.stringify(envelope), keys().pub), /Signature .* invalide/);
  assert.throws(() => openEnvelope('<html>', k.pub), /illisible/);
  assert.throws(() => openEnvelope(JSON.stringify({ format: 2 }), k.pub), /format inconnu/);
  // Un manifeste incomplet n'est même pas signé.
  assert.throws(() => signManifest({ ...m, installer: { ...m.installer, sha256: 'abc' } }, k.priv), /empreinte/);
});

test('recherche : disponible si plus récente, à jour sinon ; erreurs lisibles', async () => {
  const k = keys();
  const m = manifestFor(Buffer.from('exe'), 'https://example.org/x.exe');
  const site = await serve({ '/maj.json': JSON.stringify(signManifest(m, k.priv)) });
  try {
    const feedUrl = `${site.url}/maj.json`;
    assert.equal((await checkForUpdate({ current: '0.1.0', feedUrl, publicKey: k.pub })).status, 'available');
    assert.equal((await checkForUpdate({ current: '0.2.0', feedUrl, publicKey: k.pub })).status, 'up-to-date');
    assert.equal((await checkForUpdate({ current: '0.3.0', feedUrl, publicKey: k.pub })).status, 'up-to-date');
    await assert.rejects(checkForUpdate({ current: '0.1.0', feedUrl: `${site.url}/absent.json`, publicKey: k.pub }), /Aucune version publiée/);
    await assert.rejects(checkForUpdate({ current: '0.1.0', feedUrl, publicKey: keys().pub }), /Signature/);
  } finally {
    await site.close();
  }
  await assert.rejects(checkForUpdate({ current: '0.1.0', feedUrl: 'http://127.0.0.1:9/maj.json', publicKey: k.pub, patience: { retryDelayMs: 10 } }), /connectée à Internet/);
});

/** Site dont chaque réponse arrive par petits morceaux (connexion lente), ou jamais (site muet). */
async function slowSite(files: Record<string, string>, pace: { pieces: number; everyMs: number } | 'muet') {
  const sockets = new Set<import('node:net').Socket>();
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    if (pace === 'muet') return;
    const body = files[req.url ?? ''];
    if (body === undefined) return void res.writeHead(404).end();
    const data = Buffer.from(body);
    const size = Math.ceil(data.length / pace.pieces);
    res.writeHead(200, { 'content-length': data.length });
    let at = 0;
    const timer = setInterval(() => {
      res.write(data.subarray(at, (at += size)));
      if (at >= data.length) {
        clearInterval(timer);
        res.end();
      }
    }, pace.everyMs);
    res.on('close', () => clearInterval(timer));
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, hits, close: () => new Promise<void>((resolve) => (sockets.forEach((s) => s.destroy()), server.close(() => resolve()))) };
}

test('connexion lente : le flux livré en plus de 20 s, sans long silence, est lu (réglages par défaut)', async () => {
  // Le cas du 20/11/2026 : un délai total de 20 s coupait la lecture à 4 Ko/s, à chaque essai.
  const k = keys();
  const feed = JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), 'https://example.org/x.exe'), k.priv));
  const site = await slowSite({ '/maj.json': feed }, { pieces: 44, everyMs: 500 });
  try {
    const start = Date.now();
    const check = await checkForUpdate({ current: '0.1.0', feedUrl: `${site.url}/maj.json`, publicKey: k.pub });
    assert.ok(Date.now() - start > 20_000, 'le transfert a bien duré plus que l’ancien délai total');
    assert.equal(check.status, 'available');
    assert.deepEqual(site.hits, ['/maj.json'], 'lu d’une traite, sans réessai');
  } finally {
    await site.close();
  }
});

test('connexion lente : la liste des publications et le flux aboutissent ; site muet : message habituel', async () => {
  const k = keys();
  // Silence toléré bien au-dessus du rythme des morceaux (120 ms) : à 300 ms, le test tombait quand la machine
  // était chargée (compilation native en parallèle, 23/11/2026), sans rien dire du code.
  const patience = { idleMs: 1500, attempts: 2, retryDelayMs: 10 };
  const files: Record<string, string> = {};
  const site = await slowSite(files, { pieces: 10, everyMs: 120 });
  try {
    files['/maj.json'] = JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), 'https://example.org/x.exe', '0.3.0-essai.1'), k.priv));
    files['/releases'] = JSON.stringify([{ tag_name: 'v0.3.0-essai.1', draft: false, assets: [{ name: 'cyberpinball-maj.json', browser_download_url: `${site.url}/maj.json` }] }]);
    const releasesUrl = `${site.url}/releases`;
    assert.equal(await prereleaseFeedUrl({ releasesUrl, patience }), `${site.url}/maj.json`);
    const check = await checkForUpdate({ current: '0.2.0', prereleases: true, releasesUrl, publicKey: k.pub, patience });
    assert.equal(check.latest.version, '0.3.0-essai.1');
  } finally {
    await site.close();
  }

  const mute = await slowSite({}, 'muet');
  try {
    const noAnswer = /Pas de réponse du site des mises à jour : la borne est-elle connectée à Internet \?.*plus rien ne vient du site/;
    await assert.rejects(checkForUpdate({ current: '0.1.0', feedUrl: `${mute.url}/maj.json`, publicKey: k.pub, patience }), noAnswer);
    await assert.rejects(prereleaseFeedUrl({ releasesUrl: `${mute.url}/releases`, patience }), noAnswer);
    // Réessayé une fois, puis abandonné : pas d'attente sans fin.
    assert.deepEqual(mute.hits, ['/maj.json', '/maj.json', '/releases', '/releases']);
  } finally {
    await mute.close();
  }
});

test('liste des publications publiques réduite : dix au lieu de trente (environ 1 Mo sur une connexion lente)', () => {
  assert.equal(releasesApiUrl(), `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=10`);
  assert.equal(releasesApiUrl('o/essais', 'http://x', 30), 'http://x/repos/o/essais/releases?per_page=30');
  assert.equal(tagsApiUrl(), `https://api.github.com/repos/${UPDATE_REPOSITORY}/git/matching-refs/tags/v`);
});

// Le 27/11/2026, la liste de GitHub (par jour, puis par nom d'étiquette comme du texte) a rangé
// v0.2.4-essai.100 après essai.74 : hors des dix premières, aucune borne ne l'a vue. L'invariant :
// la plus haute version publiée est trouvée, quel que soit l'ordre de la liste.
test('liste de GitHub mal ordonnée (la 100 après la 74) : la plus haute version publiée est trouvée', async () => {
  const k = keys();
  const essai = (n: number) => `0.2.4-essai.${n}`;
  const feedUrl = (v: string) => releaseAssetUrl(v, 'cyberpinball-maj.json');
  const published = new Set([...Array.from({ length: 28 }, (_, i) => essai(73 + i)), '0.2.3']);
  // L'ordre réel du 28/11/2026 : 99 à 74, puis 100, puis 73.
  const order = [...Array.from({ length: 26 }, (_, i) => 99 - i), 100, 73];
  const list = order.map((n) => ({ tag_name: `v${essai(n)}`, draft: false, prerelease: true, assets: [{ name: 'cyberpinball-maj.json', browser_download_url: feedUrl(essai(n)) }] }));
  // Les étiquettes, dans l'ordre de GitHub (texte) ; la 101 est un brouillon : son flux ne se lit pas.
  const tags = [...published, essai(101)].sort().map((v) => ({ ref: `refs/tags/v${v}` }));
  let tagsStatus = 200;
  const seen: string[] = [];
  const get = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === releasesApiUrl()) return Response.json(list.slice(0, 10));
    if (url === tagsApiUrl()) return tagsStatus === 200 ? Response.json(tags) : new Response('{"message":"API rate limit exceeded"}', { status: tagsStatus });
    const version = /\/download\/v([^/]+)\/cyberpinball-maj\.json$/.exec(url)?.[1];
    if (!version || !published.has(version)) return new Response('Not Found', { status: 404 });
    return new Response(init?.method === 'HEAD' ? null : JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), 'https://example.org/x.exe', version), k.priv)));
  }) as typeof fetch;

  // Les dix premières de la liste seules (lecture des bornes d'avant) : la 99, le défaut constaté.
  assert.equal((await newestListedRelease(releasesApiUrl(), { fetch: get }))?.version, essai(99));
  // Par les étiquettes : la 100, le brouillon 101 écarté.
  seen.length = 0;
  const check = await checkForUpdate({ current: essai(99), prereleases: true, publicKey: k.pub, fetch: get });
  assert.equal(check.status, 'available');
  assert.equal(check.latest.version, essai(100));
  assert.equal(await prereleaseFeedUrl({ fetch: get }), feedUrl(essai(100)));
  // Léger : la liste (plus de 100 Ko par release, notes comprises) n'est pas lue quand les étiquettes répondent.
  assert.ok(!seen.some((s) => s.includes('/releases?per_page')), seen.join('\n'));
  assert.ok(seen.includes(`HEAD ${feedUrl(essai(101))}`) && seen.includes(`HEAD ${feedUrl(essai(100))}`));

  // Étiquettes illisibles (limite de l'API) : la liste, comme avant, plutôt que rien.
  tagsStatus = 403;
  assert.equal((await checkForUpdate({ current: essai(98), prereleases: true, publicKey: k.pub, fetch: get })).latest.version, essai(99));
});

test('canal d’essai privé, liste mal ordonnée : la plus haute étiquette, lue par l’API avec le jeton', async () => {
  const k = keys();
  const api = 'https://api.example.test';
  const channel = { repository: 'o/essais', token: 'bon-jeton', api };
  const release = (v: string, n: number) => ({
    tag_name: `v${v}`,
    draft: false,
    assets: [
      { name: 'cyberpinball-maj.json', url: `${api}/repos/o/essais/releases/assets/${n}`, browser_download_url: `https://github.com/o/essais/releases/download/v${v}/cyberpinball-maj.json` },
      { name: 'CyberPinball-Setup.exe', url: `${api}/repos/o/essais/releases/assets/${n}00`, browser_download_url: `https://github.com/o/essais/releases/download/v${v}/CyberPinball-Setup.exe` },
    ],
  });
  const feeds: Record<string, string> = { '9': '0.2.4-essai.9', '10': '0.2.4-essai.10' };
  const seen: { url: string; auth: string | null }[] = [];
  const get = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization');
    seen.push({ url, auth });
    if (url.startsWith('https://api.github.com/') || url.startsWith('https://github.com/')) return new Response('', { status: 404 });
    if (auth !== 'Bearer bon-jeton') return new Response('', { status: 401 });
    if (url === `${api}/repos/o/essais/releases?per_page=30`) return Response.json([release('0.2.4-essai.9', 9)]);
    if (url === tagsApiUrl('o/essais', api)) return Response.json(['0.2.4-essai.10', '0.2.4-essai.9', '0.2.4-essai.11'].map((v) => ({ ref: `refs/tags/v${v}` })));
    if (url === `${api}/repos/o/essais/releases/tags/v0.2.4-essai.10`) return Response.json(release('0.2.4-essai.10', 10));
    if (url === `${api}/repos/o/essais/releases/tags/v0.2.4-essai.11`) return Response.json({ ...release('0.2.4-essai.11', 11), draft: true });
    const n = /\/releases\/assets\/(\d+)$/.exec(url)?.[1];
    const version = n ? feeds[n] : undefined;
    if (!version) return new Response('', { status: 404 });
    return new Response(JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), `https://github.com/o/essais/releases/download/v${version}/CyberPinball-Setup.exe`, version), k.priv)));
  }) as typeof fetch;
  const check = await checkForUpdate({ current: '0.2.4-essai.9', channel, publicKey: k.pub, fetch: get });
  assert.equal(check.latest.version, '0.2.4-essai.10');
  // L'installeur de la release trouvée par son étiquette passe aussi par l'API (dépôt privé).
  assert.equal(check.latest.installer.url, `${api}/repos/o/essais/releases/assets/1000`);
  assert.ok(seen.filter((s) => s.url.startsWith(api)).every((s) => s.auth === 'Bearer bon-jeton'));
  assert.ok(seen.filter((s) => !s.url.startsWith(api)).every((s) => s.auth === null), 'le jeton ne quitte pas l’API du canal');
});

test('téléchargement : vérifié, repris s’il est intact, supprimé s’il est faux ; anciens installeurs retirés', async () => {
  const content = Buffer.alloc(300_000, 7);
  const site = await serve({ '/setup.exe': content, '/faux.exe': Buffer.alloc(300_000, 8), '/court.exe': Buffer.alloc(10, 7) });
  const dir = temp();
  try {
    fs.writeFileSync(path.join(dir, 'CyberPinball-Setup-0.1.5.exe'), 'ancien');
    const m = manifestFor(content, `${site.url}/setup.exe`);
    let last = 0;
    const file = await downloadUpdate(m, dir, { onProgress: (received) => (last = received) });
    assert.equal(path.basename(file), 'CyberPinball-Setup-0.2.0.exe');
    assert.equal(last, content.length);
    assert.deepEqual(fs.readdirSync(dir), ['CyberPinball-Setup-0.2.0.exe']);
    // Déjà là et intact : pas de second téléchargement.
    await downloadUpdate(m, dir);
    assert.equal(site.hits['/setup.exe'], 1);

    const wrong = { ...m, version: '0.2.1', installer: { ...m.installer, url: `${site.url}/faux.exe` } };
    await assert.rejects(downloadUpdate(wrong, dir), /Empreinte SHA-256/);
    const short = { ...m, version: '0.2.2', installer: { ...m.installer, url: `${site.url}/court.exe` } };
    await assert.rejects(downloadUpdate(short, dir), /incomplet/);
    assert.ok(!fs.readdirSync(dir).some((f) => /0\.2\.[12]/.test(f)), 'aucun fichier faux ne reste');

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(downloadUpdate({ ...m, version: '0.2.3' }, dir, { signal: controller.signal }), /annulé/);
  } finally {
    await site.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('suivi de l’installation : réussite, échec, puis effacé', () => {
  const dir = temp();
  recordPendingUpdate(dir, { from: '0.1.0', to: '0.2.0', started: new Date().toISOString(), installer: 'x.exe' });
  assert.deepEqual(takeUpdateOutcome(dir, '0.2.0'), { kind: 'installed', from: '0.1.0', to: '0.2.0' });
  assert.equal(takeUpdateOutcome(dir, '0.2.0'), undefined);
  const started = '2026-11-24T10:39:10.000Z';
  recordPendingUpdate(dir, { from: '0.1.0', to: '0.2.0', started, installer: 'x.exe' });
  assert.deepEqual(takeUpdateOutcome(dir, '0.1.0'), { kind: 'failed', from: '0.1.0', to: '0.2.0', current: '0.1.0', started, log: undefined });
  fs.writeFileSync(path.join(dir, 'mise-a-jour.json'), '{');
  assert.equal(takeUpdateOutcome(dir, '0.1.0'), undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'mise-a-jour.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mise à jour légère interrompue : aucune ligne du journal de l’outil pour cette tentative', () => {
  const dir = temp();
  const log = path.join(dir, 'maj-legere.txt');
  const started = '2026-11-24T10:39:10.000Z';
  // Pas de journal : l'outil n'a jamais tourné.
  recordPendingUpdate(dir, { from: '0.2.4-essai.17', to: '0.2.4-essai.22', started, installer: 'staged', log });
  const missing = takeUpdateOutcome(dir, '0.2.4-essai.17');
  assert.equal(missing?.kind, 'failed');
  assert.equal(lightUpdateInterrupted(missing as { started?: string; log?: string }), true);
  // Seules des lignes d'une tentative plus ancienne : interrompue aussi.
  fs.writeFileSync(log, '2026-11-20T08:00:00.000Z Mise à jour légère vers 0.2.4-essai.15 : attente.\n2026-11-20T08:00:05.000Z Relance : x\n');
  assert.equal(lightUpdateInterrupted({ started, log }), true);
  // Une ligne de cette tentative : l'outil a démarré (l'échec vient d'ailleurs).
  fs.appendFileSync(log, '2026-11-24T10:39:12.345Z Mise à jour légère vers 0.2.4-essai.22 : attente de la fermeture.\n');
  assert.equal(lightUpdateInterrupted({ started, log }), false);
  // Installeur complet (pas de journal noté) ou date illisible : inconnu, pas d'alerte.
  assert.equal(lightUpdateInterrupted({ started }), false);
  assert.equal(lightUpdateInterrupted({ started: 'pas une date', log }), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('installeur : /MAJ, silencieux hors écran, racine en dernier ; relance avec les mêmes arguments', () => {
  assert.deepEqual(updateInstallerArguments('D:\\Ma Borne'), ['/MAJ', '/D=D:\\Ma Borne']);
  assert.deepEqual(updateInstallerArguments('D:\\B', { silent: true }), ['/MAJ', '/S', '/D=D:\\B']);
  assert.equal(relaunchArguments(['--user-data-dir=D:\\tmp\\a b', '--x']), '"--user-data-dir=D:\\tmp\\a b" --x');
});

test('un seul dépôt : celui du client est celui de package.json, du script de publication et de l’installeur', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  assert.equal(pkg.repository.url, `https://github.com/${UPDATE_REPOSITORY}.git`);
  assert.equal(updateFeedUrl({}), `https://github.com/${UPDATE_REPOSITORY}/releases/latest/download/cyberpinball-maj.json`);
  assert.equal(releaseAssetUrl('0.2.0', 'CyberPinball-Setup.exe'), `https://github.com/${UPDATE_REPOSITORY}/releases/download/v0.2.0/CyberPinball-Setup.exe`);
  // Le site de « Programmes et fonctionnalités » est fourni par installeur.mjs, depuis package.json.
  assert.doesNotMatch(fs.readFileSync(path.join(repo, 'scripts', 'installeur', 'cyberpinball.nsi'), 'utf8'), /!define SITE "/);
});

test('clé publique livrée : Ed25519 ; remplacée pour un essai seulement dans un bac à sable', () => {
  assert.equal(createPublicKey(UPDATE_PUBLIC_KEY).asymmetricKeyType, 'ed25519');
  const dir = temp();
  const k = keys();
  const file = path.join(dir, 'cle.pem');
  fs.writeFileSync(file, k.pub);
  assert.equal(updatePublicKey({ CYBERPINBALL_MAJ_CLE: file }), UPDATE_PUBLIC_KEY);
  assert.equal(updatePublicKey({ CYBERPINBALL_MAJ_CLE: file, CYBERPINBALL_HOME: dir }), k.pub);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nouveautés de chaque version manquée, la plus récente d’abord, dans la langue de la borne', () => {
  const k = keys();
  const m: UpdateManifest = {
    ...manifestFor(Buffer.from('exe'), 'https://example.org/x.exe', '0.4.0'),
    notes: ['quatre'],
    notesByLanguage: { en: ['four'] },
    history: [
      { version: '0.2.0', notes: ['deux'] },
      { version: '0.3.0', notes: ['trois'], notesByLanguage: { en: ['three'] } },
      { version: '0.1.0', notes: ['un'] },
      { version: '0.4.0', notes: ['doublon de la dernière'] },
    ],
  };
  // Passe la signature et la relecture : l'historique fait partie du manifeste signé.
  const read = openEnvelope(JSON.stringify(signManifest(m, k.priv)), k.pub);
  assert.deepEqual(missedReleases(read, '0.1.0', 'fr'), [
    { version: '0.4.0', notes: ['quatre'] },
    { version: '0.3.0', notes: ['trois'] },
    { version: '0.2.0', notes: ['deux'] },
  ]);
  assert.deepEqual(missedReleases(read, '0.2.0', 'en'), [
    { version: '0.4.0', notes: ['four'] },
    { version: '0.3.0', notes: ['three'] },
  ]);
  // Un flux d'avant l'historique : la dernière version seule.
  const { history: _, ...old } = read;
  assert.deepEqual(missedReleases(old, '0.1.0', 'fr'), [{ version: '0.4.0', notes: ['quatre'] }]);
  // Un historique mal formé n'est même pas signé.
  assert.throws(() => signManifest({ ...m, history: [{ version: 'v2', notes: [] }] }, k.priv), /historique/);
  assert.throws(() => signManifest({ ...m, history: [{ version: '0.2.0', notes: 'deux' as unknown as string[] }] }, k.priv), /historique/);
});

test('suivi : une version plus récente que celle d’avant compte comme installée (installeur d’une publication rapide)', () => {
  const dir = temp();
  // Version d'avant la mise à jour légère : elle notait la version du flux (0.2.3), l'installeur a posé 0.2.0.
  recordPendingUpdate(dir, { from: '0.1.0', to: '0.2.3', started: new Date().toISOString(), installer: 'x.exe' });
  assert.deepEqual(takeUpdateOutcome(dir, '0.2.0'), { kind: 'installed', from: '0.1.0', to: '0.2.0' });
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Flux d'une publication rapide : paquet léger de 0.2.3, installeurs de la 0.2.0. */
function lightManifest(zip: Buffer, url: string, socle = 'electron-44.5.1-abc'): UpdateManifest {
  const m = manifestFor(Buffer.from('exe'), 'https://example.org/v0.2.0/CyberPinball-Setup.exe', '0.2.3');
  return {
    ...m,
    installer: { ...m.installer, version: '0.2.0' },
    app: { name: 'CyberPinball-application.zip', url, size: zip.length, sha256: createHash('sha256').update(zip).digest('hex'), socle },
  };
}

test('mise à jour légère ou installeur : selon le socle installé ; flux vérifié', () => {
  const k = keys();
  const m = lightManifest(Buffer.from('zip'), 'https://example.org/CyberPinball-application.zip');
  assert.deepEqual(openEnvelope(JSON.stringify(signManifest(m, k.priv)), k.pub), m);
  // Même socle : le paquet léger.
  assert.equal(updatePlan(m, '0.2.1', 'electron-44.5.1-abc').kind, 'light');
  // Autre socle, ou version sans socle : l'installeur de la 0.2.0, puis la mise à jour légère.
  assert.deepEqual(updatePlan(m, '0.1.0', 'electron-40.0.0-def'), { kind: 'installer', asset: m.installer, installs: '0.2.0', thenLight: true });
  assert.equal(updatePlan(m, '0.1.0', undefined).kind, 'installer');
  // L'installeur publié n'apporte rien de plus récent : ni l'un ni l'autre.
  assert.deepEqual(updatePlan(m, '0.2.1', 'electron-40.0.0-def'), { kind: 'none', installs: '0.2.0' });
  // Flux d'avant la mise à jour légère : l'installeur de la version du flux.
  const { app: _, ...old } = m;
  const oldInstaller = { ...m.installer, version: undefined };
  assert.deepEqual(updatePlan({ ...old, installer: oldInstaller }, '0.1.0', 'electron-44.5.1-abc'), { kind: 'installer', asset: oldInstaller, installs: '0.2.3', thenLight: false });
  // Un paquet ou une version d'installeur mal formés ne sont même pas signés.
  assert.throws(() => signManifest({ ...m, app: { ...m.app!, socle: '' } }, k.priv), /paquet de l’application/);
  assert.throws(() => signManifest({ ...m, app: { ...m.app!, name: 'app.exe' } }, k.priv), /paquet de l’application/);
  assert.throws(() => signManifest({ ...m, installer: { ...m.installer, version: 'v2' } }, k.priv), /version de l’installeur/);
});

test('socle installé : lu dans le package.json de l’application, absent sinon', () => {
  const dir = temp();
  assert.equal(installedSocle(dir), undefined);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  assert.equal(installedSocle(dir), undefined);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.2.0', cyberpinball: { socle: 'electron-44.5.1-abc' } }));
  assert.equal(installedSocle(dir), 'electron-44.5.1-abc');
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Paquet léger fabriqué comme par scripts/fabriquer.mjs (tar.exe de Windows). */
/** `withCode: false` : le bon numéro sans le code ni l'interface, comme la 0.1.13-essai.1 publiée incomplète. */
function makeAppPackage(dir: string, version: string, socle: string, withCode = true): Buffer {
  const src = path.join(dir, `src-${version}${withCode ? '' : '-sans-code'}`);
  fs.mkdirSync(path.join(src, 'natif'), { recursive: true });
  fs.writeFileSync(path.join(src, 'natif', 'plugin.cfg'), '');
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ version, cyberpinball: { socle } }));
  if (withCode) {
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(src, 'renderer'), { recursive: true });
    fs.writeFileSync(path.join(src, 'dist', 'main.js'), `// ${version}`);
    fs.writeFileSync(path.join(src, 'renderer', 'frontend.html'), '<!doctype html>');
  }
  const zip = path.join(dir, `app-${version}${withCode ? '' : '-sans-code'}.zip`);
  const run = spawnSync(windowsTar(), ['-a', '-c', '-f', zip, '-C', src, ...fs.readdirSync(src)]);
  assert.equal(run.status, 0, String(run.stderr));
  return fs.readFileSync(zip);
}

test('paquet léger : téléchargé à côté de l’installeur, déplié, refusé s’il ne contient pas la version annoncée', async () => {
  const dir = temp();
  const zip = makeAppPackage(dir, '0.2.3', 'electron-44.5.1-abc');
  const other = makeAppPackage(dir, '0.2.2', 'electron-44.5.1-abc');
  const site = await serve({ '/app.zip': zip, '/autre.zip': other });
  const downloads = path.join(dir, 'downloads');
  try {
    fs.mkdirSync(downloads);
    fs.writeFileSync(path.join(downloads, 'CyberPinball-Setup-0.2.0.exe'), 'installeur');
    fs.writeFileSync(path.join(downloads, 'CyberPinball-application-0.2.1.zip'), 'ancien paquet');
    const m = lightManifest(zip, `${site.url}/app.zip`);
    const file = await downloadAppPackage(m, downloads);
    assert.equal(path.basename(file), 'CyberPinball-application-0.2.3.zip');
    // Seul l'ancien paquet est retiré : l'installeur est d'une autre sorte.
    assert.deepEqual(fs.readdirSync(downloads).sort(), ['CyberPinball-Setup-0.2.0.exe', 'CyberPinball-application-0.2.3.zip']);
    const staged = stagedAppDir(downloads, m);
    unpackAppPackage(file, staged, m);
    assert.equal(fs.readFileSync(path.join(staged, 'dist', 'main.js'), 'utf8'), '// 0.2.3');

    // Un paquet d'une autre version (ou d'un autre socle) que le flux : effacé, jamais mis en place.
    const wrong = lightManifest(other, `${site.url}/autre.zip`);
    const wrongFile = await downloadAppPackage(wrong, downloads);
    assert.throws(() => unpackAppPackage(wrongFile, staged, wrong), /inutilisable/);
    assert.ok(!fs.existsSync(staged));
    assert.throws(() => unpackAppPackage(file, staged, { ...m, app: { ...m.app!, socle: 'electron-40.0.0-def' } }), /inutilisable/);

    // Le bon numéro, mais sans le code de l'application : refusé, et la raison dite telle quelle.
    const empty = makeAppPackage(dir, '0.2.3', 'electron-44.5.1-abc', false);
    const emptyFile = path.join(dir, 'sans-code.zip');
    fs.writeFileSync(emptyFile, empty);
    assert.throws(() => unpackAppPackage(emptyFile, staged, m), /code de l’application manque/);
    assert.ok(!fs.existsSync(staged));
  } finally {
    await site.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mise en place : l’application remplacée, l’ancienne retirée ; intacte en cas d’échec', async () => {
  const dir = temp();
  const appDir = path.join(dir, 'app', 'resources', 'app');
  const staged = path.join(dir, 'downloads', 'application-0.2.3');
  for (const [d, v] of [
    [appDir, '0.2.0'],
    [staged, '0.2.3'],
  ] as const) {
    fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: v }));
  }
  fs.writeFileSync(path.join(appDir, 'dist', 'ancien.js'), '');
  try {
    // Paquet absent : rien ne bouge.
    await assert.rejects(swapAppDir(appDir, path.join(dir, 'absent')), /introuvable/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version, '0.2.0');

    assert.equal(await swapAppDir(appDir, staged), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version, '0.2.3');
    assert.ok(!fs.existsSync(path.join(appDir, 'dist', 'ancien.js')), 'aucun fichier de l’ancienne version ne reste');
    assert.ok(!fs.existsSync(`${appDir}.precedente`));
    assert.ok(!fs.existsSync(staged));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('attente d’un processus : immédiate s’il est terminé, limitée sinon', async () => {
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.equal(await waitForExit(child.pid ?? 999_999, 1_000), true);
  const start = Date.now();
  assert.equal(await waitForExit(process.pid, 300), false);
  assert.ok(Date.now() - start >= 300);
});

test('préversions : réglage gardé ; flux de la release la plus récente, préversions comprises', async () => {
  const dir = temp();
  assert.equal(loadPrereleaseSetting(dir), false);
  savePrereleaseSetting(dir, true);
  assert.equal(loadPrereleaseSetting(dir), true);
  fs.writeFileSync(path.join(dir, 'preversions.json'), '{');
  assert.equal(loadPrereleaseSetting(dir), false);
  fs.rmSync(dir, { recursive: true, force: true });

  const k = keys();
  const feed = (version: string) => JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), 'https://example.org/x.exe', version), k.priv));
  const site = await serve({ '/v0.2.0/cyberpinball-maj.json': feed('0.2.0'), '/v0.3.0-essai.2/cyberpinball-maj.json': feed('0.3.0-essai.2') });
  const asset = (v: string) => [{ name: 'cyberpinball-maj.json', browser_download_url: `${site.url}/v${v}/cyberpinball-maj.json` }];
  const listed: Record<string, string> = {};
  const api = await serve(listed);
  const releasesUrl = `${api.url}/releases`;
  try {
    listed['/releases'] = JSON.stringify([
      { tag_name: 'v0.3.0-essai.1', draft: false, prerelease: true, assets: asset('0.3.0-essai.1') },
      { tag_name: 'v0.3.0-essai.2', draft: false, prerelease: true, assets: asset('0.3.0-essai.2') },
      { tag_name: 'v0.4.0', draft: true, prerelease: false, assets: asset('0.4.0') },
      { tag_name: 'v0.2.0', draft: false, prerelease: false, assets: asset('0.2.0') },
      { tag_name: 'v0.2.5', draft: false, prerelease: false, assets: [] },
    ]);
    assert.equal(await prereleaseFeedUrl({ releasesUrl }), `${site.url}/v0.3.0-essai.2/cyberpinball-maj.json`);
    const check = await checkForUpdate({ current: '0.2.0', prereleases: true, releasesUrl, publicKey: k.pub });
    assert.equal(check.status, 'available');
    assert.equal(check.latest.version, '0.3.0-essai.2');
    // La version finale publiée ensuite passe devant ses préversions.
    listed['/releases'] = JSON.stringify([{ tag_name: 'v0.3.0', draft: false, assets: asset('0.3.0') }]);
    assert.equal(await prereleaseFeedUrl({ releasesUrl }), `${site.url}/v0.3.0/cyberpinball-maj.json`);
    listed['/releases'] = '[]';
    await assert.rejects(prereleaseFeedUrl({ releasesUrl }), /Aucune version publiée/);
  } finally {
    await site.close();
    await api.close();
  }
});

test('mise à jour automatique au lancement : cochée par défaut ; elle et la source se gardent l’une l’autre', () => {
  const dir = temp();
  try {
    // Nouvelle installation, ou réglage d'une version qui ne la connaissait pas : cochée.
    assert.equal(loadAutoUpdate(dir), true);
    fs.writeFileSync(path.join(dir, 'preversions.json'), JSON.stringify({ preversions: true, source: 'preversions' }));
    assert.equal(loadAutoUpdate(dir), true);
    saveAutoUpdate(dir, false);
    assert.equal(loadAutoUpdate(dir), false);
    assert.equal(loadUpdateSource(dir), 'preversions', 'la source reste celle choisie');
    saveUpdateSource(dir, 'finales');
    assert.equal(loadAutoUpdate(dir), false, 'changer de source ne recoche pas la case');
    saveAutoUpdate(dir, true);
    assert.equal(loadAutoUpdate(dir), true);
    assert.equal(loadUpdateSource(dir), 'finales');
    // Fichier illisible : cochée, comme à l'installation.
    fs.writeFileSync(path.join(dir, 'preversions.json'), '{');
    assert.equal(loadAutoUpdate(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('source des mises à jour : finales par défaut, ancien réglage relu, essais sans canal = préversions', () => {
  const dir = temp();
  try {
    assert.equal(loadUpdateSource(dir), 'finales');
    // Réglage d'une version précédente : { preversions: true } seul.
    fs.writeFileSync(path.join(dir, 'preversions.json'), JSON.stringify({ preversions: true }));
    assert.equal(loadUpdateSource(dir), 'preversions');
    saveUpdateSource(dir, 'essais');
    assert.equal(loadUpdateSource(dir), 'essais');
    // Une version précédente relit « préversions reçues ».
    assert.equal(loadPrereleaseSetting(dir), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'preversions.json'), 'utf8')).preversions, true);
    saveUpdateSource(dir, 'finales');
    assert.equal(loadPrereleaseSetting(dir), false);
    fs.writeFileSync(path.join(dir, 'preversions.json'), JSON.stringify({ preversions: false, source: 'autre' }));
    assert.equal(loadUpdateSource(dir), 'finales');
    assert.equal(effectiveUpdateSource('essais', undefined), 'preversions');
    assert.equal(effectiveUpdateSource('essais', { repository: 'o/essais', token: 'x' }), 'essais');
    assert.equal(effectiveUpdateSource('finales', { repository: 'o/essais', token: 'x' }), 'finales');

    const file = path.join(dir, 'canal-essai.json');
    assert.equal(loadPrivateChannel(file), undefined);
    fs.writeFileSync(file, '﻿' + JSON.stringify({ depot: 'gocode/cyberpinball-essais', jeton: ' github_pat_abc ' }));
    assert.deepEqual(loadPrivateChannel(file), { repository: 'gocode/cyberpinball-essais', token: 'github_pat_abc' });
    fs.writeFileSync(file, JSON.stringify({ repository: 'o/r', token: 't', api: 'http://127.0.0.1:1/' }));
    assert.deepEqual(loadPrivateChannel(file), { repository: 'o/r', token: 't', api: 'http://127.0.0.1:1' });
    fs.writeFileSync(file, JSON.stringify({ depot: 'pas un dépôt', jeton: 't' }));
    assert.equal(loadPrivateChannel(file), undefined);
    fs.writeFileSync(file, JSON.stringify({ depot: 'o/r' }));
    assert.equal(loadPrivateChannel(file), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('canal d’essai privé : releases lues avec le jeton, la plus récente des deux dépôts, fichiers par l’API sans jeton hors de l’API', async () => {
  const k = keys();
  const zip = Buffer.from('paquet de l’application');
  const sha = createHash('sha256').update(zip).digest('hex');
  const tag = 'v0.3.0-essai.3';
  const browser = (name: string) => `https://github.com/o/essais/releases/download/${tag}/${name}`;
  const manifest: UpdateManifest = {
    ...manifestFor(Buffer.from('exe'), 'https://github.com/o/public/releases/download/v0.3.0-essai.1/CyberPinball-Setup.exe', '0.3.0-essai.3'),
    app: { name: 'CyberPinball-application.zip', url: browser('CyberPinball-application.zip'), size: zip.length, sha256: sha, socle: 's1' },
  };
  const publicFeed = (version: string) => JSON.stringify(signManifest(manifestFor(Buffer.from('exe'), 'https://example.org/x.exe', version), k.priv));
  // Stockage externe vers lequel l'API redirige : il refuse le jeton, comme celui de GitHub.
  const storageSeen: (string | undefined)[] = [];
  const storage = http.createServer((req, res) => {
    storageSeen.push(req.headers.authorization);
    if (req.headers.authorization) return void res.writeHead(400).end('jeton refusé');
    const body = req.url === '/feed' ? JSON.stringify(signManifest(manifest, k.priv)) : req.url === '/zip' ? zip : undefined;
    if (body === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': Buffer.byteLength(body) }).end(body);
  });
  await new Promise<void>((resolve) => storage.listen(0, '127.0.0.1', () => resolve()));
  const storageUrl = `http://127.0.0.1:${(storage.address() as AddressInfo).port}`;
  let publicReleases: unknown[] = [];
  const apiSeen: { url: string; auth?: string }[] = [];
  const api = http.createServer((req, res) => {
    apiSeen.push({ url: req.url ?? '', auth: req.headers.authorization });
    const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    if (req.url === '/repos/o/public/releases?per_page=30') return void res.writeHead(200).end(JSON.stringify(publicReleases));
    if (req.url?.startsWith('/public/')) return void res.writeHead(200).end(publicFeed(req.url.split('/')[2] ?? ''));
    if (req.headers.authorization !== 'Bearer bon-jeton') return void res.writeHead(401).end('{"message":"Bad credentials"}');
    if (req.url === '/repos/o/essais/releases?per_page=30') {
      return void res.writeHead(200).end(
        JSON.stringify([
          {
            tag_name: tag,
            draft: false,
            assets: [
              { name: 'cyberpinball-maj.json', url: `${base}/repos/o/essais/releases/assets/11`, browser_download_url: browser('cyberpinball-maj.json') },
              { name: 'CyberPinball-application.zip', url: `${base}/repos/o/essais/releases/assets/12`, browser_download_url: browser('CyberPinball-application.zip') },
            ],
          },
        ]),
      );
    }
    if (req.headers.accept !== 'application/octet-stream') return void res.writeHead(415).end();
    if (req.url === '/repos/o/essais/releases/assets/11') return void res.writeHead(302, { location: `${storageUrl}/feed` }).end();
    if (req.url === '/repos/o/essais/releases/assets/12') return void res.writeHead(302, { location: `${storageUrl}/zip` }).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', () => resolve()));
  const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const releasesUrl = `${apiUrl}/repos/o/public/releases?per_page=30`;
  const publicAsset = (v: string) => [{ name: 'cyberpinball-maj.json', browser_download_url: `${apiUrl}/public/${v}` }];
  const channel = { repository: 'o/essais', token: 'bon-jeton', api: apiUrl };
  const dir = temp();
  try {
    publicReleases = [{ tag_name: 'v0.3.0-essai.2', draft: false, assets: publicAsset('0.3.0-essai.2') }];
    // Sans canal : les préversions publiques seules.
    assert.equal((await checkForUpdate({ current: '0.2.0', prereleases: true, releasesUrl, publicKey: k.pub })).latest.version, '0.3.0-essai.2');
    // Avec le canal : l'essai privé, plus récent, et son paquet désigné par l'API.
    const check = await checkForUpdate({ current: '0.2.0', prereleases: true, channel, releasesUrl, publicKey: k.pub });
    assert.equal(check.status, 'available');
    assert.equal(check.latest.version, '0.3.0-essai.3');
    assert.equal(check.latest.app?.url, `${apiUrl}/repos/o/essais/releases/assets/12`);
    // L'installeur d'une autre release (dépôt public) garde son adresse.
    assert.equal(check.latest.installer.url, manifest.installer.url);
    const file = await downloadAppPackage(check.latest, dir, { fetch: channelFetch(channel) });
    assert.deepEqual(fs.readFileSync(file), zip);
    // Le jeton va à l'API du dépôt privé, jamais au stockage ni au dépôt public.
    assert.ok(storageSeen.length >= 2 && storageSeen.every((a) => a === undefined));
    assert.ok(apiSeen.filter((r) => r.url.includes('/o/essais/')).every((r) => r.auth === 'Bearer bon-jeton'));
    assert.ok(apiSeen.filter((r) => !r.url.includes('/o/essais/')).every((r) => r.auth === undefined));

    // Une version publique plus récente passe devant l'essai privé.
    publicReleases = [{ tag_name: 'v0.3.0', draft: false, assets: publicAsset('0.3.0') }];
    assert.equal((await checkForUpdate({ current: '0.2.0', channel, releasesUrl, publicKey: k.pub })).latest.version, '0.3.0');

    // Jeton refusé : une erreur qui le dit, jamais un repli silencieux.
    await assert.rejects(checkForUpdate({ current: '0.2.0', channel: { ...channel, token: 'mauvais' }, releasesUrl, publicKey: k.pub }), /Canal d’essai o\/essais illisible.*HTTP 401/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await new Promise((resolve) => api.close(resolve));
    await new Promise((resolve) => storage.close(resolve));
  }
});
