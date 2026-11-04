// Rendu du fronton de la marque, tel que la borne l'affiche par défaut (aucun jeu choisi :
// menu système, réglages, aide). Il passe par le vrai composant du menu (app/renderer/fallback.js,
// via fallback-demo.html) : « CYBER PINBALL » sur l'illustration de la bille et des batteurs.
//   npx electron docs/demo-presentation.cjs <sortie.png> [largeur] [hauteur]
// Par défaut 1920 × 1080, le 16:9 d'un fronton.
//
// --convertir : réenregistre des images à leur taille, au format de l'extension de sortie (.jpg
// pour une messagerie, .webp pour la page du projet). Une image animée n'en garde que la première vue.
//   npx electron docs/demo-presentation.cjs --convertir <source> <sortie> [<source> <sortie>…]
//
// Fenêtres JAMAIS montrées (show: false, rendu hors écran) ; docs\demo-presentation.ps1 les lance
// en plus sur un bureau Windows caché.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ARGS = process.argv.slice(2).filter((a) => !a.endsWith('.cjs') && a !== '.');
const CONVERT = ARGS[0] === '--convertir';
const OUT = path.resolve(CONVERT ? ARGS[2] : (ARGS[0] ?? path.join(__dirname, '..', 'tmp', 'presentation', 'fronton-cyber-pinball.png')));
const WIDTH = Number((!CONVERT && ARGS[1]) || 1920);
const HEIGHT = Number((!CONVERT && ARGS[2]) || 1080);
/** Dans fallback-demo.js, le dernier exemple n'a aucun jeu : c'est la marque. */
const BRAND_SAMPLE = '6';

app.setPath('userData', path.join(__dirname, '..', 'tmp', 'presentation', 'generateur'));
app.disableHardwareAcceleration();

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function convert(pairs) {
  if (!pairs.length || pairs.length % 2) throw new Error('--convertir attend des paires <source> <sortie>.');
  const win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL('data:text/html,<meta charset=utf-8><title>conversion</title>');
  for (let i = 0; i < pairs.length; i += 2) {
    const [src, out] = [path.resolve(pairs[i]), path.resolve(pairs[i + 1])];
    const mime = MIME[path.extname(out).toLowerCase()];
    if (!mime) throw new Error(`Format de sortie inconnu : ${out}`);
    const data = `data:${MIME[path.extname(src).toLowerCase()] ?? 'image/png'};base64,${fs.readFileSync(src).toString('base64')}`;
    const encoded = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(data)}; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.fillStyle = '#030807'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
      return c.toDataURL(${JSON.stringify(mime)}, 0.9).split(',')[1];
    })()`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(encoded, 'base64'));
    console.log(`Image : ${out} (${Math.round(fs.statSync(out).size / 1024)} Ko)`);
  }
  win.destroy();
}

app.whenReady().then(async () => {
  if (CONVERT) {
    await convert(ARGS.slice(1));
    return app.quit();
  }
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    show: false,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  // Une fenêtre plus haute que l'écran est bridée à sa création : la taille est reposée ensuite.
  win.setContentSize(WIDTH, HEIGHT);
  await win.loadFile(path.join(__dirname, '..', 'app', 'renderer', 'fallback-demo.html'), {
    query: { composant: 'backglass', jeu: BRAND_SAMPLE, anime: '0' },
  });
  await win.webContents.executeJavaScript(`(async () => {
    await document.fonts.ready;
    const art = document.querySelector('.cp-bg-art');
    const mark = document.querySelector('.cp-bg-mark');
    if (!art || !mark || !/CYBER/.test(mark.textContent)) throw new Error('Fronton de la marque absent de la page.');
    // L'illustration est un fond CSS : on attend qu'elle soit décodée avant la capture.
    const url = getComputedStyle(art).backgroundImage.match(/url\\("?(.+?)"?\\)/)?.[1];
    if (url) { const img = new Image(); img.src = url; await img.decode(); }
    await new Promise((r) => setTimeout(r, 800));
  })()`);
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== WIDTH || size.height !== HEIGHT) throw new Error(`Capture en ${size.width} × ${size.height} au lieu de ${WIDTH} × ${HEIGHT}.`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, image.toPNG());
  console.log(`Fronton de la marque : ${OUT} (${WIDTH} × ${HEIGHT}, ${Math.round(fs.statSync(OUT).size / 1024)} Ko)`);
  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(`Fronton de la marque impossible : ${error.message}`);
  app.exit(1);
});
