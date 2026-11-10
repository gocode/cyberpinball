// Compte YouTube du Juke-box (youtube-account.ts) : connexion dans un vrai Microsoft Edge, cookies
// relus par Edge et triés, état de connexion, fichier Netscape pour yt-dlp, playlists du compte,
// recherche filtrée. Et les invariants qui gardent la connexion honnête et sur le bon écran : aucun
// port de débogage pendant la connexion, Edge posé sur l'écran demandé, cookies de Microsoft exclus.
// Le service de la borne (app/src/youtube-account.ts, edge-login.ts) passe par un faux Edge.
// Cookies, comptes et playlists entièrement fictifs : aucune valeur réelle.

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import {
  accountCookies,
  accountPlaylistsArgs,
  EDGE_PROFILE_DIR,
  edgeExePaths,
  edgeLoginArgs,
  edgeReadArgs,
  isGoogleDomain,
  isYoutubeAccountDomain,
  netscapeCookies,
  parseAccountPlaylists,
  parseDevToolsActivePort,
  youtubeCookieState,
  youtubePlaylistSearchUrl,
  type CdpCookie,
  type CookieRecord,
} from '../youtube-account';

setLanguage('fr');

const NOW = new Date('2026-11-10T12:00:00Z');
const LATER = NOW.getTime() / 1000 + 400 * 86400;
const fake = (name: string, domain = '.youtube.com', extra: Partial<CookieRecord> = {}): CookieRecord => ({ name, value: `valeur-fictive-${name}`, domain, path: '/', secure: true, expirationDate: LATER, ...extra });

test('Edge : trouvé aux emplacements connus, installation système d’abord', () => {
  const paths = edgeExePaths({ 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'D:\\Profil\\AppData\\Local\\' });
  assert.deepEqual(paths, [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'D:\\Profil\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe',
  ]);
  assert.deepEqual(edgeExePaths({}), []);
});

// Invariant : pendant la connexion, Edge est un navigateur que personne ne pilote. Aucun port de
// débogage ni drapeau d'automatisation (Google refuserait, et ce serait le tromper). Le port ne
// s'ouvre qu'Edge refermé, sans fenêtre, sur 127.0.0.1, le temps de relire les cookies.
test('Edge : la connexion sans port de débogage, sur l’écran demandé ; la lecture sans fenêtre, en local', () => {
  const login = edgeLoginArgs('D:\\Borne\\data\\edge-youtube', { x: -1080.4, y: 0, width: 1080, height: 1919.6 });
  for (const a of login) assert.doesNotMatch(a, /remote-debugging|enable-automation|headless|user-agent|disable-blink-features/i, a);
  assert.ok(login.includes('--user-data-dir=D:\\Borne\\data\\edge-youtube'));
  assert.ok(login.includes('--window-position=-1080,0'));
  assert.ok(login.includes('--window-size=1080,1920'));
  assert.ok(login.some((a) => a.startsWith('--app=https://accounts.google.com/')));
  // Jamais connecté en douce au compte Microsoft de Windows.
  assert.ok(login.some((a) => a.startsWith('--disable-features=') && a.includes('msImplicitSignin')));
  const read = edgeReadArgs('D:\\Borne\\data\\edge-youtube');
  assert.ok(read.includes('--headless=new'));
  assert.ok(read.includes('--remote-debugging-port=0'));
  assert.ok(read.includes('--remote-debugging-address=127.0.0.1'));
  assert.equal(read.at(-1), 'about:blank');
  assert.equal(EDGE_PROFILE_DIR, 'edge-youtube');
});

test('Edge : port de lecture relu dans DevToolsActivePort, refusé s’il est illisible', () => {
  assert.deepEqual(parseDevToolsActivePort('53124\r\n/devtools/browser/0b1c-fictif\r\n'), { port: 53124, path: '/devtools/browser/0b1c-fictif' });
  assert.equal(parseDevToolsActivePort(''), undefined);
  assert.equal(parseDevToolsActivePort('abc\n/devtools/browser/x'), undefined);
  assert.equal(parseDevToolsActivePort('70000\n/devtools/browser/x'), undefined);
  assert.equal(parseDevToolsActivePort('9222\n/json'), undefined);
});

// Essai du 10/11/2026 : un profil d'Edge neuf se connecte tout seul au compte Microsoft de Windows
// (cookies de msn.com). Seuls ceux de YouTube et de Google sont gardés.
test('cookies d’Edge : ceux de YouTube et de Google seulement, au format gardé', () => {
  const all: CdpCookie[] = [
    { name: 'SID', value: 'fictif-1', domain: '.youtube.com', path: '/', expires: LATER, secure: true },
    { name: 'YSC', value: 'fictif-2', domain: '.youtube.com', path: '/', expires: -1, session: true, httpOnly: true },
    { name: 'NID', value: 'fictif-3', domain: '.google.fr', path: '/', expires: LATER },
    { name: 'lt', value: 'fictif-4', domain: '.msn.com', path: '/', expires: LATER },
    { name: 'MUID', value: 'fictif-5', domain: '.bing.com', path: '/', expires: LATER },
    { name: 'VIDE', value: '', domain: '.youtube.com' },
  ];
  assert.deepEqual(accountCookies(all), [
    { name: 'SID', value: 'fictif-1', domain: '.youtube.com', path: '/', secure: true, expirationDate: Math.floor(LATER) },
    { name: 'YSC', value: 'fictif-2', domain: '.youtube.com', path: '/', httpOnly: true },
    { name: 'NID', value: 'fictif-3', domain: '.google.fr', path: '/', expirationDate: Math.floor(LATER) },
  ]);
});

test('compte YouTube : connecté seulement avec une session et la clé de l’API', () => {
  assert.deepEqual(youtubeCookieState([fake('VISITOR_INFO1_LIVE'), fake('YSC', '.youtube.com', { expirationDate: undefined }), fake('PREF')], NOW), { connected: false });
  assert.equal(youtubeCookieState([fake('SID')], NOW).connected, false);
  assert.equal(youtubeCookieState([fake('SAPISID')], NOW).connected, false);
  // Les cookies de Google seuls ne suffisent pas : yt-dlp lit ceux de youtube.com.
  assert.equal(youtubeCookieState([fake('SID', '.google.com'), fake('SAPISID', '.google.com')], NOW).connected, false);
  const soon = NOW.getTime() / 1000 + 30 * 86400;
  const state = youtubeCookieState([fake('__Secure-3PSID'), fake('__Secure-3PAPISID', '.youtube.com', { expirationDate: soon }), fake('PREF')], NOW);
  assert.equal(state.connected, true);
  assert.equal(state.expires?.getTime(), soon * 1000);
  assert.equal(youtubeCookieState([fake('SID', '.youtube.com', { expirationDate: NOW.getTime() / 1000 - 1 }), fake('SAPISID')], NOW).connected, false);
  assert.equal(youtubeCookieState([fake('SID', '.youtube.com', { value: '' }), fake('SAPISID')], NOW).connected, false);
});

test('compte YouTube : domaines du compte (YouTube et Google, régionaux compris), rien d’autre', () => {
  for (const d of ['.youtube.com', 'www.youtube.com', 'm.youtube.com', '.google.com', 'accounts.google.com', '.google.fr', '.google.co.uk']) assert.equal(isYoutubeAccountDomain(d), true, d);
  for (const d of ['.vpuniverse.com', 'exemple.test', 'notgoogle.com', 'google.com.exemple.test', 'youtube.com.exemple.test', '.msn.com', '.microsoft.com']) assert.equal(isYoutubeAccountDomain(d), false, d);
  assert.equal(isGoogleDomain('.google.de'), true);
});

test('fichier de cookies Netscape : écrit pour yt-dlp', () => {
  const cookies: CookieRecord[] = [
    fake('SID'),
    { name: 'LOGIN_INFO', value: 'jeton:fictif', domain: 'www.youtube.com', path: '/', secure: true, httpOnly: true, expirationDate: LATER },
    { name: 'YSC', value: 'session-fictive', domain: '.youtube.com', path: '/', secure: true, httpOnly: true },
    { name: 'CASSE', value: 'avec\ttabulation', domain: '.youtube.com' },
  ];
  const text = netscapeCookies(cookies);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], '# Netscape HTTP Cookie File');
  assert.ok(lines.includes(`.youtube.com\tTRUE\t/\tTRUE\t${Math.floor(LATER)}\tSID\tvaleur-fictive-SID`));
  assert.ok(lines.includes(`#HttpOnly_www.youtube.com\tFALSE\t/\tTRUE\t${Math.floor(LATER)}\tLOGIN_INFO\tjeton:fictif`));
  assert.ok(lines.includes('#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tYSC\tsession-fictive'));
  assert.ok(!text.includes('CASSE'));
});

test('playlists du compte : J’aime et À regarder plus tard en tête, puis celles du compte, sans doublon', () => {
  const json = {
    entries: [
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=PLexempleCompte0001', title: 'Néon nocturne', playlist_count: 21, thumbnails: [{ url: 'https://i.ytimg.com/a.jpg' }, { url: 'https://i.ytimg.com/b.jpg' }] },
      { _type: 'url', id: 'PLexempleCompte0002', title: '  ' },
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=PLexempleCompte0001', title: 'Doublon' },
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=WL', title: 'Watch later' },
      'pas une entrée',
    ],
  };
  const lists = parseAccountPlaylists(json);
  assert.deepEqual(lists.map((p) => [p.list, p.title, p.count, p.personal]), [
    ['LL', 'Vidéos « J’aime »', undefined, true],
    ['WL', 'À regarder plus tard', undefined, true],
    ['PLexempleCompte0001', 'Néon nocturne', 21, undefined],
    ['PLexempleCompte0002', 'PLexempleCompte0002', undefined, undefined],
  ]);
  assert.equal(lists[2]!.thumbnail, 'https://i.ytimg.com/b.jpg');
  assert.equal(parseAccountPlaylists(undefined).length, 2);
});

test('yt-dlp : cookies passés par fichier, jamais en clair sur la ligne de commande', () => {
  const args = accountPlaylistsArgs('C:\\Temp\\cyberpinball-cookies\\c.txt', 'node.exe');
  assert.deepEqual(args.slice(-4), ['--cookies', 'C:\\Temp\\cyberpinball-cookies\\c.txt', '--', 'https://www.youtube.com/feed/playlists']);
});

test('recherche de playlists sur YouTube : filtre « Playlists », accueil sans texte', () => {
  assert.equal(youtubePlaylistSearchUrl('synthwave années 80'), 'https://www.youtube.com/results?search_query=synthwave+ann%C3%A9es+80&sp=EgIQAw%3D%3D');
  assert.equal(youtubePlaylistSearchUrl('  '), 'https://www.youtube.com/');
});

// ---------------------------------------------------------------------------
// Service de la borne (app/src) avec un faux Edge : un petit programme qui imite msedge.exe (fenêtre de
// connexion qui se ferme, puis lecture sans fenêtre : DevToolsActivePort et Storage.getCookies).

const APP_DIST = path.resolve(__dirname, '../../../../app/dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-edge-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

interface FakeOps {
  calls: string[];
}

type Rect = { x: number; y: number; width: number; height: number };
interface Session {
  shown: Promise<boolean>;
  done: Promise<{ connected: boolean }>;
  type(text: string): void;
  key(k: string, mods?: { shift?: boolean }): void;
  set(v: string): void;
}
type Result<T> = ({ ok: true } & T) | { ok: false; reason: string };
interface AccountApi {
  refresh(): Promise<{ connected: boolean }>;
  state(): { connected: boolean; signingIn?: boolean };
  edgeMissing(): string | undefined;
  signIn(at: Rect): Result<{ session: Session }>;
  playlists(): Promise<Result<{ lists: { list: string }[] }>>;
  signOut(): Promise<void>;
}
type RunResult = { ok: true; code: number; stdout: string; lines: string[] } | { ok: false; reason: string };
type CreateAccount = (o: { dataDir(): string; tempDir?: string; edge?: object; log?(l: string): void; ytdlp: { run(args: string[]): Promise<RunResult> } }) => AccountApi;
type CreateLogin = (o: object) => { open(at: Rect): Session | undefined };

/**
 * Faux msedge.exe : un script Node lancé par un .cmd. Connexion : écrit « Local State » et le
 * fichier de cookies voulu, puis attend d'être fermé. Lecture (--headless) : ouvre un serveur
 * WebSocket minimal sur 127.0.0.1 qui rend ces cookies à Storage.getCookies.
 */
function fakeEdge(cookies: CdpCookie[]): { edgeExe: () => string; argsPrefix: string[] } {
  const script = path.join(tmp, 'faux-edge.cjs');
  fs.writeFileSync(path.join(tmp, 'cookies.json'), JSON.stringify(cookies));
  fs.writeFileSync(
    script,
    String.raw`
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const args = process.argv.slice(2);
const profile = args.find((a) => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
fs.appendFileSync(path.join(${JSON.stringify(tmp)}, 'appels.txt'), args.join(' ') + '\n');
fs.mkdirSync(profile, { recursive: true });
if (!args.includes('--headless=new')) {
  fs.writeFileSync(path.join(profile, 'Local State'), '{}');
  setTimeout(() => process.exit(0), 300);
  return;
}
const cookies = JSON.parse(fs.readFileSync(path.join(${JSON.stringify(tmp)}, 'cookies.json'), 'utf8'));
const server = http.createServer();
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const send = (obj) => {
    const body = Buffer.from(JSON.stringify(obj));
    const head = body.length < 126 ? Buffer.from([0x81, body.length]) : body.length < 65536 ? Buffer.from([0x81, 126, body.length >> 8, body.length & 255]) : null;
    socket.write(Buffer.concat([head, body]));
  };
  socket.on('data', (buf) => {
    let len = buf[1] & 127, at = 2;
    if (len === 126) { len = buf.readUInt16BE(2); at = 4; }
    const mask = buf.subarray(at, at + 4), data = buf.subarray(at + 4, at + 4 + len);
    const msg = JSON.parse(Buffer.from(data.map((b, i) => b ^ mask[i % 4])).toString());
    if (msg.method === 'Storage.getCookies') send({ id: msg.id, result: { cookies } });
    if (msg.method === 'Browser.close') { send({ id: msg.id, result: {} }); setTimeout(() => process.exit(0), 50); }
  });
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), server.address().port + '\n/devtools/browser/faux\n'));
setTimeout(() => process.exit(1), 15000);
`,
  );
  return { edgeExe: () => process.execPath, argsPrefix: [script] };
}

function fakeOps(log: FakeOps) {
  return {
    find: () => ({ id: 'fenêtre' }),
    rect: () => ({ x: 0, y: 0, width: 1080, height: 1920 }),
    place: (_w: unknown, at: { x: number; y: number; width: number; height: number }) => log.calls.push(`place ${at.x},${at.y} ${at.width}×${at.height}`),
    front: () => log.calls.push('front'),
    close: () => log.calls.push('close'),
    type: (text: string) => log.calls.push(`type ${text}`),
    key: (vk: number, mods?: { shift?: boolean; ctrl?: boolean }) => log.calls.push(`key ${vk}${mods?.shift ? '+maj' : ''}${mods?.ctrl ? '+ctrl' : ''}`),
    pointer: () => undefined,
    click: () => undefined,
    wheel: () => undefined,
  };
}

test('service : connexion dans Edge posé sur l’écran voulu, cookies relus, yt-dlp les reçoit par un fichier effacé', { skip: process.platform !== 'win32' }, async () => {
  const { createYoutubeAccount } = require(path.join(APP_DIST, 'youtube-account.js')) as { createYoutubeAccount: CreateAccount };
  const cookies: CdpCookie[] = [
    { name: 'SID', value: 'fictif-sid', domain: '.youtube.com', path: '/', expires: LATER },
    { name: 'SAPISID', value: 'fictif-sapisid', domain: '.youtube.com', path: '/', expires: LATER },
    { name: 'lt', value: 'fictif-msn', domain: '.msn.com', path: '/', expires: LATER },
  ];
  const edge = fakeEdge(cookies);
  const data = path.join(tmp, 'data');
  const log: FakeOps = { calls: [] };
  const journal: string[] = [];
  const seen: { args: string[]; file?: string; text?: string }[] = [];
  const account = createYoutubeAccount({
    dataDir: () => data,
    tempDir: path.join(tmp, 'cookies'),
    edge: { ...edge, windows: fakeOps(log) },
    log: (l: string) => journal.push(l),
    ytdlp: {
      run: async (args: string[]): Promise<RunResult> => {
        const file = args[args.indexOf('--cookies') + 1];
        seen.push({ args, file, text: file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined });
        return { ok: true, code: 0, stdout: JSON.stringify({ entries: [{ _type: 'url', id: 'PLexempleCompte0001', title: 'Néon nocturne' }] }), lines: [] };
      },
    },
  });
  // Pas encore de profil : pas connecté, sans lancer Edge.
  assert.equal((await account.refresh()).connected, false);
  assert.equal(fs.existsSync(path.join(tmp, 'appels.txt')), false);
  const r = account.signIn({ x: 1920, y: 0, width: 1080, height: 1920 });
  assert.ok(r.ok);
  assert.equal(account.state().signingIn, true);
  assert.equal(await r.session.shown, true);
  const done = await r.session.done;
  assert.equal(done.connected, true);
  assert.equal(account.state().connected, true);
  assert.ok(log.calls.includes('place 1920,0 1080×1920'));
  // Les deux lancements : connexion sans port, puis lecture sans fenêtre.
  const calls = fs.readFileSync(path.join(tmp, 'appels.txt'), 'utf8').trim().split('\n');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[0]!, /remote-debugging|headless/);
  assert.match(calls[1]!, /--headless=new.*--remote-debugging-port=0/);
  // Playlists : le fichier de cookies existe pendant l'appel, sans ceux de Microsoft, puis disparaît.
  const lists = await account.playlists();
  assert.ok(lists.ok);
  assert.deepEqual(lists.lists.map((p) => p.list), ['LL', 'WL', 'PLexempleCompte0001']);
  assert.match(seen[0]!.text ?? '', /\tSID\tfictif-sid/);
  assert.doesNotMatch(seen[0]!.text ?? '', /msn|fictif-msn/);
  assert.equal(fs.existsSync(seen[0]!.file!), false);
  // Aucun cookie au journal.
  assert.doesNotMatch(journal.join('\n'), /fictif-/);
  // Déconnexion : le profil d'Edge du Juke-box est effacé.
  await account.signOut();
  assert.equal(account.state().connected, false);
  assert.equal(fs.existsSync(path.join(data, EDGE_PROFILE_DIR)), false);
});

test('service : télécommande et boutons relayés à Edge comme un clavier ; Edge absent, grisé avec la raison', { skip: process.platform !== 'win32' }, async () => {
  const { createEdgeLogin } = require(path.join(APP_DIST, 'edge-login.js')) as { createEdgeLogin: CreateLogin };
  const log: FakeOps = { calls: [] };
  const login = createEdgeLogin({ dataDir: path.join(tmp, 'data2'), ...fakeEdge([]), windows: fakeOps(log) });
  const s = login.open({ x: 0, y: 0, width: 1080, height: 1920 })!;
  await s.shown;
  s.type('exemple@example.com');
  s.key('Tab', { shift: true });
  s.set('');
  s.set('nouveau');
  assert.deepEqual(log.calls.filter((c) => !c.startsWith('front') && !c.startsWith('place')), ['type exemple@example.com', 'key 9+maj', 'key 65+ctrl', 'key 8', 'key 65+ctrl', 'type nouveau']);
  assert.equal((await s.done).connected, false);
  const { createYoutubeAccount } = require(path.join(APP_DIST, 'youtube-account.js')) as { createYoutubeAccount: CreateAccount };
  const none = createYoutubeAccount({ dataDir: () => path.join(tmp, 'data3'), edge: { edgeExe: () => undefined }, ytdlp: { run: async (): Promise<RunResult> => ({ ok: false, reason: 'non' }) } });
  assert.match(none.edgeMissing() ?? '', /Microsoft Edge est introuvable/);
  const refused = none.signIn({ x: 0, y: 0, width: 10, height: 10 });
  assert.equal(refused.ok, false);
});
