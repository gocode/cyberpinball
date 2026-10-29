// Démonstration hors écran de l'écran « Médias » de la fiche d'une table (T8).
// Aucune fenêtre n'apparaît : rendu hors écran (show: false, offscreen: true),
// captures et contrôle de la mise en page (chevauchements, textes qui débordent)
// dans tmp\demo-medias-fiche\captures. Le bac à sable et ses médias sont générés
// dans tmp\demo-medias-fiche à chaque passage.
//   npm run build
//   npx electron docs\demo-medias-fiche.cjs
// Trois écrans : paysage 1920×1080, le même couché (playfield d'une borne, menu
// tourné d'un quart de tour) et portrait 1080×1920.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-medias-fiche');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
// Avant que l'application soit prête : le protocole des médias, par lequel passent les aperçus.
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
/** Dossiers servis : ceux du bac à sable du scénario en cours. */
let servedDirs = () => [];

const T2 = 'Terminator 2 (Williams 1991)';
const T2_VPX = 'Terminator 2 (Williams 1991) g5k 1.25';
const MM = 'Medieval Madness (Williams 1997)';

const SCENARIOS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'couche', width: 1920, height: 1080, rotation: 90 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/** Fenêtre jamais montrée, rendue hors écran ; sa taille est imposée après coup (sinon bornée au bureau). */
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

// ---------- Médias générés ----------

/** Atelier hors écran : dessine des images (PNG, JPEG, WebP) et enregistre une vidéo WebM. */
async function atelier() {
  const win = offscreen(400, 300, { backgroundThrottling: false });
  await win.loadURL('data:text/html;charset=utf-8,<canvas id="c"></canvas>');
  return {
    async image(spec) {
      const data = await win.webContents.executeJavaScript(`(() => {
        const s = ${JSON.stringify(spec)};
        const c = document.getElementById('c'); c.width = s.w; c.height = s.h;
        const g = c.getContext('2d');
        if (!s.transparent) { const grad = g.createLinearGradient(0, 0, s.w, s.h); grad.addColorStop(0, s.from); grad.addColorStop(1, s.to); g.fillStyle = grad; g.fillRect(0, 0, s.w, s.h); }
        g.fillStyle = s.ink || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold ' + Math.round(Math.min(s.w, s.h) / 7) + 'px Segoe UI';
        g.fillText(s.text, s.w / 2, s.h / 2);
        if (s.flippers) { g.fillStyle = '#ff0'; g.font = 'bold ' + Math.round(s.h / 10) + 'px Segoe UI';
          if (s.flippers === 'right') { g.save(); g.translate(s.w - s.h / 10, s.h / 2); g.rotate(Math.PI / 2); g.fillText('FLIPPERS', 0, 0); g.restore(); }
          else g.fillText('FLIPPERS', s.w / 2, s.h - s.h / 12); }
        return c.toDataURL(s.type || 'image/png', 0.9);
      })()`);
      return Buffer.from(data.split(',')[1], 'base64');
    },
    async video(spec) {
      const data = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const s = ${JSON.stringify(spec)};
        const c = document.getElementById('c'); c.width = s.w; c.height = s.h;
        const g = c.getContext('2d');
        const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' });
        const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
        rec.onstop = () => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(new Blob(parts, { type: 'video/webm' })); };
        let t = 0; rec.start();
        const tick = setInterval(() => {
          t++; const grad = g.createLinearGradient(0, 0, s.w, s.h);
          grad.addColorStop(0, s.from); grad.addColorStop(1, s.to); g.fillStyle = grad; g.fillRect(0, 0, s.w, s.h);
          g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(s.h / 7) + 'px Segoe UI';
          g.fillText(s.text, s.w / 2 + Math.sin(t / 5) * s.w / 20, s.h / 2);
          if (s.flippers === 'right') { g.fillStyle = '#ff0'; g.save(); g.translate(s.w - s.h / 10, s.h / 2); g.rotate(Math.PI / 2); g.font = 'bold ' + Math.round(s.h / 10) + 'px Segoe UI'; g.fillText('FLIPPERS', 0, 0); g.restore(); }
          if (t > 40) { clearInterval(tick); rec.stop(); }
        }, 40);
      })`);
      return Buffer.from(data.split(',')[1], 'base64');
    },
    close: () => win.destroy(),
  };
}

/** WAV de 0,2 s de silence : un vrai fichier son. */
function wav() {
  const samples = 8820;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  return b;
}

function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

async function sandbox(name) {
  const root = path.join(BASE, name, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash]) fs.mkdirSync(d, { recursive: true });
  const a = await atelier();
  const t2 = path.join(L.tables, T2);
  const m = path.join(t2, 'medias');
  put(path.join(t2, `${T2_VPX}.vpx`));
  put(path.join(t2, 'Terminator 2 (Williams 1991) VPW 1.0.vpx'));
  put(path.join(t2, `${T2}.info`), JSON.stringify({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991 }, User: { StartCount: 12 } }, null, 2));
  put(path.join(m, `(Wheel) ${T2}.png`), await a.image({ w: 600, h: 300, text: 'T2 LOGO', transparent: true, ink: '#38bdf8' }));
  // Plateau en paysage, flippers à droite (standard de Popper) : le menu le tourne.
  put(path.join(m, `(Playfield) ${T2}.webm`), await a.video({ w: 640, h: 360, text: 'PLATEAU T2', from: '#1e3a8a', to: '#7c3aed', flippers: 'right' }));
  put(path.join(m, `(Backglass) ${T2_VPX}.png`), await a.image({ w: 1280, h: 1024, text: 'FRONTON T2', from: '#7f1d1d', to: '#f97316' }));
  put(path.join(m, `(FullDMD) ${T2}.png`), await a.image({ w: 1920, h: 1080, text: 'AFFICHEUR LARGE', from: '#422006', to: '#ca8a04' }));
  put(path.join(m, `(Audio) ${T2}.wav`), wav());
  for (const [i, color] of ['#065f46', '#0e7490', '#4338ca'].entries()) {
    const name = i ? `(GameHelp) ${T2} ${i + 1}.png` : `(GameHelp) ${T2}.png`;
    put(path.join(m, name), await a.image({ w: 1000, h: 700, text: `RÈGLES ${i + 1}`, from: color, to: '#111827' }));
  }
  put(path.join(m, `(GameInfo) ${T2}.jpg`), await a.image({ w: 800, h: 1100, text: 'PROSPECTUS', from: '#831843', to: '#1f2937', type: 'image/jpeg' }));
  put(path.join(m, `(Backglass) ${T2}.flv`), 'ancienne vidéo de Popper');
  put(path.join(m, '(Wheel) Terminator 3 (Stern 2003).png'), await a.image({ w: 300, h: 150, text: 'T3', transparent: true }));
  put(path.join(m, 'notes.txt'), 'notes');
  // Défaut de la borne pour le topper.
  put(path.join(L.media, '(Topper).png'), await a.image({ w: 1920, h: 540, text: 'TOPPER DE LA BORNE', from: '#0f172a', to: '#334155' }));
  // Seconde table : rien dans medias\, un .directb2s avec son image allumée.
  const mm = path.join(L.tables, MM);
  put(path.join(mm, `${MM}.vpx`));
  const on = (await a.image({ w: 1024, h: 768, text: 'IMAGE DU B2S', from: '#14532d', to: '#a3e635' })).toString('base64').match(/.{1,76}/g).join('&#xD;&#xA;');
  put(path.join(mm, `${MM}.directb2s`), `<DirectB2SData Version="1.2">\r\n  <Name Value="MM" />\r\n  <Images>\r\n    <BackglassOnImage Value="${on}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`);
  // Dossier d'import : de quoi remplacer et ajouter.
  put(path.join(L.import, 'logo neuf.png'), await a.image({ w: 512, h: 512, text: 'NOUVEAU', transparent: true, ink: '#f472b6' }));
  put(path.join(L.import, 'fronton animé.webm'), await a.video({ w: 640, h: 512, text: 'FRONTON ANIMÉ', from: '#7c2d12', to: '#facc15' }));
  put(path.join(L.import, 'règles verso.png'), await a.image({ w: 1000, h: 700, text: 'RÈGLES VERSO', from: '#701a75', to: '#111827' }));
  put(path.join(L.import, 'POPMedia', 'Wheel', 'Medieval Madness.png'), await a.image({ w: 600, h: 300, text: 'MM LOGO', transparent: true, ink: '#a3e635' }));
  put(path.join(L.import, 'Lisez-moi.txt'), 'texte');
  const dropped = put(path.join(BASE, name, 'ailleurs', 'topper perso.png'), await a.image({ w: 1920, h: 540, text: 'TOPPER PERSO', from: '#312e81', to: '#db2777' }));
  a.close();
  // Borne : playfield, fronton, afficheur étroit 4:1, pas de topper.
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 3840, 2160), screen('bg', 1920, 1080), screen('dmd', 1280, 320)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  return { root, L, dropped };
}

// ---------- Menu sans opérateur ----------

async function scenario(sc, box, report) {
  const { root, L } = box;
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
    // Mode invité inactif : tout passe (host.guest est obligatoire, library.ts).
    guest: { active: false, allows: () => true, knock: () => true },
    root,
    dataDir: L.data,
    vpxExe: () => undefined,
    tables: () => tables,
    reload: () => (tables = core.scanTables(L.tables)),
    enter: () => (phase = 'library'),
    leave: () => (phase = 'menu'),
    play: () => {},
    quit: () => {},
    keys: () => KEYS,
    windows: () => windows,
    broadcast: () => send(),
  });
  function send() {
    if (win.isDestroyed()) return;
    win.webContents.send('state', {
      role: 'playfield', phase, help: false, count: tables.length, position: 1, neighbors: [], footer: [], gameKeys: [], menuKeys: [],
      nav: { confirm: KEYS.confirm[0], exit: KEYS.exit[0] },
      library: phase === 'library' ? library.view() : undefined,
    });
  }
  const onAction = (_e, action) => library.handleAction(action);
  ipcMain.on('action', onAction);
  const ready = new Promise((r) => ipcMain.once('ready', r));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log(`Chargement impossible (${code} ${desc}) : ${url}`));
  win.webContents.on('console-message', (e) => console.log(`Console : ${e.message}`));
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(sc.rotation), zones: '[]' } });
  await ready;

  const dir = path.join(CAPTURES, sc.name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  async function shot(name) {
    send();
    await delay(250);
    // Images chargées, vidéos prêtes à montrer leur vignette.
    for (let i = 0; i < 40; i++) {
      const ok = await win.webContents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, `${sc.name}/${label}`);
    fs.writeFileSync(path.join(dir, `${label}.png`), (await win.capturePage()).toPNG());
  }
  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${sc.name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code) => library.handleKey({ type: 'keyDown', code, key: '', shift: false, control: false, alt: false, meta: false });
  const t2 = () => tables.find((t) => t.file.includes(T2_VPX));

  library.openSheet(t2());
  await shot('fiche');
  act('Médias du jeu');
  await shot('medias');
  for (let i = 0; i < 6; i++) key(KEYS.next[0]);
  await shot('medias-curseur-chargement');
  key(KEYS.exit[0]);
  act('Médias du jeu');
  act('Plateau');
  await shot('plateau');
  act('Demi-tour : non');
  await shot('plateau-demi-tour');
  act('Retour aux médias');
  act('Règles');
  await shot('regles-pages');
  act('Page 3');
  await shot('regles-page-3');
  act('Monter');
  await shot('regles-page-3-montee');
  act('Retour aux pages');
  act('Ajouter une page depuis le dossier');
  await shot('regles-import');
  act('règles verso.png');
  await shot('regles-page-ajoutee');
  act('Retour aux médias');
  act('Logo');
  act('Remplacer depuis le dossier');
  await shot('logo-import');
  act('logo neuf.png');
  await shot('logo-remplace');
  act('Retour aux médias');
  act('Afficheur large');
  await shot('afficheur-large');
  act('Retour aux médias');
  act('Afficheur');
  await shot('afficheur-repli');
  act('Retour aux médias');
  act('Fronton');
  act('Remplacer depuis le dossier');
  act('fronton animé.webm');
  act('Retour aux médias');
  // Fichier glissé sur la vue d'ensemble, curseur sur Topper : il devient le topper.
  while (view().cursor !== 5) key(KEYS.next[0]);
  library.handleAction({ type: 'drop', paths: [box.dropped] });
  await shot('depot-topper');
  act('Volume de ce jeu');
  await shot('volume');
  act('75 %');
  await shot('medias-brouillon');
  act('Enregistrer');
  await shot('plan');
  act('Enregistrer');
  await shot('enregistre');
  // Seconde table : rien dans medias\, le fronton vient du .directb2s (extraction en tâche de fond).
  library.openSheet(tables.find((t) => t.title.startsWith('Medieval')));
  act('Médias du jeu');
  await delay(1500);
  await shot('mm-replis');
  act('Retour à la fiche');
  // Glisser un fichier rangé à la Popper (…\Wheel\…) : type deviné d'après son dossier.
  act('Médias du jeu');
  library.handleAction({ type: 'drop', paths: [path.join(L.import, 'POPMedia', 'Wheel', 'Medieval Madness.png')] });
  await shot('mm-depot-popper');
  act('Retour à la fiche');
  await shot('mm-quitter-sans-enregistrer');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return library;
}

// Entre deux fenêtres hors écran, aucune n'est ouverte : l'application ne doit pas quitter.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    for (const sc of SCENARIOS) {
      const box = await sandbox(sc.name);
      await scenario(sc, box, report);
      // Ce qui a été écrit, pour le compte rendu (le même à chaque écran).
      const m = path.join(box.L.tables, T2, 'medias');
      results.push(`${sc.name} : medias\\ = ${fs.readdirSync(m).sort().join(' | ')}`);
      const trash = fs.readdirSync(box.L.trash);
      results.push(`${sc.name} : corbeille = ${trash.map((d) => `${d}: ${fs.readdirSync(path.join(box.L.trash, d)).sort().join(' | ')}`).join(' ; ')}`);
      results.push(`${sc.name} : import\\ = ${fs.readdirSync(box.L.import, { recursive: true }).sort().join(' | ')}`);
      results.push(`${sc.name} : .info = ${JSON.stringify(core.readInfo(path.join(box.L.tables, T2, `${T2}.info`)))}`);
    }
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
