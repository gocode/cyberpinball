// Démonstration hors écran de « Sons de la table » (fiche > Médias du jeu > Musique ou
// Son de lancement), dans un bac à sable (tmp\demo-sons-table) : une table « GOTG_2.1.1 »
// dont le PuP-Pack reprend de vrais fichiers de la borne (deux musiques du dossier
// Topper, la vidéo d'introduction sonore et sa sœur muette de DMDSplash, une vidéo de
// PupVideos). Aucune fenêtre n'apparaît et rien ne s'entend : rendu hors écran
// (show: false, offscreen: true), son de la fenêtre coupé, lancé par
// docs\demo-sons-table.ps1 sur le bureau caché. Parcours : dossiers, écoute d'une
// musique puis du son d'une vidéo (lecture vérifiée : position qui avance, octets de son
// décodés), musique et son de lancement choisis, plan, enregistrement ; puis le .m4a
// extrait est relu par Chromium. Captures, relevé (resultat.txt) et contrôle de la mise
// en page dans tmp\demo-sons-table\captures.
//   npm run build
//   .\docs\demo-sons-table.ps1

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-sons-table');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createLibrary } = require(path.join(WT, 'app', 'dist', 'library.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const { vpxWithInfo } = require('./demo-fichiers.cjs');
const { serveMedias } = require(path.join(WT, 'app', 'dist', 'media-protocol.js'));
let servedDirs = () => [];

const FOLDER = 'GOTG_2.1.1';
const REAL_PACK = 'D:\\CyberPinball\\tables\\GOTG_2.1.1\\pupvideos\\gotg_2020';
const REAL_FILES = ['Topper\\Song-Groot.mp3', 'Topper\\m_wait3.mp3', 'DMDSplash\\@vidIntro2.mp4', 'DMDSplash\\@vidIntro.mp4', 'PupVideos\\Video-Replay.mp4'];

const SCENARIOS = [
  { name: 'paysage', width: 1920, height: 1080 },
  { name: 'portrait', width: 1080, height: 1920 },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function put(file, data = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

function sandbox(name) {
  const root = path.join(BASE, name, 'root');
  const L = core.layoutOf(root);
  for (const d of [L.tables, L.import, L.media, L.data, L.trash, L.downloads]) fs.mkdirSync(d, { recursive: true });
  const folder = path.join(L.tables, FOLDER);
  put(path.join(folder, `${FOLDER}.vpx`), vpxWithInfo({ TableName: 'Guardians Of The Galaxy', AuthorName: 'Pincredibles', TableVersion: '2.1.1' }, {}));
  put(path.join(folder, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'Gardiens de la galaxie 2.1.1' }, User: { StartCount: 1 } }, null, 2));
  const pack = path.join(folder, 'pupvideos', 'gotg_2020');
  for (const rel of REAL_FILES) {
    const from = path.join(REAL_PACK, rel);
    if (!fs.existsSync(from)) throw new Error(`Fichier de la borne absent : ${from}`);
    put(path.join(pack, rel), fs.readFileSync(from));
  }
  // Copie de sauvegarde d'un pack : jamais montrée.
  put(path.join(pack, 'Topper.orig', 'Song-1.mp3'), fs.readFileSync(path.join(REAL_PACK, 'Topper\\m_wait3.mp3')));
  const screen = (fingerprint, widthPx, heightPx) => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 });
  core.saveCabinet(L.data, {
    version: 1,
    screens: [screen('pf', 1920, 1080), screen('bg', 1920, 1080), screen('dmd', 1920, 1080)],
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
  const win = new BrowserWindow({ show: false, width: sc.width, height: sc.height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, preload: path.join(WT, 'app', 'dist', 'preload.js'), contextIsolation: true, sandbox: true } });
  win.setContentSize(sc.width, sc.height);
  // Rien ne s'entend : la lecture se vérifie à la position et aux octets décodés.
  win.webContents.setAudioMuted(true);
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
  await win.loadFile(path.join(WT, 'app', 'renderer', 'frontend.html'), { query: { role: 'playfield', rotation: '0', zones: '[]' } });
  await ready;

  const dir = path.join(CAPTURES, sc.name);
  fs.mkdirSync(dir, { recursive: true });
  let step = 0;
  const log = [];
  const problems = [];
  async function shot(name) {
    send();
    await delay(400);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    await report.check(win.webContents, `${sc.name}/${label}`);
    fs.writeFileSync(path.join(dir, `${label}.png`), (await win.capturePage()).toPNG());
    const v = library.view();
    log.push(`${label} : ${v.heading} | ${v.subheading ?? ''} | ${v.actions.map((a) => `${a.label}${a.detail ? ` (${a.detail})` : ''}`).join(' | ')}`);
  }
  const view = () => library.view();
  const act = (label) => {
    const i = view().actions.findIndex((a) => a.label === label || a.label.startsWith(label));
    if (i < 0) throw new Error(`${sc.name} : pas d’action « ${label} » (${view().actions.map((a) => a.label).join(' | ')})`);
    library.handleAction({ type: 'activate', index: i });
  };
  const key = (code, k = '') => library.handleKey({ type: 'keyDown', code, key: k, shift: false, control: false, alt: false, meta: false });
  const cursorTo = (label) => {
    const i = view().actions.findIndex((a) => a.label === label);
    if (i < 0) throw new Error(`${sc.name} : pas de carte « ${label} »`);
    for (let n = 0; n < 60 && view().cursor !== i; n++) key(KEYS.next[0]);
  };
  /** Son de la carte choisie : ce que joue l'élément audio, après un moment de lecture. */
  async function listening(what) {
    send();
    await delay(2000);
    const got = await win.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('.media-thumb.playing'); const a = box && box.querySelector('audio');
      const all = [...document.querySelectorAll('audio')].filter((x) => !x.paused).length;
      return a ? { src: decodeURIComponent(a.src).split(/[\\\\/]/).pop(), paused: a.paused, time: a.currentTime, error: a.error && a.error.code, decoded: a.webkitAudioDecodedByteCount, duration: a.duration, playing: all } : null; })()`);
    const ok = got && !got.paused && got.time > 0.3 && !got.error && got.decoded > 0 && got.playing === 1;
    log.push(`écoute ${what} : ${JSON.stringify(got)} → ${ok ? 'OK' : 'ÉCHEC'}`);
    if (!ok) problems.push(`écoute ${what}`);
  }
  const gotg = () => tables.find((t) => t.file.includes(FOLDER));

  library.openSheet(gotg());
  act('Médias du jeu');

  // ---------- Musique : dossiers, écoute d'une musique ----------
  act('Musique');
  await shot('musique');
  act('Sons de la table');
  await shot('dossiers');
  const folders = view().actions.map((a) => a.label);
  if (folders.some((f) => /orig/i.test(f))) problems.push('copie de sauvegarde montrée');
  act('PuP-Pack gotg_2020 › Topper');
  cursorTo('Song-Groot.mp3');
  await shot('topper');
  await listening('Song-Groot.mp3');
  act('Song-Groot.mp3');
  await shot('musique-choisie');

  // ---------- Son de lancement : le son d'une vidéo ----------
  act('Retour aux médias');
  act('Son de lancement');
  act('Sons de la table');
  act('PuP-Pack gotg_2020 › DMDSplash');
  const splash = view().actions.map((a) => a.label);
  if (splash.includes('@vidIntro.mp4')) problems.push('vidéo muette proposée');
  cursorTo('@vidIntro2.mp4');
  await shot('dmdsplash');
  await listening('@vidIntro2.mp4 (vidéo)');
  act('@vidIntro2.mp4');
  await shot('lancement-choisi');
  act('Retour aux médias');
  await shot('medias-brouillon');

  // ---------- Enregistrement ----------
  act('Enregistrer');
  await shot('plan');
  act('Enregistrer');
  await shot('enregistre');

  // Le .m4a rangé : Chromium le lit-il comme un son ? (durée, octets décodés)
  const m4a = path.join(L.tables, FOLDER, 'medias', `(AudioLaunch) ${FOLDER}.m4a`);
  let decoded = null;
  if (fs.existsSync(m4a)) {
    decoded = await win.webContents.executeJavaScript(`new Promise((done) => { const a = new Audio(${JSON.stringify(core.mediaUrl(m4a))});
      a.onerror = () => done({ error: a.error && a.error.code }); a.play().catch(() => {});
      setTimeout(() => done({ duration: a.duration, time: a.currentTime, decoded: a.webkitAudioDecodedByteCount, error: a.error && a.error.code }), 1500); })`);
  }
  log.push(`m4a rangé relu : ${JSON.stringify(decoded)}`);
  if (!decoded || decoded.error || !(decoded.duration > 2 && decoded.duration < 3) || !(decoded.decoded > 0)) problems.push('m4a rangé illisible');

  ipcMain.removeListener('action', onAction);
  win.destroy();
  return { log, problems };
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  serveMedias(() => servedDirs());
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  const results = [];
  try {
    for (const sc of SCENARIOS) {
      const box = sandbox(sc.name);
      const { log, problems } = await scenario(sc, box, report);
      results.push(...log.map((l) => `${sc.name}/${l}`));
      const m = path.join(box.L.tables, FOLDER, 'medias');
      const files = fs.existsSync(m) ? fs.readdirSync(m).sort().map((f) => `${f} (${core.formatSize(fs.statSync(path.join(m, f)).size)})`) : [];
      results.push(`${sc.name} : medias = ${files.join(' | ') || 'rien'}`);
      const pack = path.join(box.L.tables, FOLDER, 'pupvideos', 'gotg_2020');
      const intact = REAL_FILES.every((rel) => fs.existsSync(path.join(pack, rel)));
      results.push(`${sc.name} : PuP-Pack intact = ${intact}`);
      if (!intact) problems.push('PuP-Pack modifié');
      if (!files.some((f) => f.startsWith(`(Audio) ${FOLDER}.mp3`)) || !files.some((f) => f.startsWith(`(AudioLaunch) ${FOLDER}.m4a`))) problems.push('médias non rangés');
      results.push(`${sc.name} : ${problems.length ? `PROBLÈMES : ${problems.join(', ')}` : 'aucun problème'}`);
      if (problems.length) process.exitCode = 1;
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
