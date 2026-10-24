// Outils de docs/demo-medias.ps1 (preuves du jalon « Habillage des écrans », tâche T12 de
// docs/recherche/medias.md, § 5.5). Trois usages :
//
//   node docs/demo-medias.cjs modele <écrans simulés .json> <cabinet.json à écrire> <VPinballX.ini du bac à sable>
//       Modèle de borne qui correspond aux écrans simulés (docs\ecrans\borne.json ou
//       poste-deux-ecrans.json) : rôles, zones, bord des flippers.
//   electron docs/demo-medias.cjs generer <racine du bac à sable>
//       Trois tables et leurs médias, générés ici : une complète (tous les types, deux pages
//       de prospectus, une carte de règles, musique, son de lancement, vidéo de chargement),
//       une partielle (logo, plateau en image, fronton tiré du .directb2s), une sans aucun
//       média (titre très long) ; un défaut de la borne dans <racine>\media (topper).
//   electron docs/demo-medias.cjs verifier <dossier des captures> [rotation du menu]
//       Écrans vides (image uniforme) relevés dans vides.txt ; une planche par étape
//       (tous les écrans de la borne côte à côte, le playfield redressé comme le joueur le
//       voit) dans <captures>\planches.
//
// Images PNG et vidéos WebM dessinées sur un canvas dans une fenêtre JAMAIS montrée (show:
// false, rendu hors écran, son coupé). Chaque média porte son nom en gros et, au plateau et
// au chargement, une bande « FLIPPERS » au bord des flippers, pour vérifier la rotation à l'œil.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const [mode, ...args] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('.cjs'));

// ---------------------------------------------------------------------------
// Modèle de borne pour les écrans simulés

const LAYOUTS = {
  // Borne : playfield 4K couché (joueur au bord gauche de l'image), fronton, DMD 4:1, topper.
  borne: { flipperEdge: 'left', roles: { playfield: 0, backglass: 1, dmd: 2, topper: 3 } },
  // Poste de bureau : playfield en paysage sur un écran, fronton et DMD en bande sur l'autre ;
  // l'écran principal (celui du développeur) reste libre.
  'poste-deux-ecrans': { flipperEdge: 'bottom', roles: { playfield: 2, backglass: 0, dmd: 0 }, dmdUnderBackglass: true },
};

function writeModel(screensFile, out, ini) {
  const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
  const name = path.basename(screensFile, '.json');
  const layout = LAYOUTS[name];
  if (!layout) throw new Error(`Pas de disposition prévue pour ${name} (${Object.keys(LAYOUTS).join(', ')}).`);
  const displays = core.parseSimulatedDisplays(JSON.parse(fs.readFileSync(screensFile, 'utf8').replace(/^﻿/, '')), name);
  // Même ordre que le fichier : les indices de LAYOUTS s'y rapportent.
  const raw = JSON.parse(fs.readFileSync(screensFile, 'utf8').replace(/^﻿/, ''));
  const ordered = raw.map((r) => displays.find((d) => d.devicePath === r.devicePath));
  const screens = ordered.map((d) => core.toPhysicalScreen(d));
  const roles = Object.fromEntries(Object.entries(layout.roles).map(([role, i]) => [role, screens[i].fingerprint]));
  const zones = {};
  if (layout.dmdUnderBackglass) {
    const s = screens[layout.roles.backglass];
    Object.assign(zones, core.splitBackglassDmd({ width: s.widthPx, height: s.heightPx }));
  }
  const model = { version: 1, screens, roles, ...(Object.keys(zones).length ? { zones } : {}), playfield: { flipperEdge: layout.flipperEdge }, vpx: { iniPath: ini }, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(model, null, 2));
  console.log(`Modèle : ${Object.entries(roles).map(([r, f]) => `${r} → ${screens.find((s) => s.fingerprint === f).label}`).join(', ')}${layout.dmdUnderBackglass ? ' (DMD en bande sous le fronton)' : ''}, flippers : ${layout.flipperEdge}.`);
}

if (mode === 'modele') {
  writeModel(path.resolve(args[0]), path.resolve(args[1]), path.resolve(args[2]));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Électron : génération des médias, vérification des captures

const { app, BrowserWindow, nativeImage } = require('electron');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(2, spec.w / 200);
      for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(spec.w * i / 8, 0); g.lineTo(spec.w * i / 8, spec.h); g.stroke(); }
    }
    if (spec.flippers) {
      const band = Math.round(Math.min(spec.w, spec.h) * 0.12);
      g.fillStyle = 'rgba(255, 220, 0, 0.9)';
      const r = { bottom: [0, spec.h - band, spec.w, band], right: [spec.w - band, 0, band, spec.h] }[spec.flippers];
      g.fillRect(...r);
      g.save(); g.fillStyle = '#000'; g.font = 'bold ' + Math.round(band * 0.55) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(r[0] + r[2] / 2, r[1] + r[3] / 2);
      if (spec.flippers === 'right') g.rotate(-Math.PI / 2);
      g.fillText('FLIPPERS', 0, 0); g.restore();
    }
    g.fillStyle = spec.transparent ? 'hsl(' + spec.hue + ', 90%, 60%)' : '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.round(spec.h * 0.2);
    g.font = '900 ' + size + 'px sans-serif';
    // Libellé ramené à 90 % de la largeur de l'image.
    size = Math.floor(size * Math.min(1, (spec.w * 0.9) / g.measureText(spec.label).width));
    g.font = '900 ' + size + 'px sans-serif';
    const top = spec.lines ? spec.h * 0.16 : spec.h / 2;
    if (spec.transparent) { g.lineWidth = size / 10; g.strokeStyle = '#000'; g.strokeText(spec.label, spec.w / 2, top); }
    g.fillText(spec.label, spec.w / 2, top);
    // Lignes de texte (prospectus, règles), pour juger de la lisibilité à l'écran.
    if (spec.lines) {
      let fs = Math.round(spec.h / 22);
      g.font = '600 ' + fs + 'px sans-serif';
      const widest = Math.max(...spec.lines.map((l) => g.measureText(l).width));
      fs = Math.floor(fs * Math.min(1, (spec.w * 0.84) / widest));
      g.font = '600 ' + fs + 'px sans-serif'; g.textAlign = 'left';
      spec.lines.forEach((line, i) => g.fillText(line, spec.w * 0.08, top + size + fs * 1.6 * (i + 1)));
    }
    if (spec.video) {
      g.fillStyle = '#fff';
      const x = spec.w * (0.15 + 0.7 * ((Math.sin(t * 3) + 1) / 2));
      g.beginPath(); g.arc(x, spec.h * 0.72, Math.min(spec.w, spec.h) * 0.05, 0, Math.PI * 2); g.fill();
    }
  };
  if (!spec.video) {
    draw(0);
    return c.toDataURL('image/png').split(',')[1];
  }
  const stream = c.captureStream(30);
  let audio;
  if (spec.sound) {
    // Piste son de la vidéo : enregistrée, jamais entendue (fenêtre muette).
    audio = new AudioContext();
    const osc = audio.createOscillator();
    osc.frequency.value = spec.sound;
    const gain = audio.createGain();
    gain.gain.value = 0.2;
    const dest = audio.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const types = spec.sound ? ['video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const type = types.find((t) => MediaRecorder.isTypeSupported(t));
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
  audio?.close();
  const buf = await new Blob(parts, { type }).arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
`;

/** WAV 16 bits mono : une petite mélodie (musique) ou un « whoosh » montant (lancement). */
function wav(seconds, kind, base) {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v;
    if (kind === 'music') {
      const notes = [0, 4, 7, 12, 7, 4];
      const f = base * 2 ** (notes[Math.floor(t * 4) % notes.length] / 12);
      v = 0.25 * Math.sin(2 * Math.PI * f * t) * (0.6 + 0.4 * Math.cos(2 * Math.PI * 4 * t));
    } else {
      const f = base + 600 * (t / seconds);
      v = 0.3 * Math.sin(2 * Math.PI * f * t) * Math.min(1, (seconds - t) * 4);
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const COMPLETE = 'Astro Néon (Williams 1992)';
const PARTIAL = "Bayou d'Or (Gottlieb 1979)";
const NONE = 'Comète silencieuse, la table sans aucun média pour vérifier tous les replis (Bally 1981)';

const RULES = ['Rampe gauche : allume les lettres A-S-T-R-O', 'A-S-T-R-O complet : multibille à 3 billes', 'Trois cibles : extra-bille au centre', 'Orbite droite : jackpot quand il clignote'];
const FLYER = ['Une table de démonstration de Cyber Pinball', 'Quatre joueurs · trois billes · 1992', 'Multibille, rampes, orbites'];

const TABLES = [
  {
    name: COMPLETE,
    medias: {
      Playfield: { ext: 'webm', w: 1280, h: 720, hue: 200, label: 'ASTRO NÉON plateau', flippers: 'right', video: true, sound: 220 },
      Wheel: { ext: 'png', w: 900, h: 300, hue: 190, label: 'ASTRO NÉON', transparent: true },
      Backglass: { ext: 'webm', w: 1024, h: 820, hue: 280, label: 'ASTRO fronton', video: true },
      DMD: { ext: 'png', w: 512, h: 128, hue: 30, label: 'ASTRO DMD' },
      FullDMD: { ext: 'webm', w: 960, h: 540, hue: 15, label: 'ASTRO FullDMD', video: true },
      Topper: { ext: 'webm', w: 1280, h: 360, hue: 320, label: 'ASTRO topper', video: true },
      Loading: { ext: 'webm', w: 1280, h: 720, hue: 160, label: 'ASTRO chargement', flippers: 'right', video: true },
      GameInfo: { ext: 'png', w: 1200, h: 1600, hue: 250, label: 'PROSPECTUS 1/2', lines: FLYER },
      'GameInfo 2': { type: 'GameInfo', page: 2, ext: 'png', w: 1200, h: 1600, hue: 300, label: 'PROSPECTUS 2/2', lines: ['Verso : les modes de jeu', ...FLYER.slice(1)] },
      GameHelp: { ext: 'png', w: 1600, h: 1000, hue: 100, label: 'RÈGLES', lines: RULES },
      Audio: { wav: 'music', seconds: 4, base: 330 },
      AudioLaunch: { wav: 'launch', seconds: 1.2, base: 300 },
    },
    info: { Authors: ['Atelier de démonstration'], Description: 'Table complète : tous les types de médias.' },
  },
  {
    name: PARTIAL,
    medias: {
      Wheel: { ext: 'png', w: 500, h: 500, hue: 45, label: 'BdO', transparent: true },
      Playfield: { ext: 'png', w: 1080, h: 1920, hue: 45, label: 'BAYOU plateau', flippers: 'bottom' },
    },
    directb2s: { w: 1024, h: 768, hue: 40, label: 'BAYOU .directb2s' },
  },
  {
    name: NONE,
    medias: {},
    info: { Authors: ['Atelier de démonstration', 'Équipe des replis'], Description: 'Aucun fichier dans medias\\ : chaque écran montre son repli intégré, ou le défaut de la borne.' },
  },
];

function directb2s(png) {
  const b64 = (png.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return `<DirectB2SData Version="1.2">\r\n  <Name Value="Démo" />\r\n  <Images>\r\n    <BackglassOnImage Value="${b64}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`;
}

async function generate(root) {
  app.setPath('userData', path.join(root, '..', 'generateur'));
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  fs.mkdirSync(path.join(root, 'import'), { recursive: true });
  const gen = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  gen.webContents.setAudioMuted(true);
  await gen.loadURL('data:text/html,<meta charset=utf-8><title>générateur</title>');
  await gen.webContents.executeJavaScript(`${GENERATOR}; true`);
  const make = async (spec) => Buffer.from(await gen.webContents.executeJavaScript(`makeMedia(${JSON.stringify({ seconds: 2, ...spec })})`), 'base64');
  for (const t of TABLES) {
    const folder = path.join(root, 'tables', t.name);
    fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(folder, `${t.name}.vpx`), '');
    for (const [key, spec] of Object.entries(t.medias)) {
      const type = spec.type ?? key;
      const file = path.join(folder, 'medias', `(${type}) ${t.name}${spec.page ? ` ${spec.page}` : ''}.${spec.wav ? 'wav' : spec.ext}`);
      fs.writeFileSync(file, spec.wav ? wav(spec.seconds, spec.wav, spec.base) : await make(spec));
    }
    if (t.directb2s) fs.writeFileSync(path.join(folder, `${t.name}.directb2s`), directb2s(await make(t.directb2s)));
    if (t.info) fs.writeFileSync(path.join(folder, `${t.name}.info`), JSON.stringify({ Info: t.info }, null, 2));
    console.log(`Table : ${t.name} (${Object.keys(t.medias).join(', ') || 'aucun média'}${t.directb2s ? ', .directb2s' : ''})`);
  }
  // Défaut de la borne : le topper des jeux qui n'en ont pas.
  fs.writeFileSync(path.join(root, 'media', '(Topper).png'), await make({ w: 1280, h: 360, hue: 180, label: 'TOPPER DE LA BORNE' }));
  console.log('Défaut de la borne : media\\(Topper).png');
  gen.destroy();
}

// ---------------------------------------------------------------------------
// Vérification des captures : écrans vides, planches

/** Écart-type de la luminance et nombre de couleurs (réduites) d'une capture, sur une vignette. */
function imageStats(file) {
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  const small = img.resize({ width: Math.min(160, width) });
  const bmp = small.toBitmap();
  let sum = 0;
  let sq = 0;
  const colors = new Set();
  const n = bmp.length / 4;
  for (let i = 0; i < bmp.length; i += 4) {
    const l = 0.0722 * bmp[i] + 0.7152 * bmp[i + 1] + 0.2126 * bmp[i + 2];
    sum += l;
    sq += l * l;
    colors.add(((bmp[i] >> 4) << 8) | ((bmp[i + 1] >> 4) << 4) | (bmp[i + 2] >> 4));
  }
  const mean = sum / n;
  return { width, height, deviation: Math.sqrt(Math.max(0, sq / n - mean * mean)), colors: colors.size };
}

/** Étape de l'autopilote d'une capture : « 07-Digit1 » pour 07-Digit1.png et ecrans\07-Digit1-backglass.png. */
function captureList(dir) {
  const steps = new Map();
  // Étapes de l'autopilote seulement (« 07-Digit1.png ») : pas les captures du lancement (chargement-*.png).
  for (const f of fs.readdirSync(dir).filter((f) => /^\d\d-.*\.png$/.test(f))) {
    const step = f.replace(/\.png$/, '');
    steps.set(step, [{ role: 'playfield', file: path.join(dir, f) }]);
  }
  const screens = path.join(dir, 'ecrans');
  if (fs.existsSync(screens)) {
    for (const f of fs.readdirSync(screens).filter((f) => f.endsWith('.png'))) {
      const m = /^(.*)-(backglass|dmd|topper)\.png$/.exec(f);
      if (m && steps.has(m[1])) steps.get(m[1]).push({ role: m[2], file: path.join(screens, f) });
    }
  }
  return [...steps.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const ROLE_LABELS = { playfield: 'Playfield', backglass: 'Fronton (backglass)', dmd: 'DMD', topper: 'Topper' };

async function verify(dir, rotation) {
  const steps = captureList(dir);
  const empty = [];
  for (const [step, shots] of steps) {
    for (const s of shots) {
      const st = imageStats(s.file);
      s.size = `${st.width} × ${st.height}`;
      // Une image presque uniforme : rien n'est affiché (fond noir, page blanche).
      if (st.deviation < 2.5 && st.colors <= 3) empty.push(`${step} (${s.role}) : écran vide (${st.colors} couleur${st.colors > 1 ? 's' : ''}, écart ${st.deviation.toFixed(1)})`);
    }
  }
  fs.writeFileSync(path.join(dir, 'vides.txt'), `${empty.length ? empty.join('\n') : 'Aucun écran vide.'}\n`, 'utf8');
  // Planches : chaque étape, tous les écrans à la même échelle relative, rangés comme sur la borne.
  const out = path.join(dir, 'planches');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 1800, height: 1000, useContentSize: true, webPreferences: { offscreen: true } });
  for (const [step, shots] of steps) {
    const pf = shots.find((s) => s.role === 'playfield');
    const others = shots.filter((s) => s !== pf);
    const turned = (s) => s.role === 'playfield' && rotation;
    const src = (s) => encodeURI(path.relative(out, s.file).replaceAll('\\', '/'));
    // Playfield tourné (joueur au bord gauche ou droit de l'image) : redressé par CSS, comme
    // les aperçus du gestionnaire (les côtés échangés dans un cadre à la taille de la place).
    const image = (s) => (turned(s) ? `<div class="turn"><img src="${src(s)}" style="transform:translate(-50%,-50%) rotate(${-rotation}deg)"></div>` : `<img src="${src(s)}">`);
    const figure = (s, cls) => `<figure class="${cls}">${image(s)}<figcaption>${ROLE_LABELS[s.role]} · ${s.size}${turned(s) ? ' · redressé, vu du joueur' : ''}</figcaption></figure>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#1b1f2a;color:#cfd6e6;font:600 18px 'Segoe UI',sans-serif;width:1800px;height:1000px;display:grid;grid-template-rows:auto 1fr;}
      h1{margin:0;padding:12px 20px;font-size:22px;background:#0d1018}
      main{display:grid;grid-template-columns:${rotation % 180 ? '0.9fr 1.35fr' : '1.25fr 1fr'};gap:16px;padding:16px;min-height:0}
      .side{display:flex;flex-direction:column;gap:12px;min-height:0}
      figure{margin:0;display:flex;flex-direction:column;gap:6px;min-height:0}
      .pf{height:100%} .side figure{flex:1}
      img{min-height:0;flex:1;width:100%;object-fit:contain;background:#000;outline:2px solid #3a4258}
      .turn{position:relative;flex:1;min-height:0;container-type:size;background:#000;outline:2px solid #3a4258}
      .turn img{position:absolute;left:50%;top:50%;width:${rotation % 180 ? '100cqh' : '100cqw'};height:${rotation % 180 ? '100cqw' : '100cqh'};outline:none}
      figcaption{font-size:15px;color:#8b93a7}
    </style><h1>${step}</h1><main>${figure(pf, 'pf')}<div class="side">${others.map((s) => figure(s, 'o')).join('')}</div></main>`;
    const page = path.join(out, `${step}.html`);
    fs.writeFileSync(page, html, 'utf8');
    await win.loadFile(page);
    // Images décodées, puis deux images peintes : la capture hors écran montre la page finie.
    await win.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
    fs.writeFileSync(path.join(out, `${step}.png`), (await win.webContents.capturePage()).toPNG());
    fs.rmSync(page);
  }
  win.destroy();
  console.log(`Écrans vides : ${empty.length || 'aucun'} ; ${steps.length} planches dans ${out}.`);
}

app.whenReady().then(async () => {
  if (mode === 'generer') await generate(path.resolve(args[0]));
  else if (mode === 'verifier') await verify(path.resolve(args[0]), Number(args[1] ?? 0));
  else {
    console.error('Usage : electron docs/demo-medias.cjs generer <racine> | verifier <captures> ; node docs/demo-medias.cjs modele <écrans> <cabinet.json> <ini>');
    return app.exit(2);
  }
  app.quit();
});

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
