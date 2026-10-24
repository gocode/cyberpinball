// Rendu de l'icône pour scripts/icone.mjs, lancé par lui avec l'Electron du projet :
//   electron scripts/icone-rendu.cjs <tâche.json>
// La tâche donne le SVG, les tailles et le dossier de sortie ; chaque taille est
// dessinée par Chromium dans un canvas de cette taille exacte (lissage du navigateur,
// comme le .ico la montrera) et écrite en RGBA brut, non prémultiplié : <taille>.rgba.
// Une seule fenêtre, jamais montrée, rendue hors écran ; si elle devenait visible ou
// prenait le focus, tout s'arrête sans rien écrire.

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const job = JSON.parse(fs.readFileSync(process.argv.at(-1), 'utf8'));

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  if (win.isVisible() || win.isFocused()) {
    win.destroy();
    console.error('Icône : la fenêtre de rendu est visible, arrêt sans rien écrire.');
    app.exit(2);
    return;
  }
  try {
    await win.loadURL('about:blank');
    for (const size of job.sizes) {
      const base64 = await win.webContents.executeJavaScript(`(async () => {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(job.svg)});
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = ${size};
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        const data = ctx.getImageData(0, 0, ${size}, ${size}).data;
        let text = '';
        for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return btoa(text);
      })()`);
      fs.writeFileSync(path.join(job.out, `${size}.rgba`), Buffer.from(base64, 'base64'));
    }
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(`Icône : ${error.message}`);
    win.destroy();
    app.exit(1);
  }
});
