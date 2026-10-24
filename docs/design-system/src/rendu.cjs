// Rendu hors écran de chaque preview.html (fenêtres jamais montrées) → captures PNG.
// Lancement, depuis la racine du dépôt : npx electron docs/design-system/src/rendu.cjs [dossier du design system] [dossier des captures]
// Par défaut : ce design system, captures dans tmp/design-system à la racine du dépôt (non suivi).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const args = process.argv.slice(2).filter((a) => !a.startsWith("-") && !a.endsWith("rendu.cjs"));
const proj = args[0] || path.join(__dirname, "..");
const out = args[1] || path.join(__dirname, "..", "..", "..", "tmp", "design-system");
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const comps = fs.readdirSync(path.join(proj, 'components')).filter((d) => fs.existsSync(path.join(proj, 'components', d, 'preview.html')));
  const report = [];
  for (const name of comps) {
    const file = path.join(proj, 'components', name, 'preview.html');
    const src = fs.readFileSync(file, 'utf8');
    const w = Number(/width=(\d+)/.exec(src.split('\n')[0])?.[1] ?? 1100);
    const h = Number(/height=(\d+)/.exec(src.split('\n')[0])?.[1] ?? 400);
    const tmp = path.join(out, `_${name}.html`);
    const head = `<link rel="stylesheet" href="${pathToUrl(path.join(proj, 'tokens.css'))}"><link rel="stylesheet" href="${pathToUrl(path.join(proj, 'components', 'bundle.css'))}">`;
    fs.writeFileSync(tmp, src.replace('<html lang="fr">', '<html lang="fr" data-theme="borne">').replace('<head>', `<head>${head}`));
    const s = Math.min(1, 1000 / h);
    const win = new BrowserWindow({ show: false, width: Math.round(w * s), height: Math.round(h * s), useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
    await win.loadFile(tmp);
    win.webContents.setZoomFactor(s);
    await new Promise((r) => setTimeout(r, 1500));
    // Débordements : éléments dont le texte est coupé ou qui sortent de la page.
    const issues = await win.webContents.executeJavaScript(`(() => {
      const out = [];
      const W = document.documentElement.scrollWidth, H = document.documentElement.scrollHeight;
      if (W > innerWidth + 1) out.push('page plus large que ' + innerWidth + ' : ' + W);
      if (H > innerHeight + 1) out.push('page plus haute que ' + innerHeight + ' : ' + H);
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible' && el.clientWidth > 0 && !el.classList.contains('cp-art')) out.push('coupé (largeur) : ' + el.className + ' « ' + el.textContent.trim().slice(0, 40) + ' »');
      }
      return out.slice(0, 12);
    })()`);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    report.push(`${name} ${w}x${h}${issues.length ? '\n  ' + issues.join('\n  ') : ''}`);
    win.destroy();
    fs.rmSync(tmp);
  }
  console.log(report.join('\n'));
  app.exit(0);
});
function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }
