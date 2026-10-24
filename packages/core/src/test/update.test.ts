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
  checkForUpdate,
  compareAppVersions,
  downloadAppPackage,
  downloadUpdate,
  installedSocle,
  loadPrereleaseSetting,
  missedReleases,
  prereleaseFeedUrl,
  openEnvelope,
  recordPendingUpdate,
  relaunchArguments,
  releaseAssetUrl,
  savePrereleaseSetting,
  signManifest,
  stagedAppDir,
  swapAppDir,
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
  await assert.rejects(checkForUpdate({ current: '0.1.0', feedUrl: 'http://127.0.0.1:9/maj.json', publicKey: k.pub }), /connectée à Internet/);
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
  recordPendingUpdate(dir, { from: '0.1.0', to: '0.2.0', started: new Date().toISOString(), installer: 'x.exe' });
  assert.deepEqual(takeUpdateOutcome(dir, '0.1.0'), { kind: 'failed', from: '0.1.0', to: '0.2.0', current: '0.1.0' });
  fs.writeFileSync(path.join(dir, 'mise-a-jour.json'), '{');
  assert.equal(takeUpdateOutcome(dir, '0.1.0'), undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'mise-a-jour.json')));
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
function makeAppPackage(dir: string, version: string, socle: string): Buffer {
  const src = path.join(dir, `src-${version}`);
  fs.mkdirSync(path.join(src, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ version, cyberpinball: { socle } }));
  fs.writeFileSync(path.join(src, 'dist', 'main.js'), `// ${version}`);
  const zip = path.join(dir, `app-${version}.zip`);
  const run = spawnSync(windowsTar(), ['-a', '-c', '-f', zip, '-C', src, 'package.json', 'dist']);
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
