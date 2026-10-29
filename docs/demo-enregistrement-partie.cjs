// Contrôle des vidéos produites par docs\demo-enregistrement-partie.ps1 (lancé par lui, hors écran) :
// chaque fichier est lu par Chromium comme la roue le lit, une image est prise au milieu de la
// lecture et ses marques sont relevées. La fausse table de la partie simulée (renderer/recorder.js)
// a un bandeau rouge en haut et des flippers verts en bas : une vidéo du plateau droite, flippers
// en bas, a donc du rouge en haut et du vert en bas, quel que soit le sens de l'écran filmé.
//   electron docs\demo-enregistrement-partie.cjs <spec.json>
//   spec : { files: [chemin…], out: resultat.json, captures: dossier }

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const WT = path.resolve(__dirname, '..');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('window-all-closed', () => {});

async function inspect(file) {
  const win = new BrowserWindow({ show: false, width: 640, height: 640, webPreferences: { offscreen: true, webSecurity: false, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  const page = path.join(path.dirname(spec.out), 'lecture.html');
  fs.writeFileSync(page, '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"></body>');
  await win.loadFile(page);
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^file:\/\/\/([A-Za-z])%3A/, 'file:///$1:');
  const seen = await win.webContents.executeJavaScript(`(async () => {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.src = ${JSON.stringify(url)};
    document.body.append(v);
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error('illisible : ' + (v.error && v.error.message))); });
    await v.play();
    await new Promise((r) => setTimeout(r, 1800));
    const w = v.videoWidth, h = v.videoHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(v, 0, 0);
    const band = (y0, y1) => { const d = g.getImageData(0, Math.round(h * y0), w, Math.max(1, Math.round(h * (y1 - y0)))).data; let r = 0, gr = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; } return [Math.round(r / n), Math.round(gr / n), Math.round(b / n)]; };
    return { width: w, height: h, haut: band(0.01, 0.06), bas: band(0.955, 0.995), duree: Number.isFinite(v.duration) ? v.duration : null, png: c.toDataURL('image/png') };
  })()`);
  win.destroy();
  const png = path.join(spec.captures, `image-${path.basename(file).replace(/[^\w.-]+/g, '_')}.png`);
  fs.writeFileSync(png, Buffer.from(seen.png.split(',')[1], 'base64'));
  delete seen.png;
  const sound = core.mp4Sound(file);
  return { file, bytes: fs.statSync(file).size, ...seen, son: sound ? sound.codec : null, image: png };
}

app.whenReady().then(async () => {
  const results = [];
  for (const file of spec.files) {
    try {
      results.push(await inspect(file));
    } catch (error) {
      results.push({ file, erreur: String(error && error.message ? error.message : error) });
    }
  }
  fs.writeFileSync(spec.out, JSON.stringify(results, null, 2));
  app.exit(0);
});
