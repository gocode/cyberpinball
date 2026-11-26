// Icônes des Applications (siteicon.ts, applications-icons.ts compilé) : le 26/11/2026, Netflix, Twitch,
// YouTube et un groupe Facebook restaient en initiales sur une borne. Leurs favicons étaient petits
// (32 à 64 px), en .ico, servis sous un faux type (« image/png », « application/octet-stream »), ou la
// page d'accueil était illisible. Invariant : tout site qui sert une image lisible d'au moins
// APP_ICON_SMALLEST px a une icône, quel que soit son format ou le type annoncé ; la plus grande gagne,
// et ce qui est gardé est toujours un format que la grille montre (png, jpg, gif, webp). Données fictives.

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APP_ICON_MIN, APP_ICON_SMALLEST, rankIcons } from '../applications';
import { decodePng, encodePng } from '../png';
import { readIconImage, sniffIcon } from '../siteicon';

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');
const dirs: string[] = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-siteicon-'));
  dirs.push(d);
  return d;
};

/** PNG plein d'une couleur. */
function png(size: number, rgba = [200, 30, 40, 255]): Buffer {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return encodePng({ width: size, height: size, data });
}

/** Image BMP d'icône 32 bits (BGRA), sans masque utile ; `alpha` 0 partout imite un vieux .ico. */
function dib32(size: number, bgra: number[], withAlpha = true): Buffer {
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(size, 4);
  head.writeInt32LE(size * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([bgra[0]!, bgra[1]!, bgra[2]!, withAlpha ? bgra[3]! : 0], i);
  const mask = Buffer.alloc((((size + 31) >> 5) << 2) * size); // tout opaque
  return Buffer.concat([head, pixels, mask]);
}

/** Image BMP 8 bits à palette ; le masque rend la première ligne du haut transparente. */
function dib8(size: number): Buffer {
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(size, 4);
  head.writeInt32LE(size * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(8, 14);
  head.writeUInt32LE(2, 32);
  const palette = Buffer.from([0, 0, 0, 0, 255, 0, 0, 0]); // 0 noir, 1 bleu (BGR)
  const stride = ((size * 8 + 31) >> 5) << 2;
  const pixels = Buffer.alloc(stride * size, 1);
  const maskStride = ((size + 31) >> 5) << 2;
  const mask = Buffer.alloc(maskStride * size);
  mask.fill(0xff, (size - 1) * maskStride, size * maskStride); // dernière ligne écrite = ligne du haut
  return Buffer.concat([head, palette, pixels, mask]);
}

/** Fichier .ico de plusieurs images. */
function ico(images: { size: number; data: Buffer; bpp?: number }[]): Buffer {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    head[e] = img.size >= 256 ? 0 : img.size;
    head[e + 1] = img.size >= 256 ? 0 : img.size;
    head.writeUInt16LE(img.bpp ?? 32, e + 6);
    head.writeUInt32LE(img.data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

test('le format se lit dans les octets : PNG, ICO, et rien pour un SVG ou une page HTML', () => {
  assert.equal(sniffIcon(png(4)), 'png');
  assert.equal(sniffIcon(ico([{ size: 16, data: png(16) }])), 'ico');
  assert.equal(sniffIcon(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), undefined);
  assert.equal(readIconImage(Buffer.from('<!doctype html><title>Erreur</title>')), undefined);
});

test('un .ico donne le PNG de sa plus grande image, qu’elle soit PNG ou BMP', () => {
  const embedded = readIconImage(ico([{ size: 16, data: dib32(16, [0, 0, 255, 255]) }, { size: 48, data: png(48) }]));
  assert.equal(embedded?.ext, 'png');
  assert.equal(embedded?.width, 48);
  assert.equal(sniffIcon(embedded!.data), 'png');

  const bmp = readIconImage(ico([{ size: 16, data: png(16) }, { size: 32, data: dib32(32, [255, 0, 0, 255]) }]));
  assert.equal(bmp?.width, 32);
  const pixels = decodePng(bmp!.data)!;
  assert.deepEqual([...pixels.data.subarray(0, 4)], [0, 0, 255, 255], 'BGRA du .ico rendu en RVBA');

  const old = decodePng(readIconImage(ico([{ size: 32, data: dib32(32, [0, 255, 0, 0], false) }]))!.data)!;
  assert.equal(old.data[3], 255, 'alpha tout à zéro : le masque décide, ici opaque');

  const paletted = decodePng(readIconImage(ico([{ size: 16, data: dib8(16), bpp: 8 }]))!.data)!;
  assert.deepEqual([...paletted.data.subarray(0, 4)], [0, 0, 255, 0], 'ligne du haut transparente par le masque');
  assert.deepEqual([...paletted.data.subarray(16 * 4 * 15, 16 * 4 * 15 + 4)], [0, 0, 255, 255], 'couleur de la palette');
});

test('ni SVG ni image inscrite dans la page parmi les icônes essayées', () => {
  const ranked = rankIcons([
    { url: 'https://exemple.test/logo.svg', kind: 'icon', size: 512 },
    { url: 'data:image/png;base64,AAAA', kind: 'icon', size: 192 },
    { url: 'https://exemple.test/favicon.ico', kind: 'favicon', size: 0 },
  ]);
  assert.deepEqual(ranked.map((c) => c.url), ['https://exemple.test/favicon.ico']);
});

/** Faux site : chemin → [type annoncé, corps] ; la page d'accueil peut échouer comme l'en-tête trop gros de YouTube. */
function fakeSite(routes: Record<string, [string, Buffer | string] | 'erreur'>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const route = routes[url.pathname];
    if (route === 'erreur') throw new TypeError('fetch failed');
    if (!route) return new Response('absent', { status: 404 });
    const body = typeof route[1] === 'string' ? route[1] : new Uint8Array(route[1]);
    return Object.defineProperty(new Response(body, { status: 200, headers: { 'content-type': route[0] } }), 'url', { value: url.href });
  }) as typeof fetch;
}

test('un petit favicon .ico servi sous un faux type est gardé, en PNG', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const dataDir = tmp();
  const look = await fetchSiteLook('exemple', 'https://exemple.test/', {
    dataDir,
    fetch: fakeSite({ '/': ['text/html', '<html><head><title>Exemple</title></head></html>'], '/favicon.ico': ['image/png', ico([{ size: 16, data: dib32(16, [1, 2, 3, 255]) }, { size: 32, data: dib32(32, [1, 2, 3, 255]) }])] }),
  });
  assert.equal(look.icon, 'exemple.png');
  const kept = readIconImage(fs.readFileSync(path.join(dataDir, 'applications-icones', 'exemple.png')));
  assert.equal(kept?.width, 32);
  assert.ok(32 >= APP_ICON_SMALLEST && 32 < APP_ICON_MIN);
});

test('la plus grande icône gagne, même annoncée plus petite qu’elle n’est', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const dataDir = tmp();
  const html = '<head><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/logo.svg"><link rel="icon" sizes="32x32" href="/f32.png"></head>';
  const look = await fetchSiteLook('grand', 'https://exemple.test/', {
    dataDir,
    fetch: fakeSite({ '/': ['text/html', html], '/touch.png': ['application/octet-stream', png(64)], '/f32.png': ['image/png', png(32)], '/favicon.ico': ['image/x-icon', ico([{ size: 48, data: png(48) }])] }),
  });
  assert.equal(look.icon, 'grand.png');
  assert.equal(readIconImage(fs.readFileSync(path.join(dataDir, 'applications-icones', 'grand.png')))?.width, 64);
});

test('page d’accueil illisible : le favicon du site quand même', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const look = await fetchSiteLook('video', 'https://exemple.test/', {
    dataDir: tmp(),
    fetch: fakeSite({ '/': 'erreur', '/favicon.ico': ['image/vnd.microsoft.icon', ico([{ size: 48, data: dib32(48, [0, 0, 255, 255]) }])] }),
  });
  assert.equal(look.icon, 'video.png');
});

test('aucune image lisible : pas d’icône (les initiales), sans erreur', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const look = await fetchSiteLook('rien', 'https://exemple.test/', {
    dataDir: tmp(),
    fetch: fakeSite({ '/': ['text/html', '<head><link rel="icon" href="/logo.svg"></head>'], '/logo.svg': ['image/svg+xml', '<svg/>'], '/favicon.ico': ['image/x-icon', png(8)] }),
  });
  assert.equal(look.icon, undefined);
});

/** PNG rectangulaire (bannière de partage). */
function banner(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4, 255);
  return encodePng({ width, height, data });
}

test('og:image : en dernier, mais gardée quand le site n’a qu’un petit favicon', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const dataDir = tmp();
  const html = '<head><meta property="og:image" content="/partage.png"><meta property="og:image:width" content="400"><meta property="og:image:height" content="210"></head>';
  const look = await fetchSiteLook('groupe', 'https://exemple.test/', {
    dataDir,
    fetch: fakeSite({ '/': ['text/html', html], '/favicon.ico': ['image/x-icon', ico([{ size: 32, data: png(32) }])], '/partage.png': ['image/png', banner(400, 210)] }),
  });
  assert.equal(look.icon, 'groupe.png');
  assert.equal(readIconImage(fs.readFileSync(path.join(dataDir, 'applications-icones', 'groupe.png')))?.height, 210);
});

test('og:image jamais essayée devant une vraie icône qui remplit la tuile, toujours après les autres', async () => {
  const { fetchSiteLook } = require(path.join(APP_DIST, 'applications-icons.js'));
  const asked: string[] = [];
  const site = fakeSite({ '/': ['text/html', '<head><meta property="og:image" content="/partage.png"><link rel="apple-touch-icon" href="/touch.png"></head>'], '/touch.png': ['image/png', png(180)], '/partage.png': ['image/png', banner(400, 210)] });
  const look = await fetchSiteLook('vrai', 'https://exemple.test/', {
    dataDir: tmp(),
    fetch: ((to: string, init?: RequestInit) => (asked.push(new URL(to).pathname), site(to, init))) as typeof fetch,
  });
  assert.equal(look.icon, 'vrai.png');
  assert.ok(!asked.includes('/partage.png'), asked.join(' '));
  // Huit icônes annoncées : og:image reste la dernière, même annoncée immense.
  const many = [...Array(8)].map((_, i) => ({ url: `https://exemple.test/i${i}.png`, kind: 'icon' as const, size: 16 }));
  const ranked = rankIcons([{ url: 'https://exemple.test/partage.png', kind: 'og', size: 1200 }, ...many]);
  assert.equal(ranked.at(-1)?.kind, 'og');
});

test('une icône gardée plus petite que la tuile est relue une fois ; une grande, jamais', async () => {
  const { createApplicationsMenu } = require(path.join(APP_DIST, 'applications-menu.js'));
  const { storedIconSide } = require(path.join(APP_DIST, 'applications-icons.js'));
  const core = require('..');
  const dataDir = tmp();
  const iconDir = core.applicationsIconDir(dataDir);
  fs.mkdirSync(iconDir, { recursive: true });
  fs.writeFileSync(path.join(iconDir, 'petite.png'), png(32));
  fs.writeFileSync(path.join(iconDir, 'grande.png'), png(192));
  assert.equal(storedIconSide(dataDir, 'petite.png'), 32);
  assert.equal(storedIconSide(dataDir, 'absente.png'), undefined);
  let store = core.defaultApplications('2026-11-20T10:00:00.000Z');
  store = { apps: store.apps.map((a: { id: string }, i: number) => ({ ...a, icon: i === 0 ? 'petite.png' : 'grande.png' })) };
  core.saveApplications(dataDir, store);
  const looked: string[] = [];
  const host = {
    dataDir,
    library: { openCustom: () => undefined, openPrompt: () => undefined, openNotice: () => undefined, changed: () => undefined },
    keys: () => ({ previous: ['ArrowLeft'], next: ['ArrowRight'], confirm: ['Enter'], exit: ['Escape'] }),
    zoneKeys: () => [],
    screen: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    fronton: () => true,
    browser: { browser: () => undefined, open: () => undefined, current: () => undefined },
    buttons: { keys: () => ({}), watch: () => () => undefined },
    takeForeground: () => undefined,
    openExternal: () => undefined,
    online: () => true,
    look: async (id: string) => (looked.push(id), {}),
    iconUrl: (file: string) => `media://${file}`,
    iconSide: (file: string) => storedIconSide(dataDir, file),
    edgeDownloadUrl: 'https://exemple.example.com/edge',
  };
  const menu = createApplicationsMenu(host);
  menu.open(() => undefined);
  await new Promise((r) => setTimeout(r, 50));
  menu.open(() => undefined);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(looked, [store.apps[0].id]);
});

test('le front-end relève les icônes avec le fetch de Chromium (gros en-têtes de YouTube)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'frontend.ts'), 'utf8');
  const line = src.split(/\r?\n/).find((l) => l.includes('fetchSiteLook('));
  assert.ok(line && /fetch:.*net\.fetch/.test(line), 'fetchSiteLook reçoit net.fetch');
});
