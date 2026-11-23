import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';

function electronPath(): string | undefined {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'));
    const exe = path.join(dir, 'dist', 'electron.exe');
    return fs.existsSync(exe) ? exe : undefined;
  } catch { return undefined; }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

const BENCH = String.raw`
const { app, nativeImage, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const dir = process.env.CP_DIR;
    const image = path.join(dir, 'image.png');
    fs.writeFileSync(image, nativeImage.createFromBitmap(Buffer.from([20, 80, 240, 255]), { width: 1, height: 1 }).toPNG());
    const broken = path.join(dir, 'broken.mp4');
    fs.writeFileSync(broken, 'not a video');
    const { createConverter } = require(process.env.CP_CONVERT);
    const converter = createConverter();
    let refused = false;
    try { await converter.mediaFrames(broken, [0, 0.5], 4); } catch { refused = true; }
    if (!refused) throw Error('invalid video accepted');
    const first = await converter.mediaFrames(image, [0], 4);
    if (first.images.length !== 1) throw Error('reader not recovered after invalid video');
    const contents = webContents.getAllWebContents().find((v) => v.getURL().startsWith('https://conversion.cyberpinball.invalid/'));
    if (!contents) throw Error('conversion page missing');
    const id = contents.id;
    const destroyed = new Promise((resolve) => contents.once('destroyed', resolve));
    contents.forcefullyCrashRenderer();
    await destroyed;
    const second = await converter.mediaFrames(image, [0], 4);
    const recreated = webContents.getAllWebContents().find((v) => v.getURL().startsWith('https://conversion.cyberpinball.invalid/'));
    if (second.images.length !== 1 || recreated?.id === id) throw Error('dead page reused');
    fs.writeFileSync(path.join(dir, 'ok.txt'), 'ok');
    app.exit(0);
  } catch (error) { console.error(error.stack || String(error)); app.exit(1); }
});
`;

test('convertisseur hors écran : récupération après vidéo illisible puis plantage du rendu', { skip: electron ? false : 'Electron sous Windows requis', timeout: 90_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-video-reprise-'));
  try {
    const file = path.join(dir, 'banc.cjs');
    fs.writeFileSync(file, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_CONVERT: path.join(REPO_ROOT, 'app/dist/media-convert.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = runElectron(electron!, [file, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 80_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(dir, 'ok.txt'), 'utf8'), 'ok');
  } finally { removeTempDir(dir); }
});
