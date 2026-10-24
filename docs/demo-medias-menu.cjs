// Démonstration hors écran des médias dans les fenêtres du menu (tâche T2).
//
//   npm run build
//   npx electron docs/demo-medias-menu.cjs [dossier de sortie]   (défaut : tmp\medias-menu)
//
// Fabrique un bac à sable (<sortie>\racine) : huit tables, des médias générés ici
// (images PNG, vidéos WebM enregistrées depuis un canvas, un .directb2s, une vidéo
// abîmée, des défauts de la borne), puis ouvre les fenêtres du menu SANS LES MONTRER
// (show: false, rendu hors écran) avec le vrai frontend.html, le vrai preload et le
// vrai protocole des médias, et capture chaque écran à chaque étape dans <sortie>\captures.
// Aucune fenêtre n'apparaît, aucune ne prend le focus, VPX n'est jamais lancé.
//
// rapport.json : pour chaque capture, les textes qui se chevauchent ou débordent de
// l'écran (doit rester vide), le média affiché par chaque couche, et les erreurs de
// lecture remontées au processus principal.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const REPO = path.join(__dirname, '..');
// Avant que l'application soit prête : enregistre le schéma cyber-media.
const { serveMedias } = require(path.join(REPO, 'app', 'dist', 'media-protocol.js'));
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));

const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs')) ?? path.join(REPO, 'tmp', 'medias-menu'));
const ROOT = path.join(OUT, 'racine');
const DATA = path.join(ROOT, 'data');
const SHOTS = path.join(OUT, 'captures');

// Les profils de Chromium vont dans le bac à sable, pas dans %APPDATA%.
app.setPath('userData', path.join(OUT, 'electron'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Médias générés

/**
 * Chaque média porte son nom, une bande « FLIPPERS » au bord des flippers (pour
 * vérifier la rotation à l'œil) et, pour les vidéos, une bille qui bouge.
 */
const GENERATOR = `
window.makeMedia = async (spec) => {
  const c = document.createElement('canvas');
  c.width = spec.w; c.height = spec.h;
  const g = c.getContext('2d');
  const draw = (t) => {
    if (spec.transparent) g.clearRect(0, 0, spec.w, spec.h);
    else {
      const grad = g.createLinearGradient(0, 0, spec.w, spec.h);
      grad.addColorStop(0, 'hsl(' + spec.hue + ', 80%, 35%)');
      grad.addColorStop(1, 'hsl(' + ((spec.hue + 60) % 360) + ', 80%, 15%)');
      g.fillStyle = grad; g.fillRect(0, 0, spec.w, spec.h);
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(2, spec.w / 200);
      for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(spec.w * i / 8, 0); g.lineTo(spec.w * i / 8, spec.h); g.stroke(); }
    }
    if (spec.flippers) {
      const band = Math.round(Math.min(spec.w, spec.h) * 0.12);
      g.fillStyle = 'rgba(255, 220, 0, 0.9)';
      const r = { bottom: [0, spec.h - band, spec.w, band], top: [0, 0, spec.w, band], left: [0, 0, band, spec.h], right: [spec.w - band, 0, band, spec.h] }[spec.flippers];
      g.fillRect(...r);
      g.save(); g.fillStyle = '#000'; g.font = 'bold ' + Math.round(band * 0.55) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(r[0] + r[2] / 2, r[1] + r[3] / 2);
      if (spec.flippers === 'left' || spec.flippers === 'right') g.rotate(spec.flippers === 'right' ? -Math.PI / 2 : Math.PI / 2);
      g.fillText('FLIPPERS', 0, 0); g.restore();
    }
    g.fillStyle = spec.transparent ? 'hsl(' + spec.hue + ', 90%, 60%)' : '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.round(Math.min(spec.h * 0.22, spec.w / (spec.label.length * 0.62)));
    g.font = '900 ' + size + 'px sans-serif';
    if (spec.transparent) { g.lineWidth = size / 10; g.strokeStyle = '#000'; g.strokeText(spec.label, spec.w / 2, spec.h / 2); }
    g.fillText(spec.label, spec.w / 2, spec.h / 2);
    if (spec.video) {
      g.fillStyle = '#fff';
      const x = spec.w * (0.15 + 0.7 * ((Math.sin(t * 3) + 1) / 2));
      g.beginPath(); g.arc(x, spec.h * 0.78, Math.min(spec.w, spec.h) * 0.05, 0, Math.PI * 2); g.fill();
    }
  };
  if (!spec.video) {
    draw(0);
    return c.toDataURL('image/png').split(',')[1];
  }
  const stream = c.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  const start = performance.now();
  draw(0);
  rec.start(250);
  const timer = setInterval(() => draw((performance.now() - start) / 1000), 33);
  await new Promise((r) => setTimeout(r, spec.seconds * 1000));
  clearInterval(timer);
  rec.stop();
  await done;
  const buf = await new Blob(parts, { type }).arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
`;

const TABLES = [
  {
    name: 'Neon Galaxy (Williams 1992)',
    medias: {
      Playfield: { ext: 'webm', w: 1280, h: 720, hue: 200, label: 'NEON GALAXY plateau', flippers: 'right', video: true },
      Wheel: { ext: 'png', w: 900, h: 300, hue: 190, label: 'NEON GALAXY', transparent: true },
      Backglass: { ext: 'webm', w: 1024, h: 820, hue: 280, label: 'NEON fronton', video: true },
      DMD: { ext: 'png', w: 512, h: 128, hue: 30, label: 'NEON DMD' },
      Topper: { ext: 'webm', w: 1280, h: 360, hue: 320, label: 'NEON topper', video: true },
    },
  },
  {
    name: "Pharaoh's Gold (Gottlieb 1979)",
    medias: {
      Playfield: { ext: 'png', w: 1080, h: 1920, hue: 45, label: 'PHARAOH plateau', flippers: 'bottom' },
    },
    directb2s: { w: 1024, h: 768, hue: 40, label: 'PHARAOH .directb2s' },
  },
  {
    // Pire cas du menu : titre très long, version, logo au-dessus du titre ; aucun autre média.
    name: 'Le très long titre d’une table imaginaire pour vérifier les débordements du menu et des écrans (Stern 2020) VPW Mod 2.0.1 avec une version très longue elle aussi',
    medias: { Wheel: { ext: 'png', w: 800, h: 450, hue: 260, label: 'TITRE LONG', transparent: true } },
  },
  {
    name: 'Rocket Rally (Data East 1988)',
    medias: {
      Playfield: { ext: 'webm', w: 540, h: 960, hue: 120, label: 'ROCKET plateau', flippers: 'bottom', video: true },
      Wheel: { ext: 'png', w: 500, h: 500, hue: 100, label: 'RR', transparent: true },
      FullDMD: { ext: 'webm', w: 960, h: 540, hue: 15, label: 'ROCKET FullDMD', video: true },
    },
    // Fichier abîmé au bon nom : erreur de lecture remontée, puis repli.
    broken: '(Backglass) Rocket Rally (Data East 1988).mp4',
  },
  { name: 'Atlantis Deep (Bally 1975)', medias: { Wheel: { ext: 'png', w: 300, h: 520, hue: 210, label: 'AD', transparent: true } } },
  { name: 'Volcano Run (Stern 2005)', medias: { Wheel: { ext: 'png', w: 1000, h: 220, hue: 10, label: 'VOLCANO RUN', transparent: true } } },
  { name: 'Ice Castle (Gottlieb 1984)', medias: {} },
  { name: 'Jungle Quest (Williams 1995)', medias: { Wheel: { ext: 'png', w: 700, h: 400, hue: 140, label: 'JUNGLE', transparent: true } } },
];

function directb2s(png) {
  const b64 = (png.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return `<DirectB2SData Version="1.2">\r\n  <Name Value="Démo" />\r\n  <Images>\r\n    <BackglassOnImage Value="${b64}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`;
}

async function buildSandbox() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, 'media'), { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  const gen = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await gen.loadURL('data:text/html,<meta charset=utf-8><title>générateur</title>');
  await gen.webContents.executeJavaScript(`${GENERATOR}; true`);
  const make = async (spec) => Buffer.from(await gen.webContents.executeJavaScript(`makeMedia(${JSON.stringify({ seconds: 2, ...spec })})`), 'base64');
  for (const t of TABLES) {
    const folder = path.join(ROOT, 'tables', t.name);
    fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(folder, `${t.name}.vpx`), '');
    for (const [type, spec] of Object.entries(t.medias)) {
      fs.writeFileSync(path.join(folder, 'medias', `(${type}) ${t.name}.${spec.ext}`), await make(spec));
    }
    if (t.directb2s) fs.writeFileSync(path.join(folder, `${t.name}.directb2s`), directb2s(await make(t.directb2s)));
    if (t.broken) fs.writeFileSync(path.join(folder, 'medias', t.broken), Buffer.from('ceci n’est pas une vidéo'.repeat(40)));
  }
  // Défaut de la borne pour le topper.
  fs.writeFileSync(path.join(ROOT, 'media', '(Topper).png'), await make({ w: 1280, h: 360, hue: 180, label: 'TOPPER DE LA BORNE' }));
  gen.destroy();
}

// ---------------------------------------------------------------------------
// Fenêtres du menu, hors écran

const SCENARIOS = [
  {
    // Borne : playfield couché, flippers à gauche (menu en portrait), fronton partagé avec le DMD 4:1, topper.
    id: 'borne-flippers-gauche',
    rotation: 90,
    cabinet: { dmd: [1920, 1080], dmdZone: true },
    windows: [
      { role: 'playfield', w: 1920, h: 1080, parts: [] },
      { role: 'backglass', w: 1920, h: 1080, parts: (() => {
        const z = core.splitBackglassDmd({ width: 1920, height: 1080 }, 4);
        return [{ role: 'backglass', zone: z.backglass }, { role: 'dmd', zone: z.dmd }];
      })() },
      { role: 'topper', w: 1920, h: 540, parts: [{ role: 'topper', zone: core.FULL_ZONE }] },
    ],
  },
  {
    // PC : playfield debout (menu en paysage) avec le DMD incrusté, fronton seul sur son écran.
    id: 'pc-paysage-dmd-incruste',
    rotation: 0,
    cabinet: { dmd: [1920, 1080], embedded: true },
    windows: [
      { role: 'playfield', w: 1920, h: 1080, parts: [{ role: 'dmd', zone: core.embeddedDmdZone({ width: 1920, height: 1080 }, 'bottom') }] },
      { role: 'backglass', w: 1280, h: 1024, parts: [{ role: 'backglass', zone: core.FULL_ZONE }] },
    ],
  },
  {
    id: 'borne-flippers-droite',
    rotation: 270,
    cabinet: { dmd: [1024, 256] },
    windows: [
      { role: 'playfield', w: 1920, h: 1080, parts: [] },
      { role: 'dmd', w: 1024, h: 256, parts: [{ role: 'dmd', zone: core.FULL_ZONE }] },
    ],
  },
];

function fakeCabinet(spec, scenario) {
  const screens = [
    { fingerprint: 'pf', strength: 'strong', label: 'pf', widthPx: 1920, heightPx: 1080, widthCm: 0, heightCm: 0 },
    { fingerprint: 'dmd', strength: 'strong', label: 'dmd', widthPx: spec.dmd[0], heightPx: spec.dmd[1], widthCm: 0, heightCm: 0 },
  ];
  const zones = {};
  const dmdWindow = scenario.windows.flatMap((w) => w.parts).find((p) => p.role === 'dmd');
  if (dmdWindow) zones.dmd = dmdWindow.zone;
  return { version: 1, screens, roles: { playfield: 'pf', dmd: 'dmd' }, zones, vpx: { iniPath: '' }, updatedAt: '' };
}

/** État d'une fenêtre, comme viewFor (app/src/frontend.ts) le construit. */
function viewFor(ctx, win, index, extra = {}) {
  const { tables, medias } = ctx;
  const table = tables[index];
  const wheel = (t) => (win.role === 'playfield' ? medias.wheel(t) : undefined);
  const describe = (t) => ({ title: t.title, subtitle: [t.manufacturer, t.year].filter(Boolean).join(' · '), version: t.version, plays: 3, lastRun: '2026-10-20T20:00:00Z', wheel: wheel(t) });
  const at = (o) => tables[(index + o + tables.length * 10) % tables.length];
  const roles = [...(win.role === 'playfield' ? ['playfield'] : []), ...win.parts.map((p) => p.role)];
  const mediasOf = (t) => Object.fromEntries(roles.map((r) => [r, medias.roleMedia(t, r)]));
  const preload = [...new Set([1, -1, 2, -2].map(at))].filter((t) => t !== table).flatMap((t) => roles.map((r) => medias.roleMedia(t, r))).filter((v) => v.url);
  const playing = extra.game ? table : undefined;
  return {
    role: win.role,
    phase: extra.phase ?? 'menu',
    help: Boolean(extra.help),
    count: tables.length,
    position: index + 1,
    table: describe(table),
    neighbors: [-3, -2, -1, 0, 1, 2, 3].map((offset) => ({ offset, title: at(offset).title, version: at(offset).version, wheel: wheel(at(offset)) })),
    medias: mediasOf(table),
    preload,
    game: playing ? { role: win.role, table: describe(playing), file: playing.file, mode: extra.game, medias: mediasOf(playing) } : undefined,
    gameKeys: [['Flippers', 'Maj gauche / Maj droite']],
    menuKeys: [],
    footer: [['Flippers : choisir'], ['Start : fiche', 'Enter'], ['H : commandes', 'KeyH'], ['R : réglages', 'KeyR'], ['Exit : menu', 'Escape']],
    nav: { confirm: 'Enter', exit: 'Escape', help: 'KeyH', helpLabel: 'H' },
  };
}

/** Textes qui se chevauchent ou sortent de l'écran (évalué dans la page). */
const LAYOUT_CHECK = `(() => {
  const pick = (sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent !== null || getComputedStyle(n).position === 'fixed');
  // Une superposition opaque (aide, fiche, message) cache le menu : seuls ses textes comptent.
  const cover = document.querySelector('#root .overlay, #root .lib');
  const blocks = pick('.brand, .counter, .banner, .footer, .selected .logo, .selected .title, .selected .subtitle, .selected .version, .selected .stats, .wheel li, .zone .secondary .title, .zone .secondary .subtitle, .game-title').filter((n) => !cover || cover.contains(n) || n.closest('#zones'));
  const vw = innerWidth, vh = innerHeight;
  const rects = blocks.map((n) => ({ n, r: n.getBoundingClientRect(), name: n.className || n.tagName }));
  const problems = [];
  for (const { r, name } of rects) {
    if (r.width === 0 || r.height === 0) continue;
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) problems.push('hors écran : ' + name);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.n.contains(b.n) || b.n.contains(a.n)) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 1 && y > 1) problems.push('chevauchement : ' + a.name + ' / ' + b.name);
  }
  // Texte coupé sans points de suspension (la liste coupe volontairement avec « … »).
  for (const n of pick('.selected .title, .selected .subtitle, .zone .secondary .title, .footer, .brand')) {
    if (n.scrollWidth > n.clientWidth + 1) problems.push('déborde : ' + n.className + ' (' + n.scrollWidth + ' > ' + n.clientWidth + ' px)');
  }
  const layers = [...document.querySelectorAll('.media-layer')].map((l) => {
    const slot = [...l.querySelectorAll('.media-slot')].pop();
    const m = slot?.querySelector('video, img, canvas');
    return {
      couche: l.parentElement.id || l.parentElement.className,
      element: m ? m.tagName.toLowerCase() : slot?.querySelector('.media-fallback') ? 'repli' : 'vide',
      fichier: m?.currentSrc ? decodeURIComponent(m.currentSrc).replace(/^.*[\\\\/]/, '').replace(/\\?v=.*$/, '') : undefined,
      rotation: slot?.querySelector('.media-frame')?.dataset.rotation,
      lecture: m?.tagName === 'VIDEO' ? (m.paused ? 'en pause' : 'en lecture') : undefined,
      couches: l.querySelectorAll('.media-slot').length,
    };
  });
  return { problems, layers };
})()`;

async function openScenario(ctx, scenario) {
  const preload = path.join(REPO, 'app', 'dist', 'preload.js');
  const html = path.join(REPO, 'app', 'renderer', 'frontend.html');
  const wins = [];
  for (const w of scenario.windows) {
    const win = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      width: w.w,
      height: w.h,
      useContentSize: true,
      frame: false,
      backgroundColor: '#05060a',
      webPreferences: { preload, contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false },
    });
    win.webContents.setFrameRate(30);
    const ready = new Promise((resolve) => ipcMain.once('ready', resolve));
    await win.loadFile(html, { query: { role: w.role, rotation: String(w.role === 'playfield' ? scenario.rotation : 0), zones: JSON.stringify(w.parts) } });
    await ready;
    wins.push({ ...w, win });
  }
  return wins;
}

async function step(ctx, scenario, wins, name, index, extra, wait = 1100) {
  for (const w of wins) w.win.webContents.send('state', viewFor(ctx, w, index, extra));
  await delay(wait);
  const results = [];
  for (const w of wins) {
    const image = await w.win.webContents.capturePage();
    const file = `${scenario.id}-${name}-${w.role}.png`;
    fs.writeFileSync(path.join(SHOTS, file), image.toPNG());
    const check = await w.win.webContents.executeJavaScript(LAYOUT_CHECK);
    results.push({ capture: file, ...check });
    for (const p of check.problems) console.log(`  ⚠ ${file} : ${p}`);
  }
  return results;
}

app.whenReady().then(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) fs.rmSync(path.join(SHOTS, f));
  console.log(`Bac à sable : ${ROOT}`);
  await buildSandbox();
  const tables = core.scanTables(path.join(ROOT, 'tables'));
  // Journal du médecin (T11), comme frontend.ts : <données>\logs\medias-erreurs.json.
  const errorLog = core.mediaErrorsFile(path.join(DATA, 'logs'));
  let ctx;
  serveMedias(() => ctx.medias.allowedDirs(tables));
  ipcMain.on('media-error', (_e, error) => {
    const file = core.mediaPathFromUrl(String(error?.url ?? ''));
    if (!file || !core.isServedMedia(file, ctx.medias.allowedDirs(tables))) return;
    const entry = core.recordMediaError(errorLog, { file, role: String(error.role), type: String(error.type), code: typeof error.code === 'number' ? error.code : undefined, image: error.image === true, message: String(error.message) });
    if (entry?.count === 1) console.log(`  erreur de lecture remontée : ${error.message} : ${path.basename(file)}`);
  });

  const report = { racine: ROOT, captures: [] };
  const index = (prefix) => tables.findIndex((t) => t.title.startsWith(prefix));
  for (const scenario of SCENARIOS) {
    console.log(`Scénario ${scenario.id}`);
    const medias = new core.MenuMedias({ root: ROOT, dataDir: DATA, cabinet: fakeCabinet(scenario.cabinet, scenario), rotation: scenario.rotation });
    ctx = { tables, medias };
    // Image du .directb2s extraite d'avance (en vrai, en tâche de fond pendant la navigation).
    for (const t of tables) medias.roleMedia(t, 'backglass');
    while (medias.pendingB2s) await delay(50);
    medias.invalidate();
    const wins = await openScenario(ctx, scenario);
    const shots = [];
    shots.push(...(await step(ctx, scenario, wins, '1-neon-video', index('Neon'), {}, 1600)));
    // Fondu enchaîné saisi au milieu : l'ancienne et la nouvelle table se superposent.
    shots.push(...(await step(ctx, scenario, wins, '2-pharaoh-fondu', index('Pharaoh'), {}, 120)));
    shots.push(...(await step(ctx, scenario, wins, '3-pharaoh-portrait-b2s', index('Pharaoh'), {}, 900)));
    shots.push(...(await step(ctx, scenario, wins, '4-sans-media-titre-long', index('Le très long'), {})));
    shots.push(...(await step(ctx, scenario, wins, '5-rocket-video-portrait-abimee', index('Rocket'), {}, 1600)));
    // Navigation en rafale (5 tables en 200 ms) : à la fin, une seule couche par écran.
    const start = index('Neon');
    for (let k = 1; k <= 5; k++) {
      for (const w of wins) w.win.webContents.send('state', viewFor(ctx, w, (start + k) % tables.length));
      await delay(40);
    }
    const burst = await step(ctx, scenario, wins, '5b-apres-rafale', (start + 5) % tables.length, {}, 1200);
    for (const c of burst) for (const l of c.layers) if (l.couches !== 1) c.problems.push(`rafale : ${l.couches} couches dans ${l.couche}`);
    shots.push(...burst);
    // Aide par-dessus le menu : le fond vidéo du playfield se met en pause.
    const help = await step(ctx, scenario, wins, '5c-aide', start, { help: true }, 1600);
    const pf = help.find((c) => c.capture.endsWith('-playfield.png'));
    const bg = pf?.layers.find((l) => l.couche === 'media-bg');
    if (bg?.lecture !== 'en pause') pf.problems.push(`aide : fond du playfield ${bg?.lecture ?? 'absent'}`);
    shots.push(...help);
    // Fenêtre cachée : toutes les vidéos en pause, puis reprise.
    await step(ctx, scenario, wins, '5d-menu', start, {}, 800);
    const setHidden = (on) => `Object.defineProperty(document, 'hidden', { value: ${on}, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));`;
    const pausedVideos = `new Promise((r) => setTimeout(() => r([...document.querySelectorAll('video')].filter((v) => v.isConnected).map((v) => v.paused)), 300))`;
    for (const w of wins) {
      const paused = await w.win.webContents.executeJavaScript(`${setHidden(true)} ${pausedVideos}`);
      const resumed = await w.win.webContents.executeJavaScript(`${setHidden(false)} ${pausedVideos}`);
      const problems = [];
      if (paused.some((p) => !p)) problems.push('fenêtre cachée : une vidéo continue');
      if (resumed.some((p) => p)) problems.push('fenêtre revenue : une vidéo reste en pause');
      for (const p of problems) console.log(`  ⚠ ${scenario.id} ${w.role} : ${p}`);
      shots.push({ capture: `${scenario.id}-5e-fenetre-cachee-${w.role} (sans capture)`, problems, layers: [], videos: { cachee: paused, revenue: resumed } });
    }
    shots.push(...(await step(ctx, scenario, wins, '6-partie-figee', index('Neon'), { game: 'still', phase: 'playing' }, 1600)));
    shots.push(...(await step(ctx, scenario, wins, '7-partie-animee', index('Neon'), { game: 'animated', phase: 'playing' }, 1600)));
    shots.push(...(await step(ctx, scenario, wins, '8-partie-eteinte', index('Neon'), { game: 'off', phase: 'playing' }, 600)));
    shots.push(...(await step(ctx, scenario, wins, '9-partie-sans-media', index('Le très long'), { game: 'still', phase: 'playing' }, 900)));
    for (const w of wins) w.win.destroy();
    report.captures.push(...shots);
  }
  report.erreursDeLecture = core.readMediaErrors(errorLog);
  report.problemes = report.captures.flatMap((c) => c.problems.map((p) => `${c.capture} : ${p}`));
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(report, null, 2));
  console.log(`${report.captures.length} captures dans ${SHOTS}`);
  console.log(`Textes qui se chevauchent ou débordent : ${report.problemes.length || 'aucun'}`);
  console.log(`Erreurs de lecture remontées : ${report.erreursDeLecture.map((e) => path.basename(e.file)).join(', ') || 'aucune'}`);
  app.quit();
});

app.on('window-all-closed', () => {});
// Une erreur dans la démonstration l'arrête au lieu de la laisser attendre sans fin (fenêtres cachées).
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
