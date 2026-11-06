// Habillage des vidéos de la chaîne YouTube (video/habillage), rendu hors écran :
//   planche-*.jpg               les maquettes de tous les éléments, à des instants choisis, pour
//                               validation (ident et cartes en bandes d'images, incrustations sur
//                               une capture d'exemple, écran de fin avec les emplacements YouTube) ;
//   miniature-presentation.png  et miniature-07-il-manque.png : les deux exemples du gabarit (§ 7),
//                               1280 × 720, moins de 2 Mo ;
//   apercus/                    chaque image de la planche seule, les miniatures à 168 × 94 (liste
//                               sur téléphone), 246 × 138 et 360 × 202, sur fond sombre et clair,
//                               avec la pastille de durée de YouTube ; une incrustation rendue sur
//                               fond transparent (contrôle de la couche alpha).
//   npx electron docs/demo-habillage.cjs <dossier>
// Fenêtres JAMAIS montrées (show: false, rendu hors écran) ; docs\demo-habillage.ps1 les lance
// en plus sur un bureau Windows caché. Chaque page est rendue comme l'orchestrateur la filmera :
// ?t=<s>, puis capture quand <html data-pret="1"> (contrat : video/habillage/habillage.js).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const ARGS = process.argv.slice(2).filter((a) => !a.endsWith('.cjs') && a !== '.');
const REPO = path.join(__dirname, '..');
const PAGES = path.join(REPO, 'video', 'habillage');
const OUT = path.resolve(ARGS[0] ?? path.join(PAGES, 'rendus'));
const SEULEMENT = ARGS[1] ? new Set(ARGS[1].split(',')) : null;
const LIMITE_MINIATURE = 2 * 1024 * 1024;

app.setPath('userData', path.join(REPO, 'tmp', 'presentation', 'generateur-habillage'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

function offscreen(width, height, transparent = false) {
  const win = new BrowserWindow({
    width, height, useContentSize: true, show: false, frame: false, focusable: false, skipTaskbar: true,
    enableLargerThanScreen: true, transparent, backgroundColor: transparent ? '#00000000' : '#030807',
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.setContentSize(width, height);
  return win;
}

/** Une page de video/habillage à l'instant t : { page, query, t, w, h, transparent } → PNG. */
async function render({ page, query = {}, t, w = 1920, h = 1080, transparent = false }) {
  const win = offscreen(w, h, transparent);
  const q = { ...query };
  if (t !== undefined) q.t = String(t);
  // Une erreur de la page est dite avec son nom, au lieu d'une attente sans fin.
  const erreurs = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error') erreurs.push(e.message); });
  await win.loadFile(path.join(PAGES, page), { query: q });
  await win.webContents.executeJavaScript(`new Promise((ok, ko) => {
    const debut = Date.now();
    (function guet() {
      // Prête : deux images peintes, puis un temps pour le rendu hors écran (une grande fenêtre
      // capturée trop tôt rendait sa couleur de fond seule).
      if (document.documentElement.dataset.pret === '1') return requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 300)));
      if (Date.now() - debut > 15000) return ko(new Error('jamais prête'));
      setTimeout(guet, 30);
    })();
  })`).catch((error) => {
    win.destroy();
    throw new Error(`${page}?${new URLSearchParams(q)} : ${error.message}${erreurs.length ? ` (${erreurs.join(' ; ')})` : ''}`);
  });
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, 150));
  const image = await win.webContents.capturePage();
  win.destroy();
  const size = image.getSize();
  if (size.width !== w || size.height !== h) throw new Error(`${page} : capture en ${size.width} × ${size.height} au lieu de ${w} × ${h}.`);
  return image.toPNG();
}

/** Planche ou aperçu composé dans planche.html : { titre, sections } → JPEG ou PNG. */
async function composer(spec, largeur, format = 'jpg') {
  const win = offscreen(largeur, 400);
  await win.loadFile(path.join(PAGES, 'planche.html'));
  const hauteur = await win.webContents.executeJavaScript(`window.composer(${JSON.stringify(spec)})`);
  win.setContentSize(largeur, hauteur);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  win.destroy();
  const size = image.getSize();
  if (size.height !== hauteur) throw new Error(`Planche « ${spec.titre} » capturée sur ${size.height} px au lieu de ${hauteur}.`);
  return format === 'png' ? image.toPNG() : image.toJPEG(88);
}

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

app.whenReady().then(async () => {
  const apercus = path.join(OUT, 'apercus');
  fs.mkdirSync(apercus, { recursive: true });
  const ecrire = (nom, data) => {
    const file = path.join(nom.includes('/') ? OUT : apercus, nom);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return file;
  };

  const SPEC = require(path.join(PAGES, 'planche.json'));
  const images = {};
  for (const [cle, job] of Object.entries(SPEC.images)) {
    if (SEULEMENT && !SEULEMENT.has(cle.split('@')[0])) continue;
    const png = await render(job);
    images[cle] = png;
    ecrire(`${cle.replace(/[@:]/g, '-')}.png`, png);
  }
  console.log(`Images : ${Object.keys(images).length} rendues dans ${apercus}`);
  if (SEULEMENT) return app.quit();

  // Les deux miniatures d'exemple, et leur lecture aux tailles de YouTube.
  for (const [cle, nom] of [['miniature-presentation', 'miniature-presentation.png'], ['miniature-07', 'miniature-07-il-manque.png']]) {
    const file = path.join(OUT, nom);
    fs.writeFileSync(file, images[cle]);
    const octets = fs.statSync(file).size;
    if (octets > LIMITE_MINIATURE) throw new Error(`${nom} pèse ${(octets / 1048576).toFixed(1)} Mo, au-delà des 2 Mo de YouTube.`);
    console.log(`Miniature : ${file} (${Math.round(octets / 1024)} Ko)`);
  }

  const src = Object.fromEntries(Object.entries(images).map(([k, v]) => [k, dataUrl(v)]));
  src['fond-demo'] = pathToFileURL(path.join(REPO, 'docs', 'images', 'fr', 'desktop.webp')).href;

  // Miniatures à leurs tailles d'affichage, avec la pastille de durée (contrôle du coin vide),
  // sur les fonds sombre et clair de YouTube : celles du gabarit, puis les propositions.
  const lectures = {
    'miniatures-lecture': ['miniature-presentation', 'miniature-07', 'miniature-nouveautes'],
    'propositions-lecture': Object.keys(images).filter((k) => k.startsWith('proposition-miniature-') && k !== 'proposition-miniature-01'),
  };
  for (const [nom, cles] of Object.entries(lectures)) {
    const lecture = { titre: 'Miniatures aux tailles de YouTube', lecture: true, sections: [] };
    for (const cle of cles.filter((c) => src[c])) {
      for (const fond of ['#0f0f0f', '#ffffff']) {
        lecture.sections.push({ fond, images: [168, 246, 360].map((l) => ({ src: src[cle], largeur: l, duree: cle.includes('07') ? '7:42' : '10:12' })) });
      }
    }
    if (!lecture.sections.length) continue;
    const png = await composer(lecture, 1100, 'png');
    ecrire(`${nom}.png`, png);
    src[nom] = dataUrl(png);
  }

  for (const planche of SPEC.planches) {
    const sources = (cle) => (Array.isArray(cle) ? cle.map((c) => src[c]) : [src[cle]]);
    const spec = { ...planche, sections: planche.sections.map((s) => ({ ...s, images: s.images.map((i) => ({ ...i, src: sources(i.cle) })) })) };
    const file = path.join(OUT, `${planche.fichier}.jpg`);
    fs.writeFileSync(file, await composer(spec, planche.largeur ?? 2400));
    console.log(`Planche : ${file}`);
  }
  console.log(`Aperçus : ${apercus}`);
  app.quit();
}).catch((error) => {
  console.error(`Habillage impossible : ${error.message}`);
  app.exit(1);
});
