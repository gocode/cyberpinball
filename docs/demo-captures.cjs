// Tables inventées et leurs médias, dessinés ici, pour les captures de la page du projet
// (docs\demo-captures.ps1) : aucune œuvre de tiers, ni table, ni média, ni nom de jeu réel.
// Pour chaque jeu : logo (Wheel), plateau vu de dessus, flippers en bas (Playfield),
// fronton (Backglass), afficheur à points (DMD), topper, prospectus (GameInfo), règles
// (GameHelp), et un .info (titre, fabricant, année, parties jouées).
//
//   npx electron docs/demo-captures.cjs <racine du bac à sable>
//   npx electron docs/demo-captures.cjs --planche <planche.json>
//
// --planche : assemble des captures en une image WebP pour la page du projet (calques :
// fichier, place, taille, quart de tour pour remettre à l'endroit un playfield couché).
//
// Dessin sur un canvas dans une fenêtre JAMAIS montrée (show: false, rendu hors écran).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ARGS = process.argv.slice(2).filter((a) => !a.endsWith('.cjs'));
const boardArg = ARGS.includes('--planche') ? ARGS[ARGS.indexOf('--planche') + 1] : undefined;
const BOARD = boardArg && path.resolve(boardArg);
const ROOT = path.resolve(ARGS.find((a) => !a.startsWith('-') && a !== boardArg) ?? path.join(__dirname, '..', 'tmp', 'demo-captures', 'root'));

app.setPath('userData', path.join(BOARD ? path.dirname(BOARD) : path.join(ROOT, '..'), 'generateur'));

/** Jeux inventés : titre, fabricant, année, teintes (principale, secondaire). */
const GAMES = [
  { title: 'Neon Abyss', maker: 'Orbital Works', year: 1994, hues: [188, 312], starts: 42, minutes: 318 },
  { title: 'Star Courier', maker: 'Halcyon', year: 1987, hues: [28, 210], starts: 17, minutes: 96 },
  { title: 'Midnight Circuit', maker: 'Voltage Games', year: 1998, hues: [276, 128], starts: 63, minutes: 541 },
  { title: 'Atlas Rising', maker: 'Meridian', year: 1979, hues: [44, 356], starts: 8, minutes: 37 },
  { title: 'Thunder Reef', maker: 'Gulfstream', year: 1991, hues: [172, 52], starts: 25, minutes: 140 },
  { title: 'Lunar Diner', maker: 'Halcyon', year: 1964, hues: [330, 160], starts: 4, minutes: 12 },
  { title: 'Copper Comet', maker: 'Meridian', year: 1983, hues: [18, 196], starts: 11, minutes: 58 },
];

// Dessins, exécutés dans la page du générateur. Chaque fonction reçoit (g, w, h, spec).
const PAINTER = String.raw`
const hsl = (h, s, l, a = 1) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
const FONT = '"Segoe UI Black", "Arial Black", sans-serif';

function rand(seed) { let x = seed * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); }

/** Titre en lettres chromées, contour sombre et halo de néon. */
function logo(g, w, h, s) {
  const words = s.title.toUpperCase().split(' ');
  const lines = words.length > 1 && s.title.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [s.title.toUpperCase()];
  let size = h / (lines.length * 1.05);
  g.font = 'italic 900 ' + size + 'px ' + FONT;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  size = Math.min(size, size * (w * 0.92) / widest);
  g.font = 'italic 900 ' + size + 'px ' + FONT;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 0.98;
    g.save();
    g.shadowColor = hsl(s.hues[0], 100, 55, 0.95); g.shadowBlur = size * 0.35;
    g.lineWidth = size * 0.16; g.strokeStyle = hsl(s.hues[0], 90, 12); g.lineJoin = 'round';
    g.strokeText(line, w / 2, y);
    g.restore();
    const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, hsl(s.hues[0], 95, 78)); grad.addColorStop(0.5, hsl(s.hues[0], 90, 42)); grad.addColorStop(1, hsl(s.hues[1], 95, 70));
    g.fillStyle = grad; g.fillText(line, w / 2, y);
    g.lineWidth = Math.max(1, size * 0.025); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.strokeText(line, w / 2, y);
  });
}

function starfield(g, w, h, s, count) {
  const r = rand(s.year);
  for (let i = 0; i < count; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (0.3 + r() * 0.7) + ')';
    const d = r() * 2.4 + 0.4;
    g.beginPath(); g.arc(r() * w, r() * h, d, 0, Math.PI * 2); g.fill();
  }
}

/** Fond de fronton : ciel, rayons, astre, sol quadrillé ; titre et afficheurs de score. */
function scene(g, w, h, s, withScores) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, hsl(s.hues[1], 70, 8)); sky.addColorStop(0.55, hsl(s.hues[0], 75, 22)); sky.addColorStop(1, hsl(s.hues[1], 80, 12));
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  starfield(g, w, h * 0.6, s, 220);
  const cx = w / 2, cy = h * 0.58;
  g.save(); g.globalAlpha = 0.18;
  for (let i = 0; i < 36; i++) {
    g.fillStyle = i % 2 ? hsl(s.hues[0], 100, 70) : hsl(s.hues[1], 100, 60);
    const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 0.5) / 36) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w); g.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w); g.fill();
  }
  g.restore();
  const sun = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.3);
  sun.addColorStop(0, hsl(s.hues[1], 100, 85)); sun.addColorStop(0.6, hsl(s.hues[1], 95, 55)); sun.addColorStop(1, hsl(s.hues[1], 95, 45, 0));
  g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, h * 0.3, 0, Math.PI * 2); g.fill();
  // Sol quadrillé en perspective.
  const horizon = h * 0.66;
  g.fillStyle = hsl(s.hues[0], 80, 6); g.fillRect(0, horizon, w, h - horizon);
  g.strokeStyle = hsl(s.hues[0], 100, 60, 0.75); g.lineWidth = Math.max(1, w / 500);
  for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(cx + i * w * 0.02, horizon); g.lineTo(cx + i * w * 0.16, h); g.stroke(); }
  for (let k = 1; k < 9; k++) { const y = horizon + (h - horizon) * Math.pow(k / 8, 1.8); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.save(); g.translate(0, h * 0.06); logo(g, w, h * 0.34, s); g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 ' + Math.round(h * 0.035) + 'px ' + FONT; g.textAlign = 'center';
  g.fillText(s.maker.toUpperCase() + '  ·  ' + s.year, w / 2, h * 0.47);
  if (withScores) {
    const bw = w * 0.2, bh = h * 0.07, y = h * 0.86;
    for (let i = 0; i < 4; i++) {
      const x = w * 0.06 + i * (bw + w * 0.027);
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(x, y, bw, bh);
      g.strokeStyle = hsl(s.hues[0], 90, 60); g.lineWidth = 2; g.strokeRect(x, y, bw, bh);
      g.fillStyle = hsl(28, 100, 58); g.font = '700 ' + Math.round(bh * 0.62) + 'px Consolas, monospace'; g.textBaseline = 'middle';
      g.fillText(i === 0 ? '1,250,480' : '00', x + bw / 2, y + bh / 2);
    }
  }
}

/** Plateau vu de dessus, flippers en bas : rampes, champignons, lance-balles, inserts. */
function playfield(g, w, h, s) {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, hsl(s.hues[0], 70, 16)); bg.addColorStop(0.5, hsl(s.hues[1], 60, 11)); bg.addColorStop(1, hsl(s.hues[0], 75, 9));
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  starfield(g, w, h, s, 160);
  const u = w / 100;
  // Bordure et couloir du lanceur.
  g.strokeStyle = hsl(s.hues[0], 90, 70); g.lineWidth = u * 1.2; g.shadowColor = hsl(s.hues[0], 100, 60); g.shadowBlur = u * 3;
  g.beginPath(); g.moveTo(u * 4, h - u * 30); g.lineTo(u * 4, u * 40); g.arcTo(u * 4, u * 4, u * 50, u * 4, u * 46); g.arcTo(u * 96, u * 4, u * 96, u * 40, u * 46); g.lineTo(u * 96, h - u * 4); g.stroke();
  g.beginPath(); g.moveTo(u * 89, h - u * 4); g.lineTo(u * 89, u * 40); g.stroke();
  // Rampes : deux bandes translucides.
  const ramp = (x0, y0, cx1, cy1, x1, y1, hue) => {
    g.lineCap = 'round'; g.strokeStyle = hsl(hue, 100, 60, 0.35); g.lineWidth = u * 7; g.shadowBlur = 0;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx1, cy1, x1, y1); g.stroke();
    g.strokeStyle = hsl(hue, 100, 80, 0.9); g.lineWidth = u * 0.5; g.shadowBlur = u * 2; g.shadowColor = hsl(hue, 100, 60);
    g.beginPath(); g.moveTo(x0 - u * 3, y0); g.quadraticCurveTo(cx1 - u * 3, cy1, x1 - u * 3, y1); g.stroke();
    g.beginPath(); g.moveTo(x0 + u * 3, y0); g.quadraticCurveTo(cx1 + u * 3, cy1, x1 + u * 3, y1); g.stroke();
  };
  ramp(u * 18, h * 0.62, u * 6, h * 0.2, u * 40, h * 0.1, s.hues[1]);
  ramp(u * 78, h * 0.6, u * 92, h * 0.22, u * 60, h * 0.12, s.hues[0]);
  // Logo au centre.
  g.shadowBlur = 0;
  g.save(); g.translate(u * 10, h * 0.33); logo(g, u * 76, h * 0.12, s); g.restore();
  // Champignons.
  for (const [x, y] of [[38, 0.2], [58, 0.19], [48, 0.27]]) {
    const cx = u * x, cy = h * y, r = u * 6;
    const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.35, hsl(s.hues[1], 100, 65)); grad.addColorStop(1, hsl(s.hues[1], 90, 25));
    g.shadowColor = hsl(s.hues[1], 100, 60); g.shadowBlur = u * 4;
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = u * 0.8; g.strokeStyle = '#fff'; g.stroke();
  }
  g.shadowBlur = 0;
  // Inserts : flèches et pastilles allumées.
  const r2 = rand(s.year + 7);
  for (let i = 0; i < 18; i++) {
    const x = u * (14 + r2() * 70), y = h * (0.45 + r2() * 0.3), hue = r2() > 0.5 ? s.hues[0] : s.hues[1];
    g.fillStyle = hsl(hue, 100, 60, 0.9); g.shadowColor = hsl(hue, 100, 60); g.shadowBlur = u * 2;
    g.beginPath(); g.arc(x, y, u * (1 + r2() * 1.2), 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = u * (30 + i * 10), y = h * 0.74;
    g.fillStyle = hsl(s.hues[0], 100, 62, 0.85); g.shadowBlur = u * 2;
    g.beginPath(); g.moveTo(x, y - u * 3); g.lineTo(x + u * 2.5, y + u * 1.5); g.lineTo(x - u * 2.5, y + u * 1.5); g.closePath(); g.fill();
  }
  // Lance-balles en triangle et flippers.
  g.shadowBlur = u * 3; g.shadowColor = hsl(s.hues[1], 100, 60);
  g.fillStyle = hsl(s.hues[1], 85, 55);
  g.beginPath(); g.moveTo(u * 14, h * 0.8); g.lineTo(u * 14, h * 0.88); g.lineTo(u * 26, h * 0.9); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(u * 82, h * 0.8); g.lineTo(u * 82, h * 0.88); g.lineTo(u * 70, h * 0.9); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = u * 0.6;
  g.beginPath(); g.moveTo(u * 8, h * 0.78); g.lineTo(u * 8, h * 0.9); g.lineTo(u * 31, h * 0.925); g.stroke();
  g.beginPath(); g.moveTo(u * 88, h * 0.78); g.lineTo(u * 88, h * 0.9); g.lineTo(u * 65, h * 0.925); g.stroke();
  const flipper = (x, dir) => {
    g.save(); g.translate(x, h * 0.925); g.rotate(dir * 0.5);
    g.fillStyle = '#f8fafc'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = u;
    g.beginPath(); g.arc(0, 0, u * 2.4, Math.PI / 2, Math.PI * 1.5); g.lineTo(dir * u * 11, -u * 0.9); g.arc(dir * u * 11, 0, u * 0.9, -Math.PI / 2, Math.PI / 2, dir < 0); g.closePath();
    g.fill(); g.fillStyle = hsl(s.hues[0], 90, 45); g.fillRect(dir > 0 ? 0 : -u * 11, -u * 0.5, u * 11, u * 1);
    g.restore();
  };
  flipper(u * 33, 1); flipper(u * 63, -1);
  // Bille.
  const ball = g.createRadialGradient(u * 90.5, h * 0.84, u * 0.3, u * 92.5, h * 0.85, u * 2.4);
  ball.addColorStop(0, '#fff'); ball.addColorStop(1, '#6b7280');
  g.shadowBlur = 0; g.fillStyle = ball; g.beginPath(); g.arc(u * 92.5, h * 0.85, u * 2.2, 0, Math.PI * 2); g.fill();
}

/** Afficheur à points orange, 128 × 32 points. */
function dmd(g, w, h, s) {
  g.fillStyle = '#050302'; g.fillRect(0, 0, w, h);
  const cols = 128, rows = 32;
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const m = c.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, cols, rows);
  m.fillStyle = '#fff'; m.textAlign = 'center'; m.textBaseline = 'middle';
  m.font = '700 13px Consolas, monospace'; m.fillText(s.title.toUpperCase(), cols / 2, 9);
  m.font = '700 11px Consolas, monospace'; m.fillText(s.dmdLine ?? 'PRESS START', cols / 2, 23);
  const px = m.getImageData(0, 0, cols, rows).data;
  const cw = w / cols, ch = h / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = px[(y * cols + x) * 4] / 255;
    g.fillStyle = v > 0.35 ? 'rgba(255,' + Math.round(110 + 40 * v) + ',20,' + (0.55 + 0.45 * v) + ')' : 'rgba(60,25,5,0.55)';
    g.beginPath(); g.arc((x + 0.5) * cw, (y + 0.5) * ch, Math.min(cw, ch) * 0.4, 0, Math.PI * 2); g.fill();
  }
}

function topper(g, w, h, s) {
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, hsl(s.hues[1], 80, 10)); grad.addColorStop(0.5, hsl(s.hues[0], 80, 22)); grad.addColorStop(1, hsl(s.hues[1], 80, 10));
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  starfield(g, w, h, s, 120);
  g.strokeStyle = hsl(s.hues[0], 100, 65); g.lineWidth = h / 40; g.shadowColor = hsl(s.hues[0], 100, 60); g.shadowBlur = h / 10;
  for (const y of [h * 0.12, h * 0.88]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.shadowBlur = 0;
  g.save(); g.translate(w * 0.2, h * 0.18); logo(g, w * 0.6, h * 0.64, s); g.restore();
}

function flyer(g, w, h, s) {
  scene(g, w, h * 0.75, s, false);
  g.fillStyle = '#0b0b0f'; g.fillRect(0, h * 0.75, w, h * 0.25);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 ' + Math.round(h * 0.045) + 'px ' + FONT; g.fillText('4 PLAYER  ·  MULTIBALL', w / 2, h * 0.82);
  g.fillStyle = hsl(s.hues[0], 90, 70); g.font = '700 ' + Math.round(h * 0.03) + 'px ' + FONT;
  g.fillText('3 RAMPS  ·  2 FLIPPERS  ·  WIZARD MODE', w / 2, h * 0.89);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '600 ' + Math.round(h * 0.022) + 'px ' + FONT;
  g.fillText(s.maker.toUpperCase() + '  ·  ' + s.year, w / 2, h * 0.95);
}

function rules(g, w, h, s) {
  g.fillStyle = '#f5efe0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = hsl(s.hues[0], 70, 30); g.lineWidth = w / 120; g.strokeRect(w * 0.03, h * 0.04, w * 0.94, h * 0.92);
  g.fillStyle = hsl(s.hues[0], 70, 25); g.textAlign = 'center';
  g.font = '900 ' + Math.round(h * 0.08) + 'px ' + FONT; g.fillText(s.title.toUpperCase(), w / 2, h * 0.17);
  g.font = '700 ' + Math.round(h * 0.04) + 'px ' + FONT; g.fillStyle = '#222';
  g.textAlign = 'left';
  ['LIGHT ALL 5 TARGETS FOR EXTRA BALL', 'RAMP COMBOS ADVANCE THE BONUS X', 'SPELL THE TITLE TO START MULTIBALL', 'TILT DISQUALIFIES BALL IN PLAY', 'REPLAY AWARDED FOR HIGH SCORE'].forEach((line, i) => {
    g.fillText('•  ' + line, w * 0.09, h * (0.32 + i * 0.12));
  });
}

window.paint = (kind, spec) => {
  const c = document.createElement('canvas'); c.width = spec.w; c.height = spec.h;
  const g = c.getContext('2d');
  ({ logo, scene: (g2, w, h, s) => scene(g2, w, h, s, true), playfield, dmd, topper, flyer, rules })[kind](g, spec.w, spec.h, spec);
  return c.toDataURL(spec.type || 'image/png', 0.9).split(',')[1];
};
`;

/**
 * Planche : { out, width, height, background, quality, layers: [{ src, x, y, w, h, turn, crop, radius }] }.
 * `turn` : quarts de tour dans le sens des aiguilles d'une montre (-1 : un quart dans l'autre sens),
 * appliqués avant de placer l'image dans son cadre ; `crop` : [x, y, w, h] de l'image source.
 */
async function board(file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL('data:text/html,<meta charset=utf-8><title>planche</title>');
  const layers = spec.layers.map((l) => ({ ...l, data: `data:image/png;base64,${fs.readFileSync(l.src).toString('base64')}` }));
  const out = await win.webContents.executeJavaScript(`(async () => {
    const spec = ${JSON.stringify({ ...spec, layers })};
    const c = document.createElement('canvas'); c.width = spec.width; c.height = spec.height;
    const g = c.getContext('2d');
    g.fillStyle = spec.background || '#030807'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    for (const l of spec.layers) {
      const img = new Image(); img.src = l.data; await img.decode();
      const [sx, sy, sw, sh] = l.crop || [0, 0, img.width, img.height];
      const turn = ((l.turn || 0) % 4 + 4) % 4;
      g.save();
      if (l.radius) { g.beginPath(); g.roundRect(l.x, l.y, l.w, l.h, l.radius); g.clip(); }
      g.translate(l.x + l.w / 2, l.y + l.h / 2);
      g.rotate(turn * Math.PI / 2);
      const [dw, dh] = turn % 2 ? [l.h, l.w] : [l.w, l.h];
      g.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      g.restore();
      if (l.border) { g.strokeStyle = l.border; g.lineWidth = 2; g.beginPath(); g.roundRect(l.x + 1, l.y + 1, l.w - 2, l.h - 2, l.radius || 0); g.stroke(); }
    }
    return c.toDataURL('image/webp', spec.quality || 0.82).split(',')[1];
  })()`);
  fs.mkdirSync(path.dirname(spec.out), { recursive: true });
  fs.writeFileSync(spec.out, Buffer.from(out, 'base64'));
  console.log(`Planche : ${spec.out} (${Math.round(fs.statSync(spec.out).size / 1024)} Ko)`);
  win.destroy();
}

app.whenReady().then(async () => {
  if (BOARD) {
    await board(BOARD);
    return app.quit();
  }
  fs.rmSync(ROOT, { recursive: true, force: true });
  for (const dir of ['tables', 'media', 'import', 'data', 'trash']) fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const gen = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await gen.loadURL('data:text/html,<meta charset=utf-8><title>generateur</title>');
  await gen.webContents.executeJavaScript(`${PAINTER}; true`);
  const paint = async (kind, spec) => Buffer.from(await gen.webContents.executeJavaScript(`paint(${JSON.stringify(kind)}, ${JSON.stringify(spec)})`), 'base64');
  for (const [i, game] of GAMES.entries()) {
    const name = `${game.title} (${game.maker} ${game.year})`;
    const folder = path.join(ROOT, 'tables', name);
    const medias = path.join(folder, 'medias');
    fs.mkdirSync(medias, { recursive: true });
    fs.writeFileSync(path.join(folder, `${name}.vpx`), '');
    const file = (type, ext) => path.join(medias, `(${type}) ${name}.${ext}`);
    fs.writeFileSync(file('Wheel', 'png'), await paint('logo', { ...game, w: 900, h: 420 }));
    fs.writeFileSync(file('Playfield', 'png'), await paint('playfield', { ...game, w: 1080, h: 1920 }));
    fs.writeFileSync(file('Backglass', 'png'), await paint('scene', { ...game, w: 1280, h: 1024 }));
    fs.writeFileSync(file('DMD', 'png'), await paint('dmd', { ...game, w: 1024, h: 256 }));
    fs.writeFileSync(file('Topper', 'png'), await paint('topper', { ...game, w: 1920, h: 540 }));
    fs.writeFileSync(file('GameInfo', 'jpg'), await paint('flyer', { ...game, w: 800, h: 1100, type: 'image/jpeg' }));
    fs.writeFileSync(file('GameHelp', 'png'), await paint('rules', { ...game, w: 1000, h: 700 }));
    const info = {
      Info: { Title: game.title, Manufacturer: game.maker, Year: game.year },
      // Dates fixes : les captures ne changent pas d'un passage à l'autre.
      User: { StartCount: game.starts, RunTime: game.minutes * 60, LastRun: new Date(Date.UTC(2026, 9, 20 - i * 3, 19, 14)).toISOString() },
    };
    fs.writeFileSync(path.join(folder, `${name}.info`), JSON.stringify(info, null, 2));
    console.log(`Table : ${name}`);
  }
  gen.destroy();
  app.quit();
});

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
