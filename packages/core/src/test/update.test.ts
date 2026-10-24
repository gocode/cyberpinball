import assert from 'node:assert/strict';
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
  downloadUpdate,
  openEnvelope,
  recordPendingUpdate,
  relaunchArguments,
  releaseAssetUrl,
  signManifest,
  takeUpdateOutcome,
  updateFeedUrl,
  updateInstallerArguments,
  updatePublicKey,
  UPDATE_REPOSITORY,
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
