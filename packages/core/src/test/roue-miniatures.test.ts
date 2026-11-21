// Miniatures des logos de la roue (21/11/2026). Un logo de 1 000 px jamais vu, décodé à pleine taille
// au moment où il entrait dans la roue, faisait des images de 70 à 90 ms dans le rendu du plateau.
// Invariants :
// - la roue reçoit l'original tant que la miniature n'existe pas, puis la miniature (WebP, au plus
//   WHEEL_THUMB_SIDE de côté), refaite quand le logo change ;
// - un logo animé ou déjà petit garde son original, et on s'en souvient (pas de reconversion) ;
// - rien n'est converti pendant une partie ; les tables montrées passent avant la tâche de fond ;
// - dans un vrai Chromium, la conversion garde la transparence, réduit l'image, et reconnaît un GIF animé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { mediaPathFromUrl, mediaUrl } from '../mediaview';

interface Thumbs {
  readonly dir: string;
  url(original: string | undefined): string | undefined;
  warm<T>(items: readonly T[], urlOf: (item: T) => string | undefined): void;
  dispose(): void;
}
type FitWebp = (file: string, out: string, maxSide: number) => Promise<{ width?: number; height?: number; kept?: 'animated' | 'small' }>;
const { WheelThumbs, WHEEL_THUMB_SIDE } = require(path.join(REPO_ROOT, 'app', 'dist', 'wheel-thumbs.js')) as {
  WHEEL_THUMB_SIDE: number;
  WheelThumbs: new (opts: { dataDir: string; converter: () => { fitWebp: FitWebp }; idle: () => boolean; busyRetryMs?: number }) => Thumbs;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('miniatures de la roue : l’original d’abord, puis la miniature ; animé ou petit, l’original pour de bon ; refaite quand le logo change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-roue-miniatures-'));
  try {
    const logos = path.join(dir, 'logos');
    fs.mkdirSync(logos);
    const logo = (name: string) => {
      const file = path.join(logos, name);
      fs.writeFileSync(file, name);
      return mediaUrl(file);
    };
    const big = logo('grand.png');
    const anim = logo('anime.png');
    const tiny = logo('petit.png');
    const calls: string[] = [];
    let idle = true;
    const thumbs = new WheelThumbs({
      dataDir: path.join(dir, 'donnees'),
      idle: () => idle,
      busyRetryMs: 20,
      converter: () => ({
        fitWebp: async (file, out, maxSide) => {
          calls.push(path.basename(file));
          assert.equal(maxSide, WHEEL_THUMB_SIDE);
          if (file.includes('anime')) return { kept: 'animated' };
          if (file.includes('petit')) return { kept: 'small' };
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, 'webp');
          return { width: maxSide, height: maxSide };
        },
      }),
    });
    // Première demande : l'original, la miniature est lancée.
    assert.equal(thumbs.url(big), big);
    await wait(60);
    const small = thumbs.url(big)!;
    assert.notEqual(small, big, 'miniature prise dès qu’elle existe');
    const file = mediaPathFromUrl(small)!;
    assert.equal(path.dirname(file), thumbs.dir, 'servie depuis le dossier des miniatures (autorisé au protocole des médias)');
    assert.equal(path.extname(file), '.webp');
    // Animé, petit : l'original, une seule conversion chacun, même dans une autre session (marque sur disque).
    assert.equal(thumbs.url(anim), anim);
    assert.equal(thumbs.url(tiny), tiny);
    await wait(80);
    assert.equal(thumbs.url(anim), anim);
    assert.equal(thumbs.url(tiny), tiny);
    const other = new WheelThumbs({ dataDir: path.join(dir, 'donnees'), idle: () => true, converter: () => ({ fitWebp: async () => assert.fail('reconverti') }) });
    assert.equal(other.url(anim), anim);
    assert.equal(other.url(big), small, 'la miniature déjà faite est reprise');
    assert.deepEqual(calls.sort(), ['anime.png', 'grand.png', 'petit.png']);
    // Logo remplacé (même nom, autre contenu) : l'original nouveau, puis une nouvelle miniature.
    fs.writeFileSync(path.join(logos, 'grand.png'), 'grand, nouvelle version');
    fs.utimesSync(path.join(logos, 'grand.png'), new Date(), new Date(Date.now() + 5000));
    const replaced = mediaUrl(path.join(logos, 'grand.png'));
    assert.equal(thumbs.url(replaced), replaced);
    await wait(60);
    assert.notEqual(thumbs.url(replaced), small);
    assert.notEqual(thumbs.url(replaced), replaced);
    // Pendant une partie, rien n'est converti ; la roue passe avant la tâche de fond.
    idle = false;
    calls.length = 0;
    const later = ['b1.png', 'b2.png', 'b3.png'].map(logo);
    thumbs.warm(later, (u) => u);
    const shown = logo('montree.png');
    thumbs.url(shown);
    await wait(80);
    assert.deepEqual(calls, [], 'aucune conversion pendant une partie');
    idle = true;
    // Trois logos de fond, une courte pause (150 ms) entre deux.
    await wait(1000);
    assert.equal(calls[0], 'montree.png', 'la table montrée d’abord');
    assert.deepEqual(calls.slice(1).sort(), ['b1.png', 'b2.png', 'b3.png'], 'puis la collection, en tâche de fond');
    thumbs.dispose();
    other.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

/** GIF de 1 × 1 en deux images (animé). */
function animatedGif(): Buffer {
  const frame = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
  return Buffer.from([
    ...Buffer.from('GIF89a', 'latin1'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255,
    0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'latin1'), 0x03, 0x01, 0x00, 0x00, 0x00,
    ...frame, ...frame, 0x3b,
  ]);
}

const BENCH = String.raw`
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    // Logo de 1 200 px : disque opaque au milieu, coins transparents.
    const w = 1200;
    const buf = Buffer.alloc(w * w * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = Math.hypot(x - w / 2, y - w / 2) < w * 0.45;
      buf[i] = 40; buf[i + 1] = 120; buf[i + 2] = 220; buf[i + 3] = inside ? 255 : 0;
    }
    fs.writeFileSync(path.join(dir, 'grand.png'), nativeImage.createFromBitmap(buf, { width: w, height: w }).toPNG());
    fs.writeFileSync(path.join(dir, 'petit.png'), nativeImage.createFromBitmap(Buffer.alloc(200 * 200 * 4, 200), { width: 200, height: 200 }).toPNG());
    const { createConverter } = require(process.env.CP_CONVERT);
    const c = createConverter();
    const out = {};
    out.grand = await c.fitWebp(path.join(dir, 'grand.png'), path.join(dir, 'grand.webp'), 640);
    out.petit = await c.fitWebp(path.join(dir, 'petit.png'), path.join(dir, 'petit.webp'), 640);
    out.anime = await c.fitWebp(path.join(dir, 'anime.gif'), path.join(dir, 'anime.webp'), 640);
    // Relue par Chromium (le décodeur de la roue), à sa taille.
    const read = await c.mediaFrames(path.join(dir, 'grand.webp'), [0], 4000);
    const frame = read.images[0];
    const size = { width: frame.width, height: frame.height };
    const alpha = (x, y) => frame.data[(y * frame.width + x) * 4 + 3];
    out.lu = { size, coin: alpha(2, 2), centre: alpha(size.width >> 1, size.height >> 1), petitEcrit: fs.existsSync(path.join(dir, 'petit.webp')), animeEcrit: fs.existsSync(path.join(dir, 'anime.webp')) };
    fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
    app.exit(0);
  } catch (e) {
    console.error(e && e.stack || String(e));
    app.exit(1);
  }
});
`;

test('miniatures de la roue, vrai Chromium : réduite, transparence gardée ; GIF animé et petit logo laissés tels quels', { skip: electron ? false : 'Electron sous Windows requis', timeout: 90_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-roue-webp-'));
  try {
    fs.writeFileSync(path.join(dir, 'anime.gif'), animatedGif());
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_CONVERT: path.join(REPO_ROOT, 'app', 'dist', 'media-convert.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 80_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as {
      grand: { width: number; height: number; kept?: string };
      petit: { kept?: string };
      anime: { kept?: string };
      lu: { size: { width: number; height: number }; coin: number; centre: number; petitEcrit: boolean; animeEcrit: boolean };
    };
    assert.deepEqual([out.grand.width, out.grand.height, out.grand.kept], [640, 640, undefined]);
    assert.deepEqual(out.lu.size, { width: 640, height: 640 }, 'la miniature lue fait 640 px');
    assert.equal(out.lu.coin, 0, 'coin transparent gardé');
    assert.equal(out.lu.centre, 255, 'disque opaque');
    assert.equal(out.petit.kept, 'small');
    assert.equal(out.anime.kept, 'animated');
    assert.equal(out.lu.petitEcrit || out.lu.animeEcrit, false, 'rien d’écrit pour un logo gardé tel quel');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
