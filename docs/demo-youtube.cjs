// Habillage de la chaîne YouTube de Cyber Pinball (docs/demo-youtube.html), rendu hors écran :
//   banniere.png  2560 × 1440 (YouTube : 2048 × 1152 au moins, 6 Mo au plus) ;
//   profil.png    800 × 800 (YouTube : PNG, 98 × 98 au moins, 4 Mo au plus), montré en rond ;
// et, pour contrôle, dans <dossier>\apercus : la bannière avec ses zones d'affichage, ce qu'en
// montrent un ordinateur (2560 × 423) et un téléphone (1546 × 423), la photo en rond à 176 et 98 px.
//   npx electron docs/demo-youtube.cjs <dossier>
// Fenêtres JAMAIS montrées (show: false, rendu hors écran) ; docs\demo-presentation.ps1 les lance
// en plus sur un bureau Windows caché.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ARGS = process.argv.slice(2).filter((a) => !a.endsWith('.cjs') && a !== '.');
const OUT = path.resolve(ARGS[0] ?? path.join(__dirname, 'Design', 'presentation', 'youtube'));
const PAGE = path.join(__dirname, 'demo-youtube.html');
const LIMITS = { 'banniere.png': 6 * 1024 * 1024, 'profil.png': 4 * 1024 * 1024 };

app.setPath('userData', path.join(__dirname, '..', 'tmp', 'presentation', 'generateur-youtube'));
app.disableHardwareAcceleration();
// Chaque rendu ferme sa fenêtre avant d'ouvrir la suivante : sans ceci, Electron quitterait dès
// la première fermeture, sans rien dire (sortie 0, images absentes).
app.on('window-all-closed', () => {});

function offscreen(width, height) {
  const win = new BrowserWindow({
    width, height, useContentSize: true, show: false, frame: false, focusable: false, skipTaskbar: true,
    enableLargerThanScreen: true, webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  // Une fenêtre plus grande que l'écran est bridée à sa création : la taille est reposée ensuite.
  win.setContentSize(width, height);
  return win;
}

async function render(query, width, height) {
  const win = offscreen(width, height);
  await win.loadFile(PAGE, { query });
  await win.webContents.executeJavaScript(`(async () => {
    await document.fonts.ready;
    const img = new Image(); img.src = '../app/renderer/fronton-marque.webp'; await img.decode();
    await new Promise((r) => setTimeout(r, 500));
  })()`);
  const image = await win.webContents.capturePage();
  win.destroy();
  const size = image.getSize();
  if (size.width !== width || size.height !== height) throw new Error(`Capture en ${size.width} × ${size.height} au lieu de ${width} × ${height}.`);
  return image.toPNG();
}

/** Découpes et réductions faites dans une page : [{ src, out, crop: [x, y, w, h], size: [w, h], round, back }]. */
async function derive(jobs) {
  const win = offscreen(400, 300);
  await win.loadURL('data:text/html,<meta charset=utf-8><title>aperçus</title>');
  for (const job of jobs) {
    const data = `data:image/png;base64,${job.src.toString('base64')}`;
    const encoded = await win.webContents.executeJavaScript(`(async () => {
      const job = ${JSON.stringify({ ...job, src: undefined, out: undefined })};
      const img = new Image(); img.src = ${JSON.stringify(data)}; await img.decode();
      const [x, y, w, h] = job.crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
      const [W, H] = job.size ?? [w, h];
      const pad = job.round ? 24 : 0;
      const c = document.createElement('canvas'); c.width = W + 2 * pad; c.height = H + 2 * pad;
      const g = c.getContext('2d');
      g.fillStyle = job.back ?? '#030807'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingQuality = 'high';
      if (job.round) { g.save(); g.beginPath(); g.arc(pad + W / 2, pad + H / 2, W / 2, 0, 2 * Math.PI); g.clip(); }
      g.drawImage(img, x, y, w, h, pad, pad, W, H);
      if (job.round) g.restore();
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    fs.writeFileSync(job.out, Buffer.from(encoded, 'base64'));
  }
  win.destroy();
}

app.whenReady().then(async () => {
  const previews = path.join(OUT, 'apercus');
  fs.mkdirSync(previews, { recursive: true });

  const banner = await render({ vue: 'banniere' }, 2560, 1440);
  const profile = await render({ vue: 'profil' }, 800, 800);
  for (const [name, png] of [['banniere.png', banner], ['profil.png', profile]]) {
    const file = path.join(OUT, name);
    fs.writeFileSync(file, png);
    const bytes = fs.statSync(file).size;
    if (bytes > LIMITS[name]) throw new Error(`${name} pèse ${(bytes / 1048576).toFixed(1)} Mo, au-delà de la limite de YouTube.`);
    console.log(`Image : ${file} (${Math.round(bytes / 1024)} Ko)`);
  }

  const guides = await render({ vue: 'banniere', guides: '1' }, 2560, 1440);
  const profileGuides = await render({ vue: 'profil', guides: '1' }, 800, 800);
  await derive([
    { src: guides, out: path.join(previews, 'banniere-zones.png'), size: [1280, 720] },
    { src: banner, out: path.join(previews, 'banniere-ordinateur.png'), crop: [0, 508, 2560, 423], size: [1600, 264] },
    { src: banner, out: path.join(previews, 'banniere-telephone.png'), crop: [507, 508, 1546, 423] },
    { src: profileGuides, out: path.join(previews, 'profil-zone.png'), size: [400, 400] },
    { src: profile, out: path.join(previews, 'profil-176.png'), size: [176, 176], round: true, back: '#0f0f0f' },
    { src: profile, out: path.join(previews, 'profil-98-sombre.png'), size: [98, 98], round: true, back: '#0f0f0f' },
    { src: profile, out: path.join(previews, 'profil-98-clair.png'), size: [98, 98], round: true, back: '#ffffff' },
    { src: profile, out: path.join(previews, 'profil-40.png'), size: [40, 40], round: true, back: '#ffffff' },
  ]);
  console.log(`Aperçus : ${previews}`);
  app.quit();
}).catch((error) => {
  console.error(`Habillage YouTube impossible : ${error.message}`);
  app.exit(1);
});
