// Installer Firefox depuis Cyber Pinball (app/src/firefox-install.ts) : l'installateur officiel de
// Mozilla, signature Authenticode vérifiée avant tout lancement, mode silencieux ; winget en second
// recours ; chaque échec avec sa raison. Ici, sans réseau ni installation : téléchargement simulé,
// lancement remplacé. La lecture de signature est éprouvée sur de vrais fichiers de Windows (signés par
// Microsoft : refusés) et, s'il est là, de Mozilla Thunderbird (signé par Mozilla : accepté).

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import { FIREFOX_DOWNLOAD_URL, firefoxExePaths, isGoogleSignIn, mozillaSigned } from '../youtube-account';

setLanguage('fr');

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');
const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-firefox-'));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

type Result = { ok: true; exe: string } | { ok: false; reason: string };
interface Installer {
  install(progress?: (p: { phase: string; received?: number; total?: number }) => void): Promise<Result>;
}
const { createFirefoxInstaller, mozillaSignature } = require(path.join(APP_DIST, 'firefox-install.js')) as {
  createFirefoxInstaller(o: object): Installer;
  mozillaSignature(file: string): Promise<{ ok: boolean; detail: string }>;
};

/** Faux serveur de Mozilla : un « installateur » de quelques octets, avec sa taille. */
const fakeFetch = (seen: string[]) => (async (url: string) => {
  seen.push(String(url));
  return new Response(new Uint8Array(4096).fill(7), { status: 200, headers: { 'content-length': '4096' } });
}) as unknown as typeof fetch;

test('Firefox : installateur officiel de Mozilla en HTTPS, Firefox cherché à ses deux places', () => {
  assert.equal(new URL(FIREFOX_DOWNLOAD_URL).protocol, 'https:');
  assert.equal(new URL(FIREFOX_DOWNLOAD_URL).hostname, 'download.mozilla.org');
  assert.match(FIREFOX_DOWNLOAD_URL, /os=win64/);
  assert.match(FIREFOX_DOWNLOAD_URL, /lang=fr/);
  assert.deepEqual(firefoxExePaths({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'D:\\Comptes\\Local' }), ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'D:\\Comptes\\Local\\Mozilla Firefox\\firefox.exe']);
});

test('signature : valide et éditée par Mozilla Corporation, rien d’autre', () => {
  assert.equal(mozillaSigned('Valid|CN=Mozilla Corporation, OU=Firefox Engineering Operations, O=Mozilla Corporation, L=San Francisco, S=California, C=US'), true);
  assert.equal(mozillaSigned('Valid|CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'), false);
  assert.equal(mozillaSigned('HashMismatch|CN=Mozilla Corporation, O=Mozilla Corporation, C=US'), false, 'fichier modifié après signature');
  assert.equal(mozillaSigned('NotSigned|'), false);
  assert.equal(mozillaSigned('Valid|CN=Mozilla Corporation, O=Mozilla Corporation Fake Ltd, C=US'), false, 'un autre éditeur au nom approchant');
});

test('page de connexion de Google : reconnue, et elle seule', () => {
  assert.equal(isGoogleSignIn('https://accounts.google.com/ServiceLogin?service=youtube'), true);
  assert.equal(isGoogleSignIn('https://ACCOUNTS.google.com/v3/signin/identifier'), true);
  assert.equal(isGoogleSignIn('https://www.youtube.com/'), false);
  assert.equal(isGoogleSignIn('https://accounts.google.com.example.com/'), false);
  assert.equal(isGoogleSignIn('pas une adresse'), false);
});

test('installation : signature refusée, l’installateur n’est jamais lancé et il est effacé', async () => {
  const root = tmp();
  const seen: string[] = [];
  const launched: string[] = [];
  const installer = createFirefoxInstaller({
    root: () => root,
    fetch: fakeFetch(seen),
    verify: async () => ({ ok: false, detail: 'NotSigned|' }),
    runInstaller: async (file: string) => (launched.push(file), 0),
    find: () => undefined,
  });
  const r = await installer.install();
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /n’est pas signé par Mozilla : il est effacé, rien n’a été lancé/);
  assert.deepEqual(launched, []);
  assert.deepEqual(seen, [FIREFOX_DOWNLOAD_URL]);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tools', 'firefox')), [], 'rien ne reste sur le disque');
});

test('installation : signée par Mozilla, lancée en silence, Firefox trouvé ; progression relevée', async () => {
  const root = tmp();
  let installedAt: string | undefined;
  const phases: string[] = [];
  const installer = createFirefoxInstaller({
    root: () => root,
    fetch: fakeFetch([]),
    verify: async () => ({ ok: true, detail: 'Valid|O=Mozilla Corporation' }),
    runInstaller: async (file: string) => {
      assert.ok(fs.existsSync(file), 'lancé sur le fichier vérifié');
      installedAt = path.join(root, 'Mozilla Firefox', 'firefox.exe');
      return 0;
    },
    find: () => installedAt,
  });
  const r = await installer.install((p) => phases.at(-1) !== p.phase && phases.push(p.phase));
  assert.deepEqual(r, { ok: true, exe: path.join(root, 'Mozilla Firefox', 'firefox.exe') });
  assert.deepEqual(phases, ['download', 'verify', 'install']);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tools', 'firefox')), [], 'installateur effacé');
});

test('installation : refusée par Windows, ou sans réseau et sans winget, la raison en clair', async () => {
  const refused = createFirefoxInstaller({ root: tmp, fetch: fakeFetch([]), verify: async () => ({ ok: true, detail: '' }), runInstaller: async () => 1223, find: () => undefined });
  assert.match(((await refused.install()) as { reason: string }).reason, /Windows n’a pas autorisé l’installation/);
  const offline = createFirefoxInstaller({
    root: tmp,
    fetch: (async () => {
      throw new Error('getaddrinfo ENOTFOUND download.mozilla.org');
    }) as unknown as typeof fetch,
    winget: async () => undefined,
    find: () => undefined,
  });
  assert.match(((await offline.install()) as { reason: string }).reason, /n’a pas pu être téléchargé \(getaddrinfo ENOTFOUND download\.mozilla\.org\), et winget n’est pas sur ce PC/);
  // Sans réseau vers Mozilla mais avec winget : winget installe.
  let viaWinget: string | undefined;
  const winget = createFirefoxInstaller({
    root: tmp,
    fetch: (async () => {
      throw new Error('hors ligne');
    }) as unknown as typeof fetch,
    winget: async () => ((viaWinget = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'), 0),
    find: () => viaWinget,
  });
  assert.deepEqual(await winget.install(), { ok: true, exe: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe' });
});

test('signature lue par Windows : un fichier de Microsoft est refusé, un fichier de Mozilla accepté', { skip: process.platform !== 'win32' && 'Windows requis' }, async () => {
  const microsoft = await mozillaSignature(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'));
  assert.equal(microsoft.ok, false, microsoft.detail);
  assert.match(microsoft.detail, /^Valid\|.*O=Microsoft Corporation/);
  const thunderbird = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Mozilla Thunderbird', 'thunderbird.exe');
  if (fs.existsSync(thunderbird)) assert.equal((await mozillaSignature(thunderbird)).ok, true);
});
