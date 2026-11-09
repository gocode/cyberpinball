// Vision 3D, chaîne de la webcam de bout en bout, sans caméra réelle ni écran : la fausse caméra de
// Chromium diffuse une vidéo d'essai (un portrait, centré puis décalé vers la gauche de l'image,
// comme un joueur qui se penche vers sa droite). La fenêtre cachée de app/src/vision3d.ts repère le
// visage avec MediaPipe, HeadTracker mesure la position de jeu puis envoie les déplacements par UDP :
// l'essai les écoute et vérifie leur sens.
//
// Le portrait d'essai (domaine public, NASA) reste dans le dossier interne : sans lui, le test attend.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO } from './interne';

const PORTRAIT = path.join(REPO, 'interne', 'vision3d', 'visage-essai.png');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

const electron = electronPath();
const skip = process.platform !== 'win32' ? 'Windows seulement' : !electron ? 'Electron absent' : !fs.existsSync(PORTRAIT) ? 'portrait d’essai absent (copie publique du dépôt)' : false;

test('webcam : visage repéré dans une fenêtre cachée, position de jeu mesurée, tête à droite -> x positif par UDP', { skip, timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vision3d-'));
  try {
    const main = path.join(dir, 'main.js');
    const report = path.join(dir, 'rapport.json');
    const video = path.join(dir, 'camera.mjpeg');
    const vision3d = path.join(REPO, 'app', 'dist', 'vision3d.js');
    const core = path.join(REPO, 'packages', 'core', 'dist', 'vision3d.js');
    fs.writeFileSync(
      main,
      `const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const dgram = require('node:dgram');
// La vidéo de la fausse caméra : 90 images centrées, puis 90 décalées de 100 px vers la gauche.
const W = 640, H = 480;
const face = nativeImage.createFromPath(${JSON.stringify(PORTRAIT)}).resize({ width: 300, height: 300 });
const faceBits = face.toBitmap();
const frame = (x0) => {
  const buf = Buffer.alloc(W * H * 4, 40);
  for (let y = 0; y < 300; y++) faceBits.copy(buf, ((y + 90) * W + x0) * 4, y * 300 * 4, (y + 1) * 300 * 4);
  return nativeImage.createFromBitmap(buf, { width: W, height: H }).toJPEG(90);
};
const centre = frame(170), gauche = frame(70);
const parts = [];
for (let i = 0; i < 180; i++) parts.push(i < 90 ? centre : gauche);
fs.writeFileSync(${JSON.stringify(video)}, Buffer.concat(parts));
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-file-for-fake-video-capture', ${JSON.stringify(video)});
app.on('window-all-closed', () => undefined);
app.whenReady().then(async () => {
  const seen = { packets: [], log: [] };
  const sock = dgram.createSocket('udp4');
  sock.on('message', (m) => seen.packets.push([m.readDoubleLE(0), m.readDoubleLE(8), m.readDoubleLE(16)]));
  await new Promise((r) => sock.bind(47422, '127.0.0.1', r));
  try {
    const { HeadTracker } = require(${JSON.stringify(vision3d)});
    const { parseVision3dSetting } = require(${JSON.stringify(core)});
    const tracker = new HeadTracker({ dataDir: ${JSON.stringify(dir)}, appDir: ${JSON.stringify(path.join(REPO, 'app'))}, log: (l) => seen.log.push(l) });
    tracker.start('webcam', 'essai', parseVision3dSetting({}));
    await new Promise((r) => setTimeout(r, 15000));
    seen.state = tracker.state;
    seen.failure = tracker.failureReason;
    tracker.stop();
  } catch (e) {
    seen.error = String(e && e.stack || e);
  }
  sock.close();
  fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify(seen));
  app.exit(0);
});
`,
    );
    const run = runElectron(electron!, [`--user-data-dir=${path.join(dir, 'profil')}`, main], {
      dir,
      timeout: 90_000,
      env: { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_VISION3D_PORT: '47422', ELECTRON_ENABLE_LOGGING: '1' },
    });
    assert.ok(fs.existsSync(report), `pas de rapport : ${run.stdout}\n${run.stderr}`);
    const seen = JSON.parse(fs.readFileSync(report, 'utf8')) as { packets: number[][]; log: string[]; error?: string; failure?: string; state?: string };
    const trace = `\n${seen.log.join('\n')}\n${seen.error ?? ''}\n${run.stderr.slice(-3000)}`;
    assert.equal(seen.error, undefined, trace);
    assert.equal(seen.failure, undefined, trace);
    assert.ok(seen.log.some((l) => /visage repéré/.test(l)), `visage jamais repéré${trace}`);
    assert.ok(seen.log.some((l) => /position de jeu enregistrée/.test(l)), `position de jeu jamais mesurée${trace}`);
    assert.ok(seen.packets.length > 20, `${seen.packets.length} paquets${trace}`);
    const xs = seen.packets.map((p) => p[0]!);
    // Visage centré : près du neutre ; décalé à gauche de l'image : le joueur est à sa droite.
    assert.ok(xs.some((x) => Math.abs(x) < 2), `jamais revenu au neutre : ${xs.slice(0, 40).map((x) => x.toFixed(1)).join(' ')}`);
    assert.ok(Math.max(...xs) > 5, `tête à droite jamais vue : max ${Math.max(...xs).toFixed(1)} cm${trace}`);
    assert.ok(Math.min(...xs) > -5, `déplacement à gauche inattendu : min ${Math.min(...xs).toFixed(1)} cm`);
    // Le réglage garde la position de jeu de cette configuration.
    const setting = JSON.parse(fs.readFileSync(path.join(dir, 'vision3d', 'reglage.json'), 'utf8')) as { neutral: Record<string, { source: string; z: number }> };
    assert.equal(setting.neutral.essai?.source, 'webcam');
    assert.ok(setting.neutral.essai!.z > 20 && setting.neutral.essai!.z < 300, `distance ${setting.neutral.essai!.z} cm`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
