// Démonstration hors écran de « Chercher les médias » (T10, VPinMediaDB), avec le vrai
// dépôt : index, aperçus et fichiers téléchargés depuis GitHub dans un bac à sable
// (tmp\demo-vpinmediadb), comme sur la borne. Aucune fenêtre n'apparaît : rendu hors
// écran (show: false, offscreen: true), lancé par docs\demo-vpinmediadb.ps1 sur le
// bureau caché. Captures et contrôle de la mise en page dans
// tmp\demo-vpinmediadb\captures.
//   npm run build
//   .\docs\demo-vpinmediadb.ps1
// Parcours : gestionnaire d'un jeu (avertissement du premier usage, plan avec aperçus,
// remplacement d'un logo, vidéo ou image du plateau, progression, fiche du média avec
// sa source), puis menu système (médias manquants de toutes les tables, détail d'une
// table, téléchargement).

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-vpinmediadb');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
// Protocole des médias (cyber-media:), déclaré avant que l'application soit prête : sans lui, aucun aperçu ne s'affiche.
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
let servedDirs = () => [];

const T2 = 'Terminator 2 (Williams 1991)';
const MM = 'Medieval Madness (Williams 1997)';
const HOME = 'Table Maison (Original 2026)';

const SCENARIOS = [
  { name: 'paysage', width: 1920, height: 1080, rotation: 0 },
  { name: 'portrait', width: 1080, height: 1920, rotation: 0 },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/** Fenêtre jamais montrée, rendue hors écran ; sa taille est imposée après coup (sinon bornée au bureau). */
function offscreen(width, height, extra = {}) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, ...extra } });
  win.setContentSize(width, height);
  return win;
}

function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Logo « de l'utilisateur », dessiné hors écran. */
async function userLogo() {
  const win = offscreen(400, 300);
  await win.loadURL('data:text/html;charset=utf-8,<canvas id="c" width="600" height="300"></canvas>');
  const data = await win.webContents.executeJavaScript(`(() => { const g = document.getElementById('c').getContext('2d');
    g.fillStyle = '#38bdf8'; g.font = 'bold 90px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MON LOGO', 300, 150);
    return document.getElementById('c').toDataURL('image/png'); })()`);
  win.destroy();
  return Buffer.from(data.split(',')[1], 'base64');
}

function sandbox(name, logo, shared) {
  const root = path.join(BASE, name, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads]) fs.mkdirSync(d, { recursive: true });
  // L'index et la base VPS du premier passage servent aux suivants (comme sur la borne : en cache).
  if (shared) for (const f of fs.readdirSync(shared)) if (/^(vpinmdb|vpsdb)/.test(f)) fs.copyFileSync(path.join(shared, f), path.join(L.downloads, f));
  const t2 = path.join(L.tables, T2);
  put(path.join(t2, `${T2} VPW 1.25.vpx`));
  put(path.join(t2, `${T2}.info`), JSON.stringify({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991, VPSId: 'BunvWvh9' }, User: { StartCount: 12 } }, null, 2));
  put(path.join(t2, 'medias', `(Wheel) ${T2}.png`), logo);
  // Sans identifiant VPS : reconnue au titre par la base VPS.
  put(path.join(L.tables, MM, `${MM}.vpx`));
  put(path.join(L.tables, MM, `${MM}.info`), JSON.stringify({ Info: { Title: 'Medieval Madness', Manufacturer: 'Williams', Year: 1997 } }, null, 2));
  // Inconnue de VPS et de VPinMediaDB.
  put(path.join(L.tables, HOME, `${HOME}.vpx`));
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 3840, 2160), screen('bg', 1920, 1080), screen('dmd', 1920, 1080)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    playfield: { flipperEdge: 'bottom' },
    vpx: { iniPath: '' },
    updatedAt: '',
  });
  return { root, L };
}

async function scenario(sc, box, report) {
  const { root, L } = box;
  let tables = core.scanTables(L.tables);
  servedDirs = () => core.allowedMediaDirs({ root, dataDir: L.data, tables });
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const win = offscreen(sc.width, sc.height, { preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true });
  const windows = new Map([['playfield', win]]);
  let phase = 'library';
  const library = createLibrary({
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
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: String(sc.rotation), zones: '[]' } });
  await ready;

  const dir = path.join(CAPTURES, sc.name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const log = [];
  async function shot(name) {
    send();
    await delay(250);
    for (let i = 0; i < 60; i++) {
      const ok = await win.webContents.executeJavaScript(`[...document.images].every((i) => i.complete) && [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error)`);
      if (ok) break;
      await delay(100);
    }
    await delay(150);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, `${sc.name}/${label}`);
    fs.writeFileSync(path.join(dir, `${label}.png`), (await win.capturePage()).toPNG());
    const v = library.view();
    log.push(`${label} : ${v.heading}${v.busy ? ` [${v.busy}]` : ''} | ${v.actions.map((a) => a.label).join(' | ')}`);
  }
  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${sc.name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  /** Attend la fin d'une opération longue ; capture la progression au passage si demandé. */
  async function idle(progressShot, timeout = 600_000) {
    const end = Date.now() + timeout;
    let shown = false;
    await delay(100);
    while (view().busy && Date.now() < end) {
      if (progressShot && !shown && /Téléchargement :|Table \d/.test(view().busy ?? '')) {
        shown = true;
        await shot(progressShot);
      }
      await delay(200);
    }
    if (view().busy) throw new Error(`${sc.name} : toujours occupé (${view().busy})`);
  }
  const t2 = () => tables.find((t) => t.title === 'Terminator 2');

  // ---------- Gestionnaire d'un jeu ----------
  library.openSheet(t2());
  act('Médias du jeu');
  for (let i = 0; i < 30 && view().actions[view().cursor]?.label !== 'Chercher les médias'; i++) library.handleKey({ type: 'keyDown', code: KEYS.next[0], key: '', shift: false, control: false, alt: false, meta: false });
  await shot('medias-chercher');
  act('Chercher les médias');
  await shot('avertissement');
  act('J’ai compris');
  await idle();
  await shot('plan');
  act('Logo : garder');
  await shot('plan-logo-remplace');
  act('Plateau : vidéo');
  await shot('plan-plateau-image-4k');
  act('Plateau : image');
  act('Plateau : ne pas');
  await shot('plan-plateau-video');
  act('Télécharger et ranger');
  await idle('progression');
  await shot('medias-apres');
  act('Plateau');
  await shot('fiche-plateau-source');
  act('Retour aux médias');
  act('Logo');
  await shot('fiche-logo-source');
  act('Retour aux médias');
  act('Prospectus');
  act('Page 1');
  await shot('fiche-prospectus-source');

  // ---------- Menu système : médias manquants de toutes les tables ----------
  library.openSystem();
  act('Médias manquants');
  await idle();
  await shot('manquants-plan');
  act('Voir une table');
  await shot('manquants-tables');
  act('Medieval Madness');
  await idle();
  await shot('manquants-detail-mm');
  act('Retour au plan général');
  act('Retour au plan général');
  act('Télécharger et ranger');
  await idle('manquants-progression');
  await shot('manquants-resultat');
  // Une deuxième recherche : tout est là, rien à télécharger.
  act('Continuer');
  act('Médias manquants');
  await idle();
  await shot('manquants-rien');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return log;
}

// Entre deux fenêtres hors écran, aucune n'est ouverte : l'application ne doit pas quitter.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  const logo = await userLogo();
  let shared;
  try {
    for (const sc of SCENARIOS) {
      const box = sandbox(sc.name, logo, shared);
      const log = await scenario(sc, box, report);
      shared = box.L.downloads;
      results.push(...log.map((l) => `${sc.name}/${l}`));
      for (const t of [T2, MM, HOME]) {
        const m = path.join(box.L.tables, t, 'medias');
        const files = fs.existsSync(m) ? fs.readdirSync(m).sort().map((f) => `${f} (${core.formatSize(fs.statSync(path.join(m, f)).size)})`) : [];
        results.push(`${sc.name} : ${t}\\medias = ${files.join(' | ') || 'rien'}`);
      }
      results.push(`${sc.name} : corbeille = ${fs.readdirSync(box.L.trash).map((d) => `${d}: ${fs.readdirSync(path.join(box.L.trash, d)).sort().join(' | ')}`).join(' ; ')}`);
      results.push(`${sc.name} : réception = ${JSON.stringify(fs.existsSync(core.mediaDbStagingDir(box.L.downloads)) ? fs.readdirSync(core.mediaDbStagingDir(box.L.downloads)) : [])}`);
      results.push(`${sc.name} : sources T2 = ${JSON.stringify(core.mediaMemory(core.readInfo(path.join(box.L.tables, T2, `${T2}.info`))).sources)}`);
    }
  } catch (error) {
    results.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), results.join('\n') + '\n', 'utf8');
  console.log(results.join('\n'));
  app.quit();
});
