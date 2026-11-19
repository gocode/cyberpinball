// Vidéo d'une table lue par un vrai Chromium hors écran, servie par morceaux sans fichier gardé ouvert
// (media-response.ts, 19/11/2026). medias-sans-verrou.test.ts fixe la réponse seule ; ici, Chromium la lit
// comme la roue lit une vidéo (plages, boucle), avec de petits morceaux pour qu'il y en ait beaucoup, et le
// dossier de la table est renommé pendant la lecture : il doit l'être sans refus de Windows. La vidéo est
// fabriquée par Chromium lui-même (MediaRecorder sur un canvas), rien n'est lu hors de l'essai.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { APP } from './menu-renderer';

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

const BENCH = String.raw`
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.CP_DIR;
const { mediaResponse } = require(process.env.CP_RESPONSE);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{ scheme: 'cyber-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
const table = path.join(dir, 'Table essai (Original 2026)');
const medias = path.join(table, 'medias');
const TYPES = { webm: 'video/webm', html: 'text/html' };
const out = { requests: 0, size: 0 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Une vidéo bruitée (donc lourde) de 3 s, enregistrée par Chromium.
function record() {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const g = canvas.getContext('2d');
    const img = g.createImageData(640, 360);
    let on = true;
    const draw = () => {
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = v; img.data[i + 1] = 255 - v; img.data[i + 2] = (v * 7) & 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (on) requestAnimationFrame(draw);
    };
    draw();
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 8000000 });
    const parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onerror = (e) => reject(String(e.error));
    rec.onstop = () => {
      on = false;
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(new Blob(parts, { type: 'video/webm' }));
    };
    rec.start(250);
    setTimeout(() => rec.stop(), 3000);
  });
}

app.whenReady().then(async () => {
  try {
    protocol.handle('cyber-media', async (request) => {
      out.requests++;
      const file = path.join(medias, decodeURIComponent(new URL(request.url).pathname).replace(/^\//, ''));
      let st;
      try { st = await fs.promises.stat(file); } catch { return new Response(null, { status: 404 }); }
      // Petits morceaux : beaucoup d'allers-retours, comme une longue vidéo avec les vrais.
      return mediaResponse(file, st.size, request.headers.get('range'), TYPES[path.extname(file).slice(1)] || 'application/octet-stream', 64 * 1024);
    });
    // Jamais montrée : rendu hors écran.
    const win = new BrowserWindow({ show: false, frame: false, skipTaskbar: true, focusable: false, width: 640, height: 360, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadURL('data:text/html,<body></body>');
    const b64 = await win.webContents.executeJavaScript('(' + record.toString() + ')()');
    fs.mkdirSync(medias, { recursive: true });
    fs.writeFileSync(path.join(medias, '(Playfield) Table essai.webm'), Buffer.from(b64, 'base64'));
    out.size = fs.statSync(path.join(medias, '(Playfield) Table essai.webm')).size;
    fs.writeFileSync(path.join(medias, 'page.html'), '<body style="margin:0;background:#000"><video id="v" muted loop autoplay src="(Playfield)%20Table%20essai.webm"></video></body>');
    await win.loadURL('cyber-media://fichier/page.html');
    const look = () => win.webContents.executeJavaScript('({ t: document.getElementById("v").currentTime, error: document.getElementById("v").error ? document.getElementById("v").error.message || "erreur" : null, state: document.getElementById("v").readyState })');
    let seen = await look();
    for (let i = 0; i < 100 && seen.t < 1.5 && !seen.error; i++) {
      await wait(100);
      seen = await look();
    }
    out.before = seen;
    out.requestsBefore = out.requests;
    // Le moment de « Mettre à la corbeille » : la vidéo tourne encore.
    const moved = table + ' (corbeille)';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(table, moved);
        out.renamed = true;
        out.attempts = attempt + 1;
        break;
      } catch (error) {
        out.renameError = String(error.code || error);
        await wait(30);
      }
    }
  } catch (error) {
    out.failure = String(error && error.stack || error);
  }
  fs.writeFileSync(path.join(dir, 'out.json'), JSON.stringify(out));
  app.exit(0);
});
`;

test('médias, vrai Chromium : une vidéo de table se lit par morceaux, et son dossier se renomme pendant la lecture', { skip: electron ? false : 'Electron sous Windows requis', timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-medias-verrou-chromium-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    const env: NodeJS.ProcessEnv = { ...process.env, CP_DIR: dir, CP_RESPONSE: path.join(APP, 'dist', 'media-response.js') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = runElectron(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 110_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as {
      failure?: string;
      size: number;
      requestsBefore: number;
      before: { t: number; error: string | null; state: number };
      renamed?: boolean;
      attempts?: number;
      renameError?: string;
    };
    assert.equal(out.failure, undefined, out.failure);
    assert.ok(out.size > 4 * 64 * 1024, `vidéo d'essai trop petite pour plusieurs morceaux : ${out.size} octets`);
    assert.equal(out.before.error, null, 'Chromium lit la vidéo servie par morceaux sans erreur');
    assert.ok(out.before.t >= 1.5, `la vidéo avance (${out.before.t} s)`);
    assert.equal(out.renamed, true, `dossier de la table refusé pendant la lecture : ${out.renameError}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
