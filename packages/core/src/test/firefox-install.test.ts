// Installer Firefox depuis Cyber Pinball (app/src/firefox-install.ts) : le paquet MSIX officiel de
// Mozilla, signature vérifiée avant toute installation, inscrit pour le compte seul, SANS demande
// d'autorisation de Windows (la borne ne peut pas y répondre : PinCab, 10/11/2026) ; chaque échec avec
// sa raison. Ici, sans réseau ni installation : téléchargement simulé, inscription remplacée. La lecture
// de signature est éprouvée sur de vrais fichiers de Windows (Microsoft : refusé) et, s'il est là, de
// Mozilla Thunderbird (Mozilla : accepté).

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import { browserCookiesArgs, FIREFOX_DOWNLOAD_URL, firefoxExePaths, isGoogleSignIn, mozillaSigned } from '../youtube-account';
import { REPO_ROOT } from './i18n-scan';

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

type Result = { ok: true } | { ok: false; reason: string };
interface Installer {
  install(progress?: (p: { phase: string; received?: number; total?: number }) => void): Promise<Result>;
}
const { createFirefoxInstaller, mozillaSignature } = require(path.join(APP_DIST, 'firefox-install.js')) as {
  createFirefoxInstaller(o: object): Installer;
  mozillaSignature(file: string): Promise<{ ok: boolean; detail: string }>;
};

/** Faux serveur de Mozilla : un « paquet » de quelques octets, avec sa taille. */
const fakeFetch = (seen: string[]) => (async (url: string) => {
  seen.push(String(url));
  return new Response(new Uint8Array(4096).fill(7), { status: 200, headers: { 'content-length': '4096' } });
}) as unknown as typeof fetch;

test('Firefox : paquet MSIX officiel de Mozilla en HTTPS, installation classique cherchée aussi', () => {
  assert.equal(new URL(FIREFOX_DOWNLOAD_URL).protocol, 'https:');
  assert.equal(new URL(FIREFOX_DOWNLOAD_URL).hostname, 'download.mozilla.org');
  assert.match(FIREFOX_DOWNLOAD_URL, /product=firefox-msix-latest-ssl/);
  assert.match(FIREFOX_DOWNLOAD_URL, /os=win64/);
  assert.deepEqual(firefoxExePaths({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'D:\\Comptes\\Local' }), ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'D:\\Comptes\\Local\\Mozilla Firefox\\firefox.exe']);
});

test('installation sans élévation : jamais d’autorisation de Windows demandée (UAC)', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'firefox-install.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /RunAs|runas|Start-Process|winget|shell\.openExternal|openPath/i, 'ni élévation, ni installateur classique, ni winget');
  assert.match(source, /Add-AppxPackage/);
});

test('yt-dlp lit le profil du paquet MSIX de Firefox, que son %APPDATA% redirige', () => {
  const profiles = 'D:\\Comptes\\Local\\Packages\\Mozilla.MozillaFirefox_abc\\LocalCache\\Roaming\\Mozilla\\Firefox';
  const args = browserCookiesArgs('firefox', 'sortie.txt', undefined, profiles);
  assert.equal(args[args.indexOf('--cookies-from-browser') + 1], `firefox:${profiles}`);
  const classic = browserCookiesArgs('firefox', 'sortie.txt');
  assert.equal(classic[classic.indexOf('--cookies-from-browser') + 1], 'firefox');
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

test('installation : signature refusée, rien n’est inscrit et le fichier est effacé', async () => {
  const root = tmp();
  const seen: string[] = [];
  const added: string[] = [];
  const installer = createFirefoxInstaller({
    root: () => root,
    fetch: fakeFetch(seen),
    verify: async () => ({ ok: false, detail: 'NotSigned|' }),
    addPackage: async (file: string) => (added.push(file), { code: 0, detail: '' }),
    installed: () => false,
  });
  const r = await installer.install();
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /n’est pas signé par Mozilla : il est effacé, rien n’a été installé/);
  assert.deepEqual(added, []);
  assert.deepEqual(seen, [FIREFOX_DOWNLOAD_URL]);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tools', 'firefox')), [], 'rien ne reste sur le disque');
});

test('installation : signée par Mozilla, inscrite pour le compte, Firefox trouvé ; progression relevée', async () => {
  const root = tmp();
  let present = false;
  const phases: string[] = [];
  const installer = createFirefoxInstaller({
    root: () => root,
    fetch: fakeFetch([]),
    verify: async () => ({ ok: true, detail: 'Valid|O=Mozilla Corporation' }),
    addPackage: async (file: string) => {
      assert.ok(fs.existsSync(file) && file.endsWith('.msix'), 'inscrit à partir du paquet vérifié');
      present = true;
      return { code: 0, detail: '' };
    },
    installed: () => present,
  });
  const r = await installer.install((p) => phases.at(-1) !== p.phase && phases.push(p.phase));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(phases, ['download', 'verify', 'install']);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tools', 'firefox')), [], 'paquet effacé');
});

test('installation : refusée par Windows, sans fin, ou sans réseau : la raison en clair', async () => {
  const base = { root: tmp, fetch: fakeFetch([]), verify: async () => ({ ok: true, detail: '' }), installed: () => false };
  const refused = createFirefoxInstaller({ ...base, addPackage: async () => ({ code: 1, detail: 'Le déploiement a échoué : 0x80073CF9' }) });
  assert.match(((await refused.install()) as { reason: string }).reason, /^Windows a refusé d’installer Firefox : Le déploiement a échoué : 0x80073CF9$/);
  const endless = createFirefoxInstaller({ ...base, addPackage: async () => ({ code: -2, detail: '' }) });
  assert.match(((await endless.install()) as { reason: string }).reason, /Windows n’a pas fini d’installer Firefox en 5 minutes : Cyber Pinball n’attend plus/);
  const offline = createFirefoxInstaller({
    root: tmp,
    fetch: (async () => {
      throw new Error('getaddrinfo ENOTFOUND download.mozilla.org');
    }) as unknown as typeof fetch,
    installed: () => false,
  });
  assert.match(((await offline.install()) as { reason: string }).reason, /n’a pas pu être téléchargé \(getaddrinfo ENOTFOUND download\.mozilla\.org\) : vérifiez la connexion à Internet/);
});

test('signature lue par Windows : un fichier de Microsoft est refusé, un fichier de Mozilla accepté', { skip: process.platform !== 'win32' && 'Windows requis' }, async () => {
  const microsoft = await mozillaSignature(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'));
  assert.equal(microsoft.ok, false, microsoft.detail);
  assert.match(microsoft.detail, /^Valid\|.*O=Microsoft Corporation/);
  const thunderbird = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Mozilla Thunderbird', 'thunderbird.exe');
  if (fs.existsSync(thunderbird)) assert.equal((await mozillaSignature(thunderbird)).ok, true);
});

test('« Ouvrir dans mon navigateur » : Firefox par son chemin d’abord, jamais le choix du navigateur par défaut de Windows', () => {
  // PinCab, 10/11/2026 : juste après l'installation de Firefox, shell.openExternal faisait demander à
  // Windows de choisir le navigateur par défaut, à la souris.
  const acquire = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'acquire-window.ts'), 'utf8');
  const line = acquire.split(/\r?\n/).find((l) => l.includes("action === 'browser'")) ?? '';
  assert.match(line, /openInFirefox\(.*\) \|\| void shell\.openExternal\(/, line);
  const install = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'firefox-install.ts'), 'utf8');
  assert.match(install, /export function openInFirefox\(url: string\): boolean \{[\s\S]*?spawn\(exe, \['-new-window', url\]/);
});
