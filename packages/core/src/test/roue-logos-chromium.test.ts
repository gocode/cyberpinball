// Logos animés de la roue, dans un vrai Chromium hors écran (12/11/2026). Le test du rendu sous
// linkedom (roue-reglages.test.ts) remplaçait CyberMedia.stillLogo : il ne voyait ni la politique de
// sécurité de la page (qui refusait la lecture des fichiers, connect-src absent, et les images blob:),
// ni le décodeur d'images de Chromium, ni la feuille de style. Sur le PinCab, tous les logos restaient
// animés. Ici : la vraie page du menu (frontend.html, sa politique, ses scripts, ses feuilles), des
// logos APNG animés et un PNG fixe servis par le protocole cyber-media comme dans l'application, et
// ce que Chromium dessine vraiment (display calculé de chaque image).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
import { runElectron } from './electron-run';
import { APP, menuState } from './menu-renderer';

const REPO = path.join(APP, '..');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

/** Bloc PNG : longueur, type, données, CRC du type et des données. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([head, body, crc]);
}

/** Pixels RVBA d'une image unie de 16 × 16, filtre 0 en tête de chaque ligne, compressés. */
function pixels(r: number, g: number, b: number): Buffer {
  const line = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [r, g, b, 255]).flat())]);
  return zlib.deflateSync(Buffer.concat(Array.from({ length: 16 }, () => line)));
}

/** PNG de 16 × 16 ; avec `animated`, une APNG de deux images (rouge puis bleue) qui boucle. */
function png(animated: boolean): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  const fctl = (seq: number) => {
    const b = Buffer.alloc(26);
    b.writeUInt32BE(seq, 0);
    b.writeUInt32BE(16, 4);
    b.writeUInt32BE(16, 8);
    b.writeUInt16BE(1, 20);
    b.writeUInt16BE(10, 22);
    return chunk('fcTL', b);
  };
  if (animated) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(2, 0);
    parts.push(chunk('acTL', actl), fctl(0));
  }
  parts.push(chunk('IDAT', pixels(255, 0, 0)));
  if (animated) {
    const seq = Buffer.alloc(4);
    seq.writeUInt32BE(2);
    parts.push(fctl(1), chunk('fdAT', Buffer.concat([seq, pixels(0, 0, 255)])));
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const BENCH = String.raw`
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
// Le protocole des médias, avec les privilèges et les types de l'application (media-protocol.ts, mediaview.ts).
protocol.registerSchemesAsPrivileged([{ scheme: 'cyber-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
const TYPES = { png: 'image/png', apng: 'image/apng' };
app.whenReady().then(async () => {
  protocol.handle('cyber-media', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '');
    const file = path.join(dir, 'medias', name);
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file).slice(1)], 'Access-Control-Allow-Origin': '*' } });
  });
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({
    show: false, frame: false, skipTaskbar: true, focusable: false, width: 1080, height: 1920, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, preload: path.join(dir, 'preload.cjs'), contextIsolation: false, sandbox: false },
  });
  win.setBounds({ x: 0, y: 0, width: 1080, height: 1920 });
  const console = [];
  win.webContents.on('console-message', (event) => console.push(event.message));
  await win.loadFile(process.env.CP_PAGE, { query: { role: 'playfield' } });
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'etat.json'), 'utf8'));
  const look = () => win.webContents.executeJavaScript(${'`'}[...document.querySelectorAll('.wheel-item')].map((n) => {
    const shown = (img) => (img ? getComputedStyle(img).display !== 'none' : false);
    const anim = n.querySelector('.wheel-tilt > img.wheel-img:not(.wheel-still)');
    return { logo: anim ? decodeURIComponent(anim.getAttribute('src')).replace(/^.*\\//, '') : '', center: n.classList.contains('center'), animated: shown(anim), still: shown(n.querySelector('.wheel-tilt > .wheel-still')) };
  })${'`'});
  const out = {};
  await win.webContents.executeJavaScript('window.__send(' + JSON.stringify(state) + ')');
  // La première image est tirée de chaque fichier en tâche de fond : jusqu'à 10 s.
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const items = await look();
    if (items.filter((x) => x.still).length >= 2) break;
  }
  out.selected = await look();
  await win.webContents.executeJavaScript('window.__send(' + JSON.stringify({ ...state, wheelMotion: 'all' }) + ')');
  await new Promise((r) => setTimeout(r, 300));
  out.all = await look();
  out.console = console;
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
});
`;

// Le pont du préchargement (preload.ts), réduit à ce que la page du menu appelle.
const PRELOAD = String.raw`
window.cyberI18n = {};
window.cyber = {
  onState: (f) => { window.__send = f; },
  ready() {}, act() {}, mediaError() {}, jukebox() {}, onDmd() {}, onJukeboxPulse() {}, onJukeboxTime() {}, pathOf: () => '',
};
`;

interface Item {
  logo: string;
  center: boolean;
  animated: boolean;
  still: boolean;
}

test('roue, vrai Chromium : hors du centre, un logo APNG animé montre sa première image ; au centre et au réglage « tous », il s’anime', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-roue-logos-'));
  try {
    fs.mkdirSync(path.join(dir, 'medias'));
    for (const name of ['A', 'B', 'C']) fs.writeFileSync(path.join(dir, 'medias', `${name}.apng`), png(true));
    fs.writeFileSync(path.join(dir, 'medias', 'D.png'), png(false));
    // A à gauche, B au centre, C et D à droite.
    const state = menuState({ 'A.vpx': 'cyber-media://medias/A.apng', 'B.vpx': 'cyber-media://medias/B.apng', 'C.vpx': 'cyber-media://medias/C.apng', 'D.vpx': 'cyber-media://medias/D.png' });
    fs.writeFileSync(path.join(dir, 'etat.json'), JSON.stringify(state));
    fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD);
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_PAGE: path.join(APP, 'renderer', 'frontend.html') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as { selected: Item[]; all: Item[]; console: string[] };
    const refused = out.console.filter((m) => /Content Security Policy|première image impossible/.test(m));
    assert.deepEqual(refused, [], 'la page lit les logos et pose leur première image sans rien se voir refuser');
    const at = (items: Item[], logo: string) => {
      const item = items.find((x) => x.logo === logo);
      assert.ok(item, `${logo} absent de la roue : ${JSON.stringify(items)}`);
      return item;
    };
    // Seulement la table choisie : les voisins animés montrent leur première image, le logo animé n'est plus dessiné.
    for (const logo of ['A.apng', 'C.apng']) assert.deepEqual(at(out.selected, logo), { logo, center: false, animated: false, still: true }, `${logo} : figé hors du centre`);
    assert.deepEqual(at(out.selected, 'B.apng'), { logo: 'B.apng', center: true, animated: true, still: false }, 'au centre : le logo animé');
    assert.deepEqual(at(out.selected, 'D.png'), { logo: 'D.png', center: false, animated: true, still: false }, 'logo fixe : rien à figer, il reste dessiné');
    // Tous : chaque logo animé est dessiné, aucune première image.
    for (const item of out.all) assert.deepEqual({ animated: item.animated, still: item.still }, { animated: true, still: false }, `${item.logo} : animé au réglage « tous »`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('politique de sécurité : une page de Cyber Pinball qui se voit refuser un contenu le dit au journal et au garde-fou', () => {
  const uncaught = fs.readFileSync(path.join(APP, 'src', 'uncaught.ts'), 'utf8');
  assert.match(uncaught, /export function journalPolicyViolations\(\)/);
  assert.match(fs.readFileSync(path.join(APP, 'src', 'main.ts'), 'utf8'), /^journalPolicyViolations\(\);$/m, 'branché au démarrage');
  assert.ok(fs.readFileSync(path.join(APP, 'src', 'layout-check.ts'), 'utf8').includes("if (/violates (the following|the document's) Content Security Policy/.test(event.message)) errors.push(`politique de sécurité de la page"), 'les essais hors écran échouent');
  // Les deux tournures de Chromium : un fetch refusé (« the document's ») et une directive nommée (« the following »).
  const { CSP_VIOLATION } = require(path.join(APP, 'dist', 'uncaught.js')) as { CSP_VIOLATION: RegExp };
  assert.match("Fetch API cannot load cyber-media://x/A.apng. Refused to connect because it violates the document's Content Security Policy.", CSP_VIOLATION);
  assert.match('Refused to load the image \'blob:file:///x\' because it violates the following Content Security Policy directive: "img-src \'self\'".', CSP_VIOLATION);
  // La page du menu lit les fichiers des médias (connect-src) et montre des images blob: (première image des logos animés).
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8'))![1]!;
  assert.match(csp, /connect-src cyber-media:/);
  assert.match(csp, /img-src [^;]*blob:/);
});
