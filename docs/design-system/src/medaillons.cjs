// Médaillons de la roue, sur le gabarit commun (11/11/2026) : l'anneau chromé de 1 000 × 1 000
// (medaillons/contour.png, tiré du fichier Photoshop du mainteneur, sans effet de verre), son
// centre rempli par l'intérieur propre à chaque médaillon. Tout médaillon ajouté au menu passe par
// ce gabarit (MEDAILLONS ci-dessous) ; le Juke-box est le premier. Depuis le 13/11/2026, l'intérieur
// est vivant dans la roue (medaillons-vivants.js) ; ces images en sont la première image.
//
// Deux tailles par médaillon, dans app/renderer/medaillons :
//   <nom>.png       pleine définition (920 × 920, centré sur le trou, pixels d'origine) : en grand,
//                   sur le fronton et dans les animations ;
//   <nom>-512.webp  allégé pour la roue du menu (512 × 512, WebP à 90 %) : un médaillon au centre
//                   de la roue fait au plus 504 px sur un plateau 4K.
// L'anneau seul (contour.png et contour-512.webp) y est aussi, pour un médaillon composé à l'écran.
//
// Le trou de l'anneau est rond (rayon de 363 à 365 px), mais l'anneau est plus épais vers le bas à
// droite : le centre du trou est mesuré sur l'image (barycentre des pixels transparents du centre), et
// l'intérieur est peint jusqu'au plus grand rayon, plus 6 px, sous l'anneau.
//   npx electron docs/design-system/src/medaillons.cjs   (rendu hors écran, aucune fenêtre visible)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const here = __dirname;
const out = path.resolve(here, '..', '..', '..', 'app', 'renderer', 'medaillons');
/** Côté du carré gardé autour du trou (l'anneau en déborde jusqu'à 455 px du centre), et de la version allégée. */
const CROP = 920;
const SMALL = 512;
/**
 * Intérieur de chaque médaillon (13/11/2026) : la première image de son intérieur vivant
 * (app/renderer/medaillons-vivants.js, CyberMedaillons.paint), peinte dans le trou de l'anneau.
 * L'image fixe et le médaillon animé de la roue sont ainsi le même dessin.
 *   juke-box   : « Onde », trois fils Soie autour du rond à la note ;
 *   communaute : « Montée », le bonhomme vert dans le rond, des bulles d'emojis qui montent ;
 *   collections : « Éclat », l’étoile verte des favoris dans le rond, des petites étoiles qui en partent.
 */
const MEDAILLONS = [{ name: 'juke-box' }, { name: 'communaute' }, { name: 'collections' }];

const page = (ring, items) => `
(async () => {
  const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(src)); i.src = src; });
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ring = await load(${JSON.stringify(ring)});
  const W = ring.naturalWidth, H = ring.naturalHeight;
  const probe = canvas(W, H).getContext('2d', { willReadFrequently: true });
  probe.drawImage(ring, 0, 0);
  const alpha = probe.getImageData(0, 0, W, H).data;
  const at = (x, y) => alpha[(y * W + x) * 4 + 3];
  // Trou : les pixels transparents reliés au centre de l'image (remplissage par voisinage).
  const seen = new Uint8Array(W * H);
  const stack = [[W >> 1, H >> 1]];
  let n = 0, sx = 0, sy = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x] || at(x, y) >= 128) continue;
    seen[y * W + x] = 1; n++; sx += x; sy += y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const cx = sx / n, cy = sy / n;
  let rMax = 0, rMin = Infinity;
  for (let k = 0; k < 360; k++) {
    const t = (k / 360) * Math.PI * 2;
    let d = 0;
    while (d < W && at(Math.round(cx + d * Math.cos(t)), Math.round(cy + d * Math.sin(t))) < 128) d++;
    rMax = Math.max(rMax, d); rMin = Math.min(rMin, d);
  }
  // Boîte de l anneau (contrôle) ; le carré gardé est centré sur le trou : le médaillon tombe juste dans l anneau vert de la roue.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const left = Math.round(cx - ${CROP} / 2), top = Math.round(cy - ${CROP} / 2);
  const shrink = (src) => {
    // Réduction par paliers de moitié au plus, lissage de haute qualité : pas de moiré dans le chrome.
    let c = src;
    while (c.width / 2 > ${SMALL}) { const h = canvas(c.width >> 1, c.height >> 1); const g = h.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, h.width, h.height); c = h; }
    const s = canvas(${SMALL}, ${SMALL}); const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, ${SMALL}, ${SMALL});
    return s;
  };
  const files = {};
  const emit = (name, full) => {
    const crop = canvas(${CROP}, ${CROP});
    crop.getContext('2d').drawImage(full, -left, -top);
    files[name + '.png'] = crop.toDataURL('image/png');
    files[name + '-512.webp'] = shrink(crop).toDataURL('image/webp', 0.9);
  };
  const bare = canvas(W, H); bare.getContext('2d').drawImage(ring, 0, 0);
  emit('contour', bare);
  // Les emojis de « Montée » viennent de la police de couleur du système : attendre qu'elle soit prête.
  await document.fonts?.ready;
  for (const m of ${JSON.stringify(items)}) {
    const full = canvas(W, H); const g = full.getContext('2d');
    // Le disque de l'intérieur (rayon 147 sur 300) remplit le carré : il va jusqu'au plus grand rayon du trou, plus 6 px.
    const R = rMax + 6, side = Math.round(2 * R);
    const inner = canvas(side, side);
    CyberMedaillons.paint(m.name, inner.getContext('2d'), side);
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.drawImage(inner, cx - side / 2, cy - side / 2);
    g.restore();
    g.drawImage(ring, 0, 0);
    emit(m.name, full);
  }
  return { files, hole: { cx, cy, rMin, rMax }, box: [x0, y0, x1, y1], crop: [left, top] };
})()`;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8">');
  const url = (f) => 'file:///' + f.replace(/\\/g, '/');
  // Une page data: ne lit pas les fichiers : une page locale vide, à côté des sources, avec le dessin des intérieurs.
  const blank = path.join(out, '.page.html');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(blank, '<!doctype html><meta charset="utf-8"><script src="../medaillons-vivants.js"></script>');
  await win.loadFile(blank);
  fs.rmSync(blank);
  const result = await win.webContents.executeJavaScript(page(url(path.join(here, 'medaillons', 'contour.png')), MEDAILLONS));
  for (const [name, data] of Object.entries(result.files)) {
    const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(out, name), bytes);
    console.log(`${name.padEnd(22)} ${(bytes.length / 1024).toFixed(0).padStart(5)} Ko`);
  }
  console.log('trou', JSON.stringify(result.hole), 'boîte', result.box.join(' '), 'coupe', result.crop.join(' '));
  app.exit(0);
});
