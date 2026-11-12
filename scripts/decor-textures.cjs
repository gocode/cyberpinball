// Textures du décor de réalité virtuelle (caisse et capsule, packages/core/src/decor.ts) :
// habillage des flancs, sol de la capsule, nébuleuses du ciel, grille des enceintes, lueur. Dessinées
// une fois, hors écran, dans Electron (canvas et police Saira du dépôt), et versionnées dans
// packages/casque-vr/decor/. À relancer seulement si leur dessin change :
//   npx electron scripts/decor-textures.cjs
// Le dessin reprend la maquette validée le 12 novembre 2026.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const REPO = path.join(__dirname, '..');
const OUT = path.join(REPO, 'packages', 'casque-vr', 'decor');
const FONT = path.join(REPO, 'app', 'renderer', 'polices', 'saira', 'Saira-wdth-wght.ttf');

// Jamais de boîte d'erreur à l'écran : l'erreur va dans la sortie, et l'application s'arrête.
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

// Code exécuté dans la page : chaque texture rendue en data URL.
const PAGE = String.raw`
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let seed = 1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Habillage d'un flanc (gauche, vu de l'extérieur : l'arrière de la caisse à gauche, l'avant à droite).
// 2 px par millimètre sur 1 060 × 440 mm ; le flanc droit le reprend en miroir (coordonnées u inversées).
function flanc() {
  const W = 2120, H = 880, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#07110f'; g.fillRect(0, 0, W, H);
  seed = 11; for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(255,255,255,' + (rnd() * .025) + ')'; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  g.fillStyle = '#0c1a17'; g.beginPath(); g.moveTo(0, H); g.lineTo(1040, H); g.lineTo(1640, 0); g.lineTo(600, 0); g.closePath(); g.fill();
  g.strokeStyle = '#24504a'; g.lineWidth = 6; for (const o of [0, 52]) { g.beginPath(); g.moveTo(1120 + o, H); g.lineTo(1720 + o, 0); g.stroke(); }
  g.strokeStyle = '#36c9b4'; g.lineWidth = 12; g.beginPath(); g.moveTo(0, H - 96); g.lineTo(W, H - 96); g.stroke();
  g.strokeStyle = '#24504a'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, H - 68); g.lineTo(W, H - 68); g.stroke();
  g.font = '300 116px Saira'; g.textBaseline = 'middle';
  const sp = 58, wOf = (t) => [...t].reduce((s, ch) => s + g.measureText(ch).width + sp, 0), total = wOf('CYBER') + 80 + wOf('PINBALL');
  let x = (W - total) / 2;
  for (const [t, col] of [['CYBER', '#e6f0ec'], ['PINBALL', '#8be23a']]) { g.fillStyle = col; for (const ch of t) { g.fillText(ch, x, 330); x += g.measureText(ch).width + sp; } x += 80; }
  return c;
}

// Sol de la capsule, vu de dessus (le centre de l'image au centre de l'ovale).
function sol() {
  const S = 2048, c = canvas(S, S), g = c.getContext('2d'), m = S / 2;
  g.fillStyle = '#07110f'; g.fillRect(0, 0, S, S);
  seed = 21; for (let i = 0; i < 30000; i++) { g.fillStyle = 'rgba(255,255,255,' + (rnd() * .018) + ')'; g.fillRect(rnd() * S, rnd() * S, 3, 3); }
  g.strokeStyle = '#030807'; g.lineWidth = 3;
  for (const r of [.18, .34, .52, .7, .86]) { g.beginPath(); g.arc(m, m, m * r, 0, 7); g.stroke(); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; g.beginPath(); g.moveTo(m + Math.cos(a) * m * .18, m + Math.sin(a) * m * .18); g.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m); g.stroke(); }
  g.fillStyle = 'rgba(12,26,23,.6)';
  for (let k = 0; k < 16; k += 2) { const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2; g.beginPath(); g.arc(m, m, m * .7, a0, a1); g.arc(m, m, m * .52, a1, a0, true); g.fill(); }
  for (const r of [.93, .955]) { g.strokeStyle = 'rgba(54,201,180,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(m, m, m * r, Math.PI * .62, Math.PI * 2.38); g.stroke(); g.strokeStyle = 'rgba(28,143,128,.18)'; g.lineWidth = 26; g.stroke(); }
  return c;
}

// Ciel équirectangulaire : u = azimut (0 devant, croissant vers la gauche), v = 0 au zénith.
// Directions : az > 0 à gauche ; devant le joueur : -z.
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, z) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, sm = (t) => t * t * (3 - 2 * t); let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash3(xi + a, yi + b, zi + c) * (a ? sm(xf) : 1 - sm(xf)) * (b ? sm(yf) : 1 - sm(yf)) * (c ? sm(zf) : 1 - sm(zf)); return r; }
const fbm = (d, k) => { let s = 0, a = .5, f = k; for (let i = 0; i < 5; i++) { s += a * noise(d.x * f + 7.1, d.y * f + 3.3, d.z * f + 1.7); a *= .5; f *= 2.03; } return s; };
const dirOf = (az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return { x: -Math.sin(a) * Math.cos(e), y: Math.sin(e), z: -Math.cos(a) * Math.cos(e) }; };
const NEB = [
  { d: dirOf(70, 12), w: 34, c: [28, 143, 128], a: .55 }, { d: dirOf(52, -4), w: 24, c: [47, 143, 92], a: .45 }, { d: dirOf(88, 28), w: 20, c: [31, 90, 154], a: .45 },
  { d: dirOf(-78, 16), w: 34, c: [31, 90, 154], a: .55 }, { d: dirOf(-58, 2), w: 22, c: [28, 143, 128], a: .5 }, { d: dirOf(-98, 32), w: 22, c: [47, 143, 92], a: .4 },
  { d: dirOf(30, 48), w: 18, c: [22, 56, 73], a: .45 }, { d: dirOf(-35, 52), w: 18, c: [28, 111, 128], a: .4 }, { d: dirOf(170, 20), w: 40, c: [31, 90, 154], a: .45 },
];
function nebuleuses() {
  const W = 2048, H = 1024, sw = 640, sh = 320, small = canvas(sw, sh), sg = small.getContext('2d'), img = sg.createImageData(sw, sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const az = ((i + .5) / sw) * 360, el = 90 - ((j + .5) / sh) * 180, d = dirOf(az, el);
    let col = [3, 8, 7];
    for (const n of NEB) {
      const ang = Math.acos(Math.max(-1, Math.min(1, d.x * n.d.x + d.y * n.d.y + d.z * n.d.z))) * 180 / Math.PI;
      const den = Math.exp(-(ang * ang) / (2 * n.w * n.w)) * Math.min(1, Math.max(0, fbm(d, 2.2) * 1.9 - .3));
      col = col.map((v, k) => v + (n.c[k] - v) * Math.min(1, n.a * den));
    }
    const o = (j * sw + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  const c = canvas(W, H), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.filter = 'blur(3px)';
  // Raccord sans couture à u = 0 : l'image est dessinée trois fois côte à côte avant le flou.
  for (const dx of [-W, 0, W]) g.drawImage(small, dx, 0, W, H);
  return c;
}

function grille() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#0a0f0e'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#1f2a28';
  for (let y = 8; y < S; y += 10) for (let x = 8 + ((y / 10) % 2) * 5; x < S; x += 10) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  return c;
}

function lueur() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.45, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  return c;
}

(async () => {
  await document.fonts.load('300 116px Saira');
  return {
    'flanc.png': flanc().toDataURL('image/png'),
    'sol.png': sol().toDataURL('image/png'),
    'nebuleuses.jpg': nebuleuses().toDataURL('image/jpeg', .9),
    'grille.png': grille().toDataURL('image/png'),
    'lueur.png': lueur().toDataURL('image/png'),
  };
})();
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { offscreen: true } });
  const font = fs.readFileSync(FONT).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Saira;src:url(data:font/ttf;base64,${font});}</style><body></body>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const images = await win.webContents.executeJavaScript(PAGE);
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url] of Object.entries(images)) {
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(OUT, name), bytes);
    console.log(`${name} : ${(bytes.length / 1024).toFixed(0)} Kio`);
  }
  app.exit(0);
});
