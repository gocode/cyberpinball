// Banc hors écran du lancement en cinéma (lancé par docs\demo-cinema.ps1). Les vraies pages des
// fenêtres du menu (frontend.html, son preload, le protocole des médias) reçoivent l'état du
// chargement avec la part de chaque fenêtre (s.cinema), tel que viewFor (frontend.ts) l'envoie,
// posée à un instant donné depuis le Start ; leurs animations sont figées à cet instant
// (document.getAnimations, currentTime 0 : l'heure de la pose) et chaque écran est capturé. Le DMD
// reçoit l'image du vrai moteur (dmdAnimation('lancement')) au même instant. Le passage de relais :
// l'état de la partie, et le fondu figé à +120 ms. Les écrans d'un même instant sont assemblés en
// une planche (borne : fronton, DMD, plateau ; bureau : l'écran du bureau et le fronton).
//   electron docs/demo-cinema.cjs <spec.json>   { "root": racine des tables (demo-moments.cjs), "out": dossier des captures, "montages": [noms, facultatif],
//                                                "animation": [fichiers .webp, facultatif] }
// Montage « accueil » (seulement s'il est demandé) : la borne entière (playfield debout, topper,
// fronton, DMD) avec Neon Abyss, un jeu inventé de la page du projet (racine de demo-captures.cjs),
// à vingt-cinq instants du Start au relais ; les images sont assemblées comme
// docs\images\<langue>\cabinet.webp, en une animation WebP en boucle (spec.animation), sans texte
// traduit : la même image sert aux deux langues.
// Contrôles : garde-fou de mise en page (layout-check.ts) ; chaque fenêtre montre sa scène (départ,
// arrivée) ou aucune ; aucune couche du cinéma n'a de fond clair. Fenêtres jamais montrées
// (show: false, rendu hors écran, son coupé).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const specFile = process.argv.find((a) => a.endsWith('.json'));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

const { app, BrowserWindow, ipcMain } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
// Le protocole cyber-media:// est déclaré au chargement du module, avant que l'application soit prête.
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));
const { checkLayout } = require(path.join(REPO, 'app', 'dist', 'layout-check.js'));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const NEON = 'Neon Galaxy (Williams 1992)';
/**
 * Logo plus haut que sa boîte (300 × 520, demo-moments.cjs) : il doit s'y réduire et s'y centrer.
 * Le 29/10/2026, une roue de 1000 px sortait par le bas du fronton ; le logo large et bas de
 * Neon Galaxy ne pouvait pas le montrer.
 */
const ATLANTIS = 'Atlantis Deep (Bally 1975)';
/** Jeu inventé de la page du projet (docs\demo-captures.cjs), aux illustrations réalistes. */
const ABYSS = 'Neon Abyss (Orbital Works 1994)';
const LONG = 'Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)';
const FULL = { x: 0, y: 0, width: 1, height: 1 };
/** Fin d'une liste d'instants : le passage de relais, le fondu figé à +120 ms ; « relais+N » : figé à +N ms. */
const RELAIS = 'relais';
/** Instant d'une liste : ms depuis le Start (le relais : 3000 ms), et le fondu du relais (0 : avant le relais). */
function instant(at) {
  if (typeof at === 'number') return { T: at, relay: false, fade: 0, tag: String(at).padStart(4, '0') };
  const fade = at === RELAIS ? 120 : Number(at.split('+')[1]);
  return { T: 3000, relay: true, fade, tag: at === RELAIS ? 'relais' : `relais-${String(fade).padStart(4, '0')}` };
}

/**
 * Montages : fenêtres (rôle, taille, rotation du plateau, zones), table lancée, instants (ms
 * depuis le Start). Borne : plateau debout, fronton et DMD sur leurs écrans ; plateau couché et
 * tourné ; bureau : plateau dans la fenêtre 16:9, fronton sur un second écran ; replis.
 */
const SETUPS = [
  {
    name: 'borne',
    table: NEON,
    windows: [
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [120, 300, 520, 700, 1000, 1300, 3000, RELAIS],
  },
  {
    // Page du projet : la borne entière, du Start au relais, assez d'instants pour suivre le vol du logo.
    name: 'accueil',
    accueil: true,
    table: ABYSS,
    windows: [
      { role: 'topper', width: 1920, height: 540, zones: [{ role: 'topper', zone: FULL }] },
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [60, 140, 240, 300, 380, 460, 540, 620, 700, 780, 860, 940, 1020, 1100, 1200, 1300, 1400, 1600, 2000, 2600, 3000, 'relais+60', RELAIS, 'relais+180', 'relais+240'],
  },
  {
    name: 'borne-sans-logo',
    table: LONG,
    windows: [
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'dmd', width: 1920, height: 480, zones: [{ role: 'dmd', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [520, 3000],
  },
  {
    name: 'borne-logo-haut',
    table: ATLANTIS,
    windows: [
      { role: 'backglass', width: 1920, height: 1080, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'playfield', width: 1080, height: 1920 },
    ],
    times: [120, 3000],
  },
  {
    name: 'borne-pivotee',
    table: NEON,
    windows: [{ role: 'playfield', width: 3840, height: 2160, rotation: 90 }],
    times: [120, 520],
  },
  {
    name: 'bureau',
    table: NEON,
    windows: [
      { role: 'backglass', width: 1366, height: 768, zones: [{ role: 'backglass', zone: FULL }] },
      { role: 'playfield', width: 1920, height: 1080 },
    ],
    times: [120, 520, 1300, 3000, RELAIS],
  },
  {
    name: 'bureau-sans-fronton',
    table: NEON,
    windows: [{ role: 'playfield', width: 1920, height: 1080 }],
    times: [520, 3000],
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Une fenêtre détruite après chaque montage : l'application ne doit pas s'arrêter avec elle.
app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});

/** Capture d'une fenêtre hors écran ; une capture refusée (UnknownVizError) se refait après une image. */
async function capture(win) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await win.webContents.capturePage();
    } catch (error) {
      if (attempt >= 3) throw error;
      win.webContents.invalidate();
      await wait(250);
    }
  }
}

/** État d'une fenêtre au chargement, comme viewFor (frontend.ts). */
function stateFor(role, roles, medias, table, cinema) {
  const describe = { title: table.title, manufacturer: table.manufacturer, year: table.year, subtitle: [table.manufacturer, table.year].filter(Boolean).join(' · ') };
  return {
    role,
    phase: 'loading',
    help: false,
    count: 7,
    position: 3,
    table: describe,
    neighbors: [],
    menuLayout: 'medaillons',
    medias: Object.fromEntries(roles.map((r) => [r, medias.roleMedia(table, r)])),
    preload: [],
    cinema,
    loading: role === 'playfield' ? medias.typeMedia(table, 'playfield', 'Loading') : undefined,
    liveDmd: roles.includes('dmd') ? { area: core.liveDmdArea(undefined, { width: 1920, height: 480 }), framed: false } : undefined,
    footer: [],
    menuKeys: [],
    gameKeys: core.gameKeys(undefined),
    loadingKeys: { title: 'Commandes de la partie', rows: core.gameKeys(undefined), display: false },
    nav: {},
  };
}

/** L'état de la partie : VPX a paru (fond de partie figé). */
function gameFor(state, roles, medias, table) {
  return {
    ...state,
    phase: 'playing',
    cinema: undefined,
    game: { role: state.role, table: state.table, file: table.file, mode: 'still', medias: state.medias, play: Object.fromEntries(roles.map((r) => [r, 'still'])) },
  };
}

/** Fige les animations de la page à l'heure de leur pose ; le fondu du relais à +`fade` ms. */
const FREEZE = (fade) => `(() => {
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = a.animationName === 'cine-fin' ? ${fade} : 0;
  }
  // Aucune couche du cinéma n'a de fond clair (règle « jamais d'écran clair »).
  const light = [];
  for (const el of document.querySelectorAll('.cinema, .cinema *')) {
    const c = getComputedStyle(el).backgroundColor.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    const alpha = c.length > 3 ? c[3] : 1;
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (alpha > 0.05 && lum > 0.3) light.push(el.className);
  }
  return { light, etat: window.cyberEtat().cinema, elapsed: document.querySelector('.cinema')?.style.getPropertyValue('--cine-elapsed') };
})()`;

/** Planche d'un instant : les captures (fichiers du dossier de sortie) posées comme sur la borne, ou comme au bureau. */
async function sheet(name, title, files) {
  const img = (role, style) => (files[role] ? `<figure style="${style}"><img src="${encodeURI(files[role])}"><figcaption>${role}</figcaption></figure>` : '');
  const borne = name.startsWith('borne') && !name.includes('pivotee');
  const width = borne ? 1300 : 1240;
  const height = borne ? 1780 : name.includes('pivotee') ? 800 : 1150;
  const body = borne
    ? img('backglass', 'left:250px;top:80px;width:800px') + img('dmd', 'left:250px;top:550px;width:800px') + img('playfield', 'left:369px;top:770px;width:562px')
    : name.includes('pivotee')
      ? img('playfield', 'left:20px;top:80px;width:1200px')
      : img('backglass', 'left:320px;top:80px;width:600px') + img('playfield', 'left:20px;top:440px;width:1200px');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #010302; color: #e6f0ec; font: 600 26px Segoe UI, sans-serif; }
    h1 { position: absolute; left: 20px; top: 14px; margin: 0; font-size: 30px; }
    figure { position: absolute; margin: 0; } figure img { width: 100%; display: block; box-shadow: 0 0 0 2px #24504a; }
    figcaption { position: absolute; left: 6px; top: 4px; font-size: 14px; letter-spacing: .12em; color: #9bada7; background: rgba(0,0,0,.6); padding: 1px 6px; text-transform: uppercase; }
  </style><h1>${title}</h1>${body}`;
  const win = new BrowserWindow({ show: false, frame: false, width, height, useContentSize: true, enableLargerThanScreen: true, backgroundColor: '#010302', webPreferences: { offscreen: true } });
  win.setBounds({ x: 0, y: 0, width, height });
  const page = path.join(spec.out, 'planche.html');
  fs.writeFileSync(page, html, 'utf8');
  await win.loadFile(page);
  await wait(400);
  const image = await capture(win);
  win.destroy();
  fs.rmSync(page, { force: true });
  return image;
}

// ---------- Animation de la page du projet (montage « accueil ») ----------

/**
 * Mise en page de docs\images\<langue>\cabinet.webp, réduite : le playfield debout à gauche, le
 * topper, le fronton et le DMD à droite, dans l'ordre du meuble ; dessous, une frise du Start à VPX.
 * `speed` : ralenti (2 : deux fois plus lent que sur la borne, pour suivre le vol du logo) ;
 * chaque image dure le temps jusqu'à la suivante (entre `min` et `max` ms), la dernière `hold` ms.
 */
const ANIM = { m: 24, g: 16, pw: 520, ph: 924, cw: 816, timeline: 44, speed: 2, min: 90, max: 700, hold: 2600, quality: 0.8, edge: '#24504a', background: '#030807', signal: '#8be23a' };

/** Morceaux d'un fichier RIFF/WEBP. */
function riffChunks(buf) {
  const out = [];
  for (let o = 12; o + 8 <= buf.length; ) {
    const size = buf.readUInt32LE(o + 4);
    out.push({ id: buf.toString('ascii', o, o + 4), body: buf.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return out;
}
function riffChunk(id, body) {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body, Buffer.alloc(body.length & 1)]);
}
const u24 = (v) => Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255]);

/**
 * WebP animé (conteneur RIFF : VP8X, ANIM, un ANMF par image), assemblé ici à partir des WebP fixes
 * que Chromium encode (canvas.toDataURL) : aucune dépendance. Chaque image ne porte que le rectangle
 * qui a changé depuis la précédente (posé sans mélange, rien n'est effacé après).
 */
function muxWebp(width, height, background, frames) {
  let alpha = false;
  const anmf = frames.map((f) => {
    const parts = riffChunks(f.webp).filter((c) => ['ALPH', 'VP8 ', 'VP8L'].includes(c.id));
    if (!parts.some((c) => c.id !== 'ALPH')) throw new Error('Image WebP sans données VP8');
    alpha ||= parts.some((c) => c.id === 'ALPH' || c.id === 'VP8L');
    const head = Buffer.concat([u24(f.x / 2), u24(f.y / 2), u24(f.w - 1), u24(f.h - 1), u24(f.duration), Buffer.from([0x02])]);
    return riffChunk('ANMF', Buffer.concat([head, ...parts.map((c) => riffChunk(c.id, c.body))]));
  });
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
  const vp8x = riffChunk('VP8X', Buffer.concat([Buffer.from([0x02 | (alpha ? 0x10 : 0), 0, 0, 0]), u24(width - 1), u24(height - 1)]));
  const anim = riffChunk('ANIM', Buffer.from([b, g, r, 255, 0, 0]));
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), vp8x, anim, ...anmf]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Page de l'assemblage : chaque image de la borne posée à sa place, la frise, le rectangle changé encodé en WebP. */
const ANIM_PAGE = (layout) => `<!doctype html><meta charset="utf-8"><script>
const L = ${JSON.stringify(layout)};
const c = document.createElement('canvas'); c.width = L.width; c.height = L.height;
const g = c.getContext('2d', { willReadFrequently: true });
let previous;
const load = async (src) => { const i = new Image(); i.src = encodeURI(src); await i.decode(); return i; };
function timeline(f) {
  const y = L.track.y, x0 = L.track.x0, x1 = L.track.x1;
  g.font = '700 15px "Segoe UI", sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = '#9bada7'; g.textAlign = 'right'; g.fillText('START', x0 - 14, y);
  g.fillStyle = f.relay ? L.signal : '#9bada7'; g.textAlign = 'left'; g.fillText('VPX', x1 + 14, y);
  g.strokeStyle = L.edge; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  const x = x0 + (x1 - x0) * f.progress;
  g.strokeStyle = L.signal; g.beginPath(); g.moveTo(x0, y); g.lineTo(x, y); g.stroke();
  g.fillStyle = L.signal; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
  if (!f.relay) { g.fillStyle = '#e6f0ec'; g.textAlign = 'center'; g.font = '600 13px "Segoe UI", sans-serif'; g.fillText(f.T + ' ms', Math.min(Math.max(x, x0 + 30), x1 - 30), y - 16); }
}
window.drawFrame = async (f) => {
  g.fillStyle = L.background; g.fillRect(0, 0, L.width, L.height);
  g.imageSmoothingQuality = 'high';
  for (const [role, [x, y, w, h]] of Object.entries(L.places)) {
    const img = await load(f.files[role]);
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, 8); g.clip(); g.drawImage(img, x, y, w, h); g.restore();
    g.strokeStyle = L.edge; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, h - 2, 8); g.stroke();
  }
  timeline(f);
  const cur = g.getImageData(0, 0, L.width, L.height).data;
  let x0 = 0, y0 = 0, x1 = L.width - 1, y1 = L.height - 1;
  if (previous) {
    x0 = L.width; y0 = L.height; x1 = -1; y1 = -1;
    for (let y = 0; y < L.height; y++) for (let x = 0; x < L.width; x++) {
      const o = (y * L.width + x) * 4;
      if (Math.abs(cur[o] - previous[o]) + Math.abs(cur[o + 1] - previous[o + 1]) + Math.abs(cur[o + 2] - previous[o + 2]) > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  previous = cur;
  if (x1 < 0) return null;
  // Le rectangle d'une image animée commence sur une coordonnée paire.
  x0 -= x0 % 2; y0 -= y0 % 2;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const crop = document.createElement('canvas'); crop.width = w; crop.height = h;
  crop.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const url = crop.toDataURL('image/webp', L.quality);
  if (!url.startsWith('data:image/webp')) throw new Error('Chromium n’encode pas le WebP');
  return { x: x0, y: y0, w, h, data: url.split(',')[1] };
};
// Relecture de l'animation par le décodeur de Chromium : nombre d'images, et quelques images en PNG.
window.check = async (b64, picks) => {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  if (typeof ImageDecoder === 'undefined') return { frames: -1, shots: [] };
  const d = new ImageDecoder({ data: bytes, type: 'image/webp' });
  await d.tracks.ready;
  const frames = d.tracks.selectedTrack.frameCount;
  const shots = [];
  for (const i of picks.filter((i) => i < frames)) {
    const { image } = await d.decode({ frameIndex: i });
    const v = document.createElement('canvas'); v.width = image.displayWidth; v.height = image.displayHeight;
    v.getContext('2d').drawImage(image, 0, 0); image.close();
    shots.push(v.toDataURL('image/png').split(',')[1]);
  }
  return { frames, shots };
};
</script>`;

/** Les images du montage « accueil » en une animation WebP en boucle. */
async function animation(frames) {
  const { m, g, pw, ph, cw } = ANIM;
  const [th, bh, dh] = [540, 1080, 480].map((h) => Math.round((cw * h) / 1920));
  const x2 = m + pw + g;
  const top = m + Math.round((ph - (th + bh + dh + 2 * g)) / 2);
  const width = x2 + cw + m;
  const height = m + ph + ANIM.timeline;
  const layout = {
    width,
    height,
    quality: ANIM.quality,
    edge: ANIM.edge,
    background: ANIM.background,
    signal: ANIM.signal,
    places: { playfield: [m, m, pw, ph], topper: [x2, top, cw, th], backglass: [x2, top + th + g, cw, bh], dmd: [x2, top + th + bh + 2 * g, cw, dh] },
    track: { y: m + ph + Math.round(ANIM.timeline / 2), x0: m + 70, x1: width - m - 60 },
  };
  const page = path.join(spec.out, 'animation.html');
  fs.writeFileSync(page, ANIM_PAGE(layout), 'utf8');
  const win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile(page);
  // Temps de chaque image : ms depuis le Start (le relais : sa fin, 3000 ms + le fondu).
  const at = frames.map((f) => (f.relay ? 3000 + f.fade : f.T));
  const end = at[at.length - 1];
  const out = [];
  for (const [i, f] of frames.entries()) {
    const duration = i === frames.length - 1 ? ANIM.hold : Math.min(ANIM.max, Math.max(ANIM.min, (at[i + 1] - at[i]) * ANIM.speed));
    const shot = await win.webContents.executeJavaScript(`drawFrame(${JSON.stringify({ files: f.files, T: f.T, relay: f.relay, progress: at[i] / end })})`);
    // Rien n'a changé : l'image d'avant dure d'autant plus.
    if (!shot) out[out.length - 1].duration += duration;
    else out.push({ x: shot.x, y: shot.y, w: shot.w, h: shot.h, duration, webp: Buffer.from(shot.data, 'base64') });
  }
  const data = muxWebp(width, height, ANIM.background, out);
  const picks = [0, Math.floor(out.length / 2), out.length - 1];
  const seen = await win.webContents.executeJavaScript(`check(${JSON.stringify(data.toString('base64'))}, ${JSON.stringify(picks)})`);
  seen.shots.forEach((png, k) => fs.writeFileSync(path.join(spec.out, `animation-${String(picks[k]).padStart(2, '0')}.png`), Buffer.from(png, 'base64')));
  win.destroy();
  fs.rmSync(page, { force: true });
  return { data, width, height, frames: out.length, decoded: seen.frames, duration: out.reduce((s, f) => s + f.duration, 0) };
}

app.whenReady().then(async () => {
  ipcMain.on('i18n', (e) => (e.returnValue = {}));
  ipcMain.on('ready', () => {});
  ipcMain.on('media-error', (_e, error) => console.log(`Média illisible : ${JSON.stringify(error)}`));
  const tables = core.scanTables(path.join(spec.root, 'tables'));
  const byTitle = (title) => tables.find((t) => `${t.title} (${t.manufacturer} ${t.year})` === title || path.basename(t.file, '.vpx') === title);
  const dataDir = path.join(spec.out, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const allowed = new Set();
  serveMedias(() => [...allowed]);
  const problems = [];
  let launch = 0;
  // Le montage de la page du projet ne tourne que demandé (-Accueil) : il a sa propre racine de tables.
  for (const setup of SETUPS.filter((s) => (s.accueil ? spec.montages?.includes(s.name) : !spec.montages?.length || spec.montages.includes(s.name)))) {
    const table = byTitle(setup.table);
    if (!table) {
      problems.push(`${setup.name} : table introuvable (${setup.table})`);
      continue;
    }
    const playfield = setup.windows.find((w) => w.role === 'playfield');
    const medias = new core.MenuMedias({ root: spec.root, dataDir, rotation: playfield?.rotation ?? 0, b2s: false });
    for (const dir of medias.allowedDirs(tables)) allowed.add(dir);
    const hasBackglass = setup.windows.some((w) => (w.zones ?? []).some((z) => z.role === 'backglass'));
    const frames = [];
    for (const at of setup.times) {
      launch++;
      const { T, relay, fade, tag } = instant(at);
      const files = {};
      for (const w of setup.windows) {
        const roles = [...(w.role === 'playfield' ? ['playfield'] : []), ...(w.zones ?? []).map((z) => z.role)];
        const win = new BrowserWindow({
          show: false,
          frame: false,
          skipTaskbar: true,
          focusable: false,
          width: w.width,
          height: w.height,
          useContentSize: true,
          enableLargerThanScreen: true,
          backgroundColor: '#030807',
          webPreferences: { offscreen: true, preload: path.join(REPO, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true },
        });
        win.webContents.setAudioMuted(true);
        win.setBounds({ x: 0, y: 0, width: w.width, height: w.height });
        await win.loadFile(path.join(REPO, 'app', 'renderer', 'frontend.html'), { query: { role: w.role, rotation: String(w.rotation ?? 0), zones: JSON.stringify(w.zones ?? []) } });
        // Les médias de la table se chargent d'abord (vidéo de chargement, fronton) ; puis la chorégraphie, à l'instant voulu.
        win.webContents.send('state', stateFor(w.role, roles, medias, table, undefined));
        await wait(1200);
        const cinema = { title: table.title, manufacturer: table.manufacturer, year: table.year, logo: medias.wheel(table), id: launch, startedAt: Date.now() - T, depart: w.role === 'playfield', arrivee: roles.includes('backglass') };
        const state = stateFor(w.role, roles, medias, table, cinema.depart || cinema.arrivee ? cinema : undefined);
        win.webContents.send('state', state);
        if (roles.includes('dmd')) win.webContents.send('dmd', { media: false, dots: core.dmdAnimation('lancement', { label: table.title }).dots(T) });
        if (relay) {
          await wait(50);
          // La page retire la couche quand son fondu est fini (minuteur de 240 ms) : à figer aussi, le temps de la capture.
          await win.webContents.executeJavaScript('window.setTimeout = () => 0; true');
          win.webContents.send('state', gameFor(state, roles, medias, table));
        }
        await wait(50);
        const seen = await win.webContents.executeJavaScript(FREEZE(fade));
        await wait(300);
        const shot = await capture(win);
        const where = `${setup.name} ${relay ? `relais +${fade} ms` : `${T} ms`} ${w.role}`;
        // Ce que montre la fenêtre : sa scène, ou rien ; au relais, la scène qui s'efface.
        const want = relay ? (cinema.depart || cinema.arrivee ? 'fin' : '') : [cinema.depart && 'depart', cinema.arrivee && 'arrivee'].filter(Boolean).join(',');
        const got = relay ? (seen.etat.length && seen.etat.every((s) => s.fin) ? 'fin' : seen.etat.length ? 'sans fondu' : '') : seen.etat.map((s) => s.scene).join(',');
        if (got !== want) problems.push(`${where} : scène ${got || 'aucune'} au lieu de ${want || 'aucune'}`);
        const face = seen.etat[0]?.visage;
        if (face && face !== (cinema.logo ? 'logo' : 'médaillon')) problems.push(`${where} : ${face} au lieu du ${cinema.logo ? 'logo' : 'médaillon'}`);
        if (seen.light.length) problems.push(`${where} : fond clair dans le cinéma (${seen.light.join(', ')})`);
        const found = await checkLayout(win.webContents);
        for (const p of found) problems.push(`${where} : ${p}`);
        files[w.role] = `${setup.name}-${tag}-${w.role}.png`;
        fs.writeFileSync(path.join(spec.out, files[w.role]), shot.toPNG());
        console.log(`${where} : ${got || 'aucune scène'}${face ? ` (${face})` : ''}, posée à ${seen.elapsed || '-'} ms${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
        win.destroy();
      }
      if (setup.accueil) {
        frames.push({ T, relay, fade, files });
        continue;
      }
      const label = relay ? `VPX prend la main (+${fade} ms) : coup de bobine, fondu` : `${T} ms depuis le Start`;
      const title = `${setup.name} · ${label}${hasBackglass ? '' : ' · sans fronton'}${medias.wheel(table) ? '' : ' · sans logo'}`;
      fs.writeFileSync(path.join(spec.out, `planche-${setup.name}-${tag}.png`), (await sheet(setup.name, title, files)).toPNG());
    }
    if (setup.accueil && spec.animation?.length) {
      const anim = await animation(frames);
      for (const out of spec.animation) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, anim.data);
      }
      console.log(`Animation : ${anim.frames} images, ${anim.width} × ${anim.height}, ${Math.round(anim.data.length / 1024)} Ko, ${(anim.duration / 1000).toFixed(1)} s en boucle → ${spec.animation.join(', ')}`);
      if (anim.decoded !== anim.frames) problems.push(`accueil : l'animation relue a ${anim.decoded} images au lieu de ${anim.frames}`);
      if (anim.data.length > 4 * 1024 * 1024) problems.push(`accueil : animation de ${Math.round(anim.data.length / 1024)} Ko (4 Mo au plus)`);
    }
  }
  fs.writeFileSync(path.join(spec.out, 'mise-en-page.txt'), `${problems.length ? problems.join('\n') : 'Aucun problème.'}\n`, 'utf8');
  console.log(problems.length ? `Cinéma : ${problems.length} problème(s).` : 'Cinéma : chaque écran montre sa part, aucun problème de mise en page.');
  app.exit(problems.length ? 1 : 0);
});
